// RaceRoom over real time (workerd via createTestHarness): ticks by interest radius, snapshot / replay cadence vs the
// quota budget (docs/plans/phase6.md §9), the speed flag, the clue-box channel (SPEC §17.10), then restart from SQLite
// and hibernation. Phase 7: teams move into zones only by walking (TrustedPoint, D4), so the box checks run on the
// fake `nearLeg` (points 60 m apart, box within 40 m). Each race = its own Durable Object, so the first block runs concurrently; evictions stall the
// harness (they wait for the tick loop to go idle), so they run afterwards, one by one, on the races left behind.
import { decodeTick, encodePose, type BoxInfo, type HostState, type MoveMode, type QuotaCounters, type Welcome } from '@race/shared/protocol';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { joinTeam, LEG_START, nearLeg, nearPoint, openSocket, raceHarness, setupRace, sleep, walkTo } from './test/harness.ts';

const server = raceHarness();
beforeAll(async () => {
  await server.listen();
}, 60_000);
afterAll(() => server.close());

type Sock = Awaited<ReturnType<typeof joinTeam>>;
const cm = (v: number) => Math.round(v * 100) / 100;
const L1 = { x: cm(nearPoint(1).x), z: cm(nearPoint(1).z) };
// Positions below are metres from the leg start S (Phase 7: Pont de Bir-Hakeim, SPEC §17.12; a team never seen stands
// within leg.start.spreadMeters of it).
const S = LEG_START;
/** Loads nearLeg into a race (lobby, before any team joins). */
async function loadNear(host: { send(m: unknown): void; until: (m: (x: any) => boolean) => Promise<unknown> }) {
  host.send({ t: 'host.leg', json: JSON.stringify(nearLeg()) });
  expect(await host.until((m) => m.t === 'host.legResult')).toMatchObject({ ok: true });
}
const pose = (x: number, z: number, mode: MoveMode = 'walk') => encodePose({ x: S.x + x, y: 0, z: S.z + z, yaw: 0, mode, action: 'none' });
const respawn = (x: number, z: number) => ({ t: 'respawn', x: S.x + x, y: 0, z: S.z + z, yaw: 0, how: 'safe' });
/** A pose as it comes back from the wire (cm). */
const wire = (x: number, z: number) => { const a = encodePose({ x: S.x + x, y: 0, z: S.z + z, yaw: 0, mode: 'walk', action: 'none' }); return { x: a[1]! / 100, z: a[3]! / 100 }; };
const ticks = (msgs: unknown[]) => msgs.filter(Array.isArray).map((m) => decodeTick(m)!);
const slotsOf = (msgs: unknown[]) => ticks(msgs).at(-1)?.entries.map((e) => e.slot).sort();
const hostStates = (msgs: { t?: string }[]) => msgs.filter((m) => m.t === 'host.state') as HostState[];
const boxMsgs = (msgs: { t?: string }[]) => msgs.filter((m) => m.t === 'box');
const reveal = { t: 'box', op: 'reveal', box: { step: 'L1', x: L1.x, z: L1.z, opened: false, r: 15 } satisfies BoxInfo };
const hide = { t: 'box', op: 'hide', step: 'L1' };
const sqlOf = (race: string) => server.getWorker().getDurableObjectStorage('RaceRoom', { name: race });
const snapSeq = async (race: string) => {
  const rows = (await (await sqlOf(race)).exec('SELECT data FROM snapshot')) as { data: string }[];
  return rows[0] ? (JSON.parse(rows[0].data) as { seq: number }).seq : 0;
};
const evict = (race: string, webSockets: 'close' | 'hibernate') => server.getWorker().evictDurableObject('RaceRoom', { name: race, webSockets });
/** Sends `n` poses 200 ms apart (5 Hz), x advancing by `step` m each; returns the last x. */
async function walk(s: { send(m: unknown): void }, x0: number, z: number, step: number, n: number, mode: MoveMode = 'walk') {
  for (let i = 1; i <= n; i++) {
    s.send(pose(x0 + i * step, z, mode));
    await sleep(200);
  }
  return x0 + n * step;
}

/** Left behind by the first block for the restart / hibernation checks. */
const cadence = { hostToken: '', codes: [] as string[], slot: 0, ax: 0, wsIn: 0 };
let boxTeam: Sock | null = null;
let boxAt = { x: 0, z: 0 };

