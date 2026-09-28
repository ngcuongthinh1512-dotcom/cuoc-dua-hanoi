// Group g3: Louvre–Concorde–Opéra axis (docs/plans/phase2b-assets.md §1 #5, #10, #13–16, #25; SPEC §17.6): A (OSM
// parts) + B (code). Tunables and the Louvre tables: config.ts landmarks.g3. Published figures are cited next to their
// use; "est." = estimate (none published, from photos / storey counts). Detail marked 'near' is hidden beyond
// landmarks.detailDistance. Colliders: prisms / the glass pyramid faces only.
//   Louvre, Palais-Royal: OSM outline walls with window rows + a mansard height field over the outline (distance to
//     the facade), per-zone heights, pavilion roofs "à l'impériale", the square dome of the Pavillon de l'Horloge.
//   Pyramid: glass faces (pane texture) on a steel frame, the 3 small pyramids and 6 triangular basins with jets.
//   Carrousel, Madeleine, Opéra: OSM parts (generic renderer) + arches, marble, statues, capitals, pediments, loggia.
//   Obelisk (+ the Concorde points), fountains, Vendôme: lathe / box builds on the OSM footprint.
import { buildings as B, landmarks as L } from '../../config.ts';
import type { BuildingRec, LandmarkId, PartRec, XZ } from '../../geo/chunkData.ts';
import type { BuildOut, MaterialId } from '../buildTypes.ts';
import { hash01, type MeshBuffer, triangulate, type V3 } from '../geom.ts';
import type { DetailFn, Helpers, LandmarkCtx } from './index.ts';
import { arch, box, cross, extrude, footprintFrame, type Frame, loft, place, quadOut, square, sub, triOut } from './kit.ts';
import { parseColour, partRings, renderPart, roofShape, Sink } from './parts.ts';

const G = L.g3;
const LC = Object.fromEntries(Object.entries(G.colours).map(([k, v]) => [k, parseColour(v)!])) as Record<keyof typeof G.colours, V3>;
const LF = G.louvre.frame;

// ── primitives (any frame; y up) ──

/** Masonry / metal buffer with its vertex colour set (the sink shares one buffer per material + lod). */
function paint(s: Sink, m: MaterialId, c: V3, lod?: 'near') {
  const b = s.buf(m, lod);
  b.color = c;
  return b;
}

/** Surface of revolution, profile [r, y] (any direction), around the vertical through (cx, cz); closed on top when r > 0. */
function lathe(b: MeshBuffer, prof: readonly (readonly [number, number])[], n: number, cx = 0, cz = 0, close = true) {
  const P = (r: number, y: number, a: number): V3 => [cx + r * Math.cos(a), y, cz + r * Math.sin(a)];
  for (let k = 0; k + 1 < prof.length; k++) {
    const [[r0, y0], [r1, y1]] = [prof[k]!, prof[k + 1]!];
    const [nr, ny] = [y1 - y0, r0 - r1];
    for (let s = 0; s < n; s++) {
      const [a0, a1, am] = [(2 * Math.PI * s) / n, (2 * Math.PI * (s + 1)) / n, (2 * Math.PI * (s + 0.5)) / n];
      quadOut(b, P(r0, y0, a0), P(r0, y0, a1), P(r1, y1, a1), P(r1, y1, a0), [nr * Math.cos(am), ny, nr * Math.sin(am)]);
    }
  }
  const [r, y] = prof.at(-1)!;
  if (close && r > 1e-3) for (let s = 1; s + 1 < n; s++) triOut(b, P(r, y, 0), P(r, y, (2 * Math.PI * s) / n), P(r, y, (2 * Math.PI * (s + 1)) / n), [0, 1, 0]);
}

const norm = (v: V3): V3 => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};

/** Square-section beam of half-width r from p to q (open ends). */
function beam(b: MeshBuffer, p: V3, q: V3, r: number) {
  const d = norm(sub(q, p));
  const e1 = norm(cross(d, Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]));
  const e2 = cross(e1, d);
  const S = [[1, 1], [-1, 1], [-1, -1], [1, -1]] as const;
  const at = (o: V3, i: number): V3 => [0, 1, 2].map((k) => o[k]! + r * (S[i]![0] * e1[k]! + S[i]![1] * e2[k]!)) as unknown as V3;
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    const out = [0, 1, 2].map((k) => (S[i]![0] + S[j]![0]) * e1[k]! + (S[i]![1] + S[j]![1]) * e2[k]!) as unknown as V3;
    quadOut(b, at(p, i), at(p, j), at(q, j), at(q, i), out);
  }
}

/** Statue proxy (draped standing figure), height h, radius r. */
const FIGURE = [[1, 0], [0.8, 0.1], [0.65, 0.45], [0.85, 0.6], [0.95, 0.72], [0.4, 0.8], [0.5, 0.86], [0.45, 0.96], [0.15, 1]] as const;
const figure = (b: MeshBuffer, cx: number, cz: number, y: number, h: number, r: number, n = 8) =>
  lathe(b, FIGURE.map(([k, t]) => [k * r, y + t * h] as const), n, cx, cz);

/** Horse proxy (≈ 2.7 k tall), standing at (x, y, z), facing +z (dir 1) or −z (dir −1). */
function horse(b: MeshBuffer, x: number, y: number, z: number, dir: number, k: number, wings = false) {
  const Z = (a: number, c: number) => [z + dir * a * k, z + dir * c * k].sort((m, n) => m - n) as [number, number];
  box(b, x - 0.33 * k, x + 0.33 * k, y + 1.1 * k, y + 1.9 * k, ...Z(-1, 1));
  box(b, x - 0.2 * k, x + 0.2 * k, y + 1.6 * k, y + 2.5 * k, ...Z(0.8, 1.3));
  box(b, x - 0.16 * k, x + 0.16 * k, y + 2.2 * k, y + 2.7 * k, ...Z(1.2, 1.85));
  for (const [lx, lz] of [[-0.2, -0.8], [0.2, -0.8], [-0.2, 0.8], [0.2, 0.8]] as const) box(b, x + (lx - 0.1) * k, x + (lx + 0.1) * k, y, y + 1.2 * k, ...Z(lz - 0.1, lz + 0.1));
  if (wings) for (const s of [-1, 1]) box(b, x + s * 0.3 * k, x + s * 1.6 * k, y + 1.8 * k, y + 2.1 * k, ...Z(-0.6, 0.5));
}

/** Local (frame) build → world: meshes and colliders. */
function placed(o: BuildOut, f: Frame, y0: number): BuildOut {
  for (const m of o.meshes) place(m, f, y0);
  for (const c of o.colliders) {
    const v = c.vertices;
    for (let i = 0; i < v.length; i += 3) {
      const [x, y, z] = [v[i]!, v[i + 1]!, v[i + 2]!];
      [v[i], v[i + 1], v[i + 2]] = [f.cx + x * f.ux - z * f.uz, y0 + y, f.cz + x * f.uz + z * f.ux];
    }
  }
  return o;
}
const join = (...os: BuildOut[]): BuildOut => ({ meshes: os.flatMap((o) => o.meshes), instances: [], colliders: os.flatMap((o) => o.colliders) });
const withAxis = (f: Frame, ux: number, uz: number): Frame => ({ ...f, ux, uz });
const sqXZ = (s: number, cx = 0, cz = 0, t = s): XZ => [cx - s, cz - t, cx + s, cz - t, cx + s, cz + t, cx - s, cz + t];

