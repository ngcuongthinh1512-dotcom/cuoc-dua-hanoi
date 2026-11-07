// ── Quán cà phê "hmm…" (13 Khương Thượng, Đống Đa). Rada360 lists "Hmm... cafe" at 13 P. Khương Thượng; OSM has no number 13,
// so the spot comes from the street: Phố Khương Thượng starts at Phố Tây Sơn (world (−3008, 2814)), odd numbers on the
// left (north-east) side (ngõ 123 … 199 lie on the left of the increasing direction), and the only lane off that side near
// its start is the unnamed concrete service way from (−2967, 2856) running NNE along the west face of the 57 m L-shaped
// 'university' block (OSM, centroid (−2929, 2844)): a collective-housing-type slab 16 m behind the lane. The café is built
// on that block's west face, 20 m from its south end (world (−2941.7, 2840.1) = 21.0066 N, 105.8237 E), facing the lane.
// After the owner's two photos: the ground floor of a cream plastered khu tập thể block, a 3 m deep terrace under the
// upper-floor slab (rough concrete underside) on cream encaustic cement tiles (green / teal / grey floral, 20 cm); on the
// wall a white two-casement window (1.3 × 1.45 m, sill 1 m) between two open blue-grey louvred shutters (0.58 × 1.75 m),
// a warm lit interior behind it (amber walls, counter with a microwave and kettle, shelf, pendant lamp, two silhouettes,
// the golden dog Momo peeking over the sill); a dark-bronze industrial pendant lamp in front of the window; a white
// 0.45 m column carrying the 0.9 m white sign "hmm…" (navy line art: two corgis round a fluffy cat, cups and a cake —
// an OffscreenCanvas on 'mural', the same atlas holds the 16 × 16 tile pattern) with a round bamboo-framed convex mirror
// above it; to the right a white door with a 3 × 6 pane grid and a cream curtain, a dark-brown panel, a small white bench
// with two helmets and a hanging jacket, a second white pillar and a grey drain pipe; a white split AC and a dome camera
// up left. Furniture: the light-wood cane bench under the window with the café's pets (corgis Mâu — black saddle, tongue
// out — and Hồng, the white persian cat Mel with a maroon bow between them), two round stools and a pot of tiny white
// flowers; two rattan chairs round a dark wooden table in front, a white floor fan, a slender young tree (≈ 3.4 m, sparse
// small leaves) with a monstera at its foot. A paved yard links the terrace to the lane (the lane itself stays clear).
// Frame: a = along the face, south end → north end = the viewer's LEFT when he stands on the lane looking at the wall;
// w = into the block (east-south-east); the applied wall skin is 0.9 m proud of the OSM face (the interior box sits in that
// depth), the terrace w −3.9…−0.9. Solid (Sink.prism): the wall, the two pillars, chairs, table, bench, stools, fan, tree
// pot; the terrace floor and the yard are walkable. ≈ 9k tris, 6 buckets (masonry, masonry near, neon, metal, mural, pave).
import { buildingHeight } from '../BuildingBuilder.ts';
import type { ChunkData } from '../../geo/chunkData.ts';
import type { BuildCtx, BuildOut } from '../buildTypes.ts';
import type { MeshBuffer as Buf, V3 } from '../geom.ts';
import { cap, DOWN, fbox, type Fr, P, rgb, ring, UP } from './b.ts';
import { hash, lathe } from './d.ts';
import { frameAt } from './h3.ts';
import { gem } from './hoton.ts';
import { quadOut, triOut } from './kit.ts';
import { Sink } from './parts.ts';

export const CAFE: [number, number] = [-2941.7, 2840.1];
const FACE: [number, number] = [0.441, -0.898]; // unit vector along the block's west face, south end → north end (+a)

const CREAM = '#e8dfc9';
const WHITE = '#f2efe8';
const SHUTTER = '#7f93ad';
const SLAT = '#66789a';
const WOOD_DARK = '#4a3324';
const RATTAN = '#c9a35c';
const CANE = '#e2cf98';
const LIGHT_WOOD = '#d9b97a';
const LAMP = '#ffb24a';
const CORGI = '#e0934a';
const FUR_WHITE = '#f6f1e6';
const [AW, AH] = [1024, 512]; // atlas px: sign 512 × 512 on the left, 16 × 16 encaustic tiles (32 px) on the right

