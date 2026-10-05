# Leg 2 – scripts/ Vitest suite (Macao)

Goal: `npx vitest run --dir scripts` green on the Macao data. Baseline before this pass: **23 failed / 98 passed** (121 tests;
build-graph 3, geo 1, leg-check 17, sim 2). Only files under `scripts/` changed (+ this report). No data file, leg, production
code or `client/src/config.ts` touched. Final run: see "Result" at the bottom.

Every Macao coordinate below was checked against the data (chunks, roadgraph, water.json) with throw-away probes (deleted) or by the
test's own asserts (`map.waterAt` / `map.onBridge` / `snapB` …).

## scripts/build-graph.test.ts (3 tests)
- `one dominant walk component`: Macao's main walk component is 86.6 % of the nodes (Paris > 95 %). Threshold `> 0.85` (measured − ~1.5
  points), with a comment saying so.
- `A* … cross the Seine on a bridge`: Macao has no river on the peninsula. Two routes whose walk path must contain a `WayFlag.bridge` edge:
  sea inlet footbridge Av. de Tai On (22.20696,113.56546 → 22.20377,113.55858, ratio 1.22 < 1.3) and the Av. Dr. Sun Yat-Sen bridge over the
  lake (22.18188,113.53959 → 22.18500,113.54835, ratio 1.02 < 1.9). Assertions unchanged.
- `surfaceAt`: sett Place de la Concorde → `大三巴街 Rua de S. Paulo` (residential, `pave`); Rue de Rivoli asphalt → Avenida de Almeida
  Ribeiro centre line (22.19417, 113.53889). The oneway loop is untouched.

## scripts/geo.test.ts (1 failing + 1 cosmetic)
- `tileGrid` point test: Eiffel → Ruínas de São Paulo (22.19758, 113.54086).
- Web-Mercator formula test (passed anyway, pure math): Concorde → the origin Largo do Senado, expected z14 tile [13359, 7155].

## scripts/leg-check.test.ts (17 failing → 15 converted, 2 skipped)
- `macao-demo`: now expects **no warning** (the Paris L6 warning was the Bir-Hakeim walkway); the Phase 8 "bundled legs" test likewise
  (`toEqual([])` instead of `toHaveLength(1)`).
- `insideBuilding()` helper now searches the chunks around Largo do Senado (22.1935, 113.5393).
- `summary lists every point…`: derived from `mini.json` itself (L1 lat/lon/yaw/rack via `toFixed(5)`, same formatter as the tool; `+x.toFixed(1)`
  because the tool prints numbers: `43` not `43.0`), street `Rua do Dr. Soares, Quận 5`.
- `suggests a bike rack…`: Macao OSM has no `amenity=bicycle_parking` (`roadgraph.bikeParking` is empty) → SYNTHETIC rack: a patched map
  (`Object.create(map.graph)` with `file.bikeParking`) with one rack 90 m east of L2; asserts "cách 90 m" + the `"bikeParking": {lat 22…, lon 113…}` line.
- `river` test: the loop that searched the Seine → the Inner Harbour (22.19, 113.5295), asserted `waterAt === 'river'` and not on a bridge.
- `leak scan … street / landmark name`: `Avenue des Champs-Élysées` → `亞婆井斜巷 Calçada do Lilau` (an OSM name shipped in chunk -2_2); second string text neutralised.
- `Bir-Hakeim viaduct over land`: → pedestrian overpass at Av. de Lisboa (22.19051, 113.54417): `onBridge` true (graph bridge edge), no water, no
  carriageway. Chunk bridge polygons do not exist in the Macao chunks, so this exercises the graph fallback of `onBridge`.
- `disconnected footpath`: (22.19699, 113.54838), 34.6 m from the main walk network (asserted `snapB > 20`).
- `fountain basin / carriageway`: pond of the garden at Ponte das Nove Curvas (22.20086, 113.5485; non-river polygon) + Avenida de Almeida
  Ribeiro centre line (22.19417, 113.53889); the expected message carries the bilingual OSM name.
- `inside a building`: regex now `22.\d{5}, 113.\d{5}`; the "landmark name" third part is split into its own `it.skip` (below).
- bike-rack off-map / far tests: Paris numbers → Macao (21.8601 / 114.2972 off the map; ≈ 680 m east of T1 at 22.1972, 113.5514), the expected
  numbers are read from the mutated leg object instead of being hard-coded.
