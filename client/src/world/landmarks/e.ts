// Leg 3 landmark details, part 4: second pass over landmarks that only had the generic body or a small detail
// (Arcades columns, BOZAR as a real building). Wraps the b.ts functions.
import type { LandmarkId } from '../../geo/chunkData.ts';
import { buildBuildings } from '../BuildingBuilder.ts';
import type { ChunkData } from '../../geo/chunkData.ts';
import { fbox, rgb, withExtras } from './b.ts';
import { details as b } from './b.ts';
import { arch, body, facing, frontAt } from './c.ts';
import { town } from './d.ts';
import { lathe } from './c.ts';
import { quadOut } from './kit.ts';
import type { V3 } from '../geom.ts';
import { footprintFrame } from './kit.ts';
import type { DetailFn } from './index.ts';
import { Sink } from './parts.ts';

// Arcades du Cinquantenaire: pairs of columns between the three openings, on both faces
const arcades: DetailFn = (rec, parts, ctx, h) => {
  const base = b['arcades-cinquantenaire']!(rec, parts, ctx, h);
  const f = facing(rec, 270);
  const s = new Sink();
  const st = s.buf('masonry');
  st.color = rgb('#d6ccb2');
  const g = ctx.ground;
  for (const sign of [1, -1]) {
    const w = sign * (f.b + 0.9);
    for (const a of [-8, 8, -17.5, 17.5, -3.5, 3.5]) fbox(st, f, a - 0.55, a + 0.55, w - 0.55, w + 0.55, g, g + (Math.abs(a) < 10 ? 19 : 12));
  }
  return withExtras(base, s);
};

// BOZAR: drawn as a building (windows) with a low hipped terrace roof, plus a bronze-framed entrance canopy
const bozar: DetailFn = (rec, _parts, ctx) => {
  const chunk = { v: 2, key: ctx.key, buildings: [{ ...rec, landmark: undefined, parts: undefined, points: undefined, height: rec.height ?? 20 }], roads: [], bridges: [], areas: [], points: [], stairs: [], junctions: [] } as unknown as ChunkData;
  const out = buildBuildings(chunk, ctx);
  const f = facing(rec, 'origin');
  const s = new Sink();
  const m = s.buf('metal');
  m.color = rgb('#4a3f33');
  const aF = frontAt(rec, f, 0);
  fbox(m, f, aF - 0.2, aF + 3.5, -6, 6, ctx.ground + 5.2, ctx.ground + 5.5);
  return withExtras(out, s);
};

