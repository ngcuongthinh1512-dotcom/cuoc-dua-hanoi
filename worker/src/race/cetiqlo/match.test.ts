import { CATALOG } from '@race/shared/cetiqlo';
import { describe, expect, it } from 'vitest';
import { CETIQLO } from './config.ts';
import { FIXTURE } from './fixture.ts';
import { checkout, drop, finish, finished, join, leave, makeSet, markGone, newRoom, pairNext, rank, score, settle, SLOTS, startNext, take, type Match, type TeamScore } from './match.ts';

const byId = new Map(FIXTURE.map((i) => [i.id, i]));
const slotOf = (id: string) => byId.get(id)?.slot;
const ZONE = { x: -4.5, z: 7.5, radius: 2.1 };
const at = (id: string) => ({ x: byId.get(id)!.shelf.x, z: byId.get(id)!.shelf.z });

function running(teams = ['A', 'B'], now = 1000): Match {
  const room = startNext({ ...newRoom(), queue: teams }, now, 7, FIXTURE)!;
  return { ...room.match!, teams, bags: Object.fromEntries(teams.map((t) => [t, []])) }; // (N teams whatever teamsPerMatch is)
}
/** a bag with `ok` right items, then `wrong` items (the same slot, other colour) and `extra` decoys */
const SET = makeSet(1, FIXTURE);
const wrongOf = (id: string) => FIXTURE.find((i) => i.slot === slotOf(id) && i.id !== id)!.id;
const decoys = FIXTURE.filter((i) => !i.slot).map((i) => i.id);

describe('makeSet', () => {
  it('one item per slot kind, in SLOTS order; same seed → same set; the seed varies the set', () => {
    expect(SET.map(slotOf)).toEqual([...SLOTS]);
    expect(makeSet(1, FIXTURE)).toEqual(SET);
    const all = new Set(Array.from({ length: 40 }, (_, s) => makeSet(s, FIXTURE).join()));
    expect(all.size).toBeGreaterThan(5);
  });
  it('never draws a dress / underwear (no slot), throws on a catalog without a slot kind', () => {
    for (let s = 0; s < 50; s++) for (const id of makeSet(s, FIXTURE)) expect(slotOf(id)).toBeDefined();
    expect(() => makeSet(1, FIXTURE.filter((i) => i.slot !== 'bag'))).toThrow(/bag/);
  });
});

describe('makeSet on the real catalog', () => {
  it('every seed gives 6 ids of the catalog, one per slot kind (slot of item i = SLOTS[i])', () => {
    const slot = new Map(CATALOG.map((i) => [i.id, i.slot]));
    for (let s = 0; s < 200; s++) expect(makeSet(s, CATALOG).map((id) => slot.get(id))).toEqual([...SLOTS]);
  });
});

describe('queue / pairing', () => {
  it('FIFO: the first two teams meet; the rest wait in order', () => {
    expect(pairNext(['A', 'B', 'C'], {}, 2)).toEqual(['A', 'B']);
    expect(pairNext(['A'], {}, 2)).toBeNull();
  });
  it('no immediate rematch while somebody else waits; a rematch when nobody else does', () => {
    expect(pairNext(['L', 'W', 'C'], { L: ['W'], W: ['L'] }, 2)).toEqual(['L', 'C']);
    expect(pairNext(['L', 'W'], { L: ['W'], W: ['L'] }, 2)).toEqual(['L', 'W']);
  });
  it('ineligible (offline) teams are skipped but keep their place', () => {
    expect(pairNext(['A', 'B', 'C'], {}, 2, (t) => t !== 'A')).toEqual(['B', 'C']);
    expect(pairNext(['A', 'B'], {}, 2, (t) => t !== 'A')).toBeNull();
  });
  it('N-generic: 3 teams per match', () => {
    expect(pairNext(['A', 'B', 'C', 'D'], { A: ['B'] }, 3)).toEqual(['A', 'C', 'D']);
    expect(pairNext(['A', 'B'], {}, 3)).toBeNull();
  });
  it('join is idempotent and never queues a team that is playing; leave removes', () => {
    let r = join(join(newRoom(), 'A'), 'A');
    expect(r.queue).toEqual(['A']);
    r = startNext(join(r, 'B'), 0, 1, FIXTURE)!;
    expect(r.queue).toEqual([]);
    expect(join(r, 'A')).toBe(r);
    expect(leave(join(r, 'C'), 'C').queue).toEqual([]);
  });
  it('startNext: one match at a time, waits for the result hold, stores seed + set + endsAt', () => {
    const r0 = join(join(join(newRoom(), 'A'), 'B'), 'C');
    const r1 = startNext(r0, 5000, 42, FIXTURE)!;
    expect(r1.match).toMatchObject({ id: 'm1', teams: ['A', 'B'], seed: 42, startAt: 5000, endsAt: 5000 + CETIQLO.pickMs, state: 'running' });
    expect(r1.match!.set).toEqual(makeSet(42, FIXTURE));
    expect(r1.queue).toEqual(['C']);
    expect(startNext(join(r1, 'D'), 6000, 1, FIXTURE)).toBeNull(); // one at a time
    const done = finish(r1, r1.match!, settle(r1.match!, slotOf), 9000);
    expect(startNext(done, 9000 + CETIQLO.resultHoldMs - 1, 1, FIXTURE, () => true)).toBeNull(); // result screen
    expect(startNext(done, 9000 + CETIQLO.resultHoldMs, 1, FIXTURE)!.match!.id).toBe('m2');
  });
});

