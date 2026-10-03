// Phase 8C track T3 (docs/plans/phase8c-graphics.md #3 / #5, narrowed by SPEC §17.20 2026-10-03): ONLY two Poly Haven PBR
// sets → client/public/textures/<name>_{col,nrm,arm}.webp (+ _1k) with pipeline.pbrSet from <slug>_{diff,nor_gl,arm}_2k.jpg:
//   roof_slates_03 (Haussmann roofs), asphalt_02 (carriageway).
// Facade stone / zinc, sidewalk, setts, terrain sets are NOT processed (manifest.ts UNUSED refuses them).
import type { Target } from './pipeline.ts';

export const SETS = ['roof_slates_03', 'asphalt_02'] as const;

export const textures: Target = async (ctx) => ctx.log(`textures: TODO(8C T3) – pbrSet for ${SETS.join(', ')}`);
