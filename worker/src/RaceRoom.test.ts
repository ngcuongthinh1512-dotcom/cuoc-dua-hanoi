// End to end through workerd: Host login → create teams → team login → WebSocket welcome → one device per team →
// restart (evict) keeps the teams. Tracks A / C extend this file (ticks, snapshots, bikes).
import { CLOSE, encodePose, NET, PROTOCOL_VERSION, type HostState, type Welcome } from '@race/shared/protocol';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { login, openSocket, raceHarness, TEST_PASSWORD } from './test/harness.ts';

const server = raceHarness();
const RACE = 'paris-test';

beforeAll(async () => {
  await server.listen();
}, 60_000);
afterAll(() => server.close());

describe('RaceRoom', () => {
  let hostToken = '';
  let code = '';
  let teamId = '';

  it('answers /api/health with the protocol version and rejects bad race ids', async () => {
    expect(await (await server.fetch('/api/health')).json()).toMatchObject({ ok: true, v: PROTOCOL_VERSION });
    expect((await login(server, 'Bad Race!', { host: TEST_PASSWORD })).status).toBe(400);
  });

  it('logs the Host in with the password only', async () => {
    expect((await login(server, RACE, { host: 'wrong' })).status).toBe(401);
    const ok = await login(server, RACE, { host: TEST_PASSWORD });
    expect(ok.status).toBe(200);
    hostToken = ok.body.token!;
  });

  it('closes a socket with a bad token (4401)', async () => {
    const s = await openSocket(server, RACE, 'nope.nope');
    expect(await s.next()).toMatchObject({ closed: CLOSE.badToken });
  });

  it('welcomes the Host and creates teams with 6-char codes', async () => {
    const s = await openSocket(server, RACE, hostToken);
    const w = await s.next<Welcome>();
    expect(w).toMatchObject({ t: 'welcome', v: PROTOCOL_VERSION, race: RACE, role: 'host', status: 'lobby', teams: [] });
    expect(w.movement).toEqual({ footSpeed: 4, bikeSpeedMultiplier: 1.3 });
    s.send({ t: 'host.createTeams', teams: [{ name: 'Đội Xanh', colour: '#2c6bd8', player: 'An' }, { name: 'Đội Đỏ', colour: '#d8342c' }] });
    const st = await s.next<HostState>();
    expect(st.t).toBe('host.state');
    expect(st.teams.map((t) => [t.slot, t.name, t.online])).toEqual([[0, 'Đội Xanh', false], [1, 'Đội Đỏ', false]]);
    for (const t of st.teams) expect(t.code).toMatch(new RegExp(`^[${NET.codeAlphabet}]{${NET.codeLength}}$`));
    expect(st.counters.rows).toBeGreaterThan(0);
    code = st.teams[0]!.code;
    teamId = st.teams[0]!.id;
    s.close();
  });

  it('refuses Host-only messages and bad frames from a team', async () => {
    const t = await login(server, RACE, { code: code.toLowerCase() }); // case-insensitive
    expect(t.status).toBe(200);
    const s = await openSocket(server, RACE, t.body.token!);
    expect(await s.next()).toMatchObject({ t: 'welcome' });
    s.send({ t: 'host.spawning', paused: true });
    expect(await s.next()).toMatchObject({ closed: CLOSE.badMessage });
    const s2 = await openSocket(server, RACE, t.body.token!);
    expect(await s2.next()).toMatchObject({ t: 'welcome' });
    s2.send('x'.repeat(NET.maxPlayerBytes + 1));
    expect(await s2.next()).toMatchObject({ closed: CLOSE.tooBig });
  });

  it('logs a team in by code, welcomes it, kicks the older device, shows it online to the Host', async () => {
    expect((await login(server, RACE, { code: 'ZZZZZZ' })).status).toBe(401);
    const t = await login(server, RACE, { code });
    expect(t.body.team).toMatchObject({ id: teamId, slot: 0 });
    const first = await openSocket(server, RACE, t.body.token!);
    const w = await first.next<Welcome>();
    expect(w).toMatchObject({ role: 'team', team: { id: teamId, name: 'Đội Xanh', player: 'An', online: true }, pose: null });
    expect(w.teams).toHaveLength(2);
    first.send(encodePose({ x: 10, y: 0.5, z: -20, yaw: 1, mode: 'walk', action: 'none' }));
    first.send({ t: 'gesture', g: 'wave' });
    const second = await openSocket(server, RACE, t.body.token!);
    expect(await first.next()).toMatchObject({ t: 'kick', reason: 'otherDevice' });
    expect(await first.next()).toMatchObject({ closed: CLOSE.otherDevice });
    const w2 = await second.next<Welcome>();
    expect(w2.pose).toMatchObject({ x: 10, z: -20, mode: 'walk', bikeId: null });
    const host = await openSocket(server, RACE, hostToken);
    const hw = await host.next<Welcome>();
    expect(hw.teams.find((x) => x.id === teamId)?.online).toBe(true);
    second.close();
    expect(await host.next()).toMatchObject({ t: 'team', slot: 0, online: false });
    host.close();
  });

  it('locks a client after 5 wrong codes', async () => {
    for (let i = 0; i < NET.loginAttempts; i++) expect((await login(server, RACE, { code: 'AAAAAA' })).status).toBe(401);
    expect((await login(server, RACE, { code }))).toMatchObject({ status: 429, body: { error: 'locked' } });
  });

  it('keeps the teams across a Durable Object restart (SQLite)', async () => {
    await server.getWorker().evictDurableObject('RaceRoom', { name: RACE, webSockets: 'close' });
    const sql = await server.getWorker().getDurableObjectStorage('RaceRoom', { name: RACE });
    expect(await sql.exec('SELECT COUNT(*) AS n FROM teams')).toEqual([{ n: 2 }]);
    expect(await sql.exec("SELECT value FROM meta WHERE key = 'schema'")).toEqual([{ value: '1' }]);
    const s = await openSocket(server, RACE, hostToken);
    expect((await s.next<Welcome>()).teams).toHaveLength(2);
    s.close();
  });
});
