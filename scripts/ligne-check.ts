// Leg 3 comic gallery game (client/public/games/ligne-claire.html): `npx tsx scripts/ligne-check.ts` drives the dev room
// (client/gallery.html, Vite only) in headless Chrome: a stroke drawn in the game survives "Thoát" + reopening, a page reload,
// is cleared once the drawing passes (__LIGNE__.perfect) and wiped by a `room-init {done: 0}` (the server reset the progress).
// Exits 1 on a failed check or a console error. LIGNE_CHECK_PORT picks the Vite port.
import { join } from 'node:path';
import { chromium, type Frame } from 'playwright-core';
import { createServer } from 'vite';

const PORT = Number(process.env.LIGNE_CHECK_PORT ?? 5198);
const server = await createServer({ root: join(import.meta.dirname, '../client'), logLevel: 'warn', server: { port: PORT, strictPort: true } });
await server.listen();
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors: string[] = [];
page.on('console', (m) => void (m.type() === 'error' && errors.push(m.text())));
page.on('pageerror', (e) => void errors.push(e.message));
let fails = 0;
const ok = (c: boolean, msg: string) => (c ? console.log(`  ok   ${msg}`) : (fails++, console.log(`  FAIL ${msg}`)));
const URL = `http://localhost:${PORT}/gallery.html?team=9&open=1&post=0`;
const game = async (): Promise<Frame> => {
  await page.waitForFunction(() => (globalThis as { __READY__?: boolean }).__READY__ === true, null, { timeout: 90_000 });
  const f = page.frames().find((x) => x.url().includes('ligne-claire.html'))!;
  await f.waitForFunction(() => !!(globalThis as { __LIGNE__?: unknown }).__LIGNE__);
  return f;
};
type Hook = { strokes(): number[][][]; score(): number; saved(): string | null; perfect(): void; lv(): number };
const read = (f: Frame) => f.evaluate(() => { const h = (globalThis as unknown as { __LIGNE__: Hook }).__LIGNE__; return { n: h.strokes().length, pts: h.strokes().flat().length, score: h.score(), saved: h.saved(), lv: h.lv() }; });
try {
  await page.goto(URL);
  await page.evaluate(() => localStorage.clear());
  await page.goto(URL);
  let f = await game();
  const box = (await f.locator('#c').boundingBox())!;
  const [cx, cy] = [box.x + box.width / 2, box.y + box.height / 2];
  await page.mouse.move(cx - 80, cy - 40);
  await page.mouse.down();
  for (let i = 1; i <= 20; i++) await page.mouse.move(cx - 80 + i * 8, cy - 40 + Math.sin(i / 3) * 30);
  await page.mouse.up();
  await page.waitForTimeout(400); // the debounced save
  const a = await read(f);
  ok(a.n === 1 && a.pts > 5, `một nét ${a.pts} điểm được vẽ (điểm ${a.score.toFixed(4)})`);
  ok(!!a.saved, 'nét đã lưu vào localStorage (300 ms sau khi nhấc bút)');
  // Thoát (the parent closes the overlay: the iframe unloads) → F again (window.__GALLERY__.press)
  await page.click('#ovExit');
  await page.evaluate(() => (globalThis as unknown as { __GALLERY__: { press(s: number): void } }).__GALLERY__.press(9));
  await page.waitForTimeout(300);
  f = page.frames().find((x) => x.url().includes('ligne-claire.html'))!;
  await f.waitForFunction(() => !!(globalThis as { __LIGNE__?: unknown }).__LIGNE__);
  const b = await read(f);
  ok(b.n === 1 && b.pts === a.pts, `Thoát rồi mở lại: nét vẫn còn (${b.pts} điểm)`);
  ok(Math.abs(b.score - a.score) < 1e-3, `điểm không đổi (${b.score.toFixed(4)})`);
  // reload
  await page.goto(URL);
  f = await game();
  const c = await read(f);
  ok(c.n === 1 && c.pts === a.pts && Math.abs(c.score - a.score) < 1e-3, 'tải lại trang: nét và điểm vẫn còn');
  // the drawing passes → its strokes are gone, the next drawing starts clean
  await f.evaluate(() => (globalThis as unknown as { __LIGNE__: Hook }).__LIGNE__.perfect());
  const d = await read(f);
  ok(d.saved === null, 'bức đạt: nét đã lưu bị xóa');
  await page.goto(URL);
  f = await game();
  const e = await read(f);
  ok(e.lv === 1 && e.n === 0, `sang bức 2, giấy trắng (bức ${e.lv + 1}, ${e.n} nét)`);
  // a stroke on drawing 2, then room-init {done: 0} (the server reset the branch) → everything wiped, back to drawing 1
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 60, cy + 20);
  await page.mouse.up();
  await page.waitForTimeout(400);
  ok((await read(f)).saved !== null, 'nét ở bức 2 đã lưu');
  await f.evaluate(() => postMessage({ type: 'room-init', done: 0, skipped: false, key: 'race:9' }, '*'));
  await page.waitForTimeout(200);
  const g = await read(f);
  const left = await f.evaluate(() => Object.keys(localStorage).filter((k) => k.includes(':strokes:')).length);
  ok(g.lv === 0 && g.n === 0 && left === 0, `room-init done 0: về bức 1, ${left} nét lưu còn lại`);
  // the overlay opened again with the SAME tally (done 0, key race:9): the drawing in progress survives; a tally that changed wipes it
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 50, cy + 30);
  await page.mouse.up();
  await page.waitForTimeout(400);
  await f.evaluate(() => postMessage({ type: 'room-init', done: 0, skipped: false, key: 'race:9' }, '*'));
  await page.waitForTimeout(200);
  const h = await read(f);
  ok(h.lv === 0 && h.n === 1, `room-init cùng số bức đã xong: nét đang vẽ còn nguyên (${h.n} nét)`);
  await f.evaluate(() => postMessage({ type: 'room-init', done: 2, skipped: false, key: 'race:9' }, '*'));
  await page.waitForTimeout(200);
  const k = await read(f);
  ok(k.lv === 2 && k.n === 0, `room-init số bức đổi: giấy trắng ở bức ${k.lv + 1}`);
} finally {
  await browser.close();
  await server.close();
}
if (errors.length) console.log(`Lỗi console:\n${errors.join('\n')}`);
console.log(fails || errors.length ? `THẤT BẠI: ${fails} kiểm tra, ${errors.length} lỗi` : 'Tất cả kiểm tra đạt');
process.exit(fails || errors.length ? 1 : 0);
