// Leg 2 landmark group m3 (docs/plans/leg2-landmarks.md §4, agent o3): the casino resorts, built in code from the OSM
// outlines (no downloads). Tunables: config landmarks.m3 (figures cited there; the rest estimated, see
// docs/reports/leg2-landmarks-o3.md). Night = THE moment for these: every light is a 'neon' bucket (unlit MeshBasic,
// linear colour × bright × lighting.emissiveScale → bloom); the chunk worker cannot tell day from night, so they are on
// by day too (casino LEDs are). No real lights. Colliders only on simplified solids (renderPart prisms, plinths, towers).
//   hotel-lisboa (zone): round 37.4 m drum = Casino Lisboa rotunda + its gold lit "birdcage" crown; > 60 m = the hotel
//     tower (lit floor bands, "LISBOA" bulb sign on the roof); other building = podium with bulb strips; roofs generic.
//   wynn-macau: Encore (> 150 m) / Wynn (> 80 m) gold slabs, lit floor bands, roof LED rim, "WYNN" sign; the big podium
//     (+ Performance Lake jets at the OSM fountain node); the small blocks generic.
//   mgm-macau: the tower cut in 3 wave sections (gold / silver / rose gold, stepped tops), "MGM" sign; the podium with
//     the Grande Praça glass vault and the golden lion on its OSM artwork point.
//   sands-macau: gold glass block, lit bands, roof rim, red "SANDS" sign.
//   fisherman-wharf: the site polygon carries the Colosseum arcade (wrapping the plain OSM amphitheatre building) and a
//     lighthouse on the seaward tip; the convention centre gets a "Babylon" ziggurat roof and an LED rim.
import { landmarks as L, lighting as LT } from '../../config.ts';
import { type BuildingRec, type LandmarkId, type PartRec, ringArea, type XZ } from '../../geo/chunkData.ts';
import { ringCentroid } from '../../geo/clip.ts';
import type { BuildOut, MaterialId } from '../buildTypes.ts';
import { type MeshBuffer, triangulate, type V3 } from '../geom.ts';
import type { DetailFn, LandmarkCtx } from './index.ts';
import { arch, footprintFrame, loft, quadOut, triOut } from './kit.ts';
import { keyed, outward } from './mf2.ts';
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

/** A footprint cut into `n` equal slices along its long axis, ordered west → east (by centroid x). */
export function sections(ring: XZ, n: number): XZ[] {
  const f = footprintFrame(ring);
  const c0 = f.cx * f.ux + f.cz * f.uz; // u of the frame centre
  const out: XZ[] = [];
  for (let k = 0; k < n; k++) {
    const [u0, u1] = [c0 - f.a + (2 * f.a * k) / n, c0 - f.a + (2 * f.a * (k + 1)) / n];
    const s = clipRing(clipRing(ring, f.ux, f.uz, u1), -f.ux, -f.uz, -u0);
    if (s.length >= 6 && Math.abs(ringArea(s)) > 1) out.push(s);
  }
  return out.sort((p, q) => ringCentroid(p)[0] - ringCentroid(q)[0]);
}

export type LisboaPiece = 'drum' | 'tower' | 'podium' | 'generic';
/** Which Hotel Lisboa record this is (foundation report: the 37.4 m round drum (r ≈ 22 m), the 76.8 m tower, the 27.8 m
 *  hotel, itself roundish but ≈ 150 m across). */
export function lisboaPiece(rec: BuildingRec): LisboaPiece {
  if (rec.kind === 'roof' || !rec.height) return 'generic';
  if (rec.height > 60) return 'tower';
  const f = footprintFrame(rec.outer);
  if (f.a < 35 && f.a / f.b < 1.2 && Math.abs(ringArea(rec.outer)) > 0.7 * Math.PI * f.a * f.b) return 'drum';
  return 'podium';
}

