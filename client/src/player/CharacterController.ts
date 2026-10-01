// Track B (docs/plans/phase3.md): Rapier KinematicCharacterController on a capsule (step 0.4 m, slope 45°, ground snap),
// walk / slow walk / jump / fall, swimming in the Seine + climbing out onto a quay, safe spawn and respawn.
// Phase 4 track B: riding (ride(bike)) moves the same capsule with the bike's velocity (vehicle/BikeController.ts), a
// front-wheel probe keeps the nose out of walls and off stairs, a strong impact is a crash (SPEC §6.3).
import RAPIER from '@dimforge/rapier3d-compat';
import { Vector3 } from 'three';
import { type Action, bike as B, movement, physics, player as P, playerSetup, raceClient as RC, respawnRules as RR, roads as RL, swim as S } from '../config.ts';
import type { Input } from '../core/Input.ts';
import type { WaterData } from '../geo/chunkData.ts';
import { inRing } from '../geo/districts.ts';
import { stepBike } from '../vehicle/BikeController.ts';
import type { BikeState, RoadSurface } from '../vehicle/types.ts';
import { IGNORE_NPC } from '../npc/types.ts';
import { stairColliders } from '../world/stairs.ts';
import { castColumn, pickSurface } from './railDecks.ts';
import type { Gesture, MoveIntent, PlayerEnv, PlayerState } from './types.ts';

const axis = (input: Input, pos: Action, neg: Action) => Number(input.isDown(pos)) - Number(input.isDown(neg));

export const newIntent = (): MoveIntent => ({ forward: 0, right: 0, cameraYaw: 0, slow: false, jump: false });

/** Phase 5, menu / full map open (Player, every physics step): no input; a ridden bike brakes (S) to a stop, never on into
 *  reverse (review M3). */
export const haltIntent = (out: MoveIntent, riding: BikeState | null): MoveIntent =>
  Object.assign(out, newIntent(), { forward: riding && riding.speed > 0 ? -1 : 0 });

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

/** Phase 5 (SPEC §4.4): the quay flight whose foot is nearest (x, z), as where to put a swimmer: the parapet gap at the top
 *  of the flight (on the wall line) and the unit normal there pointing inland (perpendicular to the nearest river edge, the
 *  side that is not water). null without quay stairs. ponytail: linear scans of the 81 feet and ~1.8k river edges, only when
 *  the player asks ("Kẹt?"); a grid if it ever runs per frame. */
export function quayStairNear(water: WaterData | undefined, x: number, z: number): { x: number; z: number; nx: number; nz: number } | null {
  const feet = water?.stairs, gaps = water?.stairGaps;
  if (!water || !feet?.length || !gaps) return null;
  let at = 0;
  for (let i = 2, best = Math.hypot(feet[0]! - x, feet[1]! - z); i < feet.length; i += 2) {
    const d = Math.hypot(feet[i]! - x, feet[i + 1]! - z);
    if (d < best) [at, best] = [i, d];
  }
  const [gx, gz] = [gaps[at]!, gaps[at + 1]!];
  let [nx, nz, best] = [0, 0, Infinity];
  for (const p of water.polygons) {
    if (!p.river) continue;
    for (const r of [p.outer, ...(p.holes ?? [])]) {
      for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
        const [ex, ez] = [r[i]! - r[j]!, r[i + 1]! - r[j + 1]!];
        const len = Math.hypot(ex, ez) || 1;
        const t = Math.min(len, Math.max(0, ((gx - r[j]!) * ex + (gz - r[j + 1]!) * ez) / len));
        const d = Math.hypot(gx - (r[j]! + (ex / len) * t), gz - (r[j + 1]! + (ez / len) * t));
        if (d < best) [nx, nz, best] = [-ez / len, ex / len, d];
      }
    }
  }
  if (!isFinite(best)) return null;
  const wet = (px: number, pz: number) => water.polygons.some((p) => p.river && inRing(px, pz, p.outer) && !(p.holes ?? []).some((h) => inRing(px, pz, h)));
  return wet(gx + nx, gz + nz) ? { x: gx, z: gz, nx: -nx, nz: -nz } : { x: gx, z: gz, nx, nz };
}

