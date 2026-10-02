# Phase 8 – phản biện độ đầy đủ của kế hoạch (`docs/plans/phase8.md`, 2026-10-02)

Người kiểm: critic độ đầy đủ (không sửa code, không sửa SPEC). Đối chiếu từng dòng kế hoạch với SPEC §3, §8.4–8.11, §11, §13.4, §13.6, §17.9–17.16, `docs/reports/phase8-schema-gaps.md` (mục 1–14), TODO.md mục Phase 7/8, HANDOFF.md và phạm vi do điều phối viên nêu. Không đọc `~/Documents/chang-that/`.

**Kết luận: SỬA LẠI (revise)** – 1 chỗ chặn, 6 chỗ nên sửa, 8 chỗ nhỏ. Phần lớn yêu cầu của người dùng đã có mặt (gõ đáp án trong game + Host duyệt / phạt / ghi chú / đáp án tham khảo chỉ Host; đếm ngược 3 / 10 phút cùng một cơ chế không cần alarm; hai nút nhánh, hòm theo nhánh, đề bài trong hòm, "Đổi lựa chọn kép" + hộp xác nhận; cảnh báo kẹt 45 phút; media R2 có kiểm quyền; 14 khoảng trống schema đều có luật). Các chỗ thiếu bên dưới đều là chỗ **người chơi / Host thấy trực tiếp** hoặc trái với quyết định đã chốt.

## Bảng kiểm nhanh (yêu cầu → chỗ trong kế hoạch)

| Yêu cầu gốc | Nguồn | Kế hoạch | Đánh giá |
|---|---|---|---|
| Gõ đáp án trong game, Host duyệt tay, Duyệt / Phạt, ô ghi chú, đáp án tham khảo chỉ Host | §17.14 | D5, D10, D16, `referenceAnswers` D2 | ✓ |
| Phạt = đếm ngược 3 phút (cấu hình) trước khi trả lời lại | §17.14, gap 3 | D5 `penalties.retryLockMinutes`, D9 | ✓ |
| Thử thách 1 → Thử thách 2 ngay khi duyệt | §17.14 | D5 `complete` (Phase 7 sẵn) | ✓ |
| Mọi câu trả lời được lưu (đội, bước, nội dung, giờ, quyết định, ghi chú) | §17.14, gap 7 | D4 `answers` JSON + `host_note` | ✓ |
| Lịch sử **chỉ trên thẻ thử thách, không vào Sổ mật thư**, chỉ của đội mình | §17.14 | D15 vẽ lịch sử ở **mục ghim trong Sổ** (Q8) | ✗ trái quyết định, xem S1 |
| Gõ được ở bất kỳ đâu sau khi thử thách bắt đầu | gap 6 (quyết định) | D8 | ✓ (hệ quả bãi xe chưa xét: S3) |
| Hai nút chọn nhánh; chỉ hòm nhánh đã chọn hiện (150 m) | §17.16, gap 13 | D6, D7, `boxesOf` theo nhánh | ✓ |
| Đề bài nhánh nằm trong hòm, chỉ gửi khi mở hòm | §17.16, gap 8 | D6 `open{branch}`, D3 | ✓ |
| "Đổi lựa chọn kép": hộp xác nhận ghi rõ phạt, hòm cũ biến mất, mất tiến độ, phạt 10 phút đếm ngược, hết mới hiện hòm kia; không đổi khi chờ duyệt; mỗi lần đổi một lần phạt; đồng hồ đua chạy | §17.16 | D6, D9, D15, Q3, Q5 | ✓ (D6 thêm từ chối khi `locked` ngoài §17.16: M1) |
| Nhánh bằng ảnh gửi Messenger, Host duyệt §8.9 | §17.16 | D5 `input:'proof'`, nút "Tôi đã gửi bài" | ✓ nhưng bỏ **mã bài nộp** §8.9 (2): S4 |
| Cảnh báo Host đội kẹt > 45 phút, lặp mỗi chu kỳ, chu kỳ cấu hình | §17.14, gap 4 | D11, `hostAlerts.stuckMinutes` | ✓ (đội chưa "Nhận thử thách" / chưa chọn nhánh không được báo: M6) |
| Link bấm được + hình trên thẻ và Sổ; hình trên R2 riêng tư, chỉ đội đã mở | §17.14, §17.16, §3, gap 5/14 | D12–D15 | DOM có, nhưng **chuột đang bị khóa** khi thẻ mở → không bấm được: B1 |
| Schema gap 1, 2, 3, 9, 10, 11, 12 | schema-gaps | D2 luật 1–9, D17 | ✓ |
| Không làm: mini-game §11, tự chấm (tùy chọn), watermark, Phase 9/10 | phạm vi 6 | §1 "Không", §11 | ✓ |
| Mặc định chờ xác nhận ghi rõ | phạm vi 7 | §1, §12 | ✓ |
| Báo cáo ghi sớm | quy tắc chung | `phase8-plan.md` đã có | ✓ |

