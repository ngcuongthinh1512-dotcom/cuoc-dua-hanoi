# Phase 2 plan: Paris map (OSM + DEM → chunks → streamed 3D world)

Base: start from the **Phase 1 commit**, not 546d077, because Phase 2 edits Phase 1's `config.ts`, `main.ts` and `DebugOverlay.ts`. Integration branch `phase2`. One worktree per package at `"<root>/.claude/worktrees/p2-<X>"`, branch `p2/<X>`. In each worktree run `npm ci --prefer-offline`, then screenshot with `SCREENSHOT_PORT=518N npm run screenshot <preset>` (N unique per package). No package installs dependencies after step 0. No new key bindings in Phase 2.

## Step 0: contract (1 agent, about 45 min, merged to `phase2` before anything else)

1. **Deps (the only lockfile change in Phase 2):** add root devDependency `osmtogeojson`, plus `@types/geojson` if its typings need it. It is used by scripts only and never bundled. Also add the root script `"build-chunks": "tsx scripts/build-chunks.ts"`.
   - Skipped: @turf/turf (rect clip and scanline are about 30 lines), three-mesh-bvh (camera collision is Phase 3), meshoptimizer/Draco/KTX2 (all geometry is procedural, there are no assets).
   - Triangulation uses `THREE.ShapeUtils`, which is already installed.
2. **`client/src/geo/chunkData.ts`:** the data format. It must stay DOM-free and three-free because `scripts/build-chunks.ts` imports it and `scripts/tsconfig` has no DOM lib.
```ts
export const CHUNK_SIZE = 250;                 // m, grid aligned to ORIGIN
export type ChunkKey = string;                 // `${i}_${j}`, i = floor(x/250), j = floor(z/250) (may be negative)
export const chunkKey = (x: number, z: number): ChunkKey => `${Math.floor(x / CHUNK_SIZE)}_${Math.floor(z / CHUNK_SIZE)}`;
export function chunkBounds(key: ChunkKey): { minX: number; minZ: number; maxX: number; maxZ: number };
export type XZ = number[];                     // flat [x0,z0,x1,z1,…], WORLD metres (ORIGIN-relative), rounded 0.1 m, rings not closed
export function ringArea(r: XZ): number;       // ½Σ(x[i+1]·z[i] − x[i]·z[i+1]); > 0 = CCW seen from above. Outer > 0, holes < 0
export interface BuildingRec { outer: XZ; holes?: XZ[]; kind: string /* building=* */; height?: number; levels?: number;
  minHeight?: number; roofShape?: string; colour?: string; roofColour?: string }        // raw parsed facts, no defaults
export interface RoadRec { pts: XZ; kind: string /* highway=* */; name?: string; width?: number; lanes?: number;
  oneway: boolean; surface?: string; roundabout: boolean;
  junctions: number[];                         // vertex indices whose point is shared with another road
  before?: [number, number]; after?: [number, number] }  // neighbour vertex across a chunk split (seamless miters)
export interface BridgeRec { pts: XZ; kind: string /* highway=* | railway=* */; layer: number; width?: number; lanes?: number; name?: string }
export interface AreaRec { kind: 'park' | 'grass'; outer: XZ; holes?: XZ[] }            // clipped to chunk bounds
export interface PointRec { kind: 'tree' | 'subway_entrance'; x: number; z: number }    // tree_row pre-expanded to trees
export interface ChunkData { v: 1; key: ChunkKey; buildings: BuildingRec[]; roads: RoadRec[]; bridges: BridgeRec[]; areas: AreaRec[]; points: PointRec[] }
export interface ChunkIndex { v: 1; chunkSize: 250; keys: ChunkKey[] /* every chunk touching RACE_BBOX, even empty */; stats: Record<string, number> }
export interface WaterData { v: 1; polygons: { river: boolean; outer: XZ; holes?: XZ[] }[] }  // clipped to bbox + 200 m
```
3. **`client/src/geo/heightGrid.ts`:**
   - `HeightGrid { minX; minZ; cell /* config terrain.cell = 5 */; cols; rows; h: Float32Array }`. Layout is row-major, `h[row*cols+col]`, with rows along +Z.
   - `heightAt(g, x, z)` is bilinear and clamps at the edges.
   - `loadHeightGrid(base)` reads the **actual** `elevation.json`/`elevation.bin` produced by the DEM agent (step 0 inspects the real files and adapts). It resamples to a 5 m world grid over bbox + 100 m, about 1120 × 760 cells (3.4 MB).
   - **Y is relative:** `y = DEM − DEM(ORIGIN)`, so the obelisk base is y = 0 and the Seine sits at about −7 m.
   - If the files are missing it returns a flat 0 grid and calls `console.warn`. Use warn, never error, because the screenshot run fails on console errors.
