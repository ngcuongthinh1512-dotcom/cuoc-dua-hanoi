// Package D: per-chunk terrain mesh, river carving, quays, the global Rapier colliders (docs/plans/phase2.md "D").
// Module top level must not touch the DOM: the worker imports buildTerrain().
import RAPIER from '@dimforge/rapier3d-compat'; // sideEffects: false → tree-shaken out of the worker bundle
import { latLonToWorld } from '@race/shared';
import { Color, type Material, MeshStandardMaterial } from 'three';
import { terrain as T } from '../config.ts';
import { CHUNK_SIZE, ringArea, type WaterData, type XZ } from '../geo/chunkData.ts';
import type { HeightGrid } from '../geo/heightGrid.ts';
import { PADS } from '../geo/landmarks.ts';
import type { Builder, MaterialId, TriMesh } from './buildTypes.ts';
import { MeshBuffer, offsetPolyline, type V3 } from './geom.ts';

/** Even-odd scanline fill of one polygon (outer + holes) over grid nodes (x0 + c·step, z0 + r·step). */
export function fillRings(rings: XZ[], x0: number, z0: number, step: number, cols: number, rows: number, mark: (c: number, r: number) => void) {
  const xs: number[] = [];
  for (let r = 0; r < rows; r++) {
    const z = z0 + r * step;
    xs.length = 0;
    for (const ring of rings) {
      const n = ring.length / 2;
      for (let i = 0, j = n - 1; i < n; j = i++) {
        const [xi, zi, xj, zj] = [ring[2 * i]!, ring[2 * i + 1]!, ring[2 * j]!, ring[2 * j + 1]!];
        if (zi <= z !== zj <= z) xs.push(xi + ((z - zi) / (zj - zi)) * (xj - xi));
      }
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const c1 = Math.min(Math.floor((xs[k + 1]! - x0) / step), cols - 1);
      for (let c = Math.max(Math.ceil((xs[k]! - x0) / step), 0); c <= c1; c++) mark(c, r);
    }
  }
}

/** 1 for every grid node inside a river polygon. */
function riverMask(g: HeightGrid, water: WaterData): Uint8Array {
  const mask = new Uint8Array(g.cols * g.rows);
  for (const p of water.polygons) {
    if (p.river) fillRings([p.outer, ...(p.holes ?? [])], g.minX, g.minZ, g.cell, g.cols, g.rows, (c, r) => (mask[r * g.cols + c] = 1));
  }
  return mask;
}

const carved = new WeakMap<HeightGrid, { level: number; water: WaterData }>();

/** Quantile q (default: median) of the grid heights over the masked nodes (NaN if none). */
function quantile(g: HeightGrid, mask: Uint8Array, q = 0.5): number {
  const hs = g.h.filter((_, k) => mask[k] === 1).sort();
  return hs.length ? hs[Math.min(Math.floor(q * hs.length), hs.length - 1)]! : Number.NaN;
}

/** Seine water surface y: config override, else the level carveRiver used on this grid, else the median grid height
 *  inside the river polygons (uncarved grid), else 0. */
export function riverLevel(g: HeightGrid, water: WaterData): number {
  const y = T.waterLevel ?? carved.get(g)?.level ?? quantile(g, riverMask(g, water));
  return Number.isNaN(y) ? 0 : y;
}

const padList = () =>
  PADS.map((p) => ({
    q: p.q,
    ring: p.ring.flatMap(([lat, lon]) => {
      const w = latLonToWorld(lat, lon);
      return [w.x, w.z];
    }),
  }));

/** Main thread, BEFORE carveRiver: levels every node inside each plaza ring (default geo/landmarks PADS) to the
 *  quantile q of the grid heights inside it, then eases the ground back to the DEM over padBlend m outside (smoothstep
 *  on the distance to the ring). Landmarks inside (pyramid, Notre-Dame) then stand on flat ground. */
