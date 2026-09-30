// Phase 4B track A (docs/plans/phase4b.md §5.2): loads the three NPC GLBs made by scripts/process-assets.ts
//   npc-vehicles.glb  a node per CarKind: one primitive, vertex colours + `_PAINT` (1 = body paint), extras axles / wheelRadius
//   npc-peds.glb      4 Rocketbox avatars `ped_<i>`: skinned LOD0 + LOD1 (extras lod), one atlas material, extras gender / height
//   npc-ped-anims.glb 14 clips m_* / f_*, bound by bone name
// A missing / unreadable file → console.warn + boxes / capsules / no clips (the game still runs).
import {
  type AnimationClip,
  BoxGeometry,
  type BufferAttribute,
  BufferGeometry,
  CapsuleGeometry,
  Float32BufferAttribute,
  Group,
  type InterleavedBufferAttribute,
  Mesh,
  MeshStandardMaterial,
  type Object3D,
} from 'three';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { npc, npcAssets } from '../config.ts';
import type { CarKind } from './types.ts';

export interface VehicleTemplate {
  kind: CarKind;
  geometry: BufferGeometry; // vertex colours + `_paint` (1 = body: instanceColor applies)
  axles: [number, number, number][]; // wheel centres, m (model space: pivot on the ground mid-wheelbase, nose +Z)
  wheelRadius: number; // m
}
export interface PedTemplate {
  scene: Object3D; // skinned LOD0 + LOD1 (userData.lod 0 | 1)
  gender: 'm' | 'f';
  height: number; // m
}
export interface NpcAssets {
  vehicles: Map<CarKind, VehicleTemplate>;
  peds: PedTemplate[];
  clips: Map<string, AnimationClip>; // 'm_walk', 'f_sit', …
}

const KINDS = Object.keys(npc.vehicles) as CarKind[];

/** Float32 copy of a (possibly quantised / normalised) attribute. */
function floats(a: BufferAttribute | InterleavedBufferAttribute) {
  const out = new Float32Array(a.count * a.itemSize);
  for (let i = 0; i < a.count; i++) for (let k = 0; k < a.itemSize; k++) out[i * a.itemSize + k] = a.getComponent(i, k);
  return new Float32BufferAttribute(out, a.itemSize);
}

/** The 10 vehicle templates of a loaded npc-vehicles scene; geometry in model space (node matrix baked, float attributes). */
export function prepareVehicles(scene: Object3D) {
  scene.updateMatrixWorld(true);
  const out = new Map<CarKind, VehicleTemplate>();
  for (const kind of KINDS) {
    const node = scene.getObjectByName(kind);
    const mesh = node instanceof Mesh ? node : (node?.children.find((c) => c instanceof Mesh) as Mesh | undefined);
    if (!node || !mesh) throw new Error(`NpcAssets: no node "${kind}" in the vehicles file`);
    const g = mesh.geometry;
    const geometry = new BufferGeometry();
    for (const name of ['position', 'normal', 'color', '_paint']) {
      const a = g.getAttribute(name);
      if (!a) throw new Error(`NpcAssets: ${kind} has no "${name}" attribute`);
      geometry.setAttribute(name, floats(a));
    }
    geometry.setIndex(g.index);
    geometry.applyMatrix4(mesh.matrixWorld);
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    const u = { ...node.userData, ...mesh.userData } as { axles?: [number, number, number][]; wheelRadius?: number };
    out.set(kind, { kind, geometry, axles: u.axles ?? [], wheelRadius: u.wheelRadius ?? 0 });
  }
  return out;
}

/** The avatars (`ped_0` … in file order) and the clips by name. Templates share their skeletons: clone with SkeletonUtils. */
export function preparePeds(scene: Object3D, clips: readonly AnimationClip[]) {
  // GLTFLoader makes node names unique across the file (Bip01_1, …); the clips and the mixers need the real bone names
  scene.traverse((o) => void (typeof o.userData.name === 'string' && (o.name = o.userData.name)));
  const peds = scene.children
    .filter((c) => /^ped_\d+$/.test(c.name))
    .sort((a, b) => Number(a.name.slice(4)) - Number(b.name.slice(4)))
    .map((g): PedTemplate => ({ scene: g, gender: g.userData.gender === 'f' ? 'f' : 'm', height: Number(g.userData.height) || 1.75 }));
  return { peds, clips: new Map(clips.map((c) => [c.name, c])) };
}

const WHEEL = 0.3; // m, stand-in wheels

function standInVehicles() {
  const vehicles = new Map<CarKind, VehicleTemplate>();
  for (const kind of KINDS) {
    const [w, h, l] = npc.vehicles[kind].dims;
    const geometry = new BoxGeometry(w, h, l).translate(0, h / 2, 0);
    const count = geometry.getAttribute('position').count;
    geometry.setAttribute('color', new Float32BufferAttribute(new Array<number>(count * 3).fill(1), 3));
    geometry.setAttribute('_paint', new Float32BufferAttribute(new Array<number>(count).fill(1), 1));
    const [ax, az] = [w / 2, l / 2 - WHEEL * 2];
    const axles: [number, number, number][] = w < 1 ? [] : [[ax, WHEEL, az], [-ax, WHEEL, az], [ax, WHEEL, -az], [-ax, WHEEL, -az]];
    vehicles.set(kind, { kind, geometry, axles, wheelRadius: WHEEL });
  }
  return vehicles;
}

function standInPeds() {
  const capsule = new CapsuleGeometry(0.25, 1.25).translate(0, 0.875, 0);
  const material = new MeshStandardMaterial({ color: 0x9a948a });
  return (['m', 'f', 'm', 'f'] as const).map((gender): PedTemplate => {
    const scene = new Group();
    for (const lod of [0, 1]) scene.add(Object.assign(new Mesh(capsule, material), { userData: { lod } }));
    return { scene, gender, height: 1.75 };
  });
}

export async function loadNpcAssets(): Promise<NpcAssets> {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const load = async <R>(url: string, use: (g: { scene: Object3D; animations: AnimationClip[] }) => R, fallback: () => R) => {
    try {
      return use(await loader.loadAsync(url));
    } catch (e) {
      console.warn(`NpcAssets: ${url} missing or unreadable, stand-in`, e);
      return fallback();
    }
  };
  const [vehicles, peds, clips] = await Promise.all([
    load(npcAssets.vehiclesUrl, (g) => prepareVehicles(g.scene), standInVehicles),
    load(npcAssets.pedsUrl, (g) => preparePeds(g.scene, []).peds, standInPeds),
    load(npcAssets.clipsUrl, (g) => preparePeds(g.scene, g.animations).clips, () => new Map<string, AnimationClip>()),
  ]);
  return { vehicles, peds, clips };
}
