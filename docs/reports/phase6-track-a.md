# Phase 6 – Track A (Worker + RaceRoom): báo cáo

Trạng thái: **XONG** (2026-10-01). Worktree `.claude/worktrees/agent-a8a436f546bdaf2c2`, nhánh `worktree-agent-a8a436f546bdaf2c2`, gốc main @ 25d2543. `npm run build && npm test` qua trong worktree (worker 30 test, ≈ 23 s; chạy lại 3 lần không chập chờn).

## Đã làm
- **`worker/src/RaceRoom.ts`** (viết lại trên nền):
  - Hibernation API; attachment socket `{role, team, since, box}` (sống qua hibernation).
  - Cache `teams` trong RAM (`teams()`, vá khi ghi; không `SELECT` mỗi tin). Constructor dựng lại `live` (pose hợp lệ cuối mọi đội), `seq`, bộ đếm từ dòng `snapshot`.
  - Đăng nhập: mã đội không phân biệt hoa thường; 5 lần sai → khóa 60 s theo IP (sửa lỗi nền: hết khóa thì đếm lại từ 1, trước đây sai 1 lần là khóa lại ngay). Token HMAC 24 h kiểm ở DO khi mở socket (hết hạn / giả / cuộc đua khác / đội không tồn tại → 4401).
  - Thiết bị mới thắng: socket mới được accept TRƯỚC rồi mới `kick` + đóng 4409 socket cũ → đội không bị tính offline giữa chừng.
  - Vào lại (§8.10): `welcome.pose` = pose hợp lệ cuối (từ snapshot sau restart) + `bikeId` lấy từ `bikes.list()` (`owner === team`, theo yêu cầu track C); `summary.reconnects` = số lần đã kết nối.
  - Tin vào: giới hạn 15 tin/s/socket (cửa sổ 1 s, đặt trước parse) → 4429; chuỗi > giới hạn byte → 4413; không phải JSON / nhị phân / pose sai / tin lạ / op Host từ đội → 4400; socket đã đóng thì bỏ qua tin.
  - Kiểm tra tốc độ: `SpeedWindow` 3 s mỗi đội (đóng dấu giờ server), giới hạn `footSpeed` hoặc `footSpeed × bikeSpeedMultiplier` nếu có mẫu `bike` trong 3 s, × 1,25. Vượt → event `speed` (1 lần / đợt) + `teams.state.flagged = true` (chỉ đánh dấu cho Host, không phạt, không tự xoá); pose vượt không thành "hợp lệ". `respawn` → event `respawn {how, d}`, reset cửa sổ, pose = điểm hồi sinh; nhảy > 400 m → `suspicious: true` + flag. Kết nối lại / ngắt → cửa sổ mới.
  - Vòng tick `setTimeout` 200 ms chỉ chạy khi có pose trong 10 s gần nhất (+ tới khi các việc đến hạn xong) rồi dừng → DO ngủ được. Mỗi vòng: tick riêng từng socket (`presence.ts`: đội trong 500 m, không có chính mình; Host tất cả; chỉ gửi khi peer trong tick đổi hoặc tập peer đổi). Mỗi 1 s (`NET.slowTickMs`): `bikes.tick(players, now)`, đóng socket chết, 1 mẫu replay. Mỗi 2 s: kênh hộp. Snapshot đến hạn 2 s sau lần đổi đầu; replay 10 s; `host.state` ≤ 1 s sau thay đổi.
  - SQLite: `snapshot` 1 dòng upsert `{seq, poses: {team: encodePose(valid)}, counters}` mỗi 2 s khi có đổi + **ngay khi một đội ngắt**; `replay` 1 dòng / 10 s = mảng các mẫu 1 Hz (dạng tick) của 10 s đó; `events` ghi ngay (login, connect, disconnect, speed, respawn, host.createTeams) – 2 dòng mỗi event; `teams.state` khi đổi (reconnects, lastSeen, flagged, step).
  - Ngắt (`webSocketClose/Error`, hoặc ta tự đóng): idempotent (WeakSet `gone`); nếu đội không còn socket khác → lastSeen, event `disconnect`, snapshot ngay, broadcast `{t:'team', online:false}`, `host.state`.
  - Socket chết im: không tin / không ping trong `NET.deadSocketMs` 30 s (`max(attachment.since, getWebSocketAutoResponseTimestamp, tin cuối)`) → đóng `CLOSE.silent` 4408 + xử lý như ngắt. Quét trong vòng tick (mỗi 1 s) và trong `alarm()`.
  - Alarm: kết nối đội mà chưa có alarm → `setAlarm(now + spawnIntervalMinutes)`; `alarm()` = quét socket chết + `bikes.alarm(players)` (track C gắn lại khi còn người online).
  - Kênh hộp (§17.10): mỗi 2 s, mỗi socket đội: `boxVisible(attachment.box === hộp hiện tại, hypot(pose hợp lệ, hộp), legRules().boxReveal)` → đổi thì ghi attachment + `send` riêng socket đó `{t:'box', op:'reveal'|'hide'}`. Không bao giờ broadcast; hộp bước sau không gửi; `welcome.boxes` = hộp đã mở + hộp hiện tại nếu pose đã lưu trong bán kính (và attachment.box đặt theo đó → ra xa là `hide` đúng). 0 dòng SQLite.
  - `host.state`: gửi ngay sau `welcome` khi Host kết nối, sau `host.createTeams` (mọi Host), và ≤ 1 s sau mỗi thay đổi (pose, online, flag, op xe của Host). Có `flagged` thật + `steps` (= `legPoints()`).
  - Bộ đếm quota (wsIn, wsOut, http, alarms, rows) trong RAM, lưu trong dòng snapshot (0 dòng thêm), trả cho Host trong `host.state`.
