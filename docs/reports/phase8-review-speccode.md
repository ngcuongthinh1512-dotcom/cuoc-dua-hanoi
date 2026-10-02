# Phase 8 – Reviewer 1: SPEC + CODE

Ngày 2026-10-02. Nhánh `main`, HEAD `2df2fec`. Phạm vi: `git diff 0818033..HEAD` (+ nền `1229d2b`), `docs/plans/phase8.md`, SPEC §8.4–8.9 + §17.9–17.16, `docs/reports/phase8-verify-*.md`, `phase8-integration.md`. Đọc mã độc lập, không tin báo cáo track. Không đọc chặng thật; chỉ chặng test (GIẢ). Không sửa mã.

**Kết luận: KHÔNG CÓ LỖI CHẶN, nhưng còn 6 mục "nên sửa" mở → `fail` = cần một lượt sửa ngắn trước commit `feat(phase8)`.** Lõi máy chủ đúng: không rò đáp án / đáp án tham khảo / ghi chú Host / đề nhánh chưa mở / hòm nhánh chưa chọn; SQLite ghi trước khi gửi; trạng thái dựng lại từ dòng + `now` sau khi DO bị đuổi; ngân sách SPEC §3 đạt (sim 67 dòng / đội). Các mục "nên sửa" còn mở đều đã được verify nêu, lượt ghép cố ý để lại; mỗi mục 1–3 dòng.

Đã chạy: `worker: npx vitest run src/race` → 10 file / 107 test qua. Không để tiến trình nào chạy.

## 1. Đối chiếu yêu cầu người dùng (SPEC §17.14 / §17.16)

| Yêu cầu | Mã | Kết quả |
|---|---|---|
| Gõ đáp án trong game ở bất kỳ đâu | `engine.ts:168-171` (answer / accept / branch không gác vị trí), `steps.ts:251-268` | ✓ |
| Lịch sử chỉ trên thẻ thử thách, chỉ của đội mình | `steps.ts:310-311` (lọc nhánh, không `n`), `format.ts:280` (`book` → `[]`), `send` theo đội | ✓ |
| Host duyệt / phạt / ghi chú + đáp án tham khảo chỉ Host | `steps.ts:356-389`, `engine.ts:319-331` (`queue` chỉ trong `host.state`), `host/main.ts:408-442` | ✓ |
| Phạt 3 phút đếm ngược | `locked_until`, `format.ts:156-161` (`penaltyEl` giữa màn hình + thẻ) | ✓ |
| Thử thách 1 → 2 ngay khi duyệt | `advance` approve → `complete` → `race` + `notice approved` | ✓ |
| Lựa chọn kép hai nút | `format.ts:270`, `RaceHud.ts:389` | ✓ |
| Chỉ hòm nhánh đã chọn hiện (150 m) | `engine.ts:259-272`, `RaceRoom.ts:502-516`, `welcome` `engine.ts:133-143` | ✓ |
| Đề bài nhánh nằm trong hòm (chỉ gửi khi đã mở) | `steps.ts:331-334` | ✓ |
| "Đổi lựa chọn kép" + hộp xác nhận + phạt 10 phút đếm ngược | `steps.ts:244-249`, `RaceHud.ts:403`, `format.ts:187-188` | ✓ |
| Hòm cũ biến mất, hòm kia chỉ hiện sau khóa | `hideBox` (`RaceRoom.ts:140-146`) + `currentBox` null khi khóa | ✓ |
| Không đổi khi chờ duyệt | `steps.ts:245` `branchPending`; nút ẩn `format.ts:279` | ✓ |
| Cảnh báo kẹt 45 phút trên Host | `hostView.ts:354-378`, vẽ mỗi `refreshMs` (`host/main.ts:531, 566`) | ✓ |
| Link + hình trên thẻ và Sổ (R2, chỉ đội đã mở) | `steps.ts:394-403`, `index.ts:57-86`, `RaceHud.ts:460-494` | ✓ |
| Không có gợi ý trong game | không có mã gợi ý; `teaser` chỉ là lời dẫn §8.8 | ✓ |