/** The chunk atlas: the "hmm…" sign (navy line art on white) and the tile pattern. */
function paintAtlas(): ImageBitmap | undefined {
  if (typeof OffscreenCanvas === 'undefined') return;
  const c = new OffscreenCanvas(AW, AH);
  const g = c.getContext('2d');
  if (!g) return;
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, AW, AH);
  // ── sign ──
  const navy = '#1d2857';
  g.strokeStyle = navy;
  g.fillStyle = navy;
  g.lineWidth = 7;
  g.lineCap = g.lineJoin = 'round';
  g.textAlign = 'center';
  g.font = 'italic bold 118px "Snell Roundhand", "Apple Chancery", "Brush Script MT", "Segoe Script", cursive';
  g.fillText('hmm...', 256, 170);
  const dot = (x: number, y: number, r = 4) => { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); };
  const corgi = (x: number, y: number, flip: number) => { // head circle, two big ears, eyes, nose, smile + tongue, a shoulder line
    g.beginPath(); g.arc(x, y, 40, 0, Math.PI * 2); g.stroke();
    for (const s of [-1, 1]) { g.beginPath(); g.moveTo(x + s * 18, y - 34); g.lineTo(x + s * 42, y - 88); g.lineTo(x + s * 46, y - 20); g.stroke(); }
    dot(x - 14, y - 6); dot(x + 14, y - 6);
    g.beginPath(); g.moveTo(x - 7, y + 10); g.lineTo(x + 7, y + 10); g.lineTo(x, y + 17); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(x - 16, y + 20); g.quadraticCurveTo(x, y + 34, x + 16, y + 20); g.stroke();
    g.beginPath(); g.moveTo(x - 5, y + 27); g.quadraticCurveTo(x, y + 46, x + 5, y + 27); g.stroke(); // tongue
    g.beginPath(); g.moveTo(x - flip * 30, y + 30); g.quadraticCurveTo(x - flip * 70, y + 50, x - flip * 62, y + 100); g.stroke(); // back / tail side
    g.beginPath(); g.moveTo(x + flip * 28, y + 32); g.quadraticCurveTo(x + flip * 40, y + 70, x + flip * 30, y + 100); g.stroke();
  };
  corgi(130, 300, 1);
  corgi(382, 300, -1);
  g.beginPath(); // the fluffy cat: a jagged circle, small ears, flat grumpy eyes, tiny nose, a chest ruff
  for (let k = 0; k <= 28; k++) {
    const t = (k / 28) * Math.PI * 2;
    const r = 46 + (k % 2 ? 7 : -3);
    const [px, py] = [256 + Math.cos(t) * r, 312 + Math.sin(t) * r * 0.95];
    k ? g.lineTo(px, py) : g.moveTo(px, py);
  }
  g.stroke();
  for (const s of [-1, 1]) { g.beginPath(); g.moveTo(256 + s * 22, 272); g.lineTo(256 + s * 36, 250); g.lineTo(256 + s * 42, 282); g.stroke(); }
  for (const s of [-1, 1]) { g.beginPath(); g.moveTo(256 + s * 8, 306); g.lineTo(256 + s * 24, 302); g.stroke(); }
  g.beginPath(); g.moveTo(252, 318); g.lineTo(260, 318); g.lineTo(256, 324); g.closePath(); g.fill();
  g.beginPath(); g.moveTo(248, 332); g.quadraticCurveTo(256, 338, 264, 332); g.stroke();
  g.beginPath(); g.moveTo(222, 368); g.quadraticCurveTo(256, 390, 290, 368); g.stroke();
  g.lineWidth = 6;
  for (const x of [186, 326]) { // two cups with handles
    g.strokeRect(x, 392, 30, 26);
    g.beginPath(); g.arc(x + 32, 405, 9, -Math.PI / 2, Math.PI / 2); g.stroke();
    g.beginPath(); g.moveTo(x - 6, 418); g.lineTo(x + 36, 418); g.stroke();
  }
  g.beginPath(); g.moveTo(236, 420); g.lineTo(276, 420); g.lineTo(262, 392); g.lineTo(246, 392); g.closePath(); g.stroke(); // a cake slice
  g.beginPath(); g.moveTo(246, 402); g.lineTo(264, 402); g.stroke();
  // ── encaustic tiles: cream ground, a teal diamond with a cream star inside, grey quarter rosettes in the corners ──
  const T = 32;
  for (let i = 0; i < 16; i++) {
    for (let j = 0; j < 16; j++) {
      const [x, y] = [512 + i * T, j * T];
      g.fillStyle = '#ece3cf';
      g.fillRect(x, y, T, T);
      g.fillStyle = '#9aa39b';
      for (const [cx, cy] of [[x, y], [x + T, y], [x, y + T], [x + T, y + T]] as const) { g.beginPath(); g.arc(cx, cy, 9, 0, Math.PI * 2); g.fill(); }
      g.fillStyle = (i + j) % 2 ? '#5f8a7a' : '#6b9484';
      g.beginPath(); g.moveTo(x + 16, y + 3); g.lineTo(x + 29, y + 16); g.lineTo(x + 16, y + 29); g.lineTo(x + 3, y + 16); g.closePath(); g.fill();
      g.fillStyle = '#ece3cf';
      g.beginPath(); g.moveTo(x + 16, y + 9); g.lineTo(x + 19, y + 13); g.lineTo(x + 23, y + 16); g.lineTo(x + 19, y + 19); g.lineTo(x + 16, y + 23); g.lineTo(x + 13, y + 19); g.lineTo(x + 9, y + 16); g.lineTo(x + 13, y + 13); g.closePath(); g.fill();
      g.fillStyle = '#c7b48a';
      g.fillRect(x + 15, y + 15, 2, 2);
      g.strokeStyle = '#d8ceb8';
      g.lineWidth = 1;
      g.strokeRect(x + 0.5, y + 0.5, T - 1, T - 1); // grout
    }
  }
  return c.transferToImageBitmap();
}

function inRing(x: number, z: number, r: number[]) {
  let inside = false;
  for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
    const [xi, zi, xj, zj] = [r[i]!, r[i + 1]!, r[j]!, r[j + 1]!];
    if (zi > z !== zj > z && x < xi + ((z - zi) / (zj - zi)) * (xj - xi)) inside = !inside;
  }
  return inside;
}

/** Disc in the vertical a–y plane at w, facing `out`. */
const vdisc = (buf: Buf, f: Fr, a: number, y: number, w: number, r: number, n: number, out: V3) =>
  cap(buf, Array.from({ length: n }, (_, k) => P(f, a + r * Math.cos((2 * Math.PI * k) / n), y + r * Math.sin((2 * Math.PI * k) / n), w)), out);

/** Flat upright quad in the a–y plane at w, both faces. */
function card(buf: Buf, f: Fr, a0: number, a1: number, y0: number, y1: number, w: number, out: V3) {
  const q: [V3, V3, V3, V3] = [P(f, a0, y0, w), P(f, a1, y0, w), P(f, a1, y1, w), P(f, a0, y1, w)];
  quadOut(buf, ...q, out);
  quadOut(buf, ...q, [-out[0], -out[1], -out[2]]);
}

