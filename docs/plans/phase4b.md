# Phase 4B – Xe cộ & người đi đường NPC: kế hoạch

Nguồn: SPEC §3 (hạn mức, chỉ client), §6.3 (ngã xe), §14 (hiệu năng), §17.5 (NPC), §17.7 (asset, MIT); STYLE_GUIDE "Đường phố"; `docs/plans/phase4.md` §6 (roadgraph), §10; `docs/plans/phase2b-assets.md` §3.1–3.2; memory "Rocketbox approved" (31 file, 2026-09-30).

## 1. Phạm vi

- **Có:**
  - xe NPC (ô tô, taxi, xe van, xe tải giao hàng, xe buýt, xe tay ga, xe máy) chạy theo `roadgraph.json`: đúng chiều `oneway`, giữ làn bên phải, bám xe trước, dừng đèn đỏ, nhường ở giao lộ không đèn, vòng xuyến Étoile, nhường người trên vạch;
  - đèn tín hiệu đơn giản (chu kỳ 2 pha) + cột đèn nhìn thấy được; vạch người đi bộ vẽ ở các nút `crossing`;
  - người đi đường Rocketbox: đi trên vỉa hè, qua đường ở vạch / giao lộ (theo đèn), đứng, gọi điện, nhìn quanh, vẫy tay, ngồi ghế công viên / quảng trường;
  - va chạm với người chơi: xe phanh trước người, chạm thì đẩy nhẹ; đạp xe tông xe → ngã xe (§6.3, dùng crash sẵn có); người đi đường né, bị va thì lảo đảo;
  - vùng cấm `setExclusionZones` (API cho Phase 7), mật độ trong `config.ts`, tự giảm khi FPS thấp;
  - tất định theo seed (test + ảnh chụp), chỉ chạy ở client.
- **Không có (để sau):**
  - Phase 5: minimap (NPC không có trong dữ liệu minimap, không cần code);
  - Phase 7: gọi `setExclusionZones` bằng geofence thật của hộp mật thư / thảm về đích;
  - Phase 12: tiếng động cơ / còi, đèn pha ban đêm, đổi làn / vượt, trạm xe buýt, instancing hoạt ảnh nướng sẵn cho người ở xa (xem quyết định 9), thêm avatar.

## 2. Kiểm tra đầu vào (đo ngày 2026-09-30)

### 2.1 `shared/data/roadgraph.json` (2,30 MB)
- 74 697 nút, 99 092 cạnh, 31 606 way.
- **Cạnh `car`:** 16 779 cạnh, 400,2 km.
  - Theo loại: residential 173,3 km, service 73,8, primary 43,3, secondary 42,9, tertiary 40,1, living_street 23,3, unclassified 2,6, `*_link` 0,8.
  - `oneway` 12 444 cạnh / 303,4 km (76 %), hai chiều 96,8 km; `roundabout` 320 cạnh.
  - Tag `lanes`: không có 255,5 km; 1 làn 41,7; 2 làn 52,1; 3 làn 27,1; 4 làn 16,5; ≥ 5 làn 7,4.
  - 15 095 nút car; **3 257 giao lộ** (≥ 3 đầu cạnh car); 947 ngõ cụt; 197 nút "hút" (vào được, không ra được).
  - **Bỏ `service`** (lối vào bãi xe, sân trong): còn 326,3 km / 11 806 nút. Thành phần liên thông mạnh (có hướng) lớn nhất: **10 921 nút (92,5 %), 304,5 km**. Xe chỉ chạy trong thành phần này, nên không bao giờ kẹt ở ngõ cụt hay đường một chiều cụt.
- **Đèn / vạch:** `signals` 1 311 (1 193 nằm trên nút car); `crossings` 7 264 (6 274 trên nút car); `junctions` 3 417. Có **1 155 / 3 257 giao lộ car** có nút đèn trong vòng 30 m.
- **Étoile** (`Place Charles de Gaulle`):
  - 35 cạnh, 433 m, cờ `walk|bike|car|oneway|pave|roundabout`, `lanes = 12`, không có `width` (RoadBuilder dùng `widthByName` 36 m);
  - tâm (−1916,4; −921,7), bán kính 66–72 m, 12 nút ra / vào, 2 nút đèn trên vòng;
  - chạy **ngược chiều kim đồng hồ** nhìn từ trên (diện tích có dấu +14 814 m², đúng luật Pháp).
- **Mạng đi bộ:** 1 467 km: sidewalk 730,6 km, crossing 12 707 cạnh / 51,8 km, footway / path (không phải sidewalk / crossing) 120,1 km, pedestrian 125 km.
- **Way `footway=sidewalk` của OSM lệch so với vỉa hè vẽ** (RoadBuilder: tim đường + `roadWidth / 2` … `+ sidewalkWidth`). Trên 26 991 đoạn dài ≥ 3 m:
  - 40,5 % nằm trong dải vỉa hè vẽ;
  - 7,1 % nằm trong lòng đường;
  - 50,2 % nằm xa hơn (18 % xa hơn 10 m);
  - 2,2 % không có đường car nào gần.
  → **Không** cho người đi theo way sidewalk / crossing OSM (người sẽ đi giữa lòng đường hoặc trong nhà). Người đi theo dải vỉa hè **đã vẽ** (quyết định 7).
- **Bề rộng:** `RoadGraph.halfWidth` là private và khác RoadBuilder (mặc định 6 m, trong khi RoadBuilder dùng `widthByKind`). NPC dùng `roadWidth` / `sidewalkWidth` export từ `world/RoadBuilder.ts` (module không đụng DOM), nên xe và người khớp đúng mặt đường vẽ.
- **Cầu:** đồ thị chỉ có cờ `bridge`. Độ cao mặt cầu = `BridgeBuilder.deckY`: tuyến tính theo độ dài chuỗi, giữa địa hình 5 m ngoài hai đầu chuỗi, không thấp hơn địa hình. NPC dựng lại chuỗi cầu từ đồ thị để xe không chạy dưới lòng sông.
- **Mật độ quanh vài điểm:**

| Điểm | Đường car (bỏ service) ≤ 250 m | Vỉa hè hai bên ≤ 120 m | Lối đi công viên / quảng trường ≤ 120 m | Nút vạch ≤ 120 m | Nút đèn ≤ 250 m |
|---|---|---|---|---|---|
| Concorde | 2,79 km | 1,64 km | 0,65 km | 29 | 12 |
| Étoile | 4,64 | 2,07 | 0 | 9 | 94 |
| Opéra | 3,72 | 1,54 | 0,84 | 14 | 32 |
| Saint-Germain | 4,77 | 2,12 | 0,97 | 29 | 13 |
| Tuileries | 0,77 | 0 | 1,61 | 0 | 8 |
| Marais | 2,76 | 0,11 (phần lớn là living_street) | 0,84 | 12 | 5 |
| Champ-de-Mars | 2,64 | 1,04 | 1,56 | 4 | 8 |

### 2.2 Model xe (`.cache/assets`, đã duyệt và tải ở Phase 2B)

