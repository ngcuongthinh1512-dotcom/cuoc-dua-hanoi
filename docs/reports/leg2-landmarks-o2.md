# Leg 2 landmarks – agent o2 (m2.ts)

Status: DONE (2026-10-06), not committed. Files: `client/src/world/landmarks/m2.ts`, `m2.test.ts` (15 tests), config
`landmarks.m2` in `client/src/config.ts`. `npx tsc --noEmit -p client` clean; `npm run test -w client` 853 pass, 1 fail
not mine: `parts.test.ts` "landmark dispatch" expects the generic renderer for `leal-senado` (h 33), but o1's m1.ts now
details that id (test must pick an id without details, or be updated by o1 / the orchestrator).

Everything is built in code from the OSM outlines, no downloads. Night = `neon` buckets only (unlit, × `lighting.emissiveScale`;
the chunk worker cannot tell day from night, so they show by day as coloured glass / a pale band): red lanterns, warm lit
windows, the lighthouse lantern, incense embers, uplighter boxes and a lit crest strip on the fort walls (the floodlit look,
readable from afar). No real lights. Each record keeps one buffer per (material, colour, lod), merged per material.

## Request to the orchestrator (registry + build-chunks, not my files)
Generic OSM buildings stand INSIDE three outlines with heights above sea level and ruin them:
- Monte: Museu de Macau w/319660138 (h 62 → a 10-storey tower on the terrace).
- Guia: 5 buildings inside the fort (one h 97.8, a pink 4-storey block next to the lighthouse = chapel / keeper houses).
- Lou Lim Ioc: the hall on the pond island (4-storey apartment look) + a small round pavilion.
Fix: add `zone` = the outline itself to `fortaleza-monte` (way/46510080), `fortaleza-guia` (way/404669396),
`jardim-lou-lim-ioc` (way/265433531) and rerun build-chunks. m2.ts already renders zone members: museum = low block 5 m above
the terrace; Guia = 5.5 m white houses with tiled hipped roofs; Lou Lim Ioc = Chinese hall (white walls, grey curved roof) /
4-sided pavilion below 60 m². Tested with synthetic records, not yet seen on screen.

## Per landmark (triangles on the real chunks; PNGs in `screenshots/o2/`)
| id | tris | PNGs | built |
|---|---|---|---|
| fortaleza-monte | ≈ 4 000 (cannons 528 near) | monte-b (day, above), monte-n, monte-street, monte-gate | terrace 1 m over the highest DEM point inside, battered outer wall down the slope to the terrain (the hill now reads as a fortified platform), 1.1 m parapet + merlons, 24 cannons in embrasures (near), gate gap + steps (ramp collider) on the edge facing 60°, uplighters + lit crest |
| fortaleza-guia | ≈ 1 600 | guia-a (day), guia-n, guia-light | walls 3.2 m following the hilltop terrain, merlons, 3 m gate gap facing 170°, uplighters + crest |
| farol-guia | ≈ 600 | guia-a, guia-light | 15 m white tower (OSM 104.2 ignored): plinth, tapering shaft, gallery + railing, lit lantern, dark dome, vane; 3 windows + door |
| templo-ama | ≈ 3 000 | ama-a/b/c (day), ama-n, lm-ama-hall | 4 terraces climbing east from the Barra square (floor = highest DEM of each), granite gate with opening, curved green roof, lions, 4 lanterns, front flight + side steps, 3 halls (red columns, door, lit windows, curved hip roofs, ridge ornaments), 12 incense coils with embers, 2 boulders; the square relation builds nothing |
| kun-iam-tong | ≈ 1 650 (3 halls) | kit-a/b (day), kit-n | each OSM hall = Chinese hall facing 212° (porch, lanterns, lit windows, curved roof, Shiwan ceramic figures on the ridge); the main record gets a 10 m forecourt with urn, lions, steps |
| jardim-lou-lim-ioc | ≈ 2 100 | lou-a/b/top (day), lou-gate (night), lou-pav | white wall + grey coping along the park outline, moon gate (round opening, walkable) on the SW edge, hexagonal + square pavilions by the pond, rockery; the zig-zag bridge and the pond already come from OSM (BridgeBuilder / water.json), so no bridge of mine |
| sao-lourenco | ≈ 930 | slo-a (day), slo-n | platform 1.6 m + steps, nave with gable roof and lit side windows, twin towers (domes, belfry openings), pediment + cross, pilasters, cream / white |
| santo-agostinho | ≈ 540 | sag-b (day) | platform + steps, full-width pediment façade facing the Largo (200°), pilasters, cornices, lit windows, yellow / white |
| ermida-penha | ≈ 420 + residence | pen-b (day) | chapel with a single front tower (pyramid cap, belfry, door, lit window), gable nave; the large outline = bishop's residence (10 m, hipped tiled roof) |

All well under 15k; fine parts (cannons, lions, coils, ridge figures, lighthouse railing) are `lod: 'near'`. Colliders:
platforms, terraces, walls (incl. merlons), halls, gate pieces, moon-gate posts, pavilion bases, rockery core, steps as ramps.

## Estimated vs published
Published: Monte 1617–1626, ≈ 10 000 m²; Guia lighthouse 1865, ≈ 15 m tower (Wikipedia); A-Ma 1488; Kun Iam Tong 1627;
Lou Lim Ioc 1906. Estimated (photos): every wall / parapet / batter / merlon size, Monte terrace rise and cannon count, Guia wall
height, lighthouse radii, A-Ma tier depths / hall sizes / gate size, hall eaves and roof rises, church wall / tower / façade
heights (OSM 40.5 / 39.2 / 73.3 count the hill), façade azimuths (São Lourenço 195° from the wide south end, Penha 45°), colours.

## Open issues
- The zone request above (biggest visual problem at Monte and Guia).
- DEM is coarse: A-Ma's front terrace ends ≈ 4 m above the square (long front stair); the Lou Lim Ioc pond sits ≈ 3 m above
  the DEM there (Water.ts rule, not mine).
- Lit crest / windows / lanterns are visible by day too (no day/night in the worker); crest intensity `glow.crest` 0.75.
- Not built: Capela da Guia as such (inside the zone request), the Monte museum interior, garden trees (Vegetation), fort
  floodlighting of the wall faces (only crest strip + uplighter boxes).
