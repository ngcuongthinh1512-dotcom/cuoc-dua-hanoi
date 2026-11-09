// ── Nhà hàng Lục Thủy & Không gian Văn hóa Việt (16 Lê Thái Tổ, Hoàn Kiếm; OSM way/701882954 = the villa, way/701882953 =
// "Không gian Văn hóa Việt" (community centre of the Nhà hát Nghệ thuật Đương đại), both in chunk −1_1, on the WEST side of
// Phố Lê Thái Tổ: its centre line runs due south at x ≈ −75.8 past z 346…376 (2 lanes one-way, kerb x −79.05, the OSM
// sidewalk out to −82.5), the lake's west shore 20 m further east. So the façade faces EAST onto the street with hồ Hoàn
// Kiếm across it; the OSM villa outline (x −102…−88, z 352…374, 21 × 10.5 m, drawn 12° askew) is replaced by a villa square
// to the street with its front 6.5 m behind the kerb. After the owner's three Street View photos: a two-storey white
// French-colonial villa — bold green dado (1.5 m, a Greek-key meander in relief), white walls with pilasters and large
// recessed panels, tall windows with white fretwork transoms (round / square lattice medallions, little square lattice
// windows), a white balustrade band under the first-floor windows, a dentilled cornice under wide hipped eaves on a low dark
// roof; in the middle the green entrance portal (deep jambs, a pierced balcony parapet over it, three green steps, a dark
// door with ornamental glass, the brass stand sign and an A-frame menu); a round "Lục Thủy" sign hangs north of it, the
// cream / green board "NHÀ HÀNG LỤC THỦY" south of it. South of the villa (the viewer on the street facing west has south
// on his LEFT) the lower open terrace "KHÔNG GIAN VĂN HÓA VIỆT": round green cast-iron columns, white fretwork beams, a white
// louvred canopy in three flat sections with the big white / green sign on the middle one, palms in pots, a living-wall hedge
// at the back, round black tables with brown rattan chairs on grey slate paving; the cream theatre block of the Nhà hát
// behind it. The forecourt: grey slate tiles from the façade to the kerb, big old trees (whitewashed trunks, yellow number
// tags) in clipped boxwood beds along the kerb. Frame: origin LT = the middle of the villa's façade line (world
// (−85.5, 363.0) = 21.02887 N, 105.85103 E), a = north (the viewer on the street looking west has +a on his RIGHT), w = east
// (out of the façade towards the kerb at w 6.45). All the painted detail is ONE 2048² OffscreenCanvas atlas on 'mural'
// (this chunk's only mural user; the theatre record draws with the same layout and returns no image); without
// OffscreenCanvas the faces are plain white. The signs, the portal lanterns and the terrace bulbs have a twin on 'neonSign'
// (landmarks/index.ts: unlit, visible only when night.glowOn(): dusk / night), 1 cm proud of the plain one. Solid
// (Sink.prism): villa, portal jambs + steps, columns, living wall, hedge beds, tables, planters, the theatre; the clue box
// spot LT_BOX (a 0, w 3: the slate in front of the portal, 2 m off the bottom step) stays clear within 3 m. ≈ 7k tris.
import { type BuildingRec, ringArea } from '../../geo/chunkData.ts';
import type { MeshBuffer as Buf, V3 } from '../geom.ts';
import { pushMatrix } from '../StreetProps.ts';
import { DOWN, fbox, P, rgb, UP } from './b.ts';
import { lathe } from './d.ts';
import { frameAt, hipRoof } from './h3.ts';
import type { DetailFn } from './index.ts';
import { quadOut, triOut } from './kit.ts';
import { Sink } from './parts.ts';

/** Middle of the villa's façade line (world x, z). */
export const LT: [number, number] = [-85.5, 363.0];
/** Clue box spot: the slate forecourt in front of the portal, 3 m out from the façade line (2 m off the bottom step, 3.4 m inside the kerb). */
export const LT_BOX: [number, number] = [LT[0] + 3.0, LT[1]];

// ── dimensions (m) ──
const HALF = 10.5; // villa half-length along the street
const BACK = -10.5; // villa back wall
const EAVE = 8.6;
const DADO = 1.5;
const OVER = 1.3; // eave overhang
const KERB = 6.45;
const SLAB = 0.215; // the slate forecourt top (RoadBuilder sidewalk top 0.20 + 1.5 cm)
// frame f2 (the terrace, the theatre, the south half of the forecourt): the street bends 10.6° west south of the villa (centre
// line (−76.4, 375.9) → (−81.7, 404.2)), so these follow the bend; f2's origin is the façade line at the villa's south end (a −12 in f),
// its a2 along the bent kerb (north-north-east), the kerb at w2 5.75
const F2_U = [0.184, -0.983] as const;
const KERB2 = 5.75;
const PAV = { a0: -24.5, a1: -1.0, front: -2.2, back: -10.0, beam: 3.2, top: 3.6 }; // f2
const TH = { a0: -40, a1: 0, front: -12.5, back: -38, eave: 9.5 }; // f2
const BAY = 3.0; // 7 bays
const PILASTERS = [-HALF + 0.25, -7.5, -4.5, -1.5, 1.5, 4.5, 7.5, HALF - 0.25]; // a of the front / back pilasters (bay lines + corners)

const WHITE = '#f4f2ec';
const GREEN = '#2a8f3c';
const GREEN_D = '#1f7030';
const GREEN_L = '#49a85a';
const DARK = '#1e2426';
const ROOF = '#55585b';
const RATTAN = '#7d4b2a';
const CREAM = '#efe4c6';
const TILE = '#8f6a55'; // the theatre's weathered tile roof
const HEDGE = '#2f7a30';
const STONE = '#b9b6ad';

// ── atlas: px regions with their metre bounds m = [s0, y0, s1, y1] (s along the face, y up; v = 0 is the image's top row) ──
interface Reg { x: number; y: number; w: number; h: number; m: readonly [number, number, number, number] }
const [AW, AH] = [2048, 2048];
const PX = 60;
const reg = (x: number, y: number, s0: number, y0: number, s1: number, y1: number, px = PX): Reg =>
  ({ x, y, w: Math.round((s1 - s0) * px), h: Math.round((y1 - y0) * px), m: [s0, y0, s1, y1] });
const R = {
  front: reg(0, 0, -HALF, 0, HALF, EAVE),
  side: reg(1270, 0, -5.25, 0, 5.25, EAVE),
  back: reg(0, 526, -HALF, 0, HALF, EAVE),
  theatre: reg(1270, 526, -8, 0, 8, TH.eave, 40),
  board: reg(0, 1060, -3.2, 0, 3.2, 1.0, 100),
  banner: reg(660, 1060, -1.5, 0, 1.5, 3.0, 80),
  logo: reg(920, 1060, -0.45, 0, 0.45, 0.9, 100),
  door: reg(1030, 1060, -0.8, 0, 0.8, 3.3, 80),
  menu: reg(1180, 1060, -0.35, 0, 0.35, 1.0, 100),
  lattice: reg(1270, 1060, -2, 0, 2, 0.4, 100),
  glow: reg(1700, 1060, 0, 0, 1, 1, 50),
  leaf: reg(1270, 1120, -2, 0, 2, 2.6, 50),
  slate: reg(1500, 1120, 0, 0, 4, 4, 50),
  // 60 % copies of the three boards for their dusk glow twins ('neonSign' is bright enough for bulbs; a full-brightness board would bloom to white)
  boardG: reg(0, 1180, -3.2, 0, 3.2, 1.0, 100),
  bannerG: reg(660, 1320, -1.5, 0, 1.5, 3.0, 80),
  logoG: reg(920, 1180, -0.45, 0, 0.45, 0.9, 100),
};

const hash = (n: number) => { const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); };
type G = OffscreenCanvasRenderingContext2D;
const px = (r: Reg, s: number, y: number): [number, number] => [r.x + ((s - r.m[0]) / (r.m[2] - r.m[0])) * r.w, r.y + ((r.m[3] - y) / (r.m[3] - r.m[1])) * r.h];
const ppm = (r: Reg) => r.w / (r.m[2] - r.m[0]);
function rect(g: G, r: Reg, s0: number, y0: number, s1: number, y1: number, fill: string) {
  const [x0, yb] = px(r, s0, y0);
  const [x1, yt] = px(r, s1, y1);
  g.fillStyle = fill;
  g.fillRect(x0, yt, x1 - x0, yb - yt);
}
function line(g: G, r: Reg, s0: number, y0: number, s1: number, y1: number, wd: number, col: string) {
  g.strokeStyle = col; g.lineWidth = wd * ppm(r); g.lineCap = 'butt';
  g.beginPath(); g.moveTo(...px(r, s0, y0)); g.lineTo(...px(r, s1, y1)); g.stroke();
}
const FONT = '"Helvetica Neue", Helvetica, Arial, sans-serif';
const SERIF = 'Georgia, "Times New Roman", serif';

