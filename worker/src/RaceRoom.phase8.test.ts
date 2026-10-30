// Phase 8 track A end to end through workerd (docs/plans/phase8.md §6 Track A harness tests): answers from anywhere →
// the Host's queue → "Phạt" (lock in SQLite before the team hears) → approval; detour branch boxes (choose, switch,
// A → B → A, the lock ending while the team stands still, an opened box never hidden); the bike of a team approved far
// away; Host-only review; R2 media (Worker + DO gate); the race-op budget; evictions mid-pending / mid-lock. Teams move
// only by walking (5 Hz poses) on the fake `nearLeg` (points 60 m apart, box within 40 m, hidden beyond 50).
import { MEDIA, type ClueCard, type HostState, type RaceView, type Welcome } from '@race/shared/protocol';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { answer, joinTeam, nearLeg, nearPoint, openSocket, raceHarness, review, setupRace, sleep, walkTo } from './test/harness.ts';

const server = raceHarness();
beforeAll(async () => {
  await server.listen();
}, 60_000);
afterAll(() => server.close());

type Sock = Awaited<ReturnType<typeof joinTeam>>;
type Host = Awaited<ReturnType<typeof setupRace>>['host'];
type Pt = { x: number; z: number };
const P = [0, 1, 2, 3, 4, 5, 6].map((k) => nearPoint(k));
const sqlOf = (race: string) => server.getWorker().getDurableObjectStorage('RaceRoom', { name: race });
const rowOf = async (race: string, team: string, step: string) =>
  ((await (await sqlOf(race)).exec('SELECT * FROM step_progress WHERE team = ? AND step = ?', team, step)) as Record<string, unknown>[])[0]!;
const W = (s: Sock) => s.welcome as unknown as Welcome;
const view = (s: Sock, match: (v: RaceView) => boolean) => s.until((m) => m.t === 'race' && match(m.view)) as Promise<{ view: RaceView }>;
const card = async (s: Sock, match: (c: ClueCard) => boolean) => (await view(s, (v) => !!v.card && match(v.card))).view.card!;
const step = (s: Sock, id: string) => card(s, (c) => c.step === id);
const notice = (s: Sock, code: string) => s.until((m) => m.t === 'notice' && m.code === code);
const waitLock = (c: ClueCard) => sleep(c.lockedUntil! - Date.now() + 300);
const cm = (v: number) => Math.round(v * 100) / 100;
const off = (p: Pt, dx: number, dz = 0) => ({ x: p.x + dx, z: p.z + dz });

/** A race on nearLeg (+ `more` over it), `n` teams joined, running. */
async function newRace(race: string, n: number, more: Record<string, unknown> = {}) {
  const r = await setupRace(server, race, n);
  r.host.send({ t: 'host.leg', json: JSON.stringify({ ...nearLeg(), ...more }) });
  expect(await r.host.until((m) => m.t === 'host.legResult')).toMatchObject({ ok: true });
  const socks = await Promise.all(r.teams.map((t) => joinTeam(server, race, t.code)));
  r.host.send({ t: 'host.race', op: 'start' });
  await Promise.all(socks.map((s) => view(s, (v) => v.status === 'running')));
  return { ...r, socks };
}

/** From the team's start: L1 opened → T1 accepted (the team stays at L1's point, 60 m from T1's place). */
async function toT1(s: Sock): Promise<Pt> {
  const p = await walkTo(s, W(s).start!, P[1]!);
  s.send({ t: 'race', op: 'open', step: 'L1' });
  await step(s, 'T1');
  s.send({ t: 'race', op: 'accept', step: 'T1' });
  await card(s, (c) => c.status === 'active');
  return p;
}

/** From L1's point: T1 answered + approved, L2 opened → D1 (standing at L2's point). */
async function toD1(s: Sock, host: Host, team: string, from: Pt): Promise<Pt> {
  answer(s, 'T1', '42');
  await card(s, (c) => c.status === 'pending');
  review(host, team, 'T1', 'approve');
  await step(s, 'L2');
  const p = await walkTo(s, from, P[3]!);
  s.send({ t: 'race', op: 'open', step: 'L2' });
  await step(s, 'D1');
  return p;
}

