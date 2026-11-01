import { describe, expect, it } from 'vitest';
import { edges } from './h2.ts';

describe('h2 edges', () => {
  const square = [0, 0, 10, 0, 10, 10, 0, 10]; // x, z pairs
  const reversed = [0, 10, 10, 10, 10, 0, 0, 0];
  it('w axis (−uz, ux) points outward for either winding', () => {
    for (const ring of [square, reversed]) {
      const es = edges(ring, 1);
      expect(es).toHaveLength(4);
      for (const { f } of es) expect((-f.uz) * (f.cx - 5) + f.ux * (f.cz - 5)).toBeGreaterThan(0); // outward · (mid − centre) > 0
    }
  });
  it('keep filters on the outward normal and minLen drops short edges', () => {
    expect(edges(square, 1, (nx) => nx < -0.9)).toHaveLength(1); // the x = 0 edge only
    expect(edges([0, 0, 10, 0, 10, 2, 0, 2], 5)).toHaveLength(2);
  });
});
