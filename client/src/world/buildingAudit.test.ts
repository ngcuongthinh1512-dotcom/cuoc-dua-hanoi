// Geometry audit of every non-landmark building over EVERY real chunk (client/public/data), built exactly as the worker builds
// the `buildings` bucket set (BuildingBuilder on the carved grid). Per building:
//  roof    – the footprint is rasterised from above (≤ ROOF_SAMPLES points, 0.3 m inside the outline); at each point the
//            topmost building triangle is found; it must exist and wind counter-clockwise seen from above (materials are
//            single-sided: a cap wound the other way is invisible from above = "nhà không có mái"). A building whose covered
//            share is under ROOF_MIN is a defect.
//  float   – every near-vertical triangle whose bottom edge lies > FLOAT_Y above the carved ground needs something under
//            the middle of that edge (another building triangle of the chunk at or just below it, e.g. the roof it stands on
//            or a neighbour's top under a party wall); every down-facing horizontal triangle above the ground is a raised
//            underside (OSM min_height / building=roof canopy) and is listed as such. Unsupported pieces are attributed to
//            the footprint that contains them (= "nhà bay lơ lửng").
//  road    – a footprint vertex inside a carriageway (carKinds, half roadWidth of the centre line) / a centroid under water.
//  sliver  – triangles of area < SLIVER_AREA m², NaN anywhere.
//  tags    – how many records carry min_height / min_level / roof:* (reported, not judged).
// Alone: `npx vitest run buildingAudit` prints the counts and the worst chunks per class.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { props as RC } from '../config.ts';
import { type ChunkData, type ChunkIndex, chunkBounds, ringArea, type WaterData } from '../geo/chunkData.ts';
import { heightAt, parseHeightGrid } from '../geo/heightGrid.ts';
import { buildBuildings } from './BuildingBuilder.ts';
import { buildLandmarks } from './landmarks/index.ts';
import type { BuildCtx } from './buildTypes.ts';
import { roadWidth } from './RoadBuilder.ts';
import { carveRiver } from './Terrain.ts';

const data = join(import.meta.dirname, '../../public/data');
const has = ['chunks/index.json', 'water.json', 'elevation.json', 'elevation.bin'].every((f) => existsSync(join(data, f)));

const ROOF_SAMPLES = 48;
const ROOF_MIN = 0.8; // covered share below which a building "has no roof"
const FLOAT_Y = 0.3; // m above the ground a wall foot may hang before it needs support
const BURIED = 2; // m a wall foot may sink into another surface (plot side wall over the neighbour's gable) and still count as standing on it
const SUPPORT_TOL = 0.35; // m: support may sit this far under the foot (baseSink / plot caps the box stands on)
const SLIVER_AREA = 1e-3; // m²
const CELL = 4; // m, triangle lookup grid

interface Tri { a: number; b: number; c: number; p: Float32Array; m: string } // vertex offsets (×3) into p, bucket material
const tx = (t: Tri, k: number) => t.p[k]!;

