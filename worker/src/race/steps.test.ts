// SPEC §8.1 state machine (docs/plans/phase7.md D2–D8, D18; docs/plans/phase8.md D5–D8, D10, D13), pure: the fake `mini`
// leg (worker/legs/test/mini.json): L1 route → T1 challenge elsewhere (teaser, host_approval) → L2 walk-only route → D1
// detour (A auto 55 m off, B a photo task elsewhere) → L3 → PS.
import { branchZone, parseLeg, stepZones, type Leg, type Zone } from '@race/shared/leg';
import { NET, type HostReview } from '@race/shared/protocol';
import { describe, expect, it } from 'vitest';
import miniRaw from '../../legs/test/mini.json';
import { emptyProgress, parseAnswers, type StepProgressRow } from '../db.ts';
import { bundledLeg } from './leg.ts';
import { advance, boxesOf, cardOf, mediaAllowed, placesOf, review, taskState, type Progress, type RaceInput, type StandAt } from './steps.ts';
import { verifyAuto } from './tasks.ts';

const mini = bundledLeg('mini')!;
const Z = stepZones(mini);
const P = (step: number, more: Partial<Progress> = {}): Progress => ({ step, arrivedAt: null, startedAt: null, branch: null, finishAt: null, penaltyMinutes: 0, branchOpenedAt: null, lockedUntil: null, pendingId: null, lastAnswerId: 0, ...more });
const ZA = branchZone(mini, Z, 3, 'A')!;
const ZB = branchZone(mini, Z, 3, 'B')!;
const at = (z: Zone, dx = 0) => ({ x: z.x + dx, z: z.z });
const pose = (z: Zone, dx = 0, riding = false): RaceInput => ({ kind: 'pose', ...at(z, dx), riding });
const stand = (z: Zone, dx = 0, riding = false): StandAt => ({ ...at(z, dx), riding });
const run = (p: Progress, input: RaceInput, now = 1000, leg: Leg = mini, running = true) => advance(leg, stepZones(leg), p, input, now, running);
const park = (z: Zone) => ({ kind: 'park', rack: z.rack });
const MIN = 60_000;
/** mini with its steps edited (still a valid leg). */
const variant = (edit: (steps: any[]) => void): Leg => {
  const raw = structuredClone(miniRaw) as any;
  edit(raw.steps);
  const r = parseLeg(raw);
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  return r.leg;
};

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

  it('open inside the zone before any pose there records the arrival first', () => {
    expect(run(P(0), { kind: 'open', step: 'L1', ...at(Z[0]!), riding: false }).effects).toEqual([{ kind: 'arrive', step: 0 }, { kind: 'complete', step: 0 }]);
  });

  it('outside "running" a pose records the arrival only (D9), nothing moves on', () => {
    expect(run(P(0), pose(Z[0]!), 1000, mini, false).effects).toEqual([{ kind: 'arrive', step: 0 }]);
    expect(run(P(4), pose(Z[4]!), 1000, mini, false)).toEqual({ p: P(4, { arrivedAt: 1000 }), effects: [{ kind: 'arrive', step: 4 }] });
  });

  it('a walk-only route received at a route point parks at THAT point (L1), not at the destination ahead', () => {
    const leg = variant((s) => s.splice(1, 1)); // no T1: L1 → L2 (walk-only)
    const z = stepZones(leg);
    const r = advance(leg, z, P(0), { kind: 'open', step: 'L1', ...at(z[0]!), riding: false }, 1);
    expect(r.effects).toEqual([{ kind: 'arrive', step: 0 }, { kind: 'complete', step: 0 }, park(z[0]!)]);
  });
});

