// Leg 3 (Hà Nội) landmark details, group h3 = Đống Đa: Văn Miếu – Quốc Tử Giám, Gò Đống Đa, Vincom Nguyễn Chí Thanh, Vincom Center Phạm Ngọc Thạch.
// Built in code on top of the generic S3DB body (index.ts `generic`); see b.ts for the pattern. The Vietnamese temple kit
// (`hall`, `hipRoof`, `gate3`, `monument`) lives here and h4.ts imports it. Ground is flat (y ≈ 0); details are never
// solid (SPEC §5.9): colliders come from `h.renderPart` bodies only. Palette: ochre walls, brown-red tiles, brick, bronze.
import type { BuildingRec, LandmarkId, PartRec } from '../../geo/chunkData.ts';
import type { BuildOut } from '../buildTypes.ts';
import { triangulate, type V3 } from '../geom.ts';
import { cap, DOWN, fbox, type Fr, P, rgb, UP } from './b.ts';
import { lathe } from './d.ts';
import type { DetailFn, Helpers, LandmarkCtx } from './index.ts';
import { footprintFrame, loft, quadOut, triOut } from './kit.ts';
import { Sink } from './parts.ts';

export const TILE = '#8a4a32'; // brown-red roof tiles
export const RIDGE = '#4a2e22';
export const OCHRE = '#d9b36a'; // Hà Nội yellow stucco
export const CREAM = '#e8dcc0';
export const BRICK = '#9b6a52';
export const WOOD = '#6e3524'; // lacquered timber
export const STONE = '#b8b0a0';
export const DARK = '#2e2a26'; // door / window openings
export const LAWN = '#6f8f4e';
export const EMPTY: BuildOut = { meshes: [], instances: [], colliders: [] };

/** Frame at a world point with its long axis along (ux, uz) (unit); a / b unused by P / fbox. */
export const frameAt = (cx: number, cz: number, ux = 1, uz = 0): Fr => ({ area: 0, cx, cz, ux, uz, a: 0, b: 0 });

/** Hipped tile roof with upturned corners over the frame rectangle (a0..a1 × w0..w1), eaves at yE, ridge yE + h.
 *  8-point eave ring (corners lifted by `curl`), ridge along a (a point for a square plan); both sides drawn, so the
 *  overhang reads from below. ≈ 20 triangles. */
export function hipRoof(s: Sink, f: Fr, a0: number, a1: number, w0: number, w1: number, yE: number, h: number, curl = 0.45, tile = TILE) {
  if (a0 > a1) [a0, a1] = [a1, a0];
  if (w0 > w1) [w0, w1] = [w1, w0];
  if (a1 - a0 < w1 - w0) return hipRoof(s, { ...f, ux: -f.uz, uz: f.ux }, w0, w1, -a1, -a0, yE, h, curl, tile); // ridge along the long side
  const buf = s.buf('masonry');
  buf.color = rgb(tile);
  const [am, wm] = [(a0 + a1) / 2, (w0 + w1) / 2];
  const run = Math.max(0, (a1 - a0) / 2 - (w1 - w0) / 2); // ridge half-length
  const R0 = P(f, am - run, yE + h, wm);
  const R1 = P(f, am + run, yE + h, wm);
  const E = (a: number, w: number, lift: number) => P(f, a, yE + lift, w);
  const C: V3 = [f.cx + am * f.ux - wm * f.uz, yE - h, f.cz + am * f.uz + wm * f.ux]; // below the roof: outward = away from it
  const tri = (a: V3, b: V3, c: V3) => {
    const m: V3 = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
    const out: V3 = [m[0] - C[0], m[1] - C[1], m[2] - C[2]];
    triOut(buf, a, b, c, out);
    triOut(buf, a, b, c, [-out[0], -out[1], -out[2]]);
  };
  for (const w of [w0, w1]) { // long sides: eave corner – middle – corner, ridge R0 – R1
    const [e0, m, e1] = [E(a0, w, curl), E(am, w, 0), E(a1, w, curl)];
    tri(e0, m, R0);
    tri(m, R1, R0);
    tri(m, e1, R1);
  }
  for (const [a, R] of [[a0, R0], [a1, R1]] as const) { // ends: corner – middle – corner to the ridge end
    const [e0, m, e1] = [E(a, w0, curl), E(a, wm, 0), E(a, w1, curl)];
    tri(e0, m, R);
    tri(m, e1, R);
  }
  const rb = s.buf('masonry');
  rb.color = rgb(RIDGE);
  fbox(rb, f, am - run - 0.3, am + run + 0.3, wm - 0.25, wm + 0.25, yE + h - 0.15, yE + h + 0.3); // ridge beam
}

/** Walled hall: stucco box a0..a1 × w0..w1 from y0, `wallH` high, under a hipped tile roof overhanging by `over`. */
export function hall(s: Sink, f: Fr, a0: number, a1: number, w0: number, w1: number, y0: number, wallH: number, roofH: number, over = 1.2, wall = OCHRE, tile = TILE) {
  const wb = s.buf('masonry');
  wb.color = rgb(wall);
  fbox(wb, f, a0, a1, w0, w1, y0, y0 + wallH);
  hipRoof(s, f, a0 - over, a1 + over, w0 - over, w1 + over, y0 + wallH - 0.25, roofH, 0.45, tile);
}