export function flattenPads(g: HeightGrid, pads: { q: number; ring: XZ }[] = padList()) {
  const { cols, rows, cell, minX, minZ } = g;
  const B = T.padBlend;
  for (const { q, ring } of pads) {
    const inside = new Uint8Array(cols * rows);
    fillRings([ring], minX, minZ, cell, cols, rows, (c, r) => (inside[r * cols + c] = 1));
    const level = quantile(g, inside, q);
    if (Number.isNaN(level)) continue;
    const xs = ring.filter((_, i) => i % 2 === 0);
    const zs = ring.filter((_, i) => i % 2 === 1);
    const [c0, c1] = [Math.min(...xs) - B, Math.max(...xs) + B].map((x) => Math.min(Math.max(Math.round((x - minX) / cell), 0), cols - 1));
    const [r0, r1] = [Math.min(...zs) - B, Math.max(...zs) + B].map((z) => Math.min(Math.max(Math.round((z - minZ) / cell), 0), rows - 1));
    for (let r = r0!; r <= r1!; r++) {
      for (let c = c0!; c <= c1!; c++) {
        const k = r * cols + c;
        const t = inside[k] ? 0 : Math.min(ringDistance(ring, minX + c * cell, minZ + r * cell) / B, 1);
        g.h[k] = level + (g.h[k]! - level) * t * t * (3 - 2 * t);
      }
    }
  }
}

/** Distance (m) from (x, z) to the nearest edge of a closed ring. */
function ringDistance(ring: XZ, x: number, z: number): number {
  let d = Infinity;
  for (let i = 0, n = ring.length; i < n; i += 2) {
    const [ax, az, bx, bz] = [ring[i]!, ring[i + 1]!, ring[(i + 2) % n]!, ring[(i + 3) % n]!];
    const [ex, ez] = [bx - ax, bz - az];
    const s = Math.min(Math.max(((x - ax) * ex + (z - az) * ez) / (ex * ex + ez * ez || 1), 0), 1);
    d = Math.min(d, Math.hypot(x - ax - s * ex, z - az - s * ez));
  }
  return d;
}

/** Main thread, once at startup, BEFORE the grid goes to the worker: carves the Seine bed and raises the quays in place.
 *  Bed (level − riverDepth): river nodes plus their 8 neighbours, so every cell the river polygon touches is under
 *  water and the one-cell slope up to the street lies OUTSIDE the polygon, behind quayMesh's vertical wall and under
 *  its coping. Nodes within quayBand of the bed → ≥ level + quayHeight. The z14 DEM smears the valley ~50 m into the
 *  banks, so beyond the band that floor falls off at quayGrade until it meets the DEM (no trench behind the quay).
 *  ponytail: the lower quays (berges) end up at street level under the band, carve them from WaterData.quays if needed. */
export function carveRiver(g: HeightGrid, water: WaterData): void {
  const mask = riverMask(g, water);
  const found = quantile(g, mask);
  if (Number.isNaN(found)) {
    console.warn('carveRiver: no grid node inside a river polygon, nothing carved');
    return;
  }
  const level = T.waterLevel ?? found;
  const top = level + T.quayHeight;
  const reach = T.quayBand + T.quayHeight / T.quayGrade; // beyond this the floor is below the DEM anyway
  const { cols, rows, cell } = g;
  const bed = mask.slice();
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!mask[r * cols + c]) continue;
      for (let rr = Math.max(r - 1, 0); rr <= Math.min(r + 1, rows - 1); rr++) {
        for (let cc = Math.max(c - 1, 0); cc <= Math.min(c + 1, cols - 1); cc++) bed[rr * cols + cc] = 1;
      }
    }
  }
  // Two-pass chamfer distance (m) to the nearest bed node, 8-neighbour (≤ 8 % long).
  const dist = new Float32Array(cols * rows).map((_, k) => (bed[k] ? 0 : Infinity));
  const diag = cell * Math.SQRT2;
  const relax = (k: number, c2: number, k2: number, w: number) => {
    if (c2 >= 0 && c2 < cols && k2 >= 0 && k2 < dist.length && dist[k2]! + w < dist[k]!) dist[k] = dist[k2]! + w;
  };
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const k = r * cols + c;
      relax(k, c - 1, k - 1, cell), relax(k, c, k - cols, cell), relax(k, c - 1, k - cols - 1, diag), relax(k, c + 1, k - cols + 1, diag);
    }
  }
  for (let r = rows - 1; r >= 0; r--) {
    for (let c = cols - 1; c >= 0; c--) {
      const k = r * cols + c;
      relax(k, c + 1, k + 1, cell), relax(k, c, k + cols, cell), relax(k, c + 1, k + cols + 1, diag), relax(k, c - 1, k + cols - 1, diag);
    }
  }
  for (let k = 0; k < g.h.length; k++) {
    const d = dist[k]!;
    if (d === 0) g.h[k] = level - T.riverDepth;
    else if (d < reach) g.h[k] = Math.max(g.h[k]!, top - T.quayGrade * Math.max(0, d - T.quayBand));
  }
  carved.set(g, { level, water });
}