describe('advance: a challenge (D5, D8, D21, D22)', () => {
  const answer = (text: string, p: StandAt = null): RaceInput => ({ kind: 'answer', step: 'T1', text, pose: p });

  it('teaser → accept → active → answer (from anywhere) → pending; refusals per state; done / later steps silent', () => {
    const t0 = P(1);
    expect(run(t0, answer('42'))).toEqual({ p: t0, effects: [{ kind: 'refuse', code: 'taskNotStarted' }] });
    const acc = run(t0, { kind: 'accept', step: 'T1' }, 500);
    expect(acc).toEqual({ p: P(1, { startedAt: 500 }), effects: [{ kind: 'accept', step: 1 }] });
    expect(run(acc.p, { kind: 'accept', step: 'T1' }).effects).toEqual([]); // twice: nothing written
    const a = run(acc.p, answer('41'), 600); // no position needed (gap 6)
    expect(a).toEqual({ p: P(1, { startedAt: 500, pendingId: 1, lastAnswerId: 1 }), effects: [{ kind: 'answer', step: 1, rec: { id: 1, b: null, text: '41', at: 600, s: 'pending' }, verdict: 'pending' }] });
    expect(run(a.p, answer('42')).effects).toEqual([{ kind: 'refuse', code: 'answerPending' }]);
    // the Host's "Phạt": locked until lockedUntil (read against now), then the next answer is #2
    const locked = P(1, { startedAt: 500, lockedUntil: 5000, lastAnswerId: 1 });
    expect(run(locked, answer('42'), 4999).effects).toEqual([{ kind: 'refuse', code: 'answerLocked' }]);
    expect(run(locked, answer('42'), 5000).effects).toEqual([{ kind: 'answer', step: 1, rec: { id: 2, b: null, text: '42', at: 5000, s: 'pending' }, verdict: 'pending' }]);
    for (const text of ['', '   ']) expect(run(acc.p, answer(text)).effects).toEqual([]); // the client never sends it
    expect(run(P(2), answer('42')).effects).toEqual([]); // T1 done
    expect(run(P(0), answer('42')).effects).toEqual([]); // T1 not reached
    expect(run(P(1), { kind: 'accept', step: 'L1' }).effects).toEqual([]);
  });

  it('§17.32: accepting a teaser task done AT the point → off the bike there (T1 elsewhere: only on entering its place)', () => {
    const leg = variant((s) => delete s[1].task.location);
    const z = stepZones(leg);
    expect(run(P(1), { kind: 'accept', step: 'T1' }, 500, leg).effects).toEqual([{ kind: 'accept', step: 1 }, park(z[1]!)]);
    expect(run(P(1), { kind: 'accept', step: 'T1' }, 500).effects).toEqual([{ kind: 'accept', step: 1 }]);
  });

  it('auto (D21): wrong → recorded, no lock; right → done from anywhere', () => {
    const leg = variant((s) => Object.assign(s[1], { teaser: '' }, { task: { ...s[1].task, verification: 'auto' } }));
    const p = P(1, { lastAnswerId: 3 });
    expect(run(p, answer('41'), 1000, leg).effects).toEqual([{ kind: 'answer', step: 1, rec: { id: 4, b: null, text: '41', at: 1000, s: 'wrong' }, verdict: 'wrong' }]);
    const r = run(p, answer(' 42 ', stand(Z[1]!, 300)), 1000, leg);
    expect(r.effects).toEqual([{ kind: 'answer', step: 1, rec: { id: 4, b: null, text: ' 42 ', at: 1000, s: 'correct' }, verdict: 'correct' }, { kind: 'complete', step: 1 }, park(Z[1]!)]); // L2 walk-only: off the bike, 300 m away too (§17.32)
    expect(r.p).toEqual(P(2));
  });

  it('approve (§17.32): L2 is walk-only → off the bike wherever the team is (standing, far away, riding, offline)', () => {
    const p = P(1, { startedAt: 5, pendingId: 1, lastAnswerId: 1, arrivedAt: 5 });
    const approve = (s: StandAt) => run(p, { kind: 'approve', step: 'T1', pose: s }).effects;
    for (const s of [stand(Z[1]!, 5), stand(Z[1]!, 300), stand(Z[1]!, 0, true), null]) expect(approve(s)).toEqual([{ kind: 'complete', step: 1 }, park(Z[1]!)]);
    expect(run(p, { kind: 'approve', step: 'T1', pose: null }).p).toEqual(P(2));
    expect(run(P(2), { kind: 'approve', step: 'T1', pose: null }).effects).toEqual([]); // already done
  });

  it('approve: a next task right at that point is arrived at by the same pose (settle), also while paused', () => {
    // T2 = a second challenge with no place of its own: done where T1 is
    const leg = variant((s) => s.splice(2, 0, { id: 'T2', type: 'challenge', label: 'Thử thách 2', task: { description: '(GIẢ)', verification: 'host_approval' } }));
    const z = stepZones(leg);
    const p = P(1, { pendingId: 1, lastAnswerId: 1, arrivedAt: 5 });
    for (const running of [true, false]) expect(run(p, { kind: 'approve', step: 'T1', pose: stand(z[1]!) }, 1000, leg, running).effects).toEqual([{ kind: 'complete', step: 1 }, park(z[1]!), { kind: 'arrive', step: 2 }]);
  });

  it('a challenge elsewhere: rack when the team ENTERS its place', () => {
    expect(run(P(1), pose(Z[1]!)).effects).toEqual([{ kind: 'arrive', step: 1 }, park(Z[1]!)]);
    expect(Z[1]!.rack).not.toBe(Z[2]!.rack);
  });

  // SPEC §17.44: a multi-box task (labels only, Host-reviewed)
  const PARTS = [{ label: 'Địa điểm 1' }, { label: 'Địa điểm 2' }, { label: '' }, { label: '' }];
  const partsLeg = () => variant((s) => Object.assign(s[1], { teaser: '' }, { task: { ...s[1].task, verification: 'host_approval', parts: PARTS } }));
  const partsAnswer = (parts: string[], p: StandAt = null): RaceInput => ({ kind: 'answer', step: 'T1', text: '', pose: p, parts });

  it('parts: N filled boxes → ONE pending answer "a | b | c | d" for the Host; a text answer, a wrong box count or an empty box is silent', () => {
    const leg = partsLeg();
    const p = P(1, { startedAt: 1000 });
    const r = run(p, partsAnswer([' nơi một', 'nơi hai', 'nơi ba', 'nơi bốn ']), 2000, leg);
    expect(r.effects).toEqual([{ kind: 'answer', step: 1, rec: { id: 1, b: null, text: 'nơi một | nơi hai | nơi ba | nơi bốn', at: 2000, s: 'pending' }, verdict: 'pending' }]);
    expect(r.p).toEqual(P(1, { startedAt: 1000, pendingId: 1, lastAnswerId: 1 }));
    for (const input of [{ kind: 'answer', step: 'T1', text: 'x', pose: null } as RaceInput, partsAnswer(['a', 'b', 'c']), partsAnswer(['a', 'b', 'c', ' '])]) expect(run(p, input, 2000, leg).effects).toEqual([]);
    // the card: input 'parts' + the labels; "đúng x/4" (n = the box count) only once the Host's Phạt was made past scoreFromMinutes (review: sv)
    const row: StepProgressRow = { ...emptyProgress('t', 'T1'), task_started_at: 1000, answers: JSON.stringify([r.effects[0]!.kind === 'answer' && r.effects[0].rec]) };
    const early = review(leg, 1, row, { t: 'host.review', team: 't', step: 'T1', op: 'penalize', id: 1, score: 2 }, 1000 + 30 * MIN - 1);
    const late = review(leg, 1, row, { t: 'host.review', team: 't', step: 'T1', op: 'penalize', id: 1, score: 2 }, 1000 + 30 * MIN);
    if ('refuse' in early || 'refuse' in late) throw new Error('refused');
    expect(parseAnswers(early.row)[0]).toMatchObject({ s: 'penalized', sc: 2 });
    expect(parseAnswers(early.row)[0]).not.toHaveProperty('sv');
    expect(parseAnswers(late.row)[0]).toMatchObject({ s: 'penalized', sc: 2, sv: true });
    expect(early.row.locked_until).toBe(1000 + 30 * MIN - 1 + 3 * MIN);
    const c = cardOf(leg, 1, late.row, 1000 + 31 * MIN);
    expect(c.task).toMatchObject({ input: 'parts', partLabels: ['Địa điểm 1', 'Địa điểm 2', '', ''] });
    expect(c.answers).toEqual([expect.objectContaining({ id: 1, status: 'penalized', score: 2, of: 4 })]);
    expect(cardOf(leg, 1, early.row, 1000 + 31 * MIN).answers[0]).not.toHaveProperty('score');
    expect(JSON.stringify(c)).not.toMatch(/scoreOf/);
  });

  it('verifyAuto (D21): one of the answers, ignoring case / diacritics / đ / spaces', () => {
    const t = mini.steps[3]!.type === 'detour' ? mini.steps[3].branches[0]!.task : null;
    expect(['7', ' BẢY ', 'bay'].map((x) => verifyAuto(t!, x))).toEqual(['correct', 'correct', 'correct']);
    expect(['8', '', '77'].map((x) => verifyAuto(t!, x))).toEqual(['wrong', 'wrong', 'wrong']);
  });
});

