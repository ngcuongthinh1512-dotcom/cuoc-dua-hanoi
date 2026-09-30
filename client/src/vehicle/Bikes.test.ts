import RAPIER from '@dimforge/rapier3d-compat';
import { beforeAll, describe, expect, it } from 'vitest';
import { bike as B, bikeRules, notices, physics } from '../config.ts';
import { CharacterController } from '../player/CharacterController.ts';
import { Bikes, canMount } from './Bikes.ts';

beforeAll(() => RAPIER.init());

function setup() {
  const world = new RAPIER.World(physics.gravity);
  world.timestep = physics.fixedDt;
  world.createCollider(RAPIER.ColliderDesc.cuboid(100, 0.5, 100).setTranslation(0, -0.5, 0));
  const c = new CharacterController(world, { heightAt: () => 0, waterLevel: null, water: undefined });
  c.spawn(0, 0, 0);
  for (let i = 0; i < 30; i++) {
    c.fixedUpdate(physics.fixedDt, { forward: 0, right: 0, cameraYaw: 0, slow: false, jump: false });
    world.step();
  }
  return { world, c, bikes: new Bikes(null, null, 'Đội A', '#e33') };
}

describe('Bikes: take / mount / get off (SPEC §6.3)', () => {
  it('F works only within interactRadius, on foot', () => {
    const { c, bikes } = setup();
    const far = bikes.add(bikeRules.interactRadius + 0.3, 0, 0, 0);
    expect(bikes.interact(c)).toBe('bikeTooFar'); // Phase 5: near enough to say why
    far.position.x = bikeRules.interactRadius - 0.3;
    c.state.action = 'wave';
    expect(bikes.interact(c)).toBeNull(); // gesture running
    c.state.action = 'none';
    expect(bikes.interact(c)).toBe('mount');
    expect(c.state.moveMode).toBe('bike');
    expect([far.owner, far.rider]).toEqual(['Đội A', 'local']);
  });
  it('cannot mount while swimming or in the air', () => {
    const { c } = setup();
    expect(canMount(c.state)).toBe(true);
    for (const m of ['swim', 'air', 'bike'] as const) expect(canMount({ ...c.state, moveMode: m })).toBe(false);
    expect(canMount({ ...c.state, grounded: false })).toBe(false);
  });
  it("another team's bike cannot be taken", () => {
    const { c, bikes } = setup();
    const b = bikes.add(1, 0, 0, 0);
    b.owner = 'Đội B';
    expect(bikes.interact(c)).toBe('bikeTaken');
    expect(c.riding).toBeNull();
    expect(b.owner).toBe('Đội B');
  });
  it('taking a second bike makes the first disappear; get off keeps the owner', () => {
    const { c, bikes } = setup();
    const first = bikes.add(1, 0, 0, 0);
    bikes.interact(c);
    expect(bikes.interact(c)).toBe('dismount');
    expect([first.owner, first.rider, c.state.moveMode]).toEqual(['Đội A', null, 'walk']);
    const second = bikes.add(c.state.position.x + 1, 0, c.state.position.z, 0);
    first.position.set(50, 0, 50); // out of reach
    expect(bikes.interact(c)).toBe('mount');
    expect(c.riding).toBe(second);
    expect(bikes.list).toEqual([second]);
  });
  it('no getting off at speed', () => {
    const { c, bikes } = setup();
    bikes.add(1, 0, 0, 0);
    bikes.interact(c);
    c.riding!.speed = 4;
    expect(bikes.interact(c)).toBe('bikeTooFast');
    expect(c.riding).not.toBeNull();
    c.riding!.speed = B.dismountMaxSpeed;
    expect(bikes.interact(c)).toBe('dismount');
  });
});

describe('Bikes.interact: why F did nothing (Phase 5 track C, SPEC §6.3)', () => {
  it('riding above bike.dismountMaxSpeed (4 m/s; also in reverse) → bikeTooFast', () => {
    const { c, bikes } = setup();
    bikes.add(1, 0, 0, 0);
    bikes.interact(c);
    for (const v of [4, -4]) {
      c.riding!.speed = v;
      expect(bikes.interact(c)).toBe('bikeTooFast');
    }
  });

  it('on foot, 4 m from a free bike → bikeTooFar; beyond notices.farReach, silent', () => {
    const { c, bikes } = setup();
    const b = bikes.add(4, 0, 0, 0);
    expect(bikes.interact(c)).toBe('bikeTooFar');
    b.position.x = notices.farReach + 0.5;
    expect(bikes.interact(c)).toBeNull();
    expect(c.riding).toBeNull();
  });

  it("another team's bike in reach → bikeTaken; 4 m away it is silent; your own parked bike 4 m away → bikeTooFar", () => {
    const { c, bikes } = setup();
    const other = bikes.add(1, 0, 0, 0);
    other.owner = 'Đội B';
    expect(bikes.interact(c)).toBe('bikeTaken');
    other.position.x = 4;
    expect(bikes.interact(c)).toBeNull();
    const mine = bikes.add(4, 0, 1, 0);
    mine.owner = 'Đội A';
    expect(bikes.interact(c)).toBe('bikeTooFar');
  });

  it('a free bike in reach beats a taken one next to it: mounts', () => {
    const { c, bikes } = setup();
    bikes.add(1, 0, 0, 0).owner = 'Đội B';
    const free = bikes.add(-1.5, 0, 0, 0);
    expect(bikes.interact(c)).toBe('mount');
    expect(c.riding).toBe(free);
  });

  it('no bike within farReach → null; a gesture / swimming / the air stay silent even next to a bike', () => {
    const { c, bikes } = setup();
    expect(bikes.interact(c)).toBeNull();
    bikes.add(3, 0, 0, 0);
    for (const s of [{ action: 'wave' }, { moveMode: 'swim' }, { grounded: false }] as const) {
      const saved = { action: c.state.action, moveMode: c.state.moveMode, grounded: c.state.grounded };
      Object.assign(c.state, s);
      expect(bikes.interact(c)).toBeNull();
      Object.assign(c.state, saved);
    }
    expect(bikes.interact(c)).toBe('bikeTooFar');
  });
});
