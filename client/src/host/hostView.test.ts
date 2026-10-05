import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isClientMessage, MEDIA, NET, type HostState } from '@race/shared/protocol';
import { describe, expect, it } from 'vitest';
import { ago, answerMatch, billableRequests, checkMediaFile, corridorPoints, counterLines, csvLine, demoExportText, demoState, exportConfirm, exportErrorText, exportFileName, exportPath, fetchExport, flagText, fmtMinSec, freshAlerts, freshQueue, legPenaltyLine, MAX_TEAM_NAME, MAX_TEAMS_PER_BATCH, mediaErrorText, mediaNames, mediaPath, openBlanks, parseTeamLines, progressTable, queueRows, queueSig, reviewMessage, startRows, statusButtons, stuckAlerts, teamRows, undoMessage, undoRows, warnings, withLouvreDemo, louvreLines } from './hostView.ts';

describe('Host view', () => {
  it('billable requests = http + alarms + wsIn / 20 rounded up', () => {
    expect(billableRequests({ wsIn: 41, wsOut: 0, http: 3, alarms: 2, rows: 0 })).toBe(8);
  });

  it('builds table rows from host.state', () => {
    const rows = teamRows(demoState());
    expect(rows.map((r) => [r.name, r.status, r.reconnects])).toEqual([['Đội Xanh', 'online', 1], ['Đội Đỏ', 'online', 0], ['Đội Vàng', 'offline', 3], ['Đội Lục', 'offline', 0], ['Đội Tím', 'offline', 1], ['Đội Cam', 'offline', 0], ['Đội Nâu', 'online', 0]]);
    expect(rows[0]!.code).toBe('K7M3QX');
    expect(rows[0]!.position).toMatch(/^22\.\d+, 113\.\d+$/);
    expect(rows[2]!.lastSeen).toBe('1 phút trước');
    expect(rows[3]).toMatchObject({ lastSeen: '—', position: '—' });
    expect(rows[1]!.flagged).toBe(true);
  });

  it('counter lines include the estimated billable requests', () => {
    expect(counterLines(demoState()).find(([k]) => k.startsWith('Request tính phí'))![1]).toBe((12 + 3 + Math.ceil(18_420 / 20)).toLocaleString('vi-VN'));
  });

  it('parses "name; player" lines and cycles the colours', () => {
    expect(parseTeamLines('Đội A; An\n\n Đội B ', ['#111', '#222'], 1)).toEqual({ teams: [{ name: 'Đội A', colour: '#222', player: 'An' }, { name: 'Đội B', colour: '#111' }], error: null });
  });

  it('flags what the server would reject (it closes the Host socket 4400 and creates no team at all)', () => {
    const colours = ['#111'];
    const long = 'Đội Đỏ – Trường THPT Nguyễn Trãi, Hà Nội, khóa 2026';
    expect(long.length).toBeGreaterThan(MAX_TEAM_NAME);
    expect(parseTeamLines('Đội Xanh; An\n; Bình', colours)).toMatchObject({ teams: [], error: expect.stringContaining('Dòng 2') });
    expect(parseTeamLines(`${long}; Bình`, colours)).toMatchObject({ teams: [], error: expect.stringContaining(`${long.length} ký tự`) });
    expect(parseTeamLines('x\n'.repeat(MAX_TEAMS_PER_BATCH + 1), colours).error).toContain(`${MAX_TEAMS_PER_BATCH}`);
  });

  it('whatever parseTeamLines accepts passes the server codec; the limits sit exactly on its edge', () => {
    const ok = (text: string) => {
      const { teams, error } = parseTeamLines(text, ['#2c6bd8']);
      return error === null && isClientMessage({ t: 'host.createTeams', teams }, 'host');
    };
    expect(ok('Đội A; An\r\nĐội B')).toBe(true);
    expect(ok(`${'n'.repeat(MAX_TEAM_NAME)}; p`)).toBe(true);
    expect(ok(Array.from({ length: MAX_TEAMS_PER_BATCH }, (_, i) => `Đội ${i}`).join('\n'))).toBe(true);
    expect(isClientMessage({ t: 'host.createTeams', teams: [{ name: 'n'.repeat(MAX_TEAM_NAME + 1), colour: '#111' }] }, 'host')).toBe(false); // the edge is real
  });

  it('"x giây trước" follows the clock the page estimates, not the stale state.serverMs', () => {
    const s = demoState(1_000_000);
    expect(teamRows(s)[2]!.lastSeen).toBe('1 phút trước'); // 95 s
    expect(teamRows(s, s.serverMs + 30_000)[2]!.lastSeen).toBe('2 phút trước'); // 125 s
  });

  it('ago', () => {
    expect(ago(null, 5)).toBe('—');
    expect(ago(0, 7_200_000)).toBe('2 giờ trước');
  });

  it('mm:ss rounds once: 59.6 s is 01:00, 119.5 s is 02:00', () => {
    expect(fmtMinSec(59_600)).toBe('01:00');
    expect(fmtMinSec(119_500)).toBe('02:00');
    expect(fmtMinSec(-61_000)).toBe('01:01');
  });

  it('status buttons follow the race state machine (D9)', () => {
    const s = demoState();
    const labels = (status: typeof s.status) => statusButtons({ ...s, status }).map((b) => b.op);
    expect(labels('lobby')).toEqual(['start']);
    expect(labels('running')).toEqual(['pause', 'finish']);
    expect(labels('paused')).toEqual(['resume', 'finish']);
    expect(labels('finished')).toEqual([]);
    // "Mở cuộc đua" lists what is still empty; SPEC §17.23: never a start time (no team clock)
    expect(statusButtons({ ...s, status: 'lobby' })[0]!.confirm).toContain('chưa có mật thư');
    expect(statusButtons({ ...s, status: 'lobby' })[0]!.confirm).not.toContain('giờ xuất phát');
    // SPEC §17.23 (Chốt): "Kết thúc" names the teams still racing, which will read "BỊ LOẠI"
    const end = statusButtons(s).find((b) => b.op === 'finish')!.confirm!;
    expect(end).toContain('6 đội chưa về đích sẽ nhận thông báo BỊ LOẠI: Đội Đỏ, Đội Vàng, Đội Lục, Đội Tím, Đội Cam, Đội Nâu.');
    expect(statusButtons(s).find((b) => b.op === 'pause')!.confirm).not.toMatch(/[Đđ]ồng hồ/);
  });

  it('red banner: lobby with teams online; SPEC §17.23: nothing about start times any more', () => {
    const s = demoState();
    expect(warnings({ ...s, status: 'lobby' })).toEqual(['Cuộc đua chưa mở nhưng đã có 3 đội trong game (các đội xem được mật thư 1 nhưng chưa mở được hòm).']);
    expect(warnings(s)).toEqual([]);
    expect(openBlanks({ ...s, leg: null })).toContain('Chưa nạp chặng.');
    expect(openBlanks(s).join('\n')).not.toContain('giờ xuất phát');
  });

  it('"Thứ tự vào game" rows: entry order + first entry in the leg zone; no start-time input (SPEC §17.23)', () => {
    const s = demoState(Date.UTC(2026, 9, 3, 8, 0, 0));
    const r = startRows(s)[0]!;
    expect(r).toEqual({ id: 't0', name: 'Đội Xanh', colour: '#2c6bd8', startOrder: '1', joined: '14:12:00', stepLabel: 'Đã về đích', penalty: '—' }); // 08:00 UTC − 48 min = 07:12 UTC = 14:12 ICT
    expect(startRows(s)[3]).toMatchObject({ joined: '—', startOrder: '—' });
  });

  it('step_progress matrix: done / active / todo cells, rows in finish order, BỊ LOẠI marked; no official time / T+ (SPEC §17.23)', () => {
    const now = 3_000_000_000;
    const s = demoState(now);
    const { head, rows } = progressTable(s, now);
    expect(head.map((h) => h.label)).toEqual(['Lộ trình 1', 'Thử thách 1', 'Lộ trình 2', 'Lựa chọn kép', 'Lộ trình 3', 'Thử thách 2', 'Về đích']);
    expect(rows.map((r) => [r.name, r.rank])).toEqual([['Đội Xanh', '1'], ['Đội Vàng', '2'], ['Đội Đỏ', '3'], ['Đội Lục', '—'], ['Đội Tím', '—'], ['Đội Cam', '—'], ['Đội Nâu', '—']]);
    const blue = rows[0]!;
    expect(blue.cells.every((c) => c.state === 'done')).toBe(true);
    expect(Object.keys(blue).sort()).toEqual(['cells', 'colour', 'finish', 'flagged', 'name', 'out', 'penalty', 'rank', 'team']);
    expect(blue.cells[0]!.text).toMatch(/^\d\d:\d\d:\d\d$/); // only when it was done (no duration)
    expect(blue.cells[3]!.text).toContain(' · Tính (A) ↺1'); // branch A after one switch
    const red = rows[2]!;
    expect(red.cells.map((c) => c.state)).toEqual(['done', 'done', 'done', 'active', 'todo', 'todo', 'todo']);
    expect(red.cells[3]!.text).toBe('08:00 · Ảnh (B)'); // 50 − 8 − 42 = 8 min since the clue of D1 reached it; took branch B
    expect(red.penalty).toBe('+2 phút');
    expect(rows[3]!.cells.map((c) => c.state)).toEqual(['active', 'todo', 'todo', 'todo', 'todo', 'todo', 'todo']); // holds clue 1 (D3), no times yet
    expect(rows[0]!.cells[0]!.title).toContain('Tới điểm');
    const out = progressTable({ ...s, ranking: s.ranking.map((r) => (r.team === 't1' ? { ...r, out: true } : r)) }, now).rows[2]!;
    expect([out.name, out.rank, out.out]).toEqual(['Đội Đỏ', '3 · BỊ LOẠI', true]);
  });

  it('corridor points: start → every zone in order incl. both detour places; checkpoints = all zones, deduplicated', () => {
    const leg = demoState().leg!;
    const { points, checkpoints } = corridorPoints(leg);
    const at = (x: number, z: number) => ({ x: expect.closeTo(x, 3), z: expect.closeTo(z, 3) });
    const st = leg.steps;
    expect(points[0]).toEqual(leg.start);
    // L1, T1 (own location), L2 = D1 branch A (same place), Khoảng sân rộng ở Tap Seac (branch B), L3 = PS
    expect(points.slice(1)).toEqual([at(st[0]!.x, st[0]!.z), at(st[1]!.x, st[1]!.z), at(st[2]!.x, st[2]!.z), at(st[3]!.branches![1]!.x, st[3]!.branches![1]!.z), at(st[4]!.x, st[4]!.z)]);
    expect(checkpoints).toHaveLength(5);
    expect(checkpoints).toContainEqual(at(st[1]!.x, st[1]!.z)); // a challenge's own location is a checkpoint
  });
});

