// ── Tháp Bút (Pen Tower, 1865, Nguyễn Văn Siêu) on Núi Độc Tôn + Đài Nghiên (the Ink-Slab gate), the way in to Đền Ngọc Sơn,
// Hồ Hoàn Kiếm. OSM has the tower only as node/5857310193 (21.0306387 N, 105.8533875 E = world (130.72, 170.65), height 12,
// inscription 寫青天) 10 m south of the footway from Đinh Tiên Hoàng to Cầu Thê Húc (way/1219991533, z ≈ 160), and the gate
// as a floating 5–6 m slab (way/1220021892, x ≈ 94.85, z 154.1–162.3) at the shore end of the bridge. So both are one PLACED
// detail (h4.ts `placed`, registry 'thap-but', chunk 0_0); the gate's attic encloses the OSM slab, no chunk rebuild.
// After the owner's photos (57 front, 58 close): a mound of dark jagged rubble ≈ 2.9 m high inside a low kerb; the square
// tapering tower of dry-laid grey blocks, five stages with projecting two-step cornices, light stone panels on the front
// (north, towards the path) of stages 4 / 3 / 2 carrying the vermilion 寫 青 天 (Tả Thanh Thiên) top to bottom, blank
// panels on the sides, a low pyramid cap and the pen-nib finial (top ≈ 12.2 m); the big old trunk leaning over to the
// right with a limb crossing the tower front, a thin tree on the left; the small stone miếu on the right slope (plinth,
// brick steps, arched niche, a lintel plaque + two vertical plaques, curved dark tile roof).
// Frame: a = the viewer's RIGHT standing on the path looking at the characters (west), w = out to the viewer (north).
// Textures: the owner's AI tiles `textures/hoankiem/{stone,rubble,plaster,roof}.webp` are fetched by the chunk worker BEFORE
// the build (`preloadThapBut`, awaited through index.ts `landmarkAssets`) and drawn into ONE 2048² atlas on 'mural2' (the
// chunk's second atlas: 'mural' is left to Đền Ngọc Sơn). Each tile sits in a 768 px cell at 512 px with a 128 px wrapped
// gutter, so a quad may run from −0.25 to 1.25 tiles: big faces are cut at whole tiles (`face`), free quads wrap (`wrapT`).
// Without OffscreenCanvas (tests) everything is flat-coloured 'masonry'; a tile that failed to load is a flat cell.
// The small inscriptions (shrine plaques, gate couplets) are stand-in characters, not the real texts.
// Solid (Sink.prism): the mound in three steps, the tower, the shrine, the gate's two halves + its lintel (the 2.7 m arch
// stays open). Clue box spot TB_BOX on the south edge of the footway. ≈ 3k tris + 3 instanced trees (their crowns).
import type { ChunkData } from '../../geo/chunkData.ts';
import type { BuildCtx, BuildOut } from '../buildTypes.ts';
import type { MeshBuffer as Buf, V3 } from '../geom.ts';
import { pushMatrix } from '../StreetProps.ts';
import { cap, DOWN, fbox, type Fr, P, rgb, UP } from './b.ts';
import { hash, lathe } from './d.ts';
import { frameAt } from './h3.ts';
import { cross, quadOut, sub, triOut } from './kit.ts';
import { Sink } from './parts.ts';

/** The tower axis (world x, z) = OSM node/5857310193. */
export const TB: [number, number] = [130.72, 170.65];
export const TB_UA = [-1, 0] as const; // +a: west, the viewer's right
export const TB_UW = [0, -1] as const; // +w: north, out to the path
/** Clue box spot: the south edge of the footway in front of the characters, 8.6 m out from the tower axis (3 m clear of the
 *  kerb) = 21.030716 N, 105.853388 E; its front to the path (north: ?boxes yawDeg 0). */
export const TB_BOX: [number, number] = [TB[0], TB[1] - 8.6];
/** Đài Nghiên: middle of the gate (the OSM slab's centre); +a north along the wall, +w east (towards Tháp Bút). */
export const DN: [number, number] = [94.85, 158.2];
export const DN_UA = [0.0624, -0.998] as const;

// ── dimensions (m) ──
const MOUND = 2.9; // rubble top over the ground
const R0 = 1.9; // the flat top's radius
const KERB = 0.45;
const BASE = MOUND - 0.35; // the tower's foot (buried in the rubble)
/** Stages bottom → top: half-width at the foot, at the head, height. A 0.2 m cornice follows each. */
const STAGES: readonly [number, number, number][] = [[1.3, 1.24, 1.3], [1.14, 1.05, 1.75], [0.97, 0.89, 1.6], [0.82, 0.75, 1.45], [0.68, 0.62, 1.2]];
const GLYPHS = ['天', '青', '寫']; // on stages 2, 3, 4 (read top to bottom: 寫青天)
const GATE = { half: 4.15, t: 0.62, open: 1.35, spring: 2.3, wall: 5.0, top: 6.15 };

