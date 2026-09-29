// Group g5 (docs/plans/phase2b-assets.md §1 #11, #20–24, #30–32, S1–S3; SPEC §17.6): Notre-Dame, Sainte-Chapelle,
// Conciergerie, Hôtel de Ville, Centre Pompidou, Tour Saint-Jacques, Saint-Sulpice, Panthéon, Palais du Luxembourg.
// Each = its OSM building:part through the generic S3DB renderer (some parts dropped or patched, see each builder) +
// procedural details in a local frame (x along the building axis, y up from the ground, z across). Decals (portals,
// roses, windows, clocks) are flat polygons a few cm in front of a wall; small details are lod 'near'. Colliders: the
// renderer's part prisms, or one prism per procedural volume. Heights from OSM unless a comment cites a figure.
// Skyline outside the map (Sacré-Cœur, Montparnasse, La Défense): buildSkyline() (pure) + createSkyline() (main thread,
// not chunk-based) — the integrator adds createSkyline(...) to the scene. DOM-free except createSkyline's material.
import { latLonToWorld } from '@race/shared';
import * as THREE from 'three';
import { buildings as B, landmarks as LM, render as R } from '../../config.ts';
import { type LandmarkId, ringArea, type SkylineData, type XZ } from '../../geo/chunkData.ts';
import { ringCentroid } from '../../geo/clip.ts';
import { LANDMARK_BY_ID } from '../../geo/landmarks.ts';
import type { BuildOut, MaterialId, MeshBucket } from '../buildTypes.ts';
import { hash01, MeshBuffer, mergeBuckets, triangulate, type V3 } from '../geom.ts';
import type { DetailFn, Helpers, LandmarkCtx } from './index.ts';
import { box, cross, extrude, footprintFrame, type Frame, loft, place, quadOut, sub, triOut } from './kit.ts';
import { parseColour, type PartLike, partRings, type Sink } from './parts.ts';

const G = LM.g5;
const K = G.colours;
type P2 = readonly [number, number];
type Lod = 'near' | undefined;
const NEAR = 'near' as const;

// ── geometry helpers ──

const rgb = (hex: string): V3 => parseColour(hex) ?? [1, 1, 1];
const frameAt = (cx: number, cz: number, ux: number, uz: number): Frame => ({ area: 0, cx, cz, ux, uz, a: 0, b: 0 });
const ID = frameAt(0, 0, 1, 0);
/** World (x, z) → frame-local (x along u, z along w). */
const toLocal = (f: Frame, x: number, z: number): [number, number] => [
  (x - f.cx) * f.ux + (z - f.cz) * f.uz, -(x - f.cx) * f.uz + (z - f.cz) * f.ux,
];
const centre = (p: { outer: XZ }) => ringCentroid(p.outer);
const top = (p: PartLike) => p.height ?? 0;

/** Buffers of one local frame (x along f.u, z along f.w, y up from y0), placed in the world by buckets(). */
class Local {
  private readonly bufs = new Map<string, { buf: MeshBuffer; lod?: 'near' }>();
  constructor(readonly f: Frame, readonly y0: number) {}
  /** The buffer of material m (+ lod), its vertex colour set to `colour` for what is added next. */
  b(m: MaterialId, colour?: string, lod?: Lod): MeshBuffer {
    const k = `${m}|${lod ?? ''}`;
    let e = this.bufs.get(k);
    if (!e) this.bufs.set(k, (e = { buf: new MeshBuffer(m), ...(lod && { lod }) }));
    if (colour) e.buf.color = rgb(colour);
    return e.buf;
  }
  buckets(): MeshBucket[] {
    return [...this.bufs.values()].filter((e) => e.buf.vertexCount).map((e) => place(e.buf.bucket(e.lod), this.f, this.y0));
  }
}

/** Surface of revolution about the vertical axis through (cx, cz): profile (r, y) bottom → top, smooth normals
 *  (repeat a point for a crease; end at r = 0 to close the top). */
function revolve(buf: MeshBuffer, cx: number, cz: number, prof: readonly P2[], segs = 16) {
  const base = buf.vertexCount;
  const n = prof.length;
  const same = (i: number, j: number) => j >= 0 && j < n && prof[i]![0] === prof[j]![0] && prof[i]![1] === prof[j]![1];
  for (let k = 0; k < n; k++) {
    const [r, y] = prof[k]!;
    // tangent: the incoming segment at a crease's first copy, the outgoing one at its second, else central
    const [i0, i1] = same(k, k + 1) ? [Math.max(k - 1, 0), k] : same(k, k - 1) ? [k, Math.min(k + 1, n - 1)] : [Math.max(k - 1, 0), Math.min(k + 1, n - 1)];
    const [q0, q1] = [prof[i0]!, prof[i1]!];
    let [nr, ny] = [q1[1] - q0[1], -(q1[0] - q0[0])];
    const l = Math.hypot(nr, ny) || 1;
    [nr, ny] = [nr / l, ny / l];
    for (let s = 0; s <= segs; s++) {
      const t = (2 * Math.PI * s) / segs;
      buf.vertex(cx + r * Math.cos(t), y, cz + r * Math.sin(t), nr * Math.cos(t), ny, nr * Math.sin(t), (s / segs) * 2 * Math.PI * Math.max(r, 1), y);
    }
  }
  const row = segs + 1;
  for (let k = 0; k + 1 < n; k++) {
    for (let s = 0; s < segs; s++) {
      const a = base + k * row + s;
      buf.face(a, a + row + 1, a + 1);
      buf.face(a, a + row, a + row + 1);
    }
  }
}

