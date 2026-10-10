// Leg 2 landmark group m3 (docs/plans/leg2-landmarks.md §4, agent o3): the casino resorts, built in code from the OSM
// outlines (no downloads). Tunables: config landmarks.m3 (figures cited there; the rest estimated, see
// docs/reports/leg2-landmarks-o3.md). Night = THE moment for these: every light is a 'neon' bucket (unlit MeshBasic,
// linear colour × bright × lighting.emissiveScale → bloom); the chunk worker cannot tell day from night, so they are on
// by day too (casino LEDs are). No real lights. Colliders only on simplified solids (renderPart prisms, plinths, towers).
//   hotel-lisboa (zone), rebuilt from photos: the round 37.4 m record = the white round hotel tower (white fins, pale lit
//     floor bands, gold parapet + small fan crown, "LISBOA" bulb sign); > 60 m = the 1991 extension (white slab); the
//     27.8 m podium is cut off behind its round south lobe = Casino Lisboa: low drum with an orange window grid and brown
//     mullions under a crown of gold fan arches ("birdcage") around an inner drum, a dome and a rosette; roofs generic.
//   wynn-macau: Encore (> 150 m) / Wynn (> 80 m) gold slabs, lit floor bands, roof LED rim, "WYNN" sign; the big podium
//     (+ Performance Lake jets at the OSM fountain node); the small blocks generic.
//   mgm-macau, rebuilt from photos: the tower = 3 stacked tiers (copper / blue glass / gold) between wavy boundaries,
//     each inset / trimmed a little differently, "MGM GRAND" across the gold tier; the podium with the Grande Praça
//     glass vault and the golden lion on its OSM artwork point.
//   sands-macau (G4, photos): gold glass drum (OSM way/1418312721) + stacked "hat" crown between dark glass wings with
//     gold fins, red "SANDS" sign on the wings' roof; the hotel tower (way/1201888817) gold glass too, the hotel's low
//     outline (way/667429625, under the wings) nothing (audit a4).
//   fisherman-wharf: the Roman Amphitheatre record (OSM way/192180012) carries the Colosseum arcade along its own outline
//     (smoothed, inside it: no spill over the neighbouring houses) with a solid core + arena roof; the site polygon a
//     lighthouse on the seaward tip; the convention centre a "Babylon" ziggurat roof and an LED rim.
import { landmarks as L, lighting as LT } from '../../config.ts';
import { type BuildingRec, type LandmarkId, type PartRec, ringArea, type XZ } from '../../geo/chunkData.ts';
import { ringCentroid } from '../../geo/clip.ts';
import type { BuildOut, MaterialId } from '../buildTypes.ts';
import { type MeshBuffer, offsetPolyline, triangulate, type V3 } from '../geom.ts';
import type { DetailFn, LandmarkCtx } from './index.ts';
import { arch, footprintFrame, loft, quadOut, triOut } from './kit.ts';
import { outward } from './mf2.ts';
import { parseColour, partRings, renderPart, Sink } from './parts.ts';

const M = L.m3;
const TAU = 2 * Math.PI;
const EMPTY: BuildOut = { meshes: [], instances: [], colliders: [] };

const rgb = (hex: string, k = 1): V3 => parseColour(hex)!.map((c) => c * k) as unknown as V3;
const glow = (hex: string, bright: number) => rgb(hex, bright * LT.emissiveScale);
/** Buffer of material m with its vertex colour set for what is added next. */
function paint(s: Sink, m: MaterialId, c: V3, lod?: 'near') {
  const b = s.buf(m, lod);
  b.color = c;
  return b;
}
const opts = (ctx: LandmarkCtx, top: number) => ({ ground: ctx.ground, height: ctx.height, fallbackTop: top });

// ── pure helpers (tested) ──

/** 5 × 7 bulb font, only the letters the signs use. */
const FONT: Record<string, string[]> = {
  A: ['.111.', '1...1', '1...1', '11111', '1...1', '1...1', '1...1'],
  B: ['1111.', '1...1', '1...1', '1111.', '1...1', '1...1', '1111.'],
  C: ['.1111', '1....', '1....', '1....', '1....', '1....', '.1111'],
  D: ['1111.', '1...1', '1...1', '1...1', '1...1', '1...1', '1111.'],
  E: ['11111', '1....', '1....', '1111.', '1....', '1....', '11111'],
  G: ['.1111', '1....', '1....', '1.111', '1...1', '1...1', '.111.'],
  I: ['.111.', '..1..', '..1..', '..1..', '..1..', '..1..', '.111.'],
  L: ['1....', '1....', '1....', '1....', '1....', '1....', '11111'],
  M: ['1...1', '11.11', '1.1.1', '1.1.1', '1...1', '1...1', '1...1'],
  N: ['1...1', '11..1', '1.1.1', '1.1.1', '1..11', '1...1', '1...1'],
  O: ['.111.', '1...1', '1...1', '1...1', '1...1', '1...1', '.111.'],
  R: ['1111.', '1...1', '1...1', '1111.', '1.1..', '1..1.', '1...1'],
  S: ['.1111', '1....', '1....', '.111.', '....1', '....1', '1111.'],
  W: ['1...1', '1...1', '1...1', '1.1.1', '1.1.1', '11.11', '1...1'],
  Y: ['1...1', '1...1', '.1.1.', '..1..', '..1..', '..1..', '..1..'],
};
/** Sign width in pixel columns (5 per letter, 1 between). */
export const signCols = (text: string) => text.length * 6 - 1;
/** Lit runs [col0, col1, row] (row 0 = top) of a text in the bulb font; unknown letters are blank. */
export function signRuns(text: string): [number, number, number][] {
  const out: [number, number, number][] = [];
  [...text].forEach((ch, k) => {
    (FONT[ch] ?? []).forEach((row, r) => {
      let c0 = -1;
      for (let c = 0; c <= 5; c++) {
        const on = row[c] === '1';
        if (on && c0 < 0) c0 = c;
        if (!on && c0 >= 0) (out.push([k * 6 + c0, k * 6 + c - 1, r]), (c0 = -1));
      }
    });
  });
  return out;
}

/** Sutherland–Hodgman: the part of ring r where x·nx + z·nz ≤ d. */
export function clipRing(r: XZ, nx: number, nz: number, d: number): XZ {
  const out: XZ = [];
  for (let i = 0, n = r.length; i < n; i += 2) {
    const j = (i + 2) % n;
    const fa = r[i]! * nx + r[i + 1]! * nz - d;
    const fb = r[j]! * nx + r[j + 1]! * nz - d;
    if (fa <= 0) out.push(r[i]!, r[i + 1]!);
    if (fa <= 0 !== fb <= 0) {
      const t = fa / (fa - fb);
      out.push(r[i]! + (r[j]! - r[i]!) * t, r[i + 1]! + (r[j + 1]! - r[i + 1]!) * t);
    }
  }
  return out;
}

export type LisboaPiece = 'round' | 'wing' | 'podium' | 'generic';
/** Which Hotel Lisboa record this is: the 37.4 m round one (r ≈ 22 m, holds the OSM hotel node) = the white round hotel
 *  tower, the 76.8 m one = the 1991 extension, the 27.8 m hotel (roundish but ≈ 150 m across) = the podium + casino. */
export function lisboaPiece(rec: BuildingRec): LisboaPiece {
  if (rec.kind === 'roof' || !rec.height) return 'generic';
  if (rec.height > 60) return 'wing';
  const f = footprintFrame(rec.outer);
  if (f.a < 35 && f.a / f.b < 1.2 && Math.abs(ringArea(rec.outer)) > 0.7 * Math.PI * f.a * f.b) return 'round';
  return 'podium';
}

/** Pointed fan arch outline [u, v] (u across, v up) from the left foot to the right foot: vertical-ish sides, a sharp tip. */
export function fanArch(w: number, h: number, k = 12): [number, number][] {
  return Array.from({ length: k + 1 }, (_, i) => {
    const c = Math.cos((Math.PI * i) / k);
    return [(-w / 2) * c, h * (1 - Math.abs(c)) ** 0.55];
  });
}

