/** Vietnamese diacritics / case / đ / extra spaces do not matter (SPEC §11 "Quy tắc chung khi nhập đáp án"): the Worker's
 *  `verifyAuto` and the Host page's "KHỚP đáp án" badge (SPEC §17.42) compare answers through this. zod-free on purpose: the
 *  client may import it (@race/shared/leg may not be imported for a value there). */
export function normalizeAnswer(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').replace(/[đĐ]/g, 'd').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Leg 3 (an auto-graded `parts` box): normalizeAnswer, then spaces / hyphens / punctuation dropped too ("Cu-ba" = "cu ba" = "CUBA"). */
export const compactAnswer = (s: string): string => normalizeAnswer(s).replace(/[\s\p{P}\p{S}]/gu, '');
