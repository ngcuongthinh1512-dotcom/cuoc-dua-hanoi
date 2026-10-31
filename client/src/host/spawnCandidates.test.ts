// Phase 6 track C: bike spawn candidates on the real shared/data/roadgraph.json for the 6 demo segments (start → L1 … L5 →
// L6; docs/plans/phase6.md §2.4 measured L2 → L3 with 0 bicycle_parking nodes). Skipped when the data is missing.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { latLonToWorld } from '@race/shared';
import { pathPolyline, RoadGraph, type RoadGraphFile, segPoint, shortestPath } from '@race/shared/graph';
import { describe, expect, it } from 'vitest';
import { serverBikes } from '../config.ts';
import { spawnCandidates } from './spawnCandidates.ts';

const root = join(import.meta.dirname, '../../..');
const graphFile = join(root, 'shared/data/roadgraph.json');
const legFile = join(root, 'worker/legs/bruxelles-demo.json'); // server-only content: read by this test, never bundled

describe.skipIf(!existsSync(graphFile) || !existsSync(legFile))('spawnCandidates (roadgraph.json, demo leg)', () => {
  const file = JSON.parse(readFileSync(graphFile, 'utf8')) as RoadGraphFile;
  const leg = JSON.parse(readFileSync(legFile, 'utf8')) as {
    start: { lat: number; lon: number };
    steps: { destination?: { lat: number; lon: number } }[];
    vehicles: { corridorMeters: number; minDistanceFromCheckpoint: number };
  };
  const g = RoadGraph.decode(file);
  const points = [leg.start, ...leg.steps.flatMap((s) => (s.destination ? [s.destination] : []))]
    .map((p) => latLonToWorld(p.lat, p.lon))
    .filter((p, i, a) => i === 0 || Math.hypot(p.x - a[i - 1]!.x, p.z - a[i - 1]!.z) > 1); // the pit stop = L6
  const t0 = performance.now();
  const c = spawnCandidates(g, points, [], leg.vehicles);
  const ms = performance.now() - t0;
  const pairs = (a: number[]) => Array.from({ length: a.length / 2 }, (_, k) => [a[2 * k]!, a[2 * k + 1]!] as const);
  const parking = new Set(pairs(file.bikeParking).map(([x, z]) => `${x / 10},${z / 10}`));
  const polys = points.slice(1).map((b, i) => {
    const a = points[i]!;
    return pathPolyline(g, shortestPath(g, g.nearestNode(a.x, a.z, 'walk'), g.nearestNode(b.x, b.z, 'walk'), 'walk')!);
  });
  const toPath = (poly: number[], x: number, z: number) => {
    let d = Infinity;
    for (let i = 0; i + 3 < poly.length; i += 2) d = Math.min(d, segPoint(x, z, poly[i]!, poly[i + 1]!, poly[i + 2]!, poly[i + 3]!)[1]);
    return d;
  };

  it('5 segments, each ≥ minCandidates points inside its corridor, all ≥ 100 m from every route point (L2 → L3 too)', () => {
    console.log(`spawnCandidates: ${ms.toFixed(0)} ms, ${c.segments.map((s) => s.length / 2).join(' / ')} points, ${c.decoys.length / 2} decoys`);
    expect(c.segments).toHaveLength(5);
    c.segments.forEach((seg, i) => {
      expect(seg.length / 2).toBeGreaterThanOrEqual(serverBikes.minCandidates);
      for (const [x, z] of pairs(seg)) {
        expect(toPath(polys[i]!, x, z)).toBeLessThanOrEqual(leg.vehicles.corridorMeters / 2 + 0.1);
        for (const p of points) expect(Math.hypot(p.x - x, p.z - z)).toBeGreaterThanOrEqual(leg.vehicles.minDistanceFromCheckpoint);
      }
    });
  });

  // Leg 3: the Bruxelles roadgraph has 2,184 bicycle_parking nodes, so to control which segment holds racks the rack rules run
  // on a copy of the graph that gets racks put on the demo leg: 16 on the corridor of segment R, chosen so that segment N's
  // corridor (the demo legs are short: corridors overlap) holds none of them, and 25 decoy racks off the route.
  const dm10 = (a: number[]) => a.map((v) => Math.round(v * 10));
  const half = leg.vehicles.corridorMeters / 2;
  const plan = c.segments
    .map((seg, R) => ({ R, racks: pairs(seg).slice(0, 16) }))
    .map((o) => ({ ...o, N: polys.findIndex((poly, j) => j !== o.R && o.racks.every(([x, z]) => toPath(poly, x, z) > half)) }))
    .find((o) => o.N >= 0)!;
  const bike = [...plan.racks.flat(), ...c.decoys.slice(0, 50)];
  const racked = spawnCandidates(RoadGraph.decode({ ...file, bikeParking: dm10(bike) }), points, [], leg.vehicles);
  const rackSet = new Set(pairs(dm10(bike)).map(([x, z]) => `${x / 10},${z / 10}`));

  it('Leg 3: the Bruxelles graph has bicycle_parking nodes; every segment still has ≥ minCandidates points', () => {
    expect(file.bikeParking.length / 2).toBeGreaterThan(1000);
    expect(parking.size).toBeGreaterThan(1000);
    c.segments.forEach((seg) => expect(seg.length / 2).toBeGreaterThanOrEqual(serverBikes.minCandidates));
  });

  it('bicycle parking first: segment R (16 racks) is all racks; segment N (none) falls back to sampled pavement points', () => {
    expect(plan).toBeDefined();
    expect(pairs(racked.segments[plan.R]!).every(([x, z]) => rackSet.has(`${x},${z}`))).toBe(true);
    expect(pairs(racked.segments[plan.N]!).some(([x, z]) => rackSet.has(`${x},${z}`))).toBe(false);
  });

  it('decoys lie outside every corridor and away from the route points; racks among them (a rack ≠ the route); same input → same output', () => {
    expect(c.decoys.length / 2).toBeGreaterThan(20);
    expect(pairs(racked.decoys).filter(([x, z]) => rackSet.has(`${x},${z}`)).length).toBeGreaterThan(20); // a rack ≠ the route
    for (const [x, z] of pairs(c.decoys)) {
      for (const poly of polys) expect(toPath(poly, x, z)).toBeGreaterThan(leg.vehicles.corridorMeters / 2);
      for (const p of points) expect(Math.hypot(p.x - x, p.z - z)).toBeGreaterThanOrEqual(leg.vehicles.minDistanceFromCheckpoint);
    }
    expect(spawnCandidates(g, points, [], leg.vehicles)).toEqual(c);
  });

  it('a task location is avoided like a route point', () => {
    const [x, z] = c.segments[0]!;
    const moved = spawnCandidates(g, points.slice(0, 2), [{ x: x!, z: z! }], leg.vehicles);
    for (const [px, pz] of pairs(moved.segments[0]!)) expect(Math.hypot(px - x!, pz - z!)).toBeGreaterThanOrEqual(leg.vehicles.minDistanceFromCheckpoint);
  });
});
