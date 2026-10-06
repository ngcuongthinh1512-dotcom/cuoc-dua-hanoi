// Leg 2 landmark group m4 (docs/plans/leg2-landmarks.md §4, agent o4): Bank of China, Macau Cultural Centre, Kun Iam statue,
// Lotus Square (Praça Flor de Lótus), Portas do Cerco. Built in code from the OSM outlines (no downloads); tunables and the
// published figures (cited) in config landmarks.m4, estimates listed in docs/reports/leg2-landmarks-o4.md.
// Night: statues + the 1870 gate = 'neon' (unlit) with a baked floodlight (bakeFlood: the same by day, the chunk worker knows
// no time of day); glass = 'curtain' buckets with `lit` (BuildingBuilder's facade shader: lit windows at night only); light
// strips = 'neon'. No real lights. Colliders: simplified prisms only (SPEC §5.9).
//   bank-of-china: curtain shaft on the outline to the OSM height, granite diamond lattice, stepped crown, pyramid, mast.
//   cultural-centre: glazed lobby band + stone block, the auditorium block (+u = the rounded end) with the upturned roof.
//   kun-iam-statue: plinth, 16-petal lotus dome (the ecumenical centre), 20 m robed figure with sleeves, floodlight boxes.
//   praca-flor-de-lotus: the park record is not drawn; the golden lotus + its granite base + the paving at config `at`
//     (centroid of the statue outline w/192179914); that outline itself, if registered, = nothing.
//   portas-do-cerco: the small outline = the arched gate, the big one = the glass border post with a lit roof edge.
import { latLonToWorld } from '@race/shared';
import { landmarks as L, lighting as LT } from '../../config.ts';
import { type BuildingRec, type LandmarkId, ringArea, type XZ } from '../../geo/chunkData.ts';
import { ringCentroid } from '../../geo/clip.ts';
import type { BuildOut, MeshBucket } from '../buildTypes.ts';
import { MeshBuffer, mergeBuckets, triangulate, type V3 } from '../geom.ts';
import type { DetailFn, LandmarkCtx } from './index.ts';
import { arch, box, extrude, footprintFrame, type Frame, loft, place, quadOut, triOut } from './kit.ts';
import { parseColour, partRings, Sink } from './parts.ts';

const M = L.m4;
const EMPTY: BuildOut = { meshes: [], instances: [], colliders: [] };
const TAU = 2 * Math.PI;

/** sRGB hex → linear RGB × k. */
const rgb = (hex: string, k = 1): V3 => parseColour(hex)!.map((c) => c * k) as unknown as V3;
const glow = (hex: string, intensity: number) => rgb(hex, intensity * LT.emissiveScale);

/** Unit vector (x, z) of a compass azimuth (deg; 0 = north = −Z, 90 = east = +X). */
export const compass = (deg: number): [number, number] => [Math.sin((deg * Math.PI) / 180), -Math.cos((deg * Math.PI) / 180)];

/** Floodlight bake of a 'neon' bucket: base × (ambient + strength · side + top · up) × (1 − fade · height share) × k.
 *  side = horizontal part of the normal, biased towards `front` (x, z unit) when given. Same by day (unlit). */
export function bakeFlood(b: MeshBucket, base: V3, y0: number, H: number, k = 1, front?: [number, number]): MeshBucket {
  const F = M.flood;
  const c = new Float32Array(b.position.length);
  for (let i = 0; i < c.length; i += 3) {
    const [nx, ny, nz] = [b.normal[i]!, b.normal[i + 1]!, b.normal[i + 2]!];
    const side = Math.hypot(nx, nz);
    const bias = front && side > 1e-6 ? 0.55 + 0.45 * ((nx * front[0] + nz * front[1]) / side) : 1;
    const h = Math.min(1, Math.max(0, (b.position[i + 1]! - y0) / H));
    const s = (F.ambient + F.strength * side * bias + F.top * Math.max(0, ny)) * (1 - F.fade * h) * k * LT.emissiveScale;
    for (let j = 0; j < 3; j++) c[i + j] = base[j]! * s;
  }
  b.color = c;
  return b;
}

