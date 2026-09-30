// Track B (docs/plans/phase4b.md §3.6): NPC car simulation on the road graph. Pure: no three, no Rapier, no Math.random / Date.
// Cars drive directed edges (edge e forward = 2e, backward = 2e + 1) on the right-hand lane of their way, follow a route of
// directed edges chosen at each node, cut corners with quadratic Béziers, follow the car ahead in the same lane, stop at
// lights / yield lines / roundabout entries and brake for the player, pedestrians and parked test cars.
// ponytail: no lane changes, no overtaking; the corner Bézier is walked at constant s-speed; obstacles are tested against the
// straight lane lines (not the corner curve); turns never yield to oncoming cars on green. Upgrade path: phase4b.md §10.
import { crowd, npc, render, traffic } from '../config.ts';
import { arrives, carEdges, farNode, stopDistance, TrafficLights } from './lights.ts';
import { mulberry32, pickWeighted } from './rng.ts';
import type { NpcRoads } from './roads.ts';
import type { CarKind, CarPose, ExclusionZone, NpcAnchor, PedPose } from './types.ts';
import { WayFlag } from '@race/shared/graph';

const SEED = 0x7a11c;

/** Start point, unit direction and length of a straight directed edge. */
export interface Seg { x: number; z: number; dx: number; dz: number; len: number }
export interface PathOut { x: number; z: number; yaw: number }

/** Pure: position + heading of a car s m along segment a (lane offset offA, + = right of travel) that turns onto b (offset offB)
 *  with a quadratic Bézier between s = a.len − c and s = a.len + c (virtual length 2c; b starts at s = a.len + c − c). */
export function pathPoint(a: Seg, offA: number, b: Seg, offB: number, c: number, s: number, out: PathOut): PathOut {
  const sc = a.len - c;
  if (s <= sc || c <= 0) {
    out.x = a.x + a.dx * s - a.dz * offA;
    out.z = a.z + a.dz * s + a.dx * offA;
    out.yaw = Math.atan2(-a.dx, -a.dz);
    return out;
  }
  const p0x = a.x + a.dx * sc - a.dz * offA, p0z = a.z + a.dz * sc + a.dx * offA;
  const p2x = b.x + b.dx * c - b.dz * offB, p2z = b.z + b.dz * c + b.dx * offB;
  const ex = p2x - p0x, ez = p2z - p0z, chord = Math.hypot(ex, ez);
  const cr = a.dx * b.dz - a.dz * b.dx; // control point = where the two tangent lines meet
  let p1x = (p0x + p2x) / 2, p1z = (p0z + p2z) / 2;
  if (Math.abs(cr) > 1e-3) {
    const ta = (ex * b.dz - ez * b.dx) / cr, tb = (ex * a.dz - ez * a.dx) / cr;
    if (ta > 0.05 && tb < -0.05 && ta < 2 * chord + 1 && -tb < 2 * chord + 1) (p1x = p0x + ta * a.dx), (p1z = p0z + ta * a.dz);
  }
  const t = Math.min(1, Math.max(0, (s - sc) / (2 * c))), u = 1 - t;
  out.x = u * u * p0x + 2 * u * t * p1x + t * t * p2x;
  out.z = u * u * p0z + 2 * u * t * p1z + t * t * p2z;
  const tx = 2 * (u * (p1x - p0x) + t * (p2x - p1x)), tz = 2 * (u * (p1z - p0z) + t * (p2z - p1z));
  out.yaw = Math.hypot(tx, tz) > 1e-6 ? Math.atan2(-tx, -tz) : Math.atan2(-a.dx, -a.dz);
  return out;
}

/** A simulated car: the public pose plus its driving state (tests read the state through this type). */
export interface SimCar extends CarPose {
  readonly len: number; readonly wid: number; readonly vf: number; readonly wheelR: number;
  readonly parked: boolean;
  lane: number;      // wanted lane, clamped per edge
  route: number[];   // directed edges, [0] = the one it is on
  s: number;         // m of the car centre along route[0] from its start node (> length while inside the corner)
  still: number;     // s standing still
  grant: number;     // node whose yield line this car was let through, −1 = none
  claim: number;     // directed edge this car has reserved to turn onto (one car per exit at a time), −1 = none
  next: number;      // speed for the coming step
}

