# Phase 8 – Track A (máy chủ)

Trạng thái: **xong** (2026-10-02). Nhánh `phase8-track-A` từ `0818033`. Kế hoạch: `docs/plans/phase8.md` §3 D4–D8, D10, D13, D14, D19–D25, §6 Track A + điều chỉnh sau kiểm nền. Không đọc chặng thật; chỉ dùng `mini` / `near` (GIẢ).

`npm run build && npm test` (một lần cuối, từ gốc worktree): build exit 0; scripts 49 + **1 bỏ qua** (xem lệch 1), shared 57, client 633, worker **122** (trước: 98). Không để wrangler / workerd / vite chạy.

## Đã làm

### `worker/src/race/steps.ts` (thuần)
- `advance(leg, zones, p, input, now, running)` (bỏ tham số `verify`):
  - `accept` (thử thách có `teaser`, chưa bắt đầu) → `task_started_at`.
  - `answer` (từ bất kỳ đâu, không cần vị trí – D8 / N2): thứ tự trạng thái `teaser → taskNotStarted`, `pending → answerPending`, `locked → answerLocked`, detour chưa mở hòm / bước khác / chuỗi rỗng cho kiểu gõ → im lặng; `host_approval` → câu `pending`; `auto` → `verifyAuto` (sai: `wrong`, không khóa; đúng: hoàn thành).
  - `branch`: lần đầu không khóa; đổi → `switch` (khóa `branchSwitchLockMinutes`, `branch_opened_at` / `task_started_at` / **`arrived_at`** = null) + `hideBox` nhánh cũ; chỉ `pending` chặn (`branchPending`), đang khóa phạt 3 phút vẫn đổi được, khóa mới thay khóa cũ (M1).
  - `open{branch}`: chỉ nhánh đã chọn (nhánh kia / chưa chọn / đang `switchLocked`: im lặng), đi bộ, trong vùng nhánh + slack → `arrive` (+ `park` nơi riêng) + `openBranch`.
  - `approve` (Host duyệt) và `auto` đúng đi chung `done(pose)` → `complete(i, place, standing)` + `settle(pose)` (S3): xe vào bãi **chỉ khi đội đứng đi bộ trong vùng** (đang đạp xe trong vùng cũng không – xe không biến khỏi chân); Host duyệt khi tạm dừng vẫn hoàn thành, `settle` chỉ ghi `arrive`.
- `review(leg, i, row, m, now)` → `{ row, approve, id } | { refuse }`: duyệt câu `pending` (id, hoặc không id = câu đang chờ), duyệt lại câu vừa **Phạt** khi chưa có câu mới (N4, xóa khóa), duyệt không id cho bài ảnh `active` / `locked` (M2, tạo câu `''` đã duyệt); phạt → `locked_until = now + (task.retryLockMinutes ?? penalties.retryLockMinutes)` (0 → không khóa), `rejections + 1`, `penalty_minutes` không đổi; `approval_wait_seconds += (quyết − gửi)` (chỉ lần quyết đầu của câu); ghi chú kèm quyết định → `AnswerRec.n` **và** `host_note`; `note` → `host_note` (`''` xóa). Từ chối: "Bài này đã được xử lý." / "Đội chưa gửi câu trả lời." / "Bước này không có thử thách để duyệt.".
- `mediaAllowed(leg, step, rows, name)`: media `route_info` / `detour` bước ≤ hiện tại; `task` thử thách khi đã qua teaser; `task` nhánh đã chọn khi đã mở hòm (detour xong: nhánh đã làm) – đúng những gì `cardOf` cho xem.
- `rowFacts(row)` (Progress từ dòng, engine + `taskState` dùng chung), `taskOf(step, branch)`, `Progress.lastAnswerId`.
- `tasks.ts`: chỉ còn `verifyAuto`; `verifyTask` + `RaceInput 'task'` + hiệu ứng `start` bỏ.

### `worker/src/race/engine.ts`
- `apply` ghi mọi hiệu ứng mới trong **một transaction** rồi mới gửi: `accept` (dòng + sự kiện), `answer` (dòng, **không** sự kiện – D4; `submitted_at` / `wrong_answers`; notice `answerSent` / `answerWrong`), `review` (dòng + sự kiện `review {step, op, id, by}`; notice `approved` / `penalized`; duyệt → **không** kèm `clueNew` – M8; chỉ ghi chú → không gửi gì cho đội), `branch` / `switch` / `openBranch` (sự kiện `branch` / `switch` / `open`; reveal hòm nhánh `opened: true`), `hideBox` → `RaceIO.hideBox` **sau commit, trước mọi tin**; `complete` của bước trước một thử thách không teaser ghi luôn `task_started_at` (0 dòng thêm).
- `onHost host.review`: `finished` → lỗi; đội / bước không có → lỗi; bước sau bước hiện tại → "Đội chưa tới bước này."; duyệt → `advance({kind:'approve', pose: io.pose(team)})` (S3).
- `onOp`: `answer` mang vị trí tin cậy (nếu có) cho luật xe; op `task` cũ bị bỏ qua (ponytail tới khi người tích hợp gỡ khỏi giao thức).
- `currentBox(team, now)` (đổi chữ ký: thêm `now`, trả `BoxInfo` có `opened`): detour → hòm nhánh đã chọn, không có khi `choose` / `switchLocked`; `welcome.boxes`: hòm nhánh của detour đã xong (`opened`), hòm hiện tại nếu đã mở (mọi khoảng cách) hoặc trong 150 m.
- `mediaAllowed(team, name)`; `hostView.queue` (mọi câu `pending`, cũ trước, `reference` = `referenceAnswers` rồi `answers`, `lockMinutes`); `officialMs` của `RaceView` + sự kiện `finish` trừ tổng `approval_wait_seconds` theo `hostApproval.approvalWaitCounts` (D23, làm tròn ms).
- ponytail: `step_progress.answers` giữ 50 câu mới nhất mỗi bước.

