// ── Nhà thờ Lớn Hà Nội (St Joseph's Cathedral, 40 Nhà Chung; OSM way/28912942 in chunk −2_1). The outline is 66 × 21 m: the two
// 31.5 m tower parts stand at its EAST end (x −325…−309, z 367…387), the nave runs 49 m west-south-west behind them and the apse /
// sacristies close it at x ≈ −372. Phố Nhà Thờ, the junction with Nhà Chung / Lý Quốc Sư and the OSM park ring of the Regina Pacis
// garden (centre −289.5, 362.3) all lie ENE of the towers, so the façade faces ENE (compass ≈ 58°) onto the square; a footway
// crosses the forecourt 15 m out (the pavement along the iron fence), service lanes run along both flanks (a ≈ +14 north, −18 south).
// After the owner's three photos: weathered grey-black stone with pale streaks and moss, two square 4-stage bell towers (door stage,
// two stages of three louvred lancets, a belfry stage with a medallion, an open arcaded parapet with corner pinnacles), stepped
// corner buttresses carrying slender pinnacles at every stage; between them a lower centre bay: deep pointed portal with three
// archivolt orders and dark panelled doors under a crocketed hood, a blind gallery of 7 lancets, the rose window in a square frame
// with four roundels, the St Joseph niche between two pairs of lancets, the clock in the gable and the white cross on top. Low
// steps across the whole front, bonsai pots, the iron railing with gate pillars and three walkable gates (centre + under each tower
// door), the paved square, the fenced circular garden (kerb, lawn, trimmed shrubs, flower beds, the Our Lady statue on her
// inscribed pedestal) and white planters along the north kerb. Behind: 10 aisle bays with buttresses and pointed windows, the
// clerestory, a gabled transept bay (bay 7), a half-decagon apse under a half-cone and the lower chevet with a hipped roof.
// Frame: origin NT = middle of the façade's front plane, a = along the façade (+a = the viewer's RIGHT = north-west), w = out of the
// façade (ENE, towards the square). All the painted detail (weathered stone, lancets, rose, clock, statue niche, doors, plaque) is
// ONE 2048² OffscreenCanvas atlas on 'mural' (this chunk's only mural user); without OffscreenCanvas everything is plain grey.
// Solid (Sink.prism): towers, centre block, nave, chevet, steps, fence + pillars, garden ring, pedestal, pots, planters; the clue
// box spot NT_BOX (a 0, w 8: the forecourt between the bonsai row and the railing) stays clear within 3.5 m. ≈ 12k tris.
import type { MeshBuffer as Buf, V3 } from '../geom.ts';
import { cap, fbox, P, rgb, ring, spire, UP } from './b.ts';
import { bar, lathe } from './d.ts';
import { frameAt } from './h3.ts';
import type { DetailFn } from './index.ts';
import { loft, quadOut, triOut } from './kit.ts';
import { Sink } from './parts.ts';

/** Middle of the façade's front plane (world x, z). */
export const NT: [number, number] = [-314.5, 375.75];
const UA = [-0.5223, -0.8528] as const; // +a: along the façade towards the north tower (the viewer's right)
const UW = [0.8528, -0.5223] as const; // +w: out of the façade, ENE towards the square
/** Clue box spot: the paved forecourt in front of the portal, on the axis, 8 m out (between the bonsai row at 3.3 and the railing at 13.5). */
export const NT_BOX: [number, number] = [NT[0] + 8 * UW[0], NT[1] + 8 * UW[1]];

// ── dimensions (m) ──
const TC = 7.55; // tower centre |a|
const TH = 5.8; // tower side; towers span |a| 4.65 … 10.45, w 0 … −5.8
const CB = 4.65; // centre bay half-width
const TOP = 29; // tower wall top (parapet to 31.2, pinnacles to 33.8)
const STAGES = [0, 7.6, 14.6, 22.0, 28.6];
const BUTT = [0.9, 0.62, 0.4, 0.2]; // buttress projection per stage (deep steps, a pinnacle on every step)
const GABLE = [21.5, 24.2] as const; // centre gable base / apex
const PORTAL = { r: 2.1, spring: 5.4, orders: [2.1, 1.75, 1.4], planes: [0, -0.5, -1.0, -1.5] };
const SDOOR = { r: 0.85, spring: 3.0, depth: 0.6 };
const NAVE = { w0: -5.8, w1: -54.6, bay: 4.88, aisle: 10.45, nave: 4.7, aisleH: 8.5, aisleRidge: 11, wallH: 15, ridge: 18.9, transept: 6 };
const APSE_R = 4.7;
const CHEVET: [number, number][] = [[10.45, -54.6], [8.05, -59.9], [4.85, -65], [-2.15, -65.6], [-6.25, -60.5], [-8.5, -56.5], [-10.45, -54.6]];
const FENCE_W = 13.5;
const FENCE: [number, number][] = [[-17, -9.4], [-7.4, -1.8], [1.8, 7.4], [9.4, 12.5]]; // railing runs; the gaps are the gates
const GARDEN = { a: 1.5, w: 28.4, r: 6.3 }; // the OSM park ring

const STONE = '#7b7a74';
const LIGHT = '#9e9d96';
const BUTTRESS = '#858580';
const PALE = '#c2c1b9';
const TILE = '#5a5552';
const IRON = '#262a28';
const WHITE = '#f1efe7';
const LAWN = '#5f8a44';

// ── atlas: px regions with their metre bounds m = [s0, y0, s1, y1] (s along the face, y up; v = 0 is the image's top row) ──
interface Reg { x: number; y: number; w: number; h: number; m: readonly [number, number, number, number] }
const [AW, AH] = [2048, 2048];
const PX = 50; // px per m on the façade regions
const reg = (x: number, y: number, s0: number, y0: number, s1: number, y1: number, px = PX): Reg =>
  ({ x, y, w: Math.round((s1 - s0) * px), h: Math.round((y1 - y0) * px), m: [s0, y0, s1, y1] });
const R = {
  tf: reg(0, 0, -2.9, 0, 2.9, TOP), // tower front face (door stage)
  ts: reg(300, 0, -2.9, 0, 2.9, TOP), // tower side / back / inner face
  cf: reg(600, 0, -CB, 0, CB, GABLE[1]), // centre bay incl. the gable
  stone: { x: 1080, y: 0, w: 968, h: 968, m: [0, 0, 19.36, 19.36] } as Reg, // weathered stone, sampled in sub-rects
  ab: reg(0, 1460, -NAVE.bay / 2, 0, NAVE.bay / 2, NAVE.aisleH), // aisle bay
  cl: reg(250, 1460, -NAVE.bay / 2, 8, NAVE.bay / 2, NAVE.wallH), // clerestory bay
  gb: reg(1080, 980, -NAVE.bay / 2, 0, NAVE.bay / 2, 14.5), // transept gable bay
  door: reg(1340, 980, -1.4, 0, 1.4, 6.6),
  sdoor: reg(1500, 980, -0.85, 0, 0.85, 4.5),
  plaque: reg(1600, 980, -0.8, 0, 0.8, 1.0, 100),
  apse: reg(1780, 980, -1.45, 0, 1.45, NAVE.wallH),
};

const hash = (n: number) => { const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); };

