// Leg 3 landmark details, part 10: the two small "pis" fountains built after photos (2026-10-26). Both are anchored on the OSM
// house next to the statue node (the registry takes outlines only), so the house stays an ordinary BuildingBuilder building
// (town) and the fountain is dressed in front of its wall. Details are never solid (SPEC §5.9): only the Jeanneke stone block
// and the Zinneke bollard get colliders.
//   jeanneke-pis: Impasse de la Fidélité, niche on the SW wall of house no. 11 at node n/249292417, facing the alley.
//   zinneke-pis: Rue des Chartreux, bronze dog + cast-iron bollard on the pavement at node n/1490475849, N of way/244955899.
import type { LandmarkId } from '../../geo/chunkData.ts';
import type { BuildOut } from '../buildTypes.ts';
import type { V3 } from '../geom.ts';
import { cap, fbox, type Fr, P, rgb, UP, withExtras } from './b.ts';
import { bar, hash, hcyl, rlathe, town } from './d.ts';
import type { DetailFn } from './index.ts';
import { quadOut, triOut } from './kit.ts';
import { Sink } from './parts.ts';

type Buf = Parameters<typeof quadOut>[0];
type XZ = readonly [number, number];

/** The house body + the extras, keeping the extras' colliders too (withExtras keeps the body's only). */
const join = (base: BuildOut, s: Sink): BuildOut => ({ ...withExtras(base, s), colliders: [...base.colliders, ...s.out().colliders] });

/** Frame on the outline edge nearest to `at`: a along the edge, w outward (away from the outline's centroid), origin at `at`. */
export function wallFrame(outer: number[], at: XZ): Fr & { d: number } {
  const n = outer.length / 2;
  let [cx, cz] = [0, 0];
  for (let i = 0; i < n; i++) { cx += outer[2 * i]! / n; cz += outer[2 * i + 1]! / n; }
  let best = { d: Infinity, ux: 1, uz: 0 };
  for (let i = 0; i < n; i++) {
    const [ax, az, bx, bz] = [outer[2 * i]!, outer[2 * i + 1]!, outer[2 * ((i + 1) % n)]!, outer[2 * ((i + 1) % n) + 1]!];
    const len = Math.hypot(bx - ax, bz - az) || 1;
    const t = Math.max(0, Math.min(1, ((at[0] - ax) * (bx - ax) + (at[1] - az) * (bz - az)) / (len * len)));
    const d = Math.hypot(ax + t * (bx - ax) - at[0], az + t * (bz - az) - at[1]);
    if (d < best.d) best = { d, ux: (bx - ax) / len, uz: (bz - az) / len };
  }
  let { ux, uz } = best;
  if (-uz * (cx - at[0]) + ux * (cz - at[1]) > 0) [ux, uz] = [-ux, -uz]; // w axis (−uz, ux) must point away from the centroid
  return { cx: at[0], cz: at[1], ux, uz, a: 1, b: 1, area: 0, d: best.d } as Fr & { d: number };
}

/** Convex quad (a, y) corners, extruded from w0 to w1: radiating voussoirs, tilted limbs. */
function pbox(buf: Buf, f: Fr, q: [number, number][], w0: number, w1: number) {
  const [ca, cy] = [q.reduce((s, p) => s + p[0] / 4, 0), q.reduce((s, p) => s + p[1] / 4, 0)];
  const lo = q.map(([a, y]) => P(f, a, y, w0)), hi = q.map(([a, y]) => P(f, a, y, w1));
  quadOut(buf, hi[0]!, hi[1]!, hi[2]!, hi[3]!, [-f.uz, 0, f.ux]);
  quadOut(buf, lo[0]!, lo[1]!, lo[2]!, lo[3]!, [f.uz, 0, -f.ux]);
  for (let i = 0; i < 4; i++) {
    const [p, r] = [q[i]!, q[(i + 1) % 4]!];
    const [ma, my] = [(p[0] + r[0]) / 2 - ca, (p[1] + r[1]) / 2 - cy];
    quadOut(buf, lo[i]!, lo[(i + 1) % 4]!, hi[(i + 1) % 4]!, hi[i]!, [ma * f.ux, my, ma * f.uz]);
  }
}

