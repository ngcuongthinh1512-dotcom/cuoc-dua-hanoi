import { PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { flyCamera } from '../config.ts';
import type { Input } from '../core/Input.ts';
import { FreeFlyCamera } from './FreeFlyCamera.ts';

const idleInput = (held: string[] = [], wheel = 0) =>
  ({
    mouseDX: 0,
    mouseDY: 0,
    wheel,
    pad: { moveX: 0, moveY: 0, lookX: 0, lookY: 0, rise: 0 },
    isDown: (a: string) => held.includes(a),
  }) as unknown as Input;

describe('FreeFlyCamera', () => {
  it('yaw 0 looks north (−Z)', () => {
    const fly = new FreeFlyCamera(new PerspectiveCamera());
    fly.setPose(0, 0, 0, 0, 0);
    const dir = fly.camera.getWorldDirection(new Vector3());
    expect(dir.x).toBeCloseTo(0);
    expect(dir.y).toBeCloseTo(0);
    expect(dir.z).toBeCloseTo(-1);
  });

  it('clamps pitch just inside ±90°', () => {
    const fly = new FreeFlyCamera(new PerspectiveCamera());
    fly.setPose(0, 0, 0, 0, 120);
    expect(fly.pitch).toBeLessThan(Math.PI / 2);
    expect(fly.pitch).toBeGreaterThan((89.9 * Math.PI) / 180);
    fly.setPose(0, 0, 0, 0, -120);
    expect(fly.pitch).toBeGreaterThan(-Math.PI / 2);
  });

  it('moves forward along the camera view direction (yaw and pitch)', () => {
    const fly = new FreeFlyCamera(new PerspectiveCamera());
    fly.setPose(0, 0, 0, 64, -20);
    fly.update(1, idleInput(['moveForward']));
    const view = fly.camera.getWorldDirection(new Vector3()).multiplyScalar(flyCamera.baseSpeed);
    expect(fly.camera.position.distanceTo(view)).toBeCloseTo(0, 6);
  });

  it('scrolling up one step speeds up by wheelStep', () => {
    const fly = new FreeFlyCamera(new PerspectiveCamera());
    fly.update(0, idleInput([], -1));
    expect(fly.speed).toBeCloseTo(flyCamera.baseSpeed * flyCamera.wheelStep);
  });
});
