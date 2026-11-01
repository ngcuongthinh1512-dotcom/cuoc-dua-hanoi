// Raw OSM cache (.cache/osm, see fetch-osm.ts) → client/public/data/chunks/<key>.json + index.json + water.json
// (+ skyline.json from .cache/osm/skyline.json). Landmarks (geo/landmarks.ts registry, docs/plans/phase2b-assets.md §5):
// outlines tagged, building:part kept inside them, zone nodes (artwork, lamps, clocks, fountains) attached to them.
// docs/plans/phase2.md "A — Data pipeline" + "Chunk data decisions": parsed OSM facts only (no defaults), world metres
// rounded to 0.1 m, sorted by OSM id, compact JSON → deterministic output that is committed to git.
// Usage: npx tsx scripts/build-chunks.ts [--cache <dir with tiles/ + global.json>] [--out <client/public/data>]
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import type { MultiPolygon, Polygon, Position } from 'geojson';
import osmtogeojson from 'osmtogeojson';
import { RACE_BBOX, latLonToWorld } from '@race/shared';
import { props, roads as RD, stairs as ST, terrain as TR } from '../client/src/config.ts';
import {
  type BuildingRec, CHUNK_SIZE, type ChunkData, type ChunkIndex, type ChunkKey, type JunctionArm, type JunctionRec, type LandmarkPoint,
  type PartRec, type SkylineData, type StairRec, type WaterData, type XZ, chunkBounds, chunkKey, ringArea,
} from '../client/src/geo/chunkData.ts';
import {
  type Rect, clipRing, dedupe, mergeChains, midpoint, polylineLength, r1, resample, reversePts, ringCentroid, splitPolyline,
} from '../client/src/geo/clip.ts';
import { LANDMARK_NEAR, LANDMARKS, type LandmarkDef } from '../client/src/geo/landmarks.ts';
import {
  type Tags, bridgeFacts, buildingFacts, classify, parseNumber, partFacts, pointFacts, roadFacts, stairFacts,
} from '../client/src/geo/osm.ts';
import { offsetPolyline } from '../client/src/world/geom.ts';
import { roadWidth, sidewalkWidth } from '../client/src/world/RoadBuilder.ts';
import { seaPolygons } from './coast.ts';
import { PARISHES } from '../client/src/geo/districts.ts';
import { loadDistrictMask } from './district-mask.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const { values: args } = parseArgs({
  options: {
    cache: { type: 'string', default: join(ROOT, '.cache/osm') },
    out: { type: 'string', default: join(ROOT, 'client/public/data') },
  },
});

// Build-time policy (not runtime tunables: changing these needs a rebuild + commit of the data).
const OUTLINES = new Map(LANDMARKS.flatMap((d) => d.osm.map((k) => [k, d] as const)));
const SPLIT_BRIDGE = CHUNK_SIZE; // m: longer bridge chains are split per chunk (the 2.4 km Line 6 viaduct)
const SKYLINE_MIN_HEIGHT = 60; // m, La Défense towers kept in skyline.json
const MIN_RING_AREA = 2; // m²
const MIN_PART_AREA = 0.1; // m²: landmark parts (column drums, pinnacles) are small
const TREE_ROW_STEP = 8; // m between expanded tree_row trees
const TREE_MIN_GAP = 4; // m: tree_row points closer than this to an existing tree are skipped
const QUAY_NEAR_RIVER = 50; // m: quay lines farther than this from the Seine are not written
const WARN_BYTES = 250 * 1024;
const FAIL_BYTES = 2 * 1024 * 1024;
const WATER_FAIL_BYTES = 1024 * 1024;
// Phase 5 (docs/plans/phase5.md §3): big-map park overview in water.json (whole map, not per chunk)
const PARK_TOL = 2; // m, Douglas–Peucker tolerance
const PARK_MIN_AREA = 400; // m²: smaller park / grass areas (verge strips) are left out of the overview
/** Old Hà Nội quận (boundary=historic, name "Quận <PARISHES>") → its number 1…n, else 0. */
const districtNo = (t: Tags | undefined) =>
  t?.boundary === 'historic' && t.name?.startsWith('Quận ') ? PARISHES.indexOf(t.name.slice(5) as (typeof PARISHES)[number]) + 1 : 0;

const t0 = performance.now();
const stats: Record<string, number> = {};
const bump = (k: string, n = 1) => void (stats[k] = (stats[k] ?? 0) + n);

// --- chunk grid: every 250 m key touching RACE_BBOX (even empty) ---
const corners = [RACE_BBOX.south, RACE_BBOX.north].flatMap((lat) =>
  [RACE_BBOX.west, RACE_BBOX.east].map((lon) => latLonToWorld(lat, lon)));
const bbox: Rect = {
  minX: Math.min(...corners.map((c) => c.x)), maxX: Math.max(...corners.map((c) => c.x)),
  minZ: Math.min(...corners.map((c) => c.z)), maxZ: Math.max(...corners.map((c) => c.z)),
};
// water.json is clipped to the chunk grid: beyond it there is no terrain for the water to lie in.
const waterRect: Rect = {
  minX: Math.floor(bbox.minX / CHUNK_SIZE) * CHUNK_SIZE, maxX: Math.ceil(bbox.maxX / CHUNK_SIZE) * CHUNK_SIZE,
  minZ: Math.floor(bbox.minZ / CHUNK_SIZE) * CHUNK_SIZE, maxZ: Math.ceil(bbox.maxZ / CHUNK_SIZE) * CHUNK_SIZE,
};
const chunks = new Map<ChunkKey, ChunkData>();
for (let i = Math.floor(bbox.minX / CHUNK_SIZE); i * CHUNK_SIZE < bbox.maxX; i++) {
  for (let j = Math.floor(bbox.minZ / CHUNK_SIZE); j * CHUNK_SIZE < bbox.maxZ; j++) {
    const key = `${i}_${j}`;
    chunks.set(key, { v: 2, key, buildings: [], roads: [], bridges: [], areas: [], points: [], stairs: [], junctions: [] });
  }
}
/** Chunk at a point, or undefined (counted as dropped.outside) when it lies outside the grid. */
const chunkAt = (x: number, z: number) => chunks.get(chunkKey(x, z)) ?? void bump('dropped.outside');

