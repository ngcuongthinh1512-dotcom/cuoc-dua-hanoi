import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { latLonToWorld, worldToLatLon } from '@race/shared';
import { RoadGraph, type RoadGraphFile, WayFlag, shortestPath } from '@race/shared/graph';
import { describe, expect, it } from 'vitest';
import { playerSetup } from '../client/src/config.ts';
import { type OsmElement, buildGraph } from './build-graph.ts';

// --- fixture: world metres → OSM elements ---
let nid = 1;
const pts = new Map<number, [number, number]>();
const node = (x: number, z: number) => (pts.set(nid, [x, z]), nid++);
const geo = (ids: number[]) => ids.map((i) => {
  const { lat, lon } = worldToLatLon(...pts.get(i)!);
  return { lat, lon };
});
const way = (id: number, tags: Record<string, string>, ids: number[]): OsmElement => ({ type: 'way', id, tags, nodes: ids, geometry: geo(ids) });

const [a, b, c, d, e, f] = [node(0, 0), node(100, 0), node(200, 0), node(100, 100), node(100, -100), node(0, 0.2)];
const mid = [node(50, 0.1), node(150, 5)]; // 0.1 m off the line: simplified away; 5 m: kept
const [t1, t2, s1, s2, x1] = [node(0, 100), node(0, 200), node(200, 100), node(200, 200), node(50, 50)];
const fixture: OsmElement[] = [
  { type: 'node', id: d, tags: { highway: 'traffic_signals' } },
  { type: 'node', id: e, tags: { highway: 'crossing' } },
  { type: 'node', id: 999, lat: worldToLatLon(10, 10).lat, lon: worldToLatLon(10, 10).lon, tags: { amenity: 'bicycle_parking' } },
  way(10, { highway: 'residential', name: 'Rue A', surface: 'sett', lanes: '2' }, [a, mid[0]!, b, mid[1]!, c]),
  way(11, { highway: 'primary', oneway: '-1', width: '12.5' }, [d, b]), // reversed: b → d
  way(12, { highway: 'footway', footway: 'crossing' }, [b, e]),
  way(13, { highway: 'steps' }, [a, t1]),
  way(14, { highway: 'footway', footway: 'sidewalk', bridge: 'yes', layer: '1' }, [c, s1]),
  way(20, { highway: 'service', tunnel: 'yes' }, [t1, t2]),
  way(21, { highway: 'residential', area: 'yes' }, [s1, s2, x1, s1]),
  way(22, { highway: 'corridor' }, [s1, s2]),
  way(23, { highway: 'footway', layer: '-1' }, [s2, t2]),
  way(24, { highway: 'pedestrian', area: 'yes' }, [e, f, x1, e]),
];
const RECT = { minX: -1000, maxX: 1000, minZ: -1000, maxZ: 1000 };

describe('build-graph (fixture)', () => {
  const out = buildGraph(fixture, RECT);
  const g = RoadGraph.decode(out);
  const kind = (k: string) => out.ways.filter((w) => out.kinds[w[0]!] === k);

  it('keeps streets, sidewalks, crossings, steps, bridges, pedestrian-area outlines; drops tunnel / area / corridor / underground', () => {
    expect([...out.kinds].sort()).toEqual(['footway', 'pedestrian', 'primary', 'residential', 'steps']);
    expect(out.ways.length).toBe(6);
    const [res] = kind('residential');
    expect(res!.slice(0, 6)).toEqual([out.kinds.indexOf('residential'), WayFlag.walk | WayFlag.bike | WayFlag.car | WayFlag.pave, 2, 0, 0, 0]);
    expect(res!.length - 6).toBe(4); // a, b, 150/5, c (50/0.1 simplified)
    expect(out.names).toEqual(['Rue A']);
    const [pri] = kind('primary');
    expect(pri![1]! & WayFlag.oneway).toBeTruthy();
    expect(pri![4]).toBe(125);
    expect(g.x[pri![6]!]).toBe(100); // starts at b (oneway=-1 reversed)
    expect(g.z[pri![7]!]).toBe(100);
    const [steps] = kind('steps');
    expect(steps![1]).toBe(WayFlag.walk | WayFlag.steps);
    const fw = kind('footway');
    expect(fw.map((w) => w[1]! & (WayFlag.crossing | WayFlag.sidewalk | WayFlag.bridge))).toEqual([WayFlag.crossing, WayFlag.sidewalk | WayFlag.bridge]);
    expect(fw[1]![5]).toBe(1);
    expect(kind('pedestrian')[0]!.length - 6).toBe(4); // closed ring e, f, x1, e
  });

  it('junctions, crossings, signals, bike parking', () => {
    const at = (n: number) => [g.x[n]! + 0, g.z[n]! + 0]; // + 0: −0 → 0
    expect(out.junctions.map(at)).toEqual([[100, 0]]); // residential through b + primary end (crossing excluded)
    expect(out.crossings.map(at)).toEqual([[100, -100]]);
    expect(out.signals.map(at)).toEqual([[100, 100]]);
    expect(out.bikeParking).toEqual([100, 100]);
  });

  it('is deterministic and clips to the rect', () => {
    const h = (o: RoadGraphFile) => createHash('sha256').update(JSON.stringify(o)).digest('hex');
    expect(h(buildGraph(fixture, RECT))).toBe(h(out));
    const clipped = buildGraph(fixture, { minX: -10, maxX: 160, minZ: -10, maxZ: 10 });
    expect(clipped.ways.length).toBe(1);
    expect(RoadGraph.decode(clipped).nodeCount).toBe(3);
  });
});

