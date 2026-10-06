// Phase 7 race engine end to end through workerd (docs/plans/phase7.md track A tests): start order, lobby / pause gates,
// boxes per step, SQLite before the answer, start times, check-in, ranking, Host leg loading, "Tại điểm này", walk-only
// bikes, the row budget; then the trusted point (D4: a teleport / respawn into a zone opens nothing) and a restart
// mid-leg. Teams move only by walking (5 Hz poses) on the fake `nearLeg` (points 60 m apart, fast foot speed).
import { SPRINT_MULTIPLIER } from '@race/shared';
import { stepZones } from '@race/shared/leg';
import { NET, type ClueCard, type HostState, type RaceView, type Welcome } from '@race/shared/protocol';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bundledLeg } from './race/leg.ts';
import { answer, joinTeam, LEG_START, login, nearLeg, nearPoint, raceHarness, review, setupRace, sleep, walkTo } from './test/harness.ts';

const server = raceHarness();
beforeAll(async () => {
  await server.listen();
}, 60_000);
afterAll(() => server.close());

type Sock = Awaited<ReturnType<typeof joinTeam>>;
type Host = Awaited<ReturnType<typeof setupRace>>['host'];
const P = [0, 1, 2, 3, 4, 5, 6].map((k) => nearPoint(k));
const sqlOf = (race: string) => server.getWorker().getDurableObjectStorage('RaceRoom', { name: race });
const W = (s: Sock) => s.welcome as unknown as Welcome;
const view = (s: Sock, match: (v: RaceView) => boolean) => s.until((m) => m.t === 'race' && match(m.view)) as Promise<{ view: RaceView }>;
const step = (s: Sock, id: string) => view(s, (v) => v.card?.step === id);
const notice = (s: Sock, code: string) => s.until((m) => m.t === 'notice' && m.code === code);
const card = async (s: Sock, match: (c: ClueCard) => boolean) => (await view(s, (v) => !!v.card && match(v.card))).view.card!;
/** Waits out a card's countdown (server and test share the machine clock) + a little. */
const waitLock = (c: ClueCard) => sleep(c.lockedUntil! - Date.now() + 300);
const hostSays = (h: Host, t: string) => h.until((m) => m.t === t);

async function newRace(race: string, n: number, leg: unknown = nearLeg()) {
  const r = await setupRace(server, race, n);
  r.host.send({ t: 'host.leg', json: JSON.stringify(leg) });
  expect(await hostSays(r.host, 'host.legResult')).toMatchObject({ ok: true });
  const socks = await Promise.all(r.teams.map((t) => joinTeam(server, race, t.code)));
  return { ...r, socks };
}

/** T1 (Phase 8): accept, answer where the team stands, the Host decides (`penalize`: the first answer, the lock waited
 *  out, then answered again) → L2. */
async function doT1(s: Sock, host: Host, team: string, penalize = false) {
  s.send({ t: 'race', op: 'accept', step: 'T1' });
  answer(s, 'T1', penalize ? '41' : '42');
  await card(s, (c) => c.step === 'T1' && c.status === 'pending');
  if (penalize) {
    review(host, team, 'T1', 'penalize');
    await waitLock(await card(s, (c) => c.status === 'locked'));
    answer(s, 'T1', '42');
    await card(s, (c) => c.status === 'pending' && c.answers.length === 2);
  }
  review(host, team, 'T1', 'approve');
  await step(s, 'L2');
}

/** D1 from L2's point (Phase 8): branch A (`switch`: then B, its lock waited out), walk to the branch box, open it, answer
 *  (A auto '7'; B a photo task: "Tôi đã gửi bài", the Host approves) → L3. Returns where the team stands. */
async function doD1(s: Sock, host: Host, team: string, from: { x: number; z: number }, switchToB = false) {
  s.send({ t: 'race', op: 'branch', step: 'D1', branch: 'A' });
  await card(s, (c) => c.branch === 'A');
  const b = switchToB ? 'B' : 'A';
  if (switchToB) {
    s.send({ t: 'race', op: 'branch', step: 'D1', branch: 'B' });
    await waitLock(await card(s, (c) => c.status === 'switchLocked'));
  }
  const p = await walkTo(s, from, P[b === 'A' ? 4 : 5]!);
  s.send({ t: 'race', op: 'open', step: 'D1', branch: b });
  await card(s, (c) => !!c.branchOpened);
  answer(s, 'D1', b === 'A' ? '7' : '');
  if (b === 'B') {
    await card(s, (c) => c.status === 'pending');
    review(host, team, 'D1', 'approve');
  }
  await step(s, 'L3');
  return p;
}