type CtlKind = 'none' | 'lit' | 'yield' | 'equal' | 'ring';
interface Ctl { kind: CtlKind; major: Set<number>; ringIn: number }

const TAU = Math.PI * 2;
const angDiff = (a: number, b: number) => Math.abs(((a - b + Math.PI) % TAU + TAU) % TAU - Math.PI);
/** Speed that still stops within x m when braking at `brake`, and never moves more than the x m in one step. */
const stopSpeed = (x: number, dt: number) => (x <= 0 ? 0 : Math.min(Math.sqrt(2 * traffic.brake * x), x / dt));
const cap2 = (vEnd: number, d: number) => Math.sqrt(vEnd * vEnd + 2 * traffic.brake * Math.max(0, d)); // slow to vEnd in d m

export class Traffic {
  readonly cars: SimCar[] = [];
  readonly lights: TrafficLights;
  zones: readonly ExclusionZone[] = [];
  private t = 0;
  private nextId = 0;
  private readonly rng: () => number;
  private readonly kinds: CarKind[];
  private readonly shares: number[];
  private readonly ctls = new Map<number, Ctl>();
  private occ = new Map<number, SimCar[]>();
  private readonly owners = new Map<number, number>(); // node → car id let through its yield line
  private readonly box = new Map<number, number>(); // node → cars inside its corner region
  private readonly claims = new Map<number, SimCar>(); // exit directed edge → the car about to turn onto it
  private obs = { x: [] as number[], z: [] as number[], r: [] as number[] };
  private near: number[] = []; // valid car edges within traffic.radius of the anchor
  private nearCum: number[] = []; // cumulative spawnable length
  private nearAt = -Infinity;
  private nearX = 1e9;
  private nearZ = 1e9;
  private target = 0;
  private spawnAt = 0;
  private readonly out: PathOut = { x: 0, z: 0, yaw: 0 };
  private readonly sa: Seg = { x: 0, z: 0, dx: 0, dz: 0, len: 0 };
  private readonly sb: Seg = { x: 0, z: 0, dx: 0, dz: 0, len: 0 };

  constructor(
    private readonly roads: NpcRoads,
    seed: number,
  ) {
    this.rng = mulberry32((seed ^ SEED) >>> 0);
    this.lights = new TrafficLights(roads);
    this.kinds = Object.keys(npc.vehicles) as CarKind[];
    this.shares = this.kinds.map((k) => npc.vehicles[k].share);
  }

  get time(): number {
    return this.t;
  }

  // ── directed edge helpers (de = 2e forward edgeA → edgeB, 2e + 1 backward) ──
  private startNode = (de: number) => (de & 1 ? this.roads.graph.edgeB : this.roads.graph.edgeA)[de >> 1]!;
  private endNode = (de: number) => (de & 1 ? this.roads.graph.edgeA : this.roads.graph.edgeB)[de >> 1]!;
  private len = (de: number) => this.roads.graph.edgeLength[de >> 1]!;
  private way = (de: number) => this.roads.graph.edgeWay[de >> 1]!;
  private valid(de: number): boolean {
    return this.roads.car[de >> 1] === 1 && this.roads.graph.allows(de >> 1, 'car', (de & 1) === 0);
  }
  private laneN = (de: number) => Math.max(1, this.roads.lanes(this.way(de), (de & 1) === 0));
  private laneOff = (de: number, lane: number) => this.roads.laneOffset(this.way(de), (de & 1) === 0, lane);
  private seg(de: number, o: Seg): Seg {
    const g = this.roads.graph, a = this.startNode(de), b = this.endNode(de), l = g.edgeLength[de >> 1]! || 1;
    o.x = g.x[a]!, o.z = g.z[a]!, o.dx = (g.x[b]! - g.x[a]!) / l, o.dz = (g.z[b]! - g.z[a]!) / l, o.len = l;
    return o;
  }
  private isRing = (de: number) => (this.roads.graph.flags(de >> 1) & WayFlag.roundabout) !== 0;
  private speedOf(de: number): number {
    const s = traffic.speed;
    return this.isRing(de) ? s.roundabout! : s[this.roads.kind(this.way(de))] ?? s.default!;
  }
  private cornerC = (a: number, b: number) => Math.min(traffic.cornerCut, this.len(a) / 2, this.len(b) / 2);
  private inZone(x: number, z: number, pad = 0): boolean {
    for (const q of this.zones) if (Math.hypot(x - q.x, z - q.z) < q.r + npc.zoneMargin + pad) return true;
    return false;
  }

