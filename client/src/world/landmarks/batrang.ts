// ── Authentic Bat Trang – Pottery shop & workshop (115 Hàng Gai, Hoàn Kiếm; the "GỐM" clue box of the Lựa chọn kép). OSM has
// no number 115: Hàng Gai is way/28102098 (−178, 3) → (−254, 57) → (−299, 88), odd numbers run on the SOUTH side towards the
// Hàng Bông end (Church Boutique Hotel 95 = the fixme building at (−258, 75), Golden Silk 109–111 = node (−285, 80), Google's
// pin for the shop 21.031354 N 105.849285 E = world (−295.7, 91.5), 5 m south of the axis, 13 m before the Hàng Hòm corner),
// and the south frontage between the 95 building (west corner (−276.6, 79)) and Phố Hàng Trống has NO footprints at all. So
// the shop is a PLACED detail (h4.ts `placed`, registry 'bat-trang'): its façade centre BT sits 6.4 m south of the axis at
// axis station 51 m (3 m east of Google's pin, so the front lies on the straight run before the 2° bend), and the gap on
// both sides is closed with ordinary generated tube houses (BuildingBuilder on synthetic plots: 3 lots east up to the 95
// building's side wall, 2 west up to the Hàng Trống sidewalk).
// After the owner's Street View photo: a 7.2 m shopfront open to the pavement over a black granite step; a 1.6 m dark
// vertical-slat fascia with the 3D golden slab-serif letters "AUTHENTIC BAT TRANG", "POTTERY SHOP & WORKSHOP", a potter-at-
// the-wheel logo + "MAKE YOUR OWN POTTERY", the phone at the left end, a pin + "115 Hang Gai - Ha Noi" at the right; black
// pilasters hung with a column of round painted plates; inside, floor-to-ceiling shelves of small white / yellow-glazed
// plates, bowls and cups on dark boards (the goods are the atlas, the boards are real), a central display table of cups, a
// stepped front display, vases on a pedestal, the brown board "AUTHENTIC BAT TRANG" on the back wall, warm downlights; a
// blue-white lightbox standee ("EXPLORE BAT TRANG TRADITIONAL CERAMICS VILLAGE / POTTERY CLASS / BAT TRANG PICTURES TOUR")
// left of the entrance, "POTTERY CLASS – BOOK NOW" + QR at the left edge, "BOOK CLASSES NOW" at the right; grey / black
// marble slabs on the pavement; three plain cream tube-house storeys above with balconies, an AC unit, a parapet roof, a
// water tank. Frame: a = along Hàng Gai, WSW (the viewer on the street has +a on his RIGHT), w = out to the street (kerb at
// w 3.15, axis 6.4). Everything painted is ONE 2048² OffscreenCanvas on 'mural' with `glow` / `dayGlow` (attach.ts: the
// atlas is its own emissive map, strong at dusk / night, faint by day like the backlit letters in the photo); without
// OffscreenCanvas the faces stay flat-coloured. Solid (Sink.prism): walls, pilasters, step, fixtures, standees; the
// pavement and the walkway into the shop stay clear; clue box BT_BOX (a 0.8, w 1.7). ≈ 6k tris + the neighbours
// (BuildingBuilder, their faces inside the shop / the 95 building clipped away).
import { buildBuildings } from '../BuildingBuilder.ts';
import type { BuildingRec, ChunkData, XZ } from '../../geo/chunkData.ts';
import type { BuildCtx, BuildOut } from '../buildTypes.ts';
import type { MeshBuffer as Buf, V3 } from '../geom.ts';
import { pushMatrix } from '../StreetProps.ts';
import { cap, DOWN, fbox, type Fr, P, rgb, ring, UP } from './b.ts';
import { hash, hcyl, lathe } from './d.ts';
import { frameAt } from './h3.ts';
import { quadOut } from './kit.ts';
import { Sink } from './parts.ts';

/** Middle of the shopfront on the street wall line (world x, z) = 21.031358 N, 105.849318 E. */
export const BT: [number, number] = [-292.27, 91.0];
export const BT_UA = [-0.8236, 0.5673] as const; // +a: along Hàng Gai towards Hàng Bông (WSW), the viewer's right
export const BT_UW = [-0.5673, -0.8236] as const; // +w: out to the street (NNW); the kerb at 3.15, the axis at 6.4
/** Clue box spot: the pavement in front of the entrance (a 0.8: right of the lightbox), 1.7 m out from the façade (1.45 m
 *  inside the kerb) = 21.031367 N, 105.849303 E; its front to the street (compass 325° = ?boxes yawDeg 35). */
export const BT_BOX: [number, number] = [BT[0] + 0.8 * BT_UA[0] + 1.7 * BT_UW[0], BT[1] + 0.8 * BT_UA[1] + 1.7 * BT_UW[1]];

// ── dimensions (m) ──
const HALF = 3.6; // shop half-width (pilaster outer faces)
const OPEN = 3.15; // half-width of the open front
const DEPTH = 11; // plot depth (w 0 … −11)
const BACK = -9.0; // the interior back wall
const STEP = 0.35; // shop floor over the ground (the pavement top is 0.20)
const CEIL = 3.35; // ground-floor ceiling = fascia bottom
const FASCIA = 1.6;
const FLOOR_H = 3.2;
const FLOORS = 3;
const ROOF = CEIL + FASCIA + FLOORS * FLOOR_H; // 14.55
const PAVE_Y = 0.215; // marble slabs: just over the generated sidewalk (lift 0.05 + curb 0.15)
const EAST_END = -19.7; // a of the 95 building's side wall; the west lots end at 11.6 (the Hàng Trống sidewalk)
const SHELF0 = 0.4, SHELF_PITCH = 0.26, SHELVES = 11; // shelf boards above the shop floor

const WOOD = '#3a2416';
const BLACK = '#17171b';
const CREAM = '#efe3c4';
const WHITE = '#f3efe4';
const IRON = '#2f4a3a';
const GLASS = '#2a2c30';
const TILE_FLOOR = '#8e6b5a';
const GOLD = '#f3c742';

// ── atlas: px regions with their metre size ──
interface Reg { x: number; y: number; w: number; h: number; mw: number; mh: number }
const [AW, AH] = [2048, 2048];
const reg = (x: number, y: number, mw: number, mh: number, px = 160): Reg => ({ x, y, w: Math.round(mw * px), h: Math.round(mh * px), mw, mh });
const R = {
  fascia: reg(0, 0, 2 * HALF, FASCIA), // 1152 × 256
  shelf: [reg(0, 270, 2.2, 3.0), reg(360, 270, 2.2, 3.0), reg(720, 270, 2.2, 3.0)], // 352 × 480 each
  back: reg(0, 760, 7.0, 3.0), // 1120 × 480
  ceil: reg(1160, 270, 2.4, 2.4), // one downlight
  pilaster: [reg(1560, 270, 0.45, 3.0), reg(1640, 270, 0.45, 3.0)],
  lightbox: reg(1160, 760, 0.6, 2.2, 320), // 192 × 704
  standL: reg(1360, 760, 0.6, 1.6, 320), // 192 × 512
  standR: reg(1560, 760, 0.6, 1.6, 320),
  table: reg(1360, 1290, 2.4, 1.2), // 384 × 192: cups from above
  goods: reg(0, 1250, 2.4, 2.4), // 384 × 384: bowls / plates / cups from above
};

