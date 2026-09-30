import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import RAPIER from '@dimforge/rapier3d-compat';
import { latLonToWorld } from '@race/shared';
import { Vector3 } from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { bike as B, bikeTopSpeed, movement, physics, player as P, playerSetup, swim as S, terrain as T } from '../config.ts';
import type { Input } from '../core/Input.ts';
import { type ChunkData, chunkKey, type WaterData } from '../geo/chunkData.ts';
import { type HeightGrid, heightAt, parseHeightGrid } from '../geo/heightGrid.ts';
import { NPC_GROUPS } from '../npc/types.ts';
import { buildChunk } from '../world/chunkBuild.ts';
import { newBike } from '../vehicle/Bikes.ts';
import { stairColliders } from '../world/stairs.ts';
import { carveRiver, createTerrainCollider, riverLevel } from '../world/Terrain.ts';
import { CharacterController, moveDirection, newIntent, readMoveIntent, spiral, tickAction, turnToward, yawOf } from './CharacterController.ts';
import type { MoveIntent, PlayerEnv, PlayerState } from './types.ts';

const fakeInput = (held: string[], pad = { moveX: 0, moveY: 0 }, pressed: string[] = []) =>
  ({ pad: { ...pad, lookX: 0, lookY: 0, rise: 0 }, isDown: (a: string) => held.includes(a), wasPressed: (a: string) => pressed.includes(a) }) as unknown as Input;

const dir = (held: string[], cameraYaw = 0, pad?: { moveX: number; moveY: number }) =>
  moveDirection(readMoveIntent(fakeInput(held, pad), cameraYaw, newIntent())).map((v) => +v.toFixed(6) + 0);

describe('readMoveIntent + moveDirection (camera-relative)', () => {
  it('W goes where the camera looks: north at yaw 0, west at yaw 90°', () => {
    expect(dir(['moveForward'])).toEqual([0, -1]);
    expect(dir(['moveForward'], Math.PI / 2)).toEqual([-1, 0]);
  });
  it('D is to the right (east at yaw 0); W+D is normalised', () => {
    expect(dir(['moveRight'])).toEqual([1, 0]);
    const [x, z] = dir(['moveForward', 'moveRight']);
    expect(Math.hypot(x!, z!)).toBeCloseTo(1);
  });
  it('half stick = half speed share (stick up = −Y)', () => {
    const [x, z] = dir([], 0, { moveX: 0, moveY: -0.5 });
    expect([x, z]).toEqual([0, -0.5]);
  });
  it('jump latches until the consumer clears it', () => {
    const i = readMoveIntent(fakeInput([], undefined, ['jump']), 0, newIntent());
    readMoveIntent(fakeInput([]), 0, i);
    expect(i.jump).toBe(true);
  });
  it('yawOf inverts the heading convention', () => {
    expect(yawOf(0, -1)).toBeCloseTo(0);
    expect(yawOf(-1, 0)).toBeCloseTo(Math.PI / 2);
  });
  it('turnToward takes the short way and stops on the target', () => {
    expect(turnToward(3, -3, 0.1)).toBeCloseTo(3.1); // across ±π
    expect(turnToward(0, 0.05, 0.1)).toBeCloseTo(0.05);
  });
  it('spiral: centre first, then rings out to maxR', () => {
    const pts = [...spiral(5, 5, 2)];
    expect(pts[0]).toEqual([5, 5]);
    expect(Math.max(...pts.map(([x, z]) => Math.hypot(x - 5, z - 5)))).toBeCloseTo(2);
  });
});

describe('tickAction', () => {
  it('locks movement for openBox, then returns to none', () => {
    const s = { action: 'openBox', actionTime: 0 } as PlayerState;
    expect(tickAction(s, 0.1)).toBe(true);
    expect(tickAction(s, playerSetup.actions.openBox.seconds)).toBe(false);
    expect([s.action, s.actionTime]).toEqual(['none', 0]);
  });
  it('wave never locks', () => {
    expect(tickAction({ action: 'wave', actionTime: 0 } as PlayerState, 0.1)).toBe(false);
  });
});

