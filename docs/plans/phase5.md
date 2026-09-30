# Phase 5 – HUD: kế hoạch

Nguồn: SPEC §3 (HUD bằng HTML/CSS, hạn mức), §4.4 (hồi sinh ở bậc thang), §4.6 (bản đồ chỉ hiện tên đường), §6.3 / §6.6 (xe đạp: thông báo, không lên bản đồ), §8.2 (hộp mật thư không hiện trên bản đồ), §12 (HUD), §15 (Phase 5), §17.1–17.3 (phím, menu tự mở, minimap chữ nhật), §17.9 (không gắn cứng L1–L6), §17.10; STYLE_GUIDE "HUD"; TODO.md mục Phase 5; `docs/plans/phase4.md` §6 (roadgraph), `docs/plans/phase4b.md` (mẫu).

## 1. Phạm vi

- **Có:**
  - minimap chữ nhật góc dưới trái: đường, nhà, công viên, sông Seine, xoay theo camera, chữ N trên viền, tự zoom ra khi đi nhanh, đường GPS, điểm đến (kẹp vào viền khi ở ngoài), mũi tên người chơi;
  - bản đồ lớn (`M`): kéo, lăn chuột phóng to / thu nhỏ, nhấp để đặt / bỏ điểm đến, đường GPS, tên đường (không tên địa danh, §4.6);
  - GPS: A* `shortestPath` trên `roadgraph.json` tới **điểm đến người chơi tự đặt** (§12); điểm thử qua URL `?gps=x,z`;
  - tên đường + quận ở góc dưới phải khi đổi đường; dòng quận trên biển tên đường ("8e Arrt");
  - đồng hồ (thời gian đã chạy), đồng hồ tốc độ km/h khi đạp xe;
  - menu thật (`Esc`, tự mở khi chuột bị nhả): Tiếp tục, "Kẹt? Về chỗ an toàn", cài đặt (đảo trục Y, độ nhạy chuột), bảng phím, luật đua, ghi nguồn;
  - dòng thông báo (toast) phía trên minimap: "Không đi xe trên bậc thang", lý do `F` bị từ chối (đi nhanh quá / quá xa / xe của đội khác);
  - hồi sinh khi đang ở dưới sông: lên đầu bậc kè gần nhất (`water.json` `stairs` / `stairGaps`).
- **Không có (để sau):**
  - Phase 6: chấm đội khác trên minimap (`showOthersOnMinimap`, mặc định tắt), ping trong F3, báo server khi hồi sinh (kiểm tra tốc độ);
  - Phase 7: thẻ nhiệm vụ góc trên trái, đồng hồ theo giờ xuất phát của server, Sổ mật thư (`Tab`);
  - Phase 9: tổng phút phạt, icon luật phương tiện, toast "Lộ trình này bắt buộc đi bộ";
  - Phase 10: bản đồ Host (đủ tên địa danh);
  - Phase 12: cài đặt đồ họa trong menu.
- Minimap / bản đồ **không** vẽ NPC, xe đạp, hộp mật thư (§6.6, §8.2, §17.5): chúng không nằm trong dữ liệu bản đồ nào.

## 2. Kiểm tra đầu vào (đo ngày 2026-10-01)

### 2.1 Chunk JSON (dữ liệu cho minimap)
- 368 chunk, 12,2 MB. Nhà 25 475 (354 nghìn đỉnh, riêng đường viền ≈ 4,8 MB JSON); đường 13 042 mảnh (52 nghìn đỉnh, 8 644 mảnh có tên, 1 709 tên khác nhau); vùng xanh 1 862 (park 662, grass 1 200; 28 nghìn đỉnh); cầu 158 chuỗi; bậc thang 990 OSM + 81 bậc kè.
- Loại đường (mảnh): footway 4 081, residential 2 681, service 1 568, cycleway 1 248, pedestrian 759, secondary 757, primary 754, tertiary 661, living_street 399.
- **Main thread không bao giờ thấy chunk JSON** (worker tự `fetch`). Nếu worker gửi lớp bản đồ dạng Float32 (nhà + vùng xanh + đường): trung bình 11 KB / chunk, lớn nhất 26 KB (`10_0`: 188 nhà, 2 728 đỉnh), cả bản đồ 4,1 MB.
- Worker đã dùng `OffscreenCanvas` (atlas biển tên đường), nên canvas 2D ở worker không phải phụ thuộc mới.

### 2.2 Dữ liệu toàn bản đồ (bản đồ lớn)
- `roadgraph.json`: 74 697 nút, 99 092 cạnh, 31 606 way (6 439 có tên, 1 809 tên); có `kind`, `width`, `lanes`, cờ `sidewalk` / `crossing` / `steps` / `bridge`. Đủ để vẽ **mọi con đường của cả bản đồ và tên đường** mà không cần chunk.
- `water.json`: 129 đa giác nước (2 là sông Seine), 3 178 đỉnh; 81 bậc kè (`stairs` = chân bậc, `stairGaps` = khe lan can ở đầu bậc, cùng thứ tự, cách nhau ≤ 16,7 m).

### 2.3 Quận `admin_level=9`
- Trước Phase 5 **chưa được trích**: `build-chunks` bỏ mọi quan hệ không phải multipolygon.
- `.cache/osm/global.json` có sẵn 13 quan hệ quận có hình học (1–10, 15, 16, 17; 2 379 đỉnh; `ref:INSEE` 751xx, `short_name` "16e").
- **Nền đã làm:** `build-chunks` ghi vào `water.json`:
  - `districts`: 13 quận, cắt theo lưới chunk, 1 384 đỉnh, 18,7 KB;
  - `parks`: 592 vòng công viên / cỏ ≥ 400 m² (nguyên vùng, không cắt theo chunk), rút gọn Douglas–Peucker 2 m, 5 478 đỉnh, 74 KB (cho bản đồ lớn).
  - `water.json` 64 → 154 KB; 368 file chunk không đổi byte nào.
