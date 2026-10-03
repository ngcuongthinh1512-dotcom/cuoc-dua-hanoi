// Group g2: Seine bridges — Bir-Hakeim, Alexandre III, Pont Neuf, Pont des Arts, Alma + Flamme de la Liberté
// (docs/plans/phase2b-assets.md §1 #3, #7, #18, #19, #26: all B, procedural). The decks, road surfaces and their
// colliders come from BridgeBuilder (highway / railway bridge ways); these details sit under and around them:
// arches, piers, parapets, statues, lamps. OSM gives only the bridge polygon (man_made=bridge) + zone nodes, so every
// bridge is laid out along its polygon's axis from the CARVED terrain under it: river runs = bed, arches spring
// springAbove over the water, the body stops topGap under BridgeBuilder's deck line (same formula, estimated here).
// Built in a bridge frame (x = s along the axis, y = world y, z = w across), placed once at the end.
import { latLonToWorld } from '@race/shared';
import { buildings as B, graphics8c as G8, landmarks as LM, roads as R, terrain as T } from '../../config.ts';
import type { BuildingRec, LandmarkId, LandmarkPoint } from '../../geo/chunkData.ts';
import type { BuildOut, MaterialId, TriMesh } from '../buildTypes.ts';
import { hash01, mergeBuckets, MeshBuffer, type V3 } from '../geom.ts';
import type { DetailFn, LandmarkCtx } from './index.ts';
import { box, collider, extrude, type Frame, footprintFrame, loft, place, quadOut, triOut } from './kit.ts';
import { parseColour } from './parts.ts';

const C = LM.g2;
const K = C.colours;
const DECK = R.bridge.deckThickness;
/** Painted steel / cast iron: paint is a dielectric, so the matte vertex-coloured material, not 'metal' (metalness 0.6
 *  goes near-black without an environment map). */
const PAINT: MaterialId = 'masonry';

// ── output: buffers in a frame (the bridge's or a statue's), placed and merged per material at the end ──

class Out {
  private readonly items: { b: MeshBuffer; f: Frame; lod?: 'near' }[] = [];
  readonly colliders: TriMesh[] = [];
  constructor(readonly f: Frame) {}

  /** New buffer drawn in frame f; `colour` (sRGB hex) is the vertex colour of 'masonry'. */
  buf(m: MaterialId, colour?: string, lod?: 'near', f = this.f) {
    const b = new MeshBuffer(m);
    if (colour) b.color = parseColour(colour)!;
    this.items.push({ b, f, ...(lod && { lod }) });
    return b;
  }

  /** Box collider in the bridge frame (SPEC §5.9: simplified shapes only). */
  solid(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, f = this.f) {
    const b = new MeshBuffer('stone');
    box(b, x0, x1, y0, y1, z0, z1);
    this.colliders.push(collider(place(b.bucket(), f, 0)));
  }

  out(): BuildOut {
    return { meshes: mergeBuckets(this.items.map(({ b, f, lod }) => place(b.bucket(lod), f, 0))), instances: [], colliders: this.colliders };
  }
}

const frameAt = (x: number, z: number, heading: number): Frame => ({ area: 0, cx: x, cz: z, ux: Math.cos(heading), uz: Math.sin(heading), a: 0, b: 0 });

// ── small solids (local frame) ──

const circle = (cx: number, cz: number, r: number, n: number, y: number, a0 = 0, a1 = 2 * Math.PI): V3[] => {
  const full = a1 - a0 >= 2 * Math.PI - 1e-9;
  return Array.from({ length: full ? n : n + 1 }, (_, k) => {
    const a = a0 + ((a1 - a0) * k) / n;
    return [cx + r * Math.cos(a), y, cz + r * Math.sin(a)] as V3;
  });
};

/** Convex plan ring (x, z pairs) extruded from y0 to y1, top cap. */
function prismUp(buf: MeshBuffer, pts: number[][], y0: number, y1: number) {
  const at = (y: number) => pts.map(([x, z]) => [x!, y, z!] as V3);
  loft(buf, [at(y0), at(y1)]);
  const top = at(y1);
  for (let i = 1; i + 1 < top.length; i++) triOut(buf, top[0]!, top[i]!, top[i + 1]!, [0, 1, 0]);
}

/** Surface of revolution around (cx, cz) through (radius, y) pairs; closed on top when the last radius > 0. */
function lathe(buf: MeshBuffer, cx: number, cz: number, prof: number[][], n = 8) {
  const rings = prof.map(([r, y]) => circle(cx, cz, Math.max(r!, 1e-3), n, y!));
  loft(buf, rings);
  const top = rings.at(-1)!;
  if (prof.at(-1)![0]! > 1e-3) for (let i = 1; i + 1 < n; i++) triOut(buf, top[0]!, top[i]!, top[i + 1]!, [0, 1, 0]);
}

/** Wall of thickness t along a polyline (x, z pairs) from y0 to y1: both faces, top, end caps. */
function wall(buf: MeshBuffer, pts: number[][], y0: number, y1: number, t: number) {
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, az] = pts[i] as [number, number];
    const [bx, bz] = pts[i + 1] as [number, number];
    const l = Math.hypot(bx - ax, bz - az);
    if (l < 1e-6) continue;
    const [nx, nz] = [(-(bz - az) / l) * (t / 2), ((bx - ax) / l) * (t / 2)];
    const P = (x: number, z: number, s: number, y: number): V3 => [x + s * nx, y, z + s * nz];
    for (const s of [1, -1]) quadOut(buf, P(ax, az, s, y0), P(bx, bz, s, y0), P(bx, bz, s, y1), P(ax, az, s, y1), [s * nx, 0, s * nz]);
    quadOut(buf, P(ax, az, 1, y1), P(bx, bz, 1, y1), P(bx, bz, -1, y1), P(ax, az, -1, y1), [0, 1, 0]);
    for (const [end, x, z] of [[i === 0, ax, az], [i + 2 === pts.length, bx, bz]] as const) {
      if (!end) continue;
      const d: V3 = x === ax && z === az ? [ax - bx, 0, az - bz] : [bx - ax, 0, bz - az];
      quadOut(buf, P(x, z, 1, y0), P(x, z, -1, y0), P(x, z, -1, y1), P(x, z, 1, y1), d);
    }
  }
}

