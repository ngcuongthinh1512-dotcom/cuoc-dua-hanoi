# Phase 8 – Track B: ghép client

Trạng thái: **xong** (2026-10-02). Nhánh `phase8-track-B`, từ `0818033`. Kế hoạch: `docs/plans/phase8.md` §6 Track B, D7, D9, D13, D15 (B1).

## Đã làm
- **B1 (`main.ts`)**: `raceHud.onOpenChange` → mở: `document.exitPointerLock()`; đóng: `input.lock()` ngay trong handler phím / bấm đã đóng thẻ + cờ khung `cardClosed` (Esc / Enter / Space vừa đóng thẻ không mở Menu / mở lại thẻ / nhảy trong khung kế). `onPointerLockChange`: không tự mở Menu khi `raceHud.open` (như bản đồ `M`). Tab đóng thẻ / Sổ trong vòng khung → khóa chuột ngay trong `keydown` (Firefox), trừ khi đang gõ trong ô nhập. Bấm vào nền mờ ngoài thẻ (overlay `pointer-events: none` → click tới canvas, `Input` khóa chuột) → đóng thẻ trước (`raceHud.toggleBook()`), tránh trạng thái thẻ mở mà chuột bị khóa. `Enter` (`keys.clueCard`) khi không có gì mở (`!modal()`, không bay tự do, không ngay sau khi vừa đóng thẻ) → `raceHud.openCurrent()`. Tên đội: `session.team.name` (nền đã nối).
- **D7 (`net/ClueBoxes.ts`)**: khóa `step|branch` (`keyOf`) cho danh sách + bản vẽ; `nextBoxes`: `reveal` thay đúng `step|branch`, `remove` gỡ hòm nhánh **kể cả đã mở**, `hide` như v2 (không gỡ hòm đã mở); `boxRotation(yaw) = yaw + π` (mô hình mặt trước +z; yaw 0 → mặt trước hướng bắc, π/2 → tây; không có `yaw` = bắc); thảm Chặng dừng không quay (ponytail: `PitHost` đứng ở độ lệch cố định); `parseBoxes`: `step[|branch],x,z[,opened][,yawDeg]`; vùng cấm NPC đã theo `boxes.onChange` (hòm nhánh vào / `remove` ra – có test).
- **D9 (`RaceClient.frame`)**: khi `serverNow ≥ card.lockedUntil + raceClient.lockEndSlackMs` → `deps.pose()` (= `net.flushPose(poseOf())`) **một lần cho mỗi giá trị `lockedUntil`**; thẻ tự đổi trạng thái là việc của C.
- **D13 (`net/session.ts`)**: `mediaUrl(race, name)`, `fetchMedia(session, "r2:<name>" | "<name>")` → `GET /api/race/<race>/media/<name>` với `Authorization: Bearer <token>` → `blob:` URL, cache theo `race/name` (chỉ giữ thành công; 404 / lỗi mạng → null, lần sau hỏi lại); không session / tên sai mẫu `MEDIA.name` → null, không fetch. `main.ts`: `resolveMedia: (name) => fetchMedia(session, name)` (offline → null → C vẽ ô "hình chỉ tải trong cuộc đua").
- **Móc D15**: `answer` / `branch` / `accept` gửi thẳng (không vị trí trước, D8 – nền); `open` (F) gửi vị trí trước + `branch` của hòm (`interact`); âm `reviewSound(true|false)` (`audio/sfx.ts`, WebAudio) khi notice `approved` / `penalized`.
- **Gỡ `RaceClient.task`** (+ test). `main.ts` giữ `task: () => {}` vì `RaceHudActions.task` (của C) còn bắt buộc trong nhánh này – **người tích hợp xóa dòng đó khi ghép C** (có `TODO(phase8 integrator)`).
- Config `raceClient.lockEndSlackMs: 1000`.
- Preset: `p8-box-yaw`, `p8-box-branch`, `p8-media-offline`; `p7-box-close/opened` + `p7-openbox` thêm `yawDeg 180` để vẫn nhìn mặt trước hòm như Phase 7.

## Test
- `ClueBoxes.test.ts`: `remove` gỡ hòm mở, `hide` giữ hòm mở, hai hòm cùng `step` khác `branch`, `reveal` chỉ thay `step|branch` của nó, `boxRotation` (0 → bắc, π/2 → tây, π → nam, không yaw → bắc), `parseBoxes` nhánh + yaw, cảnh: 2 hòm nhánh vẽ cạnh nhau đúng góc, `remove` gỡ khỏi cảnh và khỏi vùng NPC.
- `RaceClient.test.ts`: `boxInReach` trả hòm có `branch` → `open {step, branch}` qua `op` (vị trí trước); hết khóa: `pose` đúng **một** lần sau `lockedUntil + slack`, không lặp khi `race` cũ tới lại, lần khóa mới → thêm một lần.
- `session.test.ts`: `fetchMedia` không session → null (không fetch), tên sai → null, header `Authorization` (token không trong URL), cache một blob mỗi tên, 404 hỏi lại, lỗi mạng → null.

