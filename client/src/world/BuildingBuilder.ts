// Package B: buildings from BuildingRecs (skips recs with .landmark, see world/landmarks/index.ts).
// Module top level must not touch the DOM: the worker imports build*(); canvas textures only inside create*().
//
// Per building: ground g = min terrain over the outer ring, but at most groundSpan below its max (a footprint reaching
// into the carved Seine or over a DEM bump, e.g. the Louvre, is not buried); walls from min − baseSink to top = g + height.
// Leg 3 Hà Nội (config buildings.macao, picked per building by hash01): plaster low-rise ('wall': nhà ống / French fronts,
// 8-column atlas: 0–5 nhà ống fronts, 6–7 French colonial; optional tile hip roof, rooftop box + water tank on flat roofs),
// khu tập thể slabs and concrete-grid towers ('tenement': small windows, sunshades, loggia grilles, laundry, stair core; a tôn
// pitched 'mái che' on a share of slabs), glass towers ('curtain', flat roof + plant box); a shop band 0–4.5 m ('shopfront':
// sign boards, roller shutters, goods) on street faces. French quarter box (macao.french): ochre tints, more hip roofs, the
// French atlas columns. Plots (macao.plots, see emitPlots): every street edge of a low-rise front is cut into ≈ 4 m plots with
// their own facade column, plaster tint and (untagged footprints) height: ragged roof lines with bare side walls, pitched tile /
// tôn caps and 'tum' stair boxes on the raised ones. Haussmann (Leg 1,
// buildings.haussmannHeight; off here): same band, zinc mansard (top 4 m, inset ≈ 1.2 m) + chimneys, iron balconies on floors 2 and 5.
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

