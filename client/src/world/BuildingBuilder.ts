// Package B: Haussmann buildings from BuildingRecs (skips recs with .landmark, see Landmarks.ts).
// STUB from Phase 2 step 0: final signatures, empty bodies (docs/plans/phase2.md).
// Module top level must not touch the DOM: the worker imports build*(); canvas textures only inside create*().
import type { Material } from 'three';
import type { Builder, MaterialId } from './buildTypes.ts';

export const buildBuildings: Builder = () => ({ meshes: [], instances: [], colliders: [] });

export function createBuildingMaterials(): Partial<Record<MaterialId, Material>> {
  return {};
}
