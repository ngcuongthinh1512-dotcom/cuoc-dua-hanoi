// Phase 5 track A: tile LRU + raster budget (Node has no canvas: OffscreenCanvas / Path2D are no-op fakes).
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { minimap } from '../config.ts';
import { chunkBounds } from '../geo/chunkData.ts';
import { emptyChunk } from '../world/chunkBuild.ts';
import { mapVectors } from '../world/mapVectors.ts';
import { MapTiles, neighbourhood, tileBox } from './MapTiles.ts';

const noop = () => {};
const ctx = new Proxy({}, { get: () => noop, set: () => true });
class FakeCanvas {
  constructor(
    public width: number,
    public height: number,
  ) {}
  getContext() {
    return ctx;
  }
}
class FakePath {
  moveTo = noop;
  lineTo = noop;
  closePath = noop;
}
beforeAll(() => void (vi.stubGlobal('OffscreenCanvas', FakeCanvas), vi.stubGlobal('Path2D', FakePath)));
afterAll(() => void vi.unstubAllGlobals());

const layers = (key: string) => mapVectors(emptyChunk(key), { key, bounds: chunkBounds(key), height: () => 0 });
/** n keys far apart (no two neighbours), all with layers. */
function tilesWith(n: number) {
  const t = new MapTiles(undefined);
  const keys = Array.from({ length: n }, (_, i) => `${3 * i}_0`);
  for (const k of keys) t.add(k, layers(k));
  return { t, keys };
}

describe('MapTiles', () => {
  it('covers its chunk + tilePad, 3 × 3 neighbourhood', () => {
    expect(tileBox('0_-1')).toEqual([-minimap.tilePad, -250 - minimap.tilePad, 250 + minimap.tilePad, minimap.tilePad]);
    expect(neighbourhood('0_0')).toHaveLength(9);
    expect(neighbourhood('0_0')).toContain('-1_1');
  });

  it('rasterises at most rasterPerFrame tiles per frame, none without layers', () => {
    const { t, keys } = tilesWith(5);
    t.frame();
    expect(t.tile('99_99')).toBeUndefined(); // no layers: costs no budget
    const got = keys.map((k) => t.tile(k)).filter(Boolean);
    expect(got).toHaveLength(minimap.rasterPerFrame);
    expect(t.stats.rasters).toBe(minimap.rasterPerFrame);
    t.frame();
    expect(t.tile(keys[0]!)).toBeDefined(); // held: free
    expect(keys.slice(1).map((k) => t.tile(k)).filter(Boolean)).toHaveLength(minimap.rasterPerFrame);
  });

  it('keeps maxTiles, dropping the least recently used', () => {
    const n = minimap.maxTiles;
    const { t, keys } = tilesWith(n + 2);
    for (const k of keys.slice(0, n)) t.frame(), t.tile(k);
    expect(t.stats.tiles).toBe(n);
    t.tile(keys[0]!); // touched: now the most recent (no frame(): held tiles need no budget)
    t.frame();
    t.tile(keys[n]!); // one over: evicts keys[1], the oldest untouched
    expect(t.stats.tiles).toBe(n);
    expect(t.tile(keys[0]!)).toBeDefined();
    expect(t.tile(keys[1]!)).toBeUndefined(); // gone, and no budget left this frame
    t.frame();
    t.tile(keys[n + 1]!);
    expect(t.stats.tiles).toBe(n);
    expect(t.tile(keys[2]!)).toBeUndefined();
  });

  it('draws a tile again when a neighbour brings its layers, not when a chunk streams in twice', () => {
    const t = new MapTiles(undefined);
    t.add('0_0', layers('0_0'));
    t.frame();
    expect(t.tile('0_0')).toBeDefined();
    t.add('0_0', layers('0_0'));
    expect(t.tile('0_0')).toBeDefined(); // same data: kept
    t.add('1_1', layers('1_1')); // its pieces may reach into 0_0's tile
    expect(t.tile('0_0')).toBeUndefined();
    t.frame();
    expect(t.tile('0_0')).toBeDefined();
    expect(t.stats.rasters).toBe(2);
  });
});
