// Leg 2 landmark group m2 (docs/plans/leg2-landmarks.md §4, agent o2): hill forts, Chinese temples, the Lou Lim Ioc garden and
// three hill churches, built in code from the OSM outlines (no downloads). Tunables: config landmarks.m2 (published figures
// cited there, the rest est.). Night: 'neon' buckets only (unlit MeshBasic, colour × lighting.emissiveScale; the chunk worker
// cannot tell day from night, so lanterns / windows / the beacon read as coloured glass by day). Colliders: platforms, walls,
// halls, steps (ramp), never detail geometry (SPEC §5.9).
//   fortaleza-monte: terrace on the hilltop + battered outer wall down the slope, parapet, merlons, cannons, gate steps.
//   fortaleza-guia: low walls following the hilltop, merlons, gate gap. farol-guia: the 15 m white lighthouse (OSM h ignored).
//   templo-ama: terraces up the Barra hill, granite gate with lions, three halls with curved roofs, lanterns, incense coils.
//   kun-iam-tong: each of the three OSM halls = a hall with a curved roof + ceramic ridge figures; the main one gets a forecourt.
//   jardim-lou-lim-ioc: white wall with a moon gate along the park outline, pavilions, rockery (the zig-zag bridge is an OSM bridge).
//   sao-lourenco / santo-agostinho / ermida-penha: platform + steps, nave with a gable roof, façade (towers / pediment), windows.
import { landmarks as L, lighting as LT } from '../../config.ts';
import { type BuildingRec, type LandmarkId, type PartRec, ringArea, type XZ } from '../../geo/chunkData.ts';
import type { BuildOut, MaterialId } from '../buildTypes.ts';
import { MeshBuffer, mergeBuckets, offsetPolyline, triangulate, type V3 } from '../geom.ts';
import type { DetailFn, LandmarkCtx } from './index.ts';
import { footprintFrame, loft, quadOut, triOut } from './kit.ts';
import { parseColour, partRings, renderPart, Sink } from './parts.ts';

const M = L.m2;
const EMPTY: BuildOut = { meshes: [], instances: [], colliders: [] };
const TAU = 2 * Math.PI;
const UP: V3 = [0, 1, 0];
const DOWN: V3 = [0, -1, 0];
type H = (x: number, z: number) => number;

/** sRGB hex → linear RGB × k. */
const rgb = (hex: string, k = 1): V3 => parseColour(hex)!.map((c) => c * k) as unknown as V3;
const glow = (hex: string, intensity: number) => rgb(hex, intensity * LT.emissiveScale);
/** Sink + one buffer per (material, colour, lod), so a buffer keeps its colour however calls interleave; merged at out(). */
class Paints extends Sink {
  private readonly tints = new Map<string, { buf: MeshBuffer; lod?: 'near' }>();
  /** Stair ramps: their own collider flagged `stairs` (walkable; bikes refuse them, world/stairs.ts). */
  readonly rv: number[] = [];
  readonly ri: number[] = [];
  tint(m: MaterialId, c: V3, lod?: 'near') {
    const k = `${m}|${c.join(',')}|${lod ?? ''}`;
    let e = this.tints.get(k);
    if (!e) {
      e = { buf: new MeshBuffer(m), ...(lod && { lod }) };
      e.buf.color = c;
      this.tints.set(k, e);
    }
    return e.buf;
  }
  override out(): BuildOut {
    const o = super.out();
    const ramps = this.ri.length ? [{ vertices: new Float32Array(this.rv), indices: new Uint32Array(this.ri), stairs: true as const }] : [];
    return { ...o, meshes: mergeBuckets([...o.meshes, ...[...this.tints.values()].map((e) => e.buf.bucket(e.lod))]), colliders: [...o.colliders, ...ramps] };
  }
}
const paint = (s: Paints, m: MaterialId, hex: string | V3, lod?: 'near') => s.tint(m, typeof hex === 'string' ? rgb(hex) : hex, lod);
const lamp = (s: Paints, hex: string, k: number, lod?: 'near') => paint(s, 'neon', glow(hex, k), lod);

// ── frames ──

/** Local frame: +a along (ux, uz), +w along (−uz, ux); half extents a, b. */
export interface Fr { cx: number; cz: number; ux: number; uz: number; a: number; b: number }
export const at = (f: Fr, a: number, y: number, w: number): V3 => [f.cx + a * f.ux - w * f.uz, y, f.cz + a * f.uz + w * f.ux];
const atXZ = (f: Fr, a: number, w: number): [number, number] => [f.cx + a * f.ux - w * f.uz, f.cz + a * f.uz + w * f.ux];
const dir = (az: number): [number, number] => [Math.sin((az * Math.PI) / 180), -Math.cos((az * Math.PI) / 180)];

/** Min-area frame of the ring turned so +a is the axis (±u, ±w) closest to compass azimuth az (the front). */
export function facing(ring: XZ, az: number): Fr {
  const f = footprintFrame(ring);
  const [dx, dz] = dir(az);
  const c: [number, number, number, number][] = [[f.ux, f.uz, f.a, f.b], [-f.uz, f.ux, f.b, f.a], [-f.ux, -f.uz, f.a, f.b], [f.uz, -f.ux, f.b, f.a]];
  const [ux, uz, a, b] = c.reduce((p, q) => (q[0] * dx + q[1] * dz > p[0] * dx + p[1] * dz ? q : p));
  return { cx: f.cx, cz: f.cz, ux, uz, a, b };
}

/** Terrain range over the frame rect a0…a1 × w0…w1 (5 × 5 samples). */
function rangeIn(h: H, f: Fr, a0: number, a1: number, w0: number, w1: number) {
  let [lo, hi] = [Infinity, -Infinity];
  for (let i = 0; i <= 4; i++) {
    for (let j = 0; j <= 4; j++) {
      const y = h(...atXZ(f, a0 + ((a1 - a0) * i) / 4, w0 + ((w1 - w0) * j) / 4));
      [lo, hi] = [Math.min(lo, y), Math.max(hi, y)];
    }
  }
  return { lo, hi };
}

/** Point in ring (even-odd). */
function inRing(x: number, z: number, r: XZ) {
  let inside = false;
  for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
    const [xi, zi, xj, zj] = [r[i]!, r[i + 1]!, r[j]!, r[j + 1]!];
    if (zi > z !== zj > z && x < xi + ((z - zi) / (zj - zi)) * (xj - xi)) inside = !inside;
  }
  return inside;
}

/** Highest terrain inside the ring (vertices + a step-m grid). */
export function maxInside(r: XZ, h: H, step = 4) {
  let y = -Infinity;
  const xs = r.filter((_, k) => k % 2 === 0);
  const zs = r.filter((_, k) => k % 2 === 1);
  for (let k = 0; k < r.length; k += 2) y = Math.max(y, h(r[k]!, r[k + 1]!));
  for (let x = Math.min(...xs); x <= Math.max(...xs); x += step) {
    for (let z = Math.min(...zs); z <= Math.max(...zs); z += step) if (inRing(x, z, r)) y = Math.max(y, h(x, z));
  }
  return y;
}

/** Closed ring with extra points so no edge is longer than max (walls whose foot / top follow the terrain); edge `keep`
 *  of the input stays whole (a gate). Returns the ring and the kept edge's index in it. */
export function densify(r: XZ, max: number, keep = -1) {
  const out: XZ = [];
  let edge = -1;
  for (let i = 0, n = r.length; i < n; i += 2) {
    const [ax, az, bx, bz] = [r[i]!, r[i + 1]!, r[(i + 2) % n]!, r[(i + 3) % n]!];
    if (i / 2 === keep) edge = out.length / 2;
    const k = i / 2 === keep ? 1 : Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / max));
    for (let j = 0; j < k; j++) out.push(ax + ((bx - ax) * j) / k, az + ((bz - az) * j) / k);
  }
  return { ring: out, edge };
}

/** Ring offset by d (> 0 = inwards for a counter-clockwise ring, area > 0), mitred. */
const offsetRing = (r: XZ, d: number) => offsetPolyline(r, d, [r[r.length - 2]!, r[r.length - 1]!], [r[0]!, r[1]!]);

/** Edge of the ring (index of its first point) facing compass azimuth az: among edges ≥ minLen whose outward normal is within
 *  60° of az, the one farthest out that way (so a notch facing az inside the outline is not picked); else the best facing. */
export function edgeFacing(r: XZ, az: number, minLen = 0) {
  const [dx, dz] = dir(az);
  let [best, k, far, kf] = [-Infinity, 0, -Infinity, -1];
  for (let i = 0, n = r.length; i < n; i += 2) {
    const [ex, ez] = [r[(i + 2) % n]! - r[i]!, r[(i + 3) % n]! - r[i + 1]!];
    const l = Math.hypot(ex, ez);
    if (l < minLen) continue;
    const d = (-ez * dx + ex * dz) / l; // outward = (−ez, ex) for a counter-clockwise ring
    if (d > best) [best, k] = [d, i / 2];
    const m = (r[i]! + ex / 2) * dx + (r[i + 1]! + ez / 2) * dz;
    if (d > 0.5 && m > far) [far, kf] = [m, i / 2];
  }
  return kf >= 0 ? kf : k;
}

