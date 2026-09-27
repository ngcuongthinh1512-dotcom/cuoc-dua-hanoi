# Việc còn để lại

Những phần tạm (placeholder) hoặc hoãn sang phase sau. Làm xong thì xóa dòng tương ứng.

## Phase 2 – Bản đồ
- Bước xử lý dữ liệu: đọc OSM thô trong `.cache/osm/` (ô 500 m + `global.json`), gộp trùng theo id (way cắt mép ô có mặt ở nhiều ô), cắt thành chunk 250 × 250 m gọn nhẹ trong `client/public/data/chunks/` + `index.json`, mỗi file ≤ 25 MB. Lệch SPEC §4.3 (SPEC ghi lưu thẳng vào `chunks/`): JSON Overpass thô quá lớn, chưa xử lý, không hợp làm static asset.
- DEM AWS terrarium (~30 m) chỉ thấy lòng sông là một rãnh thoải (mặt nước ~28,5 m, bờ ~33–36 m tại cầu Alexandre III), không có tường kè và đường dạo ven sông thấp hơn 6–8 m (SPEC §4.3). Phải khoét lòng sông và bậc kè từ hình học OSM (`natural=water`, `barrier=retaining_wall`, `man_made=embankment|quay`, đường `Port …` / `Voie Georges-Pompidou` ở tầng thấp).
- Cân nhắc DEM IGN RGE ALTI 1 m / 5 m (Pháp, giấy phép mở Etalab) thay AWS terrarium nếu cần địa hình chính xác hơn. Chưa đổi nguồn: chờ quyết định.
- Dựng footprint tháp Eiffel (`building=tower`) thành 4 chân, không đùn khối đặc; kim tự tháp Louvre dựng hình chóp (SPEC §17.4).
- Thay thế giới tạm `client/src/world/DevScene.ts` (mặt đất lưới, viền bbox, obelisk, hộp rơi) bằng chunk OSM; chỉnh lại `near` / `far` / fog trong `client/src/config.ts` cho phố thật (nếu depth buffer bị z-fighting ở xa thì cân nhắc logarithmic/reversed depth).
- Tường vô hình ở biên bbox + cảnh báo "Bạn đang rời khu vực đua" (SPEC §4.1); hiện chỉ có dải đỏ đánh dấu.
- Bảng debug F3: thêm số chunk (SPEC §14).

## Phase 3 – Nhân vật & camera
- Tạo `client/src/core/EventBus.ts` khi có module thật sự cần (Phase 1 chưa có nên chưa tạo).
- `core/Time` (SPEC §3) hiện nằm trong `GameLoop` (delta khung hình đã kẹp, FPS); tách `client/src/core/Time.ts` khi có module khác cần đồng hồ game.
- Nội suy vị trí giữa hai bước vật lý khi render (alpha = accumulator / fixedDt) nếu nhân vật bị giật; hiện render trạng thái vật lý mới nhất.
- Gamepad: gán nút cho nhảy, tương tác, menu, sổ mật thư…; hiện chỉ có stick và LT/RT/LB/RB cho camera bay (chưa có bay nhanh / đổi tốc độ bằng tay cầm). Tay cầm không có mapping `standard` (một số tay trên Firefox) hiện bị bỏ qua.

## Phase 4 – Di chuyển
- `npm run build-graph` → `shared/data/roadgraph.json`.

## Phase 5 – HUD
- Menu thật (SPEC §17.2: tự mở khi chuột bị nhả, `Esc`); hiện chỉ hiện bảng hướng dẫn phím.

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

## Phase 12 – Deploy
- Bundle client ~4,9 MB (gzip ~1,8 MB), phần lớn là WASM nhúng base64 của `@dimforge/rapier3d-compat` (`chunkSizeWarningLimit` trong `client/vite.config.ts`). Khi tối ưu tải trang: dùng `@dimforge/rapier3d` (file `.wasm` riêng) hoặc tách chunk vendor để cache.
- Đồ họa SPEC §14: cascaded shadow map (hiện 1 shadow map cố định 160 m quanh gốc tọa độ), bầu trời động/ngày–đêm, bloom, SMAA, cài đặt đồ họa. SPEC không gán phase riêng; làm cùng phase này.
- `docs/DEPLOY.md` (hướng dẫn cho người không chuyên) + `npm run deploy`.
- Đo số request / dòng ghi SQLite thực tế so với ngân sách ở SPEC §3.

## Khác
- npm 11 cảnh báo `allowScripts` cho script cài đặt của `esbuild`, `workerd`, `fsevents`. Hiện vẫn chạy được vì binary lấy từ optional dependency; nếu bản npm sau chặn hẳn thì duyệt bằng `npm install-scripts approve`.