Thử phá (đọc mã): Duyệt hai lần / Phạt hai lần → "Bài này đã được xử lý", 0 dòng; đổi nhánh lúc chờ duyệt → `branchPending`; đổi lúc khóa phạt 3 phút → được, khóa 10 phút thay (M1); Host duyệt khi tạm dừng → `complete`, `settle` chờ `running`; đội offline khi duyệt → `welcome.view` có mật thư kế; DO bị đuổi giữa khóa → `locked_until` trong SQLite, `view()` tính từ `now`; nối lại giữa `switchLocked` → không có hòm nhánh nào trong `welcome`; A→B→A → `hideBox` xóa attachment, hòm A reveal lại; hòm nhánh đã mở không bị `hide` khi đi xa (`checkBoxes` bỏ qua `opened`); `ZoneMember` / `box` / `RaceView` không mang tọa độ hay tên nơi của bước sau.

## 2. Mục "nên sửa" của verify: trạng thái tại HEAD

| Nguồn | Mục | Trạng thái |
|---|---|---|
| verify-foundation S1 | ai xóa op `task` | **đã sửa** (`2df2fec`) |
| verify-foundation S2 | quét lộ đáp án chéo hai nhánh | **đã sửa** (`check.ts:244-248`) |
| verify-a 4.1 | thiếu test C1 cho `eligible` | **chưa** (chỉ `steps.test.ts:176` cho arrive / park) → R-8 |
| verify-a 4.2 | đổi nhánh khi `switchLocked` được nhận | **chưa** → R-4 |
| verify-b 4.1 | preset `p7-box-opened` | **đã sửa** |
| verify-b 4.2 = verify-c S1 | Tab khi focus ở nút / link | **chưa** → R-1 |
| verify-b 4.3 | thẻ đè bản đồ / menu khóa chuột | **chưa** → R-2 |
| verify-b 4.4 | Firefox Esc + `#help` | **chưa** → R-3 |
| verify-c S2 | bấm ra ngoài thẻ khóa chuột | **đã sửa** (`main.ts:437`: bấm nền = đóng thẻ) |
| verify-d N1 | `leg:check` không quét tên hình / URL | **chưa** → R-5 |
| verify-d N2 | luật "chỉ chờ duyệt chặn đổi nhánh" sai với giao diện | **chưa** → R-4 |
| verify-e S1 | `demoState` chép đáp án tham khảo của `mini` | **chưa** → R-6 |

## 3. Phát hiện (nặng trước)

### R-1 (nên sửa, người chơi thấy) Tab / Space trên nút vừa bấm: chuột bị khóa, thẻ vẫn mở; Space mở lại hộp xác nhận
- `core/Input.ts:117` bỏ qua Tab / Space / Enter khi đích là `button, a[href]` và chuột tự do → vòng khung không `toggleBook`.
- `RaceHud.ts:136` chỉ đóng khi `typing`; `RaceHud.ts:138` để Space / Enter bấm lại nút đang focus (nút "Đổi lựa chọn kép" sau khi Hủy confirm → confirm lại).
- `main.ts:445` vẫn `input.lock()` cho Tab (chỉ loại `HTMLInputElement`).
- Kịch bản: bấm Copy / link Messenger / "Về mật thư hiện tại" / Đổi → Hủy, rồi Tab ("Đóng (Tab)") → thẻ còn mở, chuột khóa, không bấm được gì.
- Sửa: `RaceHud.ts:136` đóng khi `typing || (e.target as Element)?.matches?.('button, a[href]')`; trong `act()` gọi `btn.blur()` sau khi bấm.

### R-2 (nên sửa, người chơi thấy) Đóng thẻ khi bản đồ `M` / menu đang mở vẫn khóa chuột
- `main.ts:431-435` `onOpenChange(false)` → `input.lock()` vô điều kiện. Thẻ mới tự bật khi Host duyệt từ xa (D8) dù đội đang mở bản đồ; Esc / Đóng → chuột khóa trên bản đồ (không kéo / bấm được). `cardClosed` còn chặn luôn Esc của bản đồ ở khung đó.
- Sửa: `if (!fullMap?.isOpen && !menu.isOpen) input.lock();` (cùng điều kiện cho nhánh Tab ở `main.ts:445`).

