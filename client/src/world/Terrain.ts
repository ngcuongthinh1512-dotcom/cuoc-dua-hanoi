// Package D: per-chunk terrain mesh, river carving, the global Rapier heightfield.
// STUB from Phase 2 step 0: final signatures, empty bodies (docs/plans/phase2.md).
// Module top level must not touch the DOM: the worker imports build*(); canvas textures only inside create*().
import type RAPIER from '@dimforge/rapier3d-compat';
import type { Material } from 'three';
import type { WaterData } from '../geo/chunkData.ts';
import type { HeightGrid } from '../geo/heightGrid.ts';
import type { Builder, MaterialId } from './buildTypes.ts';

export const buildTerrain: Builder = () => ({ meshes: [], instances: [], colliders: [] });

/** Main thread, once at startup, BEFORE the grid goes to the worker: carves the Seine bed and raises the quays in place. */
export function carveRiver(_grid: HeightGrid, _water: WaterData): void {}

/** One static heightfield collider for the whole (carved) grid. */
export function createTerrainCollider(_world: RAPIER.World, _grid: HeightGrid): void {}

export function createTerrainMaterials(): Partial<Record<MaterialId, Material>> {
  return {};
}