- **`worker/src/index.ts`**: `/api/health`, `POST /api/login {race?, code | host}` (thiếu `race` → `paris`, mặc định của link không có `?race=`), `GET /api/race/:race/ws?token=`; một DO / cuộc đua (`getByName(race)`); không còn `dev` / `ping`.
- **`worker/src/race/presence.ts`, `race/boxes.ts`** (thuần) + test.
- **`shared/src/protocol`** (chỉ THÊM, không đổi hình dạng tin, không bump version): `NET.deadSocketMs = 30_000`, `NET.slowTickMs = 1_000`, `CLOSE.silent = 4408`, `HostState.steps?: {id, x, z}[]`.
- **`worker/src/test/harness.ts`**: thêm `until(match)`, `drain(ms)`, `sleep`, `setupRace(server, race, n)`, `joinTeam(server, race, code)`.

## Test (worker, `createTestHarness`)
- `RaceRoom.test.ts`: health / race id sai; Host đăng nhập; token sai → 4401; Host welcome + `host.state` (có `steps`) + tạo đội mã 6 ký tự; op Host từ đội → 4400, khung quá lớn → 4413; đăng nhập bằng mã, welcome, đá thiết bị cũ (kick + 4409), pose giữ khi vào lại, Host thấy offline; khóa sau 5 lần sai; token hết hạn / giả / cuộc đua khác / đội lạ → 4401; JSON hỏng, pose số lẻ, mode lạ, respawn sai, tin lạ, nhị phân → 4400, quá lớn → 4413, 16 tin/s → 4429; evict → teams còn, khóa đăng nhập mất (ponytail); đăng nhập không có `race` → `paris`.
- `RaceRoom.live.test.ts` (khối đồng thời, mỗi test một DO):
  - tick: A nhận B (300 m) không nhận C (900 m), B nhận A, C không nhận ai, Host nhận cả 3; không ai đi → không tick; A đi → B + Host nhận (B, C đứng im vẫn trong tick của Host), A không; C rời → tick Host bỏ C.
  - nhịp ghi: 2 đội 5 Hz × 6 s → snapshot 2–3 lần, `wsIn` tăng đúng 60, `rows` chỉ do snapshot; dòng replay xuất hiện sau ≈ 10 s với ≥ 5 mẫu 2 đội; ngoại suy ra 2 h / 20 đội theo §9.
  - tốc độ: 20 m/s → flagged + 1 event `speed`; 3 m/s + respawn 300 m → không flag, event `respawn {how:'safe', d:300}`; xe 5,5 m/s → không flag.
  - hộp: 200 m không có gì; 140 m đúng 1 `reveal` L1 (x, z đúng); đội B và Host không nhận; 165 m không `hide`; 175 m `hide`; 140 m `reveal` lại.
- Khối tuần tự (evict làm harness chờ vòng tick ngủ ≈ 10 s nên để sau): restart → `welcome.pose` = pose cuối, `welcome.boxes` có L1 cho đội đứng trong 150 m, đi ra → `hide`; bộ đếm giữ; `reconnects` 2; respawn ≈ 2 km → flagged; ngắt → Host nhận offline + snapshot `seq + 1` ngay; evict `hibernate` → attachment còn `box` → ra 175 m nhận `hide`.
- `race/presence.test.ts`, `race/boxes.test.ts`: bán kính (≤ 500 m tính là trong), không có chính mình, Host tất cả, chưa có pose → rỗng; dirty / đổi tập; hộp = đích của bước (D1 không có), `welcomeBoxes` (đã mở + hiện tại trong bán kính, không bước sau), `legPoints`.

