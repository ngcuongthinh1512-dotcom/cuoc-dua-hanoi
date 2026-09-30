# Phase 4B – FIX-F1: xe NPC (đèn tín hiệu, vòng xuyến, giao lộ, chồng xe)

Nhánh worktree từ `main @ 04c2050`. File sửa: `client/src/npc/{traffic.ts, traffic.test.ts, lights.ts, NpcRenderer.ts, NpcRenderer.test.ts, types.ts}` + khối `traffic` và các khóa đèn / bánh trong `npcRender` (`client/src/config.ts`). `npm run build && npm test` qua (client 44 file / 449 test).

Số đo "trước" lấy từ log của reviewer 1 (cùng máy, cùng script `sim / jump / grid / ringwait / heads`); số "sau" chạy lại chính các script đó trên code worktree (bản sao trong scratchpad `f1/`, chỉ đổi đường dẫn import). dt = 1/60 như game, 300 s sau 20 s warm-up, lấy mẫu 0,1 s.

## Từng finding

### B1 – cột đèn giữa lòng đường, hộp đèn quay lưng xe (đã sửa)
- **Hợp đồng chốt trong `types.ts` (`SignalHead`)**: `(x, z)` = chân cột, ĐÃ ở kè phải ngoài lòng đường (tim + halfWidth + `traffic.lights.kerb`, ngang vạch dừng); `yaw` = hướng mặt đèn nhìn (quy ước PlayerState, 0 = bắc / −Z, + = trái) = **về phía xe tới** (ngược chiều xe chạy). Renderer đặt cột đúng `(x, z)`, không dịch thêm.
- `lights.ts`: giữ nguyên công thức (đã đúng hợp đồng), `+0,5` → `traffic.lights.kerb`.
- `NpcRenderer.ts`: bỏ dịch ngang `halfWidth + kerb`; cột đặt tại `(h.x, h.z)`; quay hộp `yaw + π` (mặt +Z của hộp = `(−sin yaw, −cos yaw)`); bóng đèn dời `npcRender.lights.bulbOut` (0,25 m) về đúng hướng đó. Khóa `npcRender.lights.kerb` bỏ, thêm `bulbOut`.
- **Trước:** 18/18 head quanh Concorde cách tim 0,00 m, tích vô hướng mặt đèn·hướng xe tới = −1. **Sau:** test mới với `TrafficLights` thật: 100 % head trong 300 m quanh Concorde + Opéra + Rue Royale (> 30 head) có chân cột cách tim ≥ halfWidth, nằm bên phải chiều xe, mặt đèn·(−u) > 0,99 (`traffic.test.ts` "SignalHead contract"); `NpcRenderer.test.ts` khối mới trên đồ thị thật: ma trận cột đúng `(h.x, h.z)`, ≥ halfWidth khỏi tim, trục +Z của hộp và bóng đèn đúng hướng `yaw`.
- Ảnh `p4b-red` chụp lại (port 5221): không còn cột giữa Champs-Élysées.
- Đèn vẫn không có collider (ponytail như biển tên đường, không rẻ để thêm vì cột nằm trên vỉa hè, xe không đi qua; người chơi có thể đi xuyên).

### B2 – xe vào vòng xuyến nhảy ngang 27 m (đã sửa)
- Bỏ `car.lane = laneN − 1` khi vào vòng (`move()`); làn giữ nguyên chỉ số, kẹp theo cạnh → `place / exitClear / claim` cùng một làn.
- Thêm: góc cua **bất đối xứng** `corner(de, nx, lane) = {cA, cB, arc}` (cache theo cạnh + làn): `cA` (trước nút trên cạnh vào) / `cB` (sau nút trên cạnh ra) nới rộng hơn `cornerCut` sao cho điểm cuối Bézier nằm ≥ `traffic.cornerAhead` (2 m) *phía trước* điểm đầu theo cả hai đường (rẽ phải vào làn ngoài vòng 36 m trước đây phải chạy lùi 7,5 m đè hàng xe trên nhánh; ra vòng không còn chui vào tâm). `arc` = độ dài polyline 8 đoạn của Bézier: góc cua được đi hết đúng `arc` m của `s` (trước là 2c ảo = 12 m cho góc thật 2,6–7,8 m → xe "khựng" ở góc và xe sau đâm vào). `pathPoint` thêm 2 tham số tùy chọn `len`, `cB` (mặc định như cũ, test cũ giữ nguyên).
- **Trước:** Étoile 5 phút: 62 lần nhảy > 0,5 m/bước (tối đa 27,0 m), Concorde 4 (14,6 m). **Sau:** Concorde 0; Étoile 1 lần 1,86 m (một lần chuyển cạnh, chưa truy — ghi TODO). Cặp xe chồng cùng cạnh cùng làn: Étoile 285 mẫu → **0**; Concorde 5 → 0; Opéra 36 → 0; Marais 0; St-Germain 183 → 0.

