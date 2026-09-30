# Phase 5 – Track C: menu, cài đặt, thông báo, hồi sinh

Nhánh `worktree-agent-a308f7a90f52235ed` (từ `0359dc8`). Kế hoạch: `docs/plans/phase5.md` §6 C, quyết định 9–13. `npm run build` và `npm test` qua (client 47 file / 491 test, trước là 45 / 463).

## Đã làm

| Việc | Ở đâu |
|---|---|
| Menu thật: Tiếp tục, "Kẹt? Về chỗ an toàn" (ẩn với khán giả), tab Cài đặt / Phím điều khiển / Luật đua, nút Ghi nguồn (mở bảng sẵn có, nằm trên menu), dòng "Cuộc đua vẫn tiếp tục khi mở menu" | `ui/Menu.ts`, `ui/menu.css` |
| Cài đặt: đảo trục Y, độ nhạy chuột 0,25–3 × (cả chuột và tay cầm); lưu `localStorage`, bọc try/catch | `ui/settings.ts`, `ThirdPersonCamera.look`, `FreeFlyCamera.update` |
| Toast: `toast(text)`, `notice(code)`, tối đa `toasts.max` dòng, lặp trong `repeatGap` s bị bỏ, mờ dần bằng CSS | `ui/Toasts.ts` (hàm thuần `nextFeed`) |
| Lý do `F` bị từ chối: `bikeTooFast`, `bikeTooFar`, `bikeTaken`, còn lại im lặng | `vehicle/Bikes.ts` (`bikeRefusal`, `interact`) |
| Bánh xe chạm bậc thang → `onStairs()` → toast "Không đi xe trên bậc thang" | `CharacterController.rideStep` |
| Hồi sinh dưới sông → khe lan can đầu bậc kè gần nhất, quay lưng ra sông; trên đất → chỗ an toàn cũ ≥ 5 s | `CharacterController.respawn`, `quayStairNear` |
| `#help` thành một dòng gợi ý; bảng phím chuyển vào menu (giữ id `help-player` / `help-fly` cho `main.ts`) | `client/index.html` |
| Preset `p5-menu`, `p5-toast-stairs`, `p5-respawn` | `scripts/screenshot.ts` (dòng `[C]`) |

## Quyết định và chỗ lệch kế hoạch (người tích hợp đọc)

