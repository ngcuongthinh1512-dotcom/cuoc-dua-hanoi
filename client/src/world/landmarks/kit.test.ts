import { describe, expect, it } from 'vitest';
import { chunkBounds, type XZ } from '../../geo/chunkData.ts';
import { fixture } from '../../geo/fixture.ts';
import type { BuildCtx } from '../buildTypes.ts';
import { buildLandmarks } from './index.ts';
import { footprintFrame } from './kit.ts';

const ctx: BuildCtx = { key: '0_0', bounds: chunkBounds('0_0'), height: () => 0 };

/** Rectangle 2a × 2b centred at (cx, cz), long side rotated `deg` from +X. */
function rect(cx: number, cz: number, a: number, b: number, deg: number): XZ {
  const [c, s] = [Math.cos((deg * Math.PI) / 180), Math.sin((deg * Math.PI) / 180)];
  return [[-a, -b], [a, -b], [a, b], [-a, b]].flatMap(([x, z]) => [cx + x! * c - z! * s, cz + x! * s + z! * c]);
}

describe('landmark kit (per-group tests live in g1…g5.test.ts)', () => {
  it('footprintFrame recovers centre, long axis and half sizes of a rotated rectangle', () => {
    const f = footprintFrame(rect(100, -50, 22.5, 11, 30));
    expect(f.cx).toBeCloseTo(100, 5);
    expect(f.cz).toBeCloseTo(-50, 5);
    expect(f.a).toBeCloseTo(22.5, 5);
    expect(f.b).toBeCloseTo(11, 5);
    expect(Math.abs(f.ux * Math.cos(Math.PI / 6) + f.uz * Math.sin(Math.PI / 6))).toBeCloseTo(1, 5);
  });

  it('ignores ordinary buildings and is deterministic', () => {
    expect(buildLandmarks({ ...fixture, buildings: fixture.buildings.filter((b) => !b.landmark) }, ctx).meshes).toEqual([]);
    expect(buildLandmarks(fixture, ctx)).toEqual(buildLandmarks(fixture, ctx));
  });
});
