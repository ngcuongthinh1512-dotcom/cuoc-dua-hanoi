// Chunk streaming (SPEC §4.4): builds chunks around the camera in the worker, attaches them on the main thread within a
// per-frame budget, unloads far ones (geometry, sign textures, colliders). Rapier colliders exist only for loaded chunks
// within colliderRadius (one dense chunk's trimesh takes ~5 ms), created one per frame within the same budget.
import RAPIER from '@dimforge/rapier3d-compat';
import type * as THREE from 'three';
import { chunks as C, landmarks as LM, render as R } from '../config.ts';
import { type ChunkKey, chunkBounds } from '../geo/chunkData.ts';
import { attachBuildOut, type Materials, type PropMeshes } from './attach.ts';
import type { BuildOut, FromWorker, ToWorker, TriMesh } from './buildTypes.ts';

/** Distance from (x, z) to the chunk's square (0 inside). */
export function chunkDistance(key: ChunkKey, x: number, z: number): number {
  const b = chunkBounds(key);
  return Math.hypot(Math.max(b.minX - x, 0, x - b.maxX), Math.max(b.minZ - z, 0, z - b.maxZ));
}

/** Keys whose square is within r of (x, z), nearest first. */
export function chunksInRadius(keys: readonly ChunkKey[], x: number, z: number, r: number): ChunkKey[] {
  return keys
    .map((k) => [k, chunkDistance(k, x, z)] as const)
    .filter(([, d]) => d <= r)
    .sort((a, b) => a[1] - b[1])
    .map(([k]) => k);
}

/** Load radius for a camera at height y: at least as far as the fog (world/Sky.ts: far grows with height), so the edge
 *  of the loaded world is never seen; a high camera (topdown) loads everything. */
export const loadRadius = (y: number) => Math.max(C.loadRadius, R.fog.far + Math.max(0, y) * R.fog.altitudeFactor + C.fogMargin);

// ponytail: one worker (maxInFlight builds at once), a worker pool if the first load is slow.
type Loaded = { dispose(): void; shapes: TriMesh[]; colliders?: RAPIER.Collider[]; near: THREE.Mesh[] };

/** Landmark detail LOD: meshes of lod 'near' buckets are visible only within detailDistance of (x, y, z). */
export function updateNear(meshes: readonly THREE.Mesh[], x: number, y: number, z: number, distance = LM.detailDistance) {
  for (const m of meshes) {
    const s = m.geometry.boundingSphere;
    m.visible = !s || Math.hypot(s.center.x - x, s.center.y - y, s.center.z - z) - s.radius <= distance;
  }
}

export class ChunkManager {
  private readonly loaded = new Map<ChunkKey, Loaded>();
  private readonly inFlight = new Set<ChunkKey>();
  private readonly ready: { key: ChunkKey; out: BuildOut }[] = [];
  private readonly built = new Set<ChunkKey>(); // keys in ready
  private readonly failures = new Map<ChunkKey, number>();
  private wanted = new Set<ChunkKey>();
  private queue: ChunkKey[] = [];
  private lastX = NaN;
  private lastZ = NaN;
  private lastR = NaN;
  private dead = false; // the worker failed to start: nothing more can be built

  constructor(
    private readonly worker: Worker,
    private readonly keys: readonly ChunkKey[],
    private readonly parent: THREE.Object3D,
    private readonly physics: RAPIER.World,
    private readonly materials: Materials,
    private readonly propMeshes: PropMeshes,
  ) {
    worker.onmessage = (e: MessageEvent<FromWorker>) => this.receive(e.data);
    worker.onerror = (e) => {
      console.warn('chunk worker error, streaming stops:', e.message);
      this.dead = true;
      this.queue = [];
      this.inFlight.clear();
    };
  }

  /** Once per frame. budgetMs = attach time allowed this frame (Infinity before the first __READY__). */
  update(x: number, y: number, z: number, budgetMs: number) {
    const r = loadRadius(y);
    // Re-plan only after moving ≥ 10 m (the sort over ~370 keys is cheap, but not every frame).
    if (!(Math.hypot(x - this.lastX, z - this.lastZ) < 10 && r === this.lastR)) {
      [this.lastX, this.lastZ, this.lastR] = [x, z, r];
      const near = chunksInRadius(this.keys, x, z, r);
      this.wanted = new Set(near);
      this.queue = this.dead ? [] : near.filter((k) => !this.busy(k) && (this.failures.get(k) ?? 0) <= C.fetchRetries);
      const keep = r + C.unloadRadius - C.loadRadius;
      for (const [k] of this.loaded) if (chunkDistance(k, x, z) > keep) this.unload(k);
    }
    this.pump();
    const t0 = performance.now();
    while (this.ready.length && performance.now() - t0 < budgetMs) {
      const { key, out } = this.ready.shift()!;
      this.built.delete(key);
      if (this.wanted.has(key) && !this.loaded.has(key)) this.attach(key, out);
      else for (const t of out.textures ?? []) t.image.close();
    }
    for (const [k, c] of this.loaded) {
      updateNear(c.near, x, y, z);
      const d = chunkDistance(k, x, z);
      if (c.colliders && d > C.colliderRadius + C.colliderHysteresis) this.dropColliders(c);
      else if (!c.colliders && d <= C.colliderRadius && performance.now() - t0 < budgetMs) {
        c.colliders = c.shapes.map((m) => this.physics.createCollider(RAPIER.ColliderDesc.trimesh(m.vertices, m.indices)));
      }
    }
  }

  /** Loaded, building or built and waiting to attach. */
  private busy(k: ChunkKey) {
    return this.loaded.has(k) || this.inFlight.has(k) || this.built.has(k);
  }

  /** Keeps maxInFlight builds going; also called on every worker reply, so slow frames don't starve the worker. */
  private pump() {
    while (this.inFlight.size < C.maxInFlight && this.queue.length) {
      const key = this.queue.shift()!;
      if (this.busy(key)) continue;
      this.inFlight.add(key);
      this.worker.postMessage({ type: 'build', key } satisfies ToWorker);
    }
  }

  /** Nothing queued, building or waiting to attach. */
  get idle() {
    return !this.queue.length && !this.inFlight.size && !this.ready.length;
  }

  get stats() {
    return { loaded: this.loaded.size, pending: this.queue.length + this.inFlight.size + this.ready.length };
  }

  private receive(msg: FromWorker) {
    this.inFlight.delete(msg.key);
    if (msg.type === 'built') {
      this.failures.delete(msg.key);
      this.ready.push({ key: msg.key, out: msg.out });
      this.built.add(msg.key);
      return this.pump();
    }
    const n = (this.failures.get(msg.key) ?? 0) + 1;
    this.failures.set(msg.key, n);
    console.warn(`chunk ${msg.key}: build failed (${n}/${C.fetchRetries + 1}): ${msg.error}`);
    if (n <= C.fetchRetries && this.wanted.has(msg.key)) this.queue.push(msg.key);
    this.pump();
  }

  private attach(key: ChunkKey, out: BuildOut) {
    const a = attachBuildOut(out, this.materials, this.propMeshes);
    a.object.name = `chunk ${key}`;
    this.parent.add(a.object);
    this.loaded.set(key, { dispose: a.dispose, shapes: out.colliders, near: a.near });
  }

  private dropColliders(c: Loaded) {
    for (const col of c.colliders ?? []) this.physics.removeCollider(col, false);
    c.colliders = undefined;
  }

  private unload(key: ChunkKey) {
    const c = this.loaded.get(key)!;
    c.dispose();
    this.dropColliders(c);
    this.loaded.delete(key);
  }
}
