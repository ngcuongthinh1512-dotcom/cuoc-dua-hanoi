// Leg 3 (Hà Nội) landmark details, group h1 = hồ Gươm + Phố Cổ, built in code on top of the generic S3DB body (index.ts
// `generic`, see b.ts for the pattern). Flat ground (y = ctx.ground ≈ 0), daylight. Palette: French-yellow plaster, cream,
// weathered grey stone, terracotta / yellow-brown curved tiles, dark red lacquer, bronze. Heights are set here (the OSM tags
// are wrong or missing: the Ngọc Sơn outline carries a 12 m pyramid), sources in the comments. Details are never solid
// (SPEC §5.9): colliders come from the generic bodies / renderPart prisms only.
// A Sink has ONE 'masonry' buffer: M(s, colour) re-stamps its colour and must be called right before each batch of geometry.
import type { LandmarkId, PartRec } from '../../geo/chunkData.ts';
import type { BuildOut } from '../buildTypes.ts';
import type { V3 } from '../geom.ts';
import { fbox, type Fr, P, rgb, ring, stack, withExtras } from './b.ts';
import { arch, facing } from './c.ts';
import { bar } from './d.ts';
import type { DetailFn } from './index.ts';
import { footprintFrame, quadOut, triOut } from './kit.ts';
import { ngocSon } from './ngocson.ts'; // Đền Ngọc Sơn + Đình Trấn Ba (Thê Húc / Đắc Nguyệt Lâu: thehuc.ts, Tháp Bút: thapbut.ts)
import { Sink } from './parts.ts';

type Buf = Parameters<typeof fbox>[0];

const C = {
  ochre: '#d4ac52', cream: '#efe3c4', lacquer: '#8e150d', tile: '#a9792f', tileB: '#8a5c3c', tileDark: '#6b5a4a', moss: '#868a78', brick: '#8f7460',
  steel: '#4a4744', granite: '#7b7d7f', dark: '#241f1c', plaster: '#c8b48c', base: '#e4d6ae',
};
const EMPTY: BuildOut = { meshes: [], instances: [], colliders: [] };
/** The sink's masonry buffer, stamping `colour` (sRGB hex) on what is added next. */
const M = (s: Sink, colour: string): Buf => {
  const b = s.buf('masonry');
  b.color = rgb(colour);
  return b;
};
/** Frame turned 90°: its u is f's w. A point (a, w) of f is (w, −a) in the turned frame (openings on faces ⊥ w, ridges along w). */
const turn = (f: Fr): Fr => ({ ...f, ux: -f.uz, uz: f.ux, a: f.b, b: f.a });
const U = (f: Fr, s = 1): V3 => [s * f.ux, 0, s * f.uz];
const W = (f: Fr, s = 1): V3 => [-s * f.uz, 0, s * f.ux];
/** Rectangle of the frame as an XZ ring (for PartRecs handed to the generic renderer). */
const rect = (f: Fr, a0: number, a1: number, w0: number, w1: number) =>
  [P(f, a0, 0, w0), P(f, a1, 0, w0), P(f, a1, 0, w1), P(f, a0, 0, w1)].flatMap((p) => [p[0], p[2]]);
const col = (buf: Buf, f: Fr, a: number, w: number, r: number, y0: number, y1: number) => stack(buf, [ring(f, a, w, r, y0, 6), ring(f, a, w, r, y1, 6)]);
/** Vertical quad on the face a = const (dir = ±u), w0 → w1, y0 → y1: a door / dark recess. */
const face = (buf: Buf, f: Fr, a: number, w0: number, w1: number, y0: number, y1: number, dir: number) =>
  quadOut(buf, P(f, a, y0, w0), P(f, a, y0, w1), P(f, a, y1, w1), P(f, a, y1, w0), U(f, dir));
/** c.ts arch on a face ⊥ w (w = wface, a0 → a1), dir = ±w. */
const archW = (buf: Buf, f: Fr, wface: number, a0: number, a1: number, y0: number, spring: number, crown: number, pointed: boolean, dir: number) =>
  arch(buf, turn(f), wface, -a1, -a0, y0, spring, crown, pointed, dir);