/** n-sided tube of radius r from p to q, both ends capped. */
function tube(buf: MeshBuffer, p: V3, q: V3, r: number, n = 6) {
  const d = sub(q, p);
  const L = Math.hypot(d[0], d[1], d[2]);
  if (L < 1e-6) return;
  const ax: V3 = [d[0] / L, d[1] / L, d[2] / L];
  const c1 = cross(ax, Math.abs(ax[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]);
  const l1 = Math.hypot(c1[0], c1[1], c1[2]);
  const e1: V3 = [c1[0] / l1, c1[1] / l1, c1[2] / l1];
  const e2 = cross(ax, e1);
  const dir = (t: number): V3 => [Math.cos(t) * e1[0] + Math.sin(t) * e2[0], Math.cos(t) * e1[1] + Math.sin(t) * e2[1], Math.cos(t) * e1[2] + Math.sin(t) * e2[2]];
  const at = (c: V3, k: number): V3 => {
    const v = dir((2 * Math.PI * k) / n + Math.PI / n);
    return [c[0] + r * v[0], c[1] + r * v[1], c[2] + r * v[2]];
  };
  for (let k = 0; k < n; k++) quadOut(buf, at(p, k), at(p, k + 1), at(q, k + 1), at(q, k), dir((2 * Math.PI * (k + 1)) / n));
  for (let k = 1; k + 1 < n; k++) {
    triOut(buf, at(q, 0), at(q, k), at(q, k + 1), ax);
    triOut(buf, at(p, 0), at(p, k), at(p, k + 1), [-ax[0], -ax[1], -ax[2]]);
  }
}

/** Regular n-gon ring at height y around (cx, cz); rot = angle of the first corner (default: faces on the axes). */
const ngon = (cx: number, cz: number, r: number, y: number, n: number, rot = Math.PI / n): V3[] =>
  Array.from({ length: n }, (_, k) => [cx + r * Math.cos(rot + (2 * Math.PI * k) / n), y, cz + r * Math.sin(rot + (2 * Math.PI * k) / n)] as V3);

/** Faceted n-sided stack (prisms, pyramids, spires): loft between n-gon rings (r = corner radius, y); capped on top. */
function facets(buf: MeshBuffer, cx: number, cz: number, prof: readonly P2[], n = 8, rot?: number) {
  const rings = prof.map(([r, y]) => ngon(cx, cz, Math.max(r, 1e-3), y, n, rot));
  loft(buf, rings);
  const last = rings.at(-1)!;
  if (prof.at(-1)![0] > 0.01) for (let k = 1; k + 1 < n; k++) triOut(buf, last[0]!, last[k]!, last[k + 1]!, [0, 1, 0]);
}

/** Vertical wall plane: origin o (x, z), unit direction d of the s axis, outward unit normal n. */
interface Plane {
  o: P2;
  d: P2;
  n: P2;
  len: number;
}
/** Plane of ring edge a → b; outward = (−dz, dx) for partRings orientation (outer area > 0, holes < 0). */
function edgePlane(ax: number, az: number, bx: number, bz: number): Plane {
  const len = Math.hypot(bx - ax, bz - az) || 1e-9;
  const d: P2 = [(bx - ax) / len, (bz - az) / len];
  return { o: [ax, az], d, n: [-d[1], d[0]], len };
}
const plane = (o: P2, d: P2, n: P2, len = 0): Plane => ({ o, d, n, len });

/** Flat polygon (s, y pairs; holes allowed) on plane pl, `off` m in front of it, facing out. */
function decal(buf: MeshBuffer, pl: Plane, outer: readonly number[], off = G.decalOffset, holes: number[][] = []) {
  const idx = triangulate(outer as number[], holes);
  const pts = [...outer, ...holes.flat()];
  const P = (i: number): V3 => [pl.o[0] + pl.d[0] * pts[2 * i]! + pl.n[0] * off, pts[2 * i + 1]!, pl.o[1] + pl.d[1] * pts[2 * i]! + pl.n[1] * off];
  for (let k = 0; k < idx.length; k += 3) triOut(buf, P(idx[k]!), P(idx[k + 1]!), P(idx[k + 2]!), [pl.n[0], 0, pl.n[1]]);
}

const rectP = (s0: number, s1: number, y0: number, y1: number) => [s0, y0, s1, y0, s1, y1, s0, y1];
const circleP = (cs: number, cy: number, r: number, n = 24) =>
  Array.from({ length: n }, (_, k) => [cs + r * Math.cos((2 * Math.PI * k) / n), cy + r * Math.sin((2 * Math.PI * k) / n)]).flat();
/** Window / portal outline s0…s1 × y0…y1 with a pointed (equilateral) or round head; squashed when short. */
function archP(s0: number, s1: number, y0: number, y1: number, pointed = true, k = 5) {
  const w = s1 - s0;
  const rise = pointed ? w * 0.866 : w / 2;
  const ys = y1 - Math.min(rise, 0.8 * (y1 - y0));
  const sy = (y1 - ys) / rise;
  const pts = [s0, y0, s1, y0];
  if (pointed) {
    for (let i = 0; i <= k; i++) pts.push(s0 + w * Math.cos((i / k) * (Math.PI / 3)), ys + w * Math.sin((i / k) * (Math.PI / 3)) * sy);
    for (let i = 1; i <= k; i++) pts.push(s1 + w * Math.cos(((2 + i / k) * Math.PI) / 3), ys + w * Math.sin(((2 + i / k) * Math.PI) / 3) * sy);
  } else {
    for (let i = 0; i <= 2 * k; i++) pts.push((s0 + s1) / 2 + (w / 2) * Math.cos((i / (2 * k)) * Math.PI), ys + (w / 2) * Math.sin((i / (2 * k)) * Math.PI) * sy);
  }
  return pts;
}
/** Thin bar from polar (r0, t) to (r1, t) around (cs, cy) (rose tracery, clock hands). */
const spokeP = (cs: number, cy: number, r0: number, r1: number, t: number, w: number) => {
  const [c, s] = [Math.cos(t), Math.sin(t)];
  return [cs + c * r0 + s * w, cy + s * r0 - c * w, cs + c * r1 + s * w, cy + s * r1 - c * w, cs + c * r1 - s * w, cy + s * r1 + c * w, cs + c * r0 - s * w, cy + s * r0 + c * w];
};

/** Rose window: stained-glass disc (always) + stone frame, hub, ring and spokes (near). */
function rose(L: Local, pl: Plane, cs: number, cy: number, r: number, spokes = 12) {
  decal(L.b('masonry', K.stainedGlass), pl, circleP(cs, cy, r, 32));
  const t = L.b('masonry', K.tracery, NEAR);
  decal(t, pl, circleP(cs, cy, r + 0.45, 32), 0.1, [circleP(cs, cy, r, 32)]);
  decal(t, pl, circleP(cs, cy, r * 0.62 + 0.14, 32), 0.1, [circleP(cs, cy, r * 0.62, 32)]);
  decal(t, pl, circleP(cs, cy, r * 0.18, 12), 0.1);
  for (let k = 0; k < spokes; k++) decal(t, pl, spokeP(cs, cy, r * 0.18, r, (2 * Math.PI * k) / spokes, 0.06 * r), 0.1);
}

/** Windows on every ring edge ≥ minLen (optionally only those whose outward normal passes `facing`): one per
 *  `spacing` m, in each row [y0, y1]. */
function windowRows(
  buf: MeshBuffer, rings: XZ[], rows: readonly (readonly [number, number])[],
  o: { spacing: number; width: number; shape: 'rect' | 'round' | 'pointed'; minLen?: number; facing?: (n: P2) => boolean },
) {
  for (const r of rings) {
    for (let i = 0; i < r.length; i += 2) {
      const j = (i + 2) % r.length;
      const pl = edgePlane(r[i]!, r[i + 1]!, r[j]!, r[j + 1]!);
      if (pl.len < (o.minLen ?? o.width + 1.2) || (o.facing && !o.facing(pl.n))) continue;
      const n = Math.max(1, Math.floor(pl.len / o.spacing));
      for (let k = 0; k < n; k++) {
        const s = ((k + 0.5) * pl.len) / n;
        const [s0, s1] = [s - o.width / 2, s + o.width / 2];
        for (const [y0, y1] of rows) decal(buf, pl, o.shape === 'rect' ? rectP(s0, s1, y0, y1) : archP(s0, s1, y0, y1, o.shape === 'pointed'));
      }
    }
  }
}

/** Wall edge (≥ minLen) of the parts nearest to (x, z) whose outward normal is within ~50° of `facing` (if given). */
function nearestWall(parts: PartLike[], x: number, z: number, minLen: number, facing?: P2) {
  let best: { pl: Plane; s: number; d: number } | undefined;
  for (const p of parts) {
    for (const r of partRings(p) ?? []) {
      for (let i = 0; i < r.length; i += 2) {
        const j = (i + 2) % r.length;
        const pl = edgePlane(r[i]!, r[i + 1]!, r[j]!, r[j + 1]!);
        if (pl.len < minLen || (facing && pl.n[0] * facing[0] + pl.n[1] * facing[1] < 0.65)) continue;
        const s = Math.min(pl.len, Math.max(0, (x - pl.o[0]) * pl.d[0] + (z - pl.o[1]) * pl.d[1]));
        const d = Math.hypot(x - pl.o[0] - pl.d[0] * s, z - pl.o[1] - pl.d[1] * s);
        if (!best || d < best.d) best = { pl, s, d };
      }
    }
  }
  return best;
}

function inRing(x: number, z: number, r: XZ) {
  let inside = false;
  for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
    const [xi, zi, xj, zj] = [r[i]!, r[i + 1]!, r[j]!, r[j + 1]!];
    if (zi > z !== zj > z && x < xi + ((z - zi) / (zj - zi)) * (xj - xi)) inside = !inside;
  }
  return inside;
}

/** Local bounding box of a ring in frame f. */
function localBox(f: Frame, r: XZ) {
  let [x0, x1, z0, z1] = [Infinity, -Infinity, Infinity, -Infinity];
  for (let i = 0; i < r.length; i += 2) {
    const [x, z] = toLocal(f, r[i]!, r[i + 1]!);
    [x0, x1, z0, z1] = [Math.min(x0, x), Math.max(x1, x), Math.min(z0, z), Math.max(z1, z)];
  }
  return { x0, x1, z0, z1 };
}

/** Parts through the generic S3DB renderer. */
function render(parts: PartLike[], ctx: LandmarkCtx, h: Helpers, fallbackTop: number, sink: Sink = new h.Sink()) {
  for (const p of parts) h.renderPart(p, { ground: ctx.ground, height: ctx.height, fallbackTop }, sink);
  return sink;
}
function finish(base: BuildOut | Sink, ...locals: Local[]): BuildOut {
  const o = 'out' in base ? base.out() : base;
  return { meshes: [...o.meshes, ...locals.flatMap((l) => l.buckets())], instances: o.instances, colliders: o.colliders };
}

/** Gold cross (vertical p.y → y1, arm at 70 %) on top of a spire / lantern. */
function cross3(buf: MeshBuffer, x: number, z: number, y0: number, y1: number, arm: number, r = 0.1) {
  tube(buf, [x, y0, z], [x, y1, z], r, 4);
  const ya = y0 + 0.7 * (y1 - y0);
  tube(buf, [x - arm, ya, z], [x + arm, ya, z], r, 4);
}

// ── Notre-Dame (2024 restoration: towers 69 m, spire 96 m, notredamedeparis.fr; lead roof, OSM roof:colour) ──

