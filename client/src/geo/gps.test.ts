// Phase 5 track B: GPS on the real shared/data/roadgraph.json (skipped when the data is missing).
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { latLonToWorld } from '@race/shared';
import { RoadGraph, type RoadGraphFile, WayFlag, shortestPath } from '@race/shared/graph';
import { describe, expect, it } from 'vitest';
import { gps as cfg, playerSetup } from '../config.ts';
import { Gps } from './gps.ts';

const file = join(import.meta.dirname, '../../../shared/data/roadgraph.json');
type P = { x: number; z: number };
const at = (lat: number, lon: number): P => latLonToWorld(lat, lon);

describe.skipIf(!existsSync(file))('Gps (roadgraph.json)', () => {
  const g = RoadGraph.decode(JSON.parse(readFileSync(file, 'utf8')) as RoadGraphFile);
  const spawn: P = playerSetup.spawn;
  // Leg 3 (Hà Nội): the spawn is 14 m from the origin towards hồ Hoàn Kiếm. Leg 2b (Brussels): Grand-Place…; Leg 2 (Macao): Largo do Senado…; Leg 1 (Paris): Opéra, Louvre, Eiffel…
  const PLACES = {
    nhatho: at(21.0287, 105.8489), nhahat: at(21.024, 105.8572), vanmieu: at(21.029, 105.836), thienquang: at(21.0187, 105.8436),
    thongnhat: at(21.0125, 105.8465), bachkhoa: at(21.0055, 105.843), dongxuan: at(21.0381, 105.8497), godongda: at(21.012, 105.8273),
  };
  const straight = (a: P, b: P) => Math.hypot(a.x - b.x, a.z - b.z);
  const len = (r: ArrayLike<number>) => { let s = 0; for (let i = 2; i < r.length; i += 2) s += Math.hypot(r[i]! - r[i - 2]!, r[i + 1]! - r[i - 1]!); return s; };
  /** A Gps that has searched once from `a` to `b`. */
  const search = (a: P, b: P, mode: 'walk' | 'bike' = 'walk') => {
    const p = new Gps(g);
    p.setTarget(b.x, b.z);
    p.update(a.x, a.z, mode, 0);
    return p;
  };
  /** Point `s` m along a polyline, with the unit direction there. */
  const along = (r: ArrayLike<number>, s: number): [number, number, number, number] => {
    for (let i = 2; i < r.length; i += 2) {
      const l = Math.hypot(r[i]! - r[i - 2]!, r[i + 1]! - r[i - 1]!);
      if (s <= l || i === r.length - 2) {
        const [dx, dz] = [(r[i]! - r[i - 2]!) / l, (r[i + 1]! - r[i - 1]!) / l];
        return [r[i - 2]! + dx * s, r[i - 1]! + dz * s, dx, dz];
      }
      s -= l;
    }
    throw new Error('empty polyline');
  };
  /** Graph edges a route (feet, nodes…, target) follows between its nodes: per segment, every edge joining the two nodes. */
  const follows = (r: ArrayLike<number>) => {
    const out: number[][] = [];
    for (let i = 2; i + 4 <= r.length - 2; i += 2) {
      const [ax, az, bx, bz] = [r[i]!, r[i + 1]!, r[i + 2]!, r[i + 3]!];
      const near = (n: number, x: number, z: number) => Math.hypot(g.x[n]! - x, g.z[n]! - z) < 0.05;
      out.push(g.edgesNear((ax + bx) / 2, (az + bz) / 2, 1).filter((e) => {
        const [a, b] = [g.edgeA[e]!, g.edgeB[e]!];
        return (near(a, ax, az) && near(b, bx, bz)) || (near(a, bx, bz) && near(b, ax, az));
      }));
    }
    return out;
  };

  it('origin → Công viên Thống Nhất on foot: route from the feet to the target, ≤ 1.3 × as the crow flies', () => {
    const p = search(spawn, PLACES.thongnhat);
    const r = p.route!;
    expect(r).not.toBeNull();
    expect(Math.hypot(r[0]! - spawn.x, r[1]! - spawn.z)).toBeLessThanOrEqual(1);
    expect(r[r.length - 2]).toBeCloseTo(PLACES.thongnhat.x, 2);
    expect(r[r.length - 1]).toBeCloseTo(PLACES.thongnhat.z, 2);
    expect(p.remaining).toBeCloseTo(len(r), 1);
    expect(p.remaining).toBeLessThanOrEqual(1.3 * straight(spawn, PLACES.thongnhat));
    expect(p.target).toMatchObject({ x: PLACES.thongnhat.x, z: PLACES.thongnhat.z });
    expect(follows(r).every((es) => es.some((e) => g.allows(e, 'walk', true)))).toBe(true);
  });

  it('other destinations: a route ≤ 1.6 × as the crow flies', () => {
    const rows: string[] = [];
    for (const [name, to] of Object.entries(PLACES)) {
      const p = search(spawn, to);
      expect(p.route, name).not.toBeNull();
      expect(p.remaining, name).toBeLessThanOrEqual(1.6 * straight(spawn, to));
      rows.push(`${name} ${(p.remaining / straight(spawn, to)).toFixed(2)}×`);
    }
    const p = search(PLACES.bachkhoa, PLACES.thongnhat);
    expect(p.remaining).toBeLessThanOrEqual(1.6 * straight(PLACES.bachkhoa, PLACES.thongnhat));
    console.log(`[gps] spawn → ${rows.join(', ')}`);
  });

  it('walking 200 m along the route: remaining falls 1 m per m, no new search', () => {
    const p = search(spawn, PLACES.thongnhat);
    const poly = Float32Array.from(p.route!);
    const total = p.remaining;
    let prev = total;
    for (let s = 1; s <= 200; s++) {
      const [x, z] = along(poly, s);
      p.update(x, z, 'walk', 0.25);
      expect(prev - p.remaining).toBeCloseTo(1, 2);
      prev = p.remaining;
    }
    expect(p.stats.searches).toBe(1);
    const [x, z] = along(poly, 200);
    expect(p.route![0]).toBeCloseTo(x, 2); // the route starts at the feet' point on it
    expect(p.route![1]).toBeCloseTo(z, 2);
    expect(p.route!.length).toBeLessThan(poly.length); // the walked part is gone
    expect(total - p.remaining).toBeCloseTo(200, 1);
  });

  it('40 m off the route: one new search; never more than one per gps.minInterval', () => {
    const p = search(spawn, PLACES.thongnhat);
    const poly = Float32Array.from(p.route!);
    for (let s = 1; s <= 100; s++) p.update(...(along(poly, s).slice(0, 2) as [number, number]), 'walk', 0.25);
    expect(p.stats.searches).toBe(1);
    const [x, z, dx, dz] = along(poly, 100);
    p.update(x - dz * 40, z + dx * 40, 'walk', 0.25); // 40 m to the side (> gps.offRoute)
    expect(p.stats.searches).toBe(2);
    expect(p.route![0]).toBeCloseTo(x - dz * 40, 2); // the new route starts at the feet
    for (let i = 0; i < 4; i++) p.update(x - dz * 40, z + dx * 40, 'walk', 0.1);
    expect(p.stats.searches).toBe(2); // standing on the new route
    const [fx, fz] = along(poly, 600); // jumps far off the route: searched only once the interval is over
    p.update(fx, fz, 'walk', 0.1);
    expect(p.stats.searches).toBe(2);
    p.update(fx, fz, 'walk', cfg.minInterval);
    expect(p.stats.searches).toBe(3);
    expect(p.route).not.toBeNull();
  });

  it('a new target drops the old route and is searched again', () => {
    const p = search(spawn, PLACES.thongnhat);
    p.setTarget(PLACES.vanmieu.x, PLACES.vanmieu.z);
    expect(p.route).toBeNull();
    expect(p.remaining).toBeNaN();
    p.update(spawn.x, spawn.z, 'walk', cfg.minInterval);
    expect(p.route).not.toBeNull();
    expect(p.remaining).toBeLessThanOrEqual(1.3 * straight(spawn, PLACES.vanmieu));
    p.clear();
    expect([p.target, p.route, p.remaining]).toEqual([null, null, NaN]);
  });

  it('on the bike the route has no steps; a walking route may', () => {
    const [a, b] = [{ x: -27.5, z: 618.9 }, { x: -53.2, z: 627 }]; // Leg 3 Hà Nội: a flight of steps in the old quarter, 10 m before / after it (found by scanning the graph)
    const walk = search(a, b, 'walk'), bike = search(a, b, 'bike');
    const steps = (r: Float32Array) => follows(r).filter((es) => es.length && es.every((e) => g.flags(e) & WayFlag.steps)).length;
    expect(steps(walk.route!)).toBeGreaterThan(0);
    expect(steps(bike.route!)).toBe(0);
    expect(follows(bike.route!).every((es) => es.some((e) => g.allows(e, 'bike', true)))).toBe(true);
    expect(bike.remaining).toBeGreaterThan(walk.remaining); // the detour around the stairs
  });

  it('a pocket by the steps near hồ Hoàn Kiếm → the Nhà hát Lớn by bike: no bike route, falls back to the walking one', () => {
    const from: P = { x: -119, z: 344.6 }; // cut off from the street by steps for bikes (found by scanning the Hà Nội graph)
    const to = PLACES.nhahat;
    const bikeNodes = [from, to].map((q) => g.nearestNode(q.x, q.z, 'bike', 80)) as [number, number];
    expect(bikeNodes.every((n) => n >= 0)).toBe(true);
    expect(shortestPath(g, bikeNodes[0], bikeNodes[1], 'bike')).toBeNull(); // precondition: the stairs cut the bike network
    const riding = search(from, to, 'bike'), walking = search(from, to, 'walk');
    expect(walking.route).not.toBeNull();
    expect(riding.route).not.toBeNull();
    expect(riding.remaining).toBeCloseTo(walking.remaining, 3);
    expect(riding.stats.searches).toBe(1); // bike tried, walk found, in one search
    riding.update(from.x, from.z, 'walk', 5); // gets off: the walking route is still the answer
    riding.update(from.x, from.z, 'bike', 5); // and on again
    expect(riding.stats.searches).toBe(1);
    // the other way round (walk first, then mount): one search, the same route
    const w2 = search(from, to, 'walk');
    w2.update(from.x, from.z, 'bike', cfg.minInterval);
    expect(w2.stats.searches).toBe(2);
    expect(w2.remaining).toBeCloseTo(walking.remaining, 3);
  });

  it('arriving within gps.arriveRadius clears the waypoint and the route', () => {
    const p = search(spawn, PLACES.thienquang);
    const r = Float32Array.from(p.route!);
    const [x, z] = along(r, len(r) - (cfg.arriveRadius + 2));
    p.update(x, z, 'walk', 0.25);
    expect(p.target).not.toBeNull();
    const [x2, z2] = along(r, len(r) - (cfg.arriveRadius - 2));
    p.update(x2, z2, 'walk', 0.25);
    expect([p.target, p.route, p.remaining]).toEqual([null, null, NaN]);
    p.update(x2, z2, 'walk', 5); // nothing to do any more
    expect(p.stats.searches).toBe(1);
  });

  it('a target that cannot be reached keeps the waypoint, draws no route, retries once per interval', () => {
    for (const [label, to] of [['outside the map', { x: 20000, z: 20000 }]] as const) {
      expect(g.nearestNode(to.x, to.z, 'walk', 80), label).toBe(-1);
      const p = new Gps(g);
      p.setTarget(to.x, to.z);
      for (let i = 0; i < 10; i++) p.update(spawn.x, spawn.z, 'walk', 0.4); // 4 s
      expect(p.target, label).toMatchObject(to);
      expect([p.route, p.remaining], label).toEqual([null, NaN]);
      expect(p.stats.searches, label).toBeLessThanOrEqual(1 + Math.floor(4 / cfg.minInterval));
    }
    // the feet outside the map (no node within reach; Hà Nội has no sea): no route until they are back on the streets
    const p = new Gps(g);
    p.setTarget(PLACES.nhahat.x, PLACES.nhahat.z);
    p.update(20000, 20000, 'walk', 0);
    expect(p.route).toBeNull();
    p.update(spawn.x, spawn.z, 'walk', cfg.minInterval);
    expect(p.route).not.toBeNull();
  });

  it('search time (ms, printed): ≤ 5 ms median over 14 random routes across the map', () => {
    const nodes: number[] = [];
    for (let n = 0; n < g.nodeCount; n++) if (g.component[n] === g.main && n % 7 === 0) nodes.push(n);
    let seed = 11;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const ms: number[] = [];
    for (let i = 0; i < 20; i++) {
      const [a, b] = [nodes[Math.floor(rnd() * nodes.length)]!, nodes[Math.floor(rnd() * nodes.length)]!];
      const p = search({ x: g.x[a]!, z: g.z[a]! }, { x: g.x[b]!, z: g.z[b]! });
      expect(p.route).not.toBeNull();
      if (i >= 6) ms.push(p.stats.ms); // the first ones warm the JIT up
    }
    ms.sort((x, y) => x - y);
    console.log(`[gps] search ms: median ${ms[ms.length >> 1]!.toFixed(2)}, max ${ms.at(-1)!.toFixed(2)} (${ms.length} routes, whole map)`);
    expect(ms[ms.length >> 1]!).toBeLessThanOrEqual(5);
  });
});
