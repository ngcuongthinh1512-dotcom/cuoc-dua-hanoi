import { describe, expect, it } from 'vitest';
import type { ClueCard, FinishResult, RaceView, TaskView } from '@race/shared/protocol';
import { raceHud as C } from '../../config.ts';
import { fmtMinSec } from '../../host/hostView.ts';
import { bookEntries, COPY_OK, copyBlocked, formatDuration, penaltyLine, resultView, StartOrderBanner, summarize, transportLabel, zoneLines } from './format.ts';

const task: TaskView = { title: 'Nhiệm vụ', description: 'Mô tả', media: [], kind: 'answer', verification: 'auto', input: 'text', proofInstruction: '', timeLimitMinutes: 20 };
const card = (o: Partial<ClueCard>): ClueCard => ({ step: 's', type: 'route_info', label: 'Lộ trình 1', text: 'Mật thư', media: [], status: 'done', lockedUntil: null, lockKind: null, answers: [], receivedAt: 1000, completedAt: null, ...o });

describe('card summary', () => {
  it('route: clue + vehicle rule', () => {
    const s = summarize(card({ transport: { allowed: 'any' } }));
    expect(s.clue).toBe('Mật thư');
    expect(s.transport).toEqual({ icon: 'bike', text: 'Được đi xe đạp' });
    expect(transportLabel({ mandatory: 'walk' })).toEqual({ icon: 'walk', text: 'Bắt buộc đi bộ' });
    expect(summarize(card({ transport: undefined })).transport).toBeNull();
  });
  it('challenge: teaser + one task block with place and limit', () => {
    const s = summarize(card({ type: 'challenge', text: 'Gợi ý', task: { ...task, place: 'Sân' } }));
    expect(s.blocks).toEqual([{ branch: null, title: 'Nhiệm vụ', text: 'Mô tả', place: 'Sân', limit: 'Thời hạn: 20 phút', chosen: false, media: [] }]);
  });
  it('detour: one block per branch; pit stop gets a default line', () => {
    const b = (id: string) => ({ id, name: `Nhánh ${id}`, summary: `Tóm tắt ${id}`, task });
    const s = summarize(card({ type: 'detour', branches: [b('A'), b('B')] }));
    expect(s.blocks.map((x) => [x.branch, x.title, x.text])).toEqual([['A', 'Nhánh A', 'Tóm tắt A'], ['B', 'Nhánh B', 'Tóm tắt B']]);
    expect(s.blocks.map((x) => x.chosen)).toEqual([false, false]);
    expect(summarize(card({ type: 'detour', branch: 'B', branches: [b('A'), b('B')] })).blocks.map((x) => x.chosen)).toEqual([false, true]);
    expect(summarize(card({ type: 'pit_stop', text: '' })).clue).toMatch(/Chặng dừng/);
  });
});

describe('Sổ mật thư', () => {
  const cards = [card({ step: 'a', receivedAt: 0, completedAt: 90_000 }), card({ step: 'b', status: 'active', receivedAt: 90_000 }), card({ step: 'c', receivedAt: 5, completedAt: 6 })];
  it('current (active) card pinned first, the others in the order received', () => {
    const e = bookEntries(cards);
    expect(e.map((x) => [x.card.step, x.pinned])).toEqual([['b', true], ['a', false], ['c', false]]);
    expect(e[0]!.status).toBe('Đang làm');
    expect(e[1]!.status).toBe('Đã xong');
  });
  it('time spent on a finished step; none while active', () => {
    const e = bookEntries(cards);
    expect(e[1]!.duration).toBe('01:30');
    expect(e[0]!.duration).toBeNull();
    expect(e[0]!.completed).toBeNull();
  });
  it('no active card (finished): the newest is pinned; empty book', () => {
    expect(bookEntries([cards[0]!, cards[2]!])[0]!.card.step).toBe('c');
    expect(bookEntries([])).toEqual([]);
  });
});

describe('start-order banner', () => {
  it('shows exactly startOrderSeconds of sim time, then off', () => {
    const b = new StartOrderBanner();
    expect(b.visible(0)).toBe(false); // never shown
    b.show(2, 10);
    expect(b.text).toBe('Xuất phát ở vị trí thứ 2');
    expect(b.visible(10)).toBe(true);
    expect(b.visible(10 + C.startOrderSeconds - 0.01)).toBe(true);
    expect(b.visible(10 + C.startOrderSeconds)).toBe(false);
  });
  it('only once: a second show (reconnect, next step) changes nothing', () => {
    const b = new StartOrderBanner();
    b.show(1, 0);
    b.show(4, 100);
    expect(b.text).toBe('Xuất phát ở vị trí thứ 1');
    expect(b.visible(100)).toBe(false);
  });
});

