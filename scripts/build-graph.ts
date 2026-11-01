// Raw OSM cache (.cache/osm, see fetch-osm.ts) → shared/data/roadgraph.json (format: shared/src/graph/types.ts,
// docs/plans/phase4.md §6). Walkable / ridable / drivable network incl. sidewalks, crossings, pedestrian-area outlines;
// tunnels, underground, indoor and NOT_ROADS dropped. Deterministic: ways sorted by OSM id, compact JSON.
// Usage: npx tsx scripts/build-graph.ts [--cache <dir with tiles/ + global.json>] [--out <file>]
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { RACE_BBOX, latLonToWorld } from '@race/shared';
import { GRAPH_VERSION, RoadGraph, type RoadGraphFile, WayFlag, segPoint } from '@race/shared/graph';
import { props, roads } from '../client/src/config.ts';
import { type Tags, classify, parseNumber, roadFacts } from '../client/src/geo/osm.ts';
import { loadDistrictMask } from './district-mask.ts';
import { worldRect, type Rect } from './geo.ts';

export type OsmElement = {
  type: 'node' | 'way' | 'relation';
  id: number;
  tags?: Tags;
  lat?: number;
  lon?: number;
  nodes?: number[];
  geometry?: ({ lat: number; lon: number } | null)[];
};

const SIMPLIFY = 0.5; // m: Douglas–Peucker tolerance for untagged degree-2 nodes
const AREA_KINDS = new Set(['footway', 'pedestrian']); // area=yes outlines kept as walk rings (crossed along the edge)
const AREA_WIDTH_DM = 1; // outline ribbons carry no surface (surfaceAt ignores them in practice)
const NO_WALK = new Set(['motorway', 'trunk', 'motorway_link', 'trunk_link']);
const STREET = new Set([...props.carKinds, ...props.streetKinds]);
const CAR = new Set([...props.carKinds, 'service']);
const PAVE = new Set(roads.paveSurfaces);
const yes = (v: string | undefined) => v !== undefined && v !== 'no';

type Kept = { id: number; kind: string; flags: number; lanes: number; name?: string; width: number; layer: number; refs: number[] };

/** Way tags → graph record header, or undefined when the way is not part of the graph. */
function keep(t: Tags, closed: boolean): Omit<Kept, 'id' | 'refs'> | undefined {
  if (!t.highway) return undefined;
  const area = closed && t.area === 'yes';
  if (area && !AREA_KINDS.has(t.highway)) return undefined;
  if (yes(t.covered)) return undefined;
  const bridge = yes(t.bridge);
  // classify() drops tunnel / layer < 0 / indoor / NOT_ROADS; sidewalk + crossing are drops for the renderer only.
  const c = classify(bridge ? { ...t, layer: undefined } : t, 'line');
  if (c === undefined || (typeof c === 'object' && c.drop !== 'sidewalk' && c.drop !== 'crossing')) return undefined;
  const f = roadFacts(t);
  const car = CAR.has(f.kind);
  const walk = t.foot !== 'no' && !(NO_WALK.has(f.kind) && !yes(t.sidewalk));
  const steps = f.kind === 'steps';
  const flags =
    (walk ? WayFlag.walk : 0) | (steps ? WayFlag.steps : WayFlag.bike) | (car ? WayFlag.car : 0) |
    (car && f.oneway ? WayFlag.oneway : 0) | (bridge ? WayFlag.bridge : 0) |
    (t.footway === 'crossing' ? WayFlag.crossing : 0) | (t.footway === 'sidewalk' ? WayFlag.sidewalk : 0) |
    (PAVE.has(f.surface ?? '') ? WayFlag.pave : 0) | (f.roundabout ? WayFlag.roundabout : 0);
  return {
    kind: f.kind, flags, lanes: Math.round(f.lanes ?? 0), name: f.name,
    width: area ? AREA_WIDTH_DM : Math.round((f.width ?? 0) * 10), layer: Math.round(parseNumber(t.layer) ?? (bridge ? 1 : 0)),
  };
}

