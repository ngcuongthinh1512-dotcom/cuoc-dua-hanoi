// Package D: per-chunk terrain mesh, river carving, quays, the global Rapier colliders (docs/plans/phase2.md "D").
// Module top level must not touch the DOM: the worker imports buildTerrain().
import RAPIER from '@dimforge/rapier3d-compat'; // sideEffects: false → tree-shaken out of the worker bundle
import { latLonToWorld } from '@race/shared';
import { Color, type Material, MeshStandardMaterial } from 'three';
import { stairs as ST, terrain as T, water as W } from '../config.ts';
import { CHUNK_SIZE, ringArea, type WaterData, type XZ } from '../geo/chunkData.ts';
import { type HeightGrid, heightAt } from '../geo/heightGrid.ts';
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

const carved = new WeakMap<HeightGrid, { level: number; water: WaterData; lakes: number[]; swim: Int16Array }>();

/** Surface y of the swimmable lake (water.swimMinArea) whose carved grid node is nearest (x, z), else null (carveRiver ran on g). */
export function lakeSurfaceAt(g: HeightGrid, x: number, z: number): number | null {
  const st = carved.get(g);
  if (!st) return null;
  const [c, r] = [Math.round((x - g.minX) / g.cell), Math.round((z - g.minZ) / g.cell)];
  if (c < 0 || r < 0 || c >= g.cols || r >= g.rows) return null;
  const i = st.swim[r * g.cols + c]!;
  return i >= 0 ? st.lakes[i]! : null;
}

/** Surface y of every other water polygon (lake, pond, basin; NaN for a river), index-aligned with water.polygons: the
 *  water.lakeRim quantile of the heights along its outer ring (no higher than the low part of its rim) + water.otherLift. */
function lakeLevels(g: HeightGrid, water: WaterData): number[] {
  return water.polygons.map((p) => {
    if (p.river) return Number.NaN;
    const r = p.outer;
    const hs: number[] = [];
    for (let i = 0; i < r.length; i += 2) {
      const [ax, az, bx, bz] = [r[i]!, r[i + 1]!, r[(i + 2) % r.length]!, r[(i + 3) % r.length]!];
      const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / g.cell));
      for (let k = 0; k < n; k++) hs.push(heightAt(g, ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n));
    }
    hs.sort((a, b) => a - b);
    return hs[Math.floor(W.lakeRim * (hs.length - 1))]! + W.otherLift;
  });
}