// --- the committed file (real OSM data) ---
const FILE = new URL('../shared/data/roadgraph.json', import.meta.url);
const real = RoadGraph.decode(JSON.parse(readFileSync(FILE, 'utf8')) as RoadGraphFile);
const leg = JSON.parse(readFileSync(new URL('../worker/legs/paris-demo.json', import.meta.url), 'utf8')) as {
  steps: { id: string; destination?: { lat: number; lon: number } }[];
};
const L = leg.steps.filter((s) => /^L[1-6]$/.test(s.id) && s.destination).map((s) => ({ id: s.id, ...latLonToWorld(s.destination!.lat, s.destination!.lon) }));
const snap = (x: number, z: number) => real.nearestNode(x, z, 'walk', 80);
const at = (lat: number, lon: number) => {
  const w = latLonToWorld(lat, lon);
  return snap(w.x, w.z);
};
const crow = (p: number, q: number) => Math.hypot(real.x[p]! - real.x[q]!, real.z[p]! - real.z[q]!);
const route = (p: number, q: number) => shortestPath(real, p, q, 'walk');

describe('roadgraph.json (real data)', () => {
  it('size ≤ 25 MB (target ≤ 5 MB), one dominant walk component', () => {
    const mb = statSync(FILE).size / 1024 / 1024;
    expect(mb).toBeLessThan(25);
    if (mb > 6) console.warn(`roadgraph.json ${mb.toFixed(1)} MB > 6 MB`);
    expect(mb).toBeLessThan(5);
    expect(real.component.filter((c) => c === real.main).length / real.nodeCount).toBeGreaterThan(0.95);
  });

  it('L1–L6 and the spawn are all walk-connected, paths ≤ 1.6 × straight line', () => {
    expect(L.length).toBe(6);
    const ns = [...L.map((p) => snap(p.x, p.z)), snap(playerSetup.spawn.x, playerSetup.spawn.z)];
    expect(ns.every((n) => n >= 0)).toBe(true);
    for (let i = 0; i < ns.length; i++) {
      for (let j = i + 1; j < ns.length; j++) {
        const p = route(ns[i]!, ns[j]!);
        expect(p, `${i}→${j}`).not.toBeNull();
        if (crow(ns[i]!, ns[j]!) > 300) expect(p!.length / crow(ns[i]!, ns[j]!), `${i}→${j}`).toBeLessThan(1.6);
      }
    }
  });

  it('A* L1 → L6 under 30 ms; obelisk → Eiffel and Louvre → Notre-Dame cross the Seine on a bridge', () => {
    const [p1, p6] = [snap(L[0]!.x, L[0]!.z), snap(L[5]!.x, L[5]!.z)];
    route(p1, p6); // warm-up (JIT)
    const t0 = performance.now();
    route(p1, p6);
    const ms = performance.now() - t0;
    console.log(`A* L1 → L6: ${ms.toFixed(1)} ms`);
    expect(ms).toBeLessThan(30);
    // Louvre: the Cour Carrée passages are covered (dropped: solid buildings in the world) → out west via the Carrousel
    for (const [from, to, max] of [[at(48.86548, 2.32115), at(48.8583, 2.2945), 1.3], [at(48.8611, 2.3358), at(48.853, 2.3499), 1.9]] as const) {
      const p = route(from, to)!;
      expect(p.length / crow(from, to)).toBeLessThan(max);
      const edges = p.nodes.slice(1).map((n, k) => real.edgesOf(n).find((e) => [real.edgeA[e], real.edgeB[e]].includes(p.nodes[k]!))!);
      expect(edges.some((e) => real.flags(e) & WayFlag.bridge)).toBe(true);
    }
  });

  it('surfaceAt: Place de la Concorde is sett, Rue de Rivoli asphalt; oneway streets bind cars on real data', () => {
    const conc = real.file.names.indexOf('Place de la Concorde'); // sett (OSM surface), the carriageway around the obelisk
    const e = real.edgeWay.findIndex((k) => real.file.ways[k]![3] === conc && real.file.kinds[real.file.ways[k]![0]!] === 'primary');
    const [ca, cb] = [real.edgeA[e]!, real.edgeB[e]!];
    expect(real.surfaceAt((real.x[ca]! + real.x[cb]!) / 2 + 1, (real.z[ca]! + real.z[cb]!) / 2)).toBe('pave');
    const riv = latLonToWorld(48.8637, 2.3318);
    expect(real.surfaceAt(riv.x, riv.z)).toBe('asphalt');
    let checked = 0;
    for (let e = 0; e < real.edgeA.length && checked < 20; e++) {
      if (real.component[real.edgeA[e]!] !== real.main) continue;
      if ((real.flags(e) & (WayFlag.car | WayFlag.oneway)) !== (WayFlag.car | WayFlag.oneway) || real.edgeLength[e]! < 20) continue;
      const [p, q] = [real.edgeA[e]!, real.edgeB[e]!];
      const back = shortestPath(real, q, p, 'car');
      expect(shortestPath(real, p, q, 'car')!.length).toBeLessThanOrEqual(real.edgeLength[e]! + 1e-3);
      if (back) expect(back.length).toBeGreaterThan(real.edgeLength[e]! + 1);
      expect(shortestPath(real, q, p, 'walk')!.length).toBeLessThanOrEqual(real.edgeLength[e]! + 1e-3);
      checked++;
    }
    expect(checked).toBe(20);
  });
});
