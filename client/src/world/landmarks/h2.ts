// Leg 3 (Hà Nội) landmark details, group h2 = phố Pháp (Hoàn Kiếm). Built in code on top of the generic S3DB body (index.ts
// `generic`, here re-run through `bodyAll` so the OSM colours can be replaced by the colonial palette: French yellow / cream
// plaster, white trim, green shutters, terracotta tiles, weathered grey stone). Façades are dressed per OUTLINE EDGE (`edges`:
// a frame on each edge with w pointing outward), so slanted / stepped street fronts need no hand-placed frame. Details are
// never solid (SPEC §5.9): colliders come from the body prisms only. Heights not in OSM are estimates, marked "ước lượng".
// Sink.buf('masonry') is ONE shared buffer whose .color applies to what is drawn next: always paint through `M(hex)` right
// before drawing, never keep coloured aliases.
import { buildings as B, landmarks as L } from '../../config.ts';
import { type BuildingRec, type LandmarkId, type PartRec, ringArea } from '../../geo/chunkData.ts';
import type { V3 } from '../geom.ts';
import { cap, fbox, type Fr, P, rgb, ring, spire, stack, UP } from './b.ts';
import { facing, frontAt, lathe } from './c.ts';
import type { DetailFn, Helpers, LandmarkCtx } from './index.ts';
import { wallFrame } from './k.ts';
import { footprintFrame, loft, triOut } from './kit.ts';
import { Sink } from './parts.ts';

type Buf = Parameters<typeof loft>[0];
type Head = 'flat' | 'round' | 'pointed';

const YELLOW = '#e4bd52'; // vàng Pháp
const CREAM = '#f1e2bc';
const WHITE = '#f4efe3';
const DARK = '#2b2926'; // openings
const TILE = '#9a5538';
const GREEN = '#2f5a45'; // Metropole shutters

// ── helpers ──

/** The sink's masonry buffer, painted `hex` for what is drawn next. */
const painter = (s: Sink) => (hex: string, mat: 'masonry' | 'metal' = 'masonry') => { const b = s.buf(mat); b.color = rgb(hex); return b; };
/** Local (a, w) of a world point in frame f. */
const loc = (f: Fr, x: number, z: number): [number, number] => [(x - f.cx) * f.ux + (z - f.cz) * f.uz, -(x - f.cx) * f.uz + (z - f.cz) * f.ux];
/** f turned 90°: a' = w, and +w' = −u (a plane w' = −c faces +u with dir −1). */
const turn = (f: Fr): Fr => ({ ...f, ux: -f.uz, uz: f.ux, a: f.b, b: f.a });
const SQ2 = Math.SQRT2;

export interface Edge { f: Fr; len: number } // f: origin at the edge middle, a along the edge, w outward
/** Outline edges ≥ minLen whose outward normal (unit, world xz) passes `keep`; either ring winding. */
export function edges(outer: number[], minLen: number, keep: (nx: number, nz: number) => boolean = () => true): Edge[] {
  const s = ringArea(outer) > 0 ? 1 : -1;
  const out: Edge[] = [];
  for (let i = 0, n = outer.length; i < n; i += 2) {
    const [ax, az, bx, bz] = [outer[i]!, outer[i + 1]!, outer[(i + 2) % n]!, outer[(i + 3) % n]!];
    const len = Math.hypot(bx - ax, bz - az);
    if (len < minLen) continue;
    const [ux, uz] = [(s * (bx - ax)) / len, (s * (bz - az)) / len];
    if (!keep(-uz, ux)) continue;
    out.push({ f: { cx: (ax + bx) / 2, cz: (az + bz) / 2, ux, uz, a: len / 2, b: 0, area: 0 } as Fr, len });
  }
  return out;
}
const toward = (nx: number, nz: number, min = 0.7) => (x: number, z: number) => x * nx + z * nz > min;
/** Even-odd point in ring test. */
function inRing(x: number, z: number, r: number[]): boolean {
  let inside = false;
  for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
    const [xi, zi, xj, zj] = [r[i]!, r[i + 1]!, r[j]!, r[j + 1]!];
    if (zi > z !== zj > z && x < xi + ((z - zi) / (zj - zi)) * (xj - xi)) inside = !inside;
  }
  return inside;
}

