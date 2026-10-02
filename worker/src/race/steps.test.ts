// SPEC §8.1 state machine (docs/plans/phase7.md D2–D8, D18), pure: the fake `mini` leg (worker/legs/test/mini.json):
// L1 route → T1 challenge elsewhere (host_approval) → L2 walk-only route → D1 detour (A 55 m off, B elsewhere) → L3 → PS.
import { branchZone, parseLeg, stepZones, type Leg, type Zone } from '@race/shared/leg';
import { NET } from '@race/shared/protocol';
import { describe, expect, it } from 'vitest';
import miniRaw from '../../legs/test/mini.json';
import { emptyProgress } from '../db.ts';
import { bundledLeg } from './leg.ts';
import { advance, boxesOf, cardOf, placesOf, taskState, type Progress, type RaceInput, type Verify } from './steps.ts';
import { verifyAuto } from './tasks.ts';

const mini = bundledLeg('mini')!;
const Z = stepZones(mini);
const pass: Verify = () => 'pass';
const P = (step: number, more: Partial<Progress> = {}): Progress => ({ step, arrivedAt: null, startedAt: null, branch: null, finishAt: null, penaltyMinutes: 0, branchOpenedAt: null, lockedUntil: null, pendingId: null, ...more });
const ZA = branchZone(mini, Z, 3, 'A')!;
const ZB = branchZone(mini, Z, 3, 'B')!;
const at = (z: Zone, dx = 0) => ({ x: z.x + dx, z: z.z });
const pose = (z: Zone, dx = 0, riding = false): RaceInput => ({ kind: 'pose', ...at(z, dx), riding });
const run = (p: Progress, input: RaceInput, now = 1000, verify = pass, leg: Leg = mini, running = true) => advance(leg, stepZones(leg), p, input, now, verify, running);
const park = (z: Zone) => ({ kind: 'park', rack: z.rack, at: z.parking });

describe('advance: route_info (L1)', () => {
  it('arrives once by position, opens on foot inside the zone only, then holds the next clue', () => {
    expect(run(P(0), pose(Z[0]!, 200)).effects).toEqual([]);
    const a = run(P(0), pose(Z[0]!, 10));
    expect(a).toEqual({ p: P(0, { arrivedAt: 1000 }), effects: [{ kind: 'arrive', step: 0 }] });
    expect(run(a.p, pose(Z[0]!, 5)).effects).toEqual([]); // second entry: nothing
    const open = (dx: number, riding = false): Extract<RaceInput, { kind: 'open' }> => ({ kind: 'open', step: 'L1', ...at(Z[0]!, dx), riding });
    expect(run(a.p, open(Z[0]!.r + NET.geofenceSlack + 1))).toEqual({ p: a.p, effects: [{ kind: 'refuse', code: 'boxFar' }] });
    expect(run(a.p, open(0, true))).toEqual({ p: a.p, effects: [{ kind: 'refuse', code: 'boxRiding' }] });
    expect(run(a.p, { ...open(0), step: 'L2' }).effects).toEqual([]); // a later step: silent
    expect(run(a.p, { ...open(0), step: 'nope' }).effects).toEqual([]);
    const o = run(a.p, open(Z[0]!.r + 1), 2000); // within the slack
    // T1 is a task somewhere else: no rack when its clue arrives (D18), the team rides there
    expect(o).toEqual({ p: P(1), effects: [{ kind: 'complete', step: 0 }] });
    expect(run(o.p, open(0)).effects).toEqual([{ kind: 'refuse', code: 'boxOpened' }]);
  });

  it('open / task inside the zone before any pose there records the arrival first', () => {
    expect(run(P(0), { kind: 'open', step: 'L1', ...at(Z[0]!), riding: false }).effects).toEqual([{ kind: 'arrive', step: 0 }, { kind: 'complete', step: 0 }]);
    expect(run(P(1), { kind: 'task', step: 'T1', ...at(Z[1]!) }).effects.slice(0, 2)).toEqual([{ kind: 'arrive', step: 1 }, park(Z[1]!)]);
  });

  it('outside "running" a pose records the arrival only (D9), nothing moves on', () => {
    expect(run(P(0), pose(Z[0]!), 1000, pass, mini, false).effects).toEqual([{ kind: 'arrive', step: 0 }]);
    expect(run(P(4), pose(Z[4]!), 1000, pass, mini, false)).toEqual({ p: P(4, { arrivedAt: 1000 }), effects: [{ kind: 'arrive', step: 4 }] });
  });
});

