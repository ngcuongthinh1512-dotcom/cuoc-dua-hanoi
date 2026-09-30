// Track B (docs/plans/phase3.md): Rapier KinematicCharacterController on a capsule (step 0.4 m, slope 45°, ground snap),
// walk / slow walk / jump / fall, swimming in the Seine + climbing out onto a quay, safe spawn and respawn.
import RAPIER from '@dimforge/rapier3d-compat';
import { Vector3 } from 'three';
import { type Action, movement, physics, player as P, playerSetup, swim as S } from '../config.ts';
import type { Input } from '../core/Input.ts';
import type { Gesture, MoveIntent, PlayerEnv, PlayerState } from './types.ts';

const axis = (input: Input, pos: Action, neg: Action) => Number(input.isDown(pos)) - Number(input.isDown(neg));

export const newIntent = (): MoveIntent => ({ forward: 0, right: 0, cameraYaw: 0, slow: false, jump: false });

/** WASD + left stick, camera-relative, length ≤ 1. `jump` is OR-ed in: the consumer clears it. */
export function readMoveIntent(input: Input, cameraYaw: number, out: MoveIntent): MoveIntent {
  const f = axis(input, 'moveForward', 'moveBack') - input.pad.moveY;
  const r = axis(input, 'moveRight', 'moveLeft') + input.pad.moveX;
  const k = Math.min(1, 1 / Math.hypot(f, r)); // Infinity when idle → 1
  out.forward = f * k;
  out.right = r * k;
  out.cameraYaw = cameraYaw;
  out.slow = input.isDown('walkSlow');
  out.jump ||= input.wasPressed('jump');
  return out;
}

/** World XZ direction of the intent (length = stick share): forward = (−sin, −cos), right = (cos, −sin) of cameraYaw. */
export function moveDirection(i: MoveIntent): [number, number] {
  const s = Math.sin(i.cameraYaw), c = Math.cos(i.cameraYaw);
  return [-s * i.forward + c * i.right, -c * i.forward - s * i.right];
}

/** Heading (PlayerState.yaw) that faces world direction (dx, dz). */
export const yawOf = (dx: number, dz: number) => Math.atan2(-dx, -dz);

/** Advances action timing; back to 'none' after playerSetup.actions[a].seconds. True while WASD must be ignored. */
export function tickAction(s: PlayerState, dt: number): boolean {
  if (s.action === 'none') return false;
  s.actionTime += dt;
  const a = playerSetup.actions[s.action];
  if (s.actionTime < a.seconds) return a.locksMovement;
  s.action = 'none';
  s.actionTime = 0;
  return false;
}

/** `yaw` turned toward `target` by at most maxStep rad (shortest way), wrapped to (−π, π]. */
export function turnToward(yaw: number, target: number, maxStep: number): number {
  const d = Math.atan2(Math.sin(target - yaw), Math.cos(target - yaw));
  const y = yaw + Math.max(-maxStep, Math.min(maxStep, d));
  return Math.atan2(Math.sin(y), Math.cos(y));
}

/** Points on rings `step` m apart around (x, z) out to maxR, nearest first (the centre first). */
export function* spiral(x: number, z: number, maxR: number, step = 1): Generator<[number, number]> {
  yield [x, z];
  for (let r = step; r <= maxR; r += step) {
    const n = Math.ceil((2 * Math.PI * r) / step);
    for (let k = 0; k < n; k++) yield [x + r * Math.cos((2 * Math.PI * k) / n), z + r * Math.sin((2 * Math.PI * k) / n)];
  }
}

const DOWN = { x: 0, y: -1, z: 0 };
const NO_ROT = { x: 0, y: 0, z: 0, w: 1 };
const HALF = P.height / 2; // capsule centre above its bottom
const FEET = HALF + P.skin; // the controller keeps the capsule `skin` above the ground: centre − FEET = feet on it
const WALKABLE = Math.cos((P.maxSlopeDeg * Math.PI) / 180); // min |normal.y| of a surface to stand on
const smooth = (a: number, b: number, t: number) => {
  const u = Math.min(Math.max((t - a) / (b - a), 0), 1);
  return u * u * (3 - 2 * u);
};