// ── primitives ──

/** Box in frame f: a0…a1 × y0…y1 × w0…w1 (bottom face optional). */
function bx(b: MeshBuffer, f: Fr, a0: number, a1: number, y0: number, y1: number, w0: number, w1: number, bottom = false) {
  const ring = (y: number): V3[] => [at(f, a0, y, w0), at(f, a1, y, w0), at(f, a1, y, w1), at(f, a0, y, w1)];
  const [lo, hi] = [ring(y0), ring(y1)];
  loft(b, [lo, hi]);
  quadOut(b, hi[0]!, hi[1]!, hi[2]!, hi[3]!, UP);
  if (bottom) quadOut(b, lo[0]!, lo[1]!, lo[2]!, lo[3]!, DOWN);
}
/** Collider box in frame f. */
function cbx(s: Paints, f: Fr, a0: number, a1: number, y0: number, y1: number, w0: number, w1: number) {
  s.prism([[...atXZ(f, a0, w0), ...atXZ(f, a1, w0), ...atXZ(f, a1, w1), ...atXZ(f, a0, w1)]], y0, y1);
}
/** Vertical prism mesh over a counter-clockwise ring: side walls y0…y1 + top cap (the collider is s.prism). */
function prismMesh(b: MeshBuffer, ring: XZ, y0: number, y1: number) {
  for (let i = 0, n = ring.length; i < n; i += 2) {
    const [ax, az, bx2, bz] = [ring[i]!, ring[i + 1]!, ring[(i + 2) % n]!, ring[(i + 3) % n]!];
    quadOut(b, [ax, y0, az], [bx2, y0, bz], [bx2, y1, bz], [ax, y1, az], [az - bz, 0, bx2 - ax]); // outward (−ez, ex)
  }
  const idx = triangulate(ring);
  const P = (k: number): V3 => [ring[2 * k]!, y1, ring[2 * k + 1]!];
  for (let k = 0; k < idx.length; k += 3) triOut(b, P(idx[k]!), P(idx[k + 1]!), P(idx[k + 2]!), UP);
}
/** The part of a counter-clockwise ring with a0 ≤ a ≤ a1 in frame f (Sutherland–Hodgman on the two half-planes). */
export function bandOf(ring: XZ, f: Fr, a0: number, a1: number): XZ {
  const A = (x: number, z: number) => (x - f.cx) * f.ux + (z - f.cz) * f.uz;
  let poly = ring;
  for (const [lim, sd] of [[a0, 1], [a1, -1]] as const) {
    const out: XZ = [];
    for (let i = 0, n = poly.length; i < n; i += 2) {
      const [px, pz, qx, qz] = [poly[i]!, poly[i + 1]!, poly[(i + 2) % n]!, poly[(i + 3) % n]!];
      const [dp, dq] = [sd * (A(px, pz) - lim), sd * (A(qx, qz) - lim)];
      if (dp >= 0) out.push(px, pz);
      if (dp >= 0 !== dq >= 0) {
        const t = dp / (dp - dq);
        out.push(px + (qx - px) * t, pz + (qz - pz) * t);
      }
    }
    poly = out;
  }
  return poly.length >= 6 && ringArea(poly) > 1e-3 ? poly : [];
}
/** Hexahedron between two 4-point rings (bottom face optional). */
function block(b: MeshBuffer, lo: V3[], hi: V3[], bottom = false) {
  loft(b, [lo, hi]);
  quadOut(b, hi[0]!, hi[1]!, hi[2]!, hi[3]!, UP);
  if (bottom) quadOut(b, lo[0]!, lo[1]!, lo[2]!, lo[3]!, DOWN);
}
const circle = (cx: number, cz: number, r: number, y: number, n: number, phase = 0): V3[] =>
  Array.from({ length: n }, (_, k) => [cx + r * Math.cos(phase + (TAU * k) / n), y, cz + r * Math.sin(phase + (TAU * k) / n)]);
/** Fan over a convex ring facing up (1) or down (−1). */
function disc(b: MeshBuffer, ring: V3[], d: 1 | -1) {
  for (let k = 1; k + 1 < ring.length; k++) triOut(b, ring[0]!, ring[k]!, ring[k + 1]!, [0, d, 0]);
}
/** Vertical surface of revolution: profile [y, r] bottom → top, top disc when its r > 0.05. */
function revolve(b: MeshBuffer, cx: number, cz: number, prof: readonly (readonly [number, number])[], n: number, phase = 0) {
  loft(b, prof.map(([y, r]) => circle(cx, cz, r, y, n, phase)));
  const [y, r] = prof.at(-1)!;
  if (r > 0.05) disc(b, circle(cx, cz, r, y, n, phase), 1);
}
/** Tube from p0 (radius r0) to p1 (r1), any direction, muzzle disc at p1. */
function tube(b: MeshBuffer, p0: V3, p1: V3, r0: number, r1: number, n: number) {
  const d = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
  const l = Math.hypot(d[0]!, d[1]!, d[2]!) || 1;
  const [dx, dy, dz] = [d[0]! / l, d[1]! / l, d[2]! / l];
  let u: V3 = [dz, 0, -dx]; // d × up, normalised (barrels are near horizontal)
  const ul = Math.hypot(u[0], u[2]) || 1;
  u = [u[0] / ul, 0, u[2] / ul];
  const v: V3 = [u[1] * dz - u[2] * dy, u[2] * dx - u[0] * dz, u[0] * dy - u[1] * dx];
  const ring = (p: V3, r: number) => Array.from({ length: n }, (_, k): V3 => {
    const [c, s] = [Math.cos((TAU * k) / n), Math.sin((TAU * k) / n)];
    return [p[0] + r * (u[0] * c + v[0] * s), p[1] + r * (u[1] * c + v[1] * s), p[2] + r * (u[2] * c + v[2] * s)];
  });
  const [A, B] = [ring(p0, r0), ring(p1, r1)];
  for (let k = 0; k < n; k++) {
    const j = (k + 1) % n;
    const m = [(A[k]![0] + B[j]![0]) / 2, (A[k]![1] + B[j]![1]) / 2, (A[k]![2] + B[j]![2]) / 2];
    const c = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, (p0[2] + p1[2]) / 2];
    quadOut(b, A[k]!, A[j]!, B[j]!, B[k]!, [m[0]! - c[0]!, m[1]! - c[1]!, m[2]! - c[2]!]);
  }
  for (let k = 1; k + 1 < n; k++) triOut(b, B[0]!, B[k]!, B[k + 1]!, [dx, dy, dz]);
}
/** Round lantern (6 sides) centred at (x, y, z). */
function lantern(b: MeshBuffer, x: number, y: number, z: number, r: number) {
  revolve(b, x, z, [[y - 0.8 * r, 0.5 * r], [y - 0.4 * r, r], [y + 0.4 * r, r], [y + 0.8 * r, 0.5 * r]], 6);
  disc(b, circle(x, z, 0.5 * r, y - 0.8 * r, 6), -1);
}
/** Deterministic 0…1 sequence (mulberry32). */
export function rand(seed: number) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
/** Boulder: jittered octahedron, half sizes (sx, sy, sz), foot at y. */
function rock(b: MeshBuffer, x: number, y: number, z: number, sx: number, sy: number, sz: number, rnd: () => number) {
  const j = () => 0.75 + 0.5 * rnd();
  const th = rnd() * TAU;
  const [c, s] = [Math.cos(th), Math.sin(th)];
  const P = (u: number, v: number, w: number): V3 => [x + u * c - w * s, y + v, z + u * s + w * c];
  const mid = sy * 0.8;
  const eq = [P(sx * j(), mid, 0), P(0, mid * j(), sz * j()), P(-sx * j(), mid, 0), P(0, mid * j(), -sz * j())];
  const [top, bot] = [P(0, 2 * sy * j(), 0), P(0, -0.4, 0)];
  for (let k = 0; k < 4; k++) {
    const [p, q] = [eq[k]!, eq[(k + 1) % 4]!];
    const o: V3 = [(p[0] + q[0]) / 2 - x, 0.3, (p[2] + q[2]) / 2 - z];
    triOut(b, p, q, top, o);
    triOut(b, p, q, bot, [o[0], -0.3, o[2]]);
  }
}
/** Seated stone lion facing +a in frame f at (a, w), foot at y (plinth, body, head). */
function lion(b: MeshBuffer, f: Fr, a: number, w: number, y: number) {
  bx(b, f, a - 0.45, a + 0.45, y - 0.3, y + 0.55, w - 0.4, w + 0.4);
  bx(b, f, a - 0.35, a + 0.25, y + 0.55, y + 1.2, w - 0.28, w + 0.28);
  bx(b, f, a - 0.05, a + 0.4, y + 1.1, y + 1.6, w - 0.24, w + 0.24);
}