describe('advance: tasks', () => {
  it('a challenge elsewhere: rack when the team ENTERS its place, task only inside, then the next clue', () => {
    expect(run(P(1), { kind: 'task', step: 'T1', ...at(Z[1]!, 60) }).effects).toEqual([{ kind: 'refuse', code: 'taskFar' }]);
    const a = run(P(1), pose(Z[1]!));
    expect(a.effects).toEqual([{ kind: 'arrive', step: 1 }, park(Z[1]!)]);
    expect(run(a.p, { kind: 'task', step: 'T1', ...at(Z[1]!), riding: true })).toEqual({ p: a.p, effects: [{ kind: 'refuse', code: 'boxRiding' }] }); // D4
    const t = run(a.p, { kind: 'task', step: 'T1', answer: '42', ...at(Z[1]!) }, 3000);
    // L2 is walk-only: the bike goes to the rack of the point the team STANDS at (T1's place), not L2's (D18)
    expect(t).toEqual({ p: P(2), effects: [{ kind: 'start', step: 1, branch: null }, { kind: 'complete', step: 1 }, park(Z[1]!)] });
    expect(Z[1]!.rack).not.toBe(Z[2]!.rack);
  });

  it('a walk-only route received at a route point parks at THAT point (L1), not at the destination ahead', () => {
    const leg = parseLeg({ ...miniRaw, steps: miniRaw.steps.filter((s) => s.id !== 'T1') });
    if (!leg.ok) throw new Error(JSON.stringify(leg.issues));
    const z = stepZones(leg.leg);
    const r = advance(leg.leg, z, P(0), { kind: 'open', step: 'L1', ...at(z[0]!), riding: false }, 1, pass);
    expect(r.effects).toEqual([{ kind: 'arrive', step: 0 }, { kind: 'complete', step: 0 }, { kind: 'park', rack: z[0]!.rack, at: z[0]!.parking }]);
    expect(z[0]!.parking).not.toBeNull();
  });

  it('verify "wrong" / "pending" change nothing (Phase 8 relies on it)', () => {
    const a = P(1, { arrivedAt: 5 });
    for (const v of ['wrong', 'pending'] as const) expect(run(a, { kind: 'task', step: 'T1', ...at(Z[1]!) }, 9, () => v)).toEqual({ p: a, effects: [] });
  });

  it('detour (Phase 7 `task` op, until track A): a branch is required, each branch is done in its own place, the branch is recorded', () => {
    const p = P(3, { arrivedAt: 1 });
    expect(run(p, { kind: 'task', step: 'D1', ...at(Z[3]!) }).effects).toEqual([]);
    expect(run(p, { kind: 'task', step: 'D1', branch: 'X', ...at(Z[3]!) }).effects).toEqual([]);
    expect(run(p, { kind: 'task', step: 'D1', branch: 'B', ...at(Z[3]!) }).effects).toEqual([{ kind: 'refuse', code: 'taskFar' }]);
    expect(run(p, { kind: 'task', step: 'D1', branch: 'B', ...at(ZB) }).effects).toEqual([{ kind: 'start', step: 3, branch: 'B' }, { kind: 'complete', step: 3 }]);
    expect(run(p, { kind: 'task', step: 'D1', branch: 'A', ...at(ZA) }).effects).toEqual([{ kind: 'start', step: 3, branch: 'A' }, { kind: 'complete', step: 3 }]);
  });

  it('a detour is "the team\'s point" only at the chosen branch\'s place (Phase 8 critic C1): no arrival / rack before a choice or at the other branch', () => {
    const r = run(P(2, { arrivedAt: 1 }), { kind: 'open', step: 'L2', ...at(Z[2]!), riding: false });
    expect(r).toEqual({ p: P(3), effects: [{ kind: 'complete', step: 2 }] }); // both branches have a place: no rack at L2
    expect(placesOf(mini, Z, 3, null)).toEqual([]);
    expect(run(P(3), pose(ZB)).effects).toEqual([]);
    expect(run(P(3, { branch: 'A' }), pose(ZB)).effects).toEqual([]); // riding past B's place while on A: the bike stays
    expect(run(P(3, { branch: 'A' }), pose(ZA)).effects).toEqual([{ kind: 'arrive', step: 3 }, park(ZA)]);
    expect(run(P(3, { branch: 'B' }), pose(ZB)).effects).toEqual([{ kind: 'arrive', step: 3 }, park(ZB)]);
  });

  it('Phase 8 ops are typed stubs until track A: nothing happens, nothing is written', () => {
    for (const input of [{ kind: 'accept', step: 'T1' }, { kind: 'answer', step: 'T1', text: '42' }, { kind: 'branch', step: 'D1', branch: 'A' }, { kind: 'approve', step: 'T1', pose: null }, { kind: 'open', step: 'D1', branch: 'A', ...at(ZA), riding: false }] as RaceInput[])
      expect(run(P(3), input)).toEqual({ p: P(3), effects: [] });
  });

  it('verifyAuto (D21): one of the answers, ignoring case / diacritics / đ / spaces', () => {
    const t = mini.steps[3]!.type === 'detour' ? mini.steps[3].branches[0]!.task : null;
    expect(['7', ' BẢY ', 'bay'].map((x) => verifyAuto(t!, x))).toEqual(['correct', 'correct', 'correct']);
    expect(['8', '', '77'].map((x) => verifyAuto(t!, x))).toEqual(['wrong', 'wrong', 'wrong']);
  });
});

