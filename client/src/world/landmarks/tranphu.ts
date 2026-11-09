// ── Trường THPT Trần Phú – Hoàn Kiếm (8 Hai Bà Trưng; OSM way/704147271 + 704147270 + 704147269 in chunk 1_3, all heritage=4 school
// blocks on the NORTH side of Phố Hai Bà Trưng, which runs ESE at compass 108° past x 355…448, z 963…993). The main block is an
// E-plan 84 m long: two 14 × 23 m end pavilions reaching to 3–4 m behind the street wall, a recessed 56 m middle range 10 m
// further back with a 28 m centre projection; a 15 × 31 m wing runs north behind the west pavilion and a 59 × 10 m block closes
// the north side. After the owner's three photos: the 1900s French lycée — pale yellow-cream stucco, a red-brown plinth, red
// brick bands at the floor line and the sills, brick voussoirs over round-arched windows (white gridded frames downstairs,
// red-brown louvred shutters upstairs, a few open on dark glass), a cream cornice under low hipped terracotta roofs; in the
// middle a narrow gabled clock pavilion (tall louvred arch, three small squares, the round white clock under a brick arch, a
// finial on the gable). The street: a low ochre wall with a red-brown cap and sunk panels, square chamfered gate piers with
// black name plaques, the dark-green double gate (diamond / star panels) standing open under a timber porch — hipped tile roof
// with a finial, red-orange scalloped fascia, the white name board — a second small gate under a tile-roofed guard shelter to
// the right, advertising boards and little coloured flags on the wall, big old trees in the yard shading the façade, motorbikes
// on the pavement. Frame: origin TP = the gate axis on the wall line (world (398.7, 966.0) = 21.02346 N, 105.85596 E), a = along
// the street (ESE, the viewer on Hai Bà Trưng looking NNE has +a on his RIGHT), w = out of the site towards the street (the
// kerb at w 5.5, the centre line at 10.5). All the painted detail is ONE 2048² OffscreenCanvas atlas on 'mural' (this chunk's
// only mural user; the two annexe records draw with the same layout and return no image); without OffscreenCanvas every face is
// plain ochre. Solid (Sink.prism): the blocks, wall, piers, gate leaves, porch posts, shelter, motorbikes; the clue box spot
// TP_BOX (a 0, w 3.6: the pavement in front of the open gate) stays clear within 3 m. ≈ 2.2k tris: the detail is in the atlas.
import type { BuildingRec } from '../../geo/chunkData.ts';
import type { MeshBuffer as Buf, V3 } from '../geom.ts';
import { pushMatrix } from '../StreetProps.ts';
import { fbox, type Fr, P, rgb, UP } from './b.ts';
import { lathe } from './d.ts';
import { frameAt, hipRoof } from './h3.ts';
import type { DetailFn } from './index.ts';
import { quadOut, triOut } from './kit.ts';
import { Sink } from './parts.ts';

/** The gate axis on the street wall line (world x, z). */
export const TP: [number, number] = [398.72, 965.98];
export const TP_UA = [0.9516, 0.3073] as const; // +a: along Hai Bà Trưng, ESE (the viewer's right)
export const TP_UW = [-0.3073, 0.9516] as const; // +w: out of the site, SSW towards the street
/** Clue box spot: the pavement in front of the main gate, 3.6 m out from the wall line (1.9 m inside the kerb). */
export const TP_BOX: [number, number] = [TP[0] + 3.6 * TP_UW[0], TP[1] + 3.6 * TP_UW[1]];

// ── dimensions (m) ──
const EAVE = 8.9; // main eaves (ground floor 0–4.3, band, first floor to the cornice)
const PAV = { a0: 28.0, a1: 42.2, front: -3.7, back: -27.0, roof: 4.6 }; // end pavilions (mirrored at −a)
const MID = { front: -13.9, back: -27.0, roof: 3.4 }; // the recessed middle range between the pavilions
const PROJ = { a: 14.3, front: -11.9 }; // the centre projection
const CLOCK = { a: 3.5, front: -10.4, back: -17.5, eave: 10.6, apex: 14.2 }; // the gabled clock pavilion
const WALL = { a: 46, h: 1.9, t: 0.14 };
const GATE = { half: 2.3, pier: 0.36, pierH: 3.1 }; // main gate opening ±2.3, piers 0.72 square
const SIDE = { a: 17.0, half: 1.1, pier: 0.3, pierH: 2.5 }; // the small gate to the right
const PORCH = { post: 2.95, back: -2.6, eave: 4.2, roof: 2.1, over: 1.1, side: 0.5 }; // eaves 4.2 m up, 1.1 m over the pavement, 0.5 m past the posts
const BAY = 3.6;

const STUCCO = '#e4c57e';
const CREAM = '#efe4c4';
const PLINTH = '#8d3f2d';
const BRICKS = ['#9a4a36', '#8b3f2d', '#a3523c'];
const MORTAR = '#c9a48a';
const TILE = '#86432f';
const TIMBER = '#6a311f';
const SHUTTER = '#7b3a22';
const GLASS = '#2b2724';
const GREEN = '#2d4a3a';
const FASCIA = '#d4502a';
const PIER = '#e6c25a';
const FLAGS = ['#d6342c', '#f0c22e', '#2c5fb8', '#3a9a4a', '#e2609a'];

// ── atlas: px regions with their metre bounds m = [s0, y0, s1, y1] (s along the face, y up; v = 0 is the image's top row) ──
interface Reg { x: number; y: number; w: number; h: number; m: readonly [number, number, number, number] }
const [AW, AH] = [2048, 2048];
const PX = 50;
const reg = (x: number, y: number, s0: number, y0: number, s1: number, y1: number, px = PX): Reg =>
  ({ x, y, w: Math.round((s1 - s0) * px), h: Math.round((y1 - y0) * px), m: [s0, y0, s1, y1] });
const R = {
  bay: reg(0, 0, -BAY / 2, 0, BAY / 2, EAVE), // shutters closed
  bayOpen: reg(190, 0, -BAY / 2, 0, BAY / 2, EAVE), // shutters folded back
  bayDoor: reg(380, 0, -BAY / 2, 0, BAY / 2, EAVE), // arched doorway downstairs
  plain: reg(570, 0, -BAY / 2, 0, BAY / 2, EAVE), // blank stucco with the bands
  gable: reg(760, 0, -CLOCK.a, 0, CLOCK.a, CLOCK.apex), // the clock pavilion's street face
  panel: reg(0, 460, -1.5, 0, 1.5, WALL.h, 60), // 3 m of the street wall
  gate: reg(200, 460, -1.15, 0, 1.15, 2.5, 80), // one gate leaf
  sign: reg(400, 720, -2.2, 0, 2.2, 1.1, 120), // the porch name board
  bannerA: reg(0, 700, -1.5, 0, 1.5, 1.2, 80),
  bannerB: reg(0, 810, -1.5, 0, 1.5, 1.2, 80),
  bannerC: reg(0, 920, -1.5, 0, 1.5, 1.2, 80),
  plaque: reg(260, 700, -0.3, 0, 0.3, 0.45, 200),
};