/** Dark opening on plane w of frame f (spanning a0..a1, y0..y1), facing +w (dir −1: −w). */
function opening(buf: Buf, f: Fr, a0: number, a1: number, w: number, y0: number, y1: number, head: Head = 'flat', dir = 1) {
  const am = (a0 + a1) / 2, r = (a1 - a0) / 2;
  const pts: [number, number][] = [[a0, y0], [a1, y0]];
  if (head === 'flat') pts.push([a1, y1], [a0, y1]);
  else if (head === 'round') {
    const sp = y1 - r;
    for (let k = 0; k <= 6; k++) pts.push([am + r * Math.cos((Math.PI * k) / 6), sp + r * Math.sin((Math.PI * k) / 6)]);
  } else { // pointed: two arcs of radius 2r centred on the opposite springing points
    const sp = y1 - 1.732 * r;
    for (let k = 0; k <= 4; k++) { const t = (Math.PI * k) / 12; pts.push([a0 + 2 * r * Math.cos(t), sp + 2 * r * Math.sin(t)]); }
    for (let k = 3; k >= 0; k--) { const t = (Math.PI * k) / 12; pts.push([a1 - 2 * r * Math.cos(t), sp + 2 * r * Math.sin(t)]); }
  }
  const out: V3 = [-f.uz * dir, 0, f.ux * dir];
  for (let i = 1; i + 1 < pts.length; i++) triOut(buf, P(f, pts[0]![0], pts[0]![1], w), P(f, pts[i]![0], pts[i]![1], w), P(f, pts[i + 1]![0], pts[i + 1]![1], w), out);
}

/** Window bays along an edge: rows [y0, y1, head], centred, `pitch` apart, `margin` kept free at both ends. */
function bays(buf: Buf, e: Edge, rows: [number, number, Head][], pitch: number, width: number, margin = 2, w = 0.06) {
  const n = Math.floor((e.len - 2 * margin) / pitch);
  if (n < 1) return;
  const a0 = (-(n - 1) * pitch) / 2;
  for (let k = 0; k < n; k++) for (const [y0, y1, head] of rows) opening(buf, e.f, a0 + k * pitch - width / 2, a0 + k * pitch + width / 2, w, y0, y1, head);
}
/** Horizontal band (cornice / plinth / canopy) along the whole edge, w0..w1 proud of the wall. */
const band = (buf: Buf, e: Edge, w0: number, w1: number, y0: number, y1: number) => fbox(buf, e.f, -e.len / 2 - w1, e.len / 2 + w1, w0, w1, y0, y1);

/** Clock face (white disc + two black hands + dark rim) on plane w of frame f, centre (a, y). */
function clock(s: Sink, f: Fr, a: number, w: number, y: number, r: number, dir = 1) {
  const M = painter(s);
  const n = 16;
  const out: V3 = [-f.uz * dir, 0, f.ux * dir];
  const pt = (k: number) => P(f, a + r * Math.cos((2 * Math.PI * k) / n), y + r * Math.sin((2 * Math.PI * k) / n), w);
  const face = M(WHITE);
  for (let k = 1; k + 1 < n; k++) triOut(face, pt(0), pt(k), pt(k + 1), out);
  const [w0, w1] = dir > 0 ? [w, w + 0.06] : [w - 0.06, w];
  fbox(M(DARK), f, a - 0.05 * r, a + 0.05 * r, w0, w1, y - 0.1 * r, y + 0.85 * r); // minute hand up
  fbox(M(DARK), f, a - 0.1 * r, a + 0.6 * r, w0, w1, y - 0.05 * r, y + 0.05 * r); // hour hand right
  loft(M(DARK), [ring(f, a, w, r + 0.12, y - 0.02, n), ring(f, a, w, r + 0.12, y + 0.02, n)], 4);
}

/** Round column (8-gon) with a square capital. */
function col(buf: Buf, f: Fr, a: number, w: number, r: number, y0: number, y1: number) {
  loft(buf, [ring(f, a, w, r, y0, 8), ring(f, a, w, r * 0.88, y1 - r, 8)], 4);
  fbox(buf, f, a - r * 1.25, a + r * 1.25, w - r * 1.25, w + r * 1.25, y1 - r, y1);
}

