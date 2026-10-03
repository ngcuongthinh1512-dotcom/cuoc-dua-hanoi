// Phase 8B track A end to end through workerd (docs/plans/phase8b.md §I): the louvre room on the fake `nearLouvreLeg`
// (L-LV box 60 m east of the start = the room, hints 3 s / 6 s after it opened, a wrong lock = 6 s, the Pit Stop 60 m
// further). Picks write no row (memory + the snapshot row), a lock writes before anyone hears, the feed reaches every
// socket, nothing of a team's room reaches another team, evictions keep picks / countdowns / the feed.
import type { ClueCard, FeedMessage, HostState, RaceView, Welcome } from '@race/shared/protocol';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import louvre from '../legs/test/louvre.json';
import { answer, joinTeam, lock, nearLouvreLeg, nearPoint, openSocket, pick, raceHarness, review, setupRace, sleep, viewAgain, walkTo } from './test/harness.ts';

const server = raceHarness();
beforeAll(async () => {
  await server.listen();
}, 60_000);
afterAll(() => server.close());

type Sock = Awaited<ReturnType<typeof joinTeam>>;
type Pt = { x: number; z: number };
const P1 = nearPoint(1); // L-LV box = the room
const P2 = nearPoint(2); // L3 / PS mat
const sqlOf = (race: string) => server.getWorker().getDurableObjectStorage('RaceRoom', { name: race });
const rowOf = async (race: string, team: string, step: string) =>
  ((await (await sqlOf(race)).exec('SELECT * FROM step_progress WHERE team = ? AND step = ?', team, step)) as Record<string, unknown>[])[0]!;
const W = (s: Sock) => s.welcome as unknown as Welcome;
const view = (s: Sock, match: (v: RaceView) => boolean) => s.until((m) => m.t === 'race' && match(m.view)) as Promise<{ view: RaceView }>;
const card = async (s: Sock, match: (c: ClueCard) => boolean) => (await view(s, (v) => !!v.card && match(v.card))).view.card!;
const room = (s: Sock, match: (l: NonNullable<NonNullable<ClueCard['task']>['louvre']>) => boolean) => card(s, (c) => !!c.task?.louvre && match(c.task.louvre));
const notice = (s: Sock, code: string) => s.until((m) => m.t === 'notice' && m.code === code);
const feed = (s: { until: Sock['until'] }) => s.until((m) => m.t === 'feed') as Promise<FeedMessage>;
const waitUntil = (at: number) => sleep(Math.max(0, at - Date.now() + 300));
const T3 = louvre.steps[1]!.task!;
const RIGHT = T3.answers;
const WRONG = T3.louvre!.artworks.map((a) => a.id).filter((id) => !RIGHT.includes(id));
/** Host-only / after-the-finish strings of the leg (notes, credits). */
const SECRETS = T3.louvre!.artworks.flatMap((a) => [a.note, (a as { credit?: { title: string } }).credit?.title].filter((x): x is string => !!x));
const [r0, r1, r2, r3, r4] = RIGHT as [string, string, string, string, string];
const [w0, w1, w2, w3] = WRONG as [string, string, string, string];

/** Picks spaced under maxMessagesPerSec; resolves with the card that shows them all. */
async function picks(s: Sock, ids: string[], on = true) {
  for (const id of ids) {
    pick(s, 'T3', id, on);
    await sleep(80);
  }
}

/** A race on nearLouvreLeg (+ `more`), `n` teams joined, running. */
async function newRace(race: string, n: number, more: Record<string, unknown> = {}) {
  const r = await setupRace(server, race, n);
  r.host.send({ t: 'host.leg', json: JSON.stringify({ ...nearLouvreLeg(), ...more }) });
  expect(await r.host.until((m) => m.t === 'host.legResult')).toMatchObject({ ok: true });
  const socks = await Promise.all(r.teams.map((t) => joinTeam(server, race, t.code)));
  r.host.send({ t: 'host.race', op: 'start' });
  await Promise.all(socks.map((s) => view(s, (v) => v.status === 'running')));
  return { ...r, socks };
}

