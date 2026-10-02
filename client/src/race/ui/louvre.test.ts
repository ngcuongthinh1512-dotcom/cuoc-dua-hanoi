// Phase 8B track C: the louvre card (louvreInfo / cardPanel), the lock history, the feed lines, the credits lines and the
// lockWrong toast. Pure parts only; the DOM draws what these return.
import { describe, expect, it } from 'vitest';
import type { AnswerView, ClueCard, CreditItem, FeedMessage, LouvreView, TaskView, TeamInfo } from '@race/shared/protocol';
import { feed as F } from '../../config.ts';
import { creditLines } from '../../ui/Credits.ts';
import { feedText, liveEntries } from '../../ui/Feed.ts';
import { lockWrongText } from '../../ui/Toasts.ts';
import { answerLines, cardPanel, louvreInfo } from './format.ts';

const lv = (o: Partial<LouvreView> = {}): LouvreView => ({
  artworks: Array.from({ length: 23 }, (_, i) => ({ id: `art-${i + 1}`, type: 'painting' as const, image: '' })),
  room: { x: 0, z: 0, r: 25, yaw: 0 },
  picks: [], attempts: 0, hintAt: [1000, 2000], hintCount: null, hintCorrect: null, maxPicks: null, ...o,
});
const task = (l: LouvreView): TaskView => ({ title: 'Phòng', description: 'd', media: [], kind: 'louvre', verification: 'auto', input: 'room', proofInstruction: '', timeLimitMinutes: null, louvre: l });
const card = (l: LouvreView, o: Partial<ClueCard> = {}): ClueCard => ({ step: 'T3', type: 'challenge', label: 'Thử thách 3', text: '', media: [], status: 'active', lockedUntil: null, lockKind: null, answers: [], receivedAt: 0, completedAt: null, retryPenaltyMinutes: 3, task: task(l), ...o });
const P = (c: ClueCard, o: Partial<Parameters<typeof cardPanel>[1]> = {}) => cardPanel(c, { now: 0, teamName: 'Đội Xanh', mode: 'card', ...o });

describe('louvre card', () => {
  it('no input box, whatever the state', () => {
    expect(P(card(lv())).answerBox).toBe(false);
    expect(P(card(lv()), { inRoom: true }).answerBox).toBe(false);
  });

  it('states: outside / inside / locked / done, with the F reminder outside', () => {
    expect(louvreInfo(card(lv()), lv(), { now: 0 })).toMatchObject({ state: 'outside', text: 'Chưa vào phòng – bấm F ở hòm để vào phòng' });
    expect(louvreInfo(card(lv()), lv(), { now: 0, inRoom: true }).state).toBe('inside');
    expect(louvreInfo(card(lv(), { status: 'locked', lockedUntil: 180_000, lockKind: 'retry' }), lv(), { now: 0, inRoom: true }).state).toBe('locked');
    expect(louvreInfo(card(lv(), { status: 'done' }), lv(), { now: 0, inRoom: true }).state).toBe('done');
  });

  it('a lock whose countdown ran out is "inside" again (liveStatus)', () => {
    expect(louvreInfo(card(lv(), { status: 'locked', lockedUntil: 1000, lockKind: 'retry' }), lv(), { now: 100_000, inRoom: true }).state).toBe('inside');
  });

  it('the locked card shows the shared 3-minute countdown line', () => {
    const p = P(card(lv(), { status: 'locked', lockedUntil: 180_000, lockKind: 'retry' }), { inRoom: true });
    expect(p.line?.text).toBe('Phạt: còn 03:00 trước khi trả lời lại');
    expect(p.louvreInfo?.state).toBe('locked');
  });

  it('before the 40-minute hint: "Đang chọn k tác phẩm", no count, no hint', () => {
    expect(louvreInfo(card(lv()), lv({ picks: ['art-1', 'art-2'] }), { now: 0 }).lines).toEqual(['Đang chọn 2 tác phẩm']);
  });

  it('after minute 40: "k/5" and "Đáp án bao gồm 5 tác phẩm"; still no x/5', () => {
    const l = lv({ picks: ['art-1', 'art-2'], hintCount: 5, maxPicks: 5 });
    expect(louvreInfo(card(l), l, { now: 0 }).lines).toEqual(['Đang chọn 2/5 tác phẩm', 'Đáp án bao gồm 5 tác phẩm']);
  });

  it('after minute 70: live "Đúng x/5"; 0 picks says so; wrong locks counted', () => {
    const l = lv({ picks: ['a', 'b', 'c'], attempts: 2, hintCount: 5, maxPicks: 5, hintCorrect: 2 });
    expect(louvreInfo(card(l), l, { now: 0 }).lines).toEqual(['Đang chọn 3/5 tác phẩm', 'Chốt sai: 2 lần', 'Đáp án bao gồm 5 tác phẩm', 'Đúng 2/5']);
    const none = lv({ hintCount: 5, maxPicks: 5, hintCorrect: 0 });
    expect(louvreInfo(card(none), none, { now: 0 }).lines.at(-1)).toBe('Đúng 0/5 (chưa chọn tác phẩm nào)');
  });

  it('no live numbers in the Sổ mật thư; other cards have no louvre info', () => {
    expect(P(card(lv()), { mode: 'book' }).louvreInfo).toBeNull();
    expect(P(card(lv({ hintCorrect: 3 })), { mode: 'book' }).history).toEqual([]);
    expect(P({ ...card(lv()), task: { ...task(lv()), input: 'text', louvre: undefined } }).louvreInfo).toBeNull();
  });

  it('lock history: "· đúng c/5" only when the server sent correct (from minute 70)', () => {
    const a = (id: number, o: Partial<AnswerView> = {}): AnswerView => ({ id, text: '5 tác phẩm', at: id * 1000, status: 'penalized', ...o });
    const lines = answerLines(card(lv({ hintCount: 5, maxPicks: 5 }), { answers: [a(1), a(2, { correct: 3 })] }));
    expect(lines.map((l) => l.label)).toEqual(['Bị phạt 3 phút · đúng 3/5', 'Bị phạt 3 phút']);
    expect(lines[0]!.text).toBe('5 tác phẩm'); // no «» quotes
  });

  it('the card carries nothing but ClueCard fields (no answers / notes / credits)', () => {
    const json = JSON.stringify(P(card(lv({ picks: ['art-1'] }))));
    expect(json).not.toMatch(/credit|artist|license|photo/i);
  });
});

