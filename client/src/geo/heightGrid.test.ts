import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { latLonToWorld, RACE_BBOX } from '@race/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { terrain } from '../config.ts';
import { flatHeightGrid, type HeightGrid, heightAt, loadHeightGrid, parseHeightGrid } from './heightGrid.ts';

// Synthetic DEM: the plane 30 m + 0.01·x − 0.02·z on a coarse 50 m grid covering the whole bbox (Leg 3: bbox ≈ 4.5 × 3.3 km, well inside the grid).
function planeDem() {
  const header = { minX: -3000, minZ: -4000, width: 131, height: 161, cellSize: 50 };
  const view = new DataView(new ArrayBuffer(header.width * header.height * 2));
  for (let j = 0; j < header.height; j++) {
    for (let i = 0; i < header.width; i++) {
      const y = 30 + 0.01 * (header.minX + i * 50) - 0.02 * (header.minZ + j * 50);
      view.setInt16((j * header.width + i) * 2, Math.round(y * 10), true);
    }
  }
  return { header, bin: new Uint8Array(view.buffer) };
}

describe('heightGrid', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('heightAt is bilinear inside and clamps outside', () => {
    const g: HeightGrid = { minX: 0, minZ: 0, cell: 10, cols: 3, rows: 2, h: Float32Array.of(0, 10, 20, 10, 20, 30) };
    expect(heightAt(g, 5, 0)).toBeCloseTo(5);
    expect(heightAt(g, 5, 5)).toBeCloseTo(10);
    expect(heightAt(g, 20, 10)).toBeCloseTo(30); // last node exactly
    expect(heightAt(g, -50, -50)).toBe(0);
    expect(heightAt(g, 500, 500)).toBe(30);
    expect(heightAt(g, 15, -99)).toBeCloseTo(15);
  });

  it('flat grid: 5 m nodes over bbox + margin, one node at ORIGIN', () => {
    const g = flatHeightGrid();
    expect(g.cell).toBe(terrain.cell);
    expect(Math.abs(g.minX % g.cell)).toBe(0);
    expect(Math.abs(g.minZ % g.cell)).toBe(0);
    const sw = latLonToWorld(RACE_BBOX.south, RACE_BBOX.west);
    const ne = latLonToWorld(RACE_BBOX.north, RACE_BBOX.east);
    expect(g.minX).toBeLessThanOrEqual(sw.x - terrain.margin);
    expect(g.minZ).toBeLessThanOrEqual(ne.z - terrain.margin);
    expect(g.minX + (g.cols - 1) * g.cell).toBeGreaterThanOrEqual(ne.x + terrain.margin);
    expect(g.minZ + (g.rows - 1) * g.cell).toBeGreaterThanOrEqual(sw.z + terrain.margin);
    expect(g.h.length).toBe(g.cols * g.rows);
    expect(g.h.every((v) => v === 0)).toBe(true);
  });

  it('parse resamples to the world grid with y relative to ORIGIN', () => {
    const { header, bin } = planeDem();
    const g = parseHeightGrid(header, bin);
    expect(g.cell).toBe(terrain.cell);
    expect(heightAt(g, 0, 0)).toBe(0);
    for (const [x, z] of [[1234, -567], [-1000, 1500], [2.5, 7.5]] as const) {
      expect(heightAt(g, x, z)).toBeCloseTo(0.01 * x - 0.02 * z, 1); // dm quantisation
    }
  });

  it('parse rejects a truncated bin or a bad header', () => {
    const { header, bin } = planeDem();
    expect(() => parseHeightGrid(header, bin.subarray(2))).toThrow(/expected/);
    expect(() => parseHeightGrid({ ...header, width: Number.NaN }, bin)).toThrow(/bad header/);
  });

  it('load falls back to a flat grid with a warning when the files are missing', async () => {
    vi.stubGlobal('fetch', async () => new Response('nope', { status: 404 }));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const g = await loadHeightGrid('data/');
    expect(warn).toHaveBeenCalledOnce();
    expect(g.h.every((v) => v === 0)).toBe(true);
  });

  const dir = join(import.meta.dirname, '../../public/data');
  it.skipIf(!existsSync(join(dir, 'elevation.bin')))('real DEM (Hà Nội, flat by design): origin y = 0, Hồ Thiền Quang / Gò Đống Đa / the Red River bank are 0 too', () => {
    const g = parseHeightGrid(JSON.parse(readFileSync(join(dir, 'elevation.json'), 'utf8')), readFileSync(join(dir, 'elevation.bin')));
    const at = (lat: number, lon: number) => {
      const p = latLonToWorld(lat, lon);
      return heightAt(g, p.x, p.z);
    };
    expect(at(21.03218, 105.85213)).toBeCloseTo(0, 5);
    expect(at(21.0187, 105.8436)).toBeCloseTo(0, 5); // Hồ Thiền Quang
    expect(at(21.012, 105.8273)).toBeCloseTo(0, 5); // Gò Đống Đa
    expect(at(21.0417, 105.8553)).toBeCloseTo(0, 5); // the Red River bank (the river itself is carved by the terrain builder, not the DEM)
    expect(g.h.every((v) => v === 0)).toBe(true); // Leg 3 Hà Nội: fetch-dem --flat
    expect(g.h.every(Number.isFinite)).toBe(true);
  });
});