// ── Real Rapier world ──
const DT = physics.fixedDt;
const G = -physics.gravity.y;
beforeAll(() => RAPIER.init());

const flatEnv: PlayerEnv = { heightAt: () => 0, waterLevel: null, water: undefined };
function setup(build: (w: RAPIER.World) => void, env: PlayerEnv = flatEnv) {
  const world = new RAPIER.World(physics.gravity);
  world.timestep = DT;
  build(world);
  return { world, c: new CharacterController(world, env) };
}
const cuboid = (w: RAPIER.World, x: number, y: number, z: number, hx: number, hy: number, hz: number) =>
  w.createCollider(RAPIER.ColliderDesc.cuboid(hx, hy, hz).setTranslation(x, y, z));
/** Ground top at y = 0 over |x|, |z| ≤ 100. */
const ground = (w: RAPIER.World) => cuboid(w, 0, -0.5, 0, 100, 0.5, 100);
const walk = (forward = 1, slow = false, cameraYaw = 0): MoveIntent => ({ forward, right: 0, cameraYaw, slow, jump: false });
/** Steps like main.ts (fixedUpdate, then world.step()); `each` sees the state after every step. */
function run(world: RAPIER.World, c: CharacterController, seconds: number, intent: MoveIntent = newIntent(), each?: (s: PlayerState) => void) {
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    c.fixedUpdate(DT, intent);
    world.step();
    each?.(c.state);
  }
}
/** spawn + the one frozen step (query tree) + the placing step + settle. */
function spawned(world: RAPIER.World, c: CharacterController, x: number, z: number, yaw = 0) {
  c.spawn(x, z, yaw);
  run(world, c, 0.5);
}
/** Horizontal m/s over `seconds` once up to speed. */
function speedOf(world: RAPIER.World, c: CharacterController, intent: MoveIntent, seconds = 1) {
  run(world, c, 0.6, intent);
  const a = c.state.position.clone();
  run(world, c, seconds, intent);
  return Math.hypot(c.state.position.x - a.x, c.state.position.z - a.z) / seconds;
}