// Choco-Story Brussels: OSM has a 31-point museum polygon (courtyard of old Flemish brick buildings + the passage of the house at
// Rue de l'Étuve 41). Reference photos: inner yard = red brick with cream stone bands, 3 bays on the back wall (3 small top windows
// over "Chocolate Museum" in thin white letters, 3 tall black-framed windows, a glass ground floor with EXIT / ENTRANCE doors between
// brick piers on cream plinths), cobbles, stanchions with ropes, glass balustrade on the roof edge, a slate mansard on the right wall,
// drainpipe + lantern on the left wall; street front = a narrow white-rendered house with a grey-stone doorway, an iron lattice transom,
// the "Choco Story" sign board and a black-balconied window. Open-top ring of walls 12 m high (no roof, no collider: the yard stays
// walkable); the longest wall is the entrance (back) wall, the edges nearest Rue de l'Étuve carry the street façade.
// ponytail: the passage itself sits inside an ordinary OSM building (solid, BuildingBuilder), so the doorway is painted, not walkable.
type Glyph = [number, number, number, number][];
const GLYPHS: Record<string, Glyph> = { // strokes in a 1 × 1 box: x-height 0.6, caps 1
  C: [[0.9, 1, 0.1, 1], [0.1, 1, 0.1, 0], [0.1, 0, 0.9, 0]],
  S: [[0.8, 1, 0.1, 1], [0.1, 1, 0.1, 0.5], [0.1, 0.5, 0.8, 0.5], [0.8, 0.5, 0.8, 0], [0.8, 0, 0.1, 0]],
  M: [[0.1, 0, 0.1, 1], [0.1, 1, 0.5, 0.4], [0.5, 0.4, 0.9, 1], [0.9, 1, 0.9, 0]],
  h: [[0.1, 1, 0.1, 0], [0.1, 0.6, 0.8, 0.6], [0.8, 0.6, 0.8, 0]],
  o: [[0.1, 0.6, 0.8, 0.6], [0.8, 0.6, 0.8, 0], [0.8, 0, 0.1, 0], [0.1, 0, 0.1, 0.6]],
  c: [[0.8, 0.6, 0.1, 0.6], [0.1, 0.6, 0.1, 0], [0.1, 0, 0.8, 0]],
  l: [[0.3, 1, 0.3, 0]],
  a: [[0.1, 0.6, 0.8, 0.6], [0.8, 0.6, 0.8, 0], [0.8, 0, 0.1, 0], [0.1, 0, 0.1, 0.35], [0.1, 0.35, 0.8, 0.35]],
  t: [[0.4, 0.95, 0.4, 0], [0.1, 0.6, 0.7, 0.6]],
  e: [[0.1, 0.6, 0.8, 0.6], [0.8, 0.6, 0.8, 0.3], [0.8, 0.3, 0.1, 0.3], [0.1, 0.6, 0.1, 0], [0.1, 0, 0.8, 0]],
  u: [[0.1, 0.6, 0.1, 0], [0.1, 0, 0.8, 0], [0.8, 0.6, 0.8, 0]],
  s: [[0.8, 0.6, 0.1, 0.6], [0.1, 0.6, 0.1, 0.3], [0.1, 0.3, 0.8, 0.3], [0.8, 0.3, 0.8, 0], [0.8, 0, 0.1, 0]],
  m: [[0.1, 0.6, 0.1, 0], [0.1, 0.6, 0.9, 0.6], [0.5, 0.6, 0.5, 0], [0.9, 0.6, 0.9, 0]],
  r: [[0.1, 0.6, 0.1, 0], [0.1, 0.6, 0.7, 0.6]],
  y: [[0.1, 0.6, 0.1, 0.3], [0.1, 0.3, 0.8, 0.3], [0.8, 0.6, 0.8, -0.3], [0.8, -0.3, 0.1, -0.3]],
};
const ADV: Record<string, number> = { ' ': 0.5, l: 0.5, t: 0.7, r: 0.7, M: 1.05, m: 1.05, C: 0.95, S: 0.9 };
const textWidth = (text: string, k: number) => [...text].reduce((w, ch) => w + (ADV[ch] ?? 0.9) * k, 0);

const hash = (n: number) => {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
};

