// Server-side speed check (SPEC §6.5, §13.9; docs/plans/phase6.md §3.7): path length over a sliding window, stamped with
// the server's clock. Pure, so it is unit-tested here and the Durable Object just feeds it.
import { NET } from './constants.ts';

export class SpeedWindow {
  private t: number[] = [];
  private x: number[] = [];
  private z: number[] = [];

  constructor(readonly windowMs: number = NET.speedWindowMs) {}

  /** A pose received at server time `now` (ms). Stamped max(now, previous + 1000 / sendHz), at most NET.speedLeadMs
   *  ahead of `now`: poses queued during a network stall arrive together but spread over the time they really covered
   *  (an honest walker is not judged faster), and a client sending faster than sendHz cannot bank more than the lead. */
  push(now: number, x: number, z: number) {
    const prev = this.t.at(-1);
    const t = prev === undefined ? now : Math.min(Math.max(now, prev + 1000 / NET.sendHz), now + NET.speedLeadMs);
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

/** Phase 7 geofence trust (docs/plans/phase7.md D4; critic: a pose after ≥ 3 s standing still, a reconnect's first pose
 *  and a respawn all passed the window above unchecked). The server's trusted point follows the client's poses at no
 *  more than `rate` m/s: a bucket refilled by `rate` × elapsed time, capped at `cap` m (bunched poses after a short
 *  stall); a reconnect raises it to at least `earned` m on top of what it held, capped (the time unseen at bike speed: the same
 *  seconds as the refill, never paid twice — review fix: a reconnect every 2 s doubled the rate), and a respawn adds
 *  `grant` m (≤ NET.respawnTrust). A pose out of reach moves the point only by the budget left, so no single message can
 *  carry a team into a zone or the box-reveal radius; an honest client the point lags behind (long stall) is caught up
 *  at `rate`. Returns the m that did not fit (> 0 → RaceRoom.teleport(): event + flag). */
export class TrustedPoint {
  constructor(public x: number, public z: number, public at: number, public budget = 0) {}

  follow(now: number, x: number, z: number, rate: number, cap: number, grant = 0, earned = 0): number {
    const b = this.budget;
    // what it held is capped before `earned` is added: an unused reconnect allowance is gone on the next pose (review 2:
    // uncapped, unseen time was banked and spent later in one jump after another reconnect)
    this.budget = Math.max(Math.min(cap, b + (rate * Math.max(0, now - this.at)) / 1000), Math.min(b, cap) + earned) + grant;
    this.at = now;
    const d = Math.hypot(x - this.x, z - this.z);
    const k = d <= this.budget ? 1 : this.budget / d;
    this.x += (x - this.x) * k;
    this.z += (z - this.z) * k;
    this.budget -= d * k;
    return d * (1 - k);
  }
}