// ── Phase 8 (docs/plans/phase8.md D10 / D11 / D14 / D16, track E) ──
const NOW = 3_000_000_000;
const MIN = 60_000;
type Row = HostState['progress'][number];
/** demoState with one progress row of a team replaced. */
const withRow = (s: HostState, team: string, step: string, more: Partial<Row>): HostState => ({ ...s, progress: s.progress.map((p) => (p.team === team && p.step === step ? { ...p, ...more } : p)) });
const withTeam = (s: HostState, id: string, more: Partial<HostState['teams'][number]>): HostState => ({ ...s, teams: s.teams.map((t) => (t.id === id ? { ...t, ...more } : t)) });
const rowOf = (s: HostState, name: string, now = NOW) => progressTable(s, now).rows.find((r) => r.name === name)!;

describe('review queue (D16 (1))', () => {
  const s = demoState(NOW);

  it('lists every pending answer oldest first, with the submit code, the waiting time and the reference answers', () => {
    const rows = queueRows(s, NOW);
    expect(rows.map((r) => [r.name, r.step, r.branch, r.id, r.waiting])).toEqual([['Đội Vàng', 'D1', 'B', 1, '02:30'], ['Đội Cam', 'D1', 'A', 1, '00:45'], ['Đội Nâu', 'T2', null, 2, '00:20']]);
    expect(rows[0]).toMatchObject({ code: 'Đội Vàng-D1-B', text: '', reference: ['(MẪU) Hình chụp rõ biển tên đường ở góc phố'], lockMinutes: 3, key: 't2|D1|1', label: 'Lựa chọn kép' });
    expect(rows[1]).toMatchObject({ code: 'Đội Cam-D1-A', text: 'sáu', reference: ['7', 'bảy'], branchName: 'Tính (A)' }); // the team's name for it, visual#3
    expect(rows[0]!.branchName).toBe('Ảnh (B)');
    // the order is by `at`, whatever order the server sent
    expect(queueRows({ ...s, queue: [...s.queue].reverse() }, NOW).map((r) => r.name)).toEqual(['Đội Vàng', 'Đội Cam', 'Đội Nâu']);
    // a team the page does not know (should not happen) still shows by its id
    expect(queueRows({ ...s, teams: [] }, NOW)[0]).toMatchObject({ name: 't2', code: 't2-D1-B' });
  });

  it('the waiting time runs with the clock the page estimates', () => {
    expect(queueRows(s, NOW + 8 * MIN)[0]!.waiting).toBe('10:30');
  });

  it('the page rebuilds only when who / which step / which answer / when changes (a typed note must survive the 1 s refresh)', () => {
    const sig = queueSig(s);
    expect(queueSig({ ...s, queue: s.queue.map((q) => ({ ...q, note: 'đã xem ảnh' })) })).toBe(sig); // the Host saved a note: not a rebuild
    expect(queueSig({ ...s, queue: [...s.queue, { ...s.queue[0]!, team: 't0', id: 2, at: NOW }] })).not.toBe(sig);
    expect(queueSig({ ...s, queue: s.queue.slice(1) })).not.toBe(sig);
  });

  it('only a new answer is "new"; the first state of a page load is not', () => {
    const seen = new Set<string>();
    const rows = queueRows(s, NOW);
    expect(freshQueue(seen, rows, true)).toEqual([]); // baseline
    expect(freshQueue(seen, rows, false)).toEqual([]);
    const more = queueRows({ ...s, queue: [...s.queue, { ...s.queue[0]!, team: 't0', id: 3, at: NOW }] }, NOW);
    expect(freshQueue(seen, more, false).map((r) => r.key)).toEqual(['t0|D1|3']);
    expect(freshQueue(seen, more, false)).toEqual([]);
  });

  it('host.review messages pass the server codec; the note is trimmed, cut to NET.noteMax and left out when empty', () => {
    const ok = (m: unknown) => isClientMessage(m, 'host');
    expect(reviewMessage('t2', 'D1', 'approve', 1, '')).toEqual({ t: 'host.review', team: 't2', step: 'D1', op: 'approve', id: 1 });
    expect(reviewMessage('t2', 'D1', 'penalize', 1, '  ảnh mờ ')).toEqual({ t: 'host.review', team: 't2', step: 'D1', op: 'penalize', id: 1, note: 'ảnh mờ' });
    expect(reviewMessage('t2', 'T1', 'approve', undefined, '')).toEqual({ t: 'host.review', team: 't2', step: 'T1', op: 'approve' }); // photo task approved at once
    expect(reviewMessage('t2', 'T1', 'note', undefined, '')).toMatchObject({ op: 'note', note: '' }); // an empty note clears it
    const long = reviewMessage('t2', 'T1', 'note', undefined, 'x'.repeat(NET.noteMax + 50));
    expect(long.note).toHaveLength(NET.noteMax);
    for (const m of [reviewMessage('t2', 'D1', 'approve', 1, ''), reviewMessage('t2', 'D1', 'penalize', 1, 'n'), reviewMessage('t2', 'T1', 'approve', undefined, ''), reviewMessage('t2', 'T1', 'note', undefined, ''), long]) expect(ok(m)).toBe(true);
    expect(isClientMessage(reviewMessage('t2', 'D1', 'approve', 1, ''), 'team')).toBe(false); // a team can never send it
  });
});

