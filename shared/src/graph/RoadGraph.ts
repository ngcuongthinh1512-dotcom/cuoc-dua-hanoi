// Track C (docs/plans/phase4.md §6): decoded road graph (CSR adjacency) + spatial queries. Pure TS, no DOM.
// FOUNDATION STUB: final signatures; queries answer "nothing found" until track C implements them.
import type { RoadGraphFile, TravelMode } from './types.ts';

export interface EdgeHit {
  edge: number;
  /** 0..1 along the edge from edgeA to edgeB. */
  t: number;
  /** m from the query point. */
  dist: number;
}

export class RoadGraph {
  /** Node positions, m. */
  readonly x = new Float64Array(0);
  readonly z = new Float64Array(0);
  /** Edge e: nodes edgeA[e] → edgeB[e], its way index, its length (m). */
  readonly edgeA = new Int32Array(0);
  readonly edgeB = new Int32Array(0);
  readonly edgeWay = new Int32Array(0);
  readonly edgeLength = new Float32Array(0);

  private constructor(readonly file: RoadGraphFile) {}

  static decode(file: RoadGraphFile): RoadGraph {
    return new RoadGraph(file);
  }

  get nodeCount() {
    return this.x.length;
  }

  /** Way flags of edge e (WayFlag bits). */
  flags(_e: number): number {
    return 0;
  }

  /** Can `mode` travel edge e from edgeA to edgeB (forward) or back? (car: oneway respected; walk / bike: both ways). */
  allows(_e: number, _mode: TravelMode, _forward: boolean): boolean {
    return false;
  }

  /** Edges touching node n. */
  edgesOf(_n: number): readonly number[] {
    return [];
  }

  /** Nearest node usable by `mode` within maxDist m, or −1. */
  nearestNode(_x: number, _z: number, _mode: TravelMode, _maxDist = Infinity): number {
    return -1;
  }

  /** Nearest edge (any mode) within maxDist m, or null. */
  nearestEdge(_x: number, _z: number, _maxDist: number): EdgeHit | null {
    return null;
  }

  /** Surface under (x, z): 'pave' / 'asphalt' when on a way's ribbon (width, else lanes × 3.25 m, else 6 m), else null. */
  surfaceAt(_x: number, _z: number): 'asphalt' | 'pave' | null {
    return null;
  }
}