- `districtAt` (test trên dữ liệu thật): obelisk → 8, tháp Eiffel → 7, kim tự tháp Louvre → 1, Nhà thờ Đức Bà → 4, Trocadéro → 16, Panthéon → 5. Ranh giới quận 8 / 16 / 17 gặp nhau ngay dưới Khải Hoàn Môn.

### 2.4 GPS (A* trên `roadgraph.json`, Node, Apple Silicon)
| Tuyến | Chế độ | Thời gian | Dài | Đường chim bay |
|---|---|---|---|---|
| Obelisk → Khải Hoàn Môn | walk / bike | 0,9 / 0,5 ms | 2 358 / 2 351 m | 2 130 m |
| Eiffel → Nhà thờ Đức Bà | walk / bike | 1,5 / 1,4 ms | 4 543 m | 4 110 m |
| Trocadéro → Panthéon | walk | 3,0 ms | 5 320 m | 4 609 m |
| Trocadéro → Panthéon | bike | – | **không có đường** (bậc thang cắt) | |
| Obelisk → Louvre | walk / bike | 0,1 / 0,2 ms | 1 265 / 1 412 m | 1 158 m |

- Giải mã đồ thị 41 ms (đã có, `loadRoadGraph`). A* đủ nhanh để chạy trên main thread, không cần worker.
- `roadGraph.snapRadius` (80 m, Phase 4) chưa ai đọc: GPS dùng nó.

### 2.5 Tên đường
- 95 % điểm ngẫu nhiên trên mạng đi bộ có way có tên (không phải vỉa hè / vạch qua đường) trong 25 m: < 10 m 2 544, 10–20 m 258, 20–30 m 60, 30–40 m 35, không có 85 (trên 2 982 mẫu). Chỗ không có: giữa công viên, quảng trường lớn.

### 2.6 Code hiện có
- `Input`: khóa chuột khi nhấp canvas; `Esc` bị trình duyệt nuốt để nhả chuột (`pointerlockchange` = tín hiệu "menu"); `lock()` trước đây private.
- `#help` (index.html) hiện khi chuột tự do: đó là "menu" hiện tại.
- Bảng F3 nằm góc dưới trái → sẽ đè minimap. Dòng ghi nguồn OSM ở góc dưới phải (11 px).
- `Bikes.interact` trả `null` khi `F` không làm gì (không nói lý do); `CharacterController.wheelProbe` trả `null` khi bánh chạm bậc thang (xe dừng, không có thông báo); `respawn()` về `lastSafe` (cập nhật mỗi 1 s khi đứng trên đất khô).
- Camera đọc `mouseSensitivity` thẳng từ `config.ts`.
- Chrome headless (ảnh chụp, `ride-check`) **không bao giờ khóa chuột** → menu không được tự mở lúc bắt đầu, chỉ khi mất khóa.

## 3. Quyết định

1. **Package: không thêm.**
2. **Canvas 2D, không WebGL** cho minimap và bản đồ lớn:
   - SPEC §3 "HUD bằng HTML/CSS"; không thêm lệnh vẽ vào ngân sách 3D; xoay bằng `setTransform`; chữ (tên đường) dễ.
   - WebGL (viewport thứ hai, camera trực giao, scene riêng) bị loại: thêm scene, vật liệu, lệnh vẽ, chữ khó, dễ đụng pipeline Three.
3. **Minimap = ô raster vẽ lười:**
   - Worker trích `MapVectors` của chunk (hàm thuần `world/mapVectors.ts`) → `BuildOut.map` → `ChunkManager.onMap` → `MapTiles` giữ vector của mọi chunk đã dựng (≤ 4,1 MB cả bản đồ, giữ cả sau khi chunk bị gỡ).
   - Mỗi chunk một ô, bắc ở trên, `256 × min(2, devicePixelRatio)` px (≈ 1 m/px, 0,5 m/px trên màn Retina). Chỉ vẽ ô nằm trong tầm minimap, tối đa `minimap.rasterPerFrame` ô / khung hình (≈ 1–3 ms / ô), LRU `minimap.maxTiles`.
   - Mỗi khung: xóa, `drawImage` các ô với phép xoay, rồi vẽ GPS, điểm đến, chữ N, mũi tên (≤ 0,5 ms).
   - Nước (sông + ao) lấy từ `water.json` vẽ vào ô.
   - Không raster ở worker: mỗi chunk dựng (60–80 lúc đầu, bán kính 800 m) sẽ thành một bitmap ~1 MB mà phần lớn không bao giờ hiện; vector chỉ ~11 KB.
4. **Bản đồ lớn** vẽ từ `roadgraph.json` + `water.json` (nước, `parks`), **không cần chunk**, không vẽ từng tòa nhà (như bản đồ GTA V):
   - Lúc mở: raster nền cả bản đồ một lần ở ~3 m/px (≈ 1 850 × 1 250 px ≈ 9 MB, bỏ khi đóng). Khi kéo / zoom: vẽ nền đã raster theo phép biến đổi (60 fps). Dừng 150 ms: vẽ lại vector của khung nhìn ở đúng tỉ lệ (`edgesNear` lọc cạnh).
   - Đường theo loại (to / nhỏ / lối đi bộ; bỏ vỉa hè, vạch, service ở tỉ lệ nhỏ), sông, ao, công viên.
   - Tên đường khi zoom ≤ `fullMap.labelMaxMpp`: đặt dọc đoạn dài nhất của mỗi way có tên, xoay theo đoạn, bỏ nhãn chồng nhau (lưới ô chiếm chỗ). Không tên địa danh, không tên quận (§4.6).
   - Điều khiển: kéo = di chuyển, lăn = zoom quanh con trỏ, nhấp = đặt điểm đến, nhấp cách điểm đến ≤ 12 px = bỏ, `M` / `Esc` = đóng. Dòng hướng dẫn ở đáy: "Nhấp: đặt điểm đến · nhấp lại: bỏ · lăn chuột: phóng to / thu nhỏ · M / Esc: đóng".
