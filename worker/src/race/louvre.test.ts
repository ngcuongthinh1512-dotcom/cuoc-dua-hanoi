// Phase 8B foundation (docs/plans/phase8b.md §C "KHÔNG BAO GIỜ gửi", §E): what a team's card carries of the louvre room,
// pure, on the bundled test leg (FAKE content): never the answers, notes or credits; hints only from their marks; one
// team's picks never on another's card; guard C1. Track A adds the pick / lock transitions (steps.test.ts / harness).
import { parseLeg, stepZones, type ChallengeStep, type Leg } from '@race/shared/leg';
import { NET } from '@race/shared/protocol';
import { describe, expect, it } from 'vitest';
import { emptyProgress, type StepProgressRow } from '../db.ts';
import { nearLouvreLeg } from '../test/harness.ts';
import { bundledLeg } from './leg.ts';
import { advance, cardOf, creditsOf, hintAt, review, type Progress, type RaceInput } from './steps.ts';

const leg = bundledLeg('louvre')!;
const Z = stepZones(leg);
const T3 = leg.steps[1] as ChallengeStep;
const lv = T3.task.louvre!;
const MIN = 60_000;
const T0 = 1_000_000; // task_started_at (the L-LV box opened)
const [H40, H60] = [T0 + lv.hints.countAtMinutes * MIN, T0 + lv.hints.correctAtMinutes * MIN];
const row = (more: Partial<StepProgressRow> = {}): StepProgressRow => ({ ...emptyProgress('t0', 'T3'), clue_opened_at: T0, task_started_at: T0, ...more });
const right = T3.task.answers;
const wrong = lv.artworks.map((a) => a.id).filter((id) => !right.includes(id));

/** Every Host-only / after-the-finish string of the leg (notes, credit titles / artists / photos / sources). */
const secrets = lv.artworks.flatMap((a) => [a.note, a.credit?.title, a.credit?.artist, a.credit?.photo, a.credit?.source].filter((x): x is string => !!x));

