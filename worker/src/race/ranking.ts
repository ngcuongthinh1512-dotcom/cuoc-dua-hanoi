// SPEC §13.6 / §13.8 ranking (docs/plans/phase7.md D10), pure. FOUNDATION STUB: track A implements + ranking.test.ts.
//  - finished teams first, by official time = check-in − the team's own start time − Host-approval waits (when
//    hostApproval.approvalWaitCounts is false); Host pause time is NOT deducted (decision D9); ties → earlier check-in,
//    then start order; a finished team without a start time comes after the timed ones, by check-in;
//  - then the others: further step first; same step → earlier completion of the step before; then start order.
import type { RankRow } from '@race/shared/protocol';

export interface RankInput {
  team: string;
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