// --- load + dedupe; relations only when they are multipolygons we use or arrondissements (skips routes…) ---
type OsmElement = { type: 'node' | 'way' | 'relation'; id: number; tags?: Tags };
const elements = new Map<string, OsmElement>();
const files = ['global.json', ...readdirSync(join(args.cache, 'tiles')).filter((f) => f.endsWith('.json')).sort().map((f) => join('tiles', f))];
for (const file of files) {
  for (const e of (JSON.parse(readFileSync(join(args.cache, file), 'utf8')) as { elements: OsmElement[] }).elements) {
    const k = `${e.type}/${e.id}`;
    if (elements.has(k)) continue;
    const used = classify(e.tags ?? {}, 'area') !== undefined || OUTLINES.has(k) || LANDMARKS.some((d) => d.zone === k);
    if (e.type === 'relation' && !districtNo(e.tags) && (e.tags?.type !== 'multipolygon' || !used)) continue;
    elements.set(k, e);
  }
}
const tLoad = performance.now();
const TYPE_ORDER = { node: 0, way: 1, relation: 2 } as const;
type Props = { type: keyof typeof TYPE_ORDER; id: number; tags?: Tags };
const features = osmtogeojson({ elements: [...elements.values()] }, { flatProperties: false }).features
  .map((f) => ({ geometry: f.geometry, p: f.properties as Props }))
  .sort((a, b) => TYPE_ORDER[a.p.type] - TYPE_ORDER[b.p.type] || a.p.id - b.p.id);
const tConvert = performance.now();

// --- geometry helpers ---
const project = ([lon, lat]: Position) => {
  const w = latLonToWorld(lat!, lon!);
  return [r1(w.x), r1(w.z)];
};
const line = (c: Position[]) => dedupe(c.flatMap(project));
/** Closed ring → oriented (sign 1 = outer, area > 0; −1 = hole), or undefined if < 3 points / < 2 m². */
function ring(c: Position[], sign: 1 | -1, minArea = MIN_RING_AREA): XZ | undefined {
  const r = dedupe(c.flatMap(project), true);
  const a = ringArea(r);
  if (r.length < 6 || Math.abs(a) < minArea) return undefined;
  return a * sign > 0 ? r : reversePts(r);
}
type Poly = { outer: XZ; holes?: XZ[] };
const withHoles = (outer: XZ, holes: (XZ | undefined)[]): Poly => {
  const hs = holes.filter((h) => h !== undefined);
  return hs.length ? { outer, holes: hs } : { outer };
};
function polygons(g: Polygon | MultiPolygon, minArea = MIN_RING_AREA): Poly[] {
  const out: Poly[] = [];
  for (const [o, ...hs] of g.type === 'Polygon' ? [g.coordinates] : g.coordinates) {
    const outer = ring(o!, 1, minArea);
    if (outer) out.push(withHoles(outer, hs.map((h) => ring(h, -1, minArea))));
    else bump('dropped.tinyRing');
  }
  return out;
}
const valid = (r: XZ, sign: 1 | -1) => r.length >= 6 && ringArea(r) * sign >= MIN_RING_AREA;
function clipPoly(p: Poly, r: Rect): Poly | undefined {
  const outer = clipRing(p.outer, r);
  if (!valid(outer, 1)) return undefined;
  return withHoles(outer, (p.holes ?? []).map((h) => clipRing(h, r)).filter((h) => valid(h, -1)));
}
const vkeys = (p: XZ) => Array.from({ length: p.length / 2 }, (_, k) => `${p[2 * k]},${p[2 * k + 1]}`);

const inRing = (x: number, z: number, r: XZ) => {
  let inside = false;
  for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
    const [xi, zi, xj, zj] = [r[i]!, r[i + 1]!, r[j]!, r[j + 1]!];
    if (zi > z !== zj > z && x < xi + ((z - zi) / (zj - zi)) * (xj - xi)) inside = !inside;
  }
  return inside;
};
const segDist = (px: number, pz: number, r: XZ, i: number, j: number) => {
  const [ax, az, dx, dz] = [r[i]!, r[i + 1]!, r[j]! - r[i]!, r[j + 1]! - r[i + 1]!];
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(px - ax - t * dx, pz - az - t * dz);
};
const inPoly = (x: number, z: number, p: Poly) => inRing(x, z, p.outer) && !(p.holes ?? []).some((h) => inRing(x, z, h));
/** Douglas–Peucker on a closed ring, split at vertex 0 and the vertex farthest from it (both always kept). */
function simplifyRing(r: XZ, tol: number): XZ {
  const n = r.length / 2;
  const c = [...r, r[0]!, r[1]!]; // closed: vertex n = vertex 0
  const keep = new Uint8Array(n + 1);
  const dp = (i: number, j: number) => {
    let best = -1, d = tol;
    for (let k = i + 1; k < j; k++) {
      const dk = segDist(c[2 * k]!, c[2 * k + 1]!, c, 2 * i, 2 * j);
      if (dk > d) (d = dk), (best = k);
    }
    if (best < 0) return;
    keep[best] = 1;
    dp(i, best);
    dp(best, j);
  };
  let m = 1;
  for (let k = 2; k < n; k++) if (Math.hypot(c[2 * k]! - c[0]!, c[2 * k + 1]! - c[1]!) > Math.hypot(c[2 * m]! - c[0]!, c[2 * m + 1]! - c[1]!)) m = k;
  keep[0] = keep[m] = 1;
  dp(0, m);
  dp(m, n);
  return r.filter((_, k) => keep[k >> 1]);
}