describe('louvre card (cardOf → TaskView.louvre): never leaks', () => {
  const states: [string, StepProgressRow, number][] = [
    ['fresh, before 40', row(), T0 + 1],
    ['3 picks (2 right), between 40 and 60', row({ picks: JSON.stringify([right[0], right[1], wrong[0]]) }), H40 + 1],
    ['locked after a wrong lock, past 60', row({ picks: JSON.stringify(right.slice(0, 4)), rejections: 1, locked_until: H60 + MIN, answers: JSON.stringify([{ id: 1, b: null, text: '4 tác phẩm', at: H60 + 1, s: 'wrong', c: 4 }]) }), H60 + 2],
    ['done (its own picks = the answer, in its own order)', row({ picks: JSON.stringify([...right].reverse()), completed_at: H60 + 5, answers: JSON.stringify([{ id: 1, b: null, text: '5 tác phẩm', at: H60 + 5, s: 'correct', c: 5 }]) }), H60 + 6],
  ];
  for (const [name, r, now] of states)
    it(`${name}: no answers array, no note, no credit; artworks = id / type / image only`, () => {
      const card = cardOf(leg, 1, r, now, Z);
      const json = JSON.stringify(card);
      expect(card.task?.input).toBe('room');
      const v = card.task!.louvre!;
      expect(v.artworks).toHaveLength(23);
      for (const a of v.artworks) expect(Object.keys(a).sort()).toEqual(['id', 'image', 'type']);
      expect(json).not.toContain(JSON.stringify(right)); // the 5 ids never as one list
      expect(json).not.toContain(JSON.stringify([...right].sort()));
      for (const s of secrets) expect(json).not.toContain(s);
      expect(json).not.toContain('"answers":["');
      expect(v.room).toEqual({ x: Math.round(Z[1]!.x * 100) / 100, z: Math.round(Z[1]!.z * 100) / 100, r: Z[1]!.r, yaw: Math.round(Z[1]!.yaw * 1000) / 1000 });
      expect(v.room.x).toBe(Math.round(Z[0]!.x * 100) / 100); // the room = the zone of the route just before (its box)
    });

  it('hints from their marks only: count + maxPicks at 40, the live x/5 at 60 (follows the picks, never stored)', () => {
    const picks = (ids: string[]) => row({ picks: JSON.stringify(ids) });
    const v = (r: StepProgressRow, now: number) => cardOf(leg, 1, r, now, Z).task!.louvre!;
    expect(hintAt(leg, 1, row(), 0)).toEqual([H40, H60]);
    expect(v(picks(right), H40 - 1)).toMatchObject({ hintCount: null, hintCorrect: null, maxPicks: null, hintAt: [H40, H60] });
    expect(v(picks(right), H40)).toMatchObject({ hintCount: 5, hintCorrect: null, maxPicks: 5 });
    expect(v(picks([right[0]!, wrong[0]!]), H60)).toMatchObject({ hintCount: 5, hintCorrect: 1, maxPicks: 5 });
    expect(v(picks([right[0]!, right[1]!, wrong[0]!]), H60)).toMatchObject({ hintCorrect: 2 });
    expect(v(picks([]), H60)).toMatchObject({ hintCorrect: 0, picks: [] });
    expect(v(row({ rejections: 2 }), T0).attempts).toBe(2);
  });

  it('a lock\'s right count (AnswerView.correct) only for a lock past the 60-minute mark', () => {
    const answers = JSON.stringify([{ id: 1, b: null, text: '3 tác phẩm', at: H60 - 1, s: 'wrong', c: 2 }, { id: 2, b: null, text: '4 tác phẩm', at: H60, s: 'wrong', c: 3 }]);
    const card = cardOf(leg, 1, row({ answers }), H60 + 10, Z);
    expect(card.answers).toEqual([
      { id: 1, text: '3 tác phẩm', at: H60 - 1, status: 'wrong' },
      { id: 2, text: '4 tác phẩm', at: H60, status: 'wrong', correct: 3 },
    ]);
  });

  it('two teams on the step: B\'s card carries none of A\'s picks / x / attempts', () => {
    const a = row({ team: 'tA', picks: JSON.stringify(right.slice(0, 3)), rejections: 3 });
    const b = row({ team: 'tB' });
    const vb = cardOf(leg, 1, b, H60 + 1, Z).task!.louvre!;
    expect(vb).toMatchObject({ picks: [], attempts: 0, hintCorrect: 0 });
    expect(cardOf(leg, 1, a, H60 + 1, Z).task!.louvre).toMatchObject({ attempts: 3, hintCorrect: 3 });
  });

  it('guard C1: a typed `answer` with a right id is silent (nothing written, step not done)', () => {
    const p: Progress = { step: 1, arrivedAt: T0, startedAt: T0, branch: null, finishAt: null, penaltyMinutes: 0, branchOpenedAt: null, lockedUntil: null, pendingId: null, lastAnswerId: 0, picks: [] };
    const r = advance(leg, Z, p, { kind: 'answer', step: 'T3', text: right[0]!, pose: { ...Z[1]!, riding: false } }, T0 + 1);
    expect(r).toEqual({ p, effects: [] });
  });

  it('creditsOf: leg order, only artworks with a picture + credit, never a note / id / answer', () => {
    const items = creditsOf(leg);
    expect(items.map((c) => c.file)).toEqual(lv.artworks.filter((a) => a.image && a.credit).map((a) => a.image));
    expect(items.length).toBeGreaterThan(0);
    const json = JSON.stringify(items);
    for (const a of lv.artworks) expect(json).not.toContain(a.note);
    for (const id of right) expect(json).not.toContain(`"${id}"`);
    expect(Object.keys(items[0]!).sort()).toEqual(['artist', 'file', 'license', 'photo', 'source', 'title']);
    expect(creditsOf(bundledLeg('mini')!)).toEqual([]);
  });

  it('nearLouvreLeg (harness): loads, no error; hints 3 s / 6 s; points 60 m apart', () => {
    const r = parseLeg(nearLouvreLeg());
    expect(r.issues.filter((i) => i.level === 'error')).toEqual([]);
    const z = stepZones((r as { leg: typeof leg }).leg);
    expect(Math.round(Math.hypot(z[2]!.x - z[0]!.x, z[2]!.z - z[0]!.z))).toBe(60);
    expect(((r as { leg: typeof leg }).leg.steps[1] as ChallengeStep).task.louvre!.hints).toEqual({ countAtMinutes: 0.05, correctAtMinutes: 0.1 });
  });
});