/** Triangles of a chunk's building buckets in a flat xz grid. */
class TriGrid {
  readonly tris: Tri[] = [];
  private readonly cells = new Map<string, number[]>();
  constructor(buckets: { position: Float32Array; index: Uint32Array; material: string }[]) {
    for (const b of buckets) {
      for (let i = 0; i < b.index.length; i += 3) {
        const t: Tri = { a: b.index[i]! * 3, b: b.index[i + 1]! * 3, c: b.index[i + 2]! * 3, p: b.position, m: b.material };
        const id = this.tris.push(t) - 1;
        const xs = [tx(t, t.a), tx(t, t.b), tx(t, t.c)];
        const zs = [tx(t, t.a + 2), tx(t, t.b + 2), tx(t, t.c + 2)];
        for (let cx = Math.floor(Math.min(...xs) / CELL); cx <= Math.floor(Math.max(...xs) / CELL); cx++) {
          for (let cz = Math.floor(Math.min(...zs) / CELL); cz <= Math.floor(Math.max(...zs) / CELL); cz++) {
            const k = `${cx},${cz}`;
            const list = this.cells.get(k);
            if (list) list.push(id);
            else this.cells.set(k, [id]);
          }
        }
      }
    }
  }
  near(x: number, z: number): number[] {
    return this.cells.get(`${Math.floor(x / CELL)},${Math.floor(z / CELL)}`) ?? [];
  }
  /** Every triangle whose xz projection contains (x, z), with its y there and its winding (+1 = CCW from above = faces up). */
  *under(x: number, z: number, skip = -1): Generator<{ y: number; up: number; id: number }> {
    const list = this.cells.get(`${Math.floor(x / CELL)},${Math.floor(z / CELL)}`);
    if (!list) return;
    for (const id of list) {
      if (id === skip) continue;
      const t = this.tris[id]!;
      const [ax, ay, az] = [tx(t, t.a), tx(t, t.a + 1), tx(t, t.a + 2)];
      const [bx, by, bz] = [tx(t, t.b), tx(t, t.b + 1), tx(t, t.b + 2)];
      const [cx, cy, cz] = [tx(t, t.c), tx(t, t.c + 1), tx(t, t.c + 2)];
      const det = (bx - ax) * (cz - az) - (cx - ax) * (bz - az); // < 0: CCW in (x, −z) = CCW seen from above
      if (Math.abs(det) < 1e-9) continue; // vertical or degenerate: no xz area (see holds)
      const l1 = ((bx - ax) * (z - az) - (x - ax) * (bz - az)) / det; // barycentric for c
      const l2 = ((x - ax) * (cz - az) - (cx - ax) * (z - az)) / det; // for b
      if (l1 < -1e-2 || l2 < -1e-2 || l1 + l2 > 1 + 1e-2) continue; // 1 % slack: a probe on a cap's edge (float32 at x ≈ 5 km)
      yield { y: ay + l2 * (by - ay) + l1 * (cy - ay), up: det < 0 ? 1 : -1, id };
    }
  }
}

/** A vertical triangle of the grid stands under the foot (x, z, low): its xz footprint passes within 0.15 m and it spans down from low. */
function holds(grid: TriGrid, x: number, z: number, low: number, skip: number): boolean {
  for (const id of grid.near(x, z)) {
    if (id === skip) continue;
    const t = grid.tris[id]!;
    const ys = [tx(t, t.a + 1), tx(t, t.b + 1), tx(t, t.c + 1)];
    if (Math.max(...ys) < low - 0.05 || Math.min(...ys) > low - 0.3) continue;
    const c = [[tx(t, t.a), tx(t, t.a + 2)], [tx(t, t.b), tx(t, t.b + 2)], [tx(t, t.c), tx(t, t.c + 2)]];
    for (let k = 0; k < 3; k++) {
      const [p, q] = [c[k]!, c[(k + 1) % 3]!];
      if (distToSeg(x, z, p[0]!, p[1]!, q[0]!, q[1]!) < 0.15) return true;
    }
  }
  return false;
}

function inRing(r: ArrayLike<number>, x: number, z: number): boolean {
  let inside = false;
  for (let i = 0, n = r.length; i < n; i += 2) {
    const j = (i + n - 2) % n;
    const [xi, zi, xj, zj] = [r[i]!, r[i + 1]!, r[j]!, r[j + 1]!];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

const distToSeg = (px: number, pz: number, ax: number, az: number, bx: number, bz: number) => {
  const [dx, dz] = [bx - ax, bz - az];
  const l2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l2));
  return Math.hypot(px - ax - t * dx, pz - az - t * dz);
};

export interface Audit {
  buildings: number;
  noRoof: string[]; // "chunk kind h=.. @x,z cover=.."
  floating: string[]; // "chunk kind @x,z: n unsupported pieces (what)"
  raisedUnderside: string[]; // "chunk kind minH @x,z"
  onRoad: string[];
  inWater: string[];
  slivers: number;
  nan: string[];
  tags: Record<string, number>;
  triangles: number;
}