5. **GPS** (`geo/gps.ts`, thuần):
   - Đích = **điểm đến người chơi tự đặt** (§12), không bao giờ là điểm đến của mật thư (§4.6, §8.2). Test / ảnh chụp: `?gps=x,z`.
   - Tuyến = [chân người chơi, …nút của `shortestPath`, đích]. Hai đầu bám `nearestNode(x, z, mode, roadGraph.snapRadius)`; không bám được (giữa sông xa cầu, ngoài bản đồ) → `route = null` (bản đồ chỉ vẽ đích).
   - Chế độ `bike` khi đang đạp xe (không qua bậc thang); không có tuyến xe thì lùi về `walk`.
   - Tìm lại khi: đổi đích, đổi chế độ, rời tuyến > `gps.offRoute` m; tối đa một lần mỗi `gps.minInterval` s.
   - Cắt phần đã đi: giữ chỉ số đoạn hiện tại, chiếu chân lên vài đoạn phía trước; tuyến bắt đầu từ điểm chiếu. `remaining` = độ dài phần còn lại.
   - Tới trong `gps.arriveRadius` m → xóa điểm đến (như GTA).
6. **Tên đường / quận:**
   - `geo/locate.ts` (B): way có tên gần nhất trong `locate.maxDistance` m, bỏ vỉa hè / vạch qua đường; giữ tên hiện tại khi way đó còn trong `locate.keepDistance` m (không nhấp nháy ở giao lộ); tự hạn tần suất (4 lần/s).
   - Quận: `districtAt` (nền, `geo/districts.ts`).
   - HUD (D): góc dưới phải, tên đường font viết tay, dòng quận "Quận 8" bên dưới; hiện khi đổi đường / quận trong `hudWidgets.streetSeconds` s rồi mờ dần (§12 "khi đổi khu vực"). Tên đường giữ nguyên tiếng Pháp như OSM.
   - Biển tên đường (D, `StreetProps`): thêm dòng nhỏ trên cùng "8e Arrt" (như biển Paris thật) từ `ctx.district` tại chân cột; dựng lúc chạy trong worker, không phải build lại chunk.
7. **Đồng hồ + tốc độ** (D):
   - Khối "NHÃN · giá trị" canh phải dưới tên đường (STYLE_GUIDE; SPEC §12 ghi góc trên phải nhưng §17.3 cho STYLE_GUIDE quyết định bố cục): "THỜI GIAN 00:37" (mm:ss, sau 1 giờ h:mm:ss), khi đạp xe thêm "TỐC ĐỘ 19 km/h" + icon xe đạp (SVG nội tuyến).
   - `HudFrame.time` = `Player.simTime` (tính từ lúc vào game); Phase 7 thay bằng giờ đua của server.
   - Chỉ ghi DOM khi chữ đổi.
8. **Bố cục:**
   - dưới trái: minimap `hud.minimap` (300 × 190 px, cách mép `hud.margin`), dòng toast xếp ngay trên;
   - dưới phải: tên đường + khối nhãn, nằm trên dòng ghi nguồn;
   - trên phải: bảng F3 (dời khỏi dưới trái);
   - trên trái: để trống cho thẻ nhiệm vụ (Phase 7);
   - trên giữa: gợi ý "Nhấp chuột để chơi" lúc đầu.
   - Không có HUD khi là khán giả (`?cam=`, không có thân). Bản đồ lớn phủ toàn màn hình.
   - Kiểu chung ở `ui/hud.css` (nền đen 65 %, bo 3 px, bóng chữ, font không chân + font viết tay hệ thống).
9. **Menu + khóa chuột** (nền đã nối trong `main.ts`):
   - Menu mở khi chuột bị nhả (không mở lúc bắt đầu vì chưa khóa lần nào); `M` tự nhả chuột cho bản đồ (khi đó không mở menu); `Esc` khi chuột tự do đóng bản đồ / menu hoặc mở menu; `Esc` trong 300 ms sau khi nhả chuột bị bỏ qua (có trình duyệt vẫn gửi phím `Esc` đã dùng để nhả).
   - Menu hoặc bản đồ đang mở: nhân vật dừng (`Player.update(…, blocked)`), camera vẫn theo.
   - Nội dung: "Tiếp tục" · "Kẹt? Về chỗ an toàn" · "Cài đặt" (Đảo trục Y, Độ nhạy chuột 0,25–3 ×) · "Phím điều khiển" (bảng `#help` hiện tại chuyển vào đây) · "Luật đua" (`docs/RACE_RULES.md` import `?raw`, hiện dạng chữ `pre-wrap`; ponytail: không có trình dựng Markdown) · "Ghi nguồn" (bảng sẵn có). Dòng nhắc "Cuộc đua vẫn tiếp tục khi mở menu".
   - Cài đặt đồ họa: Phase 12.