/** Dark opening (door / window) on the face w = `w` of a frame, between a0..a1 and y0..y1, proud by 3 cm. */
export function opening(s: Sink, f: Fr, a0: number, a1: number, w: number, y0: number, y1: number, sign: number, colour = DARK) {
  const d = s.buf('masonry');
  d.color = rgb(colour);
  const ww = w + sign * 0.03;
  quadOut(d, P(f, a0, y0, ww), P(f, a1, y0, ww), P(f, a1, y1, ww), P(f, a0, y1, ww), [-f.uz * sign, 0, f.ux * sign]);
}

/** Three-bay gate (tam quan) centred at (a, w) of a frame whose a axis runs ACROSS the gate: a two-storey middle bay
 *  under two tile roofs, one-storey side bays, dark doorways on both faces. `width` across, `depth` through. Top ≈ 9.6 m. */
export function gate3(s: Sink, f: Fr, a: number, w: number, width: number, depth: number, y0: number) {
  const [hw, hd] = [width / 2, depth / 2];
  const mid = width * 0.25;
  hall(s, f, a - mid, a + mid, w - hd, w + hd, y0, 4.2, 1.6, 0.9); // middle bay, ground storey
  hall(s, f, a - mid + 0.5, a + mid - 0.5, w - hd + 0.5, w + hd - 0.5, y0 + 4.6, 2.6, 2.0, 1.0, WOOD); // upper storey
  for (const sg of [-1, 1]) hall(s, f, a + sg * mid, a + sg * hw, w - hd + 0.4, w + hd - 0.4, y0, 3.2, 1.4, 0.8); // side bays
  for (const sg of [-1, 1]) {
    opening(s, f, a - 1.2, a + 1.2, w + sg * hd, y0, y0 + 3.2, sg); // middle doorway
    for (const k of [-1, 1]) opening(s, f, a + k * (mid + hw) / 2 - 0.7, a + k * (mid + hw) / 2 + 0.7, w + sg * (hd - 0.4), y0, y0 + 2.4, sg);
    opening(s, f, a - 0.9, a + 0.9, w + sg * (hd - 0.5), y0 + 5.2, y0 + 6.6, sg, '#4a2e22'); // upper-storey window
  }
}

/** Bronze standing figure `hFig` tall on a stepped stone plinth (`hPlinth`), centred at (x, z), facing +u of the frame. */
export function monument(s: Sink, f: Fr, y0: number, hPlinth: number, hFig: number) {
  const st = s.buf('masonry');
  st.color = rgb(STONE);
  const k = hFig / 8; // figure scale (8 m = the Quang Trung statue)
  fbox(st, f, -1.6 * k - 1, 1.6 * k + 1, -1.6 * k - 1, 1.6 * k + 1, y0, y0 + hPlinth * 0.25);
  fbox(st, f, -1.6 * k, 1.6 * k, -1.6 * k, 1.6 * k, y0, y0 + hPlinth);
  const br = s.buf('bronze');
  const t = y0 + hPlinth;
  lathe(br, f, 0, 0, [[1.3 * k, t], [1.0 * k, t + 3.6 * k], [0.9 * k, t + 5.4 * k]], 10); // robe, hem to chest
  fbox(br, f, -0.9 * k, 0.9 * k, -0.55 * k, 0.55 * k, t + 5.2 * k, t + 6.6 * k); // shoulders
  lathe(br, f, 0, 0, [[0.38 * k, t + 6.6 * k], [0.45 * k, t + 7.1 * k], [0.3 * k, t + 7.7 * k], [0, t + 8 * k]], 8); // head
  fbox(br, f, 0.55 * k, 0.95 * k, -0.22 * k, 0.22 * k, t + 5.8 * k, t + 9.2 * k); // raised right arm
  fbox(br, f, 0.6 * k, 0.9 * k, -0.08 * k, 0.08 * k, t + 9.2 * k, t + 10.4 * k); // sword
}

/** Flat polygon (world ring) at ground + lift, facing up: a lawn over a park outline the chunk data lost. */
export function lawn(s: Sink, outer: number[], height: (x: number, z: number) => number, lift = 0.02, colour = LAWN) {
  const g = s.buf('masonry');
  g.color = rgb(colour);
  const idx = triangulate(outer);
  const at = (i: number): V3 => [outer[2 * i]!, height(outer[2 * i]!, outer[2 * i + 1]!) + lift, outer[2 * i + 1]!];
  for (let k = 0; k < idx.length; k += 3) triOut(g, at(idx[k]!), at(idx[k + 1]!), at(idx[k + 2]!), UP);
}

/** Outline → an untagged Vietnamese hall through the S3DB renderer (ochre walls, hipped tile roof, collider). */
export function tiledBody(rec: BuildingRec, ctx: LandmarkCtx, h: Helpers, s: Sink, wallH: number, roofH: number, over: Partial<PartRec> = {}) {
  h.renderPart({ ...rec, kind: 'yes', height: wallH + roofH, roofHeight: roofH, roofShape: 'hipped', colour: OCHRE, roofColour: TILE, ...over },
    { ground: ctx.ground, height: ctx.height, fallbackTop: wallH + roofH }, s);
}

// ── Văn Miếu – Quốc Tử Giám ──
// OSM gives two outlines: Khuê Văn Các (way/702185155, 6 m square) and Văn Miếu Môn (way/702185143, the south gate). The
// compound axis runs from the gate through Khuê Văn Các to the Thái Học block (OSM way centres, −20° from north); the other
// halls, the stele houses, Đại Trung Môn / Đại Thành Môn and the ponds are plain OSM buildings / water drawn by
// BuildingBuilder, so this file adds only the two pavilions, the brick perimeter wall and (should the orchestrator route
// more compound ways here) a tiled hall for any further record.
const VMM: [number, number] = [-1727.5, 502.5]; // Văn Miếu Môn centre (world)
const AXIS: [number, number] = [0.343, -0.939]; // unit, gate → Thái Học (way/702185143 → the 43 m block at (−1636, 252))
const WALL = { a0: 0, a1: 292, w0: -41, w1: 38, gap: 7.5 }; // m along / across the axis: a1 stops 9 m short of Nguyễn Thái Học; the gap is the gate
const compound = (): Fr => frameAt(VMM[0], VMM[1], AXIS[0], AXIS[1]);

