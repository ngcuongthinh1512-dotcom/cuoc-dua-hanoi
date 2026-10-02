# Phase 8: kiểm đối kháng Track C (thẻ HUD)

Ngày 2026-10-02. Đối tượng: worktree `.claude/worktrees/wf_4133df99-060-3`, nhánh `phase8-track-C`, commit `846aa4a` (gốc `0818033`). Đối chiếu với `docs/plans/phase8.md` (§3 D9 và D15, §5.3, §6 Track C, §8) và báo cáo `docs/reports/phase8-track-c.md`. Tôi không sửa mã. Ảnh chụp và các script dò nằm ngoài repo.

**Kết luận: ĐẠT.** Không có lỗi chặn. Có 2 mục "nên sửa" trước khi ghép, cả hai đều rẻ, cùng một họ lỗi: chuột đã được thả tự do khi thẻ mở nhưng một số chỗ trên thẻ chưa tính đến điều đó.

## 1. Đã chạy thật

| Lệnh | Kết quả |
|---|---|
| `client: npx vitest run` | 65 file, **663/663 qua** (`card.test.ts` 30 test mới) |
| `npx vitest run --dir scripts` | 50/50 qua |
| `npm run build` (gốc worktree) | qua: tsc scripts + client + `wrangler deploy --dry-run` |
| `HUD_CHECK_PORT=5207 npx tsx scripts/hud-check.ts` (Chrome thật) | 43/43 ok, 0 lỗi console |
| `SCREENSHOT_PORT=5177 npm run screenshot -- p8` | 13 preset chụp được, không lỗi console; đã xem từng PNG |
| Script dò riêng (`hudtest.html` và trang game ngoại tuyến, Chrome headless, 1024×640 / 1280×720) | kết quả ở §4 |

Sau khi chạy, không còn tiến trình `vite`, `workerd` hay `wrangler` nào.

## 2. Phạm vi file (`git diff --stat 0818033..HEAD`)

Gồm 13 file. File thuộc track C: `race/ui/{RaceHud.ts, format.ts, format.test.ts, card.test.ts (mới), race.css}`, khối `raceHud` trong `config.ts` (chỉ khối này) và khối preset `[C]` trong `scripts/screenshot.ts`.

File ngoài danh sách sở hữu (§6, §8). Cả bốn đã được ghi trong báo cáo track, không cái nào nguy hiểm:
- `client/src/main.ts` (file của B): xóa 1 dòng `task: …race?.task…`. Bắt buộc phải xóa, vì C đã bỏ `RaceHudActions.task`, giữ lại thì build đỏ. Khối `new RaceHud({…})` là chỗ B cũng sẽ sửa, nên dễ xung đột khi ghép. Người tích hợp ghép tay.
- `client/src/core/Input.ts`: thêm `export` cho `looksLikeIme`. D15 yêu cầu dùng lại hàm này nên hợp lệ.
- File mới, chỉ dùng khi dev: `client/hudtest.html`, `client/src/hudtest.ts`, `scripts/hud-check.ts`. `hudtest.html` không vào bản build vì `vite.config` chỉ có `index` và `host`. Script này chưa có trong `package.json` và `CLAUDE.md`, nên người tích hợp cần ghi thêm.
- `scripts/screenshot.ts`: ngoài khối `[C]`, C còn sửa dòng lọc lượt chụp mặc định (thêm `p8`). Đúng §7, nhưng đây là dòng dùng chung. Nếu B hoặc E cũng sửa dòng này thì sẽ xung đột.

## 3. Đối chiếu "Việc" và "Test bắt buộc"

