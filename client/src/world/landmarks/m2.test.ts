import { describe, expect, it } from 'vitest';
import { landmarks as L } from '../../config.ts';
import { type BuildingRec, chunkBounds, type LandmarkId, ringArea, type XZ } from '../../geo/chunkData.ts';
import { LANDMARK_BY_ID } from '../../geo/landmarks.ts';
import type { BuildOut } from '../buildTypes.ts';
import { helpers, type LandmarkCtx } from './index.ts';
import { amaTiers, densify, details, edgeFacing, facing, maxInside, monteTerrace, rand } from './m2.ts';

const M = L.m2;
type HF = (x: number, z: number) => number;
const ctx = (id: LandmarkId, height: HF = () => 10): LandmarkCtx => ({ key: '0_0', bounds: chunkBounds('0_0'), height, def: LANDMARK_BY_ID.get(id)!, ground: 10, minGround: 10 });
const rect = (x0: number, z0: number, x1: number, z1: number): XZ => [x0, z1, x1, z1, x1, z0, x0, z0]; // area > 0
const circle = (cx: number, cz: number, r: number, n = 19): XZ => Array.from({ length: n }, (_, s) => [cx + r * Math.cos((-2 * Math.PI * s) / n), cz + r * Math.sin((-2 * Math.PI * s) / n)]).flat();

function stats(o: BuildOut) {
  let [maxY, minY, tris, nan] = [-Infinity, Infinity, 0, 0];
  const box = { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity };
  for (const m of o.meshes) {
    tris += m.index.length / 3;
    for (let i = 0; i < m.position.length; i += 3) {
      const [x, y, z] = [m.position[i]!, m.position[i + 1]!, m.position[i + 2]!];
      if (!Number.isFinite(x + y + z)) nan++;
      [maxY, minY] = [Math.max(maxY, y), Math.min(minY, y)];
      [box.x0, box.x1, box.z0, box.z1] = [Math.min(box.x0, x), Math.max(box.x1, x), Math.min(box.z0, z), Math.max(box.z1, z)];
    }
    for (const v of m.normal) if (!Number.isFinite(v)) nan++;
    if (m.index.some((k) => k >= m.position.length / 3)) nan++;
  }
  for (const c of o.colliders) for (const v of c.vertices) if (!Number.isFinite(v)) nan++;
  return { maxY, minY, tris, nan, box, colliders: o.colliders.reduce((s, c) => s + c.indices.length / 3, 0) };
}
function bbox(r: XZ) {
  const xs = r.filter((_, k) => k % 2 === 0);
  const zs = r.filter((_, k) => k % 2 === 1);
  return { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) };
}
/** Built geometry stays within the outline's box grown by `pad` m (steps / forecourts reach out of the outline). */
function expectInside(o: BuildOut, r: XZ, pad: number) {
  const b = bbox(r);
  const s = stats(o).box;
  expect(s.x0).toBeGreaterThanOrEqual(b.x0 - pad);
  expect(s.x1).toBeLessThanOrEqual(b.x1 + pad);
  expect(s.z0).toBeGreaterThanOrEqual(b.z0 - pad);
  expect(s.z1).toBeLessThanOrEqual(b.z1 + pad);
}
const build = (id: LandmarkId, rec: BuildingRec, height?: HF) => details[id]!(rec, [], ctx(id, height), helpers);