describe('CharacterController on a real Rapier world', () => {
  it('walks at footSpeed on flat ground, never faster; slow walk = × slowWalkFactor; feet on the ground', () => {
    const { world, c } = setup(ground);
    spawned(world, c, 0, 0);
    expect(c.state.position.y).toBeCloseTo(0, 2);
    let max = 0;
    run(world, c, 1, walk(), (s) => void (max = Math.max(max, Math.hypot(s.velocity.x, s.velocity.z))));
    expect(max).toBeLessThanOrEqual(movement.footSpeed * 1.001);
    expect(speedOf(world, c, walk()) / movement.footSpeed).toBeCloseTo(1, 1);
    expect(Math.abs(speedOf(world, c, walk()) - movement.footSpeed)).toBeLessThan(0.02 * movement.footSpeed);
    const slow = speedOf(world, c, walk(1, true));
    expect(Math.abs(slow - movement.footSpeed * movement.slowWalkFactor)).toBeLessThan(0.02 * movement.footSpeed * movement.slowWalkFactor);
    expect(c.state.moveMode).toBe('slow');
    expect(c.state.grounded).toBe(true);
    expect(c.state.position.y).toBeCloseTo(0, 2);
    expect(c.state.yaw).toBeCloseTo(0); // body faces the move direction (north)
    run(world, c, 1, walk(1, false, Math.PI / 2)); // camera turned to the west → body turns west
    expect(c.state.yaw).toBeCloseTo(Math.PI / 2);
  });

  it('climbs a 0.35 m step, a 0.5 m one blocks', () => {
    for (const [h, up] of [[0.35, true], [0.5, false]] as const) {
      const { world, c } = setup((w) => (ground(w), cuboid(w, 0, h / 2, -8, 5, h / 2, 3))); // step face at z = −5
      spawned(world, c, 0, 0);
      run(world, c, 3, walk());
      if (up) expect(c.state.position.y).toBeCloseTo(h, 1);
      else expect([c.state.position.y, c.state.position.z]).toEqual([expect.closeTo(0, 1), expect.closeTo(-5 + P.radius, 1)]);
    }
  });

  it('climbs a 40° slope, not a 50° one', () => {
    for (const [deg, up] of [[40, true], [50, false]] as const) {
      const t = Math.tan((deg * Math.PI) / 180);
      const L = 6; // ramp from z = −2 (y 0) north to z = −2 − L
      const v = new Float32Array([-5, 0, -2, 5, 0, -2, 5, L * t, -2 - L, -5, L * t, -2 - L]);
      const { world, c } = setup((w) => (ground(w), w.createCollider(RAPIER.ColliderDesc.trimesh(v, new Uint32Array([0, 1, 2, 0, 2, 3])))));
      spawned(world, c, 0, 0);
      run(world, c, 2.5, walk());
      if (up) expect(c.state.position.y).toBeGreaterThan(2);
      else expect(c.state.position.y).toBeLessThan(0.5);
    }
  });

  it('jumps jumpSpeed² / 2g high (jumps +1, air, consumes intent.jump); walking off a ledge is a fall', () => {
    const { world, c } = setup(ground);
    spawned(world, c, 0, 0);
    const i = { ...newIntent(), jump: true };
    let apex = 0;
    const modes = new Set<string>();
    run(world, c, 1.2, i, (s) => {
      apex = Math.max(apex, s.position.y);
      modes.add(s.moveMode);
    });
    expect(i.jump).toBe(false);
    expect(c.state.jumps).toBe(1);
    expect(apex / (P.jumpSpeed ** 2 / (2 * G))).toBeCloseTo(1, 1);
    expect(modes.has('air')).toBe(true);
    expect([c.state.moveMode, c.state.grounded]).toEqual(['walk', true]);

    const ledge = setup((w) => (ground(w), cuboid(w, 0, 1.5, 0, 5, 1.5, 5))); // 3 m platform, edge at z = −5
    spawned(ledge.world, ledge.c, 0, 0);
    expect(ledge.c.state.position.y).toBeCloseTo(3, 1);
    const seen: string[] = [];
    run(ledge.world, ledge.c, 2.5, walk(), (s) => void seen.push(s.moveMode));
    expect(seen).toContain('air');
    expect(ledge.c.state.jumps).toBe(0); // air without a jump = fall (the animator's cue)
    expect(ledge.c.state.position.y).toBeCloseTo(0, 1);
  });

  it('renderPosition lerps between the last two steps', () => {
    const { world, c } = setup(ground);
    spawned(world, c, 0, 0);
    run(world, c, 0.5, walk());
    const before = c.state.position.clone();
    run(world, c, DT, walk());
    const mid = c.renderPosition(0.5, new Vector3());
    expect(mid.distanceTo(before.clone().lerp(c.state.position, 0.5))).toBeLessThan(1e-6);
    expect(c.renderPosition(1, new Vector3()).distanceTo(c.state.position)).toBeLessThan(1e-6);
  });

  it('renderYaw blends the heading the short way across ±π; teleport resets it', () => {
    const { world, c } = setup(ground);
    spawned(world, c, 0, 0, 3);
    run(world, c, DT, walk(1, false, -3)); // turns 3 → 3 + turnRate·DT, wrapped below −π
    expect(c.state.yaw).toBeLessThan(0);
    const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
    expect(wrap(c.renderYaw(0) - 3)).toBeCloseTo(0, 6);
    expect(wrap(c.renderYaw(0.5) - (3 + (P.turnRate * DT) / 2))).toBeCloseTo(0, 6);
    expect(wrap(c.renderYaw(1) - c.state.yaw)).toBeCloseTo(0, 6);
    c.respawn();
    expect(c.renderYaw(0)).toBe(c.state.yaw);
  });

  it('spawn: highest walkable surface (bridge deck), spiral out of an overlapping pillar, frozen with no ground', () => {
    const bridge = setup((w) => (ground(w), cuboid(w, 0, 4.5, 0, 3, 0.5, 20))); // deck top y = 5
    spawned(bridge.world, bridge.c, 0.3, 0.2);
    expect(bridge.c.state.position.y).toBeCloseTo(5, 1);

    // A 30 m wall face at x = 0.1 (its top is above the spawn ray): the capsule at (0, 0) would overlap it.
    const wall = setup((w) => (ground(w), cuboid(w, 5.1, 15, 0, 5, 15, 5)));
    spawned(wall.world, wall.c, 0, 0);
    const p = wall.c.state.position;
    expect(p.x).toBeLessThan(0.1 - P.radius);
    expect(p.x).toBeGreaterThan(-1.5);
    expect(p.y).toBeCloseTo(0, 1);

    const empty = setup(() => {});
    spawned(empty.world, empty.c, 0, 0);
    run(empty.world, empty.c, 1, walk());
    expect(empty.c.state.position.toArray()).toEqual([0, 0, 0]); // waits on the terrain grid height
  });

  it('respawns on the last safe ground after falling through the world', () => {
    const { world, c } = setup((w) => cuboid(w, 0, -0.5, 0, 10, 0.5, 10)); // ground only |x|, |z| ≤ 10; heightAt says 0 everywhere
    spawned(world, c, 0, 0);
    run(world, c, 1.5); // lastSafe
    run(world, c, 4, walk()); // off the edge at z = −10, down past heightAt − fellThrough
    expect(c.state.position.y).toBeCloseTo(0, 1);
    expect(Math.hypot(c.state.position.x, c.state.position.z)).toBeLessThan(10);
  });
});

