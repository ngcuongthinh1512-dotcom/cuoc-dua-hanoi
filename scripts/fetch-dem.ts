// SPEC §4.3 "Độ cao": AWS Terrain Tiles (terrarium PNG) → world-aligned height grid.
//   npm run fetch-map   (or: tsx scripts/fetch-dem.ts [--cache <dir>] [--out <dir>] [--flat])
// --flat (Leg 3 Hà Nội): every node 0 m, no download. The AWS tiles are a SURFACE model (roofs included), so in a dense
// city the streets come out as 10–25° bumps; central Hanoi is really flat (±2 m), only rivers / lakes are carved (Terrain.ts).
// Writes <out>/elevation.bin + elevation.json (default client/public/data); PNGs cached in <cache> (default .cache/dem).
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { decode } from 'fast-png';
import { RACE_BBOX, worldToLatLon } from '@race/shared';
import { bilinear, gridSpec, lonLatToPixel, terrarium, worldRect } from './geo.ts';

// z14 ≈ 6.3 m/px at Paris: already finer than the source there (EU-DEM / SRTM, ~30 m), so z15 would
// fetch 4× the tiles for no extra detail. Output nodes every 5 m keep the file ≈ 1.6 MB.
const ZOOM = 14;
const CELL = 5; // m
const SEA_FLOOR_DM = -150; // decimetres: −15 m
const TILE_URL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium';
const USER_AGENT = 'cuoc-dua-hanoi/0.1 (game dev; one-time fetch)';

const root = join(import.meta.dirname, '..');
const { values: args } = parseArgs({
  options: {
    cache: { type: 'string', default: join(root, '.cache/dem') },
    out: { type: 'string', default: join(root, 'client/public/data') },
    flat: { type: 'boolean', default: false },
  },
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function tilePng(x: number, y: number) {
  const file = join(args.cache, `${ZOOM}-${x}-${y}.png`);
  if (existsSync(file)) return readFile(file);
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${TILE_URL}/${ZOOM}/${x}/${y}.png`, { headers: { 'User-Agent': USER_AGENT } });
    if (res.ok) {
      const buf = Buffer.from(await res.arrayBuffer());
      await writeFile(file, buf);
      await sleep(200);
      return buf;
    }
    if (attempt >= 4 || (res.status < 500 && res.status !== 429)) throw new Error(`tile ${x}/${y}: HTTP ${res.status}`);
    console.warn(`  ! tile ${x}/${y}: HTTP ${res.status}, retry ${attempt + 1}`);
    await sleep(2000 * 2 ** attempt);
  }
}

const grid = gridSpec(worldRect(RACE_BBOX), CELL);
const nodeLatLon = (i: number, j: number) => worldToLatLon(grid.minX + i * CELL, grid.minZ + j * CELL);

// Pixel extent of the grid's corner nodes, +1 px for the bilinear neighbours.
const corner = [0, grid.width - 1].flatMap((i) =>
  [0, grid.height - 1].map((j) => {
    const p = nodeLatLon(i, j);
    return lonLatToPixel(p.lon, p.lat, ZOOM);
  }),
);
const tx0 = Math.floor((Math.min(...corner.map((p) => p.px)) - 1) / 256);
const tx1 = Math.floor((Math.max(...corner.map((p) => p.px)) + 1) / 256);
const ty0 = Math.floor((Math.min(...corner.map((p) => p.py)) - 1) / 256);
const ty1 = Math.floor((Math.max(...corner.map((p) => p.py)) + 1) / 256);

if (args.flat) {
  const header = { ...grid, cellSize: CELL, layout: 'row-major, width × height nodes; value k = j·width + i is the height at world (x = minX + i·cellSize, z = minZ + j·cellSize); i → east, j → south', encoding: 'int16 little-endian, decimetres', min: 0, max: 0, source: 'flat (fetch-dem --flat): mặt đất phẳng 0 m, không dùng DEM' };
  await mkdir(args.out, { recursive: true });
  await writeFile(join(args.out, 'elevation.bin'), new Uint8Array(grid.width * grid.height * 2));
  await writeFile(join(args.out, 'elevation.json'), `${JSON.stringify(header, null, 2)}\n`);
  console.log(`elevation.bin flat, ${grid.width} × ${grid.height} nodes @ ${CELL} m`);
  process.exit(0);
}

await mkdir(args.cache, { recursive: true });
console.log(`fetch-dem: z${ZOOM} tiles x ${tx0}..${tx1}, y ${ty0}..${ty1} → ${grid.width} × ${grid.height} nodes @ ${CELL} m`);
const tiles = new Map<string, { data: ArrayLike<number>; channels: number }>();
for (let ty = ty0; ty <= ty1; ty++) {
  for (let tx = tx0; tx <= tx1; tx++) {
    const png = decode(await tilePng(tx, ty));
    if (png.width !== 256 || png.depth !== 8) throw new Error(`tile ${tx}/${ty}: unexpected ${png.width}px ${png.depth}-bit PNG`);
    tiles.set(`${tx}/${ty}`, png);
  }
}

// Global pixel (i, j) → metres.
const pixelHeight = (i: number, j: number) => {
  const t = tiles.get(`${i >> 8}/${j >> 8}`)!;
  const k = ((j & 255) * 256 + (i & 255)) * t.channels;
  return terrarium(t.data[k]!, t.data[k + 1]!, t.data[k + 2]!);
};

const bin = new DataView(new ArrayBuffer(grid.width * grid.height * 2));
let min = Infinity;
let max = -Infinity;
for (let j = 0; j < grid.height; j++) {
  for (let i = 0; i < grid.width; i++) {
    const p = nodeLatLon(i, j);
    const { px, py } = lonLatToPixel(p.lon, p.lat, ZOOM);
    const dm = Math.max(Math.round(bilinear(pixelHeight, px, py) * 10), SEA_FLOOR_DM); // Macao: the Terrain Tiles hold bathymetry (down to −1.4 km at the Inner Harbour); the sea is carved flat anyway
    bin.setInt16((j * grid.width + i) * 2, dm, true);
    min = Math.min(min, dm);
    max = Math.max(max, dm);
  }
}

const header = {
  ...grid,
  cellSize: CELL,
  layout:
    'row-major, width × height nodes; value k = j·width + i is the height at world (x = minX + i·cellSize, z = minZ + j·cellSize); i → east, j → south',
  encoding: 'int16 little-endian, decimetres',
  min: min / 10,
  max: max / 10,
  source: `AWS Terrain Tiles (terrarium), zoom ${ZOOM}, bilinear`,
  attribution:
    'Terrain Tiles (Mapzen / AWS Open Data, github.com/tilezen/joerd/blob/master/docs/attribution.md): EU-DEM – produced using Copernicus data and information funded by the European Union; SRTM – NASA / USGS',
};
await mkdir(args.out, { recursive: true });
await writeFile(join(args.out, 'elevation.bin'), new Uint8Array(bin.buffer));
await writeFile(join(args.out, 'elevation.json'), `${JSON.stringify(header, null, 2)}\n`);
console.log(`elevation.bin ${(bin.byteLength / 1e6).toFixed(2)} MB, ${tiles.size} tiles, ${header.min}…${header.max} m`);