function inRing(x: number, z: number, r: XZ) {
  let inside = false;
  for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
    if (r[i + 1]! > z !== r[j + 1]! > z && x < r[i]! + ((z - r[i + 1]!) / (r[j + 1]! - r[i + 1]!)) * (r[j]! - r[i]!)) inside = !inside;
  }
  return inside;
}
const centroid = (r: XZ): [number, number] => {
  let [x, z] = [0, 0];
  for (let i = 0; i < r.length; i += 2) [x, z] = [x + r[i]!, z + r[i + 1]!];
  return [(2 * x) / r.length, (2 * z) / r.length];
};

// ── Louvre / Palais-Royal massing: outline walls + windows, terrace, mansard height field ──

type Axis = { ox: number; oz: number; ux: number; uz: number };
type Mansard = readonly [number, number, number, number]; // cornice, lower slope height, upper slope, max top (m above ground)
type Zone = readonly [number, number, number, number, ...Mansard]; // u0, u1, w0, w1, …
const toL = (a: Axis, x: number, z: number): [number, number] => [(x - a.ox) * a.ux + (z - a.oz) * a.uz, -(x - a.ox) * a.uz + (z - a.oz) * a.ux];
const toW = (a: Axis, u: number, w: number): [number, number] => [a.ox + u * a.ux - w * a.uz, a.oz + u * a.uz + w * a.ux];

/** Mansard parameters at (u, w): base, then each zone blended in over G.blend m around its rectangle (continuous). */
function zoneAt(base: Mansard, zones: readonly Zone[], u: number, w: number): Mansard {
  let m = [...base];
  for (const z of zones) {
    const d = Math.hypot(Math.max(z[0] - u, 0, u - z[1]), Math.max(z[2] - w, 0, w - z[3]));
    const t = Math.max(0, 1 - d / G.blend);
    const s = t * t * (3 - 2 * t);
    if (s > 0) m = m.map((v, k) => v + (z[4 + k]! - v) * s);
  }
  return m as unknown as Mansard;
}

function segDist(pu: number, pw: number, e: number[], k: number) {
  const [au, aw, bu, bw] = [e[k]!, e[k + 1]!, e[k + 2]!, e[k + 3]!];
  const [du, dw] = [bu - au, bw - aw];
  const t = Math.max(0, Math.min(1, ((pu - au) * du + (pw - aw) * dw) / (du * du + dw * dw || 1)));
  return Math.hypot(pu - au - t * du, pw - aw - t * dw);
}

/** Wall (x0, z0) → (x1, z1) from yb up to cAt, split into bays of ≈ G.bay; each bay gets a window column, or one tall
 *  opening where the wall is at most G.arcade high (colonnades). Outside = the left of the direction × side. */
function facade(M: MeshBuffer, x0: number, z0: number, x1: number, z1: number, yb: number, g: number, cAt: (x: number, z: number) => number, side = 1) {
  const len = Math.hypot(x1 - x0, z1 - z0);
  if (len < 1e-3) return;
  const [tx, tz] = [(x1 - x0) / len, (z1 - z0) / len];
  const out: V3 = [-tz * side, 0, tx * side];
  const m = Math.max(1, Math.round(len / G.bay));
  for (let q = 0; q < m; q++) {
    const [s0, s1] = [(q * len) / m, ((q + 1) * len) / m];
    const [ax, az, bx, bz] = [x0 + tx * s0, z0 + tz * s0, x0 + tx * s1, z0 + tz * s1];
    const [c0, c1] = [cAt(ax, az), cAt(bx, bz)];
    M.color = LC.stone;
    quadOut(M, [ax, yb, az], [bx, yb, bz], [bx, c1, bz], [ax, c0, az], out);
    if (s1 - s0 < G.winW + 1) continue;
    M.color = LC.window;
    const [mx, mz, top] = [(ax + bx) / 2 + out[0] * 0.08, (az + bz) / 2 + out[2] * 0.08, Math.min(c0, c1)];
    const p = (s: number, y: number): V3 => [mx + tx * s, y, mz + tz * s];
    const win = (hw: number, y0: number, y1: number) => quadOut(M, p(-hw, y0), p(hw, y0), p(hw, y1), p(-hw, y1), out);
    if (top - g <= G.arcade) win((s1 - s0) * 0.36, g + 0.1, top - 1.6);
    else for (let y = g + G.winFrom; y + G.winH < top - 2.5; y += G.storey) win(G.winW / 2, y, y + G.winH);
  }
}

/** Walls of every ring up to the zone cornice (facade bays), a terrace, and the mansard roof as a height field on a grid
 *  of the axis frame: h = cornice + min(d·k1, hm) + max(0, d − hm/k1)·k2 (d = distance to the facade), capped at `top`;
 *  grid vertices next to the outside stay at the cornice, so the roof meets the terrace. */
