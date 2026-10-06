// Leg 2 landmark group mf2 (docs/plans/leg2-landmarks.md §4): Macau Tower + Grand Lisboa, built in code from the OSM
// outlines (no downloads). Tunables: config landmarks.mf2 (published figures cited there). Night: 'neon' buckets only
// (unlit MeshBasic, HDR vertex colour × lighting.emissiveScale → bloom); the chunk worker cannot tell day from night,
// so they are on by day as well. Colliders: shaft / fin feet / podium / tower-foot prisms only (SPEC §5.9).
//   macau-tower: the record carrying the mast parts (h ≥ 290) = the tower (shaft, 8 flared fins, pod with a glass
//     observation band, Skywalk ring, mast, lit rings + beacon); the big outline = the convention centre (glass box,
//     floor slabs, roof-edge LED); the duplicate pod ring and the chunk-border sliver = nothing.
//   grand-lisboa (from the user's frontal photo): the tall record = the tower (gold shaft with a waist and dark floor bands,
//     lotus crown of 5 stepped rows × 12 two-sided curved petals with lit edges, sign ring, sphere + mast); the other = the
//     podium (squashed-sphere dome on the outline with a diamond lattice: gold / white / teal cells, lit ribs, red accents;
//     two stepped towers at its E / W ends; tent + fin entrance, walkable).
import { landmarks as L, lighting as LT } from '../../config.ts';
import { type BuildingRec, type LandmarkId, type PartRec, ringArea, type XZ } from '../../geo/chunkData.ts';
import { ringCentroid } from '../../geo/clip.ts';
import type { BuildOut, MaterialId } from '../buildTypes.ts';
import { type MeshBuffer, offsetPolyline, triangulate, type V3 } from '../geom.ts';
import type { DetailFn, Helpers, LandmarkCtx } from './index.ts';
import { cross, dot, footprintFrame, loft, quadOut, square, sub, triOut } from './kit.ts';
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

const unit = (v: V3): V3 => {
  const l = Math.hypot(v[0], v[1], v[2]);
  return l > 1e-9 ? [v[0] / l, v[1] / l, v[2] / l] : [0, 1, 0];
};
const add = (p: V3, d: V3, k = 1): V3 => [p[0] + d[0] * k, p[1] + d[1] * k, p[2] + d[2] * k];
const mod = (x: number, m: number) => ((x % m) + m) % m;

/** Distance from (cx, cz) to the ring along azimuth λ (x = cos λ, z = sin λ); 0 when the ray misses. */
export function radialAt(ring: XZ, cx: number, cz: number, lam: number): number {
  const [dx, dz] = [Math.cos(lam), Math.sin(lam)];
  let best = Infinity;
  for (let i = 0, n = ring.length; i < n; i += 2) {
    const [ax, az] = [ring[i]! - cx, ring[i + 1]! - cz];
    const [ex, ez] = [ring[(i + 2) % n]! - cx - ax, ring[(i + 3) % n]! - cz - az];
    const den = dx * ez - dz * ex;
    if (Math.abs(den) < 1e-12) continue;
    const [t, s] = [(ax * ez - az * ex) / den, (ax * dz - az * dx) / den];
    if (t > 0 && s >= 0 && s <= 1) best = Math.min(best, t);
  }
  return Number.isFinite(best) ? best : 0;
}

/** Lotus petal at height share v (0 base … 1 tip): [angular half-width share (a bit narrower at the foot, full from 0.3,
 *  sharp ogive point from 0.8), flare share (leaves the shaft fast and keeps opening outwards to the tip: widest at the tip)]. */
export function petalShape(v: number): [number, number] {
  const x = (v - 0.8) / 0.2;
  const w = v < 0.3 ? 0.55 + 0.45 * Math.sin((Math.PI / 2) * (v / 0.3)) : v < 0.8 ? 1 : Math.max(0, 1 - x) ** 0.8;
  return [Math.max(0.03, w), 1 - (1 - v) ** 1.6];
}

type Paint = readonly [MeshBuffer, V3];
/** Two-sided smooth sheet over a grid of points (rows × cols): the front (normals away from (cx, cz)) in horizontal
 *  stripes cycling through `cf` (buffer + colour, one per grid row), the back in cb. Returns the front normals. */
