import RAPIER from '@dimforge/rapier3d-compat';
import { type BikeInfo, PROTOCOL_VERSION, type Welcome } from '@race/shared/protocol';
import { beforeAll, describe, expect, it } from 'vitest';
import { physics } from '../config.ts';
import { CharacterController } from '../player/CharacterController.ts';
import { Bikes } from '../vehicle/Bikes.ts';
import { BikeLink } from './bikeLink.ts';

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
  const bikes = new Bikes(null, null, 'xanh', '#2c6bd8');
  const sent: unknown[] = [];
  const notes: string[] = [];
  bikes.net = { send: (m) => void sent.push(m) };
  bikes.notify = (n) => void notes.push(n);
  return { c, bikes, sent, notes, link: new BikeLink(bikes) };
}

const bike = (id: string, x: number, owner: string | null = null, rider = false): BikeInfo => ({ id, x, y: 0, z: 0, yaw: 0, owner, rider, parked: false });
const welcome = (bikes: BikeInfo[], pose: Welcome['pose'] = null): Welcome => ({
  t: 'welcome', v: PROTOCOL_VERSION, race: 'paris', serverMs: 0, status: 'running', role: 'team',
  teams: [{ slot: 2, id: 'vang', name: 'Đội Vàng', colour: '#e8c020', online: true }],
  movement: { footSpeed: 4, bikeSpeedMultiplier: 1.3 }, presence: { renderRadius: 300, showOthersOnMinimap: false, interestRadius: 500 },
  pose, raceTime: null, bikes, boxes: [],
});

describe('BikeLink: server bikes → the local Bikes (review fix: was never wired)', () => {
  it('welcome / bikes / bike messages reach Bikes; F claims; a lost claim toasts', () => {
    const { c, bikes, sent, notes, link } = setup();
    link.welcome(welcome([bike('a', 1), bike('b', 40, 'vang')]));
    expect(bikes.list.map((b) => [b.id, b.ownerColour])).toEqual([['a', null], ['b', '#e8c020']]);
    expect(link.message({ t: 'bikes', list: [bike('c', 60)], gone: ['b'] })).toBe(true);
    expect(bikes.list.map((b) => b.id)).toEqual(['a', 'c']);
    expect(link.message({ t: 'notice', code: 'bikeGone' })).toBe(false);
    expect(bikes.interact(c)).toBeNull(); // online: asks the server
    expect(sent).toEqual([{ t: 'bike', op: 'claim', id: 'a' }]);
    link.message({ t: 'bike', op: 'claim', id: 'a', ok: false, reason: 'taken' });
    expect(notes).toEqual(['bikeLost']);
    expect(c.riding).toBeNull();
  });

  it('a team that was riding before an F5 gets back on its bike (SPEC §8.10)', () => {
    const { c, bikes, sent, link } = setup();
    link.welcome(welcome([bike('m', 0.5, 'xanh')], { x: 0, y: 0, z: 0, yaw: 0, mode: 'bike', action: 'none', bikeId: 'm' }));
    link.frame(1 / 60, c);
    expect(sent).toEqual([{ t: 'bike', op: 'claim', id: 'm' }]);
    link.message({ t: 'bike', op: 'claim', id: 'm', ok: true });
    expect(c.riding).toBe(bikes.list[0]);
    link.frame(1 / 60, c);
    expect(sent).toHaveLength(1); // once
  });
});
