// g3 landmarks built from the real chunk records (flat ground): no NaN, triangle budget, published heights (±5 %),
// the L6 pit stop in front of the pyramid stays open ground. Skipped when the map data is missing.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { latLonToWorld } from '@race/shared';
import { describe, expect, it, vi } from 'vitest';
import { landmarks as LM } from '../../config.ts';
import { type BuildingRec, type ChunkData, chunkBounds, type LandmarkId } from '../../geo/chunkData.ts';
import type { BuildOut } from '../buildTypes.ts';
import { buildLandmarks } from './index.ts';
import { footprintFrame } from './kit.ts';

const dir = join(import.meta.dirname, '../../../public/data/chunks');
const has = existsSync(dir);
const recs = new Map<LandmarkId, { key: string; rec: BuildingRec }[]>();
if (has) {
  for (const f of readdirSync(dir)) {
    if (f === 'index.json') continue;
    const c = JSON.parse(readFileSync(join(dir, f), 'utf8')) as ChunkData;
    for (const rec of c.buildings) if (rec.landmark) recs.set(rec.landmark, [...(recs.get(rec.landmark) ?? []), { key: c.key, rec }]);
  }
}

const build = (id: LandmarkId): BuildOut => {
  const outs = recs.get(id)!.map(({ key, rec }) => buildLandmarks({ v: 2, key, buildings: [rec], roads: [], bridges: [], areas: [], points: [] }, { key, bounds: chunkBounds(key), height: () => 0 }));
  return { meshes: outs.flatMap((o) => o.meshes), instances: [], colliders: outs.flatMap((o) => o.colliders) };
};
const tris = (o: BuildOut) => o.meshes.reduce((s, m) => s + m.index.length / 3, 0);
const ys = (o: BuildOut, lod = true) => o.meshes.filter((m) => lod || !m.lod).flatMap((m) => [...m.position].filter((_, i) => i % 3 === 1));
const maxY = (o: BuildOut, lod = true) => Math.max(...ys(o, lod));
const finite = (o: BuildOut) =>
  o.meshes.every((m) => [m.position, m.normal, m.uv].every((a) => a.every(Number.isFinite)) && m.index.every((i) => i < m.position.length / 3)) &&
  o.colliders.every((c) => c.vertices.every(Number.isFinite));

/** Does the vertical segment at (x, z) from y0 to y1 cross any collider triangle? */
function hitsVertical(o: BuildOut, x: number, z: number, y0: number, y1: number) {
  for (const c of o.colliders) {
    const v = c.vertices;
    for (let k = 0; k < c.indices.length; k += 3) {
      const [a, b, d] = [c.indices[k]!, c.indices[k + 1]!, c.indices[k + 2]!].map((i) => [v[3 * i]!, v[3 * i + 1]!, v[3 * i + 2]!]) as [number[], number[], number[]];
      const s = (p: number[], q: number[]) => (q[0]! - p[0]!) * (z - p[2]!) - (q[2]! - p[2]!) * (x - p[0]!);
      const [s1, s2, s3] = [s(a, b), s(b, d), s(d, a)];
      if (!((s1 >= 0 && s2 >= 0 && s3 >= 0) || (s1 <= 0 && s2 <= 0 && s3 <= 0))) continue;
      if (Math.max(a[1]!, b[1]!, d[1]!) >= y0 && Math.min(a[1]!, b[1]!, d[1]!) <= y1) return true;
    }
  }
  return false;
}

// [id, triangle budget, published top (m above ground) or undefined, source]
const CASES: [LandmarkId, number, number | undefined][] = [
  ['louvre', 150_000, undefined], // no published per-wing heights: checked against the config table below
  ['pyramid', 20_000, 21.6], // en.wikipedia Louvre Pyramid
  ['carrousel', 60_000, undefined],
  ['palais-royal', 60_000, 30], // OSM height
  ['obelisk', 60_000, 33.37], // OSM height with the pedestal (shaft 22.83 m, fr.wikipedia)
  ['concorde-fountains', 20_000, undefined],
  ['vendome', 20_000, 44.3], // fr.wikipedia Colonne Vendôme
  ['madeleine', 60_000, 36.2], // OSM roof ridge
  ['opera', 60_000, undefined],
];

