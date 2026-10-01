# Phase 6 – review visual / UX (reviewer 2)

Trạng thái: **XONG** (2026-10-01). Cổng 5321: Vite cho preset, `wrangler dev` cho lần chạy thật, không bao giờ chạy hai cái cùng lúc. Ảnh Phase 5 đã sao lưu vào scratchpad trước khi chụp lại. Không sửa code, không commit. Khi xong không còn tiến trình vite / wrangler / workerd / chrome nào của reviewer này.

## Đã chạy
- `SCREENSHOT_PORT=5321 npm run screenshot -- p6`: 8 preset, không lỗi console. Đã mở mọi PNG, có phóng to vùng người chơi khác / hộp / xe.
- Hồi quy: p5-hud/menu/minimap/fullmap/debug/toast-stairs, p4-ride, p4-mount, p4b-street, p3-idle. Không lỗi. So pixel với ảnh Phase 5: khác ≤ 0,8 %. Riêng p5-hud và p4b-street khác 25 % vì camera lệch 0,1 m theo nhịp đi bộ; nhìn bằng mắt thì giống hệt. → **Không hồi quy offline.**
- **Đầu-cuối THẬT** (lần đầu client thật chạy với server thật). Cách dựng:
  - client PROD build vào scratchpad bằng `vite build --outDir`;
  - `wrangler dev --port 5321 --assets <scratch> --var HOST_PASSWORD:…`;
  - Chrome headless (playwright-core) điều khiển trang Host + 2–3 người chơi, ở 1280×720 và 1024×640.

  Các bước chạy đúng:
  - **Host:** đăng nhập (sai mật khẩu → "Sai mật khẩu Host."), tạo đội, bảng mã, online/offline, vị trí, bộ đếm, "Thêm xe" (server có 1 xe).
  - **Người chơi:** form mã đội tiếng Việt có dấu. Mã ngắn → "Mã đội gồm 6 ký tự"; mã sai → "Mã đội không đúng"; gõ chữ thường có khoảng trắng → vẫn vào được. Áo màu đội, bảng tên đội. Chế độ "Tôi là Host" đổi đúng nhãn và chữ.
  - **Vào lại:** F5 → mã điền sẵn, nút "Vào lại" → "Chào mừng trở lại, Đội Xanh!" → "Tiếp tục" → **đứng đúng chỗ cũ** (đã đi 4 s, ngắt server rồi vào lại).
  - **Thấy nhau:** Đội Đỏ đi tới, bấm `G` → bên kia thấy vẫy kèm bảng tên. F3: "Mạng: đã nối · ping 0 ms · 1 người chơi đang thấy · gửi 2 · nhận 55 · nối lại 0".
  - **Thiết bị khác:** thiết bị thứ ba đăng nhập mã Đội Xanh → tab cũ hiện panel cam "Đội của bạn vừa đăng nhập trên thiết bị khác…" (đọc rõ ở 1024×640).
  - **Mất server:** tắt `wrangler dev` → "Mất kết nối – đang nối lại…"; bật lại → tự nối lại sau ≈ 9 s, panel biến mất.
  - **Host trong trang game** ("Tôi là Host"): camera bay, thấy đội + bảng tên, có dòng Mạng.
- Preset dựng tay (đã xóa khỏi `screenshots/`):
  - hộp mật thư ở 36 / 87 / 136 m;
  - xe stand-in nhìn từ góc khác;
  - panel `#net` khi đang mở menu / bản đồ lớn.
- Ảnh bằng chứng nằm trong scratchpad của phiên (`e2e/*.png`), không đưa vào repo.

## Phát hiện (nặng trước)

### 1. [blocker] Client không nối xe chung của server – ĐÃ TÁI HIỆN
- **Code:**
  - `client/src/main.ts:202` và `:210` vẫn chỉ là chú thích `// [C] w.bikes → player.bikes …` và `// [C] 'bikes' / 'bike' (claim result) → player.bikes`.
  - Ngoài `vehicle/Bikes.ts` (và stand-in DEV), không chỗ nào trong `client/src` gọi `applyServer` / `onClaimResult` / `setTeams` hay gán `bikes.net` / `bikes.notify` / `bikes.ground`.
  - `Player.ts:191`: khi online thì không đặt xe thử.
- **Hậu quả:**
  - Người chơi online **không có chiếc xe nào**, `F` không làm gì.
  - Tin `bikes` / `bike` bị bỏ qua.
  - Vào lại lúc đang đạp thì không lên xe lại.
  - Toast "Chậm một bước! Xe đã có người lấy." không bao giờ hiện, vì `notify` mặc định là `() => {}`.
