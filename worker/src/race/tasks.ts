// Task verification (docs/plans/phase8.md D21). host_approval tasks are decided by the Host (steps.ts review).
import { normalizeAnswer, type Task } from '@race/shared/leg';
import { compactAnswer } from '@race/shared/protocol';

/** verification 'auto' = the typed text is one of task.answers, ignoring case, Vietnamese diacritics, đ and extra spaces
 *  (normalizeAnswer). No lock after wrong tries (SPEC §11: deferred). */
export const verifyAuto = (task: Task, text: string): 'correct' | 'wrong' =>
  task.answers.some((a) => normalizeAnswer(a) === normalizeAnswer(text)) ? 'correct' : 'wrong';

/** The "of" of the Host's "đúng x/n" on a task (SPEC §17.31 scoreOf; §17.44: a multi-box task defaults to its box count); undefined = none. */
export const partsOf = (t: Task): number | undefined => t.scoreOf ?? t.parts?.length;

/** SPEC §17.44: how a multi-box answer is stored / shown ("a | b | c | d"). */
export const PARTS_SEP = ' | ';

/** Leg 3: a `parts` task whose EVERY box has answers is graded by the server (box k against its own list only). */
export const autoParts = (t: Task): boolean => !!t.parts && t.parts.every((x) => !!x.answers?.length);

/** Leg 3: each box right / wrong (`texts` in box order), null = not an auto-graded task or the wrong count. */
export function gradeParts(t: Task, texts: readonly string[]): boolean[] | null {
  if (!autoParts(t) || texts.length !== t.parts!.length) return null;
  return t.parts!.map((x, k) => x.answers!.some((a) => compactAnswer(a) === compactAnswer(texts[k]!)));
}
