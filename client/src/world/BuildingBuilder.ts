// Package B: Haussmann buildings from BuildingRecs (skips recs with .landmark, see Landmarks.ts).
// Module top level must not touch the DOM: the worker imports build*(); canvas textures only inside create*().
//
// Per building: ground g = min terrain over the outer ring, but at most groundSpan below its max (a footprint reaching
// into the carved Seine or over a DEM bump, e.g. the Louvre, is not buried); walls from min − baseSink to top = g + height.
// Haussmann (SPEC §4.4): shopfront band 0–4.5 m, window-grid walls, zinc mansard (top 4 m, inset ≈ 1.2 m) with dormers
// painted on the slope + chimneys, iron balconies on floors 2 and 5. Other kinds: plain stone walls, flat roof.
// Party walls (an edge shared with another building of the chunk): no shopfront, balcony or mansard slope, and only
// the part above the neighbour is built. UVs: u in bays (bayWidth), v in floors (wall), 0–1 over the band (shopfront),
// [0.25, 1] over the slope (roof; [0, 0.25) is plain zinc for caps), metres (balcony railing).
// ponytail: party walls are found only between buildings of the same chunk and by exact shared edges (not T-joints);
// a neighbour in another chunk gets a facade + mansard slope there. Upgrade: build-chunks marks shared edges globally.
import * as THREE from 'three';
import { type BuildingRec, ringArea, type XZ } from '../geo/chunkData.ts';
import { buildings as B } from '../config.ts';
import type { Builder, MaterialId } from './buildTypes.ts';
import { hash01, MeshBuffer, mergeBuckets, triangulate, type V3 } from './geom.ts';

const PLAIN_WALL_UV = [0, 0.55] as const; // pure stone pixel of the wall tile (pier centre, between joint lines)
const PLAIN_ROOF_UV = [0.5, 0.1] as const; // plain zinc band of the roof texture
const SLAB_UV = [0.5, 0.06] as const; // solid bottom rail of the balcony texture

/** height → levels × levelHeight → canopyHeight (building=roof) / smallHeight (kiosk-sized footprint) → defaultHeight. */
export function buildingHeight(b: BuildingRec): number {
  if (b.height && b.height > 0) return b.height;
  if (b.levels && b.levels > 0) return b.levels * B.levelHeight;
  if (b.kind === 'roof') return B.canopyHeight;
  return Math.abs(ringArea(b.outer)) < B.smallArea ? B.smallHeight : B.defaultHeight;
}

/** Closed ring (not repeated) without consecutive duplicate points. */
function clean(r: XZ): XZ {
  const out: XZ = [];
  for (let i = 0; i < r.length; i += 2) {
    const x = r[i]!;
    const z = r[i + 1]!;
    const n = out.length;
    if (!Number.isFinite(x) || !Number.isFinite(z)) continue;
    if (n && Math.abs(out[n - 2]! - x) < 0.05 && Math.abs(out[n - 1]! - z) < 0.05) continue;
    out.push(x, z);
  }
  while (out.length > 4 && Math.abs(out[0]! - out.at(-2)!) < 0.05 && Math.abs(out[1]! - out.at(-1)!) < 0.05) out.length -= 2;
  return out;
}

function reversed(r: XZ): XZ {
  const out: XZ = [];
  for (let i = r.length - 2; i >= 0; i -= 2) out.push(r[i]!, r[i + 1]!);
  return out;
}

/** Ring moved toward the solid side (left of travel: outer rings CCW, holes CW seen from above) by d[i] on edge
 *  i → i+1. Each vertex sits where its two offset edges meet, its move clamped to half its shorter edge. */