describe('advance: route to the Pit Stop + check-in', () => {
  it('entering the Pit Stop zone ends the last route and checks in at once without a penalty', () => {
    const r = run(P(4), pose(Z[4]!), 7000);
    expect(r.effects).toEqual([{ kind: 'arrive', step: 4 }, { kind: 'complete', step: 4 }, { kind: 'arrive', step: 5 }, { kind: 'finish' }]);
    expect(r.p).toEqual(P(5, { arrivedAt: 7000, finishAt: 7000 }));
    expect(run(r.p, { kind: 'checkin', ...at(Z[5]!) }).effects).toEqual([]); // idempotent
  });

  it('on a bike: arrives, but checks in only on foot', () => {
    const r = run(P(4), pose(Z[4]!, 0, true));
    expect(r.p).toEqual(P(5, { arrivedAt: 1000 }));
    expect(run(r.p, { kind: 'checkin', ...at(Z[5]!), riding: true }).effects).toEqual([{ kind: 'refuse', code: 'boxRiding' }]);
    expect(run(r.p, { kind: 'checkin', ...at(Z[5]!, 100) }).effects).toEqual([{ kind: 'refuse', code: 'boxFar' }]);
    expect(run(r.p, { kind: 'checkin', ...at(Z[5]!) }, 1500).effects).toEqual([{ kind: 'finish' }]);
  });

  it('with a penalty: check-in refused until the wait is over', () => {
    const p = P(5, { arrivedAt: 10_000, penaltyMinutes: 2 });
    expect(run(p, { kind: 'checkin', ...at(Z[5]!) }, 10_000 + 60_000)).toEqual({ p, effects: [{ kind: 'refuse', code: 'penaltyWait' }] });
    expect(run(p, pose(Z[5]!), 10_000 + 60_000).effects).toEqual([]);
    expect(run(p, { kind: 'checkin', ...at(Z[5]!) }, 10_000 + 120_000).effects).toEqual([{ kind: 'finish' }]);
    // never arrived: the check-in records the arrival, then waits
    expect(run(P(5, { penaltyMinutes: 1 }), { kind: 'checkin', ...at(Z[5]!) }).effects).toEqual([{ kind: 'arrive', step: 5 }, { kind: 'refuse', code: 'penaltyWait' }]);
  });
});

