# Phase 8C – Báo cáo nền (track T0)

Ngày 2026-10-03. Nhánh `phase8c-T0` (worktree riêng, KHÔNG merge vào main). Phạm vi theo SPEC §17.20 bản cuối:
- landmark: chỉ nâng cấp **Ngọn lửa Tự do** (giao T2); Kim tự tháp, Notre-Dame và mọi landmark khác giữ nguyên Phase 2B; track T4 bỏ;
- T3 (quyết định người dùng, tin nhắn điều phối viên 2026-10-03): texture PBR CHỈ cho **ngói mái** (`roof_slates_03`) và **nhựa đường** (`asphalt_02`); mặt tiền (đá, kẽm), vỉa hè, đá lát / pavé, địa hình giữ nguyên.
- BỎ đài nước Wallace và BỎ HẲN T5 (không thêm avatar Rocketbox, không thêm xe; người / xe giữ như hiện tại). Phase 8C còn T1, T2, T3.

## 1. Đã làm
- `client/src/config.ts`: khối `graphics8c` (đặt trước khối HUD Phase 5, xa khối `louvreRoom` / `feed` của 8B): `quality` (T0) + mỗi hạng mục một khối `{ enabled: false, lowOff }`: `sky`, `water`, `post` (T1); `trees`, `props`, `flamme` (T2); `roofs`, `asphalt` (T3). Không có khối T5.
- `client/src/world/graphics.ts` (+ test): `graphics()` = `{ quality, gpu, on(item) }`. Chất lượng: `?quality=low|high` > localStorage `graphics8c.quality.storageKey` > tự động `low` khi chuỗi GPU (`WEBGL_debug_renderer_info`) khớp `weakGpu` (SwiftShader, llvmpipe, Intel trừ Arc, Mali, Adreno, PowerVR). Chỉ luồng chính: worker không biết chất lượng, chunk build giống nhau trên mọi máy.
- `client/src/world/textures.ts`: `pbrTexture(name, 'col'|'nrm'|'arm')` / `pbrMaps(name)` nạp `textures/<name>_<map>[_1k].webp` (RepeatWrapping, sRGB cho col, anisotropy 8, cache dùng chung; `_1k` khi `quality = low`).
- `client/src/world/post.ts` (stub T1, trả `null`) + điểm gắn trong `client/src/main.ts` (4 dòng: import, `createPost`, `post?.setSize` trong `resize`, `post ? post.render() : renderer.render`). `null` → y hệt Phase 7.
- `scripts/assets/manifest.ts` (+ test): đọc `.cache/assets/8c/manifest.json` + `sketchfab/*.glb` (giấy phép / tác giả / tiêu đề / nguồn lấy từ `asset.extras` của GLB Sketchfab), kiểm giấy phép §17.20 (cho PD / CC0 / MIT / CC BY / BY-SA / BY-NC / BY-NC-SA; chặn ND, personal, editorial, không rõ), `assetPath` kiểm sha256 / md5 khi target đọc tệp và chặn tệp `UNUSED`, `credits8c` (CC0 / PD / MIT gộp theo nhóm + giấy phép + trang; CC BY* từng tác phẩm, "(đã chỉnh sửa)"; tệp `UNUSED` bỏ qua; tệp không nhãn → lỗi), `mergeCredits` (thay các dòng `set: '8c'` cũ, chèn trước dòng "Phòng Louvre", idempotent).
- `scripts/assets/pipeline.ts`: `writePublic` (từ chối > 25 MB), `toWebp`, `zipEntry` (ambientCG zip qua `unzip`), `pbrSet` → `textures/<name>_{col,nrm,arm}.webp` + `_1k`, `optimizeGlb` (dedup, weld, simplify về `maxTris`, WebP ≤ `textureSize`, đổi tên node / mesh / material / texture thành `<name>_<i>`, bỏ extras / copyright, Meshopt). KTX2: không (ponytail, WebP đủ đến khi VRAM > 512 MB).
- `scripts/assets/graphics8c.ts`: bảng target `hdri` (T1), `textures` (T3), `trees` / `props` / `flamme` (T2) – mỗi target một tệp stub của track; chạy `npm run process-assets -- <target…>` (không tên = mọi target); dòng Ghi nguồn 8C gộp vào `client/public/credits.json` lúc tiến trình thoát (process-assets ghi credits.json ở cuối). `scripts/process-assets.ts`: đúng 1 dòng `import './assets/graphics8c.ts'`.
- `scripts/screenshot.ts`: preset `p8c-*` (tên chốt, giá trị tạm, chỉ chạy khi gọi tên / nhóm `p8c`), `--out <thư mục con của screenshots/>` + `stats.json` (ghi sau mỗi preset), đo FPS cho preset `*-bench` / `*-bench-low`: chụp ảnh rồi lấy mẫu rAF 15 s → `fps: { avg, p5, frames }` trong `__STATS__` in ra / ghi file.
- `docs/plans/phase8c-graphics.md`: phạm vi mới (chỉ Ngọn lửa → T2; T4 bỏ; T3 chỉ mái + nhựa đường; bench / quality / credits; câu hỏi mở đã xong).

