// Raw OSM cache (.cache/osm, see fetch-osm.ts) → client/public/data/chunks/<key>.json + index.json + water.json.
// docs/plans/phase2.md "A — Data pipeline" + "Chunk data decisions": parsed OSM facts only (no defaults), world metres
// rounded to 0.1 m, sorted by OSM id, compact JSON → deterministic output that is committed to git.
// Usage: npx tsx scripts/build-chunks.ts [--cache <dir with tiles/ + global.json>] [--out <client/public/data>]
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import type { MultiPolygon, Polygon, Position } from 'geojson';
import osmtogeojson from 'osmtogeojson';
import { RACE_BBOX, latLonToWorld } from '@race/shared';
import {
  type BuildingRec, CHUNK_SIZE, type ChunkData, type ChunkIndex, type ChunkKey, type LandmarkId, type WaterData, type XZ,
  chunkBounds, chunkKey, ringArea,
} from '../client/src/geo/chunkData.ts';
import {
  type Rect, clipRing, dedupe, mergeChains, midpoint, r1, resample, reversePts, ringCentroid, splitPolyline,
} from '../client/src/geo/clip.ts';
import { type Tags, bridgeFacts, buildingFacts, classify, roadFacts } from '../client/src/geo/osm.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const { values: args } = parseArgs({
  options: {
    cache: { type: 'string', default: join(ROOT, '.cache/osm') },
    out: { type: 'string', default: join(ROOT, 'client/public/data') },
  },
});

// Build-time policy (not runtime tunables: changing these needs a rebuild + commit of the data).
const LANDMARKS: Record<string, LandmarkId> = {
  'way/5013364': 'eiffel', 'way/226413508': 'arc', 'way/375076234': 'pyramid', 'way/72937686': 'obelisk',
};
const MIN_RING_AREA = 2; // m²
const TREE_ROW_STEP = 8; // m between expanded tree_row trees
const TREE_MIN_GAP = 4; // m: tree_row points closer than this to an existing tree are skipped
const QUAY_NEAR_RIVER = 50; // m: quay lines farther than this from the Seine are not written
const WARN_BYTES = 250 * 1024;
const FAIL_BYTES = 2 * 1024 * 1024;
const WATER_FAIL_BYTES = 1024 * 1024;

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
    chunks.set(key, { v: 1, key, buildings: [], roads: [], bridges: [], areas: [], points: [] });
  }
}
/** Chunk at a point, or undefined (counted as dropped.outside) when it lies outside the grid. */
const chunkAt = (x: number, z: number) => chunks.get(chunkKey(x, z)) ?? void bump('dropped.outside');

