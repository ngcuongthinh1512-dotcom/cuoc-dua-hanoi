# Phase 5 – Reviewer 1: spec + code + hiệu năng + tích hợp chéo

Commit soát: `cd47483` (nền `0359dc8` + track A/B/C/D). Chỉ đọc + chạy lệnh. Script đo tạm để ở scratchpad (không commit): patch prototype `Minimap.update`, `MapTiles.draw`, `FullMap.open/update/redrawDetail`, `Gps.search`, `StreetLocator.at/lookup`, `HUD.update` qua `import('/src/…')` trong trang (cùng module với game), Chrome headless + SwiftShader, 1280 × 720, DPR 1 và 2. Máy tải nặng suốt buổi (load 8–18, reviewer 2 chụp ảnh song song), `performance.now()` chỉ chính xác 0,1 ms.

## Tóm tắt

- **BLOCKER:** không có.
- **MAJOR:** 3.
  - M1: "Kẹt?" / rơi xuyên đất khi đang đạp xe đưa người về chỗ lên xe. Đã tái hiện: nhảy lùi 60 m sau 12 s đạp, xe bỏ lại.
  - M2: "Kẹt?" khi kẹt mà vẫn chạm đất > 5 s đưa về đúng chỗ kẹt (tái hiện: đứng yên 9 s rồi hồi sinh thì dịch 0 m).
  - M3: mở bản đồ / menu khi đang đạp xe thì xe tự trôi 23 m không lái, trái kế hoạch "nhân vật dừng" (đã tái hiện).
- **MINOR:** 14.
- `npm run build && npm test` qua. `ride-check` phần 1–2 qua; phần 3 (bậc kè, chập chờn đã biết) hỏng 2 lần khi máy tải 17, qua lần thứ 3 (chi tiết ở mục 3).
- Ngân sách: mọi mục đạt (bảng ở mục 4).
- Tích hợp chéo 4 track khớp:
  - `hud-off` ẩn minimap / toast, không ẩn menu;
  - toast nằm ngay trên minimap;
  - `gps.route` mảng mới → minimap và bản đồ lớn vẽ lại;
  - mở / đóng bản đồ 20 lần: không rò canvas, không rò heap;
  - bản đồ lớn: 0 request mạng.
- Lỗi phía tích hợp: bảng F3 đè `#help`; `Tab` / `Space` không dùng được trong menu; `__GAME__` thiếu `minimap` / `fullMap`.

## 1. Đối chiếu yêu cầu (plan §1, §3; SPEC §12, §17.1–17.3)