  // ── junction control ──
  private ctl(n: number): Ctl {
    let c = this.ctls.get(n);
    if (c) return c;
    const { roads } = this, g = roads.graph;
    c = { kind: 'none', major: new Set(), ringIn: -1 };
    const edges = carEdges(roads, n);
    const ring = edges.filter((e) => g.flags(e) & WayFlag.roundabout);
    if (this.lights.has(n)) c.kind = 'lit';
    else if (ring.length && ring.length < edges.length) {
      c.kind = 'ring';
      for (const e of ring) if (arrives(roads, e, n)) c.ringIn = g.edgeB[e] === n ? 2 * e : 2 * e + 1;
    } else if (edges.length >= 3) {
      const arms = edges.filter((e) => arrives(roads, e, n));
      const rk = (e: number) => traffic.rank[roads.kind(g.edgeWay[e]!)] ?? 0;
      const top = Math.max(...arms.map(rk)), low = Math.min(...arms.map(rk));
      const tops = arms.filter((e) => rk(e) === top);
      const bearing = (e: number) => Math.atan2(g.z[farNode(roads, e, n)]! - g.z[n]!, g.x[farNode(roads, e, n)]! - g.x[n]!);
      c.kind = 'equal';
      // the two top-ranked arms form a major road when they run nearly straight through (≤ 30°)
      if (top > low && tops.length === 2 && angDiff(bearing(tops[0]!), bearing(tops[1]!)) >= Math.PI - Math.PI / 6) {
        c.kind = 'yield';
        for (const e of tops) c.major.add(e);
      }
    }
    this.ctls.set(n, c);
    return c;
  }

  private stopAt(n: number, e: number, c: Ctl): number {
    return c.kind === 'lit' ? this.lights.stop(n, e) ?? stopDistance(this.roads, n, e) : stopDistance(this.roads, n, e);
  }

  /** A car within `limit` m before the end of de (moving, or closer than 8 m when movingOnly), looking back through arrivals. */
  private approaching(de: number, limit: number, movingOnly: boolean, self: SimCar, depth = 3): boolean {
    for (const c of this.occ.get(de) ?? []) {
      if (c === self) continue;
      const d = this.len(de) - c.s;
      if (d <= limit && (!movingOnly || c.speed > 0.5 || d < 8)) return true;
    }
    const left = limit - this.len(de);
    if (left <= 0 || depth <= 0) return false;
    const a = this.startNode(de);
    for (const e of this.roads.graph.edgesOf(a)) {
      if (e === de >> 1 || !arrives(this.roads, e, a)) continue;
      if (this.approaching(this.roads.graph.edgeB[e] === a ? 2 * e : 2 * e + 1, left, movingOnly, self, depth - 1)) return true;
    }
    return false;
  }

  private laneIn = (de: number, c: SimCar) => Math.min(c.lane, this.laneN(de) - 1); // its lane on de

  private exitClear(car: SimCar, nx: number, c: number): boolean {
    const lane = Math.min(car.lane, this.laneN(nx) - 1), need = car.len + c + traffic.minGap;
    for (const o of this.occ.get(nx) ?? []) if (o !== car && Math.min(o.lane, this.laneN(nx) - 1) === lane && o.s < need) return false;
    return true;
  }

