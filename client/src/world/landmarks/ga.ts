// ── Ga Hà Nội (120 Lê Duẩn; OSM way/220305168 in chunk −5_3: outline x −1160…−1134, z 733…1008, the 4-level part z 863–894 is
// the hall, its east face at x −1134.4; Đường Lê Duẩn runs north–south at x ≈ −1107, 3 lanes one-way, so the façade faces EAST
// onto a forecourt that reaches the west sidewalk's kerb at x ≈ −1115.7). After the owner's three photos (front from Lê Duẩn,
// aerial, oblique from the south-east): the 1976 hall is a 31 × 26 m three-storey modernist block under a flat grey concrete
// slab with a deep 1.6 m fascia overhanging 2.4 m at the front; its east face is a screen of square concrete breeze blocks
// (0.45 m cells, a diamond ring in each) in four 4.95 m bays + a 7.5 m dark centre bay between six white piers; on the centre
// bay a round clock (red rim, white face) and the red letters "GA HÀ NỘI"; a blue Đường sắt Việt Nam banner across the first
// floor; the ground floor is a dark glazed entrance hall under a 4 m canopy whose fascia carries the white strip "GA HÀ NỘI –
// KÍNH CHÀO QUÝ KHÁCH / WELCOME TO HANOI RAILWAY STATION", a red LED board over the doors. The 1902 wings (the outline north
// and south of the hall, recessed 3.3 / 5.9 m behind its face) are two-storey ochre colonial blocks: white floor band, cornice
// and parapet, white-framed windows every 3.6 m, a dark pergola canopy with a green trellis roof over the ground floor, split
// ACs, stainless water tanks on the south roof, a low grey hip roof behind the parapet. Forecourt: asphalt car park out to the
// kerb, perpendicular bays with parked cars in front of both wings, a Hà Nội bus in the lane, parked motorbikes under the
// pergolas, a zebra from the kerb to the entrance, two light masts, a white railing on the kerb with two car gaps.
// Frame: origin = middle of the hall's east face (world (−1134.4, 878.9) = 21.02427 N, 105.84106 E), a = north (the viewer on
// Lê Duẩn looking west has +a on his RIGHT), w = east (out of the façade, towards the street). Lattice, clock, letters, banner,
// strip and LED are ONE OffscreenCanvas atlas on 'mural' (this chunk's only mural user); without OffscreenCanvas the panels
// stay plain grey. Solid (Sink.prism): hall, wings, canopy columns, pergola posts, cars, bus, masts, railing; the clue box spot
// GA_BOX (a 0, w 1.8: under the canopy in front of the middle door) stays clear within 4 m. ≈ 30k tris.
import type { MeshBuffer as Buf, V3 } from '../geom.ts';
import { pushMatrix } from '../StreetProps.ts';
import { cap, DOWN, fbox, type Fr, P, rgb, UP } from './b.ts';
import { hcyl, lathe } from './d.ts';
import { frameAt } from './h3.ts';
import type { DetailFn } from './index.ts';
import { quadOut, triOut } from './kit.ts';
import { Sink } from './parts.ts';

/** Middle of the hall's east face (world x, z). */
export const GA: [number, number] = [-1134.4, 878.9];
/** Clue box spot: under the canopy, in front of the middle door, 1.8 m out from the hall's east face (world x, z). */
export const GA_BOX: [number, number] = [GA[0] + 1.8, GA[1]];

const HALF = 15.45; // hall half-width along a (z 863.4 … 894.3)
const BACK = -25.6; // hall west face (x −1160)
const [LAT0, LAT1] = [5.0, 15.35]; // lattice bottom / top (23 cells of 0.45 m)
const SLAB = LAT1 + 1.6; // roof slab top (fascia 1.6 m)
const CANOPY = 4.25; // ground-floor canopy underside; its slab to 4.95
const PIERS: [number, number][] = [[-15.45, -14.85], [-9.9, -9.3], [-4.35, -3.75], [3.75, 4.35], [9.3, 9.9], [14.85, 15.45]];
const OUTER_BAYS: [number, number][] = [[-14.85, -9.9], [-9.3, -4.35], [4.35, 9.3], [9.9, 14.85]];
const WINGS = [
  { a0: HALF, a1: 146.2, front: -3.3, back: -18.5, tanks: false }, // north wing: z 732.7 … 863.4, east face x −1137.6
  { a0: -129.3, a1: -HALF, front: -5.9, back: -19.5, tanks: true }, // south wing: z 894.3 … 1008.2, east face x −1140.2
];
const PERGOLA_TO = 75; // |a| the ground-floor pergola canopies reach
const KERB = 18.7; // w of the Lê Duẩn west sidewalk kerb (centre line w ≈ 27 − 3 × 3.25 / 2 − 3.5 m sidewalk)