/** Hipped (inset > 0) or gabled roof over [a0, a1] × [w0, w1], eaves y0, ridge y1 along u; underside closed. */
function roof(buf: Buf, f: Fr, a0: number, a1: number, w0: number, w1: number, y0: number, y1: number, inset = 0) {
  const wm = (w0 + w1) / 2;
  const [A, B, Cc, D] = [P(f, a0, y0, w0), P(f, a1, y0, w0), P(f, a1, y0, w1), P(f, a0, y0, w1)];
  const [R0, R1] = [P(f, a0 + inset, y1, wm), P(f, a1 - inset, y1, wm)];
  const [u, w] = [U(f), W(f)];
  quadOut(buf, A, B, R1, R0, [-w[0], 0.8, -w[2]]);
  quadOut(buf, D, Cc, R1, R0, [w[0], 0.8, w[2]]);
  triOut(buf, A, D, R0, [-u[0], inset ? 0.8 : 0, -u[2]]);
  triOut(buf, B, Cc, R1, [u[0], inset ? 0.8 : 0, u[2]]);
  quadOut(buf, A, B, Cc, D, [0, -1, 0]);
}

/** Vietnamese temple hall roof (chồng diêm): a low hipped skirt at the eaves, a short upper wall, the main hipped roof with a
 *  lacquer ridge beam. Ridge along u of `f`; hall rectangle [a0, a1] × [w0, w1] (the wall line), eaves at `eave`. */
function hall(s: Sink, f: Fr, a0: number, a1: number, w0: number, w1: number, eave: number, rise: number, tile = C.tile) {
  roof(M(s, tile), f, a0 - 1, a1 + 1, w0 - 1, w1 + 1, eave, eave + 0.9, Math.min(2.5, (a1 - a0) / 2 - 0.3));
  fbox(M(s, C.ochre), f, a0 + 1.2, a1 - 1.2, w0 + 1.2, w1 - 1.2, eave + 0.6, eave + 1.9);
  roof(M(s, tile), f, a0 - 0.3, a1 + 0.3, w0 - 0.3, w1 + 0.3, eave + 1.9, eave + 1.9 + rise, Math.min(1.5, (a1 - a0) / 2 - 0.3));
  const wm = (w0 + w1) / 2;
  fbox(M(s, C.lacquer), f, a0 + 1, a1 - 1, wm - 0.25, wm + 0.25, eave + 1.9 + rise - 0.1, eave + 1.9 + rise + 0.3);
}

/** Polygon [a, y][] (any simple shape, fan-triangulated from vertex 0: convex or star-shaped from it) extruded w0 → w1. */
function prismW(buf: Buf, f: Fr, poly: [number, number][], w0: number, w1: number) {
  const n = poly.length;
  let area = 0;
  for (let i = 0; i < n; i++) area += poly[i]![0] * poly[(i + 1) % n]![1] - poly[(i + 1) % n]![0] * poly[i]![1];
  const sg = area > 0 ? 1 : -1;
  for (let i = 0; i < n; i++) {
    const [p, q] = [poly[i]!, poly[(i + 1) % n]!];
    const out: V3 = [(q[1] - p[1]) * sg * f.ux, -(q[0] - p[0]) * sg, (q[1] - p[1]) * sg * f.uz];
    quadOut(buf, P(f, p[0], p[1], w0), P(f, q[0], q[1], w0), P(f, q[0], q[1], w1), P(f, p[0], p[1], w1), out);
  }
  for (const [w, d] of [[w0, -1], [w1, 1]] as const) {
    for (let i = 1; i + 1 < n; i++) triOut(buf, P(f, poly[0]![0], poly[0]![1], w), P(f, poly[i]![0], poly[i]![1], w), P(f, poly[i + 1]![0], poly[i + 1]![1], w), W(f, d));
  }
}