Kiểm thử thật: `npm run process-assets -- hdri textures trees props flamme` chạy 5 stub, sinh lại `credits.json` giống hệt bản commit + các dòng 8C; bản này KHÔNG commit (sinh lại một lần khi ghép, tránh xung đột với 8B). Sau khi bỏ T5 / Wallace / texture không dùng, `credits8c` còn: 6 dòng Sketchfab CC BY (nhà chờ bus, bồ câu, bouquinistes, Ngọn lửa, cột Morris, ghế) + dòng nhóm CC0 / PD / MIT (texture Poly Haven asphalt / roof / bark, ambientCG LeafSet030, HDRI, cột đèn, bàn ghế quán, áp phích Commons, waternormals).

## 2. Ảnh TRƯỚC + số liệu (`screenshots/before-8c/`, `stats.json`; không commit – `screenshots/` trong .gitignore)
SwiftShader headless, máy đang tải nặng (2 reviewer chạy trình duyệt song song): FPS chỉ để so tương đối trên cùng máy.

| Preset | Lệnh vẽ | Tam giác (M) | Chunk | Geometry | Xe / người NPC | FPS avg / p5 |
|---|---|---|---|---|---|---|
| `topdown` | 5153 | 12.91 | 368 | 3897 | 25 / 25 | – |
| `etoile` | 593 | 1.73 | 84 | 421 | 46 / 24 | – |
| `champs` | 1432 | 4.15 | 203 | 1085 | 33 / 14 | – |
| `eiffel` | 477 | 1.72 | 79 | 360 | 18 / 17 | – |
| `street` | 328 | 0.91 | 49 | 242 | 24 / 21 | – |
| `seine` | 283 | 1.07 | 47 | 215 | 26 / 13 | – |
| `p3-street` | 343 | 0.95 | 48 | 251 | 28 / 23 | – |
| `p4b-street` | 338 | 0.94 | 49 | 251 | 28 / 23 | – |
| `p4b-sidewalk` | 335 | 0.95 | 49 | 238 | 30 / 18 | – |
| `p4b-peds` | 17 | 0.08 | – | – | – / – | – |
| `p4b-cars` | 85 | 0.04 | – | – | – / – | – |
| `lm-invalides` | 402 | 1.39 | 68 | 308 | 38 / 36 | – |
| `lm-flamme` | 337 | 1.05 | 52 | 247 | 39 / 32 | – |
| `lm-luxembourg` | 372 | 1.20 | 45 | 283 | 1 / 28 | – |
| `p8c-bench` | 347 | 0.99 | 49 | 254 | 26 / 21 | 1.7 / 1.3 |
| `p8c-bench-low` | 347 | 0.99 | 49 | 254 | 26 / 21 | 1.5 / 1.2 |
| `p8c-sky` | 323 | 0.93 | 49 | 237 | 24 / 21 | – |
| `p8c-sky-low` | 323 | 0.93 | 49 | 237 | 24 / 21 | – |
| `p8c-seine` | 283 | 1.06 | 47 | 215 | 26 / 13 | – |
| `p8c-gold` | 314 | 1.21 | 45 | 238 | 21 / 40 | – |
| `p8c-post` | 329 | 0.91 | 47 | 230 | 28 / 23 | – |
| `p8c-trees` | 338 | 0.99 | 49 | 245 | 24 / 21 | – |
| `p8c-trees-top` | 408 | 1.14 | 62 | 300 | 24 / 21 | – |
| `p8c-props` | 334 | 0.94 | 49 | 237 | 29 / 18 | – |
| `p8c-quay` | 327 | 0.89 | 50 | 250 | 25 / 15 | – |
| `p8c-flamme` | 317 | 1.27 | 49 | 234 | 39 / 40 | – |
| `p8c-roof` | 369 | 0.95 | 55 | 265 | 28 / 23 | – |
| `p8c-road` | 314 | 0.81 | 48 | 231 | 0 / 0 | – |

