// Group g4 (SPEC §17.6, docs/plans/phase2b-assets.md §1 #2, #6, #8, #9, #12, #17, #27–29): Palais de Chaillot +
// Trocadéro, Palais de Tokyo, Grand Palais, Petit Palais, Musée d'Orsay, Palais Bourbon, Dôme + Hôtel des Invalides,
// École Militaire, Musée Rodin, Crazy Horse Paris (SPEC §17.8). A = OSM building:part through renderPart, B = the procedural details below.
// Everything is built in world coordinates into one Paint (a parts.ts Sink: one buffer per material + lod), so a
// landmark costs one draw call per material. Stone = 'masonry' tinted per building, windows / steel = tinted 'metal'.
// Small details (dormers, small statues, jets, clock hands) are LOD 'near'. Colliders: renderPart prisms plus boxes
// (columns, plinths, the Parvis) and ramps (stairs); never detail geometry. Numbers + sources: config landmarks.g4.
// DOM-free (chunk worker).
import { latLonToWorld } from '@race/shared';
import { landmarks as LM } from '../../config.ts';
import { type BuildingRec, type ChunkData, type LandmarkId, type LandmarkPoint, ringArea, type XZ } from '../../geo/chunkData.ts';
import { buildBuildings } from '../BuildingBuilder.ts';
import type { BuildOut, MaterialId } from '../buildTypes.ts';
import { MeshBuffer, mergeBuckets, triangulate, type V3 } from '../geom.ts';
import type { DetailFn, LandmarkCtx } from './index.ts';
import { type Frame, footprintFrame, loft, quadOut, triOut } from './kit.ts';
import { parseColour, type PartLike, partHeights, partRings, renderPart, roofShape, Sink } from './parts.ts';

const G = LM.g4;
const C = G.colours;
type P2 = [number, number];
type Lod = 'near' | undefined;
const rgb = (s: string): V3 => parseColour(s) ?? [1, 0, 1];
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Sink with tinted buffers: one per material + colour + lod, so a colour never leaks from one piece into the next;
 *  out() merges them back into one bucket per material + lod. */
class Paint extends Sink {
  private readonly tinted = new Map<string, [MeshBuffer, Lod]>();
  m(id: MaterialId, colour?: string, lod?: Lod): MeshBuffer {
    if (!colour) return this.buf(id, lod);
    const k = `${id}|${colour}|${lod ?? ''}`;
    let e = this.tinted.get(k);
    if (!e) {
      e = [new MeshBuffer(id), lod];
      e[0].color = rgb(colour);
      this.tinted.set(k, e);
    }
    return e[0];
  }
  override out(): BuildOut {
    const o = super.out();
    return { ...o, meshes: mergeBuckets([...o.meshes, ...[...this.tinted.values()].map(([b, lod]) => b.bucket(lod))]) };
  }
  /** Collider box / prism over a convex ring. */
  solid(r: P2[], y0: number, y1: number) {
    this.prism([r.flat()], y0, y1);
  }
  /** Collider quad (a ramp surface), both windings. */
  ramp(a: V3, b: V3, c: V3, d: V3) {
    const k = this.cv.length / 3;
    this.cv.push(...a, ...b, ...c, ...d);
    this.ci.push(k, k + 1, k + 2, k, k + 2, k + 3, k, k + 2, k + 1, k, k + 3, k + 2);
  }
}

// ── geometry (world space) ──

/** Convex ring (world xz) as a prism y0..y1 with its top (and optionally bottom) cap. */
function prism(b: MeshBuffer, r: P2[], y0: number, y1: number, bottom = false) {
  const R = (y: number) => r.map(([x, z]): V3 => [x, y, z]);
  const [lo, hi] = [R(y0), R(y1)];
  loft(b, [lo, hi]);
  for (let k = 1; k + 1 < r.length; k++) {
    triOut(b, hi[0]!, hi[k]!, hi[k + 1]!, [0, 1, 0]);
    if (bottom) triOut(b, lo[0]!, lo[k]!, lo[k + 1]!, [0, -1, 0]);
  }
}

/** Rectangle centred at (x, z): half-length ht along unit (tx, tz), half-depth hn along its normal (−tz, tx). */
function rect(x: number, z: number, tx: number, tz: number, ht: number, hn: number): P2[] {
  const [nx, nz] = [-tz, tx];
  return [
    [x - tx * ht - nx * hn, z - tz * ht - nz * hn], [x + tx * ht - nx * hn, z + tz * ht - nz * hn],
    [x + tx * ht + nx * hn, z + tz * ht + nz * hn], [x - tx * ht + nx * hn, z - tz * ht + nz * hn],
  ];
}

/** Frame-local (x along u, z along w) → world xz. */
const at = (f: Frame, x: number, z: number): P2 => [f.cx + x * f.ux - z * f.uz, f.cz + x * f.uz + z * f.ux];
const rectL = (f: Frame, x0: number, x1: number, z0: number, z1: number): P2[] => [at(f, x0, z0), at(f, x1, z0), at(f, x1, z1), at(f, x0, z1)];

/** The frame, flipped if needed so that w points along (dx, dz). */
const orient = (f: Frame, dx: number, dz: number): Frame => (-f.uz * dx + f.ux * dz >= 0 ? f : { ...f, ux: -f.ux, uz: -f.uz });

/** Smooth surface of revolution around the vertical through (x, z): profile [r, y] from bottom to top. */
function revolve(b: MeshBuffer, x: number, z: number, y0: number, prof: P2[], segs: number) {
  const base = b.vertexCount;
  const n = prof.length;
  for (let k = 0; k < n; k++) {
    const [p0, p1] = [prof[Math.max(k - 1, 0)]!, prof[Math.min(k + 1, n - 1)]!];
    let [nr, ny] = [p1[1] - p0[1], -(p1[0] - p0[0])];
    const l = Math.hypot(nr, ny) || 1;
    [nr, ny] = [nr / l, ny / l];
    for (let s = 0; s <= segs; s++) {
      const phi = (2 * Math.PI * s) / segs;
      const [c, sn] = [Math.cos(phi), Math.sin(phi)];
      b.vertex(x + prof[k]![0] * c, y0 + prof[k]![1], z + prof[k]![0] * sn, nr * c, ny, nr * sn, s / segs, prof[k]![1]);
    }
  }
  const row = segs + 1; // same winding as parts.ts lathe (emitted reversed)
  for (let k = 0; k + 1 < n; k++) {
    for (let s = 0; s < segs; s++) {
      const [a, bb, c, d] = [base + k * row + s, base + k * row + s + 1, base + (k + 1) * row + s + 1, base + (k + 1) * row + s];
      b.face(a, c, bb);
      b.face(a, d, c);
    }
  }
}

/** Points [s, y] of the upper half-ellipse over a span 2S: from (−S, y0) over (0, y0 + H) to (S, y0). */
const ellipseArc = (S: number, y0: number, H: number, n: number, from = 0, to = Math.PI): P2[] =>
  Array.from({ length: n + 1 }, (_, k) => {
    const th = from + ((to - from) * k) / n;
    return [-S * Math.cos(th), y0 + H * Math.sin(th)];
  });

/** Raised rib (width w, thickness t) along a curve [s, y] in the vertical plane through (ox, oz) along (hx, hz); the
 *  curve runs from −s over the top to +s, so the outward normal is its tangent turned left. */
function rib(b: MeshBuffer, ox: number, oz: number, hx: number, hz: number, pts: P2[], w: number, t: number) {
  const [ax, az] = [-hz, hx];
  let prev: V3[] | undefined;
  pts.forEach(([s, y], j) => {
    const [p0, p1] = [pts[Math.max(j - 1, 0)]!, pts[Math.min(j + 1, pts.length - 1)]!];
    let [ns, ny] = [-(p1[1] - p0[1]), p1[0] - p0[0]];
    const l = Math.hypot(ns, ny) || 1;
    [ns, ny] = [ns / l, ny / l];
    const P = (a: number, o: number): V3 => [ox + hx * (s + ns * o) + ax * a, y + ny * o, oz + hz * (s + ns * o) + az * a];
    const q = [P(-w / 2, 0), P(w / 2, 0), P(w / 2, t), P(-w / 2, t)];
    if (prev) {
      quadOut(b, prev[3]!, prev[2]!, q[2]!, q[3]!, [hx * ns, ny, hz * ns]);
      quadOut(b, prev[0]!, prev[3]!, q[3]!, q[0]!, [-ax, 0, -az]);
      quadOut(b, prev[1]!, prev[2]!, q[2]!, q[1]!, [ax, 0, az]);
    }
    prev = q;
  });
}

/** Flat convex polygon [s, y] in the vertical plane through (ox, oz) along (hx, hz), facing (nx, nz); uv = m / tile. */
function panel(b: MeshBuffer, ox: number, oz: number, hx: number, hz: number, poly: P2[], nx: number, nz: number, tile = 1) {
  const P = ([s, y]: P2): V3 => [ox + hx * s, y, oz + hz * s];
  const uv = (p: P2) => [p[0] / tile, p[1] / tile];
  for (let k = 1; k + 1 < poly.length; k++) {
    const [a, c, d] = [poly[0]!, poly[k]!, poly[k + 1]!];
    triOut(b, P(a), P(c), P(d), [nx, 0, nz], [...uv(a), ...uv(c), ...uv(d)]);
  }
}

interface Edge { ax: number; az: number; bx: number; bz: number; len: number; tx: number; tz: number; nx: number; nz: number }
/** Edges of rings in partRings orientation (solid on the right of each edge) with their outward unit normal. */
function edges(rings: XZ[]): Edge[] {
  const out: Edge[] = [];
  for (const r of rings) {
    for (let i = 0, n = r.length; i < n; i += 2) {
      const [ax, az, bx, bz] = [r[i]!, r[i + 1]!, r[(i + 2) % n]!, r[(i + 3) % n]!];
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 1e-3) continue;
      const [tx, tz] = [(bx - ax) / len, (bz - az) / len];
      out.push({ ax, az, bx, bz, len, tx, tz, nx: -tz, nz: tx });
    }
  }
  return out;
}

/** Ring offset d into the solid (partRings orientation; d < 0 = outward), miter limited. */
function inset(r: XZ, d: number): XZ {
  const n = r.length / 2;
  const nrm = (i: number): P2 => {
    const j = (i + 1) % n;
    const [dx, dz] = [r[2 * j]! - r[2 * i]!, r[2 * j + 1]! - r[2 * i + 1]!];
    const l = Math.hypot(dx, dz) || 1;
    return [dz / l, -dx / l];
  };
  const out: XZ = [];
  for (let i = 0; i < n; i++) {
    const [p, q] = [nrm((i + n - 1) % n), nrm(i)];
    const k = d / Math.max(1 + p[0] * q[0] + p[1] * q[1], 0.3);
    out.push(r[2 * i]! + (p[0] + q[0]) * k, r[2 * i + 1]! + (p[1] + q[1]) * k);
  }
  return out;
}

function inRing(x: number, z: number, r: XZ) {
  let inside = false;
  for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
    const [xi, zi, xj, zj] = [r[i]!, r[i + 1]!, r[j]!, r[j + 1]!];
    if (zi > z !== zj > z && x < xi + ((z - zi) / (zj - zi)) * (xj - xi)) inside = !inside;
  }
  return inside;
}

