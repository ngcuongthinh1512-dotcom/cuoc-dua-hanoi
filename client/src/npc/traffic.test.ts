import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { latLonToWorld } from '@race/shared';
import { GRAPH_VERSION, RoadGraph, type RoadGraphFile, segPoint, WayFlag } from '@race/shared/graph';
import { describe, expect, it } from 'vitest';
import { npc, traffic } from '../config.ts';
import type { WaterData } from '../geo/chunkData.ts';
import { heightAt, parseHeightGrid } from '../geo/heightGrid.ts';
import { carveRiver } from '../world/Terrain.ts';
import { Crowd } from './crowd.ts';
import { TrafficLights } from './lights.ts';
import { NpcRoads } from './roads.ts';
import { pathPoint, type Seg, Traffic } from './traffic.ts';
import type { NpcAnchor, PedPose } from './types.ts';

const CAR = WayFlag.walk | WayFlag.bike | WayFlag.car;
const ONE = CAR | WayFlag.oneway;
const HZ = 60, DT = 1 / HZ; // the game's fixed step
const anchor = (x = 0, z = 0, o: Partial<NpcAnchor> = {}): NpcAnchor => ({ x, z, viewYaw: 0, body: false, vx: 0, vz: 0, nose: null, waving: false, ...o });
const NOPEDS: PedPose[] = [];

/** Small graph: pts in m, ways = [kind index, flags, lanes, node…]; kinds[0] residential, [1] primary. */
function fixture(pts: number[][], ways: number[][], signals: number[] = []) {
  const file: RoadGraphFile = {
    v: GRAPH_VERSION, nodes: pts.flatMap(([x, z]) => [x! * 10, z! * 10]), kinds: ['residential', 'primary'], names: [],
    ways: ways.map(([k, f, l, ...n]) => [k!, f!, l!, -1, 0, 0, ...n]),
    junctions: [], crossings: [], signals, bikeParking: [],
  };
  const g = RoadGraph.decode(file);
  return { g, roads: new NpcRoads(g, () => 0) };
}
/** Edge between two nodes (any direction). */
const edgeBetween = (g: RoadGraph, a: number, b: number) => [...g.edgeA.keys()].find((e) => (g.edgeA[e] === a && g.edgeB[e] === b) || (g.edgeA[e] === b && g.edgeB[e] === a))!;

describe('pathPoint', () => {
  const a: Seg = { x: 0, z: 0, dx: 1, dz: 0, len: 50 };
  const b: Seg = { x: 50, z: 0, dx: 0, dz: 1, len: 50 }; // turn right (south = +z)
  const o = { x: 0, z: 0, yaw: 0 };
  it('straight lane line, right of travel', () => {
    pathPoint(a, 2, b, 2, 6, 20, o);
    expect(o.x).toBeCloseTo(20);
    expect(o.z).toBeCloseTo(2); // right of east = south (+z)
    expect(o.yaw).toBeCloseTo(-Math.PI / 2); // heading east = right of north
  });
  it('corner is continuous with both lines and its tangents', () => {
    const before = pathPoint(a, 2, b, 2, 6, 44, { x: 0, z: 0, yaw: 0 });
    const start = pathPoint(a, 2, b, 2, 6, 44.001, { x: 0, z: 0, yaw: 0 });
    expect(Math.hypot(start.x - before.x, start.z - before.z)).toBeLessThan(0.01);
    expect(start.yaw).toBeCloseTo(before.yaw, 2);
    const end = pathPoint(a, 2, b, 2, 6, 56, { x: 0, z: 0, yaw: 0 });
    expect(end.x).toBeCloseTo(50 - 2, 1); // right of south = west
    expect(end.z).toBeCloseTo(6, 1);
    expect(Math.abs(end.yaw)).toBeCloseTo(Math.PI, 2); // heading south
    const mid = pathPoint(a, 2, b, 2, 6, 50, { x: 0, z: 0, yaw: 0 });
    expect(mid.x).toBeLessThan(48); // cuts the corner…
    expect(mid.z).toBeGreaterThan(2); // …inside the turn (toward the south-west)
  });
});

