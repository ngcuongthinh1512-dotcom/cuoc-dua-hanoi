// Package D: the global water mesh (Seine + other water bodies) and quay-wall strips.
// STUB from Phase 2 step 0: final signatures, empty bodies (docs/plans/phase2.md).
// Module top level must not touch the DOM: the worker imports build*(); canvas textures only inside create*().
import type { Scene } from 'three';
import type { WaterData } from '../geo/chunkData.ts';
import type { HeightGrid } from '../geo/heightGrid.ts';

/** Adds the water to the scene (after carveRiver); call update(dt) every frame (scrolling normal map). */
export function createWater(_scene: Scene, _water: WaterData, _grid: HeightGrid): { update(dt: number): void } {
  return { update() {} };
}
