// Durable Object tests without @cloudflare/vitest-pool-workers (0.22 needs Vitest 4, we run 5): wrangler's own
// createTestHarness starts workerd + the DO + SQLite in-process (docs/plans/phase6.md §2.1). Node ≥ 22 has a global
// WebSocket, so sockets need no package either.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { latLonToWorld, worldToLatLon } from '@race/shared';
import { encodePose, type MoveMode } from '@race/shared/protocol';
import { createTestHarness } from 'wrangler';
import mini from '../../legs/test/mini.json';

export const TEST_PASSWORD = 'test-secret';

/** The Worker from the real wrangler.toml (bindings, migrations, compat date can't drift), with a test password:
 *  `secrets` overrides worker/.dev.vars, which an inline `config` + `vars` does not. */
export function raceHarness() {
  const root = join(import.meta.dirname, '../..');
  mkdirSync(join(root, '../client/dist'), { recursive: true }); // [assets] directory must exist (empty is fine)
  return createTestHarness({ root, workers: [{ configPath: 'wrangler.toml', secrets: { HOST_PASSWORD: TEST_PASSWORD } }] });
}

export type Harness = ReturnType<typeof raceHarness>;

export async function login(server: Harness, race: string, body: { code: string } | { host: string }) {
  const r = await server.fetch('/api/login', { method: 'POST', body: JSON.stringify({ race, ...body }) });
  return { status: r.status, body: (await r.json()) as { ok: boolean; token?: string; error?: string; team?: { id: string; slot: number } } };
}