| File | Tam giác | Rộng × cao × dài | Cấu trúc | Ghi chú |
|---|---|---|---|---|
| `car-sedan-1_quaternius.glb` | 3 124 | 1,64 × 1,15 × 3,31 | 4 node: thân, `BackWheels` (2 bánh chung 1 node), `FrontLeftWheel`, `FrontRightWheel`; 7 material | mét, đất y ≈ 0, mũi +Z (đèn pha z +1,51), bánh r ≈ 0,25 |
| `car-sedan-2_quaternius.glb` | 2 954 | 1,81 × 1,18 × 4,22 | như trên, 6 material | r 0,26 |
| `suv_quaternius.glb` | 3 294 | 2,11 × 1,53 × 4,21 | như trên | r 0,33 |
| `taxi_quaternius.glb` | 3 278 | 1,81 × 1,31 × 4,22 | như trên | thân vàng kiểu New York, cần đổi màu; r 0,26 |
| `truck-delivery_quaternius.glb` | 7 474 | 2,71 × 2,88 × 5,26 | 5 node, 1 texture `Atlas` | r 0,44 |
| `scooter_poly-by-google.glb` (CC-BY) | 2 746 | 17,2 × 36,3 × 42,8 (đơn vị gốc) | 1 mesh, 6 primitive | bánh dính thân, không có người lái |
| `motorcycle_jeremy.glb` (CC-BY) | 2 092 | trục dài theo X: 15,8 × 9,9 × 5,7 | 1 mesh | mũi +X (đèn đỏ ở x −7,7), bánh dính thân, không có người lái |
| rgsdev `Bus/Van/Hatchback.fbx` (CC0) | 1 702 / 1 392 / 1 378 | 3,81 × 4,27 × 13,70 / 2,81 × 2,71 × 5,91 / 2,81 × 2,01 × 5,11 (cm → m) | FBX 7.4 binary, không texture, màu theo material (`body <màu>`, `windows`, `tires`…), 4 node bánh `<Tên>_wheel_front_left…` | mũi +Z; dáng "mập" (rộng gấp rưỡi xe thật), nên scale không đều về kích thước thật |

- Quaternius `ped-*` (8 file): **không dùng**, Rocketbox thay. Ví dụ ped-man-casual: 5 776 tam giác, 62 xương, 24 clip, không có clip ngồi.

### 2.3 Microsoft Rocketbox (MIT, tải hôm nay)
- **Tải:** 31 file (R1–R30 + `LICENSE.md`) vào `.cache/assets/rocketbox/<cùng đường dẫn>`, tổng 197,08 MB. Dung lượng từng file khớp danh sách đã duyệt. FBX đều là "Kaydara FBX Binary"; TGA không nén.
- **4 avatar** (đo bằng three `FBXLoader` trong Chrome hệ thống qua playwright-core):
  - 1 `SkinnedMesh` / avatar, **80 xương** (52 thân `Bip01_*` + 28 xương mặt);
  - 3 material (`body`, `head`, `opacity`) nhưng 7–11 group, tức 7–11 lệnh vẽ nếu để nguyên;
  - tam giác: Male_Adult_08 7 364, Female_Adult_05 8 288, Business_Male_01 7 435, Business_Female_01 8 966 (body 4,0–5,1k, head 2,7–3,2k, opacity 0,3–0,9k);
  - đơn vị cm (cao 173,6–182,6), mặt hướng +Z như glTF, chân ở y = 0.
- **Texture:**
  - `*_body_color` / `*_head_color`: 2048², 24 bit;
  - `*_opacity_color`: 2048² RGBA (riêng m005: 1024²), dùng làm cả `map` lẫn `alphaMap` của material opacity (tóc, lông mi) → dùng alphaTest;
  - FBX còn tham chiếu normal / specular (không tải) theo đường `Export/<file>.tga`, trong khi file thật nằm ở `Textures/` → cần URL modifier;
  - UV của mọi group nằm trong [0, 1], nên gộp atlas được.
- **Bộ xương:**
  - cả 4 avatar có cùng tên 80 xương (thứ tự khác nhau);
  - 2 avatar nam cùng bind pose (pelvis 89,5 cm, đầu 158,7 cm), 2 avatar nữ cùng bind pose (pelvis 92,3 cm, đầu 152,2 cm);
  - gốc là `Bip01` (Bone, không nằm trong skin) → `Bip01_Pelvis`.
- **14 clip:**
  - mỗi file 1 clip `Take 001`, có track trên 83 xương (80 + `Bip01`, `Bip01_Footsteps`, `MotionExtractionHelper`);
  - mọi xương đều có track vị trí (hằng số), nên chỉ giữ `Bip01` và `Bip01_Pelvis`;
  - root motion nằm trên `Bip01`: m_walk_neutral 121,4 cm / 1,20 s = **1,01 m/s**; m_walk_stroll 108,6 / 1,57 = **0,69**; f_walk_neutral 145,7 / 1,20 = **1,21**; f_walk_stroll 129,7 / 1,40 = **0,93**;
  - thời lượng: idle 11,7 / 15,5 s; phone 31,9 / 41,2; sit 36,1 / 33,2 (`Bip01` y 59–61 cm); look 4,6 / 4,5; wave 2,8 / 5,5 (nam / nữ);
  - clip `m_` cho avatar nam, `f_` cho avatar nữ: cùng tên xương, cùng bind pose, nên **không cần retarget**.
- **Công cụ (đã thử):**
  - `FBXLoader` chạy trong Chrome hệ thống: `page.route` phục vụ `node_modules/three` + file gốc, dùng import map, không cần server;
  - bẫy: code trong `page.evaluate` chạy qua tsx bị esbuild chèn `__name`, nên phải gọi `page.addInitScript('window.__name = (f) => f')`;
  - `sips -s format png` đọc TGA ra PNG, giữ alpha. `sharp` đã có sẵn (hoisted) cho resize / ghép atlas / WebP. Không dùng FBX2glTF.

### 2.4 Code hiện có
- `CharacterModel` gắn với UBC (mask quần áo theo tên xương UBC, material tóc, bảng tên). `CharacterAnimator.pickState` đọc `PlayerState`, còn lớp tay / IK xe đạp theo xương UBC. → Người đi đường **không** dùng lại hai lớp này, chỉ học cách làm (clone skinned, cull sphere cố định, cắt clip theo thời gian).
- `CharacterController`:
  - KCC va chạm với mọi collider;
  - `noseProbe` (castShape) sẽ tự đụng collider xe NPC → crash ≥ `bike.crashImpact` có sẵn;
  - `surface()` / `place()` lấy mặt đi được **cao nhất** (có thể là nóc xe) → phải bỏ qua nhóm NPC.
- `ThirdPersonCamera.cast` (castShape) chưa có `filterGroups`: xe chạy qua sẽ làm cần camera co giật.
- `RoadGraph` có `edgesNear`, `edgesOf`, `flags`, `allows(e, 'car', forward)`, nhưng không có bề rộng (xem 2.1).
- `GameLoop.fixedUpdate` 60 Hz: NPC bước ở đây (tất định).
- `process-assets.ts`: `BUILDS` theo tên, `MODIFIED`, `LABELS`, `credits.json` sinh từ `.cache/assets/manifest.json` (gitignored); test đọc GLB đã commit bằng `GLTFLoader.parse` (mẫu `BikeModel.test.ts`).

## 3. Quyết định

1. **Package: không thêm.** Dùng three (FBXLoader, TGALoader, GLTFExporter, SkeletonUtils), playwright-core + Chrome hệ thống, gltf-transform, meshoptimizer, sharp, `sips` (macOS).
2. **Chỉ client, tất định:**
   - `npc/rng.ts` (mulberry32);
   - mỗi sim có một luồng ngẫu nhiên riêng (`npc.seed` xor hằng của sim), `?npcSeed=` ghi đè;
   - không dùng `Math.random` / `Date`, chỉ lặp trên mảng;
   - sim bước ở `physics.fixedDt` trong `fixedUpdate`, **trước** người chơi;
   - cùng seed + cùng đường đi của người chơi → cùng trạng thái (có test).
