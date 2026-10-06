// Leg 2 (docs/reports/leg2-fixes.md item 3): no landmark collider may bar a public route. Every OSM street / footway /
// pedestrian way / steps of the real chunks is sampled every 2 m on the carved terrain; a sample is BLOCKED when a body
// standing there (feet + 0.4 … 2 m) is inside a landmark's solid collider (odd number of collider surfaces above the
// knees) or the 2 m stretch to the next sample crosses a collider wall at hip height. Stair ramps (`stairs`) are walkable:
// the feet stand on them where they are above the terrain. Pure geometry over buildLandmarks; skipped when the map data is missing.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { type ChunkData, type ChunkIndex, chunkBounds, type WaterData } from '../../geo/chunkData.ts';
import { heightAt, parseHeightGrid } from '../../geo/heightGrid.ts';
import { carveRiver } from '../Terrain.ts';
import { buildLandmarks } from './index.ts';

const data = join(import.meta.dirname, '../../../public/data');
const has = ['chunks/index.json', 'water.json', 'elevation.json', 'elevation.bin'].every((f) => existsSync(join(data, f)));
const CELL = 8;
const [KNEE, HIP] = [0.4, 1.0];

/** Samples left blocked on purpose, `landmark: kind name (inside|wall)` → the most samples allowed (docs/reports/leg2-fixes.md
 *  item 3 lists them). A new finding or a higher count fails. */
const ALLOWED: Record<string, number> = {
  // the built terrace / platform top IS the walking surface there (the DEM is blurred flat): reached by the gate steps
  // (Monte NE gate) / the great stair + side flights (Ruínas) / the front stair at the temple door (A-Ma)
  'fortaleza-monte: footway (inside)': 394,
  'ruinas-sao-paulo: footway (inside)': 48,
  'ruinas-sao-paulo: footway 耶穌會紀念廣場 Largo da Companhia de Jesus (inside)': 7,
  'ruinas-sao-paulo: steps (inside)': 9,
  'templo-ama: footway (inside)': 1,
  // the way is mapped through the OSM building outline (driveway / passage under a podium, indoor court): solid on purpose
  'macau-tower: footway (inside)': 4,
  'macau-tower: service (inside)': 43,
  'bank-of-china: service (inside)': 1,
  'hotel-lisboa: footway (inside)': 20,
  'wynn-macau: service (inside)': 36,
  'wynn-macau: service (wall)': 2,
  'fisherman-wharf: service (inside)': 36,
  'sands-macau: residential 蒙地卡羅前地 Largo de Monte Carlo (inside)': 7,
  'sands-macau: footway (inside)': 3,
  'sands-macau: service (inside)': 1,
  'science-center: footway (inside)': 16,
  'casa-mandarim: footway (wall)': 2, // through the house's courts (solid in the game)
  'jardim-lou-lim-ioc: footway (inside)': 2, // through the garden hall
  // edge cases left (≤ 2 m of a wide way, or the border post at the map's north edge)
  'jardim-lou-lim-ioc: tertiary 羅利老馬路 Estrada de Adolfo Loureiro (wall)': 2,
  'portas-do-cerco: service (inside)': 26,
  'portas-do-cerco: secondary (inside)': 2,
  'portas-do-cerco: footway (inside)': 16,
};

type Tri = Float64Array; // ax ay az bx by bz cx cy cz
interface Hit { id: string; tris: Tri[] }