/** Walks a team through the whole near leg from `from` (open L1, T1, open L2, D1, the mat). */
async function runLeg(s: Sock, from: { x: number; z: number }, host: Host, team: string, o: { penalize?: boolean; switchToB?: boolean } = {}) {
  let p = await walkTo(s, from, P[1]!);
  s.send({ t: 'race', op: 'open', step: 'L1' });
  await step(s, 'T1');
  p = await walkTo(s, p, P[2]!);
  await doT1(s, host, team, o.penalize);
  p = await walkTo(s, p, P[3]!);
  s.send({ t: 'race', op: 'open', step: 'L2' });
  await step(s, 'D1');
  p = await doD1(s, host, team, p, o.switchToB);
  p = await walkTo(s, p, P[6]!);
  return { p, done: await view(s, (v) => v.finishAt !== null) };
}

/** Left behind by the flow test for the restart test. */
const flow = { race: 'race-flow', code: '', codeA: '' };

describe.concurrent('race engine (workerd)', () => {
  it('start order, lobby / pause gates, boxes per step, SQLite before the answer, check-in + finish rank, ranking, Host leg rules', async () => {
    const race = flow.race;
    const { host, teams } = await setupRace(server, race, 2);
    host.send({ t: 'host.leg', json: '{"id": "x", "title": "y",' });
    expect(await hostSays(host, 'host.legResult')).toMatchObject({ ok: false, issues: [{ level: 'error', message: expect.stringContaining('JSON') }] });
    host.send({ t: 'host.leg', json: JSON.stringify({ ...nearLeg(), steps: [{ id: 'R', type: 'roadblock', label: 'x' }] }) });
    expect(await hostSays(host, 'host.legResult')).toMatchObject({ ok: false, issues: [expect.objectContaining({ message: expect.stringContaining('roadblock') })] });
    host.send({ t: 'host.leg', id: 'mini' });
    expect(await hostSays(host, 'host.legResult')).toEqual({ t: 'host.legResult', ok: true, issues: [] });
    host.send({ t: 'host.leg', json: JSON.stringify(nearLeg()) });
    expect(await hostSays(host, 'host.legResult')).toMatchObject({ ok: true });
    expect(((await hostSays(host, 'host.state')) as unknown as HostState).leg).toMatchObject({ id: 'near', start: { x: expect.closeTo(LEG_START.x, 1) }, bundled: ['macao-demo', 'macao-demo-filled', 'mini'] });

    // two teams open their sockets at the same time: start orders 1 and 2, the banner only on that first welcome
    const [a, b0] = await Promise.all(teams.map((t) => joinTeam(server, race, t.code)));
    expect([W(a!).startOrder, W(b0!).startOrder].sort()).toEqual([1, 2]);
    for (const s of [a!, b0!]) {
      expect(W(s)).toMatchObject({ showStartOrder: true, pose: null, view: { status: 'lobby', result: null, card: { step: 'L1', status: 'active' } } });
      expect(W(s)).not.toHaveProperty('raceTime'); // SPEC §17.23: no team clock
      expect(Math.hypot(W(s).start!.x - LEG_START.x, W(s).start!.z - LEG_START.z)).toBeLessThanOrEqual(5);
    }
    const b = await joinTeam(server, race, teams[1]!.code);
    expect(W(b)).toMatchObject({ showStartOrder: false, startOrder: W(b0!).startOrder });
    flow.code = teams[1]!.code;
    flow.codeA = teams[0]!.code;
    await host.until((m) => m.t === 'host.state' && m.teams.every((t: { startOrder: number | null }) => t.startOrder !== null));
    host.send({ t: 'host.leg', json: JSON.stringify(nearLeg()) }); // a team entered: refused (D11)
    expect(await hostSays(host, 'host.legResult')).toMatchObject({ ok: false, issues: [{ message: expect.stringContaining('race id mới') }] });

    a!.send({ t: 'race', op: 'open', step: 'L1' });
    await notice(a!, 'raceNotOpen');
    host.send({ t: 'host.race', op: 'resume' });
    expect(await hostSays(host, 'host.notice')).toMatchObject({ level: 'error' });
    host.send({ t: 'host.race', op: 'start' });
    await view(a!, (v) => v.status === 'running');

    // every message A gets until T1 is done: never L2's box / coordinates (SPEC §17.10)
    const seen: unknown[] = [];
    const until = (match: (m: any) => boolean) => a!.until((m) => (seen.push(m), match(m)));
    let pa = await walkTo(a!, W(a!).start!, { x: P[1]!.x - 25, z: P[1]!.z });
    a!.send({ t: 'race', op: 'open', step: 'L1' });
    await until((m) => m.t === 'notice' && m.code === 'boxFar');
    pa = await walkTo(a!, pa, P[1]!);
    a!.send({ t: 'race', op: 'open', step: 'L1' });
    await until((m) => m.t === 'race' && m.view.card.step === 'T1');
    const sql = await sqlOf(race);
    const rows = (await sql.exec('SELECT step, arrived_at, completed_at, clue_opened_at FROM step_progress WHERE team = ? ORDER BY step', teams[0]!.id)) as Record<string, number | null>[];
    expect(rows).toEqual([{ step: 'L1', arrived_at: expect.any(Number), completed_at: expect.any(Number), clue_opened_at: null }, { step: 'T1', arrived_at: null, completed_at: null, clue_opened_at: rows[0]!.completed_at }]);
    const state = (await sql.exec('SELECT state FROM teams WHERE id = ?', teams[0]!.id)) as { state: string }[];
    expect(JSON.parse(state[0]!.state)).toMatchObject({ step: 1 });
    expect(seen).toContainEqual({ t: 'box', op: 'reveal', box: expect.objectContaining({ step: 'L1', opened: true }) }); // D5: before the new card
    pa = await walkTo(a!, pa, P[2]!);
    a!.send({ t: 'race', op: 'accept', step: 'T1' });
    answer(a!, 'T1', '42');
    await until((m) => m.t === 'race' && m.view.card.status === 'pending');
    review(host, teams[0]!.id, 'T1', 'approve');
    await until((m) => m.t === 'race' && m.view.card.step === 'L2');
    const l2 = JSON.stringify(Math.round(P[3]!.x * 100) / 100);
    expect(seen.filter((m) => JSON.stringify(m).includes('"L2"') && (m as { t: string }).t !== 'race')).toEqual([]);
    expect(seen.filter((m) => JSON.stringify(m).includes(l2))).toEqual([]);

    // walk-only route (SPEC §6.5): a bike right here cannot be taken
    host.send({ t: 'host.bike', op: 'add', x: pa.x + 1, z: pa.z });
    const bike = (await host.until((m) => m.t === 'bikes' && m.list.length)) as { list: { id: string }[] };
    a!.send({ t: 'bike', op: 'claim', id: bike.list[0]!.id });
    expect(await a!.until((m) => m.t === 'bike')).toMatchObject({ ok: false, reason: 'walkOnly' });

    // pause: ops refused, resume
    host.send({ t: 'host.race', op: 'pause' });
    await view(a!, (v) => v.status === 'paused');
    a!.send({ t: 'race', op: 'open', step: 'L2' });
    await notice(a!, 'racePaused');
    host.send({ t: 'host.race', op: 'resume' });
    await view(a!, (v) => v.status === 'running');

    // the rest of the leg; the route into the Pit Stop zone checks in at once (no penalty)
    pa = await walkTo(a!, pa, P[3]!);
    a!.send({ t: 'race', op: 'open', step: 'L2' });
    await step(a!, 'D1');
    pa = await doD1(a!, host, teams[0]!.id, pa);
    pa = await walkTo(a!, pa, P[6]!);
    const fin = (await view(a!, (v) => v.finishAt !== null)).view;
    // SPEC §17.22: "Về đích thứ 1" at once, the leg's winner texts (fake mini texts), stored in teams.state before the answer
    expect(fin.result).toMatchObject({ rank: 1, total: 2, kind: 'first', npc: expect.stringContaining('Đội 0 về nhất') });
    expect(JSON.parse(((await sqlOf(race).then((q) => q.exec('SELECT state FROM teams WHERE id = ?', teams[0]!.id))) as { state: string }[])[0]!.state)).toMatchObject({ rank: 1, out: false });
    expect(fin.card).toMatchObject({ step: 'PS', status: 'done' });
    const st = (await host.until((m) => m.t === 'host.state' && m.ranking[0]?.finishAt)) as unknown as HostState;
    expect(st.ranking.map((r) => [r.team, r.rank, r.out])).toEqual([[teams[0]!.id, 1, false], [teams[1]!.id, 2, false]]);
    expect(st.progress.filter((r) => r.team === teams[0]!.id).map((r) => r.step)).toEqual(['L1', 'T1', 'L2', 'D1', 'L3', 'PS']);
    expect(st.progress.find((r) => r.team === teams[0]!.id && r.step === 'L1')!.openedAt).toBe(st.teams.find((t) => t.id === teams[0]!.id)!.joinedAt); // D3, on read: its first entry
    // checked in = a spectator (SPEC §8.6): a bike right here cannot be taken
    host.send({ t: 'host.bike', op: 'add', x: pa.x + 1, z: pa.z });
    const near = (await host.until((m) => m.t === 'bikes' && m.list[0]?.x === pa.x + 1)) as { list: { id: string }[] };
    a!.send({ t: 'bike', op: 'claim', id: near.list[0]!.id });
    expect(await a!.until((m) => m.t === 'bike')).toMatchObject({ ok: false, reason: 'finished' });
    // a later welcome: the same result (teams.state)
    const a2 = await joinTeam(server, race, teams[0]!.code);
    expect(W(a2).view!.result).toEqual(fin.result);
    expect(W(a2).boxes.map((x) => [x.step, x.branch ?? '', x.opened])).toEqual([['L1', '', true], ['L2', '', true], ['D1', 'A', true], ['PS', '', false]]);
    const again = (await login(server, race, { code: teams[0]!.code })).body as unknown as { summary: { step: string } };
    expect(again.summary).toEqual({ reconnects: expect.any(Number), lastSeen: expect.any(Number), step: 'Về đích' }); // "Chào mừng trở lại"

    // B goes on to T1 for the restart test; the Host may not load a leg after the start
    await runTo(b, W(b0!).start!);
    host.send({ t: 'host.leg', id: 'mini' });
    expect(await hostSays(host, 'host.legResult')).toMatchObject({ ok: false });
    for (const s of [a2, b, host]) s.close();
  }, 90_000);

  it('"Tại điểm này" only in the team\'s own done / current place; a respawn keeps the bike mode; a team at the mat during a pause checks in on resume', async () => {
    const { host, socks: [a, b] } = await newRace('race-zone', 2);
    host.send({ t: 'host.race', op: 'start' });
    await view(b!, (v) => v.status === 'running');
    // B does L1 and reaches T1's place; A walks there while still on L1 (a later step's place for A)
    let pb = await walkTo(b!, W(b!).start!, P[1]!, 25, 'bike');
    // a rider's 0 m respawn keeps the trusted pose's mode (review m4: it became walk and the box opened on the bike)
    b!.send({ t: 'respawn', x: pb.x, y: 0, z: pb.z, yaw: 0, how: 'safe' });
    b!.send({ t: 'race', op: 'open', step: 'L1' });
    await notice(b!, 'boxRiding');
    await walkTo(b!, pb, pb);
    b!.send({ t: 'race', op: 'open', step: 'L1' });
    await step(b!, 'T1');
    pb = await walkTo(b!, pb, P[2]!);
    expect(await b!.until((m) => m.t === 'zone')).toEqual({ t: 'zone', teams: [] });
    await walkTo(a!, await walkTo(a!, W(a!).start!, { x: P[1]!.x, z: P[1]!.z + 40 }, 30), P[2]!, 30); // around its own L1 place
    expect(await b!.until((m) => m.t === 'zone')).toEqual({ t: 'zone', teams: [{ slot: W(a!).team!.slot, label: 'Lộ trình 1', type: 'route_info', branch: null, since: expect.any(Number) }] });
    expect((await a!.drain(1500)).filter((m) => m.t === 'zone')).toEqual([]);

    await doT1(b!, host, W(b!).team!.id);
    pb = await walkTo(b!, pb, P[3]!);
    b!.send({ t: 'race', op: 'open', step: 'L2' });
    await step(b!, 'D1');
    pb = await doD1(b!, host, W(b!).team!.id, pb);
    host.send({ t: 'host.race', op: 'pause' });
    await view(b!, (v) => v.status === 'paused');
    await walkTo(b!, pb, P[6]!);
    expect((await b!.drain(1500)).filter((m) => m.t === 'race' && m.view.finishAt !== null)).toEqual([]);
    host.send({ t: 'host.race', op: 'resume' });
    expect((await view(b!, (v) => v.finishAt !== null)).view).toMatchObject({ status: 'running', card: { step: 'PS', status: 'done' } });
    for (const s of [a!, b!, host]) s.close();
  }, 60_000);

  it('rows written for a whole leg with one "Phạt" and one branch switch stay ≤ 160 per team (rowsWritten measured)', async () => {
    const race = 'race-rows';
    const { host, teams, socks: [a] } = await newRace(race, 1);
    host.send({ t: 'host.race', op: 'start' });
    const c0 = ((await host.until((m) => m.t === 'host.state' && m.status === 'running')) as unknown as HostState).counters.rows;
    const sql = await sqlOf(race);
    const seq = async () => JSON.parse(((await sql.exec('SELECT data FROM snapshot')) as { data: string }[])[0]?.data ?? '{"seq":0}').seq as number;
    const replays = async () => ((await sql.exec('SELECT COUNT(*) AS n FROM replay')) as { n: number }[])[0]!.n;
    const [s0, r0] = [await seq(), await replays()];
    await runLeg(a!, W(a!).start!, host, teams[0]!.id, { penalize: true, switchToB: true });
    await sleep(NET.slowTickMs + 200);
    const c1 = ((await host.drain(1500)).filter((m) => m.t === 'host.state').at(-1) as HostState).counters.rows;
    const race_rows = c1 - c0 - ((await seq()) - s0) - ((await replays()) - r0);
    expect(race_rows).toBeGreaterThan(20);
    expect(race_rows).toBeLessThanOrEqual(160);
    console.log(`[race-rows] ${race_rows} rows for one team (1 Phạt, 1 switch)`);
    for (const s of [a!, host]) s.close();
  }, 60_000);

  it('D4: a jump after standing still, a long respawn or a reconnect far away opens no box and enters no zone', async () => {
    const race = 'race-trust';
    const { host, teams } = await setupRace(server, race, 5);
    host.send({ t: 'host.leg', id: 'mini' }); // real leg speeds: trust rate = foot × bike × SPRINT × tolerance (22.5 m/s), cap = rate × NET.speedLeadMs; L1 ≈ 1.2 km away
    const mv = bundledLeg('mini')!.movement;
    const CAP = (mv.footSpeed * mv.bikeSpeedMultiplier * SPRINT_MULTIPLIER * NET.speedTolerance * NET.speedLeadMs) / 1000 + 1; // was hard-coded 13 + 1 for the pre-§17.29 / pre-×1.5 speeds
    expect(await hostSays(host, 'host.legResult')).toMatchObject({ ok: true });
    const [a, b, c, d, e] = await Promise.all(teams.map((t) => joinTeam(server, race, t.code)));
    host.send({ t: 'host.race', op: 'start' });
    await view(a!, (v) => v.status === 'running');
    const l1 = stepZones(bundledLeg('mini')!)[0]!;
    // A walks at 4 m/s, stands 3.5 s, then one pose on the L1 box: flagged, the trusted point moves ≤ CAP m
    const sa = W(a!).start!;
    const pa = await walkTo(a!, sa, { x: sa.x + 4, z: sa.z }, 4);
    await sleep(3500);
    await walkTo(a!, pa, l1, 1e6);
    a!.send({ t: 'race', op: 'open', step: 'L1' });
    await notice(a!, 'boxFar');
    // B: a respawn onto the box; C: a short respawn is taken at once
    const sb = W(b!).start!;
    b!.send({ t: 'respawn', x: l1.x, y: 0, z: l1.z, yaw: 0, how: 'safe' });
    b!.send({ t: 'race', op: 'open', step: 'L1' });
    await notice(b!, 'boxFar');
    const sc = W(c!).start!;
    c!.send({ t: 'respawn', x: sc.x + 20, y: 0, z: sc.z, yaw: 0, how: 'stairs' });
    // E: a chain of six 29 m respawns (each ≤ NET.respawnTrust, 174 m in all, unflagged): only the first is taken at once
    const se = W(e!).start!;
    for (let i = 1; i <= 6; i++) e!.send({ t: 'respawn', x: se.x + 29 * i, y: 0, z: se.z, yaw: 0, how: 'safe' });
    // D: a pose at the start, ≈ 1.3 s offline, then back right at the box
    const sd = W(d!).start!;
    await walkTo(d!, sd, sd);
    d!.close();
    await sleep(1300);
    const d2 = await joinTeam(server, race, teams[3]!.code);
    await walkTo(d2, sd, l1, 1e6);
    d2.send({ t: 'race', op: 'open', step: 'L1' });
    await notice(d2, 'boxFar');
    await sleep(300);
    const st = (await host.until((m) => m.t === 'host.state' && m.teams.filter((t: { flagged: boolean }) => t.flagged).length >= 3)) as unknown as HostState;
    expect(st.teams.map((t) => t.flagged)).toEqual([true, true, false, true, false]);
    const sql = await sqlOf(race);
    expect(await sql.exec('SELECT team, step FROM step_progress')).toEqual([]); // nobody arrived anywhere
    // where the server believes they stand: their welcome after a reconnect
    const [a2, b2, c2, e2] = await Promise.all([0, 1, 2, 4].map((i) => joinTeam(server, race, teams[i]!.code)));
    const dist = (p: { x: number; z: number } | null, q: { x: number; z: number }) => Math.hypot(p!.x - q.x, p!.z - q.z);
    expect(dist(W(a2!).pose, pa)).toBeLessThanOrEqual(CAP);
    expect(dist(W(b2!).pose, sb)).toBeLessThanOrEqual(CAP);
    expect(dist(W(c2!).pose, { x: sc.x + 20, z: sc.z })).toBeLessThan(0.1);
    expect(dist(W(e2!).pose, se)).toBeLessThanOrEqual(29 + CAP); // one hop + the trust lead, not 174 m
    for (const s of [a2!, b2!, c2!, e2!, c, e, d2, host]) s!.close();
  }, 60_000);
});

