// Leg 3 landmark details, part 13: La Boutique Tintin, Rue de la Colline / Heuvelstraat 13 (the Tintin shop, ≈ 80 m from the
// Grand-Place), built after two photos (2026-10-30). The OSM house way/224509547 (address node n/10599227011 on its front) keeps
// its BuildingBuilder body (town, roof at the main cornice 13.3 m); the 5.8 m front (SSE, onto Rue de la Colline) is re-dressed
// proud of the body wall: a deep arcaded shopfront of four grey piers in banded ashlar on dark blue-grey plinths with dark
// louvre strips on their flanks, three bays (a dark recess with the orange "TINTIN" poster, the lit display case with Tintin +
// Snowy, the glazed entrance with the lit shop inside), a stone lintel + cornice band carrying the perforated-metal sign plate
// "LA BOUTIQUE TINTIN", the hanging orange blade sign, a wrought lamp bracket on the right; three cream rendered upper floors
// of recessed spandrel panels, stone sills and three white casements each; slate roof slope (not in the photos: estimated).
// Sign plate, blade, poster and the two bay interiors are one OffscreenCanvas atlas on the 'mural' material (BuildOut.textures,
// like m.ts); without OffscreenCanvas (Node tests) they stay plain. Details are never solid (SPEC §5.9): the body's colliders only.
// Frame (k.ts wallFrame): a along the front (+a = the viewer's right from the street), w toward the street, origin at the middle.
import type { LandmarkId } from '../../geo/chunkData.ts';
import type { BuildOut } from '../buildTypes.ts';
import type { V3 } from '../geom.ts';
import { cap, fbox, type Fr, P, rgb, UP, withExtras } from './b.ts';
import { bar, rlathe, town } from './d.ts';
import type { DetailFn } from './index.ts';
import { wallFrame } from './k.ts';
import { quadOut } from './kit.ts';
import { Sink } from './parts.ts';

type Buf = Parameters<typeof quadOut>[0];

const FRONT: [number, number] = [78.75, 6.89]; // middle vertex of the front of way/224509547 (81.11,5.22)→(76.39,8.55)
const H = 2.89; // half width of the front
const PW = 0.68; // pier width; 4 piers, 3 bays (photo 14: pier ≈ 2/3 of a bay)
const BW = (2 * H - 4 * PW) / 3;
const PIER_TOP = 3.3; // piers from the plinth top to the lintel
const CORNICE = 13.3; // main cornice above the front's ground
const FLOOR = (CORNICE - 4.3) / 3; // the three upper floors, from the ground-floor cornice
const GREY = ['#a7a8a4', '#9d9e9a', '#b0b1ad']; // banded ashlar tones
const DARK = '#2a2b2d';
const CREAM = '#e6e0d0';
const bayA = (k: number) => -H + PW + k * (PW + BW); // left edge of bay k
const bayC = (k: number) => bayA(k) + BW / 2;

// Atlas (px): display case crop 270 × 768 ≙ 0.92 × 2.35 m, shop interior crop 240 × 768 ≙ 0.92 × 3 m, sign strip 1024 × 160 ≙
// 2.3 × 0.75 m, blade sign 256 × 256, poster 256 × 320.
const [AW, AH] = [1024, 1280];
const DISPLAY: [number, number, number, number] = [20, 0, 270, 768];
const INTERIOR: [number, number, number, number] = [512, 0, 240, 768];
const SIGN: [number, number, number, number] = [0, 768, 1024, 160];
const BLADE: [number, number, number, number] = [0, 928, 256, 256];
const POSTER: [number, number, number, number] = [256, 928, 256, 320];

