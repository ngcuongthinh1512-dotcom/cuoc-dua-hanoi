// Terrain height grid (docs/plans/phase2.md step 0). DOM-free: parseHeightGrid is pure (tested in Node),
// loadHeightGrid only adds fetch. Y is RELATIVE: y = DEM − DEM(ORIGIN), so the obelisk base is y = 0.
import { latLonToWorld } from '@race/shared';
import { RACE_BBOX, terrain } from '../config.ts';

/** Values at grid nodes (not cell centres): h[row·cols + col] is y at (minX + col·cell, minZ + row·cell); rows run along +Z (south). */
export interface HeightGrid {
  minX: number;
  minZ: number;
  cell: number;
  cols: number;
  rows: number;
  h: Float32Array;
}

/** Bilinear; points outside the grid take the nearest edge value. Needs cols, rows ≥ 2. */
export function heightAt(g: HeightGrid, x: number, z: number): number {
  const u = Math.min(Math.max((x - g.minX) / g.cell, 0), g.cols - 1);
  const v = Math.min(Math.max((z - g.minZ) / g.cell, 0), g.rows - 1);
  const c = Math.min(Math.floor(u), g.cols - 2);
  const r = Math.min(Math.floor(v), g.rows - 2);
  const fu = u - c;
  const fv = v - r;
  const k = r * g.cols + c;
  const h = g.h;
  return (h[k]! * (1 - fu) + h[k + 1]! * fu) * (1 - fv) + (h[k + g.cols]! * (1 - fu) + h[k + g.cols + 1]! * fu) * fv;
}

/** All-zero grid over RACE_BBOX + terrain.margin, nodes on multiples of terrain.cell (so one sits at ORIGIN). */
export function flatHeightGrid(): HeightGrid {
  const b = RACE_BBOX;
  const c = [b.south, b.north].flatMap((lat) => [b.west, b.east].map((lon) => latLonToWorld(lat, lon)));
  const xs = c.map((p) => p.x);
  const zs = c.map((p) => p.z);
  const { cell, margin } = terrain;
  const minX = Math.floor((Math.min(...xs) - margin) / cell) * cell;
  const minZ = Math.floor((Math.min(...zs) - margin) / cell) * cell;
  const cols = Math.ceil((Math.max(...xs) + margin - minX) / cell) + 1;
  const rows = Math.ceil((Math.max(...zs) + margin - minZ) / cell) + 1;
  return { minX, minZ, cell, cols, rows, h: new Float32Array(cols * rows) };
}

/** client/public/data/elevation.json, written by scripts/fetch-dem.ts (only the fields used here). */
export interface ElevationHeader {
  minX: number;
  minZ: number;
  width: number; // nodes along +X
  height: number; // nodes along +Z
  cellSize: number; // m
}

/** elevation.json + elevation.bin (int16 LE decimetres, absolute, row-major along +Z) → world grid, y relative to
 *  DEM(ORIGIN). The DEM covers only RACE_BBOX; the margin beyond it repeats the edge values. */
export function parseHeightGrid(header: ElevationHeader, bin: Uint8Array): HeightGrid {
  const { minX, minZ, width, height, cellSize } = header;
  if (![minX, minZ, width, height, cellSize].every(Number.isFinite) || width < 2 || height < 2 || !(cellSize > 0)) {
    throw new Error(`elevation.json: bad header ${JSON.stringify(header)}`);
  }
  if (bin.byteLength !== width * height * 2) {
    throw new Error(`elevation.bin: ${bin.byteLength} bytes, expected ${width * height * 2}`);
  }
  const view = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);
  const dem: HeightGrid = { minX, minZ, cell: cellSize, cols: width, rows: height, h: new Float32Array(width * height) };
  for (let k = 0; k < dem.h.length; k++) dem.h[k] = view.getInt16(2 * k, true) / 10;

  const g = flatHeightGrid();
  const y0 = heightAt(dem, 0, 0);
  for (let r = 0; r < g.rows; r++) {
    for (let c = 0; c < g.cols; c++) g.h[r * g.cols + c] = heightAt(dem, g.minX + c * g.cell, g.minZ + r * g.cell) - y0;
  }
  return g;
}

/** Fetches `${base}elevation.json` + `elevation.bin` (base e.g. "data/"). Missing or broken files → flat grid and a
 *  console.warn (never console.error: the screenshot run fails on console errors). */
export async function loadHeightGrid(base: string): Promise<HeightGrid> {
  const get = async (name: string) => {
    const res = await fetch(base + name);
    if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
    return res;
  };
  try {
    const [header, bin] = await Promise.all([
      get('elevation.json').then((r) => r.json() as Promise<ElevationHeader>),
      get('elevation.bin').then((r) => r.arrayBuffer()),
    ]);
    return parseHeightGrid(header, new Uint8Array(bin));
  } catch (err) {
    console.warn(`Height grid unavailable, terrain is flat (y = 0): ${String(err)}`);
    return flatHeightGrid();
  }
}