describe('take / drop / checkout validation', () => {
  const m = running();
  const id = SET[0]!;
  it('take: ok within range, bag grows, other bag untouched', () => {
    const r = take(m, 'A', id, at(id), byId, 2000);
    expect(r.ok && r.match.bags).toEqual({ A: [id], B: [] });
  });
  it('take: refusals (unknown, far, dup, full, not a player, before start, after end, locked)', () => {
    expect(take(m, 'A', 'nope', { x: 0, z: 0 }, byId, 2000)).toEqual({ ok: false, why: 'unknown' });
    expect(take(m, 'A', id, { x: at(id).x + CETIQLO.takeRange + CETIQLO.takeSlackM + 0.1, z: at(id).z }, byId, 2000)).toEqual({ ok: false, why: 'far' });
    expect(take(m, 'A', id, { x: at(id).x + CETIQLO.takeRange + CETIQLO.takeSlackM - 0.1, z: at(id).z }, byId, 2000).ok).toBe(true);
    const once = take(m, 'A', id, at(id), byId, 2000);
    expect(once.ok && take(once.match, 'A', id, at(id), byId, 2001)).toEqual({ ok: false, why: 'dup' });
    expect(take(m, 'Z', id, at(id), byId, 2000)).toEqual({ ok: false, why: 'notRunning' });
    expect(take(m, 'A', id, at(id), byId, m.startAt - 1)).toEqual({ ok: false, why: 'notRunning' });
    expect(take(m, 'A', id, at(id), byId, m.endsAt)).toEqual({ ok: false, why: 'notRunning' });
    const locked = checkout(m, 'A', ZONE, ZONE, 2000);
    expect(locked.ok && take(locked.match, 'A', id, at(id), byId, 2001)).toEqual({ ok: false, why: 'locked' });
    expect(take({ ...m, state: 'done' }, 'A', id, at(id), byId, 2000)).toEqual({ ok: false, why: 'notRunning' });
    expect(take(markGone(m, 'A'), 'A', id, at(id), byId, 2000)).toEqual({ ok: false, why: 'notRunning' });
  });
  it('bag cap 24', () => {
    const big = FIXTURE.map((i) => i.id);
    const full = { ...m, bags: { A: Array.from({ length: CETIQLO.bagMax }, (_, i) => `x${i}`), B: [] } };
    expect(take(full, 'A', big[0]!, at(big[0]!), byId, 2000)).toEqual({ ok: false, why: 'full' });
    expect(drop(full, 'A', 'x3', 2000).ok).toBe(true);
  });
  it('drop: only what is in the bag; not once locked', () => {
    const t = take(m, 'A', id, at(id), byId, 2000);
    if (!t.ok) throw new Error();
    const d = drop(t.match, 'A', id, 2001);
    expect(d.ok && d.match.bags.A).toEqual([]);
    expect(drop(m, 'A', id, 2001)).toEqual({ ok: false, why: 'notInBag' });
    const l = checkout(t.match, 'A', ZONE, ZONE, 2002);
    expect(l.ok && drop(l.match, 'A', id, 2003)).toEqual({ ok: false, why: 'locked' });
  });
  it('checkout: inside the zone (+ slack) only, records the ms, once', () => {
    expect(checkout(m, 'A', { x: 0, z: 20 }, ZONE, 2000)).toEqual({ ok: false, why: 'far' });
    const c = checkout(m, 'A', { x: ZONE.x + ZONE.radius + CETIQLO.checkoutSlackM - 0.1, z: ZONE.z }, ZONE, 123_456);
    expect(c.ok && c.match.locked).toEqual({ A: 123_456 });
    expect(c.ok && checkout(c.match, 'A', ZONE, ZONE, 123_457)).toEqual({ ok: false, why: 'locked' });
    expect(checkout(m, 'A', ZONE, ZONE, m.endsAt)).toEqual({ ok: false, why: 'notRunning' });
  });
  it('finished: time up, or every team locked / gone', () => {
    expect(finished(m, 2000)).toBe(false);
    expect(finished(m, m.endsAt)).toBe(true);
    const a = checkout(m, 'A', ZONE, ZONE, 2000);
    if (!a.ok) throw new Error();
    expect(finished(a.match, 2001)).toBe(false);
    expect(finished(markGone(a.match, 'B'), 2001)).toBe(true);
    const b = checkout(a.match, 'B', ZONE, ZONE, 2002);
    expect(b.ok && finished(b.match, 2003)).toBe(true);
  });
});

