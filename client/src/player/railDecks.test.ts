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
  // Leg 3 Hà Nội: the elevated metro (Cát Linh – Hà Đông, `subway` layer 2) is far west of the three-district core; the strip rules run on
  // a synthetic layer-2 rail piece; a real layer-1 rail bridge (the Long Biên railway, chunk -3_-3) must give no strip. Leg 1 (Paris): the Line 6 strip over the Pont de Bir-Hakeim start.
  it('rail viaduct (synthetic layer-2 rail piece): the column under its strip is rail; the ground 12 m either side of the double track is not', () => {
    const piece = { kind: 'rail', layer: 2, pts: [0, 0, 40, 0, 80, 0] } as BridgeRec;
    const st = railStrips([piece]);
    const p = { x: 20, z: 0 };
    expect(inStrips(st, p.x, p.z)).toBe(true);
    for (const s of [-12, 12]) expect(inStrips(st, p.x, p.z + s)).toBe(false); // two tracks 6 m apart, each strip 3.75 m to a side
    // Leg 1, measured under the Line 6 deck: metro top 7.22, slab underside 6.22, promenade deck 1.3, island / quay 0.4 below it
    expect(pickSurface([{ y: 7.22, walkable: true }, { y: 6.22, walkable: true }, { y: 1.3, walkable: true }, { y: -1, walkable: true }], true)).toBe(1.3);
  });

  it('Leg 3: the real layer-1 rail bridges of Hà Nội (the Long Biên railway, chunk -3_-3) → no strip (the ground / deck stays walkable)', () => {
    const rail = (chunk(-619, -579).bridges as BridgeRec[]).filter((b) => R.railKinds.includes(b.kind));
    expect(rail.length).toBeGreaterThan(0);
    expect(rail.every((b) => b.layer === 1)).toBe(true);
    const [ax, az, bx, bz] = rail[0]!.pts as [number, number, number, number];
    expect(inStrips(strips(ax, az), (ax + bx) / 2, (az + bz) / 2)).toBe(false);
  });

  it('Leg 3: a primary road bridge in the west (−4779, 1721, the Nguyễn Chí Thanh flyover; layer 2, but a road): no rail strip, the deck (highest) wins, not the road under it', () => {
    const p = { x: -4779, z: 1721 };
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