| Yêu cầu | Kết quả | Bằng chứng |
|---|---|---|
| Minimap chữ nhật dưới trái, xoay, N trên viền, tự zoom, tuyến GPS, đích kẹp viền, mũi tên | ✓ | `ui/Minimap.ts:140-224`. Toán xoay kiểm tay: `toScreen` quay hướng camera lên trên; bắc = (sin h, −cos h), nên nhìn về tây (h = 90°) thì N ở **phải** (đúng; kế hoạch ghi "trái" là sai, A đã sửa test). Mũi tên `heading − bodyYaw` đúng quy ước `PlayerState.yaw`. |
| Zoom theo tốc độ | ✓ (lệch kế hoạch, hợp lý) | `Minimap.ts:15-20`: đứng yên và đi bộ đều ở `[0]`, rồi tăng tuyến tính tới `bikeTopSpeed`. Đo: đạp xe vòng tròn cho mpp 1,13. |
| Bản đồ lớn M: kéo, lăn chuột zoom, nhấp đặt / bỏ đích, tên đường (không tên địa danh) | ✓ | `FullMap.ts:416-447`. Probe: kéo không đổi đích; nhấp đặt đích; nhấp cách đích 3 px thì bỏ; nhãn chỉ lấy `graph.file.names` (có test). |
| GPS A*, xe → lùi về đi bộ, tới nơi thì xóa | ✓ | `geo/gps.ts:47, 61-70`. Probe: đích cách chỗ spawn 8 m bị xóa ngay; 10 tuyến đo 0,1–1,0 ms. |
| Tên đường + quận dưới phải, đồng hồ, tốc độ km/h + icon khi đạp xe | ✓ | `ui/HUD.ts:54-98`. Ảnh probe: "Parvis des Libertés…" / "Quận 16" / "THỜI GIAN 00:03" / "TỐC ĐỘ 0 km/h". |
| Menu: Esc, tự mở khi chuột nhả, "Kẹt?", cài đặt, phím, luật, ghi nguồn, dòng nhắc | ✓ (xem m1, m2, m3) | `main.ts:253-260`, `ui/Menu.ts:83-178` |
| Cài đặt lưu localStorage an toàn | ✓ | Probe: `{bad json` → mặc định; `sens 99, invertY "yes"` → 3, false; `−5, true` → 0,25, true; thanh trượt và ô tick hiện đúng. |
| Toast ngay trên minimap | ✓ | DOM: toast `[16,474 → 214,506]`, minimap `[16,514 → 316,704]`, cách 8 px (= `hud.gap`). |
| Hồi sinh dưới sông lên bậc kè | ✓ | `CharacterController.ts:238-241`; test dữ liệu thật đủ 81 bậc. |
| Biển tên đường có dòng quận | ✓ | `world/StreetProps.ts` `signCell`; ô atlas theo cặp (quận, tên). |
| Không vẽ NPC / xe / hộp mật thư trên bản đồ | ✓ | `ui/Minimap.ts`, `MapTiles.ts`, `FullMap.ts` không import gì của NPC / xe (chỉ `bikeTopSpeed` cho zoom). |
| Không thêm request mạng | ✓ (một ngoại lệ, xem m10) | Probe: phiên bản đồ lớn (mở, kéo, zoom, nhấp, resize) **0 request**. |
| Tunables trong config.ts | ✓ phần lớn (xem m11) | Mọi khóa config mới đều có chỗ dùng (đã grep từng khóa, không có khóa mồ côi). |
| UI tiếng Việt có dấu | ✓ | Mọi chuỗi trong `Menu.ts`, `Toasts.ts`, `HUD.ts`, `FullMap.ts`, `index.html` đều có dấu. |
| Phím: không Ctrl / Alt / Cmd, không F5 / F11 / F12 | ✓ | Chỉ thêm `M`, `Esc` (đã có trong `keys`). |

## 2. Finding

### MAJOR

**M1. "Kẹt?" (và rơi xuyên đất) khi đang đạp xe đưa người về chỗ đã lên xe, xe bị bỏ lại.** *Đã tái hiện.*

- **Ở đâu:**
  - `client/src/player/CharacterController.ts:275`: khi đang đạp xe, `fixedUpdate` gọi `return this.rideStep(…)` trước khối lấy mẫu `safe` ở `:326-329`, nên `safe[]` không bao giờ được cập nhật khi đạp xe;
  - `respawn()` ở `:243` lấy `safe[len − 1 − 5]`, tức một chỗ đi bộ cũ ≥ 5 s **trước lúc lên xe**.
- **Kịch bản:** `/?player&bike&autoMove=walk&wait=12`, rồi `controller.respawn()` (như nút menu).
  - Kết quả: `res 'safe'`, người nhảy **60,2 m** từ (−66,9; −32,2) về chỗ spawn (−12,6; −6,1);
  - xe nằm lại chỗ cũ (`dropBike` → `bikeSafe`).
  - Đạp 2 km rồi kẹt thì bị đưa lùi 2 km, xe ở lại đầu kia.
  - Lần hồi sinh khi rơi xuyên thế giới trong `rideStep` (`:374`) cũng như vậy. Lỗi này đã có từ `lastSafe` của Phase 4, nhưng Phase 5 thêm nút cho người chơi tự bấm.
- **Gợi ý:** lấy mẫu `safe` cả trong `rideStep`, ngay cạnh `if (s.grounded) this.bikeSafe.copy(p)` (`:381`), bằng cùng khối timer. Thêm test: đạp 10 s rồi `respawn()` thì cách chỗ lúc bấm ≤ khoảng 30 m.

**M2. "Kẹt?" khi kẹt mà vẫn chạm đất > `minAge` s thì về đúng chỗ kẹt.** *Đã tái hiện (trường hợp đứng yên) + đọc code.*

