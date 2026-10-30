import { describe, expect, it } from 'vitest';
import { ranking, type RankInput } from './ranking.ts';

const H = 3_600_000;
const T = (team: string, slot: number, more: Partial<RankInput>): RankInput => ({ team, slot, startOrder: slot + 1, step: 0, finishAt: null, rank: null, out: false, prevDoneAt: null, ...more });

describe('ranking (SPEC §17.22 / §17.23: real finish order, no team clock)', () => {
  it('finished teams in the order they touched the mat, whatever their start order; no official time, no gap', () => {
    const rows = ranking([
      T('early', 0, { step: 9, finishAt: 12.5 * H, rank: 2 }), // entered first, finished second
      T('late', 1, { step: 9, finishAt: 12 * H, rank: 1 }),
      T('racing', 2, { step: 5, prevDoneAt: 11 * H }),
    ]);
    expect(rows.map((r) => [r.team, r.rank, r.stepIndex, r.out])).toEqual([['late', 1, 10, false], ['early', 2, 10, false], ['racing', 3, 5, false]]);
    expect(Object.keys(rows[0]!).sort()).toEqual(['finishAt', 'out', 'rank', 'stepIndex', 'team']);
  });

  it('same millisecond: the rank stored at the check-in (who the Durable Object handled first)', () => {
    const rows = ranking([T('b', 0, { step: 9, finishAt: 5, rank: 2 }), T('a', 1, { step: 9, finishAt: 5, rank: 1 })]);
    expect(rows.map((r) => r.team)).toEqual(['a', 'b']);
  });

  it('teams out at "Kết thúc" after every finished team, by their stored rank; then the racing ones by step, then wall clock', () => {
    const rows = ranking([
      T('outB', 0, { step: 3, rank: 4, out: true }),
      T('fin', 1, { step: 9, finishAt: 99 * H, rank: 1 }),
      T('outA', 2, { step: 6, rank: 3, out: true }),
      T('lastFin', 3, { step: 9, finishAt: 100 * H, rank: 2, out: true }), // the last team to finish: out, still ranked by its finish
    ]);
    expect(rows.map((r) => [r.team, r.rank, r.out])).toEqual([['fin', 1, false], ['lastFin', 2, true], ['outA', 3, true], ['outB', 4, true]]);
    const racing = ranking([T('A', 0, { step: 4, prevDoneAt: 11 * H }), T('B', 1, { step: 4, prevDoneAt: 10 * H }), T('C', 2, { step: 6, prevDoneAt: 12 * H }), T('D', 3, { step: 4, startOrder: null })]);
    expect(racing.map((r) => r.team)).toEqual(['C', 'B', 'A', 'D']);
  });

  it('Leg 3: a finish-line penalty is added to the finish moment (it was not served on the way); racing teams unaffected', () => {
    const M = 60_000;
    const rows = ranking([
      T('a', 0, { step: 9, finishAt: 10 * M, rank: 1, finishPenaltyMinutes: 20 }), // effectively 30
      T('b', 1, { step: 9, finishAt: 15 * M, rank: 2 }),
      T('c', 2, { step: 9, finishAt: 20 * M, rank: 3, finishPenaltyMinutes: 10 }), // 30: same as a → stored rank
      T('d', 3, { step: 5, finishPenaltyMinutes: 60 }),
    ]);
    expect(rows.map((r) => [r.team, r.rank])).toEqual([['b', 1], ['a', 2], ['c', 3], ['d', 4]]);
  });
});