function khueVanCac(s: Sink, rec: BuildingRec, y0: number) {
  const f = footprintFrame(rec.outer);
  const st = s.buf('masonry');
  st.color = rgb(STONE);
  fbox(st, f, -4.2, 4.2, -4.2, 4.2, y0 - 0.1, y0 + 0.45); // stone platform
  const br = s.buf('masonry');
  br.color = rgb(BRICK);
  for (const a of [-2.1, 2.1]) for (const w of [-2.1, 2.1]) fbox(br, f, a - 0.5, a + 0.5, w - 0.5, w + 0.5, y0 + 0.45, y0 + 4.1); // 4 brick pillars
  const wd = s.buf('masonry');
  wd.color = rgb(WOOD);
  fbox(wd, f, -2.7, 2.7, -2.7, 2.7, y0 + 4.1, y0 + 4.5); // floor beam
  fbox(wd, f, -2.4, 2.4, -2.4, 2.4, y0 + 4.5, y0 + 6.5); // upper storey (timber)
  const win = s.buf('masonry');
  win.color = rgb('#3a1f14');
  for (const [ua, uw] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) { // the four round windows (octagons proud of the wall)
    const out: V3 = [ua * f.ux - uw * f.uz, 0, ua * f.uz + uw * f.ux];
    const [ca, cw] = [ua * 2.43, uw * 2.43];
    const disc = (r: number, lift: number, b: typeof win) => {
      const pts = Array.from({ length: 8 }, (_, k) => {
        const t = (k / 8) * 2 * Math.PI;
        return P(f, ca * (1 + lift) + uw * r * Math.cos(t), y0 + 5.5 + r * Math.sin(t), cw * (1 + lift) - ua * r * Math.cos(t));
      });
      for (let i = 1; i + 1 < pts.length; i++) triOut(b, pts[0]!, pts[i]!, pts[i + 1]!, out);
    };
    const rim = s.buf('masonry');
    rim.color = rgb(CREAM);
    disc(0.85, 0, rim);
    disc(0.62, 0.012, win);
  }
  hipRoof(s, f, -3.8, 3.8, -3.8, 3.8, y0 + 6.4, 1.0, 0.5); // lower roof skirt
  fbox(wd, f, -1.9, 1.9, -1.9, 1.9, y0 + 7.0, y0 + 8.0); // clerestory
  hipRoof(s, f, -3.0, 3.0, -3.0, 3.0, y0 + 7.9, 1.6, 0.55); // top roof, ≈ 9.8 m
}

function perimeterWall(s: Sink, y0: number) {
  const f = compound();
  const b = s.buf('masonry');
  b.color = rgb(BRICK);
  const seg = (a0: number, a1: number, w0: number, w1: number) => {
    const [u0, u1] = [P(f, a0, y0, w0), P(f, a1, y0, w1)];
    const n: V3 = [-(u1[2] - u0[2]), 0, u1[0] - u0[0]];
    for (const sg of [1, -1]) quadOut(b, u0, u1, [u1[0], y0 + 2.2, u1[2]], [u0[0], y0 + 2.2, u0[2]], [n[0] * sg, 0, n[2] * sg]);
    quadOut(b, [u0[0], y0 + 2.2, u0[2]], [u1[0], y0 + 2.2, u1[2]], [u1[0] + n[2] * 0.001, y0 + 2.45, u1[2] - n[0] * 0.001], [u0[0], y0 + 2.45, u0[2]], UP); // coping lip
  };
  seg(WALL.a0, WALL.a1, WALL.w0, WALL.w0);
  seg(WALL.a0, WALL.a1, WALL.w1, WALL.w1);
  seg(WALL.a1, WALL.a1, WALL.w0, WALL.w1);
  seg(WALL.a0, WALL.a0, WALL.w0, -WALL.gap);
  seg(WALL.a0, WALL.a0, WALL.gap, WALL.w1);
  // tile coping along the top: a thin tiled cap (two slopes) on the long walls only
  const t = s.buf('masonry');
  t.color = rgb(TILE);
  for (const w of [WALL.w0, WALL.w1]) {
    quadOut(t, P(f, WALL.a0, y0 + 2.2, w - 0.3), P(f, WALL.a1, y0 + 2.2, w - 0.3), P(f, WALL.a1, y0 + 2.5, w), P(f, WALL.a0, y0 + 2.5, w), [f.uz, 1, -f.ux]);
    quadOut(t, P(f, WALL.a0, y0 + 2.5, w), P(f, WALL.a1, y0 + 2.5, w), P(f, WALL.a1, y0 + 2.2, w + 0.3), P(f, WALL.a0, y0 + 2.2, w + 0.3), [-f.uz, 1, f.ux]);
  }
}

