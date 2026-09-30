// Downloaded landmark models (docs/plans/phase2b-assets.md §5.8), main thread only: the chunk worker cannot load GLB.
// When ChunkManager attaches a model's chunk (onAttach hook), the chunk JSON is read again (browser-cached) for the
// OSM outline, the GLB (public/models, made by scripts/process-assets.ts, meshopt) is loaded once and placed with
// g1.modelPose (the same pose as the colliders the worker built). Arc: THREE.LOD, the GLB within detailDistance,
// the generic OSM parts beyond. Eiffel: the GLB at every distance (57k triangles; its parts are never extruded).
// A missing or unreadable GLB is warned and replaced by a procedural stand-in at every distance (the colliders come
// from the worker either way).
import * as THREE from 'three';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { landmarks as L } from '../../config.ts';
import { type BuildingRec, type ChunkData, type ChunkKey, chunkBounds } from '../../geo/chunkData.ts';
import { LANDMARK_BY_ID } from '../../geo/landmarks.ts';
import { attachBuildOut, type Materials, type PropMeshes } from '../attach.ts';
import type { BuildOut } from '../buildTypes.ts';
import { eiffelLegs, modelPose } from './g1.ts';
import { generic } from './index.ts';
import { recordGround, renderPart, Sink } from './parts.ts';

const G = L.g1;

/** key = the chunk holding the outline (build-chunks puts a record in the chunk of its centroid; checked by g1.test). */
export const MODELS = [
  { id: 'eiffel', key: '-8_3', url: 'models/eiffel.glb', farParts: false },
  { id: 'arc', key: '-8_-4', url: 'models/arc.glb', farParts: true },
] as const;

export function createLandmarkModels(dataUrl: string, height: (x: number, z: number) => number, materials: Materials, props: PropMeshes) {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const placed = new Map<string, Promise<THREE.Object3D | undefined>>(); // id → placed object, reused on re-attach
  let pending = 0;

  async function build(m: (typeof MODELS)[number]): Promise<THREE.Object3D | undefined> {
    const res = await fetch(`${dataUrl}chunks/${m.key}.json`);
    if (!res.ok) throw new Error(`chunk ${m.key}: HTTP ${res.status}`);
    const rec = ((await res.json()) as ChunkData).buildings.find((b: BuildingRec) => b.landmark === m.id);
    if (!rec) throw new Error(`no ${m.id} outline in chunk ${m.key}`);
    const ground = recordGround(rec.outer, height);
    const pose = modelPose(rec, ground.minGround, m.id);
    const root = new THREE.LOD();
    root.name = `landmark model ${m.id}`;
    root.position.set(pose.x, pose.y, pose.z);
    root.rotation.y = pose.yaw;
    root.updateMatrix();
    /** Procedural stand-in from the OSM parts (Eiffel: parts without its outline + the collider legs), world → local. */
    const procedural = () => {
      let out: BuildOut;
      if (m.id === 'eiffel') {
        const sink = new Sink();
        for (const p of rec.parts ?? []) renderPart(p, { ground: ground.ground, height, fallbackTop: G.eiffel.height }, sink);
        out = sink.out();
        out.meshes.push(eiffelLegs(rec, ground.minGround, 'metal'));
      } else {
        out = generic(rec, rec.parts ?? [], { key: m.key, bounds: chunkBounds(m.key), height, def: LANDMARK_BY_ID.get(m.id)!, ...ground });
      }
      const o = attachBuildOut(out, materials, props).object;
      o.applyMatrix4(root.matrix.clone().invert());
      return o;
    };
    try {
      const model = (await loader.loadAsync(m.url)).scene;
      model.traverse((o) => {
        if (!(o instanceof THREE.Mesh)) return;
        o.castShadow = o.receiveShadow = true;
        if (m.id === 'eiffel') (o.material as THREE.MeshStandardMaterial).color.set(G.eiffel.colour);
      });
      model.scale.set(pose.scale, 1, pose.scale);
      root.addLevel(model, 0);
      if (m.farParts) root.addLevel(procedural(), L.detailDistance);
    } catch (err) {
      console.warn(`landmark model ${m.url} missing or unreadable, procedural stand-in:`, err);
      root.addLevel(procedural(), 0);
    }
    return root;
  }

  return {
    /** ChunkManager hook: adds the models of chunk `key` to its group (they leave with it on unload). */
    attach(key: ChunkKey, group: THREE.Object3D) {
      for (const m of MODELS) {
        if (m.key !== key) continue;
        if (!placed.has(m.id)) {
          pending++;
          placed.set(
            m.id,
            build(m)
              .catch((err: unknown) => void console.warn(`landmark model ${m.id} failed:`, err))
              .finally(() => pending--),
          );
        }
        void placed.get(m.id)!.then((o) => o && group.parent && group.add(o));
      }
    },
    /** No model load in flight (for __READY__). */
    get idle() {
      return pending === 0;
    },
  };
}