describe('swimming (carved grid + quay mesh, like the game)', () => {
  // River x ∈ [100, 200] (level 0 on a flat grid, bed −riverDepth), quays: wall at x = 100 / 200, coping at quayHeight.
  // The pond widens the water extent in x, so only the river's ends lie on it (no quay across the river there).
  const pond = { river: false, outer: [0, 280, 250, 280, 250, 285, 0, 285] };
  const water: WaterData = { v: 1, polygons: [{ river: true, outer: [100, 0, 200, 0, 200, 300, 100, 300] }, pond] };
  function river(build: (w: RAPIER.World) => void = () => {}) {
    const g: HeightGrid = { minX: 0, minZ: 0, cell: 5, cols: 61, rows: 61, h: new Float32Array(61 * 61) };
    carveRiver(g, water);
    const env: PlayerEnv = { heightAt: (x, z) => heightAt(g, x, z), waterLevel: riverLevel(g, water), water };
    return setup((w) => (createTerrainCollider(w, g), build(w)), env);
  }
  const coping = T.quayHeight + T.copingLift;

  it('floats with the head out at the swim speed, then climbs out onto the quay with Space', () => {
    const { world, c } = river();
    spawned(world, c, 150, 50, Math.PI / 2); // facing west
    run(world, c, 2);
    expect(c.state.moveMode).toBe('swim');
    expect(c.state.inWater).toBe(true);
    expect(c.state.position.y).toBeCloseTo(-S.floatDepth, 1);
    const v = speedOf(world, c, walk(1, false, Math.PI / 2));
    expect(Math.abs(v - movement.footSpeed * S.speedFactor)).toBeLessThan(0.02 * movement.footSpeed * S.speedFactor);
    // Swim west to the wall with Space held: no jump in the water until the wall is within reach, then climbOut.
    const i = walk(1, false, Math.PI / 2);
    for (let k = 0; k < 60 * 60 && c.state.action !== 'climbOut'; k++) {
      i.jump = true;
      run(world, c, DT, i);
    }
    expect(c.state.action).toBe('climbOut');
    expect(c.state.jumps).toBe(0);
    expect(c.state.position.x - 100).toBeLessThan(P.radius + S.climbReach + 0.05);
    run(world, c, playerSetup.actions.climbOut.seconds + 0.5);
    expect(c.state.position.y).toBeCloseTo(coping, 1);
    expect(c.state.position.x).toBeLessThan(100);
    expect([c.state.inWater, c.state.moveMode, c.state.grounded]).toEqual([false, 'walk', true]);
  });

  it('spawn over the river: on a bridge deck if there is one, else afloat', () => {
    const deck = coping + 0.5;
    const { world, c } = river((w) => cuboid(w, 150, deck - 0.5, 100, 60, 0.5, 6));
    spawned(world, c, 150, 100);
    expect(c.state.position.y).toBeCloseTo(deck, 1);
    expect(c.state.moveMode).toBe('walk');
    spawned(world, c, 150, 150);
    run(world, c, 1);
    expect(c.state.moveMode).toBe('swim');
    expect(c.state.position.y).toBeCloseTo(-S.floatDepth, 1);
  });
});

