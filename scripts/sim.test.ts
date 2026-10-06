import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RoadGraph, type RoadGraphFile } from '@race/shared/graph';
import { branchZone, normalizeAnswer, parseLeg, stepZones, type Task } from '@race/shared/leg';
import { decodePose, type CardStatus, type ClueCard, type HostReview, type HostState, type RaceView, type ServerMessage, type ServerNotice, type StepProgressView, type Welcome } from '@race/shared/protocol';
import { describe, expect, it } from 'vitest';
import { answersOf, type Bot, botMove, louvreAnswersOf, louvreMove, effectiveStatus, fastPenalties, legArg, legFailed, legRowBudget, legStats, playLeg, reviewsFor, runHostBot, runSim, scenarioFailed, SIM_PENALTIES } from './sim.ts';

// Real workerd + Durable Object (createTestHarness) and real WebSockets: 3 bots walk 30 simulated seconds on the A* road graph.
// speedup 2 (10 msg/s per bot) leaves margin under the server's 15 msg/s socket limit (1 s window) and is the CLI maximum;
// runSim throws when the server closes any bot / Host socket (4429 rate limit, 4408 silent), so a green run means none was.
describe('sim bots (docs/plans/phase6.md §6 D)', () => {
  it('3 bots, 30 s: no errors, counters match what was sent, rejoin lands on the old spot, two claims on one bike give one winner', { timeout: 90_000 }, async () => {
    const r = await runSim({ bots: 3, seconds: 30, speedup: 2, rejoinGapMs: 3000, race: 'sim-test', password: 'test-secret', log: () => {} });
    // every message the sim sent was counted by the Durable Object (±10 %: e.g. a pose in flight to a closing socket)
    expect(r.counters.wsIn).toBeGreaterThan(r.sent * 0.9);
    expect(r.counters.wsIn).toBeLessThan(r.sent * 1.1);
    // 3 bots × 30 s × 5 Hz poses are the bulk of it
    expect(r.sent).toBeGreaterThan(3 * 30 * 5 * 0.9);
    // §9 formula: billable = http + alarms + ⌈wsIn / 20⌉, and the per-bot-minute figure is that / bots / minutes
    expect(r.billableRequests).toBe(r.counters.http + r.counters.alarms + Math.ceil(r.counters.wsIn / 20));
    // docs/plans/phase6.md §9: 20 teams × 5 Hz × 7 200 s ÷ 20 = 36 000 requests when always moving (± 10 %)
    expect(r.extrapolated2h20).toBeGreaterThan(36_000 * 0.9);
    expect(r.extrapolated2h20).toBeLessThan(36_000 * 1.1);
    expect(r.perBotMinute).toBeCloseTo(r.billableRequests / 3 / 0.5, 6);
    expect(r.rejoin).toMatchObject({ ok: true });
    // null = no bike service in this build; once Track C is merged two claims on one bike must give exactly one winner
    expect(r.claim === null || r.claim.ok === 1).toBe(true);
  });

  it('speedup above 2 is refused (the server drops sockets above 15 msg/s)', async () => {
    await expect(runSim({ bots: 1, seconds: 1, speedup: 3, rejoinGapMs: 0, race: 'sim-x', password: 'x', log: () => {} })).rejects.toThrow('speedup');
  });
});

// Phase 7 (docs/plans/phase7.md track E): bots play a whole leg. `mini` is ~2.4 km (≈ 6 min real time at the trusted-point speed), so the
// test squeezes the same steps, branches, answers and Pit Stop onto a straight line NW of the leg's own start (35 m apart, FAKE
// content as in mini). Leg 2: in Paris that line was the Bir-Hakeim bridge; from Largo do Pagode da Barra it runs over the harbour
// (the test server has no terrain: the bots walk the A* route to the nearest node, then straight to the zone), kept for fidelity.
const mini = readFileSync(join(import.meta.dirname, '../worker/legs/test/mini.json'), 'utf8');
function compactMini(): string {
  const spots = new Map<string, number>();
  const at = (o: { lat: number; lon: number }) => {
    const k = `${o.lat},${o.lon}`;
    if (!spots.has(k)) spots.set(k, spots.size);
    return spots.get(k)!;
  };
  const leg = JSON.parse(mini);
  const s0 = { lat: leg.start.lat as number, lon: leg.start.lon as number }; // spot 0 = the start, wherever mini.json puts it
  // NW along the bridge from the start: 35 m per spot
  const put = (o: { lat: number; lon: number }, i: number, extra = 0) => ((o.lat = s0.lat + 0.000262 * i + extra), (o.lon = s0.lon - 0.000263 * i + extra));
  const walk = (o: unknown): void => {
    if (Array.isArray(o)) return o.forEach(walk);
    if (!o || typeof o !== 'object') return;
    const r = o as Record<string, unknown> & { lat?: number; lon?: number };
    if (typeof r.lat === 'number' && typeof r.lon === 'number') {
      const i = at(r as { lat: number; lon: number });
      const parking = r.bikeParking as { lat: number; lon: number } | undefined;
      put(r as { lat: number; lon: number }, i);
      if (parking) put(parking, i, 0.00005);
      return;
    }
    Object.values(r).forEach(walk);
  };
  walk(leg);
  return JSON.stringify(leg);
}

