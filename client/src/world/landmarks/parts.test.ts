import { describe, expect, it } from 'vitest';
import { buildings as B } from '../../config.ts';
import { type BuildingRec, chunkBounds, type PartRec, type XZ } from '../../geo/chunkData.ts';
import { LANDMARK_BY_ID } from '../../geo/landmarks.ts';
import type { BuildOut } from '../buildTypes.ts';
import { buildLandmarks, coverage, generic, type LandmarkCtx } from './index.ts';
import { type PartLike, pickMaterial, renderPart, roofShape, Sink } from './parts.ts';

const flat = () => 0;
const opts = { ground: 0, height: flat, fallbackTop: 20 };
/** Axis-aligned rectangle, counter-clockwise on a north-up map (ringArea > 0); `hole` reverses it. */
const rect = (x0: number, z0: number, x1: number, z1: number, hole = false): XZ =>
  hole ? [x0, z0, x1, z0, x1, z1, x0, z1] : [x0, z1, x1, z1, x1, z0, x0, z0];

function render(p: Partial<PartLike>): BuildOut {
  const sink = new Sink();
  expect(renderPart({ outer: rect(0, 0, 20, 10), kind: 'yes', ...p }, opts, sink)).toBe(true);
  return sink.out();
}

/** Σ area vectors (0 for a closed surface), Σ |area|, signed volume (> 0: normals out), y range, NaN check. */
function measure(o: BuildOut) {
  const s = [0, 0, 0];
  let [area, vol, yMin, yMax, finite] = [0, 0, Infinity, -Infinity, true];
  for (const m of o.meshes) {
    const P = (i: number) => [m.position[3 * i]!, m.position[3 * i + 1]!, m.position[3 * i + 2]!];
    finite &&= [m.position, m.normal, m.uv, m.color].every((a) => !a || a.every(Number.isFinite));
    for (let k = 0; k < m.index.length; k += 3) {
      const [a, b, c] = [P(m.index[k]!), P(m.index[k + 1]!), P(m.index[k + 2]!)] as [number[], number[], number[]];
      const u = [b[0]! - a[0]!, b[1]! - a[1]!, b[2]! - a[2]!];
      const v = [c[0]! - a[0]!, c[1]! - a[1]!, c[2]! - a[2]!];
      const n = [u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!];
      for (let i = 0; i < 3; i++) s[i]! += n[i]! / 2;
      area += Math.hypot(...n) / 2;
      vol += (a[0]! * (b[1]! * c[2]! - b[2]! * c[1]!) - a[1]! * (b[0]! * c[2]! - b[2]! * c[0]!) + a[2]! * (b[0]! * c[1]! - b[1]! * c[0]!)) / 6;
      for (const q of [a, b, c]) [yMin, yMax] = [Math.min(yMin, q[1]!), Math.max(yMax, q[1]!)];
    }
  }
  return { open: Math.hypot(...s) / area, vol, yMin, yMax, finite };
}

const SHAPES = ['flat', 'skillion', 'gabled', 'hipped', 'side_hipped', 'mansard', 'gambrel', 'round', 'pyramidal', 'cone', 'dome', 'onion'];

