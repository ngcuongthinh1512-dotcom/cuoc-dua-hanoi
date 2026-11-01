// Leg 3 Hà Nội: the race map is exactly the three old districts Hoàn Kiếm / Hai Bà Trưng / Đống Đa (OSM boundary=historic,
// ranh giới trước 1/7/2025), not the bounding rectangle round them. build-chunks and build-graph drop everything whose
// reference point lies outside the union of their outlines (global.json, rings in world metres).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import osmtogeojson from 'osmtogeojson';
import { latLonToWorld } from '@race/shared';
import { PARISHES } from '../client/src/geo/districts.ts';

/** The race districts = the first three PARISHES. */
export const RACE_DISTRICTS = PARISHES.slice(0, 3).map((n) => `Quận ${n}`);

type Ring = number[]; // [x, z, x, z, …]
export type Mask = { rings: { outer: Ring; holes: Ring[]; box: [number, number, number, number] }[]; contains: (x: number, z: number) => boolean };

const inRing = (x: number, z: number, r: Ring) => {
  let inside = false;
  for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
    const [xi, zi, xj, zj] = [r[i]!, r[i + 1]!, r[j]!, r[j + 1]!];
    if (zi > z !== zj > z && x < xi + ((z - zi) / (zj - zi)) * (xj - xi)) inside = !inside;
  }
  return inside;
};

export function loadDistrictMask(cacheDir: string): Mask {
  const global = JSON.parse(readFileSync(join(cacheDir, 'global.json'), 'utf8')) as { elements: { type: string; id: number; tags?: Record<string, string> }[] };
  const wanted = global.elements.filter((e) => e.type === 'relation' && e.tags?.boundary === 'historic' && RACE_DISTRICTS.includes(e.tags.name ?? ''));
  if (wanted.length !== RACE_DISTRICTS.length) throw new Error(`district-mask: found ${wanted.length} of ${RACE_DISTRICTS.length} district relations in global.json`);
  const ring = (c: number[][]): Ring => c.flatMap(([lon, lat]) => {
    const w = latLonToWorld(lat!, lon!);
    return [w.x, w.z];
  });
  const rings: Mask['rings'] = [];
  for (const f of osmtogeojson({ elements: wanted } as never, { flatProperties: false }).features) {
    const g = f.geometry;
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
    for (const [outer, ...holes] of polys) {
      const o = ring(outer as number[][]);
      const xs = o.filter((_, i) => i % 2 === 0), zs = o.filter((_, i) => i % 2 === 1);
      rings.push({ outer: o, holes: holes.map((h) => ring(h as number[][])), box: [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)] });
    }
  }
  if (!rings.length) throw new Error('district-mask: no polygon built from the district relations');
  const contains = (x: number, z: number) => rings.some((r) => x >= r.box[0] && x <= r.box[1] && z >= r.box[2] && z <= r.box[3] && inRing(x, z, r.outer) && !r.holes.some((h) => inRing(x, z, h)));
  return { rings, contains };
}
