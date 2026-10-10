// Leg 2 landmark group m1 (agent o1, docs/plans/leg2-landmarks.md §4): the Senado square and the Portuguese / Chinese heritage
// around it, built in code from the OSM outlines (no downloads). Tunables + sources: config landmarks.m1. DOM-free (worker).
//   Shared kit: the outline is simplified (jogs < simplify m dropped), the edge facing `az` carries the main façade; façade
//   pieces (windows, pilasters, pediments, columns, stairs) are made in that edge's local frame (x along it, y = world y,
//   z outward) and placed with kit.place; cornices are offset rings round the whole outline.
//   Night: like mf1, the floodlight is baked into unlit 'neon' vertex colours (bakeFlood: the worker knows no time of day, so
//   the façades look evenly lit by day too); windows: a hashed share glows warm (lighting.windows), the rest are dark panes.
//   Colliders: body / tower / basin prisms (renderPart / Sink.prism), columns, walkable ramps flagged `stairs`.
//   leal-senado: white two-storey front with pilasters, projecting centre + pediment, balustrade, arched door, steps.
//   largo-senado (pedestrian area, not extruded): cream calçada with black waves along the square + the armillary fountain.
//   santa-casa: white front, arched ground-floor openings, attic + pediment. teatro-dom-pedro: green walls, white
//   pilasters, hipped roof, portico of paired columns + pediment. quartel-mouros: ochre two-storey pointed-arch verandas on a
//   granite podium, merlons, corner towers, stair. casa-mandarim: grey-brick halls with gabled tile roofs round open
//   courts, a moon-gate wall, lanterns; the museum site = an inset compound wall. sao-domingos: yellow Baroque front with
//   white pilasters / cornices / pediment, green shutters, gabled nave, rear bell tower. se-catedral: twin towers with
//   belfries + pyramid caps + crosses, gable front, nave, the Largo da Sé fountain (zone point).
import { latLonToWorld } from '@race/shared';
import { landmarks as L, lighting as LT } from '../../config.ts';
import { type BuildingRec, type LandmarkId, type PartRec, ringArea, type XZ } from '../../geo/chunkData.ts';
import type { BuildOut, MaterialId, MeshBucket, TriMesh } from '../buildTypes.ts';
import { hash01, type MeshBuffer, mergeBuckets, offsetPolyline, triangulate, type V3 } from '../geom.ts';
import type { DetailFn, LandmarkCtx } from './index.ts';
import { box, extrude, type Frame, footprintFrame, place, quadOut, triOut } from './kit.ts';
import { maxInside } from './m2.ts';
import { parseColour, partRings, renderPart, Sink } from './parts.ts';

const M = L.m1;
const W = M.window;
const TAU = 2 * Math.PI;
const EMPTY: BuildOut = { meshes: [], instances: [], colliders: [] };

/** sRGB hex → linear RGB × k. */
export const lin = (hex: string, k = 1): V3 => {
  const c = parseColour(hex)!;
  return [c[0] * k, c[1] * k, c[2] * k];
};
/** Sink buffer of material m, its vertex colour set for what is added next (call right before every use). */
function paint(s: Sink, m: MaterialId, c: string | V3, lod?: 'near') {
  const b = s.buf(m, lod);
  if (b.withColor) b.color = typeof c === 'string' ? lin(c) : c;
  return b;
}
const glowColour = (): V3 => lin(LT.windows.colour, LT.windows.intensity * W.glow * LT.emissiveScale);

// ── outline ──

function inRing(x: number, z: number, r: XZ) {
  let inside = false;
  for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
    const [xi, zi, xj, zj] = [r[i]!, r[i + 1]!, r[j]!, r[j + 1]!];
    if (zi > z !== zj > z && x < xi + ((z - zi) / (zj - zi)) * (xj - xi)) inside = !inside;
  }
  return inside;
}

/** Drops the vertex nearest to the line through its neighbours while that distance is < tol (ring stays ≥ 3 points). */
export function simplify(ring: XZ, tol: number): XZ {
  const p: [number, number][] = [];
  for (let i = 0; i < ring.length; i += 2) p.push([ring[i]!, ring[i + 1]!]);
  while (p.length > 3) {
    let [best, bd] = [-1, tol];
    for (let i = 0; i < p.length; i++) {
      const [a, b, c] = [p[(i + p.length - 1) % p.length]!, p[i]!, p[(i + 1) % p.length]!];
      const l = Math.hypot(c[0] - a[0], c[1] - a[1]);
      const d = l < 1e-6 ? Math.hypot(b[0] - a[0], b[1] - a[1]) : Math.abs((c[0] - a[0]) * (b[1] - a[1]) - (c[1] - a[1]) * (b[0] - a[0])) / l;
      if (d < bd) [best, bd] = [i, d];
    }
    if (best < 0) break;
    p.splice(best, 1);
  }
  return p.flat();
}

/** Outline edge A→B of a ring with ringArea > 0: u = unit direction; its outward normal is (−uz, ux) = kit.place's w. */
export interface Edge {
  ax: number;
  az: number;
  len: number;
  ux: number;
  uz: number;
}
export function edgesOf(ring: XZ): Edge[] {
  const out: Edge[] = [];
  for (let i = 0, n = ring.length; i < n; i += 2) {
    const [ax, az, bx, bz] = [ring[i]!, ring[i + 1]!, ring[(i + 2) % n]!, ring[(i + 3) % n]!];
    const len = Math.hypot(bx - ax, bz - az);
    if (len > 1e-3) out.push({ ax, az, len, ux: (bx - ax) / len, uz: (bz - az) / len });
  }
  return out;
}
/** World (x, z) of edge-local (s along, t outward). */
export const at = (e: Edge, s: number, t: number): [number, number] => [e.ax + e.ux * s - e.uz * t, e.az + e.uz * s + e.ux * t];
const frameOf = (e: Edge) => ({ cx: e.ax, cz: e.az, ux: e.ux, uz: e.uz, a: 0, b: 0, area: 0 }) as Frame;
/** The edge whose outward normal best faces compass azimuth `az` (deg), weighted by length. */
export function facing(edges: Edge[], az: number): Edge {
  const [dx, dz] = [Math.sin((az * Math.PI) / 180), -Math.cos((az * Math.PI) / 180)];
  const score = (e: Edge) => e.len * Math.max(0, -e.uz * dx + e.ux * dz) ** 2;
  return edges.reduce((a, b) => (score(b) > score(a) ? b : a));
}
/** Closed ring offset outwards by d (d < 0: inwards); ring with ringArea > 0. */
export function grow(ring: XZ, d: number): XZ {
  const n = ring.length;
  const wrap = (s: number) => offsetPolyline(ring, s, [ring[n - 2]!, ring[n - 1]!], [ring[0]!, ring[1]!]);
  const [a, b] = [wrap(d), wrap(-d)];
  return (Math.abs(ringArea(a)) >= Math.abs(ringArea(b))) === d > 0 ? a : b;
}
/** Square ring (ringArea > 0) in an edge's local frame: x0…x1 along, z0…z1 outward. */
function localRing(e: Edge, x0: number, x1: number, z0: number, z1: number): XZ {
  const r = [at(e, x0, z0), at(e, x1, z0), at(e, x1, z1), at(e, x0, z1)].flat();
  return ringArea(r) > 0 ? r : [r[6]!, r[7]!, r[4]!, r[5]!, r[2]!, r[3]!, r[0]!, r[1]!];
}

// ── floodlight ──

/** Bakes the floodlight into a vertex-coloured bucket → 'neon': albedo × tint × (ambient + strength·|n_xz|·(1 − fade·y/H) +
 *  top·n_y), y from base. Other buckets unchanged. Pure. */
export function bakeFlood(m: MeshBucket, base: number, H: number): MeshBucket {
  if (!m.color || (m.material !== 'masonry' && m.material !== 'metal')) return m;
  const F = M.flood;
  const t = lin(F.tint, LT.emissiveScale);
  const { position: p, normal: n } = m;
  const c = m.color.slice();
  for (let i = 0; i < p.length; i += 3) {
    const y = Math.min(1, Math.max(0, (p[i + 1]! - base) / H));
    const k = F.ambient + F.strength * Math.hypot(n[i]!, n[i + 2]!) * (1 - F.fade * y) + F.top * Math.max(0, n[i + 1]!);
    for (let j = 0; j < 3; j++) c[i + j] = c[i + j]! * k * t[j]!;
  }
  return { ...m, material: 'neon', color: c };
}

/** One landmark record under construction: `lit` (floodlit, baked) and `raw` (glow, panes, ground) sinks in world space +
 *  pieces made in edge frames. */
