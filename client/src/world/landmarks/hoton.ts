// ── Tượng đài Bác Hồ – Bác Tôn (OSM node/9907239892, 21.0111944 N 105.8424821 E = world (−1003, 2323)), on đảo Thống Nhất
// in Công viên Thống Nhất: the island reached by the footbridge from the Lê Duẩn gate (bridge way x −1062 → −1023, z 2336).
// After the owner's photo: two bronze figures (≈ 1.5 × life) shaking hands on a dark granite plinth — Hồ Chí Minh on the
// viewer's left (tall, slim, goatee, high-collared jacket, right arm forward), Tôn Đức Thắng on the right (shorter, broader,
// bald, smiling, both hands on the clasp); plinth 4.2 × 1.5 × 1.43 m on a thin step, a top slab, the front split by a
// vertical groove into a narrower left part (2 cm proud) and a wider right part with raised bronze capitals
// "BÁC HỒ – BÁC TÔN"; a round flower bed (zinnias, red canna front right), two white planters on pedestals, frangipani
// (hoa sứ) on the left and a flame tree (phượng) on the right, the wide part of hồ Bảy Mẫu behind. The front faces WEST,
// towards the bridge (the narrow channel / Lê Duẩn): from there the viewer looks east over the widest water (≈ 300 m).
// Frame: a = north (the viewer's left), w = east (into the picture, the lake); P(f, a, y, w) → x = cx + w, z = cz − a.
// Figures: smooth lofted tubes (legs, jacket torso, sleeves, hands, collar, neck) + a displaced-sphere head (nose, brow,
// eye sockets, cheeks, lips, chin, ears, hair, goatee) in figure-local coords (x right, y up, z forward), on 'metal'
// (vertex colours, metalness 0.6, roughness 0.45: bronze with a green-brown patina on up-facing surfaces). Letters: the text
// rasterised on an OffscreenCanvas in the worker, merged pixel runs → raised 1.2 cm bronze boxes (no texture: chunk −5_9
// already uses its 'mural' atlas for the Lê Duẩn gate board); without OffscreenCanvas the face stays blank.
// Solid: plinth + step + planters (Sink.prism); figures (out of reach on the plinth), flowers, trees are not. ≈ 20k tris.
import type { ChunkData } from '../../geo/chunkData.ts';
import type { BuildCtx, BuildOut } from '../buildTypes.ts';
import type { MeshBuffer as Buf, V3 } from '../geom.ts';
import { cap, fbox, type Fr, P, rgb, ring, UP } from './b.ts';
import { hash, lathe } from './d.ts';
import { frameAt } from './h3.ts';
import { cross, dot, quadOut, sub, triOut } from './kit.ts';
import { Sink } from './parts.ts';
import { pushBox } from '../StreetProps.ts';
import { treeShape } from '../Vegetation.ts';

export const STATUE: [number, number] = [-1003, 2323];