// Landmark zones (areas whose buildings all belong to one landmark), resolved before the main pass.
const zones = LANDMARKS.filter((d) => d.zone).map((def) => {
  const f = features.find((q) => `${q.p.type}/${q.p.id}` === def.zone);
  if (!f || (f.geometry.type !== 'Polygon' && f.geometry.type !== 'MultiPolygon')) console.warn(`[build-chunks] zone ${def.zone} of ${def.id} not found`);
  return { def, polys: f && (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon') ? polygons(f.geometry) : [] };
});

// Tree spatial hash (cells of TREE_MIN_GAP) for the tree_row de-duplication.
const treeCells = new Map<string, number[]>();
const cellKey = (cx: number, cz: number) => `${cx},${cz}`;
function nearTree(x: number, z: number) {
  const [cx, cz] = [Math.floor(x / TREE_MIN_GAP), Math.floor(z / TREE_MIN_GAP)];
  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) {
      const c = treeCells.get(cellKey(cx + dx, cz + dz)) ?? [];
      for (let k = 0; k < c.length; k += 2) if (Math.hypot(c[k]! - x, c[k + 1]! - z) < TREE_MIN_GAP) return true;
    }
  }
  return false;
}
function addTree(x: number, z: number) {
  const k = cellKey(Math.floor(x / TREE_MIN_GAP), Math.floor(z / TREE_MIN_GAP));
  treeCells.set(k, [...(treeCells.get(k) ?? []), x, z]);
  chunkAt(x, z)?.points.push({ kind: 'tree', x, z });
}

// --- classify every feature ---
type RoadWay = { pts: XZ; facts: ReturnType<typeof roadFacts> };
type BridgeWay = { pts: XZ; group: string; road: boolean; facts: ReturnType<typeof bridgeFacts> };
const roadWays: RoadWay[] = [];
const stairWays: StairRec[] = [];
const bridgeWays: BridgeWay[] = [];
const water: WaterData['polygons'] = [];
const coastLines: XZ[] = []; // natural=coastline ways (Leg 2: the sea, see coast.ts)
const districts: NonNullable<WaterData['districts']> = [];
const parkOverview: XZ[] = [];
const quayLines: XZ[] = [];
const seenLandmarks = new Set<string>();
type LmRec = { rec: BuildingRec; def: LandmarkDef; area: number; box: Rect };
const lmRecs: LmRec[] = [];
const partCands: { poly: Poly; facts: ReturnType<typeof partFacts> }[] = [];
const pointCands: LandmarkPoint[] = [];
const box = (r: XZ): Rect => {
  const xs = r.filter((_, k) => k % 2 === 0);
  const zs = r.filter((_, k) => k % 2 === 1);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) };
};

/** Park / grass ground of one polygon: the big-map overview + the per-chunk `areas`. */
function addPark(poly: { outer: XZ; holes?: XZ[] }, kind: 'park' | 'grass') {
  const whole = clipPoly(poly, waterRect)?.outer;
  if (whole && ringArea(whole) >= PARK_MIN_AREA) parkOverview.push(simplifyRing(whole, PARK_TOL));
  const xs = poly.outer.filter((_, k) => k % 2 === 0);
  const zs = poly.outer.filter((_, k) => k % 2 === 1);
  for (let i = Math.floor(Math.min(...xs) / CHUNK_SIZE); i * CHUNK_SIZE < Math.max(...xs); i++) {
    for (let j = Math.floor(Math.min(...zs) / CHUNK_SIZE); j * CHUNK_SIZE < Math.max(...zs); j++) {
      const c = chunks.get(`${i}_${j}`);
      const clipped = c && clipPoly(poly, chunkBounds(c.key));
      if (clipped) c.areas.push({ kind, ...clipped });
    }
  }
}

