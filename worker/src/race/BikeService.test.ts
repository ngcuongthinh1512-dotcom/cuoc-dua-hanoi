// Phase 6 track C: BikeService rows / messages / alarm with a controlled clock (SQLite = node:sqlite behind the
// SqlStorage calls BikeService makes), then the atomic claim end to end through workerd (createTestHarness).
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import type { HostState, ServerMessage, Welcome } from '@race/shared/protocol';
import { encodePose } from '@race/shared/protocol';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { QuotaCounters } from '../counters.ts';
import { migrate } from '../db.ts';
import { login, openSocket, raceHarness, TEST_PASSWORD } from '../test/harness.ts';
import { BikeService } from './BikeService.ts';
import { legRules } from './leg.ts';
import type { ServerBike } from './VehicleSpawner.ts';

const cfg = legRules().vehicles;

/** The slice of the Durable Object SqlStorage API BikeService / db.ts use, over an in-memory node:sqlite database. */
function memorySql(): SqlStorage {
  const db = new DatabaseSync(':memory:');
  const exec = (q: string, ...b: SQLInputValue[]) => {
    const st = db.prepare(q);
    const rows = /^\s*SELECT/i.test(q) ? st.all(...b) : [];
    const rowsWritten = rows.length || /^\s*SELECT/i.test(q) ? 0 : Number(st.run(...b).changes);
    return { toArray: () => rows, one: () => rows[0], rowsWritten };
  };
  return { exec } as unknown as SqlStorage;
}

function service(sql = memorySql()) {
  migrate(sql);
  const sent: [string, ServerMessage][] = [];
  const alarms: number[] = [];
  const io = { sql, counters: new QuotaCounters(), cfg, send: (team: string, m: ServerMessage) => sent.push([team, m]), broadcast: (m: ServerMessage) => sent.push(['*', m]), setAlarm: (at: number) => alarms.push(at) };
  return { s: new BikeService(io), sql, sent, alarms, io };
}

const rows = (sql: SqlStorage) => sql.exec<{ data: string }>('SELECT data FROM bikes').toArray().map((r) => JSON.parse(r.data) as ServerBike);
const events = (sql: SqlStorage) => sql.exec<{ type: string; team: string | null; data: string }>('SELECT type, team, data FROM events ORDER BY id').toArray();
const line = (x0: number) => Array.from({ length: 30 }, (_, k) => [x0, 20 * k]).flat();
const candidates = { t: 'host.candidates' as const, segments: Array.from({ length: 8 }, (_, i) => line(1000 + 500 * i)), decoys: line(-3000) };
const spot = (team: string, x: number, z: number) => ({ team, x, z });