Các mục **đã đủ** (kiểm bằng mã, test và Chrome thật):
- Ô gõ:
  - `maxLength = NET.answerMax` (200).
  - Tự focus khi thẻ mở.
  - Enter gửi chữ đã `trim`. Không gửi khi `isComposing`, khi keyCode 229, khi key là "Process", hay khi Unikey gửi ký tự không kèm `code`.
  - Space, phím số và các phím game (M, F, R, C, V, N) gõ thành chữ, không kích hoạt hành động game. Kiểm trên trang game thật: gõ `mfrcvn` thì giá trị ô là "mfrcvn", bản đồ không mở.
  - Esc lần đầu bỏ focus, lần hai đóng thẻ.
  - Bản nháp giữ qua lần vẽ lại.
- Lịch sử câu trả lời: mới nhất trên đầu, tối đa `NET.answerHistory`. Số phút phạt lấy từ `card.retryPenaltyMinutes` ("Bị phạt 0,1 phút"), không gắn cứng 3.
- "Đang chờ Host duyệt · mm:ss" đếm lên. Đếm ngược `retry` và `switch` hiện ở cả hai chỗ: giữa màn hình (`penaltyEl`, theo `lockLine ?? penaltyLine`) và trên thẻ. Thẻ tự lật sang trạng thái mới sau `lockedUntil + 1 s`.
- Các nút theo trạng thái:
  - "Nhận thử thách [Enter]".
  - Thẻ proof: hướng dẫn, mã bài nộp, nút Copy, link `contactUrl` (`_blank`, `noopener`, chỉ nhận `http(s)`), nút "Tôi đã gửi bài" (gửi `answer ''`).
  - Lựa chọn kép: hai nút Chọn [1]/[2]; dòng "Đang làm nhánh X"; nút "Đổi lựa chọn kép" hỏi `confirm` (nội dung có số phút, tên nhánh, chữ "mất tiến độ"). Nút Đổi **ẩn** ở `choose`, `pending`, `switchLocked` và **hiện** ở `goToBranch`, `active`, `locked`.
- Media: hình qua `resolveMedia`, có ô giữ chỗ khi trả về `null`, bấm để xem lớn. Link mở tab mới, nhãn mặc định là hostname. Loại bỏ URL `javascript:` và tên `r2:` sai mẫu.
- Sổ mật thư chỉ đọc: không lịch sử, không ô gõ, không nút hành động, **kể cả mục ghim**. Vẫn có mã bài nộp, nhánh đã chọn, "Đã đổi nhánh n lần", hình và link.
- Các hàm và tham số khác: `onOpenChange` (gọi true rồi false), `openCurrent()`, dòng trạng thái trên thẻ rút gọn, `demo(q)` đủ mọi `?card=`, `?book=media`, `?lock=`.
- Đủ 10 preset bắt buộc, cộng thêm 3 preset (`-locked-full`, `-proof`, `-teaser`).
- Test bắt buộc §6 đều có và đủ mạnh, tức là test sẽ đỏ nếu logic sai: `lockLine` (retry / switch / null / đã qua), `answerLines` (0,1 phút), `pendingLine`, `branchConfirmText`, `mediaViews`, `submitCode`, `choose` không có Đổi, `pending` không ô gõ không Đổi, `locked` có Đổi, Sổ không có `answers`, `hudKey` với IME, `summarize` không lộ trường lạ.

Các lệch kế hoạch đã ghi trong báo cáo track, tôi chấp nhận:
- `answerLines(card)` không nhận `now`.
- `mediaViews(items)` nhận mảng thay vì cả thẻ.
- Dùng `NET.answer*` thay cho `raceHud.answerMax` / `historyMax`.
- Sổ không có nút hành động.
- Nút "Tôi đã gửi bài" không có phím tắt.

## 4. Thử phá