- **Ở đâu:** `CharacterController.ts:326-329` lấy mẫu mỗi `safeEvery` (1 s) **theo thời gian**, không theo quãng đường, miễn là `grounded`.
- **Kịch bản:**
  - Đứng yên 9 s rồi `respawn()`: dịch **0 m**.
  - Trường hợp thật: nhảy qua tường vào một sân trong không có lối ra, loay hoay 10 s. Cả 12 mẫu đều nằm trong sân, nên "Kẹt?" đưa về trong sân.
  - Đây là tình huống chính của nút "Kẹt?" (kế hoạch §3.13: "để không về đúng chỗ đang kẹt"), và nó không đạt.
- **Gợi ý:**
  - chỉ lấy mẫu khi đã đi ≥ vài mét so với mẫu trước (khóa mới trong `respawnRules`), để lịch sử trải dài theo quãng đường;
  - `respawn()` chọn mẫu mới nhất vừa ≥ `minAge` tuổi vừa cách vị trí hiện tại ≥ X m, không có thì lấy mẫu cũ nhất.
  - Thêm `ponytail:` ghi trần (C có ghi ponytail trong báo cáo, nhưng code không có dấu `ponytail:`).

**M3. Mở bản đồ lớn (M) hoặc menu khi đang đạp xe: xe trôi tiếp 23 m không ai lái.** *Đã tái hiện.*

- **Ở đâu:** `client/src/player/Player.ts:187` (`blocked` thì `intent = newIntent()`). Xe chỉ lăn chậm dần theo `bike.coastDecel` 0,6 m/s², nên từ 5,2 m/s trôi 5,2² / (2 × 0,6) ≈ 22,5 m.
- **Kịch bản:** đạp tối đa 5,20 m/s, bấm M, 10 s sau: đã đi **22,9 m** theo đường thẳng. Nhìn bản đồ giữa lúc đạp xe là việc rất thường gặp. Trong lúc bản đồ mở, xe có thể tông người đi đường (người chơi ngã, §17.11), đâm tường hoặc lao xuống sông.
- Kế hoạch §3.9 ghi "Menu hoặc bản đồ đang mở: nhân vật dừng".
- **Gợi ý:** khi `blocked` mà đang đạp xe thì phanh (`brakeDecel`) cho tới 0, không lùi. Ví dụ đặt intent phanh khi `riding.speed > 0`, hoặc thêm cờ `brake` vào `stepBike`.

### MINOR

**m1. `Tab` / `Space` không dùng được trong menu.** *Đã tái hiện.*

- **Ở đâu:** `client/src/core/Input.ts:111-119`. `Tab` (`clueBook`) và `Space` (`jump`) là phím game. Khi focus đang ở `<button>` (không phải ô nhập), `keydown` gọi `preventDefault()`.
- **Kịch bản:** `?menu`, focus ở "Tiếp tục".
  - `Tab`, `Tab`: focus vẫn ở "Tiếp tục";
  - `Space`: menu không đóng;
  - chỉ `Enter` chạy.
- Kế hoạch §6 C ghi "Tab / Enter dùng được". Báo cáo C nói đã đạt, nhưng không đúng sau khi ghép.
- Ngoài ra `Tab` trong menu còn ghi nhận `clueBook` (Phase 7 sẽ phản ứng với nó).
- **Gợi ý:** trong `Input.keydown`, nếu target là `HTMLButtonElement` (hoặc nằm trong `.menu`) thì không `preventDefault` và không ghi nhận `Tab` / `Space`.

**m2. "Tiếp tục" trong khoảng 1 s sau khi `Esc` nhả chuột: menu đóng, chuột không khóa lại, không có dòng gợi ý.** *Chỉ đọc code.*

- **Ở đâu:** `ui/Menu.ts:83-86` đóng menu **trước** khi `lock()` thành công.
  - Chrome từ chối khóa lại ngay sau khi người dùng vừa nhả bằng `Esc` (khoảng 1 s).
  - `Input.lock` nuốt lỗi (`Input.ts` `lock()`).
  - `help.hidden` giữ giá trị `true` từ lúc menu mở (`main.ts:259`).
