// Walk smoothness check (Leg 3 rooms): the body walks straight (`?autoMove=walk`) for SECONDS s in headless Chrome, a rAF sampler
// records the frame delta, the rendered feet, the physics feet, the camera, then prints p50 / p95 / max of the frame time and of the
// per-frame rendered speed (m/s; a smooth walk keeps it near the walking speed with a small spread), vertical jitter and camera jitter.
// Scenes: the street, the BOZAR hall, the CETIQLO store (`npx tsx scripts/room-smooth.ts [street|hall|cetiqlo …]`, SCREENSHOT_PORT).
// Exits 1 when a flat scene's feet bob or the CETIQLO stair climb is hoppy (LIMIT below): the regression check for the room stutter fix
// (the stair ramp collider in cetiqlo/cetiqloRoom.ts; `cetiqlo-stair-steps` = the bare step boxes, printed for comparison, never asserted).
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

const root = join(import.meta.dirname, '..');
const PORT = Number(process.env.SCREENSHOT_PORT ?? 5371);
const SECONDS = Number(process.env.SMOOTH_SECONDS ?? 6);
const BOX = '/?player=-2131,2883.2,0&boxes=L1,-2131,2881,opened,0&npc=0&wait=0&team=3&autoMove=walk';
const SCENES: Record<string, string> = {
  street: '/?player&autoMove=walk&npc=0&wait=0',
  hall: `${BOX}&roomDemo=hall`,
  cetiqlo: `${BOX}&roomDemo=cetiqlo`,
  'cetiqlo-stair': `${BOX}&roomDemo=cetiqlo`, // up the east stair on the ramp collider (cetiqloRoom.ts stairRamp)
  'cetiqlo-stair-steps': `${BOX}&roomDemo=cetiqlo&noRamp=1`, // the bare 24 step boxes (the KCC hops every step): the "before"
};
/** Where the stair scenes put the body before walking: the stair foot, facing up the stair (room-local (12, 10.2) under the box above). */
const STAIR_FOOT = { x: -2131 - 12, z: 2897 - 10.2, yaw: Math.PI, yHint: -29.9 };
/** Thresholds. Flat scenes: the feet never bob (|Δy| p95 ≤ 1 cm). The stair: the climb is a glide, not hops — the median per-frame rise is
 *  at least `steady` × the p95 one (the bare 24 step boxes gave 0.18 under SwiftShader, the ramp 0.40), nothing moves the body down,
 *  and no frame lifts it more than a riser. Rendered-speed spread is printed only: SwiftShader's frame-time noise dominates it. */
const LIMIT = { yJitter: 0.01, steady: 0.3, yStep: 0.2 };

interface Sample { t: number; x: number; y: number; z: number; px: number; py: number; pz: number; cx: number; cy: number; cz: number }
const sampler = (seconds: number) => `new Promise((done) => {
  const G = window.__GAME__, cam = G.player.camera.camera, out = [];
  const t0 = performance.now();
  requestAnimationFrame(function step(now) {
    const p = G.player.position, s = G.player.controller.state.position;
    out.push({ t: now, x: p.x, y: p.y, z: p.z, px: s.x, py: s.y, pz: s.z, cx: cam.position.x, cy: cam.position.y, cz: cam.position.z });
    if (now - t0 < ${seconds * 1000}) requestAnimationFrame(step); else done(out);
  });
})`;

const pct = (a: number[], q: number) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * q))] ?? 0; };
const fmt = (v: number, d = 2) => v.toFixed(d);
export function stats(samples: Sample[]) {
  const dt: number[] = [], speed: number[] = [], dy: number[] = [], camd: number[] = [];
  let physSteps = 0, yDown = 0;
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1]!, b = samples[i]!, d = (b.t - a.t) / 1000;
    if (d <= 0) continue;
    dt.push(d * 1000);
    speed.push(Math.hypot(b.x - a.x, b.z - a.z) / d);
    dy.push(Math.abs(b.y - a.y));
    if (b.y - a.y < -0.02) yDown++;
    camd.push(Math.hypot(b.cx - a.cx, b.cy - a.cy, b.cz - a.cz) / d);
    if (b.px !== a.px || b.pz !== a.pz || b.py !== a.py) physSteps++;
  }
  const moving = speed.filter((v) => v > 0.5); // the first frames before the body walks
  const mid = pct(moving, 0.5);
  return {
    frames: dt.length, dtP50: pct(dt, 0.5), dtP95: pct(dt, 0.95), dtMax: Math.max(...dt), physFrames: physSteps,
    speedP50: mid, speedP5: pct(moving, 0.05), speedP95: pct(moving, 0.95), speedSpread: pct(moving, 0.95) - pct(moving, 0.05),
    yJitterP95: pct(dy, 0.95), yJitterP50: pct(dy, 0.5), yJitterMax: Math.max(...dy), yDown, climb: samples.at(-1)!.y - samples[0]!.y, camP50: pct(camd, 0.5), camP95: pct(camd, 0.95),
  };
}

