// Leg 2 landmark group mf2 (docs/plans/leg2-landmarks.md §4): Macau Tower + Grand Lisboa, built in code from the OSM
// outlines (no downloads). Tunables: config landmarks.mf2 (published figures cited there). Night: 'neon' buckets only
// (unlit MeshBasic, HDR vertex colour × lighting.emissiveScale → bloom); the chunk worker cannot tell day from night,
// so they are on by day as well. Colliders: shaft / fin feet / podium / tower-foot prisms only (SPEC §5.9).
//   macau-tower: the record carrying the mast parts (h ≥ 290) = the tower (shaft, 8 flared fins, pod with a glass
//     observation band, Skywalk ring, mast, lit rings + beacon); the big outline = the convention centre (glass box,
//     floor slabs, roof-edge LED); the duplicate pod ring and the chunk-border sliver = nothing.
//   grand-lisboa: the tall record = the lotus-bud tower (elliptical loft, scale keys waist → bulge → tip, gold panels +
//     lit floor bands); the other = the podium (concrete walls, LED egg dome with colour bands, entrance canopy).
import { landmarks as L, lighting as LT } from '../../config.ts';
import { type BuildingRec, type LandmarkId, type PartRec, ringArea, type XZ } from '../../geo/chunkData.ts';
import { ringCentroid } from '../../geo/clip.ts';
import type { BuildOut, MaterialId } from '../buildTypes.ts';
import { type MeshBuffer, offsetPolyline, triangulate, type V3 } from '../geom.ts';
import type { DetailFn, Helpers, LandmarkCtx } from './index.ts';
import { footprintFrame, loft, quadOut, triOut } from './kit.ts';
import { parseColour, partRings, renderPart, Sink } from './parts.ts';

const T = L.mf2.tower;
const G = L.mf2.lisboa;
const EMPTY: BuildOut = { meshes: [], instances: [], colliders: [] };

/** sRGB hex → linear RGB × k (neon: k = intensity × lighting.emissiveScale = HDR). */
const rgb = (hex: string, k = 1): V3 => parseColour(hex)!.map((c) => c * k) as unknown as V3;
const glow = (hex: string, intensity: number) => rgb(hex, intensity * LT.emissiveScale);

/** Buffer of material m with its vertex colour set for what is added next. */
function paint(s: Sink, m: MaterialId, c: V3, lod?: 'near') {
  const b = s.buf(m, lod);
  b.color = c;
  return b;
}

const TAU = 2 * Math.PI;
/** Ellipse ring (ra along +X, rb along +Z) at height y, n points, optionally rotated by the frame axis (ux, uz). */
function ellipse(cx: number, cz: number, ra: number, rb: number, y: number, n: number, ux = 1, uz = 0): V3[] {
  return Array.from({ length: n }, (_, s) => {
    const [u, w] = [ra * Math.cos((TAU * s) / n), rb * Math.sin((TAU * s) / n)];
    return [cx + u * ux - w * uz, y, cz + u * uz + w * ux];
  });
}
const circle = (cx: number, cz: number, r: number, y: number, n: number) => ellipse(cx, cz, r, r, y, n);

