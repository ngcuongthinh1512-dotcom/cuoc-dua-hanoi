// Package E: landmark placeholders (Eiffel = 4 open legs, Arc, Louvre pyramid, obelisk; SPEC §17.4), built per chunk
// from BuildingRecs carrying .landmark: 'stone' / 'iron' / 'glass' buckets + trimesh colliders.
// STUB from Phase 2 step 0: final signatures, empty bodies (docs/plans/phase2.md).
// Module top level must not touch the DOM: the worker imports build*(); canvas textures only inside create*().
import type { Material } from 'three';
import type { Builder, MaterialId } from './buildTypes.ts';

export const buildLandmarks: Builder = () => ({ meshes: [], instances: [], colliders: [] });

export function createLandmarkMaterials(): Partial<Record<MaterialId, Material>> {
  return {};
}
