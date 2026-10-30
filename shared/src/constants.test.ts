import { describe, expect, it } from 'vitest';
import { onPitMat, PIT_MAT } from './constants.ts';

describe('onPitMat (SPEC §17.38: at the Pit Stop = on the 3.2 × 6.4 m mat)', () => {
  const at = { x: 100, z: -50, yaw: 0 };
  const on = (dx: number, dz: number, zone = at) => onPitMat(at.x + dx, at.z + dz, zone);

  it('inside, on the edge (+ slack), outside: beside the mat but within the old radius does not count', () => {
    expect(PIT_MAT).toEqual({ width: 3.2, length: 6.4, slack: 0.5 });
    expect([on(0, 0), on(1.5, 3.1), on(-1.5, -3.1), on(2.0, 0), on(0, -3.6)]).toEqual([true, true, true, true, true]);
    expect([on(2.2, 0), on(0, 3.8), on(2.2, 3.8), on(3, 0), on(0, 4.5)]).toEqual([false, false, false, false, false]);
    expect(onPitMat(101.8, -50, at, 0)).toBe(false); // no slack
    expect(onPitMat(110, -50, { x: 100, z: -50 })).toBe(false); // no yaw = 0
  });

  it('turned by the zone yaw: the long axis follows it', () => {
    const west = { ...at, yaw: Math.PI / 2 }; // long axis east-west
    expect([on(3, 0, west), on(0, 3, west), on(0, 1.5, west), on(3.8, 0, west)]).toEqual([true, false, true, false]);
    const yaw = (33 * Math.PI) / 180; // a point 3 m along the axis + 1.4 m across: in; 2.2 m across: out
    const along = (d: number, across: number) => on(d * Math.sin(yaw) + across * Math.cos(yaw), d * Math.cos(yaw) - across * Math.sin(yaw), { ...at, yaw });
    expect([along(3, 1.4), along(3, 2.2), along(4, 0), along(-3.1, -1.5)]).toEqual([true, false, false, true]);
  });
});