3. **Neo (anchor):**
   - NPC sống quanh chân người chơi. Camera bay `V` vẫn neo vào thân người chơi.
   - Chế độ khán giả `?cam=` mặc định không có NPC; `?npc=1` thì neo vào điểm đất dưới camera (không có thân để phanh).
   - `?npc=0` tắt (dùng cho `ride-check` và các preset kiểm tra vật lý).
4. **Mật độ:**
   - Số xe mục tiêu = `density × traffic.perKm × km đường car (hợp lệ) trong traffic.radius`, tối đa `traffic.max`. Mặc định 10 xe/km trong 250 m → Concorde ≈ 28, Opéra ≈ 37, Saint-Germain ≈ 48 (trần 60).
   - Số người = `density × crowd.perKm × km dải đi bộ trong crowd.radius`, tối đa `crowd.max`. Mặc định 12 người/km trong 120 m → Concorde ≈ 28, Tuileries ≈ 19, Saint-Germain ≈ 37 (trần 40).
   - `density = npc.density × tự động`. D giảm × 0,8 khi FPS trung bình 2 s < 45, tăng +0,1 sau 5 s ≥ 57, sàn 0,25 (`npcRender.autoDensity`, hàm thuần `nextDensity`).
5. **Sinh / xóa:**
   - Lúc bắt đầu: rải đầy bán kính (cách thân ≥ 8 m, ngoài vùng cấm), rồi **chạy trước** `npcRender.warmUp` s (20 s). Khung hình đầu đã có dòng xe chạy và hàng chờ đèn đỏ (≤ 1 s CPU, tất định).
   - Sau đó chỉ sinh trong vành [0,6 × bán kính, bán kính], ngoài hình nón nhìn (±`viewConeDeg` quanh `viewYaw`) hoặc xa hơn `render.fog.near`.
   - Xóa khi ra ngoài bán kính + `despawnMargin`, hoặc đứng yên > `stuckSeconds` mà nằm ngoài hình nón nhìn.
6. **Xe (track B, thuần):**
   - **Mạng:**
     - cạnh `car` có loại thuộc `traffic.kinds` (bỏ service), trong thành phần liên thông mạnh lớn nhất (tính lúc nạp);
     - đi ngẫu nhiên: ở mỗi nút chọn cạnh ra, ưu tiên đi thẳng và đường lớn, không quay đầu trừ khi bắt buộc;
     - không chọn cạnh đi vào vùng cấm nếu còn lựa chọn khác;
     - xe buýt chỉ đi `npc.vehicles.bus.roads`.
   - **Làn:**
     - lái bên phải;
     - đường một chiều: số làn = `lanes` hoặc `round(bề rộng / roads.laneWidth)`, kẹp trong [1, `traffic.maxLanes`] (Étoile 12 → 4);
     - đường hai chiều: số làn mỗi chiều = `max(1, ⌊lanes / 2⌋)`;
     - làn chọn lúc sinh và giữ suốt, không đổi làn (ponytail); sang cạnh ít làn hơn thì kẹp chỉ số làn.
   - **Cua:** cắt góc ở mỗi nút bằng Bézier bậc 2 (`traffic.cornerCut`, ≤ nửa cạnh); tốc độ trong cua ≤ √(`latAccel` × R).
   - **Tốc độ:** `traffic.speed[kind]` (Paris 30 km/h = 8,3 m/s là mặc định; primary 12,5; living_street 5,5; vòng xuyến 9), nhân hệ số riêng từng xe trong `speedJitter`.
   - **Bám xe:**
     - vật cản gần nhất phía trước trong cùng làn, tìm trên tuyến tới `lookAhead`: xe trước, vạch dừng đèn đỏ / nhường, người chơi, người đi đường;
     - `v ≤ √(2 · brake · max(0, gap − minGap))`, tăng tốc `accel`;
     - **không bao giờ tiến vào** vật cản đang chồng lên thân xe.
   - **Đèn (`npc/lights.ts`):**
     - Giao lộ car có nút `traffic_signals` trên nhánh vào trong `lights.reach` (30 m) thì có đèn (≈ 1 155 giao lộ).
     - Hai pha: nhánh lớn nhất + nhánh đối diện (lệch ≤ 45°) là pha 0, còn lại là pha 1.
     - Chu kỳ 2 × (xanh 18 + vàng 3 + đỏ chung 2) = 46 s, lệch pha = `hash01(nút)` × chu kỳ.
     - Vạch dừng: tại nút đèn trên nhánh nếu có, nếu không thì cách nút `max(nửa bề rộng các nhánh khác) + 2` m.
     - Nút đèn lẻ (qua đường giữa phố, không thuộc giao lộ): xe đỏ `pedGreen` s trong mỗi `pedCycle` s.
   - **Giao lộ không đèn:**
     - nhánh chính (loại đường cao nhất, đi gần thẳng ≤ 30°) không nhường;
     - nhánh phụ dừng ở vạch, đợi tới khi không còn xe nhánh chính trong `yieldLook` m và hộp giao lộ trống (khóa theo thứ tự tới trước).
   - **Vòng xuyến:** cạnh `roundabout` là vòng. Xe vào nhường xe trên vòng: đợi tới khi không có xe vòng trong `roundaboutGap` m phía trước điểm nhập. Xe trên vòng không nhường. Étoile ngoài đời là ưu tiên bên phải (xe trên vòng nhường xe vào); game làm ngược lại cho dòng xe không kẹt (câu hỏi 2).
   - **Vật cản:** thân người chơi (+ mũi xe đạp khi đang đạp) và người đi đường nằm trong hành lang làn (lệch ngang ≤ nửa bề rộng xe + `obstacleMargin`).
   - **Độ cao:** `NpcRoads.heightOn(e, s)` (lưới đã carve, mặt cầu theo chuỗi); `pitch` tính từ độ cao trục trước / sau.