### Số đo quota (từ test, so `docs/plans/phase6.md` §9)
| Mục | Đo | Ngoại suy 2 h / 20 đội | Plan |
|---|---|---|---|
| Tin vị trí lên | 5 tin/s/đội khi di chuyển, đếm đúng từng tin | 5 × 20 đội × 7 200 s ÷ 20 = 36 000 request (100 % di chuyển) + 344 phần khác = 36 344 | ≈ 36 300 xấu nhất, < 40 000 ✓ |
| Snapshot | 2–3 dòng / 6 s | ≤ 3 600 | 3 600 ✓ |
| Replay | 1 dòng / 10 s | 720 | 720 ✓ |
| Tổng dòng ghi (+ events / bikes / teams / alarm theo plan 2 750) | — | ≈ 7 070 | ≈ 7 100, < 20 000 ✓ |
- Kênh hộp, tick, `host.state`: chỉ tin gửi xuống (0 request), 0 dòng.

## Cách chạy test
- `cd worker && npx vitest run` (workerd qua `createTestHarness`, không cần `wrangler dev`; ≈ 23 s vì nhịp thật 2 s / 10 s). Toàn bộ: `npm run build && npm test` từ gốc worktree.
- **Môi trường worktree:** `node_modules` gốc của worktree nay là THƯ MỤC symlink từng mục sang repo chính, riêng `@race/{client,shared,worker}` trỏ về package của worktree (trước đó symlink cả thư mục làm `@race/shared` trỏ về `shared/` của main → thay đổi `shared/src/protocol` trong worktree không được thấy). Không commit (gitignore).

## Người tích hợp cần biết
- **Đổi `shared/src/protocol`** (chỉ thêm): `NET.deadSocketMs`, `NET.slowTickMs`, `CLOSE.silent` 4408, `HostState.steps?`. Track khác không phải đổi gì; merge thẳng.
- **Hook cho track C (không sửa file C):** `BikeIO` như nền (`send`, `broadcast`, `setAlarm` tính 1 dòng); `bikes.tick(players, now)` mỗi 1 s khi vòng tick chạy; `bikes.alarm(players, now)` trong `alarm()`; `bikes.onTeam(team, at = pose nhận cuối, m, walkOnly = false, now)`; `bikes.onHost(m, now)` rồi `host.state` ≤ 1 s; `welcome.pose.bikeId` = xe có `owner === team` trong `bikes.list()`; alarm đầu tiên do A gắn khi một đội kết nối mà chưa có alarm. `TeamState` của A không còn `bikeId` / `riding` (xe nằm trong bảng `bikes` của C).
- **Track B (client):** sau `welcome`, đội nhận `box` reveal/hide riêng; mã đóng: 4401 token (đăng nhập lại), 4409 thiết bị khác (dừng, không nối lại), 4408 im lặng / 4400 / 4413 / 4429 → nối lại (backoff). Phải gửi `ping` mỗi 5 s (không thì đứng im 30 s bị đóng 4408). Tick của đội chỉ gửi khi có peer đổi → client giữ peer cuối cho tới tick sau / `team online:false`.
- **Track D (Host page + sim):** Host nhận `host.state` ngay sau `welcome`, rồi ≤ 1 s mỗi khi đổi, và cũng nhận **tick đủ mọi đội** (có thể bỏ qua hoặc dùng làm vị trí realtime). `host.state.steps` = `[{id:'start'}, L1…L6, PS]` (x, z m) cho nút ứng viên xe. Bot `sim` **phải gửi `ping` mỗi 5 s** khi đứng im, nếu không bị đóng 4408 sau 30 s.
- `flagged` không tự xoá (Phase 10: nút Host xoá cờ). `teams.state.step` (mặc định 0) là chỗ Phase 7 ghi bước hiện tại; kênh hộp đọc từ đó.
- Kiểm thử: `evictDurableObject` của harness chờ vòng tick ngủ (≈ `NET.idleStopMs` sau pose cuối) — test evict để timeout 30 s.

## Ponytail (ghi `TODO.md` khi tích hợp)
- Khóa đăng nhập sai mã chỉ trong RAM (mất khi DO bị đẩy khỏi bộ nhớ).
- Bỏ xe / quét socket chết / kiểm hộp chỉ chạy khi vòng tick chạy (có người di chuyển trong 10 s); socket chết còn được quét ở alarm đặt xe (3 phút). Đội đứng im không cần kiểm hộp lại.
- Đội đang online không biết đội được tạo SAU khi họ vào (không có tin danh sách đội) – Host tạo đội trước khi phát mã.
- Mẫu replay đang đệm trong RAM (≤ 10 s) mất nếu DO bị đẩy khỏi bộ nhớ giữa chừng.
- Bộ đếm quota chỉ lưu khi ghi snapshot (lệch nhỏ sau restart).