const names = process.argv.slice(2).filter((n) => n in SCENES);
const jobs = names.length ? names : Object.keys(SCENES);
const server = await createServer({ root: join(root, 'client'), logLevel: 'warn', server: { port: PORT, strictPort: true } });
let failed = false;
try {
  await server.listen();
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    const page = await browser.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => void errors.push(e.message));
    for (const name of jobs) {
      await page.setViewportSize(name.startsWith('cetiqlo-stair') ? { width: 400, height: 240 } : { width: 1280, height: 720 }); // a small frame: SwiftShader fast enough to tell a 16 cm hop from a ramp glide
      await page.goto(`http://localhost:${PORT}${SCENES[name]}`);
      await page.waitForFunction(() => (globalThis as { __READY__?: boolean }).__READY__ === true, null, { timeout: 90_000 });
      await page.waitForTimeout(1200); // the room's start move
      for (let i = 0; i < 3; i++) { // the demo's clue card opens itself (a card open = the body stands still): close it
        if (await page.evaluate(() => !!(globalThis as { __GAME__?: { raceHud?: { open: boolean } } }).__GAME__?.raceHud?.open)) await page.keyboard.press('Tab');
        await page.waitForTimeout(400);
      }
      if (name.startsWith('cetiqlo-stair')) {
        await page.evaluate((f) => (globalThis as unknown as { __GAME__: { player: { controller: { spawn(x: number, z: number, yaw: number, yHint: number): void } } } }).__GAME__.player.controller.spawn(f.x, f.z, f.yaw, f.yHint), STAIR_FOOT);
        await page.waitForTimeout(700);
      }
      const samples = (await page.evaluate(sampler(name.startsWith('cetiqlo-stair') ? 3 : SECONDS))) as Sample[];
      const s = stats(samples);
      const stair = name === 'cetiqlo-stair';
      // the ramp: the body climbs steadily (no frame moves it up more than yStep) and never hops back down (no sub-step reversal)
      const flat = name === 'street' || name === 'cetiqlo'; // the hall's aisle descends its terraces: printed, not asserted
      const bad = stair ? s.yJitterMax > LIMIT.yStep || s.yDown > 0 || s.yJitterP50 < LIMIT.steady * s.yJitterP95 : flat && s.yJitterP95 > LIMIT.yJitter;
      failed ||= bad;
      console.log(`[${name}] ${s.frames} frames · frame ms p50 ${fmt(s.dtP50, 1)} p95 ${fmt(s.dtP95, 1)} max ${fmt(s.dtMax, 1)} · physics frames ${s.physFrames}/${s.frames} · ` +
        `rendered speed m/s p5 ${fmt(s.speedP5)} p50 ${fmt(s.speedP50)} p95 ${fmt(s.speedP95)} (spread ${fmt(s.speedSpread)}) · |Δy| p50 ${fmt(s.yJitterP50, 3)} p95 ${fmt(s.yJitterP95, 3)} max ${fmt(s.yJitterMax, 3)} · down-frames ${s.yDown} · climbed ${fmt(s.climb)} m · camera m/s p50 ${fmt(s.camP50)} p95 ${fmt(s.camP95)}${bad ? '  ← GIẬT' : ''}`);
    }
    if (errors.length) console.error(errors.join('\n'));
  } finally {
    await browser.close();
  }
} finally {
  await server.close();
}
process.exit(failed ? 1 : 0);
