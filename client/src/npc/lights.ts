// Track B (docs/plans/phase4b.md §3.6): simple two-phase traffic lights on the NPC road network. Pure: no three, no Rapier.
// A junction (≥ 3 NPC car edges, not on a roundabout) has lights when a highway=traffic_signals node sits on it or on a
// branch within lights.reach; a lone signal node on a street (pedestrian crossing) is a mid-block light.
import { WayFlag } from '@race/shared/graph';
import { traffic } from '../config.ts';
import type { NpcRoads } from './roads.ts';
import type { LightColour, LightQuery, SignalHead } from './types.ts';

/** Deterministic hash of an integer to [0, 1). */
export function hash01(n: number): number {
  let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** NPC car edges touching node n. */
export function carEdges(roads: NpcRoads, n: number): number[] {
  return roads.graph.edgesOf(n).filter((e) => roads.car[e]);
}

/** Does a car arrive at node n along edge e (travelling toward n)? */
export function arrives(roads: NpcRoads, e: number, n: number): boolean {
  const g = roads.graph;
  return roads.car[e] === 1 && (g.edgeB[e] === n ? g.allows(e, 'car', true) : g.edgeA[e] === n && g.allows(e, 'car', false));
}

/** The node at the other end of edge e. */
export const farNode = (roads: NpcRoads, e: number, n: number) => (roads.graph.edgeA[e] === n ? roads.graph.edgeB[e]! : roads.graph.edgeA[e]!);

/** Stop line of a car arriving at n along e, m before n: half the widest other branch + 2 m (phase4b.md §3.6), kept
 *  inside the edge. */
export function stopDistance(roads: NpcRoads, n: number, e: number): number {
  const g = roads.graph;
  let h = 0;
  for (const o of carEdges(roads, n)) if (o !== e) h = Math.max(h, roads.halfWidth(g.edgeWay[o]!));
  return clampStop(roads, e, h + 2);
}

const clampStop = (roads: NpcRoads, e: number, d: number) => Math.max(0.5, Math.min(d, roads.graph.edgeLength[e]! - 0.5));

interface Info {
  mid: boolean;
  offset: number; // 0..1 of the cycle
  phase: Map<number, number>; // arriving edge → 0 | 1
  stop: Map<number, number>; // arriving edge → m before the node
}

export class TrafficLights implements LightQuery {
  private readonly info = new Map<number, Info>();
  private readonly heads: SignalHead[] = [];
  private time = 0;
  private readonly cycle = 2 * (traffic.lights.green + traffic.lights.amber + traffic.lights.allRed);

  constructor(private readonly roads: NpcRoads) {
    const g = roads.graph;
    const signals = new Set(g.file.signals);
    const ring = (n: number) => g.edgesOf(n).some((e) => g.flags(e) & WayFlag.roundabout);
    const claimed = new Set<number>();
    // Junctions: a signal on the node or on a branch (through degree-2 nodes) within reach.
    const deg = new Uint8Array(g.nodeCount);
    for (let e = 0; e < g.edgeA.length; e++) if (roads.car[e]) deg[g.edgeA[e]!]!++, deg[g.edgeB[e]!]!++;
    for (let j = 0; j < deg.length; j++) {
      if (deg[j]! < 3 || ring(j)) continue;
      const edges = carEdges(roads, j);
      const found = new Map<number, number>(); // arm edge → distance of the signal node on it
      let any = signals.has(j);
      if (any) claimed.add(j);
      for (const e of edges) {
        let prev = j, cur = e, d = 0;
        for (;;) {
          const v = farNode(roads, cur, prev);
          d += g.edgeLength[cur]!;
          if (d > traffic.lights.reach) break;
          if (signals.has(v)) {
            found.set(e, d), claimed.add(v), (any = true);
            break;
          }
          const next = carEdges(roads, v);
          if (next.length !== 2) break;
          prev = v;
          cur = next[0] === cur ? next[1]! : next[0]!;
        }
      }
      if (any) this.addJunction(j, edges, found);
    }
    // Lone signals on a street (2 NPC car edges): pedestrian crossing lights.
    for (const s of signals) {
      if (claimed.has(s) || ring(s)) continue;
      const edges = carEdges(roads, s);
      if (edges.length !== 2) continue;
      const info: Info = { mid: true, offset: hash01(s), phase: new Map(), stop: new Map() };
      for (const e of edges) if (arrives(roads, e, s)) info.phase.set(e, 0), info.stop.set(e, clampStop(roads, e, traffic.lights.midStop));
      this.add(s, info);
    }
  }

  private addJunction(j: number, edges: number[], found: Map<number, number>): void {
    const g = this.roads.graph;
    const arms = edges.filter((e) => arrives(this.roads, e, j));
    const bearing = (e: number) => Math.atan2(g.z[farNode(this.roads, e, j)]! - g.z[j]!, g.x[farNode(this.roads, e, j)]! - g.x[j]!);
    const size = (e: number) => (traffic.rank[this.roads.kind(g.edgeWay[e]!)] ?? 0) * 100 + this.roads.halfWidth(g.edgeWay[e]!);
    let big = arms[0]!;
    for (const e of arms) if (size(e) > size(big)) big = e;
    const info: Info = { mid: false, offset: hash01(j), phase: new Map(), stop: new Map() };
    for (const e of arms) {
      let diff = Math.abs(bearing(e) - bearing(big) - Math.PI) % (2 * Math.PI);
      diff = Math.min(diff, 2 * Math.PI - diff);
      info.phase.set(e, e === big || diff <= Math.PI / 4 ? 0 : 1);
      info.stop.set(e, found.has(e) ? clampStop(this.roads, e, found.get(e)!) : stopDistance(this.roads, j, e));
    }
    this.add(j, info);
  }

  private add(n: number, info: Info): void {
    const g = this.roads.graph;
    this.info.set(n, info);
    for (const [e, d] of info.stop) {
      const far = farNode(this.roads, e, n);
      const l = g.edgeLength[e]! || 1;
      const ux = (g.x[n]! - g.x[far]!) / l, uz = (g.z[n]! - g.z[far]!) / l; // travel direction
      const side = this.roads.halfWidth(g.edgeWay[e]!) + traffic.lights.kerb; // right kerb, outside the carriageway
      // SignalHead contract (types.ts): pole foot at the stop line on the right kerb; yaw looks against the travel direction
      this.heads.push({
        x: g.x[n]! - ux * d - uz * side, z: g.z[n]! - uz * d + ux * side, yaw: Math.atan2(ux, uz),
        junction: n, edge: e,
      });
    }
  }

  /** s (simulated seconds) drives every light. */
  update(time: number): void {
    this.time = time;
  }

  has(n: number): boolean {
    return this.info.has(n);
  }

  /** Stop line of edge e at lit node n, m before n (undefined when n has no light or e does not arrive there). */
  stop(n: number, e: number): number | undefined {
    return this.info.get(n)?.stop.get(e);
  }

  car(junction: number, edge: number): LightColour {
    const info = this.info.get(junction);
    const L = traffic.lights;
    if (!info) return 'green';
    if (info.mid) {
      const t = (this.time + info.offset * L.pedCycle) % L.pedCycle;
      return t >= L.pedCycle - L.amber ? 'amber' : t < L.pedGreen ? 'red' : 'green';
    }
    const half = this.cycle / 2;
    const t = (this.time + info.offset * this.cycle) % this.cycle;
    const p = t < half ? 0 : 1;
    if ((info.phase.get(edge) ?? 1) !== p) return 'red';
    const u = t - p * half;
    return u < L.green ? 'green' : u < L.green + L.amber ? 'amber' : 'red';
  }

  pedMayCross(junction: number, edge: number): boolean {
    return !this.info.has(junction) || this.car(junction, edge) === 'red';
  }

  headsNear(x: number, z: number, r: number): readonly SignalHead[] {
    return this.heads.filter((h) => Math.hypot(h.x - x, h.z - z) <= r);
  }
}
