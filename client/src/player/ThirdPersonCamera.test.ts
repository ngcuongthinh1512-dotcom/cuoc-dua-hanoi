import RAPIER from '@dimforge/rapier3d-compat';
import { PerspectiveCamera, Vector3 } from 'three';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { render, swim, thirdPersonCamera as C } from '../config.ts';
import type { Input } from '../core/Input.ts';
import { NPC_GROUPS } from '../npc/types.ts';
import { settings } from '../ui/settings.ts';
import { fovFor, nextArm, ThirdPersonCamera } from './ThirdPersonCamera.ts';
import type { CameraTarget } from './types.ts';

const DEG = Math.PI / 180;
const DT = 1 / 60;
beforeAll(() => RAPIER.init());

const lookInput = (mouseDX = 0, mouseDY = 0) =>
  ({ mouseDX, mouseDY, pad: { moveX: 0, moveY: 0, lookX: 0, lookY: 0, rise: 0 } }) as unknown as Input;

const target = (o: Partial<CameraTarget> = {}): CameraTarget => ({
  position: new Vector3(),
  yaw: 0,
  speed: 0,
  moveMode: 'walk',
  vehicle: 'foot',
  ...o,
});

/** World with the given fixed boxes (half extents, centre); step() so scene queries see them. */
function worldWith(...boxes: [hx: number, hy: number, hz: number, x: number, y: number, z: number][]) {
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  for (const [hx, hy, hz, x, y, z] of boxes) world.createCollider(RAPIER.ColliderDesc.cuboid(hx, hy, hz).setTranslation(x, y, z));
  world.step();
  return world;
}

const run = (cam: ThirdPersonCamera, t: CameraTarget, seconds: number) => {
  for (let s = 0; s < seconds; s += DT) cam.update(DT, t);
};

