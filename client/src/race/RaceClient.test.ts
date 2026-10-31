import type { BoxInfo, ClientMessage, FinishResult, RaceView, Welcome } from '@race/shared/protocol';
import { describe, expect, it } from 'vitest';
import { raceClient } from '../config.ts';
import { boxInReach, matAt, RaceClient } from './RaceClient.ts';
import type { RaceHud } from './ui/RaceHud.ts';

const view = (o: Partial<RaceView> = {}): RaceView => ({ status: 'running', finishAt: null, penaltyMinutes: 0, card: null, checkinAt: null, result: null, ...o });
const pit = (o: Partial<RaceView> = {}) =>
  view({ card: { step: 'PS', type: 'pit_stop', label: 'Chặng dừng', text: '', media: [], status: 'active', lockedUntil: null, lockKind: null, answers: [], receivedAt: 0, completedAt: null }, ...o });
const WIN: FinishResult = { rank: 1, total: 2, kind: 'first', npc: 'n', toast: 't', card: 'c' };
const box: BoxInfo = { step: 'L1', x: 0, z: 0, opened: false, r: 20 };
const mat: BoxInfo = { step: 'PS', x: 100, z: 0, opened: false, r: 15, kind: 'mat' };

function client(now = 0) {
  const sent: ClientMessage[] = [];
  const finished: boolean[] = [];
  const c = new RaceClient({ hud: undefined, send: (m) => sent.push(m), serverNow: () => now, finished: (f) => finished.push(f) });
  return { c, sent, finished };
}

describe('F and the Pit Stop (D23, D19)', () => {
  it('F: the current unopened box in its zone (→ race open), else the bikes; opened boxes and mats are not opened', () => {
    expect(boxInReach([box], 19, 0)).toBe(box);
    expect(boxInReach([box], 21, 0)).toBeUndefined();
    expect(boxInReach([{ ...box, opened: true }, mat], 0, 0)).toBeUndefined();
    expect(boxInReach([mat], 100, 0)).toBeUndefined();
    const { c, sent } = client();
    expect(c.interact([box], 30, 0, 0)).toBe(false); // out of the zone: F goes to the bikes
    expect(sent).toEqual([]);
    expect(c.interact([box], 5, 5, 0)).toBe(true);
    expect(c.interact([box], 5, 5, 100)).toBe(true); // mashing F: still handled (no bike), one op only
    expect(sent).toEqual([{ t: 'race', op: 'open', step: 'L1' }]);
  });

  it('inZone (the "Bấm F" prompt) only on foot', () => {
    const { c } = client();
    expect(c.frame([box], 0, 0, false, 0).inZone).toBe(true);
    expect(c.frame([box], 0, 0, true, 0).inZone).toBe(false);
  });

  it('check-in every checkinEveryMs ON the mat (SPEC §17.38: the 3,2 × 6,4 m rectangle, not r) while racing the Pit Stop on foot; never riding, paused, finished, before the penalty ends', () => {
    const { c, sent } = client(50_000);
    c.welcome({ teams: [], view: view(), showStartOrder: false, startOrder: 1 } as unknown as Welcome, 0);
    c.frame([mat], 100, 0, false, 0);
    expect(sent).toEqual([]); // still the route before the Pit Stop: its zone completes it by pose
    c.message({ t: 'race', view: pit() });
    expect(matAt([mat], 100, 3)).toBe(mat); // 3 m along the long axis (yaw 0 = north-south)
    expect([matAt([mat], 110, 0), matAt([mat], 100, 4)]).toEqual([undefined, undefined]); // beside / past the mat, within r = 15
    c.frame([mat], 100, 3, true, 10_000);
    expect(sent).toEqual([]); // on the bike
    c.frame([mat], 100, 3, false, 10_000);
    c.frame([mat], 100, 3, false, 10_000 + raceClient.checkinEveryMs - 1);
    c.frame([mat], 100, 3, false, 10_000 + raceClient.checkinEveryMs);
    expect(sent).toEqual([{ t: 'race', op: 'checkin' }, { t: 'race', op: 'checkin' }]);
    sent.length = 0;
    c.message({ t: 'race', view: pit({ status: 'paused' }) });
    c.frame([mat], 100, 3, false, 99_000);
    c.message({ t: 'race', view: pit({ checkinAt: 60_000 }) }); // penalty: server clock 50 000
    c.frame([mat], 100, 3, false, 199_000);
    expect(sent).toEqual([]);
  });

  it('finish: fresh check-in → celebrate first; a welcome already finished → spectator at once', () => {
    const { c, finished } = client();
    c.welcome({ teams: [], view: pit(), showStartOrder: false, startOrder: 1 } as unknown as Welcome, 0);
    c.message({ t: 'race', view: pit({ finishAt: 5, result: WIN }) });
    c.message({ t: 'race', view: pit({ finishAt: 5, result: WIN }) }); // same state again: no second celebration
    const back = client();
    back.c.welcome({ teams: [], view: pit({ finishAt: 5 }), showStartOrder: false, startOrder: 1 } as unknown as Welcome, 0);
    expect([finished, back.finished]).toEqual([[true], [false]]);
  });

  it('SPEC §17.22 / §17.23: the result goes to the HUD once when it appears (fresh), and from a welcome as a replay', () => {
    const results: [unknown, boolean][] = [];
    const hud = { result: (r: unknown, fresh: boolean) => results.push([r, fresh]), setView: () => {} } as unknown as RaceHud;
    const c = new RaceClient({ hud, send: () => {}, serverNow: () => 0 });
    c.welcome({ teams: [], view: pit(), showStartOrder: false, startOrder: 1 } as unknown as Welcome, 0);
    expect(results).toEqual([]);
    c.message({ t: 'race', view: pit({ finishAt: 5, result: WIN }) });
    c.message({ t: 'race', view: pit({ finishAt: 5, result: WIN }) });
    expect(results).toEqual([[WIN, true]]);
    const out = { ...WIN, rank: 2, kind: 'out' as const };
    c.welcome({ teams: [], view: view({ status: 'finished', result: out }), showStartOrder: false, startOrder: 1 } as unknown as Welcome, 0);
    expect(results.at(-1)).toEqual([out, false]); // out at the Host's "Kết thúc" while offline: RaceHud shows it unless already seen
  });

  it('Host "Kết thúc" (status finished) → read-only spectator for a team not checked in, live or at re-entry (SPEC §8.10)', () => {
    const { c, finished } = client();
    c.welcome({ teams: [], view: view(), showStartOrder: false, startOrder: 1 } as unknown as Welcome, 0);
    c.message({ t: 'race', view: view({ status: 'finished' }) });
    c.message({ t: 'race', view: view({ status: 'finished' }) }); // same state again: once
    const back = client();
    back.c.welcome({ teams: [], view: view({ status: 'finished' }), showStartOrder: false, startOrder: 1 } as unknown as Welcome, 0);
    const done = client(); // checked in before the end: the celebration only, the end adds nothing
    done.c.message({ t: 'race', view: pit({ finishAt: 5 }) });
    done.c.message({ t: 'race', view: pit({ finishAt: 5, status: 'finished' }) });
    expect([finished, back.finished, done.finished]).toEqual([[false], [false], [true]]);
  });
});

