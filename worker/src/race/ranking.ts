// SPEC §13.6 / §13.8 ranking (docs/plans/phase7.md D10), pure. FOUNDATION STUB: track A implements + ranking.test.ts.
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

export function ranking(_teams: readonly RankInput[], _approvalWaitCounts: boolean): RankRow[] {
  return []; // track A
}
