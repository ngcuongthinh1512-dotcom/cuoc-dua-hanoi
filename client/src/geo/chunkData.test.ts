import { describe, expect, it } from 'vitest';
import { chunkBounds, chunkKey, ringArea } from './chunkData.ts';

describe('chunkData', () => {
  it('keys and bounds round-trip, including negative chunks', () => {
    expect(chunkKey(0, 0)).toBe('0_0');
    expect(chunkKey(-0.1, 249.9)).toBe('-1_0');
    expect(chunkKey(-250, -250.1)).toBe('-1_-2');
    expect(chunkBounds('-1_-2')).toEqual({ minX: -250, minZ: -500, maxX: 0, maxZ: -250 });
    const b = chunkBounds(chunkKey(1234, -567));
    expect(1234).toBeGreaterThanOrEqual(b.minX);
    expect(1234).toBeLessThan(b.maxX);
    expect(-567).toBeGreaterThanOrEqual(b.minZ);
    expect(-567).toBeLessThan(b.maxZ);
  });

  it('ringArea is positive for a ring counter-clockwise on a north-up map (east, then north = −Z)', () => {
    const ccw = [0, 0, 10, 0, 10, -10, 0, -10];
    expect(ringArea(ccw)).toBe(100);
    const cw = [0, 0, 0, -10, 10, -10, 10, 0];
    expect(ringArea(cw)).toBe(-100);
  });
});
