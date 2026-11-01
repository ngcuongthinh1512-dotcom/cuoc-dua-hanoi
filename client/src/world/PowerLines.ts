// Leg 3 Hà Nội: utility poles + tangled overhead cables derived from the road network (no OSM power data).
// Pure builder (runs in workers/chunkBuilder.worker.ts): one 'masonry' bucket (vertex-coloured: concrete poles, steel
// arms, near-black cables) + one trimesh of pole colliders. Every choice is hashed from world positions (geom.hash01), so
// both chunks sharing a street compute the same border pole; the chunk that holds it draws it, both draw their cable to it.
import { Color } from 'three';
import { powerLines as C, roads as R } from '../config.ts';
import { type BuildingRec, type ChunkData, chunkKey, type RoadRec } from '../geo/chunkData.ts';
import type { Builder, TriMesh } from './buildTypes.ts';
import { buildingHeight } from './BuildingBuilder.ts';
import { hash01, MeshBuffer, offsetPolyline, type V3 } from './geom.ts';
import { roadWidth } from './RoadBuilder.ts';
import { findJunctions, inBuilding, placeLamps } from './StreetProps.ts';

const SIDEWALK = R.lift + R.curbHeight;
const rgb = (hex: string): V3 => {
  const c = new Color(hex);
  return [c.r, c.g, c.b];
};
const COL = {
  concrete: C.colours.concrete.map(rgb),
  steel: rgb(C.colours.steel),
  insulator: rgb(C.colours.insulator),
  transformer: rgb(C.colours.transformer),
  cable: rgb(C.colours.cable),
  bundle: rgb(C.colours.bundle),
  lamp: rgb(C.colours.lamp),
};

export interface Pole {
  x: number;
  z: number;
  y: number; // foot (pavement top)
  h: number; // shaft height
  nx: number; // unit normal from the carriageway to the pole (across the street, pointing away from the road)
  nz: number;
  owned: boolean; // this chunk draws the pole (border poles are shared with the neighbour chunk)
}

const strHash = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};

/** Distance from (x, z) to the nearest carriageway edge of the chunk's roads of C.kinds + the car kinds (negative: on it). */
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

