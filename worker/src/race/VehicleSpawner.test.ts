// Phase 6 track C: the pure spawner / claim / abandonment rules (SPEC §6.2–6.3), demo leg `vehicles` block.
import { describe, expect, it } from 'vitest';
import { legRules } from './leg.ts';
import { abandoned, claim, CLAIM_REACH, initialSpawn, newBike, OWN_REACH, periodicSpawn, rng, type ServerBike, type SpawnCandidates, type SpawnerState, stream } from './VehicleSpawner.ts';

const cfg = legRules().vehicles;
/** 6 segments (a 500 m line of points every 10 m, 1 km apart) + a decoy line far from all of them. */
const line = (x0: number, z0: number) => Array.from({ length: 51 }, (_, k) => [x0, z0 + 10 * k]).flat();
const cands: SpawnCandidates = { segments: Array.from({ length: 6 }, (_, i) => line(1000 * i, 0)), decoys: line(0, 3000) };
const state = (seed: number, draws = 0): SpawnerState => ({ seed, draws, paused: false });
const segmentOf = (b: ServerBike) => b.segment;

describe('VehicleSpawner (SPEC §6.2)', () => {
  it('stream() continues the seed sequence from state.draws (restart = same numbers)', () => {
    const r = rng(42);
    const seq = Array.from({ length: 10 }, r);
    const s = state(42);
    const a = stream(s);
    expect(Array.from({ length: 4 }, a)).toEqual(seq.slice(0, 4));
    expect(s.draws).toBe(4);
    const b = stream(JSON.parse(JSON.stringify(s)) as SpawnerState); // persisted, reloaded
    expect(Array.from({ length: 6 }, b)).toEqual(seq.slice(4));
  });

  it('first round: initialPerSegment [0, 1] route bikes per segment, on that segment, none within 120 m of a player', () => {
    const players = [{ team: 't0', x: 0, z: 250 }, { team: 't1', x: 2000, z: 0 }];
    for (let seed = 1; seed <= 200; seed++) {
      const bikes = initialSpawn(cfg, cands, state(seed), players, 0);
      for (let i = 0; i < 6; i++) expect(bikes.filter((b) => b.segment === i).length).toBeLessThanOrEqual(cfg.initialPerSegment[1]!);
      for (const b of bikes) {
        if (b.segment >= 0) expect(b.x).toBe(1000 * b.segment);
        else expect(b.z).toBeGreaterThanOrEqual(3000);
        for (const p of players) expect(Math.hypot(b.x - p.x, b.z - p.z)).toBeGreaterThanOrEqual(cfg.noSpawnNearPlayerMeters);
        expect(b).toMatchObject({ owner: null, rider: false, parked: false, rack: null, y: 0 });
      }
      expect(new Set(bikes.map((b) => b.id)).size).toBe(bikes.length);
    }
  });

  it('decoys ≈ decoyRatio (0.4) of all bikes over 1 000 seeds', () => {
    let decoys = 0, all = 0;
    for (let seed = 1; seed <= 1000; seed++) {
      const bikes = initialSpawn(cfg, cands, state(seed), [], 0);
      decoys += bikes.filter((b) => b.segment === -1).length;
      all += bikes.length;
    }
    expect(decoys / all).toBeGreaterThan(cfg.decoyRatio - 0.03);
    expect(decoys / all).toBeLessThan(cfg.decoyRatio + 0.03);
  });

  it('periodic rounds never put more than maxAvailablePerSegment free street bikes on a segment; racked bikes do not count', () => {
    const s = state(7);
    const bikes: ServerBike[] = [{ ...newBike('r', 0, 0, 0, 0, 0), rack: 'L1', parked: true }]; // at a rack on segment 0
    for (let t = 0; t < 300; t++) {
      bikes.push(...periodicSpawn(cfg, cands, s, bikes, [], t));
      for (let i = 0; i < 6; i++) expect(bikes.filter((b) => b.segment === i && b.rack === null).length).toBeLessThanOrEqual(cfg.maxAvailablePerSegment);
      expect(bikes.filter((b) => b.segment === -1).length).toBeLessThanOrEqual(6 * cfg.maxAvailablePerSegment);
    }
    for (let i = 0; i < 6; i++) expect(bikes.filter((b) => b.segment === i && b.rack === null)).toHaveLength(1); // 30 % / round → full
    // a claimed bike is no longer free: the segment gets a new one
    bikes.find((b) => b.segment === 2)!.owner = 't0';
    let more: ServerBike[] = [];
    for (let t = 0; t < 100 && !more.some((b) => b.segment === 2); t++) more = periodicSpawn(cfg, cands, s, bikes, [], t);
    expect(more.map(segmentOf)).toContain(2);
    expect(periodicSpawn(cfg, cands, { ...s, paused: true }, [], [], 0)).toEqual([]);
  });

  it('same seed + draws → same bikes after a "restart"', () => {
    const a = state(99);
    const first = initialSpawn(cfg, cands, a, [], 0);
    const saved = JSON.stringify(a);
    const next = periodicSpawn(cfg, cands, a, first, [], 1);
    const again = periodicSpawn(cfg, cands, JSON.parse(saved) as SpawnerState, first, [], 1);
    expect(again).toEqual(next);
    expect(initialSpawn(cfg, cands, state(99), [], 0)).toEqual(first);
    expect(initialSpawn(cfg, cands, state(100), [], 0)).not.toEqual(first);
  });
});

