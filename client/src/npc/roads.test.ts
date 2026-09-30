import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GRAPH_VERSION, RoadGraph, type RoadGraphFile, WayFlag } from '@race/shared/graph';
import { describe, expect, it } from 'vitest';
import { traffic } from '../config.ts';
import type { ChunkData } from '../geo/chunkData.ts';
import { roadWidth, sidewalkWidth } from '../world/RoadBuilder.ts';
import { NpcRoads } from './roads.ts';

const CAR = WayFlag.walk | WayFlag.bike | WayFlag.car;
const ONE = CAR | WayFlag.oneway;

describe('NpcRoads (fixture)', () => {
  // 0-1-2-3 two-way residential square; 3→4 oneway dead end; 1-5 service; roundabout 2→6→7→2 (12 lanes, Étoile name);
  // 1-8 two-way primary, 6 lanes. Crossings at 8 (kept), 5 (service), 4 (dead end).
  const pts = [[0, 0], [100, 0], [100, 100], [0, 100], [-50, 100], [100, -50], [120, 140], [140, 100], [200, 0]];
  const file: RoadGraphFile = {
    v: GRAPH_VERSION, nodes: pts.flatMap(([x, z]) => [x! * 10, z! * 10]), kinds: ['residential', 'service', 'primary'],
    names: ['Place Charles de Gaulle'],
    ways: [
      [0, CAR, 0, -1, 0, 0, 0, 1, 2, 3, 0],
      [0, ONE, 0, -1, 0, 0, 3, 4],
      [1, CAR, 0, -1, 0, 0, 1, 5],
      [2, ONE | WayFlag.roundabout, 12, 0, 0, 0, 2, 6, 7, 2],
      [2, CAR, 6, -1, 0, 0, 1, 8],
    ],
    junctions: [], crossings: [4, 5, 8], signals: [], bikeParking: [],
  };
  const g = RoadGraph.decode(file);
  const r = new NpcRoads(g, (x, z) => x + 2 * z);
  const wayCar = (k: number) => g.edgeWay.filter((w, e) => w === k && r.car[e]).length;

  it('keeps the strongly connected NPC network: no dead-end oneway, no service', () => {
    expect([0, 1, 2, 3, 4].map(wayCar)).toEqual([4, 0, 0, 3, 1]);
    expect([...r.crossing.keys()].filter((n) => r.crossing[n])).toEqual([8]);
  });

  it('widths = RoadBuilder, lanes per direction, lane offsets from the kerb', () => {
    expect(r.halfWidth(0)).toBe(3.5); // residential 7 m
    expect(r.sidewalk(0)).toBe(3.5);
    expect(r.sidewalk(2)).toBe(0); // service
    expect([r.lanes(0, true), r.lanes(0, false)]).toEqual([1, 1]);
    expect(r.laneOffset(0, false, 0)).toBe(1.75);
    expect(r.halfWidth(3)).toBe(18); // widthByName on a roundabout
    expect([r.lanes(3, true), r.lanes(3, false)]).toEqual([traffic.maxLanes, 0]);
    expect([0, 3, 9].map((l) => r.laneOffset(3, true, l))).toEqual([13.5, -13.5, -13.5]);
    expect([r.lanes(4, true), r.lanes(4, false)]).toEqual([3, 3]); // 6 lanes two-way
    expect(r.laneOffset(4, true, 0)).toBeCloseTo(9.75 - 9.75 / 6, 6);
    expect(r.lanes(1, false)).toBe(0);
  });

  it('heightOn follows the edge from edgeA', () => {
    expect(r.heightOn(0, 25)).toBe(25); // (0,0) → (100,0)
    expect(r.heightOn(1, 40)).toBe(180); // (100,0) → (100,100)
  });
});