export function landmarkBlocks() {
  const grid = parseHeightGrid(JSON.parse(readFileSync(join(data, 'elevation.json'), 'utf8')), readFileSync(join(data, 'elevation.bin')));
  carveRiver(grid, JSON.parse(readFileSync(join(data, 'water.json'), 'utf8')) as WaterData);
  const h = (x: number, z: number) => heightAt(grid, x, z);
  const index = JSON.parse(readFileSync(join(data, 'chunks/index.json'), 'utf8')) as ChunkIndex;
  const chunks = index.keys.map((k) => JSON.parse(readFileSync(join(data, `chunks/${k}.json`), 'utf8')) as ChunkData);
  // landmark collider triangles (no stair ramps) in an XZ hash, per landmark id
  const hash = new Map<string, Hit[]>();
  for (const c of chunks) {
    for (const rec of c.buildings) {
      if (!rec.landmark) continue;
      const out = buildLandmarks({ ...c, buildings: [rec] }, { key: c.key, bounds: chunkBounds(c.key), height: h, district: () => 0 });
      for (const m of out.colliders) {
        const v = m.vertices;
        for (let k = 0; k < m.indices.length; k += 3) {
          const t = new Float64Array(9);
          for (let q = 0; q < 3; q++) for (let a = 0; a < 3; a++) t[q * 3 + a] = v[m.indices[k + q]! * 3 + a]!;
          const [x0, x1] = [Math.min(t[0]!, t[3]!, t[6]!), Math.max(t[0]!, t[3]!, t[6]!)];
          const [z0, z1] = [Math.min(t[2]!, t[5]!, t[8]!), Math.max(t[2]!, t[5]!, t[8]!)];
          for (let i = Math.floor(x0 / CELL); i <= Math.floor(x1 / CELL); i++) {
            for (let j = Math.floor(z0 / CELL); j <= Math.floor(z1 / CELL); j++) {
              const key = `${i}_${j}`;
              const list = hash.get(key) ?? [];
              const id = m.stairs ? `${rec.landmark}|stairs` : rec.landmark;
              let e = list.find((x) => x.id === id);
              if (!e) list.push((e = { id, tris: [] }));
              e.tris.push(t);
              hash.set(key, list);
            }
          }
        }
      }
    }
  }
  const cell = (x: number, z: number) => hash.get(`${Math.floor(x / CELL)}_${Math.floor(z / CELL)}`) ?? [];
  const near = (x: number, z: number) => cell(x, z).filter((e) => !e.id.endsWith('|stairs'));
  /** y of triangle t over (x, z), null when outside its XZ projection or vertical. */
  const yOn = (t: Tri, x: number, z: number) => {
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = t;
    const d = (bz! - cz!) * (ax! - cx!) + (cx! - bx!) * (az! - cz!);
    if (Math.abs(d) < 1e-9) return null;
    const l1 = ((bz! - cz!) * (x - cx!) + (cx! - bx!) * (z - cz!)) / d;
    const l2 = ((cz! - az!) * (x - cx!) + (ax! - cx!) * (z - cz!)) / d;
    const l3 = 1 - l1 - l2;
    return l1 < 0 || l2 < 0 || l3 < 0 ? null : l1 * ay! + l2 * by! + l3 * cy!;
  };
  /** Feet height: the terrain, or a landmark's stair ramp above it (the body walks on the ramp). */
  const ground = (x: number, z: number) => {
    let g = h(x, z);
    for (const e of cell(x, z)) if (e.id.endsWith('|stairs')) for (const t of e.tris) g = Math.max(g, yOn(t, x, z) ?? g);
    return g;
  };
  /** Landmark whose solid holds (x, y, z): odd count of distinct collider heights above y on the vertical. */
  const inside = (x: number, y: number, z: number) => {
    for (const e of near(x, z)) {
      const ys = new Set<number>();
      for (const t of e.tris) {
        const ty = yOn(t, x, z);
        if (ty !== null && ty > y) ys.add(Math.round(ty * 100));
      }
      if (ys.size % 2) return e.id;
    }
    return null;
  };
  /** Landmark whose collider the segment p → q crosses (Möller–Trumbore). */
  const crosses = (p: number[], q: number[]) => {
    const dir = [q[0]! - p[0]!, q[1]! - p[1]!, q[2]! - p[2]!];
    for (const e of near((p[0]! + q[0]!) / 2, (p[2]! + q[2]!) / 2)) {
      for (const t of e.tris) {
        const e1 = [t[3]! - t[0]!, t[4]! - t[1]!, t[5]! - t[2]!];
        const e2 = [t[6]! - t[0]!, t[7]! - t[1]!, t[8]! - t[2]!];
        const pv = [dir[1]! * e2[2]! - dir[2]! * e2[1]!, dir[2]! * e2[0]! - dir[0]! * e2[2]!, dir[0]! * e2[1]! - dir[1]! * e2[0]!];
        const det = e1[0]! * pv[0]! + e1[1]! * pv[1]! + e1[2]! * pv[2]!;
        if (Math.abs(det) < 1e-9) continue;
        const tv = [p[0]! - t[0]!, p[1]! - t[1]!, p[2]! - t[2]!];
        const u = (tv[0]! * pv[0]! + tv[1]! * pv[1]! + tv[2]! * pv[2]!) / det;
        if (u < 0 || u > 1) continue;
        const qv = [tv[1]! * e1[2]! - tv[2]! * e1[1]!, tv[2]! * e1[0]! - tv[0]! * e1[2]!, tv[0]! * e1[1]! - tv[1]! * e1[0]!];
        const w = (dir[0]! * qv[0]! + dir[1]! * qv[1]! + dir[2]! * qv[2]!) / det;
        if (w < 0 || u + w > 1) continue;
        const s = (e2[0]! * qv[0]! + e2[1]! * qv[1]! + e2[2]! * qv[2]!) / det;
        if (s >= 0 && s <= 1) return e.id;
      }
    }
    return null;
  };
  // every way, 2 m apart
  const blocked = new Map<string, { n: number; at: [number, number]; all: string[] }>();
  const add = (k: string, x: number, z: number) => {
    const b = blocked.get(k) ?? { n: 0, at: [Math.round(x), Math.round(z)] as [number, number], all: [] };
    b.n++;
    b.all.push(`${Math.round(x)},${Math.round(z)}`);
    blocked.set(k, b);
  };
  const ways = chunks.flatMap((c) => [...c.roads.map((r) => ({ pts: r.pts, kind: r.kind, name: r.name ?? '' })), ...(c.stairs ?? []).map((s) => ({ pts: s.pts, kind: 'steps', name: '' }))]);
  for (const w of ways) {
    let prev: number[] | null = null;
    for (let i = 0; i + 3 < w.pts.length; i += 2) {
      const [ax, az, bx, bz] = [w.pts[i]!, w.pts[i + 1]!, w.pts[i + 2]!, w.pts[i + 3]!];
      const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 2));
      for (let s = i === 0 ? 0 : 1; s <= n; s++) {
        const [x, z] = [ax + ((bx - ax) * s) / n, az + ((bz - az) * s) / n];
        if (!cell(x, z).length) {
          prev = null;
          continue;
        }
        const g = ground(x, z);
        const p = [x, g + HIP, z];
        const ins = inside(x, g + KNEE, z);
        const wall = ins || w.kind === 'steps' || !prev ? null : crosses(prev, p);
        if (ins) add(`${ins}: ${`${w.kind} ${w.name}`.trim()} (inside)`, x, z);
        else if (wall) add(`${wall}: ${`${w.kind} ${w.name}`.trim()} (wall)`, x, z);
        prev = ins ? null : p; // leaving a solid is not a second finding
      }
    }
  }
  return blocked;
}

describe.skipIf(!has)('landmark colliders vs public ways (real chunks)', () => {
  it('no OSM street / footway / steps sample is inside or walled off by a landmark collider', () => {
    const all = landmarkBlocks();
    if (process.env.PATHS_DUMP) for (const [k, b] of all) console.log(k, b.all.join(' '));
    const over = [...all].filter(([k, b]) => b.n > (ALLOWED[k] ?? 0)).map(([k, b]) => `${k} ×${b.n} at ${b.at.join(', ')}`);
    expect(over).toEqual([]);
  }, 300_000);
});