const vanMieu: DetailFn = (rec, _parts, ctx, h) => {
  const s = new Sink();
  const f0 = footprintFrame(rec.outer);
  const dGate = Math.hypot(f0.cx - VMM[0], f0.cz - VMM[1]);
  const g = ctx.ground;
  if (dGate < 12) {
    const f = frameAt(f0.cx, f0.cz, -AXIS[1], AXIS[0]); // a across the gate, w along the compound axis
    gate3(s, f, 0, 0, 10.5, 4.2, g);
    s.prism([[P(f, -5, 0, -2), P(f, 5, 0, -2), P(f, 5, 0, 2), P(f, -5, 0, 2)].flatMap((p) => [p[0], p[2]])], g, g + 4);
    return s.out();
  }
  if (f0.a < 5) { // Khuê Văn Các (6 m square); it also owns the compound wall
    khueVanCac(s, rec, g);
    perimeterWall(s, g);
    s.prism([rec.outer], g, g + 4);
    return s.out();
  }
  tiledBody(rec, ctx, h, s, f0.b > 15 ? 7 : 4.5, Math.min(4, f0.b * 0.6)); // any further compound way routed here: a tiled hall
  return s.out();
};

// ── Gò Đống Đa: the mound (OSM node/5485635750 Miếu Trung Liệt stands on top, inside the ring path way/1208987660 r ≈ 38 m),
// Đền thờ Quang Trung (way/838426608) and the Quang Trung monument (node/5485636741: ≈ 14.6 m with its plinth). ──
const MOUND: [number, number] = [-2843, 2250];

const goDongDa: DetailFn = (rec, _parts, ctx, h) => {
  const s = new Sink();
  const g = ctx.ground;
  if (rec.kind !== 'artwork') { // Đền thờ Quang Trung
    tiledBody(rec, ctx, h, s, 5, 3.5);
    return s.out();
  }
  lawn(s, rec.outer, ctx.height); // the park polygon is a landmark outline, so the terrain lost its lawn
  const gr = s.buf('masonry');
  gr.color = rgb('#5e7f42');
  const fm = frameAt(MOUND[0], MOUND[1]);
  lathe(gr, fm, 0, 0, [[35, g + 0.03], [30, g + 1.8], [22, g + 3.8], [13, g + 5.4], [9, g + 6]], 24); // the mound, flat top 6 m up
  hall(s, fm, -2.6, 2.6, -2.2, 2.2, g + 6, 2.6, 1.6, 0.8, CREAM); // Miếu Trung Liệt
  opening(s, fm, -0.7, 0.7, -2.2, g + 6, g + 8, -1);
  const stair = s.buf('masonry');
  stair.color = rgb(STONE);
  const prof: [number, number][] = [[9, 6], [13, 5.4], [22, 3.8], [30, 1.8], [35, 0]]; // mound radius → height (as the lathe)
  const yAt = (r: number) => { const i = prof.findIndex(([pr]) => pr >= r); const [a, b] = [prof[Math.max(i - 1, 0)]!, prof[Math.max(i, 1)]!]; return g + a[1] + ((b[1] - a[1]) * (r - a[0])) / (b[0] - a[0]); };
  const fs = frameAt(MOUND[0], MOUND[1], 0.88, 0.48); // the OSM steps (way/1208987657) climb from the ring path east-south-east of the top
  for (let r = 9; r < 35; r += 2) fbox(stair, fs, r, r + 2.1, -1.5, 1.5, yAt(r + 2) - 0.1, yAt(r) + 0.08); // ponytail: slab treads following the slope, no handrail
  for (const p of rec.points ?? []) if (p.kind === 'artwork') monument(s, frameAt(p.x, p.z, 0.66, 0.75), g, 6.6, 8); // faces the park axis towards Tây Sơn
  return s.out();
};

// ── Vincom Nguyễn Chí Thanh / Vinhomes / ROX Tower: two 30-level tower parts (OSM) on a podium that BuildingBuilder already
// draws as the parent outline's 20 m block (the 6-level podium part is hidden inside it, so it is not drawn). Heights: 30 floors
// × 3.2 m + crown ≈ 100 m (estimate, no published figure). ──
const vincomNct: DetailFn = (rec, _parts, ctx, h) => {
  if ((rec.levels ?? 0) < 20) return EMPTY;
  const s = new Sink();
  const g = ctx.ground;
  const top = g + (rec.material === 'glass' ? 100 : 96);
  h.renderPart({ ...rec, kind: 'yes', height: top - g, material: 'glass', roofShape: 'flat', roofMaterial: 'concrete', roofColour: '#8d9298' },
    { ground: g, height: ctx.height, fallbackTop: top - g }, s);
  const f = footprintFrame(rec.outer);
  const mech = s.buf('masonry');
  mech.color = rgb('#b9bcc0');
  fbox(mech, f, -f.a * 0.55, f.a * 0.55, -f.b * 0.55, f.b * 0.55, top, top + 4.5); // setback mechanical box
  const band = s.buf('metal');
  band.color = rgb('#2f3940');
  const o = rec.outer;
  const n = o.length / 2;
  const r = (y: number, d: number): V3[] => Array.from({ length: n }, (_, i) => [o[2 * i]! + (o[2 * i]! - f.cx) * d, y, o[2 * i + 1]! + (o[2 * i + 1]! - f.cz) * d]);
  loft(band, [r(top - 3, 0.004), r(top + 1.5, 0.004)], 3); // dark glass band + parapet around the crown
  cap(band, r(top + 1.5, 0.004), UP);
  const fin = s.buf('metal');
  fin.color = rgb('#d2d6da');
  for (let i = 0; i < n; i++) { // vertical aluminium fins every 6 m of each long face
    const [ax, az, bx, bz] = [o[2 * i]!, o[2 * i + 1]!, o[2 * ((i + 1) % n)]!, o[2 * ((i + 1) % n) + 1]!];
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 15) continue;
    const [ux, uz] = [(bx - ax) / len, (bz - az) / len];
    const fins = Math.floor(len / 6);
    for (let k = 0; k < fins; k++) {
      const t = ((k + 0.5) / fins) * len;
      const ff = frameAt(ax + ux * t, az + uz * t, ux, uz);
      const sg = Math.sign((ff.cx - f.cx) * -uz + (ff.cz - f.cz) * ux) || 1; // which side of the edge is outside
      fbox(fin, ff, -0.2, 0.2, sg * -0.05, sg * 0.55, g + 1, top - 3.5);
    }
  }
  return s.out();
};