export function insetRing(r: XZ, d: number[]): XZ {
  const n = r.length / 2;
  const out: XZ = [];
  for (let i = 0; i < n; i++) {
    const p = (i + n - 1) % n;
    const q = (i + 1) % n;
    const x = r[2 * i]!;
    const z = r[2 * i + 1]!;
    const e0x = x - r[2 * p]!;
    const e0z = z - r[2 * p + 1]!;
    const e1x = r[2 * q]! - x;
    const e1z = r[2 * q + 1]! - z;
    const l0 = Math.hypot(e0x, e0z);
    const l1 = Math.hypot(e1x, e1z);
    const [n0x, n0z, n1x, n1z] = [e0z / l0, -e0x / l0, e1z / l1, -e1x / l1]; // left normals
    const d0 = d[p]!;
    const d1 = d[i]!;
    const det = n0x * n1z - n0z * n1x;
    let mx: number;
    let mz: number;
    if (Math.abs(det) > 1e-3) {
      mx = (d0 * n1z - d1 * n0z) / det;
      mz = (n0x * d1 - n1x * d0) / det;
    } else if (n0x * n1x + n0z * n1z > 0) {
      [mx, mz] = [n1x * (d0 + d1) * 0.5, n1z * (d0 + d1) * 0.5]; // straight on
    } else [mx, mz] = [0, 0]; // spike
    const m = Math.hypot(mx, mz);
    const max = 0.5 * Math.min(l0, l1);
    const s = m > max ? max / m : 1;
    out.push(x + mx * s, z + mz * s);
  }
  return out;
}

interface Prep {
  rings: XZ[]; // [outer (CCW), ...holes (CW)]
  g: number; // ground
  bottom: number;
  top: number;
  haussmann: boolean;
  windows: boolean; // Haussmann kind outside the height range: window-grid walls, flat roof
  tint: V3;
  roofTint: V3;
}

const edgeKey = (ax: number, az: number, bx: number, bz: number) => {
  const a = `${Math.round(ax * 10)},${Math.round(az * 10)}`;
  const b = `${Math.round(bx * 10)},${Math.round(bz * 10)}`;
  return a < b ? `${a}|${b}` : `${b}|${a}`;
};

function prepare(b: BuildingRec, height: (x: number, z: number) => number): Prep | undefined {
  let outer = clean(b.outer);
  if (outer.length < 6 || Math.abs(ringArea(outer)) < 1) return undefined;
  if (ringArea(outer) < 0) outer = reversed(outer);
  const holes = (b.holes ?? [])
    .map(clean)
    .filter((h) => h.length >= 6 && Math.abs(ringArea(h)) >= 1)
    .map((h) => (ringArea(h) > 0 ? reversed(h) : h));
  let gMin = Infinity;
  let gMax = -Infinity;
  for (let i = 0; i < outer.length; i += 2) {
    const y = height(outer[i]!, outer[i + 1]!);
    [gMin, gMax] = [Math.min(gMin, y), Math.max(gMax, y)];
  }
  if (!Number.isFinite(gMin) || !Number.isFinite(gMax)) return undefined;
  const g = Math.max(gMin, gMax - B.groundSpan);
  const h = buildingHeight(b);
  const minH = b.minHeight ?? (b.kind === 'roof' ? Math.max(0, h - B.canopyThickness) : 0);
  const top = g + h;
  const bottom = minH > 0 ? g + minH : gMin - B.baseSink;
  if (!(top > bottom + 0.1)) return undefined;
  const [x0, z0] = [outer[0]!, outer[1]!];
  const k = hash01(x0, z0, 1);
  const bright = 0.84 + 0.16 * hash01(x0, z0, 2);
  // warm cream ↔ neutral grey-white limestone
  const tint: V3 = [bright, bright * (0.97 - 0.05 * k), bright * (0.93 - 0.1 * k)];
  const rb = 0.8 + 0.25 * hash01(x0, z0, 3);
  const housing = B.haussmannKinds.includes(b.kind);
  return {
    rings: [outer, ...holes],
    g,
    bottom,
    top,
    haussmann: minH === 0 && housing && h >= B.haussmannHeight[0]! && h <= B.haussmannHeight[1]!,
    windows: housing && h > 5,
    tint,
    roofTint: [rb, rb, rb * 1.03],
  };
}

