// Phase 6 bots (docs/plans/phase6.md §6 D): `npm run sim -- --bots 3 --minutes 2 [--speedup 1] [--url http://localhost:8787]
// [--race <id>] [--password <HOST_PASSWORD>]` (`--help`: USAGE below; organisers: docs/LEG_FORMAT.md "Chơi thử tự động"). Real WebSockets against the real Worker + Durable Object (wrangler's
// createTestHarness by default, or a running `npm run dev:api` with --url): the Host socket creates the teams, every bot
// logs in with its team code and walks an A* route on the real road graph at 0.9 × footSpeed, sending `pos` at 5 Hz.
// Prints message / byte counts and the Host counters so the estimate can be compared with the §9 budget.
// Phase 7: `--leg <id | file.json>` (e.g. `--leg mini`) plays the WHOLE leg instead: a Host bot loads it (host.leg), creates
// the teams, enters every team's start time ('now') and opens the race; each bot walks the A* route to every step's zone
// (5 Hz), opens the box / plays the challenge / checks in at the Pit Stop, and the run ends when every team finished; the
// report adds the finish count, the ranking and the SQLite rows per team written while the race ran, without the shared
// snapshot / replay rows (budget legRowBudget: 160 up to 10 steps; measured in the in-process harness only).
// Phase 8 (docs/plans/phase8.md D18): a challenge → "Nhận thử thách" if it has a teaser, then the answer from the leg file
// (answers[0], else referenceAnswers[0]; '' for a photo task); a detour → the branch `i % n`; ONE bot switches branch right
// after choosing (waits out the countdown, walks to the other box, `open {branch}`); a Host bot approves every answer in
// host.state.queue, except the first answer of one bot at the first challenge, which it penalizes once (that bot waits out
// the countdown and answers again). The leg is loaded with its penalties shortened to 6 s / 12 s (SIM_PENALTIES) so a
// rehearsal does not wait 3 + 10 minutes. The walk is capped at the server's trusted-point rate (D4), so a full `mini` run
// takes ~6 min at --speedup 2.
// --speedup k plays k× faster (5k messages/s per bot, SAME messages per simulated minute; the server's speed check
// then flags the bots (expected, flag only), and the server closes a socket beyond 15 msg/s in a 1 s window, so k ≤ 2:
// 10 msg/s nominal leaves room for timer jitter; 15 would sit exactly on the limit).
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { RoadGraph, type RoadGraphFile, pathPolyline, shortestPath } from '@race/shared/graph';
import { encodePose, NET, type CardStatus, type ClueCard, type HostReview, type HostState, type PoseSample, type ServerMessage, type ServerNotice, type StepProgressView, type Welcome } from '@race/shared/protocol';

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
  leg: { id: string; steps: number; finished: number; ranked: number; rowsPerTeam: number | null; sharedRows: number | null; rowBudget: number; refused: string[]; stats: LegStats } | null;
  flagged: number;
  speedup: number;
}

const FILE = join(import.meta.dirname, '../shared/data/roadgraph.json');

/** docs/plans/phase8.md §9 / D18: ≈ 145 rows per team for a 10-step leg with 2 typed answers, a penalty and a branch switch
 *  (step_progress, teams.state, events, parking) + 10 %; longer legs scale per step (Phase 7: 11 × steps). Snapshot / replay
 *  rows are budgeted apart (independent of the team count). */
export const legRowBudget = (steps: number) => 16 * Math.max(10, steps);
/** The leg run failed: a team did not finish / rank, or wrote more rows than the budget. */
export const legFailed = (r: SimReport) => !!r.leg && (r.leg.finished < r.bots || r.leg.ranked < r.bots || (r.leg.rowsPerTeam ?? 0) > r.leg.rowBudget);
/** Notices that refuse a race op (Toasts.ts texts); the others only inform (clueNew = "Mật thư mới đã vào Sổ mật thư",
 *  approved / penalized / answerSent / answerWrong / branchChosen / branchSwitched = what the op did). */
const REFUSALS = new Set<ServerNotice>(['raceNotOpen', 'racePaused', 'raceOver', 'boxFar', 'boxRiding', 'boxOpened', 'taskFar', 'penaltyWait', 'taskNotStarted', 'answerPending', 'answerLocked', 'branchPending']);
/** The penalties a rehearsal runs with (6 s / 12 s): the leg's own 3 / 10 minutes would make a sim wait 13 minutes (D18). */
export const SIM_PENALTIES = { retryLockMinutes: 0.1, branchSwitchLockMinutes: 0.2 };
/** The leg file's text with the penalties shortened to SIM_PENALTIES (sent as host.leg {json}). A task's own retryLockMinutes stays. */
export function fastPenalties(json: string): string {
  const leg = JSON.parse(json) as { penalties?: Record<string, unknown> };
  leg.penalties = { ...leg.penalties, ...SIM_PENALTIES };
  return JSON.stringify(leg);
}
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

