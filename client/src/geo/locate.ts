// Phase 5 track B (docs/plans/phase5.md §6 B): street name at a point for the HUD location label (SPEC §12): nearest
// named way of the road graph within locate.maxDistance (sidewalks / crossings skipped: they carry no street name), the
// current one kept while within locate.keepDistance (no flicker at junctions). Pure, DOM-free.
// STUB (foundation): no name.
import type { RoadGraph } from '@race/shared/graph';

export class StreetLocator {
  constructor(readonly graph: RoadGraph) {}

  /** Street name at (x, z), undefined = none near. Called every frame (cheap: cache / throttle inside). */
  at(_x: number, _z: number): string | undefined {
    return undefined;
  }
}
