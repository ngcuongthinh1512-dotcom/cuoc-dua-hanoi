// SPEC §4.3: raw OpenStreetMap data via Overpass, one 500 × 500 m tile at a time.
//   npm run fetch-map   (or: tsx scripts/fetch-osm.ts [--out <dir>])
// Writes <out>/tiles/<ix>_<iz>.json, <out>/global.json, <out>/skyline.json, <out>/index.json (default <repo>/.cache/osm, gitignored).
// Deviation from SPEC §4.3 (which says client/public/data/chunks): raw Overpass JSON is too big and
// unprocessed to ship as static assets; a later Phase 2 step turns it into compact 250 m chunks there.
// Re-runs skip files already on disk; delete a file to refetch it.
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { RACE_BBOX } from '@race/shared';
import { type Bbox, tileGrid } from './geo.ts';

const DELAY_MS = 2500; // between requests (≥ 2 s, Overpass etiquette)
const MAX_ATTEMPTS = 10; // Hanoi is dense: the main server rate-limits (429) often
const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter', // fallback mirror (VK Maps)
];
const USER_AGENT = 'cuoc-dua-hanoi/0.1 (game dev; one-time fetch)';

const root = join(import.meta.dirname, '..');
// --tile <m>: bigger tiles when Overpass is queueing (Hà Nội 2026-11: ~45 s per request whatever its size); build-chunks /
// build-graph read every tiles/*.json and drop duplicates, so tiles of several sizes can sit side by side.
const { values: args } = parseArgs({ options: { out: { type: 'string', default: join(root, '.cache/osm') }, tile: { type: 'string', default: '500' } } });
const TILE_SIZE = Number(args.tile); // m
const outDir = args.out;

const bb = (b: Bbox) => `(${b.south},${b.west},${b.north},${b.east})`;

// Per tile: nodes + ways only. Every relation, and every area kind that spans tiles (water, parks,
// grass, arrondissements), comes from the global query, so nothing big is duplicated per tile.
// railway ways + man_made=bridge areas are needed for bridges that carry rail (Bir-Hakeim's metro deck).
// `layer`, `height`, `lanes`… are kept as tags of whatever is fetched (`out geom` includes tags).
// Small declared timeout/maxsize (128 / 256 MiB) get admitted sooner when the server is busy
// (504 "Dispatcher_Client::request_read_and_idx::timeout").
const tileQuery = (b: Bbox) => {
  const B = bb(b);
  return `[out:json][timeout:180][maxsize:536870912];
(
  nw[building]${B}; nw["building:part"]${B};
  nw[highway]${B}; way[bridge]${B}; way[tunnel]${B}; nw[man_made=bridge]${B};
  way[railway]${B}; node[railway=subway_entrance]${B};
  nw[amenity~"^(fountain|bicycle_parking)$"]${B};
  node[natural=tree]${B}; way[natural=tree_row]${B};
  nw[tourism]${B}; nw[historic]${B}; nw[place]${B};
);
out geom;`;
};

// Retaining walls / embankments / quays are not in the SPEC list but mark the Seine quay walls, which
// the ~30 m DEM cannot resolve. rel[historic][type!=route] drops e.g. the ~70 km Roman road Paris–Dreux.
const globalQuery = (b: Bbox) => {
  const B = bb(b);
  // coastline ways with a node anywhere in the chunk grid (RACE_BBOX + up to 250 m) so the sea polygon has no gap at its edge
  const PAD = 0.005; // deg ≈ 550 m
  const C = bb({ south: b.south - PAD, west: b.west - PAD, north: b.north + PAD, east: b.east + PAD });
  return `[out:json][timeout:180][maxsize:268435456];
(
  wr[natural=water]${B}; way[waterway~"^(river|riverbank)$"]${B}; way[natural=coastline]${C};
  way[barrier=retaining_wall]${B}; way[man_made~"^(embankment|quay)$"]${B};
  wr[leisure~"^(park|garden)$"]${B}; wr[landuse=grass]${B};
  rel[boundary=historic][name~"^Quận "]${B};
  rel[building]${B}; rel["building:part"]${B}; rel[highway]${B};
  rel[man_made=bridge]${B}; rel[bridge]${B}; rel[tunnel]${B};
  rel[amenity~"^(fountain|bicycle_parking)$"]${B}; rel[natural=tree_row]${B};
  rel[tourism]${B}; rel[historic][type!=route]${B}; rel[place]${B};
);
out geom;`;
};

