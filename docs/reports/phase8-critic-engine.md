# Phase 8 – Critic engine / giao thức / quota

Đối chiếu `docs/plans/phase8.md` (2026-10-02) với mã hiện có: `worker/src/race/{steps,engine,tasks,ranking,leg}.ts`, `worker/src/RaceRoom.ts`, `worker/src/db.ts`, `worker/src/index.ts`, `worker/src/auth.ts`, `worker/src/test/harness.ts`, `shared/src/protocol/{types,codec,constants,reveal}.ts`, `shared/src/leg/{schema,check,zones}.ts`, `client/src/race/RaceClient.ts`, `client/src/net/ClueBoxes.ts`, `client/src/config.ts`; SPEC §3, §8, §13.4, §17.10, §17.14, §17.16; `docs/reports/phase8-schema-gaps.md`. Không đọc gì ngoài repo. Chỉ nêu phát hiện có bằng chứng (số dòng theo mã ở commit `c22c493`).

**Kết luận: sửa kế hoạch trước khi mở track** – 1 chặn (C1), 5 nên sửa (S1–S5), còn lại nhỏ. Hướng chung của kế hoạch (không alarm, không timer, SQLite trước ack qua `apply`, trạng thái tính từ dòng + `now`, media qua DO với 404) là đúng và tái dùng được mã Phase 7; các lỗi dưới đây đều là cạnh biên của mô hình "chọn nhánh trước, hòm theo nhánh" chưa được kéo hết vào máy trạng thái hiện có.

## Chặn

### C1. `placesOf` / `arrive` / `eligible` vẫn coi CẢ HAI nơi nhánh là "điểm của đội" → xe bị cất vào bãi nhánh KHÔNG chọn, `arrived_at` ghi sai, lộ nơi nhánh chưa chọn qua "Tại điểm này"
- **Vị trí trong kế hoạch:** D6 (chỉ nói `open{branch}` ghi `arrive` + `park` ở nhánh đã chọn), D8 ("`arrived_at` … vẫn ghi khi đội đi qua (vị trí)"), §5.2 `advance(...)` không đổi đường `pose`.
- **Bằng chứng:** `steps.ts:53-57` `placesOf` cho detour trả `s.branches.map(...)` (cả hai nhánh, `own = !!b.task.location`); `steps.ts:79-87` `arrive()` tìm `hit` trong `placesOf` → ghi `arrivedAt` và **`park` khi `hit.own`** (xe về bãi của nơi đó, SPEC §6.4: xe ở bãi có thể bị đội khác lấy); `steps.ts:94-97` `settle()` gọi `arrive` cho mọi pose. `engine.ts:409-421` `eligible()` thêm **cả hai** `branchZone(...).rack` của detour → đội đứng ở nơi nhánh chưa chọn nhận danh sách `zone` (`refreshZones` 424-456), tức máy chủ xác nhận nơi đó là điểm đua dù tên / tọa độ nhánh chưa hề gửi (D3).
- **Hệ quả thật:** đội chọn Lửa, đạp xe ngang nơi Nước (nhánh có `task.location` riêng) → `arrive` + `park` → xe rời tay đội vào bãi Nước; Host thấy "đã tới" ở bước Lựa chọn kép dù sai nhánh; cảnh báo kẹt / ma trận đọc `arrivedAt` sai. Lúc `switchLocked` cũng vậy.
- **Sửa:** `placesOf(leg, zones, i, branch)` – detour: `branch == null ? [] : [branchZone(leg, zones, i, branch)]` (`own` như cũ); `Progress.branch` đã có nên không thêm trường. `eligible()`: với detour chỉ `rack` của nhánh đã chọn (bước đã xong: nhánh đã làm = `row.branch`); bước detour chưa chọn → không thêm rack nào. Test thuần: pose vào vùng nhánh chưa chọn → không `arrive`, không `park`; pose vào vùng nhánh đã chọn → có.

## Nên sửa