7. **Người đi đường (track C, thuần):**
   - **Dải đi bộ** (không dùng way sidewalk / crossing OSM, xem 2.1):
     - (a) hai bên mọi đường car có vỉa hè (`sidewalkWidth > 0`), lệch khỏi tim đường `nửa bề rộng + sidewalk × u`, u ∈ `crowd.band` (riêng từng người);
     - (b) `living_street`: hai bên, cách mép `crowd.inset` trong lòng đường;
     - (c) footway / path / pedestrian không có cờ sidewalk / crossing / steps: tim ± u × nửa bề rộng (quảng trường, công viên).
     - (a + b) và (c) là hai mạng riêng, người không chuyển từ mạng này sang mạng kia (ponytail).
   - **Đi:**
     - tốc độ đi thường `walkSpeed` hoặc đi dạo `strollSpeed`, theo tỉ lệ `strollShare`;
     - ở giao lộ trên vỉa hè: rẽ góc sang nhánh kề cùng phía, hoặc băng qua nhánh kề rồi đi tiếp, hoặc băng qua chính nhánh đang đi để quay lại phía bên kia;
     - chỗ qua đường: nút `crossing` trên nhánh đó trong `crossReach` m, không có thì ở mép vạch dừng;
     - nút `crossing` giữa phố: xác suất `crossChance`.
   - **Qua đường:**
     - đợi ở mép vỉa hè tới khi (có đèn) `lights.pedMayCross` và (mọi chỗ) không xe nào trên cạnh đó tới vạch trong `crossGap` s;
     - rồi đi thẳng qua; trong lòng đường người là vật cản của xe (B).
   - **Hoạt động:**
     - đang đi thì thỉnh thoảng dừng (`idle.per100m`) để `stand` / `lookAround` / `phone` trong `idle.seconds`; trên dải (c) dừng nhiều hơn;
     - người chơi bấm `G` trong `waveBack` m và người kia đang nhìn về phía người chơi → vẫy lại.
   - **Ghế:**
     - `seatsNear` tất định: dọc cạnh (c), mỗi `seatEvery` m, `hash01 < seatChance`, lệch `seatOffset` m, quay mặt vào lối đi, cách đường car ≥ `seatRoadClear` m;
     - `sitShare` số người sinh ra ngồi ở ghế trống gần đó, ngồi yên tới khi bị xóa.
   - **Né người chơi:**
     - thân người chơi trong `avoid.ahead` m phía trước và lệch ngang ≤ `avoid.side` m → dịch ngang tới `avoid.shift` m (mượt) hoặc dừng;
     - chạm (khoảng cách < `bodyRadius` + `player.radius`, hoặc mũi xe đạp) → lảo đảo `stagger.seconds`, bị đẩy `stagger.push` m ra xa rồi đi tiếp;
     - `step` trả `knocked`: đang đạp xe tông người thì D nhân tốc độ xe với `npcRender.bikeHitKeep`, không ngã (câu hỏi 1).
   - **Độ cao:** `heightOn` + `roads.lift + roads.curbHeight` trên vỉa hè (a); không cộng trên (b), (c).
   - **Vùng cấm** (bán kính + `npc.zoneMargin`):
     - không sinh, không ngồi, không dừng đứng trong vùng;
     - người đang đi không chọn cạnh đi vào vùng (hết lựa chọn thì quay lại);
     - ai đang ở trong vùng khi vùng được đặt thì đi ra, không dừng.
8. **Va chạm và Rapier (track D):**
   - Xe cách người chơi ≤ `npcRender.colliderRadius` (40 m) có collider cuboid kinematic (pool `maxColliders` 16), nhóm `NPC_GROUPS`:
     - KCC không đi xuyên xe;
     - `noseProbe` của xe đạp đụng collider xe → crash ≥ `bike.crashImpact` (§6.3), dưới ngưỡng thì trượt dọc / giảm tốc như tường;
     - xe chồng lên người chơi (hình hộp và hình tròn) → `controller.push()` qua KCC, tối đa `push.maxSpeed` 1 m/s (đẩy nhẹ, tường vẫn chặn).
   - Camera cast, `surface()` / `place()`, `Bikes.groundAt` dùng `IGNORE_NPC`: camera không giật khi xe chạy qua, không ai đáp xuống nóc xe.
   - Người đi đường không có collider.
9. **Hiển thị (track D):**
   - **Xe:** mỗi loại 1 `InstancedMesh` (1 lệnh vẽ):
     - chung một material vertex colour, thuộc tính `paint` (0/1) trộn `instanceColor` chỉ vào thân (shader giống `outfitShader`);
     - bánh: 1 `InstancedMesh` bánh đơn vị chung cho mọi xe, quay theo `wheel`, chưa đánh lái (ponytail). Xe máy / xe tay ga không quay bánh (bánh dính thân);
     - `frustumCulled = false` (xe rải quanh camera; ponytail).
   - **Đèn tín hiệu:** 1 `InstancedMesh` cột + hộp, 1 `InstancedMesh` bóng sáng (`instanceColor`, không tone map), đặt ở mép phải vạch dừng, quay về xe tới. Không có collider (ponytail như biển tên đường).
   - **Vạch người đi bộ:** 1 `InstancedMesh` (texture sọc bằng canvas) tại nút `crossing` trên cạnh car hợp lệ trong 200 m, ngang bề rộng đường.
   - **Ghế:** 1 `InstancedMesh` ghế sắt xanh kiểu công viên Paris dựng bằng code (≤ 300 tam giác) tại `seatsNear`.
   - **Người:**
     - `SkinnedMesh` clone theo avatar, dùng lại qua pool;
     - LOD0 ≤ `pedLod0` (30 m): lưới đầy đủ, đổ bóng, mixer mỗi khung;
     - LOD1 xa hơn: lưới giảm, không bóng, mixer mỗi `farAnimEvery` khung;
     - `PedAnimator` nhỏ riêng (hoạt động → clip, crossfade, tốc độ phát theo tốc độ đi), lảo đảo = nghiêng gốc tắt dần (hàm thuần).
     - ponytail: tối đa 40 người skinned (≤ 40 lệnh vẽ). Nâng cấp: instancing hoạt ảnh nướng sẵn (ảnh xương) cho người ở xa, làm khi `p4b-density` vượt ngân sách mục 9.
   - Pose nội suy giữa 2 bước sim bằng `GameLoop.alpha`, như người chơi.
10. **Asset (track A):**
    - **Đội xe (10 loại):** city = Quaternius sedan-1, sedan = sedan-2, suv, taxi (sơn đen + đèn "TAXI" trắng), truck = truck-delivery, hatchback / van / bus = rgsdev, scooter, moto.
      - Scale **không đều** về đúng `npc.vehicles[kind].dims`; pivot = đất dưới giữa trục; mũi +Z.
      - Bỏ bánh gốc, ghi tâm trục + bán kính vào `extras`; mọi material → vertex colour (texture `Atlas` của truck lấy màu tại UV); thuộc tính `_PAINT` cho material thân.
      - Giảm còn ≤ `npcAssets.maxTris`.
    - **Người lái xe máy / xe tay ga:** thân UBC (`player.glb`) tạo dáng `Driving_Loop` ở t = 0 rồi skin trên CPU trong Chrome, giảm còn ≤ 1 500 tam giác, tô màu phẳng (áo khoác, quần), mũ bảo hiểm hình cầu, gộp vào lưới xe → vẫn 1 lệnh vẽ.
    - **Rocketbox:**
      - 4 avatar, scale 0,01, mỗi avatar **1 primitive, 1 material** (atlas 2048²: body, head, opacity mỗi phần 1024², alpha chỉ ở ô opacity, `alphaMode MASK`), LOD0 + LOD1 (giảm bằng meshopt, giữ skin);
      - clip: 14 clip đặt tên `m_walk`, `m_stroll`, `m_idle`, `m_lookAround`, `m_phone`, `m_sit`, `m_wave` và tương tự `f_*`;
      - bỏ x/z của `Bip01` (đi tại chỗ), bỏ track xương mặt, `Footsteps`, `MotionExtractionHelper`; chỉ giữ vị trí của `Bip01` / `Bip01_Pelvis`; `resample()`.
    - **Ghi nguồn:**
      - `MODIFIED` + nhãn mới trong `credits.json`;
      - bỏ khỏi credits các file `ped-*_quaternius` không dùng;
      - thêm mục manifest `rocketbox` (MIT, © 2020 Microsoft);
      - chép `LICENSE.md` thành `client/public/models/LICENSE-rocketbox.md` (MIT bắt buộc giữ ghi chú).
