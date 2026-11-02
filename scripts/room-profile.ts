// Real-GPU profile of the CETIQLO room (the owner's "cà giựt"): HEADFUL system Chrome (not SwiftShader), the offline demo room with
// the body walking (`?autoMove=walk`), a rAF sampler: frame ms p50 / p95 / p99 / max, long frames > 20 ms, the rendered speed per frame
// vs the walking speed (variance = visible stutter even at a steady fps), the CPU split (room.update incl. store LOD / player.update /
// renderer.render / afterRender PiP) and renderer.info (draw calls, triangles) per spot: a floor-1 aisle, the checkout, the stair, floor 2.
// `--throttle 4` adds CDP CPU throttling (≈ a mid laptop); `--quality low` adds ?quality=low. Keep the window in front while it runs.
//   npx tsx scripts/room-profile.ts [--throttle 4] [--quality low] [--seconds 5] [--port 5379]
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

const { values: v } = parseArgs({ options: { throttle: { type: 'string', default: '1' }, quality: { type: 'string' }, seconds: { type: 'string', default: '5' }, port: { type: 'string', default: '5379' }, scene: { type: 'string', default: 'cetiqlo' } } });
const PORT = Number(v.port), SEC = Number(v.seconds);
const Q = v.quality ? `&quality=${v.quality}` : '';
// --scene street (the offline world, flat Hanoi street) / hall (the BOZAR room) are the references the owner finds smooth
const BOX = v.scene === 'street' ? `/?player&npc=0&wait=0&autoMove=walk${Q}` : `/?player=-2131,2883.2,0&boxes=L1,-2131,2881,opened,0&npc=0&wait=0&team=3&autoMove=walk&roomDemo=${v.scene}${Q}`;
// room-local spots → the body is spawned there (world = frame yaw π: x' = −2131 − x, z' = 2897 − z), facing −z (yaw π) unless said
const SPOTS: Record<string, { x: number; z: number; yaw?: number; yHint: number }> = v.scene === 'cetiqlo' ? {
  'floor1-aisle': { x: -2.4, z: 9, yHint: -29.9 },
  'floor1-side': { x: 7, z: 4, yaw: Math.PI, yHint: -29.9 },
  stair: { x: 12, z: 10.2, yHint: -29.9 },
  floor2: { x: 0, z: -3, yaw: 0, yHint: -26.1 }, // on floor 2 walking toward the atrium edge
} : {};
const pct = (a: number[], q: number) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * q))] ?? 0; };
const f1 = (n: number) => n.toFixed(1), f2 = (n: number) => n.toFixed(2);