function massing(k: Sink, rings: XZ[], ax: Axis, zone: (u: number, w: number) => Mansard, ctx: LandmarkCtx) {
  const g = ctx.ground;
  const yb = ctx.minGround - B.baseSink;
  const M = k.buf('masonry');
  const cAt = (x: number, z: number) => g + zone(...toL(ax, x, z))[0];
  for (const r of rings) for (let i = 0, n = r.length; i < n; i += 2) facade(M, r[i]!, r[i + 1]!, r[(i + 2) % n]!, r[(i + 3) % n]!, yb, g, cAt);
  // terrace (under the roof field, visible in the strip along the facades)
  M.color = LC.slate;
  const idx = triangulate(rings[0]!, rings.slice(1));
  const pts = rings.flat();
  const at = (i: number): V3 => [pts[2 * i]!, cAt(pts[2 * i]!, pts[2 * i + 1]!) - 0.05, pts[2 * i + 1]!];
  for (let t = 0; t < idx.length; t += 3) triOut(M, at(idx[t]!), at(idx[t + 1]!), at(idx[t + 2]!), [0, 1, 0]);
  // roof field
  const E: number[] = [];
  for (const r of rings) for (let i = 0, n = r.length; i < n; i += 2) E.push(...toL(ax, r[i]!, r[i + 1]!), ...toL(ax, r[(i + 2) % n]!, r[(i + 3) % n]!));
  let [U0, U1, W0, W1] = [Infinity, -Infinity, Infinity, -Infinity];
  for (let i = 0; i < E.length; i += 2) [U0, U1, W0, W1] = [Math.min(U0, E[i]!), Math.max(U1, E[i]!), Math.min(W0, E[i + 1]!), Math.max(W1, E[i + 1]!)];
  const C = G.cell;
  const [nu, nw] = [Math.ceil((U1 - U0) / C) + 1, Math.ceil((W1 - W0) / C) + 1];
  const inside = new Uint8Array(nu * nw);
  for (let j = 0; j < nw; j++) {
    const w = W0 + j * C + 1e-4;
    const xs: number[] = [];
    for (let e = 0; e < E.length; e += 4) if (E[e + 1]! > w !== E[e + 3]! > w) xs.push(E[e]! + ((w - E[e + 1]!) / (E[e + 3]! - E[e + 1]!)) * (E[e + 2]! - E[e]!));
    xs.sort((a, b) => a - b);
    for (let q = 0; q + 1 < xs.length; q += 2) for (let i = Math.max(0, Math.ceil((xs[q]! - U0) / C)); i <= Math.min(nu - 1, Math.floor((xs[q + 1]! - U0) / C)); i++) inside[j * nu + i] = 1;
  }
  const BS = 16;
  const [bu, bw] = [Math.ceil((U1 - U0) / BS) + 1, Math.ceil((W1 - W0) / BS) + 1];
  const bins: number[][] = Array.from({ length: bu * bw }, () => []);
  for (let e = 0; e < E.length; e += 4) {
    const bin = (v: number, v0: number, nb: number) => Math.max(0, Math.min(nb - 1, Math.floor((v - v0) / BS)));
    const [i0, i1] = [bin(Math.min(E[e]!, E[e + 2]!) - G.dmax, U0, bu), bin(Math.max(E[e]!, E[e + 2]!) + G.dmax, U0, bu)];
    const [j0, j1] = [bin(Math.min(E[e + 1]!, E[e + 3]!) - G.dmax, W0, bw), bin(Math.max(E[e + 1]!, E[e + 3]!) + G.dmax, W0, bw)];
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) bins[j * bu + i]!.push(e);
  }
  const H = new Float32Array(nu * nw);
  const isIn = (i: number, j: number) => i >= 0 && j >= 0 && i < nu && j < nw && inside[j * nu + i] === 1;
  for (let j = 0; j < nw; j++) {
    for (let i = 0; i < nu; i++) {
      if (!isIn(i, j)) continue;
      const [u, w] = [U0 + i * C, W0 + j * C];
      const [c, hm, k2, top] = zone(u, w);
      let edge = false;
      for (let dj = -1; dj <= 1 && !edge; dj++) for (let di = -1; di <= 1; di++) if (!isIn(i + di, j + dj)) edge = true;
      let d = G.dmax;
      if (!edge) for (const e of bins[Math.floor((w - W0) / BS) * bu + Math.floor((u - U0) / BS)]!) d = Math.min(d, segDist(u, w, E, e));
      H[j * nu + i] = g + (edge ? c : Math.min(top, c + Math.min(d * G.k1, hm) + Math.max(0, d - hm / G.k1) * k2));
    }
  }
  const V = (i: number, j: number): V3 => {
    const [x, z] = toW(ax, U0 + i * C, W0 + j * C);
    return [x, H[j * nu + i]!, z];
  };
  for (let j = 0; j + 1 < nw; j++) {
    for (let i = 0; i + 1 < nu; i++) {
      if (!(isIn(i, j) && isIn(i + 1, j) && isIn(i, j + 1) && isIn(i + 1, j + 1))) continue;
      const [a, b, c, d] = [V(i, j), V(i + 1, j), V(i + 1, j + 1), V(i, j + 1)];
      if (Math.abs(a[1] - c[1]) <= Math.abs(b[1] - d[1])) (triOut(M, a, b, c, [0, 1, 0]), triOut(M, a, c, d, [0, 1, 0]));
      else (triOut(M, a, b, d, [0, 1, 0]), triOut(M, b, c, d, [0, 1, 0]));
    }
  }
  let cMin = Infinity;
  for (let i = 0; i < pts.length; i += 2) cMin = Math.min(cMin, cAt(pts[i]!, pts[i + 1]!));
  k.prism(rings, yb, cMin);
}

// Pavilion roofs: [scale, height share], bottom → top.
const IMPERIAL = [[1, 0], [0.9, 0.35], [0.72, 0.65], [0.5, 0.88], [0.3, 1]] as const; // "à l'impériale", truncated
const SQUARE_DOME = [[1, 0], [0.97, 0.25], [0.88, 0.5], [0.72, 0.72], [0.5, 0.88], [0.3, 0.96], [0.18, 1]] as const;

/** Pavilion [u, w, half u, half w, cornice, roof height, dome?] in the axis frame: walls from the ground, cornice band,
 *  slate roof, gilded finial. */
function pavilion(k: Sink, ax: Axis, g: number, yb: number, p: readonly number[]) {
  const [u, w, a, b, c, H, dome] = p as [number, number, number, number, number, number, number];
  const rect = (s: number, y: number): V3[] => ([[-1, -1], [1, -1], [1, 1], [-1, 1]] as const).map(([i, j]) => {
    const [x, z] = toW(ax, u + i * a * s, w + j * b * s);
    return [x, y, z] as V3;
  });
  const M = k.buf('masonry');
  const q = rect(1, 0);
  const [cx, cz] = toW(ax, u, w);
  const [tx, tz] = [q[1]![0] - q[0]![0], q[1]![2] - q[0]![2]];
  const side = -tz * ((q[0]![0] + q[1]![0]) / 2 - cx) + tx * ((q[0]![2] + q[1]![2]) / 2 - cz) > 0 ? 1 : -1;
  for (let i = 0; i < 4; i++) facade(M, q[i]![0], q[i]![2], q[(i + 1) % 4]![0], q[(i + 1) % 4]![2], yb, g, () => g + c, side);
  M.color = LC.stone;
  loft(M, [rect(1.03, g + c - 0.8), rect(1.03, g + c + 0.05)]);
  M.color = LC.slate;
  const prof = dome ? SQUARE_DOME : IMPERIAL;
  const rings = prof.map(([s, t]) => rect(s, g + c + t * H));
  loft(M, rings);
  quadOut(M, ...(rings.at(-1)! as [V3, V3, V3, V3]), [0, 1, 0]);
  const yt = g + c + H;
  lathe(k.buf('gold'), [[0.6, yt], [0.35, yt + 1], [0.7, yt + 1.6], [0.05, yt + 3.2]], 8, cx, cz);
}

function louvre(rec: BuildingRec, ctx: LandmarkCtx): BuildOut {
  const k = new Sink();
  const rings = partRings(rec);
  if (!rings) return k.out();
  const Z = G.louvre;
  const zone = (u: number, w: number) => zoneAt(Z.base, Z.zones, u, w);
  massing(k, rings, LF, zone, ctx);
  const yb = ctx.minGround - B.baseSink;
  for (const p of Z.pavilions) pavilion(k, LF, ctx.ground, yb, p);
  // glass roofs of the Cour Marly and Cour Puget (the two big courtyards of the Richelieu wing, covered in 1993)
  for (const h of rings.slice(1)) {
    const [u, w] = toL(LF, ...centroid(h));
    const xs = h.filter((_, i) => i % 2 === 0);
    if (w > -60 || Math.max(...xs) - Math.min(...xs) < 40 || u < -100 || u > 70) continue;
    const c = zone(u, w)[0];
    renderPart({ outer: h, kind: 'roof', height: c + Z.courtGlass, roofHeight: Z.courtGlass, roofShape: 'hipped', roofMaterial: 'glass' },
      { ground: ctx.ground, height: ctx.height, fallbackTop: c }, k);
  }
  return k.out();
}

