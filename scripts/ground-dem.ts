// Leg 2 (Macao): the AWS Terrain Tiles are a SURFACE model (roofs included): in the dense peninsula the 30 m pixels turn
// every block height into 10–25° streets. Subtracting the OSM building height does NOT help (the roughness only grows,
// --probe), so the DEM is blurred where buildings are: node = lerp(DEM, blur(DEM, RADIUS), min(1, buildingMean / FULL_AT)).
//   npx tsx scripts/ground-dem.ts           (re-reads the raw DEM: run fetch-dem first, it is cached; then build-chunks → this)
//   npx tsx scripts/ground-dem.ts --probe   (slope statistics per blur radius, writes nothing)
// ponytail: plain box blur, hills inside the city are softened a little too, upgrade = a real DTM (FABDEM, licence).
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import type { BuildingRec, ChunkData } from '../client/src/geo/chunkData.ts';
import { buildingHeight } from '../client/src/world/BuildingBuilder.ts';
import { fillRings } from '../client/src/world/Terrain.ts';

const { values: args } = parseArgs({ options: { probe: { type: 'boolean', default: false }, radius: { type: 'string', default: '45' } } });
const root = join(import.meta.dirname, '..');
const data = join(root, 'client/public/data');
const WINDOW = 15; // m: half-width of the box the building heights are averaged in (≈ one 30 m DEM pixel)
const FULL_AT = 3; // m: mean building height (within the box above) from which the blur applies in full
const FLOOR_DM = 15; // 1.5 m: ground is never put below this on land (sea nodes are carved flat by the client anyway)

const head = JSON.parse(readFileSync(join(data, 'elevation.json'), 'utf8')) as { source?: string; minX: number; minZ: number; width: number; height: number; cellSize: number };
const { minX, minZ, width: W, height: H, cellSize: C } = head;
if (!args.probe && String(head.source).includes('ground-dem')) throw new Error('elevation.bin is already smoothed: run fetch-dem first (cached PNGs, a few seconds)');
const raw = readFileSync(join(data, 'elevation.bin'));
const dem = new Int16Array(raw.buffer, raw.byteOffset, W * H); // decimetres, absolute

// footprints → per-node building height (0 = none; the tallest wins where footprints overlap)
const bh = new Float32Array(W * H);
for (const f of readdirSync(join(data, 'chunks'))) {
  if (f === 'index.json') continue;
  const c = JSON.parse(readFileSync(join(data, 'chunks', f), 'utf8')) as ChunkData;
  for (const b of c.buildings as BuildingRec[]) {
    if (b.kind === 'roof') continue; // canopies / glass roofs are thin, not a mass the radar sees
    const xs = b.outer.filter((_, i) => i % 2 === 0), zs = b.outer.filter((_, i) => i % 2 === 1);
    const i0 = Math.max(Math.floor((Math.min(...xs) - minX) / C), 0), j0 = Math.max(Math.floor((Math.min(...zs) - minZ) / C), 0);
    const i1 = Math.min(Math.ceil((Math.max(...xs) - minX) / C), W - 1), j1 = Math.min(Math.ceil((Math.max(...zs) - minZ) / C), H - 1);
    if (i1 < i0 || j1 < j0) continue;
    const h = buildingHeight(b);
    fillRings([b.outer, ...(b.holes ?? [])], minX + i0 * C, minZ + j0 * C, C, i1 - i0 + 1, j1 - j0 + 1, (ci, rj) => {
      const k = (j0 + rj) * W + i0 + ci;
      if (h > bh[k]!) bh[k] = h;
    });
  }
}

