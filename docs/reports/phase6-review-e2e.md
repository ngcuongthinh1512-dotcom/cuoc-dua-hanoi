# Phase 6 – Review đầu-cuối (client thật + server thật)

Người kiểm: reviewer E2E (không sửa mã nguồn, không commit). Ngày 2026-10-01. HEAD `c55a3e1`.
Cổng: `wrangler dev` 8791, Vite / proxy 5322. Trạng thái: **XONG** (đã tắt mọi wrangler / workerd / vite / chrome của mình).

## Kết luận nhanh
- Server (Worker + `RaceRoom`) chạy đúng đầu-cuối với trình duyệt thật: đăng nhập, 1 thiết bị / đội, presence 500 m, vào lại đúng chỗ, khởi động lại giữ SQLite, kênh hộp 150 / 170 m không lộ, nhận xe nguyên tử, xe bị bỏ, ứng viên xe từ Host, `sim` trong ngân sách.
- **1 blocker:** client chưa hề nối xe chung của server (`main.ts` chỉ có 2 dòng chú thích `// [C]`). Người chơi online không thấy xe nào, F không làm gì, không thể đạp xe trong cuộc đua thật.
- **1 major:** mạng khựng ≥ 3–4 s lúc đang đi → server đóng 4429 → client coi là lỗi cuối, dừng hẳn ("Máy chủ đã ngắt kết nối. Tải lại trang…").
- 3 minor (bộ đếm Host đếm thiếu, socket bị đóng 4408 khi tải thế giới rất lâu, dòng in "dòng ghi / bot / phút" của `sim` dễ đọc sai).

## Cách dựng
- `cd worker && npx wrangler dev --port 8791 --persist-to <scratch>/state` (`.dev.vars` có sẵn, giống `.dev.vars.example`; trạng thái SQLite để riêng trong scratch, không đụng reviewer khác, không ghi gì vào repo).
- DEV: Vite của `client/` trên 5322, config tạm trong scratch (giống `client/vite.config.ts`, chỉ đổi proxy `/api` + ws sang :8791), có `window.__GAME__`.
- PROD (kịch bản 10–13): `vite build --outDir <scratch>/dist`, `wrangler dev --assets <scratch>/dist` (cùng origin như deploy), một proxy TCP nhỏ trên 5322 → 8791 để giả lập mạng khựng.
- Chrome hệ thống qua `playwright-core` (headless, SwiftShader như `scripts/screenshot.ts`). Một tiến trình driver giữ trình duyệt; mỗi đội một browser context (localStorage riêng). Ghi mọi khung WebSocket (`framesent` / `framereceived`), console, và mã đóng socket trong trang (bọc `window.WebSocket`). FPS 2–5 (SwiftShader, 2–4 trang): thời gian mô phỏng chậm hơn thời gian thật.
- Cuộc đua `e2e1` (3 đội Xanh / Đỏ / Vàng); `sim` tự tạo cuộc đua `sim-…`.