describe('ThirdPersonCamera', () => {
  it('no wall: full arm behind the shoulder pivot, looking along yaw / pitch (own capsule ignored)', () => {
    const world = worldWith();
    const own = world.createCollider(RAPIER.ColliderDesc.capsule(0.6, 0.3).setTranslation(0, 0.9, 0));
    world.step();
    const cam = new ThirdPersonCamera(new PerspectiveCamera(), world);
    cam.update(DT, target({ collider: own }));
    const n = C.near;
    const pivot = new Vector3(n.shoulder, n.pivot, 0); // yaw 0 faces north: right = +X, behind = +Z
    expect(cam.arm).toBeCloseTo(n.distance, 6);
    expect(cam.camera.position.distanceTo(pivot)).toBeCloseTo(n.distance, 6);
    expect(cam.camera.position.z).toBeGreaterThan(3); // behind a north-facing body
    const view = cam.camera.getWorldDirection(new Vector3());
    expect(view.z).toBeLessThan(-0.9);
    expect(Math.asin(view.y) / DEG).toBeCloseTo(C.pitchDeg.initial, 4);
    expect(cam.camera.near).toBe(C.nearPlane);
  });

  it('Phase 4B: an NPC car (NPC_GROUPS) right behind the pivot is ignored: full arm', () => {
    const world = worldWith();
    world.createCollider(RAPIER.ColliderDesc.cuboid(5, 5, 0.5).setTranslation(0, 0, 2.5).setCollisionGroups(NPC_GROUPS));
    world.step();
    const cam = new ThirdPersonCamera(new PerspectiveCamera(), world);
    cam.update(DT, target());
    expect(cam.arm).toBeCloseTo(C.near.distance, 6);
  });

  it('a wall behind the pivot keeps the camera in front of it by at least the radius; clear again → grows back smoothly', () => {
    const world = worldWith([5, 5, 0.5, 0, 0, 2.5]); // wall face at z = 2
    const cam = new ThirdPersonCamera(new PerspectiveCamera(), world);
    cam.update(DT, target());
    expect(cam.camera.position.z).toBeLessThanOrEqual(2 - C.collisionRadius + 1e-3);
    expect(cam.camera.position.z).toBeGreaterThan(2 - C.collisionRadius - C.collisionSkin - 0.01);
    const short = cam.arm;
    expect(short).toBeLessThan(C.near.distance);

    world.forEachCollider((c) => world.removeCollider(c, false));
    world.step();
    cam.update(DT, target());
    expect(cam.arm).toBeGreaterThan(short);
    expect(cam.arm).toBeLessThan(C.near.distance - 0.5); // not a jump
    run(cam, target(), 3);
    expect(cam.arm).toBeCloseTo(C.near.distance, 2);
  });

  it('a wall at the right shoulder (parallel, or closing in 2° behind): over the left shoulder, full arm', () => {
    for (const deg of [0, -2]) {
      const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 }); // wall face 0.3 m right of the axis, turned toward the back
      const q = { x: 0, y: Math.sin((deg * DEG) / 2), z: 0, w: Math.cos((deg * DEG) / 2) };
      world.createCollider(RAPIER.ColliderDesc.cuboid(0.5, 5, 5).setTranslation(0.8, 0, 0).setRotation(q));
      world.step();
      const cam = new ThirdPersonCamera(new PerspectiveCamera(), world);
      cam.update(DT, target());
      expect(cam.camera.position.x, `${deg}°`).toBeCloseTo(-C.near.shoulder, 6);
      expect(cam.arm, `${deg}°`).toBeCloseTo(C.near.distance, 6);
    }
  });

  it('turning the view so a +X wall comes to the right shoulder: the lens never enters it, on any frame', () => {
    const face = 0.3;
    for (const frames of [1, 6, 15]) {
      const world = worldWith([0.5, 5, 5, face + 0.5, 0, 0]);
      const cam = new ThirdPersonCamera(new PerspectiveCamera(), world);
      cam.yaw = 90 * DEG; // looking west: the wall behind the camera
      for (let i = 0; i <= frames + 60; i++) {
        if (i > 0) cam.yaw = Math.max(0, 90 * DEG * (1 - i / frames));
        cam.update(DT, target());
        expect(cam.camera.position.x, `${frames} frames, frame ${i}`).toBeLessThanOrEqual(face - C.collisionRadius + 1e-3);
      }
      expect(cam.pivot.x, `${frames}`).toBeCloseTo(-C.near.shoulder, 2); // settled over the left shoulder
    }
  });

  it('shoulder swap hysteresis: back to the right only after shoulderSwap.hold s clear; a facade with jogs never flips it', () => {
    const world = worldWith([0.5, 5, 5, 0.8, 0, 0]);
    const cam = new ThirdPersonCamera(new PerspectiveCamera(), world);
    cam.update(DT, target());
    world.forEachCollider((c) => world.removeCollider(c, false));
    world.step();
    run(cam, target(), C.shoulderSwap.hold - 0.1);
    expect(cam.pivot.x).toBeLessThan(0);
    run(cam, target(), 1);
    expect(cam.pivot.x).toBeCloseTo(C.near.shoulder, 2);

    // Walking north at 4 m/s along a facade 0.35 / 0.75 m right of the walking line, alternating every 3 m.
    const jogs = worldWith(...Array.from({ length: 20 }, (_, i) => [0.5, 5, 1.5, (i % 2 ? 0.75 : 0.35) + 0.5, 0, -3 * i - 1.5] as [number, number, number, number, number, number]));
    const walker = new ThirdPersonCamera(new PerspectiveCamera(), jogs);
    const t = target({ speed: 4 });
    let flips = 0;
    let was = 0;
    for (let z = 0; z > -55; z -= 4 * DT) {
      t.position.set(0, 0, z);
      walker.update(DT, t);
      const side = Math.sign(walker.pivot.x);
      if (was && side !== was) flips++;
      was = side;
    }
    expect(flips).toBe(0); // over the left shoulder from the first frame (0.35 m face) to the end
  });

  it('first person → near: the arm snaps out (no frames from inside the head)', () => {
    const cam = new ThirdPersonCamera(new PerspectiveCamera(), worldWith());
    cam.mode = 'first';
    cam.update(DT, target());
    cam.cycleMode();
    expect(cam.mode).toBe('near');
    cam.update(DT, target());
    expect(cam.arm).toBeCloseTo(C.near.distance, 6);
  });

  it('nextArm: shorter at once, longer smoothly', () => {
    expect(nextArm(3, 1, DT)).toBe(1);
    const grown = nextArm(1, 3, DT);
    expect(grown).toBeGreaterThan(1);
    expect(grown).toBeLessThan(1.5);
  });

  it('clamps pitch and cycles near → far → first → near', () => {
    const cam = new ThirdPersonCamera(new PerspectiveCamera(), worldWith());
    cam.look(lookInput(0, -1e6), DT);
    expect(cam.pitch).toBeCloseTo(C.pitchDeg.max * DEG);
    cam.look(lookInput(0, 1e6), DT);
    expect(cam.pitch).toBeCloseTo(C.pitchDeg.min * DEG);
    const seen = [cam.mode];
    for (let i = 0; i < 3; i++) seen.push((cam.cycleMode(), cam.mode));
    expect(seen).toEqual(['near', 'far', 'first', 'near']);
  });

  it('recentres behind a moving body only after the look delay', () => {
    const cam = new ThirdPersonCamera(new PerspectiveCamera(), worldWith());
    cam.look(lookInput(1, 0), DT); // mouse moved: yaw −0.002
    const yaw0 = cam.yaw;
    const t = target({ yaw: 0.6, speed: 4 });
    run(cam, t, C.recenter.delay - 0.1);
    expect(cam.yaw).toBe(yaw0);
    run(cam, t, 2);
    expect(cam.yaw).toBeCloseTo(0.6, 3);
    // Standing still: no recentring; strafing (body 90° off) neither.
    for (const still of [target({ yaw: -1, speed: 0 }), target({ yaw: 0.6 + Math.PI / 2, speed: 4 })]) {
      run(cam, still, 1);
      expect(cam.yaw).toBeCloseTo(0.6, 3);
    }
  });

  it('FOV rises with speed and caps at max', () => {
    expect(fovFor(0)).toBe(render.fov);
    expect(fovFor(2)).toBeCloseTo(render.fov + 2 * C.fovBoost.perMps);
    expect(fovFor(100)).toBe(render.fov + C.fovBoost.max);
    const cam = new ThirdPersonCamera(new PerspectiveCamera(), worldWith());
    cam.update(DT, target());
    expect(cam.camera.fov).toBe(render.fov);
    cam.update(DT, target({ speed: 4 }));
    expect(cam.camera.fov).toBeGreaterThan(render.fov);
    expect(cam.camera.fov).toBeLessThan(fovFor(4) - 0.5); // smoothed
    run(cam, target({ speed: 4 }), 3);
    expect(cam.camera.fov).toBeCloseTo(fovFor(4), 2);
  });

  it('first person sits at eye height just ahead of the axis', () => {
    const cam = new ThirdPersonCamera(new PerspectiveCamera(), worldWith());
    cam.mode = 'first';
    cam.update(DT, target({ position: new Vector3(10, 2, -5) }));
    expect(cam.camera.position.x).toBeCloseTo(10);
    expect(cam.camera.position.y).toBeCloseTo(2 + C.first.eye);
    expect(cam.camera.position.z).toBeCloseTo(-5 - C.first.forward);
  });

  it('bike camera is further and higher', () => {
    const world = worldWith();
    const foot = new ThirdPersonCamera(new PerspectiveCamera(), world);
    const bike = new ThirdPersonCamera(new PerspectiveCamera(), world);
    foot.update(DT, target());
    bike.update(DT, target({ vehicle: 'bike' }));
    expect(bike.arm).toBeCloseTo(foot.arm * C.bike.distanceScale);
    expect(bike.camera.position.y).toBeGreaterThan(foot.camera.position.y + C.bike.pivotAdd - 1e-6);
    expect(bike.camera.position.z).toBeGreaterThan(foot.camera.position.z);
  });

  it('swimming: looking up keeps the lens above the water', () => {
    const cam = new ThirdPersonCamera(new PerspectiveCamera(), worldWith());
    cam.look(lookInput(0, -1e6), DT); // pitch max: the arm goes below the pivot
    const feet = new Vector3(0, -7, 0);
    cam.update(DT, target({ position: feet, moveMode: 'swim' }));
    expect(cam.camera.position.y).toBeCloseTo(feet.y + swim.floatDepth + C.waterClearance);
  });

  it('a teleport (respawn) snaps the pivot, a small move is smoothed', () => {
    const cam = new ThirdPersonCamera(new PerspectiveCamera(), worldWith());
    const t = target();
    cam.update(DT, t);
    t.position.set(0.5, 0, 0);
    cam.update(DT, t);
    expect(cam.pivot.x).toBeLessThan(0.5 + C.near.shoulder - 0.2);
    t.position.set(50, 0, 0);
    cam.update(DT, t);
    expect(cam.pivot.x).toBeCloseTo(50 + C.near.shoulder);
  });
});