/** Tube along a: rings (n-gon in the y–w plane) at [a, y, w, r] stations, closed at both ends (limbs, bodies, tails). */
function tube(buf: Buf, f: Fr, st: [number, number, number, number][], n = 8) {
  const ring = ([a, y, w, r]: [number, number, number, number]) => Array.from({ length: n }, (_, i): V3 => {
    const t = (2 * Math.PI * i) / n;
    return P(f, a, y + r * Math.cos(t), w + r * Math.sin(t));
  });
  const rs = st.map(ring);
  for (let k = 0; k + 1 < st.length; k++) {
    const [lo, hi] = [rs[k]!, rs[k + 1]!];
    const c = P(f, (st[k]![0] + st[k + 1]![0]) / 2, (st[k]![1] + st[k + 1]![1]) / 2, (st[k]![2] + st[k + 1]![2]) / 2);
    for (let i = 0; i < n; i++) {
      const [p0, p1, p2, p3] = [lo[i]!, lo[(i + 1) % n]!, hi[(i + 1) % n]!, hi[i]!];
      quadOut(buf, p0, p1, p2, p3, [(p0[0] + p2[0]) / 2 - c[0], (p0[1] + p2[1]) / 2 - c[1], (p0[2] + p2[2]) / 2 - c[2]]);
    }
  }
  cap(buf, rs[0]!, [-f.ux, 0, -f.uz]);
  cap(buf, rs.at(-1)!, [f.ux, 0, f.uz]);
}

/** Cobbled patch a0..a1 × w0..w1 just above the ground (0.3 m setts in 4 greys, lod near). */
function cobbles(s: Sink, f: Fr, a0: number, a1: number, w0: number, w1: number, g: number) {
  const b = s.buf('masonry', 'near');
  const tones = ['#7d7a74', '#8a8780', '#74716b', '#948f86'];
  for (let a = a0; a < a1; a += 0.3) {
    for (let w = w0; w < w1; w += 0.3) {
      b.color = rgb(tones[Math.floor(hash(a * 5.1 + w * 3.7 + f.cx) * 4)]!);
      quadOut(b, P(f, a, g + 0.02, w), P(f, a + 0.28, g + 0.02, w), P(f, a + 0.28, g + 0.02, w + 0.28), P(f, a, g + 0.02, w + 0.28), UP);
    }
  }
}

// ── Jeanneke-Pis: dark blue-black stone surround (two-step plinth, block jambs, moulded round arch with 7 radiating cog blocks + keystone,
// stepped impost blocks), scallop half-dome of 17 flutes over a yellow-cream plastered niche, the squatting bronze girl (0.5 m) on a
// rough rock pedestal with a thin jet into a half-round gadrooned basin with two brass taps, croton pots either side, wrought-iron
// grilles with fleur-de-lis finials on the wall, white plaque + black board on the right, two domed bollards, grey lower render, cobbles.
// Scale read off the photo with the girl (0.5 m) as the unit; the niche opening is 1.4 m wide. ──

const JEANNEKE: XZ = [115.8, -197.3]; // n/249292417 (also a vertex of way/306856274)

