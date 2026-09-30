# Phase 5 – Track A: minimap + bản đồ lớn (báo cáo)

Nhánh `worktree-agent-a83fcea0611975054`, từ nền `0359dc8`. Không thêm package, không thêm request mạng, +0 lệnh vẽ 3D.
`npm run build && npm test` qua (client 49 file / 481 test, nền là 45 / 463).

## Việc đã làm
- **`world/mapVectors.ts`** (worker): lớp bản đồ của mỗi chunk, Float32 / Uint, chuyển không sao chép.
  - Nhà: vòng ngoài và lỗ, giữ nguyên chiều quay của chunk (vòng ngoài diện tích > 0, lỗ < 0), nên một lần tô `nonzero` là khoét được lỗ. Bỏ đường viền địa danh không phải nhà (`bridge`, `fountain`, `artwork`): mặt cầu sẽ che mất đường.
  - Vùng xanh: `park` và `grass`.
  - Đường: tim đường với bề rộng `RoadBuilder.roadWidth`, giống đường 3D. Lớp vẽ `RoadClass`: lối đi bộ, phố đi bộ, service, đường nhỏ, đường lớn, bậc thang; cộng bit `BRIDGE` cho mặt cầu. Bỏ cầu cạn metro / đường ray.
  - Chunk rỗng vẫn trả dữ liệu để ô vẫn vẽ nước.
- **`ui/MapTiles.ts`**: mỗi chunk một ô raster, bắc ở trên, `256 × min(2, DPR)` px.
  - Chỉ vẽ ô khi minimap cần, tối đa `rasterPerFrame` ô mỗi khung. LRU `maxTiles`; ô bị bỏ thì canvas được dùng lại.
  - Ô phủ chunk + `tilePad` (2 m) và vẽ cả phần của 8 chunk kề thò sang (nhà, bậc thang, cầu nằm nguyên trong một chunk). Các ô chồng nhau với điểm ảnh giống hệt, nên khi xoay không có đường nối. Chunk kề tới sau thì ô được vẽ lại.
  - Nước lấy từ `water.json`. Mọi thứ cắt theo `RACE_BBOX`; ngoài vùng đua tô màu `outside`.
- **`ui/Minimap.ts`**: canvas `hud.minimap` (300 × 190) × DPR ở góc dưới trái, khung `.hud-box`.
  - Xoay theo `heading`; người chơi ở `anchorY`. Mỗi khung vẽ các ô đang thấy, ô gần trước; một phép SAT chọn chunk giao với hình chữ nhật đã xoay.
  - Tuyến GPS: nét tím, viền tối. Điểm đến bị kẹp vào viền dọc theo đường từ người chơi tới nó.
  - Chữ N nằm ở chỗ tia hướng bắc gặp viền. Mũi tên quay theo `heading − bodyYaw`.
  - Không vẽ lại khi không có gì đổi.
- **`ui/FullMap.ts`**: bản đồ toàn màn hình, không vẽ từng nhà, không NPC / xe / hộp mật thư.
  - Khi mở: raster cả bản đồ một lần ở 3 m/px, đóng thì bỏ.
  - Khi kéo / zoom: vẽ lớp nền đó và khung nét gần nhất theo phép biến đổi. Dừng 150 ms thì vẽ lại khung nhìn từ vector đúng tỉ lệ, kèm tên đường.
  - Tên đường chỉ lấy tên way trong `roadgraph.json` (SPEC §4.6), đặt dọc đoạn dài nhất, không bao giờ lộn ngược, không chồng nhau, cùng tên thì cách nhau ≥ 320 px.
  - Điều khiển: kéo = di chuyển; lăn = zoom quanh con trỏ (một bước mỗi sự kiện, cách nhau ≥ 60 ms như `Input`); nhấp = đặt điểm đến; nhấp cách điểm đến ≤ 12 px = bỏ.
  - Dòng hướng dẫn ở đáy và dòng "Bản đồ © OpenStreetMap contributors".
- **Config** (`minimap`, `fullMap`): `tilePx`, `tilePad`, `routeWidth`, bảng màu chung (kiểu radar GTA V), `baseMpp`, `settleMs`, `footMaxMpp`, `clickPx`, `dragPx`, `wheelGapMs`, `label`.
- **Test** (4 file mới, 18 test):
  - `mapVectors`: 0_0, 10_0, -1_0 (Pont de la Concorde), -11_4 (cầu cạn metro bị bỏ).
  - `MapTiles`: LRU, `rasterPerFrame`, vẽ lại khi chunk kề tới.
  - `Minimap`: zoom, xoay đi-về, chữ N, kẹp điểm đến, chọn chunk ở 0° / 45° / 90° × 2 mức zoom, có đếm tay trong chú thích.
  - `FullMap`: màn hình ↔ thế giới < 0,01 m, zoom giữ điểm dưới con trỏ, nhấp gần điểm đến → `onWaypoint(null)`, nhãn không chồng (dữ liệu giả + đồ thị thật quanh Concorde).