/** Steps from (x, z) at yTop down along (dx, dz) until they meet floor(); width across. Ramp collider (`stairs`). Returns the run (m). */
function stairs(s: Paints, b: MeshBuffer, floor: H, x: number, z: number, dx: number, dz: number, yTop: number, width: number) {
  const { riser, tread } = M.stair;
  const f: Fr = { cx: x, cz: z, ux: dx, uz: dz, a: 0, b: 0 };
  const hw = width / 2;
  let n = 0;
  while (n < 80 && yTop - (n + 1) * riser > floor(...atXZ(f, (n + 0.5) * tread, 0)) + 0.02) n++;
  for (let k = 0; k < n; k++) {
    const g = Math.min(...[[k, -hw], [k, hw], [k + 1, -hw], [k + 1, hw]].map(([q, w]) => floor(...atXZ(f, q! * tread, w!))));
    bx(b, f, k * tread, (k + 1) * tread, g - 0.4, yTop - (k + 1) * riser, -hw, hw);
  }
  if (n) {
    const run = (n + 1) * tread;
    const yEnd = yTop - (n + 1) * riser;
    const c = s.rv.length / 3;
    for (const [a, y] of [[0, yTop], [run, yEnd]] as const) for (const w of [-hw, hw]) s.rv.push(...at(f, a, y, w));
    s.ri.push(c, c + 2, c + 3, c, c + 3, c + 1);
  }
  return n * tread;
}

/** Western gable roof over a0…a1 (ridge along a) × ±hw at wall top yE, ridge rise; eaves overhang `over`; gable ends in wall. */
function gableRoof(roof: MeshBuffer, wall: MeshBuffer, f: Fr, a0: number, a1: number, hw: number, yE: number, rise: number, over: number) {
  const yEave = yE - (rise * over) / hw;
  const [b0, b1] = [a0 - over * 0.5, a1 + over * 0.5];
  for (const sd of [-1, 1]) {
    const q = [at(f, b0, yEave, sd * (hw + over)), at(f, b1, yEave, sd * (hw + over)), at(f, b1, yE + rise, 0), at(f, b0, yE + rise, 0)] as const;
    const n = at(f, 0, 0, sd);
    quadOut(roof, q[0], q[1], q[2], q[3], [n[0] - f.cx, 1, n[2] - f.cz]);
    quadOut(roof, q[0], q[1], q[2], q[3], [f.cx - n[0], -1, f.cz - n[2]]);
  }
  for (const [a, sd] of [[a0, -1], [a1, 1]] as const) {
    const o = at(f, sd, 0, 0);
    triOut(wall, at(f, a, yE, -hw), at(f, a, yE, hw), at(f, a, yE + rise, 0), [o[0] - f.cx, 0, o[2] - f.cz]);
  }
}

/** Chinese curved roof: rings from the eave outline (corners in frame f, a w pairs) to target(a, w) (ridge / apex),
 *  concave profile (y ∝ t^1.7) with up-turned corners (flick); underside closed at the eaves. */
function cnRoof(b: MeshBuffer, f: Fr, corners: [number, number][], target: (a: number, w: number) => [number, number], yE: number, rise: number, flick: number, m = 4, T = 5) {
  const base: [number, number, number][] = [];
  corners.forEach(([a0, w0], k) => {
    const [a1, w1] = corners[(k + 1) % corners.length]!;
    for (let j = 0; j < m; j++) base.push([a0 + ((a1 - a0) * j) / m, w0 + ((w1 - w0) * j) / m, Math.abs((2 * j) / m - 1)]);
  });
  const rings = Array.from({ length: T + 1 }, (_, k) => {
    const t = k / T;
    return base.map(([a, w, s]) => {
      const [ta, tw] = target(a, w);
      return at(f, a + (ta - a) * t, yE + rise * t ** 1.7 + flick * s ** 3 * (1 - t) ** 2, w + (tw - w) * t);
    });
  });
  loft(b, rings);
  const [ca, cw] = [corners.reduce((s, c) => s + c[0], 0) / corners.length, corners.reduce((s, c) => s + c[1], 0) / corners.length];
  const c = at(f, ca, yE, cw);
  const r0 = rings[0]!;
  for (let k = 0; k < r0.length; k++) triOut(b, c, r0[k]!, r0[(k + 1) % r0.length]!, DOWN);
}

/** Hip roof on the rect ac ± ha, wc ± hw (eave outline), ridge along the longer side, ridge beam + end ornaments. */
function hallRoof(roof: MeshBuffer, ridge: MeshBuffer, f: Fr, ac: number, wc: number, ha: number, hw: number, yE: number, rise: number, flick: number) {
  const alongW = hw >= ha;
  const rh = Math.max(0.4, Math.abs(hw - ha) * 0.9);
  const target = (a: number, w: number): [number, number] => (alongW ? [ac, Math.min(wc + rh, Math.max(wc - rh, w))] : [Math.min(ac + rh, Math.max(ac - rh, a)), wc]);
  cnRoof(roof, f, [[ac - ha, wc - hw], [ac + ha, wc - hw], [ac + ha, wc + hw], [ac - ha, wc + hw]], target, yE, rise, flick);
  const yR = yE + rise;
  const [r0, r1] = [rh + 0.5, 0.22];
  if (alongW) {
    bx(ridge, f, ac - r1, ac + r1, yR - 0.2, yR + 0.4, wc - r0, wc + r0);
    for (const sd of [-1, 1]) bx(ridge, f, ac - r1, ac + r1, yR, yR + 1.1, wc + sd * r0 - 0.3, wc + sd * r0 + 0.3);
  } else {
    bx(ridge, f, ac - r0, ac + r0, yR - 0.2, yR + 0.4, wc - r1, wc + r1);
    for (const sd of [-1, 1]) bx(ridge, f, ac + sd * r0 - 0.3, ac + sd * r0 + 0.3, yR, yR + 1.1, wc - r1, wc + r1);
  }
  return { alongW, rh, yR };
}

interface HallColours { brick: string; granite: string; column: string; door: string; roof: string; ridge: string }
/** Chinese hall facing +a: plinth, brick walls, red porch columns + beam, red door, curved roof, front lanterns. */
function cnHall(s: Paints, f: Fr, ac: number, wc: number, depth: number, width: number, y0: number, eave: number, rise: number, C: HallColours, o: { porch: number; over: number; lanterns: number; figures?: string[] }) {
  const [ha, hw] = [depth / 2, width / 2];
  const front = ac + ha;
  bx(paint(s, 'masonry', C.granite), f, ac - ha - 0.4, front + 0.4, y0 - 0.8, y0 + 0.35, wc - hw - 0.4, wc + hw + 0.4);
  bx(paint(s, 'masonry', C.brick), f, ac - ha, front - o.porch, y0 + 0.35, y0 + eave, wc - hw, wc + hw);
  const red = paint(s, 'masonry', C.column);
  const cols = Math.max(2, Math.round(width / 3.5) + 1);
  for (let k = 0; k < cols; k++) {
    const w = wc - hw + 0.3 + ((width - 0.6) * k) / (cols - 1);
    bx(red, f, front - 0.5, front - 0.14, y0 + 0.35, y0 + eave, w - 0.18, w + 0.18);
  }
  bx(red, f, front - 0.55, front - 0.1, y0 + eave - 0.6, y0 + eave, wc - hw, wc + hw);
  const door = Math.min(1.5, hw * 0.35);
  bx(paint(s, 'masonry', C.door), f, front - o.porch, front - o.porch + 0.06, y0 + 0.35, y0 + Math.min(3.2, eave - 0.8), wc - door, wc + door);
  // lit lattice windows either side of the door (lamplight inside the hall)
  const lit = lamp(s, M.lamp.warm, M.glow.window);
  for (const sd of [-1, 1]) {
    const w = wc + sd * (door + Math.min(1.6, (hw - door) / 2));
    if (Math.abs(w - wc) + 0.6 < hw) bx(lit, f, front - o.porch, front - o.porch + 0.05, y0 + 1.3, y0 + Math.min(2.9, eave - 0.9), w - 0.55, w + 0.55);
  }
  const r = hallRoof(paint(s, 'masonry', C.roof), paint(s, 'masonry', C.ridge), f, ac, wc, ha + o.over, hw + o.over, y0 + eave, rise, 0.5);
  if (o.figures) {
    const fig = (k: number) => paint(s, 'masonry', o.figures![k % o.figures!.length]!, 'near');
    const n = Math.floor((2 * r.rh) / 0.8);
    for (let k = 0; k <= n; k++) {
      const t = -r.rh + (2 * r.rh * k) / Math.max(1, n);
      const h = 0.5 + 0.35 * ((k * 7) % 3) / 2;
      if (r.alongW) bx(fig(k), f, ac - 0.16, ac + 0.16, r.yR + 0.4, r.yR + 0.4 + h, wc + t - 0.2, wc + t + 0.2);
      else bx(fig(k), f, ac + t - 0.2, ac + t + 0.2, r.yR + 0.4, r.yR + 0.4 + h, wc - 0.16, wc + 0.16);
    }
  }
  const lb = lamp(s, M.lamp.red, M.glow.lantern);
  for (let k = 0; k < o.lanterns; k++) {
    const w = wc - hw + (width * (k + 0.5)) / o.lanterns;
    lantern(lb, ...at(f, front + o.over * 0.3, y0 + eave - 0.9, w), 0.35);
  }
  cbx(s, f, ac - ha - 0.4, front + 0.4, y0 - 0.8, y0 + 0.35, wc - hw - 0.4, wc + hw + 0.4);
  cbx(s, f, ac - ha, front - 0.1, y0 + 0.35, y0 + eave + rise * 0.6, wc - hw, wc + hw);
}