| # | Kịch bản | Kết quả |
|---|---|---|
| P1 | Thẻ `locked` (5 s): đóng thẻ, chờ hết giờ, rồi `openCurrent()` | Lúc đóng: thẻ rút gọn hiện "Phạt: còn 00:02", giữa màn hình cũng vậy. Sau `lockedUntil + slack`: cả hai ẩn. Mở lại thì có ô gõ và ô gõ được focus. **Đúng** |
| P1b | Mở lại giữa lúc đếm ngược (còn 40 s) | "Phạt: còn 00:40 trước khi trả lời lại". **Đúng** |
| P4 | Gắn `referenceAnswers`, `answers`, `hostNote`, `note` lên thẻ, lên task và lên câu trả lời | `innerText` không chứa chuỗi nào trong số đó. **Không lộ** |
| P6 | Ô gõ chỉ có dấu cách rồi Enter | Không gửi gì. **Đúng** |
| P8 | Câu trả lời 200 ký tự liền không dấu cách | Chữ xuống dòng, không tràn ngang (`scrollWidth` = `clientWidth`). **Đúng** |
| P7 | Thẻ proof cao (hình, link, lịch sử, nhánh mờ, nút Đổi) ở 1024×640 | Thẻ cuộn được (`max-height: 100%`); nút Đổi và nút Đóng tới được khi cuộn. **Đạt** |
| G2 | Trang game thật: gõ phím game trong ô | Không có hành động game nào chạy. **Đúng** |
| **P2 / G1** | Bấm chuột nút **Copy** rồi bấm **Tab** (trang game thật) | **Thẻ vẫn mở.** Xem S1 |
| **P3** | Bấm "Đổi lựa chọn kép", chọn Hủy, rồi bấm Space | **Hộp xác nhận hiện lại.** Cùng gốc với S1 |
| **G3** | Bấm chuột ra ngoài thẻ đang mở (trang game thật) | `document.pointerLockElement = CANVAS`: **chuột bị khóa lại trong khi thẻ vẫn mở.** Xem S2 |
| G1 / G2 | Esc đóng thẻ khi chuột tự do | Thẻ đóng **và Menu bật ra**. Thuộc phần B1 của track B (`main.ts`: `wasPressed('menu') && !input.locked → menu.open()`); C đã báo trong mục "Cho B". Ghi lại để người tích hợp kiểm |
| P5 | Gõ dở ở nhánh A, đổi sang B rồi mở hòm B | Bản nháp của A hiện trong ô gõ của B, vì cùng `step`. Nhỏ |

Ảnh chụp: tôi đã xem tất cả `p8-*`. Chữ rõ, màu theo loại bước, trạng thái phân biệt được: cam = chờ duyệt, đỏ = phạt, xanh = nhánh đã chọn, nhánh không chọn bị làm mờ. `p8-card-answer-small` (1024×640) gọn, không bị cắt. `p8-book-media` hiện hình, link và mã bài nộp, không có lịch sử. Một điểm yếu nhỏ: đếm ngược ở giữa màn hình dùng `penaltyEl` của Phase 7, chữ nhỏ và xám ở mép trên, không thật sự "giữa màn hình". Kế hoạch cho phép dùng lại như vậy, nhưng nó kém nổi hơn dòng đếm ngược đỏ trên thẻ.

## 5. Vấn đề

**S1 (nên sửa, C): Tab không đóng thẻ hay Sổ khi focus đang ở một nút hoặc link.**
- Cách tái hiện: sau khi bấm chuột vào Copy, link Messenger, "Về mật thư hiện tại", hay nút Đổi rồi chọn Hủy, nút đó giữ focus.
  - `Input.keydown` bỏ qua Tab trên control khi chuột tự do: dòng `!locked && NATIVE.has(code) && isControl(target)`. Vì vậy `main.ts` không bao giờ gọi `toggleBook`.
  - Bộ xử lý của RaceHud chỉ `preventDefault`, và chỉ đóng thẻ khi `typing`.