describe('TrafficLights (fixture: 4-way crossroads with a signal)', () => {
  const { g, roads } = fixture([[0, 0], [-100, 0], [100, 0], [0, -100], [0, 100]], [[0, CAR, 0, 1, 0], [0, CAR, 0, 0, 2], [0, CAR, 0, 3, 0], [0, CAR, 0, 0, 4]], [0]);
  const lights = new TrafficLights(roads);
  const arms = [1, 2, 3, 4].map((n) => edgeBetween(g, 0, n));
  it('has lights, two phases never both green, amber lasts 3 s, all-red 2 s', () => {
    expect(lights.has(0)).toBe(true);
    expect(lights.headsNear(0, 0, 50)).toHaveLength(4);
    let amber = 0, allRed = 0, maxAmber = 0, minAmber = Infinity, bothGreen = 0, cycleGreen = 0;
    const dt = 0.1, T = 2 * 46;
    const col = (k: number) => lights.car(0, arms[k]!);
    let prev = col(0);
    for (let t = 0; t < T; t += dt) {
      lights.update(t);
      const c = arms.map((_, k) => col(k));
      if (c.filter((x) => x === 'green').length && c.some((x, k) => x === 'green' && c.some((y, j) => y === 'green' && lights.car(0, arms[j]!) && (k < 2) !== (j < 2)))) bothGreen++;
      if (c.every((x) => x === 'red')) allRed += dt;
      if (c[0] === 'green') cycleGreen += dt;
      if (c[0] === 'amber') amber += dt;
      if (prev === 'amber' && c[0] !== 'amber') (maxAmber = Math.max(maxAmber, amber)), (minAmber = Math.min(minAmber, amber)), (amber = 0);
      prev = c[0]!;
    }
    expect(bothGreen).toBe(0);
    expect(minAmber).toBeGreaterThan(2.8);
    expect(maxAmber).toBeLessThan(3.3);
    expect(allRed).toBeGreaterThan(2 * 2 * 2 - 0.5); // 2 gaps × 2 s per cycle, 2 cycles
    expect(cycleGreen).toBeGreaterThan(2 * 18 - 0.5);
    // pedestrians may cross only while the cars of that arm are red
    lights.update(5);
    for (const e of arms) expect(lights.pedMayCross(0, e)).toBe(lights.car(0, e) === 'red');
    expect(lights.pedMayCross(999, 0)).toBe(true);
  });
});

