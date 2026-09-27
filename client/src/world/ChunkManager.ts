// Chunk streaming (SPEC §4.4): builds chunks around the camera in the worker, attaches them on the main thread within a
// per-frame budget, unloads far ones (geometry, sign textures, colliders).
import RAPIER from '@dimforge/rapier3d-compat';
import type { Object3D } from 'three';
import { chunks as C } from '../config.ts';
import { type ChunkKey, chunkBounds } from '../geo/chunkData.ts';
import { attachBuildOut, type Materials, type PropMeshes } from './attach.ts';
import type { BuildOut, FromWorker, ToWorker } from './buildTypes.ts';

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

/** Load radius for a camera at height y: a high camera (topdown) sees, and loads, everything. */
export const loadRadius = (y: number) => Math.max(C.loadRadius, y * C.altitudeFactor);

type Loaded = { dispose(): void; colliders: RAPIER.Collider[] };

export class ChunkManager {
  private readonly loaded = new Map<ChunkKey, Loaded>();
  private readonly inFlight = new Set<ChunkKey>();
  private readonly ready: { key: ChunkKey; out: BuildOut }[] = [];
  private readonly failures = new Map<ChunkKey, number>();
  private wanted = new Set<ChunkKey>();
  private queue: ChunkKey[] = [];
  private lastX = NaN;
  private lastZ = NaN;
  private lastR = NaN;

  constructor(
    private readonly worker: Worker,
    private readonly keys: readonly ChunkKey[],
    private readonly parent: Object3D,
    private readonly physics: RAPIER.World,
    private readonly materials: Materials,
    private readonly propMeshes: PropMeshes,
  ) {
    worker.onmessage = (e: MessageEvent<FromWorker>) => this.receive(e.data);
    worker.onerror = (e) => console.warn('chunk worker error:', e.message);
  }

  /** Once per frame. budgetMs = attach time allowed this frame (Infinity before the first __READY__). */
  update(x: number, y: number, z: number, budgetMs: number) {
    const r = loadRadius(y);
    // Re-plan only after moving ≥ 10 m (the sort over ~370 keys is cheap, but not every frame).
    if (!(Math.hypot(x - this.lastX, z - this.lastZ) < 10 && r === this.lastR)) {
      [this.lastX, this.lastZ, this.lastR] = [x, z, r];
      const near = chunksInRadius(this.keys, x, z, r);
      this.wanted = new Set(near);
      this.queue = near.filter((k) => !this.loaded.has(k) && !this.inFlight.has(k) && (this.failures.get(k) ?? 0) <= C.fetchRetries);
      const keep = r + C.unloadRadius - C.loadRadius;
      for (const [k] of this.loaded) if (chunkDistance(k, x, z) > keep) this.unload(k);
    }
    while (this.inFlight.size < C.maxInFlight && this.queue.length) {
      const key = this.queue.shift()!;
      if (this.loaded.has(key) || this.inFlight.has(key)) continue;
      this.inFlight.add(key);
      this.worker.postMessage({ type: 'build', key } satisfies ToWorker);
    }
    const t0 = performance.now();
    while (this.ready.length && performance.now() - t0 < budgetMs) {
      const { key, out } = this.ready.shift()!;
      if (this.wanted.has(key) && !this.loaded.has(key)) this.attach(key, out);
      else for (const t of out.textures ?? []) t.image.close();
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
      return;
    }
    const n = (this.failures.get(msg.key) ?? 0) + 1;
    this.failures.set(msg.key, n);
    console.warn(`chunk ${msg.key}: build failed (${n}/${C.fetchRetries + 1}): ${msg.error}`);
    if (n <= C.fetchRetries && this.wanted.has(msg.key)) this.queue.push(msg.key);
  }

  private attach(key: ChunkKey, out: BuildOut) {
    const a = attachBuildOut(out, this.materials, this.propMeshes);
    a.object.name = `chunk ${key}`;
    this.parent.add(a.object);
    const colliders = out.colliders.map((c) => this.physics.createCollider(RAPIER.ColliderDesc.trimesh(c.vertices, c.indices)));
    this.loaded.set(key, { dispose: a.dispose, colliders });
  }

  private unload(key: ChunkKey) {
    const c = this.loaded.get(key)!;
    c.dispose();
    for (const col of c.colliders) this.physics.removeCollider(col, false);
    this.loaded.delete(key);
  }
}