/** Points (s, y) of an arch from (a, y0) over its crown to (b, y0): elliptical (semi) or parabolic (segmental). */
function archPts(a: number, b: number, y0: number, rise: number, kind: 'ellipse' | 'parabola', segs = C.archSegments) {
  const [m, hw] = [(a + b) / 2, (b - a) / 2];
  return Array.from({ length: segs + 1 }, (_, k) => {
    if (kind === 'ellipse') return [m - hw * Math.cos((Math.PI * k) / segs), y0 + rise * Math.sin((Math.PI * k) / segs)];
    const t = -1 + (2 * k) / segs;
    return [m + hw * t, y0 + rise * (1 - t * t)];
  }).flat();
}

/** Steel arch rib: parabolic band (intrados rise over the springing y0, radial depth from `depth` at the springs to
 *  `crownDepth` at the crown), thickness `width` across, centred on w. */
function rib(buf: MeshBuffer, a: number, b: number, y0: number, rise: number, depth: number, crownDepth: number, w: number, width: number) {
  const [m, hw] = [(a + b) / 2, (b - a) / 2];
  const n = C.archSegments;
  const intr: number[] = [];
  const extr: number[] = [];
  for (let k = 0; k <= n; k++) {
    const t = -1 + (2 * k) / n;
    const y = y0 + rise * (1 - t * t);
    intr.push(m + hw * t, y);
    extr.push(m + hw * t, y + crownDepth + (depth - crownDepth) * t * t);
  }
  const back: number[] = [];
  for (let k = n; k >= 0; k--) back.push(extr[2 * k]!, extr[2 * k + 1]!);
  extrude(buf, [...intr, ...back], 'z', w - width / 2, w + width / 2);
}

// ── statue proxies (statue frame: x forward, z to the side, y absolute) ──

/** Standing figure of height H from y0 (optionally one arm raised: Renommée's trumpet, the Zouave's rifle). */
function figure(buf: MeshBuffer, y0: number, H: number, raised = false) {
  const u = H / 10;
  for (const z of [-0.55, 0.55]) box(buf, -0.45 * u, 0.45 * u, y0, y0 + 4.6 * u, (z - 0.4) * u, (z + 0.4) * u); // legs
  box(buf, -0.7 * u, 0.7 * u, y0 + 4.6 * u, y0 + 8.1 * u, -1.1 * u, 1.1 * u); // torso
  lathe(buf, 0, 0, [[0.5 * u, y0 + 8.1 * u], [0.75 * u, y0 + 8.9 * u], [0.55 * u, y0 + 9.7 * u], [0.15 * u, y0 + 10 * u]], 6); // head
  box(buf, -0.35 * u, 0.35 * u, y0 + 4.9 * u, y0 + 8 * u, -1.6 * u, -1.1 * u); // arm down
  if (raised) box(buf, -0.35 * u, 0.35 * u, y0 + 7.5 * u, y0 + 11.5 * u, 1.1 * u, 1.6 * u); // arm up
  else box(buf, -0.35 * u, 0.35 * u, y0 + 4.9 * u, y0 + 8 * u, 1.1 * u, 1.6 * u);
}

/** Horse (+ rider, or wings) of height H from y0, facing +x. */
function horse(buf: MeshBuffer, y0: number, H: number, rider: 'rider' | 'wings' | 'none') {
  const u = H / 10;
  const y = (v: number) => y0 + v * u;
  for (const [x, z] of [[-2.8, -1], [-2.8, 1], [2.8, -1], [2.8, 1]]) box(buf, (x! - 0.35) * u, (x! + 0.35) * u, y(0), y(4.2), (z! - 0.35) * u, (z! + 0.35) * u);
  box(buf, -3.8 * u, 3.8 * u, y(3.8), y(6.2), -1.3 * u, 1.3 * u); // barrel
  loft(buf, [[[2.6, 5, -0.8], [4, 5, -0.8], [4, 5, 0.8], [2.6, 5, 0.8]], [[4.2, 7.8, -0.5], [5, 7.8, -0.5], [5, 7.8, 0.5], [4.2, 7.8, 0.5]]].map((r) => r.map(([x, yy, z]) => [x! * u, y(yy!), z! * u] as V3)));
  box(buf, 4.2 * u, 6.6 * u, y(7), y(8.4), -0.5 * u, 0.5 * u); // head
  box(buf, -4.6 * u, -3.8 * u, y(3), y(6), -0.3 * u, 0.3 * u); // tail
  if (rider === 'rider') {
    box(buf, -1 * u, 0.8 * u, y(6.2), y(9), -0.9 * u, 0.9 * u); // torso
    lathe(buf, 0, 0, [[0.4 * u, y(9)], [0.6 * u, y(9.5)], [0.1 * u, y(10)]], 6);
    for (const z of [-1.5, 1.5]) box(buf, -0.6 * u, 0.6 * u, y(4), y(6.4), (z - 0.3) * u, (z + 0.3) * u); // legs
    box(buf, 0.2 * u, 0.7 * u, y(8), y(11.5), 0.9 * u, 1.3 * u); // raised arm (sword / baton)
  }
  if (rider === 'wings') {
    for (const s of [-1, 1]) {
      triOut(buf, [-1.5 * u, y(6), s * 1.2 * u], [2 * u, y(6.2), s * 1.2 * u], [-3.5 * u, y(11), s * 5 * u], [0, 1, s]);
      triOut(buf, [-1.5 * u, y(6), s * 1.2 * u], [-3.5 * u, y(11), s * 5 * u], [2 * u, y(6.2), s * 1.2 * u], [0, -1, -s]);
    }
  }
}

// ── the bridge site: axis, river runs, width, deck line ──

export interface Site {
  f: Frame;
  wL: number; // body sides (median polygon cross-section over the river), wL < wR
  wR: number;
  bed: number;
  level: number; // water surface
  channels: [number, number][]; // s runs over the river bed, ascending
  deck: (s: number) => number; // BridgeBuilder's deck top (estimated with its formula)
  top: (s: number) => number; // top of the bridge bodies (topGap under the deck)
  local: (x: number, z: number) => [number, number];
}

