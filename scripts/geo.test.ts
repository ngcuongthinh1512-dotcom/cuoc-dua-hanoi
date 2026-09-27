import { describe, expect, it } from 'vitest';
import { RACE_BBOX, latLonToWorld } from '@race/shared';
import { bilinear, gridSpec, lonLatToPixel, terrarium, tileGrid, worldRect } from './geo.ts';

describe('tileGrid', () => {
  const tiles = tileGrid(RACE_BBOX, 500);

  it('is a full, gap-free world grid over the bbox', () => {
    const r = worldRect(RACE_BBOX);
    const ix = new Set(tiles.map((t) => t.ix));
    const iz = new Set(tiles.map((t) => t.iz));
    expect(tiles.length).toBe(ix.size * iz.size); // every (ix, iz) present once
    expect(Math.min(...ix) * 500).toBeLessThanOrEqual(r.minX);
    expect((Math.max(...ix) + 1) * 500).toBeGreaterThanOrEqual(r.maxX);
    expect(Math.min(...iz) * 500).toBeLessThanOrEqual(r.minZ);
    expect((Math.max(...iz) + 1) * 500).toBeGreaterThanOrEqual(r.maxZ);
    for (const t of tiles) expect(t.world).toEqual({ minX: t.ix * 500, maxX: t.ix * 500 + 500, minZ: t.iz * 500, maxZ: t.iz * 500 + 500 });
  });

  it('query bounds stay inside the bbox and cover every point of it', () => {
    for (const t of tiles) {
      expect(t.latLon.south).toBeGreaterThanOrEqual(RACE_BBOX.south);
      expect(t.latLon.north).toBeLessThanOrEqual(RACE_BBOX.north);
      expect(t.latLon.west).toBeGreaterThanOrEqual(RACE_BBOX.west);
      expect(t.latLon.east).toBeLessThanOrEqual(RACE_BBOX.east);
    }
    const inside = (lat: number, lon: number) =>
      tiles.some((t) => lat >= t.latLon.south && lat <= t.latLon.north && lon >= t.latLon.west && lon <= t.latLon.east);
    const N = 200;
    for (let a = 0; a <= N; a++) {
      for (let b = 0; b <= N; b++) {
        const lat = RACE_BBOX.south + ((RACE_BBOX.north - RACE_BBOX.south) * a) / N;
        const lon = RACE_BBOX.west + ((RACE_BBOX.east - RACE_BBOX.west) * b) / N;
        expect(inside(lat, lon)).toBe(true);
      }
    }
  });

  it('puts each point in the tile its world coordinates fall in', () => {
    const p = latLonToWorld(48.8584, 2.2945); // Eiffel
    const t = tiles.find((t) => t.ix === Math.floor(p.x / 500) && t.iz === Math.floor(p.z / 500))!;
    expect(48.8584).toBeGreaterThan(t.latLon.south);
    expect(48.8584).toBeLessThan(t.latLon.north);
    expect(2.2945).toBeGreaterThan(t.latLon.west);
    expect(2.2945).toBeLessThan(t.latLon.east);
  });
});

describe('DEM helpers', () => {
  it('decodes terrarium RGB', () => {
    expect(terrarium(128, 0, 0)).toBe(0);
    expect(terrarium(128, 34, 128)).toBe(34.5);
    expect(terrarium(127, 255, 0)).toBe(-1);
  });

  it('maps lon/lat to Web Mercator pixels', () => {
    expect(lonLatToPixel(0, 0, 0)).toEqual({ px: 128, py: 128 });
    expect(lonLatToPixel(-180, 85.0511287798, 1).py).toBeCloseTo(0, 3);
    // OSM wiki slippy-map formula: y = (1 − ln(tan φ + sec φ) / π) / 2 · 2^z
    const phi = (48.86548 * Math.PI) / 180;
    const y = ((1 - Math.log(Math.tan(phi) + 1 / Math.cos(phi)) / Math.PI) / 2) * 2 ** 14;
    const concorde = lonLatToPixel(2.32115, 48.86548, 14);
    expect(concorde.py / 256).toBeCloseTo(y, 9);
    expect([Math.floor(concorde.px / 256), Math.floor(concorde.py / 256)]).toEqual([8297, 5635]);
  });

  it('interpolates between pixel centres', () => {
    const get = (i: number, j: number) => 2 * i + 3 * j;
    expect(bilinear(get, 10.5, 20.5)).toBe(get(10, 20)); // exactly on a centre
    expect(bilinear(get, 11.25, 7.9)).toBeCloseTo(2 * 10.75 + 3 * 7.4); // linear field is reproduced
  });

  it('grid nodes snap to the cell and cover the rect', () => {
    const r = { minX: -12.3, maxX: 40.1, minZ: 3.2, maxZ: 17 };
    const g = gridSpec(r, 5);
    expect(g).toEqual({ minX: -15, minZ: 0, width: 13, height: 5 });
    expect(g.minX + (g.width - 1) * 5).toBeGreaterThanOrEqual(r.maxX);
    expect(g.minZ + (g.height - 1) * 5).toBeGreaterThanOrEqual(r.maxZ);
  });
});