// ── Vincom Center Phạm Ngọc Thạch (way/136161117, Kim Liên): an 8-level mall, rounded-triangle plan (≈ 64 × 51 × 62 m) at the
// Phạm Ngọc Thạch – Đông Tác – Chùa Bộc junction, built after three pictures (DP Architects render 2015, a 2020 photo from the
// junction). Height ≈ 36 m (estimate: no published figure; retail floors ≈ 4.3 m + a 6 m ground floor). Facade: a glazed
// shopfront podium (0–6 m) under a band of pale slats (6–12 m), then copper aluminium louvre fins (12 m to the roof, 0.5 m
// rhythm) with a horizontal dark glazed band at 16–18.5 m; the junction corner carries the "V": a dark trapezoid frame (top
// band at 29–31.5 m, legs widening to the podium) around a curved dark-glass atrium (20–29 m) over the big LED screen
// (8–17 m). Signs: "VINCOM CENTER" on the fins of the Phạm Ngọc Thạch face, the red UNIQLO square on the Đông Tác face, the
// café + mall fascias on the podium. Everything is laid out along the PERIMETER (arc length s from the corner apex) so the
// rounded corners need no special case. LED / signs are one OffscreenCanvas atlas on 'mural' (as m.ts / n.ts); without
// OffscreenCanvas (Node tests) they stay plain dark panels. Collider: the body prism only (h.renderPart). ──
const JUNCTION: [number, number] = [-2154, 2903]; // Phạm Ngọc Thạch – Đông Tác (world)
const H_MALL = 36;
const COPPER = ['#d19c48', '#8f6128']; // fin front, fin flank (depth shading): copper-gold, warm but not orange
const PALE = ['#ddd3c2', '#a89e8e'];
const V = { yTop: 29, band: 2.5, yBot: 6, wTop: 11, wBot: 30 }; // the trapezoid cut-out: half-width (m along the perimeter) at its top / bottom
/** Height of the V's diagonal edge at |s| from the corner: yTop inside wTop, yBot beyond wBot. */
export const vEdge = (s: number) => V.yBot + (V.yTop - V.yBot) * Math.min(1, Math.max(0, (V.wBot - Math.abs(s)) / (V.wBot - V.wTop)));

export interface Perimeter {
  len: number;
  cum: number[]; // arc length of every vertex from the apex (the last = len)
  /** Point + outward (mitred at a vertex) normal + tangent at arc length s (any s: wraps). */
  at(s: number): { x: number; z: number; nx: number; nz: number; tx: number; tz: number };
}
/** The outline as a closed path from the vertex nearest `from`; +s runs the way whose first face looks most to the south (+z). */
export function perimeter(outer: number[], from: [number, number]): Perimeter {
  const n = outer.length / 2;
  const pt = (i: number): [number, number] => [outer[2 * (((i % n) + n) % n)]!, outer[2 * (((i % n) + n) % n) + 1]!];
  let [i0, best] = [0, Infinity];
  for (let i = 0; i < n; i++) {
    const d = Math.hypot(pt(i)[0] - from[0], pt(i)[1] - from[1]);
    if (d < best) [i0, best] = [i, d];
  }
  let [cx, cz] = [0, 0];
  for (let i = 0; i < n; i++) [cx, cz] = [cx + pt(i)[0] / n, cz + pt(i)[1] / n];
  const normal = (a: [number, number], b: [number, number]) => {
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    let [nx, nz] = [-(b[1] - a[1]) / l, (b[0] - a[0]) / l];
    if (((a[0] + b[0]) / 2 - cx) * nx + ((a[1] + b[1]) / 2 - cz) * nz < 0) [nx, nz] = [-nx, -nz];
    return [nx, nz] as const;
  };
  const dir = normal(pt(i0), pt(i0 + 1))[1] >= normal(pt(i0), pt(i0 - 1))[1] ? 1 : -1;
  const pts = Array.from({ length: n + 1 }, (_, k) => pt(i0 + dir * k));
  const cum = [0];
  for (let k = 0; k < n; k++) cum.push(cum[k]! + Math.hypot(pts[k + 1]![0] - pts[k]![0], pts[k + 1]![1] - pts[k]![1]));
  const len = cum[n]!;
  const at = (s: number) => {
    s = ((s % len) + len) % len;
    let k = 0;
    while (k + 1 < n && cum[k + 1]! <= s) k++;
    if (s >= cum[k + 1]! - 1e-6) [k, s] = [(k + 1) % n, k + 1 === n ? 0 : cum[k + 1]!]; // at the next vertex (float noise)
    const [a, b] = [pts[k]!, pts[k + 1]!];
    const l = cum[k + 1]! - cum[k]!;
    const t = (s - cum[k]!) / l;
    const [tx, tz] = [(b[0] - a[0]) / l, (b[1] - a[1]) / l];
    let [nx, nz] = normal(a, b);
    if (t < 1e-6) { // vertex: mitred normal
      const [px, pz] = normal(pts[(k + n - 1) % n]!, a);
      const m = Math.hypot(nx + px, nz + pz) || 1;
      [nx, nz] = [(nx + px) / m, (nz + pz) / m];
    }
    return { x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, nx, nz, tx, tz };
  };
  return { len, cum, at };
}