export function site(rec: BuildingRec, ctx: LandmarkCtx): Site {
  const r = rec.outer;
  const n = r.length / 2;
  // Axis: length-weighted mean of the edge directions (angles doubled): the long sides dominate, semicircles cancel.
  let [c2, s2] = [0, 0];
  for (let i = 0; i < n; i++) {
    const [dx, dz] = [r[(2 * i + 2) % r.length]! - r[2 * i]!, r[(2 * i + 3) % r.length]! - r[2 * i + 1]!];
    const l = Math.hypot(dx, dz);
    if (l > 1e-6) [c2, s2] = [c2 + (dx * dx - dz * dz) / l, s2 + (2 * dx * dz) / l];
  }
  const th = Math.atan2(s2, c2) / 2;
  const [ux, uz] = [Math.cos(th), Math.sin(th)];
  const S = (x: number, z: number) => x * ux + z * uz;
  const W = (x: number, z: number) => -x * uz + z * ux;
  let [s0, s1, w0, w1] = [Infinity, -Infinity, Infinity, -Infinity];
  for (let i = 0; i < n; i++) {
    const [s, w] = [S(r[2 * i]!, r[2 * i + 1]!), W(r[2 * i]!, r[2 * i + 1]!)];
    [s0, s1, w0, w1] = [Math.min(s0, s), Math.max(s1, s), Math.min(w0, w), Math.max(w1, w)];
  }
  const [ms, mw] = [(s0 + s1) / 2, (w0 + w1) / 2];
  const f: Frame = { area: 0, cx: ms * ux - mw * uz, cz: ms * uz + mw * ux, ux, uz, a: (s1 - s0) / 2, b: (w1 - w0) / 2 };
  const a = f.a;
  const hs = (s: number, w = 0) => ctx.height(f.cx + s * ux - w * uz, f.cz + s * uz + w * ux);
  const local = (x: number, z: number): [number, number] => [S(x - f.cx, z - f.cz), W(x - f.cx, z - f.cz)];

  const prof: [number, number][] = [];
  for (let s = -a; s <= a; s += 1) prof.push([s, hs(s)]);
  const bed = Math.min(...prof.map((p) => p[1]));
  const level = bed + T.riverDepth;
  const channels: [number, number][] = [];
  let run: number | undefined;
  for (const [s, h] of [...prof, [a + 1, Infinity] as [number, number]]) {
    if (h < level) run ??= s;
    else if (run !== undefined) {
      if (s - 1 - run >= C.minChannel) channels.push([run, s - 1]);
      run = undefined;
    }
  }
  // Cross-section of the outline at s (outermost crossings), median over the river.
  const cut = (s: number) => {
    let [lo, hi] = [Infinity, -Infinity];
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const [xi, zi, xj, zj] = [r[2 * i]! - f.cx, r[2 * i + 1]! - f.cz, r[2 * j]! - f.cx, r[2 * j + 1]! - f.cz];
      const [si, sj] = [S(xi, zi), S(xj, zj)];
      if (si > s === sj > s) continue;
      const w = W(xi, zi) + ((s - si) / (sj - si)) * (W(xj, zj) - W(xi, zi));
      [lo, hi] = [Math.min(lo, w), Math.max(hi, w)];
    }
    return [lo, hi] as const;
  };
  const cuts = (channels.length ? channels : [[-a / 2, a / 2]]).flatMap(([c0, c1]) =>
    Array.from({ length: 21 }, (_, k) => cut(c0! + ((c1! - c0!) * k) / 20)).filter(([lo, hi]) => hi > lo));
  const median = (v: number[]) => v.sort((p, q) => p - q)[v.length >> 1] ?? 0;
  const [wL, wR] = cuts.length ? [median(cuts.map((c) => c[0])), median(cuts.map((c) => c[1]))] : [-f.b, f.b];

  // BridgeBuilder: linear between the terrain endSample beyond both ends, never below the terrain under the deck.
  const e = R.bridge.endSample;
  const [y0, y1] = [hs(-a - e), hs(a + e)];
  const deck = (s: number) => Math.max(y0 + ((y1 - y0) * (s + a)) / (2 * a), hs(s));
  return { f, wL, wR, bed, level, channels, deck, top: (s) => deck(s) - C.topGap, local };
}

/** n equal spans over [c0, c1] separated by n − 1 piers of width p: [a, b] per span. */
const spans = ([c0, c1]: [number, number], n: number, p: number) => {
  const S = (c1 - c0 - (n - 1) * p) / n;
  return Array.from({ length: n }, (_, i) => [c0 + i * (S + p), c0 + i * (S + p) + S] as [number, number]);
};
/** Collider of a bridge body over the river (± 4 m): its top (walkable where BridgeBuilder's deck is narrower than the
 *  OSM polygon) as a 0.5 m slab sampled every 5 m, and a parapet wall `rail` high along both sides. */
function walkway(o: Out, st: Site, yTop: (s: number) => number, rail: number) {
  if (!st.channels.length) return;
  const [s0, s1] = [st.channels[0]![0] - 4, st.channels.at(-1)![1] + 4];
  const n = Math.max(1, Math.ceil((s1 - s0) / 5));
  const ss = Array.from({ length: n + 1 }, (_, k) => s0 + ((s1 - s0) * k) / n);
  const prof = (d0: number, d1: number) => [...ss.flatMap((s) => [s, yTop(s) + d0]), ...[...ss].reverse().flatMap((s) => [s, yTop(s) + d1])];
  const b = new MeshBuffer('stone');
  extrude(b, prof(-0.5, 0), 'z', st.wL, st.wR);
  extrude(b, prof(0, rail), 'z', st.wL, st.wL + 0.3);
  extrude(b, prof(0, rail), 'z', st.wR - 0.3, st.wR);
  o.colliders.push(collider(place(b.bucket(), st.f, 0)));
}

const piersOf = (arches: [number, number][]) => arches.slice(1).map(([a], i) => [arches[i]![1], a] as [number, number]);

/** Pointed cutwaters on both faces of a pier [p0, p1] (plan triangles, nose beyond the sides), y0 → y1. */
function cutwaters(buf: MeshBuffer, st: Site, p0: number, p1: number, nose: number, y0: number, y1: number) {
  const pm = (p0 + p1) / 2;
  prismUp(buf, [[p0, st.wR], [p1, st.wR], [pm, st.wR + nose]], y0, y1);
  prismUp(buf, [[p1, st.wL], [p0, st.wL], [pm, st.wL - nose]], y0, y1);
}

/** Street lamps at the record's lamp nodes on the bridge (deck line) or next to it (terrain): column + globes. */
function lamps(o: Out, st: Site, ctx: LandmarkCtx, pts: LandmarkPoint[], H: number, globes: 1 | 3, mat: MaterialId, colour?: string) {
  const post = o.buf(mat, colour, 'near');
  const glass = o.buf('masonry', K.globe, 'near');
  const [s0, s1] = [-st.f.a, st.f.a];
  for (const p of pts) {
    if (p.kind !== 'street_lamp') continue;
    const [s, w] = st.local(p.x, p.z);
    const on = s > s0 && s < s1 && w > st.wL - 1 && w < st.wR + 1;
    const y = on ? st.deck(s) + R.lift + R.curbHeight : ctx.height(p.x, p.z);
    box(post, s - 0.3, s + 0.3, y, y + 0.8, w - 0.3, w + 0.3);
    lathe(post, s, w, [[0.15, y + 0.8], [0.1, y + H - 0.4], [0.16, y + H - 0.3]], 8);
    const globe = (x: number, gy: number, z: number, r: number) =>
      lathe(glass, x, z, [[0.01, gy - r], [r * 0.7, gy - r * 0.7], [r, gy], [r * 0.7, gy + r * 0.7], [0.01, gy + r]], 8);
    globe(s, y + H, w, 0.25);
    if (globes === 3) {
      box(post, s - 0.05, s + 0.05, y + H - 0.8, y + H - 0.7, w - 0.6, w + 0.6);
      for (const d of [-0.6, 0.6]) globe(s, y + H - 0.55, w + d, 0.2);
    }
  }
}

