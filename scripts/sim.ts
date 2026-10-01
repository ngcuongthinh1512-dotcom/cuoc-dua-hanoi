// Phase 6 bots (docs/plans/phase6.md §6 D): `npm run sim -- --bots 3 --minutes 2 [--speedup 1] [--url http://localhost:8787]
// [--race <id>] [--password <HOST_PASSWORD>]`. Real WebSockets against the real Worker + Durable Object (wrangler's
// createTestHarness by default, or a running `npm run dev:api` with --url): the Host socket creates the teams, every bot
// logs in with its team code and walks an A* route on the real road graph at 0.9 × footSpeed, sending `pos` at 5 Hz.
// Prints message / byte counts and the Host counters so the estimate can be compared with the §9 budget.
// --speedup k plays k× faster (5k messages/s per bot, SAME messages per simulated minute; the server's speed check
// then flags the bots, and the server drops sockets beyond 15 msg/s, so k ≤ 3).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { RoadGraph, type RoadGraphFile, pathPolyline, shortestPath } from '@race/shared/graph';
import { encodePose, NET, type HostState, type PoseSample, type ServerMessage, type Welcome } from '@race/shared/protocol';

export interface SimOptions {
  url?: string; // running server (wrangler dev); default: in-process createTestHarness
  bots: number;
  seconds: number; // simulated seconds of walking
  speedup: number;
  race: string;
  password: string;
  rejoinGapMs: number; // bot 0 drops its socket this long (simulated) mid-run, then logs in again (§8.10)
  log: (s: string) => void;
}

export interface SimReport {
  bots: number;
  seconds: number;
  /** Messages the sim sent in total (bots' poses, claims, Host messages) and bytes up / down. */
  sent: number;
  bytesUp: number;
  bytesDown: number;
  counters: HostState['counters'];
  billableRequests: number;
  /** Billable requests per bot per simulated minute, and the §9 extrapolation (20 teams, 2 h, bots always moving = worst case). */
  perBotMinute: number;
  extrapolated2h20: number;
  rowsPerBotMinute: number;
  /** null = scenario not run / no bike service. */
  claim: { tried: number; ok: number } | null;
  rejoin: { ok: boolean; distance: number } | null;
  flagged: number;
}

const FILE = join(import.meta.dirname, '../shared/data/roadgraph.json');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** Seeded random in [0, 1) so a run is reproducible (mulberry32). */
function rng(seed: number) {
  return () => ((seed = (seed + 0x6d2b79f5) | 0), ((((t) => (t ^ (t >>> 14)) >>> 0)(Math.imul(seed ^ (seed >>> 15), 1 | seed)) / 4294967296)));
}

/** A socket with a message log: `until(pred)` resolves with the first matching message (already seen or not). */
async function openSocket(base: string, race: string, token: string, stats: { sent: number; up: number; down: number }) {
  const ws = new WebSocket(`${base.replace(/^http/, 'ws')}/api/race/${race}/ws?token=${encodeURIComponent(token)}`);
  const log: ServerMessage[] = [];
  const waiters: { pred: (m: ServerMessage) => boolean; resolve: (m: ServerMessage) => void }[] = [];
  let closed: number | null = null;
  ws.addEventListener('message', (e) => {
    const text = String((e as MessageEvent).data);
    stats.down += text.length;
    const m = JSON.parse(text) as ServerMessage;
    log.push(m);
    for (const w of waiters.filter((w) => w.pred(m))) (waiters.splice(waiters.indexOf(w), 1), w.resolve(m));
  });
  ws.addEventListener('close', (e) => (closed = (e as CloseEvent).code));
  await new Promise<void>((resolve, reject) => {
    ws.addEventListener('open', () => resolve(), { once: true });
    ws.addEventListener('error', () => reject(new Error('WebSocket: không mở được ' + base)), { once: true });
  });
  return {
    ws,
    log,
    get closed() {
      return closed;
    },
    send(m: unknown) {
      const text = JSON.stringify(m);
      stats.sent++;
      stats.up += text.length;
      if (ws.readyState === WebSocket.OPEN) ws.send(text);
    },
    until<T extends ServerMessage>(pred: (m: ServerMessage) => m is T, timeoutMs = 5000, from = 0): Promise<T> {
      const seen = log.slice(from).find(pred);
      if (seen) return Promise.resolve(seen);
      return new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('không có tin trả lời trong ' + timeoutMs + ' ms')), timeoutMs);
        waiters.push({ pred, resolve: (m) => (clearTimeout(t), resolve(m as T)) });
      });
    },
  };
}
type Sock = Awaited<ReturnType<typeof openSocket>>;
const isWelcome = (m: ServerMessage): m is Welcome => !Array.isArray(m) && m.t === 'welcome';
const isState = (m: ServerMessage): m is HostState => !Array.isArray(m) && m.t === 'host.state';