/** u of a point along a frame's long axis, relative to the frame centre. */
const along = (f: { cx: number; cz: number; ux: number; uz: number }, x: number, z: number) => (x - f.cx) * f.ux + (z - f.cz) * f.uz;

/** MGM wave boundary k (0 = ground, 1..n−1 = tier splits, n = roofline) at u, in m above the ground. */
export function mgmWave(k: number, u: number, length: number, H: number): number {
  const G = M.mgm;
  if (k === 0) return 0;
  const n = G.splits.length + 1;
  const s = Math.sin((TAU * u) / (G.wave.length * length) + G.wave.phase[k - 1]!);
  return k < n ? H * G.splits[k - 1]! + G.wave.amp * s : H - G.wave.amp * (1 - s);
}

/** Point on the axis-aligned ellipse (centre, half-axes a along x, b along z) and its outward unit normal / tangent. */
export function ellipseAt(cx: number, cz: number, a: number, b: number, t: number) {
  const [c, s] = [Math.cos(t), Math.sin(t)];
  const nl = Math.hypot(b * c, a * s);
  const tl = Math.hypot(a * s, b * c);
  return { x: cx + a * c, z: cz + b * s, nx: (b * c) / nl, nz: (a * s) / nl, tx: (-a * s) / tl, tz: (b * c) / tl };
}

/** Closed smooth curve along an outline ring (XZ, any winding): the corners are cut `levels` times (Chaikin: the curve stays
 *  INSIDE the outline) and positions are by arc length, so `at(u)` (u in [0, 1), wraps) spaces bays evenly. Returns the point
 *  offset `d` m along the outward normal (negative = inwards), the unit tangent and the unit outward normal like `ellipseAt`
 *  (counter-clockwise in x, z: normal = (tz, −tx)). Used where an axis-aligned ellipse spilled over the neighbours. */
export function outlineCurve(outline: XZ, levels = 3) {
  const m0 = outline.length / 2;
  let area2 = 0;
  for (let i = 0; i < m0; i++) {
    const j = (i + 1) % m0;
    area2 += outline[2 * i]! * outline[2 * j + 1]! - outline[2 * j]! * outline[2 * i + 1]!;
  }
  let p: number[] = [];
  for (let i = 0; i < m0; i++) { const k = area2 < 0 ? m0 - 1 - i : i; p.push(outline[2 * k]!, outline[2 * k + 1]!); }
  for (let lv = 0; lv < levels; lv++) {
    const q: number[] = [];
    for (let i = 0, n = p.length; i < n; i += 2) {
      const j = (i + 2) % n;
      q.push(0.75 * p[i]! + 0.25 * p[j]!, 0.75 * p[i + 1]! + 0.25 * p[j + 1]!, 0.25 * p[i]! + 0.75 * p[j]!, 0.25 * p[i + 1]! + 0.75 * p[j + 1]!);
    }
    p = q;
  }
  const m = p.length / 2;
  const cum = [0];
  for (let i = 0; i < m; i++) {
    const j = (i + 1) % m;
    cum.push(cum[i]! + Math.hypot(p[2 * j]! - p[2 * i]!, p[2 * j + 1]! - p[2 * i + 1]!));
  }
  const length = cum[m]!;
  const sample = (u: number): [number, number] => {
    const s = (((u % 1) + 1) % 1) * length;
    let i = 0;
    while (i < m - 1 && cum[i + 1]! <= s) i++;
    const j = (i + 1) % m;
    const t = (s - cum[i]!) / (cum[i + 1]! - cum[i]! || 1);
    return [p[2 * i]! + (p[2 * j]! - p[2 * i]!) * t, p[2 * i + 1]! + (p[2 * j + 1]! - p[2 * i + 1]!) * t];
  };
  const at = (u: number, d = 0) => {
    const [x0, z0] = sample(u - 0.004);
    const [x1, z1] = sample(u + 0.004);
    const l = Math.hypot(x1 - x0, z1 - z0) || 1;
    const [tx, tz] = [(x1 - x0) / l, (z1 - z0) / l];
    const [nx, nz] = [tz, -tx];
    const [x, z] = sample(u);
    return { x: x + nx * d, z: z + nz * d, nx, nz, tx, tz };
  };
  return { at, length };
}

// ── geometry helpers ──

/** Lit strip around a ring (offset d outwards), both faces: neon, so the winding never matters. */
function strip(b: MeshBuffer, ring: XZ, y0: number, y1: number, d = 0.15) {
  const r = outward(ring, d);
  for (let i = 0, n = r.length; i < n; i += 2) {
    const j = (i + 2) % n;
    const [p, q, u, v]: V3[] = [[r[i]!, y0, r[i + 1]!], [r[j]!, y0, r[j + 1]!], [r[j]!, y1, r[j + 1]!], [r[i]!, y1, r[i + 1]!]];
    b.quad(p, q, u, v);
    b.quad(q, p, v, u);
  }
}
/** Vertical lit ribs every `spacing` m along a ring (offset d outwards), `w` m wide, both faces. */
function ribs(b: MeshBuffer, ring: XZ, y0: number, y1: number, spacing: number, w = 0.4, d = 0.25) {
  const r = outward(ring, d);
  let next = spacing / 2;
  let run = 0;
  for (let i = 0, n = r.length; i < n; i += 2) {
    const j = (i + 2) % n;
    const [dx, dz] = [r[j]! - r[i]!, r[j + 1]! - r[i + 1]!];
    const len = Math.hypot(dx, dz);
    if (len < 1e-6) continue;
    const [ux, uz] = [dx / len, dz / len];
    for (; next <= run + len; next += spacing) {
      const t = next - run;
      const [x, z] = [r[i]! + ux * t, r[i + 1]! + uz * t];
      const [p, q, u, v]: V3[] = [[x - ux * w / 2, y0, z - uz * w / 2], [x + ux * w / 2, y0, z + uz * w / 2], [x + ux * w / 2, y1, z + uz * w / 2], [x - ux * w / 2, y1, z - uz * w / 2]];
      b.quad(p, q, u, v);
      b.quad(q, p, v, u);
    }
    run += len;
  }
}
const circle = (cx: number, cz: number, r: number, y: number, n: number): V3[] =>
  Array.from({ length: n }, (_, s) => [cx + r * Math.cos((TAU * s) / n), y, cz + r * Math.sin((TAU * s) / n)]);
/** Fan over a convex ring, facing up (1) or down (−1). */
function disc(b: MeshBuffer, ring: V3[], dir: 1 | -1) {
  for (let s = 1; s + 1 < ring.length; s++) triOut(b, ring[0]!, ring[s]!, ring[s + 1]!, [0, dir, 0]);
}
/** Surface of revolution [y, r] bottom → top, closed with a disc on top when it ends wide. */
function revolve(b: MeshBuffer, cx: number, cz: number, prof: readonly (readonly [number, number])[], n: number) {
  loft(b, prof.map(([y, r]) => circle(cx, cz, r, y, n)));
  const [y, r] = prof.at(-1)!;
  if (r > 0.05) disc(b, circle(cx, cz, r, y, n), 1);
}
/** Ellipsoid on local axes (forward f, side, up), radii along them. */
function ellipsoid(b: MeshBuffer, c: V3, f: [number, number], r: V3, rows = 6, segs = 10, shade?: (ny: number) => V3) {
  const [fx, fz] = f;
  const at = (i: number, j: number): V3 => {
    const [th, ph] = [(Math.PI * i) / rows, (TAU * j) / segs];
    const [u, w, y] = [r[0] * Math.sin(th) * Math.cos(ph), r[2] * Math.sin(th) * Math.sin(ph), r[1] * Math.cos(th)];
    return [c[0] + fx * u - fz * w, c[1] + y, c[2] + fz * u + fx * w];
  };
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < segs; j++) {
      const [p, q, u, v] = [at(i, j), at(i, j + 1), at(i + 1, j + 1), at(i + 1, j)];
      const m: V3 = [(p[0] + u[0]) / 2 - c[0], (p[1] + u[1]) / 2 - c[1], (p[2] + u[2]) / 2 - c[2]];
      if (shade) b.color = shade(m[1] / (Math.hypot(...m) || 1));
      quadOut(b, p, q, u, v, m);
    }
  }
}

