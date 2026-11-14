// ── Đền Ngọc Sơn + Đình Trấn Ba (đảo Ngọc, hồ Hoàn Kiếm; OSM way/178995262 temple, way/178995271 Trấn Ba; chunk 0_0).
// Frame NS: origin (25.5, 161) in the middle of the main block, a = east (0.989, −0.148), w = south (0.148, 0.989): the OSM
// outline is square to it — main block a −11.9…12.2 × w −9.5…9.3, the front porch a ±6.3 out to w 12.1 (the temple faces
// SOUTH, to Đình Trấn Ba and the lake), the rear annex a −4…3.7 back to w −13.3. Cầu Thê Húc lands at (a 20.1, w −4.2)
// coming from the east-south-east, so Đắc Nguyệt Lâu (landmarks/thehuc.ts, not built here) stands ≈ a 16…20 and its passage
// looks at the temple's EAST wall 5 m behind it: grey plaster, a red side door, white couplet boards (the owner's photo 60).
// Layout (chữ Tam + two wings): three parallel halls with their ridges east–west — Bái đường (front, open porch on six red
// columns, three red door sets, the turtle / qilin mosaic panels in the outer bays, hoành phi 玉山祠), Trung đường (two-tier
// roof, a lattice clerestory between the tiers), Hậu cung + the low rear annex — between two lower wings (ridges north–south).
// Everything stands on a 0.45 m stone plinth (three front steps, three at the side door). Roofs: hipped, sagging, the eave
// corners swept up (đao), grey ridges with kìm nóc, lưỡng long chầu nhật on the two main ridges. The yard: square terracotta
// tiles along the east wall (the court behind the gate) and across the south front, bronze incense burner, stone stele,
// potted plants. Đình Trấn Ba (frame centre a 1.6, w 26.6): stone platform, 4 stone corner pillars + 4 red columns, two-tier
// swept roof, board 鎮波亭.
// Textures: ONE 2048² OffscreenCanvas atlas on 'mural' (chunk 0_0: 'mural2' = thapbut.ts, 'mural3' + 'neonSign' = thehuc.ts)
// painted from the owner's AI tiles textures/hoankiem/{roof,plaster,redwood,stone,panel-turtle,panel-qilin}.webp, which the
// chunk worker fetches BEFORE the build (preloadNgocSon, awaited through index.ts landmarkAssets). Without the tiles the
// atlas is painted in flat colours; without OffscreenCanvas (tests) every face is flat 'masonry'. Light: the lanterns and
// the paper panes behind the door / window lattices are unlit 'neon' faces (always on: plain red silk / dull amber by day,
// glowing once the dusk light drops; the chunk's 'neonSign' atlas belongs to thehuc.ts).
// Solid (Sink.prism): the halls, plinth of the porch, steps, columns, pillars, burner, stele, pots, the Trấn Ba platform.
// The court, the porch and the pavilion floor are walkable (risers 0.15–0.17 m ≤ player.maxStep). ≈ 9k triangles.
import type { BuildOut } from '../buildTypes.ts';
import type { MeshBuffer as Buf, V3 } from '../geom.ts';
import { type Fr, fbox, P, rgb, ring, stack, UP } from './b.ts';
import { bar } from './d.ts';
import type { DetailFn } from './index.ts';
import { quadOut, triOut } from './kit.ts';
import { Sink } from './parts.ts';

/** Temple frame: a = east, w = south (see the header). */
export const NS: Fr = { cx: 25.5, cz: 161, ux: 0.98898, uz: -0.14808, a: 12.2, b: 13.3, area: 0 };
/** World (x, z) of the frame point (a east, w south). */
export const nsWorld = (a: number, w: number): [number, number] => [NS.cx + a * NS.ux - w * NS.uz, NS.cz + a * NS.uz + w * NS.ux];
/** Clue box spot: the tiled court just inside Đắc Nguyệt Lâu, 4 m off the east wall, ≥ 3.5 m from the side-door steps, the pots, the trees and the gate. */
export const NS_BOX = nsWorld(16.3, -2.2);
const TB: Fr = { ...NS, cx: nsWorld(1.6, 26.6)[0], cz: nsWorld(1.6, 26.6)[1] }; // Đình Trấn Ba

// ── dimensions (m above the ground) ──
const PL = 0.45; // plinth top
const HW = 3.75; // hall wall top = hall eaves
const WW = 3.3; // wing wall top
const BW = 3.1; // rear annex wall top
const YARD = 0.07; // the yard tiles: just over RoadBuilder's footway ribbon
const [X0, X1, HX, Z0, Z1, PZ] = [-11.9, 12.2, 6.3, -9.5, 9.3, 12.1]; // block west / east, hall half width, block north / south, porch front
const [BX0, BX1, BZ] = [-4, 3.7, -13.3]; // rear annex
const COLS = [-6, -3.75, -1.25, 1.25, 3.75, 6]; // porch columns (a), at w COLW
const COLW = 11.75;
const BAYS = [-2.5, 0, 2.5]; // door sets of the front wall (a)
const DOOR = { w: 2.1, h: 2.6, lat0: 1.2, lat1: 2.35 }; // a door set: width, height, its lattice band
const SIDE_DOOR = -4.5; // w of the side door in the east wall (opposite the gate passage)
const COURT_WIN = [6.3, 1.8]; // w of the two lattice windows of the east wall
const WIN = { w: 1.5, y0: 1.0, y1: 2.1 }; // (above the plinth)

const C = {
  ochre: '#d2a548', grey: '#b5b2a8', stone: '#8f8f88', tile: '#5f5650', wood: '#8e2a1c', under: '#3a2a22', ridge: '#8b8d86',
  pave: '#a8836c', gold: '#d9b34a', pot: '#e4e1d6', leaf: '#4f8f45', dark: '#1f1512', lacquer: '#7a1410',
};
const M = (s: Sink, colour: string): Buf => {
  const b = s.buf('masonry');
  b.color = rgb(colour);
  return b;
};
const U = (f: Fr, k = 1): V3 => [k * f.ux, 0, k * f.uz];
const W = (f: Fr, k = 1): V3 => [-k * f.uz, 0, k * f.ux];
const turn = (f: Fr): Fr => ({ ...f, ux: -f.uz, uz: f.ux }); // u := w; a point (a, w) of f is (w, −a) in the turned frame

