// Real-GPU profile of the CETIQLO room (the owner's "cà giựt"): HEADFUL system Chrome (not SwiftShader), a rAF sampler: frame ms p50 /
// p95 / p99 / max, long frames > 20 ms, the rendered body speed per frame vs the walking speed (variance = visible stutter even at a
// steady fps), the camera speed / spring-arm deltas, the CPU split (room.update incl. store LOD / player.update / renderer.render /
// afterRender PiP), plus a PerformanceObserver 'longtask' + 'long-animation-frame' log (main-thread hitches and their script sources).
//   npx tsx scripts/room-profile.ts [--scene cetiqlo|hall|street] [--throttle 4] [--quality low] [--seconds 5] [--port 5379]
//     the offline demo room, one window, the body on `?autoMove=walk`, 4 spots (SPOTS).
//   npx tsx scripts/room-profile.ts --real <wrangler port> [--throttle 4] [--seconds 5]
//     the owner's scenario: the REAL server (cq-test-setup: a fresh race, 2 teams, `?autoCq=1` links), TWO headful Chrome windows side by
//     side, both inside the running match; window A is profiled walking (W) and sprinting (Shift+W / Shift+S) down the aisle.
// Keep the windows in front while it runs (Chrome throttles occluded pages).
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { type Page, chromium } from 'playwright-core';
import { createServer } from 'vite';
import { QUICK_LEG, setupRace } from './cq-test-setup.ts';

const { values: v } = parseArgs({ options: { throttle: { type: 'string', default: '1' }, quality: { type: 'string' }, seconds: { type: 'string' }, port: { type: 'string', default: '5379' }, scene: { type: 'string', default: 'cetiqlo' }, real: { type: 'string' }, password: { type: 'string', default: process.env.HOST_PASSWORD ?? 'test1234' } } });
const PORT = Number(v.port), REAL = v.real ? Number(v.real) : 0, SEC = v.seconds !== undefined ? Number(v.seconds) : REAL ? 3 : 5;
const Q = v.quality ? `&quality=${v.quality}` : '';
const BOX = v.scene === 'street' ? `/?player&npc=0&wait=0&autoMove=walk${Q}` : `/?player=-2131,2883.2,0&boxes=L1,-2131,2881,opened,0&npc=0&wait=0&team=3&autoMove=walk&roomDemo=${v.scene}${Q}`;
// room-local spots (world = frame yaw π: x' = −2131 − x, z' = 2897 − z), facing −z (yaw π) unless said; yHint picks the floor
const SPOTS: Record<string, { x: number; z: number; yaw?: number; yHint: number }> = v.scene === 'cetiqlo' ? {
  'floor1-aisle': { x: -2.4, z: 9, yHint: -29.9 },
  'floor1-side': { x: 7, z: 4, yaw: Math.PI, yHint: -29.9 },
  stair: { x: 12, z: 10.2, yHint: -29.9 },
  floor2: { x: 0, z: -3, yaw: 0, yHint: -26.1 },
} : {};
const pct = (a: number[], q: number) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * q))] ?? 0; };
const f1 = (n: number) => n.toFixed(1), f2 = (n: number) => n.toFixed(2);

