# Đội về đích vẫn điều khiển + chế độ xem (khán giả / Host / đội đã về đích) — báo cáo

Ngày 2026-10-04. Yêu cầu: (1) đội đã về đích / BỊ LOẠI / sau "Kết thúc" vẫn điều khiển nhân vật và gửi vị trí (bỏ "khán giả bay tự do vĩnh viễn" D19); (2) một CHẾ ĐỘ XEM chung (thanh chuyển đội + camera bám) cho khán giả (mã "K"+5), Host (đăng nhập game) và đội đã về đích (phím `X`). Thiết kế: `docs/reports/spectator-mode.md`. SPEC §17.39 + §17.40.

## Trạng thái
- [x] (1) Client: bỏ `spectating` / `spectateAt` / `raceClient.spectateAfterS`; đội xong vẫn có thân, camera thường, gửi vị trí; `X` bật / tắt chế độ xem; hint "Phím X: xem các đội khác" (commit `feat(finish)`)
- [x] (2) Máy chủ: mã khán giả `meta.spectatorCode`, vai trò `spectator` (token `s:<mã>`), 50 khán giả (`CLOSE.full` 4503), `host.spectator rotate`, `watch on/off` (attachment, tin cậy chỉ khi `engine.over(team)`), tick toàn bộ đội cho khán giả / Host / đội xong đang xem, `TeamInfo.racing` + tin `team {racing}` sau transaction, PROTOCOL_VERSION 7 (commit `feat(spectate): máy chủ`)
- [x] (2) Client: `spectate/` (Spectate.ts thanh + camera, watch.ts thuần, spectate.css), Login nhận `role: 'spectator'`, NetClient `full`, RemotePlayers.poseOf, Input.canLock, Host một dòng "Mã khán giả" (`drawSpectators` trong host/main.ts) (commit `feat(spectate): client`)
- [x] Test ngắn: `worker/src/race/presence.test.ts` (viewer `all`), `worker/src/auth.test.ts` (claims khán giả), `worker/src/RaceRoom.watch.test.ts` (mã đúng / sai, welcome thu gọn, tick đội ở xa, tin gửi lên bị bỏ, không nhận race / box / zone / feed, `watch on` khi đang đua không có tác dụng, Host Kết thúc → đội vẫn gửi vị trí, raceOver, claim `finished`, `watch on/off`, Đổi mã → 4401, 50 socket + socket thứ 51 bị `full`), `client/src/spectate/watch.test.ts` (followPose / smoothPose / inRoom / watchable / nextSlot) + RaceRoom.test / RaceRoom.live.test / RaceClient / NetClient / RemotePlayers / FreeFlyCamera + `npm run build`
- [x] Ảnh `screenshots/p9-watch.png` (thanh trên cùng, camera bám sau Đội Xanh đang đi, Đội Tím bên cạnh)
- [x] Docs: DEPLOY §4 (mục 6, mã khán giả + hạn mức), RACE_RULES Chặng dừng + §10 (không nhắc Louvre), README (mục Host, bảng phím, URL), CLAUDE.md (client/ spectate/, worker/, Input, URL, preset), TODO ("Khác"), SPEC §17.39–17.40 (chèn trước §17.41 của agent minimap)

## Quyết định
- Mã khán giả: `NET.spectatorPrefix` 'K' + `codeLength − 1` ký tự của `codeAlphabet`; `newCode(prefix)` kiểm không trùng mã đội và ngược lại (mã đội mới không trùng mã khán giả). Sinh lười ở lần `host.state` / đăng nhập đầu tiên (1 dòng meta + 1 event `host.spectator`).
- Máy chủ phân biệt vai trò theo giá trị mã (so với meta), token khán giả mang mã (`s:<mã>`): "Đổi mã" làm token cũ thành 4401 ngay ở lần nối sau và đóng socket đang mở.
- Socket khán giả: mọi tin (kể cả pose) bị bỏ ngay sau kiểm cỡ / tốc độ (vẫn đóng 4429 nếu flood); broadcast chung (`team`, `gesture`, `bikes`) vẫn tới — client không có thân nên bỏ qua; feed và `host.state` không gửi.
- `TeamInfo.racing` là optional trên dây (vắng = đang đua) để không phải sửa mọi fixture; máy chủ luôn gửi. `HostState.spectatorCode / spectators` optional (trạng thái `?demo=1` không có).
- Đội xong đang xem: `watch` ghi vào attachment socket (sống qua hibernation); `tickEntries` với `all` chỉ khi `engine.over(team)` (finishAt ≠ null hoặc status finished) — client không quyết được quyền. Tắt xem → tick rỗng kế tiếp đưa về bán kính (needsTick thấy key đổi).
- Client: camera bám áp qua `FreeFlyCamera.setPose` (một quy ước camera, V tiếp nối từ chỗ đang đứng). Khi bám, con trỏ chuột nhả (`Input.canLock` + `modal()` gồm `following`); bay tự do thì nhấp để khóa như cũ. Thân đội xong đóng băng (`fixedUpdate(frozen)`), không gửi pose, NPC / streaming theo camera.
- Hint "Phím X" dùng chung dòng chú thích của thanh (`Spectate.hint`); thanh của đội có thêm "X: điều khiển lại nhân vật".
- Host page: một `<p>` dưới link người chơi, vẽ lại chỉ khi mã / số khán giả đổi (nút không mất click); "Đổi mã" hỏi `confirm`.

## Hạn mức
- Đội đã về đích đi lại: ≤ 5 pose / s → ≤ 15 request / phút / đội (20 tin = 1 request); đứng yên = 0.
- Khán giả: đăng nhập (1 HTTP tới DO) + upgrade (1) ≈ 2 request / phiên; ping = auto-response, tick = wsOut (không tính). 50 khán giả không ghi dòng SQLite nào (ngoài 1 meta + 1 event khi sinh / đổi mã).

## Giới hạn
- Đội đã về đích đi lại vẫn hiện trong bảng "Tại điểm này" của đội khác (nhãn "Chặng dừng") — nhỏ, chấp nhận.
- Người xem thấy đội trong phòng Louvre từ mặt phố (không dựng phòng, không ảnh stand-in cho trường hợp này).
- Mã khán giả cũng được lưu vào localStorage như mã đội (ô "Vào lại" điền sẵn mã cuối).
- Không có menu `Esc` riêng cho khán giả: dùng menu chung (không có "Kẹt?" vì không có thân).
- Kiểm tay chưa làm: khán giả thật + Host thật trên bản deploy; tay cầm chưa gán phím cho `[` `]` `X`.
