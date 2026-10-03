# Phase 10 – báo cáo tích hợp (công cụ Host, thu hẹp)

Trạng thái: **đã ghép, đã kiểm** (2026-10-03). Chưa có commit `feat(phase10)` (còn review).

## Ghép
- `merge(phase10): track S …` (fe726f8), `merge(phase10): track H …` (3a3b1a6), `merge(phase10): track C …` (6c8df5f): **không xung đột** (ba track chạm tệp rời nhau; `scripts/hud-check.ts` của track C giữ nguyên).
- Sau mỗi merge: worker 172 test qua (sau S); client 771 test qua (sau H + C).

## Sửa tích hợp (`fix(phase10): ghép …`)
1. **Thẻ cũ bật lại sau Hoàn tác không có hiệu ứng phong bì** (người dùng đã duyệt): `RaceHud.setView` gọi `openFull(card, animate)` với `animate = !(was && card.receivedAt < was.receivedAt)`. Kiểm: `scripts/hud-check.ts` (DOM thật) thêm `.rc-env` có khi Duyệt bật thẻ mới, không có khi Hoàn tác đưa thẻ cũ về (thẻ mới đang mở hoặc đã đóng).
2. **Hợp đồng trang Host ↔ máy chủ thật** (`worker/src/RaceRoom.phase10.test.ts`, describe "Phase 10 Host page ↔ server"): test workerd nhập chính các hàm của trang Host (`client/src/host/hostView.ts`): nút Duyệt / Phạt / Cho qua lấy từ `progressTable` → `reviewMessage`; dòng Hoàn tác `undoRows` → `undoMessage` (đội nhận `reviewUndone` + thẻ cũ chờ duyệt); "Xóa cờ" từ `teamRows` → `{t:'host.flag', op:'clear'}` (đúng literal của `main.ts`); `fetchExport` (Authorization Bearer) trên route thật: token sai → lỗi, CSV + JSON đúng tên tệp.
3. **Xuất dữ liệu bỏ IP người chơi**: `worker/src/race/export.ts` bỏ khóa `ip` khỏi `data` của mọi sự kiện (sự kiện `login` vẫn còn, không có IP). Test thuần (`export.test.ts`) + test workerd (không còn `"ip"` / `"local"` trong CSV, JSON).
4. **Tệp CSV mở được**: test workerd đọc CSV thật bằng bộ tách RFC 4180: BOM UTF-8, chỉ CRLF, 3 bảng có tiêu đề, mỗi bảng mọi dòng cùng số cột với hàng tiêu đề; JSON đủ `teams` / `steps` (L1, T1, L2) / `events` (login, review, host.undo).

## Docs
RACE_RULES (vừa rời đi 10 phút, Hoàn tác 10 giây, Cho qua, cờ đỏ + Xóa cờ, bảng thời gian sau cuộc đua), CLAUDE.md (route export + export.ts, host.review undo, host.flag, ZoneList, trang Host Phase 10, preset p10-*), README (mục Host duyệt bài), TODO.md (mục Phase 10; xóa các dòng Phase 10 cũ; khóa nhiều Host + soạn chặng bản đồ BỎ theo §17.24), HANDOFF.

## Kiểm
- `npm run build` xanh (tsc 4 gói + vite + `wrangler deploy --dry-run`); `grep ZodError client/dist` = 0.
- `npm test`: scripts 113, shared 79, client 771, worker 175 = **1138 qua, 0 bỏ qua** (gps.test.ts không chập chờn lần này).
- `scripts/hud-check.ts` (cổng 5432): mọi mục `ok`, kể cả 3 kiểm phong bì mới; không lỗi console.
- `npm run ride-check`: OK (lần 1 bị `alarm` 900 s cắt khi máy tải ~21, dọn tiến trình của mình rồi chạy lại: qua).
- `npm run sim -- --leg louvre --bots 3 --speedup 2`: 3 / 3 về đích (1 bị loại, đúng luật đội cuối), ≈ 35 643 request / 20 đội × 2 giờ (< 40 000), 37 dòng / đội.
- Ảnh (SCREENSHOT_PORT=5431, đã xem): `p10-host` (1280: Chờ duyệt mở, dải Hoàn tác, ma trận cuộn ngang với cột "Đội" ghim, cờ ⚑ + "Xóa cờ", "Cho qua"), `p10-host-1024` (khung gập, cột ghim), `p7-host` (không vỡ), `p10c-zone` (ba loại dòng, dòng "vừa rời đi 3 phút trước" mờ).

## Để reviewer
- "Cho qua" hiện cả khi đội ở trạng thái teaser (chưa "Nhận thử thách"); máy chủ từ chối → Host thấy thông báo (báo cáo track H).
- Ma trận 1280 px cuộn hết sang phải: các cột Hạng / Phạt / Về đích (trái) chạy dưới cột "Đội" ghim (đúng thiết kế, ghi lại để xem).
