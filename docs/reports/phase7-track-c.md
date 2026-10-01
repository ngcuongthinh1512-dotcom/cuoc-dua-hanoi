# Phase 7 – Track C: giao diện cuộc đua trên HUD

Trạng thái: **xong** (build + test qua; ride-check mặc định OK; 10 preset `p7-*` đã chụp và xem PNG).

## Đã làm
- `client/src/race/ui/format.ts` (thuần, có test): `summarize` (thẻ theo loại + nhãn phương tiện), `bookEntries` (thẻ hiện tại ghim đầu, còn lại theo thứ tự nhận; giờ nhận / xong / thời gian làm bước; không lộ số bước), `StartOrderBanner` (đúng `raceHud.startOrderSeconds` giây mô phỏng, chỉ một lần), `finishLine` (câu NPC D10, có / không thời gian), `penaltyLine`, `zoneLines`, `TYPE_STYLE` (vàng / xanh dương / đỏ cam / xanh lá, D22).
- `client/src/race/ui/RaceHud.ts` + `race.css`: thẻ nhiệm vụ góc trên trái (icon + màu loại bước, nhãn, tóm tắt, icon xe đạp / đi bộ), thẻ đầy đủ khi mật thư mới (phong bì mở bằng CSS), Sổ mật thư (nút "Về mật thư hiện tại"), banner "Xuất phát ở vị trí thứ n" (bên phải, 15 s rồi mờ), dòng phạt chờ, "Bấm F để mở hộp mật thư" (`inZone`), câu NPC sau check-in, bảng "Tại điểm này".
- Nút "Hoàn thành (tạm)" (có ghi chú là tạm; Lựa chọn kép: một nút mỗi nhánh) → `actions.task(step, branch)`; khóa nút 2 s sau mỗi lần bấm.
- `client/src/ui/HUD.ts`: `formatClock(null)` = "--:--"; đồng hồ đọc `frame.raceTime` (undefined = offline: giờ mô phỏng); hàng "PHẠT +n phút" khi `penaltyMinutes > 0`. DEV offline: `?raceTime=--|<giây>&penalty=<phút>` (chỉ khi `frame.raceTime === undefined`, nên không ảnh hưởng cuộc đua thật).
- config `raceHud` (thêm màu, kích thước, `finishSeconds`, `taskLockSeconds`); `screenshot.ts` dòng [C].

## Bàn phím / chuột
Con trỏ bị khóa trong game nên nút bấm bằng phím: `Enter` = "Hoàn thành (tạm)" (1 nhánh), `1` / `2` = nhánh A / B, `Tab` đóng (main.ts đã nối `toggleBook`; panel chỉ `preventDefault` Tab để không mất focus), `Esc` / `Space` đóng thẻ đầy đủ. Chuột dùng được khi con trỏ đã nhả.
Thẻ đầy đủ chỉ mở một lần cho mỗi mật thư (khóa `bước@receivedAt` lưu trong `localStorage` `race.lastCard`, bọc try/catch): tải lại trang giữa chặng không mở lại.

## Chạy kiểm tra
- `npm test` (có `client/src/race/ui/format.test.ts`, `HUD.test.ts`), `npm run build`.
- `SCREENSHOT_PORT=5403 npm run screenshot -- p7` → `p7-card`, `p7-card-detour`, `p7-card-challenge`, `p7-card-full`, `p7-book`, `p7-start-order`, `p7-finish`, `p7-pit`, `p7-clock`, `p7-zone`. Dữ liệu giả = chữ "minh họa" trong `RaceHud.demo()` (không phải nội dung chặng thật). Query: `?card=route|walk|detour|challenge|pit`, `&full`, `&book`, `&startOrder=n`, `&finish`, `&zone`, `&checkin=<giây chờ>`, `&penalty=`, `&raceTime=`.

## Người tích hợp cần biết
- `RaceHud.open` = thẻ đầy đủ hoặc Sổ mật thư đang mở (main.ts `modal()` đã dùng). Panel `z-index: 0` dưới menu (z 1).
- **Đề nghị cho main.ts (track B / tích hợp)**: khi `raceHud.open` thì `onPointerLockChange` không nên tự `menu.open()` và `Esc` nên đóng panel trước menu; muốn bấm chuột vào nút thì gọi `document.exitPointerLock()` khi mở panel (giống bản đồ lớn). Hiện chưa cần: phím đã đủ dùng.
- Track B cần gọi: `raceHud.finished(team, officialMs)` khi `finishAt` mới; `raceHud.update({…, inZone})` với `inZone` thật.
- Số liệu `HudFrame.raceTime` do `RaceClient.raceTime()` cấp (foundation đã nối).
- Giờ trong Sổ mật thư theo múi giờ trình duyệt (ponytail trong `formatTimeOfDay`).
- Banner chỉ hiện ở lần `startOrder()` đầu tiên của trang; B/server chỉ gọi khi `showStartOrder`.