// ── atlas: px rectangles with their size in metres (sw along the face, sh up); v = 0 is the image's top row ──
interface Reg { x: number; y: number; w: number; h: number; sw: number; sh: number }
const [AW, AH] = [2048, 2048];
const reg = (x: number, y: number, w: number, h: number, sw: number, sh: number): Reg => ({ x, y, w, h, sw, sh });
const R = {
  roof: reg(8, 8, 512, 512, 4.4, 1), // tileable along the eaves (2 × 2.2 m of tiles), sh = eave → ridge
  stone: reg(536, 8, 512, 512, 4.5, 4.5), // tileable both ways
  pave: reg(1064, 8, 512, 512, 4, 4), // tileable both ways: 0.4 m square tiles
  wood: reg(1592, 8, 256, 512, 1, 4), // tileable along sw
  coupL: reg(1864, 8, 40, 256, 0.32, 2),
  coupR: reg(1912, 8, 40, 256, 0.32, 2),
  stele: reg(1960, 8, 72, 128, 0.9, 1.6),
  front: reg(8, 536, 1613, 422, 12.6, 3.3), // Bái đường front wall, a −6.3 → 6.3 above the plinth
  turtle: reg(1640, 536, 320, 240, 1.9, 1.425),
  qilin: reg(1640, 784, 320, 240, 1.9, 1.425),
  court: reg(8, 1032, 1880, 285, 18.8, 2.85), // east wall, w 9.3 → −9.5 above the plinth
  ochre: reg(8, 1328, 768, 317, 8, 3.3), // tileable along sw
  grey: reg(792, 1328, 768, 317, 8, 3.3), // tileable along sw
  board: reg(1576, 1328, 384, 144, 2.2, 0.8),
  boardTB: reg(1576, 1480, 384, 144, 2.2, 0.8),
  clere: reg(8, 1656, 512, 96, 4, 0.75), // lattice band, tileable along sw
  fascia: reg(536, 1656, 512, 40, 2.2, 0.17), // tile ends along the eaves, tileable along sw
};

const FILES = { roof: 'roof', plaster: 'plaster', redwood: 'redwood', stone: 'stone', turtle: 'panel-turtle', qilin: 'panel-qilin' } as const;
type Src = Partial<Record<keyof typeof FILES, ImageBitmap>>;
const tiles: Src = {};
let loading: Promise<void> | undefined;
/** Fetches + decodes the tiles once per worker; never rejects (a missing tile = a flat region). `dataUrl` = …/data/. */
export function preloadNgocSon(dataUrl: string): Promise<void> {
  if (!dataUrl || typeof createImageBitmap === 'undefined' || typeof OffscreenCanvas === 'undefined') return Promise.resolve();
  return (loading ??= Promise.all(
    (Object.entries(FILES) as [keyof typeof FILES, string][]).map(([k, n]) =>
      fetch(new URL(`../textures/hoankiem/${n}.webp`, dataUrl))
        .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(`HTTP ${r.status}`))))
        .then((b) => createImageBitmap(b))
        .then((img) => void (tiles[k] = img))
        .catch(() => undefined),
    ),
  ).then(() => undefined));
}
/** For index.ts landmarkAssets: the chunk holding this point awaits `preload` before its build. */
export const NS_ASSETS = { minX: NS.cx, maxX: NS.cx, minZ: NS.cz, maxZ: NS.cz, preload: preloadNgocSon };

type G = OffscreenCanvasRenderingContext2D;
const hash = (n: number) => { const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); };
const X = (r: Reg, s: number) => r.x + (s / r.sw) * r.w;
const Y = (r: Reg, t: number) => r.y + (1 - t / r.sh) * r.h;
function rectM(g: G, r: Reg, s0: number, t0: number, s1: number, t1: number, fill: string) {
  g.fillStyle = fill;
  g.fillRect(X(r, s0), Y(r, t1), X(r, s1) - X(r, s0), Y(r, t0) - Y(r, t1));
}
/** The region (+ a 6 px gutter against mip bleeding) filled with a seamless image every `tile` px, × `tint`; `flat` without the image. */
function fill(g: G, r: Reg, src: ImageBitmap | undefined, flat: string, tile: number, tint?: string) {
  g.save();
  g.beginPath(); g.rect(r.x - 6, r.y - 6, r.w + 12, r.h + 12); g.clip();
  if (src) {
    for (let x = r.x - tile; x < r.x + r.w + 6; x += tile) for (let y = r.y - tile; y < r.y + r.h + 6; y += tile) g.drawImage(src, x, y, tile, tile);
    if (tint) { g.globalCompositeOperation = 'multiply'; g.fillStyle = tint; g.fillRect(r.x - 6, r.y - 6, r.w + 12, r.h + 12); }
  } else {
    g.fillStyle = flat; g.fillRect(r.x - 6, r.y - 6, r.w + 12, r.h + 12);
  }
  g.restore();
}
const CJK = '"Songti SC", "STSong", "SimSun", "PMingLiU", "Noto Serif CJK TC", serif';
/** Characters in a row (right to left, the old way) or a column, filling the box. */
function chars(g: G, r: Reg, text: string, s0: number, t0: number, s1: number, t1: number, colour: string, column: boolean) {
  const n = text.length;
  const [w, h] = [X(r, s1) - X(r, s0), Y(r, t0) - Y(r, t1)];
  const cell = column ? h / n : w / n;
  g.fillStyle = colour; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `bold ${Math.floor(Math.min(cell, column ? w : h) * 0.86)}px ${CJK}`;
  [...text].forEach((ch, k) => (column ? g.fillText(ch, X(r, s0) + w / 2, Y(r, t1) + (k + 0.5) * cell) : g.fillText(ch, X(r, s1) - (k + 0.5) * cell, Y(r, t1) + h / 2)));
}
/** Square wooden lattice over a dark opening. */
function lattice(g: G, r: Reg, s0: number, t0: number, s1: number, t1: number) {
  rectM(g, r, s0, t0, s1, t1, '#1f100c');
  const line = '#93301f';
  const d = 0.14;
  const nx = Math.max(1, Math.round((s1 - s0) / d));
  const ny = Math.max(1, Math.round((t1 - t0) / d));
  for (let i = 0; i <= nx; i++) { const s = s0 + ((s1 - s0) * i) / nx; rectM(g, r, s - 0.016, t0, s + 0.016, t1, line); }
  for (let j = 0; j <= ny; j++) { const t = t0 + ((t1 - t0) * j) / ny; rectM(g, r, s0, t - 0.016, s1, t + 0.016, line); }
}
/** Red lacquer door set: `leaves` leaves, a gold-lined lower panel each, a lattice band lat0…lat1 (none when lat0 ≥ lat1). */
function door(g: G, r: Reg, src: Src, sc: number, wd: number, ht: number, leaves: number, lat0: number, lat1: number) {
  const [s0, s1] = [sc - wd / 2, sc + wd / 2];
  rectM(g, r, s0 - 0.1, 0, s1 + 0.1, ht + 0.12, '#4a120c'); // frame
  g.save();
  g.beginPath(); g.rect(X(r, s0), Y(r, ht), X(r, s1) - X(r, s0), Y(r, 0) - Y(r, ht)); g.clip();
  if (src.redwood) { for (let x = X(r, s0); x < X(r, s1); x += 160) for (let y = Y(r, ht); y < Y(r, 0); y += 160) g.drawImage(src.redwood, x, y, 160, 160); } else rectM(g, r, s0, 0, s1, ht, C.wood);
  g.restore();
  rectM(g, r, s0, 0, s1, ht, 'rgba(110,10,5,0.25)');
  if (lat1 > lat0) lattice(g, r, s0 + 0.06, lat0, s1 - 0.06, lat1);
  for (let k = 0; k < leaves; k++) {
    const [a, b] = [s0 + (wd * k) / leaves, s0 + (wd * (k + 1)) / leaves];
    rectM(g, r, a - 0.02, 0, a + 0.02, ht, '#3d0f0a'); rectM(g, r, b - 0.02, 0, b + 0.02, ht, '#3d0f0a');
    const top = lat1 > lat0 ? lat0 - 0.12 : ht - 0.18;
    g.strokeStyle = 'rgba(217,179,74,0.75)'; g.lineWidth = Math.max(1, (0.02 * r.w) / r.sw);
    g.strokeRect(X(r, a + 0.09), Y(r, top), X(r, b - 0.09) - X(r, a + 0.09), Y(r, 0.18) - Y(r, top));
  }
}

