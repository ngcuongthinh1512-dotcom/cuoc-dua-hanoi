// Phase 5 track B (docs/plans/phase5.md §6 B): GPS to the player's waypoint (SPEC §12): A* `shortestPath` on the road
// graph from the feet to the target ('bike' while riding: no stairs; falls back to 'walk' when the bike has no route),
// searched again off the route (gps.offRoute) at most every gps.minInterval s, trimmed to the player's point on it,
// cleared on arrival. Pure, DOM-free. The target is the player's own waypoint only (never the clue destination: SPEC
// §4.6, §8.2); tests / screenshots set it with ?gps=x,z.
import { type RoadGraph, segPoint, shortestPath } from '@race/shared/graph';
import { gps, roadGraph } from '../config.ts';
import type { GpsView, MapPoint } from '../ui/types.ts';

type Mode = 'walk' | 'bike';

export class Gps implements GpsView {
  target: MapPoint | null = null;
  /** From the player's point on the route to the target; a new array whenever that point moves (the maps just draw it). */
  route: Float32Array | null = null;
  remaining = NaN;
  /** Debug line (F3): searches so far (snap attempts included, ≈ µs when a snap fails), duration of the last one. */
  readonly stats = { searches: 0, ms: 0 };

  private line = new Float64Array(0); // whole route as found: feet, graph nodes…, target (x, z pairs)
  private rest = new Float64Array(0); // m from vertex i to the end
  private seg = 0; // segment of `line` the feet are on (only moves forward, so the walked part drops off)
  private asked: Mode = 'walk'; // mode the current route was searched for
  private used: Mode = 'walk'; // mode it was found for ('bike' asked, 'walk' used = the bike has no route)
  private since = Infinity; // s since the last search
  private px = NaN; // feet projected on the route (the route's first point)
  private pz = NaN;

  constructor(readonly graph: RoadGraph) {}

  setTarget(x: number, z: number): void {
    this.target = { x, z };
    this.route = null; // the old route leads somewhere else; the next update() searches
    this.remaining = NaN;
  }

  clear(): void {
    this.target = this.route = null;
    this.remaining = NaN;
  }

  /** Every frame: feet at (x, z), travel mode. */
  update(x: number, z: number, mode: Mode, dt: number): void {
    this.since += dt;
    const t = this.target;
    if (!t) return;
    if (Math.hypot(t.x - x, t.z - z) <= gps.arriveRadius) return this.clear(); // like GTA: arrived, waypoint gone
    const off = this.route ? this.follow(x, z) > gps.offRoute : false;
    // A walk route found while riding (no bike route) is also the answer once on foot: only the other way round searches.
    const modeChanged = mode !== this.asked && !(mode === 'walk' && this.route && this.used === 'walk');
    if (this.since >= gps.minInterval && (!this.route || modeChanged || off)) this.search(x, z, mode);
  }

  private search(x: number, z: number, mode: Mode): void {
    const t0 = performance.now();
    const { graph: g, target: t } = this;
    this.since = 0;
    this.asked = mode;
    this.stats.searches++;
    let nodes: number[] | undefined;
    for (const m of mode === 'bike' ? (['bike', 'walk'] as const) : (['walk'] as const)) {
      const a = g.nearestNode(x, z, m, roadGraph.snapRadius), b = g.nearestNode(t!.x, t!.z, m, roadGraph.snapRadius);
      // ponytail: snaps to the nearest node, not the nearest edge point (≤ one block of detour at each end); virtual start / goal nodes if it shows.
      // A bike search into a pocket cut off by stairs explores the whole bike network before failing (≈ 13 ms, once per search); the walk fallback then answers.
      const path = a < 0 || b < 0 ? null : shortestPath(g, a, b, m);
      if (path) {
        (nodes = path.nodes), (this.used = m);
        break;
      }
    }
    this.route = null;
    this.remaining = NaN;
    if (nodes) {
      const n = nodes.length + 2;
      const line = (this.line = new Float64Array(2 * n));
      const rest = (this.rest = new Float64Array(n));
      [line[0], line[1]] = [x, z];
      nodes.forEach((v, i) => ([line[2 * i + 2], line[2 * i + 3]] = [g.x[v]!, g.z[v]!]));
      [line[2 * n - 2], line[2 * n - 1]] = [t!.x, t!.z];
      for (let i = n - 2; i >= 0; i--) rest[i] = rest[i + 1]! + Math.hypot(line[2 * i + 2]! - line[2 * i]!, line[2 * i + 3]! - line[2 * i + 1]!);
      this.seg = 0;
      this.px = NaN;
      this.follow(x, z);
    }
    this.stats.ms = performance.now() - t0;
  }

  /** Project the feet on the route: nearest of the current segment and those starting within gps.lookAhead m after it
   *  (ponytail: a route doubling back within that reach can be jumped over; a hysteresis on the distance if it shows).
   *  Sets `route` / `remaining` when the point moved; returns the distance to the route. */
  private follow(x: number, z: number): number {
    const { line: L, rest: R } = this;
    const last = L.length / 2 - 2; // index of the last segment
    let best = Infinity, bi = this.seg, bt = 0;
    for (let i = this.seg; i <= last && (i === this.seg || R[this.seg + 1]! - R[i]! <= gps.lookAhead); i++) {
      const [t, d] = segPoint(x, z, L[2 * i]!, L[2 * i + 1]!, L[2 * i + 2]!, L[2 * i + 3]!);
      if (d < best) (best = d), (bi = i), (bt = t);
    }
    if (bt === 1 && bi < last) (bi += 1), (bt = 0); // at the end of a segment: the next one starts here (no repeated vertex)
    const px = L[2 * bi]! + bt * (L[2 * bi + 2]! - L[2 * bi]!), pz = L[2 * bi + 1]! + bt * (L[2 * bi + 3]! - L[2 * bi + 1]!);
    if (px !== this.px || pz !== this.pz || bi !== this.seg || !this.route) {
      [this.seg, this.px, this.pz] = [bi, px, pz];
      const r = new Float32Array(L.length - 2 * bi); // ponytail: a copy per frame while moving (≤ 2 KB); a view + in-place first point if GC shows
      r.set(L.subarray(2 * bi + 2), 2);
      [r[0], r[1]] = [px, pz];
      this.route = r;
      this.remaining = R[bi]! - bt * (R[bi]! - R[bi + 1]!);
    }
    return best;
  }
}