// ── walls along a ring (forts, garden) ──

interface RingWall {
  outBase: number; outTop: number; inner: number; // offsets from the OSM line: outer face foot / top (outwards), inner face (inwards)
  bot: H; botIn: H; top: H; // outer foot, inner foot, top (y at a point)
  gap?: { edge: number; t0: number; t1: number; top?: H }; // gate: no wall there, or a low wall up to top
  gates?: readonly (readonly [number, number])[]; // extra openings (world x, z on the line, gateWidth m wide): OSM footways through the wall
  gateWidth?: number;
  merlon?: { w: number; gap: number; h: number };
  collide?: boolean;
  lights?: { every: number; buf: MeshBuffer }; // uplighter boxes at the outer foot, one per `every` m
  band?: { buf: MeshBuffer; h: number }; // lit strip on the outer face at the wall top (floodlit crest, read from afar at night)
}
/** Wall solid between offset rings of a counter-clockwise ring; merlons on top. Returns the embrasures (centre on the inner
 *  line, outward unit normal, wall top y). */
function ringWall(s: Paints, b: MeshBuffer, ring: XZ, o: RingWall, merlons?: MeshBuffer) {
  const n = ring.length / 2;
  const [RB, RT, RI] = [offsetRing(ring, -o.outBase), offsetRing(ring, -o.outTop), offsetRing(ring, o.inner)];
  const lerp = (R: XZ, i: number, j: number, t: number): [number, number] => [R[2 * i]! + (R[2 * j]! - R[2 * i]!) * t, R[2 * i + 1]! + (R[2 * j + 1]! - R[2 * i + 1]!) * t];
  const emb: { x: number; z: number; nx: number; nz: number; y: number }[] = [];
  let run = 0; // m to the next uplighter
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const [ex, ez] = [ring[2 * j]! - ring[2 * i]!, ring[2 * j + 1]! - ring[2 * i + 1]!];
    const len = Math.hypot(ex, ez);
    if (len < 1e-3) continue;
    const out: V3 = [-ez / len, 0, ex / len];
    // openings on this edge (t along it): the gate, then the extra ones within 3 m of the line
    const cuts: [number, number][] = o.gap?.edge === i ? [[o.gap.t0, o.gap.t1]] : [];
    const [ax, az] = [ring[2 * i]!, ring[2 * i + 1]!];
    for (const [gx, gz] of o.gates ?? []) {
      const t = ((gx - ax) * ex + (gz - az) * ez) / (len * len);
      const hw = (o.gateWidth ?? 2.4) / 2 / len;
      if (t > 0 && t < 1 && Math.abs((gx - ax) * ez - (gz - az) * ex) / len < 3) cuts.push([Math.max(0, t - hw), Math.min(1, t + hw)]);
    }
    cuts.sort((p, q) => p[0] - q[0]);
    const pieces: [number, number, H][] = [];
    let tc = 0;
    for (const [c0, c1] of cuts) (pieces.push([tc, c0, o.top]), (tc = c1));
    pieces.push([tc, 1, o.top]);
    if (o.gap?.edge === i && o.gap.top) pieces.push([o.gap.t0, o.gap.t1, o.gap.top]);
    for (const [t0, t1, top] of pieces) {
      if (t1 - t0 < 1e-4) continue;
      const [b0, b1, o0, o1, i0, i1] = [lerp(RB, i, j, t0), lerp(RB, i, j, t1), lerp(RT, i, j, t0), lerp(RT, i, j, t1), lerp(RI, i, j, t0), lerp(RI, i, j, t1)];
      const T = (p: [number, number]): V3 => [p[0], top(...p), p[1]];
      quadOut(b, [b0[0], o.bot(...b0), b0[1]], [b1[0], o.bot(...b1), b1[1]], T(o1), T(o0), out);
      quadOut(b, [i0[0], o.botIn(...i0), i0[1]], [i1[0], o.botIn(...i1), i1[1]], T(i1), T(i0), [-out[0], 0, -out[2]]);
      quadOut(b, T(o0), T(o1), T(i1), T(i0), UP);
      const isGap = top === o.top;
      if (isGap && cuts.some((c) => c[0] === t1)) quadOut(b, [b1[0], o.bot(...b1), b1[1]], [i1[0], o.botIn(...i1), i1[1]], T(i1), T(o1), [ex, 0, ez]);
      if (isGap && cuts.some((c) => c[1] === t0)) quadOut(b, [b0[0], o.bot(...b0), b0[1]], [i0[0], o.botIn(...i0), i0[1]], T(i0), T(o0), [-ex, 0, -ez]);
      if (o.band && top === o.top) {
        const E = (p: [number, number], y: number): V3 => [p[0] + out[0] * 0.04, y, p[1] + out[2] * 0.04];
        quadOut(o.band.buf, E(o0, top(...o0) - o.band.h), E(o1, top(...o1) - o.band.h), E(o1, top(...o1)), E(o0, top(...o0)), out);
      }
      if (o.lights && top === o.top) {
        const span = len * (t1 - t0);
        for (; run < span; run += o.lights.every) {
          const [x, z] = lerp(RB, i, j, t0 + run / len);
          const lf: Fr = { cx: x, cz: z, ux: out[0], uz: out[2], a: 0, b: 0 };
          const y = o.bot(x, z) + L.sink;
          bx(o.lights.buf, lf, 0, 0.35, y, y + 0.22, -0.25, 0.25);
        }
        run -= span;
      }
      const M_ = top === o.top ? o.merlon : undefined;
      if (o.collide) {
        const ys = [b0, b1, i0, i1].map((p, k) => (k < 2 ? o.bot(...p) : o.botIn(...p)));
        s.prism([[...o0, ...o1, ...i1, ...i0]], Math.min(...ys), Math.max(top(...o0), top(...o1)) + (M_?.h ?? 0));
      }
      if (!M_ || !merlons) continue;
      const span = len * (t1 - t0);
      const k = Math.floor((span + M_.gap) / (M_.w + M_.gap));
      if (k < 1) continue;
      const pad = (span - (k * M_.w + (k - 1) * M_.gap)) / 2 / len;
      for (let q = 0; q < k; q++) {
        const ta = t0 + pad + (q * (M_.w + M_.gap)) / len;
        const tb = ta + M_.w / len;
        const pts = [lerp(RT, i, j, ta), lerp(RT, i, j, tb), lerp(RI, i, j, tb), lerp(RI, i, j, ta)];
        block(merlons, pts.map((p) => T(p)), pts.map((p) => [p[0], top(...p) + M_.h, p[1]] as V3));
        if (q + 1 < k) {
          const [ex0, ez0] = lerp(RI, i, j, tb + M_.gap / 2 / len);
          emb.push({ x: ex0, z: ez0, nx: out[0], nz: out[2], y: top(ex0, ez0) });
        }
      }
    }
  }
  return emb;
}

// ── Fortaleza do Monte ──

export function monteTerrace(ring: XZ, h: H) {
  return maxInside(ring, h) + M.monte.terraceRise;
}

/** A building standing inside a landmark (registry `zone`) rendered by the generic part renderer up to `top` (absolute y). */
function zoneBuilding(rec: BuildingRec, ctx: LandmarkCtx, top: number, o: { colour: string; roofShape?: string; roofColour?: string }) {
  const s = new Paints();
  const h = Math.max(2.5, top - ctx.ground);
  renderPart({ ...rec, height: h, colour: o.colour, ...(o.roofShape && { roofShape: o.roofShape }), ...(o.roofColour && { roofColour: o.roofColour }) }, { ground: ctx.ground, height: ctx.height, fallbackTop: h }, s);
  return s.out();
}

