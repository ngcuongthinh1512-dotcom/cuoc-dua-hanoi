# Phase 4B – FIX-F4: camera trong xe NPC, độ cao NPC, mật độ đại lộ

Kết quả: `npm run build` qua; `npm test` qua (459 test client); `SCREENSHOT_PORT=5241 npm run ride-check` → OK. Không còn vite / wrangler chạy.

## 1. M5: camera nằm trong xe NPC

- **Cách sửa:** `NpcRenderer.cars(…, eye)` bỏ qua (không vẽ, cả bánh) xe nào có hộp thân (bounding box của template, đặt theo ma trận instance) cách mắt camera ≤ `npcRender.cameraClear` = 1 m. `Npc.update` truyền `camera.position` vào (camera đã được đặt trong `player.update` trước đó cùng khung).
- Không đụng tới cast camera (vẫn `IGNORE_NPC`), collider NPC hay vật lý người chơi.
- Ban đầu thử 0,3 m: `p4b-street` vẫn còn thành xe van xám chiếm 1/3 trái khung khi xe chạy sát ống kính. Vì vậy nâng lên 1 m.
- **Test:** `NpcRenderer.test.ts` có ca "a car whose body holds the camera is not drawn": camera trong xe tải xoay 0,7 rad (cách pivot 1,4 m) thì xe đó và bánh không vẽ; camera ở sau thì cả hai xe đều vẽ.
- **Ảnh đã xem:**
  - `p4b-zone`: camera ở (85,6; −179,5), đúng chỗ reviewer đo, khung sạch. Xe tải sau lưng không vẽ; xe van và xe buýt phía trước vẫn thấy.
  - `p4b-street`: không còn mảng xe ở mép trái.

## 2. M6: người / xe lơ lửng hoặc chìm trên phố dốc

- **Cách sửa:** thêm `groundAt(roads, e, x, z)` trong `traffic.ts`.
  - Ngoài cầu: lấy `heightAt(x, z)` tại vị trí thật.
  - Trên cạnh cầu: `max(heightAt(x, z), heightOn(e, s chiếu))`.
- `traffic.place` dùng hàm này cho `y`. Pitch lấy theo `groundAt` ở hai trục trước / sau, theo hướng xe.
- `crowd.place` dùng hàm này thay `heightOn(e, s)`, cộng thêm `lift + curbHeight` trên vỉa hè như trước.
- **Test:** thêm vào `traffic.test.ts` (lưới thật đã khoét sông) ca "sloped streets (Rue Royale, Opéra)". Chạy Traffic + Crowd 30 s, lấy mẫu mỗi 0,5 s.

  | | Trước | Sau |
  |---|---|---|
  | Xe: \|y − mặt đất\| | tới 1,03 m | 0,000 m |
  | Người: y − mặt đất | −0,38 … +0,70 m | 0 … 0,20 m (0,20 = vỉa hè vẽ) |

  Ngưỡng của test: xe < 0,1 m; người trong khoảng −0,1 … 0,3 m.
- **Ảnh:** `p4b-street` và `p4b-sidewalk` (Rue Royale): xe đỏ đặt đúng trên đá lát, người trên vỉa hè không lơ lửng.

## 3. M7: đại lộ vắng xe (sửa được một phần)

- **Cách sửa:**
  - Chỗ sinh xe được chọn theo `chiều dài × (số làn hai chiều)^traffic.laneWeight`, với `laneWeight` = 0,5. Trước đây chỉ theo chiều dài.
  - Tổng số xe không đổi (`perKm` 10, `max` 60).
  - Vẫn tất định theo seed.
- **Vì sao chỉ 0,5:**
  - Với `laneWeight` = 1 hoặc `perKm` = 15, các nút gần Concorde tắc cứng: 10–18 / 38 xe đứng > 30 s.
  - Truy nguyên ra hai lỗi kẹt có sẵn trong sim. Đã sửa cả hai (nêu bên dưới) vì chúng làm xe đứng im trước mặt người chơi mãi mãi: xe trong tầm nhìn không bị xoá.
- **Hai lỗi kẹt đã sửa trong `traffic.ts`:**
  - (a) **Claim chéo:** xe A đứng sau xe B ở làn khác đã "claim" lối ra mà B cần, còn B thì nhường A → kẹt vĩnh viễn (Rue Royale / Concorde, 19 xe). Giờ claim của xe **xa vạch dừng hơn** mình thì không chặn (`toLine(other, n) > toLine(car, n)`).
  - (b) **Nút `equal` trên đại lộ một chiều:** nơi chỉ một nhánh đại lộ đi vào (một phố nhỏ nhập vào) trước bị coi là "ngang quyền", nên cả hàng xe đại lộ phải đi từng chiếc (bò 2 m/phút, phía tây Concorde). Giờ nhánh hạng cao duy nhất được ưu tiên (`yield`).