/** Square tower face openings: `draw(frame, w)` on all four faces (hs = half side), +w of the frame given = outward. */
function faces(f: Fr, hs: number, draw: (ff: Fr, w: number, dir: number) => void) {
  for (const ff of [f, turn(f)]) for (const d of [1, -1]) draw(ff, d * (hs + 0.06), d);
}

/** index.ts `generic` with colour / shape overrides: `over` for the outline, `part(p)` for each part. */
function bodyAll(rec: BuildingRec, parts: PartRec[], ctx: LandmarkCtx, h: Helpers, s: Sink, over: Partial<PartRec>, part: (p: PartRec) => Partial<PartRec> = () => over) {
  const o = { ground: ctx.ground, height: ctx.height, fallbackTop: h.outlineTop(rec, ctx.def) };
  let drawn = 0;
  for (const p of parts) if (h.renderPart({ ...p, ...part(p) }, o, s)) drawn++;
  if (!drawn || h.coverage(rec, parts) < L.partCoverage) h.renderPart({ ...rec, ...over }, o, s);
}
const largest = (ps: PartRec[]) => [...ps].sort((p, q) => Math.abs(ringArea(q.outer)) - Math.abs(ringArea(p.outer)))[0];

// ── Bưu điện Hà Nội: yellow block along Đinh Tiên Hoàng (west), arched ground floor, white cornice, clock on the OSM tower part ──
// Outline has no height in OSM: 15 m (3 floors + attic, ước lượng từ ảnh); the tower parts keep their 6 / 8 levels.
const buuDien: DetailFn = (rec, parts, ctx, h) => {
  const s = new Sink();
  const M = painter(s);
  const g = ctx.ground;
  bodyAll(rec, parts, ctx, h, s, { colour: YELLOW, height: 15 }, (p) => ({ colour: p.levels === 3 ? YELLOW : CREAM }));
  for (const e of edges(rec.outer, 8, toward(-1, 0, 0.6))) { // the lake side
    bays(M(DARK), e, [[g + 1, g + 4.6, 'round'], [g + 6, g + 8.8, 'flat'], [g + 10, g + 12.6, 'flat']], 4.5, 2);
    band(M(WHITE), e, 0, 0.3, g + 14.3, g + 14.9); // cornice
    band(M(WHITE), e, 0, 0.2, g + 5.1, g + 5.4); // string course over the arcade
  }
  const tower = parts.find((p) => p.levels === 8);
  if (tower) { // clock faces on the 4 sides of the little tower, under its top
    const tf = footprintFrame(tower.outer);
    faces(tf, tf.b, (ff, w, d) => clock(s, ff, 0, w, g + 8 * 3.2 - 2.6, 1.3, d));
  }
  return s.out();
};

// ── Trụ sở UBND TP Hà Nội: cream town hall facing the lake (west), window grid, white string course, the square OSM tower part
// gets a hipped tile roof and the flag ──
const ubnd: DetailFn = (rec, parts, ctx, h) => {
  const s = new Sink();
  const M = painter(s);
  const g = ctx.ground;
  const tower = largest(parts.filter((p) => p.levels === 6));
  bodyAll(rec, parts, ctx, h, s, { colour: CREAM }, (p) => (p === tower ? { colour: CREAM, height: 6 * 3.2 + 4, roofShape: 'hipped', roofHeight: 4, roofColour: TILE } : { colour: CREAM }));
  // The parts cover the outline (no outline body): on each lake-side edge only the rows under the top of the part behind it
  // (the 2-storey wings at the north-west corner have 2 rows, the 4-storey centre 4).
  const rows: [number, number, Head][] = [[g + 1, g + 3.4, 'round'], [g + 4.4, g + 6.6, 'flat'], [g + 7.6, g + 9.8, 'flat'], [g + 10.8, g + 12.8, 'flat']];
  for (const e of edges(rec.outer, 7, toward(-1, 0, 0.6))) {
    const behind = parts.find((p) => inRing(e.f.cx + e.f.uz * 0.5, e.f.cz - e.f.ux * 0.5, p.outer)); // 0.5 m inside the edge
    const top = g + (behind ? (behind.height ?? (behind.levels ?? 0) * B.levelHeight) : 15);
    bays(M(DARK), e, rows.filter(([, y1]) => y1 < top - 0.3), 3.6, 1.6, 1.5);
    band(M(WHITE), e, 0, 0.25, g + 3.8, g + 4.1);
  }
  if (tower) {
    const tf = footprintFrame(tower.outer);
    const top = g + 6 * 3.2 + 4;
    stack(M('#d9d6cc', 'metal'), [ring(tf, 0, 0, 0.12, top - 1, 6), ring(tf, 0, 0, 0.08, top + 9, 6)]); // pole
    fbox(M('#d4232a'), tf, 0, 3, -0.04, 0.04, top + 7, top + 9); // flag
    fbox(M('#f7d53a'), tf, 1.2, 1.8, -0.06, 0.06, top + 7.7, top + 8.3); // the star, simplified to a square
  }
  return s.out();
};