// Leg 2: Paris landmark, no Macao data (Louvre, Concorde, Madeleine, Opéra… OSM records)
describe.skip('g3 landmarks (real records)', () => {
  for (const [id, budget, top] of CASES) {
    it(`${id}: finite, ≤ ${budget} triangles, has colliders${top ? `, top ${top} m ± 5 %` : ''}`, () => {
      const warn = vi.spyOn(console, 'warn');
      const o = build(id);
      expect(warn).not.toHaveBeenCalled(); // a throwing detail function falls back to generic with a warning
      warn.mockRestore();
      console.log(id, tris(o), 'triangles', o.meshes.length, 'buckets, top', maxY(o).toFixed(2));
      expect(finite(o)).toBe(true);
      expect(tris(o)).toBeGreaterThan(0);
      expect(tris(o)).toBeLessThanOrEqual(budget);
      expect(o.colliders.length).toBeGreaterThan(0);
      if (top) expect(Math.abs(maxY(o) - top) / top).toBeLessThan(0.05);
    });
  }

  it('Louvre: tallest pavilion (Horloge dome + finial) and wing roofs as in the config table', () => {
    const o = build('louvre');
    const hor = LM.g3.louvre.pavilions[0]!;
    expect(maxY(o, false)).toBeCloseTo(hor[4] + hor[5] + 3.2, 0);
    expect(maxY(o, false)).toBeLessThan(50);
  });

  it('obelisk: shaft + pyramidion 22.83 m on the pedestal, gilded cap', () => {
    const o = build('obelisk');
    expect(o.meshes.some((m) => m.material === 'gold')).toBe(true);
    const gold = o.meshes.find((m) => m.material === 'gold' && !m.lod)!;
    const gy = [...gold.position].filter((_, i) => i % 3 === 1);
    expect(Math.max(...gy) - Math.min(...gy)).toBeCloseTo(LM.g3.obelisk.cap, 1);
  });

  it('Madeleine: ≥ 52 columns about 20 m tall', () => {
    const cols = recs.get('madeleine')![0]!.rec.parts!.filter((p) => p.kind === 'column');
    expect(cols.length).toBeGreaterThanOrEqual(52);
    for (const c of cols) expect(Math.abs((c.height ?? 0) - (c.minHeight ?? 0) - 20) / 20).toBeLessThan(0.05);
  });

  it('pyramid: 35.4 m base, 21.6 m apex, the L6 pit stop (48.86111, 2.33547) and its surroundings are open ground', () => {
    const o = build('pyramid');
    const fr = footprintFrame(recs.get('pyramid')![0]!.rec.outer); // g3.ts: side = a + b
    expect(Math.abs(fr.a + fr.b - 35.4) / 35.4).toBeLessThan(0.05);
    const { x, z } = latLonToWorld(48.86111, 2.33547);
    for (let a = 0; a < 8; a++) {
      for (const r of [0, 4, 8]) expect(hitsVertical(o, x + r * Math.cos(a), z + r * Math.sin(a), -1, 5), `${r} m`).toBe(false);
    }
    const f = recs.get('pyramid')![0]!.rec.outer;
    const [cx, cz] = [(Math.min(...f.filter((_, i) => i % 2 === 0)) + Math.max(...f.filter((_, i) => i % 2 === 0))) / 2, (Math.min(...f.filter((_, i) => i % 2 === 1)) + Math.max(...f.filter((_, i) => i % 2 === 1))) / 2];
    expect(hitsVertical(o, cx, cz, 0, 25)).toBe(true);
  });

  it('Opéra: the h70 outline is not extruded; dome, Apollo and stage below 70 m', () => {
    const o = build('opera');
    expect(maxY(o)).toBeLessThan(70);
    expect(maxY(o)).toBeGreaterThan(58);
  });
});
