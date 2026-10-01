# Phase 5 – FIX-FB: "Kẹt?", xe khi mở bản đồ / menu, phím menu, toast, F3

Nền: `main` @ `cd47483`. Chỉ sửa lỗi người chơi thấy trực tiếp (review 1: M1, M2, M3, m1, m2, m6, m7, m9, m5 / m14; review 2: m1).

## Đã sửa

| Mục | Sửa | Test |
|---|---|---|
| R1-M2 "Kẹt?" về đúng chỗ kẹt | `CharacterController`: lịch sử chỗ an toàn lấy mẫu **theo quãng đường** (`respawnRules.spacing` 4 m so với mẫu mới nhất; mẫu cũ cách mẫu mới < 4 m bị bỏ, nên đứng yên hay đi vòng trong sân nhỏ không làm đầy lịch sử; tối đa `history` 30 mẫu ≈ 120 m đất mới). `respawn()` chọn mẫu mới nhất vừa ≥ `minAge` 5 s tuổi vừa cách chỗ hiện tại ≥ `minDistance` 15 m (đường thẳng); không có thì mẫu cũ nhất. Bỏ `player.safeEvery` (không còn dùng). Có `ponytail:` (khoảng cách đường thẳng, không xét lối đi được). | Rapier: đi 6 s rồi đứng yên 9 s → lùi 15–19,5 m theo đường đã đi; rơi vào hố kín sâu 1,5 m (10 × 10 m), đi vòng 12 s → về lại mặt đất ngoài hố (y ≈ 0). |
| R1-M1 "Kẹt?" khi đạp xe lùi 60 m | `rideStep` cũng lấy mẫu (cạnh `bikeSafe`). Xe vẫn ở lại chỗ bánh xe chạm đất cuối (thiết kế track C). | Rapier: đạp 10 s rồi "Kẹt?" → lùi ≥ 15 m và < 6 × tốc độ xe (≈ 31 m), không về chỗ lên xe. |
| R1-M3 xe trôi 23 m khi mở bản đồ / menu | `haltIntent` (mới, `CharacterController.ts`): khi menu / bản đồ mở, `Player.fixedUpdate` mỗi bước vật lý đặt lệnh phanh (`S`) nếu xe còn chạy tới, rồi 0 khi đã dừng, nên không lùi. | Rapier: xe 5,2 m/s, phanh tới 0 trong quãng phanh v² / 2·brakeDecel (≈ 1,9 m), tốc độ không bao giờ âm. |
| R1-m1 Tab / Space trong menu | `Input.keydown`: khi chuột chưa khóa và focus ở `<button>` / `<a href>`, `Tab` / `Space` / `Enter` là của nút (không `preventDefault`, không ghi nhận `clueBook` / `jump`). `Esc` và các phím khác như cũ. `Menu.close()` bỏ focus nếu nó nằm trong menu (không giữ `Space` khi đã chơi lại). | Node: Tab / Space trên nút không ghi nhận, Esc vẫn ghi nhận; trên body hoặc khi chuột khóa: như cũ; ô `<input>`: như cũ (Esc chỉ bỏ focus). |
| R1-m2 "Tiếp tục" ngay sau Esc | `Menu`: nút không tự đóng menu; menu đóng khi khóa chuột thành công (`onPointerLockChange`). Khóa bị từ chối thì menu vẫn mở, bấm lại được. | – (hành vi trình duyệt thật) |
| R1-m7 hai dòng toast giống nhau | `nextFeed`: lặp sau `repeatGap` thì dòng cũ bị thay bằng dòng mới (không bao giờ hai dòng trùng). | Node (sửa test cũ). |
| R1-m6 dựng lại DOM toast mỗi bước | `toast()` không vẽ lại khi dòng lặp bị bỏ. | – |
| R1-m9 | `__GAME__.minimap`, `__GAME__.fullMap()` (DEV). | – |
| R1-m5 / R2-m1 F3 đè `#help` | F3 `top: 72px` (dưới `#help`). | ảnh `p5-debug` |
| R1-m14 | `M` không mở bản đồ khi đang bay tự do (`V`); đóng vẫn được. | – |

## Bỏ qua (đề xuất TODO cho người tích hợp)

- m4 tay cầm: nút Menu không mở menu khi chuột khóa; bản đồ lớn chưa dùng tay cầm.
- m10 tab "Luật đua" tải lười (+1 request static).
- m11 hằng số 300 ms trong `main.ts`.
- m3 `Esc` đóng menu có thể không khóa lại chuột trên trình duyệt thật (cần kiểm tay).
- Các lỗi nhỏ khác của review (m8, m12, m13, phần còn lại của m14) thuộc FIX-FA hoặc để sau.

## Kiểm tra

- 4 test Rapier mới (M1, M2 × 2, M3) **hỏng trên code cũ** (đã chạy với `CharacterController.ts` của `cd47483`), qua trên code mới.
- `npm run build`: qua. `npm test`: qua (scripts 18, shared 11, client 54 file / **534** test, worker 6).
- Chrome headless (script tạm, đã xóa):
  - F3 `[739,72 → 1272,264]`, `#help` `[506,16 → 774,62]` ở 1280 × 720; F3 `[483,72 → 1016,264]`, `#help` `[378,16 → 646,62]` ở 1024 × 640: không chồng.
  - `?menu`: `Tab` "Tiếp tục" → "Kẹt? Về chỗ an toàn" → "Cài đặt", `Shift+Tab` × 2 về "Tiếp tục"; `Space` bấm "Tiếp tục": chuột khóa, menu đóng, focus về `BODY`.
  - `?player&bike`, giữ `W` 3 s rồi `M`: xe dừng (tốc độ 0) sau **1,93 m** (trước: 22,9 m), bản đồ vẫn mở.
- Ảnh (đã xem): `p5-menu` (menu, nút "Tiếp tục" có viền focus), `p5-respawn` (lên bậc kè + toast), `p5-debug` (F3 nằm dưới `#help`, không che "Esc menu"); thêm F3 ở 1024 × 640.
- `SCREENSHOT_PORT=5282 npm run ride-check` (tải máy ≈ 12): **qua cả 3 phần** ngay lần đầu (đi bộ 4,000 / xe 5,200 m/s, tỉ lệ 1,300; ngã / lên lại; xuống bậc kè, vào bậc từ mặt bên, leo lên y −4,96).
- Không còn vite / wrangler chạy.