  /** May car (in front of its line at node n, arriving along edge e) go? Tries to take the yield grant; a roundabout
   *  entry is re-judged every step until the car is inside its corner (the ring must stay clear for the whole drive). */
  private tryGrant(car: SimCar, n: number, e: number, ctl: Ctl, nx: number | undefined, dFront: number, toCorner: number, lead: number): boolean {
    const arrive = this.roads.graph.edgeB[e] === n ? 2 * e : 2 * e + 1;
    if (ctl.kind === 'ring') {
      if (nx === undefined || !this.isRing(nx) || this.isRing(arrive) || toCorner < 0) return true;
      const join = Math.min(6, Math.max(0, dFront + this.stopAt(n, e, ctl) + this.cornerC(arrive, nx)) / 4); // s to the ring at ≈ 4 m/s
      return !(ctl.ringIn >= 0 && this.approaching(ctl.ringIn, traffic.roundaboutGap + traffic.speed.roundabout! * join, false, car, 16));
    }
    if (car.grant === n || (ctl.kind === 'yield' && ctl.major.has(e))) return true;
    if (lead < dFront + 0.5) return false; // a car ahead in the lane is first in line, not this one
    if (this.owners.has(n) || (this.box.get(n) ?? 0) > 0) return false;
    if (ctl.kind === 'yield') {
      for (const m of ctl.major) {
        const dm = this.roads.graph.edgeB[m] === n ? 2 * m : 2 * m + 1;
        if (this.approaching(dm, traffic.yieldLook, true, car)) return false;
      }
    }
    car.grant = n;
    this.owners.set(n, car.id);
    return true;
  }

  /** Top speed the junction lines ahead allow (lights, yield lines, roundabout entries, a blocked exit). */
  private lineCap(car: SimCar, dt: number, gap: number): number {
    const gd = (car.speed * car.speed) / (2 * traffic.brake) * 1.3 + 3; // grant / decision distance
    let base = -car.s;
    for (let j = 0; j < car.route.length; j++) {
      const de = car.route[j]!, L = this.len(de);
      if (base - car.len / 2 > traffic.lookAhead) break;
      const n = this.endNode(de), e = de >> 1, ctl = this.ctl(n);
      if (ctl.kind !== 'none') {
        const dFront = base + L - this.stopAt(n, e, ctl) - car.len / 2;
        const nx = car.route[j + 1];
        const toCorner = nx === undefined ? 0 : base + L - this.cornerC(de, nx) - car.len / 2; // front → where the corner starts
        const before = dFront >= -0.001; // front not yet over the stop line
        if ((before || toCorner >= -0.001) && dFront <= gd) {
          let block = false;
          if (ctl.kind === 'ring') block = !this.tryGrant(car, n, e, ctl, nx, dFront, toCorner, gap);
          else if (before && ctl.kind === 'lit') {
            const col = this.lights.car(n, e);
            block = col === 'red' || (col === 'amber' && dFront >= (car.speed * car.speed) / (2 * traffic.brake));
          } else if (before) block = !this.tryGrant(car, n, e, ctl, nx, dFront, toCorner, gap);
          // past the line but not yet in the corner: the exit must still be free for this car (re-judged every step)
          if (!block && nx !== undefined && !this.exitClear(car, nx, this.cornerC(de, nx))) block = true;
          if (!block && nx !== undefined && !(ctl.kind === 'ring' && this.isRing(de))) {
            // one car per exit edge: a car from another arm that is about to turn onto it goes first (ring cars never yield)
            const other = this.claims.get(nx);
            if (other && other !== car && (other.route[0] !== de || this.laneIn(de, other) !== this.laneIn(de, car))) block = true;
            else if (!other) (car.claim = nx), this.claims.set(nx, car);
          }
          if (block) return stopSpeed((before ? dFront : toCorner) - traffic.stopMargin, dt);
        }
      }
      base += L;
    }
    return Infinity;
  }