// ── Pyramide du Louvre (I. M. Pei, 1989): 21.6 m high, 35.4 m base (en.wikipedia.org/wiki/Louvre_Pyramid) ──

function glassPyramid(k: Sink, cx: number, cz: number, half: number, h: number) {
  const glass = k.buf('glass');
  const base = square(half, 0, cx, cz);
  const apex: V3 = [cx, h, cz];
  const frame = paint(k, 'metal', LC.frame, 'near');
  for (let i = 0; i < 4; i++) {
    const [a, b] = [base[i]!, base[(i + 1) % 4]!];
    const len = Math.hypot(b[0] - a[0], b[2] - a[2]);
    const slant = Math.hypot(h, half);
    const out: V3 = [(a[0] + b[0]) / 2 - cx, h / 3, (a[2] + b[2]) / 2 - cz];
    const t = L.glassTile;
    triOut(glass, a, b, apex, out, [0, 0, len / t, 0, len / (2 * t), slant / t]);
    const c = k.cv.length / 3;
    k.cv.push(...a, ...b, ...apex);
    k.ci.push(c, c + 1, c + 2);
    beam(frame, a, apex, G.pyramid.beam);
    beam(frame, a, b, G.pyramid.beam);
  }
}

function pyramid(rec: BuildingRec, ctx: LandmarkCtx): BuildOut {
  const P = G.pyramid;
  const f0 = footprintFrame(rec.outer);
  const f = withAxis(f0, LF.ux, LF.uz); // local x = east along the Louvre axis, z = south (the pyramid is square on it)
  const half = (f0.a + f0.b) / 2;
  const H = rec.height ?? P.height;
  const k = new Sink();
  glassPyramid(k, 0, 0, half, H);
  const smallHalf = (P.small * half) / H; // same slope (51.7°)
  const [d0, d1, t0, t1] = P.basin;
  for (const [dx, dz] of [[1, 0], [0, -1], [0, 1]] as const) { // east (Sully), north (Richelieu), south (Denon); west = entrance
    glassPyramid(k, dx * P.smallAt, dz * P.smallAt, smallHalf, P.small);
    for (const s of [-1, 1]) {
      const pt = (d: number, t: number): V3 => [dx * d - dz * t * s, 0, dz * d + dx * t * s];
      const tri = [pt(d0, t0), pt(d0, t1), pt(d1, t0)];
      const rim = paint(k, 'masonry', LC.basin);
      const up = (p: V3, y: number): V3 => [p[0], y, p[2]];
      loft(rim, [tri.map((p) => up(p, -0.3)), tri.map((p) => up(p, P.basinH))]);
      for (let i = 0; i < 3; i++) beam(rim, up(tri[i]!, P.basinH), up(tri[(i + 1) % 3]!, P.basinH), 0.2);
      triOut(paint(k, 'metal', LC.water), up(tri[0]!, P.basinH - 0.08), up(tri[1]!, P.basinH - 0.08), up(tri[2]!, P.basinH - 0.08), [0, 1, 0]);
      const jet = k.buf('waterJet', 'near');
      for (let j = 1; j <= 4; j++) {
        const p = pt(d0 + 1.5, t0 + ((t1 - t0 - 3) * j) / 5 + 1.5);
        lathe(jet, [[0.12, P.basinH], [0.05, P.basinH + 1.4], [0, P.basinH + 1.6]], 6, p[0], p[2], false);
      }
      k.prism([tri.flatMap((p) => [p[0], p[2]])], -0.3, P.basinH);
    }
  }
  return placed(k.out(), f, ctx.minGround - 0.05);
}

// ── Obélisque de Louxor: 22.83 m with its pyramidion, gilded cap 3.6 m (1998) (fr.wikipedia.org/wiki/Obélisque_de_Louxor);
//    OSM total with the pedestal 33.37 m. Pedestal tiers est. ──

function obelisk(rec: BuildingRec, ctx: LandmarkCtx): BuildOut {
  const O = G.obelisk;
  const f = footprintFrame(rec.outer);
  const total = rec.height ?? O.total;
  const ped = total - O.shaft;
  const s = Math.max(f.a, f.b, 1.8);
  const k = new Sink();
  const M = paint(k, 'masonry', LC.granite);
  box(M, -s - 1, s + 1, -0.5, 0.6, -s - 1, s + 1);
  box(M, -s, s, 0.6, 1.6, -s, s);
  box(M, -s + 0.25, s - 0.25, 1.6, ped - 1.9, -s + 0.25, s - 0.25);
  box(M, -s - 0.1, s + 0.1, ped - 1.9, ped - 1.3, -s - 0.1, s + 0.1);
  box(M, -s + 0.35, s - 0.35, ped - 1.3, ped, -s + 0.35, s - 0.35);
  const gold = paint(k, 'masonry', LC.gilt, 'near'); // gilded diagrams of the transport and erection (1836)
  const fs = s - 0.25 + 0.02;
  for (const [ux, uz] of [[1, 0], [0, 1], [-1, 0], [0, -1]] as const) {
    const q = (t: number, y: number): V3 => [ux * fs - uz * t, y, uz * fs + ux * t];
    quadOut(gold, q(-fs + 0.6, 2.4), q(fs - 0.6, 2.4), q(fs - 0.6, ped - 2.6), q(-fs + 0.6, ped - 2.6), [ux, 0, uz]);
  }
  const yc = ped + O.shaft - O.cap;
  M.color = LC.pinkGranite;
  loft(M, [square(O.base, ped), square(O.top, yc)]);
  const glyph = paint(k, 'masonry', [LC.pinkGranite[0] * 0.6, LC.pinkGranite[1] * 0.55, LC.pinkGranite[2] * 0.5], 'near'); // 3 hieroglyph columns per face
  const hAt = (y: number) => O.base + ((O.top - O.base) * (y - ped)) / (yc - ped) + 0.015;
  for (const [ux, uz] of [[1, 0], [0, 1], [-1, 0], [0, -1]] as const) {
    for (const t of [-0.55, 0, 0.55]) {
      const q = (dt: number, y: number): V3 => [ux * hAt(y) - uz * (t + dt) * hAt(y), y, uz * hAt(y) + ux * (t + dt) * hAt(y)];
      quadOut(glyph, q(-0.12, ped + 0.8), q(0.12, ped + 0.8), q(0.12, yc - 0.6), q(-0.12, yc - 0.6), [ux, 0, uz]);
    }
  }
  const cap = k.buf('gold');
  const r = square(O.top, yc);
  for (let i = 0; i < 4; i++) triOut(cap, r[i]!, r[(i + 1) % 4]!, [0, yc + O.cap, 0], [(r[i]![0] + r[(i + 1) % 4]![0]) / 2, 0.3, (r[i]![2] + r[(i + 1) % 4]![2]) / 2]);
  k.prism([sqXZ(s + 1)], -0.5, 1.6);
  k.prism([sqXZ(s)], 1.6, ped);
  k.prism([sqXZ(O.base)], ped, yc);
  return placed(k.out(), f, ctx.minGround);
}