// ── Pont Neuf (1578–1607): 12 semicircular-ish stone arches, 7 on the right-bank arm + 5 on the left, pointed cutwaters
// under half-moon bays, a cornice on 381 mascarons, solid stone parapets, Henri IV on the Île de la Cité ──

function pontNeuf(rec: BuildingRec, ctx: LandmarkCtx): BuildOut {
  const P = C.pontNeuf;
  const st = site(rec, ctx);
  const o = new Out(st.f);
  const stone = o.buf('masonry', K.pier);
  const near = o.buf('masonry', K.pier, 'near');
  const { wL, wR, top, deck } = st;
  const spring = st.level + C.springAbove;
  const foot = st.bed - C.pierDepth;
  const ch = st.channels.reduce<[number, number] | undefined>((b, c) => (!b || c[1] - c[0] > b[1] - b[0] ? c : b), undefined);
  const walk = (s: number) => deck(s) + R.lift + R.curbHeight;
  const bays: number[] = [];
  if (ch) {
    const arches = spans(ch, ch[1] - ch[0] > P.longArm ? P.arches.long : P.arches.short, P.pierWidth);
    for (const [a, b] of arches) {
      const rise = Math.min((b - a) / 2, Math.min(top(a), top(b)) - P.voussoir - spring);
      extrude(stone, [a, top(a), ...archPts(a, b, spring, rise, 'ellipse'), b, top(b)], 'z', wL, wR);
    }
    box(stone, ch[0] - 4, ch[0], foot, top(ch[0]), wL, wR); // abutments behind the quay walls
    box(stone, ch[1], ch[1] + 4, foot, top(ch[1]), wL, wR);
    const R0 = P.pierWidth / 2;
    for (const [p0, p1] of piersOf(arches)) {
      const pm = (p0 + p1) / 2;
      box(stone, p0, p1, foot, top(pm), wL, wR);
      cutwaters(stone, st, p0, p1, R0 + P.bayBump, foot, spring + P.cutwaterTop);
      // half-moon bay: round turret on the cutwater up to the pavement, parapet around it
      for (const [w, a0] of [[wR, 0], [wL, Math.PI]] as const) {
        const arc = circle(pm, w, R0, 10, 0, a0, a0 + Math.PI).map((p) => [p[0], p[2]]);
        prismUp(stone, arc, spring + P.cutwaterTop, walk(pm));
        const rim = circle(pm, w, R0 - P.parapetThickness / 2, 10, 0, a0, a0 + Math.PI).map((p) => [p[0], p[2]]);
        wall(stone, rim, walk(pm), walk(pm) + P.parapet, P.parapetThickness);
      }
      bays.push(p0, p1);
    }
    // cornice + mascarons (corbel blocks with a carved head) along both faces, between the bays
    const [e0, e1] = [ch[0] - 2, ch[1] + 2];
    for (const [w, d] of [[wR, 1], [wL, -1]] as const) {
      extrude(stone, [e0, top(e0) - 0.7, e1, top(e1) - 0.7, e1, top(e1) - 0.2, e0, top(e0) - 0.2], 'z', ...(d > 0 ? [w, w + 0.35] : [w - 0.35, w]) as [number, number]);
      for (let s = e0 + P.mascaronStep / 2; s < e1; s += P.mascaronStep) {
        if (bays.some((b, i) => i % 2 === 0 && s > b - 0.4 && s < bays[i + 1]! + 0.4)) continue;
        const y = top(s) - 0.7;
        box(near, s - 0.25, s + 0.25, y - 0.75, y, ...(d > 0 ? [w, w + 0.25] : [w - 0.25, w]) as [number, number]);
        box(near, s - 0.15, s + 0.15, y - 0.6, y - 0.2, ...(d > 0 ? [w + 0.25, w + 0.37] : [w - 0.37, w - 0.25]) as [number, number]);
      }
    }
  }
  // parapets along both sides of the whole outline length, open at the bays
  const [s0, s1] = [-st.f.a, st.f.a];
  const cuts = [s0, ...bays, s1];
  for (let i = 0; i + 1 < cuts.length; i += 2) {
    const [a, b] = [cuts[i]!, cuts[i + 1]!];
    for (const w of [wR - P.parapetThickness / 2, wL + P.parapetThickness / 2]) {
      const n = Math.max(1, Math.ceil((b - a) / 5));
      for (let k = 0; k < n; k++) {
        const [p, q] = [a + ((b - a) * k) / n, a + ((b - a) * (k + 1)) / n];
        wall(stone, [[p, w], [q, w]], walk(p) - 0.3, walk(p) + P.parapet, P.parapetThickness);
      }
    }
  }
  lamps(o, st, ctx, rec.points ?? [], P.lampHeight, 1, PAINT, K.black);
  // Henri IV (1618, recast 1818): equestrian bronze on the pedestal between the two arms; drawn by the record whose
  // chunk holds it (ponytail: both arms in one chunk would draw it twice).
  const hp = latLonToWorld(...P.henri.at);
  const bnd = ctx.bounds;
  if (hp.x >= bnd.minX && hp.x < bnd.maxX && hp.z >= bnd.minZ && hp.z < bnd.maxZ) {
    const hf = frameAt(hp.x, hp.z, P.henri.dir);
    horse(o.buf('bronze', undefined, undefined, hf), ctx.height(hp.x, hp.z) + B.smallHeight - 0.05, P.henri.statueHeight, 'rider');
  }
  walkway(o, st, top, P.parapet);
  return o.out();
}

// ── Pont des Arts (1804, rebuilt 1981–84): 7 cast-iron-look steel arches on stone piers, wooden deck, railings ──