const hash = (n: number) => { const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); };
type G = OffscreenCanvasRenderingContext2D;
/** (s, y) in metres → canvas px inside a region. */
const px = (r: Reg, s: number, y: number): [number, number] => [r.x + ((s - r.m[0]) / (r.m[2] - r.m[0])) * r.w, r.y + ((r.m[3] - y) / (r.m[3] - r.m[1])) * r.h];
const ppm = (r: Reg) => r.w / (r.m[2] - r.m[0]); // px per m
/** Metre rectangle inside a region. */
function rect(g: G, r: Reg, s0: number, y0: number, s1: number, y1: number, fill: string) {
  const [x0, yb] = px(r, s0, y0);
  const [x1, yt] = px(r, s1, y1);
  g.fillStyle = fill;
  g.fillRect(x0, yt, x1 - x0, yb - yt);
}

/** Weathered pale-yellow stucco over a whole region: soft ochre / pale blotches, grime streaks towards the bottom. */
function stucco(g: G, r: Reg, seed: number) {
  let k = seed * 131;
  const rnd = () => hash(k++);
  g.save();
  g.beginPath(); g.rect(r.x, r.y, r.w, r.h); g.clip();
  g.fillStyle = STUCCO;
  g.fillRect(r.x, r.y, r.w, r.h);
  for (let i = 0; i < (r.w * r.h) / 2600; i++) {
    const [x, y, rad] = [r.x + rnd() * r.w, r.y + rnd() * r.h, 14 + rnd() * 60];
    const t = rnd();
    const near = (y - r.y) / r.h; // 1 at the bottom
    const col = t < 0.4 ? `rgba(150,110,50,${0.05 + rnd() * 0.12 + near * 0.08})` : t < 0.75 ? `rgba(250,240,210,${0.06 + rnd() * 0.14})` : `rgba(70,60,45,${(0.03 + rnd() * 0.08) * (0.3 + near)})`;
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, col);
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  g.restore();
}

/** Red brick with pale mortar over a metre rectangle (courses 7.5 cm, bricks 22 cm, alternate rows offset). */
function brick(g: G, r: Reg, s0: number, y0: number, s1: number, y1: number, seed = 1) {
  const [x0, yb] = px(r, s0, y0);
  const [x1, yt] = px(r, s1, y1);
  g.save();
  g.beginPath(); g.rect(x0, yt, x1 - x0, yb - yt); g.clip();
  g.fillStyle = MORTAR;
  g.fillRect(x0, yt, x1 - x0, yb - yt);
  const p = ppm(r);
  const [ch, bl, j] = [0.075 * p, 0.22 * p, Math.max(1, 0.012 * p)];
  let k = seed * 7;
  for (let y = yt, row = 0; y < yb; y += ch, row++) {
    for (let x = x0 - (row % 2) * bl * 0.5; x < x1; x += bl) {
      g.fillStyle = BRICKS[Math.floor(hash(k++) * BRICKS.length)]!;
      g.fillRect(x + j / 2, y + j / 2, bl - j, ch - j);
    }
  }
  g.restore();
}

/** Round-arched opening centred at s = c: brick voussoir ring, a brick sill, the opening filled per `kind`
 *  ('grid' white gridded frame on dark glass, 'shut' louvred shutters, 'open' shutters folded back, 'door' plank doors + fanlight). */
