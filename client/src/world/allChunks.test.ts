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
const MAX_TRIANGLES = 64_000; // mesh triangles per chunk (instanced props not counted); Leg 3: the densest Old Quarter chunk (0_-2) sits at ≈ 60k with plot caps + parapets
// Chunks holding a landmark (phase2b-assets.md §5): its materials (masonry, metal, gold, glass…) and LOD 'near' buckets.
const MAX_BUCKETS_LANDMARK = 28;
const MAX_TRIANGLES_LANDMARK = 250_000;
// Leg 2 (Macao): the long sea bridges (Sai Van, Ponte da Amizade, the Zhuhai viaducts) put 60–111k triangles into 7 of 323 chunks
// (slab + railing + deck of a 1–2 km span, 4–14 bridge pieces each, same bucket count): their own budget (docs/reports/leg2-tests-workspaces.md).
// Note: the selector (≥ BRIDGE_PIECES pieces) gives that 120k budget to 56 of the 323 chunks, not only those 7 (in-town chunks with
// a few flyovers too, e.g. 1_1, 2_1, 3_-4); limits unchanged (docs/reports/leg2-fixes.md item 4).
const BRIDGE_PIECES = 4;
const MAX_TRIANGLES_BRIDGES = 120_000;

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
      // Phase 8C street furniture: per-instance LOD, nothing drawn beyond ≤ 400 m, so not a per-chunk draw call everywhere.
      // Leg 2 night lanterns / shop signs / aviation lights: no draw call by day (invisible material), ≤ 3 at night.
      const buckets = out.meshes.length + out.instances.filter((s) => !['bench', 'cafe', 'shelter', 'bouquiniste', 'lantern', 'shopSign', 'aviation'].includes(s.kind)).length;
      const triangles = out.meshes.reduce((s, b) => s + b.index.length / 3, 0);
      const lm = chunk.buildings.some((b) => b.landmark);
      if (buckets > (lm ? MAX_BUCKETS_LANDMARK : MAX_BUCKETS)) problems.push(`${key}: ${buckets} draw buckets`);
      const cap = lm ? MAX_TRIANGLES_LANDMARK : chunk.bridges.length >= BRIDGE_PIECES ? MAX_TRIANGLES_BRIDGES : MAX_TRIANGLES;
      if (triangles > cap) problems.push(`${key}: ${triangles} triangles`);
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
