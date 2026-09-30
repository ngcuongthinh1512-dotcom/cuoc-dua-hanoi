// OSM tag parsing for scripts/build-chunks.ts (docs/plans/phase2.md "A — Data pipeline").
// DOM-free and three-free. Extracts raw facts only; defaults (heights, widths…) live in the builders.
import type { BridgeRec, BuildingRec, LandmarkPoint, PartRec, RoadRec, S3dFacts, StairRec } from './chunkData.ts';

export type Tags = Record<string, string | undefined>;

/** OSM number tag → number, else undefined: "12.5", "20 m", "17m", "~15", "3;4" (first value), "2,2" (decimal comma). */
export function parseNumber(v: string | undefined): number | undefined {
  const m = v?.split(';')[0]!.trim().match(/^~?\s*(-?\d+(?:[.,]\d+)?)\s*m?$/);
  return m ? Number(m[1]!.replace(',', '.')) : undefined;
}

const yes = (v: string | undefined) => v !== undefined && v !== 'no';

/** Landmark-zone point kinds (kept only near a landmark, see build-chunks). */
export type PointKind = LandmarkPoint['kind'];
export type Category =
  | 'building' | 'part' | 'road' | 'bridge' | 'park' | 'grass' | 'water' | 'quay' | 'tree' | 'tree_row' | 'subway_entrance'
  | PointKind;
/** Counted in index.json stats as `dropped.<reason>`. */
export type DropReason =
  | 'tunnel' | 'underground' | 'indoor' | 'highwayArea' | 'sidewalk' | 'crossing' | 'notRoad';

// Indoor / non-surface highway values (lifts, station corridors, bus-stop platforms, unbuilt roads).
const NOT_ROADS = new Set(['corridor', 'elevator', 'bus_stop', 'platform', 'proposed', 'construction']);
const TRACKS = new Set(['rail', 'subway', 'light_rail', 'tram', 'narrow_gauge']);

/** What a feature becomes in the chunks, why it is dropped, or undefined when it is simply not used. */
export function classify(tags: Tags, shape: 'point' | 'line' | 'area'): Category | { drop: DropReason } | undefined {
  if (shape === 'point') {
    if (tags.natural === 'tree') return 'tree';
    if (tags.railway === 'subway_entrance') return 'subway_entrance'; // entrances often carry layer=-1
    if (tags.tourism === 'artwork') return 'artwork';
    if (tags.highway === 'street_lamp') return 'street_lamp';
    return tags.amenity === 'clock' || tags.amenity === 'fountain' ? tags.amenity : undefined;
  }
  // ponytail: tunnels and underground ways are not rendered (Voie Georges-Pompidou, metro); a tunnel builder if a route needs one.
  if (yes(tags.tunnel)) return { drop: 'tunnel' };
  if ((parseNumber(tags.layer) ?? 0) < 0) return { drop: 'underground' };
  if (yes(tags.indoor) || tags.location === 'underground' || tags.location === 'indoor') return { drop: 'indoor' };
  if (yes(tags.building)) return shape === 'area' ? 'building' : undefined;
  if (yes(tags['building:part'])) return shape === 'area' ? 'part' : undefined; // dropped unless inside a landmark
  if (tags.highway) {
    if (shape === 'area') return { drop: 'highwayArea' };
    if (tags.footway === 'sidewalk' || tags.footway === 'crossing') return { drop: tags.footway };
    if (NOT_ROADS.has(tags.highway)) return { drop: 'notRoad' };
    return yes(tags.bridge) ? 'bridge' : 'road';
  }
  if (shape === 'line' && TRACKS.has(tags.railway ?? '') && yes(tags.bridge)) return 'bridge';
  if (shape === 'area' && tags.tourism === 'artwork') return 'artwork'; // statue plinths (Concorde cities) → centroid
  if (tags.barrier === 'retaining_wall' || tags.man_made === 'embankment' || tags.man_made === 'quay') return 'quay';
  if (shape === 'line') return tags.natural === 'tree_row' ? 'tree_row' : undefined;
  if (tags.leisure === 'park' || tags.leisure === 'garden') return 'park';
  if (tags.landuse === 'grass') return 'grass';
  return tags.natural === 'water' || tags.waterway === 'riverbank' ? 'water' : undefined;
}