/** First right answer per task in a leg file's text: key "stepId" (challenge) or "stepId/branchId" (detour branch): answers[0],
 *  else referenceAnswers[0] (a host_approval task may have only those). Never invents one. */
export function answersOf(json: string): Map<string, string> {
  const out = new Map<string, string>();
  type T = { answers?: string[]; referenceAnswers?: string[] };
  const leg = JSON.parse(json) as { steps?: { id: string; task?: T; branches?: { id: string; task?: T }[] }[] };
  const first = (t?: T) => t?.answers?.[0] ?? t?.referenceAnswers?.[0];
  for (const st of leg.steps ?? []) {
    const a = first(st.task);
    if (a !== undefined) out.set(st.id, a);
    for (const b of st.branches ?? []) {
      const x = first(b.task);
      if (x !== undefined) out.set(`${st.id}/${b.id}`, x);
    }
  }
  return out;
}

/** The card state as the game client shows it at `now`: a countdown that has run out (+ slack) is over although the server only
 *  says so on the next change (D9: the client flips the card itself 1 s after lockedUntil). */
export function effectiveStatus(card: ClueCard, now: number, slackMs = 1000): CardStatus {
  if (card.lockedUntil !== null && now >= card.lockedUntil + slackMs) {
    if (card.status === 'locked') return 'active';
    if (card.status === 'switchLocked') return 'goToBranch';
  }
  return card.status;
}

/** What a bot is: its index, whether it switches branch once (right after choosing), and whether it already did. */
export interface BotRole { i: number; switches: boolean; switched: boolean }
/** One thing to send; `walk` = go to the chosen branch's place first; `switched` = this move is the branch switch. null = wait. */
export type BotMove = { op: Record<string, unknown>; walk?: true; switched?: true } | null;
/** D18, pure: what a bot does about the card of a challenge / detour it holds. teaser → accept; choose → branch `i % n`;
 *  goToBranch → the one switcher switches to the other branch, else walk there and `open {branch}`; active → the answer
 *  ('' for a photo task; "(bot) trả lời" when the leg file has none); pending / locked / switchLocked / done → wait. */
export function botMove(card: ClueCard, now: number, bot: BotRole, answers: Map<string, string>, slackMs = 1000): BotMove {
  const step = card.step;
  const ids = (card.branches ?? []).map((b) => b.id);
  switch (effectiveStatus(card, now, slackMs)) {
    case 'teaser': return { op: { t: 'race', op: 'accept', step } };
    case 'choose': return ids.length ? { op: { t: 'race', op: 'branch', step, branch: ids[bot.i % ids.length]! } } : null;
    case 'goToBranch': {
      const cur = card.branch ?? '';
      const other = ids[(ids.indexOf(cur) + 1) % ids.length];
      if (bot.switches && !bot.switched && other !== undefined && other !== cur) return { op: { t: 'race', op: 'branch', step, branch: other }, switched: true };
      return { op: { t: 'race', op: 'open', step, branch: cur }, walk: true };
    }
    case 'active': {
      const task = card.task ?? card.branches?.find((b) => b.id === card.branch)?.task;
      const text = task?.input === 'proof' ? '' : (answers.get(card.branch ? `${step}/${card.branch}` : step) ?? '(bot) trả lời');
      return { op: { t: 'race', op: 'answer', step, text } };
    }
    default: return null;
  }
}

/** The Host bot, pure: a host.review for every answer in `state.queue` (approve; `penalizeKey` = "team|step|id" → penalize once,
 *  with a note). `sent` (key → ms) keeps an answer from being decided twice; one still queued `retryMs` later is sent again
 *  (the server answers "đã được xử lý" to a repeat, so it is safe). */
export function reviewsFor(state: Pick<HostState, 'queue'>, sent: Map<string, number>, penalizeKey: string | null, now: number, retryMs = 5000): HostReview[] {
  const out: HostReview[] = [];
  for (const q of state.queue) {
    const key = `${q.team}|${q.step}|${q.id}`;
    if (now - (sent.get(key) ?? -Infinity) < retryMs) continue;
    sent.set(key, now);
    out.push(key === penalizeKey ? { t: 'host.review', team: q.team, step: q.step, id: q.id, op: 'penalize', note: '(bot) thử phạt' } : { t: 'host.review', team: q.team, step: q.step, id: q.id, op: 'approve' });
  }
  return out;
}