const jeannekePis: DetailFn = (rec, _parts, ctx) => {
  const base = town(rec, ctx);
  const f = wallFrame(rec.outer, JEANNEKE);
  const p0 = P(f, 0, 0, 1.2);
  const g = ctx.height(p0[0], p0[2]);
  const s = new Sink();
  const st = s.buf('masonry');
  const near = s.buf('masonry', 'near');
  // plaster + grey render on the house wall, 0.05 m proud of the facade
  st.color = rgb('#e9dc9e');
  fbox(st, f, -2.6, 2.6, -0.02, 0.05, g + 1.2, g + 5.2);
  st.color = rgb('#8d8e90');
  fbox(st, f, -2.6, 2.6, -0.02, 0.06, g - 0.3, g + 1.2);
  // two-step plinth, lower block wall with the recessed black panel
  const dark = (k: number) => rgb(['#3f444c', '#474c55', '#3a3f47', '#4c515a'][k % 4]!);
  st.color = dark(0);
  fbox(st, f, -1.4, 1.4, 0, 1.05, g - 0.1, g + 0.18);
  st.color = dark(1);
  fbox(st, f, -1.25, 1.25, 0, 0.9, g + 0.18, g + 0.36);
  st.color = rgb('#15171a');
  fbox(st, f, -0.7, 0.7, 0, 0.35, g + 0.36, g + 0.85);
  for (let row = 0, y = g + 0.85; row < 2; row++, y += 0.2) { // dark courses under the basin
    for (let k = 0; k < 4; k++) { near.color = dark(row * 3 + k); fbox(near, f, -0.7 + 0.35 * k + (row % 2) * 0.17, Math.min(0.7, -0.35 + 0.35 * k + (row % 2) * 0.17), 0, 0.55, y, y + 0.19); }
  }
  // jambs: stacked blocks 0.35 wide × 0.42 high, 0.7 m deep; impost blocks stepping out at the springing
  const ys = g + 2.85;
  for (const sg of [-1, 1]) {
    for (let k = 0, y = g + 0.36; y < ys; k++, y = Math.min(ys, y + 0.42)) { near.color = dark(k + (sg + 1)); fbox(near, f, sg * 0.7, sg * 1.05, 0, 0.7, y, Math.min(ys, y + 0.41)); }
    st.color = dark(2);
    fbox(st, f, sg * 0.7, sg * 1.35, 0, 0.72, ys - 0.3, ys + 0.05); // impost
    fbox(st, f, sg * 1.05, sg * 1.3, 0, 0.6, ys - 0.55, ys - 0.3); // the stepped corner below it
  }
  // niche: plaster back at w 0.12, side cheeks, shelf; the scallop half-dome (17 flutes) over it
  const [R, W, wf] = [0.7, 0.12, 0.7];
  const pl = s.buf('masonry');
  pl.color = rgb('#ecdf9f');
  quadOut(pl, P(f, -0.7, g + 1.7, W), P(f, 0.7, g + 1.7, W), P(f, 0.7, ys, W), P(f, -0.7, ys, W), [-f.uz, 0, f.ux]);
  for (const sg of [-1, 1]) quadOut(pl, P(f, sg * 0.7, g + 1.7, W), P(f, sg * 0.7, g + 1.7, wf), P(f, sg * 0.7, ys, wf), P(f, sg * 0.7, ys, W), [-sg * f.ux, 0, -sg * f.uz]);
  st.color = dark(1);
  fbox(st, f, -0.7, 0.7, 0, 0.7, g + 1.62, g + 1.72); // shelf the pots and the rock stand on
  // quarter sphere whose flat faces are the front plane (just before the arch face) and the springing plane: the concave side looks at the alley
  const wc = wf + 0.06;
  const C = P(f, 0, ys, wc);
  const n = 34, m = 6;
  const shell = (phi: number) => Array.from({ length: n + 1 }, (_, i): V3 => {
    const t = (Math.PI * i) / n;
    const rr = R * (1 + 0.07 * Math.cos(17 * t) * Math.sin(phi)) * Math.cos(phi);
    return P(f, rr * Math.cos(t), ys + R * Math.sin(phi), wc - rr * Math.sin(t));
  });
  st.color = rgb('#4a4f58');
  for (let j = 0; j < m; j++) {
    const [r0, r1] = [shell((Math.PI / 2) * (j / m)), shell((Math.PI / 2) * ((j + 1) / m))];
    for (let i = 0; i < n; i++) {
      const out: V3 = [C[0] - r0[i]![0], C[1] - r0[i]![1], C[2] - r0[i]![2]];
      if (j + 1 < m) quadOut(st, r0[i]!, r0[i + 1]!, r1[i + 1]!, r1[i]!, out);
      else triOut(st, r0[i]!, r0[i + 1]!, P(f, 0, ys + R, wc), out);
    }
  }
  // arch: smooth moulded ring R → 0.98 on the front face (and its intrados), then 7 radiating cog blocks + the keystone
  const r2 = 0.98;
  st.color = dark(2);
  for (let i = 0; i < 24; i++) {
    const [t0, t1] = [(Math.PI * i) / 24, (Math.PI * (i + 1)) / 24];
    const at = (r: number, t: number, w: number) => P(f, r * Math.cos(t), ys + r * Math.sin(t), w);
    quadOut(st, at(R, t0, wf), at(R, t1, wf), at(r2, t1, wf), at(r2, t0, wf), [-f.uz, 0, f.ux]);
    const mid = at(R, (t0 + t1) / 2, W);
    quadOut(st, at(R, t0, W), at(R, t1, W), at(R, t1, wf), at(R, t0, wf), [C[0] - mid[0], C[1] - mid[1], C[2] - mid[2]]);
    const mo = at(r2, (t0 + t1) / 2, W);
    quadOut(st, at(r2, t0, W), at(r2, t1, W), at(r2, t1, wf), at(r2, t0, wf), [mo[0] - C[0], mo[1] - C[1], mo[2] - C[2]]);
  }
  for (let k = 0; k <= 6; k++) { // cogs every 30°; the keystone (k = 3) is taller and tapers
    const t = (Math.PI * k) / 6;
    const [ct, sn] = [Math.cos(t), Math.sin(t)];
    const [hw, len] = k === 3 ? [0.2, 0.42] : [0.14, 0.28];
    const [r0, r1] = [r2 - 0.03, r2 + len];
    const q: [number, number][] = [[r0 * ct - hw * sn, ys + r0 * sn + hw * ct], [r0 * ct + hw * sn, ys + r0 * sn - hw * ct], [r1 * ct + hw * 0.85 * sn, ys + r1 * sn - hw * 0.85 * ct], [r1 * ct - hw * 0.85 * sn, ys + r1 * sn + hw * 0.85 * ct]];
    st.color = dark(k);
    pbox(st, f, q, 0, 0.74);
  }
  // half-round gadrooned basin (16 ribs) on the lower wall, water, thick rim, two brass taps
  st.color = rgb('#3d424a');
  rlathe(st, f, 0, 0.55, [[0.2, g + 1.1], [0.55, g + 1.3], [0.72, g + 1.5], [0.76, g + 1.62]], 32, 0.05, 16);
  rlathe(st, f, 0, 0.55, [[0.8, g + 1.6], [0.84, g + 1.68], [0.8, g + 1.74], [0.7, g + 1.74]], 24);
  const water = s.buf('waterJet');
  rlathe(water, f, 0, 0.55, [[0.7, g + 1.66], [0.7, g + 1.67]], 24);
  const brass = s.buf('gold');
  for (const sg of [-1, 1]) { hcyl(brass, f, sg * 0.74, g + 1.78, 0.03, 0.55, 0.78, 8); fbox(brass, f, sg * 0.74 - 0.05, sg * 0.74 + 0.05, 0.72, 0.8, g + 1.78, g + 1.86); }
  // rock pedestal (rough lathe), the girl squatting on it, the jet into the basin
  const b = s.buf('metal');
  b.color = rgb('#3a3128');
  rlathe(b, f, 0, 0.42, [[0.2, g + 1.72], [0.3, g + 1.95], [0.27, g + 2.2], [0.24, g + 2.32]], 12, 0.12, 5);
  b.color = rgb('#4a4034');
  const y0 = g + 2.32, bw = 0.42;
  for (const sg of [-1, 1]) {
    tube(b, f, [[sg * 0.07, y0 + 0.02, bw - 0.02, 0.04], [sg * 0.08, y0 + 0.2, bw + 0.12, 0.05]], 8); // shins, feet at the back, knees forward
    tube(b, f, [[sg * 0.08, y0 + 0.2, bw + 0.12, 0.05], [sg * 0.07, y0 + 0.24, bw - 0.02, 0.05]], 8); // thighs back to the hips
    tube(b, f, [[sg * 0.11, y0 + 0.44, bw + 0.02, 0.025], [sg * 0.12, y0 + 0.22, bw + 0.14, 0.025]], 6); // arms down to the knees
  }
  rlathe(b, f, 0, bw + 0.02, [[0.085, y0 + 0.22], [0.1, y0 + 0.34], [0.09, y0 + 0.45], [0.04, y0 + 0.5]], 10); // torso + neck
  rlathe(b, f, 0, bw + 0.05, [[0.045, y0 + 0.49], [0.07, y0 + 0.54], [0.07, y0 + 0.6], [0.04, y0 + 0.64]], 10); // head, chin up
  tube(b, f, [[-0.06, y0 + 0.6, bw + 0.02, 0.025], [-0.12, y0 + 0.55, bw - 0.04, 0.012]], 6); // pigtail
  tube(b, f, [[0.06, y0 + 0.6, bw + 0.02, 0.025], [0.12, y0 + 0.55, bw - 0.04, 0.012]], 6);
  fbox(water, f, -0.01, 0.01, bw + 0.12, bw + 0.135, g + 1.67, y0 + 0.2);
  // croton pots: black pot, green leaf cone with orange / yellow tips
  const pot = s.buf('metal');
  pot.color = rgb('#1c1d1f');
  const leaf = s.buf('masonry');
  for (const sg of [-1, 1]) {
    rlathe(pot, f, sg * 0.45, 0.42, [[0.09, g + 1.72], [0.11, g + 1.92]], 10);
    leaf.color = rgb('#3f7f32');
    rlathe(leaf, f, sg * 0.45, 0.42, [[0.05, g + 1.9], [0.26, g + 2.1], [0.2, g + 2.35], [0.03, g + 2.55]], 12, 0.25, 6);
    leaf.color = rgb('#e39a1e');
    for (let k = 0; k < 5; k++) rlathe(leaf, f, sg * 0.45 + 0.1 * Math.cos(k * 1.3), 0.42 + 0.1 * Math.sin(k * 1.3), [[0.035, g + 2.3 + 0.05 * (k % 3)], [0.035, g + 2.37 + 0.05 * (k % 3)]], 6);
  }
  // wrought-iron grilles either side: frame, verticals with fleur-de-lis spikes, a scroll row
  const iron = s.buf('metal');
  iron.color = rgb('#1e2124');
  for (const sg of [-1, 1]) {
    const [a0, a1] = sg < 0 ? [-2.45, -1.45] : [1.45, 2.45];
    const [yb, yt] = [g + 1.9, g + 3.5];
    for (const y of [yb, yb + 0.5, yt - 0.3]) bar(iron, P(f, a0, y, 0.08), P(f, a1, y, 0.08), 0.03);
    for (let a = a0; a <= a1 + 0.01; a += 0.2) {
      bar(iron, P(f, a, yb, 0.08), P(f, a, yt + 0.1, 0.08), 0.025);
      rlathe(iron, f, a, 0.08, [[0.04, yt + 0.08], [0.015, yt + 0.3], [0.001, yt + 0.42]], 6); // fleur-de-lis spike
      for (let k = 1; k <= 6; k++) bar(iron, P(f, a + 0.07 * Math.cos((k - 1) * 1.05), yb + 0.25 + 0.07 * Math.sin((k - 1) * 1.05), 0.08), P(f, a + 0.07 * Math.cos(k * 1.05), yb + 0.25 + 0.07 * Math.sin(k * 1.05), 0.08), 0.015); // curl
    }
  }
  // plaque (white) top right, information board (black) bottom right, two domed bollards at the front corners
  st.color = rgb('#f1ece0');
  fbox(st, f, 1.55, 2.05, 0.05, 0.08, g + 3.7, g + 4.05);
  st.color = rgb('#111214');
  fbox(st, f, 1.4, 2.2, 0.06, 0.09, g + 0.9, g + 1.85);
  st.color = dark(0);
  for (const sg of [-1, 1]) rlathe(st, f, sg * 1.55, 1.35, [[0.17, g - 0.05], [0.17, g + 0.42], [0.12, g + 0.52], [0.001, g + 0.56]], 8);
  cobbles(s, f, -2.6, 2.6, 1.06, 3.4, g);
  s.prism([[[-1.4, 0], [1.4, 0], [1.4, 1.05], [-1.4, 1.05]].flatMap(([a, w]) => { const p = P(f, a!, 0, w!); return [p[0], p[2]]; })], g - 0.1, g + 3.2);
  return join(base, s);
};

