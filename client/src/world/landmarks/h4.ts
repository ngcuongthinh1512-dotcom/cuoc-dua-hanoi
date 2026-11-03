// Leg 3 (Hà Nội) landmark details, group h4 = Hai Bà Trưng: Công viên Thống Nhất, Đền Hai Bà Trưng, Đại học Bách Khoa (C10),
// Vincom Center Bà Triệu. Built in code on top of the generic S3DB body (index.ts `generic`); temple kit from h3.ts.
// Ground is flat (y ≈ 0); details are never solid (SPEC §5.9): colliders come from `h.renderPart` bodies / Sink.prism only.
import type { ChunkData, LandmarkId, XZ } from '../../geo/chunkData.ts';
import type { BuildCtx, BuildOut } from '../buildTypes.ts';
import type { MeshBuffer as Buf, V3 } from '../geom.ts';
import { pushBox, pushMatrix } from '../StreetProps.ts';
import { cap, DOWN, fbox, type Fr, P, rgb, ring, UP } from './b.ts';
import { hash, lathe } from './d.ts';
import { BRICK, CREAM, DARK, EMPTY, frameAt, gate3, hall, monument, OCHRE, opening, STONE, TILE, tiledBody } from './h3.ts';
import type { DetailFn } from './index.ts';
import { footprintFrame, loft, quadOut, triOut } from './kit.ts';
import { Sink } from './parts.ts';

// ── Công viên Thống Nhất: the park polygon (kind artwork, 60 ha, mostly lawn and trees: the lawn is lost with the outline, see
// the report) — two hexagonal pavilions beside the fountain plaza, statues on the OSM artwork nodes, jets on the fountain
// node. The main gate on Trần Nhân Tông is a PLACED detail (`placed` below): the park record lives in chunk −4_8, 330 m
// from the gate, whose colliders would never be active there (chunks.colliderRadius 150 m). ──

// ── Cổng chính Trần Nhân Tông (21.01708 N, 105.84477 E: the step in the OSM outline at x −750…−785, opposite hồ Thiền Quang).
// After the owner's photo of the 2022 pergola gate: pale-yellow square columns with a terracotta base band, a flat beam
// frame with rafter ends on top; a 12 m portal of 2 × 2 columns per side (7.3 m) round a 5 m opening, a 13 m lower
// colonnade wing (4.8 m) each side with short end posts; the dark-green board "CÔNG VIÊN THỐNG NHẤT / THONG NHAT PARK /
// SINCE 1958" hung between the inner columns; four white globe lamps on bracket arms on the portal's inner faces; a paved
// approach with four double-globe lamp posts, black iron fences with an open leaf beyond the wings, low hedges. Frame:
// a = east (the viewer on the street sees +a on his left), w = south into the park; the street is 26 m north (w = −26).
// Columns, wing posts and fences are solid (Sink.prism); the 5 m opening, hedges and lamps are not. The board is one
// OffscreenCanvas on 'mural' (as h3.ts / m.ts); without OffscreenCanvas it stays a plain dark-green panel. ──
const GATE: [number, number] = [-768, 1676];
const YELLOW = '#efd98a';
const BASE = '#c46a44'; // terracotta band
const IRON = '#1b2420';
const HEDGE = '#3f6b36';
const [BW, BH] = [1024, 352]; // board atlas px ≙ 5 × 1.72 m

function paintBoard(): ImageBitmap | undefined {
  if (typeof OffscreenCanvas === 'undefined') return;
  const c = new OffscreenCanvas(BW, BH);
  const g = c.getContext('2d');
  if (!g) return;
  g.fillStyle = '#163f2b';
  g.fillRect(0, 0, BW, BH);
  g.strokeStyle = '#d8c98a';
  g.lineWidth = 6;
  g.strokeRect(14, 14, BW - 28, BH - 28);
  g.fillStyle = '#ffffff';
  g.textAlign = 'center';
  g.font = 'bold 112px Georgia, "Times New Roman", serif';
  g.fillText('CÔNG VIÊN THỐNG NHẤT', BW / 2, 150, BW - 80);
  g.font = 'bold 64px Georgia, "Times New Roman", serif';
  g.fillText('THONG NHAT PARK', BW / 2, 250, BW - 200);
  g.textAlign = 'right';
  g.font = '30px Georgia, "Times New Roman", serif';
  g.fillText('SINCE 1958', BW - 40, 318);
  return c.transferToImageBitmap();
}

/** Pale-yellow beam frame on a frame: two beams along a at w = ±wb, rafter ends across (±wr) every 0.6 m. */
function pergola(st: Buf, f: Fr, a0: number, a1: number, wb: number, wr: number, y: number, beam: number, rafter: number) {
  st.color = rgb(YELLOW);
  for (const sg of [-1, 1]) fbox(st, f, a0, a1, sg * wb - 0.25, sg * wb + 0.25, y, y + beam);
  for (let a = a0 + 0.3; a < a1 - 0.1; a += 0.6) fbox(st, f, a - 0.12, a + 0.12, -wr, wr, y + beam, y + beam + rafter);
}

/** Frosted globe (unlit 'neon' white) of radius r centred at (a, w, y). */
function globe(glow: Buf, f: Fr, a: number, w: number, y: number, r: number) {
  lathe(glow, f, a, w, [[r * 0.4, y - r * 0.9], [r * 0.8, y - r * 0.55], [r, y], [r * 0.8, y + r * 0.55], [r * 0.4, y + r * 0.9], [0, y + r]], 8);
  cap(glow, ring(f, a, w, r * 0.4, y - r * 0.9, 8), DOWN);
}

/** The park's white double-globe lamp post (3.6 m, cross arm along `yaw`'s direction). ≈ 150 triangles. */
function lampPost(s: Sink, x: number, z: number, g: number, yaw = 0) {
  const f = frameAt(x, z, Math.cos(yaw), Math.sin(yaw));
  const st = s.buf('masonry');
  st.color = rgb('#ece4d2');
  lathe(st, f, 0, 0, [[0.22, g], [0.12, g + 0.5], [0.08, g + 3.4], [0.1, g + 3.6]], 8);
  fbox(st, f, -0.65, 0.65, -0.04, 0.04, g + 3.5, g + 3.6); // cross arm
  const glow = s.buf('neon');
  glow.color = rgb('#fbfbf2');
  for (const da of [-0.65, 0.65]) globe(glow, f, da, 0, g + 3.85, 0.2);
}

/** Grey stone garden lantern (đèn đá), 2.1 m. */
function stoneLantern(s: Sink, x: number, z: number, g: number) {
  const st = s.buf('masonry');
  st.color = rgb('#9a968c');
  lathe(st, frameAt(x, z), 0, 0, [[0.45, g], [0.45, g + 0.25], [0.18, g + 0.3], [0.18, g + 1.2], [0.4, g + 1.25], [0.4, g + 1.6], [0.58, g + 1.65], [0.1, g + 2.05], [0, g + 2.15]], 6);
}