/** Place de la Concorde zone points of the obelisk record: the 8 city statues on their pavilions (artwork areas with a
 *  plinth radius) and the rostral lamp columns (Hittorff, 1836–40; heights est.). World coordinates. */
function concorde(rec: BuildingRec, ctx: LandmarkCtx): BuildOut {
  const C = G.concorde;
  const k = new Sink();
  for (const p of rec.points ?? []) {
    if (p.kind !== 'artwork') continue;
    const y = ctx.height(p.x, p.z);
    if (/rostral/.test(p.sub ?? '')) {
      const R = C.rostral;
      box(paint(k, 'masonry', LC.granite), p.x - 0.75, p.x + 0.75, y - 0.3, y + 1.4, p.z - 0.75, p.z + 0.75);
      lathe(paint(k, 'masonry', LC.verdigris), [[0.45, y + 1.4], [0.34, y + 1.7], [0.3, y + R - 1.9], [0.45, y + R - 1.6], [0.3, y + R - 1.5], [0.5, y + R - 1], [0.4, y + R - 0.4], [0.1, y + R]], 10, p.x, p.z);
      const g = k.buf('gold', 'near'); // ship prows (rostra)
      for (const yy of [y + 3.2, y + 4.9]) for (const [dx, dz] of [[1, 0], [0, 1], [-1, 0], [0, -1]] as const) beam(g, [p.x + dx * 0.3, yy, p.z + dz * 0.3], [p.x + dx * 0.8, yy + 0.25, p.z + dz * 0.8], 0.1);
      k.prism([sqXZ(0.75, p.x, p.z)], y - 0.3, y + R - 1.5);
    } else if (p.sub === 'statue' && p.r) {
      const big = p.r > 2.3; // the 8 cities (Lyon, Marseille, Bordeaux, Nantes, Rouen, Brest, Lille, Strasbourg) on their guérites
      const hs = p.r * (big ? 0.8 : 0.6);
      const ph = big ? C.statuePlinth : 2.8;
      const M = paint(k, 'masonry', LC.stone);
      box(M, p.x - hs, p.x + hs, y - 0.3, y + ph - 0.5, p.z - hs, p.z + hs);
      box(M, p.x - hs - 0.2, p.x + hs + 0.2, y + ph - 0.5, y + ph, p.z - hs - 0.2, p.z + hs + 0.2);
      figure(big ? paint(k, 'masonry', LC.statue) : k.buf('bronze'), p.x, p.z, y + ph, C.statue, big ? 1.1 : 0.5);
      k.prism([sqXZ(hs, p.x, p.z)], y - 0.3, y + ph);
    }
  }
  return k.out();
}

// ── Fontaines de la Concorde (Hittorff, 1840): basin, sculpted base, 2 vasques (painted cast iron, gilded rims), jets.
//    Total est. 9 m ──

function fountain(rec: BuildingRec, ctx: LandmarkCtx): BuildOut {
  const f = footprintFrame(rec.outer);
  const R = (f.a + f.b) / 2;
  const s = G.fountain.height / 9; // profile below drawn for 9 m
  const k = new Sink();
  const n = 24;
  const Y = (p: readonly (readonly [number, number])[]) => p.map(([r, y]) => [r, y * s] as const);
  lathe(paint(k, 'masonry', LC.stone), [[R, -0.3], [R, G.fountain.basin], [R - 0.5, G.fountain.basin], [R - 0.5, 0.1]], 32, 0, 0, false);
  lathe(paint(k, 'masonry', LC.stone), Y([[3.0, -0.2], [3.0, 1.0], [2.4, 1.3], [1.4, 1.6]]), n);
  lathe(paint(k, 'masonry', LC.verdigris), Y([[1.1, 1.6], [0.8, 2.4], [0.8, 2.6], [2.6, 2.9], [4.2, 3.35], [4.3, 3.6], [4.0, 3.6], [3.0, 3.35], [0.9, 3.25], [0.55, 4.2], [0.5, 5.0], [0.7, 5.3], [1.4, 5.6], [2.0, 5.95], [2.05, 6.15], [1.85, 6.15], [0.45, 6.05], [0.3, 7.0], [0.45, 7.3], [0.12, 7.8]]), n);
  const near = paint(k, 'masonry', LC.verdigris, 'near'); // 6 seated figures around the base, 3 dolphins / tritons on the stem
  for (let i = 0; i < 6; i++) figure(near, 2.55 * Math.cos((i * Math.PI) / 3), 2.55 * Math.sin((i * Math.PI) / 3), 0.9 * s, 1.9 * s, 0.5);
  for (let i = 0; i < 3; i++) figure(near, 0.85 * Math.cos((i * 2 * Math.PI) / 3 + 0.5), 0.85 * Math.sin((i * 2 * Math.PI) / 3 + 0.5), 3.3 * s, 1.5 * s, 0.35);
  const gold = k.buf('gold', 'near');
  lathe(gold, Y([[4.32, 3.45], [4.32, 3.6]]), n, 0, 0, false);
  lathe(gold, Y([[2.07, 6.0], [2.07, 6.15]]), n, 0, 0, false);
  const jet = k.buf('waterJet');
  lathe(jet, Y([[4.35, 3.5], [4.6, 2.0], [4.8, 0.6]]), n, 0, 0, false);
  lathe(jet, Y([[2.1, 6.05], [2.3, 4.6], [2.5, 3.6]]), n, 0, 0, false);
  lathe(jet, Y([[0.08, 7.8], [0.25, 8.7], [0.02, 9]]), 8, 0, 0, false);
  k.prism([sqXZ(2.6)], -0.2, 3.6 * s);
  return placed(k.out(), f, ctx.minGround);
}

// ── Colonne Vendôme: 44.3 m (fr.wikipedia.org/wiki/Colonne_Vendôme); OSM parts: pedestal 8.9 m square to 7.3 m,
//    abacus gallery 37–38 m (6.2 m), lantern dome to 41 m (Ø 3.5 m), statue of Napoléon to 44.3 m. Shaft Ø 3.6 m est.
//    The bas-relief spiral (≈ 22 turns est.) is a helical ridge (near): no normal-map material in createLandmarkMaterials. ──