11. **Minimap / Host:** NPC chỉ nằm trong scene của client, không vào dữ liệu nào minimap (Phase 5) hay Host đọc. Không cần code.
12. **Người điều phối cần ghi vào SPEC §17:** §17.5 viết "dùng lại nhân vật + animation của Phase 3" và "ưu tiên CC0", nhưng người đi đường dùng Rocketbox (MIT, anh đã duyệt 31 file ngày 2026-09-30). Ghi thêm mục duyệt Rocketbox vào §17 và `phase2b-assets.md`.

## 4. Nền (foundation, người điều phối commit trước khi chia track)

| File | Nội dung |
|---|---|
| `client/src/npc/types.ts` | toàn bộ kiểu ở mục 5 (`CarKind` suy từ `npc.vehicles`), `NPC_GROUPS`, `IGNORE_NPC` |
| `client/src/npc/rng.ts` (+ test) | `mulberry32(seed)`, `pickWeighted(rng, weights)` |
| `client/src/npc/roads.ts` (+ test) | `NpcRoads` đầy đủ trừ cầu: bề rộng / vỉa hè theo `roadWidth` / `sidewalkWidth` của RoadBuilder, làn, `laneOffset`; `heightOn` = `heightAt` (B thêm chuỗi cầu). Test: bề rộng bằng RoadBuilder trên 3 way thật (Champs-Élysées nửa oneway, Étoile, một residential) |
| `client/src/npc/traffic.ts` | **stub** B: `cars` rỗng, `lights` = không có đèn (`car()` luôn `green`, `pedMayCross()` luôn `true`, `headsNear()` rỗng), `step` không làm gì, `park()` trả một `CarPose` đứng yên |
| `client/src/npc/crowd.ts` | **stub** C: `peds` rỗng, `step` trả `{ knocked: 0 }`, `seatsNear` rỗng |
| `client/src/npc/NpcAssets.ts` | **stub** A: `loadNpcAssets()` trả hộp theo `dims` cho mỗi loại + capsule 1,75 m cho 4 avatar, không có clip |
| `client/src/config.ts` | khối Phase 4B cuối file (mục 5.3): foundation `npc` đầy đủ; A `npcAssets`, B `traffic`, C `crowd`, D `npcRender` với các khóa ban đầu |
| `client/src/config.test.ts` | tổng `share` của `npc.vehicles` = 1 |
| `scripts/screenshot.ts` | khối `p4b-*` rỗng, mỗi track một dòng chú thích `[A]` … `[D]` |

- Chưa đụng `main.ts` (D ghép).
- Mỗi track làm trong git worktree riêng từ commit nền.
  - `.cache` không có trong worktree: A chạy `npm run process-assets -- --assets <repo chính>/.cache/assets npc-vehicles npc-peds npc-ped-anims`.
  - `SCREENSHOT_PORT` riêng mỗi track: A 5175, B 5176, C 5177, D 5178.

## 5. Interface (track giữ nguyên chữ ký; đổi thì báo người tích hợp)

### 5.1 `client/src/npc/types.ts` (nền)

```ts
import type { npc } from '../config.ts';
export type CarKind = keyof typeof npc.vehicles; // city hatchback sedan suv taxi van truck bus scooter moto

/** Circle NPCs keep clear of (Phase 7: clue-box / finish-mat geofence); + npc.zoneMargin. */
export interface ExclusionZone { x: number; z: number; r: number }

/** What the NPCs live around and react to, rebuilt every fixed step (D). */
export interface NpcAnchor {
  x: number; z: number;          // player feet (or the spectator camera's ground point)
  viewYaw: number;               // camera heading (PlayerState convention): no pop-in inside the view cone
  body: boolean;                 // false = spectator: nothing to brake for / dodge
  vx: number; vz: number;
  nose: { x: number; z: number } | null; // riding: front wheel (feet + heading × bike.wheelBase)
  waving: boolean;               // G this step: pedestrians close by wave back
}

export interface CarPose {
  readonly id: number; readonly kind: CarKind; readonly paint: number; // sRGB 0xRRGGBB
  x: number; y: number; z: number; // ground under the middle of the wheelbase
  yaw: number; pitch: number;      // 0 = north (−Z), + = left; + = nose up
  speed: number; wheel: number;    // m/s; rad rolled (distance / its wheel radius)
  braking: boolean;
}

export type PedActivity = 'walk' | 'stand' | 'lookAround' | 'phone' | 'wave' | 'sit';
export interface PedPose {
  readonly id: number; readonly avatar: number; // 0 … avatars − 1 (npc-peds.glb order)
  x: number; y: number; z: number; yaw: number; speed: number;
  activity: PedActivity; activityTime: number;  // s since it started (clip phase, deterministic)
  stagger: number; staggerYaw: number;          // s since knocked (−1 = not); direction pushed toward
}

export type LightColour = 'green' | 'amber' | 'red';
export interface SignalHead { readonly x: number; readonly z: number; readonly yaw: number; readonly junction: number; readonly edge: number }
export interface LightQuery {
  car(junction: number, edge: number): LightColour;       // cars arriving at `junction` along `edge`
  pedMayCross(junction: number, edge: number): boolean;   // true where there is no light
  headsNear(x: number, z: number, r: number): readonly SignalHead[];
}
export interface Seat { readonly x: number; readonly z: number; readonly yaw: number }

/** Rapier groups: NPC car colliders = membership bit 1; queries with IGNORE_NPC skip them. */
export const NPC_GROUPS = 0x0002_ffff;
export const IGNORE_NPC = 0xffff_fffd;
```

### 5.2 Các module

```ts
// npc/roads.ts (nền; B thêm cầu)
class NpcRoads {
  constructor(graph: RoadGraph, heightAt: (x: number, z: number) => number)
  readonly graph: RoadGraph
  kind(way): string; halfWidth(way): number; sidewalk(way): number          // = RoadBuilder
  lanes(way, forward: boolean): number; laneOffset(way, forward, lane): number // m, + = right of travel, lane 0 = kerb side
  heightOn(edge, s: number): number                                            // terrain / bridge deck at s m from edgeA
}

// npc/traffic.ts + npc/lights.ts (B)
class Traffic {
  constructor(roads: NpcRoads, seed: number)
  readonly cars: readonly CarPose[]; readonly lights: LightQuery; readonly time: number
  zones: readonly ExclusionZone[]
  step(dt, anchor: NpcAnchor, density: number, peds: readonly PedPose[], fill?: boolean): void
  park(kind: CarKind, x, z, yaw): CarPose   // ?npcTest: never moves, never despawns
}
class TrafficLights implements LightQuery { constructor(roads: NpcRoads); update(time: number): void }

// npc/crowd.ts (C)
class Crowd {
  constructor(roads: NpcRoads, seed: number)
  readonly peds: readonly PedPose[]
  lights: LightQuery                      // D sets traffic.lights; default = no lights
  zones: readonly ExclusionZone[]
  step(dt, anchor: NpcAnchor, density: number, cars: readonly CarPose[], fill?: boolean): { knocked: number }
  seatsNear(x, z, r): readonly Seat[]     // deterministic from the graph (chairs drawn whether used or not)
}

// npc/NpcAssets.ts (A)
interface VehicleTemplate { kind: CarKind; geometry: BufferGeometry /* vertex colours + `_paint` */; axles: [number, number, number][]; wheelRadius: number }
interface PedTemplate { scene: Object3D /* skinned LOD0 + LOD1 (userData.lod 0 | 1) */; gender: 'm' | 'f'; height: number }
interface NpcAssets { vehicles: Map<CarKind, VehicleTemplate>; peds: PedTemplate[]; clips: Map<string, AnimationClip> /* 'm_walk', 'f_sit', … */ }
loadNpcAssets(): Promise<NpcAssets>       // missing file → console.warn + boxes / capsules

// npc/Npc.ts (D) – dùng bởi main.ts và Phase 7
class Npc {
  static create(scene, world: RAPIER.World, graph: RoadGraph, heightAt, opts: NpcOptions): Promise<Npc>
  start(anchor: NpcAnchor): void          // fill + warm-up
  fixedUpdate(dt, anchor: NpcAnchor, player?: CharacterController): void // traffic → crowd → colliders → push / bike hit
  update(dt, alpha: number, camera: Camera): void
  setExclusionZones(zones: readonly ExclusionZone[]): void // Phase 7
  readonly stats: { cars: number; peds: number; density: number; simMs: number }
}
// CharacterController (D) – thêm
controller.push(dx: number, dz: number): void // applied through the KCC at the next fixedUpdate
```