1. **Nút "Kẹt?" không giới hạn tần suất** (mặc định đã chốt). Chỉ có hai chỗ về: bậc kè gần nhất khi ở dưới sông, hoặc chỗ khô cũ hơn `respawnRules.minAge` (5 s).
2. **Lịch sử chỗ an toàn** (đề xuất của kế hoạch, C quyết): `CharacterController.safe` giữ `respawnRules.history` (12) chỗ, mỗi `player.safeEvery` s một chỗ; `respawn()` lấy chỗ cũ ≥ `minAge` s (hoặc chỗ cũ nhất nếu mới vào), rồi xóa lịch sử, nên bấm lần hai ngay không quay lại chỗ kẹt. Cũng áp dụng cho lần hồi sinh tự động khi rơi xuyên thế giới (trước đây về chỗ 1 s trước). ponytail: về cách đây 5 s nghĩa là mất ~25–30 m tiến độ; chỉnh `respawnRules.minAge`.
3. **Đang đạp xe khi hồi sinh**: xe ở lại chỗ bánh xe đứng trên đất khô lần cuối (`bikeSafe`, như khi đạp xuống sông), người xuống xe (`onDismount(b, false)`). Tách `dropBike()` dùng chung với nhánh đạp xuống sông.
4. **Hồi sinh lên bậc kè**: chân bậc gần nhất (`water.stairs`) → khe lan can tương ứng (`stairGaps`), cộng `respawnRules.stairsInland` (0,8 m) về phía đất liền. Phía đất liền lấy bằng pháp tuyến cạnh sông gần nhất, chọn phía không nằm trong đa giác sông (đúng cả với đảo: lỗ của đa giác). Nếu chỗ đó bị vật cản hoặc không có bậc kè (`water` không có `stairs`) thì về chỗ an toàn như cũ. Thân quay mặt vào đất liền (`prevYaw` đặt luôn, không nội suy từ hướng cũ).
5. **Camera theo thân khi dịch chuyển** (ngoài kế hoạch, 3 dòng trong `ThirdPersonCamera.update`): khi trục camera nhảy > `snapDistance` (đã có để "snap" điểm xoay) thì `yaw = hướng thân`. Không có nó, sau hồi sinh camera vẫn nhìn ra sông trong khi thân quay vào bờ. Không đổi gì ở spawn, lên / xuống xe, đổi chế độ camera. Có test.
6. **Luật đua**: kế hoạch ghi "chữ thô `pre-wrap`", nhưng `docs/RACE_RULES.md` có `##`, `**`, backtick nên hiện thô rất xấu. Làm một bộ dựng Markdown nhỏ (tiêu đề, danh sách, `---`, đậm / nghiêng, `code` → `<kbd>`, ~25 dòng trong `Menu.ts`), ponytail: chỉ phần Markdown luật đang dùng (chưa có bảng / link). Nội dung nạp bằng `import('../../../docs/RACE_RULES.md?raw')` khi mở tab lần đầu: thành chunk riêng 23,7 kB (8,3 kB gzip), không nằm trong bundle chính, không thêm request lúc tải game.
7. **Vị trí menu**: thẻ neo phía trên (không canh giữa) để đổi tab không làm khung nhảy. Lớp phủ không chặn chuột: nhấp ra ngoài thẻ = nhấp vào canvas = khóa chuột lại = `onPointerLockChange` đóng menu ("Tiếp tục" cũng vậy).
8. **Focus**: chuột đổi ô tick / thanh trượt xong thì `blur()` (để `Esc`, `M` còn tới game, vì `core/Input.ts` bỏ qua phím gõ trong `<input>`). Bàn phím (mũi tên, Space) đổi xong thì giữ focus để chỉnh tiếp; khi đó `Esc` đầu tiên chỉ bỏ focus, `Esc` thứ hai đóng menu. Đo thật bằng Playwright.
9. **Sửa ngoài danh sách file** (tối thiểu): `client/index.html` đặt `#credits-panel` `z-index: 2` (lên trên menu, `z-index: 1`).
10. Config: `respawnRules` (khối C, mới: `history`, `minAge`, `stairsInland`); `menu`, `toasts`, `notices` giữ nguyên.

## Việc cho người tích hợp (Track D / main.ts)

- Không cần sửa gì để chạy: `main.ts` dùng `Menu`, `notice`, `menu.actions.respawn`, `Player` đã gọi `notice` đúng chữ ký. `$('help-player')` / `$('help-fly')` vẫn tồn tại (chuyển vào menu khi mở lần đầu).
- Toast nằm tại `left = hud.margin`, `bottom = hud.margin + hud.minimap.height + hud.gap`: cùng chỗ với minimap của Track A (A chỉ cần đặt minimap theo `hud.minimap`).
- Headless Chrome **có thể** khóa chuột khi `input.lock()` được gọi từ phím (đo ở `_menu` script: sau `Esc` đóng menu, `document.pointerLockElement` có giá trị và `Esc` tiếp theo không mở lại menu vì headless không nhả khóa). Trình duyệt thật nhả khóa bằng `Esc` nên không ảnh hưởng; chỉ cần nhớ khi viết test headless cho luồng `Esc`.
- Phase 6: lần dịch chuyển của `respawn()` phải được server biết (không tính gian lận tốc độ): TODO như kế hoạch §3.13.

## Test (đã thêm)

