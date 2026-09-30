// Track C (docs/plans/phase4b.md §3.7, §5.2): the pedestrian sim. Pure (no three, no Rapier), deterministic: one seeded stream,
// no Math.random / Date, arrays iterated in order.
//
// Walking bands, built lazily per edge and per 50 m cell:
//  (a) both sides of every car way with a drawn sidewalk, at half + sidewalk × u (u = the person's own share of the band);
//  (b) living_street: both sides, `inset` m inside the carriageway edge;
//  (c) footway / path / pedestrian ways (squares, parks), centre ± lat × half width, minus ones that lie on a road.
// (a + b) and (c) are separate networks (ponytail: nobody moves from one to the other).
// A walker follows a few waypoints: at the far node of its edge it picks a move (turn the corner onto the adjacent edge on
// its side / cross that adjacent edge and go on / cross its own edge and come back / cross at a highway=crossing node), the
// corner point being the intersection of the two offset lines (so it always sits on the drawn kerb side, never in a road).
import { type RoadGraph, segPoint, WayFlag } from '@race/shared/graph';
import { crowd as C, player, roads as R, npc, traffic } from '../config.ts';
import { hash01 } from '../world/geom.ts';
import type { NpcRoads } from './roads.ts';
import { mulberry32, pickWeighted } from './rng.ts';
import type { CarPose, ExclusionZone, LightQuery, NpcAnchor, PedActivity, PedPose, Seat } from './types.ts';
import { NO_LIGHTS } from './types.ts';

const CELL = 50; // m, area cell
const SIDE = 1, LIVING = 2, PATH = 3; // band kinds (0 = none)
const SEAT_SALT = 41;
const yawOf = (dx: number, dz: number) => Math.atan2(-dx, -dz); // PlayerState convention: 0 = north (−Z), + = left
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const lerp = (r: readonly [number, number], t: number) => r[0] + (r[1] - r[0]) * t;

interface Gate { junction: number; edge: number; ax: number; az: number; bx: number; bz: number }
interface Wp { x: number; z: number; cross?: boolean; gate?: Gate }
/** Walking on edge e (dir +1 = edgeA → edgeB); side ±1 = sign of the lateral offset along the edge's normal (−dz, dx). */
interface Leg { e: number; dir: 1 | -1; side: 1 | -1 }
interface Cand { w: number; wps: Wp[]; after: Leg }
type Mode = 'walk' | 'wait' | 'cross' | 'idle' | 'sit';
interface Ped {
  pose: PedPose; mode: Mode; x: number; z: number; // x, z = path position; pose adds the dodge
  leg: Leg; after: Leg | null; wps: Wp[]; net: number;
  u: number; lat: number; speed: number;
  timer: number; idleAct: PedActivity; waveT: number; waveCool: number; cool: number; wait: number;
  dodge: number; yOff: number; knockX: number; knockZ: number; seat: string | null; dead: boolean;
}

