// Package C: bridge decks + railings (+ trimesh colliders) from BridgeRecs; materials come from createRoadMaterials().
// Module top level must not touch the DOM: the worker imports build*(); canvas textures only inside create*().
// Deck height: linear along arc length between the terrain 5 m beyond each chain end (the quays once the river is
// carved), never below the terrain under it, + (layer − 1) × railLayerStep for upper decks. Upper RAIL decks (the
// 2.5 km Line 6 viaduct over Bir-Hakeim) instead sit railLayerStep × (layer − 1) above the road deck under them, or
// above the terrain where there is none (a straight line between its far ends floated ≈ 21 m over the river).
// ponytail: road decks of this chunk only; over the river without one the floor is bridge.riverDeck, a cross-chunk
// deck lookup if another elevated line crosses water.
// A piece of a split chain (BridgeRec.chain) uses the whole chain's ends and arc length, and caps only real chain ends.
// Where the deck follows the ground (never below it) steep faces are planed to bridge.rampGrade, so the carved quay band
// (a 63° one-cell face, Terrain.carveRiver) becomes a ramp, not a step; a real chain end of a road / foot deck gets a
// bridge.endRamp m slab tongue blending down to the ground, covering the trench quayMesh leaves open under the deck.
// A road / foot deck over the river ignores its OSM layer (Petit-Pont is layer 2 with nothing under it).
import { roads as C, terrain as TR } from '../config.ts';
import type { BridgeRec } from '../geo/chunkData.ts';
import type { Builder, MaterialId } from './buildTypes.ts';
import { MeshBuffer, mergeTriMeshes } from './geom.ts';
import { cap, markings, Path, roadWidth, sideGaps, sidewalkWidth, strip, surfaceOf, wall, type YFn } from './RoadBuilder.ts';

/** Named decks a landmark detail builds whole (deck, parapet, collider): nothing is drawn here. Cầu Thê Húc = landmarks/thehuc.ts. */
const OWN_DECK = new Set(['Cầu Thê Húc']);

