import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import RAPIER from '@dimforge/rapier3d-compat';
import { GRAPH_VERSION, RoadGraph, type RoadGraphFile, WayFlag } from '@race/shared/graph';
import type { LineLoop } from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { bike as B, bikeTopSpeed, npcRender as R, physics, player as P } from '../config.ts';
import { CharacterController } from '../player/CharacterController.ts';
import type { MoveIntent } from '../player/types.ts';
import { newBike } from '../vehicle/Bikes.ts';
import { CarColliders, carShape, newAutoDensity, nextDensity, Npc, obbCirclePush } from './Npc.ts';
import { loadNpcAssets, type NpcAssets } from './NpcAssets.ts';
import { NpcRoads } from './roads.ts';
import type { CarKind, CarPose, NpcAnchor } from './types.ts';

const DT = physics.fixedDt;
const A = R.autoDensity;

/** Frames of 1 / fps s for `seconds`; the last factor. */
const frames = (a: ReturnType<typeof newAutoDensity>, fps: number, seconds: number) => {
  let f = a.factor;
  for (let t = 0; t < seconds - 1e-9; t += 1 / fps) f = nextDensity(a, 1 / fps);
  return f;
};

describe('nextDensity (automatic NPC density)', () => {
  it(`below ${A.minFps} FPS over ${A.window} s: × ${A.down}, down to the floor ${A.min}`, () => {
    const a = newAutoDensity();
    expect(frames(a, 30, A.window - 0.1)).toBe(1); // not a whole window yet
    expect(frames(a, 30, 0.2)).toBeCloseTo(A.down, 6);
    expect(frames(a, 30, 60)).toBe(A.min);
  });
  it(`≥ ${A.okFps} FPS: + ${A.up} only after ${A.upAfter} s in a row, never above 1; in between: unchanged`, () => {
    const a = newAutoDensity();
    a.factor = 0.5;
    expect(frames(a, 60, A.upAfter - 0.5)).toBe(0.5);
    expect(frames(a, 60, 2 * A.window)).toBeCloseTo(0.5 + A.up, 6);
    expect(frames(a, 50, 30)).toBeCloseTo(0.5 + A.up, 6); // 45 ≤ fps < 57: hold
    expect(frames(a, 60, 600)).toBe(1);
  });
  it('a slow window resets the good streak', () => {
    const a = newAutoDensity();
    a.factor = 0.5;
    frames(a, 60, 4);
    frames(a, 50, A.window);
    expect(frames(a, 60, 4)).toBe(0.5);
  });
});

describe('obbCirclePush (a car footprint shoving a body)', () => {
  // Car at the origin heading north (yaw 0): half width 1 (x), half length 2 (z).
  it('no overlap → 0', () => {
    expect(obbCirclePush(0, 0, 0, 1, 2, 1.31, 0, 0.3, 1)).toEqual([0, 0]);
    expect(obbCirclePush(0, 0, 0, 1, 2, 1.25, 2.25, 0.3, 1)).toEqual([0, 0]); // off the corner, diagonal > r
  });
  it('overlap → out along the side normal by the depth; clamped to max', () => {
    const [x, z] = obbCirclePush(0, 0, 0, 1, 2, 1.2, 0.5, 0.3, 1);
    expect([x, z + 0]).toEqual([expect.closeTo(0.1, 6), 0]);
    const [bx, bz] = obbCirclePush(0, 0, 0, 1, 2, 0.3, -2.1, 0.3, 1); // in front of the nose (−Z)
    expect([bx + 0, bz]).toEqual([0, expect.closeTo(-0.2, 6)]);
    expect(obbCirclePush(0, 0, 0, 1, 2, 1.2, 0.5, 0.3, 0.01)[0]).toBeCloseTo(0.01, 6);
  });
  it('rotated car: heading west (yaw 90°) its right side faces north', () => {
    const [x, z] = obbCirclePush(10, 10, Math.PI / 2, 1, 2, 10, 8.8, 0.3, 1);
    expect(x).toBeCloseTo(0, 6);
    expect(z).toBeCloseTo(-0.1, 6);
  });
  it('centre inside the footprint → out through the nearest side', () => {
    const [x, z] = obbCirclePush(0, 0, 0, 1, 2, -0.8, 1, 0.3, 5);
    expect(x).toBeCloseTo(-0.5, 6); // 0.2 to the left side + r
    expect(z).toBeCloseTo(0, 6);
  });
});

