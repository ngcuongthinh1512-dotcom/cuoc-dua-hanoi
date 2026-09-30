import RAPIER from '@dimforge/rapier3d-compat';
import { PerspectiveCamera, Vector3 } from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { render, swim, thirdPersonCamera as C } from '../config.ts';
import type { Input } from '../core/Input.ts';
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
