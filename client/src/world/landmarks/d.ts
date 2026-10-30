// Leg 3 landmark details, part 3: Grand-Place guild houses, Manneken Pis, Galeries Royales Saint-Hubert, Parlement européen,
// Colonne du Congrès. Houses / galleries / parliament are ordinary OSM buildings that the registry tags as landmarks, so they are
// still drawn by BuildingBuilder (windows, shop fronts, curtain walls) through a one-building chunk, then dressed here.
// Details are never solid (SPEC §5.9); colliders come from the body only.
import type { BuildingRec, ChunkData, LandmarkId } from '../../geo/chunkData.ts';
import { buildBuildings, buildingHeight } from '../BuildingBuilder.ts';
import type { BuildOut } from '../buildTypes.ts';
import type { V3 } from '../geom.ts';
import { cap, fbox, type Fr, P, rgb, ring, spire, UP, withExtras } from './b.ts';
import type { DetailFn, LandmarkCtx } from './index.ts';
import { footprintFrame, loft, quadOut, triOut } from './kit.ts';
import { Sink } from './parts.ts';

type Buf = Parameters<typeof loft>[0];

/** The record drawn as an ordinary building (what BuildingBuilder would have done without the landmark tag). */
export function town(rec: BuildingRec, ctx: LandmarkCtx, over: Partial<BuildingRec> = {}): BuildOut {
  const { landmark: _l, parts: _p, points: _q, ...plain } = rec;
  const chunk = { v: 2, key: ctx.key, buildings: [{ ...plain, ...over }], roads: [], bridges: [], areas: [], points: [], stairs: [], junctions: [] } as unknown as ChunkData;
  return buildBuildings(chunk, ctx);
}
/** Solid prism (square of half side hs around the frame centre) for a collider. */
const solid = (s: Sink, f: Fr, hs: number, y0: number, y1: number) =>
  s.prism([[P(f, -hs, 0, -hs), P(f, hs, 0, -hs), P(f, hs, 0, hs), P(f, -hs, 0, hs)].flatMap((p) => [p[0], p[2]])], y0, y1);
const join = (base: BuildOut, s: Sink): BuildOut => withExtras(base, s);

/** Lathe of n-gon rings [r, y] at (a, w); a last r = 0 closes with a spire. */
export function lathe(buf: Buf, f: Fr, a: number, w: number, prof: [number, number][], n = 8) {
  const rs = prof.filter(([r]) => r > 0.02).map(([r, y]) => ring(f, a, w, r, y, n));
  if (rs.length > 1) loft(buf, rs, 4);
  const last = prof.at(-1)!;
  if (last[0] <= 0.02) spire(buf, rs.at(-1)!, P(f, a, last[1], w));
  else cap(buf, rs.at(-1)!, UP);
}

export const hash = (n: number) => {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
};

// ── Grand-Place: stepped gable with gilded caps, volutes and a finial on the façade that looks at the square ──

const SQUARE: [number, number] = [5.5, 2.5]; // centre of way/3517898

