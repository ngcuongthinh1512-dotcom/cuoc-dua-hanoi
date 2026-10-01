// SPEC §13.6 / §13.8 ranking (docs/plans/phase7.md D10), pure.
//  - finished teams first, by official time = check-in − the team's own start time − Host-approval waits (when
//    hostApproval.approvalWaitCounts is false); Host pause time is NOT deducted (decision D9); ties → earlier check-in,
//    then start order; a finished team without a start time comes after the timed ones, by check-in;
//  - then the others: further step first; same step → the step before completed sooner ON THE TEAM'S OWN CLOCK
//    (prevDoneAt − startAt, SPEC §13.8 / §17.12: teams start at different times, wall-clock order would favour early
//    starters); teams without a start time after the timed ones (by prevDoneAt); then start order;
//  - a start time that gives a negative clock (startAt after the check-in / prevDoneAt: Host typo) counts as no start time;
//  - last tie-break: slot, so the order is always deterministic (startOrder is null for a team never entered).
//  officialMs is derived on read from startAt (never stored): a Host correction of the start time re-ranks at once.
import type { RankRow } from '@race/shared/protocol';

export interface RankInput {
  team: string;
  slot: number;
  startOrder: number | null;
  /** Current step index. */
  step: number;
  startAt: number | null;
  finishAt: number | null;
  /** completed_at of the step before the current one (null = none). */
  prevDoneAt: number | null;
  /** Sum of approval_wait_seconds × 1000 (0 in Phase 7). */
  approvalWaitMs: number;
}

/** ms on the team's own clock at `t` (null = no usable start time). */
const clock = (startAt: number | null, t: number | null) => (startAt === null || t === null || t < startAt ? null : t - startAt);

/** Official time of a finished team (null = not finished / no usable start time). */
export function officialMs(t: Pick<RankInput, 'startAt' | 'finishAt' | 'approvalWaitMs'>, approvalWaitCounts: boolean): number | null {
  const c = clock(t.startAt, t.finishAt);
  return c === null ? null : Math.max(0, c - (approvalWaitCounts ? 0 : t.approvalWaitMs));
}

/** Ascending, nulls last. */
const asc = (a: number | null, b: number | null) => (a === b ? 0 : a === null ? 1 : b === null ? -1 : a - b);

export function ranking(teams: readonly RankInput[], approvalWaitCounts: boolean): RankRow[] {
  const rows = teams.map((t) => {
    const official = officialMs(t, approvalWaitCounts);
    const done = t.finishAt !== null;
    const own = clock(t.startAt, t.prevDoneAt);
    // sort keys: finished first; finished: timed (official) before untimed (check-in); racing: step, then own clock /
    // wall clock without a usable start time
    const timed = done ? official !== null : t.startAt !== null && (t.prevDoneAt === null || own !== null);
    return { t, official, keys: [done ? 0 : 1, done ? 0 : -t.step, timed ? 0 : 1, done ? (official ?? t.finishAt) : timed ? own : t.prevDoneAt, done ? t.finishAt : null, t.startOrder, t.slot] };
  });
  rows.sort((a, b) => {
    for (let k = 0; k < a.keys.length; k++) {
      const d = asc(a.keys[k]!, b.keys[k]!);
      if (d) return d;
    }
    return 0;
  });
  const lead = rows.find((r) => r.official !== null)?.official ?? null;
  return rows.map(({ t, official }, i) => ({
    team: t.team,
    rank: i + 1,
    stepIndex: t.step + (t.finishAt !== null ? 1 : 0),
    finishAt: t.finishAt,
    officialMs: official,
    gapMs: official !== null && lead !== null ? official - lead : null,
  }));
}
