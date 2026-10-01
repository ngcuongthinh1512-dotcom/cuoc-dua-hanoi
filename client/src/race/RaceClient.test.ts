import type { BoxInfo, ClientMessage, RaceView, Welcome } from '@race/shared/protocol';
import { describe, expect, it } from 'vitest';
import { raceClient } from '../config.ts';
import { boxInReach, matAt, RaceClient, raceClock } from './RaceClient.ts';

const view = (o: Partial<RaceView> = {}): RaceView => ({ status: 'running', startAt: null, finishAt: null, penaltyMinutes: 0, card: null, checkinAt: null, officialMs: null, ...o });
const pit = (o: Partial<RaceView> = {}) =>
  view({ card: { step: 'PS', type: 'pit_stop', label: 'Chặng dừng', text: '', status: 'active', receivedAt: 0, completedAt: null }, ...o });
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
});