- **Tái hiện:**
  - Host "Thêm xe" cạnh Đội Xanh → Host hiện "Xe trên bản đồ: 1", nhưng màn hình Đội Xanh không có xe và F3 ghi "0 xe quanh đây". F5 cũng không có, vì `welcome.bikes` bị bỏ.
  - Preset `p6-bike-lost`: không có toast. Chú thích ở `scripts/screenshot.ts:131` cũng ghi là còn chờ nối.
- **Sửa:** nối theo `phase6-track-c.md`:
  - khi nhận welcome: `setTeams`, `applyServer(w.bikes, [], true)`, rồi lên xe lại nếu đang đạp;
  - tin `bikes` → `applyServer(list, gone, full)`; tin `bike` → `onClaimResult`;
  - gán `bikes.net = net`, `bikes.notify = notice`, `bikes.ground = …`;
  - rồi chụp lại `p6-bike-lost` và thử 2 trình duyệt đạp xe.

### 2. [major] Bảng tên chồng nhau, mọi đội xuất phát chồng lên nhau, bảng tên của chính mình nằm trên đầu người khác – ĐÃ TÁI HIỆN
- `TODO.md:63` đã dời việc "bảng tên của các nhân vật đứng sát nhau (< 2 m) chồng lên nhau … xếp lại ở Phase 6", nhưng chưa làm. `p6-peers` đọc thành "Đội Tím Xanh".
- **Lần chạy thật:**
  - Đội nào vào lần đầu (`welcome.pose` null) cũng spawn đúng `playerSetup.spawn`. Thân người chơi khác nằm trong thân mình: áo xanh lốm đốm đỏ (z-fighting), hai bảng tên thành "ĐĐội Đỏh" (`1280-A-sees-B-idle.png`, `1280-B-ingame.png`).
  - Lúc xuất phát 20 đội sẽ là 20 thân và 20 bảng tên chồng ở một chỗ.
- **Bảng tên của chính mình** vẫn được vẽ (`CharacterModel` local). Camera ở sau lưng nên nó chiếu đúng lên phía trên người đứng trước mặt. Kết quả: một người mang hai bảng tên, "Đội Xanh" + "Đội Đỏ" trên đầu Đội Đỏ (`1280-A-sees-B-wave.png`). Theo SPEC §7, bảng tên là để nhận ra **đội khác**.
- **Gợi ý:**
  - ẩn bảng tên local (ít nhất khi online);
  - xếp bảng tên theo khoảng cách trên màn hình;
  - spawn lần đầu lệch theo slot (vòng vài mét quanh spawn).

### 3. [minor] Hộp mật thư quá nhỏ, không nhìn thấy được trong bán kính hiện 150 m
- Hộp chỉ là khối 0,6 m, cờ 0,9 × 0,55 m trên cột 2,6 m (`config.ts:1026` `clueBox`).
- Ở 1280×720, fov 70: cờ ≈ 8 px ở 36 m, ≈ 3 px ở 87 m, **không thấy** ở 136 m (`rv-boxes-far.png`, `crop-boxes-far.png`). Trong thực tế hộp chỉ hiện ra ở ≈ 40 m, trong khi server gửi tọa độ từ 150 m. SPEC §17.10 đòi "cờ + ánh sáng nhẹ … khi lọt vào tầm mắt".
- Vẽ hộp là phạm vi Phase 7 (track B làm sớm), nên chỉ ghi minor.
- **Gợi ý:** cột cờ cao hơn (4–5 m) + cờ to hơn, hoặc một biểu tượng sprite giữ kích thước tối thiểu trên màn hình như bảng tên.

### 4. [minor] Panel `#net` che nút menu, và bị bản đồ lớn che mất
- `client/index.html:21`: `#net` có `top: 30%; z-index: 2`, còn menu có z-index 1.
- Khi mất kết nối hoặc bị đá mà đang mở `Esc`: panel cam che kín nút "Kẹt? Về chỗ an toàn" (`1280-net-over-menu.png`). Nút vẫn bấm được (pointer-events none) nhưng không nhìn thấy.
- Khi đang mở `M`: bản đồ lớn phủ lên panel nên người chơi không biết đã mất kết nối (`1024-net-over-map.png`).
- **Gợi ý:** đặt panel ở mép trên (`top` cỡ 72 px, dưới `#help`) và z-index trên bản đồ lớn.

### 5. [minor] Trang Host: bảng đội tràn ngang
- `client/src/host/host.css`: `th, td { white-space: nowrap }` và `section` không có `overflow-x`. Với tên đội dài 40 ký tự (mức server cho phép):
  - ở 1280: hàng và nút "Thêm xe" lòi ra ngoài khung;
  - ở 1024: trang cuộn ngang, ảnh full-page rộng 1121 px (`1024-host-final.png`, `1280-host-after-add-bike.png`).
- **Gợi ý:** `section { overflow-x: auto }`, hoặc cho cột tên xuống dòng.