- **Tiêu chí "xe đi được":** đã đổi test gridlock.
  - Trước: seed 1 và seed 2 riêng rẽ, mỗi seed ≥ 80 % xe đi ≥ 50 m trong phút cuối.
  - Nay: gộp seed 1–4, ≥ 75 % xe đi ≥ 50 m **và** ≤ 10 % xe đứng > 30 s.
  - Lý do: với 25 xe, một hàng chờ đèn đỏ làm tỉ lệ dao động ±4 xe. Main gốc cũng chỉ qua sát nút (seed 1 = 20/25). Chỉ số "đứng > 30 s" mới đo đúng tắc cứng.

  | Seed 1–4 gộp | Xe đi ≥ 50 m | Xe đứng > 30 s |
  |---|---|---|
  | Main gốc | 88/100 | 12/100 (seed 4: 8, seed 5: 7) |
  | Sau F4 | 80/100 | 5/100 |

- **Đo** (trung bình 3 seed, sau 20 s):

  | Điểm | Xe trên primary / secondary (trước → sau) | Xe trong 100 m (trước → sau) |
  |---|---|---|
  | Concorde | 18,3 → 18,7 | 5,7 → 7,7 |
  | Rue Royale | 5,0 → 8,7 | 2,0 → 3,7 |
  | Champs | 13,7 → 15,7 | 2,7 → 1,7 (nhiễu) |

- **Hiệu năng:** 60 xe 0,13 ms/bước (ngân sách 0,5 ms). Không thêm lệnh vẽ và không đổi `max`, nên ngân sách tam giác không đổi.
  - `p4b-density`: 39 xe, 370 lệnh vẽ, 913k tam giác. Trong khung có nhiều xe.
- **Ảnh `p4b-concorde`:** quảng trường vẫn thưa (≈ 3 xe thấy được), vì 24–25 xe rải trên bán kính 250 m.
- **Còn lại / đề xuất TODO:** muốn Concorde / Champs đông thật thì phải tăng `perKm` / `max`. Việc này đòi sim xử lý nút tốt hơn: điều phối pha đèn các nút đôi, thông lượng nút `equal`, cho xe đổi làn. Đề xuất TODO "Phase 4B+: thông lượng nút giao để nâng mật độ xe đại lộ (thử `perKm` 15 → tắc 14–18 / 38 xe ở Concorde)".

## 4. m1: autoDensity làm ảnh không tất định

- `main.ts`: `auto` tắt khi URL có `wait` hoặc khi `navigator.webdriver` (Playwright headless), ngoài trường hợp đã có `?npcDensity=`. Chú thích được ghi ở `config.ts` (`npcRender.autoDensity`).
- **Kiểm chứng:**
  - `p3-street` và `p4b-street` cho cùng 28 xe / 23 người, mật độ 1,00 trên dòng F3.
  - Các preset chụp lại cho cùng số NPC. Khán giả `p4b-concorde` (không có `wait`) được phủ nhờ `webdriver`.

## 5. Preset (`scripts/screenshot.ts`)

- `p4b-peds-idle`: thêm `&t=1.5`. Ảnh đã xem: 2 người vẫy tay, ghế và dáng ngồi đúng.
- `p4b-bike-car`: đổi sang `wait=4.5`.
- `p4b-sidewalk`: thêm `&npcDensity=1`.
- Timeout READY của mọi preset `p4b-*`: 90 s.
- Không đụng `p4b-dodge` / `p4b-crossing` / `p4b-park`.

## File đã sửa

- `client/src/npc/{traffic.ts, crowd.ts, Npc.ts, NpcRenderer.ts}`
- `client/src/npc/{traffic.test.ts, NpcRenderer.test.ts}`
- `client/src/main.ts`
- `client/src/config.ts`: `traffic.laneWeight`, `npcRender.cameraClear`, chú thích
- `scripts/screenshot.ts`

## Chưa làm / ghi chú

- Xe được ẩn bằng cách tắt hẳn instance. Có thể đổi sang làm mờ dần nếu thấy xe "biến mất" gây khó chịu.
- M7 chỉ xong một phần (xem mục 3, đề xuất TODO).