const add = (a: V3, b: V3, k = 1): V3 => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);
const unit = (a: V3): V3 => {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const lerp = (a: V3, b: V3, t: number): V3 => add(a, sub(b, a), t);
const sstep = (e0: number, e1: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

type Tint = (p: V3, n: V3) => V3;

/** Smooth grid: rows (each a closed ring of the same length; a ring of equal points = a pole), normals from the
 *  neighbours, turned away from each row's centre; triangles wound to match. */
function surf(buf: Buf, rows: V3[][], tint?: Tint) {
  const n = rows[0]!.length;
  const cen = rows.map((r) => r.reduce<V3>((s, p) => add(s, p, 1 / n), [0, 0, 0]));
  const base = buf.vertexCount;
  const nrm: V3[] = [];
  const keep = buf.color;
  rows.forEach((r, i) => r.forEach((p, j) => {
    const dv = sub(rows[Math.min(i + 1, rows.length - 1)]![j]!, rows[Math.max(i - 1, 0)]![j]!);
    const du = sub(r[(j + 1) % n]!, r[(j + n - 1) % n]!);
    let out = sub(p, cen[i]!);
    if (len(out) < 1e-5) out = sub(cen[i]!, cen[i === 0 ? 1 : i - 1]!);
    let m = cross(du, dv);
    if (len(m) < 1e-10) m = out;
    if (dot(m, out) < 0) m = [-m[0], -m[1], -m[2]];
    m = unit(m);
    nrm.push(m);
    if (tint) buf.color = tint(p, m);
    buf.vertex(p[0], p[1], p[2], m[0], m[1], m[2], j / n, i / rows.length);
  }));
  buf.color = keep;
  for (let i = 0; i + 1 < rows.length; i++) {
    for (let j = 0; j < n; j++) {
      const q = [[i, j], [i, (j + 1) % n], [i + 1, (j + 1) % n], [i + 1, j]] as const;
      for (const [x, y, z] of [[0, 1, 2], [0, 2, 3]] as const) {
        const [pa, pb, pc] = [q[x], q[y], q[z]].map(([r, c]) => rows[r]![c]!) as [V3, V3, V3];
        const fn = cross(sub(pb, pa), sub(pc, pa));
        if (len(fn) < 1e-12) continue;
        const [ia, ib, ic] = [q[x], q[y], q[z]].map(([r, c]) => r * n + c) as [number, number, number];
        const vn = add(add(nrm[ia]!, nrm[ib]!), nrm[ic]!);
        if (dot(fn, vn) >= 0) buf.face(base + ia, base + ib, base + ic);
        else buf.face(base + ia, base + ic, base + ib);
      }
    }
  }
}

interface Sec { c: V3; rx: number; rz: number }

/** Rings round a centre line: x-radius along `side` (made perpendicular to the line), z-radius along tangent × side;
 *  `e` = superellipse exponent (2 = ellipse, larger = boxier); rounded ends `cap0` / `cap1` × the radius deep (0 = flat). */
function tube(secs: Sec[], side: V3, segs: number, e = 2, cap0 = 0.8, cap1 = 0.8): V3[][] {
  const fr = secs.map((_, i) => {
    const t = unit(sub(secs[Math.min(i + 1, secs.length - 1)]!.c, secs[Math.max(i - 1, 0)]!.c));
    let sd = sub(side, [t[0] * dot(side, t), t[1] * dot(side, t), t[2] * dot(side, t)]);
    if (len(sd) < 1e-3) sd = Math.abs(t[1]) < 0.9 ? [0, 1, 0] : [0, 0, 1];
    sd = unit(sd);
    return { t, s: sd, o: cross(t, sd) };
  });
  const ringAt = (c: V3, i: number, k: number): V3[] => Array.from({ length: segs }, (_, j) => {
    const a = (2 * Math.PI * j) / segs;
    const [ca, sa] = [Math.cos(a), Math.sin(a)];
    const [px, pz] = [Math.sign(ca) * Math.abs(ca) ** (2 / e), Math.sign(sa) * Math.abs(sa) ** (2 / e)];
    return add(add(c, fr[i]!.s, px * secs[i]!.rx * k), fr[i]!.o, pz * secs[i]!.rz * k);
  });
  const end = (i: number, dir: number, depth: number): V3[][] => {
    const s = secs[i]!;
    const r = (s.rx + s.rz) / 2;
    const tip = add(s.c, fr[i]!.t, dir * depth * r);
    const pole = Array.from({ length: segs }, () => tip);
    return depth > 0 ? [ringAt(add(s.c, fr[i]!.t, dir * depth * r * 0.6), i, 0.8), pole] : [pole];
  };
  const last = secs.length - 1;
  return [...end(0, -1, cap0).reverse(), ...secs.map((s, i) => ringAt(s.c, i, 1)), ...end(last, 1, cap1)];
}

/** Octahedron (a flower head / blossom dot) of radius r at world point c. */
export function gem(buf: Buf, c: V3, r: number) {
  const v = ([[r, 0, 0], [-r, 0, 0], [0, r, 0], [0, -r * 0.6, 0], [0, 0, r], [0, 0, -r]] as V3[]).map((d) => add(c, d));
  for (const x of [0, 1]) for (const y of [2, 3]) for (const z of [4, 5]) {
    const [a, b, d] = [v[x]!, v[y]!, v[z]!];
    triOut(buf, a, b, d, sub(add(add(a, b), d), [c[0] * 3, c[1] * 3, c[2] * 3]));
  }
}

const BRONZE = rgb('#553a1e');
const PATINA = rgb('#565236');
const LETTER = rgb('#7a6038');
/** Bronze shade per vertex: a slow mottling, a green-brown patina where the rain lands (up-facing). */
const bronze = (base: V3): Tint => (p, n) => {
  const v = 0.84 + 0.24 * (0.5 + 0.5 * Math.sin(p[0] * 9.1 + p[1] * 6.3) * Math.sin(p[2] * 8.7 - p[1] * 4.1));
  const m = Math.max(0, n[1]) * 0.5;
  return [(base[0] * (1 - m) + PATINA[0] * m) * v, (base[1] * (1 - m) + PATINA[1] * m) * v, (base[2] * (1 - m) + PATINA[2] * m) * v];
};

// ── the figures ──
interface Arm { hand: V3; dir?: V3; side: V3 } // fingertip target, hand direction, hand width axis: all statue (a, y, w)
interface Fig {
  a: number; w: number; fa: number; fw: number; // feet centre, facing (unit) in the statue frame
  H: number; k: number; d: number; lean: number; // height, width / depth factors, forward lean of the upper body
  hw: number; hair: number; smile: number; goatee: boolean; pitch: number; yaw: number; // head
  feet: [number, number]; // forward offset of the left / right foot (× H)
  armR: Arm | null; armL: Arm | null; // null = hanging
}

// torso (jacket) rings: y, half-width, half-depth (× H)
const TORSO: [number, number, number][] = [
  [0.425, 0.128, 0.09], [0.44, 0.126, 0.088], [0.5, 0.118, 0.08], [0.56, 0.113, 0.076], [0.64, 0.119, 0.077],
  [0.72, 0.127, 0.079], [0.775, 0.128, 0.072], [0.805, 0.118, 0.062], [0.825, 0.078, 0.052], [0.838, 0.047, 0.043],
];
const E_TORSO = 2.6;

function figure(s: Sink, f: Fr, y0: number, fg: Fig) {
  const { H, k, d } = fg;
  const [ra, rw] = [-fg.fw, fg.fa]; // right
  const W = (p: V3): V3 => P(f, fg.a + p[0] * ra + p[2] * fg.fa, y0 + p[1], fg.w + p[0] * rw + p[2] * fg.fw);
  const local = (q: V3): V3 => { // statue (a, y, w) → local
    const [da, dw] = [q[0] - fg.a, q[2] - fg.w];
    return [da * ra + dw * rw, q[1], da * fg.fa + dw * fg.fw];
  };
  const ldir = (q: V3): V3 => [q[0] * ra + q[2] * rw, q[1], q[0] * fg.fa + q[2] * fg.fw];
  const buf = s.buf('metal');
  const tint = bronze(BRONZE);
  const put = (rows: V3[][]) => surf(buf, rows.map((r) => r.map(W)), tint);
  const zoff = (y: number) => fg.lean * Math.max(0, y - 0.45 * H);
  const belly = (yf: number) => (k > 1 ? 0.008 * Math.exp(-(((yf - 0.56) / 0.07) ** 2)) : 0);
  const ring_ = (yf: number) => { // interpolated torso section at y = yf·H
    const i = Math.max(0, TORSO.findIndex((r) => r[0] >= yf) - 1);
    const [a0, b0] = [TORSO[i]!, TORSO[Math.min(i + 1, TORSO.length - 1)]!];
    const t = b0[0] > a0[0] ? Math.max(0, Math.min(1, (yf - a0[0]) / (b0[0] - a0[0]))) : 0;
    return { A: (a0[1] + (b0[1] - a0[1]) * t) * k * H, D: ((a0[2] + (b0[2] - a0[2]) * t) * d + belly(yf)) * H };
  };
  const front = (x: number, y: number) => { // torso front surface z at (x, y)
    const { A, D } = ring_(y / H);
    return zoff(y) + D * Math.max(0, 1 - Math.abs(x / A) ** E_TORSO) ** (1 / E_TORSO);
  };

  // legs (straight trousers with a break over the shoe) and shoes
  const legR = (r: number) => r * H * (0.6 + 0.5 * k);
  for (const sg of [-1, 1]) {
    const fz = fg.feet[sg < 0 ? 0 : 1]! * H;
    const x = sg * 0.056 * H * k;
    const knee: V3 = [x + sg * 0.004 * H, 0.27 * H, 0.012 * H + fz * 0.5];
    put(tube([
      { c: [x, 0.5 * H, 0], rx: legR(0.062), rz: legR(0.06) },
      { c: lerp([x, 0.5 * H, 0], knee, 0.45), rx: legR(0.056), rz: legR(0.054) },
      { c: knee, rx: legR(0.047), rz: legR(0.047) },
      { c: lerp(knee, [x + sg * 0.008 * H, 0.06 * H, fz], 0.55), rx: legR(0.047), rz: legR(0.046) },
      { c: [x + sg * 0.008 * H, 0.075 * H, fz + 0.002 * H], rx: legR(0.05), rz: legR(0.05) },
      { c: [x + sg * 0.008 * H, 0.04 * H, fz + 0.004 * H], rx: legR(0.049), rz: legR(0.054) },
    ], [1, 0, 0], 14, 2, 0.6, 0));
    const sx = x + sg * 0.01 * H;
    const shoe = (t: number, rx: number, rz: number): Sec => ({ c: [sx + sg * t * 0.008 * H, rz * H, fz - 0.04 * H + t * 0.15 * H], rx: rx * H, rz: rz * H });
    put(tube([shoe(0, 0.025, 0.02), shoe(0.3, 0.03, 0.023), shoe(0.65, 0.031, 0.019), shoe(1, 0.022, 0.013)], [1, 0, 0], 12, 2.2, 0.6, 0.7));
  }

  // jacket torso
  put(tube(TORSO.map(([yf]) => {
    const { A, D } = ring_(yf);
    return { c: [0, yf * H, zoff(yf * H)], rx: A, rz: D };
  }), [1, 0, 0], 26, E_TORSO, 0, 0.3));
  // jacket relief: placket, five buttons, chest pockets + flaps, lower pockets + flaps
  const patch = (x0: number, x1: number, y0_: number, y1: number, t: number) => {
    const xs = [x0, (x0 + x1) / 2, x1];
    const pt = (x: number, y: number, o: number): V3 => W([x, y, front(x, y) + o]);
    for (let i = 0; i < 2; i++) {
      const [xa, xb] = [xs[i]!, xs[i + 1]!];
      const out = sub(W([0, 0, 1]), W([0, 0, 0]));
      quadOut(buf, pt(xa, y0_, t), pt(xb, y0_, t), pt(xb, y1, t), pt(xa, y1, t), out);
      quadOut(buf, pt(xa, y1, -0.005), pt(xb, y1, -0.005), pt(xb, y1, t), pt(xa, y1, t), sub(W([0, 1, 0]), W([0, 0, 0])));
      quadOut(buf, pt(xa, y0_, -0.005), pt(xb, y0_, -0.005), pt(xb, y0_, t), pt(xa, y0_, t), sub(W([0, -1, 0]), W([0, 0, 0])));
    }
    for (const [x, sgn] of [[x0, -1], [x1, 1]] as const) quadOut(buf, pt(x, y0_, -0.005), pt(x, y1, -0.005), pt(x, y1, t), pt(x, y0_, t), sub(W([sgn, 0, 0]), W([0, 0, 0])));
  };
  buf.color = tint([0, 1, 0], [0, 0, 1]);
  patch(-0.007 * H, 0.007 * H, 0.44 * H, 0.82 * H, 0.0025 * H); // placket
  for (const sg of [-1, 1]) {
    const [c0, c1] = sg > 0 ? [0.022, 0.07] : [-0.07, -0.022];
    patch(c0 * k * H, c1 * k * H, 0.675 * H, 0.728 * H, 0.003 * H); // chest pocket
    patch((c0 - 0.003 * sg) * k * H, (c1 + 0.003 * sg) * k * H, 0.722 * H, 0.742 * H, 0.0055 * H); // its flap
    const [l0, l1] = sg > 0 ? [0.028, 0.09] : [-0.09, -0.028];
    patch(l0 * k * H, l1 * k * H, 0.465 * H, 0.535 * H, 0.003 * H); // lower pocket
    patch((l0 - 0.003 * sg) * k * H, (l1 + 0.003 * sg) * k * H, 0.53 * H, 0.552 * H, 0.0055 * H); // its flap
  }
  for (let i = 0; i < 5; i++) {
    const y = (0.795 - i * 0.068) * H;
    const z = front(0, y) + 0.002 * H;
    put(tube([{ c: [0, y, z], rx: 0.0085 * H, rz: 0.0085 * H }, { c: [0, y, z + 0.005 * H], rx: 0.0085 * H, rz: 0.0085 * H }], [1, 0, 0], 8, 2, 0, 0.5));
  }
  // stand collar, neck
  const zc = zoff(0.83 * H);
  put(tube([{ c: [0, 0.82 * H, zc], rx: 0.047 * H * Math.max(1, k * 0.95), rz: 0.044 * H }, { c: [0, 0.858 * H, zc + 0.003 * H], rx: 0.044 * H * Math.max(1, k * 0.95), rz: 0.042 * H }], [1, 0, 0], 16, 2, 0, 0));
  const hc: V3 = [0, 0.931 * H, zoff(0.931 * H) + 0.006 * H];
  put(tube([{ c: [0, 0.84 * H, zc], rx: 0.035 * H * Math.max(1, k * 0.9), rz: 0.034 * H }, { c: lerp([0, 0.84 * H, zc], hc, 0.75), rx: 0.03 * H, rz: 0.031 * H }], [1, 0, 0], 12, 2, 0, 0.5));

  // head
  const hh = 0.067 * H;
  const [hw, hd] = [fg.hw * H, 0.061 * H];
  const G = (x: number, y: number, z: number, cx: number, cy: number, cz: number, sx: number, sy: number, sz: number) =>
    Math.exp(-(((x - cx) / sx) ** 2) - ((y - cy) / sy) ** 2 - ((z - cz) / sz) ** 2);
  const [cp, sp, cy_, sy_] = [Math.cos(fg.pitch), Math.sin(fg.pitch), Math.cos(fg.yaw), Math.sin(fg.yaw)];
  const head = (q: V3): V3 => { // head-local (x right, y up, z forward) → figure local
    const [y1, z1] = [q[1] * cp + q[2] * sp, -q[1] * sp + q[2] * cp];
    return [hc[0] + q[0] * cy_ + z1 * sy_, hc[1] + y1, hc[2] - q[0] * sy_ + z1 * cy_];
  };
  const [R, C] = [28, 36];
  const rows: V3[][] = [];
  for (let i = 0; i <= R; i++) {
    const lat = -Math.PI / 2 + (Math.PI * i) / R;
    rows.push(Array.from({ length: C }, (_, j) => {
      const ph = (2 * Math.PI * j) / C;
      const [x, y, z] = [Math.cos(lat) * Math.sin(ph), Math.sin(lat), Math.cos(lat) * Math.cos(ph)];
      const ax = Math.abs(x);
      const ear = G(ax, y, z, 0.97, -0.02, -0.08, 0.1, 0.22, 0.17);
      let r = 1
        + G(x, y, z, 0, 0.1, 0.99, 0.07, 0.12, 0.2) * 0.1 + G(x, y, z, 0, -0.12, 0.99, 0.08, 0.13, 0.2) * 0.22 // nose bridge
        + G(x, y, z, 0, -0.3, 0.95, 0.1, 0.08, 0.2) * 0.3 + G(ax, y, z, 0.1, -0.34, 0.92, 0.07, 0.05, 0.15) * 0.12 // tip, wings
        + G(ax, y, z, 0.3, 0.25, 0.92, 0.2, 0.08, 0.2) * 0.09 // brow
        - G(ax, y, z, 0.31, 0.07, 0.95, 0.11, 0.075, 0.2) * 0.15 // eye sockets
        + G(ax, y, z, 0.31, 0.06, 0.97, 0.05, 0.035, 0.2) * 0.05 // eyeballs
        + G(ax, y, z, 0.55, -0.15, 0.8, 0.18, 0.2, 0.25) * (0.06 + fg.smile * 0.06) // cheekbones
        + G(ax, y, z, 0.38, -0.4, 0.86, 0.12, 0.1, 0.2) * fg.smile * 0.1 // smiling cheeks
        - G(ax, y, z, 0.5, -0.42, 0.75, 0.15, 0.15, 0.2) * 0.06 * (1 - fg.smile) // hollow cheeks
        - G(x, y, z, 0, -0.52 + fg.smile * 0.25 * x * x, 0.87, 0.24 + fg.smile * 0.08, 0.04, 0.2) * 0.07 // mouth line
        + G(x, y, z, 0, -0.46, 0.88, 0.16, 0.04, 0.2) * 0.035 + G(x, y, z, 0, -0.58, 0.86, 0.15, 0.04, 0.2) * 0.035 // lips
        + G(x, y, z, 0, -0.8, 0.6, 0.25, 0.15, 0.3) * 0.12 // chin
        + ear * 0.2
        + G(x, y, z, 0, -0.38, 0.93, 0.22, 0.045, 0.2) * 0.06 * fg.hair; // moustache
      r += fg.hair * (1 - ear) * (sstep(0.4, -0.05, z) * sstep(-0.35, 0, y) * 0.07 + sstep(0.4, 0.8, y) * sstep(0.65, 0.25, z) * 0.04); // receding hair
      const jaw = 1 - 0.25 * Math.max(0, -y) ** 1.3;
      const nape = z < 0 ? 1 - 0.2 * Math.max(0, -y) : 1;
      return head([x * r * hw * jaw, y * r * hh, z * r * hd * nape]);
    }));
  }
  put(rows);
  if (fg.goatee) put(tube([
    { c: head([0, -0.83 * hh, 0.62 * hd]), rx: 0.17 * hw, rz: 0.1 * hw },
    { c: head([0, -1.05 * hh, 0.64 * hd]), rx: 0.13 * hw, rz: 0.08 * hw },
    { c: head([0, -1.3 * hh, 0.58 * hd]), rx: 0.05 * hw, rz: 0.04 * hw },
  ], [1, 0, 0], 8, 2, 0, 0.8));

  // arms: two-bone reach to the wrist, sleeve with a cuff, the hand (palm, thumb) beyond
  const [L1, L2, LH] = [0.18 * H, 0.16 * H, 0.1 * H];
  for (const sg of [1, -1]) {
    const arm = sg > 0 ? fg.armR : fg.armL;
    const S: V3 = [sg * 0.104 * H * k, 0.768 * H, zoff(0.768 * H)];
    let E: V3, Wr: V3, hd_: V3, side: V3;
    if (!arm) { // hanging, slightly forward at the wrist
      E = add(S, [sg * 0.012 * H, -L1, -0.012 * H]);
      Wr = add(E, [sg * 0.004 * H, -L2 * 0.99, 0.025 * H]);
      hd_ = unit([0, -1, 0.12]);
      side = [0, 0, 1];
    } else {
      const tip = local(arm.hand);
      const dir = unit(arm.dir ? ldir(arm.dir) : sub(tip, S));
      const T = add(tip, dir, -LH);
      const dv = sub(T, S);
      const dl = Math.min(len(dv), (L1 + L2) * 0.995);
      const dn = unit(dv);
      const x = (L1 * L1 - L2 * L2 + dl * dl) / (2 * dl);
      const h = Math.sqrt(Math.max(0, L1 * L1 - x * x));
      const pole: V3 = [sg * 0.3, -1, -0.25];
      const pn = unit(sub(pole, [dn[0] * dot(pole, dn), dn[1] * dot(pole, dn), dn[2] * dot(pole, dn)]));
      E = add(add(S, dn, x), pn, h);
      Wr = add(S, dn, dl);
      hd_ = dir;
      side = ldir(arm.side);
    }
    put(tube([
      { c: S, rx: 0.052 * H, rz: 0.05 * H },
      { c: lerp(S, E, 0.5), rx: 0.047 * H, rz: 0.045 * H },
      { c: E, rx: 0.042 * H, rz: 0.041 * H },
      { c: lerp(E, Wr, 0.55), rx: 0.039 * H, rz: 0.038 * H },
      { c: lerp(E, Wr, 0.9), rx: 0.037 * H, rz: 0.037 * H },
      { c: Wr, rx: 0.033 * H, rz: 0.033 * H },
    ], [0, 0, 1], 12, 2, 0.9, 0));
    const hp = (t: number) => add(Wr, hd_, t * LH - 0.015 * H);
    put(tube([
      { c: hp(0), rx: 0.021 * H, rz: 0.013 * H }, { c: hp(0.4), rx: 0.03 * H, rz: 0.016 * H },
      { c: hp(0.72), rx: 0.029 * H, rz: 0.014 * H }, { c: hp(1), rx: 0.018 * H, rz: 0.01 * H },
    ], side, 10, 2.2, 0.3, 0.8));
    const up = unit(sub(side, [hd_[0] * dot(side, hd_), hd_[1] * dot(side, hd_), hd_[2] * dot(side, hd_)]));
    put(tube([
      { c: add(hp(0.2), up, 0.02 * H), rx: 0.009 * H, rz: 0.009 * H },
      { c: add(hp(0.62), up, 0.03 * H), rx: 0.008 * H, rz: 0.008 * H },
    ], [1, 0, 0], 6, 2, 0.5, 0.8)); // thumb along the top edge
  }
}

// ── the raised bronze inscription ──
/** `text` as raised boxes on the plane w = wFace (facing −w), centred at (aC, yC), cap height capH, at most maxW wide. */
function letters(buf: Buf, f: Fr, text: string, aC: number, yC: number, wFace: number, capH: number, maxW: number) {
  if (typeof OffscreenCanvas === 'undefined') return;
  const px = 44;
  const font = `${px}px "Times New Roman", Times, Georgia, serif`;
  const probe = new OffscreenCanvas(8, 8).getContext('2d');
  if (!probe) return;
  probe.font = font;
  const cw = Math.ceil(probe.measureText(text).width) + 8;
  const ch = Math.ceil(px * 1.6);
  const c = new OffscreenCanvas(cw, ch);
  const g = c.getContext('2d', { willReadFrequently: true });
  if (!g) return;
  g.font = font;
  g.fillStyle = '#fff';
  const base = Math.round(px * 1.3);
  g.fillText(text, 4, base);
  const data = g.getImageData(0, 0, cw, ch).data;
  const capPx = px * 0.662; // Times capital height / em
  const sy = capH / capPx;
  const sx = Math.min(sy, maxW / cw);
  const rects: { x0: number; x1: number; y0: number; y1: number }[] = [];
  let open = new Map<string, { x0: number; x1: number; y0: number }>();
  for (let y = 0; y <= ch; y++) {
    const next = new Map<string, { x0: number; x1: number; y0: number }>();
    if (y < ch) {
      for (let x = 0; x < cw;) {
        if (data[(y * cw + x) * 4 + 3]! < 120) { x++; continue; }
        const x0 = x;
        while (x < cw && data[(y * cw + x) * 4 + 3]! >= 120) x++;
        const key = `${x0}_${x}`;
        next.set(key, open.get(key) ?? { x0, x1: x, y0: y });
      }
    }
    for (const [key, o] of open) if (!next.has(key)) rects.push({ ...o, y1: y });
    open = next;
  }
  const yMid = base - capPx / 2;
  for (const r of rects) {
    const [a0, a1] = [aC - (r.x1 - cw / 2) * sx, aC - (r.x0 - cw / 2) * sx];
    fbox(buf, f, a0, a1, wFace - 0.012, wFace + 0.002, yC - (r.y1 - yMid) * sy, yC - (r.y0 - yMid) * sy);
  }
}

// ── garden ──
/** A park tree (the instanced platane, squat proportions) with blossoms (octahedra) over the crown's upper surface:
 *  frangipani = small, pink-white; phượng = wide, red-orange. ponytail: one tree mesh, real species need their own prop. */
function bloomTree(s: Sink, f: Fr, trees: number[], a: number, w: number, g: number, sx: number, sy: number, colours: string[], n: number, size: number) {
  const [x, , z] = P(f, a, 0, w);
  pushBox(trees, x, g - 0.2, z, hash(a * 3 + w) * Math.PI * 2, sx, sy, sx);
  const sh = treeShape(1);
  const [cy, cr, ch] = [g - 0.2 + sh.crownY * sy, sh.crownRadius * sx, (sh.crownHeight / 2) * sy];
  const bloom = s.buf('masonry', 'near');
  for (let q = 0; q < n; q++) {
    const u = hash(q * 1.31 + a) * Math.PI * 2;
    const v = 0.15 + hash(q * 2.17 + w) * 0.85; // elevation over the crown: the top and the sides
    const r = 1.0 + hash(q * 0.7) * 0.12;
    const c = P(f, a + Math.cos(u) * Math.cos(v) * cr * r, cy + Math.sin(v) * ch * r, w + Math.sin(u) * Math.cos(v) * cr * r);
    bloom.color = rgb(colours[q % colours.length]!);
    for (let k = 0; k < 2; k++) gem(bloom, add(c, [(hash(q + k * 5) - 0.5) * size * 2, (hash(q * 3 + k) - 0.5) * size, (hash(q * 7 + k) - 0.5) * size * 2]), size);
  }
}

function planter(s: Sink, f: Fr, a: number, w: number, g: number) {
  const st = s.buf('masonry');
  st.color = rgb('#ecebe6');
  lathe(st, f, a, w, [[0.3, g], [0.3, g + 0.1], [0.17, g + 0.14], [0.14, g + 0.42], [0.28, g + 0.5]], 14);
  lathe(st, f, a, w, [[0.24, g + 0.48], [0.48, g + 0.62], [0.6, g + 0.86], [0.62, g + 0.93], [0.56, g + 0.93]], 16);
  st.color = rgb('#4a7a36');
  lathe(st, f, a, w, [[0.56, g + 0.9], [0.52, g + 1.12], [0.3, g + 1.3], [0, g + 1.36]], 9);
  const fl = s.buf('masonry', 'near');
  fl.color = rgb('#f2d25a');
  for (let q = 0; q < 8; q++) {
    const u = (q * Math.PI) / 4;
    gem(fl, P(f, a + Math.cos(u) * 0.38, g + 1.2, w + Math.sin(u) * 0.38), 0.05);
  }
  s.prism([ring(f, a, w, 0.62, 0, 8).flatMap((p) => [p[0], p[2]])], g, g + 0.93);
}

const FLOWERS = ['#f07a1e', '#d8283a', '#e85a8c', '#c8287a', '#f2b630', '#f07a1e', '#d8283a'];

export const bacHoBacTon = (_chunk: ChunkData, ctx: BuildCtx): BuildOut => {
  const [cx, cz] = STATUE;
  const g = ctx.height(cx, cz);
  const s = new Sink();
  const f = frameAt(cx, cz, 0, -1); // a = north, w = east: the front (−w) looks west at the bridge
  // plaza: a paved disc, links to the island loop path west (bridge side) and east
  const pave = s.buf('pave');
  const disc = ring(f, 0, 0, 6.6, g + 0.05, 28);
  const uvOf = (p: V3) => [p[0] / 2, p[2] / 2];
  for (let i = 0; i < disc.length; i++) { // uv in 2 m tiles over world x / z (cap() would stretch the pavers radially)
    const [p0, p1, p2] = [P(f, 0, g + 0.05, 0), disc[i]!, disc[(i + 1) % disc.length]!];
    triOut(pave, p0, p1, p2, UP, [...uvOf(p0), ...uvOf(p1), ...uvOf(p2)]);
  }
  for (const [ta, tw, l] of [[-14, -10, 17.2], [3, 10, 10.5]] as const) {
    const [ua, uw] = [ta / Math.hypot(ta, tw), tw / Math.hypot(ta, tw)];
    const at = (t: number, o: number) => P(f, ua * t - uw * o, g + 0.045, uw * t + ua * o);
    quadOut(pave, at(6, -1.3), at(l, -1.3), at(l, 1.3), at(6, 1.3), UP, 0, 0, 2.6, l - 6);
  }
  // flower bed: stone kerb, green ground, zinnia clumps with coloured heads, red canna front right
  const st = s.buf('masonry');
  st.color = rgb('#bdb8ae');
  lathe(st, f, 0, 0, [[4.5, g + 0.03], [4.5, g + 0.24], [4.3, g + 0.24], [4.3, g + 0.16]], 32);
  st.color = rgb('#4c6b33');
  cap(st, ring(f, 0, 0, 4.32, g + 0.2, 32), UP);
  const heads = s.buf('masonry', 'near');
  for (let a = -4.2; a <= 4.2; a += 0.5) {
    for (let w = -4.2; w <= 4.2; w += 0.5) {
      const [ja, jw] = [a + (hash(a * 3.1 + w) - 0.5) * 0.3, w + (hash(w * 2.7 - a) - 0.5) * 0.3];
      if (Math.hypot(ja, jw) > 4.05 || (Math.abs(ja) < 2.5 && Math.abs(jw) < 1.15)) continue;
      const k = 0.8 + hash(ja * 1.7 + jw * 0.3) * 0.45;
      st.color = rgb(hash(ja + jw * 5) < 0.5 ? '#4f7a36' : '#5c8a3c');
      lathe(st, f, ja, jw, [[0.28 * k, g + 0.2], [0.22 * k, g + 0.27], [0, g + 0.2 + 0.14 * k]], 6);
      heads.color = rgb(FLOWERS[Math.floor(hash(ja * 7 + jw * 3) * FLOWERS.length)]!);
      for (let q = 0; q < 2; q++) {
        const u = hash(ja + q * 11) * Math.PI * 2;
        const r = 0.05 + hash(jw + q * 7) * 0.16;
        gem(heads, P(f, ja + Math.cos(u) * r * k, g + 0.3 + hash(q + ja) * 0.08, jw + Math.sin(u) * r * k), 0.045);
      }
    }
  }
  const canna = s.buf('masonry');
  for (let q = 0; q < 16; q++) { // red canna / cordyline blades, both faces
    const [ba, bw] = [-2.7 + (hash(q * 3.3) - 0.5) * 1.2, -2.6 + (hash(q * 5.1) - 0.5) * 1.0];
    const u = hash(q * 1.9) * Math.PI * 2;
    const [da, dw] = [Math.cos(u) * 0.35, Math.sin(u) * 0.35];
    const hgt = 0.8 + hash(q * 2.3) * 0.5;
    const base = P(f, ba, g + 0.2, bw);
    const tip = P(f, ba + da, g + 0.2 + hgt, bw + dw);
    const [l, r] = [P(f, ba + da * 0.45 - dw * 0.18, g + 0.2 + hgt * 0.5, bw + dw * 0.45 + da * 0.18), P(f, ba + da * 0.45 + dw * 0.18, g + 0.2 + hgt * 0.5, bw + dw * 0.45 - da * 0.18)];
    canna.color = rgb(q % 4 ? '#c8202c' : '#3f6a2e');
    const n = cross(sub(tip, base), sub(r, l));
    quadOut(canna, base, l, tip, r, n);
    quadOut(canna, base, r, tip, l, [-n[0], -n[1], -n[2]]);
  }
  // granite plinth: step, block (narrow left part 2 cm proud, groove, wide right part), top slab
  const gr = s.buf('masonry');
  gr.color = rgb('#8a8c8d');
  fbox(gr, f, -2.35, 2.35, -1.0, 1.0, g, g + 0.1);
  gr.color = rgb('#7d7f81');
  fbox(gr, f, -2.1, 0.33, -0.75, 0.75, g + 0.1, g + 1.45); // right part (inscription)
  gr.color = rgb('#67696b');
  fbox(gr, f, 0.33, 0.45, -0.69, 0.75, g + 0.1, g + 1.45); // groove
  gr.color = rgb('#838587');
  fbox(gr, f, 0.45, 2.1, -0.77, 0.75, g + 0.1, g + 1.45); // left part
  gr.color = rgb('#7a7b7d');
  fbox(gr, f, -1.95, 1.95, -0.64, 0.64, g + 1.45, g + 1.55); // top slab
  s.prism([[P(f, -2.1, 0, -0.77), P(f, 2.1, 0, -0.77), P(f, 2.1, 0, 0.75), P(f, -2.1, 0, 0.75)].flatMap((p) => [p[0], p[2]])], g, g + 1.55);
  s.prism([[P(f, -2.35, 0, -1), P(f, 2.35, 0, -1), P(f, 2.35, 0, 1), P(f, -2.35, 0, 1)].flatMap((p) => [p[0], p[2]])], g, g + 0.1);
  const lt = s.buf('metal', 'near');
  lt.color = LETTER;
  letters(lt, f, 'BÁC HỒ – BÁC TÔN', -0.88, g + 1.07, -0.75, 0.13, 1.7);
  // the figures (y0 = slab top); the clasp between them, a little towards the viewer
  const y0 = g + 1.55;
  const C: V3 = [-0.03, 1.74, -0.36];
  const [hoF, tonF] = [unit([-1, 0, -0.06]), unit([1, 0, -0.42])]; // Hồ: near profile (the photo sees a little of his back)
  figure(s, f, y0, {
    a: 0.55, w: 0.02, fa: hoF[0], fw: hoF[2], H: 3.1, k: 0.9, d: 0.94, lean: 0.06,
    hw: 0.046, hair: 1, smile: 0, goatee: true, pitch: -0.14, yaw: 0, feet: [-0.03, 0.04],
    armR: { hand: add(C, [-0.09, -0.01, -0.025]), dir: unit([-1, -0.15, -0.15]), side: [0, 1, 0] },
    armL: null,
  });
  figure(s, f, y0, {
    a: -0.6, w: -0.02, fa: tonF[0], fw: tonF[2], H: 2.85, k: 1.1, d: 1.08, lean: 0.04,
    hw: 0.053, hair: 0, smile: 1, goatee: false, pitch: 0.12, yaw: 0.1, feet: [0.02, -0.01],
    armR: { hand: add(C, [0.09, -0.02, 0.035]), dir: unit([1, -0.1, -0.3]), side: [0, 1, 0] },
    armL: { hand: add(C, [0.1, 0.06, -0.08]), dir: unit([1, -0.3, 0.5]), side: unit([-0.5, 0, 1]) },
  });
  // white planters left / right behind, frangipani (left), flame tree (right)
  for (const sa of [-1, 1]) planter(s, f, sa * 4.6, 2.4, g + 0.05);
  const trees: number[] = [];
  bloomTree(s, f, trees, 6.6, 0.6, g, 0.55, 0.42, ['#f7ecef', '#f3d2dc', '#e88fb0'], 70, 0.09);
  bloomTree(s, f, trees, 8.2, 5.4, g, 0.5, 0.4, ['#f7ecef', '#f3d2dc', '#e88fb0'], 60, 0.09);
  bloomTree(s, f, trees, -7.6, 5.6, g, 0.95, 0.55, ['#d8352a', '#e0561e', '#c8281f'], 220, 0.2);
  return { ...s.out(), instances: [{ kind: 'tree', matrices: new Float32Array(trees) }] };
};
