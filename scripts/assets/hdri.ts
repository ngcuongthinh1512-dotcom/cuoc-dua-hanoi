// Phase 8C track T1 (docs/plans/phase8c-graphics.md #1, #9): Poly Haven kloofendal_48d_partly_cloudy_puresky (CC0) .hdr
// 2K (high quality) + 1K (low) and three's waternormals.jpg (MIT) → client/public/textures/ as they are (world/Sky.ts,
// world/Water.ts). Copied, not re-encoded: Radiance .hdr is already RLE, the JPG would only lose detail.
// qwantani_puresky_1k.hdr stays in the cache (spare sky, not shipped).
import { readFileSync } from 'node:fs';
import { type Target, writePublic } from './pipeline.ts';

export const HDRI = 'kloofendal_48d_partly_cloudy_puresky';

export const hdri: Target = async (ctx) => {
  for (const size of ['2k', '1k']) writePublic(`textures/sky_${size}.hdr`, readFileSync(ctx.file(`polyhaven/hdri/${HDRI}_${size}.hdr`)), ctx.log);
  writePublic('textures/waternormals.jpg', readFileSync(ctx.file('three/waternormals.jpg')), ctx.log);
};
