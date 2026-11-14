// Leg 3 Hà Nội: pavement terraces of the street (quán vỉa hè): low plastic stools (ghế nhựa) round a low table, sometimes under a
// parasol, standing in front of a facade. Pure builder (worker): one vertex-coloured 'masonry' bucket, no collider (stools are
// knee-high, the player walks through). Placement like placeMotos (StreetProps): along the street, on the pavement, in front of a
// building, away from lamps / trees. Every choice hashed from world positions, so the result is stable per chunk.
import { Color } from 'three';
import { roads as R, streetStools as S } from '../config.ts';
import type { Builder } from './buildTypes.ts';
import { hash01, MeshBuffer, type V3 } from './geom.ts';
import { roadWidth, sidewalkWidth } from './RoadBuilder.ts';
import { along, free, inBuilding } from './StreetProps.ts';

const SIDEWALK = R.lift + R.curbHeight;
const rgb = (hex: string): V3 => {
  const c = new Color(hex);
  return [c.r, c.g, c.b];
};
const STOOL = S.stoolColours.map(rgb);
const TABLE = S.tableColours.map(rgb);
const PARASOL = S.parasolColours.map(rgb);
const POLE = rgb('#9a9a96');

/** Axis-aligned-in-frame box from y0 to y1, half sizes hx (across) / hz (along) about (cx, cz); frame (ax, az) unit vectors. */
function box(b: MeshBuffer, cx: number, cz: number, y0: number, y1: number, hx: number, hz: number, ax: V3, az: V3, colour: V3) {
  b.color = colour;
  const P = (sx: number, sy: number, sz: number): V3 => [cx + ax[0] * sx * hx + az[0] * sz * hz, sy ? y1 : y0, cz + ax[2] * sx * hx + az[2] * sz * hz];
  // four sides + top; wound counter-clockwise seen from outside (frame right-handed: ax × az = −Y or +Y is fixed by the check below)
  const sides: [V3, V3, V3, V3][] = [
    [P(-1, 0, 1), P(1, 0, 1), P(1, 1, 1), P(-1, 1, 1)],
    [P(1, 0, -1), P(-1, 0, -1), P(-1, 1, -1), P(1, 1, -1)],
    [P(1, 0, 1), P(1, 0, -1), P(1, 1, -1), P(1, 1, 1)],
    [P(-1, 0, -1), P(-1, 0, 1), P(-1, 1, 1), P(-1, 1, -1)],
    [P(-1, 1, 1), P(1, 1, 1), P(1, 1, -1), P(-1, 1, -1)],
  ];
  const c: V3 = [cx, (y0 + y1) / 2, cz];
  for (const [a, bq, cc, d] of sides) {
    const n = [(bq[1] - a[1]) * (d[2] - a[2]) - (bq[2] - a[2]) * (d[1] - a[1]), (bq[2] - a[2]) * (d[0] - a[0]) - (bq[0] - a[0]) * (d[2] - a[2]), (bq[0] - a[0]) * (d[1] - a[1]) - (bq[1] - a[1]) * (d[0] - a[0])];
    const outward = n[0]! * (a[0] - c[0]) + n[1]! * (a[1] - c[1]) + n[2]! * (a[2] - c[2]) > 0;
    if (outward) b.quad(a, bq, cc, d);
    else b.quad(bq, a, d, cc);
  }
}

/** Four-sided parasol canopy (pyramid) on a pole at (cx, cz). */
function parasol(b: MeshBuffer, cx: number, cz: number, y: number, colour: V3, ax: V3, az: V3) {
  const [r, h] = [S.parasol.radius, S.parasol.height];
  box(b, cx, cz, y, y + h, 0.025, 0.025, ax, az, POLE);
  b.color = colour;
  const apex: V3 = [cx, y + h + 0.28, cz];
  const corner = (sx: number, sz: number): V3 => [cx + ax[0] * sx * r + az[0] * sz * r, y + h, cz + ax[2] * sx * r + az[2] * sz * r];
  const cs = [corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)];
  for (let i = 0; i < 4; i++) {
    const [p, q] = [cs[i]!, cs[(i + 1) % 4]!];
    b.tri(p, q, apex); // one side, seen from outside / above
    b.tri(q, p, apex); // and from below (the underside is seen from the seats)
  }
}

export const buildStools: Builder = (chunk, ctx) => {
  const buf = new MeshBuffer('masonry');
  if (!S.enabled) return { meshes: [], instances: [], colliders: [] };
  for (const r of chunk.roads) {
    const sw = sidewalkWidth(r);
    if (!S.kinds.includes(r.kind) || sw < S.minSidewalk) continue;
    const off = roadWidth(r) / 2 + sw - S.fromFacade;
    along(r, S.step, S.step * 0.7, (x, z, tx, tz) => {
      for (const side of [1, -1]) {
        const [nx, nz] = [tz * side, -tx * side]; // from the street axis out to this side's pavement
        const [cx, cz] = [x + nx * off, z + nz * off];
        const h = hash01(cx, cz, 201);
        if (h >= S.share || !inBuilding(chunk, cx + nx * (S.fromFacade + 1.2), cz + nz * (S.fromFacade + 1.2))) continue;
        if (!free(chunk, cx, cz, 0.9, 0.5)) continue;
        const ax: V3 = [nx, 0, nz]; // across the pavement
        const az: V3 = [-nz, 0, nx]; // along the street
        const y = ctx.height(cx, cz) + SIDEWALK;
        // low table
        box(buf, cx, cz, y + 0.34, y + 0.38, 0.28, 0.28, ax, az, TABLE[Math.floor(hash01(cx, cz, 202) * TABLE.length)]!);
        box(buf, cx, cz, y, y + 0.34, 0.04, 0.04, ax, az, POLE);
        // 3–5 stools round it (a stool = a 0.3 m seat on a short base, in a mix of the classic plastic colours)
        const n = S.stools[0]! + Math.floor(hash01(cx, cz, 203) * (S.stools[1]! - S.stools[0]! + 1));
        const base = hash01(cx, cz, 204) * Math.PI * 2;
        for (let i = 0; i < n; i++) {
          const a = base + (i / n) * Math.PI * 2 + (hash01(cx, cz, 205 + i) - 0.5) * 0.5;
          const d = 0.5 + 0.12 * hash01(cx, cz, 215 + i);
          const [sx, sz] = [cx + Math.cos(a) * d * ax[0] + Math.sin(a) * d * az[0], cz + Math.cos(a) * d * ax[2] + Math.sin(a) * d * az[2]];
          const col = STOOL[Math.floor(hash01(sx, sz, 225) * STOOL.length)]!;
          box(buf, sx, sz, y + 0.24, y + 0.28, 0.15, 0.15, ax, az, col); // seat
          box(buf, sx, sz, y, y + 0.24, 0.1, 0.1, ax, az, col); // legs / base
        }
        if (hash01(cx, cz, 206) < S.parasolShare) parasol(buf, cx + ax[0] * 0.1, cz + ax[2] * 0.1, y, PARASOL[Math.floor(hash01(cx, cz, 207) * PARASOL.length)]!, ax, az);
      }
    });
  }
  return { meshes: buf.vertexCount ? [buf.bucket()] : [], instances: [], colliders: [] };
};
