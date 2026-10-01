# Phase 6 – sửa lỗi review, phần client

Phạm vi: `client/src/net/**`, `client/src/main.ts`, `client/src/config.ts`, `scripts/screenshot.ts`.

## 1. Xe dùng chung của server chưa được nối vào client (blocker, 3 báo cáo trùng nhau)
- Thêm `client/src/net/bikeLink.ts` (`BikeLink`): `welcome` → `bikes.setTeams(w.teams)` + `bikes.applyServer(w.bikes, [], true)`;
  tin `bikes` → `applyServer(list, gone, full)`; tin `bike` → `onClaimResult`. Vào lại sau F5 (SPEC §8.10): welcome đầu tiên có
  `pose.bikeId` và `pose.mode === 'bike'` → khi thân đã đứng trên đất (≤ `netClient.remountSeconds` = 3 s) gọi `interact` = gửi
  `claim` xe của mình, server trả ok → lên xe. Sau khi kết nối lại (không phải F5) thân vẫn ngồi xe, `Bikes.sync` tự báo `mount`.
- `main.ts`: `player.bikes.notify = notice` (cả offline, preset `p6-bike-lost`); online `bikes.net = net`,
  `bikes.ground = groundAt(world, x, z, max(y, heightAt) + 3)`; team / colour đã có từ `Player.create(…, session.team)`.
  Gọi `bikeLink.welcome / message / frame` trong handler NetClient và vòng lặp.
- Test: `client/src/net/bikeLink.test.ts` (Bikes thật + Rapier): welcome / bikes / gone / claim bị từ chối → toast `bikeLost`;
  F5 khi đang đạp → gửi đúng 1 `claim`, trả ok → `c.riding` là xe đó.
- Preset `p6-bike-lost`: toast đã hiện khi chạy thử (DOM `#toasts` có "Chậm một bước! Xe đã có người lấy.") nhưng hết 4 s trước khi
  `__READY__` (NPC làm headless chậm) → preset nay `&wait=0.2&npc=0`; đã chụp lại, toast hiện trên minimap.

## 2. Mã đóng 4429 làm đội rời cuộc đua (major, 2 báo cáo)
- `NetClient.ts`: bỏ `tooFast` / `tooBig` / `badMessage` khỏi `FINAL` → các mã này kết nối lại với backoff (1 → 15 s) như mất mạng.
- Chuông / vẫy tay: gửi tối đa mỗi `netClient.gestureGapMs` (500 ms) trong `main.ts` (chuông vẫn kêu tại chỗ).
- Test: `NetClient.test.ts` "too many / too big / bad message closes reconnect with backoff" (fail với bản cũ: trạng thái `protocol`).

## Chưa làm / ngoài phạm vi
- Chưa chạy thử hai trình duyệt thật với `wrangler dev` (tranh xe, F5 lên lại xe); logic được phủ bằng test đơn vị ở trên.
- Phía server (gợi ý thêm, không bắt buộc): token bucket cho phép burst sau khi nghẽn mạng thay vì cửa sổ 1 s cố định
  (`worker/src/RaceRoom.ts` ~438–446), để client khỏi phải kết nối lại.

## Gate
`npm run build && npm test` qua.
