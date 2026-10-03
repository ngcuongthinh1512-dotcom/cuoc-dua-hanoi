// g2 bridges on the REAL chunks + carved grid (skipped without map data): layout from the terrain (river runs, arch
// counts), published heights within 5 %, no NaN, triangle budget per landmark.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { landmarks as LM } from '../../config.ts';
import { type BuildingRec, type ChunkData, chunkBounds, type ChunkIndex, type LandmarkId, type WaterData } from '../../geo/chunkData.ts';
import { heightAt, parseHeightGrid } from '../../geo/heightGrid.ts';
import { LANDMARK_BY_ID } from '../../geo/landmarks.ts';
import type { BuildOut } from '../buildTypes.ts';
import { carveRiver } from '../Terrain.ts';
import { details, flamme, site } from './g2.ts';
import { helpers, type LandmarkCtx } from './index.ts';
import { recordGround } from './parts.ts';

const data = join(import.meta.dirname, '../../../public/data');
const has = ['chunks/index.json', 'water.json', 'elevation.json', 'elevation.bin'].every((f) => existsSync(join(data, f)));
const C = LM.g2;

describe.skipIf(!has)('g2 Seine bridges', () => {
  const grid = has ? parseHeightGrid(JSON.parse(readFileSync(join(data, 'elevation.json'), 'utf8')), readFileSync(join(data, 'elevation.bin'))) : undefined!;
  if (has) carveRiver(grid, JSON.parse(readFileSync(join(data, 'water.json'), 'utf8')) as WaterData);
  const recs = new Map<LandmarkId, { rec: BuildingRec; ctx: LandmarkCtx }[]>();
  if (has) {
    const index = JSON.parse(readFileSync(join(data, 'chunks/index.json'), 'utf8')) as ChunkIndex;
    for (const key of index.keys) {
      const chunk = JSON.parse(readFileSync(join(data, `chunks/${key}.json`), 'utf8')) as ChunkData;
      for (const rec of chunk.buildings) {
        if (!rec.landmark || !(rec.landmark in details || rec.landmark === 'flamme')) continue; // 8C: flamme left g2's details
        const height = (x: number, z: number) => heightAt(grid, x, z);
        const ctx: LandmarkCtx = { key, bounds: chunkBounds(key), height, def: LANDMARK_BY_ID.get(rec.landmark)!, ...recordGround(rec.outer, height) };
        recs.set(rec.landmark, [...(recs.get(rec.landmark) ?? []), { rec, ctx }]);
      }
    }
  }
  // Phase 8C: with graphics8c.flamme on, the Flamme's procedural model is only the scan's far level (no g2 detail)
  const build = (id: LandmarkId) => recs.get(id)!.map(({ rec, ctx }) => (id === 'flamme' ? flamme(rec, ctx) : details[id]!(rec, rec.parts ?? [], ctx, helpers)));
  const tris = (outs: BuildOut[]) => outs.reduce((s, o) => s + o.meshes.reduce((t, m) => t + m.index.length / 3, 0), 0);
  const ys = (o: BuildOut, mat: string) => o.meshes.filter((m) => m.material === mat).flatMap((m) => [...m.position].filter((_, i) => i % 3 === 1));
  const sane = (outs: BuildOut[]) =>
    outs.every((o) => o.meshes.every((m) => [m.position, m.normal, m.uv, m.color].every((a) => !a || a.every(Number.isFinite)) && m.index.every((i) => i < m.position.length / 3)) &&
      o.colliders.every((c) => c.vertices.every(Number.isFinite)));

  it('every g2 landmark builds: finite, within its triangle budget, with colliders', () => {
    const budget: Record<string, number> = { 'bir-hakeim': 60_000, 'alexandre-iii': 60_000, 'pont-neuf': 60_000, 'pont-des-arts': 60_000, alma: 60_000, flamme: 20_000 };
    for (const [id, max] of Object.entries(budget) as [LandmarkId, number][]) {
      const outs = build(id);
      expect(outs.length, id).toBeGreaterThan(0);
      expect(sane(outs), id).toBe(true);
      expect(tris(outs), id).toBeGreaterThan(200);
      expect(tris(outs), id).toBeLessThanOrEqual(max);
      expect(outs.some((o) => o.colliders.length), id).toBe(true);
    }
  });

  it('lays the arches out on the carved river: Pont Neuf 7 + 5, Pont des Arts 1 run, Bir-Hakeim 2 arms', () => {
    const neuf = recs.get('pont-neuf')!.map(({ rec, ctx }) => site(rec, ctx));
    const long = neuf.map((s) => s.channels.reduce((m, [a, b]) => Math.max(m, b - a), 0)).sort((a, b) => a - b);
    expect(long[0]).toBeLessThan(C.pontNeuf.longArm); // left-bank arm → 5 arches
    expect(long[1]).toBeGreaterThan(C.pontNeuf.longArm); // right-bank arm → 7
    const arts = recs.get('pont-des-arts')!.map(({ rec, ctx }) => site(rec, ctx))[0]!;
    expect(arts.channels.length).toBe(1);
    expect(arts.wR - arts.wL).toBeGreaterThan(9); // 11 m wide (en.wikipedia)
    expect(arts.wR - arts.wL).toBeLessThan(12);
    const bh = recs.get('bir-hakeim')!.map(({ rec, ctx }) => site(rec, ctx))[0]!;
    expect(bh.channels.length).toBe(2); // Île aux Cygnes between
    for (const s of [...neuf, arts, bh]) expect(s.deck(0) - s.level).toBeGreaterThan(5); // deck well above the water
  });

  it('matches the published heights (±5 %)', () => {
    const near = (o: BuildOut, x: number, z: number, r: number, mat?: string) =>
      o.meshes.filter((m) => !mat || m.material === mat).flatMap((m) => [...m.position].filter((_, i) => i % 3 === 1 && Math.hypot(m.position[i - 1]! - x, m.position[i + 1]! - z) < r));
    const within = (v: number, want: number) => expect(Math.abs(v - want) / want).toBeLessThan(0.05);
    // Alexandre III pylons: 17 m (OSM height, en.wikipedia), the gilded group on top
    const pylons = recs.get('alexandre-iii')!.filter(({ rec }) => rec.kind !== 'bridge');
    expect(pylons.length).toBe(4);
    for (const { rec, ctx } of pylons) {
      const o = details['alexandre-iii']!(rec, [], ctx, helpers);
      const stone = ys(o, 'masonry');
      within(Math.max(...stone) - ctx.ground, C.alexandre.pylon);
      const gold = ys(o, 'gold');
      expect(Math.min(...gold) - ctx.ground).toBeCloseTo(C.alexandre.pylon, 0);
      expect(Math.max(...gold) - Math.min(...gold)).toBeGreaterThan(C.alexandre.statueHeight);
    }
    // Flamme: 3.5 m gilded flame (fr.wikipedia) on its pedestal
    const [fl] = build('flamme');
    const gold = ys(fl!, 'gold');
    within(Math.max(...gold) - Math.min(...gold), C.flamme.flame); // torch collar + flame
    // Zouave: 5.2 m, feet a metre above the water on the Alma pier
    const { rec, ctx } = recs.get('alma')![0]!;
    const zp = rec.points!.find((p) => p.kind === 'artwork')!;
    const zy = near(build('alma')[0]!, zp.x, zp.z, 1.2, 'masonry');
    within(Math.max(...zy) - (site(rec, ctx).level + C.alma.zouaveBase), C.alma.zouaveHeight);
  });
});
