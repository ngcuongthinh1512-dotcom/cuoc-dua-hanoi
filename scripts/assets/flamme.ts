// Phase 8C track T2 (SPEC §17.20: the ONLY landmark upgraded): sketchfab/day_135_flame_of_liberty_-_1scanaday.glb (edemaistre,
// CC BY 4.0, 19 MB) → client/public/models/lm-flamme.glb (optimizeGlb: ≤ 150k tris, ≤ 1.5 MB target, 2K texture, base cut),
// placed by client/src/world/landmarks/models.ts MODELS (+ g1.modelPose for 'flamme'; collider stays the worker's).
import type { Target } from './pipeline.ts';

export const flamme: Target = async (ctx) => ctx.log('flamme: TODO(8C T2) – optimizeGlb → models/lm-flamme.glb');