/** Park notice board: two posts, a dark-green board with a pale panel, facing −w of `yaw` (0 = north). */
function signboard(s: Sink, x: number, z: number, g: number, yaw: number) {
  const f = frameAt(x, z, Math.cos(yaw), Math.sin(yaw));
  const st = s.buf('masonry');
  st.color = rgb('#4a3b2c');
  for (const a of [-0.9, 0.9]) fbox(st, f, a - 0.05, a + 0.05, -0.05, 0.05, g, g + 2.3);
  st.color = rgb('#163f2b');
  fbox(st, f, -1.1, 1.1, -0.04, 0.04, g + 1.1, g + 2.4);
  st.color = rgb('#e9e2cc');
  fbox(st, f, -1.0, 1.0, -0.06, 0.06, g + 1.2, g + 2.3); // the map panel (blank, ponytail: a canvas map if ever wanted)
  s.prism([[P(f, -1.1, 0, -0.06), P(f, 1.1, 0, -0.06), P(f, 1.1, 0, 0.06), P(f, -1.1, 0, 0.06)].flatMap((p) => [p[0], p[2]])], g, g + 2.4);
}

const thongNhatGate = (_chunk: ChunkData, ctx: BuildCtx): BuildOut => {
  const g = ctx.height(GATE[0], GATE[1]);
  const s = new Sink();
  const f = frameAt(GATE[0], GATE[1]);
  const st = s.buf('masonry'); // one buffer: set `st.color` right before each write
  const glow = s.buf('neon');
  glow.color = rgb('#fbfbf2');
  const iron = s.buf('metal');
  iron.color = rgb(IRON);
  const column = (a: number, w: number, half: number, h: number) => {
    st.color = rgb(YELLOW);
    fbox(st, f, a - half, a + half, w - half, w + half, g + 1, g + h);
    st.color = rgb(BASE);
    fbox(st, f, a - half - 0.04, a + half + 0.04, w - half - 0.04, w + half + 0.04, g, g + 1);
    s.prism([[P(f, a - half, 0, w - half), P(f, a + half, 0, w - half), P(f, a + half, 0, w + half), P(f, a - half, 0, w + half)].flatMap((p) => [p[0], p[2]])], g, g + h);
  };
  // portal: 2 × 2 columns per side (1.2 m square), beam frame on top
  for (const sa of [-1, 1]) for (const [a, w] of [[3.1, -0.9], [3.1, 0.9], [5.3, -0.9], [5.3, 0.9]] as const) column(sa * a, w, 0.6, 6.2);
  pergola(st, f, -5.9, 5.9, 1.1, 1.8, g + 6.2, 0.7, 0.4);
  for (const sa of [-1, 1]) for (const w of [-0.9, 0.9]) { // globe lamps on the inner faces
    st.color = rgb(YELLOW);
    fbox(st, f, sa * 2.5 - (sa > 0 ? 0.45 : 0), sa * 2.5 + (sa > 0 ? 0 : 0.45), w - 0.05, w + 0.05, g + 3.55, g + 3.65); // bracket arm
    globe(glow, f, sa * 2.1, w, g + 3.9, 0.22);
  }
  // wings: single row of 0.8 m columns every 3 m, lower pergola, a short plain post at each end
  for (const sa of [-1, 1]) {
    for (const a of [8.5, 11.5, 14.5, 17.5]) column(sa * a, 0, 0.4, 4.0);
    pergola(st, f, Math.min(sa * 6.5, sa * 18.5), Math.max(sa * 6.5, sa * 18.5), 0.6, 1.0, g + 4.0, 0.5, 0.3);
    column(sa * 19.6, 0, 0.3, 2.6);
  }
  // sign board between the inner columns, both faces lettered
  const image = paintBoard();
  const board = image ? s.buf('mural') : s.buf('masonry');
  if (!image) board.color = rgb('#163f2b');
  st.color = rgb('#2a2a28');
  fbox(st, f, -2.5, 2.5, -0.08, 0.08, g + 4.3, g + 6.02); // the board's edge / back plate
  for (const sg of [-1, 1]) { // front (street, −w): the viewer's left is +a; back: −a
    const [l, r] = [-sg * 2.5, sg * 2.5];
    quadOut(board, P(f, l, g + 4.3, sg * 0.09), P(f, r, g + 4.3, sg * 0.09), P(f, r, g + 6.02, sg * 0.09), P(f, l, g + 6.02, sg * 0.09), [-f.uz * sg, 0, f.ux * sg], 0, 1, 1, 0);
  }
  // paved approach from the sidewalk through the opening into the park
  const pave = s.buf('pave');
  quadOut(pave, P(f, -6, g + 0.06, -8), P(f, 6, g + 0.06, -8), P(f, 6, g + 0.06, 26), P(f, -6, g + 0.06, 26), UP, 0, 0, 12, 34);
  // double-globe lamp posts and stone lanterns flanking the approach inside the park
  for (const sa of [-1, 1]) {
    for (const w of [8, 17]) lampPost(s, GATE[0] + sa * 4.8, GATE[1] + w, g);
    for (const w of [11, 20]) stoneLantern(s, GATE[0] + sa * 7.4, GATE[1] + w, g);
  }
  signboard(s, GATE[0] - 8.5, GATE[1] + 30, g, 0); // park map board facing the approach
  // black iron fences beyond the wings (posts, two rails, pickets), the first leaf swung open into the park
  const rail = (a0: number, a1: number, w0: number, w1: number) => { // along the segment (a0, w0) → (a1, w1), 1.6 m tall
    const len = Math.hypot(a1 - a0, w1 - w0);
    const [ua, uw] = [(a1 - a0) / len, (w1 - w0) / len];
    const at = (t: number, y: number, o = 0): V3 => P(f, a0 + ua * t - uw * o, y, w0 + uw * t + ua * o);
    const bar = (t0: number, t1: number, y0: number, y1: number, th: number) => {
      const r = (y: number): V3[] => [at(t0, y, -th), at(t1, y, -th), at(t1, y, th), at(t0, y, th)];
      loft(iron, [r(y0), r(y1)]);
      cap(iron, r(y1), UP);
    };
    for (let t = 0; t <= len + 0.01; t += 2) bar(t - 0.04, t + 0.04, g, g + 1.7, 0.04);
    for (const y of [0.35, 1.45]) bar(0, len, g + y, g + y + 0.05, 0.025);
    for (let t = 0.2; t < len; t += 0.16) bar(t - 0.012, t + 0.012, g + 0.1, g + 1.6, 0.012);
    s.prism([[at(0, 0, -0.05), at(len, 0, -0.05), at(len, 0, 0.05), at(0, 0, 0.05)].flatMap((p) => [p[0], p[2]])], g, g + 1.7);
  };
  for (const sa of [-1, 1]) {
    rail(sa * 20.2, sa * 20.2, 0, 2.4); // the open leaf, hinged at the end post
    rail(sa * 22.8, sa * 34, 0, 0);
  }
  // low hedges: inside the fences, and along the approach
  st.color = rgb(HEDGE);
  for (const sa of [-1, 1]) {
    fbox(st, f, Math.min(sa * 22.8, sa * 34), Math.max(sa * 22.8, sa * 34), 0.6, 1.4, g, g + 0.7);
    fbox(st, f, sa * 6.6 - 0.4, sa * 6.6 + 0.4, 3, 20, g, g + 0.6);
  }
  const out = s.out();
  return image ? { ...out, textures: [{ material: 'mural', image }] } : out;
};