4. **`client/src/world/buildTypes.ts`:** the worker ⇄ main contract (DOM types allowed here).
```ts
export type MaterialId = 'terrain' | 'wall' | 'shopfront' | 'roof' | 'balcony' | 'sidewalk' | 'asphalt' | 'pave' | 'marking' | 'bridge' | 'railing' | 'sign';
export const VERTEX_COLOR: ReadonlySet<MaterialId>;  // {'terrain','wall','shopfront','roof'}: these buckets MUST have color, others MUST NOT
export type PropKind = 'tree' | 'lamp' | 'morris' | 'metro';
export interface MeshBucket { material: MaterialId; position: Float32Array; normal: Float32Array; uv: Float32Array; color?: Float32Array; index: Uint32Array }
export interface InstanceSet { kind: PropKind; matrices: Float32Array }     // 16 floats/instance (Matrix4.elements)
export interface TriMesh { vertices: Float32Array; indices: Uint32Array }   // static Rapier trimesh
export interface BuildOut { meshes: MeshBucket[]; instances: InstanceSet[]; colliders: TriMesh[]; textures?: { material: MaterialId; image: ImageBitmap }[] }
export interface BuildCtx { key: ChunkKey; bounds: ReturnType<typeof chunkBounds>; height(x: number, z: number): number }
export type Builder = (chunk: ChunkData, ctx: BuildCtx) => BuildOut;   // pure, world-space coords, no THREE objects
export type ToWorker = { type: 'init'; grid: HeightGrid; dataUrl: string } | { type: 'build'; key: ChunkKey };
export type FromWorker = { type: 'built'; key: ChunkKey; out: BuildOut; ms: number } | { type: 'failed'; key: ChunkKey; error: string };
```
5. **`client/src/world/geom.ts`** (shared by B, C, D, E; unit-tested):
   - `MeshBuffer(material, withColor)` with `vertex()`, `tri()`, `quad()` (flat normal) and `bucket()`.
   - `mergeBuckets()` merges by material and throws on mismatched attribute sets. `mergeTriMeshes()`.
   - `offsetPolyline(pts, d, before?, after?)`: positive d is left of the travel direction, with miter clamp.
   - `triangulate(outer, holes)`: a ShapeUtils wrapper.
   - `hash01(x, z, salt)`: deterministic value in [0, 1).
6. **`client/src/geo/fixture.ts`:** a tiny `ChunkData` covering every case, for unit tests:
   - a square building with a courtyard hole, an L-shaped building, a building with no height;
   - a 2-lane named road with a junction, a sett road, a footway;
   - a 2-segment bridge chain;
   - a park with a hole, 5 trees, 1 subway entrance.
7. **Stubs with final signatures and empty bodies** (so the worker and main thread compile from day 1):
   - `BuildingBuilder.ts`: `buildBuildings: Builder`, `createBuildingMaterials()`.
   - `RoadBuilder.ts`: `buildRoads`, `createRoadMaterials()`.
   - `BridgeBuilder.ts`: `buildBridges`.
   - `Terrain.ts`: `buildTerrain`, `carveRiver(grid, water)`, `createTerrainCollider(world, grid)`, `createTerrainMaterials()`.
   - `Water.ts`: `createWater(scene, water, grid)`.
   - `Vegetation.ts`: `buildVegetation`.
   - `StreetProps.ts`: `buildStreetProps`, `createPropMaterials()`, `createPropMeshes(): Record<PropKind, {geometry, material}>`.
   - `Landmarks.ts`: `createLandmarks(scene, grid)`.
   - Rule for all of them: **module top level must not touch the DOM.** Canvas textures are created only inside `create*()`. Workers import only `build*`.