/** Ring oriented so the river is on its LEFT (outer counter-clockwise from above, holes clockwise). */
function riverLeft(r: XZ, hole: boolean): XZ {
  if (ringArea(r) > 0 !== hole) return r;
  const out: XZ = [];
  for (let i = r.length / 2 - 1; i >= 0; i--) out.push(r[2 * i]!, r[2 * i + 1]!);
  return out;
}

/** Stone quays along every river ring: a vertical wall on the polygon edge from the carved bed up to a parapet above
 *  the street, and a coping slab from the edge copingWidth outward just above street level (it covers the one-cell
 *  slope carveRiver leaves behind the wall). Flat quads, 4 vertices each. Rendered by Water.ts; also a collider.
 *  Edges on the water extent (where build-chunks clipped the river to the chunk grid) and edges two river polygons share
 *  get no quay: no dam across the river. */
export function quayMesh(water: WaterData, level: number): TriMesh {
  const v: number[] = [];
  const idx: number[] = [];
  const quad = (...p: V3[]) => {
    const k = v.length / 3;
    for (const q of p) v.push(...q);
    idx.push(k, k + 1, k + 2, k, k + 2, k + 3);
  };
  const bed = level - T.riverDepth;
  const top = level + T.quayHeight + T.copingLift;
  const cap = top + T.parapet;
  const ext = [Infinity, -Infinity, Infinity, -Infinity]; // min x, max x, min z, max z over all water
  for (const r of water.polygons.flatMap((p) => [p.outer, ...(p.holes ?? [])])) {
    for (let k = 0; k < r.length; k++) {
      const e = (k % 2) * 2;
      [ext[e], ext[e + 1]] = [Math.min(ext[e]!, r[k]!), Math.max(ext[e + 1]!, r[k]!)];
    }
  }
  const rivers = water.polygons.filter((p) => p.river).flatMap((p) => [p.outer, ...(p.holes ?? [])]);
  const edge = (ax: number, az: number, bx: number, bz: number) =>
    ax < bx || (ax === bx && az < bz) ? `${ax},${az},${bx},${bz}` : `${bx},${bz},${ax},${az}`;
  const uses = new Map<string, number>();
  for (const r of rivers) {
    for (let i = 0, n = r.length; i < n; i += 2) {
      const k = edge(r[i]!, r[i + 1]!, r[(i + 2) % n]!, r[(i + 3) % n]!);
      uses.set(k, (uses.get(k) ?? 0) + 1);
    }
  }
  const on = (a: number, b: number, e: number) => Math.abs(a - e) < 0.05 && Math.abs(b - e) < 0.05;
  const onExtent = (ax: number, az: number, bx: number, bz: number) =>
    on(ax, bx, ext[0]!) || on(ax, bx, ext[1]!) || on(az, bz, ext[2]!) || on(az, bz, ext[3]!);
  for (const p of water.polygons) {
    if (!p.river) continue;
    for (const ring of [riverLeft(p.outer, false), ...(p.holes ?? []).map((h) => riverLeft(h, true))]) {
      const n = ring.length / 2;
      const out = offsetPolyline(ring, -T.copingWidth, [ring[2 * n - 2]!, ring[2 * n - 1]!], [ring[0]!, ring[1]!]);
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const [ax, az, bx, bz] = [ring[2 * i]!, ring[2 * i + 1]!, ring[2 * j]!, ring[2 * j + 1]!];
        if (onExtent(ax, az, bx, bz) || uses.get(edge(ax, az, bx, bz))! > 1) continue;
        quad([bx, bed, bz], [ax, bed, az], [ax, cap, az], [bx, cap, bz]); // wall seen from the river: bottom-left = b
        quad([ax, top, az], [out[2 * i]!, top, out[2 * i + 1]!], [out[2 * j]!, top, out[2 * j + 1]!], [bx, top, bz]); // coping (+Y)
      }
    }
  }
  return { vertices: new Float32Array(v), indices: new Uint32Array(idx) };
}

const linear = (hex: string): V3 => {
  const c = new Color(hex); // sRGB hex → linear
  return [c.r, c.g, c.b];
};

