// Every builder over EVERY real chunk (client/public/data), exactly as the worker runs them (world/chunkBuild.ts),
// on the carved grid. Skipped when the map data is missing.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ChunkData, ChunkIndex, WaterData } from '../geo/chunkData.ts';
import { parseHeightGrid } from '../geo/heightGrid.ts';
import { buildChunk } from './chunkBuild.ts';
import { carveRiver } from './Terrain.ts';

const data = join(import.meta.dirname, '../../public/data');
const has = ['chunks/index.json', 'water.json', 'elevation.json', 'elevation.bin'].every((f) => existsSync(join(data, f)));
const MAX_BUCKETS = 16; // draw calls per chunk (docs/plans/phase2.md performance budget)
const MAX_TRIANGLES = 60_000; // mesh triangles per chunk (instanced props not counted)

describe.skipIf(!has)('all real chunks', () => {
  it('build without errors, NaN or budget overruns', () => {
    const grid = parseHeightGrid(JSON.parse(readFileSync(join(data, 'elevation.json'), 'utf8')), readFileSync(join(data, 'elevation.bin')));
    carveRiver(grid, JSON.parse(readFileSync(join(data, 'water.json'), 'utf8')) as WaterData);
    const index = JSON.parse(readFileSync(join(data, 'chunks/index.json'), 'utf8')) as ChunkIndex;
    const problems: string[] = [];
    const finite = (a: Float32Array | undefined) => !a || a.every(Number.isFinite);
    for (const key of index.keys) {
      const chunk = JSON.parse(readFileSync(join(data, `chunks/${key}.json`), 'utf8')) as ChunkData;
      const out = buildChunk(chunk, grid, (builder, k, err) => problems.push(`${k} ${builder}: ${String(err)}`));
      const buckets = out.meshes.length + out.instances.length;
      const triangles = out.meshes.reduce((s, b) => s + b.index.length / 3, 0);
      if (buckets > MAX_BUCKETS) problems.push(`${key}: ${buckets} draw buckets`);
      if (triangles > MAX_TRIANGLES) problems.push(`${key}: ${triangles} triangles`);
      for (const b of out.meshes) {
        if (![b.position, b.normal, b.uv, b.color].every(finite)) problems.push(`${key} ${b.material}: NaN/Infinity`);
        if (b.index.some((i) => i >= b.position.length / 3)) problems.push(`${key} ${b.material}: index out of range`);
      }
      for (const s of out.instances) if (!finite(s.matrices)) problems.push(`${key} ${s.kind}: NaN matrix`);
      for (const c of out.colliders) if (!finite(c.vertices)) problems.push(`${key}: NaN collider`);
    }
    expect(problems).toEqual([]);
  }, 300_000);
});