type G = OffscreenCanvasRenderingContext2D;
/** (s, y) in metres → canvas px inside a region. */
const px = (r: Reg, s: number, y: number): [number, number] => [r.x + ((s - r.m[0]) / (r.m[2] - r.m[0])) * r.w, r.y + ((r.m[3] - y) / (r.m[3] - r.m[1])) * r.h];

/** Weathered grey stone over a region: block joints, dark weathering, pale lime streaks, moss near the bottom. */
function stone(g: G, r: Reg, seed: number, topDark = 0) {
  let k = seed * 97;
  const rnd = () => hash(k++);
  g.save();
  g.beginPath(); g.rect(r.x, r.y, r.w, r.h); g.clip();
  g.fillStyle = STONE;
  g.fillRect(r.x, r.y, r.w, r.h);
  const row = 0.55 * PX;
  for (let y = r.y, i = 0; y < r.y + r.h; y += row, i++) { // ashlar joints
    g.fillStyle = 'rgba(48,48,46,0.28)';
    g.fillRect(r.x, y, r.w, 1.5);
    const off = (i % 2) * 0.6 * PX + rnd() * 10;
    for (let x = r.x + off; x < r.x + r.w; x += 1.2 * PX) g.fillRect(x, y, 1.2, row);
  }
  const area = r.w * r.h;
  for (let i = 0; i < area / 1800; i++) { // soft blotches
    const [x, y, rad] = [r.x + rnd() * r.w, r.y + rnd() * r.h, 12 + rnd() * 70];
    const t = rnd();
    const near = (r.y + r.h - y) / r.h; // 1 at the bottom row
    const col = t < 0.46 ? `rgba(26,28,27,${0.14 + rnd() * 0.3})` : t < 0.8 ? `rgba(238,238,232,${0.1 + rnd() * 0.24})` : `rgba(98,108,70,${(0.06 + rnd() * 0.16) * (0.4 + near)})`;
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, col);
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  for (let i = 0; i < area / 5000; i++) { // vertical streaks
    const [x, y0, len, wd] = [r.x + rnd() * r.w, r.y + rnd() * r.h * 0.9, 40 + rnd() * 420, 1 + rnd() * 5];
    g.fillStyle = rnd() < 0.7 ? `rgba(236,236,230,${0.12 + rnd() * 0.26})` : `rgba(28,28,26,${0.1 + rnd() * 0.22})`;
    g.fillRect(x, y0, wd, len);
  }
  if (topDark) { // soot towards the top
    const gr = g.createLinearGradient(0, r.y, 0, r.y + r.h);
    gr.addColorStop(0, `rgba(20,22,22,${topDark})`);
    gr.addColorStop(0.6, 'rgba(20,22,22,0)');
    g.fillStyle = gr;
    g.fillRect(r.x, r.y, r.w, r.h);
  }
  g.restore();
}

/** Pointed-arch path (equilateral: the crown 0.866 w above the springing) in canvas px: x left, w wide, from yTop down to yBot. */
function lancetPath(g: G, x: number, yTop: number, w: number, yBot: number) {
  const sp = yTop + 0.866 * w;
  g.beginPath();
  g.moveTo(x, yBot); g.lineTo(x, sp);
  g.arc(x + w, sp, w, Math.PI, (4 * Math.PI) / 3, false);
  g.arc(x, sp, w, (5 * Math.PI) / 3, 2 * Math.PI, false);
  g.lineTo(x + w, yBot);
  g.closePath();
}

type Fill = 'louvre' | 'glass' | 'blind';
/** Lancet window / blind arch in a region, centred at s (m), width wM, from y0 to y1 (m, the apex). */
function lancet(g: G, r: Reg, s: number, wM: number, y0: number, y1: number, fill: Fill, frame = true) {
  const [x0, yTop] = px(r, s - wM / 2, y1);
  const [, yBot] = px(r, s, y0);
  const w = wM * PX;
  if (frame) { lancetPath(g, x0, yTop, w, yBot); g.lineWidth = 8; g.strokeStyle = 'rgba(30,30,28,0.5)'; g.stroke(); }
  lancetPath(g, x0, yTop, w, yBot);
  g.fillStyle = fill === 'blind' ? '#4a4a45' : fill === 'glass' ? '#1d222b' : '#23231f';
  g.fill();
  g.save();
  lancetPath(g, x0, yTop, w, yBot); g.clip();
  if (fill === 'louvre') {
    for (let y = yTop + 6; y < yBot; y += 7) { g.fillStyle = '#a6a59d'; g.fillRect(x0, y, w, 3); g.fillStyle = '#111110'; g.fillRect(x0, y + 3, w, 2); }
  } else if (fill === 'glass') {
    g.strokeStyle = '#8d8c85';
    g.lineWidth = 2.5;
    g.beginPath(); g.moveTo(x0 + w / 2, yBot); g.lineTo(x0 + w / 2, yTop + 0.75 * w); g.stroke(); // mullion
    g.beginPath(); g.arc(x0 + w / 2, yTop + 0.62 * w, w * 0.17, 0, Math.PI * 2); g.stroke(); // head roundel
    g.fillStyle = 'rgba(120,140,170,0.18)';
    for (let y = yTop; y < yBot; y += 9) g.fillRect(x0, y, w, 3); // leaded rows
  } else { // blind: a shadow down the left jamb
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fillRect(x0, yTop, w * 0.22, yBot - yTop);
  }
  g.restore();
  if (frame) { lancetPath(g, x0, yTop, w, yBot); g.lineWidth = 3; g.strokeStyle = PALE; g.stroke(); }
}

/** Three louvred lancets of a tower stage (1 m wide, 0.42 m apart) with colonnettes between them and a hood course above. */
function stageLancets(g: G, r: Reg, y0: number, y1: number) {
  for (const s of [-1.42, 0, 1.42]) lancet(g, r, s, 1.0, y0, y1, 'louvre');
  for (const s of [-0.71, 0.71]) { // colonnettes
    const [x, yt] = px(r, s, y1 - 0.866);
    const [, yb] = px(r, s, y0);
    g.fillStyle = '#5b5b56'; g.fillRect(x - 3, yt, 6, yb - yt);
    g.fillStyle = PALE; g.fillRect(x - 2, yt, 3, yb - yt);
  }
  const [xa, ya] = px(r, -2.2, y1 + 0.45);
  const [xb] = px(r, 2.2, y1 + 0.45);
  g.fillStyle = PALE; g.fillRect(xa, ya, xb - xa, 4); // hood course
  g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(xa, ya + 4, xb - xa, 3);
}