### S1. Attachment `box` của socket không được xóa khi engine gửi `hide{branch}` → đổi A → B → A (không ghé B) thì hòm A **không bao giờ hiện lại** cho tới khi F5 hoặc đi ra ngoài 170 m
- **Vị trí:** D6 ("gửi `{t:'box', op:'hide', step, branch: X}`"), D7, §5.2 "attachment box key `${step}|${branch}`".
- **Bằng chứng:** `RaceRoom.ts:484-498` `checkBoxes`: `was = a.box === box.step` → `vis = boxVisible(was, d)` → **`if (vis === was) continue`**; attachment chỉ đổi trong `checkBoxes`. Engine gửi `hide` qua `io.send` (`engine.ts:121`, `apply` 385) – không chạm attachment. Kịch bản: chọn A → trong 150 m → attachment `D1|A`, reveal; đổi sang B (engine `hide D1|A`, attachment vẫn `D1|A`); đội không tới B (hoặc đi xa khi khóa – lúc `currentBox` null `checkBoxes` `continue` ở dòng 491, attachment không đổi); đổi lại A; hết khóa `currentBox` = A → `was` **true** → trong 170 m `vis === was` → không reveal. Đội vừa mất 20 phút phạt rồi đứng cạnh hòm vô hình.
- **Sửa:** thêm `RaceIO.hideBox(team, step, branch)`: RaceRoom gỡ `box: null` trên mọi socket của đội (`serializeAttachment`) rồi gửi `hide`; hoặc `checkBoxes` so `a.box` với khóa đầy đủ và coi mọi khóa khác `null` nhưng không bằng khóa hiện tại là "chưa thấy" (đã đúng) **và** engine trả về khóa phải xóa. Test harness: A → B → A đứng trong 40 m của A → nhận `reveal {branch:'A'}` sau khóa thứ hai.

### S2. `checkBoxes` sẽ **gỡ hòm nhánh đã mở** khi đội đi xa > 170 m (bước detour chưa xong nên hòm đã mở vẫn là `currentBox`), và kế hoạch dùng cùng một tin `hide{branch}` cho hai nghĩa
- **Vị trí:** D7 "`hide` có `branch` gỡ kể cả `opened`", D6 `currentBox` detour `opened = branch_opened_at != null`.
- **Bằng chứng:** `RaceRoom.ts:492-496`: `vis` false → gửi `hide` không xét `opened`; `reveal` gửi **`opened: false` gắn cứng**; `engine.ts:132` `welcome` cũng `opened: false`. Phase 7 không gặp vì hòm lộ trình mở xong là bước đổi (`currentBox` sang bước kế). Phase 8: sau `open{branch}` hòm vẫn là `currentBox` cho tới khi Host duyệt (có thể hàng chục phút; đội "trả lời ở bất kỳ đâu", D8) → đi xa → `hide {step, branch}` → client gỡ hòm đã mở (trái §17.10 "hộp đã mở vẫn hiện") → quay lại → reveal lại: nhấp nháy, và không phân biệt được với "đổi nhánh".
- **Sửa:** `checkBoxes`: `if (box.opened) continue` (hòm đã mở không bao giờ bị gỡ vì khoảng cách); `reveal` / `welcome` dùng `box.opened` thật; tin đổi nhánh dùng op riêng `{t:'box', op:'remove', step, branch}` (hoặc giữ `hide{branch}` nhưng chỉ engine gửi). Test: mở hòm nhánh, đi 200 m → không có `hide`; đổi nhánh → có `remove`.