## Phát hiện

### B1 (CHẶN) – Thẻ mở ra khi chuột vẫn bị khóa: link / hình / nút không bấm được, `confirm()` làm Menu bật lên
- **Yêu cầu gốc:** §17.14 "Mật thư có thể kèm liên kết … hiện trên thẻ mật thư và trong Sổ mật thư"; phạm vi mục 4 "liên kết bấm được và hình"; §17.16 "có hộp xác nhận ghi rõ 'phạt 10 phút' trước khi đổi".
- **Chỗ thiếu:** Thẻ đầy đủ / Sổ là overlay DOM nhưng **không nhả pointer lock** (`RaceHud.ts:107` ghi rõ "pointer lock sends wheel + mouse to the canvas: keys scroll the book"; Phase 7 chỉ bấm nút bằng phím Enter / 1 / 2). Với chuột khóa: `<a target=_blank>` (D15), "bấm mở lớn" hình, nút "Đổi lựa chọn kép", nút "Mở Facebook", ô gõ bằng chuột đều không bấm được. Người chơi bấm `Esc` để nhả chuột thì `main.ts:398–410` **tự mở Menu** chồng lên thẻ (chỉ bản đồ `M` được miễn). `window.confirm()` (D15) cũng làm trình duyệt thoát pointer lock → Menu bật lên ngay sau hộp xác nhận. Kế hoạch §10 chỉ nêu rủi ro "RaceHud keydown bắt Space / số" và giao C; **không track nào sở hữu việc nhả chuột**.
- **Đề xuất:** Track B (`main.ts`): khi `raceHud.open` chuyển true → `document.exitPointerLock()` và miễn tự mở Menu như `fullMap` (một cờ `cardReleased` giống `unlockedAt`); đóng thẻ → khóa chuột lại trong chính sự kiện bấm (như "Tiếp tục" của Menu). Giữ phím Enter / 1 / 2 làm đường tắt. Thêm vào kiểm tay của B: bấm link mở tab mới, bấm hình mở lớn, bấm "Đổi" → confirm → không có Menu. Nếu không muốn nhả chuột: thay `confirm()` bằng hai nút trong thẻ có phím [Y]/[N] và bỏ chữ "liên kết bấm được" khỏi tài liệu – nhưng như vậy trái yêu cầu.

### S1 (NÊN) – Lịch sử câu trả lời nằm trong Sổ mật thư (mục ghim), trái quyết định đã chốt
- **Yêu cầu gốc:** §17.14 (chốt 2026-10-02): "chỉ trên thẻ thử thách (**không đưa vào Sổ mật thư**)".
- **Chỗ thiếu:** D15 "vì mục ghim trong Sổ chính là thẻ đầy đủ hiện tại nên lịch sử chỉ ở mục ghim (chấp nhận: 'trên thẻ')", Q8 mặc định như vậy. Nguyên nhân thật: sau khi đóng popup, cách duy nhất mở lại thẻ hiện tại là `Tab` (Sổ). Đây là đổi một quyết định rõ của người dùng thành mặc định.
- **Đề xuất:** Thêm cách mở lại **thẻ hiện tại ngoài Sổ** (ví dụ `Enter` khi không có thẻ nào mở, hoặc bấm vào thẻ rút gọn góc trên trái → `openFull(view.card)`); `detail(card, entry, …)` khi `entry != null` (mọi mục của Sổ, kể cả ghim) **không vẽ `answers`**. Nếu muốn giữ cách của D15 thì phải hỏi người dùng **trước** khi làm, không để thành mặc định.