/** Sink buffer with its vertex colour set for what is added next. */
function paint(s: Sink, m: 'masonry' | 'metal' | 'neon', c: V3, lod?: 'near') {
  const b = s.buf(m, lod);
  b.color = c;
  return b;
}

/** Outward-facing walls of a ring from partRings (outer area > 0, holes < 0: (−dz, dx) points out of the solid) from y0 to
 *  y1; uv u = perimeter / bu, v = (y − vBase) / bv (curtain: bays × floors). */
export function walls(b: MeshBuffer, r: XZ, y0: number, y1: number, bu = 1, bv = 1, vBase = 0) {
  let u = 0;
  for (let i = 0, n = r.length; i < n; i += 2) {
    const [ax, az, bx, bz] = [r[i]!, r[i + 1]!, r[(i + 2) % n]!, r[(i + 3) % n]!];
    const len = Math.hypot(bx - ax, bz - az);
    quadOut(b, [ax, y0, az], [bx, y0, bz], [bx, y1, bz], [ax, y1, az], [-(bz - az), 0, bx - ax], u / bu, (y0 - vBase) / bv, (u + len) / bu, (y1 - vBase) / bv);
    u += len;
  }
}

/** Flat polygon (outer + holes) at y facing up (1) or down (−1). */
function cap(b: MeshBuffer, rings: XZ[], y: number, dir: 1 | -1) {
  const idx = triangulate(rings[0]!, rings.slice(1));
  const pts = rings.flat();
  const at = (i: number): V3 => [pts[2 * i]!, y, pts[2 * i + 1]!];
  for (let k = 0; k < idx.length; k += 3) triOut(b, at(idx[k]!), at(idx[k + 1]!), at(idx[k + 2]!), [0, dir, 0]);
}

/** Ring scaled by k about (cx, cz). */
export const scaleRing = (r: XZ, k: number, cx: number, cz: number): XZ => r.map((v, i) => (i % 2 ? cz + (v - cz) * k : cx + (v - cx) * k));

/** Ellipse ring at y: ra along (ux, uz), rb across; optional radius modulation m(θ). */
function ellipse(cx: number, cz: number, ra: number, rb: number, y: number, n: number, ux = 1, uz = 0, m = (_t: number) => 1): V3[] {
  return Array.from({ length: n }, (_, s) => {
    const t = (TAU * s) / n;
    const [u, w] = [ra * m(t) * Math.cos(t), rb * m(t) * Math.sin(t)];
    return [cx + u * ux - w * uz, y, cz + u * uz + w * ux];
  });
}
const xz = (ring: V3[]): XZ => ring.flatMap((p) => [p[0], p[2]]);
/** Fan over a convex ring, facing up (1) or down (−1). */
function disc(b: MeshBuffer, ring: V3[], dir: 1 | -1) {
  for (let s = 1; s + 1 < ring.length; s++) triOut(b, ring[0]!, ring[s]!, ring[s + 1]!, [0, dir, 0]);
}
/** Bucket list of a Sink plus extra buckets (curtain with `lit`, baked neon). */
const out = (s: Sink, extra: MeshBucket[]): BuildOut => {
  const o = s.out();
  return { ...o, meshes: mergeBuckets([...o.meshes, ...extra]) };
};
/** Local frame (x along u, z along w) → world xz. */
const toWorld = (f: Frame, x: number, z: number): [number, number] => [f.cx + x * f.ux - z * f.uz, f.cz + x * f.uz + z * f.ux];
/** Collider box in a frame's local coordinates. */
function framePrism(s: Sink, f: Frame, x0: number, x1: number, z0: number, z1: number, y0: number, y1: number) {
  s.prism([[toWorld(f, x0, z0), toWorld(f, x1, z0), toWorld(f, x1, z1), toWorld(f, x0, z1)].flat()], y0, y1);
}
const circleXZ = (cx: number, cz: number, r: number, n = 12): XZ => xz(ellipse(cx, cz, r, r, 0, n));

