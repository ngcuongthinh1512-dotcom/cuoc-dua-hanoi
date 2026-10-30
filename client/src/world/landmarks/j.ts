// Leg 3 landmark details, part 5: BOZAR (Palais des Beaux-Arts, Victor Horta 1928, OSM relation/3299877) drawn from the outline
// itself instead of BuildingBuilder's brick body. Reference photo = the north-west corner (Rue Ravenstein × Rue Baron Horta):
// grey limestone ashlar (courses 1.25 m, blocks 2.5 m, soot under the cornices), the rounded corner bay (the OSM arc: centre C,
// r 8.5 m) with three iron-grilled doorways (amber glass in the middle one), a curved balcony with an Art-Deco iron railing, three
// storeys of narrow vertical windows between engaged columns, a heavy cornice, a crenellated stepped parapet and a drum behind;
// two projecting pavilions (the OSM jogs beside the arc) with stepped tops, the café front under the west one; the wings carry
// stepped pilasters + tall window strips and a merlon parapet (Baron Horta side) or stepped window surrounds, banners and an
// iron roof balustrade (Ravenstein side); flags on every top. Levels count from the corner's terrain (the site drops ≈ 9 m from
// Rue Royale to Rue Ravenstein, so the Rue Royale side is only ≈ 10 m high, as in reality). Flat roofs; collider = the outline
// prism (details are never solid, SPEC §5.9).
import { landmarks as L } from '../../config.ts';
import type { LandmarkId, XZ } from '../../geo/chunkData.ts';
import { triangulate, type V3 } from '../geom.ts';
import { fbox, type Fr, P, rgb, UP } from './b.ts';
import { lathe } from './c.ts';
import type { DetailFn } from './index.ts';
import { quadOut, triOut } from './kit.ts';
import { partRings, Sink } from './parts.ts';

type Buf = Parameters<typeof quadOut>[0];
const D2R = Math.PI / 180;
const hash = (n: number) => {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
};

const TONES = ['#9b9a93', '#a29f97', '#949289', '#a8a69e', '#8e8d87', '#9f9c92'];
const SOOT = '#6b6a65';
const TRIM = '#b0aea5'; // dressed stone: cornices, frames, parapets
const PLINTH = '#6f6e69';
const IRON = '#1b1d1f';
const GLASS = '#232b31';
const AMBER = '#f2a93a';
const WARM = '#e9a85c';
const ROOF = '#75746e';
const BANNER = ['#c8325a', '#d9486b', '#b4264c'];
const [COURSE, BLOCK] = [1.25, 2.5];
const [H_WING, H_TOWER, H_BAY] = [18, 21, 24]; // m above the corner terrain

// the corner, from the OSM outline: the arc (least-squares circle through its 5 vertices) and the two pavilion faces beside it
const C: [number, number] = [496.85, 281.5];
const R_OSM = 8.53;
const [TH0, TH1] = [-137.5 * D2R, -83 * D2R]; // atan2(z, x): from the Ravenstein end to the Baron Horta end
const RB = R_OSM + 0.27;
const TOWERS: { a: [number, number]; b: [number, number]; cafe: boolean }[] = [
  { a: [497.4, 273.0], b: [505.0, 275.4], cafe: false }, // north pavilion, Rue Baron Horta
  { a: [490.9, 275.4], b: [486.8, 282.4], cafe: true }, // west pavilion, Rue Ravenstein (BOZAR café)
];

// ── edge frames: a = along the edge from its start, o = outward offset from the wall plane ──

interface Edge {
  f: Fr;
  len: number;
  out: V3;
  flip: 1 | -1;
  t0: number; // tan(half turn) at the start / end: offset strips extend by o·t to meet the neighbours' (convex +, concave −)
  t1: number;
}
const inRing = (x: number, z: number, r: XZ) => {
  let inside = false;
  for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
    if (r[i + 1]! > z !== r[j + 1]! > z && x < ((r[j]! - r[i]!) * (z - r[i + 1]!)) / (r[j + 1]! - r[i + 1]!) + r[i]!) inside = !inside;
  }
  return inside;
};
function mkEdge(ax: number, az: number, bx: number, bz: number, inside: (x: number, z: number) => boolean): Edge {
  const len = Math.hypot(bx - ax, bz - az);
  const [ux, uz] = [(bx - ax) / len, (bz - az) / len];
  const [wx, wz] = [-uz, ux];
  const flip = inside((ax + bx) / 2 + wx * 0.3, (az + bz) / 2 + wz * 0.3) ? -1 : 1;
  return { f: { area: 0, cx: ax, cz: az, ux, uz, a: len, b: 0 }, len, out: [wx * flip, 0, wz * flip], flip, t0: 0, t1: 0 };
}
function ringEdges(r: XZ, inside: (x: number, z: number) => boolean): Edge[] {
  const es: Edge[] = [];
  for (let i = 0, n = r.length; i < n; i += 2) {
    if (Math.hypot(r[(i + 2) % n]! - r[i]!, r[(i + 3) % n]! - r[i + 1]!) < 0.05) continue;
    es.push(mkEdge(r[i]!, r[i + 1]!, r[(i + 2) % n]!, r[(i + 3) % n]!, inside));
  }
  for (let k = 0; k < es.length; k++) {
    const [e, g] = [es[k]!, es[(k + 1) % es.length]!];
    const dot = e.f.ux * g.f.ux + e.f.uz * g.f.uz;
    const cross = e.f.ux * g.f.uz - e.f.uz * g.f.ux;
    const convex = g.f.ux * e.out[0] + g.f.uz * e.out[2] < 0;
    const t = Math.min(2.5, Math.tan(Math.abs(Math.atan2(cross, dot)) / 2)) * (convex ? 1 : -1);
    e.t1 = t;
    g.t0 = t;
  }
  return es;
}
const at = (e: Edge, d: number, y: number, o: number): V3 => P(e.f, d, y, e.flip * o);
const eq = (buf: Buf, e: Edge, d0: number, d1: number, y0: number, y1: number, o: number, n: V3 = e.out) =>
  quadOut(buf, at(e, d0, y0, o), at(e, d1, y0, o), at(e, d1, y1, o), at(e, d0, y1, o), n);
