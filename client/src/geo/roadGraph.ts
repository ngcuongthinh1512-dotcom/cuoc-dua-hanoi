// Track C (docs/plans/phase4.md §6): fetch shared/data/roadgraph.json. `?url` makes Vite emit it as a hashed static asset
// (client/dist), so it never enters the JS bundle nor the worker. Missing / unreadable → console.warn, undefined.
import { RoadGraph, type RoadGraphFile, GRAPH_VERSION, WayFlag } from '@race/shared/graph';
import { BufferGeometry, Float32BufferAttribute, LineBasicMaterial, LineSegments } from 'three';
import url from '@race/shared/data/roadgraph.json?url';

export async function loadRoadGraph(): Promise<RoadGraph | undefined> {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const file = (await res.json()) as RoadGraphFile;
    if (file.v !== GRAPH_VERSION) throw new Error(`version ${file.v} ≠ ${GRAPH_VERSION}`);
    return RoadGraph.decode(file);
  } catch (e) {
    console.warn(`roadgraph.json: ${String(e)}`);
    return undefined;
  }
}

/** Debug lines, 1 draw call, drawn over everything: car blue, walk-only yellow, steps magenta; optional node path in red. */
export function graphLines(g: RoadGraph, h: (x: number, z: number) => number, path?: readonly number[]): LineSegments {
  const pos: number[] = [], col: number[] = [];
  const v = (n: number, lift: number) => pos.push(g.x[n]!, h(g.x[n]!, g.z[n]!) + lift, g.z[n]!);
  for (let e = 0; e < g.edgeA.length; e++) {
    const f = g.flags(e);
    const c = f & WayFlag.steps ? [1, 0, 1] : f & WayFlag.car ? [0.2, 0.5, 1] : [1, 0.85, 0.1];
    v(g.edgeA[e]!, 1), v(g.edgeB[e]!, 1), col.push(...c, ...c);
  }
  for (let k = 0; path && k + 1 < path.length; k++) v(path[k]!, 2), v(path[k + 1]!, 2), col.push(1, 0, 0, 1, 0, 0);
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new Float32BufferAttribute(col, 3));
  const m = new LineSegments(geo, new LineBasicMaterial({ vertexColors: true, depthTest: false }));
  m.renderOrder = 10;
  m.frustumCulled = false;
  return m;
}