function pontDesArts(rec: BuildingRec, ctx: LandmarkCtx): BuildOut {
  const A = C.arts;
  const st = site(rec, ctx);
  const o = new Out(st.f);
  const { wL, wR, deck } = st;
  const steel = o.buf(PAINT, K.arts);
  const fine = o.buf(PAINT, K.arts, 'near');
  const stone = o.buf('masonry', K.pier);
  const spring = st.level + C.springAbove;
  const foot = st.bed - C.pierDepth;
  const [s0, s1] = [-st.f.a, st.f.a];
  const girder = 0.45; // m of deck girder under the planks
  const ribW = Array.from({ length: A.ribs }, (_, k) => wL + 0.4 + ((wR - wL - 0.8) * k) / (A.ribs - 1));
  for (const ch of st.channels) {
    const arches = spans(ch, A.spans, A.pierWidth);
    for (const [a, b] of arches) {
      const crown = deck((a + b) / 2) - girder - A.ribDepth * 0.6;
      const rise = crown - spring;
      for (const w of ribW) rib(steel, a, b, spring, rise, A.ribDepth * 1.6, A.ribDepth * 0.6, w, A.ribWidth);
      for (const w of [ribW[0]!, ribW.at(-1)!]) {
        for (let s = a + C.postStep / 2; s < b; s += C.postStep / 2) {
          const t = (2 * (s - a)) / (b - a) - 1;
          const y = spring + rise * (1 - t * t) + A.ribDepth * (0.6 + t * t);
          if (deck(s) - girder - y > 0.2) box(fine, s - 0.06, s + 0.06, y, deck(s) - girder, w - 0.06, w + 0.06);
        }
      }
    }
    for (const [p0, p1] of piersOf(arches)) {
      box(stone, p0, p1, foot, spring + 0.4, wL - 0.3, wR + 0.3);
      cutwaters(stone, st, p0, p1, 2.5, foot, spring + 0.4);
    }
    box(stone, ch[0] - 3, ch[0], foot, deck(ch[0]) - girder, wL, wR);
    box(stone, ch[1], ch[1] + 3, foot, deck(ch[1]) - girder, wL, wR);
  }
  for (const w of ribW) extrude(steel, [s0, deck(s0) - girder, s1, deck(s1) - girder, s1, deck(s1) - 0.1, s0, deck(s0) - 0.1], 'z', w - 0.2, w + 0.2);
  // oak-look planks across the full width (BridgeBuilder's footway deck is narrower), dark underside
  for (let s = s0, k = 0; s < s1; s += A.plank, k++) {
    const pl = o.buf('masonry', K.planks[Math.floor(hash01(k, 7) * K.planks.length)]!);
    const [e, y0, y1] = [Math.min(s + A.plank - 0.02, s1), deck(s) + A.deckLift, deck(Math.min(s + A.plank, s1)) + A.deckLift];
    quadOut(pl, [s, y0, wL], [e, y1, wL], [e, y1, wR], [s, y0, wR], [0, 1, 0]);
  }
  const under = o.buf(PAINT, K.arts);
  quadOut(under, [s0, deck(s0) - 0.1, wL], [s1, deck(s1) - 0.1, wL], [s1, deck(s1) - 0.1, wR], [s0, deck(s0) - 0.1, wR], [0, -1, 0]);
  // railings: posts + rails, glass panels between (since 2015)
  const glass = o.buf('glass', undefined, 'near');
  for (const w of [wL + 0.1, wR - 0.1]) {
    for (let s = s0; s < s1; s += A.railPostStep) {
      const e = Math.min(s + A.railPostStep, s1);
      const [y0, y1] = [deck(s) + A.deckLift, deck(e) + A.deckLift];
      box(fine, s - 0.05, s + 0.05, y0, y0 + A.railing, w - 0.05, w + 0.05);
      glass.quad([s, y0 + 0.12, w], [e, y1 + 0.12, w], [e, y1 + A.railing - 0.08, w], [s, y0 + A.railing - 0.08, w], 0.5, 0.5, 0.5, 0.5);
    }
    extrude(steel, [s0, deck(s0) + A.deckLift + A.railing - 0.08, s1, deck(s1) + A.deckLift + A.railing - 0.08, s1, deck(s1) + A.deckLift + A.railing, s0, deck(s0) + A.deckLift + A.railing], 'z', w - 0.07, w + 0.07);
  }
  lamps(o, st, ctx, rec.points ?? [], A.lampHeight, 1, PAINT, K.arts);
  walkway(o, st, (s) => deck(s) + A.deckLift, A.railing);
  return o.out();
}

// ── Pont Alexandre III (1896–1900): one flat 107.5 m steel arch of 15 ribs, rise 6.28 m; 4 granite pylons (17 m) crowned
// by gilded Renommée + Pegasus groups; Art-Nouveau candelabras; nymph cartouches at the crown ──

