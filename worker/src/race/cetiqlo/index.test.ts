import type { CqServerMessage } from '@race/shared/protocol';
import { describe, expect, it } from 'vitest';
import { CETIQLO, CHECKOUT_ZONE } from './config.ts';
import { FIXTURE } from './fixture.ts';
import { Cetiqlo, type CqIO } from './index.ts';

const byId = new Map(FIXTURE.map((i) => [i.id, i]));
const near = (id: string) => ({ x: byId.get(id)!.shelf.x, z: byId.get(id)!.shelf.z });
const STEP = 'T1';

function rig(teams = ['A', 'B', 'C', 'D']) {
  const sent: { team: string; m: CqServerMessage }[] = [];
  const wins: string[] = [];
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
    stepOf: (t) => (wins.includes(t) ? null : STEP),
    win: (t) => void wins.push(t),
    setAlarm: (at) => void alarms.push(at),
    event: (_t, _team, type, data) => void events.push({ type, data }),
  };
  const make = () => new Cetiqlo(io, () => FIXTURE, CETIQLO, () => 99);
  return { cq: make(), remake: make, sent, wins, events, alarms, onlineSet, writes: () => writes, io, of: (t: string) => sent.filter((s) => s.team === t).map((s) => s.m) };
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
    expect(ra).toMatchObject({ winner: 'you', reason: 'score', you: { scorePct: 100, correct: 6, errors: 0, lockedAtMs: now + 6000 }, opp: { scorePct: 66, correct: 4, errors: 2 } });
    expect(rb).toMatchObject({ winner: 'opp', you: { scorePct: 66, lockedAtMs: now + 5000 }, opp: { bag: set } });
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
    expect(last(r, 'A', 'cq.result')).toMatchObject({ winner: 'opp', reason: 'completion', you: { scorePct: 100, lockedAtMs: null } });
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

  it('disconnect: grace keeps the place and the match; past it the team is gone (the other still wins by completion)', () => {
    const { r, set, now } = startMatch();
    fill(r, 'A', set, now + 100);
    r.onlineSet.delete('B');
    r.cq.offline('B', now + 2000);
    r.cq.checkout('A', CHECKOUT_ZONE.x, CHECKOUT_ZONE.z, now + 3000);
    expect(r.of('A').some((m) => m.t === 'cq.result')).toBe(false); // B may still come back
    r.cq.tick(now + 2000 + CETIQLO.graceReconnectMs);
    expect(last(r, 'A', 'cq.result')).toMatchObject({ winner: 'you' });
    expect(r.of('B').some((m) => m.t === 'cq.result')).toBe(false); // offline: not told
    expect(r.wins).toEqual(['A']);
  });

  it('reconnect inside the grace gets its state back and the match goes on', () => {
    const { r, set, now } = startMatch();
    fill(r, 'B', set.slice(0, 1), now + 100);
    r.onlineSet.delete('B');
    r.cq.offline('B', now + 1000);
    r.onlineSet.add('B');
    r.cq.online('B', now + 5000);
    expect(last(r, 'B', 'cq.state')!.match).toMatchObject({ yourBag: [set[0]] });
    r.cq.tick(now + 1000 + CETIQLO.graceReconnectMs + 1);
    expect(last(r, 'A', 'cq.result')).toBeUndefined();
  });

  it('an offline queued team is skipped by the pairing and dropped after the grace', () => {
    const r = rig();
    r.cq.join('A', 1000);
    r.onlineSet.delete('A');
    r.cq.offline('A', 1100);
    r.cq.join('B', 1200);
    expect(last(r, 'B', 'cq.state')!.phase).toBe('lobby');
    r.cq.tick(1100 + CETIQLO.graceReconnectMs);
    expect(last(r, 'B', 'cq.state')).toMatchObject({ queuePos: 1, queueLen: 1 });
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
    expect(r.cq.hostView()).toEqual([{ step: STEP, queue: [{ slot: 2, name: 'Đội C' }], match: { id: 'm1', endsAt: now + CETIQLO.pickMs, teams: [
      { slot: 0, name: 'Đội A', locked: false, bagN: 3, online: true }, { slot: 1, name: 'Đội B', locked: false, bagN: 0, online: true }] } }]);
  });
});