8. **`client/src/config.ts`:** add one pre-filled block per package, separated by blank lines and comments: `chunks`/`bounds` (F), `buildings` (B), `roads` (C), `terrain`/`water` (D), `props` (E). Initial values come from the SPEC:
   - buildings: `levelHeight` 3.2, `defaultHeight` 20, `balconyFloors` [2, 5];
   - roads: `sidewalkWidth` 3.5;
   - chunks: `loadRadius` 800, `unloadRadius` 1000.
   - **Each package edits only its own block** and adds no imports.
9. **`scripts/screenshot.ts`:** `PORT = Number(process.env.SCREENSHOT_PORT ?? 5174)`. Add all Phase 2 presets now so every package can use them. Presets are built with `latLonToWorld`:
   - `topdown` (existing, whole bbox, Seine shape).
   - `etoile`: straight down from 600 m over 48.8738, 2.2950.
   - `champs`: straight down from 1100 m over 48.8697, 2.3080.
   - `eiffel`: 250 m up at 48.8530, 2.3010, looking NW at −25° toward Trocadéro.
   - `street`: 1.7 m eye height on the Champs-Élysées at 48.8700, 2.3060, facing the Arc.
   - `seine`: 12 m up on Pont Alexandre III, facing east.
   - `edge`: near the west bbox edge.
10. **Data prerequisite:** if the DEM agent has not committed `client/public/data/elevation.*`, step 0 commits them. They are public, needed by the build, and small.

## Chunk data decisions (A implements them, everyone relies on them)

- **Chunk grid:** 250 m, aligned at ORIGIN. The bbox spans about i ∈ [−11, 11] and j ∈ [−6, 9], so about 370 keys. World coordinates are used directly, with no per-chunk offset: float32 precision at 3 km is about 0.3 mm.
- **Chunk assignment:**
  - Buildings and bridge chains: the whole feature goes to the chunk of its centroid or midpoint and is never split.
  - Roads: split per chunk by segment midpoint. Pieces share their border vertex and carry `before`/`after` so miters match.
  - Areas: clipped per chunk with Sutherland–Hodgman.
  - Water: one global file (`water.json`), rendered as a single mesh.
- **Facts vs policy:** chunks hold parsed OSM facts only. Defaults (20 m height, widths by class) are applied in the builders from `config.ts`, so tuning never requires a rebuild. `build-chunks` prints stats on missing tags.
- **Dropped at build time:**
  - `footway=sidewalk|crossing` (builders generate sidewalks);
  - areas tagged `highway=*`;
  - `tunnel=*` and `layer<0` ways;
  - `building:part`;
  - all names except road names. Chunks are public, and §4.6 says maps show only street names.
- **Junctions:** detected by equality of rounded coordinates across road ways, which works whatever the Overpass format.
- **Size budget:**
  - Warn above 250 KB per chunk JSON, fail above 2 MB.
  - Expected total is about 10–15 MB raw across about 370 files; Cloudflare compresses JSON on the fly.
  - `water.json` ≤ 1 MB; the elevation files are a few MB.
  - All far under the 25 MiB per-asset limit and the 20k file limit.
- **Committed to git: yes.** That means `client/public/data/chunks/*.json`, `index.json` and `water.json`. `.cache/` stays ignored, refetching would hit Overpass again, and the build/deploy needs the data. Output is deterministic (sorted by OSM id, fixed rounding, compact `JSON.stringify`), so regenerating rarely produces small diffs.

## Parallel work packages (all 6 start right after step 0)

Ownership is disjoint. Nobody else touches `main.ts`, `index.html`, `DebugOverlay.ts`, `TODO.md`, `README.md` or `CLAUDE.md` except F. Packages report their TODO items in their final message and F writes `TODO.md`.