for (const { geometry: g, p } of features) {
  const tags = p.tags ?? {};
  const shape = g.type === 'Point' ? 'point' : g.type === 'LineString' ? 'line' : g.type === 'Polygon' || g.type === 'MultiPolygon' ? 'area' : undefined;
  if (!shape) continue; // MultiLineString / GeometryCollection: routes, not used
  if (tags.natural === 'coastline' && g.type === 'LineString') {
    coastLines.push(line(g.coordinates));
    continue;
  }
  const district = districtNo(tags);
  if (district) {
    if (g.type === 'Polygon' || g.type === 'MultiPolygon') for (const poly of polygons(g)) {
      const clipped = clipPoly(poly, waterRect);
      if (clipped) districts.push({ n: district, ...clipped });
    }
    continue;
  }
  // Phase 8C street furniture: bus stops with a shelter (highway=bus_stop + shelter=yes; one per 15 m: platform duplicates)
  if (g.type === 'Point' && tags.highway === 'bus_stop' && /^yes/.test(tags.shelter ?? '')) {
    const [x, z] = project(g.coordinates);
    const c = chunkAt(x!, z!);
    if (c && !c.points.some((q) => q.kind === 'bus_shelter' && Math.hypot(q.x - x!, q.z - z!) < 15)) {
      c.points.push({ kind: 'bus_shelter', x: x!, z: z! });
      bump('points.busShelter');
    } else bump('dropped.busShelterDuplicate');
    continue;
  }
  const def = OUTLINES.get(`${p.type}/${p.id}`);
  const cat = def ? 'building' : classify(tags, shape);
  if (cat === undefined) continue;
  if (typeof cat === 'object') {
    bump(`dropped.${cat.drop}`);
    continue;
  }
  if (g.type === 'Point') {
    const [x, z] = project(g.coordinates);
    if (cat === 'tree') addTree(x!, z!);
    else if (cat === 'subway_entrance') chunkAt(x!, z!)?.points.push({ kind: 'subway_entrance', x: x!, z: z! });
    else if (cat === 'artwork' || cat === 'street_lamp' || cat === 'clock' || cat === 'fountain') {
      pointCands.push({ kind: cat, x: x!, z: z!, ...pointFacts(tags) });
      continue;
    } else continue;
    bump(cat === 'tree' ? 'points.tree' : 'points.subwayEntrance');
    continue;
  }
  if (g.type === 'LineString') {
    const pts = line(g.coordinates);
    if (pts.length < 4) {
      bump('dropped.degenerate');
      continue;
    }
    if (cat === 'tree_row') {
      const r = resample(pts, TREE_ROW_STEP);
      for (let k = 0; k < r.length; k += 2) {
        if (nearTree(r[k]!, r[k + 1]!)) {
          bump('dropped.treeRowNearTree');
        } else {
          addTree(r[k]!, r[k + 1]!);
          bump('points.treeFromRow');
        }
      }
    } else if (cat === 'road' && tags.highway === 'steps') {
      stairWays.push({ pts, ...stairFacts(tags) });
    } else if (cat === 'road') {
      roadWays.push({ pts: tags.oneway === '-1' ? reversePts(pts) : pts, facts: roadFacts(tags) });
    } else if (cat === 'bridge') {
      const facts = bridgeFacts(tags);
      bridgeWays.push({ pts, group: `${facts.kind}|${facts.layer}|${facts.name ?? ''}`, road: !!tags.highway, facts });
    } else if (cat === 'quay') quayLines.push(pts);
    continue;
  }
  if (g.type !== 'Polygon' && g.type !== 'MultiPolygon') continue;
  if (cat === 'quay') {
    for (const { outer } of polygons(g)) quayLines.push([...outer, outer[0]!, outer[1]!]);
    continue;
  }
  if (cat === 'part') {
    for (const poly of polygons(g, MIN_PART_AREA)) partCands.push({ poly, facts: partFacts(tags) });
    continue;
  }
  if (cat === 'artwork') {
    for (const { outer } of polygons(g)) {
      const [x, z] = ringCentroid(outer);
      pointCands.push({ kind: 'artwork', x: r1(x), z: r1(z), ...pointFacts(tags), r: r1(Math.sqrt(ringArea(outer) / Math.PI)) });
    }
    continue;
  }
  // Concorde fountains are landmark outlines AND water basins.
  if (def && classify(tags, 'area') === 'water') for (const poly of polygons(g)) {
    const clipped = clipPoly(poly, waterRect);
    if (clipped) water.push({ river: false, ...clipped });
  }
  for (const poly of polygons(g)) {
    if (cat === 'building') {
      const [cx, cz] = ringCentroid(poly.outer);
      const lm = def ?? zones.find((zn) => zn.polys.some((zp) => inPoly(cx, cz, zp)))?.def;
      const rec: BuildingRec = { ...poly, ...buildingFacts(tags), ...(lm && { landmark: lm.id }) };
      if (rec.height === undefined && rec.levels === undefined && (tags.amenity === 'shelter' || tags.shelter_type)) rec.height = 5; // pavilions / bandstands (Nhà Bát Giác) are one storey, not the 6-storey default
      // Landmark outlines that are not buildings (bridge decks, fountains, artworks) keep what they are.
      // historic=ruins|fort without building=* (Ruínas de São Paulo, Fortaleza da Guia) are solid → kind 'ruins'.
      if (lm && !tags.building) rec.kind = tags.man_made === 'bridge' ? 'bridge' : tags.amenity === 'fountain' ? 'fountain' : /^(ruins|fort)$/.test(tags.historic ?? '') ? 'ruins' : 'artwork';
      if (lm) {
        seenLandmarks.add(lm.id);
        lmRecs.push({ rec, def: lm, area: ringArea(poly.outer), box: box(poly.outer) });
      }
      if (rec.height === undefined && rec.levels === undefined) bump('missing.building.heightAndLevels');
      chunkAt(cx, cz)?.buildings.push(rec);
      const ground = lm && !tags.building ? classify(tags, 'area') : undefined; // a landmark park / garden keeps its lawn ground
      if (ground === 'park' || ground === 'grass') addPark(poly, ground);
    } else if (cat === 'park' || cat === 'grass') {
      addPark(poly, cat);
    } else if (cat === 'water') {
      const clipped = clipPoly(poly, waterRect);
      const river = tags.water === 'river' || tags.water === 'canal' || tags.waterway === 'riverbank' || tags.waterway === 'canal' || /canal/i.test(tags.name ?? '');
      if (clipped) water.push({ river, ...clipped });
    }
  }
}
// Leg 2 (Macao; Brussels has no coast: coastLines is empty there): the sea is filed as a river (carveRiver, quays, quay stairs, bridge gaps all key on `river`).
for (const sea of seaPolygons(coastLines, waterRect)) {
  water.push({ river: true, outer: sea.outer, ...(sea.holes.length && { holes: sea.holes }) });
  bump('water.sea');
}
for (const d of LANDMARKS) if ((d.osm.length || d.zone) && !seenLandmarks.has(d.id)) console.warn(`[build-chunks] landmark ${d.id} not found in the OSM cache`);

// --- landmark parts: building:part whose centroid lies inside a landmark outline → that outline (smallest wins) ---
const within = (b: Rect, x: number, z: number, m = 0) => x >= b.minX - m && x <= b.maxX + m && z >= b.minZ - m && z <= b.maxZ + m;
for (const { poly, facts } of partCands) {
  const [x, z] = ringCentroid(poly.outer);
  const owner = lmRecs.filter((l) => within(l.box, x, z) && inPoly(x, z, l.rec)).sort((a, b) => a.area - b.area)[0];
  if (!owner) {
    bump('dropped.buildingPart');
    continue;
  }
  const part: PartRec = { ...poly, ...facts };
  (owner.rec.parts ??= []).push(part);
  bump('landmarks.parts');
}

// --- landmark points: zone nodes → the nearest landmark outline whose box + near contains them ---
const ringDist = (x: number, z: number, r: XZ) => {
  let d = Infinity;
  for (let i = 0; i < r.length; i += 2) d = Math.min(d, segDist(x, z, r, i, (i + 2) % r.length));
  return d;
};
for (const pt of pointCands) {
  let best: LmRec | undefined;
  let bestD = Infinity;
  for (const l of lmRecs) {
    if (!within(l.box, pt.x, pt.z, l.def.near ?? LANDMARK_NEAR)) continue;
    const d = inPoly(pt.x, pt.z, l.rec) ? 0 : ringDist(pt.x, pt.z, l.rec.outer);
    if (d < bestD) [best, bestD] = [l, d];
  }
  if (!best) continue;
  (best.rec.points ??= []).push(Object.fromEntries(Object.entries(pt).filter(([, v]) => v !== undefined)) as unknown as LandmarkPoint);
  bump(`landmarks.points.${pt.kind}`);
}
for (const l of lmRecs) {
  bump(`lm.${l.def.id}`);
  bump(`lm.${l.def.id}.parts`, l.rec.parts?.length ?? 0);
  bump(`lm.${l.def.id}.points`, l.rec.points?.length ?? 0);
}