function paintAtlas(): ImageBitmap | undefined {
  if (typeof OffscreenCanvas === 'undefined') return;
  const c = new OffscreenCanvas(AW, AH);
  const g = c.getContext('2d')!;
  const src = tiles;
  g.fillStyle = C.grey; g.fillRect(0, 0, AW, AH);
  fill(g, R.roof, src.roof, C.tile, 256);
  fill(g, R.stone, src.stone, C.stone, 256);
  fill(g, R.wood, src.redwood, C.wood, 256);
  // court paving: dusty terracotta squares, 0.4 m, each a little lighter / darker
  fill(g, R.pave, src.plaster, C.pave, 256, '#c79a80');
  for (let i = 0; i < 10; i++) for (let j = 0; j < 10; j++) {
    const k = hash(i * 17 + j * 31);
    rectM(g, R.pave, i * 0.4, j * 0.4, (i + 1) * 0.4, (j + 1) * 0.4, k < 0.5 ? `rgba(60,30,15,${(0.16 * k).toFixed(3)})` : `rgba(255,235,210,${(0.14 * (k - 0.5)).toFixed(3)})`);
  }
  for (let i = 0; i <= 10; i++) { rectM(g, R.pave, i * 0.4 - 0.012, -0.05, i * 0.4 + 0.012, 4.05, 'rgba(60,45,38,0.6)'); rectM(g, R.pave, -0.05, i * 0.4 - 0.012, 4.05, i * 0.4 + 0.012, 'rgba(60,45,38,0.6)'); }
  // walls: plaster × ochre / plain grey, a darker base band, soot under the eaves
  for (const [r, tint] of [[R.ochre, '#f6c765'], [R.front, '#f6c765'], [R.grey, undefined], [R.court, undefined]] as const) {
    fill(g, r, src.plaster, tint ? C.ochre : C.grey, 256, tint);
    rectM(g, r, -0.1, 0, r.sw + 0.1, 0.32, tint ? 'rgba(150,145,132,0.85)' : 'rgba(70,70,66,0.35)');
    rectM(g, r, -0.1, 0.32, r.sw + 0.1, 0.35, 'rgba(50,45,40,0.35)');
    rectM(g, r, -0.1, r.sh - 0.3, r.sw + 0.1, r.sh + 0.05, 'rgba(45,30,15,0.22)');
  }
  // Bái đường front: three door sets, the mosaic panels in the outer bays
  for (const a of BAYS) door(g, R.front, src, a + HX, DOOR.w, DOOR.h, 4, DOOR.lat0, DOOR.lat1);
  for (const [name, a] of [['turtle', -5], ['qilin', 5]] as const) {
    const [s0, t0] = [a + HX - 0.95, 0.75];
    if (src[name]) g.drawImage(src[name], X(R.front, s0), Y(R.front, t0 + 1.425), (1.9 * R.front.w) / R.front.sw, (1.425 * R.front.h) / R.front.sh);
    else { rectM(g, R.front, s0, t0, s0 + 1.9, t0 + 1.425, '#8d8f8a'); rectM(g, R.front, s0 + 0.2, t0 + 0.18, s0 + 1.7, t0 + 1.25, '#3fa9b5'); }
  }
  for (const [r, name] of [[R.turtle, 'turtle'], [R.qilin, 'qilin']] as const) {
    if (src[name]) g.drawImage(src[name], r.x, r.y, r.w, r.h); else rectM(g, r, 0, 0, r.sw, r.sh, '#3fa9b5');
  }
  // east wall (s = 9.3 − w): the side door between two white couplet boards, two lattice windows
  const sd = Z1 - SIDE_DOOR;
  door(g, R.court, src, sd, 1.5, 2.3, 2, 0, 0);
  for (const [k, text] of [[-1, '玉山千古秀'], [1, '劍水萬年清']] as const) {
    rectM(g, R.court, sd + k * 1.25 - 0.19, 0.5, sd + k * 1.25 + 0.19, 2.3, '#6d6a62');
    rectM(g, R.court, sd + k * 1.25 - 0.16, 0.53, sd + k * 1.25 + 0.16, 2.27, '#efece2');
    chars(g, R.court, text, sd + k * 1.25 - 0.14, 0.6, sd + k * 1.25 + 0.14, 2.2, '#1c1a18', true);
  }
  for (const w of COURT_WIN) {
    const s = Z1 - w;
    rectM(g, R.court, s - WIN.w / 2 - 0.1, WIN.y0 - 0.1, s + WIN.w / 2 + 0.1, WIN.y1 + 0.1, '#5a1a12');
    lattice(g, R.court, s - WIN.w / 2, WIN.y0, s + WIN.w / 2, WIN.y1);
  }
  // boards (gold on red lacquer, read right to left), couplets of the porch columns
  for (const [r, text] of [[R.board, '玉山祠'], [R.boardTB, '鎮波亭']] as const) {
    rectM(g, r, 0, 0, r.sw, r.sh, C.gold);
    rectM(g, r, 0.05, 0.05, r.sw - 0.05, r.sh - 0.05, C.lacquer);
    chars(g, r, text, 0.2, 0.1, r.sw - 0.2, r.sh - 0.1, '#e8c45a', false);
  }
  for (const [r, text] of [[R.coupL, '玉山千古秀'], [R.coupR, '劍水萬年清']] as const) {
    rectM(g, r, 0, 0, r.sw, r.sh, C.gold);
    rectM(g, r, 0.02, 0.02, r.sw - 0.02, r.sh - 0.02, C.lacquer);
    chars(g, r, text, 0.03, 0.08, r.sw - 0.03, r.sh - 0.08, '#e8c45a', true);
  }
  // stele: weathered stone, a rounded head, columns of worn strokes
  fill(g, R.stele, src.plaster, '#8d8f8a', 128, '#a9aba4');
  g.strokeStyle = 'rgba(40,42,40,0.6)'; g.lineWidth = 2;
  g.beginPath(); g.arc(X(R.stele, 0.45), Y(R.stele, 1.3), 0.2 * (R.stele.w / R.stele.sw), 0, Math.PI * 2); g.stroke();
  for (let i = 0; i < 6; i++) for (let j = 0; j < 14; j++) if (hash(i * 7 + j * 13) > 0.25) rectM(g, R.stele, 0.12 + i * 0.12, 0.12 + j * 0.065, 0.17 + i * 0.12, 0.16 + j * 0.065, 'rgba(40,42,40,0.5)');
  // lattice band, eave tile ends
  rectM(g, R.clere, -0.1, -0.05, 4.1, 0.8, '#5a1a12');
  for (let k = 0; k < 4; k++) lattice(g, R.clere, k + 0.06, 0.06, k + 0.94, 0.69);
  rectM(g, R.fascia, -0.1, -0.02, 2.3, 0.19, '#3b2a24');
  for (let k = 0; k < 20; k++) {
    g.fillStyle = k % 2 ? '#7d7770' : '#6a645e';
    g.beginPath(); g.arc(X(R.fascia, (k + 0.5) * 0.11), Y(R.fascia, 0.1), 0.05 * (R.fascia.w / R.fascia.sw), 0, Math.PI * 2); g.fill();
  }
  return c.transferToImageBitmap();
}