/** A card with only what the test sets. */
const card = (o: Partial<ClueCard> = {}): ClueCard => ({ step: 'D1', type: 'detour', label: 'Lựa chọn kép', text: '', media: [], status: 'active', lockedUntil: null, lockKind: null, answers: [], receivedAt: 0, completedAt: null, ...o });
const branches = [{ id: 'A', name: 'Tính', summary: '' }, { id: 'B', name: 'Ảnh', summary: '' }];
const taskOf = (input: 'text' | 'proof') => ({ title: '', description: '', media: [], kind: input === 'proof' ? 'free' : 'answer', verification: 'host_approval', input, proofInstruction: '', timeLimitMinutes: null }) as unknown as NonNullable<ClueCard['task']>;
const role = (i: number, switches = false, switched = false) => ({ i, switches, switched });
const ANS = new Map([['T1', '42'], ['D1/A', '7'], ['D1/B', '(GIẢ) Ảnh']]);

describe('bot moves (docs/plans/phase8.md D18, pure)', () => {
  it('a countdown that ran out (+ slack) is over although the server said nothing: locked → active, switchLocked → goToBranch', () => {
    const until = 10_000;
    expect(effectiveStatus(card({ status: 'locked', lockedUntil: until }), until + 999)).toBe('locked');
    expect(effectiveStatus(card({ status: 'locked', lockedUntil: until }), until + 1000)).toBe('active');
    expect(effectiveStatus(card({ status: 'switchLocked', lockedUntil: until }), until + 1000)).toBe('goToBranch');
    expect(effectiveStatus(card({ status: 'switchLocked', lockedUntil: until }), until + 50, 50)).toBe('goToBranch'); // a shorter slack
    expect(effectiveStatus(card({ status: 'pending' }), 1e12)).toBe('pending'); // only the Host ends this
    expect(effectiveStatus(card({ status: 'teaser' }), 1e12)).toBe('teaser');
  });

  it('teaser → accept; choose → branch i % n; active → the answer from the leg file, "" for a photo task, a filler when the file has none', () => {
    expect(botMove(card({ step: 'T1', type: 'challenge', status: 'teaser' }), 0, role(0), ANS)).toEqual({ op: { t: 'race', op: 'accept', step: 'T1' } });
    const choose = card({ status: 'choose', branches });
    expect([0, 1, 2, 3].map((i) => (botMove(choose, 0, role(i), ANS)!.op as { branch: string }).branch)).toEqual(['A', 'B', 'A', 'B']);
    expect(botMove(card({ step: 'T1', type: 'challenge', status: 'active', task: taskOf('text') }), 0, role(0), ANS)).toEqual({ op: { t: 'race', op: 'answer', step: 'T1', text: '42' } });
    expect(botMove(card({ step: 'T9', type: 'challenge', status: 'active', task: taskOf('text') }), 0, role(0), ANS)!.op).toMatchObject({ text: '(bot) trả lời' });
    const inA = card({ status: 'active', branch: 'A', branches: [{ ...branches[0]!, task: taskOf('text') }, branches[1]!], branchOpened: true });
    expect(botMove(inA, 0, role(0), ANS)!.op).toMatchObject({ op: 'answer', text: '7' });
    const inB = card({ status: 'active', branch: 'B', branches: [branches[0]!, { ...branches[1]!, task: taskOf('proof') }], branchOpened: true });
    expect(botMove(inB, 0, role(1), ANS)!.op).toMatchObject({ op: 'answer', text: '' }); // the reference text of B is for the Host, never typed
  });

  it('goToBranch: the one switcher switches ONCE to the other branch, everybody else (and the switcher after) walks there and opens', () => {
    const go = card({ status: 'goToBranch', branch: 'A', branches });
    expect(botMove(go, 0, role(0), ANS)).toEqual({ op: { t: 'race', op: 'open', step: 'D1', branch: 'A' }, walk: true });
    expect(botMove(go, 0, role(2, true), ANS)).toEqual({ op: { t: 'race', op: 'branch', step: 'D1', branch: 'B' }, switched: true });
    expect(botMove(card({ status: 'goToBranch', branch: 'B', branches }), 0, role(2, true, true), ANS)).toEqual({ op: { t: 'race', op: 'open', step: 'D1', branch: 'B' }, walk: true });
    // after the switch the card says switchLocked: wait, then (countdown over) go to the new box
    const locked = card({ status: 'switchLocked', branch: 'B', branches, lockedUntil: 5000, lockKind: 'switch' });
    expect(botMove(locked, 5500, role(2, true, true), ANS)).toBeNull();
    expect(botMove(locked, 6000, role(2, true, true), ANS)).toMatchObject({ op: { op: 'open', branch: 'B' }, walk: true });
  });

  it('waits while the Host decides or a penalty runs, answers again when it is over; nothing to do when done', () => {
    expect(botMove(card({ step: 'T1', type: 'challenge', status: 'pending' }), 0, role(0), ANS)).toBeNull();
    const locked = card({ step: 'T1', type: 'challenge', status: 'locked', lockedUntil: 6000, lockKind: 'retry', task: taskOf('text') });
    expect(botMove(locked, 6500, role(0), ANS)).toBeNull();
    expect(botMove(locked, 7000, role(0), ANS)!.op).toMatchObject({ op: 'answer', text: '42' });
    expect(botMove(card({ status: 'done' }), 0, role(0), ANS)).toBeNull();
  });
});

