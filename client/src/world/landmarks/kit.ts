// Geometry kit shared by the landmark builders (index.ts, parts.ts, g1…g5.ts; moved from the Phase 2 Landmarks.ts).
// Pure math, DOM-free (runs in the chunk worker). Local frames: x along the footprint's long axis u, y up, z along w.
import type { XZ } from '../../geo/chunkData.ts';
import type { MeshBucket, TriMesh } from '../buildTypes.ts';
import { type MeshBuffer, triangulate, type V3 } from '../geom.ts';

export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** buf.quad (uv as in geom), with the winding flipped when needed so its normal points along `out`. */
export function quadOut(buf: MeshBuffer, a: V3, b: V3, c: V3, d: V3, out: V3, u0 = 0, v0 = 0, u1 = 1, v1 = 1) {
  if (dot(cross(sub(c, a), sub(d, b)), out) >= 0) buf.quad(a, b, c, d, u0, v0, u1, v1);
  else buf.quad(b, a, d, c, u1, v0, u0, v1);
}

/** buf.tri, flipped when needed so its normal points along `out`. */
export function triOut(buf: MeshBuffer, a: V3, b: V3, c: V3, out: V3, uv = [0, 0, 1, 0, 0, 1]) {
  if (dot(cross(sub(b, a), sub(c, a)), out) >= 0) buf.tri(a, b, c, uv);
  else buf.tri(a, c, b, [uv[0]!, uv[1]!, uv[4]!, uv[5]!, uv[2]!, uv[3]!]);
}

/** Side walls between consecutive closed rings (same vertex count), normals away from the rings' axis.
 *  uv in `tile` metres: u along the lower ring's perimeter, v = height. */
export function loft(buf: MeshBuffer, rings: V3[][], tile = 1) {
  for (let k = 0; k + 1 < rings.length; k++) {
    const lo = rings[k]!;
    const hi = rings[k + 1]!;
    const n = lo.length;
    const c = [...lo, ...hi].reduce<V3>((s, p) => [s[0] + p[0] / (2 * n), s[1] + p[1] / (2 * n), s[2] + p[2] / (2 * n)], [0, 0, 0]);
    let u = 0;
    for (let i = 0; i < n; i++) {
      const a = lo[i]!;
      const b = lo[(i + 1) % n]!;
      const len = Math.hypot(b[0] - a[0], b[2] - a[2]);
      const m = [(a[0] + b[0] + hi[i]![0] + hi[(i + 1) % n]![0]) / 4, 0, (a[2] + b[2] + hi[i]![2] + hi[(i + 1) % n]![2]) / 4] as const;
      quadOut(buf, a, b, hi[(i + 1) % n]!, hi[i]!, [m[0] - c[0], 0, m[2] - c[2]], u / tile, a[1] / tile, (u + len) / tile, hi[i]![1] / tile);
      u += len;
    }
  }
}

/** Axis-aligned box (all 6 faces). */
export function box(buf: MeshBuffer, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, tile = 1) {
  const ring = (y: number): V3[] => [[x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1]];
  loft(buf, [ring(y0), ring(y1)], tile);
  quadOut(buf, ...(ring(y1) as [V3, V3, V3, V3]), [0, 1, 0]);
  quadOut(buf, ...(ring(y0) as [V3, V3, V3, V3]), [0, -1, 0]);
}

/** Square ring of half-size s at height y, centred on the axis (or on (cx, cz)). */
export const square = (s: number, y: number, cx = 0, cz = 0, t = s): V3[] => [
  [cx - s, y, cz - t], [cx + s, y, cz - t], [cx + s, y, cz + t], [cx - s, y, cz + t],
];

