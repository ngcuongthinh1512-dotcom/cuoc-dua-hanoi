# Leg 2 landmarks – agent f2 (mf2.ts): Macau Tower, Grand Lisboa

Status: DONE (2026-10-06), not committed. Files: `client/src/world/landmarks/mf2.ts` (+ `mf2.test.ts`, 8 tests), block
`landmarks.mf2` in `client/src/config.ts`. `npx tsc --noEmit -p client` clean; `npm run test -w client` 776 pass (the
`npc/crowd.test.ts` 0.3 ms/step timing test fails only while screenshots load the machine; alone it passes). Everything is
code-built from the OSM outlines, no downloads. No screenshot preset added (custom views via `--path`).

Night convention: `neon` buckets only (unlit MeshBasic, vertex colour = linear colour × intensity × `lighting.emissiveScale`).
The chunk worker cannot tell day from night, so these lights are on by day too (like the Paris lamps; casino LEDs are on
24 h anyway). Neon is not tone-mapped: a channel > 1 clips, so hues are kept ≤ ~2.5 × and bloom (high quality) does the halo.

## macau-tower (338 m total: Wikipedia / macautower.com.mo; OSM has no height on the tower outline)
4 OSM records (foundation report), sorted by `towerPiece()`:
- the 49-pt pod ring in chunk -2_6 carrying the 16 `building:part` (mast 338 / 318 / 300, core 240, glass 219–223, pod metal
  205–219, roof 223, 8 skillion fins 74 m) → the whole tower; the 61-pt duplicate ring and the 6 × 2 m sliver in -1_6 → nothing.
- the 27-pt convention & entertainment centre (OSM h 39) → glass box on the outline (`glass` panes), concrete floor slabs every
  4.5 m, concrete flat roof, LED strip on the roof edge (`outward()` = `offsetPolyline` on the closed ring).
Build (config `landmarks.mf2.tower`): concrete shaft (profile `shaft`, r 11 → 6.8, est. from photos), 8 flared base fins
(OSM maps 8 skillion parts: kept, the brief's "three legs" set aside; concave 3-ring loft from r 9–19 m on the plaza to the
shaft at 74 m), pod (metal skin, glass observation band 210–224 with a warm lit cylinder behind it, floor disc), Skywalk terrace
at 233 m (published level 61) with railing + 24 posts (`lod: 'near'`), mast (OSM steps 240 / 300 / 318 / 338), lit purple rings
under / over the glass band and at the pod top, red beacons at 338 and 300 (OSM mid step). Pod radius 22.5 = the OSM ring.
Colliders: shaft 12-gon prism to the pod, fin feet (3 m), the centre's outline prism (renderPart).
Triangles: tower 1 472 (masonry 694, glass 96, neon 216, metal 130, metal/near 336), centre 558. Far silhouette = the non-near
buckets (everything but the railing).
PNGs: `lm-macau-tower` (night, registry view 220°/420 m), `mf2-tower-foot` (street at the foot, low) + `mf2-tower-foot-high`
(`quality=high`: glowing deck band, LED rim with bloom), `mf2-tower-far` (770 m, in the fog), `mf2-tower-day` (`&time=day`).

## grand-lisboa (261 m total)
Height: Wikipedia lists 261 m (CTBUH 258 m architectural); OSM's 211.5 on the tower outline is taken as the shell below the
crown. Used 261 (`lisboa.height`); cited in config. Shape est. from photos.
- Tower (OSM 63 × 33 m rectangle, h 211.5 → `lisboaTower`): elliptical loft on the footprint frame, scale keys 1 at the foot →
  waist 0.82 / 0.88 at 75 m → bulge 1.6 / 1.35 at 222 m → a sliver at 261 m (`lisboaScale`, smoothstep). 63 floors of 4.2 m,
  each = a lit amber band (22 %) + gold panels (masonry gold tint, 2 loft rows); the top two floors + tip brighter.
  Collider: footprint prism to the podium wall top.
- Podium (26-pt egg outline, h 54 → `lisboaPodium`): concrete walls to 18 m (renderPart, prism collider), LED egg = quarter-ellipse
  dome on the outline frame to 54 m (gold), 7 colour LED rings (`ledRows`, palette magenta / blue / cyan / amber / orange),
  entrance canopy 36 × 14 m on 4 columns at the outline point farthest to the SE (Avenida de Lisboa, `canopy.azimuth` 135) with a
  lit underside strip.
Triangles: tower 14 164 (masonry 10 610, neon 3 554), podium ≈ 1 300. Below the 25 k budget; no `near` buckets (silhouette).
PNGs: `lm-grand-lisboa` (registry view 100°/380 m), `mf2-lisboa-south` (long axis: the bulb), `mf2-lisboa-foot` (entrance,
canopy, egg), `mf2-lisboa-day`.

## Open issues
- Far view: chunks load within `loadRadius` (800 m at street level) and the fog reaches the horizon colour at ≈ 700 m, so the
  tower cannot be seen from 3 km and its lights fade out by ≈ 600 m (`mf2-tower-far`). Needs the skyline step (main.ts
  `void skyline`) or an unfogged `neon` material in `landmarks/index.ts` — both outside this agent's files.
- Headless screenshots are low quality (no bloom); the night glow was checked once at `quality=high` (`mf2-tower-foot-high`).
- Convention-centre LED rim: on a concave outline segment the strip's face can wind inward and leave a short gap (seen once
  from the foot). ponytail: a per-edge outward normal would fix it.
- Grand Lisboa: the diagonal gold lattice of the façade is not modelled (horizontal bands only); the crown is a smooth taper,
  not the feathered petals. The egg dome overhangs the narrow end of the OSM outline slightly (frame ellipse × 0.97).
- Shaft / pod radii, fin profile, Lisboa waist / bulge: estimates from photos (no published figures).