// ── atlas ──
const AS = 2048, CELL = 768, TILE = 512, PAD = 128;
interface Cell { x: number; y: number; m: number; flat: string } // m = metres per tile
const STONE: Cell = { x: 0, y: 0, m: 3, flat: '#8b8a85' };
const RUBBLE: Cell = { x: CELL, y: 0, m: 4, flat: '#4b4c4a' };
const PLASTER: Cell = { x: 0, y: CELL, m: 2.5, flat: '#96948d' };
const ROOF: Cell = { x: CELL, y: CELL, m: 1.2, flat: '#5d5048' };
const CELLS = [STONE, RUBBLE, PLASTER, ROOF];
const FILES = ['stone', 'rubble', 'plaster', 'roof'];
interface Reg { x: number; y: number; w: number; h: number; flat: string }
const PANEL = '#b4b1a8';
const R = {
  glyph: GLYPHS.map((_, i): Reg => ({ x: 1552, y: 16 + i * 280, w: 240, h: 264, flat: PANEL })),
  blank: { x: 1800, y: 16, w: 240, h: 264, flat: PANEL } as Reg,
  shrine: { x: 1552, y: 870, w: 384, h: 432, flat: '#8f8d86' } as Reg, // 1.2 × 1.35 m
  name: { x: 16, y: 1552, w: 440, h: 160, flat: PANEL } as Reg, // 2.2 × 0.8 m
  couplet: [{ x: 480, y: 1552, w: 110, h: 460, flat: PANEL }, { x: 610, y: 1552, w: 110, h: 460, flat: PANEL }] as Reg[], // 0.55 × 2.3 m
};
const CJK = '"Songti SC", "STSong", "Noto Serif CJK SC", "Source Han Serif SC", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", serif';
const RED = '#c62a1c';

let tiles: (ImageBitmap | undefined)[] = [];
let loading: Promise<void> | undefined;
/** Fetches + decodes the four tiles once per worker; never rejects (a missing tile = a flat cell). `dataUrl` = …/data/. */
export function preloadThapBut(dataUrl: string): Promise<void> {
  if (!dataUrl || typeof createImageBitmap === 'undefined' || typeof OffscreenCanvas === 'undefined') return Promise.resolve();
  return (loading ??= Promise.all(
    FILES.map((n) =>
      fetch(new URL(`../textures/hoankiem/${n}.webp`, dataUrl))
        .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(`HTTP ${r.status}`))))
        .then((b) => createImageBitmap(b))
        .catch(() => undefined),
    ),
  ).then((t) => void (tiles = t)));
}

type G = OffscreenCanvasRenderingContext2D;

/** A weathered light stone slab over a region (a piece of the stone tile washed pale, or flat), with a chiselled edge. */
function slab(g: G, r: Reg, edge = 5) {
  g.fillStyle = r.flat;
  g.fillRect(r.x - 8, r.y - 8, r.w + 16, r.h + 16);
  if (tiles[2]) {
    g.drawImage(tiles[2], 100, 100, 500, 500, r.x - 8, r.y - 8, r.w + 16, r.h + 16);
    g.fillStyle = 'rgba(205,202,192,0.45)';
    g.fillRect(r.x - 8, r.y - 8, r.w + 16, r.h + 16);
  }
  g.strokeStyle = 'rgba(40,40,36,0.55)';
  g.lineWidth = edge;
  g.strokeRect(r.x + edge / 2, r.y + edge / 2, r.w - edge, r.h - edge);
}