/** Keeps the part of ring r where nx·x + nz·z ≤ c (Sutherland–Hodgman). */
function clipRing(r: XZ, nx: number, nz: number, c: number): XZ {
  const out: XZ = [];
  const n = r.length / 2;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const [ax, az, bx, bz] = [r[2 * i]!, r[2 * i + 1]!, r[2 * j]!, r[2 * j + 1]!];
    const [da, db] = [nx * ax + nz * az - c, nx * bx + nz * bz - c];
    if (da <= 0) out.push(ax, az);
    if (da * db < 0) {
      const t = da / (da - db);
      out.push(ax + (bx - ax) * t, az + (bz - az) * t);
    }
  }
  return out;
}

// ── architectural pieces ──

/** Mansard over any footprint (courtyards too): slopes between successive insets [d, y] from the eaves (y0), a flat
 *  top over the last one, dormers (near) on the first slope every `dormer` m. */
function mansard(s: Paint, rings: XZ[], y0: number, steps: P2[], slope: string, top: [MaterialId, string?], dormer = 0) {
  const b = s.m('masonry', slope);
  let [prev, py] = [rings, y0];
  for (const [d, y] of steps) {
    const cur = rings.map((r) => inset(r, d));
    prev.forEach((r, ri) => {
      const q = cur[ri]!;
      for (let i = 0, n = r.length; i < n; i += 2) {
        const j = (i + 2) % n;
        const [dx, dz] = [r[j]! - r[i]!, r[j + 1]! - r[i + 1]!];
        quadOut(b, [r[i]!, py, r[i + 1]!], [r[j]!, py, r[j + 1]!], [q[j]!, y, q[j + 1]!], [q[i]!, y, q[i + 1]!], [-dz, 0.3 * Math.hypot(dx, dz), dx]);
      }
    });
    [prev, py] = [cur, y];
  }
  const tb = s.m(top[0], top[1]);
  const idx = triangulate(prev[0]!, prev.slice(1));
  const pts = prev.flat();
  const P = (i: number): V3 => [pts[2 * i]!, py, pts[2 * i + 1]!];
  const tile = top[0] === 'glass' ? LM.glassTile : 1;
  for (let k = 0; k < idx.length; k += 3) {
    const [a, c, d] = [P(idx[k]!), P(idx[k + 1]!), P(idx[k + 2]!)];
    triOut(tb, a, c, d, [0, 1, 0], [a[0] / tile, a[2] / tile, c[0] / tile, c[2] / tile, d[0] / tile, d[2] / tile]);
  }
  if (dormer > 0 && steps.length) dormers(s, rings, y0, (steps[0]![1] - y0) / steps[0]![0], dormer, slope);
}

/** Dormers (near) on a roof rising `slope` (rise / run) from the eaves ring at y0: box + gable + window. */
function dormers(s: Paint, rings: XZ[], y0: number, slope: number, pitch: number, colour: string) {
  const { w, h } = G.dormer;
  const depth = clamp((h + 0.4) / slope, 0.8, 5);
  const b = s.m('masonry', colour, 'near');
  const cheek = s.m('masonry', G.stone.invalides, 'near');
  const win = s.m('metal', C.window, 'near');
  for (const e of edges(rings)) {
    const n = Math.floor((e.len - 3) / pitch);
    if (n < 1) continue;
    for (let k = 0; k < n; k++) {
      const t = (e.len - (n - 1) * pitch) / 2 + k * pitch;
      const [fx, fz] = [e.ax + e.tx * t - e.nx * 0.15, e.az + e.tz * t - e.nz * 0.15];
      const [bx, bz] = [fx - e.nx * depth, fz - e.nz * depth];
      const yb = y0 + 0.15;
      const yt = yb + h;
      prism(cheek, [[fx - e.tx * w / 2, fz - e.tz * w / 2], [fx + e.tx * w / 2, fz + e.tz * w / 2], [bx + e.tx * w / 2, bz + e.tz * w / 2], [bx - e.tx * w / 2, bz - e.tz * w / 2]], yb, yt);
      const Lf: V3 = [fx - e.tx * (w / 2 + 0.15), yt, fz - e.tz * (w / 2 + 0.15)];
      const Rf: V3 = [fx + e.tx * (w / 2 + 0.15), yt, fz + e.tz * (w / 2 + 0.15)];
      const Af: V3 = [fx, yt + 0.8, fz];
      const [Lb, Rb, Ab] = [Lf, Rf, Af].map((p): V3 => [p[0] - e.nx * depth, p[1], p[2] - e.nz * depth]) as [V3, V3, V3];
      triOut(b, Lf, Rf, Af, [e.nx, 0, e.nz]);
      quadOut(b, Lf, Af, Ab, Lb, [-e.tx, 1, -e.tz]);
      quadOut(b, Af, Rf, Rb, Ab, [e.tx, 1, e.tz]);
      const o = 0.03;
      quadOut(win, [fx - e.tx * (w / 2 - 0.3) + e.nx * o, yb + 0.35, fz - e.tz * (w / 2 - 0.3) + e.nz * o], [fx + e.tx * (w / 2 - 0.3) + e.nx * o, yb + 0.35, fz + e.tz * (w / 2 - 0.3) + e.nz * o],
        [fx + e.tx * (w / 2 - 0.3) + e.nx * o, yt - 0.25, fz + e.tz * (w / 2 - 0.3) + e.nz * o], [fx - e.tx * (w / 2 - 0.3) + e.nx * o, yt - 0.25, fz - e.tz * (w / 2 - 0.3) + e.nz * o], [e.nx, 0, e.nz]);
    }
  }
}

/** Window quads just in front of every wall edge: rows [bottom y, height] (world), one per `pitch` m, none below the
 *  terrain (ground) or on edges where skip(e). */
function windows(s: Paint, rings: XZ[], rows: P2[], pitch: number, w: number, ground?: (x: number, z: number) => number, skip?: (e: Edge) => boolean, lod?: Lod) {
  const b = s.m('metal', C.window, lod);
  for (const e of edges(rings)) {
    if (e.len < pitch * 0.8 || skip?.(e)) continue;
    const n = Math.max(1, Math.round(e.len / pitch));
    for (let k = 0; k < n; k++) {
      const t = ((k + 0.5) / n) * e.len;
      const [cx, cz] = [e.ax + e.tx * t + e.nx * 0.08, e.az + e.tz * t + e.nz * 0.08];
      const g = ground ? ground(cx, cz) + 0.4 : -Infinity;
      const [lx, lz, rx, rz] = [cx - e.tx * w / 2, cz - e.tz * w / 2, cx + e.tx * w / 2, cz + e.tz * w / 2];
      for (const [y, h] of rows) if (y >= g) quadOut(b, [lx, y, lz], [rx, y, rz], [rx, y + h, rz], [lx, y + h, lz], [e.nx, 0, e.nz]);
    }
  }
}

/** Projecting cornice band (h high, `out` deep) with its top at y along every edge. */
function cornice(s: Paint, rings: XZ[], y: number, h: number, out: number, colour: string, lod?: Lod) {
  const b = s.m('masonry', colour, lod);
  for (const e of edges(rings)) {
    const [ax, az, bx, bz] = [e.ax - e.tx * out, e.az - e.tz * out, e.bx + e.tx * out, e.bz + e.tz * out];
    const [ox, oz] = [e.nx * out, e.nz * out];
    const [A, B, A2, B2]: V3[] = [[ax + ox, y - h, az + oz], [bx + ox, y - h, bz + oz], [ax + ox, y, az + oz], [bx + ox, y, bz + oz]];
    quadOut(b, A!, B!, B2!, A2!, [e.nx, 0, e.nz]);
    quadOut(b, [ax, y, az], [bx, y, bz], B2!, A2!, [0, 1, 0]);
    quadOut(b, [ax, y - h, az], [bx, y - h, bz], B!, A!, [0, -1, 0]);
  }
}

const colSegs = () => G.columnSegs;
/** Round column (base, tapered shaft, capital) from y0 to y1. */
function column(b: MeshBuffer, x: number, z: number, r: number, y0: number, y1: number) {
  const H = y1 - y0;
  revolve(b, x, z, y0, [[r * 1.3, 0], [r * 1.3, Math.min(0.5, H * 0.05)], [r, Math.min(0.6, H * 0.06)], [r * 0.88, H * 0.93], [r * 1.3, H], [0, H]], colSegs());
}

interface Colonnade { off: number; r: number; pitch: number; y0: number; y1: number; square?: boolean; ent?: number; podium?: number }
/** Columns (or square pillars) every `pitch` m of arc length along an edge chain, `off` m in front of the wall, an
 *  entablature from the wall to the columns on top and an optional podium below; column colliders. */
function colonnade(s: Paint, chain: Edge[], o: Colonnade, colour: string, ground?: (x: number, z: number) => number, t0 = 0, t1 = Infinity) {
  const b = s.m('masonry', colour);
  const depth = o.off + o.r + 0.4;
  let next = o.pitch / 2;
  let run = 0;
  for (const e of chain) {
    const [s0, s1] = [Math.max(0, t0 - run), Math.min(e.len, t1 - run)];
    if (s1 > s0) {
      const mid = (s0 + s1) / 2;
      const [mx, mz] = [e.ax + e.tx * mid + e.nx * depth / 2, e.az + e.tz * mid + e.nz * depth / 2];
      const ent = o.ent ?? 1.4;
      prism(b, rect(mx, mz, e.tx, e.tz, (s1 - s0) / 2 + 0.05, depth / 2), o.y1, o.y1 + ent, true);
      if (o.podium !== undefined) {
        const box = rect(mx, mz, e.tx, e.tz, (s1 - s0) / 2 + 0.05, depth / 2);
        const yb = (ground?.(mx, mz) ?? o.podium) - 0.5;
        prism(b, box, yb, o.podium);
        s.solid(box, yb, o.podium);
      }
    }
    for (; next <= e.len + run; next += o.pitch) {
      const t = next - run;
      if (next < t0 || next > t1) continue;
      const [x, z] = [e.ax + e.tx * t + e.nx * o.off, e.az + e.tz * t + e.nz * o.off];
      const yb = o.podium !== undefined ? o.podium : Math.min(o.y0, (ground?.(x, z) ?? o.y0) - 0.3);
      if (o.square) prism(b, rect(x, z, e.tx, e.tz, o.r, o.r), yb, o.y1);
      else column(b, x, z, o.r, yb, o.y1);
      if (o.podium === undefined) s.solid(rect(x, z, e.tx, e.tz, o.r, o.r), yb, o.y1);
    }
    run += e.len;
  }
}

/** Stairs rising from (x, z) along (dx, dz) over `run` m from y0 to y1, `width` wide: step boxes + a ramp collider. */
function stairs(s: Paint, x: number, z: number, dx: number, dz: number, width: number, run: number, y0: number, y1: number, colour: string) {
  const b = s.m('masonry', colour);
  const n = clamp(Math.round(Math.abs(y1 - y0) / 0.17), 1, 60);
  const lo = Math.min(y0, y1) - 0.5;
  for (let k = 0; k < n; k++) {
    const [ta, tb] = [(k * run) / n, run];
    const y = y0 + ((y1 - y0) * (k + 1)) / n;
    const c = (ta + tb) / 2;
    prism(b, rect(x + dx * c, z + dz * c, dx, dz, (tb - ta) / 2, width / 2), lo, y);
  }
  const [nx, nz] = [-dz * width / 2, dx * width / 2];
  s.ramp([x - nx, y0, z - nz], [x + nx, y0, z + nz], [x + dx * run + nx, y1, z + dz * run + nz], [x + dx * run - nx, y1, z + dz * run - nz]);
}