describe('Host bot (D18, pure)', () => {
  const q = (team: string, step: string, id: number) => ({ team, step, label: step, branch: null, id, text: '42', at: 0, reference: [], note: '', lockMinutes: 0.1 });

  it('approves everything in the queue, penalizes the one key once (with a note), and does not decide twice', () => {
    const sent = new Map<string, number>();
    const state = { queue: [q('t0', 'T1', 1), q('t1', 'T1', 1)] };
    expect(reviewsFor(state, sent, 't1|T1|1', 1000)).toEqual([
      { t: 'host.review', team: 't0', step: 'T1', id: 1, op: 'approve' },
      { t: 'host.review', team: 't1', step: 'T1', id: 1, op: 'penalize', note: '(bot) thử phạt' },
    ]);
    expect(reviewsFor(state, sent, 't1|T1|1', 2000)).toEqual([]); // still queued 1 s later: not sent again
    // the bot's second answer is a new item (id 2): approved, not penalized
    expect(reviewsFor({ queue: [q('t1', 'T1', 2)] }, sent, 't1|T1|1', 3000)).toEqual([{ t: 'host.review', team: 't1', step: 'T1', id: 2, op: 'approve' }]);
    // an item still queued after retryMs (the decision got lost) goes out again; the server answers "đã được xử lý" to a repeat
    expect(reviewsFor(state, sent, 't1|T1|1', 6001).map((m) => m.op)).toEqual(['approve', 'penalize']);
    expect(reviewsFor({ queue: [] }, sent, null, 1e9)).toEqual([]);
  });

  it('every message it makes passes the server codec', async () => {
    const { isClientMessage } = await import('@race/shared/protocol');
    for (const m of reviewsFor({ queue: [q('t0', 'T1', 1), q('t1', 'D1', 2)] }, new Map(), 't1|D1|2', 0)) expect(isClientMessage(m, 'host')).toBe(true);
  });
});

describe('sim report numbers (D18)', () => {
  const row = (team: string, step: string, answers: StepProgressView['answers'], branchSwitches = 0): StepProgressView => ({
    team, step, arrivedAt: null, openedAt: null, startedAt: null, completedAt: null, branch: null, submittedAt: null, decidedAt: null, rejections: 0, wrongAnswers: 0, branchSwitches, branchOpenedAt: null, lockedUntil: null, pending: false, approvalWaitSeconds: 0, answers, note: '', picks: [], hintCorrect: null,
  });
  const a = (id: number, status: StepProgressView['answers'][number]['status']) => ({ id, text: 'x', at: 0, status, branch: null });

  it('answers, approvals, penalties and switches are read from host.state.progress', () => {
    const progress = [row('t0', 'T1', [a(1, 'approved')]), row('t1', 'T1', [a(1, 'penalized'), a(2, 'approved')]), row('t2', 'D1', [a(1, 'correct'), a(2, 'wrong')], 1), row('t1', 'D1', [], 2)];
    expect(legStats(progress)).toEqual({ answers: 5, approved: 2, penalized: 1, wrong: 1, correct: 1, louvre: false, louvreWrong: 0, louvreCorrect: 0, switches: 3 });
    expect(legStats([])).toEqual({ answers: 0, approved: 0, penalized: 0, wrong: 0, correct: 0, louvre: false, louvreWrong: 0, louvreCorrect: 0, switches: 0 });
    expect(legStats([row('t0', 'T3', [a(1, 'wrong'), a(2, 'correct')]), row('t0', 'T1', [a(1, 'correct')])], new Set(['T3']))).toMatchObject({ louvre: true, correct: 2, louvreWrong: 1, louvreCorrect: 1 });
  });

  it('the row budget is 16 per step (a 10-step leg: 160), never fewer than 10 steps', () => {
    expect([legRowBudget(4), legRowBudget(10), legRowBudget(12)]).toEqual([160, 160, 192]);
  });

  it('the leg is sent with 6 s / 12 s penalties and nothing else changed (a bundled leg too)', () => {
    const out = JSON.parse(fastPenalties(mini)) as { penalties: Record<string, number>; steps: unknown[]; id: string };
    expect(out.penalties).toMatchObject(SIM_PENALTIES);
    expect(out.penalties).toEqual({ ...(JSON.parse(mini).penalties ?? {}), retryLockMinutes: 0.1, branchSwitchLockMinutes: 0.2 });
    expect(out.id).toBe('mini');
    expect(out.steps).toEqual(JSON.parse(mini).steps);
    expect(parseLeg(JSON.parse(fastPenalties(mini))).ok).toBe(true); // a warning ("phạt dưới 1 phút"), not an error
  });
});