/** Bulb sign standing on a roof at (x, z): two faces back to back along axis (ux, uz), letters + a dark backing board
 *  down to the roof. Pixel size p shrinks to fit `maxW`. */
function roofSign(s: Sink, x: number, z: number, ux: number, uz: number, roof: number, text: string, p0: number, maxW: number, colour: V3) {
  const W = signCols(text);
  const p = Math.min(p0, maxW / (W + 2));
  const y0 = roof + p; // lowest bulb row
  const board = paint(s, 'masonry', rgb('#1a1612'));
  const neon = paint(s, 'neon', colour);
  const gap = ((1 - M.pixel) * p) / 2;
  for (const side of [1, -1]) {
    const [ox, oz] = [-uz * side, ux * side]; // outward normal of this face
    const [rx, rz] = [oz, -ox]; // viewer's right when facing the sign
    const P = (u: number, y: number, o: number): V3 => [x + rx * u + ox * o, y, z + rz * u + oz * o];
    const [hw, top] = [((W + 2) * p) / 2, y0 + 8 * p];
    quadOut(board, P(-hw, roof, 0.3), P(hw, roof, 0.3), P(hw, top, 0.3), P(-hw, top, 0.3), [ox, 0, oz]);
    for (const [c0, c1, row] of signRuns(text)) {
      const [u0, u1] = [(c0 - W / 2) * p + gap, (c1 + 1 - W / 2) * p - gap];
      const yt = y0 + (7 - row) * p - gap;
      quadOut(neon, P(u0, yt - M.pixel * p, 0.45), P(u1, yt - M.pixel * p, 0.45), P(u1, yt, 0.45), P(u0, yt, 0.45), [ox, 0, oz]);
    }
  }
}

/** A point well inside a (possibly banana-shaped) footprint: midpoint of the chord across its long axis at u = 0. */
function midInside(ring: XZ) {
  const f = footprintFrame(ring);
  const c0 = f.cx * f.ux + f.cz * f.uz;
  const ws: number[] = [];
  for (let i = 0, n = ring.length; i < n; i += 2) {
    const j = (i + 2) % n;
    const [ua, ub] = [ring[i]! * f.ux + ring[i + 1]! * f.uz - c0, ring[j]! * f.ux + ring[j + 1]! * f.uz - c0];
    if (ua <= 0 !== ub <= 0) {
      const t = ua / (ua - ub);
      const [x, z] = [ring[i]! + (ring[j]! - ring[i]!) * t, ring[i + 1]! + (ring[j + 1]! - ring[i + 1]!) * t];
      ws.push(-x * f.uz + z * f.ux);
    }
  }
  const w = ws.length >= 2 ? (Math.min(...ws) + Math.max(...ws)) / 2 : -f.cx * f.uz + f.cz * f.ux;
  return { x: c0 * f.ux - w * f.uz, z: c0 * f.uz + w * f.ux, f };
}

/** Glass tower on an outline: metal skin in `colour`, lit band per floor, LED rim at the top. */
function litSlab(s: Sink, ring: XZ, ctx: LandmarkCtx, top: number, colour: string, floor: number, lit: number, band: V3, rim?: V3) {
  renderPart({ outer: ring, kind: 'yes', height: top, material: 'metal', colour }, opts(ctx, top), s);
  const g = ctx.ground;
  const b = paint(s, 'neon', band);
  for (let y = floor; y < top - floor; y += floor) strip(b, ring, g + y, g + y + floor * lit);
  if (rim) strip(paint(s, 'neon', rim), ring, g + top - 0.8, g + top + 0.2);
}

// ── Hotel Lisboa ──

/** Fan arch standing on a circle of radius r around (cx, cz) at angle a (tangent to it), leaning out by `tilt` rad:
 *  floodlit gold body (both faces), lit rim, lit rays from the foot (the "lotus petals" of the birdcage crown). All
 *  'neon' (body / rim share a buffer: the colour is set per group). */
function petal(b: MeshBuffer, rays: MeshBuffer | null, cx: number, cz: number, a: number, r: number, y0: number, w: number, h: number, tilt: number) {
  const [nx, nz, tx, tz] = [Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a)];
  const [ct, st] = [Math.cos(tilt), Math.sin(tilt)];
  const P = (u: number, v: number, o = 0): V3 => [cx + nx * (r + v * st + o) + tx * u, y0 + v * ct, cz + nz * (r + v * st + o) + tz * u];
  const out: V3 = [nx * ct, -st, nz * ct];
  const back: V3 = [-out[0], -out[1], -out[2]];
  const pts = fanArch(w, h);
  const C = M.lisboa.colours;
  const B = M.lisboa.bright;
  for (let i = 0; i + 1 < pts.length; i++) {
    const [p, q] = [pts[i]!, pts[i + 1]!];
    b.color = glow(C.crown, B.petal);
    triOut(b, P(0, 0), P(...p), P(...q), out);
    b.color = glow(C.crown, B.petal * 0.6);
    triOut(b, P(0, 0, -0.02), P(...p, -0.02), P(...q, -0.02), back);
    const [pi, qi] = [[p[0] * 0.86, p[1] * 0.9], [q[0] * 0.86, q[1] * 0.9]] as const;
    b.color = glow(C.ray, B.ray);
    quadOut(b, P(...p, 0.1), P(...q, 0.1), P(...qi, 0.1), P(...pi, 0.1), out);
  }
  if (!rays) return;
  rays.color = glow(C.ray, B.ray * 0.7);
  for (let i = 2; i + 2 < pts.length; i += 2) {
    const [eu, ev] = [pts[i]![0] * 0.8, pts[i]![1] * 0.82];
    const [du, dv] = [eu, ev - h * 0.08];
    const l = Math.hypot(du, dv) || 1;
    const [pu, pv] = [(-dv / l) * 0.12, (du / l) * 0.12];
    quadOut(rays, P(-pu, h * 0.08 - pv, 0.08), P(pu, h * 0.08 + pv, 0.08), P(eu + pu, ev + pv, 0.08), P(eu - pu, ev - pv, 0.08), out);
  }
}

/** Casino Lisboa: low round drum (dark entrance storey, orange window grid with brown mullions, gold cornice), crowned by
 *  a ring of gold fan arches around an inner drum, a dome and a small rosette with a finial (the "birdcage"). */
