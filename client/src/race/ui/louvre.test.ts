// Phase 8B track C: the louvre card (louvreInfo / cardPanel), the lock history, the feed lines, the credits lines and the
// lockWrong toast. Pure parts only; the DOM draws what these return.
import { describe, expect, it } from 'vitest';
import type { AnswerView, ClueCard, CreditItem, FeedMessage, LouvreView, TaskView, TeamInfo } from '@race/shared/protocol';
import { feed as F } from '../../config.ts';
import { baseLines, creditLines } from '../../ui/Credits.ts';
import { feedEntries, feedText, liveEntries } from '../../ui/Feed.ts';
import { lockWrongText } from '../../ui/Toasts.ts';
import { answerLines, cardPanel, hintNews, louvreInfo, statusLine } from './format.ts';

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

  it('SPEC §17.33 "Vào phòng" button: live within enterReach, dimmed with the hint further away, none inside / done', () => {
    expect(louvreInfo(card(lv()), lv(), { now: 0, nearBox: true }).enter).toEqual({ enabled: true, hint: null });
    expect(louvreInfo(card(lv()), lv(), { now: 0 }).enter).toEqual({ enabled: false, hint: 'Tới sát hòm mật thư rồi bấm' });
    expect(louvreInfo(card(lv(), { status: 'locked', lockedUntil: 180_000, lockKind: 'retry' }), lv(), { now: 0, nearBox: true }).enter?.enabled).toBe(true); // a wrong lock's penalty: back in to keep picking
    expect(louvreInfo(card(lv()), lv(), { now: 0, inRoom: true, nearBox: true }).enter).toBeNull();
    expect(louvreInfo(card(lv(), { status: 'done' }), lv(), { now: 0, nearBox: true }).enter).toBeNull();
    expect(P(card(lv()), { nearBox: true }).louvreInfo?.enter?.enabled).toBe(true); // cardPanel passes it through
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

  it('after minute 60: live "Đúng x/5"; 0 picks says so; wrong locks counted', () => {
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

  it('lock history: "· đúng c/5" only when the server sent correct (from minute 60)', () => {
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
  it('wrong before minute 60: no count', () => expect(feedText(m({ minutes: 3 }), teams)).toBe('Đội Xanh trả lời sai và bị phạt 3 phút'));
  it('wrong after minute 60: with the count', () => expect(feedText(m({ minutes: 3, n: 2, of: 5 }), teams)).toBe('Đội Xanh trả lời sai và bị phạt 3 phút · đúng 2/5'));
  it('right after minute 60', () => expect(feedText(m({ ok: true, n: 5, of: 5 }), teams)).toBe('Đội Xanh đúng 5/5'));
  it('unknown slot falls back to "Đội <slot>"; a 0,1 minute test penalty', () => expect(feedText(m({ slot: 7, minutes: 0.1 }), teams)).toBe('Đội 7 trả lời sai và bị phạt 0,1 phút'));
  it('liveEntries: fades after feed.seconds, keeps the newest feed.lines', () => {
    const e = Array.from({ length: F.lines + 2 }, (_, i) => ({ text: `l${i}`, time: '', shownAt: i, key: `k${i}` }));
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

describe('Phase 8B fix F2', () => {
  it('(2) compact card: "Chọn k" / "Chọn k/5" / "Chọn k/5 · Đúng x/5", also beside the countdown; none once done', () => {
    expect(statusLine(card(lv({ picks: ['a'] })), 0)).toEqual({ kind: 'info', text: 'Chọn 1' });
    expect(statusLine(card(lv({ picks: ['a'], hintCount: 5, maxPicks: 5 })), 0)?.text).toBe('Chọn 1/5');
    const l70 = lv({ picks: ['a', 'b'], hintCount: 5, maxPicks: 5, hintCorrect: 1 });
    expect(statusLine(card(l70), 0)?.text).toBe('Chọn 2/5 · Đúng 1/5');
    expect(statusLine(card(l70, { status: 'locked', lockedUntil: 60_000, lockKind: 'retry' }), 0)).toEqual({ kind: 'lock', text: 'Phạt: còn 01:00 · Chọn 2/5 · Đúng 1/5' });
    expect(statusLine(card(l70, { status: 'done' }), 0)).toBeNull();
  });

  it('(2) one toast per hint, when it turns from null to a value on the same step', () => {
    const a = card(lv());
    const b = card(lv({ hintCount: 5, maxPicks: 5 }));
    const c = card(lv({ hintCount: 5, maxPicks: 5, hintCorrect: 3 }));
    expect(hintNews(a, b)).toEqual(['Gợi ý: đáp án gồm 5 tác phẩm – chỉ chọn tối đa 5']);
    expect(hintNews(b, c)).toEqual(['Gợi ý: đang đúng 3/5 – số này đổi theo mỗi lần chọn / bỏ']);
    expect(hintNews(c, card(lv({ hintCount: 5, maxPicks: 5, hintCorrect: 4 })))).toEqual([]); // x/5 changing: no toast
    expect(hintNews(null, c)).toEqual([]); // F5 / first view
    expect(hintNews(a, { ...c, step: 'T4' })).toEqual([]);
  });

  it('(3) a welcome replaces the feed: a line seen before keeps its time (never shown twice), only unseen ones are new', () => {
    const m = (at: number): FeedMessage => ({ t: 'feed', at, slot: 1, ok: false, minutes: 3 });
    const teams: TeamInfo[] = [{ slot: 1, id: 't1', name: 'Đội Xanh', colour: '#00f', online: true }];
    const first = feedEntries([], [m(1), m(2)], teams, 10, true);
    expect(first.map((e) => e.shownAt)).toEqual([10, 10]);
    const again = feedEntries(first, [m(1), m(2), m(3)], teams, 500, true); // reconnect: the kept list incl. one missed line
    expect(again.map((e) => e.shownAt)).toEqual([10, 10, 500]);
    expect(liveEntries(again, 500, F.seconds, F.lines)).toHaveLength(1);
    expect(feedEntries(first, [m(4)], teams, 20, false)).toHaveLength(3); // a {t:'feed'} line appends
  });

  it('(8) credits: the static "Phòng Louvre" line goes once the real section is in, its licence is not repeated', () => {
    const all = [{ title: 'Phòng Louvre', text: 'Ảnh tác phẩm: xem bảng Ghi nguồn sau khi về đích', licence: 'xem bảng Ghi nguồn sau khi về đích', url: 'https://x' }, { title: 'B', text: 'Bản đồ', licence: 'ODbL', url: 'https://y' }];
    expect(baseLines(all, false)[0]).toEqual({ text: 'Ảnh tác phẩm', licence: 'xem bảng Ghi nguồn sau khi về đích', url: 'https://x' });
    expect(baseLines(all, true).map((c) => c.text)).toEqual(['Bản đồ']);
  });
});