### S3. `review()` không có `zones` / vị trí → `complete` do Host duyệt **mất hiệu ứng `park`** (SPEC §6.4) và bước kế không được `settle`
- **Vị trí:** §5.2 `review(leg, i, row, m, now): { row; effects: ({kind:'complete'} | …)[] }`; D5 approve "→ `complete` (mật thư kế, `clueNew`)".
- **Bằng chứng:** `steps.ts:88-92` helper `complete(i, at)` phát `park` qua `parksOnReceive` (59-66: mật thư kế là lộ trình đi bộ bắt buộc hoặc thử thách tại chỗ → xe về bãi của điểm đang đứng); `steps.ts:147-151` đường `task` Phase 7: `complete(i, place)` rồi `settle(...)` (ghi `arrive` bước kế ngay tại chỗ). `engine.ts:361-367` `apply` chỉ ghi `completed_at` / `clue_opened_at` từ hiệu ứng `complete`, không tự suy `park`. Với `review` tách rời, đội vừa được duyệt T1 mà mật thư kế là "Lộ trình đi bộ bắt buộc" vẫn giữ xe (luật §6.5 / §6.4 hỏng đúng ở chỗ Phase 7 đã làm).
- **Sửa:** `review` chỉ trả `{kind:'approve'}`; engine đưa nó vào `advance` như một `RaceInput` (`{kind:'approve', step}`) để dùng chung `complete()` + `settle(io.pose(team))`; hoặc `review(leg, zones, i, row, pose, m, now)`. Sau duyệt gọi `onPose(team, io.pose(team), now)` như `host.race start` làm (`engine.ts:177-180`). Test thuần: duyệt T1 khi bước kế là lộ trình đi bộ → có `park` với rack của điểm T1.

### S4. `NET.maxRaceOps = 30` / phút tính cả `checkin`, mà client gửi `race checkin` **mỗi 2 s** khi đứng trên thảm → đội thật ở vạch đích có thể bị đóng socket 4429
- **Vị trí:** D20 ("`Op` `'race'` … `book` không tính"), §5.1 `NET.maxRaceOps = 30`.
- **Bằng chứng:** `client/src/config.ts:1070-1075` `checkinEveryMs: 2000`; `RaceClient.ts:80-85` gửi `checkin` mỗi 2 s khi `due` (trên thảm, chưa về đích); `RaceRoom.ts:348-352` `count()` đếm cả op bị từ chối. Bị từ chối lặp là có thật: `boxFar` khi điểm tin cậy trễ sau client (`TrustedPoint`), `penaltyWait` khi đồng hồ client sớm hơn server (`checkinAt` ước lượng). 30 tin / 60 s = đúng ngưỡng, jitter mạng dồn hai tin là vượt.
- **Sửa:** không đếm `checkin` và `book` (chỉ `answer` / `accept` / `branch` / `open`), hoặc `maxRaceOps = 90`. Test harness: 40 `checkin` trong 60 s → socket còn.

### S5. Migration v3: kế hoạch "ALTER … `if (v < 3)`" nhưng DDL `CREATE TABLE IF NOT EXISTS step_progress (…)` tự tạo bảng với cột v2 và `v = 0` cho cả DB mới lẫn DB v1 → nếu ai cập nhật luôn cột mới vào `CREATE`, DB mới ném "duplicate column" **trong constructor** → DO chết với mọi request
- **Vị trí:** D4, §5.4.
- **Bằng chứng:** `db.ts:23-28` DDL bảng `step_progress` (danh sách cột v2); `db.ts:99-105` `migrate()` chạy DDL rồi đọc `v` (0 khi mới); `RaceRoom.ts:107` `migrate(this.sql)` trong constructor, không try/catch. Kế hoạch không nói "`CREATE` giữ nguyên cột v2".
- **Sửa:** ghi rõ trong D4: **`CREATE` giữ danh sách cột v2**, ALTER 4 cột khi `v < 3`; an toàn hơn: trước mỗi ALTER kiểm `PRAGMA table_info(step_progress)` (hoặc try/catch "duplicate column"). Test: `migrate` hai lần trên DB mới (idempotent) + trên fixture v2 có dữ liệu → đọc lại `answers = '[]'`.

## Nhỏ

### N1. Ước lượng dòng ghi của một lần Duyệt thiếu: 7 dòng, không phải 3
- **Vị trí:** D5 ("→ 1 dòng + sự kiện"), §9 ("duyệt 3", "quyết định 4 × (1 + 2)").
- **Bằng chứng:** `engine.ts:361-379`: `complete` ghi dòng bước hiện tại + dòng bước kế (`clue_opened_at`) + sự kiện `complete` (2) + `saveTeam` (1), cộng sự kiện `review` (2) = **7**. Chặng 10 bước ví dụ của §9: 3 lần duyệt → +12 dòng / đội, 20 đội ≈ +240 → tổng ≈ 10 200 < 20 000 (vẫn đạt). Sửa số trong §9; ngưỡng harness ≤ 160 vẫn hợp (mini ≈ 42 + ~37).