### R2-M1 + m1 – vòng Étoile không có xe (đã sửa)
- `refreshNear`/`spawn`: trọng số sinh = độ dài cạnh (bỏ `max(0, L − 12)` và `6 + rng·(L − 12)`), `s = rng·L` → 35 cạnh vòng 12,4 m nhận đúng phần của mình.
- `approaching(…, ringOnly)`: kiểm tra vào vòng chỉ đệ quy qua cạnh `roundabout` → xe ở nhánh khác không còn chặn.
- Xe đã qua vạch vào vòng không bị xét lại (`before` mới xét `tryGrant` ring); thay vào đó xe trên vòng phanh trước nó (xem "arriving" ở M5).
- `traffic.turn.ring` 1,5 → 3 (xe ở lại vòng lâu hơn: trung bình ≈ 3,5 lối ra); thử 4 thì test "ra vòng trong 90 s" trượt ở mật độ 2.
- **Trước:** mật độ 1,5: trung bình 2,7 (neo reviewer (−1806, −812)) / 1–5 xe (neo preset); 20–28 % thời gian chờ ở vạch do xe KHÔNG ở trên vòng. **Sau:** neo preset (−1916,4, −921,7): **8,8 xe** trên vòng; neo reviewer: 4,5 (vòng lệch khỏi bán kính 250 m → ít nhánh được sinh); chờ do xe không trên vòng: 123 → 0–6 xe·s. Ảnh `p4b-etoile` có xe trên vòng (5 xe trong khung).
- Đề xuất cho FIX-F3: neo preset `p4b-etoile` đặt ở tâm vòng.

### M1 – giữ quyền qua giao lộ khi bị chặn phía sau → kẹt (đã sửa, bản rẻ)
- `lineCap`: xe bị chặn (đèn đỏ nút kế, lối ra chưa trống, claim của xe khác) trong khi mũi còn trước vạch của nút nó đang giữ quyền → `release()` (grant = −1, `owners.delete`); trong `decide()`: cap < 0,3 m/s vì xe trước / người đi bộ mà còn trước vạch → nhả.
- `tryGrant` (nút không đèn): chỉ lấy quyền khi `clearsBox` — cạnh ra đủ chỗ để dừng ngoài hộp giao lộ (`len − stop − cB − len xe − minGap ≥ 0`) hoặc nút kế không chặn lúc đó. KHÔNG áp cho đèn xanh: thử thì kẹt cứng 0 % (hai nút đèn 13 m không đồng pha: n xanh ⇔ m đỏ) — ghi ponytail, nâng cấp = lệch pha cặp nút đèn gần nhau.
- Sửa thêm lỗi deadlock tìm thấy khi đo mật độ 2: kiểm tra claim so `other.route[0]` với cạnh thứ j (j ≥ 1) → xe **phía sau cùng làn** đã claim lối ra ở nút kế bị coi là "nhánh khác" → xe trước đứng chờ xe sau, xe sau chờ xe trước (Concorde seed 3, 51/51 xe đứng). Nay: chặn chỉ khi claimant không đi qua cạnh đó cùng làn; `car.claim` chỉ ghi cho lối ra kế (j = 0).
- **Tiêu chí "≥ 80 % xe đi ≥ 50 m phút cuối", dt 1/60, mật độ 1** (grid.mts, 4 seed):

| | Seed 1 | Seed 2 | Seed 3 | Seed 4 |
|---|---|---|---|---|
| Concorde trước | 88 % | 52 % | 72 % | 88 % |
| Concorde sau | **80 %** | **96 %** | **92 %** | **84 %** |
| Opéra trước | 97 % | 85 % | 85 % | 67 % |
| Opéra sau | **92 %** | **90 %** | **95 %** | **90 %** |

- Mật độ 2 (chỉ báo, không phải tiêu chí): Concorde 49 / 0 / 51 / 55 % (trước 51 / 63 / 63 / 29); Marais 77 / 72 / 84 / 73 % (trước 41 / 98 / 45 / 68). Concorde seed 2 mật độ 2 kẹt vòng: chuỗi 5 nút sát nhau quanh Rivoli / Saint-Florentin, các hàng xe lấp đầy cạnh 4–7 m giữa các nút → gridlock vật lý thật (xem "còn lại").

### M5 – xe–xe chồng nhau ở giao lộ (làm phần rẻ, ngoài phạm vi thu hẹp nhưng đã xong)
- (1) vào vòng: B2. (2) làn 0 mới rẽ phải / làn cuối mới rẽ trái (`extend()`, cạnh vòng miễn — ra vòng từ mọi làn, ponytail). (3) mọi xe đang trong góc cua đăng ký claim cho `route[1]` ngay trong snapshot (ưu tiên trước xe chưa qua vạch). (4) **`arriving`**: xe đã qua vạch dừng / trong góc được ghi lên cạnh ra với vị trí quy đổi (`s − shift`); `gapAhead` của xe trên cạnh ra (và xe cùng nhánh khác làn bị gộp làn) thấy nó phía trước → phanh. Nhờ đó xe trên vòng phanh cho xe đang nhập, hai làn gộp vào một không đâm nhau, xe từ hai nhánh vào cùng lối ra xếp hàng.
- Mẫu chồng (OBB, sim.mts, mật độ 1, 300 s):

