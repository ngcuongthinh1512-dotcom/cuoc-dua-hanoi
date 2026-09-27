import { describe, expect, it } from 'vitest';
import { ringArea } from './chunkData.ts';
import { clipRing, dedupe, mergeChains, midpoint, resample, ringCentroid, splitPolyline } from './clip.ts';

const rect = { minX: 5, minZ: -100, maxX: 100, maxZ: 100 };

describe('clipRing', () => {
  it('clips a square, keeping orientation', () => {
    expect(ringArea(clipRing([0, 10, 10, 10, 10, 0, 0, 0], rect))).toBeCloseTo(50); // outer, area > 0
    expect(ringArea(clipRing([0, 0, 10, 0, 10, 10, 0, 10], rect))).toBeCloseTo(-50); // hole orientation
  });
  it('keeps inside rings, empties outside ones', () => {
    const inside = [10, 10, 20, 10, 20, 0];
    expect(clipRing(inside, rect)).toEqual(inside);
    expect(clipRing([-10, 0, -5, 0, -5, 5], rect).length).toBeLessThan(6);
  });
  it('a rect-covering ring becomes the rect', () => {
    const big = [-500, 500, 500, 500, 500, -500, -500, -500];
    expect(Math.abs(ringArea(clipRing(big, rect)))).toBeCloseTo(95 * 200);
  });
});

describe('small helpers', () => {
  it('dedupe drops repeats and the closing point of rings', () => {
    expect(dedupe([0, 0, 0, 0, 1, 1, 0, 0], true)).toEqual([0, 0, 1, 1]);
    expect(dedupe([0, 0, 0, 0, 1, 1, 0, 0])).toEqual([0, 0, 1, 1, 0, 0]);
  });
  it('centroid, midpoint, resample', () => {
    expect(ringCentroid([0, 0, 10, 0, 10, 10, 0, 10])).toEqual([5, 5]);
    expect(midpoint([0, 0, 10, 0, 10, 30])).toEqual([10, 10]);
    expect(resample([0, 0, 20, 0], 8)).toEqual([0, 0, 6.7, 0, 13.3, 0, 20, 0]);
  });
});

describe('splitPolyline', () => {
  it('splits at chunk borders with shared vertices, before/after and local junction indices', () => {
    const pieces = splitPolyline([-10, 5, 100, 5, 260, 5], [false, true, false]);
    expect(pieces.map((p) => p.key)).toEqual(['-1_0', '0_0', '1_0']);
    expect(pieces[0]).toEqual({ key: '-1_0', pts: [-10, 5, 0, 5], junctions: [], after: [100, 5] });
    expect(pieces[1]).toEqual({ key: '0_0', pts: [0, 5, 100, 5, 250, 5], junctions: [1], before: [-10, 5], after: [260, 5] });
    expect(pieces[2]).toEqual({ key: '1_0', pts: [250, 5, 260, 5], junctions: [], before: [100, 5] });
  });
  it('keeps a one-chunk line whole; a closed way wraps before/after', () => {
    expect(splitPolyline([1, 1, 2, 2], [true, false])).toEqual([{ key: '0_0', pts: [1, 1, 2, 2], junctions: [0] }]);
    const [p] = splitPolyline([10, 10, 20, 10, 20, 20, 10, 10], []);
    expect(p).toMatchObject({ before: [20, 20], after: [20, 10] });
  });
  it('continuity: pieces chain end to end over a diagonal crossing several chunks', () => {
    const pieces = splitPolyline([-300, -300, 600, 400], []);
    expect(pieces.length).toBeGreaterThan(3);
    for (let k = 1; k < pieces.length; k++) expect(pieces[k]!.pts.slice(0, 2)).toEqual(pieces[k - 1]!.pts.slice(-2));
  });
});

describe('mergeChains', () => {
  it('joins same-group lines end to end (either direction), not other groups or sharp turns', () => {
    const chains = mergeChains([
      { pts: [0, 0, 10, 0], group: 'a' },
      { pts: [20, 0, 10, 0], group: 'a' }, // reversed continuation
      { pts: [20, 0, 30, 1], group: 'a' },
      { pts: [30, 1, 30, 20], group: 'a' }, // 90° turn: separate chain
      { pts: [30, 1, 40, 1], group: 'b' }, // other group
    ]);
    expect(chains).toEqual([
      { pts: [0, 0, 10, 0, 20, 0, 30, 1], members: [0, 1, 2] },
      { pts: [30, 1, 30, 20], members: [3] },
      { pts: [30, 1, 40, 1], members: [4] },
    ]);
  });
  it('extends backwards from the seed too', () => {
    expect(mergeChains([{ pts: [10, 0, 20, 0], group: 'a' }, { pts: [0, 0, 10, 0], group: 'a' }])[0]!.pts).toEqual([0, 0, 10, 0, 20, 0]);
  });
});