### S2 (NÊN) – Vào vùng nhánh **không chọn** vẫn ghi `arrived_at` và đưa xe vào bãi nhánh đó
- **Yêu cầu gốc:** §17.16 "chỉ hòm của nhánh đã chọn mới hiện"; §6.4 / Phase 7 D18 "xe vào bãi của điểm đội **đang đứng**"; §8.4 tiến độ theo nhánh đã chọn.
- **Chỗ thiếu:** `steps.ts placesOf()` cho detour trả **cả hai** vùng nhánh; `settle()` → `arrive()` đánh `arrived_at` + hiệu ứng `park` khi vào vùng bất kỳ nhánh nào. Phase 7 chấp nhận được vì "chọn nhánh" = đứng trong vùng; Phase 8 chọn bằng nút nên đội chọn Lửa đi ngang vùng Nước sẽ bị **đưa xe vào bãi của Nước** và Host thấy "Tới điểm" sai. D6 giữ nguyên `placesOf` ("`BikeService` / vùng cấm NPC / `leg:check` … không đổi").
- **Đề xuất:** `placesOf` detour = **vùng nhánh đã chọn** (chưa chọn → rỗng). Test thuần: pose trong vùng B khi `branch = A` → không hiệu ứng; sau `branch(B)` → `arrive` + `park` đúng rack B.

### S3 (NÊN) – Host duyệt khi đội ở xa / đang đạp xe: `complete` vẫn phát `park` ở điểm thử thách
- **Yêu cầu gốc:** gap 6 (quyết định): gõ ở bất kỳ đâu, kể cả "khi đội đang đi tìm"; D8 "đang ngồi xe vẫn được"; §6.4 xe vào bãi **nơi đội đứng**.
- **Chỗ thiếu:** D5 `approve` → `complete(i, …)` → `parksOnReceive` (bước kế là thử thách tại chỗ – đúng kịch bản T1 → T2 của chặng thật – hoặc lộ trình đi bộ) → `park` ở rack vùng thử thách. `BikeService.park` (`BikeService.ts:183`) **bỏ chủ và dời xe** bất kể đội đang ngồi trên xe cách đó 500 m → xe biến mất dưới chân đội đúng lúc nhận mật thư kế. Kế hoạch không nhắc.
- **Đề xuất:** Khi hoàn thành do `review` (và `auto` đúng từ xa): chỉ phát `park` nếu `io.pose(team)` nằm trong vùng đó (engine đã có `io.pose`), ngược lại bỏ. Harness: bot đạp xe xa 300 m, Host duyệt → xe vẫn của bot. Ghi `RACE_RULES.md` §3 "Bãi xe": "trả lời từ xa thì xe không vào bãi".

### S4 (NÊN) – Bỏ **mã bài nộp** của nhiệm vụ gửi ảnh mà không nói
- **Yêu cầu gốc:** SPEC §8.9 (2) "Thẻ nhiệm vụ hiện mã bài nộp duy nhất (ví dụ `XANH-T2-1042`, có nút Copy)", §8.11 "mã bài nộp (có nút Copy)", §13.4 "mỗi mục hiện … mã bài nộp"; §17.16 giữ "§8.9" cho nhánh ảnh. `RACE_RULES.md` §7 (2) và §8 hiện **hứa với người chơi** có mã này.
- **Chỗ thiếu:** D15 `input:'proof'` chỉ có hướng dẫn + nút mở Messenger + nút "Tôi đã gửi bài"; D16 hàng chờ không có mã; §11 "Để sang phase sau" cũng không ghi. Host nhận ảnh qua Messenger từ nhiều đội cùng lúc cần biết bài của đội nào / nhánh nào.
- **Đề xuất:** Rẻ: chuỗi `<tên đội>-<bước>[-<nhánh>]` (không cần số ngẫu nhiên, không cần nút Copy nếu B1 chưa nhả chuột) in trên thẻ `proof`, trong Sổ và trong mục hàng chờ Host; hoặc **quyết định bỏ** và track D xóa khỏi `RACE_RULES.md` + ghi TODO. Không được im lặng.