const chocoStory: DetailFn = (rec, _parts, ctx) => {
  const o = rec.outer;
  const n = o.length / 2;
  const g = ctx.minGround;
  const H = 12;
  const s = new Sink();
  const brick = s.buf('masonry');
  const stone = s.buf('masonry');
  const dark = s.buf('masonry');
  const glow = s.buf('masonry');
  const glass = s.buf('glass');
  const iron = s.buf('metal');
  const inside = (x: number, z: number) => {
    let r = false;
    for (let i = 0, j = o.length - 2; i < o.length; j = i, i += 2) {
      if (o[i + 1]! > z !== o[j + 1]! > z && x < ((o[j]! - o[i]!) * (z - o[i + 1]!)) / (o[j + 1]! - o[i + 1]!) + o[i]!) r = !r;
    }
    return r;
  };
  const pt = (i: number): [number, number] => [o[2 * (i % n)]!, o[2 * (i % n) + 1]!];
  const L = (i: number) => Math.hypot(pt(i + 1)[0] - pt(i)[0], pt(i + 1)[1] - pt(i)[1]);
  let longest = 0;
  for (let i = 0; i < n; i++) if (L(i) > L(longest)) longest = i;
  let leftWall = (longest + n - 1) % n; // the nearest wall ≥ 3 m before the back wall
  while (L(leftWall) < 3) leftWall = (leftWall + n - 1) % n;
  const STREET: [number, number] = [-156, 167.5]; // Rue de l'Étuve in front of no. 41
  const front = new Set<number>();
  for (let i = 0; i < n; i++) if (Math.hypot((pt(i)[0] + pt(i + 1)[0]) / 2 - STREET[0], (pt(i)[1] + pt(i + 1)[1]) / 2 - STREET[1]) < 6) front.add(i);
  /** Drawing on the plane of the wall from p along u (d = distance along the wall, y = height), pushed `off` metres along `out`. */
  const face = (p: [number, number], u: [number, number], out: V3) => {
    const at = (d: number, y: number, off: number): V3 => [p[0] + u[0] * d + out[0] * off, y, p[1] + u[1] * d + out[2] * off];
    const q = (buf: Parameters<typeof quadOut>[0], d0: number, d1: number, y0: number, y1: number, off: number) =>
      quadOut(buf, at(d0, y0, off), at(d1, y0, off), at(d1, y1, off), at(d0, y1, off), out);
    const seg = (buf: Parameters<typeof quadOut>[0], d0: number, y0: number, d1: number, y1: number, t: number, off: number) => {
      const l = Math.hypot(d1 - d0, y1 - y0) || 1;
      const [nd, ny] = [(-(y1 - y0) / l) * t * 0.5, ((d1 - d0) / l) * t * 0.5];
      const e = t * 0.5; // square the stroke ends so the corners meet
      const [ed, ey] = [((d1 - d0) / l) * e, ((y1 - y0) / l) * e];
      quadOut(buf, at(d0 - ed + nd, y0 - ey + ny, off), at(d1 + ed + nd, y1 + ey + ny, off), at(d1 + ed - nd, y1 + ey - ny, off), at(d0 - ed - nd, y0 - ey - ny, off), out);
    };
    /** Stroke text, cap height k metres, left edge at d, baseline y; italic skews the strokes. */
    const text = (buf: Parameters<typeof quadOut>[0], str: string, d: number, y: number, k: number, off: number, italic = 0) => {
      const flip = u[0] * out[2] - u[1] * out[0] < 0; // a viewer on the `out` side sees d running right-to-left: mirror the strokes
      const X = (x: number) => (flip ? 2 * d + textWidth(str, k) - x : x);
      let x = d;
      for (const ch of str) {
        for (const [x0, y0, x1, y1] of GLYPHS[ch] ?? []) seg(buf, X(x + (x0 + y0 * italic) * k), y + y0 * k, X(x + (x1 + y1 * italic) * k), y + y1 * k, k * 0.11, off);
        x += (ADV[ch] ?? 0.9) * k;
      }
    };
    return { q, seg, text };
  };
  const TONES = ['#a8563c', '#b4634a', '#9e4e38', '#bd7355', '#8f4a36'];
  const win = (f: ReturnType<typeof face>, c: number, hw: number, y0: number, y1: number, rows: number, cols: number) => {
    dark.color = rgb('#15191c'); // black painted frame
    f.q(dark, c - hw - 0.08, c + hw + 0.08, y0 - 0.08, y1 + 0.08, 0.07);
    glow.color = rgb('#3d4c58'); // blue-grey glass
    f.q(glow, c - hw, c + hw, y0, y1, 0.08);
    dark.color = rgb('#15191c'); // mullions
    for (let k = 1; k < cols; k++) f.q(dark, c - hw + (2 * hw * k) / cols - 0.03, c - hw + (2 * hw * k) / cols + 0.03, y0, y1, 0.09);
    for (let k = 1; k < rows; k++) f.q(dark, c - hw, c + hw, y0 + ((y1 - y0) * k) / rows - 0.03, y0 + ((y1 - y0) * k) / rows + 0.03, 0.09);
    stone.color = rgb('#d9cdb4');
    f.q(stone, c - hw - 0.25, c + hw + 0.25, y1 + 0.1, y1 + 0.32, 0.075); // lintel
    f.q(stone, c - hw - 0.2, c + hw + 0.2, y0 - 0.3, y0 - 0.08, 0.075); // sill
  };
  for (let i = 0; i < n; i++) {
    const a = pt(i);
    const b = pt(i + 1);
    const len = L(i);
    if (len < 0.5) continue;
    const u: [number, number] = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
    let nrm: V3 = [u[1], 0, -u[0]];
    if (inside((a[0] + b[0]) / 2 + nrm[0] * 0.4, (a[1] + b[1]) / 2 + nrm[2] * 0.4)) nrm = [-nrm[0], 0, -nrm[2]]; // outward
    if (front.has(i)) continue; // the street façade is drawn below, over the whole run of front edges
    for (const sg of [1, -1]) { // inner (courtyard) face gets the brick courses + details, the outer (street / neighbours) face stays plain
      const out: V3 = [nrm[0] * sg, 0, nrm[2] * sg];
      const f = face(a, u, out);
      const inner = sg === -1;
      const back = i === longest && inner;
      if (!inner || len < 3) {
        brick.color = rgb(TONES[i % TONES.length]!);
        f.q(brick, 0, len, g - 0.3, g + H, 0);
        if (len < 3) continue;
      } else {
        const C = 0.4; // one "course" band = several real brick courses, tone per band + a few contrasting patches
        for (let y = g - 0.3, k = 0; y < g + H; y += C, k++) {
          const hsh = hash(i * 31 + k);
          brick.color = rgb(TONES[Math.floor(hsh * TONES.length)]!);
          f.q(brick, 0, len, y, Math.min(y + C, g + H), 0);
          const d0 = hash(i * 7 + k * 3) * (len - 1.2);
          brick.color = rgb(TONES[(Math.floor(hsh * TONES.length) + 2) % TONES.length]!);
          f.q(brick, d0, d0 + 0.6 + hash(k) * 0.9, y + C * 0.45, Math.min(y + C, g + H), 0.01);
          dark.color = rgb('#7b4a3a'); // mortar shadow line
          f.q(dark, 0, len, y + C - 0.05, Math.min(y + C, g + H), 0.02);
        }
      }
      stone.color = rgb('#d9cdb4');
      for (const y of back ? [g + 3.9, g + 8.45, g + 9.75, g + H - 0.3] : [g + 3.9, g + 7.7, g + H - 0.3]) f.q(stone, 0, len, y, y + 0.28, 0.05); // cream bands
      for (let y = g; y < g + H - 0.5; y += 0.9) { // corner quoins, alternating lengths
        const l = y % 1.8 < 0.9 ? 0.55 : 0.35;
        f.q(stone, 0, l, y, y + 0.42, 0.06);
        f.q(stone, len - l, len, y, y + 0.42, 0.06);
      }
      const bays = back ? 3 : Math.max(1, Math.floor((len - 1) / 3.2));
      const pitch = len / bays;
      for (let k = 0; k < bays; k++) {
        const c = (k + 0.5) * pitch;
        if (back) {
          win(f, c, 0.95, g + 4.4, g + 8.2, 5, 3); // tall first-floor window, 3 × 5 panes
          win(f, c, 0.85, g + 10.0, g + 11.5, 1, 3); // small top window under the cream lintel
          dark.color = rgb('#15191c'); // glass ground-floor opening with the orange-lit interior
          f.q(dark, c - 1.5, c + 1.5, g, g + 3.4, 0.07);
          glow.color = rgb(k === 1 ? '#d08a52' : k === 0 ? '#e6a06a' : '#f0b27c');
          f.q(glow, c - 1.38, c + 1.38, g, g + 3.3, 0.08);
          if (k === 1) { // shop: a dark display counter line
            dark.color = rgb('#3a2418');
            f.q(dark, c - 1.3, c + 1.3, g + 0.9, g + 1.05, 0.09);
          } else {
            dark.color = rgb('#15191c');
            f.q(dark, c - 0.03, c + 0.03, g, g + 3.3, 0.09); // door leaf split
            stone.color = rgb('#ece6d6'); // EXIT / ENTRANCE plates
            f.q(stone, c - 0.45, c + 0.45, g + 3.5, g + 3.75, 0.1);
            dark.color = rgb('#1d2024');
            f.text(dark, k === 0 ? 'et' : 'etae', c - 0.3, g + 3.56, 0.14, 0.11); // tiny dark marks standing in for the words
          }
          stone.color = rgb('#d9cdb4'); // cream plinth blocks at the foot of the brick piers
          f.q(stone, c - pitch / 2, c - 1.5, g, g + 0.6, 0.06);
          f.q(stone, c + 1.5, c + pitch / 2, g, g + 0.6, 0.06);
        } else {
          win(f, c, 0.55, g + 4.3, g + 7.2, 4, 2);
          win(f, c, 0.55, g + 8.2, g + 11.0, 4, 2);
          if (len > 5) win(f, c, 0.6, g + 0.8, g + 3.2, 3, 2);
        }
      }
      if (back) {
        stone.color = rgb('#f7f3e8'); // "Chocolate Museum" in thin white letters between the two upper bands
        const k = 0.7;
        f.text(stone, 'Chocolate Museum', len / 2 - textWidth('Chocolate Museum', k) / 2, g + 8.85, k, 0.1);
        glass.color = rgb('#9fb5c0'); // glass balustrade on the roof edge, steel posts
        for (let d = 0.3; d < len; d += 2.4) f.q(iron, d - 0.04, d + 0.04, g + H, g + H + 1.1, 0.02);
        f.q(glass, 0.2, len - 0.2, g + H + 0.05, g + H + 1.0, 0.0);
        iron.color = rgb('#9a9ea2');
        f.q(iron, 0, len, g + H + 1.0, g + H + 1.1, 0.03);
      }
      if (inner && i === (longest + 1) % n) { // the right wall: slate mansard leaning back from the top edge
        const slate = s.buf('masonry');
        slate.color = rgb('#454b52');
        const lean: V3 = [-out[0] * 1.6, 0, -out[2] * 1.6];
        quadOut(slate, [a[0], g + H, a[1]], [b[0], g + H, b[1]], [b[0] + lean[0], g + H + 2.6, b[1] + lean[2]], [a[0] + lean[0], g + H + 2.6, a[1] + lean[2]], [out[0], 0.6, out[2]]);
        stone.color = rgb('#c9bfa6');
        f.q(stone, 0, len, g + H - 0.05, g + H + 0.25, 0.12); // eaves course
      }
      if (inner && i === leftWall) { // the left wall: grey drainpipe and a black wall lantern
        iron.color = rgb('#6b6e70');
        f.q(iron, 0.5, 0.62, g, g + H - 0.2, 0.12);
        iron.color = rgb('#1a1c1e');
        const c = Math.min(len - 1, 3);
        f.q(iron, c - 0.02, c + 0.02, g + 3.4, g + 4.0, 0.12); // bracket stem
        f.q(iron, c - 0.4, c + 0.4, g + 3.95, g + 4.0, 0.3);
        glow.color = rgb('#f3d79a');
        f.q(glow, c - 0.22, c + 0.22, g + 3.35, g + 3.8, 0.55); // lantern body (lit pane)
        f.q(iron, c - 0.28, c + 0.28, g + 3.8, g + 3.9, 0.55);
      }
    }
  }
  // ── street façade (Rue de l'Étuve 41): white render over the run of front edges, stone doorway, lattice transom, sign, balcony ──
  if (front.size) {
    const ids = [...front].sort((x, y) => x - y);
    const a = pt(ids[0]!);
    const b = pt(ids.at(-1)! + 1);
    const W = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const u: [number, number] = [(b[0] - a[0]) / W, (b[1] - a[1]) / W];
    let out: V3 = [u[1], 0, -u[0]];
    if (inside((a[0] + b[0]) / 2 + out[0] * 0.4, (a[1] + b[1]) / 2 + out[2] * 0.4)) out = [-out[0], 0, -out[2]];
    const f = face(a, u, out);
    const FH = 13.5;
    const white = s.buf('masonry');
    white.color = rgb('#ebe6da');
    f.q(white, 0, W, g - 0.3, g + FH, 0.12);
    stone.color = rgb('#8d8a84'); // grey natural-stone plinth + doorway jambs / lintel
    f.q(stone, 0, W, g - 0.3, g + 1.0, 0.14);
    const [d0, d1] = [0.45, W - 0.45];
    f.q(stone, 0, d0, g, g + 5.0, 0.15);
    f.q(stone, d1, W, g, g + 5.0, 0.15);
    stone.color = rgb('#2b2a28');
    f.q(stone, 0, W, g + 5.0, g + 5.4, 0.15); // dark lintel band
    dark.color = rgb('#2a1c16'); // the passage: dark brick seen through the opening
    f.q(dark, d0, d1, g, g + 5.0, 0.13);
    glow.color = rgb('#d9a765');
    f.q(glow, (d0 + d1) / 2 - 0.15, (d0 + d1) / 2 + 0.15, g + 2.6, g + 2.95, 0.14); // lantern glow inside
    for (let k = 0; k < 2; k++) { // two posters on the passage walls
      glow.color = rgb(k ? '#b9733d' : '#6f4a30');
      f.q(glow, d0 + 0.2 + k * (d1 - d0 - 1.0), d0 + 0.8 + k * (d1 - d0 - 1.0), g + 1.4, g + 2.3, 0.14);
    }
    iron.color = rgb('#1b1d1f'); // iron transom grille with a diagonal lattice, two panes
    f.q(iron, d0, d1, g + 3.6, g + 3.68, 0.16);
    f.q(iron, (d0 + d1) / 2 - 0.04, (d0 + d1) / 2 + 0.04, g + 3.6, g + 5.0, 0.16);
    for (const [p0, p1] of [[d0, (d0 + d1) / 2], [(d0 + d1) / 2, d1]]) {
      for (let x = p0 - 1.4; x < p1; x += 0.5) {
        const [x0, x1] = [Math.max(p0, x), Math.min(p1, x + 1.4)];
        if (x1 > x0) f.seg(iron, x0, g + 3.68 + (x0 - x), x1, g + 3.68 + (x1 - x), 0.05, 0.16);
      }
      for (let x = p0; x < p1 + 1.4; x += 0.5) {
        const [x0, x1] = [Math.max(p0, x - 1.4), Math.min(p1, x)];
        if (x1 > x0) f.seg(iron, x0, g + 3.68 + (x - x0), x1, g + 3.68 + (x - x1), 0.05, 0.16);
      }
    }
    white.color = rgb('#f4f1ea'); // projecting cornice, sign board with its own thin cornice, "Choco Story" in dark-brown italic
    f.q(white, -0.1, W + 0.1, g + 5.4, g + 5.7, 0.3);
    f.q(white, 0.1, W - 0.1, g + 5.7, g + 7.5, 0.2);
    f.q(white, 0.05, W - 0.05, g + 7.5, g + 7.62, 0.28);
    const k = Math.min(0.9, (W - 0.5) / textWidth('Choco Story', 1));
    dark.color = rgb('#4a2a16');
    f.text(dark, 'Choco Story', W / 2 - textWidth('Choco Story', k) / 2, g + 6.0, k, 0.22, 0.2);
    for (const y of [g + 8.0, g + 11.2]) { // upper floors: tall black-framed window, stone sill, small black balcony railing
      const c = W / 2;
      win(f, c, 0.7, y, y + 2.5, 3, 2);
      iron.color = rgb('#1b1d1f');
      for (let d = c - 0.8; d <= c + 0.8; d += 0.2) f.q(iron, d - 0.015, d + 0.015, y, y + 0.9, 0.42);
      f.q(iron, c - 0.85, c + 0.85, y + 0.88, y + 0.93, 0.44);
      f.q(iron, c - 0.85, c + 0.85, y - 0.02, y + 0.03, 0.44);
    }
    iron.color = rgb('#8a8c8e'); // grey drainpipe on the right
    f.q(iron, W - 0.3, W - 0.18, g + 1.0, g + FH, 0.2);
  }
  // ── cobbled yard: a floor patch over the polygon, plus the queue lane (stanchions + ropes) in front of the back wall ──
  const cob = s.buf('masonry');
  const COB = ['#5a544d', '#544e48', '#5f5952', '#4f4944'];
  const [x0, x1, z0, z1] = o.reduce((r, v, k) => (k % 2 ? [r[0], r[1], Math.min(r[2], v), Math.max(r[3], v)] : [Math.min(r[0], v), Math.max(r[1], v), r[2], r[3]]), [Infinity, -Infinity, Infinity, -Infinity]);
  const CELL = 1.5; // ponytail: cells that follow the terrain (minGround is up to 1 m below the yard); edge cells stop at the wall line
  const yAt = (x: number, z: number) => ctx.height(x, z) + 0.08;
  for (let x = x0; x < x1; x += CELL) {
    for (let z = z0; z < z1; z += CELL) {
      if (!inside(x + CELL / 2, z + CELL / 2)) continue;
      cob.color = rgb(COB[Math.floor(hash(x * 3.7 + z * 1.3) * COB.length)]!);
      quadOut(cob, [x, yAt(x, z), z], [x + CELL, yAt(x + CELL, z), z], [x + CELL, yAt(x + CELL, z + CELL), z + CELL], [x, yAt(x, z + CELL), z + CELL], [0, 1, 0]);
    }
  }
  const post = s.buf('metal');
  post.color = rgb('#202224');
  const [ax, az] = pt(longest);
  const [bx, bz] = pt(longest + 1);
  const ll = L(longest);
  const uu: [number, number] = [(bx - ax) / ll, (bz - az) / ll];
  let nn: [number, number] = [uu[1], -uu[0]];
  if (!inside((ax + bx) / 2 + nn[0] * 0.4, (az + bz) / 2 + nn[1] * 0.4)) nn = [-nn[0], -nn[1]]; // now pointing into the yard
  const fr = { cx: ax + nn[0] * 4, cz: az + nn[1] * 4, ux: uu[0], uz: uu[1], a: ll, b: 4, area: 0 }; // frame along the wall, 4 m into the yard
  const rope = s.buf('masonry');
  rope.color = rgb('#8a1f1f');
  const ds = [0, 1, 2, 3].map((k) => ll * 0.3 + (k * (ll * 0.4)) / 3);
  for (const [k, d] of ds.entries()) {
    lathe(post, fr, d, 0, [[0.16, g + 0.08], [0.05, g + 0.14], [0.05, g + 0.95], [0.09, g + 1.0]], 6);
    if (k < 3) { // sagging rope in 3 pieces to the next post
      const e = ds[k + 1]!;
      for (let q = 0; q < 3; q++) {
        const [t0, t1] = [q / 3, (q + 1) / 3];
        const y = g + 0.95 - 0.18 * Math.sin(Math.PI * (t0 + t1) / 2);
        fbox(rope, fr, d + (e - d) * t0, d + (e - d) * t1, -0.03, 0.03, y - 0.03, y + 0.03);
      }
    }
  }
  return s.out();
};