// ── a stand-in for ONE team's engine + the Host (statuses by the plan's D5 / D6 table), so the bots run without workerd.
// The real engine is track A's: the full-leg run below plays against it once it is merged. ──
function fakeRace(legJson: string, o: { teamId: string; lockMs: number }) {
  const r = parseLeg(JSON.parse(legJson));
  if (!r.ok) throw new Error('leg');
  const leg = r.leg;
  const zones = stepZones(leg);
  const botLog: ServerMessage[] = [];
  const hostLog: ServerMessage[] = [];
  const ops: Record<string, unknown>[] = [];
  const reviews: HostReview[] = [];
  const fresh = () => ({ started: false, branch: null as string | null, opened: false, lockedUntil: null as number | null, pending: null as { id: number; text: string } | null, nextId: 1 });
  let step = 0, switches = 0, finished = false, at = { x: 0, z: 0 }, row = fresh();
  const inZone = (z: { x: number; z: number; r: number }) => Math.hypot(at.x - z.x, at.z - z.z) <= z.r;
  const locked = () => row.lockedUntil !== null && row.lockedUntil > Date.now();
  const taskNow = (): Task | undefined => {
    const st = leg.steps[step]!;
    return st.type === 'challenge' ? st.task : st.type === 'detour' ? st.branches.find((b) => b.id === row.branch)?.task : undefined;
  };
  const status = (): CardStatus => {
    const st = leg.steps[step]!;
    if (st.type === 'detour' && !row.opened) return row.branch === null ? 'choose' : locked() ? 'switchLocked' : 'goToBranch';
    if (st.type !== 'challenge' && st.type !== 'detour') return 'active';
    if (row.pending) return 'pending';
    if (locked()) return 'locked';
    return st.type === 'challenge' && st.teaser !== '' && !row.started ? 'teaser' : 'active';
  };
  const view = (): RaceView => {
    const st = leg.steps[step]!;
    const s = status();
    const tv = (t: Task) => ({ input: t.kind === 'free' ? 'proof' : 'text' });
    const c = {
      step: st.id, type: st.type, label: st.label, text: '', media: [], status: s, answers: [], receivedAt: 0, completedAt: null,
      lockedUntil: s === 'locked' || s === 'switchLocked' ? row.lockedUntil : null,
      lockKind: s === 'locked' ? 'retry' : s === 'switchLocked' ? 'switch' : null,
      ...(st.type === 'challenge' && s !== 'teaser' ? { task: tv(st.task) } : {}),
      ...(st.type === 'detour' ? { branch: row.branch, branches: st.branches.map((b) => ({ id: b.id, name: b.name, summary: '', ...(row.opened && b.id === row.branch ? { task: tv(b.task) } : {}) })) } : {}),
    } as unknown as ClueCard;
    return { status: 'running', finishAt: finished ? 2 : null, penaltyMinutes: 0, card: c, checkinAt: null, result: null };
  };
  const push = () => botLog.push({ t: 'race', view: view() });
  const pushHost = () => {
    const st = leg.steps[step]!;
    const queue = row.pending ? [{ team: o.teamId, step: st.id, label: st.label, branch: row.branch, id: row.pending.id, text: row.pending.text, at: Date.now(), reference: [], note: '', lockMinutes: 0.1 }] : [];
    hostLog.push({ t: 'host.state', queue } as unknown as ServerMessage);
  };
  const complete = () => ((step += 1), (row = fresh()), push());
  const settle = () => {
    while (!finished && leg.steps[step]!.type === 'route_info' && leg.steps[step + 1]?.type === 'pit_stop' && inZone(zones[step]!)) complete(); // the route before the Pit Stop: entering the mat zone
  };
  const notice = (code: ServerNotice) => botLog.push({ t: 'notice', code });
  const until = async (pred: (m: ServerMessage) => boolean, _t = 0, from = 0) => {
    for (let k = 0; k < 400; k++) {
      const hit = botLog.slice(from).find(pred);
      if (hit) return hit;
      await new Promise((res) => setTimeout(res, 5));
    }
    throw new Error('timeout');
  };
  const sock = {
    log: botLog,
    dropped: null,
    until,
    send(m: unknown) {
      const pose = decodePose(m);
      if (pose) return void ((at = pose), settle());
      const op = m as { op: string; step?: string; branch?: string; text?: string };
      ops.push(op);
      const st = leg.steps[step]!;
      if (op.op === 'checkin') {
        if (st.type === 'pit_stop' && inZone(zones[step]!)) ((finished = true), push());
        else notice('boxFar');
        return;
      }
      if (op.step !== st.id) return;
      const s = status();
      if (op.op === 'open') {
        if (st.type === 'route_info') return inZone(zones[step]!) ? (complete(), notice('clueNew')) : notice('boxFar');
        if (st.type === 'detour' && s === 'goToBranch' && op.branch === row.branch) return inZone(branchZone(leg, zones, step, op.branch!)!) ? ((row.opened = true), push()) : notice('boxFar');
      } else if (op.op === 'accept') {
        if (s === 'teaser') ((row.started = true), push());
      } else if (op.op === 'branch' && st.type === 'detour') {
        if (row.branch === null) ((row.branch = op.branch!), push());
        else if (op.branch !== row.branch && s !== 'pending') ((row.branch = op.branch!), (row.opened = false), switches++, (row.lockedUntil = Date.now() + o.lockMs), push());
      } else if (op.op === 'answer') {
        if (s === 'pending') return notice('answerPending');
        if (s === 'locked') return notice('answerLocked');
        const t = taskNow();
        if (s !== 'active' || !t) return notice('taskNotStarted');
        if (t.verification === 'host_approval') ((row.pending = { id: row.nextId++, text: op.text ?? '' }), push(), pushHost());
        else if (t.answers.some((a) => normalizeAnswer(a) === normalizeAnswer(op.text ?? ''))) (complete(), notice('approved'));
        else notice('answerWrong');
      }
    },
  };
  const host = {
    log: hostLog,
    send(m: unknown) {
      const rv = m as HostReview;
      reviews.push(rv);
      if (!row.pending || row.pending.id !== rv.id) return;
      row.pending = null;
      if (rv.op === 'approve') complete();
      else ((row.lockedUntil = Date.now() + o.lockMs), push());
      pushHost();
    },
  };
  return { leg, sock: sock as never as Bot['s'], host: host as never as Parameters<typeof runHostBot>[0], ops, reviews, switches: () => switches, state: () => ({ step, finished }) };
}

