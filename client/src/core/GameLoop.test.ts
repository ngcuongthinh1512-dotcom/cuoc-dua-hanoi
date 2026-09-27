import { describe, expect, it } from 'vitest';
import { advanceFixedSteps } from './GameLoop.ts';

const DT = 1 / 60;

describe('advanceFixedSteps', () => {
  it('runs 2 steps for a 1/30 s frame at 1/60', () => {
    const r = advanceFixedSteps(0, 1 / 30, DT, 5);
    expect(r.steps).toBe(2);
    expect(r.accumulator).toBeCloseTo(0, 12);
  });

  it('carries sub-step time over to the next frame', () => {
    const a = advanceFixedSteps(0, 0.01, DT, 5);
    expect(a).toEqual({ steps: 0, accumulator: 0.01 });
    const b = advanceFixedSteps(a.accumulator, 0.01, DT, 5);
    expect(b.steps).toBe(1);
    expect(b.accumulator).toBeCloseTo(0.02 - DT, 12);
  });

  it('caps a huge delta at maxSubSteps and drops the rest', () => {
    const r = advanceFixedSteps(0, 5, DT, 5);
    expect(r.steps).toBe(5);
    expect(r.accumulator).toBeGreaterThanOrEqual(0);
    expect(r.accumulator).toBeLessThan(DT);
  });

  it('keeps the accumulator in [0, fixedDt) over uneven frames', () => {
    let acc = 0;
    let seed = 1;
    for (let i = 0; i < 10_000; i++) {
      seed = (seed * 16807) % 2147483647; // deterministic pseudo-random frame times 0–100 ms
      const r = advanceFixedSteps(acc, (seed / 2147483647) * 0.1, DT, 5);
      acc = r.accumulator;
      expect(r.steps).toBeLessThanOrEqual(5);
      expect(acc).toBeGreaterThanOrEqual(0);
      expect(acc).toBeLessThan(DT);
    }
  });
});
