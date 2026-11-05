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

/** Landmark ids: the registry in geo/landmarks.ts (SPEC §17.6, docs/plans/phase2b-assets.md §1). */
/** Registry id of a landmark (geo/landmarks.ts), kebab-case. */
export type LandmarkId = string;

/** Simple 3D Buildings tags (wiki.openstreetmap.org/wiki/Simple_3D_Buildings), parsed, no defaults. Heights in m. */
export interface S3dFacts {
  height?: number; // top of the roof above ground
  minHeight?: number; // bottom of the walls above ground
  levels?: number; // building:levels (walls, roof levels excluded)
  minLevel?: number; // building:min_level
  roofLevels?: number;
  roofShape?: string;
  roofHeight?: number;
  roofDirection?: number; // compass degrees the slope faces (0 = north), letters converted
  roofOrientation?: 'along' | 'across';
  roofMaterial?: string;
  roofColour?: string;
  colour?: string; // building:colour
  material?: string; // building:material
}

/** building:part inside a landmark outline (kept only there, see build-chunks). */
export interface PartRec extends S3dFacts {
  outer: XZ;
  holes?: XZ[];
  kind: string; // building:part=* (yes, column, roof, steps…); isColumn = kind === 'column'
}

/** Landmark-zone node (or artwork area centroid): tourism=artwork, highway=street_lamp, amenity=clock|fountain. */
export interface LandmarkPoint {
  kind: 'artwork' | 'street_lamp' | 'clock' | 'fountain';
  x: number;
  z: number;
  sub?: string; // artwork_type / support / fountain:type
  height?: number;
  minHeight?: number;
  r?: number; // m, equivalent radius of an artwork area (plinth)
  colour?: string;
  material?: string;
  direction?: number; // compass degrees
}

export interface BuildingRec extends S3dFacts {
  outer: XZ;
  holes?: XZ[];
  kind: string; // building=*; landmark outlines that are not buildings: 'bridge' | 'fountain' | 'artwork'
  gen?: 1; // procedural infill house (scripts/infill-houses.ts); dropped + regenerated on every run, lost on a build-chunks rebuild
  landmark?: LandmarkId; // set by build-chunks from the registry; BuildingBuilder skips these
  parts?: PartRec[]; // landmark only: building:part whose centroid lies inside this outline (smallest one wins)
  points?: LandmarkPoint[]; // landmark only: zone nodes whose nearest landmark outline is this one
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
  /** A chain longer than one chunk is split per chunk like roads; every piece carries the whole chain's first two and
   *  last two points [x0, z0, x1, z1, xn-1, zn-1, xn, zn], its length and this piece's start offset along it. */
  chain?: { ends: number[]; length: number; s0: number };
}

export interface AreaRec {
  kind: 'park' | 'grass';
  outer: XZ;
  holes?: XZ[];
} // clipped to chunk bounds

export interface PointRec {
  kind: 'tree' | 'subway_entrance' | 'bus_shelter'; // bus_shelter: highway=bus_stop + shelter=yes (Phase 8C street furniture)
  x: number;
  z: number;
} // tree_row pre-expanded to trees

/** highway=steps (not in `roads`), whole way in the chunk of its midpoint. `quay`: a flight build-chunks laid along the
 *  Seine wall (pts = centre line, top landing first); the builder takes its heights from the river level, not the ends. */
export interface StairRec {
  pts: XZ;
  width?: number;
  steps?: number; // step_count
  quay?: true;
}

/** Street way meeting a junction: its next vertex from the junction + the facts roadWidth() needs. */
export interface JunctionArm {
  to: [number, number];
  kind: string;
  name?: string;
  width?: number;
  lanes?: number;
  oneway?: true;
  roundabout?: true;
}

/** Street junction vertex (build-chunks, over the whole map: arms in the neighbour chunk included). With arms in the
 *  chunk that holds it; arms absent = a neighbour's junction within props.lampJunctionGap (lamp gap only). */
export interface JunctionRec {
  x: number;
  z: number;
  arms?: JunctionArm[];
}

export interface ChunkData {
  v: 2;
  key: ChunkKey;
  buildings: BuildingRec[];
  roads: RoadRec[];
  bridges: BridgeRec[];
  areas: AreaRec[];
  points: PointRec[];
  stairs?: StairRec[];
  junctions?: JunctionRec[];
}

export interface ChunkIndex {
  v: 2;
  chunkSize: 250;
  keys: ChunkKey[]; // every chunk touching RACE_BBOX, even empty ones
  stats: Record<string, number>;
}

export interface WaterData {
  v: 1;
  polygons: { river: boolean; outer: XZ; holes?: XZ[] }[];
  /** Open polylines of barrier=retaining_wall / man_made=embankment|quay within 50 m of the Seine (quay walls
   *  the DEM cannot resolve; closed rings repeat their first point). Optional, added by build-chunks. */
  quays?: XZ[];
  /** Quay stair flights (StairRec.quay): feet [x, z, …] (respawn, Phase 5) and the parapet gaps [x, z, …] on the wall
   *  line at their top landings (quayMesh leaves the parapet out there). */
  stairs?: number[];
  stairGaps?: number[];
  /** Road / foot bridge decks crossing a river edge: [x, z, halfWidth, inlandX, inlandZ, …] on the wall line (deck half
   *  width + margin, wider on an oblique edge; inland = unit vector towards the bank). quayMesh leaves wall and coping out
   *  within halfWidth, carveRiver digs no trench under the deck footprint, else a wall or a hole bars every bridge end. */
  bridgeGaps?: number[];
  /** Phase 5 (HUD location label, street-sign district line; geo/districts.ts): arrondissements (boundary=administrative +
   *  admin_level=9), n = 1…20 (8 = "8e"), sorted by n. */
  districts?: { n: number; outer: XZ; holes?: XZ[] }[];
  /** Phase 5 big map: park / garden / grass outer rings ≥ 400 m², simplified to 2 m (whole areas, not cut per chunk). */
  parks?: XZ[];
} // clipped to the chunk grid around RACE_BBOX (build-chunks waterRect)

/** Skyline outside the map (SPEC §17.6): La Défense towers from one small Overpass query (fetch-osm skyline.json). */
export interface SkylineData {
  v: 1;
  towers: { outer: XZ; height: number; minHeight?: number }[];
}
