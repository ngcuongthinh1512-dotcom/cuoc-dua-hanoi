// Phase 6 bots (docs/plans/phase6.md §6 D): `npm run sim -- --bots 3 --minutes 2 [--speedup 1] [--url http://localhost:8787]
// [--race <id>] [--password <HOST_PASSWORD>]`. Real WebSockets against the real Worker + Durable Object (wrangler's
// createTestHarness by default, or a running `npm run dev:api` with --url): the Host socket creates the teams, every bot
// logs in with its team code and walks an A* route on the real road graph at 0.9 × footSpeed, sending `pos` at 5 Hz.
// Prints message / byte counts and the Host counters so the estimate can be compared with the §9 budget.
// Phase 7: `--leg <id | file.json>` (e.g. `--leg mini`) plays the WHOLE leg instead: a Host bot loads it (host.leg), creates
// the teams, enters every team's start time ('now') and opens the race; each bot walks the A* route to every step's zone
// (5 Hz), opens the box / sends the task (the right answer from the leg file) / checks in at the Pit Stop, and the run ends
// when every team finished; the report adds the finish count, the ranking and the SQLite rows per team written while the race
// ran, without the shared snapshot / replay rows (budget legRowBudget: 110 up to 10 steps; measured in the in-process harness only).
// The walk is capped at the server's trusted-point rate (D4), so a full `mini` run takes ~6 min at --speedup 2.
// --speedup k plays k× faster (5k messages/s per bot, SAME messages per simulated minute; the server's speed check
// then flags the bots (expected, flag only), and the server closes a socket beyond 15 msg/s in a 1 s window, so k ≤ 2:
// 10 msg/s nominal leaves room for timer jitter; 15 would sit exactly on the limit).
import { existsSync, readFileSync } from 'node:fs';
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
  /** Phase 7: play a whole leg: `id` = a bundled leg (host.leg {id}), `json` = a leg file's text (host.leg {json}). Default: the Phase 6 random walk. */
  leg?: { id?: string; json?: string };
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
  /** Phase 7 `--leg` run: teams that checked in, ranking rows, the steps played; SQLite rows per team written while the race ran
   *  WITHOUT the shared snapshot / replay rows (`sharedRows`, they do not grow with the team count), vs `rowBudget`. Rows are only
   *  measured in the in-process harness (null with --url). null = random walk. */
  leg: { id: string; steps: number; finished: number; ranked: number; rowsPerTeam: number | null; sharedRows: number | null; rowBudget: number; refused: string[] } | null;
  flagged: number;
  speedup: number;
}

const FILE = join(import.meta.dirname, '../shared/data/roadgraph.json');

/** docs/plans/phase7.md §9: ≈ 100 rows per team for a 10-step leg (step_progress, teams.state, events, parking) + 10 %; longer legs
 *  scale per step. Snapshot / replay rows are budgeted apart (independent of the team count). */
export const legRowBudget = (steps: number) => 11 * Math.max(10, steps);
/** The leg run failed: a team did not finish / rank, or wrote more rows than the budget. */
export const legFailed = (r: SimReport) => !!r.leg && (r.leg.finished < r.bots || r.leg.ranked < r.bots || (r.leg.rowsPerTeam ?? 0) > r.leg.rowBudget);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** Seeded random in [0, 1) so a run is reproducible (mulberry32). */
function rng(seed: number) {
  return () => ((seed = (seed + 0x6d2b79f5) | 0), ((((t) => (t ^ (t >>> 14)) >>> 0)(Math.imul(seed ^ (seed >>> 15), 1 | seed)) / 4294967296)));
}

/** Every server message but the number-array ticks. */
type Msg = Exclude<ServerMessage, number[]>;