const CONCRETE = '#d6d4cc';
const PIER = '#ebe9e2';
const SLAB_GREY = '#a4a29b';
const OCHRE = '#d8ad55';
const WHITE = '#f1ede3';
const DARK = '#2c2e31';
const FRAME_AL = '#8e939a';
const PERGOLA = '#2f3b35';
const TRELLIS = '#3f6a4b';
const ROOF = '#8c8a84';
const CAR_PAINTS = ['#f0f0ec', '#c9ccd0', '#1e2024', '#b8322c', '#2a3f6e', '#f0f0ec', '#8f9397', '#e9e9e4'];

// ── atlas: px regions (x0, y0, x1, y1); 40 px per 0.45 m lattice cell ──
type Rect = readonly [number, number, number, number];
const [AW, AH] = [2048, 1280];
const CP = 40; // px per cell
const [COLS, ROWS] = [11, 23];
const R = {
  outer: [0, 0, COLS * CP, ROWS * CP] as Rect, // one 4.95 × 10.35 m bay
  centre: [460, 0, 1127, ROWS * CP] as Rect, // the 7.5 m centre bay with the clock and the letters
  banner: [0, 940, 1654, 1073] as Rect, // 18.6 × 1.5 m
  strip: [0, 1090, 1156, 1157] as Rect, // 13 × 0.75 m
  led: [1200, 1090, 1734, 1139] as Rect, // 6 × 0.55 m
};

/** Breeze-block lattice: `block`-coloured square frames with a diamond ring inside, over `back`. */
function lattice(g: OffscreenCanvasRenderingContext2D, x0: number, y0: number, cols: number, rows: number, back: string, block: string) {
  g.fillStyle = back;
  g.fillRect(x0, y0, cols * CP, rows * CP);
  g.fillStyle = g.strokeStyle = block;
  g.lineWidth = 5;
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const [x, y] = [x0 + i * CP, y0 + j * CP];
      g.fillRect(x, y, CP, 5);
      g.fillRect(x, y + CP - 5, CP, 5);
      g.fillRect(x, y, 5, CP);
      g.fillRect(x + CP - 5, y, 5, CP);
      g.beginPath();
      g.moveTo(x + 20, y + 8); g.lineTo(x + 32, y + 20); g.lineTo(x + 20, y + 32); g.lineTo(x + 8, y + 20); g.closePath();
      g.stroke();
    }
  }
}