function alexandre(rec: BuildingRec, ctx: LandmarkCtx): BuildOut {
  const A = C.alexandre;
  if (rec.kind !== 'bridge') return pylon(rec, ctx);
  const st = site(rec, ctx);
  const o = new Out(st.f);
  const { wL, wR, top, deck } = st;
  const steel = o.buf(PAINT, K.alexandre);
  const fine = o.buf(PAINT, K.alexandre, 'near');
  const stone = o.buf('masonry', K.granite);
  const gold = o.buf('gold');
  const spring = st.level + C.springAbove;
  const foot = st.bed - C.pierDepth;
  const ch = st.channels[0];
  if (ch) {
    const [a, b] = [ch[0], st.channels.at(-1)![1]]; // one span over the whole river
    const m = (a + b) / 2;
    const rise = Math.min(A.rise, top(m) - A.crownDepth - spring);
    const ws = Array.from({ length: A.ribs }, (_, k) => wL + 0.4 + ((wR - wL - 0.8) * k) / (A.ribs - 1));
    for (const w of ws) rib(steel, a, b, spring, rise, A.ribDepth, A.crownDepth, w, A.ribWidth);
    // outer faces: a proud arch rib, spandrel plates recessed behind it up to the deck, gilt garland band, cartouches
    const extr = (s: number) => {
      const t = (2 * (s - a)) / (b - a) - 1;
      return spring + rise * (1 - t * t) + A.crownDepth + (A.ribDepth - A.crownDepth) * t * t;
    };
    for (const [w, d] of [[wR, 1], [wL, -1]] as const) {
      const inset = (p: number, q: number) => (d > 0 ? [w - q, w - p] : [w + p, w + q]) as [number, number];
      rib(steel, a, b, spring, rise, A.ribDepth, A.crownDepth, w + d * 0.02, 0.35);
      const pts: number[] = [];
      for (let k = 0; k <= C.archSegments; k++) pts.push(a + ((b - a) * k) / C.archSegments, extr(a + ((b - a) * k) / C.archSegments) - 0.05);
      const back: number[] = [];
      for (let k = C.archSegments; k >= 0; k--) back.push(pts[2 * k]!, top(pts[2 * k]!));
      extrude(steel, [...pts, ...back], 'z', ...inset(A.spandrelInset, A.spandrelInset + 0.25));
      extrude(gold, [a, top(a) - 0.55, b, top(b) - 0.55, b, top(b) - 0.35, a, top(a) - 0.35], 'z', ...inset(A.spandrelInset - 0.08, A.spandrelInset));
      // cartouche (nymphs of the Seine upstream / the Neva downstream): gilt shield at the crown
      const ring = circle(0, 0, 1, 12, 0).map((p) => [m + p[0] * 3, top(m) - 1.1 + p[2] * 0.9]).flat();
      extrude(gold, ring, 'z', d > 0 ? w : w - 0.25, d > 0 ? w + 0.25 : w);
      // balusters along the parapet line (BridgeBuilder draws the railing wall; these read as its balustrade)
      for (let s = a - 8; s < b + 8; s += A.balusterStep) box(fine, s - 0.07, s + 0.07, deck(s), deck(s) + 0.95, ...(d > 0 ? [w - 0.05, w + 0.1] : [w - 0.1, w + 0.05]) as [number, number]);
    }
    box(stone, a - A.abutment, a, foot, top(a), wL, wR); // masonry abutments (the quays hide most of them)
    box(stone, b, b + A.abutment, foot, top(b), wL, wR);
    for (const p of rec.points ?? []) {
      const [s, w] = st.local(p.x, p.z);
      if (p.kind !== 'artwork' || Math.abs(s - m) < 10) continue; // the crown nodes are the cartouches
      const on = Math.abs(s) < st.f.a && w > wL - 1 && w < wR + 1;
      statueProxy(o, p, on ? deck(s) + R.lift + R.curbHeight : ctx.height(p.x, p.z), Math.atan2(st.f.uz, st.f.ux) + (s > 0 ? Math.PI : 0));
    }
  }
  lamps(o, st, ctx, rec.points ?? [], A.lampHeight, 3, 'bronze');
  walkway(o, st, top, R.bridge.railingHeight);
  return o.out();
}

/** Figure proxy on a plinth (base y, facing `face` rad) for an artwork node on / next to Alexandre III (lions,
 *  children, allegories). */
function statueProxy(o: Out, p: LandmarkPoint, y: number, face: number) {
  const A = C.alexandre;
  const H = p.sub === 'statue' ? A.figureHeight : A.sculptureHeight;
  const mat: MaterialId = p.material === 'bronze' || p.material === 'copper' ? 'bronze' : 'masonry';
  const f = frameAt(p.x, p.z, face);
  box(o.buf('masonry', K.granite, undefined, f), -1, 1, y, y + A.plinth, -0.8, 0.8);
  o.solid(-1, 1, y, y + A.plinth, -0.8, 0.8, f);
  const b = o.buf(mat, mat === 'masonry' ? LM.colours.stone : undefined, 'near', f);
  if (p.sub === 'statue') figure(b, y + A.plinth, H, false);
  else horse(b, y + A.plinth, H, 'none'); // lion-sized quadruped
}

/** One of the 4 pylons (OSM building=yes, height 17): granite plinth, shaft with corner columns, entablature, and the
 *  gilded Renommée holding Pegasus at its statue node (min_height 17). */
function pylon(rec: BuildingRec, ctx: LandmarkCtx): BuildOut {
  const A = C.alexandre;
  const fp = footprintFrame(rec.outer);
  const o = new Out(fp);
  const y0 = ctx.minGround - LM.sink;
  const H = (rec.height ?? A.pylon) + ctx.ground - y0; // OSM height counts from ctx.ground
  const [ha, hb] = [fp.a, fp.b];
  const stone = o.buf('masonry', K.granite);
  const pale = o.buf('masonry', LM.colours.stone);
  box(stone, -ha, ha, y0, y0 + H * 0.25, -hb, hb);
  box(pale, -ha * 0.8, ha * 0.8, y0 + H * 0.25, y0 + H * 0.85, -hb * 0.8, hb * 0.8);
  for (const [x, z] of [[1, 1], [-1, 1], [-1, -1], [1, -1]]) lathe(pale, x! * ha * 0.8, z! * hb * 0.8, [[0.55, y0 + H * 0.25], [0.45, y0 + H * 0.85]], 10);
  box(pale, -ha * 0.95, ha * 0.95, y0 + H * 0.85, y0 + H * 0.93, -hb * 0.95, hb * 0.95);
  box(stone, -ha * 0.75, ha * 0.75, y0 + H * 0.93, y0 + H, -hb * 0.75, hb * 0.75);
  o.solid(-ha, ha, y0, y0 + H, -hb, hb);
  const p = (rec.points ?? []).find((q) => q.kind === 'artwork' && (q.minHeight ?? 0) > 10) ?? { x: fp.cx, z: fp.cz };
  const head = Math.atan2(fp.uz, fp.ux);
  horse(o.buf('gold', undefined, undefined, frameAt(p.x, p.z, head)), y0 + H, A.statueHeight * 0.8, 'wings');
  const side = 1.4; // m: the Renommée stands beside her Pegasus
  figure(o.buf('gold', undefined, undefined, frameAt(p.x - fp.uz * side, p.z + fp.ux * side, head)), y0 + H, A.statueHeight, true);
  for (const q of rec.points ?? []) if (q.kind === 'artwork' && (q.minHeight ?? 0) <= 10) statueProxy(o, q, ctx.height(q.x, q.z), Math.atan2(fp.uz, fp.ux));
  return o.out();
}

// ── Pont de Bir-Hakeim (1903–05): road deck on 3 steel arches per river arm + stone piers, Line 6 viaduct above on
// cast-iron columns with arched braces, monumental stone arch over the Île aux Cygnes, La France renaissante (1930) ──