/** Surface y of water polygon i: the river level, or its lake level (carveRiver), else the mean ring height + otherLift. */
export function waterLevelOf(g: HeightGrid, water: WaterData, i: number): number {
  const p = water.polygons[i]!;
  if (p.river) return riverLevel(g, water);
  const y = carved.get(g)?.lakes[i];
  if (y !== undefined && !Number.isNaN(y)) return y;
  let sum = 0;
  for (let k = 0; k < p.outer.length; k += 2) sum += heightAt(g, p.outer[k]!, p.outer[k + 1]!);
  return sum / (p.outer.length / 2) + W.otherLift;
}

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
  const lakes = lakeLevels(g, water); // from the rims as the DEM has them, before the quay band below raises some
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
  // Under a bridge deck's footprint on the bank (WaterData.bridgeGaps: crossing, half width, inland direction; as deep as
  // the quay slab it replaces) the bank nodes outside the polygon stay at street level: no trench there, the quay slab is
  // left out and the deck is the floor.
  const bg = water.bridgeGaps ?? [];
  for (let k = 0; k < g.h.length; k++) {
    if (!bed[k] || mask[k]) continue;
    const x = g.minX + (k % cols) * cell;
    const z = g.minZ + Math.floor(k / cols) * cell;
    for (let i = 0; i < bg.length; i += 5) {
      const [px, pz, ux, uz] = [x - bg[i]!, z - bg[i + 1]!, bg[i + 3]!, bg[i + 4]!];
      const along = px * ux + pz * uz;
      if (along >= -cell && along <= T.copingWidth + cell && Math.abs(px * uz - pz * ux) <= bg[i + 2]! + cell) {
        bed[k] = 0;
        break;
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
  // Lakes, ponds, basins (not carved like the sea): every node inside sinks water.lakeDepth under the surface (the DEM's
  // bumps and the quay band above stood out of the water as islands); every land node next to one, and every island
  // (hole), is raised to its rim height (no water sheet hanging over a low bank). Sea bed nodes stay.
  const lake = new Int16Array(g.h.length).fill(-1);
  const swim = new Int16Array(g.h.length).fill(-1); // node → index of the swimmable lake it lies in (lakeSurfaceAt)
  water.polygons.forEach((p, i) => {
    if (p.river) return;
    const y = lakes[i]!;
    const deep = Math.abs(ringArea(p.outer)) >= W.swimMinArea;
    fillRings([p.outer, ...(p.holes ?? [])], g.minX, g.minZ, cell, cols, rows, (c, r) => {
      const k = r * cols + c;
      // a swim lake's first cell inside the shore is a lakeDepth shelf: the 27° drop to the swim depth starts under water
      const shelf = deep && ringDistance(p.outer, g.minX + c * cell, g.minZ + r * cell) < cell;
      g.h[k] = Math.min(g.h[k]!, y - (deep && !shelf ? W.lakeSwimDepth : W.lakeDepth));
      lake[k] = i;
      if (deep) swim[k] = i;
    });
    for (const hole of p.holes ?? []) {
      fillRings([hole], g.minX, g.minZ, cell, cols, rows, (c, r) => {
        const k = r * cols + c;
        if (dist[k]) g.h[k] = Math.max(g.h[k]!, y - W.otherLift);
      });
    }
  });
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const k = r * cols + c;
      if (lake[k]! >= 0 || dist[k] === 0) continue;
      for (let rr = Math.max(r - 1, 0); rr <= Math.min(r + 1, rows - 1); rr++) {
        for (let cc = Math.max(c - 1, 0); cc <= Math.min(c + 1, cols - 1); cc++) {
          const i = lake[rr * cols + cc]!;
          if (i >= 0) g.h[k] = Math.max(g.h[k]!, lakes[i]! - W.otherLift);
        }
      }
    }
  }
  carved.set(g, { level, water, lakes, swim });
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
  // Gaps on the wall line as [t0, t1] intervals of the edge a → b: over the quay stair landings (WaterData.stairGaps) the
  // parapet is left out; under bridge decks (WaterData.bridgeGaps, own half width) wall AND coping are left out, else
  // the coping (0.1–0.6 m above a deck end) and the parapet bar both ends of every bridge.
  const stairHalf = ST.quay.landing / 2 + 0.2;
  const gaps: [number, number, number, boolean][] = []; // x, z, half width, bridge
  const sg = water.stairGaps ?? [];
  for (let g = 0; g < sg.length; g += 2) gaps.push([sg[g]!, sg[g + 1]!, stairHalf, false]);
  const bg = water.bridgeGaps ?? [];
  for (let g = 0; g < bg.length; g += 5) gaps.push([bg[g]!, bg[g + 1]!, bg[g + 2]!, true]);
  // A gap is a disc: every edge it reaches opens (the crossed one and its neighbours round a corner of the bank); a bridge
  // gap also opens the slab of an edge whose inland slab line it reaches (the side walls of an abutment notch lay their
  // slabs sideways under the deck).
  const openings = (ax: number, az: number, bx: number, bz: number, ox: number, oz: number, qx: number, qz: number): [number, number, boolean][] => {
    const out: [number, number, boolean][] = [];
    const hit = (ax: number, az: number, bx: number, bz: number, gx: number, gz: number, gapHalf: number): [number, number] | undefined => {
      const [dx, dz] = [bx - ax, bz - az];
      const len = Math.hypot(dx, dz) || 1;
      const [px, pz] = [gx - ax, gz - az];
      const t = (px * dx + pz * dz) / len;
      const d = Math.abs(px * dz - pz * dx) / len;
      if (d >= gapHalf) return undefined;
      const hw = Math.sqrt(gapHalf * gapHalf - d * d);
      return t > -hw && t < len + hw ? [(t - hw) / len, (t + hw) / len] : undefined;
    };
    for (const [gx, gz, gapHalf, bridge] of gaps) {
      const h = hit(ax, az, bx, bz, gx, gz, gapHalf) ?? (bridge ? hit(ox, oz, qx, qz, gx, gz, gapHalf) : undefined);
      if (h) out.push([...h, bridge]);
    }
    return out;
  };
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
        const open = openings(ax, az, bx, bz, out[2 * i]!, out[2 * i + 1]!, out[2 * j]!, out[2 * j + 1]!);
        const clamp = (u: number) => Math.min(Math.max(u, 0), 1);
        const cuts = [...new Set([0, 1, ...open.flatMap(([t0, t1]) => [clamp(t0), clamp(t1)])])].sort((p, q) => p - q);
        const lerp = (u: number, y: number): V3 => [ax + (bx - ax) * u, y, az + (bz - az) * u];
        const lerpOut = (u: number, y: number): V3 => [out[2 * i]! + (out[2 * j]! - out[2 * i]!) * u, y, out[2 * i + 1]! + (out[2 * j + 1]! - out[2 * i + 1]!) * u];
        for (let k = 0; k + 1 < cuts.length; k++) {
          const [u0, u1] = [cuts[k]!, cuts[k + 1]!];
          const mid = (u0 + u1) / 2;
          const inside = open.filter(([t0, t1]) => mid > t0 && mid < t1);
          if (inside.some(([, , bridge]) => bridge)) continue; // a deck: no wall, no coping (BridgeBuilder's slab is the floor)
          const y = inside.length ? top : cap;
          quad(lerp(u1, bed), lerp(u0, bed), lerp(u0, y), lerp(u1, y)); // wall seen from the river: bottom-left = b
          quad(lerp(u0, top), lerpOut(u0, top), lerpOut(u1, top), lerp(u1, top)); // coping (+Y)
        }
      }
    }
  }
  return { vertices: new Float32Array(v), indices: new Uint32Array(idx) };
}