describe('score', () => {
  it('+16.67 points per correct item, −9 per wrong or extra one (0–100, 1 decimal): the table', () => {
    const right = (n: number) => SET.slice(0, n);
    const pct = (bag: string[]) => score(SET, bag, slotOf).score;
    expect(pct(SET)).toBe(100);
    expect(pct(right(5))).toBe(83.3); // missing items just earn nothing
    expect(pct(right(4))).toBe(66.7);
    expect(pct(right(3))).toBe(50);
    expect(pct(right(2))).toBe(33.3);
    expect(pct(right(1))).toBe(16.7);
    expect(pct([])).toBe(0); // an empty bag is 0, not negative
    expect(pct([...SET, decoys[0]!])).toBe(91); // 6 correct + 1 extra: 100 − 9
    expect(pct([...SET, ...decoys.slice(0, 6)])).toBe(46);
    expect(pct([SET[0]!, ...[1, 2, 3, 4, 5].map((i) => wrongOf(SET[i]!))])).toBe(0); // 16.7 − 45 → clamped
  });
  it('errors = bag size − correct: 5 correct + 1 wrong = 74.3, + an extra = 65.3, 4 correct + 2 wrong = 48.7', () => {
    const bag = [...SET.slice(0, 5), wrongOf(SET[5]!)];
    expect(score(SET, bag, slotOf)).toMatchObject({ correct: 5, errors: 1, score: 74.3 });
    expect(score(SET, [...SET.slice(0, 5), wrongOf(SET[5]!), decoys[0]!], slotOf)).toMatchObject({ correct: 5, errors: 2, score: 65.3 });
    expect(score(SET, [...SET.slice(0, 4), wrongOf(SET[4]!), wrongOf(SET[5]!)], slotOf)).toMatchObject({ correct: 4, errors: 2, score: 48.7 });
  });
  it('marks: ok / wrong / missing per set position, then extras', () => {
    const bag = [SET[0]!, wrongOf(SET[1]!), decoys[0]!, wrongOf(SET[1]!) === decoys[0] ? 'x' : SET[3]!];
    expect(score(SET, bag, slotOf).marks).toEqual(['ok', 'wrong', 'missing', 'ok', 'missing', 'missing', 'extra']);
  });
  it('a second wrong pick of an already-wrong slot is an extra', () => {
    const others = FIXTURE.filter((i) => i.slot === slotOf(SET[0]!) && i.id !== SET[0]);
    const bag = [others[0]!.id, others[1]!.id];
    expect(score(SET, bag, slotOf).marks).toEqual(['wrong', 'missing', 'missing', 'missing', 'missing', 'missing', 'extra']);
  });
});

