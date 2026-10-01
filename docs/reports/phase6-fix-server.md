# Phase 6 – review fixes (server)

Phạm vi: `worker/**`, `shared/src/protocol/**`.

## Finding (major): các lệnh ghi SQLite theo đội không bị giới hạn

- **Sự kiện `speed`**: trong `RaceRoom.onPose`, mỗi đợt vượt tốc mới vẫn được gắn cờ, nhưng chỉ ghi event khi số đợt của đội đó trong `NET.respawnWindowMs` (60 s) còn ≤ `NET.maxRespawns` (6). Giới hạn này giống cách đã làm với respawn/jump.
- **Lệnh xe đạp** (claim / mount / dismount; lệnh nào cũng có thể ghi 1 hàng `bikes`, kèm event): mỗi đội được tối đa `NET.maxBikeOps` = 12 lệnh trong mỗi `NET.respawnWindowMs`. Vượt quá thì socket bị đóng với `CLOSE.tooFast` (4429). Người chơi thật không bao giờ chạm tới mức này. Bộ đếm nằm trong RAM theo đội (`RaceRoom.ops`), nên reconnect không xoá được nó. Dữ liệu vẫn được ghi trước khi ack, không có thay đổi nào chỉ nằm trong RAM.
- Trường hợp xấu nhất cho mỗi đội gian lận: khoảng 12 lệnh xe × ≤ 2 hàng + 6 event speed mỗi phút. Trước đây là khoảng 14 hàng/s.
- Hằng số mới: `NET.maxBikeOps` trong `shared/src/protocol/constants.ts`.

## Test

`worker/src/RaceRoom.live.test.ts` › "SQLite row budget": 8 đợt vượt tốc (mỗi đợt gồm respawn + 80 m trong 1,6 s) → đúng 6 event `speed`. 13 lệnh dismount liên tiếp → socket đóng 4429. Nếu không có bản sửa, test sẽ thấy 8 event và không có lệnh đóng socket.

Gate: `npm run build && npm test` đều pass (589 + 53 + 25 + 20 test).