describe('m2 helpers', () => {
  it('facing turns the frame to the axis closest to the azimuth', () => {
    const r = rect(0, 0, 40, 10); // long axis east-west
    const e = facing(r, 90);
    expect(e.ux).toBeCloseTo(1, 6);
    expect(e.a).toBeCloseTo(20, 6);
    const n = facing(r, 10);
    expect(n.uz).toBeCloseTo(-1, 6); // north = −z
    expect(n.a).toBeCloseTo(5, 6);
  });
  it('densify keeps the corners and caps edge length', () => {
    const d = densify(rect(0, 0, 20, 7), 3).ring;
    for (let i = 0; i < d.length; i += 2) expect(Math.hypot(d[(i + 2) % d.length]! - d[i]!, d[(i + 3) % d.length]! - d[i + 1]!)).toBeLessThanOrEqual(3 + 1e-9);
    expect(ringArea(d)).toBeCloseTo(140, 6);
  });
  it('edgeFacing finds the edge whose outward normal faces the azimuth', () => {
    const r = rect(0, 0, 10, 10); // (0,10) (10,10) (10,0) (0,0): edges S, E, N, W
    expect(ringArea(r)).toBeGreaterThan(0);
    expect(edgeFacing(r, 180)).toBe(0);
    expect(edgeFacing(r, 90)).toBe(1);
    expect(edgeFacing(r, 0)).toBe(2);
    expect(edgeFacing(r, 270)).toBe(3);
  });
  it('maxInside samples the interior, not only the vertices', () => {
    const bump: HF = (x, z) => 20 - Math.hypot(x - 50, z - 50) * 0.1;
    expect(maxInside(rect(0, 0, 100, 100), bump)).toBeGreaterThan(19.5);
    expect(monteTerrace(rect(0, 0, 100, 100), bump)).toBeCloseTo(maxInside(rect(0, 0, 100, 100), bump) + M.monte.terraceRise, 6);
  });
  it('rand is deterministic and in [0, 1)', () => {
    const [a, b] = [rand(7), rand(7)];
    for (let k = 0; k < 50; k++) {
      const v = a();
      expect(v).toBe(b());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
  it('amaTiers climb with the hill and cover the outline depth', () => {
    const f = facing(rect(0, 0, 28, 40), M.ama.az); // front faces west: +a = west
    const t = amaTiers(f, (x) => 10 - 0.3 * x); // higher to the west… then reversed: uphill east
    const up = amaTiers(f, (x) => 10 + 0.3 * x);
    expect(t.at(-1)!.d1).toBeCloseTo(2 * f.a, 6);
    for (let k = 1; k < up.length; k++) expect(up[k]!.y).toBeGreaterThan(up[k - 1]!.y);
    for (let k = 1; k < t.length; k++) expect(t[k]!.y).toBeGreaterThanOrEqual(t[k - 1]!.y); // never lower than the tier in front
  });
});

describe('m2 landmarks on synthetic outlines', () => {
  const slope: HF = (x, z) => 10 + 0.08 * x - 0.05 * z;
  it('fortaleza-monte: terrace above the hill, walls to the foot, cannons, colliders', () => {
    const r = rect(0, 0, 140, 100);
    const hill: HF = (x, z) => 20 - Math.hypot(x - 70, z - 50) * 0.05;
    const o = build('fortaleza-monte', { outer: r, kind: 'yes', height: 57.1 }, hill);
    const s = stats(o);
    const yT = monteTerrace(r, hill);
    expect(s.nan).toBe(0);
    expect(s.tris).toBeLessThan(15_000);
    expect(s.maxY).toBeLessThan(yT + M.monte.parapet + M.monte.merlon.h + 1);
    expect(s.minY).toBeLessThan(hill(0, 0)); // walls reach down the slope
    expect(s.colliders).toBeGreaterThan(100);
    expectInside(o, r, 12);
    expect(o.meshes.some((m) => m.material === 'metal' && m.lod === 'near')).toBe(true); // cannons
  });
  it('fortaleza-monte zone member (museum) is a low block on the terrace, not its OSM 62 m', () => {
    const r = rect(30, 30, 60, 50);
    const o = build('fortaleza-monte', { outer: r, kind: 'yes', height: 62 });
    expect(stats(o).maxY).toBeCloseTo(monteTerrace(r, () => 10) + M.monte.museum.above, 1);
  });
  it('fortaleza-guia: walls follow the terrain, zone houses stay low', () => {
    const r = densify(rect(0, 0, 60, 70), 30).ring;
    const o = build('fortaleza-guia', { outer: r, kind: 'ruins' }, slope);
    const s = stats(o);
    expect(s.nan).toBe(0);
    expect(s.tris).toBeLessThan(15_000);
    expect(s.maxY).toBeLessThan(Math.max(slope(60, 0), slope(60, 70)) + M.guia.wallH + M.guia.merlon.h + 0.1);
    expectInside(o, r, 2);
    const h = build('fortaleza-guia', { outer: rect(10, 10, 20, 30), kind: 'yes', height: 97.8 });
    expect(stats(h).maxY).toBeLessThanOrEqual(10 + M.guia.house.height + 1e-6);
  });
  it('farol-guia: ≈ 15 m white tower, not the OSM 104 m', () => {
    const r = circle(100, 100, 4.5);
    const o = build('farol-guia', { outer: r, kind: 'yes', height: 104.2 });
    const s = stats(o);
    expect(s.nan).toBe(0);
    expect(s.maxY - 10).toBeCloseTo(M.guia.lighthouse.vane, 6);
    expect(s.maxY - 10).toBeLessThanOrEqual(16);
    expect(o.meshes.some((m) => m.material === 'neon')).toBe(true); // lantern
    expectInside(o, r, 0.5);
  });
  it('templo-ama: terraces, gate, three halls, lanterns; the square record builds nothing', () => {
    const r = rect(0, 0, 28, 40);
    const o = build('templo-ama', { outer: r, kind: 'yes', height: 8.2 }, (x) => 10 - 0.3 * x);
    const s = stats(o);
    expect(s.nan).toBe(0);
    expect(s.tris).toBeLessThan(15_000);
    expect(s.colliders).toBeGreaterThan(20);
    expectInside(o, r, 15);
    expect(o.meshes.filter((m) => m.material === 'neon').length).toBeGreaterThan(0);
    expect(build('templo-ama', { outer: r, kind: 'artwork' }).meshes).toHaveLength(0);
  });
  it('kun-iam-tong: a hall per record, the main one with a forecourt and ridge figures', () => {
    const r = rect(0, 0, 15, 13);
    const main = stats(build('kun-iam-tong', { outer: r, kind: 'temple' }));
    const side = stats(build('kun-iam-tong', { outer: r, kind: 'yes', height: 17.4 }));
    expect(main.nan + side.nan).toBe(0);
    expect(main.tris).toBeGreaterThan(side.tris);
    expect(side.maxY).toBeLessThan(10 + M.kunIam.eave + M.kunIam.rise + 3);
    expect(main.tris).toBeLessThan(15_000);
  });
  it('jardim-lou-lim-ioc: wall with a moon gate, pavilions, rockery inside the garden box', () => {
    const r = densify(rect(800, -840, 960, -690), 40).ring;
    const o = build('jardim-lou-lim-ioc', { outer: r, kind: 'artwork' });
    const s = stats(o);
    expect(s.nan).toBe(0);
    expect(s.tris).toBeLessThan(15_000);
    expectInside(o, r, 1);
    for (const [x, z] of M.louLimIoc.pavilions) {
      const b = bbox(r);
      expect(x).toBeGreaterThan(b.x0), expect(x).toBeLessThan(b.x1), expect(z).toBeGreaterThan(b.z0), expect(z).toBeLessThan(b.z1);
    }
    expect(stats(build('jardim-lou-lim-ioc', { outer: rect(870, -800, 900, -780), kind: 'yes' })).nan).toBe(0); // zone hall
  });
  it('churches: platform, nave, façade / towers at the published-or-estimated heights', () => {
    for (const [id, r] of [['sao-lourenco', rect(0, 0, 28, 56)], ['santo-agostinho', rect(0, 0, 25, 50)], ['ermida-penha', rect(0, 0, 9, 29)]] as [LandmarkId, XZ][]) {
      const c = M.churches[id]!;
      const s = stats(build(id, { outer: r, kind: 'church', height: 40 }));
      expect(s.nan, id).toBe(0);
      expect(s.tris, id).toBeLessThan(15_000);
      const top = 10 + c.platform + Math.max(c.towerH + (c.cap === 'dome' ? 4 : 5.6), c.facadeH + c.pediment + 1.8, c.wallH + c.rise);
      expect(s.maxY, id).toBeCloseTo(top, 1);
      expectInside({ meshes: build(id, { outer: r, kind: 'church' }).meshes, instances: [], colliders: [] }, r, 12);
    }
  });
  it('ermida-penha: the large outline is the residence (no tower)', () => {
    const s = stats(build('ermida-penha', { outer: rect(0, 0, 25, 30), kind: 'yes', height: 73.3 }));
    expect(s.maxY).toBeLessThanOrEqual(10 + M.penhaHouse.height + 1e-6);
  });
});