const DOWN = { x: 0, y: -1, z: 0 };
const NO_ROT = { x: 0, y: 0, z: 0, w: 1 };
const HALF = P.height / 2; // capsule centre above its bottom
const FEET = HALF + P.skin; // the controller keeps the capsule `skin` above the ground: centre − FEET = feet on it
const WALKABLE = Math.cos((P.maxSlopeDeg * Math.PI) / 180); // min |normal.y| of a surface to stand on
/** A shoved step (an NPC car overlaps the body) ignores the NPC cars: the KCC can't sweep out of a box it starts in. */
const shoved = (sx: number, sz: number) => (sx || sz ? IGNORE_NPC : undefined);
/** …so the own move (mx, mz) of a shoved step loses its part against the shove: no walking (riding) on into the car
 *  (review m7). ponytail: a second car the body walks into while shoved is still ignored during the shove (it then
 *  shoves the body out too); two KCC passes (shove without NPCs, own move with them) if that shows. */
export function unshoved(mx: number, mz: number, sx: number, sz: number): [number, number] {
  const d = mx * sx + mz * sz;
  if (d >= 0) return [mx, mz];
  const k = d / (sx * sx + sz * sz);
  return [mx - sx * k, mz - sz * k];
}
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
  /** Dry ground the body stood on (on foot or riding), by distance: a new spot once respawnRules.spacing m from the newest,
   *  older spots that close to it dropped (pacing a sealed yard or standing still never floods it); newest last,
   *  ≤ respawnRules.history. `t` = this.clock when it was stood on. See respawn(). */
  private safe: { p: Vector3; t: number }[] = [];
  /** s of fixedUpdate so far (ages of the safe spots). */
  private clock = 0;
  /** Intended horizontal velocity (accelerates toward the input; a wall doesn't reset it) and vertical velocity. */
  private vx = 0;
  private vz = 0;
  private vy = 0;
  private airTime = 0;
  private jumped = false;
  /** Spawn waiting for colliders created this frame to enter Rapier's query tree (on the next world.step()). */
  private pending: { x: number; z: number; wait: number; yHint: number | undefined } | null = null;
  private climb: { from: Vector3; to: Vector3 } | null = null;
  private bike: BikeState | null = null;
  /** Last grounded dry spot while riding: where the bike stays when the rider ends up in the Seine. */
  private readonly bikeSafe = new Vector3();
  private readonly nose = new RAPIER.Ball(B.noseRadius);
  /** Horizontal shove (m) queued by push() for the next step (an NPC car overlapping the body). */
  private shoveX = 0;
  private shoveZ = 0;
  /** Surface under the wheels (main.ts: RoadGraph.surfaceAt once roadgraph.json loaded). */
  surfaceAt: (x: number, z: number) => RoadSurface = () => 'asphalt';
  /** The controller dropped the bike itself: crash (strong impact, `crashed`) or fell into the water. */
  onDismount: (b: BikeState, crashed: boolean) => void = () => {};
  /** Phase 7 D17 (main.ts: RailDecks.at): (x, z) under an upper rail viaduct deck → never stand on its top; undefined =
   *  not known yet (a pending spawn waits for it; other placements take it as false). */
  railAt: (x: number, z: number) => boolean | undefined = () => false;
  /** Phase 5 (track C calls it): the front / rear wheel stopped at a stair flight (SPEC §6.6) → toast "Không đi xe trên
   *  bậc thang" (the toast feed drops repeats). */
  onStairs: () => void = () => {};

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
   *  queryable before). Frozen until then, and while nothing walkable is below (no fall before the ground exists).
   *  `yHint` (Phase 7, re-entry: welcome.pose.y): the ray starts raceClient.hintAbove over it first (the deck / promenade
   *  the team stood on, not a viaduct or bridge above it). */
  spawn(x: number, z: number, yaw: number, yHint?: number) {
    Object.assign(this.state, { yaw, action: 'none', actionTime: 0, grounded: true, inWater: false, moveMode: 'walk' });
    this.climb = null;
    this.teleport(x, this.env.heightAt(x, z), z);
    this.forgetSafe();
    this.pending = { x, z, wait: 1, yHint };
  }

  /** The bike being ridden, null on foot. */
  get riding(): BikeState | null {
    return this.bike;
  }

  /** False until the spawn found its ground (Player places the dev bikes after that). */
  get placed() {
    return !this.pending;
  }

  /** Mount `b` (the capsule jumps onto its pivot, heading = the bike's), or get off (null): the bike stays at the feet
   *  with speed 0, the rider lands bike.dismountSide m to its left (nearest free spot). */
  ride(b: BikeState | null) {
    const s = this.state;
    if (b) {
      this.bike = b;
      this.climb = null;
      s.yaw = b.yaw;
      this.teleport(b.position.x, b.position.y, b.position.z);
      this.bikeSafe.copy(b.position);
      s.moveMode = 'bike';
      return;
    }
    const old = this.bike;
    if (!old) return;
    this.bike = null;
    Object.assign(old, { speed: 0, lean: 0, steer: 0, yaw: s.yaw });
    old.position.copy(s.position);
    s.moveMode = 'walk';
    const [x, z] = [s.position.x - Math.cos(s.yaw) * B.dismountSide, s.position.z + Math.sin(s.yaw) * B.dismountSide];
    if (!this.place(x, z)) this.teleport(s.position.x, s.position.y, s.position.z);
  }

  /** Back to safe ground (fell through the world; the menu's "Kẹt? Về chỗ an toàn"): from the Seine onto the parapet gap at
   *  the top of the nearest quay flight, facing inland ('stairs', SPEC §4.4); otherwise ('safe') to the newest remembered
   *  dry spot that is ≥ respawnRules.minAge s old AND ≥ respawnRules.minDistance m away, else the oldest one, so not to
   *  the place one is stuck in (also after standing still, or pacing a sealed yard smaller than minDistance). Riding: the
   *  bike stays where its wheels last stood on dry ground.
   *  ponytail: straight-line distance, not reachability: a sealed area wider than minDistance can still keep you inside,
   *  and a spot behind a wall counts as away; pick spots on the road graph's walk component (nearestNode) if that shows. */
  respawn(): 'safe' | 'stairs' {
    const s = this.state;
    this.climb = null;
    if (s.action === 'climbOut') [s.action, s.actionTime] = ['none', 0];
    this.dropBike();
    let result: 'safe' | 'stairs' = 'safe';
    const q = s.inWater || s.moveMode === 'swim' ? quayStairNear(this.env.water, s.position.x, s.position.z) : null;
    if (q && this.placeExact(q.x + q.nx * RR.stairsInland, q.z + q.nz * RR.stairsInland)) {
      s.yaw = this.prevYaw = yawOf(q.nx, q.nz); // renderYaw must not blend from the old heading
      result = 'stairs';
    } else {
      let pick = this.safe[0];
      for (let i = this.safe.length - 1; i >= 0; i--) {
        const { p, t } = this.safe[i]!;
        if (this.clock - t >= RR.minAge && Math.hypot(p.x - s.position.x, p.z - s.position.z) >= RR.minDistance) {
          pick = this.safe[i];
          break;
        }
      }
      const { x, y, z } = pick?.p ?? s.position;
      if (!this.place(x, z)) this.teleport(x, y, z);
    }
    Object.assign(s, { inWater: false, grounded: true, moveMode: 'walk' });
    this.forgetSafe(); // pressed again at once: stay here, not back to the old spot
    return result;
  }

  /** The safe-spot history = only where the body is now. */
  private forgetSafe() {
    this.safe = [{ p: this.state.position.clone(), t: this.clock }];
  }

  /** Dry ground under the body now (on foot or riding): kept once respawnRules.spacing m from the newest spot. */
  private rememberSafe(p: Vector3) {
    const far = (q: Vector3) => Math.hypot(q.x - p.x, q.z - p.z) >= RR.spacing;
    const last = this.safe.at(-1);
    if (last && !far(last.p)) return;
    this.safe = this.safe.filter((e) => far(e.p));
    if (this.safe.push({ p: p.clone(), t: this.clock }) > RR.history) this.safe.shift();
  }

  /** Phase 4B: moves the body (dx, dz) m at the next fixedUpdate, through the KCC (walls still stop it). Accumulates. */
  push(dx: number, dz: number) {
    this.shoveX += dx;
    this.shoveZ += dz;
  }

  /** One physics step (before world.step()). Consumes intent.jump and the push(). */
  fixedUpdate(dt: number, intent: MoveIntent) {
    const s = this.state;
    const jump = intent.jump;
    intent.jump = false;
    const [sx, sz] = [this.shoveX, this.shoveZ];
    this.shoveX = this.shoveZ = 0;
    this.prev.copy(s.position);
    this.prevYaw = s.yaw;
    this.clock += dt;
    if (this.pending) {
      const { x, z, yHint } = this.pending;
      if (this.railAt(x, z) !== undefined && this.pending.wait-- <= 0 && this.place(x, z, yHint)) {
        this.pending = null;
        this.forgetSafe(); // the spawn found its real ground
      }
      return;
    }
    const locked = tickAction(s, dt);
    if (this.climb) return this.climbStep();
    if (this.bike) return this.rideStep(dt, intent, this.bike, sx, sz);

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

    const [mx, mz] = unshoved(this.vx * dt, this.vz * dt, sx, sz);
    this.kcc.computeColliderMovement(this.collider, { x: mx + sx, y: dy, z: mz + sz }, undefined, shoved(sx, sz));
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
    if (s.grounded && !s.inWater) this.rememberSafe(p);
  }

  /** One riding step: stepBike → velocity along the heading through the KCC. The front-wheel probe finds what the nose
   *  would hit this step: its head-on share of the speed is the impact (≥ bike.crashImpact → crash, SPEC §6.3), below
   *  that the bike turns along the obstacle and loses (1 − wallKeep) of the head-on share (SPEC §6.1). Reversing, the
   *  rear-wheel probe stops the bike at an obstacle (reverseSpeed never crashes). */
  private rideStep(dt: number, intent: MoveIntent, b: BikeState, sx: number, sz: number) {
    const s = this.state;
    const p = s.position;
    stepBike(b, { throttle: Math.max(0, intent.forward), brake: intent.forward < -0.1, turn: -intent.right }, this.surfaceAt(p.x, p.z), dt);
    const [fx, fz] = [-Math.sin(b.yaw), -Math.cos(b.yaw)];
    let d = b.speed * dt;
    const hit = d > 0 ? this.wheelProbe(fx, fz, d, B.wheelBase) : d < 0 ? this.wheelProbe(-fx, -fz, -d, B.rearReach) : undefined;
    if (hit === null) {
      b.speed = d = 0; // stairs ahead / behind: stop like at a wall, no crash (SPEC §6.6)
      this.onStairs();
    } else if (hit && d < 0) {
      b.speed = 0;
      d = -hit.free;
    } else if (hit) {
      const into = -(fx * hit.nx + fz * hit.nz); // cos of the angle between the heading and the obstacle's normal
      const impact = b.speed * into;
      if (impact >= B.crashImpact) return this.crash();
      const [tx, tz] = [fx + hit.nx * into, fz + hit.nz * into]; // heading slid along the obstacle
      if (Math.hypot(tx, tz) > 1e-3) b.yaw = yawOf(tx, tz);
      b.speed = Math.max(0, b.speed * Math.sqrt(1 - into * into) - (1 - B.wallKeep) * impact);
      d = hit.free;
    }
    s.yaw = b.yaw;
    const g = physics.gravity.y;
    const dy = (this.vy + 0.5 * g * dt) * dt;
    this.vy += g * dt;
    const [mx, mz] = unshoved(fx * d, fz * d, sx, sz);
    this.kcc.computeColliderMovement(this.collider, { x: mx + sx, y: dy, z: mz + sz }, undefined, shoved(sx, sz));
    const m = this.kcc.computedMovement();
    const c = this.collider.translation();
    this.body.setNextKinematicTranslation({ x: c.x + m.x, y: c.y + m.y, z: c.z + m.z });
    p.set(c.x + m.x, c.y + m.y - FEET, c.z + m.z);
    s.velocity.set(m.x / dt, m.y / dt, m.z / dt);
    s.grounded = this.kcc.computedGrounded();
    if (s.grounded) this.vy = 0;
    else this.vy = Math.min(this.vy, m.y / dt);
    const level = this.env.waterLevel ?? -Infinity;
    s.inWater = this.overRiver(p.x, p.z) && p.y < level;
    if (p.y < P.respawnBelow || p.y < this.env.heightAt(p.x, p.z) - P.fellThrough) return this.respawn();
    if (s.inWater) {
      // Rode into the Seine: the bike stays on the last dry ground, the rider swims (next step).
      this.dropBike();
      s.moveMode = 'swim';
      return;
    }
    if (s.grounded) this.bikeSafe.copy(p), this.rememberSafe(p); // respawn while riding: back along the ride (review M1)
    // The capsule's side against a wall the probe missed: keep only the speed actually made. Ground contacts don't
    // count (Rapier's KCC now and then returns no motion for one step on flat ground).
    for (let i = 0; i < this.kcc.numComputedCollisions(); i++) {
      const n = this.kcc.computedCollision(i)?.normal1;
      if (n && Math.abs(n.y) < WALKABLE) {
        b.speed = Math.min(b.speed, Math.max(0, (m.x * fx + m.z * fz) / dt));
        break;
      }
    }
  }

  /** The rider is off without a dismount (into the Seine, respawn): the bike stays on the last dry ground its wheels stood
   *  on, onDismount(b, false). No-op on foot. */
  private dropBike() {
    const b = this.bike;
    if (!b) return;
    this.bike = null;
    Object.assign(b, { speed: 0, lean: 0, steer: 0 });
    b.position.copy(this.bikeSafe);
    this.onDismount(b, false);
  }

  /** Thrown off the bike (strong impact; Phase 4B: riding into a pedestrian, npc/Npc.ts). No-op on foot. */
  crash() {
    const b = this.bike;
    if (!b) return;
    this.ride(null);
    this.startAction('crash');
    this.onDismount(b, true);
  }

  /** What the wheel `base` m from the pivot along (fx, fz) (a bike.noseRadius ball at bike.noseHeight) would hit
   *  moving `want` m that way: how far the pivot may go (`free`) and the obstacle's horizontal normal; undefined if
   *  nothing; null when that, or the ground under the wheel, is a stair collider (world/stairs.ts). Obstacles the
   *  direction is parallel to or moving away from are ignored. */
  private wheelProbe(fx: number, fz: number, want: number, base: number): { free: number; nx: number; nz: number } | null | undefined {
    const p = this.state.position;
    const top = p.y + P.maxStep + 0.5;
    const ahead = base + want;
    const ray = new RAPIER.Ray({ x: p.x + fx * ahead, y: top, z: p.z + fz * ahead }, DOWN);
    const under = this.world.castRay(ray, top - p.y + 1.5, true, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, undefined, this.collider);
    if (under && stairColliders.has(under.collider.handle)) return null;
    const reach = base - B.noseRadius;
    const from = { x: p.x, y: p.y + B.noseHeight, z: p.z };
    const hit = this.world.castShape(from, NO_ROT, { x: fx, y: 0, z: fz }, this.nose, 0, reach + want, true,
      RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, undefined, this.collider);
    if (!hit) return undefined;
    if (stairColliders.has(hit.collider.handle)) return null;
    const [nx, nz] = [-hit.normal2.x, -hit.normal2.z]; // ball's contact normal, reversed = the obstacle's
    const h = Math.hypot(nx, nz);
    if (h < 1e-3 || -(fx * nx + fz * nz) / h < 0.02) return undefined;
    return { free: Math.max(0, hit.time_of_impact - reach), nx: nx / h, nz: nz / h };
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

  /** Feet y on the highest walkable surface at (x, z) (bridge deck over river bed; never an NPC car roof, never the top
   *  of a rail viaduct: Phase 7 D17, player/railDecks.ts), or a swimmer's float height over open water; null if nothing
   *  walkable is below. `yHint`: from just above that height first (re-entry), the usual ray if nothing is there. */
  private surface(x: number, z: number, yHint?: number): number | null {
    const ground = this.env.heightAt(x, z);
    const rail = !!this.railAt(x, z);
    const top = Math.max(ground, this.env.waterLevel ?? -Infinity) + P.spawnCastHeight + (rail ? RL.bridge.railLayerStep : 0);
    // the hinted ray starts under any viaduct (the team never stood on one): a plain highest-surface pick there
    const cast = (from: number, r: boolean) => pickSurface(castColumn(this.world, x, z, from, from - ground + 10, r, WALKABLE, this.collider), r);
    const y = (yHint !== undefined && yHint < top ? cast(yHint + RC.hintAbove, false) : null) ?? cast(top, rail);
    if (y === null) return null;
    const level = this.env.waterLevel ?? -Infinity;
    return this.overRiver(x, z) && y < level - S.enterDepth ? level - S.floatDepth : y;
  }

  /** The capsule with its feet at y would touch a collider (lifted so a 45° floor under it doesn't count). */
  private overlaps(x: number, y: number, z: number) {
    const at = { x, y: y + HALF + P.radius / WALKABLE - P.radius + P.skin, z };
    return !!this.world.intersectionWithShape(at, NO_ROT, this.shape, undefined, undefined, this.collider);
  }

  /** Nearest free walkable spot within spawnSearch m (spiral), else the first walkable one; false if none at all. */
  private place(x: number, z: number, yHint?: number): boolean {
    let first: [number, number, number] | undefined;
    for (const [cx, cz] of spiral(x, z, P.spawnSearch)) {
      const y = this.surface(cx, cz, yHint);
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

  /** Exactly (x, z) or nothing: onto the walkable surface there if it is dry and free, else false (no spiral search). */
  private placeExact(x: number, z: number): boolean {
    const y = this.surface(x, z);
    if (y === null || y < (this.env.waterLevel ?? -Infinity) || this.overlaps(x, y, z)) return false;
    this.teleport(x, y, z);
    return true;
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
