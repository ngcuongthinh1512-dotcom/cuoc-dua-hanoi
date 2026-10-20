// Package B: buildings from BuildingRecs (skips recs with .landmark, see world/landmarks/index.ts).
// Module top level must not touch the DOM: the worker imports build*(); canvas textures only inside create*().
//
// Per building: ground g = min terrain over the outer ring, but at most groundSpan below its max (a footprint reaching
// into the carved Seine or over a DEM bump, e.g. the Louvre, is not buried); walls from min − baseSink to top = g + height.
// Leg 2 Macao (config buildings.macao, picked per building by hash01): colonial pastel low-rise ('wall': white trim, arched /
// corniced windows, optional low terracotta hip roof), Chinese tenements and concrete-grid towers ('tenement': small
// windows, steel cages, AC units), glass towers ('curtain', flat roof + plant box); a shop band 0–4.5 m ('shopfront') on
// street faces. Haussmann (Leg 1, buildings.haussmannHeight; off in Macao): same band, zinc mansard (top 4 m, inset ≈ 1.2 m)
// + chimneys, iron balconies on floors 2 and 5.
// Night windows: every vertex of the wall / tenement / curtain / shopfront buckets carries `lit` (MeshBucket.lit, shader
// attribute 'lit'): 0 = dark building, else lit with that value as its seed (≈ buildings.macao.litShare of them); window
// glass = facade map alpha ≤ 0.5 (see A_TRIM); shopfront: always a seed (night.ts facadeNightGlsl: shops open / closed).
// By day nothing reads it.
// Party walls (an edge shared with another building of the chunk): no shopfront, balcony or roof slope, and only
// the part above the neighbour is built. UVs: u in bays (bayWidth), v in floors (facades), 0–1 over the band (shopfront),
// [0.25, 1] over the slope (canvas roof; [0, 0.25) is plain zinc for caps; world metres with graphics8c.roofs), metres (balcony).
// ponytail: party walls are found only between buildings of the same chunk and by exact shared edges (not T-joints);
// a neighbour in another chunk gets a facade + mansard slope there. Upgrade: build-chunks marks shared edges globally.
import * as THREE from 'three';
import { type BuildingRec, ringArea, type XZ } from '../geo/chunkData.ts';
import { buildings as B, graphics8c } from '../config.ts';
import { pbrMaps } from './textures.ts';
import { facadeNightGlsl } from './night.ts';
import type { Builder, MaterialId } from './buildTypes.ts';
import { hash01, MeshBuffer, mergeBuckets, triangulate, type V3 } from './geom.ts';

const PLAIN_WALL_UV = [0, 0.55] as const; // pure stone pixel of the wall tile (pier centre, between joint lines)
// Phase 8C T3: with graphics8c.roofs.enabled the roof uv is WORLD METRES (slope: along the edge × up the slope, caps: x, z;
// material.map.repeat = 1 / tile) for the roof_slates_03 slates, instead of the canvas bay layout below (dormers dropped).
const ROOF_PBR = graphics8c.roofs.enabled;
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

type Face = 'wall' | 'tenement' | 'curtain';

interface Prep {
  rings: XZ[]; // [outer (CCW), ...holes (CW)]
  g: number; // ground
  bottom: number;
  top: number;
  haussmann: boolean;
  face: Face; // facade bucket: wall = colonial (or Haussmann), tenement = tenement / concrete-grid tower, curtain = glass tower
  windows: boolean; // window-grid walls (else plain wall everywhere)
  shop: boolean; // ground-floor shop band on street faces
  slope?: readonly [number, number]; // roof slope: rise above the wall top, inset (Haussmann mansard, colonial hip roof)
  plant: boolean; // tower: a plant box on the flat roof
  tint: V3;
  roofTint: V3;
  lit: number; // MeshBucket.lit
}

const edgeKey = (ax: number, az: number, bx: number, bz: number) => {
  const a = `${Math.round(ax * 10)},${Math.round(az * 10)}`;
  const b = `${Math.round(bx * 10)},${Math.round(bz * 10)}`;
  return a < b ? `${a}|${b}` : `${b}|${a}`;
};

