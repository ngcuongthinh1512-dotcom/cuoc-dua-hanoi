// CETIQLO head-to-head room through workerd: two teams open the box, join the queue, meet in a match, take items from the real set they
// were sent, check out; the result reaches both at once, the winner's step completes (next clue card), the loser re-queues.
// Privacy spy: every message the loser's socket receives before the result is scanned for the winner's bag.
import { CATALOG } from '@race/shared/cetiqlo';
import type { ClueCard, CqResult, HostState, RaceView, Welcome } from '@race/shared/protocol';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CHECKOUT_ZONE } from './race/cetiqlo/config.ts';
import { joinTeam, nearLeg, nearPoint, raceHarness, setupRace, sleep, walkTo } from './test/harness.ts';

const server = raceHarness();
beforeAll(async () => {
  await server.listen();
}, 60_000);
afterAll(() => server.close());

type Sock = Awaited<ReturnType<typeof joinTeam>>;
const byId = new Map(CATALOG.map((i) => [i.id, i]));
const W = (s: Sock) => s.welcome as unknown as Welcome;
const view = (s: Sock, match: (v: RaceView) => boolean) => s.until((m) => m.t === 'race' && match(m.view)) as Promise<{ view: RaceView }>;
const card = async (s: Sock, match: (c: ClueCard) => boolean) => (await view(s, (v) => !!v.card && match(v.card))).view.card!;
const GAP = 130; // cooldown between actions

/** nearLeg with its challenge replaced by a CETIQLO room step: L1 (box) → CQ (room cetiqlo) → L3 → Pit Stop. */
function cqLeg() {
  const leg = nearLeg() as ReturnType<typeof nearLeg> & { steps: any[] };
  const [l1, , , , l3, ps] = leg.steps;
  const cq = { id: 'CQ', type: 'challenge', label: 'CETIQLO (GIẢ)', task: { title: '(GIẢ) Đấu đối kháng', description: '(GIẢ) Thắng trận để đi tiếp', verification: 'host_approval' }, room: 'cetiqlo' };
  return { ...leg, id: 'cq-test', steps: [l1, cq, l3, ps] };
}

async function newRace(race: string, n: number) {
  const r = await setupRace(server, race, n);
  r.host.send({ t: 'host.leg', json: JSON.stringify(cqLeg()) });
  expect(await r.host.until((m) => m.t === 'host.legResult')).toMatchObject({ ok: true, issues: expect.not.arrayContaining([expect.objectContaining({ level: 'error' })]) });
  const socks = await Promise.all(r.teams.map((t) => joinTeam(server, race, t.code)));
  r.host.send({ t: 'host.race', op: 'start' });
  await Promise.all(socks.map((s) => view(s, (v) => v.status === 'running')));
  // every team opens L1's box → the CQ card (room cetiqlo) is its card
  for (const s of socks) {
    await walkTo(s, W(s).start!, nearPoint(1));
    s.send({ t: 'race', op: 'open', step: 'L1' });
    expect(await card(s, (c) => c.step === 'CQ')).toMatchObject({ room: 'cetiqlo', status: 'active', task: { input: 'none' } });
  }
  return { ...r, socks };
}

const msg = <T extends string>(s: Sock, t: T) => s.until((m) => m.t === t) as Promise<any>;
const stateOf = (s: Sock, phase: string) => s.until((m) => m.t === 'cq.state' && m.phase === phase) as Promise<any>;