function vendome(rec: BuildingRec, ctx: LandmarkCtx): BuildOut {
  const V = G.vendome;
  const f = footprintFrame(rec.outer);
  const top = rec.height ?? V.total;
  const s = Math.min(f.b, 4.45);
  const ped = V.pedestal;
  const k = new Sink();
  const M = paint(k, 'masonry', LC.granite);
  box(M, -s - 1.2, s + 1.2, -0.5, 0.3, -s - 1.2, s + 1.2);
  box(M, -s - 0.6, s + 0.6, 0.3, 0.6, -s - 0.6, s + 0.6);
  const br = paint(k, 'metal', LC.patina);
  box(br, -s, s, 0.6, 1.4, -s, s);
  box(br, -s + 0.4, s - 0.4, 1.4, ped - 1, -s + 0.4, s - 0.4);
  box(br, -s - 0.1, s + 0.1, ped - 1, ped - 0.4, -s - 0.1, s + 0.1);
  box(br, -s + 0.3, s - 0.3, ped - 0.4, ped, -s + 0.3, s - 0.3);
  const nb = paint(k, 'metal', LC.patina, 'near'); // eagles at the corners
  for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) box(nb, x * (s - 0.9), x * (s - 0.3), ped, ped + 0.9, z * (s - 0.9), z * (s - 0.3));
  const r0 = V.shaftR;
  const r1 = r0 * 0.9;
  const [y0, y1] = [ped + 1.2, V.shaftTop];
  lathe(br, [[2.3, ped], [2.35, ped + 0.3], [2.1, ped + 0.7], [1.95, ped + 0.9], [r0, y0], [r1, y1], [2.2, y1 + 0.7], [2.3, y1 + 0.8]], 24);
  // spiral: ridge between the relief bands
  const N = V.turns * 24;
  const [ya, yz] = [y0 + 0.3, y1 - 0.5];
  const rAt = (y: number) => r0 + ((r1 - r0) * (y - y0)) / (y1 - y0);
  const P = (i: number, dr: number, dy: number): V3 => {
    const [th, y] = [(2 * Math.PI * i) / 24, ya + ((yz - ya) * i) / N];
    return [(rAt(y) + dr) * Math.cos(th), y + dy, (rAt(y) + dr) * Math.sin(th)];
  };
  for (let i = 0; i < N; i++) {
    const out: V3 = [Math.cos((2 * Math.PI * (i + 0.5)) / 24), 0, Math.sin((2 * Math.PI * (i + 0.5)) / 24)];
    quadOut(nb, P(i, -0.02, -0.16), P(i + 1, -0.02, -0.16), P(i + 1, 0.1, 0), P(i, 0.1, 0), out);
    quadOut(nb, P(i, 0.1, 0), P(i + 1, 0.1, 0), P(i + 1, -0.02, 0.16), P(i, -0.02, 0.16), out);
  }
  box(br, -3.1, 3.1, y1 + 0.8, 38, -3.1, 3.1);
  for (let i = 0; i < 4; i++) { // gallery railing
    const c = square(3, 38.9);
    beam(nb, c[i]!, c[(i + 1) % 4]!, 0.05);
  }
  lathe(br, [[1.75, 38], [1.75, 40.2], [1.5, 40.6], [1.0, 40.9], [0.45, 41]], 16);
  figure(br, 0, 0, 41, top - 41, 0.6);
  lathe(k.buf('gold', 'near'), [[0.02, 42.6], [0.2, 42.8], [0.02, 43]], 8, 0.75, 0); // globe with the Victory
  k.prism([sqXZ(s + 1.2)], -0.5, ped);
  k.prism([sqXZ(r0)], ped, 38);
  return placed(k.out(), f, ctx.minGround);
}

// ── Madeleine: Corinthian peripteral temple, 52 columns ≈ 20 m (fr.wikipedia.org/wiki/Église_de_la_Madeleine); OSM:
//    54 column parts 4.4–24.2 m, podium, steps, gabled copper roof 24.2–36.2 m (its gables are the pediments). ──

function madeleine(rec: BuildingRec, parts: PartRec[], ctx: LandmarkCtx, h: Helpers): BuildOut {
  const g = ctx.ground;
  const k = new Sink();
  const stone = paint(k, 'masonry', LC.stone, 'near');
  for (const p of parts) {
    if (p.kind !== 'column' || p.height === undefined) continue;
    const f = footprintFrame(p.outer);
    const r = (f.a + f.b) / 2;
    const [yb, yt] = [g + (p.minHeight ?? 0), g + p.height];
    lathe(stone, [[r * 1.3, yb], [r * 1.3, yb + 0.35], [r * 1.12, yb + 0.6], [r, yb + 0.8]], 10, f.cx, f.cz, false);
    lathe(stone, [[r * 0.98, yt - 2.3], [r * 1.12, yt - 1.4], [r * 1.35, yt - 0.45], [r * 1.5, yt - 0.4], [r * 1.5, yt]], 10, f.cx, f.cz);
  }
  const out = [h.generic(rec, parts, ctx), k.out()];
  const roof = parts.find((p) => roofShape(p.roofShape) === 'gabled' && p.height !== undefined);
  if (roof) {
    const f = footprintFrame(roof.outer);
    const rh = roof.roofHeight ?? 0;
    const [wt, top] = [roof.height! - rh, roof.height!];
    const kp = new Sink();
    const M = paint(kp, 'masonry', LC.stone);
    const rel = paint(kp, 'masonry', LC.statue, 'near');
    for (const e of [-1, 1]) {
      const u = e * (f.a + 0.2);
      const [lo, hi, apex]: V3[] = [[u, wt, -f.b - 0.3], [u, wt, f.b + 0.3], [u, top + 0.3, 0]];
      beam(M, lo, apex, 0.35);
      beam(M, apex, hi, 0.35);
      beam(M, lo, hi, 0.35);
      for (let i = -3; i <= 3; i++) { // tympanum relief (the Last Judgement, Lemaire): figure blocks
        const w = (i / 3.6) * f.b;
        const hh = rh * (1 - Math.abs(w) / f.b) * 0.75;
        box(rel, u - e * 0.5, u - e * 0.1, wt + 0.5, wt + 0.5 + hh, w - 0.45, w + 0.45);
      }
    }
    out.push(placed(kp.out(), f, g));
  }
  return join(...out);
}

// ── Opéra Garnier: OSM parts only (the h70 outline = 73.6 m from the foundations to Apollo's lyre, not extruded).
//    B: south facade (7 arches, loggia with 16 paired columns, gilded groups "L'Harmonie" / "La Poésie" by Gumery),
//    Apollo (Millet) on the stage gable, Pegasi (Lequesne) at its back corners, gilded dome ribs and finials. ──

