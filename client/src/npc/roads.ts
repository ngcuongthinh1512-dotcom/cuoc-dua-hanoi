// Foundation (docs/plans/phase4b.md §4, §5.2): the road graph as the NPC sims see it. Widths / sidewalks are RoadBuilder's,
// so cars and pedestrians sit on the drawn ribbons, not on the graph's own RoadGraph widths. Pure: no three, no Rapier.
// Track B adds the bridge decks to heightOn.
import { type RoadGraph, WayFlag } from '@race/shared/graph';
import { roads, traffic } from '../config.ts';
import { roadWidth, sidewalkWidth } from '../world/RoadBuilder.ts';

export class NpcRoads {
  /** Per edge: 1 = NPC car edge (kind ∈ traffic.kinds, inside the largest strongly connected part of that network, so
   *  every car can always drive on); graph.allows(e, 'car', forward) still gives the direction. */
  readonly car: Uint8Array;
  /** Per node: 1 = highway=crossing on an NPC car edge (cars yield, pedestrians cross, D draws the zebra). */
  readonly crossing: Uint8Array;
  private readonly half: Float32Array; // per way, m
  private readonly walkSide: Float32Array; // per way, m

  constructor(
    readonly graph: RoadGraph,
    readonly heightAt: (x: number, z: number) => number,
  ) {
    const { file } = graph;
    this.half = new Float32Array(file.ways.length);
    this.walkSide = new Float32Array(file.ways.length);
    file.ways.forEach((w, k) => {
      const f = w[1]!;
      const way = {
        kind: file.kinds[w[0]!]!, name: w[3]! >= 0 ? file.names[w[3]!] : undefined, width: w[4] ? w[4] / 10 : undefined,
        lanes: w[2] || undefined, oneway: !!(f & WayFlag.oneway), roundabout: !!(f & WayFlag.roundabout),
      };
      this.half[k] = roadWidth(way) / 2;
      this.walkSide[k] = sidewalkWidth(way);
    });

    // Directed NPC network → its largest strongly connected component (Kosaraju, iterative).
    const kinds = new Set(traffic.kinds);
    const n = graph.nodeCount, m = graph.edgeA.length;
    const outs: number[][] = Array.from({ length: n }, () => []), ins: number[][] = Array.from({ length: n }, () => []);
    const usable = (e: number) => graph.flags(e) & WayFlag.car && kinds.has(this.kind(graph.edgeWay[e]!));
    for (let e = 0; e < m; e++) {
      if (!usable(e)) continue;
      const a = graph.edgeA[e]!, b = graph.edgeB[e]!;
      if (graph.allows(e, 'car', true)) outs[a]!.push(b), ins[b]!.push(a);
      if (graph.allows(e, 'car', false)) outs[b]!.push(a), ins[a]!.push(b);
    }
    const inMain = largestScc(outs, ins);
    this.car = new Uint8Array(m);
    for (let e = 0; e < m; e++) if (usable(e) && inMain[graph.edgeA[e]!] && inMain[graph.edgeB[e]!]) this.car[e] = 1;
    this.crossing = new Uint8Array(n);
    for (const c of file.crossings) if (graph.edgesOf(c).some((e) => this.car[e])) this.crossing[c] = 1;
  }

  /** highway=* of way k. */
  kind(k: number): string {
    return this.graph.file.kinds[this.graph.file.ways[k]![0]!]!;
  }

  /** Half the drawn carriageway (RoadBuilder roadWidth / 2), m. */
  halfWidth(k: number): number {
    return this.half[k]!;
  }

  /** Raised sidewalk on each side (RoadBuilder sidewalkWidth), m; 0 = none. */
  sidewalk(k: number): number {
    return this.walkSide[k]!;
  }

  /** Lanes in the direction of travel (forward = edgeA → edgeB); 0 = cars may not go that way. Oneway: the lanes tag or
   *  width / roads.laneWidth; two-way: half of that (≥ 1) per direction; both clamped to traffic.maxLanes. */
  lanes(k: number, forward: boolean): number {
    const f = this.graph.file.ways[k]![1]!;
    if (!(f & WayFlag.car)) return 0;
    const oneway = f & WayFlag.oneway;
    if (oneway && !forward) return 0;
    const total = this.graph.file.ways[k]![2]! || Math.round((2 * this.half[k]!) / roads.laneWidth);
    return Math.min(traffic.maxLanes, oneway ? Math.max(1, total) : Math.max(1, Math.floor(total / 2)));
  }

  /** Lane centre from the way's centre line, m, + = right of travel (right normal of direction (dx, dz) = (−dz, dx));
   *  lane 0 = kerb side, a lane past the last is clamped to it (onto a way with fewer lanes). */
  laneOffset(k: number, forward: boolean, lane: number): number {
    const n = Math.max(1, this.lanes(k, forward));
    const h = this.half[k]!;
    const span = this.graph.file.ways[k]![1]! & WayFlag.oneway ? 2 * h : h; // two-way: each direction has its half
    return h - (Math.min(Math.max(lane, 0), n - 1) + 0.5) * (span / n);
  }

  /** Ground y at s m along edge e from edgeA: the carved terrain. ponytail: no bridge decks yet (track B). */
  heightOn(e: number, s: number): number {
    const g = this.graph, a = g.edgeA[e]!, b = g.edgeB[e]!;
    const t = s / (g.edgeLength[e] || 1);
    return this.heightAt(g.x[a]! + (g.x[b]! - g.x[a]!) * t, g.z[a]! + (g.z[b]! - g.z[a]!) * t);
  }
}

/** Per node 1 = in the largest strongly connected component of the directed graph outs (ins = its reverse). */
export function largestScc(outs: readonly number[][], ins: readonly number[][]): Uint8Array {
  const n = outs.length, order: number[] = [], seen = new Uint8Array(n), next = new Int32Array(n);
  for (let s = 0; s < n; s++) {
    if (seen[s]) continue;
    seen[s] = 1;
    const stack = [s];
    while (stack.length) {
      const u = stack[stack.length - 1]!;
      const v = outs[u]![next[u]!++];
      if (v === undefined) order.push(stack.pop()!);
      else if (!seen[v]) (seen[v] = 1), stack.push(v);
    }
  }
  const comp = new Int32Array(n).fill(-1);
  let best = -1, bestSize = 0;
  for (let i = n - 1; i >= 0; i--) {
    const s = order[i]!;
    if (comp[s]! >= 0) continue;
    comp[s] = s;
    const stack = [s];
    let size = 0;
    while (stack.length) {
      const u = stack.pop()!;
      size++;
      for (const v of ins[u]!) if (comp[v]! < 0) (comp[v] = s), stack.push(v);
    }
    if (size > bestSize) (bestSize = size), (best = s);
  }
  return Uint8Array.from(comp, (c) => (c === best ? 1 : 0));
}
