// Package E: landmark placeholders (Eiffel = 4 open legs, Arc, Louvre pyramid, obelisk; SPEC §17.4), built per chunk
// from BuildingRecs carrying .landmark: 'stone' / 'iron' / 'glass' buckets + trimesh colliders.
// ponytail: procedural placeholders sized from the OSM footprint, replaced by Phase 11 models.
// Module top level must not touch the DOM: the worker imports build*(); canvas textures only inside create*().
import { CanvasTexture, DoubleSide, type Material, MeshStandardMaterial, RepeatWrapping, SRGBColorSpace } from 'three';
import { props as P } from '../config.ts';
import type { BuildingRec, XZ } from '../geo/chunkData.ts';
import type { Builder, MaterialId, MeshBucket, TriMesh } from './buildTypes.ts';
import { mergeBuckets, MeshBuffer, triangulate, type V3 } from './geom.ts';

const L = P.landmarks;

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** buf.quad (uv as in geom), with the winding flipped when needed so its normal points along `out`. */
export function quadOut(buf: MeshBuffer, a: V3, b: V3, c: V3, d: V3, out: V3, u0 = 0, v0 = 0, u1 = 1, v1 = 1) {
  if (dot(cross(sub(c, a), sub(d, b)), out) >= 0) buf.quad(a, b, c, d, u0, v0, u1, v1);
  else buf.quad(b, a, d, c, u1, v0, u0, v1);
}

/** buf.tri, flipped when needed so its normal points along `out`. */
function triOut(buf: MeshBuffer, a: V3, b: V3, c: V3, out: V3, uv = [0, 0, 1, 0, 0, 1]) {
  if (dot(cross(sub(b, a), sub(c, a)), out) >= 0) buf.tri(a, b, c, uv);
  else buf.tri(a, c, b, [uv[0]!, uv[1]!, uv[4]!, uv[5]!, uv[2]!, uv[3]!]);
}

/** Side walls between consecutive closed rings (same vertex count), normals away from the rings' axis.
 *  uv in `tile` metres: u along the lower ring's perimeter, v = height. */