function monte(rec: BuildingRec, ctx: LandmarkCtx): BuildOut {
  const rings = partRings(rec);
  if (!rings) return EMPTY;
  const C = M.monte;
  // zone member (Museu de Macau on the terrace): a low block over the terrace instead of its OSM height (asl)
  if (Math.abs(ringArea(rec.outer)) < C.minFortArea) return zoneBuilding(rec, ctx, monteTerrace(rec.outer, ctx.height) + C.museum.above, { colour: C.museum.colour });
  const s = new Paints();
  const { ring, edge: gEdge } = densify(rings[0]!, 6, edgeFacing(rings[0]!, C.gateAz, C.stairWidth + 2));
  const yT = monteTerrace(rings[0]!, ctx.height);
  const foot: H = (x, z) => ctx.height(x, z) - L.sink;
  const top = yT + C.parapet;
  const gi = 2 * gEdge;
  const n = ring.length;
  const glen = Math.hypot(ring[(gi + 2) % n]! - ring[gi]!, ring[(gi + 3) % n]! - ring[gi + 1]!);
  const gw = (C.stairWidth + 0.6) / 2 / glen;
  const wall = paint(s, 'masonry', C.colours.wall);
  const emb = ringWall(s, wall, ring, {
    outBase: C.batter, outTop: 0, inner: C.thick, bot: foot, botIn: () => yT - 0.05, top: () => top,
    gap: { edge: gEdge, t0: 0.5 - gw, t1: 0.5 + gw, top: () => yT }, merlon: C.merlon, collide: true,
    lights: { every: C.lightEvery, buf: lamp(s, M.lamp.warm, M.glow.uplight) },
    band: { buf: lamp(s, M.lamp.warm, M.glow.crest), h: M.crest },
  }, paint(s, 'masonry', C.colours.top));
  // terrace (walkable) inside the parapet
  const inner = offsetRing(ring, C.thick);
  const tb = paint(s, 'masonry', C.colours.terrace);
  const idx = triangulate(inner);
  const P = (k: number): V3 => [inner[2 * k]!, yT, inner[2 * k + 1]!];
  for (let k = 0; k < idx.length; k += 3) triOut(tb, P(idx[k]!), P(idx[k + 1]!), P(idx[k + 2]!), UP);
  s.prism([inner], Math.min(...Array.from({ length: inner.length / 2 }, (_, k) => foot(inner[2 * k]!, inner[2 * k + 1]!))), yT);
  // gate steps from the gap down the slope
  const [ax, az, bx_, bz] = [ring[gi]!, ring[gi + 1]!, ring[(gi + 2) % n]!, ring[(gi + 3) % n]!];
  const [ux, uz] = [(bx_ - ax) / glen, (bz - az) / glen];
  stairs(s, wall, ctx.height, (ax + bx_) / 2 - uz * 0.05, (az + bz) / 2 + ux * 0.05, -uz, ux, yT, C.stairWidth);
  // cannons in evenly picked embrasures, barrels out over the parapet
  const gun = paint(s, 'metal', C.colours.cannon, 'near');
  const cart = paint(s, 'masonry', C.colours.carriage, 'near');
  const step = emb.length / Math.max(1, C.cannons);
  for (let k = 0; k < Math.min(C.cannons, emb.length); k++) {
    const e = emb[Math.floor(k * step)]!;
    const y = e.y + 0.25;
    const p0: V3 = [e.x - e.nx * 1.6, y, e.z - e.nz * 1.6];
    const p1: V3 = [e.x + e.nx * (C.thick + 0.5), y + 0.12, e.z + e.nz * (C.thick + 0.5)];
    tube(gun, p0, p1, 0.24, 0.16, 8);
    const f: Fr = { cx: e.x, cz: e.z, ux: e.nx, uz: e.nz, a: 0, b: 0 };
    bx(cart, f, -2.0, -0.4, yT, y - 0.1, -0.45, 0.45);
  }
  return s.out();
}

// ── Fortaleza da Guia + Farol da Guia ──

function guiaFort(rec: BuildingRec, ctx: LandmarkCtx): BuildOut {
  const rings = partRings(rec);
  if (!rings) return EMPTY;
  const C = M.guia;
  // zone members (chapel, keeper's houses): low white buildings with tiled hipped roofs
  if (rec.kind !== 'ruins') return zoneBuilding(rec, ctx, ctx.ground + C.house.height, { colour: C.house.colour, roofShape: 'hipped', roofColour: C.house.roof });
  const s = new Paints();
  const { ring, edge: gEdge } = densify(rings[0]!, 5, edgeFacing(rings[0]!, C.gateAz, C.gate + 1));
  const gi = 2 * gEdge;
  const n = ring.length;
  const glen = Math.hypot(ring[(gi + 2) % n]! - ring[gi]!, ring[(gi + 3) % n]! - ring[gi + 1]!);
  const gw = C.gate / 2 / glen;
  const foot: H = (x, z) => ctx.height(x, z) - L.sink;
  ringWall(s, paint(s, 'masonry', C.colours.wall), ring, {
    outBase: 0.3, outTop: 0, inner: C.thick, bot: foot, botIn: foot, top: (x, z) => ctx.height(x, z) + C.wallH,
    gap: { edge: gEdge, t0: 0.5 - gw, t1: 0.5 + gw }, merlon: C.merlon, collide: true,
    lights: { every: C.lightEvery, buf: lamp(s, M.lamp.warm, M.glow.uplight) },
    band: { buf: lamp(s, M.lamp.warm, M.glow.crest), h: M.crest },
  }, paint(s, 'masonry', C.colours.top));
  return s.out();
}

function farol(rec: BuildingRec, ctx: LandmarkCtx): BuildOut {
  const rings = partRings(rec);
  if (!rings) return EMPTY;
  const T = M.guia.lighthouse;
  const C = M.guia.colours;
  const s = new Paints();
  const f = footprintFrame(rings[0]!);
  const [cx, cz] = [f.cx, f.cz];
  const g = ctx.ground;
  const yb = ctx.minGround - L.sink;
  const Y = (y: number) => g + y;
  const white = paint(s, 'masonry', C.tower);
  revolve(white, cx, cz, [[yb, T.tower[0]![1]], ...T.tower.slice(1).map(([y, r]) => [Y(y), r] as const)], 20);
  const [g0, g1, gr] = T.gallery;
  revolve(white, cx, cz, [[Y(g0), gr], [Y(g1), gr]], 20);
  disc(white, circle(cx, cz, gr, Y(g0), 20), -1);
  const [l0, l1, lr] = T.lantern;
  revolve(lamp(s, M.lamp.beacon, M.glow.beacon), cx, cz, [[Y(l0), lr], [Y(l1), lr]], 12);
  const [d0, d1, dr] = T.dome;
  const dark = paint(s, 'metal', C.dome);
  revolve(dark, cx, cz, [[Y(d0), dr], [Y(d0 + 0.25), dr], [Y(d0 + 0.6), dr * 0.8], [Y(d1 - 0.3), dr * 0.45], [Y(d1), 0.12]], 12);
  revolve(dark, cx, cz, [[Y(d1), 0.06], [Y(T.vane), 0.04]], 4);
  // gallery railing, lantern frame bars, windows, door (near)
  const rail = paint(s, 'metal', C.rail, 'near');
  revolve(rail, cx, cz, [[Y(g1 + T.rail - 0.08), gr - 0.05], [Y(g1 + T.rail), gr - 0.05]], 20);
  for (let k = 0; k < 12; k++) {
    const [px, pz] = [cx + (gr - 0.08) * Math.cos((TAU * k) / 12), cz + (gr - 0.08) * Math.sin((TAU * k) / 12)];
    revolve(rail, px, pz, [[Y(g1), 0.04], [Y(g1 + T.rail), 0.04]], 4);
    if (k % 2 === 0) {
      const [qx, qz] = [cx + (lr + 0.03) * Math.cos((TAU * k) / 12), cz + (lr + 0.03) * Math.sin((TAU * k) / 12)];
      revolve(rail, qx, qz, [[Y(l0), 0.05], [Y(l1), 0.05]], 4);
    }
  }
  const towerR = (y: number) => {
    const p = T.tower;
    for (let k = 0; k + 1 < p.length; k++) if (y <= p[k + 1]![0]) return p[k]![1] + ((p[k + 1]![1] - p[k]![1]) * (y - p[k]![0])) / (p[k + 1]![0] - p[k]![0] || 1);
    return p.at(-1)![1];
  };
  const win = paint(s, 'masonry', C.door, 'near');
  const fr: Fr = { cx, cz, ux: 0, uz: 1, a: 0, b: 0 }; // windows / door face south (+z)
  for (let k = 0; k < T.windows; k++) {
    const y = 3.5 + k * 2.8;
    const r = towerR(y);
    bx(win, fr, r - 0.1, r + 0.04, Y(y), Y(y + 1.1), -0.35, 0.35);
  }
  bx(win, fr, towerR(1.3) - 0.1, towerR(1.3) + 0.04, Y(1.2), Y(3.2), -0.6, 0.6);
  s.prism([circle(cx, cz, T.tower[0]![1], 0, 12).flatMap((p) => [p[0], p[2]])], yb, Y(l1));
  return s.out();
}

// ── Templo de A-Ma ──

export interface Tier { d0: number; d1: number; y: number }
/** Terraces from the front edge back (d = m behind the front): floor = highest terrain over the tier + 0.15, never lower than the one in front. */
export function amaTiers(f: Fr, h: H): Tier[] {
  const starts = M.ama.tiers;
  const depth = 2 * f.a;
  const out: Tier[] = [];
  starts.forEach((d0, k) => {
    const d1 = k + 1 < starts.length ? starts[k + 1]! : depth;
    if (d0 >= depth) return;
    const { hi } = rangeIn(h, f, f.a - Math.min(d1, depth), f.a - d0, -f.b, f.b);
    out.push({ d0, d1: Math.min(d1, depth), y: Math.max(hi + 0.15, out.at(-1)?.y ?? -Infinity) });
  });
  return out;
}

