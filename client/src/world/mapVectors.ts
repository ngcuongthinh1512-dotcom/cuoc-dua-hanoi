// Phase 5 track A (docs/plans/phase5.md §6 A): the minimap layers of one chunk, extracted in the chunk worker from its
// ChunkData (the main thread never sees chunk JSON) and posted with BuildOut.map; ui/MapTiles.ts rasterises them lazily.
// Pure, DOM-free. Only track A reads this shape: it may change it freely (keep mapBuffers in step).
// STUB (foundation): no map data yet.
import type { ChunkData } from '../geo/chunkData.ts';
import type { BuildCtx } from './buildTypes.ts';

/** Flat pieces, world m: pts = x, z interleaved; piece k = pts[2·start[k] … 2·start[k + 1]) (start has n + 1 entries). */
export interface Pieces {
  pts: Float32Array;
  start: Uint32Array;
}

export interface MapVectors {
  /** Outer rings + holes (even-odd fill). */
  buildings: Pieces;
  /** Rings; kind 0 = park, 1 = grass. */
  areas: Pieces & { kind: Uint8Array };
  /** Centre polylines of roads, bridges, stairs; width = drawn width (m), kind = draw class (track A's table). */
  roads: Pieces & { width: Float32Array; kind: Uint8Array };
}

/** The chunk's map layers, or undefined (stub / empty chunk). */
export function mapVectors(_chunk: ChunkData, _ctx: BuildCtx): MapVectors | undefined {
  return undefined;
}

/** Buffers to transfer from the worker (zero copy). */
export function mapBuffers(m: MapVectors): ArrayBuffer[] {
  const pieces = [m.buildings, m.areas, m.roads];
  return [...pieces.flatMap((p) => [p.pts.buffer, p.start.buffer]), m.areas.kind.buffer, m.roads.width.buffer, m.roads.kind.buffer] as ArrayBuffer[];
}