// ── Nhà thờ Lớn: weathered grey neo-Gothic; the two OSM tower parts (31.5 m, registry) get pointed openings, corner pinnacles and
// crosses; the façade between them a pointed portal + rose window, a door under each tower. Parts keep their OSM heights. ──
const nhaThoLon: DetailFn = (rec, parts, ctx, h) => {
  const s = new Sink();
  const M = painter(s);
  const g = ctx.ground;
  const STONE = '#a7a49d', ROOF = '#66625f', LIGHT = '#b8b5ae';
  bodyAll(rec, parts, ctx, h, s, { colour: STONE, roofColour: ROOF }, () => ({ colour: STONE, roofColour: ROOF }));
  const towers = parts.filter((p) => (p.height ?? 0) >= 30);
  for (const t of towers) {
    const tf = footprintFrame(t.outer);
    const top = g + (t.height ?? 31.5);
    faces(tf, tf.b, (ff, w, d) => {
      for (const k of [-0.42, 0.42]) opening(M(DARK), ff, k * ff.a - 0.45, k * ff.a + 0.45, w, top - 10, top - 3.5, 'pointed', d); // belfry
      opening(M(DARK), ff, -0.6, 0.6, w, top - 19, top - 14, 'pointed', d);
    });
    for (const [sa, sw] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const) lathe(M(LIGHT), tf, sa * (tf.a - 0.5), sw * (tf.b - 0.5), [[0.5, top], [0.4, top + 1.6], [0, top + 3.4]], 4); // pinnacles
    fbox(M(LIGHT), tf, -0.18, 0.18, -0.18, 0.18, top, top + 3.8); // cross
    fbox(M(LIGHT), tf, -1, 1, -0.18, 0.18, top + 2.4, top + 2.8);
  }
  if (towers.length === 2) { // façade: the wall between the towers, looking away from the nave
    const [t0, t1] = towers.map((t) => footprintFrame(t.outer)) as [Fr, Fr];
    const of = footprintFrame(rec.outer);
    const [mx, mz] = [(t0.cx + t1.cx) / 2, (t0.cz + t1.cz) / 2];
    const f = facing(rec, (Math.atan2(mx - of.cx, -(mz - of.cz)) * 180) / Math.PI);
    const [, wm] = loc(f, mx, mz);
    const af = frontAt(rec, f, wm) + 0.06;
    const r = turn(f);
    opening(M(DARK), r, wm - 1.6, wm + 1.6, -af, g + 0.5, g + 7, 'pointed', -1); // portal
    for (const t of [t0, t1]) { // side doors under the towers
      const [, wt] = loc(f, t.cx, t.cz);
      opening(M(DARK), r, wt - 1, wt + 1, -(frontAt(rec, f, wt) + 0.06), g + 0.5, g + 5, 'pointed', -1);
    }
    const n = 14;
    const out: V3 = [f.ux, 0, f.uz];
    const pt = (k: number, rr: number, lift = 0): V3 => P(f, af + lift, g + 13.5 + rr * Math.sin((2 * Math.PI * k) / n), wm + rr * Math.cos((2 * Math.PI * k) / n));
    const rose = M('#3a3f4a');
    for (let k = 1; k + 1 < n; k++) triOut(rose, pt(0, 2.4), pt(k, 2.4), pt(k + 1, 2.4), out);
    const rim = M(LIGHT);
    for (let k = 0; k < n; k++) { // stone ring around the rose
      triOut(rim, pt(k, 2.4, 0.02), pt(k + 1, 2.9, 0.02), pt(k, 2.9, 0.02), out);
      triOut(rim, pt(k, 2.4, 0.02), pt(k + 1, 2.4, 0.02), pt(k + 1, 2.9, 0.02), out);
    }
  }
  return s.out();
};