### N2. `onOp` trả `boxFar` / `taskFar` khi đội **chưa có vị trí tin cậy** → chặn luôn `answer` / `accept` / `branch` (D8 nói không cần vị trí)
- **Bằng chứng:** `engine.ts:158` `if (!at) return … notice boxFar`. Đội F5 rồi gõ ngay khi thẻ hiện (trước pose đầu) bị từ chối sai mã. **Sửa:** chỉ gác `!at` cho `open` / `checkin`; ghi rõ trong §5.2.

### N3. `taskState`: chưa ghi thứ tự ưu tiên và cách suy `lockKind`
- D5 bảng không nói `done` thắng mọi thứ (approve không `id` khi `locked` → `completed_at` set mà `locked_until > now`). Ghi: `done > pending > locked > active > teaser`; `lockKind = detour && branch_opened_at == null ? 'switch' : 'retry'` (không cần cột). Test: approve-không-id khi `locked` → thẻ `done`, `lockedUntil` null.

### N4. Host bấm nhầm "Phạt": không có cách cứu (Hoàn tác hoãn, §11)
- Rẻ: cho `approve(id)` chấp nhận câu **`penalized` mới nhất** (xóa `locked_until`, `complete`) – một nhánh `if` trong `review`, đủ cho ngày đua; vẫn ghi TODO Hoàn tác 10 s.

### N5. Test "JSON.stringify thẻ không chứa đáp án" sẽ báo sai với đáp án số
- `worker/legs/test/mini.json:51-53, 86-89` đáp án `"42"`, `"7"`, `"bảy"`: `"7"` nằm trong mọi `receivedAt` (ms). Dùng cùng luật `check.ts:198` (token `normalizeAnswer` ≥ 3 ký tự) hoặc so từng trường chữ, không so cả JSON.

### N6. `host.state` được đẩy **1 Hz suốt lúc có người di chuyển**, kéo theo `queue` + `progress[].answers`
- **Bằng chứng:** `RaceRoom.ts:431-443` `moved → soon → hostAt`; `464` push. Kích cỡ thật ≈ 8–40 KB/s mỗi tab Host (tin đi không tính request, chỉ tốn CPU / băng thông Host). Chấp nhận được; nếu làm luôn "chỉ gửi `answers` của bước chưa `done` + mục `queue`" thì khỏi ghi TODO (§9 cuối, §11).

### N7. Cảnh báo kẹt (D11) tính từ `branch_opened_at` → đội lang thang 60 phút ở `goToBranch` / `switchLocked` không bao giờ báo
- SPEC §17.14 "tính từ lúc đội bắt đầu thử thách". Sửa: với detour chưa mở hòm, tính từ `clue_opened_at` của bước detour (có sẵn trong `StepProgressView.openedAt`); với thử thách có `teaser` chưa bấm, cũng từ `openedAt`. Test thêm 2 ca.

### N8. Hết khóa: client tự đổi thẻ theo `serverNow` ước lượng → sớm 1–2 s thì `answer` bị `answerLocked` trong khi thẻ nói "active"
- D9. Vòng tick chạy 10 s sau pose gửi lại nên `reveal` hòm vẫn tới nếu lệch < 8 s (`NET.idleStopMs`, `boxCheckMs`) – không hỏng, chỉ cần ghi. Thêm 1 s slack cho chuyển thẻ phía client; nhận `answerLocked` thì vẽ lại từ `lockedUntil`.

