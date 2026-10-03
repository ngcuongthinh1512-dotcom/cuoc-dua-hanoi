// Phase 8C track T2 (SPEC §17.20: the ONLY landmark upgraded): sketchfab/day_135_flame_of_liberty_-_1scanaday.glb (edemaistre,
// CC BY 4.0, 19 MB, 335k triangles, 4K texture) → client/public/models/lm-flamme.glb (≤ 1.5 MB): the scan cut to its round
// paving (the square around it dropped), centred on the column, the plaza level at y = 0, scaled so the paving disc
// matches the OSM outline (way/92316094, Ø ≈ 6 m: the scan comes out ≈ 1:1, total height ≈ 3.9 m), simplified, 2K WebP.
// Placed by client/src/world/landmarks/models.ts (MODELS 'flamme' + g1.modelPose); the collider stays g2's pedestal box.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { graphics8c } from '../../client/src/config.ts';
import type { ChunkData } from '../../client/src/geo/chunkData.ts';
import { footprintFrame } from '../../client/src/world/landmarks/kit.ts';
import { PUBLIC, type Target } from './pipeline.ts';
import { bounds, crop, move, readSoups, writeGlb } from './props.ts';

export const flamme: Target = async (ctx) => {
  const S = graphics8c.flamme.scan;
  const soups = await readSoups(ctx.file('sketchfab/day_135_flame_of_liberty_-_1scanaday.glb'));
  const chunk = JSON.parse(readFileSync(join(PUBLIC, 'data/chunks', `${S.chunk}.json`), 'utf8')) as ChunkData;
  const rec = chunk.buildings.find((b) => b.landmark === 'flamme');
  if (!rec) throw new Error(`flamme: no outline in chunk ${S.chunk}`);
  const f = footprintFrame(rec.outer);
  const k = (f.a + f.b) / 2 / S.disc;
  const [cx, cz] = S.axis;
  const kept = crop(soups, (x, _y, z) => Math.hypot(x - cx!, z - cz!) <= S.disc + 0.05);
  const out = move(kept, { from: [cx!, S.floor, cz!], scale: [k, k, k] });
  const b = bounds(out);
  ctx.log(`  flamme: outline r ${((f.a + f.b) / 2).toFixed(2)} m → scale ${k.toFixed(3)}; ${b.lo.map((v) => v.toFixed(2))} → ${b.hi.map((v) => v.toFixed(2))}`);
  await writeGlb('models/lm-flamme.glb', [{ name: 'flamme', soups: out, maxTris: S.tris }], S.texture, ctx.log);
};