// ── Bank of China ──

const BC = M.boc;

/** Diamond lattice strips on every face of ring r from y0 to y1 (each cell gets both diagonals), offset `out` outwards. */
export function lattice(b: MeshBuffer, r: XZ, y0: number, y1: number, D: { w: number; h: number; t: number; out: number }) {
  const rows = Math.max(1, Math.round((y1 - y0) / D.h));
  const ch = (y1 - y0) / rows;
  for (let i = 0, n = r.length; i < n; i += 2) {
    const [ax, az, bx, bz] = [r[i]!, r[i + 1]!, r[(i + 2) % n]!, r[(i + 3) % n]!];
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 1) continue;
    const [ex, ez] = [(bx - ax) / len, (bz - az) / len];
    const nrm: V3 = [-ez, 0, ex];
    const cols = Math.max(1, Math.round(len / D.w));
    const cw = len / cols;
    const P = (s: number, y: number, side: number, o: number): V3 => [ax + ex * (s + side) + nrm[0] * o, y, az + ez * (s + side) + nrm[2] * o];
    const strip = (s0: number, ya: number, s1: number, yb: number, o: number) => {
      const t = Math.min(D.t / 2, cw / 4);
      quadOut(b, P(s0, ya, -t, o), P(s0, ya, t, o), P(s1, yb, t, o), P(s1, yb, -t, o), nrm);
    };
    for (let c = 0; c < cols; c++) {
      for (let k = 0; k < rows; k++) {
        const [s0, s1, ya, yb] = [c * cw, (c + 1) * cw, y0 + k * ch, y0 + (k + 1) * ch];
        strip(s0, ya, s1, yb, D.out);
        strip(s1, ya, s0, yb, D.out + 0.03); // a hair further out: the crossing strips never share a plane
      }
    }
  }
}

function bankOfChina(rec: BuildingRec, ctx: LandmarkCtx): BuildOut {
  const rings = partRings(rec);
  if (!rings) return EMPTY;
  const r = rings[0]!;
  const [cx, cz] = ringCentroid(r);
  const g = ctx.ground;
  const yb = ctx.minGround - L.sink;
  const C = BC.colours;
  const s = new Sink();
  const glass = new MeshBuffer('curtain', true);
  glass.color = rgb(C.glass);
  glass.lit = BC.lit;
  walls(glass, r, yb, g + BC.body, BC.bay, BC.floor, g);
  lattice(paint(s, 'masonry', rgb(C.granite)), r, g + BC.lattice.h * 0.5, g + BC.body, BC.lattice);
  const crown = paint(s, 'masonry', rgb(C.crown));
  const meanR = (q: XZ) => q.reduce((a, v, i) => a + (i % 2 ? Math.hypot(q[i - 1]! - cx, v - cz) : 0), 0) / (q.length / 2);
  const edge = (q: XZ, y: number) => walls(paint(s, 'neon', glow(C.edge, BC.edgeIntensity)), scaleRing(q, 1 + 0.08 / meanR(q), cx, cz), y - BC.edgeH, y + 0.05);
  let [prev, top] = [r, g + BC.body];
  cap(crown, [r], top, 1);
  edge(r, top);
  for (const [k, t] of BC.tiers) {
    const q = scaleRing(r, k, cx, cz);
    walls(paint(s, 'masonry', rgb(C.crown)), q, top, g + t);
    cap(crown, [q], g + t, 1);
    edge(q, g + t);
    [prev, top] = [q, g + t];
  }
  const apex: V3 = [cx, g + BC.pyramid, cz];
  for (let i = 0, n = prev.length; i < n; i += 2) {
    const [ax, az, bx, bz] = [prev[i]!, prev[i + 1]!, prev[(i + 2) % n]!, prev[(i + 3) % n]!];
    triOut(crown, [ax, top, az], [bx, top, bz], apex, [-(bz - az), 0.5, bx - ax]);
  }
  const mast = paint(s, 'metal', rgb(C.mast));
  box(mast, cx - BC.mast, cx + BC.mast, g + BC.pyramid - 2, g + BC.height - 0.6, cz - BC.mast, cz + BC.mast);
  box(paint(s, 'neon', glow(C.beacon, BC.beaconIntensity)), cx - 0.6, cx + 0.6, g + BC.height - 0.6, g + BC.height, cz - 0.6, cz + 0.6);
  s.prism([r], yb, g + BC.body);
  return out(s, [glass.bucket()]);
}

