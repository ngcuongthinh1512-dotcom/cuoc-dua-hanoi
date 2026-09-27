// Geometry helpers shared by the chunk builders (B, C, D, E). Pure math only (three's ShapeUtils/Vector2):
// runs in the worker, on the main thread and in Node tests.
import { ShapeUtils, Vector2 } from 'three';
import type { XZ } from '../geo/chunkData.ts';
import { type MaterialId, type MeshBucket, type TriMesh, VERTEX_COLOR } from './buildTypes.ts';

export type V3 = readonly [number, number, number];

/** Growable indexed mesh for one material. Vertex colour is on iff VERTEX_COLOR has the material; the current
 *  `color` (linear RGB) is stamped on every vertex added after it is set. Front faces are counter-clockwise. */
export class MeshBuffer {
  readonly withColor: boolean;
  color: V3 = [1, 1, 1];
  private readonly p: number[] = [];
  private readonly n: number[] = [];
  private readonly t: number[] = [];
  private readonly c: number[] = [];
  private readonly i: number[] = [];

  constructor(readonly material: MaterialId) {
    this.withColor = VERTEX_COLOR.has(material);
  }

  get vertexCount() {
    return this.p.length / 3;
  }

  /** Adds one vertex (explicit normal), returns its index for face(). */
  vertex(x: number, y: number, z: number, nx: number, ny: number, nz: number, u: number, v: number): number {
    this.p.push(x, y, z);
    this.n.push(nx, ny, nz);
    this.t.push(u, v);
    if (this.withColor) this.c.push(...this.color);
    return this.p.length / 3 - 1;
  }

  /** Triangle over existing vertex indices (smooth: keeps their normals). */
  face(a: number, b: number, c: number) {
    this.i.push(a, b, c);
  }

  /** Flat-shaded triangle; uv per corner (default (0,0), (1,0), (0,1)). */
  tri(a: V3, b: V3, c: V3, uv: readonly number[] = [0, 0, 1, 0, 0, 1]) {
    const [nx, ny, nz] = unitNormal(sub(b, a), sub(c, a));
    const k = this.vertex(a[0], a[1], a[2], nx, ny, nz, uv[0]!, uv[1]!);
    this.vertex(b[0], b[1], b[2], nx, ny, nz, uv[2]!, uv[3]!);
    this.vertex(c[0], c[1], c[2], nx, ny, nz, uv[4]!, uv[5]!);
    this.face(k, k + 1, k + 2);
  }

  /** Flat-shaded quad a→b→c→d; uv (u0,v0) at a, (u1,v0) at b, (u1,v1) at c, (u0,v1) at d.
   *  A wall seen from outside: a = bottom-left, b = bottom-right, c = top-right, d = top-left. */
  quad(a: V3, b: V3, c: V3, d: V3, u0 = 0, v0 = 0, u1 = 1, v1 = 1) {
    const [nx, ny, nz] = unitNormal(sub(c, a), sub(d, b)); // diagonals: fine for slightly non-planar quads
    const k = this.vertex(a[0], a[1], a[2], nx, ny, nz, u0, v0);
    this.vertex(b[0], b[1], b[2], nx, ny, nz, u1, v0);
    this.vertex(c[0], c[1], c[2], nx, ny, nz, u1, v1);
    this.vertex(d[0], d[1], d[2], nx, ny, nz, u0, v1);
    this.face(k, k + 1, k + 2);
    this.face(k, k + 2, k + 3);
  }

  bucket(): MeshBucket {
    return {
      material: this.material,
      position: new Float32Array(this.p),
      normal: new Float32Array(this.n),
      uv: new Float32Array(this.t),
      ...(this.withColor ? { color: new Float32Array(this.c) } : {}),
      index: new Uint32Array(this.i),
    };
  }
}

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

/** normalize(a × b); degenerate → +Y (never NaN). */
function unitNormal(a: V3, b: V3): V3 {
  const x = a[1] * b[2] - a[2] * b[1];
  const y = a[2] * b[0] - a[0] * b[2];
  const z = a[0] * b[1] - a[1] * b[0];
  const l = Math.hypot(x, y, z);
  return l > 1e-12 ? [x / l, y / l, z / l] : [0, 1, 0];
}

/** One bucket per material (first-seen order); empty buckets dropped. Throws if buckets of one material disagree on
 *  having `color`, or if a bucket's attribute lengths don't match its vertex count. */
