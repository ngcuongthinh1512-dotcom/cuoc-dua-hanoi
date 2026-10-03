# Thảm về đích 16 × 32 m, bỏ cổng "VỀ ĐÍCH", chỉ dẫm lên thảm mới về đích (2026-10-03, SPEC §17.38)

## Đã làm
- **Kích thước một chỗ:** `PIT_MAT = { width: 16, length: 32, slack: 0.5 }` trong `shared/src/constants.ts`; `raceClient.mat` (client/src/config.ts) đọc `length` / `width` từ đó, người dẫn chương trình đứng `PIT_MAT.width / 2 + 1.4` m ngoài mép dài (trước 5,4 m với thảm rộng 8 m).
- **Bỏ cổng:** `raceClient.matGate` xóa; `client/src/race/PitStop.ts` không còn canvas băng rôn / cột / vải; thảm = 6 draw call (thảm, 4 viền, cột sáng đỏ). Test `ClueBoxes.test.ts` đếm 6.
- **Thảm quay theo yaw vùng:** `ClueBoxes.sync` đặt `rotation.y = yaw` cho thảm (trước đây cố định hướng bắc, ghi trong TODO "thảm không quay theo yawDeg" — đã gỡ dòng đó); `PitHost.update` xoay offset [side, along] theo `mat.rotation.y`.
- **Chỉ dẫm lên thảm mới tính:** hàm thuần `onPitMat(x, z, {x, z, yaw?}, slack = 0.5)` cạnh `PIT_MAT` (không phụ thuộc zod nên client dùng được). `Zone.mat?: true` do `stepZones` gắn cho vùng Chặng dừng (cả bước lộ trình dẫn tới nó, cùng một object). `steps.ts inside()` rẽ: `zn.mat ? onPitMat(...) : vòng tròn r + slack` → mọi chỗ gọi (`arrive` của pose, `checkin`) đổi theo; `geofenceSlack` 2 m không mở rộng thảm. `engine.placeAt` (bảng "Tại điểm này") dùng `inside` nên ở Chặng dừng cũng tính theo thảm. Client `RaceClient.matAt` dùng `onPitMat` nên chỉ gửi `checkin` khi đứng trên thảm (không spam boxFar). Hiện hòm 150 m, vùng cấm NPC, `leg:check` (ngoài nhà / tới được / bãi xe, radius 15–40) giữ vòng tròn như cũ; `destination.radius` của `pit_stop` vẫn đọc như trước.
- **Docs:** RACE_RULES mục 5 (bước lên thảm, đứng ngoài thảm không tính, bỏ câu biển / cổng), LEG_FORMAT 5.4 + mục 6 + bảng `radius` + ghi chú ảnh "Xem" (3 × 7 → 16 × 32), CLAUDE.md dòng PitStop, TODO.md, SPEC §17.38, cảnh báo `leg:check` "hoàn thành khi dẫm lên thảm".

## Kiểm tra
- Vitest: `shared` constants.test.ts (mới: trong / sát mép / ngoài mép / góc / dung sai / yaw 90° và 33°) + leg.test.ts (cờ `mat` ở vùng 3, 4) — 30 pass; `worker` steps.test.ts (test mới: 10 m cạnh thảm trong bán kính 25 m không tính, góc 7,9 × 15,9 tính, dung sai 0,5 m, checkin cách 9 m → boxFar, yawDeg 90 xoay chữ nhật) + engine.test.ts — 69 pass; `client` ClueBoxes.test.ts (6 mesh, `rotation.y` = yaw) + RaceClient.test.ts (đứng 15 m dọc thảm thì check-in, 10 m bên cạnh thì không) — 23 pass.
- `npm run build`: xem mục Kết quả.
- Ảnh: `screenshots/finish-mat.png` (preset leg-PS, cam 60 m trên thảm, yaw 0).

## Kết quả
- `npm run build` pass (tsc mọi workspace, client build, `wrangler deploy --dry-run`).
- `screenshots/finish-mat.png` (gitignore): thảm đỏ 16 × 32 m viền vàng chiếm rõ một góc sân, cột sáng đỏ ở tâm, không còn cổng / biển; `?cam=` là chế độ khán giả nên không có NPC dẫn chương trình trong ảnh (như trước).
- Diff 18 file + 2 file mới, không chạm RaceRoom.ts / presence.ts / auth.ts / shared/src/protocol / main.ts / ui/Login.ts / host (phần của agent chế độ khán giả); config.ts chỉ sửa khối `raceClient` (import `PIT_MAT`, `mat`, bỏ `matGate`, offset host).

## Chưa làm / ghi chú
- Không chạy ride-check / sim / bộ test đầy đủ (theo yêu cầu). `sim --leg` bot đi tới đúng tâm vùng nên vẫn đứng trên thảm; bot "straggler" dừng cách `r + 15` m → ngoài thảm như trước.
- `leg:check` chưa kiểm 4 góc thảm có nằm trong nhà / dưới nước (chỉ kiểm tâm như cũ); thêm nếu điểm thật đặt gần tường.