const notreDame: DetailFn = (rec, parts, ctx, h) => {
  const towers = parts.filter((p) => p.height === 69 && !p.minHeight);
  const spire = parts.find((p) => p.height === 96);
  if (towers.length !== 2 || !spire) return h.generic(rec, parts, ctx);
  // Skillion wedges = flying-buttress bays (drawn as arched flyers below); parts above 69 m = tower-top needles.
  const flyers = parts.filter((p) => p.roofShape === 'skillion' && (p.roofHeight ?? 0) >= 10);
  const drop = new Set<PartLike>([spire, ...flyers, ...parts.filter((p) => (p.minHeight ?? 0) >= 69)]);
  // One lead colour for the whole new roof (OSM tags the transept 'metal' without colour → dark).
  const kept = parts.filter((p) => !drop.has(p)).map((p) => (p.roofMaterial === 'metal' || p.roofColour?.toUpperCase() === '#D0D0D0' ? { ...p, roofMaterial: 'lead', roofColour: K.ndRoof } : p));
  const sink = render(kept, ctx, h, h.outlineTop(rec, ctx.def));

  const [c0, c1] = towers.map(centre) as [[number, number], [number, number]];
  const m: P2 = [(c0[0] + c1[0]) / 2, (c0[1] + c1[1]) / 2];
  const sc = centre(spire);
  const L0 = Math.hypot(sc[0] - m[0], sc[1] - m[1]);
  const F = frameAt(m[0], m[1], (sc[0] - m[0]) / L0, (sc[1] - m[1]) / L0); // x: west front → apse
  const L = new Local(F, ctx.ground);
  /** Longest outer-ring edge of p facing local direction dl: plane in the local frame (s = 0 at the edge middle). */
  const face = (p: PartLike, dl: P2) => {
    const dw: P2 = [dl[0] * F.ux - dl[1] * F.uz, dl[0] * F.uz + dl[1] * F.ux];
    const r = partRings(p)?.[0] ?? [];
    let best: Plane | undefined;
    for (let i = 0; i < r.length; i += 2) {
      const j = (i + 2) % r.length;
      const e = edgePlane(r[i]!, r[i + 1]!, r[j]!, r[j + 1]!);
      if (e.n[0] * dw[0] + e.n[1] * dw[1] < 0.9 || (best && e.len <= best.len)) continue;
      best = plane(toLocal(F, (r[i]! + r[j]!) / 2, (r[i + 1]! + r[j + 1]!) / 2), [-dl[1], dl[0]], dl, e.len);
    }
    return best;
  };
  const tb = towers.map((t) => ({ t, box: localBox(F, t.outer) })).sort((p, q) => p.box.z0 - q.box.z0);
  const [zi0, zi1] = [tb[0]!.box.z1, tb[1]!.box.z0]; // central section between the towers
  const [zL, zR] = [tb[0]!.box.z0, tb[1]!.box.z1];
  // West-front decals go on the frontmost wall at their local z: OSM puts a 25 m slab (portals, Gallery of Kings,
  // Galerie de la Vierge) in front of part of the towers and of the 45 m centre.
  /** West-facing plane (s = local z) of the frontmost wall of a part ≥ yMin high crossing local z, + that part's top. */
  const hit = (z: number, yMin: number) => {
    let [x, y] = [Infinity, 0];
    for (const p of kept) {
      if (top(p) < yMin || (p.minHeight ?? 0) > 1) continue;
      for (let i = 0; i < p.outer.length; i += 2) {
        const j = (i + 2) % p.outer.length;
        const [x0, z0] = toLocal(F, p.outer[i]!, p.outer[i + 1]!);
        const [x1, z1] = toLocal(F, p.outer[j]!, p.outer[j + 1]!);
        const xe = x0 + ((z - z0) / (z1 - z0)) * (x1 - x0);
        if (z0 !== z1 && (z0 - z) * (z1 - z) <= 0 && xe < x) [x, y] = [xe, top(p)];
      }
    }
    return { pl: plane([Number.isFinite(x) ? x : xT, 0], [0, 1], [-1, 0]), top: y };
  };
  const at = (z: number, yMin: number) => hit(z, yMin).pl;
  const xT = Math.min(tb[0]!.box.x0, tb[1]!.box.x0);
  const slab = Math.max(22, hit((zi0 + zi1) / 2, 0).top); // top of the front slab = Galerie de la Vierge terrace

  // West front (41 m wide, fr.wikipedia): 3 portals, Gallery of Kings (28), rose (Ø 9.6 m), Grande Galerie, belfries.
  /** Row of `n` pointed openings across [s0, s1] of plane pl at y0…y1. */
  const row = (pl: Plane, s0: number, s1: number, n: number, y0: number, y1: number, lod?: Lod) => {
    for (let k = 0; k < n; k++) {
      const s = s0 + ((k + 0.5) * (s1 - s0)) / n;
      decal(L.b('masonry', K.recess, lod), pl, archP(s - (0.33 * (s1 - s0)) / n, s + (0.33 * (s1 - s0)) / n, y0, y1));
    }
  };
  // Sections: centre (Last Judgement portal) and the two towers (Virgin, Saint Anne portals).
  const sections = [[zi0, zi1, 4.5, 13.5], ...tb.map(({ box: bb }) => [bb.z0, bb.z1, 3.3, 11.2])] as [number, number, number, number][];
  for (const [z0, z1, hw, y1] of sections) {
    const zc = (z0 + z1) / 2;
    const low = at(zc, 12);
    decal(L.b('masonry', K.stoneDark, NEAR), low, archP(zc - hw - 1.2, zc + hw + 1.2, 0.1, y1 + 1.5), 0.04);
    decal(L.b('masonry', K.recess), low, archP(zc - hw, zc + hw, 0.1, y1));
    row(low, z0 + 0.4, z1 - 0.4, Math.max(2, Math.round((28 * (z1 - z0)) / (zR - zL))), 16.4, 20.2, NEAR); // Gallery of Kings
    decal(L.b('masonry', K.stoneDark, NEAR), low, rectP(z0, z1, slab - 1.6, slab - 0.9), 0.04); // Galerie de la Vierge
    const up = at(zc, 30);
    const n = Math.max(2, Math.round((z1 - z0) / 1.45));
    row(up, z0 + 0.3, z1 - 0.3, n, slab + 10.6, 42.6); // Grande Galerie
    if (hw > 4) rose(L, up, zc, slab + 5.2, 4.8, 16);
    else row(up, z0 + 0.8, z1 - 0.8, 2, slab + 1, slab + 9);
  }
  for (const { t, box: bb } of tb) {
    for (const dl of [[-1, 0], [1, 0], [0, -1], [0, 1]] as P2[]) {
      const pl = face(t, dl);
      if (pl) row(pl, -pl.len / 2 + 0.3, pl.len / 2 - 0.3, 2, 45.5, 63.5); // belfry lancets
    }
    // parapet on the tower terrace
    const st = L.b('masonry', K.stone, NEAR);
    box(st, bb.x0 + 0.2, bb.x1 - 0.2, 69, 70.1, bb.z0 + 0.2, bb.z0 + 0.6);
    box(st, bb.x0 + 0.2, bb.x1 - 0.2, 69, 70.1, bb.z1 - 0.6, bb.z1 - 0.2);
    box(st, bb.x0 + 0.2, bb.x0 + 0.6, 69, 70.1, bb.z0 + 0.6, bb.z1 - 0.6);
    box(st, bb.x1 - 0.6, bb.x1 - 0.2, 69, 70.1, bb.z0 + 0.6, bb.z1 - 0.6);
  }

  // Flying buttresses: one arched flyer per skillion bay, low end at the outer pier, high end at the clerestory.
  const locals = [L];
  for (const p of flyers) {
    const th = ((p.roofDirection ?? 0) * Math.PI) / 180;
    const dn: P2 = [Math.sin(th), -Math.cos(th)]; // downhill
    const [cx, cz] = centre(p);
    let [lo, hi] = [Infinity, -Infinity];
    for (let i = 0; i < p.outer.length; i += 2) {
      const t = (p.outer[i]! - cx) * dn[0] + (p.outer[i + 1]! - cz) * dn[1];
      [lo, hi] = [Math.min(lo, t), Math.max(hi, t)];
    }
    const a = (hi - lo) / 2;
    const mid = (hi + lo) / 2;
    if (!(a > 1)) continue;
    const fl = new Local(frameAt(cx + dn[0] * mid, cz + dn[1] * mid, -dn[0], -dn[1]), ctx.ground); // x uphill
    const yHi = top(p);
    const yLo = yHi - (p.roofHeight ?? 0);
    const topAt = (t: number) => yLo + 1.5 + (yHi - 1.8 - yLo) * t;
    const poly: number[] = [];
    const N = 8;
    for (let k = 0; k <= N; k++) poly.push(-a + (2 * a * k) / N, topAt(k / N));
    for (let k = N; k >= 0; k--) {
      const t = k / N;
      poly.push(-a + 2 * a * t, Math.min(topAt(t) - 0.7, yLo - 1.5 + (yHi - 2 - yLo) * t + 2.2 * Math.sin(Math.PI * t)));
    }
    extrude(fl.b('masonry', K.stone), poly, 'z', -G.flyerWidth / 2, G.flyerWidth / 2);
    locals.push(fl);
  }

  // Transept roses (Ø 13 m, fr.wikipedia) at the OSM stained_glass nodes, a portal below each.
  const W = new Local(ID, ctx.ground);
  locals.push(W);
  const walls = kept.filter((p) => top(p) >= 25);
  for (const pt of rec.points ?? []) {
    if (pt.kind !== 'artwork' || pt.sub !== 'stained_glass') continue;
    const [lx, lz] = toLocal(F, pt.x, pt.z);
    if (lx < xT + 20) continue; // the west rose is part of the façade
    const sg = Math.sign(lz) || 1;
    const w = nearestWall(walls, pt.x, pt.z, 6, [-F.uz * sg, F.ux * sg]);
    if (!w || w.d > 12) continue;
    rose(W, w.pl, w.s, 21.5, Math.min(6.5, w.pl.len / 2 - 0.3), 16);
    decal(W.b('masonry', K.recess), w.pl, archP(w.s - 3, w.s + 3, 0.1, 11));
  }
  // Clerestory lancets above the aisle roofs (near).
  for (const p of kept.filter((q) => top(q) === 33 && !q.roofShape)) {
    windowRows(W.b('masonry', K.stainedGlass, NEAR), partRings(p) ?? [], [[25.8, 31.6]], { spacing: 6.2, width: 3, shape: 'pointed', minLen: 5 });
  }

  // Spire (Viollet-le-Duc's, rebuilt 2024): octagonal lower stage with lancets and gablets, lead spire, cross + rooster.
  const S = new Local(frameAt(sc[0], sc[1], F.ux, F.uz), ctx.ground);
  locals.push(S);
  facets(S.b('masonry', K.spire), 0, 0, [[3.8, 40.5], [3.8, 58], [3.1, 58], [0.22, 92.2]], 8);
  const ap = 3.8 * Math.cos(Math.PI / 8);
  for (let k = 0; k < 8; k++) {
    const t = (k * Math.PI) / 4;
    const pl = plane([ap * Math.cos(t), ap * Math.sin(t)], [-Math.sin(t), Math.cos(t)], [Math.cos(t), Math.sin(t)]);
    decal(S.b('masonry', K.recess), pl, archP(-0.8, 0.8, 47.5, 56.2));
    decal(S.b('masonry', K.spire), pl, [-1.45, 57.2, 1.45, 57.2, 0, 61.5], 0.02);
  }
  for (let k = 0; k < 4; k++) {
    const t = Math.PI / 8 + (k * Math.PI) / 2 + Math.PI / 4 - Math.PI / 8;
    facets(S.b('masonry', K.spire, NEAR), 4.1 * Math.cos(t), 4.1 * Math.sin(t), [[0.5, 50], [0.5, 57], [0.01, 64]], 4);
  }
  // lead bands (near) every 5 m up the spire: the openwork stages read as horizontal rings
  for (let y = 62; y < 90; y += 5) {
    const r = 3.1 + ((0.22 - 3.1) * (y - 58)) / (92.2 - 58);
    facets(S.b('masonry', K.spire, NEAR), 0, 0, [[r + 0.18, y], [r + 0.18, y + 0.6], [r - 0.05, y + 0.9]], 8);
  }
  const gold = S.b('gold', undefined, NEAR);
  cross3(gold, 0, 0, 92, 95.2, 0.6, 0.1);
  extrude(gold, [-0.5, 95.3, 0.4, 95.3, 0.55, 95.65, 0.3, 95.62, 0.22, 96, 0.02, 95.75, -0.55, 95.95], 'x', -0.05, 0.05);
  return finish(sink, ...locals);
};

