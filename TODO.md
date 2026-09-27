# Việc còn để lại

Những phần tạm (placeholder) hoặc hoãn sang phase sau. Làm xong thì xóa dòng tương ứng.

## Phase 1 – Khung client
- Thay trang tạm "đang xây dựng" (`client/src/main.ts`) bằng game Three.js + Rapier.
- Tạo `client/src/config.ts`: tham số đồ họa, bảng phím theo `KeyboardEvent.code` (SPEC §17); bbox thì re-export `RACE_BBOX` từ `@race/shared` (không chép lại).
- Chọn phím chào/vẫy tay và bấm còi (chữ cái chưa dùng, SPEC §17.1–17.2) rồi ghi tên phím vào `docs/RACE_RULES.md` mục 2.
- Thêm preset camera (top-down, người chơi) vào `scripts/screenshot.ts` qua query string; xác nhận canvas WebGL render được trong Chrome headless (cờ swiftshader đã bật sẵn).

## Phase 2 – Bản đồ
- `scripts/fetch-osm.ts`, `scripts/fetch-dem.ts` và lệnh `npm run fetch-map`.
- Kiểm tra tọa độ các điểm của chặng demo bằng centroid polygon OSM (SPEC §10.1), ưu tiên OSM nếu lệch.

## Phase 4 – Di chuyển
- `npm run build-graph` → `shared/data/roadgraph.json`.

## Phase 6 – Server & presence
- Thay `RaceRoom` tạm (chỉ có `SELECT 1`) bằng room thật: WebSocket, SQLite, Alarms; bỏ endpoint thử `/api/room/ping` và room cố định `"dev"`, định tuyến mỗi cuộc đua vào Durable Object riêng.
- Đăng nhập mã đội / Host, token ký HMAC bằng `HOST_PASSWORD`.
- Test Durable Object bằng `@cloudflare/vitest-pool-workers` (kiểm tra tương thích với Vitest 5 trước khi cài; hiện `worker/src/legs.test.ts` chạy trong môi trường Node vì chỉ kiểm tra dữ liệu).
- Kết hợp Vite HMR với Worker/DO khi dev. Hai hướng: Vite proxy `/api` (và WebSocket) sang `wrangler dev`, hoặc dùng `@cloudflare/vite-plugin` 1.60.2. Hiện tại `npm run dev:worker` phải build lại client mỗi lần chạy.

## Phase 7 – Race engine lõi
- Schema zod cho file chặng trong `/shared`; Worker import `worker/legs/paris-demo.json` để nạp lần đầu vào SQLite (hiện mới chỉ test import file này).
- Quyết định thời gian Host tạm dừng có bị trừ khỏi thời gian chính thức không (SPEC §13.3 nói đồng hồ dừng, công thức §13.8 không trừ), rồi cập nhật `docs/RACE_RULES.md` mục 11.

## Phase 11 – Test toàn trình
- `npm run sim` (bot mô phỏng), `worker/legs/test/paris-demo.filled.json`, `worker/legs/test/specials.json`.

## Phase 12 – Deploy
- `docs/DEPLOY.md` (hướng dẫn cho người không chuyên) + `npm run deploy`.
- Đo số request / dòng ghi SQLite thực tế so với ngân sách ở SPEC §3.

## Khác
- npm 11 cảnh báo `allowScripts` cho script cài đặt của `esbuild`, `workerd`, `fsevents`. Hiện vẫn chạy được vì binary lấy từ optional dependency; nếu bản npm sau chặn hẳn thì duyệt bằng `npm install-scripts approve`.