describe('advance: a detour (D6)', () => {
  const branch = (b: string): RaceInput => ({ kind: 'branch', step: 'D1', branch: b });
  const open = (b: string, z: Zone, dx = 0, riding = false): RaceInput => ({ kind: 'open', step: 'D1', branch: b, ...at(z, dx), riding });

  it('choose (no lock) → goToBranch → open the chosen branch\'s box only (on foot, in its place) → its task', () => {
    expect(run(P(3), branch('X')).effects).toEqual([]);
    const c = run(P(3), branch('A'));
    expect(c).toEqual({ p: P(3, { branch: 'A' }), effects: [{ kind: 'branch', step: 3, branch: 'A' }] });
    expect(run(c.p, branch('A')).effects).toEqual([]); // the same branch again
    expect(run(P(3), open('A', ZA)).effects).toEqual([]); // no branch chosen
    expect(run(c.p, open('B', ZB)).effects).toEqual([]); // never confirm the other branch's box
    expect(run(c.p, open('A', ZA, 0, true)).effects).toEqual([{ kind: 'refuse', code: 'boxRiding' }]);
    expect(run(c.p, open('A', ZA, ZA.r + NET.geofenceSlack + 1)).effects).toEqual([{ kind: 'refuse', code: 'boxFar' }]);
    const o = run(c.p, open('A', ZA), 2000);
    expect(o).toEqual({ p: P(3, { branch: 'A', arrivedAt: 2000, branchOpenedAt: 2000, startedAt: 2000 }), effects: [{ kind: 'arrive', step: 3 }, park(ZA), { kind: 'openBranch', step: 3, branch: 'A' }] });
    expect(run(o.p, open('A', ZA)).effects).toEqual([{ kind: 'refuse', code: 'boxOpened' }]);
    expect(run(P(4), open('A', ZA)).effects).toEqual([{ kind: 'refuse', code: 'boxOpened' }]);
    // answers only once the box is opened; A is auto: right = done (L3 next: no rack rule)
    expect(run(c.p, { kind: 'answer', step: 'D1', text: '7', pose: null }).effects).toEqual([]);
    expect(run(o.p, { kind: 'answer', step: 'D1', text: 'bảy', pose: stand(ZA) }, 3000).effects).toEqual([{ kind: 'answer', step: 3, rec: { id: 1, b: 'A', text: 'bảy', at: 3000, s: 'correct' }, verdict: 'correct' }, { kind: 'complete', step: 3 }]);
    // B is a photo task: '' = "Tôi đã gửi bài" → pending
    const ob = P(3, { branch: 'B', branchOpenedAt: 5, startedAt: 5 });
    expect(run(ob, { kind: 'answer', step: 'D1', text: '', pose: null }).effects).toEqual([{ kind: 'answer', step: 3, rec: { id: 1, b: 'B', text: '', at: 1000, s: 'pending' }, verdict: 'pending' }]);
  });

  it('switch: the old box hidden, a branchSwitchLockMinutes lock, the old branch\'s progress gone; refused only while pending', () => {
    const go = P(3, { branch: 'A', arrivedAt: 7 });
    const sw = run(go, branch('B'), 1000);
    expect(sw).toEqual({
      p: P(3, { branch: 'B', lockedUntil: 1000 + 10 * MIN }),
      effects: [{ kind: 'switch', step: 3, from: 'A', to: 'B', lockedUntil: 1000 + 10 * MIN }, { kind: 'hideBox', step: 3, branch: 'A' }],
    });
    expect(run(sw.p, open('B', ZB), 2000).effects).toEqual([]); // switchLocked: no box yet
    expect(run(sw.p, open('B', ZB), 1000 + 10 * MIN).effects).toEqual([{ kind: 'arrive', step: 3 }, park(ZB), { kind: 'openBranch', step: 3, branch: 'B' }]);
    // §17.32: a branch done AT the point (no location) → off the bike when its box is opened
    const leg = variant((s) => delete s[3].branches[0].task.location);
    const z = stepZones(leg);
    expect(run(P(3, { branch: 'A' }), { kind: 'open', step: 'D1', branch: 'A', ...at(z[3]!), riding: false }, 2000, leg).effects).toEqual([{ kind: 'arrive', step: 3 }, { kind: 'openBranch', step: 3, branch: 'A' }, park(z[3]!)]);
    const opened = P(3, { branch: 'A', branchOpenedAt: 5, startedAt: 5, arrivedAt: 5, lastAnswerId: 2 });
    expect(run({ ...opened, pendingId: 2 }, branch('B')).effects).toEqual([{ kind: 'refuse', code: 'branchPending' }]);
    // M1: during a "Phạt" countdown the switch is allowed and its lock replaces the old one
    const s2 = run({ ...opened, lockedUntil: 1000 + 3 * MIN }, branch('B'), 1000);
    expect(s2.p).toEqual(P(3, { branch: 'B', lockedUntil: 1000 + 10 * MIN, lastAnswerId: 2 }));
    expect(s2.effects[0]).toMatchObject({ kind: 'switch', from: 'A', to: 'B' });
    // A → B → A: no switch during the switch countdown (silent: no "Đổi" button then, review R-4), then one lock each
    expect(run(sw.p, branch('A'), 2000)).toEqual({ p: sw.p, effects: [] });
    const back = 1000 + 10 * MIN;
    expect(run(sw.p, branch('A'), back).effects).toEqual([{ kind: 'switch', step: 3, from: 'B', to: 'A', lockedUntil: back + 10 * MIN }, { kind: 'hideBox', step: 3, branch: 'B' }]);
    const fast = { ...mini, penalties: { ...mini.penalties, branchSwitchLockMinutes: 0 } }; // 0 = no countdown
    expect(run(go, branch('B'), 1000, fast).p.lockedUntil).toBe(1000);
  });

  it('a detour is "the team\'s point" only at the chosen branch\'s place (critic C1): no arrival / rack before a choice or at the other branch', () => {
    const r = run(P(2, { arrivedAt: 1 }), { kind: 'open', step: 'L2', ...at(Z[2]!), riding: false });
    expect(r).toEqual({ p: P(3), effects: [{ kind: 'complete', step: 2 }] }); // both branches have a place: no rack at L2
    expect(placesOf(mini, Z, 3, null)).toEqual([]);
    expect(run(P(3), pose(ZB)).effects).toEqual([]);
    expect(run(P(3, { branch: 'A' }), pose(ZB)).effects).toEqual([]); // riding past B's place while on A: the bike stays
    expect(run(P(3, { branch: 'A' }), pose(ZA)).effects).toEqual([{ kind: 'arrive', step: 3 }, park(ZA)]);
    // after a switch to B (arrivedAt cleared): B's place is the team's now
    const sw = run(P(3, { branch: 'A', arrivedAt: 1 }), branch('B')).p;
    expect(run(sw, pose(ZB)).effects).toEqual([{ kind: 'arrive', step: 3 }, park(ZB)]);
  });
});