// ── Sainte-Chapelle (fr.wikipedia: 36 × 17 m, 42.5 m to the ridge, spire 75 m; upper windows 15.5 m) ──

const sainteChapelle: DetailFn = (rec, parts, ctx, h) => {
  const spire = parts.find((p) => p.height === 75);
  const body = parts.filter((p) => p.height === 30 && !p.roofShape).sort((p, q) => Math.abs(ringArea(q.outer)) - Math.abs(ringArea(p.outer)))[0];
  const porch = parts.find((p) => p.height === 15);
  const ring = body && partRings(body)?.[0];
  if (!spire || !ring || !porch) return h.generic(rec, parts, ctx);
  const sc = centre(spire);
  const kept = parts.filter((p) => Math.hypot(centre(p)[0] - sc[0], centre(p)[1] - sc[1]) > 2.5); // spire + its base prisms
  const sink = render(kept, ctx, h, h.outlineTop(rec, ctx.def));

  const [bx, bz] = centre(body);
  const [px, pz] = centre(porch);
  const toPorch: P2 = [(px - bx) / Math.hypot(px - bx, pz - bz), (pz - bz) / Math.hypot(px - bx, pz - bz)];
  const W = new Local(ID, ctx.ground);
  for (let i = 0; i < ring.length; i += 2) {
    const j = (i + 2) % ring.length;
    const pl = edgePlane(ring[i]!, ring[i + 1]!, ring[j]!, ring[j + 1]!);
    if (pl.len < 2.5) continue;
    const mid = pl.len / 2;
    if (pl.n[0] * toPorch[0] + pl.n[1] * toPorch[1] > 0.8) {
      rose(W, pl, mid, 21.8, Math.min(4.4, mid - 0.6), 12); // west rose (flamboyant, Ø 9 m)
      continue;
    }
    const [s0, s1] = [0.65, pl.len - 0.65];
    decal(W.b('masonry', K.stainedGlass), pl, archP(s0, s1, 11, 26.5));
    decal(W.b('masonry', K.window), pl, archP(mid - 0.9, mid + 0.9, 2.4, 6.4));
    const t = W.b('masonry', K.tracery, NEAR);
    for (let k = 1; k < 4; k++) decal(t, pl, rectP(s0 + ((s1 - s0) * k) / 4 - 0.08, s0 + ((s1 - s0) * k) / 4 + 0.08, 11, 23.2), 0.1);
    decal(t, pl, circleP(mid, 24.2, (s1 - s0) * 0.2 + 0.1, 16), 0.1, [circleP(mid, 24.2, (s1 - s0) * 0.2, 16)]);
  }

  // Flèche (Lassus, 1853): octagonal openwork stage with lancets and gablets, lead spire, gilded crown and cross.
  const [ux, uz] = toPorch;
  const S = new Local(frameAt(sc[0], sc[1], -ux, -uz), ctx.ground);
  facets(S.b('masonry', K.spire), 0, 0, [[2.3, 38], [2.3, 49], [1.95, 49], [0.12, 73.4]], 8);
  const ap = 2.3 * Math.cos(Math.PI / 8);
  for (let k = 0; k < 8; k++) {
    const t = (k * Math.PI) / 4;
    const pl = plane([ap * Math.cos(t), ap * Math.sin(t)], [-Math.sin(t), Math.cos(t)], [Math.cos(t), Math.sin(t)]);
    decal(S.b('masonry', K.recess), pl, archP(-0.5, 0.5, 42.6, 48.2));
    decal(S.b('masonry', K.spire), pl, [-0.85, 48.4, 0.85, 48.4, 0, 51.3], 0.02);
  }
  revolve(S.b('gold', undefined, NEAR), 0, 0, [[1.66, 53.4], [1.66, 54.3]], 16);
  cross3(S.b('gold'), 0, 0, 73.2, 75, 0.35, 0.09);
  // Gilded roof crest along the ridge (42 m), west gable → apse.
  const bf = frameAt(bx, bz, -ux, -uz);
  const lb = localBox(bf, ring);
  const C = new Local(bf, ctx.ground);
  box(C.b('gold', undefined, NEAR), lb.x0 + 0.4, lb.x1 - 6, 41.8, 42.5, -0.12, 0.12);
  return finish(sink, W, S, C);
};

// ── Conciergerie / Palais de Justice: towers César, Argent, Bonbec (cones, OSM 30 m) and Tour de l'Horloge ──

const conciergerie: DetailFn = (rec, parts, ctx, h) => {
  const base = h.generic(rec, parts, ctx);
  const W = new Local(ID, ctx.ground);
  const cones = parts.filter((p) => p.roofShape === 'cone' && p.height === 30);
  const bonbec = cones.reduce<PartLike | undefined>((w, p) => (!w || centre(p)[0] < centre(w)[0] ? p : w), undefined);
  for (const t of cones) {
    const f = footprintFrame(partRings(t)?.[0] ?? t.outer);
    const r = (f.a + f.b) / 2;
    const wt = top(t) - (t.roofHeight ?? 0);
    // machicolation band under the cone
    revolve(W.b('masonry', K.stone), f.cx, f.cz, [[r - 0.05, wt - 1.6], [r + 0.45, wt - 1.6], [r + 0.45, wt - 1.6], [r + 0.45, wt + 0.1], [r + 0.45, wt + 0.1], [r - 0.05, wt + 0.1]], 24);
    if (t === bonbec) {
      for (let k = 0; k < 14; k++) {
        const a = (2 * Math.PI * k) / 14;
        const [x, z] = [f.cx + (r + 0.2) * Math.cos(a), f.cz + (r + 0.2) * Math.sin(a)];
        tube(W.b('masonry', K.stone, NEAR), [x, wt + 0.1, z], [x, wt + 1.2, z], 0.32, 4);
      }
    }
    tube(W.b('masonry', K.spire, NEAR), [f.cx, top(t) - 0.2, f.cz], [f.cx, top(t) + 2, f.cz], 0.08, 4);
  }
  // Clock of the Tour de l'Horloge (1370, décor 1585): stone frame + pediment, blue field, gilded dial and hands.
  const high = parts.filter((p) => top(p) >= 25);
  for (const pt of rec.points ?? []) {
    if (pt.kind !== 'clock') continue;
    const w = nearestWall(high, pt.x, pt.z, 4);
    if (!w || w.d > 8) continue;
    const [s, y] = [w.s, G.clockHeight];
    decal(W.b('masonry', K.tracery), w.pl, rectP(s - 2.3, s + 2.3, y - 3.1, y + 3.3), 0.05);
    decal(W.b('masonry', K.tracery), w.pl, [s - 2.6, y + 3.3, s + 2.6, y + 3.3, s, y + 4.7], 0.05);
    decal(W.b('masonry', K.clockBlue), w.pl, rectP(s - 1.8, s + 1.8, y - 1.8, y + 1.8), 0.09);
    const g = W.b('gold');
    decal(g, w.pl, circleP(s, y, 1.6, 24), 0.12, [circleP(s, y, 1.35, 24)]);
    const gn = W.b('gold', undefined, NEAR);
    decal(gn, w.pl, spokeP(s, y, -0.15, 0.85, (5 * Math.PI) / 6, 0.07), 0.14);
    decal(gn, w.pl, spokeP(s, y, -0.15, 1.25, Math.PI / 3, 0.05), 0.14);
    for (let k = 0; k < 12; k++) decal(gn, w.pl, spokeP(s, y, 1.1, 1.3, (2 * Math.PI * k) / 12, 0.05), 0.13);
  }
  // Quai de l'Horloge front (between Bonbec and the clock tower): Gothic lower windows, cross windows above.
  const quai = parts.filter((p) => top(p) >= 18 && top(p) <= 30 && p.roofShape !== 'cone' &&
    cones.some((c) => Math.hypot(centre(c)[0] - centre(p)[0], centre(c)[1] - centre(p)[1]) < 30));
  const north = (n: P2) => n[1] < -0.8;
  const rings = quai.flatMap((p) => partRings(p) ?? []);
  windowRows(W.b('masonry', K.window), rings, [[3, 8.6]], { spacing: G.window.spacing, width: 2, shape: 'pointed', minLen: 4, facing: north });
  windowRows(W.b('masonry', K.window), rings, [[11, 15.2]], { spacing: G.window.spacing, width: 1.8, shape: 'rect', minLen: 4, facing: north });
  // The rest of the Palais de Justice: rectangular windows on every wall of the big parts, rows below the eaves.
  for (const p of parts) {
    const eave = top(p) - (p.roofHeight ?? 0);
    if (quai.includes(p) || cones.includes(p) || eave < 12 || (p.minHeight ?? 0) > 1 || Math.abs(ringArea(p.outer)) < 150) continue;
    const rows = ([[3.5, 7.5], [10, 14], [16.5, 20.5], [23, 27]] as const).filter(([, y1]) => y1 < eave - 1.5);
    windowRows(W.b('masonry', K.window), partRings(p) ?? [], rows, { spacing: G.window.spacing, width: 1.6, shape: 'rect', minLen: 6 });
  }
  return finish(base, W);
};

// ── Hôtel de Ville (Ballu & Deperthes 1874–1892): cornice wings, steep pavilion roofs, central campanile + clock ──