- `ui/settings.test.ts`: đọc / ghi qua storage giả, storage ném lỗi (đọc, ghi, không có `localStorage`), JSON hỏng / sai kiểu, kẹp độ nhạy vào [min, max], giữ nguyên danh tính đối tượng `settings`.
- `ui/Toasts.test.ts`: `nextFeed` (lặp trong `repeatGap`, hết hạn, quá `max`, không đổi mảng vào), mọi `NoticeCode` có chữ riêng, gọi `toast` / `notice` trong Node không lỗi.
- `ThirdPersonCamera.test.ts` / `FreeFlyCamera.test.ts`: `invertY` đổi dấu pitch (chuột và tay cầm), độ nhạy 2 × gấp đôi yaw và pitch, dịch chuyển xa đặt yaw theo thân.
- `Bikes.test.ts`: đạp 4 m/s (và lùi) → `bikeTooFast`; cách xe 4 m → `bikeTooFar`, xa hơn `farReach` → `null`; xe đội khác trong tầm → `bikeTaken`, 4 m → `null`; xe trống trong tầm thắng xe đội khác; đang làm động tác / bơi / trên không → `null`; lên / xuống xe như cũ. Ba test cũ đổi kỳ vọng `null` → lý do mới.
- `CharacterController.test.ts`: `onStairs` được gọi khi tiến / lùi vào collider bậc thang, không gọi khi va tường hay lên dốc thường; `respawn()` dưới sông (nước giả, hai bậc kè, Rapier thật) → `'stairs'`, đúng khe của bậc gần nhất ở từng bờ, y = mặt kè, quay vào đất liền, hết `inWater`; không có bậc → `'safe'`; `quayStairNear` (bờ và đảo); trên đất: về chỗ cũ ≥ `minAge` s, bấm lần hai đứng yên, vừa vào game về chỗ spawn; đang đạp xe → xe ở lại trên đất, `onDismount(false)`; **dữ liệu thật** (`water.json` + địa hình đã đào sông): cả 81 bậc kè, thả người cách chân bậc 8 m ngoài nước, `respawn()` → `'stairs'`, cách khe ≤ 0,80 m, y = mặt kè ±0,35, đứng vững, quay vào đất liền (0 lỗi).

## Kiểm tra cuối

- `npm run build && npm test`: qua (client 47 file / 491 test; shared 11; worker 6; scripts 18).
- `npm run ride-check` (cổng 5263): `OK`, không lỗi console (toast `bikeTooFar` khi bấm `F` cách xe 3 m chạy mà không lỗi). Lần chạy đầu hỏng vì tôi sửa file nguồn giữa chừng (Vite tải lại trang), chạy lại sạch.
- `p3-idle`, `p4-mount` chụp lại: hình như trước, `__STATS__` (lệnh vẽ, tam giác) không đổi so với `p5-menu` (HUD là DOM).
- Không để `vite` / `wrangler` chạy.

## Ảnh (đã xem PNG)

- `p5-menu`: menu tab Cài đặt, nút xanh Tiếp tục + nút cam "Kẹt? Về chỗ an toàn", ô tick, thanh trượt "1,00 ×". Các tab Phím điều khiển, Luật đua (dựng Markdown), Ghi nguồn cũng chụp bằng script Playwright tạm (đã xóa): đúng.
- `p5-toast-stairs`: xe dừng ở bậc vườn Trocadéro, dòng "Không đi xe trên bậc thang" bên trái, trên chỗ của minimap.
- `p5-respawn`: sau 1,7 s bơi, người đứng ở khe lan can đầu bậc kè, quay vào bờ, camera sau lưng, dòng "Đã đưa bạn lên bậc kè gần nhất".
- Kiểm tra Playwright (không phải preset): cài đặt lưu qua tải lại trang (đảo trục Y, 1,25 ×), `Esc` tới game sau khi nhấp ô tick, bấm "Kẹt?" nhiều lần liên tiếp không bị giới hạn (toast giống nhau chỉ hiện lại sau 3 s), không lỗi console.