describe('SPEC §17.44: a multi-box answer in the queue', () => {
  it('lists the N strings with their labels ("Ô n" when none), no match badge; scoreOf comes from the server', () => {
    const s = demoState(NOW);
    const q = { ...s.queue[0]!, team: 't5', step: 'T1', branch: null, id: 1, text: 'nơi một | nơi hai | x | y', reference: [], scoreOf: 4, scoreFrom: NOW + 60_000, partLabels: ['Địa điểm 1', '', 'Địa điểm 3', ''] };
    const r = queueRows({ ...s, queue: [q] }, NOW)[0]!;
    expect(r.parts).toEqual([{ label: 'Địa điểm 1', text: 'nơi một' }, { label: 'Ô 2', text: 'nơi hai' }, { label: 'Địa điểm 3', text: 'x' }, { label: 'Ô 4', text: 'y' }]);
    expect(r.match).toBeNull();
    expect(r.score).toEqual({ scoreOf: 4, scoreHint: 'đội chưa thấy số: còn 1 phút' });
    expect(queueRows({ ...s, queue: [{ ...q, partLabels: undefined }] }, NOW)[0]!.parts).toBeNull();
  });
});

describe('review cards (SPEC §17.42): the match badge and the earlier tries', () => {
  const s = demoState(NOW);

  it('answerMatch ignores diacritics / case / đ / extra spaces; no badge without text (a photo) or without reference answers', () => {
    expect(answerMatch('cau iena', ['Cầu Iéna', 'Pont d’Iéna'])).toBe('yes');
    expect(answerMatch('  THAP   đồng  Hồ ', ['Tháp Đồng Hồ'])).toBe('yes');
    expect(answerMatch('Bảy', ['7', 'bảy'])).toBe('yes');
    expect(answerMatch('sáu', ['7', 'bảy'])).toBe('no');
    expect(answerMatch('cầu iéna 2', ['Cầu Iéna'])).toBe('no'); // whole answer, not a prefix
    expect(answerMatch('', ['(MẪU) Hình chụp rõ biển tên đường ở góc phố'])).toBeNull();
    expect(answerMatch('   ', ['x'])).toBeNull();
    expect(answerMatch('x', [])).toBeNull();
  });

  it('queue rows: the badge, the place name, the wait in ms, "Lần gửi thứ n" with the earlier tries of the same task (same branch, Host notes kept)', () => {
    const rows = queueRows(s, NOW);
    const nau = rows.find((r) => r.name === 'Đội Nâu')!;
    expect(nau).toMatchObject({ match: 'yes', attempt: 2, stepName: 'Jardim Vasco da Gama', waitMs: 20_000, label: 'Thử thách 2', text: 'cau iena', code: 'Đội Nâu-T2' });
    expect(nau.previous).toEqual([`Lần 1: «Cầu Alma» · bị phạt · ${fmtTime(NOW - 4 * MIN)} · ghi chú: Sai cầu`]);
    expect(rows.find((r) => r.name === 'Đội Cam')).toMatchObject({ match: 'no', attempt: 1, previous: [], stepName: 'Praça do Tap Seac' });
    expect(rows.find((r) => r.name === 'Đội Vàng')).toMatchObject({ match: null, attempt: 1, previous: [] }); // a photo: no badge
    // a photo task's earlier submission reads "(đã gửi bài)"; answers of the other branch are another task and do not count
    const twice = withRow(s, 't2', 'D1', { answers: [{ id: 0, text: 'ba', at: NOW - 10 * MIN, status: 'penalized', branch: 'A' }, { id: 1, text: '', at: NOW - 150_000, status: 'pending', branch: 'B' }, { id: 2, text: '', at: NOW - 5 * MIN, status: 'penalized', branch: 'B' }] });
    const vang = queueRows(twice, NOW).find((r) => r.name === 'Đội Vàng')!;
    expect(vang.attempt).toBe(2);
    expect(vang.previous).toEqual([`Lần 1: (đã gửi bài) · bị phạt · ${fmtTime(NOW - 5 * MIN)}`]);
    // no progress row for the item (should not happen): still a card, first try
    expect(queueRows({ ...s, progress: [] }, NOW).find((r) => r.name === 'Đội Nâu')).toMatchObject({ attempt: 1, previous: [], match: 'yes' });
  });
});