const FIGURE: P2[] = [[0.17, 0], [0.2, 0.28], [0.14, 0.48], [0.21, 0.62], [0.19, 0.7], [0.07, 0.74], [0.1, 0.8], [0.1, 0.9], [0, 1]];
/** Statue proxy (figure of revolution, h tall) on a plinth (plinth high, collider); small ones near-only. */
function figure(s: Paint, x: number, z: number, y0: number, h: number, mat: MaterialId, colour: string | undefined, plinth: number, stone: string) {
  if (plinth > 0) {
    const pw = Math.max(0.6, h * 0.3);
    prism(s.m('masonry', stone), rect(x, z, 1, 0, pw, pw), y0 - 0.4, y0 + plinth);
    s.solid(rect(x, z, 1, 0, pw, pw), y0 - 0.4, y0 + plinth);
  }
  revolve(s.m(mat, colour, h < G.lodSmall ? 'near' : undefined), x, z, y0 + plinth, FIGURE.map(([r, y]): P2 => [r * h, y * h]), 6);
}

/** Artwork points as figures on the terrain (statues ≈ 2.6 m, others 2.2 m unless tagged). */
function artworks(s: Paint, pts: LandmarkPoint[], ctx: LandmarkCtx, mat: MaterialId, colour: string | undefined, plinth: number, stone: string) {
  for (const p of pts) {
    if (p.kind !== 'artwork' || p.sub === 'mural' || p.sub === 'mosaic' || p.sub === 'painting') continue;
    const h = p.height && p.height < 12 ? p.height : p.sub === 'statue' ? 2.6 : 2.2;
    figure(s, p.x, p.z, ctx.height(p.x, p.z), h, mat, colour, plinth, stone);
  }
}

/** Four-horse chariot group facing (dx, dz), k ≈ metres per horse length / 2.4. */
function quadriga(s: Paint, x: number, z: number, y0: number, dx: number, dz: number, k: number, colour: string) {
  const b = s.m('metal', colour);
  const [tx, tz] = [-dz, dx];
  for (let i = 0; i < 4; i++) {
    const off = (i - 1.5) * 1.05 * k;
    const [hx, hz] = [x + tx * off + dx * 2.2 * k, z + tz * off + dz * 2.2 * k];
    prism(b, rect(hx, hz, dx, dz, 1.2 * k, 0.3 * k), y0 + 1.1 * k, y0 + 2 * k);
    prism(b, rect(hx + dx * 1.3 * k, hz + dz * 1.3 * k, dx, dz, 0.35 * k, 0.22 * k), y0 + 1.7 * k, y0 + 3.1 * k);
    prism(b, rect(hx + dx * 0.8 * k, hz + dz * 0.8 * k, dx, dz, 0.18 * k, 0.24 * k), y0, y0 + 1.3 * k);
    prism(b, rect(hx - dx * 0.9 * k, hz - dz * 0.9 * k, dx, dz, 0.18 * k, 0.24 * k), y0, y0 + 1.3 * k);
  }
  prism(b, rect(x, z, dx, dz, 0.9 * k, 1.3 * k), y0 + 0.5 * k, y0 + 1.7 * k);
  revolve(b, x, z, y0 + 1.7 * k, FIGURE.map(([r, y]): P2 => [r * 3.2 * k, y * 3.2 * k]), 6);
  for (const sgn of [-1, 1]) { // wings of the leading figure
    const [wx, wz] = [x + tx * sgn * 0.3 * k, z + tz * sgn * 0.3 * k];
    quadOut(b, [wx, y0 + 3.6 * k, wz], [wx + tx * sgn * 2 * k - dx * 0.8 * k, y0 + 5.4 * k, wz + tz * sgn * 2 * k - dz * 0.8 * k],
      [wx + tx * sgn * 1.6 * k - dx * 0.6 * k, y0 + 4.2 * k, wz + tz * sgn * 1.6 * k - dz * 0.6 * k], [wx, y0 + 4.3 * k, wz], [dx, 0, dz]);
  }
}

/** Clock dial of radius r at (x, y, z) facing (nx, nz): face + gilded rim, hands near-only. */
function clock(s: Paint, x: number, y: number, z: number, nx: number, nz: number, r: number) {
  const [tx, tz] = [-nz, nx];
  const P = (u: number, v: number, o: number): V3 => [x + tx * u + nx * o, y + v, z + tz * u + nz * o];
  const face = s.m('masonry', C.clock);
  const rim = s.m('gold');
  const hands = s.m('metal', C.hands, 'near');
  const N = 20;
  const n: V3 = [nx, 0, nz];
  for (let k = 0; k < N; k++) {
    const [a0, a1] = [(2 * Math.PI * k) / N, (2 * Math.PI * (k + 1)) / N];
    triOut(face, P(0, 0, 0.05), P(r * Math.cos(a0), r * Math.sin(a0), 0.05), P(r * Math.cos(a1), r * Math.sin(a1), 0.05), n);
    const R = r * 1.14;
    quadOut(rim, P(r * Math.cos(a0), r * Math.sin(a0), 0.08), P(R * Math.cos(a0), R * Math.sin(a0), 0.08), P(R * Math.cos(a1), R * Math.sin(a1), 0.08), P(r * Math.cos(a1), r * Math.sin(a1), 0.08), n);
  }
  const hw = r * 0.05;
  quadOut(hands, P(-hw, 0, 0.1), P(hw, 0, 0.1), P(hw, r * 0.82, 0.1), P(-hw, r * 0.82, 0.1), n);
  quadOut(hands, P(0, -hw, 0.11), P(r * 0.55, -hw, 0.11), P(r * 0.55, hw, 0.11), P(0, hw, 0.11), n);
}

/** Water jet cone (near). */
const jet = (s: Paint, x: number, z: number, y0: number, h: number, r: number) =>
  revolve(s.m('waterJet', undefined, 'near'), x, z, y0, [[r, 0], [r * 0.7, h * 0.55], [r * 0.25, h * 0.92], [0, h]], 6);

/** Meridian ribs (n, in n/2 full arcs) over a dome of revolution: centre, springing y0, radius R, rise H. */
function domeRibs(b: MeshBuffer, x: number, z: number, y0: number, R: number, H: number, n: number, w: number, t: number) {
  for (let i = 0; i < n / 2; i++) {
    const phi = (Math.PI * i) / (n / 2);
    rib(b, x, z, Math.cos(phi), Math.sin(phi), ellipseArc(R, y0, H, 16, 0.02, Math.PI - 0.02), w, t);
  }
}

/** Windows on a building:part's walls, one row per ~4.2 m storey below its eaves (parts ≥ 8 m, ≥ 60 m²). */
function partWindows(s: Paint, p: PartLike, ground: number, fallbackTop: number, pitch = 4.4) {
  if (p.kind === 'column' || p.kind === 'roof' || p.kind === 'steps') return;
  const rings = partRings(p);
  if (!rings) return;
  const f = footprintFrame(rings[0]!);
  const hh = partHeights(p, roofShape(p.roofShape), f, fallbackTop);
  if (!hh || hh.wallTop - hh.base < 6 || f.a * f.b * 4 < 60) return;
  const rows: P2[] = [];
  for (let y = hh.base + 1.2; y + 2.6 < hh.wallTop - 0.8; y += 4.2) rows.push([ground + y, 2.6]);
  windows(s, rings, rows, pitch, 1.5);
}

/** Wall colour for untinted stone parts (glass / gold / tagged parts keep theirs); untagged steps in stone too. */
const tint = <T extends PartLike>(p: T, stone: string): T => {
  const q = p.colour || p.material ? p : { ...p, colour: stone };
  return p.kind === 'steps' && !p.roofMaterial && !p.roofColour ? { ...q, roofColour: stone } : q;
};

const out = (s: Paint): BuildOut => s.out();

// ── landmarks ──

/** Grand Palais: OSM parts (vault gable ends glazed) + réséda steel ribs on the barrel vaults and dome, lantern + flag,
 *  colonnade with tall windows on the main (east, avenue Winston-Churchill) façade, the 3 arches of the central porch,
 *  windows, cornice, the 2 Récipon quadrigas on the corners of the main façade. */
const grandPalais: DetailFn = (rec, parts, ctx) => {
  const s = new Paint();
  const P = G.grandPalais;
  const stone = G.stone.grandPalais;
  const g = ctx.ground;
  const o = { ground: g, height: ctx.height, fallbackTop: 20 };
  for (const p of parts) renderPart(p.roofMaterial === 'glass' ? { ...p, colour: C.glazing } : tint(p, stone), o, s);
  const steel = s.m('metal', C.reseda);
  const domes = parts.filter((p) => roofShape(p.roofShape) === 'dome').map((p) => ({ p, f: footprintFrame(p.outer) }));
  for (const p of parts) {
    if (roofShape(p.roofShape) !== 'round') continue;
    const f0 = footprintFrame(p.outer);
    const f = p.roofOrientation === 'across' ? { ...f0, ux: -f0.uz, uz: f0.ux, a: f0.b, b: f0.a } : f0;
    const hh = partHeights(p, 'round', f, 20);
    if (!hh) continue;
    for (let u = -f.a + P.ribPitch / 2; u < f.a; u += P.ribPitch) {
      const [x, z] = at(f, u, 0);
      if (domes.some((d) => Math.hypot(x - d.f.cx, z - d.f.cz) < d.f.a + 1)) continue;
      rib(steel, x, z, -f.uz, f.ux, ellipseArc(f.b, g + hh.wallTop, hh.top - hh.wallTop, 10), 0.45, 0.3);
    }
  }
  for (const { p, f } of domes) {
    const hh = partHeights(p, 'dome', f, 20);
    if (!hh) continue;
    const [y0, H, R] = [g + hh.wallTop, hh.top - hh.wallTop, (f.a + f.b) / 2];
    domeRibs(steel, f.cx, f.cz, y0, R, H, P.domeRibs, 0.6, 0.35);
    for (const th of [0.35, 0.7]) revolve(steel, f.cx, f.cz, y0 + H * Math.sin(th) - 0.3, [[R * Math.cos(th) + 0.3, 0], [R * Math.cos(th) + 0.3, 0.6]], 24);
    const yt = g + hh.top;
    revolve(steel, f.cx, f.cz, yt - 0.6, [[3.2, 0], [3.2, 3.2], [3.8, 3.5], [2.4, P.lantern - 0.6], [0.4, P.lantern], [0, P.lantern + 0.2]], 12);
    prism(steel, rect(f.cx, f.cz, 1, 0, 0.08, 0.08), yt + P.lantern, yt + P.lantern + P.flagpole);
    const flag = s.m('masonry', undefined, 'near');
    ['#1f3c8a', '#f4f4f4', '#c8202f'].forEach((c, i) => {
      flag.color = rgb(c);
      const [x0, x1] = [f.cx + 0.1 + i * 0.8, f.cx + 0.1 + (i + 1) * 0.8];
      const [ya, yb] = [yt + P.lantern + P.flagpole - 1.7, yt + P.lantern + P.flagpole - 0.1];
      quadOut(flag, [x0, ya, f.cz], [x1, ya, f.cz], [x1, yb, f.cz], [x0, yb, f.cz], [0, 0, 1]);
      quadOut(flag, [x0, ya, f.cz], [x1, ya, f.cz], [x1, yb, f.cz], [x0, yb, f.cz], [0, 0, -1]);
    });
  }
  const rings = partRings(rec);
  if (!rings) return out(s);
  const isEast = (e: Edge) => e.nx > 0.9 && e.len > 12;
  const east = edges(rings).filter(isEast);
  const col = { ...P.colonnade, y0: g + P.colonnade.y0, y1: g + P.colonnade.y1, podium: g + P.colonnade.y0 };
  for (const e of east) colonnade(s, [e], col, stone, ctx.height, 2, e.len - 2);
  windows(s, rings, [[g + 1.2, 3.4], [g + 6.5, 6], [g + 14.2, 3.4]], 6.5, 2.6, ctx.height, isEast);
  windows(s, rings, [[g + 1.2, 3], [col.y0 + 1.5, col.y1 - col.y0 - 3.5]], P.colonnade.pitch, 2.4, ctx.height, (e) => !isEast(e));
  cornice(s, rings, g + 19.6, 1.1, 0.8, stone);
  // central porch (the tallest stone part on the east façade): 3 arches with stone archivolts
  const porch = parts.filter((p) => !p.roofMaterial && !p.minHeight).map((p) => ({ p, f: footprintFrame(p.outer) }))
    .filter(({ f }) => east.some((e) => Math.abs((f.cx - e.ax) * e.nx + (f.cz - e.az) * e.nz) < f.b + 3)).sort((a, b) => (b.p.height ?? 0) - (a.p.height ?? 0))[0];
  if (porch) {
    const f = orient(porch.f, 1, 0); // w → east
    for (const [u, r, spring] of P.porchArches) {
      const [px, pz] = at(f, u, f.b + 0.1);
      const arch: P2[] = [[-r, g + 1.5], [r, g + 1.5], ...ellipseArc(r, g + spring, r, 10).reverse()];
      panel(s.m('metal', C.window), px, pz, f.ux, f.uz, arch, -f.uz, f.ux);
      rib(s.m('masonry', stone), px, pz, f.ux, f.uz, ellipseArc(r + 0.7, g + spring, r + 0.7, 12), 1.4, 0.6);
    }
  }
  // quadrigas: on the stone attic at both ends of the main façade, facing out diagonally
  const pts = east.flatMap((e) => [[e.ax, e.az], [e.bx, e.bz]] as P2[]);
  if (pts.length) {
    const byZ = pts.sort((a, b) => a[1] - b[1]);
    for (const [[x0, z0], sz] of [[byZ[0]!, -1], [byZ.at(-1)!, 1]] as const) {
      const [x, z] = [x0 - P.quadrigaInset, z0 - sz * P.quadrigaInset];
      const top = Math.max(0, ...parts.filter((p) => p.roofMaterial !== 'glass' && inRing(x, z, p.outer)).map((p) => p.height ?? 0));
      quadriga(s, x, z, g + (top || P.quadriga), Math.SQRT1_2, sz * Math.SQRT1_2, 1.6, C.verdigris);
    }
  }
  return out(s);
};