// Belgian Comic Strip Center (Horta's Magasin Waucquez, 1906): cream stone, 8 bays of stone pilasters, ground-floor arched iron-barred
// windows + a central doorway, tall arched upper windows with red-brown frames under stone hoods, projecting cornice with finials.
// Front (Rue des Sables) taken as the south side; each bay follows the outline (frontAt) because the street front is slightly curved.
const comicCenter: DetailFn = (rec, _parts, ctx, h) => {
  const f = facing(rec, 180);
  const s = new Sink();
  const g = ctx.ground;
  const H = 15;
  body(rec, ctx, h, s, { height: H, roofShape: 'flat', colour: '#d4cab4', levels: undefined, material: undefined });
  const W = Math.min(f.b - 1.5, 17);
  const n = 8;
  const bw = (2 * W) / n;
  const stone = s.buf('masonry');
  const hood = s.buf('masonry');
  const frame = s.buf('masonry');
  const glass = s.buf('masonry');
  const iron = s.buf('masonry');
  const aAt = (w: number) => frontAt(rec, f, w);
  for (let k = 0; k <= n; k++) { // pilasters (and the two end piers)
    const w = -W + k * bw;
    const a = aAt(Math.max(-W, Math.min(W, w)));
    stone.color = rgb('#cdc3ab');
    fbox(stone, f, a - 0.1, a + 0.4, w - 0.4, w + 0.4, g, g + H);
  }
  for (let k = 0; k < n; k++) {
    const wc = -W + (k + 0.5) * bw;
    const a = aAt(wc);
    const hw = bw * 0.33;
    stone.color = rgb('#c4b9a0'); // string course between the floors + plinth
    fbox(stone, f, a - 0.1, a + 0.3, wc - bw / 2, wc + bw / 2, g + 5.4, g + 6.0);
    fbox(stone, f, a - 0.1, a + 0.25, wc - bw / 2, wc + bw / 2, g, g + 0.9);
    hood.color = rgb('#b3a78c'); // stone hood over the upper window
    arch(hood, f, a + 0.12, wc - hw - 0.35, wc + hw + 0.35, g + 6.4, g + 10.8, g + 12.6, false);
    frame.color = rgb('#5b2f22'); // red-brown window frame
    arch(frame, f, a + 0.16, wc - hw - 0.1, wc + hw + 0.1, g + 6.7, g + 10.8, g + 12.3, false);
    glass.color = rgb('#23323d');
    arch(glass, f, a + 0.2, wc - hw, wc + hw, g + 6.8, g + 10.8, g + 12.2, false);
    iron.color = rgb('#2a2622'); // mullions: a cross of thin bars
    fbox(iron, f, a + 0.2, a + 0.26, wc - 0.05, wc + 0.05, g + 6.8, g + 12.1);
    fbox(iron, f, a + 0.2, a + 0.26, wc - hw, wc + hw, g + 9.2, g + 9.3);
    if (k === 5) { // the doorway: tall dark arch with a wrought-iron fanlight
      arch(iron, f, a + 0.2, wc - hw, wc + hw, g + 0.9, g + 3.6, g + 5.0, false);
      iron.color = rgb('#6b5a3a');
      fbox(iron, f, a + 0.2, a + 0.3, wc - 0.05, wc + 0.05, g + 0.9, g + 3.6);
    } else { // iron-barred arched shop window
      arch(iron, f, a + 0.2, wc - hw, wc + hw, g + 1.2, g + 3.6, g + 4.8, false);
      glass.color = rgb('#6d5f48');
      for (let q = -2; q <= 2; q++) fbox(glass, f, a + 0.22, a + 0.27, wc + q * hw * 0.4 - 0.03, wc + q * hw * 0.4 + 0.03, g + 1.2, g + 4.0);
    }
    if (k % 2 === 0) { // little finials on the cornice
      stone.color = rgb('#c9bfa6');
      fbox(stone, f, a - 0.1, a + 0.6, wc - 0.45, wc + 0.45, g + H + 0.9, g + H + 2.0);
    }
    stone.color = rgb('#c9bfa6'); // projecting cornice
    fbox(stone, f, a - 0.2, a + 0.9, wc - bw / 2, wc + bw / 2, g + H - 0.6, g + H + 0.9);
  }
  return s.out();
};