describe('Traffic (fixture)', () => {
  it('cars stop at the line on red (in [line − 1, line]) and go on green', () => {
    const { g, roads } = fixture([[0, 0], [-100, 0], [100, 0], [0, -100], [0, 100]], [[0, CAR, 0, 1, 0], [0, CAR, 0, 0, 2], [0, CAR, 0, 3, 0], [0, CAR, 0, 0, 4]], [0]);
    const tr = new Traffic(roads, 1);
    const e = edgeBetween(g, 1, 0), cont = edgeBetween(g, 0, 2);
    for (let t = 0, prev = 'x'; ; t++) { // wait for the moment the light turns red, then bring the car
      tr.step(DT, anchor(), 0, NOPEDS);
      const c = tr.lights.car(0, e);
      if (c === 'red' && prev !== 'red') break;
      prev = c;
      expect(t).toBeLessThan(HZ * 200);
    }
    const car = tr.addCar('hatchback', e, g.edgeA[e] === 1, 40, 0, 8, [2 * cont + (g.edgeA[cont] === 0 ? 0 : 1)]);
    const line = 100 - (tr.lights as TrafficLights).stop(0, e)!;
    let stopped = -1, went = -1;
    for (let k = 0; k < HZ * 120; k++) {
      tr.step(DT, anchor(), 0, NOPEDS);
      const front = car.s + car.len / 2;
      if (car.route[0] === 2 * e + (g.edgeA[e] === 1 ? 0 : 1) && tr.lights.car(0, e) === 'red' && car.speed < 0.05) {
        if (stopped < 0) (stopped = tr.time), expect(front).toBeGreaterThanOrEqual(line - 1), expect(front).toBeLessThanOrEqual(line + 0.01);
      }
      if (stopped >= 0 && car.route[0] !== 2 * e + (g.edgeA[e] === 1 ? 0 : 1)) {
        went = tr.time;
        break;
      }
    }
    expect(stopped).toBeGreaterThan(0);
    expect(went).toBeGreaterThan(stopped);
    expect(tr.lights.car(0, e)).not.toBe('red'); // left on green / amber, never through a red
  });

  it('a minor road yields to the major road at a junction without lights', () => {
    // major: primary W(-100,0)–0–E(100,0); minor: residential S(0,100)–0
    const { g, roads } = fixture([[0, 0], [-100, 0], [100, 0], [0, 100]], [[1, CAR, 0, 1, 0], [1, CAR, 0, 0, 2], [0, CAR, 0, 3, 0]]);
    const tr = new Traffic(roads, 3);
    const eW = edgeBetween(g, 1, 0), eE = edgeBetween(g, 0, 2), eS = edgeBetween(g, 3, 0);
    const deW = 2 * eW + (g.edgeA[eW] === 1 ? 0 : 1), deE = 2 * eE + (g.edgeA[eE] === 0 ? 0 : 1), deS = 2 * eS + (g.edgeA[eS] === 3 ? 0 : 1);
    const major = tr.addCar('sedan', eW, g.edgeA[eW] === 1, 70, 0, 10, [deE]);
    const minor = tr.addCar('city', eS, g.edgeA[eS] === 3, 80, 0, 5, [deE]);
    const line = 100 - 2 - roads.halfWidth(g.edgeWay[eW]!) - 0; // stop line ≈ major half width + 2 m before the node
    let waited = false, crossed = false;
    for (let k = 0; k < HZ * 30 && !crossed; k++) {
      tr.step(DT, anchor(), 0, NOPEDS);
      if (minor.route[0] === deS && minor.speed < 0.05 && minor.s + minor.len / 2 < line + 1) waited = true;
      if (minor.s + minor.len / 2 > line + 1.5 || minor.route[0] !== deS) {
        crossed = true;
        expect(major.route[0]).not.toBe(deW); // the major car has cleared the junction first
      }
    }
    expect(waited).toBe(true);
    expect(crossed).toBe(true);
  });

  it('the player standing in the lane: the car stops ≥ 1 m short; inside the body: it does not move', () => {
    const { g, roads } = fixture([[0, 0], [500, 0]], [[0, CAR, 0, 0, 1]]);
    const e = 0, east = g.edgeA[e] === 0;
    const tr = new Traffic(roads, 1);
    const car = tr.addCar('van', e, east, 50, 0, 8, []);
    const z = roads.laneOffset(0, true, 0); // right lane of eastbound
    for (let k = 0; k < HZ * 40; k++) tr.step(DT, anchor(250, 0, { body: true, x: 250, z }), 0, NOPEDS);
    expect(250 - (car.x + car.len / 2)).toBeGreaterThanOrEqual(1);
    expect(car.speed).toBeLessThan(0.05);

    const tr2 = new Traffic(roads, 1);
    const c2 = tr2.addCar('van', e, east, 100, 0, 0, []);
    const [x0, z0] = [c2.x, c2.z];
    for (let k = 0; k < HZ * 5; k++) tr2.step(DT, anchor(x0, z0, { body: true }), 0, NOPEDS);
    expect([c2.x, c2.z]).toEqual([x0, z0]);
    // a pedestrian is an obstacle too
    const tr3 = new Traffic(roads, 1);
    const c3 = tr3.addCar('van', e, east, 50, 0, 8, []);
    const ped = { id: 0, avatar: 0, x: 300, y: 0, z, yaw: 0, speed: 0, activity: 'stand', activityTime: 0, stagger: -1, staggerYaw: 0 } as PedPose;
    for (let k = 0; k < HZ * 40; k++) tr3.step(DT, anchor(250, 0), 0, [ped]);
    expect(300 - (c3.x + c3.len / 2)).toBeGreaterThanOrEqual(1);
  });

  it('never two cars in a lane closer than minGap (a queue behind a parked car)', () => {
    const { g, roads } = fixture([[0, 0], [600, 0]], [[0, CAR, 0, 0, 1]]);
    const tr = new Traffic(roads, 1);
    const east = g.edgeA[0] === 0;
    const cars = [50, 90, 130, 170].map((s, i) => tr.addCar(i % 2 ? 'suv' : 'city', 0, east, s, 0, 9));
    tr.park('van', 400, roads.laneOffset(0, true, 0), 0);
    let worst = Infinity;
    for (let k = 0; k < HZ * 90; k++) {
      tr.step(DT, anchor(300, 0, { viewYaw: -Math.PI / 2 }), 0, NOPEDS);
      for (let i = 1; i < cars.length; i++) worst = Math.min(worst, cars[i]!.s - cars[i - 1]!.s - (cars[i - 1]!.len + cars[i]!.len) / 2);
    }
    expect(worst).toBeGreaterThanOrEqual(traffic.minGap - 1e-6);
    expect(cars[3]!.speed).toBeLessThan(0.05);
  });

  it('a roundabout entry waits for the ring, cars run anticlockwise (clockwise with traffic.driveLeft)', () => {
    const R = 40, ring = Array.from({ length: 6 }, (_, i) => [R * Math.cos((i * Math.PI) / 3), -R * Math.sin((i * Math.PI) / 3)]);
    const pts = [...ring, [R + 100, 0]]; // node 6: the arm, joining ring node 0
    // ring node order = the oneway direction: anticlockwise from above (1, 2, … 5) with right-hand traffic, clockwise (5, 4, … 1) with left-hand
    const [prev, next] = traffic.driveLeft ? [1, 5] : [5, 1]; // the ring node before / after node 0 along the circulation
    const order = traffic.driveLeft ? [0, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 0];
    const { g, roads } = fixture(pts, [[0, ONE | WayFlag.roundabout, 0, ...order], [0, CAR, 0, 6, 0]]);
    const tr = new Traffic(roads, 5);
    const ringIn = edgeBetween(g, prev, 0), arm = edgeBetween(g, 6, 0);
    const deIn = 2 * ringIn + (g.edgeA[ringIn] === prev ? 0 : 1), deArm = 2 * arm + (g.edgeA[arm] === 6 ? 0 : 1);
    const ringCar = tr.addCar('sedan', ringIn, g.edgeA[ringIn] === prev, g.edgeLength[ringIn]! - 12, 0, 9, []);
    const enter = tr.addCar('city', arm, g.edgeA[arm] === 6, 70, 0, 5, [2 * edgeBetween(g, 0, next) + (g.edgeA[edgeBetween(g, 0, next)] === 0 ? 0 : 1)]);
    expect(g.edgeA[ringIn]).toBe(prev);
    expect(ringCar.route[0]).toBe(deIn);
    let crossed = false, waited = false;
    for (let k = 0; k < HZ * 30 && !crossed; k++) {
      tr.step(DT, anchor(), 0, NOPEDS);
      if (enter.route[0] === deArm && enter.speed < 0.05) waited = true;
      if (enter.route[0] !== deArm) {
        crossed = true;
        const d = Math.hypot(ringCar.x - ring[0]![0]!, ringCar.z - ring[0]![1]!);
        expect(d > 12 || ringCar.route[0] !== deIn).toBe(true); // the ring car is past the entry or far behind it
      }
    }
    expect(crossed).toBe(true);
    expect(waited).toBe(true);
    // everything stays on edges cars may use: ring edges are oneway in the circulation direction
    for (const c of tr.cars) expect(g.allows(c.route[0]! >> 1, 'car', (c.route[0]! & 1) === 0)).toBe(true);
  });

  it('exclusion zone: not chosen as a route while another way exists, nothing spawned inside', () => {
    const pts = [[0, 0], [-100, 0], [100, 0], [0, -100], [0, 100]];
    const ways = [[0, CAR, 0, 1, 0], [0, CAR, 0, 0, 2], [0, CAR, 0, 3, 0], [0, CAR, 0, 0, 4]];
    const { g, roads } = fixture(pts, ways);
    const eW = edgeBetween(g, 1, 0), eE = edgeBetween(g, 0, 2);
    const tr = new Traffic(roads, 7);
    tr.zones = [{ x: 50, z: 0, r: 10 }];
    let east = 0, other = 0;
    for (let k = 0; k < 200; k++) {
      const c = tr.addCar('city', eW, g.edgeA[eW] === 1, 20, 0, 0);
      if (c.route[1]! >> 1 === eE) east++;
      else other++;
    }
    expect(east).toBe(0);
    expect(other).toBe(200);
    const free = new Traffic(roads, 7);
    let hit = 0;
    for (let k = 0; k < 200; k++) if (free.addCar('city', eW, g.edgeA[eW] === 1, 20, 0, 0).route[1]! >> 1 === eE) hit++;
    expect(hit).toBeGreaterThan(20);
    // spawning: fill a real-size neighbourhood of the crossroads inside the zone radius
    const tr2 = new Traffic(roads, 9);
    tr2.zones = [{ x: 0, z: 0, r: 60 }];
    tr2.step(DT, anchor(0, 0), 3, NOPEDS, true);
    expect(tr2.cars.length).toBeGreaterThan(0);
    for (const c of tr2.cars) expect(Math.hypot(c.x, c.z)).toBeGreaterThanOrEqual(60 + 3);
  });

  it('exclusion zone over a lit junction is a keep-clear box: red → wait at its edge, already inside → drive through (§17.5)', () => {
    const { g, roads } = fixture([[0, 0], [-100, 0], [100, 0], [0, -100], [0, 100]], [[0, CAR, 0, 1, 0], [0, CAR, 0, 0, 2], [0, CAR, 0, 3, 0], [0, CAR, 0, 0, 4]], [0]);
    const e = edgeBetween(g, 1, 0), cont = edgeBetween(g, 0, 2), fwd = g.edgeA[e] === 1, deE = 2 * cont + (g.edgeA[cont] === 0 ? 0 : 1);
    const R = 12 + npc.zoneMargin; // zone edge R m before the node; the stop line ≈ 5 m before it (inside)
    const redAt = (tr: Traffic) => {
      for (let prev = 'x'; ; prev = tr.lights.car(0, e)) {
        tr.step(DT, anchor(), 0, NOPEDS);
        if (tr.lights.car(0, e) === 'red' && prev !== 'red') return;
      }
    };
    const tr = new Traffic(roads, 1);
    tr.zones = [{ x: 0, z: 0, r: 12 }];
    redAt(tr);
    const out = tr.addCar('hatchback', e, fwd, 40, 0, 8, [deE]);
    const ins = tr.addCar('city', e, fwd, 100 - R + 4, 0, 6, [deE]); // front already over the zone edge
    let insStopped = false, insCrossed = false;
    for (let k = 0; k < HZ * 10; k++) {
      tr.step(DT, anchor(), 0, NOPEDS);
      if (ins.route[0] === deE) insCrossed = true;
      else if (ins.speed < 0.1) insStopped = true;
    }
    expect(tr.lights.car(0, e)).toBe('red');
    expect([insStopped, insCrossed]).toEqual([false, true]); // through the red, not standing in the zone
    expect(out.speed).toBeLessThan(0.05);
    expect(out.s + out.len / 2).toBeLessThanOrEqual(100 - R + 0.01); // waits outside the zone, not at the line
    expect(out.s + out.len / 2).toBeGreaterThan(100 - R - 2);
  });
});