export function mergeBuckets(buckets: MeshBucket[]): MeshBucket[] {
  const groups = new Map<MaterialId, MeshBucket[]>();
  for (const b of buckets) {
    const n = b.position.length / 3;
    if (b.normal.length !== n * 3 || b.uv.length !== n * 2 || (b.color && b.color.length !== n * 3)) {
      throw new Error(`mergeBuckets: '${b.material}' attribute lengths don't match ${n} vertices`);
    }
    if (!b.index.length) continue;
    const list = groups.get(b.material);
    if (list) list.push(b);
    else groups.set(b.material, [b]);
  }
  return [...groups].map(([material, list]) => {
    const withColor = list[0]!.color !== undefined;
    if (list.some((b) => (b.color !== undefined) !== withColor)) {
      throw new Error(`mergeBuckets: '${material}' buckets mix with and without color`);
    }
    if (list.length === 1) return list[0]!;
    const cat = (get: (b: MeshBucket) => Float32Array) => {
      const out = new Float32Array(list.reduce((s, b) => s + get(b).length, 0));
      list.reduce((at, b) => (out.set(get(b), at), at + get(b).length), 0);
      return out;
    };
    const index = new Uint32Array(list.reduce((s, b) => s + b.index.length, 0));
    let at = 0;
    let base = 0;
    for (const b of list) {
      for (let k = 0; k < b.index.length; k++) index[at + k] = b.index[k]! + base;
      at += b.index.length;
      base += b.position.length / 3;
    }
    return {
      material,
      position: cat((b) => b.position),
      normal: cat((b) => b.normal),
      uv: cat((b) => b.uv),
      ...(withColor ? { color: cat((b) => b.color!) } : {}),
      index,
    };
  });
}

/** All colliders of a chunk as one trimesh. */
export function mergeTriMeshes(meshes: TriMesh[]): TriMesh {
  const vertices = new Float32Array(meshes.reduce((s, m) => s + m.vertices.length, 0));
  const indices = new Uint32Array(meshes.reduce((s, m) => s + m.indices.length, 0));
  let v = 0;
  let i = 0;
  for (const m of meshes) {
    vertices.set(m.vertices, v);
    for (let k = 0; k < m.indices.length; k++) indices[i + k] = m.indices[k]! + v / 3;
    v += m.vertices.length;
    i += m.indices.length;
  }
  return { vertices, indices };
}

/** Polyline offset sideways by d metres; d > 0 = LEFT of the travel direction seen from above (north up).
 *  Joins are mitred, the miter length clamped to |d|·miterLimit. `before` / `after` are the neighbour points across a
 *  chunk split (RoadRec.before/after), so both pieces compute the same join at their shared vertex. */
export function offsetPolyline(pts: XZ, d: number, before?: [number, number], after?: [number, number], miterLimit = 4): XZ {
  const n = pts.length / 2;
  const at = (i: number): readonly number[] | undefined =>
    i === -1 ? before : i === n ? after : i >= 0 && i < n ? [pts[2 * i]!, pts[2 * i + 1]!] : undefined;
  // Left unit normal of the segment between point i and its nearest distinct neighbour (step −1 = incoming,
  // +1 = outgoing): travel (dx, dz) turned 90° to the left = (dz, −dx) (X east, Z south).
  const left = (i: number, step: 1 | -1) => {
    for (let j = i + step; ; j += step) {
      const q = at(j);
      if (!q) return undefined;
      const dx = (q[0]! - pts[2 * i]!) * step;
      const dz = (q[1]! - pts[2 * i + 1]!) * step;
      const l = Math.hypot(dx, dz);
      if (l > 1e-9) return [dz / l, -dx / l];
    }
  };
  const out: XZ = [];
  for (let i = 0; i < n; i++) {
    const x = pts[2 * i]!;
    const z = pts[2 * i + 1]!;
    const n1 = left(i, -1);
    const n2 = left(i, 1);
    const a = n1 ?? n2;
    const b = n2 ?? n1;
    if (!a || !b) {
      out.push(x, z); // isolated point: no direction
      continue;
    }
    let mx = a[0]! + b[0]!;
    let mz = a[1]! + b[1]!;
    const ml = Math.hypot(mx, mz);
    if (ml < 1e-9) [mx, mz] = [a[0]!, a[1]!]; // U-turn
    else [mx, mz] = [mx / ml, mz / ml];
    const s = d / Math.max(mx * a[0]! + mz * a[1]!, 1 / miterLimit);
    out.push(x + mx * s, z + mz * s);
  }
  return out;
}

/** Triangulates outer + holes (any orientation; rings not closed, per chunkData) into flat indices over the
 *  concatenated points [outer…, hole0…, hole1…]. Triangles face +Y (counter-clockwise seen from above). */
export function triangulate(outer: XZ, holes: XZ[] = []): number[] {
  // (x, −z) = (east, north): counter-clockwise there is counter-clockwise seen from above.
  const ring = (r: XZ) => Array.from({ length: r.length / 2 }, (_, i) => new Vector2(r[2 * i]!, -r[2 * i + 1]!));
  return ShapeUtils.triangulateShape(ring(outer), holes.map(ring)).flat();
}

/** Deterministic hash of a point (rounded to 0.1 m, like the chunk data) and a salt → [0, 1). */
export function hash01(x: number, z: number, salt = 0): number {
  let h = Math.imul(Math.round(x * 10) | 0, 0x27d4eb2d) ^ Math.imul(Math.round(z * 10) | 0, 0x165667b1);
  h = Math.imul(h ^ Math.imul(salt | 0, 0x9e3779b1), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