// ── Tràng Tiền Plaza: 6-storey mall (OSM 19 m), light stone piers, a glass ribbon per floor, ground-floor shop glass, dark cornice ──
const trangTien: DetailFn = (rec, parts, ctx, h) => {
  const s = new Sink();
  const M = painter(s);
  const g = ctx.ground;
  bodyAll(rec, parts, ctx, h, s, { colour: '#d8d2c6' });
  const glass = s.buf('glass');
  const top = g + (rec.height ?? 19);
  for (const e of edges(rec.outer, 8)) {
    fbox(glass, e.f, -e.len / 2 + 0.8, e.len / 2 - 0.8, 0.04, 0.1, g + 0.4, g + 3.4); // shop front
    for (let y = g + 4.6; y + 1.8 < top - 1; y += 3.1) fbox(glass, e.f, -e.len / 2 + 0.8, e.len / 2 - 0.8, 0.04, 0.1, y, y + 1.8); // ribbons
    const n = Math.max(1, Math.floor(e.len / 6));
    for (let k = 0; k <= n; k++) {
      const a = -e.len / 2 + 0.8 + (k * (e.len - 1.6)) / n;
      fbox(M('#c9c2b4'), e.f, a - 0.3, a + 0.3, 0, 0.25, g + 3.6, top - 0.6); // piers
    }
    band(M('#4a4d50'), e, 0, 0.3, top - 0.6, top + 0.3); // cornice / parapet
    band(M('#4a4d50'), e, 0, 1.1, g + 3.5, g + 3.8); // shop canopy
  }
  return s.out();
};

// ── Nhà hát Lớn: cream neo-classical opera. The central OSM gable is turned into a grey dome (the real roof is a curved slate
// dome over the hall; height 7 m ước lượng); west façade (quảng trường Cách mạng Tháng Tám): ground-floor arcade of round arches,
// loggia of 8 columns with a balustrade, entablature, a 2 m flight of steps in front. ──
const nhaHatLon: DetailFn = (rec, parts, ctx, h) => {
  const s = new Sink();
  const M = painter(s);
  const g = ctx.ground;
  const hall = largest(parts);
  bodyAll(rec, parts, ctx, h, s, { colour: CREAM, roofColour: TILE }, (p) => (p === hall ? { roofShape: 'dome', roofHeight: 7, height: 5.5 * 3.2 + 7, roofColour: '#6a6f68' } : { roofColour: '#6a6f68' }));
  const f = facing(rec, 270);
  const af = frontAt(rec, f, 0);
  const r = turn(f);
  const top = g + 4 * 3.2;
  for (let k = -3; k <= 3; k++) opening(M(DARK), r, k * 4 - 1.4, k * 4 + 1.4, -(af + 0.06), g + 0.6, g + 5, 'round', -1); // arcade
  fbox(M(WHITE), f, af - 0.2, af + 1.3, -15.5, 15.5, g + 5.1, g + 5.6); // loggia floor slab
  for (let k = 0; k < 8; k++) col(M(WHITE), f, af + 0.75, -14 + k * 4, 0.42, g + 5.6, top - 0.2);
  fbox(M(WHITE), f, af + 0.9, af + 1.15, -15.5, 15.5, g + 5.6, g + 6.6); // balustrade
  fbox(M(WHITE), f, af - 0.2, af + 1.4, -16, 16, top - 0.2, top + 1.2); // entablature
  for (let k = 0; k < 3; k++) fbox(M(WHITE), f, af - 0.1, af + 2.2 - k * 0.7, -14, 14, g + k * 0.3, g + k * 0.3 + 0.3); // steps
  return s.out();
};