/** Deterministic value noise in [0, 1] on the unit lattice (smoothstep between hashed corners). */
export function valueNoise(x: number, z: number): number {
  const h = (i: number, j: number) => {
    let n = (i * 374761393 + j * 668265263) | 0;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  };
  const [i, j] = [Math.floor(x), Math.floor(z)];
  const [u, v] = [x - i, z - j].map((t) => t * t * (3 - 2 * t)) as [number, number];
  return (h(i, j) * (1 - u) + h(i + 1, j) * u) * (1 - v) + (h(i, j + 1) * (1 - u) + h(i + 1, j + 1) * u) * v;
}

/** Stone kerb along the shoreline of every swim lake (water.swimMinArea): a flat top water.kerb.width wide across the
 *  polygon edge, water.kerb.lift over the surface, with a skirt down both sides (the carved bank slope under it never
 *  shows). Flat quads, rendered by Water.ts with the quay walls; no collider (0.2 m high, the feet pass through). */
export function lakeKerbMesh(g: HeightGrid, water: WaterData): TriMesh {
  const v: number[] = [];
  const idx: number[] = [];
  const quad = (...p: V3[]) => {
    const k = v.length / 3;
    for (const q of p) v.push(...q);
    idx.push(k, k + 1, k + 2, k, k + 2, k + 3);
  };
  const K = W.kerb;
  water.polygons.forEach((p, i) => {
    if (p.river || Math.abs(ringArea(p.outer)) < W.swimMinArea) return;
    const y = waterLevelOf(g, water, i);
    const [top, low] = [y + K.lift, y - K.skirt];
    for (const ring of [riverLeft(p.outer, false), ...(p.holes ?? []).map((h) => riverLeft(h, true))]) {
      const n = ring.length / 2;
      const ends: [[number, number], [number, number]] = [[ring[2 * n - 2]!, ring[2 * n - 1]!], [ring[0]!, ring[1]!]];
      const inn = offsetPolyline(ring, K.width / 2, ...ends); // water side (left)
      const out = offsetPolyline(ring, -K.width / 2, ...ends); // land side
      for (let a = 0; a < n; a++) {
        const b = (a + 1) % n;
        const P = (r: XZ, k: number, yy: number): V3 => [r[2 * k]!, yy, r[2 * k + 1]!];
        quad(P(inn, a, top), P(out, a, top), P(out, b, top), P(inn, b, top)); // top (+Y)
        quad(P(inn, b, low), P(inn, a, low), P(inn, a, top), P(inn, b, top)); // water-side skirt
        quad(P(out, a, low), P(out, b, low), P(out, b, top), P(out, a, top)); // land-side skirt
      }
    }
  });
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
  // Lake bank (Leg 3, terrain.waterLevel set: the street is flat at waterLevel + quayHeight and carveRiver sinks lakes and
  // ponds ≥ lakeDepth under it): a sub-sample dipped under the street but above the river bed is water bottom (3); a dry
  // vertex with one in its window is the bank, coloured grass. Off (waterLevel null: a DEM) → never sunk. A lake bottom is
  // never deeper than lakeSwimDepth, nor is anything a cell away from it: the river's one-cell quay band (bed → street) is
  // not a bank, whatever height its bilinear midpoints take.
  const bedHi = (T.waterLevel ?? -Infinity) + T.quayHeight - T.lakeBank;
  const bedLo = bedHi - W.lakeSwimDepth - 0.5;
  const sunk = (x: number, z: number) => {
    const h = ctx.height(x, z);
    return h > bedLo && h < bedHi && Math.min(ctx.height(x + s, z), ctx.height(x - s, z), ctx.height(x, z + s), ctx.height(x, z - s)) > bedLo;
  };
  const surface = new Uint8Array(f * f); // 0 pavement, 1 park, 2 grass, 3 lake bottom
  for (const a of chunk.areas) {
    const v = a.kind === 'grass' ? 2 : 1;
    fillRings([a.outer, ...(a.holes ?? [])], minX - s / 2, minZ - s / 2, s / 2, f, f, (c, r) => (surface[r * f + c] = Math.max(surface[r * f + c]!, v)));
  }
  for (let r = 0; r < f; r++) for (let c = 0; c < f; c++) if (sunk(minX + (c - 1) * (s / 2), minZ + (r - 1) * (s / 2))) surface[r * f + c] = 3;
  const colours = [linear(T.colours.pavement), linear(T.colours.park), linear(T.colours.grass)];
  const [stone, worn, shade, bed] = [linear(T.colours.stone), linear(T.colours.worn), linear(T.colours.shade), linear(T.colours.lakeBed)];
  const trees = chunk.points.filter((p) => p.kind === 'tree');
  // Lawn at (x, z): grass → worn by two octaves of value noise, darkened within lawn.shadeRadius of a tree trunk.
  const lawn = (col: V3, x: number, z: number): V3 => {
    const [p0, p1] = T.lawn.patch;
    const t = Math.min(1, Math.max(0, (valueNoise(x / p0, z / p0) * 0.4 + valueNoise(x / p1 + 7.3, z / p1 + 2.1) * 0.6 - 0.35) / 0.4)) * T.lawn.worn;
    let sh = 0;
    for (const q of trees) {
      const d = Math.hypot(q.x - x, q.z - z);
      if (d < T.lawn.shadeRadius) sh = Math.max(sh, 1 - d / T.lawn.shadeRadius);
    }
    const k = sh * T.lawn.shade;
    const ch = (i: number) => { const v = col[i]! + (worn[i]! - col[i]!) * t; return v + (shade[i]! - v) * k; };
    return [ch(0), ch(1), ch(2)];
  };
  // Border vertices use their inside half-step sample in place of the outside / on-edge ones (areas are clipped to the
  // chunk, so those read as pavement and would draw pale lines along the chunk grid across parks).
  const inner = (k: number) => Math.min(Math.max(k, 2), f - 3);
  const mix = (r: number, c: number, x: number, z: number): V3 => {
    const out: [number, number, number] = [0, 0, 0];
    if (sunk(x, z)) return bed;
    let bank = false;
    for (let dr = 0; dr < 3; dr++) for (let dc = 0; dc < 3; dc++) if (surface[inner(2 * r + dr) * f + inner(2 * c + dc)] === 3) bank = true;
    for (let dr = 0; dr < 3; dr++) {
      for (let dc = 0; dc < 3; dc++) {
        const w = ((dr === 1 ? 2 : 1) * (dc === 1 ? 2 : 1)) / 16; // tent filter
        const kind = bank ? 2 : surface[inner(2 * r + dr) * f + inner(2 * c + dc)]!;
        const col = kind ? lawn(colours[kind]!, x, z) : colours[0]!;
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
      m.color = Math.hypot(dx, dz) / (2 * s) > T.stoneSlope ? stone : mix(r, c, x, z);
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