describe.concurrent('Phase 8 (workerd)', () => {
  it('an answer from afar → the Host queue → "Phạt": the lock is in SQLite when the team hears → answerLocked → again → approved', async () => {
    const race = 'p8-answer';
    const { host, teams, socks: [a] } = await newRace(race, 1);
    const id = teams[0]!.id;
    await toT1(a!); // at L1's point: T1's place is 60 m away
    answer(a!, 'T1', '41');
    expect(await card(a!, (c) => c.status === 'pending')).toMatchObject({ answers: [{ id: 1, text: '41', status: 'pending' }] });
    const st = (await host.until((m) => m.t === 'host.state' && m.queue.length)) as unknown as HostState;
    expect(st.queue).toEqual([{ team: id, step: 'T1', label: 'Thử thách 1', branch: null, id: 1, text: '41', at: expect.any(Number), reference: ['42 (bốn mươi hai) – GIẢ'], note: '', lockMinutes: 0.1 }]);
    answer(a!, 'T1', '42');
    await notice(a!, 'answerPending');
    review(host, id, 'T1', 'penalize', 1, 'GHI CHÚ CHỈ HOST');
    const t0 = Date.now();
    const locked = await card(a!, (c) => c.status === 'locked');
    expect(locked).toMatchObject({ lockKind: 'retry', retryPenaltyMinutes: 0.1, answers: [{ id: 1, status: 'penalized' }] });
    expect(Math.abs(locked.lockedUntil! - (t0 + 6000))).toBeLessThan(1500);
    expect(await rowOf(race, id, 'T1')).toMatchObject({ locked_until: locked.lockedUntil, rejections: 1, host_note: 'GHI CHÚ CHỈ HOST' }); // written before the message
    answer(a!, 'T1', '42');
    await notice(a!, 'answerLocked');
    await waitLock(locked);
    answer(a!, 'T1', '42');
    await card(a!, (c) => c.status === 'pending' && c.answers.length === 2);
    review(host, id, 'T1', 'approve'); // no id: the pending one
    await notice(a!, 'approved');
    expect(await step(a!, 'L2')).toMatchObject({ status: 'active' });
    const row = await rowOf(race, id, 'T1');
    expect(row.approval_wait_seconds as number).toBeGreaterThan(0);
    expect(JSON.parse(row.answers as string).map((x: { s: string }) => x.s)).toEqual(['penalized', 'approved']);
    review(host, id, 'T1', 'approve', 2);
    expect(await host.until((m) => m.t === 'host.notice')).toMatchObject({ level: 'warning', message: 'Bài này đã được xử lý.' });
    // the Host note never went to the team
    expect(JSON.stringify(await a!.drain(300))).not.toContain('GHI CHÚ');
    for (const s of [a!, host]) s.close();
  }, 60_000);

  it('D1 branch boxes: choose → reveal in 40 m; switch → remove + countdown, no B coordinates; A → B → A; still at lock end → welcome; opened never hidden', async () => {
    const race = 'p8-detour';
    const { host, hostToken, teams, socks: [a] } = await newRace(race, 1, { penalties: { retryLockMinutes: 0.1, branchSwitchLockMinutes: 0.1 } });
    const id = teams[0]!.id;
    let p = await toD1(a!, host, id, await toT1(a!));
    const bx = JSON.stringify(cm(P[5]!.x));
    a!.send({ t: 'race', op: 'branch', step: 'D1', branch: 'A' });
    await notice(a!, 'branchChosen');
    expect(await card(a!, (c) => c.status === 'goToBranch')).toMatchObject({ branch: 'A', branches: [{ id: 'A' }, { id: 'B' }] });
    p = await walkTo(a!, p, off(P[4]!, -30));
    expect(await a!.until((m) => m.t === 'box', 3000)).toEqual({ t: 'box', op: 'reveal', box: expect.objectContaining({ step: 'D1', branch: 'A', opened: false, x: cm(P[4]!.x) }) });
    // switch to B, then back to A once its countdown ended (A → B → A, standing 30 m from A, never near B)
    const seen: unknown[] = [];
    const until = (match: (m: any) => boolean, ms?: number): Promise<any> => a!.until((m) => (seen.push(m), match(m)), ms);
    a!.send({ t: 'race', op: 'branch', step: 'D1', branch: 'B' });
    expect(await until((m) => m.t === 'box')).toEqual({ t: 'box', op: 'remove', step: 'D1', branch: 'A' });
    const l1 = (await until((m) => m.t === 'race')).view.card as ClueCard;
    expect(l1).toMatchObject({ status: 'switchLocked', lockKind: 'switch', switches: 1, branch: 'B', switchPenaltyMinutes: 0.1 });
    // R-4: no switch during the switch countdown (the card has no "Đổi" button): silent, nothing written
    a!.send({ t: 'race', op: 'branch', step: 'D1', branch: 'A' });
    const quiet = await a!.drain(600);
    seen.push(...quiet);
    expect(quiet.filter((m) => m.t === 'race' || m.t === 'notice' || m.t === 'box')).toEqual([]);
    expect(await rowOf(race, id, 'D1')).toMatchObject({ branch: 'B', branch_switches: 1 });
    await waitLock(l1);
    a!.send({ t: 'race', op: 'branch', step: 'D1', branch: 'A' });
    const l2 = (await until((m) => m.t === 'race' && m.view.card.switches === 2)).view.card as ClueCard;
    expect(l2).toMatchObject({ status: 'switchLocked', branch: 'A' });
    await waitLock(l2);
    p = await walkTo(a!, p, p); // the client re-sends its pose when the countdown ends (D9)
    expect(await until((m) => m.t === 'box' && m.op === 'reveal', 3000)).toEqual({ t: 'box', op: 'reveal', box: expect.objectContaining({ step: 'D1', branch: 'A' }) }); // S1
    // on A, walk to 30 m from B (through A's place): B's box is not the team's
    p = await walkTo(a!, p, off(P[5]!, -30));
    a!.send({ t: 'race', op: 'branch', step: 'D1', branch: 'B' });
    const l3 = (await until((m) => m.t === 'race' && m.view.card.switches === 3)).view.card as ClueCard;
    await sleep(l3.lockedUntil! - Date.now() - 500);
    seen.push(...(await a!.drain(0)));
    expect(seen.filter((m) => JSON.stringify(m).includes(bx))).toEqual([]); // no B coordinates while locked
    // the lock ends while the team is offline (it could send nothing): its next welcome has B's box, 30 m away (M3)
    a!.close();
    await waitLock(l3);
    const a2 = await joinTeam(server, race, teams[0]!.code);
    expect(W(a2).boxes.filter((b) => b.step === 'D1')).toEqual([expect.objectContaining({ branch: 'B', opened: false, x: cm(P[5]!.x) })]);
    expect(W(a2).view!.card).toMatchObject({ status: 'goToBranch', branch: 'B', switches: 3 });
    p = await walkTo(a2, p, P[5]!);
    a2.send({ t: 'race', op: 'open', step: 'D1', branch: 'B' });
    expect(await a2.until((m) => m.t === 'box')).toEqual({ t: 'box', op: 'reveal', box: expect.objectContaining({ step: 'D1', branch: 'B', opened: true }) });
    const c = await card(a2, (x) => !!x.branchOpened);
    expect(c.branches!.map((b) => [b.id, b.task?.input])).toEqual([['A', undefined], ['B', 'proof']]);
    // an opened box is never hidden by distance (S2): 200 m away and back
    p = await walkTo(a2, await walkTo(a2, p, off(P[5]!, 200), 30), P[5]!, 30);
    expect((await a2.drain(2500)).filter((m) => m.t === 'box')).toEqual([]);
    // the photo task: "Tôi đã gửi bài" → pending → approved → L3
    answer(a2, 'D1', '');
    await card(a2, (x) => x.status === 'pending');
    const h2 = await openSocket(server, race, hostToken); // the first Host socket was silent > NET.deadSocketMs: closed
    review(h2, id, 'D1', 'approve');
    await step(a2, 'L3');
    expect(await rowOf(race, id, 'D1')).toMatchObject({ branch: 'B', branch_switches: 3, completed_at: expect.any(Number) });
    for (const s of [a2, host, h2]) s.close();
  }, 120_000);

  it('S3 (SPEC §17.32 / §17.34): approved while riding 300 m away, the walk-only L2 leaves the bike where the team stands, free; host.review from a team socket closes it (4400)', async () => {
    const race = 'p8-bike';
    const { host, teams, socks: [a] } = await newRace(race, 1);
    const id = teams[0]!.id;
    let p = await toT1(a!);
    host.send({ t: 'host.bike', op: 'add', x: p.x + 1, z: p.z });
    const bike = ((await host.until((m) => m.t === 'bikes' && m.list.length)) as { list: { id: string }[] }).list[0]!;
    a!.send({ t: 'bike', op: 'claim', id: bike.id });
    expect(await a!.until((m) => m.t === 'bike')).toMatchObject({ ok: true });
    const far = off(p, 0, -300); // north, away from T1's place
    p = await walkTo(a!, p, far, 25, 'bike');
    answer(a!, 'T1', '42');
    await card(a!, (c) => c.status === 'pending');
    review(host, id, 'T1', 'approve');
    await step(a!, 'L2'); // a walk-only route received = off the bike wherever the team is (§17.32): racked at the team's trusted pose, 300 m from T1's place
    const st = (await host.until((m) => m.t === 'host.state' && m.teams[0].step === 2)) as unknown as HostState;
    expect(st.bikes.find((b) => b.id === bike.id)).toMatchObject({ owner: null, rider: false, parked: true, x: expect.closeTo(far.x, 0), z: expect.closeTo(far.z, 0) });
    a!.send({ t: 'host.review', team: id, step: 'L2', op: 'note', note: 'x' });
    expect(await a!.until(() => false, 3000)).toEqual({ closed: 4400 });
    host.close();
  }, 60_000);

  it('media: PUT / HEAD Host only (400 / 411 / 413 / 415), GET by a team only for a clue it has opened, 401 for a bad token', async () => {
    const race = 'p8-media';
    const { host, hostToken, socks: [a] } = await newRace(race, 1);
    // over real HTTP (Node fetch): server.fetch streams bodies without a Content-Length
    const base = (await server.listen()).url;
    const http = (n: string, init: object = {}) => fetch(new URL(`/api/race/${race}/media/${n}`, base), init as RequestInit);
    const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
    const get = (t: string, n: string) => http(n, { headers: auth(t) });
    const put = (t: string, n: string, body: unknown, type = 'image/jpeg', more: object = {}) => http(n, { method: 'PUT', headers: { ...auth(t), 'Content-Type': type }, body, ...more });
    const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
    expect((await get(a!.token, 'test-gia.jpg')).status).toBe(404); // the team may, nothing uploaded yet
    expect((await put(a!.token, 'test-gia.jpg', jpg)).status).toBe(403);
    expect((await put(hostToken, 'x.gif', jpg)).status).toBe(400);
    expect((await put(hostToken, 'test-gia.jpg', jpg, 'text/plain')).status).toBe(415);
    expect((await put(hostToken, 'test-gia.jpg', new Uint8Array(MEDIA.maxBytes + 1))).status).toBe(413);
    const stream = new ReadableStream({ start: (c) => (c.enqueue(jpg), c.close()) });
    expect((await put(hostToken, 'test-gia.jpg', stream, 'image/jpeg', { duplex: 'half' })).status).toBe(411);
    for (const n of ['test-gia.jpg', 'test-gia-2.jpg']) expect(await (await put(hostToken, n, jpg)).json()).toEqual({ ok: true, size: jpg.length });
    expect((await http('test-gia.jpg', { method: 'HEAD', headers: auth(hostToken) })).status).toBe(200);
    expect((await http('nope.jpg', { method: 'HEAD', headers: auth(hostToken) })).status).toBe(404);
    const ok = await get(a!.token, 'test-gia.jpg'); // L1's clue: the team holds it from the start
    expect([ok.status, ok.headers.get('Content-Type'), ok.headers.get('Cache-Control')]).toEqual([200, 'image/jpeg', 'private, no-cache']);
    expect(new Uint8Array(await ok.arrayBuffer())).toEqual(jpg);
    // R-9: revalidated every time — unchanged → 304; the Host re-uploads the same name → the new bytes
    const etag = ok.headers.get('ETag')!;
    const cond = (t: string) => http('test-gia.jpg', { headers: { ...auth(t), 'If-None-Match': etag } });
    const same = await cond(a!.token);
    expect([same.status, same.headers.get('ETag'), (await same.arrayBuffer()).byteLength]).toEqual([304, etag, 0]);
    const jpg2 = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 9, 9]);
    await put(hostToken, 'test-gia.jpg', jpg2);
    const fresh = await cond(a!.token);
    expect(fresh.status).toBe(200);
    expect(new Uint8Array(await fresh.arrayBuffer())).toEqual(jpg2);
    expect((await cond(a!.token.slice(0, -2) + 'xx')).status).toBe(401); // the gate runs before the 304
    // R-11: a broken %-escape in the path is a 400, not a 500
    expect((await http('%E0.jpg', { headers: auth(a!.token) })).status).toBe(400);
    expect((await fetch(new URL(`/api/race/%E0/media/test-gia.jpg`, base), { headers: auth(a!.token) })).status).toBe(400);
    expect((await fetch(new URL(`/api/race/%E0/ws`, base))).status).toBe(400);
    expect((await get(a!.token, 'test-gia-2.jpg')).status).toBe(404); // T1's task: a later step
    expect((await get(hostToken, 'test-gia-2.jpg')).status).toBe(200);
    expect((await get('forged.token', 'test-gia.jpg')).status).toBe(401);
    expect((await http('test-gia.jpg')).status).toBe(401);
    await toT1(a!); // L1 opened, T1 accepted: its task's image now
    expect((await get(a!.token, 'test-gia-2.jpg')).status).toBe(200);
    for (const s of [a!, host]) s.close();
  }, 60_000);

  it('D20: past NET.maxRaceOps answers a minute the socket closes (rows ≤ the budget); 40 mat check-ins a minute do not', async () => {
    const race = 'p8-budget';
    const leg = nearLeg();
    const t1 = leg.steps[1] as { teaser: string; task: { verification: string } };
    Object.assign(t1, { teaser: '' });
    t1.task.verification = 'auto'; // every wrong answer writes a row
    const { host, teams, socks: [a, b] } = await newRace(race, 2, { steps: leg.steps });
    await walkTo(a!, W(a!).start!, P[1]!);
    a!.send({ t: 'race', op: 'open', step: 'L1' }); // not a counted race op (review R-7)
    await step(a!, 'T1');
    for (let i = 0; i < 40; i++) {
      b!.send({ t: 'race', op: 'checkin' });
      await sleep(80);
    }
    for (let i = 0; i < 31; i++) {
      answer(a!, 'T1', `sai ${i}`);
      await sleep(80);
    }
    expect(await a!.until((m) => m.closed !== undefined, 3000)).toEqual({ closed: 4429 });
    const row = await rowOf(race, teams[0]!.id, 'T1');
    expect(row.wrong_answers).toBe(30); // answers 1…30 written, the 31st closed the socket
    b!.send({ t: 'race', op: 'book' });
    expect(await b!.until((m) => m.t === 'book')).toMatchObject({ cards: [{ step: 'L1' }] });
    for (const s of [b!, host]) s.close();
  }, 60_000);

  it('R-7: F pressed 70 times a minute at a box (race not open yet, paused, out of reach) keeps the socket and writes no row', async () => {
    const race = 'p8-open-spam';
    const { host, teams } = await setupRace(server, race, 1);
    host.send({ t: 'host.leg', json: JSON.stringify(nearLeg()) });
    await host.until((m) => m.t === 'host.legResult');
    const a = await joinTeam(server, race, teams[0]!.code);
    const id = teams[0]!.id;
    await walkTo(a, W(a).start!, W(a).start!); // a trusted pose 60 m from L1's box
    const rows = async () => (await (await sqlOf(race)).exec('SELECT (SELECT COUNT(*) FROM events WHERE team = ?) AS e, (SELECT COUNT(*) FROM step_progress WHERE team = ?) AS p', id, id))[0];
    const before = await rows();
    const spam = async (n: number, code: string) => {
      for (let i = 0; i < n; i++) {
        a.send({ t: 'race', op: 'open', step: 'L1' });
        await sleep(80);
      }
      const got = await a.drain(300);
      expect(got.filter((m) => m.closed !== undefined)).toEqual([]);
      expect(got.filter((m) => m.t === 'notice').map((m) => m.code)).toEqual(Array(n).fill(code));
    };
    await spam(25, 'raceNotOpen');
    host.send({ t: 'host.race', op: 'start' });
    await view(a, (v) => v.status === 'running');
    await spam(25, 'boxFar');
    host.send({ t: 'host.race', op: 'pause' });
    await view(a, (v) => v.status === 'paused');
    await spam(20, 'racePaused');
    expect(await rows()).toEqual(before);
    host.send({ t: 'host.race', op: 'resume' });
    await walkTo(a, W(a).start!, P[1]!);
    a.send({ t: 'race', op: 'open', step: 'L1' });
    await step(a, 'T1'); // the socket still works
    for (const s of [a, host]) s.close();
  }, 60_000);
});