/** Surface of revolution: profile [y, r] (any direction), closed with a disc when the last r > 0.05. */
function revolve(b: MeshBuffer, cx: number, cz: number, prof: readonly (readonly [number, number])[], n: number, close = true) {
  loft(b, prof.map(([y, r]) => circle(cx, cz, r, y, n)));
  const [y, r] = prof.at(-1)!;
  if (close && r > 0.05) disc(b, circle(cx, cz, r, y, n), 1);
}
/** Fan over a convex ring, facing up (1) or down (−1). */
function disc(b: MeshBuffer, ring: V3[], dir: 1 | -1) {
  for (let s = 1; s + 1 < ring.length; s++) triOut(b, ring[0]!, ring[s]!, ring[s + 1]!, [0, dir, 0]);
}
/** Hexahedron between two 4-point rings (bottom, top), all 6 faces. */
function block(b: MeshBuffer, lo: V3[], hi: V3[]) {
  loft(b, [lo, hi]);
  quadOut(b, hi[0]!, hi[1]!, hi[2]!, hi[3]!, [0, 1, 0]);
  quadOut(b, lo[0]!, lo[1]!, lo[2]!, lo[3]!, [0, -1, 0]);
}
/** Thin lit band around a ring profile: between y0 and y1 at radius r (+ a few cm so it sits outside the skin). */
function band(b: MeshBuffer, cx: number, cz: number, r: number, y0: number, y1: number, n: number) {
  loft(b, [circle(cx, cz, r, y0, n), circle(cx, cz, r, y1, n)]);
}
/** Flat polygon (rings with holes) at y, both faces. */
function slab(b: MeshBuffer, rings: XZ[], y: number) {
  const idx = triangulate(rings[0]!, rings.slice(1));
  const pts = rings.flat();
  const at = (i: number): V3 => [pts[2 * i]!, y, pts[2 * i + 1]!];
  for (let k = 0; k < idx.length; k += 3) {
    triOut(b, at(idx[k]!), at(idx[k + 1]!), at(idx[k + 2]!), [0, 1, 0]);
    triOut(b, at(idx[k]!), at(idx[k + 1]!), at(idx[k + 2]!), [0, -1, 0]);
  }
}
/** Closed ring offset outwards by d (offsetPolyline on the ring with wrap-around neighbours; the side with more area). */
export function outward(ring: XZ, d: number): XZ {
  const n = ring.length;
  const wrap = (s: number) => offsetPolyline(ring, s, [ring[n - 2]!, ring[n - 1]!], [ring[0]!, ring[1]!]);
  const [a, b] = [wrap(d), wrap(-d)];
  return Math.abs(ringArea(a)) >= Math.abs(ringArea(b)) ? a : b;
}
/** Piecewise interpolation (smoothstep between keys) of [y, value] keys. */
export function keyed(keys: readonly (readonly [number, number])[], y: number): number {
  if (y <= keys[0]![0]) return keys[0]![1];
  for (let k = 0; k + 1 < keys.length; k++) {
    const [[y0, v0], [y1, v1]] = [keys[k]!, keys[k + 1]!];
    if (y <= y1) {
      const t = (y - y0) / (y1 - y0 || 1);
      return v0 + (v1 - v0) * t * t * (3 - 2 * t);
    }
  }
  return keys.at(-1)![1];
}

// ── Macau Tower ──

export type TowerPiece = 'tower' | 'centre' | 'skip';
/** Which of the landmark's 4 OSM records this is (foundation report): the mast parts mark the tower, size the centre. */
export function towerPiece(rec: BuildingRec): TowerPiece {
  if (rec.parts?.some((p) => (p.height ?? 0) >= 290)) return 'tower';
  return Math.abs(ringArea(rec.outer)) > 2000 ? 'centre' : 'skip';
}

