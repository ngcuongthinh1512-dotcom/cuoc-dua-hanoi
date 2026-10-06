// SPEC §17.39 / §17.40 through workerd: the spectator code (same login box, same guess limit), the spectator socket (compact
// welcome, every team's ticks, nothing else, everything it sends dropped, 50 at most, "Đổi mã" closes it), a finished team
// (keeps sending poses, race ops / bikes refused, `watch on` → every team's ticks only once it is over).
import { CLOSE, encodePose, NET, type HostState, type Welcome } from '@race/shared/protocol';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { joinTeam, LEG_START, login, nearLeg, nearPoint, openSocket, raceHarness, setupRace, walkTo } from './test/harness.ts';

const server = raceHarness();
beforeAll(async () => {
  await server.listen();
}, 60_000);
afterAll(() => server.close());

const RACE = 'race-watch';
const FAR = { x: LEG_START.x + 600, z: LEG_START.z }; // beyond NET.interestRadius (500 m) from the start
const pose = (p: { x: number; z: number }) => encodePose({ x: p.x, y: 0, z: p.z, yaw: 0, mode: 'walk', action: 'none' });
const isTick = (m: unknown): m is number[] => Array.isArray(m);
/** Slots in a tick array: [2, ms, slot, x, y, z, yaw, mode, action, slot, …]. */
const slotsOf = (m: number[]) => m.slice(2).filter((_, i) => i % 7 === 0);
const hostState = (h: { until: (f: (m: any) => boolean) => Promise<any> }, f: (s: HostState) => boolean = () => true) => h.until((m) => m.t === 'host.state' && f(m)) as Promise<HostState>;
/** Team-only traffic a spectator must never get (SPEC §17.40). */
const PRIVATE = new Set(['race', 'box', 'zone', 'book', 'notice', 'host.state', 'host.notice', 'host.legResult', 'kick']);

