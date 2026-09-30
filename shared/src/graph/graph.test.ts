import { describe, expect, it } from 'vitest';
import { RoadGraph } from './RoadGraph.ts';
import { corridorEdges, shortestPath } from './route.ts';
import { GRAPH_VERSION, type RoadGraphFile, WayFlag } from './types.ts';

const W = WayFlag.walk | WayFlag.bike | WayFlag.car;
/** Graph file from world-metre points and ways [flags, ...node indices]. */
function file(pts: [number, number][], ways: [number, ...number[]][], width = 0): RoadGraphFile {
  return {
    v: GRAPH_VERSION, nodes: pts.flatMap(([x, z]) => [x * 10, z * 10]), kinds: ['residential'], names: [],
    ways: ways.map(([f, ...ns]) => [0, f, 0, -1, width, 0, ...ns]), junctions: [], crossings: [], signals: [], bikeParking: [],
  };
}

/** Plain Dijkstra (O(n²)) reference. */
function dijkstra(g: RoadGraph, from: number, to: number, mode: 'walk' | 'car') {
  const d = new Array<number>(g.nodeCount).fill(Infinity);
  const done = new Array<boolean>(g.nodeCount).fill(false);
  d[from] = 0;
  for (;;) {
    let u = -1;
    for (let i = 0; i < g.nodeCount; i++) if (!done[i] && d[i]! < Infinity && (u < 0 || d[i]! < d[u]!)) u = i;
    if (u < 0) return Infinity;
    if (u === to) return d[u]!;
    done[u] = true;
    for (const e of g.edgesOf(u)) {
      const fwd = g.edgeA[e] === u;
      if (!g.allows(e, mode, fwd)) continue;
      const v = fwd ? g.edgeB[e]! : g.edgeA[e]!;
      d[v] = Math.min(d[v]!, d[u]! + g.edgeLength[e]!);
    }
  }
}

describe('RoadGraph + routing', () => {
  it('A* matches Dijkstra on random graphs (walk and car with oneways)', () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let t = 0; t < 20; t++) {
      const pts = Array.from({ length: 40 }, () => [Math.round(rnd() * 5000) / 10, Math.round(rnd() * 5000) / 10] as [number, number]);
      const ways = Array.from({ length: 80 }, () => {
        const a = Math.floor(rnd() * 40), b = Math.floor(rnd() * 40);
        return [W | (rnd() < 0.3 ? WayFlag.oneway : 0), a, b] as [number, number, number];
      }).filter(([, a, b]) => a !== b);
      const g = RoadGraph.decode(file(pts, ways));
      for (let q = 0; q < 10; q++) {
        const a = Math.floor(rnd() * 40), b = Math.floor(rnd() * 40);
        for (const mode of ['walk', 'car'] as const) {
          const ref = dijkstra(g, a, b, mode);
          const p = shortestPath(g, a, b, mode);
          if (ref === Infinity) expect(p).toBeNull();
          else {
            expect(p!.length).toBeCloseTo(ref, 3);
            expect(p!.nodes[0]).toBe(a);
            expect(p!.nodes.at(-1)).toBe(b);
          }
        }
      }
    }
  });

  it('oneway binds cars only; bike skips steps', () => {
    // 0 → 1 oneway street, detour 1 – 2 – 0 two-way; 0 – 3 steps
    const g = RoadGraph.decode(file([[0, 0], [100, 0], [50, 80], [0, 50]], [
      [W | WayFlag.oneway, 0, 1], [W, 1, 2, 0], [WayFlag.walk | WayFlag.steps, 0, 3],
    ]));
    expect(shortestPath(g, 0, 1, 'car')!.nodes).toEqual([0, 1]);
    expect(shortestPath(g, 1, 0, 'car')!.nodes).toEqual([1, 2, 0]);
    expect(shortestPath(g, 1, 0, 'walk')!.nodes).toEqual([1, 0]);
    expect(shortestPath(g, 3, 0, 'walk')!.nodes).toEqual([3, 0]);
    expect(shortestPath(g, 3, 0, 'bike')).toBeNull();
  });

  it('corridor includes a parallel street 60 m away at W = 150, not one 100 m away', () => {
    const g = RoadGraph.decode(file([[0, 0], [300, 0], [0, 60], [300, 60], [0, -100], [300, -100]], [[W, 0, 1], [W, 2, 3], [W, 4, 5]]));
    const p = shortestPath(g, 0, 1, 'walk')!;
    expect(corridorEdges(g, p, 150, 'walk')).toEqual([0, 1]);
    expect(corridorEdges(g, p, 250, 'walk')).toEqual([0, 1, 2]);
  });

  it('nearestNode / nearestEdge / surfaceAt', () => {
    const f = file([[0, 0], [200, 0], [0, 300], [200, 300]], [[W, 0, 1], [W | WayFlag.pave, 2, 3], [WayFlag.walk, 1, 3]], 100);
    const g = RoadGraph.decode(f);
    expect(g.nearestNode(190, 20, 'walk')).toBe(1);
    expect(g.nearestNode(190, 280, 'car')).toBe(3);
    expect(g.nearestNode(1000, 1000, 'walk', 50)).toBe(-1);
    expect(g.nearestNode(-5000, 4000, 'walk')).toBe(2);
    const h = g.nearestEdge(100, 290, 50)!;
    expect(h.edge).toBe(1);
    expect(h.dist).toBeCloseTo(10);
    expect(h.t).toBeCloseTo(0.5);
    expect(g.surfaceAt(100, 4)).toBe('asphalt'); // width 10 m → ±5 m
    expect(g.surfaceAt(100, 296)).toBe('pave');
    expect(g.surfaceAt(100, 150)).toBeNull();
    expect(g.edgesOf(1).slice().sort()).toEqual([0, 2]);
  });

  it('an empty graph answers "nothing"', () => {
    const g = RoadGraph.decode(file([], []));
    expect(g.nearestNode(0, 0, 'walk')).toBe(-1);
    expect(g.nearestEdge(0, 0, 100)).toBeNull();
    expect(g.surfaceAt(0, 0)).toBeNull();
  });
});