const guildHouse: DetailFn = (rec, _parts, ctx) => {
  const base = town(rec, ctx);
  const o = rec.outer;
  const n = o.length / 2;
  // front edge = the (≥ 4 m) edge whose middle is nearest to the square's centre
  let best = { d: Infinity, i: 0 };
  for (let i = 0; i < n; i++) {
    const [ax, az, bx, bz] = [o[2 * i]!, o[2 * i + 1]!, o[2 * ((i + 1) % n)]!, o[2 * ((i + 1) % n) + 1]!];
    if (Math.hypot(bx - ax, bz - az) < 4) continue;
    const d = Math.hypot((ax + bx) / 2 - SQUARE[0], (az + bz) / 2 - SQUARE[1]);
    if (d < best.d) best = { d, i };
  }
  if (!Number.isFinite(best.d)) return base;
  const [ax, az, bx, bz] = [o[2 * best.i]!, o[2 * best.i + 1]!, o[2 * ((best.i + 1) % n)]!, o[2 * ((best.i + 1) % n) + 1]!];
  const len = Math.hypot(bx - ax, bz - az);
  let [ux, uz] = [(bx - ax) / len, (bz - az) / len];
  const [mx, mz] = [(ax + bx) / 2, (az + bz) / 2];
  if (-uz * (SQUARE[0] - mx) + ux * (SQUARE[1] - mz) < 0) [ux, uz] = [-ux, -uz]; // w axis (−uz, ux) points at the square
  const f = { cx: mx, cz: mz, ux, uz, a: len / 2, b: 1, area: 0 } as Fr;
  const top = ctx.ground + buildingHeight(rec);
  const seed = hash(o[0]! * 3.1 + o[1]!);
  const s = new Sink();
  const stone = s.buf('masonry');
  const gold = s.buf('gold');
  const tones = ['#d8cdb4', '#cbbfa5', '#e0d6c0', '#c9c2b4'];
  stone.color = rgb(tones[Math.floor(seed * tones.length)]!);
  const hw = Math.min(len / 2, 5) - 0.3;
  const steps = 3 + Math.floor(seed * 2);
  const rise = 0.9 + seed * 0.3;
  const [w0, w1] = [-0.9, -0.15]; // behind the wall line, so it never pokes into the street
  let y = top;
  for (let k = 0; k < steps; k++) {
    const half = hw * (1 - (k * 0.8) / steps);
    fbox(stone, f, -half, half, w0, w1, y - 0.2, y + rise);
    fbox(gold, f, -half - 0.06, half + 0.06, w0 - 0.04, w1 + 0.04, y + rise, y + rise + 0.12); // gilded cap on every step
    y += rise;
  }
  lathe(gold, f, 0, (w0 + w1) / 2, [[0.45, y + 0.25], [0.3, y + 1.2], [0.5, y + 1.8], [0.15, y + 2.6], [0, y + 3.4]], 6); // finial
  for (const sg of [-1, 1]) { // volutes: a gilded block either side of the lowest step
    fbox(gold, f, sg * (hw + 0.2) - 0.35, sg * (hw + 0.2) + 0.35, w0 - 0.05, w1 + 0.05, top, top + 1.4);
  }
  return join(base, s);
};

// ── Manneken Pis (rebuilt after a frontal photo, 2026-10-26): a cream limestone backing wall flush against the house in the
// notch between Rue de l'Étuve and Rue du Chêne, a scallop-shell niche with pilasters + disc entablature + moulded arch rim,
// the bronze boy (≈ 0.55 m) on a round pedestal over a ribbed lead tulip bowl, a mascaron and a satyr face spouting water
// down into the low lead basin, stone volutes either side, a curved wrought-iron railing in front. Everything faces WEST
// (−X): the real niche looks at the street corner. Sizes read off the photo with the statue (0.55 m) as the scale. ──

/** n points around (a, w) at height y, radius r modulated by k ribs of amplitude amp (petals / scallop flutes). */
export const rring = (f: Fr, a: number, w: number, r: number, y: number, n: number, amp = 0, k = 0): V3[] =>
  Array.from({ length: n }, (_, i) => {
    const t = (2 * Math.PI * i) / n;
    const rr = r * (1 + amp * Math.cos(k * t));
    return P(f, a + rr * Math.cos(t), y, w + rr * Math.sin(t));
  });