/** Textured faces on the atlas ('mural'); flat 'masonry' without an atlas. */
class Paint {
  private readonly mural?: Buf;
  constructor(readonly s: Sink, on: boolean) {
    if (on) this.mural = s.buf('mural');
  }
  private uv(r: Reg, x: number, t: number): [number, number] {
    return [(r.x + (x / r.sw) * r.w) / AW, (r.y + (1 - t / r.sh) * r.h) / AH];
  }
  /** Quad a (bottom left: s0, t0) → b → c (top right: s1, t1) → d, metres inside the region. */
  q(r: Reg, flat: string, a: V3, b: V3, c: V3, d: V3, out: V3, s0 = 0, t0 = 0, s1 = r.sw, t1 = r.sh) {
    if (!this.mural) return quadOut(M(this.s, flat), a, b, c, d, out);
    quadOut(this.mural, a, b, c, d, out, ...this.uv(r, s0, t0), ...this.uv(r, s1, t1));
  }
  /** Triangle, st = [s, t] × 3 in metres; degenerate ones are dropped. */
  tri(r: Reg, flat: string, a: V3, b: V3, c: V3, out: V3, st: number[]) {
    const [e, f] = [[b[0] - a[0], b[1] - a[1], b[2] - a[2]], [c[0] - a[0], c[1] - a[1], c[2] - a[2]]];
    if (Math.hypot(e[1]! * f[2]! - e[2]! * f[1]!, e[2]! * f[0]! - e[0]! * f[2]!, e[0]! * f[1]! - e[1]! * f[0]!) < 1e-5) return;
    if (!this.mural) return triOut(M(this.s, flat), a, b, c, out);
    triOut(this.mural, a, b, c, out, [...this.uv(r, st[0]!, st[1]!), ...this.uv(r, st[2]!, st[3]!), ...this.uv(r, st[4]!, st[5]!)]);
  }
  /** Wall from (a0, w0) to (a1, w1) = left → right seen from outside, y0 → y1; the region repeats along its width from s0, t from t0. */
  wall(r: Reg, flat: string, f: Fr, a0: number, w0: number, a1: number, w1: number, y0: number, y1: number, s0 = 0, t0 = 0) {
    const L = Math.hypot(a1 - a0, w1 - w0);
    const [da, dw] = [(a1 - a0) / L, (w1 - w0) / L];
    const out: V3 = [-dw * f.ux - da * f.uz, 0, -dw * f.uz + da * f.ux];
    for (let d = 0; d < L - 1e-6;) {
      const s = s0 + d - Math.floor((s0 + d) / r.sw + 1e-6) * r.sw;
      const len = Math.min(L - d, r.sw - s);
      const [pa, pb] = [[a0 + da * d, w0 + dw * d], [a0 + da * (d + len), w0 + dw * (d + len)]];
      this.q(r, flat, P(f, pa[0]!, y0, pa[1]!), P(f, pb[0]!, y0, pb[1]!), P(f, pb[0]!, y1, pb[1]!), P(f, pa[0]!, y1, pa[1]!), out, s, t0, s + len, t0 + y1 - y0);
      d += len;
    }
  }
  /** Horizontal face at y, the region repeating both ways. */
  floor(r: Reg, flat: string, f: Fr, a0: number, a1: number, w0: number, w1: number, y: number) {
    for (let a = a0; a < a1 - 1e-6;) {
      const s = a - Math.floor(a / r.sw + 1e-6) * r.sw;
      const la = Math.min(a1 - a, r.sw - s);
      for (let w = w0; w < w1 - 1e-6;) {
        const t = w - Math.floor(w / r.sh + 1e-6) * r.sh;
        const lw = Math.min(w1 - w, r.sh - t);
        this.q(r, flat, P(f, a, y, w), P(f, a + la, y, w), P(f, a + la, y, w + lw), P(f, a, y, w + lw), UP, s, t, s + la, t + lw);
        w += lw;
      }
      a += la;
    }
  }
  /** Box: four walls + the top. */
  box(r: Reg, flat: string, f: Fr, a0: number, a1: number, w0: number, w1: number, y0: number, y1: number) {
    this.wall(r, flat, f, a0, w1, a1, w1, y0, y1);
    this.wall(r, flat, f, a1, w1, a1, w0, y0, y1);
    this.wall(r, flat, f, a1, w0, a0, w0, y0, y1);
    this.wall(r, flat, f, a0, w0, a0, w1, y0, y1);
    this.floor(r, flat, f, a0, a1, w0, w1, y1);
  }
  /** Round red column (8 sides). */
  column(f: Fr, a: number, w: number, rad: number, y0: number, y1: number) {
    const [lo, hi] = [ring(f, a, w, rad, y0, 8), ring(f, a, w, rad, y1, 8)];
    for (let i = 0; i < 8; i++) {
      const j = (i + 1) % 8;
      this.q(R.wood, C.wood, lo[i]!, lo[j]!, hi[j]!, hi[i]!, [lo[i]![0] + lo[j]![0] - 2 * P(f, a, 0, w)[0], 0, lo[i]![2] + lo[j]![2] - 2 * P(f, a, 0, w)[2]], i / 8, 0, (i + 1) / 8, Math.min(4, y1 - y0));
    }
  }
}

const solid = (s: Sink, f: Fr, a0: number, a1: number, w0: number, w1: number, y0: number, y1: number) =>
  s.prism([[P(f, a0, 0, w0), P(f, a1, 0, w0), P(f, a1, 0, w1), P(f, a0, 0, w1)].flatMap((p) => [p[0], p[2]])], y0, y1);

/** Thin upright disc in the plane w = const (the sun of lưỡng long chầu nhật). */
function disc(buf: Buf, f: Fr, a: number, y: number, w: number, rad: number, th: number) {
  const n = 10;
  const pt = (k: number, ww: number): V3 => P(f, a + rad * Math.cos((2 * Math.PI * k) / n), y + rad * Math.sin((2 * Math.PI * k) / n), ww);
  for (let k = 0; k < n; k++) {
    for (const sg of [1, -1]) triOut(buf, P(f, a, y, w + (sg * th) / 2), pt(k, w + (sg * th) / 2), pt(k + 1, w + (sg * th) / 2), W(f, sg));
    const m = (2 * Math.PI * (k + 0.5)) / n;
    quadOut(buf, pt(k, w - th / 2), pt(k + 1, w - th / 2), pt(k + 1, w + th / 2), pt(k, w + th / 2), [Math.cos(m) * f.ux, Math.sin(m), Math.cos(m) * f.uz]);
  }
}

