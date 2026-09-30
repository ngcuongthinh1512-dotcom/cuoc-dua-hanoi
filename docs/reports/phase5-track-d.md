# Phase 5 – Track D: báo cáo

Nhánh worktree từ commit nền `0359dc8`. Kế hoạch: `docs/plans/phase5.md` §6 Track D. Phát triển trên stub của A / B / C (chưa merge).

## Đã làm
- **HUD góc dưới phải** (`client/src/ui/HUD.ts`, DOM tạo trong constructor, import không chạm DOM):
  - tên đường (font viết tay hệ thống, 30 px) + "Quận 8" (19 px) bên dưới; hiện khi đổi tên đường hoặc đổi quận, giữ `hudWidgets.streetSeconds` s rồi mờ dần (`streetFade`, CSS transition). Đồng hồ của nhãn là `HudFrame.time` (giờ mô phỏng), không phải dt thật: ảnh chụp không phụ thuộc tốc độ khung của máy chụp.
  - không có tên đường (công viên, quảng trường) → không hiện lại; quay lại đúng đường cũ → không hiện lại.
  - khối "NHÃN · giá trị" canh phải: "THỜI GIAN 00:37" (sau 1 giờ "1:02:05"), khi đạp xe thêm "TỐC ĐỘ 19 km/h" + icon xe đạp SVG nội tuyến.
  - chỉ ghi DOM khi chữ đổi (so `textContent`; opacity / display chỉ đổi khi trạng thái đổi).
  - vị trí: `right = hud.margin`, `bottom = hudWidgets.bottom` (30 px, nằm trên dòng ghi nguồn).
- **Dòng quận trên biển tên đường** (`world/StreetProps.ts`): hàm thuần `signCell(name, district, measure)` (bố cục ô atlas, đo chữ được truyền vào → test được trong Node). Có quận: thêm dòng "8e Arrt" / "1er Arrt" (11 px) trên cùng, ô cao thêm `props.signs.districtLine` (14 px), biển cao thêm tương ứng (tỉ lệ chữ giữ nguyên, dài biển không đổi). Không có quận (test, preview) → bố cục cũ y hệt. Ô atlas theo cặp (quận tại chân cột, tên) → đường nằm trên ranh giới quận có đủ hai biển; xếp kệ theo chiều cao hàng lớn nhất.
- **main.ts:**
  - ẩn HUD khi đang tải và khi bay tự do (`V`): `body.hud-off` (đặt ngay trước khi tạo HUD, vòng lặp bật / tắt) + một luật trong `ui/hud.css` ẩn mọi `.hud-box` / `.hud-hand` (đồng hồ; minimap và toast nếu A / C dùng các lớp này). Kiểm bằng script Playwright tạm: tải xong → hiện; `V` → `visibility: hidden`; `V` lần nữa → hiện.
  - khóa chuột: Firefox chỉ cho `requestPointerLock` trong trình xử lý sự kiện nhập (Safari cũng đòi cử chỉ người dùng), còn nền gọi `input.lock()` trong vòng lặp khung khi `M` / `Esc` đóng bản đồ / menu → thêm một `keydown` khóa ngay trong sự kiện khi phím đó sẽ đóng bản đồ / menu (vòng lặp vẫn đóng như cũ; `lock()` lần hai là no-op hoặc bị Input nuốt lỗi). Chrome chạy được cả hai cách.
  - `#help` ẩn khi bản đồ lớn mở (dùng `modal()` thay cho `menu.isOpen`).
- **F3** (`ui/DebugOverlay.ts`): dời lên góc trên phải; dòng mới "HUD: n ô bản đồ (n chunk vector) · raster x ms · GPS n lần, x ms" (đọc `tiles.stats`, `gps.stats`).
- **Config:** `hudWidgets.bottom`; `props.signs.districtLine` (khối Phase 2 E, được phép theo kế hoạch).
- **Preset `[D]`:** `p5-hud`, `p5-hud-bike`, `p5-sign` (biển Rue Royale ở góc Concorde, cam ?cam= cách 2,5 m, `npc=0`), `p5-debug`.
- `Player.ts`: không cần sửa (nền đã nối `blocked`, `notice`, `simTime`).

