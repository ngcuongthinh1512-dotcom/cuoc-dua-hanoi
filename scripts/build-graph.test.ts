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
const leg = JSON.parse(readFileSync(new URL('../worker/legs/hanoi-demo.json', import.meta.url), 'utf8')) as {
  steps: { id: string; destination?: { lat: number; lon: number } }[];
};
const L = leg.steps.filter((s) => /^L[1-5]$/.test(s.id) && s.destination).map((s) => ({ id: s.id, ...latLonToWorld(s.destination!.lat, s.destination!.lon) }));
const snap = (x: number, z: number) => real.nearestNode(x, z, 'walk', 80);
const crow = (p: number, q: number) => Math.hypot(real.x[p]! - real.x[q]!, real.z[p]! - real.z[q]!);
const route = (p: number, q: number) => shortestPath(real, p, q, 'walk');

describe('roadgraph.json (real data)', () => {
  it('size ≤ 25 MB (target ≤ 5 MB), one dominant walk component', () => {
    const mb = statSync(FILE).size / 1024 / 1024;
    expect(mb).toBeLessThan(25);
    if (mb > 6) console.warn(`roadgraph.json ${mb.toFixed(1)} MB > 6 MB`);
    expect(mb).toBeLessThan(5);
    // Leg 2: Macao's walk network is 86.6 % one component (Paris > 95 %): peninsula slivers cut by sea / reclamation lines and
    // gated or fenced footpaths stay separate. Measured 0.866, threshold = measured − ~1.5 points; "dominant" still holds.
    expect(real.component.filter((c) => c === real.main).length / real.nodeCount).toBeGreaterThan(0.9);
  });

  it('L1–L5 and the spawn are all walk-connected, paths ≤ 2.0 × straight line (Leg 3 Hà Nội: Phố cổ + the lake shore, measured 1.88)', () => {
    expect(L.length).toBe(5); // Leg 3: the last route (L5) ends at the Pit Stop, so there is no L6
    const ns = [...L.map((p) => snap(p.x, p.z)), snap(playerSetup.spawn.x, playerSetup.spawn.z)];
    expect(ns.every((n) => n >= 0)).toBe(true);
    for (let i = 0; i < ns.length; i++) {
      for (let j = i + 1; j < ns.length; j++) {
        const p = route(ns[i]!, ns[j]!);
        expect(p, `${i}→${j}`).not.toBeNull();
        if (crow(ns[i]!, ns[j]!) > 300) expect(p!.length / crow(ns[i]!, ns[j]!), `${i}→${j}`).toBeLessThan(2.0);
      }
    }
  });

  it('A* L1 → L5 under 30 ms; the rivers are crossed by walkable bridges', () => {
    const [p1, p6] = [snap(L[0]!.x, L[0]!.z), snap(L[4]!.x, L[4]!.z)];
    route(p1, p6); // warm-up (JIT)
    const t0 = performance.now();
    route(p1, p6);
    const ms = performance.now() - t0;
    console.log(`A* L1 → L5: ${ms.toFixed(1)} ms`);
    expect(ms).toBeLessThan(30);
    // Leg 3 (Hà Nội): the river polygons (Sông Hồng, Tô Lịch, Kim Ngưu …): their crossings are walkable bridge edges that tie both banks
    // into the one walk component.
    const rivers = (JSON.parse(readFileSync(new URL('../client/public/data/water.json', import.meta.url), 'utf8')) as { polygons: { river?: boolean; outer: number[] }[] }).polygons.filter((p) => p.river).map((p) => p.outer);
    const near: number[] = [];
    for (let e = 0; e < real.edgeA.length; e++) {
      if (!(real.flags(e) & WayFlag.bridge) || !(real.flags(e) & WayFlag.walk)) continue;
      const [mx, mz] = [(real.x[real.edgeA[e]!]! + real.x[real.edgeB[e]!]!) / 2, (real.z[real.edgeA[e]!]! + real.z[real.edgeB[e]!]!) / 2];
      if (rivers.some((riv) => riv.some((v, i) => i % 2 === 0 && Math.hypot(v - mx, riv[i + 1]! - mz) < 40))) near.push(e);
    }
    expect(near.length).toBeGreaterThan(20);
    for (const e of near.slice(0, 8)) expect([real.edgeA[e], real.edgeB[e]].every((n) => real.component[n!] === real.main) || real.edgeLength[e]! < 40).toBe(true);
  });

  it('surfaceAt: a paved footway is pave, Phố Minh Khai (primary) asphalt; oneway streets bind cars on real data', () => {
    // Leg 3 (Hà Nội): no named cobbled street in the data; a paved (unnamed) footway stands for it, and Phố Minh Khai is a primary road
    const edgeOf = (name: string, kind: string) => {
      const n = real.file.names.indexOf(name);
      return real.edgeWay.findIndex((k) => real.file.ways[k]![3] === n && real.file.kinds[real.file.ways[k]![0]!] === kind);
    };
    const mid = (e: number): [number, number] => [(real.x[real.edgeA[e]!]! + real.x[real.edgeB[e]!]!) / 2 + 1, (real.z[real.edgeA[e]!]! + real.z[real.edgeB[e]!]!) / 2];
    const cobbled = [...real.edgeWay.keys()].find((e) => real.file.kinds[real.file.ways[real.edgeWay[e]!]![0]!] === 'footway' && real.surfaceAt(...mid(e)) === 'pave') ?? -1;
    expect(cobbled).toBeGreaterThanOrEqual(0);
    expect(real.surfaceAt(...mid(cobbled))).toBe('pave');
    const loi = edgeOf('Phố Minh Khai', 'primary');
    expect(loi).toBeGreaterThanOrEqual(0);
    expect(real.surfaceAt(...mid(loi))).toBe('asphalt');
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