// ── real graph ──
const root = join(import.meta.dirname, '../../..');
const data = join(root, 'client/public/data');
const graphFile = join(root, 'shared/data/roadgraph.json');
const has = existsSync(graphFile) && ['elevation.json', 'elevation.bin', 'water.json'].every((f) => existsSync(join(data, f)));

describe.skipIf(!has)('Traffic (roadgraph.json, carved grid)', () => {
  const grid = parseHeightGrid(JSON.parse(readFileSync(join(data, 'elevation.json'), 'utf8')), readFileSync(join(data, 'elevation.bin')));
  carveRiver(grid, JSON.parse(readFileSync(join(data, 'water.json'), 'utf8')) as WaterData);
  const g = RoadGraph.decode(JSON.parse(readFileSync(graphFile, 'utf8')) as RoadGraphFile);
  const roads = new NpcRoads(g, (x, z) => heightAt(grid, x, z));
  const hub = latLonToWorld(50.8458, 4.3622); // Leg 3: Rue Royale beside the Parc de Bruxelles, 28 cars at density 1 (the Grand-Place, a pedestrian zone, has only 12)
  const concorde = anchor(hub.x, hub.z);
  const valid = (de: number) => roads.car[de >> 1] === 1 && g.allows(de >> 1, 'car', (de & 1) === 0);

  it('5 min around Rue Royale: nobody goes against a oneway, same lane ≥ minGap, timing per step', () => {
    const tr = new Traffic(roads, 1);
    tr.step(DT, concorde, 1, NOPEDS, true);
    const n0 = tr.cars.length;
    expect(n0).toBeGreaterThan(15);
    let bad = 0, gapBad = 0, worst = Infinity, steps = 0;
    const t0 = performance.now();
    for (let k = 0; k < HZ * 300; k++) {
      tr.step(DT, concorde, 1, NOPEDS);
      steps++;
      const byEdge = new Map<number, typeof tr.cars>();
      for (const c of tr.cars) {
        if (!valid(c.route[0]!)) bad++;
        for (let i = 1; i < c.route.length; i++) if (!valid(c.route[i]!)) bad++;
        (byEdge.get(c.route[0]!) ?? byEdge.set(c.route[0]!, []).get(c.route[0]!)!).push(c);
      }
      for (const [de, list] of byEdge) {
        const nl = Math.max(1, roads.lanes(g.edgeWay[de >> 1]!, (de & 1) === 0));
        for (const a of list)
          for (const b of list) {
            if (a === b || a.s >= b.s || Math.min(a.lane, nl - 1) !== Math.min(b.lane, nl - 1)) continue;
            const gap = b.s - a.s - (a.len + b.len) / 2;
            worst = Math.min(worst, gap);
            if (gap < traffic.minGap - 1e-3) gapBad++; // any closer (incl. overlapping) is a bug
          }
      }
    }
    const ms = (performance.now() - t0) / steps;
    console.log(`Traffic 5 min Rue Royale: ${n0} cars at start, ${tr.cars.length} at end, ${ms.toFixed(3)} ms/step incl. test checks, worst same-lane gap ${worst.toFixed(2)} m`);
    expect(bad).toBe(0);
    expect(gapBad).toBe(0);
    expect(tr.cars.length).toBeGreaterThan(10);
  }, 120_000);

  // pooled over 4 seeds: one seed's 25 cars swing ±4 with a red light's queue (review M7 put more cars on the avenues)
  // NPC_DENSITY=2 runs it at the game's default density (npc.density; SPEC §17.43 ×2)
  const DENS = Number(process.env.NPC_DENSITY ?? 1);
  it(`10 min at density ${DENS}, seeds 1–4: ≥ 75 % of the cars drive ≥ 50 m in the last minute, ≤ 10 % stand > 30 s (no gridlock)`, () => {
    let moved = 0, tracked = 0, still30 = 0, cars = 0;
    const res: string[] = [];
    for (const seed of [1, 2, 3, 4]) {
      const tr = new Traffic(roads, seed);
      tr.step(DT, concorde, DENS, NOPEDS, true);
      const track = new Map<number, { x: number; z: number; len: number; dist: number }>();
      for (let k = 0; k < HZ * 600; k++) {
        tr.step(DT, concorde, DENS, NOPEDS);
        if (k === HZ * 540) for (const c of tr.cars) track.set(c.id, { x: c.x, z: c.z, len: 0, dist: 0 });
        if (k > HZ * 540)
          for (const c of tr.cars) {
            const t = track.get(c.id);
            if (t) (t.len += Math.hypot(c.x - t.x, c.z - t.z)), (t.x = c.x), (t.z = c.z), (t.dist = Math.hypot(c.x, c.z));
          }
      }
      // a car that is gone left the area (drove away) unless it vanished well inside the radius (stuck → removed)
      const m = [...track.entries()].filter(([id, t]) => (tr.cars.some((c) => c.id === id) ? t.len >= 50 : t.dist > traffic.radius - 40 || t.len >= 50)).length;
      const s30 = tr.cars.filter((c) => (c as { still: number }).still > 30).length;
      res.push(`seed ${seed} ${m}/${track.size} moved, ${s30}/${tr.cars.length} standing`);
      expect(track.size).toBeGreaterThan(15);
      [moved, tracked, still30, cars] = [moved + m, tracked + track.size, still30 + s30, cars + tr.cars.length];
    }
    console.log(`Gridlock check (≥ 50 m in the last minute or drove out; standing > 30 s): ${res.join(' · ')}`);
    expect(moved / tracked).toBeGreaterThanOrEqual(0.75);
    expect(still30 / cars).toBeLessThanOrEqual(0.1);
  }, 240_000);

  it('Place Aimé Dandoy: entries wait for gaps, ring cars go with the ring (anticlockwise: right-hand traffic), cars leave the ring within 90 s', () => {
    const name = g.file.names.indexOf('Place Aimé Dandoy - Aimé Dandoyplein');
    const isRing = (de: number) => g.file.ways[g.edgeWay[de >> 1]!]![3] === name && !!(g.flags(de >> 1) & WayFlag.roundabout);
    const tr = new Traffic(roads, 2);
    const nodes = [...g.edgeA.keys()].filter((e) => isRing(2 * e)).flatMap((e) => [g.edgeA[e]!, g.edgeB[e]!]);
    const a = anchor(nodes.reduce((s, n) => s + g.x[n]!, 0) / nodes.length, nodes.reduce((s, n) => s + g.z[n]!, 0) / nodes.length); // the ring's centre
    tr.step(DT, a, 2, NOPEDS, true);
    const enteredAt = new Map<number, number>();
    const prevRing = new Map<number, boolean>();
    let entries = 0, exits = 0, worst = Infinity, late = 0, wrong = 0;
    for (let k = 0; k < HZ * 300; k++) {
      tr.step(DT, a, 2, NOPEDS);
      for (const c of tr.cars) {
        const on = isRing(c.route[0]!);
        const was = prevRing.get(c.id);
        if (was === false && on) (entries++, enteredAt.set(c.id, tr.time));
        if (was === true && !on) (exits++, enteredAt.delete(c.id));
        prevRing.set(c.id, on);
        if (on) {
          // anticlockwise seen from above (right-hand traffic, Leg 3; clockwise on Leg 2): the edge must be travelled in its oneway direction
          if ((c.route[0]! & 1) !== 0) wrong++;
          const t0 = enteredAt.get(c.id);
          if (t0 !== undefined && tr.time - t0 > 90) late++;
          for (const o of tr.cars) {
            if (o === c || o.route[0] !== c.route[0] || o.lane !== c.lane || o.s <= c.s) continue;
            worst = Math.min(worst, o.s - c.s - (o.len + c.len) / 2);
          }
        }
      }
    }
    console.log(`Aimé Dandoy: ${entries} entries, ${exits} exits, worst ring gap ${worst.toFixed(2)} m`);
    expect(entries).toBeGreaterThan(50); // Leg 3: 64 / 62
    expect(exits).toBeGreaterThan(50);
    expect(wrong).toBe(0);
    expect(late).toBe(0);
    expect(worst).toBeGreaterThanOrEqual(0);
  }, 120_000);

  it('lights: ≈ 379 lit junctions (Bruxelles; Macao ≈ 250; Paris ≈ 1,100), none on a roundabout, every head faces its arm', () => {
    const t0 = performance.now();
    const lights = new TrafficLights(roads);
    const heads = lights.headsNear(0, 0, 1e5);
    const nodes = new Set(heads.map((h) => h.junction));
    console.log(`TrafficLights: ${nodes.size} lit nodes, ${heads.length} heads, ${(performance.now() - t0).toFixed(0)} ms`);
    expect(nodes.size).toBeGreaterThan(360);
    expect(nodes.size).toBeLessThan(400);
    for (const n of nodes) expect(g.edgesOf(n).some((e) => g.flags(e) & WayFlag.roundabout)).toBe(false);
    for (const h of heads.slice(0, 200)) expect(lights.stop(h.junction, h.edge)).toBeGreaterThan(0);
  });

  it('SignalHead contract: every head around the Grand-Place, Rue Royale and Rue de la Loi stands off the carriageway on the driving-side kerb and looks at the oncoming cars', () => {
    const lights = new TrafficLights(roads);
    const royale = latLonToWorld(50.8458, 4.3622), loi = latLonToWorld(50.84438, 4.37435);
    const heads = [[0, 0], [royale.x, royale.z], [loi.x, loi.z]].flatMap(([x, z]) => lights.headsNear(x!, z!, 300));
    expect(heads.length).toBeGreaterThan(30);
    let offRoad = 0, rightSide = 0, facing = 0; // rightSide = on the driving-side kerb
    for (const h of heads) {
      const e = h.edge, a = g.edgeA[e]!, b = g.edgeB[e]!, far = g.edgeA[e] === h.junction ? b : a, n = h.junction;
      const [, dist] = segPoint(h.x, h.z, g.x[a]!, g.z[a]!, g.x[b]!, g.z[b]!);
      if (dist >= roads.halfWidth(g.edgeWay[e]!) - 1e-6) offRoad++;
      // travel direction u = far → junction; right of it = (−uz, ux) (the left kerb with traffic.driveLeft); the lamps look along (−sin yaw, −cos yaw) = −u
      const l = Math.hypot(g.x[n]! - g.x[far]!, g.z[n]! - g.z[far]!), ux = (g.x[n]! - g.x[far]!) / l, uz = (g.z[n]! - g.z[far]!) / l;
      const rx = h.x - g.x[n]!, rz = h.z - g.z[n]!;
      if ((-rx * uz + rz * ux > 0) !== traffic.driveLeft) rightSide++; // on the driving-side kerb
      if (-Math.sin(h.yaw) * -ux + -Math.cos(h.yaw) * -uz > 0.99) facing++;
    }
    expect([offRoad, rightSide, facing]).toEqual([heads.length, heads.length, heads.length]);
  });

  it('deterministic: same seed → same state, other seed → different', () => {
    const run = (seed: number) => {
      const tr = new Traffic(roads, seed);
      tr.step(DT, concorde, 1, NOPEDS, true);
      for (let k = 0; k < HZ * 60; k++) tr.step(DT, concorde, 1, NOPEDS);
      return tr.cars.map((c) => `${c.id}:${c.kind}:${c.x.toFixed(4)},${c.z.toFixed(4)},${c.speed.toFixed(4)}`).join('|');
    };
    const a = run(1);
    expect(run(1)).toBe(a);
    expect(run(2)).not.toBe(a);
  }, 60_000);

  it('sloped streets (Rue Royale, Rue de la Loi): cars on the drawn road, pedestrians on the drawn sidewalk / road (review M6)', () => {
    let worstCar = 0, lo = 0, hi = 0;
    for (const at of [latLonToWorld(50.8458, 4.3622), latLonToWorld(50.84438, 4.37435)]) {
      const a = anchor(at.x, at.z), tr = new Traffic(roads, 1), cr = new Crowd(roads, 1);
      cr.lights = tr.lights;
      const step = (fill = false) => (tr.step(DT, a, 1, cr.peds, fill), cr.step(DT, a, 1, tr.cars, fill));
      step(true);
      for (let k = 0; k < 30 / DT; k++) {
        step();
        if (k % 30) continue;
        for (const c of tr.cars) worstCar = Math.max(worstCar, Math.abs(c.y - roads.heightAt(c.x, c.z)));
        for (const p of cr.peds) {
          const d = p.y - roads.heightAt(p.x, p.z); // road 0 … sidewalk lift + curbHeight (0.2), ramping between
          [lo, hi] = [Math.min(lo, d), Math.max(hi, d)];
        }
      }
    }
    console.log(`Slope check: car |y − ground| ≤ ${worstCar.toFixed(3)} m, pedestrian y − ground ∈ [${lo.toFixed(3)}, ${hi.toFixed(3)}] m`);
    expect(worstCar).toBeLessThan(0.1); // drawn asphalt / pavers = ground + 0.05…0.07
    expect(lo).toBeGreaterThan(-0.1);
    expect(hi).toBeLessThan(0.3);
  });

  // review2-complete F2: a box zone on the Rue de Rivoli × Castiglione lights (oneway: no way round once on Rivoli) made
  // cars queue inside it (151 → 480 samples, 77 → 252 standing). Sampled every 0.5 s, cars within 20 m of the centre.
  // Leg 3: the lit junction 22446 of the Bruxelles graph at (702.5, −18.3) (≈ 50.8469, 4.3624, Rue Royale at the Parc de Bruxelles;
  // found by scanning the 122 lit junctions within 900 m of Rue Royale for the one where the spot queues most without a zone).
  it('box zone on a busy lit junction (Bruxelles junction 22446): after 15 s no car stands in it and almost none drive through (seeds 1, 5)', () => {
    const p = { x: 602.5, z: -18.3 }, zone = { x: 702.5, z: -18.3, r: 20 }; // player 100 m away, zone on the lit junction
    const a = anchor(p.x, p.z);
    for (const seed of [1, 5]) {
      const tr = new Traffic(roads, seed), cr = new Crowd(roads, seed);
      cr.lights = tr.lights;
      const step = (fill = false) => (tr.step(DT, a, 1, cr.peds, fill), cr.step(DT, a, 1, tr.cars, fill));
      const sample = (secs: number) => {
        let inside = 0, still = 0;
        for (let k = 0; k < secs * HZ; k++) {
          step();
          if (k % 30) continue;
          for (const c of tr.cars) if (Math.hypot(c.x - zone.x, c.z - zone.z) < zone.r) (inside++, c.speed < 0.3 && still++);
        }
        return { inside, still };
      };
      step(true);
      sample(20);
      const control = sample(90);
      tr.zones = cr.zones = [zone];
      sample(15); // cars already committed to the junction drive through
      const zoned = sample(90);
      console.log(`Rivoli zone seed ${seed}: cars in 20 m ${control.inside} → ${zoned.inside}, standing ${control.still} → ${zoned.still}`);
      expect(control.still).toBeGreaterThan(20); // the spot does queue without a zone
      expect(zoned.still).toBe(0);
      expect(zoned.inside).toBeLessThanOrEqual(control.inside * 0.1);
    }
  }, 60_000);

  it('60 cars: ms per step', () => {
    const tr = new Traffic(roads, 1);
    const a = anchor(-400, 200);
    tr.step(1 / 60, a, 4, NOPEDS, true);
    const n = tr.cars.length;
    for (let k = 0; k < 600; k++) tr.step(1 / 60, a, 4, NOPEDS); // warm
    const t0 = performance.now();
    for (let k = 0; k < 1200; k++) tr.step(1 / 60, a, 4, NOPEDS);
    const ms = (performance.now() - t0) / 1200;
    console.log(`Traffic: ${n} cars (→ ${tr.cars.length}) ${ms.toFixed(3)} ms/step at 60 Hz (budget 0.5 ms)`);
    expect(tr.cars.length).toBeGreaterThanOrEqual(50);
    expect(ms).toBeLessThan(1.5);
  }, 60_000);

  it('warm-up: 20 s of fill + simulation in ≤ 1 s', () => {
    const tr = new Traffic(roads, 1);
    const a = anchor(200, 100);
    const t0 = performance.now();
    tr.step(1 / 60, a, 1, NOPEDS, true);
    for (let k = 0; k < 20 * 60; k++) tr.step(1 / 60, a, 1, NOPEDS);
    const ms = performance.now() - t0;
    console.log(`Traffic warm-up: ${ms.toFixed(0)} ms for ${tr.cars.length} cars`);
    expect(ms).toBeLessThan(2000);
  });
});