// ── Bảo tàng Lịch sử Quốc gia: Indochinese style, yellow walls under a hipped tile roof (outline has no height: 15 m ước lượng),
// the octagonal entrance tower at the Tràng Tiền (north) end with three tiers of flared tile roofs, ≈ 36 m total (ước lượng từ ảnh). ──
const baoTang: DetailFn = (rec, parts, ctx, h) => {
  if (rec.kind !== 'museum') return h.generic(rec, parts, ctx); // the grounds (artwork): nothing to draw
  const s = new Sink();
  const M = painter(s);
  const g = ctx.ground;
  bodyAll(rec, parts, ctx, h, s, { colour: YELLOW, height: 15, roofShape: 'hipped', roofHeight: 3.5, roofColour: TILE });
  let [cx, cz, n] = [0, 0, 0]; // tower centre: mean of the outline vertices of the north end (z < 842)
  for (let i = 0; i < rec.outer.length; i += 2) if (rec.outer[i + 1]! < 842) { cx += rec.outer[i]!; cz += rec.outer[i + 1]!; n++; }
  const f: Fr = { cx: cx / n, cz: cz / n, ux: 1, uz: 0, a: 0, b: 0, area: 0 } as Fr;
  const oct = (r: number, y: number) => ring(f, 0, 0, r, y, 8);
  const tier = (r0: number, y0: number, r1: number, y1: number) => { // shaft r0 from y0 to y1, then a flared tile roof out to r1 and back in
    stack(M(YELLOW), [oct(r0, y0), oct(r0, y1)]);
    const rs = [oct(r1, y1 - 0.3), oct(r1, y1), oct(r0 * 0.92 + r1 * 0.08, y1 + (r1 - r0) * 0.55), oct(r0 * 0.75, y1 + (r1 - r0) * 0.9)];
    const tile = M(TILE);
    loft(tile, rs, 4);
    cap(tile, rs[0]!, [0, -1, 0]);
    cap(tile, rs.at(-1)!, UP);
    for (let k = 0; k < 8; k++) { // one tall opening per face (ring() puts the vertices at π/8 + k·π/4, so the faces are at k·π/4)
      const phi = (2 * Math.PI * k) / 8;
      const ff: Fr = { ...f, ux: -Math.sin(phi), uz: Math.cos(phi) } as Fr; // w axis = −(cos φ, sin φ) → the face at φ + π
      opening(M(DARK), ff, -0.7, 0.7, r0 * Math.cos(Math.PI / 8) + 0.06, y0 + 1.5, y1 - 1.2, 'round');
    }
  };
  tier(9.2, g + 10, 11.6, g + 20);
  tier(7.2, g + 22.2, 9.2, g + 27);
  tier(5.2, g + 28.8, 7, g + 32);
  stack(M(YELLOW), [oct(3.4, g + 32.4), oct(3.4, g + 33.4)]);
  spire(M(TILE), oct(3.6, g + 33.4), P(f, 0, g + 36, 0));
  return s.out();
};

// ── Sofitel Legend Metropole: the OSM relation is the whole block (kind artwork, nothing generic); the hotel itself is an untagged
// BuildingBuilder house (20 m default). The historic wing along Ngô Quyền (west, the 4-level gabled part) gets a white skin
// 0.3 m proud of that wall with its own windows, green shutters, a ground-floor arcade and the green iron canopy. ──
const metropole: DetailFn = (rec, parts, ctx, h) => {
  const base = h.generic(rec, parts, ctx);
  const wing = largest(parts.filter((p) => p.levels === 4 && p.roofShape === 'gabled'));
  if (!wing) return base;
  const s = new Sink();
  const M = painter(s);
  const g = ctx.ground;
  const top = g + 20; // BuildingBuilder's default height (buildings.defaultHeight) of the untagged hotel outline
  for (const e of edges(wing.outer, 10, toward(-1, 0, 0.6))) {
    fbox(M(WHITE), e.f, -e.len / 2, e.len / 2, 0.02, 0.3, g - 0.3, top + 0.15); // skin
    const n = Math.floor((e.len - 3) / 3.6);
    const a0 = (-(n - 1) * 3.6) / 2;
    for (let k = 0; k < n; k++) {
      const a = a0 + k * 3.6;
      opening(M(DARK), e.f, a - 1.2, a + 1.2, 0.36, g + 0.4, g + 4, 'round'); // arcade
      for (let y = g + 5.2; y < top - 3; y += 3.3) {
        opening(M(DARK), e.f, a - 0.6, a + 0.6, 0.36, y, y + 2.3);
        fbox(M(GREEN), e.f, a - 1.15, a - 0.62, 0.3, 0.4, y, y + 2.3); // shutters
        fbox(M(GREEN), e.f, a + 0.62, a + 1.15, 0.3, 0.4, y, y + 2.3);
        fbox(M(WHITE), e.f, a - 1.3, a + 1.3, 0.3, 0.42, y - 0.12, y); // sill
      }
    }
    band(M(WHITE), e, 0.3, 0.6, top - 0.9, top - 0.2); // cornice
    band(M(GREEN), e, 0.3, 1.6, g + 4.3, g + 4.5); // canopy
  }
  return { ...base, meshes: [...base.meshes, ...s.out().meshes] };
};

