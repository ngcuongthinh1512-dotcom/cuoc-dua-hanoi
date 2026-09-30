// Track C (docs/plans/phase4.md §6): decoded road graph (CSR adjacency) + spatial queries. Pure TS, no DOM.
import { type RoadGraphFile, type TravelMode, WAY_HEADER, WayFlag } from './types.ts';

export interface EdgeHit {
  edge: number;
  /** 0..1 along the edge from edgeA to edgeB. */
  t: number;
  /** m from the query point. */
  dist: number;
}

const CELL = 50; // m, spatial hash cell
const LANE = 3.25; // m per lane when a way has no width
const DEFAULT_WIDTH = 6; // m
const MODE_BIT = { walk: WayFlag.walk, bike: WayFlag.bike, car: WayFlag.car } as const;

/** Closest point of segment a–b to p: [t, distance]. */
export function segPoint(px: number, pz: number, ax: number, az: number, bx: number, bz: number): [number, number] {
  const dx = bx - ax, dz = bz - az;
  const l2 = dx * dx + dz * dz;
  const t = l2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l2)) : 0;
  return [t, Math.hypot(px - ax - t * dx, pz - az - t * dz)];
}

export class RoadGraph {
  /** Node positions, m. */
  readonly x: Float64Array;
  readonly z: Float64Array;
  /** Edge e: nodes edgeA[e] → edgeB[e], its way index, its length (m). */
  readonly edgeA: Int32Array;
  readonly edgeB: Int32Array;
  readonly edgeWay: Int32Array;
  readonly edgeLength: Float32Array;
  /** CSR: edges of node n = adjEdge[adjStart[n] .. adjStart[n + 1]). */
  readonly adjStart: Int32Array;
  readonly adjEdge: Int32Array;
  /** Walk-connected component of each node (a representative node index); `main` = the largest one. */
  readonly component: Int32Array;
  readonly main: number;
  private readonly wayFlags: Int32Array;
  private readonly halfWidth: Float32Array; // per way, m
  private readonly cells = new Map<number, number[]>(); // cell → edges whose bbox touches it
  private readonly maxHalfWidth: number;
  private readonly cellLo: number; // min / max cell index over both axes (ring search limit)
  private readonly cellHi: number;