// ── Macau Cultural Centre ──

const CC = M.cultural;

/** Footprint frame with +u towards the end with more outline vertices (the rounded auditorium end). */
export function roundEndFrame(r: XZ): Frame {
  const f = footprintFrame(r);
  let [pos, neg] = [0, 0];
  for (let i = 0; i < r.length; i += 2) {
    const pu = (r[i]! - f.cx) * f.ux + (r[i + 1]! - f.cz) * f.uz;
    if (pu > 0.4 * f.a) pos++;
    if (pu < -0.4 * f.a) neg++;
  }
  return pos >= neg ? f : { ...f, ux: -f.ux, uz: -f.uz };
}

/** Hexahedron between two 4-point rings (bottom, top), all 6 faces. */
function block(b: MeshBuffer, lo: V3[], hi: V3[]) {
  loft(b, [lo, hi]);
  quadOut(b, hi[0]!, hi[1]!, hi[2]!, hi[3]!, [0, 1, 0]);
  quadOut(b, lo[0]!, lo[1]!, lo[2]!, lo[3]!, [0, -1, 0]);
}

function cultural(rec: BuildingRec, ctx: LandmarkCtx): BuildOut {
  const rings = partRings(rec);
  if (!rings) return EMPTY;
  const g = ctx.ground;
  const yb = ctx.minGround - L.sink;
  const C = CC.colours;
  const s = new Sink();
  const glass = new MeshBuffer('curtain', true);
  glass.color = rgb(C.glass);
  glass.lit = CC.lit;
  const stone = paint(s, 'masonry', rgb(C.stone));
  for (const q of rings) {
    walls(glass, q, yb, g + CC.lobby, CC.bay, CC.floor, g);
    walls(stone, q, g + CC.lobby, g + CC.strip[0]);
    walls(glass, q, g + CC.strip[0], g + CC.strip[1], CC.bay, CC.floor, g); // ribbon window
    walls(stone, q, g + CC.strip[1], g + CC.wall);
  }
  cap(paint(s, 'masonry', rgb(C.roof)), rings, g + CC.wall, 1);
  s.prism(rings, yb, g + CC.wall);
  // auditorium block (local frame, placed below): skillion roof rising to the OSM height towards the rounded end, then
  // the upturned "sail" roof cantilevered past the end
  const f = roundEndFrame(rings[0]!);
  const top = rec.height ?? 25.6;
  const [u0, u1] = [CC.fly.u[0] * f.a, CC.fly.u[1] * f.a];
  const [w0, w1] = [CC.fly.w[0] * f.b, CC.fly.w[1] * f.b];
  const roofY = (x: number) => CC.fly.low + ((top - CC.fly.low) * (x - u0)) / (u1 - u0);
  const loc = new MeshBuffer('masonry');
  loc.color = rgb(C.stone);
  const base = CC.wall - 0.5;
  block(loc, [[u0, base, w0], [u1, base, w0], [u1, base, w1], [u0, base, w1]], [[u0, roofY(u0), w0], [u1, roofY(u1), w0], [u1, roofY(u1), w1], [u0, roofY(u0), w1]]);
  loc.color = rgb(C.sail);
  const S = CC.sail;
  const xs = u0 + (u1 - u0) * 0.35;
  const xe = u1 + S.over;
  const sy = (x: number) => roofY(Math.min(x, u1)) + 0.05 + (x > u1 ? (S.rise * (x - u1)) / S.over : 0);
  const sw = [w0 - 1.5, w1 + 1.5] as const;
  const quad = (dy: number): V3[] => [[xs, sy(xs) + dy, sw[0]], [u1, sy(u1) + dy, sw[0]], [u1, sy(u1) + dy, sw[1]], [xs, sy(xs) + dy, sw[1]]];
  const tip = (dy: number): V3[] => [[u1, sy(u1) + dy, sw[0]], [xe, sy(xe) + dy, sw[0] - 2], [xe, sy(xe) + dy, sw[1] + 2], [u1, sy(u1) + dy, sw[1]]];
  block(loc, quad(0), quad(S.t));
  block(loc, tip(0), tip(S.t));
  const led = new MeshBuffer('neon');
  led.color = glow(C.edge, CC.edgeIntensity);
  block(led, [[xe - 0.05, sy(xe) - 0.1, sw[0] - 2], [xe + 0.12, sy(xe) - 0.1, sw[0] - 2], [xe + 0.12, sy(xe) - 0.1, sw[1] + 2], [xe - 0.05, sy(xe) - 0.1, sw[1] + 2]],
    [[xe - 0.05, sy(xe) + S.t + 0.1, sw[0] - 2], [xe + 0.12, sy(xe) + S.t + 0.1, sw[0] - 2], [xe + 0.12, sy(xe) + S.t + 0.1, sw[1] + 2], [xe - 0.05, sy(xe) + S.t + 0.1, sw[1] + 2]]);
  framePrism(s, f, u0, u1, w0, w1, g + base, g + top);
  return out(s, [glass.bucket(), place(loc.bucket(), f, g), place(led.bucket(), f, g)]);
}