describe('review (D5, D10)', () => {
  const T1 = (more: Partial<StepProgressRow> = {}): StepProgressRow => ({ ...emptyProgress('t', 'T1'), clue_opened_at: 1, task_started_at: 2, ...more });
  const recs = (...a: object[]) => JSON.stringify(a);
  const pend = (id = 1, at = 1000) => ({ id, b: null, text: 'x', at, s: 'pending' });
  const m = (op: HostReview['op'], id?: number, note?: string, step = 'T1'): HostReview => ({ t: 'host.review', team: 't', step, op, ...(id !== undefined ? { id } : {}), ...(note !== undefined ? { note } : {}) });
  const ok = (r: ReturnType<typeof review>) => {
    if ('refuse' in r) throw new Error(r.refuse);
    return { ...r, answers: parseAnswers(r.row) };
  };

  it('approve the pending answer: decided, the wait counted (SPEC §8.9), a note on the answer AND the step', () => {
    const r = ok(review(mini, 1, T1({ answers: recs(pend(1, 1000)) }), m('approve', 1, 'đúng rồi'), 31_000));
    expect(r).toMatchObject({ approve: true, id: 1, row: { decided_at: 31_000, decided_by: 'host', approval_wait_seconds: 30, host_note: 'đúng rồi', locked_until: null, completed_at: null } });
    expect(r.answers).toEqual([{ id: 1, b: null, text: 'x', at: 1000, s: 'approved', d: 31_000, n: 'đúng rồi' }]);
  });

  it('penalize: locked for task.retryLockMinutes ?? penalties.retryLockMinutes (0 = none), rejections + 1, no penalty minutes', () => {
    const r = ok(review(mini, 1, T1({ answers: recs(pend(1, 1000)) }), m('penalize'), 11_000)); // no id: the pending one
    expect(r).toMatchObject({ approve: false, id: 1, row: { rejections: 1, locked_until: 11_000 + 3 * MIN, approval_wait_seconds: 10, penalty_minutes: 0, host_note: '' } });
    expect(r.answers[0]).toMatchObject({ s: 'penalized', d: 11_000 });
    expect(r.answers[0]!.n).toBeUndefined();
    const one = variant((s) => (s[1].task.retryLockMinutes = 1));
    expect(ok(review(one, 1, T1({ answers: recs(pend()) }), m('penalize', 1), 2000)).row.locked_until).toBe(2000 + MIN);
    const zero = variant((s) => (s[1].task.retryLockMinutes = 0));
    const z = ok(review(zero, 1, T1({ answers: recs(pend()) }), m('penalize', 1), 2000)).row;
    expect([z.locked_until, taskState(zero, 1, z, 2000)]).toEqual([null, 'active']);
  });

  it('SPEC §17.31 scoreOf: a Phạt keeps the Host\'s count; the team sees "đúng x/n" only from scoreFromMinutes on; out of range / Duyệt = none', () => {
    const scored = variant((s) => ((s[1].task.scoreOf = 4), (s[1].task.scoreFromMinutes = 30)));
    const pm = (score?: number) => ({ ...m('penalize', 1), ...(score !== undefined ? { score } : {}) });
    const started = T1({ task_started_at: 1000, answers: recs(pend(1, 2000)) });
    const early = ok(review(scored, 1, started, pm(2), 1000 + 10 * MIN)); // minute 10: stored, not shown
    expect(early.answers[0]).toMatchObject({ s: 'penalized', sc: 2 });
    expect(early.answers[0]!.sv).toBeUndefined();
    expect(cardOf(scored, 1, early.row, 1000 + 11 * MIN).answers[0]).toEqual({ id: 1, text: 'x', at: 2000, status: 'penalized' });
    const late = ok(review(scored, 1, started, pm(2), 1000 + 30 * MIN)); // minute 30: shown
    expect(late.answers[0]).toMatchObject({ sc: 2, sv: true });
    expect(cardOf(scored, 1, late.row, 1000 + 31 * MIN).answers[0]).toMatchObject({ status: 'penalized', score: 2, of: 4 });
    expect(ok(review(scored, 1, started, pm(5), 1000 + 30 * MIN)).answers[0]!.sc).toBeUndefined(); // 5/4: ignored
    expect(ok(review(scored, 1, started, pm(), 1000 + 30 * MIN)).answers[0]!.sc).toBeUndefined(); // blank box
    expect(ok(review(mini, 1, started, pm(2), 1000 + 30 * MIN)).answers[0]!.sc).toBeUndefined(); // the task has no scoreOf
    // N4: Duyệt over that Phạt drops the count
    const fixed = ok(review(scored, 1, late.row, m('approve', 1), 1000 + 32 * MIN));
    expect(fixed.answers[0]).toMatchObject({ s: 'approved' });
    expect([fixed.answers[0]!.sc, fixed.answers[0]!.sv]).toEqual([undefined, undefined]);
  });

  it('refusals in Vietnamese: a decided answer, a wrong id, nothing sent, a done step (idempotent: a double click)', () => {
    const decided = recs({ ...pend(1), s: 'approved', d: 5 });
    expect(review(mini, 1, T1({ answers: decided }), m('approve', 1), 9)).toEqual({ refuse: 'Bài này đã được xử lý.' });
    expect(review(mini, 1, T1({ answers: recs(pend(1)) }), m('approve', 2), 9)).toEqual({ refuse: 'Đội chưa gửi câu trả lời.' });
    expect(review(mini, 1, T1(), m('penalize'), 9)).toEqual({ refuse: 'Đội chưa gửi câu trả lời.' }); // nothing pending to penalize
    expect(review(mini, 1, T1({ answers: recs(pend(1)), completed_at: 8 }), m('approve', 1), 9)).toEqual({ refuse: 'Bài này đã được xử lý.' });
    expect(review(mini, 1, T1({ answers: recs({ ...pend(1), s: 'penalized' }) }), m('penalize', 1), 9)).toEqual({ refuse: 'Bài này đã được xử lý.' });
    expect(review(mini, 0, T1(), m('approve', 1), 9)).toMatchObject({ refuse: expect.stringContaining('không có thử thách') });
    expect(review(mini, 3, { ...emptyProgress('t', 'D1'), clue_opened_at: 1 }, m('approve', undefined, undefined, 'D1'), 9)).toEqual({ refuse: 'Đội chưa gửi câu trả lời.' }); // no branch
  });

  it('N4: "Duyệt" on the answer just penalized clears the lock; not once a newer answer was sent', () => {
    const pen = { ...pend(1, 1000), s: 'penalized', d: 2000, n: 'sai' };
    const r = ok(review(mini, 1, T1({ answers: recs(pen), locked_until: 9 * MIN, approval_wait_seconds: 1, rejections: 1 }), m('approve', 1), 5000));
    expect(r).toMatchObject({ approve: true, row: { locked_until: null, approval_wait_seconds: 1, rejections: 1 } });
    expect(r.answers[0]).toMatchObject({ s: 'approved', d: 5000, n: 'sai' });
    expect(review(mini, 1, T1({ answers: recs(pen, pend(2)) }), m('approve', 1), 5000)).toEqual({ refuse: 'Bài này đã được xử lý.' });
  });

  it('approve without id (M2): a photo task active / locked (Host got it on Messenger) → a new approved answer; a box not opened → refused', () => {
    const d1 = (more: Partial<StepProgressRow>) => ({ ...emptyProgress('t', 'D1'), clue_opened_at: 1, branch: 'B', branch_opened_at: 2, task_started_at: 2, ...more });
    const approve = m('approve', undefined, undefined, 'D1');
    const r = ok(review(mini, 3, d1({ answers: recs({ id: 1, b: 'A', text: '8', at: 1, s: 'wrong' }) }), approve, 50));
    expect(r).toMatchObject({ approve: true, id: 2 });
    expect(r.answers[1]).toEqual({ id: 2, b: 'B', text: '', at: 50, s: 'approved', d: 50 });
    expect(ok(review(mini, 3, d1({ locked_until: 99 }), approve, 50)).approve).toBe(true);
    expect(review(mini, 3, d1({ branch_opened_at: null }), approve, 50)).toEqual({ refuse: 'Đội chưa gửi câu trả lời.' }); // box not opened
  });

  it('V5 "Cho qua" (Phase 10, plan M8): approve without id passes ANY task while active / locked; a pending answer is approved itself', () => {
    const approve = (step = 'T1') => m('approve', undefined, undefined, step);
    // a typed host_approval challenge, active with a penalized answer, and locked by it
    const pen = { ...pend(1, 1000), s: 'penalized', d: 2000 };
    for (const locked_until of [null, 10 * MIN]) {
      const r = ok(review(mini, 1, T1({ answers: recs(pen), locked_until, rejections: 1 }), approve(), 5000));
      expect(r).toMatchObject({ approve: true, id: 2, row: { locked_until: null, rejections: 1, decided_at: 5000 } });
      expect(r.answers).toEqual([pen, { id: 2, b: null, text: '', at: 5000, s: 'approved', d: 5000 }]);
    }
    // a typed auto branch (D1 A), opened
    const a = ok(review(mini, 3, { ...emptyProgress('t', 'D1'), clue_opened_at: 1, branch: 'A', branch_opened_at: 2, task_started_at: 2 }, approve('D1'), 50));
    expect(a).toMatchObject({ approve: true, id: 1 });
    expect(a.answers).toEqual([{ id: 1, b: 'A', text: '', at: 50, s: 'approved', d: 50 }]);
    // pending: no new "Cho qua" answer, the pending one is approved (the Host page shows Duyệt / Phạt there)
    const p = ok(review(mini, 1, T1({ answers: recs(pend(1, 1000)) }), approve(), 3000));
    expect(p).toMatchObject({ approve: true, id: 1, row: { approval_wait_seconds: 2 } });
    expect(p.answers).toHaveLength(1);
    // review fix: a team stuck on the teaser (never pressed "Nhận thử thách") passes too; its task starts now
    const t = ok(review(mini, 1, T1({ task_started_at: null }), approve(), 7000));
    expect(t).toMatchObject({ approve: true, id: 1, row: { task_started_at: 7000, decided_at: 7000 } });
    expect(review(mini, 1, T1({ task_started_at: null }), m('penalize'), 9)).toEqual({ refuse: 'Đội chưa gửi câu trả lời.' }); // no Phạt there
  });

  it('note: the step\'s Host note only ("" clears it), any step the team holds', () => {
    expect(ok(review(mini, 0, T1({ host_note: 'cũ' }), m('note', undefined, 'mới'), 9))).toMatchObject({ approve: false, id: null, row: { host_note: 'mới' } });
    expect(ok(review(mini, 1, T1({ host_note: 'cũ', completed_at: 3 }), m('note', undefined, ''), 9)).row.host_note).toBe('');
  });
});