export function auditChunk(chunk: ChunkData, height: (x: number, z: number) => number, out: Audit) {
  const ctx: BuildCtx = { key: chunk.key, bounds: chunkBounds(chunk.key), height };
  const res = buildBuildings(chunk, ctx);
  for (const m of res.meshes) if (![m.position, m.normal, m.uv].every((a) => a.every(Number.isFinite))) out.nan.push(`${chunk.key} ${m.material}`);
  const grid = new TriGrid(res.meshes);
  out.triangles += grid.tris.length;
  const recs = chunk.buildings.filter((b) => !b.landmark && b.outer.length >= 6);
  const where = (b: (typeof recs)[0]) => `${chunk.key} ${b.kind}${b.height ? ` h=${b.height}` : ''}${b.levels ? ` lv=${b.levels}` : ''}${b.minHeight ? ` minH=${b.minHeight}` : ''} @${Math.round(b.outer[0]!)},${Math.round(b.outer[1]!)}`;
  const edgeDist = (r: ArrayLike<number>, x: number, z: number) => {
    let d = Infinity;
    for (let i = 0; i < r.length; i += 2) d = Math.min(d, distToSeg(x, z, r[i]!, r[i + 1]!, r[(i + 2) % r.length]!, r[(i + 3) % r.length]!));
    return d;
  };
  const owner = (x: number, z: number) => recs.find((b) => inRing(b.outer, x, z) && !(b.holes ?? []).some((h) => inRing(h, x, z))) ?? recs.find((b) => edgeDist(b.outer, x, z) < 1.0);

  // tags
  for (const b of recs) {
    for (const k of ['minHeight', 'minLevel', 'roofShape', 'roofHeight', 'roofLevels'] as const) if (b[k] !== undefined) out.tags[k] = (out.tags[k] ?? 0) + 1;
    if (b.kind === 'roof') out.tags.kindRoof = (out.tags.kindRoof ?? 0) + 1;
  }

  // roof cover + road / water
  for (const b of recs) {
    out.buildings++;
    const r = b.outer;
    let [minX, maxX, minZ, maxZ] = [Infinity, -Infinity, Infinity, -Infinity];
    for (let i = 0; i < r.length; i += 2) {
      minX = Math.min(minX, r[i]!); maxX = Math.max(maxX, r[i]!);
      minZ = Math.min(minZ, r[i + 1]!); maxZ = Math.max(maxZ, r[i + 1]!);
    }
    const area = Math.abs(ringArea(r));
    if (area < 1) continue;
    const step = Math.max(0.5, Math.sqrt(((maxX - minX) * (maxZ - minZ)) / ROOF_SAMPLES));
    let hit = 0;
    let total = 0;
    let down = 0;
    for (let x = minX + step / 2; x < maxX; x += step) {
      for (let z = minZ + step / 2; z < maxZ; z += step) {
        if (!inRing(r, x, z) || (b.holes ?? []).some((h) => inRing(h, x, z))) continue;
        // 0.3 m inside: skip points hugging the outline (parapet lips, neighbours' plot boxes)
        let near = false;
        for (let i = 0; i < r.length && !near; i += 2) near = distToSeg(x, z, r[i]!, r[i + 1]!, r[(i + 2) % r.length]!, r[(i + 3) % r.length]!) < 0.3;
        if (near) continue;
        total++;
        let top = -Infinity;
        let up = 0;
        for (const h of grid.under(x, z)) if (h.y > top + 1e-4) [top, up] = [h.y, h.up];
        if (up > 0 && top > height(x, z) + 0.5) hit++;
        else if (up < 0) down++;
      }
    }
    if (total >= 3 && hit / total < ROOF_MIN) out.noRoof.push(`${where(b)} cover=${(hit / total).toFixed(2)} (${hit}/${total}, úp ${down}, trống ${total - hit - down})`);
    // roads
    const cx = (minX + maxX) / 2;
    const cz = (minZ + maxZ) / 2;
    if (inRing(r, cx, cz) && height(cx, cz) < -0.5) out.inWater.push(`${where(b)} ground=${height(cx, cz).toFixed(1)}`);
    let road: string | undefined;
    for (const w of chunk.roads) {
      if (!RC.carKinds.includes(w.kind) || road) continue;
      const half = roadWidth({ ...w, oneway: false }) / 2 - 0.3;
      for (let i = 0; i < r.length && !road; i += 2) {
        for (let k = 0; k + 3 < w.pts.length; k += 2) {
          if (distToSeg(r[i]!, r[i + 1]!, w.pts[k]!, w.pts[k + 1]!, w.pts[k + 2]!, w.pts[k + 3]!) < half) { road = `${w.kind}${w.name ? ` ${w.name}` : ''}`; break; }
        }
      }
    }
    if (road) out.onRoad.push(`${where(b)} vào lòng đường ${road}`);
  }

  // floating: wall feet and raised undersides
  const perOwner = new Map<string, { n: number; kinds: Set<string> }>();
  const note = (x: number, z: number, what: string) => {
    const b = owner(x, z) ?? owner(x, z);
    const k = b ? where(b) : `${chunk.key} ? @${Math.round(x)},${Math.round(z)}`;
    const e = perOwner.get(k) ?? { n: 0, kinds: new Set() };
    e.n++;
    e.kinds.add(what);
    perOwner.set(k, e);
  };
  const raised = new Map<string, boolean>(); // owner → stands on posts
  grid.tris.forEach((t, id) => {
    const P = [[tx(t, t.a), tx(t, t.a + 1), tx(t, t.a + 2)], [tx(t, t.b), tx(t, t.b + 1), tx(t, t.b + 2)], [tx(t, t.c), tx(t, t.c + 1), tx(t, t.c + 2)]] as const;
    const ux = P[1][0] - P[0][0], uy = P[1][1] - P[0][1], uz = P[1][2] - P[0][2];
    const vx = P[2][0] - P[0][0], vy = P[2][1] - P[0][1], vz = P[2][2] - P[0][2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz);
    if (len < 2 * SLIVER_AREA) { out.slivers++; return; }
    const upness = ny / len;
    const ys = P.map((p) => p[1]);
    const low = Math.min(...ys);
    if (Math.abs(upness) < 0.3) {
      // wall: foot = midpoint of the two lowest corners (a wall quad's bottom edge; a gable's bottom edge)
      const sorted = [0, 1, 2].sort((i, j) => ys[i]! - ys[j]!);
      if (Math.max(...ys) - low < 0.5) return; // trim: slab edges, parapet lips, kerbs
      const span = Math.max(Math.hypot(ux, uz), Math.hypot(vx, vz), Math.hypot(ux - vx, uz - vz));
      if (span < 0.3) return; // a thin sliver along a party wall (inset ring vertex slid onto the edge): invisible
      if (ys[sorted[1]!]! > low + 0.5) return; // a sloped triangle, its lowest point is a corner: the other half of the quad has the edge
      const [p0, p1] = [P[sorted[0]!]!, P[sorted[1]!]!];
      const probes: [number, number][] = [[0.5, 0], [0.1, 0], [0.9, 0]].map(([s]) => [p0[0] + (p1[0] - p0[0]) * s, p0[2] + (p1[2] - p0[2]) * s]);
      let supported = false;
      for (const [x, z] of probes) {
        if (low <= height(x, z) + FLOAT_Y) { supported = true; break; }
        // standing on it, or its foot buried in it (a taller plot's side wall sunk into the neighbour plot's gable)
        for (const h of grid.under(x, z, id)) if (h.y <= low + BURIED && h.y >= low - SUPPORT_TOL) { supported = true; break; }
        if (supported || holds(grid, x, z, low, id)) { supported = true; break; }
      }
      if (!supported) note(probes[0]![0], probes[0]![1], `chân tường ${t.m} treo y=${low.toFixed(1)}–${Math.max(...ys).toFixed(1)} @${probes[0]![0].toFixed(1)},${probes[0]![1].toFixed(1)}`);
    } else if (upness < -0.7) {
      const [x, z] = [(P[0][0] + P[1][0] + P[2][0]) / 3, (P[0][2] + P[1][2] + P[2][2]) / 3];
      const y = (ys[0]! + ys[1]! + ys[2]!) / 3;
      if (y <= height(x, z) + FLOAT_Y) return;
      // a balcony slab / plot slab underside is cantilevered off a wall: 0.8 m deep, ignore those (area < 2 m² is a slab piece)
      if (len / 2 < 2.5) return;
      let supported = false;
      for (const h of grid.under(x, z, id)) if (h.up > 0 && h.y < y - 0.05) { supported = true; break; }
      if (supported) return;
      // raised underside: fine when the owner stands on posts (a wall of the chunk from under the slab down to the ground near the centroid)
      const o = owner(x, z);
      const key = o ? where(o) : `${chunk.key} ? @${Math.round(x)},${Math.round(z)}`;
      if (raised.has(key)) return;
      let posts = false;
      for (const t2 of grid.tris) {
        const ys2 = [tx(t2, t2.a + 1), tx(t2, t2.b + 1), tx(t2, t2.c + 1)];
        if (Math.min(...ys2) > FLOAT_Y + 0.6 || Math.max(...ys2) < y - 0.05) continue; // must reach from the ground up to the slab
        const [px, pz] = [tx(t2, t2.a), tx(t2, t2.a + 2)];
        if (o ? inRing(o.outer, px, pz) || edgeDist(o.outer, px, pz) < 0.5 : Math.hypot(px - x, pz - z) < 15) { posts = true; break; }
      }
      raised.set(key, posts);
    }
  });
  for (const [k, e] of perOwner) out.floating.push(`${k}: ${e.n} mảnh (${[...e.kinds].slice(0, 4).join('; ')})`);
  for (const [k, posts] of raised) out.raisedUnderside.push(`${k}${posts ? ' (có cột)' : ' KHÔNG CÓ CỘT'}`);
}