function lisboaCasino(s: Sink, ctx: LandmarkCtx) {
  const K = M.lisboa.casino;
  const C = M.lisboa.colours;
  const B = M.lisboa.bright;
  const [x, z, R, n] = [K.x, K.z, K.r, K.segs];
  const g = ctx.height(x, z);
  const ring = (r: number, y: number, m = n) => circle(x, z, r, y, m);
  // the drum stands on a slope (the ground falls 2.5 m to the SW): its foot goes down to the lowest ground on its rim, no gap
  const foot = Math.min(...ring(R, 0).map((p) => ctx.height(p[0], p[2]))) - L.sink;
  loft(paint(s, 'masonry', rgb(C.base)), [ring(R, foot), ring(R, g + K.base)]);
  loft(paint(s, 'neon', glow(C.panel, B.panel)), [ring(R, g + K.base), ring(R, g + K.grid)]);
  const mul = paint(s, 'masonry', rgb(C.mullion));
  for (let j = 0; j < K.rows; j++) {
    const y = g + K.base + ((K.grid - K.base) * j) / K.rows;
    loft(mul, [ring(R + 0.2, y - (j % 2 ? 0.15 : 0.3)), ring(R + 0.2, y + (j % 2 ? 0.15 : 0.3))]); // storey lines thicker
  }
  for (let c = 0; c < K.cols; c++) {
    const a = (TAU * (c + 0.5)) / K.cols;
    const [nx, nz, tx, tz] = [Math.cos(a), Math.sin(a), -Math.sin(a) * 0.22, Math.cos(a) * 0.22];
    const [px, pz] = [x + nx * (R + 0.15), z + nz * (R + 0.15)];
    quadOut(mul, [px - tx, g + K.base, pz - tz], [px + tx, g + K.base, pz + tz], [px + tx, g + K.grid, pz + tz], [px - tx, g + K.grid, pz - tz], [nx, 0, nz]);
  }
  loft(paint(s, 'neon', glow(C.bulb, B.bulb)), [ring(R + 0.25, g + K.grid - 0.55), ring(R + 0.25, g + K.grid - 0.1)]);
  const gold = paint(s, 'metal', rgb(C.crown));
  const yc = g + K.grid;
  const y1 = yc + K.cornice;
  loft(gold, [ring(R, yc), ring(R + 0.8, yc + 0.4), ring(R + 0.8, y1)]);
  disc(gold, ring(R + 0.8, y1), 1);
  s.prism([circle(x, z, R, 0, 24).flatMap((p) => [p[0], p[2]])], foot, y1);
  // crown: fan arches, inner drum, dome, rosette, finial
  const w = ((TAU * R) / K.petals) * K.petalW;
  const tilt = (K.tilt * Math.PI) / 180;
  for (let p = 0; p < K.petals; p++) petal(s.buf('neon'), s.buf('neon', 'near'), x, z, (TAU * (p + 0.5)) / K.petals, R - 0.2, y1, w, K.petalH, tilt);
  const dome = paint(s, 'metal', rgb(C.dome));
  const [ri, rd, yb] = [R * K.inner.r, R * K.dome.r, y1 + K.inner.h];
  loft(dome, [ring(ri, y1), ring(ri, yb)]);
  disc(dome, ring(ri, yb), 1);
  loft(paint(s, 'neon', glow(C.bulb, B.bulb)), [ring(ri + 0.1, yb - 1.1), ring(ri + 0.1, yb - 0.6)]);
  revolve(dome, x, z, Array.from({ length: 7 }, (_, k): [number, number] => [yb + K.dome.h * Math.sin((Math.PI * k) / 12), rd * Math.cos((Math.PI * k) / 12)]), 32);
  const Ro = K.rosette;
  const yt = yb + K.dome.h - 0.3;
  revolve(paint(s, 'metal', rgb(C.crown)), x, z, [[yt, Ro.r], [yt + Ro.h, Ro.r]], 16);
  for (let p = 0; p < Ro.petals; p++) petal(s.buf('neon'), null, x, z, (TAU * p) / Ro.petals, Ro.r - 0.1, yt + Ro.h, ((TAU * Ro.r) / Ro.petals) * 0.95, Ro.petalH, tilt);
  revolve(s.buf('metal'), x, z, [[yt + Ro.h, 0.7], [yt + Ro.h + Ro.finial, 0.05]], 8);
}

/** The white round hotel tower: ribbed (white fins), a pale lit band per floor, gold parapet + small fan crown, LISBOA. */
function lisboaRound(rec: BuildingRec, ctx: LandmarkCtx): BuildOut {
  const s = new Sink();
  const r0 = partRings(rec)?.[0];
  if (!r0) return EMPTY;
  const C = M.lisboa.colours;
  const B = M.lisboa.bright;
  const T = M.lisboa.round;
  const [cx, cz] = ringCentroid(r0);
  let R = 0;
  for (let i = 0; i < r0.length; i += 2) R += Math.hypot(r0[i]! - cx, r0[i + 1]! - cz) / (r0.length / 2);
  const [g, top, n] = [ctx.ground, rec.height!, T.segs];
  const ring = (r: number, y: number, m = n) => circle(cx, cz, r, y, m);
  const wall = paint(s, 'masonry', rgb(C.tower));
  loft(wall, [ring(R, g - L.sink), ring(R, g + top)]);
  disc(wall, ring(R, g + top), 1);
  s.prism([circle(cx, cz, R, 0, 20).flatMap((p) => [p[0], p[2]])], g - L.sink, g + top);
  const band = paint(s, 'neon', glow(C.glassBand, B.glassBand));
  for (let y = T.floor; y + T.floor <= top; y += T.floor) loft(band, [ring(R + 0.08, g + y + ((1 - T.lit) / 2) * T.floor), ring(R + 0.08, g + y + ((1 + T.lit) / 2) * T.floor)]);
  const fin = paint(s, 'masonry', rgb(C.fin));
  const [fw, fd] = T.fin;
  for (let k = 0; k < T.fins; k++) {
    const a = (TAU * (k + 0.5)) / T.fins;
    const [nx, nz, tx, tz] = [Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a)];
    const P = (o: number, u: number, y: number): V3 => [cx + nx * (R + o) + tx * u, y, cz + nz * (R + o) + tz * u];
    const [y0, y1] = [g + 2.5, g + top + 0.6];
    quadOut(fin, P(fd, -fw / 2, y0), P(fd, fw / 2, y0), P(fd, fw / 2, y1), P(fd, -fw / 2, y1), [nx, 0, nz]);
    for (const sd of [-1, 1]) quadOut(fin, P(-0.05, (sd * fw) / 2, y0), P(fd, (sd * fw) / 2, y0), P(fd, (sd * fw) / 2, y1), P(-0.05, (sd * fw) / 2, y1), [tx * sd, 0, tz * sd]);
  }
  // crown: gold parapet with a bulb line, small fan arches, the LISBOA bulb sign
  const Cr = T.crown;
  const gold = paint(s, 'metal', rgb(C.crown));
  loft(gold, [ring(R + 0.9, g + top + 0.6), ring(R + 0.9, g + top + Cr.parapet)]);
  loft(gold, [ring(R + 0.9, g + top + Cr.parapet), ring(R, g + top + Cr.parapet)]);
  loft(paint(s, 'neon', glow(C.bulb, B.bulb)), [ring(R + 1, g + top + 0.8), ring(R + 1, g + top + 1.2)]);
  for (let p = 0; p < Cr.petals; p++) petal(s.buf('neon'), null, cx, cz, (TAU * (p + 0.5)) / Cr.petals, R + 0.5, g + top + Cr.parapet, ((TAU * R) / Cr.petals) * 0.9, Cr.h, 0.15);
  roofSign(s, cx, cz, 1, 0, g + top + Cr.parapet, T.sign, T.pixel, 1.5 * R, glow(C.sign, B.sign));
  return s.out();
}

/** The 1991 extension (76.8 m): white slab, lit floor bands, LED rim. */
function lisboaWing(rec: BuildingRec, ctx: LandmarkCtx): BuildOut {
  const s = new Sink();
  const ring = partRings(rec)?.[0];
  if (!ring) return EMPTY;
  const C = M.lisboa.colours;
  litSlab(s, ring, ctx, rec.height!, C.wall, M.lisboa.wing.band, M.lisboa.wing.lit, glow(C.band, M.lisboa.bright.band), glow(C.bulb, M.lisboa.bright.bulb));
  return s.out();
}

/** The 27.8 m podium, cut off behind the casino drum (its round south lobe), + the casino. */
function lisboaPodium(rec: BuildingRec, ctx: LandmarkCtx): BuildOut {
  const s = new Sink();
  let ring = partRings(rec)?.[0];
  if (!ring) return EMPTY;
  const C = M.lisboa.colours;
  const K = M.lisboa.casino;
  const xs = ring.filter((_, i) => i % 2 === 0);
  const zs = ring.filter((_, i) => i % 2 === 1);
  if (K.x > Math.min(...xs) && K.x < Math.max(...xs) && K.z > Math.min(...zs) && K.z < Math.max(...zs)) {
    const [pcx, pcz] = ringCentroid(ring);
    const l = Math.hypot(K.x - pcx, K.z - pcz) || 1;
    const [nx, nz] = [(K.x - pcx) / l, (K.z - pcz) / l];
    ring = clipRing(ring, nx, nz, K.x * nx + K.z * nz - K.podiumCut * K.r);
    lisboaCasino(s, ctx);
  }
  renderPart({ ...rec, outer: ring, colour: C.podium }, opts(ctx, rec.height!), s);
  const b = paint(s, 'neon', glow(C.bulb, M.lisboa.bright.bulb));
  for (const y of M.lisboa.podiumBands) if (y < rec.height!) strip(b, ring, ctx.ground + y, ctx.ground + y + 0.6);
  ribs(paint(s, 'neon', glow(C.rib, M.lisboa.bright.rib)), ring, ctx.ground + M.lisboa.podiumBands[0]!, ctx.ground + rec.height! - 1, M.lisboa.podiumRib); // the gold lattice
  return s.out();
}