// ── Kun Iam statue ──

const KI = M.kunIam;

function kunIam(rec: BuildingRec, ctx: LandmarkCtx): BuildOut {
  const rings = partRings(rec);
  if (!rings) return EMPTY;
  const r = rings[0]!;
  const [cx, cz] = ringCentroid(r);
  let R = 0;
  for (let i = 0; i < r.length; i += 2) R += Math.hypot(r[i]! - cx, r[i + 1]! - cz) / (r.length / 2);
  const g = ctx.ground;
  const yb = ctx.minGround - L.sink;
  const C = KI.colours;
  const front = compass(KI.facing);
  const [sx, sz] = [-front[1], front[0]]; // side axis (the figure's left-right)
  const s = new Sink();
  // plinth (stone) + floodlight boxes on it, in front
  const plinth = paint(s, 'masonry', rgb(C.plinth));
  const y0 = g + KI.base.plinth;
  loft(plinth, [ellipse(cx, cz, R + 0.6, R + 0.6, yb, 32), ellipse(cx, cz, R + 0.6, R + 0.6, y0, 32)]);
  disc(plinth, ellipse(cx, cz, R + 0.6, R + 0.6, y0, 32), 1);
  const lamp = paint(s, 'neon', glow(C.lamp, KI.lampBright));
  for (const a of [-50, -20, 20, 50]) {
    const [dx, dz] = compass(KI.facing + a);
    const [px, pz] = [cx + dx * (R + 0.2), cz + dz * (R + 0.2)];
    box(lamp, px - 0.25, px + 0.25, y0, y0 + 0.35, pz - 0.25, pz + 0.25);
  }
  // lotus dome: 16 petals (radius scallops), from R on the plinth to the figure's foot
  const B = KI.base;
  const lotus = new MeshBuffer('neon');
  const petal = (t: number) => 1 - B.depth * (1 - Math.abs(Math.cos((B.petals / 2) * t)));
  const top = KI.figure[0]![1] + 0.4;
  const domeRings = Array.from({ length: 9 }, (_, k) => {
    const t = k / 8;
    const rad = top + (R - top) * Math.cos((t * Math.PI) / 2);
    return ellipse(cx, cz, rad, rad, y0 + B.h * Math.sin((t * Math.PI) / 2), 64, 1, 0, petal);
  });
  loft(lotus, domeRings);
  disc(lotus, domeRings.at(-1)!, 1);
  // robed figure: elliptical lathe (deeper across the shoulders), two hanging sleeves
  const fig = new MeshBuffer('neon');
  const fy = y0 + B.h;
  loft(fig, KI.figure.map(([y, rr]) => ellipse(cx, cz, rr, rr * KI.depth, fy + y, 20, sx, sz)));
  const S = KI.sleeves;
  for (const side of [-1, 1]) {
    const [px, pz] = [cx + sx * side * S.out, cz + sz * side * S.out];
    const sl = [ellipse(px, pz, S.r * 0.8, S.r, fy + S.y[0], 8), ellipse(px, pz, S.r, S.r, fy + S.y[0] + 2, 8), ellipse(px, pz, S.r * 0.7, S.r * 0.8, fy + S.y[1], 8)];
    loft(fig, sl);
    disc(fig, sl[0]!, -1);
  }
  const H = fy + KI.figure.at(-1)![0] - y0;
  s.prism([xz(ellipse(cx, cz, R, R, 0, 16))], yb, y0 + B.h);
  s.prism([circleXZ(cx, cz, KI.figure[0]![1])], y0 + B.h, fy + KI.figure.at(-1)![0]);
  return out(s, [
    bakeFlood(lotus.bucket(), rgb(C.base), y0, H, KI.bright, front),
    bakeFlood(fig.bucket(), rgb(C.statue), y0, H, KI.bright, front),
  ]);
}