| Điểm | Trước | Sau | Giảm | Lớp còn lại |
|---|---|---|---|---|
| Concorde | 619 | 12 | 98 % | 1 cặp hai nút sát nhau |
| Opéra | 209 | 390 | tăng | 4 cặp `lit sameExit RS` (rẽ phải + đi thẳng cùng lối ra, kéo dài vì hàng chờ trên lối ra), 2 hai nút sát nhau |
| Étoile | 334 | 44 | 87 % | hai nút sát nhau |
| Marais | 684 | 157 | 77 % | 10/14 cặp hai nút đèn cách 6 m (xe đứng trong hộp chờ đèn đỏ nút kế) |
| St-Germain | 184 | 58 | 68 % | hai nút sát nhau, `lit RR` |
| Concorde mật độ 2 | 401 | 154 | 62 % | |

- Không đạt ≥ 80 % ở Opéra (số thật: tăng — 4 cặp kéo dài; là lớp (5) rẽ vào cùng lối ra khi đèn cùng pha, chưa xử lý), Marais, St-Germain. Phần còn lại đều thuộc lớp (4) hai nút sát nhau / (5) — ghi ponytail ở đầu `traffic.ts`.

### m3 – bánh quay lệch tốc độ (đã sửa)
- `CarPose.wheel` nay là **mét đã lăn** (chú thích trong `types.ts` đổi theo; chữ ký không đổi); renderer chia cho `VehicleTemplate.wheelRadius` của model → sim và hiển thị dùng cùng một bán kính. Bỏ `traffic.wheelRatio`, `SimCar.wheelR`. Người tích hợp lưu ý: đây là đổi nghĩa trường trong hợp đồng (đơn vị m thay vì rad) — không ai khác đọc `wheel` ngoài `NpcRenderer`.

### m4 – hằng số cứng (phần của tôi, đã làm)
- `traffic.lights.kerb` (0,5), `traffic.queued` (8 m), `traffic.ringJoin {speed 4, maxSeconds 6}`, `traffic.decide {factor 1.3, margin 3}`, `traffic.turn {ring, straight, side, back, rankFactor, straightRad, backRad}`, `traffic.cornerAhead` (2), `npcRender.lights.bulbOut` (0,25). `traffic.ts:500/522` (12 m, 6 m) biến mất theo R2-M1.

### m8 – test (phần của tôi, đã làm)
- Toàn bộ `traffic.test.ts` chạy dt 1/60 (`HZ = 60`); test kẹt xe chạy seed 1 và 2 (`it.each`); test chồng xe không còn bỏ qua gap < −0,5 (mọi gap < minGap là lỗi; kết quả worst = 2,00 m); test mới B1 (2 file). Test Étoile: "worst ring gap" 7,95 m.

## Số đo hiệu năng (in trong test)
- 60 xe: **0,135 ms/bước** ở 60 Hz (trước 0,184; ngân sách 0,5); 5 phút Concorde 0,067 ms/bước kể cả kiểm tra; warm-up 34 ms; `TrafficLights` 920 nút / 1 959 head dựng trong 8 ms.
- Tất định theo seed: test "same seed → same state" qua; không `Math.random` / `Date`.

## Còn lại / ponytail / đề xuất TODO
- `// ponytail` đầu `traffic.ts`: rẽ trái không nhường xe đối diện khi xanh; hai nút cách nhau < 2 × cornerCut không kiểm tra góc cua chéo nhau (Concorde, Marais); ra vòng cắt qua các làn trong; đèn xanh vẫn được vào hộp không thoát được (cặp đèn không đồng pha).
- Đề xuất dòng TODO:
  - Xe NPC: rẽ trái nhường xe đối diện; kiểm tra xung đột góc cua giữa hai nút giao sát nhau (Marais (2601,1021), Concorde Rivoli / Saint-Florentin) — nguồn chính của các cặp xe chồng còn lại.
  - Xe NPC: đồng bộ / lệch pha cặp nút đèn cách nhau < `lights.reach` để áp dụng "không vào hộp khi không thoát được" cho đèn xanh; mật độ 2 vẫn có thể kẹt vòng ở cụm nút sát nhau (Concorde seed 2).
  - Xe NPC: 1 lần nhảy 1,86 m/bước ở Étoile (chuyển cạnh, 1 lần / 5 phút) chưa truy nguyên.
  - Xe NPC: cạnh 4–7 m giữa hai nút giao: xe dài (bus 12 m) luôn đứng trong hộp.
  - Đèn tín hiệu: chưa có collider.
  - Preset `p4b-etoile`: neo ở tâm vòng (FIX-F3).
- Screenshot chụp lại: `screenshots/p4b-red.png`, `p4b-etoile.png` (port 5221; không commit ảnh — người tích hợp chụp bản cuối).
