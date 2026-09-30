// Phase 5 track A (docs/plans/phase5.md §6 A): rectangular minimap, bottom-left (SPEC §17.3, STYLE_GUIDE): canvas 2D,
// turns with the camera (heading up), N marker on the rim, zooms out with speed (minimap.metersPerPx), GPS route +
// waypoint (clamped to the rim when outside), player arrow. No NPCs, no bikes, no clue boxes (SPEC §6.6, §8.2, §17.5).
// STUB (foundation): no DOM.
import type { GpsView, HudFrame } from './types.ts';
import type { MapTiles } from './MapTiles.ts';

export class Minimap {
  constructor(readonly tiles: MapTiles) {}

  /** Every frame in player mode. */
  update(_f: HudFrame, _gps: GpsView, _dt: number): void {}
}
