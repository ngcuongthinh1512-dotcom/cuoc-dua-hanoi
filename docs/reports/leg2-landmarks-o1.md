# Leg 2 landmarks – agent o1 (m1.ts)

Status: DONE (2026-10-06), not committed. Files: `client/src/world/landmarks/m1.ts`, `m1.test.ts` (19 tests, green), block
`landmarks.m1` in `client/src/config.ts`. Everything code-built from the OSM outlines, no downloads, no screenshot preset added.

## Shared kit (m1.ts)
- Outline simplified (`simplify`, jogs < 1 m; Leal Senado 1.3 m so its 3 OSM front pieces become one 45 m façade).
- Main façade = outline edge whose outward normal best faces `az` (`facing`); pieces built in the edge's local frame
  (x along, y world, z outward) with kit.box / extrude, placed with kit.place. Cornices = offset rings round the outline.
- Windows: trim surround + pane 3 cm in front (rect / arch / pointed / round); a hashed `window.litShare` of the glass panes
  glow with `lighting.windows.colour × intensity × glow × emissiveScale` (unlit neon), the rest are dark panes. Doors / green
  shutters are their own colours.
- Night: like mf1, the floodlight is baked into unlit 'neon' vertex colours (`bakeFlood`: albedo × tint × (ambient +
  strength·|n_xz|·(1 − fade·y/H) + top·n_y) × emissiveScale). The worker knows no time of day, so façades look evenly lit by
  day as well (no sun shading / shadows on them). No real lights.
- Colliders: body prism (walls), tower / basin / court prisms, portico columns, walkable stair ramps flagged `stairs`.

## Per landmark (triangles on the real outline; PNGs in screenshots/)
| id | build | tris | PNGs |
|---|---|---|---|
| leal-senado | white 2 storeys, 11 bays, pilasters, projecting 3-bay centre + pediment (top = OSM 16.8 m), balustrade, arched door, 4 steps | 3 466 (936 near) | o1-leal-day, o1-leal-night |
| largo-senado | cream calçada draped on the terrain + black sine waves along the square (≈ 2 000 quads), fountain at OSM way/402086255 (⌀ 7.1 m): basin, waterline glow, inner tier, pedestal, bronze armillary sphere | 4 426 | o1-largo-night, o1-largo-high (quality=high), o1-fountain-day |
| santa-casa | white, arched ground floor, pilasters, balconettes, attic oculi, pediment (OSM 16.5 m) | 1 666 | seen in o1-largo-*, o1-fountain-day |
| teatro-dom-pedro | pale green + white pilasters, hipped roof, portico: 4 pairs of columns, entablature, pediment, 3 doors | 3 788 | o1-teatro-front |
| quartel-mouros | ochre, 2 storeys of white pointed-arch verandas, merlons, 4 corner towers, granite podium on the highest outline ground + central stair | 8 938 (2 832 near) | o1-quartel-night |
| casa-mandarim | house: long axis cut into hall / court slices; halls grey brick + white band, gabled dark tile roofs with 0.8 m eaves + ridge with upturned ends, court fronts with timber door, lit lattice windows, red lanterns; paved courts; moon-gate wall in the first court; site: inset compound wall with coping | 1 109 + 80 (now ≈ 1 500) | o1-mandarim-day, o1-mandarim-night (high), o1-mandarim-top |
| sao-domingos | yellow façade 21 m, white paired pilasters / cornices / shoulders / pediment + cross, green shutters, gabled nave (ridge = OSM 17.9), rear bell tower 24 m | 2 219 | o1-dom-night, o1-dom-aerial |
| se-catedral | twin towers 27 m (pyramid caps, belfries, crosses), gable front 21 m, nave 15 m + gable roof, Largo da Sé fountain (zone point) | 3 012 | o1-se-street, o1-se-night |

## Estimated vs published
Published / OSM: Leal Senado 16.8 (OSM), Santa Casa 16.5 (OSM), São Domingos ridge 17.9 (OSM), Largo fountain ⌀ 7.1 (OSM
outline). Estimated (photos): Teatro walls 11 + roof 4 (OSM 37 includes the hill), Quartel 2 × 5.4 + 1 (OSM 29.3 includes the
hill), Mandarim halls 7.5 + 3 (OSM 24.9), São Domingos façade 21 / tower 24, Sé towers 27 / gable 21 / nave 15 (OSM none),
all bay widths, column sizes, fountain tiers. Quartel colour: ochre + white (the real building); the brief said red/white stripes.

## Open issues
- `client/src/world/landmarks/parts.test.ts` "bridge / fountain outlines are left to the details…" now fails: it dispatches a
  fake outline tagged `leal-senado` expecting the generic renderer, and leal-senado now has a DetailFn. Needs a one-line change in
  that test (not my file): use an id without a detail fn or call `generic` directly.
- Registry `view`s (geo/landmarks.ts, not my file) put the `lm-*` cameras behind buildings (lm-leal-senado shows rooftops).
  Suggested: leal-senado [45, 60], santa-casa [300, 45], sao-domingos [165, 55], se-catedral [320, 60], teatro-dom-pedro [33, 40],
  quartel-mouros [45, 60], casa-mandarim: aerial only (dense block), largo-senado [225, 60].
- tsc: `landmarks/o2dbg.ts` unused variable (agent o2). `npc/crowd.test.ts` timing test fails under machine load (known).
- Calçada: a few small sidewalk patches poke through at the square's edges; stripes end in steps at the outline border.
- Façades are floodlit by day too (no sun shading); the Mandarin's House is hard to see from the street (dense block).
- Bell-tower position of São Domingos and the Sé façade orientation (NNW, towards Largo da Sé) are estimates from the outline.