// ── Lotus Square: the golden lotus ──

const LO = M.lotus;

/** Petal layers of the bronze lotus: [count, base tilt from vertical (deg), curl to the tip (deg), length, width, base r, base y, phase]. */
const PETALS: readonly (readonly [number, number, number, number, number, number, number, number])[] = [
  [8, 32, 22, 2.2, 1.6, 0.5, 0.2, 0],
  [8, 18, 16, 2.5, 1.6, 0.4, 0.45, 0.5],
  [6, 6, 10, 2.5, 1.4, 0.3, 0.75, 0.25],
];

/** One cupped petal (both faces) from a base point on the axis' radial direction φ. */
export function petal(b: MeshBuffer, cx: number, y: number, cz: number, phi: number, tilt: number, curl: number, len: number, width: number, r0: number, n = 6) {
  const [ex, ez] = [Math.cos(phi), Math.sin(phi)];
  const [tx, tz] = [-ez, ex];
  const rows: V3[][] = [];
  let [r, h] = [r0, y];
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    const th = ((tilt + curl * t) * Math.PI) / 180;
    const wd = (width / 2) * Math.sqrt(Math.max(0, Math.sin(Math.PI * (0.12 + 0.88 * t)))); // broad, rounded tip
    const cup = 0.45 * wd;
    const [px, py] = [-Math.cos(th), Math.sin(th)]; // in the radial plane, towards the axis / up
    rows.push([-1, 0, 1].map((sd): V3 => [cx + ex * (r + px * cup * sd * sd) + tx * sd * wd, h + py * cup * sd * sd, cz + ez * (r + px * cup * sd * sd) + tz * sd * wd]));
    r += Math.sin(th) * (len / n);
    h += Math.cos(th) * (len / n);
  }
  for (let k = 0; k < n; k++) {
    for (let j = 0; j < 2; j++) {
      const [a, c, d, e] = [rows[k]![j]!, rows[k]![j + 1]!, rows[k + 1]![j + 1]!, rows[k + 1]![j]!];
      b.quad(a, c, d, e);
      b.quad(a, e, d, c);
    }
  }
}

