// Phase 5 track B: street names on the real shared/data/roadgraph.json + water.json (skipped when the data is missing).
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { latLonToWorld } from '@race/shared';
import { RoadGraph, type RoadGraphFile, WayFlag, segPoint } from '@race/shared/graph';
import { describe, expect, it } from 'vitest';
import { locate as cfg } from '../config.ts';
import type { WaterData } from './chunkData.ts';
import { inRing } from './districts.ts';
import { StreetLocator } from './locate.ts';

const root = join(import.meta.dirname, '../../..');
const graphFile = join(root, 'shared/data/roadgraph.json');
const waterFile = join(root, 'client/public/data/water.json');

describe.skipIf(!existsSync(graphFile) || !existsSync(waterFile))('StreetLocator (roadgraph.json)', () => {
  const file = JSON.parse(readFileSync(graphFile, 'utf8')) as RoadGraphFile;
  const water = JSON.parse(readFileSync(waterFile, 'utf8')) as WaterData;
  const g = RoadGraph.decode(file);
  const street = (x: number, z: number) => new StreetLocator(g).at(x, z);
  const latLon = (lat: number, lon: number) => {
    const p = latLonToWorld(lat, lon);
    return street(p.x, p.z);
  };
  /** Nodes of the way of this name running from ≈ (x0, z0) to ≈ (x1, z1), as x, z pairs. */
  const way = (name: string, [x0, z0]: [number, number], [x1, z1]: [number, number]) => {
    const n = file.names.indexOf(name);
    const w = file.ways.find((r) => r[3] === n && Math.hypot(g.x[r[6]!]! - x0, g.z[r[6]!]! - z0) < 2 && Math.hypot(g.x[r.at(-1)!]! - x1, g.z[r.at(-1)!]! - z1) < 2);
    if (!w) throw new Error(`${name} way not found`);
    return w.slice(6).flatMap((v) => [g.x[v]!, g.z[v]!]);
  };

  // Leg 3 Hà Nội: street names as the graph carries them (OSM name, Vietnamese)
  const CAUGO = 'Phố Cầu Gỗ';
  const HAIBATRUNG = 'Phố Hai Bà Trưng';
  const NGUYEN_THUONG_HIEN = 'Phố Nguyễn Thượng Hiền';
  const TRAN_BINH_TRONG = 'Phố Trần Bình Trọng';
  const STEPS = 'Ngõ 301 Hồng Hà';

  it('names the street under the feet', () => {
    expect(latLon(21.03218, 105.85213)).toBe(CAUGO); // the origin (Đông Kinh Nghĩa Thục square)
    expect(latLon(21.0245, 105.8523)).toBe(HAIBATRUNG); // mid-carriageway
    expect(street(200.8, -1032.8)).toBe('Cầu Long Biên'); // on the bridge deck over the Red River
    expect(street(16.95, -705.45)).toBe(STEPS); // the steps down towards the river bank
  });

  it('a pavement takes the name of its street', () => {
    const [x, z] = [-1893.3, 2661.3]; // a footway=sidewalk edge (no name of its own) beside the Phố Lương Định Của carriageway
    const hit = g.nearestEdge(x, z, 2)!;
    expect(hit && g.flags(hit.edge) & WayFlag.sidewalk).toBeTruthy();
    const car = g.edgesNear(x, z, 20).filter((e) => g.flags(e) & WayFlag.car);
    expect(car.every((e) => segPoint(x, z, g.x[g.edgeA[e]!]!, g.z[g.edgeA[e]!]!, g.x[g.edgeB[e]!]!, g.z[g.edgeB[e]!]!)[1] > 5)).toBe(true); // not on a carriageway
    expect(street(x, z)).toBe('Phố Lương Định Của');
  });

  it('no name in the middle of the Red River, away from the bridges', () => {
    const [x, z] = [324.5, -1050]; // the Sông Hồng (a river: true polygon), 125 m from the Long Biên bridge deck
    expect(water.polygons.some((p) => p.river && inRing(x, z, p.outer))).toBe(true);
    expect(g.nearestEdge(x, z, cfg.maxDistance)).toBeNull();
    expect(street(x, z)).toBeUndefined();
    expect(street(-20000, 20000)).toBeUndefined(); // outside the map
  });

  it('a street that crosses keeps the old name for 10 m, takes the new one at 40 m', () => {
    // Phố Nguyễn Thượng Hiền runs into Phố Trần Bình Trọng at (−842.7, 1473): walk down it, turn, 1 m per lookup
    const central = way(NGUYEN_THUONG_HIEN, [-1034.7, 1475.1], [-842.7, 1473]);
    const paiva = way(TRAN_BINH_TRONG, [-842.7, 1473], [-883.2, 1634.1]);
    const samples: [number, number][] = [];
    const walk = (line: number[]) => {
      for (let i = 2; i < line.length; i += 2) {
        const [ax, az, bx, bz] = [line[i - 2]!, line[i - 1]!, line[i]!, line[i + 1]!];
        const l = Math.hypot(bx - ax, bz - az);
        for (let s = 0; s < l; s++) samples.push([ax + ((bx - ax) * s) / l, az + ((bz - az) * s) / l]);
      }
    };
    walk(central);
    const turn = samples.length; // first sample on the second street
    walk(paiva);
    const loc = new StreetLocator(g);
    const names = samples.map(([x, z]) => loc.at(x, z));
    expect(names[0]).toBe(NGUYEN_THUONG_HIEN);
    expect(names.slice(0, turn).every((n) => n === NGUYEN_THUONG_HIEN)).toBe(true);
    expect(names[turn + 10]).toBe(NGUYEN_THUONG_HIEN);
    expect(names[turn + 40]).toBe(TRAN_BINH_TRONG);
    expect(names.slice(turn + 40).every((n) => n === TRAN_BINH_TRONG)).toBe(true);
    // the name changes once per street (no flicker at the junction)
    expect(names.filter((n, i) => i && n !== names[i - 1]).length).toBe(1);
  });

  it('looks up again only after locate.recheck m (time printed: ≤ 0.1 ms per lookup)', () => {
    const loc = new StreetLocator(g);
    expect(loc.at(16.95, -705.45)).toBe(STEPS);
    expect(loc.at(16.95 + cfg.recheck / 2, -705.45)).toBe(STEPS); // cached
    const pts: [number, number][] = [];
    for (let i = 0; i < 4000; i++) pts.push([(i % 80) * 12 - 500, Math.floor(i / 80) * 12 - 400]); // > recheck apart, the old quarter around the origin
    for (const [x, z] of pts) loc.at(x, z);
    const t0 = performance.now();
    for (const [x, z] of pts) loc.at(x, z);
    const ms = (performance.now() - t0) / pts.length;
    console.log(`[locate] at(): ${(ms * 1000).toFixed(1)} µs per lookup (${pts.length} points, dense centre)`);
    expect(ms).toBeLessThanOrEqual(0.1);
  });
});