### `worker/src/RaceRoom.ts`
- `Op 'race'`: `answer` / `accept` / `branch` / `open` quá `NET.maxRaceOps` / phút → đóng 4429; `checkin` / `book` không đếm (S4).
- Attachment `box` = `step|branch`; `checkBoxes(now)` bỏ qua hòm đã mở (S2), reveal gửi `opened` thật; `RaceIO.hideBox`: xóa `box` trên mọi socket của đội rồi gửi `{t:'box', op:'remove', step, branch}` (S1).
- `fetch GET /media?name=&team=` → 204 / 404 (DO không stream ảnh – N10).

### `worker/src/index.ts`
- `/api/race/<race>/media/<name>`, token trong `Authorization: Bearer`: tên sai mẫu / race sai → 400; token sai / thiếu → 401; `GET` Host → R2 ngay, đội → hỏi DO (204) rồi stream R2 (`Cache-Control: private, max-age=86400`, `ETag`), không có / chưa được phép → cùng 404; `HEAD` / `PUT` chỉ Host (403); `PUT`: `Content-Type` ∉ `MEDIA.types` → 415, không `Content-Length` → 411, > 5 MB → 413, rồi `MEDIA.put(<race>/<name>)` → `{ok, size}`; method khác → 405.

### `worker/src/test/harness.ts`
- `nearLeg`: 3 = L2, 4 = nhánh A, 5 = nhánh B, 6 = thảm (cả hai nhánh có nơi riêng); `nearPoint` doc theo bố cục mới; helper `answer(sock, step, text)`, `review(host, team, step, op, id?, note?)`.

## Test
- `steps.test.ts` (28): bảng D5 từng chuyển (teaser → accept → active → pending; khóa / hết khóa theo `now`; chuỗi rỗng; bước xong / bước sau im lặng), `auto` đúng / sai, S3 (đứng trong vùng đi bộ → `park`; 300 m / đạp xe trong vùng / không vị trí → không), `settle` bước kế tại chỗ (cả khi tạm dừng), D6 (chọn, mở sai nhánh / chưa chọn / đạp xe / ngoài vùng, mở → arrive + park + openBranch, đổi: khóa + hideBox + xóa tiến độ, `branchPending`, đổi khi khóa phạt, A→B→A, phạt 0), C1 sau khi đổi, `review` (duyệt / phạt / phút khóa task → leg → 0 / từ chối / N4 / M2 / ghi chú), `mediaAllowed`.
- `engine.test.ts` (18, RaceIO giả ghi thứ tự + khoảng transaction): answer ghi trước khi gửi + hàng chờ; review trong một transaction trước `race`, khóa, `answerLocked`, N4 duyệt lại, duyệt lần hai / bước chưa tới không ghi gì; ghi thất bại không gửi, cache không đổi; hàng chờ 2 đội theo `at` + `reference` hai nguồn; hai đội không lộ câu trả lời của nhau; lobby / paused → notice, 0 dòng, Host vẫn duyệt khi tạm dừng; đổi nhánh → `hideBox` trước mọi tin, `currentBox` theo khóa, mở hòm → thẻ chỉ có đề nhánh đã mở; đổi giữ câu cũ `b = A` cho Host, thẻ đội rỗng, `arrived_at` null; `officialMs` trừ / không trừ chờ duyệt; media + trường `host.state.leg`.
- `RaceRoom.phase8.test.ts` (6, workerd, ≈ 57 s): (1) gõ từ L1 (cách nơi T1 60 m) → hàng chờ có đáp án tham khảo → Phạt → `locked_until` đã trong SQLite khi tin tới, đếm ngược ≈ 6 s → `answerLocked` → hết khóa → gõ lại → duyệt → `approved` + thẻ L2, `approval_wait_seconds > 0`, duyệt lần hai → `host.notice`, ghi chú Host không tới đội; (2) D1: chọn A → reveal A trong 40 m; đổi B → `remove {D1, A}` + `switchLocked`; đổi lại A; hết khóa + gửi vị trí → reveal A (S1); tới cách B 30 m, đổi B, không tin nào mang tọa độ B trong lúc khóa; hết khóa khi đội offline → nối lại → `welcome.boxes` có B (M3); mở B → `reveal opened`, thẻ chỉ có đề B; đi 200 m rồi quay lại → không tin `box` nào (S2); "Tôi đã gửi bài" → chờ → duyệt → L3, `branch_switches` 3; (3) đạp xe 300 m rồi được duyệt → xe vẫn của đội, đang chạy (S3); `host.review` từ socket đội → đóng 4400; (4) media 404 / 403 / 400 / 415 / 413 / 411 / 200 / HEAD / 401, hình T1 chỉ sau khi nhận thử thách; (5) 31 câu trả lời `auto` sai / phút → 4429, `wrong_answers` 29; 40 check-in trên thảm → socket còn; (6) DO bị đuổi giữa `pending` → Host thấy hàng chờ, duyệt → đội nối lại có L2; giữa khóa → `welcome.view.card.lockedUntil` giữ nguyên.
- `RaceRoom.race.test.ts`: luồng Phase 7 chuyển sang op mới (T1 accept / answer / Host duyệt; D1 chọn / mở hòm nhánh / trả lời); `officialMs` trừ chờ duyệt; welcome hòm D1|A đã mở; **dòng ghi cả chặng 1 đội có 1 phạt + 1 đổi nhánh: 63 (≤ 160)**.

