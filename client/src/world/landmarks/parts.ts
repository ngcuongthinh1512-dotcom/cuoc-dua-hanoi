// Generic Simple-3D-Buildings renderer (A, docs/plans/phase2b-assets.md §5.4) for landmark outlines and building:part.
// Per part: walls (prism) from min_height to height − roof:height, then the roof:
//   height-field roofs = the lowest of a few planes over the footprint's min-area frame (u = long axis, w across):
//     skillion, gabled, hipped, side_hipped, mansard, gambrel, round (barrel, chord planes). The footprint is clipped
//     into one region per plane, so any footprint works and wall tops follow the roof line exactly;
//   pyramidal / cone = fan from every outer edge to an apex over the centroid; dome / onion = lathe on the frame ellipse;
//   rare shapes → nearest (ALIAS), unknown → flat. building:part=column → round column; =roof → slab + roof only.
// Every part is a closed surface (floor included). Materials from roof:material / building:material, colour tags win.
// Colliders: simplified prisms (footprint from the wall bottom to the eaves), never the roof or detail geometry (§5.9).
// DOM-free (chunk worker).
import { Color } from 'three';
import { buildings as B, landmarks as L } from '../../config.ts';
import { ringArea, type S3dFacts, type XZ } from '../../geo/chunkData.ts';
import { ringCentroid } from '../../geo/clip.ts';
import type { BuildOut, MaterialId } from '../buildTypes.ts';
import { MeshBuffer, mergeBuckets, triangulate, type V3 } from '../geom.ts';
import { footprintFrame, type Frame, quadOut, triOut } from './kit.ts';

export type PartLike = S3dFacts & { outer: XZ; holes?: XZ[]; kind: string };

export type Shape =
  | 'flat' | 'skillion' | 'gabled' | 'hipped' | 'side_hipped' | 'mansard' | 'gambrel' | 'round'
  | 'pyramidal' | 'cone' | 'dome' | 'onion';
const SHAPES = new Set<string>(['flat', 'skillion', 'gabled', 'hipped', 'side_hipped', 'mansard', 'gambrel', 'round', 'pyramidal', 'cone', 'dome', 'onion']);
const ALIAS: Record<string, Shape> = {
  'half-hipped': 'hipped', half_hipped: 'hipped', quadruple_saltbox: 'hipped', crosspitched: 'hipped', many: 'hipped',
  dutch: 'hipped', 'hipped-and-gabled': 'hipped', saltbox: 'gabled', double_saltbox: 'gabled', triple_saltbox: 'gabled',
  gabled_height_moved: 'gabled', pitched: 'gabled', round_pyramidal: 'pyramidal', spherical: 'dome', shed: 'skillion',
  lean_to: 'skillion', barrel: 'round',
};

/** roof:shape → one of the rendered shapes (missing / unknown → flat). */
export function roofShape(tag: string | undefined): Shape {
  const t = tag?.trim().toLowerCase() ?? 'flat';
  return SHAPES.has(t) ? (t as Shape) : (ALIAS[t] ?? 'flat');
}

// ── materials ──

type ColourKey = keyof typeof L.colours;
const MATERIALS: Record<string, [MaterialId, ColourKey]> = {
  glass: ['glass', 'glass'], gold: ['gold', 'gold'], bronze: ['bronze', 'bronze'],
  copper: ['masonry', 'copper'], lead: ['masonry', 'lead'], zinc: ['masonry', 'zinc'], slate: ['masonry', 'slate'],
  tiles: ['masonry', 'tiles'], roof_tiles: ['masonry', 'tiles'], tile: ['masonry', 'tiles'], brick: ['masonry', 'brick'],
  concrete: ['masonry', 'concrete'], metal: ['metal', 'metal'], steel: ['metal', 'metal'], iron: ['metal', 'metal'],
  metal_sheet: ['metal', 'metal'], aluminium: ['metal', 'metal'], tin: ['metal', 'metal'],
};

const linear = (c: Color): V3 => [c.r, c.g, c.b];
/** building:colour / roof:colour → linear RGB: '#rgb', '#rrggbb' or a CSS name ('light_grey' = 'lightgrey'); else undefined. */
export function parseColour(v: string | undefined): V3 | undefined {
  const s = v?.trim().toLowerCase() ?? '';
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/.test(s)) return linear(new Color(s));
  const name = s.replace(/[\s_-]/g, '') as keyof typeof Color.NAMES;
  return name in Color.NAMES ? linear(new Color(Color.NAMES[name])) : undefined;
}

