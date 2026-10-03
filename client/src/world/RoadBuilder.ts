// Package C: road ribbons, raised sidewalks with curbs, white lane markings from RoadRecs (docs/plans/phase2.md "C").
// Module top level must not touch the DOM: the worker imports build*(); canvas textures only inside create*().
// Layering: every ribbon is draped on ctx.height + lift; overlapping carriageways of one material share world-space
// uvs (so overlaps are invisible), different materials are ordered by polygonOffset (sidewalk < asphalt < pave <
// marking). Sidewalks are raised slabs, cut where another carriageway crosses them, so crossing roads stay flat.
import { CanvasTexture, type Material, MeshStandardMaterial, RepeatWrapping, SRGBColorSpace } from 'three';
import { graphics8c, roads as C } from '../config.ts';
import type { RoadRec, XZ } from '../geo/chunkData.ts';
import type { Builder, MaterialId } from './buildTypes.ts';
import { pbrMaps } from './textures.ts';
import { hash01, MeshBuffer, offsetPolyline } from './geom.ts';

type WayLike = { kind: string; name?: string; width?: number; lanes?: number; oneway?: boolean; roundabout?: boolean; surface?: string };

/** Carriageway width (m): widthByName → width tag → lanes × laneWidth → per-kind table. */
export function roadWidth(r: WayLike): number {
  const byName = r.name === undefined ? undefined : C.widthByName[r.name];
  if (byName !== undefined && (!r.oneway || r.roundabout)) return byName; // a oneway half keeps its own width
  return r.width ?? (r.lanes ? r.lanes * C.laneWidth : (C.widthByKind[r.kind] ?? C.defaultWidth));
}

/** Raised sidewalk width (m) on each side; 0 for kinds without sidewalks. Like roadWidth, a oneway half of a dual
 *  carriageway ignores sidewalkByName (the Champs' 21 m sidewalks would cover the other half). */
export function sidewalkWidth(r: WayLike): number {
  if (!C.sidewalkKinds.includes(r.kind)) return 0;
  const byName = r.name === undefined ? undefined : C.sidewalkByName[r.name];
  return byName !== undefined && (!r.oneway || r.roundabout) ? byName : C.sidewalkWidth;
}

/** Centre-line distance from the middle of p to the nearest roughly parallel (|cos| ≥ minCos) way of `others` on its
 *  left and right, Infinity if none; only segments the middle projects onto count. Dual carriageways, parallel decks. */
export function sideGaps(p: Path, others: readonly { pts: XZ }[], minCos: number): [number, number] {
  const out: [number, number] = [Infinity, Infinity];
  const [mx, mz] = p.at(0, p.length / 2);
  const [dx, dz] = p.dir(p.length / 2);
  for (const o of others) {
    for (let i = 0; i + 3 < o.pts.length; i += 2) {
      const [ax, az, ux, uz] = [o.pts[i]!, o.pts[i + 1]!, o.pts[i + 2]! - o.pts[i]!, o.pts[i + 3]! - o.pts[i + 1]!];
      const l2 = ux * ux + uz * uz;
      const t = ((mx - ax) * ux + (mz - az) * uz) / l2;
      if (!(t >= 0 && t <= 1) || Math.abs(ux * dx + uz * dz) < minCos * Math.sqrt(l2)) continue;
      const [qx, qz] = [ax + t * ux - mx, az + t * uz - mz];
      const side = qx * dz - qz * dx > 0 ? 0 : 1; // left normal (dz, −dx)
      out[side] = Math.min(out[side], Math.hypot(qx, qz));
    }
  }
  return out;
}

/** Top surface material of a way. */
export function surfaceOf(r: WayLike): MaterialId {
  if (r.surface !== undefined && C.paveSurfaces.includes(r.surface)) return 'pave';
  return C.footKinds.includes(r.kind) ? 'sidewalk' : 'asphalt';
}

/** Lanes used for markings: the lanes tag, else what fits (two-way) or 1 (oneway). */
const laneCount = (r: WayLike, w: number) => r.lanes ?? (r.oneway ? 1 : Math.max(1, Math.floor(w / C.laneWidth)));

/** Height of a ribbon vertex; s = arc length along the centre line (bridges interpolate on it). */
export type YFn = (x: number, z: number, s: number) => number;
type Range = [number, number];