/** A socket with a message log: `until(pred)` resolves with the first matching message (already seen or not). */
async function openSocket(base: string, race: string, token: string, stats: { sent: number; up: number; down: number }) {
  const ws = new WebSocket(`${base.replace(/^http/, 'ws')}/api/race/${race}/ws?token=${encodeURIComponent(token)}`);
  const log: Msg[] = []; // everything but ticks (nobody waits for those; 5 Hz × peers would pile up in a long run)
  const waiters: { pred: (m: Msg) => boolean; resolve: (m: Msg) => void }[] = [];
  let closed: number | null = null;
  let bye = false; // we closed it ourselves
  ws.addEventListener('message', (e) => {
    const text = String((e as MessageEvent).data);
    stats.down += text.length;
    if (text === NET.pong) return; // answer to our keepalive
    const m = JSON.parse(text) as ServerMessage;
    if (Array.isArray(m)) return;
    log.push(m);
    for (const w of waiters.filter((w) => w.pred(m))) (waiters.splice(waiters.indexOf(w), 1), w.resolve(m));
  });
  await new Promise<void>((resolve, reject) => {
    ws.addEventListener('open', () => resolve(), { once: true });
    ws.addEventListener('error', () => reject(new Error('WebSocket: không mở được ' + base)), { once: true });
  });
  // Keepalive (docs/plans/phase6.md §3 decision 6): the server closes a socket silent for 30 s, the Host's included.
  // Auto-answered by the Durable Object, not billed, so not counted in `stats`.
  const ping = setInterval(() => ws.readyState === WebSocket.OPEN && ws.send(NET.ping), NET.pingMs);
  ws.addEventListener('close', (e) => ((closed = (e as CloseEvent).code), clearInterval(ping)));
  return {
    ws,
    log,
    /** Close code when the SERVER closed this socket (rate limit 4429, silent 4408, bad message 4400…), else null. */
    get dropped() {
      return bye ? null : closed;
    },
    close() {
      bye = true;
      ws.close();
    },
    send(m: unknown) {
      if (ws.readyState !== WebSocket.OPEN) return;
      const text = JSON.stringify(m);
      stats.sent++;
      stats.up += text.length;
      ws.send(text);
    },
    until<T extends Msg>(pred: (m: Msg) => m is T, timeoutMs = 5000, from = 0): Promise<T> {
      const seen = log.slice(from).find(pred);
      if (seen) return Promise.resolve(seen);
      return new Promise((resolve, reject) => {
        const w = { pred, resolve: (m: Msg) => (clearTimeout(t), resolve(m as T)) };
        const t = setTimeout(() => (waiters.splice(waiters.indexOf(w), 1), reject(new Error('không có tin trả lời trong ' + timeoutMs + ' ms'))), timeoutMs);
        waiters.push(w);
      });
    },
  };
}
export type Sock = Awaited<ReturnType<typeof openSocket>>;
const isWelcome = (m: Msg): m is Welcome => m.t === 'welcome';
const isState = (m: Msg): m is HostState => m.t === 'host.state';

/** HTTP logins are counted by the Durable Object itself (counters.http), not as WebSocket messages. */
async function post(base: string, body: unknown) {
  const r = await fetch(`${base}/api/login`, { method: 'POST', body: JSON.stringify(body) });
  return (await r.json()) as { ok: boolean; token?: string; error?: string };
}

type LegState = NonNullable<HostState['leg']>;
export type Bot = { i: number; s: Sock; welcome: Welcome };
type RaceMsg = Extract<Msg, { t: 'race' }>;

/** First right answer per task in a leg file's text: key "stepId" (challenge) or "stepId/branchId" (detour branch). Never invents one. */
export function answersOf(json: string): Map<string, string> {
  const out = new Map<string, string>();
  const leg = JSON.parse(json) as { steps?: { id: string; task?: { answers?: string[] }; branches?: { id: string; task?: { answers?: string[] } }[] }[] };
  for (const st of leg.steps ?? []) {
    const a = st.task?.answers?.[0];
    if (a !== undefined) out.set(st.id, a);
    for (const b of st.branches ?? []) if (b.task?.answers?.[0] !== undefined) out.set(`${st.id}/${b.id}`, b.task.answers[0]);
  }
  return out;
}