/** Tintin's head (cream face, quiff, eyes) + Snowy, scaled to a box; the shop logo on the blade / poster. */
function logo(g: OffscreenCanvasRenderingContext2D, x: number, y: number, s: number) {
  g.fillStyle = '#fbe7c6';
  g.beginPath(), g.ellipse(x, y, s * 0.22, s * 0.26, 0, 0, 7), g.fill(); // face
  g.fillStyle = '#c8641e'; // hair cap + the swept-back quiff
  g.beginPath(), g.ellipse(x, y - s * 0.14, s * 0.23, s * 0.14, 0, Math.PI, 2 * Math.PI), g.fill();
  g.beginPath(), g.moveTo(x - s * 0.06, y - s * 0.24), g.quadraticCurveTo(x + s * 0.02, y - s * 0.6, x + s * 0.3, y - s * 0.5), g.quadraticCurveTo(x + s * 0.14, y - s * 0.42, x + s * 0.2, y - s * 0.2), g.closePath(), g.fill();
  g.fillStyle = '#1b1b1d';
  for (const dx of [-0.07, 0.07]) g.beginPath(), g.ellipse(x + dx * s, y - s * 0.02, s * 0.018, s * 0.03, 0, 0, 7), g.fill();
  g.beginPath(), g.ellipse(x, y + s * 0.13, s * 0.05, s * 0.012, 0, 0, 7), g.fill(); // mouth
  g.fillStyle = '#fff';
  g.beginPath(), g.ellipse(x + s * 0.36, y + s * 0.2, s * 0.13, s * 0.09, 0, 0, 7), g.fill(); // Snowy body
  g.beginPath(), g.ellipse(x + s * 0.47, y + s * 0.1, s * 0.07, s * 0.07, 0, 0, 7), g.fill();
  g.fillStyle = '#1b1b1d';
  g.beginPath(), g.ellipse(x + s * 0.52, y + s * 0.1, s * 0.015, s * 0.015, 0, 0, 7), g.fill();
}