  /** Smallest gap (m, bumper to bumper) to a car ahead in the same lane, or to an obstacle in the lane corridor. */
  private gapAhead(car: SimCar): number {
    let best = Infinity, base = -car.s;
    const half = car.wid / 2 + traffic.obstacleMargin;
    for (let j = 0; j < car.route.length; j++) {
      const de = car.route[j]!, L = this.len(de);
      if (base - car.len / 2 > traffic.lookAhead) break;
      const nl = this.laneN(de), lane = Math.min(car.lane, nl - 1);
      for (const o of this.occ.get(de) ?? []) {
        if (o === car || Math.min(o.lane, nl - 1) !== lane) continue;
        const d = base + o.s;
        if (j === 0 && !(d > 0 || (d === 0 && o.id < car.id))) continue;
        best = Math.min(best, d - (car.len + o.len) / 2);
      }
      const o = this.seg(de, this.sa), off = this.laneOff(de, lane), ob = this.obs;
      for (let i = 0; i < ob.x.length; i++) {
        const rx = ob.x[i]! - o.x, rz = ob.z[i]! - o.z, r = ob.r[i]!;
        const along = rx * o.dx + rz * o.dz, lat = -rx * o.dz + rz * o.dx - off;
        if (Math.abs(lat) > half + r || along > L + r) continue;
        const d = base + along;
        if (d < -car.len / 2 - r) continue; // behind the car
        best = Math.min(best, d - car.len / 2 - r);
      }
      base += L;
    }
    return best;
  }

  // ── routes ──
  private outs(n: number): number[] {
    const g = this.roads.graph, out: number[] = [];
    for (const e of g.edgesOf(n)) {
      if (!this.roads.car[e]) continue;
      if (g.edgeA[e] === n && g.allows(e, 'car', true)) out.push(2 * e);
      if (g.edgeB[e] === n && g.allows(e, 'car', false)) out.push(2 * e + 1);
    }
    return out;
  }

  private allowedOn(kind: CarKind, de: number): boolean {
    const r = npc.vehicles[kind].roads;
    return !r || r.includes(this.roads.kind(this.way(de)));
  }

  /** Append the next directed edge the car takes at the end of its route (straight and big roads preferred). */
  private extend(car: SimCar): boolean {
    const last = car.route[car.route.length - 1]!, n = this.endNode(last), g = this.roads.graph;
    const all = this.outs(n);
    let cand = all.filter((d) => d >> 1 !== last >> 1);
    if (!cand.length) cand = all;
    if (!cand.length) return false;
    const typed = cand.filter((d) => this.allowedOn(car.kind, d));
    if (typed.length) cand = typed;
    if (this.zones.length) {
      const ok = cand.filter((d) => {
        const e = d >> 1;
        return !this.inZone((g.x[g.edgeA[e]!]! + g.x[g.edgeB[e]!]!) / 2, (g.z[g.edgeA[e]!]! + g.z[g.edgeB[e]!]!) / 2);
      });
      if (ok.length) cand = ok;
    }
    const a = this.seg(last, this.sa), ah = Math.atan2(-a.dx, -a.dz), ring = this.isRing(last);
    const w = cand.map((d) => {
      const b = this.seg(d, this.sb), th = angDiff(ah, Math.atan2(-b.dx, -b.dz));
      const k = 1 + 0.25 * (traffic.rank[this.roads.kind(this.way(d))] ?? 0);
      return (ring && this.isRing(d) ? 1.5 : th < 0.5 ? 3 : th < 1.75 ? 1 : 0.4) * k;
    });
    car.route.push(cand[pickWeighted(this.rng, w)]!);
    return true;
  }

  private ensureRoute(car: SimCar): boolean {
    let rem = -car.s;
    for (const d of car.route) rem += this.len(d);
    while ((rem < traffic.lookAhead + 25 || car.route.length < 3) && car.route.length < 12) {
      if (!this.extend(car)) return car.route.length > 1;
      rem += this.len(car.route[car.route.length - 1]!);
    }
    return true;
  }

