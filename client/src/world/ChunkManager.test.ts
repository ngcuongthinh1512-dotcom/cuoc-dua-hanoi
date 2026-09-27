import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { chunks as C } from '../config.ts';
import { flatHeightGrid } from '../geo/heightGrid.ts';
import { withFallbacks } from './attach.ts';
import type { FromWorker, ToWorker } from './buildTypes.ts';
import { buildChunk, emptyChunk } from './chunkBuild.ts';
import { ChunkManager, chunksInRadius, loadRadius } from './ChunkManager.ts';
import { createPropMeshes } from './StreetProps.ts';

beforeAll(() => RAPIER.init());

const grid9 = Array.from({ length: 81 }, (_, n) => `${(n % 9) - 4}_${Math.floor(n / 9) - 4}`); // -4..4 × -4..4

describe('chunksInRadius', () => {
  it('keeps chunks whose square is within r, nearest first', () => {
    expect(chunksInRadius(grid9, 10, 10, 0)).toEqual(['0_0']);
    const r = chunksInRadius(grid9, 125, 125, 250); // centre of 0_0: its 8 neighbours touch at ≤ 125·√2
    expect(r[0]).toBe('0_0');
    expect(r).toHaveLength(9);
    expect(new Set(r.slice(1, 5))).toEqual(new Set(['-1_0', '1_0', '0_-1', '0_1'])); // edges (125 m) before corners
  });
  it('a high camera loads more', () => {
    expect(loadRadius(10)).toBe(C.loadRadius);
    expect(loadRadius(3800)).toBe(3800 * C.altitudeFactor);
  });
});

describe('ChunkManager', () => {
  it('builds nearby chunks, retries failures, unloads far ones and frees their colliders', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const sent: string[] = [];
    const worker = { postMessage: (m: ToWorker) => m.type === 'build' && sent.push(m.key) } as unknown as Worker;
    const reply = (m: FromWorker) => worker.onmessage!({ data: m } as MessageEvent);
    const physics = new RAPIER.World({ x: 0, y: 0, z: 0 });
    const scene = new THREE.Group();
    const m = new ChunkManager(worker, grid9, scene, physics, withFallbacks({}), createPropMeshes());
    const grid = flatHeightGrid();
    const built = (key: string): FromWorker => {
      const out = buildChunk(emptyChunk(key), grid);
      out.colliders = [{ vertices: Float32Array.of(0, 0, 0, 1, 0, 0, 0, 0, 1), indices: Uint32Array.of(0, 1, 2) }];
      return { type: 'built', key, out, ms: 1 };
    };

    const near = chunksInRadius(grid9, 125, 125, C.loadRadius);
    m.update(125, 2, 125, Infinity);
    expect(sent).toEqual(near.slice(0, C.maxInFlight)); // nearest first, capped in flight
    reply({ type: 'failed', key: sent.shift()!, error: 'HTTP 503' }); // requeued, built on a later try
    for (let guard = 0; guard < 100 && !m.idle; guard++) {
      for (const k of sent.splice(0)) reply(built(k));
      m.update(125, 2, 125, Infinity);
    }
    expect(m.idle).toBe(true);
    expect(m.stats.loaded).toBe(near.length);
    expect(scene.children).toHaveLength(near.length);
    expect(physics.colliders.len()).toBe(near.length);

    m.update(125 + 3000, 2, 125, Infinity); // far away: everything beyond radius + 200 m goes
    expect(m.stats.loaded).toBe(0);
    expect(scene.children).toHaveLength(0);
    expect(physics.colliders.len()).toBe(0);
  });
});