Thứ tự trong một bước cố định:
1. `traffic.step(…, crowd.peds)`;
2. `crowd.step(…, traffic.cars)`;
3. đặt collider xe;
4. đẩy người chơi / giảm tốc xe đạp;
5. `player.fixedUpdate`;
6. `world.step()`.

### 5.3 Khối config Phase 4B (nền viết khung, mỗi track chỉnh khối mình)

```ts
// ── Foundation · shared NPC settings (npc/types.ts, npc/roads.ts) ──
export const npc = {
  enabled: true, seed: 1, density: 1, zoneMargin: 3,
  // m width × height × length the models are baked to (process-assets) and the sims use; fleet share; roads (bus)
  vehicles: {
    city: { dims: [1.7, 1.5, 3.6], share: 0.14 }, hatchback: { dims: [1.75, 1.45, 4.0], share: 0.16 },
    sedan: { dims: [1.8, 1.45, 4.6], share: 0.14 }, suv: { dims: [1.9, 1.7, 4.6], share: 0.08 },
    taxi: { dims: [1.8, 1.5, 4.6], share: 0.12, paint: ['#1d1f22'] }, van: { dims: [2.0, 2.3, 5.4], share: 0.08 },
    truck: { dims: [2.3, 3.0, 6.5], share: 0.05 }, bus: { dims: [2.55, 3.1, 12], share: 0.05, roads: ['primary', 'secondary'], paint: ['#e8ebe6'] },
    scooter: { dims: [0.7, 1.4, 1.8], share: 0.1 }, moto: { dims: [0.8, 1.4, 2.1], share: 0.08 },
  },
  paints: ['#f2f2ef', '#1d1f22', '#8d9296', '#c3c7ca', '#1f3350', '#7a1f22', '#35503a'],
};
// A: npcAssets { vehiclesUrl, pedsUrl, clipsUrl, atlas: 2048, lod1Ratio: 0.3, maxTris: { car: 2000, big: 2500, rider: 1500, ped: 9000, pedLod1: 2500 },
//    clipSpeed: { m_walk: 1.01, m_stroll: 0.69, f_walk: 1.21, f_stroll: 0.93 } }
// B: traffic { kinds, perKm: 10, max: 60, radius: 250, despawnMargin: 50, viewConeDeg: 50, stuckSeconds: 60, speed, speedJitter: [0.85, 1.1],
//    accel: 2, brake: 4, minGap: 2, latAccel: 2.5, cornerCut: 6, maxLanes: 4, lookAhead: 60, obstacleMargin: 0.5, yieldLook: 30,
//    roundaboutGap: 18, lights: { reach: 30, green: 18, amber: 3, allRed: 2, pedGreen: 8, pedCycle: 40 } }
// C: crowd { perKm: 12, max: 40, radius: 120, despawnMargin: 30, bodyRadius: 0.3, walkSpeed: [1.1, 1.45], strollSpeed: [0.8, 1.0], strollShare: 0.3,
//    band: [0.3, 0.8], inset: 0.8, crossChance: 0.3, crossReach: 15, crossGap: 4, idle: { per100m: 0.15, seconds: [5, 25] },
//    seatEvery: 20, seatChance: 0.5, seatOffset: 1.5, seatRoadClear: 15, sitShare: 0.15, avoid: { ahead: 3, side: 1, shift: 1 },
//    stagger: { seconds: 1.2, push: 0.8 }, waveBack: 10 }
// D: npcRender { pedLod0: 30, farAnimEvery: 3, colliderRadius: 40, maxColliders: 16, push: { maxSpeed: 1 }, bikeHitKeep: 0.6, warmUp: 20,
//    autoDensity: { minFps: 45, okFps: 57, window: 2, upAfter: 5, down: 0.8, up: 0.1, min: 0.25 }, lights: { pole: 3.2, kerb: 0.5, radius: 200 },
//    zebra: { depth: 3, stripe: 0.5, radius: 200 }, chair: { colour: '#3f6b3a', radius: 60 } }
```

## 6. Bốn track: file sở hữu và việc cần làm

Mỗi track chỉ sửa file của mình và **khối config của mình**, không thêm import vào config. `main.ts`, `Player.ts`, `CharacterController.ts`, `ThirdPersonCamera.ts` thuộc D. `process-assets.ts` thuộc A.

### Track A – asset pipeline
- **File:**
  - `scripts/process-assets.ts`: `npcVehicles()`, `npcPeds()`, `npcPedAnims()`, `BUILDS`, `MODIFIED`, `LABELS`, bỏ `ped-*` khỏi credits;
  - `scripts/fbx.ts` (mới): Chrome + `page.route` + FBXLoader / GLTFExporter, bake người lái;
  - `client/public/models/npc-vehicles.glb`, `npc-peds.glb`, `npc-ped-anims.glb`, `LICENSE-rocketbox.md`, `client/public/credits.json`;
  - `client/src/npc/NpcAssets.ts` (+ test);
  - `client/npc.html` + `client/src/npc/npcPreview.ts` (turntable chỉ dùng khi dev, như `bike.html`);
  - config `npcAssets`, preset `[A]`;
  - mục `rocketbox` trong `.cache/assets/manifest.json` (không commit).
- **Việc cần làm:**
  - **FBX → GLB** trong Chrome:
    - `setURLModifier` đổi `Export/x.tga` → ảnh 1×1 (texture xử lý ở Node);
    - trả GLB về Node (base64);
    - `window.__name` như 2.3.
  - **Xe:**
    - `npc-vehicles.glb`: 1 node / loại, tên = `CarKind`;
    - scale không đều về `dims`, pivot giữa trục trên đất, mũi +Z (moto xoay −90° quanh Y);
    - tách bánh ra `extras.axles` / `extras.wheelRadius`; màu → vertex colour; `_PAINT`;
    - truck: lấy màu texture tại UV bằng sharp;
    - simplify ≤ `maxTris`.
  - **Người lái:** load `player.glb` + `player-anims.glb` trong Chrome, `Driving_Loop` t = 0, `applyBoneTransform` từng đỉnh, simplify, màu phẳng + mũ bảo hiểm; gộp vào `scooter` và `moto` (đặt hông lên yên, dịch theo `extras.seat` đo trên model).
  - **Rocketbox:**
    - `sips` → PNG, sharp → atlas 2048² WebP (body | head | opacity; body / head alpha 255);
    - UV mỗi group dồn vào ô của nó; gộp group → 1 primitive, 1 material MASK;
    - LOD1 = simplify `lod1Ratio`; scale 0,01; `extras.gender`.
  - **Clip:** như quyết định 10, tên `m_*` / `f_*`; 1 file cho cả hai giới (bind theo tên xương).
  - **`NpcAssets.ts`:** load 3 GLB, trả `NpcAssets`; hàm thuần `prepareVehicles(scene)` / `preparePeds(scene, clips)` để test; lỗi → cảnh báo + hộp / capsule.