function loft(buf: MeshBuffer, rings: V3[][], tile = 1) {
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
function box(buf: MeshBuffer, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, tile = 1) {
  const ring = (y: number): V3[] => [[x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1]];
  loft(buf, [ring(y0), ring(y1)], tile);
  quadOut(buf, ...(ring(y1) as [V3, V3, V3, V3]), [0, 1, 0]);
  quadOut(buf, ...(ring(y0) as [V3, V3, V3, V3]), [0, -1, 0]);
}

/** Square ring of half-size s at height y, centred on the axis (or on (cx, cz)). */
const square = (s: number, y: number, cx = 0, cz = 0, t = s): V3[] => [
  [cx - s, y, cz - t], [cx + s, y, cz - t], [cx + s, y, cz + t], [cx - s, y, cz + t],
];

/** Polygon (s, y pairs) in a vertical plane, extruded from t0 to t1 along local Z (s = x) or X (s = z); all faces. */
function extrude(buf: MeshBuffer, poly: number[], axis: 'x' | 'z', t0: number, t1: number) {
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
const arch = (r: number, y: number, segs = 12) =>
  Array.from({ length: segs + 1 }, (_, k) => [r * Math.cos(Math.PI * (1 - k / segs)), y + r * Math.sin(Math.PI * (1 - k / segs))]).flat();

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
function place(b: MeshBucket, f: ReturnType<typeof footprintFrame>, y0: number, sx = 1, sy = 1, sz = 1) {
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

const collider = (b: MeshBucket): TriMesh => ({ vertices: b.position.slice(), indices: b.index.slice() });

// Eiffel profile at 330 m, 125 m base: legs (y, outer half-size, leg width) converge and merge at the 2nd platform.
const EIFFEL_LEGS = [[0, 62.5, 26], [28, 47, 20], [57, 36, 15], [86, 27.5, 16.5], [115, 20, 20]];
const EIFFEL_SHAFT = [[115, 20], [180, 11], [240, 7], [276, 5]];
const EIFFEL_SPIRE = [[280, 3], [312, 1.5], [330, 0.25]];

function eiffel(rec: BuildingRec, y0: number) {
  const f = footprintFrame(rec.outer);
  const sxz = f.b / 62.5; // square tower: the shorter side
  const sy = (rec.height ?? L.eiffelHeight) / 330;
  const tile = L.latticeTile / sxz;
  const legs = new MeshBuffer('iron');
  for (const [sx, sz] of [[1, 1], [-1, 1], [-1, -1], [1, -1]] as const) {
    const rings = EIFFEL_LEGS.map(([y, s, w]): V3[] => {
      const m = s! - w! / 2; // leg centre (half-size w/2) on the diagonal
      return square(w! / 2, y!, sx * m, sz * m);
    });
    loft(legs, rings, tile);
  }
  const top = new MeshBuffer('iron');
  loft(top, EIFFEL_SHAFT.map(([y, s]) => square(s!, y!)), tile);
  loft(top, EIFFEL_SPIRE.map(([y, s]) => square(s!, y!)), tile);
  // 1st platform: hollow square ring (open above the walkable centre); 2nd and 3rd: solid slabs.
  for (const [x0, x1, z0, z1] of [[-39, 39, 22, 39], [-39, 39, -39, -22], [22, 39, -22, 22], [-39, -22, -22, 22]]) {
    box(top, x0!, x1!, 55, 59.5, z0!, z1!, tile);
  }
  box(top, -23, 23, 113, 117.5, -23, 23, tile);
  box(top, -8.5, 8.5, 274, 281, -8.5, 8.5, tile);
  const legBucket = place(legs.bucket(), f, y0, sxz, sy, sxz);
  return { meshes: [legBucket, place(top.bucket(), f, y0, sxz, sy, sxz)], colliders: [collider(legBucket)] };
}

// Arc de Triomphe at 45 (x) × 50 (y) × 22 (z) m: main arch through z, transverse arch through x.
function arc(rec: BuildingRec, y0: number) {
  const f = footprintFrame(rec.outer);
  const [W, D, H] = [22.5, 11, 50]; // half width, half depth, height
  const [m, ms, t, ts] = [7.3, 21.9, 4.2, 14.5]; // main arch half-width / springing, transverse arch half-width / springing
  const buf = new MeshBuffer('stone');
  const front = [-W, 0, -m, 0, ...arch(m, ms), m, 0, W, 0, W, H, -W, H];
  extrude(buf, front, 'z', -D, -t);
  extrude(buf, front, 'z', t, D);
  extrude(buf, [...arch(m, ms), m, H, -m, H], 'z', -t, t);
  const pier = [...arch(t, ts), t, H, -t, H];
  extrude(buf, pier, 'x', m, W);
  extrude(buf, pier, 'x', -W, -m);
  box(buf, -W - 0.8, W + 0.8, 38.5, 40.5, -D - 0.8, D + 0.8); // cornice under the attic
  const b = place(buf.bucket(), f, y0, f.a / W, (rec.height ?? L.arcHeight) / H, f.b / D);
  return { meshes: [b], colliders: [collider(b)] };
}

function pyramid(rec: BuildingRec, y0: number) {
  const f = footprintFrame(rec.outer);
  const h = rec.height ?? L.pyramidHeight;
  const glass = new MeshBuffer('glass');
  const base = square(f.a, 0, 0, 0, f.b);
  const apex: V3 = [0, h, 0];
  const solid = new MeshBuffer('glass');
  for (let i = 0; i < 4; i++) {
    const [a, b] = [base[i]!, base[(i + 1) % 4]!];
    const len = Math.hypot(b[0] - a[0], b[2] - a[2]);
    const slant = Math.hypot(h, Math.hypot((a[0] + b[0]) / 2, (a[2] + b[2]) / 2));
    const out: V3 = [(a[0] + b[0]) / 2, h / 3, (a[2] + b[2]) / 2];
    const g = L.glassTile;
    triOut(glass, a, b, apex, out, [0, 0, len / g, 0, len / (2 * g), slant / g]);
    triOut(solid, a, b, apex, out);
  }
  quadOut(solid, ...(base as [V3, V3, V3, V3]), [0, -1, 0]);
  return { meshes: [place(glass.bucket(), f, y0)], colliders: [collider(place(solid.bucket(), f, y0))] };
}

function obelisk(rec: BuildingRec, y0: number) {
  const f = footprintFrame(rec.outer);
  const total = rec.height ?? L.obeliskHeight;
  const shaft = Math.min(L.obeliskShaft, total);
  const ped = total - shaft; // pedestal (0 when OSM has no height)
  const s = Math.max(f.a, 1.5);
  const buf = new MeshBuffer('stone');
  if (ped > 0) {
    box(buf, -s - 0.6, s + 0.6, 0, Math.min(1.2, ped), -s - 0.6, s + 0.6);
    box(buf, -s, s, 0, ped, -s, s);
  }
  const pyr = ped + shaft - 1.6;
  loft(buf, [square(1.25, ped), square(0.8, pyr)]);
  for (let i = 0; i < 4; i++) {
    const r = square(0.8, pyr);
    const [a, b] = [r[i]!, r[(i + 1) % 4]!];
    triOut(buf, a, b, [0, ped + shaft, 0], [(a[0] + b[0]) / 2, 0.5, (a[2] + b[2]) / 2]);
  }
  const b = place(buf.bucket(), f, y0);
  return { meshes: [b], colliders: [collider(b)] };
}

const BUILD = { eiffel, arc, pyramid, obelisk };

export const buildLandmarks: Builder = (chunk, ctx) => {
  const meshes: MeshBucket[] = [];
  const colliders: TriMesh[] = [];
  for (const rec of chunk.buildings) {
    if (!rec.landmark) continue;
    let y0 = Infinity;
    for (let i = 0; i < rec.outer.length; i += 2) y0 = Math.min(y0, ctx.height(rec.outer[i]!, rec.outer[i + 1]!));
    const out = BUILD[rec.landmark](rec, y0 - L.sink);
    meshes.push(...out.meshes);
    colliders.push(...out.colliders);
  }
  return { meshes: mergeBuckets(meshes), instances: [], colliders };
};

/** 64 px repeating canvas texture (main thread only). */
function canvasTexture(draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  draw(c.getContext('2d')!);
  const t = new CanvasTexture(c);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function createLandmarkMaterials(): Partial<Record<MaterialId, Material>> {
  // Lattice: white frame + X bracing on transparent; alphaTest low enough that far mip levels stay solid.
  const lattice = canvasTexture((g) => {
    g.strokeStyle = '#fff';
    g.lineWidth = 8;
    g.strokeRect(4, 4, 56, 56);
    g.lineWidth = 5;
    g.beginPath();
    g.moveTo(0, 0), g.lineTo(64, 64), g.moveTo(64, 0), g.lineTo(0, 64);
    g.stroke();
  });
  const panes = canvasTexture((g) => {
    g.fillStyle = 'rgba(255,255,255,0.55)';
    g.fillRect(0, 0, 64, 64);
    g.strokeStyle = 'rgba(40,46,52,1)';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(0, 32), g.lineTo(32, 0), g.lineTo(64, 32), g.lineTo(32, 64), g.closePath();
    g.moveTo(0, 0), g.lineTo(64, 0);
    g.stroke();
  });
  return {
    stone: new MeshStandardMaterial({ color: '#d8c8a2', roughness: 0.85 }),
    iron: new MeshStandardMaterial({ color: '#8c6a4d', roughness: 0.7, metalness: 0.1, map: lattice, alphaTest: 0.35, side: DoubleSide }),
    glass: new MeshStandardMaterial({ color: '#bcd0da', roughness: 0.12, metalness: 0.25, map: panes, transparent: true, opacity: 0.85, side: DoubleSide }),
  };
}