/** Greek-key meander in relief across the dado: light key over the green, a shadow line under each stroke. */
function meander(g: G, r: Reg, s0: number, s1: number, y0: number, y1: number) {
  const c = (y1 - y0) * 1.0; // cell width = height
  const pts: [number, number][] = [[0, 0], [0, 1], [0.78, 1], [0.78, 0.22], [0.22, 0.22], [0.22, 0.78], [0.56, 0.78], [0.56, 0.44]];
  g.save();
  const [cx0, cyt] = px(r, s0, y1);
  const [cx1, cyb] = px(r, s1, y0);
  g.beginPath(); g.rect(cx0, cyt, cx1 - cx0, cyb - cyt); g.clip();
  for (let s = s0; s < s1; s += c) {
    for (const [col, dy] of [['rgba(0,40,10,0.45)', -0.03], [GREEN_L, 0]] as const) {
      g.strokeStyle = col; g.lineWidth = 0.07 * ppm(r); g.lineJoin = 'miter';
      g.beginPath();
      pts.forEach(([u, v], i) => { const p = px(r, s + u * c, y0 + v * (y1 - y0) + dy); if (i) g.lineTo(...p); else g.moveTo(...p); });
      g.stroke();
      g.beginPath(); g.moveTo(...px(r, s + 0.78 * c, y0 + dy)); g.lineTo(...px(r, s + c, y0 + dy)); g.stroke(); // the base run to the next key
    }
  }
  g.restore();
}

/** White fretwork lattice over a dark opening: a frame, a diagonal grid and the medallion (circle or square) in the middle. */
function lattice(g: G, r: Reg, s0: number, y0: number, s1: number, y1: number, round: boolean) {
  rect(g, r, s0, y0, s1, y1, DARK);
  const p = ppm(r);
  g.save();
  const [x0, yb] = px(r, s0, y0);
  const [x1, yt] = px(r, s1, y1);
  g.beginPath(); g.rect(x0, yt, x1 - x0, yb - yt); g.clip();
  g.strokeStyle = '#f2f0ea'; g.lineWidth = Math.max(1, 0.025 * p);
  const step = 0.16;
  for (let d = -(y1 - y0); d < s1 - s0 + (y1 - y0); d += step) {
    g.beginPath(); g.moveTo(...px(r, s0 + d, y0)); g.lineTo(...px(r, s0 + d + (y1 - y0), y1)); g.stroke();
    g.beginPath(); g.moveTo(...px(r, s0 + d, y1)); g.lineTo(...px(r, s0 + d + (y1 - y0), y0)); g.stroke();
  }
  const [cx, cy] = px(r, (s0 + s1) / 2, (y0 + y1) / 2);
  const rad = Math.min(s1 - s0, y1 - y0) * 0.36 * p;
  g.fillStyle = DARK; g.strokeStyle = '#f2f0ea'; g.lineWidth = Math.max(1.5, 0.05 * p);
  g.beginPath();
  if (round) g.arc(cx, cy, rad, 0, Math.PI * 2); else g.rect(cx - rad, cy - rad, 2 * rad, 2 * rad);
  g.fill(); g.stroke();
  g.lineWidth = Math.max(1, 0.03 * p);
  g.beginPath(); // a diamond + cross inside the medallion
  g.moveTo(cx, cy - rad * 0.7); g.lineTo(cx + rad * 0.7, cy); g.lineTo(cx, cy + rad * 0.7); g.lineTo(cx - rad * 0.7, cy); g.closePath();
  g.moveTo(cx - rad, cy); g.lineTo(cx + rad, cy); g.moveTo(cx, cy - rad); g.lineTo(cx, cy + rad);
  g.stroke();
  g.restore();
  line(g, r, s0, y0, s1, y0, 0.05, '#f2f0ea'); line(g, r, s0, y1, s1, y1, 0.05, '#f2f0ea');
  line(g, r, s0, y0, s0, y1, 0.05, '#f2f0ea'); line(g, r, s1, y0, s1, y1, 0.05, '#f2f0ea');
}

/** Recessed white panel with its moulding (shadow on the top / left edge, highlight bottom / right). */
function panel(g: G, r: Reg, s0: number, y0: number, s1: number, y1: number) {
  rect(g, r, s0, y0, s1, y1, 'rgba(60,60,55,0.22)');
  rect(g, r, s0 + 0.06, y0 + 0.06, s1 - 0.06, y1 - 0.06, '#ecebe5');
  rect(g, r, s0 + 0.06, y1 - 0.12, s1 - 0.06, y1 - 0.06, 'rgba(60,60,55,0.18)');
  rect(g, r, s0 + 0.06, y0 + 0.06, s0 + 0.12, y1 - 0.06, 'rgba(60,60,55,0.18)');
  rect(g, r, s0 + 0.2, y0 + 0.2, s1 - 0.2, y1 - 0.2, 'rgba(60,60,55,0.12)');
  rect(g, r, s0 + 0.24, y0 + 0.24, s1 - 0.24, y1 - 0.24, WHITE);
}

/** A window centred at s: white frame proud of the wall, `kind` 'tall' = ground floor dark glazing with a lattice transom,
 *  'shut' = first floor white louvred shutters with a round medallion in the top panel, 'open' = shutters folded back, dark inside. */
function window(g: G, r: Reg, s: number, y0: number, y1: number, wd: number, kind: 'tall' | 'shut' | 'open') {
  const h = wd / 2;
  rect(g, r, s - h - 0.14, y0 - 0.16, s + h + 0.14, y1 + 0.14, 'rgba(60,60,55,0.25)'); // frame shadow
  rect(g, r, s - h - 0.12, y0 - 0.12, s + h + 0.12, y1 + 0.12, '#f8f7f2'); // frame
  rect(g, r, s - h - 0.22, y0 - 0.2, s + h + 0.22, y0 - 0.1, '#f8f7f2'); // sill
  rect(g, r, s - h - 0.22, y0 - 0.24, s + h + 0.22, y0 - 0.2, 'rgba(60,60,55,0.3)');
  const tr = y1 - 0.62; // transom
  if (kind === 'tall') {
    rect(g, r, s - h, y0, s + h, tr, DARK);
    rect(g, r, s - h, tr - (tr - y0) * 0.5, s + h, tr, 'rgba(120,150,170,0.22)'); // sky reflection
    line(g, r, s, y0, s, tr, 0.06, '#f2f0ea');
    for (let y = y0 + 0.75; y < tr - 0.2; y += 0.75) line(g, r, s - h, y, s + h, y, 0.045, '#f2f0ea');
    lattice(g, r, s - h, tr, s + h, y1, false);
  } else if (kind === 'shut') {
    rect(g, r, s - h, y0, s + h, tr, '#e9e8e2');
    line(g, r, s, y0, s, tr, 0.04, 'rgba(60,60,55,0.5)');
    for (let y = y0 + 0.1; y < tr - 0.1; y += 0.085) line(g, r, s - h + 0.05, y, s + h - 0.05, y, 0.025, 'rgba(70,70,65,0.55)');
    rect(g, r, s - h, y0, s + h, y0 + 0.08, '#dcdbd4');
    lattice(g, r, s - h, tr, s + h, y1, true);
  } else {
    rect(g, r, s - h, y0, s + h, tr, '#2a2f31');
    rect(g, r, s - h, y0 + 0.9, s + h, y0 + 1.0, '#e9e8e2'); // a rail inside
    line(g, r, s, y0, s, tr, 0.04, '#e9e8e2');
    for (const sg of [-1, 1]) { // the leaves folded against the wall
      const x0 = s + sg * (h + 0.14);
      const x1 = s + sg * (h + 0.52);
      rect(g, r, Math.min(x0, x1), y0, Math.max(x0, x1), tr, '#e9e8e2');
      for (let y = y0 + 0.1; y < tr - 0.1; y += 0.085) line(g, r, Math.min(x0, x1) + 0.04, y, Math.max(x0, x1) - 0.04, y, 0.025, 'rgba(70,70,65,0.5)');
    }
    lattice(g, r, s - h, tr, s + h, y1, true);
  }
}

/** Small square lattice window (0.6 m) at (s, yc). */
const peep = (g: G, r: Reg, s: number, yc: number, d = 0.6) => {
  rect(g, r, s - d / 2 - 0.08, yc - d / 2 - 0.08, s + d / 2 + 0.08, yc + d / 2 + 0.08, '#f8f7f2');
  lattice(g, r, s - d / 2, yc - d / 2, s + d / 2, yc + d / 2, false);
};