- **Test (bắt buộc, trên GLB đã commit như `BikeModel.test`):**
  - xe: đủ 10 node `CarKind`; bbox = `dims` ± 3 %, min y ∈ [−0,02; 0,02]; mũi +Z (ô tô: tâm material đèn pha z > 0; xe máy / xe tay ga: điểm mũi A đo tay, ghi `extras.front`); tam giác ≤ ngân sách; ô tô / bus / van ≥ 4 trục, bán kính > 0; `_paint` có trên ≥ 20 % đỉnh; file ≤ 1,5 MB;
  - người: 4 avatar, mỗi avatar LOD0 ≤ 9 000 + LOD1 ≤ 2 500 tam giác, 1 material có `alphaTest`, cao 1,65–1,85 m, 80 xương cùng tên, `gender` đúng; file ≤ 5 MB;
  - clip: đủ 14 tên; `Bip01` x/z hằng; không có track xương mặt; ≤ 2 track vị trí / clip; thời lượng ± 1 khung so với gốc; `clipSpeed` khớp root motion gốc ± 5 %; file ≤ 2 MB;
  - `prepareVehicles` / `preparePeds` với scene tổng hợp; stub khi thiếu file.
- **Preset:**
  - `p4b-cars`: `/npc.html?show=cars` (10 loại, cạnh bên, vài màu sơn, người lái xe máy);
  - `p4b-peds`: `/npc.html?show=peds&clip=walk&t=0.4` (4 avatar, LOD0 trước, LOD1 sau);
  - `p4b-peds-idle`: `/npc.html?show=peds&clip=sit,phone,wave` (ghế tạm).

### Track B – mô phỏng xe (thuần, không three / Rapier)
- **File:** `client/src/npc/traffic.ts` (+ test), `client/src/npc/lights.ts` (+ test), `client/src/npc/roads.ts` (thêm chuỗi cầu, + test), config `traffic`, preset `[B]`.
- **Việc cần làm:** theo quyết định 5–6:
  - lúc nạp: lọc cạnh hợp lệ + thành phần liên thông mạnh; cụm đèn + pha + `SignalHead`; chuỗi cầu (độ cao như `BridgeBuilder.deckY`, `endSample` 5 m);
  - lưu làn theo cạnh có hướng, sort theo s;
  - hàm thuần `pathPoint` (Bézier cắt góc + lệch làn);
  - in thời gian / bước khi test.
- **Test (bắt buộc; đồ thị thật + fixture nhỏ):**
  - không xe nào đi ngược `oneway`: kiểm mọi lần chuyển cạnh trong 5 phút mô phỏng quanh Concorde;
  - cùng làn luôn cách ≥ `minGap` (từ đuôi xe trước tới mũi xe sau);
  - đèn: hai pha không bao giờ cùng xanh, có vàng 3 s; xe dừng trong [vạch − 1 m, vạch] khi đỏ, chạy khi xanh;
  - Étoile: xe vào đợi khoảng trống, chạy ngược kim đồng hồ trên các cạnh vòng, ra một đại lộ trong 90 s;
  - nhánh phụ nhường nhánh chính ở giao lộ không đèn;
  - người chơi đứng giữa làn: xe dừng cách ≥ 1 m; người chơi đặt vào trong thân xe: xe không nhúc nhích;
  - không kẹt: sau 10 phút ở mật độ 1, ≥ 80 % số xe đi được ≥ 50 m trong phút cuối;
  - vùng cấm: không xe nào sinh trong vùng, không chọn cạnh vào vùng khi còn đường khác;
  - cầu: `heightOn` giữa cầu Alexandre III > mặt sông + 5 m;
  - tất định: 2 lần chạy cùng seed → cùng hash trạng thái;
  - hiệu năng: ≤ 0,5 ms / bước với 60 xe (in ra).
- **Preset** (khán giả + `npc=1`, tọa độ B chọn):
  - `p4b-etoile`: nhìn chéo 160 m trên Étoile, `npcDensity=1.5`;
  - `p4b-red`: tầm mắt ở một giao lộ có đèn (hàng xe chờ, đèn đỏ thấy được sau khi ghép D);
  - `p4b-bridge`: xe trên mặt cầu Alexandre III nhìn từ kè;
  - `p4b-concorde`: Concorde nhìn chéo.

### Track C – mô phỏng người đi đường (thuần)
- **File:** `client/src/npc/crowd.ts` (+ test), config `crowd`, preset `[C]`.
- **Việc cần làm:** theo quyết định 5, 7.
  - Dải đi bộ (a) / (b) / (c) dựng lười theo ô 50 m quanh neo.
  - Thứ tự nhánh quanh nút theo góc (rẽ góc / băng qua nhánh kề / băng qua nhánh đang đi).
  - Máy trạng thái `walk → wait → cross → walk`, `idle`, `sit`, `stagger`.
  - Ghế tất định.
- **Test (bắt buộc; đồ thị thật quanh Concorde + fixture):**
  - người đang đi (không băng đường) luôn nằm trong dải vỉa hè vẽ `[nửa bề rộng, nửa bề rộng + vỉa hè]` hoặc trên dải (b) / (c);
  - chỉ ở trong lòng đường khi `cross`, và chỉ tại nút crossing / mép giao lộ;
  - không bắt đầu băng đường khi có xe tới vạch trong `crossGap` s;
  - đèn giả đỏ mãi → không ai qua ở đó;
  - vùng cấm: sau 5 phút không ai trong vùng (kể cả sinh, ngồi, đứng);
  - chạm thân người chơi → `stagger` và bị đẩy xa ra; đạp xe tông → `knocked` > 0;
  - `G` trong 10 m → người gần đó `wave`;
  - ghế: tất định, cách đường car ≥ `seatRoadClear`, có ghế trong Tuileries;
  - tất định; ≤ 0,3 ms / bước với 40 người (in ra).
- **Preset** (C chọn tọa độ):
  - `p4b-sidewalk`: người chơi đứng trên vỉa hè Rue Royale, người đi hai bên;
  - `p4b-crossing`: người trên vạch, xe dừng chờ;
  - `p4b-park`: Tuileries (đi dạo, đứng, gọi điện, ngồi ghế).

### Track D – hiển thị, va chạm, ghép
- **File:**
  - `client/src/npc/Npc.ts` (+ test), `client/src/npc/NpcRenderer.ts` (xe, bánh, đèn, vạch, ghế; + test), `client/src/npc/PedRenderer.ts` (pool skinned, LOD, `PedAnimator`, lảo đảo; + test);
  - `client/src/main.ts` (tạo, neo, `__READY__` chờ NPC, `__STATS__` + `npcCars`, `npcPeds`, `npcMs`);
  - `client/src/player/Player.ts` (neo, `waving`, URL `npc`, `npcSeed`, `npcDensity`, `npcZone=x,z,r[;…]`, `npcTest=car:<kind>@x,z,yaw`);
  - `client/src/player/CharacterController.ts` (+ test: `push`, `IGNORE_NPC` trong `surface()` / `place()`);
  - `client/src/player/ThirdPersonCamera.ts` (`IGNORE_NPC`), `client/src/vehicle/Bikes.ts` (`groundAt` `IGNORE_NPC`);
  - `client/src/ui/DebugOverlay.ts` (dòng "NPC: 42 xe · 31 người · mật độ 0,8 · 0,6 ms"; `?npcZone` vẽ vòng khi F3 mở);
  - `scripts/ride-check.ts` (thêm `&npc=0`);
  - config `npcRender`, preset `[D]`.