describe('boxesOf / cardOf', () => {
  it('boxes for routes, the mat for the last route and the Pit Stop, one per branch of a detour (D6), none for challenges; yaw from yawDeg (D7)', () => {
    const b = boxesOf(mini, Z);
    expect(b.map((x) => x && x.map((y) => [y.step, y.branch ?? '', y.kind ?? 'box', y.r]))).toEqual([
      [['L1', '', 'box', 35]], null, [['L2', '', 'box', 40]], [['D1', 'A', 'box', 15], ['D1', 'B', 'box', 30]], [['PS', '', 'mat', 25]], [['PS', '', 'mat', 25]],
    ]);
    expect(b[0]![0]!.yaw).toBeCloseTo((150 * Math.PI) / 180, 3);
    expect(b[3]!.map((x) => [x.x, x.z, x.yaw])).toEqual([[Math.round(ZA.x * 100) / 100, Math.round(ZA.z * 100) / 100, Math.round(((135 * Math.PI) / 180) * 1000) / 1000], [Math.round(ZB.x * 100) / 100, Math.round(ZB.z * 100) / 100, 0]]);
  });

  it('cards never carry an answer, a reference answer, a Host note, a destination name, params or coordinates (every card state)', () => {
    for (const leg of [mini, bundledLeg('paris-demo-filled')!]) {
      const tasks = leg.steps.flatMap((s) => (s.type === 'challenge' ? [s.task] : s.type === 'detour' ? s.branches.map((b) => b.task) : []));
      const answers = tasks.flatMap((t) => [...t.answers, ...t.referenceAnswers]);
      const names = leg.steps.flatMap((s) => (s.type === 'route_info' || s.type === 'pit_stop' ? [s.destination.name] : []));
      expect(answers.length).toBeGreaterThan(3);
      const strings: string[] = [];
      const keys = new Set<string>();
      const walk = (v: unknown): void => {
        if (typeof v === 'string') strings.push(v);
        else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) (keys.add(k), walk(x));
      };
      const mine = JSON.stringify([{ id: 1, b: 'A', text: 'đội gõ', at: 6, s: 'penalized', d: 7, n: 'GHI CHÚ HOST' }, { id: 2, b: 'A', text: 'đội gõ lại', at: 8, s: 'pending' }]);
      const rows = [{}, { branch: 'A' }, { branch: 'A', branch_opened_at: 6, task_started_at: 6, answers: mine, host_note: 'GHI CHÚ HOST', locked_until: 99 }, { branch: 'B', branch_opened_at: 6, completed_at: 8 }, { completed_at: 8, branch: 'A' }];
      for (const more of rows) leg.steps.forEach((_, i) => walk(cardOf(leg, i, { ...emptyProgress('t', leg.steps[i]!.id), clue_opened_at: 5, ...more }, 9)));
      for (const k of ['referenceAnswers', 'params', 'lat', 'lon', 'destination', 'location', 'bikeParking', 'radius', 'note', 'n', 'b', 'host_note']) expect(keys.has(k)).toBe(false);
      for (const a of answers) expect(strings.filter((s) => (a.length < 3 ? s === a : s.toLowerCase().includes(a.toLowerCase())))).toEqual([]);
      for (const n of names) expect(strings.filter((s) => s.includes(n))).toEqual([]);
      expect(strings.filter((s) => s.includes('GHI CHÚ HOST'))).toEqual([]);
    }
  });

  it('taskState (D5 / D6): done > pending > locked > active > teaser; a detour: choose / switchLocked / goToBranch until its branch box is opened', () => {
    const row = (i: number, more = {}) => ({ ...emptyProgress('t', mini.steps[i]!.id), clue_opened_at: 100, ...more });
    const pending = JSON.stringify([{ id: 1, b: null, text: 'x', at: 1, s: 'pending' }]);
    const st = (i: number, more = {}, now = 1000) => taskState(mini, i, row(i, more), now);
    expect([st(0), st(0, { completed_at: 5 }), st(5)]).toEqual(['active', 'done', 'active']);
    // T1 has a teaser
    expect([st(1), st(1, { task_started_at: 5 }), st(1, { task_started_at: 5, answers: pending }), st(1, { task_started_at: 5, locked_until: 2000 }), st(1, { task_started_at: 5, locked_until: 900 })]).toEqual(['teaser', 'active', 'pending', 'locked', 'active']);
    expect([st(1, { task_started_at: 5, answers: pending, locked_until: 2000 }), st(1, { task_started_at: 5, locked_until: 2000, completed_at: 9 })]).toEqual(['pending', 'done']); // N3
    expect([st(3), st(3, { branch: 'A' }), st(3, { branch: 'A', locked_until: 2000 }), st(3, { branch: 'A', branch_opened_at: 9 }), st(3, { branch: 'A', branch_opened_at: 9, locked_until: 2000 })]).toEqual(['choose', 'goToBranch', 'switchLocked', 'active', 'locked']);
  });

  it('a card shows the countdown, its own branch\'s answers (newest NET.answerHistory) and the opened branch\'s task only', () => {
    const row = (more = {}) => ({ ...emptyProgress('t', 'D1'), clue_opened_at: 100, ...more });
    const recs = Array.from({ length: NET.answerHistory + 2 }, (_, k) => ({ id: k + 1, b: 'A', text: `a${k + 1}`, at: k, s: 'penalized' }));
    const answers = JSON.stringify([{ id: 0, b: 'B', text: 'old', at: 0, s: 'penalized' }, ...recs]);
    expect(cardOf(mini, 3, row({ branch: 'B', locked_until: 5000, branch_switches: 1 }), 1000)).toMatchObject({ status: 'switchLocked', lockedUntil: 5000, lockKind: 'switch', switches: 1, switchPenaltyMinutes: 10, branchOpened: false, branches: [{ id: 'A' }, { id: 'B' }] });
    const c = cardOf(mini, 3, row({ branch: 'A', branch_opened_at: 200, locked_until: 5000, answers }), 1000);
    expect(c).toMatchObject({ status: 'locked', lockKind: 'retry', retryPenaltyMinutes: 3, branchOpened: true, branches: [{ id: 'A', task: { title: '(GIẢ) Phép tính', input: 'text' } }, { id: 'B' }] });
    expect(c.branches![1]!.task).toBeUndefined();
    expect(c.answers.map((a) => a.text)).toEqual(recs.slice(-NET.answerHistory).map((r) => r.text));
    expect(cardOf(mini, 3, row({ branch: 'B', branch_opened_at: 200 }), 1000).branches![1]!.task).toMatchObject({ input: 'proof', contactUrl: 'https://m.me/test-host-gia', place: 'Bãi cỏ Champ de Mars' });
    expect(cardOf(mini, 3, row({ branch: 'A', branch_opened_at: 200, locked_until: 900 }), 1000)).toMatchObject({ status: 'active', lockedUntil: null, lockKind: null });
  });

  it('card fields: route transport, challenge teaser + task place, detour branches, status from the row', () => {
    const row = (i: number, more = {}) => ({ ...emptyProgress('t', mini.steps[i]!.id), clue_opened_at: 100, ...more });
    expect(cardOf(mini, 2, row(2), 0)).toMatchObject({ step: 'L2', type: 'route_info', transport: { mandatory: 'walk' }, status: 'active', receivedAt: 100, completedAt: null });
    expect(cardOf(mini, 1, row(1, { completed_at: 300 }), 0)).toMatchObject({ text: expect.stringContaining('vườn'), task: { place: 'Vườn Trocadéro (phía dưới)', timeLimitMinutes: 10 }, status: 'done', completedAt: 300 });
    expect(cardOf(mini, 1, row(1), 0)).toMatchObject({ status: 'teaser', text: expect.stringContaining('vườn') }); // D22: the task behind "Nhận thử thách"
    expect(cardOf(mini, 1, row(1), 0).task).toBeUndefined();
    expect(cardOf(mini, 1, row(1, { task_started_at: 150 }), 0)).toMatchObject({ status: 'active', task: { input: 'text', media: [{ kind: 'link' }, { url: 'r2:test-gia-2.jpg', label: '', kind: 'image' }] } });
    expect(cardOf(mini, 0, row(0), 0)).toMatchObject({ media: [{ url: 'https://example.invalid/gia/video-l1', label: '(GIẢ) Video gợi ý', kind: 'link' }, { url: 'r2:test-gia.jpg', kind: 'image' }] });
    expect(cardOf(mini, 3, row(3, { branch: 'B' }), 0)).toMatchObject({ status: 'goToBranch', branch: 'B', branches: [{ id: 'A' }, { id: 'B' }] });
    expect(cardOf(mini, 3, row(3, { branch: 'B' }), 0).branches!.map((b) => b.task)).toEqual([undefined, undefined]); // the task is in the box (§17.16)
    expect(cardOf(mini, 5, undefined, 42)).toEqual({ step: 'PS', type: 'pit_stop', label: 'Về đích', text: '', media: [], status: 'active', lockedUntil: null, lockKind: null, answers: [], receivedAt: 42, completedAt: null });
  });
});