- **Kịch bản:** lỡ bấm `Esc` rồi bấm ngay "Tiếp tục": màn hình game không có menu, không có "Nhấp chuột để chơi", chuột tự do.
- **Gợi ý:** để `onPointerLockChange(true)` đóng menu (bỏ `this.close()` trong `go`); hoặc `lock()` trả promise, bị từ chối thì mở lại menu / hiện `#help`.

**m3. `Esc` đóng menu không khóa lại chuột trên trình duyệt thật.** *Chỉ đọc code + spec HTML, cần kiểm tay.*

- **Ở đâu:** `main.ts:264-267`, `:315`. Theo HTML, phím `Esc` **không** phải "activation-triggering input event". Sau khi người dùng nhả chuột bằng `Esc`, Chrome và Firefox đòi cử chỉ kích hoạt để khóa lại.
- **Kịch bản:** `Esc` (menu mở), `Esc` lần nữa: menu đóng, chuột vẫn tự do, hiện "Nhấp chuột để chơi". Chấp nhận được, nhưng khác mô tả của D ("khóa ngay trong sự kiện"). Headless không tái hiện được (script Playwright có activation).
- Ngược lại, `M` là phím có activation nên đóng bản đồ bằng `M` sẽ khóa lại được.
- **Gợi ý:** người tích hợp kiểm tay trên Chrome + Firefox. Nếu đúng như trên, ghi vào `TODO.md` hoặc cho `Esc` không đóng menu.

**m4. Tay cầm: nút Menu (9) không mở menu khi chuột đang khóa.** *Chỉ đọc code.*

- **Ở đâu:** `main.ts:316` `else if (!input.locked) menu.open()`. Chuột đang khóa thì nút Menu của tay cầm không làm gì.
- Bản đồ lớn cũng không có điều khiển bằng tay cầm (kéo / zoom / đặt đích); SPEC §5 ghi "hỗ trợ gamepad".
- **Gợi ý:**
  - Menu: `document.exitPointerLock()` rồi để `onPointerLockChange` mở menu;
  - bản đồ bằng tay cầm: ghi `TODO.md`.

**m5. Bảng F3 đè dòng `#help`.** *Đã tái hiện (DOM + ảnh).*

- **Ở đâu:** `ui/DebugOverlay.ts:28` (`top: 8px; right: 8px`), `index.html:16` (`#help { top: 16px }`, canh giữa).
- **Số đo:** F3 `[739,8 → 1272,200]` chồng `#help` `[506,16 → 774,62]` ở 1280 × 720; ở 1024 × 640 cũng chồng. Ảnh: F3 che chữ "Esc menu".
- `#help` hiện mỗi khi chuột tự do (lúc vào game, sau khi khóa thất bại).
- **Gợi ý:** dời F3 xuống dưới `#help` (ví dụ `top: 70px`), hoặc ẩn `#help` khi F3 mở.

**m6. Đâm xe vào bậc thang: dựng lại DOM toast mỗi bước vật lý.** *Đã tái hiện.*

- **Ở đâu:** `CharacterController.ts:345` gọi `onStairs()` mỗi bước khi đang đẩy vào bậc. `Toasts.ts:65` `draw()` gọi `replaceChildren` cả khi `nextFeed` đã bỏ dòng lặp (`:28`).
- **Số đo:** `MutationObserver` đếm **54 lần dựng lại `#toasts` trong 2 s** (SwiftShader chậm; ở 60 bước/s là khoảng 60 lần/s).
- **Gợi ý:** `toast()` chỉ `draw()` khi feed thật sự đổi (so độ dài hoặc dòng cuối).

**m7. Dòng toast trùng chồng lên nhau khi thông báo lặp liên tục.** *Chỉ đọc code.*

- **Ở đâu:** `Toasts.ts:28`, với `repeatGap` 3 s < `seconds` 4 s.
- **Kịch bản:** giữ xe ép vào bậc thang: từ giây 3 tới 4 có **hai** dòng "Không đi xe trên bậc thang" giống hệt nhau, lặp lại mỗi 3 s.
- **Gợi ý:** thông báo lặp thì làm mới `at` của dòng cũ thay vì thêm dòng; hoặc `repeatGap ≥ seconds`.

