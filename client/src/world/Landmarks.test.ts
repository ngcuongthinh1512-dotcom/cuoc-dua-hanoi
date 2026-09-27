import { describe, expect, it } from 'vitest';
import { props as P } from '../config.ts';
import { type BuildingRec, chunkBounds, type LandmarkId, type XZ } from '../geo/chunkData.ts';
import { fixture } from '../geo/fixture.ts';
import type { BuildCtx, BuildOut } from './buildTypes.ts';
import { buildLandmarks, footprintFrame } from './Landmarks.ts';

const ctx: BuildCtx = { key: '0_0', bounds: chunkBounds('0_0'), height: () => 0 };
const y0 = -P.landmarks.sink;

/** Rectangle 2a × 2b centred at (cx, cz), long side rotated `deg` from +X. */
function rect(cx: number, cz: number, a: number, b: number, deg: number): XZ {
  const [c, s] = [Math.cos((deg * Math.PI) / 180), Math.sin((deg * Math.PI) / 180)];
  return [[-a, -b], [a, -b], [a, b], [-a, b]].flatMap(([x, z]) => [cx + x! * c - z! * s, cz + x! * s + z! * c]);
}

const build = (landmark: LandmarkId, outer: XZ, height?: number) => {
  const rec: BuildingRec = { outer, kind: 'yes', landmark, ...(height ? { height } : {}) };
  return buildLandmarks({ ...fixture, buildings: [rec] }, ctx);
};

const maxY = (o: BuildOut) => Math.max(...o.meshes.flatMap((m) => [...m.position].filter((_, i) => i % 3 === 1)));

/** Does segment p→q cross any triangle of the buckets / colliders (Möller–Trumbore)? */
function hits(o: BuildOut, p: number[], q: number[], colliders = false) {
  const d = [q[0]! - p[0]!, q[1]! - p[1]!, q[2]! - p[2]!];
  const sets = colliders ? o.colliders.map((c) => [c.vertices, c.indices] as const) : o.meshes.map((m) => [m.position, m.index] as const);
  for (const [v, idx] of sets) {
    for (let k = 0; k < idx.length; k += 3) {
      const [a, b, c] = [idx[k]!, idx[k + 1]!, idx[k + 2]!].map((i) => [v[3 * i]!, v[3 * i + 1]!, v[3 * i + 2]!]) as [number[], number[], number[]];
      const e1 = [b[0]! - a[0]!, b[1]! - a[1]!, b[2]! - a[2]!];
      const e2 = [c[0]! - a[0]!, c[1]! - a[1]!, c[2]! - a[2]!];
      const h = [d[1]! * e2[2]! - d[2]! * e2[1]!, d[2]! * e2[0]! - d[0]! * e2[2]!, d[0]! * e2[1]! - d[1]! * e2[0]!];
      const det = e1[0]! * h[0]! + e1[1]! * h[1]! + e1[2]! * h[2]!;
      if (Math.abs(det) < 1e-12) continue;
      const s = [p[0]! - a[0]!, p[1]! - a[1]!, p[2]! - a[2]!];
      const u = (s[0]! * h[0]! + s[1]! * h[1]! + s[2]! * h[2]!) / det;
      const qq = [s[1]! * e1[2]! - s[2]! * e1[1]!, s[2]! * e1[0]! - s[0]! * e1[2]!, s[0]! * e1[1]! - s[1]! * e1[0]!];
      const w = (d[0]! * qq[0]! + d[1]! * qq[1]! + d[2]! * qq[2]!) / det;
      const t = (e2[0]! * qq[0]! + e2[1]! * qq[1]! + e2[2]! * qq[2]!) / det;
      if (u >= 0 && w >= 0 && u + w <= 1 && t >= 0 && t <= 1) return true;
    }
  }
  return false;
}

const finite = (o: BuildOut) =>
  o.meshes.every((m) => [m.position, m.normal, m.uv].every((a) => a.every(Number.isFinite))) &&
  o.colliders.every((c) => c.vertices.every(Number.isFinite));