describe('Phase 8 after an eviction (D25)', () => {
  it('mid-pending: the Host still sees the queue and approves, the team gets its next clue on reconnect; mid-lock: lockedUntil kept', async () => {
    const race = 'p8-evict';
    const { host, hostToken, teams, socks: [a, b] } = await newRace(race, 2, { penalties: { retryLockMinutes: 2, branchSwitchLockMinutes: 2 } });
    await Promise.all([toT1(a!), toT1(b!)]);
    answer(a!, 'T1', '42');
    answer(b!, 'T1', '41');
    await Promise.all([a!, b!].map((s) => card(s, (c) => c.status === 'pending')));
    review(host, teams[1]!.id, 'T1', 'penalize');
    const locked = await card(b!, (c) => c.status === 'locked');
    await server.getWorker().evictDurableObject('RaceRoom', { name: race, webSockets: 'close' });
    const h2 = await openSocket(server, race, hostToken);
    const st = (await h2.until((m) => m.t === 'host.state')) as unknown as HostState;
    expect(st.queue.map((q) => [q.team, q.text])).toEqual([[teams[0]!.id, '42']]);
    review(h2, teams[0]!.id, 'T1', 'approve', st.queue[0]!.id);
    await h2.until((m) => m.t === 'host.state' && m.teams[0].step === 2);
    const [a2, b2] = await Promise.all([0, 1].map((i) => joinTeam(server, race, teams[i]!.code)));
    expect(W(a2!).view!.card).toMatchObject({ step: 'L2', status: 'active' });
    expect(W(b2!).view!.card).toMatchObject({ step: 'T1', status: 'locked', lockedUntil: locked.lockedUntil, lockKind: 'retry' });
    for (const s of [a2!, b2!, h2, host]) s.close();
  }, 90_000);
});

