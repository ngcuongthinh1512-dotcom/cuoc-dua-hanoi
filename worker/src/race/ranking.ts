// SPEC §17.22 / §17.23 ranking, pure: the real finish order, no team clock, no penalty added (a penalty countdown already
// ran on the race's own time, so it is inside the finish moment). Leg 3 exception: a finish-line penalty (host.finishPenalty,
// e.g. a Lựa chọn kép room given up) was NOT served on the way, so it is added here: finishAt + minutes.
//  - finished teams first, by check-in moment + finish-line penalty; same ms → the rank stored at the check-in (who the DO handled first);
//  - then the teams out at the Host's "Kết thúc" (still racing then), by the rank stored at that moment;
//  - then the teams still racing: further step first; same step → the step before completed sooner (wall clock);
//    then start order (null = never entered: last), then slot, so the order is always deterministic.
import type { RankRow } from '@race/shared/protocol';

export interface RankInput {
  team: string;
  slot: number;
  startOrder: number | null;
  /** Current step index. */
  step: number;
  finishAt: number | null;
  /** The rank fixed at the check-in / at the Host's "Kết thúc" (null = still racing). */
  rank: number | null;
  out: boolean;
  /** completed_at of the step before the current one (null = none). */
  prevDoneAt: number | null;
  /** Leg 3: the Host's finish-line penalty (0 / absent = none), added to finishAt. */
  finishPenaltyMinutes?: number;
}

/** Ascending, nulls last. */
const asc = (a: number | null, b: number | null) => (a === b ? 0 : a === null ? 1 : b === null ? -1 : a - b);

export function ranking(teams: readonly RankInput[]): RankRow[] {
  const rows = teams.map((t) => ({
    t,
    keys: [t.finishAt !== null ? 0 : t.rank !== null ? 1 : 2, t.finishAt === null ? null : t.finishAt + (t.finishPenaltyMinutes ?? 0) * 60_000, t.rank, -t.step, t.prevDoneAt, t.startOrder, t.slot],
  }));
  rows.sort((a, b) => {
    for (let k = 0; k < a.keys.length; k++) {
      const d = asc(a.keys[k]!, b.keys[k]!);
      if (d) return d;
    }
    return 0;
  });
  return rows.map(({ t }, i) => ({ team: t.team, rank: i + 1, stepIndex: t.step + (t.finishAt !== null ? 1 : 0), finishAt: t.finishAt, out: t.out }));
}