/** Point in a ring (bounding box first; StreetProps keeps its own copy private). */
function inRing(o: readonly number[], x: number, z: number) {
  let [minX, maxX, minZ, maxZ] = [Infinity, -Infinity, Infinity, -Infinity];
  for (let i = 0; i < o.length; i += 2) [minX, maxX, minZ, maxZ] = [Math.min(minX, o[i]!), Math.max(maxX, o[i]!), Math.min(minZ, o[i + 1]!), Math.max(maxZ, o[i + 1]!)];
  if (x < minX || x > maxX || z < minZ || z > maxZ) return false;
  let inside = false;
  for (let i = 0, j = o.length - 2; i < o.length; j = i, i += 2) {
    const [xi, zi, xj, zj] = [o[i]!, o[i + 1]!, o[j]!, o[j + 1]!];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/** The building whose outer ring holds (x, z), if any. */
function buildingAt(chunk: ChunkData, x: number, z: number): BuildingRec | undefined {
  return chunk.buildings.find((b) => inRing(b.outer, x, z));
}

/** Pole line of one road piece: every C.spacing m along the kerb on the street's hashed side, plus the shared border
 *  vertices (RoadRec.before / after) so the line continues into the neighbour chunk. Spots near junctions, landmarks,
 *  inside buildings or on a carriageway are dropped; spots on a StreetProps lamp slide along. */
export function placePoles(chunk: ChunkData, r: RoadRec, key: string, height: (x: number, z: number) => number, junctions: { x: number; z: number }[], lamps: { x: number; z: number }[]): Pole[] {
  const side = hash01(strHash(r.name ?? '') % 100000, r.name ? 0 : r.pts[0]! + r.pts[1]!, 71) < 0.5 ? 1 : -1;
  const off = roadWidth(r) / 2 + C.curbOffset;
  const line = offsetPolyline(r.pts, side * off, r.before, r.after);
  const n = r.pts.length / 2;
  const cand: { x: number; z: number; nx: number; nz: number; border: boolean }[] = [];
  const push = (x: number, z: number, tx: number, tz: number, border: boolean) => cand.push({ x, z, nx: tz * side, nz: -tx * side, border });
  let [next, s] = [C.spacing / 2, 0];
  for (let i = 0; i + 1 < n; i++) {
    const [x0, z0, x1, z1] = [r.pts[2 * i]!, r.pts[2 * i + 1]!, r.pts[2 * i + 2]!, r.pts[2 * i + 3]!];
    const len = Math.hypot(x1 - x0, z1 - z0);
    if (len < 1e-6) continue;
    const [tx, tz] = [(x1 - x0) / len, (z1 - z0) / len];
    if (i === 0 && r.before) push(line[0]!, line[1]!, tx, tz, true);
    for (; next <= s + len; next += C.spacing) {
      const a = next - s;
      push(x0 + tx * a + tz * side * off, z0 + tz * a - tx * side * off, tx, tz, false);
    }
    s += len;
    if (i === n - 2 && r.after) push(line[2 * n - 2]!, line[2 * n - 1]!, tx, tz, true);
  }
  const out: Pole[] = [];
  for (const c of cand) {
    let { x, z } = c;
    if (!c.border) {
      const lamp = lamps.find((l) => Math.hypot(l.x - x, l.z - z) < C.lampGap);
      if (lamp) [x, z] = [x - c.nz * C.lampShift, z + c.nx * C.lampShift]; // along the kerb
    }
    if (junctions.some((j) => Math.hypot(j.x - x, j.z - z) < C.junctionGap)) continue;
    if (toCarriageway(chunk, x, z) < 0.2 || inBuilding(chunk, x, z)) continue;
    const g = C.junctionGap;
    if (chunk.buildings.some((b) => b.landmark && [[0, 0], [g, 0], [-g, 0], [0, g], [0, -g]].some(([dx, dz]) => inRing(b.outer, x + dx!, z + dz!)))) continue;
    const h = C.height[0]! + (C.height[1]! - C.height[0]!) * hash01(x, z, 72);
    out.push({ x, z, y: height(x, z) + SIDEWALK, h, nx: c.nx, nz: c.nz, owned: chunkKey(x, z) === key });
  }
  return out;
}

/** Catenary-ish ribbon a → b (parabolic sag `sag` m), `w` m wide, tilted 45° between "up" and the across direction so it
 *  reads from the street and from above; both faces indexed over the same vertices. */
function cable(buf: MeshBuffer, a: V3, b: V3, sag: number, w: number, colour: V3, segments = C.segments) {
  buf.color = colour;
  const [dx, dy, dz] = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const l = Math.hypot(dx, dz) || 1e-6;
  const [tx, tz] = [dx / l, dz / l];
  const [nx, ny, nz] = [-tz * 0.7071, 0.7071, tx * 0.7071]; // 45° between up and across the run
  const [wx, wy, wz] = [-tz * ny, tz * nx - tx * nz, tx * ny]; // width direction = tangent × n
  const k = buf.vertexCount;
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const y = a[1] + dy * t - 4 * sag * t * (1 - t);
    const [x, z] = [a[0] + dx * t, a[2] + dz * t];
    buf.vertex(x + (wx * w) / 2, y + (wy * w) / 2, z + (wz * w) / 2, nx, ny, nz, t, 0);
    buf.vertex(x - (wx * w) / 2, y - (wy * w) / 2, z - (wz * w) / 2, nx, ny, nz, t, 1);
    if (i) {
      const [p, q, s, u] = [k + 2 * i - 2, k + 2 * i - 1, k + 2 * i, k + 2 * i + 1];
      buf.face(p, q, u), buf.face(p, u, s), buf.face(q, p, s), buf.face(q, s, u);
    }
  }
}

/** Axis-aligned-in-local-frame box: centre c, half sizes along the frame (ax = across the street, +Y, az = along). */
function box(buf: MeshBuffer, c: V3, ax: V3, az: V3, hx: number, hy: number, hz: number, colour: V3, top = true) {
  buf.color = colour;
  const P = (sx: number, sy: number, sz: number): V3 => [c[0] + ax[0] * sx * hx + az[0] * sz * hz, c[1] + sy * hy, c[2] + ax[2] * sx * hx + az[2] * sz * hz];
  const sides: [V3, V3, V3, V3][] = [
    [P(-1, -1, 1), P(1, -1, 1), P(1, 1, 1), P(-1, 1, 1)],
    [P(1, -1, -1), P(-1, -1, -1), P(-1, 1, -1), P(1, 1, -1)],
    [P(1, -1, 1), P(1, -1, -1), P(1, 1, -1), P(1, 1, 1)],
    [P(-1, -1, -1), P(-1, -1, 1), P(-1, 1, 1), P(-1, 1, -1)],
  ];
  if (top) sides.push([P(-1, 1, 1), P(1, 1, 1), P(1, 1, -1), P(-1, 1, -1)]);
  for (const [a, b, cc, d] of sides) {
    // winding: outward when the frame is right-handed (ax × az = ±Y); fix by checking the centre side
    const n = [(b[1] - a[1]) * (d[2] - a[2]) - (b[2] - a[2]) * (d[1] - a[1]), (b[2] - a[2]) * (d[0] - a[0]) - (b[0] - a[0]) * (d[2] - a[2]), (b[0] - a[0]) * (d[1] - a[1]) - (b[1] - a[1]) * (d[0] - a[0])];
    const outward = n[0]! * (a[0] - c[0]) + n[1]! * (a[1] - c[1]) + n[2]! * (a[2] - c[2]) > 0;
    if (outward) buf.quad(a, b, cc, d);
    else buf.quad(b, a, d, cc);
  }
}

/** Tapered hexagonal shaft + cap (16 tris). */
function shaft(buf: MeshBuffer, p: Pole, colour: V3) {
  buf.color = colour;
  const [r0, r1] = C.radius;
  const k = buf.vertexCount;
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3;
    const [cx, cz] = [Math.cos(a), Math.sin(a)];
    buf.vertex(p.x + cx * r0!, p.y - 0.3, p.z + cz * r0!, cx, 0, cz, i, 0);
    buf.vertex(p.x + cx * r1!, p.y + p.h, p.z + cz * r1!, cx, 0, cz, i, 1);
  }
  for (let i = 0; i < 6; i++) {
    const [b0, t0, b1, t1] = [k + 2 * i, k + 2 * i + 1, k + 2 * ((i + 1) % 6), k + 2 * ((i + 1) % 6) + 1];
    buf.face(b0, t1, t0), buf.face(b0, b1, t1);
  }
  for (let i = 1; i < 5; i++) buf.face(k + 1, k + 2 * i + 3, k + 2 * i + 1);
}

