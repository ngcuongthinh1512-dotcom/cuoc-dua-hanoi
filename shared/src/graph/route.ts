// Track C (docs/plans/phase4.md §6): A* shortest path and corridors on the RoadGraph. Pure TS, deterministic.
// FOUNDATION STUB: final signatures.
import type { RoadGraph } from './RoadGraph.ts';
import type { TravelMode } from './types.ts';

export interface Path {
  /** Node indices from start to goal. */
  nodes: number[];
  /** m. */
  length: number;
}

/** A* (straight-line heuristic) from node `from` to node `to`; null when unreachable. */
export function shortestPath(_g: RoadGraph, _from: number, _to: number, _mode: TravelMode): Path | null {
  return null;
}

/** Path as a world polyline, m, interleaved x, z. */
export function pathPolyline(g: RoadGraph, p: Path): number[] {
  return p.nodes.flatMap((n) => [g.x[n]!, g.z[n]!]);
}

/** Edges usable by `mode` lying (any part) within width / 2 m of the path polyline, sorted (SPEC §6.2: corridorMeters
 *  wide, parallel streets included). */
export function corridorEdges(_g: RoadGraph, _p: Path, _width: number, _mode: TravelMode): number[] {
  return [];
}
