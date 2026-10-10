import { latLonToWorld } from '@race/shared';
import { describe, expect, it } from 'vitest';
import { landmarks as L } from '../../config.ts';
import { type BuildingRec, chunkBounds, type LandmarkId, type XZ } from '../../geo/chunkData.ts';
import { LANDMARK_BY_ID } from '../../geo/landmarks.ts';
import type { BuildOut } from '../buildTypes.ts';
import { MeshBuffer } from '../geom.ts';
import { helpers, type LandmarkCtx } from './index.ts';
import { compass, details, petal, roundEndFrame, scaleRing, walls } from './m4.ts';
import { recordGround } from './parts.ts';

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
  it('bank-of-china: main shaft to 116.3 m + the tower record on its roof up to 163 m, curtain with lit seed, ≤ 15k triangles', () => {
    const main = build('bank-of-china', { outer: rect(0, 0, 45, 40), kind: 'office', height: 116.3 });
    const s = stats(main);
    expect(s.nan).toBe(0);
    expect(s.maxY).toBeCloseTo(G + M.boc.body + 0.05, 3); // + the lit roof edge
    expect(s.tris).toBeLessThan(15000);
    expect(s.materials).toEqual(['curtain', 'masonry', 'neon']);
    expect(main.meshes.find((m) => m.material === 'curtain')!.lit![0]).toBeCloseTo(M.boc.lit, 6);
    expect(main.colliders.length).toBe(1);
    const t = stats(build('bank-of-china', { outer: rect(0, 5, 30, 40), kind: 'commercial', height: 166 }));
    expect(t.nan).toBe(0);
    expect(t.maxY).toBeCloseTo(G + M.boc.height, 3);
    expect(t.tris).toBeLessThan(15000);
  });
  it('bank-of-china: on a slope both records share one ground, the tower part starts exactly on the main roof (audit a4)', () => {
    const slope = (x: number, z: number) => G + 0.08 * x - 0.05 * z; // the two outlines' own grounds differ here
    const at = (outer: XZ, height: number) => details['bank-of-china']!({ outer, kind: 'yes', height }, [], { ...ctx('bank-of-china'), height: slope, ...recordGround(outer, slope) }, helpers);
    const main = at(rect(300, 360, 390, 440), 116.3);
    const tower = at(rect(320, 370, 370, 420), 166);
    const roof = Math.max(...main.meshes.filter((m) => m.material === 'curtain').flatMap((m) => [...m.position].filter((_, i) => i % 3 === 1)));
    const foot = stats(tower).minY;
    expect(foot).toBeCloseTo(roof, 6);
  });
  it('cultural-centre: block + auditorium to the OSM height, the sail higher still', () => {
    const outer = [...rect(0, 0, 100, 60).slice(0, 4), 110, 15, 113, 30, 110, 45, ...rect(0, 0, 100, 60).slice(4)];
    const s = stats(build('cultural-centre', { outer, kind: 'yes', height: 25.6 }));
    expect(s.nan).toBe(0);
    expect(s.maxY).toBeGreaterThan(G + 25.6);
    expect(s.maxY).toBeLessThan(G + 25.6 + M.cultural.sail.rise + 2);
    expect(s.tris).toBeLessThan(15000);
  });
  it('cultural-centre: the auditorium block stays on its outline at a pointed end and a side notch (audit a4)', () => {
    // the box on the frame (x 52.5–90, z 11.4–48.6) stuck out of this pointed end and across the notch at x 55–65, z 0–14
    const outer = [0, 0, 55, 0, 55, 14, 65, 14, 65, 0, 70, 0, 85, 8, 95, 18, 100, 30, 95, 42, 85, 52, 70, 60, 0, 60];
    const o = build('cultural-centre', { outer, kind: 'yes', height: 25.6 });
    const C = M.cultural;
    const inside = (x: number, z: number) => {
      let [ins, d] = [false, Infinity];
      for (let i = 0, j = outer.length - 2; i < outer.length; j = i, i += 2) {
        const [ax, az, bx, bz] = [outer[j]!, outer[j + 1]!, outer[i]!, outer[i + 1]!];
        if (az > z !== bz > z && x < ((bx - ax) * (z - az)) / (bz - az) + ax) ins = !ins;
        const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (z - az) * (bz - az)) / ((bx - ax) ** 2 + (bz - az) ** 2)));
        d = Math.min(d, Math.hypot(x - ax - t * (bx - ax), z - az - t * (bz - az)));
      }
      return ins || d < 0.01;
    };
    let n = 0;
    for (const m of o.meshes.filter((q) => q.material === 'masonry')) {
      for (let i = 0; i < m.position.length; i += 3) {
        const y = m.position[i + 1]! - G;
        if (Math.abs(y - (C.wall - 0.5)) > 0.01) continue; // the block's foot ring (no other vertex at that height)
        n++;
        expect(inside(m.position[i]!, m.position[i + 2]!), `${m.position[i]}, ${m.position[i + 2]}`).toBe(true);
      }
    }
    expect(n).toBeGreaterThan(7);
  });
  it('kun-iam-statue: 7 m base + 20 m figure on the plinth', () => {
    const o = build('kun-iam-statue', { outer: circle(0, 0, 9.7), kind: 'yes', height: 20 });
    const s = stats(o);
    expect(s.nan).toBe(0);
    expect(s.maxY).toBeCloseTo(G + M.kunIam.base.plinth + M.kunIam.base.h + 20, 3);
    expect(s.tris).toBeLessThan(15000);
    expect(o.colliders.length).toBe(1);
    expect(Math.max(...[...o.colliders[0]!.vertices].filter((_, i) => i % 3 === 0))).toBeCloseTo(9.7 + 0.6, 3); // the plinth's rim is solid too (audit a4)
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
    // on a slope the level paving disc is a solid platform: no walking into its skirt and under the granite base (audit a4)
    const slope = (x: number) => G + 0.3 * (x - p.x);
    const o2 = details['praca-flor-de-lotus']!({ outer: rect(500, 500, 600, 600), kind: 'artwork' }, [], { ...ctx('praca-flor-de-lotus'), height: slope }, helpers);
    const R = M.lotus.paving.r;
    const ys = o2.colliders.flatMap((c) => [...c.vertices].filter((_, i) => i % 3 === 1));
    expect(Math.min(...ys)).toBeCloseTo(G - 0.3 * R - 0.4, 3); // from under the lowest ground…
    expect(ys.some((y) => Math.abs(y - (G + 0.3 * R + 0.06)) < 1e-3)).toBe(true); // …to the disc top
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