describe('sim bots against a stand-in engine + Host (no workerd)', () => {
  it('3 bots play the compacted leg: accept, answers, one penalty, a photo branch, one branch switch, all reach the Pit Stop', { timeout: 120_000 }, async () => {
    const json = compactMini();
    const graph = RoadGraph.decode(JSON.parse(readFileSync(join(import.meta.dirname, '../shared/data/roadgraph.json'), 'utf8')) as RoadGraphFile);
    const runs = [0, 1, 2].map((i) => fakeRace(json, { teamId: `t${i}`, lockMs: 120 }));
    const leg = runs[0]!.leg;
    const zones = stepZones(leg);
    const legState = {
      id: 'mini', title: '', timezone: 'Asia/Ho_Chi_Minh', start: { x: zones[0]!.x, z: zones[0]!.z }, bundled: [], issues: [], vehicles: leg.vehicles,
      steps: leg.steps.map((s, i) => ({
        id: s.id, type: s.type, label: s.label, name: '', x: zones[i]!.x, z: zones[i]!.z, r: zones[i]!.r, proof: false,
        ...(s.type === 'detour' ? { branches: s.branches.map((b) => ({ id: b.id, name: b.name, ...(({ x, z, r }) => ({ x, z, r }))(branchZone(leg, zones, i, b.id)!), proof: b.task.kind === 'free' })) } : {}),
      })),
      media: [], penalties: { retryLockMinutes: 0.1, branchSwitchLockMinutes: 0.2 }, stuckMinutes: 45,
    } as NonNullable<HostState['leg']>;
    const welcome = { movement: { footSpeed: 400, bikeSpeedMultiplier: 1.3 }, start: { x: legState.start.x, z: legState.start.z, yaw: 0 }, pose: null, view: { card: { step: 'L1' }, finishAt: null } } as unknown as Welcome;
    let on = true;
    const hostLoops = runs.map((f, i) => runHostBot(f.host, i === 1 ? 't1|T1|1' : null, () => on, 10)); // bot 1: its first answer at T1 is penalized
    const refused: string[] = [];
    let finishes: number[];
    try {
      finishes = await Promise.all(runs.map((f, i) => playLeg({ i, s: f.sock, welcome }, legState, answersOf(json), graph, { speedup: 1, deadline: Date.now() + 100_000, refused, switches: i === 2, lockSlackMs: 30, stallMs: 15_000 })));
    } finally {
      on = false;
      await Promise.all(hostLoops);
    }
    expect(finishes).toEqual([2, 2, 2]);
    expect(runs.map((f) => f.state())).toEqual([{ step: 5, finished: true }, { step: 5, finished: true }, { step: 5, finished: true }]);
    // what each bot sent besides routes and poses: [op, step, branch | text]
    const sent = (f: ReturnType<typeof fakeRace>) => f.ops.filter((o) => ['accept', 'answer', 'branch'].includes(o.op as string) || (o.op === 'open' && o.branch)).map((o) => [o.op, o.step, o.branch ?? o.text]);
    expect(sent(runs[0]!)).toEqual([['accept', 'T1', undefined], ['answer', 'T1', '42'], ['branch', 'D1', 'A'], ['open', 'D1', 'A'], ['answer', 'D1', '7']]); // typed branch: auto, no Host
    expect(sent(runs[1]!)).toEqual([['accept', 'T1', undefined], ['answer', 'T1', '42'], ['answer', 'T1', '42'], ['branch', 'D1', 'B'], ['open', 'D1', 'B'], ['answer', 'D1', '']]); // penalized once, then a photo branch ("đã gửi bài")
    expect(sent(runs[2]!)).toEqual([['accept', 'T1', undefined], ['answer', 'T1', '42'], ['branch', 'D1', 'A'], ['branch', 'D1', 'B'], ['open', 'D1', 'B'], ['answer', 'D1', '']]); // chose A, switched to B once
    expect(runs.map((f) => f.switches())).toEqual([0, 0, 1]);
    // the Host bot: penalty (with its note) then approvals for bot 1, approvals only for bot 2; bot 0's typed branch needs no Host
    expect(runs[1]!.reviews.map((m) => m.op)).toEqual(['penalize', 'approve', 'approve']);
    expect(runs[1]!.reviews[0]).toMatchObject({ note: '(bot) thử phạt', step: 'T1', id: 1 });
    expect(runs[2]!.reviews.map((m) => m.op)).toEqual(['approve', 'approve']);
    expect(runs[0]!.reviews.map((m) => m.op)).toEqual(['approve']); // T1 only
    // the clue notice is news, not a refusal (organiser review); the stand-in refuses nothing the bots should not have tried
    expect(refused.filter((r) => r.endsWith('clueNew'))).toEqual([]);
    expect(refused).toEqual([]);
  });

  it('a bot whose card never changes (no Host to decide) fails with the step, not after the whole run time', { timeout: 30_000 }, async () => {
    const json = compactMini();
    const graph = RoadGraph.decode(JSON.parse(readFileSync(join(import.meta.dirname, '../shared/data/roadgraph.json'), 'utf8')) as RoadGraphFile);
    const f = fakeRace(json, { teamId: 't0', lockMs: 120 });
    const zones = stepZones(f.leg);
    const legState = { start: { x: zones[0]!.x, z: zones[0]!.z }, steps: f.leg.steps.map((s, i) => ({ id: s.id, type: s.type, x: zones[i]!.x, z: zones[i]!.z, r: zones[i]!.r })) } as unknown as NonNullable<HostState['leg']>;
    const welcome = { movement: { footSpeed: 400, bikeSpeedMultiplier: 1.3 }, start: { x: zones[0]!.x, z: zones[0]!.z, yaw: 0 }, pose: null, view: { card: { step: 'L1' }, finishAt: null } } as unknown as Welcome;
    await expect(playLeg({ i: 0, s: f.sock, welcome }, legState, answersOf(json), graph, { speedup: 1, deadline: Date.now() + 25_000, refused: [], lockSlackMs: 30, stallMs: 1500 })).rejects.toThrow(/Bot 1: kẹt ở bước T1/);
  });
});