/** B: L1 opened → T1 (for the restart test). */
async function runTo(s: Sock, from: { x: number; z: number }) {
  await walkTo(s, from, P[1]!);
  s.send({ t: 'race', op: 'open', step: 'L1' });
  await step(s, 'T1');
}

describe('race engine restart', () => {
  it('rebuilds the step and the Sổ mật thư from SQLite after an eviction mid-leg', async () => {
    await server.getWorker().evictDurableObject('RaceRoom', { name: flow.race, webSockets: 'close' });
    const b = await joinTeam(server, flow.race, flow.code);
    expect(W(b).view).toMatchObject({ status: 'running', card: { step: 'T1', status: 'teaser' } /* Phase 8 D22: T1 has a teaser */, result: null });
    expect(W(b).boxes.map((x) => [x.step, x.opened])).toEqual([['L1', true]]);
    b.send({ t: 'race', op: 'book' });
    const book = (await b.until((m) => m.t === 'book')) as { cards: { step: string; status: string }[] };
    expect(book.cards.map((c) => [c.step, c.status])).toEqual([['L1', 'done'], ['T1', 'teaser']]);
    // SPEC §17.22: A's finish rank survives the eviction (teams.state)
    const a = await joinTeam(server, flow.race, flow.codeA);
    expect(W(a).view!.result).toMatchObject({ rank: 1, total: 2, kind: 'first' });
    a.close();
    b.close();
  }, 60_000);
});