function opera(rec: BuildingRec, parts: PartRec[], ctx: LandmarkCtx): BuildOut {
  const O = G.opera;
  const g = ctx.ground;
  const k = new Sink();
  // the stage-house roof is verdigris copper like the domes (OSM: metal)
  for (const p of parts) renderPart(roofShape(p.roofShape) === 'gabled' ? { ...p, roofMaterial: 'copper' } : p, { ground: g, height: ctx.height, fallbackTop: 26 }, k);
  const f0 = footprintFrame(rec.outer);
  const sgn = f0.uz > 0 ? 1 : -1; // front = the south end (+z is south): Place de l'Opéra
  const f = withAxis(f0, sgn * f0.ux, sgn * f0.uz);
  let front = -Infinity;
  const loc: [number, number][] = [];
  for (const r of [rec.outer, ...parts.map((p) => p.outer)]) for (let i = 0; i < r.length; i += 2) { // parts may stand proud of the outline
    const [dx, dz] = [r[i]! - f.cx, r[i + 1]! - f.cz];
    loc.push([dx * f.ux + dz * f.uz, -dx * f.uz + dz * f.ux]);
    front = Math.max(front, loc.at(-1)![0]);
  }
  const ws = loc.filter(([x]) => x > front - 6).map(([, w]) => w);
  const [wc, Wh] = [(Math.max(...ws) + Math.min(...ws)) / 2, Math.min(35, (Math.max(...ws) - Math.min(...ws)) / 2)];
  const top = Math.max(0, ...parts.filter((p) => inRing(...toW({ ox: f.cx, oz: f.cz, ux: f.ux, uz: f.uz }, front - 3, wc), p.outer)).map((p) => p.height ?? 0)) || 32;
  const kf = new Sink();
  const M = kf.buf('masonry');
  const bay = (2 * Wh) / 7;
  const fx = front + 0.05;
  const Q = (w0: number, w1: number, y0: number, y1: number, x = fx) => quadOut(M, [x, y0, w0], [x, y0, w1], [x, y1, w1], [x, y1, w0], [1, 0, 0]);
  for (let i = 0; i < 7; i++) {
    const w = wc - Wh + bay * (i + 0.5);
    M.color = LC.window;
    Q(w - bay * 0.28, w + bay * 0.28, 0.3, 7);
    M.color = LC.recess;
    Q(w - bay * 0.3, w + bay * 0.3, 10, 20.5);
  }
  M.color = LC.stone;
  box(M, front, front + 2.4, 9.2, 9.6, wc - Wh, wc + Wh);
  box(M, front, front + 1.8, 20.5, 22.5, wc - Wh, wc + Wh);
  M.color = LC.gilt; // gilded letters of the frieze ("Académie nationale de musique") and masks of the attic
  box(M, front + 1.8, front + 1.85, 21.1, 21.9, wc - Wh * 0.75, wc + Wh * 0.75);
  for (let i = 0; i < 7; i++) box(M, front, front + 0.3, top - 5, top - 3.6, wc - Wh + bay * (i + 0.5) - 0.7, wc - Wh + bay * (i + 0.5) + 0.7);
  const gold = kf.buf('gold', 'near');
  for (let i = 0; i <= 7; i++) {
    for (const d of [-0.8, 0.8]) {
      const w = wc - Wh + bay * i + d;
      M.color = LC.stone;
      lathe(M, [[O.columnR * 1.3, 9.6], [O.columnR, 10], [O.columnR * 0.92, 19.8]], 10, front + 1.1, w);
      lathe(gold, [[O.columnR * 0.95, 19.8], [O.columnR * 1.4, 20.5]], 10, front + 1.1, w);
    }
  }
  const gg = kf.buf('gold');
  for (const e of [-1, 1]) {
    const w = wc + e * (Wh - 3);
    figure(gg, front - 2.5, w, top, O.groups, 1.1);
    box(gg, front - 2.7, front - 2.3, top + 3, top + O.groups * 0.9, w - e * 0.3, w + e * 1.8);
  }
  const out = [k.out(), placed(kf.out(), f, g)];
  // stage house: Apollo on the front end of the ridge, Pegasi at the back eave corners
  const stage = parts.find((p) => roofShape(p.roofShape) === 'gabled' && p.height !== undefined);
  if (stage) {
    const fs = footprintFrame(stage.outer);
    const across = stage.roofOrientation === 'across';
    const rd: [number, number] = across ? [-fs.uz, fs.ux] : [fs.ux, fs.uz];
    const od: [number, number] = [-rd[1], rd[0]];
    const [rl, ol] = across ? [fs.b, fs.a] : [fs.a, fs.b];
    const e = rd[0] * f.ux + rd[1] * f.uz > 0 ? 1 : -1;
    const kb = new Sink();
    const bz = kb.buf('bronze');
    const at = (r: number, o: number): [number, number] => [fs.cx + rd[0] * r + od[0] * o, fs.cz + rd[1] * r + od[1] * o];
    const [ax, az] = at(e * rl, 0);
    figure(bz, ax, az, g + stage.height!, O.apollo, 0.9);
    lathe(kb.buf('gold'), [[0.5, g + stage.height! + O.apollo], [0.8, g + stage.height! + O.apollo + 1.2], [0.05, g + stage.height! + O.apollo + 1.6]], 6, ax, az);
    out.push(kb.out());
    for (const o of [-1, 1]) {
      const kh = new Sink();
      horse(kh.buf('bronze'), 0, 0, 0, o, 1.4, true);
      const [px, pz] = at(-e * (rl - 1.5), o * (ol - 2));
      out.push(placed(kh.out(), { ...fs, cx: px, cz: pz, ux: rd[0], uz: rd[1] }, g + stage.height! - (stage.roofHeight ?? 0)));
    }
  }
  // main dome: gilded ribs; finials on the domes / the lantern
  const domes = parts.filter((p) => roofShape(p.roofShape) === 'dome' && p.height !== undefined);
  const area = (p: PartRec) => footprintFrame(p.outer).a * footprintFrame(p.outer).b;
  const main = domes.sort((a, b) => area(b) - area(a))[0];
  const kd = new Sink();
  const gn = kd.buf('gold', 'near');
  if (main) {
    const fd = footprintFrame(main.outer);
    const R = main.roofHeight ?? 7;
    const wt = main.height! - R;
    for (let i = 0; i < 16; i++) {
      const ph = (i * Math.PI) / 8;
      const pt = (t: number): V3 => [fd.a * 1.02 * Math.cos(t) * Math.cos(ph), wt + R * 1.02 * Math.sin(t), fd.b * 1.02 * Math.cos(t) * Math.sin(ph)];
      for (let j = 0; j < 5; j++) beam(gn, pt((j * Math.PI) / 12), pt(((j + 1) * Math.PI) / 12), 0.18);
    }
    out.push(placed(kd.out(), fd, g));
    const [mx, mz] = centroid(main.outer);
    const lantern = parts.filter((p) => { const [x, z] = centroid(p.outer); return Math.hypot(x - mx, z - mz) < 3; }).sort((a, b) => (b.height ?? 0) - (a.height ?? 0))[0];
    const kg = new Sink();
    const fin = (cx: number, cz: number, y: number) => lathe(kg.buf('gold'), [[0.5, y], [0.25, y + 1.2], [0.6, y + 1.7], [0.05, y + 2.6]], 8, cx, cz);
    if (lantern) fin(mx, mz, g + lantern.height!);
    for (const d of domes) if (d !== main) fin(...centroid(d.outer), g + d.height!);
    out.push(kg.out());
  }
  return join(...out);
}

// ── Arc de triomphe du Carrousel (1806–08): OSM 56 parts (piers, openings, 8 columns, attic to 17.5 m). B: round
//    arches, red Languedoc marble shafts, 8 soldiers of the Grande Armée above the columns, Bosio's quadriga (est. 4.2 m). ──

