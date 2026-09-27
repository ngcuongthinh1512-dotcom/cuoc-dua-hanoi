// Visual check (SPEC §16): npm run screenshot [preset] → screenshots/<preset>.png
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

// Phase 1 adds camera presets here as query strings (e.g. top-down, player).
const PRESETS: Record<string, string> = { home: '/' };
const PORT = 5174; // not Vite's default 5173, so it can run next to `npm run dev`
const READY_TIMEOUT_MS = 15_000;

const only = process.argv[2];
if (only && !(only in PRESETS)) {
  console.error(`Không có preset "${only}". Các preset: ${Object.keys(PRESETS).join(', ')}`);
  process.exit(2);
}

const root = join(import.meta.dirname, '..');
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
    for (const [name, path] of Object.entries(PRESETS)) {
      if (only && name !== only) continue;
      await page.goto(`http://localhost:${PORT}${path}`);
      await page
        .waitForFunction(() => (globalThis as { __READY__?: boolean }).__READY__ === true, null, { timeout: READY_TIMEOUT_MS })
        .catch(() => void errors.push(`[${name}] không thấy window.__READY__ sau ${READY_TIMEOUT_MS} ms (vẫn chụp để xem lỗi)`));
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