// ── The park interior (`thongNhatPark`, run by every chunk over the park box). Data-driven from the chunk: the OSM lawn
// pieces (areas kind park), the footways (RoadBuilder already paves them), the carved height grid (hồ Bảy Mẫu: height
// < −0.2 = water, the lake stays as configured and swimmable). Trees (InstanceSet 'tree', hashed size and proportions =
// 4 "species" of the one platane mesh; ponytail: real species need more prop kinds) in rows along the paths and scattered
// over the lawns; benches (InstanceSet 'bench') + bins and the white double-globe lamp posts along the paths; small plazas
// at path junctions (pave disc, flowerbed, benches); lake-shore railings, reed clumps and lily pads where a path runs
// along the water; lawn tone patches. Hand-placed decor on the open lawns north of the lake (checked against the chunk
// data on 2026-11-03: ≥ 8 m from every path, no building, no water): playground, outdoor gym, stage, two café kiosks
// with terraces (InstanceSet 'cafe'), a pergola walk, the fountain basin + flowerbeds, a footbridge to the east island
// with a pavilion. Solid: trunks are not (as the street trees), lamp posts / lanterns / pavilions / kiosk counters /
// pergola columns / stage / bridge deck are (Sink.prism); benches, railings, reeds, play items are not. ──
const PARK = { minX: -1110, maxX: -470, minZ: 1660, maxZ: 2695 };
const PATH_KINDS = new Set(['footway', 'path', 'cycleway', 'pedestrian']);
const LAWNS = ['#6a8a48', '#7a9c54', '#5e7e43', '#88a35c'];
const FLOWERS = ['#d8405a', '#f2c230', '#e86aa8', '#f0f0e6', '#e8622a'];

function inRing(x: number, z: number, r: XZ) {
  let inside = false;
  for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
    const [xi, zi, xj, zj] = [r[i]!, r[i + 1]!, r[j]!, r[j + 1]!];
    if (zi > z !== zj > z && x < xi + ((z - zi) / (zj - zi)) * (xj - xi)) inside = !inside;
  }
  return inside;
}

/** Flat disc (fan) of radius r at height y. */
function disc(buf: Buf, x: number, z: number, r: number, y: number, n = 14) {
  cap(buf, ring(frameAt(x, z), 0, 0, r, y, n), UP);
}

/** Round raised flowerbed: stone kerb, soil, flowering shrub domes in one colour. */
function flowerbed(s: Sink, x: number, z: number, g: number, r: number, colour: string) {
  const st = s.buf('masonry');
  const f = frameAt(x, z);
  st.color = rgb('#b8b0a0');
  lathe(st, f, 0, 0, [[r + 0.3, g], [r + 0.3, g + 0.4], [r, g + 0.42]], 12);
  st.color = rgb('#4f6a34');
  disc(st, x, z, r, g + 0.42, 12);
  st.color = rgb(colour);
  for (let k = 0; k < 5; k++) {
    const t = hash(x + z + k * 2.1) * Math.PI * 2;
    const d = hash(x * 1.3 + k) * (r - 0.5);
    lathe(st, f, Math.cos(t) * d, Math.sin(t) * d, [[0.45, g + 0.42], [0.4, g + 0.75], [0.2, g + 0.95], [0, g + 1.0]], 6);
  }
}

/** Kerbed stone basin (the fountain's rim) round the water polygon at (x, z). */
function basin(s: Sink, x: number, z: number, g: number, r: number) {
  const st = s.buf('masonry');
  st.color = rgb('#aaa49a');
  lathe(st, frameAt(x, z), 0, 0, [[r + 0.6, g], [r + 0.6, g + 0.5], [r, g + 0.55], [r - 0.2, g + 0.2]], 24);
}

/** Children's playground: sand pad, swing frame, slide, carousel, seesaw (visual only). */
function playground(s: Sink, x: number, z: number, g: number) {
  const st = s.buf('masonry');
  st.color = rgb('#d9c38f');
  disc(st, x, z, 14, g + 0.03, 18);
  const f = frameAt(x, z);
  // swings: blue frame, two red seats on ropes
  st.color = rgb('#2f6fb5');
  for (const a of [-8.8, -5.2]) for (const w of [-0.9, 0.9]) fbox(st, f, a - 0.06, a + 0.06, w - 0.06, w + 0.06, g, g + 2.4);
  fbox(st, f, -9, -5, -0.06, 0.06, g + 2.35, g + 2.47);
  for (const a of [-7.9, -6.1]) {
    st.color = rgb('#444');
    for (const da of [-0.25, 0.25]) fbox(st, f, a + da - 0.015, a + da + 0.015, -0.015, 0.015, g + 0.55, g + 2.35);
    st.color = rgb('#d33a2f');
    fbox(st, f, a - 0.3, a + 0.3, -0.12, 0.12, g + 0.5, g + 0.56);
  }
  // slide: ladder, platform, yellow chute down to the sand
  st.color = rgb('#2f6fb5');
  for (const a of [-0.5, 0.5]) for (const w of [5.5, 6.5]) fbox(st, f, a - 0.05, a + 0.05, w - 0.05, w + 0.05, g, g + 2.0);
  fbox(st, f, -0.6, 0.6, 5.4, 6.6, g + 1.9, g + 2.0);
  for (let k = 0; k < 5; k++) fbox(st, f, -0.5, 0.5, 6.55, 6.6, g + 0.3 + k * 0.35, g + 0.33 + k * 0.35); // rungs
  st.color = rgb('#f2c230');
  quadOut(st, P(f, -0.4, g + 1.95, 5.4), P(f, 0.4, g + 1.95, 5.4), P(f, 0.4, g + 0.3, 1.2), P(f, -0.4, g + 0.3, 1.2), [0, 1, -0.3]);
  quadOut(st, P(f, -0.4, g + 1.9, 5.4), P(f, 0.4, g + 1.9, 5.4), P(f, 0.4, g + 0.25, 1.2), P(f, -0.4, g + 0.25, 1.2), [0, -1, 0.3]);
  for (const a of [-0.45, 0.45]) quadOut(st, P(f, a, g + 1.9, 5.4), P(f, a, g + 2.3, 5.4), P(f, a, g + 0.65, 1.2), P(f, a, g + 0.25, 1.2), [a, 0, 0]); // side rails
  // carousel: red disc, centre pole, six handle bars
  st.color = rgb('#d33a2f');
  lathe(st, f, 7, 0, [[1.8, g + 0.1], [1.8, g + 0.4]], 12);
  st.color = rgb('#2f6fb5');
  lathe(st, f, 7, 0, [[0.06, g + 0.4], [0.06, g + 1.3], [0, g + 1.35]], 6);
  for (let k = 0; k < 6; k++) {
    const fk = frameAt(x + 7 * f.ux, z + 7 * f.uz, Math.cos((k * Math.PI) / 3), Math.sin((k * Math.PI) / 3));
    fbox(st, fk, 0.2, 1.6, -0.03, 0.03, g + 1.0, g + 1.06);
    fbox(st, fk, 1.5, 1.6, -0.03, 0.03, g + 0.4, g + 1.06);
  }
  s.prism([ring(f, 7, 0, 1.8, 0, 8).flatMap((p) => [p[0], p[2]])], g, g + 0.4);
  // seesaw
  st.color = rgb('#2f6fb5');
  fbox(st, f, -0.3, 0.3, -6.3, -5.7, g, g + 0.5);
  st.color = rgb('#f2c230');
  quadOut(st, P(f, -1.8, g + 0.15, -6.2), P(f, 1.8, g + 0.85, -6.2), P(f, 1.8, g + 0.85, -5.8), P(f, -1.8, g + 0.15, -5.8), UP);
  quadOut(st, P(f, -1.8, g + 0.1, -6.2), P(f, 1.8, g + 0.8, -6.2), P(f, 1.8, g + 0.8, -5.8), P(f, -1.8, g + 0.1, -5.8), DOWN);
}