// ── Real Rapier world + the NPC layer on a fixture road (density 0: only the ?npcTest parked cars) ──
beforeAll(() => RAPIER.init());

/** A 400 m residential line along x (z = 0) and one along z (x = 200). */
function fixtureRoads() {
  const CAR = WayFlag.walk | WayFlag.bike | WayFlag.car;
  const file: RoadGraphFile = {
    v: GRAPH_VERSION, nodes: [[-200, 0], [0, 0], [200, 0], [200, -200], [200, 200]].flatMap(([x, z]) => [x! * 10, z! * 10]),
    kinds: ['residential'], names: [],
    ways: [[0, CAR, 0, -1, 0, 0, 0, 1, 2], [0, CAR, 0, -1, 0, 0, 3, 2, 4]],
    junctions: [], crossings: [1], signals: [], bikeParking: [],
  };
  return new NpcRoads(RoadGraph.decode(file), () => 0);
}

let assets: NpcAssets;
beforeAll(async () => void (assets = await loadNpcAssets()));

const anchorAt = (x: number, z: number, o: Partial<NpcAnchor> = {}): NpcAnchor => ({ x, z, viewYaw: 0, body: true, vx: 0, vz: 0, nose: null, waving: false, ...o });
const ahead = (): MoveIntent => ({ forward: 1, right: 0, cameraYaw: 0, slow: false, jump: false });
const idle = (): MoveIntent => ({ forward: 0, right: 0, cameraYaw: 0, slow: false, jump: false });

function scene(test: { kind: CarKind; x: number; z: number; yawDeg: number }[]) {
  const world = new RAPIER.World(physics.gravity);
  world.timestep = DT;
  world.createCollider(RAPIER.ColliderDesc.cuboid(300, 0.5, 300).setTranslation(0, -0.5, 0));
  const npc = new Npc(world, fixtureRoads(), assets, { seed: 1, density: 0, auto: false, zones: [], test });
  const c = new CharacterController(world, { heightAt: () => 0, waterLevel: null, water: undefined });
  /** main.ts order: npc → player → world.step(). */
  const run = (seconds: number, intent: MoveIntent) => {
    for (let i = 0; i < Math.round(seconds / DT); i++) {
      const s = c.state;
      npc.fixedUpdate(DT, anchorAt(s.position.x, s.position.z, { vx: s.velocity.x, vz: s.velocity.z }), c);
      c.fixedUpdate(DT, intent);
      world.step();
    }
  };
  world.step();
  c.spawn(0, 0, 0);
  run(0.5, idle());
  return { world, npc, c, run };
}

