import { describe, expect, it } from 'vitest';
import { landmarks as L } from '../../config.ts';
import { chunkBounds, type BuildingRec } from '../../geo/chunkData.ts';
import { LANDMARK_BY_ID } from '../../geo/landmarks.ts';
import type { BuildOut } from '../buildTypes.ts';
import { MeshBuffer } from '../geom.ts';
import type { LandmarkCtx } from './index.ts';
import { bakeFlood, classify, facadeFrame, ruinas, science, slab, stairLine } from './mf1.ts';
import { renderPart } from './parts.ts';

const R = L.mf1.ruinas;
// the OSM outlines from client/public/data/chunks (0_-2: the church floor plan with h 26.4, the college remains; 7_3: the
// Science Center multipolygon, simplified to its corners + courtyard)
const NAVE: BuildingRec = { outer: [139.5, -475, 140.1, -437.5, 159.7, -437.8, 159.1, -475.3], kind: 'ruins', height: 26.4, landmark: 'ruinas-sao-paulo' };
const COLLEGE: BuildingRec = { outer: [175.3, -449, 175.9, -430.6, 182.9, -430.1, 200.3, -425.8, 212.7, -449.4], kind: 'ruins', landmark: 'ruinas-sao-paulo' };
const SCIENCE: BuildingRec = {
  outer: [1804.2, 810.4, 1768, 795.8, 1756, 793.5, 1762.3, 801.9, 1768.5, 816.3, 1739.3, 852.4, 1772.1, 884.2, 1801.1, 870.6, 1870.9, 825.5, 1886.8, 809.9, 1869.5, 795, 1857.4, 803.9, 1836.8, 795.4, 1844.3, 777.3, 1885.3, 762.3, 1911.1, 700.3, 1857, 722.7, 1832.1, 783.1, 1808.7, 808.5],
  holes: [[1812.8, 819.2, 1814.8, 823.5, 1800.9, 829.5, 1785.3, 808.1]],
  kind: 'civic', landmark: 'science-center',
};
const ctx = (key: string, id: 'ruinas-sao-paulo' | 'science-center', h: number): LandmarkCtx => ({ key, bounds: chunkBounds(key), height: () => h, def: LANDMARK_BY_ID.get(id)!, ground: h, minGround: h });

const tris = (o: BuildOut) => o.meshes.reduce((s, m) => s + m.index.length / 3, 0);
const finite = (o: BuildOut) => o.meshes.every((m) => [...m.position, ...m.normal, ...(m.color ?? [])].every(Number.isFinite)) && o.colliders.every((c) => [...c.vertices].every(Number.isFinite));
const bbox = (o: BuildOut) => {
  const b = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity, z0: Infinity, z1: -Infinity };
  for (const m of o.meshes) for (let i = 0; i < m.position.length; i += 3) {
    b.x0 = Math.min(b.x0, m.position[i]!); b.x1 = Math.max(b.x1, m.position[i]!);
    b.y0 = Math.min(b.y0, m.position[i + 1]!); b.y1 = Math.max(b.y1, m.position[i + 1]!);
    b.z0 = Math.min(b.z0, m.position[i + 2]!); b.z1 = Math.max(b.z1, m.position[i + 2]!);
  }
  return b;
};

describe('mf1 helpers', () => {
  it('facadeFrame: origin at the south edge centre, x east, local z south', () => {
    const f = facadeFrame(NAVE.outer);
    expect(f.cx).toBeCloseTo(149.9, 1);
    expect(f.cz).toBeCloseTo(-437.65, 1);
    expect(f.ux).toBeCloseTo(1, 2);
    expect(f.a * 2).toBeCloseTo(19.6, 1);
  });
  it('stairLine: risers the KCC climbs, the flights fill the OSM steps way', () => {
    const s = stairLine();
    expect(s.riser).toBeLessThanOrEqual(0.16);
    expect(s.riser * s.n * R.stair.flights).toBeCloseTo(R.terrace.rise, 6);
    expect(s.Lf * R.stair.flights + (R.stair.flights - 1) * R.stair.landing).toBeCloseTo(R.stair.bottom - R.stair.top, 6);
  });
  it('slab: piers, sills and lintels around the holes, no box inside a hole', () => {
    const b = new MeshBuffer('neon');
    slab(b, -5, 5, 0, 6, -1, 0, [[-1, 1, 0, 4], [2, 3, 1, 3]]);
    const p = b.bucket().position;
    for (let i = 0; i < p.length; i += 3) {
      const [x, y] = [p[i]!, p[i + 1]!];
      expect(x > -1 + 1e-6 && x < 1 - 1e-6 && y < 4 - 1e-6).toBe(false); // nothing strictly inside the door
    }
    expect(b.bucket().index.length / 3).toBe(6 * 12); // 3 piers + door lintel + window sill + window lintel
  });
  it('bakeFlood: brighter at the foot and on faces turned to the lamps, never NaN', () => {
    const b = new MeshBuffer('neon');
    b.quad([0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]); // facing +z (front), y 0…1
    b.quad([0, 20, 0], [1, 20, 0], [1, 21, 0], [0, 21, 0]); // same, high up
    b.quad([0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]); // facing −x (side)
    const bk = b.bucket();
    bakeFlood(bk);
    const c = bk.color!;
    expect([...c].every(Number.isFinite)).toBe(true);
    expect(c[0]!).toBeGreaterThan(c[12]!); // foot brighter than 20 m up
    expect(c[0]!).toBeGreaterThan(c[24]!); // front brighter than the side (ambient only)
  });
});