/** Outdoor gym (thể dục ngoài trời): rubber mat, four yellow-and-blue stations on posts. */
function gym(s: Sink, x: number, z: number, g: number) {
  const st = s.buf('masonry');
  st.color = rgb('#7a4a3e');
  disc(st, x, z, 8, g + 0.03, 14);
  for (const [a, w] of [[-3.5, -3.5], [3.5, -3.5], [-3.5, 3.5], [3.5, 3.5]] as const) {
    const f = frameAt(x + a, z + w, a > 0 ? 1 : 0, a > 0 ? 0 : 1);
    st.color = rgb('#2f6fb5');
    for (const da of [-0.7, 0.7]) lathe(st, f, da, 0, [[0.05, g], [0.05, g + 1.6], [0, g + 1.65]], 6);
    fbox(st, f, -0.75, 0.75, -0.04, 0.04, g + 1.55, g + 1.63);
    st.color = rgb('#f2c230');
    if (w < 0) lathe(st, f, 0, 0.3, [[0.35, g + 0.9], [0.35, g + 0.98]], 10); // wheel
    else for (const da of [-0.35, 0.35]) fbox(st, f, da - 0.15, da + 0.15, -0.3, 0.3, g + 0.25, g + 0.32); // pedals / steps
  }
}

/** Small open-air stage: platform with front steps, red back wall, roof slab on two posts; faces −w of `yaw`. */
function stage(s: Sink, x: number, z: number, g: number, yaw: number) {
  const f = frameAt(x, z, Math.cos(yaw), Math.sin(yaw));
  const st = s.buf('masonry');
  st.color = rgb('#9c9892');
  fbox(st, f, -6, 6, -3.5, 3.5, g, g + 0.9);
  for (let k = 0; k < 3; k++) fbox(st, f, -2, 2, -3.5 - 0.35 * (3 - k), -3.5, g, g + 0.3 * (k + 1));
  st.color = rgb('#b8382c');
  fbox(st, f, -6, 6, 3.1, 3.5, g + 0.9, g + 4.6);
  st.color = rgb('#ece4d2');
  for (const a of [-5.6, 5.6]) fbox(st, f, a - 0.15, a + 0.15, -3.2, -2.9, g + 0.9, g + 4.6);
  st.color = rgb('#2d4a73');
  fbox(st, f, -6.4, 6.4, -3.6, 3.7, g + 4.6, g + 4.9);
  s.prism([[P(f, -6, 0, -3.5), P(f, 6, 0, -3.5), P(f, 6, 0, 3.5), P(f, -6, 0, 3.5)].flatMap((p) => [p[0], p[2]])], g, g + 0.9);
  s.prism([[P(f, -6, 0, 3.1), P(f, 6, 0, 3.1), P(f, 6, 0, 3.5), P(f, -6, 0, 3.5)].flatMap((p) => [p[0], p[2]])], g, g + 4.6);
}

/** Café kiosk: a hexagonal pavilion with a counter and red fascia on its south side, terrace tables around it. */
function kiosk(s: Sink, x: number, z: number, g: number, cafes: number[]) {
  pavilion(s, x, z, g);
  const f = frameAt(x, z);
  const st = s.buf('masonry');
  st.color = rgb('#5a3a2a');
  fbox(st, f, -1.6, 1.6, 2.2, 3.0, g, g + 1.05);
  st.color = rgb('#c0392b');
  fbox(st, f, -2.2, 2.2, 2.6, 3.1, g + 2.3, g + 2.8); // fascia
  s.prism([ring(f, 0, 0, 3.6, 0, 6).flatMap((p) => [p[0], p[2]])], g, g + 0.35);
  s.prism([[P(f, -1.6, 0, 2.2), P(f, 1.6, 0, 2.2), P(f, 1.6, 0, 3.0), P(f, -1.6, 0, 3.0)].flatMap((p) => [p[0], p[2]])], g, g + 1.05);
  for (const t of [0.35, 0.5, 0.65]) pushMatrix(cafes, x + Math.cos(t * Math.PI * 2) * 7, g, z + Math.sin(t * Math.PI * 2) * 7, t * Math.PI * 2);
}

/** Pergola walk `len` m long along `yaw`, 0.4 m columns every 3 m on both sides, climbing-plant green on top. */
function pergolaWalk(s: Sink, x: number, z: number, g: number, len: number, yaw: number) {
  const f = frameAt(x, z, Math.cos(yaw), Math.sin(yaw));
  const st = s.buf('masonry');
  for (let a = -len / 2; a <= len / 2 + 0.01; a += 3) for (const w of [-1.6, 1.6]) {
    st.color = rgb(YELLOW);
    fbox(st, f, a - 0.2, a + 0.2, w - 0.2, w + 0.2, g, g + 2.8);
    s.prism([[P(f, a - 0.2, 0, w - 0.2), P(f, a + 0.2, 0, w - 0.2), P(f, a + 0.2, 0, w + 0.2), P(f, a - 0.2, 0, w + 0.2)].flatMap((p) => [p[0], p[2]])], g, g + 2.8);
  }
  pergola(st, f, -len / 2 - 0.3, len / 2 + 0.3, 1.6, 2.1, g + 2.8, 0.35, 0.25);
  st.color = rgb('#4f7a3a');
  for (let a = -len / 2 + 1; a < len / 2; a += 4) lathe(st, f, a, (hash(a + x) - 0.5) * 2, [[1.2, g + 3.4], [0.9, g + 3.8], [0, g + 4.0]], 6); // vines over the top
}