### S5 (NÊN) – Danh sách tài liệu phải sửa còn thiếu các câu đang hứa sai với người chơi
- **Yêu cầu gốc:** CLAUDE.md "Never silently drop a requirement"; phạm vi "thiếu cập nhật tài liệu".
- **Chỗ thiếu (track D chưa được giao từng dòng):** `RACE_RULES.md` §7 (7) "Host bấm Chưa đạt: bạn thấy lý do" (Q2 mặc định **không** gửi ghi chú); §8 "Mục Lựa chọn kép hiện cả 2 nhánh" (trái §17.16 đề bài trong hòm); §8 "mã bài nộp kèm nút Copy" (S4); §4 "hộp mật thư cắm cờ vàng–đỏ" (§17.15 đã đổi, Phase 7 để lại); §12 "vào lại bạn sẽ thấy 'Bạn có 1 mật thư mới'" (`Login.ts:63` ghi chưa làm; Phase 8 là lúc kịch bản này xảy ra thật – xem M7); §5 "Thử thách … Bỏ qua được bằng bỏ cuộc" (Phase 9, ghi rõ "chưa có"). `LEG_FORMAT.md` §7.1 `media` "lưu file trên R2 làm ở Phase 10", §13 "bot 'Hoàn thành (tạm)'", §5.2 `teaser` "phase 8 dùng". `HANDOFF.md` dòng 15 "Phase 8 … không đổi schema chặng hay `step_progress`" (đã khác).
- **Đề xuất:** Ghi từng dòng trên vào Track D (§6) và mục người tích hợp (§8) để không phải tìm lại khi ghép.

### S6 (NÊN) – Hộp xác nhận / nút đổi nhánh / lịch sử dùng chữ "3 phút" cố định
- **Yêu cầu gốc:** §17.14 "Số … là cấu hình"; CLAUDE.md "All tunables in config or the leg config".
- **Chỗ thiếu:** D15 lịch sử in "Bị phạt 3 phút"; `ClueCard` (§5.1) có `switchPenaltyMinutes` nhưng **không có phút khóa phạt** (`task.retryLockMinutes ?? penalties.retryLockMinutes`), nên C không có số để in; chặng test đặt 0.1 phút sẽ in sai.
- **Đề xuất:** Thêm `retryPenaltyMinutes` vào `ClueCard` (cạnh `switchPenaltyMinutes`) hoặc in "Bị phạt" + thời điểm từ `AnswerView`; test `answerLines` với số phút từ thẻ.

### M1 (NHỎ) – Từ chối đổi nhánh khi đang bị khóa phạt 3 phút (`locked`) là luật thêm ngoài §17.16
- §17.16 chỉ loại trừ "đang chờ Host duyệt bài". D6 còn từ chối ở `locked` (`branchLocked`). Đơn giản hơn và đúng chữ: cho đổi, `locked_until = now + 10 phút` thay khóa cũ (ít nhánh code hơn). Nếu giữ, ghi vào §12 làm mặc định chờ xác nhận.

### M2 (NHỎ) – Nút "Duyệt khi đội chưa bấm 'Tôi đã gửi bài'" (Q14) không có chỗ trên trang Host
- D5 cho `approve` không `id` với `input:'proof'` ở `active` / `locked`, nhưng D16 chỉ đặt nút trong ô `pending` và hàng chờ. Host không biết ô nào là nhiệm vụ ảnh (`HostState.leg.steps` không có cờ). Đề xuất: `leg.steps[].proof: boolean` (+ `branches[].proof`) và nút "Duyệt (đã nhận ảnh)" trong ô `active` của bước / nhánh `proof`; test `progressTable`.

### M3 (NHỎ) – Kiểm thử còn thiếu
- Hai đội: `race` / `book` của đội B không chứa câu trả lời của đội A (cardOf theo dòng nên tự đúng, nhưng chưa có test khẳng định như yêu cầu §17.14).
- `host.review` gửi từ socket đội → bị bỏ qua / đóng (RaceRoom phải kiểm `a.role === HOST` như `host.race`; D19 chỉ nói hình dạng).
- `answer` / `branch` / `accept` khi `lobby` / `paused` → notice, **0 dòng ghi** (D24 nêu, chưa có test).
- Pose trong vùng nhánh không chọn → không `arrive` / `park` (sau S2).
- Ô gõ với IME tiếng Việt (macOS Telex, Unikey): `Enter` khi `e.isComposing` **không** gửi (dùng lại `looksLikeIme` của `core/Input.ts:15`); test thuần cho hàm lọc phím của C.
- Sau khi hết khóa đổi nhánh mà đội **đứng im và không gửi được vị trí** (client cũ / mất mạng đúng lúc) → nối lại → `welcome.boxes` có hòm B khi trong 40 m (D25 mới có evict giữa `locked`, chưa có kịch bản này).