**m8. Nhấp ngoài vùng đua trên bản đồ lớn vẫn đặt đích.** *Đã tái hiện.*

- **Ở đâu:** `FullMap.ts:261`. Khung bản đồ là `RACE_BBOX` + 100 m, và khi zoom ra hết còn có nền `outside`.
- **Kịch bản:** nhấp góc màn hình đặt đích (−4576; −2093), `route = null`. Chấm tím nằm ngoài bản đồ, minimap kẹp nó ở viền mãi, không có tuyến.
- **Gợi ý:** trong `click`, bỏ qua điểm nằm ngoài `AREA` (đã có `bboxCorners`).

**m9. `__GAME__` thiếu `minimap` / `fullMap`.** *Đã tái hiện.*

- **Ở đâu:** `main.ts:245`. A đã nhờ D thêm (báo cáo A, "Ghi chú cho người tích hợp"). Không có hai đối tượng này thì script đo hiệu năng phải patch prototype (như review này đã làm).
- **Gợi ý:** thêm `minimap, fullMap: () => fullMap`.

**m10. Tab "Luật đua" thêm 1 request.** *Đã tái hiện.*

- **Ở đâu:** `Menu.ts:141`. `import('…RACE_RULES.md?raw')` tạo chunk riêng 23,7 kB (8,3 kB gzip), tải khi mở tab lần đầu.
- Đây là static asset (không tính phí Worker), chỉ tải khi cần. Nhưng kế hoạch §3.15 ghi "không thêm request", nên người tích hợp cần ghi nhận (TODO hoặc SPEC §17).

**m11. Hằng số tinh chỉnh nằm ngoài `config.ts`.** *Chỉ đọc code.*

- `main.ts:265, 313`: `300` ms bỏ qua `Esc` ngay sau khi nhả chuột (lặp hai chỗ);
- `FullMap.ts:19` `MIN_PX`, `:181` lề 100 m, `:95` ô lưới nhãn 64 px;
- `Minimap.ts:137-138` `N_RADIUS`, `WAYPOINT_INSET`, cỡ mũi tên 18 / 20.

Phần lớn là số trình bày, chấp nhận được. Riêng `300` ms là thời gian hành vi, nên đưa vào `config.ts`.

**m12. Canvas toàn màn hình của bản đồ lớn không được giải phóng khi đóng.** *Chỉ đọc code.*

- **Ở đâu:** `FullMap.ts:211-216`. `close()` bỏ `base` và `detail`, nhưng `this.canvas` (`innerWidth × innerHeight × DPR²`) vẫn giữ bộ đệm: 3,5 MB ở DPR 1, 14 MB ở DPR 2, từ lần mở đầu tiên tới hết phiên.
- **Gợi ý:** trong `close()`, `canvas.width = canvas.height = 0`; `resize()` lúc mở sẽ đặt lại.

**m13. `OffscreenCanvas` trên main thread không kiểm tra hỗ trợ.** *Chỉ đọc code.*

- **Ở đâu:** `MapTiles.ts:127`, `FullMap.ts:201, 349`.
- Safari < 16.4 không có `OffscreenCanvas`: `new OffscreenCanvas` ném lỗi mỗi khung trong `minimap.update`, trình xử lý `error` → màn "Game gặp lỗi". SPEC §17.1 có Safari (A đã ghi rủi ro).
- **Gợi ý:** dùng `document.createElement('canvas')` (main thread luôn có DOM), hoặc ghi yêu cầu Safari ≥ 16.4 vào tài liệu.

**m14. Một số chỗ nhỏ khác.** *Chỉ đọc code.*