/** Footbridge from (x0, z0) to (x1, z1): stone deck 2.6 m wide at +0.3 m (walkable), iron railings, round piers. */
function footbridge(s: Sink, x0: number, z0: number, x1: number, z1: number, g: number) {
  const L = Math.hypot(x1 - x0, z1 - z0);
  const f = frameAt((x0 + x1) / 2, (z0 + z1) / 2, (x1 - x0) / L, (z1 - z0) / L);
  const st = s.buf('masonry');
  st.color = rgb('#b8b0a0');
  fbox(st, f, -L / 2, L / 2, -1.3, 1.3, g - 0.1, g + 0.3);
  st.color = rgb('#8d877c');
  for (const a of [-L / 3, 0, L / 3]) lathe(st, f, a, 0, [[0.6, g - 3], [0.6, g - 0.1]], 8);
  const iron = s.buf('metal');
  iron.color = rgb(IRON);
  for (const w of [-1.2, 1.2]) {
    fbox(iron, f, -L / 2, L / 2, w - 0.03, w + 0.03, g + 1.25, g + 1.3);
    fbox(iron, f, -L / 2, L / 2, w - 0.02, w + 0.02, g + 0.75, g + 0.78);
    for (let a = -L / 2 + 0.1; a < L / 2; a += 2) fbox(iron, f, a - 0.03, a + 0.03, w - 0.03, w + 0.03, g + 0.3, g + 1.3);
  }
  s.prism([[P(f, -L / 2, 0, -1.3), P(f, L / 2, 0, -1.3), P(f, L / 2, 0, 1.3), P(f, -L / 2, 0, 1.3)].flatMap((p) => [p[0], p[2]])], g - 0.1, g + 0.3);
}

/** Hand-placed decor: world point (built by its chunk), keep-clear radius for the scatter, builder. */
const DECOR: readonly { x: number; z: number; r: number; build: (s: Sink, g: number, cafes: number[]) => void }[] = [
  { x: -680, z: 1712, r: 16, build: (s, g) => playground(s, -680, 1712, g) },
  { x: -880, z: 1712, r: 10, build: (s, g) => gym(s, -880, 1712, g) },
  { x: -730, z: 1888, r: 10, build: (s, g) => stage(s, -730, 1888, g, 0) }, // faces north, the lawn in front
  { x: -865, z: 1790, r: 10, build: (s, g, c) => kiosk(s, -865, 1790, g, c) },
  { x: -700, z: 1780, r: 10, build: (s, g, c) => kiosk(s, -700, 1780, g, c) },
  { x: -880, z: 1795, r: 5, build: (s, g) => pergolaWalk(s, -880, 1795, g, 24, Math.PI / 2) }, // north–south
  { x: -825, z: 1844, r: 14, build: (s, g) => { // the fountain plaza: basin, six flowerbeds and stone lanterns round it
    basin(s, -825, 1844, g, 7.4);
    for (let k = 0; k < 6; k++) {
      const t = (k * Math.PI) / 3 + Math.PI / 6;
      flowerbed(s, -825 + Math.cos(t) * 12, 1844 + Math.sin(t) * 12, g, 1.6, FLOWERS[k % FLOWERS.length]!);
      stoneLantern(s, -825 + Math.cos(t + Math.PI / 6) * 12, 1844 + Math.sin(t + Math.PI / 6) * 12, g);
    }
  } },
  { x: -745, z: 2338.8, r: 0, build: (s, g) => footbridge(s, -745, 2338.8, -786.8, 2317.1, g) }, // shore → Đảo (east island); g = the bank's height, not the lake bed
  { x: -814, z: 2291, r: 6, build: (s, g) => pavilion(s, -814, 2291, g) }, // on the island
];