// ── Tháp Rùa: 3 stepped tiers of mossy grey stone, pointed-arch openings (3 per long face, 2 per short), round windows on the
// top tier, a small gabled cap. ≈ 8.9 m (Wikipedia "khoảng 8,8 m"; OSM parts 3.1 / 5.2 / 6.6 m are the tier lines). ──
const thapRua: DetailFn = (rec, _parts, ctx, h) => {
  const f = footprintFrame(rec.outer); // a ≈ 3.15 (N–S), b ≈ 2.3
  const g = ctx.ground;
  const tiers: [number, number, number, number][] = [[f.a, f.b, 0, 3.2], [f.a - 0.45, f.b - 0.45, 3.2, 5.9], [f.a - 1.25, f.b - 0.95, 5.9, 7.5]];
  const parts: PartRec[] = tiers.map(([a, b, y0, y1]) => ({ kind: 'yes', outer: rect(f, -a, a, -b, b), minHeight: y0, height: y1, roofShape: 'flat', colour: C.moss, roofColour: C.moss }));
  const base = h.generic(rec, parts, ctx);
  const s = new Sink();
  const dark = M(s, C.dark);
  const openings = (a: number, b: number, y0: number, hw: number, spring: number, crown: number, pointed: boolean, nLong: number, nShort: number) => {
    for (const sg of [1, -1]) {
      for (let k = 0; k < nLong; k++) {
        const c = ((k - (nLong - 1) / 2) * (2 * a)) / nLong;
        archW(dark, f, sg * (b + 0.02), c - hw, c + hw, g + y0, g + spring, g + crown, pointed, sg);
      }
      for (let k = 0; k < nShort; k++) {
        const c = ((k - (nShort - 1) / 2) * (2 * b)) / nShort;
        arch(dark, f, sg * (a + 0.02), c - hw, c + hw, g + y0, g + spring, g + crown, pointed, sg);
      }
    }
  };
  openings(f.a, f.b, 0.35, 0.42, 1.6, 2.5, true, 3, 2);
  openings(f.a - 0.45, f.b - 0.45, 3.55, 0.36, 4.5, 5.3, true, 3, 2);
  openings(f.a - 1.25, f.b - 0.95, 6.35, 0.3, 6.45, 7.0, false, 1, 1);
  const stone = M(s, '#9a9a8a');
  fbox(stone, f, -f.a - 0.35, f.a + 0.35, -f.b - 0.35, f.b + 0.35, g - 0.1, g + 0.35); // plinth
  for (const [a, b, , y1] of tiers) fbox(stone, f, -a - 0.18, a + 0.18, -b - 0.18, b + 0.18, g + y1 - 0.25, g + y1); // cornices
  roof(M(s, C.tileDark), f, -(f.a - 1.25) - 0.4, f.a - 1.25 + 0.4, -(f.b - 0.95) - 0.4, f.b - 0.95 + 0.4, g + 7.5, g + 8.9);
  return withExtras(base, s);
};

// ── Tượng đài Lý Thái Tổ (2004): granite steps + pedestal, bronze standing king, 10.1 m over the platform (Wikipedia:
// tượng 6,8 m trên bệ 3,3 m; here pedestal 3.3 m from the top step) at the sculpture node (node/443033827, the rec's
// point: east of the lawn outline, on the paved square), facing west to the lake. The garden outline itself draws nothing. ──
const lyThaiTo: DetailFn = (rec, _parts, ctx) => {
  if (rec.kind !== 'artwork') return EMPTY;
  const g = ctx.ground;
  const pt = rec.points?.find((p) => p.kind === 'artwork');
  const [cx, cz] = pt ? [pt.x, pt.z] : [rec.outer[0]!, rec.outer[1]!];
  const f: Fr = { cx, cz, ux: 0, uz: 1, a: 6, b: 6, area: 0 }; // w = west
  const s = new Sink();
  const st = M(s, C.granite);
  for (let k = 0; k < 3; k++) fbox(st, f, -6.4 + k, 6.4 - k, -6.4 + k, 6.4 - k, g + 0.35 * k - 0.05, g + 0.35 * (k + 1));
  const top = g + 1.05;
  stack(st, [ring(f, 0, 0, 2.6 * Math.SQRT2, top, 4), ring(f, 0, 0, 2.6 * Math.SQRT2, top + 0.5, 4)]);
  stack(st, [ring(f, 0, 0, 2.2 * Math.SQRT2, top + 0.5, 4), ring(f, 0, 0, 2.0 * Math.SQRT2, top + 3.0, 4)]);
  stack(st, [ring(f, 0, 0, 2.3 * Math.SQRT2, top + 3.0, 4), ring(f, 0, 0, 2.3 * Math.SQRT2, top + 3.3, 4)]);
  const b = s.buf('bronze');
  const y = top + 3.3;
  const prof: [number, number][] = [[1.35, 0], [1.3, 0.6], [1.0, 3.4], [0.95, 4.4], [1.1, 5.0], [0.85, 5.5], [0.4, 5.6], [0.42, 5.9], [0.5, 6.3], [0.42, 6.65], [0.2, 6.8]];
  stack(b, prof.map(([r, dy]) => ring(f, 0, 0, r, y + dy, 10)));
  fbox(b, f, -0.55, 0.55, -0.55, 0.55, y + 6.7, y + 6.8); // mũ bình thiên
  fbox(b, f, -0.9, -0.35, -1.4, -0.2, y + 3.6, y + 4.1); // the raised scroll hand
  return s.out();
};

