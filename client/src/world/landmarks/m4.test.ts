import { latLonToWorld } from '@race/shared';
import { describe, expect, it } from 'vitest';
import { landmarks as L } from '../../config.ts';
import { type BuildingRec, chunkBounds, type LandmarkId, type XZ } from '../../geo/chunkData.ts';
import { LANDMARK_BY_ID } from '../../geo/landmarks.ts';
import type { BuildOut } from '../buildTypes.ts';
import { MeshBuffer } from '../geom.ts';
import { helpers, type LandmarkCtx } from './index.ts';
import { compass, details, lattice, petal, roundEndFrame, scaleRing, walls } from './m4.ts';

const M = L.m4;
const G = 10;
const ctx = (id: LandmarkId): LandmarkCtx => ({ key: '0_0', bounds: chunkBounds('0_0'), height: () => G, def: LANDMARK_BY_ID.get(id)!, ground: G, minGround: G });
const circle = (cx: number, cz: number, r: number, n = 24): XZ => Array.from({ length: n }, (_, s) => [cx + r * Math.cos((2 * Math.PI * s) / n), cz + r * Math.sin((2 * Math.PI * s) / n)]).flat();
const rect = (x0: number, z0: number, x1: number, z1: number): XZ => [x0, z0, x1, z0, x1, z1, x0, z1];
const build = (id: LandmarkId, rec: BuildingRec) => details[id]!(rec, [], ctx(id), helpers);

function stats(o: BuildOut) {
  let [maxY, minY, tris, nan] = [-Infinity, Infinity, 0, 0];
  for (const m of o.meshes) {
    tris += m.index.length / 3;
    for (let i = 0; i < m.position.length; i += 3) {
      const [x, y, z] = [m.position[i]!, m.position[i + 1]!, m.position[i + 2]!];
      if (!Number.isFinite(x + y + z)) nan++;
      [maxY, minY] = [Math.max(maxY, y), Math.min(minY, y)];
    }
    for (const a of [m.normal, m.color ?? []]) for (const v of a) if (!Number.isFinite(v)) nan++;
  }
  return { maxY, minY, tris, nan, materials: [...new Set(o.meshes.map((m) => m.material))].sort() };
}

describe('m4 helpers', () => {
  it('compass: 0 = north (−Z), 90 = east (+X)', () => {
    expect(compass(0)[1]).toBeCloseTo(-1, 9);
    expect(compass(90)[0]).toBeCloseTo(1, 9);
  });
  it('walls face away from the ring (outer, area > 0 after partRings)', () => {
    const b = new MeshBuffer('masonry');
    walls(b, helpers.partRings({ outer: rect(0, 0, 10, 10) })![0]!, 0, 3);
    const k = b.bucket();
    for (let i = 0; i < k.position.length; i += 3) {
      const [dx, dz] = [k.position[i]! - 5, k.position[i + 2]! - 5];
      expect(dx * k.normal[i]! + dz * k.normal[i + 2]!).toBeGreaterThan(0);
    }
  });
  it('scaleRing scales about the given centre', () => {
    expect(scaleRing(rect(0, 0, 10, 10), 0.5, 5, 5)).toEqual(rect(2.5, 2.5, 7.5, 7.5));
  });
  it('lattice: 2 strips per cell, cells fitted to each face', () => {
    const b = new MeshBuffer('masonry');
    lattice(b, rect(0, 0, 18, 9), 0, 16, { w: 9, h: 8, t: 0.5, out: 0.2 });
    // faces 18, 9, 18, 9 m → 2 + 1 + 2 + 1 columns × 2 rows × 2 strips × 2 triangles
    expect(b.bucket().index.length / 3).toBe(6 * 2 * 2 * 2);
  });
  it('roundEndFrame points +u at the end with more vertices', () => {
    const ring = [...rect(0, 0, 40, 20).slice(0, 4), 45, 5, 46, 10, 45, 15, ...rect(0, 0, 40, 20).slice(4)];
    expect(roundEndFrame(ring).ux).toBeGreaterThan(0.9);
    expect(roundEndFrame(ring.map((v, i) => (i % 2 ? v : -v))).ux).toBeLessThan(-0.9);
  });
  it('petal: two faces per quad, no NaN', () => {
    const b = new MeshBuffer('neon');
    petal(b, 0, 0, 0, 1, 30, 20, 2, 1.5, 0.4, 6);
    const k = b.bucket();
    expect(k.index.length / 3).toBe(6 * 2 * 2 * 2);
    expect([...k.position].every(Number.isFinite)).toBe(true);
  });
});