const thongNhatPark = (chunk: ChunkData, ctx: BuildCtx): BuildOut => {
  const s = new Sink();
  const bd = ctx.bounds;
  const lawns = chunk.areas.filter((a) => a.kind === 'park' && a.outer.some((v, i) => i % 2 === 0 && v > PARK.minX && v < PARK.maxX && a.outer[i + 1]! > PARK.minZ && a.outer[i + 1]! < PARK.maxZ));
  if (!lawns.length) return EMPTY;
  const inPark = (x: number, z: number) => lawns.some((a) => inRing(x, z, a.outer) && !(a.holes ?? []).some((h) => inRing(x, z, h)));
  const water = (x: number, z: number) => ctx.height(x, z) < -0.2;
  const paths = chunk.roads.filter((r) => PATH_KINDS.has(r.kind) && r.pts.some((v, i) => i % 2 === 0 && inPark(v, r.pts[i + 1]!)));
  const segs: [number, number, number, number][] = [];
  for (const r of paths) for (let i = 0; i + 3 < r.pts.length; i += 2) segs.push([r.pts[i]!, r.pts[i + 1]!, r.pts[i + 2]!, r.pts[i + 3]!]);
  const dPath = (x: number, z: number) => {
    let m = Infinity;
    for (const [ax, az, bx, bz] of segs) {
      const l2 = (bx - ax) ** 2 + (bz - az) ** 2;
      const t = l2 ? Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (z - az) * (bz - az)) / l2)) : 0;
      m = Math.min(m, Math.hypot(x - ax - t * (bx - ax), z - az - t * (bz - az)));
    }
    return m;
  };
  const inBld = (x: number, z: number) => chunk.buildings.some((b) => inRing(x, z, b.outer));
  const taken: [number, number, number][] = DECOR.map((d) => [d.x, d.z, d.r]);
  const clear = (x: number, z: number, r = 0) => !taken.some(([tx, tz, tr]) => Math.hypot(tx - x, tz - z) < tr + r);
  const open = (x: number, z: number, gap: number) => inPark(x, z) && !water(x, z) && !inBld(x, z) && dPath(x, z) > gap && clear(x, z);
  const h = (x: number, z: number, k: number) => hash(x * 0.37 + z * 1.13 + k);
  const trees: number[] = [];
  const benches: number[] = [];
  const cafes: number[] = [];
  const tree = (x: number, z: number) => {
    const k = 0.7 + h(x, z, 1) * 0.6; // size
    const sp = Math.floor(h(x, z, 2) * 4); // "species": proportions of the one platane mesh
    const [sx, sy] = [[1, 1], [1.25, 0.8], [0.8, 1.3], [1.1, 1.1]][sp]!;
    pushBox(trees, x, ctx.height(x, z) - 0.2, z, h(x, z, 3) * Math.PI * 2, k * sx!, k * sy!, k * sx!);
    taken.push([x, z, 3]);
  };
  const st = s.buf('masonry');

  // hand-placed decor owned by this chunk
  for (const d of DECOR) if (d.x >= bd.minX && d.x < bd.maxX && d.z >= bd.minZ && d.z < bd.maxZ) d.build(s, ctx.height(d.x, d.z), cafes);

  // lawn tone patches: a few big flat discs per chunk in darker / lighter greens
  for (let k = 0; k < 12; k++) {
    const [x, z] = [bd.minX + h(bd.minX, k, 4) * 250, bd.minZ + h(bd.minZ, k, 5) * 250];
    if (!open(x, z, 4)) continue;
    st.color = rgb(LAWNS[k % LAWNS.length]!);
    disc(st, x, z, 5 + h(x, z, 6) * 8, ctx.height(x, z) + 0.015, 10);
  }

  // along the paths: tree rows, benches (+ bins), lamp posts, lake-shore railings / reeds / lily pads
  const plazas = new Set<string>();
  for (const r of paths) {
    let s0 = 0;
    for (let i = 0; i + 3 < r.pts.length; i += 2) {
      const [ax, az, bx, bz] = [r.pts[i]!, r.pts[i + 1]!, r.pts[i + 2]!, r.pts[i + 3]!];
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 0.5) continue;
      const [tx, tz] = [(bx - ax) / len, (bz - az) / len];
      for (let t = 0; t < len; t += 1) {
        const sAll = s0 + t;
        const [px, pz] = [ax + tx * t, az + tz * t];
        if (px < bd.minX || px >= bd.maxX || pz < bd.minZ || pz >= bd.maxZ) continue;
        const g = ctx.height(px, pz);
        const at = (side: number, off: number): [number, number] => [px + tz * side * off, pz - tx * side * off];
        const step = (m: number) => Math.floor(sAll / m) !== Math.floor((sAll - 1) / m); // once per m metres of arc length
        // shore: water within 9 m to one side → railing at the bank, reeds and lily pads in the water
        for (const side of [1, -1]) {
          const d = [3, 5, 7, 9].find((o) => water(...at(side, o)));
          if (d === undefined || !step(7)) continue;
          const [rx, rz] = at(side, d - 1.2);
          const f = frameAt(rx, rz, tx, tz);
          const iron = s.buf('metal');
          iron.color = rgb(IRON);
          fbox(iron, f, -3.5, 3.5, -0.03, 0.03, g + 0.95, g + 1.0);
          fbox(iron, f, -3.5, 3.5, -0.02, 0.02, g + 0.5, g + 0.53);
          for (const a of [-3.4, 0, 3.4]) fbox(iron, f, a - 0.04, a + 0.04, -0.04, 0.04, g, g + 1.0);
          if (h(rx, rz, 7) < 0.45) { // reed clump
            const [wx, wz] = at(side, d + 1.5);
            st.color = rgb('#5f8a3a');
            for (let k = 0; k < 6; k++) fbox(st, frameAt(wx + (hash(k + wx) - 0.5) * 1.6, wz + (hash(k * 3 + wz) - 0.5) * 1.6), -0.04, 0.04, -0.04, 0.04, -0.5, 0.9 + hash(k + wz) * 0.9);
          } else if (h(rx, rz, 8) < 0.5) { // lily pads
            st.color = rgb('#3f7a3f');
            for (let k = 0; k < 4; k++) disc(st, ...at(side, d + 2 + hash(k + rx) * 3), 0.35 + hash(k * 7 + rz) * 0.25, 0.12, 8);
          }
        }
        if (step(9)) { // tree rows: alternating sides, 3.4 m off the path
          const side = Math.floor(sAll / 9) % 2 ? 1 : -1;
          const [x, z] = at(side, 3.4);
          if (h(x, z, 9) < 0.6 && open(x, z, 2.6)) tree(x, z);
        }
        if (step(14)) { // benches facing the path, a bin beside one in three
          const side = Math.floor(sAll / 14) % 2 ? -1 : 1;
          const [x, z] = at(side, 1.7);
          if (h(x, z, 10) < 0.5 && open(x, z, 1.2)) {
            pushMatrix(benches, x, g + 0.02, z, Math.atan2(-tz * side, tx * side));
            taken.push([x, z, 1.5]);
            if (h(x, z, 11) < 0.33) {
              const [kx, kz] = at(side, 1.7);
              st.color = rgb('#3a4a3a');
              lathe(st, frameAt(kx + tx * 1.4, kz + tz * 1.4), 0, 0, [[0.22, g], [0.22, g + 0.8], [0.18, g + 0.85]], 6);
            }
          }
        }
        if (step(22)) { // the white double-globe lamp posts, 1.6 m off the path
          const side = Math.floor(sAll / 22) % 2 ? 1 : -1;
          const [x, z] = at(side, 1.6);
          if (h(x, z, 12) < 0.75 && open(x, z, 1.0)) {
            lampPost(s, x, z, g, Math.atan2(tz, tx));
            s.prism([ring(frameAt(x, z), 0, 0, 0.22, 0, 6).flatMap((p) => [p[0], p[2]])], g, g + 3.6);
            taken.push([x, z, 1.5]);
          }
        }
      }
      s0 += len;
    }
    // small plazas at path junctions (one in three): pave disc, a flowerbed or lantern in the middle, two benches
    for (const j of r.junctions) {
      const [x, z] = [r.pts[2 * j]!, r.pts[2 * j + 1]!];
      const key = `${Math.round(x)}_${Math.round(z)}`;
      if (plazas.has(key) || x < bd.minX || x >= bd.maxX || z < bd.minZ || z >= bd.maxZ) continue;
      plazas.add(key);
      if (h(x, z, 13) > 0.33 || !inPark(x, z) || water(x, z) || !clear(x, z, 6)) continue;
      const g = ctx.height(x, z);
      const pave = s.buf('pave');
      cap(pave, ring(frameAt(x, z), 0, 0, 6, g + 0.08, 16), UP);
      if (h(x, z, 14) < 0.6) flowerbed(s, x, z, g + 0.08, 1.3, FLOWERS[Math.floor(h(x, z, 15) * FLOWERS.length)]!);
      else stoneLantern(s, x, z, g + 0.08);
      for (const t of [0.25, 0.75]) {
        const a = (t + h(x, z, 16)) * Math.PI * 2;
        pushMatrix(benches, x + Math.cos(a) * 4.5, g + 0.1, z + Math.sin(a) * 4.5, Math.atan2(-Math.cos(a), -Math.sin(a)));
      }
      taken.push([x, z, 7]);
    }
  }

  // scattered lawn trees on a jittered 12 m grid
  for (let x = bd.minX + 6; x < bd.maxX; x += 12) {
    for (let z = bd.minZ + 6; z < bd.maxZ; z += 12) {
      const [jx, jz] = [x + (h(x, z, 17) - 0.5) * 9, z + (h(x, z, 18) - 0.5) * 9];
      if (h(jx, jz, 19) < 0.5 && open(jx, jz, 3.5)) tree(jx, jz);
    }
  }

  const out = s.out();
  const sets: [InstanceKind, number[]][] = [['tree', trees], ['bench', benches], ['cafe', cafes]];
  return { ...out, instances: sets.filter(([, m]) => m.length).map(([kind, matrices]) => ({ kind, matrices: new Float32Array(matrices) })) };
};
type InstanceKind = BuildOut['instances'][number]['kind'];

/** Code-only details over a world box, built by every chunk that overlaps it (index.ts buildLandmarks). */
export const placed: readonly { minX: number; maxX: number; minZ: number; maxZ: number; build: (chunk: ChunkData, ctx: BuildCtx) => BuildOut }[] = [
  { minX: GATE[0], maxX: GATE[0], minZ: GATE[1], maxZ: GATE[1], build: thongNhatGate },
  { ...PARK, build: thongNhatPark },
];

