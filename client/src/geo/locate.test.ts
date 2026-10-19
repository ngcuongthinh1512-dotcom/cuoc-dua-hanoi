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

  // Leg 3: Brussels street names are "<French> - <Dutch>" (OSM name), as the graph carries them
  const WETSTRAAT = 'Rue de la Loi - Wetstraat';
  const GRASMARKT = 'Rue du Marché aux Herbes - Grasmarkt';
  const CARMES = 'Rue des Grands Carmes - Lievevrouwbroersstraat';
  const CHARBON = 'Rue du Marché au Charbon - Kolenmarkt';
  const WARANDE = 'Rue Montagne du Parc - Warandeberg';

  it('names the street under the feet', () => {
    expect(latLon(50.84438, 4.37435)).toBe(WETSTRAAT); // mid-carriageway
    expect(street(68.8, -49.7)).toBe(GRASMARKT); // a node of the pavé street north of the Grand-Place
    expect(street(-1185.8, -347.4)).toBe('Chaussée de Ninove - Ninoofsesteenweg'); // on the bridge deck over the canal
    expect(street(601.6, 126.1)).toBe(WARANDE); // the stairs up to the Parc de Bruxelles
  });

  it('a pavement takes the name of its street', () => {
    const [x, z] = [543.1, 286.2]; // a footway=sidewalk edge (no name of its own) 8 m beside the Rue Baron Horta carriageway
    const hit = g.nearestEdge(x, z, 2)!;
    expect(hit && g.flags(hit.edge) & WayFlag.sidewalk).toBeTruthy();
    const car = g.edgesNear(x, z, 20).filter((e) => g.flags(e) & WayFlag.car);
    expect(car.every((e) => segPoint(x, z, g.x[g.edgeA[e]!]!, g.z[g.edgeA[e]!]!, g.x[g.edgeB[e]!]!, g.z[g.edgeB[e]!]!)[1] > 5)).toBe(true); // not on a carriageway
    expect(street(x, z)).toBe('Rue Baron Horta - Baron Hortastraat');
  });

  it('no name in the middle of the canal, away from the bridges', () => {
    const [x, z] = [-395.7, -1400]; // the Bruxelles–Charleroi canal, north-west corner (a river: true polygon)
    expect(water.polygons.some((p) => p.river && inRing(x, z, p.outer))).toBe(true);
    expect(g.nearestEdge(x, z, cfg.maxDistance)).toBeNull();
    expect(street(x, z)).toBeUndefined();
    expect(street(-20000, 20000)).toBeUndefined(); // outside the map
  });

  it('a street that crosses keeps the old name for 10 m, takes the new one at 40 m', () => {
    // Rue des Grands Carmes runs into the Rue du Marché au Charbon at (−307.1, 120.4): walk down it, turn, 1 m per lookup
    const central = way(CARMES, [-248.9, 159.7], [-307.1, 120.4]);
    const paiva = way(CHARBON, [-307.1, 120.4], [-252.4, 38.8]);
    const samples: [number, number][] = [];
    const walk = (line: number[]) => {
      for (let i = 2; i < line.length; i += 2) {
        const [ax, az, bx, bz] = [line[i - 2]!, line[i - 1]!, line[i]!, line[i + 1]!];
        const l = Math.hypot(bx - ax, bz - az);
        for (let s = 0; s < l; s++) samples.push([ax + ((bx - ax) * s) / l, az + ((bz - az) * s) / l]);
      }
    };
    walk(central);
    const turn = samples.length; // first sample on the Travessa do Paiva
    walk(paiva);
    const loc = new StreetLocator(g);
    const names = samples.map(([x, z]) => loc.at(x, z));
    expect(names[0]).toBe(CARMES);
    expect(names.slice(0, turn).every((n) => n === CARMES)).toBe(true);
    expect(names[turn + 10]).toBe(CARMES);
    expect(names[turn + 40]).toBe(CHARBON);
    expect(names.slice(turn + 40).every((n) => n === CHARBON)).toBe(true);
    // the name changes once per street (no flicker at the junction): Rue des Grands Carmes → Rue du Marché au Charbon
    expect(names.filter((n, i) => i && n !== names[i - 1]).length).toBe(1);
  });

  it('looks up again only after locate.recheck m (time printed: ≤ 0.1 ms per lookup)', () => {
    const loc = new StreetLocator(g);
    expect(loc.at(601.6, 126.1)).toBe(WARANDE);
    expect(loc.at(601.6 + cfg.recheck / 2, 126.1)).toBe(WARANDE); // cached
    const pts: [number, number][] = [];
    for (let i = 0; i < 4000; i++) pts.push([(i % 80) * 12 - 500, Math.floor(i / 80) * 12 - 400]); // > recheck apart, the dense streets around the Grand-Place
    for (const [x, z] of pts) loc.at(x, z);
    const t0 = performance.now();
    for (const [x, z] of pts) loc.at(x, z);
    const ms = (performance.now() - t0) / pts.length;
    console.log(`[locate] at(): ${(ms * 1000).toFixed(1)} µs per lookup (${pts.length} points, dense centre)`);
    expect(ms).toBeLessThanOrEqual(0.1);
  });
});
