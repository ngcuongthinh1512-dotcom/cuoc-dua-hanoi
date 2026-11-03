import type { CqServerMessage } from '@race/shared/protocol';
import { describe, expect, it } from 'vitest';
import { CETIQLO, CHECKOUT_ZONE, START_SPOTS } from './config.ts';
import { FIXTURE } from './fixture.ts';
import { Cetiqlo, type CqIO } from './index.ts';

const byId = new Map(FIXTURE.map((i) => [i.id, i]));
const near = (id: string) => ({ x: byId.get(id)!.shelf.x, z: byId.get(id)!.shelf.z });
const STEP = 'T1';
const NO_COUNTDOWN = { ...CETIQLO, countdownMs: 0 };

function rig(teams = ['A', 'B', 'C', 'D']) {
  const sent: { team: string; m: CqServerMessage }[] = [];
  const wins: string[] = [];
  const released: string[] = [];
  const undone = new Set<string>();
  const events: { type: string; data: object }[] = [];
  const alarms: number[] = [];
  const onlineSet = new Set(teams);
  let saved: string | undefined;
  let writes = 0;
  const io: CqIO = {
    load: () => saved,
    save: (j) => ((saved = j), writes++),
    send: (team, m) => void sent.push({ team, m }),
    online: (t) => onlineSet.has(t),
    who: (t) => ({ slot: teams.indexOf(t), name: `Đội ${t}` }),
    stepOf: (t) => (wins.includes(t) || (released.includes(t) && !undone.has(t)) ? null : STEP),
    win: (t) => void wins.push(t),
    release: (t) => void released.push(t),
    setAlarm: (at) => void alarms.push(at),
    event: (_t, _team, type, data) => void events.push({ type, data }),
  };
  const make = () => new Cetiqlo(io, () => FIXTURE, NO_COUNTDOWN, () => 99); // the timing tests act right after the pairing; the countdown has its own test
  return { cq: make(), remake: make, sent, wins, released, undone, events, alarms, onlineSet, writes: () => writes, io, of: (t: string) => sent.filter((s) => s.team === t).map((s) => s.m) };
}
const last = <T extends CqServerMessage['t']>(r: ReturnType<typeof rig>, team: string, t: T) => [...r.of(team)].reverse().find((m) => m.t === t) as Extract<CqServerMessage, { t: T }> | undefined;

function startMatch(r = rig(), now = 1000) {
  r.cq.join('A', now);
  r.cq.join('B', now + 1);
  const st = last(r, 'A', 'cq.state')!;
  return { r, set: st.match!.set, st, now: now + 1 };
}
const fill = (r: ReturnType<typeof rig>, team: string, ids: string[], t0: number) => ids.forEach((id, i) => r.cq.take(team, id, near(id).x, near(id).z, t0 + i * 200));

