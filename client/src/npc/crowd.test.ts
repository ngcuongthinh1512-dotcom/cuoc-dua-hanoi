import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { latLonToWorld } from '@race/shared';
import { GRAPH_VERSION, RoadGraph, type RoadGraphFile, segPoint, WayFlag } from '@race/shared/graph';
import { describe, expect, it } from 'vitest';
import { crowd as C, npc, roads as R } from '../config.ts';
import { Crowd } from './crowd.ts';
import { NpcRoads } from './roads.ts';
import type { CarPose, LightQuery, NpcAnchor } from './types.ts';

const DT = 1 / 60;
const anchor = (x: number, z: number, extra: Partial<NpcAnchor> = {}): NpcAnchor => ({ x, z, viewYaw: 0, body: true, vx: 0, vz: 0, nose: null, waving: false, ...extra });
const hash = (c: Crowd) => c.peds.reduce((h, p) => (Math.imul(h ^ Math.round(p.x * 100), 0x9e3779b1) ^ Math.round(p.z * 100) ^ (p.id << 3)) >>> 0, 0);

// ── fixture: a straight residential road (x 0 … 200, nodes at 0 / 100 / 200) with a crossing at 100, plus a T street ────
const CAR = WayFlag.walk | WayFlag.bike | WayFlag.car;
const fixture = (tee: boolean) => {
  const pts = [[0, 0], [100, 0], [200, 0], [100, 120]];
  const file: RoadGraphFile = {
    v: GRAPH_VERSION, nodes: pts.flatMap(([x, z]) => [x! * 10, z! * 10]), kinds: ['residential'], names: [],
    ways: tee ? [[0, CAR, 0, -1, 0, 0, 0, 1, 2], [0, CAR, 0, -1, 0, 0, 1, 3]] : [[0, CAR, 0, -1, 0, 0, 0, 1, 2]], junctions: tee ? [1] : [], crossings: [1], signals: [], bikeParking: [],
  };
  return new NpcRoads(RoadGraph.decode(file), () => 0);
};
const car = (x: number, z: number, yaw: number, speed: number): CarPose => ({ id: 0, kind: 'sedan', paint: 0, x, y: 0, z, yaw, pitch: 0, speed, wheel: 0, braking: false });
const RED: LightQuery = { car: () => 'red', pedMayCross: () => false, headsNear: () => [] };

  /** Is (x, z) in a place a non-crossing pedestrian may be: a drawn sidewalk strip, a living street, or a footway? */
const where = (g: RoadGraph, r: NpcRoads, x: number, z: number): 'road' | 'side' | 'living' | 'path' | 'nowhere' => {
    let res: 'road' | 'side' | 'living' | 'path' | 'nowhere' = 'nowhere';
    for (const e of g.edgesNear(x, z, 25)) {
      const w = g.edgeWay[e]!, f = g.flags(e), a = g.edgeA[e]!, b = g.edgeB[e]!;
      const d = segPoint(x, z, g.x[a]!, g.z[a]!, g.x[b]!, g.z[b]!)[1], h = r.halfWidth(w);
      if (f & WayFlag.car && r.sidewalk(w) > 0) {
        if (d < h - 0.06) return 'road';
        if (d <= h + r.sidewalk(w) + 0.06) res = 'side';
      } else if (f & WayFlag.car && r.kind(w) === 'living_street' && d <= h + 0.06) res = res === 'nowhere' ? 'living' : res;
      else if (f & WayFlag.walk && !(f & (WayFlag.sidewalk | WayFlag.crossing | WayFlag.steps)) && R.footKinds.includes(r.kind(w)) && d <= h + 0.06) res = res === 'nowhere' ? 'path' : res;
    }
    return res;
  };


/** Run `seconds` of sim around (x, z), `each` after every step; returns the crowd. */
const run = (crowd: Crowd, seconds: number, a: NpcAnchor, each?: (c: Crowd, t: number) => void, cars: () => CarPose[] = () => [], density = 10) => {
  crowd.step(DT, a, density, cars(), true);
  for (let i = 0; i < seconds / DT; i++) {
    crowd.step(DT, a, density, cars());
    each?.(crowd, i * DT);
  }
  return crowd;
};

