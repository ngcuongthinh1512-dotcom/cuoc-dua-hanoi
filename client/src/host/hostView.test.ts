import { isClientMessage } from '@race/shared/protocol';
import { describe, expect, it } from 'vitest';
import { ago, billableRequests, counterLines, demoState, MAX_TEAM_NAME, MAX_TEAMS_PER_BATCH, parseTeamLines, teamRows } from './hostView.ts';

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
});