// The real Seine (client/public/data): climb out at two spots and stand on Pont Alexandre III (L4). Skipped without data.
const data = join(import.meta.dirname, '../../public/data');
const has = ['water.json', 'elevation.json', 'elevation.bin', 'chunks/index.json'].every((f) => existsSync(join(data, f)));
describe.skipIf(!has)('real Seine', () => {
  const read = (f: string) => readFileSync(join(data, f));
  const grid = has ? parseHeightGrid(JSON.parse(read('elevation.json').toString()), read('elevation.bin')) : undefined!;
  const water = has ? (JSON.parse(readFileSync(join(data, 'water.json'), 'utf8')) as WaterData) : undefined!;
  if (has) carveRiver(grid, water);
  const env: PlayerEnv = { heightAt: (x, z) => heightAt(grid, x, z), waterLevel: has ? riverLevel(grid, water) : null, water };
  const level = env.waterLevel!;

  it('two climb-out spots (east of Pont Alexandre III, below the Musée d’Orsay) and the L4 deck', () => {
    const world = new RAPIER.World(physics.gravity);
    world.timestep = DT;
    createTerrainCollider(world, grid);
    const l4 = latLonToWorld(48.8636, 2.3137); // worker/legs/paris-demo.json L4 = middle of Pont Alexandre III
    for (const key of new Set([chunkKey(l4.x, l4.z), chunkKey(l4.x + 60, l4.z), chunkKey(l4.x - 60, l4.z)])) {
      const file = join(data, `chunks/${key}.json`);
      if (!existsSync(file)) continue;
      const out = buildChunk(JSON.parse(readFileSync(file, 'utf8')) as ChunkData, grid);
      for (const m of out.colliders) world.createCollider(RAPIER.ColliderDesc.trimesh(m.vertices, m.indices));
    }
    const c = new CharacterController(world, env);

    spawned(world, c, l4.x, l4.z);
    expect(c.state.moveMode).toBe('walk');
    expect(c.state.position.y).toBeGreaterThan(level + 3); // on the deck, not in the river 8 m below
    run(world, c, 1);
    expect(c.state.grounded).toBe(true);

    // Swim toward the bank the point is nearest to (a ray scan picks it), holding Space, until climbOut; then on the quay.
    // p3-swim (scripts/screenshot.ts), and 15 m into the river due north of L5 (the Orsay esplanade).
    const l5 = latLonToWorld(48.86027, 2.32506);
    let z5 = l5.z;
    while (env.heightAt(l5.x, z5) > level - 1 && z5 > l5.z - 300) z5--;
    for (const w of [latLonToWorld(48.8637, 2.3155), { x: l5.x, z: z5 - 15 }]) {
      expect(env.heightAt(w.x, w.z)).toBeLessThan(level - 1);
      spawned(world, c, w.x, w.z);
      expect(c.state.moveMode).toBe('swim');
      let best = [Infinity, 0];
      for (let a = 0; a < 360; a += 5) {
        const yaw = (a * Math.PI) / 180;
        const ray = new RAPIER.Ray({ x: w.x, y: level - 0.4, z: w.z }, { x: -Math.sin(yaw), y: 0, z: -Math.cos(yaw) });
        const hit = world.castRay(ray, 300, true, undefined, undefined, c.collider);
        if (hit && hit.timeOfImpact < best[0]!) best = [hit.timeOfImpact, yaw];
      }
      const i = walk(1, false, best[1]);
      for (let k = 0; k < 90 * 60 && c.state.action !== 'climbOut'; k++) {
        i.jump = true;
        run(world, c, DT, i);
      }
      expect(c.state.action, `no climb at ${w.x}, ${w.z}`).toBe('climbOut');
      run(world, c, playerSetup.actions.climbOut.seconds + 1);
      expect(c.state.inWater).toBe(false);
      expect(c.state.moveMode).toBe('walk');
      expect(c.state.grounded).toBe(true);
      expect(c.state.position.y).toBeCloseTo(level + T.quayHeight + T.copingLift, 1); // on the quay coping
    }
    world.free();
  });
});

