// Phase 5 track B (docs/plans/phase5.md §6 B): street name at a point for the HUD location label (SPEC §12): nearest
// named way of the road graph within locate.maxDistance (sidewalks / crossings skipped: they carry no street name), the
// current one kept while within locate.keepDistance (no flicker at junctions). Pure, DOM-free.
import { type RoadGraph, WayFlag, segPoint } from '@race/shared/graph';
import { locate } from '../config.ts';

export class StreetLocator {
  private name = -1; // index in graph.file.names of the street shown, −1 = none
  private x = NaN; // where it was looked up last (locate.recheck)
  private z = NaN;

  constructor(readonly graph: RoadGraph) {}

  /** Street name at (x, z), undefined = none near. Called every frame: the lookup repeats only after locate.recheck m. */
  at(x: number, z: number): string | undefined {
    if (!(Math.hypot(x - this.x, z - this.z) < locate.recheck)) this.lookup(x, z); // also true for the first call (NaN)
    return this.name < 0 ? undefined : this.graph.file.names[this.name];
  }

  // ponytail: plain distance to the way's centreline (a wide avenue loses to a side street near a junction until the
  // keepDistance rule settles it) and all ways of a name count as one street; ribbon-width distance if labels look off.
  private lookup(x: number, z: number): void {
    const g = this.graph, ways = g.file.ways;
    let best = -1, bestD = locate.maxDistance, keepD = Infinity;
    for (const e of g.edgesNear(x, z, Math.max(locate.maxDistance, locate.keepDistance))) {
      const name = ways[g.edgeWay[e]!]![3]!;
      if (name < 0 || g.flags(e) & (WayFlag.sidewalk | WayFlag.crossing)) continue;
      const a = g.edgeA[e]!, b = g.edgeB[e]!;
      const d = segPoint(x, z, g.x[a]!, g.z[a]!, g.x[b]!, g.z[b]!)[1];
      if (name === this.name && d < keepD) keepD = d;
      if (d < bestD) (bestD = d), (best = name);
    }
    [this.x, this.z] = [x, z];
    if (keepD > locate.keepDistance) this.name = best;
  }
}