## Lệch kế hoạch và vì sao
1. **`scripts/sim.test.ts` (file của E) sửa 1 dòng**: test tích hợp "3 bot chạy hết chặng" bỏ qua khi `sim.ts` còn gửi op `race task` (server giờ bỏ qua op này nên bot kẹt). Khi E chuyển bot sang op mới, test tự chạy lại. Người tích hợp: lấy bản của E khi ghép.
2. **Duyệt (`approved`) không kèm `clueNew`** (M8 thắng dòng test kế hoạch "approve → mật thư kế (clueNew)"): đội nhận `notice approved` + `race` có thẻ mới.
3. **`currentBox(team, now)`** thêm `now` và trả `BoxInfo` (có `opened`) thay `Omit<BoxInfo,'opened'>`: trạng thái khóa đọc theo `now`, `opened` thật cho reveal / welcome.
4. **`RaceInput.answer` mang `pose`** (vị trí tin cậy hoặc null) để `auto` đúng áp luật xe như Host duyệt (§5.2 chỉ ghi `approve{pose}`).
5. **`review()` trả thêm `id`** (câu được quyết, cho sự kiện `review`); hiệu ứng mới `RaceEffect 'review'` mang dòng đã sửa.
6. **Duyệt không `id` khi đang `pending`** = duyệt câu đang chờ (kế hoạch: chỉ bài ảnh `active` / `locked`); `penalize` không `id` = phạt câu đang chờ. Host bấm từ hàng chờ vẫn gửi `id`.
7. **Đạp xe trong vùng lúc được duyệt → xe không vào bãi** (S3 nói "pose trong vùng"; thêm "đi bộ" để xe không bị rút khỏi người đang ngồi – `BikeService.park` bỏ chủ bất kể).
8. **Test D1 harness dùng khóa đổi nhánh 6 s** (`branchSwitchLockMinutes 0.1` ghi đè qua `host.leg`), test đuổi DO dùng khóa 2 phút (đuổi DO chờ vòng tick ngủ ≈ 10 s, khóa 6 s sẽ hết trước).
9. **Media test dùng HTTP thật** (`fetch` tới URL của harness): `server.fetch` của wrangler gửi thân dạng stream không `Content-Length` (mọi PUT thành 411).
10. Không thêm helper `db.ts` (không cần). `legs.test.ts` không đổi (nền đã có test rò rỉ).

## Cho người tích hợp / track khác
- **B**: tin `{t:'box', op:'remove', step, branch}` tới **trước** thẻ `switchLocked`; reveal hòm nhánh đã mở mang `opened: true` (kể cả trong `welcome.boxes` ở mọi khoảng cách); `hide` không bao giờ tới cho hòm đã mở. Op `task` server bỏ qua.
- **C**: duyệt → chỉ toast `approved` (không `clueNew`); ghi chú Host không bao giờ trong thẻ.
- **E**: `host.review` không `id` duyệt / phạt câu đang chờ; nút "Duyệt (đã nhận ảnh)" (không `id`) chạy cho bài ảnh `active` / `locked`; từ chối là `host.notice` cảnh báo tiếng Việt; `ReviewItem.note` = `host_note` (ghi chú kèm Duyệt / Phạt cũng thành `host_note`). Bot sim: `nearLeg` / `mini` T1 có teaser → `accept` trước.
- Người tích hợp: gỡ op `task` khỏi `shared/protocol/types.ts` + `codec.ts` sau khi ghép A + B + C (rồi xóa dòng `if (m.op === 'task') return;` trong `engine.ts`).