/** Petit Palais: stone mass to the cornice, slate + glass roof, west portal (arch, gilded gate, steps) under the
 *  dome, Ionic colonnade either side of it, windows, cornice, statues. */
const petitPalais: DetailFn = (rec, _parts, ctx) => {
  const s = new Paint();
  const P = G.petitPalais;
  const stone = G.stone.petitPalais;
  const g = ctx.ground;
  const rings = partRings(rec);
  if (!rings) return out(s);
  renderPart({ ...rec, height: P.cornice, roofShape: 'flat', colour: stone }, { ground: g, height: ctx.height, fallbackTop: P.cornice }, s);
  mansard(s, rings, g + P.cornice, [[2.4, g + P.roofTop]], C.slate, ['glass']);
  cornice(s, rings, g + P.cornice, 1.2, 0.8, stone);
  const f = footprintFrame(rings[0]!);
  const west = edges(rings).filter((e) => e.nx < -0.9 && e.len > 6);
  // portal on the west façade where it crosses the frame's centre line
  let door: { e: Edge; t: number } | undefined;
  for (const e of west) {
    const t = ((f.cx - e.ax) * f.ux + (f.cz - e.az) * f.uz) / (e.tx * f.ux + e.tz * f.uz || 1e-9);
    if (t > 0 && t < e.len && (!door || e.len > door.e.len)) door = { e, t };
  }
  const main = west.reduce<Edge | undefined>((a, e) => (!a || e.len > a.len ? e : a), undefined);
  door ??= main && { e: main, t: main.len / 2 };
  const skipPorch = (e: Edge) => !!door && e.nx < -0.9 && Math.abs((e.ax + e.bx) / 2 - door.e.ax) < 3 && Math.hypot((e.ax + e.bx) / 2 - (door.e.ax + door.e.tx * door.t), (e.az + e.bz) / 2 - (door.e.az + door.e.tz * door.t)) < P.porchW;
  windows(s, rings, [[g + 1.2, 2.2], [g + P.colonnade.y0 + 1.5, 7.5]], 5.5, 2.6, ctx.height, skipPorch);
  if (door) {
    const { e, t } = door;
    const [px, pz] = [e.ax + e.tx * t, e.az + e.tz * t];
    const b = s.m('masonry', stone);
    const porch = rect(px + e.nx * (P.porchOut / 2 - 0.5), pz + e.nz * (P.porchOut / 2 - 0.5), e.tx, e.tz, P.porchW / 2, P.porchOut / 2 + 0.5);
    prism(b, porch, ctx.minGround - 0.5, g + P.porchTop);
    s.solid(porch, ctx.minGround - 0.5, g + P.porchTop);
    cornice(s, [porch.flat()], g + P.porchTop, 1.2, 0.6, stone);
    // arch opening: dark recess + gilded gate, on the porch front
    const [fx, fz] = [px + e.nx * (P.porchOut + 0.06), pz + e.nz * (P.porchOut + 0.06)];
    const yb = g + P.colonnade.y0;
    const r = 5.2;
    const archPoly: P2[] = [[-r, yb], [r, yb], ...(ellipseArc(r, yb + 9, r, 10).reverse())];
    panel(s.m('metal', C.window), fx, fz, e.tx, e.tz, archPoly, e.nx, e.nz);
    panel(s.m('gold'), fx + e.nx * 0.05, fz + e.nz * 0.05, e.tx, e.tz, [[-r * 0.8, yb], [r * 0.8, yb], [r * 0.8, yb + 8], [-r * 0.8, yb + 8]], e.nx, e.nz);
    rib(s.m('masonry', stone), fx, fz, e.tx, e.tz, ellipseArc(r + 0.6, yb + 9, r + 0.6, 12), 1.2, 0.5);
    stairs(s, px + e.nx * (P.porchOut + 9), pz + e.nz * (P.porchOut + 9), -e.nx, -e.nz, P.porchW * 0.8, 9, ctx.height(px + e.nx * 14, pz + e.nz * 14), yb, stone);
    // dome over the portal: drum, lead dome with stone ribs, lantern
    const [dx, dz] = [px - e.nx * (P.domeR + 1), pz - e.nz * (P.domeR + 1)];
    const yd = g + P.cornice + 5;
    revolve(b, dx, dz, g + P.cornice - 1, [[P.domeR, 0], [P.domeR, 6], [P.domeR + 0.5, 6.2], [P.domeR + 0.5, 6.8]], 24);
    const H = P.dome - 3.5 - (P.cornice + 5.8);
    revolve(s.m('masonry', C.lead), dx, dz, yd + 0.8, ellipseArc(P.domeR, 0, H, 10, 0, Math.PI / 2).map(([x, y]): P2 => [-x, y]), 24);
    domeRibs(s.m('masonry', stone), dx, dz, yd + 0.8, P.domeR, H, 12, 0.5, 0.3);
    revolve(b, dx, dz, g + P.dome - 3.5, [[1.6, 0], [1.6, 2], [2, 2.2], [0.6, 3], [0, 3.5]], 12);
    colonnade(s, west, { ...P.colonnade, y0: g + P.colonnade.y0, y1: g + P.colonnade.y1, podium: g + P.colonnade.y0 }, stone, ctx.height, 0, Infinity);
  }
  artworks(s, rec.points ?? [], ctx, 'bronze', undefined, 1.6, stone);
  return out(s);
};

/** Musée d'Orsay: stone block to the cornice, stepped slate mansard with dormers, iron-glass nave vault along the long
 *  axis ending in the great west arch, the two clock pavilions on the Seine façade, 7 arched bays between them,
 *  windows, cornice, statues on the esplanade. Heights count from the quay (the Seine façade). */
const orsay: DetailFn = (rec, _parts, ctx) => {
  const s = new Paint();
  const P = G.orsay;
  const stone = G.stone.orsay;
  const rings = partRings(rec);
  if (!rings) return out(s);
  const f = orient(footprintFrame(rings[0]!), 0, -1); // w → north (the Seine)
  const [qx, qz] = at(f, 0, f.b + 4);
  const g = clamp(ctx.height(qx, qz), ctx.minGround, ctx.ground);
  const wx = f.ux < 0 ? 1 : -1; // local x sign of the west end
  renderPart({ ...rec, height: P.cornice, roofShape: 'flat', colour: stone }, { ground: g, height: ctx.height, fallbackTop: P.cornice }, s);
  mansard(s, rings, g + P.cornice, P.mansard.map(([d, y]): P2 => [d, g + y]), C.slate, ['masonry', C.zinc], 5);
  cornice(s, rings, g + P.cornice, 1.3, 0.9, stone);
  windows(s, rings, [[g + 1.5, 3.2], [g + 7, 4.2], [g + 13.5, 4.2]], 5, 2, ctx.height, (e) => e.nz < -0.8);
  // nave vault: glass crown, zinc haunches, iron ribs; west end = the great glazed arch
  const [x0, x1] = [wx * (f.a + 0.3), wx * (f.a - P.naveLen)];
  const arc = ellipseArc(P.naveHalf, g + P.vaultSpring, P.vaultTop - P.vaultSpring, 12);
  const glass = s.m('glass');
  const zinc = s.m('masonry', C.zinc);
  for (let j = 0; j + 1 < arc.length; j++) {
    const [a, b] = [arc[j]!, arc[j + 1]!];
    const W = (x: number, [sv, y]: P2): V3 => { const [px, pz] = at(f, x, sv); return [px, y, pz]; };
    const th = (Math.PI * (j + 0.5)) / (arc.length - 1);
    const [nx, nz] = at({ ...f, cx: 0, cz: 0 }, 0, -Math.cos(th));
    const tile = LM.glassTile;
    const buf = th > 0.28 * Math.PI && th < 0.72 * Math.PI ? glass : zinc;
    const t = buf === glass ? tile : 1;
    quadOut(buf, W(x0, a), W(x1, a), W(x1, b), W(x0, b), [nx, Math.sin(th), nz], x0 / t, 0, x1 / t, Math.hypot(b[0] - a[0], b[1] - a[1]) / t);
  }
  const iron = s.m('metal', '#3e464d');
  for (let x = Math.min(x0, x1) + 3; x < Math.max(x0, x1); x += 6) {
    const [px, pz] = at(f, x, 0);
    rib(iron, px, pz, -f.uz, f.ux, arc, 0.35, 0.25);
  }
  const [ex, ez] = at(f, x0, 0);
  // the great glazed arch of the west (esplanade) façade, from the entrance canopy up into the vault, stone archivolt
  const S = P.naveHalf - 2;
  panel(glass, ex, ez, -f.uz, f.ux, [[-S, g + P.westSill], [S, g + P.westSill], ...ellipseArc(S, g + P.vaultSpring, P.vaultTop - P.vaultSpring - 1, 12).reverse()], f.ux * wx, f.uz * wx, LM.glassTile);
  rib(s.m('masonry', stone), ex, ez, -f.uz, f.ux, [[-S - 0.8, g + P.westSill], ...ellipseArc(S + 0.8, g + P.vaultSpring, P.vaultTop - P.vaultSpring - 0.2, 14), [S + 0.8, g + P.westSill]], 1.6, 0.9);
  const [ex1, ez1] = at(f, x1, 0);
  panel(zinc, ex1, ez1, -f.uz, f.ux, [[-P.naveHalf, g + P.vaultSpring], [P.naveHalf, g + P.vaultSpring], ...arc.slice(1, -1).reverse()], -f.ux * wx, -f.uz * wx);
  // clock pavilions at both ends of the Seine façade
  const half = P.pavilion / 2;
  const b = s.m('masonry', stone);
  const slate = s.m('masonry', C.slate);
  for (const sx of [-1, 1]) {
    const [xc, zc] = [sx * (f.a - half), f.b - half + 1];
    const ring = (h: number, y: number): V3[] => rectL(f, xc - h, xc + h, zc - h, zc + h).map(([x, z]): V3 => [x, y, z]);
    const box = rectL(f, xc - half, xc + half, zc - half, zc + half);
    prism(b, box, ctx.minGround - 0.5, g + P.pavilionWall);
    s.solid(box, ctx.minGround - 0.5, g + P.pavilionWall);
    cornice(s, [box.flat()], g + P.pavilionWall, 1.3, 0.8, stone);
    loft(slate, [ring(half + 0.3, g + P.pavilionWall), ring(half - 1.7, g + P.height - 4), ring(half - 5, g + P.height - 1)]);
    const top = ring(half - 5, g + P.height - 1);
    quadOut(slate, top[0]!, top[1]!, top[2]!, top[3]!, [0, 1, 0]);
    const [cx, cz] = at(f, xc, zc);
    prism(s.m('gold'), rect(cx, cz, f.ux, f.uz, 0.5, 0.5), g + P.height - 1, g + P.height);
    // clock in a stone aedicule on the Seine face of the roof
    const aed = rectL(f, xc - 3.8, xc + 3.8, zc + half - 3.2, zc + half + 0.2);
    prism(b, aed, g + P.pavilionWall, g + P.pavilionWall + 8.6);
    const [kx, kz] = at(f, xc, zc + half + 0.2);
    clock(s, kx, g + P.pavilionWall + 4.2, kz, -f.uz, f.ux, P.clockR);
  }
  // 7 arched bays between the pavilions (Seine façade), pilasters between them, 3 statues on the attic
  const span = 2 * (f.a - P.pavilion);
  const pitch = span / P.arches;
  const r = pitch * 0.32;
  const stoneB = s.m('masonry', stone);
  for (let k = 0; k < P.arches; k++) {
    const x = -span / 2 + pitch * (k + 0.5);
    const [px, pz] = at(f, x, f.b + 0.12);
    const yb = g + 3.5;
    panel(glass, px, pz, f.ux, f.uz, [[-r, yb], [r, yb], ...ellipseArc(r, g + 11, r * 1.1, 10).reverse()], -f.uz, f.ux, LM.glassTile);
    rib(stoneB, px, pz, f.ux, f.uz, ellipseArc(r + 0.5, g + 11, r * 1.1 + 0.5, 12), 1, 0.45);
    const [lx, lz] = at(f, x - pitch / 2, f.b);
    const pil = rect(lx - f.uz * 0.3, lz + f.ux * 0.3, f.ux, f.uz, 0.9, 0.3);
    prism(stoneB, pil, ctx.height(lx, lz) - 0.3, g + P.cornice - 1);
  }
  for (const x of [-span / 4, 0, span / 4]) {
    const [px, pz] = at(f, x, f.b - 1);
    figure(s, px, pz, g + P.cornice, 4, 'masonry', stone, 0.8, stone);
  }
  artworks(s, rec.points ?? [], ctx, 'bronze', undefined, 1.8, stone);
  return out(s);
};

