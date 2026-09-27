// Phase 2 data contract (docs/plans/phase2.md): compact 250 m chunks produced offline by
// scripts/build-chunks.ts from the raw OSM cache, served from client/public/data/chunks/.
// DOM-free and three-free: imported by the build script (Node), the worker and the main thread.
// Chunks hold parsed OSM FACTS only; defaults (heights, widths…) are applied by the builders from config.ts.

export const CHUNK_SIZE = 250; // m, grid aligned to ORIGIN

/** `${i}_${j}` with i = floor(x / 250), j = floor(z / 250); may be negative, e.g. "-3_-2". */
export type ChunkKey = string;

export const chunkKey = (x: number, z: number): ChunkKey =>
  `${Math.floor(x / CHUNK_SIZE)}_${Math.floor(z / CHUNK_SIZE)}`;

export function chunkBounds(key: ChunkKey) {
  const [i, j] = key.split('_').map(Number);
  const minX = i! * CHUNK_SIZE;
  const minZ = j! * CHUNK_SIZE;
  return { minX, minZ, maxX: minX + CHUNK_SIZE, maxZ: minZ + CHUNK_SIZE };
}

/** Flat [x0, z0, x1, z1, …] in WORLD metres (ORIGIN-relative), rounded to 0.1 m; rings are not closed. */
export type XZ = number[];

/** ½ Σ (x[i+1]·z[i] − x[i]·z[i+1]). > 0 = counter-clockwise on a north-up map (= top face points +Y).
 *  Outer rings are stored with area > 0, holes with area < 0. */
export function ringArea(r: XZ): number {
  let a = 0;
  for (let i = 0, n = r.length; i < n; i += 2) {
    const k = (i + 2) % n;
    a += r[k]! * r[i + 1]! - r[i]! * r[k + 1]!;
  }
  return a / 2;
}

/** Landmarks get dedicated placeholder models (world/Landmarks.ts) instead of an extruded footprint (SPEC §17.4). */
export type LandmarkId = 'eiffel' | 'arc' | 'pyramid' | 'obelisk';

export interface BuildingRec {
  outer: XZ;
  holes?: XZ[];
  kind: string; // building=*
  height?: number;
  levels?: number;
  minHeight?: number;
  roofShape?: string;
  colour?: string;
  roofColour?: string;
  landmark?: LandmarkId; // set by build-chunks for the known OSM ids; BuildingBuilder skips these
}

export interface RoadRec {
  pts: XZ;
  kind: string; // highway=*
  name?: string;
  width?: number;
  lanes?: number;
  oneway: boolean;
  surface?: string;
  roundabout: boolean;
  junctions: number[]; // vertex indices whose point is shared with another road
  before?: [number, number]; // neighbour vertex across a chunk split (seamless miters)
  after?: [number, number];
}

export interface BridgeRec {
  pts: XZ;
  kind: string; // highway=* | railway=*
  layer: number;
  width?: number;
  lanes?: number;
  name?: string;
}

export interface AreaRec {
  kind: 'park' | 'grass';
  outer: XZ;
  holes?: XZ[];
} // clipped to chunk bounds

export interface PointRec {
  kind: 'tree' | 'subway_entrance';
  x: number;
  z: number;
} // tree_row pre-expanded to trees

export interface ChunkData {
  v: 1;
  key: ChunkKey;
  buildings: BuildingRec[];
  roads: RoadRec[];
  bridges: BridgeRec[];
  areas: AreaRec[];
  points: PointRec[];
}

export interface ChunkIndex {
  v: 1;
  chunkSize: 250;
  keys: ChunkKey[]; // every chunk touching RACE_BBOX, even empty ones
  stats: Record<string, number>;
}

export interface WaterData {
  v: 1;
  polygons: { river: boolean; outer: XZ; holes?: XZ[] }[];
} // clipped to RACE_BBOX + 200 m
