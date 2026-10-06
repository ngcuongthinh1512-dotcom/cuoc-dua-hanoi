import { describe, expect, it } from 'vitest';
import { bike as C, bikeModel, bikeTopSpeed, movement, physics } from '../config.ts';
import { type BikeInput, stepBike } from './BikeController.ts';
import { newBike } from './Bikes.ts';
import type { BikeState, RoadSurface } from './types.ts';

const DT = physics.fixedDt;
const go = (throttle = 1, turn = 0, brake = false, sprint = false): BikeInput => ({ throttle, turn, brake, sprint });
function run(b: BikeState, input: BikeInput, seconds: number, surface: RoadSurface = 'asphalt') {
  for (let i = 0; i < Math.round(seconds / DT); i++) stepBike(b, input, surface, DT);
  return b;
}
/** s until speed ≥ share × top from standstill. */
function timeTo(share: number, surface: RoadSurface = 'asphalt') {
  const b = newBike('t', 0, 0, 0, 0);
  let t = 0;
  while (b.speed < share * bikeTopSpeed() - 1e-9 && t < 5) {
    stepBike(b, go(), surface, DT);
    t += DT;
  }
  return t;
}

describe('stepBike (pure bicycle dynamics, SPEC §6.1 / §6.6)', () => {
  it('top speed = footSpeed × bikeSpeedMultiplier (± 1 %), never above', () => {
    const b = newBike('t', 0, 0, 0, 0);
    let max = 0;
    for (let i = 0; i < 5 / DT; i++) {
      stepBike(b, go(), 'asphalt', DT);
      max = Math.max(max, b.speed);
    }
    expect(Math.abs(b.speed / movement.footSpeed - movement.bikeSpeedMultiplier)).toBeLessThan(0.015);
    expect(max).toBeLessThanOrEqual(bikeTopSpeed() + 1e-9);
  });
  it('SPEC §17.29: sprint = top × sprintMultiplier, released → bleeds back to top; a sharp turn still slows', () => {
    const b = run(newBike('t', 0, 0, 0, 0), go(1, 0, false, true), 4);
    expect(b.speed).toBeCloseTo(bikeTopSpeed() * movement.sprintMultiplier, 5);
    expect(run(b, go(1, 1, false, true), 3).speed).toBeLessThan(bikeTopSpeed() * movement.sprintMultiplier * 0.95);
    expect(run(b, go(), 4).speed).toBeCloseTo(bikeTopSpeed(), 5);
  });
  it('0 → 90 % of top in 0.9–1.1 s (accelTime ~1 s)', () => {
    expect(timeTo(0.9)).toBeGreaterThanOrEqual(0.9 - DT);
    expect(timeTo(0.9)).toBeLessThanOrEqual(1.1);
    expect(timeTo(1)).toBeCloseTo(C.accelTime, 1);
  });
  it('braking stops (then reverses slowly); coasting slows', () => {
    const b = run(newBike('t', 0, 0, 0, 0), go(), 2);
    const top = b.speed;
    run(b, go(0), 1);
    expect(b.speed).toBeLessThan(top);
    expect(b.speed).toBeGreaterThan(0);
    const v = b.speed;
    let t = 0;
    for (; b.speed > 0; t += DT) stepBike(b, go(0, 0, true), 'asphalt', DT);
    expect(t).toBeCloseTo(v / C.brakeDecel, 1);
    expect(b.speed).toBe(0);
    run(b, go(0, 0, true), 2);
    expect(b.speed).toBeCloseTo(-C.reverseSpeed);
    run(b, go(0), 1);
    expect(b.speed).toBe(0);
  });
  it('turning left (A) turns + yaw and leans left (−), right leans right (+)', () => {
    for (const turn of [1, -1]) {
      const b = run(newBike('t', 0, 0, 0, 0), go(), 2);
      run(b, go(1, turn), 0.5);
      expect(Math.sign(b.yaw)).toBe(turn);
      expect(Math.sign(b.lean)).toBe(-turn);
      expect(Math.sign(b.steer)).toBe(turn);
      expect(Math.abs(b.lean)).toBeLessThanOrEqual((C.leanMaxDeg * Math.PI) / 180 + 1e-9);
    }
  });
  it('a sharp turn bleeds speed, a gentle one does not', () => {
    const sharp = run(run(newBike('t', 0, 0, 0, 0), go(), 2), go(1, 1), 3).speed;
    const gentle = run(run(newBike('t', 0, 0, 0, 0), go(), 2), go(1, 0.3), 3).speed;
    expect(sharp).toBeLessThan(0.95 * bikeTopSpeed());
    expect(gentle).toBeCloseTo(bikeTopSpeed(), 5);
  });
  it('cobbles: slower turn and acceleration, same top speed', () => {
    const turned = (s: RoadSurface) => run(run(newBike('t', 0, 0, 0, 0), go(), 2, s), go(1, 1), 0.3, s).yaw;
    expect(turned('pave')).toBeLessThan(turned('asphalt'));
    expect(timeTo(0.9, 'pave')).toBeGreaterThan(timeTo(0.9));
    expect(run(newBike('t', 0, 0, 0, 0), go(), 3, 'pave').speed).toBeCloseTo(bikeTopSpeed(), 5);
  });
  it('no spinning on the spot; wheel angle = distance / wheelRadius; crank freewheels', () => {
    const b = run(newBike('t', 0, 0, 0, 0), go(0, 1), 1);
    expect(b.yaw).toBe(0);
    run(b, go(), 2);
    let dist = 0;
    const w0 = b.wheelAngle;
    const c0 = b.crankAngle;
    for (let i = 0; i < 60; i++) {
      stepBike(b, go(), 'asphalt', DT);
      dist += b.speed * DT;
    }
    expect(b.wheelAngle - w0).toBeCloseTo(dist / bikeModel.wheelRadius, 6);
    expect(b.crankAngle - c0).toBeCloseTo(dist / bikeModel.wheelRadius / bikeModel.gearRatio, 6);
    const c1 = b.crankAngle;
    run(b, go(0), 0.5);
    expect(b.crankAngle).toBe(c1);
  });
  it('one step costs ≤ 0.1 ms', () => {
    const b = newBike('t', 0, 0, 0, 0);
    const t = performance.now();
    for (let i = 0; i < 10_000; i++) stepBike(b, go(1, Math.sin(i)), 'asphalt', DT);
    expect((performance.now() - t) / 10_000).toBeLessThan(0.1);
  });
});
