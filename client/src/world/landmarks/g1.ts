// Group g1: Eiffel Tower, Arc de Triomphe (docs/plans/phase2b-assets.md §1 #1, #4). Owned by the g1 agent.
// Phase 2 placeholders until then (moved from world/Landmarks.ts): Eiffel = 4 open legs (walkable under the tower,
// SPEC §17.4; its OSM parts are only read for numbers, never extruded), Arc = two crossed barrel arches.
import { landmarks as L } from '../../config.ts';
import type { BuildingRec, LandmarkId } from '../../geo/chunkData.ts';
import { MeshBuffer, type V3 } from '../geom.ts';
import type { DetailFn } from './index.ts';
import { arch, box, collider, extrude, footprintFrame, loft, place, square } from './kit.ts';

// Eiffel profile at 330 m, 125 m base: legs (y, outer half-size, leg width) converge and merge at the 2nd platform.
const EIFFEL_LEGS = [[0, 62.5, 26], [28, 47, 20], [57, 36, 15], [86, 27.5, 16.5], [115, 20, 20]];
const EIFFEL_SHAFT = [[115, 20], [180, 11], [240, 7], [276, 5]];
const EIFFEL_SPIRE = [[280, 3], [312, 1.5], [330, 0.25]];

function eiffel(rec: BuildingRec, y0: number) {
  const f = footprintFrame(rec.outer);
  const sxz = f.b / 62.5; // square tower: the shorter side
  const sy = (rec.height ?? L.eiffelHeight) / 330;
  const tile = L.latticeTile / sxz;
  const legs = new MeshBuffer('iron');
  for (const [sx, sz] of [[1, 1], [-1, 1], [-1, -1], [1, -1]] as const) {
    const rings = EIFFEL_LEGS.map(([y, s, w]): V3[] => {
      const m = s! - w! / 2; // leg centre (half-size w/2) on the diagonal
      return square(w! / 2, y!, sx * m, sz * m);
    });
    loft(legs, rings, tile);
  }
  const top = new MeshBuffer('iron');
  loft(top, EIFFEL_SHAFT.map(([y, s]) => square(s!, y!)), tile);
  loft(top, EIFFEL_SPIRE.map(([y, s]) => square(s!, y!)), tile);
  // 1st platform: hollow square ring (open above the walkable centre); 2nd and 3rd: solid slabs.
  for (const [x0, x1, z0, z1] of [[-39, 39, 22, 39], [-39, 39, -39, -22], [22, 39, -22, 22], [-39, -22, -22, 22]]) {
    box(top, x0!, x1!, 55, 59.5, z0!, z1!, tile);
  }
  box(top, -23, 23, 113, 117.5, -23, 23, tile);
  box(top, -8.5, 8.5, 274, 281, -8.5, 8.5, tile);
  const legBucket = place(legs.bucket(), f, y0, sxz, sy, sxz);
  return { meshes: [legBucket, place(top.bucket(), f, y0, sxz, sy, sxz)], instances: [], colliders: [collider(legBucket)] }; // legs only (§5.9)
}

// Arc de Triomphe at 45 (x) × 50 (y) × 22 (z) m: main arch through z, transverse arch through x.
function arc(rec: BuildingRec, y0: number) {
  const f = footprintFrame(rec.outer);
  const [W, D, H] = [22.5, 11, 50]; // half width, half depth, height
  const [m, ms, t, ts] = [7.3, 21.9, 4.2, 14.5]; // main arch half-width / springing, transverse arch half-width / springing
  const buf = new MeshBuffer('stone');
  const front = [-W, 0, -m, 0, ...arch(m, ms), m, 0, W, 0, W, H, -W, H];
  extrude(buf, front, 'z', -D, -t);
  extrude(buf, front, 'z', t, D);
  extrude(buf, [...arch(m, ms), m, H, -m, H], 'z', -t, t);
  const pier = [...arch(t, ts), t, H, -t, H];
  extrude(buf, pier, 'x', m, W);
  extrude(buf, pier, 'x', -W, -m);
  box(buf, -W - 0.8, W + 0.8, 38.5, 40.5, -D - 0.8, D + 0.8); // cornice under the attic
  const b = place(buf.bucket(), f, y0, f.a / W, (rec.height ?? L.arcHeight) / H, f.b / D);
  return { meshes: [b], instances: [], colliders: [collider(b)] }; // ponytail: placeholder = its own collider
}

export const details: Partial<Record<LandmarkId, DetailFn>> = {
  eiffel: (rec, _parts, ctx) => eiffel(rec, ctx.minGround - L.sink),
  arc: (rec, _parts, ctx) => arc(rec, ctx.minGround - L.sink),
};