/** The ring minus the strip in front of each colonnade on its boundary (≥ 2 columns under one raised part, ≤ 20 m from
 *  the ring): cut by the plane along that part's inner edge, so a fill never swallows the columns. */
function behindColonnades(outer: XZ, parts: PartLike[]): XZ {
  const cols = parts.filter((p) => p.kind === 'column').map((p) => footprintFrame(p.outer));
  const o = footprintFrame(outer);
  let ring = outer;
  for (const c of parts) {
    if (c.kind === 'column' || !c.minHeight) continue;
    const inside = cols.filter((k) => inRing(k.cx, k.cz, c.outer));
    if (inside.length < 2) continue;
    const [mx, mz] = [inside.reduce((a, k) => a + k.cx, 0) / inside.length, inside.reduce((a, k) => a + k.cz, 0) / inside.length];
    if (ringDistance(outer, mx, mz) > 20) continue;
    const f = footprintFrame(c.outer);
    const sg = -f.uz * (mx - o.cx) + f.ux * (mz - o.cz) > 0 ? 1 : -1; // short axis, away from the building centre
    const [nx, nz] = [-f.uz * sg, f.ux * sg];
    let back = Infinity; // the raised part's inner edge (the portico's back)
    for (let i = 0; i < c.outer.length; i += 2) back = Math.min(back, nx * c.outer[i]! + nz * c.outer[i + 1]!);
    ring = clipRing(ring, nx, nz, back - 0.1);
  }
  return ring.length >= 6 ? ring : outer;
}

/** Distance from (x, z) to the nearest edge of ring r. */
function ringDistance(r: XZ, x: number, z: number) {
  let d = Infinity;
  for (let i = 0, n = r.length; i < n; i += 2) {
    const [ax, az, bx, bz] = [r[i]!, r[i + 1]!, r[(i + 2) % n]!, r[(i + 3) % n]!];
    const l2 = (bx - ax) ** 2 + (bz - az) ** 2 || 1e-9;
    const t = clamp(((x - ax) * (bx - ax) + (z - az) * (bz - az)) / l2, 0, 1);
    d = Math.min(d, Math.hypot(ax + (bx - ax) * t - x, az + (bz - az) * t - z));
  }
  return d;
}

/** Palais Bourbon: OSM parts (peristyle of 12 columns, pediment, steps), gaps of the outline filled low (never in front
 *  of a colonnade), carved tympanum, windows, statues. The DEM falls ≈ 5 m toward the quay under the (flat) site, so
 *  each part counts from the terrain under it (a column from that under the part it carries). */
const bourbon: DetailFn = (rec, parts, ctx, h) => {
  const s = new Paint();
  const stone = G.stone.bourbon;
  const gAt = (p: PartLike) => {
    const f = footprintFrame(p.outer);
    const c = p.kind === 'column' && parts.find((q) => q.kind !== 'column' && (q.minHeight ?? 0) > 0 && inRing(f.cx, f.cz, q.outer));
    const fc = c ? footprintFrame(c.outer) : f;
    return clamp(ctx.height(fc.cx, fc.cz), ctx.minGround, ctx.ground);
  };
  const o = { ground: ctx.minGround, height: ctx.height, fallbackTop: G.bourbon.fill };
  for (const p of parts) {
    const g = gAt(p);
    renderPart(tint(p, stone), { ...o, ground: g }, s);
    partWindows(s, p, g, G.bourbon.fill);
  }
  if (h.coverage(rec, parts) < LM.partCoverage) renderPart({ ...rec, outer: behindColonnades(rec.outer, parts), height: G.bourbon.fill, roofShape: 'flat', colour: stone }, o, s);
  const ped = parts.filter((p) => p.roofOrientation === 'across' && roofShape(p.roofShape) === 'gabled' && (p.minHeight ?? 0) > 10)
    .map((p) => ({ p, f: footprintFrame(p.outer) })).sort((a, b) => b.f.a - a.f.a)[0];
  if (ped) {
    const hh = partHeights(ped.p, 'gabled', ped.f, 20);
    const g = gAt(ped.p);
    const rel = s.m('masonry', '#cdbf9f');
    // the portico's shaded back wall, so the columns read against it
    const f0 = footprintFrame(rec.outer);
    const sgIn = -ped.f.uz * (f0.cx - ped.f.cx) + ped.f.ux * (f0.cz - ped.f.cz) > 0 ? 1 : -1;
    const base = Math.min(...parts.filter((p) => p.kind === 'column' && inRing(footprintFrame(p.outer).cx, footprintFrame(p.outer).cz, ped.p.outer)).map((p) => p.minHeight ?? 0));
    if (Number.isFinite(base)) {
      const [bx, bz] = at(ped.f, 0, sgIn * (ped.f.b - 0.12));
      panel(s.m('masonry', C.portico), bx, bz, ped.f.ux, ped.f.uz, [[-ped.f.a + 0.8, g + base], [ped.f.a - 0.8, g + base], [ped.f.a - 0.8, g + (ped.p.minHeight ?? 0)], [-ped.f.a + 0.8, g + (ped.p.minHeight ?? 0)]], ped.f.uz * sgIn, -ped.f.ux * sgIn);
    }
    for (const sw of [-1, 1]) {
      if (!hh) break;
      const [px, pz] = at(ped.f, 0, sw * (ped.f.b + 0.12));
      const [nx, nz] = [-ped.f.uz * sw, ped.f.ux * sw];
      const [y0, y1] = [g + hh.wallTop + 0.6, g + hh.top - 0.9];
      panel(rel, px, pz, ped.f.ux, ped.f.uz, [[-ped.f.a * 0.8, y0], [ped.f.a * 0.8, y0], [0, y1]], nx, nz);
      for (const k of [-3, -2, -1, 0, 1, 2, 3]) { // relief figures
        const [fx, fz] = at(ped.f, k * ped.f.a * 0.18, sw * (ped.f.b + 0.3));
        const fh = (y1 - y0) * (1 - Math.abs(k) / 4) * 0.8;
        prism(rel, rect(fx, fz, ped.f.ux, ped.f.uz, 0.45, 0.25), y0, y0 + fh);
      }
    }
  }
  artworks(s, rec.points ?? [], ctx, 'masonry', '#ece7dc', 2.4, stone);
  return out(s);
};

/** Dôme des Invalides: OSM parts, spire redrawn to the 107 m cross, gilded ribs + dome dormers, paired drum columns
 *  with windows, gilded trophies on the attic, windows on the church. */