## Lệch kế hoạch
1. `fetchMedia` / `mediaUrl` ở `net/session.ts` (hàm nhận `session`), không phải phương thức `RaceClient`: offline không có `RaceClient` mà thẻ vẫn cần trả `null`; test "không session → null" thành hàm thuần.
2. `fetchMedia` nhận cả `"r2:<name>"` lẫn `"<name>"` (chữ ký `resolveMedia?(name)` của nền không nói rõ có tiền tố).
3. Không thêm `raceClient.lockPoseResend` (công tắc không bao giờ đổi; YAGNI). Không thêm gì vào khối `clueBox` (độ lệch π là sự thật của mô hình, nằm cạnh hình học).
4. `p8-box-yaw` dùng hai hòm **mở** (hòm đóng giống nhau mọi phía: không thấy hướng), nhìn từ trên xuống hướng bắc.
5. `p8-media-offline` chỉ hiện ô thay hình khi ghép C (`DEMO_CARDS.media` + vẽ media là của C); trong nhánh B ảnh là thẻ Lộ trình mặc định.
6. Bấm vào nền mờ ngoài thẻ = đóng thẻ (thêm, không có trong kế hoạch): nếu không, click tới canvas khóa chuột khi thẻ còn mở.

## Thử tay

**Chrome (đã thử, 2026-10-02)** – Chrome hệ thống qua Playwright (headless mới, khóa chuột thật: `pointerlockchange` thật), Vite `:5191`, offline `?player&npc=0&card=challenge&full`. Vì `RaceHud` của nền **chưa gọi** `onOpenChange` (việc của C), tôi vá **tạm** 4 dòng vào `RaceHud.ts` (gọi `onOpenChange(true)` ở `openFull` / mở Sổ, `onOpenChange(false)` ở `close` khi đang mở) chỉ để thử, rồi `git checkout` lại – **không commit**. Kết quả từng bước (`locked` = `document.pointerLockElement`):

| Bước | Kết quả |
|---|---|
| 0. Thẻ tự bật lúc vào | thẻ mở, chuột tự do, không Menu ✓ |
| 1. Bấm vào nền mờ ngoài thẻ | thẻ đóng, chuột khóa, không Menu ✓ |
| 2. Enter (không có gì mở) | thẻ hiện tại mở lại, chuột nhả, **không Menu** ✓ |
| 3. Esc | thẻ đóng, chuột khóa lại, **không Menu** ✓ |
| 4. Tab | Sổ mở, chuột nhả, không Menu ✓ |
| 5. Tab | Sổ đóng, chuột khóa (khóa trong `keydown`) ✓ |
| 6–7. Enter rồi Space | thẻ mở rồi đóng, chuột khóa, **không nhảy** (`velocity.y` 0) ✓ |
| 8–9. Enter rồi bấm nút "Đóng (Tab)" | thẻ đóng, chuột khóa ✓ |
| lỗi console | 0 ✓ |

Phát hiện khi thử (đã sửa): khung trình duyệt chậm (thanh trình duyệt ẩn ≈ 2 fps) cho thấy chặn "Esc vừa đóng thẻ" bằng 300 ms (`unlockedAt`) sẽ hở khi khung > 300 ms → đổi sang cờ theo khung `cardClosed` (đặt trong `onOpenChange(false)`, xóa sau `input.endFrame()`): Esc không mở Menu, Enter không mở lại thẻ, Space không nhảy trong khung đó.

**Chưa thử (ghi rõ):**
- **Firefox**: không có trên máy công cụ (Playwright cần bản Firefox vá riêng, không có). Mã khóa lại chuột luôn chạy trong handler phím / bấm (Esc / Space / nút: handler của C; Tab: `keydown` của `main.ts`; bấm nền: `click` của canvas) – đúng điều kiện Firefox; người tích hợp thử tay.
- Thanh trình duyệt tích hợp (pane) từ chối khóa chuột ngay cả đường Phase 5 ("Tiếp tục" → `pointerlockerror`): không dùng được cho mục này.
- Bấm link mở tab mới, bấm hình mở lớn, "Đổi" → `confirm()` → không Menu: UI của C chưa có trong nhánh B (thử khi ghép C; về chuột thì giống bước 2–3: chuột đã nhả trong lúc thẻ mở).
- Luồng mạng (`dev:api` + 2 trình duyệt + Host: gõ từ xa, Phạt → đếm ngược, đổi nhánh → hòm biến mất, hết khóa đứng im → hòm kia hiện nhờ gửi lại vị trí, hình R2 có token, F5 giữa khóa): cần máy chủ của A (`advance` / `review` / route media trong nhánh này còn stub / 501) → người tích hợp thử sau khi ghép A + B + C.

## Ảnh (SCREENSHOT_PORT=5191, đã xem PNG)
- `p8-box-yaw`: nhìn từ trên hướng bắc; hòm trái (không `yawDeg`) nắp dựng ở phía nam (mặt trước bắc), hòm phải (`yawDeg 90`) nắp dựng ở phía đông (mặt trước tây) ✓.
- `p8-box-branch`: `D1|A` mở (trái) và `D1|B` đóng có cột sáng cách 20 m cùng tồn tại ✓.
- `p8-media-offline`: trong nhánh B hiện thẻ Lộ trình mặc định (thẻ `media` + ô thay hình là của C) – chụp lại khi ghép.
- `p7-box-close`, `p7-openbox` (đã thêm `yawDeg 180`): vẫn như Phase 7 ✓.

## `npm run build && npm test` (một lần cuối, từ gốc worktree)
- build exit 0, không cảnh báo. test exit 0: scripts 50, shared 57, client **640** (633 + 7 mới), worker 98.

## Cho người tích hợp
- Xóa dòng `task: () => {}` trong `main.ts` khi ghép C (C bỏ `RaceHudActions.task`; để lại sẽ lỗi "excess property").
- Hợp đồng với C: `onOpenChange(false)` chỉ gọi khi thẻ / Sổ **thật sự** vừa đóng (B gọi `input.lock()` mỗi lần); `resolveMedia(name)` nhận `"r2:<name>"` hoặc `"<name>"`.
- `p8-media-offline` chỉ có nghĩa sau khi ghép C.
- Thử tay Firefox + luồng mạng ở trên.
