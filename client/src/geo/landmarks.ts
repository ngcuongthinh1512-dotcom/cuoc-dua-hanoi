// Landmark registry (SPEC §17.6, docs/plans/phase2b-assets.md §1 + §5.1). DOM-free and three-free: read by
// scripts/build-chunks.ts (tags BuildingRec.landmark, keeps parts / zone nodes), scripts/screenshot.ts (lm-<id>
// presets) and the client (world/landmarks/index.ts dispatches per id, group g1…g5 = one agent's file each).
// OSM ids checked against .cache/osm on 2026-09-28. Heights here only where OSM has none, with the source.
import type { LandmarkId } from './chunkData.ts';

export type LandmarkGroup = 'g1' | 'g2' | 'g3' | 'g4' | 'g5';

export interface LandmarkDef {
  id: LandmarkId;
  name: string; // Vietnamese UI name
  group: LandmarkGroup;
  /** Outline elements ('way/…' | 'relation/…'): each becomes one BuildingRec with this landmark id. */
  osm: string[];
  /** Area element: every building whose centroid lies inside belongs to this landmark (École Militaire). */
  zone?: string;
  /** m around the outlines' bounding box where artwork / street_lamp / clock / fountain nodes are kept. */
  near?: number;
  /** Published total height (m) when OSM has none, source in a comment. */
  height?: number;
  /** Outside the map (skyline): position, altitude of the ground above sea level (m). */
  at?: [number, number];
  groundAsl?: number;
  /** Screenshot preset lm-<id>: camera azimuth seen from the landmark (compass deg, 0 = north) and distance (m). */
  view: [number, number];
}

/** Default `near` (m): nodes on or right next to the outline (bridge lamps, statues on pylons). */
export const LANDMARK_NEAR = 12;

/** Leg 2 (Macao): the Paris registry (Eiffel … La Défense, kept in git history of the Paris repo) is removed; the Macao
 *  landmarks (Ruínas de São Paulo, Largo do Senado, Grand Lisboa, Macau Tower…) get registered here in a later step. */
export const LANDMARKS: readonly LandmarkDef[] = [];

export const LANDMARK_BY_ID = new Map(LANDMARKS.map((d) => [d.id, d]));

/** Paved plazas that are flat in reality but sloped in the AWS DEM (Terrain.flattenPads levels the grid inside each ring
 *  [lat, lon] to the quantile q of the DEM heights inside it). Leg 2: none yet. */
export const PADS: readonly { name: string; q: number; ring: readonly [number, number][] }[] = [];
