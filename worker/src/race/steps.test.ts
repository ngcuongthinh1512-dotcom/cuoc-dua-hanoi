// SPEC §8.1 state machine (docs/plans/phase7.md D2–D8, D18), pure: the fake `mini` leg (worker/legs/test/mini.json):
// L1 route → T1 challenge elsewhere → L2 walk-only route → D1 detour (A at the point, B elsewhere) → L3 route → PS.
import { parseLeg, stepZones, type Leg, type Zone } from '@race/shared/leg';
import { NET } from '@race/shared/protocol';
import { describe, expect, it } from 'vitest';
import miniRaw from '../../legs/test/mini.json';
import { emptyProgress } from '../db.ts';
import { bundledLeg } from './leg.ts';
import { advance, boxesOf, cardOf, type Progress, type RaceInput, type Verify } from './steps.ts';

const mini = bundledLeg('mini')!;
const Z = stepZones(mini);
const pass: Verify = () => 'pass';
const P = (step: number, more: Partial<Progress> = {}): Progress => ({ step, arrivedAt: null, startedAt: null, branch: null, finishAt: null, penaltyMinutes: 0, ...more });
const at = (z: Zone, dx = 0) => ({ x: z.x + dx, z: z.z });
const pose = (z: Zone, dx = 0, riding = false): RaceInput => ({ kind: 'pose', ...at(z, dx), riding });
const run = (p: Progress, input: RaceInput, now = 1000, verify = pass, leg: Leg = mini, running = true) => advance(leg, stepZones(leg), p, input, now, verify, running);
const park = (z: Zone) => ({ kind: 'park', rack: z.rack, at: z.parking });

describe('advance: route_info (L1)', () => {
  it('arrives once by position, opens on foot inside the zone only, then holds the next clue', () => {
    expect(run(P(0), pose(Z[0]!, 200)).effects).toEqual([]);
    const a = run(P(0), pose(Z[0]!, 10));
    expect(a).toEqual({ p: P(0, { arrivedAt: 1000 }), effects: [{ kind: 'arrive', step: 0 }] });
    expect(run(a.p, pose(Z[0]!, 5)).effects).toEqual([]); // second entry: nothing
    const open = (dx: number, riding = false): Extract<RaceInput, { kind: 'open' }> => ({ kind: 'open', step: 'L1', ...at(Z[0]!, dx), riding });
    expect(run(a.p, open(Z[0]!.r + NET.geofenceSlack + 1))).toEqual({ p: a.p, effects: [{ kind: 'refuse', code: 'boxFar' }] });
    expect(run(a.p, open(0, true))).toEqual({ p: a.p, effects: [{ kind: 'refuse', code: 'boxRiding' }] });
    expect(run(a.p, { ...open(0), step: 'L2' }).effects).toEqual([]); // a later step: silent
    expect(run(a.p, { ...open(0), step: 'nope' }).effects).toEqual([]);
    const o = run(a.p, open(Z[0]!.r + 1), 2000); // within the slack
    // T1 is a task somewhere else: no rack when its clue arrives (D18), the team rides there
    expect(o).toEqual({ p: P(1), effects: [{ kind: 'complete', step: 0 }] });
    expect(run(o.p, open(0)).effects).toEqual([{ kind: 'refuse', code: 'boxOpened' }]);
  });

  it('open / task inside the zone before any pose there records the arrival first', () => {
    expect(run(P(0), { kind: 'open', step: 'L1', ...at(Z[0]!), riding: false }).effects).toEqual([{ kind: 'arrive', step: 0 }, { kind: 'complete', step: 0 }]);
    expect(run(P(1), { kind: 'task', step: 'T1', ...at(Z[1]!) }).effects.slice(0, 2)).toEqual([{ kind: 'arrive', step: 1 }, park(Z[1]!)]);
  });

  it('outside "running" a pose records the arrival only (D9), nothing moves on', () => {
    expect(run(P(0), pose(Z[0]!), 1000, pass, mini, false).effects).toEqual([{ kind: 'arrive', step: 0 }]);
    expect(run(P(4), pose(Z[4]!), 1000, pass, mini, false)).toEqual({ p: P(4, { arrivedAt: 1000 }), effects: [{ kind: 'arrive', step: 4 }] });
  });
});