/** Round medallion (quatrefoil in a dark disc with a pale rim). */
function medallion(g: G, r: Reg, s: number, y: number, rad: number) {
  const [x, yy] = px(r, s, y);
  const R0 = rad * PX;
  g.fillStyle = PALE; g.beginPath(); g.arc(x, yy, R0 + 4, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#2a2a27'; g.beginPath(); g.arc(x, yy, R0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#9d9c95';
  for (let k = 0; k < 4; k++) { g.beginPath(); g.arc(x + Math.cos((k * Math.PI) / 2) * R0 * 0.45, yy + Math.sin((k * Math.PI) / 2) * R0 * 0.45, R0 * 0.32, 0, Math.PI * 2); g.fill(); }
}

/** Tower face: door stage (a real door hole on the front, two blind lancets on the sides), three lancet stages, the medallion. */
function towerFace(g: G, r: Reg, front: boolean) {
  if (front) { // archivolt orders around the cut door hole + a gablet hood
    for (const [rr, col, lw] of [[1.25, '#4a4a46', 7], [1.1, PALE, 5], [0.98, '#5a5a55', 4]] as const) {
      const [x, yTop] = px(r, -rr, SDOOR.spring + 1.732 * rr);
      const [, yBot] = px(r, 0, 0);
      lancetPath(g, x, yTop, rr * 2 * PX, yBot); g.lineWidth = lw; g.strokeStyle = col; g.stroke();
    }
    g.strokeStyle = PALE; g.lineWidth = 5; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(...px(r, -1.5, 4.6)); g.lineTo(...px(r, 0, 5.75)); g.lineTo(...px(r, 1.5, 4.6)); g.stroke();
    g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(...px(r, -1.5, 4.5)); g.lineTo(...px(r, 0, 5.65)); g.lineTo(...px(r, 1.5, 4.5)); g.stroke();
    for (const s of [-0.55, 0.55]) lancet(g, r, s, 0.55, 5.95, 7.2, 'blind');
  } else {
    for (const s of [-0.6, 0.6]) lancet(g, r, s, 0.7, 2.6, 5.6, 'blind');
  }
  stageLancets(g, r, 8.6, 13.9);
  stageLancets(g, r, 15.6, 21.2);
  medallion(g, r, 0, 22.95, 0.42);
  stageLancets(g, r, 23.7, 28.2);
}

/** Centre bay: archivolts round the portal, hood, gallery, rose in its square frame with roundels, niche + lancets, clock. */
function centreFace(g: G, r: Reg) {
  for (const [rr, col, lw] of [[2.75, '#45453f', 9], [2.55, PALE, 6], [2.38, '#5a5a55', 5], [2.22, PALE, 4]] as const) {
    const [x, yTop] = px(r, -rr, PORTAL.spring + 1.732 * rr);
    const [, yBot] = px(r, 0, 0);
    lancetPath(g, x, yTop, rr * 2 * PX, yBot); g.lineWidth = lw; g.strokeStyle = col; g.stroke();
  }
  for (const s of [-2.7, 2.7]) lancet(g, r, s, 0.5, 1.5, 4.6, 'blind'); // blind lancets on the portal flanks
  // gallery of 7 blind lancets
  for (let k = 0; k < 7; k++) lancet(g, r, -3.45 + k * 1.15, 0.7, 10.9, 12.9, 'blind');
  // the rose: square frame, four roundels, stone ring, dark tracery
  const [cx, cy] = px(r, 0, 15.3);
  const RR = 1.85 * PX;
  g.strokeStyle = PALE; g.lineWidth = 5; g.strokeRect(cx - 2.2 * PX, cy - 2.2 * PX, 4.4 * PX, 4.4 * PX);
  g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 3; g.strokeRect(cx - 2.2 * PX + 5, cy - 2.2 * PX + 5, 4.4 * PX - 10, 4.4 * PX - 10);
  for (const [sx, sy] of [[-1.9, 1.9], [1.9, 1.9], [-1.9, -1.9], [1.9, -1.9]] as const) medallion(g, r, sx, 15.3 + sy, 0.3);
  g.fillStyle = PALE; g.beginPath(); g.arc(cx, cy, RR + 10, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#4a4a45'; g.beginPath(); g.arc(cx, cy, RR + 4, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#1c2130'; g.beginPath(); g.arc(cx, cy, RR, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#8f8e87'; g.lineWidth = 3;
  for (let k = 0; k < 12; k++) {
    const t = (k * Math.PI) / 6;
    g.beginPath(); g.moveTo(cx + Math.cos(t) * RR * 0.22, cy + Math.sin(t) * RR * 0.22); g.lineTo(cx + Math.cos(t) * RR, cy + Math.sin(t) * RR); g.stroke();
    g.beginPath(); g.arc(cx + Math.cos(t + Math.PI / 12) * RR * 0.72, cy + Math.sin(t + Math.PI / 12) * RR * 0.72, RR * 0.17, 0, Math.PI * 2); g.stroke();
  }
  g.beginPath(); g.arc(cx, cy, RR * 0.22, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.arc(cx, cy, RR * 0.5, 0, Math.PI * 2); g.stroke();
  // niche with the white St Joseph, two pairs of louvred lancets
  lancet(g, r, 0, 1.15, 17.8, 20.9, 'blind');
  const body = px(r, 0, 18.0);
  g.fillStyle = WHITE;
  g.beginPath(); g.ellipse(body[0], body[1] - 0.95 * PX, 0.3 * PX, 0.95 * PX, 0, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.arc(body[0], body[1] - 2.05 * PX, 0.19 * PX, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#c9c8c0'; g.fillRect(body[0] - 0.42 * PX, body[1] - 0.12 * PX, 0.84 * PX, 0.14 * PX); // the bracket
  g.fillStyle = '#d9d8d0'; g.fillRect(body[0] + 0.26 * PX, body[1] - 2.3 * PX, 3, 2.1 * PX); // the staff
  for (const s of [-2.45, -1.55, 1.55, 2.45]) lancet(g, r, s, 0.7, 17.9, 20.6, 'louvre');
  // string course under the gable + the clock
  const [xa, ya] = px(r, -CB, 21.5);
  g.fillStyle = PALE; g.fillRect(xa, ya, 2 * CB * PX, 6);
  g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(xa, ya + 6, 2 * CB * PX, 4);
  const [kx, ky] = px(r, 0, 22.55);
  const KR = 0.95 * PX;
  g.fillStyle = PALE; g.beginPath(); g.arc(kx, ky, KR + 9, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#1b1b1a'; g.beginPath(); g.arc(kx, ky, KR + 3, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#f4f2ea'; g.beginPath(); g.arc(kx, ky, KR, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#1b1b1a';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `bold ${Math.round(KR * 0.3)}px Georgia, "Times New Roman", serif`;
  const NUM = ['XII', 'I', 'II', 'III', 'IIII', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
  for (let k = 0; k < 12; k++) {
    const t = -Math.PI / 2 + (k * Math.PI) / 6;
    g.fillText(NUM[k]!, kx + Math.cos(t) * KR * 0.74, ky + Math.sin(t) * KR * 0.74);
    g.fillRect(kx + Math.cos(t) * KR * 0.92 - 1.5, ky + Math.sin(t) * KR * 0.92 - 1.5, 3, 3);
  }
  g.strokeStyle = '#1b1b1a'; g.lineCap = 'round';
  for (const [t, len, lw] of [[-5 * Math.PI / 6, 0.5, 6], [-Math.PI / 6, 0.72, 4]] as const) {
    g.lineWidth = lw;
    g.beginPath(); g.moveTo(kx, ky); g.lineTo(kx + Math.cos(t) * KR * len, ky + Math.sin(t) * KR * len); g.stroke();
  }
  g.beginPath(); g.arc(kx, ky, 4, 0, Math.PI * 2); g.fill();
}

/** Nave bay faces: aisle (one glass lancet), clerestory, transept gable (a tall two-light window + roundel), apse face. */
function naveFaces(g: G) {
  lancet(g, R.ab, 0, 1.8, 2.6, 7.8, 'glass');
  const [xa, ya] = px(R.ab, -NAVE.bay / 2, 1.0);
  g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(xa, ya, R.ab.w, 4); // plinth line
  lancet(g, R.cl, 0, 1.3, 11.3, 14.6, 'glass');
  lancet(g, R.gb, 0, 2.4, 3.0, 10.2, 'glass');
  medallion(g, R.gb, 0, 12.3, 0.45);
  lancet(g, R.apse, 0, 1.3, 7.5, 13.5, 'glass');
}

/** Dark panelled double door (the portal) with a quatrefoil tympanum, the planked side door, the REGINA PACIS plaque. */
function doors(g: G) {
  const d = R.door;
  g.fillStyle = '#3f2a1b'; g.fillRect(d.x, d.y, d.w, d.h);
  const [, yT] = px(d, 0, 4.6);
  g.fillStyle = '#35352f'; g.fillRect(d.x, d.y, d.w, yT - d.y); // tympanum
  g.strokeStyle = '#bdbcb4'; g.lineWidth = 3;
  const [tx, ty] = px(d, 0, 5.4);
  for (let k = 0; k < 4; k++) { g.beginPath(); g.arc(tx + Math.cos((k * Math.PI) / 2) * 0.32 * PX, ty + Math.sin((k * Math.PI) / 2) * 0.32 * PX, 0.3 * PX, 0, Math.PI * 2); g.stroke(); }
  g.beginPath(); g.arc(tx, ty, 0.2 * PX, 0, Math.PI * 2); g.stroke();
  for (const leaf of [-1, 1]) { // three panels per leaf, lighter fields with dark grooves
    for (let k = 0; k < 3; k++) {
      const [x0, y0] = px(d, leaf * 0.72 - 0.5, 0.35 + k * 1.45 + 1.2);
      g.fillStyle = '#20150d'; g.fillRect(x0, y0, 1.0 * PX, 1.2 * PX);
      g.fillStyle = '#5a3d27'; g.fillRect(x0 + 4, y0 + 4, 1.0 * PX - 8, 1.2 * PX - 8);
      g.fillStyle = '#3f2a1b'; g.fillRect(x0 + 12, y0 + 12, 1.0 * PX - 24, 1.2 * PX - 24);
    }
  }
  g.fillStyle = '#1a110a'; g.fillRect(d.x + d.w / 2 - 3, yT, 6, d.y + d.h - yT); // the meeting stile
  g.fillStyle = '#8a8a84'; g.fillRect(d.x + d.w / 2 - 8, d.y + d.h - 2.4 * PX, 16, 6); // handles
  const s = R.sdoor;
  g.fillStyle = '#3f2a1b'; g.fillRect(s.x, s.y, s.w, s.h);
  g.fillStyle = '#1e140c';
  for (let x = s.x + 10; x < s.x + s.w; x += 12) g.fillRect(x, s.y, 2, s.h); // planks
  g.fillStyle = '#4a4a46';
  for (const yy of [0.9, 2.4]) { const [, y] = px(s, 0, yy); g.fillRect(s.x, y, s.w, 6); } // iron bands
  const p = R.plaque;
  g.fillStyle = '#55564f'; g.fillRect(p.x, p.y, p.w, p.h);
  g.fillStyle = '#d9b24a'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = 'bold 36px Georgia, "Times New Roman", serif';
  g.fillText('REGINA', p.x + p.w / 2, p.y + p.h * 0.3, p.w - 16);
  g.fillText('PACIS', p.x + p.w / 2, p.y + p.h * 0.7, p.w - 16);
}

function paintAtlas(): ImageBitmap | undefined {
  if (typeof OffscreenCanvas === 'undefined') return;
  const c = new OffscreenCanvas(AW, AH);
  const g = c.getContext('2d');
  if (!g) return;
  g.fillStyle = STONE;
  g.fillRect(0, 0, AW, AH);
  stone(g, R.stone, 1);
  ([[R.tf, 2, 0.3], [R.ts, 3, 0.3], [R.cf, 4, 0.2], [R.ab, 5, 0.12], [R.cl, 6, 0.2], [R.gb, 7, 0.15], [R.apse, 8, 0.15]] as const).forEach(([r, seed, td]) => stone(g, r, seed, td));
  towerFace(g, R.tf, true);
  towerFace(g, R.ts, false);
  centreFace(g, R.cf);
  naveFaces(g);
  doors(g);
  return c.transferToImageBitmap();
}

/** Pointed arch outline (s, y): bottom-left, up the left jamb, the two arcs over the apex, down the right jamb, bottom-right. */
function archPts(c: number, r: number, y0: number, spring: number, K = 6): [number, number][] {
  const pts: [number, number][] = [[c - r, y0], [c - r, spring]];
  for (let k = 1; k <= K; k++) { const t = (k / K) * (Math.PI / 3); pts.push([c + r - 2 * r * Math.cos(t), spring + 2 * r * Math.sin(t)]); }
  for (let k = K - 1; k >= 0; k--) { const t = (k / K) * (Math.PI / 3); pts.push([c - r + 2 * r * Math.cos(t), spring + 2 * r * Math.sin(t)]); }
  pts.push([c + r, y0]);
  return pts;
}

/** A vertical plane of the frame: origin (a, w), s runs along (da, dw), outward normal (na, nw) (frame coordinates). */
interface Pl { a: number; w: number; da: number; dw: number; na: number; nw: number }

export const nhaThoLon: DetailFn = (_rec, _parts, ctx) => {
  const g = ctx.ground;
  const s = new Sink();
  const f = frameAt(NT[0], NT[1], UA[0], UA[1]);
  const nrm = (na: number, nw: number): V3 => [na * f.ux - nw * f.uz, 0, na * f.uz + nw * f.ux];
  const OUT = nrm(0, 1);
  const IN = nrm(0, -1);
  const st = s.buf('masonry');
  const nr = s.buf('masonry', 'near');
  const paint = (hex: string, buf: Buf = st) => { buf.color = rgb(hex); return buf; };
  const image = paintAtlas();
  const mural = image ? s.buf('mural') : undefined;
  const solid = (a0: number, a1: number, w0: number, w1: number, y0: number, y1: number) =>
    s.prism([[P(f, a0, 0, w0), P(f, a1, 0, w0), P(f, a1, 0, w1), P(f, a0, 0, w1)].flatMap((p) => [p[0], p[2]])], y0, y1);
  const solidPoly = (pts: [number, number][], y0: number, y1: number) =>
    s.prism([pts.flatMap(([a, w]) => { const p = P(f, a, 0, w); return [p[0], p[2]]; })], y0, y1);

  // ── textured faces ──
  const pt = (pl: Pl, sv: number, y: number) => P(f, pl.a + sv * pl.da, y, pl.w + sv * pl.dw);
  const uv = (r: Reg, sv: number, y: number): [number, number] =>
    [(r.x + ((sv - r.m[0]) / (r.m[2] - r.m[0])) * r.w) / AW, (r.y + ((r.m[3] - y) / (r.m[3] - r.m[1])) * r.h) / AH];
  /** Convex polygon (s, y) on a plane, textured from region r (fan). */
  const tpoly = (pl: Pl, r: Reg, pts: [number, number][], fallback = STONE) => {
    const out = nrm(pl.na, pl.nw);
    for (let i = 1; i + 1 < pts.length; i++) {
      const [p0, p1, p2] = [pts[0]!, pts[i]!, pts[i + 1]!];
      if (!mural) { triOut(paint(fallback), pt(pl, ...p0), pt(pl, ...p1), pt(pl, ...p2), out); continue; }
      const [u0, u1, u2] = [uv(r, ...p0), uv(r, ...p1), uv(r, ...p2)];
      triOut(mural, pt(pl, ...p0), pt(pl, ...p1), pt(pl, ...p2), out, [u0[0], u0[1], u1[0], u1[1], u2[0], u2[1]]);
    }
  };
  const tq = (pl: Pl, r: Reg, s0: number, s1: number, y0: number, y1: number, fallback = STONE) => tpoly(pl, r, [[s0, y0], [s1, y0], [s1, y1], [s0, y1]], fallback);
  /** Stone sub-rect for a face s0..s1 × y0..y1 (m): a hashed window of the stone region (stretched when wider than it). */
  let stoneSeed = 11;
  const stoneReg = (s0: number, y0: number, s1: number, y1: number): Reg => {
    const w = Math.min(R.stone.w, Math.round((s1 - s0) * PX));
    const h = Math.min(R.stone.h, Math.round((y1 - y0) * PX));
    return { x: R.stone.x + Math.floor(hash(stoneSeed++) * (R.stone.w - w)), y: R.stone.y + Math.floor(hash(stoneSeed++) * (R.stone.h - h)), w, h, m: [s0, y0, s1, y1] };
  };
  const stq = (pl: Pl, s0: number, s1: number, y0: number, y1: number) => tq(pl, stoneReg(s0, y0, s1, y1), s0, s1, y0, y1);
  /** Face s0..s1 × y0..y1 with a pointed-arch hole (centre c, radius r, springing sp): two jamb strips + the strip over the arch. */
  const faceWithArch = (pl: Pl, r: Reg, s0: number, s1: number, y0: number, y1: number, c: number, rr: number, sp: number) => {
    tq(pl, r, s0, c - rr, y0, y1);
    tq(pl, r, c + rr, s1, y0, y1);
    const arc = archPts(c, rr, y0, sp).slice(1, -1);
    for (let i = 0; i + 1 < arc.length; i++) tpoly(pl, r, [arc[i]!, arc[i + 1]!, [arc[i + 1]![0], y1], [arc[i]![0], y1]]);
  };
  /** Reveal (tunnel surface) of an arch of radius r centred on a = c, from plane wa to wb (normals into the opening). */
  const reveal = (c: number, r: number, sp: number, wa: number, wb: number, hex: string) => {
    const pts = archPts(c, r, g, sp);
    const buf = paint(hex);
    for (let i = 0; i + 1 < pts.length; i++) {
      const [p0, p1] = [pts[i]!, pts[i + 1]!];
      const [sm, ym] = [(p0[0] + p1[0]) / 2 - c, (p0[1] + p1[1]) / 2];
      const out: V3 = [-sm * f.ux, ym > sp ? -(ym - sp) : 0, -sm * f.uz];
      quadOut(buf, P(f, p0[0], p0[1], wa), P(f, p1[0], p1[1], wa), P(f, p1[0], p1[1], wb), P(f, p0[0], p0[1], wb), out);
    }
  };
  /** Flat ring between the arches of radius rO and rI on plane w (an archivolt order's face). */
  const annulus = (c: number, rO: number, rI: number, sp: number, w: number, hex: string) => {
    const [o, i2] = [archPts(c, rO, g, sp), archPts(c, rI, g, sp)];
    const buf = paint(hex);
    for (let i = 0; i + 1 < o.length; i++) quadOut(buf, P(f, o[i]![0], o[i]![1], w), P(f, o[i + 1]![0], o[i + 1]![1], w), P(f, i2[i + 1]![0], i2[i + 1]![1], w), P(f, i2[i]![0], i2[i]![1], w), OUT);
  };
  const pin = (buf: Buf, a: number, w: number, r: number, y0: number, y1: number) => lathe(buf, f, a, w, [[r, y0], [r * 0.82, y0 + (y1 - y0) * 0.38], [0, y1]], 4);

  // ── the two towers ──
  for (const sg of [-1, 1]) {
    const ac = sg * TC;
    const front: Pl = { a: ac, w: 0, da: 1, dw: 0, na: 0, nw: 1 };
    const back: Pl = { a: ac, w: -TH, da: 1, dw: 0, na: 0, nw: -1 };
    const outer: Pl = { a: ac + sg * TH / 2, w: -TH / 2, da: 0, dw: 1, na: sg, nw: 0 };
    const inner: Pl = { a: ac - sg * TH / 2, w: -TH / 2, da: 0, dw: 1, na: -sg, nw: 0 };
    faceWithArch(front, R.tf, -TH / 2, TH / 2, g, g + TOP, 0, SDOOR.r, g + SDOOR.spring);
    for (const pl of [back, outer, inner]) tq(pl, R.ts, -TH / 2, TH / 2, g, g + TOP);
    reveal(ac, SDOOR.r, g + SDOOR.spring, 0, -SDOOR.depth, LIGHT);
    tpoly({ a: ac, w: -SDOOR.depth, da: 1, dw: 0, na: 0, nw: 1 }, R.sdoor, archPts(0, SDOOR.r, g, g + SDOOR.spring), '#3f2a1b');
    solid(ac - TH / 2, ac + TH / 2, -TH, 0, g, g + TOP);
    cap(paint(STONE), ring(f, ac, -TH / 2, (TH / 2) * Math.SQRT2, g + TOP, 4), UP);
    // stepped corner buttresses with a pinnacle on every step, string courses, the belfry cornice
    for (const sa of [-1, 1]) {
      for (const sw of [1, -1]) {
        const [ca, cw] = [ac + sa * TH / 2, sw > 0 ? 0 : -TH];
        for (let k = 0; k < 4; k++) {
          const p = BUTT[k]!;
          const [y0, y1] = [g + STAGES[k]!, k === 3 ? g + TOP : g + STAGES[k + 1]!];
          paint(BUTTRESS);
          fbox(st, f, Math.min(ca - sa * 0.55, ca + sa * p), Math.max(ca - sa * 0.55, ca + sa * p), Math.min(cw - sw * 0.55, cw + sw * p), Math.max(cw - sw * 0.55, cw + sw * p), y0, y1);
          if (k > 0) pin(paint(LIGHT, nr), ca + sa * (p + 0.12), cw + sw * (p + 0.12), 0.26, y0 - 0.1, y0 + 3.2); // pinnacle on the step below
        }
        pin(paint(LIGHT), ca - sa * 0.1, cw - sw * 0.1, 0.5, g + TOP, g + TOP + 4.8); // corner pinnacle
      }
    }
    paint(BUTTRESS);
    for (let k = 1; k <= 3; k++) fbox(st, f, ac - TH / 2 - 0.12, ac + TH / 2 + 0.12, -TH - 0.12, 0.12, g + STAGES[k]!, g + STAGES[k]! + 0.3);
    fbox(st, f, ac - TH / 2 - 0.3, ac + TH / 2 + 0.3, -TH - 0.3, 0.3, g + STAGES[4]!, g + TOP);
    // open arcaded parapet: posts, rail, merlons on each face
    for (const pl of [front, back, outer, inner]) {
      const box = (s0: number, s1: number, depth: number, y0: number, y1: number, buf: Buf) => {
        const [a0, a1] = [pl.a + s0 * pl.da - pl.na * depth, pl.a + s1 * pl.da];
        const [w0, w1] = [pl.w + s0 * pl.dw - pl.nw * depth, pl.w + s1 * pl.dw];
        fbox(buf, f, Math.min(a0, a1), Math.max(a0, a1), Math.min(w0, w1), Math.max(w0, w1), y0, y1);
      };
      for (const sp of [-1.9, -0.95, 0, 0.95, 1.9]) box(sp - 0.11, sp + 0.11, 0.22, g + TOP, g + TOP + 1.3, paint(LIGHT, nr));
      box(-TH / 2, TH / 2, 0.28, g + TOP + 1.3, g + TOP + 1.7, paint(LIGHT));
      for (const sp of [-2.4, -1.45, -0.5, 0.5, 1.45, 2.4]) box(sp - 0.22, sp + 0.22, 0.28, g + TOP + 1.7, g + TOP + 2.2, paint(LIGHT, nr));
    }
  }

  // ── the centre bay: face with the portal hole, three archivolt orders, the doors, hood, pinnacles, gable, clock, cross ──
  const cf: Pl = { a: 0, w: 0, da: 1, dw: 0, na: 0, nw: 1 };
  faceWithArch(cf, R.cf, -CB, CB, g, g + GABLE[0], 0, PORTAL.r, g + PORTAL.spring);
  tpoly(cf, R.cf, [[-CB, g + GABLE[0]], [CB, g + GABLE[0]], [0, g + GABLE[1]]]);
  for (let k = 0; k < 3; k++) {
    const [rO, wa, wb] = [PORTAL.orders[k]!, PORTAL.planes[k]!, PORTAL.planes[k + 1]!];
    reveal(0, rO, g + PORTAL.spring, wa, wb, k % 2 ? '#9d9c95' : '#a9a8a1');
    if (k < 2) annulus(0, rO, PORTAL.orders[k + 1]!, g + PORTAL.spring, wb, k % 2 ? '#b0afa8' : '#8f8e88');
  }
  tpoly({ a: 0, w: PORTAL.planes[3]!, da: 1, dw: 0, na: 0, nw: 1 }, R.door, archPts(0, PORTAL.orders[2]!, g, g + PORTAL.spring), '#3f2a1b');
  solid(-CB, CB, -TH, 0, g, g + GABLE[0]);
  const hood = paint(LIGHT);
  bar(hood, P(f, -2.8, g + 8.8, 0.28), P(f, 0, g + 11.3, 0.28), 0.24); // the crocketed hood over the portal
  bar(hood, P(f, 2.8, g + 8.8, 0.28), P(f, 0, g + 11.3, 0.28), 0.24);
  for (const sa of [-1, 1]) {
    pin(paint(LIGHT), sa * 3.1, 0.2, 0.28, g + 6.2, g + 11.0); // portal flank pinnacles
    pin(paint(LIGHT), sa * 4.4, -0.35, 0.38, g + GABLE[0] - 0.3, g + GABLE[0] + 3.4); // gable-base pinnacles
  }
  // the gable is a 0.7 m slab: back face + coping
  const gb = paint(STONE);
  triOut(gb, P(f, -CB, g + GABLE[0], -0.7), P(f, CB, g + GABLE[0], -0.7), P(f, 0, g + GABLE[1], -0.7), IN);
  const cop = paint(PALE);
  for (const sa of [-1, 1]) {
    quadOut(cop, P(f, sa * (CB + 0.2), g + GABLE[0] - 0.1, 0.1), P(f, 0, g + GABLE[1] + 0.12, 0.1), P(f, 0, g + GABLE[1] + 0.12, -0.75), P(f, sa * (CB + 0.2), g + GABLE[0] - 0.1, -0.75), [sa * f.ux, 1.6, sa * f.uz]);
  }
  paint(WHITE);
  fbox(st, f, -0.17, 0.17, -0.5, -0.15, g + GABLE[1], g + GABLE[1] + 3.7); // the white cross
  fbox(st, f, -0.95, 0.95, -0.5, -0.15, g + GABLE[1] + 2.25, g + GABLE[1] + 2.6);
  for (const [a, y] of [[0, GABLE[1] + 3.7], [-0.95, GABLE[1] + 2.42], [0.95, GABLE[1] + 2.42]] as const) lathe(paint(WHITE, nr), f, a, -0.325, [[0.16, g + y - 0.1], [0.2, g + y + 0.1], [0, g + y + 0.3]], 6);

  // ── nave: aisle bays + buttresses, clerestory, roofs, the transept bay, apse, chevet ──
  const bays = Math.round((NAVE.w0 - NAVE.w1) / NAVE.bay);
  const tile = () => paint(TILE);
  for (const sg of [-1, 1]) {
    for (let k = 0; k < bays; k++) {
      const [wa, wb] = [NAVE.w0 - k * NAVE.bay, NAVE.w0 - (k + 1) * NAVE.bay];
      const wc = (wa + wb) / 2;
      const aisle: Pl = { a: sg * NAVE.aisle, w: wc, da: 0, dw: 1, na: sg, nw: 0 };
      const cler: Pl = { a: sg * NAVE.nave, w: wc, da: 0, dw: 1, na: sg, nw: 0 };
      if (k === NAVE.transept) {
        tq(aisle, R.gb, -NAVE.bay / 2, NAVE.bay / 2, g, g + NAVE.aisleRidge);
        tpoly(aisle, R.gb, [[-NAVE.bay / 2, g + NAVE.aisleRidge], [NAVE.bay / 2, g + NAVE.aisleRidge], [0, g + 14.5]]);
        // the transept roof: ridge across at 14.5, eaves at 11 overhanging the bay by 0.3
        const [ea, eb, rA, rB] = [sg * NAVE.nave, sg * (NAVE.aisle + 0.3), g + NAVE.aisleRidge, g + 14.5];
        quadOut(tile(), P(f, ea, rA, wa + 0.3), P(f, eb, rA, wa + 0.3), P(f, eb, rB, wc), P(f, ea, rB, wc), [OUT[0], 1, OUT[2]]);
        quadOut(tile(), P(f, ea, rA, wb - 0.3), P(f, eb, rA, wb - 0.3), P(f, eb, rB, wc), P(f, ea, rB, wc), [IN[0], 1, IN[2]]);
        triOut(paint(STONE), P(f, eb, rA, wa + 0.3), P(f, eb, rA, wb - 0.3), P(f, eb, rB, wc), nrm(sg, 0)); // gable overhang end
        paint('#3a3634');
        fbox(st, f, Math.min(ea, eb), Math.max(ea, eb), wc - 0.15, wc + 0.15, rB - 0.05, rB + 0.2);
      } else tq(aisle, R.ab, -NAVE.bay / 2, NAVE.bay / 2, g, g + NAVE.aisleH);
      tq(cler, R.cl, -NAVE.bay / 2, NAVE.bay / 2, g + 8, g + NAVE.wallH);
      if (k > 0) { // buttress between the bays, pyramidal cap
        const ab = sg * (NAVE.aisle + 0.4);
        paint(BUTTRESS);
        fbox(st, f, Math.min(sg * NAVE.aisle, sg * (NAVE.aisle + 0.8)), Math.max(sg * NAVE.aisle, sg * (NAVE.aisle + 0.8)), wa - 0.35, wa + 0.35, g, g + 7.4);
        spire(paint(LIGHT), ring(f, ab, wa, 0.45 * Math.SQRT2, g + 7.4, 4), P(f, ab, g + 8.4, wa));
      }
    }
    // aisle lean-to roof + eave fascia, closing triangle at the chevet; nave roof slope + eave fascia
    const [ao, ai] = [sg * (NAVE.aisle + 0.3), sg * NAVE.nave];
    quadOut(tile(), P(f, ao, g + NAVE.aisleH, NAVE.w0), P(f, ao, g + NAVE.aisleH, NAVE.w1), P(f, ai, g + NAVE.aisleRidge, NAVE.w1), P(f, ai, g + NAVE.aisleRidge, NAVE.w0), [sg * f.ux, 2.3, sg * f.uz]);
    paint(LIGHT);
    fbox(st, f, Math.min(sg * NAVE.aisle, ao), Math.max(sg * NAVE.aisle, ao), NAVE.w1, NAVE.w0, g + NAVE.aisleH - 0.3, g + NAVE.aisleH);
    triOut(paint(STONE), P(f, ao, g + NAVE.aisleH, NAVE.w1), P(f, ai, g + NAVE.aisleRidge, NAVE.w1), P(f, ai, g + NAVE.aisleH, NAVE.w1), IN);
    const eo = sg * (NAVE.nave + 0.3);
    quadOut(tile(), P(f, eo, g + NAVE.wallH, -0.5), P(f, eo, g + NAVE.wallH, NAVE.w1), P(f, 0, g + NAVE.ridge, NAVE.w1), P(f, 0, g + NAVE.ridge, -0.5), [sg * f.ux, 1.2, sg * f.uz]);
    paint(LIGHT);
    fbox(st, f, Math.min(ai, eo), Math.max(ai, eo), NAVE.w1, NAVE.w0, g + NAVE.wallH - 0.3, g + NAVE.wallH);
  }
  paint('#3a3634');
  fbox(st, f, -0.15, 0.15, NAVE.w1, -0.5, g + NAVE.ridge - 0.05, g + NAVE.ridge + 0.22); // ridge
  solid(-NAVE.aisle, NAVE.aisle, NAVE.w1, NAVE.w0, g, g + NAVE.aisleH);
  // apse: half-decagon of radius 4.7, lancets on the three middle faces, half-cone roof
  const ap: [number, number][] = Array.from({ length: 6 }, (_, k) => { const t = (k * Math.PI) / 5; return [APSE_R * Math.cos(t), NAVE.w1 - APSE_R * Math.sin(t)]; });
  for (let i = 0; i < 5; i++) {
    const [p0, p1] = [ap[i]!, ap[i + 1]!];
    const L = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
    const [ma, mw] = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2];
    const nl = Math.hypot(ma, mw - NAVE.w1);
    const pl: Pl = { a: ma, w: mw, da: (p1[0] - p0[0]) / L, dw: (p1[1] - p0[1]) / L, na: ma / nl, nw: (mw - NAVE.w1) / nl };
    if (i >= 1 && i <= 3) tq(pl, R.apse, -L / 2, L / 2, g, g + NAVE.wallH);
    else stq(pl, -L / 2, L / 2, g, g + NAVE.wallH);
  }
  const apex = P(f, 0, g + NAVE.ridge, NAVE.w1);
  for (let i = 0; i < 5; i++) {
    const e = (k: number) => { const t = (k * Math.PI) / 5; return P(f, (APSE_R + 0.3) * Math.cos(t), g + NAVE.wallH, NAVE.w1 - (APSE_R + 0.3) * Math.sin(t)); };
    const [e0, e1] = [e(i), e(i + 1)];
    triOut(tile(), e0, e1, apex, [(e0[0] + e1[0]) / 2 - apex[0], 2.5, (e0[2] + e1[2]) / 2 - apex[2]]);
  }
  // chevet: stone walls on the outline, hipped roof lofted to a shrunken ring
  for (let i = 0; i + 1 < CHEVET.length; i++) {
    const [p0, p1] = [CHEVET[i]!, CHEVET[i + 1]!];
    const L = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
    const [da, dw] = [(p1[0] - p0[0]) / L, (p1[1] - p0[1]) / L];
    stq({ a: (p0[0] + p1[0]) / 2, w: (p0[1] + p1[1]) / 2, da, dw, na: dw, nw: -da }, -L / 2, L / 2, g, g + NAVE.aisleH);
  }
  const [cca, ccw] = [CHEVET.reduce((t, p) => t + p[0], 0) / CHEVET.length, CHEVET.reduce((t, p) => t + p[1], 0) / CHEVET.length - 1];
  const lo = CHEVET.map(([a, w]) => P(f, a, g + NAVE.aisleH, w));
  const hi = CHEVET.map(([a, w]) => P(f, cca + (a - cca) * 0.42, g + 11, ccw + (w - ccw) * 0.42));
  loft(tile(), [lo, hi], 4);
  cap(tile(), hi, UP);
  solidPoly(CHEVET, g, g + NAVE.aisleH);

  // ── forecourt: steps, bonsai pots, pavement, the railing with gate pillars, the planters ──
  for (let k = 0; k < 3; k++) {
    paint('#a9a7a0');
    fbox(st, f, -11.5, 11.5, 0, 1.0 + k * 0.8, g + 0.3 - k * 0.15, g + 0.45 - k * 0.15);
    solid(-11.5, 11.5, 0, 1.0 + k * 0.8, g, g + 0.45 - k * 0.15);
  }
  for (const a of [-9.6, -6.4, -3.2, 3.2, 6.4, 9.6]) {
    lathe(paint('#b9ada0', nr), f, a, 3.3, [[0.36, g], [0.44, g + 0.55], [0.3, g + 0.62]], 8);
    fbox(paint('#5a4030', nr), f, a - 0.06, a + 0.06, 3.24, 3.36, g + 0.6, g + 1.1);
    lathe(paint('#3f6b3a', nr), f, a, 3.3, [[0.15, g + 0.95], [0.62, g + 1.25], [0.72, g + 1.65], [0.42, g + 2.05], [0, g + 2.25]], 8);
    solid(a - 0.45, a + 0.45, 2.85, 3.75, g, g + 1.2);
  }
  const pave = s.buf('pave');
  quadOut(pave, P(f, -17, g + 0.03, 2.6), P(f, 12.5, g + 0.03, 2.6), P(f, 12.5, g + 0.03, 40), P(f, -17, g + 0.03, 40), UP, 0, 0, 29.5, 37.4);
  const iron = s.buf('metal');
  const ironN = s.buf('metal', 'near');
  for (const [a0, a1] of FENCE) {
    const n = Math.ceil((a1 - a0) / 2.4);
    paint(IRON, iron);
    for (let k = 0; k <= n; k++) {
      const a = a0 + ((a1 - a0) * k) / n;
      fbox(iron, f, a - 0.05, a + 0.05, FENCE_W - 0.05, FENCE_W + 0.05, g, g + 1.45);
      lathe(paint(IRON, ironN), f, a, FENCE_W, [[0.07, g + 1.45], [0.1, g + 1.55], [0, g + 1.75]], 6);
    }
    for (const y of [0.3, 1.15]) fbox(paint(IRON, iron), f, a0, a1, FENCE_W - 0.03, FENCE_W + 0.03, g + y, g + y + 0.06);
    paint(IRON, ironN);
    for (let a = a0 + 0.2; a < a1 - 0.05; a += 0.2) fbox(ironN, f, a - 0.015, a + 0.015, FENCE_W - 0.015, FENCE_W + 0.015, g + 0.36, g + 1.36);
    solid(a0, a1, FENCE_W - 0.06, FENCE_W + 0.06, g, g + 1.4);
  }
  for (const a of FENCE.flat().filter((a) => Math.abs(a) < 12)) { // gate pillars at the gaps (not at the run ends)
    paint('#b5b3aa');
    fbox(st, f, a - 0.23, a + 0.23, FENCE_W - 0.23, FENCE_W + 0.23, g, g + 1.7);
    fbox(st, f, a - 0.3, a + 0.3, FENCE_W - 0.3, FENCE_W + 0.3, g + 1.7, g + 1.88);
    lathe(paint(PALE, nr), f, a, FENCE_W, [[0.2, g + 1.88], [0.24, g + 2.0], [0, g + 2.3]], 6);
    solid(a - 0.25, a + 0.25, FENCE_W - 0.25, FENCE_W + 0.25, g, g + 1.9);
  }
  for (const w of [18, 22, 26, 30]) { // white planters along the north kerb of the square
    paint('#eceae2', nr);
    fbox(nr, f, 11.1, 12.1, w - 0.3, w + 0.3, g, g + 0.5);
    fbox(paint('#4f7d3f', nr), f, 11.15, 12.05, w - 0.25, w + 0.25, g + 0.5, g + 0.78);
    solid(11.1, 12.1, w - 0.3, w + 0.3, g, g + 0.6);
  }

  // ── the Regina Pacis garden: kerb, lawn, iron ring fence, shrubs, flower beds, the statue on her pedestal ──
  const { a: ga, w: gw, r: gr } = GARDEN;
  const N = 30;
  const outerLo = ring(f, ga, gw, gr, g, N);
  const outerHi = ring(f, ga, gw, gr, g + 0.18, N);
  const innerHi = ring(f, ga, gw, gr - 0.3, g + 0.18, N);
  loft(paint('#b0aea6'), [outerLo, outerHi], 4);
  for (let i = 0; i < N; i++) quadOut(st, outerHi[i]!, outerHi[(i + 1) % N]!, innerHi[(i + 1) % N]!, innerHi[i]!, UP);
  cap(paint(LAWN), ring(f, ga, gw, gr - 0.3, g + 0.17, N), UP);
  s.prism([outerLo.flatMap((p) => [p[0], p[2]])], g, g + 1.2);
  const fr = gr - 0.15;
  const fp = (k: number, y: number) => P(f, ga + fr * Math.cos((2 * Math.PI * k) / N), y, gw + fr * Math.sin((2 * Math.PI * k) / N));
  for (let k = 0; k < N; k++) {
    const p = fp(k, g + 0.18);
    const q = fp(k, g + 1.0);
    bar(paint(IRON, iron), p, q, 0.06);
    for (const y of [0.55, 0.95]) bar(paint(IRON, iron), fp(k, g + y), fp(k + 1, g + y), 0.04);
    for (let t = 0.2; t < 1; t += 0.2) { // bars between the posts
      const u = (2 * Math.PI * (k + t)) / N;
      const [x, z] = [ga + fr * Math.cos(u), gw + fr * Math.sin(u)];
      fbox(paint(IRON, ironN), f, x - 0.015, x + 0.015, z - 0.015, z + 0.015, g + 0.2, g + 1.1);
    }
  }
  for (let k = 0; k < 6; k++) { // trimmed round shrubs
    const t = (k * Math.PI) / 3 + Math.PI / 6;
    const [x, z, rr] = [ga + 3.9 * Math.cos(t), gw + 3.9 * Math.sin(t), 0.85 + 0.25 * hash(k)];
    lathe(paint(k % 2 ? '#3d6a36' : '#4a7a3c', nr), f, x, z, [[rr * 0.5, g + 0.2], [rr, g + 0.2 + rr * 0.8], [rr * 0.85, g + 0.2 + rr * 1.5], [rr * 0.4, g + 0.2 + rr * 1.9], [0, g + 0.2 + rr * 2.05]], 8);
  }
  for (let k = 0; k < 6; k++) { // flower beds
    const t = (k * Math.PI) / 3;
    const [x, z] = [ga + 2.3 * Math.cos(t), gw + 2.3 * Math.sin(t)];
    fbox(paint('#4f7d3f', nr), f, x - 0.45, x + 0.45, z - 0.45, z + 0.45, g + 0.17, g + 0.4);
    fbox(paint(k % 2 ? '#d0588a' : '#e2c24c', nr), f, x - 0.38, x + 0.38, z - 0.38, z + 0.38, g + 0.4, g + 0.55);
  }
  for (const t of [0, Math.PI]) lathe(paint('#46733c', nr), f, ga + 5.1 * Math.cos(t), gw + 5.1 * Math.sin(t), [[0.5, g + 0.2], [0.42, g + 1.0], [0.2, g + 1.8], [0, g + 2.3]], 8); // cone shrubs
  paint('#a9a7a0');
  fbox(st, f, ga - 1.1, ga + 1.1, gw - 1.1, gw + 1.1, g + 0.17, g + 0.6);
  paint('#8e8d87');
  fbox(st, f, ga - 0.65, ga + 0.65, gw - 0.65, gw + 0.65, g + 0.6, g + 3.0);
  paint('#a9a7a0');
  fbox(st, f, ga - 0.78, ga + 0.78, gw - 0.78, gw + 0.78, g + 3.0, g + 3.25);
  tq({ a: ga, w: gw + 0.66, da: 1, dw: 0, na: 0, nw: 1 }, R.plaque, -0.8, 0.8, g + 1.6, g + 2.6, '#55564f'); // REGINA PACIS, facing the square
  solid(ga - 1.1, ga + 1.1, gw - 1.1, gw + 1.1, g, g + 3.3);
  const br = s.buf('bronze');
  const sf = { ...f, cx: P(f, ga, 0, gw)[0], cz: P(f, ga, 0, gw)[2] }; // statue frame, facing +w like the plaque
  lathe(br, sf, 0, 0, [[0.5, g + 3.25], [0.42, g + 4.3], [0.34, g + 5.05], [0.26, g + 5.3]], 10); // robe
  fbox(br, sf, -0.36, 0.36, -0.2, 0.2, g + 5.2, g + 5.5); // shoulders
  lathe(br, sf, 0, 0, [[0.12, g + 5.5], [0.19, g + 5.68], [0.16, g + 5.9], [0, g + 6.02]], 10); // head
  loft(br, [ring(sf, 0, 0, 0.2, g + 5.95, 8), ring(sf, 0, 0, 0.24, g + 6.2, 8)], 4); // crown
  fbox(br, sf, -0.42, -0.2, 0.05, 0.42, g + 4.55, g + 4.8); // left arm carrying the Child
  lathe(br, sf, -0.32, 0.36, [[0.14, g + 4.75], [0.17, g + 5.0], [0.09, g + 5.3], [0.11, g + 5.45], [0, g + 5.55]], 6);
  fbox(br, sf, 0.2, 0.42, 0.05, 0.3, g + 4.6, g + 4.85); // right arm

  const out = s.out();
  return { ...out, ...(image ? { textures: [{ material: 'mural' as const, image }] } : {}) };
};