/** Pilaster at s: a slightly brighter strip with shadowed edges, a sunk flute and a fretwork capital. */
function pilaster(g: G, r: Reg, s: number, wd = 0.44) {
  rect(g, r, s - wd / 2 - 0.04, DADO + 0.1, s + wd / 2 + 0.04, 8.1, 'rgba(60,60,55,0.28)');
  rect(g, r, s - wd / 2, DADO + 0.1, s + wd / 2, 8.1, '#f9f8f3');
  rect(g, r, s - wd / 2 + 0.1, DADO + 0.6, s + wd / 2 - 0.1, 7.4, 'rgba(60,60,55,0.16)');
  rect(g, r, s - wd / 2 + 0.13, DADO + 0.63, s + wd / 2 - 0.13, 7.37, '#f4f3ee');
  g.save();
  const p = ppm(r);
  const [cx, cy] = px(r, s, 7.75);
  g.strokeStyle = 'rgba(60,60,55,0.55)'; g.lineWidth = Math.max(1, 0.02 * p);
  for (let i = -2; i <= 2; i++) { // the capital: a small square key pattern
    g.strokeRect(cx + i * 0.08 * p - 0.03 * p, cy - 0.03 * p, 0.06 * p, 0.06 * p);
    g.strokeRect(cx + i * 0.08 * p - 0.03 * p, cy - 0.14 * p, 0.06 * p, 0.06 * p);
  }
  g.restore();
}