- `M` vẫn mở bản đồ khi đang bay tự do (`V`, chỉ có ở chế độ debug). Dòng hướng dẫn của bản đồ có lớp `.hud-box` nên bị `hud-off` ẩn (probe: `mapOpen: true`, mọi `.hud-box` hidden).
- Mở menu từ "Ghi nguồn" rồi nhấp ra ngoài thẻ: chuột khóa lại, menu đóng, nhưng bảng Ghi nguồn (`#credits-panel`, `pointer-events: auto`) vẫn nằm giữa màn hình khi chơi, tới lần `Esc` sau.
- Minimap và GPS vẫn chạy trong lúc tải (`hud-off`) và dưới bản đồ lớn: tốn vài phần trăm ms, không đáng kể.
- Dòng quận không có độ trễ: đi dọc một phố nằm đúng trên ranh giới quận (ví dụ Bd de Sébastopol 1/4 – 2/3), nhãn hiện lại mỗi lần đổi vỉa hè.

## 3. Build / test / ride-check

- `npm run build`: qua (`tsc` + Vite + `wrangler deploy --dry-run`). Bundle `index` 5,32 MB (1,96 MB gzip), chunk `RACE_RULES` 23,7 kB.
- `npm test`: qua. scripts 18, shared 11, client **54 file / 527 test**, worker 6.
- `SCREENSHOT_PORT=5271 npm run ride-check` (máy tải 17–18, reviewer 2 chụp song song):
  - **Lần 1 (cả bài):**
    - phần 1: `F` cách xe 3 m bị từ chối (toast `bikeTooFar`, không lỗi console); tuyến A* 371 m, đạp 388 m;
    - đi bộ 4,000 / xe 5,200 m/s, tỉ lệ 1,300; nghiêng 15,6°;
    - phần 2: ngã, lên lại: qua;
    - **phần 3 hỏng:** "vào bậc từ mặt bên: KHÔNG (−327,8; 128,3, swim)".
  - **Lần 2 (`RIDE_ONLY=3`, tải 17,6):** hỏng y hệt (−327,4; 128,3). Cùng tọa độ D đã gặp khi máy tải nặng.
  - **Lần 3 (`RIDE_ONLY=3 RIDE_DEBUG=1`, tải 14,5):** **qua**. Vào bậc từ mặt bên, leo lên y −4,94 (mặt nước −5,50).
  - Kết luận: chập chờn theo tải đã biết (`TODO.md` Phase 4B, "ride-check phần 3"). Phase 5 không đụng vật lý bơi. Riêng `ThirdPersonCamera` đổi yaw khi trục nhảy > 4 m, nhưng bài không dịch chuyển nên không liên quan.
  - Nên chạy lại cả bài khi máy rảnh trước khi commit.

## 4. Ngân sách (kế hoạch §9) – số đo

SwiftShader, 1280 × 720, `npc=0`, đi / đạp xe vòng tròn 600 khung quanh Concorde, có tuyến GPS tới Opéra. `performance.now()` lượng tử 0,1 ms (các giá trị "0,1–0,2" là trần đồng hồ).

