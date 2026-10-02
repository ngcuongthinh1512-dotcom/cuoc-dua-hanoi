// Task verification seam (docs/plans/phase7.md D14, docs/plans/phase8.md D21).
import { normalizeAnswer, type Leg, type Task } from '@race/shared/leg';

export type TaskVerdict = 'pass' | 'wrong' | 'pending';

/** ponytail: Phase 7 stub, always 'pass' (the leg's answers are never read); used only by the Phase 7 `race task` op,
 *  which Phase 8 track A removes together with this function (answer / branch / open{branch} replace it). */
export function verifyTask(_leg: Leg, _step: number, _branch: string | undefined, _answer: string | undefined): TaskVerdict {
  return 'pass';
}

/** Phase 8 (D21): verification 'auto' = the typed text is one of task.answers, ignoring case, Vietnamese diacritics, đ
 *  and extra spaces (normalizeAnswer). No lock after wrong tries (SPEC §11: deferred). */
export const verifyAuto = (task: Task, text: string): 'correct' | 'wrong' =>
  task.answers.some((a) => normalizeAnswer(a) === normalizeAnswer(text)) ? 'correct' : 'wrong';
