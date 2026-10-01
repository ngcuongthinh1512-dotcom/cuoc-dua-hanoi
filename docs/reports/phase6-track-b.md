# Phase 6 – Track B (client: login, NetClient, người chơi khác, ghép) – báo cáo

Trạng thái: **CHECKPOINT (người dùng tạm dừng)** – mới đọc xong tài liệu + code, chốt thiết kế; **chưa sửa file code nào**.

## Đã làm
- Setup worktree: symlink `node_modules` (gốc, `client`, `shared`, `worker`) + `.cache` từ repo gốc (không `git add` symlink; `.cache` hiện là untracked vì `.gitignore` chỉ khớp thư mục).
- Đọc: CLAUDE.md, `docs/plans/phase6.md` (toàn bộ), SPEC §7, §8.10, §17.2, §17.10, `shared/src/protocol/*`, stub `client/src/net/*`, `main.ts`, `Player.ts`, `CharacterModel`, `Animation`, `BikeModel`, `Bikes`, `Toasts`, `ui/types.ts`, `DebugOverlay`, `index.html`, `RaceRoom.ts` (login / upgrade / welcome), `worker/src/index.ts`, khối `p6-*` trong `scripts/screenshot.ts`.

## Đang làm dở
- Không có file dở dang (chưa viết code).