## Kịch bản và kết quả
| # | Kịch bản | Kết quả |
|---|---|---|
| 1 | Host `/host.html`: đăng nhập bằng mật khẩu `.dev.vars`, tạo 3 đội (`Đội Xanh; An` …) | **OK**. Bảng mã 3 đội, ô nhập xóa sau khi `host.state` về, bộ đếm `rows 8` = 3 × 2 + event 2. |
| 2 | Xanh + Đỏ đăng nhập bằng mã (`/?race=e2e1&npc=0`), giữ W ở Xanh | **OK**. Mỗi bên thấy bên kia (`remote.count 1`, áo / tên đúng). Xanh đi → `pos` ≤ 5 Hz chỉ khi đổi (15 tin / 8 s thật; đứng im chỉ có `ping`), Đỏ nhận tick `[2, serverMs, 0, …]`, vị trí người chơi khác đi theo một chiều, không giật lùi (trễ ≈ 1 tick + 200 ms nội suy). Độ mượt bằng mắt không đánh giá được ở 2–5 FPS. G (vẫy) của Vàng → Đỏ nhận `{t:'gesture', slot:2, g:'wave'}` + tick có `action` = wave. |
| 3a | Tải lại tab Xanh | **OK**. Mã điền sẵn, nút "Vào lại" → "Chào mừng trở lại, Đội Xanh!" ("Cuộc đua chưa bắt đầu", "Lần cuối trong game: 13:26") → Tiếp tục → `welcome.pose` (−16,21; −7,82) = pose trước khi tải lại (lệch < 1 cm). |
| 3b | Thiết bị thứ hai đăng nhập mã Xanh khi tab cũ còn mở | **OK**. Tab cũ nhận `{t:'kick', reason:'otherDevice'}` rồi socket đóng; panel "Đội của bạn vừa đăng nhập trên thiết bị khác…"; 0 socket mới sau 8 s. |
| 3c | 5 mã sai liên tiếp qua form | **OK**. 5 lần "Mã đội không đúng", lần 6 "Nhập sai quá nhiều lần. Thử lại sau 57 giây", nút tắt. |
| 4 | Tranh xe: Host "Thêm xe" cạnh Xanh (3 m), hai đội đứng ≤ 2 m | **HỎNG phía client (E1).** Server gửi `{t:'bikes', list:[{id:'h…', owner:null…}], full:true}` cho cả hai đội, nhưng `player.bikes.list` = `[]` ở cả hai tab; F3 "Xe: đi bộ · 0 xe quanh đây"; đi tới 1,3 m rồi bấm F: 0 khung gửi lên, không toast. Gửi `claim` thô từ 2 tab cùng lúc (`__GAME__.net.send`): server đúng — Đỏ `ok:true`, Xanh `ok:false, reason:'taken'`, không xe trùng; nhưng tab thắng không lên xe, tab thua không có toast "Chậm một bước!". Phần "đội kia thấy người thắng đạp xe" không thử được (không ai lên xe được). |
| 5 | Xe bị bỏ: `dismount` thô cho Đỏ, dời Đỏ 250 m (spawn DEV + `respawn` hợp lệ), giữ cho vòng tick chạy | **OK phía server**: 59,1 s sau → `notice bikeGone` + `bikes gone:[id]` cho Đỏ và Host; toast "Xe của bạn đã biến mất vì bị bỏ lại quá xa". (Client chưa từng vẽ xe đó – E1.) |
| 6 | Hộp L1 (−1796,51; −889,66): dời Xanh tới 200 / 140 / 165 / 175 / 140 m dọc Champs-Élysées | **OK**. 200 m: không gì. 140 m: đúng 1 `{t:'box', op:'reveal', box:{step:'L1', x:-1796.51, z:-889.66}}`, `__GAME__.boxes.boxes` có L1. 165 m: không `hide`. 175 m: `hide`, danh sách rỗng. 140 m: `reveal` lại. Đỏ (xa) nhận 0 tin `box`. Quét mọi khung xuống của 2 đội: tọa độ L2–L6 không có; L1 chỉ trong 2 tin reveal của Xanh; bộ nhớ Đỏ (`boxes`, `welcome.boxes`) rỗng; `client/src` (trừ test), bản DEV và bản PROD build không chứa nội dung chặng. Tick của Đỏ bỏ Xanh khi Xanh ra ngoài 500 m. |
| 7 | Vàng mở `/?race=e2e1&player=500,500,90&autoMove=walk&action=wave&jump&bike&autoTurn=left&cam=…&debug=1` | **OK**. Có thân (không phải khán giả), sinh ở điểm mặc định (−12,6; −6,1), không tự đi (lệch 0,0001 m / 0,58 s mô phỏng), không vẫy / không xe, `V` (F3 mở) không bay. Offline `?race=e2e1&offline=1&player=100,-50,90&autoMove=walk`: không form, không socket, sinh ở (100; −50) hướng 90°, tự đi 3 m / 0,75 s; `?offline=1&cam=0,120,300,0,-20` = khán giả bay đúng chỗ. Host đăng nhập trên trang game ("Tôi là Host") → `role:'host'`, bay tự do, nhận tick mọi đội. |
| 8 | Ctrl-C `wrangler dev`, chờ 20 s, chạy lại cùng `--persist-to` | **OK**. Lúc tắt: 2 tab + trang Host hiện "Mất kết nối – đang nối lại…", thử lại sau 1 / 2 / 4 / 8 / 15 s. Sau khi bật: cả 3 tự nối lại, panel tắt. `welcome.pose` Xanh (−1671,07; −827,5) và Đỏ (−14,09; −254,99) = pose trước khi tắt; `welcome.boxes` Xanh có L1 (đứng 140 m); `welcome.bikes` Đỏ có xe của Đỏ đúng chỗ xuống; `host.state`: 3 đội, `flagged` giữ, xe giữ, bộ đếm nối tiếp từ snapshot (189 → 195). Thân người chơi không bị dời khi nối lại. |
| 9 | Bộ đếm Host so với khung thật | **Lệch (E3).** Sau ≈ 25 phút: `wsIn` 188 so với 192 khung lên thật (trừ `ping`); `http` 5 so với 12 request thật tới DO (5 login + 7 mở WS) → "Request tính phí (ước tính)" 16 so với ≈ 23. Bộ đếm đi lùi mỗi lần DO ngủ (trên `host.state`: `rows 46 → 41`, `alarms 1 → 0`, `http 6 → 4`). |
| 10 | `HOST_PASSWORD=… npm run sim -- --bots 3 --minutes 2 --url http://localhost:8791` | **OK** (exit 0). 1 808 tin lên = `wsIn` 1 808; http 9; alarm 0; 122 dòng; request tính phí ≈ 100 = 16,7 / bot / phút → 20 đội × 2 h luôn di chuyển ≈ **36 460 < 40 000** (khớp plan §9 xấu nhất 36 300). Nhận xe cùng lúc 1 / 2, vào lại đúng chỗ, 0 đội bị cờ. Dòng ghi: 122 ≈ snapshot 1 / 2 s + replay 1 / 10 s + ≈ 19 event × 2 → ngoại suy đúng cách ≈ 7 000 / cuộc đua < 20 000 (xem E5 về cách in). |
| 11 | Bản PROD (`vite build` + `wrangler dev --assets`, cùng origin) | **OK**. Form, "Chào mừng trở lại", tải thế giới, `pos` ≈ 4 Hz, F3 "Mạng: đã nối · ping 1 ms · 1 người chơi đang thấy · gửi 14 · nhận 95 · nối lại 0". `/host.html` chạy; không file nào > 25 MB. |
| 12 | Host PROD: "Tính hành lang & gửi ứng viên" | **OK**. 1,2 s: "Đã gửi 76 ứng viên trên 7 đoạn + 528 điểm xe mồi (8.0 kB)"; DO đặt đợt đầu ngay (4 xe `b…`), hẹn alarm sau 3 phút; mỗi đội chỉ nhận xe trong 250 m quanh mình (Vàng: chỉ xe của Đỏ cách 244 m, không xe ứng viên xa). |
| 13 | Mạng khựng 5 s lúc đang đi (proxy giữ chiều lên rồi xả) | **HỎNG (E2).** 21 khung dồn → server đóng `4429 too many messages` → panel "Máy chủ đã ngắt kết nối. Tải lại trang để vào lại.", không nối lại. Tải lại trang → vào lại được, đứng ở pose thứ 15 của loạt dồn (lùi 1,5 m). Không bị cờ vượt tốc (sửa R2 của A có tác dụng). |

