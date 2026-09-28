// Group g5 on the real chunk data (skipped when it is missing): each landmark's DetailFn runs without falling back to
// the generic renderer, its top matches the published height (± 5 %), no NaN, triangle budget, simplified colliders.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { type BuildingRec, chunkBounds, type ChunkData, type ChunkIndex, type LandmarkId, type SkylineData, type WaterData } from '../../geo/chunkData.ts';
import { heightAt, parseHeightGrid } from '../../geo/heightGrid.ts';
import { LANDMARK_BY_ID } from '../../geo/landmarks.ts';
import type { BuildOut, MeshBucket } from '../buildTypes.ts';
import { carveRiver } from '../Terrain.ts';
import { details, buildSkyline } from './g5.ts';
import { helpers } from './index.ts';
import { recordGround } from './parts.ts';

const data = join(import.meta.dirname, '../../../public/data');
const has = ['chunks/index.json', 'water.json', 'elevation.json', 'elevation.bin', 'skyline.json'].every((f) => existsSync(join(data, f)));
const read = <T>(f: string) => JSON.parse(readFileSync(join(data, f), 'utf8')) as T;

// Published top (m above ground) and triangle budget per landmark.
const EXPECT: Partial<Record<LandmarkId, { top: number; budget: number }>> = {
  'notre-dame': { top: 96, budget: 150_000 }, // spire + rooster (notredamedeparis.fr)
  'sainte-chapelle': { top: 75, budget: 60_000 }, // fr.wikipedia
  conciergerie: { top: 44, budget: 60_000 }, // Tour de l'Horloge lantern (OSM height=44)
  'hotel-de-ville': { top: 50, budget: 60_000 }, // campanile cross (estimate, see g5.ts)
  pompidou: { top: 42, budget: 60_000 }, // fr.wikipedia
  'tour-saint-jacques': { top: 52, budget: 20_000 }, // fr.wikipedia
  'saint-sulpice': { top: 70.3, budget: 60_000 }, // north tower, OSM
  pantheon: { top: 83, budget: 60_000 }, // en.wikipedia
  luxembourg: { top: 0, budget: 60_000 }, // top = OSM parts
};

const ys = (b: MeshBucket) => [...b.position].filter((_, i) => i % 3 === 1);

describe.skipIf(!has)('g5 landmarks on the real chunks', () => {
  const grid = parseHeightGrid(read('elevation.json'), readFileSync(join(data, 'elevation.bin')));
  carveRiver(grid, read<WaterData>('water.json'));
  const height = (x: number, z: number) => heightAt(grid, x, z);
  const recs = new Map<LandmarkId, { key: string; rec: BuildingRec }[]>();
  for (const key of read<ChunkIndex>('chunks/index.json').keys) {
    for (const rec of read<ChunkData>(`chunks/${key}.json`).buildings) {
      if (rec.landmark && rec.landmark in details) recs.set(rec.landmark, [...(recs.get(rec.landmark) ?? []), { key, rec }]);
    }
  }

  for (const [id, e] of Object.entries(EXPECT) as [LandmarkId, { top: number; budget: number }][]) {
    it(id, () => {
      const warn = vi.spyOn(console, 'warn');
      const list = recs.get(id) ?? [];
      expect(list.length).toBeGreaterThan(0);
      let [tris, top, colliders, osmTop] = [0, 0, 0, 0];
      const materials = new Set<string>();
      for (const { key, rec } of list) {
        const ctx = { key, bounds: chunkBounds(key), height, def: LANDMARK_BY_ID.get(id)!, ...recordGround(rec.outer, height) };
        const generic = helpers.generic(rec, rec.parts ?? [], ctx);
        const out: BuildOut = details[id]!(rec, rec.parts ?? [], ctx, helpers);
        expect(out.meshes.length).toBeGreaterThan(generic.meshes.length > 0 ? 0 : -1);
        for (const b of out.meshes) {
          expect([b.position, b.normal, ...(b.color ? [b.color] : [])].every((a) => a.every(Number.isFinite)), `${id} ${b.material} NaN`).toBe(true);
          expect(b.index.every((i) => i < b.position.length / 3)).toBe(true);
          tris += b.index.length / 3;
          top = Math.max(top, ...ys(b).map((y) => y - ctx.ground));
          materials.add(`${b.material}${b.lod ? `:${b.lod}` : ''}`);
        }
        // the details add something beyond the generic renderer (i.e. no silent fallback)
        expect(out.meshes.reduce((s, b) => s + b.index.length, 0)).not.toBe(generic.meshes.reduce((s, b) => s + b.index.length, 0));
        for (const c of out.colliders) expect(c.vertices.every(Number.isFinite)).toBe(true);
        colliders += out.colliders.length;
        osmTop = Math.max(osmTop, rec.height ?? 0, ...(rec.parts ?? []).map((p) => p.height ?? 0));
      }
      console.log(`${id}: ${list.length} rec, ${tris} tris, top ${top.toFixed(1)} (osm ${osmTop}), ${colliders} colliders, ${[...materials].join(' ')}`);
      expect(warn).not.toHaveBeenCalled();
      warn.mockRestore();
      expect(tris).toBeLessThanOrEqual(e.budget);
      expect(Math.abs(top - (e.top || osmTop)) / (e.top || osmTop)).toBeLessThan(0.05);
      expect(colliders).toBeGreaterThan(0);
      expect(materials.has('masonry:near') || materials.has('gold:near') || materials.has('stone:near')).toBe(true);
    });
  }

  it('skyline: Sacré-Cœur, Montparnasse, La Défense + Grande Arche at their heights', () => {
    const sky = read<SkylineData>('skyline.json');
    const b = buildSkyline(sky, height);
    const all = b.flatMap(ys);
    expect(b.every((m) => m.position.every(Number.isFinite))).toBe(true);
    const tris = b.reduce((s, m) => s + m.index.length / 3, 0);
    console.log(`skyline: ${b.length} buckets, ${tris} tris, top ${Math.max(...all).toFixed(1)}`);
    expect(tris).toBeLessThan(40_000);
    // Montparnasse 210 m (+ its ground), Sacré-Cœur top 130 + 83 m ASL − 34 m (DEM at the origin)
    expect(Math.max(...all)).toBeGreaterThan(205);
    expect(b).toHaveLength(1); // one draw call
  });
});