function macauTower(rec: BuildingRec, ctx: LandmarkCtx): BuildOut {
  const s = new Sink();
  const [cx, cz] = ringCentroid(rec.outer);
  const g = ctx.ground;
  const yb = ctx.minGround - L.sink;
  const n = T.segments;
  const C = T.colours;
  const Y = (y: number) => g + y;
  const shaftR = (y: number) => keyed(T.shaft, y);

  // shaft (concrete) + its collider
  const concrete = paint(s, 'masonry', rgb(C.concrete));
  revolve(concrete, cx, cz, [[yb, T.shaft[0]![1]], ...T.shaft.slice(1).map(([y, r]) => [Y(y), r] as const)], n, false);
  s.prism([circle(cx, cz, T.shaft[0]![1], 0, 12).flatMap((p) => [p[0], p[2]])], yb, Y(T.pod[0]![0]));

  // flared fins: concave tulip from the plaza (innerR…outerR) to the shaft at topY, feet get a collider
  const F = T.fins;
  for (let i = 0; i < F.count; i++) {
    const a = (TAU * (i + 0.5)) / F.count;
    const [dx, dz, tx, tz] = [Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a)];
    const ring = (y: number, r0: number, r1: number, t: number): V3[] =>
      [[r0, -t], [r1, -t], [r1, t], [r0, t]].map(([r, w]) => [cx + dx * r! + tx * w!, y, cz + dz * r! + tz * w!]);
    const midY = F.topY * 0.45;
    const rMid = shaftR(midY);
    loft(concrete, [
      ring(yb, F.innerR, F.outerR, F.thickness / 2),
      ring(Y(midY), rMid - 0.3, rMid + 0.3 + (F.outerR - F.innerR) * 0.28, F.thickness * 0.38),
      ring(Y(F.topY), shaftR(F.topY) - 0.4, shaftR(F.topY) + 0.9, F.thickness * 0.25),
    ]);
    const top = ring(Y(F.topY), shaftR(F.topY) - 0.4, shaftR(F.topY) + 0.9, F.thickness * 0.25);
    quadOut(concrete, top[0]!, top[1]!, top[2]!, top[3]!, [0, 1, 0]);
    s.prism([ring(0, F.innerR, F.outerR, F.thickness / 2).flatMap((p) => [p[0], p[2]])], yb, Y(F.colliderH));
  }

  // pod: metal skin, glass observation band, lit interior behind the glass, Skywalk terrace
  const pod = paint(s, 'masonry', rgb(C.pod));
  const glass = s.buf('glass');
  const [g0, g1] = T.glassBand;
  for (let k = 0; k + 1 < T.pod.length; k++) {
    const [[y0, r0], [y1, r1]] = [T.pod[k]!, T.pod[k + 1]!];
    const inGlass = y0 >= g0 - 1e-6 && y1 <= g1 + 1e-6;
    loft(inGlass ? glass : pod, [circle(cx, cz, r0, Y(y0), n), circle(cx, cz, r1, Y(y1), n)], inGlass ? L.glassTile : 1);
  }
  const lit = paint(s, 'neon', glow(C.glassLit, T.glassLitIntensity));
  band(lit, cx, cz, T.pod.find(([y]) => y >= g0)![1] - 0.7, Y(g0 + 0.2), Y(g1 - 0.2), n);
  disc(pod, circle(cx, cz, T.pod.find(([y]) => y >= g0)![1] - 0.6, Y(g0 + 0.1), n), -1); // floor seen through the glass
  const S = T.skywalk;
  const walkR = S.r;
  const inner = circle(cx, cz, walkR - S.width, Y(S.y), n);
  const outer = circle(cx, cz, walkR, Y(S.y), n);
  loft(pod, [circle(cx, cz, walkR, Y(S.y) - 0.5, n), outer]); // deck edge
  for (let i = 0; i < n; i++) quadOut(pod, inner[i]!, inner[(i + 1) % n]!, outer[(i + 1) % n]!, outer[i]!, [0, 1, 0]);
  for (let i = 0; i < n; i++) quadOut(pod, inner[i]!, inner[(i + 1) % n]!, outer[(i + 1) % n]!, outer[i]!, [0, -1, 0]);
  const rail = paint(s, 'metal', rgb('#c8ccd2'), 'near');
  band(rail, cx, cz, walkR - 0.1, Y(S.y) + S.railH - 0.06, Y(S.y) + S.railH, n);
  for (let i = 0; i < S.posts; i++) {
    const a = (TAU * i) / S.posts;
    const [px, pz] = [cx + (walkR - 0.15) * Math.cos(a), cz + (walkR - 0.15) * Math.sin(a)];
    block(rail, circle(px, pz, 0.05, Y(S.y), 4), circle(px, pz, 0.05, Y(S.y) + S.railH, 4));
  }

  // lit rings under / over the glass band and at the pod top; mast; beacons
  const ring = paint(s, 'neon', glow(C.ring, T.ringIntensity));
  const rMax = Math.max(...T.pod.map(([, r]) => r)) + 0.25;
  band(ring, cx, cz, rMax, Y(g0 - 0.3 - T.ringH), Y(g0 - 0.3), n);
  band(ring, cx, cz, rMax, Y(g1 + 0.3), Y(g1 + 0.3 + T.ringH), n);
  band(ring, cx, cz, keyed(T.pod, S.y + 3) + 0.25, Y(S.y + 3 - T.ringH / 2), Y(S.y + 3 + T.ringH / 2), n);
  const mast = paint(s, 'metal', rgb('#8d939a'));
  revolve(mast, cx, cz, T.mast.map(([y, r]) => [Y(y), r] as const), 12);
  const beacon = paint(s, 'neon', glow(C.beacon, T.beaconIntensity));
  const topY = T.mast.at(-1)![0];
  for (const y of [topY, T.mast[Math.floor(T.mast.length / 2)]![0]]) {
    const h = T.beaconSize;
    block(beacon, circle(cx, cz, h / 2, Y(y) - h / 2, 4), circle(cx, cz, h / 2, Y(y) + h / 2, 4));
  }
  return s.out();
}