### A — Data pipeline
- **Owns:** `scripts/build-chunks.ts`; `client/src/geo/osm.ts` + test (tag parsing, `parseNumber`); `client/src/geo/clip.ts` + test (rect clip, road split, bridge chain merge); `client/src/geo/mapData.test.ts`; `client/public/data/chunks/**`; `client/public/data/water.json`.
- **Inputs:** `.cache/osm/*.json` and `global.json`, read from the main tree via `--cache "<abs path>"`.
- **Steps:**
  1. Inspect the real cache format first (`out geom` vs node refs).
  2. Load all tiles and dedupe by `type/id`.
  3. Run `osmtogeojson` once over the merged elements (use `NODE_OPTIONS=--max-old-space-size=4096` if needed).
  4. Project with `latLonToWorld`.
  5. Normalise ring orientation.
  6. Drop rings with fewer than 3 points or area under 2 m².
  7. Expand `tree_row` every 8 m, skipping points within 4 m of an existing tree.
  8. Bin into chunks and write `index.json`.
- **Unit tests:** `parseNumber` handles `"20 m"`, `"3;4"` and `"~15"`; clipping; splitting keeps continuity; chains merge.
- **Tests on real data** (`mapData.test.ts`, skipped if no data):
  - roads touching the `Place Charles de Gaulle` roundabout have **12 distinct `Avenue …` names**;
  - the named Champs-Élysées polyline deviates less than 30 m from the Étoile→Concorde line;
  - Pont Alexandre III's midpoint is over a river polygon;
  - the Eiffel→Trocadéro segment crosses river water;
  - the Arc de Triomphe building centroid is within 30 m of the SPEC coordinates.
- **Merge first**, as soon as the tests pass.

### B — BuildingBuilder
- **Owns:** `world/BuildingBuilder.ts` + test; config block `buildings`.
- **Height rule:** `height` → `levels × 3.2` → 20 m. Top = base + height, where base = min terrain over the ring vertices, pushed down 0.5 m.
- **Haussmann style** (kind is yes/apartments/residential/commercial/retail/office/hotel and height is 12–35 m):
  - ground floor 0–4.5 m uses `shopfront`;
  - walls use `wall`, with a window-grid texture whose UVs are in metres;
  - zinc mansard: the top 4 m, inset about 1.2 m with a per-vertex miter clamped to half the shortest edge, then a flat cap triangulated with its holes;
  - balconies at floors 2 and 5 on outer-ring edges of at least 3 m: slab plus railing, `balcony` material.
- **Other kinds** (church, museum…): plain stone walls and a flat roof.
- **Colour variation:** per-building tint through vertex colour from `hash01`, so no extra draw calls.
- **Output:** 4 buckets plus 1 trimesh collider (walls + cap, no balconies).
- **Materials:** `createBuildingMaterials()` makes canvas textures: cream limestone with windows, a shop bay, blue-grey zinc `#6f7c85`, iron `#2a2d30`.
- **Tests on the fixture:** courtyard walls face inward; the inset square is smaller; the height fallback chain works; a degenerate ring is skipped, not thrown; no NaN.
- **Screenshots:** `street`, `champs` (blue-grey roofs), `etoile`.

### C — RoadBuilder + BridgeBuilder
- **Owns:** `world/RoadBuilder.ts`, `world/BridgeBuilder.ts` + tests; config block `roads`.
- **Road width:** `width` → `lanes × 3.25` → a per-class table. `widthByName` overrides it (e.g. `Place Charles de Gaulle`: 36 m).
- **Ribbons:**
  - segments subdivided to 10 m or less, each vertex draped on `ctx.height`, plus 0.05 m;
  - `sidewalk` ribbon (width + 2 × 3.5 m) is drawn *under* the `asphalt`/`pave` ribbon, so crossing roads cover each other's sidewalks;
  - layering uses polygonOffset per material in this order: terrain, sidewalk, asphalt, pave, marking;
  - `pave` is used when surface is sett or cobblestone;
  - footways and pedestrian ways get a stone ribbon with no sidewalk;
  - white dashed centre line on two-way roads with 2+ lanes, cut 8 m before junctions.
