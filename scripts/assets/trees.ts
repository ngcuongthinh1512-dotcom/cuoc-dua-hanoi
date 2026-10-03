// Phase 8C track T2 (docs/plans/phase8c-graphics.md #2): bark_platanus (Poly Haven) + LeafSet030 (ambientCG zip, Opacity →
// alpha) → textures/ (pbrSet / toWebp); the tree geometry procedural (client side, or a trees.glb via optimizeGlb).
import type { Target } from './pipeline.ts';

export const trees: Target = async (ctx) => ctx.log('trees: TODO(8C T2) – bark + leaf textures (+ trees.glb, 3 LODs)');