function pavilion(s: Sink, x: number, z: number, g: number) {
  const f = frameAt(x, z);
  const st = s.buf('masonry');
  st.color = rgb(STONE);
  lathe(st, f, 0, 0, [[4.2, g - 0.1], [4.2, g + 0.35]], 6); // hexagonal floor slab
  const col = s.buf('masonry');
  col.color = rgb(CREAM);
  for (let k = 0; k < 6; k++) lathe(col, f, 3.3 * Math.cos((k * Math.PI) / 3), 3.3 * Math.sin((k * Math.PI) / 3), [[0.25, g + 0.35], [0.25, g + 3.2]], 6);
  const roof = s.buf('masonry');
  roof.color = rgb(TILE);
  lathe(roof, f, 0, 0, [[4.6, g + 3.0], [2.4, g + 4.4], [0, g + 5.6]], 6); // two-pitch hexagonal tile roof
  cap(roof, ring(f, 0, 0, 4.5, g + 3.0, 6), DOWN); // underside
}

const thongNhat: DetailFn = (rec, _parts, ctx) => {
  const s = new Sink();
  const g = ctx.ground;
  const fp = rec.points?.find((p) => p.kind === 'fountain');
  if (fp) {
    pavilion(s, fp.x - 32, fp.z + 6, g);
    pavilion(s, fp.x + 32, fp.z + 6, g);
    const jet = s.buf('waterJet');
    const f = frameAt(fp.x, fp.z);
    lathe(jet, f, 0, 0, [[0.6, g - 0.3], [0.25, g + 2.6], [0.06, g + 4.6], [0, g + 5.2]], 8);
    for (let k = 0; k < 6; k++) lathe(jet, f, 3.5 * Math.cos((k * Math.PI) / 3), 3.5 * Math.sin((k * Math.PI) / 3), [[0.2, g - 0.3], [0.08, g + 1.4], [0, g + 1.9]], 6);
  }
  for (const p of rec.points ?? []) if (p.kind === 'artwork') monument(s, frameAt(p.x, p.z, 0, -1), g, p.sub === 'statue' ? 3.2 : 1.6, p.sub === 'statue' ? 4.5 : 2.2); // facing north
  return s.out();
};

// ── Đền Hai Bà Trưng (Đồng Nhân, relation/19179452: a 44 × 20 m compound with three inner holes): brick wall round the
// outline, a tam quan on the end that looks at hồ Đồng Nhân (east), side halls and the main hall at the back. ──
const LAKE_HBT: [number, number] = [370, 2190];

const denHaiBaTrung: DetailFn = (rec, _parts, ctx) => {
  const s = new Sink();
  const g = ctx.ground;
  const f0 = footprintFrame(rec.outer);
  const front = Math.hypot(f0.cx + f0.a * f0.ux - LAKE_HBT[0], f0.cz + f0.a * f0.uz - LAKE_HBT[1]) < Math.hypot(f0.cx - f0.a * f0.ux - LAKE_HBT[0], f0.cz - f0.a * f0.uz - LAKE_HBT[1]) ? 1 : -1;
  const f = front > 0 ? f0 : { ...f0, ux: -f0.ux, uz: -f0.uz }; // +a = towards the lake
  const { a, b } = f;
  const gateW = Math.min(2 * b - 2, 12);
  // perimeter wall on the outline, open at the gate
  const wb = s.buf('masonry');
  wb.color = rgb(BRICK);
  const o = rec.outer;
  const n = o.length / 2;
  for (let i = 0; i < n; i++) {
    const [ax, az, bx, bz] = [o[2 * i]!, o[2 * i + 1]!, o[2 * ((i + 1) % n)]!, o[2 * ((i + 1) % n) + 1]!];
    const mid = ((ax + bx) / 2 - f.cx) * f.ux + ((az + bz) / 2 - f.cz) * f.uz;
    const len = Math.hypot(bx - ax, bz - az);
    const gap = mid > a - 2 ? (gateW + 0.4) / 2 / len : 0; // the front edge: two stubs beside the gate
    const nn: V3 = [-(bz - az), 0, bx - ax];
    const seg = (t0: number, t1: number) => {
      const [x0, z0, x1, z1] = [ax + (bx - ax) * t0, az + (bz - az) * t0, ax + (bx - ax) * t1, az + (bz - az) * t1];
      for (const sg of [1, -1]) quadOut(wb, [x0, g, z0], [x1, g, z1], [x1, g + 2.1, z1], [x0, g + 2.1, z0], [nn[0] * sg, 0, nn[2] * sg]);
      quadOut(wb, [x0, g + 2.1, z0], [x1, g + 2.1, z1], [x1 + nn[0] * 0.001, g + 2.1, z1], [x0, g + 2.1, z0 + 0.001], UP);
    };
    if (!gap) seg(0, 1);
    else {
      seg(0, 0.5 - gap);
      seg(0.5 + gap, 1);
    }
  }
  const fg = frameAt(f.cx + (a - 2.2) * f.ux, f.cz + (a - 2.2) * f.uz, -f.uz, f.ux); // gate frame: a across the front
  gate3(s, fg, 0, 0, gateW, 4.2, g);
  hall(s, f, -a + 1.5, -a + 13.5, -b + 1.8, b - 1.8, g, 4.6, 3.2, 1.3); // main hall (hậu cung + tiền tế)
  for (let k = -1; k <= 1; k++) opening(s, f, k * 4 - 1.2, k * 4 + 1.2, -a + 13.5, g, g + 3.2, 1); // three doors on the courtyard face
  for (const sg of [-1, 1]) hall(s, f, -a + 15, a - 7, sg * (b - 1.8), sg * (b - 5.2), g, 3.4, 2.2, 1.0, OCHRE); // side halls (tả / hữu vu)
  const br = s.buf('bronze');
  lathe(br, f, 2, 0, [[0.9, g + 0.2], [0.7, g + 0.6], [0.95, g + 1.4], [0.8, g + 1.6]], 10); // incense urn in the courtyard
  s.prism([[P(f, -a + 1.5, 0, -b + 1.8), P(f, -a + 13.5, 0, -b + 1.8), P(f, -a + 13.5, 0, b - 1.8), P(f, -a + 1.5, 0, b - 1.8)].flatMap((p) => [p[0], p[2]])], g, g + 4.6);
  for (const sg of [-1, 1]) s.prism([[P(f, -a + 15, 0, sg * (b - 1.8)), P(f, a - 7, 0, sg * (b - 1.8)), P(f, a - 7, 0, sg * (b - 5.2)), P(f, -a + 15, 0, sg * (b - 5.2))].flatMap((p) => [p[0], p[2]])], g, g + 3.4);
  return s.out();
};

// ── Đại học Bách Khoa: nhà C10 / C10b (way/158465677, way/821304201: 4 levels), 1960s blocks in ochre stucco under a hipped
// tile roof, dark window bands, a two-storey portico on the face that looks at Quảng trường C1 (north); the Parabol gate
// (the concrete arch over the campus road off Giải Phóng, OSM service way/856290141 at z ≈ 2999) is drawn with C10. ──
const PORTICO: [number, number] = [-829, 2953]; // middle of C10's north face
const PARABOL: [number, number] = [-1086, 2998]; // arch centre; it spans the road north–south

