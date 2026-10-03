# Phase 10 – Track H (trang Host)

Trạng thái: **xong** (2026-10-03, nhánh `phase10-track-H`, gốc main `de3fc0e`; chưa ghép). Hợp đồng: `docs/plans/phase10.md` V1–V3, V5, §3.3, §4.3, §6; `docs/reports/phase10-foundation.md`; SPEC §17.24, §17.25 (bổ sung).

## Đã làm
1. **Ghim (V1)**: ma trận nằm trong `.matrix-wrap` (max-height 72vh, overflow auto, cuộn hai chiều); `<thead>` + `th` dính trên, cột "Đội" dính trái, ô góc z-index 3 > tiêu đề 2 > cột 1; viền thay bằng box-shadow (viền gộp trôi mất dưới ô dính). Vị trí cuộn được giữ khi bảng dựng lại (mỗi câu trả lời mới làm dựng lại, trước đây ném Host về góc trên trái). "Chờ duyệt" = `<details open>` + `<summary>`; nút "Bật thông báo" là anh em của `<details>` (CSS đặt đè lên hàng summary; dưới 640 px thì xuống dòng riêng). Bảng "Các đội" bọc `.scroll` + `.pin` (có thêm cột Cờ, ở 1024 px cuộn ngang được).
2. **Hoàn tác (V2)**: `undoRows(state, now)` (mới nhất trước, `secondsLeft = ceil((until − now)/1000)`, hết hạn thì biến mất dù máy chủ chưa gửi state mới), `undoMessage` = `reviewMessage(team, step, 'undo', id, '')`. Dải `.undo-bar` NGOÀI `<details>`, nằm trong khung dính; dựng lại chỉ khi tập mục đổi, chữ đếm ngược ghi tại chỗ.
3. **Cờ (V3)**: `flagText` → "Vượt tốc · Dịch chuyển lạ · lúc 14:05:09 (7 phút trước)" (thứ tự lý do theo máy chủ, không lặp, giờ theo `leg.timezone`; không rõ lý do = "Cờ đỏ"); cột "Cờ" + nút "Xóa cờ" (confirm) → `{t:'host.flag', op:'clear', team}`; "⚑" ở cột Đội của ma trận (`ProgressRow.flagged`).
4. **Cho qua (V5)**: mọi thử thách (`challenge`) và nhánh Lựa chọn kép đã mở hòm ở ô active / locked: `approve` không `id`, luôn có confirm; không hiện khi đang chờ duyệt (Duyệt / Phạt), route, Pit Stop, ô xong / chưa tới. Louvre giữ chữ xác nhận riêng.
5. **Xuất dữ liệu thời gian (§17.25)**: nút cạnh "Kết thúc"; `fetchExport` GET `/api/race/<race>/export?format=csv|json` với `Authorization: Bearer` (token không ở URL), giữ Blob để không mất BOM; tải cả hai tệp `race-<id>-thoi-gian.csv/.json` hoặc không tệp nào; trạng thái "Đang tải… / lỗi / Đã tải"; confirm "Cuộc đua chưa kết thúc, dữ liệu có thể chưa đủ" khi chưa `finished`; lỗi 401 / 403 / ≥500 / mạng đứt / thân bị ngắt có chữ Việt. `?demo=1`: CSV/JSON mẫu tạo ở client (`demoExportText`, không có đáp án).
6. **Sửa thêm nhỏ**: "Các đội", bảng/nút xe được dựng lại mỗi giây nên cú bấm rơi đúng lúc dựng lại bị mất (nhất là "Xóa cờ"): `render()` hoãn phần đó tối đa 1,5 s khi chuột đang nhấn (`pressedAt`).
7. Demo: Đội Vàng có cờ hai lý do (jump, respawn) để ảnh có cả cờ một và hai lý do. Móc DEV chỉ cho ảnh: `?undoLeft=<s>`, `?collapsed=1`, `?matrixScroll=<x|max>,<y>`.

## Kiểm
- `hostView.test.ts`: 41 → 61 test (undoRows đếm ngược / hết hạn / thứ tự, flagText chữ + thứ tự + múi giờ, Cho qua mọi kiểu + chỗ không có, CSS dính + z-index + main.ts dùng đúng lớp, xuất: tên tệp, header token, BOM, 401/403/500/mạng/ngắt, confirm, mẫu demo). 3 test cũ cập nhật cho nút Cho qua và `flagged`.
- `npm run build` xanh; `npm test`: scripts 113, shared 79, client 763 (một test thời gian `gps.test.ts` hỏng vì máy tải, chạy riêng qua 10/10), worker 154.
- Ảnh (đã xem): `screenshots/p10-host.png` (1280, khung mở, cuộn phải: cột Đội + tiêu đề còn thấy, dải Hoàn tác, cờ, Xuất dữ liệu, Cho qua), `screenshots/p10-host-1024.png` (1024, khung gập chỉ còn "Chờ duyệt (2)").

## Lệch / lưu ý cho ghép
- `scripts/screenshot.ts`: ngoài khối p10 còn thêm `p10` vào regex loại preset khỏi lần chạy mặc định (một token). Dải Hoàn tác trong ảnh ghi "còn 603 s" vì `undoLeft=600` (chỉ để ảnh không hết hạn).
- Ở 1280 px dữ liệu demo gần như vừa khung; cuộn dọc / ngang chưa tự kiểm bằng script DOM riêng, chỉ qua ảnh 1024 và test CSS. Cần kiểm tay ở bảng nhiều bước thật.
- Cho qua hiện cả khi đội chưa "Nhận thử thách" (trạng thái teaser): trang không biết có teaser không; nếu máy chủ (S) từ chối ở teaser, Host thấy notice. Nên cho S nới `teaser` nếu muốn "đẩy đội khi có bug" đủ rộng.
- Tới khi S ghép: `undo` / `host.flag` trả `host.notice` "chưa hỗ trợ"; route `/export` chưa có (nút báo lỗi 404 "Máy chủ trả lỗi 404.").
- Kiểm tay còn lại: `<details>` + nút ngoài summary trên Chrome / Firefox / Safari, tải hai tệp liên tiếp (Chrome có thể hỏi "tải nhiều tệp" lần đầu), mở CSV bằng Excel (dấu phẩy so với máy vi-VN dùng `;` – tuỳ định dạng máy chủ S).
