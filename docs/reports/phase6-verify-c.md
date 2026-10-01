# Phase 6 – Kiểm tra độc lập Track C (xe chung)

Người kiểm: verifier đối kháng (không viết code này). Commit: `0771416` so với nền `25d2543`.

## Đã chạy
- `npm run build && npm test`: **qua** (scripts 18, shared 24, client 548, worker 34).
- `SCREENSHOT_PORT=5311 npm run ride-check` (offline): xem kết quả cuối file.
- `git diff --stat 25d2543 HEAD`: chỉ file của C (`worker/src/race/{VehicleSpawner,BikeService}*`, `client/src/vehicle/Bikes*`, `client/src/host/spawnCandidates*`, khối `serverBikes` trong `config.ts`, dòng `[C]` trong `screenshot.ts`, báo cáo C). Không đụng SPEC / TODO / CLAUDE.md.
- Script tái hiện `scratchpad/repro.ts` (BikeService thật trên `node:sqlite`): cả 5 tình huống dưới đây **tái hiện được**.

## Lỗi chính (major)
1. **Lộ vị trí đội khác qua `bikes`.** `welcome.bikes` (`list()`) và mọi broadcast `bikes` gửi cho **mọi** socket, có `owner` + x, z: xe đang đạp (vị trí RAM = vị trí người đạp), chỗ đội khác xuống xe (thường cạnh hộp mật thư). Vượt bán kính quan tâm 500 m (§7, quyết định 5/18) và làm hỏng §17.10. Thêm: mọi xe trống ở cả các đoạn sau đều gửi đi; ứng viên lộ trình chỉ ~12 điểm/đoạn nên tọa độ lặp lại → lộ hành lang. Client vốn ẩn xe ngoài `groundRadius` 200 m nên lọc theo đội không mất gì.
   Tái hiện: t3 xuống xe ở (2401, −1800) → broadcast `{owner:'t3', x:2401, z:-1800}` cho tất cả.
2. **"Gọi" xe của mình từ xa.** `claim()` bỏ kiểm khoảng cách với xe của chính đội kể cả khi `rider:false` (xe đứng yên). Client sửa đổi gửi `{t:'bike', op:'mount', id}` từ 190 m → `ok`, tick kế dời xe tới người chơi. Trái quyết định 14 (đội cách xe ≤ interactRadius + 1 m).
3. **Vòng lặp rider bật/tắt mỗi giây (quota).** `tick()` coi đội vắng trong `players` là offline và đặt `rider:false` (1 dòng ghi + broadcast); `players()` = đội online **có pose** trong `live` (RAM). Sau khi DO thức dậy từ hibernation, đội đang ngồi xe đứng yên không có pose → mỗi tick `rider:false`, client `Bikes.sync` gửi `mount` → `rider:true` (thêm 1 dòng)… Tái hiện: 60 s → 60 tin `mount`, **120 dòng ghi** cho một đội, kéo dài tới khi đội đó di chuyển.

## Lỗi nhỏ (minor)
- Vị trí xe đang đạp chỉ ở RAM: DO khởi động lại giữa lúc đạp, chủ rời đi trước khi gửi pose → xe "quay về" chỗ nhận xe, chủ vào lại ở chỗ snapshot → 61 s sau xe biến mất (tái hiện). Báo cáo C nói "tới tick kế" là chưa đúng khi chủ offline.
- `host.spawning paused` không chặn đợt đầu (tái hiện: tạm dừng rồi gửi ứng viên → 8 xe).
- `dismount` nhận `y` hữu hạn bất kỳ (1e300) → client không dò được mặt đất → xe ẩn và không lấy được, vẫn chiếm chỗ ở bãi (Phase 7).
- Test `BikeService` đầu tiên dùng seed `crypto` với 8 đoạn × [0, 1] → hỏng ngẫu nhiên ≈ 0,4 % lần chạy.
- Mồi không bao giờ đứng ở `bicycle_parking` còn xe lộ trình ưu tiên giá xe OSM → so với OSM phân biệt được mồi.
- `p6-bike-lost` chưa hiện toast (chờ B nối `bikes.notify`), đã ghi trong báo cáo C.
- id Host `h<ms>`: hai lệnh thêm cùng ms ghi đè nhau (đã ghi ponytail).

## Ride-check
`SCREENSHOT_PORT=5311 npm run ride-check`: **OK** (offline không đổi: đi bộ 4,0, xe 5,2 m/s, ngã → lên lại, xuống).
