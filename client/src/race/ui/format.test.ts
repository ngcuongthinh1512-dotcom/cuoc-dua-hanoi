import { describe, expect, it } from 'vitest';
import type { ClueCard, RaceView, TaskView } from '@race/shared/protocol';
import { raceHud as C } from '../../config.ts';
import { bookEntries, finishLine, formatDuration, formatHms, penaltyLine, StartOrderBanner, summarize, transportLabel, zoneLines } from './format.ts';

const task: TaskView = { title: 'Nhiệm vụ', description: 'Mô tả', media: [], kind: 'answer', verification: 'auto', proofInstruction: '', timeLimitMinutes: 20 };
const card = (o: Partial<ClueCard>): ClueCard => ({ step: 's', type: 'route_info', label: 'Lộ trình 1', text: 'Mật thư', status: 'done', receivedAt: 1000, completedAt: null, ...o });

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
    expect(s.blocks).toEqual([{ branch: null, title: 'Nhiệm vụ', text: 'Mô tả', place: 'Sân', limit: 'Thời hạn: 20 phút', chosen: false }]);
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
  const view = (o: Partial<RaceView>): RaceView => ({ status: 'running', startAt: 0, finishAt: null, penaltyMinutes: 0, card: null, checkinAt: null, officialMs: null, ...o });
  it('host NPC line with / without the official time', () => {
    expect(finishLine('Đội Xanh', 6_135_000)).toBe('Đội Xanh, các bạn đã về đích! Thời gian: 01:42:15. Thứ hạng chính thức sẽ được Host công bố.');
    expect(finishLine('Đội Xanh', null)).toBe('Đội Xanh, các bạn đã về đích! Thứ hạng chính thức sẽ được Host công bố.');
    expect(formatHms(59_000)).toBe('00:00:59');
  });
  it('penalty countdown until checkinAt, then nothing', () => {
    expect(penaltyLine(view({ checkinAt: 134_000 }), 0)).toBe('Phạt chờ: còn 02:14 trước khi về đích');
    expect(penaltyLine(view({ checkinAt: 134_000 }), 134_000)).toBeNull();
    expect(penaltyLine(view({ checkinAt: null }), 0)).toBeNull();
    expect(penaltyLine(view({ checkinAt: 9e9, finishAt: 5 }), 0)).toBeNull();
    expect(penaltyLine(null, 0)).toBeNull();
    expect(formatDuration(3_725_000)).toBe('1:02:05');
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