describe('step_progress matrix, Phase 8 cells (D16 (3))', () => {
  const s = demoState(NOW);

  it('an answer waiting for the Host: orange cell with the wait, Duyệt / Phạt in the cell (the penalty minutes in its title)', () => {
    const c = rowOf(s, 'Đội Vàng').cells[3]!;
    expect(c.state).toBe('pending');
    expect(c.text).toBe('chờ duyệt 02:30 · Ảnh (B)');
    expect(c.buttons.map((b) => [b.op, b.id, b.label, b.team, b.step])).toEqual([['approve', 1, 'Duyệt', 't2', 'D1'], ['penalize', 1, 'Phạt', 't2', 'D1']]);
    expect(c.buttons[1]!.title).toContain('Phạt 3 phút');
    expect(c.title).toContain('(đã gửi bài) · '); // the title lists the answers
    expect(c.title).toContain('chờ duyệt');
    expect(rowOf(s, 'Đội Cam').cells[3]!.text).toBe('chờ duyệt 00:45 · Tính (A) ↺1'); // one branch switch
  });

  it('a countdown: purple cell with ⏳ mm:ss, the number of penalties, the answers and Host notes in the title', () => {
    const c = rowOf(s, 'Đội Tím').cells[1]!;
    expect(c.state).toBe('locked');
    expect(c.text).toBe('⏳ 01:50 ✗2');
    expect(c.title).toContain('«41»');
    expect(c.title).toContain('bị phạt');
    expect(c.title).toContain('ghi chú: Gần đúng, đọc lại đề');
    expect(c.title).toContain('Đã chờ duyệt: 02:10');
    // a mistaken "Phạt" is undone by approving that answer (the server takes the newest penalized one)
    expect(c.buttons.map((b) => [b.op, b.id, b.label])).toEqual([['approve', 2, 'Duyệt câu vừa phạt'], ['approve', undefined, 'Cho qua']]); // not "Duyệt lại" (read as "review again", visual#3); Phase 10: + the way out
    expect(c.buttons[0]!.title).toContain('Nhầm tay bấm Phạt');
    // the countdown is over: the team is just "active" again
    expect(rowOf(s, 'Đội Tím', NOW + 3 * MIN).cells[1]!.state).toBe('active');
  });

  it('a branch-switch countdown is purple too, but offers no "Duyệt câu vừa phạt" (the last answer belongs to the branch the team left)', () => {
    const switched = withRow(s, 't5', 'D1', {
      pending: false, branch: 'B', branchOpenedAt: null, branchSwitches: 2, lockedUntil: NOW + 12_000,
      answers: [{ id: 1, text: 'bảy', at: NOW - 60_000, status: 'penalized', branch: 'A' }],
    });
    const c = rowOf(switched, 'Đội Cam').cells[3]!;
    expect(c.state).toBe('locked');
    expect(c.text).toBe('⏳ 00:12 · Ảnh (B) ↺2');
    expect(c.buttons).toEqual([]);
  });

  it('a photo task the team has started: "Duyệt (đã nhận ảnh)" with no answer id; not before the box / task is open, not on a typed branch', () => {
    const red = rowOf(s, 'Đội Đỏ').cells[3]!;
    expect(red.state).toBe('active');
    expect(red.buttons).toEqual([expect.objectContaining({ op: 'approve', team: 't1', step: 'D1', label: 'Duyệt (đã nhận ảnh)' }), expect.objectContaining({ op: 'approve', step: 'D1', label: 'Cho qua' })]);
    expect(red.buttons[0]!.id).toBeUndefined();
    // branch chosen but its box not opened yet → the server refuses, so no button
    expect(rowOf(withRow(s, 't1', 'D1', { branchOpenedAt: null }), 'Đội Đỏ').cells[3]!.buttons).toEqual([]);
    // branch A is a typed answer, not a photo (Phase 10: its box is open, so only the way out)
    expect(rowOf(withRow(s, 't1', 'D1', { branch: 'A' }), 'Đội Đỏ').cells[3]!.buttons.map((b) => b.label)).toEqual(['Cho qua']);
    // a photo CHALLENGE: after "Nhận" (startedAt) yes, before no; also while the countdown runs (and then not "Duyệt câu vừa phạt")
    const photo: HostState = { ...s, leg: { ...s.leg!, steps: s.leg!.steps.map((x) => (x.id === 'T1' ? { ...x, proof: true } : x)) } };
    expect(rowOf(photo, 'Đội Tím').cells[1]!.buttons.map((b) => b.label)).toEqual(['Duyệt (đã nhận ảnh)', 'Cho qua']);
    expect(rowOf(withRow(photo, 't4', 'T1', { startedAt: null, lockedUntil: null }), 'Đội Tím').cells[1]!.buttons.map((b) => b.label)).toEqual(['Cho qua']);
  });

  it('done cells: ✗n penalties and (A ↺n) switches; the approval wait stays in the cell title (no official-time column)', () => {
    const blue = rowOf(s, 'Đội Xanh');
    expect(blue.cells[1]!.text).toMatch(/ ✗1$/);
    expect(blue.cells[3]!.text).toMatch(/ · Tính \(A\) ↺1$/);
    expect(blue.cells.every((c) => c.buttons.length === 0)).toBe(true);
    expect(blue.cells[1]!.title).toContain('Đã chờ duyệt: 01:35');
    expect(blue.cells[1]!.title).toContain('«41»');
    expect(blue.cells[1]!.title).toContain('đã duyệt');
  });
});

