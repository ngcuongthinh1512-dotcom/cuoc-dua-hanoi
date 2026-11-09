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

/** Hà Nội task.game "sang-com": the game's win code, the exact hash of public/games/sang-com.html `subCode('LANG VONG', time)`
 *  (FNV-1a 32 of "LANG VONG|<mm:ss>|COM26", 5 × 5 bits in ALPHA). */
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function fnv(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) (h ^= s.charCodeAt(i)), (h = Math.imul(h, 16777619));
  return h >>> 0;
}
function code5(prefix: string, key: string): string {
  const h = fnv(key);
  let s = '';
  for (let i = 0; i < 5; i++) s += ALPHA[(h >>> (5 * i)) & 31];
  return `${prefix}-${s}`;
}
export const sangComCode = (time: string): string => code5('COM', `LANG VONG|${time}|COM26`);
/** Hà Nội task.game "nan-gom": public/games/nan-gom.html `makeCode('BAT TRANG', time)` (FNV-1a 32 of "BAT TRANG|<mm:ss>|GOM26"). */
export const gomCode = (time: string): string => code5('GOM', `BAT TRANG|${time}|GOM26`);
/** "mm:ss <prefix>-XXXXX": the code matches the time, minSec ≤ time ≤ since `startedAt` + 5 s. */
function winOk(text: string, startedAt: number | null, now: number, prefix: string, codeOf: (t: string) => string, minSec: number): boolean {
  const m = new RegExp(`^(\\d{2,3}):([0-5]\\d) (${prefix}-[A-Z2-9]{5})$`).exec(text.trim());
  if (!m || startedAt == null) return false;
  const sec = Number(m[1]) * 60 + Number(m[2]);
  return m[3] === codeOf(`${m[1]}:${m[2]}`) && sec >= minSec && sec * 1000 <= now - startedAt + 5000;
}
/** The win report "mm:ss COM-XXXXX" (RaceHud sends it as the answer text): the code matches the time, the time is ≥ 20 s and
 *  fits in the time since the team opened the task (`startedAt`, + 5 s slack). ponytail: the hash is public (in the page), so a
 *  team reading the source can forge a report; the time bounds only stop an instant one. A server-side seed would fix that. */
export const sangComOk = (text: string, startedAt: number | null, now: number): boolean => winOk(text, startedAt, now, 'COM', sangComCode, 20);
/** nan-gom: same report "mm:ss GOM-XXXXX"; six samples cannot be thrown in under 60 s. Same forgeable-hash ceiling as sang-com. */
export const gomOk = (text: string, startedAt: number | null, now: number): boolean => winOk(text, startedAt, now, 'GOM', gomCode, 60);
