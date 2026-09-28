# Việc còn để lại

Những phần tạm (placeholder) hoặc hoãn sang phase sau. Làm xong thì xóa dòng tương ứng.

## Phase 2 – Bản đồ (phần còn lại)
- Đã soát ảnh mọi preset sau đợt sửa review (12 đại lộ ở Étoile, Champs-Élysées thẳng tới Concorde, đường cong sông Seine, cầu Iéna một mặt cầu, Louvre). Preset `eiffel` chưa thấy Trocadéro vì sương (cách ~1,4 km, sương hết ở ~1 km khi bay cao 250 m); preset `street` không thấy Khải Hoàn Môn (cách ~900 m, sau sương 700 m).
- Nhà: mặt đất DEM AWS gồ lên 13–17 m dưới Louvre (thực tế ≈ +1 m so với Concorde). Nhà đo chiều cao từ mặt đất thấp nhất, nhưng không thấp hơn điểm cao nhất của chân nhà quá `buildings.groundSpan` (3 m), nên Louvre vẫn thấp (khoảng 7 m) nhìn từ Cour Carrée. DEM giữ nguồn AWS (người dùng đã chốt).
- Nhà: thuyền, nhà thuyền, nhà hàng nổi (22 nhà có tâm nằm trong lòng sông) bị bỏ ở `build-chunks` (`dropped.buildingOnRiver`). Phase 12: mô hình sà lan / nhà thuyền nổi trên mặt nước.
- Nhà: 4 trụ đầu cầu Alexandre III (building=yes nhỏ) đang dựng thành nhà Haussmann tí hon có cửa hàng + mái mansard; thay bằng model ở Phase 11.
- Nhà: tường chung (party wall) chỉ nhận ra giữa các nhà trong cùng một chunk và khi chung đúng cạnh; nhà sát ranh chunk vẫn có mặt tiền + mái mansard ở phía đó (ponytail trong `BuildingBuilder.ts`). Nâng cấp: `build-chunks` đánh dấu cạnh chung trên toàn bản đồ.
- Nhà: một vài dải tường đá trơn trên mái trông như lơ lửng (thấy ở Champs-Élysées từ mặt đường), có lẽ là phần tường chung cao hơn nhà bên cạnh; chưa rõ nguyên nhân.
- Nhà: bỏ qua tag `colour` / `roof:colour` / `roof:shape` (mọi nhà Haussmann đều mái mansard, nhà khác mái bằng) và `building:part`.
- Nhà: 2 chunk (`9_7`, `9_8`) mỗi chunk bỏ 1 nhà hỏng hình học (console.warn).
- Đường: khi cắt vỉa hè ở giao lộ chỉ thấy đường trong cùng chunk; đường đi vào từ chunk bên cạnh không cắt vỉa hè, nên bó vỉa có thể lấn vào lòng đường ở mép chunk (ponytail trong `RoadBuilder.ts`). Nâng cấp: đưa bề rộng đường giao nhau vào dữ liệu chunk.
- Đường: nhịp vạch đứt đoạn bắt đầu lại ở mỗi mảnh chunk, có thể lệch nhịp ở ranh giới chunk. Nâng cấp: tính nhịp theo toạ độ thế giới.
- Đường: chưa có vạch dừng, vạch người đi bộ, bó vỉa hạ ở lối xe vào; đầu đường cụt vỉa hè chỉ cắt vuông. Làn xe đạp nằm ở mức mặt đường nên có thể bị vỉa hè nổi che, chưa có màu/ký hiệu riêng.
- Đường: vài ô vạch trắng lạc trong đảo giữa Étoile và trên nền giữa các đại lộ (có lẽ mảnh đường hai chiều rất ngắn); chưa điều tra.
- Đường hầm (`tunnel=*`, `layer<0`) bị bỏ, chưa dựng.
- Cầu: collider = mọi tam giác hiển thị của cầu (ponytail trong `BridgeBuilder.ts`); dùng hộp giản lược nếu Rapier dựng chậm.
- Cầu: cầu vượt đường (không qua sông) nằm sát mặt đất vì độ cao nội suy giữa hai đầu; chưa có trụ cầu, dầm vòm (Alexandre III) và cột sắt (Bir-Hakeim).
- Cầu: cầu cạn metro số 6 là một chuỗi dài 2,4 km trong chunk `-8_7` (46k tam giác, chunk nặng nhất) và chỉ hiện khi chunk đó được tải: tầng trên (metro) của cầu Bir-Hakeim (SPEC §4.5) không thấy từ bờ Passy hay mặt nước cạnh cầu (chunk cách > 800 m); phần ngoài vùng đã tải hiện thành vệt tối trên trời (preset `eiffel`). Nâng cấp: tách chuỗi cầu theo chunk, giữ độ cao nội suy của cả chuỗi (kế hoạch hiện chốt "không tách chuỗi cầu").
- Cầu: các mặt cầu song song cùng tầng (đường tách làn, cách tâm ≤ `roads.bridge.mergeGap`) được nối thành một mặt, chỉ có lan can ở mép ngoài; chỉ xét cầu trong cùng chunk (ponytail trong `BridgeBuilder.ts`). Vỉa hè vẽ riêng trên cầu (`footway=sidewalk`, 76 way) vẫn bị bỏ như mọi vỉa hè; cầu Iéna vì vậy chỉ rộng ~19 m (thực tế ~35 m).
- Cầu: mặt dưới cầu và mái kính (building=roof) gần như đen vì ánh sáng bán cầu phía dưới tối (`render.hemiLight.ground`); chỉnh cùng ánh sáng Phase 12 (SPEC §14).
- Sông Seine: kè thấp (berges, Voie Georges-Pompidou) bị nâng lên ngang mặt phố bởi dải kè 8 m; muốn có đường dạo sát mặt nước thì khoét thêm từ `WaterData.quays` (ponytail trong `Terrain.carveRiver`). Đường nằm trong dải đá kè 12 m cạnh nước bị tấm kè che. Quyết định "khoét kè từ hình học OSM" mới làm một phần: `build-chunks` đã ghi 161 đường kè (`barrier=retaining_wall`, `man_made=embankment|quay`) vào `water.json` nhưng chưa có code nào đọc; `carveRiver` chỉ dùng đa giác nước + dải cố định. Làm cùng phần kè thấp.
- Sông Seine: vài chỗ dốc đất sau tấm đá kè vẫn lộ răng cưa nhỏ khi nhìn từ trên cao (tăng `terrain.copingWidth` hoặc lưới mịn hơn); đảo hẹp (Île aux Cygnes ~11 m) bị hạ xuống lòng sông rồi phủ tấm kè, chưa có cây/lối đi riêng.
- Mặt nước chưa có phản chiếu phẳng (chỉ env trời + normal map cuộn); thêm Reflector / Water.js nếu trông phẳng và FPS cho phép.
- Màu mặt đất (cỏ/sỏi/vỉa hè) chỉ theo lưới đỉnh 5 m nên mép bãi cỏ bị mờ; dùng splat texture theo chunk nếu cần sắc nét.
- Biển tên đường: mỗi chunk một atlas riêng (512 px ngang); nâng cấp lên atlas LRU toàn cục nếu VRAM vượt 60 MB.
- Cột đèn: đường một chiều tách làn có thể có cột đèn ở dải phân cách; chưa kiểm tra cột đèn đè lên nhà/cây. Cây công viên chỉ lấy từ điểm `tree` của OSM, chưa rải thêm.
- Streaming: chỉ 1 worker dựng chunk (tối đa 2 chunk cùng lúc); dùng pool nhiều worker nếu lần tải đầu chậm.
- Streaming: ngân sách "≤ 49 chunk" là cho bán kính tải 800 m; khi di chuyển có thể giữ tới ~60 chunk vì chỉ bỏ chunk ở 1000 m (`chunks.unloadRadius`, tránh tải lại liên tục ở mép). Khi bay cao, bán kính tải theo sương (`fog.far` + `chunks.fogMargin`) nên tải nhiều chunk hơn (79 ở preset `eiffel`).
- Collider Rapier chỉ tạo cho chunk trong 150 m (`chunks.colliderRadius`), mỗi khung hình một chunk; một chunk dày vẫn mất ~5 ms (Apple Silicon, có thể ~10 ms trên laptop Windows) trong khung hình đó. Đo trên máy thật (F3); nếu giật thì dùng hộp giản lược thay trimesh.
- Chưa trích từ OSM dù `fetch-osm` đã tải: `amenity=bicycle_parking` (chỗ ưu tiên đặt xe, SPEC §6 → Phase 4/7), `amenity=fountain` (hạt nước, SPEC §14 → Phase 12), ranh giới quận `admin_level=9` (tên quận trên biển/HUD → Phase 5), `tourism` / `historic` / `place` (bản đồ Host → Phase 10).
- STYLE_GUIDE chưa có: đèn giao thông ở giao lộ, nắp cống, dải cỏ ven đường (Phase 12).
- Đường một chiều tách làn: vỉa hè phía nửa đường cùng tên bị bỏ nếu hai nửa quá gần; chỉ xét trong cùng chunk, đo ở giữa mảnh đường (ponytail trong `RoadBuilder.ts`).
- Ngoài bbox chỉ có dải chunk sát biên, đứng gần biên nhìn ra ngoài sẽ thấy mép thế giới (cảnh báo + tường vẫn chặn); có thể thêm địa hình/sương xa hơn. Mây vẽ tĩnh trong texture bầu trời.
- Photorealistic 3D Tiles: hoãn (cần API key, ghi công, không được cache).