/** Lathe of ribbed rings (see rring), capped on top. */
export function rlathe(buf: Buf, f: Fr, a: number, w: number, prof: [number, number][], n: number, amp = 0, k = 0) {
  const rs = prof.map(([r, y]) => rring(f, a, w, r, y, n, amp, k));
  loft(buf, rs, 4);
  cap(buf, rs.at(-1)!, UP);
}
/** Horizontal cylinder along w (axis at (a, y)), w0 → w1: a disc / knob / scroll seen face-on from the street. */
export function hcyl(buf: Buf, f: Fr, a: number, y: number, r: number, w0: number, w1: number, n = 10) {
  const pt = (i: number, w: number): V3 => P(f, a + r * Math.cos((2 * Math.PI * i) / n), y + r * Math.sin((2 * Math.PI * i) / n), w);
  for (let i = 0; i < n; i++) {
    const [p0, p1] = [pt(i, w0), pt(i + 1, w0)];
    const mid: V3 = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, (p0[2] + p1[2]) / 2];
    const ax = P(f, a, y, w0);
    quadOut(buf, p0, p1, pt(i + 1, w1), pt(i, w1), [mid[0] - ax[0], mid[1] - ax[1], mid[2] - ax[2]]);
    triOut(buf, P(f, a, y, w1), pt(i, w1), pt(i + 1, w1), [-f.uz, 0, f.ux]);
  }
}
/** Thin square bar (side t) from p to q, any direction (railing rails and scrolls). */
export function bar(buf: Buf, p: V3, q: V3, t: number) {
  const d: V3 = [q[0] - p[0], q[1] - p[1], q[2] - p[2]];
  const l = Math.hypot(...d) || 1;
  const u: V3 = Math.abs(d[1]) / l > 0.9 ? [1, 0, 0] : [0, 1, 0];
  const n1 = ((): V3 => { const c: V3 = [d[1] * u[2] - d[2] * u[1], d[2] * u[0] - d[0] * u[2], d[0] * u[1] - d[1] * u[0]]; const m = Math.hypot(...c) || 1; return [c[0] / m * t / 2, c[1] / m * t / 2, c[2] / m * t / 2]; })();
  const n2: V3 = [(d[1] * n1[2] - d[2] * n1[1]) / l, (d[2] * n1[0] - d[0] * n1[2]) / l, (d[0] * n1[1] - d[1] * n1[0]) / l];
  const corner = (b: V3, s1: number, s2: number): V3 => [b[0] + s1 * n1[0] + s2 * n2[0], b[1] + s1 * n1[1] + s2 * n2[1], b[2] + s1 * n1[2] + s2 * n2[2]];
  const S: [number, number][] = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
  for (let i = 0; i < 4; i++) {
    const [s, e] = [S[i]!, S[(i + 1) % 4]!];
    const out: V3 = [(s[0] + e[0]) * n1[0] + (s[1] + e[1]) * n2[0], (s[0] + e[0]) * n1[1] + (s[1] + e[1]) * n2[1], (s[0] + e[0]) * n1[2] + (s[1] + e[1]) * n2[2]];
    quadOut(buf, corner(p, ...s), corner(p, ...e), corner(q, ...e), corner(q, ...s), out);
  }
}