export const buildBridges: Builder = (chunk, ctx) => {
  const bufs = new Map<MaterialId, MeshBuffer>();
  const buf = (m: MaterialId) => bufs.get(m) ?? (bufs.set(m, new MeshBuffer(m)), bufs.get(m)!);
  const { deckThickness: T, railingHeight: RH, railingThickness: RT, endSample, endRamp, rampGrade, railLayerStep, riverDeck } = C.bridge;
  const max = Math.min(C.maxSegment, 1.25); // stations close enough for the planed ramps at the banks (few decks: cheap)
  const rail = (b: BridgeRec) => C.railKinds.includes(b.kind);

  const unit = (dx: number, dz: number) => [dx / (Math.hypot(dx, dz) || 1), dz / (Math.hypot(dx, dz) || 1)] as const;
  /** Terrain as the Rapier heightfield can be at (x, z): a bank cell (one street-level node, the rest river bed below
   *  `bed`) is two triangles twisting metres above the bilinear ctx.height, so there the highest of its four nodes counts. */
  const cellMax = (x: number, z: number, bed: number) => {
    const [x0, z0] = [Math.floor(x / TR.cell) * TR.cell, Math.floor(z / TR.cell) * TR.cell];
    const c = [ctx.height(x0, z0), ctx.height(x0 + TR.cell, z0), ctx.height(x0, z0 + TR.cell), ctx.height(x0 + TR.cell, z0 + TR.cell)];
    return Math.min(...c) < bed ? Math.max(...c) : ctx.height(x, z);
  };
  /** Ground under a deck along the travel direction (ux, uz): the terrain with every face steeper than rampGrade planed
   *  down (the carved quay band is one 5 m cell from bed to street, copingWidth covers it on the quay side), looking only
   *  over [tMin, tMax] m along the axis = the deck's own extent (a terrace wall beyond the deck end must not lift it). */
  const ground = (x: number, z: number, ux: number, uz: number, bed: number, tMin = -TR.copingWidth, tMax = TR.copingWidth) => {
    let y = ctx.height(x, z);
    for (let t = Math.max(tMin, -TR.copingWidth); t <= Math.min(tMax, TR.copingWidth); t += 1.25) {
      y = Math.max(y, cellMax(x + ux * t, z + uz * t, bed) - rampGrade * Math.abs(t));
    }
    return y;
  };
  /** Deck line ends of a chain, in chain arc length: y0 / y1 = terrain endSample beyond the ends (world/landmarks/g2.ts
   *  and npc/roads.ts copy this line); g0 / g1 = the highest terrain under the would-be tongue (endRamp m out). An end over
   *  the water short of the bank (an OSM cycleway / split way ending mid-river, far higher ground under the tongue) takes
   *  that ground instead of the bed. A tongue only where that ground is about deck level or higher (a bank), never for
   *  rail decks. */
  const lineEnds = (b: BridgeRec, L: number) => {
    const e = b.chain?.ends ?? [...b.pts.slice(0, 4), ...b.pts.slice(-4)];
    const [ax, az] = unit(e[2]! - e[0]!, e[3]! - e[1]!);
    const [bx, bz] = unit(e[6]! - e[4]!, e[7]! - e[5]!);
    const under = (x: number, z: number, ux: number, uz: number) => {
      let y = -Infinity;
      for (let d = 0; d <= endRamp; d += 2.5) y = Math.max(y, ctx.height(x + ux * d, z + uz * d));
      return y;
    };
    const g0 = under(e[0]!, e[1]!, -ax, -az);
    const g1 = under(e[6]!, e[7]!, bx, bz);
    const end = (y: number, g: number) => (y < g - 3 ? g : y);
    const y0 = end(ctx.height(e[0]! - ax * endSample, e[1]! - az * endSample), g0);
    const y1 = end(ctx.height(e[6]! + bx * endSample, e[7]! + bz * endSample), g1);
    const [s0, CL] = b.chain ? [b.chain.s0, b.chain.length] : [0, L];
    const t0 = !rail(b) && s0 < 0.3 && g0 > y0 - 1;
    const t1 = !rail(b) && s0 + L > CL - 0.3 && g1 > y1 - 1;
    return { y0, y1, s0, CL, t0, t1 };
  };
  /** Path of a piece plus the endRamp tongues: [path, tongue length at the start]. */
  const extended = (b: BridgeRec, L: number): [Path, number] => {
    const { t0, t1 } = lineEnds(b, L);
    const pts = [...b.pts];
    const n = pts.length;
    const [ax, az] = unit(pts[2]! - pts[0]!, pts[3]! - pts[1]!);
    const [bx, bz] = unit(pts[n - 2]! - pts[n - 4]!, pts[n - 1]! - pts[n - 3]!);
    if (t1) pts.push(pts[n - 2]! + bx * endRamp, pts[n - 1]! + bz * endRamp);
    if (t0) pts.unshift(pts[0]! - ax * endRamp, pts[1]! - az * endRamp);
    return [new Path(pts), t0 ? endRamp : 0];
  };
  /** Deck height without the layer step, in the extended path's arc length: the line between y0 and y1, never below the
   *  planed ground (looking only over the deck's own extent); on a tongue the line blends over its first half from the
   *  chain end to the terrain under each vertex (the axis terrain where the vertex is still over the water: oblique
   *  banks), then hugs the street (carveRiver digs no trench there). */
  const deckY = (b: BridgeRec, p: Path, a: number, L: number): YFn => {
    const { y0, y1, s0, CL, t0, t1 } = lineEnds(b, L);
    return (x, z, s) => {
      const cs = s0 + s - a;
      const f = cs < 0 && t0 ? Math.min(1, (-2 * cs) / endRamp) : cs > CL && t1 ? Math.min(1, (2 * (cs - CL)) / endRamp) : 0;
      const ss = Math.min(Math.max(s, 0), p.length);
      let line = y0 + ((y1 - y0) * Math.min(Math.max(cs, 0), CL)) / CL;
      if (f) {
        const yEnd = cs < 0 ? y0 : y1;
        const h = ctx.height(x, z);
        const target = h < yEnd - 2 ? ctx.height(...p.at(0, ss)) : h;
        line = yEnd * (1 - f) + Math.max(target, h) * f;
      }
      const [ux, uz] = p.dir(ss);
      // ponytail: a tongue sits 3 cm over the street's own surface (same lift, same material = z-fight otherwise)
      return Math.max(line, ground(x, z, ux, uz, Math.min(y0, y1) - 4, -ss, p.length - ss)) + (f ? 0.03 : 0);
    };
  };
  const lower = chunk.bridges
    .filter((o) => o.layer <= 1 && o.pts.length >= 4)
    .map((o) => {
      const L = new Path(o.pts).length;
      const [p, a] = extended(o, L);
      return { o, a, y: deckY(o, p, a, L) };
    });
  /** Road deck height under (x, z): nearest point of a layer ≤ 1 deck of this chunk within its half width + 3 m. */
  const lowerAt = (x: number, z: number) => {
    let best: number | undefined;
    let bestD = Infinity;
    for (const { o, a, y } of lower) {
      let s = 0;
      for (let i = 2; i < o.pts.length; i += 2) {
        const [px, pz, qx, qz] = [o.pts[i - 2]!, o.pts[i - 1]!, o.pts[i]!, o.pts[i + 1]!];
        const len = Math.hypot(qx - px, qz - pz) || 1e-9;
        const t = Math.min(1, Math.max(0, ((x - px) * (qx - px) + (z - pz) * (qz - pz)) / len ** 2));
        const d = Math.hypot(px + t * (qx - px) - x, pz + t * (qz - pz) - z);
        if (d < bestD && d < roadWidth({ ...o, oneway: false }) / 2 + 3) [bestD, best] = [d, y(x, z, a + s + t * len)];
        s += len;
      }
    }
    return best;
  };

  for (const b of chunk.bridges) {
    if (b.pts.length < 4 || OWN_DECK.has(b.name ?? '')) continue;
    const L0 = new Path(b.pts).length;
    if (L0 < 0.5) continue;
    const [s0, CL] = b.chain ? [b.chain.s0, b.chain.length] : [0, L0];
    const [p, a] = extended(b, L0);
    const L = p.length;
    const [r0, r1] = [a, a + L0]; // the real deck: railings, sidewalks, markings; the slab + surface run over the tongues too
    const base = deckY(b, p, a, L0);
    // Layer lift only for rail decks and decks over streets (elevated walkways): a road deck over the river is at quay level.
    const mid = p.at(0, L / 2);
    const overRiver = ctx.height(mid[0], mid[1]) < base(mid[0], mid[1], L / 2) - 3;
    // a shallow lake (Hà Nội): the bed is only 0.4 m under the bank, so the deck would lie at the water level and vanish in it
    const lake = !overRiver && !rail(b) && ctx.height(mid[0], mid[1]) < base(mid[0], mid[1], L / 2) - C.bridge.lakeMin;
    const up = (rail(b) || !(overRiver || lake) ? Math.max(0, b.layer - 1) * railLayerStep : 0) + (lake ? C.bridge.lakeLift : 0);
    // A land deck of layer 1 (the usual OSM tag of an overpass) is not lifted: it lies on the street, path or square under
    // it, where its parapets stood as a 1.1 m wall across (or along) the way. ponytail: no parapets at grade; a real overpass
    // needs its stairs / ramps (other OSM ways) raised with it.
    const atGrade = !overRiver && !lake && !up;
    // a footbridge over a shallow lake humps like the real ones: a parabola over the real deck [a, a + L0], 0 at both banks (rise ≤ lakeArch, ≤ lakeArchSlope × length)
    const rise = lake ? Math.min(C.bridge.lakeArch, C.bridge.lakeArchSlope * L0) : 0;
    const archAt = (s: number) => {
      const u = Math.min(1, Math.max(0, (s - a) / L0));
      return rise * 4 * u * (1 - u);
    };
    const y: YFn =
      up && rail(b) ? (x, z) => (lowerAt(x, z) ?? Math.max(ctx.height(x, z), riverDeck)) + up : (x, z, s) => base(x, z, s) + up + archAt(s);

    const way = { ...b, oneway: false };
    const hc = roadWidth(way) / 2;
    const sw = sidewalkWidth(way);
    const H = Math.max(hc + sw, lake ? C.bridge.lakeHalfWidth : 0); // a lake footbridge is wide like the real ones (config bridge.lakeHalfWidth)
    const isRail = rail(b);
    // Parallel road decks of one bridge (dual carriageways: Pont d'Iéna, Concorde) are joined: each deck reaches the
    // midline to its neighbour and has no parapet on that side. ponytail: neighbours in this chunk only (parallel
    // chains of one bridge share their midpoint chunk).
    const decks = isRail ? [] : chunk.bridges.filter((o) => o !== b && o.layer === b.layer && !rail(o));
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
    if (s0 + L0 > CL - 0.3) cap(slab, p, L, -ER, EL, y, -T, 0, 1);

    // Surface (over the tongues too; sidewalks, markings and railings only over the real deck [r0, r1]).
    if (isRail) strip(slab, p, 0, L, -H, H, y, 0, max);
    else strip(buf(surfaceOf(way)), p, 0, L, -hc, hc, y, surfY, max);
    if (sw) {
      const walk = buf('sidewalk');
      strip(walk, p, r0, r1, hc, EL, y, top, max);
      strip(walk, p, r0, r1, -ER, -hc, y, top, max);
      wall(walk, p, r0, r1, hc, y, 0, top, -1, max);
      wall(walk, p, r0, r1, -hc, y, 0, top, 1, max);
      for (const [t0, t1] of [[0, r0], [r1, L]]) {
        strip(slab, p, t0, t1, hc, EL, y, surfY, max); // tongue: flat slab where the sidewalk would be
        strip(slab, p, t0, t1, -ER, -hc, y, surfY, max);
      }
    } else if (!isRail) {
      strip(slab, p, 0, L, hc, EL, y, surfY, max); // joint to a neighbour deck (empty without one)
      strip(slab, p, 0, L, -ER, -hc, y, surfY, max);
    }
    const lanes = b.lanes ?? Math.max(1, Math.floor((2 * hc) / C.laneWidth));
    if (!isRail && !C.footKinds.includes(b.kind) && lanes >= 2) markings(buf('marking'), p, hc, lanes, [[0, r0], [r1, L]], y, surfY + C.markingLift);

    // Railings (parapets) on the outer edges.
    const r = buf('railing');
    for (const side of [1, -1] as const) {
      if (atGrade || gaps[side === 1 ? 0 : 1]! < Infinity || C.bridge.bare.includes(b.name ?? '')) continue;
      const [o, i] = [side * H, side * (H - RT)];
      wall(r, p, r0, r1, o, y, 0, RH, side, max);
      wall(r, p, r0, r1, i, y, 0, RH, side === 1 ? -1 : 1, max);
      strip(r, p, r0, r1, Math.min(o, i), Math.max(o, i), y, RH, max);
    }
  }

  const meshes = [...bufs.values()].map((m) => m.bucket()).filter((m) => m.index.length);
  // ponytail: collider = every render triangle (deck, surface, railings), a simplified hull if Rapier build time shows
  const colliders = meshes.length ? [mergeTriMeshes(meshes.map((m) => ({ vertices: m.position, indices: m.index })))] : [];
  return { meshes, instances: [], colliders };
};
