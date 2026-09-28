// Group g4 on the real chunk data (carved grid, as the worker builds them): no failures / NaN, triangle + draw-call
// budget, top within 5 % of the published (or OSM) figure, the L2 (Trocadéro) and L5 (Orsay) points left open.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { latLonToWorld } from '../../../../shared/src/projection.ts';
import { landmarks as LM } from '../../config.ts';
import { type BuildingRec, type ChunkData, type ChunkIndex, chunkBounds, type LandmarkId, type WaterData } from '../../geo/chunkData.ts';
import { heightAt, parseHeightGrid } from '../../geo/heightGrid.ts';
import type { BuildOut } from '../buildTypes.ts';
import { carveRiver } from '../Terrain.ts';
import { buildLandmarks } from './index.ts';
import { recordGround } from './parts.ts';

const data = join(import.meta.dirname, '../../../public/data');
const has = ['chunks/index.json', 'water.json', 'elevation.json', 'elevation.bin'].every((f) => existsSync(join(data, f)));
const G = LM.g4;

// [expected top (m), triangle budget, reference ground]: the top counts from the record's `ground` (recordGround),
// or from its lowest terrain ('min') where OSM measures from the low side (Orsay, Bourbon: the quay; Chaillot: the
// gardens).
const EXPECT: Partial<Record<LandmarkId, [number, number, ('min' | 'ground')?]>> = {
  invalides: [G.invalides.height, 60_000], // 107 m to the cross
  'grand-palais': [G.grandPalais.dome + G.grandPalais.lantern + G.grandPalais.flagpole, 60_000], // OSM dome 50 m + lantern + flag
  orsay: [G.orsay.height, 60_000, 'min'], // OSM 35 m (clock pavilions)
  'palais-bourbon': [G.bourbon.height, 60_000, 'min'], // OSM pediment 27.4 m (on the low quay side)
  'petit-palais': [G.petitPalais.dome, 60_000],
  chaillot: [G.chaillot.height, 60_000, 'min'], // OSM 30 m
  'palais-de-tokyo': [G.tokyo.height, 20_000],
  'hotel-invalides': [30, 60_000], // OSM part: the north central pavilion (portal arch, rounded roof) 30 m
  rodin: [G.rodin.height, 20_000],
  'ecole-militaire': [G.ecole.domeTop + 2.5, 60_000], // OSM quadrangular dome 22 m + lantern
};