## Còn lại (thiết kế đã chốt, làm theo thứ tự)
1. `net/session.ts`: `isOnline(query, prod)` = (`?race=` hoặc PROD) và không `?offline=1`; `raceId(query)` (slug `/^[a-z0-9][a-z0-9-]{0,31}$/`, sai → `net.defaultRace`); DEV `?login` / `?login=back` = vẽ form / màn "Chào mừng trở lại" giả **không chặn**, trả `null` (preset `p6-login`, `p6-welcome-back`).
2. `ui/Login.ts` + `ui/login.css`: form mã đội (điền sẵn từ `localStorage` `netClient.storageKey`, try/catch), chuyển sang "Host: mật khẩu"; `POST /api/login` `{race, code}` / `{race, host}`; lỗi `bad_code` "Mã đội không đúng", `locked` đếm ngược `retryMs`, `bad_password`, lỗi mạng; `summary.reconnects > 0` → "Chào mừng trở lại, <tên đội>!" + tóm tắt + "Tiếp tục". Hàm thuần xuất ra để test: `normalizeCode` (hoa, bỏ khoảng trắng), `readStoredCode/storeCode` (storage ném lỗi vẫn chạy).
3. `net/NetClient.ts`: tham số thứ 3 tùy chọn `deps {WS, now, setTimeout}` cho test; URL `ws(s)://host${net.apiBase}/race/${race}/ws?token=`; thuần + test: `PoseGate` (gửi khi `!samePose` và cách lần trước ≥ 1000/`NET.sendHz` ms), `backoffMs(attempt)` (dãy `netClient.reconnectMs`, lặp số cuối), `ClockSync` (offset = max(offset − trôi nhỏ, serverMs − local) mỗi tick/welcome); chuỗi `'ping'` mỗi `NET.pingMs` → `'pong'` → `rtt`; close 4409 → `status(false,'otherDevice')` dừng; 4401 → `badToken` dừng; 4410 → `raceClosed`; 4400/4413/4429 → `protocol` dừng; khác → reconnect; `welcome.v !== PROTOCOL_VERSION` → đóng, báo tải lại; `session.welcome = w`.
4. `net/RemotePlayers.ts`: thuần + test `Track` (buffer mẫu theo `serverMs`; vẽ ở `serverNow − remote.interpolationMs`; nội suy tuyến tính, yaw ngắn nhất qua ±π; ngoại suy ≤ `extrapolateMs` rồi giữ; nhảy > `snapDistance` → xóa buffer = đặt thẳng; vận tốc suy từ 2 mẫu); mỗi slot `CharacterModel` (áo màu đội + bảng tên) + `CharacterAnimator` + `PlayerState` giả (`jumps++` khi vào `air`, `actionTime` về 0 khi `action` đổi); `mode === 'bike'` → `BikeModel` riêng (lean suy từ tốc độ quay yaw, kẹp `bike.leanMaxDeg`, `rollWheels`, `setRider(riderTargets())`); ghost (không Rapier); ẩn ngoài `renderRadius`; slot vắng trong một tick = ra khỏi 500 m → ẩn; `setOnline(false)` → ẩn; `gesture('wave')` không làm gì về hình (pose đã mang `action`, tránh chạy 2 lần), `'bell'` → `bell()` nếu trong `remote.bellRadius` (thêm vào khối config B, 60 m).
5. Hộp mật thư client (§17.10): `net/ClueBoxes.ts` – reducer thuần (welcome thay danh sách, `reveal` thêm/cập nhật, `hide` bỏ qua hộp `opened`) + mesh hộp đơn giản + cờ, đặt lên `groundAt` (fallback `heightAt`); DEV `?boxes=step,x,z[,opened];…`.
6. `Player.ts`: `parseOverrides(q, online)` online chỉ giữ `npc*`; `setSpawn(x,z,yawDeg)` (trước activate: spawn tạm để chunk tải quanh đó); `onGesture?(g)` khi G bắt đầu vẫy / R chuông; `onRespawn?(how)` bọc `controller.respawn` (trong fixedUpdate = `'fell'`) – không sửa `CharacterController.ts`.
7. `main.ts`: `startSession` chạy sớm (song song tải thế giới); Host → khán giả bay (không thân, `?cam=` được phép), tải asset riêng cho `RemotePlayers`; đội online: bỏ `?cam=`, `V` tắt (`canFly = !session`; Phase 7: đội về đích); `worldReady` chờ `welcome` đầu (spawn tại `welcome.pose`, gửi `respawn` 'safe' sau khi đặt để server reset cửa sổ tốc độ); `status` → panel `#net` "Mất kết nối – đang nối lại…", kick → panel lỗi cố định; F3 dòng Mạng (ping, số người, nối lại); DEV `?peers=slot,x,z,yawDeg,mode[,action];…` người chơi giả (tick giả 5 Hz theo đồng hồ mô phỏng).
8. `ui/Toasts.ts` + `ui/types.ts`: `NoticeCode` thêm `bikeLost` "Chậm một bước! Xe đã có người lấy.", `bikeGone`, `bikeParked`, `walkOnly`, `otherDevice` "Đội của bạn vừa đăng nhập trên thiết bị khác", `reload`; sửa test danh sách mã trong `Toasts.test.ts`.
9. `index.html`: panel `#net`; preset `[B]`: `p6-login`, `p6-welcome-back`, `p6-peers`, `p6-debug` (port 5302).
10. Test bắt buộc theo plan §6 Track B; `npm run build && npm test`; chụp `p6-*` của B + xem PNG; `npm run ride-check` mặc định.

## Điều cần biết cho người làm tiếp / người tích hợp
- **Xe người khác vẽ 2 lần?** RemotePlayers vẽ `BikeModel` dưới người đạp từ xa (quyết định 13); Track C (`Bikes` chế độ server) cần **ẩn xe `rider: true` của đội khác** để không trùng.
- Vào lại khi đang giữ / ngồi xe (`welcome.pose.bikeId`, `mode 'bike'`): phần xe là của Track C (`Bikes.applyServer`), B chỉ đặt chỗ đứng.
- ZonePanel "Tại điểm này": Phase 7 (chưa có vùng) theo plan §1.

## Cách chạy test
- `npm run build && npm test` (từ gốc worktree); `SCREENSHOT_PORT=5302 npm run screenshot -- p6-login p6-welcome-back p6-peers p6-debug`; `SCREENSHOT_PORT=5302 npm run ride-check`.
