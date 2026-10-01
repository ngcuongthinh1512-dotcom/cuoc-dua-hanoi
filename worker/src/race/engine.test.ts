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
    slot: (id: string) => [...teams.keys()].indexOf(id),
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

  it('D4: a task on a bike is refused with boxRiding (the trusted pose\'s mode), on foot it passes', () => {
    const f = fake();
    f.teams.set('t0', { ...NEW_TEAM_RACE });
    const e = new RaceEngine(f.io);
    e.onHost({ t: 'host.leg', id: 'mini' }, () => {}, 0);
    f.teams.set('t0', { ...NEW_TEAM_RACE, startOrder: 1, joinedAt: 1, step: 1 });
    e.onHost({ t: 'host.race', op: 'start' }, () => {}, 1);
    f.log.length = 0;
    e.onOp('t0', { t: 'race', op: 'task', step: 'T1' }, at(1, 'bike'), 10);
    expect(f.log).toEqual(['send notice']); // nothing written, no park under the rider
    expect(f.sent.at(-1)).toEqual(['t0', { t: 'notice', code: 'boxRiding' }]);
    e.onOp('t0', { t: 'race', op: 'task', step: 'T1' }, at(1), 11);
    expect(f.teams.get('t0')!.step).toBe(2);
  });

  it('D15: a start time after the team\'s check-in is refused; a change for a running team moves its clock, which then only runs forward', () => {
    const f = fake();
    f.teams.set('t0', { ...NEW_TEAM_RACE, startOrder: 1, joinedAt: 1, startAt: 100_000, finishAt: 900_000 }).set('t1', { ...NEW_TEAM_RACE, startOrder: 2, joinedAt: 1 });
    const e = new RaceEngine(f.io);
    e.onHost({ t: 'host.race', op: 'start' }, () => {}, 0);
    const r: ServerMessage[] = [];
    const startAt = (team: string, at: number | 'now', now: number) => e.onHost({ t: 'host.team', op: 'startAt', team, at }, (m) => r.push(m), now);
    f.log.length = 0;
    startAt('t0', 900_001, 1_000_000);
    expect(r).toEqual([{ t: 'host.notice', level: 'error', message: expect.stringContaining('về đích') }]);
    expect(f.log).toEqual([]); // nothing written, nothing sent to the team
    expect(f.teams.get('t0')!.startAt).toBe(100_000);
    startAt('t0', 900_000, 1_000_000); // = the check-in: allowed
    expect(f.sent.at(-1)).toEqual(['t0', { t: 'race', view: expect.objectContaining({ startAt: 900_000, officialMs: 0 }) }]);
    // a running team: each change moves its clock; from there it only runs forward and never below 0 (≤ 60 s ahead is
    // accepted for a clock skew)
    const clock = (now: number) => e.summary('t1', now).raceTime;
    startAt('t1', 400_000, 1_000_000);
    expect([1_000_000, 1_005_000].map(clock)).toEqual([600, 605]);
    startAt('t1', 'now', 1_010_000);
    expect([1_010_000, 1_011_000].map(clock)).toEqual([0, 1]);
    startAt('t1', 1_050_000, 1_020_000);
    expect([1_020_000, 1_040_000, 1_050_000, 1_055_000].map(clock)).toEqual([0, 0, 0, 5]);
    const views = f.sent.filter(([t, m]) => t === 't1' && (m as { t: string }).t === 'race').map(([, m]) => (m as { view: { startAt: number | null } }).view.startAt);
    expect(views.slice(-3)).toEqual([400_000, 1_010_000, 1_050_000]);
  });

  it('every status change reaches each online team as a race view, and its welcome carries it (lobby / paused / finished on screen)', () => {
    const f = fake();
    f.teams.set('t1', { ...NEW_TEAM_RACE, startOrder: 2, joinedAt: 1 });
    const e = new RaceEngine(f.io);
    expect(e.welcome('t1', null, false, 0).view!.status).toBe('lobby');
    for (const [op, status] of [['start', 'running'], ['pause', 'paused'], ['resume', 'running'], ['finish', 'finished']] as const) {
      f.sent.length = 0;
      e.onHost({ t: 'host.race', op }, () => {}, 1);
      expect(f.sent.filter(([, m]) => (m as { t: string }).t === 'race').map(([t, m]) => [t, (m as { view: { status: string } }).view.status])).toEqual([['t0', status], ['t1', status]]);
      expect(e.welcome('t1', null, false, 2).view!.status).toBe(status);
    }
  });

  it('a broken JSON leg gets a Vietnamese line / column, not the engine text (review)', () => {
    const f = fake();
    f.teams.set('t0', { ...NEW_TEAM_RACE });
    const e = new RaceEngine(f.io);
    const r: ServerMessage[] = [];
    e.onHost({ t: 'host.leg', json: '{\n  "id": "x",\n  "yawDeg": 33, // huong nhin\n}' }, (m) => r.push(m), 0);
    const msg = (r[0] as { issues: { message: string }[] }).issues[0]!.message;
    expect(msg).toMatch(/^File không phải JSON hợp lệ: lỗi cú pháp \(dòng 3, cột 17\)\. Có thể do: .*chú thích/);
    expect(msg).not.toMatch(/Expected|position|JSON at/);
  });

  it('after the Host\'s "Kết thúc" the view says finished and a pose writes nothing (read-only, SPEC §8.10)', () => {
    const f = fake();
    f.teams.set('t0', { ...NEW_TEAM_RACE });
    const e = new RaceEngine(f.io);
    e.onHost({ t: 'host.leg', id: 'mini' }, () => {}, 0);
    f.teams.set('t0', { ...NEW_TEAM_RACE, startOrder: 1, joinedAt: 1 });
    e.onHost({ t: 'host.race', op: 'start' }, () => {}, 1);
    e.onHost({ t: 'host.race', op: 'finish' }, () => {}, 2);
    expect(f.sent.at(-1)).toEqual(['t0', { t: 'race', view: expect.objectContaining({ status: 'finished', finishAt: null }) }]);
    f.log.length = 0;
    e.onPose('t0', at(0), 10);
    e.onOp('t0', { t: 'race', op: 'open', step: 'L1' }, at(0), 11);
    expect(f.log).toEqual(['send notice']); // raceOver; no arrival row, no park
  });

  it('"Tại điểm này" never shows a team on a later step than the viewer (review m3: a later step\'s label there)', () => {
    const leg = structuredClone(bundledLeg('mini')!);
    (leg.steps[2] as { destination: unknown }).destination = (leg.steps[0] as { destination: unknown }).destination; // L2 back at L1's place
    const chaillot = stepZones(leg)[0]!;
    const f = fake();
    f.teams.set('t0', { ...NEW_TEAM_RACE }).set('t1', { ...NEW_TEAM_RACE });
    const e = new RaceEngine(f.io);
    const r: ServerMessage[] = [];
    e.onHost({ t: 'host.leg', json: JSON.stringify(leg) }, (m) => r.push(m), 0);
    expect(r[0]).toMatchObject({ ok: true });
    f.teams.set('t0', { ...NEW_TEAM_RACE, startOrder: 1, joinedAt: 1, step: 2 }).set('t1', { ...NEW_TEAM_RACE, startOrder: 2, joinedAt: 1, step: 1 });
    const p: PoseSample = { x: chaillot.x, y: 0, z: chaillot.z, yaw: 0, mode: 'walk', action: 'none' };
    e.onPose('t0', p, 10); // A arrives for L2
    e.onPose('t1', p, 11); // B (on T1) walks back to the L1 place it did
    const zones = (team: string) => f.sent.filter(([t, m]) => t === team && (m as { t: string }).t === 'zone').map(([, m]) => m);
    expect(zones('t1')).toEqual([{ t: 'zone', teams: [] }]);
    expect(zones('t0').at(-1)).toEqual({ t: 'zone', teams: [{ slot: 1, label: 'Thử thách 1', type: 'challenge', branch: null, since: 11 }] });
  });
});