describe('Phase 8 ops (D7, D8, D9)', () => {
  it('F at a branch box: open carries its branch, the pose first (op); a route box: no branch', () => {
    const [ops, sent]: ClientMessage[][] = [[], []];
    const c = new RaceClient({ hud: undefined, send: (m) => sent.push(m), op: (m) => ops.push(m), serverNow: () => 0 });
    const a: BoxInfo = { ...box, step: 'D1', branch: 'A' };
    expect(boxInReach([{ ...a, branch: 'B', opened: true }, a], 1, 1)).toBe(a);
    expect(c.interact([a], 1, 1, 0)).toBe(true);
    expect(c.interact([box], 1, 1, 10_000)).toBe(true);
    expect(ops).toEqual([{ t: 'race', op: 'open', step: 'D1', branch: 'A' }, { t: 'race', op: 'open', step: 'L1' }]);
    expect(sent).toEqual([]);
  });

  it('countdown end: lockEndSlackMs after lockedUntil (server clock) the pose goes out once, again only for a new countdown', () => {
    let now = 100_000;
    let poses = 0;
    const c = new RaceClient({ hud: undefined, send: () => {}, serverNow: () => now, pose: () => poses++ });
    const locked = (until: number | null) => pit({ card: { ...pit().card!, step: 'D1', type: 'detour', status: until ? 'switchLocked' : 'goToBranch', lockedUntil: until, lockKind: until ? 'switch' : null } });
    c.message({ t: 'race', view: locked(112_000) });
    for (now = 100_000; now < 112_000 + raceClient.lockEndSlackMs; now += 250) c.frame([], 0, 0, false, now);
    expect(poses).toBe(0);
    for (let i = 0; i < 20; i++, now += 250) c.frame([], 0, 0, false, now);
    expect(poses).toBe(1);
    c.message({ t: 'race', view: locked(112_000) }); // the same countdown again (another `race` while it ran): no second pose
    c.frame([], 0, 0, false, now);
    c.message({ t: 'race', view: locked(null) });
    c.frame([], 0, 0, false, now);
    expect(poses).toBe(1);
    c.message({ t: 'race', view: locked(now + 6000) }); // the Host's "Phạt" later: its own end
    now += 6000 + raceClient.lockEndSlackMs;
    c.frame([], 0, 0, true, now); // riding or not: a pose is a pose
    c.frame([], 0, 0, true, now + 1000);
    expect(poses).toBe(2);
  });

  it('answer / branch / accept go out at once from anywhere: no pose first (D8)', () => {
    const [ops, sent]: ClientMessage[][] = [[], []];
    const c = new RaceClient({ hud: undefined, send: (m) => sent.push(m), op: (m) => ops.push(m), serverNow: () => 0 });
    c.answer('T1', 'bảy');
    c.answer('D1', '');
    c.branch('D1', 'A');
    c.accept('T2');
    expect(sent).toEqual([{ t: 'race', op: 'answer', step: 'T1', text: 'bảy' }, { t: 'race', op: 'answer', step: 'D1', text: '' }, { t: 'race', op: 'branch', step: 'D1', branch: 'A' }, { t: 'race', op: 'accept', step: 'T2' }]);
    expect(ops).toEqual([]);
  });
});

