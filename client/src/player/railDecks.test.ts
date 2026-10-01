import { readFileSync } from 'node:fs';
import RAPIER from '@dimforge/rapier3d-compat';
import { beforeAll, describe, expect, it } from 'vitest';
import { physics } from '../config.ts';
import { CharacterController } from './CharacterController.ts';
import { latLonToWorld } from '@race/shared';
import { chunkKey } from '../geo/chunkData.ts';
import { boxSurface, inStrips, pickSurface, railStrips } from './railDecks.ts';

const chunk = (x: number, z: number) => JSON.parse(readFileSync(new URL(`../../public/data/chunks/${chunkKey(x, z)}.json`, import.meta.url), 'utf8'));
const strips = (x: number, z: number) => railStrips(chunk(x, z).bridges);

describe('spawn / box surface (D17: highest walkable, never a rail viaduct top)', () => {
  it('Bir-Hakeim start (OSM centre): under the Line 6 strip; the road lanes 6.6 m off are not', () => {
    const p = latLonToWorld(48.85569, 2.28758);
    expect(inStrips(strips(p.x, p.z), p.x, p.z)).toBe(true);
    const [nx, nz] = [0.837, -0.547]; // across the bridge (its axis runs NW (−2534, 994) → SE (−2402, 1196))
    for (const s of [-6.6, 6.6]) expect(inStrips(strips(p.x, p.z), p.x + nx * s, p.z + nz * s)).toBe(false);
    // measured column there: metro top 7.22, slab underside 6.22, promenade deck 1.3, island / quay 0.4 below it
    expect(pickSurface([{ y: 7.22, walkable: true }, { y: 6.22, walkable: true }, { y: 1.3, walkable: true }, { y: -1, walkable: true }], true)).toBe(1.3);
  });

  it('Alexandre III end over the quay road: no rail strip, the deck (highest) wins, not the road under it', () => {
    const p = latLonToWorld(48.8636, 2.3137);
    for (const [dx, dz] of [[0, 0], [0, 60], [0, -60]]) expect(inStrips(strips(p.x + dx!, p.z + dz!), p.x + dx!, p.z + dz!)).toBe(false);
    expect(pickSurface([{ y: 3.4, walkable: true }, { y: -2.1, walkable: true }], false)).toBe(3.4);
  });

  it('nothing below the viaduct / not walkable → null (the spiral search moves on)', () => {
    expect(pickSurface([{ y: 7, walkable: true }, { y: 6, walkable: true }], true)).toBeNull();
    expect(pickSurface([{ y: 7, walkable: false }], false)).toBeNull();
    expect(pickSurface([], false)).toBeNull();
  });
});

describe('boxSurface (clue box / mat ground)', () => {
  beforeAll(() => RAPIER.init());
  it('ignores the player capsule standing on the box column', () => {
    const world = new RAPIER.World(physics.gravity);
    world.createCollider(RAPIER.ColliderDesc.cuboid(50, 0.5, 50).setTranslation(0, -0.5, 0));
    const c = new CharacterController(world, { heightAt: () => 0, waterLevel: null, water: undefined });
    c.spawn(0, 0, 0);
    world.step();
    expect(world.castRay(new RAPIER.Ray({ x: 0.001, y: 19, z: 0.001 }, { x: 0, y: -1, z: 0 }), 20, true)!.timeOfImpact).toBeLessThan(18.5); // the capsule is there
    expect(boxSurface(world, 0, 0, 0, false)).toBeCloseTo(0, 3);
  });
});
