// Phase 8C track T3 (docs/plans/phase8c-graphics.md #3 / #5, narrowed by SPEC §17.20 2026-10-03): ONLY two Poly Haven PBR
// sets → client/public/textures/<name>_{col,nrm,arm}.webp (+ _1k) with pipeline.pbrSet from <slug>_{diff,nor_gl,arm}_2k.jpg:
//   roof_slates_03 (Haussmann roofs), asphalt_02 (carriageway).
// Facade stone / zinc, sidewalk, setts, terrain sets are NOT processed (manifest.ts UNUSED refuses them).
import { pbrSet, type Target } from './pipeline.ts';

export const SETS = ['roof_slates_03', 'asphalt_02'] as const;

/** Poly Haven file of one map of set `name` (relative to <assets>/8c). */
export const sourceFile = (name: string, map: 'diff' | 'nor_gl' | 'arm') => `polyhaven/textures/${name}/${name}_${map}_2k.jpg`;

export const textures: Target = async (ctx) => {
  for (const name of SETS) {
    await pbrSet(name, { col: ctx.file(sourceFile(name, 'diff')), nrm: ctx.file(sourceFile(name, 'nor_gl')), arm: ctx.file(sourceFile(name, 'arm')) }, 2048, ctx.log);
  }
};
