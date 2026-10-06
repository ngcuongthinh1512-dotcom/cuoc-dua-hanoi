// End to end through workerd: Host login → create teams → team login → WebSocket welcome → one device per team →
// lockout → restart (evict) keeps the teams; tokens and malformed / oversized / too fast messages are refused.
// Ticks, snapshots, speed and boxes: RaceRoom.live.test.ts.
import { CLOSE, encodePose, NET, PROTOCOL_VERSION, type HostState, type Welcome } from '@race/shared/protocol';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { signToken } from './auth.ts';
import { joinTeam, login, openSocket, raceHarness, setupRace, sleep, TEST_PASSWORD } from './test/harness.ts';

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
    const first = await s.next<HostState>(); // pushed on connect
    expect(first).toMatchObject({ t: 'host.state', teams: [] });
    expect(first.steps?.map((p) => p.id)).toEqual(['start', 'L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'PS']);
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
    const st = w.start!; // Phase 7: a team never seen appears at its spot at the leg start (D17)
    await sleep(800); // D4: the trusted point may follow ≈ 6.5 m/s × the time since the socket opened
    first.send(encodePose({ x: st.x + 3, y: 0.5, z: st.z - 2, yaw: 1, mode: 'walk', action: 'none' }));
    first.send({ t: 'gesture', g: 'wave' });
    const second = await openSocket(server, RACE, t.body.token!);
    expect(await first.next()).toMatchObject({ t: 'kick', reason: 'otherDevice' });
    expect(await first.next()).toMatchObject({ closed: CLOSE.otherDevice });
    const w2 = await second.next<Welcome>();
    expect(w2.pose).toMatchObject({ x: expect.closeTo(st.x + 3, 1), z: expect.closeTo(st.z - 2, 1), mode: 'walk', bikeId: null });
    const host = await openSocket(server, RACE, hostToken);
    const hw = await host.next<Welcome>();
    expect(hw.teams.find((x) => x.id === teamId)?.online).toBe(true);
    second.close();
    expect(await host.until((m) => m.t === 'team')).toMatchObject({ t: 'team', slot: 0, online: false });
    host.close();
  });

  it('locks a client after 5 wrong codes', async () => {
    for (let i = 0; i < NET.loginAttempts; i++) expect((await login(server, RACE, { code: 'AAAAAA' })).status).toBe(401);
    expect((await login(server, RACE, { code }))).toMatchObject({ status: 429, body: { error: 'locked' } });
  });

  it('refuses expired, forged and other-race tokens (4401)', async () => {
    const now = Date.now();
    const tokens = [
      await signToken(TEST_PASSWORD, { r: RACE, t: teamId, e: now - 1 }), // expired
      await signToken('not-the-secret', { r: RACE, t: 'host', e: now + 60_000 }), // forged
      await signToken(TEST_PASSWORD, { r: 'other-race', t: teamId, e: now + 60_000 }), // another race
      await signToken(TEST_PASSWORD, { r: RACE, t: 'no-such-team', e: now + 60_000 }),
    ];
    for (const token of tokens) expect(await (await openSocket(server, RACE, token)).next()).toMatchObject({ closed: CLOSE.badToken });
  });

  it('closes sockets that send malformed, oversized or too many messages', async () => {
    const { host, teams } = await setupRace(server, 'paris-frames', 1);
    const bad: [unknown, number][] = [
      ['{not json', CLOSE.badMessage],
      [[1, 1.5, 0, 0, 0, 0, 0], CLOSE.badMessage], // pose numbers must be integers (cm)
      [[1, 0, 0, 0, 0, 9, 0], CLOSE.badMessage], // unknown move mode
      [{ t: 'respawn', x: 'a' }, CLOSE.badMessage],
      [{ t: 'respawn', x: 10, y: 5000, z: 0, yaw: 0, how: 'safe' }, CLOSE.badMessage], // would break every tick (decodeTick)
      [{ t: 'respawn', x: 500_000, y: 0, z: 0, yaw: 0, how: 'safe' }, CLOSE.badMessage],
      [{ t: 'nope' }, CLOSE.badMessage],
      ['x'.repeat(NET.maxPlayerBytes + 1), CLOSE.tooBig],
    ];
    for (const [m, code] of bad) {
      const s = await joinTeam(server, 'paris-frames', teams[0]!.code);
      s.send(m);
      expect(await s.until(() => false)).toEqual({ closed: code });
    }
    const s = await joinTeam(server, 'paris-frames', teams[0]!.code);
    s.ws.send(new Uint8Array([1, 2, 3])); // binary frames are not part of the protocol
    expect(await s.until(() => false)).toEqual({ closed: CLOSE.badMessage });
    const f = await joinTeam(server, 'paris-frames', teams[0]!.code);
    for (let i = 0; i <= NET.maxMessagesPerSec; i++) f.send(encodePose({ x: 0, y: 0, z: 0, yaw: 0, mode: 'walk', action: 'none' }));
    expect(await f.until(() => false)).toEqual({ closed: CLOSE.tooFast });
    host.close();
  });

  it('keeps the teams across a Durable Object restart (SQLite)', async () => {
    await server.getWorker().evictDurableObject('RaceRoom', { name: RACE, webSockets: 'close' });
    const sql = await server.getWorker().getDurableObjectStorage('RaceRoom', { name: RACE });
    expect(await sql.exec('SELECT COUNT(*) AS n FROM teams')).toEqual([{ n: 2 }]);
    expect(await sql.exec("SELECT value FROM meta WHERE key = 'schema'")).toEqual([{ value: '4' }]); // Phase 8B schema v4
    const s = await openSocket(server, RACE, hostToken);
    expect((await s.next<Welcome>()).teams).toHaveLength(2);
    s.close();
    expect((await login(server, RACE, { code })).status).toBe(200); // the lockout was memory only (ponytail)
  }, 30_000); // eviction waits for the tick loop to go idle (NET.idleStopMs after the last pose)

  it('logs into the default race when the link has no ?race=', async () => {
    const r = await server.fetch('/api/login', { method: 'POST', body: JSON.stringify({ host: TEST_PASSWORD }) });
    expect(r.status).toBe(200);
    expect(await openSocket(server, 'macao', ((await r.json()) as { token: string }).token).then((s) => s.next())).toMatchObject({ t: 'welcome', race: 'macao' });
  });
});
