// Pure grid / tile math shared by fetch-osm and fetch-dem (tested in geo.test.ts).
import { latLonToWorld, worldToLatLon } from '@race/shared';

export type Bbox = { south: number; west: number; north: number; east: number };
export type Rect = { minX: number; maxX: number; minZ: number; maxZ: number };

const corners = (b: Bbox) =>
  [b.south, b.north].flatMap((lat) => [b.west, b.east].map((lon) => latLonToWorld(lat, lon)));

/** Smallest world rectangle (X east, Z −north) enclosing a lat/lon bbox. */
export function worldRect(b: Bbox): Rect {
  const c = corners(b);
  const xs = c.map((p) => p.x);
  const zs = c.map((p) => p.z);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) };
}

/**
 * size × size m tiles aligned to multiples of `size` from ORIGIN (so 250 m chunks nest in 500 m tiles),
 * covering the bbox. `latLon` = the tile's lat/lon envelope clipped to the bbox (neighbours overlap by
 * a few cm because tile edges are not exactly meridians; no gaps).
 */
export function tileGrid(b: Bbox, size: number) {
  const r = worldRect(b);
  const tiles: { ix: number; iz: number; world: Rect; latLon: Bbox }[] = [];
  for (let iz = Math.floor(r.minZ / size); iz * size < r.maxZ; iz++) {
    for (let ix = Math.floor(r.minX / size); ix * size < r.maxX; ix++) {
      const world = { minX: ix * size, maxX: (ix + 1) * size, minZ: iz * size, maxZ: (iz + 1) * size };
      const c = [world.minZ, world.maxZ].flatMap((z) => [world.minX, world.maxX].map((x) => worldToLatLon(x, z)));
      const latLon = {
        south: Math.max(b.south, Math.min(...c.map((p) => p.lat))),
        west: Math.max(b.west, Math.min(...c.map((p) => p.lon))),
        north: Math.min(b.north, Math.max(...c.map((p) => p.lat))),
        east: Math.min(b.east, Math.max(...c.map((p) => p.lon))),
      };
      if (latLon.south < latLon.north && latLon.west < latLon.east) tiles.push({ ix, iz, world, latLon });
    }
  }
  return tiles;
}

/** Node-registered grid snapped to multiples of `cell`: node (i, j) is at (minX + i·cell, minZ + j·cell). */
export function gridSpec(r: Rect, cell: number) {
  const minX = Math.floor(r.minX / cell) * cell;
  const minZ = Math.floor(r.minZ / cell) * cell;
  return {
    minX,
    minZ,
    width: Math.ceil((r.maxX - minX) / cell) + 1,
    height: Math.ceil((r.maxZ - minZ) / cell) + 1,
  };
}

/** Mapzen/AWS terrarium PNG encoding → metres. */
export const terrarium = (r: number, g: number, b: number) => r * 256 + g + b / 256 - 32768;

/** Global Web Mercator pixel coordinates (256 px tiles) at zoom z; pixel (i, j) covers [i, i+1) × [j, j+1). */
export function lonLatToPixel(lon: number, lat: number, z: number) {
  const n = 256 * 2 ** z;
  const s = Math.sin((lat * Math.PI) / 180);
  return { px: ((lon + 180) / 360) * n, py: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n };
}

/** Bilinear interpolation between pixel centres (i + 0.5, j + 0.5). */
export function bilinear(get: (i: number, j: number) => number, px: number, py: number) {
  const u = px - 0.5;
  const v = py - 0.5;
  const i = Math.floor(u);
  const j = Math.floor(v);
  const fu = u - i;
  const fv = v - j;
  const top = get(i, j) * (1 - fu) + get(i + 1, j) * fu;
  const bottom = get(i, j + 1) * (1 - fu) + get(i + 1, j + 1) * fu;
  return top * (1 - fv) + bottom * fv;
}