export interface Pick {
  id: MaterialId;
  tint: V3; // linear RGB (vertex colour of 'masonry' / 'metal'; ignored by the others)
}
/** Material tag (+ colour tag, which wins for the tint) → bucket material; `dflt` colour when neither says anything. */
export function pickMaterial(material: string | undefined, colour: string | undefined, dflt: ColourKey): Pick {
  const [id, key] = MATERIALS[material?.trim().toLowerCase() ?? ''] ?? ['masonry', dflt];
  return { id, tint: parseColour(colour) ?? linear(new Color(L.colours[key])) };
}

// ── output ──

/** Mesh buffers by material (+ lod) and collider triangles shared by every part of one landmark. */
export class Sink {
  private readonly bufs = new Map<string, { buf: MeshBuffer; lod?: 'near' }>();
  readonly cv: number[] = [];
  readonly ci: number[] = [];

  buf(m: MaterialId, lod?: 'near'): MeshBuffer {
    const k = `${m}|${lod ?? ''}`;
    const e = this.bufs.get(k) ?? { buf: new MeshBuffer(m), ...(lod && { lod }) };
    this.bufs.set(k, e);
    return e.buf;
  }

  /** Collider prism: walls of every ring from y0 to y1, top and bottom caps. */
  prism(rings: XZ[], y0: number, y1: number) {
    for (const r of rings) {
      for (let i = 0, n = r.length; i < n; i += 2) {
        const [ax, az, bx, bz] = [r[i]!, r[i + 1]!, r[(i + 2) % n]!, r[(i + 3) % n]!];
        const c = this.cv.length / 3;
        this.cv.push(ax, y0, az, bx, y0, bz, bx, y1, bz, ax, y1, az);
        this.ci.push(c, c + 1, c + 2, c, c + 2, c + 3);
      }
    }
    const idx = triangulate(rings[0]!, rings.slice(1));
    const flat = rings.flat();
    for (const y of [y0, y1]) {
      const c = this.cv.length / 3;
      for (let i = 0; i < flat.length; i += 2) this.cv.push(flat[i]!, y, flat[i + 1]!);
      for (const k of idx) this.ci.push(c + k);
    }
  }

  out(): BuildOut {
    return {
      meshes: mergeBuckets([...this.bufs.values()].map((e) => e.buf.bucket(e.lod))),
      instances: [],
      colliders: this.ci.length ? [{ vertices: new Float32Array(this.cv), indices: new Uint32Array(this.ci) }] : [],
    };
  }
}

// ── geometry ──

const LH = B.levelHeight;

function clean(r: XZ, sign: 1 | -1): XZ | undefined {
  const out: XZ = [];
  for (let i = 0; i < r.length; i += 2) {
    const n = out.length;
    if (n && Math.abs(out[n - 2]! - r[i]!) < 0.02 && Math.abs(out[n - 1]! - r[i + 1]!) < 0.02) continue;
    out.push(r[i]!, r[i + 1]!);
  }
  while (out.length > 4 && Math.abs(out[0]! - out.at(-2)!) < 0.02 && Math.abs(out[1]! - out.at(-1)!) < 0.02) out.length -= 2;
  if (out.length < 6 || Math.abs(ringArea(out)) < 0.05) return undefined;
  if (ringArea(out) * sign > 0) return out;
  const rev: XZ = [];
  for (let i = out.length - 2; i >= 0; i -= 2) rev.push(out[i]!, out[i + 1]!);
  return rev;
}

/** [outer (area > 0), ...holes (area < 0)], or undefined for a degenerate outer ring. */
export function partRings(p: { outer: XZ; holes?: XZ[] }): XZ[] | undefined {
  const outer = clean(p.outer, 1);
  return outer && [outer, ...(p.holes ?? []).map((h) => clean(h, -1)).filter((h) => h !== undefined)];
}

/** y = c + gx·x + gz·z, as a share of the roof height (0 = eaves, 1 = ridge). */
type Plane = [number, number, number];

/** Local plane k0 + ku·u + kw·w over frame f → world plane. */
function world(f: Frame, [k0, ku, kw]: Plane): Plane {
  const gx = ku * f.ux - kw * f.uz;
  const gz = ku * f.uz + kw * f.ux;
  return [k0 - gx * f.cx - gz * f.cz, gx, gz];
}

