import { describe, expect, it } from 'vitest';
import { mulberry32, pickWeighted } from './rng.ts';

describe('mulberry32', () => {
  it('is deterministic per seed, uniform-ish in [0, 1)', () => {
    const [a, b, c] = [mulberry32(1), mulberry32(1), mulberry32(2)];
    const xs = Array.from({ length: 10_000 }, () => a());
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
    expect(Array.from({ length: 10_000 }, () => b())).toEqual(xs);
    expect(c()).not.toBe(xs[0]);
    const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
    expect(mean).toBeGreaterThan(0.48);
    expect(mean).toBeLessThan(0.52);
  });
});

describe('pickWeighted', () => {
  it('follows the weights, never picks a zero weight', () => {
    const rng = mulberry32(7);
    const n = [0, 0, 0, 0];
    for (let i = 0; i < 20_000; i++) n[pickWeighted(rng, [1, 0, 3, 0])]!++;
    expect(n[1]).toBe(0);
    expect(n[3]).toBe(0);
    expect(n[2]! / n[0]!).toBeGreaterThan(2.7);
    expect(n[2]! / n[0]!).toBeLessThan(3.3);
    expect(pickWeighted(() => 0.9999999999999999, [0.1, 0.2, 0])).toBe(1);
  });
});
