# Phase 6 – Track A (Worker + RaceRoom): báo cáo

Trạng thái: **WIP – tạm dừng theo yêu cầu người dùng** (checkpoint 2026-10-01). Worktree `.claude/worktrees/agent-a8a436f546bdaf2c2`, nhánh của worktree này, gốc main @ 25d2543.

## Đã làm
- Setup worktree: symlink `node_modules` (gốc + workspace có sẵn) và `.cache` sang repo gốc (không commit symlink). Baseline `worker` vitest: 17/17 qua.
- `worker/src/race/presence.ts` (mới, thuần): `tickEntries(viewer, peers, radius)` (đội: peer trong 500 m, không có chính mình, chưa có pose → rỗng; Host = null → tất cả), `tickKey`, `needsTick(entries, dirty, lastKey)` (gửi khi peer trong tick đổi hoặc tập slot đổi). **Chưa có test.**
- `worker/src/race/boxes.ts` (mới, thuần): `stepBox(step)` (hộp = `destination` của `demoLeg.steps[step]`, qua `latLonToWorld`), `welcomeBoxes(step, pose, boxReveal)` (hộp đã mở các bước trước + hộp hiện tại nếu trong bán kính), `legPoints()` (start + đích các bước, cho trang Host / ứng viên xe). **Chưa có test.**

## Đang làm dở (chưa viết code)
`worker/src/RaceRoom.ts` — thiết kế đã chốt, chưa sửa file:
- Cache `teams` RAM (`teamsList()`, làm mới khi `createTeams`, `saveTeamState` sửa row trong cache).
- `live: Map<team, {pose, valid, at, win?: SpeedWindow, bikeAt}>`; khởi động: dựng từ dòng `snapshot` (`{seq, poses: {team: encodePose(valid)}, counters}`).
- `onPose`: rate limit (Map<ws,{start,n}> > 15/1 s → 4429, đặt trước parse), SpeedWindow (reset khi `win` chưa có — xoá `win` khi đội kết nối lại), giới hạn = foot hoặc foot × bike nếu có mẫu `bike` trong 3 s; vượt → `teams.state.flagged = true` + event `speed` (chỉ lần chuyển false→true); không vượt → `valid = pose`. Đánh dấu dirty slot, `lastPoseAt`, due snapshot/replay/host.
- Vòng `setTimeout` 200 ms (`wake()`/`loop()`): ticks (presence.ts, `sentKey` Map<ws,key>), mỗi 1 s `bikes.tick(players)` + đóng socket chết (không ping/tin 30 s: `max(attachment.since, getWebSocketAutoResponseTimestamp, live.at)` → thêm `NET.deadSocketMs = 30_000` vào `shared/src/protocol/constants.ts`, báo người tích hợp), mỗi 2 s kiểm hộp, snapshot due = lần đổi đầu + 2 s (`seq` trong data để test đếm), replay due = +10 s, host.state due ≤ 1 s; dừng khi im 10 s và không còn due.
- `respawn`: event (+ `suspicious` nếu > 400 m), reset cửa sổ, pose/valid = điểm hồi sinh.
- Kết nối đội: đá thiết bị cũ (đã có), `win = undefined`, `getAlarm()` null → `setAlarm(now + spawnIntervalMinutes)`, attachment `{role, team, since, box}`, `welcome.pose` = `valid` (từ snapshot sau restart), `welcome.boxes` = `welcomeBoxes`; Host: welcome + `host.state` ngay.
- Ngắt: lastSeen + event `disconnect` + snapshot NGAY + broadcast `team online:false` + host dirty.
- Kênh hộp: trạng thái "đã reveal" lưu trong **attachment của socket** (sống qua hibernation, 0 dòng SQLite); `boxVisible(was, hypot(valid, box), legRules().boxReveal)` → `send` riêng socket đội.
- `HostState`: thêm trường tùy chọn `steps?: {id,x,z}[]` (= `legPoints()`) cho track D/C — báo người tích hợp.
- `index.ts`: định tuyến hiện có (`POST /api/login {race}`, `GET /api/race/:race/ws`) đủ dùng; dự kiến không đổi.

## Còn lại
1. Viết `RaceRoom.ts` theo thiết kế trên; thêm `NET.deadSocketMs`, `HostState.steps?`.
2. Helper harness `drain(ms)` (gom mọi tin trong khoảng thời gian).
3. Test: `presence.test.ts`, `boxes.test.ts` (thuần); `RaceRoom.test.ts` đầu-cuối theo plan §6 Track A (tick 500 m / Host tất cả / đứng im vẫn trong tick / không đổi → không tick; 6 s 5 Hz 2 đội → `seq` snapshot tăng ≤ 3, replay 0–1; evict → `welcome.pose` = pose cuối + bộ đếm giữ; ngắt → `team online:false` + snapshot ngay; 20 m/s 3 s → flagged + event `speed`; respawn 300 m → không flag; 16 tin/s → 4429; token hết hạn → 4401; hộp: 200 m không, 140 m 1 reveal L1, đội B/Host không nhận, 165 m không hide, 175 m hide, evict + nối lại trong bán kính → `welcome.boxes` có L1). Test test "welcomes the Host" phải bỏ qua `host.state` gửi khi Host kết nối.
4. Số đo quota thực tế từ test, `npm run build && npm test`, commit `feat(phase6): track A – Worker + RaceRoom`.

## Cách chạy test
`cd worker && npx vitest run` (workerd qua `createTestHarness`, không cần `wrangler dev`). Toàn bộ: `npm run build && npm test` từ gốc worktree.

## Điểm lệch plan (dự kiến)
- Thêm `NET.deadSocketMs` và `HostState.steps?` (trường thêm, không đổi `PROTOCOL_VERSION`).
- Trạng thái reveal hộp nằm trong attachment socket thay vì RAM (để hide đúng sau hibernation).
- Abandonment xe / kiểm hộp chỉ chạy khi vòng tick chạy (có người di chuyển trong 10 s) — ponytail, ghi chú trong code.