/** A centre line with arc lengths and cached offset lines (offsetPolyline with the chunk-split neighbours). */
export class Path {
  readonly n: number;
  readonly s: number[] = [0];
  private readonly lines = new Map<number, XZ>();

  constructor(
    readonly pts: XZ,
    readonly before?: [number, number],
    readonly after?: [number, number],
  ) {
    this.n = pts.length / 2;
    for (let i = 1; i < this.n; i++) {
      this.s.push(this.s[i - 1]! + Math.hypot(pts[2 * i]! - pts[2 * i - 2]!, pts[2 * i + 1]! - pts[2 * i - 1]!));
    }
  }

  get length() {
    return this.s[this.n - 1]!;
  }

  line(d: number): XZ {
    let l = this.lines.get(d);
    if (!l) this.lines.set(d, (l = offsetPolyline(this.pts, d, this.before, this.after)));
    return l;
  }

  private seg(s: number) {
    let i = 0;
    while (i < this.n - 2 && this.s[i + 1]! < s) i++;
    const len = this.s[i + 1]! - this.s[i]!;
    return { i, t: len > 1e-9 ? Math.min(1, Math.max(0, (s - this.s[i]!) / len)) : 0 };
  }

  /** Point at arc length s on the line offset by d (straight between the mitred vertices). */
  at(d: number, s: number): [number, number] {
    const l = this.line(d);
    const { i, t } = this.seg(s);
    return [l[2 * i]! + (l[2 * i + 2]! - l[2 * i]!) * t, l[2 * i + 1]! + (l[2 * i + 3]! - l[2 * i + 1]!) * t];
  }

  /** Unit travel direction at arc length s (at a vertex: of the segment it starts). */
  dir(s: number): [number, number] {
    const { i } = this.seg(s);
    const dx = this.pts[2 * i + 2]! - this.pts[2 * i]!;
    const dz = this.pts[2 * i + 3]! - this.pts[2 * i + 1]!;
    const l = Math.hypot(dx, dz) || 1;
    return [dx / l, dz / l];
  }

  /** Stations covering [a, b]: a, every vertex inside, b, subdivided so no step exceeds max. */
  stations(a: number, b: number, max: number): number[] {
    const cuts = [a, ...this.s.filter((v) => v > a && v < b), b];
    const out = [a];
    for (let k = 1; k < cuts.length; k++) {
      const [p, q] = [cuts[k - 1]!, cuts[k]!];
      const m = Math.max(1, Math.ceil((q - p) / max));
      for (let j = 1; j <= m; j++) out.push(p + ((q - p) * j) / m);
    }
    return out;
  }
}

/** Horizontal ribbon between offsets d0 < d1 over arc length [a, b], y(x, z, s) + off, facing up (or down).
 *  Subdivided along and across to ≤ max. uv = world xz in metres, so overlapping ribbons texture identically. */
export function strip(buf: MeshBuffer, p: Path, a: number, b: number, d0: number, d1: number, y: YFn, off: number, max: number, down = false) {
  if (b - a < 1e-3 || d1 - d0 < 1e-3) return;
  const m = Math.max(1, Math.ceil((d1 - d0) / max));
  let prev = -1;
  for (const s of p.stations(a, b, max)) {
    const [x0, z0] = p.at(d0, s);
    const [x1, z1] = p.at(d1, s);
    const base = buf.vertexCount;
    for (let k = 0; k <= m; k++) {
      const x = x0 + ((x1 - x0) * k) / m;
      const z = z0 + ((z1 - z0) * k) / m;
      buf.vertex(x, y(x, z, s) + off, z, 0, down ? -1 : 1, 0, x, z);
    }
    if (prev >= 0) {
      for (let k = 0; k < m; k++) {
        if (down) {
          buf.face(prev + k, base + k + 1, base + k);
          buf.face(prev + k, prev + k + 1, base + k + 1);
        } else {
          buf.face(prev + k, base + k, base + k + 1);
          buf.face(prev + k, base + k + 1, prev + k + 1);
        }
      }
    }
    prev = base;
  }
}