// --- buildings whose centroid is on the Seine (boats, houseboats, floating restaurants) are dropped (TODO.md) ---
const onRiver = (x: number, z: number) => water.some((w) => w.river && inPoly(x, z, w));
for (const c of chunks.values()) {
  const n = c.buildings.length;
  c.buildings = c.buildings.filter((b) => b.landmark || !onRiver(...ringCentroid(b.outer)));
  bump('dropped.buildingOnRiver', n - c.buildings.length);
}

// --- roads: junctions = rounded vertices shared by ≥ 2 road ways (bridges carrying roads included) ---
const useCount = new Map<string, number>();
for (const w of [...roadWays, ...bridgeWays.filter((b) => b.road)]) {
  for (const k of new Set(vkeys(w.pts))) useCount.set(k, (useCount.get(k) ?? 0) + 1);
}
// Street junctions over the whole map (StreetProps: signs, Morris columns, lamp gaps), so a junction on a chunk border
// keeps the arms whose pieces lie in the neighbour chunk. Every street vertex shared with another way (kinds as
// props.carKinds + streetKinds: rebuild after changing them).
const STREET = new Set([...props.carKinds, ...props.streetKinds]);
const junctionMap = new Map<string, JunctionRec & { arms: JunctionArm[] }>();
for (const w of roadWays) {
  if (!STREET.has(w.facts.kind)) continue;
  const keys = vkeys(w.pts);
  const { kind, name, width, lanes, oneway, roundabout } = w.facts;
  const facts = { kind, name, width, lanes, ...(oneway && { oneway: true as const }), ...(roundabout && { roundabout: true as const }) };
  keys.forEach((k, i) => {
    if (useCount.get(k)! < 2) return;
    let j = junctionMap.get(k);
    if (!j) junctionMap.set(k, (j = { x: w.pts[2 * i]!, z: w.pts[2 * i + 1]!, arms: [] }));
    for (const q of [i - 1, i + 1]) if (q >= 0 && q < keys.length) j.arms.push({ to: [w.pts[2 * q]!, w.pts[2 * q + 1]!], ...facts });
  });
}
for (const j of junctionMap.values()) {
  bump('junctions');
  chunkAt(j.x, j.z)?.junctions!.push(j);
  const g = props.lampJunctionGap;
  for (const k of new Set([[-g, -g], [-g, g], [g, -g], [g, g], [-g, 0], [g, 0], [0, -g], [0, g]].map(([dx, dz]) => chunkKey(j.x + dx!, j.z + dz!)))) {
    if (k !== chunkKey(j.x, j.z)) chunks.get(k)?.junctions!.push({ x: j.x, z: j.z });
  }
}
for (const w of roadWays) {
  bump('roads.ways');
  if (w.facts.width === undefined) bump('missing.road.width');
  if (w.facts.lanes === undefined) bump('missing.road.lanes');
  const pieces = splitPolyline(w.pts, vkeys(w.pts).map((k) => useCount.get(k)! > 1));
  for (const { key, ...piece } of pieces) {
    const c = chunks.get(key);
    if (c) c.roads.push({ ...piece, ...w.facts });
    else bump('dropped.outside');
  }
}

// --- bridges: ways merged into bank-to-bank chains, whole chain in the chunk of its midpoint; chains longer than
// SPLIT_BRIDGE are split per chunk like roads, each piece knowing the whole chain (deck heights, end caps). An OSM stub
// (a road chain shorter than BRIDGE_STUB over or within BRIDGE_STUB_NEAR of the river: a slip lane split off the deck at
// the quay) is dropped: its own deck would dive to the river bed beside the real one and open the quay wall. ---
const BRIDGE_STUB = 20; // m
const riverRings = water.filter((w) => w.river).flatMap((w) => [w.outer, ...(w.holes ?? [])]);
const BRIDGE_STUB_NEAR = 10; // m
const riverAt = (x: number, z: number) => water.some((w) => w.river && inPoly(x, z, w));
const riverNear = (x: number, z: number) =>
  riverAt(x, z) ||
  riverRings.some((r) => r.some((_, i) => i % 2 === 0 && segDist(x, z, r, i, (i + 2) % r.length) <= BRIDGE_STUB_NEAR));
// Leg 3 Hà Nội (scripts/district-mask.ts): a bridge chain stays when any vertex of it is in the three districts, whole: a deck
// over the Tô Lịch / Red River boundary reaches the far bank instead of ending mid-river at the cut, and its gaps in the quay
// wall (below) are made for both banks.
const mask = loadDistrictMask(args.cache);
const touchesMask = (pts: XZ) => { for (let k = 0; k < pts.length; k += 2) if (mask.contains(pts[k]!, pts[k + 1]!)) return true; return false; };
const bridgeChains = mergeChains(bridgeWays).filter(({ pts, members }) => {
  const { kind } = bridgeWays[members[0]!]!.facts;
  const stub = polylineLength(pts) < BRIDGE_STUB && STREET.has(kind) && !RD.footKinds.includes(kind) && riverNear(...midpoint(pts));
  if (stub) bump('dropped.bridgeStubs');
  if (!stub && !touchesMask(pts)) bump('masked.bridges');
  return !stub && touchesMask(pts);
});
for (const { pts, members } of bridgeChains) {
  bump('bridges.ways', members.length);
  const facts = bridgeWays[members[0]!]!.facts;
  const length = polylineLength(pts);
  if (length <= SPLIT_BRIDGE) {
    chunkAt(...midpoint(pts))?.bridges.push({ pts, ...facts });
    continue;
  }
  const n = pts.length;
  const ends = [...pts.slice(0, 4), ...pts.slice(n - 4)];
  let s0 = 0;
  for (const piece of splitPolyline(pts, [])) {
    const c = chunks.get(piece.key);
    if (c) c.bridges.push({ pts: piece.pts, ...facts, chain: { ends, length: r1(length), s0: r1(s0) } });
    else bump('dropped.outside');
    s0 += polylineLength(piece.pts);
    bump('bridges.splitPieces');
  }
}

// --- quays: keep lines near the Seine, inside the water rect ---

