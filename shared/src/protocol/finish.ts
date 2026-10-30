// SPEC §17.22 / §17.23: the finish announcement ("Về đích thứ n", the winner's, "BỊ LOẠI"). The real wording names the
// finish place, so it lives in the leg file (pit_stop.announce, server-only) and reaches a team only once it finished /
// is out; these generic lines (no place name) fill whatever the leg leaves out, on the server and in the client.

export type FinishKind = 'finish' | 'first' | 'out';
export interface FinishTexts {
  /** The host NPC's line on the mat. */
  npc: string;
  /** The short toast. */
  toast: string;
  /** The finish card (centre of the screen). */
  card: string;
}

/** Placeholders an announcement may hold (leg:check refuses any other {…}). */
export const FINISH_HOLDERS = ['{n}', '{tổng}', '{tên đội}'] as const;

export const FINISH_DEFAULTS: Record<FinishKind, FinishTexts> = {
  finish: {
    npc: '{tên đội}, chúc mừng các bạn đã về đích thứ {n}!',
    toast: 'Về đích thứ {n}/{tổng}',
    card: 'Chúc mừng {tên đội}! Các bạn về đích thứ {n} trên {tổng} đội.',
  },
  first: {
    npc: '{tên đội}, các bạn là đội về đích đầu tiên!',
    toast: 'Về đích thứ 1 – về nhất!',
    card: 'Chúc mừng {tên đội}! Các bạn về nhất trên {tổng} đội.',
  },
  out: {
    npc: '{tên đội}, rất tiếc, các bạn đã bị loại.',
    toast: 'BỊ LOẠI – hạng {n}/{tổng}',
    card: 'Rất tiếc, {tên đội} đã BỊ LOẠI khỏi cuộc đua. Thứ hạng cuối: {n}/{tổng}.',
  },
};

/** "{n}" / "{tổng}" / "{tên đội}" filled (any Unicode form of the leg file: compared in NFC). */
export const fillFinish = (s: string, n: number, total: number, team: string): string =>
  s.normalize('NFC').replaceAll('{n}', String(n)).replaceAll('{tổng}', String(total)).replaceAll('{tên đội}', team);

/** The three lines of `kind`, from the leg's (partial) texts: the winner's falls back to the plain finish texts of the leg,
 *  then to the defaults; "out" never borrows the plain finish texts (they would congratulate an eliminated team). */
export function finishTexts(kind: FinishKind, leg: Partial<FinishTexts> & { first?: Partial<FinishTexts>; out?: Partial<FinishTexts> } | undefined, n: number, total: number, team: string): FinishTexts {
  const pick = (k: keyof FinishTexts) =>
    (kind === 'out' ? leg?.out?.[k] : kind === 'first' ? (leg?.first?.[k] || leg?.[k]) : leg?.[k]) || FINISH_DEFAULTS[kind][k];
  return { npc: fillFinish(pick('npc'), n, total, team), toast: fillFinish(pick('toast'), n, total, team), card: fillFinish(pick('card'), n, total, team) };
}

/** Leg 3: the reason of a finish-line penalty when the Host gives none (a Lựa chọn kép room given up with "Bỏ qua"). */
export const FINISH_PENALTY_REASON = 'bỏ thử thách ở lựa chọn kép';

/** Leg 3: the finish card's extra line, "Bị phạt 20 phút do bỏ thử thách ở lựa chọn kép." (reason without a final dot). */
export const finishPenaltyLine = (p: { minutes: number; reason: string }): string =>
  `Bị phạt ${p.minutes} phút do ${(p.reason.trim() || FINISH_PENALTY_REASON).replace(/[.\s]+$/, '')}.`;