export function buildGraph(elements: Iterable<OsmElement>, rect: Rect, mask?: (x: number, z: number) => boolean): RoadGraphFile {
  const pos = new Map<number, [number, number]>();
  const nodeTags = new Map<number, Tags>();
  const bikeParking: [number, number][] = [];
  const kept: Kept[] = [];
  const inside = (x: number, z: number) => x >= rect.minX && x <= rect.maxX && z >= rect.minZ && z <= rect.maxZ && (mask?.(x, z) ?? true);
  const world = (lat: number, lon: number) => {
    const w = latLonToWorld(lat, lon);
    return [w.x, w.z] as [number, number];
  };
  for (const e of elements) {
    const t = e.tags ?? {};
    if (e.type === 'node') {
      if (e.tags) nodeTags.set(e.id, e.tags);
      if (t.amenity === 'bicycle_parking' && e.lat !== undefined) bikeParking.push(world(e.lat, e.lon!));
      continue;
    }
    if (e.type !== 'way' || !e.nodes || !e.geometry) continue;
    if (t.amenity === 'bicycle_parking') {
      const g = e.geometry.filter((p) => p !== null);
      if (g.length) bikeParking.push(world(g.reduce((s, p) => s + p.lat, 0) / g.length, g.reduce((s, p) => s + p.lon, 0) / g.length));
      continue;
    }
    const k = keep(t, e.nodes.length > 2 && e.nodes[0] === e.nodes.at(-1));
    if (!k) continue;
    e.geometry.forEach((g, i) => g && pos.set(e.nodes![i]!, world(g.lat, g.lon)));
    const refs = t.oneway === '-1' ? [...e.nodes].reverse() : e.nodes;
    // ponytail: clip by node (pieces end at the last node inside the map), not at the exact border; fine for routing.
    let run: number[] = [];
    const flush = () => {
      if (run.length >= 2) kept.push({ id: e.id, ...k, refs: run });
      run = [];
    };
    for (const r of refs) {
      const p = pos.get(r);
      if (p && inside(...p)) run.push(r);
      else flush();
    }
    flush();
  }
  kept.sort((a, b) => a.id - b.id); // stable: pieces of one way keep their order

  // Nodes that must survive simplification: used ≥ 2 times (junction / loop), way ends, tagged.
  const uses = new Map<number, number>();
  for (const w of kept) for (const r of w.refs) uses.set(r, (uses.get(r) ?? 0) + 1);
  const fixed = (r: number) => uses.get(r)! > 1 || nodeTags.has(r);
  const simplify = (refs: number[]) => {
    const out: number[] = [refs[0]!];
    const dp = (i: number, j: number) => {
      const [ax, az] = pos.get(refs[i]!)!, [bx, bz] = pos.get(refs[j]!)!;
      let far = -1, best = SIMPLIFY;
      for (let m = i + 1; m < j; m++) {
        const [px, pz] = pos.get(refs[m]!)!;
        const d = segPoint(px, pz, ax, az, bx, bz)[1];
        if (d > best) (best = d), (far = m);
      }
      if (far >= 0) dp(i, far), out.push(refs[far]!), dp(far, j);
    };
    let s = 0;
    for (let m = 1; m < refs.length; m++) {
      if (m < refs.length - 1 && !fixed(refs[m]!)) continue;
      dp(s, m);
      out.push(refs[m]!);
      s = m;
    }
    return out;
  };

  const index = new Map<number, number>();
  const nodes: number[] = [];
  const idx = (r: number) => {
    let i = index.get(r);
    if (i === undefined) {
      index.set(r, (i = index.size));
      const [x, z] = pos.get(r)!;
      nodes.push(Math.round(x * 10), Math.round(z * 10));
    }
    return i;
  };
  const kinds: string[] = [];
  const names: string[] = [];
  const lookup = (list: string[], map: Map<string, number>, v: string) => {
    let i = map.get(v);
    if (i === undefined) map.set(v, (i = list.push(v) - 1));
    return i;
  };
  const kindIdx = new Map<string, number>(), nameIdx = new Map<string, number>();
  const ends = new Map<number, number>(); // street edge ends per node → junctions
  const ways = kept.map((w) => {
    const ns = simplify(w.refs).map(idx);
    if (STREET.has(w.kind) && !(w.flags & (WayFlag.sidewalk | WayFlag.crossing))) {
      ns.forEach((n, i) => ends.set(n, (ends.get(n) ?? 0) + (i === 0 || i === ns.length - 1 ? 1 : 2)));
    }
    const name = w.name === undefined ? -1 : lookup(names, nameIdx, w.name);
    return [lookup(kinds, kindIdx, w.kind), w.flags, w.lanes, name, w.width, w.layer, ...ns];
  });
  const tagged = (v: string) =>
    [...index].filter(([r]) => nodeTags.get(r)?.highway === v).map(([, i]) => i).sort((a, b) => a - b);
  return {
    v: GRAPH_VERSION,
    nodes,
    kinds,
    names,
    ways,
    junctions: [...ends].filter(([, c]) => c >= 3).map(([n]) => n).sort((a, b) => a - b),
    crossings: tagged('crossing'),
    signals: tagged('traffic_signals'),
    bikeParking: bikeParking
      .filter((p) => inside(...p))
      .map(([x, z]) => [Math.round(x * 10), Math.round(z * 10)] as const)
      .sort((a, b) => a[0] - b[0] || a[1] - b[1])
      .flat(),
  };
}

