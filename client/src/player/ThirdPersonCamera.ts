// GTA-style third-person camera (SPEC §5, STYLE_GUIDE "Camera"): spring arm over the right shoulder, Rapier ball
// shape cast so it never enters a wall, smoothed pivot, auto-recentre behind the body, speed FOV, near / far / first
// person, bike hook (Phase 4). All tunables: config thirdPersonCamera.
import RAPIER from '@dimforge/rapier3d-compat';
import { type PerspectiveCamera, Vector3 } from 'three';
import { render, swim, thirdPersonCamera as C } from '../config.ts';
import type { Input } from '../core/Input.ts';
import { IGNORE_NPC } from '../npc/types.ts';
import { settings } from '../ui/settings.ts';
import type { CameraTarget } from './types.ts';

const DEG = Math.PI / 180;
export type CameraMode = (typeof C.modes)[number];

/** Share of the remaining gap closed this frame by exponential smoothing (frame-rate independent). */
export const follow = (sharpness: number, dt: number) => 1 - Math.exp(-sharpness * dt);
/** Shortest signed angle from a to b, rad. */
export const angleDelta = (a: number, b: number) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
export const clampPitch = (p: number) => Math.min(C.pitchDeg.max * DEG, Math.max(C.pitchDeg.min * DEG, p));
/** Vertical FOV (°) at a horizontal speed (m/s). */
export const fovFor = (speed: number) => render.fov + Math.min(C.fovBoost.max, C.fovBoost.perMps * Math.max(0, speed));
/** Arm length for this frame: an obstacle shortens it at once, a clear arm grows back smoothly. */
export const nextArm = (arm: number, free: number, dt: number) => (free < arm ? free : arm + (free - arm) * follow(C.armReturn, dt));

const NO_ROTATION = { x: 0, y: 0, z: 0, w: 1 };
const goal = new Vector3();
const shoulderAt = new Vector3();
const dir = new Vector3();

export class ThirdPersonCamera {
  /** Orbit angles, rad (FreeFlyCamera convention: yaw 0 looks north, + = left; pitch + = up). */
  yaw = 0;
  pitch = C.pitchDeg.initial * DEG;
  mode: CameraMode = C.modes[0];
  /** Current arm length (m) after collision; 0 in first person. */
  arm = 0;
  /** Pivot (smoothed axis + smoothed shoulder offset: above the feet, right of the spine). */
  readonly pivot = new Vector3();
  private readonly axis = new Vector3(); // smoothed capsule-axis point at pivot height
  private side = 0; // smoothed shoulder offset, m (+ = right)
  private left = false; // over the left shoulder (wall on the right)
  private clearFor = 0; // s the right side has been clear while `left`
  private placed = false; // the first update (and a mode change) snaps pivot, arm and FOV
  private sinceLook = Infinity; // s since the last mouse / stick look
  private readonly ball: RAPIER.Ball;

  constructor(
    readonly camera: PerspectiveCamera,
    readonly world: RAPIER.World,
  ) {
    this.ball = new RAPIER.Ball(C.collisionRadius);
  }

  /** Mouse / right stick → yaw, pitch, scaled by the menu's settings (sensitivity; invert Y flips the vertical axis).
   *  Call before readMoveIntent (movement is relative to this yaw). */
  look(input: Input, dt: number) {
    const k = settings.mouseSensitivity;
    const dYaw = k * (input.mouseDX * C.mouseSensitivity + input.pad.lookX * C.gamepadLookSpeed * dt);
    const dPitch = k * (settings.invertY ? -1 : 1) * (input.mouseDY * C.mouseSensitivity + input.pad.lookY * C.gamepadLookSpeed * dt);
    if (dYaw || dPitch) this.sinceLook = 0;
    this.yaw -= dYaw;
    this.pitch = clampPitch(this.pitch - dPitch);
  }

  /** C / View button: near → far → first person → near. */
  cycleMode() {
    this.mode = C.modes[(C.modes.indexOf(this.mode) + 1) % C.modes.length]!;
    this.placed = false; // first → near must not grow the arm out of the head
  }