10. **Cài đặt** (C): `localStorage` (`menu.storageKey`, JSON, try/catch: bị chặn thì dùng mặc định). Camera góc thứ ba + camera bay nhân `settings.mouseSensitivity` và đổi dấu trục dọc khi `invertY` (chuột và tay cầm).
11. **Toast** (C): `toast(text)`, `notice(code)`; tối đa `toasts.max` dòng, mỗi dòng `toasts.seconds` s rồi mờ, cùng chữ trong `toasts.repeatGap` s bị bỏ. Chữ:
    - `bikeStairs` "Không đi xe trên bậc thang"
    - `bikeTooFast` "Đi chậm lại rồi mới xuống xe được"
    - `bikeTooFar` "Lại gần xe hơn để lấy xe"
    - `bikeTaken` "Xe này đã có đội sử dụng" (§6.3)
    - `respawn` "Đã đưa bạn về chỗ an toàn"
    - `respawnStairs` "Đã đưa bạn lên bậc kè gần nhất"
12. **Lý do `F` bị từ chối** (C, `Bikes.interact`): đang đạp nhanh hơn `bike.dismountMaxSpeed` → `bikeTooFast`; đi bộ, không có xe trong `bikeRules.interactRadius` nhưng có xe lấy được trong `notices.farReach` → `bikeTooFar`; xe của đội khác trong tầm → `bikeTaken`; không có gì → `null` (im lặng: `F` còn dùng cho hộp mật thư ở Phase 7). Bánh chạm bậc thang → `controller.onStairs()` (nền đã nối vào toast).
13. **Hồi sinh** (C, `CharacterController.respawn`):
    - Đang ở dưới sông (`inWater` / bơi): chân bậc kè gần nhất → đặt ở khe lan can đầu bậc tương ứng (`stairGaps`, trên kè, quay lưng về sông), trả `'stairs'`.
    - Nếu không: như cũ (`lastSafe`). Đề xuất: giữ vài chỗ an toàn gần đây (mẫu mỗi 1 s) và nút "Kẹt?" dùng chỗ cũ ≥ 5 s để không về đúng chỗ đang kẹt (C quyết, ponytail ghi trần).
    - Đang đạp xe: xuống xe trước (xe ở lại).
    - Phase 6: server phải biết lần dịch chuyển này (không tính là gian lận tốc độ) → TODO.
14. **URL** (nền đã nối trong `main.ts`, áp dụng khi thế giới sẵn sàng): `gps=x,z`, `map[=m/px]`, `menu`, `respawn=<s>`.
15. **Mạng: không thêm request.** Minimap lấy từ chunk JSON worker đã tải; bản đồ lớn từ `roadgraph.json` + `water.json`; cài đặt ở `localStorage`. `water.json` +90 KB.
16. **Font viết tay:** font hệ thống (`Segoe Print` trên Windows, `Bradley Hand` / `Noteworthy` trên macOS, `cursive`) – không tải file (câu hỏi 1).
17. **Người điều phối cần ghi vào SPEC §17:** đồng hồ đua ở góc dưới phải theo STYLE_GUIDE (thay "góc trên phải" ở §12); quận + công viên tổng quát nằm trong `water.json`; GPS chỉ tới điểm người chơi tự đặt.

## 4. Nền (foundation, đã commit trước khi chia track)

| File | Nội dung |
|---|---|
| `scripts/build-chunks.ts` | trích quận (`boundary=administrative` + `admin_level=9`, số theo `ref:INSEE`) + `parks` tổng quát (DP 2 m, ≥ 400 m²) → `water.json` |
| `client/public/data/water.json`, `chunks/index.json` | dữ liệu mới (chunk không đổi) |
| `client/src/geo/chunkData.ts` | `WaterData.districts`, `WaterData.parks` |
| `client/src/geo/districts.ts` (+ test dữ liệu thật) | `districtAt`, `inRing`, `districtPlaque` ("8e Arrt"), `districtLabel` ("Quận 8") |
| `client/src/ui/types.ts` | `HudFrame`, `GpsView`, `NO_GPS`, `MapPoint`, `NoticeCode` |
| `client/src/vehicle/types.ts` | `BikeRefusal` |
| `client/src/world/mapVectors.ts` | **stub** A: kiểu `MapVectors`, `mapVectors()` trả `undefined`, `mapBuffers()` |
| `client/src/world/buildTypes.ts`, `chunkBuild.ts`, `workers/chunkBuilder.worker.ts`, `world/ChunkManager.ts` | `BuildOut.map`, `BuildCtx.district?`, `init.districts`, `ChunkManager.onMap` |
| `client/src/ui/MapTiles.ts`, `Minimap.ts`, `FullMap.ts` | **stub** A |
| `client/src/geo/gps.ts`, `geo/locate.ts` | **stub** B (giữ đích, không có tuyến / tên) |
| `client/src/ui/Menu.ts`, `ui/settings.ts`, `ui/Toasts.ts` | **stub** C (không DOM) |
| `client/src/ui/HUD.ts` | **stub** D |
| `client/src/ui/hud.css` | kiểu chung (§3.8) |
| `client/src/core/Input.ts` | `lock()` public |
| `client/src/vehicle/Bikes.ts` | kiểu trả về `interact` có `BikeRefusal` (chưa trả) |
| `client/src/player/CharacterController.ts` | `onStairs` (chưa gọi), `respawn(): 'safe' \| 'stairs'` |
| `client/src/player/Player.ts` | `update(…, blocked)`; `notice()` khi `F` bị từ chối và khi chạm bậc |
| `client/src/main.ts` | tạo `MapTiles` / `HUD` / `Minimap` / `Menu`, sau khi có đồ thị thì `Gps` / `StreetLocator` / `FullMap`; `HudFrame` mỗi khung; `M` / `Esc` / khóa chuột; URL hooks |
| `client/src/config.ts` | khối Phase 5 (§5.3) |
| `scripts/screenshot.ts` | khối `p5-*` rỗng, mỗi track một dòng `[A]` … `[D]` |

