// Package C: bridge decks + railings (+ trimesh colliders) from BridgeRecs; materials come from createRoadMaterials().
// Module top level must not touch the DOM: the worker imports build*(); canvas textures only inside create*().
// Deck height: linear along arc length between the terrain 5 m beyond each chain end (the quays once the river is
// carved), never below the terrain under it, + (layer − 1) × railLayerStep for upper decks (Bir-Hakeim metro).
// A piece of a split chain (BridgeRec.chain) uses the whole chain's ends and arc length, and caps only real chain ends.
import { roads as C } from '../config.ts';
import type { Builder, MaterialId } from './buildTypes.ts';
import { MeshBuffer, mergeTriMeshes } from './geom.ts';
import { cap, markings, Path, roadWidth, sideGaps, sidewalkWidth, strip, surfaceOf, wall, type YFn } from './RoadBuilder.ts';

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
    const e = b.chain?.ends ?? [...b.pts.slice(0, 4), ...b.pts.slice(-4)];
    const unit = (dx: number, dz: number) => [dx / (Math.hypot(dx, dz) || 1), dz / (Math.hypot(dx, dz) || 1)] as const;
    const [ax, az] = unit(e[2]! - e[0]!, e[3]! - e[1]!);
    const [bx, bz] = unit(e[6]! - e[4]!, e[7]! - e[5]!);
    const y0 = ctx.height(e[0]! - ax * endSample, e[1]! - az * endSample);
    const y1 = ctx.height(e[6]! + bx * endSample, e[7]! + bz * endSample);
    const [s0, CL] = b.chain ? [b.chain.s0, b.chain.length] : [0, L];
    const up = Math.max(0, b.layer - 1) * railLayerStep;
    const y: YFn = (x, z, s) => Math.max(y0 + ((y1 - y0) * (s0 + s)) / CL, ctx.height(x, z)) + up;

    const way = { ...b, oneway: false };
    const hc = roadWidth(way) / 2;
    const sw = sidewalkWidth(way);
    const H = hc + sw;
    const rail = C.railKinds.includes(b.kind);
    // Parallel road decks of one bridge (dual carriageways: Pont d'Iéna, Concorde) are joined: each deck reaches the
    // midline to its neighbour and has no parapet on that side. ponytail: neighbours in this chunk only (parallel
    // chains of one bridge share their midpoint chunk).
    const decks = rail ? [] : chunk.bridges.filter((o) => o !== b && o.layer === b.layer && !C.railKinds.includes(o.kind));
    const gaps = decks.length ? sideGaps(p, decks, C.minTwinCos).map((d) => (d <= C.bridge.mergeGap ? d : Infinity)) : [Infinity, Infinity];
    const [EL, ER] = gaps.map((d) => (d < Infinity ? Math.max(H, d / 2) : H)) as [number, number]; // edges +EL, −ER
    const surfY = C.surfaceLift[surfaceOf(way)]!;

    // Slab: underside, sides (up to the sidewalk top where no parapet covers it), ends.
    const slab = buf('bridge');
    const top = C.curbHeight + C.lift;
    strip(slab, p, 0, L, -ER, EL, y, -T, max, true);
    wall(slab, p, 0, L, EL, y, -T, sw && gaps[0]! < Infinity ? top : 0, 1, max);
    wall(slab, p, 0, L, -ER, y, -T, sw && gaps[1]! < Infinity ? top : 0, -1, max);
    if (s0 < 0.3) cap(slab, p, 0, -ER, EL, y, -T, 0, -1);
    if (s0 + L > CL - 0.3) cap(slab, p, L, -ER, EL, y, -T, 0, 1);

    // Surface.
    if (rail) strip(slab, p, 0, L, -H, H, y, 0, max);
    else strip(buf(surfaceOf(way)), p, 0, L, -hc, hc, y, surfY, max);
    if (sw) {
      const walk = buf('sidewalk');
      strip(walk, p, 0, L, hc, EL, y, top, max);
      strip(walk, p, 0, L, -ER, -hc, y, top, max);
      wall(walk, p, 0, L, hc, y, 0, top, -1, max);
      wall(walk, p, 0, L, -hc, y, 0, top, 1, max);
    } else if (!rail) {
      strip(slab, p, 0, L, hc, EL, y, surfY, max); // joint to a neighbour deck (empty without one)
      strip(slab, p, 0, L, -ER, -hc, y, surfY, max);
    }
    const lanes = b.lanes ?? Math.max(1, Math.floor((2 * hc) / C.laneWidth));
    if (!rail && !C.footKinds.includes(b.kind) && lanes >= 2) markings(buf('marking'), p, hc, lanes, [], y, surfY + C.markingLift);

    // Railings (parapets) on the outer edges.
    const r = buf('railing');
    for (const side of [1, -1] as const) {
      if (gaps[side === 1 ? 0 : 1]! < Infinity) continue;
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