describe('m4 landmarks', () => {
  it('bank-of-china: shaft + crown to 163 m, curtain with lit seed, ≤ 15k triangles', () => {
    const o = build('bank-of-china', { outer: rect(0, 0, 45, 40), kind: 'office', height: 116.3 });
    const s = stats(o);
    expect(s.nan).toBe(0);
    expect(s.maxY).toBeCloseTo(G + M.boc.height, 3);
    expect(s.tris).toBeLessThan(15000);
    expect(s.materials).toEqual(['curtain', 'masonry', 'metal', 'neon']);
    expect(o.meshes.find((m) => m.material === 'curtain')!.lit![0]).toBeCloseTo(M.boc.lit, 6);
    expect(o.colliders.length).toBe(1);
  });
  it('cultural-centre: block + auditorium to the OSM height, the sail higher still', () => {
    const outer = [...rect(0, 0, 100, 60).slice(0, 4), 110, 15, 113, 30, 110, 45, ...rect(0, 0, 100, 60).slice(4)];
    const s = stats(build('cultural-centre', { outer, kind: 'yes', height: 25.6 }));
    expect(s.nan).toBe(0);
    expect(s.maxY).toBeGreaterThan(G + 25.6);
    expect(s.maxY).toBeLessThan(G + 25.6 + M.cultural.sail.rise + 2);
    expect(s.tris).toBeLessThan(15000);
  });
  it('kun-iam-statue: 7 m base + 20 m figure on the plinth', () => {
    const o = build('kun-iam-statue', { outer: circle(0, 0, 9.7), kind: 'yes', height: 20 });
    const s = stats(o);
    expect(s.nan).toBe(0);
    expect(s.maxY).toBeCloseTo(G + M.kunIam.base.plinth + M.kunIam.base.h + 20, 3);
    expect(s.tris).toBeLessThan(15000);
    expect(o.colliders.length).toBe(1);
  });
  it('praca-flor-de-lotus: the lotus stands at the configured node, ≈ 6 m over its granite base', () => {
    const o = build('praca-flor-de-lotus', { outer: rect(500, 500, 600, 600), kind: 'artwork' });
    const s = stats(o);
    expect(s.nan).toBe(0);
    const p = latLonToWorld(M.lotus.at[0], M.lotus.at[1]);
    const gold = o.meshes.find((m) => m.material === 'neon')!;
    let [mx, mz, n] = [0, 0, 0];
    for (let i = 0; i < gold.position.length; i += 3) [mx, mz, n] = [mx + gold.position[i]!, mz + gold.position[i + 2]!, n + 1];
    expect(Math.hypot(mx / n - p.x, mz / n - p.z)).toBeLessThan(1);
    const base = M.lotus.tiers.reduce((a, [, h]) => a + h, 0);
    expect(s.maxY - (G + 0.06 + base)).toBeGreaterThan(5);
    expect(s.maxY - (G + 0.06 + base)).toBeLessThan(7);
    expect(s.tris).toBeLessThan(15000);
    expect(build('praca-flor-de-lotus', { outer: circle(0, 0, 6.4), kind: 'yes' }).meshes).toEqual([]); // the statue outline
  });
  it('portas-do-cerco: the small outline is the gate, the big one the border post', () => {
    const gate = stats(build('portas-do-cerco', { outer: rect(0, 0, 19, 3), kind: 'yes' }));
    const g = M.portas.gate;
    expect(gate.nan).toBe(0);
    expect(gate.maxY).toBeCloseTo(G + g.h + 0.6 + g.attic[1] + g.crest[1], 3);
    expect(gate.materials).toEqual(['neon']);
    const post = stats(build('portas-do-cerco', { outer: rect(0, 0, 300, 100), kind: 'yes' }));
    expect(post.maxY).toBeCloseTo(G + M.portas.post.h + 0.35, 3);
    expect(post.materials).toEqual(['curtain', 'masonry', 'neon']);
  });
});