/** Point on the axis-aligned ellipse (centre, half-axes a along x, b along z) and its outward unit normal / tangent. */
export function ellipseAt(cx: number, cz: number, a: number, b: number, t: number) {
  const [c, s] = [Math.cos(t), Math.sin(t)];
  const nl = Math.hypot(b * c, a * s);
  const tl = Math.hypot(a * s, b * c);
  return { x: cx + a * c, z: cz + b * s, nx: (b * c) / nl, nz: (a * s) / nl, tx: (-a * s) / tl, tz: (b * c) / tl };
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

function lisboaDrum(rec: BuildingRec, ctx: LandmarkCtx): BuildOut {
  const s = new Sink();
  const C = M.lisboa.colours;
  const B = M.lisboa.bright;
  const ring = partRings(rec)?.[0];
  if (!ring) return EMPTY;
  const [cx, cz] = ringCentroid(ring);
  let R = 0;
  for (let i = 0; i < ring.length; i += 2) R += Math.hypot(ring[i]! - cx, ring[i + 1]! - cz) / (ring.length / 2);
  const g = ctx.ground;
  const top = rec.height!;
  const D = M.lisboa.drumTop;
  renderPart({ ...rec, height: D, colour: C.drum }, opts(ctx, D), s);
  // cage: dark gold shell, lit ribs (the lattice) from the street up over the crown, rings of bulbs
  const H = top - D;
  const rAt = (t: number) => R * keyed(M.lisboa.cage, t);
  const n = M.lisboa.segs;
  const ts = Array.from({ length: 13 }, (_, k) => k / 12);
  loft(paint(s, 'metal', rgb(C.shell)), ts.map((t) => circle(cx, cz, rAt(t) - 0.25, g + D + H * t, n)));
  disc(s.buf('metal'), circle(cx, cz, rAt(1) - 0.25, g + top, n), 1);
  const rib = paint(s, 'neon', glow(C.rib, B.rib));
  const prof: [number, number][] = [[g + 1.5, R + 0.15], [g + D, R + 0.15], ...ts.map((t): [number, number] => [g + D + H * t, rAt(t) + 0.05])];
  for (let k = 0; k < M.lisboa.ribs; k++) {
    const a = (TAU * k) / M.lisboa.ribs;
    const [dx, dz, tx, tz] = [Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a)];
    for (let i = 0; i + 1 < prof.length; i++) {
      const [[y0, r0], [y1, r1]] = [prof[i]!, prof[i + 1]!];
      const w = 0.3;
      const P = (y: number, r: number, side: number): V3 => [cx + dx * r + tx * w * side, y, cz + dz * r + tz * w * side];
      quadOut(rib, P(y0, r0, -1), P(y0, r0, 1), P(y1, r1, 1), P(y1, r1, -1), [dx, 0, dz]);
    }
  }
  const bulbs = paint(s, 'neon', glow(C.ring, B.ring));
  for (let k = 0; k < M.lisboa.cageRings; k++) {
    const t = (k + 0.5) / M.lisboa.cageRings;
    loft(bulbs, [circle(cx, cz, rAt(t) + 0.1, g + D + H * t - 0.2, n), circle(cx, cz, rAt(t) + 0.1, g + D + H * t + 0.2, n)]);
  }
  for (const y of [D - 0.6]) loft(bulbs, [circle(cx, cz, R + 0.2, g + y, n), circle(cx, cz, R + 0.2, g + y + 0.5, n)]);
  return s.out();
}

function lisboaTower(rec: BuildingRec, ctx: LandmarkCtx): BuildOut {
  const s = new Sink();
  const ring = partRings(rec)?.[0];
  if (!ring) return EMPTY;
  const C = M.lisboa.colours;
  const T = M.lisboa.tower;
  const top = rec.height!;
  litSlab(s, ring, ctx, top, C.wall, T.band, T.lit, glow(C.band, M.lisboa.bright.band), glow(C.bulb, M.lisboa.bright.bulb));
  const m = midInside(ring);
  roofSign(s, m.x, m.z, m.f.ux, m.f.uz, ctx.ground + top, T.sign, T.pixel, 1.4 * m.f.a, glow(C.sign, M.lisboa.bright.sign));
  return s.out();
}