// Leg 3 rooms (rooms/roomState.ts): the held view, the `race room` report gate, the Phạt re-send
describe('Leg 3 rooms', () => {
  const roomCard = (done: number, status: 'active' | 'pending' | 'locked' = 'active', lockedUntil: number | null = null): RaceView['card'] => ({
    ...pit().card!, step: 'D1', type: 'detour', branch: 'A', branchOpened: true, status, lockedUntil, lockKind: status === 'locked' ? 'retry' : null,
    branches: [{ id: 'A', name: 'a', summary: '', task: { title: '', description: '', media: [], kind: 'free', verification: 'host_approval', input: 'proof', proofInstruction: '', timeLimitMinutes: null, room: { kind: 'chocolate', total: 5, penaltyMinutesEach: 20, done, skipped: false } } }, { id: 'B', name: 'b', summary: '' }],
  });

  it('deps.view sees every view first; true holds it from the HUD until release() (the latest held view wins)', () => {
    const seen: (string | undefined)[] = [];
    let hold = false;
    const hud = { setView: (v: RaceView | null) => seen.push(v?.card?.step) } as unknown as RaceHud;
    const c = new RaceClient({ hud, send: () => {}, serverNow: () => 0, view: () => hold });
    c.message({ t: 'race', view: view({ card: roomCard(1) }) });
    expect(seen).toEqual(['D1']);
    hold = true;
    c.message({ t: 'race', view: pit() });
    c.message({ t: 'race', view: view({ card: { ...pit().card!, step: 'L2' } }) });
    expect(seen).toEqual(['D1']);
    expect(c.view?.card?.step).toBe('L2'); // the client's own view moves on
    c.release();
    c.release(); // idempotent
    expect(seen).toEqual(['D1', 'L2']);
    hold = false;
    c.message({ t: 'race', view: pit() });
    expect(seen).toEqual(['D1', 'L2', 'PS']);
  });

  it('room(): done only grows per branch, a skip always goes out, force re-sends; a switch away and back starts over', () => {
    const { c, sent } = client();
    c.room('D1', 'A', 0, false);
    c.room('D1', 'A', 2, false);
    c.room('D1', 'A', 2, false); // the same again: nothing
    c.room('D1', 'A', 1, false); // down: nothing (the server would refuse it)
    c.room('D1', 'B', 1, false); // the other branch: its own count
    c.room('D1', 'A', 0, false); // back on A: the server reset it → 0 is new
    c.room('D1', 'A', 0, false, true); // forced
    c.room('D1', 'A', 3, true); // a skip (final)
    expect(sent.map((m) => (!Array.isArray(m) && m.t === 'race' && m.op === 'room' ? `${m.branch}:${m.done}${m.skipped ? 's' : ''}` : '?'))).toEqual(['A:0', 'A:2', 'B:1', 'A:0', 'A:0', 'A:3s']);
  });

  it('a Phạt countdown on a finished room (n/n) ends: the n/n report goes out again (the server queues it for the Host once more)', () => {
    let now = 100_000;
    const sent: ClientMessage[] = [];
    const cl = new RaceClient({ hud: undefined, send: (m) => sent.push(m), serverNow: () => now, pose: () => {} });
    cl.message({ t: 'race', view: view({ card: roomCard(5, 'locked', 110_000) }) });
    for (; now < 110_000 + raceClient.lockEndSlackMs + 2000; now += 500) cl.frame([], 0, 0, false, now);
    expect(sent).toEqual([{ t: 'race', op: 'room', step: 'D1', branch: 'A', done: 5, skipped: false }]);
    cl.message({ t: 'race', view: view({ card: roomCard(3, 'locked', now + 5000) }) }); // 3/5 locked (the Host penalized an earlier n/n after an undo…): nothing to re-send
    for (const end = now + 8000; now < end; now += 500) cl.frame([], 0, 0, false, now);
    expect(sent.length).toBe(1);
  });
});