/** '#rrggbb' (sRGB) → linear RGB × k. */
function linear(hex: string, k = 1): V3 {
  const c = (i: number) => {
    const v = parseInt(hex.slice(1 + 2 * i, 3 + 2 * i), 16) / 255;
    return k * (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  };
  return [c(0), c(1), c(2)];
}

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
  const r = (salt: number) => hash01(x0, z0, salt);
  const pick = (list: string[], k = 1) => linear(list[Math.floor(r(9) * list.length)]!, k * (0.9 + 0.1 * r(2)));
  const rb = 0.8 + 0.25 * r(3);
  const M = B.macao;
  const lit = r(10) < M.litShare ? 0.01 + 0.99 * r(11) : 0;
  const housing = B.haussmannKinds.includes(b.kind);
  if (minH === 0 && housing && h >= B.haussmannHeight[0]! && h <= B.haussmannHeight[1]!) {
    const k = r(1);
    const bright = 0.84 + 0.16 * r(2);
    return {
      rings: [outer, ...holes], g, bottom, top, lit, haussmann: true, face: 'wall', windows: true, shop: true, plant: false,
      slope: [B.mansardHeight, B.mansardInset],
      tint: [bright, bright * (0.97 - 0.05 * k), bright * (0.93 - 0.1 * k)], // warm cream ↔ neutral grey-white limestone
      roofTint: ROOF_PBR ? [rb * 1.35, rb * 1.5, rb * 1.8] : [rb, rb, rb * 1.03], // slate diffuse is dark and warm: lift + cool it
    };
  }
  // Macao: colonial pastel low-rise, Chinese tenements, towers (config buildings.macao)
  const [t0, t1] = M.towerHeight as [number, number];
  const tower = h >= t1 || (h > t0 && r(5) < (h - t0) / (t1 - t0));
  const tenement = !tower && (h > t0 || (M.tenementKinds.includes(b.kind) && h >= M.tenementMin && r(6) < M.tenementShare));
  const curtain = tower && r(7) < M.curtainShare;
  const area = Math.abs(ringArea(outer));
  const hip = !tower && !tenement && minH === 0 && h <= M.hip.maxHeight && area <= M.hip.maxArea && r(8) < M.hip.chance;
  const lift = (ROOF_PBR ? M.roofLift : 1) * rb;
  const windows = h > 5 && !M.blankKinds.includes(b.kind);
  return {
    rings: [outer, ...holes], g, bottom, top, lit, haussmann: false,
    face: curtain ? 'curtain' : tower || tenement ? 'tenement' : 'wall',
    windows,
    shop: windows && minH === 0 && h >= M.shopMinHeight,
    ...(hip && { slope: [M.hip.rise, M.hip.inset] as const }),
    plant: tower && minH === 0,
    tint: pick(curtain ? M.glass : tower ? M.concrete : tenement ? M.tenement : M.colonial),
    roofTint: linear(hip ? M.tileRoof : M.flatRoof, lift),
  };
}