const ebox = (buf: Buf, e: Edge, d0: number, d1: number, o0: number, o1: number, y0: number, y1: number) =>
  fbox(buf, e.f, d0, d1, Math.min(e.flip * o0, e.flip * o1), Math.max(e.flip * o0, e.flip * o1), y0, y1);
/** Mitred strip along the whole edge between profile points (oa, ya) → (ob, yb). */
const strip = (buf: Buf, e: Edge, oa: number, ya: number, ob: number, yb: number, n: V3 = e.out) =>
  quadOut(buf, at(e, -oa * e.t0, ya, oa), at(e, e.len + oa * e.t1, ya, oa), at(e, e.len + ob * e.t1, yb, ob), at(e, -ob * e.t0, yb, ob), n);
/** Hollow frame of 4 bars (width w) around the opening d0..d1 × y0..y1. */
function frame(buf: Buf, e: Edge, d0: number, d1: number, y0: number, y1: number, o0: number, o1: number, w: number) {
  ebox(buf, e, d0 - w, d0, o0, o1, y0 - w, y1 + w);
  ebox(buf, e, d1, d1 + w, o0, o1, y0 - w, y1 + w);
  ebox(buf, e, d0, d1, o0, o1, y0 - w, y0);
  ebox(buf, e, d0, d1, o0, o1, y1, y1 + w);
}

// ── polar frame about the corner centre (the round bay) ──

const pp = (th: number, rho: number, y: number): V3 => [C[0] + rho * Math.cos(th), y, C[1] + rho * Math.sin(th)];
const rad = (th: number, dir = 1): V3 => [dir * Math.cos(th), 0, dir * Math.sin(th)];
const segsOf = (rho: number, th0: number, th1: number) => Math.max(2, Math.ceil((Math.abs(th1 - th0) * rho) / 0.6));
function band(buf: Buf, rho: number, th0: number, th1: number, y0: number, y1: number, dir = 1) {
  const n = segsOf(rho, th0, th1);
  const T = (k: number) => th0 + ((th1 - th0) * k) / n;
  for (let k = 0; k < n; k++) quadOut(buf, pp(T(k), rho, y0), pp(T(k + 1), rho, y0), pp(T(k + 1), rho, y1), pp(T(k), rho, y1), rad(T(k + 0.5), dir));
}
function slab(buf: Buf, rho0: number, rho1: number, th0: number, th1: number, y: number, dir: number) {
  const n = segsOf(rho1, th0, th1);
  const T = (k: number) => th0 + ((th1 - th0) * k) / n;
  for (let k = 0; k < n; k++) quadOut(buf, pp(T(k), rho0, y), pp(T(k + 1), rho0, y), pp(T(k + 1), rho1, y), pp(T(k), rho1, y), [0, dir, 0]);
}
function pbox(buf: Buf, rho0: number, rho1: number, th0: number, th1: number, y0: number, y1: number) {
  band(buf, rho1, th0, th1, y0, y1, 1);
  band(buf, rho0, th0, th1, y0, y1, -1);
  slab(buf, rho0, rho1, th0, th1, y1, 1);
  slab(buf, rho0, rho1, th0, th1, y0, -1);
  for (const [th, sg] of [[th0, -1], [th1, 1]] as const) {
    quadOut(buf, pp(th, rho0, y0), pp(th, rho1, y0), pp(th, rho1, y1), pp(th, rho0, y1), [-sg * -Math.sin(th), 0, -sg * Math.cos(th)]);
  }
}
/** Frame at (th, rho): a along the tangent (+th), w radial outward. */
const polarFr = (th: number, rho: number): Fr => ({ area: 0, cx: C[0] + rho * Math.cos(th), cz: C[1] + rho * Math.sin(th), ux: -Math.sin(th), uz: Math.cos(th), a: 0, b: 0 });

// ── flags ──