const SAG = 0.14; // the slopes hang below the straight line by this share of the rise
const STEP = R.roof.sw / 4; // strip width along the eaves (divides both the roof and the fascia period)
/** The cuts lo, hi, every STEP multiple between them and the extras, sorted. */
const cuts = (lo: number, hi: number, extra: number[]) => {
  const c = [lo, hi, ...extra.filter((v) => v > lo + 1e-3 && v < hi - 1e-3)];
  for (let v = Math.ceil(lo / STEP + 1e-3) * STEP; v < hi - 1e-3; v += STEP) if (!c.some((q) => Math.abs(q - v) < 1e-3)) c.push(v);
  return c.sort((p, q) => p - q);
};

/** Vietnamese hipped tile roof over the eave rectangle [a0, a1] × [w0, w1]: ridge along a at y1 (from a0 + inset to
 *  a1 − inset), sagging slopes, the eave corners swept up by `lift` (đao), dark underside (the same faces turned), a row of
 *  tile ends along the eaves, grey hip ridges with upturned tips, the ridge beam with its kìm nóc; `dragon` adds lưỡng long
 *  chầu nhật. Tile columns run straight up the slope (uv = position), the hips cut them. */
function roofC(p: Paint, f: Fr, a0: number, a1: number, w0: number, w1: number, y0: number, y1: number, inset: number, lift: number, ridge: 'dragon' | 'plain' | 'none' = 'plain') {
  const s = p.s;
  const [D, wm] = [(w1 - w0) / 2, (w0 + w1) / 2];
  const reach = Math.min(3, D, (a1 - a0) / 2);
  const yAt = (a: number, w: number, v: number) => {
    const c = Math.max(0, 1 - Math.hypot(Math.min(a - a0, a1 - a), Math.min(w - w0, w1 - w)) / reach);
    return y0 + (y1 - y0) * (v - SAG * Math.sin(Math.PI * v)) + lift * c * c;
  };
  const NV = 4;
  const cell = (A: V3, B: V3, Cc: V3, Dd: V3, st: number[], out: V3) => {
    p.tri(R.roof, C.tile, A, B, Cc, out, [st[0]!, st[1]!, st[2]!, st[3]!, st[4]!, st[5]!]);
    p.tri(R.roof, C.tile, A, Cc, Dd, out, [st[0]!, st[1]!, st[4]!, st[5]!, st[6]!, st[7]!]);
    const dn: V3 = [-out[0], -out[1], -out[2]];
    const u = M(s, C.under);
    triOut(u, A, B, Cc, dn); triOut(u, A, Cc, Dd, dn);
  };
  // side 0 / 1 = the long slopes (w0 / w1 eaves), 2 / 3 = the hip ends (a0 / a1)
  for (let side = 0; side < 4; side++) {
    const long = side < 2;
    const sg = side % 2 ? 1 : -1;
    if (!long && inset <= 0) continue;
    const [lo, hi, half] = long ? [a0, a1, inset] : [w0, w1, D];
    const pt = (q: number, v: number): V3 => {
      const [a, w] = long ? [q, wm + sg * D * (1 - v)] : [sg < 0 ? a0 + v * inset : a1 - v * inset, q];
      return P(f, a, yAt(a, w, v), w);
    };
    const vmax = (q: number) => (half > 0 ? Math.min(1, Math.min(q - lo, hi - q) / half) : 1);
    const out: V3 = long ? [W(f, sg)[0], 0.8, W(f, sg)[2]] : [U(f, sg)[0], 0.8, U(f, sg)[2]];
    const flatOut = long ? W(f, sg) : U(f, sg);
    const cs = cuts(lo, hi, long ? [a0 + inset, a1 - inset] : [wm]);
    for (let i = 0; i + 1 < cs.length; i++) {
      const [qL, qR] = [cs[i]!, cs[i + 1]!];
      const k = Math.floor(qL / R.roof.sw + 1e-4) * R.roof.sw;
      const [vL, vR] = [vmax(qL), vmax(qR)];
      for (let j = 0; j < NV; j++) {
        const [l0, l1, r0, r1] = [(j / NV) * vL, ((j + 1) / NV) * vL, (j / NV) * vR, ((j + 1) / NV) * vR];
        cell(pt(qL, l0), pt(qR, r0), pt(qR, r1), pt(qL, l1), [qL - k, l0, qR - k, r0, qR - k, r1, qL - k, l1], out);
      }
      const kf = Math.floor(qL / R.fascia.sw + 1e-4) * R.fascia.sw;
      const [eL, eR] = [pt(qL, 0), pt(qR, 0)];
      p.q(R.fascia, C.ridge, [eL[0], eL[1] - 0.17, eL[2]], [eR[0], eR[1] - 0.17, eR[2]], eR, eL, flatOut, qL - kf, 0, qR - kf, 0.17);
    }
  }
  if (ridge === 'none') return;
  const grey = M(s, C.ridge);
  const [ra0, ra1] = [a0 + inset, a1 - inset];
  fbox(grey, f, ra0 - 0.15, ra1 + 0.15, wm - 0.14, wm + 0.14, y1 - 0.08, y1 + 0.3);
  for (const sg of [-1, 1]) { // kìm nóc: the ridge ends turn up
    const e = sg < 0 ? ra0 : ra1;
    fbox(grey, f, Math.min(e, e + sg * 0.32), Math.max(e, e + sg * 0.32) , wm - 0.17, wm + 0.17, y1 + 0.2, y1 + 0.62);
    bar(grey, P(f, e + sg * 0.25, y1 + 0.6, wm), P(f, e - sg * 0.12, y1 + 0.92, wm), 0.16);
  }
  if (inset > 0) {
    for (const sa of [-1, 1]) for (const sw of [-1, 1]) { // hip ridges + the swept tips
      const hp = (v: number, up: number): V3 => {
        const [a, w] = [sa < 0 ? a0 + v * inset : a1 - v * inset, wm + sw * D * (1 - v)];
        return P(f, a, yAt(a, w, v) + up, w);
      };
      for (let k = 0; k < 4; k++) bar(grey, hp(k / 4, 0.06), hp((k + 1) / 4, 0.06), 0.2);
      const [ca, cw] = [sa < 0 ? a0 : a1, wm + sw * D];
      const tip = (o: number, up: number): V3 => P(f, ca + sa * o * 0.707, yAt(ca, cw, 0) + up, cw + sw * o * 0.707);
      bar(grey, tip(-0.1, 0.06), tip(0.4, 0.3), 0.17);
      bar(grey, tip(0.4, 0.3), tip(0.58, 0.72), 0.12);
    }
  }
  if (ridge !== 'dragon') return;
  const am = (ra0 + ra1) / 2;
  const gold = M(s, '#c9a13c');
  disc(gold, f, am, y1 + 0.74, wm, 0.36, 0.1);
  triOut(gold, P(f, am - 0.2, y1 + 1.04, wm), P(f, am + 0.2, y1 + 1.04, wm), P(f, am, y1 + 1.5, wm), W(f, 1));
  triOut(gold, P(f, am - 0.2, y1 + 1.04, wm), P(f, am + 0.2, y1 + 1.04, wm), P(f, am, y1 + 1.5, wm), W(f, -1));
  const body = M(s, '#74857a');
  const path: [number, number][] = [[0.62, 0.78], [1.0, 0.42], [1.4, 0.66], [1.8, 0.36], [2.2, 0.52], [2.6, 0.32], [2.95, 0.62]];
  const len = Math.min(1, ((ra1 - ra0) / 2 - 0.4) / 2.95);
  for (const sg of [-1, 1]) {
    for (let k = 0; k + 1 < path.length; k++) bar(body, P(f, am + sg * path[k]![0] * len, y1 + path[k]![1], wm), P(f, am + sg * path[k + 1]![0] * len, y1 + path[k + 1]![1], wm), 0.2 - 0.02 * k);
    fbox(body, f, am + sg * 0.6 * len - 0.16, am + sg * 0.6 * len + 0.16, wm - 0.13, wm + 0.13, y1 + 0.66, y1 + 0.94); // the head, towards the sun
  }
}

