import { isClientMessage } from '@race/shared/protocol';
import { describe, expect, it } from 'vitest';
import { ago, billableRequests, corridorPoints, counterLines, demoState, fmtDuration, inputToMs, MAX_TEAM_NAME, MAX_TEAMS_PER_BATCH, msToInput, openBlanks, parseTeamLines, progressTable, startPreview, startRows, statusButtons, teamRows, warnings } from './hostView.ts';

describe('Host view', () => {
  it('billable requests = http + alarms + wsIn / 20 rounded up', () => {
    expect(billableRequests({ wsIn: 41, wsOut: 0, http: 3, alarms: 2, rows: 0 })).toBe(8);
  });

  it('builds table rows from host.state', () => {
    const rows = teamRows(demoState());
    expect(rows.map((r) => [r.name, r.status, r.reconnects])).toEqual([['Đội Xanh', 'online', 1], ['Đội Đỏ', 'online', 0], ['Đội Vàng', 'offline', 3], ['Đội Lục', 'offline', 0]]);
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

  it('start time input is read in the leg time zone, not the Host machine zone', () => {
    // 14:05:30 in Ho Chi Minh (UTC+7) = 07:05:30 UTC, whatever zone this process runs in
    expect(inputToMs('2026-10-03T14:05:30', 'Asia/Ho_Chi_Minh')).toBe(Date.UTC(2026, 9, 3, 7, 5, 30));
    expect(inputToMs('2026-10-03T14:05', 'Asia/Ho_Chi_Minh')).toBe(Date.UTC(2026, 9, 3, 7, 5, 0));
    // a Host machine in Paris typing a Vietnamese leg time gets the same instant; the Paris leg reads it 5 h earlier in October
    expect(inputToMs('2026-10-03T14:05:30', 'Europe/Paris')).toBe(Date.UTC(2026, 9, 3, 12, 5, 30)); // CEST = UTC+2
    expect(inputToMs('2026-01-15T14:00:00', 'Europe/Paris')).toBe(Date.UTC(2026, 0, 15, 13, 0, 0)); // CET = UTC+1
    expect(inputToMs('hôm nay', 'Europe/Paris')).toBeNull();
  });

  it('msToInput is the inverse of inputToMs, also around a DST change', () => {
    for (const [v, tz] of [['2026-10-03T14:05:30', 'Asia/Ho_Chi_Minh'], ['2026-03-29T03:30:00', 'Europe/Paris'], ['2026-10-25T01:30:00', 'Europe/Paris'], ['2026-12-31T23:59:59', 'America/New_York']] as const) {
      expect(msToInput(inputToMs(v, tz)!, tz)).toBe(v);
    }
  });

  it('preview: past time shows T+, > 60 s in the future is what the server refuses', () => {
    const now = 10_000_000;
    expect(startPreview(now - 3_725_000, now)).toEqual({ text: 'Đồng hồ đội sẽ hiện T+01:02:05.', level: 'ok' });
    expect(startPreview(now + 30_000, now).level).toBe('ok');
    expect(startPreview(now + 61_000, now).level).toBe('bad');
    expect(startPreview(null, now).level).toBe('bad');
    expect(fmtDuration(-61_000)).toBe('-00:01:01');
  });

  it('status buttons follow the race state machine (D9)', () => {
    const s = demoState();
    const labels = (status: typeof s.status) => statusButtons({ ...s, status }).map((b) => b.op);
    expect(labels('lobby')).toEqual(['start']);
    expect(labels('running')).toEqual(['pause', 'finish']);
    expect(labels('paused')).toEqual(['resume', 'finish']);
    expect(labels('finished')).toEqual([]);
    // "Mở cuộc đua" lists what is still empty
    expect(statusButtons({ ...s, status: 'lobby' })[0]!.confirm).toContain('Chưa nhập giờ xuất phát: Đội Lục');
  });

  it('red banner: lobby with teams online / start times, teams in game without a start time', () => {
    const s = demoState();
    expect(warnings({ ...s, status: 'lobby' }).join('\n')).toMatch(/chưa mở nhưng đã có 2 đội trong game[^]*Đã nhập giờ xuất phát khi cuộc đua chưa mở/);
    expect(warnings(s)).toEqual([]); // running, only Đội Lục (never entered) has no start time
    const t = s.teams.map((x) => (x.slot === 0 ? { ...x, startAt: null } : x));
    expect(warnings({ ...s, teams: t })[0]).toContain('Đội Xanh');
    expect(openBlanks({ ...s, leg: null })).toContain('Chưa nạp chặng.');
  });

  it('start rows show times in the leg zone', () => {
    const s = demoState(Date.UTC(2026, 9, 3, 8, 0, 0));
    const r = startRows(s)[0]!;
    expect(r.input).toBe(msToInput(s.teams[0]!.startAt!, 'Asia/Ho_Chi_Minh'));
    expect(r.input).toMatch(/^2026-10-03T14:\d\d:00$/); // 08:00 UTC − 50 min = 07:10 UTC = 14:10 ICT
    expect(r.startOrder).toBe('1');
    expect(startRows(s)[3]).toMatchObject({ input: '', joined: '—', startOrder: '—' });
  });

  it('step_progress matrix: done / active / todo cells, ranked rows, T+ mode', () => {
    const now = 3_000_000_000;
    const s = demoState(now);
    const { head, rows } = progressTable(s, now, 'real');
    expect(head.map((h) => h.label)).toEqual(['Lộ trình 1', 'Thử thách 1', 'Lộ trình 2', 'Lựa chọn kép', 'Lộ trình 3', 'Về đích']);
    expect(rows.map((r) => [r.name, r.rank])).toEqual([['Đội Xanh', '1'], ['Đội Vàng', '2'], ['Đội Đỏ', '3'], ['Đội Lục', '—']]);
    const blue = rows[0]!;
    expect(blue.cells.every((c) => c.state === 'done')).toBe(true);
    expect(blue.official).toBe('00:46:00');
    expect(blue.cells[0]!.text).toMatch(/^\d\d:\d\d:\d\d · 15:00$/); // when · how long the step took
    expect(blue.cells[3]!.text).toContain('(A)');
    const red = rows[2]!;
    expect(red.cells.map((c) => c.state)).toEqual(['done', 'done', 'done', 'active', 'todo', 'todo']);
    expect(red.cells[3]!.text).toBe('08:00'); // 50 − 8 − 42 = 8 min since the clue of D1 reached it
    expect(red.penalty).toBe('+2 phút');
    expect(rows[3]!.cells.map((c) => c.state)).toEqual(['active', 'todo', 'todo', 'todo', 'todo', 'todo']); // holds clue 1 (D3), no times yet
    // T+: each team on its own clock (Đội Xanh: step 1 done at +15 min)
    expect(progressTable(s, now, 't').rows[0]!.cells[0]!.text).toMatch(/^T\+00:15:00 · 15:00$/);
    expect(rows[0]!.cells[0]!.title).toContain('Tới điểm');
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