- Stub giữ nguyên hành vi cũ: chưa có HUD, `#help` vẫn hiện khi chuột tự do, `M` không làm gì.
- Mỗi track làm trong git worktree riêng từ commit nền. `SCREENSHOT_PORT` riêng: A 5175, B 5176, C 5177, D 5178.

## 5. Interface (track giữ nguyên chữ ký; đổi thì báo người tích hợp)

### 5.1 `client/src/ui/types.ts` (nền)

```ts
export interface HudFrame {             // main.ts dựng mỗi khung (chỉ khi có người chơi)
  x: number; z: number;                 // chân (pose nội suy), m
  heading: number;                      // hướng camera, rad (0 = bắc / −Z, + = quay trái): minimap quay cho hướng này lên trên
  bodyYaw: number;                      // hướng thân: mũi tên trên bản đồ
  speed: number;                        // m/s ngang
  riding: boolean; swimming: boolean;
  time: number;                         // s đồng hồ đua (Phase 5: từ Player.activate)
  street: string | undefined;           // geo/locate.ts
  district: number;                     // 1…20, 0 = không
}
export interface MapPoint { x: number; z: number }
export interface GpsView {
  readonly target: Readonly<MapPoint> | null;
  readonly route: Float32Array | null;  // x0, z0, x1, z1… từ điểm của người chơi trên tuyến tới đích
  readonly remaining: number;           // m, NaN khi không có tuyến
}
export const NO_GPS: GpsView;
export type NoticeCode = BikeRefusal | 'bikeStairs' | 'respawn' | 'respawnStairs';
// vehicle/types.ts: type BikeRefusal = 'bikeTooFast' | 'bikeTooFar' | 'bikeTaken'
```

### 5.2 Các module

```ts
// world/mapVectors.ts (A; chạy trong worker; chỉ A đọc kiểu này, được đổi tự do)
interface MapVectors { buildings: Pieces; areas: Pieces & { kind: Uint8Array }; roads: Pieces & { width: Float32Array; kind: Uint8Array } }
mapVectors(chunk: ChunkData, ctx: BuildCtx): MapVectors | undefined
mapBuffers(m: MapVectors): ArrayBuffer[]

// ui/MapTiles.ts, ui/Minimap.ts, ui/FullMap.ts (A)
class MapTiles { constructor(water: WaterData | undefined); add(key: ChunkKey, map: MapVectors): void; readonly stats: { vectors; tiles; rasterMs } }
class Minimap  { constructor(tiles: MapTiles); update(f: HudFrame, gps: GpsView, dt: number): void }
class FullMap  { constructor(graph: RoadGraph, water: WaterData | undefined, onWaypoint: (p: MapPoint | null) => void)
                 readonly isOpen: boolean; open(f: HudFrame, metersPerPx?: number): void; close(): void; update(f: HudFrame, gps: GpsView): void }

// geo/gps.ts, geo/locate.ts (B; thuần)
class Gps implements GpsView { constructor(graph: RoadGraph); setTarget(x, z): void; clear(): void
                               update(x, z, mode: 'walk' | 'bike', dt): void; readonly stats: { searches: number; ms: number } }
class StreetLocator { constructor(graph: RoadGraph); at(x, z): string | undefined }

// ui/Menu.ts, ui/settings.ts, ui/Toasts.ts (C)
interface MenuActions { resume(): void; respawn?: () => void }   // respawn vắng = khán giả: ẩn nút
class Menu { constructor(actions: MenuActions); readonly actions; readonly isOpen: boolean; open(): void; close(): void }
interface Settings { invertY: boolean; mouseSensitivity: number }  // × mouseSensitivity của camera
const settings: Settings; saveSettings(): void
toast(text: string): void; notice(code: NoticeCode): void          // import không được chạm DOM (Player.test chạy trong Node)
// C sửa thêm: Bikes.interact(c): 'mount' | 'dismount' | BikeRefusal | null; controller.onStairs(); controller.respawn(): 'safe' | 'stairs'

// ui/HUD.ts (D)
class HUD { update(f: HudFrame, dt: number): void }
```

Thứ tự trong một khung (`main.ts` update, sau `player.update`): dựng `HudFrame` → `gps.update` → `hud.update` → `minimap.update` → `fullMap.update` (khi mở).

### 5.3 Khối config Phase 5 (nền viết khung, mỗi track chỉnh khối mình)

```ts
// Foundation
export const hud = { margin: 16, gap: 8, minimap: { width: 300, height: 190 } };
// A
export const minimap = { metersPerPx: [0.8, 1.6], zoomSharpness: 2, anchorY: 0.65, maxTiles: 24, rasterPerFrame: 1 /* + màu */ };
export const fullMap = { metersPerPx: [0.4, 6], wheelZoom: 1.2, labelMaxMpp: 2 /* + màu */ };
// B
export const gps = { offRoute: 25, minInterval: 1, arriveRadius: 15 };
export const locate = { maxDistance: 25, keepDistance: 35 };
// C
export const menu = { sensitivity: { min: 0.25, max: 3, step: 0.05 }, storageKey: 'cuoc-dua-paris.settings' };
export const toasts = { seconds: 4, max: 4, repeatGap: 3 };
export const notices = { farReach: 6 };
// D
export const hudWidgets = { streetSeconds: 5, streetFade: 0.6 };
```