// ── Wynn ──

function wynnTower(rec: BuildingRec, ctx: LandmarkCtx, sign: boolean): BuildOut {
  const s = new Sink();
  const ring = partRings(rec)?.[0];
  if (!ring) return EMPTY;
  const W = M.wynn;
  litSlab(s, ring, ctx, rec.height!, W.gold, W.floor, W.lit, glow(W.band, W.bandBright), glow(W.rim, W.rimBright));
  if (sign) {
    const m = midInside(ring);
    roofSign(s, m.x, m.z, m.f.ux, m.f.uz, ctx.ground + rec.height!, W.sign, W.signPixel, 1.1 * m.f.a, glow(W.signColour, W.signBright));
  }
  return s.out();
}

function wynnPodium(rec: BuildingRec, ctx: LandmarkCtx): BuildOut {
  const s = new Sink();
  const rings = partRings(rec);
  if (!rings) return EMPTY;
  const W = M.wynn;
  renderPart({ ...rec, colour: W.podium }, opts(ctx, rec.height!), s);
  strip(paint(s, 'neon', glow(W.rim, W.rimBright)), rings[0]!, ctx.ground + rec.height! - 1.2, ctx.ground + rec.height! - 0.4);
  ribs(paint(s, 'neon', glow(W.rim, W.ribBright)), rings[0]!, ctx.ground + 5, ctx.ground + rec.height! - 1.2, W.rib, 0.3);
  // Performance Lake: water jets on rings around the fountain node, a lit ring at each jet foot
  const K = W.lake;
  const yw = ctx.height(K.x, K.z) + 0.05;
  const jet = paint(s, 'neon', glow(K.jet, K.jetBright), 'near'); // lit from below at night: the jets glow
  const light = paint(s, 'neon', glow(K.light, K.lightBright), 'near');
  for (const [r, count, h] of K.rings) {
    for (let k = 0; k < count; k++) {
      const a = (TAU * k) / count;
      const [x, z] = [K.x + r * Math.cos(a), K.z + r * Math.sin(a)];
      revolve(jet, x, z, [[yw, K.jetR], [yw + h * 0.6, K.jetR * 0.7], [yw + h, 0.05]], 6);
      loft(light, [circle(x, z, K.jetR * 2.2, yw, 8), circle(x, z, K.jetR * 2.2, yw + 0.12, 8)]);
    }
  }
  return s.out();
}

// ── MGM ──

/** Ring offset inwards by d (the side with less area). */
function inset(r: XZ, d: number): XZ {
  const n = r.length;
  const w = (s: number) => offsetPolyline(r, s, [r[n - 2]!, r[n - 1]!], [r[0]!, r[1]!]);
  const [a, b] = [w(d), w(-d)];
  return Math.abs(ringArea(a)) <= Math.abs(ringArea(b)) ? a : b;
}
/** Ring with every edge longer than `max` split evenly. */
function densify(r: XZ, max: number): XZ {
  const out: XZ = [];
  for (let i = 0, n = r.length; i < n; i += 2) {
    const j = (i + 2) % n;
    const k = Math.max(1, Math.ceil(Math.hypot(r[j]! - r[i]!, r[j + 1]! - r[i + 1]!) / max));
    for (let s = 0; s < k; s++) out.push(r[i]! + ((r[j]! - r[i]!) * s) / k, r[i + 1]! + ((r[j + 1]! - r[i + 1]!) * s) / k);
  }
  return out;
}
/** [min, max] of w (across the frame) where the line u = const (relative to the frame centre) crosses the ring. */
function chordAt(r: XZ, f: ReturnType<typeof footprintFrame>, u: number): [number, number] | null {
  const ws: number[] = [];
  for (let i = 0, n = r.length; i < n; i += 2) {
    const j = (i + 2) % n;
    const [ua, ub] = [along(f, r[i]!, r[i + 1]!) - u, along(f, r[j]!, r[j + 1]!) - u];
    if (ua <= 0 !== ub <= 0) {
      const t = ua / (ua - ub);
      const [x, z] = [r[i]! + (r[j]! - r[i]!) * t, r[i + 1]! + (r[j + 1]! - r[i + 1]!) * t];
      ws.push(-(x - f.cx) * f.uz + (z - f.cz) * f.ux);
    }
  }
  return ws.length >= 2 ? [Math.min(...ws), Math.max(...ws)] : null;
}

/** MGM tower: three stacked tiers (copper / blue glass / gold) between wavy boundaries, each inset / trimmed a little
 *  differently (the steps), a lit floor line per floor following the waves, a lit rim per tier top, "MGM GRAND" in bulbs
 *  across both long faces of the gold tier. */
function mgmTower(rec: BuildingRec, ctx: LandmarkCtx): BuildOut {
  const s = new Sink();
  const ring0 = partRings(rec)?.[0];
  if (!ring0) return EMPTY;
  const G = M.mgm;
  const f = footprintFrame(ring0);
  const H = rec.height ?? 120;
  const len = 2 * f.a;
  const g = ctx.ground;
  const c0 = f.cx * f.ux + f.cz * f.uz;
  const n = G.colours.length;
  const tiers = G.trim.map(([tw, te], k) => {
    let r = G.inset[k] ? inset(ring0, G.inset[k]!) : ring0;
    r = clipRing(clipRing(r, -f.ux, -f.uz, -(c0 - f.a + tw)), f.ux, f.uz, c0 + f.a - te);
    return densify(r, G.densify);
  });
  let shift = -Infinity; // the roofline's crest = the OSM height
  for (let i = 0; i < tiers[n - 1]!.length; i += 2) shift = Math.max(shift, mgmWave(n, along(f, tiers[n - 1]![i]!, tiers[n - 1]![i + 1]!), len, H));
  shift = H - shift;
  const wave = (k: number, x: number, z: number) => (k === 0 ? -L.sink : mgmWave(k, along(f, x, z), len, H) + (k === n ? shift : 0));
  tiers.forEach((r, k) => {
    const m = r.length / 2;
    const yb = Array.from({ length: m }, (_, i) => g + wave(k, r[2 * i]!, r[2 * i + 1]!));
    const yt = Array.from({ length: m }, (_, i) => g + wave(k + 1, r[2 * i]!, r[2 * i + 1]!));
    const sgn = ringArea(r) < 0 ? 1 : -1;
    const wall = paint(s, 'metal', rgb(G.colours[k]!));
    const idx = triangulate(r);
    for (let t = 0; t < idx.length; t += 3) {
      const [a, b, c] = [idx[t]!, idx[t + 1]!, idx[t + 2]!];
      const P = (v: number, y: number[]): V3 => [r[2 * v]!, y[v]!, r[2 * v + 1]!];
      triOut(wall, P(a, yt), P(b, yt), P(c, yt), [0, 1, 0]);
      if (k) triOut(wall, P(a, yb), P(b, yb), P(c, yb), [0, -1, 0]);
    }
    const ro = outward(r, 0.12);
    const nf = Math.max(1, Math.round((yt.reduce((a, y, i) => a + y - yb[i]!, 0) / m) / G.floor));
    const band = glow(G.bands[k]!, G.bandBright[k]!);
    for (let i = 0; i < m; i++) {
      const j = (i + 1) % m;
      const [dx, dz] = [r[2 * j]! - r[2 * i]!, r[2 * j + 1]! - r[2 * i + 1]!];
      const out: V3 = [sgn * dz, 0, -sgn * dx];
      quadOut(wall, [r[2 * i]!, yb[i]!, r[2 * i + 1]!], [r[2 * j]!, yb[j]!, r[2 * j + 1]!], [r[2 * j]!, yt[j]!, r[2 * j + 1]!], [r[2 * i]!, yt[i]!, r[2 * i + 1]!], out);
      const lit = paint(s, 'neon', band);
      const Q = (v: number, y: number): V3 => [ro[2 * v]!, y, ro[2 * v + 1]!];
      for (let fl = 1; fl < nf; fl++) {
        const [ya, yc] = [yb[i]! + ((yt[i]! - yb[i]!) * fl) / nf, yb[j]! + ((yt[j]! - yb[j]!) * fl) / nf];
        const h = G.floor * G.lit;
        quadOut(lit, Q(i, ya), Q(j, yc), Q(j, yc + h), Q(i, ya + h), out);
      }
      const rim = paint(s, 'neon', glow(G.bands[k]!, G.bandBright[k]! * 1.8));
      quadOut(rim, Q(i, yt[i]! - 0.8), Q(j, yt[j]! - 0.8), Q(j, yt[j]! - 0.2), Q(i, yt[i]! - 0.2), out);
    }
  });
  s.prism([ring0], g - L.sink, g + H * G.splits[0]! - G.wave.amp);
  // MGM GRAND across both long faces of the gold tier
  const top = tiers[n - 1]!;
  const W = signCols(G.sign);
  const [tw, te] = G.trim[n - 1]!;
  const p = Math.min(G.signPixel, (G.signShare * (len - tw - te)) / W);
  const uc = G.signAt * len;
  const yc = g + (mgmWave(n - 1, uc, len, H) + mgmWave(n, uc, len, H) + shift) / 2;
  const gap = ((1 - M.pixel) * p) / 2;
  const neon = paint(s, 'neon', glow(G.signColour, G.signBright));
  for (const side of [1, -1]) {
    const X = (u: number): V3 | null => {
      const c = chordAt(top, f, u);
      if (!c) return null;
      const w = (side > 0 ? c[1] : c[0]) + side * 0.35;
      return [f.cx + u * f.ux - w * f.uz, 0, f.cz + u * f.uz + w * f.ux];
    };
    const out: V3 = [-f.uz * side, 0, f.ux * side];
    for (const [k0, k1, row] of signRuns(G.sign)) {
      const [a, b] = [X(uc + side * ((k0 - W / 2) * p + gap)), X(uc + side * ((k1 + 1 - W / 2) * p - gap))];
      if (!a || !b) continue;
      const y1 = yc + (3.5 - row) * p - gap;
      const y0 = y1 - M.pixel * p;
      quadOut(neon, [a[0], y0, a[2]], [b[0], y0, b[2]], [b[0], y1, b[2]], [a[0], y1, a[2]], out);
    }
  }
  return s.out();
}

