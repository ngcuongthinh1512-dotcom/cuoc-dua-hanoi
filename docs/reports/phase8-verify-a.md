# Phase 8 – Kiểm đối kháng Track A (máy chủ)

Đối tượng: worktree `.claude/worktrees/wf_4133df99-060-1`, nhánh `phase8-track-A`, commit `badcf35` (từ `0818033`). Kế hoạch `docs/plans/phase8.md` §3 (D4–D8, D10, D13, D14, D19–D25), §5, §6 Track A, §8. Báo cáo track `docs/reports/phase8-track-a.md`. Không sửa mã; chỉ đọc diff, chạy test, chạy một probe thuần trong scratchpad (RaceEngine + RaceIO giả).

**Kết luận: ĐẠT (không có lỗi chặn).** 2 mục "nên sửa", 6 mục nhỏ.

## 1. Phạm vi file (git diff --stat 0818033..HEAD)

12 file. Tất cả thuộc Track A (§6) trừ **`scripts/sim.test.ts`** (file của Track E): sửa 1 dòng để bỏ qua test tích hợp "3 bot chạy hết chặng" khi `sim.ts` còn gửi op `race task` (server giờ bỏ qua op này). Báo cáo track đã ghi (lệch 1). Không đụng `shared/`, `docs/plans`, `TODO.md`, `CLAUDE.md`, `docs/SPEC.md`.

## 2. Chạy thật

- `worker`: `npx vitest run` → **13 file, 122 test qua** (57,9 s).
- `npm run build` (một lần, gốc worktree): **exit 0** (tsc mọi gói, Vite build, `wrangler deploy --dry-run` có binding `MEDIA` R2). `git status` sạch sau build.
- `scripts/sim.test.ts` (file A sửa): 8 qua, **1 bỏ qua** (đúng test tích hợp 3 bot – trước commit này nó chạy và qua với op `task`).
- Không để wrangler / workerd / vite của mình chạy.

## 3. Đối chiếu "Việc" và "Test bắt buộc"

| Mục | Mã | Test |
|---|---|---|
| `taskState` (done > pending > locked > active > teaser; detour choose / switchLocked / goToBranch) | ✓ | ✓ thuần |
| `advance` accept / answer (từ xa, không cần pose) / branch / switch / open{branch} / approve (`complete` + `settle`, S3 chỉ park khi đứng đi bộ trong vùng) | ✓ | ✓ thuần + harness |
| `review` (approve / penalize / note, N4, M2, từ chối tiếng Việt, `approval_wait_seconds` một lần) | ✓ | ✓ |
| `boxesOf` theo nhánh + yaw, `currentBox(team, now)` | ✓ | ✓ |
| `cardOf` (không đáp án / đáp án tham khảo / ghi chú / tên điểm đến / đề nhánh chưa mở; `answers` chỉ nhánh hiện tại, `slice(-20)`) | ✓ | ✓ (mini + paris-demo-filled, 5 dạng dòng) |
| `mediaAllowed` thuần + DO `/media` 204/404 + Worker GET/PUT/HEAD (400/401/403/411/413/415/404/200) | ✓ | ✓ HTTP thật |
| `apply`: một transaction rồi mới gửi; `hideBox` sau commit, trước mọi tin; ghi thất bại → không gửi, cache giữ | ✓ | ✓ (`writesFirst` kiểm từng dòng sql/event nằm trong transaction) |
| `hostView.queue` (cũ trước, `reference` = `referenceAnswers` rồi `answers`), `officialMs` trừ chờ duyệt | ✓ | ✓ |
| RaceRoom: `Op 'race'` cap chỉ answer/accept/branch/open; attachment `step|branch`; `checkBoxes` bỏ qua hòm đã mở | ✓ | ✓ (31 answer → 4429, 40 checkin → còn; A→B→A; đi 200 m không `hide`) |
| Evict giữa pending / giữa khóa | ✓ | ✓ |
| Dòng ghi cả chặng (1 Phạt + 1 đổi nhánh) ≤ 160 | ✓ | ✓ (báo cáo: 63) |
| **`placesOf` C1 – `eligible` không có rack nhánh B khi `branch = A`** | ✓ (nền) | **✗ thiếu test** (xem 4.1) |