export const buildBuildings: Builder = (chunk, ctx) => {
  const wall = new MeshBuffer('wall');
  const shop = new MeshBuffer('shopfront');
  const roof = new MeshBuffer('roof');
  const balc = new MeshBuffer('balcony');
  const cv: number[] = [];
  const ci: number[] = [];

  const preps: Prep[] = [];
  let bad = 0;
  for (const b of chunk.buildings) {
    if (b.landmark) continue;
    try {
      const p = prepare(b, ctx.height);
      if (p) preps.push(p);
      else bad++;
    } catch {
      bad++;
    }
  }

  // Party walls: every edge → buildings standing on the ground that own it.
  const owners = new Map<string, { id: number; top: number }[]>();
  preps.forEach((p, id) => {
    if (p.bottom > p.g) return;
    for (const r of p.rings) {
      for (let i = 0, n = r.length; i < n; i += 2) {
        const k = edgeKey(r[i]!, r[i + 1]!, r[(i + 2) % n]!, r[(i + 3) % n]!);
        const list = owners.get(k);
        if (list) list.push({ id, top: p.top });
        else owners.set(k, [{ id, top: p.top }]);
      }
    }
  });

  preps.forEach((p, id) => {
    try {
      emit(p, id);
    } catch {
      bad++;
    }
  });
  if (bad) console.warn(`BuildingBuilder ${ctx.key}: skipped ${bad} degenerate building(s)`);

  function emit(p: Prep, id: number) {
    const { g, bottom, top, haussmann } = p;
    const wallTop = haussmann ? top - B.mansardHeight : top;
    const shopTop = g + B.shopfrontHeight;
    wall.color = shop.color = p.tint;
    roof.color = p.roofTint;
    const insets: XZ[] = [];
    const shopShift = Math.floor(hash01(p.rings[0]![0]!, p.rings[0]![1]!, 4) * 4);

    p.rings.forEach((r, ri) => {
      const n = r.length / 2;
      const d: number[] = [];
      const hidden: number[] = []; // top of the tallest neighbour sharing the edge, −∞ if none
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const list = owners.get(edgeKey(r[2 * i]!, r[2 * i + 1]!, r[2 * j]!, r[2 * j + 1]!)) ?? [];
        hidden.push(list.reduce((m, o) => (o.id === id ? m : Math.max(m, o.top)), -Infinity));
        d.push(haussmann && hidden[i] === -Infinity ? B.mansardInset : 0);
      }
      const q = haussmann ? insetRing(r, d) : r;
      insets.push(q);

      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const [ax, az, bx, bz] = [r[2 * i]!, r[2 * i + 1]!, r[2 * j]!, r[2 * j + 1]!];
        const len = Math.hypot(bx - ax, bz - az);
        const bays = Math.max(1, Math.round(len / B.bayWidth));
        // collider: full prism
        const c = cv.length / 3;
        cv.push(ax, bottom, az, bx, bottom, bz, bx, top, bz, ax, top, az);
        ci.push(c, c + 1, c + 2, c, c + 2, c + 3);

        const wallQuad = (buf: MeshBuffer, y0: number, y1: number, u0: number, v0: number, u1: number, v1: number) =>
          buf.quad([ax, y0, az], [bx, y0, bz], [bx, y1, bz], [ax, y1, az], u0, v0, u1, v1);

        const floorsV = (y: number) => (y - shopTop) / B.levelHeight;
        if (hidden[i] !== -Infinity || !haussmann) {
          // party wall above the neighbour or a plain building: blank stone; other housing: windows, no mansard
          const y0 = Math.max(bottom, hidden[i]!);
          if (top <= y0 + 0.05) continue;
          if (p.windows && hidden[i] === -Infinity) wallQuad(wall, y0, top, 0, (y0 - g) / B.levelHeight, bays, (top - g) / B.levelHeight);
          else wallQuad(wall, y0, top, PLAIN_WALL_UV[0], PLAIN_WALL_UV[1], PLAIN_WALL_UV[0], PLAIN_WALL_UV[1]);
          continue;
        }
        if (ri === 0) {
          wallQuad(shop, bottom, shopTop, shopShift, (bottom - g) / B.shopfrontHeight, shopShift + bays, 1);
          wallQuad(wall, shopTop, wallTop, 0, 0, bays, floorsV(wallTop));
        } else wallQuad(wall, bottom, wallTop, 0, floorsV(bottom), bays, floorsV(wallTop));
        // mansard slope
        roof.quad([ax, wallTop, az], [bx, wallTop, bz], [q[2 * j]!, top, q[2 * j + 1]!], [q[2 * i]!, top, q[2 * i + 1]!], 0, 0.25, bays, 1);

        if (ri === 0 && len >= B.balconyMinEdge) {
          const ox = ((bz - az) / len) * -B.balconyDepth; // right of travel = outside
          const oz = ((ax - bx) / len) * -B.balconyDepth;
          // the upper balcony drops to the last floor whose railing fits under the mansard (20 m default: floor 4)
          const fTop = Math.floor((wallTop - B.railingHeight - shopTop) / B.levelHeight) + 1;
          for (const f of new Set(B.balconyFloors.map((f) => Math.min(f, fTop)))) {
            if (f < B.balconyFloors[0]!) continue;
            const y = shopTop + (f - 1) * B.levelHeight;
            const [s, t] = SLAB_UV;
            balc.quad([ax, y, az], [ax + ox, y, az + oz], [bx + ox, y, bz + oz], [bx, y, bz], s, t, s, t);
            const y1 = y + B.railingHeight;
            balc.quad([ax + ox, y, az + oz], [bx + ox, y, bz + oz], [bx + ox, y1, bz + oz], [ax + ox, y1, az + oz], 0, 0, len, 1);
          }
        }
      }

      if (haussmann && ri === 0) chimneys(r, q, top);
    });

    // cap (inset ring for the mansard, footprint otherwise) + underside for raised structures
    const ringIdx = triangulate(p.rings[0]!, p.rings.slice(1));
    const insetIdx = haussmann ? triangulate(insets[0]!, insets.slice(1)) : [];
    const [capRings, capIdx] = insetIdx.length ? [insets, insetIdx] : [p.rings, ringIdx];
    const flatFace = (rings: XZ[], idx: number[], y: number, ny: number) => {
      const pts = rings.flat();
      const b0 = roof.vertexCount;
      for (let i = 0; i < pts.length; i += 2) roof.vertex(pts[i]!, y, pts[i + 1]!, 0, ny, 0, PLAIN_ROOF_UV[0], PLAIN_ROOF_UV[1]);
      for (let i = 0; i < idx.length; i += 3) {
        if (ny > 0) roof.face(b0 + idx[i]!, b0 + idx[i + 1]!, b0 + idx[i + 2]!);
        else roof.face(b0 + idx[i]!, b0 + idx[i + 2]!, b0 + idx[i + 1]!);
      }
    };
    flatFace(capRings, capIdx, top, 1);
    if (bottom > g) flatFace(p.rings, ringIdx, bottom, -1);
    // collider cap
    const flat = p.rings.flat();
    const c0 = cv.length / 3;
    for (let i = 0; i < flat.length; i += 2) cv.push(flat[i]!, top, flat[i + 1]!);
    for (const k of ringIdx) ci.push(c0 + k);
  }

  function chimneys(r: XZ, q: XZ, top: number) {
    const [along, across, up] = B.chimneySize as [number, number, number];
    const saved = wall.color;
    wall.color = [0.78, 0.6, 0.5];
    let count = 0;
    for (let i = 0, n = r.length / 2; i < n && count < 4; i++) {
      const mx = q[2 * i]! - r[2 * i]!;
      const mz = q[2 * i + 1]! - r[2 * i + 1]!;
      const m = Math.hypot(mx, mz);
      if (m < 0.3 || hash01(q[2 * i]!, q[2 * i + 1]!, 7) >= B.chimneyChance) continue;
      const j = (i + 1) % n;
      let tx = q[2 * j]! - q[2 * i]!;
      let tz = q[2 * j + 1]! - q[2 * i + 1]!;
      const tl = Math.hypot(tx, tz);
      if (tl < along * 2) continue;
      [tx, tz] = [tx / tl, tz / tl];
      const [nx, nz] = [tz, -tx]; // left = inward
      const cx = q[2 * i]! + tx * along + nx * across;
      const cz = q[2 * i + 1]! + tz * along + nz * across;
      const corner = (s: number, k: number, y: number): V3 => [
        cx + tx * s * along * 0.5 + nx * k * across * 0.5,
        y,
        cz + tz * s * along * 0.5 + nz * k * across * 0.5,
      ];
      const [u, v] = PLAIN_WALL_UV;
      const y0 = top - 0.3;
      const y1 = top + up;
      // sides, counter-clockwise seen from above: (−,+) → (−,−) → (+,−) → (+,+)
      const ring: [number, number][] = [[-1, 1], [-1, -1], [1, -1], [1, 1]];
      for (let s = 0; s < 4; s++) {
        const [a, b] = [ring[s]!, ring[(s + 1) % 4]!];
        wall.quad(corner(a[0], a[1], y0), corner(b[0], b[1], y0), corner(b[0], b[1], y1), corner(a[0], a[1], y1), u, v, u, v);
      }
      wall.quad(corner(-1, 1, y1), corner(-1, -1, y1), corner(1, -1, y1), corner(1, 1, y1), u, v, u, v);
      count++;
    }
    wall.color = saved;
  }

  return {
    meshes: mergeBuckets([wall.bucket(), shop.bucket(), roof.bucket(), balc.bucket()]),
    instances: [],
    colliders: ci.length ? [{ vertices: new Float32Array(cv), indices: new Uint32Array(ci) }] : [],
  };
};