  // ── public API ──
  /** Test hook: a car on directed edge (edge, forward) at s m, in `lane`, optionally with a fixed route after it. */
  addCar(kind: CarKind, edge: number, forward: boolean, s: number, lane = 0, speed = 0, route: number[] = []): SimCar {
    const dims = npc.vehicles[kind].dims;
    const pal = npc.vehicles[kind].paint ?? npc.paints;
    const de = 2 * edge + (forward ? 0 : 1);
    const car: SimCar = {
      id: this.nextId++, kind, paint: parseInt(pal[Math.floor(this.rng() * pal.length)]!.slice(1), 16),
      x: 0, y: 0, z: 0, yaw: 0, pitch: 0, speed, wheel: 0, braking: false,
      len: dims[2], wid: dims[0], vf: traffic.speedJitter[0] + this.rng() * (traffic.speedJitter[1] - traffic.speedJitter[0]),
      wheelR: dims[1] * traffic.wheelRatio, parked: false,
      lane, route: [de, ...route], s, still: 0, grant: -1, claim: -1, next: speed,
    };
    this.ensureRoute(car);
    this.place(car);
    this.cars.push(car);
    return car;
  }

  /** ?npcTest: a car that never moves and never despawns. */
  park(kind: CarKind, x: number, z: number, yaw: number): CarPose {
    const dims = npc.vehicles[kind].dims;
    const car: SimCar = {
      id: this.nextId++, kind, paint: 0x8d9296, x, y: this.roads.heightAt(x, z), z, yaw, pitch: 0, speed: 0, wheel: 0, braking: false,
      len: dims[2], wid: dims[0], vf: 1, wheelR: dims[1] * traffic.wheelRatio, parked: true,
      lane: 0, route: [], s: 0, still: 0, grant: -1, claim: -1, next: 0,
    };
    this.cars.push(car);
    return car;
  }

  step(dt: number, anchor: NpcAnchor, density: number, peds: readonly PedPose[], fill = false): void {
    this.t += dt;
    this.lights.update(this.t);
    this.refreshNear(anchor, fill, density);
    const live = this.cars.filter((c) => !c.parked);

    // snapshot: occupancy, junction boxes, grants, obstacles
    this.occ.clear();
    this.box.clear();
    this.owners.clear();
    this.claims.clear();
    for (const c of live) {
      const de = c.route[0]!;
      (this.occ.get(de) ?? this.occ.set(de, []).get(de)!).push(c);
      if (c.grant >= 0 && !c.route.some((d) => this.endNode(d) === c.grant)) c.grant = -1;
      if (c.grant >= 0) this.owners.set(c.grant, c.id);
      if (c.claim >= 0 && c.route[1] !== c.claim) c.claim = -1;
      if (c.claim >= 0) this.claims.set(c.claim, c);
      if (c.route.length > 1 && c.s >= this.len(de) - this.cornerC(de, c.route[1]!)) {
        const n = this.endNode(de);
        this.box.set(n, (this.box.get(n) ?? 0) + 1);
      }
    }
    const ob = this.obs;
    ob.x.length = ob.z.length = ob.r.length = 0;
    const add = (x: number, z: number, r: number) => (ob.x.push(x), ob.z.push(z), ob.r.push(r));
    if (anchor.body) {
      add(anchor.x, anchor.z, traffic.bodyRadius);
      if (anchor.nose) add(anchor.nose.x, anchor.nose.z, traffic.bodyRadius);
    }
    for (const p of peds) add(p.x, p.z, crowd.bodyRadius);
    for (const c of this.cars) if (c.parked) add(c.x, c.z, Math.max(c.len, c.wid) / 2);

    // despawn
    const R = traffic.radius + traffic.despawnMargin, cone = (traffic.viewConeDeg * Math.PI) / 180;
    const keep = (c: SimCar) => {
      if (c.parked) return true;
      const d = Math.hypot(c.x - anchor.x, c.z - anchor.z);
      if (d > R) return false;
      return !(c.still > traffic.stuckSeconds && !(d < render.fog.near && angDiff(Math.atan2(-(c.x - anchor.x), -(c.z - anchor.z)), anchor.viewYaw) < cone));
    };
    if (live.some((c) => !keep(c))) this.removeCars((c) => !keep(c));

    // decide speeds from the snapshot, then move everybody
    for (const c of this.cars) if (!c.parked) this.decide(c, dt);
    for (const c of this.cars) if (!c.parked) this.move(c, dt);
    if (this.cars.some((c) => !c.parked && c.route.length < 2)) this.removeCars((c) => !c.parked && c.route.length < 2);

    // spawn
    if (fill) {
      for (let k = 0; k < this.target * 30 && this.count() < this.target; k++) this.spawn(anchor, true);
      this.spawnAt = this.t;
    } else if (this.count() < this.target && this.t >= this.spawnAt) {
      for (let k = 0; k < 6; k++) if (this.spawn(anchor, false)) break;
      this.spawnAt = this.t + traffic.spawnEvery;
    }
  }

