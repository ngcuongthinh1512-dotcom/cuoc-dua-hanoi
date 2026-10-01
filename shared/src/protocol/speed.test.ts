import { describe, expect, it } from 'vitest';
import { NET } from './constants.ts';
import { overSpeed, SpeedWindow } from './speed.ts';

/** Feeds `seconds` of straight motion at `mps` (5 Hz), starting at t0, x0. */
function walk(w: SpeedWindow, t0: number, x0: number, mps: number, seconds: number) {
  for (let i = 0; i <= seconds * 5; i++) w.push(t0 + i * 200, x0 + mps * i * 0.2, 0);
  return { t: t0 + seconds * 1000, x: x0 + mps * seconds };
}

describe('SpeedWindow', () => {
  it('is silent before half a window is covered, then reports the path speed', () => {
    const w = new SpeedWindow(3000);
    w.push(0, 0, 0);
    w.push(200, 5, 0); // 25 m/s in one step (KCC spike): not judged yet
    expect(w.speed).toBe(0);
    walk(w, 400, 5, 4, 4);
    expect(w.speed).toBeCloseTo(4, 1);
    expect(w.span).toBeLessThanOrEqual(3000);
  });

  it('passes an honest walker and a rider, flags a client-side speed hack', () => {
    const foot = 4, bike = foot * 1.3;
    const w = new SpeedWindow();
    walk(w, 0, 0, 4.7, 5); // 4.8 m/s sliding along the Louvre basin edge (TODO.md) is within the 25 % margin
    expect(overSpeed(w, foot)).toBe(false);
    walk(w, 6000, 0, bike, 5);
    expect(overSpeed(w, bike)).toBe(false);
    expect(overSpeed(w, foot)).toBe(true); // riding while the step says walk-only (Phase 9 penalty)
    walk(w, 12_000, 0, 8, 5);
    expect(overSpeed(w, bike)).toBe(true);
    expect(NET.speedTolerance).toBe(1.25);
  });

  it('reset() forgets the jump of a respawn', () => {
    const w = new SpeedWindow();
    const end = walk(w, 0, 0, 4, 3);
    w.reset(end.t + 200, end.x + 300, 0); // "Kẹt?" moved the body 300 m
    walk(w, end.t + 400, end.x + 300, 4, 3);
    expect(overSpeed(w, 4)).toBe(false);
    const v = new SpeedWindow();
    walk(v, 0, 0, 4, 3);
    v.push(3200, 300, 0); // the same jump without a respawn message
    walk(v, 3400, 300, 4, 1);
    expect(overSpeed(v, 4)).toBe(true);
  });
});