describe('rank (plan §0), every branch', () => {
  const t = (team: string, score: number, lockedAtMs: number | null): TeamScore => ({ team, score, lockedAtMs, bag: [], correct: 0, errors: 0, marks: [] });
  const order = (s: TeamScore[]) => rank(s).groups.map((g) => g.map((x) => x.team));
  it('(1) completed beats not completed, whatever the score', () => {
    const r = rank([t('A', 100, null), t('B', 15, 5000)]);
    expect(r.groups.map((g) => g[0]!.team)).toEqual(['B', 'A']);
    expect(r.reason).toBe('completion');
  });
  it('(2) both completed: the higher score wins; equal score → the earlier checkout; equal ms → draw', () => {
    expect(rank([t('A', 66, 1000), t('B', 83, 9000)])).toMatchObject({ reason: 'score' });
    expect(order([t('A', 66, 1000), t('B', 83, 9000)])).toEqual([['B'], ['A']]);
    expect(order([t('A', 83, 9000), t('B', 83, 4000)])).toEqual([['B'], ['A']]);
    expect(rank([t('A', 83, 9000), t('B', 83, 4000)]).reason).toBe('speed');
    expect(order([t('A', 83, 9000), t('B', 83, 9000)])).toEqual([['A', 'B']]);
    expect(rank([t('A', 83, 9000), t('B', 83, 9000)]).reason).toBe('draw');
  });
  it('(3) neither completed: the higher score wins; tie = draw (the lock time of nobody counts)', () => {
    expect(order([t('A', 49, null), t('B', 66, null)])).toEqual([['B'], ['A']]);
    expect(rank([t('A', 49, null), t('B', 66, null)]).reason).toBe('score');
    expect(order([t('A', 49, null), t('B', 49, null)])).toEqual([['A', 'B']]);
    expect(rank([t('A', 49, null), t('B', 49, null)]).reason).toBe('draw');
    expect(order([t('A', 0, null), t('B', 0, null)])).toEqual([['A', 'B']]);
  });
  it('N = 3: groups in order, ties grouped, the reason is best vs second', () => {
    expect(order([t('A', 100, 9000), t('B', 100, 4000), t('C', 100, null)])).toEqual([['B'], ['A'], ['C']]);
    expect(order([t('A', 50, null), t('B', 50, null), t('C', 20, 1)])).toEqual([['C'], ['A', 'B']]);
    expect(order([t('A', 80, 5), t('B', 80, 5), t('C', 20, 1)])).toEqual([['A', 'B'], ['C']]);
    expect(rank([t('A', 80, 5), t('B', 80, 5), t('C', 20, 1)]).reason).toBe('draw');
    expect(rank([t('A', 70, 5), t('B', 50, 5), t('C', 50, 7)]).reason).toBe('score');
  });
});

describe('settle + queue after the match (plan §1.4)', () => {
  const play = (bags: Record<string, string[]>, locks: Record<string, number>, teams = ['A', 'B'], queue: string[] = []) => {
    const m: Match = { ...running(teams), bags, locked: locks };
    const room = { ...newRoom(), queue, match: m, seq: 1 };
    const s = settle(m, slotOf);
    return { s, room: finish(room, m, s, 50_000) };
  };
  it('winner leaves; the loser goes to the FRONT of the others waiting; no rematch while someone waits', () => {
    const m = running();
    const { s, room } = play({ A: m.set, B: m.set.slice(0, 3) }, { A: 1 }, ['A', 'B'], ['C', 'D']);
    expect(s).toMatchObject({ winners: ['A'], losers: ['B'], draw: [], reason: 'completion' });
    expect(room.queue).toEqual(['B', 'C', 'D']);
    expect(room.holdUntil).toBe(50_000 + CETIQLO.resultHoldMs);
    expect(room.match!.state).toBe('done');
    expect(room.lobbyDue).toBe(true); // the queue is told its place when the hold ends
    const next = startNext(room, room.holdUntil, 1, FIXTURE)!;
    expect(next.match!.teams).toEqual(['B', 'C']);
  });
  it('double draw: both go to the BACK', () => {
    const { s, room } = play({ A: [], B: [] }, {}, ['A', 'B'], ['C', 'D']);
    expect(s).toMatchObject({ winners: [], draw: ['A', 'B'], losers: [] });
    expect(room.queue).toEqual(['C', 'D', 'A', 'B']);
  });
  it('draw with nobody waiting: they rematch after the hold', () => {
    const { room } = play({ A: [], B: [] }, {});
    expect(startNext(room, room.holdUntil, 1, FIXTURE)!.match!.teams).toEqual(['A', 'B']);
  });
  it('a gone team never returns to the queue; a lone loser waits', () => {
    const m = running();
    const gone = markGone({ ...m, bags: { A: m.set, B: [] }, locked: { A: 1 } }, 'B');
    const s = settle(gone, slotOf);
    const room = finish({ ...newRoom(), match: gone }, gone, s, 0);
    expect(room.queue).toEqual([]);
  });
  it('N = 3: winner out, losers best first at the front, tie for first = draw to the back', () => {
    const m = running(['A', 'B', 'C']);
    const half = m.set.slice(0, 3);
    const a = play({ A: m.set, B: half, C: [] }, { A: 1 }, ['A', 'B', 'C'], ['D']);
    expect(a.room.queue).toEqual(['B', 'C', 'D']);
    const b = play({ A: m.set, B: m.set, C: [] }, { A: 1, B: 1 }, ['A', 'B', 'C'], ['D']);
    expect(b.s).toMatchObject({ draw: ['A', 'B'], losers: ['C'] });
    expect(b.room.queue).toEqual(['C', 'D', 'A', 'B']);
  });
});