type FlagKind = 'eu' | 'be' | 'white' | 'red' | 'yellow';
const FLAGS: FlagKind[] = ['eu', 'be', 'white', 'eu', 'red', 'be', 'eu', 'yellow', 'be', 'white', 'eu', 'be'];
/** 7 m pole at the frame origin with a 1.6 × 1.05 m flag along +a. */
function flag(s: Sink, f: Fr, y0: number, kind: FlagKind) {
  const pole = s.buf('metal');
  pole.color = rgb('#c6c9cc');
  fbox(pole, f, -0.05, 0.05, -0.05, 0.05, y0, y0 + 7);
  fbox(s.buf('gold'), f, -0.1, 0.1, -0.1, 0.1, y0 + 7, y0 + 7.2);
  const cloth = s.buf('masonry');
  const [ya, yb] = [y0 + 5.7, y0 + 6.75];
  const part = (hex: string, a0: number, a1: number) => {
    cloth.color = rgb(hex);
    fbox(cloth, f, a0, a1, -0.025, 0.025, ya, yb);
  };
  if (kind === 'be') {
    part('#161616', 0.08, 0.6);
    part('#f3c614', 0.6, 1.13);
    part('#d3202a', 1.13, 1.66);
  } else {
    part({ eu: '#0a3d91', white: '#f1efe8', red: '#c8202a', yellow: '#e8c22e' }[kind], 0.08, 1.66);
    if (kind === 'eu') for (let k = 0; k < 12; k++) fbox(s.buf('gold'), f, 0.87 + 0.3 * Math.cos((k * Math.PI) / 6) - 0.035, 0.87 + 0.3 * Math.cos((k * Math.PI) / 6) + 0.035, -0.03, 0.03, (ya + yb) / 2 + 0.3 * Math.sin((k * Math.PI) / 6) - 0.035, (ya + yb) / 2 + 0.3 * Math.sin((k * Math.PI) / 6) + 0.035);
  }
}

// ── the landmark ──