function birHakeim(rec: BuildingRec, ctx: LandmarkCtx): BuildOut {
  const H = C.birHakeim;
  const st = site(rec, ctx);
  const o = new Out(st.f);
  const { wL, wR, top, deck } = st;
  const steel = o.buf(PAINT, K.birHakeim);
  const fine = o.buf(PAINT, K.birHakeim, 'near');
  const stone = o.buf('masonry', K.pier);
  const spring = st.level + C.springAbove;
  const foot = st.bed - C.pierDepth;
  const cw = (wL + wR) / 2;
  const metro = (s: number) => deck(s) + R.bridge.railLayerStep - DECK + C.slabGrip; // under the Line 6 slab
  const ws = Array.from({ length: H.ribs }, (_, k) => wL + 0.5 + ((wR - wL - 1) * k) / (H.ribs - 1));
  for (const ch of st.channels) {
    const arches = spans(ch, H.spans, H.pierWidth);
    for (const [a, b] of arches) {
      const m = (a + b) / 2;
      const rise = top(m) - H.ribDepth * 0.7 - spring;
      for (const w of ws) rib(steel, a, b, spring, rise, H.ribDepth * 1.5, H.ribDepth * 0.7, w, H.ribWidth);
      for (const w of [ws[0]!, ws.at(-1)!]) {
        for (let s = a + C.postStep; s < b - 1; s += C.postStep) {
          const t = (2 * (s - a)) / (b - a) - 1;
          const y = spring + rise * (1 - t * t) + H.ribDepth * (0.7 + 0.8 * t * t);
          if (top(s) - y > 0.3) box(fine, s - 0.12, s + 0.12, y, top(s), w - 0.12, w + 0.12);
        }
      }
    }
    for (const [p0, p1] of piersOf(arches)) {
      box(stone, p0, p1, foot, top((p0 + p1) / 2), wL - 0.5, wR + 0.5);
      cutwaters(stone, st, p0, p1, 3, foot, spring + 1.5);
    }
    box(stone, ch[0] - 4, ch[0], foot, top(ch[0]), wL, wR);
    box(stone, ch[1], ch[1] + 4, foot, top(ch[1]), wL, wR);
  }
  // Île aux Cygnes: stone massif between the river arms, from the road deck to the viaduct, its arch over the promenade
  const [c0, c1] = [st.channels[0], st.channels[1]];
  const isl = c0 && c1 ? (c0[1] + c1[0]) / 2 : undefined;
  if (isl !== undefined) {
    const [y0, y1] = [deck(isl), metro(isl)];
    const hw = H.viaductHalf + 2.2;
    const o2 = H.viaductHalf - 0.6;
    const arch = archPts(cw - o2, cw + o2, y0 + (y1 - y0) * 0.35, (y1 - y0) * 0.4, 'ellipse');
    extrude(stone, [cw - hw, y0, cw - o2, y0, ...arch, cw + o2, y0, cw + hw, y0, cw + hw, y1, cw - hw, y1], 'x', isl - H.island / 2, isl + H.island / 2);
    for (const w of [cw - hw, cw + o2]) o.solid(isl - H.island / 2, isl + H.island / 2, y0, y1, w, w + hw - o2);
    box(stone, isl - H.island / 2 - 0.4, isl + H.island / 2 + 0.4, y1 - 0.8, y1 - DECK + C.slabGrip - 0.01, cw - hw - 0.4, cw + hw + 0.4);
  }
  // Line 6 viaduct: two lines of cast-iron columns on the central promenade, arched braces under the metro deck
  const [s0, s1] = [-st.f.a + 3, st.f.a - 3];
  const cols: number[] = [];
  for (let s = s0; s <= s1; s += H.columnSpacing) if (isl === undefined || Math.abs(s - isl) > H.island / 2 + 1) cols.push(s);
  for (const s of cols) {
    for (const w of [cw - H.viaductHalf, cw + H.viaductHalf]) {
      const r = H.columnRadius;
      lathe(steel, s, w, [[r * 1.6, deck(s)], [r * 1.4, deck(s) + 0.6], [r, deck(s) + 0.8], [r * 0.9, metro(s) - 0.9], [r * 1.5, metro(s) - 0.5], [r * 1.5, metro(s)]], 8);
    }
    box(steel, s - 0.2, s + 0.2, metro(s) - 0.6, metro(s), cw - H.viaductHalf, cw + H.viaductHalf); // cross girder
  }
  for (let i = 0; i + 1 < cols.length; i++) {
    const [a, b] = [cols[i]!, cols[i + 1]!];
    if (b - a > H.columnSpacing + 0.5) continue; // the island massif
    const y = metro((a + b) / 2);
    const arcPts = archPts(a + 0.3, b - 0.3, y - H.braceDrop, H.braceDrop - 0.35, 'ellipse', 10);
    for (const w of [cw - H.viaductHalf, cw + H.viaductHalf]) extrude(fine, [a, y, ...arcPts, b, y], 'z', w - 0.12, w + 0.12);
    extrude(steel, [a, metro(a) - 0.5, b, metro(b) - 0.5, b, metro(b), a, metro(a)], 'z', cw - H.viaductHalf - 0.35, cw - H.viaductHalf + 0.35);
    extrude(steel, [a, metro(a) - 0.5, b, metro(b) - 0.5, b, metro(b), a, metro(a)], 'z', cw + H.viaductHalf - 0.35, cw + H.viaductHalf + 0.35);
  }
  // La France renaissante (Holger Wederkinch, 1930): bronze rider on a stone plinth at the island terrace
  const sp = (rec.points ?? []).find((p) => p.kind === 'artwork') ?? latLonToWorld(...H.statueAt);
  const [ss, sw] = st.local(sp.x, sp.z);
  if (Math.abs(ss) < st.f.a + 30 && Math.abs(sw) < 60) {
    const gy = ctx.height(sp.x, sp.z);
    const face = Math.atan2(st.f.uz, st.f.ux) + (sw < cw ? -Math.PI / 2 : Math.PI / 2); // looking away from the bridge
    const f = frameAt(sp.x, sp.z, face);
    box(o.buf('masonry', K.pier, undefined, f), -2.4, 2.4, gy - 0.3, gy + H.plinth, -1.3, 1.3);
    horse(o.buf('bronze', undefined, undefined, f), gy + H.plinth, H.statueHeight, 'rider');
    o.solid(-2.4, 2.4, gy - 0.3, gy + H.plinth, -1.3, 1.3, f);
  }
  walkway(o, st, top, R.bridge.railingHeight);
  return o.out();
}

// ── Pont de l'Alma (1970–74): steel girder deck, deeper over its single pier, where the Zouave (1856) stands ──

