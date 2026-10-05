# Leg 2 landmarks: foundation (Việc nền)

Done 2026-10-06. `npm run build` and `npm test` green; `lm-<id>` presets rendered for all 31 ids (default extruded blocks).

## id → chunk (build-chunks, after rerun; no old Paris id remains)
Columns per record: chunk key, polygon points, height, parts, kind.

| id | records (chunk, polygon points, height, parts, kind) |
|---|---|
| ruinas-sao-paulo | 0_-2|4pts|h=26.4|parts=0|ruins; 0_-2|8pts|h=-|parts=0|ruins |
| sao-domingos | 0_-1|19pts|h=17.9|parts=0|yes |
| se-catedral | 0_0|13pts|h=-|parts=0|church |
| sao-lourenco | -2_1|32pts|h=40.5|parts=0|church |
| santo-agostinho | -1_0|15pts|h=39.2|parts=0|church |
| ermida-penha | -2_2|8pts|h=-|parts=0|yes; -2_2|17pts|h=73.3|parts=0|yes |
| leal-senado | 0_0|37pts|h=16.8|parts=0|public |
| largo-senado | 0_-1|12pts|h=-|parts=0|artwork |
| santa-casa | 0_-1|8pts|h=16.5|parts=0|yes |
| casa-mandarim | -3_2|26pts|h=-|parts=0|artwork; -3_2|24pts|h=24.9|parts=0|yes |
| quartel-mouros | -3_2|4pts|h=29.3|parts=0|yes |
| teatro-dom-pedro | -1_0|21pts|h=37|parts=0|yes |
| fortaleza-monte | 1_-2|25pts|h=57.1|parts=0|yes |
| fortaleza-guia | 4_-2|19pts|h=-|parts=0|ruins |
| farol-guia | 4_-2|19pts|h=104.2|parts=0|yes |
| templo-ama | -4_3|15pts|h=8.2|parts=0|yes; -4_3|30pts|h=-|parts=0|artwork |
| kun-iam-tong | 4_-5|7pts|h=-|parts=0|temple; 4_-5|4pts|h=17.4|parts=0|yes; 4_-5|4pts|h=-|parts=0|yes |
| jardim-lou-lim-ioc | 3_-4|18pts|h=-|parts=0|artwork |
| hotel-lisboa | 1_1|4pts|h=-|parts=0|roof; 1_1|5pts|h=-|parts=0|roof; 1_1|19pts|h=37.4|parts=0|yes; 1_1|15pts|h=-|parts=0|roof; 2_1|8pts|h=76.8|parts=0|apartments; 2_1|19pts|h=-|parts=0|roof; 2_1|62pts|h=27.8|parts=0|hotel |
| wynn-macau | 2_2|15pts|h=94.5|parts=0|yes; 2_2|4pts|h=-|parts=0|yes; 3_1|5pts|h=27.2|parts=0|yes; 3_1|8pts|h=33.8|parts=0|yes; 3_2|13pts|h=177.5|parts=0|yes; 3_2|7pts|h=-|parts=0|yes; 3_2|33pts|h=23.1|parts=0|yes |
| mgm-macau | 3_3|28pts|h=20.3|parts=0|yes; 3_3|33pts|h=120|parts=0|yes |
| sands-macau | 6_0|49pts|h=46.7|parts=0|yes |
| bank-of-china | 1_1|11pts|h=116.3|parts=0|office |
| fisherman-wharf | 6_-1|35pts|h=20.8|parts=0|commercial; 7_0|95pts|h=-|parts=0|artwork |
| cultural-centre | 6_2|24pts|h=25.6|parts=0|yes |
| kun-iam-statue | 5_3|24pts|h=20|parts=0|yes |
| portas-do-cerco | 4_-10|4pts|h=-|parts=0|yes; 4_-11|149pts|h=-|parts=0|yes |
| praca-flor-de-lotus | 5_-1|4pts|h=-|parts=0|artwork |
| macau-tower | -1_5|27pts|h=39|parts=0|commercial; -1_6|4pts|h=-|parts=1|yes; -2_6|61pts|h=-|parts=0|yes; -2_6|49pts|h=-|parts=16|yes |
| grand-lisboa | 1_1|26pts|h=54|parts=0|yes; 1_1|4pts|h=211.5|parts=0|yes |
| science-center | 7_3|79pts|h=-|parts=0|civic |
old ids: [] count 31

## Groups (plan §4, last table)
m1 = sao-domingos, se-catedral, sao-lourenco, santo-agostinho, ermida-penha · m2 = leal-senado, largo-senado, santa-casa, casa-mandarim, quartel-mouros, teatro-dom-pedro · m3 = fortaleza-monte, fortaleza-guia, farol-guia, templo-ama, kun-iam-tong, jardim-lou-lim-ioc · m4 = hotel-lisboa, wynn-macau, mgm-macau, sands-macau, bank-of-china, fisherman-wharf, cultural-centre, kun-iam-statue, portas-do-cerco, praca-flor-de-lotus · mf1 = ruinas-sao-paulo, science-center · mf2 = macau-tower, grand-lisboa.