function ama(rec: BuildingRec, ctx: LandmarkCtx): BuildOut {
  if (rec.kind === 'artwork') return EMPTY; // the Barra square (relation/18544991): street paving stays
  const A = M.ama;
  const C = A.colours;
  const s = new Paints();
  const f = facing(rec.outer, A.az);
  const tiers = amaTiers(f, ctx.height);
  const granite = paint(s, 'masonry', C.granite);
  const a = (d: number) => f.a - d; // depth from the front → a
  const ring = partRings(rec)?.[0] ?? rec.outer;
  for (const [k, t] of tiers.entries()) {
    const { lo } = rangeIn(ctx.height, f, a(t.d1), a(t.d0), -f.b, f.b);
    // Leg 2 fix (code review M3): the terrace is the outline's band, not the frame's (the footway in the outline's
    // north-west notch, beside the Barra square, stays free)
    const band = bandOf(ring, f, a(t.d1), a(t.d0));
    if (band.length) prismMesh(granite, band, lo - L.sink, t.y), s.prism([band], lo - L.sink, t.y);
    // steps down to the tier in front (side steps between terraces, the front flight through the gate)
    const below: H = k ? () => tiers[k - 1]!.y : ctx.height;
    const w = k === 0 ? 0 : (k % 2 ? -1 : 1) * (f.b - 2.5);
    stairs(s, granite, below, ...atXZ(f, a(t.d0) + 0.02, w), f.ux, f.uz, t.y, k === 0 ? 4 : 3);
  }
  // gate: granite wall with an opening, curved roof, lions, lanterns
  const G = A.gate;
  const y0 = tiers[0]!.y;
  const [g0, g1] = [a(1.2 + G.depth), a(1.2)];
  const [hw, ow] = [G.width / 2, G.opening[0] / 2];
  bx(granite, f, g0, g1, y0, y0 + G.height, -hw, -ow);
  bx(granite, f, g0, g1, y0, y0 + G.height, ow, hw);
  bx(granite, f, g0, g1, y0 + G.opening[1], y0 + G.height, -ow, ow);
  for (const [w0, w1] of [[-hw, -ow], [ow, hw]] as const) cbx(s, f, g0, g1, y0, y0 + G.height, w0, w1);
  hallRoof(paint(s, 'masonry', C.roof), paint(s, 'masonry', C.ridge), f, (g0 + g1) / 2, 0, G.depth / 2 + 0.9, hw + 0.9, y0 + G.height, G.rise, 0.45);
  const stone = paint(s, 'masonry', C.lion, 'near');
  for (const sd of [-1, 1]) lion(stone, f, a(0.6), sd * (ow + 1.0), y0);
  const red = lamp(s, M.lamp.red, M.glow.lantern);
  for (const w of [-ow - 2.5, -ow + 0.5, ow - 0.5, ow + 2.5]) lantern(red, ...at(f, g1 + 0.5, y0 + G.height - 0.7, w), 0.38);
  // halls on the upper tiers
  const hallColours = { brick: C.brick, granite: C.granite, column: C.column, door: C.door, roof: C.roof, ridge: C.ridge };
  for (const [tier, depth, width, w, eave, rise] of A.halls) {
    const t = tiers[tier];
    if (!t) continue;
    const back = Math.min(t.d1, 2 * f.a) - 0.8;
    const ac = a(back) + depth / 2;
    cnHall(s, f, ac, w, depth, width, t.y, eave, rise, hallColours, { porch: 1.6, over: 1.0, lanterns: Math.round(width / 3.5) });
    if (tier === 1) {
      // incense coils hanging over the court in front of the prayer hall
      const coil = paint(s, 'masonry', C.coil, 'near');
      const ember = lamp(s, M.lamp.ember, M.glow.ember, 'near');
      const front = ac + depth / 2;
      for (let k = 0; k < A.coils; k++) {
        const [row, col] = [Math.floor(k / 4), k % 4];
        const [x, y, z] = at(f, front + 1.6 + row * 0.9, t.y + eave - 0.5 - (col % 2) * 0.3, w - 3 + col * 2);
        revolve(coil, x, z, [[y - 0.7, 0.42], [y - 0.62, 0.42], [y - 0.2, 0.2], [y, 0.04]], 6);
        bx(ember, { cx: x, cz: z, ux: f.ux, uz: f.uz, a: 0, b: 0 }, 0.36, 0.46, y - 0.72, y - 0.62, -0.05, 0.05);
      }
    }
  }
  // boulders with carved inscriptions on the hill at the back
  const rnd = rand(1488);
  const rk = paint(s, 'masonry', C.rock);
  const last = tiers.at(-1)!;
  for (const w of [-f.b + 3, f.b - 3.5]) rock(rk, ...at(f, a(last.d1) + 2.5, last.y, w), 2.4, 1.5, 1.8, rnd);
  return s.out();
}

// ── Kun Iam Tong ──

function kunIamTong(rec: BuildingRec, ctx: LandmarkCtx): BuildOut {
  const K = M.kunIam;
  const C = K.colours;
  const s = new Paints();
  const f = facing(rec.outer, K.az);
  const { lo, hi } = rangeIn(ctx.height, f, -f.a, f.a, -f.b, f.b);
  const y0 = hi + 0.2;
  cnHall(s, f, 0, 0, 2 * f.a - 1, 2 * f.b - 1, y0, K.eave, K.rise, C, { porch: K.porch, over: K.over, lanterns: 4, figures: K.figures });
  if (rec.kind === 'temple') {
    // forecourt: paving, incense urn, lions, lantern posts
    const g = paint(s, 'masonry', C.granite);
    const r = rangeIn(ctx.height, f, f.a, f.a + K.court, -f.b, f.b);
    bx(g, f, f.a - 0.2, f.a + K.court, Math.min(lo, r.lo) - L.sink, y0, -f.b, f.b);
    cbx(s, f, f.a - 0.2, f.a + K.court, Math.min(lo, r.lo) - L.sink, y0, -f.b, f.b);
    stairs(s, g, ctx.height, ...atXZ(f, f.a + K.court + 0.02, 0), f.ux, f.uz, y0, 4);
    const [ux, uz] = atXZ(f, f.a + K.court / 2, 0);
    revolve(paint(s, 'metal', '#3b3a36'), ux, uz, [[y0, 0.5], [y0 + 0.5, 0.5], [y0 + 0.7, 0.9], [y0 + 1.3, 0.85], [y0 + 1.45, 0.6]], 10);
    const stone = paint(s, 'masonry', C.granite, 'near');
    for (const sd of [-1, 1]) lion(stone, f, f.a + K.court - 1, sd * (f.b - 1.5), y0);
  }
  return s.out();
}

// ── Jardim Lou Lim Ioc ──

/** Wall panel across a gap with a round (moon) opening of radius r: frame g (+a out of the wall), width gw, y0 … y1, centre yc. */
function moonGate(s: Paints, b: MeshBuffer, g: Fr, gw: number, th: number, y0: number, y1: number, yc: number, r: number) {
  const hw = gw / 2;
  const angles = [...Array.from({ length: 24 }, (_, k) => (TAU * k) / 24), ...[[hw, y1], [-hw, y1], [-hw, y0], [hw, y0]].map(([w, y]) => Math.atan2(y! - yc, w!))]
    .map((t) => (t + TAU) % TAU).sort((p, q) => p - q);
  const edge = (t: number): [number, number] => {
    const [c, sn] = [Math.cos(t), Math.sin(t)];
    const k = Math.min(Math.abs(c) > 1e-9 ? hw / Math.abs(c) : Infinity, sn > 1e-9 ? (y1 - yc) / sn : sn < -1e-9 ? (yc - y0) / -sn : Infinity);
    return [c * k, yc + sn * k];
  };
  for (let k = 0; k < angles.length; k++) {
    const [t0, t1] = [angles[k]!, angles[(k + 1) % angles.length]! + (k + 1 === angles.length ? TAU : 0)];
    if (t1 - t0 < 1e-6) continue;
    const [c0, c1] = [[r * Math.cos(t0), yc + r * Math.sin(t0)], [r * Math.cos(t1), yc + r * Math.sin(t1)]];
    const [e0, e1] = [edge(t0), edge(t1)];
    for (const sd of [-1, 1]) {
      const a = (sd * th) / 2;
      const o = at(g, sd, 0, 0);
      quadOut(b, at(g, a, c0[1]!, c0[0]!), at(g, a, c1[1]!, c1[0]!), at(g, a, e1[1], e1[0]), at(g, a, e0[1], e0[0]), [o[0] - g.cx, 0, o[2] - g.cz]);
    }
    const m = at(g, 0, (c0[1]! + c1[1]!) / 2, (c0[0]! + c1[0]!) / 2);
    const c = at(g, 0, yc, 0);
    quadOut(b, at(g, -th / 2, c0[1]!, c0[0]!), at(g, -th / 2, c1[1]!, c1[0]!), at(g, th / 2, c1[1]!, c1[0]!), at(g, th / 2, c0[1]!, c0[0]!), [c[0] - m[0], c[1] - m[1], c[2] - m[2]]);
  }
  const top = [at(g, -th / 2, y1, -hw), at(g, th / 2, y1, -hw), at(g, th / 2, y1, hw), at(g, -th / 2, y1, hw)] as const;
  quadOut(b, top[0], top[1], top[2], top[3], UP);
  const k = r * 0.75;
  cbx(s, g, -th / 2, th / 2, y0, y1, -hw, -k);
  cbx(s, g, -th / 2, th / 2, y0, y1, k, hw);
  cbx(s, g, -th / 2, th / 2, yc + r * 0.7, y1, -k, k);
}