/** A client socket with a message queue: `next()` resolves with the next parsed server message (or the close). */
export async function openSocket(server: Harness, race: string, token: string) {
  const { url } = await server.listen();
  const ws = new WebSocket(`${url.origin.replace(/^http/, 'ws')}/api/race/${race}/ws?token=${encodeURIComponent(token)}`);
  const queue: unknown[] = [];
  const waiters: ((m: unknown) => void)[] = [];
  const push = (m: unknown) => (waiters.length ? waiters.shift()!(m) : queue.push(m));
  // addEventListener: the worker tsconfig types `WebSocket` as the Workers one (no on* properties), Node's has both.
  ws.addEventListener('message', (e) => push(JSON.parse(String((e as MessageEvent).data))));
  ws.addEventListener('close', (e) => push({ closed: (e as CloseEvent).code }));
  ws.addEventListener('error', () => push({ closed: -1 }));
  /** Next server message (typed by the caller), or `{ closed: code }` when the socket closed. */
  const next = <T = Record<string, unknown>>(timeoutMs = 5000) =>
    new Promise<T & { closed?: number }>((resolve, reject) => {
      if (queue.length) return resolve(queue.shift() as T & { closed?: number });
      const t = setTimeout(() => reject(new Error('no message within ' + timeoutMs + ' ms')), timeoutMs);
      waiters.push((m) => (clearTimeout(t), resolve(m as T & { closed?: number })));
    });
  /** Skips messages until one matches (or the socket closes: that `{ closed }` is returned). */
  const until = async <T = Record<string, unknown>>(match: (m: any) => boolean, timeoutMs = 5000) => {
    const end = Date.now() + timeoutMs;
    const skipped: string[] = [];
    const err = new Error(); // created here: its stack names the test line that waited
    for (;;) {
      const m = await next<T>(Math.max(1, end - Date.now())).catch((e: Error) => {
        err.message = `${e.message}; skipped: ${skipped.slice(-8).join(' · ') || 'nothing'}`;
        throw err;
      });
      if (m.closed !== undefined || match(m)) return m;
      skipped.push(Array.isArray(m) ? 'tick' : JSON.stringify(m).slice(0, 120));
    }
  };
  /** Everything that arrives within `ms` (and was queued before). */
  const drain = async (ms: number): Promise<any[]> => {
    await sleep(ms);
    return queue.splice(0);
  };
  await new Promise<void>((resolve) => {
    ws.addEventListener('open', () => resolve(), { once: true });
    ws.addEventListener('close', () => resolve(), { once: true });
  });
  return { ws, next, until, drain, send: (m: unknown) => ws.send(typeof m === 'string' ? m : JSON.stringify(m)), close: () => ws.close() };
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Host socket + `n` new teams (codes, ids, slots) in `race`. */
export async function setupRace(server: Harness, race: string, n: number) {
  const hostToken = (await login(server, race, { host: TEST_PASSWORD })).body.token!;
  const host = await openSocket(server, race, hostToken);
  await host.until((m) => m.t === 'host.state');
  host.send({ t: 'host.createTeams', teams: Array.from({ length: n }, (_, i) => ({ name: `Đội ${i}`, colour: '#123456' })) });
  const st = await host.until<{ teams: { id: string; slot: number; code: string }[] }>((m) => m.t === 'host.state' && m.teams.length >= n);
  return { host, hostToken, teams: st.teams.slice(-n) };
}

/** Team login + socket, past its `welcome`. */
export async function joinTeam(server: Harness, race: string, code: string) {
  const token = (await login(server, race, { code })).body.token!;
  const s = await openSocket(server, race, token);
  const welcome = await s.until((m) => m.t === 'welcome');
  return { ...s, token, welcome };
}

/** Phase 7: the leg start (Pont de Bir-Hakeim) in world m: every leg here starts there. */
export const LEG_START = latLonToWorld(mini.start.lat, mini.start.lon);

/** Phase 7 test leg "near" (FAKE content, never a real leg): the `mini` steps — route, challenge elsewhere, walk-only
 *  route, detour (A at the point, B elsewhere), route to the Pit Stop, Pit Stop — with every point `gap` m east of the
 *  one before (radius 15, a rack 25 m south of each), the box revealed within 40 m (hidden beyond 50) and a fast foot
 *  speed so tests can walk between points in seconds (trust rate = footSpeed × 1.3 × 1.25). Load with host.leg {json}. */
export function nearLeg(gap = 60, footSpeed = 20) {
  const pt = (k: number, dz = 0) => {
    const { lat, lon } = worldToLatLon(LEG_START.x + gap * k, LEG_START.z + dz);
    return { lat: Math.round(lat * 1e7) / 1e7, lon: Math.round(lon * 1e7) / 1e7 };
  };
  const dest = (k: number, name: string) => ({ name, ...pt(k), radius: 15, bikeParking: pt(k, 25) });
  const leg = structuredClone(mini) as typeof mini & Record<string, unknown>;
  const [l1, t1, l2, d1, l3, ps] = leg.steps as any[];
  l1.destination = dest(1, 'Điểm 1 (GIẢ)');
  t1.task.location = dest(2, 'Nơi thử thách (GIẢ)');
  l2.destination = { ...dest(3, 'Điểm 3 (GIẢ)'), bikeParking: undefined };
  // ponytail: branch A stays at point 3 (L2's point), the Phase 7 layout the `race task` tests walk; Phase 8 track A moves
  // it to a place of its own (docs/plans/phase8.md §4: 3 = L2, 4 = A, 5 = B, 6 = Pit Stop) with its new harness tests
  d1.branches[0].task.location = dest(3, 'Nơi nhánh A (GIẢ)');
  d1.branches[1].task.location = dest(4, 'Nơi nhánh B (GIẢ)');
  l3.destination = ps.destination = dest(5, 'Thảm (GIẢ)');
  return {
    ...leg, id: 'near', title: 'Chặng gần (NỘI DUNG GIẢ)', boxReveal: { radius: 40, hysteresis: 10 }, movement: { footSpeed, bikeSpeedMultiplier: 1.3 },
    // Phase 8: 6 s after a "Phạt", 12 s after a branch switch (a leg:check warning: test legs only)
    penalties: { retryLockMinutes: 0.1, branchSwitchLockMinutes: 0.2 },
  };
}

/** World position of point k of nearLeg (0 = start, 1 = L1, 2 = T1, 3 = L2 / D1 branch A, 4 = branch B, 5 = Pit Stop). The
 *  `mini` it copies has T1 = host_approval (typed answer), D1 A = auto, D1 B = a photo task (free). */
export const nearPoint = (k: number, gap = 60) => {
  const { lat, lon } = worldToLatLon(LEG_START.x + gap * k, LEG_START.z);
  return latLonToWorld(Math.round(lat * 1e7) / 1e7, Math.round(lon * 1e7) / 1e7);
};

/** Walks a team socket from `from` to `to` (world m) with 5 Hz poses at `speed` m/s (under the trust rate of the leg);
 *  returns `to`. */
export async function walkTo(s: { send(m: unknown): void }, from: { x: number; z: number }, to: { x: number; z: number }, speed = 25, mode: MoveMode = 'walk') {
  const n = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.z - from.z) / (speed / 5)));
  for (let i = 1; i <= n; i++) {
    s.send(encodePose({ x: from.x + ((to.x - from.x) * i) / n, y: 0, z: from.z + ((to.z - from.z) * i) / n, yaw: 0, mode, action: 'none' }));
    await sleep(200);
  }
  return to;
}