/** Convention & entertainment centre at the foot: glass box on the OSM outline, floor slabs, roof-edge LED strip. */
function conventionCentre(rec: BuildingRec, ctx: LandmarkCtx, h: Helpers): BuildOut {
  const s = new Sink();
  const rings = partRings(rec);
  if (!rings) return EMPTY;
  const g = ctx.ground;
  const top = h.outlineTop(rec, ctx.def);
  renderPart({ ...rec, material: 'glass', roofMaterial: 'concrete' }, { ground: g, height: ctx.height, fallbackTop: top }, s);
  const slabs = paint(s, 'masonry', rgb(T.colours.concrete));
  for (let y = T.centre.floor; y < top - 1; y += T.centre.floor) slab(slabs, rings, g + y);
  const led = paint(s, 'neon', glow(T.centre.edgeColour, T.centre.edgeIntensity));
  const rim = outward(rings[0]!, 0.08);
  loft(led, [g + top - T.centre.edgeH, g + top].map((y) => Array.from({ length: rim.length / 2 }, (_, i): V3 => [rim[2 * i]!, y, rim[2 * i + 1]!])));
  return s.out();
}

// ── Grand Lisboa ──

/** Tower scale (× footprint half-sizes) at y m above ground: [long axis, short axis]. */
export function lisboaScale(y: number): [number, number] {
  const keys = (k: 0 | 1): [number, number][] => [[0, 1], [G.waistY, G.waist[k]], [G.bulgeY, G.bulge[k]], [G.tipY, G.tip[k]]];
  return [keyed(keys(0), y), keyed(keys(1), y)];
}

function lisboaTower(rec: BuildingRec, ctx: LandmarkCtx): BuildOut {
  const s = new Sink();
  const rings = partRings(rec);
  if (!rings) return EMPTY;
  const f = footprintFrame(rings[0]!);
  const g = ctx.ground;
  const yb = ctx.minGround - L.sink;
  const n = G.segments;
  const C = G.colours;
  const at = (y: number): V3[] => {
    const [su, sw] = lisboaScale(Math.max(0, y - g));
    return ellipse(f.cx, f.cz, f.a * su, f.b * sw, y, n, f.ux, f.uz);
  };
  // one 'masonry' / 'neon' buffer each (Sink): the vertex colour is set right before every use
  const panel = () => paint(s, 'masonry', rgb(C.gold));
  const lit = (tip: boolean) => paint(s, 'neon', glow(C.band, tip ? G.tipIntensity : G.bandIntensity));
  const floors = Math.ceil(G.height / G.floor);
  disc(panel(), at(yb), -1);
  for (let k = 0; k < floors; k++) {
    const y0 = k === 0 ? yb : g + k * G.floor;
    const y1 = g + Math.min(G.height, (k + 1) * G.floor);
    const yBand = y0 + G.bandShare * (y1 - y0);
    loft(lit(y1 > g + G.height - 2 * G.floor), [at(y0), at(yBand)]);
    loft(panel(), Array.from({ length: G.rows + 1 }, (_, r) => at(yBand + ((y1 - yBand) * r) / G.rows)));
  }
  disc(lit(true), at(g + G.height), 1);
  s.prism(rings, yb, g + G.podium.wallTop);
  return s.out();
}