class Build {
  readonly lit = new Sink();
  readonly raw = new Sink();
  readonly colliders: TriMesh[] = [];
  private readonly placed: { m: MeshBucket; bake: boolean }[] = [];
  constructor(readonly ctx: LandmarkCtx, readonly base: number, readonly H: number) {}
  /** Builds f in e's local frame (x along, y world, z outward). */
  on(e: Edge, f: (lit: Sink, raw: Sink) => void) {
    const [a, b] = [new Sink(), new Sink()];
    f(a, b);
    for (const m of a.out().meshes) this.put(place(m, frameOf(e), 0), true);
    for (const m of b.out().meshes) this.put(place(m, frameOf(e), 0), false);
  }
  /** A world-space bucket: baked (floodlit) or as is. */
  put(m: MeshBucket, bake: boolean) {
    this.placed.push({ m, bake });
  }
  ground(e: Edge, s: number, t = 0.6) {
    const [x, z] = at(e, s, t);
    return this.ctx.height(x, z);
  }
  out(): BuildOut {
    const [l, r] = [this.lit.out(), this.raw.out()];
    const baked = [...l.meshes, ...this.placed.filter((p) => p.bake).map((p) => p.m)].map((m) => bakeFlood(m, this.base, this.H));
    return {
      meshes: mergeBuckets([...baked, ...r.meshes, ...this.placed.filter((p) => !p.bake).map((p) => p.m)]),
      instances: [],
      colliders: [...l.colliders, ...r.colliders, ...this.colliders],
    };
  }
}

/** Walls of the ring from yb up to `top` (edges in `low` stop at roofY), inner parapet faces, flat roof at roofY, collider. */
function body(B: Build, ring: XZ, yb: number, top: number, roofY: number, wall: string, roof: string, low = new Set<Edge>(), edges = edgesOf(ring)) {
  for (const e of edges) {
    const yt = low.has(e) ? roofY : top;
    const [bx, bz] = at(e, e.len, 0);
    const n: V3 = [-e.uz, 0, e.ux];
    quadOut(paint(B.lit, 'masonry', wall), [e.ax, yb, e.az], [bx, yb, bz], [bx, yt, bz], [e.ax, yt, e.az], n, 0, yb, e.len, yt);
    if (yt > roofY + 0.01) quadOut(paint(B.lit, 'masonry', wall), [e.ax, roofY, e.az], [bx, roofY, bz], [bx, yt, bz], [e.ax, yt, e.az], [-n[0], 0, -n[2]]);
  }
  cap(paint(B.lit, 'masonry', roof), ring, roofY, 1);
  B.lit.prism([ring], yb, roofY);
}
/** Flat polygon at y facing up (1) or down (−1). */
function cap(b: MeshBuffer, ring: XZ, y: number, dir: 1 | -1) {
  const idx = triangulate(ring);
  const P = (i: number): V3 => [ring[2 * i]!, y, ring[2 * i + 1]!];
  for (let k = 0; k < idx.length; k += 3) triOut(b, P(idx[k]!), P(idx[k + 1]!), P(idx[k + 2]!), [0, dir, 0]);
}
/** Moulding round the outline: outer face d outside it from y0 to y1, top and bottom faces. */
function cornice(s: Sink, ring: XZ, y0: number, y1: number, d: number, c: string, lod?: 'near') {
  const o = grow(ring, d);
  const b = paint(s, 'masonry', c, lod);
  for (let i = 0, n = ring.length; i < n; i += 2) {
    const j = (i + 2) % n;
    const [ri, rj, oi, oj] = [[ring[i]!, ring[i + 1]!], [ring[j]!, ring[j + 1]!], [o[i]!, o[i + 1]!], [o[j]!, o[j + 1]!]];
    const out: V3 = [oi[0]! + oj[0]! - ri[0]! - rj[0]!, 0, oi[1]! + oj[1]! - ri[1]! - rj[1]!];
    quadOut(b, [oi[0]!, y0, oi[1]!], [oj[0]!, y0, oj[1]!], [oj[0]!, y1, oj[1]!], [oi[0]!, y1, oi[1]!], out);
    quadOut(b, [ri[0]!, y1, ri[1]!], [rj[0]!, y1, rj[1]!], [oj[0]!, y1, oj[1]!], [oi[0]!, y1, oi[1]!], [0, 1, 0]);
    quadOut(b, [ri[0]!, y0, ri[1]!], [rj[0]!, y0, rj[1]!], [oj[0]!, y0, oj[1]!], [oi[0]!, y0, oi[1]!], [0, -1, 0]);
  }
}

// ── façade pieces (edge-local: x along, y world, z outward) ──

export type WinKind = 'rect' | 'arch' | 'pointed' | 'round';
/** Opening outline (x, y), x centred on 0, y from 0 to h. */
export function shape(kind: WinKind, w: number, h: number, segs = 8): number[] {
  const r = w / 2;
  if (kind === 'round') return Array.from({ length: 12 }, (_, k) => [r * Math.cos((TAU * k) / 12), h / 2 + r * Math.sin((TAU * k) / 12)]).flat();
  if (kind === 'rect' || h <= r) return [-r, 0, r, 0, r, h, -r, h];
  if (kind === 'arch') {
    const spring = h - r;
    return [-r, 0, r, 0, ...Array.from({ length: segs + 1 }, (_, k) => [r * Math.cos((Math.PI * k) / segs), spring + r * Math.sin((Math.PI * k) / segs)]).flat()];
  }
  const spring = Math.max(0, h - w * Math.sin(Math.PI / 3)); // equilateral pointed arch: arcs of radius w from the far springer
  const right = Array.from({ length: 4 }, (_, k) => [-r + w * Math.cos((Math.PI / 3) * (k / 3)), spring + w * Math.sin((Math.PI / 3) * (k / 3))]);
  const left = Array.from({ length: 3 }, (_, k) => [r - w * Math.cos((Math.PI / 3) * ((2 - k) / 3)), spring + w * Math.sin((Math.PI / 3) * ((2 - k) / 3))]);
  return [-r, 0, r, 0, ...right.flat(), ...left.flat()];
}
const shift = (poly: number[], dx: number, dy: number) => poly.map((v, i) => v + (i % 2 ? dy : dx));
/** Flat polygon (x, y) at depth z facing +z. */
function face(b: MeshBuffer, poly: number[], z: number) {
  const idx = triangulate(poly);
  const P = (i: number): V3 => [poly[2 * i]!, poly[2 * i + 1]!, z];
  for (let k = 0; k < idx.length; k += 3) triOut(b, P(idx[k]!), P(idx[k + 1]!), P(idx[k + 2]!), [0, 0, 1]);
}

export type Pane = 'glass' | 'door' | 'shutter';
/** Window / door at x (centre), sill y, w × h: trim surround (t wide, depth deep from z0) + pane in front of it. Glass:
 *  lighting.windows glow for a hashed share (by world position), else dark. */