describe.concurrent('RaceRoom live', () => {
  it('ticks: teams within 500 m only, never itself; the Host gets all; nothing when nobody moves', async () => {
    const race = 'live-ticks';
    const { host, teams } = await setupRace(server, race, 3);
    const [a, b, c] = await Promise.all(teams.map((t) => joinTeam(server, race, t.code)));
    const [sa, sb, sc] = teams.map((t) => t.slot) as [number, number, number];
    a!.send(pose(0, 0));
    b!.send(pose(300, 0));
    c!.send(pose(900, 0)); // 900 m from A, 600 m from B
    const [ma, mb, mc, mh] = await Promise.all([a!.drain(600), b!.drain(600), c!.drain(600), host.drain(600)]);
    expect(slotsOf(ma)).toEqual([sb]);
    expect(slotsOf(mb)).toEqual([sa]);
    expect(ticks(mc).every((t) => t.entries.length === 0)).toBe(true);
    expect(slotsOf(mh)).toEqual([sa, sb, sc]);
    // nobody moves → no tick at all
    expect((await Promise.all([a!.drain(700), b!.drain(700), host.drain(700)])).flatMap(ticks)).toEqual([]);
    // A moves: B and the Host get a tick (standing B and C still in the Host's), A itself none
    a!.send(pose(1, 0));
    const [ma2, mb2, mh2] = await Promise.all([a!.drain(500), b!.drain(500), host.drain(500)]);
    expect(ticks(ma2)).toEqual([]);
    expect(ticks(mb2).at(-1)?.entries).toEqual([{ slot: sa, pose: { ...wire(1, 0), y: 0, yaw: 0, mode: 'walk', action: 'none' } }]);
    expect(slotsOf(mh2)).toEqual([sa, sb, sc]);
    // C leaves: the Host's next tick drops it
    c!.close();
    expect(await host.until((m) => m.t === 'team')).toMatchObject({ slot: sc, online: false });
    a!.send(pose(2, 0));
    expect(slotsOf(await host.drain(500))).toEqual([sa, sb]);
    for (const s of [a, b, host]) s!.close();
  }, 20_000);

  it('snapshot every 2 s + replay every 10 s, counters within the quota budget', async () => {
    const race = 'live-cadence';
    const { host, hostToken, teams } = await setupRace(server, race, 2);
    await loadNear(host);
    const [a, b] = await Promise.all(teams.map((t) => joinTeam(server, race, t.code)));
    const c0 = hostStates(await host.drain(1200)).at(-1)!.counters;
    const seq0 = await snapSeq(race);
    const T = 6; // s at 5 Hz, 2.5 m/s
    const [ax] = await Promise.all([walk(a!, 0, 0, 0.5, T * 5), walk(b!, 0, 5, 0.5, T * 5)]); // both near the leg start
    const c1: QuotaCounters = hostStates(await host.drain(2500)).at(-1)!.counters;
    const snaps = (await snapSeq(race)) - seq0;
    expect(snaps).toBeGreaterThanOrEqual(2);
    expect(snaps).toBeLessThanOrEqual(3);
    expect(c1.wsIn - c0.wsIn).toBe(2 * T * 5); // every received message counted
    expect(c1.rows - c0.rows).toBeLessThanOrEqual(snaps); // nothing but the snapshot row while moving
    // the replay row: 10 s after the first pose, the 1 Hz samples of both teams
    const sql = await sqlOf(race);
    let replay: { data: string }[] = [];
    for (let i = 0; i < 30 && !replay.length; i++, await sleep(200)) replay = (await sql.exec('SELECT data FROM replay')) as { data: string }[];
    expect(replay).toHaveLength(1);
    const samples = (JSON.parse(replay[0]!.data) as number[][]).map((m) => decodeTick(m)!);
    expect(samples.length).toBeGreaterThanOrEqual(5);
    expect(samples.at(-2)?.entries).toHaveLength(2);
    // docs/plans/phase6.md §9 at the measured rates: 20 teams moving for 2 h (+ the plan's other lines)
    const billable2h = Math.ceil((((c1.wsIn - c0.wsIn) / 2 / T) * 20 * 7200) / 20) + 344;
    const rows2h = (snaps / T + 1 / 10) * 7200 + 2750;
    expect(billable2h).toBeLessThan(40_000);
    expect(rows2h).toBeLessThan(20_000);
    // B ends next to L1 for the welcome.boxes check after the restart (walking: D4)
    await walkTo(b!, { x: S.x + 15, z: S.z + 5 }, { x: L1.x - 30, z: L1.z });
    expect(await b!.until((m) => m.t === 'box', 3000)).toEqual(reveal);
    host.close();
    Object.assign(cadence, { hostToken, codes: teams.map((t) => t.code), slot: teams[0]!.slot, ax, wsIn: c1.wsIn });
  }, 30_000);

  it('flags 20 m/s over the 3 s window for the Host; a 300 m respawn and bike speed are fine', async () => {
    const race = 'live-speed';
    const { host, teams } = await setupRace(server, race, 3);
    const [a, b, c] = await Promise.all(teams.map((t) => joinTeam(server, race, t.code)));
    await Promise.all([
      walk(a!, 0, 0, 4, 15), // 20 m/s
      (async () => {
        const x = await walk(b!, 0, 0, 0.6, 8); // 3 m/s
        b!.send(respawn(x + 300, 0));
        await sleep(200);
        await walk(b!, x + 300, 0, 0.6, 8);
      })(),
      walk(c!, 0, 0, 1.1, 15, 'bike'), // 5.5 m/s ≤ 4 × 1.3 × 1.25
    ]);
    const st = (await host.until((m) => m.t === 'host.state' && m.teams[0].flagged)) as unknown as HostState;
    expect(st.teams.map((t) => t.flagged)).toEqual([true, false, false]);
    const ev = (await (await sqlOf(race)).exec('SELECT team, type, data FROM events WHERE type IN (?, ?) ORDER BY id', 'speed', 'respawn')) as { team: string; type: string; data: string }[];
    expect(ev.map((e) => [e.team, e.type, JSON.parse(e.data)]).sort()).toEqual([
      [teams[0]!.id, 'speed', expect.objectContaining({ v: expect.any(Number) })],
      [teams[1]!.id, 'respawn', { how: 'safe', d: 300 }],
    ]);
    for (const s of [a, b, c, host]) s!.close();
  }, 20_000);

  it('a reconnect or a first pose is no free teleport, walking while offline is; chained / spammed respawns are flagged', async () => {
    const race = 'live-teleport';
    const { host, teams } = await setupRace(server, race, 4);
    const [a, b, c, d] = await Promise.all(teams.map((t) => joinTeam(server, race, t.code)));
    a!.send(pose(0, 0)); // the leg start
    b!.send(pose(0, 0));
    d!.send(pose(1500, 0)); // never seen before: 1.5 km from the leg start
    await sleep(300);
    a!.close();
    b!.close();
    await sleep(1000);
    const [a2, b2] = await Promise.all([teams[0]!, teams[1]!].map((t) => joinTeam(server, race, t.code)));
    a2!.send(pose(2000, 0)); // 2 km after ≈ 1.3 s offline
    b2!.send(pose(5, 0)); // 5 m: walked on while the socket was down
    for (let i = 1; i <= 8; i++) {
      c!.send(respawn(390 * i, 0)); // each < NET.maxRespawnJump, 3.1 km in 2 s
      await sleep(250);
    }
    const st = (await host.until((m) => m.t === 'host.state' && m.teams.filter((t: { flagged: boolean }) => t.flagged).length === 3)) as unknown as HostState;
    expect(st.teams.map((t) => t.flagged)).toEqual([true, false, true, true]);
    const ev = (await (await sqlOf(race)).exec('SELECT team, type, data FROM events WHERE type IN (?, ?) ORDER BY id', 'jump', 'respawn')) as { team: string; type: string; data: string }[];
    const of = (i: number) => ev.filter((e) => e.team === teams[i]!.id).map((e) => [e.type, JSON.parse(e.data)]);
    expect(of(0)).toEqual([['jump', expect.objectContaining({ d: expect.closeTo(2000, -1), suspicious: true })]]);
    expect(of(1)).toEqual([]);
    expect(of(3)).toEqual([['jump', expect.objectContaining({ d: expect.closeTo(1500, -1), suspicious: true })]]); // from its start spot (≤ 5 m off S)
    // C: 6 events (the cap), suspicious from the 2nd (780 m in all); respawns 7–8 flagged but not written
    expect(of(2)).toEqual([1, 2, 3, 4, 5, 6].map((i) => ['respawn', { how: 'safe', d: i > 1 ? 390 : expect.closeTo(390, -1), ...(i > 1 ? { suspicious: true } : {}) }]));
    for (const s of [a2, b2, c, d, host]) s!.close();
  }, 20_000);

  it('SQLite row budget: speed events stop at NET.maxRespawns per window, bike-op spam closes the socket', async () => {
    const race = 'live-budget';
    const { host, teams } = await setupRace(server, race, 2);
    const [a, b] = await Promise.all(teams.map((t) => joinTeam(server, race, t.code)));
    for (let i = 0; i < 8; i++) {
      a!.send(respawn(0, 100 * i)); // new window, `over` cleared
      for (let k = 1; k <= 8; k++) a!.send(pose(10 * k, 100 * i)); // stamped 200 ms apart: 80 m in 1.6 s, a new episode
      await sleep(1100); // ≤ NET.maxMessagesPerSec
    }
    await sleep(300);
    const speed = (await (await sqlOf(race)).exec('SELECT id FROM events WHERE type = ? AND team = ?', 'speed', teams[0]!.id)) as unknown[];
    expect(speed).toHaveLength(6);
    for (let i = 0; i < 13; i++) b!.send({ t: 'bike', op: 'dismount', id: 'nope', x: 0, y: 0, z: 0, yaw: 0 }); // NET.maxBikeOps 12 (+ 0 ≤ 15 msgs/s)
    expect(await b!.until(() => false, 3000)).toEqual({ closed: 4429 });
    for (const s of [a, host]) s!.close();
  }, 20_000);

  it('reveals the current box within boxReveal.radius to that team only, hides it beyond radius + hysteresis', async () => {
    const race = 'live-boxes';
    const { host, teams } = await setupRace(server, race, 2);
    await loadNear(host);
    const [a, b] = await Promise.all(teams.map((t) => joinTeam(server, race, t.code)));
    let p: { x: number; z: number } = (a!.welcome as unknown as Welcome).start!;
    const at = async (d: number) => (p = await walkTo(a!, p, { x: L1.x - d, z: L1.z }));
    b!.send(pose(0, 0));
    await at(45);
    expect(boxMsgs(await a!.drain(2500))).toEqual([]);
    await at(35);
    expect(boxMsgs(await a!.drain(2500))).toEqual([reveal]); // exactly one
    expect(boxMsgs([...(await b!.drain(10)), ...(await host.drain(10))])).toEqual([]);
    b!.close();
    host.close();
    await at(48); // inside the hysteresis band
    expect(boxMsgs(await a!.drain(2500))).toEqual([]);
    await at(55);
    expect(await a!.until((m) => m.t === 'box', 3000)).toEqual(hide);
    await at(35);
    expect(await a!.until((m) => m.t === 'box', 3000)).toEqual(reveal);
    boxTeam = a!;
    boxAt = p;
  }, 30_000);
});