## Phase 3 – Nhân vật & camera
- Tạo `client/src/core/EventBus.ts` khi có module thật sự cần (Phase 1 chưa có nên chưa tạo).
- `core/Time` (SPEC §3) hiện nằm trong `GameLoop` (delta khung hình đã kẹp, FPS); tách `client/src/core/Time.ts` khi có module khác cần đồng hồ game.
- Nội suy vị trí giữa hai bước vật lý khi render (alpha = accumulator / fixedDt) nếu nhân vật bị giật; hiện render trạng thái vật lý mới nhất.
- Gamepad: gán nút cho nhảy, tương tác, menu, sổ mật thư…; hiện chỉ có stick và LT/RT/LB/RB cho camera bay (chưa có bay nhanh / đổi tốc độ bằng tay cầm). Tay cầm không có mapping `standard` (một số tay trên Firefox) hiện bị bỏ qua.
- Đèn, cột Morris, lối vào metro, biển tên đường chưa có collider; thêm trụ mỏng nếu người chơi đi xuyên qua.
- Tia raycast thẳng đứng của Rapier có thể trượt qua heightfield nếu nằm đúng trên đường lưới 5 m; spawn/respawn cộng lệch 1 mm hoặc dùng shape cast.
- Bơi dưới sông Seine và cầu thang xuống kè.