// ── Materials (main thread only) ──

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function texture(c: HTMLCanvasElement, clampV: boolean, repeat: [number, number] = [1, 1]) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = clampV ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  t.repeat.set(...repeat);
  t.anisotropy = 8;
  return t;
}

/** Deterministic PRNG for the textures (same look every load). */
function rng(seed: number) {
  return () => ((seed = (Math.imul(seed ^ (seed >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) | 0) >>> 0) / 4294967296;
}

function speckle(ctx: CanvasRenderingContext2D, w: number, h: number, n: number, rand: () => number) {
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = rand() < 0.5 ? 'rgba(0,0,0,0.035)' : 'rgba(255,255,255,0.05)';
    ctx.fillRect(rand() * w, rand() * h, 2 + rand() * 10, 1 + rand() * 4);
  }
}

function glass(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, rand: () => number) {
  const gr = ctx.createLinearGradient(x, y, x + w * 0.6, y + h);
  const l = 40 + rand() * 30;
  gr.addColorStop(0, `rgb(${l + 60},${l + 75},${l + 90})`);
  gr.addColorStop(0.45, `rgb(${l},${l + 10},${l + 22})`);
  gr.addColorStop(1, `rgb(${l * 0.6},${l * 0.65},${l * 0.75})`);
  ctx.fillStyle = gr;
  ctx.fillRect(x, y, w, h);
}

/** 2 bays × 2 floors, 256 px per cell; floor level at the bottom of each cell. */
function wallCanvas(stone: string) {
  const S = 256;
  const [c, ctx] = canvas(2 * S, 2 * S);
  const rand = rng(11);
  ctx.fillStyle = stone;
  ctx.fillRect(0, 0, 2 * S, 2 * S);
  speckle(ctx, 2 * S, 2 * S, 900, rand);
  for (let row = 0; row < 2; row++) {
    const y0 = row * S;
    // stone joints (kept off v = 0.55, the plain-wall sample) and the floor band with its shadow line
    ctx.fillStyle = 'rgba(90,70,40,0.10)';
    for (const f of [0.18, 0.36, 0.72, 0.9]) ctx.fillRect(0, y0 + S * (1 - f), 2 * S, 1.5);
    ctx.fillStyle = 'rgba(255,250,235,0.35)';
    ctx.fillRect(0, y0, 2 * S, S * 0.05);
    ctx.fillStyle = 'rgba(60,45,25,0.28)';
    ctx.fillRect(0, y0 + S * 0.05, 2 * S, 3);
    for (let col = 0; col < 2; col++) {
      const x0 = col * S;
      const [wx, ww] = [x0 + S * 0.27, S * 0.46];
      const [wy, wh] = [y0 + S * 0.2, S * 0.7]; // window: v 0.1–0.8
      // surround + keystone
      ctx.fillStyle = 'rgba(255,248,230,0.45)';
      ctx.fillRect(wx - 9, wy - 9, ww + 18, wh + 12);
      ctx.fillRect(wx + ww / 2 - 10, wy - 22, 20, 14);
      ctx.fillStyle = 'rgba(70,55,35,0.35)';
      ctx.fillRect(wx - 9, wy + wh + 3, ww + 18, 3);
      // folding shutters (persiennes) on some windows
      if (rand() < 0.4) {
        ctx.fillStyle = '#b9b7ad';
        ctx.fillRect(wx - 26, wy, 17, wh);
        ctx.fillRect(wx + ww + 9, wy, 17, wh);
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        for (let k = wy; k < wy + wh; k += 5) {
          ctx.fillRect(wx - 26, k, 17, 1);
          ctx.fillRect(wx + ww + 9, k, 17, 1);
        }
      }
      glass(ctx, wx, wy, ww, wh, rand);
      if (rand() < 0.5) {
        ctx.fillStyle = 'rgba(235,225,200,0.55)'; // net curtain
        ctx.fillRect(wx + 3, wy + 3, ww - 6, wh * (0.3 + rand() * 0.4));
      }
      // frame: mullion + transoms
      ctx.fillStyle = '#f1ede4';
      ctx.fillRect(wx, wy, ww, 4);
      ctx.fillRect(wx, wy, 4, wh);
      ctx.fillRect(wx + ww - 4, wy, 4, wh);
      ctx.fillRect(wx + ww / 2 - 2, wy, 4, wh);
      ctx.fillRect(wx, wy + wh * 0.28, ww, 3);
      ctx.fillRect(wx, wy + wh * 0.62, ww, 3);
      // wrought-iron guard rail across the lower window
      ctx.fillStyle = '#26292c';
      const ry = wy + wh * 0.66;
      ctx.fillRect(wx - 4, ry, ww + 8, 4);
      for (let k = wx; k < wx + ww; k += 7) ctx.fillRect(k, ry, 2, wh * 0.34);
      ctx.fillRect(wx - 4, wy + wh - 4, ww + 8, 4);
    }
  }
  return c;
}

/** 4 bays of shopfront, full band height (4.5 m); ground at the bottom. */
function shopCanvas(stone: string) {
  const W = 256;
  const H = 384;
  const [c, ctx] = canvas(4 * W, H);
  const rand = rng(23);
  ctx.fillStyle = stone;
  ctx.fillRect(0, 0, 4 * W, H);
  speckle(ctx, 4 * W, H, 500, rand);
  // rusticated joints (bossage) on the ground floor
  ctx.fillStyle = 'rgba(80,60,35,0.22)';
  for (let y = 20; y < H; y += 32) ctx.fillRect(0, y, 4 * W, 2);
  const paint = ['#1f4a38', '#6e1c22', '#1c2a48', '#262626'];
  const awning = ['#7a1f24', '#1f4a38', null, '#8a6a2a'];
  for (let k = 0; k < 4; k++) {
    const x0 = k * W;
    const [fx, fw] = [x0 + W * 0.1, W * 0.8];
    const top = H * 0.16; // fascia top (v ≈ 0.84)
    ctx.fillStyle = paint[k]!;
    ctx.fillRect(fx, top, fw, H * 0.8 - top);
    ctx.fillStyle = 'rgba(240,225,180,0.85)'; // sign lettering blocks
    for (let x = fx + 16; x < fx + fw - 24; x += 22) ctx.fillRect(x, top + 12, 14, 18);
    glass(ctx, fx + 10, H * 0.3, fw - 20, H * 0.48, rand);
    ctx.fillStyle = paint[k]!;
    ctx.fillRect(fx + fw * 0.62, H * 0.3, 5, H * 0.48); // door post
    ctx.fillStyle = 'rgba(255,230,170,0.25)'; // warm interior
    ctx.fillRect(fx + 14, H * 0.55, fw - 28, H * 0.2);
    const a = awning[k];
    if (a) {
      for (let x = fx - 6; x < fx + fw + 6; x += 16) {
        ctx.fillStyle = (x - fx) % 32 < 16 ? a : '#e9e2d0';
        ctx.fillRect(x, H * 0.24, 16, H * 0.1);
      }
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(fx - 6, H * 0.34, fw + 12, 6);
    }
    ctx.fillStyle = 'rgba(60,45,25,0.45)'; // plinth
    ctx.fillRect(x0, H * 0.94, W, H * 0.06);
  }
  ctx.fillStyle = 'rgba(60,45,25,0.4)'; // cornice shadow over the band
  ctx.fillRect(0, 0, 4 * W, 6);
  return c;
}

/** 1 bay: v 0.25–1 = mansard slope with a dormer, v 0–0.25 = plain zinc (caps). */
function roofCanvas(zinc: string, stone: string) {
  const S = 256;
  const [c, ctx] = canvas(S, S);
  const rand = rng(5);
  ctx.fillStyle = zinc;
  ctx.fillRect(0, 0, S, S);
  speckle(ctx, S, S, 250, rand);
  ctx.fillStyle = 'rgba(255,255,255,0.12)'; // standing seams
  for (let x = 8; x < S; x += 32) ctx.fillRect(x, 0, 2, S * 0.75);
  // dormer (lucarne): stone frame, dark window, zinc hood
  const [dx, dw, dy, dh] = [S * 0.3, S * 0.4, S * 0.18, S * 0.46];
  ctx.fillStyle = stone;
  ctx.fillRect(dx, dy, dw, dh);
  glass(ctx, dx + 12, dy + 14, dw - 24, dh - 22, rand);
  ctx.fillStyle = '#f1ede4';
  ctx.fillRect(dx + dw / 2 - 2, dy + 14, 4, dh - 22);
  ctx.fillStyle = '#4f5a62';
  ctx.beginPath();
  ctx.moveTo(dx - 8, dy + 4);
  ctx.lineTo(dx + dw / 2, dy - 22);
  ctx.lineTo(dx + dw + 8, dy + 4);
  ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; // gutter line at the slope foot
  ctx.fillRect(0, S * 0.72, S, 5);
  return c;
}

/** Wrought-iron railing, 1 m × 1 m tile, transparent between bars; bottom rows solid (balcony slab). */
function railingCanvas(iron: string) {
  const [c, ctx] = canvas(128, 128);
  ctx.fillStyle = iron;
  ctx.fillRect(0, 0, 128, 8); // handrail
  ctx.fillRect(0, 112, 128, 16); // base rail + slab
  for (let x = 2; x < 128; x += 11) ctx.fillRect(x, 8, 3, 104);
  ctx.strokeStyle = iron;
  ctx.lineWidth = 3;
  for (let x = 0; x <= 128; x += 64) {
    ctx.beginPath();
    ctx.arc(x + 32, 60, 18, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillRect(0, 26, 128, 3);
  return c;
}

export function createBuildingMaterials(): Partial<Record<MaterialId, THREE.Material>> {
  const { limestone, zinc, iron } = B.colours;
  return {
    wall: new THREE.MeshStandardMaterial({ map: texture(wallCanvas(limestone), false, [0.5, 0.5]), vertexColors: true, roughness: 0.9 }),
    shopfront: new THREE.MeshStandardMaterial({ map: texture(shopCanvas(limestone), true, [0.25, 1]), vertexColors: true, roughness: 0.75 }),
    roof: new THREE.MeshStandardMaterial({ map: texture(roofCanvas(zinc, limestone), true), vertexColors: true, roughness: 0.6 }),
    balcony: new THREE.MeshStandardMaterial({
      map: texture(railingCanvas(iron), true),
      alphaTest: 0.5,
      side: THREE.DoubleSide,
      roughness: 0.5,
    }),
  };
}