function sheet(grid: V3[][], cx: number, cz: number, cf: Paint[], cb: Paint): V3[][] {
  const nr = grid.length;
  const nc = grid[0]!.length;
  const N = grid.map((row, a) =>
    row.map((p, b) => {
      const dv = sub(grid[Math.min(nr - 1, a + 1)]![b]!, grid[Math.max(0, a - 1)]![b]!);
      const dt = sub(row[Math.min(nc - 1, b + 1)]!, row[Math.max(0, b - 1)]!);
      const n = unit(cross(dt, dv));
      const out: V3 = [p[0] - cx, 0, p[2] - cz];
      return dot(n, out) >= 0 ? n : ([-n[0], -n[1], -n[2]] as V3);
    }),
  );
  for (const sgn of [1, -1]) {
    for (let a = 0; a + 1 < nr; a++) {
      const [buf, col] = sgn > 0 ? cf[a % cf.length]! : cb;
      buf.color = col;
      const id = [a, a + 1].map((r) => grid[r]!.map((p, b) => buf.vertex(p[0], p[1], p[2], sgn * N[r]![b]![0], sgn * N[r]![b]![1], sgn * N[r]![b]![2], 0, 0)));
      for (let b = 0; b + 1 < nc; b++) {
        const [p, q, r] = [grid[a]![b]!, grid[a + 1]![b]!, grid[a]![b + 1]!];
        const flip = dot(cross(sub(r, p), sub(q, p)), N[a]![b]!) * sgn < 0;
        const [i00, i10, i01, i11] = [id[0]![b]!, id[1]![b]!, id[0]![b + 1]!, id[1]![b + 1]!];
        if (flip) buf.face(i00, i10, i11), buf.face(i00, i11, i01);
        else buf.face(i00, i11, i10), buf.face(i00, i01, i11);
      }
    }
  }
  return N;
}

/** Flat strip of width w along a → b, lifted along the unit normal `out`, facing it. */
function strip(b: MeshBuffer, p: V3, q: V3, out: V3, w: number, lift: number) {
  const side = unit(cross(out, sub(q, p)));
  const o = (x: V3, k: number) => add(add(x, out, lift), side, k);
  quadOut(b, o(p, -w / 2), o(q, -w / 2), o(q, w / 2), o(p, w / 2), out);
}