/** The planes whose minimum is the roof, or undefined for the non-height-field shapes. */
function roofPlanes(shape: Shape, f0: Frame, p: PartLike, outer: XZ): Plane[] | undefined {
  const f = p.roofOrientation === 'across' ? { ...f0, ux: -f0.uz, uz: f0.ux, a: f0.b, b: f0.a } : f0;
  const { a, b } = f;
  const sides = (inset: number, lower: number, ends: boolean): Plane[] => {
    const out: Plane[] = [];
    const run = (1 - inset) * b;
    for (const s of [1, -1]) {
      out.push([lower / inset, 0, (-s * lower) / (inset * b)], [1, 0, (-s * (1 - lower)) / run]);
      if (ends) out.push([(lower * a) / (inset * b), (-s * lower) / (inset * b), 0], [lower + ((1 - lower) * (a - inset * b)) / run, (-s * (1 - lower)) / run, 0]);
    }
    return out;
  };
  let local: Plane[];
  switch (shape) {
    case 'skillion': {
      // roof:direction = the way the slope faces (its low side); default: facing +w
      const th = ((p.roofDirection ?? (Math.atan2(-f.uz, -f.ux) * 180) / Math.PI) * Math.PI) / 180;
      const [dx, dz] = [Math.sin(th), -Math.cos(th)];
      let [lo, hi] = [Infinity, -Infinity];
      for (let i = 0; i < outer.length; i += 2) [lo, hi] = [Math.min(lo, outer[i]! * dx + outer[i + 1]! * dz), Math.max(hi, outer[i]! * dx + outer[i + 1]! * dz)];
      const span = hi - lo || 1;
      return [[1 + lo / span, -dx / span, -dz / span]];
    }
    case 'gabled':
      local = [[1, 0, -1 / b], [1, 0, 1 / b]];
      break;
    case 'hipped':
      local = [[1, 0, -1 / b], [1, 0, 1 / b], [a / b, -1 / b, 0], [a / b, 1 / b, 0]];
      break;
    case 'side_hipped':
      local = [[1, 0, -1 / b], [1, 0, 1 / b], [a / b, 1 / b, 0]];
      break;
    case 'mansard':
      local = sides(L.mansard.inset, L.mansard.lower, true);
      break;
    case 'gambrel':
      local = sides(L.gambrel.inset, L.gambrel.lower, false);
      break;
    case 'round': {
      const n = L.barrelSegments;
      const w = (k: number) => -b * Math.cos((Math.PI * k) / n);
      const h = (k: number) => Math.sin((Math.PI * k) / n);
      local = Array.from({ length: n }, (_, k): Plane => {
        const m = (h(k + 1) - h(k)) / (w(k + 1) - w(k));
        return [h(k) - m * w(k), 0, m];
      });
      break;
    }
    default:
      return undefined;
  }
  return local.map((q) => world(f, q));
}

const evalPlane = ([c, gx, gz]: Plane, x: number, z: number) => c + gx * x + gz * z;
const roofAt = (planes: Plane[], x: number, z: number) => Math.min(1, Math.max(0, Math.min(...planes.map((q) => evalPlane(q, x, z)))));

/** Sutherland–Hodgman: the part of ring r where c + gx·x + gz·z ≤ 0. */
function clipHalf(r: XZ, [c, gx, gz]: Plane): XZ {
  const out: XZ = [];
  for (let i = 0, n = r.length; i < n; i += 2) {
    const j = (i + 2) % n;
    const fa = c + gx * r[i]! + gz * r[i + 1]!;
    const fb = c + gx * r[j]! + gz * r[j + 1]!;
    if (fa <= 0) out.push(r[i]!, r[i + 1]!);
    if (fa <= 0 !== fb <= 0) {
      const t = fa / (fa - fb);
      out.push(r[i]! + (r[j]! - r[i]!) * t, r[i + 1]! + (r[j + 1]! - r[i + 1]!) * t);
    }
  }
  return out;
}

