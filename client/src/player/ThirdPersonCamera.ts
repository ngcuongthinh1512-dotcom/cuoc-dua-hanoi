// Track C (docs/plans/phase3.md). STUB until Track C lands: rigid arm behind the pivot, no collision / smoothing / FOV.
import type RAPIER from '@dimforge/rapier3d-compat';
import type { PerspectiveCamera } from 'three';
import { thirdPersonCamera as C } from '../config.ts';
import type { Input } from '../core/Input.ts';
import type { CameraTarget } from './types.ts';

const DEG = Math.PI / 180;
export type CameraMode = (typeof C.modes)[number];

export class ThirdPersonCamera {
  /** Orbit angles, rad (FreeFlyCamera convention: yaw 0 looks north, + = left; pitch + = up). */
  yaw = 0;
  pitch = C.pitchDeg.initial * DEG;
  mode: CameraMode = C.modes[0];

  constructor(
    readonly camera: PerspectiveCamera,
    readonly world: RAPIER.World,
  ) {}

  /** Mouse / right stick → yaw, pitch. Call before readMoveIntent (movement is relative to this yaw). */
  look(input: Input, dt: number) {
    this.yaw -= input.mouseDX * C.mouseSensitivity + input.pad.lookX * C.gamepadLookSpeed * dt;
    this.pitch -= input.mouseDY * C.mouseSensitivity + input.pad.lookY * C.gamepadLookSpeed * dt;
    this.pitch = Math.min(C.pitchDeg.max * DEG, Math.max(C.pitchDeg.min * DEG, this.pitch));
  }

  /** C / View button: near → far → first person → near. */
  cycleMode() {
    this.mode = C.modes[(C.modes.indexOf(this.mode) + 1) % C.modes.length]!;
  }

  /** Places the camera for this frame (after the render pose of the target is known). */
  update(dt: number, t: CameraTarget) {
    void dt;
    const arm = this.mode === 'first' ? { distance: 0, pivot: C.first.eye } : C[this.mode];
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw), cp = Math.cos(this.pitch);
    const d = arm.distance;
    this.camera.position.set(t.position.x + sy * cp * d, t.position.y + arm.pivot - Math.sin(this.pitch) * d, t.position.z + cy * cp * d);
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }
}