| Mục | Giới hạn | Đo DPR 1 | Đo DPR 2 | |
|---|---|---|---|---|
| Minimap vẽ / khung | ≤ 0,5 ms | TB 0,081, p95 0,2, max 0,5; vẽ lại ép buộc (microbench × 300) 0,010 ms | TB 0,089, p95 0,2, max 0,4 | ✓ |
| Raster ô | ≤ 3 ms, ≤ 1 ô / khung | 0,14 ms / ô (microbench 30 ô, 256 px), trong game max 0,3; tối đa **1** ô / khung | 0,14 ms / ô (512 px), max 0,3; 1 ô / khung | ✓ |
| HUD DOM | ≤ 0,2 ms | `HUD.update` TB 0,007, max 0,1 | TB 0,008, max 0,1 | ✓ |
| Tên đường | ≤ 0,1 ms | `at()` TB 0,001, `lookup` ≤ 0,1 (2 lần / 600 khung khi đi vòng) | như DPR 1 | ✓ |
| `districtAt` / khung | – | 2–4 µs | | ✓ |
| GPS một lần tìm | ≤ 5 ms, ≤ 1 / s | 0,1–1,0 ms (10 tuyến walk / bike, 1,2–2,8 km); trong game 0,9–1,0; 1 lần / 600 khung | 0,1–1,0 | ✓ |
| Bản đồ lớn: raster nền khi mở | ≤ 10 MB, bỏ khi đóng | 1 902 × 1 290 = **9,4 MB**, 2,9–4,0 ms (20 lần mở) | 3,3–3,9 ms | ✓ |
| Vẽ lại vector khi dừng | ≤ 30 ms | 6 / 4 / 3 / 2 / 1 / 0,5 m/px: 3,3 / 1,9 / 1,2 / **6,4** / 1,4 / 0,9 ms (14–16 nhãn) | 2,8 / 2,0 / 1,0 / 6,5 / 1,4 / 1,0 ms | ✓ |
| Kéo / zoom | 60 fps | `FullMap.update` khi kéo TB 0,01, max 0,1 ms | TB 0,33, một lần 19,6 ms (lần vẽ lại khi dừng giữa lúc kéo, máy tải nặng) | ✓ |
| Bộ nhớ ô minimap | ≤ 24 MB ở DPR 2 | 9 ô = 2,25 MB (tối đa 24 ô = 6 MB) | 9 ô = 9 MB (tối đa 24 MB) | ✓ |
| Vector chunk | ≤ 4,1 MB | 0,53 MB / 49 chunk → ngoại suy khoảng 4,0 MB cho 368 chunk | | ✓ (sát trần) |
| Mở / đóng bản đồ 20 lần | không rò | canvas trong DOM 2 → 3 (canvas bản đồ tạo một lần), heap sau GC 126,5 → 126,5 MB | 126,3 → 126,4 MB | ✓ |
| Canvas bản đồ giữ sau khi đóng | – | 3,5 MB | 14 MB | m12 |
| Worker `mapVectors` | ≤ 1 ms / chunk | không đo lại (A: 0,03–0,10 ms, Node) | | – |
| Lệnh vẽ 3D | +0 | HUD là DOM + canvas 2D, không qua `renderer.info` (theo cấu trúc) | | ✓ |
| Mạng | +0 | 0 request sau READY trong cả phiên bản đồ lớn; +1 request lười khi mở tab "Luật đua" (m10) | | ✓ / m10 |

## 5. Tích hợp chéo 4 track

| Câu hỏi | Kết quả |
|---|---|
| `.hud-box` / `hud-off` ẩn minimap khi bay tự do, không ẩn menu? | ✓ Minimap, toast, dòng hướng dẫn bản đồ, khối HUD đều là `.hud-box` / `.hud-hand`. Menu dùng `.menu` (`menu.css`). Probe `V`: `hudOff: true`, mọi `.hud-box` `visibility: hidden`. |
| Toast đúng chỗ trên minimap? | ✓ Cách 8 px (mục 1). |
| `gps.route` mảng mới khi đổi thì A vẽ lại? | ✓ Minimap: `sig` có `gps.route` (so danh tính, `Minimap.ts:173`). Bản đồ lớn: `gps.route !== this.route` (`FullMap.ts:222`). B gán mảng mới mỗi khi điểm chiếu dịch (`gps.ts:101-107`). |
| `__GAME__` có `minimap` / `fullMap`? | ✗ (m9) |
| F3 không chồng `#help`? | ✗ (m5) |
| Luồng khóa chuột M / Esc | Logic đúng với Chrome headless. Rủi ro trên trình duyệt thật: m2, m3 (Esc không phải cử chỉ kích hoạt). `M` đóng bản đồ: khóa trong `keydown`, đúng. `Esc` trong 300 ms sau khi nhả bị bỏ qua ở cả hai chỗ. |
| Mở menu / bản đồ khi đang đạp xe | ✗ xe trôi 23 m (M3) |
| Mở khi đang bơi / ngã | Người trôi nổi tại chỗ, hoặc động tác ngã chạy hết. Không lỗi. |
| Esc hai lần | Lần 2 trong 300 ms: bỏ qua (thiết kế). Sau 300 ms: đóng menu, chuột có thể không khóa lại (m3). |
| Focus trong cài đặt | Nhấp chuột: `blur()` ✓. Bàn phím: xem m1. Đã ghép với `keydown` của D, nên `Esc` khi focus ở ô nhập vẫn gọi `input.lock()` (`main.ts:266` không bỏ qua ô nhập); nếu khóa được thì menu đóng ngay ở `Esc` đầu, không phải "Esc đầu chỉ bỏ focus" như báo cáo C. Vô hại. |
| Hồi sinh khi xe đang chạy | ✗ M1 |
| Hồi sinh khi rơi | Đi bộ: về chỗ ≥ 5 s trước (trước đây 1 s), chấp nhận được. Đang đạp xe: M1. |
| Đích GPS khi đã tới | ✓ Xóa đích và tuyến; minimap / bản đồ vẽ lại. |
| DPR 1 / 2, resize | ✓ Resize 900 × 600 khi bản đồ đang mở: canvas 900 × 600 (DPR 1) / 1 800 × 1 200 (DPR 2). Minimap `sig` có DPR. |
| Vùng ngoài RACE_BBOX | Ô minimap và bản đồ cắt theo `AREA`; nhấp ngoài vùng: m8. |
| Tên đường rỗng / quận null | ✓ `PlaceLabel` bỏ tên rỗng; `districtLabel(0)` = ''; biển tên đường không có quận thì giữ bố cục cũ (có test). |

