// Package C: bridge decks + railings (+ trimesh colliders) from BridgeRecs; materials come from createRoadMaterials().
// Module top level must not touch the DOM: the worker imports build*(); canvas textures only inside create*().
// Deck height: linear along arc length between the terrain 5 m beyond each chain end (the quays once the river is
// carved), never below the terrain under it, + (layer − 1) × railLayerStep for upper decks (Bir-Hakeim metro).
import { roads as C } from '../config.ts';
import type { Builder, MaterialId } from './buildTypes.ts';
import { MeshBuffer, mergeTriMeshes } from './geom.ts';
import { cap, markings, Path, roadWidth, sidewalkWidth, strip, surfaceOf, wall, type YFn } from './RoadBuilder.ts';

export const buildBridges: Builder = (chunk, ctx) => {
  const bufs = new Map<MaterialId, MeshBuffer>();
  const buf = (m: MaterialId) => bufs.get(m) ?? (bufs.set(m, new MeshBuffer(m)), bufs.get(m)!);
  const { deckThickness: T, railingHeight: RH, railingThickness: RT, endSample, railLayerStep } = C.bridge;
  const max = C.maxSegment;

  for (const b of chunk.bridges) {
    if (b.pts.length < 4) continue;
    const p = new Path(b.pts);
    const L = p.length;
    if (L < 0.5) continue;
    const [ax, az] = p.dir(0);
    const [bx, bz] = p.dir(L);
    const n = b.pts.length;
    const y0 = ctx.height(b.pts[0]! - ax * endSample, b.pts[1]! - az * endSample);
    const y1 = ctx.height(b.pts[n - 2]! + bx * endSample, b.pts[n - 1]! + bz * endSample);
    const up = Math.max(0, b.layer - 1) * railLayerStep;
    const y: YFn = (x, z, s) => Math.max(y0 + ((y1 - y0) * s) / L, ctx.height(x, z)) + up;

    const way = { ...b, oneway: false };
    const hc = roadWidth(way) / 2;
    const sw = sidewalkWidth(way);
    const H = hc + sw;
    const rail = C.railKinds.includes(b.kind);

    // Slab: underside, sides, ends.
    const slab = buf('bridge');
    strip(slab, p, 0, L, -H, H, y, -T, max, true);
    wall(slab, p, 0, L, H, y, -T, 0, 1, max);
    wall(slab, p, 0, L, -H, y, -T, 0, -1, max);
    cap(slab, p, 0, -H, H, y, -T, 0, -1);
    cap(slab, p, L, -H, H, y, -T, 0, 1);

    // Surface.
    if (rail) strip(slab, p, 0, L, -H, H, y, 0, max);
    else strip(buf(surfaceOf(way)), p, 0, L, -hc, hc, y, C.surfaceLift[surfaceOf(way)]!, max);
    if (sw) {
      const top = C.curbHeight + C.lift;
      const walk = buf('sidewalk');
      strip(walk, p, 0, L, hc, H, y, top, max);
      strip(walk, p, 0, L, -H, -hc, y, top, max);
      wall(walk, p, 0, L, hc, y, 0, top, -1, max);
      wall(walk, p, 0, L, -hc, y, 0, top, 1, max);
    }
    const lanes = b.lanes ?? Math.max(1, Math.floor((2 * hc) / C.laneWidth));
    if (!rail && !C.footKinds.includes(b.kind) && lanes >= 2) markings(buf('marking'), p, hc, lanes, [], y, C.surfaceLift[surfaceOf(way)]! + C.markingLift);

    // Railings (parapets) on both edges.
    const r = buf('railing');
    for (const side of [1, -1] as const) {
      const [o, i] = [side * H, side * (H - RT)];
      wall(r, p, 0, L, o, y, 0, RH, side, max);
      wall(r, p, 0, L, i, y, 0, RH, side === 1 ? -1 : 1, max);
      strip(r, p, 0, L, Math.min(o, i), Math.max(o, i), y, RH, max);
    }
  }

  const meshes = [...bufs.values()].map((m) => m.bucket()).filter((m) => m.index.length);
  // ponytail: collider = every render triangle (deck, surface, railings), a simplified hull if Rapier build time shows
  const colliders = meshes.length ? [mergeTriMeshes(meshes.map((m) => ({ vertices: m.position, indices: m.index })))] : [];
  return { meshes, instances: [], colliders };
};