const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
/** roof:direction / direction → compass degrees: "135", "SE" → 135, "nnw" → 337.5; else undefined. */
export function parseDirection(v: string | undefined): number | undefined {
  const k = COMPASS.indexOf(v?.trim().toUpperCase() ?? '');
  if (k >= 0) return k * 22.5;
  const n = parseNumber(v);
  return n === undefined ? undefined : ((n % 360) + 360) % 360;
}

/** Simple 3D Buildings tags shared by outlines and parts (no defaults). */
export const s3dFacts = (t: Tags): S3dFacts => ({
  height: parseNumber(t.height),
  minHeight: parseNumber(t.min_height),
  levels: parseNumber(t['building:levels']),
  minLevel: parseNumber(t['building:min_level']),
  roofLevels: parseNumber(t['roof:levels']),
  roofShape: t['roof:shape'],
  roofHeight: parseNumber(t['roof:height']),
  roofDirection: parseDirection(t['roof:direction']),
  roofOrientation: t['roof:orientation'] === 'along' || t['roof:orientation'] === 'across' ? t['roof:orientation'] : undefined,
  roofMaterial: t['roof:material'],
  roofColour: t['roof:colour'],
  colour: t['building:colour'],
  material: t['building:material'],
});

export const buildingFacts = (t: Tags): Omit<BuildingRec, 'outer' | 'holes'> => ({ kind: t.building!, ...s3dFacts(t) });

export const partFacts = (t: Tags): Omit<PartRec, 'outer' | 'holes'> => ({ kind: t['building:part']!, ...s3dFacts(t) });

export const pointFacts = (t: Tags): Omit<LandmarkPoint, 'kind' | 'x' | 'z'> => ({
  sub: t.artwork_type ?? t.support ?? t['fountain:type'],
  height: parseNumber(t.height),
  minHeight: parseNumber(t.min_height),
  colour: t.colour,
  material: t.material,
  direction: parseDirection(t.direction),
});

const ROUND = new Set(['roundabout', 'circular']);

/** Road facts; oneway=-1 is reported as oneway (the caller reverses the points). junction=circular (Étoile) counts as a
 *  roundabout; both imply oneway unless tagged oneway=no. */
export const roadFacts = (t: Tags): Omit<RoadRec, 'pts' | 'junctions' | 'before' | 'after'> => ({
  kind: t.highway!,
  name: t.name,
  width: parseNumber(t.width),
  lanes: parseNumber(t.lanes),
  oneway: ['yes', '1', 'true', '-1'].includes(t.oneway ?? '') || (ROUND.has(t.junction ?? '') && t.oneway !== 'no'),
  surface: t.surface,
  roundabout: ROUND.has(t.junction ?? ''),
});

/** Bridge facts. Names are kept only on highways (SPEC §4.6: maps show street names only). Missing layer → 1. */
export const bridgeFacts = (t: Tags): Omit<BridgeRec, 'pts'> => ({
  kind: t.highway ?? t.railway!,
  layer: parseNumber(t.layer) ?? 1,
  width: parseNumber(t.width),
  lanes: parseNumber(t.lanes),
  name: t.highway ? t.name : undefined,
});

/** highway=steps facts. ponytail: incline is not read, the DEM heights at both ends decide which way is up (the flight
 *  must meet the ground); use it where the z14 DEM is flatter than the stair. */
export const stairFacts = (t: Tags): Omit<StairRec, 'pts'> => ({
  width: parseNumber(t.width),
  steps: parseNumber(t.step_count),
});