describe('feedText', () => {
  const teams: TeamInfo[] = [{ slot: 1, id: 't1', name: 'Đội Xanh', colour: '#fff', online: true }];
  const m = (o: Partial<FeedMessage>): FeedMessage => ({ t: 'feed', at: 0, slot: 1, ok: false, ...o });
  it('wrong before minute 70: no count', () => expect(feedText(m({ minutes: 3 }), teams)).toBe('Đội Xanh trả lời sai và bị phạt 3 phút'));
  it('wrong after minute 70: with the count', () => expect(feedText(m({ minutes: 3, n: 2, of: 5 }), teams)).toBe('Đội Xanh trả lời sai và bị phạt 3 phút · đúng 2/5'));
  it('right after minute 70', () => expect(feedText(m({ ok: true, n: 5, of: 5 }), teams)).toBe('Đội Xanh đúng 5/5'));
  it('unknown slot falls back to "Đội <slot>"; a 0,1 minute test penalty', () => expect(feedText(m({ slot: 7, minutes: 0.1 }), teams)).toBe('Đội 7 trả lời sai và bị phạt 0,1 phút'));
  it('liveEntries: fades after feed.seconds, keeps the newest feed.lines', () => {
    const e = Array.from({ length: F.lines + 2 }, (_, i) => ({ text: `l${i}`, time: '', shownAt: i }));
    expect(liveEntries(e, 0, F.seconds, F.lines).map((x) => x.text)).toEqual(e.slice(-F.lines).map((x) => x.text));
    expect(liveEntries(e, F.seconds + 2.5, F.seconds, F.lines).map((x) => x.text)).toEqual(e.slice(3).slice(-F.lines).map((x) => x.text));
    expect(liveEntries(e, 1e6, F.seconds, F.lines)).toEqual([]);
  });
});

describe('creditLines / lockWrongText', () => {
  const c: CreditItem = { file: 'art-03.webp', title: 'Tiêu đề', artist: 'Họa sĩ', photo: 'Ảnh: A', license: 'CC BY 4.0', source: 'https://example.org/x' };
  it('one line per picture with its licence and an https link only', () => {
    expect(creditLines([c, { ...c, file: 'art-04.glb', source: 'javascript:alert(1)', artist: '' }])).toEqual([
      { text: 'art-03.webp · «Tiêu đề» – Họa sĩ · Ảnh: A', license: 'CC BY 4.0', href: 'https://example.org/x' },
      { text: 'art-04.glb · «Tiêu đề» · Ảnh: A', license: 'CC BY 4.0', href: '' },
    ]);
    expect(creditLines([])).toEqual([]);
  });
  it("lockWrong names the card's minutes", () => {
    expect(lockWrongText(3)).toContain('phạt 3 phút');
    expect(lockWrongText(0.1)).toContain('phạt 0,1 phút');
    expect(lockWrongText(undefined)).toContain('Chưa đúng');
  });
});