// --- bridge gaps: where a road / foot deck (any layer: Petit-Pont is layer 2) crosses a river edge the quay parapet must
// open (Terrain.quayMesh) and the carved trench behind the wall must not be dug (Terrain.carveRiver), else a 1 m wall
// or a 10 m hole bars both ends of every bridge. [x, z, halfWidth, inlandX, inlandZ] per crossing, half width =
// BridgeBuilder's deck edge + margin (wider along an oblique edge), inland = unit vector from the crossing to the bank.
// The chain is extended by BridgeBuilder's endRamp tongue, so a chain ending a hair short of the edge still opens the wall. ---
const BRIDGE_GAP_MARGIN = 0.3; // m beyond the deck edge (railing face); wider = a hole into the trench beside the deck
const bridgeGaps: number[] = [];
for (const { pts: chain, members } of bridgeChains) {
  const facts = bridgeWays[members[0]!]!.facts;
  if (RD.railKinds.includes(facts.kind)) continue;
  const way = { ...facts, oneway: false };
  const half = r1(roadWidth(way) / 2 + sidewalkWidth(way) + BRIDGE_GAP_MARGIN);
  const n = chain.length;
  const ext = (x: number, z: number, px: number, pz: number) => {
    const l = Math.hypot(x - px, z - pz) || 1;
    return [x + ((x - px) / l) * RD.bridge.endRamp, z + ((z - pz) / l) * RD.bridge.endRamp];
  };
  const pts = [...ext(chain[0]!, chain[1]!, chain[2]!, chain[3]!), ...chain, ...ext(chain[n - 2]!, chain[n - 1]!, chain[n - 4]!, chain[n - 3]!)];
  for (let i = 0; i + 3 < pts.length; i += 2) {
    const [ax, az, bx, bz] = [pts[i]!, pts[i + 1]!, pts[i + 2]!, pts[i + 3]!];
    for (const r of riverRings) {
      for (let k = 0; k < r.length; k += 2) {
        const [cx, cz, dx, dz] = [r[k]!, r[k + 1]!, r[(k + 2) % r.length]!, r[(k + 3) % r.length]!];
        const den = (bx - ax) * (dz - cz) - (bz - az) * (dx - cx);
        if (!den) continue;
        const t = ((cx - ax) * (dz - cz) - (cz - az) * (dx - cx)) / den;
        const u = ((cx - ax) * (bz - az) - (cz - az) * (bx - ax)) / den;
        // Along the edge the opening is wider when the deck crosses it obliquely (half / sin of the crossing angle).
        const sin = Math.abs(den) / ((Math.hypot(bx - ax, bz - az) || 1) * (Math.hypot(dx - cx, dz - cz) || 1));
        if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
          const [gx, gz] = [ax + t * (bx - ax), az + t * (bz - az)];
          const len = Math.hypot(bx - ax, bz - az) || 1;
          const inland = riverAt(gx + ((bx - ax) / len) * 3, gz + ((bz - az) / len) * 3) ? -1 : 1;
          bridgeGaps.push(r1(gx), r1(gz), r1(half / Math.max(sin, 0.3)), +(((bx - ax) / len) * inland).toFixed(3), +(((bz - az) / len) * inland).toFixed(3));
        }
      }
    }
  }
}
bump('water.bridgeGaps', bridgeGaps.length / 5);
// ponytail: brute force point × river edge (~1 s), a segment grid if the map or the quay count grows.
const nearRiver = (x: number, z: number) =>
  riverRings.some((r) => r.some((_, i) => i % 2 === 0 && segDist(x, z, r, i, (i + 2) % r.length) <= QUAY_NEAR_RIVER));
const inWaterRect = (x: number, z: number) => x >= waterRect.minX && x <= waterRect.maxX && z >= waterRect.minZ && z <= waterRect.maxZ;
const quays = quayLines.filter((q) => q.some((_, i) => i % 2 === 0 && inWaterRect(q[i]!, q[i + 1]!) && nearRiver(q[i]!, q[i + 1]!)));
bump('water.quays', quays.length);
bump('dropped.quayFarFromRiver', quayLines.length - quays.length);

// --- stairs (highway=steps, SPEC §4.4): OSM flights whole in the chunk of their midpoint; an OSM flight with an end
// within stairs.quay.reach of the Seine becomes a quay flight on the nearest wall point (the lower quays are not carved,
// Terrain.carveRiver); banks with fewer than one flight per quay.spacing m get synthetic ones. A quay flight runs along
// the wall on the river side, top landing first, and must stay clear of bridges and of the water-rect cut. ---
const Q = ST.quay;
const quayRun = Q.landing + Math.ceil((TR.quayHeight + TR.copingLift + Q.under) / ST.riser) * ST.tread;
const quayOff = Q.width / 2 + 0.02; // centre line from the wall (no stringer on the wall side)
type Bank = { r: XZ; cum: number[]; cut: boolean[] };
const onRect = (x: number, z: number) => [waterRect.minX, waterRect.maxX].some((v) => Math.abs(x - v) < 0.05) || [waterRect.minZ, waterRect.maxZ].some((v) => Math.abs(z - v) < 0.05);
const banks: Bank[] = water.filter((w) => w.river).flatMap((w) => [
  ringArea(w.outer) > 0 ? w.outer : reversePts(w.outer), ...(w.holes ?? []).map((h) => (ringArea(h) < 0 ? h : reversePts(h))),
]).map((r) => { // river on the left (Terrain.riverLeft)
  const n = r.length / 2;
  const cum = [0];
  const cut: boolean[] = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    cum.push(cum[i]! + Math.hypot(r[2 * j]! - r[2 * i]!, r[2 * j + 1]! - r[2 * i + 1]!));
    cut.push(onRect(r[2 * i]!, r[2 * i + 1]!) && onRect(r[2 * j]!, r[2 * j + 1]!));
  }
  return { r, cum, cut };
});
/** Nearest wall point: bank index, arc position, distance. */
function nearestBank(x: number, z: number) {
  let best = { b: -1, s: 0, d: Infinity };
  banks.forEach(({ r, cum, cut }, b) => {
    for (let i = 0; i < cut.length; i++) {
      if (cut[i]) continue;
      const j = (i + 1) % cut.length;
      const [ax, az, dx, dz] = [r[2 * i]!, r[2 * i + 1]!, r[2 * j]! - r[2 * i]!, r[2 * j + 1]! - r[2 * i + 1]!];
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
      const d = Math.hypot(x - ax - t * dx, z - az - t * dz);
      if (d < best.d) best = { b, s: cum[i]! + t * (cum[i + 1]! - cum[i]!), d };
    }
  });
  return best;
}
/** Wall polyline from arc s over len m (dir −1 = backwards), undefined if it crosses a cut edge. */
function bankSlice({ r, cum, cut }: Bank, s: number, len: number, dir: 1 | -1): XZ | undefined {
  const L = cum[cum.length - 1]!;
  const n = cut.length;
  const at = (u: number): [number, number, number] => { // point + edge index at arc u (wrapped)
    const w = ((u % L) + L) % L;
    let i = 0;
    while (i < n - 1 && cum[i + 1]! < w) i++;
    const j = (i + 1) % n;
    const t = (w - cum[i]!) / (cum[i + 1]! - cum[i]! || 1);
    return [r[2 * i]! + t * (r[2 * j]! - r[2 * i]!), r[2 * i + 1]! + t * (r[2 * j + 1]! - r[2 * i + 1]!), i];
  };
  const out: XZ = [];
  const [x0, z0, e0] = at(s);
  out.push(x0, z0);
  if (cut[e0]) return undefined;
  const stops = cum.slice(0, n).flatMap((c) => [c - L, c, c + L]).map((c) => (c - s) * dir).filter((d) => d > 0.05 && d < len - 0.05).sort((a, b) => a - b);
  for (const d of stops) {
    const [x, z] = at(s + dir * d);
    out.push(x, z);
  }
  const [x1, z1, e1] = at(s + dir * len);
  if (cut[e1] || stops.some((d) => cut[at(s + dir * (d + 0.01))[2]])) return undefined;
  out.push(x1, z1);
  return out;
}
const bridgeLines = bridgeWays.map((b) => b.pts);
const nearLines = (pts: XZ, lines: XZ[], r: number) => resample(pts, 2).some((_, k, a) => k % 2 === 0 &&
  lines.some((l) => l.some((_, i) => i % 2 === 0 && i + 3 < l.length && segDist(a[k]!, a[k + 1]!, l, i, i + 2) < r)));