describe('Cetiqlo service', () => {
  it('queue: a lone team waits at place 1/1; the second makes a match; the third waits', () => {
    const r = rig();
    r.cq.join('A', 1000);
    expect(last(r, 'A', 'cq.state')).toMatchObject({ phase: 'lobby', queuePos: 1, queueLen: 1 });
    r.cq.join('B', 1001);
    const a = last(r, 'A', 'cq.state')!;
    expect(a).toMatchObject({ phase: 'match', match: { opp: { slot: 1, name: 'Đội B' }, yourBag: [], yourLocked: false, oppLocked: false, startAt: 1001, endsAt: 1001 + CETIQLO.pickMs, serverNow: 1001 }, startSpot: { x: expect.any(Number) } });
    expect(a.match!.set).toHaveLength(6);
    expect(last(r, 'B', 'cq.state')!.match!.set).toEqual(a.match!.set); // both see the same set
    r.cq.join('C', 1002);
    expect(last(r, 'C', 'cq.state')).toMatchObject({ phase: 'lobby', queuePos: 1, queueLen: 1 });
    expect(r.events.find((e) => e.type === 'cq.start')!.data).toMatchObject({ seed: 99, teams: ['A', 'B'] });
  });

  it('refuses cq.join off the step; a full room is busy', () => {
    const r = rig();
    r.wins.push('A'); // stepOf(A) = null
    r.cq.join('A', 1000);
    expect(r.of('A')).toEqual([{ t: 'cq.no', op: 'join', why: 'notInRoom' }]);
  });

  it('take / drop answer only the owner (cq.bag), refusals come as cq.no, rate limit swallows bursts', () => {
    const { r, set, now } = startMatch();
    const before = r.of('B').length;
    r.cq.take('A', set[0]!, near(set[0]!).x, near(set[0]!).z, now + 500);
    expect(last(r, 'A', 'cq.bag')).toEqual({ t: 'cq.bag', bag: [set[0]] });
    expect(r.of('B').length).toBe(before); // nothing to the opponent
    r.cq.take('A', set[1]!, 999, 999, now + 1000);
    expect(r.of('A').at(-1)).toEqual({ t: 'cq.no', op: 'take', why: 'far' });
    const n = r.of('A').length;
    r.cq.take('A', set[2]!, near(set[2]!).x, near(set[2]!).z, now + 1000 + 10); // inside the cooldown
    expect(r.of('A').length).toBe(n);
    r.cq.drop('A', set[0]!, now + 2000);
    expect(last(r, 'A', 'cq.bag')!.bag).toEqual([]);
  });

  it('state is persisted before the ack and rebuilt after a restart (hibernation)', () => {
    const { r, set, now } = startMatch();
    fill(r, 'A', set.slice(0, 2), now + 500);
    const c = r.remake();
    c.online('A', now + 3000);
    const st = last(r, 'A', 'cq.state')!;
    expect(st.match!.yourBag).toEqual(set.slice(0, 2));
    expect(st.match!.id).toBe('m1');
  });

  it('PRIVACY: the opponent bag appears in no message before the result', () => {
    const { r, set, now } = startMatch();
    const secret = FIXTURE.filter((i) => !i.slot).map((i) => i.id); // B takes decoys no message of A may mention
    fill(r, 'B', secret.slice(0, 3), now + 500);
    fill(r, 'B', set.slice(0, 2), now + 1500);
    r.cq.checkout('B', CHECKOUT_ZONE.x, CHECKOUT_ZONE.z, now + 2500);
    const toA = JSON.stringify(r.of('A'));
    for (const id of [...secret.slice(0, 3)]) expect(toA).not.toContain(id);
    expect(last(r, 'A', 'cq.opp')).toEqual({ t: 'cq.opp', locked: true });
    // no lock time, no bag count in what A heard
    expect(toA).not.toContain(String(now + 2500));
    expect(r.of('A').some((m) => m.t === 'cq.result')).toBe(false);
  });

  it('checkout of both → cq.result to both at the same server time, winner advances, loser waits at the front', () => {
    const { r, set, now } = startMatch();
    r.cq.join('C', now + 10);
    fill(r, 'A', set, now + 100);
    fill(r, 'B', set.slice(0, 4), now + 100);
    r.cq.checkout('B', CHECKOUT_ZONE.x, CHECKOUT_ZONE.z, now + 5000);
    expect(r.of('A').some((m) => m.t === 'cq.result')).toBe(false);
    expect(last(r, 'B', 'cq.state')!.match).toMatchObject({ yourLocked: true });
    r.cq.checkout('A', CHECKOUT_ZONE.x, CHECKOUT_ZONE.z, now + 6000);
    const ra = last(r, 'A', 'cq.result')!, rb = last(r, 'B', 'cq.result')!;
    expect(ra).toMatchObject({ winner: 'you', reason: 'score', you: { score: 100, correct: 6, errors: 0, lockedAtMs: now + 6000 }, opp: { score: 66.7, correct: 4, errors: 0 } });
    expect(rb).toMatchObject({ winner: 'opp', you: { score: 66.7, lockedAtMs: now + 5000 }, opp: { bag: set } });
    expect(ra.serverNow).toBe(rb.serverNow);
    expect(ra.opp.marks).toEqual(['ok', 'ok', 'ok', 'ok', 'missing', 'missing']);
    expect(r.wins).toEqual(['A']);
    expect(r.of('A').some((m) => m.t === 'cq.advance')).toBe(true);
    expect(r.of('B').some((m) => m.t === 'cq.advance')).toBe(false);
    expect(last(r, 'B', 'cq.state')).toMatchObject({ phase: 'result', queuePos: 1, queueLen: 2 });
    // next pairing waits for the hold; B (front) then meets C
    r.cq.tick(now + 6000 + CETIQLO.resultHoldMs - 1);
    expect(last(r, 'C', 'cq.state')!.phase).toBe('lobby');
    r.alarms.length = 0;
    r.cq.tick(now + 6000 + CETIQLO.resultHoldMs);
    expect(last(r, 'B', 'cq.state')).toMatchObject({ phase: 'match', match: { opp: { name: 'Đội C' } } });
  });

  it('time up (alarm tick): the result is settled from the bags as they stand; a checked-out team beats an unfinished one', () => {
    const { r, set, now } = startMatch();
    fill(r, 'A', set, now + 100);
    fill(r, 'B', set, now + 100);
    r.cq.checkout('B', CHECKOUT_ZONE.x, CHECKOUT_ZONE.z, now + 9000);
    r.cq.tick(now + CETIQLO.pickMs - 1);
    expect(r.of('A').some((m) => m.t === 'cq.result')).toBe(false);
    expect(Math.max(...r.alarms)).toBe(now + CETIQLO.pickMs); // the alarm is armed at endsAt
    r.cq.tick(now + CETIQLO.pickMs);
    expect(last(r, 'A', 'cq.result')).toMatchObject({ winner: 'opp', reason: 'completion', you: { score: 100, lockedAtMs: null } });
    expect(r.wins).toEqual(['B']);
    // a late checkout is refused, even before the tick (take ticks first)
  });

  it('a late action settles the match first and is refused', () => {
    const { r, set, now } = startMatch();
    r.cq.take('A', set[0]!, near(set[0]!).x, near(set[0]!).z, now + CETIQLO.pickMs + 5);
    expect(last(r, 'A', 'cq.result')).toBeDefined();
    expect(r.of('A').at(-1)).toMatchObject({ t: 'cq.no', op: 'take', why: 'notRunning' });
  });

  it('double draw (both empty at time-up): both to the back of the queue, nobody advances', () => {
    const { r, now } = startMatch();
    r.cq.join('C', now + 1);
    r.cq.tick(now + CETIQLO.pickMs);
    expect(last(r, 'A', 'cq.result')).toMatchObject({ winner: 'draw', reason: 'draw' });
    expect(last(r, 'C', 'cq.state')).toMatchObject({ queuePos: 1, queueLen: 3 });
    expect(last(r, 'A', 'cq.state')).toMatchObject({ queuePos: 2 });
    expect(r.wins).toEqual([]);
  });

  it('offline (no 20 s rule): the match runs to endsAt; the offline team is ranked by its bag and gets its result + lobby state when back', () => {
    const { r, set, now } = startMatch();
    fill(r, 'A', set, now + 100);
    fill(r, 'B', set.slice(0, 2), now + 100);
    r.onlineSet.delete('B');
    r.cq.offline('B', now + 2000);
    r.cq.checkout('A', CHECKOUT_ZONE.x, CHECKOUT_ZONE.z, now + 3000);
    expect(r.of('A').some((m) => m.t === 'cq.result')).toBe(false); // B may still come back and check out
    r.cq.tick(now + 60_000);
    expect(r.of('A').some((m) => m.t === 'cq.result')).toBe(false); // nobody wins because the other is offline
    r.cq.tick(now + CETIQLO.pickMs + 1); // time up: the normal rules
    expect(last(r, 'A', 'cq.result')).toMatchObject({ winner: 'you', reason: 'completion' });
    expect(r.wins).toEqual(['A']);
    r.onlineSet.add('B');
    r.cq.online('B', now + CETIQLO.pickMs + 5000); // back during the hold: the result again, then the lobby state with its loser clock
    expect(last(r, 'B', 'cq.result')).toMatchObject({ winner: 'opp', you: { correct: 2 } });
    expect(last(r, 'B', 'cq.state')).toMatchObject({ phase: 'result', queuePos: 1, waitUntil: now + CETIQLO.pickMs + 1 + CETIQLO.maxWaitMs });
  });

  it('reconnect inside a match (F5) gets the match back: same id, bag, lock; the clock goes on', () => {
    const { r, set, now } = startMatch();
    fill(r, 'B', set.slice(0, 1), now + 100);
    r.cq.checkout('B', CHECKOUT_ZONE.x, CHECKOUT_ZONE.z, now + 2000);
    r.onlineSet.delete('B');
    r.cq.offline('B', now + 2500);
    r.onlineSet.add('B');
    r.cq.online('B', now + 50_000);
    expect(last(r, 'B', 'cq.state')).toMatchObject({ phase: 'match', match: { id: 'm1', yourBag: [set[0]], yourLocked: true, endsAt: now + CETIQLO.pickMs }, startSpot: START_SPOTS[1] });
    expect(r.of('A').some((m) => m.t === 'cq.result')).toBe(false);
  });

  it('an offline queued team keeps its place: skipped for the pairing while away, paired as soon as it is back, never dropped', () => {
    const r = rig();
    r.cq.join('A', 1000);
    r.onlineSet.delete('A');
    r.cq.offline('A', 1100);
    r.cq.join('B', 1200);
    expect(last(r, 'B', 'cq.state')).toMatchObject({ phase: 'lobby', queuePos: 2, queueLen: 2 }); // A still ahead
    r.cq.tick(1100 + 120_000);
    expect(last(r, 'B', 'cq.state')).toMatchObject({ queuePos: 2, queueLen: 2 });
    r.onlineSet.add('A');
    r.cq.online('A', 130_000);
    expect(last(r, 'A', 'cq.state')).toMatchObject({ phase: 'match', match: { opp: { name: 'Đội B' } } });
  });

  it('reconnect during the result hold re-sends cq.result; a new match clears it', () => {
    const { r, set, now } = startMatch();
    r.cq.join('C', now + 10);
    fill(r, 'A', set, now + 100);
    r.cq.checkout('A', CHECKOUT_ZONE.x, CHECKOUT_ZONE.z, now + 3000);
    r.cq.checkout('B', CHECKOUT_ZONE.x, CHECKOUT_ZONE.z, now + 3100);
    const n = r.of('B').filter((m) => m.t === 'cq.result').length;
    r.cq.online('B', now + 4000);
    expect(r.of('B').filter((m) => m.t === 'cq.result').length).toBe(n + 1);
    r.cq.join('B', now + 4500); // F5: the client joins again → the result once more + the result-phase state
    expect(r.of('B').filter((m) => m.t === 'cq.result').length).toBe(n + 2);
    r.alarms.length = 0;
    r.cq.tick(now + 3100 + CETIQLO.resultHoldMs); // B ↔ C
    expect(last(r, 'B', 'cq.state')!.phase).toBe('match');
    const before = r.of('B').filter((m) => m.t === 'cq.result').length;
    r.cq.online('B', now + 3100 + CETIQLO.resultHoldMs + 100);
    expect(r.of('B').filter((m) => m.t === 'cq.result').length).toBe(before); // the old result is gone with the new match
  });

  it('leave during a match forfeits it; leave in the queue frees the place', () => {
    const { r, set, now } = startMatch();
    r.cq.join('C', now + 1);
    r.cq.leave('C', now + 2);
    r.cq.join('D', now + 3);
    expect(last(r, 'D', 'cq.state')).toMatchObject({ queuePos: 1, queueLen: 1 });
    fill(r, 'A', set, now + 100);
    r.cq.leave('B', now + 2000);
    r.cq.checkout('A', CHECKOUT_ZONE.x, CHECKOUT_ZONE.z, now + 3000);
    expect(last(r, 'A', 'cq.result')).toMatchObject({ winner: 'you' });
  });

  it('a room is capped at maxTeamsInRoom', () => {
    const teams = Array.from({ length: CETIQLO.maxTeamsInRoom + 2 }, (_, i) => `t${i}`);
    const r = rig(teams);
    teams.forEach((t, i) => r.cq.join(t, 1000 + i));
    expect(r.of(teams.at(-1)!)).toEqual([{ t: 'cq.no', op: 'join', why: 'busy' }]);
  });

  it('hostView: queue + running match with locks, no bag contents', () => {
    const { r, set, now } = startMatch();
    r.cq.join('C', now + 1);
    fill(r, 'A', set.slice(0, 3), now + 100);
    expect(r.cq.hostView(now + 5000)).toEqual([{ step: STEP, queue: [{ slot: 2, name: 'Đội C' }], match: { id: 'm1', endsAt: now + CETIQLO.pickMs, teams: [
      { slot: 0, name: 'Đội A', locked: false, bagN: 3, online: true }, { slot: 1, name: 'Đội B', locked: false, bagN: 0, online: true }] } }]);
  });
});