function carrousel(rec: BuildingRec, parts: PartRec[], ctx: LandmarkCtx, h: Helpers): BuildOut {
  const C = G.carrousel;
  const shafts = parts.filter((p) => (p.height ?? 0) - (p.minHeight ?? 0) > 5 && footprintFrame(p.outer).a < 0.8);
  const base = h.generic(rec, parts.map((p) => (shafts.includes(p) ? { ...p, colour: G.colours.marble } : p)), ctx);
  const f = footprintFrame(rec.outer);
  const g = ctx.ground;
  const loc = (x: number, z: number): [number, number] => [(x - f.cx) * f.ux + (z - f.cz) * f.uz, -(x - f.cx) * f.uz + (z - f.cz) * f.ux];
  const k = new Sink();
  const M = paint(k, 'masonry', LC.stone);
  for (const p of parts) { // spandrels: round the rectangular openings under the lintel parts
    const mh = p.minHeight ?? 0;
    if (mh < 4 || mh > 10) continue;
    const us: number[] = [];
    for (let i = 0; i < p.outer.length; i += 2) us.push(loc(p.outer[i]!, p.outer[i + 1]!)[0]);
    const [u0, u1] = [Math.min(...us), Math.max(...us)];
    const r = (u1 - u0) / 2;
    const uc = (u0 + u1) / 2;
    if (r < 1 || r > 4 || mh - r < 1) continue;
    const a = arch(r, mh - r, 12).map((v, i) => (i % 2 === 0 ? v + uc : v));
    extrude(M, [uc - r, mh, ...a, uc + r, mh], 'z', -f.b, f.b);
  }
  const yTop = Math.max(0, ...parts.map((p) => p.height ?? 0)) || (rec.height ?? 17.5);
  const east = -f.uz * LF.ux + f.ux * LF.uz > 0 ? 1 : -1; // local +z points east?
  const dir = -east; // the quadriga faces west, to the Tuileries
  const br = k.buf('bronze');
  const kq = C.quadriga / 4.2;
  for (const x of [-1.35, -0.45, 0.45, 1.35]) horse(br, x * kq, yTop, dir * 0.9 * kq, dir, 0.9 * kq);
  const gold = k.buf('gold');
  box(gold, -1.1 * kq, 1.1 * kq, yTop + 0.4 * kq, yTop + 1.6 * kq, -dir * 1.9 * kq, -dir * 0.7 * kq);
  figure(gold, 0, -dir * 1.3 * kq, yTop + 1.2 * kq, 3 * kq, 0.45);
  for (const x of [-2.4, 2.4]) figure(gold, x * kq, -dir * 1.2 * kq, yTop, 2.4 * kq, 0.4);
  const ys = parts.filter((p) => (p.minHeight ?? 0) >= 11).map((p) => p.height ?? 0);
  const ySoldier = ys.length ? Math.min(...ys) : 12;
  const st = paint(k, 'masonry', LC.statue, 'near');
  for (const p of shafts) figure(st, ...loc(...centroid(p.outer)), ySoldier, C.soldier, 0.42);
  return join(base, placed(k.out(), f, g));
}

// ── Palais-Royal (OSM h30): massing like the Louvre (cornice / mansard est.); the Galerie d'Orléans (the double
//    colonnade between the Cour d'honneur and the garden) as a low arcaded zone; Buren's "Les Deux Plateaux" (1986:
//    black and white striped octagonal columns on a 3.19 m grid, up to ≈ 3.5 m est.) in the Cour d'honneur; Pol Bury's
//    steel sphere fountains. The Galeries de Valois / Montpensier / Beaujolais around the garden are other OSM outlines. ──

function palaisRoyal(rec: BuildingRec, parts: PartRec[], ctx: LandmarkCtx): BuildOut {
  const P = G.palaisRoyal;
  const k = new Sink();
  const rings = partRings(rec);
  if (!rings) return k.out();
  const f = footprintFrame(rec.outer);
  // ponytail: one outline prism, so the colonnade blocks walking into the garden; split the collider if a leg needs it
  massing(k, rings, { ox: f.cx, oz: f.cz, ux: f.ux, uz: f.uz }, (u, w) => zoneAt(P.base, P.zones, u, w), ctx);
  for (const p of parts) renderPart(p, { ground: ctx.ground, height: ctx.height, fallbackTop: 4 }, k);
  for (const a of rec.points ?? []) {
    if (a.kind !== 'artwork' || !a.r) continue;
    if (a.r >= 15) {
      const hole = rings.slice(1).find((hr) => inRing(a.x, a.z, hr));
      if (!hole) continue;
      const fh = footprintFrame(hole);
      const M = k.buf('masonry');
      const n = 8;
      for (let i = -fh.a + 2; i <= fh.a - 2; i += P.burenSpacing) {
        for (let j = -fh.b + 2; j <= fh.b - 2; j += P.burenSpacing) {
          const [x, z] = [fh.cx + i * fh.ux - j * fh.uz, fh.cz + i * fh.uz + j * fh.ux];
          if (!inRing(x, z, hole)) continue;
          const y = ctx.height(x, z);
          const hh = 0.1 + P.burenMax * hash01(x, z, 7) ** 1.6;
          const c = Array.from({ length: n }, (_, s): V3 => [x + P.burenR * Math.cos((s * Math.PI) / 4 + Math.PI / 8), 0, z + P.burenR * Math.sin((s * Math.PI) / 4 + Math.PI / 8)]);
          for (let s = 0; s < n; s++) {
            const [p, q] = [c[s]!, c[(s + 1) % n]!];
            M.color = s % 2 ? LC.black : LC.white;
            quadOut(M, [p[0], y - 0.2, p[2]], [q[0], y - 0.2, q[2]], [q[0], y + hh, q[2]], [p[0], y + hh, p[2]], [(p[0] + q[0]) / 2 - x, 0, (p[2] + q[2]) / 2 - z]);
          }
          M.color = LC.white;
          for (let s = 1; s + 1 < n; s++) triOut(M, [c[0]![0], y + hh, c[0]![2]], [c[s]![0], y + hh, c[s]![2]], [c[s + 1]![0], y + hh, c[s + 1]![2]], [0, 1, 0]);
          if (hh > 0.5) k.prism([c.flatMap((v) => [v[0], v[2]])], y - 0.2, y + hh);
        }
      }
    } else if (a.sub === 'sculpture' && a.r >= 2 && a.r <= 5) {
      const y = ctx.height(a.x, a.z);
      lathe(paint(k, 'masonry', LC.basin), [[a.r, y - 0.2], [a.r, y + 0.35], [a.r - 0.3, y + 0.35]], 20, a.x, a.z);
      const st = paint(k, 'metal', LC.steel);
      for (let i = 0; i < 3; i++) {
        const [sx, sz, sr] = [a.x + a.r * 0.4 * Math.cos(i * 2.1), a.z + a.r * 0.4 * Math.sin(i * 2.1), 0.45 + 0.25 * i];
        const prof = Array.from({ length: 7 }, (_, t) => [sr * Math.sin((t * Math.PI) / 6), y + 0.35 + sr * (1 - Math.cos((t * Math.PI) / 6))] as const);
        lathe(st, prof, 12, sx, sz, false);
      }
    }
  }
  return k.out();
}

export const details: Partial<Record<LandmarkId, DetailFn>> = {
  louvre: (rec, _parts, ctx) => louvre(rec, ctx),
  pyramid: (rec, _parts, ctx) => pyramid(rec, ctx),
  carrousel,
  'palais-royal': (rec, parts, ctx) => palaisRoyal(rec, parts, ctx),
  obelisk: (rec, _parts, ctx) => join(obelisk(rec, ctx), concorde(rec, ctx)),
  'concorde-fountains': (rec, _parts, ctx) => fountain(rec, ctx),
  vendome: (rec, _parts, ctx) => vendome(rec, ctx),
  madeleine,
  opera: (rec, parts, ctx) => opera(rec, parts, ctx),
};
