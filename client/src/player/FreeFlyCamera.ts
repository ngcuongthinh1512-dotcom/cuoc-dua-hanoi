import { type PerspectiveCamera, Vector3 } from 'three';
import { type Action, flyCamera as C } from '../config.ts';
import type { Input } from '../core/Input.ts';

const DEG = Math.PI / 180;
const MAX_PITCH = Math.PI / 2 - 1e-3; // just inside ±90° so the view never flips
const move = new Vector3();

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const axis = (input: Input, pos: Action, neg: Action) => Number(input.isDown(pos)) - Number(input.isDown(neg));

/** Spectator-style free-fly camera (debug now, spectator mode later, SPEC §8.6). Yaw 0 looks north (−Z). */
export class FreeFlyCamera {
  yaw = 0; // rad, positive turns left (toward −X when facing north)
  pitch = 0; // rad, positive looks up
  speed = C.baseSpeed; // m/s before the flyFast multiplier

  constructor(readonly camera: PerspectiveCamera) {}

  setPose(x: number, y: number, z: number, yawDeg: number, pitchDeg: number) {
    this.camera.position.set(x, y, z);
    this.yaw = yawDeg * DEG;
    this.pitch = pitchDeg * DEG;
    this.apply();
  }

  update(dt: number, input: Input) {
    const { pad } = input;
    this.yaw -= input.mouseDX * C.mouseSensitivity + pad.lookX * C.gamepadLookSpeed * dt;
    this.pitch -= input.mouseDY * C.mouseSensitivity + pad.lookY * C.gamepadLookSpeed * dt;
    if (input.wheel) this.speed = clamp(this.speed * C.wheelStep ** -input.wheel, C.minSpeed, C.maxSpeed);
    this.apply();

    // WASD along the view (full 3D), fly up/down along world Y.
    const f = axis(input, 'moveForward', 'moveBack') - pad.moveY;
    const r = axis(input, 'moveRight', 'moveLeft') + pad.moveX;
    const u = axis(input, 'flyUp', 'flyDown') + pad.rise;
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw), cp = Math.cos(this.pitch);
    // forward = (−sin y·cos p, sin p, −cos y·cos p), right = (cos y, 0, −sin y)
    move.set(-sy * cp * f + cy * r, Math.sin(this.pitch) * f + u, -cy * cp * f - sy * r);
    if (move.lengthSq() > 1) move.normalize();
    const speed = this.speed * (input.isDown('flyFast') ? C.fastMultiplier : 1);
    this.camera.position.addScaledVector(move, speed * dt);
  }

  private apply() {
    this.pitch = clamp(this.pitch, -MAX_PITCH, MAX_PITCH);
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }
}