/** HTTP logins are counted by the Durable Object itself (counters.http), not as WebSocket messages. */
async function post(base: string, body: unknown) {
  const r = await fetch(`${base}/api/login`, { method: 'POST', body: JSON.stringify(body) });
  return (await r.json()) as { ok: boolean; token?: string; error?: string };
}

export async function runSim(opts: SimOptions): Promise<SimReport> {
  const { log } = opts;
  if (!(opts.speedup >= 1 && opts.speedup <= 3)) throw new Error('--speedup phải trong 1…3 (server đóng socket quá 15 tin/giây)');
  let harness: { close(): Promise<void> } | null = null;
  let base = opts.url?.replace(/\/$/, '');
  if (!base) {
    const { raceHarness } = await import('../worker/src/test/harness.ts');
    const server = raceHarness();
    base = (await server.listen()).url.origin;
    harness = server;
  }
  const stats = { sent: 0, up: 0, down: 0 };
  const sockets: Sock[] = [];
  try {
    // ── Host: teams and codes ──
    const host = await post(base, { race: opts.race, host: opts.password });
    if (!host.ok) throw new Error(`Đăng nhập Host thất bại: ${host.error}`);
    const hs = await openSocket(base, opts.race, host.token!, stats);
    sockets.push(hs);
    const existing = (await hs.until(isWelcome)).teams.length; // a pushed host.state may precede the reply: wait for the new teams
    hs.send({ t: 'host.createTeams', teams: Array.from({ length: opts.bots }, (_, i) => ({ name: `Bot ${i + 1}`, colour: '#2c6bd8', player: `bot${i + 1}` })) });
    const created = await hs.until((m): m is HostState => isState(m) && m.teams.length >= existing + opts.bots);
    const codes = created.teams.slice(existing, existing + opts.bots).map((t) => t.code);

    // ── Bots: login, socket, welcome ──
    const graph = RoadGraph.decode(JSON.parse(readFileSync(FILE, 'utf8')) as RoadGraphFile);
    const rand = rng(6);
    const bots = await Promise.all(
      codes.map(async (code, i) => {
        const connect = async () => {
          const l = await post(base!, { race: opts.race, code });
          if (!l.ok) throw new Error(`Bot ${i + 1}: đăng nhập thất bại (${l.error})`);
          const s = await openSocket(base!, opts.race, l.token!, stats);
          sockets.push(s);
          return { s, welcome: await s.until(isWelcome) };
        };
        return { i, connect, ...(await connect()), last: null as PoseSample | null, route: [] as number[] };
      }),
    );
    const foot = bots[0]!.welcome.movement.footSpeed;
    const speed = foot * 0.9;

    // ── Scenario: two bots claim the same bike in the same instant → at most one ok (SPEC §6.3) ──
    let claim: SimReport['claim'] = null;
    if (bots.length >= 2) {
      const [sx, sz] = [Math.round(rand() * 100), -Math.round(rand() * 100)];
      const pair = bots.slice(0, 2);
      for (const b of pair) b.s.send(encodePose({ x: sx, y: 0, z: sz, yaw: 0, mode: 'walk', action: 'none' }));
      const mark = pair[0]!.s.log.length;
      hs.send({ t: 'host.bike', op: 'add', x: sx, z: sz });
      // the new bike reaches every socket in a `bikes` broadcast (the bots hear it, no host.state needed)
      const bike = await pair[0]!.s
        .until((m): m is Extract<ServerMessage, { t: 'bikes' }> => !Array.isArray(m) && m.t === 'bikes' && m.list.some((b) => Math.hypot(b.x - sx, b.z - sz) < 5), 1500, mark)
        .then((m) => m.list.find((b) => Math.hypot(b.x - sx, b.z - sz) < 5)!)
        .catch(() => undefined);
      if (bike) {
        const marks = pair.map((b) => b.s.log.length);
        for (const b of pair) b.s.send({ t: 'bike', op: 'claim', id: bike.id });
        const answers = await Promise.all(pair.map((b, k) => b.s.until((m): m is Extract<ServerMessage, { t: 'bike'; op: 'claim' }> => !Array.isArray(m) && m.t === 'bike' && m.op === 'claim', 3000, marks[k]).catch(() => null)));
        claim = { tried: 2, ok: answers.filter((a) => a?.ok).length };
      } else log('Xe chung: không có dịch vụ xe (Track C chưa nối), bỏ qua thử nhận xe.');
    }

    // ── Walk: A* routes on the real graph, 5 Hz × speedup ──
    const stepMs = 1000 / NET.sendHz;
    const steps = Math.round(opts.seconds * NET.sendHz);
    const dt = stepMs / 1000;
    const planRoute = (x: number, z: number) => {
      for (let tries = 0; tries < 20; tries++) {
        const a = graph.nearestNode(x, z, 'walk');
        const ang = rand() * Math.PI * 2;
        const len = 500 + rand() * 400;
        const b = graph.nearestNode(x + Math.cos(ang) * len, z + Math.sin(ang) * len, 'walk');
        const p = a >= 0 && b >= 0 && a !== b ? shortestPath(graph, a, b, 'walk') : null;
        if (p && p.length > 100) return pathPolyline(graph, p);
      }
      throw new Error('Không tìm được tuyến đi bộ');
    };
    let rejoin: SimReport['rejoin'] = null;
    const start = Date.now();
    await Promise.all(
      bots.map(async (bot) => {
        let poly = planRoute((rand() - 0.5) * 300, (rand() - 0.5) * 300);
        let seg = 0;
        let [x, z] = [poly[0]!, poly[1]!];
        let yaw = 0;
        for (let k = 0; k < steps; k++) {
          // real-time pacing without drift: step k is due at start + k × stepMs / speedup
          const wait = start + (k * stepMs) / opts.speedup - Date.now();
          if (wait > 0) await sleep(wait);
          let left = speed * dt;
          while (left > 0) {
            const [tx, tz] = [poly[2 * seg + 2], poly[2 * seg + 3]];
            if (tx === undefined || tz === undefined) {
              poly = planRoute(x, z);
              (seg = 0), ([x, z] = [poly[0]!, poly[1]!]);
              continue;
            }
            const d = Math.hypot(tx - x, tz - z);
            if (d > 1e-6) yaw = wrap(Math.atan2(-(tx - x), -(tz - z))); // 0 = north (−Z), + = left
            if (d <= left) (x = tx), (z = tz), (left -= d), seg++;
            else (x += ((tx - x) / d) * left), (z += ((tz - z) / d) * left), (left = 0);
          }
          const pose: PoseSample = { x, y: 0, z, yaw, mode: 'walk', action: 'none' };
          bot.last = pose;
          bot.s.send(encodePose(pose));
          // §8.10: bot 0 drops for rejoinGapMs mid-run, logs in again; the welcome must hold the pose it left
          if (bot.i === 0 && k === Math.floor(steps / 2) && opts.rejoinGapMs > 0 && steps > 20) {
            await sleep(300); // let the last pose arrive
            bot.s.ws.close();
            await sleep(opts.rejoinGapMs / opts.speedup);
            const again = await bot.connect();
            const p = again.welcome.pose;
            const distance = p ? Math.hypot(p.x - pose.x, p.z - pose.z) : Infinity;
            rejoin = { ok: distance < 0.05, distance };
            bot.s = again.s;
          }
        }
      }),
    );

    // ── Host counters (estimated billing): ask once more after the bots are done ──
    // ponytail: the poll is an empty host.createTeams (no other message returns host.state on demand); costs 2 rows.
    // A state that already counts every message we sent (poll included) is the exact total; else the newest one.
    await sleep(500);
    const mark = hs.log.length;
    hs.send({ t: 'host.createTeams', teams: [] });
    const want = stats.sent;
    const final = await hs.until((m): m is HostState => isState(m) && m.counters.wsIn >= want, 3000, mark).catch(() => hs.log.slice(mark).filter(isState).at(-1)!);
    const c = final.counters;
    const minutes = opts.seconds / 60;
    const billable = c.http + c.alarms + Math.ceil(c.wsIn / 20);
    return {
      bots: opts.bots,
      seconds: opts.seconds,
      sent: stats.sent,
      bytesUp: stats.up,
      bytesDown: stats.down,
      counters: c,
      billableRequests: billable,
      perBotMinute: billable / opts.bots / minutes,
      // WebSocket traffic scales with time × teams; logins / upgrades happen once per team (a short run must not repeat them every minute)
      extrapolated2h20: Math.round((Math.ceil(c.wsIn / 20) / opts.bots / minutes) * 120 * 20 + (c.http / opts.bots) * 20),
      rowsPerBotMinute: c.rows / opts.bots / minutes,
      claim,
      rejoin,
      flagged: final.teams.filter((t) => t.flagged).length,
    };
  } finally {
    for (const s of sockets) s.ws.close();
    await harness?.close();
  }
}

