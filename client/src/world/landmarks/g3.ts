// Group g3: Louvre, pyramid, Carrousel, Palais-Royal, Concorde (obelisk + 2 fountains), Vendôme, Madeleine, Opéra
// (docs/plans/phase2b-assets.md §1 #5, #10, #13–16, #25). Owned by the g3 agent.
// Phase 2 placeholders until then (moved from world/Landmarks.ts): glass pyramid, obelisk on its pedestal.
import { landmarks as L } from '../../config.ts';
import type { BuildingRec, LandmarkId } from '../../geo/chunkData.ts';
import { MeshBuffer, type V3 } from '../geom.ts';
import type { DetailFn } from './index.ts';
import { box, collider, footprintFrame, loft, place, quadOut, square, triOut } from './kit.ts';

function pyramid(rec: BuildingRec, y0: number) {
  const f = footprintFrame(rec.outer);
  const h = rec.height ?? L.pyramidHeight;
  const glass = new MeshBuffer('glass');
  const base = square(f.a, 0, 0, 0, f.b);
  const apex: V3 = [0, h, 0];
  const solid = new MeshBuffer('glass');
  for (let i = 0; i < 4; i++) {
    const [a, b] = [base[i]!, base[(i + 1) % 4]!];
    const len = Math.hypot(b[0] - a[0], b[2] - a[2]);
    const slant = Math.hypot(h, Math.hypot((a[0] + b[0]) / 2, (a[2] + b[2]) / 2));
    const out: V3 = [(a[0] + b[0]) / 2, h / 3, (a[2] + b[2]) / 2];
    const g = L.glassTile;
    triOut(glass, a, b, apex, out, [0, 0, len / g, 0, len / (2 * g), slant / g]);
    triOut(solid, a, b, apex, out);
  }
  quadOut(solid, ...(base as [V3, V3, V3, V3]), [0, -1, 0]);
  return { meshes: [place(glass.bucket(), f, y0)], instances: [], colliders: [collider(place(solid.bucket(), f, y0))] };
}

function obelisk(rec: BuildingRec, y0: number) {
  const f = footprintFrame(rec.outer);
  const total = rec.height ?? L.obeliskHeight;
  const shaft = Math.min(L.obeliskShaft, total);
  const ped = total - shaft; // pedestal (0 when OSM has no height)
  const s = Math.max(f.a, 1.5);
  const buf = new MeshBuffer('stone');
  if (ped > 0) {
    box(buf, -s - 0.6, s + 0.6, 0, Math.min(1.2, ped), -s - 0.6, s + 0.6);
    box(buf, -s, s, 0, ped, -s, s);
  }
  const pyr = ped + shaft - 1.6;
  loft(buf, [square(1.25, ped), square(0.8, pyr)]);
  for (let i = 0; i < 4; i++) {
    const r = square(0.8, pyr);
    const [a, b] = [r[i]!, r[(i + 1) % 4]!];
    triOut(buf, a, b, [0, ped + shaft, 0], [(a[0] + b[0]) / 2, 0.5, (a[2] + b[2]) / 2]);
  }
  const b = place(buf.bucket(), f, y0);
  return { meshes: [b], instances: [], colliders: [collider(b)] }; // ponytail: placeholder = its own collider
}

export const details: Partial<Record<LandmarkId, DetailFn>> = {
  pyramid: (rec, _parts, ctx) => pyramid(rec, ctx.minGround - L.sink),
  obelisk: (rec, _parts, ctx) => obelisk(rec, ctx.minGround - L.sink),
};