/** The Host bot's loop on the Host socket: every ~150 ms look at the newest host.state (one is pushed on every change) and decide
 *  what waits in its queue (reviewsFor). Runs while `running()`. */
export async function runHostBot(hs: Pick<Sock, 'log' | 'send'>, penalizeKey: string | null, running: () => boolean, pollMs = 150): Promise<void> {
  const sent = new Map<string, number>();
  let from = hs.log.length;
  let cur: HostState | undefined;
  while (running()) {
    cur = hs.log.slice(from).filter(isState).at(-1) ?? cur;
    from = hs.log.length;
    if (cur) for (const m of reviewsFor(cur, sent, penalizeKey, Date.now())) hs.send(m);
    await sleep(pollMs);
  }
}

/** What the server says happened (host.state.progress): answers by status and branch switches, the numbers of the report. */
export interface LegStats { answers: number; approved: number; penalized: number; wrong: number; switches: number }
export function legStats(progress: StepProgressView[]): LegStats {
  const all = progress.flatMap((p) => p.answers);
  const n = (s: string) => all.filter((a) => a.status === s).length;
  return { answers: all.length, approved: n('approved'), penalized: n('penalized'), wrong: n('wrong'), switches: progress.reduce((t, p) => t + p.branchSwitches, 0) };
}

/** `--leg mini` → the bundled id and its file (for the answers; `paris-demo-filled` = test/paris-demo.filled.json, the id the Host
 *  page lists); `--leg path/to/leg.json` → the file's text (host.leg {json}). */
export function legArg(arg: string): { id?: string; json?: string; file: string } {
  if (arg.endsWith('.json')) {
    if (!existsSync(arg)) throw new Error(`Không tìm thấy file chặng "${arg}" (kiểm tra đường dẫn; ví dụ --leg ~/Documents/chang-that/paris-1.json)`);
    return { json: readFileSync(arg, 'utf8'), file: arg };
  }
  const name = arg.replace(/-filled$/, '.filled');
  const file = [`../worker/legs/test/${name}.json`, `../worker/legs/${name}.json`].map((f) => join(import.meta.dirname, f)).find(existsSync);
  if (!file) throw new Error(`Không tìm thấy chặng "${arg}" trong worker/legs/ hoặc worker/legs/test/`);
  return { id: arg, file };
}

export interface PlayOptions {
  speedup: number;
  deadline: number;
  refused: string[];
  /** This bot switches branch once, right after choosing (D18). */
  switches?: boolean;
  /** ms after `lockedUntil` the bot treats a countdown as over (the client's lockEndSlackMs, D9). */
  lockSlackMs?: number;
  /** A step whose card did not change for this long (a countdown running does not count) fails the bot: the Host bot is dead / a refusal repeats. */
  stallMs?: number;
}

/** One bot plays the whole leg (docs/plans/phase8.md D18): A* walk to each step's zone at 5 Hz × speedup; then, until the
 *  server's `race` view moves on, route: `open` (the route before the Pit Stop is done by entering the mat zone), Pit Stop:
 *  `checkin`, challenge / detour: whatever `botMove` says for the card it holds (accept / answer / branch / switch / `open
 *  {branch}`; D8: none of those but `open` needs a position, so each is sent when the card asks), waiting out the Host's
 *  decision and the countdowns. Resolves with the check-in time (server ms). Needs the server's clock to match this machine's
 *  (a countdown is judged on `Date.now()`); a bot that answers a moment early is refused `answerLocked` and tries again. */
