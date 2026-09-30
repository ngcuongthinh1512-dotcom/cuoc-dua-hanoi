import { physics } from '../config.ts';

/** Fixed-step accumulator: how many physics steps this frame runs, and what carries over. */
export function advanceFixedSteps(accumulator: number, frameDt: number, fixedDt: number, maxSubSteps: number) {
  const total = accumulator + frameDt;
  const steps = Math.min(Math.floor(total / fixedDt), maxSubSteps);
  // Whole steps beyond maxSubSteps are dropped (no spiral of death); only the sub-step fraction carries over.
  return { steps, accumulator: Math.max(0, total - steps * fixedDt) % fixedDt };
}

type Callbacks = { fixedUpdate(dt: number): void; update(dt: number): void; render(): void };

export class GameLoop {
  // Time (SPEC §3 "core/Time") lives here: clamped frame delta passed to update(), smoothed FPS and work time.
  fps = 0;
  workMs = 0; // CPU time of fixedUpdate + update + render
  frames = 0;
  private accumulator = 0;
  private last?: number;

  constructor(private readonly cb: Callbacks) {}

  /** Share of a physics step not simulated yet (0..1): render poses lerp(previous step, latest step, alpha). */
  get alpha() {
    return this.accumulator / physics.fixedDt;
  }

  start() {
    requestAnimationFrame(this.tick);
  }

  private tick = (now: number) => {
    const t0 = performance.now();
    const raw = this.last === undefined ? 0 : (now - this.last) / 1000;
    this.last = now;
    const delta = Math.min(raw, physics.maxFrameDt);
    if (raw > 0) this.fps = this.fps ? this.fps + (1 / raw - this.fps) * 0.05 : 1 / raw;

    const { steps, accumulator } = advanceFixedSteps(this.accumulator, delta, physics.fixedDt, physics.maxSubSteps);
    this.accumulator = accumulator;
    for (let i = 0; i < steps; i++) this.cb.fixedUpdate(physics.fixedDt);
    this.cb.update(delta);
    this.cb.render();
    this.workMs += (performance.now() - t0 - this.workMs) * 0.05;
    this.frames++;
    requestAnimationFrame(this.tick); // scheduled last: an exception stops the loop instead of repeating every frame
  };
}
