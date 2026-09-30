// Track C (docs/plans/phase4.md §6): fetch shared/data/roadgraph.json. `?url` makes Vite emit it as a hashed static asset
// (client/dist), so it never enters the JS bundle nor the worker. Missing / unreadable → console.warn, undefined.
import { RoadGraph, type RoadGraphFile, GRAPH_VERSION } from '@race/shared/graph';
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