28 ảnh PNG: 14 preset gốc (topdown, etoile, champs, eiffel, street, seine, p3-street, p4b-street, p4b-sidewalk, p4b-peds, p4b-cars, lm-invalides, lm-flamme, lm-luxembourg) + 14 preset `p8c-*` (bench-low chỉ có số liệu, không ảnh). `p8c-*` lúc này = cảnh Phase 7 (nền chưa bật gì): chính là ảnh TRƯỚC của từng track.

Ghi chú: tam giác `street` 0,91 M / 328 lệnh vẽ (ngân sách 8C: ≤ 1,5 M / ≤ 450).

## 3. Lệch so với kế hoạch
- `?bench=1` (URL trong game) → preset `p8c-bench` / `p8c-bench-low`, FPS do `scripts/screenshot.ts` đo bằng rAF trong trang (không sửa `main.ts` / `GameLoop`). Ảnh chụp TRƯỚC khi đo (lần đầu chụp sau 15 s đạp xe ở 1,7 FPS bị quá hạn 30 s); sau bench trang chuyển `about:blank`; `page.screenshot` dùng cùng hạn chờ như `__READY__`.
- `main.ts` có 4 dòng của T0 (gắn `post`), kế hoạch cũ ghi "không đụng main.ts"; điều phối viên không cấm `main.ts`; các dòng ở khối renderer / vòng render, xa phần Louvre.
- `scripts/assets/fetch-8c.ts` không làm: tài nguyên đã tải xong (download report), Sketchfab tải tay; `manifest.ts` đọc giấy phép thẳng từ GLB.
- `stats-before.json` → `screenshots/before-8c/stats.json`.
- Thư mục `client/public/textures/` chưa tạo (git không giữ thư mục rỗng; `pipeline.writePublic` tự tạo).
- Không hạ cấp theo FPS lúc chạy (chỉ theo GPU / URL / localStorage lúc nạp) – ponytail trong `graphics.ts`.
- Bảng ứng viên ghi tác giả cột Morris "maxgomes"; `asset.extras` của GLB tải về ghi "BigMax (sketchfab.com/bigmax)" – Ghi nguồn dùng extras (đúng tệp đã tải).
- `UNUSED` (không xử lý – `ctx.file()` báo lỗi –, không ghi nguồn): 9 avatar Rocketbox mới, 5 xe Sketchfab, `fontaine_wallace.glb` (T5 / Wallace bỏ) và các bộ texture tải nhưng không còn dùng (`large_sandstone_blocks`, `box_profile_metal_sheet`, `concrete_pavers`, `cobblestone_floor_08`, `patterned_cobblestone`, `bicolour_gravel`, `Metal028`, `Ground108`, `Grass004`) nằm trong `UNUSED` (không xử lý, không ghi nguồn). `bicolour_gravel` / `Ground108` / `Grass004` (địa hình) cũng bỏ vì T3 chỉ còn mái + nhựa đường; muốn dùng lại: bỏ khỏi `UNUSED`.

## 4. Hợp đồng cho từng track
Chung: tạo nhánh từ `phase8c-T0`; chỉ sửa tệp của mình (bảng §6 kế hoạch); bật `graphics8c.<mục>.enabled = true` khi mục chạy; mọi texture nạp trong `create*()` luồng chính bằng `world/textures.ts` (không ở top level module – worker import builder); không commit `client/public/credits.json` (sinh lại khi ghép); output tĩnh ≤ 25 MB / tệp; chụp `npm run screenshot -- <preset>` so với `screenshots/before-8c/<preset>.png` (+ `stats.json`); `SCREENSHOT_PORT` riêng.