function alma(rec: BuildingRec, ctx: LandmarkCtx): BuildOut {
  const A = C.alma;
  const st = site(rec, ctx);
  const o = new Out(st.f);
  const { wL, wR, top } = st;
  const steel = o.buf(PAINT, K.alma);
  const fine = o.buf(PAINT, K.alma, 'near');
  const stone = o.buf('masonry', K.pier);
  const foot = st.bed - C.pierDepth;
  const ch = st.channels[0];
  if (!ch) return o.out();
  const [c0, c1] = [ch[0], st.channels.at(-1)![1]];
  const z = (rec.points ?? []).find((p) => p.kind === 'artwork' && p.sub === 'statue');
  const zs = z ? st.local(z.x, z.z) : undefined;
  const pier = zs && zs[0] > c0 + 10 && zs[0] < c1 - 10 ? zs[0] : undefined;
  const low = st.level + C.springAbove;
  const depth = (s: number) => {
    const h = pier === undefined ? 0 : Math.max(0, 1 - Math.abs(s - pier) / A.haunchLength) ** 2;
    const e = Math.max(0, 1 - Math.min(s - c0, c1 - s) / 12) ** 2; // haunches at the abutments too
    return A.girderDepth + (A.haunchDepth - A.girderDepth) * Math.max(h, e * 0.6);
  };
  const [e0, e1] = [c0 - 3, c1 + 3];
  const n = Math.ceil((e1 - e0) / 3);
  const ss = Array.from({ length: n + 1 }, (_, k) => e0 + ((e1 - e0) * k) / n);
  const bottom = ss.flatMap((s) => [s, Math.max(low, top(s) - depth(s))]);
  const upper: number[] = [];
  for (let k = n; k >= 0; k--) upper.push(ss[k]!, top(ss[k]!));
  extrude(steel, [...bottom, ...upper], 'z', wL, wR);
  for (const [w, d] of [[wR, 1], [wL, -1]] as const) {
    extrude(steel, [e0, top(e0) - 0.5, e1, top(e1) - 0.5, e1, top(e1), e0, top(e0)], 'z', d > 0 ? w : w - 0.3, d > 0 ? w + 0.3 : w); // fascia
    for (let s = e0 + 2; s < e1; s += 4) box(fine, s - 0.1, s + 0.1, Math.max(low, top(s) - depth(s)), top(s) - 0.5, ...(d > 0 ? [w, w + 0.12] : [w - 0.12, w]) as [number, number]);
  }
  box(stone, c0 - 4, c0, foot, top(c0) - depth(c0), wL, wR);
  box(stone, c1, c1 + 4, foot, top(c1) - depth(c1), wL, wR);
  if (pier !== undefined && zs) {
    const r = A.pierWidth / 2;
    const pt = top(pier) - depth(pier);
    box(stone, pier - r, pier + r, foot, pt, wL, wR);
    for (const [w, a0] of [[wR, 0], [wL, Math.PI]] as const) {
      prismUp(stone, circle(pier, w, r, 10, 0, a0, a0 + Math.PI).map((p) => [p[0], p[2]]), foot, pt);
    }
    // the Zouave (Georges Diebolt), the flood gauge of Paris, on a ledge of the upstream nose
    const zy = st.level + A.zouaveBase;
    const side = zs[1] < (wL + wR) / 2 ? -1 : 1;
    box(stone, pier - 1.2, pier + 1.2, foot, zy, zs[1] - 1.2, zs[1] + 1.2);
    const f = frameAt(z!.x, z!.z, Math.atan2(st.f.uz, st.f.ux) + (side > 0 ? Math.PI / 2 : -Math.PI / 2));
    figure(o.buf('masonry', LM.colours.stone, undefined, f), zy, A.zouaveHeight, false);
  }
  walkway(o, st, top, R.bridge.railingHeight);
  return o.out();
}

// ── Flamme de la Liberté (1989): gilded copper replica of the Statue of Liberty's flame (3.5 m) on a black marble pedestal ──

/** Phase 8C (graphics8c.flamme): the scan replaces it (g1 details + landmarks/models.ts); this stays its far level / fallback. */
export function flamme(rec: BuildingRec, ctx: Pick<LandmarkCtx, 'minGround'>): BuildOut {
  const F = C.flamme;
  const fp = footprintFrame(rec.outer);
  const o = new Out(fp);
  const y0 = ctx.minGround;
  const black = o.buf('masonry', K.black);
  const hs = F.pedestalSize / 2;
  const R0 = Math.max(fp.b, hs + 0.8);
  prismUp(o.buf('masonry', K.granite), circle(0, 0, R0, 24, 0).map((p) => [p[0], p[2]]), y0 - 0.3, y0 + F.step);
  const b = y0 + F.step;
  box(black, -hs - 0.15, hs + 0.15, b, b + 0.4, -hs - 0.15, hs + 0.15);
  loft(black, [[b + 0.4, hs], [b + F.pedestal - 0.35, hs * 0.85]].map(([y, s]) => [[-s!, y!, -s!], [s!, y!, -s!], [s!, y!, s!], [-s!, y!, s!]] as V3[]));
  box(black, -hs * 0.95, hs * 0.95, b + F.pedestal - 0.35, b + F.pedestal, -hs * 0.95, hs * 0.95);
  o.solid(-hs - 0.15, hs + 0.15, b, b + F.pedestal, -hs - 0.15, hs + 0.15);
  // flame: lathe whose radius swells to ~0.6 m and licks upward in 5 twisting tongues
  const g = o.buf('gold');
  const f0 = b + F.pedestal;
  lathe(g, 0, 0, [[0.28, f0], [0.36, f0 + 0.12], [0.22, f0 + 0.22]], F.segments);
  const rings: V3[][] = [];
  for (let k = 0; k <= F.rings; k++) {
    const t = k / F.rings;
    const r = 0.2 * Math.sqrt(1 - t) + 0.48 * Math.sin(Math.PI * t ** 0.75) * (1 - t) ** 0.4;
    rings.push(Array.from({ length: F.segments }, (_, i) => {
      const a = (2 * Math.PI * i) / F.segments;
      const rr = Math.max(0.005, r * (1 + 0.35 * t * Math.sin(5 * a + 6 * t)));
      return [rr * Math.cos(a) + 0.12 * t * t, f0 + 0.2 + (F.flame - 0.2) * t, rr * Math.sin(a)] as V3;
    }));
  }
  loft(g, rings);
  return o.out();
}

export const details: Partial<Record<LandmarkId, DetailFn>> = {
  'bir-hakeim': (rec, _parts, ctx) => birHakeim(rec, ctx),
  'alexandre-iii': (rec, _parts, ctx) => alexandre(rec, ctx),
  'pont-neuf': (rec, _parts, ctx) => pontNeuf(rec, ctx),
  'pont-des-arts': (rec, _parts, ctx) => pontDesArts(rec, ctx),
  alma: (rec, _parts, ctx) => alma(rec, ctx),
  ...(G8.flamme.enabled ? {} : { flamme: (rec, _parts, ctx) => flamme(rec, ctx) }),
};