/** Pavilion: n-sided stone base, red columns, curved roof with a finial, two lanterns. */
function pavilion(s: Paints, h: H, x: number, z: number, n: number, r: number) {
  const C = M.louLimIoc.colours;
  const corner = circle(x, z, r, 0, n, Math.PI / n);
  const y0 = Math.max(...corner.map((p) => h(p[0], p[2]))) + 0.45;
  const yLo = Math.min(...corner.map((p) => h(p[0], p[2]))) - L.sink;
  const base = paint(s, 'masonry', C.base);
  revolve(base, x, z, [[yLo, r * 1.05], [y0, r * 1.05]], n, Math.PI / n);
  s.prism([circle(x, z, r * 1.05, 0, n, Math.PI / n).flatMap((p) => [p[0], p[2]])], yLo, y0);
  const col = paint(s, 'masonry', C.column);
  const eave = y0 + 2.8;
  for (const p of circle(x, z, r * 0.85, 0, n, Math.PI / n)) revolve(col, p[0], p[2], [[y0, 0.15], [eave, 0.15]], 6);
  revolve(col, x, z, [[eave - 0.35, r * 0.9], [eave, r * 0.9]], n, Math.PI / n);
  const f: Fr = { cx: x, cz: z, ux: 1, uz: 0, a: 0, b: 0 };
  const R = r * 1.3;
  const corners = Array.from({ length: n }, (_, k): [number, number] => [R * Math.cos(Math.PI / n + (TAU * k) / n), R * Math.sin(Math.PI / n + (TAU * k) / n)]);
  const roof = paint(s, 'masonry', C.roof);
  cnRoof(roof, f, corners, () => [0, 0], eave, r * 0.8, 0.5, 3, 5);
  revolve(paint(s, 'masonry', C.coping), x, z, [[eave + r * 0.8 - 0.1, 0.25], [eave + r * 0.8 + 0.5, 0.18], [eave + r * 0.8 + 0.9, 0.02]], 6);
  const red = lamp(s, M.lamp.red, M.glow.lantern);
  for (const k of [0, Math.floor(n / 2)]) {
    const p = circle(x, z, r * 1.0, 0, n, Math.PI / n + Math.PI / n)[k]!;
    lantern(red, p[0], eave - 0.6, p[2], 0.3);
  }
  return y0;
}

function louLimIoc(rec: BuildingRec, ctx: LandmarkCtx): BuildOut {
  const rings = partRings(rec);
  if (!rings) return EMPTY;
  const G = M.louLimIoc;
  const C = G.colours;
  const s = new Paints();
  if (rec.kind !== 'artwork') {
    // zone members: the hall by the pond (Chinese hall on its outline), small ones = pavilions
    const area = Math.abs(ringArea(rec.outer));
    const f = facing(rec.outer, G.hallAz);
    if (area < G.pavilionMax) pavilion(s, ctx.height, f.cx, f.cz, 4, Math.sqrt(area) / 2);
    else {
      const { hi } = rangeIn(ctx.height, f, -f.a, f.a, -f.b, f.b);
      cnHall(s, f, 0, 0, 2 * f.a - 2, 2 * f.b - 2, hi + 0.3, G.hall.eave, G.hall.rise, { brick: C.wall, granite: C.base, column: C.column, door: C.column, roof: C.roof, ridge: C.coping }, { porch: 2, over: 1.2, lanterns: 4 });
    }
    return s.out();
  }
  const { ring, edge: gEdge } = densify(rings[0]!, 6, edgeFacing(rings[0]!, G.gateAz, 2 * G.moon + 3));
  const h = ctx.height;
  // wall + tiled coping, moon gate in a gap on the edge facing gateAz
  const gi = 2 * gEdge;
  const n = ring.length;
  const [ax, az, bx_, bz] = [ring[gi]!, ring[gi + 1]!, ring[(gi + 2) % n]!, ring[(gi + 3) % n]!];
  const glen = Math.hypot(bx_ - ax, bz - az);
  const gw = 2 * G.moon + 1.6;
  const gap = { edge: gEdge, t0: 0.5 - gw / 2 / glen, t1: 0.5 + gw / 2 / glen };
  const foot: H = (x, z) => h(x, z) - 0.4;
  const top: H = (x, z) => h(x, z) + G.wallH;
  const gates = G.gates; // Leg 2 fix: the OSM footway through the north-west wall
  ringWall(s, paint(s, 'masonry', C.wall), ring, { outBase: G.thick / 2, outTop: G.thick / 2, inner: G.thick / 2, bot: foot, botIn: foot, top, gap, gates, collide: true });
  ringWall(s, paint(s, 'masonry', C.coping), ring, { outBase: G.thick / 2 + 0.15, outTop: G.thick / 2 + 0.15, inner: G.thick / 2 + 0.15, bot: (x, z) => top(x, z) - 0.05, botIn: (x, z) => top(x, z) - 0.05, top: (x, z) => top(x, z) + 0.3, gap, gates });
  const [mx, mz] = [(ax + bx_) / 2, (az + bz) / 2];
  const [ux, uz] = [(bx_ - ax) / glen, (bz - az) / glen];
  const g: Fr = { cx: mx, cz: mz, ux: -uz, uz: ux, a: 0, b: 0 }; // +a out of the garden
  const yg = h(mx, mz);
  moonGate(s, paint(s, 'masonry', C.wall), g, gw, G.thick + 0.3, yg - 0.4, yg + G.wallH + 0.7, yg + 0.1 + G.moon, G.moon);
  bx(paint(s, 'masonry', C.coping), g, -0.55, 0.55, yg + G.wallH + 0.7, yg + G.wallH + 1.05, -gw / 2 - 0.3, gw / 2 + 0.3);
  // pavilions, rockery
  for (const [x, z, sides, r] of G.pavilions) pavilion(s, h, x, z, sides, r);
  const R = G.rockery;
  const rnd = rand(1906);
  const rk = paint(s, 'masonry', C.rock);
  for (let k = 0; k < R.n; k++) {
    const [ang, d] = [rnd() * TAU, R.r * Math.sqrt(rnd())];
    const [x, z] = [R.x + d * Math.cos(ang), R.z + d * Math.sin(ang)];
    const sz = 0.9 + 1.4 * rnd() * (1 - d / R.r / 2);
    const y = h(x, z) + (d < R.r * 0.5 ? rnd() * (R.h - 2 * sz) : 0);
    rock(rk, x, Math.max(h(x, z), y), z, sz, sz * (0.7 + 0.6 * rnd()), sz, rnd);
  }
  s.prism([circle(R.x, R.z, R.r * 0.45, 0, 8).flatMap((p) => [p[0], p[2]])], h(R.x, R.z) - 0.5, h(R.x, R.z) + R.h * 0.6);
  return s.out();
}

// ── churches ──

type ChurchCfg = (typeof M.churches)[string];

