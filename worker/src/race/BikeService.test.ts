// Phase 6 track C: BikeService rows / messages / alarm with a controlled clock (SQLite = node:sqlite behind the
// SqlStorage calls BikeService makes), then the atomic claim end to end through workerd (createTestHarness).
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import type { HostState, ServerMessage, Welcome } from '@race/shared/protocol';
import { encodePose } from '@race/shared/protocol';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { QuotaCounters } from '../counters.ts';
import { migrate, setMeta } from '../db.ts';
import { login, openSocket, raceHarness, TEST_PASSWORD } from '../test/harness.ts';
import { besideBox, BikeService } from './BikeService.ts';
import { legRules } from './leg.ts';
import { FIXED, type ServerBike } from './VehicleSpawner.ts';
import { fixedBikeSpots } from '@race/shared/leg';
import { latLonToWorld } from '@race/shared';

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
  const io = { sql, counters: new QuotaCounters(), cfg, send: (team: string, m: ServerMessage) => sent.push([team, m]), setAlarm: (at: number) => alarms.push(at) };
  const to = (team: string) => sent.filter(([t]) => t === team).map(([, m]) => m);
  return { s: new BikeService(io), sql, sent, alarms, io, to };
}

const rows = (sql: SqlStorage) => sql.exec<{ data: string }>('SELECT data FROM bikes').toArray().map((r) => JSON.parse(r.data) as ServerBike);
const events = (sql: SqlStorage) => sql.exec<{ type: string; team: string | null; data: string }>('SELECT type, team, data FROM events ORDER BY id').toArray();
const line = (x0: number) => Array.from({ length: 30 }, (_, k) => [x0, 20 * k]).flat();
const candidates = { t: 'host.candidates' as const, segments: Array.from({ length: 8 }, (_, i) => line(1000 + 500 * i)), decoys: line(-3000) };
const spot = (team: string, x: number, z: number) => ({ team, x, z });
/** tick() with every team in `players` online. */
const tick = (s: BikeService, now: number, ...players: ReturnType<typeof spot>[]) => s.tick(players, new Set(players.map((p) => p.team)), now);