## Outline choices and doubts
- `largo-senado`: no polygon covers (0,0). Two identical-bbox highway=pedestrian areas named Largo do Senado exist (w/192573684, w/713100572, ≈ 1800 m², centroid ≈ 63 m E / 27 m N of ORIGIN); registered w/192573684 only (the other is a duplicate). Kind `artwork` (not extruded).
- `kun-iam-tong`: n/2165428407 is a bus stop. Registered the three halls 40–60 m away: w/895766783 (building=temple), w/1111251970 (Tianhou Hall), w/1111251972 (Shakya Mani Hall). Not 100 % sure these three are the whole complex.
- `kun-iam-statue`: w/231068755 is the Kun Iam Ecumenical Centre footprint tagged tourism=artwork, h 20 = the statue; no separate statue outline exists. Its plaza is w/192179912 (pedestrian, not registered).
- `praca-flor-de-lotus`: park w/192179907 (8694 m², 4 corners, kind `artwork`). The golden lotus statue is node n/7668244537 (22.19643, 113.55285, historic=monument): build-chunks does not keep such nodes, the group places it from lat/lon.
- `hotel-lisboa`: w/1313391925 is a resort site polygon with no building: used as `zone` (7 records: 3 towers 37 / 37 / 77 m, hotel 27.8 m, roofs). `wynn-macau`: relation/6279959 + `zone` w/1215820171 (Wynn 94.5, Encore 177.5, Encore Tower, podium 23.1). `fisherman-wharf`: r/4257072 is the whole site (131 000 m², kind `artwork`, not extruded) + r/10387813.
- `ruinas-sao-paulo`, `fortaleza-guia`: historic=ruins|fort with no building tag. build-chunks now gives them kind `ruins` (solid, extruded) instead of `artwork` (`scripts/build-chunks.ts`). Side effect: leg-check and mapData.test treat `ruins` as walkable because demo L1 stands on the Ruínas steps polygon; plan §5.2 moves L1 in front, then both can drop it.
- Heights: only `macau-tower` 338 m (Wikipedia / macautower.com.mo). Left out: ruinas (OSM 26.4 on the façade outline; the 27 m guess not confirmed), se-catedral, fortaleza-guia, science-center (no OSM height, no figure I am sure of). `farol-guia`: OSM h 104.2 = hill + tower, the real tower is ≈ 15 m; registry `height` is only a fallback so it cannot override OSM: the m3 agent must cap it itself.
- `view` azimuths are guesses; `templo-ama` (270/130) and `grand-lisboa` (100/380) were corrected after a first look. Ruínas / Grand Lisboa / A-Ma screenshots checked by eye: blocks show; A-Ma is small behind trees and flats.

## Deleted / changed
- Deleted: `world/landmarks/g1…g5.ts` + tests, `models.test.ts`, `client/public/models/{eiffel,arc,lm-flamme}.glb`, `scripts/assets/flamme.ts` (+ its two tests in `props.test.ts`), the Paris scan targets `eiffel` / `arc` in `scripts/process-assets.ts` (and its now-unused helpers), the Crazy Horse `neonSign` material in `landmarks/index.ts`, 3 skipped Paris tests in `mapData.test.ts`. `credits.json` untouched.
- `models.ts`: `MODELS = []`, `createLandmarkModels` is an empty hook (`attach` no-op, `idle` = `propAssetsIdle()`), no warns.
- New: `m1.ts m2.ts m3.ts m4.ts mf1.ts mf2.ts` (empty `details`), merged in `index.ts`.
- `config.ts`: `landmarks.g1…g5` → empty `m1 m2 m3 m4 mf1 mf2` blocks. Left alone: top-level `flamme` block and `graphics8c.flamme` (Paris leftovers, harmless; the agent owning those blocks may delete them), `materials.neonSign` id in `buildTypes.ts` / `attach.ts` (type only).
- `scripts/leg-check.ts`: Eiffel / Arc special cases removed. `scripts/screenshot.ts`: `eiffel`, `p3-bridge`, `p3-eiffel` presets removed; `leg-L*` FACING now Macao ids (L3 has no registered landmark → no preset). `geo/fixture.ts` test landmark `eiffel` → `macau-tower`. `parts.test.ts` dispatch test uses the real `leal-senado`.
- `scripts/leg-check.test.ts`: test "inside a landmark building: its name comes first" re-enabled with a point inside Leal Senado (22.19333, 113.53938).