## Lỗi

### E1 – blocker – client không nối xe chung của server (online không lấy được xe)
- **Ở đâu:** `client/src/main.ts:202` và `:210` chỉ là chú thích `// [C] …`. Không chỗ nào gọi `player.bikes.applyServer` / `onClaimResult` / `setTeams`, gán `bikes.net`, `bikes.ground`, `bikes.notify` (grep `client/src` ngoài test: chỉ có trong `vehicle/Bikes.ts`). `Player.fixedUpdate` (`player/Player.ts:191`) bỏ xe thử khi online (`!this.o.online`), nên online `bikes.list` luôn rỗng.
- **Hệ quả:** trong cuộc đua thật không ai thấy xe chung, F không gửi `claim`, không thể đạp xe; toast "Chậm một bước!" không bao giờ hiện; vào lại khi đang giữ / đạp xe (`welcome.pose.bikeId`) không lên lại; `R` chuông online không bao giờ có (chỉ khi đạp). Chấp nhận Phase 6 "xe chung, nhận xe nguyên tử" hỏng ở phía người chơi, dù server đúng.
- **Tái hiện:** có (kịch bản 4, 11). Server gửi `bikes` có xe 3 m cạnh đội; `__GAME__.player.bikes.list` = `[]`; F ở 1,3 m → 0 khung lên.
- **Sửa:** làm đúng hướng dẫn nối trong `docs/reports/phase6-track-c.md` (mục "main.ts / Player.ts (B)"): `bikes.notify = notice`; online `bikes.net = net`, `bikes.ground = (x, z, y) => groundAt(world, x, z, Math.max(y, env.heightAt(x, z)) + 3)`; trong `welcome`: `bikes.setTeams(w.teams); bikes.applyServer(w.bikes, [], true)` (+ lên lại khi `w.pose.bikeId` và `mode === 'bike'`); trong `message`: `'bikes'` → `applyServer(m.list, m.gone, m.full)`, `'bike'` → `onClaimResult(m)`. Rồi chạy lại kịch bản 4 (2 trình duyệt) + `p6-bike-lost`.

