// Task verification seam (docs/plans/phase7.md D14). Phase 7: every detour / challenge task passes ("nhiệm vụ tạm cho
// qua tự động", SPEC §15 Phase 7) once the team submits it inside the task zone. Phase 8 replaces verifyTask with the
// real checks (normalizeAnswer + task.answers for `auto`, 'pending' for `host_approval`, lockouts) without touching the
// state machine: steps.ts only reads the verdict.
import type { Leg } from '@race/shared/leg';

export type TaskVerdict = 'pass' | 'wrong' | 'pending';

/** ponytail: Phase 7 stub, always 'pass' (the leg's answers are never read); Phase 8 checks them. */
export function verifyTask(_leg: Leg, _step: number, _branch: string | undefined, _answer: string | undefined): TaskVerdict {
  return 'pass';
}