function lotusSquare(ctx: LandmarkCtx): BuildOut {
  const p = latLonToWorld(LO.at[0], LO.at[1]);
  const [cx, cz] = [p.x, p.z];
  const C = LO.colours;
  const s = new Sink();
  // paving: concentric bands on a level disc at the highest terrain under it, a skirt down to the lowest
  const P = LO.paving;
  const edge = ellipse(cx, cz, P.r, P.r, 0, 48);
  const ys = [ctx.height(cx, cz), ...edge.map((q) => ctx.height(q[0], q[2]))];
  const y = Math.max(...ys) + 0.06;
  const skirt = paint(s, 'masonry', rgb(C.pave2));
  loft(skirt, [ellipse(cx, cz, P.r, P.r, Math.min(...ys) - 0.4, 48), ellipse(cx, cz, P.r, P.r, y, 48)]);
  for (let k = 0; k < P.rings; k++) {
    const b = paint(s, 'masonry', rgb(k % 2 ? C.pave2 : C.pave));
    const [ri, ro] = [(P.r * k) / P.rings, (P.r * (k + 1)) / P.rings];
    const [inn, ou] = [ellipse(cx, cz, ri, ri, y, 48), ellipse(cx, cz, ro, ro, y, 48)];
    for (let i = 0; i < 48; i++) quadOut(b, inn[i]!, inn[(i + 1) % 48]!, ou[(i + 1) % 48]!, ou[i]!, [0, 1, 0]);
  }
  // three red granite lotus-leaf layers (9 lobes each)
  const granite = new MeshBuffer('neon'); // floodlit too
  let yt = y;
  LO.tiers.forEach(([rr, hh], k) => {
    const lobe = (t: number) => 1 - 0.1 * (1 - Math.abs(Math.cos(4.5 * t + k)));
    const lo = ellipse(cx, cz, rr, rr, yt - (k ? 0 : 0.3), 36, 1, 0, lobe);
    const hi = ellipse(cx, cz, rr * 0.97, rr * 0.97, yt + hh, 36, 1, 0, lobe);
    loft(granite, [lo, hi]);
    disc(granite, hi, 1);
    s.prism([xz(ellipse(cx, cz, rr * 0.95, rr * 0.95, 0, 12))], yt - 0.3, yt + hh);
    yt += hh;
  });
  // gilded stem + flower
  const gold = new MeshBuffer('neon');
  const st = LO.stem;
  loft(gold, [ellipse(cx, cz, st.r * 1.3, st.r * 1.3, yt, 12), ellipse(cx, cz, st.r, st.r, yt + 0.4, 12), ellipse(cx, cz, st.r * 0.8, st.r * 0.8, yt + st.h, 12)]);
  const fy = yt + st.h;
  loft(gold, [ellipse(cx, cz, st.r * 0.8, st.r * 0.8, fy, 12), ellipse(cx, cz, 0.55, 0.55, fy + 0.9, 12), ellipse(cx, cz, 0.6, 0.6, fy + 1.4, 12)]);
  disc(gold, ellipse(cx, cz, 0.6, 0.6, fy + 1.4, 12), 1);
  const scale = LO.flower.h / 3.8; // PETALS are drawn for a 3.8 m flower
  for (const [n, tilt, curl, len, w, r0, by, ph] of PETALS) {
    for (let i = 0; i < n; i++) petal(gold, cx, fy + by * scale, cz, (TAU * (i + ph)) / n, tilt, curl, len * scale, w * scale, r0 * scale);
  }
  s.prism([circleXZ(cx, cz, st.r)], yt, fy + 1.2);
  return out(s, [
    bakeFlood(gold.bucket(), rgb(C.gold), yt, LO.stem.h + LO.flower.h, LO.bright),
    bakeFlood(granite.bucket(), rgb(C.granite), y, yt - y, LO.graniteBright),
  ]);
}

// ── Portas do Cerco ──

const PC = M.portas;