function print(r: SimReport) {
  const n = (v: number, d = 0) => v.toLocaleString('vi-VN', { maximumFractionDigits: d });
  console.log(`\nSim: ${r.bots} bot, ${n(r.seconds)} s mô phỏng`);
  console.log(`  Tin gửi lên: ${n(r.sent)} (${n(r.bytesUp)} B) · tin nhận: ${n(r.bytesDown)} B`);
  console.log(`  Host đếm: wsIn ${n(r.counters.wsIn)} · wsOut ${n(r.counters.wsOut)} · http ${n(r.counters.http)} · alarm ${n(r.counters.alarms)} · dòng SQLite ${n(r.counters.rows)}`);
  console.log(`  Request tính phí ≈ ${n(r.billableRequests)} = ${n(r.perBotMinute, 1)} / bot / phút  →  20 đội × 2 giờ (luôn di chuyển) ≈ ${n(r.extrapolated2h20)} (ngân sách < 40 000)`);
  console.log(`  Dòng ghi ≈ ${n(r.rowsPerBotMinute, 1)} / bot / phút (ngân sách < 20 000 / cuộc đua)`);
  console.log(`  Nhận xe cùng lúc: ${r.claim ? `${r.claim.ok} / ${r.claim.tried} thành công (đúng: ≤ 1)` : 'bỏ qua'}`);
  console.log(`  Vào lại sau ngắt: ${r.rejoin ? (r.rejoin.ok ? 'đúng chỗ cũ' : `LỆCH ${r.rejoin.distance.toFixed(2)} m`) : 'bỏ qua'}`);
  console.log(`  Đội bị đánh dấu vượt tốc: ${r.flagged}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { values: v } = parseArgs({
    options: { bots: { type: 'string', default: '3' }, minutes: { type: 'string', default: '2' }, speedup: { type: 'string', default: '1' }, url: { type: 'string' }, race: { type: 'string' }, password: { type: 'string' } },
  });
  const report = await runSim({
    url: v.url,
    bots: Number(v.bots),
    seconds: Number(v.minutes) * 60,
    speedup: Number(v.speedup),
    race: v.race ?? `sim-${Date.now().toString(36)}`,
    password: v.password ?? process.env.HOST_PASSWORD ?? 'test-secret',
    rejoinGapMs: 10_000,
    log: console.log,
  });
  print(report);
  const bad = (report.claim && report.claim.ok > 1) || (report.rejoin && !report.rejoin.ok);
  process.exit(bad ? 1 : 0);
}
