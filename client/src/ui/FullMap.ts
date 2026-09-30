// Phase 5 track A (docs/plans/phase5.md §6 A): full-screen map (M, SPEC §12): north up, drag / wheel zoom, click = set the
// waypoint (click on it again = remove), GPS route, player arrow, street names only (SPEC §4.6). Whole map from the road
// graph (roads, names) + water.json (Seine, ponds, parks overview). No NPCs, bikes or clue boxes.
// STUB (foundation): never opens.
import type { RoadGraph } from '@race/shared/graph';
import type { WaterData } from '../geo/chunkData.ts';
import type { GpsView, HudFrame, MapPoint } from './types.ts';

export class FullMap {
  constructor(
    readonly graph: RoadGraph,
    readonly water: WaterData | undefined,
    /** A click on the map: the new waypoint, or null (removed). */
    readonly onWaypoint: (p: MapPoint | null) => void,
  ) {}

  get isOpen(): boolean {
    return false;
  }

  /** M: shows the map centred on the player (main.ts then releases the pointer when isOpen); `metersPerPx` (URL
   *  ?map=…) = start zoom, else the whole map. */
  open(_f: HudFrame, _metersPerPx?: number): void {}

  close(): void {}

  /** Every frame while open (player arrow, route). */
  update(_f: HudFrame, _gps: GpsView): void {}
}
