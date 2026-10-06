import { describe, expect, it } from 'vitest';
import { landmarks as L } from '../../config.ts';
import { type BuildingRec, chunkBounds, type PartRec, type XZ } from '../../geo/chunkData.ts';
import { LANDMARK_BY_ID } from '../../geo/landmarks.ts';
import type { BuildOut } from '../buildTypes.ts';
import { helpers, type LandmarkCtx } from './index.ts';
import { details, keyed, outward, petalShape, radialAt, towerPiece } from './mf2.ts';

const T = L.mf2.tower;
const G = L.mf2.lisboa;
const ctx = (id: 'macau-tower' | 'grand-lisboa'): LandmarkCtx => ({ key: '0_0', bounds: chunkBounds('0_0'), height: () => 10, def: LANDMARK_BY_ID.get(id)!, ground: 10, minGround: 10 });
const circle = (cx: number, cz: number, r: number, n = 24): XZ => Array.from({ length: n }, (_, s) => [cx + r * Math.cos((2 * Math.PI * s) / n), cz + r * Math.sin((2 * Math.PI * s) / n)]).flat();
const rect = (x0: number, z0: number, x1: number, z1: number): XZ => [x0, z0, x1, z0, x1, z1, x0, z1];
const mast: PartRec = { outer: circle(100, 200, 1, 6), kind: 'yes', height: 338 };

function stats(o: BuildOut) {
  let [maxY, minY, tris, nan] = [-Infinity, Infinity, 0, 0];
  const box = { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity };
  for (const m of o.meshes) {
    tris += m.index.length / 3;
    for (let i = 0; i < m.position.length; i += 3) {
      const [x, y, z] = [m.position[i]!, m.position[i + 1]!, m.position[i + 2]!];
      if (!Number.isFinite(x + y + z)) nan++;
      [maxY, minY] = [Math.max(maxY, y), Math.min(minY, y)];
      box.x0 = Math.min(box.x0, x), box.x1 = Math.max(box.x1, x), box.z0 = Math.min(box.z0, z), box.z1 = Math.max(box.z1, z);
    }
    for (let i = 0; i < m.normal.length; i++) if (!Number.isFinite(m.normal[i]!)) nan++;
  }
  return { maxY, minY, tris, nan, box, materials: o.meshes.map((m) => `${m.material}${m.lod ? '/near' : ''}`).sort() };
}

describe('mf2 helpers', () => {
  it('keyed interpolates smoothly between keys and clamps outside', () => {
    expect(keyed([[0, 1], [10, 3]], -5)).toBe(1);
    expect(keyed([[0, 1], [10, 3]], 5)).toBeCloseTo(2, 6);
    expect(keyed([[0, 1], [10, 3]], 50)).toBe(3);
  });
  it('petalShape: narrow foot, widest mid-way, pointed tip; flare 0 at the foot, full near the top, tucked back at the tip', () => {
    const [foot, mid, tip] = [petalShape(0), petalShape(0.55), petalShape(1)];
    expect(foot[0]).toBeLessThan(mid[0]);
    expect(tip[0]).toBeLessThan(0.05);
    expect(foot[1]).toBe(0);
    expect(petalShape(0.78)[1]).toBeCloseTo(1, 6);
    expect(tip[1]).toBeCloseTo(1 - G.crown.tuck, 6);
  });
  it('radialAt: distance to the ring along an azimuth', () => {
    expect(radialAt(circle(5, 5, 10, 64), 5, 5, 0.3)).toBeCloseTo(10, 1);
    expect(radialAt(rect(0, 0, 10, 4), 5, 2, Math.PI / 2)).toBeCloseTo(2, 6);
  });
  it('outward offsets a ring outwards whatever its winding', () => {
    const r = rect(0, 0, 10, 10);
    for (const ring of [r, [...r].reverse().flatMap((_, i, a) => (i % 2 ? [] : [a[i + 1]!, a[i]!]))]) {
      const o = outward(ring, 1);
      expect(Math.min(...o)).toBeCloseTo(-1, 6);
      expect(Math.max(...o)).toBeCloseTo(11, 6);
    }
  });
  it('towerPiece tells the 4 OSM records apart', () => {
    expect(towerPiece({ outer: circle(0, 0, 22), kind: 'yes', parts: [mast] })).toBe('tower');
    expect(towerPiece({ outer: circle(0, 0, 22), kind: 'yes' })).toBe('skip');
    expect(towerPiece({ outer: rect(0, 0, 6, 2), kind: 'yes', parts: [{ outer: rect(0, 0, 6, 2), kind: 'roof', height: 223 }] })).toBe('skip');
    expect(towerPiece({ outer: rect(0, 0, 150, 70), kind: 'commercial', height: 39 })).toBe('centre');
  });
});