const mannekenPis: DetailFn = (rec, _parts, ctx) => {
  const o = rec.outer;
  let [mx, zs] = [-Infinity, 0];
  for (let i = 0; i < o.length; i += 2) { mx = Math.max(mx, o[i]!); zs += o[i + 1]!; }
  // frame: a along the house wall (+Z, south), w towards the street (−X, west); cx = the house wall line (0.5 m behind the OSM basin)
  const f = { cx: mx + 0.5, cz: zs / (o.length / 2), ux: 0, uz: 1, a: 1, b: 1, area: 0 } as Fr;
  const g = ctx.minGround;
  const s = new Sink();
  const st = s.buf('masonry');
  const near = s.buf('masonry', 'near');
  // backing wall: 0.9 m slab (mortar tone) + limestone blocks in several cream tones, skipped where the niche opens
  st.color = rgb('#bfb496');
  fbox(st, f, -2.0, 2.0, 0, 0.9, g - 0.3, g + 8);
  const tones = ['#e6ddc4', '#d9cfae', '#d0c39b', '#ebe3cd', '#cdc4a4', '#e0d5b8'];
  for (let row = 0, y = g - 0.3; y < g + 8; row++, y += 0.34) {
    const y1 = Math.min(y + 0.32, g + 8);
    for (let a0 = -2.0 - (row % 2) * 0.34, k = 0; a0 < 2.0; a0 += 0.68, k++) {
      const [b0, b1] = [Math.max(a0, -2.0), Math.min(a0 + 0.66, 2.0)];
      if (b1 - b0 < 0.1 || (b1 > -0.8 && b0 < 0.8 && y1 > g + 1.95 && y < g + 3.85)) continue;
      near.color = rgb(tones[Math.floor(hash(row * 7.3 + k * 1.7 + f.cx) * tones.length)]!);
      fbox(near, f, b0, b1, 0.9, 0.93, y, y1);
    }
  }
  // niche: half-cylinder recess + ribbed scallop quarter-dome (14 flutes), normals inward; arch rim, pilasters, entablature
  const [R, yc, yf, W] = [0.55, g + 3.05, g + 2.45, 0.9];
  const C = P(f, 0, yc, W);
  const inw = (p: V3): V3 => [C[0] - p[0], 0, C[2] - p[2]];
  const n = 28;
  const half = (y: number, phi: number) => Array.from({ length: n + 1 }, (_, i): V3 => {
    const t = (Math.PI * i) / n;
    const rr = R * (1 + 0.08 * Math.cos(14 * t) * Math.sin(phi)) * Math.cos(phi);
    return P(f, rr * Math.cos(t), y + R * Math.sin(phi), W - rr * Math.sin(t));
  });
  st.color = rgb('#efe7d2');
  const lo = half(yf, 0), hi = half(yc, 0);
  for (let i = 0; i < n; i++) quadOut(st, lo[i]!, lo[i + 1]!, hi[i + 1]!, hi[i]!, inw(lo[i]!));
  const m = 6;
  for (let j = 0; j < m; j++) {
    const [r0, r1] = [half(yc, (Math.PI / 2) * (j / m)), half(yc, (Math.PI / 2) * ((j + 1) / m))];
    for (let i = 0; i < n; i++) {
      const out: V3 = [C[0] - r0[i]![0], C[1] - r0[i]![1], C[2] - r0[i]![2]];
      if (j + 1 < m) quadOut(st, r0[i]!, r0[i + 1]!, r1[i + 1]!, r1[i]!, out);
      else triOut(st, r0[i]!, r0[i + 1]!, P(f, 0, yc + R, W), out);
    }
  }
  st.color = rgb('#d6cbae');
  const [r2, wf] = [0.74, 1.12];
  for (let i = 0; i < 20; i++) { // moulded rim: front annulus + outer band + inner reveal
    const [t0, t1] = [(Math.PI * i) / 20, (Math.PI * (i + 1)) / 20];
    const at = (r: number, t: number, w: number) => P(f, r * Math.cos(t), yc + r * Math.sin(t), w);
    quadOut(st, at(R, t0, wf), at(R, t1, wf), at(r2, t1, wf), at(r2, t0, wf), [-f.uz, 0, f.ux]);
    const mid = at(r2, (t0 + t1) / 2, W);
    quadOut(st, at(r2, t0, W), at(r2, t1, W), at(r2, t1, wf), at(r2, t0, wf), [mid[0] - C[0], mid[1] - C[1], mid[2] - C[2]]);
    quadOut(st, at(R, t0, W), at(R, t1, W), at(R, t1, wf), at(R, t0, wf), inw(at(R, (t0 + t1) / 2, W)));
  }
  for (const sg of [-1, 1]) { // pilasters with base + capital, volutes with the round scroll + knob below
    fbox(st, f, sg * 0.6, sg * 0.88, W, 1.2, g + 2.0, g + 2.75);
    fbox(st, f, sg * 0.56, sg * 0.92, W, 1.25, g + 2.75, g + 2.85);
    fbox(st, f, sg * 0.56, sg * 0.92, W, 1.25, g + 1.9, g + 2.0);
    st.color = rgb('#ddd3b8');
    fbox(st, f, sg * 1.15, sg * 1.55, W, 1.3, g + 1.3, g + 1.55);
    hcyl(st, f, sg * 1.35, g + 1.76, 0.2, W, 1.28, 12);
    hcyl(st, f, sg * 1.35, g + 1.76, 0.1, 1.3, 1.36, 8);
    hcyl(st, f, sg * 1.4, g + 1.1, 0.08, W, 1.12, 8);
    st.color = rgb('#d6cbae');
  }
  for (const sg of [-1, 1]) { // entablature + cornice beside the opening only (the niche runs down to the bowl)
    fbox(st, f, sg * 0.55, sg * 1.0, W, 1.25, g + 2.85, g + 2.97);
    fbox(st, f, sg * 0.55, sg * 1.05, W, 1.32, g + 2.97, g + 3.07);
  }
  st.color = rgb('#ece4cf');
  for (const a of [-0.92, -0.76, -0.6, 0.6, 0.76, 0.92]) hcyl(st, f, a, g + 2.91, 0.045, 1.25, 1.29, 8); // row of discs…
  for (let i = 1; i < 10; i++) { // …continuing around the back of the niche
    const t = (Math.PI * i) / 10;
    rlathe(st, f, 0.95 * R * Math.cos(t), W - 0.95 * R * Math.sin(t), [[0.04, g + 2.86], [0.04, g + 2.95]], 6);
  }
  // lower basin (lead), stone foot flaring up to the stem, ribbed tulip bowl, round pedestal
  const wc = 1.0; // axis of the bowls, just off the wall
  const lead = s.buf('metal');
  lead.color = rgb('#4e555d');
  rlathe(lead, f, 0, wc, [[0.5, g + 0.45], [0.82, g + 0.8], [0.96, g + 1.15], [1.0, g + 1.38], [0.94, g + 1.48], [0.76, g + 1.48], [0.7, g + 1.42]], 24);
  lead.color = rgb('#3a4650');
  rlathe(lead, f, 0, wc, [[0.72, g + 1.4], [0.72, g + 1.41]], 24); // water in the basin
  st.color = rgb('#787d7e');
  rlathe(st, f, 0, wc, [[0.9, g + 1.48], [0.56, g + 1.6], [0.4, g + 1.8], [0.33, g + 2.05], [0.28, g + 2.14]], 24); // trumpet foot
  lead.color = rgb('#454c55');
  rlathe(lead, f, 0, wc, [[0.27, g + 2.12], [0.36, g + 2.25], [0.44, g + 2.45], [0.49, g + 2.56], [0.42, g + 2.58]], 28, 0.06, 14); // tulip bowl, 14 petals
  lead.color = rgb('#3a4650');
  rlathe(lead, f, 0, wc, [[0.36, g + 2.5], [0.36, g + 2.51]], 28); // water in the bowl
  lead.color = rgb('#4e555d');
  rlathe(lead, f, 0, wc, [[0.22, g + 2.5], [0.26, g + 2.56], [0.26, g + 2.62]], 16); // the statue's round pedestal
  // mascaron on the foot (spouting) and the satyr with grapes on the basin rim; two water jets
  lead.color = rgb('#5d646c');
  fbox(lead, f, -0.13, 0.13, 1.28, 1.42, g + 1.92, g + 2.18); // mascaron face, mid-foot
  fbox(lead, f, -0.035, 0.035, 1.42, 1.47, g + 2.03, g + 2.09); // nose
  lead.color = rgb('#262a2e');
  for (const sg of [-1, 1]) fbox(lead, f, sg * 0.05 - 0.025, sg * 0.05 + 0.025, 1.42, 1.435, g + 2.1, g + 2.13);
  fbox(lead, f, -0.035, 0.035, 1.42, 1.435, g + 1.96, g + 1.98); // mouth
  st.color = rgb('#d8cfb4');
  fbox(st, f, -0.16, 0.16, 1.5, 1.68, g + 1.42, g + 1.72); // satyr face at the foot of the trumpet, over the basin
  fbox(st, f, -0.045, 0.045, 1.68, 1.73, g + 1.53, g + 1.61);
  st.color = rgb('#c7bc9e');
  for (let k = 0; k < 7; k++) rlathe(st, f, -0.12 + 0.04 * k, 1.6 + (k % 2) * 0.05, [[0.035, g + 1.7], [0.035, g + 1.78]], 6); // grapes
  st.color = rgb('#3a3630');
  for (const sg of [-1, 1]) fbox(st, f, sg * 0.055 - 0.025, sg * 0.055 + 0.025, 1.68, 1.69, g + 1.62, g + 1.65);
  fbox(st, f, -0.045, 0.045, 1.68, 1.69, g + 1.47, g + 1.495);
  const jet = s.buf('waterJet');
  fbox(jet, f, -0.012, 0.012, 1.44, 1.465, g + 1.74, g + 1.97); // mascaron → the satyr's head
  // the boy (dark bronze): legs, torso, head with curls, right hand on the hip, left arm hanging; facing the street
  const b = s.buf('metal');
  b.color = rgb('#3d372d');
  const y0 = g + 2.62;
  const bw = wc;
  for (const sg of [-1, 1]) rlathe(b, f, sg * 0.05, bw, [[0.042, y0], [0.038, y0 + 0.22]], 8);
  rlathe(b, f, 0, bw, [[0.095, y0 + 0.2], [0.105, y0 + 0.3], [0.11, y0 + 0.4], [0.075, y0 + 0.44], [0.035, y0 + 0.47]], 10); // body + neck
  rlathe(b, f, 0, bw, [[0.045, y0 + 0.46], [0.07, y0 + 0.5], [0.075, y0 + 0.55], [0.05, y0 + 0.59]], 10); // head
  for (let k = 0; k < 6; k++) rlathe(b, f, 0.06 * Math.cos(k), bw + 0.06 * Math.sin(k), [[0.025, y0 + 0.56], [0.02, y0 + 0.6]], 6); // curls
  fbox(b, f, -0.13, -0.09, bw - 0.02, bw + 0.02, y0 + 0.32, y0 + 0.43); // right upper arm (viewer's left)
  fbox(b, f, -0.13, -0.08, bw - 0.02, bw + 0.02, y0 + 0.29, y0 + 0.33); // forearm to the hip
  fbox(b, f, 0.09, 0.13, bw - 0.02, bw + 0.02, y0 + 0.22, y0 + 0.43); // left arm hanging
  fbox(b, f, -0.012, 0.012, bw + 0.09, bw + 0.13, y0 + 0.22, y0 + 0.245); // the member
  for (let k = 0; k < 4; k++) fbox(jet, f, -0.01, 0.01, bw + 0.13 + 0.03 * k, bw + 0.15 + 0.03 * k, y0 + 0.225 - 0.012 * k * k, y0 + 0.24 - 0.012 * k * k);
  fbox(jet, f, -0.01, 0.01, bw + 0.23, bw + 0.25, g + 2.52, y0 + 0.12); // falling straight into the bowl
  // wrought-iron fleur-de-lis bracket high on the left (north) of the niche
  const iron = s.buf('metal');
  iron.color = rgb('#1f2224');
  fbox(iron, f, -1.62, -1.58, 0.93, 0.98, g + 4.3, g + 5.6);
  fbox(iron, f, -1.62, -1.58, 0.93, 0.98, g + 5.6, g + 6.0);
  for (const sg of [-1, 1]) { fbox(iron, f, -1.6 + sg * 0.1 - 0.02, -1.6 + sg * 0.1 + 0.02, 0.93, 0.98, g + 5.35, g + 5.7); hcyl(iron, f, -1.6 + sg * 0.14, g + 5.3, 0.06, 0.93, 0.98, 8); }
  // curved wrought-iron railing: posts on an arc, two rails, scroll curls under the top rail
  const rail = (phi: number, y: number) => P(f, 2.1 * Math.sin(phi), y, wc + 2.1 * Math.cos(phi));
  const N = 22, span = (Math.PI * 76) / 180;
  for (let i = 0; i <= N; i++) {
    const phi = -span + (2 * span * i) / N;
    bar(iron, rail(phi, g), rail(phi, g + 1.05), 0.035);
    if (i < N) {
      const phi1 = -span + (2 * span * (i + 1)) / N;
      bar(iron, rail(phi, g + 1.05), rail(phi1, g + 1.05), 0.05);
      bar(iron, rail(phi, g + 0.55), rail(phi1, g + 0.55), 0.035);
      const pm = (phi + phi1) / 2;
      const [cx, cy] = [pm, g + 0.82];
      let prev = rail(cx, cy + 0.11);
      for (let k = 1; k <= 8; k++) { // an octagonal curl between the posts
        const t = (2 * Math.PI * k) / 8;
        const q = rail(cx + (0.11 * Math.sin(t)) / 2.1, cy + 0.11 * Math.cos(t));
        bar(iron, prev, q, 0.02);
        prev = q;
      }
    }
  }
  // collider: the wall slab + the basin block (details are never solid, SPEC §5.9)
  s.prism([[[-2, 0], [2, 0], [2, 0.95], [1.0, 2.0], [-1.0, 2.0], [-2, 0.95]].flatMap(([a, w]) => { const p = P(f, a!, 0, w!); return [p[0], p[2]]; })], g - 0.3, g + 3.0);
  return s.out();
};