function lisboaPodium(rec: BuildingRec, ctx: LandmarkCtx): BuildOut {
  const s = new Sink();
  const rings = partRings(rec);
  if (!rings) return EMPTY;
  const C = M.lisboa.colours;
  renderPart({ ...rec, colour: C.podium }, opts(ctx, rec.height!), s);
  const b = paint(s, 'neon', glow(C.bulb, M.lisboa.bright.bulb));
  for (const y of M.lisboa.podiumBands) if (y < rec.height!) strip(b, rings[0]!, ctx.ground + y, ctx.ground + y + 0.6);
  ribs(paint(s, 'neon', glow(C.rib, M.lisboa.bright.rib)), rings[0]!, ctx.ground + M.lisboa.podiumBands[0]!, ctx.ground + rec.height! - 1, M.lisboa.podiumRib); // the gold lattice
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

function mgmTower(rec: BuildingRec, ctx: LandmarkCtx): BuildOut {
  const s = new Sink();
  const ring = partRings(rec)?.[0];
  if (!ring) return EMPTY;
  const G = M.mgm;
  const scale = (rec.height ?? G.tops.at(-1)!) / G.tops.at(-1)!; // OSM height on the tallest wave
  const secs = sections(ring, G.tops.length);
  secs.forEach((sec, k) => {
    const top = G.tops[k]! * scale;
    litSlab(s, sec, ctx, top, G.colours[k]!, G.floor, G.lit, glow(G.band, G.bandBright), glow(G.colours[k]!, 1.6));
  });
  const tallest = secs.at(-1);
  if (tallest) {
    const m = midInside(tallest);
    roofSign(s, m.x, m.z, m.f.ux, m.f.uz, ctx.ground + G.tops.at(-1)! * scale, G.sign, G.signPixel, 1.6 * m.f.a, glow(G.signColour, G.signBright));
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
  const top = rec.height ?? 46.7;
  const g = ctx.ground;
  renderPart({ ...rec, height: top, material: 'metal', colour: S.gold }, opts(ctx, top), s);
  const b = paint(s, 'neon', glow(S.band, S.bandBright));
  for (const y of S.bands) strip(b, ring, g + y, g + y + 0.7);
  ribs(paint(s, 'neon', glow(S.band, S.ribBright)), ring, g + S.bands[0]!, g + top - 1, S.rib, 0.3);
  strip(paint(s, 'neon', glow(S.rim, S.rimBright)), ring, g + top - 1, g + top + 0.2);
  const m = midInside(ring);
  roofSign(s, m.x, m.z, m.f.ux, m.f.uz, g + top, S.sign, S.signPixel, 1.2 * m.f.b, glow(S.signColour, S.signBright));
  return s.out();
}

// ── Fisherman's Wharf ──

/** Colosseum arcade: elliptical wall with arched bays per tier, cornices, lit arch outlines, pilasters (near). */
function colosseum(s: Sink, ctx: LandmarkCtx) {
  const C = M.wharf.colosseum;
  const yg = ctx.height(C.x, C.z);
  const yb = yg - L.sink;
  const total = C.tiers.reduce((t, h) => t + h, 0);
  const n = C.arches * 2;
  const wall = paint(s, 'masonry', rgb(C.colour));
  const ring = (y: number, grow = 0): V3[] => Array.from({ length: n }, (_, k) => {
    const e = ellipseAt(C.x, C.z, C.a + grow, C.b + grow, (TAU * k) / n);
    return [e.x, y, e.z];
  });
  loft(wall, [ring(yb), ring(yg + total)]);
  loft(wall, [ring(yg + total, -3), ring(yb, -3)]); // inner face (seen from above, over the plain block)
  for (let k = 0; k < n; k++) quadOut(wall, ring(yg + total, -3)[k]!, ring(yg + total, -3)[(k + 1) % n]!, ring(yg + total)[(k + 1) % n]!, ring(yg + total)[k]!, [0, 1, 0]);
  // Leg 2 fix (code review M3): the arcade is open at street level (footways run through it): the collider is the wall
  // ring above the ground tier only, not a solid ellipse
  s.prism([ring(0).flatMap((p) => [p[0], p[2]]), ring(0, -3).reverse().flatMap((p) => [p[0], p[2]])], yg + C.tiers[0]!, yg + total);
  const dark = paint(s, 'masonry', rgb(C.arch));
  const lit = paint(s, 'neon', glow(C.lit, C.litBright));
  const pil = paint(s, 'masonry', rgb(C.colour), 'near');
  let y0 = yg;
  C.tiers.forEach((h, tier) => {
    const attic = tier === C.tiers.length - 1;
    for (let k = 0; k < C.arches; k++) {
      const e = ellipseAt(C.x, C.z, C.a, C.b, (TAU * (k + 0.5)) / C.arches);
      const bay = (Math.PI * (C.a + C.b)) / C.arches; // ≈ perimeter / arches
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
      const e2 = ellipseAt(C.x, C.z, C.a, C.b, (TAU * k) / C.arches);
      const Q = (u: number, o: number, y: number): V3 => [e2.x + e2.tx * u + e2.nx * o, y, e2.z + e2.tz * u + e2.nz * o];
      const [w, d] = [0.45, 0.5];
      for (const [u0, o0, u1, o1] of [[-w, d, w, d], [w, 0, w, d], [-w, d, -w, 0]] as const) {
        quadOut(pil, Q(u0, o0, y0), Q(u1, o1, y0), Q(u1, o1, y0 + h), Q(u0, o0, y0 + h), [e2.nx * (o0 + o1 - 0.5) + e2.tx * (u0 + u1), 0, e2.nz * (o0 + o1 - 0.5) + e2.tz * (u0 + u1)]);
      }
    }
    y0 += h;
    // cornice
    loft(wall, [ring(y0 - 0.5, 0.6), ring(y0, 0.6)]);
    for (let k = 0; k < n; k++) quadOut(wall, ring(y0, 0)[k]!, ring(y0, 0)[(k + 1) % n]!, ring(y0, 0.6)[(k + 1) % n]!, ring(y0, 0.6)[k]!, [0, 1, 0]);
  });
  strip(lit, ring(0).flatMap((p) => [p[0], p[2]]), yg + total - 0.3, yg + total + 0.3, 0.7); // lit crown
  disc(paint(s, 'masonry', rgb('#b49a6e')), ring(yg + 20.3, -3), 1); // arena / cavea over the plain block's roof
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
  const yg = ctx.height(x, z);
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
  colosseum(s, ctx);
  const ring = partRings(rec)?.[0];
  if (ring) lighthouse(s, ring, ctx);
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
    return piece === 'drum' ? lisboaDrum(rec, ctx) : piece === 'tower' ? lisboaTower(rec, ctx) : piece === 'podium' ? lisboaPodium(rec, ctx) : h.generic(rec, parts, ctx);
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
  'fisherman-wharf': (rec, _parts, ctx) => (rec.kind === 'artwork' ? wharfSite(rec, ctx) : wharfCentre(rec, ctx)),
};