describe('claim (SPEC §6.3, §6.5)', () => {
  const bike = (owner: string | null = null) => ({ ...newBike('b1', 10, 10, 0, 0, 0), owner });
  const at = (d: number) => ({ team: 't0', x: 10 + d, z: 10 });

  it('free → ok; another team’s → taken; beyond 3.5 m → far; walk-only route → walkOnly; vanished → gone', () => {
    expect(claim(bike(), 't0', at(2), false)).toEqual({ ok: true });
    expect(claim(bike('t1'), 't0', at(1), false)).toEqual({ ok: false, reason: 'taken' });
    expect(claim(bike(), 't0', at(CLAIM_REACH + 0.1), false)).toEqual({ ok: false, reason: 'far' });
    expect(claim(bike(), 't0', null, false)).toEqual({ ok: false, reason: 'far' });
    const decoy = { ...bike(), segment: -1 };
    expect(claim(decoy, 't0', at(1), false)).toEqual({ ok: false, reason: 'broken' }); // SPEC §17.30
    expect(decoy).toMatchObject({ owner: null, rider: false });
    expect(claim(bike(), 't0', at(1), 'walkOnly')).toEqual({ ok: false, reason: 'walkOnly' });
    expect(claim(bike('t0'), 't0', at(1), 'walkOnly')).toEqual({ ok: false, reason: 'walkOnly' });
    expect(claim(bike('t0'), 't0', at(1), 'finished')).toEqual({ ok: false, reason: 'finished' }); // checked in: a spectator
    expect(claim(undefined, 't0', at(1), false)).toEqual({ ok: false, reason: 'gone' });
  });

  it('the own bike: ridden → ok from anywhere (it follows its rider); standing → within OWN_REACH only', () => {
    expect(claim({ ...bike('t0'), rider: true }, 't0', at(50), false)).toEqual({ ok: true });
    expect(claim(bike('t0'), 't0', at(OWN_REACH - 0.1), false)).toEqual({ ok: true });
    expect(claim(bike('t0'), 't0', at(190), false)).toEqual({ ok: false, reason: 'far' });
    expect(claim(bike('t0'), 't0', null, false)).toEqual({ ok: false, reason: 'far' });
  });
});

describe('abandoned (SPEC §6.3: 200 m for 60 s)', () => {
  it('beyond abandonMeters: 59 s no, 61 s yes; offline owner never; coming back resets the minute', () => {
    const b = { ...newBike('b1', 0, 0, 0, 0, 0), owner: 't0' };
    const far = [{ team: 't0', x: cfg.abandonMeters + 50, z: 0 }];
    const near = [{ team: 't0', x: cfg.abandonMeters - 1, z: 0 }];
    expect(abandoned(cfg, [b], near, 0)).toEqual([]);
    expect(abandoned(cfg, [b], far, 59_000)).toEqual([]);
    expect(abandoned(cfg, [b], far, 61_000)).toEqual(['b1']);
    expect(abandoned(cfg, [b], [], 200_000)).toEqual([]); // owner offline: kept, and the minute restarts
    expect(abandoned(cfg, [b], far, 250_000)).toEqual([]);
    expect(abandoned(cfg, [b], near, 255_000)).toEqual([]);
    expect(abandoned(cfg, [b], far, 300_000)).toEqual([]); // 45 s since the reset
    expect(abandoned(cfg, [b], far, 316_000)).toEqual(['b1']);
  });

  it('ridden or free bikes are never abandoned', () => {
    const ridden = { ...newBike('b1', 0, 0, 0, 0, 0), owner: 't0', rider: true };
    const free = newBike('b2', 0, 0, 0, 0, 0);
    expect(abandoned(cfg, [ridden, free], [{ team: 't0', x: 5000, z: 0 }], 1e9)).toEqual([]);
  });
});