## 6. Chất lượng code, test, tài liệu

- **Test tốt, bắt lỗi thật:**
  - Minimap: đếm tay chunk ở 0° / 45° / 90° × 2 mức zoom; N ở 4 hướng;
  - LRU và ngân sách raster;
  - GPS trên đồ thị thật (1 lần tìm lại, lùi về walk có tiền điều kiện);
  - hồi sinh với cả 81 bậc kè thật;
  - `settings` với storage ném lỗi.
- **Thiếu test:**
  - vị trí người khi `respawn()` lúc đang đạp xe (M1: test hiện chỉ kiểm tra xe ở lại);
  - "Kẹt?" sau khi đứng yên > `minAge` (M2);
  - phím trong menu (m1);
  - `FullMap.open / update` (chỉ có ảnh chụp).
- **`ponytail:`** đúng chỗ ở GPS (bám nút, `lookAhead`, mảng mới mỗi khung), locate, nhãn thẳng, bộ dựng Markdown, `quayStairNear`, font hệ thống. Thiếu dấu `ponytail:` cho:
  - lịch sử chỗ an toàn 5 s / 12 mẫu (C có ghi trong báo cáo);
  - tìm tuyến xe thất bại khoảng 13 ms: `gps.ts:64` có ghi chú, nhưng nằm dưới dòng `ponytail` về bám nút.
- **File mồ côi / khóa config không dùng:** không có. Đã grep đủ các khóa mới của `minimap`, `fullMap`, `gps`, `locate`, `respawnRules`, `hudWidgets`, `toasts`, `menu`, `notices`, `props.signs.districtLine`.
- **Tài liệu tồn (người tích hợp):**
  - `TODO.md`:
    - xóa 4 dòng "Phase 5 – HUD";
    - dòng 82 "`roadGraph.snapRadius` chưa ai đọc" đã cũ (GPS dùng rồi);
    - thêm các ponytail: font hệ thống, bộ dựng Markdown mini, bản đồ lớn không có nhà, chưa có chấm đội khác, hồi sinh chưa báo server (Phase 6), tìm tuyến xe thất bại 13 ms, bản đồ lớn chưa dùng được bằng tay cầm (m4), Safari ≥ 16.4 (m13), request lười RACE_RULES (m10), `Esc` không khóa lại chuột (m3, nếu xác nhận).
  - `CLAUDE.md`:
    - cây thư mục thiếu `client/src/ui/` (HUD, Minimap, MapTiles, FullMap, Menu, Toasts, settings), `geo/gps.ts`, `geo/locate.ts`, `geo/districts.ts`;
    - `water.json` có `districts` / `parks`;
    - URL `?gps=x,z`, `?map[=m/px]`, `?menu`, `?respawn=s`;
    - preset `p5-*`;
    - phím `M` / `Esc` và menu tự mở.
  - SPEC §17 (người điều phối, kế hoạch §3.17): đồng hồ ở góc dưới phải; quận + công viên trong `water.json`; GPS chỉ tới điểm tự đặt.