/** Upright triangle (an ear, a bow wing), both faces. */
function fin(buf: Buf, _f: Fr, p0: V3, p1: V3, p2: V3, out: V3) {
  triOut(buf, p0, p1, p2, out);
  triOut(buf, p0, p1, p2, [-out[0], -out[1], -out[2]]);
}

/** Ball of radius r centred at (a, y, w): a lathe with a 2 cm hole at the bottom. */
const ball = (buf: Buf, f: Fr, a: number, y: number, w: number, r: number, n = 10) =>
  lathe(buf, f, a, w, [[r * 0.3, y - r * 0.95], [r * 0.8, y - r * 0.6], [r, y], [r * 0.8, y + r * 0.6], [r * 0.35, y + r * 0.94], [0, y + r]], n);

/** A corgi sitting at (a, w) on y0, facing −w (`out`): orange with a white chest / blaze / legs, big upright ears, a black
 *  saddle on `saddle`, tongue out on `tongue`. ≈ 450 tris. */
function corgi(s: Sink, f: Fr, a: number, w: number, y0: number, out: V3, saddle: boolean, tongue: boolean) {
  const fur = s.buf('masonry', 'near');
  fur.color = rgb(CORGI);
  lathe(fur, f, a, w + 0.02, [[0.17, y0], [0.19, y0 + 0.08], [0.17, y0 + 0.2], [0.13, y0 + 0.3], [0.09, y0 + 0.36], [0.05, y0 + 0.39]], 12);
  if (saddle) {
    fur.color = rgb('#2a2420');
    lathe(fur, f, a, w + 0.04, [[0.17, y0 + 0.17], [0.15, y0 + 0.27], [0.1, y0 + 0.33]], 12);
  }
  fur.color = rgb(FUR_WHITE);
  card(fur, f, a - 0.075, a + 0.075, y0 + 0.02, y0 + 0.31, w - 0.155, out); // chest
  for (const sg of [-1, 1]) lathe(fur, f, a + sg * 0.085, w - 0.12, [[0.032, y0], [0.03, y0 + 0.2], [0, y0 + 0.21]], 7); // front legs
  const c = y0 + 0.47;
  fur.color = rgb(CORGI);
  ball(fur, f, a, c, w - 0.03, 0.105, 12);
  fur.color = rgb(FUR_WHITE);
  card(fur, f, a - 0.035, a + 0.035, c - 0.09, c + 0.06, w - 0.13, out); // blaze
  lathe(fur, f, a, w - 0.11, [[0.045, c - 0.075], [0.048, c - 0.03], [0.03, c - 0.005], [0, c]], 8); // muzzle
  for (const sg of [-1, 1]) { // ears: an orange triangle with a pink inner one
    const [b0, b1, tip]: V3[] = [P(f, a + sg * 0.03, c + 0.07, w - 0.03), P(f, a + sg * 0.095, c + 0.04, w - 0.03), P(f, a + sg * 0.1, c + 0.22, w - 0.03)];
    fur.color = rgb(CORGI);
    fin(fur, f, b0, b1, tip, out);
    fur.color = rgb('#e8a9a0');
    fin(fur, f, P(f, a + sg * 0.045, c + 0.075, w - 0.034), P(f, a + sg * 0.085, c + 0.06, w - 0.034), P(f, a + sg * 0.09, c + 0.18, w - 0.034), out);
  }
  fur.color = rgb('#1a1612');
  gem(fur, P(f, a, c - 0.005, w - 0.165), 0.018); // nose
  for (const sg of [-1, 1]) gem(fur, P(f, a + sg * 0.04, c + 0.03, w - 0.12), 0.013); // eyes
  if (tongue) {
    fur.color = rgb('#e87a8a');
    card(fur, f, a - 0.018, a + 0.018, c - 0.12, c - 0.04, w - 0.15, out);
  }
}

/** The fluffy white persian cat Mel: a round body, a flat face, small ears, a maroon bow. ≈ 350 tris. */
function cat(s: Sink, f: Fr, a: number, w: number, y0: number, out: V3) {
  const fur = s.buf('masonry', 'near');
  fur.color = rgb('#f3ede0');
  lathe(fur, f, a, w, [[0.14, y0], [0.17, y0 + 0.1], [0.16, y0 + 0.22], [0.12, y0 + 0.31], [0.06, y0 + 0.35]], 12);
  for (const sg of [-1, 1]) lathe(fur, f, a + sg * 0.07, w - 0.11, [[0.03, y0], [0.028, y0 + 0.16], [0, y0 + 0.17]], 7);
  const c = y0 + 0.42;
  ball(fur, f, a, c, w - 0.02, 0.1, 12);
  for (const sg of [-1, 1]) fin(fur, f, P(f, a + sg * 0.04, c + 0.07, w - 0.02), P(f, a + sg * 0.085, c + 0.045, w - 0.02), P(f, a + sg * 0.075, c + 0.14, w - 0.02), out);
  fur.color = rgb('#2a2622');
  for (const sg of [-1, 1]) gem(fur, P(f, a + sg * 0.035, c + 0.015, w - 0.115), 0.013);
  fur.color = rgb('#d98a8a');
  gem(fur, P(f, a, c - 0.025, w - 0.12), 0.012);
  fur.color = rgb('#7a1f2e'); // bow tie under the chin
  for (const sg of [-1, 1]) fin(fur, f, P(f, a, y0 + 0.33, w - 0.145), P(f, a + sg * 0.06, y0 + 0.36, w - 0.15), P(f, a + sg * 0.06, y0 + 0.3, w - 0.15), out);
  gem(fur, P(f, a, y0 + 0.33, w - 0.15), 0.016);
}

