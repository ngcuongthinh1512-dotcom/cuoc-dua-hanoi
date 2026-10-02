# Phase 8 – Track C: thẻ thử thách / Lựa chọn kép trên HUD

Trạng thái: **xong** (2026-10-02, nhánh `phase8-track-C`, gốc `0818033`). Kế hoạch: `docs/plans/phase8.md` D15 + §6 Track C + điều chỉnh sau kiểm nền. Không đọc / không chép chặng thật; mọi dữ liệu demo là chữ giả. `npm run build && npm test` qua từ gốc worktree (client 663 test: 633 cũ + 30 mới; scripts 50, shared 57, worker 98).

## Thiết kế

- **Mô hình thẻ thuần** (`race/ui/format.ts`): `cardPanel(card, { now, teamName, mode: 'card' | 'book', live })` trả về mọi thứ một thẻ vẽ (lời dẫn, hình / link, các khối đề bài, ghi chú nhánh, dòng đếm, nút nào có, ô gõ, mã bài nộp, lịch sử). `RaceHud.detail()` chỉ vẽ lại mô hình này, nên "nút nào có ở trạng thái nào" và "Sổ không có lịch sử" test được trong Node (client không có jsdom).
- **Trạng thái hiển thị `liveStatus(card, now)`**: hết `lockedUntil` + `raceHud.lockFlipSlackMs` (1 s, D9) thẻ tự đổi `locked → active`, `switchLocked → goToBranch`, không chờ server. `RaceHud.update()` dựng lại thẻ đang mở đúng lúc đó, giữ chữ đang gõ, vị trí cuộn, focus.
- **Phím** (`hudKey(e, typing, bookOpen)`, thuần): trong ô gõ chỉ có `Enter` (gửi, **không** khi `looksLikeIme`: `isComposing` / keyCode 229 / key "Process" / ký tự đã chuyển của Unikey) và `Esc` (bỏ focus; lần hai mới đóng thẻ); `Space` / số / mũi tên là chữ. Ngoài ô gõ: `Esc` / `Space` (thẻ) đóng, `Enter` = nút chính (Nhận thử thách; không có thì quay lại ô gõ), `1` / `2` = Chọn nhánh. `Tab` trong ô gõ đóng thẻ (main.ts không thấy phím gõ trong ô). Nút / link đang focus (vừa bấm chuột) tự xử lý `Enter` / `Space`, không đóng thẻ.
- **Đồng hồ**: HUD đọc `serverNow` ở `update()` (ms; ngoại tuyến = 0). `demo()` cộng một độ lệch `clockOffset` để thẻ giả mang mốc giờ thật mà ảnh chụp đứng yên.
- **Hình**: `actions.resolveMedia(name)` (B) → blob URL; HUD nhớ URL đã tải theo tên (vẽ lại không nháy chỗ giữ chỗ), `null` → "Hình chỉ tải được trong cuộc đua"; bấm hình = xem lớn (Esc / Space / Enter / bấm = đóng hình, không đóng thẻ); link `https` mở tab mới (`rel="noopener noreferrer"`), `href` chỉ nhận `http(s)://`.

## Đã làm (file)