// ── Nhà tù Hỏa Lò: ochre walls (OSM 2 levels → 7 m, ước lượng), the "Maison Centrale" arched gate on the Hỏa Lò street side
// (north-east edge), small barred windows, a watch tower at the north corner. ──
const hoaLo: DetailFn = (rec, parts, ctx, h) => {
  const s = new Sink();
  const M = painter(s);
  const g = ctx.ground;
  const OCHRE = '#c99a3c', GATE = '#c4942f', TRIM = '#e9dcb3';
  bodyAll(rec, parts, ctx, h, s, { colour: OCHRE, height: 7 });
  for (const e of edges(rec.outer, 12, toward(0.95, -0.3, 0.6))) bays(M(DARK), e, [[g + 4.2, g + 5.4, 'round']], 4, 1.1, 3);
  const f = wallFrame(rec.outer, [-570.5, 728.4]); // middle of the long Hỏa Lò edge of way/340128580, w outward
  fbox(M(GATE), f, -4, 4, -1.2, 0.7, g - 0.2, g + 9.5);
  fbox(M(TRIM), f, -4.3, 4.3, 0.7, 0.95, g + 8.6, g + 9.1); // cornice
  fbox(M(TRIM), f, -1.6, 1.6, 0.7, 0.9, g + 9.5, g + 10.6); // stepped parapet
  opening(M('#d8c48f'), f, -2.1, 2.1, 0.74, g, g + 5.6, 'round'); // stone rim: a lighter arch behind the dark one
  opening(M(DARK), f, -1.7, 1.7, 0.76, g, g + 5.2, 'round');
  const sgn = Math.sign((-562.3 - f.cx) * f.ux + (700.1 - f.cz) * f.uz) || 1; // the end nearest the north corner
  const c = P(f, sgn * 26, 0, -2.4);
  const tf: Fr = { ...f, cx: c[0], cz: c[2] };
  stack(M(GATE), [ring(tf, 0, 0, 2.2 * SQ2, g, 4), ring(tf, 0, 0, 2.2 * SQ2, g + 12, 4)]);
  faces(tf, 2.2, (ff, w, d) => opening(M(DARK), ff, -0.4, 0.4, w, g + 9, g + 11, 'flat', d));
  spire(M(TILE), ring(tf, 0, 0, 2.8 * SQ2, g + 12, 4), P(tf, 0, g + 14.6, 0));
  return s.out();
};

// ── Ga Hà Nội: the OSM parts (yellow wings with gabled roofs) stay; the blue-grey central block becomes the yellow entrance hall
// with a clock tower (8 m over the hall, ước lượng), arched doors and a long canopy on the Lê Duẩn (east) side. ──
const gaHaNoi: DetailFn = (rec, parts, ctx, h) => {
  const s = new Sink();
  const M = painter(s);
  const g = ctx.ground;
  const hall = parts.find((p) => p.levels === 4);
  bodyAll(rec, parts, ctx, h, s, { colour: YELLOW }, (p) => (p === hall ? { colour: YELLOW, roofColour: TILE } : {}));
  const IRON = '#3d4448';
  for (const e of edges(rec.outer, 20, toward(1, 0, 0.8))) { // wings along Lê Duẩn
    bays(M(DARK), e, [[g + 1, g + 3.6, 'round'], [g + 5, g + 7.4, 'flat']], 4.2, 1.6, 3);
    band(M(IRON, 'metal'), e, 0, 2.6, g + 3.9, g + 4.1);
  }
  if (hall) {
    const hf = footprintFrame(hall.outer);
    const top = g + 4 * 3.2;
    for (const e of edges(hall.outer, 15, toward(1, 0, 0.8))) {
      for (let k = -2; k <= 2; k++) {
        opening(M(DARK), e.f, k * 4.6 - 1.5, k * 4.6 + 1.5, 0.06, g + 0.6, g + 6.5, 'round');
        opening(M(DARK), e.f, k * 4.6 - 1, k * 4.6 + 1, 0.06, g + 8, g + 11, 'flat');
        fbox(M(IRON, 'metal'), e.f, k * 4.6 - 0.12, k * 4.6 + 0.12, 3.1, 3.34, g, g + 7.2); // canopy posts
      }
      band(M(WHITE), e, 0, 0.3, top - 0.5, top + 0.2);
      band(M(IRON, 'metal'), e, 0, 3.5, g + 7.2, g + 7.45);
    }
    stack(M(YELLOW), [ring(hf, 0, 0, 3.2 * SQ2, top - 0.5, 4), ring(hf, 0, 0, 3.2 * SQ2, top + 8, 4)]);
    faces(hf, 3.2, (ff, w, d) => clock(s, ff, 0, w, top + 5.6, 1.5, d));
    spire(M(TILE), ring(hf, 0, 0, 3.7 * SQ2, top + 8, 4), P(hf, 0, top + 10.8, 0));
  }
  return s.out();
};