describe('ThirdPersonCamera: respawn view + settings (Phase 5)', () => {
  it('a teleport turns the view along the body (respawn: facing inland), a normal step does not', () => {
    const cam = new ThirdPersonCamera(new PerspectiveCamera(), worldWith());
    const t = target({ yaw: 1 });
    cam.yaw = -0.4;
    cam.update(DT, t);
    expect(cam.yaw).toBeCloseTo(-0.4); // placed on the first update: the view is the player's
    t.position.set(0.3, 0, 0);
    cam.update(DT, t);
    expect(cam.yaw).toBeCloseTo(-0.4);
    t.position.set(60, 9, -40);
    cam.update(DT, t);
    expect(cam.yaw).toBeCloseTo(1);
    expect(cam.pivot.x).toBeCloseTo(60 + C.near.shoulder * Math.cos(1)); // and the pivot was already placed for that view
  });

  const padInput = (lookX: number, lookY: number) =>
    ({ mouseDX: 0, mouseDY: 0, pad: { moveX: 0, moveY: 0, lookX, lookY, rise: 0 } }) as unknown as Input;
  const look = (i: Input) => {
    const cam = new ThirdPersonCamera(new PerspectiveCamera(), worldWith());
    cam.look(i, DT);
    return [cam.yaw, cam.pitch - C.pitchDeg.initial * DEG] as const;
  };

  afterEach(() => Object.assign(settings, { invertY: false, mouseSensitivity: 1 }));

  it('invertY flips the vertical look only, mouse and stick', () => {
    for (const i of [lookInput(10, 10), padInput(1, 1)]) {
      settings.invertY = false;
      const [yaw, pitch] = look(i);
      settings.invertY = true;
      const [yawI, pitchI] = look(i);
      expect(pitch).toBeLessThan(0); // mouse down / stick down looks down
      expect(pitchI).toBeCloseTo(-pitch, 9);
      expect(yawI).toBeCloseTo(yaw, 9);
    }
  });

  it('sensitivity 2 × turns twice as far, mouse and stick', () => {
    for (const i of [lookInput(10, 10), padInput(0.5, 0.5)]) {
      settings.mouseSensitivity = 1;
      const [yaw, pitch] = look(i);
      settings.mouseSensitivity = 2;
      const [yaw2, pitch2] = look(i);
      expect(yaw2).toBeCloseTo(2 * yaw, 9);
      expect(pitch2).toBeCloseTo(2 * pitch, 9);
    }
  });
});