const root = join(import.meta.dirname, '../../..');
const graphFile = join(root, 'shared/data/roadgraph.json');
const chunkDir = join(root, 'client/public/data/chunks');
describe.skipIf(!existsSync(graphFile) || !existsSync(chunkDir))('NpcRoads (roadgraph.json)', () => {
  const g = RoadGraph.decode(JSON.parse(readFileSync(graphFile, 'utf8')) as RoadGraphFile);
  const t0 = performance.now();
  const r = new NpcRoads(g, () => 0);
  console.log(`NpcRoads: ${(performance.now() - t0).toFixed(0)} ms`);
  const npcEdges = [...r.car.keys()].filter((e) => r.car[e]);

  it('largest strongly connected car network without service (≈ 10,921 nodes, 304.5 km, phase4b.md §2.1)', () => {
    const nodes = new Set(npcEdges.flatMap((e) => [g.edgeA[e]!, g.edgeB[e]!]));
    const km = npcEdges.reduce((s, e) => s + g.edgeLength[e]!, 0) / 1000;
    expect(nodes.size).toBeGreaterThan(10_500);
    expect(km).toBeGreaterThan(295);
    expect(km).toBeLessThan(315);
    expect(npcEdges.every((e) => traffic.kinds.includes(r.kind(g.edgeWay[e]!)))).toBe(true);
    // strongly connected: every node is reached from the first one, forward and backward
    for (const forward of [true, false]) {
      const start = g.edgeA[npcEdges[0]!]!;
      const seen = new Set([start]);
      const stack = [start];
      while (stack.length) {
        const u = stack.pop()!;
        for (const e of g.edgesOf(u)) {
          if (!r.car[e]) continue;
          const v = g.edgeA[e] === u ? g.edgeB[e]! : g.edgeA[e]!;
          if (!seen.has(v) && g.allows(e, 'car', (g.edgeA[e] === u) === forward)) seen.add(v), stack.push(v);
        }
      }
      expect(seen.size).toBe(nodes.size);
    }
  });

  it('widths and sidewalks = RoadBuilder on the drawn roads (Étoile, Champs-Élysées oneway half, residential)', () => {
    const edgeAt = new Map<string, number>();
    const key = (ax: number, az: number, bx: number, bz: number) => [ax, az, bx, bz].map((v) => v.toFixed(1)).join();
    for (let e = 0; e < g.edgeA.length; e++) if (g.flags(e) & WayFlag.car) edgeAt.set(key(g.x[g.edgeA[e]!]!, g.z[g.edgeA[e]!]!, g.x[g.edgeB[e]!]!, g.z[g.edgeB[e]!]!), e);
    const seen = { etoile: 0, champsHalf: 0, residential: 0, all: 0 };
    for (const k of ['-1_-1', '-8_-4']) {
      for (const rec of (JSON.parse(readFileSync(join(chunkDir, `${k}.json`), 'utf8')) as ChunkData).roads) {
        let e: number | undefined;
        for (let i = 0; e === undefined && i + 3 < rec.pts.length; i += 2) e = edgeAt.get(key(rec.pts[i]!, rec.pts[i + 1]!, rec.pts[i + 2]!, rec.pts[i + 3]!));
        if (e === undefined) continue;
        const w = g.edgeWay[e]!;
        expect(2 * r.halfWidth(w), `${rec.name} ${rec.kind}`).toBeCloseTo(roadWidth(rec), 1);
        expect(r.sidewalk(w), `${rec.name} ${rec.kind}`).toBe(sidewalkWidth(rec));
        seen.all++;
        if (rec.name === 'Place Charles de Gaulle') seen.etoile++, expect(2 * r.halfWidth(w)).toBe(36);
        if (rec.name === 'Avenue des Champs-Élysées' && rec.oneway) seen.champsHalf++, expect(2 * r.halfWidth(w)).toBe(13);
        if (rec.kind === 'residential') seen.residential++;
      }
    }
    console.log('RoadBuilder widths matched:', seen);
    expect(Math.min(seen.etoile, seen.champsHalf, seen.residential)).toBeGreaterThan(0);
  });

  it('Étoile: NPC ring, 4 lanes one way, anticlockwise from above, ≥ 10 entries and exits', () => {
    const name = g.file.names.indexOf('Place Charles de Gaulle');
    const ring = [...g.edgeWay.keys()].filter((e) => g.file.ways[g.edgeWay[e]!]![3] === name);
    expect(ring.length).toBe(35);
    expect(ring.every((e) => r.car[e] && g.flags(e) & WayFlag.roundabout)).toBe(true);
    const w = g.edgeWay[ring[0]!]!;
    expect([r.lanes(w, true), r.lanes(w, false), r.halfWidth(w)]).toEqual([4, 0, 18]);
    // shoelace in (east, north) = (x, −z): > 0 = anticlockwise seen from above (French rule)
    const area = ring.reduce((s, e) => s - (g.x[g.edgeA[e]!]! * g.z[g.edgeB[e]!]! - g.x[g.edgeB[e]!]! * g.z[g.edgeA[e]!]!) / 2, 0);
    expect(area).toBeGreaterThan(14_000);
    const onRing = new Set(ring.flatMap((e) => [g.edgeA[e]!, g.edgeB[e]!]));
    let entries = 0, exits = 0;
    for (const n of onRing) {
      for (const e of g.edgesOf(n)) {
        if (ring.includes(e) || !r.car[e]) continue;
        const away = g.edgeA[e] === n; // travelling edgeA → edgeB leaves the ring
        if (g.allows(e, 'car', !away)) entries++;
        if (g.allows(e, 'car', away)) exits++;
      }
    }
    expect(Math.min(entries, exits)).toBeGreaterThanOrEqual(10);
  });

  it('crossings on the NPC network (zebras, yielding, pedestrians)', () => {
    const kept = g.file.crossings.filter((c) => r.crossing[c]);
    expect(kept.length).toBeGreaterThan(4000);
    expect(kept.filter((c) => Math.hypot(g.x[c]!, g.z[c]!) < 120).length).toBeGreaterThanOrEqual(10); // around the obelisk
    expect(r.crossing.reduce((s, c) => s + c, 0)).toBe(kept.length);
  });
});
