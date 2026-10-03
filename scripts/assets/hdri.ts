// Phase 8C track T1 (docs/plans/phase8c-graphics.md #1, #9): polyhaven/hdri/kloofendal_48d_partly_cloudy_puresky_{1k,2k}.hdr
// (+ qwantani_puresky_1k.hdr spare) and three/waternormals.jpg → client/public/textures/ (sky env / background, water normals).
import type { Target } from './pipeline.ts';

export const hdri: Target = async (ctx) => ctx.log('hdri: TODO(8C T1) – HDRI (≤ 25 MB, plan §5 "HDRI") + waternormals → textures/');
