import { describe, expect, it } from 'vitest';
import { type AnswerStatus, type ClueCard, type FinishResult, NET, type RaceView, type TaskView, type TeamInfo, type ZoneMember } from '@race/shared/protocol';
import { raceHud as C } from '../../config.ts';
import { fmtMinSec } from '../../host/hostView.ts';
import { bookEntries, cardPanel, COPY_OK, copyBlocked, formatDuration, lockLine, penaltyLine, resultView, StartOrderBanner, statusLine, summarize, transportLabel, ZoneList, zoneLines } from './format.ts';

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

describe('zone panel (SPEC §7, Phase 10 V4)', () => {
  const teams: TeamInfo[] = [{ slot: 1, id: 'a', name: 'Đội Xanh', colour: '#00f', online: true }];
  const m = (slot: number, label: string, since: number, left?: number): ZoneMember => ({ slot, label, type: 'challenge', branch: null, since, ...(left !== undefined && { left }) });
  const texts = (ms: ZoneMember[], now = 0) => zoneLines(ms, teams, now).map((l) => l.text);
  const T = 5_000_000; // a server clock reading (ms)
  /** The line of one team that left `age` ms before T, read at T (undefined = dropped). */
  const gone = (age: number) => texts([m(1, 'X', 0, T - age)], T)[0];

  it('the teams here: oldest arrival first, name from welcome.teams (slot fallback), nothing for an empty list', () => {
    expect(texts([m(2, 'Lộ trình 3', 9), m(1, 'Thử thách 2', 3)])).toEqual(['Đội Xanh – đang làm Thử thách 2', 'Đội 2 – đang làm Lộ trình 3']);
    expect(zoneLines([], teams, T)).toEqual([]);
  });

  it('a team that left: "vừa rời đi n phút trước (đang làm …)" AFTER the teams still here, flagged `gone` (drawn dimmer)', () => {
    expect(zoneLines([m(1, 'Thử thách 2', 5, T - 125_000), m(2, 'Lộ trình 3', 9)], teams, T)).toEqual([
      { text: 'Đội 2 – đang làm Lộ trình 3', gone: false },
      { text: 'Đội Xanh – vừa rời đi 3 phút trước (đang làm Thử thách 2)', gone: true }, // 2 min 5 s → 3, though it came first in the list
    ]);
  });

  it('the minutes round UP and are at least 1 (also for a `left` a little ahead of this client\'s clock estimate)', () => {
    const n = (age: number) => /vừa rời đi (\d+) phút trước/.exec(gone(age) ?? '')?.[1];
    expect([-2_000, 0, 1, 59_999, 60_000].map(n)).toEqual(['1', '1', '1', '1', '1']);
    expect([60_001, 120_000, 120_001, 599_999].map(n)).toEqual(['2', '2', '3', '10']);
  });

  it('dropped once now − left > NET.zoneLeftMs: still there AT the limit, gone a millisecond later (the server runs no timer)', () => {
    expect(gone(NET.zoneLeftMs)).toContain(`${Math.ceil(NET.zoneLeftMs / 60_000)} phút trước`);
    expect(gone(NET.zoneLeftMs + 1)).toBeUndefined();
    expect(texts([m(1, 'X', 0, T - NET.zoneLeftMs - 1), m(2, 'Y', 1)], T)).toEqual(['Đội 2 – đang làm Y']); // an expired one never hides a team that is here
  });

  it('order: the teams here by arrival, then the gone ones, the latest to leave first; the input list is left as it was', () => {
    const list = [m(3, 'C', 7, T - 180_000), m(1, 'A', 2), m(4, 'D', 1, T - 60_000), m(2, 'B', 1), m(5, 'E', 3, T - NET.zoneLeftMs - 1)];
    expect(texts(list, T)).toEqual(['Đội 2 – đang làm B', 'Đội Xanh – đang làm A', 'Đội 4 – vừa rời đi 1 phút trước (đang làm D)', 'Đội 3 – vừa rời đi 3 phút trước (đang làm C)']);
    expect(list.map((x) => x.slot)).toEqual([3, 1, 4, 2, 5]);
  });
});