describe('BikeService (memory SQLite, controlled clock)', () => {
  it('candidates arm one alarm; it spawns the first round (rows + 1 event + broadcast); re-armed only while players are online', () => {
    const { s, sql, sent, alarms, io } = service();
    s.onHost(candidates, 1000);
    expect(alarms).toEqual([1000]);
    expect(s.spawning).toMatchObject({ paused: false, candidates: 9 * 30, nextAt: 1000 });
    s.alarm([], 1000);
    const first = rows(sql);
    expect(first.length).toBeGreaterThan(0); // 8 segments × 50 %: never 0 in practice (0.5^8 = 0.4 %), seeded by crypto
    expect(s.list()).toHaveLength(first.length);
    expect(events(sql).map((e) => e.type)).toEqual(['bikeSpawn']);
    expect(sent.at(-1)).toEqual(['*', { t: 'bikes', list: s.list() }]);
    expect(alarms).toHaveLength(1); // nobody online: not re-armed
    expect(s.spawning.nextAt).toBeNull();
    s.tick([spot('t0', 0, 0)], 2000); // a player is back → armed again
    expect(alarms).toEqual([1000, 2000 + cfg.spawnIntervalMinutes * 60_000]);
    s.tick([spot('t0', 0, 0)], 3000);
    expect(alarms).toHaveLength(2); // once
    s.alarm([spot('t0', 0, 0)], 2000 + cfg.spawnIntervalMinutes * 60_000);
    expect(alarms).toHaveLength(3);
    s.onHost({ t: 'host.spawning', paused: true }, 4000);
    s.alarm([spot('t0', 0, 0)], 5000);
    expect(alarms).toHaveLength(3); // paused: no round, no re-arm
    expect(io.counters.rows).toBeGreaterThan(first.length);
  });

  it('claim writes before it answers; one bike per team; another team gets "taken"; walk-only refuses', () => {
    const { s, sql, sent } = service();
    s.onHost({ t: 'host.bike', op: 'add', x: 10, z: 10 }, 1);
    s.onHost({ t: 'host.bike', op: 'add', x: 50, z: 50 }, 2);
    const [a, b] = s.list().map((x) => x.id) as [string, string];
    s.onTeam('t1', spot('t1', 10, 11), { t: 'bike', op: 'claim', id: a }, true, 3);
    expect(sent.at(-1)).toEqual(['t1', { t: 'bike', op: 'claim', id: a, ok: false, reason: 'walkOnly' }]);
    s.onTeam('t0', spot('t0', 10, 11), { t: 'bike', op: 'claim', id: a }, false, 4);
    expect(rows(sql).find((r) => r.id === a)).toMatchObject({ owner: 't0', rider: true });
    expect(sent.slice(-2)).toEqual([['t0', { t: 'bike', op: 'claim', id: a, ok: true }], ['*', { t: 'bikes', list: [expect.objectContaining({ id: a, owner: 't0', rider: true })] }]]);
    s.onTeam('t1', spot('t1', 10, 11), { t: 'bike', op: 'claim', id: a }, false, 5);
    expect(sent.at(-1)).toEqual(['t1', { t: 'bike', op: 'claim', id: a, ok: false, reason: 'taken' }]);
    s.onTeam('t0', spot('t0', 12, 10), { t: 'bike', op: 'dismount', id: a, x: 12, y: 0.4, z: 10, yaw: 1 }, false, 6);
    expect(rows(sql).find((r) => r.id === a)).toMatchObject({ owner: 't0', rider: false, x: 12, y: 0.4, z: 10, yaw: 1 });
    s.onTeam('t0', spot('t0', 50, 51), { t: 'bike', op: 'claim', id: b }, false, 7); // a second bike: the first vanishes
    expect(rows(sql).map((r) => [r.id, r.owner])).toEqual([[b, 't0']]);
    expect(sent.at(-1)).toEqual(['*', { t: 'bikes', list: [expect.objectContaining({ id: b })], gone: [a] }]);
    expect(events(sql).filter((e) => e.type === 'bikeClaim')).toHaveLength(2);
    s.onTeam('t1', spot('t1', 0, 0), { t: 'bike', op: 'claim', id: a }, false, 8);
    expect(sent.at(-1)).toEqual(['t1', { t: 'bike', op: 'claim', id: a, ok: false, reason: 'gone' }]);
  });

  it('a dismount far from the last pose is not believed: the bike stands at the pose', () => {
    const { s, sql } = service();
    s.onHost({ t: 'host.bike', op: 'add', x: 0, z: 0 }, 1);
    const id = s.list()[0]!.id;
    s.onTeam('t0', spot('t0', 1, 0), { t: 'bike', op: 'claim', id }, false, 2);
    s.onTeam('t0', spot('t0', 300, 0), { t: 'bike', op: 'dismount', id, x: 2000, y: 0, z: 0, yaw: 0 }, false, 3);
    expect(rows(sql)[0]).toMatchObject({ x: 300, z: 0, rider: false });
  });

  it('a ridden bike follows its rider; offline rider → it stands there, locked; abandoned (> 200 m for 60 s) → gone + notice', () => {
    const { s, sql, sent } = service();
    s.onHost({ t: 'host.bike', op: 'add', x: 0, z: 0 }, 0);
    const id = s.list()[0]!.id;
    s.onTeam('t0', spot('t0', 1, 0), { t: 'bike', op: 'claim', id }, false, 0);
    s.tick([spot('t0', 400, 0)], 1000);
    expect(s.list()[0]).toMatchObject({ x: 400, rider: true });
    expect(rows(sql)[0]).toMatchObject({ x: 0 }); // memory only while ridden
    s.tick([], 2000); // owner offline
    expect(rows(sql)[0]).toMatchObject({ x: 400, rider: false, owner: 't0' });
    s.tick([], 500_000); // offline owners never lose it
    expect(s.list()).toHaveLength(1);
    s.tick([spot('t0', 400, 300)], 501_000); // back online, 300 m away: the minute counts from the last offline tick
    s.tick([spot('t0', 400, 300)], 559_000);
    expect(s.list()).toHaveLength(1);
    s.tick([spot('t0', 400, 300)], 561_000);
    expect(s.list()).toEqual([]);
    expect(rows(sql)).toEqual([]);
    expect(sent.slice(-2)).toEqual([['t0', { t: 'notice', code: 'bikeGone' }], ['*', { t: 'bikes', list: [], gone: [id] }]]);
    expect(events(sql).at(-1)).toMatchObject({ type: 'bikeGone' });
  });

  it('park: free for anyone at the rack; a full rack loses its longest parked bike', () => {
    const { s, sent } = service();
    for (let i = 0; i <= cfg.bikeParking.maxBikes; i++) {
      s.onHost({ t: 'host.bike', op: 'add', x: 3 * i, z: 0 }, i);
      const id = s.list().at(-1)!.id;
      s.onTeam(`t${i}`, spot(`t${i}`, 3 * i, 0), { t: 'bike', op: 'claim', id }, false, 100 + i);
      s.park(`t${i}`, 'L1', 200 + i);
    }
    expect(sent.at(-2)).toEqual([`t${cfg.bikeParking.maxBikes}`, { t: 'notice', code: 'bikeParked' }]);
    expect(s.list()).toHaveLength(cfg.bikeParking.maxBikes);
    expect(s.list().every((b) => b.owner === null && b.parked)).toBe(true);
    expect(s.list().map((b) => b.x)).not.toContain(0); // the first one parked went
    s.onTeam('t9', spot('t9', 3, 0), { t: 'bike', op: 'claim', id: s.list()[0]!.id }, false, 300); // anyone may take it back
    expect(s.list()[0]).toMatchObject({ owner: 't9', parked: false });
  });

  it('Host: release frees a team’s bike, remove deletes it', () => {
    const { s, sql } = service();
    s.onHost({ t: 'host.bike', op: 'add', x: 0, z: 0 }, 1);
    const id = s.list()[0]!.id;
    s.onTeam('t0', spot('t0', 0, 1), { t: 'bike', op: 'claim', id }, false, 2);
    s.onHost({ t: 'host.bike', op: 'release', team: 't0' }, 3);
    expect(rows(sql)[0]).toMatchObject({ owner: null, rider: false });
    s.onHost({ t: 'host.bike', op: 'remove', id }, 4);
    expect(rows(sql)).toEqual([]);
    s.onHost({ t: 'host.bike', op: 'add', x: Number.NaN, z: 0 }, 5); // bad input ignored
    expect(s.list()).toEqual([]);
  });

  it('a restart rebuilds bikes and the RNG position from SQLite', () => {
    const { s, sql } = service();
    s.onHost(candidates, 0);
    s.alarm([], 0);
    const before = s.list();
    const again = service(sql).s;
    expect(again.list()).toEqual(before);
    expect(again.spawning).toEqual(s.spawning);
  });
});

