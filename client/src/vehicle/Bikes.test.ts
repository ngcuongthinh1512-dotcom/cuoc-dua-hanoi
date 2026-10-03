import RAPIER from '@dimforge/rapier3d-compat';
import { beforeAll, describe, expect, it } from 'vitest';
import { bike as B, bikeRules, notices, physics, serverBikes } from '../config.ts';
import { CharacterController } from '../player/CharacterController.ts';
import { Bikes, canMount, REMOTE_RIDER } from './Bikes.ts';

beforeAll(() => RAPIER.init());

function setup() {
  const world = new RAPIER.World(physics.gravity);
  world.timestep = physics.fixedDt;
  world.createCollider(RAPIER.ColliderDesc.cuboid(100, 0.5, 100).setTranslation(0, -0.5, 0));
  const c = new CharacterController(world, { heightAt: () => 0, waterLevel: null, water: undefined });
  c.spawn(0, 0, 0);
  for (let i = 0; i < 30; i++) {
    c.fixedUpdate(physics.fixedDt, { forward: 0, right: 0, cameraYaw: 0, sprint: false, jump: false });
    world.step();
  }
  return { world, c, bikes: new Bikes(null, null, 'Đội A') };
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
  it("§17.34: another team's standing bike can be taken; one someone rides cannot", () => {
    const { c, bikes } = setup();
    const b = bikes.add(1, 0, 0, 0);
    b.owner = 'Đội B';
    b.rider = REMOTE_RIDER;
    expect(bikes.interact(c)).toBe('bikeTaken');
    expect(c.riding).toBeNull();
    b.rider = null;
    expect(bikes.interact(c)).toBe('mount');
    expect(b.owner).toBe('Đội A');
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

describe('Bikes.prompt: "Bấm F để lên xe đạp" / "xuống xe", no side effect', () => {
  it('any standing bike near → on (another team\'s too, §17.34); ridden / too far / riding → not on', () => {
    const { c, bikes } = setup();
    const b = bikes.add(bikeRules.interactRadius - 0.3, 0, 0, 0);
    expect(bikes.prompt(c)).toBe('on');
    expect([b.owner, b.rider, c.riding]).toEqual([null, null, null]); // nothing taken
    b.owner = 'Đội B';
    expect(bikes.prompt(c)).toBe('on');
    b.rider = REMOTE_RIDER;
    expect(bikes.prompt(c)).toBeNull();
    [b.owner, b.rider] = [null, null];
    b.position.x = bikeRules.interactRadius + 0.3;
    expect(bikes.prompt(c)).toBeNull();
    b.position.x = bikeRules.interactRadius - 0.3;
    expect(bikes.interact(c)).toBe('mount');
    expect(bikes.prompt(c)).toBe('off'); // stopped on the bike
    b.speed = B.dismountMaxSpeed + 1;
    expect(bikes.prompt(c)).toBeNull();
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

  it("a ridden bike in reach → bikeTaken; 4 m away it is silent; your own parked bike 4 m away → bikeTooFar", () => {
    const { c, bikes } = setup();
    const other = bikes.add(1, 0, 0, 0);
    [other.owner, other.rider] = ['Đội B', REMOTE_RIDER];
    expect(bikes.interact(c)).toBe('bikeTaken');
    other.position.x = 4;
    expect(bikes.interact(c)).toBeNull();
    const mine = bikes.add(4, 0, 1, 0);
    mine.owner = 'Đội A';
    expect(bikes.interact(c)).toBe('bikeTooFar');
  });

  it('a free bike in reach beats a ridden one next to it: mounts', () => {
    const { c, bikes } = setup();
    Object.assign(bikes.add(1, 0, 0, 0), { owner: 'Đội B', rider: REMOTE_RIDER });
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

describe('Bikes online: shared bikes from the server (Phase 6 track C, SPEC §6.2–6.3)', () => {
  const info = (id: string, x: number, owner: string | null = null, rider = false) => ({ id, x, y: 0, z: 0, yaw: 0, owner, rider, parked: false });
  function online() {
    const s = setup();
    const sent: unknown[] = [];
    const notes: string[] = [];
    Object.assign(s.bikes, { team: 't0', net: { send: (m: unknown) => sent.push(m) }, notify: (n: string) => notes.push(n) });
    const frame = () => s.bikes.update(1 / 60, s.c.state.position, s.c.riding, s.c.state.position, s.c.state.yaw);
    return { ...s, sent, notes, frame };
  }

  it('applyServer: full list replaces, deltas update the same BikeState, gone removes', () => {
    const { bikes } = online();
    bikes.add(5, 0, 5, 0); // a dev bike: gone with the first full list
    bikes.applyServer([info('b1', 1), info('b2', 30, 't1')], [], true);
    expect(bikes.list.map((b) => [b.id, b.owner])).toEqual([['b1', null], ['b2', 't1']]);
    const b1 = bikes.list[0]!;
    bikes.applyServer([info('b1', 2, 't1', true)]);
    expect(bikes.list[0]).toBe(b1);
    expect([b1.position.x, b1.rider]).toEqual([2, REMOTE_RIDER]); // another team rides it: hidden, not takeable
    bikes.applyServer([], ['b2']);
    expect(bikes.list.map((b) => b.id)).toEqual(['b1']);
  });

  it('F on a free bike asks the server; granted → mounted; refused → "Chậm một bước!" and still on foot', () => {
    const { c, bikes, sent, notes } = online();
    bikes.applyServer([info('b1', 1), info('b2', -1.5)], [], true);
    expect(bikes.interact(c)).toBeNull();
    expect(sent).toEqual([{ t: 'bike', op: 'claim', id: 'b1' }]);
    expect(c.riding).toBeNull();
    expect(bikes.interact(c)).toBeNull(); // waiting for the answer: no second claim
    expect(sent).toHaveLength(1);
    bikes.onClaimResult({ t: 'bike', op: 'claim', id: 'b1', ok: false, reason: 'taken' });
    expect([c.riding, notes]).toEqual([null, ['bikeLost']]);
    bikes.interact(c);
    bikes.onClaimResult({ t: 'bike', op: 'claim', id: 'b1', ok: true });
    expect(c.riding?.id).toBe('b1');
    expect(bikes.list.find((b) => b.id === 'b1')!.owner).toBe('t0');
  });

  it('§17.34: a task starts while riding → off the bike, which goes where the server put it (beside the clue box)', () => {
    const { c, bikes } = online();
    bikes.applyServer([info('b1', 1)], [], true);
    bikes.interact(c);
    bikes.onClaimResult({ t: 'bike', op: 'claim', id: 'b1', ok: true });
    bikes.applyServer([{ ...info('b1', 7), z: 3, parked: true }]);
    expect(c.riding).toBeNull();
    expect([bikes.list[0]!.position.x, bikes.list[0]!.position.z, bikes.list[0]!.owner]).toEqual([7, 3, null]);
  });

  it('each refusal reason → its own toast: finished → raceOver (verify3 m4: was "Chậm một bước!"), far, walkOnly, else bikeLost', () => {
    const { c, bikes, notes } = online();
    bikes.applyServer([info('b1', 1)], [], true);
    for (const reason of ['finished', 'far', 'walkOnly', 'taken', 'gone'] as const) {
      bikes.interact(c);
      bikes.onClaimResult({ t: 'bike', op: 'claim', id: 'b1', ok: false, reason });
    }
    expect([c.riding, notes]).toEqual([null, ['raceOver', 'bikeTooFar', 'walkOnly', 'bikeLost', 'bikeLost']]);
  });

  it('own bike: get off / crash → dismount with where it stands; a lost claim answer frees F after claimTimeoutMs', () => {
    const { c, bikes, sent, frame } = online();
    bikes.applyServer([info('b1', 1)], [], true);
    bikes.interact(c);
    bikes.onClaimResult({ t: 'bike', op: 'claim', id: 'b1', ok: true });
    bikes.applyServer([info('b1', 1, 't0', true)]);
    frame();
    expect(sent).toHaveLength(1); // server already knows it is ridden
    expect(bikes.interact(c)).toBe('dismount');
    frame();
    expect(sent[1]).toMatchObject({ t: 'bike', op: 'dismount', id: 'b1', x: c.riding?.position.x ?? expect.any(Number) });
    frame();
    expect(sent).toHaveLength(2); // once
    bikes.interact(c); // own bike: claim again (the server says yes even when walk-only is off)
    bikes.onClaimResult({ t: 'bike', op: 'claim', id: 'b1', ok: true });
    expect(c.riding?.id).toBe('b1');
    c.crash();
    frame();
    expect(sent.at(-1)).toMatchObject({ t: 'bike', op: 'dismount', id: 'b1' });
    for (let i = 0; i < 60 * (serverBikes.claimTimeoutMs / 1000) + 1; i++) frame();
    c.state.action = 'none';
    const n = sent.length;
    bikes.interact(c);
    for (let i = 0; i < 60 * (serverBikes.claimTimeoutMs / 1000) + 1; i++) frame(); // no answer
    bikes.interact(c);
    expect(sent.length).toBe(n + 2);
  });

  it('the server takes the ridden bike away (parked / released / removed) → the rider is off it', () => {
    const { c, bikes } = online();
    bikes.applyServer([info('b1', 1)], [], true);
    bikes.interact(c);
    bikes.onClaimResult({ t: 'bike', op: 'claim', id: 'b1', ok: true });
    bikes.applyServer([info('b1', 1, null)]);
    expect(c.riding).toBeNull();
    bikes.interact(c);
    bikes.onClaimResult({ t: 'bike', op: 'claim', id: 'b1', ok: true });
    bikes.applyServer([], ['b1']);
    expect([c.riding, bikes.list]).toEqual([null, []]);
  });

  it('server bikes (y unknown) wait for the ground near the player, hidden until then', () => {
    const { bikes, frame } = online();
    const asked: number[][] = [];
    bikes.ground = (x, z, y) => (asked.push([x, z, y]), x < 100 ? 0.25 : null);
    bikes.applyServer([info('near', 3), info('far', 500)], [], true);
    frame();
    expect(asked).toEqual([[3, 0, 0]]); // 500 m is beyond serverBikes.groundRadius
    expect(bikes.list.map((b) => b.position.y)).toEqual([0.25, 0]);
  });
});