describe('Leg 3 rooms (workerd)', () => {
  it('race room: progress in teams.state before the team hears, kept across an eviction (welcome.view carries it); skip → L3 + finish-line penalty', async () => {
    const race = 'l3-room';
    const steps = nearLeg().steps as any[];
    steps[3].branches[1].task.room = { kind: 'comic', total: 9, penaltyMinutesEach: 12 }; // B = the photo task (host_approval)
    const { host, teams, socks: [a] } = await newRace(race, 1, { steps });
    const id = teams[0]!.id;
    let p = await toD1(a!, host, id, await toT1(a!));
    a!.send({ t: 'race', op: 'branch', step: 'D1', branch: 'B' });
    await notice(a!, 'branchChosen');
    p = await walkTo(a!, p, P[5]!);
    a!.send({ t: 'race', op: 'room', step: 'D1', branch: 'B', done: 1, skipped: false }); // box not opened yet
    await notice(a!, 'roomIgnored');
    a!.send({ t: 'race', op: 'open', step: 'D1', branch: 'B' });
    await card(a!, (c) => !!c.branchOpened);
    a!.send({ t: 'race', op: 'room', step: 'D1', branch: 'B', done: 4, skipped: false });
    const c = await card(a!, (x) => x.branches?.[1]?.task?.room?.done === 4);
    expect(c.branches![1]!.task!.room).toEqual({ kind: 'comic', total: 9, penaltyMinutesEach: 12, done: 4, skipped: false });
    const stateOf = async () => JSON.parse((((await (await sqlOf(race)).exec('SELECT state FROM teams WHERE id = ?', id)) as Record<string, unknown>[])[0]!.state as string));
    expect((await stateOf()).rooms).toEqual({ D1: { b: 'B', done: 4, skipped: false } });
    await server.getWorker().evictDurableObject('RaceRoom', { name: race, webSockets: 'close' });
    const a2 = await joinTeam(server, race, teams[0]!.code);
    expect(W(a2).view!.card!.branches![1]!.task!.room).toMatchObject({ done: 4, skipped: false });
    a2.send({ t: 'race', op: 'room', step: 'D1', branch: 'B', done: 4, skipped: true });
    await step(a2, 'L3');
    expect((await stateOf()).finishPenalty).toEqual({ minutes: 60, reason: 'bỏ thử thách ở lựa chọn kép', by: 'room' });
    for (const s of [a2, host]) s.close();
  }, 90_000);
});

