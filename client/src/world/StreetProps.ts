// Package E: lamps, Morris columns, metro entrances (InstanceSets) and street-name signs ('sign' bucket + atlas texture).
// STUB from Phase 2 step 0: final signatures, empty bodies (docs/plans/phase2.md).
// Module top level must not touch the DOM: the worker imports build*(); canvas textures only inside create*().
import { BoxGeometry, type BufferGeometry, type Material, MeshStandardMaterial } from 'three';
import type { Builder, MaterialId, PropKind } from './buildTypes.ts';

export const buildStreetProps: Builder = () => ({ meshes: [], instances: [], colliders: [] });

/** The 'sign' material (its per-chunk atlas arrives as BuildOut.textures and is set on a clone, see attach.ts). */
export function createPropMaterials(): Partial<Record<MaterialId, Material>> {
  return {};
}

/** Shared mesh per instanced prop kind (≤ props.maxTriangles each), origin at its foot. */
export function createPropMeshes(): Record<PropKind, { geometry: BufferGeometry; material: Material }> {
  // ponytail: placeholder boxes until package E models the props.
  const box = (w: number, h: number, color: number) => ({
    geometry: new BoxGeometry(w, h, w).translate(0, h / 2, 0),
    material: new MeshStandardMaterial({ color }),
  });
  return { tree: box(4, 10, 0x4f7a3a), lamp: box(0.3, 5, 0x2a2d30), morris: box(1.2, 3.5, 0x2f5a3a), metro: box(3, 3, 0x3d5a3a) };
}