type G = OffscreenCanvasRenderingContext2D;
const SLAB = '"Rockwell Extra Bold", Rockwell, "American Typewriter", "Roboto Slab", Georgia, serif';
const SANS = '"Avenir Next", "Helvetica Neue", Helvetica, Arial, sans-serif';
const GLAZE = ['#f3efe2', '#f3efe2', '#e9c44a', '#f6f1e6', '#e4d7b4'];
const MOTIF = ['#3a63a8', '#4e8a4a', '#c2452c', '#d99a2b', '#2f5f9e'];

/** Letter-spaced text (Chrome's ctx.letterSpacing; harmless elsewhere). */
function spaced(g: G, text: string, x: number, y: number, px: number, maxW?: number) {
  (g as unknown as { letterSpacing: string }).letterSpacing = `${px}px`;
  g.fillText(text, x + px / 2, y, maxW);
  (g as unknown as { letterSpacing: string }).letterSpacing = '0px';
}

/** A small painted plate seen face-on: glaze disc, coloured rim ring, a motif (petals / fish / dots) in the middle. */
function plate(g: G, x: number, y: number, r: number, k: number) {
  g.fillStyle = GLAZE[Math.floor(hash(k) * GLAZE.length)]!;
  g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  const m = MOTIF[Math.floor(hash(k + 7) * MOTIF.length)]!;
  g.strokeStyle = m; g.lineWidth = Math.max(1, r * 0.12);
  g.beginPath(); g.arc(x, y, r * 0.82, 0, Math.PI * 2); g.stroke();
  g.fillStyle = m;
  const kind = Math.floor(hash(k + 3) * 3);
  if (kind === 0) for (let i = 0; i < 6; i++) { const t = (i / 6) * Math.PI * 2; g.beginPath(); g.ellipse(x + Math.cos(t) * r * 0.36, y + Math.sin(t) * r * 0.36, r * 0.22, r * 0.12, t, 0, Math.PI * 2); g.fill(); }
  else if (kind === 1) { g.beginPath(); g.ellipse(x, y, r * 0.42, r * 0.2, 0.6, 0, Math.PI * 2); g.fill(); g.beginPath(); g.moveTo(x + r * 0.3, y + r * 0.25); g.lineTo(x + r * 0.55, y + r * 0.45); g.lineTo(x + r * 0.5, y + r * 0.1); g.closePath(); g.fill(); }
  else for (let i = 0; i < 8; i++) { const t = (i / 8) * Math.PI * 2; g.beginPath(); g.arc(x + Math.cos(t) * r * 0.5, y + Math.sin(t) * r * 0.5, r * 0.1, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = 'rgba(255,255,255,0.35)';
  g.beginPath(); g.arc(x - r * 0.3, y - r * 0.3, r * 0.18, 0, Math.PI * 2); g.fill(); // highlight
}

/** A cup seen from the side: glaze body, a handle, a motif band. */
function cup(g: G, x: number, y: number, w: number, h: number, k: number) {
  g.fillStyle = GLAZE[Math.floor(hash(k) * GLAZE.length)]!;
  g.beginPath(); g.roundRect(x - w / 2, y - h, w, h, [2, 2, w * 0.25, w * 0.25]); g.fill();
  g.strokeStyle = g.fillStyle; g.lineWidth = Math.max(1, w * 0.12);
  g.beginPath(); g.arc(x + w / 2 + w * 0.15, y - h * 0.55, w * 0.2, -Math.PI / 2, Math.PI / 2); g.stroke();
  g.fillStyle = MOTIF[Math.floor(hash(k + 5) * MOTIF.length)]!;
  g.fillRect(x - w / 2 + 1, y - h * 0.6, w - 2, h * 0.14);
}

/** Shelves of goods filling a region: dark wood, a warm light gradient, boards at the real shelf heights (metres above the
 *  shop floor, the region bottom), between them rows of plates / cups / bowls. */
function shelves(g: G, r: Reg, seed: number, skip?: (mx: number, my: number) => boolean) {
  const p = r.w / r.mw;
  g.fillStyle = '#4a3020';
  g.fillRect(r.x, r.y, r.w, r.h);
  const gr = g.createLinearGradient(0, r.y, 0, r.y + r.h);
  gr.addColorStop(0, 'rgba(255,214,150,0.35)');
  gr.addColorStop(1, 'rgba(0,0,0,0.25)');
  g.fillStyle = gr;
  g.fillRect(r.x, r.y, r.w, r.h);
  let k = seed * 311;
  for (let i = 0; i < SHELVES; i++) {
    const yb = r.mh - (SHELF0 + i * SHELF_PITCH); // metres from the region top to this board
    const yPx = r.y + yb * p;
    g.fillStyle = '#2a1a10';
    g.fillRect(r.x, yPx, r.w, 0.03 * p);
    g.fillStyle = 'rgba(0,0,0,0.3)';
    g.fillRect(r.x, yPx + 0.03 * p, r.w, 0.05 * p); // shadow under the board
    const row = Math.floor(hash(k++) * 3); // plates standing / cups / bowls
    const n = Math.round(r.mw / (row === 0 ? 0.2 : row === 1 ? 0.16 : 0.24));
    for (let j = 0; j < n; j++) {
      const mx = ((j + 0.5) / n) * r.mw;
      const my = SHELF0 + i * SHELF_PITCH; // the board this row stands on
      if (skip?.(mx, my)) continue;
      const x = r.x + mx * p;
      if (row === 0) plate(g, x, yPx - 0.1 * p, 0.085 * p, k++);
      else if (row === 1) cup(g, x, yPx - 0.005 * p, 0.09 * p, 0.1 * p, k++);
      else { // bowl: a half ellipse
        g.fillStyle = GLAZE[Math.floor(hash(k++) * GLAZE.length)]!;
        g.beginPath(); g.ellipse(x, yPx - 0.005 * p, 0.1 * p, 0.075 * p, 0, Math.PI, 0); g.fill();
        g.fillStyle = MOTIF[Math.floor(hash(k++) * MOTIF.length)]!;
        g.fillRect(x - 0.1 * p, yPx - 0.075 * p, 0.2 * p, 0.012 * p);
      }
    }
  }
}

/** Goods seen from above over a region: dark cloth, rows of cups (small) or bowls / plates (bigger). */
function goodsTop(g: G, r: Reg, seed: number, big: boolean) {
  const p = r.w / r.mw;
  g.fillStyle = '#2a2420';
  g.fillRect(r.x, r.y, r.w, r.h);
  const d = big ? 0.2 : 0.11;
  let k = seed * 97;
  for (let my = d / 2 + 0.03; my < r.mh - d / 2; my += d * 1.1) {
    for (let mx = d / 2 + 0.03; mx < r.mw - d / 2; mx += d * 1.1) {
      const [x, y] = [r.x + (mx + (hash(k) - 0.5) * 0.02) * p, r.y + (my + (hash(k + 1) - 0.5) * 0.02) * p];
      plate(g, x, y, (d / 2) * p * (0.85 + hash(k + 2) * 0.15), k);
      if (!big) { g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.arc(x, y, d * p * 0.22, 0, Math.PI * 2); g.fill(); } // the cup's dark mouth
      k += 3;
    }
  }
}

function fascia(g: G) {
  const r = R.fascia;
  const p = r.w / r.mw; // 160
  // vertical dark-brown slats
  g.fillStyle = WOOD;
  g.fillRect(r.x, r.y, r.w, r.h);
  for (let x = 0; x < r.w; x += 10) {
    g.fillStyle = (x / 10) % 2 ? 'rgba(255,220,170,0.06)' : 'rgba(0,0,0,0.18)';
    g.fillRect(r.x + x, r.y, 5, r.h);
    if ((x / 10) % 3 === 0) { g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(r.x + x + 8, r.y, 2, r.h); }
  }
  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';
  // "AUTHENTIC BAT TRANG": slab serif, 0.56 m caps, a glowing halo, a dark amber extrusion down-left, a yellow face, a thin outline
  const cx = r.x + r.w / 2;
  const y1 = r.y + 0.68 * p;
  g.font = `900 ${Math.round(0.56 * p)}px ${SLAB}`;
  const maxW = r.w - 0.5 * p;
  g.save();
  g.shadowColor = 'rgba(255,200,90,0.9)'; g.shadowBlur = 34;
  g.fillStyle = '#f5c842';
  g.fillText('AUTHENTIC BAT TRANG', cx, y1, maxW);
  g.restore();
  for (let k = 6; k >= 1; k--) { g.fillStyle = k > 3 ? '#5a3608' : '#8a5a12'; g.fillText('AUTHENTIC BAT TRANG', cx - k * 1.3, y1 + k * 1.7, maxW); }
  const face = g.createLinearGradient(0, y1 - 0.56 * p, 0, y1);
  face.addColorStop(0, '#ffe98a'); face.addColorStop(0.55, '#f7c93c'); face.addColorStop(1, '#e8a82a');
  g.fillStyle = face;
  g.fillText('AUTHENTIC BAT TRANG', cx, y1, maxW);
  g.strokeStyle = '#4a2c06'; g.lineWidth = 1.5;
  g.strokeText('AUTHENTIC BAT TRANG', cx, y1, maxW);
  // line 2 + 3: wide gold sans
  g.fillStyle = GOLD;
  g.font = `800 ${Math.round(0.25 * p)}px ${SANS}`;
  spaced(g, 'POTTERY SHOP & WORKSHOP', cx, r.y + 1.02 * p, 7, 4.2 * p);
  g.font = `800 ${Math.round(0.21 * p)}px ${SANS}`;
  spaced(g, 'MAKE YOUR OWN POTTERY', cx + 0.25 * p, r.y + 1.38 * p, 7, 3.6 * p);
  // the potter-at-the-wheel logo (gold line art) left of line 3
  const [lx, ly] = [cx - 1.75 * p, r.y + 1.24 * p];
  g.strokeStyle = g.fillStyle = GOLD; g.lineWidth = 3; g.lineCap = 'round';
  g.beginPath(); g.ellipse(lx, ly + 0.12 * p, 0.17 * p, 0.045 * p, 0, 0, Math.PI * 2); g.stroke(); // wheel
  g.beginPath(); g.moveTo(lx - 0.07 * p, ly + 0.1 * p); g.lineTo(lx - 0.09 * p, ly + 0.02 * p); g.lineTo(lx + 0.09 * p, ly + 0.02 * p); g.lineTo(lx + 0.07 * p, ly + 0.1 * p); g.closePath(); g.fill(); // the pot
  g.beginPath(); g.arc(lx - 0.16 * p, ly - 0.1 * p, 0.045 * p, 0, Math.PI * 2); g.fill(); // head
  g.beginPath(); g.moveTo(lx - 0.16 * p, ly - 0.05 * p); g.quadraticCurveTo(lx - 0.2 * p, ly + 0.06 * p, lx - 0.1 * p, ly + 0.03 * p); g.stroke(); // body / arm
  // phone at the left end, pin + address at the right end
  g.textAlign = 'left';
  g.font = `700 ${Math.round(0.14 * p)}px ${SANS}`;
  g.beginPath(); g.arc(r.x + 0.18 * p, r.y + 1.33 * p, 0.065 * p, 0, Math.PI * 2); g.fill();
  g.fillStyle = WOOD; g.lineWidth = 4; g.strokeStyle = WOOD;
  g.beginPath(); g.moveTo(r.x + 0.15 * p, r.y + 1.3 * p); g.lineTo(r.x + 0.21 * p, r.y + 1.36 * p); g.stroke(); // handset stroke
  g.fillStyle = GOLD;
  g.fillText('+84 964 800 919', r.x + 0.28 * p, r.y + 1.38 * p, 1.3 * p);
  g.textAlign = 'right';
  g.font = `700 ${Math.round(0.15 * p)}px ${SANS}`;
  g.fillText('115 Hang Gai - Ha Noi', r.x + r.w - 0.16 * p, r.y + 1.21 * p, 1.75 * p);
  const [px, py] = [r.x + r.w - 2.08 * p, r.y + 1.13 * p];
  g.beginPath(); g.arc(px, py, 0.06 * p, Math.PI, 0); g.lineTo(px, py + 0.11 * p); g.closePath(); g.fill(); // pin
  g.fillStyle = WOOD; g.beginPath(); g.arc(px, py, 0.025 * p, 0, Math.PI * 2); g.fill();
}

function backWall(g: G) {
  const r = R.back;
  const p = r.w / r.mw;
  shelves(g, r, 5, (mx, my) => Math.abs(mx - r.mw / 2) < 1.45 && my > 1.75 && my < 2.5);
  // the brown board "AUTHENTIC BAT TRANG" with cream slab letters, 2.6 × 0.5 m, 2.0 … 2.5 m up
  const [bx, by, bw, bh] = [r.x + (r.mw / 2 - 1.3) * p, r.y + (r.mh - 2.5) * p, 2.6 * p, 0.5 * p];
  g.fillStyle = '#5a3a22'; g.fillRect(bx, by, bw, bh);
  g.strokeStyle = '#2a1a10'; g.lineWidth = 3; g.strokeRect(bx + 2, by + 2, bw - 4, bh - 4);
  g.fillStyle = '#efe2c2'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `900 ${Math.round(0.26 * p)}px ${SLAB}`;
  g.fillText('AUTHENTIC BAT TRANG', bx + bw / 2, by + bh / 2 + 2, bw - 20);
  // the dark doorway to the workshop at the right end of the back wall
  g.fillStyle = '#1e1612';
  g.fillRect(r.x + (r.mw - 1.0) * p, r.y + (r.mh - 2.2) * p, 0.9 * p, 2.2 * p);
}

function ceilTile(g: G) {
  const r = R.ceil;
  const p = r.w / r.mw;
  g.fillStyle = '#e9e4d8'; g.fillRect(r.x, r.y, r.w, r.h);
  const [cx, cy] = [r.x + r.w / 2, r.y + r.h / 2];
  const halo = g.createRadialGradient(cx, cy, 0, cx, cy, 0.9 * p);
  halo.addColorStop(0, 'rgba(255,225,160,0.95)'); halo.addColorStop(0.25, 'rgba(255,220,150,0.45)'); halo.addColorStop(1, 'rgba(255,220,150,0)');
  g.fillStyle = halo; g.fillRect(r.x, r.y, r.w, r.h);
  g.fillStyle = '#3a3a3a'; g.beginPath(); g.arc(cx, cy, 0.11 * p, 0, Math.PI * 2); g.fill(); // the fitting
  g.fillStyle = '#fff6dc'; g.beginPath(); g.arc(cx, cy, 0.085 * p, 0, Math.PI * 2); g.fill();
}

function pilasters(g: G) {
  R.pilaster.forEach((r, v) => {
    const p = r.w / r.mw;
    g.fillStyle = BLACK; g.fillRect(r.x, r.y, r.w, r.h);
    for (let i = 0; i < 7; i++) plate(g, r.x + r.w / 2, r.y + r.h - (0.45 + i * 0.4) * p, 0.17 * p, 40 + v * 13 + i * 3);
  });
}

/** Stand-in photo: a sky / ground gradient with a few figure blobs and a wheel, inside a frame. */
function photo(g: G, x: number, y: number, w: number, h: number, k: number) {
  const gr = g.createLinearGradient(0, y, 0, y + h);
  gr.addColorStop(0, ['#cfd9c8', '#e8d4b8', '#b9cbe0'][k % 3]!); gr.addColorStop(1, ['#7b6650', '#8d7558', '#6a5e52'][k % 3]!);
  g.fillStyle = gr; g.fillRect(x, y, w, h);
  g.fillStyle = '#e3c48a'; // clay pots / wheels
  for (let i = 0; i < 3; i++) { g.beginPath(); g.ellipse(x + w * (0.2 + 0.3 * i), y + h * 0.78, w * 0.1, h * 0.06, 0, 0, Math.PI * 2); g.fill(); }
  for (let i = 0; i < 2; i++) { // two figures
    const fx = x + w * (0.3 + 0.4 * i);
    g.fillStyle = ['#2a4d8a', '#c43a3a'][i]!; g.fillRect(fx - w * 0.08, y + h * 0.4, w * 0.16, h * 0.32);
    g.fillStyle = '#e9c9a8'; g.beginPath(); g.arc(fx, y + h * 0.33, w * 0.07, 0, Math.PI * 2); g.fill();
  }
  g.strokeStyle = '#ffffff'; g.lineWidth = 3; g.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);
}

function qr(g: G, x: number, y: number, s: number, seed: number) {
  g.fillStyle = '#ffffff'; g.fillRect(x, y, s, s);
  const n = 21, c = s / n;
  g.fillStyle = '#111111';
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const finder = (i < 7 && j < 7) || (i > 13 && j < 7) || (i < 7 && j > 13);
    if (finder) { const [a, b] = [i < 7 ? i : i - 14, j < 7 ? j : j - 14]; if (a === 0 || a === 6 || b === 0 || b === 6 || (a >= 2 && a <= 4 && b >= 2 && b <= 4)) g.fillRect(x + i * c, y + j * c, c, c); }
    else if (hash(seed + i * 31 + j * 7) < 0.45) g.fillRect(x + i * c, y + j * c, c, c);
  }
}