describe('Cetiqlo: the lobby state at the end of the result screen', () => {
  const states = (r: ReturnType<typeof rig>, team: string, since: number) => r.of(team).slice(since).filter((m) => m.t === 'cq.state') as Extract<CqServerMessage, { t: 'cq.state' }>[];
  /** A and B play; B (the loser) times out empty-handed vs A's full bag. Returns the end of the hold. */
  function loserRound(r = rig()) {
    const { set, now } = startMatch(r);
    fill(r, 'A', set, now + 100);
    r.cq.checkout('A', CHECKOUT_ZONE.x, CHECKOUT_ZONE.z, now + 5000);
    r.cq.tick(now + CETIQLO.pickMs);
    return { r, hold: now + CETIQLO.pickMs + CETIQLO.resultHoldMs, at: now + CETIQLO.pickMs };
  }

  it('lone loser: result-hold phase first, an alarm is armed at holdUntil, then exactly one lobby state', () => {
    const { r, hold, at } = loserRound();
    expect(last(r, 'B', 'cq.state')).toMatchObject({ phase: 'result', queuePos: 1, queueLen: 1 });
    expect(r.alarms).toContain(hold);
    const n = r.of('B').length;
    r.cq.tick(hold - 1);
    expect(r.of('B').length).toBe(n);
    r.cq.tick(hold);
    expect(states(r, 'B', n)).toEqual([expect.objectContaining({ phase: 'lobby', queuePos: 1, queueLen: 1 })]);
    r.cq.tick(hold + 1000);
    expect(states(r, 'B', n)).toHaveLength(1); // not twice
    expect(at).toBeLessThan(hold);
  });

  it('draw: both teams hear a lobby state at holdUntil (queue places 1 and 2), and rematch', () => {
    const r = rig();
    const { now } = startMatch(r);
    r.cq.tick(now + CETIQLO.pickMs);
    const hold = now + CETIQLO.pickMs + CETIQLO.resultHoldMs;
    const n = { A: r.of('A').length, B: r.of('B').length };
    r.cq.tick(hold);
    // alone in the room they are paired again at once (nobody else waits): the lobby state is replaced by the new match
    expect(states(r, 'A', n.A).at(-1)).toMatchObject({ phase: 'match' });
    expect(states(r, 'B', n.B).at(-1)).toMatchObject({ phase: 'match' });
  });

  it('two losers of a draw with a third team waiting: the third plays first; the pair gets lobby places at holdUntil', () => {
    const r = rig();
    const { now } = startMatch(r);
    r.cq.join('C', now + 10);
    r.cq.join('D', now + 11);
    r.cq.tick(now + CETIQLO.pickMs);
    const hold = now + CETIQLO.pickMs + CETIQLO.resultHoldMs;
    const n = { A: r.of('A').length, C: r.of('C').length };
    r.cq.tick(hold - 1);
    expect(r.of('C').length).toBe(n.C);
    r.cq.tick(hold);
    expect(states(r, 'C', n.C).at(-1)).toMatchObject({ phase: 'match' });
    expect(states(r, 'A', n.A)).toEqual([expect.objectContaining({ phase: 'lobby', queuePos: 1, queueLen: 2 })]);
  });

  it('loser, then a third team joins during the hold: lobby place at once, pairing only at holdUntil', () => {
    const { r, hold, at } = loserRound();
    r.cq.join('C', at + 1000);
    expect(last(r, 'C', 'cq.state')).toMatchObject({ phase: 'lobby', queuePos: 2, queueLen: 2 });
    r.cq.tick(hold - 1);
    expect(last(r, 'C', 'cq.state')!.phase).toBe('lobby');
    const n = r.of('B').length;
    r.cq.tick(hold);
    expect(states(r, 'B', n)).toEqual([expect.objectContaining({ phase: 'match' })]);
    expect(last(r, 'C', 'cq.state')).toMatchObject({ phase: 'match' });
  });

  it('a loser reconnecting during the hold gets the result-hold phase back; the winner needs no lobby state', () => {
    const { r, hold, at } = loserRound();
    r.cq.offline('B', at + 100);
    r.cq.online('B', at + 2000);
    expect(last(r, 'B', 'cq.state')).toMatchObject({ phase: 'result', queuePos: 1 });
    const nA = r.of('A').length;
    r.cq.tick(hold);
    expect(states(r, 'A', nA)).toEqual([]);
  });
});