const POWER_Y = 0.45; // m below the pole top: cross-arm

/** Walks from (x, z) along (dx, dz) up to `reach` m; the first building hit and the point just outside its wall. */
function facade(chunk: ChunkData, x: number, z: number, dx: number, dz: number, reach: number) {
  for (let d = 0.5; d <= reach; d += 0.5) {
    const b = buildingAt(chunk, x + dx * d, z + dz * d);
    if (b) return { b, x: x + dx * (d - 0.4), z: z + dz * (d - 0.4), d };
  }
  return undefined;
}

/** Cable sample points inside a building taller than them: a cable that would pass through a house. */
function hitsBuilding(chunk: ChunkData, a: V3, b: V3, sag: number, ground: (x: number, z: number) => number) {
  for (let i = 1; i < 6; i++) {
    const t = i / 6;
    const [x, z, y] = [a[0] + (b[0] - a[0]) * t, a[2] + (b[2] - a[2]) * t, a[1] + (b[1] - a[1]) * t - 4 * sag * t * (1 - t)];
    const hit = buildingAt(chunk, x, z);
    if (hit && ground(x, z) + buildingHeight(hit) > y - 0.3) return true;
  }
  return false;
}

export const buildPowerLines: Builder = (chunk, ctx) => {
  if (!C.enabled) return { meshes: [], instances: [], colliders: [] };
  const buf = new MeshBuffer('masonry');
  const { points } = findJunctions(chunk, ctx.key);
  const lamps = placeLamps(chunk, points);
  const colV: number[] = [];
  const colI: number[] = [];
  const allPoles: Pole[] = [];

  for (const r of chunk.roads) {
    if (!C.kinds.includes(r.kind)) continue;
    const poles = placePoles(chunk, r, ctx.key, ctx.height, points, lamps);
    const w = roadWidth(r);
    const narrow = w < C.narrowWidth;
    const nPower = C.power[r.kind] ?? 2;
    const nTel = (C.telecom[r.kind] ?? 1) + (narrow ? C.narrowBonus : 0);
    const tangle = narrow ? 0.7 : 0.3;
    const arm = (p: Pole, s: number): V3 => [p.x + p.nx * s * (C.armLength / 2), p.y + p.h - POWER_Y, p.z + p.nz * s * (C.armLength / 2)];
    const tel = (p: Pole, k: number): V3 => {
      const d = C.telecomDrop[0]! + ((C.telecomDrop[1]! - C.telecomDrop[0]!) * (k + 0.5)) / Math.max(nTel, 1);
      return [p.x - p.nx * (C.radius[0]! + 0.04), p.y + p.h - d, p.z - p.nz * (C.radius[0]! + 0.04)];
    };

    // spans between consecutive poles of this piece
    for (let i = 0; i + 1 < poles.length; i++) {
      const [a, b] = [poles[i]!, poles[i + 1]!];
      const L = Math.hypot(b.x - a.x, b.z - a.z);
      if (L > C.maxSpan || L < 2) continue;
      const seed = (salt: number) => hash01((a.x + b.x) / 2, (a.z + b.z) / 2, salt);
      for (let k = 0; k < nPower; k++) {
        const s = k === 0 ? -1 : k === 1 ? 1 : 0;
        const top = (p: Pole): V3 => [p.x, p.y + p.h + 0.1, p.z]; // the third wire rides the pole top
        const [pa, pb] = s === 0 ? [top(a), top(b)] : [arm(a, s), arm(b, s)];
        const sag = C.sag * L * (0.7 + 0.8 * seed(80 + k));
        if (!hitsBuilding(chunk, pa, pb, sag, ctx.height)) cable(buf, pa, pb, sag, C.thickness.power, COL.cable);
      }
      for (let k = 0; k < nTel; k++) {
        const cross = seed(90 + k) < tangle ? (k + 1) % nTel : k; // bundles swapping heights between poles = the tangle
        const [pa, pb] = [tel(a, k), tel(b, cross)];
        const sag = C.sag * L * (0.9 + 0.8 * seed(100 + k));
        if (hitsBuilding(chunk, pa, pb, sag, ctx.height)) continue;
        cable(buf, pa, pb, sag, C.thickness.telecom * (0.8 + 0.5 * seed(110 + k)), COL.bundle);
        if (seed(120 + k) < 1 / C.spliceOneIn) {
          const t = 0.3 + 0.4 * seed(130 + k);
          const c: V3 = [pa[0] + (pb[0] - pa[0]) * t, pa[1] + (pb[1] - pa[1]) * t - 4 * sag * t * (1 - t) - 0.08, pa[2] + (pb[2] - pa[2]) * t];
          box(buf, c, [a.nx, 0, a.nz], [-a.nz, 0, a.nx], 0.07, 0.09, 0.16, COL.bundle);
        }
      }
    }

    for (const p of poles) {
      // crossing: 1–3 cables over the street to a facade on the other side (≥ minClearance over the carriageway)
      if (hash01(p.x, p.z, 73) < 1 / C.crossOneIn) {
        const f = facade(chunk, p.x - p.nx * (w + 2 * C.curbOffset), p.z - p.nz * (w + 2 * C.curbOffset), -p.nx, -p.nz, C.crossReach);
        if (f) {
          const bh = ctx.height(f.x, f.z) + buildingHeight(f.b);
          const n = 1 + Math.floor(hash01(p.x, p.z, 74) * 3);
          for (let k = 0; k < n; k++) {
            const yEnd = Math.min(bh - 0.4, p.y + p.h - 1.2 - 0.3 * k);
            const a: V3 = [p.x - p.nx * 0.1, p.y + p.h - 0.2 - 0.35 * k, p.z - p.nz * 0.1];
            const b: V3 = [f.x - p.nz * (k - 1) * 0.6, yEnd, f.z + p.nx * (k - 1) * 0.6];
            const Lc = Math.hypot(b[0] - a[0], b[2] - a[2]);
            const sag = C.sag * Lc * 0.8;
            if (Math.min(a[1], b[1]) - sag < ctx.height(p.x, p.z) + C.minClearance) continue;
            cable(buf, a, b, sag, k ? C.thickness.telecom * 0.8 : C.thickness.power, k ? COL.bundle : COL.cable, 4);
          }
        }
      }
      // service drop: pole → the facade behind it
      if (hash01(p.x, p.z, 75) < 1 / C.dropOneIn) {
        const f = facade(chunk, p.x, p.z, p.nx, p.nz, C.dropReach);
        if (f && f.d > 1) {
          const bh = ctx.height(f.x, f.z) + buildingHeight(f.b);
          const yEnd = Math.min(bh - 0.5, p.y + C.dropHeight[0]! + (C.dropHeight[1]! - C.dropHeight[0]!) * hash01(p.x, p.z, 76));
          if (yEnd > p.y + 3.5) {
            const a = tel(p, nTel - 1);
            cable(buf, a, [f.x, yEnd, f.z], 0.15, C.thickness.power, COL.cable, 3);
            if (hash01(p.x, p.z, 77) < 0.5) cable(buf, [a[0], a[1] - 0.25, a[2]], [f.x - p.nz * 0.5, yEnd - 0.3, f.z + p.nx * 0.5], 0.2, C.thickness.power, COL.cable, 3);
          }
        }
      }
      if (!p.owned) continue;
      allPoles.push(p);
      // the pole itself
      shaft(buf, p, COL.concrete[Math.floor(hash01(p.x, p.z, 78) * COL.concrete.length)]!);
      const ax: V3 = [p.nx, 0, p.nz];
      const az: V3 = [-p.nz, 0, p.nx];
      box(buf, [p.x, p.y + p.h - POWER_Y, p.z], ax, az, C.armLength / 2, 0.045, 0.045, COL.steel, false);
      const nIns = C.insulators[0]! + Math.floor(hash01(p.x, p.z, 79) * (C.insulators[1]! - C.insulators[0]! + 1));
      for (let k = 0; k < nIns; k++) {
        const s = nIns === 1 ? 0 : -1 + (2 * k) / (nIns - 1);
        box(buf, [p.x + p.nx * s * (C.armLength / 2 - 0.08), p.y + p.h - POWER_Y + 0.13, p.z + p.nz * s * (C.armLength / 2 - 0.08)], ax, az, 0.06, 0.09, 0.06, COL.insulator);
      }
      if (hash01(p.x, p.z, 81) < 1 / C.transformerOneIn) {
        box(buf, [p.x + p.nx * 0.55, p.y + p.h - 2.6, p.z + p.nz * 0.55], ax, az, 0.4, 0.55, 0.32, COL.transformer);
      }
      if (hash01(p.x, p.z, 82) < 1 / C.lightOneIn && !lamps.some((l) => Math.hypot(l.x - p.x, l.z - p.z) < C.lightClear)) {
        const y = p.y + p.h - 1.0;
        box(buf, [p.x - p.nx * 0.9, y + 0.15, p.z - p.nz * 0.9], ax, az, 0.9, 0.03, 0.03, COL.steel, false);
        box(buf, [p.x - p.nx * 1.75, y, p.z - p.nz * 1.75], ax, az, 0.3, 0.09, 0.14, COL.lamp);
      }
      // collider: hexagonal prism (props.colliders.lamp style), sunk 0.3 m
      const k = colV.length / 3;
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3;
        const [x, z] = [p.x + Math.cos(a) * C.collider.radius, p.z + Math.sin(a) * C.collider.radius];
        colV.push(x, p.y - 0.3, z, x, p.y + C.collider.height, z);
      }
      for (let i = 0; i < 6; i++) {
        const [b0, t0, b1, t1] = [k + 2 * i, k + 2 * i + 1, k + 2 * ((i + 1) % 6), k + 2 * ((i + 1) % 6) + 1];
        colI.push(b0, t0, t1, b0, t1, b1);
      }
      for (let i = 1; i < 5; i++) colI.push(k + 1, k + 2 * i + 1, k + 2 * i + 3);
    }
  }
  const col: TriMesh = { vertices: new Float32Array(colV), indices: new Uint32Array(colI) };
  return { meshes: [buf.bucket()], instances: [], colliders: colI.length ? [col] : [] };
};