function arch(g: G, r: Reg, c: number, sill: number, wd: number, spring: number, kind: 'grid' | 'shut' | 'open' | 'door') {
  const p = ppm(r);
  const ri = wd / 2;
  const [cx, cy] = px(r, c, spring);
  // the opening path (rect + semicircle), reused as a clip
  const opening = () => { g.beginPath(); g.moveTo(cx - ri * p, px(r, 0, sill)[1]); g.lineTo(cx - ri * p, cy); g.arc(cx, cy, ri * p, Math.PI, 0); g.lineTo(cx + ri * p, px(r, 0, sill)[1]); g.closePath(); };
  // voussoirs: 13 brick wedges between radius ri and ri + 0.3
  const ro = ri + 0.3;
  for (let k = 0; k < 13; k++) {
    const [t0, t1] = [Math.PI + (k / 13) * Math.PI, Math.PI + ((k + 1) / 13) * Math.PI];
    g.fillStyle = BRICKS[k % BRICKS.length]!;
    g.beginPath();
    g.moveTo(cx + Math.cos(t0) * ri * p, cy + Math.sin(t0) * ri * p);
    g.lineTo(cx + Math.cos(t0) * ro * p, cy + Math.sin(t0) * ro * p);
    g.lineTo(cx + Math.cos(t1) * ro * p, cy + Math.sin(t1) * ro * p);
    g.lineTo(cx + Math.cos(t1) * ri * p, cy + Math.sin(t1) * ri * p);
    g.closePath(); g.fill();
    g.strokeStyle = MORTAR; g.lineWidth = Math.max(1, 0.012 * p); g.stroke();
  }
  if (kind !== 'door') brick(g, r, c - ri - 0.3, sill - 0.14, c + ri + 0.3, sill, 3); // the sill
  g.save();
  opening(); g.clip();
  g.fillStyle = kind === 'door' ? '#3e2415' : GLASS;
  g.fillRect(cx - ri * p, px(r, 0, spring + ri)[1], 2 * ri * p, (spring + ri - sill) * p);
  const line = (x0: number, y0: number, x1: number, y1: number, wdt: number, col: string) => { g.strokeStyle = col; g.lineWidth = wdt * p; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); };
  const [, yS] = px(r, 0, sill);
  if (kind === 'grid') { // white frame: mullion, transoms, fan lines, a pale reflection
    g.fillStyle = 'rgba(160,185,200,0.22)';
    g.fillRect(cx - ri * p, yS - (spring - sill) * p * 0.45, 2 * ri * p, (spring - sill) * p * 0.45);
    line(cx, yS, cx, cy - ri * p, 0.07, '#efeee8');
    for (let y = sill + 0.7; y < spring - 0.2; y += 0.7) line(cx - ri * p, px(r, 0, y)[1], cx + ri * p, px(r, 0, y)[1], 0.05, '#efeee8');
    line(cx - ri * p, cy, cx + ri * p, cy, 0.07, '#efeee8');
    for (const t of [Math.PI * 0.75, Math.PI * 1.25]) line(cx, cy, cx + Math.cos(t) * ri * p, cy + Math.sin(t) * ri * p, 0.05, '#efeee8');
    for (const t of [Math.PI * 0.5]) line(cx, cy, cx + Math.cos(t) * ri * p, cy - ri * p, 0.05, '#efeee8');
  } else if (kind === 'door') { // vertical planks, iron bands, a white fanlight
    for (let x = cx - ri * p; x < cx + ri * p; x += 0.14 * p) line(x, yS, x, cy, 0.012, '#1f110a');
    for (const y of [sill + 0.9, sill + 2.0]) line(cx - ri * p, px(r, 0, y)[1], cx + ri * p, px(r, 0, y)[1], 0.05, '#2a2a28');
    line(cx, yS, cx, cy, 0.04, '#1a0e08');
    g.fillStyle = '#d9d2c0'; g.beginPath(); g.arc(cx, cy, ri * p, Math.PI, 0); g.closePath(); g.fill();
    for (const t of [0.2, 0.4, 0.6, 0.8]) line(cx, cy, cx + Math.cos(Math.PI + t * Math.PI) * ri * p, cy + Math.sin(Math.PI + t * Math.PI) * ri * p, 0.03, '#4a3a2a');
    g.strokeStyle = '#4a3a2a'; g.lineWidth = 0.04 * p; g.beginPath(); g.arc(cx, cy, ri * p * 0.5, Math.PI, 0); g.stroke();
  } else { // shutters: 'shut' = two louvred leaves filling the arch; 'open' = dark glass + white frame, leaves folded outside
    const louvre = (x0: number, x1: number) => {
      g.fillStyle = SHUTTER; g.fillRect(x0, yS - (spring + ri - sill) * p, x1 - x0, (spring + ri - sill) * p);
      for (let y = sill + 0.1; y < spring + ri; y += 0.08) line(x0 + 0.03 * p, px(r, 0, y)[1], x1 - 0.03 * p, px(r, 0, y)[1], 0.025, '#4e2514');
      line(x0, yS, x0, yS - (spring + ri - sill) * p, 0.05, '#5a2a18');
      line(x1, yS, x1, yS - (spring + ri - sill) * p, 0.05, '#5a2a18');
    };
    if (kind === 'shut') { louvre(cx - ri * p, cx); louvre(cx, cx + ri * p); line(cx, yS, cx, cy - ri * p, 0.04, '#3a1a0e'); }
    else {
      g.fillStyle = 'rgba(150,170,190,0.18)'; g.fillRect(cx - ri * p, yS - (spring - sill) * p * 0.5, 2 * ri * p, (spring - sill) * p * 0.5);
      line(cx, yS, cx, cy - ri * p, 0.06, '#e8e4d8');
      for (let y = sill + 0.6; y < spring; y += 0.6) line(cx - ri * p, px(r, 0, y)[1], cx + ri * p, px(r, 0, y)[1], 0.04, '#e8e4d8');
    }
  }
  g.restore();
  if (kind === 'open') { // the folded leaves against the wall, each side
    const p2 = ppm(r);
    for (const sg of [-1, 1]) {
      const x0 = cx + sg * (ri + 0.04) * p2;
      const x1 = cx + sg * (ri + 0.42) * p2;
      g.fillStyle = SHUTTER; g.fillRect(Math.min(x0, x1), px(r, 0, spring + 0.3)[1], Math.abs(x1 - x0), (spring + 0.3 - sill) * p2);
      g.strokeStyle = '#4e2514'; g.lineWidth = 0.025 * p2;
      for (let y = sill + 0.1; y < spring + 0.3; y += 0.08) { const yy = px(r, 0, y)[1]; g.beginPath(); g.moveTo(Math.min(x0, x1) + 2, yy); g.lineTo(Math.max(x0, x1) - 2, yy); g.stroke(); }
    }
  }
}

/** One standard bay: plinth, ground-floor arch, brick floor band, sill string, first-floor arch, eave band + cornice. */
function bayFace(g: G, r: Reg, seed: number, lower: 'grid' | 'door' | 'none', upper: 'shut' | 'open' | 'none') {
  stucco(g, r, seed);
  rect(g, r, r.m[0], 0, r.m[2], 0.7, PLINTH);
  rect(g, r, r.m[0], 0.7, r.m[2], 0.76, '#b27a62');
  if (lower === 'grid') arch(g, r, 0, 1.0, 1.5, 3.05, 'grid');
  if (lower === 'door') arch(g, r, 0, 0, 1.9, 2.75, 'door');
  brick(g, r, r.m[0], 4.25, r.m[2], 4.75, seed + 1);
  brick(g, r, r.m[0], 5.2, r.m[2], 5.33, seed + 2);
  if (upper !== 'none') arch(g, r, 0, 5.35, 1.5, 7.2, upper);
  brick(g, r, r.m[0], 8.25, r.m[2], 8.45, seed + 3);
  rect(g, r, r.m[0], 8.55, r.m[2], EAVE, CREAM);
  rect(g, r, r.m[0], 8.55, r.m[2], 8.62, 'rgba(90,70,40,0.35)');
}

