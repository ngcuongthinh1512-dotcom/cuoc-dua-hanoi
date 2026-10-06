# Leg 2 landmarks – agent o4 (m4.ts)

Status: DONE (2026-10-06), not committed. Files: `client/src/world/landmarks/m4.ts`, `m4.test.ts` (11 tests), block
`landmarks.m4` in `client/src/config.ts`. Everything built in code from the OSM outlines, no downloads, no preset added (custom
views via `--path`). Night: statues + the 1870 gate = `neon` with a baked floodlight (`bakeFlood`: colour × (ambient + side
light biased to the front + top) × (1 − fade·height) × `lighting.emissiveScale`; unlit, so the same by day, like mf1);
glass = `curtain` buckets with a `lit` seed (BuildingBuilder's facade shader: lit windows at night ONLY, 0 extra cost);
light strips / beacons = `neon`. No real lights. Colliders = simple prisms.

Triangles on the real chunk records (all far below 15k, no `near` buckets needed):

| id | tris | buckets | collider tris |
|---|---|---|---|
| bank-of-china | 1 532 | masonry 1 376 (lattice + crown), neon 122, metal 12, curtain 22 | 40 |
| cultural-centre | 262 | masonry 154, curtain 96, neon 12 | 104 |
| kun-iam-statue | 1 824 | neon 1 730, masonry 94 | 104 |
| portas-do-cerco | 184 (gate) + 1 041 (post) | neon / masonry / curtain | 60 + 592 |
| praca-flor-de-lotus | 1 864 | neon 1 480, masonry 384 | 176 |

Checks: `npx tsc --noEmit -p client` clean for m4 (other agents' files had transient errors); `npm run test -w client`
852 / 854 pass: the 2 failures are not m4: `npc/crowd.test.ts` timing (0.31 ms vs 0.3 under screenshot load) and
`parts.test.ts` "landmark dispatch" (its fixture outline uses the id `leal-senado`, which m1 now details: max y 16.8 ≠ 33;
the test should use an id without a DetailFn).

## bank-of-china (w/699456294)
Height 163 m, 38 floors, 1991, P&T Architects (Wikipedia "Bank of China Building, Macau", SkyscraperPage). OSM h 116.3 is
taken as the top of the main shaft; 116 → 163 = 4 stepped crown tiers (scale 0.9 / 0.76 / 0.6 / 0.44 of the outline about its
centroid, tops 126 / 134 / 141 / 147 m), pyramid to 156 m, mast to 163 m with a red beacon. Shaft = curtain glass on the OSM
outline + granite diamond lattice (both diagonals per cell, 9 × 8.2 m cells fitted per face, strips 0.55 m, 0.18 / 0.21 m out:
no shared plane). Lit cool-white edge band on every tier top.
Estimates: tier scales / heights, lattice cell size, colours.
PNGs: `lm-bank-of-china`, `o4-boc-day`, `o4-boc-night`, `o4-boc-day2`, `o4-boc-night2` (crown from the SE).

## cultural-centre (w/192179917)
Macau Cultural Centre (1999, Bruno Soares / O-BS – Intergaup – Caldeira Cabral; Grand Auditorium + Macao Museum of Art).
OSM h 25.6 = the auditorium block. Build: glazed lobby band 0–5.5 m (curtain, lit), stone walls to 16 m with a ribbon window
10–12.2 m, flat roof; the auditorium block over the rounded end (frame +u = the end with more outline vertices,
`roundEndFrame`) with a skillion roof 21 → 25.6 m and an upturned cantilevered roof ("sail") 11 m past it, rising 6 m, LED
tip strip. Estimates: everything but 25.6 m (no published shape figures found; the upturned roof is from memory of photos).
PNGs: `lm-cultural-centre`, `o4-cc-day`, `o4-cc-day2` (from the NW), `o4-cc-night`.

## kun-iam-statue (w/231068755)
Published: statue 20 m, bronze, on a lotus-dome base 7 m high, 19 m across, 16 petals, housing the Kun Iam Ecumenical
Centre (1999, Cristina Leiria) (gcs.gov.mo / tourism pages; some quote 32 m in all). OSM outline = the base (r ≈ 9.7 ✓).
Build: 0.8 m stone plinth, 16-petal scalloped dome (64 segments), hooded robed figure (elliptical lathe, 14-key profile,
depth 0.72) with two hanging sleeves, 4 floodlight boxes in front; floodlit gold. Facing 300° (est., towards the NAPE shore).
Estimates: figure profile, facing, plinth.
PNGs: `lm-kun-iam-statue`, `o4-kuniam-day`, `o4-kuniam-night`.

## praca-flor-de-lotus (park w/192179907)
Published: "Lotus Flower in Full Bloom", gilded bronze, 6 m high, 3.6 m across, 6.5 t, on 23 red granite pieces in three
lotus-leaf layers (Wikipedia "Lotus Square"; ICM handover museum). **Found: n/7668244537 is NOT this statue** (it is a 1995
"Estátua de Lotus" 220 m north); the golden lotus is OSM w/192179914 (`tourism=artwork`, 1999-12-20, r ≈ 6.4 m) in the middle
of the square. Config `at` = its centroid (22.194427, 113.553406). Build: 3 scalloped granite tiers (r 6.4 / 5 / 3.6), stem,
pod, 22 cupped double-sided petals in 3 layers (≈ 6 m), paving disc r 8.5 at the highest terrain under it + skirt; floodlit gold
+ red granite.
PNGs: `o4-lotus-day`, `o4-lotus-night` (both taken at the old node position, statue look), `lm-praca-flor-de-lotus` (the square).

## portas-do-cerco (w/173864406 gate, w/138665744 border post)
Gate (1870–71, four dates on its face): fitted to the 19 × 3 m OSM outline: 9 m central block with a 4.2 m arch (springing 4.4 m),
pilasters, cornice at 9.5 m, attic, pointed crest (≈ 13.8 m), low wings 4.8 m to the outline ends; floodlit granite. It stands
in a notch of the post outline (7 m clear). Post (2004, steel and glass): curtain walls (lit windows) to 15 m, 4 m cladding
band to 19 m (est.), flat roof, LED roof edge. The plaza viaduct already comes from the road / bridge data.
Estimates: all gate proportions, post height.
PNGs: `lm-portas-do-cerco`, `o4-gate-day`, `o4-gate-night`.

## Open issues (need files outside m4)
1. **Golden lotus hidden**: w/192179914 is not registered, so BuildingBuilder extrudes it as a plain 20 m cylinder
   (defaultHeight) right where the statue stands. Fix (coordinator): add `'way/192179914'` to `praca-flor-de-lotus.osm` in
   `client/src/geo/landmarks.ts` and rerun `npm run build-chunks`; m4.ts already returns nothing for that record (tested).
   The registry `view` / preset then also aims at the statue.
2. The DEM under Lotus Square slopes ≈ 6 m over the 17 m disc (reclaimed land): the paving stands on the highest point with a
   skirt (a raised plinth on the low side). A `PADS` entry for the square (geo/landmarks.ts) would level it.
3. `curtain` buckets carry `lit`: any other landmark that emits a `curtain` bucket WITHOUT `lit` in the same chunk (1_1: Grand
   Lisboa / Hotel Lisboa; 4_-11, 5_3, 6_2) makes `mergeBuckets` throw → that chunk's landmarks fall back. mf2 / m3 must use
   `new MeshBuffer('curtain', true)` too if they use curtain.
4. Neon (statues, gate, strips) is unlit, so the floodlit look is there by day as well (same convention as mf1 / mf2).
5. The Bank of China crown is partly masked from the south by a taller generic tower behind it.
6. Headless screenshots are low quality (no bloom). Running `--path` presets while another agent's file had a syntax error
   once fell back to the default presets (`topdown`, `player`, `debug` PNGs were overwritten, nothing else).