### N9. Chồng tệp / phụ thuộc giữa track
- (a) D18 (track E) ghi `LEG_FORMAT.md §13` nhưng file thuộc D (§6) → E báo chữ trong report, D viết.
- (b) `harness.ts:106-111` `nearLeg()` destructure `mini.steps` theo **thứ tự** `[l1, t1, l2, d1, l3, ps]`, `nearPoint` gán "3 = L2 / D1 nhánh A, 4 = nhánh B"; nền đổi `mini` (nhánh A có nơi riêng) → A phải sửa `nearLeg` / `nearPoint` ngay ở nền; D sau đó **không đổi thứ tự / số bước** của `mini`. `scripts/leg-check.test.ts:52` còn kiểm `test/near.json` (file D, Phase 7) – cập nhật nhánh A có nơi riêng cho khớp luật 6 (vẫn chỉ warning nên "0 lỗi" không vỡ).
- (c) E "sim 3 bot chạy hết `mini` trong harness" cần máy chủ của A → chỉ chạy được khi ghép; ghi là test tích hợp, E tự kiểm `sim` bằng unit test thuần.
- (d) `config.ts` khối `clueBox` (mô hình hòm, quay theo `yaw` – `boxRotation`) chưa giao ai → B.

### N10. Media (D13 / D14)
- PUT không có `Content-Length` (chunked) → R2 `put(stream)` cần biết độ dài → trả 411 thay vì treo. DO stream thân R2 qua `RaceRoom.fetch` chạy được; rẻ hơn: DO chỉ trả cho phép / không, Worker `env.MEDIA.get` và stream (DO ngắn hơn). `hostPage.mediaHeadRetryMs` 15 s: chỉ HEAD lại tên **chưa có**, không quét cả danh sách (10 hình × 4 / phút × 2 h = 4 800 request Worker vô ích).

### N11. `review` phải kiểm `i === r.step` (mục hàng chờ cũ sau khi bước đã xong) → "Bài này đã được xử lý"; approve-không-id lần hai → cùng chữ, không phải "Đội chưa gửi câu trả lời".

### N12. `decided_by = 'host'`: token Host không có danh tính (`auth.ts:42` `t = HOST`) → SPEC §13.4 "Host nào" không làm được – ghi TODO (Phase 10 khóa bài giữa nhiều Host).

### N13. "Mã bài nộp" (SPEC §8.9 (2), §13.4) không có trong §1 / §11 / TODO của kế hoạch – bị bỏ lặng. Với nhánh ảnh qua Messenger, Host nhận ảnh không có mã. Rẻ: in `Đội <tên> · <nhãn bước> · #<id>` trên thẻ `proof` (chữ, không cần cột); hoặc ghi rõ hoãn vào §11.

## Đã kiểm, không có vấn đề (để người tích hợp khỏi kiểm lại)
- **Không alarm, không timer:** D9 đúng; chọn nhánh / đổi nhánh tại chỗ **không cần** client gửi lại vị trí vì `apply → io.changed → soon()` khởi động lại vòng tick (`RaceRoom.ts:122, 440-443`) và `checkBoxes` chạy ngay lượt đầu (`boxAt` đã quá hạn, 458-461). Giữ `io.changed` trong mọi hiệu ứng mới.
- **SQLite trước ack:** `apply()` (`engine.ts:375-385`) đã là mẫu đúng (transaction → patch cache → send); `review` / `answer` / `branch` đi qua nó là đủ; `engine.test.ts` đã có test "sql ném → không gửi".
- **Rò đáp án / đáp án tham khảo:** `hostView` chỉ tới socket tag `host` (`RaceRoom.ts:521-525`, tag đặt theo token `auth.ts`); `cardOf` là nơi duy nhất dựng thẻ (`steps.ts:176`), kế hoạch D3 liệt kê đủ; `check.ts:193` đã quét `task.location.name` (chống mô hình "Thử thách 2 có `task.location` = địa điểm đáp án" làm lộ qua `place`).
- **Tương thích dữ liệu cũ:** `meta 'leg'` được `parseLeg` lại khi thức (`engine.ts:87-93`), mọi trường mới có default, `media` chuỗi → object qua union – chặng Phase 7 lưu trong DO vẫn nạp; `PROTOCOL_VERSION` 3 → client cũ thấy "tải lại trang".
- **Quota:** +≈ 45 dòng / đội (sau N1), 20 đội ≈ 10 200 dòng, request +≈ 220 → trong ngân sách SPEC §3; `maxRaceOps` chặn client sửa (sau S4).
- **Trust boundary:** D19 đủ; `isClientMessage` `race` hiện trả `true` cho `open` không kiểm `branch` (`codec.ts:107`) → nền phải thêm như D19 nói.