### R-3 (nên sửa, người chơi thấy) Firefox: Esc đóng thẻ không khóa lại được chuột và gợi ý "Nhấp chuột để chơi" bị ẩn
- Firefox không coi Esc là thao tác người dùng → `requestPointerLock` trong handler Esc bị từ chối, không có `pointerlockchange`. `#help` đã bị ẩn lúc thẻ mở (`main.ts:425` `help.hidden = locked || modal()`) và `onOpenChange(false)` không tính lại → chuột tự do, không menu, không gợi ý.
- Sửa: trong `onOpenChange(false)` thêm `help.hidden = input.locked;` (lần khóa thành công sẽ ẩn lại qua `onPointerLockChange`). Kiểm tay Firefox (kế hoạch §6 B bắt buộc, chưa làm – `phase8-integration.md` §4).

### R-4 (nên sửa, người chơi thấy qua tài liệu) `switchLocked`: máy chủ nhận đổi nhánh, giao diện ẩn nút, luật nói được đổi
- Máy chủ: `steps.ts:238-249` không có điều kiện khóa đổi nhánh → mỗi `branch` trong lúc đếm ngược = 3 dòng (step_progress + event 2), `maxRaceOps` 30 / phút → **90 dòng / phút** với client sửa (D20 hứa ≤ 30), 2 giờ ≈ 10 800 dòng một đội (> nửa ngân sách 20 000).
- Giao diện: `format.ts:279` ẩn "Đổi" ở `switchLocked`.
- Tài liệu: `RACE_RULES.md:145` "Không đổi nhánh được khi đang chờ Host duyệt bài (đây là điều kiện duy nhất)", `LEG_FORMAT.md:114` "**chỉ** lúc đang chờ Host duyệt thì không đổi được" → người chơi tìm nút không có.
- Sửa: `steps.ts` sau dòng 245 `if (p.branchOpenedAt === null && (p.lockedUntil ?? 0) > now) return silent;` (giữ M1: khóa phạt sau khi mở hòm vẫn đổi được); harness A→B→A chờ hết khóa đầu; hai câu tài liệu: "Không đổi được khi đang chờ Host duyệt, và trong lúc đang đếm ngược đổi nhánh".

### R-5 (nên sửa) `leg:check` không quét tên hình `r2:` / URL liên kết tìm đáp án
- `check.ts:237, 241` chỉ đẩy `m.label`; nhưng `MediaView.url` (`r2:<tên>` hoặc link) đi nguyên xuống thẻ đội ngay khi nhận mật thư (`steps.ts:296, 326, 333`), hiện khi rê chuột lên link và trong đường dẫn `GET /api/race/<r>/media/<tên>`. §17.14 Thử thách 2 "địa điểm trong hình": đặt tên hình theo địa điểm là chuyện tự nhiên. `LEG_FORMAT.md` §9 lại nói "hình / liên kết" được quét.
- Sửa: `textsOf` đẩy thêm `m.url` (bước + task), so trên dạng thay `[-_./:]` bằng dấu cách; 1 test (`r2:palais-de-tokyo.jpg` với đáp án tham khảo "Palais de Tokyo").

### R-6 (nên sửa) Bundle Host chứa đáp án tham khảo của `mini`
- `client/src/host/hostView.ts:492` `reference: ['(GIẢ) Ảnh thấy rõ chân tháp phía sau']` = `worker/legs/test/mini.json:137` → `leg:check mini` 1 cảnh báo (tài liệu `LEG_FORMAT.md` §10 nói 0), và là mẫu xấu (chép chữ chặng vào static asset).
- Sửa: đổi chuỗi demo sang chữ không có trong chặng nào + `hostView.test.ts:175`.