describe('Cetiqlo: a waiting team is released after maxWaitMs (owner rule: losers since their result, newcomers since their arrival)', () => {
  const W = CETIQLO.maxWaitMs;
  const advances = (r: ReturnType<typeof rig>, t: string) => r.of(t).filter((m) => m.t === 'cq.advance');
  function lose(r = rig(), teams = { win: 'A', lose: 'B' }) {
    const { set, now } = startMatch(r);
    fill(r, teams.win, set, now + 100);
    r.cq.checkout(teams.win, CHECKOUT_ZONE.x, CHECKOUT_ZONE.z, now + 5000);
    r.cq.tick(now + CETIQLO.pickMs);
    return { r, at: now + CETIQLO.pickMs };
  }
  it('the lone loser: released at exactly 10:00 after its result (step completes via io.release, advance reason timeout), never before; the winner got reason win', () => {
    const { r, at } = lose();
    expect(advances(r, 'A')).toEqual([{ t: 'cq.advance', matchId: 'm1', reason: 'win' }]);
    r.cq.tick(at + CETIQLO.resultHoldMs); // the alarm chain: result hold first, then the 10-minute clock
    expect(r.alarms.at(-1)).toBe(at + W);
    r.cq.tick(at + W - 1);
    expect(r.released).toEqual([]);
    r.cq.tick(at + W);
    expect(r.released).toEqual(['B']);
    expect(advances(r, 'B')).toEqual([{ t: 'cq.advance', matchId: 'm1', reason: 'timeout' }]);
    expect(r.cq.hostView(at + W)[0]!.queue).toEqual([]);
    r.cq.tick(at + W + 5000);
    expect(advances(r, 'B')).toHaveLength(1); // once
    r.cq.join('B', at + W + 6000); // the step is done: not back in the queue
    expect(r.of('B').at(-1)).toMatchObject({ t: 'cq.no', why: 'notInRoom' });
  });
  it('a team that never played is released 10:00 after it joined (no opponent came): advance with an empty matchId; the alarm is armed for it', () => {
    const r = rig();
    r.cq.join('A', 1000);
    expect(last(r, 'A', 'cq.state')).toMatchObject({ phase: 'lobby', waitUntil: 1000 + W });
    expect(r.alarms.at(-1)).toBe(1000 + W);
    expect(r.cq.hostView(1000)[0]!.queue).toEqual([{ slot: 0, name: 'Đội A', releaseInS: W / 1000 }]);
    r.cq.tick(1000 + W - 1);
    expect(r.released).toEqual([]);
    r.cq.tick(1000 + W);
    expect(r.released).toEqual(['A']);
    expect(advances(r, 'A')).toEqual([{ t: 'cq.advance', matchId: '', reason: 'timeout' }]);
    expect(r.events.find((e) => e.type === 'cq.release')!.data).toMatchObject({ match: '', waitedMs: W });
  });
  it('the arrival clock never fires inside a match; the loser then counts from the result', () => {
    const r = rig();
    r.cq.join('A', 1000);
    const now = 1000 + W - 10_000; // B arrives when A has 10 s left: they play
    r.cq.join('B', now);
    const set = last(r, 'A', 'cq.state')!.match!.set;
    fill(r, 'A', set, now + 100);
    r.cq.checkout('A', CHECKOUT_ZONE.x, CHECKOUT_ZONE.z, now + 5000);
    r.cq.tick(1000 + W + 5); // past A's arrival clock: the match is running, nobody is released
    expect(r.released).toEqual([]);
    expect(last(r, 'A', 'cq.result')).toBeUndefined();
    r.cq.tick(now + CETIQLO.pickMs); // time up: A won; B waits from this result
    expect(r.wins).toEqual(['A']);
    expect(last(r, 'B', 'cq.state')).toMatchObject({ waitUntil: now + CETIQLO.pickMs + W });
  });
  it('a draw: both released at 10:00 from their own result (they rematch only when the hold ended and nobody else waits: here the rematch resets the clock)', () => {
    const r = rig();
    const { now } = startMatch(r);
    r.cq.join('C', now + 1); // a third team keeps A and B from rematching at once
    r.cq.join('D', now + 2);
    r.cq.tick(now + CETIQLO.pickMs); // draw (both empty)
    const at = now + CETIQLO.pickMs;
    const fresh = (joinedAt: number) => Math.ceil((joinedAt + W - at) / 1000); // C / D count from their arrival
    expect(r.cq.hostView(at)[0]!.queue.map((q) => [q.name, q.releaseInS])).toEqual([['Đội C', fresh(now + 1)], ['Đội D', fresh(now + 2)], ['Đội A', W / 1000], ['Đội B', W / 1000]]);
    r.cq.tick(at + CETIQLO.resultHoldMs); // C and D play; A, B keep their clock from the result
    expect(r.cq.hostView(at + CETIQLO.resultHoldMs)[0]!.queue.map((q) => q.releaseInS)).toEqual([W / 1000 - CETIQLO.resultHoldMs / 1000, W / 1000 - CETIQLO.resultHoldMs / 1000]);
    r.cq.tick(at + W);
    expect(r.released.sort()).toEqual(['A', 'B']);
  });
  it('a loser who plays again gets a fresh clock (and is never released mid-match)', () => {
    const r = rig();
    const { set, now } = startMatch(r);
    r.cq.join('C', now + 1);
    fill(r, 'A', set, now + 100);
    r.cq.checkout('A', CHECKOUT_ZONE.x, CHECKOUT_ZONE.z, now + 5000);
    r.cq.tick(now + CETIQLO.pickMs); // B lost; B (front) vs C starts at the end of the hold
    const hold = now + CETIQLO.pickMs + CETIQLO.resultHoldMs;
    r.cq.tick(hold);
    expect(last(r, 'B', 'cq.state')).toMatchObject({ phase: 'match' });
    r.cq.tick(now + CETIQLO.pickMs + W + 1); // far past B's first clock: it is in a running match... which ended at hold + pickMs
    expect(r.released).toEqual([]);
  });
  it('the queue renumbers when a loser is released and the others hear it', () => {
    const { r, at } = lose();
    r.cq.join('C', at + 1000);
    r.cq.tick(at + W);
    expect(last(r, 'C', 'cq.state')).toMatchObject({ queuePos: 1, queueLen: 1 });
  });
  it('a Host undo of the release puts the team back in the queue with a fresh clock', () => {
    const { r, at } = lose();
    r.cq.tick(at + W);
    r.undone.add('B');
    r.cq.tick(at + W + 3000);
    expect(r.cq.hostView(at + W + 3000)[0]!.queue).toEqual([{ slot: 1, name: 'Đội B', releaseInS: W / 1000 }]);
    r.cq.tick(at + 2 * W + 2999);
    expect(r.released).toEqual(['B']); // not again yet
    r.cq.tick(at + 2 * W + 3000);
    expect(r.released).toEqual(['B', 'B']);
  });
});