const PLAIN_WALL_UV = [4, 2.5] as const; // plain plaster texel, in bays / floors (× the facade repeat): wall atlas column 4 left edge, mid floor 2; tenement / curtain column 0 edge
// Phase 8C T3: with graphics8c.roofs.enabled the roof uv is WORLD METRES (slope: along the edge × up the slope, caps: x, z;
// material.map.repeat = 1 / tile) for the roof_slates_03 slates, instead of the canvas bay layout below (dormers dropped).
const ROOF_PBR = graphics8c.roofs.enabled;
const PLAIN_ROOF_UV = [0.5, 0.1] as const; // plain zinc band of the roof texture
const SLAB_UV = [0.5, 0.06] as const; // solid bottom rail of the balcony texture
const SIDE_TINT: V3 = linear(B.macao.plots.sideTint); // bare party / side walls (tường hông)

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
  roofBox: boolean; // nhà ống: a stair-head box on the flat roof (config buildings.macao.roofBox)
  tank: boolean; // … with a water tank on it
  shift: number; // facade atlas column the first bay of every edge starts at (per building, so a row of plots differs)
  plots?: { extra: number; flat: number; cols: readonly [number, number]; palette: string[] }; // emitPlots: max extra storeys, share kept flat, atlas column range, tint palette
  tint: V3;
  roofTint: V3; // roof bucket (slates, lifted): slopes
  capTint: V3; // wall bucket (plain plaster texel, unlifted): flat caps, parapets, tum / stair boxes
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
  let h = buildingHeight(b);
  const P = B.macao.plots;
  const area = Math.abs(ringArea(outer));
  // Hà Nội: an untagged plot row (no height / levels) is floors[0]–[1] storeys, hashed per building, not defaultHeight
  const untagged = !(b.height! > 0) && !(b.levels! > 0) && b.kind !== 'roof' && area >= B.smallArea && P.kinds.includes(b.kind);
  const boxes = area >= P.minBoxArea; // a small footprint is one plot: its extra storeys go on the whole house, no per-edge boxes
  if (untagged && B.haussmannHeight[1] === 0) {
    const r20 = hash01(outer[0]!, outer[1]!, 20);
    let floors = P.floors[0]! + Math.floor(r20 * (P.floors[1]! - P.floors[0]! + 1));
    const r21 = hash01(outer[0]!, outer[1]!, 33);
    if (!boxes && r21 >= P.flatShare) floors += 1 + Math.floor(((r21 - P.flatShare) / (1 - P.flatShare)) * P.extra);
    h = floors * B.levelHeight;
  }
  const minH = b.minHeight ?? (b.kind === 'roof' ? Math.max(0, h - B.canopyThickness) : 0);
  const top = g + h;
  const bottom = minH > 0 ? g + minH : gMin - B.baseSink;
  if (!(top > bottom + 0.1)) return undefined;
  const [x0, z0] = [outer[0]!, outer[1]!];
  const r = (salt: number) => hash01(x0, z0, salt);
  const pick = (list: string[], k = 1, salt = 9) => linear(list[Math.floor(r(salt) * list.length)]!, k * (0.9 + 0.1 * r(2)));
  const rb = 0.8 + 0.25 * r(3);
  const M = B.macao;
  const lit = r(10) < M.litShare ? 0.01 + 0.99 * r(11) : 0;
  const shift = Math.floor(r(13) * 24); // 24 = lcm of the wall (8) and tenement (4) atlas column counts
  const housing = B.haussmannKinds.includes(b.kind);
  if (minH === 0 && housing && h >= B.haussmannHeight[0]! && h <= B.haussmannHeight[1]!) {
    const k = r(1);
    const bright = 0.84 + 0.16 * r(2);
    return {
      rings: [outer, ...holes], g, bottom, top, lit, haussmann: true, face: 'wall', windows: true, shop: true, plant: false, roofBox: false, tank: false, shift,
      slope: [B.mansardHeight, B.mansardInset],
      tint: [bright, bright * (0.97 - 0.05 * k), bright * (0.93 - 0.1 * k)], // warm cream ↔ neutral grey-white limestone
      roofTint: ROOF_PBR ? [rb * 1.35, rb * 1.5, rb * 1.8] : [rb, rb, rb * 1.03], // slate diffuse is dark and warm: lift + cool it
      capTint: [rb * 0.5, rb * 0.52, rb * 0.55],
    };
  }
  // Macao: colonial pastel low-rise, Chinese tenements, towers (config buildings.macao)
  const [t0, t1] = M.towerHeight as [number, number];
  const tower = h >= t1 || (h > t0 && r(5) < (h - t0) / (t1 - t0));
  const F = M.french;
  const french = F.boxes.some((bx) => x0 >= bx[0]! && x0 <= bx[2]! && z0 >= bx[1]! && z0 <= bx[3]!);
  const tenementShare = french ? F.tenementShare : b.kind === 'yes' ? M.tenementYesShare : M.tenementShare;
  const tenement = !tower && (h > t0 || (M.tenementKinds.includes(b.kind) && h >= M.tenementMin && r(6) < tenementShare));
  const curtain = tower && r(7) < M.curtainShare;
  const hip = !tower && !tenement && minH === 0 && h <= M.hip.maxHeight && area <= M.hip.maxArea && r(8) < (french ? F.hipChance : untagged && !boxes ? M.hip.smallChance : M.hip.chance);
  let minEdge = Infinity;
  for (let i = 0; i < outer.length; i += 2) minEdge = Math.min(minEdge, Math.hypot(outer[(i + 2) % outer.length]! - outer[i]!, outer[(i + 3) % outer.length]! - outer[i + 1]!));
  const inset = Math.min(M.hip.inset, minEdge / 2);
  const lift = (ROOF_PBR ? M.roofLift : 1) * rb;
  const windows = h > 5 && !M.blankKinds.includes(b.kind);
  const low = !tower && !tenement && windows;
  // KTT slab: a tôn 'mái che' pitched cap (slope, tôn tint) on a share of them
  const K = M.kttRoof;
  const ktt = tenement && !tower && minH === 0 && h <= K.maxHeight && r(21) < K.share;
  const kttInset = Math.min(K.inset, minEdge / 2);
  const plots = low && !hip && minH === 0 && area <= P.maxArea && windows;
  const roofBox = low && !hip && !(plots && untagged) && minH === 0 && h <= M.roofBox.maxHeight && r(14) < (french ? F.roofBoxChance : M.roofBox.chance);
  const ochre = french && r(16) < F.ochreShare;
  const palette = curtain ? M.glass : tower ? M.concrete : tenement ? M.tenement : ochre ? M.colonial.slice(0, F.ochreCount) : M.colonial;
  return {
    rings: [outer, ...holes], g, bottom, top, lit, haussmann: false, shift: french ? 6 + (shift % 2) : shift,
    face: curtain ? 'curtain' : tower || tenement ? 'tenement' : 'wall',
    windows,
    shop: minH === 0 && (windows ? h >= M.shopMinHeight && (!french || r(18) < F.shopShare) : h >= M.kioskShopMin && !M.blankKinds.includes(b.kind)),
    ...(hip && { slope: [(M.hip.rise * inset) / M.hip.inset, inset] as const }),
    ...(ktt && { slope: [(K.rise * kttInset) / K.inset, kttInset] as const }),
    plant: tower && minH === 0,
    roofBox,
    tank: roofBox && r(15) < M.roofBox.tankShare,
    ...(plots && { plots: { extra: untagged && boxes ? P.extra : 0, flat: french ? F.plotFlat : P.flatShare, cols: french ? [6, 2] : [0, 6], palette } }),
    tint: pick(palette),
    roofTint: hip ? (!french && r(23) < M.hip.tonShare ? pick(M.ton.colours, lift, 24) : linear(M.tileRoof, lift)) : ktt ? pick(K.colours, lift, 22) : pick(M.flatRoofs, lift, 17),
    // ponytail: flat caps, parapets and roof boxes go to the wall bucket's plain plaster texel (the lifted slate diffuse turns
    // every grey into an olive slab); upgrade: a concrete roof PBR map on its own material (+1 draw call per chunk)
    capTint: pick(low && area <= M.ton.maxArea && r(19) < M.ton.share ? M.ton.colours : M.flatRoofs, 1, 17),
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
    face.lit = wall.lit = p.lit;
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

        const floorsV = (y: number) => (y - base) / B.levelHeight;
        const u0 = p.haussmann ? 0 : p.shift; // Hà Nội: the bays start at a per-building atlas column (wallCanvas / tenementCanvas)
        if (hidden[i] !== -Infinity || !p.windows) {
          // party wall above the neighbour or a windowless building (no roof slope on this edge): a facade when a whole storey
          // shows over the neighbour (Old Quarter: the OSM sliver in front is a 1-storey shop, the house behind keeps its front),
          // a shop band on a low windowless box (quán), else a bare wall (tường hông)
          const y0 = Math.max(bottom, hidden[i]!);
          if (top <= y0 + 0.05) continue;
          if (hidden[i] !== -Infinity && p.windows && !haussmann && top - y0 >= B.levelHeight) {
            wallQuad(face, y0, top, u0, floorsV(y0), u0 + bays, floorsV(top));
            continue;
          }
          let y1 = y0;
          if (!p.windows && p.shop && ri === 0 && hidden[i] === -Infinity) {
            y1 = Math.min(top, shopTop);
            wallQuad(shop, y0, y1, shopShift, (y0 - g) / B.shopfrontHeight, shopShift + bays, (y1 - g) / B.shopfrontHeight);
            if (top <= y1 + 0.05) continue;
          }
          if (hidden[i] !== -Infinity && !haussmann) face.color = SIDE_TINT;
          wallQuad(face, y1, top, PLAIN_WALL_UV[0], PLAIN_WALL_UV[1], PLAIN_WALL_UV[0], PLAIN_WALL_UV[1]);
          face.color = p.tint;
          continue;
        }
        const shopHere = shopOn && ri === 0 && bottom < shopTop;
        if (shopHere) wallQuad(shop, bottom, shopTop, shopShift, (bottom - g) / B.shopfrontHeight, shopShift + bays, 1);
        if (p.plots && ri === 0 && len >= B.macao.plots.minEdge) {
          emitPlots(p, r, i, shopHere ? shopTop : bottom, floorsV, hidden[(i + n - 1) % n] === -Infinity, hidden[j] === -Infinity);
          continue;
        }
        if (shopHere) wallQuad(face, shopTop, wallTop, u0, 0, u0 + bays, floorsV(wallTop));
        else wallQuad(face, bottom, wallTop, u0, floorsV(bottom), u0 + bays, floorsV(wallTop));
        if (!slope && !haussmann && ri === 0) parapet([ax, 0, az], [bx, 0, bz], top, (bz - az) / len, (ax - bx) / len);
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
    // a flat cap is concrete (wall bucket, capTint); the cap under a slope is the roof surface (roof bucket)
    const flatFace = (rings: XZ[], idx: number[], y: number, ny: number, buf: MeshBuffer) => {
      const pts = rings.flat();
      const b0 = buf.vertexCount;
      const slates = buf === roof && ROOF_PBR;
      for (let i = 0; i < pts.length; i += 2) buf.vertex(pts[i]!, y, pts[i + 1]!, 0, ny, 0, slates ? pts[i]! : buf === roof ? PLAIN_ROOF_UV[0] : PLAIN_WALL_UV[0], slates ? pts[i + 1]! : buf === roof ? PLAIN_ROOF_UV[1] : PLAIN_WALL_UV[1]);
      for (let i = 0; i < idx.length; i += 3) {
        if (ny > 0) buf.face(b0 + idx[i]!, b0 + idx[i + 1]!, b0 + idx[i + 2]!);
        else buf.face(b0 + idx[i]!, b0 + idx[i + 2]!, b0 + idx[i + 1]!);
      }
    };
    wall.color = p.capTint;
    flatFace(capRings, capIdx, top, 1, slope ? roof : wall);
    if (bottom > g) flatFace(p.rings, ringIdx, bottom, -1, wall);
    if (p.plant) roofBlock(p.rings.flat(), ringIdx, top, B.macao.plantBox as [number, number, number, number], 0.75);
    else if (p.roofBox) roofBlock(p.rings.flat(), ringIdx, top, B.macao.roofBox.size as [number, number, number, number], 0.9, p.tank);
    // collider cap
    const flat = p.rings.flat();
    const c0 = cv.length / 3;
    for (let i = 0; i < flat.length; i += 2) cv.push(flat[i]!, top, flat[i + 1]!);
    for (const k of ringIdx) ci.push(c0 + k);
  }

  /** Quad a→b→c→d (uv as MeshBuffer.quad) wound so its normal points along `want`. */
  function facing(buf: MeshBuffer, a: V3, b: V3, c: V3, d: V3, want: V3, u0 = 0, v0 = 0, u1 = 1, v1 = 1) {
    const [ex, ey, ez] = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const [fx, fy, fz] = [d[0] - b[0], d[1] - b[1], d[2] - b[2]];
    const dot = (ey * fz - ez * fy) * want[0] + (ez * fx - ex * fz) * want[1] + (ex * fy - ey * fx) * want[2];
    if (dot >= 0) buf.quad(a, b, c, d, u0, v0, u1, v1);
    else buf.quad(b, a, d, c, u0, v0, u1, v1);
  }

  /** Nhà ống plots along outer edge i (A→B, inward normal n) of a low-rise front (config buildings.macao.plots): the edge is cut
   *  into ≈ width m plots, each a facade quad with its own atlas column + plaster tint from y0 up to its own top; a plot above
   *  the block top is a box depth d deep (d ≤ half the footprint across the edge, ≤ the nearest notch in front of it) with a
   *  bare side wall wherever its neighbour plot is lower (a corner house facing a second street gets a facade there instead),
   *  a bare darker back wall, and a pitched cap, a 'tum' box or a flat cap. A slab (roof bucket) projects under the balcony
   *  columns on the first floor above the shop band. */
  function emitPlots(p: Prep, r: XZ, i: number, y0: number, floorsV: (y: number) => number, streetPrev: boolean, streetNext: boolean) {
    const P = B.macao.plots;
    const { top } = p;
    const pl = p.plots!;
    const face = faces[p.face];
    const n = r.length / 2;
    const j = (i + 1) % n;
    const [ax, az, bx, bz] = [r[2 * i]!, r[2 * i + 1]!, r[2 * j]!, r[2 * j + 1]!];
    const len = Math.hypot(bx - ax, bz - az);
    const [tx, tz] = [(bx - ax) / len, (bz - az) / len];
    const [nx, nz] = [tz, -tx]; // inward (outer rings are CCW)
    let across = 0;
    let notch = Infinity;
    for (let k = 0; k < n; k++) {
      const lat = (r[2 * k]! - ax) * tx + (r[2 * k + 1]! - az) * tz;
      const dist = (r[2 * k]! - ax) * nx + (r[2 * k + 1]! - az) * nz;
      across = Math.max(across, dist);
      if (dist > 0.3 && lat > -0.5 && lat < len + 0.5) notch = Math.min(notch, dist);
    }
    const d = Math.min(P.depth, across / 2, notch - 0.1);
    const count = Math.max(1, Math.round(len / P.width));
    const w = len / count;
    const bays = w > 4.6 ? 2 : 1;
    const heights: number[] = [];
    for (let k = 0; k < count; k++) {
      const h = hash01(ax + tx * (k + 0.5) * w, az + tz * (k + 0.5) * w, 23);
      const extra = d < 1 || pl.extra === 0 || h < pl.flat ? 0 : 1 + Math.floor(((h - pl.flat) / (1 - pl.flat)) * pl.extra);
      heights.push(top + extra * B.levelHeight);
    }
    const lift = (ROOF_PBR ? B.macao.roofLift : 1) * (0.85 + 0.2 * hash01(ax, az, 24));
    const [u, v] = PLAIN_WALL_UV;
    const sideTint = SIDE_TINT;
    for (let k = 0; k < count; k++) {
      const hk = heights[k]!;
      const px = ax + tx * k * w;
      const pz = az + tz * k * w;
      const rnd = (salt: number) => hash01(px, pz, salt);
      const tint = linear(pl.palette[Math.floor(rnd(25) * pl.palette.length)]!, 0.88 + 0.12 * rnd(26));
      const col = pl.cols[0] + Math.floor(rnd(27) * (pl.cols[1] - bays + 1));
      const A: V3 = [px, 0, pz];
      const Bp: V3 = [px + tx * w, 0, pz + tz * w];
      const at = (q: V3, y: number, depth = 0): V3 => [q[0] + nx * depth, y, q[2] + nz * depth];
      face.color = tint;
      face.quad(at(A, y0), at(Bp, y0), at(Bp, hk), at(A, hk), col, floorsV(y0), col + bays, floorsV(hk));
      if (P.slabCols.includes(col) && hk - y0 > B.levelHeight * 1.5 && d >= 1) { // projecting balcony slab under the painted railing
        const ys = y0 + P.slabUp;
        const [sd, so] = [P.slabDepth, 0.08 * w];
        wall.color = SIDE_TINT;
        const q0 = at([A[0] + tx * so, 0, A[2] + tz * so], ys);
        const q1 = at([Bp[0] - tx * so, 0, Bp[2] - tz * so], ys);
        const q2 = at(q1, ys, -sd);
        const q3 = at(q0, ys, -sd);
        facing(wall, q0, q1, q2, q3, [0, 1, 0], u, v, u, v);
        facing(wall, q3, q2, [q2[0], ys - P.slabThick, q2[2]], [q3[0], ys - P.slabThick, q3[2]], [-nx, 0, -nz], u, v, u, v);
        facing(wall, q0, q1, q2, q3, [0, -1, 0], u, v, u, v);
      }
      if (hk <= top) {
        parapet(A, Bp, top, nx, nz);
        continue;
      }
      // side walls (bare plaster) where the neighbour plot is lower; the ends of the edge face the block's own roof
      face.color = [sideTint[0] * (0.9 + 0.2 * rnd(28)), sideTint[1] * (0.9 + 0.2 * rnd(28)), sideTint[2] * (0.9 + 0.2 * rnd(28))];
      const hPrev = k ? heights[k - 1]! : top;
      const hNext = k < count - 1 ? heights[k + 1]! : top;
      const side = (q: V3, from: number, want: V3, street: boolean) => {
        if (street) { // corner house: its side on the other street is a facade too (plain bays of its own column)
          face.color = tint;
          const bays2 = Math.max(1, Math.round(d / B.bayWidth));
          facing(face, at(q, from), at(q, from, d), at(q, hk, d), at(q, hk), want, col, floorsV(from), col + bays2, floorsV(hk));
          face.color = sideTint;
        } else facing(face, at(q, from), at(q, from, d), at(q, hk, d), at(q, hk), want, u, v, u, v);
      };
      if (hk > hPrev) side(A, hPrev, [-tx, 0, -tz], k === 0 && streetPrev);
      if (hk > hNext) side(Bp, hNext, [tx, 0, tz], k === count - 1 && streetNext);
      face.color = sideTint;
      facing(face, at(Bp, top, d), at(A, top, d), at(A, hk, d), at(Bp, hk, d), [nx, 0, nz], col % 6, floorsV(top), (col % 6) + bays, floorsV(hk)); // back: plaster with windows
      const kind = rnd(29);
      if (kind < P.gableShare) {
        roof.color = rnd(30) < P.tileShare ? linear(B.macao.tileRoof, lift) : linear(B.macao.ton.colours[Math.floor(rnd(31) * B.macao.ton.colours.length)]!, lift);
        const ra = at(A, hk + P.rise, d / 2);
        const rb = at(Bp, hk + P.rise, d / 2);
        const s = Math.hypot(d / 2, P.rise);
        facing(roof, at(A, hk), at(Bp, hk), rb, ra, [-nx, 1, -nz], 0, 0, ROOF_PBR ? w : 1, ROOF_PBR ? s : 1);
        facing(roof, at(Bp, hk, d), at(A, hk, d), ra, rb, [nx, 1, nz], 0, 0, ROOF_PBR ? w : 1, ROOF_PBR ? s : 1);
        facing(roof, at(A, hk), ra, at(A, hk, d), at(A, hk, d), [-tx, 0, -tz], u, v, u, v); // gables (degenerate quads)
        facing(roof, at(Bp, hk), rb, at(Bp, hk, d), at(Bp, hk, d), [tx, 0, tz], u, v, u, v);
        continue;
      }
      wall.color = p.capTint;
      const rc = wall.vertexCount;
      for (const q of [at(A, hk), at(Bp, hk), at(Bp, hk, d), at(A, hk, d)]) wall.vertex(q[0], hk, q[2], 0, 1, 0, u, v);
      wall.face(rc, rc + 2, rc + 1); // flat cap (concrete), up (A→B→inner is clockwise seen from above)
      wall.face(rc, rc + 3, rc + 2);
      parapet(at(A, 0), at(Bp, 0), hk, nx, nz);
      if (kind < P.gableShare + P.tumShare) {
        const [side, up] = P.tum;
        const sz = Math.min(side, 0.7 * w, 0.5 * d);
        const cx = px + tx * w * 0.5 + nx * (d - sz * 0.5 - 0.3);
        const cz = pz + tz * w * 0.5 + nz * (d - sz * 0.5 - 0.3);
        wall.color = [p.capTint[0] * 0.9, p.capTint[1] * 0.9, p.capTint[2] * 0.9];
        const corner = (s: number, t: number, y: number): V3 => [cx + tx * s * sz * 0.5 + nx * t * sz * 0.5, y, cz + tz * s * sz * 0.5 + nz * t * sz * 0.5];
        const ring: [number, number][] = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
        for (let e = 0; e < 4; e++) {
          const [f0, f1] = [ring[e]!, ring[(e + 1) % 4]!];
          const out: V3 = [(f0[0] + f1[0]) * 0.5 * tx + (f0[1] + f1[1]) * 0.5 * nx, 0, (f0[0] + f1[0]) * 0.5 * tz + (f0[1] + f1[1]) * 0.5 * nz];
          facing(wall, corner(f0[0], f0[1], hk), corner(f1[0], f1[1], hk), corner(f1[0], f1[1], hk + up), corner(f0[0], f0[1], hk + up), out, u, v, u, v);
        }
        facing(wall, corner(-1, -1, hk + up), corner(1, -1, hk + up), corner(1, 1, hk + up), corner(-1, 1, hk + up), [0, 1, 0], u, v, u, v);
        if (rnd(32) < P.tankShare) waterTank(cx, cz, hk + up, Math.min(B.macao.roofBox.tankRadius, sz * 0.4));
      }
    }
  }

  /** Concrete lip along a flat roof edge A→B at y (inward normal n): outer + inner face, wall bucket in bare plaster. */
  function parapet(A: V3, Bp: V3, y: number, nx: number, nz: number) {
    const h = B.macao.plots.parapet;
    const saved = wall.color;
    wall.color = SIDE_TINT;
    const [u, v] = PLAIN_WALL_UV;
    wall.quad([A[0], y, A[2]], [Bp[0], y, Bp[2]], [Bp[0], y + h, Bp[2]], [A[0], y + h, A[2]], u, v, u, v);
    wall.quad([Bp[0] + nx * 0.2, y, Bp[2] + nz * 0.2], [A[0] + nx * 0.2, y, A[2] + nz * 0.2], [A[0] + nx * 0.2, y + h, A[2] + nz * 0.2], [Bp[0] + nx * 0.2, y + h, Bp[2] + nz * 0.2], u, v, u, v);
    wall.color = saved;
  }

  /** Hex-prism water tank (bồn nước) standing at (cx, cz) on y0. */
  function waterTank(cx: number, cz: number, y0: number, rad: number) {
    const T = B.macao.roofBox;
    const y1 = y0 + T.tankHeight;
    const saved = roof.color;
    roof.color = linear(T.tank, ROOF_PBR ? B.macao.roofLift : 1);
    const Q = (k: number, y: number): V3 => [cx + rad * Math.cos((k * Math.PI) / 3), y, cz + rad * Math.sin((k * Math.PI) / 3)];
    for (let k = 0; k < 6; k++) roof.quad(Q(k + 1, y0), Q(k, y0), Q(k, y1), Q(k + 1, y1), 0, 0, rad, T.tankHeight); // sides, outward
    const lid = roof.vertexCount;
    for (let k = 0; k < 6; k++) {
      const [x, , z] = Q(k, y1);
      roof.vertex(x, y1, z, 0, 1, 0, ROOF_PBR ? x : PLAIN_ROOF_UV[0], ROOF_PBR ? z : PLAIN_ROOF_UV[1]);
    }
    for (let k = 1; k < 5; k++) roof.face(lid, lid + k + 1, lid + k); // lid fan, facing up
    roof.color = saved;
  }

  /** Box (wall bucket, capTint × dim) centred on the largest roof triangle's centroid; skipped when it would not fit that triangle.
   *  size = [min side, height, side as a share of √(triangle area), max side]; `tank`: a hex-prism water tank on its top. */
  function roofBlock(pts: number[], idx: number[], top: number, size: readonly [number, number, number, number], dim: number, tank = false) {
    let best = 0;
    let at = -1;
    for (let i = 0; i < idx.length; i += 3) {
      const [a, b, c] = [idx[i]! * 2, idx[i + 1]! * 2, idx[i + 2]! * 2];
      const area = Math.abs((pts[b]! - pts[a]!) * (pts[c + 1]! - pts[a + 1]!) - (pts[c]! - pts[a]!) * (pts[b + 1]! - pts[a + 1]!)) / 2;
      if (area > best) [best, at] = [area, i];
    }
    const [min, up, share, max] = size;
    const s = Math.min(max, Math.max(min, share * Math.sqrt(best)));
    if (at < 0 || s > 0.45 * Math.sqrt(best)) return;
    const [a, b, c] = [idx[at]! * 2, idx[at + 1]! * 2, idx[at + 2]! * 2];
    const cx = (pts[a]! + pts[b]! + pts[c]!) / 3;
    const cz = (pts[a + 1]! + pts[b + 1]! + pts[c + 1]!) / 3;
    const saved = wall.color;
    wall.color = [saved[0] * dim, saved[1] * dim, saved[2] * dim];
    const h = s / 2;
    const [u, v] = PLAIN_WALL_UV;
    const P = (sx: number, sz: number, y: number): V3 => [cx + sx * h, y, cz + sz * h];
    const ring: [number, number][] = [[-1, 1], [1, 1], [1, -1], [-1, -1]]; // counter-clockwise seen from above
    for (let k = 0; k < 4; k++) {
      const [e, f] = [ring[k]!, ring[(k + 1) % 4]!];
      wall.quad(P(e[0], e[1], top), P(f[0], f[1], top), P(f[0], f[1], top + up), P(e[0], e[1], top + up), u, v, u, v);
    }
    wall.quad(P(-1, 1, top + up), P(1, 1, top + up), P(1, -1, top + up), P(-1, -1, top + up), u, v, u, v);
    if (tank) waterTank(cx, cz, top + up, Math.min(B.macao.roofBox.tankRadius, h * 0.8));
    wall.color = saved;
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

// ── Hà Nội facade elements (canvas px; a bay cell is S = 256 px ≈ 3 m, a floor 256 px = 3.2 m) ──

/** Louvred shutter panel. */
function shutter(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, colour: string, dark: string) {
  paint(ctx, colour, A_TRIM, rect(x, y, w, h));
  for (let yy = y + 8; yy < y + h - 6; yy += 7) paint(ctx, dark, A_TRIM, rect(x + 3, yy, w - 6, 2));
}

/** Iron grille: rails top and bottom, thin vertical bars. */
function grille(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, iron: string, step = 9) {
  paint(ctx, iron, A_TRIM, rect(x, y, w, 4));
  paint(ctx, iron, A_TRIM, rect(x, y + h - 4, w, 4));
  for (let xx = x; xx <= x + w - 2; xx += step) paint(ctx, iron, A_TRIM, rect(xx, y, 2.5, h));
  paint(ctx, iron, A_TRIM, rect(x, y + h * 0.55, w, 2));
}

/** Outdoor AC unit with a drip shadow. */
function acUnit(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  paint(ctx, '#e6e6e2', A_TRIM, rect(x, y, w, h));
  for (let yy = y + 4; yy < y + h - 3; yy += 5) paint(ctx, '#aeb0ad', A_TRIM, rect(x + 4, yy, w * 0.55, 2));
  paint(ctx, '#8f918e', A_TRIM, (k) => k.arc(x + w * 0.78, y + h / 2, h * 0.3, 0, Math.PI * 2));
  ctx.fillStyle = 'rgba(40,35,30,0.22)';
  ctx.fillRect(x + 2, y + h, w, 4);
}

/** Concrete sunshade (ô văng) over a window, with its shadow on the wall below. */
function sunshade(ctx: CanvasRenderingContext2D, x: number, y: number, w: number) {
  paint(ctx, '#dad6cd', A_TRIM, rect(x, y, w, 9));
  ctx.fillStyle = 'rgba(40,35,30,0.2)';
  ctx.fillRect(x + 2, y + 9, w - 2, 7);
}

/** Sign board (saturated ground, bars of "lettering"); vertical = the bars stack as short lines down the board. */
function sign(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, ground: string, text: string, vertical: boolean) {
  paint(ctx, ground, A_TRIM, rect(x, y, w, h));
  if (vertical) {
    for (let yy = y + 10; yy < y + h - 14; yy += 20) paint(ctx, text, A_TRIM, rect(x + w * 0.2, yy, w * 0.6, 11));
  } else {
    paint(ctx, text, A_TRIM, rect(x + w * 0.08, y + h * 0.28, w * 0.5, h * 0.2));
    paint(ctx, text, A_TRIM, rect(x + w * 0.64, y + h * 0.28, w * 0.26, h * 0.2));
    paint(ctx, text, A_TRIM, rect(x + w * 0.22, y + h * 0.62, w * 0.56, h * 0.1));
  }
}

/** Rain streaks, black-green mould blotches and a grime band above the floor slab (tinted wall: alpha stays). */
function weather(ctx: CanvasRenderingContext2D, x0: number, y0: number, S: number, rand: () => number) {
  for (let k = 0; k < 7; k++) {
    ctx.fillStyle = `rgba(50,45,40,${0.04 + rand() * 0.07})`;
    ctx.fillRect(x0 + rand() * S, y0 + S * (0.4 + rand() * 0.4), 2 + rand() * 6, S * (0.1 + rand() * 0.4));
  }
  for (let k = 0; k < 4; k++) { // mould (rêu mốc) under the slab line and at the cell edges
    ctx.fillStyle = `rgba(40,55,35,${0.06 + rand() * 0.1})`;
    const big = rand() < 0.5;
    ctx.beginPath();
    ctx.ellipse(x0 + rand() * S, y0 + (big ? S * (0.8 + rand() * 0.15) : S * (0.02 + rand() * 0.1)), S * (0.05 + rand() * 0.15), S * (0.02 + rand() * 0.05), 0, 0, Math.PI * 2);
    ctx.fill();
  }
  const gr = ctx.createLinearGradient(0, y0 + S * 0.6, 0, y0 + S * 0.95);
  gr.addColorStop(0, 'rgba(60,50,40,0)');
  gr.addColorStop(1, 'rgba(55,50,40,0.22)');
  ctx.fillStyle = gr;
  ctx.fillRect(x0, y0 + S * 0.6, S, S * 0.35);
  ctx.fillStyle = 'rgba(70,65,55,0.12)'; // grime under the top edge (the slab above)
  ctx.fillRect(x0, y0, S, S * 0.05);
}

/** Hà Nội plaster fronts, 6 bays × 4 floors (256 px cells, floor level at the bottom of each cell, floor 0 = the first above
 *  the shop band): weathered plaster (× the vertex tint), a concrete slab line per floor, and a different front per bay so a
 *  long OSM block reads as a row of 3–4 m nhà ống: 0 French window with green shutters + juliet grille, 1 balcony with an
 *  iron grille, a glass door, an AC unit and a 2-floor vertical sign on its edge, 2 'chuồng cọp' cage with laundry (untinted
 *  cream plaster = its own house colour), 3 French window with brown shutters under a concrete sunshade, 4 wide aluminium
 *  window under a sunshade, AC unit, drain pipe, a horizontal sign on floor 0, 5 balcony with a solid balustrade and plants
 *  (untinted pale pink); French colonial columns (french quarter plots): 6 tall arched window with white moulding and
 *  green louvred shutters between pilasters, 7 arched door onto a balcony with a white balustrade. Column 0 keeps a plain plaster
 *  margin at x = 0 (PLAIN_WALL_UV). */
function wallCanvas() {
  const S = 256;
  const [COLS, ROWS] = [8, 4];
  const [W, H] = [COLS * S, ROWS * S];
  const [c, ctx] = canvas(W, H);
  const rand = rng(11);
  ctx.fillStyle = '#f0ece4';
  ctx.fillRect(0, 0, W, H);
  speckle(ctx, W, H, 4000, rand);
  paint(ctx, '#ebe5d6', A_TRIM, rect(2 * S, 0, S, H)); // own-colour columns
  paint(ctx, '#e8cfc2', A_TRIM, rect(5 * S, 0, S, H));
  const iron = '#2c2f33';
  const glassHue: V3 = [-4, 6, 8];
  for (let floor = 0; floor < ROWS; floor++) {
    const y0 = (ROWS - 1 - floor) * S; // v = 0 is the canvas bottom
    for (let col = 0; col < COLS; col++) weather(ctx, col * S, y0, S, rand);
    ctx.fillStyle = 'rgba(40,35,30,0.2)'; // slab line
    ctx.fillRect(0, y0 + S * 0.95, W, S * 0.05);
    paint(ctx, '#d8d4cb', A_TRIM, rect(0, y0 + S * 0.94, W, 4));

    // 0: French window, green shutters (teal on odd floors), white surround, juliet grille
    {
      const x0 = 0;
      const [wx, ww, wy, wh] = [x0 + S * 0.33, S * 0.34, y0 + S * 0.12, S * 0.7];
      paint(ctx, '#f3efe6', A_TRIM, rect(wx - 9, wy - 9, ww + 18, wh + 9));
      paint(ctx, '#f3efe6', A_TRIM, rect(wx - 16, wy + wh, ww + 32, 7));
      glass(ctx, wx, wy, ww, wh, rand, glassHue);
      paint(ctx, '#f6f3ec', A_TRIM, rect(wx + ww / 2 - 2, wy, 4, wh));
      paint(ctx, '#f6f3ec', A_TRIM, rect(wx, wy + wh * 0.38, ww, 4));
      const [g, gd] = floor % 2 ? ['#4a6f7a', '#36535c'] : ['#3d6a46', '#2c4f34'];
      const sw = ww * 0.5;
      shutter(ctx, wx - 9 - sw, wy - 4, sw, wh + 4, g, gd);
      if (floor === 2) shutter(ctx, wx + ww / 2, wy - 4, sw, wh + 4, g, gd); // half closed
      else shutter(ctx, wx + ww + 9, wy - 4, sw, wh + 4, g, gd);
      grille(ctx, wx - 12, wy + wh * 0.66, ww + 24, wh * 0.34, iron);
    }
    // 1: balcony with an iron grille, glass door, AC; vertical sign over floors 0–1 on the left edge
    {
      const x0 = S;
      const [bx, bw] = [x0 + S * 0.22, S * 0.74];
      const [fx, fw, fy, fh] = [x0 + S * 0.32, S * 0.54, y0 + S * 0.1, S * 0.68];
      paint(ctx, '#e6e1d6', A_TRIM, rect(fx - 6, fy - 6, fw + 12, fh + 6));
      glass(ctx, fx, fy, fw, fh, rand, glassHue);
      paint(ctx, '#e6e1d6', A_TRIM, rect(fx + fw / 2 - 2, fy, 4, fh));
      if (floor % 2) paint(ctx, '#c9b9a0', A_GLASS, rect(fx + 4, fy + 4, fw * 0.45, fh - 8)); // curtain
      paint(ctx, '#d6d2c8', A_TRIM, rect(bx, y0 + S * 0.78, bw, 12)); // slab
      ctx.fillStyle = 'rgba(40,35,30,0.25)';
      ctx.fillRect(bx, y0 + S * 0.78 + 12, bw, 9);
      grille(ctx, bx, y0 + S * 0.5, bw, S * 0.28, iron);
      if (floor !== 1) acUnit(ctx, x0 + S * 0.84, y0 + S * 0.2 + (floor % 2) * 20, S * 0.12, S * 0.09);
      if (floor === 1) sign(ctx, x0 + S * 0.02, y0 + S * 0.08, S * 0.17, 2 * S - S * 0.14, '#c23a2e', '#f6e9b8', true);
    }
    // 2: chuồng cọp cage (green / grey bars) over a recessed front with laundry, untinted plaster
    {
      const x0 = 2 * S;
      const [cx, cw, cy, ch] = [x0 + S * 0.1, S * 0.8, y0 + S * 0.08, S * 0.84];
      ctx.fillStyle = 'rgba(0,0,0,0.14)';
      ctx.fillRect(cx, cy, cw, ch);
      const [wx, ww, wy, wh] = [cx + cw * 0.25, cw * 0.5, cy + ch * 0.1, ch * 0.55];
      paint(ctx, '#e4ded2', A_TRIM, rect(wx - 5, wy - 5, ww + 10, wh + 10));
      glass(ctx, wx, wy, ww, wh, rand, glassHue);
      const laundry = ['#d04a4a', '#4a6fd0', '#f0f0ec', '#e9c84a', '#6fb06a'];
      for (let k = 0; k < 3; k++) paint(ctx, laundry[(k + floor) % laundry.length]!, A_TRIM, rect(cx + 14 + k * 28 + rand() * 6, cy + ch * 0.52 + rand() * 8, 16, 26));
      paint(ctx, '#d0ccc2', A_TRIM, rect(cx - 4, cy + ch - 6, cw + 8, 8)); // cage floor slab
      const bar = floor % 2 ? '#474c50' : '#3b6b4a';
      paint(ctx, bar, A_TRIM, rect(cx, cy, cw, 5));
      for (let xx = cx; xx <= cx + cw - 2; xx += 16) paint(ctx, bar, A_TRIM, rect(xx, cy, 3, ch));
      for (let yy = cy + 18; yy < cy + ch - 4; yy += 18) paint(ctx, bar, A_TRIM, rect(cx, yy, cw, 2));
    }
    // 3: French window, brown shutters (one closed on odd floors), cream surround, concrete sunshade
    {
      const x0 = 3 * S;
      const [wx, ww, wy, wh] = [x0 + S * 0.34, S * 0.32, y0 + S * 0.16, S * 0.64];
      paint(ctx, '#efe9dc', A_TRIM, rect(wx - 8, wy - 8, ww + 16, wh + 8));
      paint(ctx, '#efe9dc', A_TRIM, rect(wx - 14, wy + wh, ww + 28, 7));
      glass(ctx, wx, wy, ww, wh, rand, glassHue);
      paint(ctx, '#f3efe6', A_TRIM, rect(wx + ww / 2 - 2, wy, 4, wh));
      paint(ctx, '#f3efe6', A_TRIM, rect(wx, wy + wh * 0.4, ww, 4));
      const sw = ww * 0.5;
      shutter(ctx, wx - 8 - sw, wy - 3, sw, wh + 3, '#6e4b36', '#503424');
      if (floor % 2) shutter(ctx, wx + ww / 2, wy - 3, sw, wh + 3, '#6e4b36', '#503424');
      else shutter(ctx, wx + ww + 8, wy - 3, sw, wh + 3, '#6e4b36', '#503424');
      sunshade(ctx, wx - sw - 18, wy - 22, ww + 2 * sw + 36);
      if (floor === 2) acUnit(ctx, x0 + S * 0.06, y0 + S * 0.5, S * 0.12, S * 0.09);
    }
    // 4: wide aluminium window under a sunshade, AC unit, a horizontal sign on floor 0
    {
      const x0 = 4 * S;
      const [wx, ww, wy, wh] = [x0 + S * 0.18, S * 0.56, y0 + S * 0.26, S * 0.46];
      paint(ctx, '#c9ccd0', A_TRIM, rect(wx - 6, wy - 6, ww + 12, wh + 12));
      glass(ctx, wx, wy, ww, wh, rand, [0, 8, 16]);
      paint(ctx, '#c9ccd0', A_TRIM, rect(wx + ww / 2 - 3, wy, 6, wh));
      if (floor % 2 === 0) paint(ctx, '#d9d2c0', A_GLASS, rect(wx + 6, wy + 6, ww * 0.3, wh - 12));
      sunshade(ctx, wx - 16, wy - 24, ww + 32);
      if (floor !== 3) acUnit(ctx, x0 + S * 0.8, y0 + S * 0.56, S * 0.14, S * 0.1);
      if (floor === 0) sign(ctx, x0 + S * 0.08, y0 + S * 0.03, S * 0.84, S * 0.17, '#2a5ea6', '#f2d24a', false);
    }
    // 5: balcony with a solid balustrade and plants, brown-framed window, untinted pale pink plaster
    {
      const x0 = 5 * S;
      const [wx, ww, wy, wh] = [x0 + S * 0.28, S * 0.44, y0 + S * 0.12, S * 0.5];
      paint(ctx, '#7a5a40', A_TRIM, rect(wx - 7, wy - 7, ww + 14, wh + 7));
      glass(ctx, wx, wy, ww, wh, rand, glassHue);
      paint(ctx, '#7a5a40', A_TRIM, rect(wx + ww / 2 - 2, wy, 4, wh));
      const [bx, bw] = [x0 + S * 0.06, S * 0.88];
      paint(ctx, '#d8d3c8', A_TRIM, rect(bx, y0 + S * 0.78, bw, 12)); // slab
      ctx.fillStyle = 'rgba(40,35,30,0.25)';
      ctx.fillRect(bx, y0 + S * 0.78 + 12, bw, 9);
      paint(ctx, floor % 2 ? '#e3ded3' : '#d9e2d8', A_TRIM, rect(bx + 4, y0 + S * 0.6, bw - 8, S * 0.18)); // balustrade
      paint(ctx, '#f0ece4', A_TRIM, rect(bx + 2, y0 + S * 0.6 - 5, bw - 4, 5));
      for (let k = 0; k < 3; k++) {
        const px = bx + bw * (0.2 + k * 0.3) + rand() * 10;
        paint(ctx, k === 1 ? '#5f9a44' : '#4a7f3a', A_TRIM, (q) => q.ellipse(px, y0 + S * 0.56 - rand() * 6, 13 + rand() * 6, 10 + rand() * 5, 0, 0, Math.PI * 2));
      }
      if (floor === 1) acUnit(ctx, x0 + S * 0.08, y0 + S * 0.16, S * 0.12, S * 0.09);
    }
    // 6: French arched window, white moulding + keystone, tall green shutters, pilasters at the bay edges, string course
    {
      const x0 = 6 * S;
      const white = '#f3efe6';
      paint(ctx, white, A_TRIM, rect(x0, y0, 14, S)); // pilasters
      paint(ctx, white, A_TRIM, rect(x0 + S - 14, y0, 14, S));
      paint(ctx, white, A_TRIM, rect(x0, y0 + S * 0.9, S, 10)); // string course
      const [wx, ww, wy, wh] = [x0 + S * 0.36, S * 0.28, y0 + S * 0.16, S * 0.66];
      const arch = (dx: number, dy: number) => (q: CanvasRenderingContext2D) => {
        q.moveTo(wx - dx, wy + wh + dy);
        q.lineTo(wx - dx, wy + ww / 2);
        q.arc(wx + ww / 2, wy + ww / 2, ww / 2 + dx, Math.PI, 0);
        q.lineTo(wx + ww + dx, wy + wh + dy);
        q.closePath();
      };
      paint(ctx, white, A_TRIM, arch(12, 8));
      glass(ctx, wx, wy, ww, wh, rand, glassHue, arch(0, 0));
      paint(ctx, white, A_TRIM, rect(wx + ww / 2 - 2, wy + ww / 2, 4, wh - ww / 2));
      paint(ctx, white, A_TRIM, rect(wx, wy + wh * 0.45, ww, 4));
      paint(ctx, white, A_TRIM, rect(wx + ww / 2 - 7, wy - 14, 14, 20)); // keystone
      const [g, gd] = floor % 2 ? ['#3f6b4e', '#2d4f38'] : ['#2f5f5a', '#214743'];
      shutter(ctx, wx - 12 - S * 0.16, wy + ww / 2 - 4, S * 0.16, wh - ww / 2 + 12, g, gd);
      if (floor === 1) shutter(ctx, wx + ww / 2, wy + ww / 2 - 4, ww / 2, wh - ww / 2 + 4, g, gd);
      else shutter(ctx, wx + ww + 12, wy + ww / 2 - 4, S * 0.16, wh - ww / 2 + 12, g, gd);
      paint(ctx, white, A_TRIM, rect(wx - 20, wy + wh + 8, ww + 40, 8)); // sill
    }
    // 7: arched door onto a balcony with a white balustrade, ochre-banded plaster (tinted), corner quoins
    {
      const x0 = 7 * S;
      const white = '#f3efe6';
      for (let yy = y0 + 10; yy < y0 + S * 0.9; yy += 34) paint(ctx, white, A_TRIM, rect(x0, yy, 10, 20)); // quoins
      const [wx, ww, wy, wh] = [x0 + S * 0.34, S * 0.32, y0 + S * 0.1, S * 0.72];
      const arch = (dx: number, dy: number) => (q: CanvasRenderingContext2D) => {
        q.moveTo(wx - dx, wy + wh + dy);
        q.lineTo(wx - dx, wy + ww / 2);
        q.arc(wx + ww / 2, wy + ww / 2, ww / 2 + dx, Math.PI, 0);
        q.lineTo(wx + ww + dx, wy + wh + dy);
        q.closePath();
      };
      paint(ctx, white, A_TRIM, arch(10, 0));
      glass(ctx, wx, wy, ww, wh, rand, glassHue, arch(0, 0));
      paint(ctx, '#5a3f2c', A_TRIM, rect(wx + ww / 2 - 3, wy + ww / 2, 6, wh - ww / 2)); // door leaves
      paint(ctx, '#5a3f2c', A_TRIM, rect(wx, wy + wh * 0.5, ww, 5));
      if (floor % 2) paint(ctx, '#3f6b4e', A_TRIM, rect(wx - 10 - S * 0.14, wy + ww / 2, S * 0.14, wh - ww / 2)); // one shutter
      const [bx, bw] = [x0 + S * 0.12, S * 0.76];
      paint(ctx, '#e4ded0', A_TRIM, rect(bx - 6, y0 + S * 0.84, bw + 12, 10)); // slab
      ctx.fillStyle = 'rgba(40,35,30,0.3)';
      ctx.fillRect(bx - 6, y0 + S * 0.84 + 10, bw + 12, 10);
      paint(ctx, white, A_TRIM, rect(bx, y0 + S * 0.62, bw, 6)); // balustrade rails
      paint(ctx, white, A_TRIM, rect(bx, y0 + S * 0.8, bw, 5));
      for (let xx = bx + 6; xx < bx + bw - 4; xx += 14) paint(ctx, white, A_TRIM, (q) => q.ellipse(xx + 4, y0 + S * 0.74, 5, 10, 0, 0, Math.PI * 2));
      if (floor === 2) acUnit(ctx, x0 + S * 0.04, y0 + S * 0.2, S * 0.11, S * 0.08);
    }
  }
  paint(ctx, '#5a5d60', A_TRIM, rect(4 * S + S * 0.955, 0, 6, H)); // drain pipe down column 4
  return c;
}

/** Khu tập thể (socialist-era slab) / concrete-grid tower, 4 bays × 2 floors (256 px cells): grey-cream stucco with rain
 *  streaks (× the vertex tint), a slab line per floor, small regular windows under concrete sunshades; per bay: 0 plain,
 *  1 loggia behind a grille, 2 window with an AC unit and a laundry line, 3 window with a steel cage. */
function tenementCanvas() {
  const S = 256;
  const [W, H] = [4 * S, 2 * S];
  const [c, ctx] = canvas(W, H);
  const rand = rng(31);
  ctx.fillStyle = '#dcd8cf';
  ctx.fillRect(0, 0, W, H);
  speckle(ctx, W, H, 2000, rand);
  const iron = '#4b5054';
  for (let row = 0; row < 2; row++) {
    const y0 = row * S;
    for (let col = 0; col < 4; col++) weather(ctx, col * S, y0, S, rand);
    ctx.fillStyle = 'rgba(60,55,50,0.18)'; // floor slab
    ctx.fillRect(0, y0 + S * 0.92, W, S * 0.08);
    paint(ctx, '#cfcbc2', A_TRIM, rect(0, y0 + S * 0.91, W, 4));
    for (let col = 0; col < 4; col++) {
      const x0 = col * S;
      ctx.fillStyle = 'rgba(0,0,0,0.05)'; // pier shadow at the bay edge
      ctx.fillRect(x0, y0, 6, S);
      if (col === 0) { // stair core: a tall 'hoa gió' concrete lattice strip (dark cells) with a drain pipe beside it
        const [lx, lw, ly, lh] = [x0 + S * 0.3, S * 0.4, y0 + S * 0.08, S * 0.8];
        paint(ctx, '#bfb9ac', A_TRIM, rect(lx - 6, ly - 6, lw + 12, lh + 12));
        for (let yy = ly; yy < ly + lh - 8; yy += 16) for (let xx = lx; xx < lx + lw - 8; xx += 16) paint(ctx, '#3a3632', A_GLASS, rect(xx + 3, yy + 3, 10, 10));
        paint(ctx, '#5a5d60', A_TRIM, rect(x0 + S * 0.85, y0, 6, S));
        continue;
      }
      if (col === 1) { // loggia: recessed bay, grille over its lower half
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(x0 + S * 0.12, y0 + S * 0.08, S * 0.76, S * 0.84);
        const [wx, ww, wy, wh] = [x0 + S * 0.3, S * 0.4, y0 + S * 0.16, S * 0.4];
        paint(ctx, '#c9ccd0', A_TRIM, rect(wx - 5, wy - 5, ww + 10, wh + 10));
        glass(ctx, wx, wy, ww, wh, rand, [0, 8, 16]);
        paint(ctx, row ? '#d04a4a' : '#4a6fd0', A_TRIM, rect(x0 + S * 0.16, y0 + S * 0.58, 16, 24)); // laundry
        paint(ctx, '#f0f0ec', A_TRIM, rect(x0 + S * 0.16 + 24, y0 + S * 0.6, 14, 22));
        grille(ctx, x0 + S * 0.12, y0 + S * 0.6, S * 0.76, S * 0.32, iron, 10);
        continue;
      }
      const [wx, ww, wy, wh] = [x0 + S * 0.25, S * 0.5, y0 + S * 0.3, S * 0.42];
      paint(ctx, '#c9ccd0', A_TRIM, rect(wx - 6, wy - 6, ww + 12, wh + 12)); // aluminium frame
      glass(ctx, wx, wy, ww, wh, rand, [0, 8, 16]);
      paint(ctx, '#c9ccd0', A_TRIM, rect(wx + ww / 2 - 3, wy, 6, wh));
      if ((col + row) % 2) paint(ctx, '#d9d2c0', A_GLASS, rect(wx + 6, wy + 6, ww * 0.35, wh - 12)); // curtain
      sunshade(ctx, wx - 18, wy - 24, ww + 36);
      if (col === 2) {
        acUnit(ctx, wx + ww + 10, wy + wh - 20, S * 0.14, S * 0.1);
        paint(ctx, '#777', A_TRIM, rect(x0 + S * 0.08, wy + wh + 20, S * 0.84, 2)); // laundry line
        const cols = ['#d04a4a', '#4a6fd0', '#f0f0ec', '#e9c84a'];
        for (let k = 0; k < 4; k++) paint(ctx, cols[(k + row) % 4]!, A_TRIM, rect(x0 + S * (0.12 + k * 0.2), wy + wh + 22, 14, 20 + rand() * 8));
      }
      if (col === 3) {
        paint(ctx, iron, A_TRIM, rect(wx - 14, wy - 14, ww + 28, 5));
        paint(ctx, iron, A_TRIM, rect(wx - 14, wy + wh + 8, ww + 28, 7));
        for (let x = wx - 14; x <= wx + ww + 14; x += 12) paint(ctx, iron, A_TRIM, rect(x, wy - 14, 3, wh + 29));
        paint(ctx, iron, A_TRIM, rect(wx - 14, wy + wh * 0.5, ww + 28, 2));
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

/** 4 Hà Nội shop fronts, full band height (4.5 m), ground at the bottom: narrow plaster piers (masked tint) with a plinth, a
 *  sign board the full plot width (saturated ground, white / yellow lettering bars, no text) over a rolled-up shutter box,
 *  then the opening: 0 open, shelves of goods inside; 1 open under a striped tarpaulin awning, glass door; 2 closed
 *  corrugated roller shutter (cửa cuốn); 3 open, shutter half down, goods on a table. Interiors are glass alpha (night glow). */
function shopCanvas() {
  const W = 256;
  const H = 384;
  const [c, ctx] = canvas(4 * W, H);
  const rand = rng(23);
  ctx.fillStyle = '#efece6';
  ctx.fillRect(0, 0, 4 * W, H);
  speckle(ctx, 4 * W, H, 500, rand);
  const boards = [['#c8322a', '#fbf3dc'], ['#1f5fa8', '#f7f0d4'], ['#e2b52c', '#c0271f'], ['#2a8a4a', '#fbf7e8']]; // red, blue, yellow, green
  const goods = ['#b85a50', '#5a6fa8', '#c9ad58', '#7a9a68', '#d9d6cc', '#c08a5a', '#8a7aa0', '#a09a8a'];
  for (let k = 0; k < 4; k++) {
    const x0 = k * W;
    const [fx, fw] = [x0 + W * 0.04, W * 0.92];
    sign(ctx, fx - 4, H * 0.02, fw + 8, H * 0.2, boards[k]![0]!, boards[k]![1]!, false);
    paint(ctx, '#6d7175', A_TRIM, rect(fx - 2, H * 0.22, fw + 4, H * 0.06)); // rolled shutter box
    paint(ctx, '#55595c', A_TRIM, rect(fx - 2, H * 0.27, fw + 4, 3));
    const [oy, oh] = [H * 0.28, H * 0.66];
    if (k === 2) { // closed corrugated roller shutter, a wicket door
      paint(ctx, '#8a949c', A_TRIM, rect(fx + 2, oy, fw - 4, oh));
      for (let y = oy + 3; y < oy + oh; y += 7) paint(ctx, '#6f7a84', A_TRIM, rect(fx + 2, y, fw - 4, 2));
      paint(ctx, '#5f6870', A_TRIM, rect(fx + fw * 0.62, oy + oh * 0.3, fw * 0.3, oh * 0.7));
      ctx.fillStyle = 'rgba(40,35,30,0.25)';
      ctx.fillRect(fx + 2, oy + oh, fw - 4, 5);
      continue;
    }
    // open front: dim interior, shelf lines, goods
    const gr = ctx.createLinearGradient(0, oy, 0, oy + oh);
    gr.addColorStop(0, '#6e6250');
    gr.addColorStop(1, '#2f2a24');
    paint(ctx, gr, A_GLASS, rect(fx + 4, oy, fw - 8, oh));
    for (let y = oy + oh * 0.3; y < oy + oh * 0.9; y += oh * 0.2) paint(ctx, '#9a8a6a', A_GLASS, rect(fx + 10, y, fw - 20, 3)); // shelves
    for (let y = oy + oh * 0.3 - 22; y < oy + oh * 0.9; y += oh * 0.2) { // goods on each shelf
      for (let x = fx + 14; x < fx + fw - 24; x += 18 + rand() * 14) paint(ctx, goods[Math.floor(rand() * goods.length)]!, A_GLASS, rect(x, y + rand() * 4, 9 + rand() * 10, 14 + rand() * 7));
    }
    if (k === 1) { // striped tarpaulin awning + a glass door on the right
      for (let i = 0; i < 10; i++) paint(ctx, i % 2 ? '#eef0ee' : '#2f6fb0', A_TRIM, rect(fx + (i * fw) / 10, H * 0.26, fw / 10 + 1, H * 0.09));
      ctx.fillStyle = 'rgba(20,20,30,0.3)';
      ctx.fillRect(fx, H * 0.35, fw, 8);
      paint(ctx, '#c9ccd0', A_TRIM, rect(fx + fw * 0.68, oy + oh * 0.2, 5, oh * 0.8)); // door frame
      paint(ctx, '#c9ccd0', A_TRIM, rect(fx + fw * 0.68, oy + oh * 0.2, fw * 0.3, 5));
    }
    if (k === 3) { // shutter half down, a table of goods in front
      paint(ctx, '#8a949c', A_TRIM, rect(fx + 2, oy, fw - 4, oh * 0.32));
      for (let y = oy + 3; y < oy + oh * 0.32; y += 7) paint(ctx, '#6f7a84', A_TRIM, rect(fx + 2, y, fw - 4, 2));
      paint(ctx, '#c9a66a', A_TRIM, rect(fx + fw * 0.1, oy + oh * 0.7, fw * 0.5, 4));
      for (let x = fx + fw * 0.12; x < fx + fw * 0.58; x += 14) paint(ctx, goods[Math.floor(rand() * goods.length)]!, A_TRIM, rect(x, oy + oh * 0.7 - 16, 10, 16));
      paint(ctx, '#8a6a46', A_TRIM, rect(fx + fw * 0.12, oy + oh * 0.7 + 4, 4, oh * 0.28));
      paint(ctx, '#8a6a46', A_TRIM, rect(fx + fw * 0.56, oy + oh * 0.7 + 4, 4, oh * 0.28));
    }
    if (k === 0) acUnit(ctx, fx + fw * 0.78, H * 0.3, W * 0.14, W * 0.1);
  }
  ctx.fillStyle = 'rgba(70,60,50,0.45)'; // plinth
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
    wall: facadeMaterial(texture(wallCanvas(), false, [1 / 8, 0.25]), true, 0.9),
    tenement: facadeMaterial(texture(tenementCanvas(), false, [0.25, 0.5]), true, 0.85),
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