### E2 – major – mạng khựng ≥ 3–4 s khi đang di chuyển → bị đá khỏi cuộc đua, phải tải lại trang
- **Ở đâu:** `client/src/net/NetClient.ts:33` (`[CLOSE.tooFast]: 'protocol'` trong `FINAL` → `stop()`, không nối lại) cùng `worker/src/RaceRoom.ts:195, 438-445` (cửa sổ cố định 1 s, > 15 tin → đóng 4429). Báo cáo track A ghi "4429 → client nối lại (backoff)", nhưng B cài 4429 là lỗi cuối.
- **Kịch bản:** người chơi đang đi / đạp xe, Wi-Fi khựng ≥ 3,2 s (5 Hz) thì TCP xả ≥ 16 tin trong 1 s, server đóng 4429, client hiện "Máy chủ đã ngắt kết nối. Tải lại trang để vào lại." và dừng hẳn. Trong lúc chưa tải lại, đội biến mất khỏi mắt đội khác (`team online:false`); khi tải lại thì lùi về pose thứ 15 của loạt dồn.
- **Tái hiện:** có (kịch bản 13, bản PROD, khựng 5 s → 21 khung → `close 4429 "too many messages"` ghi trong trang).
- **Sửa (rẻ nhất):** bỏ `CLOSE.tooFast` khỏi `FINAL` để client nối lại theo backoff (tốn 1 request + vài dòng event). Tốt hơn: server dùng token bucket cho phép dồn (ví dụ 15 tin/s trung bình, dồn tối đa ~30–40 tin), vì `SpeedWindow` đã trải loạt dồn đúng thời gian.

### E3 – minor – bộ đếm quota trên trang Host đếm thiếu (mất mỗi lần DO ngủ)
- **Ở đâu:** `worker/src/RaceRoom.ts:94` (constructor nạp bộ đếm từ dòng snapshot) và `:402-409` (bộ đếm chỉ được lưu khi ghi snapshot, mà snapshot chỉ hẹn khi có pose / ngắt). Là R10 của `phase6-verify-a.md` (A để lại, ghi "lệch nhỏ").
- **Đo đầu-cuối:** DO ngủ thật ở `wrangler dev` (bộ đếm trên `host.state` đi lùi: `rows 46 → 41`, `alarms 1 → 0`, `http 6 → 4`). Sau ≈ 25 phút có nhiều lúc đứng im: `http` 5 so với 12 thật (mất 58 %), "Request tính phí" 16 so với ≈ 23 (thiếu ≈ 30 %). Trong lúc đua (luôn có người đi, snapshot mỗi 2 s) phần mất nhỏ; ở sảnh chờ / đăng nhập hàng loạt thì lớn. Phase 12 dùng các số này để so ngân sách.
- **Tái hiện:** có (kịch bản 9).
- **Sửa:** `this.snapshotAt ??= now + NET.snapshotMs; this.soon(now)` cả trong `fetch` (login / mở WS), `alarm()` và lệnh Host (gợi ý sẵn của verify A).