/** Surface of revolution over the frame ellipse: profile (r, y) in units of (a|b, H), bottom → top, smooth normals. */
function lathe(buf: MeshBuffer, f: Frame, y0: number, H: number, profile: [number, number][], segs: number, uvScale = 1) {
  const n = profile.length;
  const base = buf.vertexCount;
  for (let k = 0; k < n; k++) {
    const [tr, ty] = [profile[Math.min(k + 1, n - 1)]![0] - profile[Math.max(k - 1, 0)]![0], profile[Math.min(k + 1, n - 1)]![1] - profile[Math.max(k - 1, 0)]![1]];
    const [nr, ny] = [ty, -tr]; // unit-profile normal; the u / y / w scale is applied inverse-transposed below
    for (let s = 0; s <= segs; s++) {
      const phi = (2 * Math.PI * s) / segs;
      const [cu, sw] = [Math.cos(phi), Math.sin(phi)];
      const [U, W] = [f.a * profile[k]![0] * cu, f.b * profile[k]![0] * sw];
      let [nu, nw, nyy] = [(nr * cu) / (f.a || 1), (nr * sw) / (f.b || 1), ny / (H || 1)];
      const l = Math.hypot(nu, nw, nyy) || 1;
      [nu, nw, nyy] = [nu / l, nw / l, nyy / l];
      buf.vertex(f.cx + U * f.ux - W * f.uz, y0 + H * profile[k]![1], f.cz + U * f.uz + W * f.ux,
        nu * f.ux - nw * f.uz, nyy, nu * f.uz + nw * f.ux, (s / segs) * 2 * Math.PI * Math.max(f.a, f.b) * uvScale, profile[k]![1] * H * uvScale);
    }
  }
  // (φ, k) order winds inward for every profile going up (proper rotation of the frame): emit it reversed.
  const row = segs + 1;
  for (let k = 0; k + 1 < n; k++) {
    for (let s = 0; s < segs; s++) {
      const [a, b, c, d] = [base + k * row + s, base + k * row + s + 1, base + (k + 1) * row + s + 1, base + (k + 1) * row + s];
      buf.face(a, c, b);
      buf.face(a, d, c);
    }
  }
}

/** Flat polygon (rings, with holes) at height y facing up (dir 1) or down (−1). */
function cap(buf: MeshBuffer, rings: XZ[], y: number | ((x: number, z: number) => number), dir: 1 | -1, tile = 1) {
  const idx = triangulate(rings[0]!, rings.slice(1));
  const pts = rings.flat();
  const Y = typeof y === 'number' ? () => y : y;
  const at = (i: number): V3 => [pts[2 * i]!, Y(pts[2 * i]!, pts[2 * i + 1]!), pts[2 * i + 1]!];
  for (let k = 0; k < idx.length; k += 3) {
    const [a, b, c] = [at(idx[k]!), at(idx[k + 1]!), at(idx[k + 2]!)];
    triOut(buf, a, b, c, [0, dir, 0], [a[0] / tile, a[2] / tile, b[0] / tile, b[2] / tile, c[0] / tile, c[2] / tile]);
  }
}

const UNIT_DOME = (n: number) => Array.from({ length: n + 1 }, (_, k): [number, number] => [Math.cos((k / n) * Math.PI / 2), Math.sin((k / n) * Math.PI / 2)]);
const ONION: [number, number][] = [[1, 0], [1.12, 0.12], [1.18, 0.28], [1.08, 0.45], [0.8, 0.62], [0.45, 0.78], [0.18, 0.9], [0, 1]];

export interface PartOpts {
  ground: number; // y the heights count from
  height: (x: number, z: number) => number; // terrain (wall bottoms of parts standing on the ground)
  fallbackTop: number; // m above ground when the part has neither height nor levels (the outline's)
  lod?: 'near';
}

export interface Heights {
  base: number; // m above ground: wall bottom
  wallTop: number;
  top: number;
}

/** S3DB heights of a part (m above ground). height → (levels + roof:levels) × levelHeight → fallbackTop. */
export function partHeights(p: PartLike, shape: Shape, f: Frame, fallbackTop: number): Heights | undefined {
  const top = p.height ?? (p.levels !== undefined ? (p.levels + (p.roofLevels ?? 0)) * LH : fallbackTop);
  const tagBase = p.minHeight ?? (p.minLevel !== undefined ? p.minLevel * LH : undefined);
  let base = tagBase ?? 0;
  if (!(top > base + 0.05)) return undefined;
  let roofH = 0;
  if (shape !== 'flat') {
    const tagged = p.roofHeight ?? (p.roofLevels ? p.roofLevels * LH : undefined);
    const round = shape === 'dome' || shape === 'onion';
    roofH = tagged ?? Math.min(round ? f.b : f.b * Math.tan((L.roofPitch * Math.PI) / 180), L.maxRoofShare * (top - base));
    roofH = Math.min(Math.max(roofH, 0), top - base);
  }
  const wallTop = top - roofH;
  if (p.kind === 'roof' && tagBase === undefined) base = Math.max(0, wallTop - B.canopyThickness); // canopy: roof + slab only
  return { base, wallTop, top };
}