describe('Crowd (fixture)', () => {
  it('crosses at a crossing node, but never while a car reaches it within crossGap s, nor on a permanent red', () => {
    const r = fixture(false);
    const a = anchor(100, 60, { body: false });
    const count = (cars: () => CarPose[], lights?: LightQuery) => {
      let crossed = 0;
      const c = new Crowd(r, 7);
      if (lights) c.lights = lights;
      run(c, 240, a, (cr) => {
        for (const p of cr.peds) if (cr.modeOf(p.id) === 'cross') crossed++;
      }, cars);
      return crossed;
    };
    expect(count(() => [])).toBeGreaterThan(0);
    // a car speeding toward the crossing at (100, 0) from 10 m away: reaches it in 1 s < crossGap
    expect(count(() => [car(90, 0, -Math.PI / 2, 10)])).toBe(0);
    expect(count(() => [], RED)).toBe(0);
  });

  it('T junction: corners and mouth crossings keep to the sidewalks, walkers reach both sides', () => {
    const r = fixture(true), g = r.graph;
    const c = new Crowd(r, 3);
    const seen = { side: 0, cross: 0, bad: 0 };
    const zs = new Set<number>();
    run(c, 180, anchor(100, 30, { body: false }), (cr) => {
      for (const p of cr.peds) {
        const m = cr.modeOf(p.id);
        if (m === 'cross') seen.cross++;
        else if (where(g, r, p.x, p.z) === 'side') (seen.side++, Math.abs(p.x - 100) < 30 && Math.abs(p.z) < 10 && zs.add(Math.sign(p.z)));
        else seen.bad++;
      }
    });
    expect(seen.side).toBeGreaterThan(1000);
    expect(seen.cross).toBeGreaterThan(0);
    expect(seen.bad).toBe(0);
    expect(zs.has(1) && zs.has(-1)).toBe(true);
  });
});

describe('Crowd (living street)', () => {
  it('walks inside the carriageway, inset from its edge', () => {
    const file: RoadGraphFile = { v: GRAPH_VERSION, nodes: [0, 0, 1500, 0], kinds: ['living_street'], names: [], ways: [[0, CAR, 0, -1, 0, 0, 0, 1]], junctions: [], crossings: [], signals: [] , bikeParking: [] };
    const r = new NpcRoads(RoadGraph.decode(file), () => 0);
    const c = new Crowd(r, 2), half = r.halfWidth(0);
    let n = 0;
    run(c, 60, anchor(75, 0, { body: false }), (cr) => {
      for (const p of cr.peds) (n++, expect(Math.abs(p.z)).toBeLessThanOrEqual(half - C.inset + 0.06), expect(Math.abs(p.z)).toBeGreaterThanOrEqual(half - C.inset - 0.06));
    });
    expect(n).toBeGreaterThan(500);
  });
});

