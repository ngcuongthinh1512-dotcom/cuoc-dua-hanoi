// models.ts fallback: an unreadable GLB is warned and replaced by the procedural stand-in (never a crash).
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { withFallbacks } from '../attach.ts';
import { createPropMeshes } from '../StreetProps.ts';
import { createLandmarkModels, MODELS } from './models.ts';

const PUBLIC = new URL('../../../public/', import.meta.url);

afterEach(() => vi.unstubAllGlobals());

describe('createLandmarkModels', () => {
  it('missing GLB → console.warn and an LOD holding only the procedural stand-in', async () => {
    const arc = MODELS.find((m) => m.id === 'arc')!;
    const chunk = readFileSync(new URL(`data/chunks/${arc.key}.json`, PUBLIC), 'utf8');
    vi.stubGlobal('fetch', async (url: string | URL | Request) =>
      String(url instanceof Request ? url.url : url).endsWith(`chunks/${arc.key}.json`) ? new Response(chunk) : new Response('', { status: 404 }),
    );
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const models = createLandmarkModels('http://test/data/', () => 0, withFallbacks({}), createPropMeshes());
    const group = new THREE.Group();
    new THREE.Scene().add(group);
    models.attach(arc.key, group);
    await vi.waitFor(() => expect(group.children).toHaveLength(1));
    const lod = group.children[0] as THREE.LOD;
    expect(lod).toBeInstanceOf(THREE.LOD);
    expect(lod.levels).toHaveLength(1);
    let meshes = 0;
    lod.levels[0]!.object.traverse((o) => void (o instanceof THREE.Mesh && meshes++));
    expect(meshes).toBeGreaterThan(0);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('missing or unreadable'), expect.anything());
    expect(models.idle).toBe(true);
    warn.mockRestore();
  });
});