/** Sitting lion facing (fx, fz) on a plinth top at (x, y, z); local unit = metres × scale. */
function lion(b: MeshBuffer, x: number, y: number, z: number, fx: number, fz: number, k: number) {
  const P = (f: number, up: number, side: number): V3 => [x + (fx * f - fz * side) * k, y + up * k, z + (fz * f + fx * side) * k];
  // gilded and floodlit from the plinth: unlit 'neon', brighter on the faces turned down / sideways (uplight)
  const shade = (ny: number) => glow(M.mgm.lion.colour, M.mgm.lion.bright * (0.55 + 0.45 * (1 - ny) / 2));
  const e = (c: V3, r: V3) => ellipsoid(b, c, [fx, fz], [r[0] * k, r[1] * k, r[2] * k], 6, 10, shade);
  e(P(-0.9, 1.6, 0), [2.2, 1.6, 1.5]); // haunches / body
  e(P(0.5, 3.1, 0), [1.4, 2, 1.35]); // chest
  e(P(1.1, 5.1, 0), [1.4, 1.5, 1.45]); // mane
  e(P(2.2, 4.9, 0), [0.75, 0.6, 0.6]); // muzzle
  for (const side of [-0.7, 0.7]) {
    e(P(1.7, 1.4, side), [0.45, 1.5, 0.4]); // forelegs
    e(P(2.1, 0.25, side), [0.6, 0.3, 0.4]); // paws
    e(P(-1.2, 1.1, side * 2), [1.3, 1.1, 0.45]); // hind legs
  }
}

function mgmPodium(rec: BuildingRec, ctx: LandmarkCtx): BuildOut {
  const s = new Sink();
  const rings = partRings(rec);
  if (!rings) return EMPTY;
  const G = M.mgm;
  const top = rec.height!;
  const g = ctx.ground;
  renderPart({ ...rec, colour: G.podium }, opts(ctx, top), s);
  strip(paint(s, 'neon', glow(G.rim, G.rimBright)), rings[0]!, g + top - 1, g + top - 0.3);
  ribs(paint(s, 'neon', glow(G.rim, G.ribBright)), rings[0]!, g + 5, g + top - 1, G.rib, 0.3);
  // Grande Praça: glass barrel vault along the podium axis, metal ribs
  const f = footprintFrame(rings[0]!);
  const V = G.praca;
  const [hl, hw, n] = [V.length / 2, V.width / 2, 10];
  const at = (u: number, k: number): V3 => {
    const a = (Math.PI * k) / n;
    const w = -hw * Math.cos(a);
    return [V.x + u * f.ux - w * f.uz, g + top + V.rise * Math.sin(a), V.z + u * f.uz + w * f.ux];
  };
  const glass = s.buf('glass');
  for (let k = 0; k < n; k++) {
    const mid = at(0, k + 0.5);
    quadOut(glass, at(-hl, k), at(hl, k), at(hl, k + 1), at(-hl, k + 1), [mid[0] - V.x, mid[1] - g - top + 0.01, mid[2] - V.z], 0, 0, V.length / L.glassTile, V.width / L.glassTile);
  }
  for (const u of [-hl, hl]) for (let k = 1; k < n - 1; k++) triOut(glass, at(u, 0), at(u, k), at(u, k + 1), [Math.sign(u) * f.ux, 0, Math.sign(u) * f.uz]);
  const vaultRibs = paint(s, 'metal', rgb('#cfc6b0'), 'near');
  for (let u = -hl; u <= hl + 0.01; u += 5) {
    for (let k = 0; k < n; k++) {
      const [p, q] = [at(u, k), at(u, k + 1)];
      quadOut(vaultRibs, [p[0], p[1] + 0.25, p[2]], [q[0], q[1] + 0.25, q[2]], [q[0] + f.ux * 0.3, q[1] + 0.25, q[2] + f.uz * 0.3], [p[0] + f.ux * 0.3, p[1] + 0.25, p[2] + f.uz * 0.3], [0, 1, 0]);
    }
  }
  // golden lion on the OSM artwork point (way/823036882)
  const art = rec.points?.find((p) => p.kind === 'artwork');
  if (art) {
    const yg = ctx.height(art.x, art.z);
    const r = Math.min(art.r ?? 4, 6) * 0.75;
    const ph = G.lion.plinth;
    revolve(paint(s, 'masonry', rgb('#8f8778')), art.x, art.z, [[yg - L.sink, r], [yg + ph, r], [yg + ph, r * 0.92], [yg + ph + 0.4, r * 0.92]], 20);
    loft(paint(s, 'neon', glow(G.rim, G.rimBright), 'near'), [circle(art.x, art.z, r + 0.05, yg + ph - 0.35, 20), circle(art.x, art.z, r + 0.05, yg + ph - 0.1, 20)]);
    s.prism([circle(art.x, art.z, r, 0, 12).flatMap((p) => [p[0], p[2]])], yg - L.sink, yg + ph + 0.4);
    const az = (G.lion.facing * Math.PI) / 180;
    lion(s.buf('neon', 'near'), art.x, yg + ph + 0.4, art.z, Math.sin(az), -Math.cos(az), G.lion.scale);
  }
  return s.out();
}

// ── Sands ──