/** `--leg mini` → the bundled id and its file (for the answers); `--leg path/to/leg.json` → the file's text (host.leg {json}). */
export function legArg(arg: string): { id?: string; json?: string; file: string } {
  if (arg.endsWith('.json')) {
    const json = readFileSync(arg, 'utf8');
    return { json, file: arg };
  }
  const file = [`../worker/legs/test/${arg}.json`, `../worker/legs/${arg}.json`].map((f) => join(import.meta.dirname, f)).find(existsSync);
  if (!file) throw new Error(`Không tìm thấy chặng "${arg}" trong worker/legs/ hoặc worker/legs/test/`);
  return { id: arg, file };
}

/** One bot plays the whole leg (Phase 7): A* walk to each step's zone at 5 Hz × speedup, then the op of that step (open / task with the
 *  right answer / check-in; the route before the Pit Stop is done by entering the mat zone) until the server's `race` view moves on.
 *  Resolves with the check-in time (server ms). ponytail: a detour takes branch A / B alternately by bot (both exist in `mini`; the
 *  host_approval branch B is only passable while verifyTask is the Phase 7 stub, Phase 8 sim must pick answerable branches). */
export async function playLeg(bot: Bot, leg: LegState, answers: Map<string, string>, graph: RoadGraph, o: { speedup: number; deadline: number; refused: string[] }): Promise<number> {
  const { s: sock } = bot;
  const start = bot.welcome.start ?? bot.welcome.pose ?? { x: leg.start.x, z: leg.start.z, yaw: 0 };
  let [x, z, yaw] = [start.x, start.z, start.yaw];
  const { footSpeed, bikeSpeedMultiplier } = bot.welcome.movement;
  // sim m/s per tick-second; ×speedup = what the server sees, kept under its trusted-point rate (D4) so the bot is never held back
  const v = Math.min(footSpeed * 0.9, (0.95 * footSpeed * bikeSpeedMultiplier * NET.speedTolerance) / o.speedup);
  const stepMs = 1000 / NET.sendHz;
  const sendPose = () => sock.send(encodePose({ x, y: 0, z, yaw, mode: 'walk', action: 'none' }));
  const settleGapMs = 400;
  const fail = (what: string) => new Error(`Bot ${bot.i + 1}: ${what}`);

  const goto = async (tx: number, tz: number) => {
    const a = graph.nearestNode(x, z, 'walk');
    const b = graph.nearestNode(tx, tz, 'walk');
    const path = a >= 0 && b >= 0 && a !== b ? shortestPath(graph, a, b, 'walk') : null;
    const poly = [x, z, ...(path ? pathPolyline(graph, path) : []), tx, tz];
    let seg = 0;
    let due = Date.now() + stepMs / o.speedup;
    while (2 * seg + 3 < poly.length) {
      await sleep(due - Date.now());
      if (sock.dropped != null) throw fail(`server đã đóng socket (mã ${sock.dropped})`);
      let left = v * (stepMs / 1000);
      while (left > 0 && 2 * seg + 3 < poly.length) {
        const [nx, nz] = [poly[2 * seg + 2]!, poly[2 * seg + 3]!];
        const d = Math.hypot(nx - x, nz - z);
        if (d > 1e-6) yaw = wrap(Math.atan2(-(nx - x), -(nz - z)));
        if (d <= left) (x = nx), (z = nz), (left -= d), seg++;
        else (x += ((nx - x) / d) * left), (z += ((nz - z) / d) * left), (left = 0);
      }
      sendPose();
      if (Date.now() > o.deadline) throw fail('hết giờ chạy chặng khi đang đi');
      due = Math.max(due + stepMs / o.speedup, Date.now()); // never catch up (15 msg/s socket limit)
    }
  };
  const latest = () => {
    for (let k = sock.log.length - 1; k >= 0; k--) {
      const m = sock.log[k]!;
      if (m.t === 'race') return m.view;
    }
    return bot.welcome.view;
  };
  const moved = (id: string) => {
    const v = latest();
    return !v || v.finishAt !== null || (v.card !== null && v.card.step !== id);
  };
  /** Pose first (D4: the op is judged on the last valid pose), then the op; retry until the card moves on (the trusted point may lag behind). */
  const settle = async (id: string, op: Record<string, unknown> | null) => {
    for (let tries = 0; tries < 40 && Date.now() < o.deadline; tries++) {
      if (moved(id)) return;
      await sleep(settleGapMs / o.speedup); // pace: pose + op right after the last goto pose would break the 15 msg/s limit
      if (sock.dropped != null) throw fail(`server đã đóng socket (mã ${sock.dropped})`);
      const mark = sock.log.length;
      sendPose();
      if (op) sock.send(op);
      await sock.until((m): m is RaceMsg => m.t === 'race' && (m.view.finishAt !== null || (m.view.card !== null && m.view.card.step !== id)), 1500, mark).catch(() => null);
      for (const m of sock.log.slice(mark)) if (m.t === 'notice') o.refused.push(`${id}: ${m.code}`);
    }
    if (!moved(id)) throw fail(`kẹt ở bước ${id} (${o.refused.filter((r) => r.startsWith(id + ':')).slice(-3).join(', ') || 'không có phản hồi'})`);
  };

  if (bot.welcome.view?.card?.step !== leg.steps[0]?.id) throw fail(`mật thư đầu là "${bot.welcome.view?.card?.step}", chặng bắt đầu ở "${leg.steps[0]?.id}"`);
  sendPose();
  for (const [i, st] of leg.steps.entries()) {
    const next = leg.steps[i + 1];
    const place = st.type === 'detour' && st.branches?.length ? st.branches[bot.i % st.branches.length]! : st;
    await goto(place.x, place.z);
    const branch = st.type === 'detour' ? (place as { id: string }).id : undefined;
    const answer = answers.get(branch ? `${st.id}/${branch}` : st.id);
    const op =
      st.type === 'route_info' ? (next?.type === 'pit_stop' ? null : { t: 'race', op: 'open', step: st.id })
      : st.type === 'pit_stop' ? { t: 'race', op: 'checkin' }
      : { t: 'race', op: 'task', step: st.id, ...(branch && { branch }), ...(answer !== undefined && { answer }) };
    await settle(st.id, op);
  }
  return latest()!.finishAt!;
}