describe('advance: tasks', () => {
  it('a challenge elsewhere: rack when the team ENTERS its place, task only inside, then the next clue', () => {
    expect(run(P(1), { kind: 'task', step: 'T1', ...at(Z[1]!, 60) }).effects).toEqual([{ kind: 'refuse', code: 'taskFar' }]);
    const a = run(P(1), pose(Z[1]!));
    expect(a.effects).toEqual([{ kind: 'arrive', step: 1 }, park(Z[1]!)]);
    expect(run(a.p, { kind: 'task', step: 'T1', ...at(Z[1]!), riding: true })).toEqual({ p: a.p, effects: [{ kind: 'refuse', code: 'boxRiding' }] }); // D4
    const t = run(a.p, { kind: 'task', step: 'T1', answer: '42', ...at(Z[1]!) }, 3000);
    // L2 is walk-only: the bike goes to the rack of the point the team STANDS at (T1's place), not L2's (D18)
    expect(t).toEqual({ p: P(2), effects: [{ kind: 'start', step: 1, branch: null }, { kind: 'complete', step: 1 }, park(Z[1]!)] });
    expect(Z[1]!.rack).not.toBe(Z[2]!.rack);
  });

  it('a walk-only route received at a route point parks at THAT point (L1), not at the destination ahead', () => {
    const leg = parseLeg({ ...miniRaw, steps: miniRaw.steps.filter((s) => s.id !== 'T1') });
    if (!leg.ok) throw new Error(JSON.stringify(leg.issues));
    const z = stepZones(leg.leg);
    const r = advance(leg.leg, z, P(0), { kind: 'open', step: 'L1', ...at(z[0]!), riding: false }, 1, pass);
    expect(r.effects).toEqual([{ kind: 'arrive', step: 0 }, { kind: 'complete', step: 0 }, { kind: 'park', rack: z[0]!.rack, at: z[0]!.parking }]);
    expect(z[0]!.parking).not.toBeNull();
  });

  it('verify "wrong" / "pending" change nothing (Phase 8 relies on it)', () => {
    const a = P(1, { arrivedAt: 5 });
    for (const v of ['wrong', 'pending'] as const) expect(run(a, { kind: 'task', step: 'T1', ...at(Z[1]!) }, 9, () => v)).toEqual({ p: a, effects: [] });
  });

  it('detour: a branch is required, each branch is done in its own place, the branch is recorded', () => {
    const p = P(3, { arrivedAt: 1 });
    expect(run(p, { kind: 'task', step: 'D1', ...at(Z[3]!) }).effects).toEqual([]);
    expect(run(p, { kind: 'task', step: 'D1', branch: 'X', ...at(Z[3]!) }).effects).toEqual([]);
    const b = mini.steps[3]!.type === 'detour' ? mini.steps[3].branches[1]!.task.location! : null;
    expect(run(p, { kind: 'task', step: 'D1', branch: 'B', ...at(Z[3]!) }).effects).toEqual([{ kind: 'refuse', code: 'taskFar' }]);
    const bz = stepZones({ ...mini, steps: [{ id: 'X', type: 'route_info', label: '', clue: '', transport: { allowed: 'any' }, destination: b! }] })[0]!;
    expect(run(p, { kind: 'task', step: 'D1', branch: 'B', ...at(bz) }).effects).toEqual([{ kind: 'start', step: 3, branch: 'B' }, { kind: 'complete', step: 3 }]);
    expect(run(p, { kind: 'task', step: 'D1', branch: 'A', ...at(Z[3]!) }).effects).toEqual([{ kind: 'start', step: 3, branch: 'A' }, { kind: 'complete', step: 3 }]);
  });

  it('opening L2 at the Eiffel point arrives at the detour (branch A is right there) in the same input', () => {
    const r = run(P(2, { arrivedAt: 1 }), { kind: 'open', step: 'L2', ...at(Z[2]!), riding: false });
    expect(r.effects).toEqual([{ kind: 'complete', step: 2 }, { kind: 'arrive', step: 3 }]);
    expect(r.p).toEqual(P(3, { arrivedAt: 1000 }));
  });
});