function sands(rec: BuildingRec, ctx: LandmarkCtx): BuildOut {
  const s = new Sink();
  const ring = partRings(rec)?.[0];
  if (!ring) return EMPTY;
  const S = M.sands;
  const D = S.drum;
  const g = ctx.ground;
  const yb = ctx.minGround - L.sink;
  // "Sands Macao Hotel" (OSM way/667429625, no height, inside the casino outline under the wings' roof, most of its walls ON
  // the casino's): nothing, a plain block z-fought with the dark walls (audit a4)
  if (!rec.height) return EMPTY;
  // the hotel tower (OSM way/1201888817, inside the wings' outline): gold glass like the drum (audit a4, photo Commons
  // "Macau Fisherman's Wharf and Sands Macau 13-06-2025(1).jpg"), not a plain punched-window tower
  if (rec.height > S.tower.above) {
    litSlab(s, inset(ring, S.tower.inset), ctx, rec.height, S.gold, S.tower.floor, S.tower.lit, glow(S.band, S.tower.bandBright), glow(S.rim, S.rimBright));
    return s.out();
  }
  // G4 (photos): the small round record (OSM way/1418312721, h 61.8) = the gold glass drum carrying the stacked "hat"
  // crown; the big one = dark navy glass wings with gold fins, cut off at the drum's centre line (no z-fighting walls)
  if (Math.abs(ringArea(ring)) < D.maxArea) {
    const [cx, cz] = ringCentroid(ring);
    let r = 0;
    for (let i = 0; i < ring.length; i += 2) r += Math.hypot(ring[i]! - cx, ring[i + 1]! - cz) / (ring.length / 2);
    const crownH = D.crown.reduce((t, [, h]) => t + h, 0);
    const top = (rec.height ?? 61.8) - crownH; // drum wall top: the crown reaches the OSM height
    loft(paint(s, 'metal', rgb(S.gold)), [circle(cx, cz, r, yb, 48), circle(cx, cz, r, g + top, 48)]);
    s.prism([circle(cx, cz, r, 0, 16).flatMap((p) => [p[0], p[2]])], yb, g + top);
    const dr = circle(cx, cz, r, 0, 48).flatMap((p) => [p[0], p[2]]);
    const b = paint(s, 'neon', glow(S.band, S.bandBright));
    for (const y of S.bands) if (y < top - 1) strip(b, dr, g + y, g + y + 0.7);
    ribs(paint(s, 'neon', glow(S.band, S.ribBright)), dr, g + S.bands[0]!, g + top, S.rib, 0.3);
    // crown, bottom → top: [radius share, height m], plain gold (the 'metal' facade shader would draw windows), lit brims
    let y = g + top;
    const lit = paint(s, 'neon', glow(S.rim, S.rimBright));
    const solid = paint(s, 'masonry', rgb(S.gold));
    disc(solid, circle(cx, cz, r, y, 48), 1);
    for (const [k, h] of D.crown) {
      const lo = circle(cx, cz, r * k, y, 48);
      const hi = circle(cx, cz, r * k, y + h, 48);
      loft(solid, [lo, hi]);
      disc(solid, lo, -1);
      disc(solid, hi, 1);
      if (k > 1) strip(lit, lo.flatMap((p) => [p[0], p[2]]), y + h - 0.35, y + h + 0.05);
      y += h;
    }
    return s.out();
  }
  const body = (rec.height ?? 46.7) * S.bodyShare;
  const wing = clipRing(ring, 0, -1, -D.z);
  renderPart({ outer: wing, kind: rec.kind, height: body, material: 'metal', colour: S.dark }, opts(ctx, body), s);
  ribs(paint(s, 'neon', glow(S.band, S.ribBright)), wing, g + 4, g + body - 1, S.rib, 0.3);
  strip(paint(s, 'neon', glow(S.rim, S.rimBright)), wing, g + body - 1, g + body + 0.2);
  const m = midInside(wing);
  roofSign(s, m.x, m.z, m.f.ux, m.f.uz, g + body, S.sign, S.signPixel, 1.2 * m.f.b, glow(S.signColour, S.signBright));
  return s.out();
}

// ── Fisherman's Wharf ──

/** Colosseum arcade along the Roman Amphitheatre's OWN outline (OSM way/192180012; an axis-aligned ellipse fitted by eye was 34 %
 *  bigger and spilled over the neighbouring houses): wall with arched bays per tier, cornices, lit arch outlines, pilasters
 *  (near). The wall stands `edge` m inside the outline (the cornices / pilasters / arch ends stay inside it); no plain OSM block is left
 *  inside (the way belongs to the landmark): the solid core and the arena roof are built here. */
function colosseum(s: Sink, ctx: LandmarkCtx, outline: XZ) {
  const C = M.wharf.colosseum;
  const cur = outlineCurve(outline, C.smooth);
  const [cx, cz] = ringCentroid(outline);
  const yg = ctx.height(cx, cz);
  const yb = ctx.minGround - L.sink; // the DEM falls 2 m to the E / SE: the wall (and the ground tier's pilasters) reach the lowest ground, no gap
  const total = C.tiers.reduce((t, h) => t + h, 0);
  const n = C.arches * 2;
  const wall = paint(s, 'masonry', rgb(C.colour));
  const ring = (y: number, grow = 0): V3[] => Array.from({ length: n }, (_, k) => {
    const e = cur.at(k / n, C.edge + grow);
    return [e.x, y, e.z];
  });
  const [top, topIn] = [ring(yg + total), ring(yg + total, -3)];
  loft(wall, [ring(yb), top]);
  loft(wall, [topIn, ring(yb, -3)]); // inner face (seen from above, over the core's roof)
  for (let k = 0; k < n; k++) quadOut(wall, topIn[k]!, topIn[(k + 1) % n]!, top[(k + 1) % n]!, top[k]!, [0, 1, 0]);
  const xz = (r: V3[]) => r.flatMap((p) => [p[0], p[2]]);
  // Leg 2 fix (code review M3): the arcade is open at street level (footways run through it): the wall ring collider starts
  // above the ground tier; the solid core (what the plain OSM block was) is the footprint up to the arena roof
  s.prism([xz(ring(0)), xz(ring(0, -3).reverse())], yg + C.tiers[0]!, yg + total);
  s.prism([xz(ring(0))], yb, yg + C.core);
  const dark = paint(s, 'masonry', rgb(C.arch));
  const lit = paint(s, 'neon', glow(C.lit, C.litBright));
  const pil = paint(s, 'masonry', rgb(C.colour), 'near');
  const bay = cur.length / C.arches;
  let y0 = yg;
  C.tiers.forEach((h, tier) => {
    const attic = tier === C.tiers.length - 1;
    for (let k = 0; k < C.arches; k++) {
      const e = cur.at((k + 0.5) / C.arches, C.edge);
      const P = (u: number, y: number, o: number): V3 => [e.x + e.tx * u + e.nx * o, y, e.z + e.tz * u + e.nz * o];
      const out: V3 = [e.nx, 0, e.nz];
      const r = bay * 0.3;
      if (attic) {
        quadOut(dark, P(-r * 0.6, y0 + h * 0.3, 0.25), P(r * 0.6, y0 + h * 0.3, 0.25), P(r * 0.6, y0 + h * 0.75, 0.25), P(-r * 0.6, y0 + h * 0.75, 0.25), out);
      } else {
        const ys = y0 + h * 0.85 - r;
        const poly = [-r, y0 + 0.2, ...arch(r, ys, 8), r, y0 + 0.2];
        const idx = triangulate(poly);
        for (let i = 0; i < idx.length; i += 3) {
          const [a, b, c] = [idx[i]!, idx[i + 1]!, idx[i + 2]!].map((v) => P(poly[2 * v]!, poly[2 * v + 1]!, 0.25)) as [V3, V3, V3];
          triOut(dark, a, b, c, out);
        }
        const [ao, ai] = [arch(r + 0.3, ys, 8), arch(r, ys, 8)];
        for (let i = 0; i + 3 < ao.length; i += 2) {
          quadOut(lit, P(ao[i]!, ao[i + 1]!, 0.35), P(ai[i]!, ai[i + 1]!, 0.35), P(ai[i + 2]!, ai[i + 3]!, 0.35), P(ao[i + 2]!, ao[i + 3]!, 0.35), out);
        }
      }
      // pilaster on the bay's edge
      const e2 = cur.at(k / C.arches, C.edge);
      const Q = (u: number, o: number, y: number): V3 => [e2.x + e2.tx * u + e2.nx * o, y, e2.z + e2.tz * u + e2.nz * o];
      const [w, d, p0] = [0.45, 0.5, tier ? y0 : yb];
      for (const [u0, o0, u1, o1] of [[-w, d, w, d], [w, 0, w, d], [-w, d, -w, 0]] as const) {
        quadOut(pil, Q(u0, o0, p0), Q(u1, o1, p0), Q(u1, o1, y0 + h), Q(u0, o0, y0 + h), [e2.nx * (o0 + o1 - 0.5) + e2.tx * (u0 + u1), 0, e2.nz * (o0 + o1 - 0.5) + e2.tz * (u0 + u1)]);
      }
    }
    y0 += h;
    // cornice
    const [cLo, cHi, c0] = [ring(y0 - 0.5, 0.6), ring(y0, 0.6), ring(y0, 0)];
    loft(wall, [cLo, cHi]);
    for (let k = 0; k < n; k++) quadOut(wall, c0[k]!, c0[(k + 1) % n]!, cHi[(k + 1) % n]!, cHi[k]!, [0, 1, 0]);
  });
  strip(lit, xz(ring(0)), yg + total - 0.3, yg + total + 0.3, 0.5); // lit crown
  disc(paint(s, 'masonry', rgb('#b49a6e')), ring(yg + C.core, -3), 1); // arena / cavea over the core
}