const invalides: DetailFn = (_rec, parts, ctx) => {
  const s = new Paint();
  const P = G.invalides;
  const stone = G.stone.invalides;
  const g = ctx.ground;
  const o = { ground: g, height: ctx.height, fallbackTop: 28 };
  let spire: [number, number] | undefined;
  for (const p of parts) {
    if (roofShape(p.roofShape) === 'cone' && (p.minHeight ?? 0) > 70) {
      const f = footprintFrame(p.outer);
      spire = [f.cx, f.cz];
      continue;
    }
    renderPart(tint(p, stone), o, s);
    if ((p.height ?? 0) < 32) partWindows(s, p, g, 28, 6);
  }
  const dome = parts.find((p) => roofShape(p.roofShape) === 'dome' && p.roofMaterial === 'gold');
  const gold = s.m('gold');
  if (dome) {
    const f = footprintFrame(dome.outer);
    spire ??= [f.cx, f.cz];
    const hh = partHeights(dome, 'dome', f, 70);
    if (hh) {
      const [y0, H, R] = [g + hh.wallTop, hh.top - hh.wallTop, (f.a + f.b) / 2];
      domeRibs(gold, f.cx, f.cz, y0, R, H, P.ribs, 0.8, 0.45);
      const lead = s.m('masonry', C.lead, 'near');
      for (let k = 0; k < P.ribs; k++) { // lucarnes between the ribs at the foot of the dome
        const phi = (2 * Math.PI * (k + 0.5)) / P.ribs;
        const [c, sn] = [Math.cos(phi), Math.sin(phi)];
        const th = 0.3;
        const [rr, yy] = [R * Math.cos(th), y0 + H * Math.sin(th)];
        const box = rect(f.cx + c * (rr - 0.4), f.cz + sn * (rr - 0.4), -sn, c, 0.9, 1);
        prism(lead, box, yy - 1.4, yy + 1.4);
        revolve(gold, f.cx + c * (rr + 0.3), f.cz + sn * (rr + 0.3), yy + 1.4, [[0.5, 0], [0.3, 0.8], [0, 1.2]], 6);
      }
    }
    // drum: paired columns + windows, gilded trophies on the attic
    const drum = parts.filter((p) => !p.roofShape && (p.minHeight ?? 0) > 30 && (p.height ?? 0) < 48).map((p) => ({ p, f: footprintFrame(p.outer) }))[0];
    if (drum) {
      const [Rd, yb, yt] = [(drum.f.a + drum.f.b) / 2, g + (drum.p.minHeight ?? 34), g + (drum.p.height ?? 46)];
      const b = s.m('masonry', stone);
      const win = s.m('metal', C.window);
      for (let k = 0; k < 12; k++) {
        const phi = (2 * Math.PI * k) / 12;
        for (const d of [-0.07, 0.07]) column(b, drum.f.cx + Math.cos(phi + d) * (Rd + 0.9), drum.f.cz + Math.sin(phi + d) * (Rd + 0.9), 0.55, yb, yt - 1);
        const ph = phi + Math.PI / 12;
        const [c, sn] = [Math.cos(ph), Math.sin(ph)];
        const [wx, wz] = [drum.f.cx + c * (Rd + 0.08), drum.f.cz + sn * (Rd + 0.08)];
        quadOut(win, [wx + sn * 1.1, yb + 2, wz - c * 1.1], [wx - sn * 1.1, yb + 2, wz + c * 1.1], [wx - sn * 1.1, yt - 3, wz + c * 1.1], [wx + sn * 1.1, yt - 3, wz - c * 1.1], [c, 0, sn]);
        const ta = phi + Math.PI / 12;
        revolve(s.m('gold', undefined, 'near'), drum.f.cx + Math.cos(ta) * (Rd + 0.4), drum.f.cz + Math.sin(ta) * (Rd + 0.4), g + 48.1, [[0.55, 0], [0.75, 0.7], [0.35, 1.5], [0.6, 1.9], [0, 2.8]], 6);
      }
    }
  }
  if (spire) { // lantern top → spire, globe and cross (P.height)
    const [x, z] = spire;
    const yb = g + P.spireBase;
    revolve(gold, x, z, yb, [[0.9, 0], [0.75, 4], [0.35, 15], [0.12, P.globe - P.spireBase - 0.8]], 8);
    revolve(gold, x, z, g + P.globe - 0.85, Array.from({ length: 9 }, (_, k): P2 => [0.85 * Math.sin((Math.PI * k) / 8), 0.85 - 0.85 * Math.cos((Math.PI * k) / 8)]), 8); // globe
    prism(gold, rect(x, z, 1, 0, 0.12, 0.12), g + P.globe + 0.8, g + P.height);
    prism(gold, rect(x, z + 0, 1, 0, 0.9, 0.12), g + P.height - 1.9, g + P.height - 1.6);
  }
  return out(s);
};

/** Hôtel des Invalides: the courtyard ranges to the cornice with a slate mansard + dormers over every range, windows
 *  and cornice on all façades (courtyards too); OSM parts (north pavilion, south blocks) likewise. */
const hotelInvalides: DetailFn = (rec, parts, ctx) => {
  const s = new Paint();
  const P = G.hotelInvalides;
  const stone = G.stone.invalides;
  const rings = partRings(rec);
  if (!rings) return out(s);
  const f = footprintFrame(rings[0]!);
  const g = clamp(ctx.height(f.cx, f.cz), ctx.minGround, ctx.ground);
  const o = { ground: g, height: ctx.height, fallbackTop: P.cornice };
  renderPart({ ...rec, height: P.cornice, roofShape: 'flat', colour: stone }, o, s);
  mansard(s, rings, g + P.cornice, P.mansard.map(([d, y]): P2 => [d, g + y]), C.slate, ['masonry', C.lead], P.dormerPitch);
  windows(s, rings, [[g + 1.4, 2.8], [g + 6.1, 2.8], [g + 10.8, 2.8]], 4.6, 1.7, ctx.height);
  cornice(s, rings, g + P.cornice, 0.9, 0.6, stone);
  for (const p of parts) {
    const pr = partRings(p);
    const shape = roofShape(p.roofShape);
    if (pr && shape === 'hipped' && p.height && footprintFrame(pr[0]!).a > 20) { // big blocks: mansard over the ranges
      const eave = p.height - (p.roofHeight ?? 5);
      renderPart({ ...p, height: eave, roofShape: 'flat', colour: stone, roofColour: undefined }, o, s);
      mansard(s, pr, g + eave, [[2, g + p.height - 1], [3.4, g + p.height]], C.slate, ['masonry', C.lead], P.dormerPitch);
      windows(s, pr, [[g + 1.4, 2.8], [g + 5.6, 2.8]], 4.6, 1.7, ctx.height);
      cornice(s, pr, g + eave, 0.8, 0.5, stone);
    } else renderPart({ ...tint(p, stone), ...(p.roofColour?.toUpperCase() === '#2A2E52' && { roofColour: C.slate }) }, o, s);
  }
  return out(s);
};

/** École Militaire: OSM parts with its slate roofs (the 'brown' / navy colour tags), the quadrangular dome as a square
 *  dome with lantern, the Champ-de-Mars clock under it, outline gaps filled low, windows, statues. */
const ecole: DetailFn = (rec, parts, ctx, h) => {
  const s = new Paint();
  const stone = G.stone.ecole;
  const g = ctx.ground;
  const fix = <T extends PartLike>(p: T): T => {
    const c = p.roofColour?.toLowerCase();
    return { ...tint(p, stone), ...(c && (c === 'brown' || c === '#2a2e52') && { roofColour: C.slate }) };
  };
  const o = { ground: g, height: ctx.height, fallbackTop: h.outlineTop(rec, ctx.def) };
  let drawn = 0;
  let fill = G.ecole.fillMax;
  for (const p of parts) {
    const q = fix(p);
    const pr = partRings(p);
    if (!pr) continue;
    const pf = footprintFrame(pr[0]!);
    const shape = roofShape(p.roofShape);
    const hh = partHeights(q, shape, pf, o.fallbackTop);
    if (hh && p.kind !== 'column') fill = Math.min(fill, hh.wallTop);
    if (shape === 'dome' && hh && hh.top > 15 && pr.length === 1) { // quadrangular dome
      renderPart({ ...q, height: hh.wallTop, roofShape: 'flat' }, o, s);
      const slate = s.m('masonry', C.slate);
      const H = hh.top - hh.wallTop;
      const rings = Array.from({ length: 7 }, (_, k): V3[] => {
        const th = (k / 6) * (Math.PI / 2) * 0.96;
        return rectL(pf, -pf.a * Math.cos(th), pf.a * Math.cos(th), -pf.b * Math.cos(th), pf.b * Math.cos(th)).map(([x, z]): V3 => [x, g + hh.wallTop + H * Math.sin(th), z]);
      });
      loft(slate, rings);
      const t = rings.at(-1)!;
      quadOut(slate, t[0]!, t[1]!, t[2]!, t[3]!, [0, 1, 0]);
      revolve(s.m('masonry', stone), pf.cx, pf.cz, g + hh.top - 0.3, [[1.3, 0], [1.3, 1.6], [1.6, 1.8], [0.3, 2.6], [0, 2.8]], 8);
      const th = (G.ecole.clockBearing * Math.PI) / 180;
      const [bx, bz] = [Math.sin(th), -Math.cos(th)];
      const side = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([su, sw]) => {
        const [x, z] = at(pf, su! * pf.a, sw! * pf.b);
        const [nx, nz] = [x - pf.cx, z - pf.cz];
        const l = Math.hypot(nx, nz) || 1;
        return { x, z, nx: nx / l, nz: nz / l };
      }).sort((a, b) => b.nx * bx + b.nz * bz - (a.nx * bx + a.nz * bz))[0]!;
      clock(s, side.x + side.nx * 0.15, g + hh.wallTop - G.ecole.clockR - 0.5, side.z + side.nz * 0.15, side.nx, side.nz, G.ecole.clockR);
      for (const sg of [-1, 1]) figure(s, side.x + side.nx * 0.8 - side.nz * sg * 3.4, side.z + side.nz * 0.8 + side.nx * sg * 3.4, g + hh.wallTop - 0.2, 2.4, 'masonry', stone, 0, stone);
      drawn++;
      continue;
    }
    if (renderPart(q, o, s)) drawn++;
    partWindows(s, q, g, o.fallbackTop);
  }
  if (!drawn) {
    renderPart(fix(rec), o, s);
    partWindows(s, fix(rec), g, o.fallbackTop);
  } else if (h.coverage(rec, parts) < LM.partCoverage) {
    renderPart({ ...fix(rec), height: Math.max(3, fill), roofShape: 'flat', roofHeight: undefined, levels: undefined }, o, s);
  }
  artworks(s, rec.points ?? [], ctx, 'bronze', undefined, 1.4, stone);
  return out(s);
};

/** Musée Rodin (Hôtel Biron): 3 levels, hipped slate roof with dormers, central avant-corps with pediments, windows,
 *  cornice, bronze sculptures in the gardens. */
const rodin: DetailFn = (rec, _parts, ctx) => {
  const s = new Paint();
  const P = G.rodin;
  const stone = G.stone.rodin;
  const g = ctx.ground;
  const f0 = footprintFrame(rec.outer);
  // ponytail: the outline's sub-metre pilaster notches → its frame rectangle (clean walls, windows, hipped roof); the
  // real façades are straight to within ≈ 0.5 m.
  const rings = partRings({ outer: rectL(f0, -f0.a, f0.a, -f0.b, f0.b).flat() });
  if (!rings) return out(s);
  renderPart({ ...rec, outer: rings[0]!, height: P.height, roofShape: 'hipped', roofHeight: P.height - P.cornice, colour: stone, roofColour: C.slate, levels: undefined }, { ground: g, height: ctx.height, fallbackTop: P.height }, s);
  windows(s, rings, P.windowRows.map(([y, hh]): P2 => [g + y, hh]), 3.4, 1.5, ctx.height);
  cornice(s, rings, g + P.cornice, 0.7, 0.5, stone);
  const f = footprintFrame(rings[0]!);
  dormers(s, rings, g + P.cornice, (P.height - P.cornice) / f.b, 4.4, C.slate);
  const b = s.m('masonry', stone);
  for (const sw of [-1, 1]) {
    const bay = rectL(f, -5.5, 5.5, sw * (f.b - 0.2), sw * (f.b + 1.2));
    prism(b, bay, ctx.minGround - 0.3, g + P.cornice);
    windows(s, partRings({ outer: bay.flat() }) ?? [], P.windowRows.map(([y, hh]): P2 => [g + y, hh]), 3.4, 1.5);
    const [px, pz] = at(f, 0, sw * (f.b + 1.2));
    const tri: P2[] = [[-6.2, g + P.cornice], [6.2, g + P.cornice], [0, g + P.cornice + 3]];
    for (const d of [0, -1.4]) panel(b, px - f.uz * sw * d, pz + f.ux * sw * d, f.ux, f.uz, tri, -f.uz * sw, f.ux * sw);
    const [qx, qz] = at(f, 0, sw * (f.b + 0.5));
    prism(b, rect(qx, qz, f.ux, f.uz, 6.2, 0.7), g + P.cornice - 0.6, g + P.cornice); // pediment soffit
  }
  artworks(s, rec.points ?? [], ctx, 'bronze', undefined, P.plinth, '#cfc8ba');
  return out(s);
};