describe('landmark placeholders', () => {
  it('footprintFrame recovers centre, long axis and half sizes of a rotated rectangle', () => {
    const f = footprintFrame(rect(100, -50, 22.5, 11, 30));
    expect(f.cx).toBeCloseTo(100, 5);
    expect(f.cz).toBeCloseTo(-50, 5);
    expect(f.a).toBeCloseTo(22.5, 5);
    expect(f.b).toBeCloseTo(11, 5);
    expect(Math.abs(f.ux * Math.cos(Math.PI / 6) + f.uz * Math.sin(Math.PI / 6))).toBeCloseTo(1, 5);
  });

  it('Eiffel: 330 m, 4 legs, open and walkable under the centre, colliders only on the legs', () => {
    const o = build('eiffel', rect(0, 0, 62.5, 62.5, 20), 330);
    expect(finite(o)).toBe(true);
    expect(maxY(o) - y0).toBeGreaterThan(325);
    expect(maxY(o) - y0).toBeLessThan(335);
    expect(hits(o, [0, 0, 0], [0, 50, 0])).toBe(false); // vertical under the centre
    for (const deg of [20, 65, 110, 155]) {
      const [c, s] = [Math.cos((deg * Math.PI) / 180) * 30, Math.sin((deg * Math.PI) / 180) * 30];
      expect(hits(o, [-c, 3, -s], [c, 3, s])).toBe(false); // walking across under the tower
    }
    expect(hits(o, [0, 0, 0], [0, 200, 0])).toBe(true); // platforms/shaft above
    expect(o.colliders.length).toBe(1);
    expect(Math.max(...o.colliders[0]!.vertices.filter((_, i) => i % 3 === 1))).toBeLessThanOrEqual(116);
    expect(hits(o, [0, 3, 0], [38, 3, 81.6], true)).toBe(true); // a leg blocks the diagonal (20° + 45°)
    // The fixture's (smaller) footprint still gives the full height.
    expect(maxY(buildLandmarks(fixture, ctx)) - y0).toBeCloseTo(330, -1);
  });

  it('Arc: 50 m high, main arch open along its short axis, transverse arch along the long axis', () => {
    const outer = rect(0, 0, 22.5, 11, -35);
    const o = build('arc', outer, 50);
    expect(finite(o)).toBe(true);
    expect(maxY(o) - y0).toBeCloseTo(50, 0);
    const f = footprintFrame(outer);
    const [wx, wz] = [-f.uz, f.ux];
    expect(hits(o, [-wx * 20, 10, -wz * 20], [wx * 20, 10, wz * 20], true)).toBe(false);
    expect(hits(o, [-f.ux * 30, 6, -f.uz * 30], [f.ux * 30, 6, f.uz * 30], true)).toBe(false);
    expect(hits(o, [-f.ux * 30, 35, -f.uz * 30], [f.ux * 30, 35, f.uz * 30], true)).toBe(true); // attic
    expect(hits(o, [-wx * 20 + f.ux * 15, 10, -wz * 20 + f.uz * 15], [wx * 20 + f.ux * 15, 10, wz * 20 + f.uz * 15], true)).toBe(true); // pier
  });

  it('pyramid: apex at 21.6 m over the footprint centre; obelisk: tagged height, stone only', () => {
    const p = build('pyramid', rect(10, 10, 17.5, 17.5, 10));
    expect(finite(p)).toBe(true);
    expect(maxY(p) - y0).toBeCloseTo(P.landmarks.pyramidHeight, 3);
    expect(p.meshes.map((m) => m.material)).toEqual(['glass']);
    expect(hits(p, [10, 1, -40], [10, 1, 60], true)).toBe(true);
    const ob = build('obelisk', rect(0, 0, 2.2, 2.2, 0), 33.37);
    expect(maxY(ob) - y0).toBeCloseTo(33.37, 3);
    expect(ob.meshes.map((m) => m.material)).toEqual(['stone']);
  });

  it('ignores ordinary buildings and is deterministic', () => {
    expect(buildLandmarks({ ...fixture, buildings: fixture.buildings.filter((b) => !b.landmark) }, ctx).meshes).toEqual([]);
    expect(buildLandmarks(fixture, ctx)).toEqual(buildLandmarks(fixture, ctx));
  });
});
