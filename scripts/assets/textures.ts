// Phase 8C track T3 (docs/plans/phase8c-graphics.md #3 / #5, narrowed by SPEC §17.20 2026-10-03): ONLY two Poly Haven PBR
// sets → client/public/textures/<name>_{col,nrm,arm}.webp (+ _1k) with pipeline.pbrSet from <slug>_{diff,nor_gl,arm}_2k.jpg:
//   roof_slates_03 (Haussmann roofs), asphalt_02 (carriageway).
// Facade stone / zinc, sidewalk, setts, terrain sets are NOT processed (manifest.ts UNUSED refuses them).
import sharp from 'sharp';
import { pbrSet, type Target } from './pipeline.ts';

export const SETS = ['roof_slates_03', 'asphalt_02'] as const;

/** Rows [top, bottom) of the 2K source kept (then stretched back to square), so the set tiles vertically: roof_slates_03
 *  starts with a ridge strip + a row of cut slates (a bright line every tile, phase8c-review-visual #1); the kept band
 *  runs from the first full joint line (y 136) to the last (y 2044), 27 rows of ≈ 70.7 px. */
export const VERTICAL_CROP: Partial<Record<(typeof SETS)[number], [number, number]>> = { roof_slates_03: [138, 2046] };

/** Poly Haven file of one map of set `name` (relative to <assets>/8c). */
export const sourceFile = (name: string, map: 'diff' | 'nor_gl' | 'arm') => `polyhaven/textures/${name}/${name}_${map}_2k.jpg`;

export const textures: Target = async (ctx) => {
  for (const name of SETS) {
    const c = VERTICAL_CROP[name];
    const load = async (map: 'diff' | 'nor_gl' | 'arm') => {
      const f = ctx.file(sourceFile(name, map));
      if (!c) return f;
      const { width } = await sharp(f).metadata();
      return sharp(f).extract({ left: 0, top: c[0], width: width!, height: c[1] - c[0] }).resize(width!, width!, { fit: 'fill' }).png().toBuffer();
    };
    await pbrSet(name, { col: await load('diff'), nrm: await load('nor_gl'), arm: await load('arm') }, 2048, ctx.log);
  }
};
