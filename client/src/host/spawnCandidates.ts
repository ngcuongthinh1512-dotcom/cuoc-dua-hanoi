// Phase 6 track C (docs/plans/phase6.md §3 decision 14, SPEC §6.2 (1)–(2), (6)): where shared bikes may appear. Computed
// in the Host browser on shared/data/roadgraph.json (CLAUDE.md: no A* / corridors in the Durable Object) and sent as
// `host.candidates`; the DO only picks among these points (worker/src/race/VehicleSpawner.ts). Pure, deterministic.
import { corridorEdges, pathPolyline, type RoadGraph, segPoint, shortestPath, WayFlag } from '@race/shared/graph';
import { serverBikes as C } from '../config.ts';

export interface XZ {
  x: number;
  z: number;
}

/** From the leg file's `vehicles` block (SPEC §6.2), via the Host state. */
export interface CorridorRules {
  corridorMeters: number;
  minDistanceFromCheckpoint: number;
}

/** No bike on a bridge (narrow decks), stairs, or a zebra crossing (SPEC §6.2 (2); tunnels are not in the graph). */
const NO_SPAWN = WayFlag.bridge | WayFlag.steps | WayFlag.crossing;
const dm = (v: number) => Math.round(v * 10) / 10;

/** Distance of (x, z) to the polyline and how far along it (m) its nearest point is. */
function project(poly: readonly number[], x: number, z: number) {
  let d = Infinity, along = 0, run = 0;
  for (let i = 0; i + 3 < poly.length; i += 2) {
    const [ax, az, bx, bz] = [poly[i]!, poly[i + 1]!, poly[i + 2]!, poly[i + 3]!];
    const [t, dist] = segPoint(x, z, ax, az, bx, bz);
    const len = Math.hypot(bx - ax, bz - az);
    if (dist < d) (d = dist), (along = run + t * len);
    run += len;
  }
  return { d, along };
}

/**
 * Per route segment (points[i] → points[i + 1], A* on foot): the bicycle_parking nodes within corridorMeters / 2 of the
 * path, then — when fewer than serverBikes.minCandidates — points sampled every candidateStep m on the corridor's
 * pavements (any walkable non-stair edge if it has too few), spread evenly along the route. Decoys: one pavement point
 * per decoyCell square outside every corridor, within decoyMargin of the route. Every point stays
 * minDistanceFromCheckpoint from the route points and `checkpoints` (task locations). Points are [x, z, x, z…] m.
 */
export function spawnCandidates(g: RoadGraph, points: readonly XZ[], checkpoints: readonly XZ[], rules: CorridorRules): { segments: number[][]; decoys: number[] } {
  const half = rules.corridorMeters / 2;
  const avoid = [...points, ...checkpoints];
  const clear = (x: number, z: number) => avoid.every((p) => Math.hypot(p.x - x, p.z - z) >= rules.minDistanceFromCheckpoint);
  const paveKinds = new Set(['footway', 'pedestrian'].map((k) => g.file.kinds.indexOf(k)));
  const isPave = (e: number) => !!(g.flags(e) & WayFlag.sidewalk) || paveKinds.has(g.file.ways[g.edgeWay[e]!]![0]!);
  /** Points every `step` m (at least one, at the middle) along edge e. */
  const along = (e: number, step: number) => {
    const [a, b] = [g.edgeA[e]!, g.edgeB[e]!];
    const n = Math.max(1, Math.round(g.edgeLength[e]! / step));
    return Array.from({ length: n }, (_, k) => ({ x: g.x[a]! + ((k + 0.5) / n) * (g.x[b]! - g.x[a]!), z: g.z[a]! + ((k + 0.5) / n) * (g.z[b]! - g.z[a]!) }));
  };
  const inCorridor = new Set<number>();
  const polys: number[][] = [];

  const segments = points.slice(1).map((to, i) => {
    const from = points[i]!;
    const path = shortestPath(g, g.nearestNode(from.x, from.z, 'walk'), g.nearestNode(to.x, to.z, 'walk'), 'walk');
    if (!path) return [];
    const poly = pathPolyline(g, path);
    polys.push(poly);
    const edges = corridorEdges(g, path, rules.corridorMeters, 'walk');
    edges.forEach((e) => inCorridor.add(e));
    const out: number[] = [];
    const bp = g.file.bikeParking;
    for (let k = 0; k + 1 < bp.length; k += 2) {
      const [x, z] = [bp[k]! / 10, bp[k + 1]! / 10];
      if (clear(x, z) && project(poly, x, z).d <= half) out.push(x, z);
    }
    const need = C.minCandidates - out.length / 2;
    if (need <= 0) return out;
    const all = edges
      .filter((e) => !(g.flags(e) & NO_SPAWN))
      .flatMap((e) => along(e, C.candidateStep).map((p) => ({ ...p, pave: isPave(e), ...project(poly, p.x, p.z) })))
      .filter((p) => p.d <= half && clear(p.x, p.z));
    const paved = all.filter((p) => p.pave);
    const pool = (paved.length >= need ? paved : all).sort((p, q) => p.along - q.along);
    const picked = pool.length <= need ? pool : Array.from({ length: need }, (_, k) => pool[Math.floor(((k + 0.5) * pool.length) / need)]!);
    for (const p of picked) out.push(dm(p.x), dm(p.z));
    return out;
  });

  // Decoys (SPEC §6.2 (6)): same kind of spot on streets the route does not use, near enough to be met.
  const all = polys.flat();
  const [xs, zs] = [all.filter((_, k) => k % 2 === 0), all.filter((_, k) => k % 2 === 1)];
  const [x0, x1, z0, z1] = [Math.min(...xs) - C.decoyMargin, Math.max(...xs) + C.decoyMargin, Math.min(...zs) - C.decoyMargin, Math.max(...zs) + C.decoyMargin];
  const cells = new Set<number>();
  const decoys: number[] = [];
  for (let e = 0; e < g.edgeA.length; e++) {
    if (inCorridor.has(e) || g.flags(e) & NO_SPAWN || !isPave(e)) continue;
    for (const p of along(e, C.candidateStep)) {
      const cell = Math.floor(p.x / C.decoyCell) * 100_000 + Math.floor(p.z / C.decoyCell);
      if (p.x < x0 || p.x > x1 || p.z < z0 || p.z > z1 || cells.has(cell) || !clear(p.x, p.z)) continue;
      cells.add(cell);
      decoys.push(dm(p.x), dm(p.z));
    }
  }
  return { segments, decoys };
}