/** Douglas–Peucker on a closed ring (tolerance tol m). */
function simplifyRing(r: XZ, tol: number): XZ {
  const n = r.length / 2;
  if (n <= 4) return r;
  const keep = new Uint8Array(n);
  const rec = (i: number, j: number) => {
    const [ax, az, bx, bz] = [r[2 * i]!, r[2 * i + 1]!, r[2 * (j % n)]!, r[2 * (j % n) + 1]!];
    const L = Math.hypot(bx - ax, bz - az) || 1e-9;
    let [best, k] = [-1, -1];
    for (let m = i + 1; m < j; m++) {
      const d = Math.abs((bx - ax) * (az - r[2 * m + 1]!) - (ax - r[2 * m]!) * (bz - az)) / L;
      if (d > best) [best, k] = [d, m];
    }
    if (best > tol) {
      keep[k] = 1;
      rec(i, k);
      rec(k, j);
    }
  };
  const half = Math.floor(n / 2);
  keep[0] = keep[half] = 1;
  rec(0, half);
  rec(half, n);
  return Array.from(keep).flatMap((v, i) => (v ? [r[2 * i]!, r[2 * i + 1]!] : []));
}

/** Ring offset inward (toward the building mass) by d, miters capped at 2 d. */
function insetRing(r: XZ, d: number): XZ {
  const n = r.length / 2;
  const out: XZ = [];
  for (let i = 0; i < n; i++) {
    const [p, c, q] = [(i + n - 1) % n, i, (i + 1) % n].map((k) => [r[2 * k]!, r[2 * k + 1]!] as const) as [P2, P2, P2];
    const n1 = edgePlane(p[0], p[1], c[0], c[1]).n;
    const n2 = edgePlane(c[0], c[1], q[0], q[1]).n;
    let [mx, mz] = [n1[0] + n2[0], n1[1] + n2[1]];
    const ml = Math.hypot(mx, mz) || 1;
    [mx, mz] = [mx / ml, mz / ml];
    const k = Math.min(2 * d, d / Math.max(0.2, mx * n1[0] + mz * n1[1]));
    out.push(c[0] - mx * k, c[1] - mz * k);
  }
  return out;
}

const hotelDeVille: DetailFn = (rec, parts, ctx, h) => {
  const H = G.hdv;
  const rings = partRings(rec);
  if (!rings) return h.generic(rec, parts, ctx);
  // OSM parts carry levels only: wings to the cornice, the 6-level pavilions higher, roof-only parts = pavilion roofs.
  const patched = parts.map((p): PartLike => {
    if (p.height !== undefined) return p;
    if (p.levels === undefined) {
      if (p.roofMaterial === 'glass') return { ...p, minHeight: B.levelHeight, height: B.levelHeight + 3, roofHeight: 3 };
      const f = footprintFrame(p.outer);
      const rh = Math.min(H.pavilionRoof, 1.6 * f.b);
      return { ...p, minHeight: H.cornice, height: H.cornice + rh, roofHeight: rh, roofMaterial: 'slate' };
    }
    if (p.levels >= 4) return { ...p, levels: undefined, minLevel: undefined, roofLevels: undefined, roofShape: undefined, height: p.levels >= 6 ? H.pavilion : H.cornice };
    return p;
  });
  const sink = render(patched, ctx, h, H.cornice);
  const W = new Local(ID, ctx.ground);

  // Perimeter slate roof on the outline (outer + courtyards): a steep skirt from the cornice + flat top.
  const simple = rings.map((r) => simplifyRing(r, H.simplify));
  const inner = simple.map((r) => insetRing(r, H.roofInset));
  const [y0, y1] = [H.cornice, H.cornice + H.roofRise];
  const roof = W.b('masonry', K.slate);
  simple.forEach((r, k) => {
    const q = inner[k]!;
    for (let i = 0; i < r.length; i += 2) {
      const j = (i + 2) % r.length;
      const pl = edgePlane(r[i]!, r[i + 1]!, r[j]!, r[j + 1]!);
      quadOut(roof, [r[i]!, y0, r[i + 1]!], [r[j]!, y0, r[j + 1]!], [q[j]!, y1, q[j + 1]!], [q[i]!, y1, q[i + 1]!], [pl.n[0], H.roofInset / H.roofRise, pl.n[1]]);
    }
  });
  const idx = triangulate(inner[0]!, inner.slice(1));
  const flat = inner.flat();
  for (let k = 0; k < idx.length; k += 3) {
    const P = (i: number): V3 => [flat[2 * i]!, y1, flat[2 * i + 1]!];
    triOut(W.b('masonry', K.lead), P(idx[k]!), P(idx[k + 1]!), P(idx[k + 2]!), [0, 1, 0]);
  }
  // Windows (3 rows) and dormers on the outer front.
  windowRows(W.b('masonry', K.window), [simple[0]!], [[4, 8.2]], { spacing: G.window.spacing, width: G.window.width, shape: 'round', minLen: 3 });
  windowRows(W.b('masonry', K.window), [simple[0]!], [[9.8, 13.8], [15, 17.8]], { spacing: G.window.spacing, width: G.window.width, shape: 'rect', minLen: 3 });
  const r0 = simple[0]!;
  for (let i = 0; i < r0.length; i += 2) {
    const j = (i + 2) % r0.length;
    const pl = edgePlane(r0[i]!, r0[i + 1]!, r0[j]!, r0[j + 1]!);
    if (pl.len < 3) continue;
    const n = Math.max(1, Math.floor(pl.len / G.window.spacing));
    for (let k = 0; k < n; k++) {
      const s = ((k + 0.5) * pl.len) / n;
      decal(W.b('masonry', K.stone, NEAR), pl, [s - 0.9, y0, s + 0.9, y0, s + 0.9, y0 + 2.4, s, y0 + 3.3, s - 0.9, y0 + 2.4], -0.9);
      decal(W.b('masonry', K.window, NEAR), pl, rectP(s - 0.5, s + 0.5, y0 + 1, y0 + 2.2), -0.85);
    }
  }

  // Campanile over the central pavilion of the west front (on the Place): belfry, clock, slate dome, lantern.
  // ponytail: ~50 m total estimated from photographs (no published figure found); TODO confirm.
  const fo = footprintFrame(simple[0]!);
  const dirs: [number, number, number][] = [[fo.ux, fo.uz, fo.a], [-fo.ux, -fo.uz, fo.a], [-fo.uz, fo.ux, fo.b], [fo.uz, -fo.ux, fo.b]];
  const [dx, dz, e] = dirs.reduce((m, d) => (d[0] < m[0] ? d : m));
  const Cf = frameAt(fo.cx + dx * (e - 9), fo.cz + dz * (e - 9), dx, dz); // local +x = toward the Place
  const C = new Local(Cf, ctx.ground);
  box(C.b('masonry', K.stone), -4.5, 4.5, H.cornice - 1, 30, -4.5, 4.5);
  box(C.b('masonry', K.stone), -3.6, 3.6, 30, 37.5, -3.6, 3.6);
  for (const [o, d, n] of [[[3.6, 0], [0, 1], [1, 0]], [[-3.6, 0], [0, -1], [-1, 0]], [[0, 3.6], [-1, 0], [0, 1]], [[0, -3.6], [1, 0], [0, -1]]] as [P2, P2, P2][]) {
    decal(C.b('masonry', K.recess), plane(o, d, n), archP(-1.3, 1.3, 31, 36.6, false));
  }
  const front = plane([4.5, 0], [0, 1], [1, 0]);
  decal(C.b('masonry', K.clockBlue), front, circleP(0, 25, 1.7, 24));
  decal(C.b('gold'), front, circleP(0, 25, 1.95, 24), 0.08, [circleP(0, 25, 1.7, 24)]);
  decal(C.b('gold', undefined, NEAR), front, spokeP(0, 25, -0.1, 1.2, Math.PI / 3, 0.06), 0.1);
  decal(C.b('gold', undefined, NEAR), front, spokeP(0, 25, -0.1, 0.8, (5 * Math.PI) / 6, 0.08), 0.1);
  facets(C.b('masonry', K.slate), 0, 0, [[5.5, 37.5], [5.5, 38.2], [4.8, 40.5], [3.4, 42.5], [1.4, 43.8], [1, 44]], 4, Math.PI / 4);
  revolve(C.b('masonry', K.stone), 0, 0, [[0.9, 43.9], [0.9, 47], [0.9, 47], [1.05, 47], [0.6, 47.8], [0, 48.2]], 8);
  cross3(C.b('gold', undefined, NEAR), 0, 0, 48.2, 50, 0.3, 0.07);
  sink.prism([[...ngon(Cf.cx, Cf.cz, 6.4, 0, 4, Math.atan2(dz, dx) + Math.PI / 4).flatMap((p) => [p[0], p[2]])]], ctx.ground + H.cornice, ctx.ground + 37.5);
  return finish(sink, W, C);
};

// ── Centre Pompidou (Piano & Rogers 1977, fr.wikipedia: 166 × 60 m, 42 m): white frame, coloured ducts, escalator ──