const quayAt: { b: number; s: number; osm: boolean }[] = [];
const osmStairs: StairRec[] = [];
// OSM steps from a subway entrance down into the station: the Guimard well (StreetProps) draws them.
const entrances = [...chunks.values()].flatMap((c) => c.points.filter((q) => q.kind === 'subway_entrance'));
const METRO_STEPS = 8; // m from a subway entrance
for (const st of stairWays) {
  const n = st.pts.length;
  if ([0, n - 2].some((i) => entrances.some((q) => Math.hypot(q.x - st.pts[i]!, q.z - st.pts[i + 1]!) < METRO_STEPS))) {
    bump('dropped.metroSteps');
    continue;
  }
  const ends = [nearestBank(st.pts[0]!, st.pts[1]!), nearestBank(st.pts[n - 2]!, st.pts[n - 1]!)];
  const e = ends[0]!.d <= ends[1]!.d ? ends[0]! : ends[1]!;
  if (e.d <= Q.reach) quayAt.push({ ...e, osm: true });
  else osmStairs.push(st);
}
bump('stairs.osmToQuay', quayAt.length);
const quayFlights: { pts: XZ; gap: [number, number] }[] = [];
banks.forEach((bank, b) => {
  const L = bank.cum[bank.cum.length - 1]!;
  const at = quayAt.filter((q) => q.b === b).map((q) => q.s).sort((p, q) => p - q)
    .filter((s, k, a) => k === 0 || s - a[k - 1]! >= Q.merge);
  const want = [...at];
  if (!at.length) for (let s = Q.spacing / 2; s < L; s += Q.spacing) want.push(s);
  for (let k = 0; k < at.length; k++) {
    const gap = ((at[(k + 1) % at.length]! - at[k]! + L) % L) || L;
    const m = Math.floor(gap / Q.spacing);
    for (let q = 1; q <= m; q++) want.push(at[k]! + (gap * q) / (m + 1));
  }
  for (const s of want) {
    for (const dir of [1, -1] as const) {
      const wall = bankSlice(bank, s, quayRun, dir);
      if (!wall) continue;
      const pts = dedupe(offsetPolyline(wall, dir * quayOff).map(r1));
      if (nearLines(pts, bridgeLines, Q.bridgeClear) || nearLines(pts, quayFlights.map((f) => f.pts), Q.width + 1)) continue;
      const g = bankSlice(bank, s, Q.landing / 2, dir)!;
      quayFlights.push({ pts, gap: [r1(g[g.length - 2]!), r1(g[g.length - 1]!)] });
      break;
    }
  }
});
bump('stairs.quay', quayFlights.length);
for (const st of osmStairs) {
  bump('stairs.osm');
  chunkAt(...midpoint(st.pts))?.stairs!.push(st);
}
for (const f of quayFlights) chunkAt(...midpoint(f.pts))?.stairs!.push({ pts: f.pts, width: Q.width, quay: true });