/** The painted atlas; undefined without OffscreenCanvas. */
function paintAtlas(): ImageBitmap | undefined {
  if (typeof OffscreenCanvas === 'undefined') return;
  const c = new OffscreenCanvas(AW, AH);
  const g = c.getContext('2d');
  if (!g) return;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const FONT = '"Futura", "Century Gothic", "Avenir Next", "Avenir", Arial, sans-serif';
  // ── display case: warm white interior, spotlight rail on the right, Tintin (≈ 1 m) + Snowy on the floor ──
  const [dx, dy, dw, dh] = [0, 0, 512, 768];
  const grad = g.createLinearGradient(0, dy, 0, dy + dh);
  grad.addColorStop(0, '#f7efdc'), grad.addColorStop(1, '#efe2c4');
  g.fillStyle = grad;
  g.fillRect(dx, dy, dw, dh);
  g.fillStyle = '#9a4a3a';
  g.fillRect(dx, dy + dh - 28, dw, 28); // red tile floor
  for (let k = 0; k < 6; k++) { // spot lamps on a vertical rail
    g.fillStyle = '#6a6c6e';
    g.fillRect(dx + 262, dy + 120 + k * 100, 26, 8);
    g.fillStyle = '#fff3c4';
    g.beginPath(), g.ellipse(dx + 258, dy + 124 + k * 100, 9, 9, 0, 0, 7), g.fill();
  }
  const px = 236; // px per m of figure
  const [fx, fy] = [dx + 140, dy + dh - 28]; // Tintin's feet
  g.fillStyle = '#5a3a1e';
  for (const s of [-1, 1]) g.fillRect(fx + s * 30 - 22, fy - 18, 44, 18); // shoes
  g.fillStyle = '#f4f4f4';
  for (const s of [-1, 1]) g.fillRect(fx + s * 24 - 16, fy - 40, 32, 24); // socks
  g.fillStyle = '#8a5a2b';
  g.fillRect(fx - 54, fy - 0.62 * px, 108, 0.62 * px - 40); // plus-fours
  g.fillStyle = '#3f7fc9';
  g.fillRect(fx - 60, fy - 1.05 * px, 120, 0.44 * px); // sweater
  g.fillRect(fx - 88, fy - 1.02 * px, 28, 0.36 * px); // arms
  g.fillRect(fx + 60, fy - 1.02 * px, 28, 0.36 * px);
  g.fillStyle = '#f4cfa8';
  g.fillRect(fx - 88, fy - 0.66 * px, 28, 26); // hands
  g.fillRect(fx + 60, fy - 0.66 * px, 28, 26);
  g.fillStyle = '#f4f4f4';
  g.fillRect(fx - 40, fy - 1.07 * px, 80, 16); // collar
  g.fillStyle = '#f4cfa8';
  g.beginPath(), g.ellipse(fx, fy - 1.2 * px, 34, 40, 0, 0, 7), g.fill(); // head
  g.fillStyle = '#e0803a';
  g.beginPath(), g.ellipse(fx, fy - 1.3 * px, 36, 24, 0, Math.PI, 2 * Math.PI), g.fill(); // hair
  g.beginPath(), g.moveTo(fx - 10, fy - 1.36 * px), g.quadraticCurveTo(fx + 10, fy - 1.62 * px, fx + 40, fy - 1.5 * px), g.quadraticCurveTo(fx + 22, fy - 1.46 * px, fx + 30, fy - 1.34 * px), g.closePath(), g.fill(); // quiff
  g.fillStyle = '#1b1b1d';
  for (const s of [-1, 1]) g.beginPath(), g.ellipse(fx + s * 12, fy - 1.21 * px, 3, 5, 0, 0, 7), g.fill();
  g.fillStyle = '#fff'; // Snowy, right of Tintin
  g.beginPath(), g.ellipse(fx + 100, fy - 34, 36, 26, 0, 0, 7), g.fill();
  g.beginPath(), g.ellipse(fx + 128, fy - 58, 20, 19, 0, 0, 7), g.fill();
  g.beginPath(), g.moveTo(fx + 68, fy - 44), g.lineTo(fx + 52, fy - 78), g.lineTo(fx + 78, fy - 54), g.closePath(), g.fill(); // tail
  for (const s of [-1, 1]) g.fillRect(fx + 96 + s * 13 - 6, fy - 20, 12, 20); // legs
  g.fillStyle = '#1b1b1d';
  g.beginPath(), g.ellipse(fx + 146, fy - 62, 5, 4, 0, 0, 7), g.fill(); // nose
  g.beginPath(), g.ellipse(fx + 128, fy - 64, 3, 3, 0, 0, 7), g.fill(); // eye
  // ── shop interior: cream walls, pendant lamps, bookshelves on the left, the red TINTIN / HERGÉ panel on the right ──
  const [ix, iy, iw, ih] = INTERIOR;
  g.fillStyle = '#efe3c8';
  g.fillRect(ix, iy, iw, ih);
  g.fillStyle = '#9a4a3a';
  g.fillRect(ix, iy + ih - 28, iw, 28);
  for (let k = 0; k < 4; k++) { // pendant lamps
    g.fillStyle = '#3a3a3a';
    g.fillRect(ix + 30 + k * 60, iy, 3, 100);
    g.fillStyle = '#fff1bf';
    g.beginPath(), g.ellipse(ix + 31 + k * 60, iy + 112, 13, 16, 0, 0, 7), g.fill();
  }
  for (let r = 0; r < 4; r++) { // shelves with book spines
    g.fillStyle = '#5a4a3a';
    g.fillRect(ix + 12, iy + 260 + r * 110, 100, 8);
    for (let k = 0; k < 5; k++) {
      g.fillStyle = ['#d9342b', '#2b5fb3', '#f0b429', '#2f9e5c', '#f4f4f4', '#d9342b'][(k + r) % 6]!;
      g.fillRect(ix + 16 + k * 19, iy + 190 + r * 110, 15, 70);
    }
  }
  g.fillStyle = '#e63c2e';
  g.fillRect(ix + 128, iy + 230, 100, 330);
  g.fillStyle = '#fff';
  g.font = `bold 34px ${FONT}`;
  g.fillText('TINTIN', ix + 178, iy + 300, 92);
  g.font = `bold 26px ${FONT}`;
  g.fillText('HERGÉ', ix + 178, iy + 360, 92);
  g.font = `16px ${FONT}`;
  g.fillText('LES AVENTURES', ix + 178, iy + 420, 92);
  // ── sign strip: perforated metal plate, raised brushed-metal letters with a shadow ──
  const [sx, sy, sw, sh] = SIGN;
  g.fillStyle = '#8c8f93';
  g.fillRect(sx, sy, sw, sh);
  g.fillStyle = '#6b6e72';
  for (let y = 6; y < sh; y += 9) for (let x = 6 + (y % 18 ? 0 : 4); x < sw; x += 9) g.beginPath(), g.ellipse(sx + x, sy + y, 2.2, 2.2, 0, 0, 7), g.fill();
  g.font = `bold 108px ${FONT}`;
  g.fillStyle = '#4a4d50';
  g.fillText('LA BOUTIQUE TINTIN', sx + sw / 2 + 4, sy + sh / 2 + 10, sw - 60);
  g.fillStyle = '#d8dadc';
  g.fillText('LA BOUTIQUE TINTIN', sx + sw / 2, sy + sh / 2 + 6, sw - 60);
  // ── blade sign: orange square, the logo, "TINTIN" on a dark-blue band ──
  const [bx, by, bw, bh] = BLADE;
  g.fillStyle = '#f28c28';
  g.fillRect(bx, by, bw, bh);
  logo(g, bx + 110, by + 110, 170);
  g.fillStyle = '#1b2a5a';
  g.fillRect(bx, by + 196, bw, 60);
  g.fillStyle = '#fff';
  g.font = `bold 46px ${FONT}`;
  g.fillText('TINTIN', bx + bw / 2, by + 228);
  // ── poster: dark frame, orange, the logo, "TINTIN" below ──
  const [qx, qy, qw, qh] = POSTER;
  g.fillStyle = DARK;
  g.fillRect(qx, qy, qw, qh);
  g.fillStyle = '#f28c28';
  g.fillRect(qx + 10, qy + 10, qw - 20, qh - 20);
  logo(g, qx + 100, qy + 130, 190);
  g.fillStyle = '#1b1b1d';
  g.font = `bold 58px ${FONT}`;
  g.fillText('TINTIN', qx + qw / 2, qy + 262);
  return c.transferToImageBitmap();
}