describe('Cetiqlo: the waiting-room board (cq.board)', () => {
  const boards = (r: ReturnType<typeof rig>, t: string) => r.of(t).filter((m) => m.t === 'cq.board') as Extract<CqServerMessage, { t: 'cq.board' }>[];
  const rows = (r: ReturnType<typeof rig>, t: string) => boards(r, t).at(-1)!.rows.map((x) => [x.order, x.name, x.status, x.queuePos]);
  it('arrival order 1..n, the pair playing, the queue waiting with places; sent to the whole room on every change and to a joiner', () => {
    const r = rig();
    const { now } = startMatch(r); // A (1000), B (1001) play
    r.cq.join('C', now + 1);
    r.cq.join('D', now + 2);
    expect(rows(r, 'D')).toEqual([[1, 'Đội A', 'playing', undefined], [2, 'Đội B', 'playing', undefined], [3, 'Đội C', 'waiting', 1], [4, 'Đội D', 'waiting', 2]]);
    expect(boards(r, 'A').at(-1)!.rows).toEqual(boards(r, 'D').at(-1)!.rows); // the players hear it too
    expect(boards(r, 'C').at(-1)!.rows[2]).toMatchObject({ slot: 2, waitUntil: now + 1 + CETIQLO.maxWaitMs });
    expect(boards(r, 'D').at(-1)!.serverNow).toBe(now + 2);
  });
  it('after the match: the winner is "won" during the hold then "done" (its row stays), the loser "lost" at the queue front; a leaver drops out', () => {
    const r = rig();
    const { set, now } = startMatch(r);
    r.cq.join('C', now + 1);
    fill(r, 'A', set, now + 100);
    r.cq.checkout('A', CHECKOUT_ZONE.x, CHECKOUT_ZONE.z, now + 5000);
    r.cq.checkout('B', CHECKOUT_ZONE.x, CHECKOUT_ZONE.z, now + 6000);
    expect(rows(r, 'C')).toEqual([[1, 'Đội A', 'won', undefined], [2, 'Đội B', 'lost', 1], [3, 'Đội C', 'waiting', 2]]);
    r.cq.tick(now + 6000 + CETIQLO.resultHoldMs); // B ↔ C
    expect(rows(r, 'C')).toEqual([[1, 'Đội A', 'done', undefined], [2, 'Đội B', 'playing', undefined], [3, 'Đội C', 'playing', undefined]]);
    r.cq.join('D', now + 20_000);
    r.cq.leave('D', now + 21_000);
    r.cq.join('E', now + 22_000);
    expect(rows(r, 'E').map((x) => x[1])).toEqual(['Đội A', 'Đội B', 'Đội C', 'Đội E']); // D left before playing: no row
  });
  it('F5 / reconnect gets the board again; a released team is "done"', () => {
    const r = rig();
    r.cq.join('A', 1000);
    r.cq.join('B', 1000 + CETIQLO.maxWaitMs + 1); // A was let go just now (tick inside join), B is alone
    expect(r.released).toEqual(['A']);
    expect(rows(r, 'B')).toEqual([[1, 'Đội A', 'done', undefined], [2, 'Đội B', 'waiting', 1]]);
    const n = boards(r, 'B').length;
    r.cq.online('B', 1000 + CETIQLO.maxWaitMs + 500);
    expect(boards(r, 'B').length).toBe(n + 1);
  });
});