- **No road colliders:** the terrain heightfield is the ground.
- **Bridges:**
  - deck y is interpolated along arc length between terrain heights sampled 5 m beyond each chain end;
  - `(layer − 1) × 6 m` is added for rail decks (Bir-Hakeim);
  - deck is a 1 m slab (`bridge`) with the road surface on top, and 1.1 m railings (`railing`);
  - the collider is a trimesh of deck and railings.
- **Tests:** ribbon widths; `before`/`after` seams line up; a bridge deck stays above the carved river on a synthetic grid.
- **Screenshots:** `etoile` (12 avenues), `champs` (straight), `street`, `seine`.

### D — Terrain + Water
- **Owns:** `world/Terrain.ts`, `world/Water.ts` + tests; config blocks `terrain` and `water`.
- **`carveRiver(grid, water)`** runs on the main thread at startup:
  - water level = median grid height inside river cells (config override allowed);
  - scanline-fill river cells to level − 3 m;
  - cells within 8 m outside the river are raised to at least level + `quayHeight` (7 m);
  - this yields a vertical quay drop of 6–8 m, and the 5 m grid slope is over 45°, so it also acts as the wall collider.
- **`buildTerrain`** (worker): a 51 × 51 grid per chunk with gradient normals. Vertex colour is pavement grey, or green inside the chunk's park/grass areas.
- **`createTerrainCollider`:** one global Rapier heightfield. **Test with Rapier raycasts** that it matches `heightAt` within 2 cm, because the layout (column-major, centred) is easy to get wrong.
- **`createWater`** (global):
  - ShapeUtils triangulation;
  - `MeshStandardMaterial` with roughness 0.15, a PMREM sky environment and a scrolling procedural normal map;
  - stone quay-wall strips along river edges;
  - other water bodies are drawn flat at local terrain height + 0.1 m, not carved.
- **Screenshots:** `topdown` (Seine shape vs Google Maps), `seine`, `eiffel` (Chaillot slope).

### E — Vegetation + StreetProps + signs + landmark placeholders
- **Owns:** `world/Vegetation.ts`, `world/StreetProps.ts` + tests, `world/Landmarks.ts`; config block `props`.
- **Trees:** plane trees from tree points, as instances with hashed yaw and scale 0.8–1.2.
- **Lamps:** every 30 m on both sidewalks of car roads, skipping within 10 m of junctions.
- **Morris columns:** at 1 in 6 junctions (hashed), on a corner.
- **Metro entrances:** at subway entrances, facing the nearest road.
- **Low-poly meshes:** 300 triangles or fewer each.
- **Street-name signs:**
  - at each junction, per named road: a post on the corner and a plaque (blue enamel, green border, white text);
  - deduplicated within 15 m;
  - per-chunk atlas drawn with `OffscreenCanvas` in the worker, 256 × 64 px cells, sized to its content;
  - returned as `textures[{material: 'sign', image}]`;
  - if `OffscreenCanvas` is missing: warn once and skip.
- **Placeholders** (`// ponytail:`, replaced by Phase 11 models): a 330 m tapered Eiffel Tower and a 50 × 45 × 22 m Arc de Triomphe.
- **Tests:** placement logic only (counts, spacing, determinism).
- **Screenshots:** `street` (signs readable, trees, lamps), `eiffel`.

### F — Streaming + integration (also runs the merges)
- **Owns:** `world/ChunkManager.ts` + test, `workers/chunkBuilder.worker.ts`, `world/Bounds.ts` + test, `world/Sky.ts`, `world/allChunks.test.ts`, `main.ts`, `ui/DebugOverlay.ts`, `index.html`, `scripts/screenshot.ts` (after step 0), `TODO.md`/`README.md`/`CLAUDE.md`, config blocks `render`/`chunks`/`bounds`. Deletes `world/DevScene.ts`.
- **Worker:**
  - on `init` it keeps the grid; on `build` it fetches `data/chunks/<key>.json` itself and checks `v === 1`;
  - it runs the 6 builders, **each wrapped in try/catch** (warn and continue);
  - merges buckets per material and all colliders into one trimesh;
  - posts with `{ transfer }`. The `postMessage(msg, {transfer})` form type-checks under the DOM lib.
