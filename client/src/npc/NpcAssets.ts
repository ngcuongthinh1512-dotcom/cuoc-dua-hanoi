// STUB (foundation, docs/plans/phase4b.md §4): track A replaces loadNpcAssets with the GLB loader (§5.2 signatures),
// keeping this box / capsule fallback for a missing file. Boxes of npc.vehicles dims, 4 capsules of 1.75 m, no clips.
import { type AnimationClip, BoxGeometry, type BufferGeometry, CapsuleGeometry, Float32BufferAttribute, Group, Mesh, MeshStandardMaterial, type Object3D } from 'three';
import { npc } from '../config.ts';
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

const WHEEL = 0.3; // m, stub wheels

export async function loadNpcAssets(): Promise<NpcAssets> {
  const vehicles = new Map<CarKind, VehicleTemplate>();
  for (const [kind, v] of Object.entries(npc.vehicles) as [CarKind, (typeof npc.vehicles)[CarKind]][]) {
    const [w, h, l] = v.dims;
    const geometry = new BoxGeometry(w, h, l).translate(0, h / 2, 0);
    const count = geometry.getAttribute('position').count;
    geometry.setAttribute('color', new Float32BufferAttribute(new Array<number>(count * 3).fill(1), 3));
    geometry.setAttribute('_paint', new Float32BufferAttribute(new Array<number>(count).fill(1), 1));
    const [ax, az] = [w / 2, l / 2 - WHEEL * 2];
    const axles: [number, number, number][] = w < 1 ? [] : [[ax, WHEEL, az], [-ax, WHEEL, az], [ax, WHEEL, -az], [-ax, WHEEL, -az]];
    vehicles.set(kind, { kind, geometry, axles, wheelRadius: WHEEL });
  }
  const capsule = new CapsuleGeometry(0.25, 1.25).translate(0, 0.875, 0);
  const material = new MeshStandardMaterial({ color: 0x9a948a });
  const peds = (['m', 'f', 'm', 'f'] as const).map((gender) => {
    const scene = new Group();
    for (const lod of [0, 1]) scene.add(Object.assign(new Mesh(capsule, material), { userData: { lod } }));
    return { scene, gender, height: 1.75 };
  });
  return { vehicles, peds, clips: new Map() };
}
