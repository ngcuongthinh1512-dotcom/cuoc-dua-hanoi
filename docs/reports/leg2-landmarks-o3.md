# Leg 2 landmarks – agent o3 (m3.ts): Hotel Lisboa, Wynn, MGM, Sands, Fisherman's Wharf

Status: DONE (2026-10-06), not committed. Files: `client/src/world/landmarks/m3.ts`, `m3.test.ts` (19 tests), block
`landmarks.m3` in `client/src/config.ts`. Everything code-built from the OSM records, no downloads, no screenshot preset
added (custom `?cam=` views via `--path`). `npx tsc --noEmit -p client` clean; `npm run test -w client`: 837 pass, 2 fail
not mine (`parts.test.ts` dispatch test builds the outline as `leal-senado`, now drawn by the m2 agent's details;
`npc/crowd.test.ts` timing under screenshot load, passes alone).

Night convention (same as mf2): every light is a `neon` bucket (unlit MeshBasic, linear colour × bright ×
`lighting.emissiveScale`), so they also show by day (the chunk worker knows no time; casino LEDs are on all day anyway).
No real lights. New shared pieces inside m3.ts: a 5 × 7 **bulb font** (`signRuns`) for rooftop signs (LISBOA, WYNN, MGM,
SANDS: two faces back to back on a dark board), `strip` (lit band around an outline, both faces → no winding gaps on
concave outlines), `ribs` (vertical lit ribs along an outline = the gold "lattice"), `sections` (cut a footprint along its
long axis). Reuses `outward` / `keyed` from mf2.ts.

Triangles on the real chunk data (all records of the landmark, far / `near`): Lisboa 5 134 / 0 · Wynn 5 392 / 920 ·
MGM 7 350 / 1 460 · Sands 2 184 / 0 · Fisherman's Wharf 3 980 / 612. All ≤ 20 k.

## hotel-lisboa (zone records)
- 37.4 m round drum (r ≈ 22 m, inside the podium outline) = Casino Lisboa rotunda: drum wall to 23 m + gold metal
  "birdcage" crown to the OSM 37.4 m (bulging profile `cage`), 36 lit gold ribs + 7 bulb rings.
- 76.8 m tower: cream metal skin, lit band every 3.2 m, LED rim, red bulb sign **LISBOA** on the roof.
- 27.8 m hotel/podium: cream walls, 3 bulb strips + lit gold ribs every 4.5 m (the lattice façade seen from the street).
- `roof` canopies: generic. Ground of every piece = terrain at its centroid: the podium outline climbs the slope to the NE
  and `recordGround` put it 12 m up, burying the drum.
- PNGs: `lm-hotel-lisboa`, `o3-lisboa-sw` (night), `o3-lisboa-street` (street level, the lattice), `o3-lisboa-day`,
  `o3-lisboa-high` (quality=high, bloom).

## wynn-macau
- Wynn (OSM 94.5 m) and Encore (OSM 177.5 m): curved bronze-gold metal slabs, lit band per 3.6 m floor, gold LED rim;
  red bulb sign **WYNN** on the Wynn roof (the real signature logo is script, not modelled).
- Podium (relation/6279959, 23.1 m, with its courtyard hole): cream walls, gold rim + ribs every 7 m.
- Performance Lake: the water is already in water.json; 31 glowing jets on 3 rings (16 / 9 / 6 m) + blue lit feet at the
  OSM node "Fountain Show" (n/4874240221, x 622 z 564).
- The untagged 10 × 15 m pavilion by the lake (way/422413328) kept at 6 m (`wynn.kiosk`) instead of the 20 m default;
  the other small records generic.
- PNGs: `lm-wynn-macau` (registry view is blocked by a near building), `o3-wynn-west`, `o3-wynn-lake`, `o3-wynn-day`.

## mgm-macau
- Tower (OSM 120 m, 40 levels): outline cut in 3 equal slices along its long axis = the waves in gold / silver / rose
  gold, tops 100 / 111 / 120 m rising west → east (the two lower tops are estimates), lit floor bands, rims; **MGM** sign
  (gold bulbs) on the tallest.
- Podium (OSM 20.3 m): gold rim + ribs every 6 m; Grande Praça glass barrel vault (50 × 26 × 9 m, est.) at the OSM node
  n/12438388701 with metal ribs (`near`).
- Golden lion (OSM way/823036882, from the podium record's artwork point): round plinth (collider) with a lit ring, seated
  lion of 11 ellipsoids (≈ 7 m, est.), unlit gold shaded brighter downwards = floodlit look.
- PNGs: `lm-mgm-macau`, `o3-mgm-south`, `o3-mgm-lion`, `o3-mgm-day`.

## sands-macau
- OSM 46.7 m outline: gold metal skin, gold LED grid (5 bands + ribs every 5 m), rim, red **SANDS** sign on the roof.
- The round 61.8 m tower at the north end and the 116.7 m / Sands Macao Hotel blocks are separate plain OSM buildings, not
  part of the landmark (left generic).
- PNGs: `lm-sands-macau`, `o3-sands-east`, `o3-sands-north`.

## fisherman-wharf
- Site polygon (relation/4257072, kind `artwork`): **Colosseum** arcade wrapping the plain OSM "Roman Amphitheatre"
  building (way/192180012, no height → 20 m default block, not part of the landmark): ellipse x 1708 z 17, half-axes 49 ×
  26 (fitted to its outline), tiers 8 / 8 / 6 m, 34 arched bays per tier with lit arch outlines, cornices, pilasters
  (`near`), lit crown, a floor disc over the block's roof; collider = the elliptical prism. **Lighthouse** 18 m (red /
  white bands, lit lantern) on the site's outline point farthest to the ESE, 8 m back.
- Convention centre (relation/10387813, h 20.8): generic walls + LED rim + a 3-step "Babylon" ziggurat roof.
- PNGs: `lm-fisherman-wharf` (registry view frames Sands more than the wharf), `o3-wharf-colosseum`, `o3-wharf-air`,
  `o3-wharf-south` (lighthouse), `o3-wharf-day`.

## Estimated vs published
Published / OSM: all heights above are OSM (Lisboa 27.8 / 37.4 / 76.8, Wynn 94.5, Encore 177.5, MGM 120 + 20.3, Sands 46.7,
convention centre 20.8); opening years in comments (Lisboa 1970, Sands 2004, Wharf 2005, Wynn 2006, MGM 2007, Encore 2010).
Estimated: cage profile and drum split (23 m), MGM lower wave tops (100 / 111), the three MGM tones' order, vault and
lion sizes, Colosseum height and arch count, ziggurat, lighthouse size, sign sizes, all colours and brightness.

## Open issues
- Fisherman's Wharf: the Babylon casino's real roofs and the volcano are not modelled; the ziggurat sits on the convention
  centre (the only wharf building in the landmark). "Dancing Water" is at City of Dreams (Cotai), outside the map: not built.
  The plain amphitheatre / pavilion buildings around stay generic (they are not landmark records; a `zone` on the wharf
  in the registry + build-chunks rerun would hand them over).
- Signs are block bulb letters (no Chinese characters, no Wynn script / MGM lion logo).
- The registry views of `lm-wynn-macau` / `lm-fisherman-wharf` are not great (registry is not mine to change);
  suggestion: wynn `view: [250, 260]`, fisherman-wharf `view: [230, 180]`.
- Config race: once, my read-modify-write of config.ts collided with another agent's edit and left two stray lines at
  the end of the file (fixed; someone else fixed them too). Later edits used small Edit calls only.