describe('CETIQLO (workerd)', () => {
  it('join → match → take / checkout → result to both at once → the winner advances, the loser re-queues; the opponent bag never leaks', async () => {
    const { host, socks: [a, b] } = await newRace('cq-flow', 2);
    // spy: everything each socket receives from now on
    const heard: Record<'a' | 'b', string[]> = { a: [], b: [] };
    const spy = (s: Sock, k: 'a' | 'b') => {
      const orig = s.until;
      s.until = (async (match: (m: any) => boolean, t?: number) => orig((m) => (heard[k].push(JSON.stringify(m)), match(m)), t)) as typeof s.until;
    };
    spy(a!, 'a');
    spy(b!, 'b');
    a!.send({ t: 'race', op: 'answer', step: 'CQ', text: 'tôi đoán' }); // typed answers are refused server-side: nothing changes
    a!.send({ t: 'cq.join' });
    expect(await stateOf(a!, 'lobby')).toMatchObject({ queuePos: 1, queueLen: 1 });
    b!.send({ t: 'cq.join' });
    const [sa, sb] = await Promise.all([stateOf(a!, 'match'), stateOf(b!, 'match')]);
    expect(sa.match.set).toEqual(sb.match.set);
    expect(sa.match.set).toHaveLength(6);
    expect(sa.match.endsAt - sa.match.startAt).toBe(210_000); // 3:30
    expect(Math.abs(sa.serverNow - Date.now())).toBeLessThan(3000);
    const set: string[] = sa.match.set;

    // the host sees the room
    const st = (await host.until((m) => m.t === 'host.state' && !!m.cetiqlo?.[0]?.match)) as unknown as HostState;
    expect(st.cetiqlo![0]).toMatchObject({ step: 'CQ', queue: [], match: { teams: [{ locked: false, bagN: 0 }, { locked: false, bagN: 0 }] } });

    await sleep(Math.max(0, sa.match.startAt - Date.now() + 50)); // the 5-4-3-2-1 countdown: nothing is accepted before startAt
    // far take refused; a (wrong) decoy for b so that b's bag differs from a's
    const [decoyA1, decoyA2, decoy] = CATALOG.filter((i) => !i.slot).map((i) => i.id);
    a!.send({ t: 'cq.take', id: set[0], x: 500, z: 500 });
    expect(await msg(a!, 'cq.no')).toMatchObject({ op: 'take', why: 'far' });
    for (const id of [...set, decoyA1!, decoyA2!]) {
      const p = byId.get(id)!.shelf;
      await sleep(GAP);
      a!.send({ t: 'cq.take', id, x: p.x, z: p.z });
      expect(await msg(a!, 'cq.bag')).toBeDefined();
    }
    for (const id of [...set.slice(0, 3), decoy!]) {
      const p = byId.get(id)!.shelf;
      await sleep(GAP);
      b!.send({ t: 'cq.take', id, x: p.x, z: p.z });
      await msg(b!, 'cq.bag');
    }
    await sleep(GAP);
    b!.send({ t: 'cq.checkout', x: CHECKOUT_ZONE.x, z: CHECKOUT_ZONE.z });
    expect(await msg(a!, 'cq.opp')).toEqual({ t: 'cq.opp', locked: true });
    await sleep(GAP);
    a!.send({ t: 'cq.checkout', x: CHECKOUT_ZONE.x, z: CHECKOUT_ZONE.z });
    const [ra, rb] = (await Promise.all([msg(a!, 'cq.result'), msg(b!, 'cq.result')])) as CqResult[];
    expect(ra).toMatchObject({ winner: 'you', reason: 'score', you: { score: 82, errors: 2, bag: [...set, decoyA1, decoyA2] }, opp: { correct: 3 } });
    expect(rb).toMatchObject({ winner: 'opp', reason: 'score', you: { correct: 3, errors: 1, score: 41 }, opp: { bag: [...set, decoyA1, decoyA2] } });
    expect(ra.serverNow).toBe(rb.serverNow);
    // winner completes the step through the engine: next card, SQLite first
    const next = await card(a!, (c) => c.step === 'L3');
    expect(next.status).toBe('active');
    expect(next.room).toBeUndefined(); // no CETIQLO leftovers on the winner's next card
    expect(next.task).toBeUndefined();
    expect(next.answers).toEqual([]);
    expect(await msg(a!, 'cq.advance')).toMatchObject({ matchId: sa.match.id });
    // the loser is back at the front of the queue, still on CQ
    expect(await stateOf(b!, 'result')).toMatchObject({ queuePos: 1, queueLen: 1 });

    // privacy: nothing that reached b before the result mentions a's bag-only items or a's checkout time; same for a
    const bBefore = heard.b.slice(0, heard.b.findIndex((m) => m.includes('"cq.result"')));
    const aBefore = heard.a.slice(0, heard.a.findIndex((m) => m.includes('"cq.result"')));
    for (const id of [decoyA1!, decoyA2!]) expect(bBefore.join('\n')).not.toContain(id);
    expect(aBefore.join('\n')).not.toContain(decoy!);
    expect(bBefore.join('\n')).not.toContain(String(ra.you.lockedAtMs));
    expect(bBefore.length).toBeGreaterThan(3);
    expect(aBefore.length).toBeGreaterThan(3);
  }, 40_000);

  it('a team not on the CETIQLO step is refused; cq.* from a Host socket closes it', async () => {
    const { host, teams } = await setupRace(server, 'cq-refuse', 1);
    host.send({ t: 'host.leg', json: JSON.stringify(cqLeg()) });
    await host.until((m) => m.t === 'host.legResult');
    const s = await joinTeam(server, 'cq-refuse', teams[0]!.code);
    s.send({ t: 'cq.join' });
    expect(await msg(s, 'cq.no')).toMatchObject({ op: 'join', why: 'notInRoom' });
    host.send({ t: 'cq.join' });
    expect(await host.until((m) => m.closed !== undefined)).toMatchObject({ closed: expect.any(Number) });
  }, 40_000);
});
