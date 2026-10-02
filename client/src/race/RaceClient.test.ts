import type { BoxInfo, ClientMessage, FeedMessage, LouvreView, RaceView, Welcome } from '@race/shared/protocol';
import { describe, expect, it } from 'vitest';
import { louvreRoom, raceClient } from '../config.ts';
import { boxInReach, matAt, RaceClient, raceClock } from './RaceClient.ts';
import type { RaceHud } from './ui/RaceHud.ts';

const view = (o: Partial<RaceView> = {}): RaceView => ({ status: 'running', startAt: null, finishAt: null, penaltyMinutes: 0, card: null, checkinAt: null, officialMs: null, ...o });
const pit = (o: Partial<RaceView> = {}) =>
  view({ card: { step: 'PS', type: 'pit_stop', label: 'Chặng dừng', text: '', media: [], status: 'active', lockedUntil: null, lockKind: null, answers: [], receivedAt: 0, completedAt: null }, ...o });
const box: BoxInfo = { step: 'L1', x: 0, z: 0, opened: false, r: 20 };
const mat: BoxInfo = { step: 'PS', x: 100, z: 0, opened: false, r: 15, kind: 'mat' };

function client(now = 0) {
  const sent: ClientMessage[] = [];
  const finished: boolean[] = [];
  const c = new RaceClient({ hud: undefined, send: (m) => sent.push(m), serverNow: () => now, team: 'Đội Xanh', finished: (f) => finished.push(f) });
  return { c, sent, finished };
}