describe('mediaAllowed (D13)', () => {
  const leg = variant((s) => {
    s[3].branches[0].task.media = ['r2:nhanh-a.jpg'];
    s[3].branches[1].task.media = ['r2:nhanh-b.jpg'];
  });
  const rows = (o: Record<string, Partial<StepProgressRow>>) => new Map(Object.entries(o).map(([k, v]) => [k, { ...emptyProgress('t', k), ...v } as StepProgressRow]));
  const can = (step: number, r: Record<string, Partial<StepProgressRow>>, name: string) => mediaAllowed(leg, step, rows(r), name);

  it('only images of clues the team has opened: the next step / an unaccepted task / an unopened branch → no', () => {
    expect(can(0, {}, 'test-gia.jpg')).toBe(true); // L1: held from the start
    expect(can(0, {}, 'test-gia-2.jpg')).toBe(false); // T1's task: a later step
    expect(can(1, {}, 'test-gia-2.jpg')).toBe(false); // T1 behind its teaser
    expect(can(1, { T1: { task_started_at: 5 } }, 'test-gia-2.jpg')).toBe(true);
    expect(can(3, { T1: { completed_at: 5 } }, 'test-gia-2.jpg')).toBe(true);
    expect(can(3, { D1: { branch: 'A' } }, 'nhanh-a.jpg')).toBe(false); // chosen, box not opened
    expect(can(3, { D1: { branch: 'A', branch_opened_at: 5 } }, 'nhanh-a.jpg')).toBe(true);
    expect(can(3, { D1: { branch: 'A', branch_opened_at: 5 } }, 'nhanh-b.jpg')).toBe(false); // the other branch
    expect(can(4, { D1: { branch: 'B', completed_at: 5 } }, 'nhanh-b.jpg')).toBe(true); // the branch it did
    expect(can(5, {}, 'khong-co.jpg')).toBe(false);
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

  it('SPEC §17.38: only ON the 16 × 32 m mat (turned to the zone yaw), not anywhere within the radius', () => {
    const on = (dx: number, dz: number, riding = false): RaceInput => ({ kind: 'pose', x: Z[5]!.x + dx, z: Z[5]!.z + dz, riding });
    expect(Z[5]!.mat && Z[4]!.mat).toBe(true);
    expect(Z[0]!.mat).toBeUndefined();
    // mini's PS: yawDeg 0 → long axis north-south (z); r = 25: 10 m beside the mat / 17 m past its end used to count
    expect([run(P(4), on(10, 0)).effects, run(P(4), on(0, 17)).effects, run(P(4), on(8.6, 0)).effects]).toEqual([[], [], []]);
    expect(run(P(4), on(7.9, 15.9)).effects.map((e) => e.kind)).toEqual(['arrive', 'complete', 'arrive', 'finish']); // a corner
    expect(run(P(4), on(-8.4, -16.4)).effects.map((e) => e.kind)).toEqual(['arrive', 'complete', 'arrive', 'finish']); // the 0.5 m slack
    expect(run(P(5), { kind: 'checkin', x: Z[5]!.x + 9, z: Z[5]!.z }).effects).toEqual([{ kind: 'refuse', code: 'boxFar' }]); // the geofence slack does not widen it
    expect(run(P(5), { kind: 'checkin', x: Z[5]!.x, z: Z[5]!.z - 15 }).effects).toEqual([{ kind: 'arrive', step: 5 }, { kind: 'finish' }]);
    // the zone yaw turns the rectangle: yawDeg 90 → long axis east-west
    const turned = variant((s) => (s[5].destination.yawDeg = 90));
    const tz = stepZones(turned)[5]!;
    expect(run(P(4), { kind: 'pose', x: tz.x + 15, z: tz.z, riding: false }, 1000, turned).effects.map((e) => e.kind)).toEqual(['arrive', 'complete', 'arrive', 'finish']);
    expect(run(P(4), { kind: 'pose', x: tz.x, z: tz.z + 10, riding: false }, 1000, turned).effects).toEqual([]);
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
    for (const leg of [mini, bundledLeg('macao-demo-filled')!]) {
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
      for (const k of ['referenceAnswers', 'params', 'lat', 'lon', 'destination', 'location', 'bikeParking', 'radius', 'note', 'n', 'b', 'host_note', 'contactUrl', 'contactLabel']) expect(keys.has(k)).toBe(false);
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
    expect(cardOf(mini, 3, row({ branch: 'B', branch_opened_at: 200 }), 1000).branches![1]!.task).toMatchObject({ input: 'proof', place: 'Khoảng sân rộng ở Tap Seac' });
    expect(cardOf(mini, 3, row({ branch: 'A', branch_opened_at: 200, locked_until: 900 }), 1000)).toMatchObject({ status: 'active', lockedUntil: null, lockKind: null });
  });

  it('a photo task card has no contact field (SPEC §17.17: no Messenger button), even from an old leg file that still has one', () => {
    const r = parseLeg({ ...structuredClone(miniRaw), hostApproval: { contactUrl: 'https://m.me/gia-cu', contactLabel: 'Nhắn Host cũ' } });
    if (!r.ok) throw new Error(JSON.stringify(r.issues));
    const task = cardOf(r.leg, 3, { ...emptyProgress('t', 'D1'), clue_opened_at: 100, branch: 'B', branch_opened_at: 200 }, 1000).branches![1]!.task!;
    expect(task).toMatchObject({ input: 'proof', kind: 'free' });
    expect(Object.keys(task).filter((k) => /contact/i.test(k))).toEqual([]);
    expect(JSON.stringify(task)).not.toMatch(/m\.me|Nhắn Host cũ/);
  });

  it('card fields: route transport, challenge teaser + task place, detour branches, status from the row', () => {
    const row = (i: number, more = {}) => ({ ...emptyProgress('t', mini.steps[i]!.id), clue_opened_at: 100, ...more });
    expect(cardOf(mini, 2, row(2), 0)).toMatchObject({ step: 'L2', type: 'route_info', transport: { mandatory: 'walk' }, status: 'active', receivedAt: 100, completedAt: null });
    expect(cardOf(mini, 1, row(1, { completed_at: 300 }), 0)).toMatchObject({ text: expect.stringContaining('vườn'), task: { place: 'Công viên Vasco da Gama (lối phụ)', timeLimitMinutes: 10 }, status: 'done', completedAt: 300 });
    expect(cardOf(mini, 1, row(1), 0)).toMatchObject({ status: 'teaser', text: expect.stringContaining('vườn') }); // D22: the task behind "Nhận thử thách"
    expect(cardOf(mini, 1, row(1), 0).task).toBeUndefined();
    expect(cardOf(mini, 1, row(1, { task_started_at: 150 }), 0)).toMatchObject({ status: 'active', task: { input: 'text', media: [{ kind: 'link' }, { url: 'r2:test-gia-2.jpg', label: '', kind: 'image' }] } });
    expect(cardOf(mini, 0, row(0), 0)).toMatchObject({ media: [{ url: 'https://example.invalid/gia/video-l1', label: '(GIẢ) Video gợi ý', kind: 'link' }, { url: 'r2:test-gia.jpg', kind: 'image' }] });
    expect(cardOf(mini, 3, row(3, { branch: 'B' }), 0)).toMatchObject({ status: 'goToBranch', branch: 'B', branches: [{ id: 'A' }, { id: 'B' }] });
    expect(cardOf(mini, 3, row(3, { branch: 'B' }), 0).branches!.map((b) => b.task)).toEqual([undefined, undefined]); // the task is in the box (§17.16)
    expect(cardOf(mini, 5, undefined, 42)).toEqual({ step: 'PS', type: 'pit_stop', label: 'Về đích', text: '', media: [], status: 'active', lockedUntil: null, lockKind: null, answers: [], receivedAt: 42, completedAt: null });
  });
});
