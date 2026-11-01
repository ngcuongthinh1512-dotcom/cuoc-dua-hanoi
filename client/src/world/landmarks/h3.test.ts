import { describe, expect, it } from 'vitest';
import { frameAt, hipRoof } from './h3.ts';
import { Sink } from './parts.ts';

const tris = (s: Sink) => s.out().meshes.reduce((n, m) => n + m.index.length / 3, 0);
const top = (s: Sink) => Math.max(...s.out().meshes.flatMap((m) => [...m.position].filter((_, k) => k % 3 === 1)));

describe('hipRoof', () => {
  it('draws the same roof whichever way the rectangle is given', () => {
    const f = frameAt(10, -5, 0.6, 0.8);
    const a = new Sink();
    hipRoof(a, f, -6, 6, -3, 3, 4, 2);
    const b = new Sink(); // swapped bounds, short side along a: normalised to the same ridge
    hipRoof(b, f, 3, -3, 6, -6, 4, 2);
    expect(tris(a)).toBe(32); // 10 roof triangles × 2 sides + the ridge beam box
    expect(tris(b)).toBe(tris(a));
    expect(top(a)).toBeCloseTo(6.3);
    expect(top(b)).toBeCloseTo(6.3);
  });
});