type Buf = Parameters<typeof quadOut>[0];
type Cell = [number, number, number, number];
const [AW, AH] = [1024, 1024];
const LED: Cell = [0, 0, 1024, 300];
const SIGN_BIG: Cell = [0, 300, 1024, 140];
const UNIQLO: Cell = [0, 440, 200, 200];
const CAFE: Cell = [200, 440, 824, 120];
const SIGN_SMALL: Cell = [0, 640, 1024, 140];

/** Vertical strip along the perimeter s0..s1 (broken at the vertices and every `step` m), bottom / top heights as functions
 *  of s, `off` m proud of the wall; uv across the strip from an atlas cell (else 0..1). Pieces with top ≤ bottom are skipped. */
function strip(buf: Buf, per: Perimeter, s0: number, s1: number, yb: (s: number) => number, yt: (s: number) => number, off: number, cell?: Cell, step = 1) {
  const ss = new Set<number>([s0, s1]);
  for (let s = s0 + step; s < s1; s += step) ss.add(s);
  for (const c of per.cum) for (const w of [c - per.len, c, c + per.len]) if (w > s0 && w < s1) ss.add(w);
  const list = [...ss].sort((a, b) => a - b);
  const [u0, v0, u1, v1] = cell ? [cell[0] / AW, (cell[1] + cell[3]) / AH, (cell[0] + cell[2]) / AW, cell[1] / AH] : [0, 0, 1, 1];
  const uAt = (s: number) => u0 + ((u1 - u0) * (s - s0)) / (s1 - s0);
  for (let k = 0; k + 1 < list.length; k++) {
    const [sa, sb] = [list[k]!, list[k + 1]!];
    if (sb - sa < 1e-4) continue;
    const [ba, ta, bb, tb] = [yb(sa), yt(sa), yb(sb), yt(sb)];
    if (ta <= ba + 1e-3 && tb <= bb + 1e-3) continue;
    const A = per.at(sa), B = per.at(sb); // mitred at the vertices: adjacent pieces share their edge
    const a: V3 = [A.x + A.nx * off, ba, A.z + A.nz * off], b: V3 = [B.x + B.nx * off, bb, B.z + B.nz * off];
    const c: V3 = [b[0], Math.max(tb, bb), b[2]], d: V3 = [a[0], Math.max(ta, ba), a[2]];
    quadOut(buf, a, b, c, d, [A.nx + B.nx, 0, A.nz + B.nz], uAt(sa), v0, uAt(sb), v1);
  }
}

/** Slab along the perimeter between offsets o0 < o1, `th` thick, top at y (a function of s: sloped), top / bottom / front faces. */
function ledge(buf: Buf, per: Perimeter, s0: number, s1: number, yTop: number | ((s: number) => number), o0: number, o1: number, th: number, step = 2) {
  const yAt = typeof yTop === 'number' ? () => yTop : yTop;
  const ss = new Set<number>([s0, s1]);
  for (let s = s0 + step; s < s1; s += step) ss.add(s);
  for (const c of per.cum) for (const w of [c - per.len, c, c + per.len]) if (w > s0 && w < s1) ss.add(w);
  const list = [...ss].sort((a, b) => a - b);
  for (let k = 0; k + 1 < list.length; k++) {
    const [A, B] = [per.at(list[k]!), per.at(list[k + 1]!)];
    const [ya, yb] = [yAt(list[k]!), yAt(list[k + 1]!)];
    const p = (q: typeof A, o: number, yy: number): V3 => [q.x + q.nx * o, yy, q.z + q.nz * o];
    quadOut(buf, p(A, o0, ya), p(B, o0, yb), p(B, o1, yb), p(A, o1, ya), UP);
    quadOut(buf, p(A, o0, ya - th), p(B, o0, yb - th), p(B, o1, yb - th), p(A, o1, ya - th), DOWN);
    quadOut(buf, p(A, o1, ya - th), p(B, o1, yb - th), p(B, o1, yb), p(A, o1, ya), [A.nx + B.nx, 0, A.nz + B.nz]);
  }
}

/** One louvre fin at s: a `w` wide, `depth` deep blade from y0 to y1, front face in `front`, flanks in `flank` (3 quads). */
function fin(buf: Buf, per: Perimeter, s: number, y0: number, y1: number, w: number, depth: number, off: number, front: V3, flank: V3) {
  if (y1 <= y0 + 0.05) return;
  const q = per.at(s);
  const p = (dt: number, o: number, y: number): V3 => [q.x + q.tx * dt + q.nx * o, y, q.z + q.tz * dt + q.nz * o];
  buf.color = front;
  quadOut(buf, p(-w / 2, off + depth, y0), p(w / 2, off + depth, y0), p(w / 2, off + depth, y1), p(-w / 2, off + depth, y1), [q.nx, 0, q.nz]);
  buf.color = flank;
  for (const sg of [-1, 1]) quadOut(buf, p(sg * w / 2, off, y0), p(sg * w / 2, off + depth, y0), p(sg * w / 2, off + depth, y1), p(sg * w / 2, off, y1), [q.tx * sg, 0, q.tz * sg]);
}