describe('ZoneList (RaceHud rebuilds the panel only when a line changes)', () => {
  const teams: TeamInfo[] = [{ slot: 1, id: 'a', name: 'Đội Xanh', colour: '#00f', online: true }];
  const m = (slot: number, label: string, since: number, left?: number): ZoneMember => ({ slot, label, type: 'challenge', branch: null, since, ...(left !== undefined && { left }) });
  const T = 5_000_000; // the moment team 1 left
  const here = 'Đội 2 – đang làm Lộ trình 3';

  it('a team that left: no redraw within one minute (60 fps), one when the minute ticks over, one when the line expires', () => {
    const z = new ZoneList();
    z.set([m(2, 'Lộ trình 3', 9), m(1, 'Thử thách 2', 3, T)], teams);
    expect(z.ticking).toBe(true);
    expect(z.update(T + 10_000)).toBe(true); // the first frame draws
    expect(z.lines.map((l) => l.text)).toEqual([here, 'Đội Xanh – vừa rời đi 1 phút trước (đang làm Thử thách 2)']);
    for (const age of [10_016, 11_000, 30_000, 59_999, 60_000]) expect(z.update(T + age)).toBe(false); // "1 phút" for the whole first minute
    expect(z.update(T + 60_001)).toBe(true);
    expect(z.lines[1]!.text).toContain('vừa rời đi 2 phút trước');
    expect(z.update(T + 120_000)).toBe(false);
    expect(z.update(T + 120_001)).toBe(true); // "3 phút trước"
    expect(z.update(T + NET.zoneLeftMs)).toBe(true); // the last minute
    expect(z.lines[1]!.text).toContain(`vừa rời đi ${Math.ceil(NET.zoneLeftMs / 60_000)} phút trước`);
    expect(z.update(T + NET.zoneLeftMs + 1)).toBe(true); // expired: the line goes, the team still here stays
    expect(z.lines.map((l) => l.text)).toEqual([here]);
    expect(z.update(T + NET.zoneLeftMs + 2)).toBe(false);
  });

  it('the team comes back (a new list without the gone line): the line turns into "đang làm" at once; a list of teams that are here never ticks', () => {
    const z = new ZoneList();
    z.set([m(1, 'Thử thách 2', 3, T)], teams);
    expect(z.update(T + 1_000)).toBe(true);
    z.set([m(1, 'Thử thách 2', 8)], teams);
    expect(z.ticking).toBe(false);
    expect(z.update(T + 2_000)).toBe(true);
    expect(z.lines).toEqual([{ text: 'Đội Xanh – đang làm Thử thách 2', gone: false }]);
    expect(z.update(T + 9e9)).toBe(false); // time changes nothing for a team that is here
    z.set([m(1, 'Thử thách 2', 8)], teams); // the server sends the same list again (a new object)
    expect(z.update(T + 9e9)).toBe(false);
  });

  it('nothing to draw at the start; a list that empties out redraws once (the panel hides)', () => {
    const z = new ZoneList();
    expect(z.update(T)).toBe(false); // the panel starts hidden
    z.set([m(2, 'Lộ trình 3', 9)], teams);
    expect(z.update(T)).toBe(true);
    z.set([], teams);
    expect(z.update(T)).toBe(true);
    expect(z.lines).toEqual([]);
    expect(z.update(T + 1)).toBe(false);
  });
});

describe('Hoàn tác (Phase 10 V2): the card is what the latest `race` view says, nothing of the old one is kept', () => {
  const sent = (status: AnswerStatus) => ({ id: 1, text: '42', at: 100_000, status });
  const asked = (o: Partial<ClueCard>) => card({ step: 'T1', type: 'challenge', label: 'Thử thách 1', task, retryPenaltyMinutes: 3, ...o });
  const view = (c: ClueCard): RaceView => ({ status: 'running', finishAt: null, penaltyMinutes: 3, card: c, checkinAt: null, result: null });
  const penalized = asked({ status: 'locked', lockedUntil: 280_000, lockKind: 'retry', answers: [sent('penalized')] });
  const undone = asked({ status: 'pending', answers: [sent('pending')] }); // the same answer, back to waiting for the Host

  it('Phạt then Hoàn tác: the countdown is gone from the centre, the top-left card and the full card; the wait counts from the ORIGINAL send time; no answer box', () => {
    const now = 130_000;
    expect(lockLine(view(penalized), now)).toBe('Phạt: còn 02:30 trước khi trả lời lại');
    expect(statusLine(penalized, now)).toEqual({ kind: 'lock', text: 'Phạt: còn 02:30' });
    expect(lockLine(view(undone), now)).toBeNull();
    expect(statusLine(undone, now)).toEqual({ kind: 'wait', text: 'Chờ Host duyệt · 00:30' });
    const p = cardPanel(undone, { now, teamName: 'Đội Xanh', mode: 'card' });
    expect(p).toMatchObject({ status: 'pending', answerBox: false, line: { kind: 'wait', text: 'Đang chờ Host duyệt · 00:30' } });
    expect(p.history.map((h) => [h.status, h.label])).toEqual([['pending', 'Chờ Host duyệt']]);
  });
});
