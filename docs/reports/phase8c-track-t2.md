# Phase 8C – Track T2 (cây + đồ đường phố + Ngọn lửa Tự do) – báo cáo

Ngày 2026-10-03. Nhánh `phase8c-T2` (từ `phase8c-T0`), worktree `.claude/worktrees/agent-a9bb61e12df50d67c`. KHÔNG merge vào main.
Bật: `graphics8c.trees`, `graphics8c.props`, `graphics8c.flamme` = `enabled: true` (`lowOff: false`; chất lượng thấp chỉ đổi khoảng cách LOD).

## 1. Đã làm

### Cây platane (dựng bằng mã)
- `client/src/world/Vegetation.ts`: `treeGeometries()` dựng 1 cây platane (thân 2 đoạn côn + 5 cành bằng vỏ `bark_platanus`, tán 48 cụm lá "card" bắt chéo hai mặt + card nằm nghiêng ở nửa trên, pháp tuyến hướng ra ngoài tán) ở **3 mức**: LOD0 ≈ 600 tam giác, LOD1 (12 card lớn) ≈ 110, LOD2 impostor (2 quad đứng + 1 quad ngang) 12 tam giác. Một vật liệu (`alphaTest 0.5`) trên 1 atlas `textures/trees_{col,nrm}.webp` (+ `_1k`).
- `scripts/assets/trees.ts` (target `trees`): atlas 2048 × 1024 = vỏ cây (Poly Haven `bark_platanus`, CC0) + 2 ô cụm lá + impostor cạnh / trên, ghép từ 16 lá của `LeafSet030` (ambientCG, CC0 – lá sồi khô màu nâu, **nhuộm lại xanh** theo độ sáng). Tất định (RNG có seed).
- Vị trí: giữ nguyên điểm cây OSM (`buildVegetation` không đổi, 31 184 cây); collider cây: vẫn không có (như trước).
- `client/src/world/attach.ts`: `PropLods` + `lodInstances()` – **LOD theo từng cây / từng món** (không theo chunk): mỗi InstanceSet thành một `THREE.LOD` không level, `update(camera)` (renderer gọi trước khi vẽ con) xếp lại instance theo khoảng cách khi camera đi ≥ 3 m, mỗi mức 1 InstancedMesh / phần, ma trận ghi vào 1 `InstancedBufferAttribute` dùng chung. Cả chunk cùng một mức → bỏ qua. Mức có thể thay sau (GLB đến muộn) → chunk tự dựng lại.
- Khoảng cách: `graphics8c.trees.lod = [60, 240]` m (LOD0 / LOD1, impostor xa hơn); chất lượng thấp `lowLod = [0, 150]` (không tán đầy đủ). Bóng đổ: LOD0 + LOD1.

### Đồ đường phố (`models/props.glb`, 1,52 MB; mỗi loại 2 mức trong GLB + ẩn ngoài tầm)
| Loại | Nguồn | LOD0 / LOD1 tam giác | Khoảng cách (m) | Đặt |
|---|---|---|---|---|
| cột đèn gang | Poly Haven `street_lamp_01` (CC0), ×1,25 = 4,8 m | 1 499 / 246 | 45 / 300 | vị trí đèn cũ (30 m hai bên đường xe), collider cũ |
| cột Morris | Sketchfab `french_colonne_morris` (CC BY): giữ mũ + đế quét, **cắt bỏ dải áp phích quét (quảng cáo hiện đại)** thay bằng trụ áp phích Chéret / Toulouse-Lautrec (commons, PD / CC0) | 3 946 / 400 | 60 / 350 | vị trí Morris cũ (1/6 ngã tư), collider cũ |
| nhà chờ xe buýt | Sketchfab `abribus_bus_stop_bus_station` (CC BY) | 3 037 / 500 | 60 / 350 | OSM `highway=bus_stop` + `shelter=yes` (443 điểm mới trong chunk → 391 nhà chờ), sát mép đường phía có trạm, mặt mở ra đường |
| ghế | Sketchfab `mini_paris_bench` (CC BY), bỏ tấm lát, kéo dài ×2,2 | 1 519 / 199 | 35 / 160 | luật: vỉa hè ≥ 3 m của primary / secondary / tertiary / trunk, mỗi 40 m (50 %), 1,8 m từ mép, quay ra đường (1 336 ghế) |
| hộp sách bouquiniste | Sketchfab `bouquinistes` (CC BY): một đoạn 8,5 m không có người của hàng sạp quét | 6 850 / 798 | 70 / 400 | 11 quai có bouquiniste thật; mép kè dò bằng lưới độ cao đã khoét (sông tụt ≥ 2,5 m trong 16 m), lùi 0,6 m; bỏ gần cầu (140 đoạn) |
| bàn ghế quán | Poly Haven `outdoor_table_chair_set_01` (CC0) | 2 464 / 250 | 30 / 140 | luật: 1/4 ngã tư, 3 bộ dọc một nhánh từ góc, phải có mặt tiền trong 5 m (không đặt trên đảo giao thông) (339 bộ) |