describe('stuck teams (D11)', () => {
  const s = demoState(NOW); // Đội Tím has been on Thử thách 1 since 46 min (task_started_at)
  const at = (min: number) => NOW + min * MIN;
  const names = (st: HostState, now: number) => stuckAlerts(st, now).map((a) => [a.name, a.period, a.minutes]);
  const tim = (st: HostState, now: number) => stuckAlerts(st, now).filter((a) => a.team === 't4').map((a) => [a.period, a.minutes]); // Đội Đỏ crosses 45 min later on

  it('the demo has exactly one stuck team; nothing before the threshold, period 1 up to 89 min, period 2 from 90', () => {
    expect(names(s, NOW)).toEqual([['Đội Tím', 1, 46]]);
    expect(names(s, at(-2))).toEqual([]); // 44 min
    expect(names(s, at(1))).toEqual([['Đội Tím', 1, 47]]);
    expect(tim(s, at(43))).toEqual([[1, 89]]);
    expect(tim(s, at(44))).toEqual([[2, 90]]);
    expect(tim(s, at(46))).toEqual([[2, 92]]);
    expect(stuckAlerts(s, NOW)[0]!.text).toBe('Đội Tím làm Thử thách 1 đã 46 phút (cứ 45 phút báo một lần).');
  });

  it('uses leg.stuckMinutes, or the number it is given', () => {
    expect(names({ ...s, leg: { ...s.leg!, stuckMinutes: 50 } }, NOW)).toEqual([]);
    expect(stuckAlerts(s, NOW, 20)[0]!.period).toBe(2);
  });

  it('not stuck: waiting for the Host, done, finished, race not running', () => {
    expect(names(withRow(s, 't4', 'T1', { pending: true }), NOW)).toEqual([]);
    expect(names(withRow(s, 't4', 'T1', { completedAt: NOW }), NOW)).toEqual([]);
    expect(names(withTeam(s, 't4', { finishAt: NOW }), NOW)).toEqual([]);
    expect(names({ ...s, status: 'lobby' }, NOW)).toEqual([]);
    expect(names({ ...s, status: 'finished' }, NOW)).toEqual([]);
    expect(names({ ...s, status: 'paused' }, NOW)).toEqual([['Đội Tím', 1, 46]]); // the clocks run on while paused
  });

  it('a detour counts from branch_opened_at (not from when the clue arrived)', () => {
    // Đội Đỏ: D1 clue at 8 min before NOW, branch B box opened 6 min before NOW. 40 min later: 46 from the box, 48 from the clue.
    expect(stuckAlerts(s, at(40)).filter((a) => a.team === 't1').map((a) => [a.minutes, a.branch, a.text.includes('nhánh Ảnh (B)')])).toEqual([[46, 'B', true]]);
    expect(stuckAlerts(s, at(38)).some((a) => a.team === 't1')).toBe(false); // 44 from the box: not yet (would be 46 from the clue)
  });

  it('neither "Nhận thử thách" nor the branch box yet → counted from the clue (openedAt): a team that never starts is reported too', () => {
    const noBox = withRow(s, 't1', 'D1', { branchOpenedAt: null, branch: null });
    expect(stuckAlerts(noBox, at(37)).filter((a) => a.team === 't1').map((a) => [a.minutes, a.branch])).toEqual([[45, null]]); // clue 8 min before NOW
    expect(stuckAlerts(noBox, at(36)).some((a) => a.team === 't1')).toBe(false);
    const noAccept = withRow(s, 't4', 'T1', { startedAt: null });
    expect(stuckAlerts(noAccept, NOW).map((a) => a.minutes)).toEqual([47]); // clue 47 min ago, not 46
  });

  it('only challenges and detours are watched (a long route is not "stuck")', () => {
    const onRoute = withTeam(s, 't4', { step: 0 }); // L1, a route
    expect(names(withRow(onRoute, 't4', 'L1', { completedAt: null, openedAt: NOW - 90 * MIN }), NOW)).toEqual([]);
  });

  it('one beep per team and period: the same period never sounds twice; the next one does (alertRepeat); false = first period only', () => {
    const alerted = new Map<string, number>();
    const a1 = stuckAlerts(s, NOW);
    expect(freshAlerts(alerted, a1, true).map((a) => a.key)).toEqual(['t4|T1']);
    expect(freshAlerts(alerted, a1, true)).toEqual([]);
    const a2 = stuckAlerts(s, at(46)).filter((a) => a.team === 't4');
    expect(freshAlerts(alerted, a2, true).map((a) => a.period)).toEqual([2]);
    expect(freshAlerts(alerted, a2, true)).toEqual([]);
    const once = new Map<string, number>();
    expect(freshAlerts(once, a1, false)).toHaveLength(1);
    expect(freshAlerts(once, a2, false)).toEqual([]); // period 2 is marked, not sounded
    expect(once.get('t4|T1')).toBe(2);
  });
});

describe('R2 images and the leg line (D14, D16 (4) (5))', () => {
  const s = demoState(NOW);

  it('names come from the leg, once each', () => {
    expect(mediaNames(s)).toEqual(['test-gia.jpg', 'test-gia-2.jpg']);
    expect(mediaNames({ ...s, leg: { ...s.leg!, media: ['a.jpg', 'a.jpg', 'b.png'] } })).toEqual(['a.jpg', 'b.png']);
    expect(mediaNames({ ...s, leg: null })).toEqual([]);
  });

  it('the media path carries the race and the name (encoded), nothing secret', () => {
    expect(mediaPath('/api', 'paris', 'test-gia.jpg')).toBe('/api/race/paris/media/test-gia.jpg');
    expect(mediaPath('/api', 'a b', 'x y.jpg')).toBe('/api/race/a%20b/media/x%20y.jpg');
  });

  it('the page refuses what the Worker would (type, 5 MB) in Vietnamese before uploading', () => {
    expect(checkMediaFile({ type: 'image/jpeg', size: 1000 })).toBeNull();
    expect(checkMediaFile({ type: 'image/webp', size: MEDIA.maxBytes })).toBeNull();
    expect(checkMediaFile({ type: 'image/gif', size: 10 })).toContain('jpg, png hoặc webp');
    expect(checkMediaFile({ type: 'image/png', size: MEDIA.maxBytes + 1 })).toMatch(/tối đa 5 MB/);
    for (const [code, word] of [[400, 'Tên hình'], [401, 'hết hạn'], [403, 'Host'], [411, 'độ dài'], [413, '5 MB'], [415, 'jpg'], [501, '501']] as const) expect(mediaErrorText(code)).toContain(word);
  });

  it('the leg line says the penalties and the stuck warning', () => {
    expect(legPenaltyLine(s.leg!)).toBe('Phạt 3 / 10 phút (trả lời lại / đổi nhánh) · cảnh báo kẹt sau 45 phút.');
    expect(legPenaltyLine({ ...s.leg!, penalties: { retryLockMinutes: 0.1, branchSwitchLockMinutes: 0.2 }, stuckMinutes: 30 })).toBe('Phạt 0,1 / 0,2 phút (trả lời lại / đổi nhánh) · cảnh báo kẹt sau 30 phút.');
  });

  it('the demo (p8-host) shows what the plan asks: a queue of 2 with reference answers, a stuck team, an orange / purple / ↺ cell', () => {
    expect(s.queue).toHaveLength(3); // SPEC §17.42: a Messenger submission, a typed answer that does not match, one that does
    expect(s.queue.every((q) => q.reference.length > 0)).toBe(true);
    expect(queueRows(s, NOW).map((r) => r.match)).toEqual([null, 'no', 'yes']);
    expect(stuckAlerts(s, NOW)).toHaveLength(1);
    const states = progressTable(s, NOW).rows.flatMap((r) => r.cells.map((c) => c.state));
    expect(states).toContain('pending');
    expect(states).toContain('locked');
  });
});

