// Phase 5 track B (docs/plans/phase5.md §6 B): GPS to the player's waypoint (SPEC §12): A* `shortestPath` on the road
// graph from the feet to the target ('bike' while riding: no stairs; falls back to 'walk' when the bike has no route),
// searched again off the route (gps.offRoute) at most every gps.minInterval s, trimmed to the player's point on it,
// cleared on arrival. Pure, DOM-free. The target is the player's own waypoint only (never the clue destination: SPEC
// §4.6, §8.2); tests / screenshots set it with ?gps=x,z.
// STUB (foundation): keeps the target, no route.
import type { RoadGraph } from '@race/shared/graph';
import type { GpsView, MapPoint } from '../ui/types.ts';

export class Gps implements GpsView {
  target: MapPoint | null = null;
  route: Float32Array | null = null;
  remaining = NaN;
  /** Debug line (F3): searches so far, duration of the last one. */
  readonly stats = { searches: 0, ms: 0 };

  constructor(readonly graph: RoadGraph) {}

  setTarget(x: number, z: number): void {
    this.target = { x, z };
  }

  clear(): void {
    this.target = null;
    this.route = null;
    this.remaining = NaN;
  }

  /** Every frame: feet at (x, z), travel mode. */
  update(_x: number, _z: number, _mode: 'walk' | 'bike', _dt: number): void {}
}