- **ChunkManager:**
  - pure `chunksInRadius()` (tested);
  - radius = `max(loadRadius, cameraY × 1.5)`, so a high camera, including `topdown`, loads everything;
  - unload beyond radius + 200 m; queue sorted by distance, 2 builds in flight;
  - attach on the main thread (meshes with shared materials, per-chunk `InstancedMesh`, sign material clones, Rapier trimesh colliders) within 4 ms per frame, **unbudgeted until the first `__READY__`**;
  - unload disposes geometry, sign textures and colliders;
  - failed fetches: warn, retry up to 3 times.
- **main.ts wiring order:**
  1. load the grid and water, then `carveRiver`;
  2. create the Rapier world, the terrain collider and the bounds walls;
  3. Sky (Phase 1 lights, with the shadow box following the camera);
  4. Water, Landmarks, then ChunkManager.
- **Rendering:** fog `far ≈ 700 m`, scaled by camera altitude; `camera.far` follows fog far for depth precision.
- **Bounds:** 4 invisible cuboid walls 500 m high along the bbox corners. `edgeDistance()` is tested; when it drops below 40 m, show the Vietnamese banner "Bạn đang rời khu vực đua".
- **Attribution:** "© OpenStreetMap contributors" plus the DEM credit in `index.html`.
- **F3 overlay:** loaded/pending chunk count and collider count.
- **Readiness:** `__READY__` = ChunkManager idle and 3 or more frames drawn. Expose `window.__STATS__ = {calls, triangles, chunks}` and have the screenshot run log it. `topdown` gets a 90 s timeout.
- **Missing data:** if `index.json` is missing, show a Vietnamese notice and a terrain-only world. Never crash.
- **`allChunks.test.ts`:** runs every builder over **every real chunk** in Node and asserts no throw, no NaN, 16 draw buckets or fewer, and 60k triangles or fewer.
- **First milestone (merge early):** streaming with terrain and stubs visible.

## Merge order and conflict avoidance

1. `p2/contract` → `phase2`.
2. **A** (data) and **F milestone 1** (streaming) merge as soon as green. These two are the critical path, because the builders only get visual feedback once both are in.
3. **D** next: the carve changes everyone's y values.
4. **B, C, E** in any order.
5. **F final:** bounds/warning/attribution/overlay, fog tuning, TODO/CLAUDE (`build-chunks` command, the Y-relative-to-ORIGIN convention), then `npm run build && npm test && npm run screenshot` for all presets.
6. Squash into main as `feat(phase2): bản đồ Paris …`.

Before merging, each package rebases on `phase2`. Rebases are trivial because the files are disjoint.

Why this avoids conflicts:
- Builders are `Builder` functions returning plain typed arrays. They are testable in Vitest with no WebGL and transferable to the worker with zero copy. Materials come from each package's `create*()`, and F assembles them with `satisfies Record<MaterialId, Material>`.
- `config.ts` uses separated per-package blocks.
- The lockfile and root `package.json` change only in step 0.
- The data files belong only to A.
- Merges happen only in an integration worktree, never in the main working tree while Phase 1 is still in progress there.

## Performance budget (60 FPS mid-range laptop, ≥ 30 FPS integrated GPU)

| Item | Budget |
|---|---|
| Per chunk | ≤ 16 draw calls (terrain 1, buildings 4, roads 4 (+2 on bridge chunks), sign 1, instanced ≤ 4); ≤ 60k triangles when dense (about 15k average); worker build ≤ 50 ms; attach ≤ 4 ms/frame |
| Street level, radius 800 m | ≤ 49 chunks loaded; ≤ 400 draw calls and ≤ 1.5 M triangles after frustum culling; GPU geometry ≤ 200 MB; sign atlases ≤ 60 MB |
| Whole map (`topdown`, screenshots only) | about 10 M triangles and about 5k draw calls; OK in SwiftShader with the 90 s timeout |
| Knobs for integrated GPUs | `chunks.loadRadius` (800 → 600) together with fog, `render.maxPixelRatio`, `shadowMapSize` |

