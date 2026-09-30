import RAPIER from '@dimforge/rapier3d-compat';
import { beforeAll, describe, expect, it } from 'vitest';
import { bikeRules, physics } from '../config.ts';
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
    expect(bikes.interact(c)).toBeNull();
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
    expect(bikes.interact(c)).toBeNull();
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
    expect(bikes.interact(c)).toBeNull();
  });
});
