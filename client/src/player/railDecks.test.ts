import { readFileSync } from 'node:fs';
import RAPIER from '@dimforge/rapier3d-compat';
import { beforeAll, describe, expect, it } from 'vitest';
import { physics, roads as R } from '../config.ts';
import { CharacterController } from './CharacterController.ts';
import { type BridgeRec, chunkKey } from '../geo/chunkData.ts';
import { boxSurface, inStrips, pickSurface, railStrips } from './railDecks.ts';

const chunk = (x: number, z: number) => JSON.parse(readFileSync(new URL(`../../public/data/chunks/${chunkKey(x, z)}.json`, import.meta.url), 'utf8'));
const strips = (x: number, z: number) => railStrips(chunk(x, z).bridges);

describe('spawn / box surface (D17: highest walkable, never a rail viaduct top)', () => {
  // Leg 2: Macao's only upper rail viaduct lies in the NW corner (the Zhuhai rail line, 22.214 N 113.526 E); Paris: the Line 6 strip
  // over the Pont de Bir-Hakeim start (a single deck). The test takes the first segment of a rail piece of the chunk at (−1425, −2223).
  it('rail viaduct (NW corner of the map): the column under its strip is rail; the ground 12 m either side of the double track is not', () => {
    const piece = (chunk(-1425.2, -2223.2).bridges as BridgeRec[]).find((b) => b.layer >= 2 && R.railKinds.includes(b.kind) && b.pts.length >= 6)!;
    const [ax, az, bx, bz] = piece.pts as [number, number, number, number];
    const p = { x: (ax + bx) / 2, z: (az + bz) / 2 };
    const st = strips(p.x, p.z);
    expect(inStrips(st, p.x, p.z)).toBe(true);
    const l = Math.hypot(bx - ax, bz - az), [nx, nz] = [-(bz - az) / l, (bx - ax) / l]; // across the bridge
    for (const s of [-12, 12]) expect(inStrips(st, p.x + nx * s, p.z + nz * s)).toBe(false); // two tracks 6 m apart, each strip 3.75 m to a side
    // Leg 1, measured under the Line 6 deck: metro top 7.22, slab underside 6.22, promenade deck 1.3, island / quay 0.4 below it
    expect(pickSurface([{ y: 7.22, walkable: true }, { y: 6.22, walkable: true }, { y: 1.3, walkable: true }, { y: -1, walkable: true }], true)).toBe(1.3);
  });

  it('Ponte Governador Nobre de Carvalho (a road deck over the sea): no rail strip, the deck (highest) wins, not the road under it', () => {
    const p = { x: 464.8, z: 750 };
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