describe('ruinas-sao-paulo', () => {
  const out = ruinas(NAVE, ctx('0_-2', 'ruinas-sao-paulo', 5));
  it('builds finite geometry within budget, with walkable stair colliders', () => {
    expect(finite(out)).toBe(true);
    expect(tris(out)).toBeLessThan(25_000);
    expect(out.colliders.filter((c) => c.stairs).length).toBe(R.stair.flights * 2 - 1); // a ramp per flight + landing
    expect(out.colliders.length).toBeGreaterThan(R.stair.flights * 2);
  });
  it('the façade stands on the platform rise m above the stair foot and reaches its published height', () => {
    const b = bbox(out);
    expect(b.y1).toBeCloseTo(5 + R.terrace.rise + R.height, 1);
    expect(b.y0).toBeGreaterThan(5 - 3.5); // nothing far under the terrain
    // the stair foot: the lowest tread sits at the terrain
    const ramps = out.colliders.filter((c) => c.stairs);
    const ys = ramps.flatMap((c) => [...c.vertices].filter((_, i) => i % 3 === 1));
    expect(Math.min(...ys)).toBeCloseTo(5, 1);
    expect(Math.max(...ys)).toBeCloseTo(5 + R.terrace.rise, 1);
  });
  it('stays inside the outline bbox widened by the platform and the stair', () => {
    const b = bbox(out);
    expect(b.x0).toBeGreaterThan(139.5 - R.terrace.halfWidth);
    expect(b.x1).toBeLessThan(159.7 + R.terrace.halfWidth);
    expect(b.z0).toBeGreaterThan(-475.3 - R.terrace.back);
    expect(b.z1).toBeLessThan(-437.5 + R.stair.bottom + 2);
  });
  it('uses the unlit material for the floodlit façade and masonry for the stone platform', () => {
    const mats = new Set(out.meshes.map((m) => m.material));
    expect(mats.has('neon')).toBe(true);
    expect(mats.has('masonry')).toBe(true);
    expect(mats.has('bronze')).toBe(true);
    expect(out.meshes.some((m) => m.lod === 'near')).toBe(true);
  });
  it('classifies the registry outlines; the thin OSM façade slab builds nothing, a museum record a low block', () => {
    const FACADE: BuildingRec = { outer: [140, -432, 150, -432, 161, -432, 161, -434, 150, -434, 140, -433], kind: 'yes', height: 26.2, landmark: 'ruinas-sao-paulo' };
    const MUSEUM: BuildingRec = { outer: [116, -491, 117, -482, 139, -482, 139, -477, 162, -477, 162, -492], kind: 'yes', height: 30.3, landmark: 'ruinas-sao-paulo' };
    expect([NAVE, FACADE, MUSEUM, COLLEGE].map(classify)).toEqual(['nave', 'facade', 'museum', 'college']);
    expect(ruinas(FACADE, ctx('0_-2', 'ruinas-sao-paulo', 5)).meshes).toEqual([]);
    const m = ruinas(MUSEUM, ctx('0_-2', 'ruinas-sao-paulo', 4), { renderPart });
    expect(bbox(m).y1).toBeCloseTo(4 + R.museumTop, 3);
  });
  it('the façade front stands on the OSM façade line, `front` m south of the nave edge', () => {
    const lamps = out.meshes.filter((m) => m.material === 'neon' && !m.lod);
    let zMax = -Infinity;
    for (const m of lamps) for (let i = 2; i < m.position.length; i += 3) zMax = Math.max(zMax, m.position[i]!);
    expect(zMax).toBeCloseTo(-437.65 + R.front + Math.max(...R.lamps.map((l) => l[1])) + 0.25, 0);
  });
  it('the college outline (no height) becomes low walls on the slope', () => {
    const o = ruinas(COLLEGE, ctx('0_-2', 'ruinas-sao-paulo', 8));
    expect(finite(o)).toBe(true);
    const b = bbox(o);
    expect(b.y1).toBeCloseTo(8 + R.ruinWall.h, 3);
    expect(b.x0).toBeGreaterThan(175.3 - 1);
    expect(b.x1).toBeLessThan(212.7 + 1);
    expect(o.colliders.length).toBe(1);
  });
});

describe('science-center', () => {
  const S = L.mf1.science;
  const out = science(SCIENCE, ctx('7_3', 'science-center', -20));
  it('builds finite geometry within budget', () => {
    expect(finite(out)).toBe(true);
    expect(tris(out)).toBeLessThan(25_000);
    expect(out.colliders.length).toBe(1);
  });
  it('the cone reaches its height over the ground, the podium carries a glowing band, the spiral glows', () => {
    const b = bbox(out);
    expect(b.y1).toBeGreaterThan(-20 + S.cone.h); // the oblique cut passes through h at the axis, higher on the high side
    expect(b.y1).toBeLessThan(-20 + S.cone.h * 1.12);
    expect(out.meshes.filter((m) => m.material === 'neon').length).toBe(1);
    const neon = out.meshes.find((m) => m.material === 'neon')!;
    expect(neon.index.length / 3).toBeGreaterThan(SCIENCE.outer.length); // band + spiral
  });
  it('stays within the outline bbox (+ the cone radius)', () => {
    const b = bbox(out);
    expect(b.x0).toBeGreaterThan(1739 - 2);
    expect(b.x1).toBeLessThan(1912 + 2);
    expect(b.z0).toBeGreaterThan(700 - 2);
    expect(b.z1).toBeLessThan(885 + 2);
  });
});