// ── Đền Bà Kiệu: the main hall (18 × 11 m, faces the lake) and, across Đinh Tiên Hoàng, the nghi môn gate house. Ochre walls
// 3.8 m, tiered tile roofs to ≈ 7.6 m (1-storey halls, photos). ──
const baKieu: DetailFn = (rec, _parts, ctx, h) => {
  const f = facing(rec, 250); // +u toward the lake (WSW)
  const g = ctx.ground;
  const s = new Sink();
  if (Math.max(f.a, f.b) > 8) { // the hall: ridge along the front (f's w)
    const base = h.generic({ ...rec, height: 3.8, roofShape: 'flat', colour: C.ochre, roofColour: C.ochre }, [], ctx);
    hall(s, turn(f), -f.b + 0.6, f.b - 0.6, -f.a + 0.6, f.a - 0.6, g + 3.8, 2.2, C.tileB);
    const red = M(s, C.lacquer);
    for (let k = 0; k < 6; k++) col(red, f, f.a + 0.45, -f.b + 1.4 + ((2 * f.b - 2.8) * k) / 5, 0.16, g, g + 3.8);
    const dark = M(s, C.dark);
    for (let k = 0; k < 3; k++) face(dark, f, f.a + 0.03, -3.6 + k * 2.6, -2.2 + k * 2.6, g, g + 2.6, 1);
    return withExtras(base, s);
  }
  // the gate: a wall with three arched passages, a small upper pavilion
  const base = h.generic({ ...rec, height: 3.4, roofShape: 'flat', colour: C.ochre, roofColour: C.ochre }, [], ctx);
  const dark = M(s, C.dark);
  for (const sg of [1, -1]) {
    arch(dark, f, sg * (f.a + 0.03), -1.3, 1.3, g, g + 2.0, g + 3.0, false, sg);
    for (const o of [-1, 1]) arch(dark, f, sg * (f.a + 0.03), o * 3.2 - 0.7, o * 3.2 + 0.7, g, g + 1.6, g + 2.3, false, sg);
  }
  const t = turn(f);
  roof(M(s, C.tileB), t, -f.b - 0.8, f.b + 0.8, -f.a - 0.8, f.a + 0.8, g + 3.4, g + 4.2, 2);
  fbox(M(s, C.cream), f, -f.a * 0.45, f.a * 0.45, -f.b * 0.55, f.b * 0.55, g + 4.0, g + 5.6);
  roof(M(s, C.tileB), t, -f.b * 0.55 - 0.7, f.b * 0.55 + 0.7, -f.a * 0.45 - 0.7, f.a * 0.45 + 0.7, g + 5.6, g + 7.3, 1.5);
  fbox(M(s, C.lacquer), t, -f.b * 0.55 + 0.8, f.b * 0.55 - 0.8, -0.22, 0.22, g + 7.2, g + 7.6);
  return withExtras(base, s);
};

