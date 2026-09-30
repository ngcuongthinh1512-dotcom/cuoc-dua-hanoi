// Phase 4 contract (docs/plans/phase4.md §5): Rapier handles of stair colliders (highway=steps). Track D creates them
// (ChunkManager, with the chunk colliders) and removes them on unload; track B's bike refuses to ride onto them.
export const stairColliders = new Set<number>();