/** The 1870 gate on its 19 × 3 m outline: arched central block with pilasters, cornice, attic and crest; low wings. */
function gate(rec: BuildingRec, ctx: LandmarkCtx): BuildOut {
  const rings = partRings(rec);
  if (!rings) return EMPTY;
  const f = footprintFrame(rings[0]!);
  const g = ctx.ground;
  const lo = ctx.minGround - L.sink - g;
  const G = PC.gate;
  const [hw, o, d] = [G.w / 2, G.open, f.b];
  const b = new MeshBuffer('neon');
  extrude(b, [-hw, lo, -o, lo, ...arch(o, G.spring, 12), o, lo, hw, lo, hw, G.h, -hw, G.h], 'z', -d, d);
  for (const x of [-(o + 1.1), o + 1.1]) box(b, x - 0.4, x + 0.4, lo, G.h, -d - 0.25, d + 0.25); // pilasters
  box(b, -hw - 0.35, hw + 0.35, G.h, G.h + 0.6, -d - 0.35, d + 0.35); // cornice
  const at = G.h + 0.6;
  box(b, -G.attic[0] / 2, G.attic[0] / 2, at, at + G.attic[1], -d + 0.15, d - 0.15);
  const ct = at + G.attic[1];
  const [cw, ch] = G.crest;
  extrude(b, [-cw / 2, ct, cw / 2, ct, cw / 2, ct + ch * 0.55, 0, ct + ch, -cw / 2, ct + ch * 0.55], 'z', -d + 0.35, d - 0.35);
  for (const sg of [-1, 1]) {
    const [x0, x1] = sg < 0 ? [-f.a, -hw] : [hw, f.a];
    box(b, x0, x1, lo, G.wing, -d * 0.55, d * 0.55);
    box(b, x0 - (sg < 0 ? 0.15 : 0), x1 + (sg > 0 ? 0.15 : 0), G.wing, G.wing + 0.35, -d * 0.55 - 0.15, d * 0.55 + 0.15); // coping
  }
  const s = new Sink();
  const y0 = ctx.minGround - L.sink;
  framePrism(s, f, -hw, -o, -d, d, y0, g + G.h);
  framePrism(s, f, o, hw, -d, d, y0, g + G.h);
  framePrism(s, f, -o, o, -d, d, g + G.spring + o, g + G.h);
  framePrism(s, f, -f.a, -hw, -d * 0.55, d * 0.55, y0, g + G.wing);
  framePrism(s, f, hw, f.a, -d * 0.55, d * 0.55, y0, g + G.wing);
  return out(s, [bakeFlood(place(b.bucket(), f, g), rgb(PC.colour), g, ct + ch)]);
}

/** The 2004 border post: glass walls on the outline (lit windows at night), cladding band, flat roof, LED roof edge. */
function borderPost(rec: BuildingRec, ctx: LandmarkCtx): BuildOut {
  const rings = partRings(rec);
  if (!rings) return EMPTY;
  const g = ctx.ground;
  const yb = ctx.minGround - L.sink;
  const P = PC.post;
  const C = PC.postColours;
  const s = new Sink();
  const glass = new MeshBuffer('curtain', true);
  glass.color = rgb(C.glass);
  glass.lit = P.lit;
  const clad = paint(s, 'masonry', rgb(C.cladding));
  const led = paint(s, 'neon', glow(C.edge, PC.edgeIntensity));
  for (const q of rings) {
    walls(glass, q, yb, g + P.h - P.band, P.bay, P.floor, g);
    walls(clad, q, g + P.h - P.band, g + P.h);
    walls(led, q, g + P.h, g + P.h + 0.35);
  }
  cap(clad, rings, g + P.h, 1);
  s.prism(rings, yb, g + P.h);
  return out(s, [glass.bucket()]);
}

export const details: Partial<Record<LandmarkId, DetailFn>> = {
  'bank-of-china': (rec, _parts, ctx) => bankOfChina(rec, ctx),
  'cultural-centre': (rec, _parts, ctx) => cultural(rec, ctx),
  'kun-iam-statue': (rec, _parts, ctx) => kunIam(rec, ctx),
  // the square (park w/192179907) carries the statue (config `at`); the statue's own outline w/192179914, once registered,
  // is drawn by nothing (the granite base covers it) instead of the generic 20 m block
  'praca-flor-de-lotus': (rec, _parts, ctx) => (Math.abs(ringArea(rec.outer)) > 1000 ? lotusSquare(ctx) : EMPTY),
  'portas-do-cerco': (rec, _parts, ctx) => (Math.abs(ringArea(rec.outer)) < 400 ? gate(rec, ctx) : borderPost(rec, ctx)),
};
