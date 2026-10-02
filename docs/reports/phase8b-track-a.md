# Phase 8B – Track A (máy chủ): báo cáo

Trạng thái: **xong** (2026-10-03). Nhánh `phase8b-track-A` (chưa merge). Kế hoạch `docs/plans/phase8b.md` §D, §E, §I; hợp đồng nền `docs/reports/phase8b-foundation.md`; verify nền mục 2, 9, 10, 12 đã xử lý. `npm run build && npm test` từ gốc worktree: qua (scripts 75, shared 71, client 695, worker 153 = 994; worker +17 test, 0 skip).

## Đã làm
1. **`steps.ts` – chuyển trạng thái** (thuần):
   - `Progress.picks` (từ `rowFacts` → `parsePicks`, về `[]` khi bước xong).
   - `pick`: được khi `active` hoặc `locked`; `teaser` → `taskNotStarted`; bước đã xong / bước sau / id lạ / trùng trạng thái → im lặng; từ mốc 40 (`task_started_at + countAtMinutes`) bật khi đã ≥ 5 đèn → `pickLimit`; tắt luôn được; > 5 đèn bật trước mốc giữ nguyên.
   - `lock`: `locked` → `answerLocked`; pose tin cậy ngoài `zones[i]` + `geofenceSlack` hoặc chưa có → `boxFar`; 0 đèn → im lặng (0 dòng, không phạt); đúng ⇔ 5 đèn = đúng 5 đáp án → effect `lock` + `done(pose)` (complete + settle); sai → `locked_until = now + retryLockMinutes`, `rec {s:'wrong', c}`; `public = now ≥ mốc 70`. Effect `lock` thêm `minutes` (cho feed).
   - `review()`: Host **duyệt không id** áp được cho bước louvre (lối thoát cho đội kẹt phòng – verify #9); phạt không id vẫn bị từ chối.
2. **`engine.ts`**:
   - effect `pick` → chỉ sửa cache dòng (`picks`), 0 dòng SQLite; tự gửi lại `race view` (đèn, x/5 sống), `io.touchSnapshot`, `io.changed` (Host).
   - effect `lock` → dòng bước (`answers` + `c`, `picks`, sai: `rejections + 1`, `locked_until`) + sự kiện `louvre.lock {step, ok, k, c, public, slot, minutes}` trong cùng transaction, rồi notice `lockWrong` (đúng: `clueNew` của `complete`), thẻ, rồi `io.feed`.
   - `feedLine(at, data)` thuần (dùng cả khi ghi lẫn khi dựng lại): sai → `{ok:false, minutes}` (+ `n`, `of` khi `public`); đúng sau 70 → `{ok:true, n:5, of:5}`; đúng trước 70 → không tin.
   - `livePicks()` (cho JSON snapshot: bước louvre hiện tại chưa xong của mỗi đội) / `restorePicks(saved, snapT)`: **bản mới hơn thắng** — dòng có lần chốt cuối `at > snapT` hoặc đã `completed_at` giữ picks của nó (verify #2).
   - `RaceIO += feed(m), touchSnapshot(now)`.
3. **`RaceRoom.ts`**: `feed` = broadcast tới mọi socket (đội + Host) + giữ `NET.feedKept` tin; `welcome.feed` đọc lười một lần mỗi lần thức (`SELECT … WHERE type = 'louvre.lock' ORDER BY id DESC LIMIT 2 × feedKept`, đảo lại, lọc qua `feedLine`); `writeSnapshot` thêm `picks: engine.livePicks()`; constructor gọi `restorePicks(data.picks, snap.t)`. `lock` vẫn đếm `maxRaceOps` (nền đã có); `pick` không đếm, không ghi.
4. **Harness**: helper `pick`, `lock`, `viewAgain`.

## Test (bắt buộc §H–§I)
- `worker/src/race/louvre.test.ts` (+7, thuần): pick bật / tắt / trùng / id lạ / khi khóa; bước xong, bước sau, teaser; tối đa 5 từ mốc 40 (7 đèn trước mốc giữ, bật thêm `pickLimit`, tắt 3, bật 1 được, bật nữa `pickLimit`, `maxPicks` null / 5); lock ngoài vùng / không pose → `boxFar`, 0 đèn → im lặng, khóa → `answerLocked`, xong → im lặng; sai trước 70 (rec, `c`, `lockedUntil`, `public` false) và sau 70 (`public`); đúng 5 thứ tự bất kỳ → lock + complete; 6 có đủ 5 → sai; 4 → sai; Host duyệt không id.
- `worker/src/race/engine.test.ts` (+5, RaceIO giả): pick = 0 lệnh SQL, gửi thẻ + `touchSnapshot`, x sống sau 70, không feed; lock sai: `INSERT step_progress`, `event louvre.lock` **trước** mọi `send`, rồi `feed`; feed trước 70 không `n`, sau 70 có `n/of`; khi khóa vẫn pick, chốt chỉ một notice, 0 ghi; đúng → một transaction (2 dòng bước + 2 sự kiện + saveTeam), `clueNew`, L3, feed `5/5` chỉ sau 70; `restorePicks` (snapshot cũ hơn lần chốt bị bỏ, bằng / mới hơn được áp, đội không có dòng bỏ qua); paused → `racePaused` ×2, `view` vẫn trả.
- `worker/src/RaceRoom.louvre.test.ts` (+5, workerd):
  1. Hai đội: thẻ T3 không có note / credit / mảng đáp án; 6 đèn trước 40, dòng SQLite vẫn `picks '[]'` (0 ghi); pick trùng + `answer` một id đúng (C1) → im lặng, không ghi; mốc 40 → `pickLimit`, tắt 2, bật 1, bật nữa `pickLimit`; chốt sai → `lockWrong`, `locked_until` + `picks` + `rejections` đã trong SQLite khi thẻ tới; đội B + Host nhận `feed {ok:false, minutes}` không `n`; khi khóa vẫn bỏ chọn, chốt → `answerLocked`; sau đếm ngược + mốc 70: `hintCorrect` sống đổi theo pick; chốt sai sau 70 → feed `n:3, of:5`, thẻ `answers[1].correct = 3`, `answers[0]` không `correct`; chốt ngoài phòng → `boxFar`; đúng 5 → `clueNew`, L3, feed `5/5`; đội B không nhận `picks` / `hintCorrect` / `attempts` nào; Ghi nguồn: trước đích `creditsLocked`, về đích → 6 mục đúng thứ tự, không note; đội B vẫn khóa; Host kết thúc → B nhận.
  2. Quota: 3 chốt sai + 1 đúng + pick xen giữa = **19 dòng** (16 + 3 snapshot) ≤ 20.
  3. lobby `raceNotOpen`, paused `racePaused` (0 dòng), `view` khi paused trả thẻ; 31 `lock` / phút → 4429, 0 dòng.
  4. Evict giữa đếm ngược (phạt 30 s): `welcome.view` giữ `locked`, `lockedUntil`, `picks` (snapshot mới hơn lần chốt), `attempts`; `welcome.feed` = đúng tin cũ, không `n`; sau mốc 70 `hintCorrect` tính lại = 2; thiết bị thứ hai: máy cũ bị `kick`, máy mới cùng picks; Host thấy `picks`, `hintCorrect`, `rejections`.
  5. Lần chốt mới hơn snapshot thắng (verify #2): evict ngay sau chốt → picks của dòng chốt; `welcome.feed` hai tin đúng thứ tự thời gian, tin trước 70 không `n`.

## Lệch kế hoạch
- **Chốt với 0 lựa chọn: máy chủ im lặng** (không ghi, không phạt) thay cho "máy chủ vẫn chấm sai" (§A (3)) — theo lệnh điều phối "server cũng từ chối". Vẫn đếm `maxRaceOps`.
- `lock` xét vùng có `NET.geofenceSlack` (2 m) như `open`.
- Feed đọc **lười** (lần welcome đầu sau khi thức), lấy `2 × feedKept` sự kiện vì chốt đúng trước mốc 70 không có tin.
- Rate pick: không thêm giới hạn riêng; trần là `maxMessagesPerSec` 15 (đóng 4429) như nền; mỗi pick trả một thẻ (tin ra, không tính phí). Client (B) nên giãn pick ≥ 150 ms và không gửi gesture mỗi lần pick (verify #10).
- Không sửa `shared/`, `db.ts`, `legs.test.ts` (không cần).

## Ponytail
- `RaceRoom.feed()`: quét `events` từ id mới nhất, không index theo `type`; nâng: index `(type)` nếu một cuộc đua ghi nhiều hơn hẳn.
- `picks` mất ≤ 2 s khi DO bị đuổi (plan §D, đã có trong kế hoạch).

## Kiểm tay còn chờ (sau khi ghép B / C)
- 2 trình duyệt + Host qua `dev:api`: đèn chỉ mình thấy, feed góc dưới hiện đúng chữ, x/5 sống trên thẻ, F5 trong phòng giữ đèn / đếm ngược.
- Host bấm "Duyệt" không id cho đội kẹt phòng (nút trên trang Host do track D).
- `sim --leg louvre` (track D) đối chiếu `rowsPerTeam`.