const pompidou: DetailFn = (rec, _parts, ctx, h) => {
  const ring = partRings(rec)?.[0];
  if (!ring) return h.generic(rec, [], ctx);
  const f0 = footprintFrame(ring);
  const f = -f0.uz >= 0 ? f0 : { ...f0, ux: -f0.ux, uz: -f0.uz }; // local +z = east (rue du Renard), −z = the Piazza
  const [a, b, Ht] = [f.a, f.b, h.outlineTop(rec, ctx.def)];
  const L = new Local(f, ctx.ground);
  const [gx, gz] = [a - 1.2, b - 4];
  loft(L.b('glass'), [[[-gx, -0.5, -gz], [gx, -0.5, -gz], [gx, -0.5, gz], [-gx, -0.5, gz]], [[-gx, Ht - 0.6, -gz], [gx, Ht - 0.6, -gz], [gx, Ht - 0.6, gz], [-gx, Ht - 0.6, gz]]], LM.glassTile);
  box(L.b('masonry', K.deck), -gx, gx, Ht - 1.2, Ht - 0.4, -gz, gz);
  for (let k = 1; k < 6; k++) box(L.b('masonry', K.floor), -gx + 0.2, gx - 0.2, 7 * k - 0.7, 7 * k, -gz + 0.2, gz - 0.2);
  // Frame: 14 bays of 12.8 m, columns at the glass line, tie rods + X bracing in the outer plane, gerberettes per floor.
  const bays = 14;
  const xs = Array.from({ length: bays + 1 }, (_, i) => -gx + (2 * gx * i) / bays);
  const fr = () => L.b('masonry', K.frame);
  const frn = () => L.b('masonry', K.frame, NEAR);
  for (const s of [-1, 1]) {
    const [zc, zo] = [s * (b - 3.2), s * (b - 0.4)];
    for (const x of xs) {
      tube(fr(), [x, -0.5, zc], [x, Ht, zc], 0.45, 8);
      tube(fr(), [x, -0.5, zo], [x, Ht, zo], 0.15, 4);
      for (let k = 1; k <= 6; k++) tube(frn(), [x, 7 * k - 0.4, zc], [x, 7 * k - 0.9, zo], 0.28, 4); // gerberettes
    }
    for (let k = 1; k <= 6; k++) tube(fr(), [-gx, 7 * k - 0.9, zo], [gx, 7 * k - 0.9, zo], 0.22, 4);
    for (let i = 0; i < bays; i++) {
      for (let k = 0; k < 6; k++) {
        tube(frn(), [xs[i]!, 7 * k, zo], [xs[i + 1]!, 7 * k + 6.1, zo], 0.07, 4);
        tube(frn(), [xs[i + 1]!, 7 * k, zo], [xs[i]!, 7 * k + 6.1, zo], 0.07, 4);
      }
    }
  }
  // East front: ducts (blue air, green water, yellow electricity, red lifts), bent into the roof.
  const radii = [1.3, 0.8, 1.05, 0.55, 0.9, 0.7];
  for (let i = 0; i < bays; i++) {
    const [x, r] = [(xs[i]! + xs[i + 1]!) / 2, radii[i % radii.length]!];
    const zd = b + r - 0.1;
    const d = L.b('masonry', K.ducts[i % K.ducts.length]!);
    tube(d, [x, -0.5, zd], [x, Ht - 1.6, zd], r, 10);
    tube(d, [x, Ht - 1.6 - r, zd], [x, Ht - 1.6 - r, b - 6], r * 0.9, 10);
  }
  // West front (Piazza): the escalator tube climbing one floor per flight (ponytail: direction as seen in photos).
  const ze = -(b + 1.4);
  let [x, y] = [-gx + 12, 4];
  for (let k = 0; k < 5; k++) {
    tube(L.b('glass'), [x, y, ze], [x + 20, y + 7, ze], 1.5, 8);
    tube(fr(), [x, y - 1.5, ze], [x + 20, y + 5.5, ze], 0.35, 4);
    [x, y] = [x + 20, y + 7];
    if (k === 4) break;
    tube(L.b('glass'), [x - 0.5, y, ze], [x + 5.5, y, ze], 1.5, 8);
    tube(fr(), [x - 0.5, y - 1.5, ze], [x + 5.5, y - 1.5, ze], 0.35, 4);
    x += 5;
  }
  const sink = new h.Sink();
  sink.prism([ring], ctx.minGround - 0.5, ctx.ground + Ht);
  return finish(sink, L);
};

// ── Tour Saint-Jacques (1509–1523, fr.wikipedia: 52 m, flamboyant Gothic): buttressed tower, pinnacles, statue ──

const tourSaintJacques: DetailFn = (rec, _parts, ctx, h) => {
  const ring = partRings(rec)?.[0];
  if (!ring) return h.generic(rec, [], ctx);
  const f = footprintFrame(ring);
  const [a, b, T] = [f.a, f.b, h.outlineTop(rec, ctx.def)];
  // ponytail: terrace at T − 12 and the 4.5 m statue on its turret estimated from photographs (only 52 m is published)
  const body = T - 12;
  const L = new Local(f, ctx.ground);
  const st = (lod?: Lod) => L.b('masonry', rec.colour?.startsWith('#') ? rec.colour : K.saintJacques, lod);
  const c = 1.25; // corner buttress half size
  box(st(), -a + 0.7, a - 0.7, -1.5, body, -b + 0.7, b - 0.7);
  const corners: P2[] = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  // statue corner = the south-west one (min x − z in the world)
  const worldOf = ([sx, sz]: P2) => [f.cx + sx * a * f.ux - sz * b * f.uz, f.cz + sx * a * f.uz + sz * b * f.ux] as const;
  const sw = corners.reduce((m, q) => (worldOf(q)[0] - worldOf(q)[1] < worldOf(m)[0] - worldOf(m)[1] ? q : m));
  // Corner buttresses stepping back at the string courses (small pinnacles on the ledges, near). Top: Saint James on
  // the south-west stair turret, the symbols of the other three evangelists (lion, eagle, ox) on the other corners.
  for (const q of corners) {
    const [px, pz] = [q[0] * (a - c), q[1] * (b - c)];
    const steps = [[-1.5, 14.2, c], [14.2, 28.8, 0.85 * c], [28.8, body + 2, 0.7 * c]] as const;
    steps.forEach(([y0, y1, s], k) => {
      box(st(), px - s, px + s, y0, y1, pz - s, pz + s);
      if (k) facets(st(NEAR), px + q[0] * (steps[k - 1]![2] - 0.3), pz + q[1] * (steps[k - 1]![2] - 0.3), [[0.32, y0], [0.32, y0 + 1.2], [0.01, y0 + 3.4]], 4, Math.PI / 4);
    });
    if (q === sw) {
      facets(st(), px, pz, [[1.3, body + 2], [1.3, T - 5.4], [1.55, T - 5.4], [1.55, T - 4.8], [0.9, T - 4.8]], 8);
      for (let k = 0; k < 8; k++) { // stair-turret slits
        const t = (k * Math.PI) / 4;
        const pl = plane([px + 1.2 * Math.cos(t), pz + 1.2 * Math.sin(t)], [-Math.sin(t), Math.cos(t)], [Math.cos(t), Math.sin(t)]);
        decal(L.b('masonry', K.stoneDark, NEAR), pl, archP(-0.35, 0.35, body + 3, T - 7), 0.02);
      }
      tube(L.b('masonry', K.statue), [px, T - 4.8, pz], [px, T - 0.8, pz], 0.6, 8);
      revolve(L.b('masonry', K.statue), px, pz, [[0.2, T - 0.8], [0.34, T - 0.5], [0.3, T - 0.2], [0, T]], 8);
    } else {
      box(st(), px - 0.75, px + 0.75, body + 2, body + 3, pz - 0.75, pz + 0.75);
      revolve(L.b('masonry', K.statue), px, pz, [[0.6, body + 3], [0.72, body + 4], [0.55, body + 5], [0.35, body + 5.5], [0, body + 5.8]], 8);
    }
  }
  // openwork parapet pinnacles, two per side (near)
  for (const [ux, e, o] of [[1, a, b], [1, a, -b], [0, b, a], [0, b, -a]] as const) {
    for (const d of [-1, 1]) {
      const t = (d * (e - 2 * c)) / 2;
      const [x, z] = ux ? [t, o - Math.sign(o) * 0.9] : [o - Math.sign(o) * 0.9, t];
      facets(st(NEAR), x, z, [[0.28, body], [0.28, body + 1.8], [0.01, body + 4.2]], 4, Math.PI / 4);
    }
  }
  // parapet between the corner buttresses
  box(st(), -a + 2 * c, a - 2 * c, body, body + 1.4, -b + 0.7, -b + 1.05);
  box(st(), -a + 2 * c, a - 2 * c, body, body + 1.4, b - 1.05, b - 0.7);
  box(st(), -a + 0.7, -a + 1.05, body, body + 1.4, -b + 2 * c, b - 2 * c);
  box(st(), a - 1.05, a - 0.7, body, body + 1.4, -b + 2 * c, b - 2 * c);
  // faces: two lancet bays per stage between the buttresses; the top stage (belfry) is open
  const faces: [Plane, number][] = [
    [plane([a - 0.7, 0], [0, 1], [1, 0]), b], [plane([-a + 0.7, 0], [0, -1], [-1, 0]), b],
    [plane([0, b - 0.7], [-1, 0], [0, 1]), a], [plane([0, -b + 0.7], [1, 0], [0, -1]), a],
  ];
  for (const [pl, e] of faces) {
    const half = e - 2 * c - 0.2;
    for (const [y0, y1, col] of [[3.5, 13, K.stoneDark], [15.5, 27.5, K.stoneDark], [30, body - 1.5, K.recess]] as const) {
      for (const d of [-1, 1]) {
        const sc = (d * half) / 2;
        decal(L.b('masonry', col), pl, archP(sc - half / 2 + 0.3, sc + half / 2 - 0.3, y0, y1));
        decal(L.b('masonry', K.saintJacques, NEAR), pl, rectP(sc - 0.08, sc + 0.08, y0, y1 - (half - 0.6) * 0.7), 0.1);
      }
    }
  }
  for (const y of [14.2, 28.8]) box(st(NEAR), -a + 0.5, a - 0.5, y, y + 0.45, -b + 0.5, b - 0.5);
  const sink = new h.Sink();
  sink.prism([ring], ctx.ground - 1.5, ctx.ground + body);
  return finish(sink, L);
};

// ── Saint-Sulpice (towers 70.3 / 66.4 m, OSM): two-storey colonnade split per order, tower balustrades + columns ──