// ── Galeries Royales Saint-Hubert: glass barrel vault along the passage ──

/** Barrel vault of the long axis (a), half span w, springing y0, rise r. */
function vault(buf: Buf, f: Fr, a0: number, a1: number, hw: number, y0: number, r: number, n = 10) {
  const pt = (a: number, k: number): V3 => P(f, a, y0 + r * Math.sin((Math.PI * k) / n), hw * Math.cos((Math.PI * k) / n));
  for (let k = 0; k < n; k++) {
    const mid = Math.PI * (k + 0.5) / n;
    const out: V3 = [-f.uz * Math.cos(mid), Math.sin(mid), f.ux * Math.cos(mid)];
    quadOut(buf, pt(a0, k), pt(a1, k), pt(a1, k + 1), pt(a0, k + 1), out, a0 / 3, k, a1 / 3, k + 1);
  }
}

const galeries: DetailFn = (rec, _parts, ctx) => {
  const base = town(rec, ctx, { height: 17, levels: undefined, roofLevels: undefined });
  const f = footprintFrame(rec.outer);
  const top = ctx.ground + 17;
  const s = new Sink();
  const glass = s.buf('glass');
  vault(glass, f, -f.a * 0.75, f.a * 0.75, 4.2, top, 4.2);
  const m = s.buf('metal');
  m.color = rgb('#2b2e31');
  for (let a = -f.a * 0.75; a <= f.a * 0.75; a += 5) { // iron ribs
    fbox(m, f, a - 0.1, a + 0.1, -4.4, -4.2, top, top + 0.15);
    fbox(m, f, a - 0.1, a + 0.1, 4.2, 4.4, top, top + 0.15);
    fbox(m, f, a - 0.1, a + 0.1, -0.1, 0.1, top + 4.2, top + 4.35);
  }
  return join(base, s);
};