/** Rattan armchair at (a, w), facing −w: cane seat, curved back from slanted strips, round arms. */
function rattanChair(s: Sink, f: Fr, a: number, w: number, g: number) {
  const st = s.buf('masonry', 'near');
  st.color = rgb(CANE);
  fbox(st, f, a - 0.26, a + 0.26, w - 0.25, w + 0.25, g + 0.4, g + 0.45);
  st.color = rgb(RATTAN);
  for (const [da, dw] of [[-0.23, -0.22], [0.23, -0.22], [-0.23, 0.22], [0.23, 0.22]] as const) fbox(st, f, a + da - 0.02, a + da + 0.02, w + dw - 0.02, w + dw + 0.02, g, g + 0.42);
  for (let k = 0; k < 7; k++) { // back: strips on an arc behind the seat, leaning back
    const t = -0.26 + k * 0.0867;
    const dw = 0.2 + 0.06 * Math.cos((t / 0.26) * Math.PI * 0.5) ** 2;
    fbox(st, f, a + t - 0.015, a + t + 0.015, w + dw, w + dw + 0.03, g + 0.42, g + 0.95);
  }
  fbox(st, f, a - 0.28, a + 0.28, w + 0.19, w + 0.29, g + 0.93, g + 0.98); // top rail
  for (const sg of [-1, 1]) { // arms on short posts
    fbox(st, f, a + sg * 0.26 - 0.02, a + sg * 0.26 + 0.02, w - 0.2, w + 0.22, g + 0.62, g + 0.66);
    fbox(st, f, a + sg * 0.26 - 0.015, a + sg * 0.26 + 0.015, w - 0.17, w - 0.14, g + 0.45, g + 0.62);
  }
  s.prism([[P(f, a - 0.28, 0, w - 0.26), P(f, a + 0.28, 0, w - 0.26), P(f, a + 0.28, 0, w + 0.3), P(f, a - 0.28, 0, w + 0.3)].flatMap((p) => [p[0], p[2]])], g, g + 0.95);
}

/** Young tree: a thin trunk, a few branch ribbons, sparse small leaves (gems) round their tips; a monstera and a pot at its foot. */
function youngTree(s: Sink, f: Fr, a: number, w: number, g: number) {
  const st = s.buf('masonry');
  st.color = rgb('#8d6c4a');
  lathe(st, f, a, w, [[0.22, g], [0.2, g + 0.3], [0.17, g + 0.32]], 10); // pot
  st.color = rgb('#5a4a3a');
  cap(st, ring(f, a, w, 0.16, g + 0.3, 10), UP);
  st.color = rgb('#6b5a48');
  lathe(st, f, a, w, [[0.03, g + 0.3], [0.025, g + 1.8], [0.015, g + 3.2], [0, g + 3.45]], 7); // trunk
  const leaf = s.buf('masonry', 'near');
  const tips: V3[] = [];
  for (let k = 0; k < 7; k++) { // branches: thin crossed ribbons from the trunk out to a tip
    const y = g + 1.5 + k * 0.28;
    const u = hash(k * 2.3 + a) * Math.PI * 2;
    const len = 0.5 + hash(k * 1.7 + w) * 0.8;
    const t: V3 = P(f, a + Math.cos(u) * len, y + 0.3 + hash(k) * 0.4, w + Math.sin(u) * len);
    tips.push(t);
    leaf.color = rgb('#6b5a48');
    for (const [da, dw] of [[0.012, 0], [0, 0.012]] as const) {
      const q: [V3, V3, V3, V3] = [P(f, a - da, y, w - dw), P(f, a + da, y, w + dw), [t[0] + da * f.ux - dw * -f.uz, t[1], t[2] + da * f.uz + dw * f.ux], [t[0] - da * f.ux + dw * -f.uz, t[1], t[2] - da * f.uz - dw * f.ux]];
      quadOut(leaf, ...q, UP);
      quadOut(leaf, ...q, DOWN);
    }
  }
  for (let q = 0; q < 120; q++) { // leaves: small green octahedra scattered near the branch tips and the upper trunk
    const t = q < 110 ? tips[q % tips.length]! : P(f, a, g + 2.2 + hash(q) * 1.2, w);
    const r = 0.15 + hash(q * 3.1) * 0.45;
    const u = hash(q * 1.3) * Math.PI * 2;
    const v = (hash(q * 0.7) - 0.5) * Math.PI;
    leaf.color = rgb(q % 3 ? '#79a258' : '#5f8c43');
    gem(leaf, [t[0] + Math.cos(u) * Math.cos(v) * r, t[1] + Math.sin(v) * r * 0.8, t[2] + Math.sin(u) * Math.cos(v) * r], 0.04);
  }
  leaf.color = rgb('#2e6b3a'); // monstera: big leaves fanning out from the pot
  for (let k = 0; k < 6; k++) {
    const u = (k / 6) * Math.PI * 2 + 0.4;
    const [ca, sa] = [Math.cos(u), Math.sin(u)];
    const [b, t] = [P(f, a + ca * 0.1, g + 0.35, w + sa * 0.1), P(f, a + ca * 0.75, g + 0.55 + (k % 2) * 0.25, w + sa * 0.75)];
    const [l, r] = [P(f, a + ca * 0.42 - sa * 0.22, g + 0.5 + (k % 2) * 0.15, w + sa * 0.42 + ca * 0.22), P(f, a + ca * 0.42 + sa * 0.22, g + 0.5 + (k % 2) * 0.15, w + sa * 0.42 - ca * 0.22)];
    quadOut(leaf, b, l, t, r, UP);
    quadOut(leaf, b, r, t, l, DOWN);
  }
  s.prism([ring(f, a, w, 0.22, 0, 8).flatMap((p) => [p[0], p[2]])], g, g + 0.32);
}