### M4 (NHỎ) – `[CHƯA NHẬP` chưa phủ hết chỗ giữ chỗ
- D2 luật 3 liệt kê `label, clue, name, title, description, summary, teaser, proofInstruction`. Thiếu `start.name`, từng mục của `answers` / `referenceAnswers` (ví dụ `["[CHƯA NHẬP đáp án]"]`), `hostApproval.contactUrl`, `media[].label`. Thêm vào cùng vòng lặp.

### M5 (NHỎ) – `race` view mang toàn bộ `answers` của bước, không giới hạn
- `auto` sai 30 câu / phút × 2 giờ = 3 600 mục ≈ 300 KB mỗi tin `race`. Cột SQLite vẫn lưu đủ, nhưng `cardOf` nên cắt còn `historyMax` mục mới nhất (hằng ở server, cùng số với `raceHud.historyMax`) – một dòng `slice(-N)`.

### M6 (NHỎ) – Cảnh báo kẹt bỏ qua đội chưa bắt đầu
- D11 tính từ `task_started_at` / `branch_opened_at`. Đội giữ thẻ thử thách có `teaser` mà 45 phút chưa bấm "Nhận thử thách", hoặc đội detour ở `choose` / `goToBranch` 45 phút, **không bao giờ** được báo dù Host cần biết. §17.14 nói "tính từ lúc đội bắt đầu thử thách" nên đây là mặc định hợp lý, nhưng nên ghi vào §12 hoặc dùng `openedAt` làm mốc dự phòng khi hai mốc kia null (1 dòng).

### M7 (NHỎ) – "Bạn có 1 mật thư mới" khi vào lại (SPEC §8.10) nay thành kịch bản thật
- Host duyệt lúc đội offline → đội vào lại. `RaceHud.setView` tự mở thẻ mới (khóa `seenKey` khác) nên đội vẫn thấy mật thư; chỉ màn "Chào mừng trở lại" không nói. Rẻ nhất: track D sửa câu trong `RACE_RULES.md` §12 thành "mật thư mới tự mở khi vào lại"; hoặc A thêm `newClue: boolean` vào `summary()` (`clue_opened_at` của bước hiện tại > `lastSeen`).

### M8 (NHỎ) – Hai toast liền khi duyệt
- D5 gửi `notice approved` + `notice clueNew` → hai toast "Host đã duyệt!" và "Mật thư mới đã vào Sổ mật thư". SPEC §8.9 (6) là **một** câu: "Host đã duyệt! Mật thư mới đã vào Sổ mật thư." Gộp: khi `approved` thì không gửi `clueNew` (hoặc chữ của `approved` chứa cả hai).

## Những chỗ đã đối chiếu và thấy đủ (không cần sửa)
- Không gửi đội: đáp án, `referenceAnswers`, ghi chú Host, câu đội khác, đề bài nhánh chưa mở, tọa độ hòm nhánh chưa chọn / đang khóa, media chưa mở (D3, D13; test `JSON.stringify` mọi thẻ).
- SQLite trước khi trả lời, dựng lại sau evict (D4, D25); không bảng mới, không alarm, ngân sách §9 trong hạn (< 40 000 request, < 20 000 dòng).
- Đếm ngược không cần timer server; client gửi lại một vị trí khi hết khóa để `checkBoxes` chạy (D9) – đúng với vòng tick ngủ 10 s (`RaceRoom.ts:452–460`).
- `Input.ts:116` đã bỏ qua phím khi focus trong ô gõ (M / G / R / C không bị cướp); chỉ còn handler riêng của `RaceHud` phải lọc (C đã có việc này).
- `leg:check`: 9 luật mới + quét static asset gồm `referenceAnswers`; `sim` có Host bot duyệt / phạt / đổi nhánh; Host có hàng chờ, ma trận ô cam / khóa / nhánh, cột "Bù giờ chờ duyệt", tải hình, cảnh báo kẹt.
- Mặc định chờ xác nhận (§12: 14 câu) khớp phạm vi mục 7.