  private count = () => this.cars.reduce((n, c) => n + (c.parked ? 0 : 1), 0);

  private removeCars(drop: (c: SimCar) => boolean): void {
    const keep = this.cars.filter((c) => !drop(c));
    this.cars.length = 0;
    this.cars.push(...keep);
  }

  private decide(car: SimCar, dt: number): void {
    const de = car.route[0]!, L = this.len(de), nx = car.route[1]!;
    const vlim = this.speedOf(de) * car.vf;
    let cap = vlim;
    // slower next edge / corner ahead
    const c = this.cornerC(de, nx), toCorner = L - c - car.s;
    const a = this.seg(de, this.sa), b = this.seg(nx, this.sb);
    const th = angDiff(Math.atan2(-a.dx, -a.dz), Math.atan2(-b.dx, -b.dz));
    const r = th > 0.02 && c > 0 ? c / Math.tan(th / 2) : Infinity;
    const vc = Math.max(2, Math.sqrt(traffic.latAccel * r));
    cap = Math.min(cap, cap2(Math.min(vc, this.speedOf(nx) * car.vf), Math.max(0, toCorner)));
    if (car.s > L - c && car.s < L + c) cap = Math.min(cap, Math.max(vc, 0.5));
    // car ahead / obstacle: stop gap
    const gap = this.gapAhead(car);
    if (gap < Infinity) cap = Math.min(cap, stopSpeed(gap - traffic.minGap, dt));
    cap = Math.min(cap, this.lineCap(car, dt, gap));
    car.next = Math.min(car.speed + traffic.accel * dt, cap);
    car.braking = cap < car.speed - 0.02 || (car.next < 0.3 && cap < 0.3);
  }

  private move(car: SimCar, dt: number): void {
    const ds = car.next * dt;
    car.speed = car.next;
    car.s += ds;
    car.wheel += ds / car.wheelR;
    car.still = car.speed < 0.1 ? car.still + dt : 0;
    for (;;) {
      const de = car.route[0]!, nx = car.route[1];
      if (nx === undefined) break;
      const L = this.len(de), c = this.cornerC(de, nx);
      if (car.s < L + c) break;
      car.s -= L;
      car.route.shift();
      if (this.isRing(car.route[0]!) && !this.isRing(de)) car.lane = this.laneN(car.route[0]!) - 1; // joins on the inside lane (its line continues the arm)
      if (!this.ensureRoute(car)) break;
    }
    this.ensureRoute(car);
    this.place(car);
  }

  /** Pose from (route, s): lane line + corner Bézier, terrain / deck height, pitch from the axles. */
  private place(car: SimCar): void {
    const de = car.route[0]!, nx = car.route[1] ?? de;
    const nl = this.laneN(de), nn = this.laneN(nx);
    const a = this.seg(de, this.sa), b = this.seg(nx, this.sb);
    pathPoint(a, this.laneOff(de, Math.min(car.lane, nl - 1)), b, this.laneOff(nx, Math.min(car.lane, nn - 1)), nx === de ? 0 : this.cornerC(de, nx), car.s, this.out);
    car.x = this.out.x;
    car.z = this.out.z;
    car.yaw = this.out.yaw;
    const fwd = (de & 1) === 0, L = a.len, e = de >> 1;
    const at = (s: number) => this.roads.heightOn(e, fwd ? Math.min(Math.max(s, 0), L) : L - Math.min(Math.max(s, 0), L));
    car.y = at(car.s);
    const half = 0.3 * car.len;
    car.pitch = Math.atan2(at(car.s + half) - at(car.s - half), 2 * half);
  }