export async function runSim(opts: SimOptions): Promise<SimReport> {
  const { log } = opts;
  if (!(opts.speedup >= 1 && opts.speedup <= 2)) throw new Error('--speedup phải trong 1…2 (server đóng socket quá 15 tin/giây)');
  let harness: ReturnType<(typeof import('../worker/src/test/harness.ts'))['raceHarness']> | null = null;
  let base = opts.url?.replace(/\/$/, '');
  if (!base) {
    const { raceHarness } = await import('../worker/src/test/harness.ts');
    const server = raceHarness();
    base = (await server.listen()).url.origin;
    harness = server;
  }
  /** Snapshot + replay rows so far: one timed row for ALL teams together, budgeted apart from the per-team rows (plan §9,
   *  RaceRoom.race.test.ts). Only the in-process harness can read the Durable Object's SQLite: null with --url. */
  const sharedRows = async () => {
    if (!harness) return null;
    const sql = await harness.getWorker().getDurableObjectStorage('RaceRoom', { name: opts.race });
    const snap = (await sql.exec('SELECT data FROM snapshot')) as { data: string }[];
    const replay = (await sql.exec('SELECT COUNT(*) AS n FROM replay')) as { n: number }[];
    return ((JSON.parse(snap[0]?.data ?? '{}') as { seq?: number }).seq ?? 0) + (replay[0]?.n ?? 0);
  };
  const stats = { sent: 0, up: 0, down: 0 };
  const sockets: Sock[] = [];
  try {
    // ── Host: teams and codes ──
    const host = await post(base, { race: opts.race, host: opts.password });
    if (!host.ok) throw new Error(`Đăng nhập Host thất bại: ${host.error}`);
    const hs = await openSocket(base, opts.race, host.token!, stats);
    sockets.push(hs);
    const existing = (await hs.until(isWelcome)).teams.length; // a pushed host.state may precede the reply: wait for the new teams
    let answers = new Map<string, string>();
    if (opts.leg) {
      const json = opts.leg.json ?? readFileSync(legArg(opts.leg.id!).file, 'utf8');
      answers = answersOf(json);
      const mark = hs.log.length;
      hs.send({ t: 'host.leg', ...(opts.leg.json ? { json: opts.leg.json } : { id: opts.leg.id }) });
      const res = await hs.until((m): m is Extract<Msg, { t: 'host.legResult' }> => m.t === 'host.legResult', 10_000, mark);
      if (!res.ok) throw new Error('Nạp chặng thất bại: ' + res.issues.filter((i) => i.level === 'error').map((i) => `${i.where}: ${i.message}`).join('; '));
    }
    hs.send({ t: 'host.createTeams', teams: Array.from({ length: opts.bots }, (_, i) => ({ name: `Bot ${i + 1}`, colour: '#2c6bd8', player: `bot${i + 1}` })) });
    const created = await hs.until((m): m is HostState => isState(m) && m.teams.length >= existing + opts.bots);
    const codes = created.teams.slice(existing, existing + opts.bots).map((t) => t.code);
    // SPEC §17.12: the first clue is handed over outside the game, the team clock starts at the Host's start time
    if (opts.leg) for (const t of created.teams.slice(existing, existing + opts.bots)) hs.send({ t: 'host.team', op: 'startAt', team: t.id, at: 'now' });

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
        return { i, connect, ...(await connect()) };
      }),
    );
    const foot = bots[0]!.welcome.movement.footSpeed;
    const speed = foot * 0.9;

    // ── Routes: A* on the real graph, each from where the server trusts the bot to stand (D4: the trusted point follows a pose
    // only at walking speed, so a route starting ~100 m away is a refused teleport and a claim there is judged far away):
    // its welcome spot (leg start, spread by start order). Bots 0 and 1 meet halfway between theirs (the bike's spot). ──
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
    const spotOf = (b: Bot) => b.welcome.pose ?? b.welcome.start ?? { x: 0, z: 0 };
    const [m0, m1] = [spotOf(bots[0]!), spotOf(bots[1] ?? bots[0]!)];
    const meet = { x: (m0.x + m1.x) / 2, z: (m0.z + m1.z) / 2 }; // ≤ spreadMeters from both: within the time they were unseen
    const routes = opts.leg ? [] : bots.map((b) => {
      const s = b.i < 2 ? meet : spotOf(b);
      return [s.x, s.z, ...planRoute(s.x, s.z)];
    });

    // ── Scenario: two bots claim the same bike in the same instant → exactly one ok (SPEC §6.3) ──
    let claim: SimReport['claim'] = null;
    if (!opts.leg && bots.length >= 2) {
      const [sx, sz] = [routes[0]![0]!, routes[0]![1]!];
      const pair = bots.slice(0, 2);
      for (const b of pair) b.s.send(encodePose({ x: sx, y: 0, z: sz, yaw: 0, mode: 'walk', action: 'none' }));
      const mark = pair[0]!.s.log.length;
      hs.send({ t: 'host.bike', op: 'add', x: sx, z: sz });
      // the new bike reaches every socket in a `bikes` broadcast (the bots hear it, no host.state needed)
      const bike = await pair[0]!.s
        .until((m): m is Extract<Msg, { t: 'bikes' }> => m.t === 'bikes' && m.list.some((b) => Math.hypot(b.x - sx, b.z - sz) < 5), 1500, mark)
        .then((m) => m.list.find((b) => Math.hypot(b.x - sx, b.z - sz) < 5)!)
        .catch(() => undefined);
      if (bike) {
        const marks = pair.map((b) => b.s.log.length);
        for (const b of pair) b.s.send({ t: 'bike', op: 'claim', id: bike.id });
        const answers = await Promise.all(pair.map((b, k) => b.s.until((m): m is Extract<Msg, { t: 'bike'; op: 'claim' }> => m.t === 'bike' && m.op === 'claim', 3000, marks[k]).catch(() => null)));
        claim = { tried: 2, ok: answers.filter((a) => a?.ok).length };
      } else log('Xe chung: không có dịch vụ xe (Track C chưa nối), bỏ qua thử nhận xe.');
    }

    // ── Walk: 5 Hz × speedup ──
    const stepMs = 1000 / NET.sendHz;
    const steps = Math.round(opts.seconds * NET.sendHz);
    let seconds = opts.seconds;
    const refused: string[] = [];
    let legId = '';
    let atStart: { rows: number; shared: number } | null = null; // rows written before the race opened (in-process harness only)
    if (opts.leg) {
      hs.send({ t: 'host.race', op: 'start' });
      const run = await hs.until((m): m is HostState => isState(m) && m.status === 'running' && m.leg !== null, 10_000);
      const leg = run.leg!;
      legId = leg.id;
      const shared = await sharedRows(); // no pose yet: nothing timed is pending
      if (shared !== null) atStart = { rows: run.counters.rows, shared };
      const t0 = Date.now();
      await Promise.all(bots.map((b) => playLeg(b, leg, answers, graph, { speedup: opts.speedup, deadline: t0 + (opts.seconds * 1000) / opts.speedup, refused })));
      seconds = ((Date.now() - t0) / 1000) * opts.speedup;
      if (atStart) await sleep(NET.replayMs + 1000); // the last poses' snapshot / replay rows land up to NET.replayMs later
    }
    const dt = stepMs / 1000;
    let rejoin: SimReport['rejoin'] = null;
    if (!opts.leg) await Promise.all(
      bots.map(async (bot) => {
        let poly = routes[bot.i]!;
        let seg = 0;
        let [x, z] = [poly[0]!, poly[1]!];
        let yaw = 0;
        let due = Date.now();
        for (let k = 0; k < steps; k++) {
          await sleep(due - Date.now()); // negative = next tick
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
          bot.s.send(encodePose(pose));
          // §8.10: bot 0 drops for rejoinGapMs mid-run, logs in again; the welcome must hold the pose it left
          if (bot.i === 0 && k === Math.floor(steps / 2) && opts.rejoinGapMs > 0 && steps > 20) {
            // The server's `welcome.pose` is the last VALID pose; at --speedup > 1 the run-up is over the speed limit (flag
            // only). Stand still one speed window, then send the same pose once: the window holds just it, so it is valid.
            await sleep(NET.speedWindowMs + 200);
            bot.s.send(encodePose(pose));
            await sleep(300); // let it arrive
            bot.s.close();
            await sleep(opts.rejoinGapMs / opts.speedup);
            const again = await bot.connect();
            const p = again.welcome.pose;
            const distance = p ? Math.hypot(p.x - pose.x, p.z - pose.z) : Infinity;
            rejoin = { ok: distance < 0.05, distance };
            bot.s = again.s;
          }
          // Never catch up: after a stall or the rejoin gap a burst of poses would trip the server's 15 msg/s limit (4429).
          due = Math.max(due + stepMs / opts.speedup, Date.now());
        }
      }),
    );
    // A socket the SERVER closed (4429 rate limit, 4408 silent, 4400 bad message) means the numbers below are wrong.
    const dropped = sockets.filter((s) => s.dropped !== null);
    if (dropped.length) throw new Error(`Server đã đóng ${dropped.length} socket (mã ${dropped.map((s) => s.dropped).join(', ')}): kết quả không đáng tin`);

    // ── Host counters (estimated billing): ask once more after the bots are done ──
    // ponytail: the poll is an empty host.createTeams (no other message returns host.state on demand); costs 2 rows.
    // A state that already counts every message we sent (poll included) is the exact total; else the newest one.
    await sleep(500);
    const mark = hs.log.length;
    hs.send({ t: 'host.createTeams', teams: [] });
    const want = stats.sent;
    const final = await hs.until((m): m is HostState => isState(m) && m.counters.wsIn >= want, 3000, mark).catch(() => hs.log.slice(mark).filter(isState).at(-1));
    if (!final) throw new Error(`Host không nhận được host.state (socket ${hs.dropped === null ? 'còn mở' : 'bị server đóng, mã ' + hs.dropped})`);
    const c = final.counters;
    const minutes = seconds / 60;
    const shared = atStart && (await sharedRows())! - atStart.shared;
    const legSteps = final.leg?.steps.length ?? 0;
    const billable = c.http + c.alarms + Math.ceil(c.wsIn / 20);
    return {
      bots: opts.bots,
      seconds,
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
      leg: opts.leg ? {
        id: legId, steps: legSteps, finished: final.teams.filter((t) => t.finishAt !== null).length, ranked: final.ranking.length,
        rowsPerTeam: atStart && (c.rows - atStart.rows - shared!) / opts.bots, sharedRows: shared, rowBudget: legRowBudget(legSteps), refused,
      } : null,
      flagged: final.teams.filter((t) => t.flagged).length,
      speedup: opts.speedup,
    };
  } finally {
    for (const s of sockets) s.close();
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
  if (r.leg) {
    const rows = r.leg.rowsPerTeam === null
      ? 'dòng ghi / đội: chỉ đo được khi chạy không có --url'
      : `dòng ghi / đội ${n(r.leg.rowsPerTeam, 1)} (ngân sách ≤ ${r.leg.rowBudget}; không tính ${n(r.leg.sharedRows ?? 0)} dòng vị trí + replay chung cho mọi đội)`;
    console.log(`  Chặng ${r.leg.id} (${r.leg.steps} bước): ${r.leg.finished} / ${r.bots} đội về đích · xếp hạng ${r.leg.ranked} dòng · ${rows}${legFailed(r) ? ' ← LỖI' : ''}`);
    if (r.leg.refused.length) console.log(`  Thao tác bị từ chối (thử lại): ${r.leg.refused.length}, ví dụ ${r.leg.refused.slice(0, 3).join('; ')}`);
  }
  console.log(`  Nhận xe cùng lúc: ${r.claim ? `${r.claim.ok} / ${r.claim.tried} thành công (đúng: đúng 1)` : 'bỏ qua'}`);
  console.log(`  Vào lại sau ngắt: ${r.rejoin ? (r.rejoin.ok ? 'đúng chỗ cũ' : `LỆCH ${r.rejoin.distance.toFixed(2)} m`) : 'bỏ qua'}`);
  console.log(`  Đội bị đánh dấu vượt tốc: ${r.flagged}${r.speedup > 1 ? ' (tua nhanh: bot đi nhanh hơn thật, bị đánh dấu là bình thường)' : ''}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { values: v } = parseArgs({
    options: { bots: { type: 'string', default: '3' }, minutes: { type: 'string' }, speedup: { type: 'string', default: '1' }, url: { type: 'string' }, leg: { type: 'string' }, race: { type: 'string' }, password: { type: 'string' } },
  });
  const leg = v.leg ? legArg(v.leg) : undefined;
  const report = await runSim({
    url: v.url,
    bots: Number(v.bots),
    seconds: Number(v.minutes ?? (leg ? 30 : 2)) * 60, // with --leg: the cap for the whole run
    ...(leg && { leg: leg.json ? { json: leg.json } : { id: leg.id } }),
    speedup: Number(v.speedup),
    race: v.race ?? `sim-${Date.now().toString(36)}`,
    password: v.password ?? process.env.HOST_PASSWORD ?? 'test-secret',
    rejoinGapMs: 10_000,
    log: console.log,
  });
  print(report);
  const bad = (report.claim && report.claim.ok !== 1) || (report.rejoin && !report.rejoin.ok) || legFailed(report);
  process.exit(bad ? 1 : 0);
}