## 6. Bốn track: file sở hữu và việc cần làm

Mỗi track chỉ sửa file của mình và **khối config của mình**, không thêm import vào config. Sau nền: `main.ts`, `Player.ts`, `DebugOverlay.ts` thuộc D; `index.html`, `CharacterController.ts`, `Bikes.ts`, `ThirdPersonCamera.ts`, `FreeFlyCamera.ts` thuộc C; `world/mapVectors.ts` thuộc A, `world/StreetProps.ts` thuộc D. `TODO.md` / `CLAUDE.md` / README: chỉ người tích hợp.

### Track A – dữ liệu ô + minimap + bản đồ lớn (**Opus**: chất lượng hình, hiệu năng canvas, tương tác kéo / zoom / nhãn cần nhiều phán đoán)
- **File:** `client/src/world/mapVectors.ts` (+ test), `client/src/ui/MapTiles.ts` (+ test), `client/src/ui/Minimap.ts` (+ test phần thuần), `client/src/ui/FullMap.ts` (+ test phần thuần), `client/src/ui/map.css` (mới, nếu cần), config `minimap` + `fullMap` (thêm bảng màu), preset `[A]`.
- **Việc cần làm:**
  - `mapVectors`: nhà (vòng ngoài + lỗ), vùng xanh (park / grass), đường (tim đường + bề rộng vẽ = `roadWidth` của RoadBuilder, cộng vỉa hè nếu muốn; lớp vẽ: đường lớn / đường nhỏ / lối đi bộ / cầu / bậc thang); mọi thứ Float32, chuyển không sao chép.
  - `MapTiles`: raster ô bắc-ở-trên (nền đất, nước từ `water.json`, vùng xanh, nhà, đường theo lớp); chọn ô giao với hình chữ nhật minimap đã xoay; ngân sách / LRU theo config; `stats`.
  - `Minimap`: canvas `hud.minimap` × DPR ở góc dưới trái, khung theo `hud.css`; tỉ lệ nội suy theo `speed / bikeTopSpeed()` giữa `metersPerPx`, làm mượt `zoomSharpness`; người chơi ở `anchorY`; quay theo `heading`; chữ N trên viền (giao tia hướng bắc từ điểm neo với hình chữ nhật); tuyến GPS (nét màu, viền tối); điểm đến kẹp vào viền; mũi tên theo `bodyYaw - heading`.
  - `FullMap`: như quyết định 4.
- **Test (bắt buộc):**
  - `mapVectors` trên 2 chunk thật (Concorde `0_0`, dày nhất `10_0`): số vòng nhà = số nhà + lỗ trong chunk; mọi bề rộng > 0; có cầu; `mapBuffers` không trùng buffer; ≤ 1 ms / chunk (in ra);
  - chọn ô: tập chunk giao hình chữ nhật minimap xoay 0° / 45° / 90° ở 2 mức zoom (so với đếm tay);
  - LRU: vượt `maxTiles` thì bỏ ô cũ nhất; `rasterPerFrame` được tôn trọng;
  - zoom: đứng yên → `metersPerPx[0]`, ≥ tốc độ xe → `[1]`, đơn điệu;
  - chữ N: vị trí trên viền với `heading` 0, 90°, 180° (N ở trên / trái / dưới);
  - kẹp điểm đến vào viền; biến đổi màn hình ↔ thế giới của bản đồ lớn đi-về khớp ≤ 0,01 m;
  - nhãn tên đường không chồng nhau; nhấp gần điểm đến → `onWaypoint(null)`.
- **Preset** (A chọn tọa độ):
  - `p5-minimap`: `/?player&wait=1` (Concorde, nhìn về Khải Hoàn Môn);
  - `p5-minimap-turn`: `/?player&orbit=90&wait=1` (bản đồ quay, chữ N dời chỗ);
  - `p5-minimap-bike`: `/?player&bike&autoMove=walk&wait=4` (đã zoom ra);
  - `p5-fullmap`: `/?player&map` (cả bản đồ);
  - `p5-fullmap-streets`: `/?player&map=1` (1 m/px quanh Concorde, tên đường).

### Track B – GPS + tên đường (**Sonnet được**: thuần, spec rõ, đo được bằng test)
- **File:** `client/src/geo/gps.ts` (+ test), `client/src/geo/locate.ts` (+ test), config `gps` + `locate`, preset `[B]`.
- **Việc cần làm:** quyết định 5–6. Chỉ dùng `RoadGraph` (`nearestNode`, `edgesNear`, `nearestEdge`, `flags`, `edgeWay`, `file.ways` / `file.names`) và `shortestPath`; không DOM, không three.
- **Test (bắt buộc; `roadgraph.json` thật, như `graph.test.ts`):**
  - Concorde → Opéra (walk): có tuyến, bắt đầu cách chân ≤ 1 m, kết thúc đúng đích, dài ≤ 1,3 × đường chim bay;
  - đi dọc tuyến 200 m: `remaining` giảm đều, không tìm lại; lệch ngang 40 m → tìm lại (một lần), tối đa 1 lần / `minInterval`;
  - đang đạp xe: tuyến không qua cạnh `steps`; Trocadéro → Panthéon bằng xe → lùi về walk, vẫn có tuyến;
  - tới trong `arriveRadius` → `target = null`, `route = null`;
  - đích giữa sông xa cầu / ngoài bbox → `route = null`, `target` giữ nguyên;
  - `at()`: chỗ spawn Concorde → "Place de la Concorde"; giữa Champs-Élysées → "Avenue des Champs-Élysées"; giữa cầu Alexandre III → "Pont Alexandre III"; trên vỉa hè Rue Royale → "Rue Royale"; đi 10 m vào đường cắt ngang ở giao lộ → vẫn tên cũ, 40 m → tên mới; giữa sông xa cầu → `undefined`;
  - hiệu năng: tìm tuyến ≤ 5 ms, `at()` ≤ 0,1 ms (in ra).