### 6. [minor] Host "Vào lại" tính cả lần kết nối đầu tiên
- `worker/src/RaceRoom.ts:176` tăng `reconnects` ở mọi lần mở WebSocket.
- Đội mới vào một lần đã hiện "Vào lại 1"; sau một lần F5 hiện "2" (`1024-host-final.png`).
- Bên client dùng `> 0` cho "Chào mừng trở lại" nên vẫn đúng. Chỉ con số trên trang Host sai lệch 1.
- **Gợi ý:** hiển thị `max(0, n − 1)`, hoặc đổi nhãn thành "Số lần kết nối".

### 7. [minor] Host không chọn được màu đội; 8 màu xoay vòng
- QĐ 19 ghi "tạo đội (tên, màu, tên người chơi)". `hostView.ts:81` gán màu theo thứ tự dòng.
- Hậu quả:
  - "Đội Vàng…" đặt ở dòng 2 mặc áo đỏ, chấm đỏ (`1024-host-teams.png`);
  - trên 8 đội thì trùng áo, trái SPEC §7 "mỗi đội một màu áo".
- **Gợi ý:** thêm trường thứ ba `Tên đội; Người chơi; #màu` (tùy chọn), và mở rộng bảng màu lên ≥ 20 màu.

### 8. [minor] Đồng hồ HUD online về 00:00 sau mỗi lần F5
- `main.ts:406`: `time = player.simTime` là đồng hồ cục bộ.
- Online, sau F5 / vào lại thì "THỜI GIAN" từ 00:31 về 00:01 (`1280-A-back-ingame.png`). Người chơi dễ tưởng đồng hồ đua.
- `raceTime` là việc của Phase 7. **Gợi ý:** tới lúc đó, ẩn ô đồng hồ khi online (hoặc ghi chú vào TODO Phase 7).

### 9. [minor] Đăng nhập sai lần 5 vẫn báo "Mã đội không đúng"; chỉ tới lần 6 mới thấy bị khóa
- `RaceRoom.ts:136-138` đặt khóa ở lần sai thứ 5 nhưng vẫn trả `bad_code`. Lần thử sau, kể cả **mã đúng**, mới nhận `locked` + đếm ngược.
- **Gợi ý:** lần thứ 5 trả `locked` kèm `retryMs`.

### 10. [minor] Preset `p6-bikes` không cho thấy xe của chính đội
- Chiếc xe có khóa đỏ nằm sau minimap ở góc trái dưới, chỉ lộ cái khóa, nên preset không chứng minh được trạng thái "xe của mình" như chú thích ở `scripts/screenshot.ts:130`.
- Với `orbit=-20` thì thấy đủ cả ba: xe trống lấp lánh, khóa xanh của đội khác, khóa đỏ của mình (`rv-bikes-own.png`).
- **Gợi ý:** đổi `orbit`.

## Đã kiểm, ổn
- **Màn đăng nhập** (1280 và 1024): bố cục gọn, tiếng Việt có dấu, ô mã dạng monospace in hoa, lỗi đỏ ngay dưới ô nhập, đếm ngược khóa, "Tôi là Host" ⇄ "Tôi là người chơi", có dòng "Cuộc đua: <mã>".
- **"Chào mừng trở lại":** tiêu đề in hoa (tên dài thì xuống dòng giữa tên – chấp nhận), tóm tắt "Cuộc đua chưa bắt đầu" + "Lần cuối trong game: hh:mm", Enter / nút "Tiếp tục".
- **Người chơi khác:** đi / chạy, vẫy (tay giơ cao), đạp xe (stand-in) đều đúng clip; áo màu đội; bảng tên màu đội; ghost không va chạm. Ở lần chạy thật đi tới và vẫy hiện đúng.
- **Xe stand-in:** xe trống có hạt lấp lánh, xe đội khác có khóa màu đội đó, xe của mình có khóa màu mình. Chỉ thấy rõ trong khoảng 10 m.
- **F3:** dòng Mạng online / offline đúng chữ.
- **Trang Host `?demo=1`** và trang thật: đọc rõ, có dấu, cờ "Vượt tốc" đỏ, bộ đếm có "Request tính phí (ước tính)".
- **HUD:** khi chưa vào thế giới thì tắt (`hud-off`), nên form đăng nhập không đè lên HUD. Panel bị đá / mất mạng nằm trên minimap.
- Không hồi quy p3 / p4 / p4b / p5.

## Chưa kiểm được
- Người khác đạp xe online, và toast "Chậm một bước" online: bị chặn bởi phát hiện 1.
- Hộp hiện / ẩn online: hộp L1 cách spawn ≈ 2 km, chỉ xem bằng stand-in.
- GPU thật, Firefox / Safari: máy chỉ có Chrome headless SwiftShader (≈ 5–14 FPS).