- **T1 (trời + sáng + nước + hậu kỳ):** sở hữu `client/src/world/{Sky,Water,post}.ts`, `scripts/assets/hdri.ts`, `graphics8c.{sky,water,post}`, `render.sky` / `render.fog` / `water` trong config, `client/src/ui/settings.ts` (thêm mục "Chất lượng": ghi `localStorage[graphics8c.quality.storageKey] = 'low'|'high'`, áp dụng sau tải lại), `landmarks/index.ts` chỉ `envMap`. Điểm gắn: `createSky(scene, camera, groundAt)` / `createWater(scene, water, grid)` (main.ts đã gọi), `createPost(renderer, scene, camera)` trả `Post | null` (main.ts đã gọi render / setSize). Tài nguyên: `ctx.file('polyhaven/hdri/kloofendal_48d_partly_cloudy_puresky_2k.hdr')`, `…_1k.hdr`, `qwantani_puresky_1k.hdr`, `three/waternormals.jpg` → `client/public/textures/`. Preset: `p8c-sky`, `p8c-sky-low`, `p8c-seine`, `p8c-gold`, `p8c-post`, `p8c-bench(-low)`.
- **T2 (cây + đồ đường phố TRỪ đài Wallace + Ngọn lửa Tự do):** sở hữu `client/src/world/{Vegetation,StreetProps,attach,buildTypes}.ts`, `client/src/world/landmarks/{models,g1}.ts` (chỉ mục `flamme`), `scripts/build-chunks.ts` + `client/public/data/chunks/*` (rerun một lần, commit riêng), `scripts/assets/{trees,props,flamme}.ts`, `client/public/models/{trees,props,lm-flamme}.glb`, config `props` + `graphics8c.{trees,props,flamme}`. Điểm gắn: `PropKind` + `createPropMeshes()` (instanced, LOD trong `attachBuildOut`), `MODELS` trong `models.ts` (`{ id: 'flamme', key, url: 'models/lm-flamme.glb', farParts: true }` + pose `g1.modelPose`). Tài nguyên: 4 GLB Sketchfab đồ phố (cột Morris, nhà chờ bus, bouquinistes, ghế) + bồ câu (tùy chọn) – KHÔNG Wallace, `polyhaven/{street_lamp_01,outdoor_table_chair_set_01}`, `commons/posters/*`, `polyhaven/textures/bark_platanus/*`, `ambientcg/LeafSet030_2K-JPG.zip`, `sketchfab/day_135_flame_of_liberty_-_1scanaday.glb`; dùng `optimizeGlb` / `pbrSet` / `zipEntry`. Preset: `p8c-trees`, `p8c-trees-top`, `p8c-props`, `p8c-quay`, `p8c-flamme` (+ `lm-flamme`).
- **T3 (CHỈ ngói mái + nhựa đường):** sở hữu `client/src/world/BuildingBuilder.ts` (chỉ vật liệu `roof` trong `createBuildingMaterials`), `client/src/world/RoadBuilder.ts` (chỉ vật liệu `asphalt` trong `createRoadMaterials`), `scripts/assets/textures.ts` (`SETS = ['roof_slates_03', 'asphalt_02']`), `client/public/textures/{roof_slates_03,asphalt_02}_*.webp`, config `graphics8c.{roofs,asphalt}` (+ `roads.textureTile.asphalt` nếu cần). Điểm gắn: `pbrMaps('roof_slates_03')` / `pbrMaps('asphalt_02')` trong hai hàm create (uv đã theo mét: chỉnh `repeat`). KHÔNG đụng wall / shopfront / balcony / sidewalk / pave / terrain. Preset: `p8c-roof`, `p8c-road` (+ `p3-street`, `street`, `topdown`).
- **T5:** BỎ (SPEC §17.20). Không có khối config, target hay preset; `npc-*.glb`, `NpcAssets` / `NpcRenderer`, bảng Rocketbox / xe trong process-assets giữ nguyên.

## 5. Kiểm tra
`npm run build && npm test` từ gốc worktree: qua (exit 0). Test: scripts 109 (+22 `manifest.test.ts`), shared 76, client 732 (+3 `graphics.test.ts`), worker 154 = 1 071; không test nào bị bỏ. Không còn vite / Chrome của T0 chạy nền.