- **Preset** (chỉ thấy tuyến khi A đã ghép; tọa độ B chọn, không dùng L1–L6):
  - `p5-gps`: `/?player&gps=<Opéra>&wait=2` (tuyến trên minimap);
  - `p5-gps-map`: như trên + `&map=2` (tuyến trên bản đồ lớn);
  - `p5-gps-bike`: đạp xe ở vườn Trocadéro tới một điểm chỉ đi được qua bậc thang nếu đi bộ (tuyến vòng).

### Track C – menu, cài đặt, toast, thông báo xe, hồi sinh (**Sonnet được**: chữ, bố cục, luật đã chốt ở mục 3; phần khóa chuột đã nối sẵn ở nền)
- **File:** `client/src/ui/Menu.ts`, `client/src/ui/settings.ts` (+ test), `client/src/ui/Toasts.ts` (+ test phần thuần), `client/src/ui/menu.css` (mới), `client/index.html` (`#help` → gợi ý ngắn + chuyển bảng phím vào menu), `client/src/player/CharacterController.ts` (+ test: hồi sinh, `onStairs`), `client/src/vehicle/Bikes.ts` (+ test: lý do từ chối), `client/src/player/ThirdPersonCamera.ts` + `FreeFlyCamera.ts` (+ test: cài đặt), config `menu` + `toasts` + `notices`, preset `[C]`.
- **Việc cần làm:** quyết định 9–13. DOM tạo trong JS khi dùng lần đầu (import không chạm DOM). Nút trong menu là `<button>` thật (Tab / Enter dùng được); thanh trượt đổi xong thì `blur()` để `Esc` vẫn tới game. Menu phải giữ `actions` public (main dùng `menu.actions.respawn` cho `?respawn=`).
- **Test (bắt buộc):**
  - `settings`: đọc / ghi qua storage giả; storage ném lỗi → mặc định, không crash; kẹp độ nhạy vào [min, max];
  - camera: `invertY` đổi dấu pitch với cùng `mouseDY`; độ nhạy 2 × → góc gấp đôi (chuột và tay cầm);
  - `Bikes.interact`: đạp 4 m/s → `bikeTooFast`; đứng cách xe 4 m → `bikeTooFar`; xe đội khác trong tầm → `bikeTaken`; không có xe trong 6 m → `null`; lên / xuống xe vẫn như cũ;
  - Rapier thật: đạp xe vào collider bậc thang → `onStairs` được gọi; đang bơi (`water` giả với 2 bậc) → `respawn()` trả `'stairs'`, chân ở khe lan can gần nhất, trên kè, không còn `inWater`; trên đất → `'safe'`;
  - toast: cùng chữ trong `repeatGap` bị bỏ, quá `max` dòng thì bỏ dòng cũ (hàm thuần tách khỏi DOM).
- **Preset:**
  - `p5-menu`: `/?player&menu`;
  - `p5-toast-stairs`: URL của `p4-stairs-block` (đạp vào bậc vườn Trocadéro) → toast;
  - `p5-respawn`: `p3-swim` + `&respawn=1&wait=2` (đứng trên đầu bậc kè gần nhất, toast).

### Track D – HUD góc dưới phải, biển tên đường, ghép (**Opus**: ghép A–C, khóa chuột trên nhiều trình duyệt, soát hình toàn bộ)
- **File:** `client/src/ui/HUD.ts` (+ test phần thuần), `client/src/world/StreetProps.ts` (+ test dòng quận; được sửa `props.signs` của khối Phase 2 E vì biển cao thêm một dòng), `client/src/main.ts`, `client/src/player/Player.ts`, `client/src/ui/DebugOverlay.ts`, config `hudWidgets`, preset `[D]`.
- **Việc cần làm:**
  - HUD theo quyết định 6–8: tên đường (font viết tay) + "Quận n", hiện khi đổi rồi mờ; "THỜI GIAN" luôn hiện; "TỐC ĐỘ … km/h" + icon khi đạp xe; chỉ ghi DOM khi chữ đổi;
  - dòng quận trên biển tên đường (`ctx.district` tại chân cột, `districtPlaque`);
  - `main.ts`: ẩn HUD khi đang tải và khi bay tự do (`V`), kiểm tra lại luồng khóa chuột / `Esc` / `M` trên Chrome, Firefox, Safari (ghi kết quả), bảng F3 dời lên góc trên phải + dòng "HUD: n ô bản đồ · raster x ms · GPS n lần, x ms";
  - thay mọi stub khi ghép A–C, sửa chỗ vênh.
- **Test (bắt buộc):**
  - định dạng: 37 s → "00:37", 3 725 s → "1:02:05"; 5,2 m/s → "19 km/h";
  - nhãn tên đường: đổi đường → hiện, hết `streetSeconds` → ẩn; cùng tên → không hiện lại; quận đổi mà đường giữ → hiện lại;
  - `splitName` / ô atlas có dòng quận: ô cao hơn, chữ quận nhỏ hơn tên; không có quận → như cũ;
  - `parseOverrides` / URL hooks không đổi các test cũ.
- **Preset:**
  - `p5-hud`: `/?player=87.8,-184.5,-25.97&autoMove=walk&wait=2` (Rue Royale · Quận 8 · đồng hồ);
  - `p5-hud-bike`: `/?player&bike&autoMove=walk&wait=3` (tốc độ km/h);
  - `p5-sign`: camera sát một biển tên đường có dòng "8e Arrt";
  - `p5-debug`: `/?player&debug=1` (F3 góc trên phải, dòng HUD).