- Hậu quả: nhãn "Đóng (Tab)" sai. Space trên nút Đổi lại mở hộp xác nhận lần nữa (P3). Lối ra còn lại là Esc, mà Esc hiện đang bật Menu (việc của B).
- Cách sửa (1 dòng, `RaceHud.ts:136`): đóng thẻ khi `typing || e.target` khớp `button, a[href]`. Lý do: Input đã bỏ qua đúng các phím đó nên không bị đóng hai lần. Có thể kèm `blur()` control sau khi `act` bấm xong.

**S2 (nên sửa, C + B): bấm ra ngoài thẻ thì chuột bị khóa lại trong khi thẻ vẫn mở.**
- Nguyên nhân: `.rc-overlay` có `pointer-events: none` (từ Phase 7), nên cú bấm rơi xuống canvas, và `Input` gọi `lock()` khi canvas nhận click.
- Hậu quả: sau B1, thẻ mở thì chuột tự do; chỉ cần một cú bấm lệch là link, hình, Copy và nút Đổi không bấm được nữa. Esc sẽ nhả chuột, nhưng theo luật B1 thì không tự mở Menu, nên người chơi phải bấm Esc thêm lần nữa.
- Cách sửa: C cho `.rc-overlay:not([hidden])` có `pointer-events: auto` (nền mờ nuốt cú bấm; nếu muốn thì bấm nền = đóng). Hoặc B bỏ qua `canvas click` khi `raceHud.open`. Người tích hợp chọn một trong hai.

Các mục nhỏ:
1. Có hai tham số cùng nghĩa: `raceHud.lockFlipSlackMs` (C) và `raceClient.lockEndSlackMs` (B, chưa có). Nếu lệch nhau thì thẻ lật và lần gửi lại vị trí không còn cùng thời điểm. Nên dùng chung một số.
2. `hud-check.ts` (43 kiểm DOM với phím thật) không nằm trong `npm test` hay `npm run …`. Mọi lỗi nối dây DOM chỉ được bắt khi có người chạy tay. Nên thêm script `hud-check` và ghi vào `CLAUDE.md`.
3. Thẻ rút gọn chưa bấm được bằng chuột (D15: "thẻ rút gọn cũng là nút bấm"). Phím Enter là đủ, nên mục này chỉ là thiếu nhỏ.
4. Thẻ mới tự focus vào ô gõ. Nếu thẻ bật ra lúc người chơi đang giữ W (Thử thách 1 được duyệt, mật thư Thử thách 2 tới ngay), phím lặp sẽ gõ "wwww" vào ô. Chấp nhận được; có thể chỉ tự focus khi thẻ mở bằng Enter hoặc F.
5. Bản nháp đi theo `step` chứ không theo `step|branch` (P5).
6. Bấm Enter trong ô gõ thì gửi luôn, không khóa nút trong `taskLockSeconds` như khi bấm nút "Gửi". Ô đã bị xóa sau khi gửi nên không gửi trùng được.
7. `branchConfirmText` in "0 phút" nếu server không gửi `switchPenaltyMinutes`. Track A phải luôn gửi trường này (C đã ghi trong mục "Cho A").
8. Hình chưa có thuộc tính `loading=lazy`. Không ảnh hưởng, vì blob đã được tải bằng `fetch` khi vẽ thẻ và được nhớ theo tên trong `urls`.

## 6. Cho người tích hợp

- Ghép `main.ts` bằng tay (dòng `task:` mà cả B và C cùng xóa). Giữ một dòng lọc `p8` trong `screenshot.ts`.
- Sửa S1 và S2 (C, hoặc người tích hợp, mỗi mục 1 dòng).
- Kiểm tay sau khi có B1:
  - Esc đóng thẻ mà Menu không bật.
  - Bấm ra ngoài thẻ thì chuột không bị khóa lại.
  - Tab đóng thẻ sau khi đã bấm Copy.
  - Enter mở lại thẻ (thẻ rút gọn đang ghi "Enter: mở thẻ").
- Thêm `hud-check` vào `package.json` và `CLAUDE.md`. Ghi trang dev `hudtest.html` vào danh sách trang dev.