// ── Phase 8B track D: louvre cell ──
describe('louvre cell (phase8b §H)', () => {
  const s = withLouvreDemo(demoState(NOW));
  const cellOf = (state: HostState, name: string, now = NOW) => rowOf(state, name, now).cells[6]!; // T3 sits after Thử thách 2, before Về đích

  it('shows picks / misses / the 60 min hint with the live x, a countdown while locked, and the exit button', () => {
    const c = cellOf(s, 'Đội Lục');
    expect(c.state).toBe('locked');
    expect(c.text).toBe('⏳ 02:10 · chọn 5/23 · ✗2 · 💡60 (3/5)');
    expect(c.buttons.map((b) => [b.op, b.id, b.step])).toEqual([['approve', undefined, 'T3']]); // approve without id = the way out
    expect(c.buttons[0]!.confirm).toContain('Đội Lục');
    expect(c.title).toContain('Đang chọn (5): art-04, art-09, art-11, art-15, art-20');
    expect(c.title).toContain('đúng 2/5');
    expect(c.title).toContain('đúng 3/5');
  });

  it('hint marks follow the clock: nothing, 40, then 60 (x only when the server sent it)', () => {
    const at = (min: number, more: Partial<Row> = {}) => cellOf(withRow(s, 't3', 'T3', { lockedUntil: null, startedAt: NOW - min * MIN, ...more }), 'Đội Lục');
    expect(at(10).text).toBe('chọn 5/23 · ✗2');
    expect(at(41).text).toBe('chọn 5/23 · ✗2 · 💡40');
    expect(at(71, { hintCorrect: 0 }).text).toBe('chọn 5/23 · ✗2 · 💡60 (0/5)');
    expect(at(71, { hintCorrect: null }).text).toBe('chọn 5/23 · ✗2 · 💡60');
    expect(at(10).state).toBe('active');
  });

  it('a finished louvre step is an ordinary done cell; teams before it have no button', () => {
    expect(cellOf(s, 'Đội Xanh').state).toBe('done');
    expect(cellOf(s, 'Đội Đỏ').buttons).toEqual([]);
  });

  it('the stuck warning still fires for a team in the room', () => {
    const late = withRow(s, 't3', 'T3', { startedAt: NOW - 50 * MIN, lockedUntil: null });
    expect(stuckAlerts(late, NOW).find((a) => a.team === 't3')?.step).toBe('T3');
  });

  it('the leg box line; no answers or artwork names anywhere in the demo', () => {
    expect(louvreLines(s.leg!)).toEqual(['Thử thách 3: phòng Louvre, 23 tác phẩm (ảnh / mô hình có sẵn trong game, không cần tải lên), gợi ý phút 40 / 60.']);
    expect(louvreLines(demoState(NOW).leg!)).toEqual([]);
  });
});

// ── Phase 10 (docs/plans/phase10.md V1 / V2 / V3 / V5, SPEC §17.25), track H ──
describe('undo lines (V2)', () => {
  const s = demoState(NOW); // Đội Xanh's «42» on Thử thách 1 was approved 3 s ago: 7 s left

  it('counts down against `until` on the clock the page estimates; the button reads "Hoàn tác (còn n s)", rounded up', () => {
    expect(s.undo).toHaveLength(1);
    expect(s.undo[0]!.until - s.undo[0]!.at).toBe(NET.undoMs);
    const r = undoRows(s, NOW)[0]!;
    expect(r).toMatchObject({ key: 't0|T1|2', team: 't0', step: 'T1', id: 2, op: 'approve', name: 'Đội Xanh', label: 'Thử thách 1', secondsLeft: 7, button: 'Hoàn tác (còn 7 s)' });
    expect(r.text).toBe('Đã Duyệt «42» của Đội Xanh – Thử thách 1');
    expect(undoRows(s, NOW + 1_000)[0]!.button).toBe('Hoàn tác (còn 6 s)');
    expect(undoRows(s, NOW + 6_100)[0]!.button).toBe('Hoàn tác (còn 1 s)'); // never "0 s" while it still works
    expect(undoRows(s, NOW + 6_999)[0]!.secondsLeft).toBe(1);
  });

  it('is gone once it ran out, with or without a newer host.state', () => {
    expect(undoRows(s, NOW + 7_000)).toEqual([]);
    expect(undoRows(s, NOW + 60_000)).toEqual([]);
    expect(undoRows({ ...s, undo: [] }, NOW)).toEqual([]);
  });

  it('newest decision first whatever order the server sent; "Đã Phạt"; no «» without an answer text; unknown team / step by id; long answers cut', () => {
    const two: HostState = { ...s, undo: [{ team: 't4', step: 'T1', id: 2, op: 'penalize', at: NOW - 6_000, until: NOW + 4_000 }, ...s.undo] };
    expect(undoRows(two, NOW).map((r) => [r.key, r.secondsLeft])).toEqual([['t0|T1|2', 7], ['t4|T1|2', 4]]);
    expect(undoRows(two, NOW)[1]!.text).toBe('Đã Phạt «43» của Đội Tím – Thử thách 1');
    const none: HostState = { ...s, undo: [{ team: 'tX', step: 'ZZ', id: 9, op: 'approve', at: NOW, until: NOW + NET.undoMs }] };
    expect(undoRows(none, NOW)[0]).toMatchObject({ name: 'tX', label: 'ZZ', text: 'Đã Duyệt của tX – ZZ', colour: '#8d99b0' });
    const long = withRow(s, 't0', 'T1', { answers: [{ id: 2, text: 'x'.repeat(60), at: NOW, status: 'approved', branch: null }] });
    expect(undoRows(long, NOW)[0]!.text).toBe(`Đã Duyệt «${'x'.repeat(40)}…» của Đội Xanh – Thử thách 1`);
  });

  it('the button sends host.review undo with the answer id: the codec takes it from the Host only, never without the id', () => {
    const m = undoMessage('t0', 'T1', 2);
    expect(m).toEqual({ t: 'host.review', team: 't0', step: 'T1', op: 'undo', id: 2 });
    expect(isClientMessage(m, 'host')).toBe(true);
    expect(isClientMessage(m, 'team')).toBe(false);
    expect(isClientMessage({ t: 'host.review', team: 't0', step: 'T1', op: 'undo' }, 'host')).toBe(false);
  });
});

/** "HH:mm:ss" of server ms in the demo leg's zone (what the page prints). */
const fmtTime = (ms: number) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', hourCycle: 'h23', hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(ms));