describe('sim --leg (Phase 7 / 8)', () => {
  it('reads the right answers from the leg file: answers[0], else referenceAnswers[0], nothing invented', () => {
    const a = answersOf(mini);
    expect(a.get('T1')).toBe('42'); // answers[0] wins over referenceAnswers
    expect(a.get('D1/A')).toBe('7');
    expect(a.get('D1/B')).toBe('(GIẢ) Ảnh thấy rõ mặt tiền thư viện phía sau'); // only referenceAnswers: kept (the bot types "" for a photo task anyway)
    expect(a.has('L1')).toBe(false);
    const only = JSON.stringify({ steps: [{ id: 'X', task: { referenceAnswers: ['tham khảo'] } }, { id: 'Y', task: {} }] });
    expect([...answersOf(only)]).toEqual([['X', 'tham khảo']]);
  });

  it('--leg <id> finds the test leg file; unknown id says so', () => {
    expect(legArg('mini')).toMatchObject({ id: 'mini' });
    // the id the Host page lists → its file test/macao-demo.filled.json (organiser review: "Không tìm thấy chặng")
    expect(legArg('macao-demo-filled')).toMatchObject({ id: 'macao-demo-filled', file: expect.stringMatching(/worker\/legs\/test\/macao-demo\.filled\.json$/) });
    expect(legArg('macao-demo').file).toMatch(/worker\/legs\/macao-demo\.json$/);
    expect(() => legArg('khong-co')).toThrow('khong-co');
    expect(() => legArg('/khong/co/chang.json')).toThrow('Không tìm thấy file chặng "/khong/co/chang.json"');
  });

  it('CLI: an unknown --leg id or a missing file prints a Vietnamese line + the usage, exit 2, no stack trace (verify3 m7)', () => {
    const root = join(import.meta.dirname, '..');
    for (const leg of ['khong-co', '/khong/co/chang.json']) {
      const r = spawnSync(join(root, 'node_modules/.bin/tsx'), [join(root, 'scripts/sim.ts'), '--leg', leg], { encoding: 'utf8' });
      expect(r.status).toBe(2);
      expect(r.stderr).toMatch(/^Không tìm thấy (chặng|file chặng) "[^\n]+\n\nCách dùng: npm run sim/);
      expect(r.stderr).not.toMatch(/\n\s+at |ENOENT/);
    }
  }, 20_000);

  it('the compacted leg stays a valid leg with the same steps', () => {
    const r = parseLeg(JSON.parse(compactMini()));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.leg.steps.map((s) => s.id)).toEqual(['L1', 'T1', 'L2', 'D1', 'L3', 'PS']);
  });

  // Phase 8 integration (docs/plans/phase8.md §6 Track E, critic N9c): the bots against track A's real engine.
  it('3 bots finish the whole leg: all checked in, ranking has 3 rows, ≥ 1 penalty and ≥ 1 branch switch in the report, ≤ 160 SQLite rows per team', { timeout: 300_000 }, async () => {
    const r = await runSim({ bots: 3, seconds: 600, speedup: 2, rejoinGapMs: 0, race: 'sim-leg', password: 'test-secret', log: () => {}, leg: { json: compactMini() } });
    expect(r.leg).toMatchObject({ id: 'mini', steps: 6, finished: 3, ranked: 3, out: 1, rowBudget: 160 }); // SPEC §17.23: the last of the 3 bots is out
    expect(r.leg!.stats.penalized).toBeGreaterThanOrEqual(1);
    expect(r.leg!.stats.switches).toBeGreaterThanOrEqual(1);
    expect(r.leg!.stats.answers).toBeGreaterThanOrEqual(7); // 3 × T1 + 1 retry + 3 × D1
    // per team = rows written while the race ran minus the shared snapshot / replay rows (they do not grow with the team count)
    expect(r.leg!.sharedRows).toBeGreaterThan(0);
    expect(r.leg!.rowsPerTeam).toBeGreaterThan(10);
    expect(r.leg!.rowsPerTeam! * 3 + r.leg!.sharedRows!).toBeLessThanOrEqual(r.counters.rows);
    expect(r.leg!.rowsPerTeam).toBeLessThanOrEqual(r.leg!.rowBudget);
    expect(legFailed(r)).toBe(false);
  });

  // Phase 11: the Host-bot scenarios on the compacted leg (6 bots: undo bot 4's Duyệt, Cho qua bot 5, clear a red flag (bot 1 walks above
  // the speed limit on purpose: since SPEC §17.29 speedup 2 alone no longer flags anybody), bot 6 never checks in → the Host ends the race → BỊ LOẠI) and the organiser's export; budget for 8 teams within SPEC §3.
  it('--full with 6 bots: Hoàn tác, Cho qua, Xóa cờ, Kết thúc → out, export ok; 8-team budget under the pro-rata limits', { timeout: 300_000 }, async () => {
    const r = await runSim({ bots: 6, seconds: 600, speedup: 2, rejoinGapMs: 0, race: 'sim-full', password: 'test-secret', log: () => {}, leg: { json: compactMini() }, full: true, teams: 8 });
    expect(r.leg).toMatchObject({ id: 'mini', finished: 5, ranked: 6 });
    expect(r.leg!.scenario).toMatchObject({ undone: 1, passed: 1, ended: true });
    expect(r.leg!.scenario!.cleared).toBeGreaterThanOrEqual(1);
    expect(r.leg!.export).toMatchObject({ ok: true, teams: 6 });
    expect(r.leg!.export.events).toBeGreaterThan(20);
    expect(r.budget).toMatchObject({ teams: 8, requestLimit: 16_000, rowLimit: 8_000, ok: true });
    expect(legFailed(r)).toBe(false);
    expect(scenarioFailed({ undone: 0, passed: 1, cleared: 1, flagged: 1, ended: true })).toBe(true);
    expect(scenarioFailed({ undone: 1, passed: 1, cleared: 0, flagged: 0, ended: true })).toBe(false); // nobody flagged: nothing to clear
  });

  it('a long leg is not reported as LỖI for the shared rows: the budget counts per-team race rows (organiser review)', () => {
    // the organiser's 4-step leg, 2 bots, 826 s at speedup 2: 324 rows = 2 × 40 race rows + 244 snapshot / replay rows (413 s real,
    // one every 2 s + one every 10 s); the old check divided all 324 by 2 → "162 > 110 ← LỖI"
    const leg = { id: 'x', steps: 4, finished: 2, ranked: 2, out: 1, rowsPerTeam: 40, sharedRows: 244, rowBudget: legRowBudget(4), refused: [], stats: legStats([]), scenario: null, export: { ok: true, why: [], teams: 2, events: 0, steps: 0 } };
    const r = { bots: 2, counters: { wsIn: 0, wsOut: 0, http: 0, alarms: 0, rows: 324 }, leg } as unknown as Parameters<typeof legFailed>[0];
    expect(legFailed(r)).toBe(false);
    expect(legFailed({ ...r, leg: { ...leg, rowsPerTeam: 161 } })).toBe(true);
    expect(legFailed({ ...r, leg: { ...leg, finished: 1 } })).toBe(true);
    expect(legFailed({ ...r, leg: { ...leg, rowsPerTeam: null } })).toBe(false); // --url: not measured, not a failure
  });
});