const saintSulpice: DetailFn = (rec, parts, ctx, h) => {
  const bands = parts.filter((p) => p.kind !== 'column' && (p.minHeight ?? 0) > 3);
  // OSM columns run through both orders; cut them at the entablatures, the upper (Ionic) order a little thinner.
  const split = parts.flatMap((p): PartLike[] => {
    if (p.kind !== 'column' || p.height === undefined) return [p];
    const [cx, cz] = centre(p);
    const cuts = bands
      .filter((q) => top(q) > (p.minHeight ?? 0) && q.minHeight! < top(p) && inRing(cx, cz, q.outer))
      .map((q) => [q.minHeight!, top(q)] as const)
      .sort((u, v) => u[0] - v[0]);
    const out: PartLike[] = [];
    let y = p.minHeight ?? 0;
    const shrink = (k: number) => (k ? p.outer.map((v, i) => (i % 2 ? cz : cx) + (v - (i % 2 ? cz : cx)) * 0.88) : p.outer);
    for (const [m0, m1] of [...cuts, [top(p), top(p)] as const]) {
      if (m0 - y > 1) out.push({ ...p, outer: shrink(out.length), minHeight: y, height: m0 });
      y = Math.max(y, m1);
    }
    return out;
  });
  const sink = render(split, ctx, h, h.outlineTop(rec, ctx.def));
  const W = new Local(ID, ctx.ground);
  const round = parts.filter((p) => p.kind === 'yes' && p.outer.length >= 32).sort((p, q) => top(q) - top(p)).slice(0, 2);
  for (const t of round) {
    const f = footprintFrame(partRings(t)?.[0] ?? t.outer);
    const R0 = (f.a + f.b) / 2;
    const T = top(t);
    const foot = Math.max(0, ...parts.filter((q) => q !== t && top(q) < T && inRing(f.cx, f.cz, q.outer)).map(top));
    revolve(W.b('masonry', K.stone), f.cx, f.cz, [[R0 + 0.15, T - 1.3], [R0 + 0.15, T], [R0 + 0.15, T], [R0 - 0.2, T]], 24);
    for (let k = 0; k < 12; k++) {
      const a = (2 * Math.PI * k) / 12;
      const [x, z] = [f.cx + (R0 + 0.45) * Math.cos(a), f.cz + (R0 + 0.45) * Math.sin(a)];
      tube(W.b('masonry', K.stone, NEAR), [x, foot + 0.4, z], [x, T - 1.6, z], 0.3, 6);
    }
  }
  // Square tower stages (below the round ones): one tall round-headed belfry bay per face, pilasters (near).
  const squares = parts.filter((p) => p.kind === 'yes' && top(p) > 50 && top(p) < 60 && Math.abs(ringArea(p.outer)) > 150);
  for (const p of squares) {
    const eave = top(p) - (p.roofHeight ?? 0);
    for (const r of partRings(p) ?? []) {
      for (let i = 0; i < r.length; i += 2) {
        const j = (i + 2) % r.length;
        const pl = edgePlane(r[i]!, r[i + 1]!, r[j]!, r[j + 1]!);
        if (pl.len < 6) continue;
        const [m, w] = [pl.len / 2, 0.21 * pl.len];
        decal(W.b('masonry', K.recess), pl, archP(m - w, m + w, 42.5, eave - 2.2, false));
        for (const s of [m - w - 1, m + w + 1]) decal(W.b('masonry', K.stoneDark, NEAR), pl, rectP(s - 0.4, s + 0.4, 41, eave - 1.2), 0.04);
      }
    }
  }
  // Loggias between the towers: three portals below, three arched windows above, on the wall behind the columns.
  const cols = parts.filter((p) => p.kind === 'column').map(centre);
  const nave = parts.reduce((m, p) => (Math.abs(ringArea(p.outer)) > Math.abs(ringArea(m.outer)) ? p : m));
  if (cols.length) {
    const [qx, qz] = [cols.reduce((s, c) => s + c[0], 0) / cols.length, cols.reduce((s, c) => s + c[1], 0) / cols.length];
    const [nx, nz] = centre(nave);
    const l = Math.hypot(qx - nx, qz - nz) || 1;
    const backs = parts.filter((p) => p.kind !== 'column' && !p.minHeight && top(p) >= 30 && !squares.includes(p) && !round.includes(p));
    const w = nearestWall(backs, qx, qz, 8, [(qx - nx) / l, (qz - nz) / l]);
    if (w) {
      for (const d of [-9, 0, 9]) {
        const s = Math.min(w.pl.len - 2.5, Math.max(2.5, w.s + d));
        decal(W.b('masonry', K.recess), w.pl, archP(s - (d ? 1.6 : 2.1), s + (d ? 1.6 : 2.1), 0.2, d ? 8 : 10, false));
        decal(W.b('masonry', K.window, NEAR), w.pl, archP(s - 1.5, s + 1.5, 22.5, 30.5, false));
      }
    }
  }
  return finish(sink, W);
};

// ── Panthéon (Soufflot; en.wikipedia: 83 m): lantern (tempietto + cupola + cross) replacing OSM's 90 m cone, tympanum ──

const pantheon: DetailFn = (rec, parts, ctx, h) => {
  const lantern = parts.find((p) => (p.minHeight ?? 0) >= 70);
  const dome = parts.find((p) => p.roofShape === 'dome' && top(p) > 60);
  if (!lantern || !dome) return h.generic(rec, parts, ctx);
  const sink = render(parts.filter((p) => p !== lantern), ctx, h, h.outlineTop(rec, ctx.def));
  const [cx, cz] = centre(dome);
  const d0 = top(dome);
  const TOP = 83;
  const W = new Local(ID, ctx.ground);
  revolve(W.b('masonry', K.stone), cx, cz, [[2.1, d0 - 0.4], [2.1, d0 + 4.7]], 16);
  for (let k = 0; k < 8; k++) {
    const a = (2 * Math.PI * k) / 8;
    tube(W.b('masonry', K.stone, NEAR), [cx + 2.6 * Math.cos(a), d0 - 0.3, cz + 2.6 * Math.sin(a)], [cx + 2.6 * Math.cos(a), d0 + 4.7, cz + 2.6 * Math.sin(a)], 0.17, 6);
  }
  revolve(W.b('masonry', K.stone), cx, cz, [[2.3, d0 + 4.7], [2.95, d0 + 4.7], [2.95, d0 + 4.7], [2.95, d0 + 5.2], [2.95, d0 + 5.2], [2.4, d0 + 5.2]], 16);
  const cup = TOP - 1.7;
  revolve(W.b('masonry', K.lead), cx, cz, [[2.4, d0 + 5.2], [2.2, d0 + 5.7], [1.7, cup - 0.6], [0.9, cup - 0.1], [0, cup]], 16);
  cross3(W.b('masonry', K.lead), cx, cz, cup - 0.1, TOP, 0.35, 0.12);
  // Pediment tympanum (David d'Angers' relief as a shaded inset): the gable face of the portico farthest from the dome.
  const peds = parts.filter((p) => p.roofShape === 'gabled' && p.roofOrientation === 'across' && (p.minHeight ?? 0) >= 20);
  const ped = peds.sort((p, q) => Math.hypot(centre(q)[0] - cx, centre(q)[1] - cz) - Math.hypot(centre(p)[0] - cx, centre(p)[1] - cz))[0];
  const pr = ped && partRings(ped)?.[0];
  if (ped && pr) {
    const f = footprintFrame(pr);
    const [wx, wz] = [-f.uz, f.ux];
    const sg = (f.cx - cx) * wx + (f.cz - cz) * wz > 0 ? 1 : -1;
    const pl = plane([f.cx + wx * sg * f.b, f.cz + wz * sg * f.b], [f.ux, f.uz], [wx * sg, wz * sg]);
    const [yb, ya] = [top(ped) - (ped.roofHeight ?? 0) + 2, top(ped) - 0.9];
    const hw = ((ya - yb) * f.a) / (ped.roofHeight || 1);
    decal(W.b('masonry', K.stoneDark), pl, [-hw, yb, hw, yb, 0, ya], 0.08);
  }
  return finish(sink, W);
};

// ── Palais du Luxembourg: OSM parts (generic) + window rows on the main wings ──

const luxembourg: DetailFn = (rec, parts, ctx, h) => {
  const base = h.generic(rec, parts, ctx);
  const W = new Local(ID, ctx.ground);
  const wings = parts.filter((p) => p.kind === 'yes' && top(p) - (p.roofHeight ?? 0) >= 17 && Math.abs(footprintFrame(p.outer).a * footprintFrame(p.outer).b) > 40);
  const rings = wings.flatMap((p) => partRings(p) ?? []);
  windowRows(W.b('masonry', K.window), rings, [[3.2, 8.6]], { spacing: 4.2, width: G.window.width, shape: 'round', minLen: 3 });
  windowRows(W.b('masonry', K.window), rings, [[11.2, 15.6]], { spacing: 4.2, width: G.window.width, shape: 'rect', minLen: 3 });
  for (const r of rings) {
    for (let i = 0; i < r.length; i += 2) {
      const j = (i + 2) % r.length;
      const pl = edgePlane(r[i]!, r[i + 1]!, r[j]!, r[j + 1]!);
      if (pl.len >= 3) decal(W.b('masonry', K.stoneDark, NEAR), pl, rectP(0, pl.len, 9.6, 10.3), 0.04); // string course
    }
  }
  return finish(base, W);
};

export const details: Partial<Record<LandmarkId, DetailFn>> = {
  'notre-dame': notreDame,
  'sainte-chapelle': sainteChapelle,
  conciergerie,
  'hotel-de-ville': hotelDeVille,
  pompidou,
  'tour-saint-jacques': tourSaintJacques,
  'saint-sulpice': saintSulpice,
  pantheon,
  luxembourg,
};

