// One chunk through every builder → one BuildOut (buckets merged per material, colliders merged into one trimesh).
// Runs in workers/chunkBuilder.worker.ts and in world/allChunks.test.ts (Node). DOM-free.
import { Color } from 'three';
import { terrain as T } from '../config.ts';
import { CHUNK_SIZE, type ChunkData, type ChunkKey, chunkBounds } from '../geo/chunkData.ts';
import { type HeightGrid, heightAt } from '../geo/heightGrid.ts';
import { buildBridges } from './BridgeBuilder.ts';
import { buildBuildings } from './BuildingBuilder.ts';
import { type BuildCtx, type Builder, type BuildOut, type MeshBucket, VERTEX_COLOR } from './buildTypes.ts';
import { mergeBuckets, mergeTriMeshes, MeshBuffer } from './geom.ts';
import { buildLandmarks } from './Landmarks.ts';
import { buildRoads } from './RoadBuilder.ts';
import { buildStreetProps } from './StreetProps.ts';
import { buildTerrain } from './Terrain.ts';
import { buildVegetation } from './Vegetation.ts';

export const BUILDERS: Record<string, Builder> = {
  terrain: buildTerrain,
  buildings: buildBuildings,
  roads: buildRoads,
  bridges: buildBridges,
  vegetation: buildVegetation,
  props: buildStreetProps,
  landmarks: buildLandmarks,
};

export const emptyChunk = (key: ChunkKey): ChunkData => ({ v: 1, key, buildings: [], roads: [], bridges: [], areas: [], points: [] });

/** Grey heightfield for one chunk when buildTerrain returns no mesh (stub or failure), so the ground always shows. */
export function fallbackTerrain(grid: HeightGrid, b: ReturnType<typeof chunkBounds>): MeshBucket {
  const m = new MeshBuffer('terrain');
  const c = new Color(T.colours.pavement); // sRGB hex → linear
  m.color = [c.r, c.g, c.b];
  const n = T.chunkRes;
  const s = CHUNK_SIZE / (n - 1);
  const h = (x: number, z: number) => heightAt(grid, x, z);
  for (let r = 0; r < n; r++) {
    for (let k = 0; k < n; k++) {
      const x = b.minX + k * s;
      const z = b.minZ + r * s;
      const nx = h(x - s, z) - h(x + s, z);
      const nz = h(x, z - s) - h(x, z + s);
      const l = Math.hypot(nx, 2 * s, nz);
      m.vertex(x, h(x, z), z, nx / l, (2 * s) / l, nz / l, x, z);
    }
  }
  for (let r = 0; r < n - 1; r++) {
    for (let k = 0; k < n - 1; k++) {
      const i = r * n + k;
      m.face(i, i + n, i + 1);
      m.face(i + 1, i + n, i + n + 1);
    }
  }
  return m.bucket();
}

export type BuildError = (builder: string, key: ChunkKey, err: unknown) => void;
const warn: BuildError = (builder, key, err) => console.warn(`chunk ${key}: ${builder} failed, skipped:`, err);

/** Every builder in its own try/catch (a failing one is reported and skipped, the chunk still builds). */
export function buildChunk(chunk: ChunkData, grid: HeightGrid, onError: BuildError = warn): BuildOut {
  const bounds = chunkBounds(chunk.key);
  const ctx: BuildCtx = { key: chunk.key, bounds, height: (x, z) => heightAt(grid, x, z) };
  const all: BuildOut = { meshes: [], instances: [], colliders: [], textures: [] };
  for (const [name, build] of Object.entries(BUILDERS)) {
    try {
      const out = build(chunk, ctx);
      for (const b of out.meshes) {
        if ((b.color !== undefined) !== VERTEX_COLOR.has(b.material)) throw new Error(`'${b.material}' bucket breaks the VERTEX_COLOR rule`);
      }
      if (name === 'terrain' && !out.meshes.some((b) => b.index.length)) out.meshes.push(fallbackTerrain(grid, bounds));
      all.meshes.push(...mergeBuckets(out.meshes));
      all.instances.push(...out.instances.filter((s) => s.matrices.length));
      all.colliders.push(...out.colliders.filter((c) => c.indices.length));
      all.textures!.push(...(out.textures ?? []));
    } catch (err) {
      onError(name, chunk.key, err);
      if (name === 'terrain') all.meshes.push(fallbackTerrain(grid, bounds));
    }
  }
  all.meshes = mergeBuckets(all.meshes);
  if (all.colliders.length > 1) all.colliders = [mergeTriMeshes(all.colliders)];
  return all;
}

/** Every buffer and image in `out`, once each (a builder may return views sharing one buffer). */
export function transferables(out: BuildOut): Transferable[] {
  const set = new Set<Transferable>();
  for (const b of out.meshes) for (const a of [b.position, b.normal, b.uv, b.color, b.index]) if (a) set.add(a.buffer as ArrayBuffer);
  for (const s of out.instances) set.add(s.matrices.buffer as ArrayBuffer);
  for (const c of out.colliders) set.add(c.vertices.buffer as ArrayBuffer), set.add(c.indices.buffer as ArrayBuffer);
  for (const t of out.textures ?? []) set.add(t.image);
  return [...set];
}