/** chunkRes² grid over the chunk, heights from ctx.height, central-difference normals. Vertex colour: pavement, sand
 *  inside parks (Paris park paths are gravel), green inside grass, stone where steeper than stoneSlope (river banks).
 *  Surfaces are sampled on a half-step grid and box-filtered, so lawn edges blend instead of stair-stepping.
 *  ponytail: colour resolution is the 5 m vertex grid, a splat texture per chunk if lawns must be crisp. */
export const buildTerrain: Builder = (chunk, ctx) => {
  const n = T.chunkRes;
  const s = CHUNK_SIZE / (n - 1);
  const { minX, minZ } = ctx.bounds;
  const f = 2 * n + 1; // sub-samples at s/2, one extra ring so every vertex has a full 3 × 3 window
  const surface = new Uint8Array(f * f); // 0 pavement, 1 park, 2 grass
  for (const a of chunk.areas) {
    const v = a.kind === 'grass' ? 2 : 1;
    fillRings([a.outer, ...(a.holes ?? [])], minX - s / 2, minZ - s / 2, s / 2, f, f, (c, r) => (surface[r * f + c] = Math.max(surface[r * f + c]!, v)));
  }
  const colours = [linear(T.colours.pavement), linear(T.colours.park), linear(T.colours.grass)];
  const stone = linear(T.colours.stone);
  // Border vertices use their inside half-step sample in place of the outside / on-edge ones (areas are clipped to the
  // chunk, so those read as pavement and would draw pale lines along the chunk grid across parks).
  const inner = (k: number) => Math.min(Math.max(k, 2), f - 3);
  const mix = (r: number, c: number): V3 => {
    const out: [number, number, number] = [0, 0, 0];
    for (let dr = 0; dr < 3; dr++) {
      for (let dc = 0; dc < 3; dc++) {
        const w = ((dr === 1 ? 2 : 1) * (dc === 1 ? 2 : 1)) / 16; // tent filter
        const col = colours[surface[inner(2 * r + dr) * f + inner(2 * c + dc)]!]!;
        for (let i = 0; i < 3; i++) out[i] = out[i]! + w * col[i]!;
      }
    }
    return out;
  };
  const m = new MeshBuffer('terrain');
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const x = minX + c * s;
      const z = minZ + r * s;
      const dx = ctx.height(x + s, z) - ctx.height(x - s, z);
      const dz = ctx.height(x, z + s) - ctx.height(x, z - s);
      const l = Math.hypot(dx, 2 * s, dz);
      m.color = Math.hypot(dx, dz) / (2 * s) > T.stoneSlope ? stone : mix(r, c);
      m.vertex(x, ctx.height(x, z), z, -dx / l, (2 * s) / l, -dz / l, x, z);
    }
  }
  for (let r = 0; r < n - 1; r++) {
    for (let c = 0; c < n - 1; c++) {
      const i = r * n + c;
      m.face(i, i + n, i + 1);
      m.face(i + 1, i + n, i + n + 1);
    }
  }
  return { meshes: [m.bucket()], instances: [], colliders: [] };
};

/** One static heightfield collider for the whole (carved) grid, plus the quayMesh trimesh if carveRiver ran on it.
 *  Rapier wants heights column-major with rows along local Z, centred on the body, spanning scale; our grid is
 *  row-major with rows along +Z, so transpose (layout checked by raycasts in Terrain.test.ts). */
export function createTerrainCollider(world: RAPIER.World, g: HeightGrid): void {
  const heights = new Float32Array(g.cols * g.rows);
  for (let r = 0; r < g.rows; r++) for (let c = 0; c < g.cols; c++) heights[c * g.rows + r] = g.h[r * g.cols + c]!;
  const sx = (g.cols - 1) * g.cell;
  const sz = (g.rows - 1) * g.cell;
  world.createCollider(
    RAPIER.ColliderDesc.heightfield(g.rows - 1, g.cols - 1, heights, { x: sx, y: 1, z: sz }).setTranslation(g.minX + sx / 2, 0, g.minZ + sz / 2),
  );
  const quays = carved.get(g);
  if (quays) {
    const m = quayMesh(quays.water, quays.level);
    world.createCollider(RAPIER.ColliderDesc.trimesh(m.vertices, m.indices));
  }
}

export function createTerrainMaterials(): Partial<Record<MaterialId, Material>> {
  return { terrain: new MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }) };
}