Lệch kế hoạch trong báo cáo track (M8 không `clueNew`, `currentBox(team, now)`, `answer` mang `pose`, `review` trả `id`, duyệt / phạt không `id` = câu đang chờ, đạp xe trong vùng không vào bãi, khóa test 6 s, HTTP thật cho media) đều có lý do và không phá chữ ký người khác dùng.

## 4. Thử phá (probe thuần trên `RaceEngine` của worktree)

| Vai | Kết quả |
|---|---|
| Ghi SQLite trước ack | Đúng: mọi hiệu ứng → `dirty` → một `transaction` → vá cache → `hideBox` → `park` → gửi. `sql` ném → không gửi gì. |
| DO bị đuổi giữa khóa | Đúng: `locked_until` / `branch_opened_at` / `answers` trong `step_progress`; `view()` tính trạng thái từ dòng + `now`; harness qua. |
| Hai đội lộ câu trả lời | Không lộ: `send` theo đội; `host.state` chỉ socket Host; `book` chỉ dòng của đội. |
| Đáp án / `referenceAnswers` / đề nhánh chưa mở / hòm nhánh chưa chọn | Không lọt: `cardOf` lọc; `currentBox` chỉ nhánh đã chọn khi không khóa; `welcome.boxes` detour đã xong chỉ nhánh đã làm; `complete` detour không reveal `boxes[i][0]` (bỏ hòm có `branch`). |
| Host duyệt hai lần | Lần hai: "Bài này đã được xử lý.", 0 dòng. **Ngoại lệ**: Phạt rồi Duyệt (N4) – xem 4.3. |
| Đổi nhánh lúc pending / locked | pending → `branchPending`, 0 dòng; locked (phạt 3 phút) → được, khóa 10 phút thay khóa cũ (M1). **Đang `switchLocked` vẫn đổi được** – xem 4.2. |
| Tạm dừng | answer / accept / branch / open → `racePaused`, 0 dòng; Host vẫn duyệt (complete, `settle` chỉ ghi arrive). |
| Quota mỗi thao tác | answer 1; accept 3; chọn nhánh 3; đổi 3; open{branch} **5** (row + arrive 2 + open 2); Phạt 3; ghi chú 3; Duyệt 7; từ chối 0. |
| C1 zone | Đội chọn A, đã tới A, đi sang nơi B (có đội khác) → không nhận `zone` (đúng). |

### 4.1 (nên sửa) Thiếu test C1 cho `eligible`
Track A bắt buộc: "pose vào vùng B khi `branch = A` → … `eligible` không có rack B; sau `branch(B)` → …". `grep` cả `worker/src`: không test nào gửi pose vào nơi nhánh rồi kiểm `zone`. Hành vi hiện tại đúng (probe), nhưng đột biến `eligible` dùng cả hai nhánh sẽ không làm test nào đỏ. **Sửa**: thêm 1 test trong `engine.test.ts`: t0 chọn A, tới A, đi tới nơi B có t1 → không `zone` cho t0; t0 đổi sang B, hết khóa, tới B → `zone` có t1.

### 4.2 (nên sửa) Đổi nhánh khi đang `switchLocked` được nhận → 90 dòng / phút, vượt mốc D20
D20 hứa "client sửa ≤ 30 dòng / phút" nhờ `maxRaceOps = 30`, nhưng `branch` / `switch` / `accept` ghi dòng + sự kiện 2 dòng = 3 dòng / op (open{branch} 5). Probe: 30 op `branch` A↔B liên tiếp trong khóa → **90 dòng**, `branch_switches` 30. Client thật không gửi được (thẻ `switchLocked` không có nút – D6), nên chỉ client sửa; 2 giờ = 10 800 dòng của một đội (> nửa ngân sách 20 000). **Sửa (1 dòng)** trong `advance` nhánh `branch`, sau kiểm `pendingId`: `if (p.branchOpenedAt === null && (p.lockedUntil ?? 0) > now) return silent;` (giữ M1: khóa phạt sau khi mở hòm vẫn đổi được); test harness A→B→A chờ hết khóa đầu rồi mới đổi lại (S1 vẫn kiểm được). Hoặc sửa chữ D20 thành "≤ 90 dòng / phút".