/** Vertical face along the line at offset d over [a, b], from y + yb to y + yt, facing left of travel (side 1) or right (−1). */
export function wall(buf: MeshBuffer, p: Path, a: number, b: number, d: number, y: YFn, yb: number, yt: number, side: 1 | -1, max: number) {
  if (b - a < 1e-3) return;
  const st = p.stations(a, b, max);
  for (let j = 1; j < st.length; j++) {
    const [s0, s1] = [st[j - 1]!, st[j]!];
    const [x0, z0] = p.at(d, s0);
    const [x1, z1] = p.at(d, s1);
    const [h0, h1] = [y(x0, z0, s0), y(x1, z1, s1)];
    if (side === 1) buf.quad([x1, h1 + yb, z1], [x0, h0 + yb, z0], [x0, h0 + yt, z0], [x1, h1 + yt, z1], s1, yb, s0, yt);
    else buf.quad([x0, h0 + yb, z0], [x1, h1 + yb, z1], [x1, h1 + yt, z1], [x0, h0 + yt, z0], s0, yb, s1, yt);
  }
}

/** Vertical end face across offsets d0 < d1 at arc length s, facing along travel (dir 1) or back (−1). */
export function cap(buf: MeshBuffer, p: Path, s: number, d0: number, d1: number, y: YFn, yb: number, yt: number, dir: 1 | -1) {
  const [x0, z0] = p.at(d0, s);
  const [x1, z1] = p.at(d1, s);
  const [h0, h1] = [y(x0, z0, s), y(x1, z1, s)];
  const A = [x0, h0 + yb, z0] as const;
  const B = [x1, h1 + yb, z1] as const;
  const Ct = [x1, h1 + yt, z1] as const;
  const D = [x0, h0 + yt, z0] as const;
  if (dir === 1) buf.quad(A, B, Ct, D, d0, yb, d1, yt);
  else buf.quad(B, A, D, Ct, d1, yb, d0, yt);
}

/** [a, b] minus the cut intervals. */
export function subtract(a: number, b: number, cuts: Range[]): Range[] {
  let out: Range[] = [[a, b]];
  for (const [c0, c1] of cuts) {
    out = out.flatMap(([p, q]): Range[] =>
      c1 <= p || c0 >= q ? [[p, q]] : ([[p, c0], [c1, q]] as Range[]).filter(([u, v]) => v - u > 0.05),
    );
  }
  return out;
}

/** Dashed white lines between the n lanes of a carriageway of half width h, outside the cut intervals. */
export function markings(buf: MeshBuffer, p: Path, h: number, n: number, cuts: Range[], y: YFn, off: number) {
  const { width, dash, gap } = C.centreLine;
  const dashes: Range[] = [];
  // ponytail: dash phase restarts on each chunk piece, a world-anchored phase if the jump shows
  for (let s = 0; s < p.length; s += dash + gap) dashes.push([s, Math.min(s + dash, p.length)]);
  const ranges = dashes.flatMap(([a, b]) => subtract(a, b, cuts));
  for (let k = 1; k < n; k++) {
    const d = -h + (2 * h * k) / n;
    for (const [a, b] of ranges) strip(buf, p, a, b, d - width / 2, d + width / 2, y, off, C.maxSegment);
  }
}

/** Raised sidewalk slab on one side (d ∈ [d0, d1], curb face at the carriageway edge) over the ranges. */
function sidewalk(buf: MeshBuffer, p: Path, ranges: Range[], d0: number, d1: number, left: boolean, y: YFn, seamA: boolean, seamB: boolean) {
  const top = C.lift + C.curbHeight;
  const max = C.maxSegment;
  const [inner, outer] = left ? [d0, d1] : [d1, d0];
  for (const [a, b] of ranges) {
    strip(buf, p, a, b, d0, d1, y, top, max);
    wall(buf, p, a, b, inner, y, 0, top, left ? -1 : 1, max); // curb faces the carriageway
    wall(buf, p, a, b, outer, y, -0.1, top, left ? 1 : -1, max);
    if (!(seamA && a < 1e-6)) cap(buf, p, a, d0, d1, y, -0.1, top, -1);
    if (!(seamB && b > p.length - 1e-6)) cap(buf, p, b, d0, d1, y, -0.1, top, 1);
  }
}

const unit = (x: number, z: number): [number, number] => {
  const l = Math.hypot(x, z);
  return l > 1e-9 ? [x / l, z / l] : [0, 0];
};

