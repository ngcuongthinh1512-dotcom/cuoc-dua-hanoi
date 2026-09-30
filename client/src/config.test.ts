import { describe, expect, it } from 'vitest';
import { bikeTopSpeed, keys, movement } from './config.ts';

// SPEC §17.1: keys both Windows and macOS have, none the browser/OS takes over.
const FORBIDDEN = /^(Control|Alt|Meta|OS)(Left|Right)$|^F(5|11|12)$/;
const F_KEY = /^F([1-9]|1[0-2])$/;

describe('key bindings (SPEC §17.1)', () => {
  it.each(Object.entries(keys))('%s', (_, codes) => {
    expect(codes.length).toBeGreaterThan(0);
    for (const code of codes) expect(code).not.toMatch(FORBIDDEN);
    expect(codes.every((c) => F_KEY.test(c))).toBe(false); // an F-key needs fn on a Mac → never the only key
  });
});

describe('bike speed (SPEC §6.1)', () => {
  it('is footSpeed × 1.3', () => {
    expect(movement.bikeSpeedMultiplier).toBe(1.3);
    expect(bikeTopSpeed() / movement.footSpeed).toBeCloseTo(1.3, 6);
  });
});