// ── Skyline (SPEC §17.6, plan S1–S3): silhouettes outside the map at true positions / heights, never walkable ──

/** World position + ground y of a skyline registry entry (groundAsl → relative y; else the DEM edge value). */
function skylineAt(id: LandmarkId, groundAt: (x: number, z: number) => number) {
  const d = LANDMARK_BY_ID.get(id)!;
  const p = latLonToWorld(d.at![0], d.at![1]);
  return { x: p.x, z: p.z, y: d.groundAsl !== undefined ? d.groundAsl - G.skyline.originAsl : groundAt(p.x, p.z), height: d.height! };
}

/** Pure: all skyline silhouettes as one world-space bucket ('masonry', vertex colours). */
export function buildSkyline(sky: SkylineData | undefined, groundAt: (x: number, z: number) => number): MeshBucket[] {
  const locals: Local[] = [];
  // Sacré-Cœur (Abadie, fr.wikipedia: dome 83 m, on Montmartre at 130 m): nave, drum + ovoid dome, 4 small domes,
  // campanile at the back (north). Front faces south.
  {
    const s = skylineAt('sacre-coeur', groundAt);
    const L = new Local(frameAt(s.x, s.z, 0, -1), s.y); // x = north
    const w = () => L.b('masonry', K.sacreCoeur);
    // ponytail: Montmartre as a round mound (summit 130 m ASL, ~50 m ASL 600 m out, estimated from the IGN map), not the DEM
    const drop = s.y + G.skyline.baseDrop;
    revolve(L.b('masonry', K.montmartre), 0, 0, [[900, -drop], [600, 15 - s.y], [350, 50 - s.y], [180, 82 - s.y], [80, -2], [0, -1]], 24);
    box(w(), -30, 26, -2, 26, -15, 15);
    box(w(), -38, -30, -2, 20, -9, 9);
    const H = s.height;
    revolve(w(), 0, 0, [[10, 24], [10, 44], [10, 44], [11, 44], [11, 45.5], [9.6, 45.5], [9.4, 51], [8.2, 57], [6, 62.5], [3.2, 67], [2.2, H - 12]], 20);
    revolve(w(), 0, 0, [[2.2, H - 12], [2.2, H - 6], [2.5, H - 6], [1.6, H - 4], [0.2, H - 1.8], [0, H - 1.8]], 12);
    tube(w(), [0, H - 2, 0], [0, H, 0], 0.25, 4);
    for (const [x, z] of [[-24, -11], [-24, 11], [14, -13], [14, 13]] as const) {
      revolve(w(), x, z, [[3.4, 24], [3.4, 33], [3.6, 33], [3.3, 36], [2.6, 39], [1.2, 41.5], [0.6, 42.5], [0.6, 44.5], [0, 45]], 10);
    }
    box(w(), 30, 40, -2, 58, -5, 5);
    revolve(w(), 35, 0, [[4.2, 58], [4.2, 67], [4.4, 67], [3.6, 71], [1.8, 75], [0.6, 77], [0.6, 79.5], [0, 80.5]], 10);
    locals.push(L);
  }
  // Tour Montparnasse (en.wikipedia: 210 m; plan ~50 × 32 m with convex long fronts).
  // ponytail: long axis bearing ≈ 115° (broad side facing the rue de Rennes) estimated, not from OSM (outside the cache).
  {
    const s = skylineAt('montparnasse', groundAt);
    const t = (115 * Math.PI) / 180;
    const L = new Local(frameAt(s.x, s.z, Math.sin(t), -Math.cos(t)), s.y);
    const ring: V3[] = [];
    for (let k = 0; k <= 8; k++) ring.push([-25 + (50 * k) / 8, 0, 12 + 4 * Math.sin((Math.PI * k) / 8)]);
    for (let k = 8; k >= 0; k--) ring.push([-25 + (50 * k) / 8, 0, -12 - 4 * Math.sin((Math.PI * k) / 8)]);
    ring.reverse();
    const H = s.height;
    const buf = L.b('masonry', K.montparnasse);
    loft(buf, [ring.map((p) => [p[0], -G.skyline.baseDrop, p[2]] as V3), ring.map((p) => [p[0], H, p[2]] as V3)]);
    const idx = triangulate(ring.flatMap((p) => [p[0], p[2]]));
    for (let k = 0; k < idx.length; k += 3) {
      const P = (i: number): V3 => [ring[i]![0], H, ring[i]![2]];
      triOut(buf, P(idx[k]!), P(idx[k + 1]!), P(idx[k + 2]!), [0, 1, 0]);
    }
    locals.push(L);
  }
  // La Défense: towers from skyline.json as prisms; the one nearest the registry point is the Grande Arche
  // (en.wikipedia: 110 m high, 108 m wide, 112 m deep): a hollow cube opening toward Paris.
  {
    const s = skylineAt('la-defense', groundAt);
    const towers = sky?.towers ?? [];
    let arche = -1;
    towers.forEach((t, i) => {
      const [x, z] = ringCentroid(t.outer);
      if (Math.hypot(x - s.x, z - s.z) < 60 && (arche < 0 || t.height > towers[arche]!.height)) arche = i;
    });
    const W = new Local(ID, s.y);
    towers.forEach((t, i) => {
      const r = partRings({ outer: t.outer })?.[0];
      if (!r || i === arche) return;
      const [x, z] = ringCentroid(r);
      const pts = (y: number): V3[] => Array.from({ length: r.length / 2 }, (_, k) => [r[2 * k]!, y, r[2 * k + 1]!]);
      const buf = W.b('masonry', K.defense[Math.floor(hash01(x, z) * K.defense.length)]!);
      loft(buf, [pts(t.minHeight || -G.skyline.baseDrop), pts(t.height)]);
      const idx = triangulate(r);
      for (let k = 0; k < idx.length; k += 3) {
        const P = (j: number): V3 => [r[2 * j]!, t.height, r[2 * j + 1]!];
        triOut(buf, P(idx[k]!), P(idx[k + 1]!), P(idx[k + 2]!), [0, 1, 0]);
      }
    });
    locals.push(W);
    const ar = arche >= 0 ? partRings({ outer: towers[arche]!.outer })?.[0] : undefined;
    const f0 = ar ? footprintFrame(ar) : { ...frameAt(s.x, s.z, 1, 0), a: 54, b: 56 };
    const toParis = Math.abs(-f0.cx * f0.ux - f0.cz * f0.uz) >= Math.abs(f0.cx * f0.uz - f0.cz * f0.ux);
    const f = toParis ? f0 : { ...f0, ux: -f0.uz, uz: f0.ux, a: f0.b, b: f0.a }; // local x = through the opening
    const H = arche >= 0 ? towers[arche]!.height : s.height;
    const A = new Local(f, s.y);
    const g = A.b('masonry', K.arche);
    const [a, b, t] = [f.a, f.b, 0.17 * f.b];
    box(g, -a, a, -G.skyline.baseDrop, H * 0.07, -b, b);
    box(g, -a, a, H * 0.84, H, -b, b);
    box(g, -a, a, H * 0.07, H * 0.84, -b, -b + t);
    box(g, -a, a, H * 0.07, H * 0.84, b - t, b);
    locals.push(A);
  }
  return mergeBuckets(locals.flatMap((l) => l.buckets()));
}

/** Main thread: one mesh with every skyline silhouette. Drawn without scene fog (they lie far beyond it): own haze
 *  toward the horizon colour (by distance, and total near the city datum so bases rise out of the fog), depth-compressed into the last shell before camera.far so it is never clipped;
 *  anything in the scene closer than the shell occludes it normally. Not frustum-culled, no shadows. */
export function createSkyline(sky: SkylineData | undefined, groundAt: (x: number, z: number) => number): THREE.Mesh {
  const [b] = buildSkyline(sky, groundAt) as [MeshBucket]; // Sacré-Cœur is always there
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(b.position, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(b.normal, 3));
  g.setAttribute('color', new THREE.BufferAttribute(b.color!, 3));
  g.setIndex(new THREE.BufferAttribute(b.index, 1));
  const S = G.skyline;
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, fog: false });
  m.onBeforeCompile = (s) => {
    s.uniforms.skyHaze = { value: new THREE.Vector4(S.hazeDistance, S.maxHaze, S.shell, S.fadeHeight) };
    // mixed after colorspace_fragment (output is sRGB already), like three's own fogColor: sRGB components
    s.uniforms.skyHazeColor = { value: new THREE.Color(R.sky.horizon).convertLinearToSRGB() };
    s.vertexShader = `uniform vec4 skyHaze;\nvarying float vSkyHaze;\n${s.vertexShader.replace(
      '#include <project_vertex>',
      `vec4 mvPosition = modelViewMatrix * vec4( transformed, 1.0 );
      float skyD = length( mvPosition.xyz );
      float skyFar = projectionMatrix[3][2] / ( projectionMatrix[2][2] + 1.0 );
      float skyA = skyHaze.z * skyFar;
      vSkyHaze = max( min( skyHaze.y, 1.0 - exp( - skyD / skyHaze.x ) ), 1.0 - smoothstep( 0.0, skyHaze.w, transformed.y ) );
      if ( skyD > skyA ) mvPosition.xyz *= ( skyA + ( 0.98 * skyFar - skyA ) * ( 1.0 - exp( - ( skyD - skyA ) / skyFar ) ) ) / skyD;
      gl_Position = projectionMatrix * mvPosition;`,
    )}`;
    s.fragmentShader = `uniform vec3 skyHazeColor;\nvarying float vSkyHaze;\n${s.fragmentShader.replace(
      '#include <fog_fragment>',
      'gl_FragColor.rgb = mix( gl_FragColor.rgb, skyHazeColor, vSkyHaze );',
    )}`;
  };
  const mesh = new THREE.Mesh(g, m);
  mesh.name = 'skyline';
  mesh.frustumCulled = false;
  return mesh;
}