describe('Pit Stop lines', () => {
  const view = (o: Partial<RaceView>): RaceView => ({ status: 'running', finishAt: null, penaltyMinutes: 0, card: null, checkinAt: null, result: null, ...o });
  it('SPEC §17.22 / §17.23: the finish announcement is the server\'s text (rank only, no time); an empty text → the generic line, never a place', () => {
    const r: FinishResult = { rank: 3, total: 7, kind: 'finish', npc: 'Đội Xanh về đích thứ 3 tại X!', toast: 'Về đích thứ 3/7', card: 'Thẻ' };
    expect(resultView(r, 'Đội Xanh')).toEqual({ npc: 'Đội Xanh về đích thứ 3 tại X!', toast: 'Về đích thứ 3/7', card: 'Thẻ', title: 'Về đích thứ 3' });
    expect(resultView({ ...r, npc: '' }, 'Đội Xanh').npc).toBe('Đội Xanh, chúc mừng các bạn đã về đích thứ 3!');
    const out = resultView({ ...r, rank: 7, kind: 'out', card: '' }, 'Đội Đỏ');
    expect(out).toMatchObject({ title: 'BỊ LOẠI', npc: 'Đội Xanh về đích thứ 3 tại X!', card: 'Rất tiếc, Đội Đỏ đã BỊ LOẠI khỏi cuộc đua. Thứ hạng cuối: 7/7.' });
    expect(resultView({ ...r, rank: 1, kind: 'first', toast: '' }, 'Đội Xanh')).toMatchObject({ title: 'Về đích thứ 1', toast: 'Về đích thứ 1 – về nhất!' });
    for (const k of ['npc', 'toast', 'card'] as const) expect(resultView({ ...r, npc: '', toast: '', card: '' }, 'A')[k]).not.toMatch(/\d:\d\d|Thời gian/);
  });
  it('book "Thời gian làm" reads like the Host step matrix (mm:ss)', () => {
    for (const ms of [1_245_909, 1_245_400, 483_873, 59_500, 3_599_000]) if (ms >= 60_000) expect(formatDuration(ms)).toBe(fmtMinSec(ms));
  });
  it('penalty countdown until checkinAt, then nothing', () => {
    expect(penaltyLine(view({ checkinAt: 134_000 }), 0)).toBe('Phạt chờ: còn 02:14 trước khi về đích');
    expect(penaltyLine(view({ checkinAt: 134_000 }), 400)).toBe('Phạt chờ: còn 02:14 trước khi về đích'); // counts down: 133.6 s → 2:14
    expect(penaltyLine(view({ checkinAt: 134_000 }), 133_999)).toBe('Phạt chờ: còn 00:01 trước khi về đích');
    expect(penaltyLine(view({ checkinAt: 134_000 }), 134_000)).toBeNull();
    expect(penaltyLine(view({ checkinAt: null }), 0)).toBeNull();
    expect(penaltyLine(view({ checkinAt: 9e9, finishAt: 5 }), 0)).toBeNull();
    expect(penaltyLine(null, 0)).toBeNull();
    expect(formatDuration(3_725_000)).toBe('1:02:05');
  });
});

describe('SPEC §17.21: no copying clue text', () => {
  // a stand-in for Element.closest over a parent chain (Node tests: no DOM)
  const node = (cls: string, parent: object | null = null) => ({ cls, parentElement: parent, closest(sel: string): unknown { return sel.split(', ').some((s) => s === `.${this.cls}` || s === this.cls) ? this : (this.parentElement as { closest?: (s: string) => unknown } | null)?.closest?.(sel) ?? null; } });
  it('blocked in the card text, the Sổ and a Text node there; allowed in the submission code and the answer box', () => {
    const card = node('rc-full');
    const text = node('rc-text', card);
    const code = node('rc-code', card);
    expect(copyBlocked(text)).toBe(true);
    expect(copyBlocked(card)).toBe(true);
    expect(copyBlocked({ parentElement: text })).toBe(true); // a Text node inside the clue
    expect(copyBlocked(code)).toBe(false);
    expect(copyBlocked({ parentElement: code })).toBe(false); // selecting the code's text
    expect(copyBlocked(node('input', card))).toBe(false);
    expect(copyBlocked(null)).toBe(true);
    expect(COPY_OK).toContain('.rc-code');
  });
});

describe('zone panel', () => {
  it('oldest arrival first, team name from welcome.teams (slot fallback)', () => {
    const teams = [{ slot: 1, id: 'a', name: 'Đội Xanh', colour: '#00f', online: true }];
    const m = (slot: number, label: string, since: number) => ({ slot, label, type: 'challenge' as const, branch: null, since });
    expect(zoneLines([m(2, 'Lộ trình 3', 9), m(1, 'Thử thách 2', 3)], teams)).toEqual(['Đội Xanh – đang làm Thử thách 2', 'Đội 2 – đang làm Lộ trình 3']);
    expect(zoneLines([], teams)).toEqual([]);
  });
});