// ── Nhà thờ Hàm Long: small grey-cream Gothic church under a tile gable (walls 10 m + roof 4 m, ước lượng), one square bell
// tower on the Hàm Long (north) front: 22 m shaft + pyramid spire ≈ 28 m + cross (ước lượng từ ảnh). ──
const hamLong: DetailFn = (rec, parts, ctx, h) => {
  const s = new Sink();
  const M = painter(s);
  const g = ctx.ground;
  const STONE = '#d6ccb6';
  bodyAll(rec, parts, ctx, h, s, { colour: STONE, height: 14, roofShape: 'gabled', roofHeight: 4, roofColour: '#7e5a4c' });
  const f = facing(rec, 15);
  let [tx, tz, n] = [0, 0, 0]; // tower centre: 4.2 m behind the north tip, on the tip's centre line
  for (let i = 0; i < rec.outer.length; i += 2) if (rec.outer[i + 1]! < 1476) { tx += rec.outer[i]!; tz += rec.outer[i + 1]!; n++; }
  const [, wt] = loc(f, tx / n, tz / n);
  const at = frontAt(rec, f, wt) - 4.2;
  const tf: Fr = { cx: f.cx + at * f.ux - wt * f.uz, cz: f.cz + at * f.uz + wt * f.ux, ux: f.ux, uz: f.uz, a: 3.2, b: 3.2, area: 0 } as Fr;
  const hs = 3.2, top = g + 22;
  stack(M(STONE), [ring(tf, 0, 0, hs * SQ2, g, 4), ring(tf, 0, 0, hs * SQ2, top, 4)]);
  faces(tf, hs, (ff, w, d) => {
    for (const k of [-1.1, 1.1]) opening(M(DARK), ff, k - 0.5, k + 0.5, w, top - 7, top - 1.5, 'pointed', d);
    opening(M(DARK), ff, -0.8, 0.8, w, top - 14, top - 9.5, 'pointed', d);
  });
  opening(M(DARK), turn(f), wt - 1.4, wt + 1.4, -(at + 4.2 + 0.06), g + 0.3, g + 5.5, 'pointed', -1); // portal on the church's front wall, under the tower
  for (const [sa, sw] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const) lathe(M(STONE), tf, sa * (hs - 0.45), sw * (hs - 0.45), [[0.45, top], [0.35, top + 1.4], [0, top + 3]], 4);
  spire(M('#5f5a56'), ring(tf, 0, 0, (hs + 0.2) * SQ2, top, 4), P(tf, 0, top + 6, 0));
  fbox(M('#e8e2d4', 'metal'), tf, -0.1, 0.1, -0.1, 0.1, top + 5.6, top + 8); // cross
  fbox(M('#e8e2d4', 'metal'), tf, -0.7, 0.7, -0.1, 0.1, top + 7, top + 7.25);
  return s.out();
};

export const details: Partial<Record<LandmarkId, DetailFn>> = {
  'buu-dien': buuDien,
  ubnd,
  'nha-tho-lon': nhaThoLon,
  'trang-tien-plaza': trangTien,
  'nha-hat-lon': nhaHatLon,
  'bao-tang-lich-su': baoTang,
  metropole,
  'hoa-lo': hoaLo,
  'ga-ha-noi': gaHaNoi,
  'nha-tho-ham-long': hamLong,
};