// --- load + dedupe; relations only when they are multipolygons we use (skips arrondissements, routes…) ---
type OsmElement = { type: 'node' | 'way' | 'relation'; id: number; tags?: Tags };
const elements = new Map<string, OsmElement>();
const files = ['global.json', ...readdirSync(join(args.cache, 'tiles')).filter((f) => f.endsWith('.json')).sort().map((f) => join('tiles', f))];
for (const file of files) {
  for (const e of (JSON.parse(readFileSync(join(args.cache, file), 'utf8')) as { elements: OsmElement[] }).elements) {
    const k = `${e.type}/${e.id}`;
    if (elements.has(k)) continue;
    if (e.type === 'relation' && (e.tags?.type !== 'multipolygon' || classify(e.tags, 'area') === undefined)) continue;
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
function ring(c: Position[], sign: 1 | -1): XZ | undefined {
  const r = dedupe(c.flatMap(project), true);
  const a = ringArea(r);
  if (r.length < 6 || Math.abs(a) < MIN_RING_AREA) return undefined;
  return a * sign > 0 ? r : reversePts(r);
}
type Poly = { outer: XZ; holes?: XZ[] };
const withHoles = (outer: XZ, holes: (XZ | undefined)[]): Poly => {
  const hs = holes.filter((h) => h !== undefined);
  return hs.length ? { outer, holes: hs } : { outer };
};
function polygons(g: Polygon | MultiPolygon): Poly[] {
  const out: Poly[] = [];
  for (const [o, ...hs] of g.type === 'Polygon' ? [g.coordinates] : g.coordinates) {
    const outer = ring(o!, 1);
    if (outer) out.push(withHoles(outer, hs.map((h) => ring(h, -1))));
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
const bridgeWays: BridgeWay[] = [];
const water: WaterData['polygons'] = [];
const quayLines: XZ[] = [];
const seenLandmarks = new Set<string>();

for (const { geometry: g, p } of features) {
  const tags = p.tags ?? {};
  const shape = g.type === 'Point' ? 'point' : g.type === 'LineString' ? 'line' : g.type === 'Polygon' || g.type === 'MultiPolygon' ? 'area' : undefined;
  if (!shape) continue; // MultiLineString / GeometryCollection: routes, not used
  const landmark = LANDMARKS[`${p.type}/${p.id}`];
  const cat = landmark ? 'building' : classify(tags, shape);
  if (cat === undefined) continue;
  if (typeof cat === 'object') {
    bump(`dropped.${cat.drop}`);
    continue;
  }
  if (g.type === 'Point') {
    const [x, z] = project(g.coordinates);
    if (cat === 'tree') addTree(x!, z!);
    else chunkAt(x!, z!)?.points.push({ kind: 'subway_entrance', x: x!, z: z! });
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
  for (const poly of polygons(g)) {
    if (cat === 'building') {
      const rec: BuildingRec = { ...poly, ...buildingFacts(tags), ...(landmark && { landmark }) };
      if (landmark) seenLandmarks.add(landmark);
      if (landmark === 'obelisk') rec.kind = 'obelisk'; // OSM: building=yes + man_made=obelisk
      if (rec.height === undefined && rec.levels === undefined) bump('missing.building.heightAndLevels');
      chunkAt(...ringCentroid(poly.outer))?.buildings.push(rec);
    } else if (cat === 'park' || cat === 'grass') {
      const xs = poly.outer.filter((_, k) => k % 2 === 0);
      const zs = poly.outer.filter((_, k) => k % 2 === 1);
      for (let i = Math.floor(Math.min(...xs) / CHUNK_SIZE); i * CHUNK_SIZE < Math.max(...xs); i++) {
        for (let j = Math.floor(Math.min(...zs) / CHUNK_SIZE); j * CHUNK_SIZE < Math.max(...zs); j++) {
          const c = chunks.get(`${i}_${j}`);
          const clipped = c && clipPoly(poly, chunkBounds(c.key));
          if (clipped) c.areas.push({ kind: cat, ...clipped });
        }
      }
    } else if (cat === 'water') {
      const clipped = clipPoly(poly, waterRect);
      const river = tags.water === 'river' || tags.waterway === 'riverbank' || /seine/i.test(tags.name ?? '');
      if (clipped) water.push({ river, ...clipped });
    }
  }
}
for (const id of Object.values(LANDMARKS)) if (!seenLandmarks.has(id)) console.warn(`[build-chunks] landmark ${id} not found in the OSM cache`);

// --- buildings whose centroid is on the Seine (boats, houseboats, floating restaurants) are dropped (TODO.md) ---
const inRing = (x: number, z: number, r: XZ) => {
  let inside = false;
  for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
    const [xi, zi, xj, zj] = [r[i]!, r[i + 1]!, r[j]!, r[j + 1]!];
    if (zi > z !== zj > z && x < xi + ((z - zi) / (zj - zi)) * (xj - xi)) inside = !inside;
  }
  return inside;
};
const onRiver = (x: number, z: number) =>
  water.some((w) => w.river && inRing(x, z, w.outer) && !(w.holes ?? []).some((h) => inRing(x, z, h)));
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

// --- bridges: ways merged into bank-to-bank chains, whole chain in the chunk of its midpoint ---
for (const { pts, members } of mergeChains(bridgeWays)) {
  bump('bridges.ways', members.length);
  chunkAt(...midpoint(pts))?.bridges.push({ pts, ...bridgeWays[members[0]!]!.facts });
}

// --- quays: keep lines near the Seine, inside the water rect ---
const segDist = (px: number, pz: number, r: XZ, i: number, j: number) => {
  const [ax, az, dx, dz] = [r[i]!, r[i + 1]!, r[j]! - r[i]!, r[j + 1]! - r[i + 1]!];
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(px - ax - t * dx, pz - az - t * dz);
};
const riverRings = water.filter((w) => w.river).flatMap((w) => [w.outer, ...(w.holes ?? [])]);
// ponytail: brute force point × river edge (~1 s), a segment grid if the map or the quay count grows.
const nearRiver = (x: number, z: number) =>
  riverRings.some((r) => r.some((_, i) => i % 2 === 0 && segDist(x, z, r, i, (i + 2) % r.length) <= QUAY_NEAR_RIVER));
const inWaterRect = (x: number, z: number) => x >= waterRect.minX && x <= waterRect.maxX && z >= waterRect.minZ && z <= waterRect.maxZ;
const quays = quayLines.filter((q) => q.some((_, i) => i % 2 === 0 && inWaterRect(q[i]!, q[i + 1]!) && nearRiver(q[i]!, q[i + 1]!)));
bump('water.quays', quays.length);
bump('dropped.quayFarFromRiver', quayLines.length - quays.length);

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
  bump('roads.pieces', c.roads.length);
  bump('bridges.chains', c.bridges.length);
  for (const a of c.areas) bump(`areas.${a.kind}`);
  if (!c.buildings.length && !c.roads.length && !c.bridges.length && !c.areas.length && !c.points.length) bump('chunks.empty');
  total += bytes;
  writeFileSync(join(chunkDir, `${c.key}.json`), json);
}
for (const w of water) bump(w.river ? 'water.river' : 'water.other');
const waterJson = JSON.stringify({ v: 1, polygons: water, quays } satisfies WaterData);
const waterBytes = Buffer.byteLength(waterJson);
if (waterBytes > WATER_FAIL_BYTES) throw new Error(`[build-chunks] water.json is ${waterBytes} B > 1 MB`);
writeFileSync(join(args.out, 'water.json'), waterJson);
Object.assign(stats, { chunks: chunks.size, 'bytes.chunks': total, 'bytes.largestChunk': largest.bytes, 'bytes.water': waterBytes });
const index: ChunkIndex = {
  v: 1, chunkSize: CHUNK_SIZE, keys: [...chunks.keys()],
  stats: Object.fromEntries(Object.entries(stats).sort(([a], [b]) => a.localeCompare(b))),
};
writeFileSync(join(args.out, 'chunks', 'index.json'), JSON.stringify(index));

const s = (t: number) => `${((t - t0) / 1000).toFixed(1)} s`;
console.log(`[build-chunks] ${elements.size} OSM elements (load ${s(tLoad)}, osmtogeojson ${s(tConvert)}), done in ${s(performance.now())}`);
console.log(`[build-chunks] ${chunks.size} chunks, ${(total / 1e6).toFixed(2)} MB, largest ${largest.key} ${(largest.bytes / 1024).toFixed(0)} KB, water.json ${(waterBytes / 1024).toFixed(0)} KB`);
for (const [k, v] of Object.entries(index.stats)) console.log(`  ${k}: ${v}`);