// ── Chợ Đồng Xuân (1889, rebuilt 1994): three parallel gabled halls (OSM parts) behind a 9 m base block; the French façade is
// the outline's long west edge (the halls stop ≈ 15 m behind it): a front block 11 m, three 16 m pediments (the 1994 rebuild
// kept three of the five bays) each over a great round arch + oculus, small arches between. ≈ 14 m eaves, pediments 15.4 m
// (3 storeys, photos). The "Hà Nội mùa đông 1946" bronze relief stands on the square (the rec's artwork point, OSM 4.5 m). ──
const dongXuan: DetailFn = (rec, parts, ctx, h) => {
  const s = new Sink();
  const g = ctx.ground;
  const o = { ground: g, height: ctx.height, fallbackTop: 9 };
  h.renderPart({ ...rec, kind: 'yes', height: 9, roofShape: 'flat', colour: C.base, roofColour: '#cfc5a8' }, o, s);
  for (const p of parts) {
    const f = footprintFrame(p.outer);
    if (f.a < 20) h.renderPart({ ...p, height: 11, roofShape: 'flat', colour: C.base, roofColour: '#cfc5a8' }, o, s); // the narrow annex
    else h.renderPart({ ...p, height: 14.2, roofShape: 'gabled', roofHeight: 3.4, colour: C.ochre, roofColour: '#7d6f62' }, o, s);
  }
  // façade frame: w = the halls' axis toward their west ends, u across them; its origin on the outline's west-most line
  // (the outline's west side is several short edges, so it is found by projection, not as one edge), one pediment per hall
  const halls = parts.map((p) => footprintFrame(p.outer)).filter((hf) => hf.a >= 20);
  if (halls.length) {
    let [wx, wz] = [halls[0]!.ux, halls[0]!.uz];
    if (wx > 0) [wx, wz] = [-wx, -wz];
    const [ux, uz] = [wz, -wx]; // frame u with w = (−uz, ux) = (wx, wz)
    let wmax = -Infinity;
    for (let i = 0; i < rec.outer.length; i += 2) wmax = Math.max(wmax, rec.outer[i]! * wx + rec.outer[i + 1]! * wz);
    const as = halls.map((hf) => hf.cx * ux + hf.cz * uz).sort((p, q) => p - q);
    const amid = (as[0]! + as.at(-1)!) / 2;
    const hl = (as.at(-1)! - as[0]!) / 2 + 8.8;
    const f: Fr = { cx: amid * ux + wmax * wx, cz: amid * uz + wmax * wz, ux, uz, a: hl, b: 1, area: 0 };
    const cs = as.map((a) => a - amid);
    const yellow = M(s, C.ochre);
    fbox(yellow, f, -hl, hl, -14, 0.3, g, g + 11); // front block
    for (const c of cs) prismW(yellow, f, [[c - 7.6, g + 11.3], [c + 7.6, g + 11.3], [c, g + 15.4]], -0.6, 0.3); // pediments
    const white = M(s, C.cream);
    fbox(white, f, -hl - 0.2, hl + 0.2, -0.2, 0.55, g + 10.7, g + 11.3); // cornice
    fbox(white, f, -hl - 0.2, hl + 0.2, -0.2, 0.5, g + 3.6, g + 4.0); // string course
    for (const c of cs) prismW(white, f, [[c - 8.0, g + 11.2], [c + 8.0, g + 11.2], [c + 7.6, g + 11.3], [c - 7.6, g + 11.3]], -0.6, 0.55);
    const dark = M(s, C.dark);
    for (const c of cs) {
      archW(dark, f, 0.32, c - 3.2, c + 3.2, g + 0.1, g + 5.6, g + 8.8, false, 1); // the great arch (face ⊥ w, dir +w = west)
      archW(dark, f, 0.32, c - 0.9, c + 0.9, g + 11.9, g + 12.2, g + 13.8, false, 1); // oculus
      for (const sg of [-1, 1]) {
        archW(dark, f, 0.32, c + sg * 5.6 - 1.0, c + sg * 5.6 + 1.0, g + 0.1, g + 3.0, g + 4.1, false, 1);
        archW(dark, f, 0.32, c + sg * 5.6 - 0.8, c + sg * 5.6 + 0.8, g + 5.6, g + 7.8, g + 8.7, false, 1);
      }
    }
    const rel = rec.points?.find((p) => p.kind === 'artwork');
    if (rel) {
      const fr: Fr = { ...f, cx: rel.x, cz: rel.z, a: 3, b: 1 };
      fbox(M(s, C.granite), fr, -3.6, 3.6, -0.9, 0.9, g - 0.05, g + 0.6);
      fbox(s.buf('bronze'), fr, -3.2, 3.2, -0.35, 0.35, g + 0.6, g + (rel.height ?? 4.5));
    }
  }
  return s.out();
};

