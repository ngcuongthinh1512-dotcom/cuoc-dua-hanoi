# Phòng Louvre: nút "Vào phòng", "CHÍNH XÁC", tự ra sau 5 s (SPEC §17.33, 2026-10-03)

## Bổ sung (commit 2: bỏ lối ra thủ công)
- `LouvreRoom.ts`: xóa cửa (2 box) + biển "Lối ra – bấm F" (mesh, đổi chữ khi xong), `RoomTarget` không còn `door`, `targetAt` / `roomPrompt` bỏ nhánh cửa, `setPicks(picks)`; config bỏ `exitSign`, `doorReach`, `colours.exitSign` (giữ `door.width` làm khe chừa chỗ chân rơi khi vào).
- `main.ts`: bỏ F ở cửa; `lockSent` (đặt khi `race.lock()` gửi, xóa khi `lockWrong`) → "CHÍNH XÁC" chỉ khi chính đội chốt đúng, Cho qua chỉ đếm ngược; `over` (`view.result` / `status === 'finished'`) → ra ngay; `leaveRoom()` luôn `openCurrent()` (thẻ kế / thẻ đích).
- Test: `targetAt` ở tường trước → null, bỏ dòng prompt cửa; 79/79 (4 file). Toasts.test.ts đang fail do `Toasts.ts` của agent khác (bikeTaken), không thuộc việc này.

## Đã làm (commit 1)
- `client/src/config.ts`: `louvreRoom.autoExitSeconds: 5`, `raceHud.announceSeconds: 3`.
- `client/src/race/LouvreRoom.ts`: `ROOM_TEXT` ("CHÍNH XÁC", "Bạn sẽ ra khỏi phòng sau n giây…"), hàm thuần `autoExitLeft(doneAt, now)`.
- `client/src/race/ui/format.ts`: `louvreInfo(...).enter` = `{enabled, hint}` (null khi trong phòng / đã xong; `nearBox` quyết định mờ hay không) → `cardPanel` nhận `nearBox`.
- `client/src/race/ui/RaceHud.ts`: `actions.enterRoom?()`, `setRoom(inside, nearBox)`, nút "Vào phòng" trong khối louvre (bấm → `enterRoom()` rồi `close()` ngay trong click handler → chuột khóa lại qua `onOpenChange`), `announce(text)` = chữ lớn giữa màn hình (`.rc-big`, xanh lá, z trên overlay); thẻ kế sau chốt đúng **không tự bật** khi đội còn trong phòng (`setView`: đánh dấu đã thấy, main.ts mở sau khi ra).
- `client/src/main.ts`: `nearBox(rc)` dùng chung cho F và nút; `enterRoom(step, lv, openCard)`; vòng frame: bước xong khi đang trong phòng → `announce("CHÍNH XÁC")`, prompt đếm ngược, `autoExitLeft === 0` → `leaveRoom()` + `openCurrent()`; F ở cửa → `leaveRoom()` (xóa đếm ngược) + mở thẻ kế nếu đã xong. `near` tính cả khi thẻ đang mở (ngoài `modal()`), nên nút trên thẻ đổi trạng thái sống.
- Máy chủ không đổi (chốt đúng → `complete` → thẻ kế như cũ).

## Quyết định
- Điều kiện nút = đúng điều kiện phím F (≤ `enterReach` 3 m): an toàn, không teleport theo x, z.
- Host "Cho qua" khi đội đang trong phòng đi cùng đường (hiện "CHÍNH XÁC" rồi tự ra) – chấp nhận, ghi SPEC §17.33.
- Tải lại trong 5 s: luật cũ (card không còn louvre → không dựng phòng → spawn trên sân), không sửa gì.

## Kiểm
- Vitest: `LouvreRoom.test.ts` (+ `autoExitLeft`, `ROOM_TEXT`), `louvre.test.ts` (+ nút theo trạng thái), `RaceClient.test.ts`, `card.test.ts`, `Toasts.test.ts`: 86/86.
- `tsc` client / shared / scripts / worker 0 lỗi trong file của mình; `vite build` + `wrangler deploy --dry-run` OK. `npm run build` toàn bộ fail chỉ vì `client/src/world/bridgeAudit.test.ts` (file chưa track của người khác, không đụng).
- Không chạy ride-check / sim / screenshot (theo yêu cầu). Chưa E2E thật → TODO.