describe('watch mode (workerd)', () => {
  it('spectator code + socket, finished team keeps its poses, watch on/off, rotate, full', async () => {
    const { host, teams } = await setupRace(server, RACE, 2);
    host.send({ t: 'host.leg', json: JSON.stringify(nearLeg()) });
    await host.until((m) => m.t === 'host.legResult');
    const st0 = await hostState(host, (s) => !!s.spectatorCode);
    const code = st0.spectatorCode!;
    expect(code).toMatch(new RegExp(`^${NET.spectatorPrefix}[${NET.codeAlphabet}]{${NET.codeLength - 1}}$`));
    expect(st0.spectators).toBe(0);

    // the same box: a wrong code is a wrong code, the spectator code gives a watch-only token
    expect((await login(server, RACE, { code: 'KZZZZZ' })).status).toBe(401);
    const sl = await login(server, RACE, { code: code.toLowerCase() });
    expect(sl.status).toBe(200);
    expect((sl.body as { role?: string }).role).toBe('spectator');
    const spec = await openSocket(server, RACE, sl.body.token!);
    const seen: unknown[] = []; // everything the spectator ever gets
    const specDrain = async (ms: number) => {
      const got = await spec.drain(ms);
      seen.push(...got);
      return got;
    };
    const w = await spec.next<Welcome>();
    seen.push(w);
    expect(w).toMatchObject({ t: 'welcome', role: 'spectator', pose: null, bikes: [], boxes: [], view: null, startOrder: null, start: null });
    expect(w.teams.map((t) => [t.slot, t.online, t.racing])).toEqual([[0, false, true], [1, false, true]]);
    expect(w).not.toHaveProperty('team');
    expect((await hostState(host, (s) => s.spectators === 1)).spectators).toBe(1);

    // two teams, one far from the other: the spectator's tick has both, the team's only who is near it
    host.send({ t: 'host.race', op: 'start' });
    const [a, b] = await Promise.all(teams.map((t) => joinTeam(server, RACE, t.code)));
    expect((a!.welcome as unknown as Welcome).teams.every((t) => t.racing)).toBe(true);
    b!.send(pose(FAR));
    a!.send(pose(LEG_START));
    const tick = (await spec.until((m) => isTick(m) && slotsOf(m).length === 2)) as number[];
    seen.push(tick);
    expect(slotsOf(tick).sort()).toEqual([0, 1]);
    expect((await a!.drain(700)).filter((m) => isTick(m) && slotsOf(m).includes(1))).toEqual([]); // b is 600 m away

    // whatever a spectator sends is dropped: no answer, no effect, the socket stays
    spec.send(pose(LEG_START));
    spec.send({ t: 'race', op: 'book' });
    spec.send({ t: 'host.race', op: 'pause' });
    spec.send('garbage');
    expect((await specDrain(600)).filter((m) => !isTick(m) && m.t !== 'team')).toEqual([]);
    expect((await hostState(host)).status).toBe('running');

    // a opens its box: a's own race traffic, nothing of it to the spectator (checked at the end: `seen`)
    await walkTo(a!, LEG_START, nearPoint(1));
    a!.send({ t: 'race', op: 'open', step: 'L1' });
    await a!.until((m) => m.t === 'race' && m.view.card.step === 'T1');

    // SPEC §17.40: `watch on` from a RACING team changes nothing (b stays out of its ticks)
    a!.send({ t: 'watch', on: true });
    b!.send(pose({ x: FAR.x + 1, z: FAR.z }));
    expect((await a!.drain(700)).filter((m) => isTick(m) && slotsOf(m).includes(1))).toEqual([]);

    // the Host ends the race: a is out, still has its body (poses reach the Host), race ops / bikes refused, watch honoured
    host.send({ t: 'host.race', op: 'finish' });
    await a!.until((m) => m.t === 'race' && m.view.status === 'finished' && m.view.result?.kind === 'out');
    expect((await a!.until((m) => isTick(m) && slotsOf(m).includes(1))).closed).toBeUndefined(); // every team now
    const news = (await specDrain(600)).filter((m) => m.t === 'team' && m.racing === false).map((m) => m.slot).sort();
    expect(news).toEqual([0, 1]);
    const moved = { x: nearPoint(1).x, z: nearPoint(1).z + 40 };
    await walkTo(a!, nearPoint(1), moved);
    expect((await hostState(host, (s) => Math.abs((s.teams[0]!.pose?.z ?? 0) - moved.z) < 1)).teams[0]!.racing).toBe(false);
    a!.send({ t: 'race', op: 'open', step: 'T1' });
    await a!.until((m) => m.t === 'notice' && m.code === 'raceOver');
    host.send({ t: 'host.bike', op: 'add', x: moved.x + 1, z: moved.z });
    const bikes = (await host.until((m) => m.t === 'bikes' && m.list.some((b: { id: string }) => b.id.startsWith('h')))) as { list: { id: string }[] }; // the Host-added one
    a!.send({ t: 'bike', op: 'claim', id: bikes.list.find((b) => b.id.startsWith('h'))!.id });
    expect(await a!.until((m) => m.t === 'bike')).toMatchObject({ ok: false, reason: 'finished' });
    a!.send({ t: 'watch', on: false });
    expect(slotsOf((await a!.until((m) => isTick(m) && !slotsOf(m).includes(1))) as number[])).toEqual([]); // back to the radius: b gone

    // "Đổi mã": the open spectator socket closes 4401, the old code dies, the new one works
    host.send({ t: 'host.spectator', op: 'rotate' });
    expect(await spec.until(() => false)).toMatchObject({ closed: CLOSE.badToken });
    const st1 = await hostState(host, (s) => s.spectatorCode !== code);
    expect(st1.spectators).toBe(0);
    expect((await login(server, RACE, { code })).status).toBe(401);
    expect((await openSocket(server, RACE, sl.body.token!).then((s) => s.next())).closed).toBe(CLOSE.badToken);
    const token2 = (await login(server, RACE, { code: st1.spectatorCode! })).body.token!;

    // room for NET.maxSpectators; the next one is turned away (CLOSE.full)
    const many = await Promise.all(Array.from({ length: NET.maxSpectators }, () => openSocket(server, RACE, token2)));
    for (const s of many) expect((await s.next()).t).toBe('welcome');
    expect((await (await openSocket(server, RACE, token2)).next()).closed).toBe(CLOSE.full);
    expect((await hostState(host, (s) => s.spectators === NET.maxSpectators)).spectators).toBe(NET.maxSpectators);

    expect(seen.filter((m) => !isTick(m) && PRIVATE.has((m as { t: string }).t))).toEqual([]);
    for (const s of [a!, b!, host, ...many]) s.close();
  }, 90_000);
});