- **Preset `[A]`**: `p5-minimap`, `p5-minimap-turn`, `p5-minimap-bike`, `p5-fullmap`, `p5-fullmap-streets`.

## Số đo (so ngân sách §9 của kế hoạch)
Đo bằng Chrome headless trên Apple M4, 1280 × 720, đi bộ vòng tròn 600 khung quanh Concorde. Có hai cấu hình: GPU Metal ở DPR 1 và 2, và SwiftShader (CPU). Đồng hồ `performance.now()` chỉ chính xác tới 0,1 ms. Canvas 2D chạy bằng GPU nên con số là thời gian JS trên main thread; phần GPU vẽ trễ, không nằm trong số này.

| Mục | Đo | Ngân sách |
|---|---|---|
| `mapVectors` / chunk (Node, lấy lần nhanh nhất trong 5 lần) | 0_0 0,05 ms · 10_0 (dày nhất) 0,10 ms · -1_0 0,03 ms | ≤ 1 ms |
| Minimap vẽ / khung | TB 0,12 ms, p95 0,2 ms, lớn nhất 0,7–0,8 ms (1 khung); SwiftShader TB 0,12, lớn nhất 0,3 | ≤ 0,5 ms |
| Raster 1 ô | TB 0,29 ms, lớn nhất 0,5 ms (GPU); SwiftShader TB 0,23, lớn nhất 0,3; ≤ 1 ô / khung (có test) | ≤ 3 ms, ≤ 1 ô / khung |
| Bộ nhớ raster ô | sau 10 s: 12 ô = 3 MB (DPR 1) / 12 MB (DPR 2); tối đa 24 ô = 6 / 24 MB | ≤ 24 MB ở DPR 2 |
| Bản đồ lớn: raster nền khi mở | 3,7–4,3 ms JS; 1 902 × 1 290 px = 9,4 MiB, bỏ khi đóng | ≤ 10 MB |
| Bản đồ lớn: vẽ lại vector + tên khi dừng | 7–8,6 ms (2 m/px), 1,8–3,5 ms (1 m/px), 1,2–1,4 ms (0,5 m/px) | ≤ 30 ms |
| Bản đồ lớn: một khung khi kéo | ≤ 0,1 ms (GPU); SwiftShader TB 0,32, lớn nhất 1,9 ms | 60 fps |
| `new FullMap` (một lần, khi đồ thị tải xong) | 20 ms (Node) | – |
| Lệnh vẽ 3D / request mạng | +0 / +0 | +0 / +0 |

## Ảnh đã xem (4 vòng chụp; mỗi ảnh minimap có cắt phóng to)
1. **Vòng 1** (`p5-minimap`, `p5-fullmap`, `p5-fullmap-streets`):
   - Bản đồ lớn đã đạt: sông, cầu có viền tối, công viên, đường theo lớp, tên đường quanh Concorde (Rue Royale, Avenue des Champs-Élysées, Pont de la Concorde…), không tên địa danh.
   - Minimap: đường trắng quá chói, đè cả khung nhìn ở Concorde → hạ màu đường.
2. **Vòng 2** (4 preset): minimap bị kéo giãn dọc, không thấy chữ N / điểm đến ở nửa dưới.
   - **Lỗi thật:** canvas mới mặc định 300 × 150; ở DPR 1 chiều rộng đã đúng 300 nên chiều cao không bao giờ được đặt. Đã sửa: so cả hai chiều.
   - Thêm: cắt bản đồ theo `RACE_BBOX` (mép bản đồ gọn).
3. **Vòng 3** (3 preset minimap): tỉ lệ đúng.
   - Quay 90° (camera nhìn về phía nam): N ở đáy, điểm đến Opéra kẹp ở viền dưới, mũi tên chỉ sang phải (thân quay về phía tây) – đúng.
   - Xe đạp: đã zoom ra, thấy sông, Pont de la Concorde, vườn Champs-Élysées.
   - Mép đường răng cưa là do SwiftShader. Đã xem trên Chrome thật (Browser pane, GPU, DPR 2): mép mịn.
4. **Kiểm tra phụ** (script tạm, không commit): gắn một tuyến GPS tự vẽ.
   - Tuyến tím viền tối hiện đúng trên minimap và bản đồ lớn (2 m/px).
   - Khung đang kéo: lớp nét cũ phóng theo, liền mạch với nền.