/** Point i of a road, or its chunk-split neighbour just past either end. */
const pointOf = (r: RoadRec, i: number): [number, number] | undefined =>
  i < 0 ? r.before : i >= r.pts.length / 2 ? r.after : [r.pts[2 * i]!, r.pts[2 * i + 1]!];

export const buildRoads: Builder = (chunk, ctx) => {
  const bufs = new Map<MaterialId, MeshBuffer>();
  const buf = (m: MaterialId) => bufs.get(m) ?? (bufs.set(m, new MeshBuffer(m)), bufs.get(m)!);
  const y: YFn = (x, z) => ctx.height(x, z);

  // Junction nodes by exact (0.1 m rounded) position.
  // ponytail: only roads of this chunk are seen, so a way meeting a road across a chunk split cuts nothing; pass
  // the neighbours' junction widths through the chunk data if curbs poke into crossings near chunk borders.
  const nodes = new Map<string, { r: RoadRec; i: number }[]>();
  for (const r of chunk.roads) {
    for (const i of r.junctions) {
      const k = `${r.pts[2 * i]},${r.pts[2 * i + 1]}`;
      nodes.get(k)?.push({ r, i }) ?? nodes.set(k, [{ r, i }]);
    }
  }

  for (const r of chunk.roads) {
    if (r.pts.length < 4) continue;
    const p = new Path(r.pts, r.before, r.after);
    const L = p.length;
    if (L < 0.1) continue;
    const w = roadWidth(r);
    const h = w / 2;
    const sw = sidewalkWidth(r);
    const cuts: [Range[], Range[]] = [[], []]; // left, right sidewalk
    const markCuts: Range[] = [];

    for (const i of r.junctions) {
      const J = pointOf(r, i)!;
      const prev = pointOf(r, i - 1) ?? J;
      const next = pointOf(r, i + 1) ?? J;
      const [dx, dz] = unit(next[0] - prev[0], next[1] - prev[1]);
      const sJ = p.s[i]!;
      const partners = (nodes.get(`${J[0]},${J[1]}`) ?? []).filter((o) => o.r !== r || o.i !== i);
      if (!partners.length) markCuts.push([sJ - C.centreLine.junctionCut, sJ + C.centreLine.junctionCut]); // partner in another chunk
      for (const o of partners) {
        const hR = roadWidth(o.r) / 2;
        const cutter = !C.footKinds.includes(o.r.kind) && 2 * hR >= C.minCutWidth;
        for (const q of [pointOf(o.r, o.i - 1), pointOf(o.r, o.i + 1)]) {
          if (!q) continue;
          const [ux, uz] = unit(q[0] - J[0], q[1] - J[1]);
          const sin = ux * dz - uz * dx; // u · left normal (dz, −dx)
          const cos = ux * dx + uz * dz;
          const as = Math.abs(sin);
          if (as < C.minCrossSin) continue; // continuation of this road
          const c = C.centreLine.junctionCut + hR / as;
          markCuts.push([sJ - c, sJ + c]);
          if (!cutter || !sw) continue;
          const e0 = (h * cos) / as;
          const e1 = ((h + sw) * cos) / as;
          cuts[sin > 0 ? 0 : 1].push([sJ + Math.min(e0, e1) - hR / as, sJ + Math.max(e0, e1) + hR / as]);
        }
      }
    }

    strip(buf(surfaceOf(r)), p, 0, L, -h, h, y, C.surfaceLift[surfaceOf(r)]!, C.maxSegment);
    if (sw) {
      const seamA = r.before !== undefined;
      const seamB = r.after !== undefined;
      // A oneway half gets no sidewalk on the side where its twin (same name) is too close for one (≈ symmetric halves).
      // ponytail: twins of this chunk only, measured at the piece's middle.
      const twins = r.oneway && !r.roundabout ? chunk.roads.filter((o) => o !== r && o.oneway && o.name === r.name && r.name) : [];
      const [gl, gr] = twins.length ? sideGaps(p, twins, C.minTwinCos) : [Infinity, Infinity];
      if (gl >= 2 * h + sw) sidewalk(buf('sidewalk'), p, subtract(0, L, cuts[0]), h, h + sw, true, y, seamA, seamB);
      if (gr >= 2 * h + sw) sidewalk(buf('sidewalk'), p, subtract(0, L, cuts[1]), -h - sw, -h, false, y, seamA, seamB);
    }
    const n = laneCount(r, w);
    if (!C.footKinds.includes(r.kind) && !r.roundabout && n >= 2) {
      markings(buf('marking'), p, h, n, markCuts, y, C.surfaceLift[surfaceOf(r)]! + C.markingLift); // Étoile: famously no lane markings
    }
  }
  return { meshes: [...bufs.values()].map((b) => b.bucket()).filter((b) => b.index.length), instances: [], colliders: [] };
};