// Leg 2 fix (docs/reports/leg2-fixes.md item 5): streets get the full blur too. Radar spikes away from any OSM footprint
// (flyover piers, trees, unmapped blocks: a 10 m ridge across Av. Comercial de Macau by the Bank of China) stood on the
// roads as walls; road nodes within ROAD_HALF m of a way's centre line now count as built-up.
const ROAD_HALF = 8;
const road = new Uint8Array(W * H);
for (const f of readdirSync(join(data, 'chunks'))) {
  if (f === 'index.json') continue;
  const c = JSON.parse(readFileSync(join(data, 'chunks', f), 'utf8')) as ChunkData;
  for (const r of c.roads) {
    for (let k = 0; k + 3 < r.pts.length; k += 2) {
      const [ax, az, bx, bz] = [r.pts[k]!, r.pts[k + 1]!, r.pts[k + 2]!, r.pts[k + 3]!];
      const l2 = (bx - ax) ** 2 + (bz - az) ** 2 || 1;
      const i0 = Math.max(Math.floor((Math.min(ax, bx) - ROAD_HALF - minX) / C), 0), i1 = Math.min(Math.ceil((Math.max(ax, bx) + ROAD_HALF - minX) / C), W - 1);
      const j0 = Math.max(Math.floor((Math.min(az, bz) - ROAD_HALF - minZ) / C), 0), j1 = Math.min(Math.ceil((Math.max(az, bz) + ROAD_HALF - minZ) / C), H - 1);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const [x, z] = [minX + i * C, minZ + j * C];
        const t = Math.min(1, Math.max(0, ((x - ax) * (bx - ax) + (z - az) * (bz - az)) / l2));
        if (Math.hypot(x - ax - t * (bx - ax), z - az - t * (bz - az)) <= ROAD_HALF) road[j * W + i] = 1;
      }
    }
  }
}

// mean over a (2·WINDOW + 1 m) box = coverage × height (separable running sums)
const r = Math.round(WINDOW / C);
const mean = new Float32Array(W * H);
const tmp = new Float32Array(W * H);
for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
  let s = 0, n = 0;
  for (let a = Math.max(i - r, 0); a <= Math.min(i + r, W - 1); a++) (s += bh[j * W + a]!), n++;
  tmp[j * W + i] = s / n;
}
for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
  let s = 0, n = 0;
  for (let b = Math.max(j - r, 0); b <= Math.min(j + r, H - 1); b++) (s += tmp[b * W + i]!), n++;
  mean[j * W + i] = s / n;
}

const blur = (src: Float32Array, rad: number) => {
  const t = new Float32Array(W * H), o = new Float32Array(W * H);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    let s = 0, n = 0;
    for (let a = Math.max(i - rad, 0); a <= Math.min(i + rad, W - 1); a++) (s += src[j * W + a]!), n++;
    t[j * W + i] = s / n;
  }
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    let s = 0, n = 0;
    for (let b = Math.max(j - rad, 0); b <= Math.min(j + rad, H - 1); b++) (s += t[b * W + i]!), n++;
    o[j * W + i] = s / n;
  }
  return o;
};
const demF = Float32Array.from(dem);
const smooth = (radiusM: number) => {
  const rad = Math.round(radiusM / C);
  const bl = blur(blur(demF, rad), rad); // two box passes ≈ Gaussian σ = radius / 1.4
  return Int16Array.from(dem, (v, i) => {
    if (v <= FLOOR_DM) return v; // sea
    const t = road[i] ? 1 : Math.min(1, mean[i]! / FULL_AT);
    return Math.max(Math.round(v + t * (bl[i]! - v)), FLOOR_DM);
  });
};
const at = (x: number, z: number) => Math.round((z - minZ) / C) * W + Math.round((x - minX) / C);

if (args.probe) {
  const stat = (d: Int16Array) => {
    const sl: number[] = [];
    for (let j = 1; j < H - 1; j += 2) for (let i = 1; i < W - 1; i += 2) {
      const p = j * W + i;
      if (mean[p]! < FULL_AT || d[p]! <= FLOOR_DM) continue;
      sl.push((Math.atan(Math.hypot(d[p + 1]! - d[p - 1]!, d[p + W]! - d[p - W]!) / 20 / C) * 180) / Math.PI);
    }
    sl.sort((a, b) => a - b);
    return `slope° median ${sl[sl.length >> 1]!.toFixed(1)}, p90 ${sl[Math.floor(sl.length * 0.9)]!.toFixed(1)}, p99 ${sl[Math.floor(sl.length * 0.99)]!.toFixed(1)}`;
  };
  console.log(`raw      : ${stat(dem)}`);
  for (const r of [15, 30, 45, 60, 90]) console.log(`blur ${String(r).padStart(2)} m: ${stat(smooth(r))}`);
} else {
  const r = Number(args.radius);
  writeFileSync(join(data, 'elevation.bin'), new Uint8Array(smooth(r).buffer));
  const out = JSON.parse(readFileSync(join(data, 'elevation.json'), 'utf8'));
  out.source = `${out.source}; ground-dem: blurred ${r} m where buildings stand`;
  writeFileSync(join(data, 'elevation.json'), `${JSON.stringify(out, null, 2)}\n`);
  console.log(`ground-dem: radius ${r} m, origin ${dem[at(0, 0)]! / 10} → ${smooth(r)[at(0, 0)]! / 10} m`);
}