// ── Ô Quan Chưởng (1749): old-brick city gate 18 m across Hàng Chiếu: two piers (solid, the generic prisms) with a round
// 3.8 m central vault, blind side arches, a parapet and the vọng lâu pavilion with a two-tier tile roof. ≈ 9.7 m
// (body ≈ 5.3 m, pavilion ≈ 4.4 m; photos). ──
const oQuanChuong: DetailFn = (rec, _parts, ctx, h) => {
  const f = footprintFrame(rec.outer); // u = N–S (the gate's breadth), w = E–W (the passage)
  const g = ctx.ground;
  const bd = Math.min(f.b, 3.0);
  const s = new Sink();
  const o = { ground: g, height: ctx.height, fallbackTop: 5.3 };
  for (const [a0, a1] of [[-f.a, -1.9], [1.9, f.a]]) {
    h.renderPart({ kind: 'yes', outer: rect(f, a0, a1, -bd, bd), height: 5.3, roofShape: 'flat', colour: C.brick, roofColour: C.brick }, o, s);
  }
  const brick = M(s, C.brick);
  fbox(brick, f, -1.9, 1.9, -bd, bd, g + 4.3, g + 5.3); // lintel over the passage
  const arcR = 1.9;
  const spandrel = (sg: number): [number, number][] => {
    const pts: [number, number][] = [[sg * 1.9, g + 4.3]];
    for (let k = 0; k <= 6; k++) pts.push([sg * arcR * Math.cos((Math.PI / 2) * (k / 6)), g + 2.4 + arcR * Math.sin((Math.PI / 2) * (k / 6))]);
    return pts;
  };
  for (const sg of [1, -1]) prismW(brick, f, spandrel(sg), -bd, bd); // round vault under the lintel
  for (const sg of [1, -1]) fbox(brick, f, -f.a, f.a, sg * bd - 0.3, sg * bd, g + 5.3, g + 6.1); // parapet
  for (const sg of [1, -1]) fbox(brick, f, sg * f.a - 0.3, sg * f.a, -bd, bd, g + 5.3, g + 6.1);
  const dark = M(s, C.dark);
  for (const sg of [1, -1]) for (const side of [1, -1]) archW(dark, f, sg * (bd + 0.02), side * (f.a - 3.2) - 0.8, side * (f.a - 3.2) + 0.8, g + 0.1, g + 2.0, g + 2.8, false, sg);
  fbox(M(s, C.plaster), f, -3.4, 3.4, -2.1, 2.1, g + 5.3, g + 7.6); // vọng lâu
  const dark2 = M(s, C.dark);
  for (const sg of [1, -1]) archW(dark2, f, sg * 2.12, -0.7, 0.7, g + 5.6, g + 6.6, g + 7.1, false, sg);
  roof(M(s, C.tileDark), f, -4.3, 4.3, -3.0, 3.0, g + 7.0, g + 7.7, 2.5);
  fbox(M(s, C.plaster), f, -2.6, 2.6, -1.5, 1.5, g + 7.6, g + 8.5);
  roof(M(s, C.tileDark), f, -3.5, 3.5, -2.4, 2.4, g + 8.5, g + 9.7, 2.0);
  fbox(M(s, C.lacquer), f, -1.6, 1.6, -0.2, 0.2, g + 9.6, g + 9.95);
  return s.out();
};

// ── Đền Bạch Mã: a 16 × 49 m plot on Hàng Buồm (front = south): ochre walls 4.2 m, three halls with tiered tile roofs
// (gate hall, middle hall, main hall ≈ 8.7 m) with courtyards between, lacquer doors + columns on the street. ──
const bachMa: DetailFn = (rec, _parts, ctx, h) => {
  const f = facing(rec, 180); // +u = south (Hàng Buồm); a = half depth
  const g = ctx.ground;
  const base = h.generic({ ...rec, height: 4.2, roofShape: 'flat', colour: C.ochre, roofColour: '#c9b07a' }, [], ctx);
  const s = new Sink();
  const t = turn(f);
  const spans: [number, number, number][] = [[f.a - 6.5, f.a - 0.4, 2.0], [f.a - 16, f.a - 9, 2.2], [-f.a + 0.4, -f.a + 9, 2.6]];
  for (const [a0, a1, rise] of spans) hall(s, t, -f.b + 0.8, f.b - 0.8, -a1, -a0, g + 4.2, rise, C.tileB);
  const red = M(s, C.lacquer);
  for (const w of [-f.b + 1.2, -f.b / 3, f.b / 3, f.b - 1.2]) col(red, f, f.a + 0.4, w, 0.16, g, g + 4.2);
  for (let k = 0; k < 3; k++) face(red, f, f.a + 0.03, -4.2 + k * 2.9, -2.6 + k * 2.9, g, g + 2.8, 1);
  return withExtras(base, s);
};