describe('red flag (V3)', () => {
  const tz = 'Asia/Ho_Chi_Minh';
  const at = Date.UTC(2026, 9, 3, 7, 5, 9); // 14:05:09 in Vietnam, 09:05:09 in Paris (CEST)

  it('"Vượt tốc · lúc 14:05:09 (7 phút trước)": the reasons in the server\'s order, no repeats, times in the leg zone', () => {
    expect(flagText({ flagged: true, flagWhy: ['speed'], flagAt: at }, at + 7 * MIN, tz)).toBe('Vượt tốc · lúc 14:05:09 (7 phút trước)');
    expect(flagText({ flagged: true, flagWhy: ['jump', 'speed', 'jump', 'respawn'], flagAt: at }, at + 7 * MIN, tz)).toBe('Dịch chuyển lạ · Vượt tốc · Hồi sinh nhiều · lúc 14:05:09 (7 phút trước)');
    expect(flagText({ flagged: true, flagWhy: ['respawn', 'jump'], flagAt: at }, at, 'Europe/Paris')).toBe('Hồi sinh nhiều · Dịch chuyển lạ · lúc 09:05:09 (0 giây trước)');
    expect(flagText({ flagged: true, flagWhy: ['speed'], flagAt: at }, at + 45_000, tz)).toContain('(45 giây trước)'); // the "n phút trước" runs with the page clock
    expect(flagText({ flagged: true, flagWhy: ['speed'], flagAt: at }, at + 2 * 3600_000, tz)).toContain('(2 giờ trước)');
  });

  it('a flag with no known reason / time still says so; no flag = no text', () => {
    expect(flagText({ flagged: true, flagWhy: [], flagAt: null }, at, tz)).toBe('Cờ đỏ');
    expect(flagText({ flagged: true, flagWhy: ['speed'], flagAt: null }, at, tz)).toBe('Vượt tốc');
    expect(flagText({ flagged: false, flagWhy: ['speed'], flagAt: at }, at, tz)).toBe('');
    expect(flagText({ flagged: true, flagWhy: ['teleport' as never], flagAt: null }, at, tz)).toBe('teleport'); // a reason a newer server adds
  });

  it('teamRows carries the flag fields and its line, in the leg zone; the demo flags Đội Đỏ (one reason) and Đội Vàng (two)', () => {
    const rows = teamRows(demoState(NOW), NOW);
    expect(rows.filter((r) => r.flagged).map((r) => r.name)).toEqual(['Đội Đỏ', 'Đội Vàng']);
    expect(rows[1]).toMatchObject({ flagWhy: ['speed'], flagAt: NOW - 7 * MIN });
    expect(rows[1]!.flagText).toBe(`Vượt tốc · lúc ${fmtTime(NOW - 7 * MIN)} (7 phút trước)`);
    expect(rows[2]!.flagText).toBe(`Dịch chuyển lạ · Hồi sinh nhiều · lúc ${fmtTime(NOW - 2 * MIN)} (2 phút trước)`);
    expect(rows.filter((r) => !r.flagged).every((r) => r.flagText === '' && r.flagAt === null && r.flagWhy.length === 0)).toBe(true);
  });

  it('the matrix row carries `flagged` (the page marks the name)', () => {
    expect(progressTable(demoState(NOW), NOW).rows.filter((r) => r.flagged).map((r) => r.name)).toEqual(['Đội Vàng', 'Đội Đỏ']); // finish order
  });

  it('"Xóa cờ" sends host.flag clear: the codec takes it from the Host only', () => {
    const m = { t: 'host.flag', op: 'clear', team: 't1' };
    expect(isClientMessage(m, 'host')).toBe(true);
    expect(isClientMessage(m, 'team')).toBe(false);
  });
});

describe('"Cho qua" for every kind of challenge (V5, plan M8)', () => {
  const s = demoState(NOW);
  const labels = (state: HostState, name: string, i: number) => rowOf(state, name).cells[i]!.buttons.map((b) => b.label);

  it('a typed challenge, active or in a Phạt countdown: Cho qua = approve with no id, always behind a confirm that names team and step', () => {
    const active = rowOf(withRow(s, 't4', 'T1', { lockedUntil: null }), 'Đội Tím').cells[1]!;
    expect(active.state).toBe('active');
    expect(active.buttons.map((b) => b.label)).toEqual(['Cho qua']);
    const b = active.buttons[0]!;
    expect(b).toMatchObject({ op: 'approve', team: 't4', step: 'T1', confirm: 'Cho Đội Tím qua Thử thách 1 mà không cần câu trả lời?' });
    expect(b.id).toBeUndefined();
    const m = reviewMessage(b.team, b.step, b.op, b.id, '');
    expect(m).toEqual({ t: 'host.review', team: 't4', step: 'T1', op: 'approve' });
    expect(isClientMessage(m, 'host')).toBe(true);
    expect(rowOf(s, 'Đội Tím').cells[1]!.state).toBe('locked');
    expect(labels(s, 'Đội Tím', 1)).toEqual(['Duyệt câu vừa phạt', 'Cho qua']);
  });

  it('a detour branch whose box is open (typed or photo), the louvre room, a photo challenge: all of them', () => {
    expect(labels(s, 'Đội Đỏ', 3)).toEqual(['Duyệt (đã nhận ảnh)', 'Cho qua']); // photo branch B
    expect(rowOf(s, 'Đội Đỏ').cells[3]!.buttons[1]!.confirm).toBe('Cho Đội Đỏ qua Lựa chọn kép (nhánh Ảnh (B)) mà không cần câu trả lời?');
    expect(labels(withRow(s, 't1', 'D1', { branch: 'A' }), 'Đội Đỏ', 3)).toEqual(['Cho qua']); // typed branch A
    const lv = withLouvreDemo(s);
    expect(rowOf(lv, 'Đội Lục').cells[6]!.buttons.map((b) => [b.op, b.id, b.label])).toEqual([['approve', undefined, 'Cho qua']]);
    expect(rowOf(lv, 'Đội Lục').cells[6]!.buttons[0]!.confirm).toBe('Cho Đội Lục qua phòng Louvre mà không cần chọn đúng?');
  });

  it('not where the server has nothing to approve: an answer waits (Duyệt / Phạt instead), the branch box is not open, a route, the Pit Stop, a done or later cell', () => {
    expect(labels(s, 'Đội Vàng', 3)).toEqual(['Duyệt', 'Phạt']); // pending photo answer
    expect(labels(s, 'Đội Cam', 3)).toEqual(['Duyệt', 'Phạt']); // pending typed answer
    expect(labels(withRow(s, 't1', 'D1', { branchOpenedAt: null }), 'Đội Đỏ', 3)).toEqual([]); // branch chosen, box not opened
    expect(labels(s, 'Đội Lục', 0)).toEqual([]); // Lộ trình 1: route_info
    expect(labels(withTeam(s, 't3', { step: 6 }), 'Đội Lục', 6)).toEqual([]); // Về đích: pit_stop
    expect(rowOf(s, 'Đội Xanh').cells.flatMap((c) => c.buttons)).toEqual([]); // finished team
    expect(rowOf(s, 'Đội Đỏ').cells.filter((c) => c.state !== 'active').flatMap((c) => c.buttons)).toEqual([]);
  });
});