### 4.3 (nhỏ) N4 cho phép Host thứ hai (màn hình cũ) lật quyết định Phạt
Probe: Host 1 `penalize id 1`, Host 2 (host.state chưa cập nhật, ≤ `slowTickMs` 1 s) bấm `approve id 1` → đường N4 duyệt luôn, đội sang bước kế, Host 2 không nhận cảnh báo nào. Trái chữ D10 "hai Host cùng bấm: lần sau … 'Bài này đã được xử lý', không ghi gì". Mâu thuẫn nằm ở kế hoạch (N4 vs D10). **Sửa rẻ**: ghi TODO (khóa bài giữa nhiều Host – Phase 10) + track E chỉ hiện nút "Duyệt câu vừa Phạt" ở ô `locked` của ma trận (không phải nút Duyệt của hàng chờ); hoặc trả `host.notice` cảnh báo "đã duyệt bài vừa bị Phạt" để Host biết.

### 4.4 (nhỏ) Danh sách "Tại điểm này" cũ sau khi đổi nhánh
Đội đứng ở nơi A (đã tới), đổi sang B: không có tin `zone` nào (probe), đội vẫn thấy danh sách đội ở A dù A không còn là "điểm của đội" (C1). `apply` chỉ `refreshZones` khi `step` đổi, và luật ponytail của `refreshZones` giữ danh sách cũ khi đứng ở nơi không hợp lệ. Hại thấp (chỉ đội cùng bước hoặc sau). Sửa khi rảnh: gửi `zone []` cho đội khi có hiệu ứng `switch`.

### 4.5 (nhỏ) Cổng skip của `scripts/sim.test.ts` (file của E) là so chuỗi
`engineReady` = `sim.ts` không chứa `"op: 'task'"`. Nếu E để lại chuỗi đó (kể cả trong chú thích), test tích hợp 3 bot (N9c) bỏ qua im lặng. Người tích hợp: sau khi ghép E, kiểm vitest báo **0 skipped** ở `scripts/sim.test.ts`, rồi xóa điều kiện thứ hai.

### 4.6 (nhỏ) `index.ts`: `decodeURIComponent` trước khi kiểm tên
`/api/race/x/media/%E0` → `URIError` không bắt → 500 thay vì 400. Sửa: kiểm `RACE_ID` / `MEDIA.name` trên đoạn thô trước (cả hai không cho `%`), hoặc bọc try.

### 4.7 (nhỏ) Chữ trong báo cáo track
- "40 check-in trên thảm → socket còn": trong test đội b đứng ở xuất phát (bước L1, chưa gửi vị trí, mỗi checkin nhận `boxFar`), không ở thảm. Bộ đếm ở RaceRoom không phụ thuộc vị trí nên test vẫn chặn được S4; chỉ sai chữ.
- open{branch} ghi 5 dòng (kế hoạch §5.4 / §9 ghi 3); ngân sách vẫn dư (63 / đội đo được ≤ 160).

## 5. Cho người tích hợp
- Lấy bản `scripts/sim.test.ts` của E khi ghép; xác nhận test 3 bot chạy (không skip).
- Gỡ op `task` khỏi `shared/protocol` + dòng `if (m.op === 'task') return;` trong `engine.ts` sau khi ghép A + B + C (theo báo cáo track).
- Nếu sửa 4.2: chỉnh test harness D1 (A→B→A) chờ hết khóa đầu.