const bozar: DetailFn = (rec, _parts, ctx) => {
  const s = new Sink();
  const rings = partRings(rec);
  if (!rings) return s.out();
  const outer = rings[0]!;
  const holes = rings.slice(1);
  const inside = (x: number, z: number) => inRing(x, z, outer) && !holes.some((h) => inRing(x, z, h));
  const G0 = Math.min(...TOWERS.map((t) => ctx.height(t.a[0], t.a[1]))); // the corner's terrain: every level counts from it
  const Y = (v: number) => G0 + v;
  const TOP = Y(H_WING);
  const m = s.buf('masonry');
  const near = s.buf('masonry', 'near');
  const iron = s.buf('metal');
  const nearIron = s.buf('metal', 'near');
  const glow = s.buf('neon');
  const col = (hex: string) => { m.color = rgb(hex); };
  iron.color = rgb(IRON);
  nearIron.color = rgb(IRON);
  let flagNo = 0;
  const nextFlag = () => FLAGS[flagNo++ % FLAGS.length]!;

  /** Ashlar courses on an edge (u0 = perimeter distance at its start, so the blocks run on across edges). */
  const ashlar = (e: Edge, u0: number, yb: number, yt: number) => {
    near.color = rgb('#5e5d59');
    for (let k = Math.floor((yb - G0) / COURSE); ; k++) {
      const y0 = Math.max(yb, G0 + k * COURSE);
      const y1 = Math.min(yt, G0 + (k + 1) * COURSE);
      if (y0 >= yt) break;
      if (y1 <= y0) continue;
      const stag = k & 1 ? BLOCK / 2 : 0;
      const sootP = yt - y1 < 2 * COURSE ? 0.22 : 0.035;
      for (let b = Math.floor((u0 - stag) / BLOCK) * BLOCK + stag; b < u0 + e.len; b += BLOCK) {
        const [d0, d1] = [Math.max(0, b - u0), Math.min(e.len, b + BLOCK - u0)];
        if (d1 - d0 < 0.01) continue;
        const hv = hash(k * 131 + Math.round(b / BLOCK) * 7.3);
        col(hv < sootP ? SOOT : TONES[Math.floor(hash(hv * 977) * TONES.length)]!);
        eq(m, e, d0, d1, y0, y1, 0);
        if (b > u0 + 0.03) eq(near, e, b - u0 - 0.02, b - u0 + 0.02, y0, y1, 0.012);
      }
      if (y1 < yt - 0.03) eq(near, e, 0, e.len, y1 - 0.02, y1 + 0.02, 0.012);
    }
  };
  /** Heavy projecting cornice (stepped profile) with its top at y. */
  const cornice = (e: Edge, y: number) => {
    col(TRIM);
    const prof: [number, number][] = [[0, -1.4], [0.3, -1.1], [0.3, -0.85], [0.7, -0.55], [0.7, 0]];
    for (let k = 0; k + 1 < prof.length; k++) strip(m, e, prof[k]![0], y + prof[k]![1], prof[k + 1]![0], y + prof[k + 1]![1]);
    strip(m, e, 0, y, 0.7, y, UP);
  };
  /** Parapet on the cornice: merlons (Ravenstein style) or an iron balustrade with pedestals (Baron Horta style). */
  const parapet = (e: Edge, y: number, railing: boolean) => {
    if (railing) {
      col(TRIM);
      strip(m, e, 0.1, y, 0.7, y + 0.25, UP);
      strip(m, e, 0.7, y, 0.7, y + 0.25);
      for (let d = 0.6; d < e.len; d += 2.4) ebox(nearIron, e, d - 0.03, d + 0.03, 0.35, 0.41, y + 0.25, y + 1.15);
      for (const yr of [y + 0.55, y + 1.1]) ebox(iron, e, 0, e.len, 0.34, 0.42, yr, yr + 0.06);
      for (let d = 3.6; d < e.len - 1; d += 7.2) ebox(m, e, d - 0.35, d + 0.35, 0.05, 0.75, y, y + 1.4);
      return;
    }
    col(TRIM);
    strip(m, e, 0.7, y, 0.7, y + 0.6);
    strip(m, e, 0.15, y + 0.6, 0.7, y + 0.6, UP);
    strip(m, e, 0.15, y + 0.6, 0.15, y, [-e.out[0], 0, -e.out[2]]);
    for (let d = 1.2; d < e.len - 0.4; d += 2.4) {
      ebox(m, e, d - 0.6, d + 0.6, 0.12, 0.76, y + 0.6, y + 1.5);
      ebox(m, e, d - 0.35, d + 0.35, 0.12, 0.76, y + 1.5, y + 1.75);
      m.color = rgb(GLASS);
      eq(near, e, d - 0.16, d + 0.16, y + 0.85, y + 1.17, 0.77);
      col(TRIM);
    }
  };
  /** Window: dark glass, iron transoms, stepped stone surround (two nested frames). */
  const win = (e: Edge, c: number, hw: number, y0: number, y1: number, banner?: number) => {
    col(GLASS);
    eq(m, e, c - hw, c + hw, y0, y1, 0.03);
    for (let y = y0 + 1.5; y < y1 - 0.4; y += 1.5) eq(nearIron, e, c - hw, c + hw, y - 0.03, y + 0.03, 0.05);
    eq(nearIron, e, c - 0.03, c + 0.03, y0, y1, 0.05);
    if (banner !== undefined) {
      col(BANNER[banner % BANNER.length]!);
      eq(m, e, c - hw * 0.7, c + hw * 0.7, y0 + 0.3, y1 - 0.3, 0.04);
      col('#f3ebe2');
      eq(m, e, c - hw * 0.6, c + hw * 0.6, y1 - 1.0, y1 - 0.75, 0.045);
    }
    col(TRIM);
    frame(m, e, c - hw, c + hw, y0, y1, -0.05, 0.12, 0.28);
    frame(m, e, c - hw - 0.28, c + hw + 0.28, y0 - 0.28, y1 + 0.28, -0.05, 0.05, 0.18);
  };
  /** Ground-floor opening with a black wrought-iron grille in a square stone frame with a heavy lintel. */
  const grille = (e: Edge, c: number, hw: number, y0: number, y1: number, heavy = false) => {
    col(GLASS);
    eq(m, e, c - hw, c + hw, y0, y1, 0.03);
    for (let d = c - hw + 0.3; d < c + hw - 0.1; d += 0.3) eq(nearIron, e, d - 0.025, d + 0.025, y0, y1, 0.06);
    for (const y of [y0 + (y1 - y0) / 3, y0 + (2 * (y1 - y0)) / 3]) eq(nearIron, e, c - hw, c + hw, y - 0.04, y + 0.04, 0.065);
    eq(iron, e, c - hw, c + hw, y0, y0 + 0.08, 0.07);
    col(TRIM);
    const w = heavy ? 0.4 : 0.25;
    frame(m, e, c - hw, c + hw, y0, y1, -0.05, heavy ? 0.3 : 0.15, w);
    if (heavy) ebox(m, e, c - hw - 0.55, c + hw + 0.55, -0.05, 0.38, y1 + w, y1 + w + 0.45); // lintel
  };
  const pilaster = (e: Edge, d: number, y0: number, y1: number) => {
    col(TRIM);
    ebox(m, e, d - 0.55, d + 0.55, -0.05, 0.18, y0, y1);
    ebox(m, e, d - 0.4, d + 0.4, 0.18, 0.3, y0, y1 - 0.4);
    ebox(m, e, d - 0.25, d + 0.25, 0.3, 0.4, y0, y1 - 0.8);
  };
  /** One wing façade run: bays every ≈ 4.6 m; style A = Baron Horta (window strips between stepped pilasters), B = Ravenstein (stepped surrounds, banners). */
  const facade = (e: Edge, styleB: boolean) => {
    const n = Math.max(1, Math.round(e.len / 4.6));
    const pitch = e.len / n;
    const tAt = (d: number) => {
      const [x, , z] = at(e, d, 0, 0);
      return ctx.height(x, z);
    };
    for (let k = 0; k < n; k++) {
      const c = (k + 0.5) * pitch;
      const t = tAt(c);
      col(PLINTH);
      ebox(m, e, c - pitch / 2, c + pitch / 2, -0.05, 0.1, t - 0.6, t + 1.0);
      const hw = Math.min(1.2, pitch * 0.26);
      const seed = hash(e.f.cx * 1.7 + e.f.cz * 0.3 + k * 13);
      if (styleB) {
        const rows: [number, number][] = [[Y(6.5), Y(9.8)], [Y(11.5), Y(14.5)]];
        let first = Infinity;
        rows.forEach(([y0, y1], r) => {
          if (y0 < t + 0.8) return;
          first = Math.min(first, y0);
          win(e, c, hw, y0, y1, hash(seed * 31 + r) < 0.45 ? Math.floor(seed * 9) + r : undefined);
        });
        if (Y(15.6) > t + 0.8) win(e, c, 0.45, Y(15.6), Y(16.5));
        if (k > 0) for (const y of [Y(8.0), Y(12.8)]) if (y > t + 0.8) win(e, k * pitch, 0.4, y, y + 0.8);
        const gy1 = Math.min(t + 4.3, first - 0.5);
        if (gy1 - (t + 1.0) > 1.4) grille(e, c, Math.min(1.1, hw), t + 1.0, gy1);
      } else {
        const y0 = Math.max(Y(6.0), t + 1.6);
        const y1 = TOP - 2.4;
        if (y1 - y0 > 2) win(e, c, hw * 0.75, y0, y1);
        const gy1 = Math.min(t + 4.2, y0 - 0.6);
        if (gy1 - (t + 1.0) > 1.4) grille(e, c, Math.min(1.1, hw), t + 1.0, gy1);
      }
    }
    if (styleB) {
      col(TRIM);
      const ys = Y(10.4);
      if (ys > Math.max(tAt(0), tAt(e.len)) + 0.5) ebox(m, e, 0, e.len, -0.05, 0.3, ys, ys + 0.4); // string course between the floors
    } else {
      for (let k = 0; k <= n; k++) {
        const d = k * pitch;
        pilaster(e, d, tAt(Math.min(Math.max(d, 0.3), e.len - 0.3)) - 0.6, TOP - 1.4);
      }
    }
  };

  // ── outer ring: ashlar everywhere, cornice + parapet + façades on the wings; the corner edges are the bay / pavilions ──
  const es = ringEdges(outer, inside);
  const distC = (e: Edge) => Math.hypot(e.f.cx + (e.f.ux * e.len) / 2 - C[0], e.f.cz + (e.f.uz * e.len) / 2 - C[1]);
  const onArc = (e: Edge) => [0, e.len].every((d) => Math.abs(Math.hypot(e.f.cx + e.f.ux * d - C[0], e.f.cz + e.f.uz * d - C[1]) - R_OSM) < 0.4);
  const isTower = (e: Edge) => !onArc(e) && distC(e) < 9.3;
  const bottom = (e: Edge) => Math.min(ctx.height(e.f.cx, e.f.cz), ctx.height(e.f.cx + e.f.ux * e.len, e.f.cz + e.f.uz * e.len)) - 0.5;
  const ravensteinSide = (e: Edge) => -e.out[0] * 0.79 - e.out[2] * 0.62 > 0.8; // faces Rue Ravenstein (the west façade's normal)
  let u = 0;
  const wingEdges: Edge[] = [];
  for (const e of es) {
    if (onArc(e)) continue; // hidden inside the round bay
    const tower = isTower(e);
    ashlar(e, u, bottom(e), tower ? Y(H_TOWER) : TOP);
    u += e.len;
    if (tower || distC(e) < 10.5) continue;
    cornice(e, TOP);
    parapet(e, TOP, ravensteinSide(e));
    wingEdges.push(e);
  }
  // façade runs: consecutive wing edges merged while nearly collinear (turn < 8°, vertices ≤ 0.25 m off the chord)
  const runs: Edge[] = [];
  for (let i = 0; i < wingEdges.length; ) {
    const e0 = wingEdges[i]!;
    let j = i;
    let [bx, bz] = [e0.f.cx + e0.f.ux * e0.len, e0.f.cz + e0.f.uz * e0.len];
    while (j + 1 < wingEdges.length) {
      const g = wingEdges[j + 1]!;
      if (Math.abs(g.f.cx - bx) > 0.05 || Math.abs(g.f.cz - bz) > 0.05 || e0.f.ux * g.f.ux + e0.f.uz * g.f.uz < Math.cos(8 * D2R)) break;
      const [ex, ez] = [g.f.cx + g.f.ux * g.len, g.f.cz + g.f.uz * g.len];
      const L = Math.hypot(ex - e0.f.cx, ez - e0.f.cz);
      const dev = Math.abs((-(ez - e0.f.cz) * (bx - e0.f.cx) + (ex - e0.f.cx) * (bz - e0.f.cz)) / L);
      if (dev > 0.25) break;
      [bx, bz] = [ex, ez];
      j++;
    }
    runs.push(mkEdge(e0.f.cx, e0.f.cz, bx, bz, inside));
    i = j + 1;
  }
  for (const r of runs) if (r.len >= 3.5) facade(r, ravensteinSide(r));
  // flags along the Ravenstein wing parapet
  for (const r of runs) if (ravensteinSide(r) && r.len > 12) for (let k = 1; k <= 3; k++) flag(s, { ...r.f, cx: at(r, (r.len * k) / 4, 0, 0.3)[0], cz: at(r, (r.len * k) / 4, 0, 0.3)[2] }, TOP + 0.25, nextFlag());

  // ── courtyard walls (plain), flat roof, collider ──
  col('#8f8e88');
  for (const h of holes) for (const e of ringEdges(h, inside)) eq(m, e, 0, e.len, bottom(e), TOP, 0);
  col(ROOF);
  const idx = triangulate(outer, holes);
  const pts = rings.flat();
  for (let k = 0; k < idx.length; k += 3) {
    const [a, b, c] = [idx[k]!, idx[k + 1]!, idx[k + 2]!].map((i): V3 => [pts[2 * i]!, TOP, pts[2 * i + 1]!]) as [V3, V3, V3];
    triOut(m, a, b, c, UP);
  }
  s.prism(rings, ctx.minGround - 0.5, TOP);
  // the Henry Le Bœuf concert hall rising over the wings in the middle of the block (size eyeballed from aerial views):
  // the largest box along the Baron Horta axis around HALL that stays inside the outline, ashlar + a cornice + a stepped cap
  {
    const f: Fr = { area: 0, cx: 514, cz: 343, ux: -0.944, uz: -0.326, a: 0, b: 0 };
    let [ha, hb] = [26, 16];
    const fits = () => [[-ha, -hb], [ha, -hb], [ha, hb], [-ha, hb]].every(([a, w]) => {
      const p = P(f, a!, 0, w!);
      return inside(p[0], p[2]);
    });
    while (!fits() && hb > 6) [ha, hb] = [ha - 1, hb - 0.6];
    col(TONES[0]!);
    fbox(m, f, -ha, ha, -hb, hb, TOP - 0.5, TOP + 7.5);
    col(TRIM);
    fbox(m, f, -ha - 0.5, ha + 0.5, -hb - 0.5, hb + 0.5, TOP + 7.5, TOP + 8.3);
    col(TONES[2]!);
    fbox(m, f, -ha + 2, ha - 2, -hb + 2, hb - 2, TOP + 8.3, TOP + 9.6);
    fbox(m, f, -ha + 5, ha - 5, -hb + 5, hb - 5, TOP + 9.6, TOP + 10.8);
    col(TRIM);
    for (let a = -ha + 3; a < ha - 2; a += 5) for (const w of [-hb, hb]) fbox(m, f, a - 0.5, a + 0.5, w - 0.25, w + 0.25, TOP, TOP + 7.5); // pilaster strips
  }

  // ── the round bay ──
  const ARC = RB * (TH1 - TH0);
  const thAt = (a: number) => TH0 + a / RB; // arc length from the Ravenstein end → angle
  const mid = ARC / 2;
  // ashlar on the cylinder up to the cornice
  near.color = rgb('#5e5d59');
  for (let k = 0; G0 + k * COURSE < Y(20); k++) {
    const [y0, y1] = [G0 + k * COURSE - (k ? 0 : 0.6), Math.min(Y(20), G0 + (k + 1) * COURSE)];
    const stag = k & 1 ? BLOCK / 2 : 0;
    for (let b = -BLOCK + stag; b < ARC; b += BLOCK) {
      const [a0, a1] = [Math.max(0, b), Math.min(ARC, b + BLOCK)];
      if (a1 - a0 < 0.01) continue;
      const hv = hash(k * 57 + b * 3.1);
      col(hv < (Y(20) - y1 < 2 * COURSE ? 0.22 : 0.035) ? SOOT : TONES[Math.floor(hash(hv * 977) * TONES.length)]!);
      band(m, RB, thAt(a0), thAt(a1), y0, y1);
      if (b > 0.03) band(near, RB + 0.012, thAt(b - 0.02), thAt(b + 0.02), y0, y1);
    }
    band(near, RB + 0.012, TH0, TH1, y1 - 0.02, y1 + 0.02);
  }
  col(PLINTH);
  pbox(m, RB, RB + 0.12, TH0, TH1, G0 - 0.6, Y(1.0));
  // three doorways: iron grilles in square stone frames with heavy lintels; the middle one glows amber
  for (const [i, da] of [-2.65, 0, 2.65].entries()) {
    const c = mid + da;
    const hw = i === 1 ? 1.05 : 0.85;
    const [th0, th1] = [thAt(c - hw), thAt(c + hw)];
    col(GLASS);
    band(m, RB + 0.02, th0, th1, Y(1.0), Y(6.0));
    if (i === 1) {
      glow.color = rgb(AMBER); // stained-glass side panels + transom, lit from inside
      band(glow, RB + 0.03, thAt(c - hw + 0.05), thAt(c - 0.45), Y(1.2), Y(4.9));
      band(glow, RB + 0.03, thAt(c + 0.45), thAt(c + hw - 0.05), Y(1.2), Y(4.9));
      band(glow, RB + 0.03, thAt(c - hw + 0.05), thAt(c + hw - 0.05), Y(5.1), Y(5.75));
      col(IRON); // the black double door
      band(m, RB + 0.04, thAt(c - 0.45), thAt(c + 0.45), Y(1.0), Y(4.9));
      fbox(s.buf('gold'), polarFr(thAt(c), RB + 0.08), -0.02, 0.02, 0, 0.03, Y(2.4), Y(3.4));
    }
    for (let a = c - hw + 0.3; a < c + hw - 0.1; a += 0.3) band(nearIron, RB + 0.06, thAt(a - 0.025), thAt(a + 0.025), Y(1.0), Y(6.0));
    for (const y of [Y(2.7), Y(4.4)]) band(nearIron, RB + 0.065, th0, th1, y - 0.04, y + 0.04);
    for (let y = Y(1.3); y < Y(5.8); y += 0.45) band(nearIron, RB + 0.07, thAt(c - 0.45), thAt(c + 0.45), y - 0.02, y + 0.02);
    col(TRIM);
    pbox(m, RB - 0.05, RB + 0.3, thAt(c - hw - 0.4), th0, Y(0.9), Y(6.0));
    pbox(m, RB - 0.05, RB + 0.3, th1, thAt(c + hw + 0.4), Y(0.9), Y(6.0));
    pbox(m, RB - 0.05, RB + 0.38, thAt(c - hw - 0.55), thAt(c + hw + 0.55), Y(6.0), Y(6.55));
    pbox(m, RB - 0.05, RB + 0.5, thAt(c - hw - 0.6), thAt(c + hw + 0.6), G0 - 0.3, Y(0.9)); // step
  }
  // curved balcony on corbels with the Art-Deco iron railing
  col(TRIM);
  pbox(m, RB - 0.05, RB + 1.3, TH0 + 0.5 / RB, TH1 - 0.5 / RB, Y(6.55), Y(6.95));
  for (let a = 0.9; a < ARC - 0.5; a += 1.3) pbox(m, RB - 0.05, RB + 0.95, thAt(a - 0.18), thAt(a + 0.18), Y(5.85), Y(6.55));
  const [rr0, rr1] = [TH0 + 0.55 / RB, TH1 - 0.55 / RB];
  for (const y of [Y(6.95), Y(7.3), Y(7.7), Y(8.05)]) pbox(iron, RB + 1.2, RB + 1.27, rr0, rr1, y, y + 0.05);
  for (let a = 0.6; a < ARC - 0.5; a += 0.9) pbox(nearIron, RB + 1.2, RB + 1.26, thAt(a - 0.025), thAt(a + 0.025), Y(6.95), Y(8.1));
  for (let a = 1.05; a < ARC - 0.5; a += 0.9) pbox(nearIron, RB + 1.2, RB + 1.26, thAt(a - 0.02), thAt(a + 0.02), Y(7.3), Y(7.7));
  // three storeys: 3 groups of 3 narrow windows between 4 engaged columns
  const cols = [0.5, 0.5 + (ARC - 1) / 3, 0.5 + (2 * (ARC - 1)) / 3, ARC - 0.5];
  for (const a of cols) {
    const f = polarFr(thAt(a), RB - 0.08);
    col(TRIM);
    lathe(m, f, 0, 0, [[0.36, Y(6.95)], [0.36, Y(7.3)], [0.3, Y(19.2)], [0.38, Y(19.6)]], 10);
    fbox(m, f, -0.46, 0.46, -0.46, 0.46, Y(19.6), Y(19.95));
  }
  for (let g = 0; g < 3; g++) {
    const [ga, gb] = [cols[g]! + 0.42, cols[g + 1]! - 0.42];
    const ww = (gb - ga - 4 * 0.17) / 3;
    col(TRIM);
    pbox(m, RB - 0.05, RB + 0.18, thAt(ga - 0.1), thAt(gb + 0.1), Y(6.95), Y(7.3)); // sill
    pbox(m, RB - 0.05, RB + 0.18, thAt(ga - 0.1), thAt(gb + 0.1), Y(19.2), Y(19.6)); // head
    for (let w = 0; w < 3; w++) {
      const a0 = ga + 0.17 + w * (ww + 0.17);
      col(GLASS);
      band(m, RB + 0.02, thAt(a0), thAt(a0 + ww), Y(7.3), Y(19.2));
      for (let y = Y(8.8); y < Y(19); y += 1.55) band(nearIron, RB + 0.05, thAt(a0), thAt(a0 + ww), y - 0.03, y + 0.03);
    }
  }
  // the banner hanging in front of the middle group
  col('#a8203a');
  band(m, RB + 0.5, thAt(mid - 0.8), thAt(mid + 0.8), Y(9.0), Y(17.2));
  band(m, RB + 0.5, thAt(mid - 0.8), thAt(mid + 0.8), Y(9.0), Y(17.2), -1);
  col('#f2e6d8');
  band(m, RB + 0.51, thAt(mid - 0.65), thAt(mid + 0.65), Y(14.6), Y(15.6));
  pbox(iron, RB, RB + 0.55, thAt(mid - 0.9), thAt(mid + 0.9), Y(17.2), Y(17.27));
  // heavy stepped cornice with brackets, crenellated parapet, the drum behind
  col(TRIM);
  for (let a = 0.4; a < ARC; a += 0.8) pbox(m, RB - 0.05, RB + 0.32, thAt(a - 0.12), thAt(a + 0.12), Y(19.4), Y(20.0));
  pbox(m, RB - 0.1, RB + 0.4, TH0, TH1, Y(20.0), Y(20.5));
  pbox(m, RB - 0.1, RB + 0.75, TH0, TH1, Y(20.5), Y(21.0));
  pbox(m, RB - 0.1, RB + 1.05, TH0, TH1, Y(21.0), Y(21.6));
  col(TONES[0]!);
  pbox(m, RB - 0.3, RB + 0.55, TH0, TH1, Y(21.6), Y(22.3));
  for (let a = 0.7; a < ARC - 0.3; a += 1.35) {
    col(TRIM);
    pbox(m, RB - 0.3, RB + 0.65, thAt(a - 0.42), thAt(a + 0.42), Y(22.3), Y(23.4));
    pbox(m, RB - 0.3, RB + 0.65, thAt(a - 0.25), thAt(a + 0.25), Y(23.4), Y(23.7));
    col(GLASS);
    band(near, RB + 0.66, thAt(a - 0.14), thAt(a + 0.14), Y(22.65), Y(22.95));
  }
  col(TONES[1]!);
  band(m, RB - 1.3, -Math.PI, Math.PI, Y(21.6), Y(H_BAY));
  col(TRIM);
  pbox(m, RB - 1.3, RB - 0.9, -Math.PI, Math.PI, Y(H_BAY) - 0.5, Y(H_BAY));
  for (let k = 0; k < 28; k++) triOut(m, pp(0, 0, Y(H_BAY)), pp((2 * Math.PI * k) / 28, RB - 0.9, Y(H_BAY)), pp((2 * Math.PI * (k + 1)) / 28, RB - 0.9, Y(H_BAY)), UP);
  for (const da of [-2.7, 0, 2.7]) flag(s, polarFr(thAt(mid + da), RB - 0.05), Y(23.4), nextFlag());

  // ── the two pavilions: body above the wing roof, stepped cornice + brackets, 3-step top, window group, pilasters, ground floor ──
  for (const tw of TOWERS) {
    const e = mkEdge(tw.a[0], tw.a[1], tw.b[0], tw.b[1], inside);
    const t = Math.min(ctx.height(tw.a[0], tw.a[1]), ctx.height(tw.b[0], tw.b[1]));
    const [HT, len] = [Y(H_TOWER), e.len];
    col(TONES[0]!);
    ebox(m, e, 0, len, -3.4, -0.02, TOP - 0.3, HT);
    ebox(m, e, 0.5, len - 0.5, -3.0, -0.4, HT, HT + 0.9);
    ebox(m, e, 1.1, len - 1.1, -2.6, -0.8, HT + 0.9, HT + 1.8);
    ebox(m, e, 1.8, len - 1.8, -2.2, -1.2, HT + 1.8, HT + 2.7);
    col(TRIM);
    for (const [o1, y0, y1] of [[0.35, HT - 1.4, HT - 0.9], [0.7, HT - 0.9, HT - 0.45], [1.0, HT - 0.45, HT]] as const) {
      ebox(m, e, -o1, len + o1, -0.1, o1, y0, y1);
      ebox(m, e, -o1, 0, -3.4, o1, y0, y1);
      ebox(m, e, len, len + o1, -3.4, o1, y0, y1);
    }
    for (let d = 0.6; d < len; d += 1.2) {
      ebox(m, e, d - 0.15, d + 0.15, -0.05, 0.42, HT - 2.1, HT - 1.4);
      ebox(m, e, d - 0.15, d + 0.15, -0.05, 0.25, HT - 2.5, HT - 2.1);
    }
    pilaster(e, 0.55, t - 0.6, HT - 1.4);
    pilaster(e, len - 0.55, t - 0.6, HT - 1.4);
    const c = len / 2;
    ebox(m, e, c - 1.9, c + 1.9, -0.05, 0.25, Y(6.6), Y(7.0));
    ebox(m, e, c - 1.9, c + 1.9, -0.05, 0.25, Y(18.5), Y(18.9));
    for (let w = -1; w <= 1; w++) {
      const wc = c + w * 1.2;
      col(GLASS);
      eq(m, e, wc - 0.35, wc + 0.35, Y(7.0), Y(18.5), 0.03);
      for (let y = Y(8.6); y < Y(18.3); y += 1.6) eq(nearIron, e, wc - 0.35, wc + 0.35, y - 0.03, y + 0.03, 0.05);
      col(TRIM);
      ebox(m, e, wc - 0.6, wc - 0.35, -0.05, 0.12, Y(7.0), Y(18.5));
      ebox(m, e, wc + 0.35, wc + 0.6, -0.05, 0.12, Y(7.0), Y(18.5));
    }
    if (tw.cafe) { // BOZAR café: dark-green fascia, gold lettering band, glass front, warm interior
      col(PLINTH);
      ebox(m, e, 0.3, len - 0.3, -0.05, 0.1, t - 0.6, t + 0.4);
      col('#1f4a3a');
      ebox(m, e, 0.3, len - 0.3, -0.05, 0.2, t + 3.7, t + 4.55);
      fbox(s.buf('gold'), e.f, 1.2, len - 1.2, e.flip * 0.2, e.flip * 0.23, t + 3.95, t + 4.3);
      glow.color = rgb(WARM);
      eq(glow, e, 0.5, len - 0.5, t + 0.4, t + 3.7, 0.03);
      quadOut(s.buf('glass'), at(e, 0.5, t + 0.4, 0.09), at(e, len - 0.5, t + 0.4, 0.09), at(e, len - 0.5, t + 3.7, 0.09), at(e, 0.5, t + 3.7, 0.09), e.out, 0, 0, (len - 1) / L.glassTile, 3.3 / L.glassTile);
      for (let d = 0.5; d <= len - 0.5; d += (len - 1) / 4) eq(nearIron, e, d - 0.04, d + 0.04, t + 0.4, t + 3.7, 0.11);
      eq(nearIron, e, 0.5, len - 0.5, t + 2.85, t + 2.93, 0.11);
      col(IRON);
      ebox(m, e, 0.3, 0.5, -0.05, 0.12, t + 0.4, t + 3.7);
      ebox(m, e, len - 0.5, len - 0.3, -0.05, 0.12, t + 0.4, t + 3.7);
    } else {
      col(PLINTH);
      ebox(m, e, 0, len, -0.05, 0.1, t - 0.6, t + 1.0);
      grille(e, c, 1.35, t + 1.0, t + 5.0, true);
      col(TRIM);
      ebox(m, e, c - 2.1, c + 2.1, -0.05, 0.5, t - 0.3, t + 0.95);
    }
    for (let k = 1; k <= 3; k++) flag(s, { ...e.f, cx: at(e, (len * k) / 4, 0, -0.45)[0], cz: at(e, (len * k) / 4, 0, -0.45)[2] }, HT, nextFlag());
  }
  return s.out();
};

export const details: Partial<Record<LandmarkId, DetailFn>> = { bozar };