function church(rec: BuildingRec, ctx: LandmarkCtx, c: ChurchCfg): BuildOut {
  const rings = partRings(rec);
  if (!rings) return EMPTY;
  const s = new Paints();
  const C = c.colours;
  const ring = rings[0]!;
  const f = facing(ring, c.az);
  // Leg 2 fix (code review H2 / M1): platform + collider follow the OSM outline, not its bounding frame (the frame of a
  // skewed / notched outline covered the street beside it: Calçada do Tronco Velho, the steps up to São Lourenço)
  const yb = ctx.minGround - L.sink;
  const y0 = maxInside(ring, ctx.height) + c.platform;
  const wall = paint(s, 'masonry', C.wall);
  const trim = paint(s, 'masonry', C.trim);
  const tw = c.towers ? c.towerW : 0;
  const td = c.towers === 2 ? Math.min(c.towerW, f.a * 0.4) : c.towers === 1 ? c.towerW * 0.6 : 1.2; // façade block depth (1 tower: its part in front of the nave)
  const fa = f.a; // front at +fa
  const nw = f.b * c.nave;
  // platform + steps to the street in front
  s.prism([ring], yb, y0 + c.wallH); // the whole body (platform, nave, façade block) as one solid
  if (c.platform > 0.05) {
    prismMesh(paint(s, 'masonry', C.trim), ring, yb, y0);
    stairs(s, trim, ctx.height, ...atXZ(f, fa + 0.02, 0), f.ux, f.uz, y0, Math.min(2 * f.b, 10));
  }
  // nave: walls, plinth + cornice bands, gable roof, side windows
  const nave = [-fa, fa - td] as const;
  bx(wall, f, nave[0], nave[1], yb, y0 + c.wallH, -nw, nw);
  bx(trim, f, nave[0] - 0.12, nave[1], y0, y0 + 0.7, -nw - 0.12, nw + 0.12);
  bx(trim, f, nave[0] - 0.15, nave[1], y0 + c.wallH - 0.5, y0 + c.wallH, -nw - 0.15, nw + 0.15);
  gableRoof(paint(s, 'masonry', C.roof), wall, f, nave[0], nave[1], nw, y0 + c.wallH, c.rise, 0.6);
  const win = lamp(s, M.lamp.window, M.glow.window);
  const len = nave[1] - nave[0];
  for (let k = 0; k < c.windows; k++) {
    const ac = nave[0] + (len * (k + 0.5)) / c.windows;
    for (const sd of [-1, 1]) bx(win, f, ac - 0.6, ac + 0.6, y0 + c.wallH * 0.35, y0 + c.wallH * 0.8, sd > 0 ? nw : -nw - 0.05, sd > 0 ? nw + 0.05 : -nw);
  }
  // façade block
  const [f0, f1] = [fa - td, fa];
  const top = y0 + c.facadeH;
  const mid = c.towers === 2 ? f.b - tw : c.towers === 1 ? tw / 2 + 0.01 : f.b;
  if (c.towers !== 1) bx(wall, f, f0, f1, yb, top, -mid, mid); // 1 tower: the nave's gable end is the façade
  if (c.pediment > 0) {
    // triangular pediment over the centre (front + back faces, sloped tops in trim)
    const [p0, p1] = [f1 - 0.6, f1 + 0.1];
    for (const [aa, sd] of [[p0, -1], [p1, 1]] as const) {
      const o = at(f, sd, 0, 0);
      triOut(wall, at(f, aa, top, -mid), at(f, aa, top, mid), at(f, aa, top + c.pediment, 0), [o[0] - f.cx, 0, o[2] - f.cz]);
    }
    for (const sd of [-1, 1]) {
      const q = [at(f, p0 - 0.1, top, sd * (mid + 0.3)), at(f, p1 + 0.15, top, sd * (mid + 0.3)), at(f, p1 + 0.15, top + c.pediment + 0.3, 0), at(f, p0 - 0.1, top + c.pediment + 0.3, 0)] as const;
      const o = at(f, 0, 0, sd);
      quadOut(trim, q[0], q[1], q[2], q[3], [o[0] - f.cx, 1, o[2] - f.cz]);
    }
    bx(trim, f, f1 - 0.2, f1 + 0.1, top + c.pediment + 0.3, top + c.pediment + 1.8, -0.1, 0.1, true); // cross
    bx(trim, f, f1 - 0.2, f1 + 0.1, top + c.pediment + 1.1, top + c.pediment + 1.3, -0.5, 0.5, true);
  }
  // façade trim: base, entablature, cornice, pilasters (front), door, window above
  const front = f1;
  const pil = Math.max(2, Math.round((2 * mid) / 3.5));
  if (c.towers !== 1) {
    bx(trim, f, front - 0.2, front + 0.12, y0, y0 + 0.7, -mid - 0.1, mid + 0.1);
    bx(trim, f, front - 0.2, front + 0.18, y0 + c.facadeH * 0.55, y0 + c.facadeH * 0.55 + 0.6, -mid - 0.1, mid + 0.1);
    bx(trim, f, front - 0.2, front + 0.25, top - 0.6, top, -mid - 0.15, mid + 0.15);
    for (let k = 0; k <= pil; k++) {
      const w = -mid + 0.35 + ((2 * mid - 0.7) * k) / pil;
      bx(trim, f, front, front + 0.15, y0 + 0.7, top - 0.6, w - 0.3, w + 0.3);
    }
  }
  const door = paint(s, 'masonry', C.door);
  const dw = Math.min(1.3, mid * 0.45);
  bx(door, f, front, front + 0.06, y0, y0 + Math.min(4.2, c.facadeH * 0.4), -dw, dw);
  if (c.towers === 2) for (const sd of [-1, 1]) bx(door, f, front, front + 0.06, y0, y0 + 3.2, sd * mid * 0.55 - 0.8, sd * mid * 0.55 + 0.8);
  bx(win, f, front, front + 0.05, y0 + c.facadeH * 0.62, y0 + c.facadeH * 0.85, -dw * 0.6, dw * 0.6);
  if (c.towers !== 1) for (const sd of [-1, 1]) bx(win, f, front, front + 0.05, y0 + c.facadeH * 0.64, y0 + c.facadeH * 0.84, sd * mid * 0.5 - 0.5, sd * mid * 0.5 + 0.5);
  // towers: shaft, cornices, belfry openings, cap
  const towerAt = c.towers === 2 ? [-f.b + tw / 2, f.b - tw / 2] : c.towers === 1 ? [0] : [];
  const capB = paint(s, 'masonry', c.cap === 'dome' ? C.trim : C.roof);
  for (const w of towerAt) {
    const [t0, t1] = c.towers === 1 ? [f1 - tw, f1] : [f0, f1];
    const ht = tw / 2;
    bx(wall, f, t0, t1, yb, y0 + c.towerH, w - ht, w + ht);
    cbx(s, f, t0, t1, yb, y0 + c.towerH, w - ht, w + ht);
    for (const y of [y0 + c.facadeH - 0.6, y0 + c.towerH - 0.5]) bx(trim, f, t0 - 0.15, t1 + 0.15, y, y + 0.5, w - ht - 0.15, w + ht + 0.15);
    bx(trim, f, t0 - 0.12, t1 + 0.12, y0, y0 + 0.7, w - ht - 0.12, w + ht + 0.12);
    const b0 = y0 + c.towerH - 4.2;
    const dark = paint(s, 'masonry', '#2a2622');
    for (const [aa, ww, faceA] of [[t1, w, true], [t0, w, true], [(t0 + t1) / 2, w - ht, false], [(t0 + t1) / 2, w + ht, false]] as const) {
      if (faceA) bx(dark, f, aa - 0.04, aa + 0.04, b0, b0 + 2.8, ww - ht * 0.45, ww + ht * 0.45);
      else bx(dark, f, aa - ht * 0.45, aa + ht * 0.45, b0, b0 + 2.8, ww - 0.04, ww + 0.04);
    }
    const [ca, cy] = [(t0 + t1) / 2, y0 + c.towerH];
    const [x, , z] = at(f, ca, 0, w);
    if (c.cap === 'dome') {
      revolve(capB, x, z, [[cy, ht * 0.85], [cy + 0.6, ht * 0.85], [cy + 1.6, ht * 0.7], [cy + 2.4, ht * 0.4], [cy + 2.8, 0.15]], 12);
      revolve(trim, x, z, [[cy + 2.8, 0.08], [cy + 4.0, 0.08]], 4);
    } else {
      const sq = (r: number, y: number): V3[] => [at(f, ca - r, y, w - r), at(f, ca + r, y, w - r), at(f, ca + r, y, w + r), at(f, ca - r, y, w + r)];
      loft(capB, [sq(ht + 0.2, cy), sq(0.08, cy + 4.5)]);
      revolve(trim, x, z, [[cy + 4.5, 0.08], [cy + 5.6, 0.08]], 4);
    }
  }
  return s.out();
}

/** Ermida da Penha: the small outline = the chapel, the large one (wrapped around it) = the bishop's residence. */
function penha(rec: BuildingRec, ctx: LandmarkCtx): BuildOut {
  if (Math.abs(ringArea(rec.outer)) < 400) return church(rec, ctx, M.churches['ermida-penha']!);
  const s = new Paints();
  const P = M.penhaHouse;
  renderPart({ ...rec, height: P.height, colour: P.colour, roofShape: 'hipped', roofColour: P.roof }, { ground: ctx.ground, height: ctx.height, fallbackTop: P.height }, s);
  return s.out();
}

export const details: Partial<Record<LandmarkId, DetailFn>> = {
  'fortaleza-monte': (rec, _p: PartRec[], ctx) => monte(rec, ctx),
  'fortaleza-guia': (rec, _p, ctx) => guiaFort(rec, ctx),
  'farol-guia': (rec, _p, ctx) => farol(rec, ctx),
  'templo-ama': (rec, _p, ctx) => ama(rec, ctx),
  'kun-iam-tong': (rec, _p, ctx) => kunIamTong(rec, ctx),
  'jardim-lou-lim-ioc': (rec, _p, ctx) => louLimIoc(rec, ctx),
  'sao-lourenco': (rec, _p, ctx) => church(rec, ctx, M.churches['sao-lourenco']!),
  'santo-agostinho': (rec, _p, ctx) => church(rec, ctx, M.churches['santo-agostinho']!),
  'ermida-penha': (rec, _p, ctx) => penha(rec, ctx),
};