Headless FPS numbers are meaningless. The user checks F3 in `npm run dev` on real hardware.

## Risks

- **Unknown input formats:** the Overpass cache and the DEM files. A and step 0 inspect the real files first.
- **Rapier heightfield layout:** covered by D's raycast test.
- **Bad OSM data:** broken multipolygons or self-intersections. Handled per feature (skip and count) plus the per-builder try/catch.
- **Z-fighting of coplanar ribbons:** handled with polygonOffset layers.
- **VRAM from per-chunk sign atlases:** textures sized to content, with an upgrade path to a global LRU atlas.
- **Git growth:** chunks are committed once with deterministic output; regenerate rarely.
- **Phase 1 still changing:** F owns every edit to Phase 1 files.

## Ponytail shortcuts (each gets a `// ponytail:` comment and a TODO.md line)

**Now:**
- 1 worker (pool later if the first load is slow);
- per-chunk InstancedMesh and sign atlases;
- no LOD (balconies at every distance);
- no planar water reflection (Reflector/Water.js if it looks flat and FPS allows);
- `building:part` ignored;
- tunnels not rendered;
- no crosswalks;
- lower quays (berges) raised to street level by the quay band;
- no arrondissement line on the plaques (Phase 5 adds districts);
- geometry CPU copies kept after upload;
- one sun with a shadow box following the camera (cascaded shadows in Phase 12).

**Later:**
- landmark models (Phase 11);
- swimming and quay stairs (Phase 3);
- `build-graph` from road data (Phase 4);
- LOD, quantisation and Meshopt (Phase 12);
- Photorealistic 3D Tiles are deferred: they need a key, attribution and no caching. Added to TODO.

### Critical Files for Implementation
- /Users/nguyencuongthinh/Library/Application Support/Claude/scratch-workspaces/83952f04-68ac-4171-9cbc-9e5e454ab448/22810749-2c7b-4ebc-ba6f-9d9a28f160fd/scratch-2026-09-27-fbaff9/client/src/geo/chunkData.ts (new, step 0 contract)
- /Users/nguyencuongthinh/Library/Application Support/Claude/scratch-workspaces/83952f04-68ac-4171-9cbc-9e5e454ab448/22810749-2c7b-4ebc-ba6f-9d9a28f160fd/scratch-2026-09-27-fbaff9/client/src/world/buildTypes.ts (new, worker ⇄ main contract)
- /Users/nguyencuongthinh/Library/Application Support/Claude/scratch-workspaces/83952f04-68ac-4171-9cbc-9e5e454ab448/22810749-2c7b-4ebc-ba6f-9d9a28f160fd/scratch-2026-09-27-fbaff9/client/src/config.ts (per-package blocks)
- /Users/nguyencuongthinh/Library/Application Support/Claude/scratch-workspaces/83952f04-68ac-4171-9cbc-9e5e454ab448/22810749-2c7b-4ebc-ba6f-9d9a28f160fd/scratch-2026-09-27-fbaff9/client/src/main.ts (F only; replaces DevScene wiring)
- /Users/nguyencuongthinh/Library/Application Support/Claude/scratch-workspaces/83952f04-68ac-4171-9cbc-9e5e454ab448/22810749-2c7b-4ebc-ba6f-9d9a28f160fd/scratch-2026-09-27-fbaff9/scripts/screenshot.ts (port env var + §16 presets)
- /Users/nguyencuongthinh/Library/Application Support/Claude/scratch-workspaces/83952f04-68ac-4171-9cbc-9e5e454ab448/22810749-2c7b-4ebc-ba6f-9d9a28f160fd/scratch-2026-09-27-fbaff9/shared/src/projection.ts (only projection; reused unchanged)