describe('Npc on a real Rapier world (stub sims, ?npcTest parked cars)', () => {
  it('start() fills + warms up; parked cars stay put', () => {
    const { npc, world } = scene([{ kind: 'van', x: 5, z: -30, yawDeg: 90 }]);
    npc.start(anchorAt(0, 0));
    expect(npc.started).toBe(true);
    expect(npc.traffic.cars.map((c) => [c.kind, c.x, c.z])).toEqual([['van', 5, -30]]);
    world.free();
  });

  it('setExclusionZones: rings rebuilt, old geometries disposed, one shared material (no leak per call)', () => {
    const { npc, world } = scene([]);
    npc.setExclusionZones([{ x: 0, z: 0, r: 5 }, { x: 20, z: 0, r: 3 }]);
    const first = npc.zoneRings.children.map((o) => o as LineLoop);
    let disposed = 0;
    for (const r of first) r.geometry.addEventListener('dispose', () => void disposed++);
    npc.setExclusionZones([{ x: 5, z: 5, r: 2 }]);
    const [ring] = npc.zoneRings.children as LineLoop[];
    expect([npc.zoneRings.children.length, disposed]).toEqual([1, 2]);
    expect(ring!.material).toBe(first[0]!.material);
    expect(first[1]!.material).toBe(first[0]!.material);
    world.free();
  });

  it('riding at top speed into a parked van crashes the rider; its collider is placed along its heading', () => {
    // Van across the road ahead (heading west): its side (half width 1 m) faces the rider at z = −15 + 1.
    const { npc, c, run, world } = scene([{ kind: 'van', x: 0, z: -15, yawDeg: 90 }]);
    const b = newBike('b', 0, c.state.position.y, 0, 0);
    const drops: boolean[] = [];
    c.onDismount = (_b, crashed) => void drops.push(crashed);
    c.ride(b);
    run(5, ahead());
    expect(npc.colliders.near.length).toBe(1);
    expect(drops).toEqual([true]);
    const hw = carShape(assets.vehicles.get('van')!).hw;
    expect(b.position.z).toBeGreaterThan(-15 + hw);
    expect(b.position.z).toBeLessThan(-15 + hw + 1.5);
    world.free();
  });

  it('walking into a parked car: blocked at its side', () => {
    const { run, c, world } = scene([{ kind: 'sedan', x: 0, z: -6, yawDeg: 90 }]);
    run(4, ahead());
    const hw = carShape(assets.vehicles.get('sedan')!).hw;
    expect(c.state.position.z).toBeGreaterThan(-6 + hw + P.radius - 0.05);
    world.free();
  });

  it(`a car put on the body shoves it out at ≤ push.maxSpeed (${R.push.maxSpeed} m/s)`, () => {
    const { npc, run, c, world } = scene([]);
    const parked = npc.traffic.park('sedan', 0.4, 0, 0); // footprint over the body (KCC started inside: no block)
    const k = carShape(assets.vehicles.get('sedan')!);
    const out = k.hw + P.radius; // body centre must end ≥ this far across from the car's axis
    let last = c.state.position.x, fastest = 0;
    for (let t = 0; t < 3; t += DT) {
      run(DT, idle());
      fastest = Math.max(fastest, Math.abs(c.state.position.x - last) / DT);
      last = c.state.position.x;
    }
    expect(parked.x - c.state.position.x).toBeGreaterThan(out - 0.1);
    expect(fastest).toBeLessThanOrEqual(R.push.maxSpeed * 1.05);
    world.free();
  });

  it('walking into a car that is shoving the body: pushed out, never walks through it (review m7)', () => {
    const { npc, run, c, world } = scene([]);
    const parked = npc.traffic.park('sedan', 0.4, 0, 0); // heading north, overlapping the body on its west side
    const k = carShape(assets.vehicles.get('sedan')!);
    run(3, { ...idle(), right: 1 }); // walk east (into and across the car) at full speed
    expect(c.state.position.x).toBeLessThan(parked.x - k.hw - P.radius + 0.1);
    world.free();
  });

  it('crowd.step knocked > 0 (bike nose hit a pedestrian): crash at ≥ bike.crashImpact, not slower', () => {
    const { npc, c, run, world } = scene([]);
    const drops: boolean[] = [];
    c.onDismount = (_b, crashed) => void drops.push(crashed);
    const hit = npc.crowd.step.bind(npc.crowd);
    npc.crowd.step = (...a) => (hit(...a), { knocked: 1 });
    const b = newBike('b', 0, c.state.position.y, 0, 0);
    c.ride(b);
    run(0.2, { ...ahead(), forward: (0.5 * B.crashImpact) / bikeTopSpeed() }); // < crashImpact
    expect(drops).toEqual([]);
    run(1.5, ahead());
    expect(drops).toEqual([true]);
    world.free();
  });
});

