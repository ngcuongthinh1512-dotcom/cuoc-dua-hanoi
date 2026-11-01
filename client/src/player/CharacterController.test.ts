import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import RAPIER from '@dimforge/rapier3d-compat';
import { Vector3 } from 'three';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bike as B, bikeTopSpeed, movement, physics, player as P, playerSetup, respawnRules as RR, swim as S, terrain as T } from '../config.ts';
import type { Input } from '../core/Input.ts';
import { type ChunkData, chunkKey, type WaterData } from '../geo/chunkData.ts';
import { districtAt } from '../geo/districts.ts';
import { type HeightGrid, heightAt, parseHeightGrid } from '../geo/heightGrid.ts';
import { NPC_GROUPS } from '../npc/types.ts';
import { buildChunk } from '../world/chunkBuild.ts';
import { newBike } from '../vehicle/Bikes.ts';
import { stairColliders } from '../world/stairs.ts';
import { carveRiver, createTerrainCollider, riverLevel } from '../world/Terrain.ts';
import { CharacterController, haltIntent, moveDirection, newIntent, quayStairNear, readMoveIntent, spiral, tickAction, turnToward, yawOf } from './CharacterController.ts';
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
const walk = (forward = 1, sprint = false, cameraYaw = 0): MoveIntent => ({ forward, right: 0, cameraYaw, sprint, jump: false });
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
  it('walks at footSpeed on flat ground, never faster; sprint (Shift) = × sprintMultiplier (SPEC §17.29); feet on the ground', () => {
    const { world, c } = setup(ground);
    spawned(world, c, 0, 0);
    expect(c.state.position.y).toBeCloseTo(0, 2);
    let max = 0;
    run(world, c, 1, walk(), (s) => void (max = Math.max(max, Math.hypot(s.velocity.x, s.velocity.z))));
    expect(max).toBeLessThanOrEqual(movement.footSpeed * 1.001);
    expect(speedOf(world, c, walk()) / movement.footSpeed).toBeCloseTo(1, 1);
    // ≤ 4 %: Rapier's KCC drops the motion of ~1–3 steps per second on flat ground at any speed (measured 4 / 6 / 12 m/s)
    expect(Math.abs(speedOf(world, c, walk()) - movement.footSpeed)).toBeLessThan(0.04 * movement.footSpeed);
    const sprint = speedOf(world, c, walk(1, true));
    expect(Math.abs(sprint - movement.footSpeed * movement.sprintMultiplier)).toBeLessThan(0.04 * movement.footSpeed * movement.sprintMultiplier);
    expect(c.state.moveMode).toBe('walk');
    run(world, c, 1, walk()); // released: back to footSpeed
    expect(speedOf(world, c, walk()) / movement.footSpeed).toBeCloseTo(1, 1);
    expect(c.state.grounded).toBe(true);
    expect(c.state.position.y).toBeCloseTo(0, 2);
    expect(c.state.yaw).toBeCloseTo(0); // body faces the move direction (north)
    run(world, c, 1, walk(1, false, Math.PI / 2)); // camera turned to the west → body turns west
    expect(c.state.yaw).toBeCloseTo(Math.PI / 2);
  });

  it('climbs a 0.35 m step, a 0.5 m one blocks', () => {
    for (const [h, up] of [[0.35, true], [0.5, false]] as const) {
      const { world, c } = setup((w) => (ground(w), cuboid(w, 0, h / 2, -20, 5, h / 2, 15))); // step face at z = −5, 30 m deep (3 s at footSpeed stays on it)
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
  // Hà Nội pins the river 7 m under flat ground (terrain.waterLevel −7: quay top = the street, no raised band); these cases are about the
  // generic carve on a flat grid with the river at level 0, so the pin is lifted for the block.
  let pinned: number | null;
  beforeAll(() => ((pinned = T.waterLevel), (T.waterLevel = null)));
  afterAll(() => void (T.waterLevel = pinned));
  // River x ∈ [100, 200] (level 0 on a flat grid, bed −riverDepth), quays: wall at x = 100 / 200, coping at quayHeight.
  // The pond widens the water extent in x, so only the river's ends lie on it (no quay across the river there).
  const pond = { river: false, outer: [0, 280, 250, 280, 250, 285, 0, 285] };
  const water: WaterData = { v: 1, polygons: [{ river: true, outer: [100, 0, 200, 0, 200, 300, 100, 300] }, pond] };
  function river(build: (w: RAPIER.World) => void = () => {}, wd: WaterData = water) {
    const g: HeightGrid = { minX: 0, minZ: 0, cell: 5, cols: 61, rows: 61, h: new Float32Array(61 * 61) };
    carveRiver(g, wd);
    const env: PlayerEnv = { heightAt: (x, z) => heightAt(g, x, z), waterLevel: riverLevel(g, wd), water: wd };
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

  // Phase 5 track C (SPEC §4.4): "Kẹt? Về chỗ an toàn" in the river → the nearest quay flight. Two flights: west bank (foot in
  // the water at x 101.2, parapet gap on the wall at x 100) and east bank; water.stairs = feet, water.stairGaps = gaps.
  const withStairs: WaterData = { ...water, stairs: [101.2, 80, 198.8, 220], stairGaps: [100, 70, 200, 230] };

  it('respawn in the river: on the coping at the gap of the nearest flight, facing inland, no longer swimming', () => {
    const { world, c } = river(undefined, withStairs);
    for (const [from, bank, inland, yaw] of [[[150, 100], 100, -1, Math.PI / 2], [[150, 200], 200, 1, -Math.PI / 2]] as const) {
      spawned(world, c, from[0], from[1]);
      run(world, c, 1.5);
      expect(c.state.moveMode).toBe('swim');
      expect(c.respawn()).toBe('stairs');
      expect([c.state.inWater, c.state.moveMode]).toEqual([false, 'walk']); // at once, before the next step
      expect(c.state.yaw).toBeCloseTo(yaw);
      expect(c.renderYaw(0)).toBeCloseTo(yaw); // no blend from the old heading on the first frame
      run(world, c, 1);
      const p = c.state.position;
      expect(Math.sign(p.x - bank)).toBe(inland); // on the land side of the wall
      expect(Math.hypot(p.x - bank, p.z - (bank === 100 ? 70 : 230))).toBeLessThan(1.5); // at the flight's gap, not the other one
      expect(p.y).toBeCloseTo(coping, 1);
      expect([c.state.inWater, c.state.moveMode, c.state.grounded]).toEqual([false, 'walk', true]);
    }
    world.free();
  });

  it('respawn in the river without quay stairs falls back to the safe spot', () => {
    const { world, c } = river();
    spawned(world, c, 150, 100);
    run(world, c, 1.5);
    expect(c.respawn()).toBe('safe');
    world.free();
  });
});

describe('quayStairNear (Phase 5): where a swimmer is put', () => {
  const ring = (x0: number, z0: number, x1: number, z1: number) => [x0, z0, x1, z0, x1, z1, x0, z1];
  // A river square 0…1000 with an island (a hole) 400…600: land is outside the square and inside the hole.
  const water: WaterData = {
    v: 1,
    polygons: [{ river: true, outer: ring(0, 0, 1000, 1000), holes: [ring(400, 400, 600, 600)] }],
    stairs: [2, 500, 500, 398], // feet in the water, [x, z, …]
    stairGaps: [0, 500, 500, 400], // on the wall line: the west bank, the north shore of the island
  };
  it('nearest foot → its gap; the normal points at the land: outwards on the bank, into the hole on the island', () => {
    const at = (x: number, z: number) => Object.values(quayStairNear(water, x, z)!).map((v) => +v.toFixed(6) + 0); // x, z, nx, nz
    expect(at(30, 480)).toEqual([0, 500, -1, 0]); // bank (west edge): land is west
    expect(at(500, 380)).toEqual([500, 400, 0, 1]); // island (north edge of the hole): land is south
    expect(at(900, 900)).toEqual([500, 400, 0, 1]); // nearest foot wins, whichever shore it is on
  });
  it('null without quay stairs or without water data; ponds are not quays', () => {
    expect(quayStairNear(undefined, 0, 0)).toBeNull();
    expect(quayStairNear({ ...water, stairs: undefined }, 0, 0)).toBeNull();
    expect(quayStairNear({ ...water, stairs: [], stairGaps: [] }, 0, 0)).toBeNull();
    expect(quayStairNear({ ...water, polygons: [{ river: false, outer: ring(0, 0, 1000, 1000) }] }, 0, 0)).toBeNull();
  });
});

describe('respawn on land (Phase 5 track C)', () => {
  const flat = (a: Vector3, b: Vector3) => Math.hypot(a.x - b.x, a.z - b.z);

  it("'safe': back to a dry spot minAge s old (not the stuck one), a second press stays put", () => {
    const { world, c } = setup(ground);
    spawned(world, c, 0, 0);
    run(world, c, 9, walk());
    const here = c.state.position.clone();
    expect(c.respawn()).toBe('safe');
    const back = c.state.position.z - here.z; // walked north (−z), so back in +z
    expect(back).toBeGreaterThan(Math.max(RR.minDistance, RR.minAge * movement.footSpeed) - 0.5);
    expect(back).toBeLessThan(RR.minAge * movement.footSpeed + RR.spacing + 1);
    expect(c.state.position.y).toBeCloseTo(0, 1);
    const at = c.state.position.clone();
    c.respawn();
    expect(c.state.position.distanceTo(at)).toBeLessThan(0.05);
    world.free();
  });

  it('stuck standing still for > minAge s after a walk: still back ≥ minDistance along the way (review M2)', () => {
    const { world, c } = setup(ground);
    spawned(world, c, 0, 0);
    run(world, c, 6, walk());
    run(world, c, 9);
    const here = c.state.position.clone();
    c.respawn();
    const back = c.state.position.z - here.z;
    expect(back).toBeGreaterThanOrEqual(RR.minDistance - 0.5);
    expect(back).toBeLessThan(RR.minDistance + RR.spacing + 0.5);
    expect(Math.abs(c.state.position.x)).toBeLessThan(0.5);
    world.free();
  });

  it('pacing a sealed pit (walls 1.5 m, no way out) for 12 s: back out onto the ground it came from (review M2)', () => {
    // Ground at y 0 around a 10 × 10 m pit (|x|, |z| ≤ 5) whose floor is y −1.5: too high to jump or step out.
    const { world, c } = setup((w) => {
      cuboid(w, 0, -0.5, -52.5, 100, 0.5, 47.5);
      cuboid(w, 0, -0.5, 52.5, 100, 0.5, 47.5);
      cuboid(w, -52.5, -0.5, 0, 47.5, 0.5, 5);
      cuboid(w, 52.5, -0.5, 0, 47.5, 0.5, 5);
      cuboid(w, 0, -2, 0, 5, 0.5, 5);
    });
    spawned(world, c, 0, 25);
    run(world, c, 7, walk()); // north, into the pit at z = 5
    expect(c.state.position.y).toBeCloseTo(-1.5, 1);
    for (let k = 0; k < 8; k++) run(world, c, 1.5, walk(1, false, (k * Math.PI) / 2 + 0.3)); // round and round the pit
    const p = c.state.position;
    expect([Math.abs(p.x) < 5, Math.abs(p.z) < 5, p.y < -1]).toEqual([true, true, true]);
    c.respawn();
    run(world, c, 0.2);
    expect(p.y).toBeCloseTo(0, 1);
    expect(Math.max(Math.abs(p.x), Math.abs(p.z))).toBeGreaterThan(5.3);
    world.free();
  });

  it('riding for 10 s: back along the ride, not to where the bike was taken (review M1)', () => {
    const { world, c } = setup(ground);
    spawned(world, c, 0, 0);
    c.ride(newBike('b', 0, c.state.position.y, 0, 0));
    run(world, c, 10, walk());
    const here = c.state.position.clone();
    expect(here.z).toBeLessThan(-40);
    c.respawn();
    const back = c.state.position.z - here.z;
    expect(back).toBeGreaterThanOrEqual(RR.minDistance - 0.5);
    expect(back).toBeLessThan((RR.minAge + 1) * bikeTopSpeed());
    world.free();
  });

  it('haltIntent (menu / full map open while riding): brakes to 0 within the braking distance, never reverses (review M3)', () => {
    const { world, c } = setup(ground);
    spawned(world, c, 0, 0);
    const b = newBike('b', 0, c.state.position.y, 0, 0);
    c.ride(b);
    run(world, c, 3, walk());
    const v = b.speed;
    expect(v).toBeGreaterThan(0.95 * bikeTopSpeed());
    const from = c.state.position.clone();
    const i = walk();
    let min = Infinity;
    for (let k = 0; k < 10 / DT; k++) {
      c.fixedUpdate(DT, haltIntent(i, c.riding));
      world.step();
      min = Math.min(min, b.speed);
    }
    expect([b.speed, min, c.riding]).toEqual([0, 0, b]);
    expect(flat(c.state.position, from)).toBeLessThan((v * v) / (2 * B.brakeDecel) + 0.3);
    expect(c.state.position.z).toBeLessThanOrEqual(from.z); // no roll back
    expect(haltIntent(walk(), null)).toEqual(newIntent()); // on foot: just no input
    world.free();
  });

  it('just spawned: back to the spawn spot', () => {
    const { world, c } = setup(ground);
    spawned(world, c, 3, -4);
    run(world, c, 2, walk());
    c.respawn();
    expect(Math.hypot(c.state.position.x - 3, c.state.position.z + 4)).toBeLessThan(1);
    world.free();
  });

  it('riding: the bike stays on the ground where it was, the rider is on foot (onDismount, not crashed)', () => {
    const { world, c } = setup(ground);
    spawned(world, c, 0, 0);
    const b = newBike('b', 0, c.state.position.y, 0, 0);
    const drops: boolean[] = [];
    c.onDismount = (_b, crashed) => void drops.push(crashed);
    c.ride(b);
    run(world, c, 3, walk());
    const at = c.state.position.clone();
    expect(b.speed).toBeGreaterThan(3);
    c.respawn();
    expect([c.riding, c.state.moveMode, drops, b.speed]).toEqual([null, 'walk', [false], 0]);
    expect(Math.abs(b.position.z - at.z)).toBeLessThan(1); // where its wheels last stood (bikeSafe), not below the world
    expect(b.position.y).toBeCloseTo(0, 1);
    world.free();
  });
});

// The real water (Leg 3 Hà Nội: Sông Tô Lịch / Kim Ngưu / Red River carved at −7 m under flat ground, quay top = the street, 48 quay flights; Brussels: the canal at −10.6 m; Leg 2: the sea; Leg 1: the Seine; client/public/data): climb out at two spots and stand on the Cầu Tô Lịch deck. Skipped without data.
const data = join(import.meta.dirname, '../../public/data');
const has = ['water.json', 'elevation.json', 'elevation.bin', 'chunks/index.json'].every((f) => existsSync(join(data, f)));
describe.skipIf(!has)('real water (rivers)', () => {
  const read = (f: string) => readFileSync(join(data, f));
  const grid = has ? parseHeightGrid(JSON.parse(read('elevation.json').toString()), read('elevation.bin')) : undefined!;
  const water = has ? (JSON.parse(readFileSync(join(data, 'water.json'), 'utf8')) as WaterData) : undefined!;
  if (has) carveRiver(grid, water);
  const env: PlayerEnv = { heightAt: (x, z) => heightAt(grid, x, z), waterLevel: has ? riverLevel(grid, water) : null, water };
  const level = env.waterLevel!;

  it('two climb-out spots (off two quay flights of the Hà Nội rivers) and the Cầu Tô Lịch bridge deck', () => {
    const world = new RAPIER.World(physics.gravity);
    world.timestep = DT;
    createTerrainCollider(world, grid);
    const l4 = { x: (-4932.5 - 4904.1) / 2, z: (1901 + 1871) / 2 }; // Leg 3 Hà Nội: the primary Cầu Tô Lịch deck over the Sông Tô Lịch (Brussels: Place Sainctelette; Leg 1: L4 = middle of Pont Alexandre III)
    for (const key of new Set([chunkKey(l4.x, l4.z), chunkKey(l4.x + 60, l4.z), chunkKey(l4.x - 60, l4.z)])) {
      const file = join(data, `chunks/${key}.json`);
      if (!existsSync(file)) continue;
      const out = buildChunk(JSON.parse(readFileSync(file, 'utf8')) as ChunkData, grid);
      for (const m of out.colliders) world.createCollider(RAPIER.ColliderDesc.trimesh(m.vertices, m.indices));
    }
    const c = new CharacterController(world, env);

    spawned(world, c, l4.x, l4.z);
    expect(c.state.moveMode).toBe('walk');
    expect(c.state.position.y).toBeGreaterThan(level + 3); // on the deck, not in the canal below
    run(world, c, 1);
    expect(c.state.grounded).toBe(true);

    // Swim toward the bank the point is nearest to (a ray scan picks it), holding Space, until climbOut; then on the quay.
    // 12 m out (waterward along the flight's normal) from the feet of the first two quay flights inside the race districts whose
    // 12 m point really is in the carved river (many Hà Nội flights are OSM steps down to a bank path: not on the water).
    const outFrom = (k: number) => {
      const [fx, fz] = [water.stairs![2 * k]!, water.stairs![2 * k + 1]!];
      const q0 = quayStairNear(water, fx, fz)!;
      return { x: fx - q0.nx * 12, z: fz - q0.nz * 12, k, mine: districtAt(water.districts, fx, fz) >= 1 && districtAt(water.districts, fx, fz) <= 3 };
    };
    const spots = Array.from({ length: water.stairs!.length / 2 }, (_, k) => outFrom(k)).filter((w) => w.mine && env.heightAt(w.x, w.z) < level - 1);
    expect(spots.length).toBeGreaterThanOrEqual(2);
    for (const w of spots.slice(0, 2)) {
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

  // Phase 5 track C (SPEC §4.4): the real quay flights (Paris 81, Macao 91). From 8 m out in the water off each flight, "Kẹt?" puts
  // the swimmer on the quay coping at the parapet gap of the flight nearest to him, facing inland, and he stands there (terrain +
  // quay wall colliders only: buildings and props are not built here).
  // Leg 2: of the 91 Macao flights 47 stand inside the 5 freguesias (the rest line the Zhuhai bank and the map corners): those must all
  // pass; 8 m off a flight the swimmer is not in the water at flights 27 and 28 (the islet at the south-west tip), so they are
  // counted, not judged; the flights outside the freguesias are counted too (10 of them fail: 6 not swimming, 4 respawn 'safe').
  it('respawn from the water at every quay flight of the rivers: onto the coping at its gap, facing inland, standing', () => {
    const world = new RAPIER.World(physics.gravity);
    world.timestep = DT;
    createTerrainCollider(world, grid);
    const c = new CharacterController(world, env);
    const feet = water.stairs!;
    expect(feet.length / 2).toBe(48); // Leg 3 Hà Nội: 48 flights (Brussels: 4 on the canal banks)
    const bad: string[] = [];
    const notWater: number[] = [], outside: string[] = [];
    let farthest = 0;
    for (let i = 0; i < feet.length; i += 2) {
      const dist = districtAt(water.districts, feet[i]!, feet[i + 1]!), mine = dist >= 1 && dist <= 3; // inside one of the 3 race districts
      const q0 = quayStairNear(water, feet[i]!, feet[i + 1]!)!;
      const [sx, sz] = [feet[i]! - q0.nx * 8, feet[i + 1]! - q0.nz * 8];
      const q = quayStairNear(water, sx, sz)!; // the flight nearest to where he swims (usually the same)
      spawned(world, c, sx, sz);
      run(world, c, 1);
      const tag = `flight ${i / 2} (${sx.toFixed(0)}, ${sz.toFixed(0)})`;
      if (c.state.moveMode !== 'swim') {
        (mine ? notWater.push(i / 2) : outside.push(`${tag}: not swimming`));
        continue;
      }
      const r = c.respawn();
      run(world, c, 1);
      const p = c.state.position;
      const mode: string = c.state.moveMode;
      const d = Math.hypot(p.x - q.x, p.z - q.z);
      farthest = Math.max(farthest, d);
      const fail = (m: string) => (mine ? bad : outside).push(`${tag}: ${m}`);
      if (r !== 'stairs') fail(r);
      else if (d > 1.5) fail(`${d.toFixed(1)} m from the gap`);
      else if (Math.abs(p.y - (level + T.quayHeight + T.copingLift)) > 0.35) fail(`y ${p.y.toFixed(2)}`);
      else if (c.state.inWater || !c.state.grounded || mode !== 'walk') fail(`${mode}, inWater ${c.state.inWater}`);
      else if (Math.cos(c.state.yaw - yawOf(q.nx, q.nz)) < 0.99) fail('not facing inland');
    }
    console.log(`respawn: ${feet.length / 2} flights, farthest landing ${farthest.toFixed(2)} m from the gap, ${bad.length} failed, ${notWater.length} not in water, ${outside.length} outside the freguesias failed`);
    expect(bad).toEqual([]);
    // Leg 3 Hà Nội: of the 48 flights only 24 have water 8 m out (the others are OSM steps down to a bank path or a dry cut of the carved
    // river): those 24 all pass; the dry ones are counted, not judged (Brussels: all 4 swim, Macao: flights 27 and 28 the same way).
    expect(feet.length / 2 - notWater.length - outside.length).toBeGreaterThanOrEqual(20);
    expect(outside).toEqual([]);
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
    let toasts = 0;
    c.onStairs = () => void toasts++; // Phase 5: the toast "Không đi xe trên bậc thang"
    run(world, c, 4, walk());
    stairColliders.delete(handle);
    expect(drops).toEqual([]);
    expect(c.riding).toBe(b);
    expect(b.speed).toBe(0);
    expect(c.state.position.y).toBeCloseTo(0, 1);
    expect(c.state.position.z).toBeGreaterThan(-8);
    expect(toasts).toBeGreaterThan(0);
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
      let toasts = 0;
      c.onStairs = () => void toasts++;
      run(world, c, 4, walk(-1));
      expect(toasts > 0).toBe(behind === stairs); // the toast for stairs behind, not for a wall
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
      const v = new Float32Array([-2, 0, -8, 2, 0, -8, 2, 1, -8 - L, -2, 1, -8 - L, -2, 1, -60, 2, 1, -60]); // plateau to −60: 5 s at 9 m/s stays on it
      w.createCollider(RAPIER.ColliderDesc.trimesh(v, new Uint32Array([0, 1, 2, 0, 2, 3, 3, 2, 5, 3, 5, 4])));
    });
    let toasts = 0;
    c.onStairs = () => void toasts++;
    run(world, c, 5, walk());
    expect(c.state.position.y).toBeCloseTo(1, 1);
    expect(toasts).toBe(0);
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