5. **Vòng 4** (cả 5 preset): như mong đợi.
   - `p5-minimap-bike` với `wait=3` quá 30 s khi máy tải nặng (ảnh vẫn đúng). Đổi sang `wait=2`, chụp lại riêng preset đó chỉ để kiểm tra thời gian: qua.

## Lệch so với kế hoạch
- **Chữ N:** theo quy ước `HudFrame` (+ = quay trái), `heading` 90° là nhìn về phía tây nên hướng bắc nằm **bên phải**. Kế hoạch ghi "trái". Test kiểm tra trên / phải / dưới / trái cho 0 / 90° / 180° / −90°.
- **Zoom:** giữ `metersPerPx[0]` tới tốc độ đi bộ (`movement.footSpeed`), rồi tăng tuyến tính tới `[1]` ở `bikeTopSpeed()`. Kế hoạch là `speed / bikeTopSpeed()` từ 0. Lý do: đi bộ 4 m/s đã là 77 % tốc độ xe, minimap sẽ phóng / thu mỗi lần dừng. Test vẫn đúng: đứng yên → `[0]`, ≥ tốc độ xe → `[1]`, đơn điệu.
- **Test `mapVectors`:** chunk 0_0 không có cầu, nên thêm -1_0 (Pont de la Concorde) cho phần "có cầu".
- **Preset:**
  - `p5-minimap-bike` = `…&npc=0&wait=2` (kế hoạch: `wait=4`, bị quá 30 s trong SwiftShader).
  - `p5-minimap-turn` và hai preset `p5-fullmap*` thêm `gps=766,-715` (Opéra) để thấy điểm đến / kẹp viền.
- **Tô màu:** `nonzero` thay cho even-odd với nhà và vùng xanh (dữ liệu đã có chiều quay đúng; nhà chồng nhau không bị thủng). Nước vẫn even-odd.
- **Bản đồ lớn vẽ lại vector** khi `mpp < baseMpp × DPR` (kế hoạch: `< baseMpp`), để màn Retina không thấy nền 3 m/px bị phóng mờ.
- **Toàn bản đồ:** khi mở không có zoom, bản đồ canh giữa vùng đua để thấy trọn, không canh giữa người chơi.
- **API thêm** (không đổi chữ ký cũ):
  - `Minimap.el` (gốc DOM: D ẩn khi đang tải / bay tự do), `Minimap.stats.drawMs`;
  - `MapTiles.has / frame / tile`, `MapTiles.stats.rasters`, các hàm tiện ích `tileBox / neighbourhood / boxes / hit / trace / clipToArea`;
  - `FullMap.view / extent / stats {baseMs, detailMs, drawMs, labels} / click() / labels()`;
  - `mapVectors()` luôn trả `MapVectors`, không trả `undefined`.
- **Không có `ui/map.css`:** kiểu viết thẳng trong JS, dùng lại `.hud-box`.

## Ghi chú cho người tích hợp (D)
- **Dòng F3:** `minimap.tiles.stats` {vectors, tiles, rasterMs, rasters}, `minimap.stats.drawMs`, `fullMap.stats`.
- **`__GAME__`:** nên thêm `minimap`, `fullMap` cho script. Lúc đo, tôi vá `main.ts` tạm trên máy rồi đã hoàn lại, không commit.
- **Ẩn minimap:** `minimap.el.hidden = true` khi đang tải hoặc khi bay tự do (`V`).
- **Lớp phủ:** bản đồ lớn ở `z-index: 20`, phủ minimap, `#help` và dòng ghi nguồn (bản đồ có dòng OSM riêng).
- **GPS (B):** minimap và bản đồ lớn nhận ra tuyến mới qua **đối tượng** `gps.route` và `gps.target`. B cần gán mảng mới khi tuyến đổi, không sửa tại chỗ. Minimap vẫn vẽ lại mỗi khi người chơi di chuyển.

## Còn lại / chưa kiểm
- **Tương tác chuột thật** (kéo, lăn, nhấp trên bản đồ lớn) mới thử bằng script và test, chưa thử tay. Firefox / Safari chưa thử: `OffscreenCanvas` trên main thread cần Safari 16.4+. Người tích hợp làm theo §8 của kế hoạch.
- **Tuyến GPS thật** của B chưa ghép; phần vẽ tuyến đã thử bằng tuyến gắn tay.
- **Không làm (YAGNI):**
  - chữ "còn … km" cạnh điểm đến;
  - phím WASD để di chuyển bản đồ lớn;
  - kẹp điểm đến vào viền trên bản đồ lớn.
- **ponytail:** tên đường đặt thẳng trên một đoạn của mỗi mảnh way, nên phố cong gồm nhiều đoạn ngắn có thể không có tên. Nâng cấp: đặt chữ dọc theo đường gấp khúc.