describe('BikeService through the Durable Object (createTestHarness)', () => {
  const server = raceHarness();
  const RACE = 'bikes-test';
  beforeAll(() => server.listen(), 60_000);
  afterAll(() => server.close());

  type Sock = Awaited<ReturnType<typeof openSocket>>;
  const until = async <T>(s: Sock, pred: (m: Record<string, unknown>) => boolean) => {
    for (;;) {
      const m = await s.next();
      if (pred(m)) return m as unknown as T;
    }
  };

  it('two teams claim the same bike in the same instant: exactly one wins, the other hears "taken"; the row is written', async () => {
    const host = await openSocket(server, RACE, (await login(server, RACE, { host: TEST_PASSWORD })).body.token!);
    await host.next<Welcome>();
    host.send({ t: 'host.createTeams', teams: [{ name: 'Đội Xanh', colour: '#2c6bd8' }, { name: 'Đội Đỏ', colour: '#d8342c' }] });
    const st = await until<HostState>(host, (m) => m.t === 'host.state');
    const teams = await Promise.all(st.teams.map(async (t) => openSocket(server, RACE, (await login(server, RACE, { code: t.code })).body.token!)));
    for (const t of teams) expect(await t.next()).toMatchObject({ t: 'welcome' });
    host.send({ t: 'host.bike', op: 'add', x: 5, z: 5 });
    const id = (await until<{ list: { id: string }[] }>(teams[0]!, (m) => m.t === 'bikes')).list[0]!.id;
    await until(teams[1]!, (m) => m.t === 'bikes');
    teams.forEach((t, i) => t.send(encodePose({ x: 5 + i, y: 0, z: 6, yaw: 0, mode: 'walk', action: 'none' })));
    teams.forEach((t) => t.send({ t: 'bike', op: 'claim', id }));
    const answers = await Promise.all(teams.map((t) => until<{ ok: boolean; reason?: string }>(t, (m) => m.t === 'bike')));
    expect(answers.filter((a) => a.ok)).toHaveLength(1);
    expect(answers.find((a) => !a.ok)).toMatchObject({ reason: 'taken' });
    const winner = st.teams[answers.findIndex((a) => a.ok)]!.id;
    const sql = await server.getWorker().getDurableObjectStorage('RaceRoom', { name: RACE });
    const [row] = (await sql.exec('SELECT data FROM bikes')) as { data: string }[];
    expect(JSON.parse(row!.data)).toMatchObject({ id, owner: winner, rider: true });
    expect(await sql.exec("SELECT team FROM events WHERE type = 'bikeClaim'")).toEqual([{ team: winner }]);
    // Candidates → ctx.storage.setAlarm(now) → alarm() → the first round reaches everyone (20 segments: P(no bike) ≈ 1e-6).
    host.send({ ...candidates, segments: Array.from({ length: 20 }, (_, i) => line(1000 + 100 * i)) });
    const round = await until<{ list: { id: string }[] }>(host, (m) => m.t === 'bikes' && (m.list as { id: string }[]).some((b) => b.id.startsWith('b')));
    expect(round.list.length).toBeGreaterThan(0);
    expect(await sql.exec("SELECT COUNT(*) AS n FROM events WHERE type = 'bikeSpawn'")).toEqual([{ n: 2 }]); // host add + first round
    for (const t of [host, ...teams]) t.close();
  });
});