/** Renders one part (or an outline treated as one) into the sink. Returns false when it is degenerate. */
export function renderPart(p: PartLike, o: PartOpts, sink: Sink): boolean {
  const rings = partRings(p);
  if (!rings) return false;
  const outer = rings[0]!;
  const f = footprintFrame(outer);
  let shape = roofShape(p.roofShape);
  if (rings.length > 1 && ['pyramidal', 'cone', 'dome', 'onion'].includes(shape)) shape = 'flat'; // ponytail: courtyards get flat roofs
  const h = partHeights(p, shape, f, o.fallbackTop);
  if (!h) return false;
  if (h.top - h.wallTop < 0.01) shape = 'flat';
  const column = p.kind === 'column';
  const g = o.ground;
  let gMin = Infinity;
  for (let i = 0; i < outer.length; i += 2) gMin = Math.min(gMin, o.height(outer[i]!, outer[i + 1]!));
  const yb = h.base > 0 || !Number.isFinite(gMin) ? g + h.base : Math.min(g, gMin) - B.baseSink;
  const [wt, top] = [g + h.wallTop, g + h.top];

  const wallPick = pickMaterial(p.material, p.colour, 'stone');
  const roofPick = p.roofMaterial || p.roofColour
    ? pickMaterial(p.roofMaterial, p.roofColour, shape === 'flat' ? 'stone' : 'zinc')
    : shape === 'flat' ? wallPick : pickMaterial(undefined, undefined, 'zinc'); // flat: terrace in the wall stone
  const bufOf = (pk: Pick) => {
    const b = sink.buf(pk.id, o.lod);
    b.color = pk.tint;
    return b;
  };
  const tile = (pk: Pick) => (pk.id === 'glass' ? L.glassTile : 1);

  if (column) {
    const wall = bufOf(wallPick);
    const segs = L.columnSegments;
    lathe(wall, f, yb, top - yb, [[1, 0], [1, 1]], segs);
    const ring = Array.from({ length: segs }, (_, s): V3 => {
      const phi = (2 * Math.PI * s) / segs;
      const [U, W] = [f.a * Math.cos(phi), f.b * Math.sin(phi)];
      return [f.cx + U * f.ux - W * f.uz, 0, f.cz + U * f.uz + W * f.ux];
    });
    for (const [y, dir] of [[top, 1], [yb, -1]] as const) {
      for (let s = 1; s + 1 < segs; s++) {
        const [a, b, c] = [ring[0]!, ring[s]!, ring[s + 1]!].map((q): V3 => [q[0], y, q[2]]) as [V3, V3, V3];
        triOut(wall, a, b, c, [0, dir, 0]);
      }
    }
    sink.prism([ring.flatMap((q) => [q[0], q[2]])], yb, top);
    return true;
  }

  const planes = roofPlanes(shape, f, p, outer);
  const R = top - wt;
  const yTop = planes ? (x: number, z: number) => wt + R * roofAt(planes, x, z) : () => (shape === 'flat' ? top : wt);

  // walls (edges split where the active roof plane may change, so the wall top follows the roof line)
  const wall = bufOf(wallPick);
  const wt1 = tile(wallPick);
  for (const r of rings) {
    let u = 0;
    for (let i = 0, n = r.length; i < n; i += 2) {
      const [ax, az, bx, bz] = [r[i]!, r[i + 1]!, r[(i + 2) % n]!, r[(i + 3) % n]!];
      const ts = [0, 1];
      if (planes) {
        for (let q = 0; q < planes.length; q++) {
          for (let s = q + 1; s < planes.length; s++) {
            const da = evalPlane(planes[q]!, ax, az) - evalPlane(planes[s]!, ax, az);
            const db = evalPlane(planes[q]!, bx, bz) - evalPlane(planes[s]!, bx, bz);
            if (da * db < 0) ts.push(da / (da - db));
          }
        }
        ts.sort((m, k) => m - k);
      }
      const len = Math.hypot(bx - ax, bz - az);
      const out: V3 = [-(bz - az), 0, bx - ax];
      for (let k = 0; k + 1 < ts.length; k++) {
        const [t0, t1] = [ts[k]!, ts[k + 1]!];
        if (t1 - t0 < 1e-6) continue;
        const [x0, z0, x1, z1] = [ax + (bx - ax) * t0, az + (bz - az) * t0, ax + (bx - ax) * t1, az + (bz - az) * t1];
        const [y0, y1] = [yTop(x0, z0), yTop(x1, z1)];
        quadOut(wall, [x0, yb, z0], [x1, yb, z1], [x1, y1, z1], [x0, y0, z0], out, (u + t0 * len) / wt1, yb / wt1, (u + t1 * len) / wt1, (y0 + y1) / 2 / wt1);
      }
      u += len;
    }
  }
  cap(wall, rings, yb, -1); // floor

  // roof
  const roofBuf = bufOf(roofPick);
  const rt = tile(roofPick);
  if (planes) {
    // each plane's region, clipped per footprint triangle (convex: exact). Clipping a concave footprint as one ring bridged
    // its separate pieces along the clip line, across the gap (leg 2 audit: the Penha residence's hipped roof over the courtyard)
    const idx = triangulate(outer, rings.slice(1));
    const pts = rings.flat();
    for (let t = 0; t < idx.length; t += 3) {
      const tri = [idx[t]!, idx[t + 1]!, idx[t + 2]!].flatMap((k) => [pts[2 * k]!, pts[2 * k + 1]!]);
      planes.forEach((pl, i) => {
        let region = tri;
        for (let j = 0; j < planes.length && region.length >= 6; j++) if (j !== i) region = clipHalf(region, [pl[0] - planes[j]![0], pl[1] - planes[j]![1], pl[2] - planes[j]![2]]);
        if (region.length >= 6 && Math.abs(ringArea(region)) > 1e-4) cap(roofBuf, [region], (x, z) => wt + R * Math.min(1, Math.max(0, evalPlane(pl, x, z))), 1, rt);
      });
    }
  } else if (shape === 'pyramidal' || shape === 'cone') {
    const [cx, cz] = ringCentroid(outer);
    const apex: V3 = [cx, top, cz];
    for (let i = 0, n = outer.length; i < n; i += 2) {
      const a: V3 = [outer[i]!, wt, outer[i + 1]!];
      const b: V3 = [outer[(i + 2) % n]!, wt, outer[(i + 3) % n]!];
      const l = Math.hypot(b[0] - a[0], b[2] - a[2]);
      triOut(roofBuf, a, b, apex, [-(b[2] - a[2]), R * 0.01 + 1e-6, b[0] - a[0]], [0, 0, l / rt, 0, l / (2 * rt), R / rt]);
    }
  } else if (shape === 'dome' || shape === 'onion') {
    cap(roofBuf, rings, wt, 1, rt);
    lathe(roofBuf, f, wt, R, shape === 'dome' ? UNIT_DOME(L.domeRings) : ONION, L.domeSegments, 1 / rt);
    // base disc facing down closes the shell (hidden inside)
    const segs = L.domeSegments;
    const pt = (s: number): V3 => {
      const phi = (2 * Math.PI * s) / segs;
      const [U, W] = [f.a * Math.cos(phi), f.b * Math.sin(phi)];
      return [f.cx + U * f.ux - W * f.uz, wt, f.cz + U * f.uz + W * f.ux];
    };
    for (let s = 1; s + 1 < segs; s++) triOut(roofBuf, pt(0), pt(s), pt(s + 1), [0, -1, 0]);
  } else cap(roofBuf, rings, top, 1, rt); // flat

  sink.prism(rings, yb, shape === 'flat' ? top : wt);
  return true;
}

/** Ground y a landmark's heights count from: lowest terrain under the outline, at most groundSpan below the highest. */
export function recordGround(outer: XZ, height: (x: number, z: number) => number) {
  let [lo, hi] = [Infinity, -Infinity];
  for (let i = 0; i < outer.length; i += 2) {
    const y = height(outer[i]!, outer[i + 1]!);
    [lo, hi] = [Math.min(lo, y), Math.max(hi, y)];
  }
  return { ground: Math.max(lo, hi - B.groundSpan), minGround: lo };
}