/** Palais de Tokyo wing: marble mass (height from the Wilson side), skylights on the flat roof (OSM parts), windows,
 *  cornice, steps from the court down toward the quay, statues.
 *  The building=roof record (the peristyle canopy between the wings, way/79219265) becomes an
 *  entablature on square pillars. */
const tokyo: DetailFn = (rec, parts, ctx) => {
  const s = new Paint();
  const P = G.tokyo;
  const stone = G.stone.tokyo;
  const g = ctx.ground;
  const rings = partRings(rec);
  if (!rings) return out(s);
  if (rec.kind === 'roof') {
    const top = g + P.colonnadeH;
    renderPart({ outer: rings[0]!, kind: 'yes', minHeight: P.colonnadeH, height: P.colonnadeH + 1.8, colour: stone }, { ground: g, height: ctx.height, fallbackTop: 0 }, s);
    const b = s.m('masonry', stone);
    for (const e of edges(rings)) {
      for (let t = P.pillarPitch / 2; t < e.len; t += P.pillarPitch) {
        const [x, z] = [e.ax + e.tx * t - e.nx * P.pillarSize, e.az + e.tz * t - e.nz * P.pillarSize];
        const r = rect(x, z, e.tx, e.tz, P.pillarSize / 2, P.pillarSize / 2);
        prism(b, r, ctx.height(x, z) - 0.3, top);
        s.solid(r, ctx.height(x, z) - 0.3, top);
      }
    }
    return out(s);
  }
  const roof = P.height - P.skylight;
  const o = { ground: g, height: ctx.height, fallbackTop: roof };
  renderPart({ ...rec, height: roof, roofShape: 'flat', colour: stone, material: undefined }, o, s);
  for (const p of parts) {
    if (!p.roofShape || p.roofShape === 'flat') continue;
    renderPart({ ...p, minHeight: roof, height: P.height, roofHeight: P.skylight * 0.8, colour: stone }, o, s);
  }
  cornice(s, rings, g + roof + 0.9, 1.4, 0.5, stone);
  windows(s, rings, [[g - 9, 4.5], [g - 3.5, 4.5], [g + 2, 6]], 4.4, 2.2, ctx.height);
  const f = footprintFrame(rings[0]!);
  const [cx, cz] = [G.tokyo.court[0], G.tokyo.court[1]]; // the court-side peristyle is the building=roof record
  // steps: from the court centre toward the quay (the frame's long axis end nearest the Seine = lower terrain)
  const [ax, az] = at(f, f.a, 0);
  const [bx, bz] = at(f, -f.a, 0);
  const down = ctx.height(ax, az) < ctx.height(bx, bz) ? 1 : -1;
  const [dx, dz] = [f.ux * down, f.uz * down];
  const [sx, sz] = [cx + dx * 4, cz + dz * 4];
  const run = P.stairRun;
  if (f.cx < cx) stairs(s, sx + dx * run, sz + dz * run, -dx, -dz, P.stairWidth, run, ctx.height(sx + dx * run, sz + dz * run), ctx.height(sx, sz), stone);
  artworks(s, rec.points ?? [], ctx, 'bronze', undefined, 1.5, stone);
  return out(s);
};

/** Palais de Chaillot wing: head pavilion (Parvis end, higher terrain), curved gallery arm with the garden colonnade
 *  (square pillars, concave side), end pavilion; windows, cornices. The second wing built in a chunk also builds the
 *  raised Parvis between the two head pavilions (paving slab + collider, balustrade, stairs down to the gardens), the
 *  gilded statues on it, the other statues and the Trocadéro fountain jets of both wings. */
const pendingWing = new Map<string, BuildingRec>(); // ponytail: pairs the 2 wings per chunk (both are in chunk -10_1)
const chaillot: DetailFn = (rec, _parts, ctx) => {
  const s = new Paint();
  const P = G.chaillot;
  const stone = G.stone.chaillot;
  const rings = partRings(rec);
  if (!rings) return out(s);
  const outer = rings[0]!;
  const f = footprintFrame(outer);
  const n = outer.length / 2;
  const proj = (i: number) => (outer[2 * i]! - f.cx) * f.ux + (outer[2 * i + 1]! - f.cz) * f.uz;
  const terrainEnd = (sg: number) => {
    let [sum, k] = [0, 0];
    for (let i = 0; i < n; i++) if (sg * proj(i) > f.a - P.headLen) (sum += ctx.height(outer[2 * i]!, outer[2 * i + 1]!)), k++;
    return k ? sum / k : -Infinity;
  };
  const hs = terrainEnd(1) >= terrainEnd(-1) ? 1 : -1; // head end = uphill (the Parvis)
  let yRef = -Infinity;
  for (let i = 0; i < n; i++) if (hs * proj(i) > f.a - P.headLen) yRef = Math.max(yRef, ctx.height(outer[2 * i]!, outer[2 * i + 1]!));
  // split along u: head | arm | end pavilion (planes u·p = const, in the head-end direction)
  const [ux, uz] = [f.ux * hs, f.uz * hs];
  const c0 = ux * f.cx + uz * f.cz;
  const head = clipRing(outer, -ux, -uz, -(c0 + f.a - P.headLen));
  const armEnd = clipRing(outer, ux, uz, c0 + f.a - P.headLen);
  const arm = clipRing(armEnd, -ux, -uz, -(c0 - f.a + P.endLen));
  const end = clipRing(armEnd, ux, uz, c0 - f.a + P.endLen);
  const o = (above: number) => ({ ground: yRef, height: ctx.height, fallbackTop: above });
  const pieces: [XZ, number][] = [[head, P.headAbove], [arm, P.armAbove], [end, P.endAbove]];
  for (const [r, above] of pieces) {
    const pr = r.length >= 6 ? partRings({ outer: r }) : undefined;
    if (!pr) continue;
    renderPart({ outer: pr[0]!, kind: 'yes', height: above, colour: stone }, o(above), s);
    cornice(s, pr, yRef + above, 1.2, 0.45, stone);
    const rows: P2[] = [];
    for (let y = yRef - 14; y + 4 < yRef + above - 2.5; y += 5.5) rows.push([y, 3.6]);
    windows(s, pr, rows, 5, 1.4, ctx.height);
  }
  // garden colonnade on the concave side of the arm (edges facing the fitted circle centre)
  const armRings = arm.length >= 6 ? partRings({ outer: arm }) : undefined;
  const cc = circleCentre(outer);
  if (armRings && cc) {
    const chain = edges(armRings).filter((e) => e.len > 0.5 && e.nx * (cc[0] - e.ax) + e.nz * (cc[1] - e.az) > 0);
    colonnade(s, chain, { off: P.pillarOff, r: P.pillarSize / 2, pitch: P.pillarPitch, y0: yRef, y1: yRef + P.armAbove - 2.6, square: true, ent: 1.4 }, stone, ctx.height);
  }
  const other = pendingWing.get(ctx.key);
  if (!other || (other.outer[0] === rec.outer[0] && other.outer[1] === rec.outer[1])) {
    pendingWing.set(ctx.key, rec);
    return out(s);
  }
  pendingWing.delete(ctx.key);
  parvis(s, rec, other, ctx, yRef);
  return out(s);
};

/** Algebraic (Kåsa) circle fit through a ring's vertices → centre, or undefined when degenerate. */
function circleCentre(r: XZ): P2 | undefined {
  const n = r.length / 2;
  const [mx, mz] = [r.filter((_, i) => i % 2 === 0).reduce((a, v) => a + v, 0) / n, r.filter((_, i) => i % 2 === 1).reduce((a, v) => a + v, 0) / n];
  let [suu, suv, svv, suuu, svvv, suvv, svuu] = [0, 0, 0, 0, 0, 0, 0];
  for (let i = 0; i < n; i++) {
    const [u, v] = [r[2 * i]! - mx, r[2 * i + 1]! - mz];
    [suu, suv, svv] = [suu + u * u, suv + u * v, svv + v * v];
    [suuu, svvv, suvv, svuu] = [suuu + u * u * u, svvv + v * v * v, suvv + u * v * v, svuu + v * u * u];
  }
  const det = suu * svv - suv * suv;
  if (Math.abs(det) < 1e-9) return undefined;
  const [bu, bv] = [(suuu + suvv) / 2, (svvv + svuu) / 2];
  return [mx + (bu * svv - bv * suv) / det, mz + (bv * suu - bu * suv) / det];
}

/** The raised Parvis between the two Chaillot head pavilions + statues and fountain jets of both wings. */
function parvis(s: Paint, a: BuildingRec, b: BuildingRec, ctx: LandmarkCtx, yRef: number) {
  const P = G.chaillot;
  const stone = G.stone.chaillot;
  let best = { d: Infinity, pa: [0, 0] as P2, pb: [0, 0] as P2 };
  for (let i = 0; i < a.outer.length; i += 2) {
    for (let j = 0; j < b.outer.length; j += 2) {
      const d = Math.hypot(a.outer[i]! - b.outer[j]!, a.outer[i + 1]! - b.outer[j + 1]!);
      if (d < best.d) best = { d, pa: [a.outer[i]!, a.outer[i + 1]!], pb: [b.outer[j]!, b.outer[j + 1]!] };
    }
  }
  const [mx, mz] = [(best.pa[0] + best.pb[0]) / 2, (best.pa[1] + best.pb[1]) / 2];
  const [cx, cz] = [(best.pb[0] - best.pa[0]) / best.d, (best.pb[1] - best.pa[1]) / best.d];
  let [dx, dz] = [-cz, cx]; // along the axis, toward the gardens (downhill)
  if (ctx.height(mx + dx * 40, mz + dz * 40) > ctx.height(mx - dx * 40, mz - dz * 40)) [dx, dz] = [-dx, -dz];
  let [back, front] = [Infinity, -Infinity];
  for (const r of [a.outer, b.outer]) {
    for (let i = 0; i < r.length; i += 2) {
      const [px, pz] = [r[i]! - mx, r[i + 1]! - mz];
      if (Math.abs(px * cx + pz * cz) > best.d / 2 + P.headLen) continue;
      const t = px * dx + pz * dz;
      if (Math.hypot(px, pz) < P.headLen * 2.5) [back, front] = [Math.min(back, t), Math.max(front, t)];
    }
  }
  if (!Number.isFinite(back)) return;
  front += P.parvisFront;
  const hw = best.d / 2 - 0.2;
  const [pcx, pcz] = [mx + dx * (back + front) / 2, mz + dz * (back + front) / 2];
  const slab = rect(pcx, pcz, dx, dz, (front - back) / 2, hw);
  let [yTop, yLow] = [ctx.height(mx + dx * back, mz + dz * back), Infinity];
  for (let u = 0; u <= 6; u++) {
    for (let v = 0; v <= 6; v++) {
      const [t, w] = [back + ((front - back) * u) / 6, -hw + (2 * hw * v) / 6];
      const y = ctx.height(mx + dx * t + cx * w, mz + dz * t + cz * w);
      if (u < 2) yTop = Math.max(yTop, y);
      yLow = Math.min(yLow, y);
    }
  }
  yTop = Math.min(yTop + 0.05, yRef + 1);
  const pave = s.m('masonry', C.paving);
  prism(pave, slab, yLow - 1, yTop);
  s.solid(slab, yLow - 1, yTop);
  // balustrade along the terrace edge, open in the middle for the stairs
  const bal = s.m('masonry', stone);
  const [fx, fz] = [mx + dx * front, mz + dz * front];
  const side = (hw - P.stairWidth / 2) / 2;
  for (const sg of [-1, 1]) {
    const c = P.stairWidth / 2 + side;
    const r = rect(fx - dx * 0.3 + cx * sg * c, fz - dz * 0.3 + cz * sg * c, cx, cz, side, 0.3);
    prism(bal, r, yTop, yTop + 1.1);
    s.solid(r, yTop, yTop + 1.1);
  }
  const yGarden = ctx.height(fx + dx * P.stairRun, fz + dz * P.stairRun);
  if (yGarden < yTop - 0.5) stairs(s, fx + dx * P.stairRun, fz + dz * P.stairRun, -dx, -dz, P.stairWidth, P.stairRun, yGarden, yTop, stone);
  // statues: gilded ones on the Parvis (OSM artwork inside the slab, else 4 per side), bronze ones elsewhere
  const pts = [...(a.points ?? []), ...(b.points ?? [])];
  const onParvis = (p: LandmarkPoint) => {
    const [px, pz] = [p.x - mx, p.z - mz];
    const t = px * dx + pz * dz;
    return t > back && t < front && Math.abs(px * cx + pz * cz) < hw;
  };
  const gilded = pts.filter((p) => p.kind === 'artwork' && (p.sub === 'statue' || p.sub === 'sculpture') && onParvis(p));
  const spots: P2[] = gilded.length >= 4 ? gilded.map((p) => [p.x, p.z]) : [-1, 1].flatMap((sg) =>
    [0.2, 0.4, 0.6, 0.8].map((k): P2 => [mx + dx * (back + (front - back) * k) + cx * sg * (hw - 6), mz + dz * (back + (front - back) * k) + cz * sg * (hw - 6)]));
  for (const [x, z] of spots) figure(s, x, z, yTop, P.statue, 'gold', undefined, P.statuePlinth, stone);
  artworks(s, pts.filter((p) => !onParvis(p)), ctx, 'bronze', undefined, 1.8, stone);
  for (const p of pts) if (p.kind === 'fountain') jet(s, p.x, p.z, ctx.height(p.x, p.z), p.sub === 'isolated' ? P.jetIsolated : P.jet, 0.35);
}

