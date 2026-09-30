// Phase 4 track B: scripted ride in headless Chrome with real key events (npx tsx scripts/ride-check.ts). From the
// Concorde spawn: F out of reach (refused), walk to the dev bike, F (mount), W along the Champs-Élysées side, W + A turn,
// R bell, S stop, F (get off). Prints max speed / lean, lowest feet above the terrain, crashes; fails on console errors.
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { bikeTopSpeed, movement } from '../client/src/config.ts';

const PORT = Number(process.env.SCREENSHOT_PORT ?? 5174);
type Sample = { mode: string; speed: number; bikeSpeed: number; lean: number; y: number; ground: number; action: string; riding: boolean; dist: number; rel: number };

const server = await createServer({ root: join(import.meta.dirname, '../client'), logLevel: 'warn', server: { port: PORT, strictPort: true } });
const errors: string[] = [];
let failed = false;
try {
  await server.listen();
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    const page = await browser.newPage();
    page.on('console', (m) => void (m.type() === 'error' && errors.push(m.text())));
    page.on('pageerror', (e) => void errors.push(e.message));
    await page.goto(`http://localhost:${PORT}/?player&wait=1`);
    await page.waitForFunction(() => (globalThis as { __READY__?: boolean }).__READY__ === true, null, { timeout: 60_000 });
    const sample = () =>
      page.evaluate((): Sample => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const p = (globalThis as any).__GAME__.player;
        const s = p.controller.state;
        const b = p.bikes.list[0];
        const r = p.controller.riding;
        const dx = b.position.x - s.position.x, dz = b.position.z - s.position.z;
        const yaw = Math.atan2(-dx, -dz); // heading toward the first dev bike
        const rel = Math.atan2(Math.sin(yaw - p.camera.yaw), Math.cos(yaw - p.camera.yaw));
        const ground = p.controller.env.heightAt(s.position.x, s.position.z);
        return { mode: s.moveMode, speed: Math.hypot(s.velocity.x, s.velocity.z), bikeSpeed: r ? r.speed : 0, lean: r ? r.lean : 0, y: s.position.y, ground, action: s.action, riding: !!r, dist: Math.hypot(dx, dz), rel };
      });
    const log: Sample[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const simTime = () => page.evaluate(() => (globalThis as any).__GAME__.player.simTime as number);
    /** Holds `keys` for `seconds` of simulated time (SwiftShader runs slower than real time). */
    const hold = async (keys: string[], seconds: number) => {
      for (const k of keys) await page.keyboard.down(k);
      const end = (await simTime()) + seconds;
      while ((await simTime()) < end) {
        await page.waitForTimeout(50);
        log.push(await sample());
      }
      for (const k of keys) await page.keyboard.up(k);
    };
    const press = async (k: string) => {
      await page.keyboard.press(k);
      await page.waitForTimeout(300);
      return sample();
    };

    const before = await press('KeyF');
    console.log(`F cách xe ${before.dist.toFixed(2)} m: ${before.riding ? 'LÊN XE (sai)' : 'từ chối (đúng)'}`);
    for (let i = 0; i < 60; i++) {
      const s = await sample();
      if (s.dist < 1.8) break;
      const r = s.rel; // + = to the camera's left
      await hold([Math.abs(r) < Math.PI / 4 ? 'KeyW' : Math.abs(r) > (3 * Math.PI) / 4 ? 'KeyS' : r > 0 ? 'KeyA' : 'KeyD'], 0.1);
    }
    const mounted = await press('KeyF');
    console.log(`F cạnh xe: ${mounted.riding ? 'lên xe' : 'KHÔNG lên được'} (${mounted.mode})`);
    log.length = 0;
    const t0 = Date.now();
    await hold(['KeyW'], 4);
    const straight = [...log];
    await hold(['KeyW', 'KeyA'], 2);
    const turn = log.slice(straight.length);
    await press('KeyR');
    const braking = log.length;
    await hold(['KeyS'], 0.8); // 5.2 m/s ÷ brakeDecel 7 ≈ 0.74 s, then slow reverse
    const stopped = log.slice(braking).some((s) => s.riding && s.bikeSpeed <= 0);
    const off = await press('KeyF');
    const all = log;
    const max = Math.max(...straight.map((s) => s.speed));
    const leanTurn = Math.min(...turn.map((s) => s.lean)) * (180 / Math.PI);
    const lowest = Math.min(...all.map((s) => s.y - s.ground));
    const crashed = all.some((s) => s.action === 'crash');
    console.log(`Tốc độ tối đa ${max.toFixed(2)} m/s (bikeTopSpeed ${bikeTopSpeed().toFixed(2)}, = ${(max / movement.footSpeed).toFixed(3)} × footSpeed)`);
    console.log(`Nghiêng khi cua trái: ${leanTurn.toFixed(1)}° · thấp nhất so với địa hình ${lowest.toFixed(2)} m · ngã: ${crashed} · ${((Date.now() - t0) / 1000).toFixed(1)} s thực`);
    console.log(`Phanh (S): ${stopped ? 'dừng được' : 'KHÔNG dừng'} · F xuống xe: ${off.riding ? 'VẪN TRÊN XE' : off.mode}`);
    failed =
      before.riding || !mounted.riding || Math.abs(max / bikeTopSpeed() - 1) > 0.02 || leanTurn > -5 || lowest < -0.5 || crashed || !stopped || off.riding;
  } finally {
    await browser.close();
  }
} finally {
  await server.close();
}
if (errors.length) console.error(`Lỗi console:\n${errors.join('\n')}`);
if (failed || errors.length) process.exit(1);
console.log('OK');
