# Phase 8 – Sửa lỗi review, nhóm F2 (client HUD / chuột)

Ngày 2026-10-02, HEAD `2df2fec` (chưa commit, người điều phối commit). Trạng thái: XONG.

Phạm vi: speccode R-1, R-2, R-3, R-10; e2e#0, e2e#1; visual#1, #2 (preset media-offline), #5, #6, #7.
File đã sửa: `client/src/race/ui/RaceHud.ts`, `client/src/race/ui/format.ts` (chỉ chú thích), `client/src/race/ui/race.css`,
`client/src/main.ts`, `client/src/ui/Toasts.ts`, `client/src/ui/Toasts.test.ts`, `scripts/hud-check.ts`, `scripts/screenshot.ts` (dòng `p8-media-offline`).

## Đã sửa

1. **R-1 Tab / Space sau khi bấm nút / liên kết trong thẻ.**
   - `RaceHud`: Tab đóng thẻ / Sổ ở MỌI chỗ (ô gõ, nút, liên kết, nền trang) ngay trong trình xử lý phím của RaceHud → `onOpenChange(false)` khóa chuột trong chính sự kiện phím (Firefox chỉ cho khóa ở đó). `main.ts` chỉ còn MỞ Sổ bằng Tab (`!cardClosed`: phím Tab vừa đóng thẻ không mở lại Sổ); bỏ nhánh `input.lock()` riêng cho Tab trong keydown.
   - Bấm chuột vào nút / liên kết trong thẻ → `blur()` ngay sau đó (một listener trên overlay, sau handler của nút, kể cả sau `confirm()`): Space / Enter quay về phím của thẻ (Space đóng thẻ), không bấm lại "Đổi lựa chọn kép" sau khi Hủy.
2. **R-2 Thẻ đóng trên bản đồ M / menu.** `main.ts`: `relock()` = khóa chỉ khi không còn gì cần chuột (`!modal()`), dùng cho `onOpenChange(false)` và cho M đóng bản đồ khi thẻ còn mở trên đó (cùng loại lỗi: trước đây M khóa chuột dưới thẻ). Keydown "khóa sớm cho Firefox" bỏ qua phím vừa đóng thẻ (`cardClosed`) và khi thẻ đang mở – trước đây Esc đóng thẻ trên bản đồ vẫn bị nhánh "Esc đóng bản đồ" khóa chuột dù bản đồ còn mở.
3. **R-3 Firefox Esc.** `onOpenChange(false)`: `help.hidden = input.locked || modal()` → khóa bị từ chối thì "Nhấp chuột để chơi" hiện lại; khóa được thì `onPointerLockChange` ẩn lại (cùng mẫu với Esc đóng bản đồ ở vòng lặp).
4. **R-10 Thẻ tự bật không cướp focus.** `focusBox` thay `blurred`: ô gõ chỉ tự focus khi thẻ mở bằng Enter (`openCurrent`), khi bấm Enter trên thẻ, hoặc khi người chơi bấm vào ô (sự kiện `focus`, giữ qua các lần vẽ lại). Thẻ tự bật (Host duyệt, mật thư mới, hòm nhánh) không nhận W / Space; Space trên thẻ tự bật đóng thẻ (RACE_RULES §4).
5. **e2e#0 Mở hòm nhánh (F) không phản hồi.** `setView`: `branchOpened` false → true cùng bước → bật thẻ đầy đủ (có phong bì) với đề bài nhánh.
6. **visual#1 Liên kết liên hệ.** `proofBox`: liên kết "Mở Facebook / Messenger gửi bài" hiện ở mọi trạng thái chưa xong (active / pending / locked) và trong Sổ; chỉ nút "Tôi đã gửi bài – chờ Host duyệt" đi theo `actions`.
7. **visual#2 + e2e#1 Hình R2.**
   - Thẻ demo `card=media-off` (`r2:demo-off.jpg`, bộ resolve demo trả null) + preset `p8-media-offline` trỏ vào → chụp được ô "Hình chỉ tải được trong cuộc đua".
   - Trong cuộc đua (có `resolveMedia`: `main.ts` chỉ truyền khi có phiên) hình null → "Hình chưa có – báo Host"; ngoại tuyến → "Hình chỉ tải được trong cuộc đua".
   - Tên hình lỗi được nhớ (`failed`): vẽ lại thẻ (tin `race`, đếm ngược lật) không hỏi lại Worker. Quên khi thẻ / Sổ được MỞ (thẻ mới = bước mới, hoặc Enter / Tab) – lệch nhẹ khỏi "tới khi thẻ đổi bước": để Host tải hình lên muộn thì đội mở lại thẻ là thấy, không cần F5. Một lượt hỏi cho mỗi lần mở, không phải mỗi lần vẽ.
   - Lỗi cũ tìm thấy khi viết test: vẽ lại thẻ có hình đã tải thì ô "Đang tải hình…" vẫn nằm trên hình (`show()` gọi `ph.remove()` trước khi `figure` được gắn). Sửa: gắn `figure` trước.
   - Lỗi cũ tìm thấy khi xem `p8-media-offline.png`: hình không tải được vẫn vẽ biểu tượng ảnh hỏng + chữ alt dưới ô chờ (`.rc-fig img { display: block }` thắng thuộc tính `hidden`). Sửa: `.rc-fig img[hidden] { display: none }`.
