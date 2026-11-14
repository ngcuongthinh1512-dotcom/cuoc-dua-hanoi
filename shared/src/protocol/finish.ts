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

/** Leg 3 Hà Nội: the finish announcement as Ceti says it at the school gate: two speech-bubble beats over his head (`at` in s from the
 *  finish), then the result card. 1) congratulation + "Tôi xin thông báo…" (3 s), 2) the rank in WORDS (nhất, nhì, ba, tư … mười, mười một). */
export interface Beat {
  at: number;
  text: string;
  big?: boolean;
}
export const ANNOUNCE = { second: 3.5, end: 8 } as const; // s: the second line starts, the bubble goes (the card opens then)
const ORDINAL = ['', 'nhất', 'nhì', 'ba', 'tư', 'năm', 'sáu', 'bảy', 'tám', 'chín', 'mười'];
/** The rank spelled out: 1 nhất, 2 nhì, 3 ba, 4 tư, 5 năm … 10 mười, 11 mười một … 19 mười chín, 20 hai mươi; beyond: the digits. */
export function rankWords(n: number): string {
  if (n >= 1 && n <= 10) return ORDINAL[n]!;
  const unit = ['', 'một', 'hai', 'ba', 'bốn', 'lăm', 'sáu', 'bảy', 'tám', 'chín'];
  if (n > 10 && n < 20) return `mười ${n === 15 ? 'lăm' : unit[n - 10]}`;
  if (n === 20) return 'hai mươi';
  return String(n);
}
/** A team that finished but still has a finish-line penalty to serve (rank 0, `waitUntil`): Ceti congratulates it and names the penalty;
 *  the place is told when the countdown ends. `reason` without a final dot. */
export function penaltyBeats(team: string, minutes: number, reason: string): Beat[] {
  return [
    { at: 0, text: `Chúc mừng ${team} đã hoàn thành cuộc đua. Tôi xin thông báo…` },
    { at: ANNOUNCE.second, text: `Đội bạn bị phạt ${minutes} phút do ${reason.trim().replace(/[.\s]+$/, '')}. Hết thời gian phạt, đội bạn sẽ biết thứ hạng.`, big: true },
    { at: ANNOUNCE.end + 3, text: '' },
  ];
}
/** `self` = the finishing team's own screen ("Đội bạn"). */
export function announceBeats(kind: FinishKind, n: number, total: number, team: string, self = true): Beat[] {
  const A = ANNOUNCE;
  if (kind === 'out') return [{ at: 0, text: `Rất tiếc, ${team} đã bị loại khỏi cuộc đua.` }, { at: A.second, text: `Hạng cuối: ${n} trên ${total}.` }, { at: A.end, text: '' }];
  return [
    { at: 0, text: `Chúc mừng ${team} đã hoàn thành cuộc đua. Tôi xin thông báo…` },
    { at: A.second, text: `${self ? 'Đội bạn' : team} là đội về đích thứ ${rankWords(n)}.`, big: true },
    { at: A.end, text: '' },
  ];
}

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
export const FINISH_PENALTY_REASON = 'thử thách ở Lộ trình 1';

/** Leg 3: the finish card's extra line, "Bị phạt 20 phút do thử thách ở Lộ trình 1." (reason without a final dot). */
export const finishPenaltyLine = (p: { minutes: number; reason: string }): string =>
  `Bị phạt ${p.minutes} phút do ${(p.reason.trim() || FINISH_PENALTY_REASON).replace(/[.\s]+$/, '')}.`;