export const buildBuildings: Builder = (chunk, ctx) => {
  const faces: Record<Face, MeshBuffer> = { wall: new MeshBuffer('wall', true), tenement: new MeshBuffer('tenement', true), curtain: new MeshBuffer('curtain', true) };
  const wall = faces.wall;
  const shop = new MeshBuffer('shopfront', true);
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
    const { g, bottom, top, haussmann, slope } = p;
    const face = faces[p.face];
    const wallTop = slope ? top - slope[0] : top;
    const shopTop = g + B.shopfrontHeight;
    const shopOn = p.shop && wallTop > shopTop + 1; // the band needs at least a strip of facade above it
    const base = shopOn ? shopTop : g; // facade v = floors above this
    face.color = shop.color = p.tint;
    face.lit = p.lit;
    shop.lit = p.lit || 0.01 + 0.99 * hash01(p.rings[0]![0]!, p.rings[0]![1]!, 5); // shops: always a seed (night open / closed)
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
        d.push(slope && hidden[i] === -Infinity ? slope[1] : 0);
      }
      const q = slope ? insetRing(r, d) : r;
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

        if (hidden[i] !== -Infinity || !p.windows) {
          // party wall above the neighbour or a windowless building: blank wall up to the top (no roof slope on this edge)
          const y0 = Math.max(bottom, hidden[i]!);
          if (top <= y0 + 0.05) continue;
          wallQuad(face, y0, top, PLAIN_WALL_UV[0], PLAIN_WALL_UV[1], PLAIN_WALL_UV[0], PLAIN_WALL_UV[1]);
          continue;
        }
        const floorsV = (y: number) => (y - base) / B.levelHeight;
        if (shopOn && ri === 0 && bottom < shopTop) {
          wallQuad(shop, bottom, shopTop, shopShift, (bottom - g) / B.shopfrontHeight, shopShift + bays, 1);
          wallQuad(face, shopTop, wallTop, 0, 0, bays, floorsV(wallTop));
        } else wallQuad(face, bottom, wallTop, 0, floorsV(bottom), bays, floorsV(wallTop));
        if (slope) {
          roof.quad([ax, wallTop, az], [bx, wallTop, bz], [q[2 * j]!, top, q[2 * j + 1]!], [q[2 * i]!, top, q[2 * i + 1]!], 0, ROOF_PBR ? 0 : 0.25, ROOF_PBR ? len : bays, ROOF_PBR ? Math.hypot(top - wallTop, slope[1]) : 1);
        }

        if (haussmann && ri === 0 && len >= B.balconyMinEdge) {
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

    // cap (inset ring under a roof slope, footprint otherwise) + underside for raised structures
    const ringIdx = triangulate(p.rings[0]!, p.rings.slice(1));
    const insetIdx = slope ? triangulate(insets[0]!, insets.slice(1)) : [];
    const [capRings, capIdx] = insetIdx.length ? [insets, insetIdx] : [p.rings, ringIdx];
    const flatFace = (rings: XZ[], idx: number[], y: number, ny: number) => {
      const pts = rings.flat();
      const b0 = roof.vertexCount;
      for (let i = 0; i < pts.length; i += 2) roof.vertex(pts[i]!, y, pts[i + 1]!, 0, ny, 0, ROOF_PBR ? pts[i]! : PLAIN_ROOF_UV[0], ROOF_PBR ? pts[i + 1]! : PLAIN_ROOF_UV[1]);
      for (let i = 0; i < idx.length; i += 3) {
        if (ny > 0) roof.face(b0 + idx[i]!, b0 + idx[i + 1]!, b0 + idx[i + 2]!);
        else roof.face(b0 + idx[i]!, b0 + idx[i + 2]!, b0 + idx[i + 1]!);
      }
    };
    flatFace(capRings, capIdx, top, 1);
    if (bottom > g) flatFace(p.rings, ringIdx, bottom, -1);
    if (p.plant) plantBox(p.rings.flat(), ringIdx, top);
    // collider cap
    const flat = p.rings.flat();
    const c0 = cv.length / 3;
    for (let i = 0; i < flat.length; i += 2) cv.push(flat[i]!, top, flat[i + 1]!);
    for (const k of ringIdx) ci.push(c0 + k);
  }

  /** Box (roof bucket, darker) centred on the largest roof triangle's centroid; skipped when it would not fit that triangle. */
  function plantBox(pts: number[], idx: number[], top: number) {
    let best = 0;
    let at = -1;
    for (let i = 0; i < idx.length; i += 3) {
      const [a, b, c] = [idx[i]! * 2, idx[i + 1]! * 2, idx[i + 2]! * 2];
      const area = Math.abs((pts[b]! - pts[a]!) * (pts[c + 1]! - pts[a + 1]!) - (pts[c]! - pts[a]!) * (pts[b + 1]! - pts[a + 1]!)) / 2;
      if (area > best) [best, at] = [area, i];
    }
    const [min, up, share, max] = B.macao.plantBox as [number, number, number, number];
    const s = Math.min(max, Math.max(min, share * Math.sqrt(best)));
    if (at < 0 || s > 0.45 * Math.sqrt(best)) return;
    const [a, b, c] = [idx[at]! * 2, idx[at + 1]! * 2, idx[at + 2]! * 2];
    const cx = (pts[a]! + pts[b]! + pts[c]!) / 3;
    const cz = (pts[a + 1]! + pts[b + 1]! + pts[c + 1]!) / 3;
    const saved = roof.color;
    roof.color = [saved[0] * 0.75, saved[1] * 0.75, saved[2] * 0.75];
    const h = s / 2;
    const P = (sx: number, sz: number, y: number): V3 => [cx + sx * h, y, cz + sz * h];
    const ring: [number, number][] = [[-1, 1], [1, 1], [1, -1], [-1, -1]]; // counter-clockwise seen from above
    for (let k = 0; k < 4; k++) {
      const [e, f] = [ring[k]!, ring[(k + 1) % 4]!];
      roof.quad(P(e[0], e[1], top), P(f[0], f[1], top), P(f[0], f[1], top + up), P(e[0], e[1], top + up), 0, 0, s, up);
    }
    roof.quad(P(-1, 1, top + up), P(1, 1, top + up), P(1, -1, top + up), P(-1, -1, top + up), 0, 0, s, s);
    roof.color = saved;
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
    meshes: mergeBuckets([wall.bucket(), faces.tenement.bucket(), faces.curtain.bucket(), shop.bucket(), roof.bucket(), balc.bucket()]),
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

// Facade alpha convention (wall, tenement, curtain, shopfront canvases): a ≥ 0.9 = wall (× the vertex tint on masked
// materials), 0.5–0.9 = trim / frames / signs / AC units (never tinted), ≤ 0.5 = window glass (the night-lighting window mask).
// The shaders force the output alpha to 1. `paint` replaces the pixels of a shape (colour AND alpha), so layers don't add up.
const A_TRIM = 0.65;
const A_GLASS = 0.4;

function paint(ctx: CanvasRenderingContext2D, style: string | CanvasGradient, alpha: number, shape: (c: CanvasRenderingContext2D) => void) {
  ctx.beginPath();
  shape(ctx);
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = '#000';
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = alpha;
  ctx.fillStyle = style;
  ctx.fill();
  ctx.globalAlpha = 1;
}
const rect = (x: number, y: number, w: number, h: number) => (c: CanvasRenderingContext2D) => c.rect(x, y, w, h);

/** Window glass (alpha A_GLASS): sky reflection at the top fading to a dark interior; `hue` = [r, g, b] offsets. */
function glass(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, rand: () => number, hue: V3 = [0, 10, 22], shape = rect(x, y, w, h)) {
  const gr = ctx.createLinearGradient(x, y, x + w * 0.6, y + h);
  const l = 40 + rand() * 30;
  gr.addColorStop(0, `rgb(${l + 60 + hue[0]},${l + 65 + hue[1]},${l + 68 + hue[2]})`);
  gr.addColorStop(0.45, `rgb(${l + hue[0]},${l + hue[1]},${l + hue[2]})`);
  gr.addColorStop(1, `rgb(${l * 0.6},${l * 0.65},${l * 0.75})`);
  paint(ctx, gr, A_GLASS, shape);
}

/** Belgian townhouse brick, 2 bays × 2 floors, 256 px per cell, floor level at the bottom of each cell: brick courses (the
 *  colour comes from the masked vertex tint), a pale stone string course per floor, tall windows in stone surrounds with a
 *  sill and a head (lower floor: round-arched with voussoirs and keystone, upper floor: flat lintel), white painted
 *  casements with a transom and a central mullion. */
function colonialCanvas() {
  const S = 256;
  const [c, ctx] = canvas(2 * S, 2 * S);
  const rand = rng(11);
  ctx.fillStyle = '#f2efe9';
  ctx.fillRect(0, 0, 2 * S, 2 * S);
  speckle(ctx, 2 * S, 2 * S, 1400, rand);
  ctx.fillStyle = 'rgba(70,45,35,0.16)'; // brick courses: a mortar line every 9 px, joints staggered on alternate courses
  for (let y = 4; y < 2 * S; y += 9) {
    ctx.fillRect(0, y, 2 * S, 2);
    for (let x = ((y / 9) % 2) * 9; x < 2 * S; x += 18) ctx.fillRect(x, y, 2, 9);
  }
  const stone = '#ece6d6';
  const frame = '#f6f3ec';
  for (let row = 0; row < 2; row++) {
    const y0 = row * S;
    const arched = row === 0;
    paint(ctx, stone, A_TRIM, rect(0, y0 + S * 0.92, 2 * S, S * 0.08)); // stone string course (floor line)
    ctx.fillStyle = 'rgba(70,55,40,0.25)';
    ctx.fillRect(0, y0 + S * 0.92 - 3, 2 * S, 3);
    for (let col = 0; col < 2; col++) {
      const x0 = col * S;
      const [wx, ww] = [x0 + S * 0.3, S * 0.4];
      const [wy, wh] = [y0 + S * 0.12, S * 0.68];
      const r = ww / 2;
      const arch = (x: number, y: number, w: number, h: number) => (k: CanvasRenderingContext2D) => {
        k.moveTo(x, y + h);
        k.lineTo(x, y + w / 2);
        k.arc(x + w / 2, y + w / 2, w / 2, Math.PI, 0);
        k.lineTo(x + w, y + h);
        k.closePath();
      };
      const shape = (x: number, y: number, w: number, h: number) => (arched ? arch(x, y, w, h) : rect(x, y, w, h));
      paint(ctx, stone, A_TRIM, shape(wx - 11, wy - 11, ww + 22, wh + 11)); // stone surround
      paint(ctx, stone, A_TRIM, rect(wx - 18, wy + wh, ww + 36, 10)); // sill
      if (arched) paint(ctx, stone, A_TRIM, rect(wx + r - 10, wy - 24, 20, 22)); // keystone
      else paint(ctx, stone, A_TRIM, rect(wx - 20, wy - 22, ww + 40, 12)); // flat lintel
      ctx.fillStyle = 'rgba(70,55,40,0.3)';
      ctx.fillRect(wx - 18, wy + wh + 10, ww + 36, 3);
      glass(ctx, wx, wy, ww, wh, rand, [-6, 8, 4], shape(wx, wy, ww, wh));
      paint(ctx, frame, A_TRIM, rect(wx + r - 2, wy + (arched ? r : 0), 4, wh - (arched ? r : 0))); // central mullion
      paint(ctx, frame, A_TRIM, rect(wx, wy + (arched ? r : wh * 0.3), ww, 4)); // transom
      paint(ctx, frame, A_TRIM, rect(wx, wy + wh - 4, ww, 4));
    }
  }
  return c;
}

/** Chinese tenement / concrete grid, 2 bays × 2 floors (256 px cells): tiled concrete with rain streaks, slab line per floor,
 *  wide aluminium windows, some behind a protruding steel cage (gaiola), AC units under others. */
function tenementCanvas() {
  const S = 256;
  const [c, ctx] = canvas(2 * S, 2 * S);
  const rand = rng(31);
  ctx.fillStyle = '#dcd9d2';
  ctx.fillRect(0, 0, 2 * S, 2 * S);
  speckle(ctx, 2 * S, 2 * S, 1400, rand);
  ctx.fillStyle = 'rgba(0,0,0,0.035)'; // tile grid
  for (let k = 0; k < 2 * S; k += 16) ctx.fillRect(0, k, 2 * S, 1), ctx.fillRect(k, 0, 1, 2 * S);
  const kinds = [ // Leg 3: no steel cages / AC units (Macao); plain windows only
    ['plain', 'plain'],
    ['plain', 'plain'],
  ];
  for (let row = 0; row < 2; row++) {
    const y0 = row * S;
    ctx.fillStyle = 'rgba(60,55,50,0.16)'; // floor slab
    ctx.fillRect(0, y0 + S * 0.9, 2 * S, S * 0.1);
    for (let col = 0; col < 2; col++) {
      const x0 = col * S;
      const kind = kinds[row]![col]!;
      const [wx, ww] = [x0 + S * 0.18, S * 0.64];
      const [wy, wh] = [y0 + S * 0.26, S * 0.46];
      // rain streaks under the window (tinted wall)
      for (let k = 0; k < 6; k++) {
        ctx.fillStyle = `rgba(50,45,40,${0.04 + rand() * 0.06})`;
        ctx.fillRect(wx + rand() * ww, wy + wh, 2 + rand() * 6, S * (0.1 + rand() * 0.25));
      }
      paint(ctx, '#c9ccd0', A_TRIM, rect(wx - 6, wy - 6, ww + 12, wh + 12)); // aluminium frame
      glass(ctx, wx, wy, ww, wh, rand, [0, 8, 16]);
      paint(ctx, '#c9ccd0', A_TRIM, rect(wx + ww / 2 - 3, wy, 6, wh)); // sliding sashes
      if (rand() < 0.6) paint(ctx, rand() < 0.5 ? '#d9d2c0' : '#b9c7cf', A_GLASS, rect(wx + 6, wy + 6, ww * 0.3, wh - 12)); // curtain (still glass)
      if (kind === 'cage') {
        const iron = '#7d8487';
        paint(ctx, iron, A_TRIM, rect(wx - 14, wy - 16, ww + 28, 6));
        paint(ctx, iron, A_TRIM, rect(wx - 14, wy + wh + 6, ww + 28, 8));
        for (let x = wx - 14; x <= wx + ww + 14; x += 13) paint(ctx, iron, A_TRIM, rect(x, wy - 16, 3, wh + 30));
        paint(ctx, iron, A_TRIM, rect(wx - 14, wy + wh * 0.45, ww + 28, 3));
      }
      if (kind === 'ac') {
        const [ax, ay, aw, ah] = [wx + ww * 0.55, wy + wh + 16, S * 0.26, S * 0.15];
        paint(ctx, '#e8e8e4', A_TRIM, rect(ax, ay, aw, ah));
        for (let y = ay + 6; y < ay + ah - 4; y += 6) paint(ctx, '#a9aba8', A_TRIM, rect(ax + 6, y, aw * 0.55, 2));
        paint(ctx, '#8d8f8c', A_TRIM, (k) => k.arc(ax + aw * 0.8, ay + ah / 2, ah * 0.32, 0, Math.PI * 2));
        ctx.fillStyle = 'rgba(40,35,30,0.2)';
        ctx.fillRect(ax + 4, ay + ah, aw, 5);
      }
    }
  }
  return c;
}

/** Glass curtain wall, 2 bays × 2 floors (256 px cells): spandrel band at each floor, two vision panes per bay, light mullions.
 *  Everything × the vertex tint (unmasked material); the panes keep A_GLASS for the window mask. */
function curtainCanvas() {
  const S = 256;
  const [c, ctx] = canvas(2 * S, 2 * S);
  const rand = rng(41);
  ctx.fillStyle = '#d6dadd'; // mullions / transoms
  ctx.fillRect(0, 0, 2 * S, 2 * S);
  for (let row = 0; row < 2; row++) {
    const y0 = row * S;
    ctx.fillStyle = '#7d8790'; // spandrel (opaque glass in front of the slab)
    ctx.fillRect(0, y0 + S * 0.78, 2 * S, S * 0.2);
    for (let col = 0; col < 2; col++) {
      for (let k = 0; k < 2; k++) {
        const x = col * S + k * S * 0.5 + 5;
        const gr = ctx.createLinearGradient(x, y0, x + S * 0.3, y0 + S * 0.78);
        const l = 150 + rand() * 50;
        gr.addColorStop(0, `rgb(${l + 45},${l + 50},${l + 55})`);
        gr.addColorStop(0.5, `rgb(${l * 0.8},${l * 0.86},${l * 0.92})`);
        gr.addColorStop(1, `rgb(${l * 0.55},${l * 0.6},${l * 0.68})`);
        paint(ctx, gr, A_GLASS, rect(x, y0 + 4, S * 0.5 - 10, S * 0.74 - 6));
      }
    }
  }
  return c;
}

/** 4 Belgian shop fronts, full band height (4.5 m), ground at the bottom: stone piers (masked tint) with a plinth, a painted
 *  wooden fascia with one gilt line of lettering and a cornice, a striped awning on two of them, a glass front in painted
 *  wooden frames (transom light + vertical mullions, a recessed door) over a low panelled stall-riser; one painted shutter.
 *  No random coloured goods: the interior is a dim warm gradient with a shelf line. */
function shopCanvas() {
  const W = 256;
  const H = 384;
  const [c, ctx] = canvas(4 * W, H);
  const rand = rng(23);
  ctx.fillStyle = '#efece6';
  ctx.fillRect(0, 0, 4 * W, H);
  speckle(ctx, 4 * W, H, 500, rand);
  const wood = ['#1f4a3a', '#5a1f24', '#1c2f4a', '#2a2623']; // bottle green, ox-blood, navy, black
  const gilt = '#d6b25a';
  for (let k = 0; k < 4; k++) {
    const x0 = k * W;
    const [fx, fw] = [x0 + W * 0.05, W * 0.9];
    paint(ctx, wood[k]!, A_TRIM, rect(fx - 6, 0, fw + 12, H * 0.2)); // fascia board
    paint(ctx, '#e9e0c8', A_TRIM, rect(fx - 10, H * 0.2 - 3, fw + 20, 8)); // cornice below the fascia
    paint(ctx, gilt, A_TRIM, rect(fx + fw * 0.2, H * 0.085, fw * 0.6, 6)); // one line of gilt lettering
    paint(ctx, gilt, A_TRIM, rect(fx + fw * 0.3, H * 0.135, fw * 0.4, 4));
    const [oy, oh] = [H * 0.27, H * 0.62];
    if (k % 2 === 1) { // striped awning over the glass
      for (let i = 0; i < 8; i++) paint(ctx, i % 2 ? '#f2eee4' : k === 1 ? '#8a2a2e' : '#2e5f86', A_TRIM, rect(fx + (i * fw) / 8, H * 0.22, fw / 8 + 1, H * 0.07));
    }
    if (k === 3) { // painted roller shutter
      paint(ctx, '#3d4448', A_TRIM, rect(fx + 4, oy, fw - 8, oh));
      for (let y = oy; y < oy + oh; y += 7) paint(ctx, '#2b3135', A_TRIM, rect(fx + 4, y, fw - 8, 2));
      continue;
    }
    paint(ctx, wood[k]!, A_TRIM, rect(fx, oy - 2, fw, oh + 2)); // painted frame
    const gx = fx + 10;
    const gw = fw - 20;
    const tr = oh * 0.2; // transom light
    const gr = ctx.createLinearGradient(0, oy, 0, oy + oh);
    gr.addColorStop(0, '#b9a37a');
    gr.addColorStop(1, '#5b4a34');
    paint(ctx, gr, A_GLASS, rect(gx, oy + 6, gw, tr - 8));
    paint(ctx, gr, A_GLASS, rect(gx, oy + tr + 4, gw * 0.66, oh * 0.62 - 8)); // main pane
    paint(ctx, gr, A_GLASS, rect(gx + gw * 0.7, oy + tr + 4, gw * 0.3, oh * 0.8)); // door glass, set back
    paint(ctx, wood[k]!, A_TRIM, rect(gx, oy + tr - 2, gw, 6)); // transom bar
    paint(ctx, wood[k]!, A_TRIM, rect(gx + gw * 0.675, oy + 4, 8, oh - 6)); // door post
    for (let i = 1; i < 3; i++) paint(ctx, wood[k]!, A_TRIM, rect(gx + (gw * 0.66 * i) / 3, oy + 6, 5, tr - 8)); // transom mullions
    paint(ctx, wood[k]!, A_TRIM, rect(gx + gw * 0.33, oy + tr + 4, 5, oh * 0.62 - 8)); // pane mullion
    paint(ctx, '#e4d7b5', A_GLASS, rect(gx + 4, oy + tr + oh * 0.3, gw * 0.66 - 8, 4)); // a shelf line
    paint(ctx, wood[k]!, A_TRIM, rect(gx, oy + tr + oh * 0.62 - 4, gw * 0.66, oh * 0.38 - tr + 4)); // panelled stall-riser
    paint(ctx, '#ffffff', A_TRIM, rect(gx + 8, oy + tr + oh * 0.62 + 6, gw * 0.66 - 16, 3)); // panel moulding
  }
  ctx.fillStyle = 'rgba(70,60,50,0.5)'; // stone plinth
  ctx.fillRect(0, H * 0.94, 4 * W, H * 0.06);
  ctx.fillStyle = 'rgba(60,50,40,0.3)'; // slab shadow over the band
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

// ponytail: one slate map for slopes and flat caps alike (no dormers); upgrade: a second uv set / atlas for dormers.
function roofMaterial(zinc: string, limestone: string) {
  if (!graphics8c.roofs.enabled) return new THREE.MeshStandardMaterial({ map: texture(roofCanvas(zinc, limestone), true), vertexColors: true, roughness: 0.6 });
  const m = new THREE.MeshStandardMaterial({ ...pbrMaps('roof_slates_03'), vertexColors: true });
  for (const t of [m.map, m.normalMap, m.aoMap]) t?.repeat.set(1 / graphics8c.roofs.tile, 1 / graphics8c.roofs.tile);
  return m;
}

/** Facade material: map + vertex tint, × tint only where the map alpha says wall (`masked`), output alpha 1 (see A_TRIM).
 *  Night lighting: the geometry carries the `lit` attribute (MeshBucket.lit); glass = map alpha ≤ 0.5. */
function facadeMaterial(map: THREE.Texture, masked: boolean, roughness: number, shop = false) {
  const m = new THREE.MeshStandardMaterial({ map, vertexColors: true, roughness });
  const tint = masked ? 'diffuseColor.rgb *= mix(vec3(1.0), vColor.rgb, smoothstep(0.8, 0.95, diffuseColor.a));' : 'diffuseColor.rgb *= vColor.rgb;';
  const night = facadeNightGlsl(shop, map.repeat.x, map.repeat.y); // lit windows / shop signs (null by day)
  m.onBeforeCompile = (s) => {
    s.fragmentShader = s.fragmentShader.replace('#include <color_fragment>', `${night?.glow ?? ''}\n\t${tint}\n\tdiffuseColor.a = 1.0;`);
    if (!night) return;
    Object.assign(s.uniforms, night.uniforms); // night.ts nightTime (TV flicker, windows switching on / off)
    s.vertexShader = s.vertexShader.replace('#include <common>', `#include <common>\n${night.vertexHead}`).replace('#include <begin_vertex>', `#include <begin_vertex>\n\t${night.vertex}`);
    s.fragmentShader = s.fragmentShader.replace('#include <common>', `#include <common>\n${night.fragmentHead}`);
  };
  const key = `${masked ? 'facade-masked' : 'facade'}${night ? night.glow : ''}`;
  m.customProgramCacheKey = () => key;
  return m;
}

export function createBuildingMaterials(): Partial<Record<MaterialId, THREE.Material>> {
  const { limestone, zinc, iron } = B.colours;
  return {
    wall: facadeMaterial(texture(colonialCanvas(), false, [0.5, 0.5]), true, 0.9),
    tenement: facadeMaterial(texture(tenementCanvas(), false, [0.5, 0.5]), true, 0.85),
    curtain: facadeMaterial(texture(curtainCanvas(), false, [0.5, 0.5]), false, 0.25),
    shopfront: facadeMaterial(texture(shopCanvas(), true, [0.25, 1]), true, 0.75, true),
    roof: roofMaterial(zinc, limestone),
    balcony: new THREE.MeshStandardMaterial({
      map: texture(railingCanvas(iron), true),
      alphaTest: 0.5,
      side: THREE.DoubleSide,
      roughness: 0.5,
    }),
  };
}