const server = await createServer({ root: join(import.meta.dirname, '../client'), logLevel: 'warn', server: { port: PORT, strictPort: true, hmr: false, watch: null } }); // no HMR: another agent's edit must not reload the page mid-sample
await server.listen();
const browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', '--window-size=1280,760', '--window-position=0,0'] });
try {
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1280, height: 720 });
  const cdp = await page.context().newCDPSession(page);
  if (Number(v.throttle) > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: Number(v.throttle) });
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  await page.goto(`http://localhost:${PORT}${BOX}`);
  await page.waitForFunction(() => (globalThis as { __READY__?: boolean }).__READY__ === true, null, { timeout: 120_000 });
  const gpu = await page.evaluate(`(() => { const c = document.createElement('canvas').getContext('webgl2'); const d = c && c.getExtension('WEBGL_debug_renderer_info'); return d ? c.getParameter(d.UNMASKED_RENDERER_WEBGL) : '?'; })()`);
  console.log(`GPU: ${gpu} · CPU throttle ×${v.throttle} · quality ${v.quality ?? 'auto'}`);
  // instrument once (page code as a string: tsx/esbuild would inject `__name` helpers into a function passed to evaluate): wrap room.update /
  // player.update / renderer.render / room.afterRender and keep the last frame's CPU split in __PROF
  await page.evaluate(`(() => {
    const G = __GAME__, P = (globalThis.__PROF = { room: 0, player: 0, render: 0, pip: 0, calls: 0, tris: 0 });
    const room = G.room(), pu = G.player.update.bind(G.player), rr = G.renderer.render.bind(G.renderer);
    if (room) { const ru = room.update.bind(room), ar = room.afterRender && room.afterRender.bind(room);
      room.update = (dt) => { const t = performance.now(); ru(dt); P.room = performance.now() - t; };
      if (ar) room.afterRender = () => { const t = performance.now(); ar(); P.pip = performance.now() - t; }; }
    G.player.update = (...a) => { const t = performance.now(); const r = pu(...a); P.player = performance.now() - t; return r; };
    let first = true;
    G.renderer.render = (...a) => { const t = performance.now(); const r = rr(...a); if (first) { P.render = performance.now() - t; P.calls = G.renderer.info.render.calls; P.tris = G.renderer.info.render.triangles; } first = !first; return r; };
    if (G.raceHud && G.raceHud.open) dispatchEvent(new KeyboardEvent('keydown', { code: 'Tab' }));
  })()`);
  for (const [name, sp] of Object.keys(SPOTS).length ? Object.entries(SPOTS) : [[v.scene!, null] as const]) {
    if (sp) await page.evaluate(`__GAME__.player.controller.spawn(${-2131 - sp.x}, ${2897 - sp.z}, ${sp.yaw ?? Math.PI}, ${sp.yHint})`);
    await page.waitForTimeout(1500); // the spawn places the body a few steps later: the camera's snap must not be sampled
    const r = (await page.evaluate(`new Promise((done) => {
      const G = __GAME__, P = __PROF, c = G.camera, tc = G.player.camera, dt = [], sp = [], cs = [], arm = [], cpu = [], calls = [], tris = [], y = [], cam = [];
      let last = 0, lx = 0, lz = 0, cx = 0, cy = 0, cz = 0; const t0 = performance.now();
      requestAnimationFrame(function f(now) {
        const p = G.player.position;
        if (last) { const d = (now - last) / 1000; dt.push(d * 1000); sp.push(Math.hypot(p.x - lx, p.z - lz) / d); cs.push(Math.hypot(c.position.x - cx, c.position.y - cy, c.position.z - cz) / d); arm.push(Math.hypot(c.position.x - p.x, c.position.y - p.y, c.position.z - p.z)); cpu.push([P.room, P.player, P.render, P.pip]); calls.push(P.calls); tris.push(P.tris); y.push(p.y); cam.push([tc.yaw, tc.pitch, tc.left ? 1 : 0, tc.side, tc.arm]); }
        last = now; lx = p.x; lz = p.z; cx = c.position.x; cy = c.position.y; cz = c.position.z;
        if (now - t0 < ${SEC * 1000}) requestAnimationFrame(f); else done({ dt, sp, cs, arm, cpu, calls, tris, y, cam });
      });
    })`)) as { dt: number[]; sp: number[]; cs: number[]; arm: number[]; cpu: number[][]; calls: number[]; tris: number[]; y: number[]; cam: number[][] };
    const moving = r.sp.filter((s) => s > 1), mean = moving.reduce((a, b) => a + b, 0) / Math.max(1, moving.length), sd = Math.sqrt(moving.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, moving.length));
    const cpu = (i: number) => pct(r.cpu.map((c) => c[i]!), 0.5), cpu95 = (i: number) => pct(r.cpu.map((c) => c[i]!), 0.95);
    const long = r.dt.filter((d) => d > 20).length;
    const camv = r.cs.filter((_, i) => r.sp[i]! > 1), cmean = camv.reduce((a, b) => a + b, 0) / Math.max(1, camv.length), csd = Math.sqrt(camv.reduce((a, b) => a + (b - cmean) ** 2, 0) / Math.max(1, camv.length));
    const armD = r.arm.slice(1).map((a, i) => Math.abs(a - r.arm[i]!));
    if (process.env.DUMP) console.log('   frames 100..124 [dt ms, body m/s, camera m/s, arm m]: ' + r.dt.slice(100, 124).map((d, i) => `${d.toFixed(1)}/${r.sp[100 + i]!.toFixed(2)}/${r.cs[100 + i]!.toFixed(2)}/${r.arm[100 + i]!.toFixed(3)}`).join(' '));
    const d = (k: number) => r.cam.slice(1).map((c, i) => Math.abs(c[k]! - r.cam[i]![k]!));
    const swaps = r.cam.slice(1).filter((c, i) => c[2] !== r.cam[i]![2]).length;
    console.log(`   camera: yaw Δ/frame p95 ${(pct(d(0), 0.95) * 1000).toFixed(2)} mrad max ${(Math.max(...d(0)) * 1000).toFixed(1)} · pitch Δ p95 ${(pct(d(1), 0.95) * 1000).toFixed(2)} mrad · shoulder swaps ${swaps} · side Δ p95 ${(pct(d(3), 0.95) * 100).toFixed(2)} cm · spring arm Δ p95 ${(pct(d(4), 0.95) * 100).toFixed(2)} cm, arm p50 ${f2(pct(r.cam.map((c) => c[4]!), 0.5))} m`);
    console.log(`[${name}] ${r.dt.length} frames · frame ms p50 ${f1(pct(r.dt, 0.5))} p95 ${f1(pct(r.dt, 0.95))} p99 ${f1(pct(r.dt, 0.99))} max ${f1(Math.max(...r.dt))} · >20 ms: ${long} · ` +
      `speed ${f2(mean)} m/s ±${f2(sd)} (${f1((sd / Math.max(0.01, mean)) * 100)} %) · camera ${f2(cmean)} m/s ±${f2(csd)} (${f1((csd / Math.max(0.01, cmean)) * 100)} %), arm Δ/frame p95 ${(pct(armD, 0.95) * 100).toFixed(1)} cm max ${(Math.max(...armD) * 100).toFixed(1)} cm · cpu ms p50/p95: room ${f2(cpu(0))}/${f2(cpu95(0))} player ${f2(cpu(1))}/${f2(cpu95(1))} render ${f2(cpu(2))}/${f2(cpu95(2))} pip ${f2(cpu(3))}/${f2(cpu95(3))} · calls ${pct(r.calls, 0.5)} tris ${pct(r.tris, 0.5)} · y ${f2(r.y[0]!)}→${f2(r.y.at(-1)!)}`);
  }
} finally {
  await browser.close();
  await server.close();
}