/** Polygon (s, y pairs) in a vertical plane, extruded from t0 to t1 along local Z (s = x) or X (s = z); all faces. */
export function extrude(buf: MeshBuffer, poly: number[], axis: 'x' | 'z', t0: number, t1: number) {
  const P3 = (s: number, y: number, t: number): V3 => (axis === 'z' ? [s, y, t] : [t, y, s]);
  const n = poly.length / 2;
  let area = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += poly[2 * i]! * poly[2 * j + 1]! - poly[2 * j]! * poly[2 * i + 1]!;
  }
  const sign = area > 0 ? 1 : -1; // counter-clockwise in (s right, y up) → outward = (dy, −ds)
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const [s0, y0, s1, y1] = [poly[2 * i]!, poly[2 * i + 1]!, poly[2 * j]!, poly[2 * j + 1]!];
    const out = P3((y1 - y0) * sign, -(s1 - s0) * sign, 0);
    quadOut(buf, P3(s0, y0, t0), P3(s1, y1, t0), P3(s1, y1, t1), P3(s0, y0, t1), out);
  }
  const idx = triangulate(poly);
  for (const [t, dir] of [[t0, -1], [t1, 1]] as const) {
    for (let k = 0; k < idx.length; k += 3) {
      const [a, b, c] = [idx[k]!, idx[k + 1]!, idx[k + 2]!].map((i) => P3(poly[2 * i]!, poly[2 * i + 1]!, t)) as [V3, V3, V3];
      triOut(buf, a, b, c, P3(0, 0, dir));
    }
  }
}

/** Semicircle points from (−r, y) over the top to (r, y), centred at s = 0. */
export const arch = (r: number, y: number, segs = 12) =>
  Array.from({ length: segs + 1 }, (_, k) => [r * Math.cos(Math.PI * (1 - k / segs)), y + r * Math.sin(Math.PI * (1 - k / segs))]).flat();

export type Frame = ReturnType<typeof footprintFrame>;

/** Minimum-area rectangle around a footprint: centre, long axis u (unit), half-sizes a ≥ b (along u, along w = (−uz, ux)). */
export function footprintFrame(ring: XZ) {
  const n = ring.length / 2;
  let best = { area: Infinity, cx: 0, cz: 0, ux: 1, uz: 0, a: 0, b: 0 };
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    let ux = ring[2 * j]! - ring[2 * i]!;
    let uz = ring[2 * j + 1]! - ring[2 * i + 1]!;
    const l = Math.hypot(ux, uz);
    if (l < 1e-6) continue;
    [ux, uz] = [ux / l, uz / l];
    let [u0, u1, w0, w1] = [Infinity, -Infinity, Infinity, -Infinity];
    for (let k = 0; k < n; k++) {
      const x = ring[2 * k]!;
      const z = ring[2 * k + 1]!;
      const pu = x * ux + z * uz;
      const pw = -x * uz + z * ux;
      [u0, u1, w0, w1] = [Math.min(u0, pu), Math.max(u1, pu), Math.min(w0, pw), Math.max(w1, pw)];
    }
    const area = (u1 - u0) * (w1 - w0);
    if (area >= best.area - 1e-6) continue;
    const [mu, mw] = [(u0 + u1) / 2, (w0 + w1) / 2];
    best = { area, cx: mu * ux - mw * uz, cz: mu * uz + mw * ux, ux, uz, a: (u1 - u0) / 2, b: (w1 - w0) / 2 };
  }
  if (best.a < best.b) best = { ...best, ux: -best.uz, uz: best.ux, a: best.b, b: best.a }; // u := w
  return best;
}

/** Local (x along u, y up, z along w) → world, in place: scale (sx, sy, sz), rotate, translate to (cx, y0, cz). */
export function place(b: MeshBucket, f: Frame, y0: number, sx = 1, sy = 1, sz = 1) {
  const { position: p, normal: nm } = b;
  for (let i = 0; i < p.length; i += 3) {
    const [x, y, z] = [p[i]! * sx, p[i + 1]! * sy, p[i + 2]! * sz];
    p[i] = f.cx + x * f.ux - z * f.uz;
    p[i + 1] = y0 + y;
    p[i + 2] = f.cz + x * f.uz + z * f.ux;
    const [nx, ny, nz] = [nm[i]! / sx, nm[i + 1]! / sy, nm[i + 2]! / sz];
    const l = Math.hypot(nx, ny, nz) || 1;
    nm[i] = (nx * f.ux - nz * f.uz) / l;
    nm[i + 1] = ny / l;
    nm[i + 2] = (nx * f.uz + nz * f.ux) / l;
  }
  return b;
}

/** A bucket's triangles as a collider (use only for simplified shapes, SPEC §5.9: never detail geometry). */
export const collider = (b: MeshBucket): TriMesh => ({ vertices: b.position.slice(), indices: b.index.slice() });

/** Lowest terrain height over a ring. */
export function minGround(r: XZ, height: (x: number, z: number) => number) {
  let y = Infinity;
  for (let i = 0; i < r.length; i += 2) y = Math.min(y, height(r[i]!, r[i + 1]!));
  return y;
}