## Test
- `ui/HUD.test.ts`: 37 s → "00:37", 3 725 s → "1:02:05", âm → "00:00"; 5,2 m/s → "19 km/h"; nhãn: đổi đường → hiện, quá `streetSeconds` → ẩn, không tên → không hiện, cùng đường → không hiện lại, đổi quận giữ đường → hiện lại.
- `world/StreetProps.test.ts`: `signCell` không quận = bố cục cũ (y 19 / 41, ô 64 px, rộng 110 với phép đo giả); có quận: ô cao `cellH + districtLine`, dòng "8e Arrt" nhỏ hơn tên, các dòng cũ dời xuống đúng `districtLine`, tên nằm trong khung viền; "1er Arrt"; tên dài vẫn ≤ `cellW`.
- `parseOverrides` / URL hooks: không đổi, test cũ qua.
- `npm run build` qua; `npm test`: scripts 18, shared 11, client 46 file / 466 test, worker 6 — tất cả qua.
- `SCREENSHOT_PORT=5264 npm run ride-check`: **OK** (exit 0; đi bộ 4,0 / xe 5,2 m/s, tỉ lệ 1,3, nghiêng 15,6°, ngã + lên lại, bậc kè → bơi → vào bậc từ mặt bên → leo lên y −4,99). Lần chạy đầu hỏng phần 3 (vào bậc kè từ mặt bên, người bơi dừng ở (−327,3; 128,3)) khi máy đang tải nặng (load ≈ 19, các track khác chụp ảnh cùng lúc); chạy lại riêng phần 3 rồi cả bài đều qua. Thay đổi của D không đụng vật lý → ghi nhận là chập chờn theo tải, người tích hợp nên để ý khi máy rảnh.

## Ảnh đã xem (SCREENSHOT_PORT=5264, vòng 1–2)
- `p5-hud`: góc dưới phải "Quận 8" + "THỜI GIAN 00:02", cách dòng ghi nguồn ~10 px. **Tên đường trống vì `StreetLocator` còn là stub của B.** Để xem bố cục đủ, đã tạm sửa `locate.ts` trả "Rue Royale" (không commit, đã hoàn nguyên): "Rue Royale" viết tay trên "Quận 8", đúng kiểu STYLE_GUIDE.
- `p5-hud-bike`: thêm khối "TỐC ĐỘ 19 km/h" có icon xe đạp SVG dưới "THỜI GIAN 00:03".
- `p5-sign`: biển men xanh "8e Arrt / RUE / ROYALE", viền xanh lá, chữ rõ, biển cao hơn biển cũ một dòng.
- `p5-debug`: F3 góc trên phải, dòng "HUD: 0 ô bản đồ (0 chunk vector) · raster 0,00 ms · GPS 0 lần, 0,00 ms" (stub A / B → 0). F3 đè lên bảng `#help` (headless không bao giờ khóa chuột nên `#help` luôn hiện); C thu `#help` thành gợi ý ngắn → cần xem lại sau khi ghép.
- Minimap, toast, menu, bản đồ lớn: stub, chưa vẽ gì.
- `__STATS__` p5-hud: 348 lệnh vẽ (HUD là DOM, +0 lệnh vẽ 3D).

## Khóa chuột trên các trình duyệt
- Không chạy được Firefox / Safari ở đây (chỉ có Chrome hệ thống, headless không khóa chuột), và menu / bản đồ lớn còn là stub (không bao giờ mở) → **chưa kiểm tay**. Đã rà theo hành vi đã biết:
  - Chrome: `Esc` nhả khóa, trang không nhận phím; khóa lại ngay sau khi người dùng nhả bị từ chối (~1 s) → promise bị Input nuốt, `#help` hiện "Nhấp chuột…".
  - Firefox: `requestPointerLock` ngoài trình xử lý sự kiện nhập bị từ chối ("not called from inside a short running user-generated event handler") → đã sửa bằng `keydown` ở trên.
  - Safari: đòi cử chỉ người dùng (trừ khi trang tự nhả) → cùng cách sửa; có thể gửi phím `Esc` đã dùng để nhả → nền đã bỏ `Esc` trong 300 ms sau khi nhả.
- Việc của người tích hợp: mở game thật trên Chrome + Firefox hoặc Safari sau khi ghép C + A: `Esc` → menu → `Esc` / "Tiếp tục" → khóa lại; `M` → bản đồ → `M` / `Esc` → khóa lại.

## Lệch so với kế hoạch
- Luật ẩn HUD (`.hud-off`) nằm trong `ui/hud.css` (file của nền) thay vì file riêng của D: một luật dùng chung cho mọi widget.
- Nhãn tên đường đếm theo `HudFrame.time` thay cho `dt` (lý do ở trên); `update(f, dt)` giữ chữ ký.

## Cần làm sau khi A / B / C merge
- **B:** chụp lại `p5-hud` (phải có "Rue Royale" trên "Quận 8").
- **A:** kiểm tra minimap có lớp `.hud-box` (hoặc tự ẩn) để `hud-off` ẩn nó khi tải / bay tự do; nếu không, thêm lớp hoặc cho Minimap một cờ ẩn. Dòng F3 "HUD:" sẽ có số thật.
- **C:** kiểm tra `.hud-off` không ẩn menu (menu không nên dùng `.hud-box`); `#help` ngắn không đè F3 góc trên phải; toast có lớp `.hud-box` thì cũng ẩn khi bay tự do (chấp nhận được).
- Chụp lại `p5-*`, `p4-*`, `p3-*`, `p4b-street`; `ride-check`; kiểm tay khóa chuột như trên.