| File | Nội dung |
|---|---|
| `client/src/race/ui/format.ts` | `liveStatus`, `lockLeft`, `lockLine(view, now)` (retry / switch), `pendingLine` (đếm lên), `statusLine` (dòng trạng thái thẻ rút gọn), `timerLine`, `branchConfirmText`, `answerLines`, `mediaViews`, `cardPanel`, `hudKey`, `fmtMin` ("0,1"); `summarize` thêm `media` mỗi khối và nhánh đã chọn + đã mở hòm hiện `description` thay `summary` |
| `client/src/race/ui/RaceHud.ts` | vẽ thẻ theo `cardPanel`; ô gõ (`maxLength = NET.answerMax`, tự focus, giữ bản nháp qua vẽ lại / đóng mở cùng bước); nút "Gửi câu trả lời"; lịch sử (mới nhất trên); "Đang chờ Host duyệt · mm:ss"; đếm ngược trên thẻ + giữa màn hình (`penaltyEl`: `lockLine ?? penaltyLine`); "Nhận thử thách [Enter]"; thẻ proof (hướng dẫn, mã bài nộp + Copy, nút `contactUrl` tab mới, "Tôi đã gửi bài – chờ Host duyệt" = `answer ''`); detour: 2 nút "Chọn nhánh … [1]/[2]", ghi chú "Đang làm nhánh X – tới hòm nhánh để nhận đề bài · Đã đổi nhánh n lần", "Đổi lựa chọn kép" + `confirm(branchConfirmText)` (ẩn khi `pending` / `choose` / `switchLocked`, **có** khi `locked`), nhánh không chọn mờ ở cuối; media; Sổ mật thư chỉ đọc (hình / link / mã bài nộp, không lịch sử, không nút); thẻ rút gọn thêm dòng trạng thái + gợi ý "Enter: mở thẻ · Tab: Sổ mật thư"; `onOpenChange` gọi mỗi lần `open` đổi; `openCurrent()` mở lại không hoạt cảnh phong bì; `demo(q)` đủ `?card=answer|answer-pending|answer-locked|detour-choose|detour-chosen|detour-locked|branch-task|proof|teaser|media`, `?book=media`, `?lock=<s>`; **đã gỡ** `RaceHudActions.task` + nút "Hoàn thành (tạm)" |
| `client/src/race/ui/race.css` | kiểu cho ô gõ, lịch sử, dòng đếm, proof, hình / link / xem lớn, dòng trạng thái |
| `client/src/race/ui/card.test.ts` (mới) | 30 test thuần (xem dưới); `format.test.ts` chỉ sửa kỳ vọng `media: []` |
| `client/src/config.ts` | khối `raceHud` += `lockFlipSlackMs: 1000`, `mediaMaxHeight: 260` (giới hạn ô gõ / lịch sử lấy từ `NET.answerMax` / `NET.answerHistory`) |
| `scripts/screenshot.ts` | khối `p8-card-*` + `p8-book-media` + `VIEWPORT` cho `-small`; `p8-*` ra khỏi lượt chụp mặc định |
| `scripts/hud-check.ts` + `client/hudtest.html` + `client/src/hudtest.ts` (mới) | kiểm trong Chrome thật (43 điều kiện): trang trần `RaceHud` với action ghi lại, phím / chuột / hộp xác nhận thật. `npx tsx scripts/hud-check.ts` (`HUD_CHECK_PORT`), thoát 1 khi sai hoặc có lỗi console. Chỉ dev, không vào bản build |
| `client/src/core/Input.ts` | chỉ thêm `export` cho `looksLikeIme` (dùng lại, plan D15) |
| `client/src/main.ts` | **một dòng**: xóa `task: …race?.task…` trong `new RaceHud({…})` (không xóa thì `build` đỏ vì `RaceHudActions.task` đã bỏ); B cũng phải xóa dòng này khi bỏ `RaceClient.task` (cùng thay đổi → ghép sạch) |

### Test bắt buộc (`card.test.ts`)

`lockLine` (retry / switch / hết giờ + slack / không có / race kết thúc), `liveStatus` (lật thẻ), `statusLine` (4 dạng + rỗng), `timerLine`, `pendingLine` (đếm lên, làm tròn xuống, đồng hồ lệch → 00:00), `answerLines` (thứ tự, chữ trạng thái, **số phút từ `card.retryPenaltyMinutes`**: 0,1 → "Bị phạt 0,1 phút", 0 / thiếu → "Bị phạt", tối đa `NET.answerHistory`, "đã gửi bài"), `branchConfirmText` (10 phút / 0,2 phút, tên hai nhánh), `mediaViews` (https / r2 / nhãn mặc định = hostname, bỏ tên sai và `javascript:`), `submitCode` (`Đội Xanh-D1-A`, thử thách không có phần nhánh), **trạng thái nút theo thẻ** (teaser; active / pending / locked; choose không có "Đổi"; goToBranch có "Đổi" + ghi chú; switchLocked không nút; nhánh active có ô gõ + "Đổi", **pending không ô gõ không "Đổi"**, **locked có "Đổi"**; proof chỉ có nút gửi khi active, mã vẫn hiện khi pending / locked; liên kết liên hệ không `https` bị bỏ; done / `live: false` không nút), **Sổ không chứa `answers`** (JSON của mô hình không có chữ đáp án; mô hình `card` thì có), `summarize` / `cardPanel` không lộ trường lạ (`referenceAnswers`, `host_note` gắn lên object), `hudKey` (Enter khi `isComposing` / keyCode 229 / "Process" / Unikey → không gửi; Space / số / Esc trong ô gõ không cướp; Esc / Space / Enter / 1 / 2 ngoài ô gõ).

### Preset (`SCREENSHOT_PORT=5192`, xem PNG thật; 3 vòng chụp)