export const cafeHmm = (chunk: ChunkData, ctx: BuildCtx): BuildOut => {
  const [cx, cz] = CAFE;
  const g = ctx.height(cx, cz);
  const s = new Sink();
  const f = frameAt(cx, cz, FACE[0], FACE[1]);
  const OUT: V3 = [f.uz, 0, -f.ux]; // −w: out of the wall, towards the lane
  const inside = P(f, 0, 0, 2);
  const block = chunk.buildings.find((b) => inRing(inside[0], inside[2], b.outer));
  const H = g + (block ? buildingHeight(block) : 20);
  const st = s.buf('masonry');
  const solid = (a0: number, a1: number, w0: number, w1: number, y1: number) =>
    s.prism([[P(f, a0, 0, w0), P(f, a1, 0, w0), P(f, a1, 0, w1), P(f, a0, 0, w1)].flatMap((p) => [p[0], p[2]])], g, y1);

  // ── the applied facade: a cream skin 0.9 m proud of the OSM face with the window and door holes, the slab, the upper bay ──
  const [W0, W1] = [-0.9, -0.78]; // skin
  const [WL, WR, WB, WT] = [0.95, 2.25, g + 1.0, g + 2.45]; // window hole (a from the right edge to the left edge, y)
  const [DL, DR, DT] = [-2.55, -1.65, g + 2.3]; // door hole
  const CEIL = g + 3.3;
  st.color = rgb(CREAM);
  for (const [a0, a1] of [[-5.2, DL], [DR, WL], [WR, 5.2]] as const) fbox(st, f, a0, a1, W0, W1, g, CEIL);
  fbox(st, f, WL, WR, W0, W1, g, WB);
  fbox(st, f, WL, WR, W0, W1, WT, CEIL);
  fbox(st, f, DL, DR, W0, W1, DT, CEIL);
  fbox(st, f, -5.2, 5.2, -3.9, 0, CEIL, CEIL + 0.35); // the slab over the terrace
  const under = s.buf('neon'); // its rough concrete underside: unlit light grey (a lit face there is all shade and reads dark brown)
  under.color = rgb('#b9b4a8');
  quadOut(under, P(f, -5.2, CEIL - 0.005, -3.9), P(f, 5.2, CEIL - 0.005, -3.9), P(f, 5.2, CEIL - 0.005, W0), P(f, -5.2, CEIL - 0.005, W0), DOWN);
  st.color = rgb(CREAM);
  fbox(st, f, -5.2, 5.2, -3.9, 0, CEIL + 0.35, H); // the upper floors over the terrace (a bay flush with the terrace edge)
  st.color = rgb('#3b4752');
  for (let y = CEIL + 1.3; y + 1.5 < H; y += 3.2) for (const a of [-3.6, -1.2, 1.2, 3.6]) card(st, f, a - 0.55, a + 0.55, y, y + 1.4, -3.905, OUT); // upper windows
  st.color = rgb('#d9d0b8');
  for (let y = CEIL + 2.9; y + 0.2 < H; y += 3.2) fbox(st, f, -5.2, 5.2, -4.0, -3.9, y, y + 0.12); // thin floor bands
  solid(-5.2, 5.2, W0 - 0.05, 0, CEIL);
  // the rest of the block's west face at ground level: a plain cream skin with dark windows instead of BuildingBuilder's shop band
  for (const [a0, a1] of [[-20, -5.2], [5.2, 36.9]] as const) {
    st.color = rgb(CREAM);
    fbox(st, f, a0, a1, -0.3, 0, g, CEIL + 1.3); // up over the shop band
    st.color = rgb('#3b4752');
    for (let a = a0 + 1.6; a + 1.0 < a1; a += 3.2) card(st, f, a, a + 1.0, g + 1.1, g + 2.4, -0.305, OUT);
  }

  // ── window: white frame + mullion, sill, the warm interior behind, the open shutters ──
  st.color = rgb(WHITE);
  const [FW0, FW1] = [-0.96, -0.86];
  fbox(st, f, WL - 0.07, WR + 0.07, FW0, FW1, WB - 0.07, WB);
  fbox(st, f, WL - 0.07, WR + 0.07, FW0, FW1, WT, WT + 0.07);
  fbox(st, f, WL - 0.07, WL, FW0, FW1, WB, WT);
  fbox(st, f, WR, WR + 0.07, FW0, FW1, WB, WT);
  fbox(st, f, 1.575, 1.625, FW0, FW1, WB, WT); // mullion
  fbox(st, f, WL - 0.12, WR + 0.12, -1.0, W1, WB - 0.1, WB - 0.07); // sill
  const lit = s.buf('neon');
  const [IL, IR, IW] = [WL - 0.65, WR + 0.65, -0.02]; // interior box: wider than the hole, back wall just inside the skin
  lit.color = rgb('#c8964e');
  quadOut(lit, P(f, IL, g + 0.1, IW), P(f, IR, g + 0.1, IW), P(f, IR, CEIL - 0.4, IW), P(f, IL, CEIL - 0.4, IW), OUT); // back wall
  lit.color = rgb('#b58646');
  for (const [a, sg] of [[IL, 1], [IR, -1]] as const) quadOut(lit, P(f, a, g + 0.1, IW), P(f, a, g + 0.1, W1), P(f, a, CEIL - 0.4, W1), P(f, a, CEIL - 0.4, IW), [f.ux * sg, 0, f.uz * sg]);
  lit.color = rgb('#e6c58a');
  quadOut(lit, P(f, IL, CEIL - 0.4, IW), P(f, IR, CEIL - 0.4, IW), P(f, IR, CEIL - 0.4, W1), P(f, IL, CEIL - 0.4, W1), DOWN);
  lit.color = rgb('#6e5236');
  quadOut(lit, P(f, IL, g + 0.1, IW), P(f, IR, g + 0.1, IW), P(f, IR, g + 0.1, W1), P(f, IL, g + 0.1, W1), UP);
  lit.color = rgb('#3d2b1f');
  fbox(lit, f, WL, WR + 0.5, -0.5, -0.2, g + 0.1, g + 0.95); // counter
  lit.color = rgb('#d9d4cc');
  fbox(lit, f, WL + 0.05, WL + 0.5, -0.45, -0.22, g + 0.95, g + 1.28); // microwave
  lit.color = rgb('#8c8c8c');
  lathe(lit, f, WL + 0.75, -0.35, [[0.07, g + 0.95], [0.06, g + 1.12], [0.02, g + 1.16], [0, g + 1.2]], 7); // kettle
  lit.color = rgb('#5a3f2a');
  fbox(lit, f, IL + 0.1, WL + 0.4, -0.12, IW, g + 1.9, g + 1.95); // shelf
  lit.color = rgb('#d8c4a0');
  for (const a of [IL + 0.2, IL + 0.45, IL + 0.7]) fbox(lit, f, a, a + 0.12, -0.1, IW, g + 1.95, g + 2.2); // jars
  lit.color = rgb(LAMP);
  lathe(lit, f, WR - 0.2, -0.45, [[0.04, CEIL - 0.9], [0.17, CEIL - 1.02], [0.2, CEIL - 1.1], [0.2, CEIL - 1.12]], 9); // inner pendant
  fbox(lit, f, WR - 0.205, WR - 0.195, -0.455, -0.445, CEIL - 0.9, CEIL - 0.4);
  lit.color = rgb('#ffd68a');
  gem(lit, P(f, WR - 0.2, CEIL - 1.16, -0.45), 0.06);
  lit.color = rgb('#3a2a22'); // two silhouettes: behind the counter, and seated by the window
  card(lit, f, WL + 0.1, WL + 0.5, g + 0.95, g + 1.65, -0.14, OUT);
  gem(lit, P(f, WL + 0.3, g + 1.78, -0.14), 0.11);
  card(lit, f, WR - 0.05, WR + 0.4, g + 0.5, g + 1.3, -0.3, OUT);
  gem(lit, P(f, WR + 0.17, g + 1.42, -0.3), 0.1);
  const momo = s.buf('masonry', 'near'); // Momo, the golden dog, peeking over the sill on the right
  momo.color = rgb('#c9983f');
  ball(momo, f, WR - 0.25, WB + 0.1, -0.68, 0.1, 10);
  for (const sg of [-1, 1]) {
    momo.color = rgb('#a67a2a');
    card(momo, f, WR - 0.25 + sg * 0.085, WR - 0.25 + sg * 0.14, WB + 0.02, WB + 0.16, -0.66, OUT);
  }
  momo.color = rgb('#1a1612');
  gem(momo, P(f, WR - 0.25, WB + 0.07, -0.785), 0.016);
  for (const sg of [-1, 1]) gem(momo, P(f, WR - 0.25 + sg * 0.035, WB + 0.13, -0.76), 0.012);
  for (const [a0, a1, hinge] of [[WR + 0.07, WR + 0.65, WR + 0.07], [WL - 0.65, WL - 0.07, WL - 0.07]] as const) { // shutters swung flat against the wall
    st.color = rgb(SHUTTER);
    fbox(st, f, a0, a1, -0.98, -0.93, g + 0.85, g + 2.6);
    st.color = rgb(SLAT);
    for (let y = g + 0.95; y < g + 2.5; y += 0.08) fbox(st, f, a0 + 0.05, a1 - 0.05, -0.992, -0.98, y, y + 0.03);
    st.color = rgb('#2b2b2b');
    for (const y of [g + 1.0, g + 2.4]) fbox(st, f, hinge - 0.02, hinge + 0.02, -0.99, -0.93, y, y + 0.06); // hinges
  }
  st.color = rgb('#2b2b2b');
  fbox(st, f, WR + 0.5, WR + 0.62, -1.01, -0.98, g + 1.25, g + 1.33); // latch
  // pendant lamp in front of the window: cord, dark-bronze dome, the warm glow under it
  st.color = rgb('#1e1a16');
  fbox(st, f, 1.39, 1.41, -1.26, -1.24, g + 2.65, CEIL);
  st.color = rgb('#3a3026');
  lathe(st, f, 1.4, -1.25, [[0.04, g + 2.66], [0.1, g + 2.6], [0.19, g + 2.5], [0.24, g + 2.42], [0.24, g + 2.4]], 12);
  const glow = s.buf('neon');
  glow.color = rgb(LAMP);
  cap(glow, ring(f, 1.4, -1.25, 0.2, g + 2.405, 12), DOWN);
  glow.color = rgb('#ffd68a');
  gem(glow, P(f, 1.4, g + 2.36, -1.25), 0.05);

  // ── the sign column, the sign, the convex mirror ──
  st.color = rgb(WHITE);
  fbox(st, f, -0.75, -0.3, -1.35, W0, g, CEIL);
  solid(-0.75, -0.3, -1.35, W0, CEIL);
  st.color = rgb('#e9e3d2');
  fbox(st, f, -0.6, -0.45, -1.42, -1.35, g + 1.55, g + 2.45); // bracket strip
  st.color = rgb(WHITE);
  fbox(st, f, -0.98, -0.08, -1.47, -1.42, g + 1.55, g + 2.45); // the board
  const image = paintAtlas();
  const sign = image ? s.buf('mural') : st;
  quadOut(sign, P(f, -0.96, g + 1.57, -1.475), P(f, -0.1, g + 1.57, -1.475), P(f, -0.1, g + 2.43, -1.475), P(f, -0.96, g + 2.43, -1.475), OUT, 0.5, 1, 0, 0); // a = −0.96 is the viewer's right edge; v = 0 is the image's top row
  st.color = rgb('#c9a96a'); // bamboo frame
  vdisc(st, f, -0.45, g + 2.98, -1.37, 0.3, 18, OUT);
  const mirror = s.buf('metal');
  mirror.color = rgb('#8aa27a');
  vdisc(mirror, f, -0.45, g + 2.98, -1.38, 0.26, 18, OUT);
  mirror.color = rgb('#b9c8a6');
  vdisc(mirror, f, -0.47, g + 3.02, -1.385, 0.1, 10, OUT);
  st.color = rgb('#8a7a60');
  fbox(st, f, -0.47, -0.43, -1.37, W0, g + 2.66, g + 2.7); // its stay

  // ── door with a 3 × 6 pane grid and a cream curtain, the dark panel, the helmet bench, the second pillar, the drain pipe ──
  st.color = rgb(WHITE);
  fbox(st, f, DL, DR, -0.9, -0.86, g, DT); // leaf
  st.color = rgb('#efe6cf');
  for (let i = 0; i < 3; i++) for (let j = 0; j < 6; j++) {
    const [a0, y0] = [DL + 0.07 + i * 0.27, g + 0.22 + j * 0.33];
    quadOut(st, P(f, a0, y0, -0.905), P(f, a0 + 0.22, y0, -0.905), P(f, a0 + 0.22, y0 + 0.28, -0.905), P(f, a0, y0 + 0.28, -0.905), OUT);
  }
  st.color = rgb('#2b2b2b');
  fbox(st, f, DR - 0.2, DR - 0.1, -0.93, -0.9, g + 1.0, g + 1.03); // handle
  st.color = rgb(WOOD_DARK);
  fbox(st, f, -3.2, -2.62, -0.95, W0, g, DT); // dark-brown panel
  st.color = rgb(WHITE); // small white bench, two helmets, the hanging jacket
  fbox(st, f, -4.0, -3.25, -1.3, -0.95, g + 0.45, g + 0.5);
  for (const [a, w] of [[-3.97, -1.27], [-3.28, -1.27], [-3.97, -0.98], [-3.28, -0.98]] as const) fbox(st, f, a - 0.02, a + 0.02, w - 0.02, w + 0.02, g, g + 0.45);
  st.color = rgb('#4b5a3e');
  lathe(st, f, -3.8, -1.12, [[0.1, g + 0.5], [0.14, g + 0.56], [0.12, g + 0.64], [0.06, g + 0.68], [0, g + 0.69]], 10);
  st.color = rgb('#1c1c1c');
  lathe(st, f, -3.45, -1.12, [[0.1, g + 0.5], [0.14, g + 0.56], [0.12, g + 0.64], [0.06, g + 0.68], [0, g + 0.69]], 10);
  st.color = rgb('#1e1e22');
  fbox(st, f, -3.5, -3.05, -1.0, W0, g + 1.1, g + 2.0);
  fbox(st, f, -3.33, -3.22, -1.04, W0, g + 2.0, g + 2.08);
  st.color = rgb(WHITE);
  fbox(st, f, -4.6, -4.15, -1.35, W0, g, CEIL); // second pillar
  solid(-4.6, -4.15, -1.35, W0, CEIL);
  st.color = rgb('#8a8d8c');
  lathe(st, f, -4.95, -1.0, [[0.05, g], [0.05, H - 0.5], [0, H - 0.45]], 8); // drain pipe
  st.color = rgb('#f0f0ea'); // split AC up left, dome camera
  fbox(st, f, 2.9, 3.75, -1.25, -0.95, g + 2.65, g + 3.2);
  st.color = rgb('#cfcfc8');
  for (let a = 2.98; a < 3.7; a += 0.08) fbox(st, f, a, a + 0.03, -1.255, -1.25, g + 2.75, g + 3.1); // grille
  st.color = rgb(WHITE);
  fbox(st, f, 4.65, 4.75, -1.08, W0, g + 2.72, g + 2.78);
  lathe(st, f, 4.7, -1.04, [[0.07, g + 2.66], [0.065, g + 2.7], [0.04, g + 2.75], [0, g + 2.78]], 8);

  // ── floor: encaustic tiles (the atlas's right half = 16 × 16 tiles of 0.2 m) in 4 × 13-tile strips, 15 tiles deep; the yard ──
  const floor = image ? s.buf('mural') : st;
  if (!image) st.color = rgb('#ded5bf');
  for (let k = 0; k < 4; k++) {
    const [a0, a1] = [-5.2 + k * 2.6, -5.2 + (k + 1) * 2.6];
    quadOut(floor, P(f, a0, g + 0.025, -3.9), P(f, a1, g + 0.025, -3.9), P(f, a1, g + 0.025, W0), P(f, a0, g + 0.025, W0), UP, 0.5, 15 / 16, 0.5 + (13 / 16) * 0.5, 0);
  }
  const pave = s.buf('pave');
  quadOut(pave, P(f, -4, g + 0.02, -13.6), P(f, 4, g + 0.02, -13.6), P(f, 4, g + 0.02, -3.9), P(f, -4, g + 0.02, -3.9), UP, 0, 0, 4, 4.85);

  // ── furniture: the cane bench with the pets, stools, the flower pot; rattan chairs round the table, the fan, the tree ──
  const bench = s.buf('masonry', 'near');
  const [BA, BW] = [1.6, -1.45];
  bench.color = rgb(LIGHT_WOOD);
  fbox(bench, f, BA - 0.78, BA + 0.78, BW - 0.22, BW + 0.22, g + 0.42, g + 0.47);
  fbox(bench, f, BA - 0.78, BA + 0.78, BW + 0.2, BW + 0.24, g + 0.47, g + 0.95);
  for (const [da, dw] of [[-0.74, -0.18], [0.74, -0.18], [-0.74, 0.18], [0.74, 0.18]] as const) fbox(bench, f, BA + da - 0.025, BA + da + 0.025, BW + dw - 0.025, BW + dw + 0.025, g, g + 0.42);
  for (const sg of [-1, 1]) {
    fbox(bench, f, BA + sg * 0.78 - 0.02, BA + sg * 0.78 + 0.02, BW - 0.2, BW + 0.24, g + 0.62, g + 0.66);
    fbox(bench, f, BA + sg * 0.78 - 0.02, BA + sg * 0.78 + 0.02, BW - 0.18, BW - 0.14, g + 0.47, g + 0.62);
  }
  bench.color = rgb(CANE);
  quadOut(bench, P(f, BA - 0.72, g + 0.472, BW - 0.18), P(f, BA + 0.72, g + 0.472, BW - 0.18), P(f, BA + 0.72, g + 0.472, BW + 0.18), P(f, BA - 0.72, g + 0.472, BW + 0.18), UP);
  card(bench, f, BA - 0.72, BA + 0.72, g + 0.52, g + 0.9, BW + 0.198, OUT);
  solid(BA - 0.8, BA + 0.8, BW - 0.24, BW + 0.26, g + 0.95);
  bench.color = rgb(LIGHT_WOOD);
  for (const a of [BA - 1.2, BA + 1.2]) {
    lathe(bench, f, a, BW - 0.05, [[0.17, g], [0.15, g + 0.05], [0.14, g + 0.38], [0.19, g + 0.4], [0.19, g + 0.44]], 10);
    s.prism([ring(f, a, BW - 0.05, 0.19, 0, 8).flatMap((p) => [p[0], p[2]])], g, g + 0.44);
  }
  bench.color = rgb('#9a6a4a'); // flower pot behind the cat
  lathe(bench, f, BA, BW + 0.08, [[0.07, g + 0.47], [0.085, g + 0.6], [0.08, g + 0.61]], 8);
  bench.color = rgb('#4f7a3a');
  lathe(bench, f, BA, BW + 0.08, [[0.16, g + 0.6], [0.14, g + 0.72], [0, g + 0.78]], 8);
  bench.color = rgb('#f7f3e8');
  for (let q = 0; q < 18; q++) {
    const u = hash(q * 1.7) * Math.PI * 2;
    const r = hash(q * 2.9) * 0.14;
    gem(bench, P(f, BA + Math.cos(u) * r, g + 0.7 + hash(q) * 0.08, BW + 0.08 + Math.sin(u) * r), 0.016);
  }
  corgi(s, f, BA + 0.5, BW - 0.03, g + 0.47, OUT, true, true); // Mâu (the viewer's left)
  cat(s, f, BA, BW - 0.03, g + 0.47, OUT); // Mel
  corgi(s, f, BA - 0.5, BW - 0.03, g + 0.47, OUT, false, true); // Hồng
  rattanChair(s, f, 2.55, -2.55, g);
  rattanChair(s, f, 0.55, -2.55, g);
  st.color = rgb(WOOD_DARK); // the table
  fbox(st, f, 1.2, 1.9, -2.85, -2.35, g + 0.42, g + 0.46);
  for (const [a, w] of [[1.24, -2.81], [1.86, -2.81], [1.24, -2.39], [1.86, -2.39]] as const) fbox(st, f, a - 0.02, a + 0.02, w - 0.02, w + 0.02, g, g + 0.42);
  solid(1.2, 1.9, -2.85, -2.35, g + 0.46);
  st.color = rgb(WHITE); // floor fan: base, pole, round head facing the lane
  const [FA, FW] = [0.5, -3.3];
  lathe(st, f, FA, FW, [[0.2, g], [0.19, g + 0.05], [0.03, g + 0.06], [0.025, g + 0.55], [0, g + 0.56]], 10);
  vdisc(st, f, FA, g + 0.82, FW + 0.02, 0.3, 16, OUT);
  vdisc(st, f, FA, g + 0.82, FW - 0.02, 0.3, 16, [-OUT[0], 0, -OUT[2]]);
  st.color = rgb('#2d2d2d');
  vdisc(st, f, FA, g + 0.82, FW - 0.035, 0.26, 16, OUT);
  st.color = rgb('#9a9a94');
  for (let k = 0; k < 8; k++) { // grille spokes
    const u = (k / 8) * Math.PI;
    const [ca, sa] = [Math.cos(u) * 0.25, Math.sin(u) * 0.25];
    card(st, f, FA - ca, FA + ca, g + 0.82 - sa, g + 0.82 + sa, FW - 0.04, OUT);
  }
  gem(st, P(f, FA, g + 0.82, FW - 0.04), 0.04);
  s.prism([ring(f, FA, FW, 0.2, 0, 8).flatMap((p) => [p[0], p[2]])], g, g + 1.1);
  youngTree(s, f, 0.0, -2.4, g);

  const out = s.out();
  return image ? { ...out, textures: [{ material: 'mural', image }] } : out;
};