function win(e: Edge, lit: Sink, raw: Sink, x: number, y: number, w: number, h: number, kind: WinKind, trim: string, pane: Pane = 'glass', z0 = 0) {
  const t = W.trim;
  extrude(paint(lit, 'masonry', trim), shift(shape(kind, w + 2 * t, h + 2 * t), x, y - t), 'z', z0, z0 + W.depth);
  const poly = shift(shape(kind, w, h), x, y);
  const z = z0 + W.depth + 0.03;
  if (pane === 'door') return face(paint(lit, 'masonry', W.door), poly, z);
  if (pane === 'shutter') return face(paint(lit, 'masonry', W.shutter), poly, z);
  const [wx, wz] = at(e, x, 0);
  face(hash01(wx, wz, Math.round(y * 10)) < W.litShare ? paint(raw, 'neon', glowColour()) : paint(raw, 'masonry', W.dark), poly, z);
}
/** Box in local coordinates (pilasters, bands, plinths). */
function slab(s: Sink, c: string, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, lod?: 'near') {
  box(paint(s, 'masonry', c, lod), x0, x1, y0, y1, z0, z1);
}
/** Triangular pediment over x0…x1 from y0, height h: tympanum (wall) + raking and base cornices (trim) from z0. */
function pediment(s: Sink, x0: number, x1: number, y0: number, h: number, z0: number, wall: string, trim: string) {
  const [xm, k, o] = [(x0 + x1) / 2, 0.38, 0.3];
  extrude(paint(s, 'masonry', wall), [x0, y0, x1, y0, xm, y0 + h], 'z', z0, z0 + 0.25);
  const t = paint(s, 'masonry', trim);
  extrude(t, [x0 - o, y0, xm, y0 + h, xm, y0 + h + k, x0 - o, y0 + k], 'z', z0, z0 + 0.45);
  extrude(t, [xm, y0 + h, x1 + o, y0, x1 + o, y0 + k, xm, y0 + h + k], 'z', z0, z0 + 0.45);
  box(t, x0 - o, x1 + o, y0 - 0.3, y0 + 0.05, z0, z0 + 0.45);
}
/** Balustrade x0…x1 from y0 (h high): plinth, top rail, balusters every 0.42 m ('near'). */
function balustrade(s: Sink, x0: number, x1: number, y0: number, h: number, z0: number, c: string) {
  slab(s, c, x0, x1, y0, y0 + 0.22, z0 - 0.3, z0 + 0.05);
  slab(s, c, x0, x1, y0 + h - 0.16, y0 + h, z0 - 0.3, z0 + 0.06);
  const n = Math.max(1, Math.floor((x1 - x0) / 0.42));
  for (let i = 0; i < n; i++) {
    const x = x0 + ((i + 0.5) * (x1 - x0)) / n;
    slab(s, c, x - 0.07, x + 0.07, y0 + 0.22, y0 + h - 0.16, z0 - 0.2, z0 - 0.06, 'near');
  }
}
/** Round column (12 sides) on (x, z) from y0 to y1 + square base / capital; collider in world space. */
function column(B: Build, e: Edge, s: Sink, x: number, z: number, y0: number, y1: number, r: number, c: string) {
  const ring = (rr: number, y: number): V3[] => Array.from({ length: 12 }, (_, k) => [x + rr * Math.cos((TAU * k) / 12), y, z + rr * Math.sin((TAU * k) / 12)]);
  const b = paint(s, 'masonry', c);
  const rings = [ring(r, y0 + 0.4), ring(r * 0.86, y1 - 0.4)];
  for (let k = 0; k < 12; k++) {
    const [a0, a1, b0, b1] = [rings[0]![k]!, rings[0]![(k + 1) % 12]!, rings[1]![k]!, rings[1]![(k + 1) % 12]!];
    quadOut(b, a0, a1, b1, b0, [a0[0] + a1[0] - 2 * x, 0, a0[2] + a1[2] - 2 * z]);
  }
  box(b, x - r * 1.25, x + r * 1.25, y0, y0 + 0.4, z - r * 1.25, z + r * 1.25);
  box(b, x - r * 1.2, x + r * 1.2, y1 - 0.4, y1, z - r * 1.2, z + r * 1.2);
  B.colliders.push(prismCollider(localRing(e, x - r, x + r, z - r, z + r), y0, y1));
}
function prismCollider(ring: XZ, y0: number, y1: number): TriMesh {
  const s = new Sink();
  s.prism([ring], y0, y1);
  return s.out().colliders[0]!;
}
/** Straight flight against the wall: steps from yBot (ground) up to yTop, centred on x, `width` wide; walkable ramp. */
function stairs(B: Build, e: Edge, x: number, width: number, yTop: number, yBot: number, riser: number, tread: number, c: string) {
  const n = Math.max(1, Math.round((yTop - yBot) / riser));
  if (yTop - yBot < 0.08) return;
  const rise = (yTop - yBot) / n;
  const prof: number[] = [0, yBot - 0.4, n * tread, yBot - 0.4];
  for (let k = 1; k <= n; k++) prof.push((n - k + 1) * tread, yBot + k * rise, (n - k) * tread, yBot + k * rise);
  prof.splice(-2, 2); // last point is (0, yTop): keep it once
  prof.push(0, yTop);
  B.on(e, (lit) => extrude(paint(lit, 'masonry', c), prof, 'x', x - width / 2, x + width / 2));
  const D = n * tread;
  const v = [at(e, x - width / 2, 0), at(e, x + width / 2, 0), at(e, x + width / 2, D), at(e, x - width / 2, D)];
  const ys = [yTop, yTop, yBot, yBot];
  B.colliders.push({ vertices: new Float32Array(v.flatMap(([px, pz], i) => [px, ys[i]!, pz])), indices: new Uint32Array([0, 2, 1, 0, 3, 2]), stairs: true });
}
/** Windows along an edge: bays of ~bay m, per row [y above base, h, w, kind]; skipped where the ground covers the sill. */
function rows(B: Build, e: Edge, base: number, bay: number, list: readonly (readonly [number, number, number, WinKind])[], trim: string, pane: Pane = 'glass') {
  if (e.len < 2.6) return;
  const n = Math.max(1, Math.floor(e.len / bay));
  B.on(e, (lit, raw) => {
    for (let i = 0; i < n; i++) {
      const x = ((i + 0.5) * e.len) / n;
      const g = Math.max(B.ground(e, x - 1), B.ground(e, x + 1));
      for (const [y, h, w, kind] of list) if (base + y > g + 0.25 && w < e.len / n - 0.5) win(e, lit, raw, x, base + y, w, h, kind, trim, pane);
    }
  });
}
/** Lowest ground under an edge (ends + middle, 0.6 m out). */
const edgeGround = (B: Build, e: Edge) => Math.min(B.ground(e, 0.3), B.ground(e, e.len / 2), B.ground(e, e.len - 0.3));
/** Roof over a ring: renderPart 'roof' part (slab + roof only), heights from `base`. */
function roof(B: Build, ring: XZ, base: number, wallTop: number, h: number, shapeTag: string, c: string) {
  renderPart({ outer: ring, kind: 'roof', height: wallTop + h, roofHeight: h, roofShape: shapeTag, roofColour: c, colour: c }, { ground: base, height: B.ctx.height, fallbackTop: wallTop + h }, B.lit);
}
/** Square tower on a 4-point ring: walls from yb to top (pyramid cap of `capH` or flat), cornices, arched belfry openings. */
function tower(B: Build, ring: XZ, yb: number, base: number, top: number, capH: number, wall: string, trim: string, roofC: string, belfry: [number, number]) {
  renderPart({ outer: ring, kind: 'yes', height: top - base + capH, roofHeight: capH, roofShape: capH > 0 ? 'pyramidal' : 'flat', colour: wall, roofColour: roofC }, { ground: base, height: B.ctx.height, fallbackTop: top - base }, B.lit);
  for (const y of [belfry[0] - 0.6, top - 0.5]) cornice(B.lit, ring, y, y + 0.5, 0.25, trim);
  for (const e of edgesOf(ring)) B.on(e, (lit, raw) => win(e, lit, raw, e.len / 2, belfry[0], Math.min(1.8, e.len * 0.36), belfry[1] - belfry[0], 'arch', trim));
  void yb;
}
/** Latin cross (trim stone) standing at (x, z) local from y. */
function cross(s: Sink, x: number, y: number, z: number, h: number, c: string) {
  slab(s, c, x - 0.12, x + 0.12, y, y + h, z - 0.12, z + 0.12);
  slab(s, c, x - h * 0.3, x + h * 0.3, y + h * 0.62, y + h * 0.78, z - 0.12, z + 0.12);
}

// ── fountain ──