// page code as strings: tsx/esbuild would inject `__name` helpers into a function passed to page.evaluate
const OBSERVE = `(() => { const L = (globalThis.__LONG = { tasks: [], frames: [] });
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) L.tasks.push([performance.now(), e.duration]); }).observe({ type: 'longtask', buffered: true }); } catch {}
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) L.frames.push([performance.now(), e.duration, (e.scripts || []).map((s) => (s.invokerType || '') + ':' + (s.invoker || s.sourceURL || '').slice(-70)).join(',')]); }).observe({ type: 'long-animation-frame', buffered: true }); } catch {} })()`;
const INSTRUMENT = `(() => {
  const G = __GAME__, P = (globalThis.__PROF = { room: 0, player: 0, render: 0, pip: 0, calls: 0, tris: 0 });
  const room = G.room(), pu = G.player.update.bind(G.player), rr = G.renderer.render.bind(G.renderer);
  if (room) { const ru = room.update.bind(room), ar = room.afterRender && room.afterRender.bind(room);
    room.update = (dt) => { const t = performance.now(); ru(dt); P.room = performance.now() - t; };
    if (ar) room.afterRender = () => { const t = performance.now(); ar(); P.pip = performance.now() - t; }; }
  G.player.update = (...a) => { const t = performance.now(); const r = pu(...a); P.player = performance.now() - t; return r; };
  let first = true;
  G.renderer.render = (...a) => { const t = performance.now(); const r = rr(...a); if (first) { P.render = performance.now() - t; P.calls = G.renderer.info.render.calls; P.tris = G.renderer.info.render.triangles; } first = !first; return r; };
  if (G.raceHud && G.raceHud.open) dispatchEvent(new KeyboardEvent('keydown', { code: 'Tab' }));
})()`;
const SAMPLE = `new Promise((done) => {
  const G = __GAME__, P = __PROF, c = G.camera, tc = G.player.camera, S = G.player.controller.state, dt = [], sp = [], cs = [], arm = [], cpu = [], y = [], cam = [], gr = [], dx = [], dz = [];
  const L = globalThis.__LONG || { tasks: [], frames: [] }, t0 = performance.now(), nT = L.tasks.length, nF = L.frames.length;
  let last = 0, lx = 0, lz = 0, cx = 0, cy = 0, cz = 0;
  requestAnimationFrame(function f(now) {
    const p = G.player.position;
    if (last) { const d = (now - last) / 1000; dt.push(d * 1000); sp.push(Math.hypot(p.x - lx, p.z - lz) / d); cs.push(Math.hypot(c.position.x - cx, c.position.y - cy, c.position.z - cz) / d); arm.push(Math.hypot(c.position.x - p.x, c.position.y - p.y, c.position.z - p.z)); cpu.push([P.room, P.player, P.render, P.pip]); y.push(p.y); cam.push([tc.yaw, tc.pitch, tc.left ? 1 : 0, tc.side, tc.arm]); gr.push(S.grounded ? 1 : 0); dx.push(p.x - lx); dz.push(p.z - lz); }
    last = now; lx = p.x; lz = p.z; cx = c.position.x; cy = c.position.y; cz = c.position.z;
    if (now - t0 < ${SEC * 1000}) requestAnimationFrame(f); else done({ dt, sp, cs, arm, cpu, y, cam, gr, dx, dz, tasks: L.tasks.slice(nT), frames: L.frames.slice(nF) });
  });
})`;
type Sample = { dt: number[]; sp: number[]; cs: number[]; arm: number[]; cpu: number[][]; y: number[]; cam: number[][]; gr: number[]; dx: number[]; dz: number[]; tasks: [number, number][]; frames: [number, number, string][] };
/** On the OTHER window: how the walking team's avatar (a RemotePlayers body) moves there — tick arrivals, per-frame root displacement, clip flips. */
const REMOTE_SAMPLE = (slot: number) => `new Promise((done) => {
  const G = __GAME__, R = G.remote, t0 = performance.now(), ticks = [], disp = [], clips = [], ys = [];
  const ap = R.apply.bind(R); R.apply = (ms, entries) => { if (entries.some((e) => e.slot === ${slot})) ticks.push(performance.now() - t0); return ap(ms, entries); };
  let lx = 0, lz = 0, last = 0;
  requestAnimationFrame(function f(now) {
    const r = R.slots && R.slots.get(${slot});
    if (r) { const p = r.model.root.position, cur = r.animator && r.animator.current, clip = cur && cur.getClip ? cur.getClip().name : '?';
      if (last) { const d = (now - last) / 1000; disp.push(Math.hypot(p.x - lx, p.z - lz) / d); } clips.push(clip); ys.push(p.y); lx = p.x; lz = p.z; last = now; }
    if (now - t0 < ${SEC * 1000}) requestAnimationFrame(f); else { R.apply = ap; done({ ticks, disp, clips, ys, visible: !!(r && r.model.root.visible) }); }
  });
})`;
function reportRemote(name: string, r: { ticks: number[]; disp: number[]; clips: string[]; ys: number[]; visible: boolean }) {
  const mv = r.disp.filter((d) => d > 0.5), mean = mv.reduce((a, b) => a + b, 0) / Math.max(1, mv.length), sd = Math.sqrt(mv.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, mv.length));
  const gaps = r.ticks.slice(1).map((t, i) => t - r.ticks[i]!);
  const flips = r.clips.filter((c, i) => i && c !== r.clips[i - 1]).length;
  const still = r.disp.filter((d) => d < 0.05).length;
  console.log(`   REMOTE view of ${name}: ticks ${r.ticks.length} (${(r.ticks.length / SEC).toFixed(1)} Hz, gap p50 ${f1(pct(gaps, 0.5))} p95 ${f1(pct(gaps, 0.95))} max ${f1(Math.max(0, ...gaps))} ms) · root speed ${f2(mean)} m/s ±${f2(sd)} (${f1((sd / Math.max(0.01, mean)) * 100)} %) · frames standing still ${still}/${r.disp.length} · clip flips ${flips} (${[...new Set(r.clips)].join('/')}) · visible ${r.visible}`);
}
const GPU = `(() => { const c = document.createElement('canvas').getContext('webgl2'); const d = c && c.getExtension('WEBGL_debug_renderer_info'); return d ? c.getParameter(d.UNMASKED_RENDERER_WEBGL) : '?'; })()`;
const READY = () => (globalThis as { __READY__?: boolean }).__READY__ === true;

