// Phase 5 track A (docs/plans/phase5.md §6 A): one raster tile per chunk, drawn lazily from the chunk's MapVectors (≤
// minimap.rasterPerFrame per frame, only near the player) and kept in an LRU (minimap.maxTiles); the minimap blits them.
// STUB (foundation): keeps nothing, draws nothing.
import type { ChunkKey, WaterData } from '../geo/chunkData.ts';
import type { MapVectors } from '../world/mapVectors.ts';

export class MapTiles {
  readonly stats = { vectors: 0, tiles: 0, rasterMs: 0 };

  /** `water` (water.json): the Seine + ponds drawn into every tile. */
  constructor(readonly water: WaterData | undefined) {}

  /** ChunkManager.onMap: the chunk's map layers (kept after the chunk unloads: a few KB each). */
  add(_key: ChunkKey, _map: MapVectors): void {}
}
