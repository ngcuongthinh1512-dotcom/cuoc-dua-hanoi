import { describe, expect, it } from 'vitest';
import { ringArea } from '../geo/chunkData.ts';
import type { MeshBucket } from './buildTypes.ts';
import { hash01, MeshBuffer, mergeBuckets, mergeTriMeshes, offsetPolyline, triangulate } from './geom.ts';

const triNormalY = (p: number[], a: number, b: number, c: number) => {
  // y of (B − A) × (C − A) for points given as flat [x, z] pairs on the ground
  const [ax, az, bx, bz, cx, cz] = [p[2 * a]!, p[2 * a + 1]!, p[2 * b]!, p[2 * b + 1]!, p[2 * c]!, p[2 * c + 1]!];
  return (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
};

const v3 = (a: Float32Array, k = 0) => [...a.subarray(3 * k, 3 * k + 3)].map((v) => v + 0); // −0 → 0

describe('MeshBuffer', () => {
  it('quad: flat outward normal, 4 vertices, 2 triangles, uv corners', () => {
    const m = new MeshBuffer('balcony');
    // wall on the south side of a block, seen from the south (+Z): left = west
    m.quad([0, 0, 5], [10, 0, 5], [10, 3, 5], [0, 3, 5], 0, 0, 10, 3);
    const b = m.bucket();
    expect(b.color).toBeUndefined();
    expect(b.index).toEqual(Uint32Array.of(0, 1, 2, 0, 2, 3));
    for (let k = 0; k < 4; k++) expect(v3(b.normal, k)).toEqual([0, 0, 1]);
    expect([...b.uv]).toEqual([0, 0, 10, 0, 10, 3, 0, 3]);
  });

  it('tri faces up when counter-clockwise from above; degenerate never NaN', () => {
    const m = new MeshBuffer('roof');
    m.color = [0.5, 0.25, 1];
    m.tri([0, 0, 0], [1, 0, 0], [0, 0, -1]); // east, then north
    m.tri([0, 0, 0], [0, 0, 0], [0, 0, 0]);
    const b = m.bucket();
    expect(v3(b.normal)).toEqual([0, 1, 0]);
    expect(b.normal.every(Number.isFinite)).toBe(true);
    expect(v3(b.color!)).toEqual([0.5, 0.25, 1]);
    expect(b.color!.length).toBe(b.position.length);
  });

  it('vertex colour follows VERTEX_COLOR', () => {
    expect(new MeshBuffer('wall').withColor).toBe(true);
    expect(new MeshBuffer('terrain').withColor).toBe(true);
    expect(new MeshBuffer('asphalt').withColor).toBe(false);
    expect(new MeshBuffer('stone').withColor).toBe(false);
  });
});

describe('mergeBuckets / mergeTriMeshes', () => {
  const quad = (material: 'wall' | 'asphalt', x: number) => {
    const m = new MeshBuffer(material);
    m.quad([x, 0, 0], [x + 1, 0, 0], [x + 1, 1, 0], [x, 1, 0]);
    return m.bucket();
  };

  it('merges per material with offset indices and drops empties', () => {
    const out = mergeBuckets([quad('wall', 0), quad('asphalt', 0), quad('wall', 5), new MeshBuffer('roof').bucket()]);
    expect(out.map((b) => b.material)).toEqual(['wall', 'asphalt']);
    const wall = out[0]!;
    expect(wall.position.length).toBe(24);
    expect(wall.color!.length).toBe(24);
    expect([...wall.index.subarray(6)]).toEqual([4, 5, 6, 4, 6, 7]);
    expect(wall.position[12]).toBe(5);
  });

  it('throws on mismatched attribute sets', () => {
    const { color: _, ...noColor } = quad('wall', 0);
    expect(() => mergeBuckets([quad('wall', 0), noColor as MeshBucket])).toThrow(/color/);
    const bad = { ...quad('asphalt', 0), uv: new Float32Array(2) };
    expect(() => mergeBuckets([bad])).toThrow(/lengths/);
  });

  it('mergeTriMeshes offsets indices by vertex count', () => {
    const t = { vertices: new Float32Array(9), indices: Uint32Array.of(0, 1, 2) };
    const m = mergeTriMeshes([t, t]);
    expect(m.vertices.length).toBe(18);
    expect([...m.indices]).toEqual([0, 1, 2, 3, 4, 5]);
    expect(mergeTriMeshes([]).indices.length).toBe(0);
  });
});

describe('offsetPolyline', () => {
  it('positive d is left of travel (travelling east → north = −Z)', () => {
    expect(offsetPolyline([0, 0, 10, 0], 2)).toEqual([0, -2, 10, -2]);
    expect(offsetPolyline([0, 0, 0, -10], 2)).toEqual([-2, 0, -2, -10]); // travelling north → west
  });

  it('mitres a right-angle corner at d·√2 and clamps sharp spikes', () => {
    const o = offsetPolyline([0, 0, 10, 0, 10, -10], 1); // east then north: left turn, inner corner
    expect(o[2]).toBeCloseTo(9);
    expect(o[3]).toBeCloseTo(-1);
    const spike = offsetPolyline([0, 0, 10, 0, 0, 0.1], 1, undefined, undefined, 4);
    expect(Math.hypot(spike[2]! - 10, spike[3]!)).toBeLessThanOrEqual(4 + 1e-9);
    expect(offsetPolyline([0, 0, 10, 0, 0, 0], 1).every(Number.isFinite)).toBe(true); // U-turn
  });

  it('before/after make split pieces agree at the shared vertex', () => {
    const whole = offsetPolyline([0, 0, 10, 0, 20, 10], 3);
    const a = offsetPolyline([0, 0, 10, 0], 3, undefined, [20, 10]);
    const b = offsetPolyline([10, 0, 20, 10], 3, [0, 0]);
    expect(a.slice(2)).toEqual(whole.slice(2, 4));
    expect(b.slice(0, 2)).toEqual(whole.slice(2, 4));
  });

  it('ignores duplicate points', () => {
    expect(offsetPolyline([0, 0, 0, 0, 10, 0], 1)).toEqual([0, -1, 0, -1, 10, -1]);
  });
});

describe('triangulate', () => {
  const sq = [0, 10, 10, 10, 10, 0, 0, 0]; // counter-clockwise from above
  const hole = [3, 3, 7, 3, 7, 7, 3, 7]; // clockwise
  it('square with a hole: all triangles face +Y whatever the ring orientation', () => {
    expect(ringArea(sq)).toBeGreaterThan(0);
    expect(ringArea(hole)).toBeLessThan(0);
    for (const [outer, holes] of [
      [sq, [hole]],
      [[...sq].reverse().flatMap((_, i, r) => (i % 2 ? [] : [r[i + 1]!, r[i]!])), [hole]],
    ] as const) {
      const idx = triangulate(outer, [...holes]);
      const pts = [...outer, ...holes.flat()];
      expect(idx.length).toBe(8 * 3); // 8 vertices + 1 hole → 8 triangles
      let area = 0;
      for (let k = 0; k < idx.length; k += 3) {
        const y = triNormalY(pts, idx[k]!, idx[k + 1]!, idx[k + 2]!);
        expect(y).toBeGreaterThan(0);
        area += y / 2;
      }
      expect(area).toBeCloseTo(100 - 16);
    }
  });
});

describe('hash01', () => {
  it('is deterministic, in [0, 1), salt-sensitive and roughly uniform', () => {
    expect(hash01(12.3, -45.6, 7)).toBe(hash01(12.3, -45.6, 7));
    expect(hash01(12.3, -45.6, 7)).not.toBe(hash01(12.3, -45.6, 8));
    expect(hash01(12.3, -45.6)).not.toBe(hash01(-45.6, 12.3));
    let sum = 0;
    let n = 0;
    const bins = new Array<number>(10).fill(0);
    for (let x = -50; x < 50; x++) {
      for (let z = -50; z < 50; z++) {
        const h = hash01(x * 2.5, z * 2.5, 3);
        expect(h).toBeGreaterThanOrEqual(0);
        expect(h).toBeLessThan(1);
        sum += h;
        bins[Math.floor(h * 10)]!++;
        n++;
      }
    }
    expect(sum / n).toBeCloseTo(0.5, 1);
    for (const b of bins) expect(b / n).toBeGreaterThan(0.08);
  });
});
