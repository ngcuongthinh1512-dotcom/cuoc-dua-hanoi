// Durable Object tests without @cloudflare/vitest-pool-workers (0.22 needs Vitest 4, we run 5): wrangler's own
// createTestHarness starts workerd + the DO + SQLite in-process (docs/plans/phase6.md §2.1). Node ≥ 22 has a global
// WebSocket, so sockets need no package either.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createTestHarness } from 'wrangler';

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
    for (;;) {
      const m = await next<T>(Math.max(1, end - Date.now()));
      if (m.closed !== undefined || match(m)) return m;
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