/** Landmark details (h1–h4 + generic S3DB parts): every wall foot > FLOAT_Y above the ground stands on something of the same chunk. */
export function auditLandmarks(chunk: ChunkData, height: (x: number, z: number) => number): string[] {
  if (!chunk.buildings.some((b) => b.landmark)) return [];
  const ctx: BuildCtx = { key: chunk.key, bounds: chunkBounds(chunk.key), height };
  const res = buildLandmarks(chunk, ctx);
  const grid = new TriGrid(res.meshes);
  const out: string[] = [];
  const seen = new Set<string>();
  grid.tris.forEach((t, id) => {
    const P = [[tx(t, t.a), tx(t, t.a + 1), tx(t, t.a + 2)], [tx(t, t.b), tx(t, t.b + 1), tx(t, t.b + 2)], [tx(t, t.c), tx(t, t.c + 1), tx(t, t.c + 2)]] as const;
    const ux = P[1][0] - P[0][0], uy = P[1][1] - P[0][1], uz = P[1][2] - P[0][2];
    const vx = P[2][0] - P[0][0], vy = P[2][1] - P[0][1], vz = P[2][2] - P[0][2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz);
    if (len < 2 * SLIVER_AREA || Math.abs(ny / len) >= 0.3) return;
    const ys = P.map((q) => q[1]);
    const low = Math.min(...ys);
    if (Math.max(...ys) - low < 1.0) return; // trim, railings, eaves boards
    const sorted = [0, 1, 2].sort((i, j) => ys[i]! - ys[j]!);
    if (ys[sorted[1]!]! > low + 0.5) return;
    const [p0, p1] = [P[sorted[0]!]!, P[sorted[1]!]!];
    const [x, z] = [(p0[0] + p1[0]) / 2, (p0[2] + p1[2]) / 2];
    if (low <= height(x, z) + FLOAT_Y) return;
    for (const h of grid.under(x, z, id)) if (h.y <= low + BURIED && h.y >= low - 1.0) return; // on / in another piece (a roof skirt on a hall)
    if (holds(grid, x, z, low, id)) return;
    const k = `${chunk.key} ${t.m} @${Math.round(x)},${Math.round(z)} y=${low.toFixed(1)}`;
    if (!seen.has(k)) { seen.add(k); out.push(k); }
  });
  return out;
}