// ── Het Zinneke: the bronze mongrel (≈ 0.7 m long) cocking its hind leg against a dark-green cast-iron bollard (ribbed foot, ball top,
// relief plaque) on the cobbled pavement, a thin yellowish jet; a green street post behind and the dark-blue plinth of the corner
// house (town) as in the photo. The dog looks west along Rue des Chartreux toward the Vieux Marché aux Grains. ──

const ZINNEKE: XZ = [-479.7, -226.1]; // n/1490475849

const zinnekePis: DetailFn = (rec, _parts, ctx) => {
  const base = town(rec, ctx);
  // a along the nearest house wall (its N face, ≈ 2.5 m from the node), w from the wall toward the street; the wall sits at w = −d
  const f = wallFrame(rec.outer, ZINNEKE);
  const wd = f.d;
  const w0 = -wd + 1.0; // the bollard stands 1 m off the wall, on the pavement (the drawn carriageway is wider than the real street)
  const g = ctx.height(ZINNEKE[0], ZINNEKE[1]);
  const s = new Sink();
  cobbles(s, f, -2.2, 2.2, -wd + 0.1, -wd + 1.5, g);
  const st = s.buf('masonry');
  st.color = rgb('#243550'); // dark-blue plinth skin on the house wall
  fbox(st, f, -1.6, 1.6, -wd - 0.06, -wd + 0.06, g - 0.2, g + 1.1);
  const green = s.buf('metal');
  green.color = rgb('#1f4a3a');
  rlathe(green, f, -0.7, -wd + 0.6, [[0.04, g - 0.1], [0.04, g + 3.2]], 8); // street post
  // bollard: ribbed foot, shaft, collar, ball, small plaque facing the street
  rlathe(green, f, 0, w0, [[0.15, g - 0.05], [0.15, g + 0.05], [0.12, g + 0.08], [0.14, g + 0.12], [0.11, g + 0.15], [0.13, g + 0.19], [0.1, g + 0.22], [0.1, g + 0.62], [0.12, g + 0.66], [0.1, g + 0.7]], 14);
  rlathe(green, f, 0, w0, [[0.04, g + 0.7], [0.1, g + 0.76], [0.12, g + 0.84], [0.1, g + 0.92], [0.04, g + 0.97], [0.001, g + 0.98]], 12);
  green.color = rgb('#2a5a48');
  fbox(green, f, -0.04, 0.04, w0 + 0.095, w0 + 0.115, g + 0.32, g + 0.44);
  // the dog: body tube along a (tail end at the bollard), neck bending down to the head, snout, floppy ear, legs, curled tail
  const d = s.buf('metal');
  d.color = rgb('#5b4a30');
  const [y, w] = [g + 0.42, w0 + 0.22];
  tube(d, f, [[0.12, y + 0.02, w, 0.07], [0.22, y + 0.03, w, 0.11], [0.45, y + 0.02, w, 0.12], [0.62, y - 0.01, w, 0.1], [0.7, y - 0.03, w, 0.08]], 10); // body
  tube(d, f, [[0.68, y - 0.02, w, 0.07], [0.8, y - 0.1, w, 0.06], [0.88, y - 0.16, w, 0.065]], 8); // neck down
  tube(d, f, [[0.86, y - 0.16, w, 0.07], [0.98, y - 0.19, w, 0.055], [1.08, y - 0.21, w, 0.035]], 8); // head + snout
  fbox(d, f, 0.86, 0.94, w + 0.05, w + 0.08, y - 0.26, y - 0.13); // floppy ear
  tube(d, f, [[0.1, y + 0.05, w, 0.03], [0.02, y + 0.2, w + 0.02, 0.025], [0.04, y + 0.3, w + 0.08, 0.018]], 6); // tail curled up
  for (const [a, dw] of [[0.6, -0.06], [0.64, 0.07], [0.24, 0.07]] as const) { // three standing legs
    rlathe(d, f, a, w + dw, [[0.03, g - 0.02], [0.028, y - 0.12], [0.035, y - 0.02]], 6);
    fbox(d, f, a - 0.05, a + 0.04, w + dw - 0.025, w + dw + 0.025, g - 0.02, g + 0.025); // paw
  }
  tube(d, f, [[0.26, y - 0.02, w - 0.04, 0.035], [0.18, y + 0.02, w - 0.14, 0.028], [0.16, y - 0.08, w - 0.2, 0.022]], 6); // lifted hind leg toward the bollard
  const jet = s.buf('masonry');
  jet.color = rgb('#d9c25a');
  fbox(jet, f, 0.1, 0.12, w - 0.08, w - 0.06, g + 0.06, y - 0.1);
  fbox(jet, f, 0.08, 0.1, w - 0.1, w - 0.04, g + 0.02, g + 0.06); // splash at the bollard's foot
  s.prism([[[-0.16, w0 - 0.16], [0.16, w0 - 0.16], [0.16, w0 + 0.16], [-0.16, w0 + 0.16]].flatMap(([a, w2]) => { const p = P(f, a!, 0, w2!); return [p[0], p[2]]; })], g - 0.1, g + 0.95);
  return join(base, s);
};

export const details: Partial<Record<LandmarkId, DetailFn>> = {
  'jeanneke-pis': jeannekePis,
  'zinneke-pis': zinnekePis,
};
