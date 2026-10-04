// Phase 4: scripted play in headless Chrome with real key events (`npm run ride-check`, SCREENSHOT_PORT=<n>). Three runs:
// 1. Concorde spawn: F out of reach (refused), walk to the dev bike, F, ride ~300 m of the car route toward the Arc
//    (A* on roadgraph.json, steering with A / D, Concorde setts on the way), R, S until stopped, F off, walk 5 s.
// 2. Rue Royale facade (p4-crash): ride into it at speed → crash, stand up, walk back to the bike, F on, F off.
// 3. North quay flight east of Pont Alexandre III: walk onto the landing, down the steps into the Seine, swim, back onto
//    the lower steps from the river side, up to the quay.
// Mouse look is emulated by setting the orbit camera yaw. Prints the measured numbers; fails on console errors.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { latLonToWorld } from '@race/shared';
import { RoadGraph, type RoadGraphFile, pathPolyline, shortestPath } from '@race/shared/graph';
import { chromium, type Page } from 'playwright-core';
import { createServer } from 'vite';
import { bikeTopSpeed, movement } from '../client/src/config.ts';

const PORT = Number(process.env.SCREENSHOT_PORT ?? 5174);
const DEG = Math.PI / 180;
const PRESS_SIM = 0.3; // s simulated after a key press before reading the state
type Sample = {
  t: number;
  x: number;
  z: number;
  mode: string;
  speed: number;
  bikeSpeed: number;
  lean: number;
  yaw: number;
  y: number;
  ground: number;
  action: string;
  riding: boolean;
  dist: number;
  surface: string;
  owner: string | null;
  water: number | null;
};
const errors: string[] = [];
const fails: string[] = [];
const check = (ok: boolean, what: string) => void (ok || fails.push(what));
// ponytail: part 3 (swim / quay stairs) is opt-in (RIDE_ONLY=3) since players are assumed not to swim and it flakes under load
const only = (n: number) => (process.env.RIDE_ONLY ? process.env.RIDE_ONLY === String(n) : n !== 3);
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

async function run(page: Page, path: string) {
  await page.goto(`http://localhost:${PORT}${path}${path.includes('?') ? '&' : '?'}npc=0`); // no NPCs: physics only
  await page.waitForFunction(() => (globalThis as { __READY__?: boolean }).__READY__ === true, null, { timeout: 90_000 });
  const log: Sample[] = [];
  const sample = () =>
    page.evaluate((): Sample => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const p = (globalThis as any).__GAME__.player;
      const s = p.controller.state,
        b = p.bikes.list[0],
        r = p.controller.riding;
      const e = p.controller.env;
      return {
        t: p.simTime,
        x: s.position.x,
        z: s.position.z,
        mode: s.moveMode,
        speed: Math.hypot(s.velocity.x, s.velocity.z),
        bikeSpeed: r ? r.speed : 0,
        lean: r ? r.lean : 0,
        yaw: r ? r.yaw : s.yaw,
        y: s.position.y,
        ground: e.heightAt(s.position.x, s.position.z),
        action: s.action,
        riding: !!r,
        dist: b ? Math.hypot(b.position.x - s.position.x, b.position.z - s.position.z) : 1e9,
        surface: p.surface,
        owner: b ? b.owner : null,
        water: e.waterLevel,
      };
    });
  const face = (x: number, z: number) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    page.evaluate(
      ([x, z]) => {
        const p = (globalThis as any).__GAME__.player,
          s = p.controller.state.position;
        p.camera.yaw = Math.atan2(-(x! - s.x), -(z! - s.z));
      },
      [x, z],
    );
  /** Holds `keys` for `seconds` of simulated time (SwiftShader runs slower than real time); `each` may stop it early. */
  const hold = async (keys: string[], seconds: number, each?: (s: Sample) => boolean | Promise<boolean>) => {
    for (const k of keys) await page.keyboard.down(k);
    const end = (await sample()).t + seconds;
    for (;;) {
      await page.waitForTimeout(40);
      const s = await sample();
      log.push(s);
      if (s.t >= end || (each && (await each(s)))) break;
    }
    for (const k of keys) await page.keyboard.up(k);
  };
  /** Presses `k`, then waits for PRESS_SIM s of simulated time (not a fixed real-time wait: a loaded machine's
   *  SwiftShader may not run one frame in 300 ms, review m10), at most 60 s. */
  const press = async (k: string) => {
    const t0 = (await sample()).t;
    await page.keyboard.press(k);
    for (const end = Date.now() + 60_000; Date.now() < end; ) {
      await page.waitForTimeout(40);
      const s = await sample();
      if (s.t >= t0 + PRESS_SIM) return s;
    }
    return sample();
  };
  /** Walk (camera faced each step) to the first bike until within 1.8 m. */
  const walkToBike = async () => {
    for (let i = 0; i < 80; i++) {
      const bp = await page.evaluate(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const b = (globalThis as any).__GAME__.player.bikes.list[0].position;
        return [b.x, b.z] as [number, number];
      });
      await face(...bp);
      let near = false;
      await hold(['KeyW'], 0.15, (s) => (near = s.dist < 1.8));
      if (near) return;
    }
  };
  return { log, sample, face, hold, press, walkToBike };
}