describe('CharacterController riding a bike (Phase 4 track B)', () => {
  /** Spawned at the origin facing north, mounted on a bike owned by 'Đội A'. */
  function mounted(build: (w: RAPIER.World) => void = ground) {
    const { world, c } = setup(build);
    spawned(world, c, 0, 0);
    const b = newBike('b', c.state.position.x, c.state.position.y, c.state.position.z, 0);
    b.owner = 'Đội A';
    const drops: boolean[] = [];
    c.onDismount = (_b, crashed) => void drops.push(crashed);
    c.ride(b);
    return { world, c, b, drops };
  }

  it('top speed / walk speed = 1.3 ± 1 % on a flat Rapier plane; 0 → 90 % in ~1 s', () => {
    const { world, c } = setup(ground);
    spawned(world, c, 0, 0);
    const foot = speedOf(world, c, walk());
    const m = mounted();
    let t = 0;
    while (Math.hypot(m.c.state.velocity.x, m.c.state.velocity.z) < 0.9 * bikeTopSpeed() && t < 3) {
      run(m.world, m.c, DT, walk());
      t += DT;
    }
    expect(t).toBeGreaterThanOrEqual(0.88);
    expect(t).toBeLessThanOrEqual(1.1);
    const onBike = speedOf(m.world, m.c, walk());
    expect(Math.abs(onBike / foot - movement.bikeSpeedMultiplier)).toBeLessThan(0.01 * movement.bikeSpeedMultiplier);
    expect(m.c.state.moveMode).toBe('bike');
    expect(m.c.state.position.y).toBeCloseTo(0, 2);
    world.free();
    m.world.free();
  });

  it('steering is bike-relative: D turns right (yaw −), the camera yaw is ignored', () => {
    const { world, c, b } = mounted();
    run(world, c, 1.5, { ...walk(1, false, 2), right: 1 });
    expect(b.yaw).toBeLessThan(-0.5);
    expect(c.state.yaw).toBe(b.yaw);
    expect(b.lean).toBeGreaterThan(0);
    world.free();
  });

  it('a wall hit at top speed (≥ crashImpact) crashes: off the bike, crash action, up after it, bike still owned', () => {
    const { world, c, b, drops } = mounted((w) => (ground(w), cuboid(w, 0, 1, -12, 5, 1, 0.5))); // wall face at z = −11.5
    run(world, c, 3, walk());
    expect(drops).toEqual([true]);
    expect(c.riding).toBeNull();
    expect(c.state.action).toBe('crash');
    expect(b.owner).toBe('Đội A');
    expect(b.speed).toBe(0);
    expect(b.position.z).toBeGreaterThan(-11.5); // nose never went through
    run(world, c, playerSetup.actions.crash.seconds);
    expect([c.state.action, c.state.moveMode]).toEqual(['none', 'walk']);
    world.free();
  });

  it('a slow bump (< crashImpact) only stops the bike', () => {
    const { world, c, b, drops } = mounted((w) => (ground(w), cuboid(w, 0, 1, -12, 5, 1, 0.5)));
    const slow = { ...walk(), forward: (0.8 * B.crashImpact) / bikeTopSpeed() };
    run(world, c, 6, slow);
    expect(drops).toEqual([]);
    expect(c.riding).toBe(b);
    expect(b.speed).toBeLessThan(0.5);
    expect(c.state.position.z).toBeGreaterThan(-11.5 + B.wheelBase - B.noseRadius - 0.05);
    world.free();
  });

  it('grazing a wall at a shallow angle only slows the bike', () => {
    // Wall along z at x = −1.5, bike heading 10° into it.
    const { world, c, b, drops } = mounted((w) => (ground(w), cuboid(w, -2, 1, -20, 0.5, 1, 30)));
    b.yaw = (10 * Math.PI) / 180;
    c.state.yaw = b.yaw;
    run(world, c, 3, walk());
    expect(drops).toEqual([]);
    expect(b.speed).toBeGreaterThan(0.8 * bikeTopSpeed());
    expect(c.state.position.x).toBeGreaterThan(-1.5);
    expect(c.state.position.z).toBeLessThan(-10);
    world.free();
  });

  it('cannot ride onto stairs: stops before a stair collider, no crash, no climb', () => {
    let handle = -1;
    const { world, c, b, drops } = mounted((w) => {
      ground(w);
      // 3 m flight going north from z = −8: a ramp collider like track D's (slope 25°)
      const L = 3 / Math.tan((25 * Math.PI) / 180);
      const v = new Float32Array([-2, 0, -8, 2, 0, -8, 2, 3, -8 - L, -2, 3, -8 - L]);
      handle = w.createCollider(RAPIER.ColliderDesc.trimesh(v, new Uint32Array([0, 1, 2, 0, 2, 3]))).handle;
      stairColliders.add(handle);
    });
    run(world, c, 4, walk());
    stairColliders.delete(handle);
    expect(drops).toEqual([]);
    expect(c.riding).toBe(b);
    expect(b.speed).toBe(0);
    expect(c.state.position.y).toBeCloseTo(0, 1);
    expect(c.state.position.z).toBeGreaterThan(-8);
    world.free();
  });

  it('reversing (S once stopped): the rear wheel stops at a wall or at stairs behind, no crash', () => {
    const L = 3 / Math.tan((25 * Math.PI) / 180);
    const stairs = (w: RAPIER.World) => { // 3 m flight going south from z = 2
      const v = new Float32Array([-2, 0, 2, 2, 0, 2, 2, 3, 2 + L, -2, 3, 2 + L]);
      stairColliders.add(w.createCollider(RAPIER.ColliderDesc.trimesh(v, new Uint32Array([0, 1, 2, 0, 2, 3]))).handle);
    };
    for (const behind of [(w: RAPIER.World) => cuboid(w, 0, 1, 2.5, 5, 1, 0.5), stairs]) { // wall face at z = 2
      const { world, c, b, drops } = mounted((w) => (ground(w), behind(w)));
      run(world, c, 4, walk(-1));
      expect(drops).toEqual([]);
      expect(c.riding).toBe(b);
      expect(b.speed).toBe(0);
      expect(c.state.position.y).toBeCloseTo(0, 1);
      expect(c.state.position.z).toBeGreaterThan(0.5); // it did reverse
      expect(c.state.position.z).toBeLessThan(2 - B.rearReach + B.noseRadius + 0.05); // the rear wheel stays out
      world.free();
    }
    stairColliders.clear();
  });

  it('the same ramp without the stairs tag is ridden up', () => {
    const { world, c } = mounted((w) => {
      ground(w);
      const L = 1 / Math.tan((8 * Math.PI) / 180);
      const v = new Float32Array([-2, 0, -8, 2, 0, -8, 2, 1, -8 - L, -2, 1, -8 - L, -2, 1, -30, 2, 1, -30]);
      w.createCollider(RAPIER.ColliderDesc.trimesh(v, new Uint32Array([0, 1, 2, 0, 2, 3, 3, 2, 5, 3, 5, 4])));
    });
    run(world, c, 5, walk());
    expect(c.state.position.y).toBeCloseTo(1, 1);
    world.free();
  });

  it('get off: the bike stays at the feet, the rider lands on its left', () => {
    const { world, c, b, drops } = mounted();
    run(world, c, 1, walk());
    run(world, c, 2, newIntent()); // coast (no brake) then stand
    expect(drops).toEqual([]);
    const at = c.state.position.clone();
    c.ride(null);
    expect(b.position.distanceTo(at)).toBeLessThan(1e-6);
    expect(c.state.position.x).toBeCloseTo(at.x - B.dismountSide, 1); // heading north: left = west
    expect(c.state.moveMode).toBe('walk');
    world.free();
  });
});