/** The clock pavilion's street face: doorway, tall louvred arch, three small squares, brick quoins, the gable with the clock. */
function gableFace(g: G, r: Reg) {
  stucco(g, r, 9);
  rect(g, r, r.m[0], 0, r.m[2], 0.7, PLINTH);
  arch(g, r, 0, 0, 2.2, 2.9, 'door');
  brick(g, r, r.m[0], 4.25, r.m[2], 4.75, 21);
  brick(g, r, r.m[0], 5.15, r.m[2], 5.28, 22);
  arch(g, r, 0, 5.3, 1.7, 8.5, 'shut');
  for (const s of [-1.3, 0, 1.3]) { // three small square windows under the eave band
    rect(g, r, s - 0.33, 9.85, s + 0.33, 10.5, '#efeee8');
    rect(g, r, s - 0.26, 9.92, s + 0.26, 10.43, GLASS);
    rect(g, r, s - 0.02, 9.92, s + 0.02, 10.43, '#efeee8');
  }
  brick(g, r, r.m[0], 10.6, r.m[2], 10.9, 23);
  for (const sg of [-1, 1]) for (let y = 0.76; y < 10.5; y += 0.6) { // quoins
    const wd = Math.round(y / 0.6) % 2 ? 0.45 : 0.3;
    brick(g, r, sg > 0 ? r.m[2] - wd : r.m[0], y, sg > 0 ? r.m[2] : r.m[0] + wd, y + 0.3, 30 + y);
  }
  const p = ppm(r);
  // the gable's brick edge trim along the slopes
  g.strokeStyle = BRICKS[1]!; g.lineWidth = 0.22 * p;
  g.beginPath(); g.moveTo(...px(r, r.m[0] - 0.2, 10.5)); g.lineTo(...px(r, 0, CLOCK.apex + 0.1)); g.lineTo(...px(r, r.m[2] + 0.2, 10.5)); g.stroke();
  // the clock: brick arch over it, white face, black ticks, hands at ten past ten, red centre
  const [cx, cy] = px(r, 0, 12.15);
  const rf = 0.78 * p;
  for (let k = 0; k < 11; k++) {
    const [t0, t1] = [Math.PI + (k / 11) * Math.PI, Math.PI + ((k + 1) / 11) * Math.PI];
    g.fillStyle = BRICKS[k % 3]!;
    g.beginPath();
    g.moveTo(cx + Math.cos(t0) * (rf + 0.08 * p), cy + Math.sin(t0) * (rf + 0.08 * p));
    g.lineTo(cx + Math.cos(t0) * (rf + 0.4 * p), cy + Math.sin(t0) * (rf + 0.4 * p));
    g.lineTo(cx + Math.cos(t1) * (rf + 0.4 * p), cy + Math.sin(t1) * (rf + 0.4 * p));
    g.lineTo(cx + Math.cos(t1) * (rf + 0.08 * p), cy + Math.sin(t1) * (rf + 0.08 * p));
    g.closePath(); g.fill();
  }
  g.fillStyle = '#3a2a20'; g.beginPath(); g.arc(cx, cy, rf + 0.06 * p, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#f6f3ea'; g.beginPath(); g.arc(cx, cy, rf, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#1d1d1f'; g.lineCap = 'round';
  for (let k = 0; k < 12; k++) {
    const t = (k / 12) * Math.PI * 2;
    g.lineWidth = k % 3 ? 2 : 4;
    g.beginPath(); g.moveTo(cx + Math.cos(t) * rf * 0.86, cy + Math.sin(t) * rf * 0.86); g.lineTo(cx + Math.cos(t) * rf * 0.74, cy + Math.sin(t) * rf * 0.74); g.stroke();
  }
  for (const [ang, len, wd] of [[-Math.PI / 2 - Math.PI / 3, 0.5, 4], [-Math.PI / 2 + Math.PI / 3, 0.7, 3]] as const) {
    g.lineWidth = wd; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(ang) * rf * len, cy + Math.sin(ang) * rf * len); g.stroke();
  }
  g.fillStyle = '#c62a2e'; g.beginPath(); g.arc(cx, cy, 3, 0, Math.PI * 2); g.fill();
}