describe('race clock (SPEC §17.12)', () => {
  it('no start time → null; running → since the start; finished → stopped at the check-in', () => {
    expect(raceClock(null, 5000)).toBeNull();
    expect(raceClock(view(), 5000)).toBeNull();
    expect(raceClock(view({ startAt: 1000 }), 61_000)).toBe(60);
    expect(raceClock(view({ startAt: 1000, finishAt: 31_000 }), 99_000)).toBe(30);
    expect(raceClock(view({ startAt: 10_000 }), 5000)).toBe(0); // clock skew: never negative
  });
});

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

  it('check-in every checkinEveryMs on the mat zone while racing the Pit Stop on foot; never riding, paused, finished, before the penalty ends', () => {
    const { c, sent } = client(50_000);
    c.welcome({ teams: [], view: view(), showStartOrder: false, startOrder: 1 } as unknown as Welcome, 0);
    c.frame([mat], 100, 0, false, 0);
    expect(sent).toEqual([]); // still the route before the Pit Stop: its zone completes it by pose
    c.message({ t: 'race', view: pit() });
    expect(matAt([mat], 110, 0)).toBe(mat);
    c.frame([mat], 110, 0, true, 10_000);
    expect(sent).toEqual([]); // on the bike
    c.frame([mat], 110, 0, false, 10_000);
    c.frame([mat], 110, 0, false, 10_000 + raceClient.checkinEveryMs - 1);
    c.frame([mat], 110, 0, false, 10_000 + raceClient.checkinEveryMs);
    expect(sent).toEqual([{ t: 'race', op: 'checkin' }, { t: 'race', op: 'checkin' }]);
    sent.length = 0;
    c.message({ t: 'race', view: pit({ status: 'paused' }) });
    c.frame([mat], 110, 0, false, 99_000);
    c.message({ t: 'race', view: pit({ checkinAt: 60_000 }) }); // penalty: server clock 50 000
    c.frame([mat], 110, 0, false, 199_000);
    expect(sent).toEqual([]);
  });

  it('finish: fresh check-in → celebrate first; a welcome already finished → spectator at once', () => {
    const { c, finished } = client();
    c.welcome({ teams: [], view: pit(), showStartOrder: false, startOrder: 1 } as unknown as Welcome, 0);
    c.message({ t: 'race', view: pit({ finishAt: 5, officialMs: 5 }) });
    c.message({ t: 'race', view: pit({ finishAt: 5, officialMs: 5 }) }); // same state again: no second celebration
    const back = client();
    back.c.welcome({ teams: [], view: pit({ finishAt: 5 }), showStartOrder: false, startOrder: 1 } as unknown as Welcome, 0);
    expect([finished, back.finished]).toEqual([[true], [false]]);
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

describe('Phase 8B: Louvre room ops + feed / credits routing (docs/plans/phase8b.md §G)', () => {
  it('pick / view / credits go out at once; lock goes through op (pose first)', () => {
    const sent: ClientMessage[] = [];
    const ops: ClientMessage[] = [];
    const c = new RaceClient({ hud: undefined, send: (m) => sent.push(m), op: (m) => ops.push(m), serverNow: () => 0 });
    expect(c.pick('T3', 'art-07', true, 0)).toBe(true);
    expect(c.pick('T3', 'art-07', false, louvreRoom.pickGapMs - 1)).toBe(false); // F mashing: dropped
    expect(c.pick('T3', 'art-07', false, louvreRoom.pickGapMs)).toBe(true);
    c.refresh();
    c.credits();
    c.lock('T3');
    expect(sent).toEqual([{ t: 'race', op: 'pick', step: 'T3', art: 'art-07', on: true }, { t: 'race', op: 'pick', step: 'T3', art: 'art-07', on: false }, { t: 'race', op: 'view' }, { t: 'race', op: 'credits' }]);
    expect(ops).toEqual([{ t: 'race', op: 'lock', step: 'T3' }]);
    expect(c.lock('T3', 5000)).toBe(true);
    expect(c.lock('T3', 5000 + raceClient.opMinGapMs - 1)).toBe(false); // F mashing at the lock: one op (maxRaceOps)
    expect(ops).toHaveLength(2);
  });

  it('welcome.feed, a feed line and the credits reach the HUD (team names from welcome.teams)', () => {
    const got: unknown[] = [];
    const hud = { setView() {}, feed: (ms: unknown, teams: unknown) => got.push(['feed', ms, teams]), credits: (items: unknown) => got.push(['credits', items]) } as unknown as RaceHud;
    const c = new RaceClient({ hud, send: () => {}, serverNow: () => 0 });
    const teams = [{ slot: 1, id: 't1', name: 'Đội Đỏ', colour: '#f00', online: true }];
    const line: FeedMessage = { t: 'feed', at: 5, slot: 1, ok: false, minutes: 3 };
    c.welcome({ teams, view: null, feed: [line], showStartOrder: false, startOrder: null } as unknown as Welcome, 0);
    expect(c.message(line)).toBe(true);
    expect(c.message({ t: 'credits', items: [] })).toBe(true);
    expect(got).toEqual([['feed', [line], teams], ['feed', [line], teams], ['credits', []]]);
  });

  it('frame(): `view` once per hint mark (hintAt[i] + lockEndSlackMs), none when the card has that hint already', () => {
    let now = 0;
    const sent: ClientMessage[] = [];
    const c = new RaceClient({ hud: undefined, send: (m) => sent.push(m), serverNow: () => now });
    const lv = (o: Partial<LouvreView> = {}): LouvreView => ({ artworks: [], room: { x: 0, z: 0, r: 20, yaw: 0 }, picks: [], attempts: 0, hintAt: [10_000, 20_000], hintCount: null, hintCorrect: null, maxPicks: null, ...o });
    const card = (l: LouvreView) => view({ card: { step: 'T3', type: 'challenge', label: 'Thử thách 3', text: '', media: [], status: 'active', lockedUntil: null, lockKind: null, answers: [], receivedAt: 0, completedAt: null, task: { title: '', description: '', media: [], kind: 'louvre', verification: 'auto', input: 'room', proofInstruction: '', timeLimitMinutes: null, louvre: l } } });
    const views = () => sent.filter((m) => !Array.isArray(m) && m.t === 'race' && m.op === 'view').length;
    c.message({ t: 'race', view: card(lv()) });
    c.frame([], 0, 0, false, 0);
    now = 10_000 + raceClient.lockEndSlackMs - 1;
    c.frame([], 0, 0, false, 0);
    expect(views()).toBe(0);
    now += 1;
    c.frame([], 0, 0, false, 0);
    c.frame([], 0, 0, false, 0);
    expect(views()).toBe(1); // once, even before the answer
    c.message({ t: 'race', view: card(lv({ hintCount: 5, maxPicks: 5 })) });
    now = 20_000 + raceClient.lockEndSlackMs;
    c.frame([], 0, 0, false, 0);
    c.frame([], 0, 0, false, 0);
    expect(views()).toBe(2); // the 70-minute mark, once
    const d = new RaceClient({ hud: undefined, send: (m) => sent.push(m), serverNow: () => now });
    d.message({ t: 'race', view: card(lv({ hintCount: 5, hintCorrect: 2, maxPicks: 5 })) }); // F5 after both marks: welcome had them
    d.frame([], 0, 0, false, 0);
    expect(views()).toBe(2);
  });
});