describe('pinned matrix and folding review frame (V1): host.css, main.ts', () => {
  const css = readFileSync(join(import.meta.dirname, 'host.css'), 'utf8');
  const main = readFileSync(join(import.meta.dirname, 'main.ts'), 'utf8');
  /** The declarations of the rule whose selector starts a line (so "a th" never matches inside "a, b th"). */
  const rule = (sel: string) => new RegExp(`(?:^|\n)${sel.replace(/[.*+?^${}()|[\]\\>]/g, '\\$&')}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? '';
  const z = (sel: string) => Number(/z-index:\s*(\d+)/.exec(rule(sel))?.[1]);

  it('the matrix scrolls in its own box; its header row sticks to the top, the Đội column to the left, the corner above both', () => {
    expect(rule('.matrix-wrap')).toMatch(/max-height:[^;]*72vh[^;]*calc\(100vh - var\(--queue-h/); // review F5: minus the review frame
    expect(main).toMatch(/new ResizeObserver\(\(\) => document\.documentElement\.style\.setProperty\('--queue-h', `\$\{queueWrap\.offsetHeight\}px`\)\)\.observe\(queueWrap\)/);
    expect(rule('.matrix-wrap')).toMatch(/overflow:\s*auto/);
    expect(rule('table.matrix thead th')).toMatch(/position:\s*sticky;\s*top:\s*0/);
    expect(rule('table.matrix thead th')).toMatch(/background:\s*#/); // opaque, or the cells show through while scrolling
    expect(rule('table.pin tr > :first-child')).toMatch(/position:\s*sticky;\s*left:\s*0/);
    expect(rule('table.matrix thead th:first-child')).toMatch(/left:\s*0/);
    expect(z('table.matrix thead th:first-child')).toBeGreaterThan(z('table.matrix thead th'));
    expect(z('table.matrix thead th')).toBeGreaterThan(z('table.pin tr > :first-child'));
  });

  it('the review frame stays above the matrix while it is sticky; the undo bar is hidden when empty; the notify button is laid over the summary row', () => {
    expect(rule('.queue-wrap.has')).toMatch(/position:\s*sticky;\s*top:\s*0/);
    expect(z('.queue-wrap.has')).toBeGreaterThan(z('table.matrix thead th:first-child'));
    expect(rule('.undo-bar:empty')).toMatch(/display:\s*none/);
    expect(rule('.queue-wrap > button')).toMatch(/position:\s*absolute/);
  });

  it('main.ts builds what the CSS pins: a .matrix-wrap around a table.matrix with <thead>; the queue is a <details open> whose <summary> holds no button', () => {
    expect(main).toContain("'scroll matrix-wrap'");
    expect(main).toContain("el('table', { className: 'matrix pin' }");
    expect(main).toContain("el('thead'");
    expect(main).toContain("el('details', { open: true }, queueHead, queueBox)");
    expect(main).toContain("const queueHead = el('summary');");
    expect(main).toContain("el('div', { className: 'queue-wrap' }, queueDetails, notifyBtn, undoBar)");
    expect(main).toContain("className: 'undo-bar'");
  });
});

describe('"Xuất dữ liệu thời gian" (SPEC §17.25)', () => {
  const s = demoState(NOW);
  const res = (status: number, body = 'x') => (async () => new Response(body, { status })) as unknown as typeof fetch;

  it('file names: race-<id>-thoi-gian.csv / .json; an odd id cannot make a path; the URL has the race and format, never a token', () => {
    expect(exportFileName('paris', 'csv')).toBe('race-paris-thoi-gian.csv');
    expect(exportFileName('hn-2026', 'json')).toBe('race-hn-2026-thoi-gian.json');
    expect(exportFileName('../a b', 'csv')).toBe('race----a-b-thoi-gian.csv');
    expect(exportPath('/api', 'paris', 'json')).toBe('/api/race/paris/export?format=json');
    expect(exportPath('/api', 'a b', 'csv')).toBe('/api/race/a%20b/export?format=csv');
  });

  it('GET with the Host token in the Authorization header only; the body stays a Blob so the UTF-8 BOM survives', async () => {
    const calls: [string, RequestInit | undefined][] = [];
    const fake = (async (url: string, init?: RequestInit) => (calls.push([url, init]), new Response('\uFEFFĐội,Bước\r\n'))) as unknown as typeof fetch;
    const r = await fetchExport(fake, '/api', 'paris', 'TOKEN123', 'csv');
    expect(calls).toHaveLength(1);
    expect(calls[0]![0]).toBe('/api/race/paris/export?format=csv');
    expect(calls[0]![0]).not.toContain('TOKEN123');
    expect(calls[0]![1]).toEqual({ headers: { Authorization: 'Bearer TOKEN123' } });
    if (!r.ok) throw new Error(r.error);
    expect(r.name).toBe('race-paris-thoi-gian.csv');
    expect([...new Uint8Array(await r.blob.arrayBuffer()).slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  });

  it('errors in Vietnamese: 401 (session over, a team token too), 500, any other status, a dead network, a body that breaks off', async () => {
    const err = (f: typeof fetch) => fetchExport(f, '/api', 'paris', 't', 'csv');
    expect(await err(res(401))).toEqual({ ok: false, error: 'Phiên Host hết hạn, đăng nhập lại.' });
    expect(await err(res(500))).toEqual({ ok: false, error: 'Máy chủ lỗi (500), thử lại sau ít phút.' });
    expect(await err(res(404))).toEqual({ ok: false, error: 'Máy chủ trả lỗi 404.' });
    expect(exportErrorText(503)).toContain('503');
    expect(await err((async () => { throw new TypeError('Failed to fetch'); }) as unknown as typeof fetch)).toEqual({ ok: false, error: 'Không kết nối được máy chủ.' });
    expect(await err((async () => ({ ok: true, status: 200, blob: async () => { throw new Error('aborted'); } })) as unknown as typeof fetch)).toEqual({ ok: false, error: 'Tải bị gián đoạn, thử lại.' });
  });

  it('asks first while the race is not over ("dữ liệu có thể chưa đủ"), never for a finished one', () => {
    for (const status of ['lobby', 'running', 'paused'] as const) expect(exportConfirm(status)).toContain('Cuộc đua chưa kết thúc, dữ liệu có thể chưa đủ');
    expect(exportConfirm('finished')).toBeNull();
  });

  it('?demo=1 sample: UTF-8 BOM, a header, one row per team x step, ISO UTC times, no answers; JSON has the same rows; fields are quoted', () => {
    const csv = demoExportText(s, 'csv');
    expect(csv.startsWith('\uFEFFĐội,Mã bước,Tên bước,')).toBe(true);
    const lines = csv.trimEnd().split('\r\n');
    expect(lines).toHaveLength(1 + s.progress.length);
    expect(lines[1]).toMatch(/^Đội Xanh,L1,Lộ trình 1,,\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z,/);
    for (const w of ['sáu', 'cau iena', 'Cầu Iéna']) expect(csv).not.toContain(w); // an answer of the leg never leaves the server
    const json = JSON.parse(demoExportText(s, 'json')) as Record<string, unknown>[];
    expect(json).toHaveLength(s.progress.length);
    expect(json[0]).toMatchObject({ 'Đội': 'Đội Xanh', 'Mã bước': 'L1', 'Tên bước': 'Lộ trình 1' });
    expect(csvLine(['Đội A, B', 'nói "chào"', 3, ''])).toBe('"Đội A, B","nói ""chào""",3,');
  });
});
