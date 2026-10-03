// Phase 8C track T2 (docs/plans/phase8c-graphics.md #4; SPEC §17.20: no Wallace fountain): sketchfab/{french_colonne_morris,
// abribus_*, bouquinistes, mini_paris_bench, animated_bird_pigeon}.glb, polyhaven/{street_lamp_01, outdoor_table_chair_set_01} (glTF +
// textures), commons/posters/*.jpg → client/public/models/props.glb (one node per prop, optimizeGlb: ≤ 300–1 200 tris,
// 1K textures) + textures/ posters.
import type { Target } from './pipeline.ts';

export const props: Target = async (ctx) => ctx.log('props: TODO(8C T2) – optimizeGlb per prop → models/props.glb');
