# Leg 2 – Macao building style (BuildingBuilder)

Status: DONE (2026-10-06). `npx tsc --noEmit -p client` OK, `npm run test -w client` 769 passed / 40 skipped (incl. allChunks).

## What changed
- `client/src/world/BuildingBuilder.ts`: the Parisian "windows" branch is gone. Per building (hash01 of its first vertex,
  config `buildings.macao`):
  - **Colonial** (low-rise): pastel tint (cream yellow, ochre, pink, salmon, pale blue, mint, white, lilac) on a white plaster
    texture; white cornice band per floor, white window surrounds, no shutters; tile lower floor = corniced rectangular
    windows, upper floor = round-arched with keystone. 60 % of those ≤ 20 m / ≤ 1500 m² get a low terracotta hip roof
    (rise 1.6 m, inset 3.5 m, the old mansard geometry reused).
  - **Tenement** (`tenement`, new material): grey / washed-colour tiled concrete, rain streaks, wide aluminium windows, steel
    window cages, AC units. For `yes/apartments/residential/dormitory/mixed` ≥ 15 m (75 %), all non-towers 25–35 m, and the
    concrete-grid towers (beige palette).
  - **Towers** (≥ 35 m; 25–35 m blended by height): 40 % glass curtain wall (`curtain`, new material: spandrels, mullions,
    blue / teal / grey tint, roughness 0.25), the rest concrete grid; flat grey roof + one plant box (largest roof triangle).
  - **Shop band** 0–4.5 m on street faces of every windowed building ≥ 7 m: Chinese signboards (red / blue / yellow / green,
    character blocks), lit shop interiors with goods, one roller shutter per 4 bays.
  - Windows now on all kinds except `blankKinds` (roof, garage, shed, storage_tank, warehouse…).
  - White trim stays white: the facade materials (`facadeMaterial`) tint by vertex colour only where map alpha ≥ 0.9
    (alpha convention: ≥ 0.9 wall, 0.5–0.9 trim/frames/signs/AC, ≤ 0.5 glass; output alpha forced to 1).
  - Haussmann path kept for Leg 1 (`haussmannHeight`, still [0, 0] = off); its Paris wall/shop canvases were replaced.
- `client/src/config.ts` `buildings.macao`: thresholds, palettes (sRGB), hip roof, plant box, `litShare: 0.35`.
- Small helpers: `MaterialId` + `VERTEX_COLOR` gain `tenement`, `curtain` (buildTypes.ts, attach.ts fallback colours);
  `MeshBucket.lit` (buildTypes.ts), `MeshBuffer(material, withLit)` + `.lit` + mergeBuckets (geom.ts), attach.ts sets the
  `lit` attribute, chunkBuild.ts transfers it.

## Night data path (for the lighting agent)
- Geometry attribute **`lit`** (float, 1 per vertex) on the `wall`, `tenement`, `curtain`, `shopfront` buckets; constant per
  building: `0` = windows dark, `(0, 1]` = lit, the value is the building's seed (≈ 35 % lit, `buildings.macao.litShare`).
  Per-window variation: hash(floor(uv), lit) in the shader (uv: u = bays, v = floors).
- Window mask = facade map alpha ≤ 0.5 (glass). The four facade materials already use `onBeforeCompile` (replacing
  `#include <color_fragment>`, cache keys `facade` / `facade-masked`): chain onto it rather than overwrite.
- Daytime look unchanged by the attribute (nothing reads it yet).

## Budgets (all 323 chunks, buildings only)
- Triangles: 173 179 → 288 970 total (+67 %: shop bands, hip slopes, plant boxes); max per chunk 6 340 → 9 056 (cap 60 000).
- Buckets per chunk: 2 → max 5 (wall, tenement, curtain, shopfront, roof; cap 16). Screenshot draw calls ≈ +70–110.
- Build time (Node, all chunks): ≈ 94–124 ms → 130–152 ms.

## Screenshots (`SCREENSHOT_PORT=5191`, `&time=day` for the after shots: timeOfDay is now night)
- Before: `bs-before-senado`, `-praia`, `-nape`, `-oldtown`, `-zonea`.
- After: `bs-after-senado`, `-praia` (cam), `-praia-street` (`?player=-430,640,0`), `-nape` (`cam=1450,80,450,20,-12`),
  `-oldtown` (`cam=0,260,350,0,-40`), `-zonea` (`cam=2100,300,-800,0,-40`), `-senado-night`.

## Open issues
- Window variant (arched vs corniced) alternates per floor, not per building (one texture; a per-building choice needs a
  shader atlas).
- Tall blank party walls stay plain (pre-existing; neighbours split across chunks get facades).
- Tower textures from far read as a fine dot grid; no podium/tower split; hip roofs use the tinted slate PBR map.