// --- Leg 3 Hà Nội: only the three race districts stay (scripts/district-mask.ts); everything whose reference point is outside goes ---
const midVertex = (p: XZ): [number, number] => { const k = Math.floor(p.length / 4) * 2; return [p[k]!, p[k + 1]!]; };
const keepRing = (outer: XZ) => mask.contains(...ringCentroid(outer));
// A flight whose landing is itself in a river polygon (the Red River's OSM water polygons overlap each other along the Bãi Giữa
// sandbank) leads nowhere: no quay wall behind it, the swimmer cannot climb out there.
const landing = (f: { pts: XZ; gap: [number, number] }) => { const [fx, fz] = f.pts.slice(-2) as [number, number]; const [dx, dz] = [f.gap[0] - fx, f.gap[1] - fz]; const l = Math.hypot(dx, dz) || 1; return [f.gap[0] + (dx / l) * 2, f.gap[1] + (dz / l) * 2] as const; };
quayFlights.splice(0, quayFlights.length, ...quayFlights.filter((f) => mask.contains(...midVertex(f.pts)) && !riverAt(...landing(f))));
let masked = 0;
const keep = <T>(list: T[], inside: (t: T) => boolean) => list.filter((t) => inside(t) || (masked++, false));
for (const c of chunks.values()) {
  c.buildings = keep(c.buildings, (b) => keepRing(b.outer));
  c.roads = keep(c.roads, (r) => mask.contains(...midVertex(r.pts)));
  c.areas = keep(c.areas, (a) => keepRing(a.outer));
  c.points = keep(c.points, (q) => mask.contains(q.x, q.z));
  if (c.stairs) c.stairs = keep(c.stairs, (st) => mask.contains(...midVertex(st.pts)));
  if (c.junctions) c.junctions = keep(c.junctions, (j) => mask.contains(j.x, j.z));
}
// Water stays when any of it lies in the districts: the Red River's main channel (one OSM polygon whose centroid is on the
// Long Biên side) is the districts' east edge, without it the bank houses and the bridges stood in a void.
const touches = (outer: XZ) => { for (let k = 0; k < outer.length; k += 2) if (mask.contains(outer[k]!, outer[k + 1]!)) return true; return false; };
const keptWater = keep(water, (w) => keepRing(w.outer) || touches(w.outer));
water.splice(0, water.length, ...keptWater);
quays.splice(0, quays.length, ...keep(quays, (q) => mask.contains(q[0]!, q[1]!)));
parkOverview.splice(0, parkOverview.length, ...keep(parkOverview, keepRing));
bump('masked.outsideDistricts', masked);

// --- write ---
const chunkDir = join(args.out, 'chunks');
rmSync(chunkDir, { recursive: true, force: true });
mkdirSync(chunkDir, { recursive: true });
let total = 0;
let largest = { key: '', bytes: 0 };
for (const c of chunks.values()) {
  const json = JSON.stringify(c);
  const bytes = Buffer.byteLength(json);
  if (bytes > FAIL_BYTES) throw new Error(`[build-chunks] chunk ${c.key} is ${bytes} B > ${FAIL_BYTES} B`);
  if (bytes > WARN_BYTES) console.warn(`[build-chunks] chunk ${c.key} is ${(bytes / 1024).toFixed(0)} KB > 250 KB`);
  if (bytes > largest.bytes) largest = { key: c.key, bytes };
  bump('buildings', c.buildings.length);
  bump('buildings.landmark', c.buildings.filter((b) => b.landmark).length);
  if (c.buildings.some((b) => b.landmark)) bump('chunks.landmark');
  bump('roads.pieces', c.roads.length);
  bump('bridges.chains', c.bridges.length);
  for (const a of c.areas) bump(`areas.${a.kind}`);
  if (!c.buildings.length && !c.roads.length && !c.bridges.length && !c.areas.length && !c.points.length) bump('chunks.empty');
  total += bytes;
  writeFileSync(join(chunkDir, `${c.key}.json`), json);
}
for (const w of water) bump(w.river ? 'water.river' : 'water.other');
bump('districts', new Set(districts.map((d) => d.n)).size);
bump('parks.overview', parkOverview.length);
bump('parks.overviewVertices', parkOverview.reduce((s, r) => s + r.length / 2, 0));
const waterJson = JSON.stringify({
  v: 1, polygons: water, quays,
  stairs: quayFlights.flatMap((f) => f.pts.slice(-2)), stairGaps: quayFlights.flatMap((f) => f.gap), bridgeGaps,
  districts: districts.sort((a, b) => a.n - b.n), parks: parkOverview,
} satisfies WaterData);
const waterBytes = Buffer.byteLength(waterJson);
if (waterBytes > WATER_FAIL_BYTES) throw new Error(`[build-chunks] water.json is ${waterBytes} B > 1 MB`);
writeFileSync(join(args.out, 'water.json'), waterJson);
Object.assign(stats, { chunks: chunks.size, 'bytes.chunks': total, 'bytes.largestChunk': largest.bytes, 'bytes.water': waterBytes });
// --- skyline (SPEC §17.6): La Défense towers from .cache/osm/skyline.json (fetch-osm), extruded by the client ---
const skyFile = join(args.cache, 'skyline.json');
if (existsSync(skyFile)) {
  const sky = osmtogeojson(JSON.parse(readFileSync(skyFile, 'utf8')), { flatProperties: false }).features
    .map((f) => ({ geometry: f.geometry, p: f.properties as Props }))
    .sort((a, b) => TYPE_ORDER[a.p.type] - TYPE_ORDER[b.p.type] || a.p.id - b.p.id);
  const towers: SkylineData['towers'] = [];
  for (const { geometry: g, p } of sky) {
    const height = parseNumber(p.tags?.height);
    if (height === undefined || height < SKYLINE_MIN_HEIGHT || (g.type !== 'Polygon' && g.type !== 'MultiPolygon')) continue;
    const minHeight = parseNumber(p.tags?.min_height);
    for (const { outer } of polygons(g)) towers.push({ outer, height, ...(minHeight !== undefined && { minHeight }) });
  }
  writeFileSync(join(args.out, 'skyline.json'), JSON.stringify({ v: 1, towers } satisfies SkylineData));
  bump('skyline.towers', towers.length);
} else console.warn(`[build-chunks] ${skyFile} missing (npm run fetch-map fetches it): skyline.json not written`);

const index: ChunkIndex = {
  v: 2, chunkSize: CHUNK_SIZE, keys: [...chunks.keys()],
  stats: Object.fromEntries(Object.entries(stats).sort(([a], [b]) => a.localeCompare(b))),
};
writeFileSync(join(args.out, 'chunks', 'index.json'), JSON.stringify(index));

const s = (t: number) => `${((t - t0) / 1000).toFixed(1)} s`;
console.log(`[build-chunks] ${elements.size} OSM elements (load ${s(tLoad)}, osmtogeojson ${s(tConvert)}), done in ${s(performance.now())}`);
console.log(`[build-chunks] ${chunks.size} chunks, ${(total / 1e6).toFixed(2)} MB, largest ${largest.key} ${(largest.bytes / 1024).toFixed(0)} KB, water.json ${(waterBytes / 1024).toFixed(0)} KB`);
for (const [k, v] of Object.entries(index.stats)) console.log(`  ${k}: ${v}`);
