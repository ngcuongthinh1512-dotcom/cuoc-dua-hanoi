// Leg 3 (Hà Nội) landmark details, group h3 = Đống Đa: Văn Miếu – Quốc Tử Giám, Gò Đống Đa, Vincom Nguyễn Chí Thanh.
// Built in code on top of the generic S3DB body (index.ts `generic`); see b.ts for the pattern. The Vietnamese temple kit
// (`hall`, `hipRoof`, `gate3`, `monument`) lives here and h4.ts imports it. Ground is flat (y ≈ 0); details are never
// solid (SPEC §5.9): colliders come from `h.renderPart` bodies only. Palette: ochre walls, brown-red tiles, brick, bronze.
import type { BuildingRec, LandmarkId, PartRec } from '../../geo/chunkData.ts';
import type { BuildOut } from '../buildTypes.ts';
import { triangulate, type V3 } from '../geom.ts';
import { cap, fbox, type Fr, P, rgb, UP } from './b.ts';
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

export const details: Partial<Record<LandmarkId, DetailFn>> = {
  'van-mieu': vanMieu,
  'go-dong-da': goDongDa,
  'vincom-nct': vincomNct,
};