function lisboaTower(rec: BuildingRec, ctx: LandmarkCtx): BuildOut {
  const s = new Sink();
  const rings = partRings(rec);
  if (!rings) return EMPTY;
  const f = footprintFrame(rings[0]!);
  const g = ctx.ground;
  const yb = ctx.minGround - L.sink;
  const [n, C, K] = [G.segments, G.colours, G.crown];
  const sh = (y: number, k: 1 | 2) => keyed(G.shaft.map((r) => [r[0], r[k]] as const), y);
  /** Plan point at angle θ (0 = the long axis), × half-sizes (su, sw), absolute y. */
  const P = (th: number, su: number, sw: number, y: number): V3 => {
    const [u, w] = [f.a * su * Math.cos(th), f.b * sw * Math.sin(th)];
    return [f.cx + u * f.ux - w * f.uz, y, f.cz + u * f.uz + w * f.ux];
  };
  const shaftRing = (y: number, grow = 0, yy = y): V3[] =>
    ellipse(f.cx, f.cz, f.a * sh(yy - g, 1) + grow, f.b * sh(yy - g, 2) + grow, y, n, f.ux, f.uz);

  // shaft + core: gold glass, a dark floor band every bandEvery floors (lit line on it below the crown); the core inside the crown is darker
  const top = g + G.coreTop;
  const crown0 = g + K.rows[0]![0];
  const pitch = G.floor * G.bandEvery;
  for (let y = g; y < top - 1e-6; y += pitch) {
    const [y1, yB] = [Math.min(top, y + pitch), y + G.bandH];
    loft(paint(s, 'masonry', rgb(C.band)), [shaftRing(y === g ? yb : y, 0, y), shaftRing(yB)]);
    loft(paint(s, 'metal', rgb(y >= crown0 ? C.core : C.gold)), [shaftRing(yB), shaftRing(y1)]);
    if (y < crown0) loft(paint(s, 'neon', glow(C.line, G.lineIntensity)), [shaftRing(yB - 0.35, 0.08), shaftRing(yB, 0.08)]);
  }
  disc(paint(s, 'masonry', rgb(C.band)), shaftRing(top), 1);

  // lotus crown: rows of petals, each row offset by half a petal, starting higher and opening wider (stepped vase), so its
  // foot hides behind the row below and the crown is widest at the top; it overhangs the OSM rectangle (no collider there)
  const step = TAU / K.petals;
  K.rows.forEach(([y0, y1, flare], k) => {
    const [bu, bw] = [sh(y0, 1) * 1.01, sh(y0, 2) * 1.01];
    for (let i = 0; i < K.petals; i++) {
      const th = step * (i + (k % 2) / 2);
      // ears: higher tips towards the long-axis ends; notch: the top row dips on the broad faces (V over the sign / spire)
      const notch = k === K.rows.length - 1 ? K.notch * Math.abs(Math.sin(th)) ** 12 : 0;
      const tipY = y1 + K.ears * Math.cos(th) ** 2 - notch;
      const grid = Array.from({ length: K.vSteps + 1 }, (_, a) => {
        const v = a / K.vSteps;
        const [hw, fl] = petalShape(v);
        const [su, sw] = [bu + (flare - bu) * fl, bw + (flare * K.deep - bw) * fl];
        return Array.from({ length: K.tSteps + 1 }, (_, b) => {
          const t = (2 * b) / K.tSteps - 1;
          const c = 1 - K.cup * t * t + (i % 2) * 0.004;
          return P(th + t * hw * K.width * step, su * c, sw * c, g + y0 + (tipY - y0) * v);
        });
      });
      const N = sheet(grid, f.cx, f.cz, [[s.buf('metal'), rgb(C.gold)], [s.buf('neon'), glow(C.line, G.stripeIntensity)]], [s.buf('metal'), rgb(C.petalIn)]);
      // lit strips along both long edges of the petal
      const lit = paint(s, 'neon', glow(C.edge, G.edgeIntensity));
      for (const b of [0, K.tSteps]) {
        const inward = b === 0 ? 1 : -1;
        for (let a = Math.ceil(K.edge.from * K.vSteps); a < K.vSteps; a++) {
          const [p, q] = [grid[a]![b]!, grid[a + 1]![b]!];
          const nn = N[a]![b]!;
          const side = unit(sub(grid[a]![b + inward]!, p));
          const o = (x: V3, k2: number) => add(add(x, nn, K.edge.lift), side, k2);
          quadOut(lit, o(p, 0), o(q, 0), o(q, K.edge.width), o(p, K.edge.width), nn);
        }
      }
    }
  });

  // sign ring at the crown top, spire = small sphere + mast, lit ring on the sphere
  loft(paint(s, 'neon', glow(C.sign, G.signIntensity)), [shaftRing(top + G.signY[0], 0.3, top), shaftRing(top + G.signY[1], 0.3, top)]);
  revolve(paint(s, 'metal', rgb(C.spire)), f.cx, f.cz, G.spire.map(([y, r]) => [top + y, r] as const), 12);
  const eq = G.spire.reduce((m, p) => (p[1] > m[1] ? p : m));
  band(paint(s, 'neon', glow(C.sign, G.signIntensity)), f.cx, f.cz, eq[1] + 0.1, top + eq[0] - 0.4, top + eq[0] + 0.4, 12);
  s.prism([ellipse(f.cx, f.cz, f.a * sh(0, 1), f.b * sh(0, 2), 0, 12, f.ux, f.uz).flatMap((p) => [p[0], p[2]])], yb, g + G.dome.top);
  return s.out();
}