// Skyline (SPEC §17.6, phase2b-assets.md §5.7): towers ≥ 60 m around RACE_BBOX (Keangnam / Landmark 72, Lotte Center, Times City, Royal City); one small query.
const SKYLINE_BBOX: Bbox = { south: 20.95, west: 105.76, north: 21.08, east: 105.92 };
const skylineQuery = () => {
  const B = bb(SKYLINE_BBOX);
  const tall = '["height"~"^([6-9][0-9]|[1-9][0-9][0-9])([.,][0-9]+)?( ?m)?$"]';
  return `[out:json][timeout:60][maxsize:67108864];
(
  wr[building]${tall}${B}; wr["building:part"]${tall}${B};
);
out geom;`;
};

type OsmElement = { type: 'node' | 'way' | 'relation'; id: number; tags?: Record<string, string> };
type OsmFile = { fetchedAt: string; endpoint: string; osm3s?: unknown; elements: OsmElement[] };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const stats = { requests: 0, retries: 0, failures: 0, byEndpoint: {} as Record<string, number> };

// overpass-api.de gives each IP a few slots with a cool-down; wait for a free one instead of
// collecting 429s. Mirrors without slot info in /api/status go straight through.
async function waitForSlot(endpoint: string) {
  const res = await fetch(endpoint.replace(/interpreter$/, 'status'), {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(15_000),
  }).catch(() => null);
  const text = res?.ok ? await res.text().catch(() => '') : '';
  if (/[1-9]\d* slots? available now/.test(text)) return;
  const secs = [...text.matchAll(/in (\d+) seconds/g)].map((m) => Number(m[1]));
  if (secs.length) await sleep((Math.min(...secs) + 1) * 1000);
}

async function overpass(query: string, label: string) {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const endpoint = ENDPOINTS[attempt % ENDPOINTS.length]!;
    let wait = Math.min(15_000 * 2 ** attempt, 300_000);
    let reason: string;
    try {
      await waitForSlot(endpoint);
      stats.requests++;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'User-Agent': USER_AGENT, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ data: query }),
        signal: AbortSignal.timeout(240_000),
      });
      const text = await res.text();
      if (res.ok && text.startsWith('{')) {
        const json = JSON.parse(text) as { remark?: string; osm3s?: unknown; elements: OsmElement[] };
        // Overpass reports timeouts / out-of-memory as HTTP 200 with a `remark` and partial data.
        if (!json.remark?.includes('error')) {
          stats.byEndpoint[endpoint] = (stats.byEndpoint[endpoint] ?? 0) + 1;
          return { ...json, endpoint };
        }
        reason = json.remark;
      } else {
        const plain = text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
        reason = `HTTP ${res.status} ${plain.slice(Math.max(0, plain.search(/error/i))).slice(0, 200)}`;
        const retryAfter = Number(res.headers.get('retry-after'));
        if (res.status === 429 && retryAfter > 0) wait = Math.max(wait, retryAfter * 1000);
      }
    } catch (e) {
      reason = String(e);
    }
    stats.retries++;
    console.warn(`  ! ${label} attempt ${attempt + 1} @ ${new URL(endpoint).host}: ${reason.slice(0, 300)} → wait ${wait / 1000} s`);
    await sleep(wait);
  }
  stats.failures++;
  throw new Error(`${label}: gave up after ${MAX_ATTEMPTS} attempts`);
}

