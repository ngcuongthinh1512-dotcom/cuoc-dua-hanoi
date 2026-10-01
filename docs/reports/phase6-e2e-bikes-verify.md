# Phase 6 – kiểm chứng đầu-cuối bản sửa xe chung + 4429 (main @ 1942864)

Người kiểm: verifier E2E (chỉ đọc + chạy lệnh, không sửa nguồn, không commit). Ngày 2026-10-01.
Cổng: `wrangler dev` 8792, proxy TCP giả nghẽn 8793 (→ 8792), Vite DEV 5323 (proxy `/api` → 8793).
Trạng thái: **XONG** (đã tắt mọi wrangler / workerd / vite / proxy / chrome của mình; không sửa nguồn, không commit). Ảnh + log: `<scratch>/p6v/shots`, `p6v/*.log`.

## Cách dựng
- `wrangler dev --port 8792 --persist-to <scratch>/p6v/state` (`worker/.dev.vars` có sẵn).
- Vite DEV (`client/`) trên 5323 với config tạm trong scratch (giống `client/vite.config.ts`, proxy `/api` + ws → 8793).
- Chrome hệ thống qua `playwright-core` headless (SwiftShader), 1 driver giữ trình duyệt, mỗi đội 1 browser context, ghi khung WS.

## Kết quả

- (1) Host đăng nhập, tạo "Đội Xanh" (A, t0) + "Đội Đỏ" (B, t1), "Thêm xe" cạnh A: **PASS**. Cả hai nhận `{t:'bikes', list:[{id:'h…190', x:-9.61, z:-6.08, owner:null…}]}`.
- (2) Cả hai THẤY xe: **PASS**. `player.bikes.list` có xe ở cả 2 tab, model `visible:true`, đặt lên đất (y −0,19, `unplaced:false`), `sparkle:true` ở 3 m; ảnh `02-A/B-sees-bike.png` (xe góc phải dưới, có điểm lấp lánh).
- (3) Nhấn F cùng lúc: **PASS** khi hai `claim` thật sự cùng lúc (proxy giữ chiều lên 2,5 s, cả 2 tab đã gửi `claim`, rồi xả): thắng nhận `ok:true` + lên xe (`riding:true`), thua nhận `ok:false, reason:'taken'` → toast "Chậm một bước! Xe đã có người lấy." (ảnh `03-B-race3.png`), sau đó `bikes gone:[id]`. Chạy 2 lần (B thắng, rồi A thắng): đúng 1 đội lên xe mỗi lần.
  - Ghi chú (minor, xem L1): không nghẽn, mạng local ~0 ms + SwiftShader 2–5 FPS: tab thua xử lý phím F SAU khi `gone` về → F im lặng (không gửi `claim`, không toast).
- (4) A (thắng) giữ W đạp xe ~10 m (SwiftShader chậm): **PASS**. B: `remote` slot 0 "Đội Xanh" `mode:'bike'`, xe dưới người đạp `visible:true`, vị trí bám A (trễ ≤ 0,6 m); danh sách `bikes` của B KHÔNG có xe của A (đã `gone` khi A nhận xe) → chỉ 1 xe (ảnh `04-B-sees-A-riding-big.png`: 1 người áo xanh trên 1 xe; `04-A-riding-big.png` góc A). Chuông `R`: A gửi `{t:'gesture', g:'bell'}`, B nhận `{t:'gesture', slot:0, g:'bell'}`.
- (5) A dừng, F xuống xe: **PASS**. A gửi `dismount` (x 4,97, z −42,30), cả A và B nhận `bikes` cùng xe `owner:'t0', rider:false`; trong cả hai tab xe `visible:true` đúng chỗ; B thấy A đi bộ (`mode:'walk'`, `bike:false`) cạnh xe.
  Bỏ xe: dời A 238 m (`controller.spawn` → `respawn` hợp lệ). **PASS có điều kiện**: xe biến mất (`notice bikeGone` + `bikes gone:[id]` cho A, `gone` cho B, toast "Xe của bạn đã biến mất vì bị bỏ lại quá xa", danh sách cả hai không còn xe) — nhưng CHỈ khi có đội liên tục di chuyển. Khi mọi đội đứng im: chờ 67 s không gì xảy ra; B đi 3 s rồi dừng: vẫn không. B đi liên tục: xe mất sau 40 s nữa (≈ 107 s sau khi dời). Xem L2.
