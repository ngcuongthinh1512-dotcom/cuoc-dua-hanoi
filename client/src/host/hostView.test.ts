import { isClientMessage, MEDIA, NET, type HostState } from '@race/shared/protocol';
import { describe, expect, it } from 'vitest';
import { ago, billableRequests, checkMediaFile, corridorPoints, counterLines, demoState, fmtMinSec, freshAlerts, freshQueue, legPenaltyLine, MAX_TEAM_NAME, MAX_TEAMS_PER_BATCH, mediaErrorText, mediaNames, mediaPath, openBlanks, parseTeamLines, progressTable, queueRows, queueSig, reviewMessage, startRows, statusButtons, stuckAlerts, teamRows, warnings, withLouvreDemo, louvreLines } from './hostView.ts';

describe('Host view', () => {
  it('billable requests = http + alarms + wsIn / 20 rounded up', () => {
    expect(billableRequests({ wsIn: 41, wsOut: 0, http: 3, alarms: 2, rows: 0 })).toBe(8);
  });

  it('builds table rows from host.state', () => {
    const rows = teamRows(demoState());
    expect(rows.map((r) => [r.name, r.status, r.reconnects])).toEqual([['Đội Xanh', 'online', 1], ['Đội Đỏ', 'online', 0], ['Đội Vàng', 'offline', 3], ['Đội Lục', 'offline', 0], ['Đội Tím', 'offline', 1], ['Đội Cam', 'offline', 0]]);
    expect(rows[0]!.code).toBe('K7M3QX');
    expect(rows[0]!.position).toMatch(/^48\.\d+, 2\.\d+$/);
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
    expect(end).toContain('5 đội chưa về đích sẽ nhận thông báo BỊ LOẠI: Đội Đỏ, Đội Vàng, Đội Lục, Đội Tím, Đội Cam.');
    expect(statusButtons(s).find((b) => b.op === 'pause')!.confirm).not.toMatch(/[Đđ]ồng hồ/);
  });

  it('red banner: lobby with teams online; SPEC §17.23: nothing about start times any more', () => {
    const s = demoState();
    expect(warnings({ ...s, status: 'lobby' })).toEqual(['Cuộc đua chưa mở nhưng đã có 2 đội trong game (các đội xem được mật thư 1 nhưng chưa mở được hòm).']);
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
    expect(head.map((h) => h.label)).toEqual(['Lộ trình 1', 'Thử thách 1', 'Lộ trình 2', 'Lựa chọn kép', 'Lộ trình 3', 'Về đích']);
    expect(rows.map((r) => [r.name, r.rank])).toEqual([['Đội Xanh', '1'], ['Đội Vàng', '2'], ['Đội Đỏ', '3'], ['Đội Lục', '—'], ['Đội Tím', '—'], ['Đội Cam', '—']]);
    const blue = rows[0]!;
    expect(blue.cells.every((c) => c.state === 'done')).toBe(true);
    expect(Object.keys(blue).sort()).toEqual(['cells', 'colour', 'finish', 'name', 'out', 'penalty', 'rank', 'team']);
    expect(blue.cells[0]!.text).toMatch(/^\d\d:\d\d:\d\d · 15:00$/); // when · how long the step took
    expect(blue.cells[3]!.text).toContain(' · Tính (A) ↺1'); // branch A after one switch
    const red = rows[2]!;
    expect(red.cells.map((c) => c.state)).toEqual(['done', 'done', 'done', 'active', 'todo', 'todo']);
    expect(red.cells[3]!.text).toBe('08:00 · Ảnh (B)'); // 50 − 8 − 42 = 8 min since the clue of D1 reached it; took branch B
    expect(red.penalty).toBe('+2 phút');
    expect(rows[3]!.cells.map((c) => c.state)).toEqual(['active', 'todo', 'todo', 'todo', 'todo', 'todo']); // holds clue 1 (D3), no times yet
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
    // L1, T1 (own location), L2 = D1 branch A (same place), Champ de Mars (branch B), L3 = PS
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
    expect(rows.map((r) => [r.name, r.step, r.branch, r.id, r.waiting])).toEqual([['Đội Vàng', 'D1', 'B', 1, '01:12'], ['Đội Cam', 'D1', 'A', 1, '00:45']]);
    expect(rows[0]).toMatchObject({ code: 'Đội Vàng-D1-B', text: '', reference: ['(MẪU) Hình chụp rõ biển tên đường ở góc phố'], lockMinutes: 3, key: 't2|D1|1', label: 'Lựa chọn kép' });
    expect(rows[1]).toMatchObject({ code: 'Đội Cam-D1-A', text: 'bảy', reference: ['7', 'bảy'], branchName: 'Tính (A)' }); // the team's name for it, visual#3
    expect(rows[0]!.branchName).toBe('Ảnh (B)');
    // the order is by `at`, whatever order the server sent
    expect(queueRows({ ...s, queue: [...s.queue].reverse() }, NOW).map((r) => r.name)).toEqual(['Đội Vàng', 'Đội Cam']);
    // a team the page does not know (should not happen) still shows by its id
    expect(queueRows({ ...s, teams: [] }, NOW)[0]).toMatchObject({ name: 't2', code: 't2-D1-B' });
  });

  it('the waiting time runs with the clock the page estimates', () => {
    expect(queueRows(s, NOW + 8 * MIN)[0]!.waiting).toBe('09:12');
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

describe('step_progress matrix, Phase 8 cells (D16 (3))', () => {
  const s = demoState(NOW);

  it('an answer waiting for the Host: orange cell with the wait, Duyệt / Phạt in the cell (the penalty minutes in its title)', () => {
    const c = rowOf(s, 'Đội Vàng').cells[3]!;
    expect(c.state).toBe('pending');
    expect(c.text).toBe('chờ duyệt 01:12 · Ảnh (B)');
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
    expect(c.buttons.map((b) => [b.op, b.id, b.label])).toEqual([['approve', 2, 'Duyệt câu vừa phạt']]); // not "Duyệt lại" (read as "review again", visual#3)
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
    expect(red.buttons).toEqual([expect.objectContaining({ op: 'approve', team: 't1', step: 'D1', label: 'Duyệt (đã nhận ảnh)' })]);
    expect(red.buttons[0]!.id).toBeUndefined();
    // branch chosen but its box not opened yet → the server refuses, so no button
    expect(rowOf(withRow(s, 't1', 'D1', { branchOpenedAt: null }), 'Đội Đỏ').cells[3]!.buttons).toEqual([]);
    // branch A is a typed answer, not a photo
    expect(rowOf(withRow(s, 't1', 'D1', { branch: 'A' }), 'Đội Đỏ').cells[3]!.buttons).toEqual([]);
    // a photo CHALLENGE: after "Nhận" (startedAt) yes, before no; also while the countdown runs (and then not "Duyệt câu vừa phạt")
    const photo: HostState = { ...s, leg: { ...s.leg!, steps: s.leg!.steps.map((x) => (x.id === 'T1' ? { ...x, proof: true } : x)) } };
    expect(rowOf(photo, 'Đội Tím').cells[1]!.buttons.map((b) => b.label)).toEqual(['Duyệt (đã nhận ảnh)']);
    expect(rowOf(withRow(photo, 't4', 'T1', { startedAt: null, lockedUntil: null }), 'Đội Tím').cells[1]!.buttons).toEqual([]);
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
    expect(s.queue).toHaveLength(2);
    expect(s.queue.every((q) => q.reference.length > 0)).toBe(true);
    expect(stuckAlerts(s, NOW)).toHaveLength(1);
    const states = progressTable(s, NOW).rows.flatMap((r) => r.cells.map((c) => c.state));
    expect(states).toContain('pending');
    expect(states).toContain('locked');
  });
});

// ── Phase 8B track D: louvre cell ──
describe('louvre cell (phase8b §H)', () => {
  const s = withLouvreDemo(demoState(NOW));
  const cellOf = (state: HostState, name: string, now = NOW) => rowOf(state, name, now).cells[5]!;

  it('shows picks / misses / the 70 min hint with the live x, a countdown while locked, and the exit button', () => {
    const c = cellOf(s, 'Đội Lục');
    expect(c.state).toBe('locked');
    expect(c.text).toBe('⏳ 02:10 · chọn 5/23 · ✗2 · 💡70 (3/5)');
    expect(c.buttons.map((b) => [b.op, b.id, b.step])).toEqual([['approve', undefined, 'T3']]); // approve without id = the way out
    expect(c.buttons[0]!.confirm).toContain('Đội Lục');
    expect(c.title).toContain('Đang chọn (5): art-04, art-09, art-11, art-15, art-20');
    expect(c.title).toContain('đúng 2/5');
    expect(c.title).toContain('đúng 3/5');
  });

  it('hint marks follow the clock: nothing, 40, then 70 (x only when the server sent it)', () => {
    const at = (min: number, more: Partial<Row> = {}) => cellOf(withRow(s, 't3', 'T3', { lockedUntil: null, startedAt: NOW - min * MIN, ...more }), 'Đội Lục');
    expect(at(10).text).toBe('chọn 5/23 · ✗2');
    expect(at(41).text).toBe('chọn 5/23 · ✗2 · 💡40');
    expect(at(71, { hintCorrect: 0 }).text).toBe('chọn 5/23 · ✗2 · 💡70 (0/5)');
    expect(at(71, { hintCorrect: null }).text).toBe('chọn 5/23 · ✗2 · 💡70');
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
    expect(louvreLines(s.leg!)).toEqual(['Thử thách 3: phòng Louvre, 23 tác phẩm (ảnh / mô hình có sẵn trong game, không cần tải lên), gợi ý phút 40 / 70.']);
    expect(louvreLines(demoState(NOW).leg!)).toEqual([]);
  });
});