function paintAtlas(): ImageBitmap | undefined {
  if (typeof OffscreenCanvas === 'undefined') return;
  const c = new OffscreenCanvas(AW, AH);
  const g = c.getContext('2d');
  if (!g) return;
  g.fillStyle = '#d9d7d0';
  g.fillRect(0, 0, AW, AH);
  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';
  // outer bays: white blocks over the grey wall behind; centre bay: white blocks over charcoal
  lattice(g, R.outer[0], R.outer[1], COLS, ROWS, '#6e7174', '#e9e7e0');
  const cw = R.centre[2] - R.centre[0];
  lattice(g, R.centre[0], R.centre[1], Math.ceil(cw / CP), ROWS, '#2f3134', '#eceae3');
  g.fillStyle = '#2f3134';
  g.fillRect(R.centre[2], 0, 8, ROWS * CP); // trim the last part-cell column
  // the clock: red rim, white face, black ticks, hands at ten past ten
  const [cx, cy, cr] = [R.centre[0] + cw / 2, 150, 100];
  g.fillStyle = '#c62a2e';
  g.beginPath(); g.arc(cx, cy, cr, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#f7f5ee';
  g.beginPath(); g.arc(cx, cy, cr - 14, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#1d1d1f';
  g.lineCap = 'round';
  for (let k = 0; k < 12; k++) {
    const t = (k / 12) * Math.PI * 2;
    g.lineWidth = k % 3 ? 4 : 7;
    g.beginPath(); g.moveTo(cx + Math.cos(t) * (cr - 22), cy + Math.sin(t) * (cr - 22)); g.lineTo(cx + Math.cos(t) * (cr - 34), cy + Math.sin(t) * (cr - 34)); g.stroke();
  }
  for (const [ang, len, wd] of [[-Math.PI / 2 - (2 * Math.PI) / 12 * 2, 48, 9], [-Math.PI / 2 + (2 * Math.PI) / 12 * 2, 70, 6]] as const) {
    g.lineWidth = wd;
    g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(ang) * len, cy + Math.sin(ang) * len); g.stroke();
  }
  g.fillStyle = '#c62a2e';
  g.beginPath(); g.arc(cx, cy, 7, 0, Math.PI * 2); g.fill();
  // the red letters, with a dark drop shadow so they read as mounted letters
  g.font = 'bold 168px "Helvetica Neue", Helvetica, Arial, sans-serif';
  g.fillStyle = '#5a1012';
  g.fillText('GA HÀ NỘI', cx + 5, 455, cw - 40);
  g.fillStyle = '#d93034';
  g.fillText('GA HÀ NỘI', cx, 448, cw - 40);
  // the blue banner: logo + ĐƯỜNG SẮT VIỆT NAM on the left, a pale picture panel with the red slogan on the right
  const [bx, by, bx1, by1] = R.banner;
  g.fillStyle = '#1a56a6';
  g.fillRect(bx, by, bx1 - bx, by1 - by);
  g.fillStyle = '#ffffff';
  g.beginPath(); g.arc(bx + 80, (by + by1) / 2, 46, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#1a56a6';
  g.beginPath(); g.arc(bx + 80, (by + by1) / 2, 34, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#ffffff';
  g.fillRect(bx + 52, (by + by1) / 2 - 5, 56, 10); // a rail across the logo
  g.textAlign = 'left';
  g.font = 'bold 58px "Helvetica Neue", Helvetica, Arial, sans-serif';
  g.fillText('ĐƯỜNG SẮT VIỆT NAM', bx + 150, by + 88, 560);
  g.fillStyle = '#dde8ee';
  g.fillRect(bx + 760, by + 14, bx1 - bx - 774, by1 - by - 28);
  g.fillStyle = '#7fa66a'; // the picture: a green field under a pale sky with a dark train
  g.fillRect(bx + 760, by1 - 46, bx1 - bx - 774, 32);
  g.fillStyle = '#2c3a4a';
  g.fillRect(bx + 790, by1 - 70, 420, 28);
  g.fillRect(bx + 790, by1 - 84, 60, 14);
  g.fillStyle = '#c8202a';
  g.textAlign = 'center';
  g.font = 'bold 54px "Helvetica Neue", Helvetica, Arial, sans-serif';
  g.fillText('AN TOÀN GIAO THÔNG LÀ HẠNH PHÚC CỦA MỌI NHÀ', bx + 760 + (bx1 - bx - 774) / 2, by + 66, bx1 - bx - 820);
  // the white strip over the entrance: blue capitals, the English line under it, a logo at each end
  const [sx, sy, sx1, sy1] = R.strip;
  g.fillStyle = '#ffffff';
  g.fillRect(sx, sy, sx1 - sx, sy1 - sy);
  g.fillStyle = '#1a4f9c';
  g.font = 'bold 36px "Helvetica Neue", Helvetica, Arial, sans-serif';
  g.fillText('GA HÀ NỘI  –  KÍNH CHÀO QUÝ KHÁCH', (sx + sx1) / 2, sy + 36, sx1 - sx - 160);
  g.font = 'bold 19px "Helvetica Neue", Helvetica, Arial, sans-serif';
  g.fillText('WELCOME TO HANOI RAILWAY STATION', (sx + sx1) / 2, sy + 60, sx1 - sx - 160);
  for (const x of [sx + 40, sx1 - 40]) {
    g.fillStyle = '#1a4f9c';
    g.beginPath(); g.arc(x, (sy + sy1) / 2, 24, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#ffffff';
    g.fillRect(x - 16, (sy + sy1) / 2 - 3, 32, 6);
  }
  // the red LED board
  const [lx, ly, lx1, ly1] = R.led;
  g.fillStyle = '#111214';
  g.fillRect(lx, ly, lx1 - lx, ly1 - ly);
  g.fillStyle = '#ff3a34';
  g.font = 'bold 30px "Helvetica Neue", Helvetica, Arial, sans-serif';
  g.fillText('CHÀO MỪNG QUÝ KHÁCH ĐẾN VỚI GA HÀ NỘI', (lx + lx1) / 2, ly + 35, lx1 - lx - 30);
  return c.transferToImageBitmap();
}

/** Cylinder with its axis along a (a0 → a1), centred at (y, w): car / bus wheels. */
function acyl(buf: Buf, f: Fr, a0: number, a1: number, y: number, w: number, r: number, n = 8) {
  const rg = (a: number): V3[] => Array.from({ length: n }, (_, k) => P(f, a, y + r * Math.cos((2 * Math.PI * k) / n), w + r * Math.sin((2 * Math.PI * k) / n)));
  const [lo, hi] = [rg(a0), rg(a1)];
  for (let k = 0; k < n; k++) {
    const m = lo[k]!;
    const c = P(f, a0, y, w);
    quadOut(buf, lo[k]!, lo[(k + 1) % n]!, hi[(k + 1) % n]!, hi[k]!, [m[0] - c[0], m[1] - c[1], m[2] - c[2]]);
  }
  cap(buf, lo, [-f.ux, 0, -f.uz]);
  cap(buf, hi, [f.ux, 0, f.uz]);
}

export const gaHaNoi: DetailFn = (_rec, _parts, ctx) => {
  const g = ctx.ground;
  const s = new Sink();
  const f = frameAt(GA[0], GA[1], 0, -1); // a = north, w = east
  const OUT: V3 = [-f.uz, 0, f.ux]; // +w: towards the street
  const IN: V3 = [f.uz, 0, -f.ux];
  const NORTH: V3 = [f.ux, 0, f.uz]; // +a
  const st = s.buf('masonry');
  const nr = s.buf('masonry', 'near');
  const paint = (hex: string, buf: Buf = st) => { buf.color = rgb(hex); return buf; };
  const solid = (a0: number, a1: number, w0: number, w1: number, y0: number, y1: number) =>
    s.prism([[P(f, a0, 0, w0), P(f, a1, 0, w0), P(f, a1, 0, w1), P(f, a0, 0, w1)].flatMap((p) => [p[0], p[2]])], y0, y1);
  const image = paintAtlas();
  const mural = image ? s.buf('mural') : undefined;
  /** Upright textured quad facing +w (the street): a0 = the viewer's left; v = 0 is the image's top row. */
  const pic = (a0: number, a1: number, y0: number, y1: number, w: number, r: Rect, fallback = '#9a9a96') => {
    const q: [V3, V3, V3, V3] = [P(f, a0, y0, w), P(f, a1, y0, w), P(f, a1, y1, w), P(f, a0, y1, w)];
    if (mural) quadOut(mural, ...q, OUT, r[0] / AW, r[3] / AH, r[2] / AW, r[1] / AH);
    else quadOut(paint(fallback), ...q, OUT);
  };
  /** Upright single-colour quad at w facing `out`. */
  const card = (buf: Buf, a0: number, a1: number, y0: number, y1: number, w: number, out: V3) =>
    quadOut(buf, P(f, a0, y0, w), P(f, a1, y0, w), P(f, a1, y1, w), P(f, a0, y1, w), out);

  // ── the hall: body, roof slab, piers, lattice bays, signs ──
  paint(CONCRETE);
  fbox(st, f, -HALF, HALF, BACK, -1.3, g, g + 4.6); // ground floor mass (the glazed front sits 0.5 m proud of it)
  fbox(st, f, -HALF, HALF, BACK, -0.8, g + 4.6, LAT1); // upper floors behind the lattice
  fbox(st, f, -4, 4, -16, -10, SLAB, SLAB + 2.6); // lift motor room on the roof
  solid(-HALF, HALF, BACK, 0, g, SLAB);
  paint(SLAB_GREY);
  fbox(st, f, -HALF - 1.8, HALF + 1.8, BACK - 1.0, 2.4, LAT1, SLAB); // the overhanging slab with its deep fascia
  paint(DARK);
  for (const sg of [-1, 1]) { // a dark vertical slot on each side face
    const q: [V3, V3, V3, V3] = [P(f, sg * (HALF + 0.01), g + 5.2, -13), P(f, sg * (HALF + 0.01), g + 5.2, -11.5), P(f, sg * (HALF + 0.01), LAT1 - 0.4, -11.5), P(f, sg * (HALF + 0.01), LAT1 - 0.4, -13)];
    quadOut(st, ...q, [NORTH[0] * sg, 0, NORTH[2] * sg]);
  }
  card(st, -14.85, 14.85, g, g + 4.6, -1.29, OUT); // the dark hall interior behind the glass
  paint(PIER);
  for (const [p0, p1] of PIERS) {
    const edge = Math.abs(p0) > 14 || Math.abs(p1) > 14;
    fbox(st, f, p0, p1, edge ? -1.3 : -0.8, 0, edge ? g : g + CANOPY, LAT1);
  }
  paint(CONCRETE);
  fbox(st, f, -HALF, HALF, -0.8, -0.1, LAT0 - 0.35, LAT0); // sill under the lattice
  for (const [a0, a1] of OUTER_BAYS) pic(a0, a1, LAT0, LAT1, -0.35, R.outer);
  pic(-3.75, 3.75, LAT0, LAT1, -0.5, R.centre, '#3a3c40');
  pic(-9.3, 9.3, g + 7.2, g + 8.7, 0.12, R.banner, '#1a56a6'); // the blue banner hung over the piers
  const mast = s.buf('metal');
  paint('#9aa0a6', mast);
  lathe(mast, f, 10, -20, [[0.08, SLAB], [0.05, SLAB + 6], [0, SLAB + 6.2]], 6); // antenna mast
  // ground floor: glazed hall, aluminium mullions and door frames, the canopy on four round columns, the strip + LED signs
  card(paint('#26313a', st), -14.85, 14.85, g + 0.05, g + CANOPY, -0.8, OUT); // dark tinted glazing (the shared 'glass' material's pane texture reads as X-braces here)
  card(paint('#3c4a56', nr), -14.85, 14.85, g + 3.1, g + 3.5, -0.79, OUT); // a lighter reflection band above the transom
  paint(FRAME_AL, nr);
  for (const a of [-12.6, -10.5, -8.4, -6.3, 6.3, 8.4, 10.5, 12.6]) fbox(nr, f, a - 0.03, a + 0.03, -0.86, -0.78, g, g + CANOPY);
  fbox(nr, f, -14.85, 14.85, -0.86, -0.78, g + 3.0, g + 3.06); // transom
  for (const a of [-4, 0, 4]) { // three double doors
    for (const sg of [-1, 1]) fbox(nr, f, a + sg * 1.2 - 0.04, a + sg * 1.2 + 0.04, -0.88, -0.76, g, g + 2.8);
    fbox(nr, f, a - 1.24, a + 1.24, -0.88, -0.76, g + 2.8, g + 2.88);
    fbox(nr, f, a - 0.03, a + 0.03, -0.88, -0.76, g, g + 2.8);
  }
  pic(-3, 3, g + 3.4, g + 3.95, -0.77, R.led, '#111214');
  paint(CONCRETE);
  fbox(st, f, -HALF, HALF, -0.8, 4.0, g + CANOPY, g + 4.95); // canopy slab
  for (const a of [-12.2, -4.8, 4.8, 12.2]) {
    lathe(st, f, a, 3.3, [[0.28, g], [0.28, g + CANOPY], [0, g + CANOPY]], 10);
    solid(a - 0.3, a + 0.3, 3.0, 3.6, g, g + CANOPY);
  }
  pic(-6.5, 6.5, g + CANOPY + 0.02, g + 4.93, 4.01, R.strip, '#ffffff');

  // ── the wings ──
  const motos: number[] = [];
  for (const { a0, a1, front, back, tanks } of WINGS) {
    const TOP = g + 10.0;
    paint(OCHRE);
    fbox(st, f, a0, a1, back, front, g, TOP);
    solid(a0, a1, back, front, g, TOP);
    paint(WHITE);
    fbox(st, f, a0 - 0.05, a1 + 0.05, back - 0.05, front + 0.05, g + 4.55, g + 4.95); // floor band
    fbox(st, f, a0 - 0.1, a1 + 0.1, back - 0.1, front + 0.1, g + 9.3, g + 9.75); // cornice
    for (const [w0, w1] of [[front - 0.25, front], [back, back + 0.25]] as const) fbox(st, f, a0, a1, w0, w1, TOP, TOP + 0.7); // parapet
    for (const [b0, b1] of [[a0, a0 + 0.25], [a1 - 0.25, a1]] as const) fbox(st, f, b0, b1, back, front, TOP, TOP + 0.7);
    paint(ROOF); // low hip roof behind the parapet
    const mid = (front + back) / 2;
    const [e0, e1, r0, r1] = [a0 + 0.4, a1 - 0.4, a0 + 3, a1 - 3];
    quadOut(st, P(f, e0, TOP + 0.1, front - 2), P(f, e1, TOP + 0.1, front - 2), P(f, r1, TOP + 2.3, mid), P(f, r0, TOP + 2.3, mid), [OUT[0], 1, OUT[2]]);
    quadOut(st, P(f, e0, TOP + 0.1, back + 2), P(f, e1, TOP + 0.1, back + 2), P(f, r1, TOP + 2.3, mid), P(f, r0, TOP + 2.3, mid), [IN[0], 1, IN[2]]);
    triOut(st, P(f, e1, TOP + 0.1, front - 2), P(f, e1, TOP + 0.1, back + 2), P(f, r1, TOP + 2.3, mid), [NORTH[0], 1, NORTH[2]]);
    triOut(st, P(f, e0, TOP + 0.1, front - 2), P(f, e0, TOP + 0.1, back + 2), P(f, r0, TOP + 2.3, mid), [-NORTH[0], 1, -NORTH[2]]);
    // windows every 3.6 m on both long faces: white frame proud 8 cm, dark glass; ground-floor doors / shop windows at the front
    let k = 0;
    for (let a = a0 + 2.0; a + 1.0 < a1 - 0.8; a += 3.6, k++) {
      for (const [w, out] of [[front, OUT], [back, IN]] as const) {
        const d = out === OUT ? 1 : -1;
        paint(WHITE, nr);
        fbox(nr, f, a - 0.78, a + 0.78, Math.min(w, w + d * 0.08), Math.max(w, w + d * 0.08), g + 5.95, g + 8.45);
        card(paint(DARK, nr), a - 0.65, a + 0.65, g + 6.05, g + 8.35, w + d * 0.085, out);
        paint(WHITE, nr);
        fbox(nr, f, a - 0.95, a + 0.95, Math.min(w, w + d * 0.14), Math.max(w, w + d * 0.14), g + 5.85, g + 5.95); // sill
      }
      const door = k % 3 === 1;
      paint(WHITE, nr);
      fbox(nr, f, a - 1.0, a + 1.0, front, front + 0.06, g, g + 3.0);
      card(paint(door ? '#4a5a63' : DARK, nr), a - 0.9, a + 0.9, g + 0.05, g + 2.9, front + 0.065, OUT);
      if (k % 3 === 2) { // a split AC under the first-floor window
        paint('#eceae2', nr);
        fbox(nr, f, a + 1.0, a + 1.8, front + 0.02, front + 0.32, g + 5.3, g + 5.85);
      }
      if (Math.abs(a) <= PERGOLA_TO) { // pergola post in line with the window
        paint(PERGOLA);
        fbox(st, f, a - 0.11, a + 0.11, front + 2.9, front + 3.12, g, g + 3.5);
        solid(a - 0.11, a + 0.11, front + 2.9, front + 3.12, g, g + 3.5);
        if (k % 2 === 0 && Math.abs(a) > HALF + 3) { // a row of parked motorbikes under the canopy, noses to the wall
          for (let m = 0; m < 5; m++) pushMatrix(motos, ...((p: V3) => [p[0], g + 0.05, p[2]] as const)(P(f, a - 1.4 + m * 0.72, 0, front + 1.3)), -Math.PI / 2, 0.96 + 0.08 * (m % 2));
        }
      }
    }
    // the pergola canopy: a dark beam on the posts, the green trellis roof sloping from the wall
    const [c0, c1] = [Math.max(a0, -PERGOLA_TO), Math.min(a1, PERGOLA_TO)];
    if (c1 - c0 > 4) {
      paint(PERGOLA);
      fbox(st, f, c0, c1, front + 2.86, front + 3.16, g + 3.3, g + 3.62);
      fbox(st, f, c0, c1, front + 3.16, front + 3.3, g + 3.5, g + 3.95); // fascia
      paint(TRELLIS);
      const q: [V3, V3, V3, V3] = [P(f, c0, g + 3.65, front + 3.3), P(f, c1, g + 3.65, front + 3.3), P(f, c1, g + 4.3, front + 0.02), P(f, c0, g + 4.3, front + 0.02)];
      quadOut(st, ...q, UP);
      quadOut(st, ...q, DOWN);
      paint(PERGOLA);
      for (let a = c0 + 0.6; a < c1; a += 1.2) quadOut(st, P(f, a - 0.04, g + 3.6, front + 3.3), P(f, a + 0.04, g + 3.6, front + 3.3), P(f, a + 0.04, g + 4.25, front + 0.02), P(f, a - 0.04, g + 4.25, front + 0.02), DOWN); // rafters
    }
    if (tanks) { // stainless water tanks on the roof, behind the front parapet
      const steel = s.buf('metal');
      paint('#c9ccd0', steel);
      for (const a of [-39, -41.6, -44.2]) {
        hcyl(steel, f, a, TOP + 1.0, 0.75, front - 6.5, front - 3.2, 10);
        paint('#7a7d80', steel);
        fbox(steel, f, a - 0.9, a + 0.9, front - 6.2, front - 3.5, TOP, TOP + 0.3);
        paint('#c9ccd0', steel);
      }
    }
  }

  // ── forecourt: asphalt to the kerb, bay markings, parked cars, the bus, the zebra, masts, flags, kerb railing ──
  const asp = s.buf('asphalt');
  quadOut(asp, P(f, -82, g + 0.05, -6.5), P(f, 82, g + 0.05, -6.5), P(f, 82, g + 0.05, KERB - 0.1), P(f, -82, g + 0.05, KERB - 0.1), UP, 0, 0, 164, KERB + 6.4);
  const mark = (a0: number, a1: number, w0: number, w1: number) =>
    quadOut(paint('#e4e2da', nr), P(f, a0, g + 0.075, w0), P(f, a1, g + 0.075, w0), P(f, a1, g + 0.075, w1), P(f, a0, g + 0.075, w1), UP);
  const car = (a: number, w: number, hex: string) => { // axis along w, 4.4 × 1.8 m, centred at (a, w)
    paint(hex, nr);
    fbox(nr, f, a - 0.9, a + 0.9, w - 2.2, w + 2.2, g + 0.36, g + 1.0);
    fbox(nr, f, a - 0.82, a + 0.82, w - 1.05, w + 1.15, g + 1.45, g + 1.52);
    paint('#1e2226', nr);
    fbox(nr, f, a - 0.8, a + 0.8, w - 1.0, w + 1.1, g + 1.0, g + 1.45);
    for (const [da, dw] of [[-0.82, -1.4], [0.82, -1.4], [-0.82, 1.4], [0.82, 1.4]] as const) acyl(nr, f, a + da - 0.1, a + da + 0.1, g + 0.33, w + dw, 0.33);
    solid(a - 0.9, a + 0.9, w - 2.2, w + 2.2, g, g + 1.5);
  };
  let n = 0;
  for (const sg of [-1, 1]) {
    for (let k = 0; k < 14; k++) { // row A: nose-in to the wings; row B: along the kerb (both skip the entrance axis)
      const a = sg * (HALF + 3.5 + k * 2.7);
      mark(a - 1.32, a - 1.2, 1.0, 6.0);
      if (k === 13) mark(a + 1.2, a + 1.32, 1.0, 6.0);
      if (k % 4 !== 2) car(a, 3.6, CAR_PAINTS[n++ % CAR_PAINTS.length]!);
    }
    for (let k = 0; k < 9; k++) {
      const a = sg * (9.5 + k * 2.7);
      if (Math.abs(a) > 25 && Math.abs(a) < 35) continue; // the car gaps in the railing
      mark(a - 1.32, a - 1.2, KERB - 6.2, KERB - 1.2);
      if (k % 3 !== 1) car(a, KERB - 3.7, CAR_PAINTS[(n++ * 3 + 1) % CAR_PAINTS.length]!);
    }
  }
  // the bus: pale yellow with a red band and a dark window band, stopped in the lane south of the entrance
  const [b0, b1, bw0, bw1] = [-30.5, -20, 10.4, 12.9];
  paint('#ece0a0', nr);
  fbox(nr, f, b0, b1, bw0, bw1, g + 0.55, g + 3.15);
  paint('#c8352c', nr);
  fbox(nr, f, b0 - 0.01, b1 + 0.01, bw0 - 0.01, bw1 + 0.01, g + 1.55, g + 1.95);
  paint('#1e2226', nr);
  for (const [w, out] of [[bw0 - 0.02, IN], [bw1 + 0.02, OUT]] as const) card(nr, b0 + 0.4, b1 - 0.4, g + 2.0, g + 2.85, w, out);
  card(nr, b0 + 0.3, b0 + 2.9, g + 0.7, g + 1.5, bw1 + 0.02, OUT); // the doors
  card(nr, b1 - 3.0, b1 - 0.4, g + 0.7, g + 1.5, bw1 + 0.02, OUT);
  for (const a of [b0 + 2.2, b1 - 2.2]) hcyl(nr, f, a, g + 0.5, 0.5, bw0 - 0.05, bw1 + 0.05, 10);
  solid(b0, b1, bw0, bw1, g, g + 3.2);
  for (let w = 6.4; w < 12.8; w += 0.9) mark(-1.6, 1.6, w, w + 0.45); // zebra from the kerb-side row to the entrance
  for (const sg of [-1, 1]) { // light masts
    const [a, w] = [sg * 13, 15.5];
    paint('#9b9d9f', mast);
    lathe(mast, f, a, w, [[0.18, g], [0.12, g + 9.8], [0, g + 10]], 8);
    fbox(mast, f, a - 1.2, a + 1.2, w - 0.08, w + 0.08, g + 9.6, g + 9.76);
    const glow = s.buf('neon');
    paint('#fff6dc', glow);
    for (const da of [-1.0, 1.0]) fbox(glow, f, a + da - 0.28, a + da + 0.28, w - 0.16, w + 0.16, g + 9.4, g + 9.6);
    solid(a - 0.2, a + 0.2, w - 0.2, w + 0.2, g, g + 10);
  }
  paint(WHITE, nr); // the kerb railing: posts every 2 m, two rails, gaps for the cars (±26…34) and the zebra (±3)
  for (const [r0, r1] of [[-80, -35], [-25, -3], [3, 25], [35, 80]] as const) {
    for (let a = r0; a <= r1 + 0.01; a += 2) fbox(nr, f, a - 0.04, a + 0.04, KERB - 0.48, KERB - 0.4, g, g + 1.05);
    for (const y of [0.45, 1.0]) fbox(nr, f, r0, r1, KERB - 0.47, KERB - 0.41, g + y, g + y + 0.05);
    solid(r0, r1, KERB - 0.5, KERB - 0.38, g, g + 1.05);
  }

  const out = s.out();
  return {
    ...out,
    instances: motos.length ? [{ kind: 'moto', matrices: new Float32Array(motos) }] : [],
    ...(image ? { textures: [{ material: 'mural' as const, image }] } : {}),
  };
};