function lisboaPodium(rec: BuildingRec, ctx: LandmarkCtx): BuildOut {
  const s = new Sink();
  const rings = partRings(rec);
  if (!rings) return EMPTY;
  const g = ctx.ground;
  const yb = ctx.minGround - L.sink;
  const P = G.podium;
  const C = G.colours;
  renderPart({ ...rec, height: P.wallTop, material: 'concrete' }, { ground: g, height: ctx.height, fallbackTop: P.wallTop }, s);
  // LED egg: quarter-ellipse dome over the walls on the footprint frame, colour bands at ledRows of its height
  const f = footprintFrame(rings[0]!);
  const n = 32;
  const H = P.domeTop - P.wallTop;
  const ringAt = (t: number, grow = 0): V3[] => {
    const k = Math.cos((t * Math.PI) / 2) * 0.97 + grow;
    return ellipse(f.cx, f.cz, f.a * k, f.b * k, g + P.wallTop + H * Math.sin((t * Math.PI) / 2), n, f.ux, f.uz);
  };
  const shell = paint(s, 'masonry', rgb(C.gold));
  loft(shell, Array.from({ length: P.domeRings + 1 }, (_, r) => ringAt(r / P.domeRings)));
  disc(shell, ringAt(1), 1);
  P.ledRows.forEach((t, i) => {
    const led = paint(s, 'neon', glow(C.led[i % C.led.length]!, G.ledIntensity));
    loft(led, [ringAt(t - 0.012, 0.006), ringAt(t + 0.012, 0.006)]);
  });
  // entrance canopy on the outline point farthest towards `azimuth`, projecting `depth` outwards, on columns
  const K = G.canopy;
  const az = (K.azimuth * Math.PI) / 180;
  const [dx, dz] = [Math.sin(az), -Math.cos(az)];
  const o = rings[0]!;
  let best = -Infinity;
  let [px, pz] = [f.cx, f.cz];
  for (let i = 0; i < o.length; i += 2) {
    const d = o[i]! * dx + o[i + 1]! * dz;
    if (d > best) [best, px, pz] = [d, o[i]!, o[i + 1]!];
  }
  const [tx, tz] = [-dz, dx];
  const corner = (u: number, w: number, y: number): V3 => [px + dx * u + tx * w, y, pz + dz * u + tz * w];
  const roof = paint(s, 'masonry', rgb(C.concrete));
  const quad = (y: number) => [corner(-1, -K.width / 2, y), corner(K.depth, -K.width / 2, y), corner(K.depth, K.width / 2, y), corner(-1, K.width / 2, y)];
  block(roof, quad(g + K.y), quad(g + K.y + K.thickness));
  const under = paint(s, 'neon', glow(C.band, G.bandIntensity * 0.5));
  loft(under, [quad(g + K.y + 0.2), quad(g + K.y + 0.6)].map((q) => q.map((p): V3 => [p[0] - (f.cx - p[0]) * 0.004, p[1], p[2] - (f.cz - p[2]) * 0.004])));
  for (let c = 0; c < K.columns; c++) {
    const w = -K.width / 2 + 1 + ((K.width - 2) * c) / (K.columns - 1);
    block(roof, [corner(K.depth - 1.3, w - 0.3, yb), corner(K.depth - 0.7, w - 0.3, yb), corner(K.depth - 0.7, w + 0.3, yb), corner(K.depth - 1.3, w + 0.3, yb)],
      [corner(K.depth - 1.3, w - 0.3, g + K.y), corner(K.depth - 0.7, w - 0.3, g + K.y), corner(K.depth - 0.7, w + 0.3, g + K.y), corner(K.depth - 1.3, w + 0.3, g + K.y)]);
  }
  return s.out();
}

export const details: Partial<Record<LandmarkId, DetailFn>> = {
  'macau-tower': (rec: BuildingRec, _parts: PartRec[], ctx: LandmarkCtx, h) => {
    const piece = towerPiece(rec);
    return piece === 'tower' ? macauTower(rec, ctx) : piece === 'centre' ? conventionCentre(rec, ctx, h) : EMPTY;
  },
  'grand-lisboa': (rec: BuildingRec, _parts: PartRec[], ctx: LandmarkCtx) => ((rec.height ?? 0) > 100 ? lisboaTower(rec, ctx) : lisboaPodium(rec, ctx)),
};