const angleStep = (cur: number, target: number, max: number) => {
  const d = ((((target - cur + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI;
  return cur + clamp(d, -max, max);
};

export class Crowd {
  readonly peds: PedPose[] = [];
  lights: LightQuery = NO_LIGHTS; // D sets traffic.lights
  zones: readonly ExclusionZone[] = [];

  private readonly g: RoadGraph;
  private readonly rng: () => number;
  private readonly states: Ped[] = [];
  private nextId = 0;
  private dt = 1 / 60; // the current step, for the smoothing in place()
  private readonly kinds: Int8Array; // per edge: -1 unknown
  private readonly strip: [Map<number, number[]>, Map<number, number[]>] = [new Map(), new Map()]; // per node, edges by angle
  private readonly cells = new Map<string, number[]>();
  private readonly seatWays = new Map<number, Seat[]>();
  private readonly taken = new Set<string>();
  private area: { key: string; edges: number[]; cum: number[]; km: number } | null = null;
  private wayFirst: Int32Array | null = null;

  constructor(private readonly nr: NpcRoads, seed: number) {
    this.g = nr.graph;
    this.rng = mulberry32((seed ^ 0x43524f57) >>> 0);
    this.kinds = new Int8Array(this.g.edgeA.length).fill(-1);
  }

  /** Test hook: the state machine mode of pedestrian `id` ('walk' | 'wait' | 'cross' | 'idle' | 'sit'). */
  modeOf(id: number): string | undefined {
    return this.states.find((p) => p.pose.id === id)?.mode;
  }

  /** knocked = pedestrians the bike nose hit this step (D: the player crashes, §17.11). */
  step(dt: number, a: NpcAnchor, density: number, cars: readonly CarPose[], fill = false): { knocked: number } {
    this.dt = dt;
    const area = this.areaOf(a);
    const target = Math.min(C.max, Math.round(density * C.perKm * area.km));
    const far = C.radius + C.despawnMargin;
    for (let i = this.states.length - 1; i >= 0; i--) {
      const p = this.states[i]!;
      if (p.dead || Math.hypot(p.pose.x - a.x, p.pose.z - a.z) > far) this.remove(i);
    }
    if (this.states.length > target + 1) {
      // density dropped: retire the farthest one that is not beside the anchor
      let worst = -1, wd = 0.5 * C.radius;
      this.states.forEach((p, i) => {
        const d = Math.hypot(p.pose.x - a.x, p.pose.z - a.z);
        if (d > wd) (wd = d), (worst = i);
      });
      if (worst >= 0) this.remove(worst);
    }
    if (fill) for (let tries = 0; this.states.length < target && tries < target * 30; tries++) this.spawn(a, true, area);
    else if (this.states.length < target) this.spawn(a, false, area);
    let knocked = 0;
    for (const p of this.states) knocked += this.update(p, dt, a, cars);
    return { knocked };
  }

  /** Seats within r m of (x, z), deterministic from the graph (chairs drawn whether used or not). */
  seatsNear(x: number, z: number, r: number): readonly Seat[] {
    const ways = new Set<number>();
    for (const e of this.g.edgesNear(x, z, r + 12)) if (this.kind(e) === PATH) ways.add(this.g.edgeWay[e]!);
    const out: Seat[] = [];
    for (const w of [...ways].sort((p, q) => p - q)) for (const s of this.seatsOf(w)) if (Math.hypot(s.x - x, s.z - z) <= r) out.push(s);
    return out;
  }

  // ── bands ────────────────────────────────────────────────────────────────────────────────────────
  private kind(e: number): number {
    let k = this.kinds[e]!;
    if (k >= 0) return k;
    const g = this.g, w = g.edgeWay[e]!, f = g.flags(e);
    k = 0;
    if (g.edgeA[e] === g.edgeB[e] || g.edgeLength[e]! < 0.5) k = 0;
    else if (f & WayFlag.car) k = this.nr.sidewalk(w) > 0 ? SIDE : this.nr.kind(w) === 'living_street' ? LIVING : 0;
    else if (f & WayFlag.walk && !(f & (WayFlag.steps | WayFlag.sidewalk | WayFlag.crossing)) && R.footKinds.includes(this.nr.kind(w)) && this.nr.kind(w) !== 'steps') k = this.onRoad(e) ? 0 : PATH;
    this.kinds[e] = k;
    return k;
  }

  /** A footway whose line runs through a drawn carriageway (plaza crossings) is no band: people would walk on the road. */
  private onRoad(e: number): boolean {
    const g = this.g, a = g.edgeA[e]!, b = g.edgeB[e]!, n = Math.ceil(g.edgeLength[e]! / 4);
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      if (this.inRoad(g.x[a]! + (g.x[b]! - g.x[a]!) * t, g.z[a]! + (g.z[b]! - g.z[a]!) * t, 0.1)) return true;
    }
    return false;
  }

  /** Inside the drawn carriageway of a way with raised sidewalks (slack m inside its edge). */
  private inRoad(x: number, z: number, slack: number): boolean {
    const g = this.g;
    for (const e of g.edgesNear(x, z, 22)) {
      if (!(g.flags(e) & WayFlag.car)) continue;
      const w = g.edgeWay[e]!;
      if (this.nr.sidewalk(w) <= 0) continue;
      const a = g.edgeA[e]!, b = g.edgeB[e]!;
      if (segPoint(x, z, g.x[a]!, g.z[a]!, g.x[b]!, g.z[b]!)[1] < this.nr.halfWidth(w) - slack) return true;
    }
    return false;
  }

  private norm(e: number): [number, number] {
    const g = this.g, a = g.edgeA[e]!, b = g.edgeB[e]!, L = g.edgeLength[e]!;
    return [-(g.z[b]! - g.z[a]!) / L, (g.x[b]! - g.x[a]!) / L]; // (−dz, dx) of edgeA → edgeB
  }

  /** Unit vector from node n along edge e. */
  private outDir(e: number, n: number): [number, number] {
    const g = this.g, a = g.edgeA[e]!, b = g.edgeB[e]!, L = g.edgeLength[e]!;
    const s = n === a ? 1 : -1;
    return [(s * (g.x[b]! - g.x[a]!)) / L, (s * (g.z[b]! - g.z[a]!)) / L];
  }

  /** Band edges at node n sorted by angle (path = network (c)). */
  private strips(n: number, path: boolean): number[] {
    const map = this.strip[path ? 1 : 0];
    let list = map.get(n);
    if (!list) {
      list = this.g.edgesOf(n).filter((e) => (path ? this.kind(e) === PATH : this.kind(e) === SIDE || this.kind(e) === LIVING));
      const ang = new Map(list.map((e) => [e, Math.atan2(this.outDir(e, n)[1], this.outDir(e, n)[0])]));
      list.sort((p, q) => ang.get(p)! - ang.get(q)! || p - q);
      map.set(n, list);
    }
    return list;
  }

  /** Signed lateral offset along edge e's normal of this person on `side` (path: lat × half width in the travel frame). */
  private ofs(p: Ped, e: number, side: number, dir: number): number {
    const w = this.g.edgeWay[e]!, h = this.nr.halfWidth(w);
    const k = this.kind(e);
    if (k === PATH) return p.lat * h * dir;
    return side * (k === SIDE ? h + this.nr.sidewalk(w) * p.u : Math.max(0.3, h - C.inset));
  }

  /** Sign of e's normal that faces the wedge toward e's neighbour at node n (sgn: +1 = neighbour is next in angle). */
  private face(n: number, e: number, sgn: number): 1 | -1 {
    return (sgn > 0 ? 1 : -1) * (n === this.g.edgeA[e] ? -1 : 1) as 1 | -1;
  }

  /** Where the offset line o1 of e1 meets the offset line o2 of e2 (both through node n); the mean when nearly parallel; a bevel
   *  (the two perpendicular feet) when the wedge is so acute that the meeting point would be far from the node. */
  private corner(n: number, e1: number, o1: number, e2: number, o2: number): Wp[] {
    const [m1x, m1z] = this.norm(e1), [m2x, m2z] = this.norm(e2), nx = this.g.x[n]!, nz = this.g.z[n]!;
    const det = m1x * m2z - m1z * m2x;
    if (Math.abs(det) < 0.3) return [{ x: nx + (m1x * o1 + m2x * o2) / 2, z: nz + (m1z * o1 + m2z * o2) / 2 }];
    const qx = (o1 * m2z - o2 * m1z) / det, qz = (m1x * o2 - m2x * o1) / det;
    // inside of a bend the offset lines fold: a meeting point farther back than an edge is long is no corner
    const [u1x, u1z] = this.outDir(e1, n), [u2x, u2z] = this.outDir(e2, n);
    const fold = qx * u1x + qz * u1z > this.g.edgeLength[e1]! || qx * u2x + qz * u2z > this.g.edgeLength[e2]!;
    if (!fold && Math.hypot(qx, qz) <= 3 * Math.max(Math.abs(o1), Math.abs(o2))) return [{ x: nx + qx, z: nz + qz }];
    return [{ x: nx + m1x * o1, z: nz + m1z * o1 }, { x: nx + m2x * o2, z: nz + m2z * o2 }];
  }

  // ── zones ────────────────────────────────────────────────────────────────────────────────────────
  private inZone(x: number, z: number, extra = 0): boolean {
    for (const c of this.zones) if (Math.hypot(x - c.x, z - c.z) < c.r + npc.zoneMargin + extra) return true;
    return false;
  }

  private edgeHitsZone(e: number): boolean {
    if (!this.zones.length) return false;
    const g = this.g, a = g.edgeA[e]!, b = g.edgeB[e]!, w = g.edgeWay[e]!;
    const reach = this.nr.halfWidth(w) + this.nr.sidewalk(w) + 1;
    return this.zones.some((c) => segPoint(c.x, c.z, g.x[a]!, g.z[a]!, g.x[b]!, g.z[b]!)[1] < c.r + npc.zoneMargin + reach);
  }

  // ── route planning ───────────────────────────────────────────────────────────────────────────────
  /** Picks the next move at the far node; false = nothing valid (a band overlapped by a foreign road): the caller drops p. */
  private plan(p: Ped, noCross: boolean): boolean {
    const cands = p.net === PATH ? this.candPath(p) : this.candSide(p, noCross);
    let ok = cands.filter((c) => this.valid(c, p));
    if (!ok.length) ok = [this.back(p)].filter((c) => this.valid(c, p));
    if (!ok.length) return (p.dead = true), false;
    const pick = ok[pickWeighted(this.rng, ok.map((c) => c.w))]!;
    p.wps = pick.wps;
    p.after = pick.after;
    return true;
  }

  /** Waypoints outside zones; every walked point (chords sampled each 1.5 m) on a drawn band and clear of carriageways. */
  private valid(c: Cand, p: Ped): boolean {
    let x = p.x, z = p.z;
    for (const w of c.wps) {
      if (this.inZone(w.x, w.z) || !this.onBand(w.x, w.z)) return false;
      if (!w.cross) {
        const n = Math.ceil(Math.hypot(w.x - x, w.z - z) / 1.5);
        for (let i = 1; i < n; i++) if (!this.onBand(x + ((w.x - x) * i) / n, z + ((w.z - z) * i) / n)) return false;
      }
      (x = w.x), (z = w.z);
    }
    return !this.edgeHitsZone(c.after.e);
  }

  /** On a drawn walking band (sidewalk strip, living street, footway) and not inside a sidewalk road's carriageway. */
  private onBand(x: number, z: number): boolean {
    const g = this.g, nr = this.nr;
    let band = false;
    for (const e of g.edgesNear(x, z, 22)) {
      const k = this.kind(e);
      if (!k) continue;
      const w = g.edgeWay[e]!, a = g.edgeA[e]!, b = g.edgeB[e]!, h = nr.halfWidth(w);
      const d = segPoint(x, z, g.x[a]!, g.z[a]!, g.x[b]!, g.z[b]!)[1];
      if (k === SIDE) {
        if (d < h + 0.05) return false; // inside the carriageway
        if (d <= h + nr.sidewalk(w) + 0.05) band = true;
      } else if (d <= h + 0.05) band = true;
    }
    return band;
  }

  /** Turn around at the far node (dead end / nothing valid): same edge, other direction. */
  private back(p: Ped): Cand {
    const { e, dir, side } = p.leg, n1 = dir > 0 ? this.g.edgeB[e]! : this.g.edgeA[e]!;
    const [mx, mz] = this.norm(e), o = this.ofs(p, e, side, dir), o2 = this.ofs(p, e, side, -dir);
    const x = this.g.x[n1]!, z = this.g.z[n1]!;
    return { w: 1, wps: [{ x: x + mx * o, z: z + mz * o }, { x: x + mx * o2, z: z + mz * o2 }], after: { e, dir: (-dir) as 1 | -1, side } };
  }

  private candPath(p: Ped): Cand[] {
    const g = this.g, { e, dir } = p.leg, n1 = dir > 0 ? g.edgeB[e]! : g.edgeA[e]!;
    const o = this.ofs(p, e, 1, dir), inn = this.outDir(e, n1);
    return this.strips(n1, true).filter((x) => x !== e).map((e1) => {
      const d1: 1 | -1 = n1 === g.edgeA[e1] ? 1 : -1, out = this.outDir(e1, n1);
      const c = this.corner(n1, e, o, e1, this.ofs(p, e1, 1, d1));
      const cos = -(inn[0] * out[0] + inn[1] * out[1]); // 1 = straight on
      return { w: (1 + cos) ** 2 + 0.05, wps: c, after: { e: e1, dir: d1, side: 1 } };
    });
  }

  private candSide(p: Ped, noCross: boolean): Cand[] {
    const g = this.g, nr = this.nr, { e, dir, side } = p.leg, n1 = dir > 0 ? g.edgeB[e]! : g.edgeA[e]!;
    const o = this.ofs(p, e, side, dir), [nx, nz] = [g.x[n1]!, g.z[n1]!];
    const list = this.strips(n1, false), deg = list.length, idx = list.indexOf(e);
    if (deg < 2 || idx < 0) return [this.back(p)];
    const sgn = (n1 === g.edgeA[e]) === o > 0 ? 1 : -1; // angular direction of the wedge the walker stands in
    const e1 = list[(idx + sgn + deg) % deg]!;
    const s1 = this.face(n1, e1, sgn), d1: 1 | -1 = n1 === g.edgeA[e1] ? 1 : -1;
    const c = this.corner(n1, e, o, e1, this.ofs(p, e1, s1, d1));
    const crossNode = nr.crossing[n1] === 1 && deg === 2;
    const out: Cand[] = [{ w: crossNode && !noCross ? 1 - C.crossChance : 1, wps: c, after: { e: e1, dir: d1, side: s1 } }];
    if (noCross) return out;
    const seg = (junction: number, edge: number, q1: [number, number], q2: [number, number]): Gate => ({ junction, edge, ax: q1[0], az: q1[1], bx: q2[0], bz: q2[1] });
    const [mx, mz] = this.norm(e);
    if (deg === 2) {
      if (!crossNode) return out;
      // highway=crossing in mid-block: cross straight over and carry on on the other side
      const q1: [number, number] = [nx + mx * o, nz + mz * o], q2: [number, number] = [nx - mx * o, nz - mz * o];
      const [m1x, m1z] = this.norm(e1);
      out.push({ w: C.crossChance, wps: [{ ...pt(q1), gate: seg(n1, e, q1, q2) }, { ...pt(q2), cross: true }], after: { e: e1, dir: d1, side: m1x * (q2[0] - nx) + m1z * (q2[1] - nz) > 0 ? 1 : -1 } });
      return out;
    }
    // cross the adjacent edge e1 at the mouth and go on along e2
    const e2 = list[(idx + 2 * sgn + 2 * deg) % deg]!;
    const he = nr.halfWidth(g.edgeWay[e]!), h1 = nr.halfWidth(g.edgeWay[e1]!), h2 = nr.halfWidth(g.edgeWay[e2]!);
    const cd = Math.min(Math.max(he, h2) + 1, he + Math.max(nr.sidewalk(g.edgeWay[e]!), 1.5) - 0.3);
    const [m1x, m1z] = this.norm(e1), [ux, uz] = this.outDir(e1, n1), k = s1 * (h1 + 0.3);
    const q1: [number, number] = [nx + ux * cd + m1x * k, nz + uz * cd + m1z * k], q2: [number, number] = [nx + ux * cd - m1x * k, nz + uz * cd - m1z * k];
    const s2 = this.face(n1, e2, sgn), d2: 1 | -1 = n1 === g.edgeA[e2] ? 1 : -1;
    const c2 = this.corner(n1, e1, this.ofs(p, e1, -s1 as 1 | -1, d1), e2, this.ofs(p, e2, s2, d2));
    out.push({ w: 0.5, wps: [...c, { ...pt(q1), gate: seg(n1, e1, q1, q2) }, { ...pt(q2), cross: true }, ...c2], after: { e: e2, dir: d2, side: s2 } });
    // cross the own edge a little before the node and come back on the other side
    const others = list.filter((x) => x !== e), hm = Math.max(...others.map((x) => nr.halfWidth(g.edgeWay[x]!)));
    const cb = Math.max(1, Math.min(hm + 1, g.edgeLength[e]! * 0.5)), [ex, ez] = this.outDir(e, n1);
    const b1: [number, number] = [nx + ex * cb + mx * o, nz + ez * cb + mz * o], b2: [number, number] = [nx + ex * cb - mx * o, nz + ez * cb - mz * o];
    out.push({ w: 0.2, wps: [{ ...pt(b1), gate: seg(n1, e, b1, b2) }, { ...pt(b2), cross: true }], after: { e, dir: (-dir) as 1 | -1, side: (-side) as 1 | -1 } });
    return out;
  }

  /** Nobody is about to reach the crossing segment within crossGap s, and the light (if any) lets pedestrians go. */
  private clear(gt: Gate, cars: readonly CarPose[]): boolean {
    if (!this.lights.pedMayCross(gt.junction, gt.edge)) return false;
    const segD = (x: number, z: number) => segPoint(x, z, gt.ax, gt.az, gt.bx, gt.bz)[1];
    const cx = (gt.ax + gt.bx) / 2, cz = (gt.az + gt.bz) / 2;
    for (const c of cars) {
      const ahead = c.speed * C.crossGap + 1.5;
      if (Math.hypot(c.x - cx, c.z - cz) > ahead + 12) continue;
      if (segD(c.x, c.z) < 3) return false;
      if (c.speed < 0.3) continue;
      const hx = -Math.sin(c.yaw), hz = -Math.cos(c.yaw);
      for (let t = 1.5; t <= ahead; t += 1.5) if (segD(c.x + hx * t, c.z + hz * t) < 1.8) return false;
    }
    return true;
  }

  // ── population ───────────────────────────────────────────────────────────────────────────────────
  private cellEdges(ix: number, iz: number): number[] {
    const key = `${ix},${iz}`;
    let out = this.cells.get(key);
    if (!out) {
      const g = this.g, seen = new Set<number>();
      out = [];
      for (const e of g.edgesNear((ix + 0.5) * CELL, (iz + 0.5) * CELL, 36)) {
        if (seen.has(e)) continue;
        seen.add(e);
        const a = g.edgeA[e]!, b = g.edgeB[e]!;
        if (Math.floor((g.x[a]! + g.x[b]!) / 2 / CELL) === ix && Math.floor((g.z[a]! + g.z[b]!) / 2 / CELL) === iz && this.kind(e)) out.push(e);
      }
      out.sort((p, q) => p - q);
      this.cells.set(key, out);
    }
    return out;
  }

  /** Band edges within radius of the anchor's cell (cached until the anchor changes cell) + their total km. */
  private areaOf(a: NpcAnchor) {
    const ix = Math.floor(a.x / CELL), iz = Math.floor(a.z / CELL), key = `${ix},${iz}`;
    if (this.area?.key === key) return this.area;
    const g = this.g, n = Math.ceil(C.radius / CELL), edges: number[] = [], cum: number[] = [];
    let len = 0, km = 0;
    const cx = (ix + 0.5) * CELL, cz = (iz + 0.5) * CELL;
    for (let i = -n; i <= n; i++) {
      for (let j = -n; j <= n; j++) {
        for (const e of this.cellEdges(ix + i, iz + j)) {
          const p = g.edgeA[e]!, q = g.edgeB[e]!;
          if (Math.hypot((g.x[p]! + g.x[q]!) / 2 - cx, (g.z[p]! + g.z[q]!) / 2 - cz) > C.radius) continue;
          edges.push(e);
          cum.push((len += g.edgeLength[e]!));
          km += (g.edgeLength[e]! * (this.kind(e) === PATH ? 1 : 2)) / 1000; // sidewalks: both sides
        }
      }
    }
    return (this.area = { key, edges, cum, km });
  }

  private spawn(a: NpcAnchor, fill: boolean, area: { edges: number[]; cum: number[] }): boolean {
    const g = this.g, rng = this.rng, rmin = fill ? 8 : 0.6 * C.radius, cone = (traffic.viewConeDeg * Math.PI) / 180;
    const inCone = (x: number, z: number) => !fill && Math.abs(angleStep(a.viewYaw, yawOf(x - a.x, z - a.z), Math.PI) - a.viewYaw) < cone;
    const okPos = (x: number, z: number) => {
      const d = Math.hypot(x - a.x, z - a.z);
      return d >= rmin && d <= C.radius && !this.inZone(x, z) && !inCone(x, z);
    };
    const id = this.nextId++;
    const mk = (x: number, z: number, leg: Leg, net: number, mode: Mode): Ped => {
      const stroll = rng() < C.strollShare;
      const p: Ped = {
        pose: { id, avatar: Math.floor(rng() * C.avatars), x, y: 0, z, yaw: 0, speed: 0, activity: 'walk', activityTime: rng() * 10, stagger: -1, staggerYaw: 0 },
        mode, x, z, leg, after: null, wps: [], net, u: lerp(C.band, rng()), lat: (rng() * 2 - 1) * 0.6,
        speed: lerp(stroll ? C.strollSpeed : C.walkSpeed, rng()), timer: 0, idleAct: 'stand', waveT: 0, waveCool: 0, cool: 0, wait: 0,
        dodge: 0, yOff: 0, knockX: 0, knockZ: 0, seat: null, dead: false,
      };
      return p;
    };
    if (rng() < C.sitShare) {
      const free = this.seatsNear(a.x, a.z, C.radius).filter((s) => !this.taken.has(seatKey(s)) && okPos(s.x, s.z));
      if (free.length) {
        const s = free[Math.floor(rng() * free.length)]!;
        const p = mk(s.x, s.z, { e: -1, dir: 1, side: 1 }, 0, 'sit');
        p.seat = seatKey(s);
        this.taken.add(p.seat);
        p.pose.yaw = s.yaw;
        p.pose.activity = 'sit';
        p.pose.y = this.nr.heightAt(s.x, s.z);
        this.add(p);
        return true;
      }
    }
    if (!area.edges.length) return false;
    for (let tries = 0; tries < 14; tries++) {
      const r = rng() * area.cum[area.cum.length - 1]!;
      let lo = 0, hi = area.cum.length - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (area.cum[mid]! < r) lo = mid + 1;
        else hi = mid;
      }
      const e = area.edges[lo]!, t = rng(), dir: 1 | -1 = rng() < 0.5 ? 1 : -1, side: 1 | -1 = rng() < 0.5 ? 1 : -1;
      const p = mk(0, 0, { e, dir, side }, this.kind(e) === PATH ? PATH : SIDE, 'walk');
      const av = g.edgeA[e]!, bv = g.edgeB[e]!, [mx, mz] = this.norm(e), o = this.ofs(p, e, side, dir);
      const x = g.x[av]! + (g.x[bv]! - g.x[av]!) * t + mx * o, z = g.z[av]! + (g.z[bv]! - g.z[av]!) * t + mz * o;
      if (!okPos(x, z) || this.edgeHitsZone(e) || !this.onBand(x, z)) continue;
      p.x = p.pose.x = x;
      p.z = p.pose.z = z;
      if (!this.plan(p, false)) continue;
      const w = p.wps[0]!;
      p.pose.yaw = yawOf(w.x - x, w.z - z);
      this.add(p);
      return true;
    }
    return false;
  }

  private add(p: Ped): void {
    this.states.push(p);
    this.peds.push(p.pose);
  }

  private remove(i: number): void {
    const p = this.states[i]!;
    if (p.seat) this.taken.delete(p.seat);
    this.states.splice(i, 1);
    this.peds.splice(i, 1);
  }

  // ── seats ────────────────────────────────────────────────────────────────────────────────────────
  private seatsOf(way: number): Seat[] {
    let out = this.seatWays.get(way);
    if (out) return out;
    out = [];
    const g = this.g;
    if (!this.wayFirst) {
      this.wayFirst = new Int32Array(g.file.ways.length).fill(-1);
      for (let e = g.edgeWay.length - 1; e >= 0; e--) this.wayFirst[g.edgeWay[e]!] = e;
    }
    let cum = 0;
    for (let e = this.wayFirst[way]!; e >= 0 && e < g.edgeWay.length && g.edgeWay[e] === way; e++) {
      const L = g.edgeLength[e]!, a = g.edgeA[e]!, b = g.edgeB[e]!;
      if (this.kind(e) === PATH) {
        const [mx, mz] = this.norm(e);
        for (let s = (Math.floor(cum / C.seatEvery) + 0.5) * C.seatEvery; s < cum + L; s += C.seatEvery) {
          if (s < cum) continue;
          const t = (s - cum) / L, px = g.x[a]! + (g.x[b]! - g.x[a]!) * t, pz = g.z[a]! + (g.z[b]! - g.z[a]!) * t;
          if (hash01(px, pz, SEAT_SALT) >= C.seatChance) continue;
          const side = hash01(px, pz, SEAT_SALT + 1) < 0.5 ? 1 : -1, sx = px + mx * side * C.seatOffset, sz = pz + mz * side * C.seatOffset;
          if (this.nearCarRoad(sx, sz, C.seatRoadClear)) continue;
          out.push({ x: sx, z: sz, yaw: yawOf(-mx * side, -mz * side) });
        }
      }
      cum += L;
    }
    this.seatWays.set(way, out);
    return out;
  }

  private nearCarRoad(x: number, z: number, r: number): boolean {
    const g = this.g;
    for (const e of g.edgesNear(x, z, r + 2)) {
      if (!this.nr.car[e]) continue;
      if (segPoint(x, z, g.x[g.edgeA[e]!]!, g.z[g.edgeA[e]!]!, g.x[g.edgeB[e]!]!, g.z[g.edgeB[e]!]!)[1] < r) return true;
    }
    return false;
  }

  // ── per-pedestrian step ──────────────────────────────────────────────────────────────────────────
  private update(p: Ped, dt: number, a: NpcAnchor, cars: readonly CarPose[]): number {
    const ps = p.pose;
    let knocked = 0;
    ps.activityTime += dt;
    p.cool -= dt;
    p.waveCool -= dt;
    if (this.zones.length && this.inZone(p.x, p.z)) {
      // a zone was placed on top of us: sitters vanish (ponytail), walkers head straight out without stopping
      if (p.mode === 'sit') return (p.dead = true), 0;
      const c = this.zones.filter((z) => Math.hypot(p.x - z.x, p.z - z.z) < z.r + npc.zoneMargin).sort((q, r) => Math.hypot(p.x - q.x, p.z - q.z) - Math.hypot(p.x - r.x, p.z - r.z))[0]!;
      const d = Math.hypot(p.x - c.x, p.z - c.z) || 1, ux = (p.x - c.x) / d, uz = (p.z - c.z) / d;
      p.x += ux * p.speed * dt;
      p.z += uz * p.speed * dt;
      ps.yaw = angleStep(ps.yaw, yawOf(ux, uz), C.turnRate * dt);
      p.mode = 'walk';
      p.wps = [];
      this.plan(p, true);
      this.act(p, 'walk', p.speed);
      this.place(p);
      return 0;
    }
    if (a.body && ps.stagger < 0 && p.cool <= 0 && p.mode !== 'sit') {
      const r = C.bodyRadius + player.radius;
      const body = Math.hypot(ps.x - a.x, ps.z - a.z) < r;
      const nose = !!a.nose && Math.hypot(ps.x - a.nose.x, ps.z - a.nose.z) < r;
      if (body || nose) {
        const hx = nose ? a.nose!.x : a.x, hz = nose ? a.nose!.z : a.z;
        const dx = ps.x - hx, dz = ps.z - hz, d = Math.hypot(dx, dz);
        const ux = d > 1e-6 ? dx / d : -Math.sin(ps.yaw), uz = d > 1e-6 ? dz / d : -Math.cos(ps.yaw);
        ps.stagger = 0;
        ps.staggerYaw = yawOf(ux, uz);
        p.knockX = ux * C.stagger.push;
        p.knockZ = uz * C.stagger.push;
        if (nose) knocked++;
      }
    }
    if (ps.stagger >= 0) {
      // pushed away over stagger.seconds (linear ease-out: the integral is exactly `push`), then on with the walk
      ps.stagger += dt;
      const k = (2 * dt * Math.max(0, 1 - ps.stagger / C.stagger.seconds)) / C.stagger.seconds;
      p.x += p.knockX * k;
      p.z += p.knockZ * k;
      this.act(p, 'stand', 0);
      if (ps.stagger >= C.stagger.seconds) (ps.stagger = -1), (p.cool = C.hitCooldown);
      this.place(p);
      return knocked;
    }
    if (p.mode === 'sit') return knocked;
    // wave back at a close pedestrian-facing player who pressed G
    if (p.waveT <= 0 && p.waveCool <= 0 && a.body && a.waving && p.mode !== 'cross' && Math.hypot(a.x - ps.x, a.z - ps.z) < C.waveBack) {
      const dx = a.x - ps.x, dz = a.z - ps.z, l = Math.hypot(dx, dz) || 1;
      if ((dx * -Math.sin(ps.yaw) + dz * -Math.cos(ps.yaw)) / l > 0.5) (p.waveT = C.waveSeconds), (p.waveCool = C.waveSeconds + 3);
    }
    if (p.waveT > 0) {
      p.waveT -= dt;
      ps.yaw = angleStep(ps.yaw, yawOf(a.x - ps.x, a.z - ps.z), C.turnRate * dt);
      this.act(p, 'wave', 0);
      this.place(p);
      return knocked;
    }
    if (p.mode === 'idle') {
      p.timer -= dt;
      this.act(p, p.idleAct, 0);
      if (p.timer <= 0) p.mode = 'walk';
      this.place(p);
      return knocked;
    }
    if (p.mode === 'wait') {
      p.wait += dt;
      this.act(p, 'stand', 0);
      const w = p.wps[0]!;
      if (this.clear(w.gate!, cars)) (p.wps.shift(), (p.mode = 'walk'));
      else if (p.wait > C.giveUp) (p.wps = []), this.plan(p, true), (p.mode = 'walk');
      else return this.place(p), knocked;
    }
    // walk / cross
    let hold = false;
    this.dodgeStep(p, dt, a, (h) => (hold = h));
    let budget = hold ? 0 : p.speed * dt, moved = 0;
    for (let guard = 0; guard < 6 && p.wps.length; guard++) {
      const w = p.wps[0]!, dx = w.x - p.x, dz = w.z - p.z, d = Math.hypot(dx, dz);
      if (d > 1e-6) ps.yaw = angleStep(ps.yaw, yawOf(dx, dz), C.turnRate * dt);
      if (d > budget) {
        p.x += (dx / d) * budget;
        p.z += (dz / d) * budget;
        moved += budget;
        break;
      }
      p.x = w.x;
      p.z = w.z;
      budget -= d;
      moved += d;
      if (w.gate && !this.clear(w.gate, cars)) {
        p.mode = 'wait';
        p.wait = 0;
        break;
      }
      p.wps.shift();
      if (!p.wps.length) (p.leg = p.after!), this.plan(p, false);
    }
    if (p.mode !== 'wait') {
      p.mode = p.wps[0]?.cross ? 'cross' : 'walk';
      if (p.mode === 'walk' && moved > 0 && !this.inZone(p.x, p.z, 4) && this.rng() < ((C.idle.per100m / 100) * (p.net === PATH ? 2 : 1)) * moved) {
        p.mode = 'idle';
        p.timer = lerp(C.idle.seconds, this.rng());
        p.idleAct = (['stand', 'lookAround', 'phone'] as const)[Math.floor(this.rng() * 3)]!;
      }
    }
    this.act(p, p.mode === 'wait' || p.mode === 'idle' ? (p.mode === 'idle' ? p.idleAct : 'stand') : 'walk', moved / dt);
    this.place(p);
    return knocked;
  }

  /** Sidestep a player coming head-on (smooth, never toward the road), or hold still when nearly touching. */
  private dodgeStep(p: Ped, dt: number, a: NpcAnchor, setHold: (h: boolean) => void): void {
    const ps = p.pose;
    const hx = -Math.sin(ps.yaw), hz = -Math.cos(ps.yaw), rx = -hz, rz = hx;
    let want = 0;
    if (a.body && p.mode === 'walk') {
      const dx = a.x - ps.x, dz = a.z - ps.z, ah = dx * hx + dz * hz, lt = dx * rx + dz * rz + p.dodge; // lt: player's side of the path itself
      if (ah > -1 && ah < C.avoid.ahead && Math.abs(lt) < C.avoid.side) want = (lt >= 0 ? -1 : 1) * C.avoid.shift;
      setHold(ah > 0 && ah < 1.2 && Math.abs(lt) < 0.45);
      if (this.kind(p.leg.e) === SIDE) {
        const w = this.g.edgeWay[p.leg.e]!, [mx, mz] = this.norm(p.leg.e), o = this.ofs(p, p.leg.e, p.leg.side, p.leg.dir);
        const dot = (rx * mx + rz * mz) * -Math.sign(o); // + = the walker's right points toward the carriageway
        const room = Math.max(0, Math.abs(o) - this.nr.halfWidth(w) - 0.1);
        if (dot > 0.5) want = Math.min(want, room);
        else if (dot < -0.5) want = Math.max(want, -room);
      }
    }
    p.dodge += clamp(want - p.dodge, -2 * dt, 2 * dt);
  }

  private act(p: Ped, act: PedActivity, speed: number): void {
    const ps = p.pose;
    if (ps.activity !== act) (ps.activity = act), (ps.activityTime = 0);
    ps.speed = speed;
  }

  /** Pose = path position + dodge; y = ground (bridge decks via NpcRoads.heightOn) + the kerb on raised sidewalks. */
  private place(p: Ped): void {
    const dt = this.dt, ps = p.pose, g = this.g, e = p.leg.e;
    const rx = Math.cos(ps.yaw), rz = -Math.sin(ps.yaw); // right of heading (−sin, −cos) is (cos, −sin)
    ps.x = p.x + rx * p.dodge;
    ps.z = p.z + rz * p.dodge;
    if (e < 0) return;
    const a = g.edgeA[e]!, b = g.edgeB[e]!, L = g.edgeLength[e]!;
    const s = clamp(((ps.x - g.x[a]!) * (g.x[b]! - g.x[a]!) + (ps.z - g.z[a]!) * (g.z[b]! - g.z[a]!)) / L, 0, L);
    const add = this.kind(e) === SIDE && p.mode !== 'cross' ? R.lift + R.curbHeight : 0;
    p.yOff += clamp(add - p.yOff, -2 * dt, 2 * dt);
    ps.y = this.nr.heightOn(e, s) + p.yOff;
  }
}

const pt = (q: [number, number]) => ({ x: q[0], z: q[1] });
const seatKey = (s: Seat) => `${Math.round(s.x * 10)},${Math.round(s.z * 10)}`;