8. **visual#5, #6, #7.**
   - Ghi chú `goToBranch` ("Đang làm nhánh … – tới hòm nhánh để nhận đề bài · Đã đổi nhánh n lần") dùng khung `rc-timer info` (viền trái màu loại bước, chữ đậm). Bỏ CSS `.rc-note` không còn dùng.
   - Một từ "hòm mật thư": lời nhắc F "Bấm F để mở hòm mật thư"; toast `raceOver` / `boxFar` / `boxRiding` / `boxOpened`; chữ thẻ demo.
   - Đếm ngược: phần mm:ss trong `<b class="rc-num">` to 1,45 lần (chip giữa màn hình và dòng trên thẻ); chip giữa màn hình ẩn khi thẻ đầy đang mở cùng đếm ngược đó.

## Không sửa (ngoài nhóm F2, ghi lại cho người điều phối)
- `client/index.html` bảng phím: "<kbd>F</kbd> mở hộp mật thư / tương tác…" – người chơi thấy trong Menu → Phím điều khiển; không thuộc file của F2.
- `client/src/host/hostView.ts`: "không mở hộp hay làm nhiệm vụ", "chưa mở được hộp" – nhóm Host.

## Kiểm tra
- `npx tsc -p client --noEmit`, `npx tsc -p scripts --noEmit`: sạch.
- `npx vitest run client/src/race client/src/ui client/src/net`: 80 file / 609 test qua (thêm test `Toasts.test.ts` "một từ hòm mật thư").
- `HUD_CHECK_PORT=5222 npx tsx scripts/hud-check.ts`: 74 điều kiện qua (43 cũ, vài điều kiện cũ đổi theo hành vi mới: thẻ tự bật không focus → bấm Enter trước khi gõ; Space sau khi bấm Copy giờ ĐÓNG thẻ), 0 lỗi console. Phần mới chạy bằng phím / chuột thật:
  - hudtest: thẻ tự bật không focus + gõ W không vào ô; Enter / `openCurrent` focus; Tab đóng từ nền trang và sau khi bấm Copy; Space sau "Hủy" của "Đổi lựa chọn kép" không hỏi lại mà đóng thẻ; Space sau khi bấm liên kết liên hệ đóng thẻ; liên kết liên hệ ở pending / locked / Sổ, không có nút gửi; mở hòm nhánh bật thẻ có đề; "Hình chưa có – báo Host", vẽ lại không hỏi lại, mở lại hỏi một lần, ngoại tuyến "Hình chỉ tải được trong cuộc đua", hình lỗi không vẽ; ghi chú `rc-timer info`; chip giữa ẩn khi thẻ mở, chữ số `rc-num`; lời nhắc "Bấm F để mở hòm mật thư".
  - trang game thật (`/?player&npc=0&wait=1&card=answer&full&map` / `&menu`, `requestPointerLock` bị đếm và không cấp = như Firefox từ chối): Esc / Tab đóng thẻ trên bản đồ → bản đồ còn mở, 0 lần xin khóa; M dưới thẻ → bản đồ đóng, thẻ giữ chuột; Esc khi không còn gì → xin khóa 1 lần, "Nhấp chuột để chơi" hiện lại; Esc đóng thẻ trên menu → menu còn mở, 0 lần xin khóa.
- Đột biến (hoàn tác từng bản sửa bằng script trong scratchpad, chạy hud-check, khôi phục, md5 khớp): 17/17 bị bắt – Tab (R-1), blur nút (R-1), relock (R-2), help (R-3), focus popup (R-10), hòm nhánh (e2e#0), liên kết liên hệ (visual#1), nhớ hình lỗi (e2e#1), câu trong cuộc đua / ngoại tuyến, ô chờ thừa, hình hỏng, chip giữa, chữ số to, khung ghi chú, chặn khóa ở keydown main.ts, M dưới thẻ, lời nhắc F. Chữ toast: test Node.
- Chụp lại `SCREENSHOT_PORT=5221 npm run screenshot -- p8-card p8-book-media p8-media-offline` (14 PNG, thoát 0, không lỗi console), đã xem: `p8-card-answer-locked` (chip giữa chữ số to), `-locked-full` (chip ẩn, dòng trên thẻ chữ số to), `p8-card-detour-chosen` / `-locked` / `p8-card-proof` (khung viền xanh "Đang làm nhánh Tính – tới hòm nhánh…" / "Đã đổi nhánh 1 lần"), `p8-book-media` (Sổ có "Mở Facebook / Messenger gửi bài", không có nút gửi, chữ "hòm mật thư"), `p8-media-offline` (ô "Hình chỉ tải được trong cuộc đua", không còn ảnh hỏng), `p8-card-media`, `-answer`, `-answer-pending`, `-branch-task`, `-answer-small`: không vỡ bố cục.
- Không để tiến trình nào chạy (vite / chrome của hud-check và screenshot tắt cùng script).

## Ghi chú hành vi
- Thẻ tự bật có ô gõ: phải bấm Enter (hoặc nhấp vào ô) mới gõ được; Space trên thẻ tự bật đóng thẻ. Đúng RACE_RULES §4 (Space đóng thẻ); nếu muốn gợi ý trên ô ("Enter để gõ") thì thêm sau.
- Firefox: chưa kiểm tay trên Firefox thật (máy không có); trang game giả lập "khóa bị từ chối" bằng cách không cấp `requestPointerLock`.
