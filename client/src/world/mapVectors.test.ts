// Phase 5 track A: minimap layers on real chunks (client/public/data), skipped when the data is missing.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { type ChunkData, chunkBounds } from '../geo/chunkData.ts';
import type { BuildCtx } from './buildTypes.ts';
import { BRIDGE, mapBuffers, mapVectors, RoadClass, roadClass } from './mapVectors.ts';

const dir = join(import.meta.dirname, '../../public/data/chunks');
const load = (key: string) => JSON.parse(readFileSync(join(dir, `${key}.json`), 'utf8')) as ChunkData;
const ctx = (key: string): BuildCtx => ({ key, bounds: chunkBounds(key), height: () => 0 });

describe('roadClass', () => {
  it('sorts OSM kinds into draw classes', () => {
    expect(['primary', 'tertiary', 'residential', 'service', 'pedestrian', 'footway', 'cycleway', 'steps', 'living_street'].map(roadClass)).toEqual([
      RoadClass.major, RoadClass.major, RoadClass.minor, RoadClass.service, RoadClass.pedestrian, RoadClass.foot, RoadClass.foot,
      RoadClass.steps, RoadClass.minor,
    ]);
  });
});

// Leg 1 (Paris): 0_0 = Concorde (spawn), 10_0 = densest chunk, -1_0 = Pont de la Concorde. Leg 3: the same keys are just three real
// Hà Nội chunks (0_0 the origin square's, 10_0 east of the Red River bank, -1_0 just west of it); bridge chunks below.
describe.skipIf(!existsSync(join(dir, '10_0.json')))('mapVectors (real chunks)', () => {
  for (const key of ['0_0', '10_0', '-1_0']) {
    it(`${key}: every building ring, positive widths, own buffers, ≤ 1 ms`, () => {
      const chunk = load(key);
      let ms = Infinity;
      for (let i = 0; i < 5; i++) {
        const t0 = performance.now();
        mapVectors(chunk, ctx(key));
        ms = Math.min(ms, performance.now() - t0); // best of 5: the worker runs it hot
      }
      const m = mapVectors(chunk, ctx(key));
      console.log(`mapVectors ${key}: ${ms.toFixed(3)} ms, ${m.buildings.start.length - 1} building rings, ${m.roads.kind.length} roads`);
      expect(ms).toBeLessThan(1);
      const kept = chunk.buildings.filter((b) => !['bridge', 'fountain', 'artwork'].includes(b.kind));
      expect(m.buildings.start.length - 1).toBe(kept.reduce((s, b) => s + 1 + (b.holes?.length ?? 0), 0));
      expect(m.buildings.pts.length).toBe(2 * m.buildings.start.at(-1)!);
      expect(m.areas.kind.length).toBe(m.areas.start.length - 1);
      expect(m.roads.kind.length).toBe(m.roads.start.length - 1);
      expect(m.roads.width.length).toBe(m.roads.kind.length);
      expect(m.roads.width.every((w) => w > 0)).toBe(true);
      const buffers = mapBuffers(m);
      expect(new Set(buffers).size).toBe(buffers.length); // no two views on one buffer (transfer would detach it twice)
      expect(buffers.length).toBe(9);
    });
  }

  it('keeps road bridge decks, drops the rail viaducts', () => {
    const m = mapVectors(load('-3_15'), ctx('-3_15'));
    const decks = [...m.roads.kind].filter((k) => k & BRIDGE);
    expect(decks.length).toBe(8); // Leg 3 Hà Nội: -3_15 = the Vành đai 2 flyover (4 trunk + 4 trunk_link decks; Brussels: 0_1 two tertiary decks + three footways, Leg 2: the Viaduto de S. Francisco, Leg 1: Pont de la Concorde)
    expect(decks.some((k) => (k & 7) === RoadClass.major)).toBe(true);
    // -3_-3: 2 rail pieces (the Hanoi–Long Biên railway, layer 1) and nothing else on a deck (Brussels: 2_-5 with 22 viaduct pieces, Leg 2: -1_-11, Leg 1: -11_4, Line 6)
    expect([...mapVectors(load('-3_-3'), ctx('-3_-3')).roads.kind].filter((k) => k & BRIDGE)).toEqual([]);
  });
});