// Leg 3 (protocol v11): after "Đổi lựa chọn kép" the card names the room the team is still standing in (leftRoom) until it walks
// out through the exit ring; a team's view never carries another team's room progress (cardOf is per team: welcome.teams has no
// progress at all).
describe('Leg 3 leftRoom (workerd)', () => {
  it('switchLocked card → leftRoom = the opened branch\'s room kind; the other team sees no progress', async () => {
    const race = 'l3-leftroom';
    const steps = nearLeg().steps as any[];
    steps[3].branches[1].task.room = { kind: 'comic', total: 9, penaltyMinutesEach: 12 };
    const { host, teams, socks: [a, b] } = await newRace(race, 2, { steps });
    const id = teams[0]!.id;
    let p = await toD1(a!, host, id, await toT1(a!));
    a!.send({ t: 'race', op: 'branch', step: 'D1', branch: 'B' });
    await notice(a!, 'branchChosen');
    p = await walkTo(a!, p, P[5]!);
    a!.send({ t: 'race', op: 'open', step: 'D1', branch: 'B' });
    await card(a!, (c) => !!c.branchOpened);
    a!.send({ t: 'race', op: 'room', step: 'D1', branch: 'B', done: 3, skipped: false });
    await card(a!, (c) => c.branches?.[1]?.task?.room?.done === 3);
    const b2 = await joinTeam(server, race, teams[1]!.code);
    expect(JSON.stringify(W(b2).teams)).not.toMatch(/done|skipped|total/);
    expect(JSON.stringify(W(b2).view)).not.toMatch(/"room"/);
    a!.send({ t: 'race', op: 'branch', step: 'D1', branch: 'A' });
    const sw = await card(a!, (c) => c.status === 'switchLocked');
    expect(sw.leftRoom).toBe('comic');
    expect(sw.branchOpened).toBe(false);
    for (const s of [a!, b!, b2, host]) s.close();
  }, 60_000);
});