  private constructor(readonly file: RoadGraphFile) {
    const n = file.nodes.length / 2;
    this.x = new Float64Array(n);
    this.z = new Float64Array(n);
    for (let i = 0; i < n; i++) (this.x[i] = file.nodes[2 * i]! / 10), (this.z[i] = file.nodes[2 * i + 1]! / 10);
    const edges = file.ways.reduce((s, w) => s + w.length - WAY_HEADER - 1, 0);
    this.edgeA = new Int32Array(edges);
    this.edgeB = new Int32Array(edges);
    this.edgeWay = new Int32Array(edges);
    this.edgeLength = new Float32Array(edges);
    this.wayFlags = Int32Array.from(file.ways, (w) => w[1]!);
    this.halfWidth = Float32Array.from(file.ways, (w) => (w[4] ? w[4] / 10 : w[2] ? w[2] * LANE : DEFAULT_WIDTH) / 2);
    this.maxHalfWidth = this.halfWidth.reduce((a, b) => Math.max(a, b), 0);
    const deg = new Int32Array(n + 1);
    let e = 0;
    file.ways.forEach((w, k) => {
      for (let i = WAY_HEADER; i + 1 < w.length; i++, e++) {
        const a = w[i]!, b = w[i + 1]!;
        this.edgeA[e] = a;
        this.edgeB[e] = b;
        this.edgeWay[e] = k;
        this.edgeLength[e] = Math.hypot(this.x[b]! - this.x[a]!, this.z[b]! - this.z[a]!);
        deg[a]!++;
        deg[b]!++;
      }
    });
    this.adjStart = new Int32Array(n + 1);
    for (let i = 0; i < n; i++) this.adjStart[i + 1] = this.adjStart[i]! + deg[i]!;
    this.adjEdge = new Int32Array(this.adjStart[n]!);
    const fill = this.adjStart.slice(0, n);
    for (let k = 0; k < edges; k++) {
      this.adjEdge[fill[this.edgeA[k]!]!++] = k;
      this.adjEdge[fill[this.edgeB[k]!]!++] = k;
    }
    const parent = Int32Array.from({ length: n }, (_, i) => i);
    const find = (i: number): number => {
      while (parent[i] !== i) i = parent[i] = parent[parent[i]!]!;
      return i;
    };
    for (let k = 0; k < edges; k++) if (this.flags(k) & WayFlag.walk) parent[find(this.edgeA[k]!)] = find(this.edgeB[k]!);
    this.component = Int32Array.from(parent, (_, i) => find(i));
    const size = new Int32Array(n);
    let main = -1;
    for (const c of this.component) if (++size[c]! > (main < 0 ? 0 : size[main]!)) main = c;
    this.main = main;
    let lo = Infinity, hi = -Infinity;
    for (let k = 0; k < edges; k++) {
      const a = this.edgeA[k]!, b = this.edgeB[k]!;
      const [i0, i1] = [Math.floor(Math.min(this.x[a]!, this.x[b]!) / CELL), Math.floor(Math.max(this.x[a]!, this.x[b]!) / CELL)];
      const [j0, j1] = [Math.floor(Math.min(this.z[a]!, this.z[b]!) / CELL), Math.floor(Math.max(this.z[a]!, this.z[b]!) / CELL)];
      lo = Math.min(lo, i0, j0);
      hi = Math.max(hi, i1, j1);
      // ponytail: bbox cells, a long diagonal edge lands in a few extra cells; exact raster if memory matters
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) (this.cells.get(key(i, j)) ?? this.cells.set(key(i, j), []).get(key(i, j))!).push(k);
    }
    [this.cellLo, this.cellHi] = edges ? [lo, hi] : [0, -1];
  }

  static decode(file: RoadGraphFile): RoadGraph {
    return new RoadGraph(file);
  }

  get nodeCount() {
    return this.x.length;
  }

  /** Way flags of edge e (WayFlag bits). */
  flags(e: number): number {
    return this.wayFlags[this.edgeWay[e]!]!;
  }

  /** Can `mode` travel edge e from edgeA to edgeB (forward) or back? (car: oneway respected; walk / bike: both ways). */
  allows(e: number, mode: TravelMode, forward: boolean): boolean {
    const f = this.flags(e);
    if (!(f & MODE_BIT[mode])) return false;
    return forward || mode !== 'car' || !(f & WayFlag.oneway);
  }

  /** Edges touching node n. */
  edgesOf(n: number): readonly number[] {
    return Array.from(this.adjEdge.subarray(this.adjStart[n], this.adjStart[n + 1]));
  }

  /** Edges in the cells within `r` m of (x, z) (may repeat; callers filter by distance). */
  edgesNear(x: number, z: number, r: number): number[] {
    const out: number[] = [];
    for (let i = Math.floor((x - r) / CELL); i <= Math.floor((x + r) / CELL); i++)
      for (let j = Math.floor((z - r) / CELL); j <= Math.floor((z + r) / CELL); j++) {
        const c = this.cells.get(key(i, j));
        if (c) for (const e of c) out.push(e);
      }
    return out;
  }

  /** Visit edges ring by ring around (x, z) until nothing closer than the best found so far can remain. */
  private ringSearch(x: number, z: number, maxDist: number, visit: (e: number) => number): number {
    const ci = Math.floor(x / CELL), cj = Math.floor(z / CELL);
    let best = maxDist;
    const span = Math.max(ci - this.cellLo, this.cellHi - ci, cj - this.cellLo, this.cellHi - cj);
    const limit = Math.min(span, Math.ceil(maxDist / CELL) + 1);
    for (let r = 0; r <= limit; r++) {
      for (let i = ci - r; i <= ci + r; i++)
        for (let j = cj - r; j <= cj + r; j++) {
          if (Math.max(Math.abs(i - ci), Math.abs(j - cj)) !== r) continue;
          const c = this.cells.get(key(i, j));
          if (c) for (const e of c) best = Math.min(best, visit(e));
        }
      if (best <= r * CELL) break; // unseen cells are ≥ r × CELL away
    }
    return best;
  }

  /** Nearest node usable by `mode` within maxDist m, or −1. Only nodes of the main walk network (`main` component):
   *  never snaps onto an isolated fragment (tower stairs, a closed courtyard). */
  nearestNode(x: number, z: number, mode: TravelMode, maxDist = Infinity): number {
    let bestNode = -1, best = maxDist;
    this.ringSearch(x, z, maxDist, (e) => {
      if (this.flags(e) & MODE_BIT[mode]) {
        for (const n of [this.edgeA[e]!, this.edgeB[e]!]) {
          if (this.component[n] !== this.main) continue;
          const d = Math.hypot(this.x[n]! - x, this.z[n]! - z);
          if (d < best || (d === best && n < bestNode)) (best = d), (bestNode = n);
        }
      }
      return best;
    });
    return bestNode;
  }

  private hit(e: number, x: number, z: number): EdgeHit {
    const a = this.edgeA[e]!, b = this.edgeB[e]!;
    const [t, dist] = segPoint(x, z, this.x[a]!, this.z[a]!, this.x[b]!, this.z[b]!);
    return { edge: e, t, dist };
  }

  /** Nearest edge (any mode) within maxDist m, or null. */
  nearestEdge(x: number, z: number, maxDist: number): EdgeHit | null {
    let best: EdgeHit | null = null;
    this.ringSearch(x, z, maxDist, (e) => {
      const h = this.hit(e, x, z);
      if (h.dist <= maxDist && (!best || h.dist < best.dist)) best = h;
      return best?.dist ?? maxDist;
    });
    return best;
  }

  /** Surface under (x, z): 'pave' / 'asphalt' when on a way's ribbon (width, else lanes × 3.25 m, else 6 m), else null.
   *  Overlapping ribbons (sidewalk beside a road): the nearest centreline wins. */
  surfaceAt(x: number, z: number): 'asphalt' | 'pave' | null {
    let best = Infinity, flags = -1;
    for (const e of this.edgesNear(x, z, this.maxHalfWidth)) {
      const { dist } = this.hit(e, x, z);
      if (dist <= this.halfWidth[this.edgeWay[e]!]! && dist < best) (best = dist), (flags = this.flags(e));
    }
    return flags < 0 ? null : flags & WayFlag.pave ? 'pave' : 'asphalt';
  }
}

const key = (i: number, j: number) => (i + 32768) * 65536 + (j + 32768);
