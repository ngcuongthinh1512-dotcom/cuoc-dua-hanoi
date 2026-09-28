// OSM tag parsing for scripts/build-chunks.ts (docs/plans/phase2.md "A — Data pipeline").
// DOM-free and three-free. Extracts raw facts only; defaults (heights, widths…) live in the builders.
import type { BridgeRec, BuildingRec, RoadRec } from './chunkData.ts';

export type Tags = Record<string, string | undefined>;

/** OSM number tag → number, else undefined: "12.5", "20 m", "17m", "~15", "3;4" (first value), "2,2" (decimal comma). */
export function parseNumber(v: string | undefined): number | undefined {
  const m = v?.split(';')[0]!.trim().match(/^~?\s*(-?\d+(?:[.,]\d+)?)\s*m?$/);
  return m ? Number(m[1]!.replace(',', '.')) : undefined;
}

const yes = (v: string | undefined) => v !== undefined && v !== 'no';

export type Category =
  | 'building' | 'road' | 'bridge' | 'park' | 'grass' | 'water' | 'quay' | 'tree' | 'tree_row' | 'subway_entrance';
/** Counted in index.json stats as `dropped.<reason>`. */
export type DropReason =
  | 'tunnel' | 'underground' | 'indoor' | 'buildingPart' | 'highwayArea' | 'sidewalk' | 'crossing' | 'notRoad';

// Indoor / non-surface highway values (lifts, station corridors, bus-stop platforms, unbuilt roads).
const NOT_ROADS = new Set(['corridor', 'elevator', 'bus_stop', 'platform', 'proposed', 'construction']);
const TRACKS = new Set(['rail', 'subway', 'light_rail', 'tram', 'narrow_gauge']);

/** What a feature becomes in the chunks, why it is dropped, or undefined when it is simply not used. */
export function classify(tags: Tags, shape: 'point' | 'line' | 'area'): Category | { drop: DropReason } | undefined {
  if (shape === 'point') {
    if (tags.natural === 'tree') return 'tree';
    return tags.railway === 'subway_entrance' ? 'subway_entrance' : undefined; // entrances often carry layer=-1
  }
  // ponytail: tunnels and underground ways are not rendered (Voie Georges-Pompidou, metro); a tunnel builder if a route needs one.
  if (yes(tags.tunnel)) return { drop: 'tunnel' };
  if ((parseNumber(tags.layer) ?? 0) < 0) return { drop: 'underground' };
  if (yes(tags.indoor) || tags.location === 'underground' || tags.location === 'indoor') return { drop: 'indoor' };
  if (yes(tags.building)) return shape === 'area' ? 'building' : undefined;
  if (yes(tags['building:part'])) return { drop: 'buildingPart' };
  if (tags.highway) {
    if (shape === 'area') return { drop: 'highwayArea' };
    if (tags.footway === 'sidewalk' || tags.footway === 'crossing') return { drop: tags.footway };
    if (NOT_ROADS.has(tags.highway)) return { drop: 'notRoad' };
    return yes(tags.bridge) ? 'bridge' : 'road';
  }
  if (shape === 'line' && TRACKS.has(tags.railway ?? '') && yes(tags.bridge)) return 'bridge';
  if (tags.barrier === 'retaining_wall' || tags.man_made === 'embankment' || tags.man_made === 'quay') return 'quay';
  if (shape === 'line') return tags.natural === 'tree_row' ? 'tree_row' : undefined;
  if (tags.leisure === 'park' || tags.leisure === 'garden') return 'park';
  if (tags.landuse === 'grass') return 'grass';
  return tags.natural === 'water' || tags.waterway === 'riverbank' ? 'water' : undefined;
}

export const buildingFacts = (t: Tags): Omit<BuildingRec, 'outer' | 'holes'> => ({
  kind: t.building!,
  height: parseNumber(t.height),
  levels: parseNumber(t['building:levels']),
  minHeight: parseNumber(t.min_height),
  roofShape: t['roof:shape'],
  colour: t['building:colour'],
  roofColour: t['roof:colour'],
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
