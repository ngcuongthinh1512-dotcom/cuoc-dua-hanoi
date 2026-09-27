// Worker ⇄ main-thread contract for the chunk builders (docs/plans/phase2.md step 0).
// Builders are pure functions returning plain typed arrays in WORLD coordinates: testable in Node,
// transferable to/from the worker with zero copy, turned into THREE objects by world/attach.ts.
import type { ChunkData, ChunkKey, chunkBounds } from '../geo/chunkData.ts';
import type { HeightGrid } from '../geo/heightGrid.ts';

/** 'stone' | 'iron' | 'glass' are for the landmark placeholders (world/Landmarks.ts). */
export type MaterialId =
  | 'terrain'
  | 'wall'
  | 'shopfront'
  | 'roof'
  | 'balcony'
  | 'sidewalk'
  | 'asphalt'
  | 'pave'
  | 'marking'
  | 'bridge'
  | 'railing'
  | 'sign'
  | 'stone'
  | 'iron'
  | 'glass';

/** Buckets of these materials MUST carry a `color` attribute (linear RGB: per-building tint, park green) and their
 *  materials use vertexColors; buckets of every other material MUST NOT. geom.MeshBuffer applies this rule itself. */
export const VERTEX_COLOR: ReadonlySet<MaterialId> = new Set<MaterialId>(['terrain', 'wall', 'shopfront', 'roof']);

export type PropKind = 'tree' | 'lamp' | 'morris' | 'metro';

/** One indexed triangle list for one material. uv in metres unless the material says otherwise. */
export interface MeshBucket {
  material: MaterialId;
  position: Float32Array; // xyz
  normal: Float32Array; // xyz
  uv: Float32Array; // uv
  color?: Float32Array; // rgb, iff VERTEX_COLOR.has(material)
  index: Uint32Array;
}

/** Instanced prop placements; the mesh comes from StreetProps.createPropMeshes()[kind]. */
export interface InstanceSet {
  kind: PropKind;
  matrices: Float32Array; // 16 floats per instance (THREE.Matrix4.elements, column-major)
}

/** Static Rapier trimesh collider. */
export interface TriMesh {
  vertices: Float32Array; // xyz
  indices: Uint32Array;
}

export interface BuildOut {
  meshes: MeshBucket[];
  instances: InstanceSet[];
  colliders: TriMesh[];
  textures?: { material: MaterialId; image: ImageBitmap }[]; // per-chunk atlas (street signs) → cloned material
}

export interface BuildCtx {
  key: ChunkKey;
  bounds: ReturnType<typeof chunkBounds>;
  height(x: number, z: number): number; // heightAt on the (carved) HeightGrid
}

/** Pure: world-space coordinates, no THREE objects, no DOM (runs in the worker). */
export type Builder = (chunk: ChunkData, ctx: BuildCtx) => BuildOut;

export type ToWorker = { type: 'init'; grid: HeightGrid; dataUrl: string } | { type: 'build'; key: ChunkKey };

export type FromWorker =
  | { type: 'built'; key: ChunkKey; out: BuildOut; ms: number }
  | { type: 'failed'; key: ChunkKey; error: string };