export async function playLeg(bot: Bot, leg: LegState, answers: Map<string, string>, graph: RoadGraph, o: PlayOptions): Promise<number> {
  const { s: sock } = bot;
  const start = bot.welcome.start ?? bot.welcome.pose ?? { x: leg.start.x, z: leg.start.z, yaw: 0 };
  let [x, z, yaw] = [start.x, start.z, start.yaw];
  const { footSpeed, bikeSpeedMultiplier } = bot.welcome.movement;
  // sim m/s per tick-second; ×speedup = what the server sees, kept under its trusted-point rate (D4) so the bot is never held back
  const v = Math.min(footSpeed * 0.9, (0.95 * footSpeed * bikeSpeedMultiplier * NET.speedTolerance) / o.speedup);
  const stepMs = 1000 / NET.sendHz;
  const sendPose = () => sock.send(encodePose({ x, y: 0, z, yaw, mode: 'walk', action: 'none' }));
  const settleGapMs = 400;
  const slack = o.lockSlackMs ?? 1000;
  const stall = o.stallMs ?? 120_000;
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
  /** Pose first when the op is judged on the position (D4: open / checkin), then the op; wait for the server's `race` answer. A
   *  refused op comes back as a notice only: the caller's loop looks at the card again. */
  const act = async (op: Record<string, unknown> | null, withPose: boolean) => {
    await sleep(settleGapMs / o.speedup); // pace: pose + op right after the last goto pose would break the 15 msg/s limit
    if (sock.dropped != null) throw fail(`server đã đóng socket (mã ${sock.dropped})`);
    const mark = sock.log.length;
    if (withPose || !op) sendPose();
    if (op) sock.send(op);
    await sock.until((m): m is RaceMsg => m.t === 'race', 1500, mark).catch(() => null);
    for (const m of sock.log.slice(mark)) if (m.t === 'notice' && REFUSALS.has(m.code)) o.refused.push(`${(op?.step as string | undefined) ?? '-'}: ${m.code}`);
  };

  if (bot.welcome.view?.card?.step !== leg.steps[0]?.id) throw fail(`mật thư đầu là "${bot.welcome.view?.card?.step}", chặng bắt đầu ở "${leg.steps[0]?.id}"`);
  sendPose();
  for (const [i, st] of leg.steps.entries()) {
    const next = leg.steps[i + 1];
    if (st.type !== 'detour') await goto(st.x, st.z); // a detour: the choice needs no place, the branch's place comes after it
    const role: BotRole = { i: bot.i, switches: !!o.switches, switched: false };
    let seen = latest();
    let changedAt = Date.now();
    while (!moved(st.id)) {
      if (Date.now() > o.deadline) throw fail(`hết giờ chạy chặng ở bước ${st.id}`);
      const card = latest()?.card;
      if (latest() !== seen || (card?.lockedUntil != null && Date.now() < card.lockedUntil + slack)) (seen = latest()), (changedAt = Date.now());
      if (Date.now() - changedAt > stall) throw fail(`kẹt ở bước ${st.id} (${o.refused.filter((r) => r.startsWith(st.id + ':')).slice(-3).join(', ') || 'không có phản hồi'})`);
      if (st.type === 'route_info' || st.type === 'pit_stop' || !card) {
        await act(st.type === 'pit_stop' ? { t: 'race', op: 'checkin' } : st.type === 'route_info' && next?.type !== 'pit_stop' ? { t: 'race', op: 'open', step: st.id } : null, true);
        continue;
      }
      const move = botMove(card, Date.now(), role, answers, slack);
      if (!move) {
        await sleep(settleGapMs / o.speedup); // the Host decides / a countdown runs: nothing to send
        continue;
      }
      if (move.walk) {
        const b = st.branches?.find((x) => x.id === card.branch);
        if (b) await goto(b.x, b.z);
      }
      if (move.switched) role.switched = true;
      await act(move.op, move.op.op === 'open');
    }
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
      hs.send({ t: 'host.leg', json: fastPenalties(json) }); // the same leg, penalties 6 s / 12 s (a bundled one too: host.leg {id} cannot change them)
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
      // D18 roles: the bot after the first one is penalized once at the first challenge; the third (else the last) switches branch once
      const penalized = created.teams[existing + Math.min(1, opts.bots - 1)]!.id;
      const switcher = Math.min(2, opts.bots - 1);
      const firstChallenge = leg.steps.find((s) => s.type === 'challenge')?.id;
      const penalizeKey = firstChallenge ? `${penalized}|${firstChallenge}|1` : null;
      let hostBotOn = true;
      const hostDone = runHostBot(hs, penalizeKey, () => hostBotOn);
      const t0 = Date.now();
      try {
        await Promise.all(bots.map((b) => playLeg(b, leg, answers, graph, { speedup: opts.speedup, deadline: t0 + (opts.seconds * 1000) / opts.speedup, refused, switches: b.i === switcher })));
      } finally {
        hostBotOn = false;
        await hostDone;
      }
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
        rowsPerTeam: atStart && (c.rows - atStart.rows - shared!) / opts.bots, sharedRows: shared, rowBudget: legRowBudget(legSteps), refused, stats: legStats(final.progress),
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
    const s = r.leg.stats;
    console.log(`  Thử thách: ${s.answers} câu trả lời · Host duyệt ${s.approved}, phạt ${s.penalized}${s.wrong ? `, sai (tự chấm) ${s.wrong}` : ''} · đổi nhánh ${s.switches} lần (phạt rút còn ${SIM_PENALTIES.retryLockMinutes * 60} s / ${SIM_PENALTIES.branchSwitchLockMinutes * 60} s)`);
    if (r.leg.refused.length) console.log(`  Thao tác bị từ chối (thử lại): ${r.leg.refused.length}, ví dụ ${r.leg.refused.slice(0, 3).join('; ')}`);
  }
  console.log(`  Nhận xe cùng lúc: ${r.claim ? `${r.claim.ok} / ${r.claim.tried} thành công (đúng: đúng 1)` : 'bỏ qua'}`);
  console.log(`  Vào lại sau ngắt: ${r.rejoin ? (r.rejoin.ok ? 'đúng chỗ cũ' : `LỆCH ${r.rejoin.distance.toFixed(2)} m`) : 'bỏ qua'}`);
  console.log(`  Đội bị đánh dấu vượt tốc: ${r.flagged}${r.speedup > 1 ? ' (tua nhanh: bot đi nhanh hơn thật, bị đánh dấu là bình thường)' : ''}`);
}

