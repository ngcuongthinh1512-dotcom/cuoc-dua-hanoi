// Task verification (docs/plans/phase8.md D21). host_approval tasks are decided by the Host (steps.ts review).
import { normalizeAnswer, type Task } from '@race/shared/leg';

/** verification 'auto' = the typed text is one of task.answers, ignoring case, Vietnamese diacritics, đ and extra spaces
 *  (normalizeAnswer). No lock after wrong tries (SPEC §11: deferred). */
export const verifyAuto = (task: Task, text: string): 'correct' | 'wrong' =>
  task.answers.some((a) => normalizeAnswer(a) === normalizeAnswer(text)) ? 'correct' : 'wrong';