// ── Traffic + Crowd + Npc together on the real road graph at density 1 (review m8) ──
const graphFile = join(import.meta.dirname, '../../../shared/data/roadgraph.json');
describe.skipIf(!existsSync(graphFile))('Npc on roadgraph.json around Concorde, density 1 (Traffic + Crowd + Rapier)', { timeout: 120_000 }, () => {
  it('30 s: cars and pedestrians > 0, no NaN, one light set; riding into a real pedestrian crashes the rider', () => {
    const roads = new NpcRoads(RoadGraph.decode(JSON.parse(readFileSync(graphFile, 'utf8')) as RoadGraphFile), () => 0);
    const world = new RAPIER.World(physics.gravity);
    world.timestep = DT;
    world.createCollider(RAPIER.ColliderDesc.cuboid(2000, 0.5, 2000).setTranslation(0, -0.5, 0));
    const npc = new Npc(world, roads, assets, { seed: 1, density: 1, auto: false, zones: [], test: [] });
    expect(npc.crowd.lights).toBe(npc.traffic.lights);
    const c = new CharacterController(world, { heightAt: () => 0, waterLevel: null, water: undefined });
    world.step();
    c.spawn(87.8, -184.5, 0); // Rue Royale (p3-street)
    /** As Player.npcAnchor: the nose = feet + heading × wheelBase while riding. */
    const anchor = () => {
      const s = c.state, r = c.riding;
      const nose = r ? { x: s.position.x - Math.sin(s.yaw) * B.wheelBase, z: s.position.z - Math.cos(s.yaw) * B.wheelBase } : null;
      return anchorAt(s.position.x, s.position.z, { vx: s.velocity.x, vz: s.velocity.z, nose });
    };
    const step = () => {
      npc.fixedUpdate(DT, anchor(), c);
      c.fixedUpdate(DT, idle());
      world.step();
    };
    npc.start(anchor());
    let bad = 0, minCars = Infinity, minPeds = Infinity;
    for (let i = 0; i < 30 / DT; i++) {
      step();
      for (const p of [...npc.traffic.cars, ...npc.crowd.peds]) if (![p.x, p.y, p.z, p.yaw].every(Number.isFinite)) bad++;
      minCars = Math.min(minCars, npc.traffic.cars.length);
      minPeds = Math.min(minPeds, npc.crowd.peds.length);
    }
    expect(bad).toBe(0);
    expect(minCars).toBeGreaterThan(5);
    expect(minPeds).toBeGreaterThan(5);

    // A walking, un-knocked pedestrian; the bike put so that its nose is on them at top speed.
    const ped = npc.crowd.peds.find((p) => p.activity === 'walk' && p.stagger < 0)!;
    expect(ped).toBeTruthy();
    const drops: boolean[] = [];
    c.onDismount = (_b, crashed) => void drops.push(crashed);
    const b = newBike('b', ped.x, 0, ped.z + B.wheelBase, 0); // heading north: nose = feet − wheelBase along z
    b.speed = bikeTopSpeed();
    c.ride(b);
    step();
    expect(ped.stagger).toBeGreaterThanOrEqual(0); // knocked (staggering)
    expect(drops).toEqual([true]);
    expect(c.state.action).toBe('crash');
    world.free();
  });
});

describe('CarColliders pool', () => {
  it(`≤ maxColliders (${R.maxColliders}) cuboids for the nearest cars within colliderRadius; slots reused, never created`, () => {
    const world = new RAPIER.World(physics.gravity);
    const shapes = new Map([...assets.vehicles].map(([k, t]) => [k, carShape(t)]));
    const pool = new CarColliders(world, shapes);
    const created = world.colliders.len();
    const car = (id: number, x: number): CarPose => ({ id, kind: 'city', paint: 0, x, y: 0, z: 0, yaw: 0, pitch: 0, speed: 0, wheel: 0, braking: false });
    const cars = Array.from({ length: 25 }, (_, i) => car(i, i * 2.5)); // 0 … 60 m
    pool.update(cars, 0, 0);
    expect(pool.near.map((c) => c.id)).toEqual(Array.from({ length: R.maxColliders }, (_, i) => i));
    let on = 0;
    world.forEachCollider((c) => void (on += +c.isEnabled()));
    expect(on).toBe(R.maxColliders);
    pool.update(cars.slice(20), 0, 0); // 50 m +: none within 40 m
    on = 0;
    world.forEachCollider((c) => void (on += +c.isEnabled()));
    expect([pool.near.length, on, world.colliders.len()]).toEqual([0, 0, created]);
    world.free();
  });
});