function signs(g: G) {
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  // the street wall panel: ochre with a red-brown cap and a sunk panel
  const w = R.panel;
  g.fillStyle = PIER; g.fillRect(w.x, w.y, w.w, w.h);
  rect(g, w, w.m[0], 1.72, w.m[2], WALL.h, '#7e3a2a');
  rect(g, w, w.m[0], 0, w.m[2], 0.28, '#7e3a2a'); // the red-brown base
  rect(g, w, w.m[0], 1.64, w.m[2], 1.72, '#f0d890');
  rect(g, w, -1.2, 0.32, 1.2, 1.45, 'rgba(90,60,20,0.22)');
  rect(g, w, -1.14, 0.38, 1.14, 1.39, '#dcb84f');
  rect(g, w, -1.14, 1.34, 1.14, 1.39, 'rgba(80,50,10,0.3)');
  rect(g, w, -1.14, 0.38, -1.09, 1.39, 'rgba(80,50,10,0.3)');
  // one gate leaf: dark green sheet, two rails, a diamond with a four-point star in each panel, vertical bars on top
  const t = R.gate;
  g.fillStyle = GREEN; g.fillRect(t.x, t.y, t.w, t.h);
  for (const y of [0.0, 0.86, 1.66, 2.42]) rect(g, t, t.m[0], y, t.m[2], y + 0.08, '#1f3328');
  rect(g, t, t.m[0], 0, t.m[0] + 0.08, 2.5, '#1f3328');
  rect(g, t, t.m[2] - 0.08, 0, t.m[2], 2.5, '#1f3328');
  const p = ppm(t);
  for (let x = t.m[0] + 0.2; x < t.m[2] - 0.1; x += 0.17) rect(g, t, x, 1.74, x + 0.05, 2.42, '#14201a'); // the gaps between the bars read dark
  for (const yc of [0.47, 1.26]) {
    const [cx, cy] = px(t, 0, yc);
    g.fillStyle = '#3f6b52';
    g.beginPath(); g.moveTo(cx, cy - 0.3 * p); g.lineTo(cx + 0.42 * p, cy); g.lineTo(cx, cy + 0.3 * p); g.lineTo(cx - 0.42 * p, cy); g.closePath(); g.fill();
    g.fillStyle = '#c9b25a';
    g.beginPath(); for (let k = 0; k < 8; k++) { const a = (k * Math.PI) / 4; const rr = k % 2 ? 0.06 : 0.2; g.lineTo(cx + Math.cos(a) * rr * p, cy + Math.sin(a) * rr * p); } g.closePath(); g.fill();
  }
  // the name board: white, blue logo, blue / red letters, the address line
  const s = R.sign;
  g.fillStyle = '#f8f7f1'; g.fillRect(s.x, s.y, s.w, s.h);
  g.strokeStyle = '#1a56a6'; g.lineWidth = 3; g.strokeRect(s.x + 2, s.y + 2, s.w - 4, s.h - 4);
  const [lx, ly] = px(s, -1.85, 0.55);
  g.fillStyle = '#1a56a6'; g.beginPath(); g.arc(lx, ly, 34, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#ffffff'; g.beginPath(); g.arc(lx, ly, 26, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#1a56a6'; g.fillRect(lx - 16, ly - 10, 32, 20); g.fillStyle = '#ffffff'; g.fillRect(lx - 1, ly - 10, 2, 20);
  g.fillStyle = '#1a56a6';
  g.font = 'bold 28px "Helvetica Neue", Helvetica, Arial, sans-serif';
  g.fillText('TRƯỜNG TRUNG HỌC PHỔ THÔNG', px(s, 0.25, 0.86)[0], px(s, 0, 0.86)[1], 380);
  g.fillStyle = '#c8202a';
  g.font = 'bold 58px "Helvetica Neue", Helvetica, Arial, sans-serif';
  g.fillText('TRẦN PHÚ - HOÀN KIẾM', px(s, 0.25, 0.5)[0], px(s, 0, 0.5)[1], 420);
  g.fillStyle = '#1a56a6';
  g.font = 'bold 15px "Helvetica Neue", Helvetica, Arial, sans-serif';
  g.fillText('ĐC: SỐ 8 HAI BÀ TRƯNG - HOÀN KIẾM - HÀ NỘI      ĐT: 024 3825 ....', px(s, 0.25, 0.16)[0], px(s, 0, 0.16)[1], 440);
  // advertising boards on the wall (generic text): red English centre, blue notice board, white course board
  const board = (r: Reg, back: string, fg: string, l1: string, l2: string, accent: string) => {
    g.fillStyle = back; g.fillRect(r.x, r.y, r.w, r.h);
    g.fillStyle = accent; g.fillRect(r.x, r.y, 14, r.h);
    g.fillStyle = fg;
    g.font = 'bold 30px "Helvetica Neue", Helvetica, Arial, sans-serif';
    g.fillText(l1, r.x + r.w / 2 + 6, r.y + r.h * 0.34, r.w - 40);
    g.font = 'bold 20px "Helvetica Neue", Helvetica, Arial, sans-serif';
    g.fillText(l2, r.x + r.w / 2 + 6, r.y + r.h * 0.72, r.w - 40);
  };
  board(R.bannerA, '#c4262b', '#fff6e6', 'TRUNG TÂM ANH NGỮ', 'TUYỂN SINH · KHAI GIẢNG THÁNG 9', '#f2c230');
  board(R.bannerB, '#1b4f9c', '#ffffff', 'BẢNG TIN NHÀ TRƯỜNG', 'THÔNG BÁO · LỊCH HỌC · TUYỂN SINH LỚP 10', '#f2c230');
  board(R.bannerC, '#f6f2e8', '#c8202a', 'LUYỆN THI TIẾNG ANH', 'LỚP 6 – 12 · GIAO TIẾP · HỌC THỬ MIỄN PHÍ', '#1b4f9c');
  // the black name plaque on the gate piers
  const q = R.plaque;
  g.fillStyle = '#17181a'; g.fillRect(q.x, q.y, q.w, q.h);
  g.strokeStyle = '#c9a84a'; g.lineWidth = 2; g.strokeRect(q.x + 3, q.y + 3, q.w - 6, q.h - 6);
  g.fillStyle = '#f2ede0';
  g.font = 'bold 9px "Helvetica Neue", Helvetica, Arial, sans-serif';
  g.fillText('SỞ GIÁO DỤC VÀ ĐÀO TẠO HÀ NỘI', q.x + q.w / 2, q.y + 18, q.w - 10);
  g.font = 'bold 13px "Helvetica Neue", Helvetica, Arial, sans-serif';
  g.fillText('TRƯỜNG THPT', q.x + q.w / 2, q.y + 42, q.w - 10);
  g.fillText('TRẦN PHÚ - HOÀN KIẾM', q.x + q.w / 2, q.y + 66, q.w - 10);
}

function paintAtlas(): ImageBitmap | undefined {
  if (typeof OffscreenCanvas === 'undefined') return;
  const c = new OffscreenCanvas(AW, AH);
  const g = c.getContext('2d');
  if (!g) return;
  g.fillStyle = STUCCO;
  g.fillRect(0, 0, AW, AH);
  bayFace(g, R.bay, 1, 'grid', 'shut');
  bayFace(g, R.bayOpen, 2, 'grid', 'open');
  bayFace(g, R.bayDoor, 3, 'door', 'shut');
  bayFace(g, R.plain, 4, 'none', 'none');
  gableFace(g, R.gable);
  signs(g);
  return c.transferToImageBitmap();
}

/** A vertical plane of the frame: origin (a, w), s runs along (da, dw), outward normal (na, nw) (frame coordinates). */
interface Pl { a: number; w: number; da: number; dw: number; na: number; nw: number }

/** Frame bounds of a record's outline: [a0, a1, w0, w1]. */
function bounds(rec: BuildingRec, f: Fr) {
  let [a0, a1, w0, w1] = [Infinity, -Infinity, Infinity, -Infinity];
  for (let i = 0; i < rec.outer.length; i += 2) {
    const [dx, dz] = [rec.outer[i]! - f.cx, rec.outer[i + 1]! - f.cz];
    const [a, w] = [dx * f.ux + dz * f.uz, -dx * f.uz + dz * f.ux];
    [a0, a1, w0, w1] = [Math.min(a0, a), Math.max(a1, a), Math.min(w0, w), Math.max(w1, w)];
  }
  return [a0, a1, w0, w1] as const;
}

export const tranPhu: DetailFn = (rec, _parts, ctx) => {
  const g = ctx.ground;
  const s = new Sink();
  const f = frameAt(TP[0], TP[1], TP_UA[0], TP_UA[1]);
  const nrm = (na: number, nw: number): V3 => [na * f.ux - nw * f.uz, 0, na * f.uz + nw * f.ux];
  const OUT = nrm(0, 1); // towards the street
  const st = s.buf('masonry');
  const nr = s.buf('masonry', 'near');
  const paint = (hex: string, buf: Buf = st) => { buf.color = rgb(hex); return buf; };
  const bw1 = bounds(rec, f)[3];
  const main = bw1 > -8; // the E-plan block along the street; the other two records are the annexes behind it
  const image = main ? paintAtlas() : undefined;
  const mural = (main ? image : typeof OffscreenCanvas !== 'undefined') ? s.buf('mural') : undefined;
  const solid = (a0: number, a1: number, w0: number, w1: number, y0: number, y1: number) =>
    s.prism([[P(f, a0, 0, w0), P(f, a1, 0, w0), P(f, a1, 0, w1), P(f, a0, 0, w1)].flatMap((p) => [p[0], p[2]])], y0, y1);

  // ── textured faces ──
  const pt = (pl: Pl, sv: number, y: number) => P(f, pl.a + sv * pl.da, y, pl.w + sv * pl.dw);
  const uv = (r: Reg, sv: number, y: number): [number, number] =>
    [(r.x + ((sv - r.m[0]) / (r.m[2] - r.m[0])) * r.w) / AW, (r.y + ((r.m[3] - y) / (r.m[3] - r.m[1])) * r.h) / AH];
  /** Convex polygon (s, y) on a plane, textured from region r (fan); s is scaled by `ms` (region metres per face metre), the
   *  region's y = 0 sits at face height `ys` (default: the ground). */
  const tpoly = (pl: Pl, r: Reg, pts: [number, number][], fallback = STUCCO, ms = 1, ys = g) => {
    const out = nrm(pl.na, pl.nw);
    for (let i = 1; i + 1 < pts.length; i++) {
      const [p0, p1, p2] = [pts[0]!, pts[i]!, pts[i + 1]!];
      if (!mural) { triOut(paint(fallback), pt(pl, ...p0), pt(pl, ...p1), pt(pl, ...p2), out); continue; }
      const [u0, u1, u2] = [uv(r, p0[0] * ms, p0[1] - ys), uv(r, p1[0] * ms, p1[1] - ys), uv(r, p2[0] * ms, p2[1] - ys)];
      triOut(mural, pt(pl, ...p0), pt(pl, ...p1), pt(pl, ...p2), out, [u0[0], u0[1], u1[0], u1[1], u2[0], u2[1]]);
    }
  };
  const tq = (pl: Pl, r: Reg, s0: number, s1: number, y0: number, y1: number, fallback = STUCCO, ms = 1, ys = g) => tpoly(pl, r, [[s0, y0], [s1, y0], [s1, y1], [s0, y1]], fallback, ms, ys);
  /** A face split into bays of ≈ 3.6 m, each textured from `pick(i, n)`, s centred on the plane origin. */
  const bays = (pl: Pl, L: number, pick: (i: number, n: number) => Reg) => {
    const n = Math.max(1, Math.round(L / BAY));
    const bw = L / n;
    for (let i = 0; i < n; i++) {
      const s0 = -L / 2 + i * bw;
      const r = pick(i, n);
      tpoly({ ...pl, a: pl.a + (s0 + bw / 2) * pl.da, w: pl.w + (s0 + bw / 2) * pl.dw }, r, [[-bw / 2, g], [bw / 2, g], [bw / 2, g + EAVE], [-bw / 2, g + EAVE]], STUCCO, BAY / bw);
    }
  };
  const std = (i: number) => (i % 3 === 1 ? R.bayOpen : R.bay);
  const withDoor = (i: number, n: number) => (i === (n - 1) / 2 || (n % 2 === 0 && i === n / 2) ? R.bayDoor : std(i));
  /** A colonial block a0..a1 × w0..w1: four faces of bays, the cornice, a hipped tile roof, solid. */
  const block = (a0: number, a1: number, w0: number, w1: number, roofH: number, frontPick = withDoor) => {
    const [ac, wc] = [(a0 + a1) / 2, (w0 + w1) / 2];
    bays({ a: ac, w: w1, da: 1, dw: 0, na: 0, nw: 1 }, a1 - a0, frontPick);
    bays({ a: ac, w: w0, da: 1, dw: 0, na: 0, nw: -1 }, a1 - a0, std);
    bays({ a: a1, w: wc, da: 0, dw: 1, na: 1, nw: 0 }, w1 - w0, std);
    bays({ a: a0, w: wc, da: 0, dw: 1, na: -1, nw: 0 }, w1 - w0, std);
    paint(CREAM);
    fbox(st, f, a0 - 0.25, a1 + 0.25, w0 - 0.25, w1 + 0.25, g + EAVE - 0.35, g + EAVE); // the cornice proud of the wall
    hipRoof(s, f, a0 - 0.7, a1 + 0.7, w0 - 0.7, w1 + 0.7, g + EAVE - 0.05, roofH, 0, TILE);
    solid(a0, a1, w0, w1, g, g + EAVE);
  };

  if (!main) { // an annexe: one colonial block on the record's frame bounds (both lie square to the street)
    const [a0, a1, w0, w1] = bounds(rec, f);
    block(a0, a1, w0, w1, Math.min(4.6, (w1 - w0) * 0.28, (a1 - a0) * 0.28));
    return s.out();
  }

  // ── the main block: two pavilions, the middle range, the centre projection, the clock pavilion ──
  for (const sg of [-1, 1]) block(Math.min(sg * PAV.a0, sg * PAV.a1), Math.max(sg * PAV.a0, sg * PAV.a1), PAV.back, PAV.front, PAV.roof);
  block(-PAV.a0, PAV.a0, MID.back, MID.front, MID.roof, std);
  for (const sg of [-1, 1]) { // the centre projection's two halves beside the clock bay + their 2 m returns
    const [a0, a1] = [Math.min(sg * CLOCK.a, sg * PROJ.a), Math.max(sg * CLOCK.a, sg * PROJ.a)];
    bays({ a: (a0 + a1) / 2, w: PROJ.front, da: 1, dw: 0, na: 0, nw: 1 }, a1 - a0, std);
    tq({ a: sg * PROJ.a, w: (PROJ.front + MID.front) / 2, da: 0, dw: 1, na: sg, nw: 0 }, R.plain, -1, 1, g, g + EAVE, STUCCO, 1.8);
    paint(CREAM);
    fbox(st, f, a0 - 0.25, a1 + 0.25, PROJ.front - 0.25, MID.front, g + EAVE - 0.35, g + EAVE);
    solid(a0, a1, MID.front, PROJ.front, g, g + EAVE);
  }
  hipRoof(s, f, -PROJ.a - 0.7, PROJ.a + 0.7, MID.back - 0.7, PROJ.front + 0.7, g + EAVE - 0.05, MID.roof + 0.4, 0, TILE);
  // the clock pavilion: textured gable face (rectangle + triangle), plain sides up to its own eave, the gable roof + finial
  const gf: Pl = { a: 0, w: CLOCK.front, da: 1, dw: 0, na: 0, nw: 1 };
  tq(gf, R.gable, -CLOCK.a, CLOCK.a, g, g + CLOCK.eave);
  tpoly(gf, R.gable, [[-CLOCK.a, g + CLOCK.eave], [CLOCK.a, g + CLOCK.eave], [0, g + CLOCK.apex]]);
  for (const sg of [-1, 1]) {
    tq({ a: sg * CLOCK.a, w: (CLOCK.front + CLOCK.back) / 2, da: 0, dw: 1, na: sg, nw: 0 }, R.plain, -1.8, 1.8, g, g + CLOCK.eave, STUCCO, BAY / (CLOCK.front - CLOCK.back));
  }
  paint(STUCCO);
  triOut(st, P(f, -CLOCK.a, g + CLOCK.eave, CLOCK.back), P(f, CLOCK.a, g + CLOCK.eave, CLOCK.back), P(f, 0, g + CLOCK.apex, CLOCK.back), nrm(0, -1));
  paint(CREAM);
  fbox(st, f, -CLOCK.a - 0.2, CLOCK.a + 0.2, CLOCK.front - 0.2, CLOCK.front, g + CLOCK.eave - 0.3, g + CLOCK.eave);
  const tile = paint(TILE);
  for (const sg of [-1, 1]) {
    const q: [V3, V3, V3, V3] = [P(f, sg * (CLOCK.a + 0.6), g + CLOCK.eave - 0.3, CLOCK.front + 0.6), P(f, sg * (CLOCK.a + 0.6), g + CLOCK.eave - 0.3, CLOCK.back), P(f, 0, g + CLOCK.apex + 0.1, CLOCK.back), P(f, 0, g + CLOCK.apex + 0.1, CLOCK.front + 0.6)];
    quadOut(tile, ...q, [sg * f.ux, 1.2, sg * f.uz]);
    quadOut(tile, ...q, [-sg * f.ux, -1.2, -sg * f.uz]);
  }
  paint('#4a2e22');
  fbox(st, f, -0.14, 0.14, CLOCK.back, CLOCK.front + 0.6, g + CLOCK.apex - 0.05, g + CLOCK.apex + 0.3); // ridge
  lathe(paint('#3a3330', nr), f, 0, CLOCK.front + 0.9, [[0.22, g + CLOCK.apex + 0.25], [0.1, g + CLOCK.apex + 0.6], [0.26, g + CLOCK.apex + 0.95], [0.08, g + CLOCK.apex + 1.3], [0, g + CLOCK.apex + 1.9]], 6); // finial
  solid(-CLOCK.a, CLOCK.a, CLOCK.back, CLOCK.front, g, g + CLOCK.eave);

  // ── the yard and the pavement strip behind the public sidewalk ──
  const pave = s.buf('pave');
  quadOut(pave, P(f, -WALL.a, g + 0.05, PAV.back), P(f, WALL.a, g + 0.05, PAV.back), P(f, WALL.a, g + 0.05, 2.1), P(f, -WALL.a, g + 0.05, 2.1), UP, 0, 0, 2 * WALL.a, 2.1 - PAV.back);
  const trees: number[] = [];
  for (const [a, w, sc] of [[-34, -8.5, 1.3], [-21, -7.5, 1.25], [-9.5, -8, 1.35], [9.5, -8, 1.3], [21, -7.5, 1.25], [34, -8.5, 1.3]] as const) {
    const p = P(f, a, 0, w);
    pushMatrix(trees, p[0], g - 0.2, p[2], hash(a) * Math.PI * 2, sc);
  }

  // ── the street wall: panels between piers every 6 m, gaps at the two gates ──
  const wallRuns: [number, number][] = [[-WALL.a, -GATE.half - 2 * GATE.pier], [GATE.half + 2 * GATE.pier, SIDE.a - SIDE.half - 2 * SIDE.pier], [SIDE.a + SIDE.half + 2 * SIDE.pier, WALL.a]];
  for (const [a0, a1] of wallRuns) {
    const n = Math.max(1, Math.round((a1 - a0) / 3));
    const bw = (a1 - a0) / n;
    for (let i = 0; i < n; i++) {
      const ac = a0 + (i + 0.5) * bw;
      for (const [w, nw] of [[WALL.t, 1], [-WALL.t, -1]] as const) tq({ a: ac, w, da: 1, dw: 0, na: 0, nw }, R.panel, -bw / 2, bw / 2, g, g + WALL.h, PIER, 3 / bw);
    }
    paint('#7e3a2a');
    fbox(st, f, a0, a1, -WALL.t - 0.03, WALL.t + 0.03, g + WALL.h - 0.02, g + WALL.h + 0.06); // the cap
    solid(a0, a1, -WALL.t, WALL.t, g, g + WALL.h);
    for (let a = a0 + 3; a < a1 - 1; a += 6) { // intermediate piers with pyramid caps
      paint(PIER);
      fbox(st, f, a - 0.24, a + 0.24, -0.24, 0.24, g, g + WALL.h + 0.25);
      lathe(paint('#7e3a2a', nr), f, a, 0, [[0.29 * Math.SQRT2, g + WALL.h + 0.25], [0.3 * Math.SQRT2, g + WALL.h + 0.32], [0, g + WALL.h + 0.55]], 4);
    }
  }
  /** Square gate pier at a: body, chamfered cap, plaque facing the street. */
  const pier = (a: number, half: number, h: number, plaque: boolean) => {
    paint(PIER);
    fbox(st, f, a - half, a + half, -half, half, g, g + h);
    fbox(st, f, a - half - 0.06, a + half + 0.06, -half - 0.06, half + 0.06, g + h, g + h + 0.12);
    lathe(paint(PIER, nr), f, a, 0, [[(half + 0.04) * Math.SQRT2, g + h + 0.12], [half * 0.5 * Math.SQRT2, g + h + 0.4], [0, g + h + 0.5]], 4);
    if (plaque) tq({ a, w: half + 0.02, da: 1, dw: 0, na: 0, nw: 1 }, R.plaque, -0.3, 0.3, g + 1.75, g + 2.2, '#17181a', 1, g + 1.75);
    solid(a - half, a + half, -half, half, g, g + h + 0.5);
  };
  for (const sg of [-1, 1]) pier(sg * (GATE.half + GATE.pier), GATE.pier, GATE.pierH, true);
  for (const sg of [-1, 1]) pier(SIDE.a + sg * (SIDE.half + SIDE.pier), SIDE.pier, SIDE.pierH, false);
  // the main gate stands open: each leaf swung into the yard along w from its pier; the side gate is shut
  for (const sg of [-1, 1]) {
    const a = sg * (GATE.half - 0.06);
    for (const [na, ms] of [[sg, 1], [-sg, -1]] as const) tq({ a, w: -1.2, da: 0, dw: 1, na, nw: 0 }, R.gate, -1.15, 1.15, g + 0.05, g + 2.55, GREEN, ms, g + 0.05);
    paint('#1f3328', nr);
    fbox(nr, f, a - 0.03, a + 0.03, -2.35, -0.05, g + 2.55, g + 2.62);
    solid(a - 0.05, a + 0.05, -2.35, -0.05, g, g + 2.6);
  }
  for (const [w, nw] of [[0.03, 1], [-0.03, -1]] as const) tq({ a: SIDE.a, w, da: 1, dw: 0, na: 0, nw }, R.gate, -1.1, 1.1, g + 0.05, g + 2.2, GREEN, 2.3 / 2.2, g + 0.05);
  solid(SIDE.a - SIDE.half, SIDE.a + SIDE.half, -0.04, 0.04, g, g + 2.2);
  // the guard shelter behind the side gate: a low ochre box under a hipped tile roof
  paint(STUCCO);
  fbox(st, f, SIDE.a - 2.6, SIDE.a + 2.6, -4.6, -0.6, g, g + 2.6);
  tq({ a: SIDE.a, w: -0.58, da: 1, dw: 0, na: 0, nw: 1 }, R.bay, -1.8, 1.8, g + 0.6, g + 2.4, GLASS, 1); // (the bay's ground-floor window reads as its window)
  hipRoof(s, f, SIDE.a - 3.3, SIDE.a + 3.3, -5.3, 0.3, g + 2.6, 1.1, 0, TILE);
  solid(SIDE.a - 2.6, SIDE.a + 2.6, -4.6, -0.6, g, g + 2.6);

  // ── the porch over the main gate: timber posts + beams, hipped tile roof with a finial, scalloped fascia, the name board ──
  const tim = paint(TIMBER);
  for (const sg of [-1, 1]) {
    fbox(tim, f, sg * PORCH.post - 0.1, sg * PORCH.post + 0.1, PORCH.back - 0.1, PORCH.back + 0.1, g, g + PORCH.eave);
    fbox(tim, f, sg * (GATE.half + GATE.pier) - 0.09, sg * (GATE.half + GATE.pier) + 0.09, -0.09, 0.09, g + GATE.pierH + 0.5, g + PORCH.eave); // posts on the piers
    fbox(tim, f, sg * PORCH.post - 0.08, sg * PORCH.post + 0.08, PORCH.back, 0.4, g + PORCH.eave - 0.3, g + PORCH.eave); // side beams
    solid(sg * PORCH.post - 0.1, sg * PORCH.post + 0.1, PORCH.back - 0.1, PORCH.back + 0.1, g, g + PORCH.eave);
  }
  fbox(tim, f, -PORCH.post - 0.1, PORCH.post + 0.1, PORCH.back - 0.08, PORCH.back + 0.08, g + PORCH.eave - 0.3, g + PORCH.eave);
  fbox(tim, f, -PORCH.post - 0.1, PORCH.post + 0.1, 0.32, 0.48, g + PORCH.eave - 0.3, g + PORCH.eave);
  hipRoof(s, f, -PORCH.post - PORCH.side, PORCH.post + PORCH.side, PORCH.back - 0.9, PORCH.over, g + PORCH.eave - 0.05, PORCH.roof, 0, TILE);
  lathe(paint('#3a3330', nr), f, 0, (PORCH.back - 0.9 + PORCH.over) / 2, [[0.2, g + PORCH.eave + PORCH.roof + 0.2], [0.08, g + PORCH.eave + PORCH.roof + 0.5], [0.22, g + PORCH.eave + PORCH.roof + 0.8], [0, g + PORCH.eave + PORCH.roof + 1.5]], 6);
  // the fascia: a red-orange board under the eaves on all four sides with a row of hanging scallops
  const fas = paint(FASCIA, nr);
  const eaveA = PORCH.post + PORCH.side;
  const [eW0, eW1] = [PORCH.back - 0.9, PORCH.over];
  const edges: [V3, V3, V3][] = [
    [P(f, -eaveA, 0, eW1), P(f, eaveA, 0, eW1), OUT],
    [P(f, -eaveA, 0, eW0), P(f, eaveA, 0, eW0), nrm(0, -1)],
    [P(f, eaveA, 0, eW0), P(f, eaveA, 0, eW1), nrm(1, 0)],
    [P(f, -eaveA, 0, eW0), P(f, -eaveA, 0, eW1), nrm(-1, 0)],
  ];
  for (const [p0, p1, out] of edges) {
    const [y0, y1] = [g + PORCH.eave - 0.32, g + PORCH.eave + 0.05];
    const lift = (p: V3, y: number): V3 => [p[0], y, p[2]];
    quadOut(fas, lift(p0, y0), lift(p1, y0), lift(p1, y1), lift(p0, y1), out);
    quadOut(fas, lift(p0, y0), lift(p1, y0), lift(p1, y1), lift(p0, y1), [-out[0], 0, -out[2]]);
    const L = Math.hypot(p1[0] - p0[0], p1[2] - p0[2]);
    const n = Math.round(L / 0.22);
    for (let k = 0; k < n; k++) {
      const at = (t: number, y: number): V3 => [p0[0] + (p1[0] - p0[0]) * t, y, p0[2] + (p1[2] - p0[2]) * t];
      triOut(fas, at(k / n, y0), at((k + 1) / n, y0), at((k + 0.5) / n, y0 - 0.13), out);
      triOut(fas, at(k / n, y0), at((k + 1) / n, y0), at((k + 0.5) / n, y0 - 0.13), [-out[0], 0, -out[2]]);
    }
  }
  tq({ a: 0, w: 0.5, da: 1, dw: 0, na: 0, nw: 1 }, R.sign, -2.2, 2.2, g + GATE.pierH + 0.05, g + GATE.pierH + 1.15, '#f8f7f1', 1, g + GATE.pierH + 0.05);
  quadOut(paint(CREAM, nr), P(f, -2.2, g + GATE.pierH + 0.05, 0.47), P(f, 2.2, g + GATE.pierH + 0.05, 0.47), P(f, 2.2, g + GATE.pierH + 1.15, 0.47), P(f, -2.2, g + GATE.pierH + 1.15, 0.47), nrm(0, -1));
  paint('#1a56a6', nr); // the blue house-number plate on the right pier
  fbox(nr, f, GATE.half + GATE.pier - 0.12, GATE.half + GATE.pier + 0.12, GATE.pier, GATE.pier + 0.03, g + 2.35, g + 2.6);

  // ── boards on the wall, flags on the wall top, motorbikes on the pavement ──
  for (const [a, r] of [[-38, R.bannerA], [-31.5, R.bannerB], [-25, R.bannerC], [-10.5, R.bannerA], [9.5, R.bannerB], [26, R.bannerA], [33, R.bannerC], [39.5, R.bannerB]] as const) {
    tq({ a, w: WALL.t + 0.05, da: 1, dw: 0, na: 0, nw: 1 }, r, -1.5, 1.5, g + 0.4, g + 1.6, '#c4262b', 1, g + 0.4);
    paint('#55575a', nr);
    fbox(nr, f, a - 1.5, a + 1.5, WALL.t, WALL.t + 0.05, g + 0.4, g + 1.6);
  }
  let k = 0;
  for (let a = -44; a <= 44; a += 4, k++) {
    if (Math.abs(a) < 5.5 || (a > SIDE.a - 3 && a < SIDE.a + 3)) continue;
    paint('#d8d8d2', nr);
    fbox(nr, f, a - 0.02, a + 0.02, -0.02, 0.02, g + WALL.h, g + WALL.h + 1.5);
    const flag = paint(FLAGS[k % FLAGS.length]!, nr);
    const q: [V3, V3, V3, V3] = [P(f, a + 0.03, g + WALL.h + 0.6, 0), P(f, a + 0.38, g + WALL.h + 0.6, 0), P(f, a + 0.38, g + WALL.h + 1.45, 0), P(f, a + 0.03, g + WALL.h + 1.45, 0)];
    quadOut(flag, ...q, OUT);
    quadOut(flag, ...q, nrm(0, -1));
  }
  const motos: number[] = [];
  const yaw = Math.atan2(-TP_UW[0], -TP_UW[1]); // noses to the wall
  for (const [a0, n] of [[-22, 6], [22.5, 5], [36, 4]] as const) {
    for (let m = 0; m < n; m++) {
      const p = P(f, a0 + m * 0.78, 0, 1.15);
      pushMatrix(motos, p[0], g + 0.05, p[2], yaw, 0.96 + 0.08 * (m % 2));
    }
    solid(a0 - 0.4, a0 + n * 0.78, 0.2, 2.0, g, g + 1.1);
  }

  const out = s.out();
  return {
    ...out,
    instances: [{ kind: 'tree', matrices: new Float32Array(trees) }, { kind: 'moto', matrices: new Float32Array(motos) }],
    ...(image ? { textures: [{ material: 'mural' as const, image }] } : {}),
  };
};