function lighthouse(s: Sink, site: XZ, ctx: LandmarkCtx) {
  const H = M.wharf.lighthouse;
  const az = (H.azimuth * Math.PI) / 180;
  const [dx, dz] = [Math.sin(az), -Math.cos(az)];
  let [best, px, pz] = [-Infinity, 0, 0];
  for (let i = 0; i < site.length; i += 2) {
    const d = site[i]! * dx + site[i + 1]! * dz;
    if (d > best) [best, px, pz] = [d, site[i]!, site[i + 1]!];
  }
  const [cx, cz] = ringCentroid(site);
  const l = Math.hypot(cx - px, cz - pz) || 1;
  const [x, z] = [px + ((cx - px) / l) * H.inset, pz + ((cz - pz) / l) * H.inset];
  // the tip is on the quay: the DEM there is carveRiver's slope down to the sea bed (8 m under the coping), the highest
  // ground within `reach` is the quay top
  const yg = Math.max(ctx.height(x, z), ...circle(x, z, H.reach, 0, 8).map((p) => ctx.height(p[0], p[2])));
  const bands = 6;
  const rAt = (t: number) => H.r * (1 - 0.3 * t);
  for (let k = 0; k < bands; k++) {
    const [t0, t1] = [k / bands, (k + 1) / bands];
    const b = paint(s, 'masonry', rgb(k % 2 ? H.red : H.white));
    loft(b, [circle(x, z, rAt(t0), k ? yg + H.height * t0 : yg - L.sink, 16), circle(x, z, rAt(t1), yg + H.height * t1, 16)]);
  }
  const top = yg + H.height;
  const white = paint(s, 'masonry', rgb(H.white));
  revolve(white, x, z, [[top, H.r * 1.05], [top + 0.4, H.r * 1.05]], 16); // gallery
  revolve(paint(s, 'neon', glow(H.lamp, H.lampBright)), x, z, [[top + 0.4, H.r * 0.55], [top + 2.6, H.r * 0.55]], 12);
  revolve(paint(s, 'masonry', rgb(H.red)), x, z, [[top + 2.6, H.r * 0.7], [top + 4, 0.05]], 12);
  s.prism([circle(x, z, H.r, 0, 10).flatMap((p) => [p[0], p[2]])], yg - L.sink, top);
}

function wharfSite(rec: BuildingRec, ctx: LandmarkCtx): BuildOut {
  const s = new Sink();
  const ring = partRings(rec)?.[0];
  if (ring) lighthouse(s, ring, ctx);
  return s.out();
}

/** The Roman Amphitheatre record (OSM way/192180012: building=yes, no height, ~3 000 m²): the Colosseum arcade on its outline. */
const isArena = (rec: BuildingRec) => !rec.height && Math.abs(ringArea(rec.outer)) < 6000;
function wharfArena(rec: BuildingRec, ctx: LandmarkCtx): BuildOut {
  const s = new Sink();
  colosseum(s, ctx, rec.outer);
  return s.out();
}

function wharfCentre(rec: BuildingRec, ctx: LandmarkCtx): BuildOut {
  const s = new Sink();
  const ring = partRings(rec)?.[0];
  if (!ring) return EMPTY;
  const W = M.wharf;
  const top = rec.height ?? 20.8;
  const g = ctx.ground;
  renderPart({ ...rec, height: top }, opts(ctx, top), s);
  strip(paint(s, 'neon', glow(W.rim, W.rimBright)), ring, g + top - 0.9, g + top - 0.3);
  // "Babylon" ziggurat: stepped square terraces on the roof, lit edges
  const Z = W.ziggurat;
  const m = midInside(ring);
  const zig = paint(s, 'masonry', rgb(Z.colour));
  const edge = paint(s, 'neon', glow(Z.edge, Z.edgeBright));
  Z.steps.forEach((side, k) => {
    const h = side / 2;
    const sq: XZ = [[-h, -h], [h, -h], [h, h], [-h, h]].flatMap(([u, w]) => [m.x + u! * m.f.ux - w! * m.f.uz, m.z + u! * m.f.uz + w! * m.f.ux]);
    const [y0, y1] = [g + top + k * Z.stepH, g + top + (k + 1) * Z.stepH];
    const r3 = (y: number) => Array.from({ length: 4 }, (_, i): V3 => [sq[2 * i]!, y, sq[2 * i + 1]!]);
    loft(zig, [r3(y0), r3(y1)]);
    quadOut(zig, ...(r3(y1) as [V3, V3, V3, V3]), [0, 1, 0]);
    strip(edge, sq, y1 - 0.5, y1, 0.1);
  });
  return s.out();
}

export const details: Partial<Record<LandmarkId, DetailFn>> = {
  'hotel-lisboa': (rec, parts: PartRec[], ctx0, h) => {
    const piece = lisboaPiece(rec);
    // the podium outline climbs the slope to the NE (recordGround → 12 m up, over the drum): heights from the centroid
    const ctx = { ...ctx0, ground: ctx0.height(...ringCentroid(rec.outer)) };
    return piece === 'round' ? lisboaRound(rec, ctx) : piece === 'wing' ? lisboaWing(rec, ctx) : piece === 'podium' ? lisboaPodium(rec, ctx) : h.generic(rec, parts, ctx);
  },
  'wynn-macau': (rec, parts, ctx, h) => {
    const H = rec.height ?? 0;
    if (H > 80) return wynnTower(rec, ctx, H < 150);
    const area = Math.abs(ringArea(rec.outer));
    if (H > 0 && area > 20000) return wynnPodium(rec, ctx);
    return h.generic(H || area > 500 ? rec : { ...rec, height: M.wynn.kiosk }, parts, ctx); // the 10 × 15 m untagged pavilion by the lake: not a 20 m block
  },
  'mgm-macau': (rec, parts, ctx, h) => ((rec.height ?? 0) > 60 ? mgmTower(rec, ctx) : rec.height ? mgmPodium(rec, ctx) : h.generic(rec, parts, ctx)),
  'sands-macau': (rec, _parts, ctx) => sands(rec, ctx),
  'fisherman-wharf': (rec, _parts, ctx) => (rec.kind === 'artwork' ? wharfSite(rec, ctx) : isArena(rec) ? wharfArena(rec, ctx) : wharfCentre(rec, ctx)),
};