- **Việc cần làm:** theo quyết định 3–5, 8–9. Nội suy pose; pool collider; `nextDensity` thuần; `obbCirclePush` thuần; `staggerTilt(t)` thuần.
- **Test (bắt buộc):**
  - `nextDensity`: giảm khi FPS < 45 trong 2 s, tăng chậm, kẹp sàn / trần;
  - `obbCirclePush`: không chồng → 0, chồng → pháp tuyến đúng, bị kẹp theo `push.maxSpeed`;
  - Rapier thật:
    - đạp xe tốc độ tối đa vào collider xe NPC → `onDismount(…, crashed = true)`;
    - đi bộ vào xe → bị chặn;
    - `place()` cạnh xe không đáp lên nóc;
    - camera cast bỏ qua collider NPC;
  - renderer (asset stub): số instance = số xe, xe có `paint` khác nhau; người ≤ `pedLod0` dùng LOD0; pool dùng lại mesh khi xe / người bị xóa;
  - `parseOverrides` các tham số NPC.
- **Preset:**
  - `p4b-street`: `?player=<Rue Royale>&autoMove=walk&wait=4&debug=1` (đủ xe + người, dòng NPC trên F3);
  - `p4b-bike-car`: `?player=…&bike&autoMove=walk&npcTest=car:van@…&wait=3` (nằm cạnh xe van);
  - `p4b-dodge`: người chơi đi vào dòng người, một người lảo đảo;
  - `p4b-zone`: `?player=…&npcZone=…,20&debug=1` (không NPC trong vòng);
  - `p4b-density`: Opéra, `debug=1` (log `__STATS__`, so ngân sách mục 9).

## 7. Screenshot preset

- `npm run screenshot -- p4b` chạy cả nhóm. Tên và chủ sở hữu ở mục 6.
- Preset khán giả của B cần `npc=1` (neo camera) và warm-up.
- Preset `p3-*` / `p4-*` giữ NPC bật (thế giới thật). Preset nào bị NPC che mất chủ thể thì người tích hợp thêm `&npc=0`. `ride-check` luôn có `npc=0`.
- Mỗi track tối đa 4 vòng chụp → sửa. Người tích hợp chụp lại tất cả `p4b-*`, `p4-*`, `p3-*`.

## 8. Ghép và kiểm tra

- **Thứ tự: A → B → C → D.**
  - A: chỉ file asset + loader, không đụng runtime;
  - B, C: sim thuần, rời nhau, chỉ đọc mảng pose của nhau qua `types.ts`;
  - D: thay mọi stub, ghép vào `main` / `Player`.
- **Xung đột dự kiến:**
  - `config.ts`: mỗi khối riêng;
  - `screenshot.ts`: mỗi track một dòng chú thích;
  - `credits.json`: chỉ A;
  - `TODO.md` / README / `CLAUDE.md` (thư mục `npc/`, lệnh `process-assets` mới): chỉ người tích hợp sửa.
- **Người tích hợp:**
  - `npm run build && npm test`;
  - `npm run screenshot -- p4b p4 p3`;
  - `npm run ride-check`;
  - đọc `__STATS__` của `p4b-density` và `p4b-street` so với mục 9;
  - cập nhật `TODO.md`: xóa mục Phase 4B đã xong (dòng "lập danh sách để anh duyệt" đã lỗi thời); thêm ponytail còn lại (không đổi làn, bánh chưa đánh lái, bánh xe máy không quay, 2 mạng đi bộ tách rời, người skinned tối đa 40, Étoile nhường ngược luật thật, đèn không có collider);
  - commit `feat(phase4b): …`.

## 9. Ngân sách

| Mục | Giới hạn |
|---|---|
| File đã commit | `npc-vehicles.glb` ≤ 1,5 MB, `npc-peds.glb` ≤ 5 MB, `npc-ped-anims.glb` ≤ 2 MB (tổng ≤ 8,5 MB; mỗi file ≪ 25 MB) |
| Tam giác / mẫu | xe ≤ 2 000 (bus, truck ≤ 2 500), người lái ≤ 1 500, người LOD0 ≤ 9 000, LOD1 ≤ 2 500 |
| Tam giác thêm ở mật độ 1 | ≤ 350 nghìn (60 xe + 16 người gần + 24 người xa) |
| Lệnh vẽ thêm | xe 10 + bánh 1 + đèn 2 + vạch 1 + ghế 1 + người ≤ 40 → **≤ 55**; bóng: xe 11 + người gần ≤ 16 |
| CPU | traffic ≤ 0,5 ms / bước (60 xe); crowd ≤ 0,3 ms / bước (40 người); cập nhật hiển thị (instance + mixer) ≤ 1,5 ms / khung; warm-up ≤ 1 s |
| Rapier | ≤ 16 collider kinematic |
| Mạng | không thêm request nào lên Worker / DO (§3): NPC chỉ là asset tĩnh + sim cục bộ |

- Vượt ngân sách lệnh vẽ / CPU người ở `p4b-density` → giảm mặc định `crowd.perKm`; nếu vẫn thiếu thì làm instancing hoạt ảnh nướng sẵn (quyết định 9).

## 10. Để sang phase sau

- **Phase 5:** minimap / bản đồ lớn không vẽ NPC (đã đảm bảo vì NPC không nằm trong dữ liệu bản đồ).
- **Phase 7:** `npc.setExclusionZones(geofence hộp mật thư + thảm về đích)`. Hộp đặt ngoài lòng đường; điểm trên cầu (L4) thì xe tránh cạnh đó.
- **Phase 12:** âm thanh xe / còi, đèn pha ban đêm, đổi làn / vượt, trạm xe buýt, instancing người ở xa, model đèn giao thông đẹp hơn, thêm avatar.

## 11. Câu hỏi mở (cần anh quyết)

1. **Đạp xe tông người đi đường:** hiện người đó lảo đảo, xe đạp chậm lại (còn 60 % tốc độ), người chơi **không** ngã. Anh có muốn người chơi ngã xe như khi tông xe NPC không?
2. **Vòng xuyến Étoile:** ngoài đời xe trên vòng phải nhường xe đi vào (ưu tiên bên phải). Game làm ngược lại (xe vào nhường xe trên vòng) để dòng xe không tắc cứng. Được không?
3. **Chỉ có 4 avatar Rocketbox** (2 nam, 2 nữ): đám đông 30–40 người sẽ thấy trùng người. Có muốn duyệt thêm vài avatar không (mỗi avatar ≈ 38–46 MB tải về, ≈ 1 MB sau xử lý)? Mặc định: làm với 4 avatar.
4. **Camera khán giả** (`?cam=`, Host / đội đã về đích bay tự do): mặc định **không** có NPC (chỉ bật khi thêm `?npc=1`). Có cần NPC cả ở chế độ này không?
