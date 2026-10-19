import RAPIER from '@dimforge/rapier3d-compat';
import { latLonToWorld } from '@race/shared';
import { beforeAll, describe, expect, it } from 'vitest';
import { RACE_BBOX as B } from '../config.ts';
import { createBoundsWalls, edgeDistance } from './Bounds.ts';

beforeAll(() => RAPIER.init());

describe('edgeDistance', () => {
  it('is the distance to the nearest edge, negative outside', () => {
    const w = latLonToWorld(50.845, B.west);
    expect(edgeDistance(w.x + 25, w.z)).toBeCloseTo(25, 6);
    expect(edgeDistance(w.x - 10, w.z)).toBeCloseTo(-10, 6);
    const n = latLonToWorld(B.north, 4.36);
    expect(edgeDistance(n.x, n.z + 7)).toBeCloseTo(7, 6);
    expect(edgeDistance(0, 0)).toBeGreaterThan(1000); // the origin (Grand-Place) is well inside
  });
});

describe('createBoundsWalls', () => {
  it('a ray from inside hits a wall right at each edge', () => {
    const world = new RAPIER.World({ x: 0, y: 0, z: 0 });
    createBoundsWalls(world);
    world.step(); // updates the query pipeline
    expect(world.colliders.len()).toBe(4);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const hit = world.castRay(new RAPIER.Ray({ x: 0, y: 20, z: 0 }, { x: dx, y: 0, z: dz }), 1e4, true);
      expect(hit).not.toBeNull();
      const t = hit!.timeOfImpact;
      expect(Math.abs(edgeDistance(dx * t, dz * t))).toBeLessThan(0.05);
    }
  });
});