describe('louvre transitions (advance pick / lock, docs/plans/phase8b.md §E)', () => {
  const P = (more: Partial<Progress> = {}): Progress => ({ step: 1, arrivedAt: null, startedAt: T0, branch: null, finishAt: null, penaltyMinutes: 0, branchOpenedAt: null, lockedUntil: null, pendingId: null, lastAnswerId: 0, picks: [], ...more });
  const run = (p: Progress, input: RaceInput, now = T0 + 1, l: Leg = leg) => advance(l, stepZones(l), p, input, now);
  const pick = (art: string, on = true): RaceInput => ({ kind: 'pick', step: 'T3', art, on });
  const room = { x: Z[1]!.x, z: Z[1]!.z, riding: false };
  const lock = (pose: { x: number; z: number; riding: boolean } | null = room): RaceInput => ({ kind: 'lock', step: 'T3', pose });
  const refused = (code: string) => [{ kind: 'refuse', code }];
  const lit = (ids: string[]) => P({ picks: ids });

  it('pick: on / off, same state or an unknown artwork → silent; from anywhere, while locked too', () => {
    const a = run(P(), pick(wrong[0]!));
    expect(a).toEqual({ p: lit([wrong[0]!]), effects: [{ kind: 'pick', step: 1, picks: [wrong[0]] }] });
    expect(run(a.p, pick(wrong[0]!)).effects).toEqual([]);
    expect(run(P(), pick(wrong[0]!, false)).effects).toEqual([]);
    expect(run(P(), pick('art-99')).effects).toEqual([]);
    expect(run(a.p, pick(wrong[0]!, false))).toEqual({ p: P(), effects: [{ kind: 'pick', step: 1, picks: [] }] });
    const locked = P({ lockedUntil: T0 + MIN, picks: [right[0]!] });
    expect(run(locked, pick(right[1]!)).effects).toEqual([{ kind: 'pick', step: 1, picks: [right[0], right[1]] }]);
    expect(run(locked, pick(right[0]!, false)).effects).toEqual([{ kind: 'pick', step: 1, picks: [] }]);
  });

  it('pick: a done step / a later step → silent; a teaser not accepted → taskNotStarted', () => {
    expect(run(P({ step: 2 }), pick(right[0]!)).effects).toEqual([]);
    expect(run(P({ step: 0 }), pick(right[0]!)).effects).toEqual([]);
    const teased = parseLeg({ ...structuredClone(leg), steps: leg.steps.map((s) => (s.id === 'T3' ? { ...s, teaser: '(GIẢ) đố' } : s)) });
    expect(run(P({ startedAt: null }), pick(right[0]!), T0, (teased as { leg: Leg }).leg).effects).toEqual(refused('taskNotStarted'));
  });

  it('§17.19 (c): no limit before the 40-minute mark; from it at most 5 lit (off always works, > 5 kept)', () => {
    const seven = [...wrong.slice(0, 4), ...right.slice(0, 3)];
    let p = P();
    for (const id of seven) p = run(p, pick(id), H40 - 1).p;
    expect(p.picks).toEqual(seven);
    expect(cardOf(leg, 1, row({ picks: JSON.stringify(seven) }), H40 - 1, Z).task!.louvre!.maxPicks).toBeNull();
    expect(run(p, pick(right[3]!), H40)).toEqual({ p, effects: refused('pickLimit') });
    for (const id of seven.slice(0, 3)) p = run(p, pick(id, false), H40).p; // off: always
    expect(p.picks).toHaveLength(4);
    p = run(p, pick(right[3]!), H40).p;
    expect(p.picks).toHaveLength(5);
    expect(run(p, pick(right[4]!), H40).effects).toEqual(refused('pickLimit'));
    expect(cardOf(leg, 1, row({ picks: JSON.stringify(p.picks) }), H40, Z).task!.louvre!.maxPicks).toBe(5);
  });

  it('lock: outside the room / no trusted pose → boxFar; nothing lit → silent; locked → answerLocked; done → silent', () => {
    expect(run(lit(right), lock({ x: Z[1]!.x + Z[1]!.r + NET.geofenceSlack + 1, z: Z[1]!.z, riding: false })).effects).toEqual(refused('boxFar'));
    expect(run(lit(right), lock(null)).effects).toEqual(refused('boxFar'));
    expect(run(P(), lock())).toEqual({ p: P(), effects: [] });
    expect(run(P({ picks: right, lockedUntil: T0 + MIN }), lock()).effects).toEqual(refused('answerLocked'));
    expect(run(P({ step: 2, picks: right }), lock()).effects).toEqual([]);
  });

  it('a wrong lock before 60: retry countdown (retryLockMinutes), c kept for the Host, not public; picks kept', () => {
    const picks = [right[0]!, right[1]!, wrong[0]!];
    const now = T0 + 1;
    const r = run(P({ picks, lastAnswerId: 2 }), lock(), now);
    const until = now + 0.1 * MIN;
    expect(r.effects).toEqual([{ kind: 'lock', step: 1, rec: { id: 3, b: null, text: '3 tác phẩm', at: now, s: 'wrong', c: 2 }, ok: false, correct: 2, public: false, lockedUntil: until, minutes: 0.1, picks }]);
    expect(r.p).toEqual(P({ picks, lastAnswerId: 3, lockedUntil: until }));
    // past the countdown it locks again; past 60 the lock is public
    expect(run(r.p, lock(), until - 1).effects).toEqual(refused('answerLocked'));
    expect(run(r.p, lock(), Math.max(until, H60)).effects[0]).toMatchObject({ kind: 'lock', ok: false, public: true, correct: 2, rec: { id: 4 } });
  });

  it('right = exactly the 5 answers (any order): lock ok + complete; 6 with all 5 → wrong; 4 → wrong', () => {
    const r = run(lit([...right].reverse()), lock(), H60 + 1);
    expect(r.effects).toEqual([
      { kind: 'lock', step: 1, rec: { id: 1, b: null, text: '5 tác phẩm', at: H60 + 1, s: 'correct', c: 5 }, ok: true, correct: 5, public: true, lockedUntil: null, minutes: 0, picks: [...right].reverse() },
      { kind: 'complete', step: 1 },
    ]);
    expect(r.p).toMatchObject({ step: 2, picks: [], lockedUntil: null, lastAnswerId: 0 });
    expect(run(lit([...right, wrong[0]!]), lock()).effects[0]).toMatchObject({ ok: false, correct: 5, rec: { s: 'wrong', text: '6 tác phẩm' } });
    expect(run(lit(right.slice(0, 4)), lock()).effects[0]).toMatchObject({ ok: false, correct: 4 });
  });

  it("the Host's way out (verify-foundation #9): approve without id completes a louvre step; penalize without id → refused", () => {
    const r = row({ picks: JSON.stringify(right.slice(0, 2)) });
    expect(review(leg, 1, r, { t: 'host.review', team: 't0', step: 'T3', op: 'approve' }, T0 + 5)).toMatchObject({ approve: true, id: 1 });
    expect(review(leg, 1, r, { t: 'host.review', team: 't0', step: 'T3', op: 'penalize' }, T0 + 5)).toEqual({ refuse: 'Đội chưa gửi câu trả lời.' });
    expect(run(P(), { kind: 'approve', step: 'T3', pose: room }).effects).toContainEqual({ kind: 'complete', step: 1 });
  });
});