// ── Cầu Long Biên (1902): BridgeBuilder lays the rail + two road decks at ground level; on the outline's axis this adds the
// steel cantilever trusses (two planes 5 m apart around the rail, tall "camel-back" humps over the piers ≈ 15 m, 5 m
// between: 19 spans ≈ 91 m, Wikipedia 1,682 m / 19 nhịp) and masonry piers wherever the ground is the river bed. ──
const longBien: DetailFn = (rec, _parts, ctx) => {
  const f = footprintFrame(rec.outer); // u along the bridge, a ≈ 865
  const deck = Math.max(ctx.height(rec.outer[0]!, rec.outer[1]!), ctx.height(rec.outer[rec.outer.length - 2]!, rec.outer[rec.outer.length - 1]!));
  const y0 = deck + 1.2; // bottom chord just over the deck
  const s = new Sink();
  const m = s.buf('metal');
  m.color = rgb(C.steel);
  const spans = Math.max(1, Math.round((2 * f.a) / 91));
  const L = (2 * f.a) / spans;
  const panels = Math.max(4, Math.round(L / 7.6));
  const hgt = (t: number) => {
    const d = Math.min(t, 1 - t) / 0.3;
    return 5 + (d < 1 ? 10 * Math.cos((Math.PI / 2) * d) ** 2 : 0);
  };
  const HW = 2.5;
  const node = (a: number, y: number, w: number): V3 => P(f, a, y, w);
  for (let sp = 0; sp < spans; sp++) {
    const a0 = -f.a + sp * L;
    const top = Array.from({ length: panels + 1 }, (_, k) => y0 + hgt(k / panels));
    for (const sg of [1, -1]) {
      const w = sg * HW;
      bar(m, node(a0, y0, w), node(a0 + L, y0, w), 0.5);
      for (let k = 0; k < panels; k++) {
        const [a, b] = [a0 + (L * k) / panels, a0 + (L * (k + 1)) / panels];
        bar(m, node(a, top[k]!, w), node(b, top[k + 1]!, w), 0.5);
        bar(m, node(a, y0, w), node(a, top[k]!, w), 0.35);
        if (k % 2 === 0) bar(m, node(a, y0, w), node(b, top[k + 1]!, w), 0.3);
        else bar(m, node(a, top[k]!, w), node(b, y0, w), 0.3);
      }
      bar(m, node(a0 + L, y0, w), node(a0 + L, top[panels]!, w), 0.35);
    }
    for (let k = 0; k <= panels; k += 2) {
      const a = a0 + (L * k) / panels;
      bar(m, node(a, top[k]! - 0.25, -HW), node(a, top[k]! - 0.25, HW), 0.3); // top lateral bracing
    }
  }
  const st = M(s, '#9b958b');
  for (let sp = 0; sp <= spans; sp++) {
    const a = Math.max(-f.a + 3, Math.min(f.a - 3, -f.a + sp * L));
    const [x, z] = [f.cx + a * f.ux, f.cz + a * f.uz];
    const bed = ctx.height(x, z);
    if (bed > deck - 1.5) continue; // on land the deck lies on the ground
    fbox(st, f, a - 2.4, a + 2.4, -6.5, 6.5, bed - 1, deck - 0.3);
    stack(st, [ring(f, a, 0, 3.2, bed - 1, 8), ring(f, a, 0, 3.2, deck + 0.4, 8)]); // round-nosed pier head with the viewing platform
  }
  return s.out();
};

export const details: Partial<Record<LandmarkId, DetailFn>> = {
  'thap-rua': thapRua,
  'den-ngoc-son': ngocSon,
  'tuong-ly-thai-to': lyThaiTo,
  'den-ba-kieu': baKieu,
  'cho-dong-xuan': dongXuan,
  'o-quan-chuong': oQuanChuong,
  'den-bach-ma': bachMa,
  'cau-long-bien': longBien,
};
