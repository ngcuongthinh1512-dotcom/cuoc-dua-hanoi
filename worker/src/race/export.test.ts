// SPEC §17.25: the raw timing export (pure): fake timestamps on the `mini` leg → the three tables, the CSV around them.
import { describe, expect, it } from 'vitest';
import { emptyProgress, type EventRow, type StepProgressRow } from '../db.ts';
import { NEW_TEAM_RACE } from './engine.ts';
import { exportCsv, exportRace, STEP_COLS } from './export.ts';
import { bundledLeg } from './leg.ts';

const mini = bundledLeg('mini')!;
const T = Date.UTC(2026, 9, 3, 7, 0, 0); // 14:00:00 in Vietnam
const S = 1000; // ms
const ev = (id: number, t: number, team: string | null, type: string, data: object = {}): EventRow => ({ id, t, team, type, data: JSON.stringify(data) });
const row = (team: string, step: string, more: Partial<StepProgressRow>) => ({ ...emptyProgress(team, step), ...more }) as StepProgressRow;

/** t0 "Đỏ, \"A\"": joined at T, the race opened at T + 60 s, L1 done at +300 s, T1 penalized once (3 min) then approved at
 *  +600 s, now on L2 (arrived +700 s). t1: joined, nothing else. */
function data(now = T + 1_000 * S) {
  const teams = [
    { ...NEW_TEAM_RACE, id: 't0', name: 'Đỏ, "A"', startOrder: 1, joinedAt: T, step: 2 },
    { ...NEW_TEAM_RACE, id: 't1', name: '=cmd', startOrder: 2, joinedAt: T + 10 * S },
  ];
  const rows = [
    row('t0', 'L1', { arrived_at: T + 290 * S, completed_at: T + 300 * S }),
    row('t0', 'T1', {
      clue_opened_at: T + 300 * S, task_started_at: T + 310 * S, completed_at: T + 600 * S, rejections: 1, approval_wait_seconds: 40.4, host_note: 'GHI CHÚ HOST',
      answers: JSON.stringify([{ id: 1, b: null, text: 'ĐÁP ÁN SAI', at: T + 320 * S, s: 'penalized', d: T + 330 * S }, { id: 2, b: null, text: 'ĐÁP ÁN ĐÚNG', at: T + 520 * S, s: 'approved', d: T + 600 * S }]),
    }),
    row('t0', 'L2', { clue_opened_at: T + 600 * S, arrived_at: T + 700 * S }),
  ];
  const events = [ev(1, T - S, null, 'host.leg', { id: 'mini', bundled: true }), ev(2, T + 60 * S, null, 'host.race', { op: 'start' }), ev(3, T + 330 * S, 't0', 'review', { step: 'T1', op: 'penalize', id: 1, by: 'host' })];
  return exportRace(mini, teams, rows, events, now);
}