// ── Parlement européen: the Paul-Henri Spaak block carries the glass hémicycle dome (position approximate) ──

const parlement: DetailFn = (rec, _parts, ctx) => {
  const base = town(rec, ctx);
  if (rec.height !== 40) return base; // Altiero Spinelli: plain curtain-wall block
  const f = footprintFrame(rec.outer);
  const top = ctx.ground + 40;
  const s = new Sink();
  const glass = s.buf('glass');
  const R = Math.min(f.a, f.b) * 0.55;
  lathe(glass, f, 0, 0, [[R, top], [R * 0.98, top + 2], [R * 0.85, top + 6], [R * 0.6, top + 9.5], [R * 0.3, top + 11.5], [0.001, top + 12]], 24);
  const m = s.buf('metal');
  m.color = rgb('#aeb4b8');
  lathe(m, f, 0, 0, [[R * 1.04, top - 0.2], [R * 1.04, top + 0.6]], 24);
  return join(base, s);
};

// ── Colonne du Congrès: pedestal, four bronze lions, fluted shaft 47 m in all, Leopold I on top ──

const colonne: DetailFn = (rec, _parts, ctx) => {
  const f = footprintFrame(rec.outer);
  const g = ctx.minGround;
  const s = new Sink();
  const st = s.buf('masonry');
  st.color = rgb('#8f9296');
  fbox(st, f, -f.a, f.a, -f.b, f.b, g - 0.3, g + 0.6); // the OSM podium, low
  fbox(st, f, -f.a * 0.8, f.a * 0.8, -f.b * 0.8, f.b * 0.8, g + 0.6, g + 1.2);
  const ped = 3.4;
  solid(s, f, ped, g - 0.3, g + 6);
  solid(s, f, 1.5, g + 6, g + 42);
  fbox(st, f, -ped, ped, -ped, ped, g + 1.2, g + 6); // pedestal
  st.color = rgb('#7d8084');
  fbox(st, f, -ped - 0.3, ped + 0.3, -ped - 0.3, ped + 0.3, g + 5.6, g + 6.2);
  st.color = rgb('#a2a5a8');
  const shaft = (r0: number, r1: number, y0: number, y1: number) => lathe(st, f, 0, 0, [[r0, y0], [r1, y1]], 16);
  shaft(1.75, 1.45, g + 6.2, g + 40); // fluted shaft (16-gon)
  fbox(st, f, -2.1, 2.1, -2.1, 2.1, g + 40, g + 41);
  fbox(st, f, -1.7, 1.7, -1.7, 1.7, g + 41, g + 42); // capital
  const br = s.buf('bronze');
  lathe(br, f, 0, 0, [[0.9, g + 42], [0.9, g + 43]], 8); // plinth of the statue
  fbox(br, f, -0.35, 0.35, -0.3, 0.3, g + 43, g + 45.2); // Leopold I: body
  lathe(br, f, 0, 0, [[0.28, g + 45.2], [0.28, g + 46.2], [0.14, g + 46.7], [0, g + 47]], 8);
  for (const [a, w] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const) { // the lions at the corners of the pedestal
    const [ca, cw] = [a * (ped + 1.2), w * (ped + 1.2)];
    fbox(br, f, ca - 1.0, ca + 1.0, cw - 0.45, cw + 0.45, g + 0.6, g + 1.6);
    fbox(br, f, ca + a * 0.2 - 0.35, ca + a * 0.2 + 0.35, cw - 0.35, cw + 0.35, g + 1.6, g + 2.6);
  }
  const fl = s.buf('gold');
  lathe(fl, f, 0, 5.2, [[0.25, g], [0.1, g + 0.8], [0, g + 1.2]], 6); // eternal flame of the Unknown Soldier, at the foot
  return s.out();
};

export const details: Partial<Record<LandmarkId, DetailFn>> = {
  'grand-place': guildHouse,
  'manneken-pis': mannekenPis,
  'galeries-saint-hubert': galeries,
  'parlement-europeen': parlement,
  'colonne-du-congres': colonne,
};