/** The LED + sign atlas; undefined without OffscreenCanvas. */
function paintVincomAtlas(): ImageBitmap | undefined {
  if (typeof OffscreenCanvas === 'undefined') return;
  const c = new OffscreenCanvas(AW, AH);
  const g = c.getContext('2d')!;
  g.fillStyle = '#0a0a0c';
  g.fillRect(0, 0, AW, AH);
  // LED: a dark screen with a cyan-magenta ad: glowing phone, bright blobs, big white numbers
  const [lx, ly, lw, lh] = LED;
  const grad = g.createLinearGradient(lx, ly, lx + lw, ly + lh);
  grad.addColorStop(0, '#120c1e'), grad.addColorStop(0.5, '#1c2a4a'), grad.addColorStop(1, '#0d1830');
  g.fillStyle = grad;
  g.fillRect(lx, ly, lw, lh);
  for (const [x, y, r, col] of [[180, 150, 110, '#ff3fa8'], [560, 120, 90, '#28d4ff'], [860, 200, 130, '#7a5cff']] as const) {
    const rg = g.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, col), rg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rg;
    g.fillRect(x - r, y - r, 2 * r, 2 * r);
  }
  g.fillStyle = '#e8f4ff';
  g.fillRect(470, 40, 90, 220); // phone
  g.fillStyle = '#2bd0ff';
  g.fillRect(480, 52, 70, 196);
  g.fillStyle = '#ffffff';
  g.font = 'bold 110px Arial, sans-serif';
  g.fillText('5000', 600, 165);
  g.fillStyle = '#39e0ff';
  g.font = 'bold 54px Arial, sans-serif';
  g.fillText('mAh', 870, 165);
  g.fillStyle = '#ffffff';
  g.font = 'bold 34px Arial, sans-serif';
  g.fillText('SẠC NHANH', 600, 225);
  // "VINCOM CENTER" red letters on the copper fins (big) and on the dark podium fascia (small)
  const letters = (cell: Cell, bg: string, fg: string, edge: string) => {
    g.fillStyle = bg;
    g.fillRect(cell[0], cell[1], cell[2], cell[3]);
    g.font = 'bold 112px Georgia, "Times New Roman", serif';
    g.textAlign = 'center';
    g.lineWidth = 8;
    g.strokeStyle = edge;
    g.strokeText('VINCOM CENTER', cell[0] + cell[2] / 2, cell[1] + 108);
    g.fillStyle = fg;
    g.fillText('VINCOM CENTER', cell[0] + cell[2] / 2, cell[1] + 108);
    g.textAlign = 'left';
  };
  letters(SIGN_BIG, COPPER[0]!, '#d7262b', '#fff6ea');
  letters(SIGN_SMALL, '#1c1b1b', '#d7262b', '#ffffff');
  // UNIQLO: red rounded square, white blocks (no logo)
  const [ux, uy, uw] = UNIQLO;
  g.fillStyle = '#d7262b';
  g.beginPath(), g.roundRect(ux + 6, uy + 6, uw - 12, uw - 12, 18), g.fill();
  g.fillStyle = '#ffffff';
  for (const [bx, by, bw, bh] of [[40, 40, 50, 14], [58, 54, 14, 50], [110, 40, 50, 14], [110, 72, 50, 14], [110, 104, 50, 14], [40, 120, 50, 14]]) g.fillRect(ux + bx, uy + by, bw, bh);
  // café fascia: dark green, white lettering
  g.fillStyle = '#1e5c43';
  g.fillRect(CAFE[0], CAFE[1], CAFE[2], CAFE[3]);
  g.fillStyle = '#ffffff';
  g.font = 'bold 72px Arial, sans-serif';
  g.textAlign = 'center';
  g.fillText('STARBUCKS COFFEE', CAFE[0] + CAFE[2] / 2, CAFE[1] + 86);
  g.textAlign = 'left';
  return c.transferToImageBitmap();
}