/** Common bands of every villa face: white wall, green dado + meander + ledge, the balustrade band, the dentilled cornice. */
function bands(g: G, r: Reg, balusters: [number, number][]) {
  const [s0, s1] = [r.m[0], r.m[2]];
  g.fillStyle = WHITE; g.fillRect(r.x, r.y, r.w, r.h);
  // soft weathering: pale grey blotches, grime towards the ground
  let k = r.x * 7 + 3;
  for (let i = 0; i < (r.w * r.h) / 9000; i++) {
    const [x, y, rad] = [r.x + hash(k++) * r.w, r.y + hash(k++) * r.h, 20 + hash(k++) * 70];
    const near = (y - r.y) / r.h;
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, `rgba(120,118,110,${0.03 + near * 0.06})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  rect(g, r, s0, 0, s1, DADO - 0.08, GREEN);
  rect(g, r, s0, 0, s1, 0.3, GREEN_D);
  meander(g, r, s0 - 0.1, s1 + 0.1, 0.5, 1.1);
  rect(g, r, s0, DADO - 0.08, s1, DADO + 0.02, GREEN_L); // the ledge
  rect(g, r, s0, DADO - 0.11, s1, DADO - 0.08, 'rgba(0,30,5,0.5)');
  rect(g, r, s0, DADO + 0.02, s1, DADO + 0.07, 'rgba(60,60,55,0.25)');
  // balustrade band 4.2 … 4.9: two ledges, balusters under the first-floor windows
  rect(g, r, s0, 4.2, s1, 4.3, '#f9f8f3'); rect(g, r, s0, 4.16, s1, 4.2, 'rgba(60,60,55,0.3)');
  rect(g, r, s0, 4.82, s1, 4.94, '#f9f8f3'); rect(g, r, s0, 4.78, s1, 4.82, 'rgba(60,60,55,0.3)');
  for (const [b0, b1] of balusters) {
    rect(g, r, b0, 4.3, b1, 4.82, '#eeede7');
    for (let s = b0 + 0.1; s < b1 - 0.05; s += 0.2) {
      rect(g, r, s, 4.34, s + 0.1, 4.78, 'rgba(40,40,38,0.75)');
      rect(g, r, s + 0.1, 4.34, s + 0.2, 4.78, '#f6f5f0');
    }
  }
  // cornice 8.1 … 8.6: shadow line, dentils, the fascia band
  rect(g, r, s0, 8.1, s1, 8.16, 'rgba(60,60,55,0.4)');
  rect(g, r, s0, 8.16, s1, 8.3, '#f6f5f0');
  for (let s = s0 + 0.1; s < s1; s += 0.3) rect(g, r, s, 8.3, s + 0.15, 8.42, 'rgba(60,60,55,0.5)');
  rect(g, r, s0, 8.42, s1, EAVE, '#f9f8f3');
}

function frontFace(g: G, r: Reg) {
  const bays: [number, number][] = [];
  for (let b = 1; b <= 3; b++) bays.push([b * BAY - 0.9, b * BAY + 0.9], [-b * BAY - 0.9, -b * BAY + 0.9]);
  bands(g, r, bays);
  for (const a of PILASTERS) pilaster(g, r, a);
  // north bays (+a, the viewer's right): tall windows downstairs, shuttered windows upstairs (the middle one open)
  for (let b = 1; b <= 3; b++) {
    window(g, r, b * BAY, 1.85, 4.0, 1.5, 'tall');
    window(g, r, b * BAY, 5.2, 7.7, 1.5, b === 2 ? 'open' : 'shut');
  }
  // south bays (−a, the viewer's left): recessed panels with little lattice windows downstairs, windows + medallions upstairs
  for (let b = 1; b <= 3; b++) {
    const s = -b * BAY;
    panel(g, r, s - 1.1, 1.8, s + 1.1, 4.0);
    if (b !== 2) peep(g, r, s, 3.3);
    window(g, r, s, 5.2, 7.7, 1.4, b === 3 ? 'open' : 'shut');
    peep(g, r, s - 1.25, 5.0, 0.36); peep(g, r, s + 1.25, 5.0, 0.36);
  }
  // the portal bay: green between the jambs up to the parapet, the first-floor door above it
  rect(g, r, -1.4, 0, 1.4, 5.3, GREEN);
  meander(g, r, -1.4, 1.4, 4.45, 5.05);
  rect(g, r, -1.1, 0.45, 1.1, 3.35, DARK);
  window(g, r, 0, 5.5, 7.8, 1.3, 'tall');
  // house number plate right of the portal
  rect(g, r, 1.5, 3.0, 1.74, 3.2, '#1a56a6');
  g.fillStyle = '#ffffff'; g.font = `bold ${Math.round(0.12 * ppm(r))}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('16', ...px(r, 1.62, 3.1));
}

function sideFace(g: G, r: Reg) {
  bands(g, r, [[-3.5, -1.5], [1.5, 3.5]]);
  pilaster(g, r, -5.0); pilaster(g, r, 5.0); pilaster(g, r, 0);
  for (const s of [-2.5, 2.5]) {
    panel(g, r, s - 1.3, 1.8, s + 1.3, 4.0);
    peep(g, r, s, 3.3);
    window(g, r, s, 5.2, 7.7, 1.4, 'shut');
    peep(g, r, s - 1.4, 5.0, 0.36); peep(g, r, s + 1.4, 5.0, 0.36);
  }
}

function backFace(g: G, r: Reg) {
  bands(g, r, [[-7.6, -5.4], [-1.1, 1.1], [5.4, 7.6]]);
  for (const a of PILASTERS) pilaster(g, r, a);
  for (const s of [-6.5, 0, 6.5]) {
    window(g, r, s, 1.85, 4.0, 1.4, 'tall');
    window(g, r, s, 5.2, 7.7, 1.4, 'shut');
  }
  for (const s of [-3.3, 3.3]) { panel(g, r, s - 1.0, 1.8, s + 1.0, 4.0); panel(g, r, s - 1.0, 5.2, s + 1.0, 7.7); }
}

/** The theatre block's face: cream stucco, white floor band and cornice, white-framed windows every 4 m on two floors. */
function theatreFace(g: G, r: Reg) {
  g.fillStyle = CREAM; g.fillRect(r.x, r.y, r.w, r.h);
  rect(g, r, r.m[0], 0, r.m[2], 0.6, '#b9a98a');
  rect(g, r, r.m[0], 4.4, r.m[2], 4.75, '#f6f1e2');
  rect(g, r, r.m[0], 8.9, r.m[2], TH.eave, '#f6f1e2');
  rect(g, r, r.m[0], 8.84, r.m[2], 8.9, 'rgba(60,50,30,0.4)');
  for (const s of [-6, -2, 2, 6]) {
    for (const [y0, y1] of [[1.2, 3.6], [5.3, 7.9]] as const) {
      rect(g, r, s - 0.75, y0 - 0.12, s + 0.75, y1 + 0.12, '#f8f6ee');
      rect(g, r, s - 0.6, y0, s + 0.6, y1, '#2a2e30');
      line(g, r, s, y0, s, y1, 0.06, '#f2f0ea');
      line(g, r, s - 0.6, (y0 + y1) / 2, s + 0.6, (y0 + y1) / 2, 0.05, '#f2f0ea');
    }
  }
}

function signs(g: G) {
  g.textAlign = 'center'; g.textBaseline = 'middle';
  // the terrace board: white, a green frame, the green ornamental capitals
  const b = R.board;
  g.fillStyle = '#fbfaf5'; g.fillRect(b.x, b.y, b.w, b.h);
  g.strokeStyle = GREEN_D; g.lineWidth = 5; g.strokeRect(b.x + 4, b.y + 4, b.w - 8, b.h - 8);
  g.lineWidth = 2; g.strokeRect(b.x + 12, b.y + 12, b.w - 24, b.h - 24);
  g.font = `bold 56px ${SERIF}`;
  g.fillStyle = '#145a26'; g.fillText('KHÔNG GIAN VĂN HÓA VIỆT', b.x + b.w / 2 + 2, b.y + b.h / 2 + 3, b.w - 60);
  g.fillStyle = '#1f8a3a'; g.fillText('KHÔNG GIAN VĂN HÓA VIỆT', b.x + b.w / 2, b.y + b.h / 2, b.w - 60);
  // the villa's board: cream with a green head band, the lotus logo, three lines of small green text
  const n = R.banner;
  g.fillStyle = '#f4eedb'; g.fillRect(n.x, n.y, n.w, n.h);
  g.fillStyle = GREEN_D; g.fillRect(n.x, n.y, n.w, 58);
  g.fillStyle = '#f7f3e4'; g.font = `bold 26px ${SERIF}`; g.fillText('NHÀ HÀNG LỤC THỦY', n.x + n.w / 2, n.y + 30, n.w - 16);
  logo(g, n.x + n.w / 2, n.y + 112, 40);
  g.fillStyle = '#1f6f30'; g.font = `bold 15px ${FONT}`;
  g.fillText('ẨM THỰC VIỆT · CÀ PHÊ · LOUNGE', n.x + n.w / 2, n.y + 172, n.w - 20);
  g.font = `14px ${FONT}`;
  g.fillText('TIỆC · HỘI NGHỊ · SỰ KIỆN', n.x + n.w / 2, n.y + 196, n.w - 20);
  g.fillText('16 LÊ THÁI TỔ · HOÀN KIẾM', n.x + n.w / 2, n.y + 220, n.w - 20);
  g.strokeStyle = GREEN_D; g.lineWidth = 3; g.strokeRect(n.x + 1.5, n.y + 1.5, n.w - 3, n.h - 3);
  // the round hanging sign: dark green disc, cream ring, the logo
  const l = R.logo;
  g.fillStyle = '#f4eedb'; g.fillRect(l.x, l.y, l.w, l.h);
  g.fillStyle = '#17512a'; g.beginPath(); g.arc(l.x + l.w / 2, l.y + l.h / 2, l.w / 2 - 1, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#e9dcb0'; g.lineWidth = 3; g.beginPath(); g.arc(l.x + l.w / 2, l.y + l.h / 2, l.w / 2 - 6, 0, Math.PI * 2); g.stroke();
  g.fillStyle = '#f4eedb'; g.font = `italic bold 22px ${SERIF}`; g.fillText('Lục Thủy', l.x + l.w / 2, l.y + l.h / 2 - 4, l.w - 14);
  g.font = `8px ${FONT}`; g.fillText('RESTAURANT & LOUNGE', l.x + l.w / 2, l.y + l.h / 2 + 16, l.w - 10);
  // the door: dark green-black, a tall glazed panel with art-nouveau curls, a brass handle
  const d = R.door;
  g.fillStyle = '#17241c'; g.fillRect(d.x, d.y, d.w, d.h);
  rect(g, d, -0.6, 0.35, 0.6, 2.95, '#0f1a14');
  rect(g, d, -0.52, 1.25, 0.52, 2.9, '#1d2c33'); // the glass
  g.save(); g.beginPath(); const [gx, gy] = px(d, -0.52, 2.9); const [gx1, gy1] = px(d, 0.52, 1.25); g.rect(gx, gy, gx1 - gx, gy1 - gy); g.clip();
  g.strokeStyle = '#d9c99a'; g.lineWidth = 2.5;
  for (const sg of [-1, 1]) {
    g.beginPath(); g.moveTo(...px(d, 0, 1.3)); g.bezierCurveTo(...px(d, sg * 0.5, 1.6), ...px(d, sg * 0.5, 2.3), ...px(d, 0, 2.6)); g.stroke();
    g.beginPath(); g.moveTo(...px(d, sg * 0.45, 2.85)); g.bezierCurveTo(...px(d, sg * 0.1, 2.75), ...px(d, sg * 0.1, 2.2), ...px(d, sg * 0.45, 2.0)); g.stroke();
  }
  g.beginPath(); g.arc(...px(d, 0, 2.05), 0.16 * ppm(d), 0, Math.PI * 2); g.stroke();
  g.restore();
  rect(g, d, -0.52, 0.45, 0.52, 1.15, '#1c2a22'); // the lower panel
  rect(g, d, -0.44, 0.52, 0.44, 1.08, '#223328');
  g.fillStyle = '#c9a24a'; g.beginPath(); g.arc(...px(d, 0.42, 1.2), 4, 0, Math.PI * 2); g.fill();
  // the A-frame menu board: white with a green head and menu lines
  const m = R.menu;
  g.fillStyle = '#f8f6ef'; g.fillRect(m.x, m.y, m.w, m.h);
  g.fillStyle = GREEN_D; g.fillRect(m.x, m.y, m.w, 20);
  g.fillStyle = '#ffffff'; g.font = `bold 12px ${SERIF}`; g.fillText('MENU', m.x + m.w / 2, m.y + 10);
  g.fillStyle = '#2f6f3a';
  for (let y = 30; y < m.h - 6; y += 9) { g.fillRect(m.x + 8, m.y + y, m.w - 16 - (y % 18 ? 10 : 0), 2); }
  g.strokeStyle = GREEN_D; g.lineWidth = 2; g.strokeRect(m.x + 1, m.y + 1, m.w - 2, m.h - 2);
  // the fretwork band of the terrace beams: white, grey-green lattice of diagonals and rings
  const t = R.lattice;
  g.fillStyle = '#f6f5f0'; g.fillRect(t.x, t.y, t.w, t.h);
  g.save(); g.beginPath(); g.rect(t.x, t.y, t.w, t.h); g.clip();
  g.strokeStyle = '#8aa58e'; g.lineWidth = 2;
  for (let x = t.x - t.h; x < t.x + t.w + t.h; x += 20) {
    g.beginPath(); g.moveTo(x, t.y); g.lineTo(x + t.h, t.y + t.h); g.stroke();
    g.beginPath(); g.moveTo(x, t.y + t.h); g.lineTo(x + t.h, t.y); g.stroke();
  }
  for (let x = t.x + 20; x < t.x + t.w; x += 40) { g.beginPath(); g.arc(x, t.y + t.h / 2, 11, 0, Math.PI * 2); g.stroke(); }
  g.restore();
  g.fillStyle = GREEN_D; g.fillRect(t.x, t.y, t.w, 3); g.fillRect(t.x, t.y + t.h - 3, t.w, 3);
  // the glow swatch, the living wall, the slate
  const w = R.glow; g.fillStyle = '#fff0cc'; g.fillRect(w.x, w.y, w.w, w.h);
  const f = R.leaf;
  g.fillStyle = '#244d22'; g.fillRect(f.x, f.y, f.w, f.h);
  let k = 11;
  for (let i = 0; i < 900; i++) {
    const [x, y, rr] = [f.x + hash(k++) * f.w, f.y + hash(k++) * f.h, 3 + hash(k++) * 6];
    g.fillStyle = ['#2f6b2c', '#3f8a3a', '#5aa64c', '#2a5a28', '#77b85e'][Math.floor(hash(k++) * 5)]!;
    g.beginPath(); g.ellipse(x, y, rr, rr * 0.6, hash(k++) * Math.PI, 0, Math.PI * 2); g.fill();
  }
  const s = R.slate;
  g.fillStyle = '#5c6063'; g.fillRect(s.x, s.y, s.w, s.h);
  const cell = s.w / 6; // 0.67 m tiles
  for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) {
    const v = 0.78 + hash(k++) * 0.3;
    g.fillStyle = `rgb(${Math.round(122 * v)},${Math.round(126 * v)},${Math.round(128 * v)})`;
    g.fillRect(s.x + i * cell + 1.5, s.y + j * cell + 1.5, cell - 3, cell - 3);
  }
}

function logo(g: G, cx: number, cy: number, r: number) {
  g.fillStyle = '#17512a'; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#e9dcb0'; g.lineWidth = 2.5;
  for (const t of [-0.5, 0, 0.5]) { // three lotus petals
    g.beginPath(); g.moveTo(cx, cy + r * 0.55); g.quadraticCurveTo(cx + t * r * 1.3 - r * 0.35, cy - r * 0.1, cx + t * r * 0.9, cy - r * 0.6); g.quadraticCurveTo(cx + t * r * 1.3 + r * 0.35, cy - r * 0.1, cx, cy + r * 0.55); g.stroke();
  }
  g.beginPath(); g.moveTo(cx - r * 0.8, cy + r * 0.62); g.quadraticCurveTo(cx, cy + r * 0.3, cx + r * 0.8, cy + r * 0.62); g.stroke(); // the water
}

function paintAtlas(): ImageBitmap | undefined {
  if (typeof OffscreenCanvas === 'undefined') return;
  const c = new OffscreenCanvas(AW, AH);
  const g = c.getContext('2d');
  if (!g) return;
  g.fillStyle = WHITE;
  g.fillRect(0, 0, AW, AH);
  frontFace(g, R.front);
  sideFace(g, R.side);
  backFace(g, R.back);
  theatreFace(g, R.theatre);
  signs(g);
  for (const [src, dst] of [[R.board, R.boardG], [R.banner, R.bannerG], [R.logo, R.logoG]] as const) { // 60 % copies for the glow twins
    g.fillStyle = '#000000'; g.fillRect(dst.x, dst.y, dst.w, dst.h);
    g.globalAlpha = 0.6; g.drawImage(c, src.x, src.y, src.w, src.h, dst.x, dst.y, dst.w, dst.h); g.globalAlpha = 1;
  }
  return c.transferToImageBitmap();
}

/** A vertical plane of the frame: origin (a, w), s runs along (da, dw), outward normal (na, nw) (frame coordinates). */
interface Pl { a: number; w: number; da: number; dw: number; na: number; nw: number }

export const lucThuy: DetailFn = (rec: BuildingRec, _parts, ctx) => {
  const g = ctx.ground;
  const s = new Sink();
  const f = frameAt(LT[0], LT[1], 0, -1); // a = north, w = east (towards the street)
  const f2 = frameAt(LT[0], LT[1] + 12, F2_U[0], F2_U[1]); // see F2_U
  let cur = f; // the frame the helpers below build in (f2 from the terrace on)
  const nrm = (na: number, nw: number): V3 => [na * cur.ux - nw * cur.uz, 0, na * cur.uz + nw * cur.ux];
  const st = s.buf('masonry');
  const nr = s.buf('masonry', 'near');
  const paint = (hex: string, buf: Buf = st) => { buf.color = rgb(hex); return buf; };
  const villa = Math.abs(ringArea(rec.outer)) < 450; // the villa outline (≈ 220 m²); the other record is the big L of the Nhà hát
  const image = villa ? paintAtlas() : undefined;
  const textured = villa ? !!image : typeof OffscreenCanvas !== 'undefined';
  const mural = textured ? s.buf('mural') : undefined;
  const glo = textured ? s.buf('neonSign') : undefined;
  const solid = (a0: number, a1: number, w0: number, w1: number, y0: number, y1: number) =>
    s.prism([[P(cur, a0, 0, w0), P(cur, a1, 0, w0), P(cur, a1, 0, w1), P(cur, a0, 0, w1)].flatMap((p) => [p[0], p[2]])], y0, y1);

  // ── textured faces ──
  const pt = (pl: Pl, sv: number, y: number) => P(cur, pl.a + sv * pl.da, y, pl.w + sv * pl.dw);
  const uv = (r: Reg, sv: number, y: number): [number, number] =>
    [(r.x + ((sv - r.m[0]) / (r.m[2] - r.m[0])) * r.w) / AW, (r.y + ((r.m[3] - y) / (r.m[3] - r.m[1])) * r.h) / AH];
  /** Convex polygon (s, y) on a plane, textured from region r (fan); s scaled by `ms` (region m per face m), the region's
   *  y = 0 at face height `ys`. `buf` = mural (default) or the glow twin. */
  const tpoly = (pl: Pl, r: Reg, pts: [number, number][], fallback = WHITE, ms = 1, ys = g, buf = mural) => {
    const out = nrm(pl.na, pl.nw);
    for (let i = 1; i + 1 < pts.length; i++) {
      const [p0, p1, p2] = [pts[0]!, pts[i]!, pts[i + 1]!];
      if (!buf) { triOut(paint(fallback), pt(pl, ...p0), pt(pl, ...p1), pt(pl, ...p2), out); continue; }
      const [u0, u1, u2] = [uv(r, p0[0] * ms, p0[1] - ys), uv(r, p1[0] * ms, p1[1] - ys), uv(r, p2[0] * ms, p2[1] - ys)];
      triOut(buf, pt(pl, ...p0), pt(pl, ...p1), pt(pl, ...p2), out, [u0[0], u0[1], u1[0], u1[1], u2[0], u2[1]]);
    }
  };
  const tq = (pl: Pl, r: Reg, s0: number, s1: number, y0: number, y1: number, fallback = WHITE, ms = 1, ys = g, buf = mural) =>
    tpoly(pl, r, [[s0, y0], [s1, y0], [s1, y1], [s0, y1]], fallback, ms, ys, buf);
  /** Horizontal textured quad (a0..a1 × w0..w1) at y from region r (its metres = the quad's, from (a0, w0)). */
  const hq = (a0: number, a1: number, w0: number, w1: number, y: number, r: Reg, fallback: string) => {
    const q: [V3, V3, V3, V3] = [P(cur, a0, y, w0), P(cur, a1, y, w0), P(cur, a1, y, w1), P(cur, a0, y, w1)];
    if (!mural) { quadOut(paint(fallback), ...q, UP); return; }
    const [u0, v0] = uv(r, 0, 0);
    const [u1, v1] = uv(r, a1 - a0, w1 - w0);
    quadOut(mural, ...q, UP, u0, v0, u1, v1);
  };
  /** Plain-coloured day box + its glow twin (unlit at dusk, hidden by day) 1 cm bigger: lamps and bulbs. */
  const lamp = (a0: number, a1: number, w0: number, w1: number, y0: number, y1: number, hex = '#efe6cf') => {
    fbox(paint(hex, nr), cur, a0, a1, w0, w1, y0, y1);
    if (!glo) return;
    const d = 0.01;
    const [u, v] = uv(R.glow, 0.5, 0.5);
    const c = (a: number, y: number, w: number) => P(cur, a, y, w);
    const faces: [V3, V3, V3, V3, V3][] = [
      [c(a0 - d, y0 - d, w1 + d), c(a1 + d, y0 - d, w1 + d), c(a1 + d, y1 + d, w1 + d), c(a0 - d, y1 + d, w1 + d), nrm(0, 1)],
      [c(a0 - d, y0 - d, w0 - d), c(a1 + d, y0 - d, w0 - d), c(a1 + d, y1 + d, w0 - d), c(a0 - d, y1 + d, w0 - d), nrm(0, -1)],
      [c(a1 + d, y0 - d, w0 - d), c(a1 + d, y0 - d, w1 + d), c(a1 + d, y1 + d, w1 + d), c(a1 + d, y1 + d, w0 - d), nrm(1, 0)],
      [c(a0 - d, y0 - d, w0 - d), c(a0 - d, y0 - d, w1 + d), c(a0 - d, y1 + d, w1 + d), c(a0 - d, y1 + d, w0 - d), nrm(-1, 0)],
      [c(a0 - d, y0 - d, w0 - d), c(a1 + d, y0 - d, w0 - d), c(a1 + d, y0 - d, w1 + d), c(a0 - d, y0 - d, w1 + d), DOWN],
    ];
    for (const [p0, p1, p2, p3, out] of faces) quadOut(glo, p0, p1, p2, p3, out, u, v, u, v);
  };

  if (!villa) {
    cur = f2;
    // ── the theatre block behind the terrace: cream colonial block, textured faces in ≤ 16 m pieces, cornice, tile hip roof ──
    const faces: [Pl, number][] = [
      [{ a: (TH.a0 + TH.a1) / 2, w: TH.front, da: 1, dw: 0, na: 0, nw: 1 }, TH.a1 - TH.a0],
      [{ a: (TH.a0 + TH.a1) / 2, w: TH.back, da: 1, dw: 0, na: 0, nw: -1 }, TH.a1 - TH.a0],
      [{ a: TH.a1, w: (TH.front + TH.back) / 2, da: 0, dw: 1, na: 1, nw: 0 }, TH.front - TH.back],
      [{ a: TH.a0, w: (TH.front + TH.back) / 2, da: 0, dw: 1, na: -1, nw: 0 }, TH.front - TH.back],
    ];
    for (const [pl, L] of faces) {
      const n = Math.ceil(L / 16);
      const bw = L / n;
      for (let i = 0; i < n; i++) {
        const sc = -L / 2 + (i + 0.5) * bw;
        tq({ ...pl, a: pl.a + sc * pl.da, w: pl.w + sc * pl.dw }, R.theatre, -bw / 2, bw / 2, g, g + TH.eave, CREAM, 16 / bw);
      }
    }
    paint('#f6f1e2');
    fbox(st, f2, TH.a0 - 0.3, TH.a1 + 0.3, TH.back - 0.3, TH.front + 0.3, g + TH.eave - 0.45, g + TH.eave);
    hipRoof(s, f2, TH.a0 - 0.9, TH.a1 + 0.9, TH.back - 0.9, TH.front + 0.9, g + TH.eave - 0.05, 3.2, 0, TILE);
    solid(TH.a0, TH.a1, TH.back, TH.front, g, g + TH.eave);
    return s.out();
  }

  // ── the villa: four textured faces, pilasters, ledges, cornice, hipped roof with white soffit and fascia ──
  tq({ a: 0, w: 0, da: 1, dw: 0, na: 0, nw: 1 }, R.front, -HALF, HALF, g, g + EAVE);
  tq({ a: 0, w: BACK, da: 1, dw: 0, na: 0, nw: -1 }, R.back, -HALF, HALF, g, g + EAVE);
  for (const sg of [-1, 1]) tq({ a: sg * HALF, w: BACK / 2, da: 0, dw: 1, na: sg, nw: 0 }, R.side, BACK / 2, -BACK / 2, g, g + EAVE);
  paint('#f9f8f3');
  for (const a of PILASTERS) fbox(st, f, a - 0.22, a + 0.22, 0, 0.08, g + DADO + 0.1, g + 8.1); // pilasters proud of the front
  for (const [y0, y1, d] of [[4.2, 4.3, 0.12], [4.82, 4.94, 0.12], [8.1, EAVE, 0.22]] as const) { // ledges + cornice round the whole body
    fbox(st, f, -HALF - d, HALF + d, BACK - d, d, g + y0, g + y1);
  }
  paint(GREEN_L);
  fbox(st, f, -HALF - 0.05, HALF + 0.05, BACK - 0.05, 0.05, g + DADO - 0.08, g + DADO + 0.02); // the dado ledge
  // roof: eaves at EAVE, 1.3 m overhang, low dark hip; white soffit under the overhang, a white fascia board on its edge
  const [ra0, ra1, rw0, rw1] = [-HALF - OVER, HALF + OVER, BACK - OVER, OVER];
  hipRoof(s, f, ra0, ra1, rw0, rw1, g + EAVE + 0.3, 2.0, 0, ROOF);
  paint('#f6f5f0');
  const soff = g + EAVE + 0.3;
  quadOut(st, P(f, ra0, soff, 0.22), P(f, ra1, soff, 0.22), P(f, ra1, soff, rw1), P(f, ra0, soff, rw1), DOWN);
  quadOut(st, P(f, ra0, soff, rw0), P(f, ra1, soff, rw0), P(f, ra1, soff, BACK - 0.22), P(f, ra0, soff, BACK - 0.22), DOWN);
  quadOut(st, P(f, HALF + 0.22, soff, rw0), P(f, ra1, soff, rw0), P(f, ra1, soff, rw1), P(f, HALF + 0.22, soff, rw1), DOWN);
  quadOut(st, P(f, ra0, soff, rw0), P(f, -HALF - 0.22, soff, rw0), P(f, -HALF - 0.22, soff, rw1), P(f, ra0, soff, rw1), DOWN);
  fbox(st, f, ra0, ra1, rw1 - 0.1, rw1, soff - 0.3, soff + 0.08);
  fbox(st, f, ra0, ra1, rw0, rw0 + 0.1, soff - 0.3, soff + 0.08);
  fbox(st, f, ra0, ra0 + 0.1, rw0, rw1, soff - 0.3, soff + 0.08);
  fbox(st, f, ra1 - 0.1, ra1, rw0, rw1, soff - 0.3, soff + 0.08);
  paint('#f6f5f0');
  fbox(st, f, -HALF, HALF, BACK, 0, g + EAVE, soff); // the wall band up to the soffit
  solid(-HALF, HALF, BACK, 0, g, g + EAVE);
  // downpipes at the corners
  paint('#c9c8c2', nr);
  for (const sg of [-1, 1]) lathe(nr, f, sg * (HALF - 0.7), 0.16, [[0.06, g + SLAB], [0.06, soff - 0.1], [0, soff - 0.1]], 6);

  // ── the portal: deep green jambs and lintel, the balcony parapet with its meander, three steps, the door, lanterns ──
  paint(GREEN);
  for (const sg of [-1, 1]) {
    fbox(st, f, sg * 1.35 - 0.45, sg * 1.35 + 0.45, 0, 0.38, g, g + 4.3);
    fbox(st, f, sg * 1.35 - 0.5, sg * 1.35 + 0.5, 0, 0.44, g + 3.9, g + 4.3); // capitals
    fbox(st, f, sg * 1.35 - 0.5, sg * 1.35 + 0.5, 0, 0.44, g, g + 0.6); // bases
    solid(sg * 1.35 - 0.45, sg * 1.35 + 0.45, 0, 0.38, g, g + 4.3);
  }
  fbox(st, f, -1.85, 1.85, 0, 0.5, g + 4.3, g + 4.55); // the entablature / balcony slab
  fbox(st, f, -1.85, 1.85, 0.42, 0.5, g + 4.55, g + 5.05); // the parapet
  tq({ a: 0, w: 0.505, da: 1, dw: 0, na: 0, nw: 1 }, R.lattice, -1.8, 1.8, g + 4.6, g + 5.0, WHITE, 4 / 3.6, g + 4.6);
  fbox(st, f, -1.85, 1.85, 0.38, 0.52, g + 5.05, g + 5.15); // the rail
  paint(GREEN_D);
  fbox(st, f, -1.5, 1.5, 0, 1.15, g, g + 0.15); // three steps
  fbox(st, f, -1.5, 1.5, 0, 0.8, g + 0.15, g + 0.3);
  fbox(st, f, -1.5, 1.5, 0, 0.45, g + 0.3, g + 0.45);
  solid(-1.5, 1.5, 0, 1.15, g, g + 0.45);
  tq({ a: 0, w: 0.02, da: 1, dw: 0, na: 0, nw: 1 }, R.door, -0.8, 0.8, g + 0.45, g + 3.35, DARK, 1, g + 0.45);
  paint('#2b2f31', nr);
  for (const sg of [-1, 1]) { // lanterns on the jambs: dark housing, a warm glass box
    fbox(nr, f, sg * 1.35 - 0.12, sg * 1.35 + 0.12, 0.38, 0.62, g + 3.0, g + 3.06);
    fbox(nr, f, sg * 1.35 - 0.12, sg * 1.35 + 0.12, 0.38, 0.62, g + 3.42, g + 3.5);
    lamp(sg * 1.35 - 0.1, sg * 1.35 + 0.1, 0.4, 0.6, g + 3.06, g + 3.42);
    paint('#2b2f31', nr);
  }
  // the brass stand sign and the A-frame menu board on the slate
  const br = s.buf('metal');
  paint('#c9a24a', br);
  lathe(br, f, 1.95, 0.75, [[0.2, g + SLAB], [0.04, g + SLAB + 0.05], [0.04, g + SLAB + 1.0], [0.1, g + SLAB + 1.05], [0, g + SLAB + 1.05]], 8);
  fbox(br, f, 1.95 - 0.22, 1.95 + 0.22, 0.73, 0.77, g + SLAB + 1.05, g + SLAB + 1.4);
  tq({ a: 1.95, w: 0.775, da: 1, dw: 0, na: 0, nw: 1 }, R.logo, -0.17, 0.17, g + SLAB + 1.05, g + SLAB + 1.39, '#17512a', 0.9 / 0.34, g + SLAB + 1.05);
  for (const [sg, w] of [[1, 1.95], [-1, 1.45]] as const) tq({ a: -2.6, w, da: 1, dw: 0, na: 0, nw: sg }, R.menu, -0.32, 0.32, g + SLAB, g + SLAB + 0.95, WHITE, 0.7 / 0.64, g + SLAB);
  paint('#5a4a3a', nr);
  fbox(nr, f, -2.95, -2.25, 1.45, 1.95, g + SLAB + 0.93, g + SLAB + 1.0); // the A-frame's top bar
  solid(-2.95, -2.25, 1.4, 2.0, g, g + 1.0);
  solid(1.7, 2.2, 0.5, 1.0, g, g + 1.4);

  // ── signs on the villa: the hanging round sign (north bay), the board (south bay), glow twins ──
  const dy = g + 3.55; // the hanging sign's centre
  const ring14 = Array.from({ length: 14 }, (_, k): [number, number] => [0.42 * Math.cos((2 * Math.PI * k) / 14), dy + 0.42 * Math.sin((2 * Math.PI * k) / 14)]);
  for (const [w, sg] of [[0.46, 1], [0.44, -1]] as const) tpoly({ a: 4.2, w, da: 1, dw: 0, na: 0, nw: sg }, R.logo, ring14, '#17512a', 0.45 / 0.42, dy - 0.45);
  if (glo) for (const [w, sg] of [[0.47, 1], [0.43, -1]] as const) tpoly({ a: 4.2, w, da: 1, dw: 0, na: 0, nw: sg }, R.logoG, ring14, '#17512a', 0.45 / 0.42, dy - 0.45, glo);
  paint('#2b2f31', nr);
  fbox(nr, f, 4.17, 4.23, 0.08, 0.5, dy + 0.42, dy + 0.48); // the bracket
  fbox(nr, f, 4.17, 4.23, 0.46, 0.5, dy + 0.3, dy + 0.48);
  tq({ a: -6.0, w: 0.07, da: 1, dw: 0, na: 0, nw: 1 }, R.banner, -1.3, 1.3, g + 1.55, g + 4.15, '#f4eedb', 3 / 2.6, g + 1.55); // under the band ledge
  if (glo) tq({ a: -6.0, w: 0.08, da: 1, dw: 0, na: 0, nw: 1 }, R.bannerG, -1.3, 1.3, g + 1.55, g + 4.15, '#f4eedb', 3 / 2.6, g + 1.55, glo);
  paint('#3a3a38', nr);
  fbox(nr, f, -7.35, -4.65, 0, 0.06, g + 1.5, g + 4.2); // the board's frame

  // ── the slate forecourt: 4 m tiles of the atlas from the façade to the kerb (frame f north of the villa's south end, f2 south of
  // it, 4 mm higher where the two slabs overlap in a wedge), a strip down the villa's south side, low kerb faces at the ends ──
  for (let a = -12; a < 12.5 - 0.01; a += 4) {
    const a1 = Math.min(a + 4, 12.5);
    for (let w = 0; w < KERB - 0.15 - 0.01; w += 4) hq(a, a1, w, Math.min(w + 4, KERB - 0.15), g + SLAB, R.slate, '#6f7375');
  }
  for (let w = BACK; w < 0; w += 4) hq(-12, -HALF, w, Math.min(w + 4, 0), g + SLAB, R.slate, '#6f7375');
  paint('#6a6d70');
  fbox(st, f, 12.4, 12.5, 0, KERB - 0.15, g, g + SLAB);
  fbox(st, f, -12, -HALF, BACK, BACK + 0.1, g, g + SLAB);
  // the villa's corner tables and the palm by its south corner (frame f)
  const sets0: [number, number][] = [[-8.6, 1.5], [-11.9, 0.8]];
  // ── old trees in boxwood beds along the kerb: three slots are Vegetation's own street trees of this kerb (props.streetTrees,
  // deterministic: (a, w) = (9.94, 5.39), (−3.60, 5.38), (−16.96, 4.02) — a bed is built round each, no second trunk), the other
  // beds get a tree instance here (whitewashed trunk from Vegetation's material), a yellow number tag on each ──
  const trees: number[] = [];
  const bed = (a: number, w: number, own: boolean, i: number) => {
    paint(STONE, nr);
    fbox(nr, cur, a - 0.95, a + 0.95, w - 0.95, w + 0.95, g + SLAB, g + SLAB + 0.14);
    paint(HEDGE, nr);
    fbox(nr, cur, a - 0.8, a + 0.8, w - 0.8, w + 0.8, g + SLAB + 0.14, g + SLAB + 0.62);
    solid(a - 0.95, a + 0.95, w - 0.95, w + 0.95, g, g + 0.8);
    const p = P(cur, a, 0, w);
    if (own) pushMatrix(trees, p[0], g - 0.2, p[2], hash(i + 3) * Math.PI * 2, 1.3 + 0.12 * hash(i + 9)); // old trees: crowns clear of the boards
    paint('#f2c330', nr);
    fbox(nr, cur, a - 0.05, a + 0.05, w + 0.24, w + 0.26, g + 1.9, g + 2.02);
  };
  ([[9.94, 5.39, false], [3.2, 5.2, true], [-3.6, 5.38, false], [-10.3, 5.2, true]] as const).forEach(([a, w, own], i) => bed(a, w, own, i));

  // ── furniture builders (in the current frame): round black tables with brown rattan chairs, palms in pots ──
  const table = (a: number, w: number, k: number) => {
    paint('#1c1c1c', nr);
    lathe(nr, cur, a, w, [[0.22, g + SLAB], [0.22, g + SLAB + 0.03], [0.03, g + SLAB + 0.03], [0.03, g + SLAB + 0.7], [0.34, g + SLAB + 0.7], [0.34, g + SLAB + 0.74], [0, g + SLAB + 0.74]], 8);
    const n = 2 + (k % 2);
    for (let c = 0; c < n; c++) {
      const t = (k * 0.9 + (c * 2 * Math.PI) / n);
      const [ca, cw] = [a + 0.68 * Math.cos(t), w + 0.68 * Math.sin(t)];
      const [ua, uw] = [Math.cos(t), Math.sin(t)]; // away from the table
      paint(RATTAN, nr);
      // seat, back (on the far side), two side slabs as legs: boxes aligned to the frame (chairs sit square to the terrace)
      fbox(nr, cur, ca - 0.21, ca + 0.21, cw - 0.21, cw + 0.21, g + SLAB + 0.43, g + SLAB + 0.48);
      const [ba0, ba1, bw0, bw1] = Math.abs(ua) > Math.abs(uw)
        ? [ca + ua * 0.19 - 0.025, ca + ua * 0.19 + 0.025, cw - 0.21, cw + 0.21]
        : [ca - 0.21, ca + 0.21, cw + uw * 0.19 - 0.025, cw + uw * 0.19 + 0.025];
      fbox(nr, cur, Math.min(ba0, ba1), Math.max(ba0, ba1), bw0, bw1, g + SLAB + 0.48, g + SLAB + 0.92);
      paint('#4a3320', nr);
      for (const sg of [-1, 1]) fbox(nr, cur, ca + sg * 0.19 - 0.015, ca + sg * 0.19 + 0.015, cw - 0.19, cw + 0.19, g + SLAB, g + SLAB + 0.43);
    }
    solid(a - 0.9, a + 0.9, w - 0.9, w + 0.9, g, g + 0.9);
  };
  const palm = (a: number, w: number, k: number) => {
    paint('#4b4a46', nr);
    lathe(nr, cur, a, w, [[0.26, g + SLAB], [0.34, g + SLAB + 0.9], [0.3, g + SLAB + 0.9], [0, g + SLAB + 0.9]], 8);
    paint('#3f8a3a', nr);
    const top = P(cur, a, g + SLAB + 0.95, w);
    for (let i = 0; i < 7; i++) {
      const t = hash(k * 7 + i) * 2 * Math.PI;
      const len = 1.3 + 0.4 * hash(k * 11 + i);
      const tip: V3 = [top[0] + Math.cos(t) * len, top[1] + 0.9 + 0.3 * hash(i + k), top[2] + Math.sin(t) * len];
      const side: V3 = [-Math.sin(t) * 0.14, 0, Math.cos(t) * 0.14];
      const b0: V3 = [top[0] + side[0], top[1], top[2] + side[2]];
      const b1: V3 = [top[0] - side[0], top[1], top[2] - side[2]];
      triOut(nr, b0, b1, tip, UP);
      triOut(nr, b0, b1, tip, DOWN);
    }
    solid(a - 0.35, a + 0.35, w - 0.35, w + 0.35, g, g + 1.0);
  };
  sets0.forEach(([a, w], k) => table(a, w, 12 + k));
  palm(-10.2, 1.1, 3);

  // ════ frame f2 from here: the south half of the forecourt, its beds, the terrace ════
  cur = f2;
  for (let a = -26.5; a < -0.01; a += 4) {
    const a1 = Math.min(a + 4, 0);
    for (let w = PAV.back - 0.6; w < KERB2 - 0.15 - 0.01; w += 4) hq(a, a1, w, Math.min(w + 4, KERB2 - 0.15), g + SLAB + 0.004, R.slate, '#6f7375');
  }
  paint('#6a6d70');
  fbox(st, f2, -26.5, -26.4, PAV.back - 0.6, KERB2 - 0.15, g, g + SLAB);
  fbox(st, f2, -26.5, 0, PAV.back - 0.6, PAV.back - 0.5, g, g + SLAB);
  ([[-4.14, 4.86, false], [-10.5, 4.7, true], [-17.0, 4.7, true], [-23.5, 4.7, true]] as const).forEach(([a, w, own], i) => bed(a, w, own, 4 + i));

  // ── the terrace: columns, fretwork beams, the three-section canopy, the big board, bulbs, the living wall ──
  const cols = [-1.3, -5.94, -10.58, -15.22, -19.86, -24.2];
  for (const a of cols) {
    for (const w of [PAV.front, PAV.back]) {
      paint(GREEN_D);
      lathe(st, f2, a, w, [[0.15, g + SLAB], [0.15, g + PAV.beam], [0, g + PAV.beam]], 8);
      fbox(st, f2, a - 0.22, a + 0.22, w - 0.22, w + 0.22, g + SLAB, g + SLAB + 0.35);
      fbox(st, f2, a - 0.2, a + 0.2, w - 0.2, w + 0.2, g + PAV.beam - 0.25, g + PAV.beam);
      fbox(st, f2, a - 0.1, a + 0.1, w - 0.1, w + 0.1, g + 1.4, g + 1.55); // the cast-iron collar
      solid(a - 0.2, a + 0.2, w - 0.2, w + 0.2, g, g + PAV.beam);
    }
  }
  paint('#f6f5f0');
  const bt = g + PAV.beam + 0.42;
  fbox(st, f2, PAV.a0 - 0.2, PAV.a1 + 0.2, PAV.front - 0.2, PAV.front + 0.2, g + PAV.beam, bt); // front beam
  fbox(st, f2, PAV.a0 - 0.2, PAV.a1 + 0.2, PAV.back - 0.2, PAV.back + 0.2, g + PAV.beam, bt); // back beam
  for (const a of [PAV.a0, PAV.a1]) fbox(st, f2, a - 0.2, a + 0.2, PAV.back, PAV.front, g + PAV.beam, bt); // end beams
  for (const a of cols.slice(1, -1)) fbox(st, f2, a - 0.08, a + 0.08, PAV.back, PAV.front, g + PAV.beam + 0.05, bt - 0.05); // cross beams
  const latt = (pl: Pl, L: number) => { // fretwork band on a beam face, 4 m repeats
    const n = Math.ceil(L / 4);
    const bw = L / n;
    for (let i = 0; i < n; i++) { const sc = -L / 2 + (i + 0.5) * bw; tq({ ...pl, a: pl.a + sc * pl.da, w: pl.w + sc * pl.dw }, R.lattice, -bw / 2, bw / 2, g + PAV.beam + 0.02, bt - 0.02, WHITE, 4 / bw, g + PAV.beam + 0.02); }
  };
  latt({ a: (PAV.a0 + PAV.a1) / 2, w: PAV.front + 0.205, da: 1, dw: 0, na: 0, nw: 1 }, PAV.a1 - PAV.a0);
  latt({ a: (PAV.a0 + PAV.a1) / 2, w: PAV.front - 0.205, da: 1, dw: 0, na: 0, nw: -1 }, PAV.a1 - PAV.a0);
  latt({ a: PAV.a1 + 0.205, w: (PAV.back + PAV.front) / 2, da: 0, dw: 1, na: 1, nw: 0 }, PAV.front - PAV.back);
  latt({ a: PAV.a0 - 0.205, w: (PAV.back + PAV.front) / 2, da: 0, dw: 1, na: -1, nw: 0 }, PAV.front - PAV.back);
  // the canopy: three flat white sections, the middle one a step higher, louvre rafters under them
  const sec: [number, number, number][] = [[PAV.a1, -8.8, 0.05], [-8.8, -16.7, 0.3], [-16.7, PAV.a0, 0.05]];
  paint('#f8f8f5');
  for (const [a1, a0, lift] of sec) {
    fbox(st, f2, a0 - 0.3, a1 + 0.3, PAV.back - 0.5, PAV.front + 0.7, bt + lift, bt + lift + 0.12);
    paint('#e9e9e4');
    for (let a = a0 + 0.6; a < a1 - 0.3; a += 1.2) fbox(st, f2, a - 0.04, a + 0.04, PAV.back - 0.3, PAV.front + 0.5, bt + lift - 0.14, bt + lift);
    paint('#f8f8f5');
  }
  // the big board on the middle section's front edge, white with the green capitals; its glow twin
  const [b0, b1, by0, by1] = [-15.0, -8.6, bt + 0.42, bt + 1.42];
  paint('#fbfaf5');
  fbox(st, f2, b0, b1, PAV.front + 0.5, PAV.front + 0.62, by0, by1);
  tq({ a: (b0 + b1) / 2, w: PAV.front + 0.625, da: 1, dw: 0, na: 0, nw: 1 }, R.board, -3.2, 3.2, by0, by1, '#fbfaf5', 1, by0);
  if (glo) tq({ a: (b0 + b1) / 2, w: PAV.front + 0.635, da: 1, dw: 0, na: 0, nw: 1 }, R.boardG, -3.2, 3.2, by0, by1, '#fbfaf5', 1, by0, glo);
  paint('#2b2f31', nr);
  for (const a of [b0 + 0.3, b1 - 0.3]) fbox(nr, f2, a - 0.03, a + 0.03, PAV.front + 0.45, PAV.front + 0.5, bt + 0.12, by0 + 0.1); // its struts
  // a small "Lục Thủy" plaque on the terrace's north end, pendant bulbs under the canopy, bulbs along the front beam
  tq({ a: -2.6, w: PAV.front + 0.21, da: 1, dw: 0, na: 0, nw: 1 }, R.logo, -0.19, 0.19, g + PAV.beam + 0.03, g + PAV.beam + 0.41, '#17512a', 0.9 / 0.38, g + PAV.beam + 0.03);
  for (const a of [-3.5, -8, -12.5, -17, -21.5]) {
    paint('#2b2f31', nr);
    fbox(nr, f2, a - 0.015, a + 0.015, -6.0 - 0.015, -6.0 + 0.015, g + 2.75, bt);
    lamp(a - 0.09, a + 0.09, -6.09, -5.91, g + 2.6, g + 2.75, '#f1e8d2');
  }
  for (let a = PAV.a0 + 1.2; a < PAV.a1 - 0.5; a += 2.3) lamp(a - 0.05, a + 0.05, PAV.front + 0.2, PAV.front + 0.3, g + PAV.beam - 0.1, g + PAV.beam, '#f1e8d2');
  // the living wall along the back and the south end (atlas leaves inside, dark green body)
  paint('#244d22');
  fbox(st, f2, PAV.a0 - 0.4, PAV.a1 + 0.1, PAV.back - 0.45, PAV.back - 0.05, g + SLAB, g + 2.7);
  fbox(st, f2, PAV.a0 - 0.4, PAV.a0 - 0.1, PAV.back - 0.45, PAV.front - 0.4, g + SLAB, g + 2.7);
  solid(PAV.a0 - 0.4, PAV.a1 + 0.1, PAV.back - 0.45, PAV.back - 0.05, g, g + 2.7);
  solid(PAV.a0 - 0.4, PAV.a0 - 0.1, PAV.back - 0.45, PAV.front - 0.4, g, g + 2.7);
  const leafy = (pl: Pl, L: number) => {
    const n = Math.ceil(L / 4);
    const bw = L / n;
    for (let i = 0; i < n; i++) { const sc = -L / 2 + (i + 0.5) * bw; tq({ ...pl, a: pl.a + sc * pl.da, w: pl.w + sc * pl.dw }, R.leaf, -bw / 2, bw / 2, g + SLAB, g + SLAB + 2.6, '#2f6b2c', 4 / bw, g + SLAB); }
  };
  leafy({ a: (PAV.a0 - 0.4 + PAV.a1 + 0.1) / 2, w: PAV.back - 0.04, da: 1, dw: 0, na: 0, nw: 1 }, PAV.a1 - PAV.a0 + 0.5);
  leafy({ a: PAV.a0 - 0.09, w: (PAV.back - 0.45 + PAV.front - 0.4) / 2, da: 0, dw: 1, na: 1, nw: 0 }, PAV.front - PAV.back - 0.05);
  // tables under the canopy and on the forecourt in front of it, palms at the corners
  const sets: [number, number][] = [[-3.6, -4.2], [-3.4, -7.8], [-8.2, -4.4], [-8.6, -8.0], [-12.8, -4.1], [-13.2, -7.7], [-17.6, -4.5], [-18.1, -8.0], [-22.2, -5.9], [-4.4, 0.4], [-9.2, 0.9], [-14.5, 0.6]];
  sets.forEach(([a, w], k) => table(a, w, k));
  for (const [i, [a, w]] of ([[-0.6, -1.0], [-0.4, -5.5], [-24.9, -1.2], [-12.6, -1.0], [-24.8, -6.0]] as const).entries()) palm(a, w, i);

  const out = s.out();
  return {
    ...out,
    instances: [{ kind: 'tree', matrices: new Float32Array(trees) }],
    // the same atlas on both the lit faces and their dusk glow twins (one ImageBitmap, two textures; closing it twice is a no-op)
    ...(image ? { textures: [{ material: 'mural' as const, image }, { material: 'neonSign' as const, image }] } : {}),
  };
};