const circle = (cx: number, cz: number, r: number, y: number, n: number): V3[] => Array.from({ length: n }, (_, k) => [cx + r * Math.cos((TAU * k) / n), y, cz + r * Math.sin((TAU * k) / n)]);
/** Vertical cylinder side (outward or inward), optional top disc. */
function cylinder(b: MeshBuffer, cx: number, cz: number, r: number, y0: number, y1: number, n: number, inward = false, top = false) {
  const [lo, hi] = [circle(cx, cz, r, y0, n), circle(cx, cz, r, y1, n)];
  for (let k = 0; k < n; k++) {
    const [a, c] = [lo[k]!, lo[(k + 1) % n]!];
    const out: V3 = [(a[0] + c[0]) / 2 - cx, 0, (a[2] + c[2]) / 2 - cz];
    quadOut(b, a, c, hi[(k + 1) % n]!, hi[k]!, inward ? [-out[0], 0, -out[2]] : out);
  }
  if (top) for (let k = 1; k + 1 < n; k++) triOut(b, hi[0]!, hi[k]!, hi[k + 1]!, [0, 1, 0]);
}
/** Ribbon ring (armillary band) round centre c, radius r, in the plane ⟂ axis, width w, both faces. */
function ribbon(b: MeshBuffer, c: V3, r: number, axis: V3, w: number, n = 24) {
  const l = Math.hypot(...axis);
  const a: V3 = [axis[0] / l, axis[1] / l, axis[2] / l];
  const ref: V3 = Math.abs(a[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const e1 = norm([a[1] * ref[2] - a[2] * ref[1], a[2] * ref[0] - a[0] * ref[2], a[0] * ref[1] - a[1] * ref[0]]);
  const e2: V3 = [a[1] * e1[2] - a[2] * e1[1], a[2] * e1[0] - a[0] * e1[2], a[0] * e1[1] - a[1] * e1[0]];
  const P = (k: number, s: number): V3 => {
    const t = (TAU * k) / n;
    return [0, 1, 2].map((i) => c[i]! + r * (Math.cos(t) * e1[i]! + Math.sin(t) * e2[i]!) + s * a[i]!) as unknown as V3;
  };
  for (let k = 0; k < n; k++) {
    const [p0, p1, q1, q0] = [P(k, -w / 2), P(k + 1, -w / 2), P(k + 1, w / 2), P(k, w / 2)];
    const m = P(k + 0.5, 0);
    const out: V3 = [m[0] - c[0], m[1] - c[1], m[2] - c[2]];
    quadOut(b, p0, p1, q1, q0, out);
    quadOut(b, p0, p1, q1, q0, [-out[0], -out[1], -out[2]]);
  }
}
const norm = (v: V3): V3 => {
  const l = Math.hypot(...v) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};
interface FountainSpec {
  r: number;
  wall: number;
  inner?: number;
  sphere?: number;
  top?: number;
  water?: string;
  glow?: string;
}
/** Round basin (stone rim, water, waterline glow), optional inner tier + pedestal + armillary sphere (bronze); collider. */
function fountain(B: Build, cx: number, cz: number, F: FountainSpec, stone: string) {
  const g = B.ctx.height(cx, cz);
  const n = 28;
  const [rim, wy] = [0.35, g + F.wall - 0.18];
  cylinder(paint(B.lit, 'masonry', stone), cx, cz, F.r, g - 0.4, g + F.wall, n);
  cylinder(paint(B.lit, 'masonry', stone), cx, cz, F.r - rim, wy - 0.3, g + F.wall, n, true);
  const out = circle(cx, cz, F.r, g + F.wall, n);
  const inn = circle(cx, cz, F.r - rim, g + F.wall, n);
  const top = paint(B.lit, 'masonry', stone);
  for (let k = 0; k < n; k++) quadOut(top, inn[k]!, inn[(k + 1) % n]!, out[(k + 1) % n]!, out[k]!, [0, 1, 0]);
  const water = circle(cx, cz, F.r - rim, wy, n);
  const wb = paint(B.raw, 'masonry', F.water ?? '#2d4b52');
  for (let k = 1; k + 1 < n; k++) triOut(wb, water[0]!, water[k]!, water[k + 1]!, [0, 1, 0]);
  if (F.glow) cylinder(paint(B.raw, 'neon', lin(F.glow, 1.4 * LT.emissiveScale)), cx, cz, F.r - rim - 0.02, wy + 0.01, wy + 0.07, n, true);
  B.lit.prism([circle(cx, cz, F.r, 0, 16).flatMap((p) => [p[0], p[2]])], g - 0.4, g + F.wall);
  if (!F.inner) {
    cylinder(paint(B.lit, 'masonry', stone), cx, cz, 0.35, wy - 0.1, g + (F.top ?? 1.6), 10, false, true);
    return;
  }
  const t1 = g + F.wall + 0.45;
  cylinder(paint(B.lit, 'masonry', stone), cx, cz, F.inner, wy - 0.1, t1, 20, false, true);
  const sy = g + (F.top ?? 3);
  const S = F.sphere ?? 0.8;
  cylinder(paint(B.lit, 'masonry', stone), cx, cz, 0.42, t1, sy - S - 0.15, 12, false, true);
  cylinder(paint(B.lit, 'masonry', stone), cx, cz, 0.7, t1, t1 + 0.35, 12, false, true);
  const br = B.lit.buf('bronze', 'near');
  const c: V3 = [cx, sy, cz];
  ribbon(br, c, S, [0, 1, 0], 0.12); // equator
  ribbon(br, c, S, [1, 0, 0.35], 0.1); // meridians
  ribbon(br, c, S, [-0.35, 0, 1], 0.1);
  ribbon(br, c, S * 0.98, [0.4, 0.92, 0], 0.16); // ecliptic band
  cylinder(br, cx, cz, 0.06, sy - S - 0.2, sy + S + 0.25, 6); // axis
}

// ── Leal Senado ──

function lealSenado(rec: BuildingRec, ctx: LandmarkCtx): BuildOut {
  const S = M.leal;
  const ring = prep(rec, S.simplify);
  if (!ring) return EMPTY;
  const edges = edgesOf(ring);
  const front = facing(edges, S.az);
  const probe = new Build(ctx, 0, 1);
  const base = edgeGround(probe, front);
  const B = new Build(ctx, base, S.height);
  const yb = ctx.minGround - L.sink;
  const [top, roofY] = [base + S.cornice + 0.8 + S.balustrade, base + S.cornice + 0.8];
  body(B, ring, yb, top, roofY, S.wall, S.roof, new Set([front]), edges);
  cornice(B.lit, ring, yb, base + 0.9, 0.18, S.plinth);
  cornice(B.lit, ring, base + S.string, base + S.string + 0.35, 0.22, S.trim);
  cornice(B.lit, ring, base + S.cornice, base + S.cornice + 0.8, 0.45, S.trim);
  for (const e of edges) if (e !== front) rows(B, e, base, S.bay, [[1.5, 3, 1.4, 'rect'], [7.2, 3.3, 1.4, 'rect']], S.trim);
  const n = Math.max(5, Math.round(front.len / S.bay) | 1); // odd bay count: a central door
  const bw = front.len / n;
  const mid = (n - 1) / 2;
  const cx = front.len / 2;
  B.on(front, (lit, raw) => {
    // projecting centre (3 bays), pilasters, windows, door, pediment, balustrade
    slab(lit, S.wall, cx - 1.5 * bw, cx + 1.5 * bw, yb, base + S.cornice, 0, 0.4);
    slab(lit, S.trim, cx - 1.5 * bw - 0.2, cx + 1.5 * bw + 0.2, base + S.cornice, base + S.cornice + 0.8, 0, 0.85);
    for (let i = 0; i <= n; i++) {
      const z0 = Math.abs(i - n / 2) <= 1.5 ? 0.4 : 0;
      slab(lit, S.trim, i * bw - 0.32, i * bw + 0.32, base + 0.9, base + S.cornice, z0, z0 + 0.2);
    }
    for (let i = 0; i < n; i++) {
      const x = (i + 0.5) * bw;
      const z0 = Math.abs(i - mid) <= 1 ? 0.4 : 0;
      if (i === mid) win(front, lit, raw, x, base, 2.4, 4.6, 'arch', S.trim, 'door', z0);
      else win(front, lit, raw, x, base + 1.5, 1.45, 3, Math.abs(i - mid) <= 1 ? 'arch' : 'rect', S.trim, 'glass', z0);
      win(front, lit, raw, x, base + 7.2, 1.45, 3.3, 'rect', S.trim, 'glass', z0);
      slab(lit, S.trim, x - 1.1, x + 1.1, base + 10.75, base + 11.05, z0, z0 + 0.4); // window cap
      if (Math.abs(i - mid) <= 1) slab(lit, S.trim, x - 1.2, x + 1.2, base + 7.0, base + 7.2, z0, z0 + 0.7); // balcony slab
    }
    pediment(lit, cx - 1.5 * bw, cx + 1.5 * bw, base + S.cornice + 0.8, S.height - S.cornice - 1.2, 0.45, S.wall, S.trim);
    balustrade(lit, 0, cx - 1.5 * bw, base + S.cornice + 0.8, S.balustrade, 0.3, S.trim);
    balustrade(lit, cx + 1.5 * bw, front.len, base + S.cornice + 0.8, S.balustrade, 0.3, S.trim);
    slab(lit, S.trim, 0, front.len, roofY, roofY + 0.05, -0.4, 0); // roof edge behind the balustrade
    void raw;
  });
  const St = S.stair;
  const gFront = B.ground(front, cx, St.steps * St.tread + 0.4);
  stairs(B, front, cx, St.width, base + 0.02, Math.min(gFront, base - St.riser), St.riser, St.tread, S.plinth);
  return B.out();
}

/** Simplified outer ring of a record (ringArea > 0). */
function prep(rec: BuildingRec, tol: number = M.simplify): XZ | undefined {
  const r = partRings(rec)?.[0];
  if (!r) return undefined;
  const s = simplify(r, tol);
  return ringArea(s) > 0 ? s : undefined;
}

// ── Largo do Senado ──

/** Splits a triangle until every edge is ≤ max, then emits it draped on the terrain (+lift). */
function drape(b: MeshBuffer, a: [number, number], c: [number, number], d: [number, number], max: number, h: (x: number, z: number) => number, lift: number) {
  const l = [Math.hypot(c[0] - a[0], c[1] - a[1]), Math.hypot(d[0] - c[0], d[1] - c[1]), Math.hypot(a[0] - d[0], a[1] - d[1])];
  const k = l.indexOf(Math.max(...l));
  if (l[k]! <= max) {
    const P = (p: [number, number]): V3 => [p[0], h(p[0], p[1]) + lift, p[1]];
    return triOut(b, P(a), P(c), P(d), [0, 1, 0]);
  }
  const [p, q, r] = k === 0 ? [a, c, d] : k === 1 ? [c, d, a] : [d, a, c];
  const m: [number, number] = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
  drape(b, p, m, r, max, h, lift);
  drape(b, m, q, r, max, h, lift);
}
/** Wave stripes of the calçada in the square's frame: centre line q_k + amp·sin(2π p / length), quads kept inside the ring. */
export function waveQuads(ring: XZ, S: { period: number; amp: number; length: number; share: number; step: number }) {
  const f = footprintFrame(ring);
  const hw = (S.period * S.share) / 2;
  const W = (p: number, q: number): [number, number] => [f.cx + p * f.ux - q * f.uz, f.cz + p * f.uz + q * f.ux];
  const quads: [number, number][][] = [];
  const nq = Math.floor((2 * f.b) / S.period);
  for (let k = 0; k <= nq; k++) {
    const q0 = -f.b + (k + 0.5) * S.period - (nq * S.period - 2 * f.b) / 2;
    const qc = (p: number) => q0 + S.amp * Math.sin((TAU * p) / S.length);
    for (let p = -f.a; p < f.a; p += S.step) {
      const p1 = Math.min(f.a, p + S.step);
      const quad = [W(p, qc(p) - hw), W(p1, qc(p1) - hw), W(p1, qc(p1) + hw), W(p, qc(p) + hw)];
      if (quad.every(([x, z]) => inRing(x, z, ring))) quads.push(quad);
    }
  }
  return quads;
}
function largoSenado(rec: BuildingRec, ctx: LandmarkCtx): BuildOut {
  const S = M.largo;
  const ring = partRings(rec)?.[0];
  if (!ring) return EMPTY;
  const F = S.fountain;
  const p = latLonToWorld(F.lat, F.lon);
  const B = new Build(ctx, ctx.height(p.x, p.z), F.top);
  const idx = triangulate(ring);
  const pt = (i: number): [number, number] => [ring[2 * i]!, ring[2 * i + 1]!];
  const base = paint(B.raw, 'masonry', S.base);
  for (let k = 0; k < idx.length; k += 3) drape(base, pt(idx[k]!), pt(idx[k + 1]!), pt(idx[k + 2]!), S.mesh, ctx.height, S.lift);
  const wave = paint(B.raw, 'masonry', S.wave);
  for (const q of waveQuads(ring, S)) {
    const v = q.map(([x, z]): V3 => [x, ctx.height(x, z) + S.lift + 0.03, z]) as [V3, V3, V3, V3];
    quadOut(wave, v[0], v[1], v[2], v[3], [0, 1, 0]);
  }
  if (inRing(p.x, p.z, ring)) fountain(B, p.x, p.z, F, '#ece6d8');
  return B.out();
}

// ── Santa Casa da Misericórdia ──

function santaCasa(rec: BuildingRec, ctx: LandmarkCtx): BuildOut {
  const S = M.santaCasa;
  const ring = prep(rec);
  if (!ring) return EMPTY;
  const edges = edgesOf(ring);
  const front = facing(edges, S.az);
  const base = edgeGround(new Build(ctx, 0, 1), front);
  const B = new Build(ctx, base, S.height);
  const yb = ctx.minGround - L.sink;
  const roofY = base + S.cornice + 0.8 + S.attic;
  body(B, ring, yb, roofY + 0.6, roofY, S.wall, S.roof, new Set(), edges);
  cornice(B.lit, ring, yb, base + 0.7, 0.15, S.plinth);
  cornice(B.lit, ring, base + S.string, base + S.string + 0.35, 0.22, S.trim);
  cornice(B.lit, ring, base + S.cornice, base + S.cornice + 0.8, 0.45, S.trim);
  cornice(B.lit, ring, roofY + 0.3, roofY + 0.6, 0.25, S.trim);
  for (const e of edges) if (e !== front) rows(B, e, base, S.bay, [[1.4, 3.2, 1.4, 'arch'], [7.4, 3.3, 1.4, 'rect']], S.trim);
  const n = Math.max(3, Math.round(front.len / S.bay) | 1);
  const bw = front.len / n;
  const mid = (n - 1) / 2;
  B.on(front, (lit, raw) => {
    for (let i = 0; i <= n; i++) slab(lit, S.trim, i * bw - 0.3, i * bw + 0.3, base + 0.7, base + S.cornice, 0, 0.22);
    for (let i = 0; i < n; i++) {
      const x = (i + 0.5) * bw;
      win(front, lit, raw, x, base, Math.min(2.6, bw - 1), 4.8, 'arch', S.trim, i === mid ? 'door' : 'glass');
      win(front, lit, raw, x, base + 7.3, 1.5, 3.5, i === mid ? 'arch' : 'rect', S.trim);
      slab(lit, S.trim, x - 1.15, x + 1.15, base + 7.05, base + 7.3, 0, 0.6); // balconette
      win(front, lit, raw, x, base + S.cornice + 1.0, 0.9, 0.9, 'round', S.trim); // attic oculi
    }
    const pw = Math.min(front.len, 3 * bw);
    pediment(lit, front.len / 2 - pw / 2, front.len / 2 + pw / 2, roofY + 0.6, S.height - (S.cornice + 2.8), 0, S.wall, S.trim);
  });
  return B.out();
}

// ── Teatro Dom Pedro V ──

function teatro(rec: BuildingRec, ctx: LandmarkCtx): BuildOut {
  const S = M.teatro;
  const ring = prep(rec);
  if (!ring) return EMPTY;
  const edges = edgesOf(ring);
  const front = facing(edges, S.az);
  const base = edgeGround(new Build(ctx, 0, 1), front);
  const P = S.portico;
  const B = new Build(ctx, base, S.walls + S.roof);
  const yb = ctx.minGround - L.sink;
  const wallTop = base + S.walls;
  body(B, ring, yb, wallTop, wallTop, S.wall, S.roofCol, new Set(), edges);
  roof(B, ring, base, S.walls, S.roof, 'hipped', S.roofCol);
  cornice(B.lit, ring, yb, base + 0.8, 0.15, S.trim);
  cornice(B.lit, ring, base + 4.9, base + 5.2, 0.18, S.trim);
  cornice(B.lit, ring, wallTop - 0.8, wallTop, 0.4, S.trim);
  for (const e of edges) {
    if (e === front) continue;
    rows(B, e, base, S.bay, [[1.3, 2.6, 1.3, 'rect'], [6.0, 3.0, 1.3, 'arch']], S.trim);
    if (e.len > 4) B.on(e, (lit) => {
      const n = Math.max(1, Math.floor(e.len / S.bay));
      for (let i = 0; i <= n; i++) slab(lit, S.trim, (i * e.len) / n - 0.25, (i * e.len) / n + 0.25, base + 0.8, wallTop - 0.8, 0, 0.15);
    });
  }
  const cx = front.len / 2;
  const pw = Math.min(P.width, front.len - 2);
  B.on(front, (lit, raw) => {
    const n = Math.max(3, Math.floor(front.len / S.bay));
    for (let i = 0; i < n; i++) {
      const x = ((i + 0.5) * front.len) / n;
      if (Math.abs(x - cx) < pw / 2 + 0.5) continue;
      win(front, lit, raw, x, base + 1.3, 1.3, 2.6, 'rect', S.trim);
      win(front, lit, raw, x, base + 6, 1.3, 3, 'arch', S.trim);
    }
    for (let i = 0; i <= n; i++) slab(lit, S.trim, (i * front.len) / n - 0.25, (i * front.len) / n + 0.25, base + 0.8, wallTop - 0.8, 0, 0.15);
    // portico: three arched doors behind paired columns, entablature, pediment
    for (const dx of [-pw / 3, 0, pw / 3]) win(front, lit, raw, cx + dx, base, dx ? 1.8 : 2.2, dx ? 4 : 4.6, 'arch', S.trim, 'door');
    for (let i = 0; i < P.columns; i++) {
      const x = cx - pw / 2 + 0.6 + ((pw - 1.2) * i) / (P.columns - 1);
      for (const s of [-P.pair / 2, P.pair / 2]) column(B, front, lit, x + s, 1.0, base, base + P.height, P.r, S.trim);
    }
    const ye = base + P.height;
    slab(lit, S.trim, cx - pw / 2 - 0.2, cx + pw / 2 + 0.2, ye, ye + P.entablature, 0, 1.6);
    slab(lit, S.wall, cx - pw / 2, cx + pw / 2, ye + 0.25, ye + P.entablature - 0.3, 1.6, 1.65); // frieze
    pediment(lit, cx - pw / 2 - 0.2, cx + pw / 2 + 0.2, ye + P.entablature, P.pediment, 1.1, S.wall, S.trim);
    slab(lit, S.trim, cx - pw / 2 - 0.3, cx + pw / 2 + 0.3, base - 0.6, base + 0.12, 0, 2.2); // portico floor
  });
  return B.out();
}

// ── Quartel dos Mouros ──

function quartel(rec: BuildingRec, ctx: LandmarkCtx): BuildOut {
  const S = M.quartel;
  const ring = prep(rec);
  if (!ring) return EMPTY;
  const edges = edgesOf(ring);
  const front = facing(edges, S.az);
  let base = -Infinity;
  for (let i = 0; i < ring.length; i += 2) base = Math.max(base, ctx.height(ring[i]!, ring[i + 1]!));
  base += 0.4; // the podium terrace: the building stands on the highest ground of its outline
  const H = 2 * S.storey + S.parapet;
  const B = new Build(ctx, base, H);
  const yb = ctx.minGround - L.sink;
  const top = base + H;
  body(B, ring, yb, top, top - S.parapet, S.wall, S.roof, new Set(), edges);
  cornice(B.lit, ring, yb, base + 0.2, 0.3, S.podium);
  cornice(B.lit, ring, base + S.storey - 0.1, base + S.storey + 0.3, 0.3, S.trim);
  cornice(B.lit, ring, top - S.parapet - 0.4, top - S.parapet, 0.35, S.trim);
  for (const e of edges) {
    const n = Math.max(1, Math.round(e.len / S.bay));
    const bw = e.len / n;
    const arcade = e.len > 30;
    const t = S.tower.size;
    B.on(e, (lit, raw) => {
      for (let i = 0; i < n; i++) {
        const x = (i + 0.5) * bw;
        if (x < t + 0.3 || x > e.len - t - 0.3) continue; // under the corner towers
        for (const k of [0, 1]) {
          const y = base + k * S.storey + (arcade ? 0.3 : 1.2);
          const h = arcade ? S.storey - 1.1 : S.storey - 2.6;
          win(e, lit, raw, x, y, arcade ? S.arch : 1.2, h, 'pointed', S.trim);
          if (arcade && k === 1) slab(lit, S.trim, x - bw / 2, x + bw / 2, y - 0.3, y + 0.75, 0, 0.3); // veranda parapet
        }
      }
      const M2 = S.merlon;
      for (let x = M2.gap; x + M2.w < e.len; x += M2.w + M2.gap) slab(lit, S.wall, x, x + M2.w, top, top + M2.h, -0.35, 0, 'near');
    });
  }
  // corner towers: `proud` m out of both walls, in front of the 0.3 / 0.35 m cornices and veranda parapets (at 0.3 m they
  // were coplanar: z-fighting stripes across the towers), one storey higher, merlons
  const T = S.tower;
  for (const e of edges) {
    const tr = localRing(e, -T.proud, T.size - T.proud, -T.size + T.proud, T.proud);
    const tt = top + T.extra;
    renderPart({ outer: tr, kind: 'yes', height: tt - base, colour: S.wall, roofColour: S.roof }, { ground: base, height: ctx.height, fallbackTop: tt - base }, B.lit);
    cornice(B.lit, tr, yb, base + 0.2, 0.3, S.podium);
    cornice(B.lit, tr, tt - 0.5, tt, 0.25, S.trim);
    for (const te of edgesOf(tr)) {
      B.on(te, (lit, raw) => {
        win(te, lit, raw, te.len / 2, base + S.storey + 1.4, 0.9, 2.2, 'pointed', S.trim);
        win(te, lit, raw, te.len / 2, top + 0.4, 0.7, 1.6, 'pointed', S.trim);
        for (let x = 0.15; x + 0.5 < te.len; x += 1.15) slab(lit, S.wall, x, x + 0.5, tt, tt + 0.7, -0.3, 0, 'near');
      });
    }
  }
  const St = S.stair;
  const cx = front.len / 2;
  const g = B.ground(front, cx, 3);
  if (base - g > 0.3) stairs(B, front, cx, St.width, base, g - 0.05, St.riser, St.tread, S.podium);
  return B.out();
}

// ── Casa do Mandarim ──

/** Ring clipped to the half plane u·p ≥ c (keep 1) or ≤ c (keep −1). */
export function clipHalf(ring: XZ, ux: number, uz: number, c: number, keep: 1 | -1): XZ {
  const out: number[] = [];
  const d = (i: number) => keep * (ring[i]! * ux + ring[i + 1]! * uz - c);
  for (let i = 0, n = ring.length; i < n; i += 2) {
    const j = (i + 2) % n;
    const [di, dj] = [d(i), d(j)];
    if (di >= 0) out.push(ring[i]!, ring[i + 1]!);
    if (di >= 0 !== dj >= 0) {
      const t = di / (di - dj);
      out.push(ring[i]! + (ring[j]! - ring[i]!) * t, ring[i + 1]! + (ring[j + 1]! - ring[i + 1]!) * t);
    }
  }
  return out;
}
/** The outline cut across its long axis into consecutive pieces of the given shares (hall, court, hall, …). */
export function slices(ring: XZ, shares: readonly number[]) {
  const f = footprintFrame(ring);
  const sum = shares.reduce((a, b) => a + b, 0);
  const c0 = f.cx * f.ux + f.cz * f.uz - f.a;
  let acc = 0;
  return shares.map((s, i) => {
    const [a, b] = [c0 + (2 * f.a * acc) / sum, c0 + (2 * f.a * (acc + s)) / sum];
    acc += s;
    const piece = clipHalf(clipHalf(ring, f.ux, f.uz, a, 1), f.ux, f.uz, b, -1);
    return { piece: piece.length >= 6 && ringArea(piece) > 1 ? piece : undefined, a, b, hall: i % 2 === 0, f };
  });
}
function mandarimHouse(rec: BuildingRec, ctx: LandmarkCtx): BuildOut {
  const S = M.mandarim;
  const ring = prep(rec);
  if (!ring) return EMPTY;
  const B = new Build(ctx, ctx.ground, S.walls + S.roof3);
  const yb = ctx.minGround - L.sink;
  const parts = slices(ring, S.plan);
  // each hall / court on the highest ground under it (the outline climbs ≈ 6.6 m of DEM: one floor for all left the east court's
  // paving and the doors facing it up to 3 m under the terrain); a door on a cut stands on the higher of its two floors
  const floor = parts.map((p) => (p.piece ? maxInside(p.piece, ctx.height, 2) + 0.05 : -Infinity));
  let courts = 0;
  for (const [i, { piece, a, b, hall, f }] of parts.entries()) {
    if (!piece) continue;
    const base = floor[i]!;
    if (hall) {
      body(B, piece, yb, base + S.walls, base + S.walls, S.wall, S.roof);
      roof(B, grow(piece, S.eave), base, S.walls, S.roof3, 'gabled', S.roof); // tiled roof with overhanging eaves
      cornice(B.lit, piece, base + S.walls - 1.3, base + S.walls - 0.15, 0.04, S.plaster);
      cornice(B.lit, piece, yb, base + 0.5, 0.06, '#5d605f');
      const pf = footprintFrame(grow(piece, S.eave));
      const ridge = new Sink();
      const rb = paint(ridge, 'masonry', S.ridge);
      box(rb, -pf.a + 0.2, pf.a - 0.2, -0.05, 0.4, -0.2, 0.2);
      for (const s of [1, -1]) extrude(rb, [s * (pf.a - 1.6), -0.05, s * (pf.a + 0.25), -0.05, s * (pf.a + 0.55), 0.95, s * (pf.a - 0.3), 0.4], 'z', -0.18, 0.18);
      for (const m of ridge.out().meshes) B.put(place(m, pf, base + S.walls + S.roof3), true);
      for (const e of edgesOf(piece)) {
        if (e.len < 4) continue;
        if (onCut(e, f, [a, b])) {
          // hall front on a court: tall timber door, lattice windows (lit warm), two red lanterns under the eaves
          const sill = Math.max(base, floor[Math.abs(e.ax * f.ux + e.az * f.uz - a) < 0.05 ? i - 1 : i + 1] ?? -Infinity);
          B.on(e, (lit, raw) => {
            const xm = e.len / 2;
            win(e, lit, raw, xm, sill, 2, 3.4, 'rect', S.ridge, 'door');
            for (const s of [-1, 1]) {
              for (let k = 1; k <= 2; k++) if (xm + s * k * 3.2 > 1.2 && xm + s * k * 3.2 < e.len - 1.2) win(e, lit, raw, xm + s * k * 3.2, sill + 1, 1.8, 2.6, 'rect', S.ridge);
              box(paint(raw, 'neon', lin('#ff3a22', 1.6 * LT.emissiveScale)), xm + s * 1.9 - 0.2, xm + s * 1.9 + 0.2, sill + 3.8, sill + 4.4, 0.25, 0.65);
            }
          });
          continue;
        }
        const n = Math.floor(e.len / 5);
        B.on(e, (lit, raw) => {
          for (let i = 0; i < n; i++) win(e, lit, raw, ((i + 0.5) * e.len) / n, base + 3.6, 0.9, 1.5, 'rect', S.plaster);
        });
      }
    } else {
      for (const e of edgesOf(piece)) {
        if (onCut(e, f, [a, b])) continue;
        const [bx, bz] = at(e, e.len, 0);
        const n: V3 = [-e.uz, 0, e.ux];
        const wall = paint(B.lit, 'masonry', S.wall);
        const yt = base + S.courtWall;
        quadOut(wall, [e.ax, yb, e.az], [bx, yb, bz], [bx, yt, bz], [e.ax, yt, e.az], n);
        quadOut(paint(B.lit, 'masonry', S.wall), [e.ax, base - 0.2, e.az], [bx, base - 0.2, bz], [bx, yt, bz], [e.ax, yt, e.az], [-n[0], 0, -n[2]]);
      }
      cornice(B.lit, piece, base + S.courtWall, base + S.courtWall + 0.3, 0.2, S.roof);
      cap(paint(B.raw, 'masonry', '#9b9890'), piece, base + 0.05, 1); // granite-paved court
      B.lit.prism([piece], yb, base + S.courtWall);
      if (courts++ === 0) moonGate(B, piece, f, (a + b) / 2, base);
    }
  }
  return B.out();
}
/** Is the edge on one of the cut lines u·p = c (a piece's side shared with its neighbour)? */
function onCut(e: Edge, f: { ux: number; uz: number }, cuts: number[]) {
  const [bx, bz] = at(e, e.len, 0);
  return cuts.some((c) => Math.abs(e.ax * f.ux + e.az * f.uz - c) < 0.05 && Math.abs(bx * f.ux + bz * f.uz - c) < 0.05);
}
/** Plastered cross wall through the court at u = c with a round moon gate, tile coping, two red lanterns. */
function moonGate(B: Build, piece: XZ, f: { ux: number; uz: number }, c: number, base: number) {
  const G = M.mandarim.moon;
  const [wx, wz] = [-f.uz, f.ux];
  let [w0, w1] = [Infinity, -Infinity];
  const line = clipHalf(clipHalf(piece, f.ux, f.uz, c - 0.01, 1), f.ux, f.uz, c + 0.01, -1);
  for (let i = 0; i < line.length; i += 2) [w0, w1] = [Math.min(w0, line[i]! * wx + line[i + 1]! * wz), Math.max(w1, line[i]! * wx + line[i + 1]! * wz)];
  if (!(w1 - w0 > 2 * G.r + 1)) return;
  const e: Edge = { ax: c * f.ux + w0 * wx, az: c * f.uz + w0 * wz, len: w1 - w0, ux: wx, uz: wz };
  const xm = e.len / 2;
  const cy = base + G.sill + G.r;
  const arc = (from: number, to: number) => Array.from({ length: 9 }, (_, k) => {
    const a = from + ((to - from) * k) / 8;
    return [xm + G.r * Math.cos(a), cy + G.r * Math.sin(a)];
  }).flat();
  const half = (s: 1 | -1) => (s < 0
    ? [0, base - 0.3, xm, base - 0.3, xm, cy - G.r, ...arc(-Math.PI / 2, -Math.PI * 1.5).slice(2, -2), xm, cy + G.r, xm, base + G.h, 0, base + G.h]
    : [xm, base - 0.3, e.len, base - 0.3, e.len, base + G.h, xm, base + G.h, xm, cy + G.r, ...arc(Math.PI / 2, -Math.PI / 2).slice(2, -2), xm, cy - G.r]);
  B.on(e, (lit, raw) => {
    for (const s of [-1, 1] as const) extrude(paint(lit, 'masonry', M.mandarim.plaster), half(s), 'z', -0.2, 0.2);
    slab(lit, M.mandarim.roof, -0.1, e.len + 0.1, base + G.h, base + G.h + 0.25, -0.45, 0.45);
    const lb = paint(raw, 'neon', lin('#ff3a22', 1.6 * LT.emissiveScale)); // red lanterns (unlit, bloom)
    for (const s of [-1, 1]) box(lb, xm + s * (G.r + 0.7) - 0.22, xm + s * (G.r + 0.7) + 0.22, cy + 0.58, cy + 1.22, 0.22, 0.64);
  });
  B.colliders.push(prismCollider(localRing(e, 0, e.len, -0.2, 0.2), base - 0.3, base + G.sill));
}
function mandarimSite(rec: BuildingRec, ctx: LandmarkCtx): BuildOut {
  const S = M.mandarim;
  const r0 = partRings(rec)?.[0];
  if (!r0) return EMPTY;
  const ring = grow(simplify(r0, M.simplify), -0.6);
  if (!(ringArea(ring) > 0)) return EMPTY;
  const B = new Build(ctx, ctx.ground, S.siteWall);
  // pieces of every edge between the gates (OSM footways through the site wall)
  const pieces = edgesOf(ring).flatMap((e0) => {
    const cuts = S.gates.map(([gx, gz]) => [(gx - e0.ax) * e0.ux + (gz - e0.az) * e0.uz, Math.abs(-(gx - e0.ax) * e0.uz + (gz - e0.az) * e0.ux)] as const)
      .filter(([t, d]) => d < 3 && t > 0 && t < e0.len).map(([t]) => t).sort((p, q) => p - q);
    const out: Edge[] = [];
    let t0 = 0;
    for (const t of [...cuts, e0.len + S.gateWidth / 2]) {
      const t1 = Math.min(e0.len, t - S.gateWidth / 2);
      if (t1 - t0 > 0.1) out.push({ ...e0, ax: e0.ax + e0.ux * t0, az: e0.az + e0.uz * t0, len: t1 - t0 });
      t0 = t + S.gateWidth / 2;
    }
    return out;
  });
  for (const e of pieces) {
    const [bx, bz] = at(e, e.len, 0);
    const [ga, gb] = [ctx.height(e.ax, e.az), ctx.height(bx, bz)];
    const [ta, tb] = [ga + S.siteWall, gb + S.siteWall];
    const n: V3 = [-e.uz, 0, e.ux];
    quadOut(paint(B.lit, 'masonry', S.wall), [e.ax, ga - 0.5, e.az], [bx, gb - 0.5, bz], [bx, tb, bz], [e.ax, ta, e.az], n);
    quadOut(paint(B.lit, 'masonry', S.wall), [e.ax, ga - 0.5, e.az], [bx, gb - 0.5, bz], [bx, tb, bz], [e.ax, ta, e.az], [-n[0], 0, -n[2]]);
    const cop = paint(B.lit, 'masonry', S.roof);
    const [o0, o1] = [at(e, 0, 0.25), at(e, e.len, 0.25)];
    const [i0, i1] = [at(e, 0, -0.25), at(e, e.len, -0.25)];
    quadOut(cop, [o0[0], ta, o0[1]], [o1[0], tb, o1[1]], [i1[0], tb + 0.25, i1[1]], [i0[0], ta + 0.25, i0[1]], [n[0], 1, n[2]]);
    quadOut(cop, [i0[0], ta, i0[1]], [i1[0], tb, i1[1]], [o1[0], tb + 0.25, o1[1]], [o0[0], ta + 0.25, o0[1]], [-n[0], 1, -n[2]]);
    B.colliders.push({ vertices: new Float32Array([e.ax, ga - 0.5, e.az, bx, gb - 0.5, bz, bx, tb, bz, e.ax, ta, e.az]), indices: new Uint32Array([0, 1, 2, 0, 2, 3]) });
  }
  return B.out();
}

// ── churches ──

/** Depth of the ring behind an edge (max distance inwards). */
const depthBehind = (ring: XZ, e: Edge) => {
  let d = 0;
  for (let i = 0; i < ring.length; i += 2) d = Math.max(d, -((ring[i]! - e.ax) * -e.uz + (ring[i + 1]! - e.az) * e.ux));
  return d;
};

function saoDomingos(rec: BuildingRec, ctx: LandmarkCtx): BuildOut {
  const S = M.domingos;
  const ring = prep(rec);
  if (!ring) return EMPTY;
  const edges = edgesOf(ring);
  const front = facing(edges, S.az);
  const base = edgeGround(new Build(ctx, 0, 1), front);
  const B = new Build(ctx, base, S.facade);
  const yb = ctx.minGround - L.sink;
  const wallTop = base + S.walls;
  body(B, ring, yb, wallTop, wallTop, S.wall, S.roof, new Set(), edges);
  roof(B, ring, base, S.walls, S.ridge - S.walls, 'gabled', S.roof);
  cornice(B.lit, ring, yb, base + 0.6, 0.15, '#9a948a');
  cornice(B.lit, ring, wallTop - 0.7, wallTop, 0.35, S.trim);
  for (const e of edges) if (e !== front) rows(B, e, base, 5, [[7.5, 3.6, 1.6, 'arch']], S.trim, 'shutter');
  const len = front.len;
  const [t1, t2, t3, ped] = [base + 7.4, base + 14, base + 17.6, base + S.facade];
  const inset = Math.min(3.4, len * 0.17);
  B.on(front, (lit, raw) => {
    const z = 0.7;
    extrude(paint(lit, 'masonry', S.wall), [0, yb, len, yb, len, t2 + 0.4, len - inset, t2 + 1.9, len - inset, t3, inset, t3, inset, t2 + 1.9, 0, t2 + 0.4], 'z', 0, z);
    const P = [0.35, len / 2 - 3.3, len / 2 + 3.3, len - 0.35];
    for (const x of P) for (const d of [-0.4, 0.4]) slab(lit, S.trim, x + d - 0.22, x + d + 0.22, base + 0.6, t2, z, z + 0.22);
    for (const y of [t1, t2]) slab(lit, S.trim, -0.15, len + 0.15, y, y + 0.5, z, z + 0.4);
    slab(lit, S.trim, -0.1, len + 0.1, yb, base + 0.6, z, z + 0.2);
    for (const x of [inset + 0.3, len - inset - 0.3]) slab(lit, S.trim, x - 0.25, x + 0.25, t2 + 0.5, t3, z, z + 0.2);
    slab(lit, S.trim, inset - 0.2, len - inset + 0.2, t3, t3 + 0.45, z, z + 0.4);
    pediment(lit, inset, len - inset, t3 + 0.45, ped - t3 - 0.45, z, S.wall, S.trim);
    cross(lit, len / 2, ped + 0.4, z + 0.2, 2, S.trim);
    // volutes: sloped copings on the shoulders
    for (const s of [0, 1]) {
      const [xa, xb] = s ? [len - inset, len] : [inset, 0];
      extrude(paint(lit, 'masonry', S.trim), [xa, t2 + 1.9, xb, t2 + 0.4, xb, t2 + 0.8, xa, t2 + 2.3], 'z', 0, z + 0.3);
    }
    win(front, lit, raw, len / 2, base, 2.6, 5.4, 'arch', S.trim, 'shutter', z);
    for (const s of [-1, 1]) {
      win(front, lit, raw, len / 2 + s * 5.8, base + 0.6, 1.6, 3.8, 'rect', S.trim, 'shutter', z);
      win(front, lit, raw, len / 2 + s * 5.8, base + 9, 1.4, 3, 'rect', S.trim, 'shutter', z);
    }
    win(front, lit, raw, len / 2, base + 8.7, 1.8, 3.8, 'arch', S.trim, 'glass', z);
    slab(lit, S.trim, len / 2 - 1.6, len / 2 + 1.6, base + 8.45, base + 8.7, z, z + 0.8); // balcony
    win(front, lit, raw, len / 2, base + 14.9, 1.5, 1.5, 'round', S.trim, 'glass', z);
  });
  // bell tower at the rear corner on the right of the façade (est. position)
  const T = S.tower;
  const D = depthBehind(ring, front);
  const tr = localRing(front, len - T.size - 0.6, len - 0.6, -D + 1, -D + 1 + T.size);
  tower(B, tr, yb, base, base + T.height, 2.4, S.wall, S.trim, S.roof, [base + T.height - 5.5, base + T.height - 1.5]);
  return B.out();
}

function seCatedral(rec: BuildingRec, ctx: LandmarkCtx): BuildOut {
  const S = M.se;
  const ring = prep(rec);
  if (!ring) return EMPTY;
  const edges = edgesOf(ring);
  const front = facing(edges, S.az);
  const base = edgeGround(new Build(ctx, 0, 1), front);
  const B = new Build(ctx, base, S.tower.height);
  const yb = ctx.minGround - L.sink;
  const wallTop = base + S.walls;
  body(B, ring, yb, wallTop, wallTop, S.wall, S.roof, new Set(), edges);
  roof(B, ring, base, S.walls, S.ridge - S.walls, 'gabled', S.roof);
  cornice(B.lit, ring, yb, base + 0.7, 0.15, '#9a948a');
  cornice(B.lit, ring, wallTop - 0.7, wallTop, 0.35, S.trim);
  for (const e of edges) if (e !== front) rows(B, e, base, 5, [[6.5, 5, 1.8, 'arch']], S.trim);
  const len = front.len;
  const T = S.tower;
  const tw = Math.min(T.w, len * 0.26);
  const g1 = base + S.gable - 4;
  B.on(front, (lit, raw) => {
    const z = 0.5;
    extrude(paint(lit, 'masonry', S.wall), [tw, yb, len - tw, yb, len - tw, g1, len / 2, base + S.gable, tw, g1], 'z', 0, z);
    pediment(lit, tw, len - tw, g1, S.gable - (g1 - base), z, S.wall, S.trim);
    cross(lit, len / 2, base + S.gable + 0.4, z, 2.4, S.trim);
    slab(lit, S.trim, tw, len - tw, base + 7.4, base + 7.9, z, z + 0.4);
    for (const x of [tw + 0.4, len - tw - 0.4]) slab(lit, S.trim, x - 0.3, x + 0.3, base + 0.7, g1, z, z + 0.25);
    win(front, lit, raw, len / 2, base, 3.2, 6.4, 'arch', S.trim, 'door', z);
    win(front, lit, raw, len / 2, base + 9, 2.6, 5, 'arch', S.trim, 'glass', z);
    for (const s of [-1, 1]) win(front, lit, raw, len / 2 + s * (len / 2 - tw) * 0.55, base + 9.5, 1.3, 3.6, 'arch', S.trim, 'glass', z);
  });
  // twin towers on the façade corners, 0.4 m proud of the façade wall, as deep as the outline behind them (leg 2 audit: the
  // outline steps in 4.8 m behind the east corner, a square tower stood 2 m inside the neighbouring house); cap 0 = flat
  // top behind a balustrade (Commons "Cathedral of the Nativity of Our Lady of Macau, 2023 (01).jpg"), else pyramid + cross
  for (const [x0, x1] of [[-0.4, tw], [len - tw, len + 0.4]] as const) {
    let d = tw;
    while (d > 2 && ![x0 + 1, (x0 + x1) / 2, x1 - 1].every((x) => inRing(...at(front, x, -d), ring))) d -= 0.25;
    const tr = localRing(front, x0, x1, -d, 0.9);
    tower(B, tr, yb, base, base + T.height - T.cap, T.cap, S.wall, S.trim, S.roof, [base + T.height - T.cap - 6.5, base + T.height - T.cap - 1.8]);
    cornice(B.lit, tr, base + 7.4, base + 7.9, 0.2, S.trim);
    cornice(B.lit, tr, yb, base + 0.7, 0.15, '#9a948a');
    const te = edgesOf(tr);
    if (T.cap > 0) B.on(front, (lit) => cross(lit, (x0 + x1) / 2, base + T.height - 0.1, 0.9 - (d + 0.9) / 2, 1.8, S.trim));
    else for (const e of te) B.on(e, (lit) => balustrade(lit, 0, e.len, base + T.height, 1, 0, S.trim));
    for (const e of te) B.on(e, (lit, raw) => win(e, lit, raw, e.len / 2, base + 9.5, 1.2, 3.2, 'arch', S.trim));
  }
  const fp = rec.points?.find((p) => p.kind === 'fountain');
  if (fp) fountain(B, fp.x, fp.z, { r: S.fountain.r, wall: S.fountain.wall, top: 1.7, water: '#2d4b52', glow: M.largo.fountain.glow }, '#e3ddcf');
  return B.out();
}

export const details: Partial<Record<LandmarkId, DetailFn>> = {
  'leal-senado': (rec: BuildingRec, _p: PartRec[], ctx: LandmarkCtx) => lealSenado(rec, ctx),
  'largo-senado': (rec: BuildingRec, _p: PartRec[], ctx: LandmarkCtx) => largoSenado(rec, ctx),
  'santa-casa': (rec: BuildingRec, _p: PartRec[], ctx: LandmarkCtx) => santaCasa(rec, ctx),
  'teatro-dom-pedro': (rec: BuildingRec, _p: PartRec[], ctx: LandmarkCtx) => teatro(rec, ctx),
  'quartel-mouros': (rec: BuildingRec, _p: PartRec[], ctx: LandmarkCtx) => quartel(rec, ctx),
  'casa-mandarim': (rec: BuildingRec, _p: PartRec[], ctx: LandmarkCtx) => (rec.kind === 'artwork' ? mandarimSite(rec, ctx) : mandarimHouse(rec, ctx)),
  'sao-domingos': (rec: BuildingRec, _p: PartRec[], ctx: LandmarkCtx) => saoDomingos(rec, ctx),
  'se-catedral': (rec: BuildingRec, _p: PartRec[], ctx: LandmarkCtx) => seCatedral(rec, ctx),
};