const AMBER: V3 = [0.7, 0.26, 0.045]; // lamp-lit paper (linear, unlit)
const SILK: V3 = [0.85, 0.03, 0.015];
/** Lamp-lit paper behind a lattice: nx × ny unlit panes 2 cm proud of the wall (a0, w0) → (a1, w1) (left → right from outside); the lattice shows between them. */
function panes(s: Sink, f: Fr, a0: number, w0: number, a1: number, w1: number, y0: number, y1: number, nx: number, ny: number) {
  const b = s.buf('neon');
  b.color = AMBER;
  const out: V3 = [-(w1 - w0) * f.ux - (a1 - a0) * f.uz, 0, -(w1 - w0) * f.uz + (a1 - a0) * f.ux];
  const k = 0.02 / Math.hypot(out[0], out[2]);
  const pt = (u: number, v: number): V3 => { const q = P(f, a0 + (a1 - a0) * u, y0 + (y1 - y0) * v, w0 + (w1 - w0) * u); return [q[0] + k * out[0], q[1], q[2] + k * out[2]]; };
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) quadOut(b, pt((i + 0.1) / nx, (j + 0.1) / ny), pt((i + 0.9) / nx, (j + 0.1) / ny), pt((i + 0.9) / nx, (j + 0.9) / ny), pt((i + 0.1) / nx, (j + 0.9) / ny), out);
}

/** Red silk lantern hanging from yTop: a six-sided unlit barrel, gilt caps, a tassel. */
function lantern(s: Sink, f: Fr, a: number, w: number, yTop: number) {
  bar(M(s, C.dark), P(f, a, yTop, w), P(f, a, yTop - 0.2, w), 0.025);
  const b = s.buf('neon');
  b.color = SILK;
  stack(b, ([[0.08, 0], [0.19, 0.1], [0.19, 0.32], [0.08, 0.42]] as const).map(([r, dy]) => ring(f, a, w, r, yTop - 0.62 + dy, 6)));
  const gold = M(s, C.gold);
  for (const y of [yTop - 0.64, yTop - 0.2]) stack(gold, [ring(f, a, w, 0.09, y, 6), ring(f, a, w, 0.09, y + 0.04, 6)]);
  bar(M(s, '#b3160f'), P(f, a, yTop - 0.64, w), P(f, a, yTop - 0.88, w), 0.04); // tassel
}

/** Glazed pot with a clipped shrub. */
function pot(s: Sink, f: Fr, a: number, w: number, y: number, k = 1) {
  stack(M(s, C.pot), [ring(f, a, w, 0.22 * k, y, 8), ring(f, a, w, 0.33 * k, y + 0.38 * k, 8), ring(f, a, w, 0.3 * k, y + 0.45 * k, 8)]);
  stack(M(s, C.leaf), [ring(f, a, w, 0.2 * k, y + 0.45 * k, 7), ring(f, a, w, 0.4 * k, y + 0.7 * k, 7), ring(f, a, w, 0.36 * k, y + 1.0 * k, 7), ring(f, a, w, 0.12 * k, y + 1.25 * k, 7)]);
  solid(s, f, a - 0.3 * k, a + 0.3 * k, w - 0.3 * k, w + 0.3 * k, y, y + 1.2 * k);
}

/** Lattice band of a cổ diêm box (the wall between two roof tiers) on its four faces, lamp-lit from inside. */
function clerestory(p: Paint, f: Fr, a0: number, a1: number, w0: number, w1: number, y0: number, y1: number) {
  fbox(M(p.s, C.ochre), f, a0, a1, w0, w1, y0, y1);
  const e = 0.02;
  for (const [pa, pw, qa, qw] of [[a0, w1 + e, a1, w1 + e], [a1 + e, w1, a1 + e, w0], [a1, w0 - e, a0, w0 - e], [a0 - e, w0, a0 - e, w1]] as const) {
    p.wall(R.clere, C.wood, f, pa, pw, qa, qw, y1 - 0.75, y1);
    panes(p.s, f, pa, pw, qa, qw, y1 - 0.69, y1 - 0.06, Math.round(Math.hypot(qa - pa, qw - pw) / 0.33), 2);
  }
}