// ── Phase 8B track D: the louvre bot ──
describe('louvre bot (phase8b §I, pure)', () => {
  const louvreLeg = readFileSync(join(import.meta.dirname, '../worker/legs/test/louvre.json'), 'utf8');
  const RIGHT = louvreAnswersOf(louvreLeg).get('T3')!;
  const arts = Array.from({ length: 23 }, (_, k) => ({ id: `art-${String(k + 1).padStart(2, '0')}`, type: 'painting' as const, image: '' }));
  const lv = (o: Partial<NonNullable<NonNullable<ClueCard['task']>['louvre']>> = {}) => ({ artworks: arts, room: { x: 0, z: 0, r: 25, yaw: 0 }, picks: [], attempts: 0, hintAt: [0, 0] as [number, number], hintCount: null, hintCorrect: null, maxPicks: null, ...o });
  const lcard = (l: ReturnType<typeof lv>, o: Partial<ClueCard> = {}) => card({ step: 'T3', type: 'challenge', status: 'active', task: { ...taskOf('text'), input: 'room', louvre: l } as never, ...o });

  it('reads the 5 right ids of the louvre step from the leg file (the test leg: fake ids)', () => {
    expect(RIGHT).toHaveLength(5);
    expect([...louvreAnswersOf(louvreLeg).keys()]).toEqual(['T3']);
    expect(louvreAnswersOf(mini).size).toBe(0);
  });

  it('wrong set first: 5 decoys picked one by one, then a lock; never one of the right ids, windows differ per bot', () => {
    let picks: string[] = [];
    const sent: string[] = [];
    for (let k = 0; k < 20; k++) {
      const m = louvreMove('T3', lv({ picks }), 0, RIGHT)!;
      sent.push(String(m.op.op));
      if (m.op.op === 'lock') break;
      expect(m.op).toMatchObject({ t: 'race', op: 'pick', step: 'T3', on: true });
      picks = [...picks, m.op.art as string];
    }
    expect(sent).toEqual(['pick', 'pick', 'pick', 'pick', 'pick', 'lock']);
    expect(picks.some((id) => RIGHT.includes(id))).toBe(false);
    expect(louvreMove('T3', lv(), 0, RIGHT)!.op.art).not.toBe(louvreMove('T3', lv(), 1, RIGHT)!.op.art);
  });

  it('after a wrong lock (attempts 1): unpick the wrong ones BEFORE picking a right one (never > 5 lit), then the 5 right, then lock', () => {
    let picks = ['art-01', 'art-02', 'art-04', 'art-05', 'art-06']; // 5 decoys (the right ones are art-17 / 03 / 21 / 08 / 12)
    const log: string[] = [];
    for (let k = 0; k < 30; k++) {
      expect(picks.length).toBeLessThanOrEqual(5);
      const m = louvreMove('T3', lv({ picks, attempts: 1 }), 0, RIGHT)!;
      if (m.op.op === 'lock') break;
      log.push(`${m.op.on ? '+' : '-'}${m.op.art}`);
      picks = m.op.on ? [...picks, m.op.art as string] : picks.filter((x) => x !== m.op.art);
    }
    expect(log.filter((x) => x.startsWith('-'))).toHaveLength(5);
    expect(log.findIndex((x) => x.startsWith('+'))).toBeGreaterThan(log.lastIndexOf(log.filter((x) => x.startsWith('-')).at(-1)!) - 1);
    expect([...picks].sort()).toEqual([...RIGHT].sort());
  });

  it('botMove routes a louvre card (locked → wait, then active after the countdown), and knows nothing → waits instead of spamming', () => {
    const rooms = new Map([['T3', RIGHT]]);
    expect(botMove(lcard(lv()), 0, role(0), new Map(), 1000, rooms)!.op).toMatchObject({ op: 'pick', on: true });
    const locked = lcard(lv({ picks: ['art-01'], attempts: 1 }), { status: 'locked', lockedUntil: 6000 });
    expect(botMove(locked, 5500, role(0), new Map(), 1000, rooms)).toBeNull();
    expect(botMove(locked, 7000, role(0), new Map(), 1000, rooms)!.op).toMatchObject({ op: 'pick', art: 'art-01', on: false });
    expect(botMove(lcard(lv()), 0, role(0), new Map())).toBeNull(); // no right ids known
  });
});

