// Group g1: Eiffel Tower, Arc de Triomphe (docs/plans/phase2b-assets.md §1 #1, #4). Both are downloaded models
// (scripts/process-assets.ts → public/models/*.glb) placed on the main thread by models.ts when their chunk attaches;
// the chunk builder only adds their simplified colliders (SPEC §5.9) in the same pose (modelPose), plus the Arc's
// Tomb of the Unknown Soldier (near LOD):
//   Eiffel: the 4 legs up to the 1st platform (the area under the tower stays walkable, SPEC §17.4); its OSM parts are
//           never extruded (they would close the space under the tower), only its numbers are used (config g1.eiffel).
//   Arc:    4 piers + attic + transverse lintels, both arch passages open.
import { graphics8c as G8, landmarks as L } from '../../config.ts';
import type { BuildingRec, LandmarkId } from '../../geo/chunkData.ts';
import type { BuildOut, MaterialId } from '../buildTypes.ts';
import { MeshBuffer, type V3 } from '../geom.ts';
import { flamme } from './g2.ts';
import type { DetailFn } from './index.ts';
import { box, collider, footprintFrame, loft, place, square } from './kit.ts';
import { parseColour } from './parts.ts';

const G = L.g1;

/** Model pose on its OSM outline: centre, ground y, yaw (THREE rotation.y: local +x → frame u), xz scale; the frame's
 *  u flipped when needed so local +z points toward the Concorde (Arc: the east face looks down the Champs-Élysées). */
export function modelPose(rec: BuildingRec, minGround: number, id: 'eiffel' | 'arc' | 'flamme') {
  const f = footprintFrame(rec.outer);
  const flip = id === 'arc' && -f.uz * -f.cx + f.ux * -f.cz < 0;
  const [ux, uz] = flip ? [-f.ux, -f.uz] : [f.ux, f.uz];
  const scale = id === 'eiffel' ? (f.a + f.b) / 2 / G.eiffel.halfBase : 1; // Arc: real size (the OSM outline is ~10 % larger)
  // Flamme (Phase 8C): the scan sits on its round paving, a hair below the lowest ground (scaled to the outline by
  // scripts/assets/flamme.ts); a round outline has no meaningful axis, the frame's is as good as any
  const y = minGround - (id === 'flamme' ? G8.flamme.sink : G.sink);
  return { frame: { ...f, ux, uz }, x: f.cx, y, z: f.cz, yaw: Math.atan2(-uz, ux), scale };
}

const empty = (): BuildOut => ({ meshes: [], instances: [], colliders: [] });

/** The 4 Eiffel legs from the ground to the 1st platform, placed (collider; with 'metal', the fallback's visible legs). */
export function eiffelLegs(rec: BuildingRec, minGround: number, material: MaterialId = 'stone') {
  const p = modelPose(rec, minGround, 'eiffel');
  const legs = new MeshBuffer(material);
  legs.color = parseColour(G.eiffel.colour)!;
  for (const [sx, sz] of [[1, 1], [-1, 1], [-1, -1], [1, -1]] as const) {
    loft(legs, G.eiffelLegs.map(([y, s, w]): V3[] => square(w! / 2, y!, sx * (s! - w! / 2), sz * (s! - w! / 2))));
  }
  return place(legs.bucket(), p.frame, p.y, p.scale, 1, p.scale);
}

function arc(rec: BuildingRec, minGround: number, height: (x: number, z: number) => number): BuildOut {
  const p = modelPose(rec, minGround, 'arc');
  const A = G.arc;
  const [W, D, H] = [A.halfWidth, A.halfDepth, A.height];
  const [[mainH, m], [sideH, t]] = [A.mainArch, A.sideArch] as [[number, number], [number, number]];
  const b = new MeshBuffer('stone');
  for (const sx of [-1, 1]) {
    const [x0, x1] = sx > 0 ? [m, W] : [-W, -m];
    box(b, x0, x1, 0, H, t, D);
    box(b, x0, x1, 0, H, -D, -t);
    box(b, x0, x1, sideH, mainH, -t, t); // over the transverse passage
  }
  box(b, -W, W, mainH, H, -D, D); // attic over the main arch
  // Tomb of the Unknown Soldier (1921) in the middle of the main passage: granite slab, bronze rosette at its
  // Champs-Élysées end. ponytail: no flame (needs an emissive / animated material), add with the Phase 5 effects.
  const T = A.tomb;
  const y0 = height(p.x, p.z) - p.y; // terrain under the arch, in the model frame
  const slab = new MeshBuffer('masonry');
  slab.color = parseColour(T.granite)!;
  box(slab, -T.halfWidth, T.halfWidth, y0, y0 + T.height, -T.halfLength, T.halfLength);
  const bronze = new MeshBuffer('bronze');
  const rz = T.halfLength + T.rosette;
  box(bronze, -T.rosette, T.rosette, y0, y0 + T.height, rz - T.rosette, rz + T.rosette);
  const near = [slab, bronze].map((q) => place(q.bucket('near'), p.frame, p.y));
  return { ...empty(), meshes: near, colliders: [collider(place(b.bucket(), p.frame, p.y))] };
}

export const details: Partial<Record<LandmarkId, DetailFn>> = {
  eiffel: (rec, _parts, ctx) => ({ ...empty(), colliders: [collider(eiffelLegs(rec, ctx.minGround))] }),
  arc: (rec, _parts, ctx) => arc(rec, ctx.minGround, ctx.height),
  // Phase 8C: the Flamme scan (models.ts) is drawn on the main thread; the worker keeps g2's pedestal collider only
  ...(G8.flamme.enabled ? { flamme: (rec: BuildingRec, _parts: unknown, ctx: { minGround: number }) => ({ ...empty(), colliders: flamme(rec, ctx).colliders }) } : {}),
};