function temple(p: Paint, g: number) {
  const s = p.s;
  const f = NS;
  const t = turn(f);
  // plinth (a ledge of 0.15 m), front steps, side-door steps
  p.box(R.stone, C.stone, f, X0 - 0.15, X1 + 0.15, Z0 - 0.15, Z1 + 0.15, g - 0.2, g + PL);
  p.box(R.stone, C.stone, f, -HX - 0.15, HX + 0.15, Z1, PZ + 0.15, g - 0.2, g + PL);
  p.box(R.stone, C.stone, f, BX0 - 0.15, BX1 + 0.15, BZ - 0.15, Z0, g - 0.2, g + PL);
  p.floor(R.pave, C.pave, f, -HX, HX, Z1, PZ, g + PL + 0.01); // the porch floor
  for (const [k, h] of [[0, 0.3], [1, 0.15]] as const) {
    p.box(R.stone, C.stone, f, -3.9, 3.9, PZ + 0.15 + 0.35 * k, PZ + 0.5 + 0.35 * k, g - 0.2, g + h);
    solid(s, f, -3.9, 3.9, PZ + 0.15 + 0.35 * k, PZ + 0.5 + 0.35 * k, g - 0.2, g + h);
    p.box(R.stone, C.stone, f, X1 + 0.15 + 0.35 * k, X1 + 0.5 + 0.35 * k, SIDE_DOOR - 1, SIDE_DOOR + 1, g - 0.2, g + h);
    solid(s, f, X1 + 0.15 + 0.35 * k, X1 + 0.5 + 0.35 * k, SIDE_DOOR - 1, SIDE_DOOR + 1, g - 0.2, g + h);
  }
  // walls (left → right seen from outside)
  p.wall(R.front, C.ochre, f, -HX, Z1, HX, Z1, g + PL, g + HW);
  p.wall(R.ochre, C.ochre, f, X0, Z1, -HX, Z1, g + PL, g + WW);
  p.wall(R.ochre, C.ochre, f, HX, Z1, X1, Z1, g + PL, g + WW, 3);
  p.wall(R.court, C.grey, f, X1, Z1, X1, Z0, g + PL, g + WW);
  p.wall(R.ochre, C.ochre, f, X0, Z0, X0, Z1, g + PL, g + WW, 1);
  p.wall(R.ochre, C.ochre, f, X1, Z0, HX, Z0, g + PL, g + WW, 2);
  p.wall(R.ochre, C.ochre, f, HX, Z0, BX1, Z0, g + PL, g + HW, 5);
  p.wall(R.ochre, C.ochre, f, BX1, Z0, BX1, BZ, g + PL, g + BW, 1);
  p.wall(R.ochre, C.ochre, f, BX1, BZ, BX0, BZ, g + PL, g + BW, 4);
  p.wall(R.ochre, C.ochre, f, BX0, BZ, BX0, Z0, g + PL, g + BW, 2);
  p.wall(R.ochre, C.ochre, f, BX0, Z0, -HX, Z0, g + PL, g + HW, 6);
  p.wall(R.ochre, C.ochre, f, -HX, Z0, X0, Z0, g + PL, g + WW, 3);
  const och = M(s, C.ochre); // the halls' flanks over the wing roofs
  for (const sg of [-1, 1]) quadOut(och, P(f, sg * HX, g + WW, Z0), P(f, sg * HX, g + WW, Z1), P(f, sg * HX, g + HW, Z1), P(f, sg * HX, g + HW, Z0), U(f, sg));
  // lamp light behind the door lattices and the east wall's windows
  for (const a of BAYS) panes(s, f, a - DOOR.w / 2 + 0.06, Z1, a + DOOR.w / 2 - 0.06, Z1, g + PL + DOOR.lat0, g + PL + DOOR.lat1, 8, 4);
  for (const w of COURT_WIN) panes(s, f, X1, w + WIN.w / 2, X1, w - WIN.w / 2, g + PL + WIN.y0, g + PL + WIN.y1, 5, 4);
  // roofs: the wings (ridges north–south), the three halls, the rear annex
  roofC(p, t, Z0 - 0.7, Z1 + 0.7, HX - 0.4, -X0 + 0.7, g + WW, g + 5.1, 2.6, 0.45, 'plain'); // west wing: turned w = −a
  roofC(p, t, Z0 - 0.7, Z1 + 0.7, -X1 - 0.7, -HX + 0.4, g + WW, g + 5.1, 2.6, 0.45, 'plain');
  roofC(p, f, -HX - 0.9, HX + 0.9, Z0 - 0.8, -3.2, g + HW, g + 6.7, 2.6, 0.5, 'plain'); // Hậu cung
  roofC(p, f, -HX - 1, HX + 1, -3.8, 3.8, g + HW, g + 5.2, 3, 0.5, 'none'); // Trung đường: the skirt …
  clerestory(p, f, -4.6, 4.6, -1.9, 1.9, g + 4.2, g + 5.4);
  roofC(p, f, -5.6, 5.6, -2.9, 2.9, g + 5.4, g + 7.3, 2.2, 0.5, 'dragon'); // … and the upper roof
  roofC(p, f, -HX - 0.9, HX + 0.9, 3.2, PZ + 0.8, g + HW, g + 6.6, 2.8, 0.6, 'dragon'); // Bái đường
  roofC(p, f, BX0 - 0.6, BX1 + 0.6, BZ - 0.7, Z0 + 0.1, g + BW, g + 4.6, 2, 0.35, 'plain');
  // porch: six red columns on stone bases, the beam, the board, the couplets, two lanterns
  for (const a of COLS) {
    p.column(f, a, COLW, 0.17, g + PL + 0.18, g + HW - 0.3);
    stack(M(s, C.stone), [ring(f, a, COLW, 0.3, g + PL, 8), ring(f, a, COLW, 0.22, g + PL + 0.18, 8)]);
    solid(s, f, a - 0.17, a + 0.17, COLW - 0.17, COLW + 0.17, g + PL, g + HW);
  }
  p.box(R.wood, C.wood, f, -HX + 0.1, HX - 0.1, COLW - 0.13, COLW + 0.13, g + HW - 0.32, g + HW);
  for (const a of [COLS[0]!, COLS.at(-1)!]) p.box(R.wood, C.wood, f, a - 0.11, a + 0.11, Z1, COLW, g + HW - 0.32, g + HW);
  const bd = (r: Reg, fr: Fr, a: number, w: number, y: number, dir: number) => { // a hanging board facing ±w
    fbox(M(s, C.lacquer), fr, a - r.sw / 2, a + r.sw / 2, w - 0.04, w + 0.04, y, y + r.sh);
    p.q(r, C.lacquer, P(fr, a - dir * r.sw / 2, y, w + dir * 0.045), P(fr, a + dir * r.sw / 2, y, w + dir * 0.045), P(fr, a + dir * r.sw / 2, y + r.sh, w + dir * 0.045), P(fr, a - dir * r.sw / 2, y + r.sh, w + dir * 0.045), W(fr, dir));
  };
  bd(R.board, f, 0, COLW, g + HW - 1.14, 1);
  for (const [r, a] of [[R.coupR, -1.25], [R.coupL, 1.25]] as const) {
    p.q(r, C.lacquer, P(f, a - 0.15, g + PL + 0.5, COLW + 0.18), P(f, a + 0.15, g + PL + 0.5, COLW + 0.18), P(f, a + 0.15, g + PL + 2.5, COLW + 0.18), P(f, a - 0.15, g + PL + 2.5, COLW + 0.18), W(f));
  }
  for (const a of [-2.5, 2.5]) lantern(s, f, a, COLW + 0.05, g + HW - 0.32);
  lantern(s, f, X1 + 0.75, SIDE_DOOR, g + WW - 0.05); // over the side door (under the wing's eave)
  // the yard: tiles along the east wall and across the south front (inside the island's shore line)
  p.floor(R.pave, C.pave, f, X1 + 0.15, 20.4, -11, Z1 + 0.15, g + YARD); // out to the back of Đắc Nguyệt Lâu (a ≈ 20.6)
  p.floor(R.pave, C.pave, f, -9.5, 15.5, Z1 + 0.15, 17, g + YARD);
  p.floor(R.pave, C.pave, f, -8.5, 12, 17, 22.2, g + YARD);
  // bronze incense burner on a stone block, in front of the steps
  const [ba, bw] = [0, 16.2];
  p.box(R.stone, C.stone, f, ba - 0.5, ba + 0.5, bw - 0.5, bw + 0.5, g, g + 0.55);
  const br = s.buf('bronze');
  stack(br, ([[0.2, 0], [0.26, 0.1], [0.46, 0.36], [0.52, 0.58], [0.44, 0.66], [0.48, 0.74], [0.3, 0.78], [0.12, 0.98], [0.05, 1.02]] as const).map(([r, y]) => ring(f, ba, bw, r, g + 0.55 + y, 10)));
  for (const sg of [-1, 1]) bar(br, P(f, ba + sg * 0.5, g + 1.1, bw), P(f, ba + sg * 0.58, g + 1.45, bw), 0.07);
  solid(s, f, ba - 0.5, ba + 0.5, bw - 0.5, bw + 0.5, g, g + 1.5);
  // stone stele on its base, west of the steps (it faces east, to the path from the gate)
  const [sa, sw] = [-7.3, 14.6];
  p.box(R.stone, C.stone, f, sa - 0.35, sa + 0.35, sw - 0.7, sw + 0.7, g, g + 0.35);
  fbox(M(s, '#8d8f8a'), f, sa - 0.11, sa + 0.11, sw - 0.45, sw + 0.45, g + 0.35, g + 1.95);
  for (const sg of [1, -1]) p.q(R.stele, '#8d8f8a', P(f, sa + sg * 0.115, g + 0.35, sw + sg * 0.45), P(f, sa + sg * 0.115, g + 0.35, sw - sg * 0.45), P(f, sa + sg * 0.115, g + 1.95, sw - sg * 0.45), P(f, sa + sg * 0.115, g + 1.95, sw + sg * 0.45), U(f, sg));
  solid(s, f, sa - 0.35, sa + 0.35, sw - 0.7, sw + 0.7, g, g + 1.95);
  // potted plants: by the front steps, along the east wall (clear of the side door and of NS_BOX), in the yard corners
  for (const [a, w, k] of [[-4.6, 13.1, 1.1], [4.6, 13.1, 1.1], [13.0, -7.6, 1], [13.0, 0.4, 1], [13.0, 4.1, 0.9], [13.0, 8.4, 1], [-8.6, 10.2, 0.9], [9.3, 10.2, 0.9]] as const) pot(s, f, a, w, g, k);
  // colliders: the block with the rear annex, the porch plinth
  s.prism([[[X0, Z0], [BX0, Z0], [BX0, BZ], [BX1, BZ], [BX1, Z0], [X1, Z0], [X1, Z1], [X0, Z1]].flatMap(([a, w]) => { const q = P(f, a!, 0, w!); return [q[0], q[2]]; })], g - 0.2, g + HW);
  solid(s, f, -HX - 0.15, HX + 0.15, Z1, PZ + 0.15, g - 0.2, g + PL);
}

