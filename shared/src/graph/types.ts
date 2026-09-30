// Phase 4 contract (docs/plans/phase4.md §6): shared/data/roadgraph.json, written by scripts/build-graph.ts (track C),
// read by the client (GPS Phase 5, bike surface, NPC traffic Phase 4B) and the Host browser (bike corridors Phase 6).
// Never imported by the worker: the Durable Object only picks among candidates the Host submits (CLAUDE.md).

export const GRAPH_VERSION = 1;

/** Way flags (bit mask, RoadGraphFile.ways[k][1]). */
export const WayFlag = {
  walk: 1, // on foot (every kept highway except motorway / trunk without sidewalk)
  bike: 2, // ridable (everything walkable except steps)
  car: 4, // NPC traffic (roads.carKinds + service)
  oneway: 8, // car direction = node order (oneway=-1 reversed at build time; roundabouts implied)
  bridge: 16,
  steps: 32,
  crossing: 64, // footway=crossing (zebra between two sidewalks)
  sidewalk: 128, // footway=sidewalk
  pave: 256, // surface in roads.paveSurfaces (sett, cobblestone…): lower bike grip
  roundabout: 512,
} as const;
export type WayFlagName = keyof typeof WayFlag;

/** One way piece: [kind, flags, lanes (0 = untagged), name (−1 = none), width dm (0 = untagged), layer, ...node indices
 *  (≥ 2)]. Consecutive node indices are the edges. */
export type WayRec = number[];
export const WAY_HEADER = 6;

export interface RoadGraphFile {
  v: typeof GRAPH_VERSION;
  /** Node positions in world dm (m × 10, rounded), interleaved x, z. Node i = (nodes[2i], nodes[2i + 1]) / 10. */
  nodes: number[];
  /** highway=* values (ways[k][0] indexes this). */
  kinds: string[];
  /** Street names (ways[k][3] indexes this). */
  names: string[];
  /** Sorted by OSM way id (deterministic). */
  ways: WayRec[];
  /** Node indices where ≥ 3 street edge ends meet (car kinds + pedestrian; sidewalks / crossings excluded), sorted. */
  junctions: number[];
  /** Node indices tagged highway=crossing, sorted (pedestrians cross here, NPC cars yield). */
  crossings: number[];
  /** Node indices tagged highway=traffic_signals, sorted (Phase 4B simple lights). */
  signals: number[];
  /** amenity=bicycle_parking nodes, world dm interleaved x, z (Phase 6 spawn preference, SPEC §6.2). */
  bikeParking: number[];
}

export type TravelMode = 'walk' | 'bike' | 'car';
