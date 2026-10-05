// Downloaded landmark models (main thread only: the chunk worker cannot load GLB). Leg 2 (Macao): none, every landmark is
// built by code (docs/plans/leg2-landmarks.md); the Paris Eiffel / Arc / Flamme loader is removed (git history of the Paris repo).
// ponytail: empty hook kept so main.ts / ChunkManager stay unchanged; put a GLB loader back here if a Macao model is ever approved.
import type * as THREE from 'three';
import type { ChunkKey } from '../../geo/chunkData.ts';
import type { Materials, PropMeshes } from '../attach.ts';
import { propAssetsIdle } from '../StreetProps.ts';

export const MODELS: readonly { id: string; key: string; url: string; farParts: boolean }[] = [];

export function createLandmarkModels(_dataUrl: string, _height: (x: number, z: number) => number, _materials: Materials, _props: PropMeshes) {
  return {
    attach(_key: ChunkKey, _group: THREE.Object3D) {},
    /** For __READY__: street-furniture models and tree textures (Phase 8C). */
    get idle() {
      return propAssetsIdle();
    },
  };
}
