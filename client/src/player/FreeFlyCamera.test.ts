import { PerspectiveCamera, Vector3 } from 'three';
import { afterEach, describe, expect, it } from 'vitest';
import { flyCamera } from '../config.ts';
import type { Input } from '../core/Input.ts';
import { settings } from '../ui/settings.ts';
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

describe('FreeFlyCamera: settings (Phase 5)', () => {
  const lookInput = (mouseDX: number, mouseDY: number, lookX = 0, lookY = 0) =>
    ({ mouseDX, mouseDY, wheel: 0, pad: { moveX: 0, moveY: 0, lookX, lookY, rise: 0 }, isDown: () => false }) as unknown as Input;
  const turned = (i: Input) => {
    const fly = new FreeFlyCamera(new PerspectiveCamera());
    fly.setPose(0, 0, 0, 0, 0);
    fly.update(1 / 60, i);
    return [fly.yaw, fly.pitch] as const;
  };
  afterEach(() => Object.assign(settings, { invertY: false, mouseSensitivity: 1 }));

  it('invertY flips the pitch only; sensitivity 2 × doubles both (mouse and stick)', () => {
    for (const i of [lookInput(10, 10), lookInput(0, 0, 1, 1)]) {
      const [yaw, pitch] = turned(i);
      expect(pitch).toBeLessThan(0); // mouse down looks down
      settings.invertY = true;
      const [yawI, pitchI] = turned(i);
      expect(pitchI).toBeCloseTo(-pitch, 9);
      expect(yawI).toBeCloseTo(yaw, 9);
      settings.invertY = false;
      settings.mouseSensitivity = 2;
      const [yaw2, pitch2] = turned(i);
      expect(yaw2).toBeCloseTo(2 * yaw, 9);
      expect(pitch2).toBeCloseTo(2 * pitch, 9);
      settings.mouseSensitivity = 1;
    }
  });
});