/** Façade toward a point: the straight run of the outline (consecutive edges within `angle`°, ≥ minLen m) nearest to
 *  (px, pz). a → b along the run, (nx, nz) = outward unit normal. */
export function facadeRun(rec: BuildingRec, px: number, pz: number, minLen: number, angle: number) {
  const r = partRings(rec)?.[0];
  if (!r) return undefined;
  const n = r.length / 2;
  const dir = (i: number) => Math.atan2(r[(2 * i + 3) % r.length]! - r[2 * i + 1]!, r[(2 * i + 2) % r.length]! - r[2 * i]!);
  const turn = (i: number, j: number) => Math.abs(((dir(i) - dir(j) + 3 * Math.PI) % (2 * Math.PI)) - Math.PI);
  const lim = (angle * Math.PI) / 180;
  let i0 = 0;
  while (i0 < n && turn((i0 + n - 1) % n, i0) < lim) i0++;
  i0 %= n;
  let best: { a: P2; b: P2; d: number } | undefined;
  for (let k = 0; k < n; ) {
    const s = (i0 + k) % n;
    let e = k + 1;
    while (e < n && turn(s, (i0 + e) % n) < lim) e++;
    const a: P2 = [r[2 * s]!, r[2 * s + 1]!];
    const j = (i0 + e) % n;
    const b: P2 = [r[2 * j]!, r[2 * j + 1]!];
    const [dx, dz] = [b[0] - a[0], b[1] - a[1]];
    const len = Math.hypot(dx, dz);
    const t = clamp(((px - a[0]) * dx + (pz - a[1]) * dz) / (len * len || 1), 0, 1);
    const d = Math.hypot(a[0] + dx * t - px, a[1] + dz * t - pz);
    if (len >= minLen && (!best || d < best.d)) best = { a, b, d };
    k = e;
  }
  if (!best) return undefined;
  const len = Math.hypot(best.b[0] - best.a[0], best.b[1] - best.a[1]);
  const [tx, tz] = [(best.b[0] - best.a[0]) / len, (best.b[1] - best.a[1]) / len];
  return { a: best.a, b: best.b, len, tx, tz, nx: -tz, nz: tx }; // CCW ring (partRings): outward = (−tz, tx)
}

/** Crazy Horse Paris: the Haussmann block as any other (BuildingBuilder: shopfronts, window grid, mansard, balconies,
 *  its collider) + the cabaret frontage on its Avenue George V run (facadeRun toward the OSM node): dark ground floor,
 *  door, red marquise with a black valance, "CRAZY HORSE / PARIS" board (canvas lettering, 'neonSign'), pink neon strips and
 *  warm globes ('neon', near only). The 1-level retail box in front of the block's north end (way/69486351, 1.4 m deep)
 *  is the dark showcase the marquise rests on. ponytail: built alone, so its party walls get façades + mansard insets (hidden
 *  inside the neighbours, a 1.2 m roof gap); pass the chunk's neighbours to buildBuildings if it shows from above. */
const crazyHorse: DetailFn = (rec, _parts, ctx) => {
  const P = G.crazyHorse;
  if (Math.abs(ringArea(rec.outer)) < P.showcaseArea) {
    const s = new Paint();
    const f = footprintFrame(rec.outer);
    const [y0, y1, e] = [ctx.minGround - 0.3, ctx.ground + P.canopy.y, 0.03];
    const box = rectL(f, -f.a, f.a, -f.b, f.b);
    prism(s.m('metal', P.colours.front), box, y0, y1);
    prism(s.m('neon', P.colours.neon, 'near'), rectL(f, -f.a - e, f.a + e, -f.b - e, f.b + e), y1 - P.neon, y1);
    s.solid(box, y0, y1);
    return out(s);
  }
  const { landmark: _l, parts: _p, points: _q, ...plain } = rec;
  const block = buildBuildings({ buildings: [plain] } as ChunkData, ctx);
  const K = P.colours;
  const node = latLonToWorld(P.node[0], P.node[1]);
  const run = facadeRun(rec, node.x, node.z, P.minRun, P.runAngle);
  if (!run) return block;
  const { a, len, tx, tz, nx, nz } = run;
  const s = new Paint();
  const g = ctx.ground;
  const W = (u: number, d: number): P2 => [a[0] + tx * u + nx * d, a[1] + tz * u + nz * d];
  const V = (u: number, y: number, d: number): V3 => [a[0] + tx * u + nx * d, y, a[1] + tz * u + nz * d];
  const fbox = (b: MeshBuffer, u0: number, u1: number, y0: number, y1: number, d0: number, d1: number) =>
    prism(b, [W(u0, d0), W(u1, d0), W(u1, d1), W(u0, d1)], y0, y1, true);
  const face = (b: MeshBuffer, u0: number, u1: number, y0: number, y1: number, d: number, uv = [0, 0, 1, 1]) =>
    quadOut(b, V(u0, y0, d), V(u1, y0, d), V(u1, y1, d), V(u0, y1, d), [nx, 0, nz], uv[0], uv[1], uv[2], uv[3]);
  const half = Math.max(P.canopy.w, P.sign.w) / 2;
  const ue = clamp((node.x - a[0]) * tx + (node.z - a[1]) * tz, Math.min(half, len / 2), Math.max(len - half, len / 2)); // entrance

  // frontage (whole run) + door
  const yb = Math.min(ctx.height(...W(0, 0)), ctx.height(...W(len, 0)), ctx.height(...W(ue, 0))) - 0.3;
  face(s.m('metal', K.front), 0, len, yb, g + P.frontH, P.frontOut);
  const D = P.door;
  face(s.m('metal', K.valance), ue - D.w / 2, ue + D.w / 2, yb, g + D.h, P.frontOut + 0.02);
  const fr = s.m('masonry', K.frame);
  for (const e of [-1, 1]) fbox(fr, ue + e * (D.w / 2) - D.frame / 2, ue + e * (D.w / 2) + D.frame / 2, yb, g + D.h, 0, P.frontOut + 0.12);
  fbox(fr, ue - D.w / 2 - D.frame / 2, ue + D.w / 2 + D.frame / 2, g + D.h, g + D.h + D.frame, 0, P.frontOut + 0.12);

  // marquise: red slab, black valance hanging round its free edges
  const Cn = P.canopy;
  const [c0, c1, cy] = [ue - Cn.w / 2, ue + Cn.w / 2, g + Cn.y];
  fbox(s.m('masonry', K.canopy), c0, c1, cy, cy + Cn.thick, 0, Cn.depth);
  const val = s.m('metal', K.valance);
  fbox(val, c0, c1, cy - Cn.valance, cy, Cn.depth - 0.08, Cn.depth);
  for (const u of [c0, c1 - 0.08]) fbox(val, u, u + 0.08, cy - Cn.valance, cy, 0, Cn.depth - 0.08);

  // board + lettering (u = 0 → 1 left to right as seen from the avenue)
  const S = P.sign;
  const [s0, s1, sy] = [ue - S.w / 2, ue + S.w / 2, g + S.y];
  fbox(s.m('metal', K.board), s0, s1, sy, sy + S.h, 0, S.out);
  const rightward = tz * nx - tx * nz < 0; // viewer looks along −n, right = (nz, −nx)
  face(s.m('neonSign'), s0, s1, sy + 0.06, sy + S.h - 0.06, S.out + 0.01, rightward ? [0, 0, 1, 1] : [1, 0, 0, 1]);

  // neon tubes (near): frontage top, marquise edges, door jambs, board outline
  const t = P.neon;
  const neon = s.m('neon', K.neon, 'near');
  fbox(neon, 0, len, g + P.frontH - t, g + P.frontH, P.frontOut, P.frontOut + t);
  fbox(neon, c0, c1, cy - Cn.valance - t, cy - Cn.valance, Cn.depth - t, Cn.depth + 0.02);
  fbox(neon, c0, c1, cy + Cn.thick, cy + Cn.thick + t, Cn.depth - t, Cn.depth);
  for (const e of [-1, 1]) fbox(neon, ue + e * (D.w / 2 + D.frame) - t / 2, ue + e * (D.w / 2 + D.frame) + t / 2, yb + 0.3, g + D.h, P.frontOut, P.frontOut + t);
  fbox(neon, s0 - t, s1 + t, sy - t, sy, 0, S.out + t);
  fbox(neon, s0 - t, s1 + t, sy + S.h, sy + S.h + t, 0, S.out + t);
  // globes under the marquise + 2 wall lamps beside the door (near)
  const lamp = s.m('neon', K.lamp, 'near');
  const z = P.lampSize / 2;
  for (let k = 0; k < P.lamps; k++) {
    const u = c0 + ((k + 0.5) / P.lamps) * Cn.w;
    fbox(lamp, u - z, u + z, cy - P.lampSize - 0.05, cy - 0.05, Cn.depth * 0.55 - z, Cn.depth * 0.55 + z);
  }
  for (const e of [-1, 1]) {
    const u = ue + e * (D.w / 2 + D.frame + 0.6);
    fbox(lamp, u - z, u + z, g + 2.3, g + 2.3 + P.lampSize * 1.4, P.frontOut + 0.1, P.frontOut + 0.1 + P.lampSize);
  }
  const d = s.out();
  return { meshes: mergeBuckets([...block.meshes, ...d.meshes]), instances: [], colliders: block.colliders };
};

export const details: Partial<Record<LandmarkId, DetailFn>> = {
  'grand-palais': grandPalais,
  'petit-palais': petitPalais,
  orsay,
  'palais-bourbon': bourbon,
  invalides,
  'hotel-invalides': hotelInvalides,
  'ecole-militaire': ecole,
  rodin,
  chaillot,
  'palais-de-tokyo': tokyo,
  'crazy-horse': crazyHorse,
};