describe('BikeService (memory SQLite, controlled clock)', () => {
  it('vehicles.fixedBikes: seeded once (rows 1.6 m apart, segment FIXED), never re-seeded after a restart, untouched by spawning / abandonment while free, claimable one by one', () => {
    const fleet = { lat: 21.011325, lon: 105.842377, count: 15, rows: 3, spacing: 1.6, angleDeg: 0, label: '' };
    const sql = memorySql();
    migrate(sql);
    const sent: [string, ServerMessage][] = [];
    const io = { sql, counters: new QuotaCounters(), cfg: { ...cfg, fixedBikes: [fleet] }, send: (team: string, m: ServerMessage) => sent.push([team, m]), setAlarm: () => {} };
    const s = new BikeService(io);
    expect(s.list()).toHaveLength(15);
    const all = rows(sql);
    expect(all.every((b) => b.segment === FIXED && b.owner === null)).toBe(true);
    const gaps = all.flatMap((a) => all.filter((b) => b !== a).map((b) => Math.hypot(a.x - b.x, a.z - b.z)));
    expect(Math.min(...gaps)).toBeCloseTo(1.6, 1);
    const c = fixedBikeSpots([fleet])[0]!.reduce((m, p) => ({ x: m.x + p.x / 15, z: m.z + p.z / 15 }), { x: 0, z: 0 });
    const w = latLonToWorld(fleet.lat, fleet.lon);
    expect(Math.hypot(c.x - w.x, c.z - w.z)).toBeLessThan(0.05); // centred on the point
    // spawning + abandonment rounds with a player far away: the free fleet stays
    s.onHost(candidates, 0);
    s.alarm([{ team: 't1', x: 0, z: 0 }], 1);
    s.tick([{ team: 't1', x: 0, z: 0 }], new Set(['t1']), 10 * 60_000);
    expect(rows(sql).filter((b) => b.segment === FIXED)).toHaveLength(15);
    // two teams take neighbours 1.6 m apart
    const [a, b] = [all[0]!, all[1]!];
    s.onTeam('t1', { team: 't1', x: a.x, z: a.z }, { t: 'bike', op: 'claim', id: a.id }, false, 2);
    s.onTeam('t2', { team: 't2', x: b.x, z: b.z }, { t: 'bike', op: 'claim', id: b.id }, false, 2);
    expect(sent.filter(([, m]) => !Array.isArray(m) && m.t === 'bike').map(([t, m]) => [t, (m as { ok: boolean }).ok])).toEqual([['t1', true], ['t2', true]]);
    // restart (new service over the same rows): no second fleet, the taken bikes stay taken
    const again = new BikeService({ ...io, send: () => {} });
    expect(again.list()).toHaveLength(rows(sql).length);
    expect(again.list().filter((x) => x.owner === null && x.id.startsWith('f'))).toHaveLength(13);
  });
  it('candidates arm one alarm; it spawns the first round (rows + 1 event + the Host told); re-armed only while players are online', () => {
    const sql = memorySql();
    migrate(sql);
    setMeta(sql, 'spawner', JSON.stringify({ seed: 7, draws: 0, paused: false, nextAt: null, initialDone: false })); // not crypto: no flaky round of 0
    const { s, sent, alarms, io } = service(sql);
    s.onHost(candidates, 1000);
    expect(alarms).toEqual([1000]);
    expect(s.spawning).toMatchObject({ paused: false, candidates: 9 * 30, nextAt: 1000 });
    s.alarm([], 1000);
    const first = rows(sql);
    expect(first.length).toBeGreaterThan(0);
    expect(s.list()).toHaveLength(first.length);
    expect(events(sql).map((e) => e.type)).toEqual(['bikeSpawn']);
    expect(sent.at(-1)).toEqual(['host', { t: 'bikes', list: s.list() }]); // the Host only; teams by their view
    expect(alarms).toHaveLength(1); // nobody online: not re-armed
    expect(s.spawning.nextAt).toBeNull();
    tick(s, 2000, spot('t0', 0, 0)); // a player is back → armed again
    expect(alarms).toEqual([1000, 2000 + cfg.spawnIntervalMinutes * 60_000]);
    tick(s, 3000, spot('t0', 0, 0));
    expect(alarms).toHaveLength(2); // once
    s.alarm([spot('t0', 0, 0)], 2000 + cfg.spawnIntervalMinutes * 60_000);
    expect(alarms).toHaveLength(3);
    s.onHost({ t: 'host.spawning', paused: true }, 4000);
    s.alarm([spot('t0', 0, 0)], 5000);
    expect(alarms).toHaveLength(3); // paused: no round, no re-arm
    expect(io.counters.rows).toBeGreaterThan(first.length);
  });

  it('paused before the candidates: no first round until spawning is resumed', () => {
    const { s, alarms } = service();
    s.onHost({ t: 'host.spawning', paused: true }, 0);
    s.onHost(candidates, 1);
    expect(alarms).toEqual([]);
    s.alarm([], 2); // e.g. armed by a team connecting
    expect(s.list()).toEqual([]);
    s.onHost({ t: 'host.spawning', paused: false }, 3);
    expect(alarms).toEqual([3]);
  });

  it('claim writes before it answers; one bike per team; another team gets "taken"; walk-only refuses', () => {
    const { s, sql, sent } = service();
    s.onHost({ t: 'host.bike', op: 'add', x: 10, z: 10 }, 1);
    s.onHost({ t: 'host.bike', op: 'add', x: 50, z: 50 }, 2);
    const [a, b] = s.list().map((x) => x.id) as [string, string];
    s.onTeam('t1', spot('t1', 10, 11), { t: 'bike', op: 'claim', id: a }, 'walkOnly', 3);
    expect(sent.at(-1)).toEqual(['t1', { t: 'bike', op: 'claim', id: a, ok: false, reason: 'walkOnly' }]);
    s.onTeam('t0', spot('t0', 10, 11), { t: 'bike', op: 'claim', id: a }, false, 4);
    expect(rows(sql).find((r) => r.id === a)).toMatchObject({ owner: 't0', rider: true });
    const mine = expect.objectContaining({ id: a, owner: 't0', rider: true });
    expect(sent.slice(-3)).toEqual([
      ['t0', { t: 'bike', op: 'claim', id: a, ok: true }],
      ['host', { t: 'bikes', list: [mine] }],
      ['t0', { t: 'bikes', list: [mine, expect.objectContaining({ id: b })], full: true }], // its first view: b is 57 m away
    ]);
    s.onTeam('t1', spot('t1', 10, 11), { t: 'bike', op: 'claim', id: a }, false, 5);
    expect(sent.at(-1)).toEqual(['t1', { t: 'bike', op: 'claim', id: a, ok: false, reason: 'taken' }]);
    s.onTeam('t0', spot('t0', 12, 10), { t: 'bike', op: 'dismount', id: a, x: 12, y: 0.4, z: 10, yaw: 1 }, false, 6);
    expect(rows(sql).find((r) => r.id === a)).toMatchObject({ owner: 't0', rider: false, x: 12, y: 0.4, z: 10, yaw: 1 });
    s.onTeam('t0', spot('t0', 50, 51), { t: 'bike', op: 'claim', id: b }, false, 7); // a second bike: the first vanishes
    expect(rows(sql).map((r) => [r.id, r.owner])).toEqual([[b, 't0']]);
    expect(sent.slice(-2)).toEqual([
      ['host', { t: 'bikes', list: [expect.objectContaining({ id: b })], gone: [a] }],
      ['t0', { t: 'bikes', list: [expect.objectContaining({ id: b, owner: 't0' })], gone: [a] }],
    ]);
    expect(events(sql).filter((e) => e.type === 'bikeClaim')).toHaveLength(2);
    s.onTeam('t1', spot('t1', 0, 0), { t: 'bike', op: 'claim', id: a }, false, 8);
    expect(sent.at(-1)).toEqual(['t1', { t: 'bike', op: 'claim', id: a, ok: false, reason: 'gone' }]);
  });

  it('a dismount far from the last pose is not believed: the bike stands at the pose; a wild y is ignored', () => {
    const { s, sql } = service();
    s.onHost({ t: 'host.bike', op: 'add', x: 0, z: 0 }, 1);
    const id = s.list()[0]!.id;
    s.onTeam('t0', spot('t0', 1, 0), { t: 'bike', op: 'claim', id }, false, 2);
    s.onTeam('t0', spot('t0', 300, 0), { t: 'bike', op: 'dismount', id, x: 2000, y: 0, z: 0, yaw: 0 }, false, 3);
    expect(rows(sql)[0]).toMatchObject({ x: 300, z: 0, rider: false });
    s.onTeam('t0', spot('t0', 300, 0), { t: 'bike', op: 'mount', id }, false, 4);
    s.onTeam('t0', spot('t0', 301, 0), { t: 'bike', op: 'dismount', id, x: 302, y: 1e300, z: 0, yaw: 0 }, false, 5);
    expect(rows(sql)[0]).toMatchObject({ x: 302, y: 0, rider: false });
  });

  it('the own standing bike cannot be summoned from afar; repeated mount / claim / dismount write nothing', () => {
    const { s, io, sent } = service();
    s.onHost({ t: 'host.bike', op: 'add', x: 0, z: 0 }, 1);
    const id = s.list()[0]!.id;
    s.onTeam('t0', spot('t0', 0, 1), { t: 'bike', op: 'claim', id }, false, 2);
    s.onTeam('t0', spot('t0', 1, 0), { t: 'bike', op: 'dismount', id, x: 1, y: 0, z: 0, yaw: 0 }, false, 3);
    s.onTeam('t0', spot('t0', 190, 0), { t: 'bike', op: 'mount', id }, false, 4);
    expect(sent.at(-1)).toEqual(['t0', { t: 'bike', op: 'claim', id, ok: false, reason: 'far' }]);
    tick(s, 5, spot('t0', 190, 0));
    expect(s.list()[0]).toMatchObject({ x: 1, rider: false });
    s.onTeam('t0', spot('t0', 2, 0), { t: 'bike', op: 'mount', id }, false, 6);
    const [writes, n] = [io.counters.rows, sent.length];
    s.onTeam('t0', spot('t0', 2, 0), { t: 'bike', op: 'mount', id }, false, 7);
    s.onTeam('t0', spot('t0', 2, 0), { t: 'bike', op: 'claim', id }, false, 8);
    expect(io.counters.rows).toBe(writes);
    expect(sent.slice(n)).toEqual([['t0', { t: 'bike', op: 'claim', id, ok: true }], ['t0', { t: 'bike', op: 'claim', id, ok: true }]]);
    s.onTeam('t0', spot('t0', 2, 0), { t: 'bike', op: 'dismount', id, x: 2, y: 0, z: 0, yaw: 0 }, false, 9);
    const after = io.counters.rows;
    s.onTeam('t0', spot('t0', 2, 0), { t: 'bike', op: 'dismount', id, x: 2, y: 0, z: 0, yaw: 0 }, false, 10);
    expect(io.counters.rows).toBe(after);
  });

  it('teams hear only their view: own bikes, free and others’ standing bikes within 250 m, never one another team rides; the Host hears all', () => {
    const { s, to } = service();
    s.onHost({ t: 'host.bike', op: 'add', x: 0, z: 0 }, 1);
    s.onHost({ t: 'host.bike', op: 'add', x: 1000, z: 0 }, 2);
    const [a, f] = s.list().map((b) => b.id) as [string, string];
    s.onTeam('t0', spot('t0', 0, 1), { t: 'bike', op: 'claim', id: a }, false, 3);
    const teams = (x0: number) => [spot('t0', x0, 0), spot('t1', 50, 0), spot('t2', 1000, 100)];
    tick(s, 4, ...teams(100));
    expect(to('t1')).toEqual([{ t: 'bikes', list: [], full: true }]); // t0 rides a next to it: not sent
    expect(to('t2')).toEqual([{ t: 'bikes', list: [expect.objectContaining({ id: f })], full: true }]);
    s.onTeam('t0', spot('t0', 100, 0), { t: 'bike', op: 'dismount', id: a, x: 100, y: 0, z: 1, yaw: 0 }, false, 5);
    tick(s, 6, ...teams(400)); // t0 walks off: its standing bike is 50 m from t1
    expect(to('t1').at(-1)).toEqual({ t: 'bikes', list: [expect.objectContaining({ id: a, owner: 't0', rider: false, x: 100 })] });
    expect(to('t2')).toHaveLength(1); // nothing new within its 250 m
    tick(s, 7, ...teams(400));
    expect(to('t1')).toHaveLength(2); // no change, no message
    s.onTeam('t0', spot('t0', 100, 0), { t: 'bike', op: 'mount', id: a }, false, 8);
    tick(s, 9, ...teams(100));
    expect(to('t1').at(-1)).toEqual({ t: 'bikes', list: [], gone: [a] }); // ridden again: gone from t1's view
    const seen = (team: string) => to(team).flatMap((m) => (!Array.isArray(m) && m.t === 'bikes' ? m.list : []));
    expect(seen('t1').concat(seen('t2')).some((b) => b.rider)).toBe(false);
    expect(new Set(seen('host').map((b) => b.id))).toEqual(new Set([a, f]));
    expect(s.forTeam('t1', spot('t1', 50, 0))).toEqual([]); // welcome: same view
    expect(s.forTeam('t0', null)).toEqual([expect.objectContaining({ id: a })]); // own bikes even with no pose
  });

  it('a ridden bike follows its rider; offline rider → it stands there, locked; abandoned (> 200 m for 60 s) → gone + notice', () => {
    const { s, sql, sent } = service();
    s.onHost({ t: 'host.bike', op: 'add', x: 0, z: 0 }, 0);
    const id = s.list()[0]!.id;
    s.onTeam('t0', spot('t0', 1, 0), { t: 'bike', op: 'claim', id }, false, 0);
    tick(s, 1000, spot('t0', 400, 0));
    expect(s.list()[0]).toMatchObject({ x: 400, rider: true });
    expect(rows(sql)[0]).toMatchObject({ x: 0 }); // memory only while ridden
    tick(s, 2000); // owner offline (no socket)
    expect(rows(sql)[0]).toMatchObject({ x: 400, rider: false, owner: 't0' });
    tick(s, 500_000); // offline owners never lose it
    expect(s.list()).toHaveLength(1);
    tick(s, 501_000, spot('t0', 400, 300)); // back online, 300 m away: the minute counts from the last offline tick
    tick(s, 559_000, spot('t0', 400, 300));
    expect(s.list()).toHaveLength(1);
    tick(s, 561_000, spot('t0', 400, 300));
    expect(s.list()).toEqual([]);
    expect(rows(sql)).toEqual([]);
    expect(sent.slice(-3)).toEqual([['t0', { t: 'notice', code: 'bikeGone' }], ['host', { t: 'bikes', list: [], gone: [id] }], ['t0', { t: 'bikes', list: [], gone: [id] }]]);
    expect(events(sql).at(-1)).toMatchObject({ type: 'bikeGone' });
  });

  it('a connected team with no pose yet (the object just woke) keeps its rider: no row, no message, however long', () => {
    const { s, io, sent } = service();
    s.onHost({ t: 'host.bike', op: 'add', x: 0, z: 0 }, 0);
    const id = s.list()[0]!.id;
    s.onTeam('t0', spot('t0', 1, 0), { t: 'bike', op: 'claim', id }, false, 0);
    const [writes, n] = [io.counters.rows, sent.length];
    for (let i = 1; i <= 60; i++) s.tick([spot('t1', 3000, 0)], new Set(['t0', 't1']), i * 1000);
    expect(s.list()[0]).toMatchObject({ owner: 't0', rider: true });
    expect(io.counters.rows).toBe(writes);
    expect(sent.slice(n)).toEqual([['t1', { t: 'bikes', list: [], full: true }]]); // t1's first (empty) view only
  });

  it('park (§17.32): free for anyone, next to the team; a full rack loses its longest parked bike', () => {
    const { s, sent } = service();
    for (let i = 0; i <= cfg.bikeParking.maxBikes; i++) {
      s.onHost({ t: 'host.bike', op: 'add', x: 3 * i, z: 0 }, i);
      const id = s.list().at(-1)!.id;
      s.onTeam(`t${i}`, spot(`t${i}`, 3 * i, 0), { t: 'bike', op: 'claim', id }, false, 100 + i);
      s.park(`t${i}`, 'L1', null, 200 + i);
    }
    expect(sent.at(-2)).toEqual([`t${cfg.bikeParking.maxBikes}`, { t: 'notice', code: 'bikeParked' }]);
    expect(s.list()).toHaveLength(cfg.bikeParking.maxBikes);
    expect(s.list().every((b) => b.owner === null && b.parked)).toBe(true);
    expect(s.list().map((b) => b.x)).not.toContain(0); // the first one parked went
    s.onTeam('t9', spot('t9', 3, 0), { t: 'bike', op: 'claim', id: s.list()[0]!.id }, false, 300); // anyone may take it back
    expect(s.list()[0]).toMatchObject({ owner: 't9', parked: false });
    const id9 = s.list()[0]!.id;
    // riding 500 m away when the task starts: off the bike right there (the team's trusted pose), never a rack spot
    s.tick([spot('t9', 500, -7)], new Set(['t9']), 350);
    s.park('t9', 'L2', spot('t9', 503, -7), 400);
    expect(s.list().find((b) => b.id === id9)).toMatchObject({ x: 503, z: -7, owner: null, rider: false, parked: true });
    // offline (no pose): the bike stays where it stands
    s.onTeam('t8', spot('t8', 503, -7), { t: 'bike', op: 'claim', id: id9 }, false, 500);
    s.park('t8', 'L2', null, 600);
    expect(s.list().find((b) => b.id === id9)).toMatchObject({ x: 503, z: -7, owner: null, parked: true });
  });

  it('park beside the clue box (§17.34): BOX_SIDE m to its right, the next one on its left, MIN_GAP apart; anyone takes it', () => {
    const { s } = service();
    const box = { x: 100, z: 50, yaw: Math.PI / 2 }; // front faces west: its right is north (−z)
    ['t0', 't1', 't2'].forEach((t, i) => {
      s.onHost({ t: 'host.bike', op: 'add', x: 0, z: 0 }, 10 * i);
      s.onTeam(t, spot(t, 0, 0), { t: 'bike', op: 'claim', id: s.list().at(-1)!.id }, false, 10 * i + 1);
      s.park(t, 'L1', spot(t, 90, 50), 10 * i + 2, box);
    });
    expect(s.list().map((b) => [Math.round(b.x), Math.round(b.z), b.owner])).toEqual([[100, 48, null], [100, 52, null], [100, 45, null]]);
    expect(besideBox(box, [])).toEqual({ x: 100, z: 48 });
    s.onTeam('t2', spot('t2', 100, 49), { t: 'bike', op: 'claim', id: s.list()[0]!.id }, false, 40); // t0's old bike
    expect(s.list()[0]).toMatchObject({ owner: 't2', rider: true });
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
    // Track A pushes host.state right after welcome too: wait for the one that already lists the two new teams.
    const st = await until<HostState>(host, (m) => m.t === 'host.state' && (m.teams as unknown[]).length === 2);
    const teams = await Promise.all(st.teams.map(async (t) => openSocket(server, RACE, (await login(server, RACE, { code: t.code })).body.token!)));
    const spots: { x: number; z: number }[] = [];
    for (const t of teams) spots.push((await until<Welcome>(t, (m) => m.t === 'welcome')).start!);
    // between the two start spots of the default leg, wherever its start is (D4: claims reach from the trusted point, where a
    // team first appears; spots ≤ 2 × spreadMeters apart)
    host.send({ t: 'host.bike', op: 'add', x: (spots[0]!.x + spots[1]!.x) / 2, z: (spots[0]!.z + spots[1]!.z) / 2 });
    const id = (await until<{ list: { id: string }[] }>(host, (m) => m.t === 'bikes')).list[0]!.id; // teams: via their view
    teams.forEach((t, i) => t.send(encodePose({ x: spots[i]!.x, y: 0, z: spots[i]!.z, yaw: 0, mode: 'walk', action: 'none' })));
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
