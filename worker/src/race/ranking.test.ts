import { describe, expect, it } from 'vitest';
import { ranking, type RankInput } from './ranking.ts';

const H = 3_600_000, M = 60_000;
const T = (team: string, slot: number, more: Partial<RankInput>): RankInput => ({ team, slot, startOrder: slot + 1, step: 0, startAt: null, finishAt: null, prevDoneAt: null, approvalWaitMs: 0, ...more });
const order = (rows: ReturnType<typeof ranking>) => rows.map((r) => r.team);

describe('ranking (SPEC §13.6 / §13.8, D10)', () => {
  it('finished teams by official time, not by who stepped on the mat first; gap to the leader', () => {
    const rows = ranking([
      T('a', 0, { step: 9, startAt: 10 * H, finishAt: 12 * H }), // 2 h, on the mat first
      T('b', 1, { step: 9, startAt: 10.5 * H, finishAt: 12.25 * H }), // 1 h 45
      T('c', 2, { step: 5, startAt: 10 * H, prevDoneAt: 11 * H }),
    ], false);
    expect(order(rows)).toEqual(['b', 'a', 'c']);
    expect(rows.map((r) => [r.rank, r.officialMs, r.gapMs, r.stepIndex])).toEqual([[1, 1.75 * H, 0, 10], [2, 2 * H, 15 * M, 10], [3, null, null, 5]]);
  });

  it('ties → earlier check-in → start order; a finisher without a start time after the timed ones', () => {
    const rows = ranking([
      T('none', 0, { step: 9, finishAt: 11 * H }),
      T('late', 1, { step: 9, startAt: 11 * H, finishAt: 13 * H }),
      T('early', 2, { step: 9, startAt: 10 * H, finishAt: 12 * H }),
      T('twin', 3, { step: 9, startAt: 10 * H, finishAt: 12 * H, startOrder: 9 }),
    ], false);
    expect(order(rows)).toEqual(['early', 'twin', 'late', 'none']);
  });

  it('racing teams: further step first; same step → the step before done sooner ON THE TEAM CLOCK (D10 example)', () => {
    // A starts 10:00, done step 4 at 11:00 (60 min); B starts 10:30, done at 11:10 (40 min) → B above A
    const rows = ranking([T('A', 0, { step: 4, startAt: 10 * H, prevDoneAt: 11 * H }), T('B', 1, { step: 4, startAt: 10.5 * H, prevDoneAt: 11 * H + 10 * M }), T('C', 2, { step: 6, startAt: 10.5 * H, prevDoneAt: 12 * H })], false);
    expect(order(rows)).toEqual(['C', 'B', 'A']);
  });

  it('no start time / a start time after the event (Host typo) → after the timed teams; slot settles the rest', () => {
    const rows = ranking([
      T('typo', 0, { step: 3, startAt: 12 * H, prevDoneAt: 11 * H }), // negative clock
      T('none', 1, { step: 3, prevDoneAt: 10 * H }),
      T('ok', 2, { step: 3, startAt: 10 * H, prevDoneAt: 11.5 * H }),
      T('x', 4, { startOrder: null }),
      T('y', 3, { startOrder: null }),
    ], false);
    expect(order(rows)).toEqual(['ok', 'none', 'typo', 'y', 'x']);
    const fin = ranking([T('f', 0, { step: 9, startAt: 13 * H, finishAt: 12 * H }), T('g', 1, { step: 9, startAt: 10 * H, finishAt: 13 * H })], false);
    expect(fin.map((r) => [r.team, r.officialMs])).toEqual([['g', 3 * H], ['f', null]]);
  });

  it('approval waits are deducted unless hostApproval.approvalWaitCounts', () => {
    const teams = [T('a', 0, { step: 9, startAt: 0, finishAt: 2 * H, approvalWaitMs: 30 * M }), T('b', 1, { step: 9, startAt: 0, finishAt: 1.75 * H })];
    expect(order(ranking(teams, false))).toEqual(['a', 'b']);
    expect(order(ranking(teams, true))).toEqual(['b', 'a']);
  });
});