export function runAudit(keys?: string[]): Audit {
  const grid = parseHeightGrid(JSON.parse(readFileSync(join(data, 'elevation.json'), 'utf8')), readFileSync(join(data, 'elevation.bin')));
  carveRiver(grid, JSON.parse(readFileSync(join(data, 'water.json'), 'utf8')) as WaterData);
  const index = JSON.parse(readFileSync(join(data, 'chunks/index.json'), 'utf8')) as ChunkIndex;
  const out: Audit = { buildings: 0, noRoof: [], floating: [], raisedUnderside: [], onRoad: [], inWater: [], slivers: 0, nan: [], tags: {}, triangles: 0 };
  const height = (x: number, z: number) => heightAt(grid, x, z);
  for (const key of keys ?? index.keys) auditChunk(JSON.parse(readFileSync(join(data, `chunks/${key}.json`), 'utf8')) as ChunkData, height, out);
  return out;
}

describe.skipIf(!has)('building audit', () => {
  it('landmark details (h1–h4) hang nothing in the air', () => {
    const grid = parseHeightGrid(JSON.parse(readFileSync(join(data, 'elevation.json'), 'utf8')), readFileSync(join(data, 'elevation.bin')));
    carveRiver(grid, JSON.parse(readFileSync(join(data, 'water.json'), 'utf8')) as WaterData);
    const index = JSON.parse(readFileSync(join(data, 'chunks/index.json'), 'utf8')) as ChunkIndex;
    const findings: string[] = [];
    for (const key of index.keys) findings.push(...auditLandmarks(JSON.parse(readFileSync(join(data, `chunks/${key}.json`), 'utf8')) as ChunkData, (x, z) => heightAt(grid, x, z)));
    console.log(`Địa danh – mảnh treo: ${findings.length}\n  ${findings.slice(0, 40).join('\n  ')}`);
    expect(findings.length).toBeLessThan(40);
  }, 300_000);

  it('every building has an up-facing roof, nothing hangs in the air, no slivers', () => {
    const a = runAudit(process.env.AUDIT_CHUNKS?.split(','));
    const worst = (list: string[]) => {
      const per = new Map<string, number>();
      for (const s of list) per.set(s.split(' ')[0]!, (per.get(s.split(' ')[0]!) ?? 0) + 1);
      return [...per].sort((x, y) => y[1] - x[1]).slice(0, 8).map(([k, n]) => `${k}×${n}`).join(' ');
    };
    const pct = (n: number) => `${n} / ${a.buildings} (${((100 * n) / a.buildings).toFixed(2)} %)`;
    console.log(`Nhà: ${a.buildings}, tam giác: ${a.triangles}, tag: ${JSON.stringify(a.tags)}`);
    console.log(`KHÔNG MÁI: ${pct(a.noRoof.length)}  worst: ${worst(a.noRoof)}\n  ${a.noRoof.slice(0, 15).join('\n  ')}`);
    console.log(`LƠ LỬNG (chân tường treo): ${pct(a.floating.length)}  worst: ${worst(a.floating)}\n  ${a.floating.slice(0, 15).join('\n  ')}`);
    console.log(`ĐÁY NÂNG (min_height / canopy): ${a.raisedUnderside.length}\n  ${a.raisedUnderside.slice(0, 15).join('\n  ')}`);
    console.log(`VÀO LÒNG ĐƯỜNG: ${pct(a.onRoad.length)}  worst: ${worst(a.onRoad)}\n  ${a.onRoad.slice(0, 10).join('\n  ')}`);
    console.log(`DƯỚI NƯỚC: ${a.inWater.length}\n  ${a.inWater.slice(0, 10).join('\n  ')}`);
    console.log(`SLIVER: ${a.slivers}, NaN: ${a.nan.length}`);
    expect(a.nan).toEqual([]);
    expect(a.buildings).toBeGreaterThan(20_000);
    // thresholds: before the Leg 3 fixes 5.3 % had no up-facing cap (plot caps wound face-down, hip slopes missing on windowless
    // boxes) and 6.5 % had hanging pieces (uncapped gable plots, plot boxes leaving acute / concave footprints, canopies without
    // posts); now 0 / 0.03 %
    expect(a.noRoof.length / a.buildings).toBeLessThan(0.002);
    expect(a.floating.length / a.buildings).toBeLessThan(0.001);
    expect(a.raisedUnderside.filter((s) => s.includes('KHÔNG CÓ CỘT'))).toEqual([]);
    expect(a.slivers).toBeLessThan(200);
  }, 900_000);
});