describe('S3DB part renderer', () => {
  it.each(SHAPES)('%s roof: closed, outward, no NaN, 20 m top, walls down to the terrain', (shape) => {
    const m = measure(render({ height: 20, roofHeight: 6, roofShape: shape }));
    expect(m.finite).toBe(true);
    expect(m.open).toBeLessThan(1e-4);
    expect(m.yMax).toBeCloseTo(20, 4);
    expect(m.yMin).toBeCloseTo(-B.baseSink, 4);
    const walls = 20 * 10 * (14 + B.baseSink);
    expect(m.vol).toBeGreaterThan(walls * 0.99);
    expect(m.vol).toBeLessThan(20 * 10 * (20 + B.baseSink) * (shape === 'onion' ? 1.2 : 1.001));
  });

  it('closed on a courtyard ring and an L-shaped footprint; min_height lifts the walls', () => {
    const court = new Sink();
    renderPart({ outer: rect(0, 0, 40, 30), holes: [rect(10, 10, 30, 20, true)], kind: 'yes', height: 18, roofHeight: 4, roofShape: 'gabled' }, opts, court);
    expect(measure(court.out()).open).toBeLessThan(1e-4);
    const l = new Sink();
    renderPart({ outer: [0, 0, 30, 0, 30, -10, 10, -10, 10, -30, 0, -30], kind: 'yes', height: 12, minHeight: 5, roofShape: 'hipped', roofHeight: 3 }, opts, l);
    const m = measure(l.out());
    expect(m.open).toBeLessThan(1e-4);
    expect(m.yMin).toBeCloseTo(5, 4);
    expect(m.yMax).toBeLessThanOrEqual(12); // the frame's ridge (its centre) lies in the notch of the L
    expect(m.yMax).toBeGreaterThan(9);
  });

  it('skillion faces roof:direction (east → the west wall is the tall one); height from levels', () => {
    const o = render({ levels: 5, roofShape: 'skillion', roofDirection: 90, roofHeight: 4 });
    const p = [...o.meshes.flatMap((m) => [...m.position])];
    const at = (x: number) => Math.max(...p.filter((_, i) => i % 3 === 1 && Math.abs(p[i - 1]! - x) < 1e-6));
    expect(at(0)).toBeCloseTo(5 * B.levelHeight, 4);
    expect(at(20)).toBeCloseTo(5 * B.levelHeight - 4, 4);
  });

  it('column = round, closed; roof part = canopy slab + roof; degenerate parts are skipped', () => {
    const c = measure(render({ kind: 'column', height: 15, minHeight: 2 }));
    expect(c.open).toBeLessThan(1e-4);
    expect([c.yMin, c.yMax]).toEqual([2, 15]);
    expect(c.vol).toBeLessThan(20 * 10 * 13 * (Math.PI / 4) * 1.001); // ellipse inscribed in the 20 × 10 frame
    const r = measure(render({ kind: 'roof', height: 9, roofShape: 'gabled', roofHeight: 2 }));
    expect(r.yMin).toBeCloseTo(7 - B.canopyThickness, 4);
    expect(renderPart({ outer: [0, 0, 1, 0, 2, 0], kind: 'yes' }, opts, new Sink())).toBe(false);
    expect(renderPart({ outer: rect(0, 0, 5, 5), kind: 'yes', height: 3, minHeight: 5 }, opts, new Sink())).toBe(false);
  });

  it('materials: tags → buckets, colour tag wins, shapes → nearest', () => {
    expect(pickMaterial('gold', undefined, 'stone').id).toBe('gold');
    expect(pickMaterial('glass', undefined, 'stone').id).toBe('glass');
    const cu = pickMaterial('copper', undefined, 'stone');
    expect(cu.id).toBe('masonry');
    expect(cu.tint[1]).toBeGreaterThan(cu.tint[0]); // verdigris
    expect(pickMaterial('slate', '#ff0000', 'stone').tint).toEqual([1, 0, 0]);
    expect(pickMaterial(undefined, 'light_grey', 'stone').tint[0]).toBeGreaterThan(0.6);
    expect(roofShape('quadruple_saltbox')).toBe('hipped');
    expect(roofShape('crosspitched')).toBe('hipped');
    expect(roofShape('weird')).toBe('flat');
    expect(roofShape(undefined)).toBe('flat');
    const o = render({ height: 10, roofShape: 'dome', roofMaterial: 'gold', material: 'limestone' });
    expect(o.meshes.map((m) => m.material).sort()).toEqual(['gold', 'masonry']);
  });
});

describe('landmark dispatch', () => {
  const ctx = (): LandmarkCtx => ({ key: '0_0', bounds: chunkBounds('0_0'), height: flat, def: LANDMARK_BY_ID.get('notre-dame')!, ground: 0, minGround: 0 });
  const outline: BuildingRec = { outer: rect(0, 0, 40, 20), kind: 'cathedral', height: 10.5, landmark: 'notre-dame' };
  const tall: PartRec = { outer: rect(0, 0, 40, 20), kind: 'yes', height: 33, roofShape: 'gabled', roofHeight: 10 };
  const maxY = (o: BuildOut) => Math.max(...o.meshes.flatMap((m) => [...m.position].filter((_, i) => i % 3 === 1)));

  it('S3DB: an outline fully covered by its parts is not extruded; partly covered → both; no parts → outline', () => {
    expect(coverage(outline, [tall])).toBeCloseTo(1, 5);
    const full = generic(outline, [tall], ctx());
    expect(maxY(full)).toBeCloseTo(33, 4);
    expect(measure(full).vol).toBeGreaterThan(40 * 20 * 23); // no second prism inside: volume of the part alone
    expect(measure(full).vol).toBeLessThan(40 * 20 * 33.6);
    const small: PartRec = { outer: rect(0, 0, 10, 20), kind: 'yes', height: 40 };
    expect(coverage(outline, [small])).toBeCloseTo(0.25, 1);
    const both = generic(outline, [small], ctx());
    expect(measure(both).vol).toBeGreaterThan(40 * 20 * 10.5 + 10 * 20 * 40 * 0.99);
    expect(maxY(generic(outline, [], ctx()))).toBeCloseTo(10.5, 4);
  });

  it('bridge / fountain outlines are left to the details; colliders are prisms; unknown ids are skipped', () => {
    expect(generic({ ...outline, kind: 'bridge' }, [], ctx()).meshes).toEqual([]);
    const o = generic(outline, [tall], ctx());
    expect(o.colliders).toHaveLength(1);
    expect(Math.max(...o.colliders[0]!.vertices.filter((_, i) => i % 3 === 1))).toBeCloseTo(23, 4); // eaves, not the ridge
    const chunk = { v: 2 as const, key: '0_0', roads: [], bridges: [], areas: [], points: [] };
    const out = buildLandmarks({ ...chunk, buildings: [{ ...outline, parts: [tall] }] }, ctx());
    expect(maxY(out)).toBeCloseTo(33, 4);
    expect(buildLandmarks({ ...chunk, buildings: [{ ...outline, landmark: 'nope' as 'arc' }] }, ctx()).meshes).toEqual([]);
  });
});