// Leg 3 (protocol v12): a challenge step with `room: 'garderobe'` → its card carries `room` over the wire (teaser, active, locked),
// gone once the step is done; the welcome view after a reconnect carries it too (the client re-enters the museum room).
describe('Leg 3 ClueCard.room (workerd)', () => {
  it('T1 with room → card.room = garderobe through welcome / race views; absent on the next card', async () => {
    const race = 'l3-garderobe';
    const steps = nearLeg().steps as any[];
    steps[1].room = 'garderobe';
    steps[1].task.location = null; // the room stands under L1's box: no place of its own (check.ts)
    const { host, teams, socks: [a] } = await newRace(race, 1, { steps });
    await walkTo(a!, W(a!).start!, P[1]!);
    a!.send({ t: 'race', op: 'open', step: 'L1' });
    expect((await step(a!, 'T1')).room).toBe('garderobe');
    a!.send({ t: 'race', op: 'accept', step: 'T1' });
    expect((await card(a!, (c) => c.status === 'active')).room).toBe('garderobe');
    const a2 = await joinTeam(server, race, teams[0]!.code); // a reload inside: the welcome view enters again
    expect(W(a2).view?.card).toMatchObject({ step: 'T1', room: 'garderobe' });
    answer(a2, 'T1', '42');
    await card(a2, (c) => c.status === 'pending');
    review(host, teams[0]!.id, 'T1', 'approve');
    const next = await step(a2, 'L2');
    expect(next.room).toBeUndefined();
    for (const s of [a!, a2, host]) s.close();
  }, 60_000);
});