function report(name: string, r: Sample) {
  const moving = r.sp.filter((s) => s > 1), mean = moving.reduce((a, b) => a + b, 0) / Math.max(1, moving.length), sd = Math.sqrt(moving.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, moving.length));
  const cpu = (i: number) => pct(r.cpu.map((c) => c[i]!), 0.5), cpu95 = (i: number) => pct(r.cpu.map((c) => c[i]!), 0.95);
  const camv = r.cs.filter((_, i) => r.sp[i]! > 1), cmean = camv.reduce((a, b) => a + b, 0) / Math.max(1, camv.length), csd = Math.sqrt(camv.reduce((a, b) => a + (b - cmean) ** 2, 0) / Math.max(1, camv.length));
  const armD = r.arm.slice(1).map((a, i) => Math.abs(a - r.arm[i]!));
  const d = (k: number) => r.cam.slice(1).map((c, i) => Math.abs(c[k]! - r.cam[i]![k]!));
  const swaps = r.cam.slice(1).filter((c, i) => c[2] !== r.cam[i]![2]).length;
  const tasks = r.tasks.map((t) => t[1]);
  // lateral jitter: per-frame displacement across the mean walking direction (mm), grounded flips, root y per frame
  const mx = r.dx.reduce((a, b) => a + b, 0), mz = r.dz.reduce((a, b) => a + b, 0), ml = Math.hypot(mx, mz) || 1, ux = mx / ml, uz = mz / ml;
  const lat = r.dx.map((x, i) => Math.abs(x * uz - r.dz[i]! * ux) * 1000).filter((_, i) => r.sp[i]! > 1);
  const gflips = r.gr.filter((g, i) => i && g !== r.gr[i - 1]).length, dy = r.y.slice(1).map((v, i) => Math.abs(v - r.y[i]!) * 1000);
  console.log(`   body: lateral jitter per frame p95 ${f1(pct(lat, 0.95))} mm max ${f1(Math.max(0, ...lat))} mm · |Δy| per frame p95 ${f1(pct(dy, 0.95))} mm max ${f1(Math.max(0, ...dy))} mm · grounded flips ${gflips}`);
  console.log(`[${name}] ${r.dt.length} frames · frame ms p50 ${f1(pct(r.dt, 0.5))} p95 ${f1(pct(r.dt, 0.95))} p99 ${f1(pct(r.dt, 0.99))} max ${f1(Math.max(...r.dt))} · >20 ms: ${r.dt.filter((x) => x > 20).length} · ` +
    `speed ${f2(mean)} m/s ±${f2(sd)} (${f1((sd / Math.max(0.01, mean)) * 100)} %) · camera ${f2(cmean)} m/s ±${f2(csd)} (${f1((csd / Math.max(0.01, cmean)) * 100)} %), arm Δ/frame p95 ${(pct(armD, 0.95) * 100).toFixed(1)} cm max ${(Math.max(...armD) * 100).toFixed(1)} cm · ` +
    `cpu ms p50/p95: room ${f2(cpu(0))}/${f2(cpu95(0))} player ${f2(cpu(1))}/${f2(cpu95(1))} render ${f2(cpu(2))}/${f2(cpu95(2))} pip ${f2(cpu(3))}/${f2(cpu95(3))} · y ${f2(r.y[0]!)}→${f2(r.y.at(-1)!)}`);
  console.log(`   camera: yaw Δ/frame p95 ${(pct(d(0), 0.95) * 1000).toFixed(2)} mrad · pitch Δ p95 ${(pct(d(1), 0.95) * 1000).toFixed(2)} mrad · shoulder swaps ${swaps} · side Δ p95 ${(pct(d(3), 0.95) * 100).toFixed(2)} cm · spring arm Δ p95 ${(pct(d(4), 0.95) * 100).toFixed(2)} cm, arm p50 ${f2(pct(r.cam.map((c) => c[4]!), 0.5))} m`);
  console.log(`   long tasks: ${tasks.length} (max ${f1(Math.max(0, ...tasks))} ms, >16 ms: ${tasks.filter((x) => x > 16).length}) · long animation frames: ${r.frames.length}${r.frames.length ? ' e.g. ' + r.frames.slice(0, 5).map((f) => `${f1(f[1])} ms [${f[2].slice(0, 100)}]`).join(' | ') : ''}`);
  if (process.env.DUMP) console.log('   frames 100..124 [dt ms, body m/s, camera m/s, arm m]: ' + r.dt.slice(100, 124).map((x, i) => `${x.toFixed(1)}/${r.sp[100 + i]!.toFixed(2)}/${r.cs[100 + i]!.toFixed(2)}/${r.arm[100 + i]!.toFixed(3)}`).join(' '));
}