### E4 – minor – socket bị đóng 4408 khi tab tải thế giới quá lâu (chỉ thấy ở SwiftShader)
- **Ở đâu:** `client/src/net/NetClient.ts:175-179` (`ping` bằng `setInterval` trên luồng chính, bắt đầu từ `welcome`, tức là trong lúc tải thế giới) + `worker/src/RaceRoom.ts:429-436` (im 30 s → 4408).
- **Quan sát:** tab DEV thứ 3 (3 tab cùng tải bằng SwiftShader) nhận `welcome` lúc 132,5 s; luồng chính bận tải tới ≈ 176 s nên `ping` đầu đi trễ ≈ 44 s; server đóng socket lúc 204,3 s, client tự nối lại (`reconnects 1`, thêm 1 request + event connect / disconnect + 1 snapshot). Tab PROD không bị. Trên máy thật có GPU, lần tải "không giới hạn ngân sách" (`main.ts:423`) hiếm khi > 30 s, nên chỉ ghi lại.
- **Tái hiện:** 1 lần, không tái hiện ở PROD.
- **Sửa (nếu cần):** gửi `ping` ngay khi `welcome` tới, hoặc server tính hạn im lặng từ `since` dài hơn cho socket chưa từng gửi pose.

### E5 – minor – `npm run sim` in "Dòng ghi ≈ 20,3 / bot / phút (ngân sách < 20 000 / cuộc đua)"
- **Ở đâu:** `scripts/sim.ts:294`. Phần lớn dòng ghi là theo cuộc đua (snapshot 1 / 2 s + replay 1 / 10 s = 36 dòng / phút, không phụ thuộc số đội), nhưng dòng in chia theo bot. Người đọc nhân 20,3 × 20 đội × 120 phút = 48 720 thì tưởng vượt ngân sách 20 000, trong khi ngoại suy đúng ≈ 7 000 (plan §9).
- **Tái hiện:** có (kịch bản 10).
- **Sửa:** in thêm ngoại suy "≈ (36 × 120) + phần theo đội × 20 đội" như dòng request.

## Đã kiểm, ổn (không lỗi)
- Ghi trước khi trả lời, dựng lại từ SQLite: restart giữ đội, pose hợp lệ cuối, cờ, xe, hộp đang hiện, bộ đếm.
- Không lộ: hộp bước sau / hộp đội khác, vị trí đội ngoài 500 m (tick rỗng khi ra xa), xe ngoài 250 m; `host.state` (mã đội, `steps`) chỉ tới Host; nội dung chặng không có trong bundle.
- Quota: client chỉ gửi khi đổi (đứng im = chỉ `ping`, trả lời tự động), `wsIn` = số tin gửi thật (sim 1 808 = 1 808), ngoại suy 36 460 < 40 000.
- Kiểm tốc độ: đi bình thường, mạng khựng dồn tin, dời 250 m bằng `respawn` → không cờ; dời 2 km → cờ (đúng).
- Nhận xe nguyên tử ở server (2 `claim` cùng ms → 1 ok + 1 `taken`), xe bị bỏ 200 m / 60 s, ứng viên xe từ Host + đợt đầu, xe theo đội trong 250 m.

## Không làm được / giới hạn
- Độ mượt người chơi khác bằng mắt (2–5 FPS SwiftShader); đội kia thấy người thắng đang đạp xe (chặn bởi E1); chuông `R` qua mạng (chặn bởi E1); Firefox / Safari (chỉ có Chrome headless).
- Alarm đặt xe khi không còn ai online (cần chờ ≥ 3 phút, đã có test đơn vị) – không chạy đầu-cuối.