  // ── spawning ──
  private refreshNear(anchor: NpcAnchor, force: boolean, density: number): void {
    if (!force && this.t - this.nearAt < 1 && Math.hypot(anchor.x - this.nearX, anchor.z - this.nearZ) < 20) return;
    const g = this.roads.graph, R = traffic.radius;
    this.nearAt = this.t, this.nearX = anchor.x, this.nearZ = anchor.z;
    this.near = [];
    this.nearCum = [];
    const seen = new Set<number>();
    let total = 0, km = 0;
    for (const e of g.edgesNear(anchor.x, anchor.z, R)) {
      if (seen.has(e) || !this.roads.car[e]) continue;
      seen.add(e);
      const a = g.edgeA[e]!, b = g.edgeB[e]!;
      if (Math.hypot((g.x[a]! + g.x[b]!) / 2 - anchor.x, (g.z[a]! + g.z[b]!) / 2 - anchor.z) > R) continue;
      km += g.edgeLength[e]! / 1000;
      total += Math.max(0, g.edgeLength[e]! - 12);
      this.near.push(e);
      this.nearCum.push(total);
    }
    this.target = Math.min(traffic.max, Math.round(density * traffic.perKm * km));
  }

  private spawn(anchor: NpcAnchor, fill: boolean): boolean {
    const total = this.nearCum[this.nearCum.length - 1] ?? 0;
    if (total <= 0) return false;
    const kind = this.kinds[pickWeighted(this.rng, this.shares)]!;
    const pick = this.rng() * total;
    let lo = 0, hi = this.nearCum.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.nearCum[mid]! > pick) hi = mid;
      else lo = mid + 1;
    }
    const e = this.near[lo]!, L = this.roads.graph.edgeLength[e]!;
    const dirs = [0, 1].filter((k) => this.valid(2 * e + k) && this.allowedOn(kind, 2 * e + k));
    if (!dirs.length) return false;
    const de = 2 * e + dirs[Math.floor(this.rng() * dirs.length)]!;
    const s = 6 + this.rng() * Math.max(0, L - 12);
    const lane = Math.floor(this.rng() * this.laneN(de));
    const dims = npc.vehicles[kind].dims;
    const tmp = this.addCarRaw(kind, de, s, lane);
    const d = Math.hypot(tmp.x - anchor.x, tmp.z - anchor.z);
    let ok = d >= 8 && d <= traffic.radius && !this.inZone(tmp.x, tmp.z);
    if (ok && !fill) {
      const cone = (traffic.viewConeDeg * Math.PI) / 180;
      const inView = d < render.fog.near && angDiff(Math.atan2(-(tmp.x - anchor.x), -(tmp.z - anchor.z)), anchor.viewYaw) < cone;
      ok = d >= 0.6 * traffic.radius && !inView;
    }
    if (ok) {
      const nl = this.laneN(de);
      for (const o of this.cars) {
        const same = o.route[0] === de && Math.min(o.lane, nl - 1) === Math.min(lane, nl - 1);
        const gap = (dims[2] + o.len) / 2;
        if (same ? Math.abs(o.s - s) < gap + 2 * traffic.minGap + 1 : Math.hypot(o.x - tmp.x, o.z - tmp.z) < gap + (o.parked ? 2 : 1)) ok = false;
      }
    }
    if (!ok) return false;
    tmp.speed = Math.min(this.speedOf(de) * tmp.vf, 4);
    this.nextId++;
    this.cars.push(tmp);
    return true;
  }

  /** Build (but do not register) a car on de. */
  private addCarRaw(kind: CarKind, de: number, s: number, lane: number): SimCar {
    const n = this.cars.length;
    const car = this.addCar(kind, de >> 1, (de & 1) === 0, s, lane);
    this.cars.length = n; // spawn() decides whether it stays
    this.nextId--;
    return car;
  }
}