## Phase 4 – Di chuyển
- `npm run build-graph` → `shared/data/roadgraph.json`.
- Giao lộ sát ranh chunk có thể bị bỏ sót khi đặt biển tên đường / cột đèn (nhánh đường nằm ở chunk bên cạnh); dùng danh sách giao lộ toàn cục của `build-graph`.

## Phase 5 – HUD
- Menu thật (SPEC §17.2: tự mở khi chuột bị nhả, `Esc`); hiện chỉ hiện bảng hướng dẫn phím.
- Biển tên đường: thêm dòng quận (vd. "8e Arrt") khi có dữ liệu quận.

## Phase 6 – Server & presence
- Thay `RaceRoom` tạm (chỉ có `SELECT 1`) bằng room thật: WebSocket, SQLite, Alarms; bỏ endpoint thử `/api/room/ping` và room cố định `"dev"`, định tuyến mỗi cuộc đua vào Durable Object riêng.
- Đăng nhập mã đội / Host, token ký HMAC bằng `HOST_PASSWORD`.
- Test Durable Object bằng `@cloudflare/vitest-pool-workers` (kiểm tra tương thích với Vitest 5 trước khi cài; hiện `worker/src/legs.test.ts` chạy trong môi trường Node vì chỉ kiểm tra dữ liệu).
- Kết hợp Vite HMR với Worker/DO khi dev. Hai hướng: Vite proxy `/api` (và WebSocket) sang `wrangler dev`, hoặc dùng `@cloudflare/vite-plugin` 1.60.2. Hiện tại `npm run dev:worker` phải build lại client mỗi lần chạy.
- Phím `G` (vẫy tay) và `R` (bấm còi) đã có trong `config.ts` nhưng chưa có tác dụng; làm cùng presence.
- Bảng debug F3: thêm ping và số người chơi đang thấy (SPEC §14).