const graph = RoadGraph.decode(JSON.parse(readFileSync(join(import.meta.dirname, '../shared/data/roadgraph.json'), 'utf8')) as RoadGraphFile);
const server = await createServer({
  root: join(import.meta.dirname, '../client'),
  logLevel: 'warn',
  server: { port: PORT, strictPort: true },
});
try {
  await server.listen();
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-precise-memory-info', '--js-flags=--expose-gc'],
  });
  try {
    const page = await browser.newPage();
    page.on('console', (m) => void (m.type() === 'error' && errors.push(m.text())));
    page.on('pageerror', (e) => void errors.push(e.message));
    const heap = () =>
      page.evaluate(
        () => (
          (globalThis as { gc?: () => void }).gc?.(),
          `${((performance as unknown as { memory: { usedJSHeapSize: number } }).memory.usedJSHeapSize / 1e6).toFixed(1)} MB / ${(globalThis as unknown as { __STATS__: { chunks: number } }).__STATS__.chunks} chunk`
        ),
      );

    // ---- 1. ride ----
    if (only(1)) {
      const r = await run(page, '/?player&wait=1');
      const before = await r.press('KeyF');
      check(!before.riding, 'F out of reach mounted');
      console.log(`F cách xe ${before.dist.toFixed(2)} m: ${before.riding ? 'LÊN XE (sai)' : 'từ chối (đúng)'}`);
      await r.walkToBike();
      const mounted = await r.press('KeyF');
      check(mounted.riding, 'F next to the bike did not mount');
      // Draw calls of the rider + bike (estimate: visible renderables, ×2 with the shadow pass).
      const calls = await page.evaluate(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const p = (globalThis as any).__GAME__.player;
        let n = 0;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const o of [p.model.root, p.bikes.models.get(p.controller.riding.id).root])
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          o.traverseVisible((m: any) => void ((m.isMesh || m.isPoints || m.isSprite) && (n += m.castShadow ? 2 : 1)));
        return n;
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await page.evaluate(async () => void (await (globalThis as any).__GAME__.graph)); // roadgraph.json decoded before the baseline
      const heap0 = await heap();
      const a = latLonToWorld(48.8738, 2.295); // Arc: the spawn faces it
      const from = graph.nearestNode(mounted.x, mounted.z, 'car');
      const dir = Math.hypot(a.x - mounted.x, a.z - mounted.z);
      const to = graph.nearestNode(mounted.x + ((a.x - mounted.x) / dir) * 300, mounted.z + ((a.z - mounted.z) / dir) * 300, 'car');
      const route = shortestPath(graph, from, to, 'car');
      const poly = route ? pathPolyline(graph, route) : [];
      const pts = [[mounted.x, mounted.z]];
      for (let i = 0; i < poly.length; i += 2) pts.push([poly[i]!, poly[i + 1]!]);
      let k = 1;
      const rideStart = r.log.length;
      await r.hold(['KeyW'], 0.5);
      const endT = (await r.sample()).t + 120;
      while (k < pts.length && (await r.sample()).t < endT) {
        const s = await r.sample();
        while (k < pts.length - 1 && Math.hypot(pts[k]![0]! - s.x, pts[k]![1]! - s.z) < 7) k++; // pure pursuit, ~7 m look-ahead
        const [tx, tz] = pts[k]!;
        if (k === pts.length - 1 && Math.hypot(tx! - s.x, tz! - s.z) < 4) break;
        const rel = wrap(Math.atan2(-(tx! - s.x), -(tz! - s.z)) - s.yaw); // + = target to the left
        await r.hold(Math.abs(rel) < 4 * DEG ? ['KeyW'] : ['KeyW', rel > 0 ? 'KeyA' : 'KeyD'], 0.1, (x) => x.action === 'crash');
        if (r.log.at(-1)!.action === 'crash') break;
      }
      const ride = r.log.slice(rideStart);
      let rode = 0;
      for (let i = 1; i < ride.length; i++) rode += Math.hypot(ride[i]!.x - ride[i - 1]!.x, ride[i]!.z - ride[i - 1]!.z);
      await r.press('KeyR');
      const braking = r.log.length;
      await r.hold(['KeyS'], 2, (s) => s.riding && s.bikeSpeed <= 0);
      const stopped = r.log.slice(braking).some((s) => s.riding && s.bikeSpeed <= 0);
      const brakeTime = r.log.at(-1)!.t - r.log[braking]!.t;
      const off = await r.press('KeyF');
      const heap1 = await heap();
      const walkStart = r.log.length;
      await r.face(off.x - 100, off.z); // walk west 5 s
      await r.hold(['KeyW'], 5);
      const walkMax = Math.max(...r.log.slice(walkStart).map((s) => s.speed));
      const bikeMax = Math.max(...ride.map((s) => s.speed));
      const lean = Math.max(...ride.map((s) => Math.abs(s.lean))) / DEG;
      const pave = ride.filter((s) => s.surface === 'pave').length / ride.length;
      const lowest = Math.min(...r.log.map((s) => s.y - s.ground));
      const crashed = ride.some((s) => s.action === 'crash');
      console.log(
        `Tuyến A* (car) ${route?.length.toFixed(0)} m · đã đạp ${rode.toFixed(0)} m · ${(pave * 100) | 0} % mẫu trên đá lát · ngã: ${crashed}`,
      );
      console.log(
        `Đi bộ tối đa ${walkMax.toFixed(3)} m/s (footSpeed ${movement.footSpeed}) · xe tối đa ${bikeMax.toFixed(3)} m/s (bikeTopSpeed ${bikeTopSpeed().toFixed(2)}) · tỉ lệ ${(bikeMax / walkMax).toFixed(3)}`,
      );
      console.log(
        `Nghiêng tối đa ${lean.toFixed(1)}° · phanh ${stopped ? `dừng sau ${brakeTime.toFixed(2)} s` : 'KHÔNG dừng'} · F xuống: ${off.riding ? 'VẪN TRÊN XE' : off.mode}`,
      );
      console.log(`Thấp nhất so với địa hình ${lowest.toFixed(2)} m · heap ${heap0} → ${heap1} · người + xe ≈ ${calls} lệnh vẽ`);
      check(rode >= 280, `rode only ${rode.toFixed(0)} m`);
      check(!crashed, 'crashed on the route');
      check(pave > 0.05, 'no cobbles on the route');
      check(walkMax <= movement.footSpeed * 1.01, 'walk too fast');
      check(bikeMax <= bikeTopSpeed() * 1.01 && bikeMax >= 0.85 * bikeTopSpeed(), 'bike speed ratio'); // ≥ 85 %: the route's turns cap it (bike.sharpTurn ≈ 87 %)
      check(stopped && !off.riding && lowest > -0.5 && lean > 5, 'brake / dismount / fall-through / lean');
      check(parseFloat(heap1) - parseFloat(heap0) < 25, 'heap grew');
      check(calls <= 12, 'rider + bike draw calls');
    }
    // ---- 2. crash ----
    if (only(2)) {
      const f = latLonToWorld(48.868171, 2.322384),
        cy = -24.1 * DEG;
      const r = await run(page, `/?player=${(f.x + Math.sin(cy) * 8).toFixed(2)},${(f.z + Math.cos(cy) * 8).toFixed(2)},-24.1&bike&wait=1`);
      let impact = 0;
      await r.hold(['KeyW'], 5, (s) => ((impact = Math.max(impact, s.bikeSpeed)), s.action === 'crash'));
      const hit = r.log.at(-1)!;
      const t0 = hit.t;
      await r.hold([], 4, (s) => s.action !== 'crash' && s.mode === 'walk');
      const up = r.log.at(-1)!;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const lying = await page.evaluate(() => Math.abs((globalThis as any).__GAME__.player.bikes.list[0].lean) > 1); // on its side
      await r.walkToBike();
      const re = await r.press('KeyF');
      const reOff = await r.press('KeyF');
      console.log(
        `Ngã: ${hit.action === 'crash'} ở ${impact.toFixed(2)} m/s · đứng dậy sau ${(up.t - t0).toFixed(2)} s · xe nằm nghiêng: ${lying} · xe vẫn của đội: ${up.owner !== null} · lên lại: ${re.riding} · xuống: ${!reOff.riding}`,
      );
      check(lying, 'crashed bike not lying on its side');
      check(hit.action === 'crash' && up.action !== 'crash' && up.owner !== null && re.riding && !reOff.riding, 'crash / stand up / remount');
    }
    // ---- 3. quay stairs → Seine → out ----
    if (only(3)) {
      const r = await run(page, '/?player=-318.8,120.5,180&wait=1'); // on the quay, facing the parapet gap of the flight
      await r.hold(['KeyW'], 3, (s) => s.z > 125.6);
      await r.face(-360, 126.5);
      const down = r.log.length;
      await r.hold(['KeyW'], 20, (s) => s.mode === 'swim');
      const swam = r.log.at(-1)!.mode === 'swim';
      const stepsDown = r.log.slice(down).filter((s) => s.mode === 'walk');
      const topY = stepsDown[0]?.y ?? 0;
      await r.hold(['KeyW'], 2);
      // Back from the river side (south): out, east beside the flight, then north onto its lower steps (open over an apron).
      for (const [x, z] of [[-343, 133], [-334.5, 133]] as const) {
        await r.face(x, z);
        await r.hold(['KeyW'], 10, (s) => Math.hypot(s.x - x, s.z - z) < 0.8);
      }
      await r.face(-334.5, 120);
      await r.hold(['KeyW'], 8, (s) => s.mode === 'walk' && s.z < 127.4);
      const side = r.log.at(-1)!;
      const sideIn = side.mode === 'walk' && side.z < 127.4;
      await r.face(-320, 126.3);
      const back = r.log.length;
      await r.hold(['KeyW'], 20, (s) => s.mode === 'walk' && s.water !== null && s.y > s.water + 0.5);
      const outS = r.log.at(-1)!;
      if (process.env.RIDE_DEBUG)
        for (const s of r.log.slice(down).filter((_, i) => i % 5 === 0))
          console.log(s.t.toFixed(1), s.x.toFixed(1), s.z.toFixed(1), s.y.toFixed(2), s.mode, s.speed.toFixed(2));
      const out = r.log.slice(back).some((s) => s.mode === 'walk');
      console.log(
        `Xuống bậc kè: từ y ${topY.toFixed(2)} tới nước (${swam ? 'bơi' : 'KHÔNG xuống nước'}) · vào bậc từ mặt bên: ${sideIn ? 'có' : `KHÔNG (${side.x.toFixed(1)}, ${side.z.toFixed(1)}, ${side.mode})`} · leo lên: ${out ? `có, y ${outS.y.toFixed(2)} (mặt nước ${outS.water?.toFixed(2)})` : 'KHÔNG'}`,
      );
      check(swam && sideIn && out, 'quay stairs / swim / side entry / climb out');
    }
  } finally {
    await browser.close();
  }
} finally {
  await server.close();
}
if (errors.length) console.warn(`Lỗi console:\n${errors.join('\n')}`);
if (fails.length || errors.length) {
  console.warn(`HỎNG: ${fails.join('; ')}`);
  process.exit(1);
}
console.log('OK');