// ponytail: no crosswalks, stop lines or lowered curbs (STYLE_GUIDE); junction paint once Phase 4 has the road graph.

/** Canvas texture tiling `tile` metres (uv = world metres): base colour with deterministic speckle, plus `paint`. */
function canvasTexture(base: string, tile: number, speckle: number, paint?: (g: CanvasRenderingContext2D, n: number) => void) {
  const n = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = n;
  const g = cv.getContext('2d')!;
  g.fillStyle = base;
  g.fillRect(0, 0, n, n);
  paint?.(g, n);
  for (let k = 0; k < 2600; k++) {
    const v = hash01(k, 7, 3);
    g.fillStyle = v < 0.5 ? `rgba(0,0,0,${speckle * (1 - v)})` : `rgba(255,255,255,${speckle * v * 0.6})`;
    g.fillRect(Math.floor(hash01(k, 1, 1) * n), Math.floor(hash01(k, 2, 2) * n), 1 + (k % 2), 1 + (k % 3 === 0 ? 1 : 0));
  }
  const t = new CanvasTexture(cv);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.repeat.set(1 / tile, 1 / tile);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Sett: staggered rows of small stones (tinted base colour) with dark joints. */
function paintSett(g: CanvasRenderingContext2D, n: number) {
  const rows = 10;
  const cell = n / rows;
  g.strokeStyle = 'rgba(0,0,0,0.55)';
  g.lineWidth = 2.5;
  for (let r = 0; r < rows; r++) {
    for (let c = -1; c < rows; c++) {
      const x = c * cell + (r % 2 ? cell / 2 : 0);
      const v = hash01(r, c, 9);
      g.fillStyle = v < 0.5 ? `rgba(0,0,0,${0.3 * (0.5 - v)})` : `rgba(255,255,255,${0.3 * (v - 0.5)})`;
      g.fillRect(x, r * cell, cell, cell);
      g.strokeRect(x, r * cell, cell, cell);
    }
  }
}

const withOffset = (m: MeshStandardMaterial, f: number) =>
  Object.assign(m, { polygonOffset: true, polygonOffsetFactor: f, polygonOffsetUnits: f });

/** asphalt_02 PBR (Phase 8C T3, uv = world metres, repeat = 1 / tile) or the canvas texture when switched off. */
function asphaltMaterial() {
  if (!graphics8c.asphalt.enabled) return new MeshStandardMaterial({ map: canvasTexture(C.colours.asphalt, C.textureTile.asphalt, 0.35), roughness: 0.95 });
  const m = new MeshStandardMaterial(pbrMaps('asphalt_02'));
  for (const t of [m.map, m.normalMap, m.aoMap]) t?.repeat.set(1 / graphics8c.asphalt.tile, 1 / graphics8c.asphalt.tile);
  return m;
}

/** Road and bridge materials (asphalt, pave, sidewalk, marking, bridge, railing). */
export function createRoadMaterials(): Partial<Record<MaterialId, Material>> {
  const { colours: K, textureTile: T, polygonOffset: O } = C;
  return {
    asphalt: withOffset(asphaltMaterial(), O.asphalt),
    sidewalk: withOffset(new MeshStandardMaterial({ map: canvasTexture(K.sidewalk, T.sidewalk, 0.18), roughness: 0.9 }), O.sidewalk),
    pave: withOffset(new MeshStandardMaterial({ map: canvasTexture(K.pave, T.pave, 0.15, paintSett), roughness: 0.85 }), O.pave),
    marking: withOffset(new MeshStandardMaterial({ color: K.marking, roughness: 0.7 }), O.marking),
    bridge: new MeshStandardMaterial({ color: K.bridge, roughness: 0.85 }),
    railing: new MeshStandardMaterial({ color: K.railing, roughness: 0.6 }),
  };
}