  /** Places the camera for this frame (after the render pose of the target is known). */
  update(dt: number, t: CameraTarget) {
    const mode = this.mode;
    const arm = mode === 'first' ? undefined : C[mode]; // undefined = first person
    const first = !arm;
    this.sinceLook += dt;
    if (!first && t.speed > C.recenter.minSpeed && this.sinceLook > C.recenter.delay) {
      const d = angleDelta(this.yaw, t.yaw);
      this.yaw += Math.sign(d) * Math.min(Math.abs(d), C.recenter.rate * Math.max(0, Math.cos(d)) * dt);
    }

    const bike = t.vehicle === 'bike';
    const lift = arm ? arm.pivot + (bike ? C.bike.pivotAdd : 0) : C.first.eye;
    goal.set(t.position.x, t.position.y + lift, t.position.z); // on the capsule axis
    const jumped = this.axis.distanceToSquared(goal) > C.snapDistance ** 2;
    if (jumped && this.placed) this.yaw = t.yaw; // teleported (Phase 5 respawn): look along the body again
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw), sp = Math.sin(this.pitch), cp = Math.cos(this.pitch);
    const shoulder = arm?.shoulder ?? 0;
    // Rubbing along a wall on the right: over the left shoulder instead (GTA), else the back cast starts against that
    // wall and grazes it as soon as the view is a degree off parallel (arm ≈ 0, the lens in the head). Back to the
    // right only once that side has been clear by shoulderSwap.margin for shoulderSwap.hold s (no flip-flop on jogs).
    if (shoulder > 0) {
      const m = C.shoulderSwap.margin;
      const clear = this.cast(goal, dir.set(cy, 0, -sy), shoulder + m, t.collider); // = shoulder + m: nothing hit
      if (clear < shoulder) [this.left, this.clearFor] = [true, 0];
      else if (clear < shoulder + m) this.clearFor = 0;
      else if (this.left && (this.clearFor += dt) >= C.shoulderSwap.hold) this.left = false;
    }
    const sideGoal = this.left ? -shoulder : shoulder;
    // First person follows the head exactly: pivot lag with the body hidden is what makes people sick.
    const snap = !this.placed || first || jumped;
    const k = snap ? 1 : follow(C.followSharpness, dt);
    // Axis point and shoulder offset are smoothed apart, so the casts below always start on the capsule (the old
    // "smoothed pivot − the new shoulder" sat up to 2 × shoulder off it, inside the wall, while a swap glided over).
    this.axis.lerp(goal, k);
    this.side += (sideGoal - this.side) * k;
    const ahead = first ? C.first.forward : 0;
    // right = (cos y, 0, −sin y), horizontal forward = (−sin y, 0, −cos y)
    const a = this.axis;
    this.pivot.set(a.x + cy * this.side - sy * ahead, a.y, a.z - sy * this.side - cy * ahead);

    const cam = this.camera;
    if (!arm) {
      this.arm = 0;
      cam.position.copy(this.pivot);
    } else {
      // Capsule axis → shoulder (a wall at the shoulder pulls the pivot in), then shoulder → back along the view.
      const r = Math.sign(this.side);
      const toShoulder = this.side ? this.cast(a, dir.set(cy * r, 0, -sy * r), Math.abs(this.side), t.collider) : 0;
      shoulderAt.copy(a).addScaledVector(dir, toShoulder);
      dir.set(sy * cp, -sp, cy * cp); // = −(view direction)
      const free = this.cast(shoulderAt, dir, arm.distance * (bike ? C.bike.distanceScale : 1), t.collider);
      this.arm = snap ? free : nextArm(this.arm, free, dt);
      cam.position.copy(shoulderAt).addScaledVector(dir, this.arm);
    }
    // The Seine has no underwater look: keep the lens above the surface (swimming feet sit swim.floatDepth below it).
    if (t.moveMode === 'swim') cam.position.y = Math.max(cam.position.y, t.position.y + swim.floatDepth + C.waterClearance);
    cam.rotation.set(this.pitch, this.yaw, 0, 'YXZ');

    const fov = this.placed ? cam.fov + (fovFor(t.speed) - cam.fov) * follow(C.fovBoost.sharpness, dt) : fovFor(t.speed);
    if (Math.abs(fov - cam.fov) > 1e-4 || cam.near !== C.nearPlane) {
      cam.fov = fov;
      cam.near = C.nearPlane;
      cam.updateProjectionMatrix();
    }
    this.placed = true;
  }

  /** Free distance (m) a ball of collisionRadius travels from `from` along unit `d`, up to `max`, minus collisionSkin.
   *  NPC cars are ignored (IGNORE_NPC): a car driving past must not yank the arm in. */
  private cast(from: Vector3, d: Vector3, max: number, exclude: RAPIER.Collider | undefined) {
    const hit = this.world.castShape(from, NO_ROTATION, d, this.ball, 0, max, true, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, IGNORE_NPC, exclude);
    return hit ? Math.max(0, hit.time_of_impact - C.collisionSkin) : max;
  }
}