describe('Cetiqlo: the 5-4-3-2-1 countdown (owner 2026-11-03)', () => {
  it('the pair is placed on the mat at once (startSpots on the CHECKOUT pad), startAt = pairing + countdownMs, nothing is accepted before it; the board says playing', () => {
    const sent: { team: string; m: CqServerMessage }[] = [];
    const base = rig();
    const cq = new Cetiqlo({ ...base.io, send: (team, m) => void sent.push({ team, m }) }, () => FIXTURE, CETIQLO, () => 99);
    cq.join('A', 1000);
    cq.join('B', 1001);
    const st = [...sent].reverse().find((s) => s.team === 'A' && s.m.t === 'cq.state')!.m as Extract<CqServerMessage, { t: 'cq.state' }>;
    expect(st).toMatchObject({ phase: 'match', match: { startAt: 1001 + CETIQLO.countdownMs, endsAt: 1001 + CETIQLO.countdownMs + CETIQLO.pickMs, serverNow: 1001 }, startSpot: START_SPOTS[0] });
    for (const s of START_SPOTS) expect(Math.abs(s.x - CHECKOUT_ZONE.x) <= 1.5 && Math.abs(s.z - CHECKOUT_ZONE.z) <= 1.5).toBe(true); // on the mat
    expect(Math.hypot(START_SPOTS[0]!.x - START_SPOTS[1]!.x, START_SPOTS[0]!.z - START_SPOTS[1]!.z)).toBeGreaterThanOrEqual(1);
    const id = st.match!.set[0]!;
    cq.take('A', id, near(id).x, near(id).z, 1001 + CETIQLO.countdownMs - 1);
    expect(sent.at(-1)!.m).toEqual({ t: 'cq.no', op: 'take', why: 'notRunning' });
    cq.checkout('A', CHECKOUT_ZONE.x, CHECKOUT_ZONE.z, 1001 + CETIQLO.countdownMs - 1);
    expect(sent.at(-1)!.m).toEqual({ t: 'cq.no', op: 'checkout', why: 'notRunning' });
    cq.take('A', id, near(id).x, near(id).z, 1001 + CETIQLO.countdownMs + 200);
    expect(sent.at(-1)!.m).toEqual({ t: 'cq.bag', bag: [id] });
    const board = [...sent].reverse().find((s) => s.m.t === 'cq.board')!.m as Extract<CqServerMessage, { t: 'cq.board' }>;
    expect(board.rows.map((r) => r.status)).toEqual(['playing', 'playing']);
    expect(cq.hostView(1002)[0]!.match).toMatchObject({ startAt: 1001 + CETIQLO.countdownMs });
  });
});
