// Track B (docs/plans/phase3.md). STUB until Track B lands: glides on the terrain grid, no Rapier, no jump / swim.
import type RAPIER from '@dimforge/rapier3d-compat';
import { Vector3 } from 'three';
import { type Action, movement, playerSetup } from '../config.ts';
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
  /** The capsule (the camera shape cast excludes it); undefined in the stub. */
  readonly collider: RAPIER.Collider | undefined = undefined;

  constructor(
    readonly world: RAPIER.World,
    private readonly env: PlayerEnv,
  ) {}

  /** Places the feet on safe ground at (x, z); called again once the chunk colliders around it exist. */
  spawn(x: number, z: number, yaw: number) {
    this.state.position.set(x, this.env.heightAt(x, z), z);
    this.state.velocity.set(0, 0, 0);
    this.state.yaw = yaw;
  }

  /** One physics step (before world.step()). Consumes intent.jump. */
  fixedUpdate(dt: number, intent: MoveIntent) {
    const s = this.state;
    const locked = tickAction(s, dt);
    intent.jump = false;
    const [dx, dz] = locked ? [0, 0] : moveDirection(intent);
    const speed = movement.footSpeed * (intent.slow ? movement.slowWalkFactor : 1);
    s.velocity.set(dx * speed, 0, dz * speed);
    s.position.addScaledVector(s.velocity, dt);
    s.position.y = this.env.heightAt(s.position.x, s.position.z);
    if (dx || dz) s.yaw = yawOf(dx, dz);
    s.moveMode = intent.slow ? 'slow' : 'walk';
  }

  /** Feet at the render time: lerp(previous step, latest step, alpha) (GameLoop.alpha). */
  renderPosition(alpha: number, out: Vector3): Vector3 {
    void alpha;
    return out.copy(this.state.position);
  }

  /** Starts a gesture unless one is running; false if refused. */
  startAction(a: Gesture): boolean {
    if (this.state.action !== 'none') return false;
    this.state.action = a;
    this.state.actionTime = 0;
    return true;
  }
}