describe('advance: route to the Pit Stop + check-in', () => {
  it('entering the Pit Stop zone ends the last route and checks in at once without a penalty', () => {
    const r = run(P(4), pose(Z[4]!), 7000);
    expect(r.effects).toEqual([{ kind: 'arrive', step: 4 }, { kind: 'complete', step: 4 }, { kind: 'arrive', step: 5 }, { kind: 'finish' }]);
    expect(r.p).toEqual(P(5, { arrivedAt: 7000, finishAt: 7000 }));
    expect(run(r.p, { kind: 'checkin', ...at(Z[5]!) }).effects).toEqual([]); // idempotent
  });

  it('on a bike: arrives, but checks in only on foot', () => {
    const r = run(P(4), pose(Z[4]!, 0, true));
    expect(r.p).toEqual(P(5, { arrivedAt: 1000 }));
    expect(run(r.p, { kind: 'checkin', ...at(Z[5]!), riding: true }).effects).toEqual([{ kind: 'refuse', code: 'boxRiding' }]);
    expect(run(r.p, { kind: 'checkin', ...at(Z[5]!, 100) }).effects).toEqual([{ kind: 'refuse', code: 'boxFar' }]);
    expect(run(r.p, { kind: 'checkin', ...at(Z[5]!) }, 1500).effects).toEqual([{ kind: 'finish' }]);
  });

  it('with a penalty: check-in refused until the wait is over', () => {
    const p = P(5, { arrivedAt: 10_000, penaltyMinutes: 2 });
    expect(run(p, { kind: 'checkin', ...at(Z[5]!) }, 10_000 + 60_000)).toEqual({ p, effects: [{ kind: 'refuse', code: 'penaltyWait' }] });
    expect(run(p, pose(Z[5]!), 10_000 + 60_000).effects).toEqual([]);
    expect(run(p, { kind: 'checkin', ...at(Z[5]!) }, 10_000 + 120_000).effects).toEqual([{ kind: 'finish' }]);
    // never arrived: the check-in records the arrival, then waits
    expect(run(P(5, { penaltyMinutes: 1 }), { kind: 'checkin', ...at(Z[5]!) }).effects).toEqual([{ kind: 'arrive', step: 5 }, { kind: 'refuse', code: 'penaltyWait' }]);
  });
});

describe('boxesOf / cardOf', () => {
  it('boxes for routes, the mat for the last route and the Pit Stop, none for tasks', () => {
    const b = boxesOf(mini, Z);
    expect(b.map((x) => x && [x.step, x.kind ?? 'box', x.r])).toEqual([['L1', 'box', 35], null, ['L2', 'box', 40], null, ['PS', 'mat', 25], ['PS', 'mat', 25]]);
  });

  it('cards never carry an answer, a destination name, params or coordinates', () => {
    for (const leg of [mini, bundledLeg('paris-demo-filled')!]) {
      const answers = leg.steps.flatMap((s) => (s.type === 'challenge' ? s.task.answers : s.type === 'detour' ? s.branches.flatMap((b) => b.task.answers) : []));
      const names = leg.steps.flatMap((s) => (s.type === 'route_info' || s.type === 'pit_stop' ? [s.destination.name] : []));
      expect(answers.length).toBeGreaterThan(1);
      const strings: string[] = [];
      const keys = new Set<string>();
      const walk = (v: unknown): void => {
        if (typeof v === 'string') strings.push(v);
        else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) (keys.add(k), walk(x));
      };
      leg.steps.forEach((_, i) => walk(cardOf(leg, i, { ...emptyProgress('t', leg.steps[i]!.id), clue_opened_at: 5, branch: 'A' }, 9)));
      for (const k of ['answers', 'params', 'lat', 'lon', 'destination', 'location', 'bikeParking', 'radius']) expect(keys.has(k)).toBe(false);
      for (const a of answers) expect(strings.filter((s) => (a.length < 3 ? s === a : s.toLowerCase().includes(a.toLowerCase())))).toEqual([]);
      for (const n of names) expect(strings.filter((s) => s.includes(n))).toEqual([]);
    }
  });

  it('card fields: route transport, challenge teaser + task place, detour branches, status from the row', () => {
    const row = (i: number, more = {}) => ({ ...emptyProgress('t', mini.steps[i]!.id), clue_opened_at: 100, ...more });
    expect(cardOf(mini, 2, row(2), 0)).toMatchObject({ step: 'L2', type: 'route_info', transport: { mandatory: 'walk' }, status: 'active', receivedAt: 100, completedAt: null });
    expect(cardOf(mini, 1, row(1, { completed_at: 300 }), 0)).toMatchObject({ text: expect.stringContaining('vườn'), task: { place: 'Vườn Trocadéro (phía dưới)', timeLimitMinutes: 10 }, status: 'done', completedAt: 300 });
    expect(cardOf(mini, 3, row(3, { branch: 'B' }), 0)).toMatchObject({ branch: 'B', branches: [{ id: 'A' }, { id: 'B', task: { place: 'Bãi cỏ Champ de Mars', verification: 'host_approval' } }] });
    expect(cardOf(mini, 5, undefined, 42)).toEqual({ step: 'PS', type: 'pit_stop', label: 'Về đích', text: '', status: 'active', receivedAt: 42, completedAt: null });
  });
});