`p8-card-answer`, `p8-card-answer-pending`, `p8-card-answer-locked` (đếm ngược giữa màn hình + dòng trạng thái thẻ rút gọn), `p8-card-detour-choose`, `p8-card-detour-chosen`, `p8-card-detour-locked`, `p8-card-branch-task`, `p8-card-media`, `p8-book-media`, `p8-card-answer-small` (1024 × 640) + thêm `p8-card-answer-locked-full`, `p8-card-proof`, `p8-card-teaser`. Vòng 1 lộ lỗi: (a) preset thứ hai cùng bước không bật popup vì dấu `race.lastCard` của preset trước còn trong localStorage → `demo(full)` đặt `seenKey = ''`; (b) mã bài nộp trống tên đội ngoại tuyến → `demoTeam`; vòng 2 chỉnh bố cục (khối nhánh không chọn xuống cuối, kề nút "Đổi"). `p7-card-detour / p7-card-full / p7-book / p7-pit / p7-card-full-small` chụp lại: không hỏng (p7-card-full nay có ô gõ thay nút tạm).

## Lệch kế hoạch

1. **`answerLines(card)` không có tham số `now`** (§5.3 ghi `(card, now)`): giờ hiển thị là giờ của chính câu trả lời, không cần `now`.
2. **`mediaViews(items)` nhận mảng `MediaView[]`**, không nhận `card` (§5.3): thẻ có ba chỗ mang hình (thẻ, đề bài, đề bài nhánh); `summarize` gắn kết quả vào từng khối.
3. **Hàm gọi hình tên `actions.resolveMedia`** (đúng chữ ký nền), không `deps.media`.
4. **Có thêm** `cardPanel` / `liveStatus` / `timerLine` / `statusLine` / `hudKey` (mô hình thuần để test được trong Node), `raceHud.lockFlipSlackMs` (nằm khối của C; B có `raceClient.lockEndSlackMs` riêng cho việc gửi lại vị trí: giữ hai số cùng 1000), preset `-locked-full`, `-proof`, `-teaser`.
5. **Sổ chỉ đọc kể cả mục ghim**: không có nút hành động (Nhận / Chọn / Đổi / ô gõ) trong Sổ; muốn trả lời → đóng Sổ, bấm Enter (`keys.clueCard`, B nối) → thẻ hiện tại. Đúng chữ D15 (`detail(card, entry != null)` không vẽ `answers`) và rẻ hơn nhân đôi điều khiển.
6. **Nút "Tôi đã gửi bài" không có phím tắt** (khác Enter của "Nhận thử thách"): gửi nhầm sẽ bị Host phạt; chỉ bấm chuột (chuột đã nhả khi thẻ mở).
7. **`core/Input.ts` (+`export`) và `main.ts` (−1 dòng) và `scripts/screenshot.ts` (bộ lọc mặc định `p8`)** là ba chỗ ngoài thư mục `race/ui` phải chạm; xem bảng trên.

## Cho người tích hợp / track khác

- **B (`main.ts`)**: (1) `Esc` đóng thẻ xong thì cùng nhịp `menu` của Input vẫn thấy phím `Escape` và `!input.locked` → Menu bật: phải bỏ qua nhịp đó (B1). `RaceHud.close()` chạy trong `keydown` (trước khung tiếp theo), `onOpenChange(false)` gọi ngay trong sự kiện phím / bấm. (2) Phím `Tab` trong ô gõ do RaceHud tự đóng thẻ (Input bỏ phím trong ô gõ). (3) `Enter` (`keys.clueCard`) → `raceHud.openCurrent()` khi `!modal()`; gợi ý "Enter: mở thẻ" đã in trên thẻ rút gọn nên không có nút này thì dòng gợi ý sai. (4) `resolveMedia` chưa truyền: hình hiện "Hình chỉ tải được trong cuộc đua" cho tới khi B nối. (5) Xóa `RaceClient.task` + hai dòng `c.task(...)` trong `RaceClient.test.ts` + dòng `task:` trong `main.ts` (cùng dòng C đã xóa).
- **A (server)**: HUD chỉ cập nhật lịch sử khi nhận `race` mới: với `auto` trả lời sai nên gửi lại `race` (thẻ có `answers` mới) cùng `notice answerWrong`; thẻ `locked` / `switchLocked` phải mang `lockedUntil` + `lockKind`; `retryPenaltyMinutes` / `switchPenaltyMinutes` luôn có trên thẻ thử thách / detour (HUD in "Bị phạt n phút" và hộp xác nhận từ đó).
- **Hộp xác nhận** dùng `window.confirm`: đã kiểm trong Chrome (Playwright dialog); với B1 chuột đã nhả nên không có Menu.
- Kiểm tay còn lại (chưa làm được ở đây): Chrome + Firefox + Safari gõ tiếng Việt Telex / Unikey trong ô gõ, Enter xác nhận từ **không** gửi; nút Copy (clipboard cần https / localhost); bấm link mở tab mới, bấm hình xem lớn; thẻ mở → chuột tự do (cần B); Esc → Menu không chồng lên (cần B).
