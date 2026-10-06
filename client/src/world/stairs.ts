import { MeshBasicMaterial } from 'three';
import { lighting } from '../config.ts';
import type { Materials } from './attach.ts';
import { nightHdr } from './glow.ts';
import { isNight } from './night.ts';

// Phase 4 contract (docs/plans/phase4.md §5): Rapier handles of stair colliders (highway=steps). Track D creates them
// (ChunkManager, with the chunk colliders) and removes them on unload; track B's bike refuses to ride onto them.
export const stairColliders = new Set<number>();

/** Night (lighting.stairs): the 'stairGlow' nosing strips (StairBuilder) as unlit HDR light; by day the material is
 *  invisible (the chunk worker builds the same strips day and night): no draw call, the stairs look as before. */
export function createStairMaterials(): Partial<Materials> {
  const S = lighting.stairs;
  return { stairGlow: new MeshBasicMaterial({ color: nightHdr(S.colour, S.intensity), visible: isNight() }) };
}
