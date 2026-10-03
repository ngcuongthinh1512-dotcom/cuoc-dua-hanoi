import { describe, expect, it } from 'vitest';
import { onPitMat, PIT_MAT } from './constants.ts';

describe('onPitMat (SPEC §17.38: at the Pit Stop = on the 16 × 32 m mat)', () => {
  const at = { x: 100, z: -50, yaw: 0 };
  const on = (dx: number, dz: number, zone = at) => onPitMat(at.x + dx, at.z + dz, zone);

  it('inside, on the edge (+ slack), outside: beside the mat but within the old 20 m radius does not count', () => {
    expect(PIT_MAT).toEqual({ width: 16, length: 32, slack: 0.5 });
    expect([on(0, 0), on(7.9, 15.9), on(-7.9, -15.9), on(8.4, 0), on(0, -16.4)]).toEqual([true, true, true, true, true]);
    expect([on(8.6, 0), on(0, 16.6), on(8.6, 16.6), on(10, 0), on(0, 18)]).toEqual([false, false, false, false, false]);
    expect(onPitMat(108.4, -50, at, 0)).toBe(false); // no slack
    expect(onPitMat(110, -50, { x: 100, z: -50 })).toBe(false); // no yaw = 0
  });

  it('turned by the zone yaw: the long axis follows it', () => {
    const west = { ...at, yaw: Math.PI / 2 }; // long axis east-west
    expect([on(15, 0, west), on(0, 15, west), on(0, 7.9, west), on(16.6, 0, west)]).toEqual([true, false, true, false]);
    const yaw = (33 * Math.PI) / 180; // a point 15 m along the axis + 7 m across: in; 9 m across: out
    const along = (d: number, across: number) => on(d * Math.sin(yaw) + across * Math.cos(yaw), d * Math.cos(yaw) - across * Math.sin(yaw), { ...at, yaw });
    expect([along(15, 7), along(15, 9), along(17, 0), along(-15.5, -7.5)]).toEqual([true, false, false, true]);
  });
});