describe('NPC car colliders (Phase 4B track D: NPC_GROUPS kinematic cuboids)', () => {
  /** A car-sized kinematic box in NPC_GROUPS, like npc/Npc.ts CarColliders: centre (x, hy, z). */
  const car = (w: RAPIER.World, x: number, z: number, hx = 1, hy = 0.75, hz = 2.3) => {
    const body = w.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(x, hy, z));
    return w.createCollider(RAPIER.ColliderDesc.cuboid(hx, hy, hz).setCollisionGroups(NPC_GROUPS), body);
  };

  it('walking into a car: blocked at its side', () => {
    const { world, c } = setup((w) => (ground(w), car(w, 0, -5, 3, 0.75, 1))); // side face at z = −4
    spawned(world, c, 0, 0);
    run(world, c, 4, walk());
    expect(c.state.position.z).toBeGreaterThan(-4 + P.radius - 0.05);
    expect(c.state.position.y).toBeCloseTo(0, 1);
    world.free();
  });

  it('place() / spawn onto a car: next to it on the ground, never on its roof', () => {
    const { world, c } = setup((w) => (ground(w), car(w, 0, 0)));
    world.step();
    spawned(world, c, 0, 0);
    const p = c.state.position;
    expect(p.y).toBeCloseTo(0, 1);
    expect(Math.abs(p.x) > 1 + P.radius - 0.05 || Math.abs(p.z) > 2.3 + P.radius - 0.05).toBe(true);
    world.free();
  });

  it('push(): moves the body through the KCC, a wall still stops it', () => {
    const { world, c } = setup((w) => (ground(w), cuboid(w, 1.5, 1, 0, 0.5, 1, 5))); // wall face at x = 1
    spawned(world, c, 0, 0);
    for (let i = 0; i < 30; i++) {
      c.push(0.01, 0);
      run(world, c, DT);
    }
    expect(c.state.position.x).toBeCloseTo(0.3, 1);
    for (let i = 0; i < 200; i++) {
      c.push(0.02, 0);
      run(world, c, DT);
    }
    expect(c.state.position.x).toBeLessThan(1 - P.radius + 0.05);
    run(world, c, 0.5); // no push queued → stays
    expect(c.state.position.x).toBeLessThan(1 - P.radius + 0.05);
    world.free();
  });

  it('riding into a car at top speed crashes (onDismount crashed = true), the nose never enters it', () => {
    const { world, c } = setup((w) => (ground(w), car(w, 0, -12, 2.3, 0.75, 1))); // side face at z = −11
    spawned(world, c, 0, 0);
    const b = newBike('b', 0, c.state.position.y, 0, 0);
    const drops: boolean[] = [];
    c.onDismount = (_b, crashed) => void drops.push(crashed);
    c.ride(b);
    run(world, c, 3, walk());
    expect(drops).toEqual([true]);
    expect(c.state.action).toBe('crash');
    expect(b.position.z).toBeGreaterThan(-11);
    world.free();
  });

  it('crash(): thrown off like a strong impact; on foot a no-op', () => {
    const { world, c } = setup(ground);
    spawned(world, c, 0, 0);
    c.crash();
    expect(c.state.action).toBe('none');
    const drops: boolean[] = [];
    c.onDismount = (_b, crashed) => void drops.push(crashed);
    c.ride(newBike('b', 0, 0, 0, 0));
    c.crash();
    expect([drops, c.riding, c.state.action]).toEqual([[true], null, 'crash']);
    world.free();
  });
});