function tranBa(p: Paint, g: number) {
  const s = p.s;
  const f = TB;
  const [H, top] = [4.5, g + 0.5];
  p.box(R.stone, C.stone, f, -H, H, -H, H, g - 0.6, top);
  p.floor(R.pave, C.pave, f, -H + 0.35, H - 0.35, -H + 0.35, H - 0.35, top + 0.01);
  solid(s, f, -H, H, -H, H, g - 0.6, top);
  for (const [k, h] of [[0, 0.33], [1, 0.17]] as const) { // steps on the temple side
    p.box(R.stone, C.stone, f, -1.7, 1.7, -H - 0.35 * (k + 1), -H - 0.35 * k, g - 0.2, g + h);
    solid(s, f, -1.7, 1.7, -H - 0.35 * (k + 1), -H - 0.35 * k, g - 0.2, g + h);
  }
  for (const sa of [-1, 1]) for (const sw of [-1, 1]) {
    p.box(R.grey, C.grey, f, sa * 3.6 - 0.21, sa * 3.6 + 0.21, sw * 3.6 - 0.21, sw * 3.6 + 0.21, top, g + 3.4); // stone corner pillars
    solid(s, f, sa * 3.6 - 0.21, sa * 3.6 + 0.21, sw * 3.6 - 0.21, sw * 3.6 + 0.21, top, g + 3.4);
    p.column(f, sa * 1.8, sw * 1.8, 0.17, top + 0.15, g + 4.6);
    stack(M(s, C.stone), [ring(f, sa * 1.8, sw * 1.8, 0.3, top, 8), ring(f, sa * 1.8, sw * 1.8, 0.22, top + 0.15, 8)]);
    solid(s, f, sa * 1.8 - 0.17, sa * 1.8 + 0.17, sw * 1.8 - 0.17, sw * 1.8 + 0.17, top, g + 3.4);
  }
  for (const sg of [-1, 1]) { // beams between the pillars
    p.box(R.wood, C.wood, f, -3.6, 3.6, sg * 3.6 - 0.1, sg * 3.6 + 0.1, g + 3.12, g + 3.4);
    p.box(R.wood, C.wood, f, sg * 3.6 - 0.1, sg * 3.6 + 0.1, -3.6, 3.6, g + 3.12, g + 3.4);
  }
  roofC(p, f, -5.4, 5.4, -5.4, 5.4, g + 3.4, g + 5.0, 3.9, 0.7, 'none');
  clerestory(p, f, -1.95, 1.95, -1.95, 1.95, g + 4.2, g + 5.25);
  roofC(p, f, -3.1, 3.1, -3.1, 3.1, g + 5.25, g + 6.55, 2.6, 0.6, 'plain');
  stack(M(s, C.ridge), ([[0.16, 0.3], [0.26, 0.5], [0.12, 0.72], [0.2, 0.86], [0.04, 1.1]] as const).map(([r, y]) => ring(f, 0, 0, r, g + 6.55 + y, 8))); // hồ lô finial
  // the board, on the temple side
  fbox(M(s, C.lacquer), f, -1.1, 1.1, -3.64, -3.56, g + 2.3, g + 3.1);
  p.q(R.boardTB, C.lacquer, P(f, 1.1, g + 2.3, -3.645), P(f, -1.1, g + 2.3, -3.645), P(f, -1.1, g + 3.1, -3.645), P(f, 1.1, g + 3.1, -3.645), W(f, -1));
  for (const a of [-2.4, 2.4]) lantern(s, f, a, -3.6, g + 3.12);
}

/** Registry 'den-ngoc-son': the temple record builds the temple + yard and carries the atlas, the 'roof' record Đình Trấn Ba (same atlas layout, no image). */
export const ngocSon: DetailFn = (rec, _parts, ctx) => {
  const s = new Sink();
  const pavilion = rec.kind === 'roof';
  const image = pavilion ? undefined : paintAtlas();
  const p = new Paint(s, typeof OffscreenCanvas !== 'undefined');
  // the ground under the frame's origin, not ctx.ground: the pavilion's outline reaches the carved lake bank
  if (pavilion) tranBa(p, ctx.height(TB.cx, TB.cz));
  else temple(p, ctx.height(NS.cx, NS.cz));
  const out: BuildOut = s.out();
  return image ? { ...out, textures: [{ material: 'mural', image }] } : out;
};