describe('Leg 3 auto-graded parts (workerd)', () => {
  it('2/4 → locked + "đúng 2/4" in SQLite before the team hears; kept across an eviction (welcome + the Host queue); ack clears it', async () => {
    const race = 'l3-auto';
    const steps = nearLeg().steps as any[];
    Object.assign(steps[1].task, { answers: [], parts: [['Cuba', 'Cu-ba'], ['Singapore'], ['Uzbekistan'], ['Estonia']].map((answers, k) => ({ label: `Bộ ${k + 1}`, answers })), retryLockMinutes: 2 });
    const { host, hostToken, teams, socks: [a] } = await newRace(race, 1, { steps });
    const id = teams[0]!.id;
    await toT1(a!);
    a!.send({ t: 'race', op: 'answer', step: 'T1', text: '', parts: ['cu ba', 'Singapore', 'x', 'y'] });
    expect(await notice(a!, 'autoPenalized')).toMatchObject({ score: 2, of: 4 });
    const locked = await card(a!, (c) => c.status === 'locked');
    expect(locked.answers).toEqual([expect.objectContaining({ status: 'penalized', score: 2, of: 4 })]);
    const row = await rowOf(race, id, 'T1');
    expect(row).toMatchObject({ locked_until: locked.lockedUntil, rejections: 1, decided_by: 'auto' });
    expect(JSON.parse(row.answers as string)[0]).toMatchObject({ auto: true, m: [true, true, false, false], sc: 2 });
    await server.getWorker().evictDurableObject('RaceRoom', { name: race, webSockets: 'close' });
    const h2 = await openSocket(server, race, hostToken);
    const st = (await h2.until((m) => m.t === 'host.state')) as unknown as HostState;
    expect(st.queue).toEqual([expect.objectContaining({ team: id, step: 'T1', id: 1, auto: { verdict: 'penalized', marks: [true, true, false, false], score: 2, of: 4, canApprove: true } })]);
    const a2 = await joinTeam(server, race, teams[0]!.code);
    expect(W(a2).view!.card).toMatchObject({ step: 'T1', status: 'locked', lockedUntil: locked.lockedUntil, answers: [{ score: 2, of: 4 }] });
    review(h2, id, 'T1', 'ack' as any, 1);
    await h2.until((m) => m.t === 'host.state' && m.queue.length === 0);
    for (const s of [a2, h2, host]) s.close();
  }, 90_000);
});
