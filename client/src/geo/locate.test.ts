// Phase 5 track B: street names on the real shared/data/roadgraph.json + water.json (skipped when the data is missing).
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { latLonToWorld } from '@race/shared';
import { RoadGraph, type RoadGraphFile, WayFlag, segPoint } from '@race/shared/graph';
import { describe, expect, it } from 'vitest';
import { locate as cfg, playerSetup } from '../config.ts';
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

  it('names the street under the feet', () => {
    expect(street(playerSetup.spawn.x, playerSetup.spawn.z)).toBe('Place de la Concorde'); // the spawn, 14 m from the obelisk
    expect(latLon(48.8698, 2.3076)).toBe('Avenue des Champs-Élysées'); // mid-carriageway
    expect(latLon(48.86365, 2.31354)).toBe('Pont Alexandre III'); // mid-deck
    expect(street(87.8, -184.5)).toBe('Rue Royale'); // the p5-hud start
  });

  it('a pavement takes the name of its street', () => {
    const [x, z] = [100.95, -186]; // middle of a footway=sidewalk edge beside the Rue Royale carriageway
    const hit = g.nearestEdge(x, z, 2)!;
    expect(hit && g.flags(hit.edge) & WayFlag.sidewalk).toBeTruthy();
    const car = g.edgesNear(x, z, 20).filter((e) => g.flags(e) & WayFlag.car);
    expect(car.every((e) => segPoint(x, z, g.x[g.edgeA[e]!]!, g.z[g.edgeA[e]!]!, g.x[g.edgeB[e]!]!, g.z[g.edgeB[e]!]!)[1] > 5)).toBe(true); // not on a carriageway
    expect(street(x, z)).toBe('Rue Royale');
  });

  it('no name in the middle of the Seine, away from the bridges', () => {
    const [x, z] = [-200, 200];
    expect(water.polygons.some((p) => p.river && inRing(x, z, p.outer))).toBe(true);
    expect(g.nearestEdge(x, z, cfg.maxDistance)).toBeNull();
    expect(street(x, z)).toBeUndefined();
    expect(street(-20000, 20000)).toBeUndefined(); // outside the map
  });

  it('a street that crosses keeps the old name for 10 m, takes the new one at 40 m', () => {
    // Rue Royale (north) runs into the Rue Saint-Honoré at (155, −323): walk down it, turn east, 1 m per lookup
    const royale = way('Rue Royale', [61, -132], [155, -323]);
    const honore = way('Rue Saint-Honoré', [155, -323], [252, -274]);
    const samples: [number, number][] = [];
    const walk = (line: number[]) => {
      for (let i = 2; i < line.length; i += 2) {
        const [ax, az, bx, bz] = [line[i - 2]!, line[i - 1]!, line[i]!, line[i + 1]!];
        const l = Math.hypot(bx - ax, bz - az);
        for (let s = 0; s < l; s++) samples.push([ax + ((bx - ax) * s) / l, az + ((bz - az) * s) / l]);
      }
    };
    walk(royale);
    const turn = samples.length; // first sample on the Saint-Honoré
    walk(honore);
    const loc = new StreetLocator(g);
    const names = samples.map(([x, z]) => loc.at(x, z));
    const onRoyale = names.indexOf('Rue Royale'); // the walk starts in the Place de la Concorde: its name holds for 35 m
    expect(names[0]).toBe('Place de la Concorde');
    expect(onRoyale).toBeGreaterThan(0);
    expect(onRoyale).toBeLessThan(turn - 60);
    expect(names.slice(onRoyale, turn).every((n) => n === 'Rue Royale')).toBe(true);
    expect(names[turn + 10]).toBe('Rue Royale');
    expect(names[turn + 40]).toBe('Rue Saint-Honoré');
    expect(names.slice(turn + 40).every((n) => n === 'Rue Saint-Honoré')).toBe(true);
    // the name changes once per street (no flicker at the junctions): Place de la Concorde → Rue Royale → Rue Saint-Honoré
    expect(names.filter((n, i) => i && n !== names[i - 1]).length).toBe(2);
  });

  it('looks up again only after locate.recheck m (time printed: ≤ 0.1 ms per lookup)', () => {
    const loc = new StreetLocator(g);
    expect(loc.at(87.8, -184.5)).toBe('Rue Royale');
    expect(loc.at(87.8 + cfg.recheck / 2, -184.5)).toBe('Rue Royale'); // cached
    const pts: [number, number][] = [];
    for (let i = 0; i < 4000; i++) pts.push([(i % 80) * 12 + 800, Math.floor(i / 80) * 12 + 200]); // > recheck apart, dense streets of the 1er–4e
    for (const [x, z] of pts) loc.at(x, z);
    const t0 = performance.now();
    for (const [x, z] of pts) loc.at(x, z);
    const ms = (performance.now() - t0) / pts.length;
    console.log(`[locate] at(): ${(ms * 1000).toFixed(1)} µs per lookup (${pts.length} points, dense centre)`);
    expect(ms).toBeLessThanOrEqual(0.1);
  });
});