## Phase 7 – Race engine lõi
- Xuất phát: đặt các đội bên ngoài hàng rào obelisk, cách ≥ 8–10 m (SPEC §17.4). Geofence cho phép bán kính 15–40 m.
- Schema zod cho file chặng trong `/shared`; Worker import `worker/legs/paris-demo.json` để nạp lần đầu vào SQLite (hiện mới chỉ test import file này).
- Quyết định thời gian Host tạm dừng có bị trừ khỏi thời gian chính thức không (SPEC §13.3 nói đồng hồ dừng, công thức §13.8 không trừ), rồi cập nhật `docs/RACE_RULES.md` mục 11.

## Phase 11 – Test toàn trình
- `npm run sim` (bot mô phỏng), `worker/legs/test/paris-demo.filled.json`, `worker/legs/test/specials.json`.
- Thay địa danh tạm (Eiffel, Khải Hoàn Môn, kim tự tháp Louvre, obelisk) bằng model thật; Eiffel chưa có các vòm trang trí dưới tầng 1, obelisk chưa có chóp vàng; Eiffel nhìn từ xa hơi tối (tự đổ bóng + lưới alpha).
- Địa danh SPEC §4.5 / đường chân trời còn là khối nhà một chiều cao (bỏ qua `building:part`): Notre-Dame (tấm 10 m, thật: gian giữa ~33 m, tháp 69 m), Sainte-Chapelle (hộp 75 m), Opéra Garnier (hộp 70 m), mái vòm Invalides, Grand Palais, Orsay, Palais de Chaillot (tường trơn không cửa sổ), cầu Bir-Hakeim hai tầng có cột sắt. Làm cùng model địa danh (Phase 2B hoặc Phase 11).

## Phase 12 – Deploy
- Bundle client ~4,9 MB (gzip ~1,8 MB), phần lớn là WASM nhúng base64 của `@dimforge/rapier3d-compat` (`chunkSizeWarningLimit` trong `client/vite.config.ts`). Khi tối ưu tải trang: dùng `@dimforge/rapier3d` (file `.wasm` riêng) hoặc tách chunk vendor để cache.
- Đồ họa SPEC §14: cascaded shadow map (hiện 1 hộp bóng 160 m đi theo camera, chưa snap theo texel nên mép bóng hơi rung), mặt trời thật + ngày–đêm (hiện cố định buổi chiều), bầu trời động, bloom, SMAA, cài đặt đồ họa. SPEC không gán phase riêng; làm cùng phase này.
- LOD cho nhà (ban công, ống khói dựng ở mọi khoảng cách; cửa sổ chỉ vẽ trên texture), cây (140 tam giác/cây) và đồ phố; lượng tử hóa + Meshopt.
- Giải phóng bản sao geometry trên CPU sau khi upload lên GPU.
- `docs/DEPLOY.md` (hướng dẫn cho người không chuyên) + `npm run deploy`.
- Đo số request / dòng ghi SQLite thực tế so với ngân sách ở SPEC §3.

## Khác
- npm 11 cảnh báo `allowScripts` cho script cài đặt của `esbuild`, `workerd`, `fsevents`. Hiện vẫn chạy được vì binary lấy từ optional dependency; nếu bản npm sau chặn hẳn thì duyệt bằng `npm install-scripts approve`.