const launch = (x: number, w: number) => chromium.launch({ channel: 'chrome', headless: false, args: ['--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', `--window-size=${w},${w === 960 ? 640 : 760}`, `--window-position=${x},0`] });
const server = await createServer({ root: join(import.meta.dirname, '../client'), logLevel: 'warn', server: { port: PORT, strictPort: true, hmr: false, watch: null, ...(REAL ? { proxy: { '/api': { target: `http://localhost:${REAL}`, ws: true } } } : {}) } }); // no HMR: another agent's edit must not reload the page mid-sample
const browsers: Awaited<ReturnType<typeof launch>>[] = [];
try {
  await server.listen();
  if (REAL) {
    const stamp = new Date().toISOString().slice(11, 19).replace(/:/g, '');
    const setup = await setupRace({ url: `http://localhost:${REAL}`, race: `cqprof-${stamp}`, teams: 2, password: v.password!, leg: QUICK_LEG, client: `http://localhost:${PORT}` });
    const pages: Page[] = [];
    for (const [i, x] of [0, 960].entries()) {
      const b = await launch(x, 960); browsers.push(b);
      const page = await b.newPage();
      await page.setViewportSize({ width: 960, height: 560 });
      await page.addInitScript(OBSERVE);
      page.on('pageerror', (e) => console.log('pageerror', e.message));
      await page.goto(setup.urls[i]!.url);
      pages.push(page);
    }
    for (const p of pages) await p.waitForFunction(READY, null, { timeout: 120_000 });
    for (const p of pages) await p.waitForFunction(() => { const s = (globalThis as unknown as { __GAME__: { cq?: () => { state(): { phase: string } } } }).__GAME__.cq?.(); return !!s && s.state().phase === 'match'; }, null, { timeout: 120_000 });
    const A = pages[0]!;
    const cdp = await A.context().newCDPSession(A);
    if (Number(v.throttle) > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: Number(v.throttle) });
    console.log(`REAL server :${REAL} · race ${setup.race} · 2 windows in the match · GPU: ${await A.evaluate(GPU)} · CPU throttle ×${v.throttle}`);
    await A.evaluate(INSTRUMENT);
    await A.waitForTimeout(1500);
    await A.bringToFront();
    const B = pages[1]!, slotA = setup.teams[0]!.slot;
    // the aisle is 28 m long from the start spot: sprint forward first (8 m/s × 3 s = 24 m), then walk back (4 m/s × 3 s); every run stays inside it
    for (const [name, keys] of [['sprint (Shift+W)', ['ShiftLeft', 'KeyW']], ['walk back (S)', ['KeyS']]] as const) {
      for (const k of keys) await A.keyboard.down(k);
      const [r, rb] = await Promise.all([A.evaluate(SAMPLE) as Promise<Sample>, B.evaluate(REMOTE_SAMPLE(slotA)) as Promise<{ ticks: number[]; disp: number[]; clips: string[]; ys: number[]; visible: boolean }>]);
      for (const k of keys) await A.keyboard.up(k);
      report(name, r);
      reportRemote(name, rb);
      await A.waitForTimeout(600);
    }
  } else {
    const b = await launch(0, 1280); browsers.push(b);
    const page = await b.newPage();
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.addInitScript(OBSERVE);
    const cdp = await page.context().newCDPSession(page);
    if (Number(v.throttle) > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: Number(v.throttle) });
    page.on('pageerror', (e) => console.log('pageerror', e.message));
    await page.goto(`http://localhost:${PORT}${BOX}`);
    await page.waitForFunction(READY, null, { timeout: 120_000 });
    console.log(`GPU: ${await page.evaluate(GPU)} · CPU throttle ×${v.throttle} · quality ${v.quality ?? 'auto'}`);
    await page.evaluate(INSTRUMENT);
    for (const [name, sp] of Object.keys(SPOTS).length ? Object.entries(SPOTS) : [[v.scene!, null] as const]) {
      if (sp) await page.evaluate(`__GAME__.player.controller.spawn(${-2131 - sp.x}, ${2897 - sp.z}, ${sp.yaw ?? Math.PI}, ${sp.yHint})`);
      await page.waitForTimeout(1500); // the spawn places the body a few steps later: the camera's snap must not be sampled
      report(name, (await page.evaluate(SAMPLE)) as Sample);
    }
  }
} finally {
  for (const b of browsers) await b.close();
  await server.close();
}