- Mọi chỗ đặt mới: ngoài lòng đường (≥ 0,6 m từ mép), ngoài nhà, cách gốc cây ≥ 2,2 m; nhà chờ trước, rồi sạp sách / ghế / quán tránh nhau 7 m. Đứng trên vỉa hè nâng (`roads.lift + curbHeight`).
- **Không collider cho đồ mới** (đúng yêu cầu "giữ như hiện tại hoặc không thêm"); đèn / Morris / metro giữ collider cũ (ma trận không đổi: mô hình nâng 0,2 m trong mesh).
- `scripts/assets/props.ts`: các bước "triangle soup" (đọc GLB/glTF ra thế giới, cắt, dời / xoay / tỉ lệ, gộp vật liệu đục vào 1 atlas → 1 lệnh vẽ / mức) + `writeGlb` (weld, giản lược meshopt – LOD1 dùng cờ `Permissive` vì bản quét có hàng trăm đảo uv; LOD0 giữ đường may để không nhòe texture –, WebP, Meshopt). Vật liệu: điện môi, nhám (không mang map kim loại / nhám nguồn).
- `client/src/world/StreetProps.ts`: `PropKind` thêm `bench | cafe | shelter | bouquiniste`; `createPropMeshes()` nạp `props.glb` bất đồng bộ (GLTFLoader nhập động: không vào bundle worker), đèn / Morris dùng mesh Phase 7 cho tới khi GLB đến; `propAssetsIdle()` gộp vào `models.idle` (→ `__READY__` chờ GLB + texture cây).

### Ngọn lửa Tự do
- `scripts/assets/flamme.ts`: bản quét edemaistre (CC BY, 19 MB, 335k tam giác, 4K) → `models/lm-flamme.glb` **1,17 MB**, 40 000 tam giác, texture 2K WebP; cắt quảng trường vuông quanh, giữ đĩa đá tròn + đế sao + trụ + ngọn lửa; tâm theo trụ, mặt quảng trường y = 0; tỉ lệ = bán kính outline OSM (way/92316094, 3,0 m) / bán kính đĩa quét (3,0) ≈ 1:1 → cao 3,7 m.
- `landmarks/models.ts`: `MODELS` + `{ id: 'flamme', key: '-6_0', url: 'models/lm-flamme.glb', farParts: true }`; mức xa / dự phòng = ngọn lửa thủ tục Phase 2B (`g2.flamme`). `g1.modelPose` nhận `'flamme'` (đặt `minGround − graphics8c.flamme.sink`). Collider: hộp bệ của g2 (worker) giữ nguyên.

### Dữ liệu bản đồ
- `scripts/build-chunks.ts`: điểm `bus_shelter` (highway=bus_stop + shelter=yes, bỏ trùng trong 15 m). Chạy lại một lần: chỉ `points` + `stats` của `index.json` đổi (214 tệp), commit riêng. Tất định.

### Preset
- `p8c-quay`: preset cũ đặt camera trong nhà và tính độ cao trên DEM chưa khoét (camera dưới mặt kè → ảnh lộn) → camera cố định `/?cam=706.2,3.2,708.6,260,-4` trên vỉa hè Quai Voltaire nhìn dọc hàng sạp.
- `p8c-props`: chuyển tới góc Rue Pasquier (bàn quán ở góc, ghế, đèn): Rue Royale cũ không có đồ mới.
- `p8c-trees`, `p8c-trees-top`, `p8c-flamme`, `lm-flamme`: giữ.

## 2. Số liệu (SwiftShader headless, máy tải nặng; `screenshots/after-t2/stats.json`, so `screenshots/before-8c/`)
| Preset | Lệnh vẽ trước → sau | Tam giác (M) trước → sau |
|---|---|---|
| `street` | 328 → 312 | 0,91 → 0,68 |
| `champs` | 1432 → 1279 | 4,15 → 2,29 |
| `p4b-sidewalk` | 335 → 314 | 0,95 → 0,72 |
| `p8c-trees` | 338 → 322 | 0,99 → 0,70 |
| `p8c-trees-top` | 408 → 367 | 1,14 → 0,77 |
| `p8c-quay` | (ảnh hỏng) → 310 | → 0,83 |
| `p8c-flamme` | 317 → 296 | 1,27 → 0,85 |
| `lm-flamme` | 337 → 309 | 1,05 → 0,75 |
| `p8c-bench` FPS avg / p5 | 1,7 / 1,3 → 2,0 / 1,2 | 0,99 → 0,72 |
| `p8c-bench-low` FPS avg / p5 | 1,5 / 1,2 → 2,3 / 2,0 | |