/** From the team's start to the L-LV box, opened: the T3 card (the room). */
async function toRoom(s: Sock): Promise<ClueCard> {
  await walkTo(s, W(s).start!, P1);
  s.send({ t: 'race', op: 'open', step: 'L-LV' });
  return card(s, (c) => c.step === 'T3');
}

describe.concurrent('Phase 8B louvre room (workerd)', () => {
  it('two teams: picks 0 rows + own card only, ≤ 5 from 40, wrong lock written first + public feed, live x/5 from 70, right 5, credits after the finish', async () => {
    const race = 'p8b-room';
    const { host, teams, socks: [a, b] } = await newRace(race, 2);
    const ida = teams[0]!.id;
    const slot = teams[0]!.slot;
    const t3 = await toRoom(a!);
    const lv = t3.task!.louvre!;
    expect(t3.task).toMatchObject({ kind: 'louvre', input: 'room' });
    expect(lv).toMatchObject({ picks: [], attempts: 0, hintCount: null, hintCorrect: null, maxPicks: null });
    const json = JSON.stringify(t3);
    for (const s of SECRETS) expect(json).not.toContain(s);
    expect(json).not.toContain(JSON.stringify(RIGHT));
    // before 40: no limit; 6 lit, 0 rows (the row still has '[]')
    await picks(a!, [w0, w1, w2, r0, r1, r2]);
    expect((await room(a!, (l) => l.picks.length === 6)).task!.louvre!.maxPicks).toBeNull();
    expect(await rowOf(race, ida, 'T3')).toMatchObject({ picks: '[]', answers: '[]' });
    // same state again → silent; a typed answer with a right id (guard C1) → silent, nothing written
    pick(a!, 'T3', r0);
    answer(a!, 'T3', r3);
    expect((await a!.drain(400)).filter((m) => m.t === 'race' || m.t === 'notice')).toEqual([]);
    expect(await rowOf(race, ida, 'T3')).toMatchObject({ answers: '[]', completed_at: null });
    // from 40: at most 5 lit
    await waitUntil(lv.hintAt[0]);
    viewAgain(a!);
    expect((await room(a!, (l) => l.maxPicks === 5)).task!.louvre).toMatchObject({ hintCount: 5, hintCorrect: null, picks: [w0, w1, w2, r0, r1, r2] });
    pick(a!, 'T3', w3);
    await notice(a!, 'pickLimit');
    await picks(a!, [w0, w1], false);
    await room(a!, (l) => l.picks.length === 4);
    pick(a!, 'T3', r3);
    await room(a!, (l) => l.picks.length === 5);
    pick(a!, 'T3', w1);
    await notice(a!, 'pickLimit');
    // a wrong lock before 70: locked_until + picks in SQLite when the team hears; the feed to every socket, no n
    lock(a!, 'T3');
    await notice(a!, 'lockWrong');
    const locked = await card(a!, (c) => c.status === 'locked');
    expect(locked.task!.louvre).toMatchObject({ attempts: 1, picks: [w2, r0, r1, r2, r3] });
    expect(locked.answers).toEqual([{ id: 1, text: '5 tác phẩm', at: expect.any(Number), status: 'wrong' }]);
    expect(await rowOf(race, ida, 'T3')).toMatchObject({ locked_until: locked.lockedUntil, rejections: 1, picks: JSON.stringify([w2, r0, r1, r2, r3]) });
    for (const s of [b!, host]) expect(await feed(s)).toEqual({ t: 'feed', at: expect.any(Number), slot, ok: false, minutes: 0.1 });
    // locked: picks still work, the lock does not
    pick(a!, 'T3', w2, false);
    await room(a!, (l) => l.picks.length === 4);
    lock(a!, 'T3');
    await notice(a!, 'answerLocked');
    // past the countdown (and the 70-minute mark): x/5 live on the card only, follows the picks
    await waitUntil(Math.max(locked.lockedUntil!, lv.hintAt[1]));
    viewAgain(a!);
    expect((await card(a!, (c) => c.status === 'active')).task!.louvre!.hintCorrect).toBe(4);
    pick(a!, 'T3', r3, false);
    await room(a!, (l) => l.hintCorrect === 3);
    pick(a!, 'T3', w2);
    await room(a!, (l) => l.picks.length === 4 && l.hintCorrect === 3);
    // a wrong lock past 70: public with n
    lock(a!, 'T3');
    const second = await card(a!, (c) => c.status === 'locked' && c.answers.length === 2);
    expect(second.answers[1]).toMatchObject({ status: 'wrong', correct: 3 });
    expect(second.answers[0]).not.toHaveProperty('correct');
    for (const s of [b!, host]) expect(await feed(s)).toEqual({ t: 'feed', at: expect.any(Number), slot, ok: false, minutes: 0.1, n: 3, of: 5 });
    await waitUntil(second.lockedUntil!);
    // a lock out of the room → boxFar (the room = the box's zone)
    let at: Pt = await walkTo(a!, P1, { x: P1.x - 45, z: P1.z });
    lock(a!, 'T3');
    await notice(a!, 'boxFar');
    at = await walkTo(a!, at, P1);
    // the right 5 (any order): clueNew, L3, the public "đúng 5/5"
    pick(a!, 'T3', w2, false);
    await sleep(80);
    await picks(a!, [r4, r3]);
    await room(a!, (l) => l.hintCorrect === 5 && l.picks.length === 5);
    lock(a!, 'T3');
    await notice(a!, 'clueNew');
    expect(await card(a!, (c) => c.step === 'L3')).toMatchObject({ status: 'active' });
    for (const s of [b!, host]) expect(await feed(s)).toEqual({ t: 'feed', at: expect.any(Number), slot, ok: true, n: 5, of: 5 });
    // team B never got anything of A's room (only the public lines); its own card is still L-LV
    viewAgain(b!);
    const bv = await view(b!, () => true);
    expect(bv.view.card).toMatchObject({ step: 'L-LV' });
    expect(JSON.stringify(await b!.drain(200)) + JSON.stringify(bv)).not.toMatch(/"picks"|hintCorrect|attempts/);
    // credits: locked before the finish; A at the mat → finished → 6 lines; B still locked; the Host's finish opens them
    a!.send({ t: 'race', op: 'credits' });
    await notice(a!, 'creditsLocked');
    await walkTo(a!, at, P2);
    await view(a!, (v) => v.finishAt !== null);
    a!.send({ t: 'race', op: 'credits' });
    const cr = (await a!.until((m) => m.t === 'credits')) as unknown as { items: { file: string }[] };
    expect(cr.items.map((i) => i.file)).toEqual(['art-02.webp', 'art-06.webp', 'art-09.webp', 'art-14.webp', 'art-18.webp', 'art-20.webp']);
    expect(JSON.stringify(cr)).not.toMatch(/GIẢ\) Tác phẩm|"answers"|art-17"/);
    b!.send({ t: 'race', op: 'credits' });
    await notice(b!, 'creditsLocked');
    host.send({ t: 'host.race', op: 'finish' });
    await view(b!, (v) => v.status === 'finished');
    b!.send({ t: 'race', op: 'credits' });
    expect(await b!.until((m) => m.t === 'credits')).toMatchObject({ items: expect.arrayContaining([expect.objectContaining({ file: 'art-02.webp' })]) });
    for (const s of [a!, b!, host]) s.close();
  }, 120_000);

  it('quota: one team, 3 wrong locks + the right one, picks between: ≤ 20 rows for the whole step (16 + snapshots)', async () => {
    const race = 'p8b-quota';
    const { host, teams, socks: [a] } = await newRace(race, 1);
    const id = teams[0]!.id;
    await toRoom(a!);
    await sleep(2500); // the walk's last snapshot is written
    const rows = async (match: (st: HostState) => boolean) => ((await host.until((m) => m.t === 'host.state' && match(m))) as unknown as HostState).counters.rows;
    const mine = (st: HostState) => st.progress.find((p) => p.team === id && p.step === 'T3');
    await picks(a!, [w0, r0, r1]);
    const before = await rows((st) => mine(st)?.picks.length === 3);
    for (let k = 0; k < 3; k++) {
      lock(a!, 'T3');
      const c = await card(a!, (x) => x.status === 'locked' && x.answers.length === k + 1);
      if (k === 1) await picks(a!, [r2]); // a change during the countdown
      await waitUntil(c.lockedUntil!);
    }
    await picks(a!, [w0], false);
    await picks(a!, [r3, r4]);
    await room(a!, (l) => l.picks.length === 5 && l.hintCorrect === 5);
    lock(a!, 'T3');
    await card(a!, (c) => c.step === 'L3');
    const after = await rows((st) => st.teams.find((t) => t.id === id)?.step === 2);
    console.log(`louvre step rows: ${after - before}`);
    expect(after - before).toBeLessThanOrEqual(20);
    expect(after - before).toBeGreaterThanOrEqual(16);
    for (const s of [a!, host]) s.close();
  }, 90_000);

  it('Host "Cho qua" (hostView louvre exit = host.review approve, no id): a stuck team gets the next card; a penalty without id stays refused', async () => {
    const race = 'p8b-exit';
    const { host, teams, socks: [a] } = await newRace(race, 1);
    const id = teams[0]!.id;
    await toRoom(a!);
    review(host, id, 'T3', 'penalize'); // no id: refused, nothing written
    review(host, id, 'T3', 'approve'); // the exact message of the "Cho qua" button (client/src/host/hostView.ts reviewMessage)
    expect((await card(a!, (c) => c.step !== 'T3')).step).toBe('L3');
    expect(await rowOf(race, id, 'T3')).toMatchObject({ completed_at: expect.any(Number) });
  });
  it('lobby / paused: pick / lock refused, 0 rows, view answers; 31 locks a minute → 4429', async () => {
    const race = 'p8b-ops';
    const { host, teams } = await setupRace(server, race, 1);
    host.send({ t: 'host.leg', json: JSON.stringify(nearLouvreLeg()) });
    await host.until((m) => m.t === 'host.legResult');
    const a = await joinTeam(server, race, teams[0]!.code);
    pick(a, 'T3', r0);
    await notice(a, 'raceNotOpen');
    lock(a, 'T3');
    await notice(a, 'raceNotOpen');
    host.send({ t: 'host.race', op: 'start' });
    await view(a, (v) => v.status === 'running');
    await toRoom(a);
    host.send({ t: 'host.race', op: 'pause' });
    await view(a, (v) => v.status === 'paused');
    const count = async () => (await (await sqlOf(race)).exec("SELECT (SELECT COUNT(*) FROM events WHERE type NOT IN ('host.race', 'disconnect', 'connect')) AS e, (SELECT picks || answers FROM step_progress WHERE step = 'T3') AS p"))[0];
    const before = await count();
    pick(a, 'T3', r0);
    await notice(a, 'racePaused');
    lock(a, 'T3');
    await notice(a, 'racePaused');
    viewAgain(a);
    expect((await view(a, (v) => v.status === 'paused')).view.card).toMatchObject({ step: 'T3', task: { louvre: { picks: [] } } });
    expect(await count()).toEqual(before);
    host.send({ t: 'host.race', op: 'resume' });
    await view(a, (v) => v.status === 'running');
    for (let i = 0; i < 31; i++) {
      lock(a, 'T3'); // nothing lit: silent, but counted (maxRaceOps)
      await sleep(80);
    }
    expect(await a.until((m) => m.closed !== undefined, 3000)).toEqual({ closed: 4429 });
    expect(await count()).toEqual(before);
    host.close();
  }, 90_000);
});