describe('macau-tower', () => {
  const fn = details['macau-tower']!;
  const pod: BuildingRec = { outer: circle(100, 200, 22.5), kind: 'yes', landmark: 'macau-tower', parts: [mast] };

  it('tower: 338 m over the ground, stays within the pod ring (+ the lit rings), glass band, neon, colliders, no NaN', () => {
    const s = stats(fn(pod, pod.parts!, ctx('macau-tower'), helpers));
    expect(s.nan).toBe(0);
    expect(s.maxY).toBeCloseTo(10 + 338 + T.beaconSize / 2, 3);
    expect(s.minY).toBeGreaterThanOrEqual(10 - L.sink - 1e-6);
    expect(s.box.x0).toBeGreaterThan(100 - 23.5);
    expect(s.box.x1).toBeLessThan(100 + 23.5);
    expect(s.box.z0).toBeGreaterThan(200 - 23.5);
    expect(s.box.z1).toBeLessThan(200 + 23.5);
    expect(s.materials).toContain('glass');
    expect(s.materials).toContain('neon');
    expect(s.materials).toContain('metal/near');
    expect(s.tris).toBeLessThan(8000);
    const o = fn(pod, pod.parts!, ctx('macau-tower'), helpers);
    expect(o.colliders).toHaveLength(1);
    expect(Math.max(...o.colliders[0]!.vertices.filter((_, i) => i % 3 === 1))).toBeCloseTo(10 + T.pod[0]![0], 3); // shaft up to the pod
  });

  it('convention centre: glass box to its OSM height with floor slabs and a roof LED; duplicates / slivers → nothing', () => {
    const centre: BuildingRec = { outer: rect(0, 0, 150, 70), kind: 'commercial', height: 39, landmark: 'macau-tower' };
    const s = stats(fn(centre, [], ctx('macau-tower'), helpers));
    expect(s.nan).toBe(0);
    expect(s.maxY).toBeCloseTo(49, 3);
    expect(s.materials).toEqual(['glass', 'masonry', 'neon']);
    expect(s.box.x1).toBeLessThan(150.2);
    expect(fn({ outer: circle(100, 200, 22.5), kind: 'yes', landmark: 'macau-tower' }, [], ctx('macau-tower'), helpers).meshes).toEqual([]);
  });
});

describe('grand-lisboa', () => {
  const fn = details['grand-lisboa']!;
  it('tower: to the published height, a waist over the dome, a lotus crown flaring past the shaft, lit edges, foot collider', () => {
    const rec: BuildingRec = { outer: rect(378, 266, 441, 299), kind: 'yes', height: 211.5, landmark: 'grand-lisboa' };
    const o = fn(rec, [], ctx('grand-lisboa'), helpers);
    const s = stats(o);
    expect(s.nan).toBe(0);
    expect(s.maxY).toBeCloseTo(10 + G.height, 3);
    const shaftW = 63 * G.shaft.at(-1)![1];
    const flare = Math.max(...G.crown.rows.map((r) => r[2]));
    expect(s.box.x1 - s.box.x0).toBeGreaterThan(63 * flare * 0.95); // crown ≈ 1.7 × the shaft
    expect(s.box.x1 - s.box.x0).toBeGreaterThan(shaftW * 1.5);
    expect(s.box.x1 - s.box.x0).toBeLessThan(63 * flare * 1.05);
    expect(s.materials).toEqual(['masonry', 'metal', 'neon']);
    expect(s.tris).toBeLessThan(20000);
    expect(o.colliders).toHaveLength(1);
  });
  it('podium: lattice dome to its top inside the outline, flanking towers, entrance projecting past it, colliders', () => {
    const rec: BuildingRec = { outer: circle(410, 290, 55, 26), kind: 'yes', height: 54, landmark: 'grand-lisboa' };
    const o = fn(rec, [], ctx('grand-lisboa'), helpers);
    const s = stats(o);
    expect(s.nan).toBe(0);
    expect(s.maxY).toBeCloseTo(10 + G.dome.top, 3);
    expect(s.materials).toEqual(['masonry', 'metal', 'metal/near', 'neon', 'neon/near']);
    expect(s.box.x0).toBeGreaterThan(410 - 55 - 2 * G.flank.half); // dome inside the outline, E / W towers on its edge
    expect(s.box.x1).toBeLessThan(410 + 55 + 2 * G.flank.half);
    expect(s.box.z1).toBeGreaterThan(290 + 55); // the entrance fins project south past the outline
    expect(s.tris).toBeLessThan(6000);
    expect(o.colliders).toHaveLength(1);
  });
});
