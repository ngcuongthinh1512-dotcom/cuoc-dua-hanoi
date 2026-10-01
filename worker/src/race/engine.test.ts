// RaceEngine with a fake RaceIO that logs the order of calls (docs/plans/phase7.md track A: replaces the "SQLite before
// the race message" harness check, which the DO output gate makes unable to fail): rows first, messages after; a failing
// write sends nothing and leaves the cache as it was.
import { stepZones } from '@race/shared/leg';
import type { PoseSample, ServerMessage } from '@race/shared/protocol';
import { describe, expect, it } from 'vitest';
import { QuotaCounters } from '../counters.ts';
import { bundledLeg } from './leg.ts';
import { NEW_TEAM_RACE, RaceEngine, type TeamRace } from './engine.ts';

const Z = stepZones(bundledLeg('mini')!);

function fake() {
  const log: string[] = [];
  const sent: [string, ServerMessage][] = [];
  const teams = new Map<string, TeamRace>([['t0', { ...NEW_TEAM_RACE, startOrder: 1, joinedAt: 1 }]]);
  const meta = new Map<string, string>();
  let fail = false;
  const sql = {
    exec(q: string, ...args: unknown[]) {
      if (fail && !q.startsWith('SELECT')) throw new Error('disk');
      log.push(`sql ${q.trim().split(/\s+/).slice(0, 3).join(' ')}`);
      if (q.startsWith('INSERT INTO meta')) meta.set(String(args[0]), String(args[1]));
      const rows = q.startsWith('SELECT value FROM meta') ? (meta.has(String(args[0])) ? [{ value: meta.get(String(args[0])) }] : []) : [];
      return { toArray: () => rows, rowsWritten: 1 };
    },
  } as unknown as SqlStorage;
  const poses = new Map<string, PoseSample>();
  const io = {
    sql, counters: new QuotaCounters(),
    transaction: <T,>(fn: () => T) => fn(),
    send: (team: string, m: ServerMessage) => (log.push(`send ${(m as { t: string }).t}`), sent.push([team, m])),
    changed: () => {},
    event: (_t: number, _team: string | null, type: string) => {
      if (fail) throw new Error('disk');
      log.push(`event ${type}`);
    },
    team: (id: string) => teams.get(id),
    saveTeam: (id: string, r: TeamRace) => {
      if (fail) throw new Error('disk');
      log.push('saveTeam');
      teams.set(id, r);
    },
    teamIds: () => [...teams.keys()],
    slot: () => 0,
    online: () => [...teams.keys()],
    pose: (id: string) => poses.get(id) ?? null,
    park: () => log.push('park'),
    legLoaded: () => {},
  };
  return { io, log, sent, teams, setFail: (v: boolean) => (fail = v) };
}

const at = (i: number, mode: PoseSample['mode'] = 'walk'): PoseSample => ({ x: Z[i]!.x, y: 0, z: Z[i]!.z, yaw: 0, mode, action: 'none' });