describe('exportRace (SPEC §17.25)', () => {
  it('teams × steps: epoch / ISO UTC / Vietnam time, s since the race opened and since the step before; counts, s locked, s waited', () => {
    const x = data();
    expect(x.raceStartAt).toBe(T + 60 * S);
    expect(x.steps.map((r) => [r.team, r.step])).toEqual([['t0', 'L1'], ['t0', 'T1'], ['t0', 'L2'], ['t1', 'L1']]);
    const [l1, t1, l2, other] = x.steps;
    // step 1: received at the team's first entry (SPEC §17.23), "since the step before" counted from it
    expect(l1).toMatchObject({ openedAt: T, openedAtUtc: '2026-10-03T07:00:00.000Z', openedAtVn: '2026-10-03 14:00:00', openedAtFromStart: -60, openedAtFromPrev: 0, completedAtFromPrev: 300, completedAtVn: '2026-10-03 14:05:00' });
    expect(t1).toMatchObject({
      label: 'Thử thách 1', type: 'challenge', branch: null, openedAtFromPrev: 0, startedAt: T + 310 * S, startedAtFromStart: 250, completedAtFromPrev: 300,
      wrongAnswers: 0, rejections: 1, lockedSeconds: 180, branchSwitches: 0, approvalWaitSeconds: 40,
    });
    expect(l2).toMatchObject({ arrivedAtFromPrev: 100, arrivedAtFromStart: 640, completedAt: null, completedAtUtc: null, completedAtVn: null, completedAtFromStart: null, lockedSeconds: 0 });
    expect(other).toMatchObject({ team: 't1', openedAt: T + 10 * S, arrivedAt: null });
    expect(Object.keys(t1!)).toEqual(STEP_COLS.map(([k]) => k));
  });

  it('a lock is cut by the step\'s completion and runs until now while it lasts; teams + events tables', () => {
    const short = exportRace(mini, [{ ...NEW_TEAM_RACE, id: 't0', name: 'x', joinedAt: T, step: 1 }], [row('t0', 'T1', { completed_at: T + 100 * S, answers: JSON.stringify([{ id: 1, b: null, text: 'x', at: T, s: 'penalized', d: T + 40 * S }]) })], [], T + 1e6);
    expect(short.steps[1]).toMatchObject({ lockedSeconds: 60 });
    const running = exportRace(mini, [{ ...NEW_TEAM_RACE, id: 't0', name: 'x', joinedAt: T, step: 1 }], [row('t0', 'T1', { answers: JSON.stringify([{ id: 1, b: null, text: 'x', at: T, s: 'penalized', d: T + 40 * S }]) })], [], T + 100 * S);
    expect(running.steps[1]).toMatchObject({ lockedSeconds: 60 });
    const x = data();
    expect(x.teams).toEqual([
      expect.objectContaining({ team: 't0', name: 'Đỏ, "A"', startOrder: 1, joinedAtVn: '2026-10-03 14:00:00', rank: null, finishAt: null, out: false }),
      expect.objectContaining({ team: 't1', startOrder: 2, joinedAtFromStart: -50 }),
    ]);
    expect(x.events.map((e) => [e.id, e.type, e.team, e.teamName, e.step, e.tFromStart])).toEqual([[1, 'host.leg', null, null, null, -61], [2, 'host.race', null, null, null, 0], [3, 'review', 't0', 'Đỏ, "A"', 'T1', 270]]);
    expect(x.events[2]!.data).toEqual({ step: 'T1', op: 'penalize', id: 1, by: 'host' });
  });

  it('never an answer, a typed answer or a Host note (only counts and times)', () => {
    const all = JSON.stringify(data());
    for (const secret of ['ĐÁP ÁN', 'GHI CHÚ', 'bốn mươi hai', '"42"', 'answers', 'referenceAnswers']) expect(all).not.toContain(secret);
  });

  it('a player\'s IP (the `login` event) is never exported: the event stays, without it', () => {
    const x = exportRace(mini, [{ ...NEW_TEAM_RACE, id: 't0', name: 'x', joinedAt: T }], [], [ev(1, T, 't0', 'login', { ip: '203.0.113.7' })], T);
    expect(x.events[0]).toMatchObject({ type: 'login', team: 't0', data: {} });
    for (const s of [JSON.stringify(x), exportCsv(x)]) expect(s).not.toContain('203.0.113.7');
  });

  it('CSV: UTF-8 BOM, CRLF, three titled tables with Vietnamese headers, RFC 4180 quoting, no spreadsheet formula, yes / no', () => {
    const csv = exportCsv(data());
    expect(csv.startsWith('﻿Bảng 1 – Thời gian đội × bước\r\nĐội (id),Tên đội,Mã bước,Tên bước,Loại bước,Nhánh,Tới điểm (epoch ms),')).toBe(true);
    const lines = csv.slice(1).split('\r\n');
    expect(lines.filter((l) => l.startsWith('Bảng '))).toEqual(['Bảng 1 – Thời gian đội × bước', 'Bảng 2 – Đội', 'Bảng 3 – Nhật ký sự kiện thô (bảng events)']);
    expect(lines[2]!.startsWith(`t0,"Đỏ, ""A""",L1,Lộ trình 1,route_info,,${T + 290 * S},2026-10-03T07:04:50.000Z,2026-10-03 14:04:50,230,`)).toBe(true);
    expect(csv).toContain(`\r\nt1,'=cmd,2,`); // a team name never runs as a formula
    expect(csv).toContain(',không\r\n'); // out: false
    expect(csv).toContain(`,"{""step"":""T1"",""op"":""penalize"",""id"":1,""by"":""host""}"\r\n`);
    expect(csv.endsWith('\r\n')).toBe(true);
    expect(csv).not.toContain('\n\n'); // only CRLF line ends
  });
});