const vincomPnt: DetailFn = (rec, _parts, ctx, h) => {
  const s = new Sink();
  const g = ctx.ground;
  const top = g + H_MALL;
  h.renderPart({ ...rec, kind: 'yes', height: H_MALL, colour: '#4f3a26', roofShape: 'flat', roofMaterial: 'concrete', roofColour: '#8d9298' },
    { ground: g, height: ctx.height, fallbackTop: H_MALL }, s); // the body (collider): dark brown backing behind the fins
  const per = perimeter(rec.outer, JUNCTION);
  const L = per.len;
  const image = paintVincomAtlas();
  const mural = s.buf('mural');
  const st = s.buf('masonry');
  const mt = s.buf('metal');
  const glow = s.buf('neon');
  const half = (a: number) => Math.min(a, L / 2); // |s| wraps at the far side
  const vIn = (sx: number) => half(Math.abs(sx)); // distance from the corner along the perimeter

  // ── podium: lit shopfronts between dark mullions, dark fascia with the signs, entrance canopy at the corner ──
  glow.color = rgb('#c9a673');
  strip(glow, per, -L / 2, L / 2, () => g + 0.25, () => g + 4.4, 0.04, undefined, 3); // lit interior…
  strip(s.buf('glass'), per, -L / 2, L / 2, () => g + 0.25, () => g + 4.4, 0.1, undefined, 3); // …behind the shopfront glazing
  mt.color = rgb('#24262a');
  strip(mt, per, -L / 2, L / 2, () => g, () => g + 0.25, 0.1); // plinth
  for (let p = -L / 2 + 1.5; p < L / 2; p += 3) fin(mt, per, p, g, g + 4.4, 0.12, 0.14, 0.04, rgb('#24262a'), rgb('#1a1b1e')); // mullions
  st.color = rgb('#1c1b1b');
  strip(st, per, -L / 2, L / 2, () => g + 4.4, () => g + 6, 0.12); // fascia
  mt.color = rgb('#2b2e33');
  ledge(mt, per, -22, 22, g + 5.6, 0.12, 3.2, 0.3); // entrance canopy round the corner
  if (image) {
    strip(mural, per, 3, 15, () => g + 4.75, () => g + 5.85, 0.16, CAFE);
    strip(mural, per, -16, -5, () => g + 4.75, () => g + 5.9, 0.16, SIGN_SMALL);
    strip(mural, per, 40, 50, () => g + 4.75, () => g + 5.9, 0.16, SIGN_SMALL);
  }

  // ── pale slat band (6–12 m; inside the V it climbs to the atrium glass) and the copper fins (12 m to the roof, clipped
  // by the V's diagonal, continuing above the top band). Every band's feet stand on a sill (ledge): nothing hangs. ──
  mt.color = rgb('#2b2e33');
  ledge(mt, per, -L / 2, L / 2, g + 6.1, 0, 0.45, 0.1, 3); // sill under the slats
  ledge(mt, per, -L / 2, L / 2, g + 12.2, 0, 0.7, 0.3, 3); // sill under the copper fins
  for (let p = -L / 2 + 0.25; p < L / 2; p += 0.5) {
    const d = vIn(p);
    const edge = vEdge(d);
    const paleTop = d < V.wBot ? Math.min(20, edge) : 12;
    fin(mt, per, p, g + 6.1, g + paleTop, 0.1, 0.3, 0.08, rgb(PALE[0]!), rgb(PALE[1]!));
    if (d < V.wTop) fin(mt, per, p, g + V.yTop + V.band + 0.1, top, 0.16, 0.55, 0.1, rgb(COPPER[0]!), rgb(COPPER[1]!));
    else fin(mt, per, p, g + Math.max(12.2, edge), top, 0.16, 0.55, 0.1, rgb(COPPER[0]!), rgb(COPPER[1]!));
  }
  mt.color = rgb('#2f3940');
  ledge(mt, per, -L / 2, L / 2, g + 16, 0, 0.12, 0.05, 3);
  strip(mt, per, -L / 2, L / 2, () => g + 16, () => g + 18.5, 0.04); // horizontal glazed band behind the fins

  // ── the V: curved atrium glass + floor slabs, the LED screen, the dark trapezoid frame ──
  const gl = (sx: number) => g + Math.max(20, vEdge(vIn(sx)));
  mt.color = rgb('#3a4654');
  ledge(mt, per, -18.5, 18.5, g + 20, 0, 0.3, 0.3, 0.5); // atrium floor
  for (const y of [23, 26]) ledge(mt, per, -(V.wBot - ((y - V.yBot) * (V.wBot - V.wTop)) / (V.yTop - V.yBot)), V.wBot - ((y - V.yBot) * (V.wBot - V.wTop)) / (V.yTop - V.yBot), g + y + 0.35, 0.14, 0.5, 0.35, 0.5); // floor slabs seen through the glass
  mt.color = rgb('#1f2a36');
  strip(mt, per, -V.wBot, V.wBot, gl, () => g + V.yTop, 0.14, undefined, 0.5);
  st.color = rgb('#0e0e10');
  ledge(st, per, -16.5, 16.5, g + 6.3, 0, 0.6, 0.1, 0.5);
  strip(st, per, -16.5, 16.5, () => g + 6.3, () => g + 15.6, 0.5); // LED screen frame
  if (image) strip(mural, per, -16, 16, () => g + 6.6, () => g + 15.3, 0.56, LED);
  st.color = rgb('#1e2024');
  strip(st, per, -V.wBot - 1.5, V.wBot + 1.5, (sx) => g + vEdge(vIn(sx)), (sx) => g + Math.min(vEdge(vIn(sx)) + 2.6, V.yTop + V.band), 0.8, undefined, 0.5); // frame: top band + diagonal legs
  ledge(st, per, -V.wTop - 1.5, V.wTop + 1.5, g + V.yTop + V.band, 0, 0.8, 0.05); // its top edge
  ledge(st, per, -V.wBot - 1.5, V.wBot + 1.5, (sx) => g + vEdge(vIn(sx)) - 0.05, 0, 0.85, 0.05, 0.5); // its soffit: over the glass and under the legs (the clipped fins stand on it)

  // ── signs on the fins: VINCOM CENTER on the Phạm Ngọc Thạch face, UNIQLO near the corner of the Đông Tác face ──
  if (image) {
    st.color = rgb('#1e2024');
    for (const [s0, s1, y0, y1, cell] of [[-47, -18, 25, 29, SIGN_BIG], [16, 20, 32, 36, UNIQLO], [-56, -53, 27.5, 30.5, UNIQLO]] as const) {
      ledge(st, per, s0, s1, g + y0, 0.3, 0.8, 0.08, 0.5); // sign rail
      strip(mural, per, s0, s1, () => g + y0, () => g + y1, 0.75, cell, 0.5);
    }
  }

  // ── roof: parapet cap, plant box ──
  st.color = rgb('#3a3634');
  ledge(st, per, -L / 2, L / 2, top + 0.9, -0.3, 0.75, 0.9, 3);
  st.color = rgb('#5f8a46');
  ledge(st, per, -L / 2, L / 2, top + 0.7, -1.6, -0.3, 0.6, 3);

  const out = s.out();
  return image ? { ...out, textures: [{ material: 'mural', image }] } : out;
};

export const details: Partial<Record<LandmarkId, DetailFn>> = {
  'van-mieu': vanMieu,
  'go-dong-da': goDongDa,
  'vincom-nct': vincomNct,
  'vincom-pham-ngoc-thach': vincomPnt,
};
