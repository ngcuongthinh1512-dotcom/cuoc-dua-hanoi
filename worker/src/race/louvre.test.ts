// Phase 8B foundation (docs/plans/phase8b.md §C "KHÔNG BAO GIỜ gửi", §E): what a team's card carries of the louvre room,
// pure, on the bundled test leg (FAKE content): never the answers, notes or credits; hints only from their marks; one
// team's picks never on another's card; guard C1. Track A adds the pick / lock transitions (steps.test.ts / harness).
import { parseLeg, stepZones, type ChallengeStep } from '@race/shared/leg';
import { describe, expect, it } from 'vitest';
import { emptyProgress, type StepProgressRow } from '../db.ts';
import { nearLouvreLeg } from '../test/harness.ts';
import { bundledLeg } from './leg.ts';
import { advance, cardOf, creditsOf, hintAt, type Progress } from './steps.ts';

const leg = bundledLeg('louvre')!;
const Z = stepZones(leg);
const T3 = leg.steps[1] as ChallengeStep;
const lv = T3.task.louvre!;
const MIN = 60_000;
const T0 = 1_000_000; // task_started_at (the L-LV box opened)
const [H40, H70] = [T0 + lv.hints.countAtMinutes * MIN, T0 + lv.hints.correctAtMinutes * MIN];
const row = (more: Partial<StepProgressRow> = {}): StepProgressRow => ({ ...emptyProgress('t0', 'T3'), clue_opened_at: T0, task_started_at: T0, ...more });
const right = T3.task.answers;
const wrong = lv.artworks.map((a) => a.id).filter((id) => !right.includes(id));

/** Every Host-only / after-the-finish string of the leg (notes, credit titles / artists / photos / sources). */
const secrets = lv.artworks.flatMap((a) => [a.note, a.credit?.title, a.credit?.artist, a.credit?.photo, a.credit?.source].filter((x): x is string => !!x));

describe('louvre card (cardOf → TaskView.louvre): never leaks', () => {
  const states: [string, StepProgressRow, number][] = [
    ['fresh, before 40', row(), T0 + 1],
    ['3 picks (2 right), between 40 and 70', row({ picks: JSON.stringify([right[0], right[1], wrong[0]]) }), H40 + 1],
    ['locked after a wrong lock, past 70', row({ picks: JSON.stringify(right.slice(0, 4)), rejections: 1, locked_until: H70 + MIN, answers: JSON.stringify([{ id: 1, b: null, text: '4 tác phẩm', at: H70 + 1, s: 'wrong', c: 4 }]) }), H70 + 2],
    ['done (its own picks = the answer, in its own order)', row({ picks: JSON.stringify([...right].reverse()), completed_at: H70 + 5, answers: JSON.stringify([{ id: 1, b: null, text: '5 tác phẩm', at: H70 + 5, s: 'correct', c: 5 }]) }), H70 + 6],
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

  it('hints from their marks only: count + maxPicks at 40, the live x/5 at 70 (follows the picks, never stored)', () => {
    const picks = (ids: string[]) => row({ picks: JSON.stringify(ids) });
    const v = (r: StepProgressRow, now: number) => cardOf(leg, 1, r, now, Z).task!.louvre!;
    expect(hintAt(leg, 1, row(), 0)).toEqual([H40, H70]);
    expect(v(picks(right), H40 - 1)).toMatchObject({ hintCount: null, hintCorrect: null, maxPicks: null, hintAt: [H40, H70] });
    expect(v(picks(right), H40)).toMatchObject({ hintCount: 5, hintCorrect: null, maxPicks: 5 });
    expect(v(picks([right[0]!, wrong[0]!]), H70)).toMatchObject({ hintCount: 5, hintCorrect: 1, maxPicks: 5 });
    expect(v(picks([right[0]!, right[1]!, wrong[0]!]), H70)).toMatchObject({ hintCorrect: 2 });
    expect(v(picks([]), H70)).toMatchObject({ hintCorrect: 0, picks: [] });
    expect(v(row({ rejections: 2 }), T0).attempts).toBe(2);
  });

  it('a lock\'s right count (AnswerView.correct) only for a lock past the 70-minute mark', () => {
    const answers = JSON.stringify([{ id: 1, b: null, text: '3 tác phẩm', at: H70 - 1, s: 'wrong', c: 2 }, { id: 2, b: null, text: '4 tác phẩm', at: H70, s: 'wrong', c: 3 }]);
    const card = cardOf(leg, 1, row({ answers }), H70 + 10, Z);
    expect(card.answers).toEqual([
      { id: 1, text: '3 tác phẩm', at: H70 - 1, status: 'wrong' },
      { id: 2, text: '4 tác phẩm', at: H70, status: 'wrong', correct: 3 },
    ]);
  });

  it('two teams on the step: B\'s card carries none of A\'s picks / x / attempts', () => {
    const a = row({ team: 'tA', picks: JSON.stringify(right.slice(0, 3)), rejections: 3 });
    const b = row({ team: 'tB' });
    const vb = cardOf(leg, 1, b, H70 + 1, Z).task!.louvre!;
    expect(vb).toMatchObject({ picks: [], attempts: 0, hintCorrect: 0 });
    expect(cardOf(leg, 1, a, H70 + 1, Z).task!.louvre).toMatchObject({ attempts: 3, hintCorrect: 3 });
  });

  it('guard C1: a typed `answer` with a right id is silent (nothing written, step not done)', () => {
    const p: Progress = { step: 1, arrivedAt: T0, startedAt: T0, branch: null, finishAt: null, penaltyMinutes: 0, branchOpenedAt: null, lockedUntil: null, pendingId: null, lastAnswerId: 0 };
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
