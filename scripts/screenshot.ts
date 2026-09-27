// Visual check (SPEC §16): npm run screenshot [preset] → screenshots/<preset>.png
// Any page: npm run screenshot -- --path "/preview.html?fixture=1" --name fixture → screenshots/fixture.png
import { existsSync, readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { latLonToWorld } from '@race/shared';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { flyCamera } from '../client/src/config.ts';
import { flatHeightGrid, heightAt, parseHeightGrid } from '../client/src/geo/heightGrid.ts';

const root = join(import.meta.dirname, '..');

// Uncarved DEM (y relative to the obelisk), so eye heights are above the ground.
const dem = join(root, 'client/public/data/elevation');
const grid = existsSync(`${dem}.bin`)
  ? parseHeightGrid(JSON.parse(readFileSync(`${dem}.json`, 'utf8')), readFileSync(`${dem}.bin`))
  : flatHeightGrid();
/** Game URL with ?cam= at (lat, lon), `up` m above the terrain; yaw 0 = north, 90 = west, −90 = east. */
const cam = (lat: number, lon: number, up: number, yawDeg: number, pitchDeg: number) => {
  const p = latLonToWorld(lat, lon);
  return `/?cam=${[p.x, heightAt(grid, p.x, p.z) + up, p.z, yawDeg, pitchDeg].map((v) => +v.toFixed(2)).join(',')}`;
};
const yawTo = (lat: number, lon: number, lat2: number, lon2: number) => {
  const a = latLonToWorld(lat, lon);
  const b = latLonToWorld(lat2, lon2);
  return (Math.atan2(a.x - b.x, a.z - b.z) * 180) / Math.PI;
};

// Camera presets as client URL overrides: ?cam=x,y,z,yawDeg,pitchDeg and ?debug=1.
const { x, z, yawDeg } = flyCamera.spawn;
const eye = 35 / Math.hypot(x, z); // 35 m behind the obelisk on the spawn line, facing the Arc de Triomphe
const PRESETS: Record<string, string> = {
  topdown: '/?cam=0,3800,0,0,-90', // north up; 3.8 km fits the whole bbox at 16:9 (south edge is 2.3 km away)
  player: `/?cam=${(x * eye).toFixed(2)},1.7,${(z * eye).toFixed(2)},${yawDeg.toFixed(2)},8`,
  debug: '/?debug=1', // default spawn view
  // Phase 2 (docs/plans/phase2.md step 0)
  etoile: cam(48.8738, 2.295, 600, 0, -90),
  champs: cam(48.8697, 2.308, 1100, 0, -90),
  eiffel: cam(48.853, 2.301, 250, 45, -25), // NW toward Trocadéro, the tower in front
  street: cam(48.87, 2.306, 1.7, yawTo(48.87, 2.306, 48.8738, 2.295), 1), // Champs-Élysées, facing the Arc
  seine: cam(48.86365, 2.31354, 12, -90, -5), // Pont Alexandre III, facing east (river DEM + 12 m ≈ above the deck)
  edge: cam(48.86, 2.2855, 20, 90, -10), // ~37 m inside the west bbox edge, facing out
};
const TIMEOUT_MS: Record<string, number> = { topdown: 90_000 };
const DEFAULT_TIMEOUT_MS = 30_000;
const PORT = Number(process.env.SCREENSHOT_PORT ?? 5174); // not Vite's default 5173, so it can run next to `npm run dev`

const { values: opt, positionals } = parseArgs({ allowPositionals: true, options: { path: { type: 'string' }, name: { type: 'string' } } });
const only = positionals[0];
if (!opt.path && only && !(only in PRESETS)) {
  console.error(`Không có preset "${only}". Các preset: ${Object.keys(PRESETS).join(', ')}`);
  process.exit(2);
}
const custom = opt.name ?? 'custom';
if (opt.path) TIMEOUT_MS[custom] = 90_000; // preview pages may build many chunks in SwiftShader
const jobs: Record<string, string> = opt.path
  ? { [custom]: opt.path.startsWith('/') ? opt.path : `/${opt.path}` }
  : only
    ? { [only]: PRESETS[only]! }
    : PRESETS;

const outDir = join(root, 'screenshots');
const errors: string[] = [];

// Vite runs in-process so it always dies with this script (no orphaned dev server).
const server = await createServer({
  root: join(root, 'client'),
  logLevel: 'warn',
  server: { port: PORT, strictPort: true },
});
try {
  await server.listen();
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'], // software WebGL in headless
  });
  try {
    const page = await browser.newPage();
    page.on('console', (m) => void (m.type() === 'error' && errors.push(`console: ${m.text()}`)));
    page.on('pageerror', (e) => void errors.push(`pageerror: ${e.message}`));
    await mkdir(outDir, { recursive: true });
    for (const [name, path] of Object.entries(jobs)) {
      await page.goto(`http://localhost:${PORT}${path}`);
      const timeout = TIMEOUT_MS[name] ?? DEFAULT_TIMEOUT_MS;
      await page
        .waitForFunction(() => (globalThis as { __READY__?: boolean }).__READY__ === true, null, { timeout })
        .catch(() => void errors.push(`[${name}] không thấy window.__READY__ sau ${timeout} ms (vẫn chụp để xem lỗi)`));
      const stats = await page.evaluate(() => (globalThis as { __STATS__?: unknown }).__STATS__);
      if (stats !== undefined) console.log(`[${name}] __STATS__ ${JSON.stringify(stats)}`);
      const file = join(outDir, `${name}.png`);
      await page.screenshot({ path: file });
      console.log(`Đã chụp ${file}`);
    }
  } finally {
    await browser.close();
  }
} finally {
  await server.close();
}

if (errors.length) {
  console.error(`Có ${errors.length} lỗi trong trang:\n${errors.join('\n')}`);
  process.exit(1);
}