async function fetchTo(file: string, query: string, label: string) {
  if (existsSync(file)) return false;
  const t0 = Date.now();
  const { endpoint, elements, osm3s } = await overpass(query, label);
  const data: OsmFile = { fetchedAt: new Date().toISOString(), endpoint, osm3s, elements };
  await writeFile(`${file}.tmp`, JSON.stringify(data)); // compact + atomic: a crash never leaves a half file
  await rename(`${file}.tmp`, file);
  const mb = (await stat(file)).size / 1e6;
  console.log(`  ${label}: ${elements.length} elements, ${mb.toFixed(1)} MB, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  return true;
}

function kindOf(t: Record<string, string> = {}) {
  if (t.building) return 'building';
  if (t['building:part']) return 'building:part';
  if (t.highway) return 'highway';
  if (t.railway) return 'railway';
  if (t.man_made === 'bridge') return 'bridge';
  if (t.natural === 'water' || t.waterway) return 'water';
  if (t.barrier === 'retaining_wall' || t.man_made === 'embankment' || t.man_made === 'quay') return 'quay_wall';
  if (t.natural === 'tree' || t.natural === 'tree_row') return 'tree';
  if (t.leisure || t.landuse) return 'park';
  if (t.amenity === 'fountain' || t.amenity === 'bicycle_parking') return t.amenity;
  if (t.boundary === 'administrative') return 'arrondissement';
  return ['tourism', 'historic', 'place', 'bridge', 'tunnel'].find((k) => t[k]) ?? 'other';
}

const seen = new Set<string>(); // ways crossing tile edges come back in each tile; totals count them once
const uniqueByKind: Record<string, number> = {};

async function summarize(file: string) {
  const data = JSON.parse(await readFile(file, 'utf8')) as OsmFile;
  const byType: Record<string, number> = {};
  const byKind: Record<string, number> = {};
  for (const e of data.elements) {
    byType[e.type] = (byType[e.type] ?? 0) + 1;
    const k = kindOf(e.tags);
    byKind[k] = (byKind[k] ?? 0) + 1;
    const key = e.type[0]! + e.id;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueByKind[k] = (uniqueByKind[k] ?? 0) + 1;
    }
  }
  return { bytes: (await stat(file)).size, fetchedAt: data.fetchedAt, total: data.elements.length, byType, byKind };
}

const t0 = Date.now();
const tiles = tileGrid(RACE_BBOX, TILE_SIZE);
await mkdir(join(outDir, 'tiles'), { recursive: true });
console.log(`fetch-osm → ${outDir}: 1 global query + 1 skyline query + ${tiles.length} tiles of ${TILE_SIZE} m`);

const pending: string[] = [];
const jobs = [
  { file: join(outDir, 'global.json'), query: globalQuery(RACE_BBOX), label: 'global' },
  { file: join(outDir, 'skyline.json'), query: skylineQuery(), label: 'skyline' },
  ...tiles.map((t) => ({ file: join(outDir, 'tiles', TILE_SIZE === 500 ? `${t.ix}_${t.iz}.json` : `${TILE_SIZE}m_${t.ix}_${t.iz}.json`), query: tileQuery(t.latLon), label: `tile ${t.ix}_${t.iz}` })),
];
for (const [n, job] of jobs.entries()) {
  console.log(`[${n + 1}/${jobs.length}] ${job.label}`);
  try {
    if (await fetchTo(job.file, job.query, job.label)) await sleep(DELAY_MS);
    else console.log('  (on disk, skipped)');
  } catch (e) {
    console.error(`  ✗ ${String(e)}`);
    pending.push(job.label);
    await sleep(DELAY_MS);
  }
}

// Index is rebuilt from what is on disk, so resumed runs are complete too.
const index = {
  generatedAt: new Date().toISOString(),
  source: 'OpenStreetMap via Overpass API',
  attribution: '© OpenStreetMap contributors (ODbL)',
  bbox: RACE_BBOX,
  tileSize: TILE_SIZE,
  global: existsSync(jobs[0]!.file) ? { file: 'global.json', ...(await summarize(jobs[0]!.file)) } : null,
  tiles: [] as object[],
  missing: pending,
};
let bytes = index.global?.bytes ?? 0;
for (const t of tiles) {
  const file = join('tiles', `${t.ix}_${t.iz}.json`);
  if (!existsSync(join(outDir, file))) continue;
  const s = await summarize(join(outDir, file));
  index.tiles.push({ ix: t.ix, iz: t.iz, file, world: t.world, latLon: t.latLon, ...s });
  bytes += s.bytes;
}
const totals = { bytes, uniqueElements: seen.size, uniqueByKind };
await writeFile(join(outDir, 'index.json'), JSON.stringify({ ...index, totals }, null, 1));

console.log(`\ndone in ${((Date.now() - t0) / 1000).toFixed(0)} s: ${index.tiles.length}/${tiles.length} tiles, global ${index.global ? 'ok' : 'MISSING'}, ${(bytes / 1e6).toFixed(1)} MB`);
console.log(`requests ${stats.requests}, retries ${stats.retries}, failures ${stats.failures}`, stats.byEndpoint);
console.log(`unique elements ${seen.size}:`, uniqueByKind);
if (pending.length) {
  console.error(`missing: ${pending.join(', ')} — run again to resume`);
  process.exitCode = 1;
}