- (6) A đang trên xe (`mode:'bike'`, (23,00; −51,04)) → `page.reload()`: **PASS**. Màn "Chào mừng trở lại, Đội Xanh!" → Tiếp tục → `welcome`; sau khi thân đặt xong client tự gửi `{t:'bike', op:'claim', id:<xe của mình>}` → `ok:true` → `riding:true`, pose sau F5 lệch < 1 cm, xe trong danh sách `rider:'local'`; B thấy A `mode:'bike'`, có xe (ảnh `06-A-after-F5.png`, HUD xe "0 km/h"). (Tải lại mất ≈ 95 s ở SwiftShader; claim gửi 36 s sau `welcome` vì thế giới tải lâu — vẫn trong `remountSeconds` vì đếm theo thời gian mô phỏng sau khi thân đặt xong.)
- (7) Nghẽn mạng: A giữ W đi bộ, proxy giữ chiều lên rồi xả. 4,5 s / 5 s (SwiftShader chỉ ra ≈ 12 tin): server không đóng, không gì xảy ra. 8 s (16 tin `pos` dồn): server `close 4429 "too many messages"` → client tạo socket mới sau 1,0 s (`new`/`open`), nhận `welcome`, `connected:true`, panel mạng ẩn, `reconnects 1`, thân KHÔNG bị dời (welcome sau nối lại không `setSpawn`), B thấy A `live:true` đúng chỗ, Host: không cờ. **PASS** (trước bản sửa: dừng hẳn, "Máy chủ đã ngắt kết nối…").
- (8) Offline: `/?offline=1&race=v1&npc=0` và `/?npc=0`: không form, 0 socket, `__GAME__.net` không có, 3 xe thử `dev0..2` quanh spawn, F cạnh `dev0` → lên xe (ảnh `08-offline-riding.png`), 0 lỗi console. `SCREENSHOT_PORT=5323 npm run ride-check` (mặc định): exit 0, in **OK** (đi bộ 4,0 / xe 5,2 m/s, tuyến 371 m, ngã → lên lại → xuống). **PASS**.
- Console các tab đội / Host suốt phiên: 0 lỗi, 0 pageerror (chỉ cảnh báo GL ReadPixels của SwiftShader).

## Bảng
| # | Kịch bản | Kết quả |
|---|---|---|
| 1 | Host đăng nhập, 2 đội, "Thêm xe" | PASS |
| 2 | Hai đội thấy xe (model, đặt đất, lấp lánh ≤ 30 m) | PASS (blocker E1 đã sửa) |
| 3 | F cùng lúc: 1 đội lên xe, đội kia "Chậm một bước!" | PASS (L1 minor) |
| 4 | Đội kia thấy người đạp, không xe đôi; chuông R qua mạng | PASS |
| 5 | Xuống xe → xe đứng cho cả hai; bỏ > 200 m / 60 s → biến mất | PASS có điều kiện (L2 minor) |
| 6 | F5 khi đang đạp: đúng chỗ + vẫn trên xe | PASS |
| 7 | Nghẽn mạng → 4429 → tự nối lại | PASS (major E2 đã sửa) |
| 8 | Offline 3 xe thử + ride-check OK | PASS |

## Lỗi / lệch còn lại
### L1 – minor – đội thua bấm F sau khi tin `gone` đã tới thì F im lặng
- Tái hiện: không nghẽn, mạng local ≈ 0 ms, SwiftShader 2–5 FPS; A và B bấm F cùng `Promise.all`. Tab A gửi `claim` (ok); tab B xử lý phím ở khung hình sau khi đã nhận `bikes gone:[id]` → 0 khung lên, không toast.
- Nguyên nhân: xe đội khác đang đạp bị bỏ khỏi danh sách của đội kia (server `BikeService.forTeam`, `worker/src/race/BikeService.ts` ~dòng 60: `!b.rider`), nên `bikeInReach` / `bikeRefusal` (`client/src/vehicle/Bikes.ts:136-137`) không thấy xe → `null` (im lặng). Với độ trễ mạng thật (≥ 1 khung hình) `claim` đi trước `gone` và toast hiện đúng (đã kiểm bằng proxy giữ chiều lên). Có thể chấp nhận; nếu muốn: giữ id xe vừa `gone` vì bị lấy trong ~1 s để F hiện "Chậm một bước!".
### L2 – minor – xe bị bỏ chỉ biến mất khi có đội liên tục di chuyển; đồng hồ 60 s bị đặt lại khi DO thức dậy
- Tái hiện: A xuống xe, dời 238 m; mọi đội đứng im 67 s → xe còn. B đi 3 s → vẫn còn (mỗi lần vòng lặp chạy lại, cả 2 đội nhận lại `bikes … full:true` = bộ nhớ `told` đã mất, tức DO đã bị đẩy khỏi bộ nhớ). B đi liên tục → xe mất sau 40 s nữa (tổng ≈ 107 s thay vì 60 s).
- Nguyên nhân: `RaceRoom.loop` chỉ chạy `bikes.tick` khi có người đi trong `idleStopMs` 10 s (`worker/src/RaceRoom.ts` ~356-366, đã ghi `ponytail`), và khi DO dựng lại cache xe thì `nearOwnerAt: now` (`BikeService.ts`, getter `bikes`) nên đếm 60 s lại từ đầu. Trong cuộc đua thật (nhiều đội luôn di chuyển, DO không ngủ) ảnh hưởng nhỏ; ở sảnh / ít người thì xe "bỏ" sống lâu hơn SPEC §6.3. Sửa nếu cần: lưu `nearOwnerAt` vào hàng `bikes` khi đội rời xa, hoặc để alarm xe quét cả khi không có ứng viên.
### Ghi chú (chưa kiểm, rủi ro lý thuyết)
- Server nay cũng đóng 4429 khi > `NET.maxBikeOps` (12) lệnh xe / 60 s (74bc0ee), và client coi 4429 là nối lại (1942864). Nếu một lỗi client lặp `mount`/`dismount` (`Bikes.sync`) thì sẽ thành vòng nối lại có backoff thay vì dừng hẳn; không thấy xảy ra trong phiên này (số lệnh xe ≤ 3 / phút).