- `the table…`: branch place names / radii are read from `mini.json` (the leg was edited by someone else while I worked: no hard-coded copy).
- `static scan (F1)`: place-name answer `cau alexandre iii` → `亞婆井斜巷 calcada do lilau` (same name, other case / no cedilla).

### Skipped (2)
- `inside a landmark building: its name comes first` — `// Leg 2:` `LANDMARKS` (client/src/geo/landmarks.ts) is empty, no building carries a landmark id. The
  Paris assertion shape is kept with a placeholder point (TODO: re-enable with the first registered Macao landmark).
- `under the Arc de Triomphe … is not inside a building; in a pier it is` — Paris-only feature (`landmarks.g1.arc`, `building.landmark === 'arc'`). Body kept
  as is, skipped.

## scripts/sim.test.ts + scripts/sim.ts (2)
- `sim --leg louvre`: the "Jardin du Carrousel" start (48.8617, 2.3314) lived in the TEST (`nearLouvre()`), not in a leg. → 22.19, 113.54217 (Avenida
  Doutor Mário Soares, 233 m crow / 294 m on foot from the L-LV box, on the main walk network, no building / water / carriageway). Green.
- `--full`, `cleared >= 1`: **not a Paris/Macao data problem, a stale sim since SPEC §17.29 (Shift sprint ×2).** The scenario relied on "speedup 2 flags
  everybody" (comment in the test). Since the sprint commit the server's speed limit is `footSpeed × SPRINT_MULTIPLIER × tolerance` (RaceRoom.onPose,
  15 m/s at footSpeed 6) while `playLeg`'s bot walks ≤ 0.95 × footSpeed × bikeMult × tolerance (9.3 m/s apparent at speedup 2), so no bot is ever flagged,
  `flagged = 0` and the Host bot has nothing to clear (the sprint report says sim was deliberately not run). By the same reading the Paris repo fails the same way (not run there: I never touch it).
  Fix (kept the test's intent, no weaker assertion): `PlayOptions.speeder` in `scripts/sim.ts` — in `--full` bot 1 walks at 1.1 × the flag limit
  (16.5 m/s apparent, still under the trusted-point rate 19.5 m/s so it is never held back) → one red flag → the Host bot's `scenarioMoves` clears it.
  `scenarioFailed` / the report text are untouched. `scripts/sim.ts` is a dev tool, but it is not a test file: revert the 3 hunks (import
  `SPRINT_MULTIPLIER`, `speeder` option + `v` expression, `speeder: opts.full && b.i === 0`) if the orchestrator prefers the conditional assertion
  (`flagged > 0 ⇒ cleared ≥ 1`, what `scenarioFailed` already encodes).

## Suspected real issues / leftovers (not changed, outside scripts tests)
1. `scripts/leg-check.ts` (production tool) still prints Paris text: the warning "nằm trên đoạn cầu bắc qua đất … (giữa cầu Bir-Hakeim trên đảo Île aux Cygnes: bình
   thường)"; "nằm giữa sông" for the SEA polygon; the district label is "Quận N" for a freguesia. `OPEN_KINDS` / `underArc` still use `landmarks.g1.arc`.
2. `scripts/sim.ts` USAGE example `--leg ~/Documents/chang-that/paris-1.json` and the "bị đánh dấu là bình thường" note at --speedup > 1 (only the `--full` speeder is
   flagged now).
3. `compactMini()` (sim.test.ts) offsets spots NW of the leg start every 35 m: from Largo do Pagode da Barra that line crosses the harbour. Works because the test
   server has no terrain; only worth fixing if a terrain-aware check is added.
4. `leg-check` suggests bike racks only from `roadgraph.bikeParking`: empty for Macao, so every point prints "Chưa có bãi xe" until racks are added to the leg by hand.
5. `worker/legs/test/mini.json` / `full.json` were modified by another agent at 03:39 while I worked (branch place names changed). The tests I touched read those names from the file.

## Result
`npx vitest run --dir scripts`: **10 files passed; 120 tests passed, 2 skipped, 0 failed** (122 tests: the Palais-de-Tokyo landmark part was split
out of the "inside a building" test into its own skipped test). Before: 23 failed / 98 passed / 121.