/** Quad (a0..a1 × y0..y1) at depth w facing the street; uv from an atlas cell (px) when given. */
function plate(buf: Buf, f: Fr, a0: number, a1: number, y0: number, y1: number, w: number, cell?: [number, number, number, number]) {
  const [u0, v0, u1, v1] = cell ? [cell[0] / AW, (cell[1] + cell[3]) / AH, (cell[0] + cell[2]) / AW, cell[1] / AH] : [0, 0, 1, 1];
  buf.quad(P(f, a0, y0, w), P(f, a1, y0, w), P(f, a1, y1, w), P(f, a0, y1, w), u0, v0, u1, v1); // a→b→c→d is outward for +a = right
}

/** Quad in the plane a = const (w0..w1 × y0..y1), both faces, uv from an atlas cell: the blade sign. */
function blade(buf: Buf, f: Fr, a: number, w0: number, w1: number, y0: number, y1: number, cell: [number, number, number, number]) {
  const [u0, v0, u1, v1] = [cell[0] / AW, (cell[1] + cell[3]) / AH, (cell[0] + cell[2]) / AW, cell[1] / AH];
  const q = [P(f, a, y0, w1), P(f, a, y0, w0), P(f, a, y1, w0), P(f, a, y1, w1)] as [V3, V3, V3, V3];
  quadOut(buf, ...q, [f.ux, 0, f.uz], u0, v0, u1, v1);
  quadOut(buf, q[1], q[0], q[3], q[2], [-f.ux, 0, -f.uz], u1, v0, u0, v1);
}