/** Characters top to bottom in a column centred on x. */
function column(g: G, text: string, x: number, y0: number, pitch: number, px: number, colour: string) {
  g.fillStyle = colour;
  g.font = `700 ${px}px ${CJK}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  [...text].forEach((ch, i) => g.fillText(ch, x, y0 + (i + 0.5) * pitch));
}

function paintAtlas(): ImageBitmap | undefined {
  if (typeof OffscreenCanvas === 'undefined') return;
  const c = new OffscreenCanvas(AS, AS);
  const g = c.getContext('2d');
  if (!g) return;
  g.fillStyle = '#7d7b75';
  g.fillRect(0, 0, AS, AS);
  CELLS.forEach((cell, k) => {
    const img = tiles[k];
    g.save();
    g.beginPath();
    g.rect(cell.x, cell.y, CELL, CELL);
    g.clip();
    g.fillStyle = cell.flat;
    g.fillRect(cell.x, cell.y, CELL, CELL);
    if (img) for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) g.drawImage(img, cell.x + PAD + i * TILE, cell.y + PAD + j * TILE, TILE, TILE);
    g.restore();
  });
  // the three character panels + the blank one
  R.glyph.forEach((r, i) => {
    slab(g, r);
    g.save();
    g.shadowColor = 'rgba(60,10,5,0.5)'; g.shadowBlur = 3; g.shadowOffsetY = 2; // the cut of the carving
    column(g, GLYPHS[i]!, r.x + r.w / 2, r.y + 8, r.h - 16, Math.round(r.h * 0.74), RED);
    g.restore();
  });
  slab(g, R.blank);
  // the shrine front (1.2 × 1.35 m at 320 px/m): plaster, lintel plaque, arched niche with an incense bowl, two plaques
  {
    const r = R.shrine;
    const p = r.w / 1.2;
    g.fillStyle = r.flat;
    g.fillRect(r.x - 8, r.y - 8, r.w + 16, r.h + 16);
    if (tiles[2]) g.drawImage(tiles[2], 0, 0, 640, 720, r.x - 8, r.y - 8, r.w + 16, r.h + 16);
    g.fillStyle = 'rgba(30,30,28,0.18)';
    g.fillRect(r.x - 8, r.y - 8, r.w + 16, r.h + 16);
    const plaque = (x: number, y: number, w: number, h: number) => {
      g.fillStyle = '#c9c4b4'; g.fillRect(x, y, w, h);
      g.strokeStyle = '#3a342c'; g.lineWidth = 3; g.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);
    };
    plaque(r.x + 0.3 * p, r.y + 0.06 * p, 0.6 * p, 0.17 * p); // lintel, read right to left
    g.fillStyle = '#6e1c14'; g.font = `700 ${Math.round(0.12 * p)}px ${CJK}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    [...'廟神山'].forEach((ch, i) => g.fillText(ch, r.x + (0.42 + i * 0.18) * p, r.y + 0.15 * p));
    const [cx, top, hw, bot] = [r.x + r.w / 2, r.y + 0.36 * p, 0.25 * p, r.y + 1.2 * p];
    g.fillStyle = '#b9b4a6'; // the niche's stone surround
    g.beginPath(); g.moveTo(cx - hw - 8, bot); g.lineTo(cx - hw - 8, top + hw); g.arc(cx, top + hw, hw + 8, Math.PI, 0); g.lineTo(cx + hw + 8, bot); g.closePath(); g.fill();
    const dark = g.createLinearGradient(0, top, 0, bot);
    dark.addColorStop(0, '#0d0b09'); dark.addColorStop(1, '#2a2119');
    g.fillStyle = dark;
    g.beginPath(); g.moveTo(cx - hw, bot); g.lineTo(cx - hw, top + hw); g.arc(cx, top + hw, hw, Math.PI, 0); g.lineTo(cx + hw, bot); g.closePath(); g.fill();
    g.fillStyle = '#b8923a'; g.beginPath(); g.ellipse(cx, bot - 0.09 * p, 0.1 * p, 0.06 * p, 0, 0, Math.PI * 2); g.fill(); // incense bowl
    g.fillStyle = '#d9c36a'; g.fillRect(cx - 0.13 * p, bot - 0.035 * p, 0.26 * p, 0.035 * p);
    plaque(r.x + 0.08 * p, r.y + 0.34 * p, 0.17 * p, 0.86 * p);
    plaque(r.x + 0.95 * p, r.y + 0.34 * p, 0.17 * p, 0.86 * p);
    column(g, '靈山鎮北千秋在', r.x + 0.165 * p, r.y + 0.36 * p, 0.117 * p, Math.round(0.1 * p), '#6e1c14');
    column(g, '聖德扶南萬古存', r.x + 1.035 * p, r.y + 0.36 * p, 0.117 * p, Math.round(0.1 * p), '#6e1c14');
  }
  // Đài Nghiên: the name plaque (硯臺, right to left) and the two couplet strips
  slab(g, R.name, 7);
  g.fillStyle = '#7a1f16'; g.font = `700 ${Math.round(R.name.h * 0.72)}px ${CJK}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('臺', R.name.x + R.name.w * 0.3, R.name.y + R.name.h / 2 + 4);
  g.fillText('硯', R.name.x + R.name.w * 0.7, R.name.y + R.name.h / 2 + 4);
  R.couplet.forEach((r, i) => {
    slab(g, r, 4);
    column(g, i ? '潑嶌墨痕湖水滿' : '擎天筆勢石峰高', r.x + r.w / 2, r.y + 10, (r.h - 20) / 7, Math.round(r.w * 0.56), '#2c2a26');
  });
  return c.transferToImageBitmap();
}

// ── geometry ──
const dist = (p: V3, q: V3) => Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
const mix = (p: V3, q: V3, t: number): V3 => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t];
/** A tile coordinate run [t0, t0 + span] (span ≤ 0.5) moved into the cell's −0.25 … 1.25 window. */
const wrapT = (t0: number, span: number) => { const t = t0 - Math.floor(t0); return t + span > 1.25 ? t - 1 : t; };
/** The mound's outline radius at angle th (frame a → w): an ellipse 6.8 × 5.2 m, lumpy. */
const edge = (th: number) => (1 + 0.07 * Math.sin(3 * th + 1) + 0.045 * Math.sin(5 * th + 0.4)) / Math.hypot(Math.cos(th) / 6.8, Math.sin(th) / 5.2);
/** Smooth rubble height over the ground at frame (a, w); 0 outside. */
function moundH(a: number, w: number) {
  const r = Math.hypot(a, w);
  const e = edge(Math.atan2(w, a));
  if (r >= e) return 0;
  return r <= R0 ? MOUND : 0.5 + (MOUND - 0.5) * (1 - (r - R0) / (e - R0)) ** 1.25;
}

export const thapBut = (_chunk: ChunkData, ctx: BuildCtx): BuildOut => {
  const f = frameAt(TB[0], TB[1], TB_UA[0], TB_UA[1]);
  const g = ctx.height(TB[0], TB[1]);
  const s = new Sink();
  const image = paintAtlas();
  const mural = image ? s.buf('mural2') : undefined;
  const st = s.buf('masonry');
  const nr = s.buf('masonry', 'near');
  const paint = (hex: string, buf: Buf = st) => { buf.color = rgb(hex); return buf; };
  const nrm = (fr: Fr, na: number, nw: number): V3 => [na * fr.ux - nw * fr.uz, 0, na * fr.uz + nw * fr.ux];
  const uv = (c: Cell, tu: number, tv: number): [number, number] => [(c.x + PAD + tu * TILE) / AS, (c.y + PAD + tv * TILE) / AS];
  /** One textured quad: tile coords (tu0, tvB) at p00 (bottom-left), (tu1, tvT) at p11. */
  const tq = (c: Cell, p00: V3, p10: V3, p11: V3, p01: V3, out: V3, tu0: number, tvB: number, tu1: number, tvT: number) => {
    if (!mural) return quadOut(paint(c.flat), p00, p10, p11, p01, out);
    const [u0, v0] = uv(c, tu0, tvB);
    const [u1, v1] = uv(c, tu1, tvT);
    quadOut(mural, p00, p10, p11, p01, out, u0, v0, u1, v1);
  };
  /** A flat (possibly tapering) face of any size, cut at whole tiles; (ou, ov) ≤ 0.25 shifts the pattern. */
  const face = (c: Cell, p00: V3, p10: V3, p11: V3, p01: V3, out: V3, ou = 0, ov = 0) => {
    const [W, H] = [dist(p00, p10), dist(p00, p01)];
    if (W < 1e-4 || H < 1e-4) return;
    const at = (u: number, v: number) => mix(mix(p00, p10, u), mix(p01, p11, u), v);
    for (let i = 0; i * c.m < W - 1e-4; i++) for (let j = 0; j * c.m < H - 1e-4; j++) {
      const [s0, s1, t0, t1] = [(i * c.m) / W, Math.min(1, ((i + 1) * c.m) / W), (j * c.m) / H, Math.min(1, ((j + 1) * c.m) / H)];
      tq(c, at(s0, t0), at(s1, t0), at(s1, t1), at(s0, t1), out, ou, 1 - ov, ou + ((s1 - s0) * W) / c.m, 1 - ov - ((t1 - t0) * H) / c.m);
    }
  };
  /** Textured frustum / box in a frame: half-sizes (a0, w0) at y0 → (a1, w1) at y1 around (ca, cw); 4 sides, top, optional underside. */
  const block = (c: Cell, fr: Fr, ca: number, cw: number, a0: number, w0: number, a1: number, w1: number, y0: number, y1: number, k = 0, under = false) => {
    const [ou, ov] = [0.25 * hash(k * 7.3 + 1), 0.25 * hash(k * 3.1 + 2)];
    const lo = (sa: number, sw: number) => P(fr, ca + sa * a0, y0, cw + sw * w0);
    const hi = (sa: number, sw: number) => P(fr, ca + sa * a1, y1, cw + sw * w1);
    face(c, lo(-1, 1), lo(1, 1), hi(1, 1), hi(-1, 1), nrm(fr, 0, 1), ou, ov);
    face(c, lo(1, -1), lo(-1, -1), hi(-1, -1), hi(1, -1), nrm(fr, 0, -1), ou + 0.1, ov);
    face(c, lo(1, 1), lo(1, -1), hi(1, -1), hi(1, 1), nrm(fr, 1, 0), ou + 0.05, ov);
    face(c, lo(-1, -1), lo(-1, 1), hi(-1, 1), hi(-1, -1), nrm(fr, -1, 0), ou + 0.15, ov);
    face(c, hi(-1, 1), hi(1, 1), hi(1, -1), hi(-1, -1), UP, ou, ov);
    if (under) face(c, lo(-1, 1), lo(1, 1), lo(1, -1), lo(-1, -1), DOWN, ou, ov);
  };
  const box = (c: Cell, fr: Fr, a0: number, a1: number, w0: number, w1: number, y0: number, y1: number, k = 0, under = false) =>
    block(c, fr, (a0 + a1) / 2, (w0 + w1) / 2, (a1 - a0) / 2, (w1 - w0) / 2, (a1 - a0) / 2, (w1 - w0) / 2, y0, y1, k, under);
  /** Painted region on an upright quad facing +w of `fr` (a0 = the viewer's left). */
  const decal = (r: Reg, fr: Fr, a0: number, a1: number, y0: number, y1: number, w: number) => {
    const [p00, p10, p11, p01] = [P(fr, a0, y0, w), P(fr, a1, y0, w), P(fr, a1, y1, w), P(fr, a0, y1, w)];
    if (!mural) return quadOut(paint(r.flat), p00, p10, p11, p01, nrm(fr, 0, 1));
    quadOut(mural, p00, p10, p11, p01, nrm(fr, 0, 1), r.x / AS, (r.y + r.h) / AS, (r.x + r.w) / AS, r.y / AS);
  };
  const solid = (fr: Fr, a0: number, a1: number, w0: number, w1: number, y0: number, y1: number) =>
    s.prism([[P(fr, a0, 0, w0), P(fr, a1, 0, w0), P(fr, a1, 0, w1), P(fr, a0, 0, w1)].flatMap((p) => [p[0], p[2]])], y0, y1);

  // ── the rubble mound: a jittered polar grid, flat-shaded, the tile laid top-down; loose rocks on it; the kerb ──
  const [NR, NS] = [8, 44];
  const mv = (j: number, i: number): [number, number, number] => { // frame a, y, w of grid vertex (ring j from the top, segment i)
    const k = (i % NS) * 37 + j * 101;
    const th = ((i % NS) + (j && j < NR ? (hash(k) - 0.5) * 0.5 : 0)) * ((2 * Math.PI) / NS);
    const e = edge(th);
    const r = R0 + (e - R0) * Math.min(1, (j + (j && j < NR ? (hash(k + 1) - 0.5) * 0.45 : 0)) / NR);
    const [a, w] = [r * Math.cos(th), r * Math.sin(th)];
    const bump = j === NR ? -0.03 : (hash(k + 2) - 0.45) * (j ? 0.55 : 0.2);
    return [a, g + Math.max(KERB, moundH(a, w) + bump), w];
  };
  const rubbleTri = (p: [number, number, number][], out?: V3) => {
    const pts = p.map(([a, y, w]) => P(f, a, y, w)) as [V3, V3, V3];
    const o: V3 = out ?? UP;
    if (!mural) return triOut(paint(RUBBLE.flat), ...pts, o);
    const tu = wrapT(Math.min(...p.map((q) => q[0])) / RUBBLE.m, 0.5) - Math.min(...p.map((q) => q[0])) / RUBBLE.m;
    const tv = wrapT(Math.min(...p.map((q) => q[2])) / RUBBLE.m, 0.5) - Math.min(...p.map((q) => q[2])) / RUBBLE.m;
    triOut(mural, ...pts, o, p.flatMap((q) => uv(RUBBLE, q[0] / RUBBLE.m + tu, q[2] / RUBBLE.m + tv)));
  };
  for (let i = 0; i < NS; i++) {
    rubbleTri([[0, g + MOUND + 0.05, 0], mv(0, i), mv(0, i + 1)]);
    for (let j = 0; j < NR; j++) {
      const [p00, p10, p11, p01] = [mv(j + 1, i), mv(j + 1, i + 1), mv(j, i + 1), mv(j, i)];
      if ((i + j) % 2) { rubbleTri([p00, p10, p11]); rubbleTri([p00, p11, p01]); } else { rubbleTri([p00, p10, p01]); rubbleTri([p10, p11, p01]); }
    }
  }
  for (let k = 0; k < 80; k++) { // loose rocks: jittered octahedra half sunk into the heap
    const th = hash(k * 5.1) * 2 * Math.PI;
    const r = R0 * 0.6 + (edge(th) - 0.3 - R0 * 0.6) * Math.sqrt(hash(k * 5.1 + 1));
    const [a, w] = [r * Math.cos(th), r * Math.sin(th)];
    if (Math.hypot(a - 4.4, w - 2.5) < 1.5 || (Math.abs(a) < 1.5 && Math.abs(w) < 1.5)) continue; // the shrine, the tower
    const sz = 0.22 + 0.4 * hash(k * 5.1 + 2) ** 2;
    const y = g + Math.max(KERB, moundH(a, w)) + sz * 0.25;
    const yaw = hash(k * 5.1 + 3) * Math.PI;
    const v = (da: number, dy: number, dw: number, n: number): [number, number, number] => {
      const q = sz * (0.65 + 0.7 * hash(k * 9.7 + n));
      const [ra, rw] = [da * Math.cos(yaw) - dw * Math.sin(yaw), da * Math.sin(yaw) + dw * Math.cos(yaw)];
      return [a + ra * q, y + dy * q * 0.8, w + rw * q];
    };
    const [xp, xn, zp, zn, top] = [v(1, 0, 0, 0), v(-1, 0, 0, 1), v(0, 0, 1, 2), v(0, 0, -1, 3), v(0.15, 1, -0.1, 4)];
    for (const [p, q] of [[xp, zp], [zp, xn], [xn, zn], [zn, xp]] as const) {
      const m = P(f, (p[0] + q[0]) / 2 - a, 0, (p[2] + q[2]) / 2 - w);
      rubbleTri([p, q, top], [m[0] - f.cx, 0.6 * sz, m[2] - f.cz]);
    }
  }
  const kerbRing = (d: number, y: number) => Array.from({ length: NS }, (_, i) => { const th = (i * 2 * Math.PI) / NS; const e = edge(th) + d; return P(f, e * Math.cos(th), y, e * Math.sin(th)); });
  const [k0, k1, k2] = [kerbRing(0.32, g - 0.1), kerbRing(0.32, g + KERB), kerbRing(0, g + KERB)];
  for (let i = 0, run = 0; i < NS; i++) {
    const j = (i + 1) % NS;
    const len = dist(k0[i]!, k0[j]!) / STONE.m;
    const t0 = wrapT(run, len);
    const out: V3 = [(k0[i]![0] + k0[j]![0]) / 2 - f.cx, 0, (k0[i]![2] + k0[j]![2]) / 2 - f.cz];
    tq(STONE, k0[i]!, k0[j]!, k1[j]!, k1[i]!, out, t0, 0.595, t0 + len, 0.595 - (KERB + 0.1) / STONE.m);
    tq(STONE, k1[i]!, k1[j]!, k2[j]!, k2[i]!, UP, t0, 0.39, t0 + len, 0.39 - 0.32 / STONE.m);
    run += len;
  }
  const outline = (k: number) => Array.from({ length: 16 }, (_, i) => { const th = (i * Math.PI) / 8; const e = (edge(th) + (k === 1 ? 0.32 : 0)) * k; const p = P(f, e * Math.cos(th), 0, e * Math.sin(th)); return [p[0], p[2]]; }).flat();
  s.prism([outline(1)], g - 0.2, g + 1.0);
  s.prism([outline(0.72)], g + 1.0, g + 1.9);
  s.prism([outline(0.45)], g + 1.9, g + MOUND);

  // ── the tower: five tapering stages of dry-laid blocks, a two-step cornice over each, the panels, the cap and the pen nib ──
  let y = g + BASE;
  const turned = [f, frameAt(f.cx, f.cz, f.uz, -f.ux), frameAt(f.cx, f.cz, -f.uz, f.ux)]; // +w = the front, the +a side, the −a side
  STAGES.forEach(([h0, h1, h], n) => {
    block(STONE, f, 0, 0, h0, h0, h1, h1, y, y + h, n);
    if (n >= 1) turned.forEach((fr, side) => {
      if (n === 4 && side) return;
      const pw = n === 4 ? 0.26 : Math.min(0.5, h1 * 0.56);
      const ph = n === 4 ? 0.3 : pw * 1.1;
      const yc = y + h * 0.5;
      paint('#8d8b84');
      fbox(st, fr, -pw - 0.05, pw + 0.05, h1 - 0.05, h0 + 0.035, yc - ph - 0.05, yc + ph + 0.05); // the panel's stone frame
      decal(side || n === 4 ? R.blank : R.glyph[n - 1]!, fr, -pw, pw, yc - ph, yc + ph, h0 + 0.04);
    });
    y += h;
    block(STONE, f, 0, 0, h1 + 0.07, h1 + 0.07, h1 + 0.07, h1 + 0.07, y, y + 0.09, n + 10, true);
    block(STONE, f, 0, 0, h1 + 0.17, h1 + 0.17, h1 + 0.19, h1 + 0.19, y + 0.09, y + 0.2, n + 20, true);
    y += 0.2;
  });
  const topHw = STAGES[4]![1] + 0.19;
  block(STONE, f, 0, 0, topHw - 0.04, topHw - 0.04, 0.2, 0.2, y, y + 0.32, 31); // the low pyramid cap
  paint('#8a8882');
  lathe(st, f, 0, 0, [[0.15, y + 0.3], [0.21, y + 0.42], [0.13, y + 0.5], [0.2, y + 0.68], [0.19, y + 0.86], [0.11, y + 1.12], [0, y + 1.38]], 8); // the brush: ferrule, belly, tip
  solid(f, -1.3, 1.3, -1.3, 1.3, g + MOUND, y);

  // ── the miếu on the right slope: stone plinth, brick steps, plaster body with the painted front, curved tile roof ──
  const sp = P(f, 4.4, 0, 2.5);
  const fs = frameAt(sp[0], sp[2], f.ux, f.uz);
  const [sy0, sy1, sRidge] = [g + 1.2, g + 2.55, g + 3.15];
  box(STONE, fs, -0.85, 0.85, -0.7, 0.65, g + 0.2, sy0, 40);
  for (let k = 0; k < 3; k++) box(STONE, fs, -0.45, 0.45, 0.65 + k * 0.28, 0.93 + k * 0.28, g + 0.2, sy0 - (k + 1) * 0.24, 41 + k);
  box(PLASTER, fs, -0.6, 0.6, -0.5, 0.5, sy0, sy1, 45);
  decal(R.shrine, fs, -0.6, 0.6, sy0, sy1, 0.505);
  box(PLASTER, fs, -0.72, 0.72, -0.62, 0.62, sy1, sy1 + 0.08, 46, true);
  {
    const [L, W, NI, NJ] = [0.98, 0.88, 4, 3];
    const rp = (i: number, j: number, sg: number): V3 => {
      const [a, t] = [-L + (2 * L * i) / NI, j / NJ];
      return P(fs, a, sRidge - 0.52 * (1 - (1 - t) ** 2) + 0.16 * Math.abs(a / L) ** 3 * t * t, sg * t * W);
    };
    for (const sg of [-1, 1]) for (let i = 0; i < NI; i++) for (let j = 0; j < NJ; j++) {
      const [p00, p10, p11, p01] = [rp(i, j + 1, sg), rp(i + 1, j + 1, sg), rp(i + 1, j, sg), rp(i, j, sg)];
      const [tu, dv] = [wrapT((i * 2 * L) / NI / ROOF.m, 0.5), dist(p00, p01) / ROOF.m];
      tq(ROOF, p00, p10, p11, p01, [0, 1, 0], tu, (j + 1) * dv, tu + (2 * L) / NI / ROOF.m, j * dv);
      quadOut(paint('#3a3531', nr), p00, p10, p11, p01, DOWN); // the underside of the eaves
    }
    for (const sg of [-1, 1]) { // gables
      const [e0, e1, top] = [P(fs, sg * 0.6, sy1 + 0.08, -0.6), P(fs, sg * 0.6, sy1 + 0.08, 0.6), P(fs, sg * 0.6, sRidge - 0.05, 0)];
      triOut(paint('#85837c'), e0, e1, top, nrm(fs, sg, 0));
    }
    paint('#3f3a36');
    fbox(st, fs, -L, L, -0.06, 0.06, sRidge - 0.04, sRidge + 0.07); // ridge
    for (const sg of [-1, 1]) fbox(st, fs, Math.min(sg * L, sg * (L - 0.14)), Math.max(sg * L, sg * (L - 0.14)), -0.07, 0.07, sRidge + 0.03, sRidge + 0.17);
  }
  solid(fs, -0.85, 0.85, -0.7, 1.4, g, sRidge);

  // ── the old tree: a leaning trunk from the front of the heap, a limb crossing the tower, crowns = instanced trees ──
  const unit = (d: V3): V3 => { const l = Math.hypot(d[0], d[1], d[2]) || 1; return [d[0] / l, d[1] / l, d[2] / l]; };
  const tube = (pts: [number, number, number][], r0: number, r1: number, n = 7) => {
    const ctl = pts.map(([a, yy, w]) => P(f, a, g + yy, w));
    const cs = ctl.flatMap((c, i): V3[] => { // one Catmull-Rom midpoint per span: the limbs bend instead of kinking
      if (i + 1 === ctl.length) return [c];
      const [p0, p2, p3] = [ctl[Math.max(0, i - 1)]!, ctl[i + 1]!, ctl[Math.min(ctl.length - 1, i + 2)]!];
      return [c, [0, 1, 2].map((k) => (-p0[k]! + 9 * c[k]! + 9 * p2[k]! - p3[k]!) / 16) as unknown as V3];
    });
    const rings = cs.map((c, i) => {
      const t = unit(sub(cs[Math.min(cs.length - 1, i + 1)]!, cs[Math.max(0, i - 1)]!));
      const n1 = unit(cross(t, [0, 0, 1])); // every limb here rises or runs east–west: never along Z
      const n2 = cross(t, n1);
      const r = (r0 + ((r1 - r0) * i) / (cs.length - 1)) * (1 + 0.14 * (hash(i * 3.3 + r0 * 50) - 0.5));
      return Array.from({ length: n }, (_, k): V3 => {
        const [co, si] = [r * Math.cos((k * 2 * Math.PI) / n), r * Math.sin((k * 2 * Math.PI) / n)];
        return [c[0] + co * n1[0] + si * n2[0], c[1] + co * n1[1] + si * n2[1], c[2] + co * n1[2] + si * n2[2]];
      });
    });
    for (let i = 0; i + 1 < rings.length; i++) for (let k = 0; k < n; k++) {
      const [lo, hi, k1] = [rings[i]!, rings[i + 1]!, (k + 1) % n];
      paint(hash(i * 7 + k * 13 + r0 * 90) < 0.3 ? '#524e42' : hash(i * 3 + k * 5) < 0.2 ? '#474d3a' : '#48433a'); // bark, a few paler flakes
      quadOut(st, lo[k]!, lo[k1]!, hi[k1]!, hi[k]!, sub(mix(lo[k]!, lo[k1]!, 0.5), cs[i]!));
    }
  };
  tube([[1.2, 0.9, 3.0], [1.35, 1.9, 2.9], [1.7, 3.0, 2.75], [2.0, 4.0, 2.6], [2.6, 5.1, 2.35], [3.4, 6.1, 2.0]], 0.62, 0.36, 9); // the trunk, flared at the foot
  tube([[3.4, 6.1, 2.0], [4.5, 6.9, 1.5], [5.2, 8.2, 0.5], [5.4, 9.8, -0.9]], 0.3, 0.1); // on up to the right, into the crown
  tube([[2.3, 4.6, 2.45], [2.0, 6.2, 2.4], [1.6, 7.8, 2.2], [0.9, 9.2, 1.9], [-0.1, 10.1, 1.5], [-1.4, 10.9, 0.8], [-2.8, 12.0, -0.2]], 0.27, 0.07); // the limb across the tower front
  tube([[3.2, 5.9, 2.05], [3.7, 7.4, 2.5], [4.3, 8.6, 1.6], [4.6, 10.0, 0.2]], 0.22, 0.07);
  tube([[1.6, 7.8, 2.2], [2.3, 8.9, 2.6], [2.2, 10.2, 2.2]], 0.1, 0.04, 5); // twigs off the limb
  tube([[4.5, 6.9, 1.5], [5.6, 7.3, 2.2], [6.4, 8.3, 2.0]], 0.13, 0.05, 5);
  s.prism([[P(f, 0.9, 0, 2.4), P(f, 2.3, 0, 2.4), P(f, 2.3, 0, 3.3), P(f, 0.9, 0, 3.3)].flatMap((p) => [p[0], p[2]])], g + 1, g + 4);
  const trees: number[] = [];
  // sunk so the whitewashed foot of the street-tree model stays inside the heap: behind right (the big crown over the tower), the thin tree front left, one behind left
  for (const [a, w, base, sc, yaw] of [[5.3, -2.6, -0.7, 0.95, 1.1], [-3.8, 2.0, 0.85, 0.5, 2.9], [-5.6, -3.0, -0.6, 0.85, 4.2]] as const) {
    const p = P(f, a, g + base, w);
    pushMatrix(trees, p[0], p[1], p[2], yaw, sc);
  }

  // ── Đài Nghiên: a plastered stone gate across the footway at the bridge head, the arch open, the ink slab on three frogs on top ──
  const fd = frameAt(DN[0], DN[1], DN_UA[0], DN_UA[1]);
  const gd = ctx.height(DN[0], DN[1]);
  const D = GATE;
  for (const sg of [-1, 1]) {
    const [a0, a1] = [Math.min(sg * D.open, sg * D.half), Math.max(sg * D.open, sg * D.half)];
    box(PLASTER, fd, a0, a1, -D.t, D.t, gd - 0.1, gd + D.wall, 50 + sg);
    solid(fd, a0, a1, -D.t - 0.2, D.t + 0.2, gd - 0.2, gd + D.top + 0.15);
    box(STONE, fd, a0 - 0.08, a1 + 0.08, -D.t - 0.1, D.t + 0.1, gd - 0.1, gd + 0.55, 52 + sg); // plinth
    const pa = sg * (D.open + 0.5); // the pilaster beside the arch, the couplet on both faces
    box(PLASTER, fd, pa - 0.42, pa + 0.42, -D.t - 0.16, D.t + 0.16, gd + 0.55, gd + D.wall, 54 + sg);
    const ea = sg * (D.half - 0.1); // the end pier, taller, with a bud finial
    box(PLASTER, fd, ea - 0.45, ea + 0.45, -D.t - 0.2, D.t + 0.2, gd - 0.1, gd + D.top + 0.35, 56 + sg);
    block(STONE, fd, ea, 0, 0.56, D.t + 0.31, 0.56, D.t + 0.31, gd + D.top + 0.35, gd + D.top + 0.5, 58 + sg, true);
    paint('#8f8d86');
    lathe(st, fd, ea, 0, [[0.2, gd + D.top + 0.5], [0.3, gd + D.top + 0.72], [0.22, gd + D.top + 0.95], [0, gd + D.top + 1.25]], 8);
  }
  for (const side of [1, -1]) { // both faces: the couplets, the name plaque (the turned frame's +w = that face)
    const fr = side > 0 ? fd : frameAt(fd.cx, fd.cz, -fd.ux, -fd.uz);
    for (const sg of [-1, 1]) decal(R.couplet[sg > 0 ? 0 : 1]!, fr, sg * (D.open + 0.5) - 0.275, sg * (D.open + 0.5) + 0.275, gd + 1.5, gd + 3.8, D.t + 0.165);
    paint('#8d8b84');
    fbox(st, fr, -1.16, 1.16, D.t - 0.02, D.t + 0.05, gd + 3.94, gd + 4.86);
    decal(R.name, fr, -1.1, 1.1, gd + 4.0, gd + 4.8, D.t + 0.055);
    // the arch: spandrels between the curve and the wall above, on this face
    const crown = D.spring + D.open;
    for (let k = 0; k < 8; k++) {
      const [t0, t1] = [Math.PI * (1 - k / 8), Math.PI * (1 - (k + 1) / 8)];
      const [a0, y0, a1, y1] = [D.open * Math.cos(t0), gd + D.spring + D.open * Math.sin(t0), D.open * Math.cos(t1), gd + D.spring + D.open * Math.sin(t1)];
      const tu = (a0 + D.open) / PLASTER.m;
      const tv = (yy: number) => (gd + crown - yy) / PLASTER.m + 0.2;
      if (mural) {
        const pts = [P(fr, a0, y0, D.t), P(fr, a1, y1, D.t), P(fr, a1, gd + crown, D.t), P(fr, a0, gd + crown, D.t)] as const;
        const uvs = [uv(PLASTER, tu, tv(y0)), uv(PLASTER, tu + (a1 - a0) / PLASTER.m, tv(y1)), uv(PLASTER, tu + (a1 - a0) / PLASTER.m, tv(gd + crown)), uv(PLASTER, tu, tv(gd + crown))];
        triOut(mural, pts[0], pts[1], pts[2], nrm(fr, 0, 1), [...uvs[0]!, ...uvs[1]!, ...uvs[2]!]);
        triOut(mural, pts[0], pts[2], pts[3], nrm(fr, 0, 1), [...uvs[0]!, ...uvs[2]!, ...uvs[3]!]);
      } else quadOut(paint(PLASTER.flat), P(fr, a0, y0, D.t), P(fr, a1, y1, D.t), P(fr, a1, gd + crown, D.t), P(fr, a0, gd + crown, D.t), nrm(fr, 0, 1));
      if (side > 0) tq(PLASTER, P(fd, a0, y0, D.t), P(fd, a1, y1, D.t), P(fd, a1, y1, -D.t), P(fd, a0, y0, -D.t), [-(a0 + a1) / 2 * fd.ux, -1, -(a0 + a1) / 2 * fd.uz], 0.1 + k * 0.1, 0.9, 0.2 + k * 0.1, 0.9 - (2 * D.t) / PLASTER.m); // intrados
    }
    face(PLASTER, P(fr, -D.open, gd + crown, D.t), P(fr, D.open, gd + crown, D.t), P(fr, D.open, gd + D.wall, D.t), P(fr, -D.open, gd + D.wall, D.t), nrm(fr, 0, 1), 0.12, 0.05);
  }
  box(STONE, fd, -D.half - 0.1, D.half + 0.1, -D.t - 0.12, D.t + 0.12, gd + D.wall, gd + D.wall + 0.22, 60, true); // cornice
  box(PLASTER, fd, -D.half, D.half, -D.t - 0.03, D.t + 0.03, gd + D.wall + 0.22, gd + D.top, 61); // the attic (the OSM slab is inside)
  box(STONE, fd, -D.half + 0.3, D.half - 0.3, -D.t - 0.14, D.t + 0.14, gd + D.top, gd + D.top + 0.14, 62, true);
  s.prism([[P(fd, -D.open, 0, -D.t - 0.2), P(fd, D.open, 0, -D.t - 0.2), P(fd, D.open, 0, D.t + 0.2), P(fd, -D.open, 0, D.t + 0.2)].flatMap((p) => [p[0], p[2]])], gd + D.spring + D.open - 0.1, gd + D.top + 0.15);
  const slabY = gd + D.top + 0.14;
  paint('#77756f');
  for (const [a, w] of [[-0.5, 0.25], [0.5, 0.25], [0, -0.3]] as const) { // the three frogs
    lathe(st, fd, a, w, [[0.16, slabY], [0.2, slabY + 0.12], [0.12, slabY + 0.24]], 6);
  }
  paint('#8a8882');
  const dish = (r: number, yy: number): V3[] => Array.from({ length: 14 }, (_, k) => P(fd, 1.25 * r * Math.cos((k * Math.PI) / 7), yy, 0.62 * r * Math.sin((k * Math.PI) / 7))); // an oval: the half-peach ink slab
  const rims = [dish(0.6, slabY + 0.2), dish(1.0, slabY + 0.36), dish(1.05, slabY + 0.62), dish(0.93, slabY + 0.67)];
  for (let k = 0; k + 1 < rims.length; k++) for (let i = 0; i < 14; i++) {
    const [lo, hi, j] = [rims[k]!, rims[k + 1]!, (i + 1) % 14];
    const m = mix(lo[i]!, lo[j]!, 0.5);
    quadOut(st, lo[i]!, lo[j]!, hi[j]!, hi[i]!, [m[0] - fd.cx, 0.3, m[2] - fd.cz]);
  }
  cap(st, rims[0]!, DOWN);
  paint('#3b3a38');
  cap(st, dish(0.93, slabY + 0.6), UP); // the ink well

  const out = s.out();
  return {
    ...out,
    instances: [{ kind: 'tree', matrices: new Float32Array(trees) }],
    ...(image ? { textures: [{ material: 'mural2' as const, image }] } : {}),
  };
};