// Maison Antoine, the Place Jourdan chip stand: a kiosk with a giant paper cone of golden fries on the roof
const maisonAntoine: DetailFn = (rec, _parts, ctx) => {
  const base = town(rec, ctx, { height: 4.5, levels: undefined });
  const f = footprintFrame(rec.outer);
  const top = ctx.ground + 4.5;
  const s = new Sink();
  const cone = s.buf('masonry');
  cone.color = rgb('#d62a2a');
  lathe(cone, f, 0, 0, [[0.2, top + 0.6], [0.9, top + 2.8], [1.0, top + 3.0]], 8);
  const wh = s.buf('masonry');
  wh.color = rgb('#f4f1e6');
  lathe(wh, f, 0, 0, [[0.55, top + 1.7], [0.8, top + 2.4], [0.8, top + 2.6], [0.55, top + 1.9]], 8);
  const fr = s.buf('gold');
  for (let k = 0; k < 7; k++) fbox(fr, f, -0.7 + 0.22 * k - 0.07, -0.7 + 0.22 * k + 0.07, -0.07, 0.07, top + 3.0, top + 3.8 + ((k * 5) % 3) * 0.3);
  return withExtras(base, s);
};

export const details: Partial<Record<LandmarkId, DetailFn>> = {
  'arcades-cinquantenaire': arcades,
  bozar,
  'choco-story': chocoStory,
  'belgian-comic-strip-center': comicCenter,
  'maison-antoine': maisonAntoine,
};