describe('RaceRoom restart', () => {
  it('keeps poses, counters and the revealed box across a restart; a disconnect writes the snapshot at once', async () => {
    const race = 'live-cadence';
    await evict(race, 'close');
    const [a, b] = await Promise.all(cadence.codes.map((c) => joinTeam(server, race, c)));
    expect((a!.welcome as unknown as Welcome).pose).toMatchObject({ ...wire(cadence.ax, 0), bikeId: null });
    expect((a!.welcome as unknown as Welcome).boxes).toEqual([]);
    expect((b!.welcome as unknown as Welcome).boxes).toEqual([reveal.box]);
    await walkTo(b!, (b!.welcome as unknown as Welcome).pose!, { x: L1.x - 60, z: L1.z }); // revealed through welcome: walking out hides it
    expect(await b!.until((m) => m.t === 'box', 3000)).toEqual(hide);
    const host = await openSocket(server, race, cadence.hostToken);
    const st = (await host.until((m) => m.t === 'host.state')) as unknown as HostState;
    expect(st.counters.wsIn).toBeGreaterThanOrEqual(cadence.wsIn);
    expect(st.teams[0]).toMatchObject({ online: true, reconnects: 2, flagged: false });
    expect(st.teams[1]!.flagged).toBe(false); // B walked to L1 (Phase 6 respawned there)
    const seq = await snapSeq(race);
    a!.close();
    expect(await host.until((m) => m.t === 'team')).toMatchObject({ slot: cadence.slot, online: false });
    expect(await snapSeq(race)).toBe(seq + 1);
    for (const s of [b, host]) s!.close();
  }, 30_000);

  it('keeps the revealed box in the socket attachment across hibernation', async () => {
    await evict('live-boxes', 'hibernate');
    await walkTo(boxTeam!, boxAt, { x: L1.x - 55, z: L1.z });
    expect(await boxTeam!.until((m) => m.t === 'box', 3000)).toEqual(hide);
    boxTeam!.close();
  }, 30_000);
});
