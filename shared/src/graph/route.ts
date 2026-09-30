// Track C (docs/plans/phase4.md §6): A* shortest path and corridors on the RoadGraph. Pure TS, deterministic.
import { type RoadGraph, segPoint } from './RoadGraph.ts';
import { type TravelMode, WayFlag } from './types.ts';

export interface Path {
  /** Node indices from start to goal. */
  nodes: number[];
  /** m. */
  length: number;
}

/** Binary min-heap of (node, priority), lazy deletion by the caller. */
class Heap {
  private n: number[] = [];
  private p: number[] = [];
  get size() {
    return this.n.length;
  }
  push(node: number, pri: number) {
    let i = this.n.push(node) - 1;
    this.p.push(pri);
    while (i > 0) {
      const up = (i - 1) >> 1;
      if (this.p[up]! <= pri) break;
      (this.n[i] = this.n[up]!), (this.p[i] = this.p[up]!), (i = up);
    }
    (this.n[i] = node), (this.p[i] = pri);
  }
  pop(): number {
    const top = this.n[0]!;
    const node = this.n.pop()!, pri = this.p.pop()!;
    const len = this.n.length;
    if (len) {
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= len) break;
        if (c + 1 < len && this.p[c + 1]! < this.p[c]!) c++;
        if (this.p[c]! >= pri) break;
        (this.n[i] = this.n[c]!), (this.p[i] = this.p[c]!), (i = c);
      }
      (this.n[i] = node), (this.p[i] = pri);
    }
    return top;
  }
}

/** A* (straight-line heuristic) from node `from` to node `to`; null when unreachable. */
export function shortestPath(g: RoadGraph, from: number, to: number, mode: TravelMode): Path | null {
  const n = g.nodeCount;
  if (from < 0 || to < 0 || from >= n || to >= n) return null;
  const dist = new Float64Array(n).fill(Infinity);
  const prev = new Int32Array(n).fill(-1);
  const done = new Uint8Array(n);
  const tx = g.x[to]!, tz = g.z[to]!;
  const h = (v: number) => Math.hypot(g.x[v]! - tx, g.z[v]! - tz);
  const heap = new Heap();
  dist[from] = 0;
  heap.push(from, h(from));
  while (heap.size) {
    const u = heap.pop();
    if (done[u]) continue;
    done[u] = 1;
    if (u === to) break;
    for (let k = g.adjStart[u]!; k < g.adjStart[u + 1]!; k++) {
      const e = g.adjEdge[k]!;
      const forward = g.edgeA[e] === u;
      if (!g.allows(e, mode, forward)) continue;
      const v = forward ? g.edgeB[e]! : g.edgeA[e]!;
      const d = dist[u]! + g.edgeLength[e]!;
      if (d < dist[v]!) (dist[v] = d), (prev[v] = u), heap.push(v, d + h(v));
    }
  }
  if (!done[to]) return null;
  const nodes = [to];
  while (nodes[0] !== from) nodes.unshift(prev[nodes[0]!]!);
  return { nodes, length: dist[to]! };
}

/** Path as a world polyline, m, interleaved x, z. */
export function pathPolyline(g: RoadGraph, p: Path): number[] {
  return p.nodes.flatMap((n) => [g.x[n]!, g.z[n]!]);
}

/** Do segments a–b and c–d cross? */
function crosses(ax: number, az: number, bx: number, bz: number, cx: number, cz: number, dx: number, dz: number) {
  const o = (px: number, pz: number, qx: number, qz: number, rx: number, rz: number) => Math.sign((qx - px) * (rz - pz) - (qz - pz) * (rx - px));
  return o(ax, az, bx, bz, cx, cz) * o(ax, az, bx, bz, dx, dz) < 0 && o(cx, cz, dx, dz, ax, az) * o(cx, cz, dx, dz, bx, bz) < 0;
}

/** Edges usable by `mode` lying (any part) within width / 2 m of the path polyline, sorted (SPEC §6.2: corridorMeters
 *  wide, parallel streets included). */
export function corridorEdges(g: RoadGraph, p: Path, width: number, mode: TravelMode): number[] {
  const half = width / 2;
  const out = new Set<number>();
  const bit = { walk: WayFlag.walk, bike: WayFlag.bike, car: WayFlag.car }[mode];
  for (let s = 0; s + 1 < p.nodes.length; s++) {
    const a = p.nodes[s]!, b = p.nodes[s + 1]!;
    const [ax, az, bx, bz] = [g.x[a]!, g.z[a]!, g.x[b]!, g.z[b]!];
    // ponytail: query the circle around the segment midpoint; path edges are short (< a few 100 m) in city data
    const mx = (ax + bx) / 2, mz = (az + bz) / 2;
    for (const e of g.edgesNear(mx, mz, Math.hypot(bx - ax, bz - az) / 2 + half)) {
      if (out.has(e) || !(g.flags(e) & bit)) continue;
      const c = g.edgeA[e]!, d = g.edgeB[e]!;
      const [cx, cz, dx, dz] = [g.x[c]!, g.z[c]!, g.x[d]!, g.z[d]!];
      const dist = Math.min(
        segPoint(cx, cz, ax, az, bx, bz)[1], segPoint(dx, dz, ax, az, bx, bz)[1],
        segPoint(ax, az, cx, cz, dx, dz)[1], segPoint(bx, bz, cx, cz, dx, dz)[1],
      );
      if (dist <= half || crosses(ax, az, bx, bz, cx, cz, dx, dz)) out.add(e);
    }
  }
  return [...out].sort((a, b) => a - b);
}
