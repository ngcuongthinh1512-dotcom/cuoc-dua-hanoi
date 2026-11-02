import { describe, expect, it } from 'vitest';
import { frameAt, hipRoof, perimeter, vEdge } from './h3.ts';
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

describe('perimeter (Vincom Phạm Ngọc Thạch)', () => {
  // 10 m square, apex = the south-west corner (0, 10) nearest `from`; +s goes along the south face first (its normal looks to +z)
  const sq = [0, 0, 10, 0, 10, 10, 0, 10];
  const per = perimeter(sq, [-5, 15]);
  it('starts at the nearest vertex, runs the south face first, wraps', () => {
    expect(per.len).toBe(40);
    expect(per.at(0)).toMatchObject({ x: 0, z: 10 });
    expect(per.at(4)).toMatchObject({ x: 4, z: 10, nz: 1, tx: 1 });
    expect(per.at(-4)).toMatchObject({ x: 0, z: 6, nx: -1 });
    expect(per.at(44)).toMatchObject({ x: 4, z: 10 });
    expect(per.cum).toEqual([0, 10, 20, 30, 40]);
  });
  it('mitres the normal at a vertex', () => {
    const v = per.at(10);
    expect(v.nx).toBeCloseTo(Math.SQRT1_2);
    expect(v.nz).toBeCloseTo(Math.SQRT1_2);
  });
  it('vEdge: the diagonal of the V runs from the top inside wTop down to the podium beyond wBot', () => {
    expect(vEdge(0)).toBe(29);
    expect(vEdge(-11)).toBe(29);
    expect(vEdge(30)).toBe(6);
    expect(vEdge(20.5)).toBeCloseTo(17.5);
  });
});
