// Package C: road ribbons, sidewalks, centre lines from RoadRecs.
// STUB from Phase 2 step 0: final signatures, empty bodies (docs/plans/phase2.md).
// Module top level must not touch the DOM: the worker imports build*(); canvas textures only inside create*().
import type { Material } from 'three';
import type { Builder, MaterialId } from './buildTypes.ts';

export const buildRoads: Builder = () => ({ meshes: [], instances: [], colliders: [] });

/** Road and bridge materials (asphalt, pave, sidewalk, marking, bridge, railing). */
export function createRoadMaterials(): Partial<Record<MaterialId, Material>> {
  return {};
}