export class CharacterController {
  readonly state: PlayerState = {
    position: new Vector3(),
    velocity: new Vector3(),
    yaw: 0,
    grounded: true,
    inWater: false,
    moveMode: 'walk',
    jumps: 0,
    action: 'none',
    actionTime: 0,
  };
  /** The capsule (the camera shape cast excludes it). */
  readonly collider: RAPIER.Collider;
  private readonly body: RAPIER.RigidBody;
  private readonly kcc: RAPIER.KinematicCharacterController;
  private readonly shape = new RAPIER.Capsule(HALF - P.radius, P.radius);
  /** Feet and heading at the previous step (renderPosition / renderYaw blend from them). */
  private readonly prev = new Vector3();
  private prevYaw = 0;
  private readonly lastSafe = new Vector3();
  /** Intended horizontal velocity (accelerates toward the input; a wall doesn't reset it) and vertical velocity. */
  private vx = 0;
  private vz = 0;
  private vy = 0;
  private airTime = 0;
  private safeTime = 0;
  private jumped = false;
  /** Spawn waiting for colliders created this frame to enter Rapier's query tree (on the next world.step()). */
  private pending: { x: number; z: number; wait: number } | null = null;
  private climb: { from: Vector3; to: Vector3 } | null = null;

  constructor(
    readonly world: RAPIER.World,
    private readonly env: PlayerEnv,
  ) {
    this.body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased());
    this.collider = world.createCollider(RAPIER.ColliderDesc.capsule(HALF - P.radius, P.radius), this.body);
    const k = (this.kcc = world.createCharacterController(P.skin));
    const slope = (P.maxSlopeDeg * Math.PI) / 180;
    k.setSlideEnabled(true);
    k.enableAutostep(P.maxStep, P.minStepWidth, false);
    k.setMaxSlopeClimbAngle(slope);
    k.setMinSlopeSlideAngle(slope);
    k.enableSnapToGround(P.snapToGround);
  }

  /** Places the feet on safe ground at (x, z): on the terrain grid now (so chunks stream around it), then on the
   *  highest walkable collider at the first fixedUpdate after a world.step() (colliders created this frame are not
   *  queryable before). Frozen until then, and while nothing walkable is below (no fall before the ground exists). */
  spawn(x: number, z: number, yaw: number) {
    Object.assign(this.state, { yaw, action: 'none', actionTime: 0, grounded: true, inWater: false, moveMode: 'walk' });
    this.climb = null;
    this.teleport(x, this.env.heightAt(x, z), z);
    this.lastSafe.copy(this.state.position);
    this.pending = { x, z, wait: 1 };
  }

  /** Back to the last safe ground (fell through the world; Phase 5 menu "Kẹt? Về chỗ an toàn"). */
  respawn() {
    this.climb = null;
    const { x, y, z } = this.lastSafe;
    if (!this.place(x, z)) this.teleport(x, y, z);
  }

  /** One physics step (before world.step()). Consumes intent.jump. */
  fixedUpdate(dt: number, intent: MoveIntent) {
    const s = this.state;
    const jump = intent.jump;
    intent.jump = false;
    this.prev.copy(s.position);
    this.prevYaw = s.yaw;
    if (this.pending) {
      if (this.pending.wait-- <= 0 && this.place(this.pending.x, this.pending.z)) this.pending = null;
      return;
    }
    const locked = tickAction(s, dt);
    if (this.climb) return this.climbStep();

    const p = s.position;
    const level = this.env.waterLevel ?? -Infinity;
    const river = this.overRiver(p.x, p.z);
    const swimming = river && level - p.y > S.enterDepth;
    const [dx, dz] = locked ? [0, 0] : moveDirection(intent);
    const top = movement.footSpeed * (intent.slow ? movement.slowWalkFactor : 1) * (swimming ? S.speedFactor : 1);
    // Step toward the target velocity: |v| stays ≤ max(|v|, |target|), so never above the top speed on flat ground.
    const [ax, az] = [dx * top - this.vx, dz * top - this.vz];
    const k = Math.min(1, (P.accel * dt * (swimming || s.grounded ? 1 : P.airControl)) / (Math.hypot(ax, az) || 1));
    this.vx += ax * k;
    this.vz += az * k;
    if (dx || dz) s.yaw = turnToward(s.yaw, yawOf(dx, dz), P.turnRate * dt);

    let dy: number;
    const g = physics.gravity.y;
    if (swimming) {
      if (jump && !locked && this.tryClimb()) return;
      this.vy = S.buoyancy * (level - S.floatDepth - p.y); // spring toward the float height, no gravity, no jump
      dy = this.vy * dt;
    } else {
      if (jump && !locked && s.grounded) {
        this.vy = P.jumpSpeed;
        this.jumped = true;
        s.jumps++;
      }
      dy = (this.vy + 0.5 * g * dt) * dt; // exact for constant gravity: apex = jumpSpeed² / 2g
      this.vy += g * dt;
    }

    this.kcc.computeColliderMovement(this.collider, { x: this.vx * dt, y: dy, z: this.vz * dt });
    const m = this.kcc.computedMovement();
    const c = this.collider.translation();
    this.body.setNextKinematicTranslation({ x: c.x + m.x, y: c.y + m.y, z: c.z + m.z });
    p.set(c.x + m.x, c.y + m.y - FEET, c.z + m.z);
    s.velocity.set(m.x / dt, m.y / dt, m.z / dt);
    s.grounded = !swimming && this.kcc.computedGrounded();
    if (s.grounded && this.vy <= 0) {
      this.vy = 0;
      this.airTime = 0;
      this.jumped = false;
    } else if (!swimming) {
      this.airTime += dt;
      this.vy = Math.min(this.vy, m.y / dt); // a ceiling stops the jump; an autostep lift never launches us
    }
    s.inWater = river && p.y < level;
    s.moveMode = swimming ? 'swim' : this.jumped || this.airTime > P.fallDelay ? 'air' : intent.slow ? 'slow' : 'walk';

    if (p.y < P.respawnBelow || p.y < this.env.heightAt(p.x, p.z) - P.fellThrough) return this.respawn();
    if ((this.safeTime += dt) >= P.safeEvery && s.grounded && !s.inWater) {
      this.safeTime = 0;
      this.lastSafe.copy(p);
    }
  }

  /** Feet at the render time: lerp(previous step, latest step, alpha) (GameLoop.alpha). */
  renderPosition(alpha: number, out: Vector3): Vector3 {
    return out.lerpVectors(this.prev, this.state.position, alpha);
  }

  /** Heading at the render time (shortest way): the body turns smoothly on a 120 / 144 Hz screen too. */
  renderYaw(alpha: number): number {
    const d = this.state.yaw - this.prevYaw;
    return this.prevYaw + Math.atan2(Math.sin(d), Math.cos(d)) * alpha;
  }

  /** Starts a gesture unless one is running; false if refused. */
  startAction(a: Gesture): boolean {
    if (this.state.action !== 'none') return false;
    this.state.action = a;
    this.state.actionTime = 0;
    return true;
  }

  /** Carved river bed under (x, z) (carveRiver lowers it to waterLevel − terrain.riverDepth). */
  private overRiver(x: number, z: number) {
    return this.env.waterLevel !== null && this.env.heightAt(x, z) < this.env.waterLevel - 1;
  }

  /** Feet y on the highest walkable surface at (x, z) (bridge deck over river bed), or a swimmer's float height over
   *  open water; null if nothing walkable is below. The ray is nudged 1 mm off the 5 m grid lines: Rapier's vertical
   *  ray can slip through the heightfield exactly on a triangle edge. */
  private surface(x: number, z: number): number | null {
    const ground = this.env.heightAt(x, z);
    const from = Math.max(ground, this.env.waterLevel ?? -Infinity) + P.spawnCastHeight;
    const ray = new RAPIER.Ray({ x: x + 0.001, y: from, z: z + 0.001 }, DOWN);
    const hit = this.world.castRayAndGetNormal(ray, from - ground + 10, true, undefined, undefined, this.collider);
    if (!hit || Math.abs(hit.normal.y) < WALKABLE) return null;
    const y = from - hit.timeOfImpact;
    const level = this.env.waterLevel ?? -Infinity;
    return this.overRiver(x, z) && y < level - S.enterDepth ? level - S.floatDepth : y;
  }

  /** The capsule with its feet at y would touch a collider (lifted so a 45° floor under it doesn't count). */
  private overlaps(x: number, y: number, z: number) {
    const at = { x, y: y + HALF + P.radius / WALKABLE - P.radius + P.skin, z };
    return !!this.world.intersectionWithShape(at, NO_ROT, this.shape, undefined, undefined, this.collider);
  }

  /** Nearest free walkable spot within spawnSearch m (spiral), else the first walkable one; false if none at all. */
  private place(x: number, z: number): boolean {
    let first: [number, number, number] | undefined;
    for (const [cx, cz] of spiral(x, z, P.spawnSearch)) {
      const y = this.surface(cx, cz);
      if (y === null) continue;
      if (!this.overlaps(cx, y, cz)) {
        this.teleport(cx, y, cz);
        return true;
      }
      first ??= [cx, y, cz];
    }
    if (first) this.teleport(...first);
    return !!first;
  }

  /** Moves the capsule now (no sweep) and forgets velocity; renderPosition does not lerp across it. */
  private teleport(x: number, y: number, z: number) {
    this.body.setTranslation({ x, y: y + FEET, z }, true);
    this.world.propagateModifiedBodyPositionsToColliders();
    this.state.position.set(x, y, z);
    this.state.velocity.set(0, 0, 0);
    this.prev.copy(this.state.position);
    this.prevYaw = this.state.yaw;
    this.vx = this.vz = this.vy = this.airTime = 0;
    this.jumped = false;
  }

  /** Swimming + Space: a wall within climbReach ahead with walkable ground on top above the water → climbOut.
   *  ponytail: climbs out anywhere, because the lower quays are not carved (Terrain.carveRiver), so the OSM stairs never
   *  reach the water and the quay wall rises ~8 m straight out of it; once berges are carved, allow it only at OSM
   *  steps / ramps. */
  private tryClimb(): boolean {
    const s = this.state;
    const [fx, fz] = [-Math.sin(s.yaw), -Math.cos(s.yaw)];
    const c = this.collider.translation();
    const ahead = new RAPIER.Ray(c, { x: fx, y: 0, z: fz });
    const wall = this.world.castRayAndGetNormal(ahead, P.radius + S.climbReach, true, undefined, undefined, this.collider);
    if (!wall || Math.abs(wall.normal.y) > 0.5) return false;
    const d = wall.timeOfImpact + S.climbLand;
    const [x, z] = [c.x + fx * d, c.z + fz * d];
    const from = s.position.y + S.climbHeight;
    const down = new RAPIER.Ray({ x, y: from, z }, DOWN);
    const top = this.world.castRayAndGetNormal(down, S.climbHeight + 2, true, undefined, undefined, this.collider);
    if (!top || Math.abs(top.normal.y) < WALKABLE) return false;
    const y = from - top.timeOfImpact;
    if (y < (this.env.waterLevel ?? -Infinity) || this.overlaps(x, y, z) || !this.startAction('climbOut')) return false;
    this.climb = { from: s.position.clone(), to: new Vector3(x, y, z) };
    return true;
  }

  /** climbOut (playerSetup.actions.climbOut s): up the wall until clear of the parapet, then over it and down onto the
   *  landing. Kinematic, no sweep. */
  private climbStep() {
    const s = this.state;
    const { from, to } = this.climb!;
    if (s.action !== 'climbOut') {
      this.climb = null;
      return this.teleport(to.x, to.y, to.z);
    }
    const t = s.actionTime / playerSetup.actions.climbOut.seconds;
    const h = smooth(0.55, 1, t);
    const y = from.y + (to.y + S.climbClear - from.y) * smooth(0, 0.55, t) - S.climbClear * h;
    s.position.set(from.x + (to.x - from.x) * h, y, from.z + (to.z - from.z) * h);
    this.body.setNextKinematicTranslation({ x: s.position.x, y: y + FEET, z: s.position.z });
    s.velocity.set(0, 0, 0);
    s.grounded = false;
    s.inWater = y < (this.env.waterLevel ?? -Infinity);
    s.moveMode = 'walk';
  }
}