describe('RaceEngine', () => {
  it('writes the rows of a transition before it sends anything', () => {
    const f = fake();
    f.teams.set('t0', { ...NEW_TEAM_RACE }); // no team entered yet: the leg may be loaded
    const e = new RaceEngine(f.io);
    const replies: ServerMessage[] = [];
    e.onHost({ t: 'host.leg', id: 'mini' }, (m) => replies.push(m), 0);
    expect(replies).toEqual([{ t: 'host.legResult', ok: true, issues: [] }]);
    f.teams.set('t0', { ...NEW_TEAM_RACE, startOrder: 1, joinedAt: 1 });
    e.onHost({ t: 'host.race', op: 'start' }, (m) => replies.push(m), 1);
    f.log.length = 0;
    f.sent.length = 0;
    e.onOp('t0', { t: 'race', op: 'open', step: 'L1' }, at(0), 10);
    const firstSend = f.log.findIndex((l) => l.startsWith('send'));
    expect(f.log.slice(0, firstSend)).toEqual(['sql INSERT INTO step_progress', 'sql INSERT INTO step_progress', 'event arrive', 'event complete', 'saveTeam']);
    expect(f.log.slice(firstSend).every((l) => l.startsWith('send'))).toBe(true);
    expect(f.sent.map(([, m]) => m)).toEqual([
      { t: 'box', op: 'reveal', box: expect.objectContaining({ step: 'L1', opened: true }) }, // D5: opened at once
      { t: 'notice', code: 'clueNew' },
      { t: 'race', view: expect.objectContaining({ status: 'running', card: expect.objectContaining({ step: 'T1', receivedAt: 10 }) }) },
    ]);
    expect(f.teams.get('t0')!.step).toBe(1);
  });

  it('a failing write sends nothing and leaves the cache as it was', () => {
    const f = fake();
    f.teams.set('t0', { ...NEW_TEAM_RACE });
    const e = new RaceEngine(f.io);
    e.onHost({ t: 'host.leg', id: 'mini' }, () => {}, 0);
    f.teams.set('t0', { ...NEW_TEAM_RACE, startOrder: 1, joinedAt: 1 });
    e.onHost({ t: 'host.race', op: 'start' }, () => {}, 1);
    const before = JSON.stringify(e.hostView(5));
    f.sent.length = 0;
    f.setFail(true);
    expect(() => e.onOp('t0', { t: 'race', op: 'open', step: 'L1' }, at(0), 10)).toThrow('disk');
    expect(f.sent).toEqual([]);
    expect(JSON.stringify(e.hostView(5))).toBe(before);
    f.setFail(false);
    e.onOp('t0', { t: 'race', op: 'book' }, at(0), 11);
    expect(f.sent).toEqual([['t0', { t: 'book', cards: [expect.objectContaining({ step: 'L1', status: 'active', receivedAt: 1 })] }]]);
  });

  it('refused ops write nothing; status gates ops but not arrivals (D9)', () => {
    const f = fake();
    f.teams.set('t0', { ...NEW_TEAM_RACE });
    const e = new RaceEngine(f.io);
    e.onHost({ t: 'host.leg', id: 'mini' }, () => {}, 0);
    f.teams.set('t0', { ...NEW_TEAM_RACE, startOrder: 1, joinedAt: 1 });
    f.log.length = 0;
    e.onOp('t0', { t: 'race', op: 'open', step: 'L1' }, at(0), 10);
    e.onOp('t0', { t: 'race', op: 'checkin' }, at(0), 10); // periodic mat check-in: silent outside running
    expect(f.log).toEqual(['send notice']);
    expect(f.sent.at(-1)).toEqual(['t0', { t: 'notice', code: 'raceNotOpen' }]);
    e.onPose('t0', at(0), 20); // lobby: the arrival is still recorded
    expect(f.log.filter((l) => !l.startsWith('send'))).toEqual(['sql INSERT INTO step_progress', 'event arrive']);
    const r: ServerMessage[] = [];
    e.onHost({ t: 'host.race', op: 'resume' }, (m) => r.push(m), 30);
    e.onHost({ t: 'host.leg', id: 'paris-demo' }, (m) => r.push(m), 30);
    expect(r).toEqual([{ t: 'host.notice', level: 'error', message: expect.stringContaining('tạm dừng') }, { t: 'host.legResult', ok: false, issues: [expect.objectContaining({ message: expect.stringContaining('race id mới') })] }]);
    f.log.length = 0;
    e.onOp('t0', { t: 'race', op: 'open', step: 'L1' }, at(0, 'bike'), 40);
    e.onHost({ t: 'host.race', op: 'start' }, () => {}, 41);
    f.log.length = 0;
    e.onOp('t0', { t: 'race', op: 'open', step: 'L1' }, at(0, 'bike'), 42);
    e.onOp('t0', { t: 'race', op: 'open', step: 'L1' }, at(2), 42);
    expect(f.log).toEqual(['send notice', 'send notice']);
    expect(f.sent.slice(-2).map(([, m]) => m)).toEqual([{ t: 'notice', code: 'boxRiding' }, { t: 'notice', code: 'boxFar' }]);
  });
});
