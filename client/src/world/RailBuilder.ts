// Leg 3 Hà Nội: the railway lines (Bắc–Nam / Hà Nội – Đồng Đăng lines out of Ga Hà Nội run along Lê Duẩn; chunk `rails`, scripts/build-rails.ts):
// a gravel bed, sleepers and two steel rails on the ground, one vertex-coloured 'masonry' bucket, no collider (the tracks are walked over).
// Pure builder (worker). Parts inside a carriageway (a level crossing: the road surface stays) or a building (the station shed) are skipped.
import { Color } from 'three';
import { railways as C, roads as R } from '../config.ts';
import type { ChunkData } from '../geo/chunkData.ts';
import type { Builder } from './buildTypes.ts';
import { MeshBuffer, type V3 } from './geom.ts';
import { roadWidth } from './RoadBuilder.ts';
import { inBuilding } from './StreetProps.ts';

const rgb = (hex: string): V3 => { const c = new Color(hex); return [c.r, c.g, c.b]; };
const COL = { gravel: rgb(C.colours.gravel), sleeper: rgb(C.colours.sleeper), rail: rgb(C.colours.rail) };

/** Signed distance from (x, z) to the nearest carriageway edge of the chunk's drivable roads (< 0 = on one). */
function toCarriageway(chunk: ChunkData, x: number, z: number) {
  let best = Infinity;
  for (const r of chunk.roads) {
    if (!(r.kind in R.widthByKind) || R.footKinds.includes(r.kind)) continue;
    const hw = roadWidth(r) / 2;
    for (let i = 0; i + 1 < r.pts.length / 2; i++) {
      const [x0, z0, x1, z1] = [r.pts[2 * i]!, r.pts[2 * i + 1]!, r.pts[2 * i + 2]!, r.pts[2 * i + 3]!];
      const l2 = (x1 - x0) ** 2 + (z1 - z0) ** 2;
      const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - x0) * (x1 - x0) + (z - z0) * (z1 - z0)) / l2)) : 0;
      best = Math.min(best, Math.hypot(x0 + t * (x1 - x0) - x, z0 + t * (z1 - z0) - z) - hw);
    }
  }
  return best;
}

export const buildRails: Builder = (chunk, ctx) => {
  const bed = new MeshBuffer('terrain'); // gravel
  const steel = new MeshBuffer('metal'); // rails
  const buf = new MeshBuffer('masonry'); // concrete sleepers
  if (!C.enabled || !chunk.rails?.length) return { meshes: [], instances: [], colliders: [] };
  /** Flat quad strip piece between two points: width w, top at y. */
  const strip = (m: MeshBuffer, a: readonly [number, number], b: readonly [number, number], nx: number, nz: number, off: number, w: number, ya: number, yb: number, colour: V3) => {
    m.color = colour;
    const [l, r] = [off - w / 2, off + w / 2];
    m.quad([a[0] + nx * l, ya, a[1] + nz * l], [b[0] + nx * l, yb, b[1] + nz * l], [b[0] + nx * r, yb, b[1] + nz * r], [a[0] + nx * r, ya, a[1] + nz * r]); // counter-clockwise seen from above
  };
  for (const piece of chunk.rails) {
    const p = piece.pts;
    const gauge = C.gauge;
    for (let i = 0; i + 1 < p.length / 2; i++) {
      const [ax, az, bx, bz] = [p[2 * i]!, p[2 * i + 1]!, p[2 * i + 2]!, p[2 * i + 3]!];
      const L = Math.hypot(bx - ax, bz - az);
      if (L < 0.1) continue;
      const [tx, tz] = [(bx - ax) / L, (bz - az) / L];
      const [nx, nz] = [tz, -tx]; // across the track
      const n = Math.max(1, Math.round(L / C.segment));
      for (let k = 0; k < n; k++) {
        const [s0, s1] = [(k / n) * L, ((k + 1) / n) * L];
        const [x0, z0, x1, z1] = [ax + tx * s0, az + tz * s0, ax + tx * s1, az + tz * s1];
        const [mx, mz] = [(x0 + x1) / 2, (z0 + z1) / 2];
        if (toCarriageway(chunk, mx, mz) < C.roadMargin || inBuilding(chunk, mx, mz)) continue;
        const [y0, y1] = [ctx.height(x0, z0) + C.lift, ctx.height(x1, z1) + C.lift];
        const [t0, t1] = [y0 + C.bedHeight, y1 + C.bedHeight]; // bed top
        strip(bed, [x0, z0], [x1, z1], nx, nz, 0, C.bedWidth, t0, t1, COL.gravel);
        for (const side of [-1, 1]) {
          const o = (side * gauge) / 2;
          strip(steel, [x0, z0], [x1, z1], nx, nz, o, C.railWidth, t0 + C.railRise, t1 + C.railRise, COL.rail); // head
          for (const e of [-1, 1]) { // the two flanks (seen from the side the head alone is a hairline)
            steel.color = COL.rail;
            const q = o + (e * C.railWidth) / 2;
            steel.quad([x0 + nx * q, t0, z0 + nz * q], [x1 + nx * q, t1, z1 + nz * q], [x1 + nx * q, t1 + C.railRise, z1 + nz * q], [x0 + nx * q, t0 + C.railRise, z0 + nz * q]);
            steel.quad([x1 + nx * q, t1, z1 + nz * q], [x0 + nx * q, t0, z0 + nz * q], [x0 + nx * q, t0 + C.railRise, z0 + nz * q], [x1 + nx * q, t1 + C.railRise, z1 + nz * q]);
          }
        }
        // concrete sleepers across the track every C.sleeperStep m (a slab on the bed)
        for (let s = Math.ceil(s0 / C.sleeperStep) * C.sleeperStep; s < s1; s += C.sleeperStep) {
          const [cx, cz] = [ax + tx * s, az + tz * s];
          const y = ctx.height(cx, cz) + C.lift + C.bedHeight + C.sleeperRise;
          strip(buf, [cx - (tx * C.sleeperLen) / 2, cz - (tz * C.sleeperLen) / 2], [cx + (tx * C.sleeperLen) / 2, cz + (tz * C.sleeperLen) / 2], nx, nz, 0, C.sleeperWidth, y, y, COL.sleeper);
        }
      }
    }
  }
  return { meshes: [bed, steel, buf].filter((m) => m.vertexCount).map((m) => m.bucket()), instances: [], colliders: [] };
};