const tintin: DetailFn = (rec, _parts, ctx) => {
  const f = wallFrame(rec.outer, FRONT);
  const p0 = P(f, 0, 0, 1);
  const g = ctx.height(p0[0], p0[2]);
  const base: BuildOut = town(rec, ctx, { height: CORNICE });
  const s = new Sink();
  const st = s.buf('masonry');
  const near = s.buf('masonry', 'near');
  const gl = s.buf('metal');
  const iron = s.buf('metal');
  const mural = s.buf('mural');
  const image = paintAtlas();

  // ── ground floor: backing, red tile arcade floor, four piers (plinth, banded ashlar, louvre strips on the flanks) ──
  st.color = rgb(DARK);
  plate(st, f, -H, H, g - 0.3, g + PIER_TOP, 0.02); // dark backing behind the bays (hides the body's own shopfront)
  st.color = rgb('#9a4a3a');
  fbox(st, f, -H, H, 0, 0.6, g - 0.3, g + 0.02); // arcade floor
  for (let k = 0; k < 4; k++) {
    const a0 = -H + k * (PW + BW);
    const a1 = a0 + PW;
    st.color = rgb('#4d5560');
    fbox(st, f, a0 - 0.03, a1 + 0.03, 0, 0.6, g - 0.3, g + 0.65); // dark blue-grey plinth
    st.color = rgb(GREY[1]!);
    fbox(st, f, a0, a1, 0, 0.5, g + 0.65, g + PIER_TOP); // pier core (far LOD)
    for (let y = g + 0.65, row = 0; y < g + PIER_TOP - 0.01; y += 0.44, row++) { // banded ashlar: 0.4 m courses, 0.04 m grooves
      near.color = rgb(GREY[row % 3]!);
      fbox(near, f, a0, a1, 0, 0.56 - (row % 2) * 0.03, y, Math.min(y + 0.4, g + PIER_TOP));
    }
    for (const [a, sg] of [[a0, -1], [a1, 1]] as const) { // louvre strips on the flanks facing the bays
      if ((k === 0 && sg < 0) || (k === 3 && sg > 0)) continue;
      near.color = rgb('#3a3d41');
      fbox(near, f, a, a + sg * 0.05, 0.06, 0.5, g + 0.65, g + PIER_TOP);
      near.color = rgb('#5a5e63');
      for (let y = g + 0.8; y < g + PIER_TOP - 0.1; y += 0.22) fbox(near, f, a, a + sg * 0.07, 0.08, 0.48, y, y + 0.035); // slats
    }
  }
  // bays: left = dark recess with the poster, centre = lit display case, right = glazed entrance with the lit shop inside
  const [l0, l1] = [bayA(0) + 0.05, bayA(0) + BW - 0.05];
  if (image) plate(mural, f, bayC(0) - 0.28, bayC(0) + 0.28, g + 1.5, g + 2.2, 0.08, POSTER);
  else { st.color = rgb('#f28c28'); plate(st, f, bayC(0) - 0.28, bayC(0) + 0.28, g + 1.5, g + 2.2, 0.08); }
  st.color = rgb('#55585c');
  fbox(st, f, l0, l1, 0.02, 0.06, g + 3.0, g + PIER_TOP); // soffit band over the recess
  const [c0, c1] = [bayA(1) + 0.05, bayA(1) + BW - 0.05];
  if (image) plate(mural, f, c0, c1, g + 0.65, g + 3.0, 0.05, DISPLAY);
  else { st.color = rgb('#f3ead6'); plate(st, f, c0, c1, g + 0.65, g + 3.0, 0.05); }
  st.color = rgb('#4a4d50'); // display case frame: 2 × 4 panes
  for (const a of [c0, (c0 + c1) / 2, c1]) fbox(st, f, a - 0.025, a + 0.025, 0.06, 0.13, g + 0.65, g + 3.0);
  for (const y of [g + 0.65, g + 1.25, g + 1.85, g + 2.45, g + 2.97]) fbox(st, f, c0, c1, 0.06, 0.13, y - 0.02, y + 0.03);
  fbox(st, f, c0, c1, 0.02, 0.1, g + 0.65, g + 0.75); // case base
  st.color = rgb(DARK);
  fbox(st, f, c0, c1, 0.02, 0.06, g + 3.0, g + PIER_TOP);
  const [r0, r1] = [bayA(2) + 0.05, bayA(2) + BW - 0.05];
  if (image) plate(mural, f, r0, r1, g + 0.02, g + 3.0, 0.05, INTERIOR);
  else { st.color = rgb('#efe3c8'); plate(st, f, r0, r1, g + 0.02, g + 3.0, 0.05); }
  st.color = rgb('#4a4d50'); // double glass door + transom
  for (const a of [r0, (r0 + r1) / 2, r1]) fbox(st, f, a - 0.03, a + 0.03, 0.06, 0.15, g, g + 3.0);
  fbox(st, f, r0, r1, 0.06, 0.15, g + 2.3, g + 2.38);
  fbox(st, f, r0, r1, 0.06, 0.15, g + 2.94, g + 3.0);
  gl.color = rgb('#30383f');
  plate(gl, f, r0, r1, g + 2.38, g + 2.94, 0.1); // dark transom glass
  iron.color = rgb('#8a8d90');
  for (const sg of [-1, 1]) bar(iron, P(f, (r0 + r1) / 2 + sg * 0.1, g + 0.85, 0.19), P(f, (r0 + r1) / 2 + sg * 0.1, g + 1.55, 0.19), 0.025); // handles
  st.color = rgb(DARK);
  fbox(st, f, r0, r1, 0.02, 0.06, g + 3.0, g + PIER_TOP);

  // ── lintel beam, sign plate, ground-floor cornice band ──
  st.color = rgb(GREY[2]!);
  fbox(st, f, -H - 0.05, H + 0.05, 0, 0.52, g + PIER_TOP, g + 3.85);
  st.color = rgb(GREY[0]!);
  fbox(st, f, -H - 0.05, H + 0.05, 0, 0.6, g + 3.85, g + 4.1);
  fbox(st, f, -H - 0.05, H + 0.05, 0, 0.7, g + 4.1, g + 4.3);
  st.color = rgb('#55585c');
  fbox(st, f, -1.15, 1.15, 0.5, 0.64, g + 3.35, g + 4.1); // plate body (the letters' shadow depth)
  if (image) plate(mural, f, -1.15, 1.15, g + 3.35, g + 4.1, 0.645, SIGN);

  // ── upper floors: cream render, 4 recessed spandrel panels + stone sill + 3 white casements with an iron rail per floor ──
  st.color = rgb(CREAM);
  plate(st, f, -H, H, g + 4.3, g + CORNICE, 0.08);
  for (let fl = 0; fl < 3; fl++) {
    const yb = g + 4.3 + fl * FLOOR;
    for (const c of [-2.17, -0.72, 0.72, 2.17]) { // recessed panels: darker inset, shadow lines on top / left
      near.color = rgb('#d6cfbd');
      plate(near, f, c - 0.5, c + 0.5, yb + 0.15, yb + 0.85, 0.085);
      near.color = rgb('#8f8a7c');
      plate(near, f, c - 0.5, c + 0.5, yb + 0.79, yb + 0.85, 0.09);
      plate(near, f, c - 0.5, c - 0.44, yb + 0.15, yb + 0.85, 0.09);
    }
    st.color = rgb('#b4b3ad');
    fbox(st, f, -H, H, 0, 0.14, yb + 0.85, yb + 1.0); // stone sill course
    for (const c of [bayC(0), 0, bayC(2)]) { // casements 0.85 × 1.65: white frame, cross, dark glass, iron rail
      const [a0, a1, y0, y1] = [c - 0.425, c + 0.425, yb + 1.0, yb + 2.65];
      st.color = rgb('#eeece6');
      for (const [p, q] of [[a0 - 0.06, a0], [a1, a1 + 0.06], [c - 0.025, c + 0.025]]) fbox(st, f, p!, q!, 0, 0.1, y0, y1 + 0.06);
      fbox(st, f, a0 - 0.06, a1 + 0.06, 0, 0.1, y1, y1 + 0.06);
      fbox(st, f, a0, a1, 0, 0.1, y0 + (y1 - y0) * 0.6, y0 + (y1 - y0) * 0.6 + 0.05);
      gl.color = rgb('#263039');
      plate(gl, f, a0, a1, y0, y1, 0.03);
      iron.color = rgb('#1e2124');
      bar(iron, P(f, a0 - 0.06, y0 + 0.8, 0.17), P(f, a1 + 0.06, y0 + 0.8, 0.17), 0.03);
      for (let a = a0; a <= a1 + 0.01; a += 0.17) bar(iron, P(f, a, y0, 0.17), P(f, a, y0 + 0.8, 0.17), 0.02);
    }
  }
  // main cornice (two steps) + slate roof slope over the flat body roof (not in the photos: estimated)
  st.color = rgb('#b4b3ad');
  fbox(st, f, -H - 0.1, H + 0.1, 0, 0.3, g + CORNICE, g + CORNICE + 0.25);
  fbox(st, f, -H - 0.1, H + 0.1, 0, 0.45, g + CORNICE + 0.25, g + CORNICE + 0.5);
  const slate = s.buf('masonry');
  slate.color = rgb('#3d4248');
  quadOut(slate, P(f, -H, g + CORNICE + 0.5, 0.2), P(f, H, g + CORNICE + 0.5, 0.2), P(f, H, g + CORNICE + 3.0, -2.5), P(f, -H, g + CORNICE + 3.0, -2.5), [-f.uz, 0.6, f.ux]);
  fbox(slate, f, -H, H, -2.7, -2.3, g + CORNICE + 0.5, g + CORNICE + 3.2);
  cap(slate, [P(f, -H, g + CORNICE + 3.0, -2.5), P(f, -H, g + CORNICE + 3.2, -2.7), P(f, H, g + CORNICE + 3.2, -2.7), P(f, H, g + CORNICE + 3.0, -2.5)], UP);

  // ── blade sign on a bracket at first-floor level, right of the plate; wrought lamp bracket at the right end ──
  iron.color = rgb('#1e2124');
  const arm = (a: number, y: number, w: number): V3 => P(f, a, y, w);
  bar(iron, arm(1.05, g + 6.3, 0.08), arm(1.05, g + 6.3, 0.95), 0.04);
  bar(iron, arm(1.05, g + 5.7, 0.08), arm(1.05, g + 6.3, 0.8), 0.025);
  for (const w of [0.38, 0.88]) bar(iron, arm(1.05, g + 6.3, w), arm(1.05, g + 5.97, w), 0.02);
  if (image) blade(mural, f, 1.05, 0.35, 0.9, g + 5.42, g + 5.97, BLADE);
  else { st.color = rgb('#f28c28'); fbox(st, f, 1.03, 1.07, 0.35, 0.9, g + 5.42, g + 5.97); }
  const la = H - 0.45;
  bar(iron, arm(la, g + 5.3, 0.1), arm(la, g + 6.2, 0.85), 0.045);
  bar(iron, arm(la, g + 4.95, 0.1), arm(la, g + 5.65, 0.55), 0.03);
  bar(iron, arm(la, g + 5.65, 0.55), arm(la, g + 6.2, 0.85), 0.03);
  bar(iron, arm(la, g + 6.2, 0.85), arm(la, g + 6.55, 0.85), 0.03);
  bar(iron, arm(la, g + 4.95, 0.1), arm(la, g + 6.3, 0.1), 0.04); // wall plate
  gl.color = rgb('#dfe6c9');
  fbox(gl, f, la - 0.13, la + 0.13, 0.72, 0.98, g + 5.75, g + 6.2); // lantern glass
  rlathe(iron, f, la, 0.85, [[0.2, g + 6.2], [0.09, g + 6.38], [0.03, g + 6.6]], 4); // cap
  rlathe(iron, f, la, 0.85, [[0.16, g + 5.68], [0.05, g + 5.75]], 4);

  const out = withExtras(base, s);
  return image ? { ...out, textures: [...(out.textures ?? []), { material: 'mural', image }] } : out;
};

export const details: Partial<Record<LandmarkId, DetailFn>> = { 'boutique-tintin': tintin };