function main() {
  const ROOT = fileURLToPath(new URL('..', import.meta.url));
  const { values: args } = parseArgs({
    options: {
      cache: { type: 'string', default: join(ROOT, '.cache/osm') },
      out: { type: 'string', default: join(ROOT, 'shared/data/roadgraph.json') },
    },
  });
  const t0 = performance.now();
  const elements = new Map<string, OsmElement>();
  const files = ['global.json', ...readdirSync(join(args.cache, 'tiles')).filter((f) => f.endsWith('.json')).sort().map((f) => join('tiles', f))];
  for (const file of files) {
    for (const e of (JSON.parse(readFileSync(join(args.cache, file), 'utf8')) as { elements: OsmElement[] }).elements) {
      const k = `${e.type}/${e.id}`;
      if (!elements.has(k)) elements.set(k, e);
    }
  }
  const file = buildGraph([...elements.values()].sort((a, b) => a.id - b.id), worldRect(RACE_BBOX), loadDistrictMask(args.cache).contains); // Leg 3 Hà Nội: only the 3 race districts
  const json = JSON.stringify(file);
  writeFileSync(args.out, json);
  const g = RoadGraph.decode(file);
  const sizes = new Map<number, number>();
  for (const c of g.component) sizes.set(c, (sizes.get(c) ?? 0) + 1);
  const comps = [...sizes.values()].sort((a, b) => b - a);
  const mb = json.length / 1024 / 1024;
  console.log(
    `roadgraph: ${g.nodeCount} nodes, ${g.edgeA.length} edges, ${file.ways.length} ways, ${file.junctions.length} junctions, ` +
      `${file.crossings.length} crossings, ${file.signals.length} signals, ${file.bikeParking.length / 2} bike parkings`,
  );
  console.log(`walk components: ${comps.length}, largest ${comps[0]} (${((comps[0]! / g.nodeCount) * 100).toFixed(1)} % of nodes)`);
  console.log(`${args.out}: ${mb.toFixed(2)} MB, sha256 ${createHash('sha256').update(json).digest('hex').slice(0, 16)}, ${((performance.now() - t0) / 1000).toFixed(1)} s`);
  if (mb > 25) throw new Error('roadgraph.json > 25 MB (static asset limit)');
  if (mb > 6) console.warn('roadgraph.json > 6 MB target');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