function lisboaPodium(rec: BuildingRec, ctx: LandmarkCtx): BuildOut {
  const s = new Sink();
  const rings = partRings(rec);
  if (!rings) return EMPTY;
  const o = rings[0]!;
  const [cx, cz] = ringCentroid(o);
  const g = ctx.ground;
  const yb = ctx.minGround - L.sink;
  const [D, C] = [G.dome, G.colours];
  const [N, R] = [D.cells, D.rows];

  // squashed sphere over the outline: radius per half-cell azimuth = fit × the outline's, foot at `base` of it on the ground
  const rad = Array.from({ length: 2 * N }, (_, h) => Math.max(1, radialAt(o, cx, cz, (Math.PI * h) / N) * D.fit));
  const [phi0, phiT] = [-Math.acos(D.base), (D.capDeg * Math.PI) / 180];
  const cv = D.top / (1 + Math.sqrt(1 - D.base * D.base)); // vertical semi-axis: foot on the ground, top at D.top
  const yc = g + cv * Math.sqrt(1 - D.base * D.base);
  const lat = (r: number) => phi0 + ((phiT - phi0) * r) / R;
  const V = (r: number, h: number): V3 => {
    const [l, rr, p] = [(Math.PI * h) / N, rad[mod(h, 2 * N)]!, lat(r)];
    return [cx + Math.cos(l) * rr * Math.cos(p), yc + cv * Math.sin(p), cz + Math.sin(l) * rr * Math.cos(p)];
  };
  const Nrm = (r: number, h: number): V3 => {
    const [l, rr, p] = [(Math.PI * h) / N, rad[mod(h, 2 * N)]!, lat(r)];
    return unit([(Math.cos(l) * Math.cos(p)) / rr, Math.sin(p) / cv, (Math.sin(l) * Math.cos(p)) / rr]);
  };
  const gold = () => paint(s, 'metal', rgb(C.gold));
  const rib = () => paint(s, 'neon', glow(C.rib, G.ribIntensity));

  // diamond lattice: row r = diamonds centred on lat r, offset half a cell per row; p / q index the two diagonal families
  for (let r = 1; r < R; r++) {
    for (let j = 0; j < N; j++) {
      const hc = 2 * j + (r % 2);
      const [p, q] = [j - Math.floor(r / 2), j + Math.ceil(r / 2)];
      const [B, Rt, T, Lt, out] = [V(r - 1, hc), V(r, hc + 1), V(r + 1, hc), V(r, hc - 1), Nrm(r, hc)];
      quadOut(paint(s, 'metal', rgb(mod(q, D.whiteEvery) === 0 ? C.white : C.gold)), B, Rt, T, Lt, out);
      if (mod(p, D.ribEvery) === 0) strip(rib(), B, Rt, out, D.rib, 0.15);
      if (mod(q, D.ribEvery) === 0) strip(rib(), B, Lt, out, D.rib, 0.15);
      // inset accents: chains of teal diamonds along one diagonal family, scattered red ones (near only)
      const teal = mod(p, D.tealEvery) === 0;
      if (teal || mod(3 * p + 5 * q, 13) === 0) {
        const m: V3 = [(B[0] + T[0]) / 2, (B[1] + T[1]) / 2, (B[2] + T[2]) / 2];
        const k = (x: V3) => add(add(m, sub(x, m), teal ? 0.6 : 0.4), out, 0.12);
        const c = teal ? paint(s, 'neon', glow(C.teal, G.tealIntensity)) : paint(s, 'neon', glow(C.red, G.redIntensity), 'near');
        quadOut(c, k(B), k(Rt), k(T), k(Lt), out);
      }
    }
  }
  // half-diamonds at the foot and under the cap, the cap cone, a skirt down to the lowest ground
  const apex: V3 = [cx, g + D.top, cz];
  for (let j = 0; j < N; j++) {
    const h = 2 * j + 1;
    triOut(gold(), V(0, h), V(0, h + 2), V(1, h + 1), Nrm(0, h + 1));
    const t = 2 * j + ((R - 1) % 2);
    triOut(gold(), V(R, t), V(R, t + 2), V(R - 1, t + 1), Nrm(R, t + 1));
  }
  for (let h = 0; h < 2 * N; h++) triOut(gold(), V(R, h), V(R, h + 1), apex, Nrm(R, h));
  const foot = Array.from({ length: 2 * N }, (_, h) => V(0, h));
  loft(paint(s, 'masonry', rgb(C.band)), [foot.map((p): V3 => [p[0], yb, p[2]]), foot]);
  s.prism([foot.flatMap((p) => [p[0], p[2]])], yb, yc);

  // two stepped towers at the dome's east / west ends, a lit line on each tier top
  const F = G.flank;
  for (const l of [0, Math.PI]) {
    const d = radialAt(o, cx, cz, l) * F.at;
    const [px, pz] = [cx + Math.cos(l) * d, cz + Math.sin(l) * d];
    let y0 = yb;
    for (const [k, h] of F.tiers) {
      block(gold(), square(F.half * k, y0, px, pz), square(F.half * k, g + h, px, pz));
      loft(paint(s, 'neon', glow(C.edge, G.edgeIntensity), 'near'), [square(F.half * k + 0.06, g + h - 0.5, px, pz), square(F.half * k + 0.06, g + h, px, pz)]);
      y0 = g + h;
    }
    s.prism([square(F.half, 0, px, pz).flatMap((p) => [p[0], p[2]])], yb, g + F.tiers[0]![1]);
  }

  // entrance (no collider: walkable): tent from the dome's foot (gold top, lit soffit) + gold fins fanned out on both sides
  const K = G.canopy;
  const az = (K.azimuth * Math.PI) / 180;
  const [dx, dz] = [Math.sin(az), -Math.cos(az)];
  const re = radialAt(o, cx, cz, Math.atan2(dz, dx)) * D.fit * D.base;
  const O: V3 = [cx + dx * re, g, cz + dz * re];
  const dirAt = (deg: number, r: number, y: number): V3 => {
    const a = (deg * Math.PI) / 180;
    return [O[0] + (dx * Math.cos(a) - dz * Math.sin(a)) * r, y, O[2] + (dx * Math.sin(a) + dz * Math.cos(a)) * r];
  };
  const tip: V3 = [O[0] - dx * 2, g + K.apex, O[2] - dz * 2];
  const roof = paint(s, 'metal', rgb(C.gold), 'near');
  const soffit = paint(s, 'neon', glow(C.soffit, G.soffitIntensity), 'near');
  for (let k = 0; k < 8; k++) {
    const [a, b] = [-K.rimSpread + (2 * K.rimSpread * k) / 8, -K.rimSpread + (2 * K.rimSpread * (k + 1)) / 8];
    const [pa, pb] = [dirAt(a, K.rim, g + K.rimY), dirAt(b, K.rim, g + K.rimY)];
    triOut(roof, tip, pa, pb, [0, 1, 0]);
    triOut(soffit, add(tip, [0, -0.1, 0]), add(pa, [0, -0.1, 0]), add(pb, [0, -0.1, 0]), [0, -1, 0]);
  }
  // fins = gold leaves fanned round the door, facing out and leaning outwards (lit spine)
  const [r0, rt, ht, hw] = K.fin;
  const spine = paint(s, 'neon', glow(C.edge, G.edgeIntensity), 'near');
  for (const sgn of [-1, 1]) {
    for (let k = 0; k < K.fins; k++) {
      const a = sgn * (K.spread[0] + ((K.spread[1] - K.spread[0]) * k) / (K.fins - 1));
      const r = (a * Math.PI) / 180;
      const rad: V3 = [dx * Math.cos(r) - dz * Math.sin(r), 0, dx * Math.sin(r) + dz * Math.cos(r)];
      const tan: V3 = [-rad[2], 0, rad[0]];
      const grid = Array.from({ length: 7 }, (_, i) => {
        const v = i / 6;
        const c = dirAt(a, r0 + (rt - r0) * v * v, i ? g + ht * v : yb);
        return [-1, 0, 1].map((t) => add(add(c, tan, t * hw * petalShape(v)[0]), rad, 0.8 * Math.sin(Math.PI * v) * (1 - t * t)));
      });
      const N = sheet(grid, O[0], O[2], [[s.buf('metal', 'near'), rgb(C.gold)], [s.buf('metal', 'near'), rgb(C.stripe)]], [s.buf('metal', 'near'), rgb(C.petalIn)]);
      for (let i = 1; i < 6; i++) strip(spine, grid[i]![1]!, grid[i + 1]![1]!, N[i]![1]!, 0.35, 0.08);
    }
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
