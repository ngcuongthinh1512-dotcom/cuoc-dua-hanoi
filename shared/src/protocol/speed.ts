// Server-side speed check (SPEC §6.5, §13.9; docs/plans/phase6.md §3.7): path length over a sliding window, stamped with
// the server's clock. Pure, so it is unit-tested here and the Durable Object just feeds it.
import { NET } from './constants.ts';

export class SpeedWindow {
  private t: number[] = [];
  private x: number[] = [];
  private z: number[] = [];

  constructor(readonly windowMs: number = NET.speedWindowMs) {}

  /** A pose received at server time `t` (ms). */
  push(t: number, x: number, z: number) {
    this.t.push(t), this.x.push(x), this.z.push(z);
    while (this.t.length > 1 && t - this.t[0]! > this.windowMs) this.t.shift(), this.x.shift(), this.z.shift();
  }

  /** A legal teleport (respawn, spawn): the window starts again from here. */
  reset(t: number, x: number, z: number) {
    this.t = [t], this.x = [x], this.z = [z];
  }

  /** ms covered by the window (0 with < 2 samples). */
  get span() {
    return this.t.length < 2 ? 0 : this.t.at(-1)! - this.t[0]!;
  }

  /** Mean speed (m/s) along the sampled path over the window; 0 until half the window is covered (single steps may spike). */
  get speed() {
    const span = this.span;
    if (span < this.windowMs / 2) return 0;
    let d = 0;
    for (let i = 1; i < this.t.length; i++) d += Math.hypot(this.x[i]! - this.x[i - 1]!, this.z[i]! - this.z[i - 1]!);
    return d / (span / 1000);
  }
}

/** True when `w` moved faster than `limit` m/s × tolerance (SPEC: foot ≤ footSpeed, bike ≤ footSpeed × multiplier). */
export const overSpeed = (w: SpeedWindow, limit: number, tolerance: number = NET.speedTolerance) => w.speed > limit * tolerance;