## 7. Screenshot preset

- `npm run screenshot -- p5` chạy cả nhóm. Tên và chủ sở hữu ở mục 6.
- Từ Phase 5, preset `p3-*` / `p4-*` / `p4b-*` có HUD (minimap, đồng hồ). Không cần tắt: HUD là DOM, không đổi `__STATS__` (lệnh vẽ, tam giác).
- Mỗi track tối đa 4 vòng chụp → sửa. Người tích hợp chụp lại `p5-*`, `p4-*`, `p3-*`, `p4b-street`.

## 8. Ghép và kiểm tra

- **Thứ tự: B → C → A → D.**
  - B: thuần, chỉ file `geo/`;
  - C: DOM menu / toast + controller / xe / camera, không đụng bản đồ;
  - A: worker + canvas, đọc `GpsView` của B;
  - D: HUD + ghép, thay stub còn lại, soát toàn bộ.
- **Xung đột dự kiến:** `config.ts` (mỗi khối riêng), `screenshot.ts` (mỗi track một dòng), `index.html` (chỉ C), `main.ts` / `Player.ts` (chỉ D).
- **Người tích hợp:**
  - `npm run build && npm test`;
  - `npm run screenshot -- p5 p4 p3`, `p4b-street`;
  - `npm run ride-check` (menu không mở vì headless không khóa chuột; toast không được gây lỗi console);
  - mở game thật trên Chrome + một trình duyệt khác: Esc → menu, Tiếp tục, M → bản đồ → nhấp đặt điểm đến → Esc, F3 xem thời gian minimap / raster;
  - `TODO.md`: xóa 4 dòng Phase 5, thêm ponytail còn lại (font hệ thống, luật đua dạng chữ thô, bản đồ lớn không có nhà, không có chấm đội khác, hồi sinh chưa báo server); `CLAUDE.md`: thư mục `ui/`, `geo/gps.ts`, `water.json` có quận / công viên, URL hooks;
  - commit `feat(phase5): …`.

## 9. Ngân sách

| Mục | Giới hạn |
|---|---|
| Main thread / khung | minimap vẽ ≤ 0,5 ms; raster ô ≤ 3 ms, ≤ 1 ô / khung; HUD DOM ≤ 0,2 ms (chỉ ghi khi đổi); tên đường ≤ 0,1 ms (4 lần/s) |
| GPS | 1 lần tìm ≤ 5 ms, ≤ 1 lần / s |
| Bản đồ lớn | kéo / zoom 60 fps (vẽ lại nền đã raster); vẽ lại vector khi dừng ≤ 30 ms; nền ≤ 10 MB, bỏ khi đóng |
| Bộ nhớ | ô minimap ≤ 24 × (512² × 4 B) = 24 MB ở DPR 2 (6 MB ở DPR 1); vector chunk ≤ 4,1 MB |
| Worker | trích `MapVectors` ≤ 1 ms / chunk |
| Lệnh vẽ 3D | **+0** (HUD là DOM + canvas 2D) |
| Mạng | **+0 request**; `water.json` +90 KB (154 KB) |

## 10. Để sang phase sau

- **Phase 6:** chấm đội khác trên minimap (tùy chọn, mặc định tắt §7); báo server khi hồi sinh; ping + số người chơi trong F3.
- **Phase 7:** thẻ nhiệm vụ góc trên trái; đồng hồ theo giờ xuất phát của đội (server); hộp mật thư không bao giờ vào `MapVectors` / bản đồ.
- **Phase 9:** khối "PHẠT · n phút", icon luật phương tiện, toast "Lộ trình này bắt buộc đi bộ".
- **Phase 10:** bản đồ Host dùng lại `roadgraph.json` + `water.json` (+ tên địa danh).
- **Phase 12:** cài đặt đồ họa trong menu; font OFL nếu anh chọn.

## 11. Câu hỏi mở cho người dùng (có mặc định, không chặn việc làm)

1. **Font viết tay cho tên đường:** dùng font có sẵn của hệ điều hành (Segoe Print trên Windows, Bradley Hand trên Mac: hai máy trông khác nhau) hay tải một font miễn phí giấy phép OFL (ví dụ Caveat hoặc Kalam, khoảng 100 KB, cần anh duyệt tải)? **Mặc định:** font hệ thống.
2. **GPS:** chỉ dẫn tới điểm người chơi tự đặt trên bản đồ lớn (§12). Từ Phase 7, với mật thư ghi rõ điểm đến, có muốn GPS tự dẫn tới hộp mật thư không? **Mặc định:** không (§4.6, §8.2: hộp không hiện trên bản đồ).
3. **Tên quận trên HUD:** "Quận 8" (tiếng Việt) hay "8e arrondissement" (như ở Paris)? **Mặc định:** HUD "Quận 8", biển tên đường "8e Arrt".
4. **Bản đồ lớn không vẽ từng tòa nhà** (chỉ đường, sông, công viên, giống bản đồ GTA V); minimap thì có nhà. **Mặc định:** như vậy.
5. **"Kẹt? Về chỗ an toàn":** có giới hạn số lần (ví dụ 1 lần / 30 s) không? **Mặc định:** không giới hạn (chỉ về chỗ vừa đứng vài giây trước, hoặc bậc kè gần nhất khi ở dưới sông, nên không có lợi thế).
6. **Đồng hồ trước Phase 7** đếm từ lúc vào game (chưa có giờ xuất phát). **Mặc định:** như vậy.