describe('Phase 8B after an eviction', () => {
  it('mid-countdown: picks (snapshot newer than the lock), lockedUntil, attempts, feed kept; x/5 recomputed; a second device', async () => {
    const race = 'p8b-evict';
    const { host, hostToken, teams, socks: [a] } = await newRace(race, 1, { penalties: { retryLockMinutes: 0.5 } });
    const t3 = await toRoom(a!);
    await picks(a!, [w0, r0]);
    await room(a!, (l) => l.picks.length === 2);
    lock(a!, 'T3');
    const locked = await card(a!, (c) => c.status === 'locked');
    const line = await feed(host);
    pick(a!, 'T3', r1); // after the lock: only in memory + the snapshot row
    await room(a!, (l) => l.picks.length === 3);
    await sleep(2600);
    await server.getWorker().evictDurableObject('RaceRoom', { name: race, webSockets: 'close' });
    const a2 = await joinTeam(server, race, teams[0]!.code);
    expect(W(a2).view!.card).toMatchObject({ step: 'T3', status: 'locked', lockedUntil: locked.lockedUntil, task: { louvre: { picks: [w0, r0, r1], attempts: 1 } } });
    expect(W(a2).feed).toEqual([line]);
    expect(line).not.toHaveProperty('n');
    // past 70 (6 s after the box): x/5 from the restored picks
    await waitUntil(t3.task!.louvre!.hintAt[1]);
    viewAgain(a2);
    expect((await room(a2, (l) => l.hintCorrect !== null)).task!.louvre!.hintCorrect).toBe(2);
    // a second device of the team: the older one is kicked, the new one gets the same room
    const a3 = await joinTeam(server, race, teams[0]!.code);
    expect(await a2.until((m) => m.t === 'kick')).toMatchObject({ reason: 'otherDevice' });
    expect(W(a3).view!.card!.task!.louvre!.picks).toEqual([w0, r0, r1]);
    const h2 = await openSocket(server, race, hostToken);
    expect(((await h2.until((m) => m.t === 'host.state')) as unknown as HostState).progress.find((p) => p.step === 'T3')).toMatchObject({ picks: [w0, r0, r1], hintCorrect: 2, rejections: 1 });
    for (const s of [a3, h2, host]) s.close();
  }, 90_000);

  it('a lock newer than the last snapshot wins (verify-foundation #2); the feed comes back in time order without the early n', async () => {
    const race = 'p8b-evict-lock';
    const { host, teams, socks: [a] } = await newRace(race, 1);
    const t3 = await toRoom(a!);
    await picks(a!, [w0]);
    lock(a!, 'T3'); // before 70: line 1 without n
    const c1 = await card(a!, (c) => c.status === 'locked');
    await waitUntil(Math.max(c1.lockedUntil!, t3.task!.louvre!.hintAt[1]));
    await picks(a!, [r0]);
    await room(a!, (l) => l.picks.length === 2);
    await sleep(2600); // snapshot: [w0, r0]
    await picks(a!, [r1]);
    lock(a!, 'T3'); // row: [w0, r0, r1], newer than the snapshot; evicted before the next one
    await notice(a!, 'lockWrong');
    await server.getWorker().evictDurableObject('RaceRoom', { name: race, webSockets: 'close' });
    const a2 = await joinTeam(server, race, teams[0]!.code);
    expect(W(a2).view!.card!.task!.louvre).toMatchObject({ picks: [w0, r0, r1], attempts: 2, hintCorrect: 2 });
    const fl = W(a2).feed;
    expect(fl.map((m) => [m.ok, m.n])).toEqual([[false, undefined], [false, 2]]);
    expect(fl[0]!.at).toBeLessThan(fl[1]!.at);
    for (const s of [a2, host]) s.close();
  }, 90_000);

  it('F1 #1: the first lock after a hibernation wake is kept once in the feed (not read back from events AND pushed)', async () => {
    const race = 'p8b-hib-feed';
    const { host, teams, socks: [a] } = await newRace(race, 1);
    await toRoom(a!);
    await picks(a!, [w0]);
    lock(a!, 'T3');
    const c1 = await card(a!, (c) => c.status === 'locked');
    await feed(host);
    await waitUntil(c1.lockedUntil!);
    await server.getWorker().evictDurableObject('RaceRoom', { name: race, webSockets: 'hibernate' });
    lock(a!, 'T3'); // wakes the object: feedV is null when the engine feeds the new line
    await feed(host);
    const a2 = await joinTeam(server, race, teams[0]!.code);
    expect(W(a2).feed).toHaveLength(2);
    for (const s of [a2, host]) s.close();
  }, 90_000);
});