export const USAGE = `Cách dùng: npm run sim -- [tùy chọn]   (bot chơi thử qua WebSocket thật; hướng dẫn: docs/LEG_FORMAT.md mục "Chơi thử tự động")
  --leg <mã | file.json>  chơi HẾT một chặng: mã chặng có sẵn (mini, paris-demo-filled, paris-demo) hoặc đường dẫn file chặng
                          (vd. --leg ~/Documents/chang-that/paris-1.json). Không có --leg: bot đi bộ ngẫu nhiên (đo lưu lượng).
                          Bot nhận thử thách, gõ đáp án (đáp án hoặc đáp án tham khảo trong file; nhánh ảnh: "đã gửi bài"), chọn nhánh,
                          một bot đổi nhánh một lần; một Host bot tự duyệt mọi bài chờ và phạt một lần (bài đầu của bot thứ 2 ở thử
                          thách đầu). Phạt được rút còn 6 giây / 12 giây để chạy nhanh (chặng thật vẫn giữ 3 / 10 phút khi đua).
  --bots <n>              số đội bot (mặc định 3)
  --speedup <1…2>         tua nhanh (mặc định 1; 2 = nhanh gấp đôi, tối đa vì máy chủ ngắt quá 15 tin/giây)
  --minutes <n>           thời gian chạy tối đa, phút mô phỏng (mặc định 2; với --leg: 30)
  --url <địa chỉ>         dùng máy chủ đang chạy (vd. http://localhost:8787 của npm run dev:api) thay vì máy chủ tạm trong máy
  --race <mã>             mã cuộc đua (mặc định sim-<giờ>, luôn là cuộc đua mới)
  --password <mật khẩu>   mật khẩu Host khi dùng --url (mặc định HOST_PASSWORD hoặc test-secret; xem README)
  --help                  in hướng dẫn này`;

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let v: Record<string, string | boolean | undefined>;
  try {
    v = parseArgs({
      options: { bots: { type: 'string', default: '3' }, minutes: { type: 'string' }, speedup: { type: 'string', default: '1' }, url: { type: 'string' }, leg: { type: 'string' }, race: { type: 'string' }, password: { type: 'string' }, help: { type: 'boolean', short: 'h' } },
    }).values;
  } catch (e) {
    console.error(`Tùy chọn không hợp lệ (${e instanceof Error ? e.message.split('.')[0] : String(e)})\n\n${USAGE}`);
    process.exit(2);
  }
  if (v.help) {
    console.log(USAGE);
    process.exit(0);
  }
  const str = (k: string) => (typeof v[k] === 'string' ? v[k] : undefined);
  let leg: ReturnType<typeof legArg> | undefined;
  try {
    leg = str('leg') ? legArg(str('leg')!) : undefined;
  } catch (e) {
    console.error(`${e instanceof Error ? e.message : String(e)}\n\n${USAGE}`); // Vietnamese, no stack trace (verify3 m7)
    process.exit(2);
  }
  const report = await runSim({
    url: str('url'),
    bots: Number(str('bots')),
    seconds: Number(str('minutes') ?? (leg ? 30 : 2)) * 60, // with --leg: the cap for the whole run
    ...(leg && { leg: leg.json ? { json: leg.json } : { id: leg.id } }),
    speedup: Number(str('speedup')),
    race: str('race') ?? `sim-${Date.now().toString(36)}`,
    password: str('password') ?? process.env.HOST_PASSWORD ?? 'test-secret',
    rejoinGapMs: 10_000,
    log: console.log,
  });
  print(report);
  const bad = (report.claim && report.claim.ok !== 1) || (report.rejoin && !report.rejoin.ok) || legFailed(report);
  process.exit(bad ? 1 : 0);
}