// Integration: the in-process server + the louvre test leg, 3 bots (wrong lock → countdown → right lock). The start moves from
// Largo do Pagode da Barra (≈ 1.3 km, the leg's own start) to the Avenida Doutor Mário Soares, ≈ 230 m (294 m on foot) from the box
// the room sits under (Praça de Ferreira do Amaral).
describe('sim --leg louvre', () => {
  const nearLouvre = () => {
    const leg = JSON.parse(readFileSync(join(import.meta.dirname, '../worker/legs/test/louvre.json'), 'utf8'));
    Object.assign(leg.start, { lat: 22.19, lon: 113.54217 });
    return JSON.stringify(leg);
  };
  it('3 bots finish: ≥ 3 wrong locks, every bot sees ≥ 3 public feed messages, ≤ 16 × steps rows per team', { timeout: 300_000 }, async () => {
    const r = await runSim({ bots: 3, seconds: 600, speedup: 2, rejoinGapMs: 0, race: 'sim-louvre', password: 'test-secret', log: () => {}, leg: { json: nearLouvre() } });
    expect(r.leg).toMatchObject({ id: 'louvre', finished: 3, ranked: 3, out: 1 });
    expect(r.leg!.stats.louvreWrong).toBeGreaterThanOrEqual(3);
    expect(r.leg!.stats.louvreCorrect).toBe(3); // exactly one `correct` row per team per right lock
    expect(r.leg!.feed).toBeGreaterThanOrEqual(3);
    expect(r.leg!.rowsPerTeam!).toBeLessThanOrEqual(r.leg!.rowBudget);
  });
});