### R-7 (nhỏ, mới, người chơi thấy) Bấm F nhiều lần khi cuộc đua chưa mở / tạm dừng → socket bị đóng 4429
- `RaceRoom.ts:411` đếm `open` vào `maxRaceOps` **trước** cổng trạng thái của engine (`engine.ts:163-167`), kể cả `open` bị từ chối (lobby / paused / `boxFar`) vốn không ghi dòng nào. Client gửi `open` mỗi lần F khi đứng trong vùng hòm, cách nhau ≥ `opMinGapMs` 800 ms (`config.ts:1082`, `RaceClient.interact`) → 31 lần F trong 60 s → `CLOSE.tooFast`, client nối lại (mỗi lần nối lại ghi connect event + teams.state). Ca thật: các đội đứng ở hòm đầu tại Bir-Hakeim chờ Host "Mở cuộc đua" (`RACE_RULES.md` §4 "vào game là đã đứng cạnh hộp mật thư"), bấm F liên tục.
- Sửa: bỏ `open` khỏi bộ đếm (mở thành công ghi một lần mỗi hòm; hòm nhánh chỉ mở lại sau một lần đổi nhánh có khóa), hoặc chỉ đếm khi `engine.status === 'running'`.

### R-8 (nhỏ) Thiếu test C1 cho `eligible` (verify-a 4.1, chưa sửa)
- `grep` `worker/src`: không test nào đưa đội vào nơi nhánh chưa chọn rồi kiểm `zone`. Hành vi hiện đúng (`engine.ts:533`), đột biến dùng cả hai nhánh không làm test nào đỏ.

### R-9 (nhỏ, mới, người chơi thấy) Host tải lại hình sửa lỗi: đội đã xem vẫn thấy hình cũ
- `index.ts:68` `Cache-Control: private, max-age=86400` (không revalidate) + `session.ts:42` giữ blob cả phiên. PUT ghi đè được (trang Host cho tải lại), nhưng chặng bị khóa sau khi có đội vào (`LEG_LOCKED`) nên Host không đổi tên hình được → hình sai chỉ sửa bằng ghi đè cùng tên, đội đã tải giữ bản cũ tới 24 giờ.
- Sửa rẻ: `private, no-cache` + `ETag` sẵn có (304, vẫn một lượt hỏi DO), hoặc một câu trên trang Host / `LEG_FORMAT.md`: "tải lại hình cùng tên: đội đã xem phải tải lại trang và có thể vẫn thấy hình cũ".

### R-10 (nhỏ, người chơi thấy) Thẻ bật lên tự focus ô gõ (verify-c nhỏ 4)
- `RaceHud.ts:336` focus ô gõ cả khi thẻ tự bật (Host duyệt T1 → thẻ T2 bật lên lúc đội đang giữ W): phím lặp gõ "wwww" vào ô; Space – phím đóng thẻ theo `RACE_RULES.md` §4 – lại gõ dấu cách. Bản nháp giữ qua đóng / mở → dễ gửi "wwww …" và ăn Phạt.
- Sửa: chỉ tự focus khi thẻ mở bằng Enter (`openCurrent`) hoặc khi đội bấm vào thẻ.

### R-11 (nhỏ) Còn từ verify, chưa sửa
- verify-a 4.6: `index.ts:48` `decodeURIComponent` không bọc → `%E0` ném `URIError` → 500 thay 400.
- verify-a 4.3: Host thứ hai (màn hình cũ ≤ 1 s) bấm Duyệt sau khi Host thứ nhất Phạt → đường N4 lật quyết định, không cảnh báo.
- `phase8-integration.md` §4: preset `p8-media-offline` không cho thấy ô "Hình chỉ tải được trong cuộc đua".

## 4. Đã kiểm, không có lỗi
- Rò rỉ: `cardOf` (`steps.ts:316-344`) không mang `answers` / `referenceAnswers` / `params` / `host_note` / tên điểm đến / đề nhánh chưa mở; `AnswerView` không có `n`; `host.state` chỉ tới socket Host (`RaceRoom.ts:537-543`, `isClientMessage` theo role); media 404 cho cả "không có" và "chưa được phép"; client không import file chặng.
- SQLite trước ack: `engine.ts:489-500` một `transaction` → vá cache → `hideBox` → `park` → gửi; từ chối không ghi.
- Dựng lại: `readProgress` + `rowFacts` + `taskState(row, now)`; `queue` từ cache; attachment `box` theo `step|branch`.
- Quota: Duyệt 7 dòng, Phạt 3, trả lời 1, mở hòm nhánh 5; sim 3 bot 67 dòng / đội, ≈ 31 640 request / 20 đội × 2 giờ (`phase8-integration.md` §3). Ngoại lệ: R-4 (client sửa).
