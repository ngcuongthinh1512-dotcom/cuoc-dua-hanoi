// Track B (docs/plans/phase4.md §3.3): simplified bicycle dynamics, pure (no Rapier). Speed along the heading up to
// bikeTopSpeed() = footSpeed × bikeSpeedMultiplier (SPEC §6.1; × movement.sprintMultiplier while Shift is held, SPEC §17.29:
// releasing it bleeds the excess like a sharp-turn cap), 0 → top in bike.accelTime, brake then slow reverse,
// speed-dependent turn rate, sharp-turn speed cap, lean into the turn, less grip on cobbles (SPEC §6.6).
// Position is not touched: CharacterController moves the capsule with the resulting velocity.
import { bike as C, bikeModel, bikeTopSpeed, movement } from '../config.ts';
import type { BikeState, RoadSurface } from './types.ts';

export interface BikeInput {
  /** 0…1 pedalling (W / stick up). */
  throttle: number;
  /** S / stick down: brake, then slow reverse once stopped. */
  brake: boolean;
  /** −1…1, + = left (A), like yaw. */
  turn: number;
  /** Shift / LB held: top × movement.sprintMultiplier (SPEC §17.29). */
  sprint?: boolean;
}

const DEG = Math.PI / 180;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/** One step: updates speed, yaw, steer, lean, wheel and crank angles of `b`. */
export function stepBike(b: BikeState, input: BikeInput, surface: RoadSurface, dt: number) {
  const k = input.sprint ? movement.sprintMultiplier : 1; // SPEC §17.29: the speed cap scales, the bike's handling at a given speed does not
  const base = bikeTopSpeed();
  const top = base * k;
  const grip = surface === 'pave' ? C.paveGrip : 1;
  const accel = (top / C.accelTime) * grip;
  const u = clamp(Math.abs(b.speed) / base, 0, 1);

  // Turning: rate falls with speed, fades out near standstill, reversed when rolling backwards.
  const rate = (C.turnRate.slow + (C.turnRate.top - C.turnRate.slow) * u) * grip * Math.min(1, Math.abs(b.speed) / C.turnMinSpeed);
  const omega = clamp(input.turn, -1, 1) * rate * Math.sign(b.speed);
  b.yaw = Math.atan2(Math.sin(b.yaw + omega * dt), Math.cos(b.yaw + omega * dt));

  // Speed: pedal toward top (capped in sharp turns), coast, brake, reverse.
  const cap = top - C.sharpTurn.loss * k * Math.max(0, Math.abs(omega) - C.sharpTurn.rate); // same share of `top` lost as without sprint
  if (input.brake) {
    b.speed = b.speed > 0 ? Math.max(0, b.speed - C.brakeDecel * grip * dt) : Math.max(-C.reverseSpeed, b.speed - accel * dt);
  } else if (b.speed < 0) {
    b.speed = Math.min(0, b.speed + C.brakeDecel * dt); // released S while reversing: stop
  } else if (b.speed > cap) {
    b.speed = Math.max(cap, b.speed - C.brakeDecel * dt);
  } else if (input.throttle > 0 && b.speed <= top * input.throttle) {
    b.speed = Math.min(cap, top * input.throttle, b.speed + accel * dt);
  } else {
    b.speed = Math.max(0, b.speed - C.coastDecel * dt);
  }

  // Visuals: lean + = right, so a left turn (omega > 0) leans left (−); steer + = left.
  const leanTarget = -clamp((b.speed * omega) / (base * C.turnRate.top), -1, 1) * C.leanMaxDeg * DEG;
  b.lean += (leanTarget - b.lean) * Math.min(1, C.leanSharpness * dt);
  b.steer = clamp(input.turn, -1, 1) * C.steerMaxDeg * DEG * (1 - 0.5 * u);
  const dWheel = (b.speed * dt) / bikeModel.wheelRadius;
  b.wheelAngle += dWheel;
  if (input.throttle > 0 && b.speed > 0) b.crankAngle += dWheel / bikeModel.gearRatio; // freewheel while coasting
}