Ít lệnh vẽ và tam giác hơn trước (cây xa = impostor 12 tam giác thay cây 180 tam giác ở mọi khoảng cách; đồ phố ẩn ngoài tầm). Lưu ý: SwiftShader khớp `weakGpu` → cả `p8c-bench` lẫn `-low` đều chạy chất lượng thấp.

## 3. Ảnh đã xem (PNG thật, so before-8c)
`p8c-trees` (đại lộ platane: tán lá thật thay khối cầu, bóng lốm đốm), `p8c-trees-top` (từ cao: tán tự nhiên), `p8c-props` (bàn quán ở góc phố, ghế, đèn gang, biển tên), `p8c-quay` (sạp sách trên kè Quai Voltaire, đèn gang, ghế), `p8c-flamme` / `lm-flamme` (bản quét trên quảng trường Alma, bàn quán trên vỉa hè quảng trường), `champs`, `street`. 4 vòng sửa: viền mip giữa ô atlas (lùi uv 3 %), cụm lá bắt chéo nhìn từ trên thành "ngôi sao" (thêm card nghiêng), sạp sách ở sườn kè (độ cao lấy mặt kè), bàn quán trên đảo giao thông (cần mặt tiền).

## 4. Lệch hợp đồng / kế hoạch
- Sửa thêm ngoài danh sách tệp T2 (tối thiểu, cần thiết): `client/src/world/landmarks/g2.ts` (export `flamme`; bỏ chi tiết `flamme` khỏi g2 khi `graphics8c.flamme` bật – nếu không, ngọn lửa thủ tục chồng lên bản quét), `g2.test.ts` + `g1.test.ts` (1–2 dòng: kiểu id / gọi `flamme`), `client/src/geo/chunkData.ts` (`PointRec.kind` + `'bus_shelter'`). Chi tiết collider-only của Flamme nằm ở `g1.details`.
- Không có `trees.glb`: hình học cây dựng bằng mã trên client (kế hoạch cho phép); chỉ 1 loài platane (không marronnier / tilleul) – biến thể bằng tỉ lệ / hướng theo hash.
- Bồ câu: KHÔNG làm (tùy chọn). `animated_bird_pigeon.glb` vẫn được `credits8c` liệt kê → người ghép nên thêm nó vào `UNUSED` của `manifest.ts` (không phải tệp T2) hoặc làm bồ câu sau.
- Ghế quét "mini_paris_bench" chỉ rộng 0,5 m → kéo ×2,2 theo chiều dài (texture thanh gỗ giãn ngang).
- Bản quét Morris có mũ màu loang (từ texture quét gốc); không sửa.
- Không hạ cấp theo FPS lúc chạy (như nền T0).
- `client/src/world/allChunks.test.ts`: ngân sách "draw buckets" / chunk không đếm 4 loại đồ phố mới (LOD theo instance, không vẽ ngoài ≤ 400 m; lệnh vẽ đo thật giảm, bảng §2). `g2.test.ts`: lấy cả bản ghi `flamme` dù nó đã rời `details` của g2.

## 5. Kiểm tra
- Test mới: `attach.test.ts` (`lodInstances` chọn mức theo khoảng cách, ẩn ngoài mức cuối, đổi mức muộn), `StreetProps.test.ts` (ngân sách 3 mức cây; ghế / nhà chờ / sạp sách ngoài lòng đường, ngoài nhà, hướng ra đường, chỉ trên quai có tên).
- ride-check, `npm run build && npm test`: xem mục 6.

## 6. Kết quả chạy cuối
- `npm run ride-check`: OK (đi bộ 4,0 / xe 5,2 m/s, ngã + dậy + lên lại, thấp nhất −0,03 m, heap 138 → 145 MB). RIDE_ONLY=3 không chạy riêng: không thêm collider nào ở kè / cầu thang.
- `npm run build && npm test` (gốc worktree): qua – scripts 109, shared 76, client 734, worker 154 = 1 073 test. (Lần chạy đầu: 1 lỗi kiểu ở `props.ts` + 3 test cần sửa như §4; `gps.test` thời gian tìm đường ≤ 5 ms trượt một lần do máy tải nặng, lần sau qua.)
- Không còn vite / Chrome chạy nền. `client/public/credits.json` không commit (sinh lại khi ghép: `npm run process-assets -- trees props flamme`).

## 7. Việc còn chờ thử tay
- FPS trên GPU thật (laptop tầm trung + GPU tích hợp, `?quality=low|high`): SwiftShader chỉ so tương đối.
- Nhìn cây / đồ phố khi đạp xe nhanh (chuyển mức LOD mỗi 3 m: có "nhảy" thấy được không).
- Quai Voltaire / Conti / Montebello: sạp sách đúng mép kè ở mọi đoạn (dò bằng lưới độ cao 5 m).