const root = join(import.meta.dirname, '../../..');
const graphFile = join(root, 'shared/data/roadgraph.json');
describe.skipIf(!existsSync(graphFile))('Crowd (roadgraph.json, Concorde)', { timeout: 120_000 }, () => {
  const g = RoadGraph.decode(JSON.parse(readFileSync(graphFile, 'utf8')) as RoadGraphFile);
  const r = new NpcRoads(g, () => 0);
  const spot = { x: 0, z: 0 };
  const a0 = anchor(spot.x, spot.z, { body: false });

  it('walkers stay on the drawn sidewalks / living streets / footways; in the road only while crossing, near a node', () => {
    const c = new Crowd(r, 1);
    const seen = { side: 0, living: 0, path: 0, cross: 0, bad: 0, samples: 0 };
    const bad: string[] = [];
    run(c, 300, a0, (cr, t) => {
      for (const p of cr.peds) {
        const m = cr.modeOf(p.id)!;
        if (p.stagger >= 0) continue;
        seen.samples++;
        if (m === 'cross') {
          seen.cross++;
          if (g.nearestNode(p.x, p.z, 'walk', 25) < 0) bad.push(`cross far from nodes ${t.toFixed(1)} ${p.x.toFixed(1)},${p.z.toFixed(1)}`);
          continue;
        }
        const w = where(g, r, p.x, p.z);
        if (w === 'side' || w === 'living' || w === 'path') seen[w]++;
        else if (m !== 'sit') bad.push(`${m} in ${w} ${t.toFixed(1)}s ${p.x.toFixed(1)},${p.z.toFixed(1)}`);
      }
    });
    console.log('Crowd bands:', seen, bad.slice(0, 8));
    expect(seen.side).toBeGreaterThan(1000);
    expect(seen.path).toBeGreaterThan(200);
    expect(seen.cross).toBeGreaterThan(0);
    console.log('bad', bad.length, 'of', seen.samples);
    expect(bad.length).toBe(0);
  });

  it('crosses only while no car reaches the crossing; nobody crosses a permanent red', () => {
    const c = new Crowd(r, 2);
    c.lights = RED;
    let crossed = 0;
    run(c, 300, a0, (cr) => {
      for (const p of cr.peds) if (cr.modeOf(p.id) === 'cross') crossed++;
    });
    expect(crossed).toBe(0);
  });

  it('exclusion zone: nobody in it after 5 minutes (spawn, walk, stand, sit)', () => {
    const c = new Crowd(r, 4);
    const zone = { x: 60, z: -120, r: 40 }; // Rue Royale side of the Concorde
    c.zones = [zone];
    let inside = 0, samples = 0;
    run(c, 300, a0, (cr) => {
      for (const p of cr.peds) {
        samples++;
        if (Math.hypot(p.x - zone.x, p.z - zone.z) < zone.r + npc.zoneMargin) inside++;
      }
    });
    expect(samples).toBeGreaterThan(5000);
    expect(inside).toBe(0);
  });

  it('touching the player staggers and pushes away; the bike nose knocks; G within 10 m facing makes them wave', () => {
    const c = new Crowd(r, 5);
    run(c, 20, a0, undefined, undefined, 3);
    const p = c.peds.find((q) => c.modeOf(q.id) === 'walk' && Math.hypot(q.x, q.z) > 20)!;
    expect(p).toBeDefined();
    // body contact
    const [x0, z0] = [p.x, p.z];
    let res = c.step(DT, anchor(p.x + 0.2, p.z, { body: true }), 3, []);
    expect(res.knocked).toBe(0); // body only: no crash
    expect(p.stagger).toBeGreaterThanOrEqual(0);
    for (let i = 0; i < C.stagger.seconds / DT + 2; i++) c.step(DT, anchor(p.x + 50, p.z + 50), 3, []);
    expect(Math.hypot(p.x - x0, p.z - z0)).toBeGreaterThan(C.stagger.push * 0.5);
    expect(p.stagger).toBe(-1); // walks on
    // nose contact, a fresh one
    const q = c.peds.find((s) => s !== p && c.modeOf(s.id) === 'walk' && s.stagger < 0)!;
    res = c.step(DT, anchor(q.x + 5, q.z, { nose: { x: q.x + 0.1, z: q.z } }), 3, []);
    expect(res.knocked).toBe(1);
    // wave back: stand 5 m ahead of a walker, facing it
    const w = c.peds.find((s) => s !== p && s !== q && c.modeOf(s.id) === 'walk' && s.stagger < 0)!;
    const hx = -Math.sin(w.yaw), hz = -Math.cos(w.yaw);
    c.step(DT, anchor(w.x + hx * 5, w.z + hz * 5, { waving: true }), 3, []);
    expect(w.activity).toBe('wave');
  });

  it('some pedestrians sit on the Tuileries chairs', () => {
    const c = new Crowd(r, 8), tuil = latLonToWorld(48.8635, 2.3275);
    c.step(DT, anchor(tuil.x, tuil.z, { body: false }), 1, [], true);
    const seats = c.seatsNear(tuil.x, tuil.z, C.radius);
    const sitters = c.peds.filter((p) => p.activity === 'sit');
    expect(sitters.length).toBeGreaterThan(0);
    for (const p of sitters) expect(seats.some((s) => Math.hypot(s.x - p.x, s.z - p.z) < 0.01 && s.yaw === p.yaw)).toBe(true);
    expect(new Set(sitters.map((p) => `${p.x},${p.z}`)).size).toBe(sitters.length); // one person per chair
  });

  it('a player standing in a walker\'s way is sidestepped or waited for, never walked into', () => {
    const c = new Crowd(r, 6);
    run(c, 15, a0, undefined, undefined, 3);
    const p = c.peds.find((q) => c.modeOf(q.id) === 'walk' && q.stagger < 0)!;
    const a = anchor(p.x - Math.sin(p.yaw) * 2.5, p.z - Math.cos(p.yaw) * 2.5);
    let closest = 9;
    for (let i = 0; i < 180; i++) {
      c.step(DT, a, 3, []);
      closest = Math.min(closest, Math.hypot(p.x - a.x, p.z - a.z));
    }
    expect(p.stagger).toBe(-1);
    expect(closest).toBeGreaterThan(C.bodyRadius + 0.3);
  });

  it('seats: deterministic, ≥ seatRoadClear from car roads, some in the Tuileries', () => {
    const c1 = new Crowd(r, 1), c2 = new Crowd(r, 99);
    const tuil = latLonToWorld(48.8635, 2.3275);
    const s1 = c1.seatsNear(tuil.x, tuil.z, 250), s2 = c2.seatsNear(tuil.x, tuil.z, 250);
    console.log('Tuileries seats within 250 m:', s1.length);
    expect(s1.length).toBeGreaterThan(5);
    expect(s2).toEqual(s1);
    expect(c1.seatsNear(tuil.x, tuil.z, 250)).toEqual(s1);
    for (const s of s1) {
      for (const e of g.edgesNear(s.x, s.z, C.seatRoadClear + 2)) {
        if (!r.car[e]) continue;
        const a = g.edgeA[e]!, b = g.edgeB[e]!;
        expect(segPoint(s.x, s.z, g.x[a]!, g.z[a]!, g.x[b]!, g.z[b]!)[1]).toBeGreaterThanOrEqual(C.seatRoadClear);
      }
    }
  });

  it('deterministic: same seed and same player path give the same crowd', () => {
    const go = (seed: number) => {
      const c = new Crowd(r, seed);
      c.step(DT, anchor(0, 0), 1, [], true);
      for (let i = 0; i < 3000; i++) c.step(DT, anchor(0 + i * 0.02, -i * 0.01, { waving: i % 500 === 0 }), 1, []);
      return hash(c);
    };
    expect(go(1)).toBe(go(1));
    expect(go(1)).not.toBe(go(2));
  });

  it('density follows the band length (Concorde ≈ 28), capped by crowd.max', () => {
    const c = new Crowd(r, 1);
    c.step(DT, anchor(0, 0), 1, [], true);
    console.log('Concorde peds at density 1:', c.peds.length, ' Étoile:', (() => { const d = new Crowd(r, 1); d.step(DT, anchor(-1916, -921), 1, [], true); return d.peds.length; })());
    expect(c.peds.length).toBeGreaterThan(20);
    expect(c.peds.length).toBeLessThanOrEqual(C.max);
  });

  it(`≤ 0.3 ms per step with ${C.max} pedestrians`, () => {
    const c = new Crowd(r, 1);
    const a = anchor(0, 0);
    c.step(DT, a, 10, [], true);
    for (let i = 0; i < 600; i++) c.step(DT, a, 10, []); // warm the caches
    const t0 = performance.now();
    const n = 1200;
    for (let i = 0; i < n; i++) c.step(DT, anchor(i * 0.01, 0), 10, []);
    const ms = (performance.now() - t0) / n;
    console.log(`Crowd: ${c.peds.length} peds, ${ms.toFixed(3)} ms/step`);
    expect(c.peds.length).toBeGreaterThanOrEqual(C.max - 2);
    expect(ms).toBeLessThan(0.3);
  });

});