describe.skipIf(!has)('g4 landmarks on the real chunks', () => {
  const out = new Map<LandmarkId, { o: BuildOut; top: number }>();
  let height = (_x: number, _z: number) => 0;
  const chunks = new Map<string, ChunkData>();
  const warn = vi.spyOn(console, 'warn');
  beforeAll(() => {
    const grid = parseHeightGrid(JSON.parse(readFileSync(join(data, 'elevation.json'), 'utf8')), readFileSync(join(data, 'elevation.bin')));
    carveRiver(grid, JSON.parse(readFileSync(join(data, 'water.json'), 'utf8')) as WaterData);
    height = (x, z) => heightAt(grid, x, z);
    const index = JSON.parse(readFileSync(join(data, 'chunks/index.json'), 'utf8')) as ChunkIndex;
    for (const key of index.keys) {
      const chunk = JSON.parse(readFileSync(join(data, `chunks/${key}.json`), 'utf8')) as ChunkData;
      chunks.set(key, chunk);
      for (const rec of chunk.buildings) { // one record at a time (Chaillot pairs its two wings per chunk itself)
        const id = rec.landmark;
        if (!id || !EXPECT[id]) continue;
        const o = buildLandmarks({ ...chunk, buildings: [rec] }, { key, bounds: chunkBounds(key), height });
        const ys = o.meshes.flatMap((m) => [...m.position].filter((_, i) => i % 3 === 1));
        const top = Math.max(...ys) - recordGround(rec.outer, height)[EXPECT[id]![2] === 'min' ? 'minGround' : 'ground'];
        const prev = out.get(id);
        out.set(id, prev ? { o: { meshes: [...prev.o.meshes, ...o.meshes], instances: [], colliders: [...prev.o.colliders, ...o.colliders] }, top: Math.max(prev.top, top) } : { o, top });
      }
    }
  });
  afterAll(() => warn.mockRestore());

  it('every g4 landmark builds through its details (no fallback), finite, within budget', () => {
    expect(warn).not.toHaveBeenCalled();
    for (const [id, [, budget]] of Object.entries(EXPECT) as [LandmarkId, [number, number]][]) {
      if (process.env.G4STATS) console.log(id, out.get(id)?.top.toFixed(1), out.get(id)?.o.meshes.reduce((s, m) => s + m.index.length / 3, 0), out.get(id)?.o.meshes.length);
      const r = out.get(id);
      expect(r, id).toBeDefined();
      const tris = r!.o.meshes.reduce((s, m) => s + m.index.length / 3, 0);
      expect(tris, `${id} triangles`).toBeLessThanOrEqual(budget);
      expect(tris, `${id} triangles`).toBeGreaterThan(200);
      expect(new Set(r!.o.meshes.map((m) => `${m.material}${m.lod ?? ''}`)).size, `${id} materials`).toBeLessThanOrEqual(12);
      for (const m of r!.o.meshes) {
        expect([m.position, m.normal, m.uv, m.color ?? []].every((a) => a.every(Number.isFinite)), `${id} ${m.material} finite`).toBe(true);
        expect(m.index.every((i) => i < m.position.length / 3), `${id} ${m.material} index`).toBe(true);
      }
      expect(r!.o.colliders.length, `${id} colliders`).toBeGreaterThan(0);
      for (const c of r!.o.colliders) expect(c.vertices.every(Number.isFinite), `${id} collider finite`).toBe(true);
    }
  });

  it('tops within 5 % of the published / OSM figures', () => {
    const bad = (Object.entries(EXPECT) as [LandmarkId, [number, number]][])
      .map(([id, [h]]) => [id, out.get(id)!.top, h] as const).filter(([, top, h]) => Math.abs(top - h) / h > 0.05);
    expect(bad.map(([id, top, h]) => `${id}: top ${top.toFixed(1)} m vs ${h} m`)).toEqual([]);
  });

  it('Palais de Tokyo: a building=roof record (the peristyle canopy) is an entablature on pillars, open below', () => {
    const outer = [-1791, 98, -1747, 98, -1747, 135, -1791, 135];
    const rec: BuildingRec = { outer, kind: 'roof', landmark: 'palais-de-tokyo' };
    const o = buildLandmarks({ ...chunks.get('-8_0')!, buildings: [rec] }, { key: '-8_0', bounds: chunkBounds('-8_0'), height });
    const g = recordGround(outer, height).ground;
    const top = Math.max(...o.meshes.flatMap((m) => [...m.position].filter((_, i) => i % 3 === 1)));
    expect(top - g).toBeCloseTo(G.tokyo.colonnadeH + 1.8, 1);
    expect(surfaceAt(o, -1769, 116, height(-1769, 116) + 0.3, g + G.tokyo.colonnadeH - 0.1)).toEqual([]);
    const z = 98 + G.tokyo.pillarSize; // first pillar of the north edge: its collider's foot just under the terrain
    const pillar = (x: number) => surfaceAt(o, x, z, height(x, z) - 1, height(x, z)).length > 0;
    expect(pillar(-1791 + G.tokyo.pillarPitch / 2) || pillar(-1747 - G.tokyo.pillarPitch / 2)).toBe(true);
  });

  it('L2 (Trocadéro Parvis) and L5 (Orsay esplanade) stay open: nothing from 0.3 m to 40 m above the terrain', () => {
    for (const [id, [lat, lon]] of [['chaillot', [48.86215, 2.28843]], ['orsay', [48.86027, 2.32506]]] as const) {
      const { x, z } = latLonToWorld(lat, lon);
      const r = out.get(id)!;
      const y0 = height(x, z);
      const walkTop = Math.max(y0, ...surfaceAt(r.o, x, z, y0 - 2, y0 + 3)); // a paving slab may lift the ground a bit
      expect(walkTop - y0, `${id} walking surface`).toBeLessThan(1.5);
      expect(surfaceAt(r.o, x, z, walkTop + 0.3, y0 + 40), `${id} blocked above`).toEqual([]);
    }
  });
});

/** Heights where the vertical line through (x, z) crosses a mesh or collider triangle between y0 and y1. */
function surfaceAt(o: BuildOut, x: number, z: number, y0: number, y1: number): number[] {
  const hits: number[] = [];
  const sets = [...o.meshes.map((m) => [m.position, m.index] as const), ...o.colliders.map((c) => [c.vertices, c.indices] as const)];
  for (const [v, idx] of sets) {
    for (let k = 0; k < idx.length; k += 3) {
      const [a, b, c] = [idx[k]!, idx[k + 1]!, idx[k + 2]!].map((i) => [v[3 * i]!, v[3 * i + 1]!, v[3 * i + 2]!]) as [number[], number[], number[]];
      const d = (b[0]! - a[0]!) * (c[2]! - a[2]!) - (c[0]! - a[0]!) * (b[2]! - a[2]!);
      if (Math.abs(d) < 1e-9) continue;
      const u = ((x - a[0]!) * (c[2]! - a[2]!) - (c[0]! - a[0]!) * (z - a[2]!)) / d;
      const w = ((b[0]! - a[0]!) * (z - a[2]!) - (x - a[0]!) * (b[2]! - a[2]!)) / d;
      if (u < 0 || w < 0 || u + w > 1) continue;
      const y = a[1]! + u * (b[1]! - a[1]!) + w * (c[1]! - a[1]!);
      if (y >= y0 && y <= y1) hits.push(y);
    }
  }
  return hits;
}