function standees(g: G) {
  g.textAlign = 'center'; g.textBaseline = 'alphabetic';
  // the lightbox: white, blue bands, three photos with captions
  let r = R.lightbox;
  let p = r.w / r.mw; // 320
  g.fillStyle = '#f4f8fc'; g.fillRect(r.x, r.y, r.w, r.h);
  g.fillStyle = '#1f5aa6'; g.fillRect(r.x, r.y, r.w, 0.1 * p);
  g.fillStyle = '#1f5aa6';
  g.font = `800 ${Math.round(0.065 * p)}px ${SANS}`;
  g.fillText('EXPLORE', r.x + r.w / 2, r.y + 0.2 * p);
  g.font = `900 ${Math.round(0.09 * p)}px ${SLAB}`;
  g.fillText('BAT TRANG', r.x + r.w / 2, r.y + 0.32 * p, r.w - 10);
  g.font = `700 ${Math.round(0.055 * p)}px ${SANS}`;
  g.fillText('TRADITIONAL', r.x + r.w / 2, r.y + 0.41 * p);
  g.fillText('CERAMICS VILLAGE', r.x + r.w / 2, r.y + 0.49 * p, r.w - 10);
  const caps = ['BAT TRANG FACTORIES TOUR', 'POTTERY CLASS', 'POTTERY HANDPAINTING CLASS'];
  for (let i = 0; i < 3; i++) {
    const y = r.y + (0.56 + i * 0.5) * p;
    photo(g, r.x + 0.04 * p, y, r.w - 0.08 * p, 0.34 * p, i);
    g.fillStyle = '#1f5aa6'; g.font = `800 ${Math.round(0.042 * p)}px ${SANS}`;
    g.fillText(caps[i]!, r.x + r.w / 2, y + 0.42 * p, r.w - 8);
  }
  g.fillStyle = '#1f5aa6'; g.fillRect(r.x, r.y + r.h - 0.14 * p, r.w, 0.14 * p);
  g.fillStyle = '#ffffff'; g.font = `800 ${Math.round(0.045 * p)}px ${SANS}`;
  g.fillText('BAT TRANG PICTURES TOUR', r.x + r.w / 2, r.y + r.h - 0.055 * p, r.w - 8);
  // left standee: POTTERY CLASS / BOOK NOW / QR
  r = R.standL; p = r.w / r.mw;
  g.fillStyle = '#e6e3dc'; g.fillRect(r.x, r.y, r.w, r.h); // printed boards (not lit like the lightbox): greyer, so they glow less at dusk
  g.strokeStyle = '#1f3f7a'; g.lineWidth = 4; g.strokeRect(r.x + 3, r.y + 3, r.w - 6, r.h - 6);
  g.fillStyle = '#1f3f7a';
  g.beginPath(); g.ellipse(r.x + r.w / 2, r.y + 0.2 * p, 0.14 * p, 0.05 * p, 0, 0, Math.PI * 2); g.stroke(); // wheel line art
  g.beginPath(); g.moveTo(r.x + r.w / 2 - 0.06 * p, r.y + 0.18 * p); g.lineTo(r.x + r.w / 2 - 0.08 * p, r.y + 0.1 * p); g.lineTo(r.x + r.w / 2 + 0.08 * p, r.y + 0.1 * p); g.lineTo(r.x + r.w / 2 + 0.06 * p, r.y + 0.18 * p); g.closePath(); g.fill();
  g.font = `900 ${Math.round(0.11 * p)}px ${SLAB}`;
  g.fillText('POTTERY', r.x + r.w / 2, r.y + 0.42 * p, r.w - 12);
  g.fillText('CLASS', r.x + r.w / 2, r.y + 0.55 * p, r.w - 12);
  g.fillStyle = '#d6322c'; g.beginPath(); g.roundRect(r.x + 0.12 * p, r.y + 0.66 * p, r.w - 0.24 * p, 0.12 * p, 8); g.fill();
  g.fillStyle = '#ffffff'; g.font = `800 ${Math.round(0.06 * p)}px ${SANS}`;
  g.fillText('BOOK NOW', r.x + r.w / 2, r.y + 0.745 * p);
  qr(g, r.x + 0.13 * p, r.y + 0.88 * p, 0.34 * p, 11);
  g.fillStyle = '#1f3f7a'; g.font = `700 ${Math.round(0.035 * p)}px ${SANS}`;
  g.fillText('SCAN TO BOOK', r.x + r.w / 2, r.y + 1.3 * p);
  g.fillText('115 HANG GAI', r.x + r.w / 2, r.y + 1.36 * p);
  g.fillText('AUTHENTIC BAT TRANG', r.x + r.w / 2, r.y + 1.42 * p);
  // right standee: BOOK CLASSES NOW
  r = R.standR; p = r.w / r.mw;
  g.fillStyle = '#e4dfd3'; g.fillRect(r.x, r.y, r.w, r.h);
  g.strokeStyle = '#2a3a5a'; g.lineWidth = 4; g.strokeRect(r.x + 3, r.y + 3, r.w - 6, r.h - 6);
  g.fillStyle = '#2a3a5a'; g.font = `600 italic ${Math.round(0.03 * p)}px ${SANS}`;
  g.fillText('Authentic Bat Trang', r.x + r.w / 2, r.y + 0.1 * p);
  g.font = `900 ${Math.round(0.062 * p)}px ${SLAB}`;
  g.fillText('BOOK CLASSES NOW', r.x + r.w / 2, r.y + 0.2 * p, r.w - 12);
  g.font = `700 ${Math.round(0.034 * p)}px ${SANS}`;
  g.fillText('GET CREATIVE · TAKE BEAUTIFUL', r.x + r.w / 2, r.y + 0.3 * p, r.w - 10);
  g.fillText('POTTERY HOME WITH YOU', r.x + r.w / 2, r.y + 0.35 * p, r.w - 10);
  g.fillStyle = '#d9b24a'; g.beginPath(); g.arc(r.x + r.w / 2, r.y + 0.5 * p, 0.08 * p, 0, Math.PI * 2); g.fill(); // gold badge
  g.fillStyle = '#ffffff'; g.beginPath(); g.arc(r.x + r.w / 2, r.y + 0.5 * p, 0.055 * p, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#d9b24a'; g.font = `800 ${Math.round(0.03 * p)}px ${SANS}`; g.fillText('TOP', r.x + r.w / 2, r.y + 0.51 * p);
  photo(g, r.x + 0.05 * p, r.y + 0.64 * p, r.w - 0.1 * p, 0.4 * p, 1);
  photo(g, r.x + 0.05 * p, r.y + 1.08 * p, r.w - 0.1 * p, 0.4 * p, 2);
  g.fillStyle = '#2a3a5a'; g.font = `700 ${Math.round(0.03 * p)}px ${SANS}`;
  g.fillText('POTTERY · PAINTING · TOURS', r.x + r.w / 2, r.y + 1.55 * p, r.w - 10);
}

function paintAtlas(): ImageBitmap | undefined {
  if (typeof OffscreenCanvas === 'undefined') return;
  const c = new OffscreenCanvas(AW, AH);
  const g = c.getContext('2d');
  if (!g) return;
  g.fillStyle = '#4a3020';
  g.fillRect(0, 0, AW, AH);
  fascia(g);
  R.shelf.forEach((r, i) => shelves(g, r, i + 1));
  backWall(g);
  ceilTile(g);
  pilasters(g);
  standees(g);
  goodsTop(g, R.table, 3, false);
  goodsTop(g, R.goods, 4, true);
  return c.transferToImageBitmap();
}

/** Local (a, w) of a world point. */
const loc = (f: Fr, x: number, z: number): [number, number] => [(x - f.cx) * f.ux + (z - f.cz) * f.uz, -(x - f.cx) * f.uz + (z - f.cz) * f.ux];

/** Drops every triangle of `out` whose centroid lies inside one of the frame boxes [a0, a1, w0, w1] (the neighbours' faces,
 *  balconies and signs that would show inside the shop or inside the 95 building). */
function clip(out: BuildOut, f: Fr, boxes: [number, number, number, number][]) {
  for (const b of out.meshes) {
    const keep: number[] = [];
    for (let i = 0; i + 2 < b.index.length; i += 3) {
      let [cx, cz] = [0, 0];
      for (let k = 0; k < 3; k++) { const v = b.index[i + k]! * 3; cx += b.position[v]! / 3; cz += b.position[v + 2]! / 3; }
      const [a, w] = loc(f, cx, cz);
      if (!boxes.some(([a0, a1, w0, w1]) => a > a0 && a < a1 && w > w0 && w < w1)) keep.push(b.index[i]!, b.index[i + 1]!, b.index[i + 2]!);
    }
    b.index = new Uint32Array(keep);
  }
}

export const batTrang = (chunk: ChunkData, ctx: BuildCtx): BuildOut => {
  const f = frameAt(BT[0], BT[1], BT_UA[0], BT_UA[1]);
  const g = ctx.height(BT[0], BT[1]);
  const s = new Sink();
  const nrm = (na: number, nw: number): V3 => [na * f.ux - nw * f.uz, 0, na * f.uz + nw * f.ux];
  const OUT = nrm(0, 1); // to the street
  const RIGHT = nrm(1, 0); // +a
  const LEFT = nrm(-1, 0);
  const st = s.buf('masonry');
  const nr = s.buf('masonry', 'near');
  const paint = (hex: string, buf: Buf = st) => { buf.color = rgb(hex); return buf; };
  const image = paintAtlas();
  const mural = image ? s.buf('mural') : undefined;
  const solid = (a0: number, a1: number, w0: number, w1: number, y0: number, y1: number) =>
    s.prism([[P(f, a0, 0, w0), P(f, a1, 0, w0), P(f, a1, 0, w1), P(f, a0, 0, w1)].flatMap((p) => [p[0], p[2]])], y0, y1);
  /** Textured quad: p00 = the viewer's bottom-left, p10 bottom-right, p11 top-right, p01 top-left; `sub` = [u0, v0, u1, v1] of the region (0..1, v down). */
  const tq = (p00: V3, p10: V3, p11: V3, p01: V3, out: V3, r: Reg, fallback: string, sub: [number, number, number, number] = [0, 0, 1, 1]) => {
    if (!mural) return quadOut(paint(fallback), p00, p10, p11, p01, out);
    const [u0, v0, u1, v1] = [(r.x + sub[0] * r.w) / AW, (r.y + sub[3] * r.h) / AH, (r.x + sub[2] * r.w) / AW, (r.y + sub[1] * r.h) / AH];
    quadOut(mural, p00, p10, p11, p01, out, u0, v0, u1, v1);
  };
  /** Textured upright quad on plane w facing +w (the street / the viewer inside looking at the back wall): a0 = the viewer's left. */
  const pic = (a0: number, a1: number, y0: number, y1: number, w: number, r: Reg, fallback: string, sub?: [number, number, number, number]) =>
    tq(P(f, a0, y0, w), P(f, a1, y0, w), P(f, a1, y1, w), P(f, a0, y1, w), OUT, r, fallback, sub);
  const FL = g + STEP;
  const CL = g + CEIL;
  const FB1 = CL + FASCIA;

  // ── pavement: grey / black marble slabs over the generated sidewalk, from the 95 building to the Hàng Trống corner ──
  const slabTones = ['#6e7073', '#7a7c7f', '#626467', '#85878a', '#717376', '#5a5c5f', '#7e8083', '#4a4c4f', '#8d8f91'];
  const pave = s.buf('masonry');
  let k = 0;
  for (let a = EAST_END; a < 11.6; a += 0.78) {
    for (let w = 0; w < 3.05; w += 0.775, k++) {
      const [a1, w1] = [Math.min(a + 0.76, 11.6), Math.min(w + 0.755, 3.1)];
      paint(slabTones[Math.floor(hash(k * 1.7) * slabTones.length)]!, pave);
      quadOut(pave, P(f, a, g + PAVE_Y, w), P(f, a1, g + PAVE_Y, w), P(f, a1, g + PAVE_Y, w1), P(f, a, g + PAVE_Y, w1), UP);
    }
  }

  // ── the black granite step and the shop floor ──
  paint(BLACK);
  fbox(st, f, -HALF, HALF, -0.05, 0.35, g, FL);
  solid(-HALF, HALF, -0.05, 0.35, g, FL);
  paint(TILE_FLOOR);
  quadOut(st, P(f, -OPEN, FL + 0.005, BACK), P(f, OPEN, FL + 0.005, BACK), P(f, OPEN, FL + 0.005, -0.05), P(f, -OPEN, FL + 0.005, -0.05), UP);
  paint('#5a4a40');
  for (let w = -0.5; w > BACK; w -= 0.5) fbox(st, f, -OPEN, OPEN, w - 0.01, w + 0.01, FL + 0.004, FL + 0.008); // tile joints

  // ── the ground-floor shell: side walls (interior face ±OPEN, outer ±HALF), back wall, the solid stock room behind, the ceiling ──
  paint(CREAM);
  for (const sg of [-1, 1]) fbox(st, f, Math.min(sg * OPEN, sg * HALF), Math.max(sg * OPEN, sg * HALF), -DEPTH, -0.2, g, CL); // side walls (the pilasters cover the fronts)
  fbox(st, f, -HALF, HALF, -DEPTH, BACK, g, CL); // back of house
  for (const sg of [-1, 1]) solid(Math.min(sg * OPEN, sg * HALF), Math.max(sg * OPEN, sg * HALF), -DEPTH, 0, g, CL);
  solid(-HALF, HALF, -DEPTH, BACK, g, CL);
  // interior faces: shelves of goods (the atlas) with real dark boards in front
  const shelfW = 2.2;
  for (const sg of [-1, 1]) {
    const a = sg * (OPEN - 0.01);
    const out = sg < 0 ? RIGHT : LEFT; // the left wall faces +a (into the shop)
    for (let w0 = -0.3, i = 0; w0 > BACK + 0.01; w0 -= shelfW, i++) {
      const w1 = Math.max(w0 - shelfW, BACK);
      const r = R.shelf[(i + (sg > 0 ? 1 : 0)) % 3]!;
      const share = (w0 - w1) / shelfW;
      // seen from inside: the left wall's viewer-left end is the front (w0); the right wall's is the back (w1)
      if (sg < 0) tq(P(f, a, FL, w0), P(f, a, FL, w1), P(f, a, CL, w1), P(f, a, CL, w0), out, r, '#4a3020', [0, 0, share, 1]);
      else tq(P(f, a, FL, w1), P(f, a, FL, w0), P(f, a, CL, w0), P(f, a, CL, w1), out, r, '#4a3020', [0, 0, share, 1]);
    }
    paint('#2a1a10', nr);
    for (let i = 0; i < SHELVES; i++) {
      const y = FL + SHELF0 + i * SHELF_PITCH - 0.03;
      fbox(nr, f, Math.min(a, a - sg * 0.25), Math.max(a, a - sg * 0.25), BACK, -0.3, y, y + 0.03);
    }
    paint('#2a1a10', st);
    fbox(st, f, Math.min(a, a - sg * 0.26), Math.max(a, a - sg * 0.26), -0.32, -0.28, FL, CL); // the shelf unit's front upright
  }
  pic(-OPEN, OPEN, FL, CL, BACK + 0.01, R.back, '#4a3020', [(3.5 - OPEN) / 7, 0, (3.5 + OPEN) / 7, 1]);
  paint('#2a1a10', nr);
  for (let i = 0; i < SHELVES; i++) { // back wall boards (not under the sign board / doorway)
    const y = FL + SHELF0 + i * SHELF_PITCH - 0.03;
    if (y - FL > 1.7 && y - FL < 2.6) { fbox(nr, f, -OPEN, -1.5, BACK, BACK + 0.25, y, y + 0.03); fbox(nr, f, 1.5, OPEN - 1.0, BACK, BACK + 0.25, y, y + 0.03); }
    else fbox(nr, f, -OPEN, OPEN - 1.0, BACK, BACK + 0.25, y, y + 0.03);
  }
  // the ceiling: 2.4 m tiles each with a downlight (3 across × 4 deep)
  for (let i = 0; i < 3; i++) for (let j = 0; j < 4; j++) {
    const [a0, a1] = [-OPEN + (i * 2 * OPEN) / 3, -OPEN + ((i + 1) * 2 * OPEN) / 3];
    const [w0, w1] = [-0.2 + (j * (BACK + 0.2)) / 4, -0.2 + ((j + 1) * (BACK + 0.2)) / 4];
    tq(P(f, a0, CL - 0.01, w0), P(f, a1, CL - 0.01, w0), P(f, a1, CL - 0.01, w1), P(f, a0, CL - 0.01, w1), DOWN, R.ceil, '#e9e4d8');
  }

  // ── the front: pilasters with the plate columns, the fascia band, the lit soffit ──
  for (const sg of [-1, 1]) {
    const [a0, a1] = [Math.min(sg * OPEN, sg * HALF), Math.max(sg * OPEN, sg * HALF)];
    paint(BLACK);
    fbox(st, f, a0, a1, -0.3, 0.1, g, CL);
    pic(a0 + 0.02, a1 - 0.02, FL, CL, 0.105, R.pilaster[sg < 0 ? 0 : 1]!, BLACK);
  }
  paint(WOOD);
  fbox(st, f, -HALF, HALF, -0.3, 0.3, CL, FB1); // the band, 0.3 m proud
  pic(-HALF, HALF, CL + 0.02, FB1 - 0.02, 0.305, R.fascia, WOOD);
  paint('#f6e6c8', nr);
  quadOut(nr, P(f, -OPEN, CL - 0.005, -0.2), P(f, OPEN, CL - 0.005, -0.2), P(f, OPEN, CL - 0.005, 0.3), P(f, -OPEN, CL - 0.005, 0.3), DOWN); // the soffit over the opening
  const glow = s.buf('neon');
  paint('#fff1cf', glow);
  for (const a of [-2.2, -0.75, 0.75, 2.2]) cap(glow, ring(f, a, 0.05, 0.07, CL - 0.012, 8), DOWN); // soffit downlights

  // ── the upper storeys: cream tube house, string courses, balconies with iron railings, french doors, AC, roof ──
  paint(CREAM);
  fbox(st, f, -HALF, HALF, -DEPTH, 0, FB1, g + ROOF);
  solid(-HALF, HALF, -DEPTH, 0, CL, g + ROOF + 0.6);
  for (let n = 0; n < FLOORS; n++) {
    const y0 = FB1 + n * FLOOR_H;
    paint(WHITE);
    fbox(st, f, -HALF - 0.05, HALF + 0.05, -0.02, 0.08, y0 - 0.02, y0 + 0.14); // string course / balcony slab edge
    fbox(st, f, -2.6, 2.6, 0, 0.95, y0, y0 + 0.14); // balcony slab
    paint(IRON, nr);
    for (let a = -2.55; a <= 2.56; a += 0.51) fbox(nr, f, a - 0.02, a + 0.02, 0.9, 0.94, y0 + 0.14, y0 + 1.1); // posts
    for (const sg of [-1, 1]) for (let w = 0.1; w < 0.9; w += 0.4) fbox(nr, f, sg * 2.55 - 0.02, sg * 2.55 + 0.02, w, w + 0.04, y0 + 0.14, y0 + 1.1);
    fbox(nr, f, -2.6, 2.6, 0.88, 0.96, y0 + 1.06, y0 + 1.12); // top rail
    for (const sg of [-1, 1]) fbox(nr, f, Math.min(sg * 2.6, sg * 2.52), Math.max(sg * 2.6, sg * 2.52), 0, 0.96, y0 + 1.06, y0 + 1.12);
    fbox(nr, f, -2.6, 2.6, 0.9, 0.94, y0 + 0.55, y0 + 0.59); // mid rail
    for (const sg of [-1, 1]) { // french doors onto the balcony
      const [a0, a1] = [sg * 1.3 - 0.65, sg * 1.3 + 0.65];
      paint(WHITE, nr);
      fbox(nr, f, a0 - 0.08, a1 + 0.08, -0.02, 0.1, y0 + 0.14, y0 + 2.5);
      paint(GLASS, nr);
      quadOut(nr, P(f, a0, y0 + 0.16, 0.105), P(f, a1, y0 + 0.16, 0.105), P(f, a1, y0 + 2.42, 0.105), P(f, a0, y0 + 2.42, 0.105), OUT);
      paint(WHITE, nr);
      fbox(nr, f, (a0 + a1) / 2 - 0.03, (a0 + a1) / 2 + 0.03, 0.1, 0.13, y0 + 0.16, y0 + 2.42); // mullion
      fbox(nr, f, a0, a1, 0.1, 0.13, y0 + 1.6, y0 + 1.66); // transom
    }
    if (n === 1) { paint('#ecece6', nr); fbox(nr, f, 2.75, 3.45, 0.02, 0.32, y0 + 1.5, y0 + 2.05); } // split AC
    if (n === 2) { paint('#ecece6', nr); fbox(nr, f, -3.45, -2.75, 0.02, 0.32, y0 + 1.7, y0 + 2.25); }
    paint('#8a8d8c', nr);
    fbox(nr, f, HALF - 0.2, HALF - 0.1, 0.04, 0.14, y0, y0 + FLOOR_H); // drain pipe
  }
  paint(CREAM);
  fbox(st, f, -HALF, HALF, -0.25, 0.05, g + ROOF, g + ROOF + 0.6); // front parapet
  for (const sg of [-1, 1]) fbox(st, f, Math.min(sg * HALF, sg * (HALF - 0.2)), Math.max(sg * HALF, sg * (HALF - 0.2)), -DEPTH, 0, g + ROOF, g + ROOF + 0.6);
  fbox(st, f, -HALF, HALF, -DEPTH, -DEPTH + 0.2, g + ROOF, g + ROOF + 0.6);
  fbox(st, f, -HALF + 0.2, 0.2, -DEPTH + 0.2, -DEPTH + 3.2, g + ROOF, g + ROOF + 2.5); // the stair head / roof room
  const steel = s.buf('metal');
  paint('#c9ccd0', steel);
  hcyl(steel, f, 2.2, g + ROOF + 0.9, 0.55, -7.2, -5.6, 10); // the stainless water tank
  paint('#7a7d80', steel);
  fbox(steel, f, 1.5, 2.9, -7.0, -5.8, g + ROOF, g + ROOF + 0.35);

  // ── fixtures: the central table of cups, the stepped front display, the right table, vases on a pedestal, big vases ──
  paint('#2a2420');
  const table = (a0: number, a1: number, w0: number, w1: number, h: number, r: Reg) => {
    fbox(st, f, a0, a1, w0, w1, FL, FL + h);
    tq(P(f, a0, FL + h + 0.005, w0), P(f, a1, FL + h + 0.005, w0), P(f, a1, FL + h + 0.005, w1), P(f, a0, FL + h + 0.005, w1), UP, r, '#e4dccc', [0, 0, Math.min(1, (a1 - a0) / r.mw), Math.min(1, (w0 - w1) / r.mh)]);
    solid(a0, a1, w0, w1, FL, FL + h);
  };
  table(-1.2, 1.2, -6.2, -3.4, 0.78, R.table); // the central display table
  for (let t = 0; t < 3; t++) { paint('#2a2420'); table(-OPEN + 0.1, -0.9, -0.6 - t * 0.65, -0.6 - (t + 1) * 0.65, 0.3 + t * 0.25, R.goods); } // the stepped display, left of the entrance
  paint('#2a2420');
  table(1.9, OPEN - 0.1, -2.5, -0.6, 0.8, R.goods); // the right-hand table
  const vase = (a: number, w: number, y: number, h: number, r: number, hex: string, band: string) => {
    const b = paint(hex, nr);
    lathe(b, f, a, w, [[r * 0.5, y], [r * 0.8, y + h * 0.15], [r, y + h * 0.45], [r * 0.75, y + h * 0.8], [r * 0.45, y + h * 0.92], [r * 0.5, y + h]], 10);
    paint(band, nr);
    lathe(nr, f, a, w, [[r * 1.005, y + h * 0.4], [r * 0.98, y + h * 0.55]], 10);
  };
  paint('#3a2a20');
  fbox(st, f, -2.9, -2.3, -8.3, -7.7, FL, FL + 0.9); // pedestal
  solid(-2.9, -2.3, -8.3, -7.7, FL, FL + 0.9);
  vase(-2.6, -8.0, FL + 0.9, 0.55, 0.14, WHITE, '#3a63a8');
  vase(2.6, -8.2, FL, 1.05, 0.3, '#f1ebdc', '#3a63a8'); // big floor vases at the right rear
  vase(2.0, -8.6, FL, 0.8, 0.24, '#e9c44a', '#4e8a4a');
  vase(2.55, -7.4, FL, 0.6, 0.2, WHITE, '#c2452c');
  solid(1.7, OPEN, -8.9, -7.1, FL, FL + 1.1);
  for (let i = 0; i < 4; i++) vase(-OPEN + 0.35, -3.2 - i * 0.5, FL, 0.42, 0.13, i % 2 ? WHITE : '#e9c44a', MOTIF[i]!); // small vases along the left shelf unit's foot

  // ── standees: the lightbox left of the entrance (on the pavement), the two boards at the edges ──
  const board = (a: number, w: number, wd: number, h: number, r: Reg, face: string, side: string, thick = 0.05) => {
    paint(side, nr);
    fbox(nr, f, a - wd / 2, a + wd / 2, w - thick, w, g + PAVE_Y, g + PAVE_Y + h);
    tq(P(f, a - wd / 2, g + PAVE_Y + 0.01, w + 0.005), P(f, a + wd / 2, g + PAVE_Y + 0.01, w + 0.005), P(f, a + wd / 2, g + PAVE_Y + h - 0.01, w + 0.005), P(f, a - wd / 2, g + PAVE_Y + h - 0.01, w + 0.005), OUT, r, face);
    solid(a - wd / 2 - 0.05, a + wd / 2 + 0.05, w - thick - 0.05, w + 0.05, g, g + PAVE_Y + h);
  };
  board(-0.75, 0.95, 0.62, 2.2, R.lightbox, '#f4f8fc', '#dfe9f4', 0.22); // the lightbox
  paint('#cfd6de', nr);
  fbox(nr, f, -1.08, -0.42, 0.7, 0.97, g + PAVE_Y, g + PAVE_Y + 0.08); // its base
  board(-3.2, 0.95, 0.6, 1.6, R.standL, '#e6e3dc', '#d8d6d0');
  board(3.15, 0.85, 0.6, 1.6, R.standR, '#e4dfd3', '#d6d2c8');
  // a low wooden stool and two flower pots by the left standee, a mat of vases by the right one
  paint('#8a5a30', nr);
  fbox(nr, f, -2.75, -2.4, 0.5, 0.85, g + PAVE_Y + 0.25, g + PAVE_Y + 0.3);
  for (const [da, dw] of [[-2.72, 0.53], [-2.43, 0.53], [-2.72, 0.82], [-2.43, 0.82]] as const) fbox(nr, f, da - 0.015, da + 0.015, dw - 0.015, dw + 0.015, g + PAVE_Y, g + PAVE_Y + 0.25);
  for (const [a, w, hh, rr] of [[2.55, 0.45, 0.5, 0.17], [2.2, 0.35, 0.36, 0.14], [2.75, 0.2, 0.28, 0.12]] as const) vase(a, w, g + PAVE_Y, hh, rr, WHITE, '#3a63a8');
  solid(2.0, 2.95, 0.0, 0.65, g, g + PAVE_Y + 0.5);

  // ── motorbikes on the pavement in front of the east neighbours, noses to the houses ──
  const motos: number[] = [];
  const yaw = Math.atan2(-BT_UW[0], -BT_UW[1]);
  for (const [a0, n] of [[-18.6, 5], [-13.0, 4]] as const) {
    for (let m = 0; m < n; m++) {
      const p = P(f, a0 + m * 0.78, 0, 1.15);
      pushMatrix(motos, p[0], g + PAVE_Y, p[2], yaw, 0.96 + 0.08 * (m % 2));
    }
    solid(a0 - 0.4, a0 + n * 0.78, 0.2, 2.0, g, g + 1.1);
  }

  // ── the neighbours: ordinary generated tube houses on synthetic plots either side (party walls between them) ──
  const pt = (a: number, w: number) => { const p = P(f, a, 0, w); return [+p[0].toFixed(3), +p[2].toFixed(3)] as const; };
  const lot = (a0: number, a1: number, levels: number): BuildingRec => ({ outer: [...pt(a0, 0), ...pt(a1, 0), ...pt(a1, -10), ...pt(a0, -10)] as XZ, kind: 'yes', levels });
  const lots: BuildingRec[] = [lot(EAST_END, -14.3, 4), lot(-14.3, -9.1, 3), lot(-9.1, -HALF, 5), lot(HALF, 7.6, 3), lot(7.6, 11.6, 4)];
  const houses = buildBuildings({ ...chunk, buildings: lots }, ctx);
  clip(houses, f, [[-HALF - 0.01, HALF + 0.01, -DEPTH - 0.01, 0.01], [EAST_END - 20, EAST_END - 0.01, -10.5, 1.5]]);

  const out = s.out();
  return {
    meshes: [...out.meshes, ...houses.meshes],
    instances: [{ kind: 'moto', matrices: new Float32Array(motos) }],
    colliders: [...out.colliders, ...houses.colliders],
    ...(image ? { textures: [{ material: 'mural' as const, image, glow: 1.9, dayGlow: 0.45 }] } : {}), // the shop lights and the backlit letters are on by day too (the photo)
  };
};