const bachKhoa: DetailFn = (rec, _parts, ctx, h) => {
  const s = new Sink();
  const g = ctx.ground;
  tiledBody(rec, ctx, h, s, 12.8, 3.4, { colour: '#dcbf7a', roofColour: '#8d4b33' }); // 4 × 3.2 m + roof
  const band = s.buf('masonry');
  band.color = rgb(DARK);
  const o = rec.outer;
  const n = o.length / 2;
  const f = footprintFrame(o);
  for (let i = 0; i < n; i++) { // window bands per level, proud 4 cm
    const [ax, az, bx, bz] = [o[2 * i]!, o[2 * i + 1]!, o[2 * ((i + 1) % n)]!, o[2 * ((i + 1) % n) + 1]!];
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 6) continue;
    const [nx, nz] = [-(bz - az) / len, (bx - ax) / len];
    const sg = Math.sign(((ax + bx) / 2 - f.cx) * nx + ((az + bz) / 2 - f.cz) * nz) || 1; // outward side of the edge
    const [ox, oz] = [nx * sg * 0.04, nz * sg * 0.04];
    const in0 = 1.2 / len;
    for (let k = 0; k < 4; k++) {
      const [y0, y1] = [g + 1.1 + 3.2 * k, g + 2.7 + 3.2 * k];
      quadOut(band, [ax + (bx - ax) * in0 + ox, y0, az + (bz - az) * in0 + oz], [bx - (bx - ax) * in0 + ox, y0, bz - (bz - az) * in0 + oz], [bx - (bx - ax) * in0 + ox, y1, bz - (bz - az) * in0 + oz], [ax + (bx - ax) * in0 + ox, y1, az + (bz - az) * in0 + oz], [nx * sg, 0, nz * sg]);
    }
  }
  if (Math.hypot(f.cx - PORTICO[0], f.cz - PORTICO[1]) > 30) return s.out(); // C10b: no portico, no gate
  const st = s.buf('masonry');
  st.color = rgb(CREAM);
  const fp = frameAt(PORTICO[0], PORTICO[1] - 2.6); // 2.6 m north of the wall
  for (const a of [-15, -9, -3, 3, 9, 15]) fbox(st, fp, a - 0.45, a + 0.45, -0.45, 0.45, g, g + 10.2); // six pillars
  fbox(st, fp, -17, 17, -1.4, 2.8, g + 10.2, g + 11.3); // entablature back into the wall
  const ped: V3[] = [P(fp, -17, g + 11.3, -1.4), P(fp, 17, g + 11.3, -1.4), P(fp, 0, g + 14.2, -1.4)];
  triOut(st, ped[0]!, ped[1]!, ped[2]!, [0, 0, -1]); // pediment (front face only: the roof hides the back)
  quadOut(st, ped[0]!, ped[2]!, P(fp, 0, g + 14.2, 2.8), P(fp, -17, g + 11.3, 2.8), [-1, 1, 0]);
  quadOut(st, ped[1]!, ped[2]!, P(fp, 0, g + 14.2, 2.8), P(fp, 17, g + 11.3, 2.8), [1, 1, 0]);
  // Cổng Parabol: a parabolic concrete arch, 24 m span, 11 m high, 1 m × 0.6 m section, standing across the campus road
  const arch = s.buf('masonry');
  arch.color = rgb('#d8d2c4');
  const fa = frameAt(PARABOL[0], PARABOL[1], 0, 1); // a along the span (north–south), w = east–west (through the arch)
  const N = 16;
  const pt = (k: number, da: number, dw: number): V3 => {
    const t = -1 + (2 * k) / N;
    const a = 12 * t;
    const y = g + 11 * (1 - t * t);
    const [tx, ty] = [1, -2 * 11 * t / 12]; // tangent (da/dt, dy/dt)
    const l = Math.hypot(tx, ty);
    const [nx, ny] = [-ty / l, tx / l]; // normal in the (a, y) plane
    return P(fa, a + nx * da, y + ny * da, dw);
  };
  for (let k = 0; k < N; k++) {
    for (const [da, dw0, dw1] of [[0.5, -0.3, 0.3], [-0.5, 0.3, -0.3]] as const) { // outer and inner faces
      quadOut(arch, pt(k, da, dw0), pt(k + 1, da, dw0), pt(k + 1, da, dw1), pt(k, da, dw1), [0, da > 0 ? 1 : -1, 0]);
    }
    for (const dw of [-0.3, 0.3]) quadOut(arch, pt(k, -0.5, dw), pt(k + 1, -0.5, dw), pt(k + 1, 0.5, dw), pt(k, 0.5, dw), [-fa.uz * dw, 0, fa.ux * dw]); // sides
  }
  return s.out();
};

// ── Vincom Center Hà Nội (Bà Triệu, way/840204357 = one tower part from level 6 up). The 7-level mall block is the parent
// outline BuildingBuilder draws; the tower: 21 floors over it, ≈ 88 m total (Vincom City Towers, 2004; OSM levels 23), a
// stepped crown and a mast. ──
const vincomBaTrieu: DetailFn = (rec, _parts, ctx, h) => {
  const s = new Sink();
  const g = ctx.ground;
  const top = g + 88;
  h.renderPart({ ...rec, kind: 'yes', minHeight: 22.1, height: 88, material: 'glass', roofShape: 'flat', roofMaterial: 'concrete', roofColour: '#8d9298' }, { ground: g, height: ctx.height, fallbackTop: 88 }, s);
  const f = footprintFrame(rec.outer);
  const st = s.buf('masonry');
  st.color = rgb('#b9bcc0');
  fbox(st, f, -f.a * 0.7, f.a * 0.7, -f.b * 0.7, f.b * 0.7, top, top + 3.5); // stepped crown
  fbox(st, f, -f.a * 0.42, f.a * 0.42, -f.b * 0.42, f.b * 0.42, top + 3.5, top + 6.5);
  const mast = s.buf('metal');
  mast.color = rgb('#9aa0a6');
  lathe(mast, f, 0, 0, [[0.5, top + 6.5], [0.25, top + 18], [0, top + 19]], 6);
  const band = s.buf('metal');
  band.color = rgb('#2f3940');
  const o = rec.outer;
  const n = o.length / 2;
  const r = (y: number): V3[] => Array.from({ length: n }, (_, i) => [o[2 * i]! + (o[2 * i]! - f.cx) * 0.006, y, o[2 * i + 1]! + (o[2 * i + 1]! - f.cz) * 0.006]);
  for (const y of [top - 3, 22.4 + g]) { // dark bands: under the crown and where the tower meets the mall roof
    const lo = r(y);
    const hi = r(y + 2.4);
    for (let i = 0; i < n; i++) quadOut(band, lo[i]!, lo[(i + 1) % n]!, hi[(i + 1) % n]!, hi[i]!, [lo[i]![0] - f.cx, 0, lo[i]![2] - f.cz]);
  }
  return s.out();
};

export const details: Partial<Record<LandmarkId, DetailFn>> = {
  'cv-thong-nhat': thongNhat,
  'den-hai-ba-trung': denHaiBaTrung,
  dhbk: bachKhoa,
  'vincom-ba-trieu': vincomBaTrieu,
};
