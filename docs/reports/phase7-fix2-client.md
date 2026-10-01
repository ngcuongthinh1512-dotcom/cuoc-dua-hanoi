# Phase 7 – sửa vòng 2 (client)

Phạm vi được sửa: `client/src/race/**`, `client/src/net/**`, `client/src/main.ts`, `client/src/player/**`, `client/src/ui/**`, `client/src/config.ts`, `client/index.html`, `scripts/screenshot.ts`.

Kết quả cổng kiểm tra: `npm run build` và `npm test` đều qua, chạy trên cây làm việc chung (có cả thay đổi chưa commit của hai agent kia). Các test mới đều fail nếu bỏ bản sửa tương ứng.

## Backlog

### 1. Thẻ đầy đủ / Sổ mật thư nằm dưới minimap, tên phố, đồng hồ (1024×640)

`client/src/race/ui/race.css`: `.rc-overlay` đổi `z-index` từ 0 lên 1. Các ô HUD không có z-index nên giờ nằm dưới lớp phủ.

Menu và toast cũng có z-index 1, nhưng được tạo lúc dùng lần đầu, tức là sau RaceHud (RaceHud tạo lúc khởi động), nên vẫn vẽ đè lên lớp phủ. Credits / thanh báo mạng (2) và màn đăng nhập (3) cũng vẫn ở trên.

Thêm một chặn trong `main.ts`: phím M không mở bản đồ lớn khi sổ hoặc thẻ đang mở. Nếu không chặn, bản đồ sẽ mở ra bên dưới lớp phủ.

Kiểm tra bằng hai preset mới chụp ở cửa sổ 1024×640, `p7-book-small` và `p7-card-full-small`. `scripts/screenshot.ts` có thêm bảng `VIEWPORT` cho từng preset; preset khác vẫn dùng 1280×720. Đã xem ảnh: sổ và thẻ che lên minimap, tên phố và đồng hồ.

### 2. Nút nhiệm vụ gửi `net.send` thẳng, không gửi pose trước (D4)

- Thêm `RaceClient.task(step, branch)`, đi qua `deps.op` như F / check-in. RaceHud gọi `race.task`.
- Thêm `NetClient.flushPose(p)` (reset gate rồi gửi pose). Nó thay cho cách ép kiểu vào `gate` riêng của NetClient (bỏ luôn comment ponytail cũ).
- Lệnh `book` vẫn gửi thẳng: server không xét pose cho lệnh này, và nhấn Tab liên tục sẽ không làm tăng gấp đôi số tin nhắn.

Test:
- `RaceClient.test.ts` › "task button (D4)": lệnh đi qua `op`, không qua `send`.
- `NetClient.test.ts` › "flushPose…": một pose không đổi vẫn được gửi ngay.

### 3. Offline: Tab mở Sổ mật thư kẹt ở "Đang tải…"

Khi không có mạng, hành động `book` trả lời ngay bằng `showBook([])`, nên sổ hiện "Chưa có mật thư nào.".

Đã kiểm tra bằng script Playwright tạm: `/?offline=1&player&npc=0`, nhấn Tab thì sổ mở với dòng "Chưa có mật thư nào.", nhấn Tab lần nữa thì sổ đóng.

Ở DEV, các preset `p7-book` / `?book` vẫn dùng dữ liệu minh họa như trước.

### 4. Bảng phím (menu "Phím điều khiển") thiếu Tab / Enter / 1 / 2

`client/index.html` `#keys-src`:
- Dòng F thêm "mở hộp mật thư".
- Thêm dòng mới: "Tab Sổ mật thư (↑ ↓ cuộn) · trên thẻ mật thư: Enter hoặc 1 2 nút hoàn thành".

Đã xem ảnh menu.

### 5. Tên trên đầu NPC dẫn chương trình không đọc được

- `CharacterOptions.tag` (`player/CharacterModel.ts`): màu tên riêng. Nếu bỏ trống thì vẫn lấy màu áo (màu đội) như cũ.
- `config.ts`: `raceClient.host.tag = '#ffd75e'` (vàng nhạt). `PitStop.ts` truyền màu này vào.

Test `CharacterModel.test.ts` › "name tag":
- Tên của đội có màu áo.
- Tên của NPC dẫn có độ sáng > 0,5, trong khi áo tối (< 0,3).

Ảnh `p7-celebrate` và `p7-mat`: chữ "Người dẫn chương trình" màu vàng, đọc rõ.

Còn một vấn đề chưa sửa vì không nằm trong backlog: ở xa (`p7-mat`), tên NPC vẫn chồng lên tên của đội mình.

### 6. Giờ về đích lệch 1 s giữa người chơi và Host

Host làm tròn (`hostView.ts fmtDuration`; agent Host đang sửa `fmtMinSec` để cũng làm tròn trọn giây). Client giờ dùng cùng một quy ước làm tròn:

- `formatHms` (câu của NPC): `Math.round`.
- `formatDuration` (cột "Thời gian làm" trong sổ): làm tròn, khớp ma trận bước của Host (`fmtMinSec`). Trường hợp e2e 483 873 ms: trước đây người chơi thấy 08:03, Host thấy 08:04.
- Đồng hồ phạt đếm ngược vẫn làm tròn lên, nay viết rõ bằng `Math.ceil` thay cho mẹo `+ 999`.
- `RaceClient.raceClock`: khi đã về đích, đồng hồ HUD dừng ở số giây đã làm tròn. Như vậy HUD, câu NPC và Host đều hiện cùng một số. Trong lúc đang chạy, đồng hồ vẫn cắt như đồng hồ bấm giờ.

Test `format.test.ts` › "the team reads the Host table time…" import thẳng `fmtDuration` / `fmtMinSec` của Host và so với `formatHms` / `formatDuration` / `raceClock`, gồm cả 1 245 909 ms (e2e: 00:20:45 so với 00:20:46). Có thêm test đếm ngược phạt ở mốc lẻ giây.

### 7. Sau khi Host bấm "Kết thúc", đội chưa về đích không vào chế độ chỉ đọc

`RaceClient`:
- `welcome` có `view.status === 'finished'` → `finished(false)`, tức là vào chế độ khán giả ngay.
- Message `race` chuyển sang `finished` mà đội chưa có `finishAt` → `finished(false)`, chỉ một lần.
- Đội đã về đích từ trước thì chỉ ăn mừng như cũ; việc cuộc đua kết thúc không thêm gì.

`RaceHud`: khi `status === 'finished'` thì không vẽ nút "Hoàn thành (tạm)" nữa. Tab vẫn mở sổ để xem (chỉ đọc).

Test `RaceClient.test.ts` › "Host 'Kết thúc'…": gồm trường hợp đang chơi, trường hợp vào lại, và đội đã về đích.

### 8. Camera nằm trong vòm đá ở điểm xuất phát Bir-Hakeim

Đã kiểm tra, không cần sửa client. Camera va chạm đúng; vấn đề nằm ở vị trí xuất phát.

Đo bằng script Playwright tạm tại `?start=` của đội 1:
- Chân ở (−2462,22; 1,6; 1088,72), camera ở (−2459,07; 3,97; 1093,2). Tay đòn đủ 5,5 m, không bị rút ngắn.
- Tia Rapier từ camera chạm collider ở khoảng cách: lên 2,28 m, xuống 2,37 m, đông 1,73 m, tây 4,8 m, bắc 2,89 m, nam 8,01 m.
- Raycast mesh three.js theo 6 hướng đều trúng mặt trước. Vậy camera nằm trong khoảng trống của lối đi vòm, không nằm trong khối đá, và không thấy mặt trong của mesh.

Kết luận: góc nhìn tối vì điểm xuất phát chỉ cách cửa vòm 1–5 m, nên camera ở phía sau, trong lòng vòm. Đây là điều đúng về mặt hình học. Dời điểm xuất phát vài mét về phía trước theo yaw (`worker/legs/paris-demo.json`) là việc của đợt host-tools. Preset `p7-start` sẽ tự lấy điểm mới.

## Thêm (rẻ, cùng chỗ)

- **`main.ts`, review2 F3:** vùng cấm NPC giờ được đặt lại ngay khi `Npc.create` xong. Trước đây, hộp đến trong lúc asset NPC đang tải sẽ bị bỏ qua cho tới lần hộp đổi tiếp theo.

## Chưa sửa (ngoài phạm vi)

### Finding mới: xe NPC đứng trong vùng hộp mật thư (`client/src/npc/traffic.ts`)

File này nằm ngoài phạm vi của agent này. Thay đổi cần làm:

1. **`config.ts`, khối `traffic`:** thêm `zoneStillSeconds: 2`. Nghĩa là: đứng yên trong một vùng hộp / thảm (ExclusionZone + npc.zoneMargin) lâu hơn số giây này, và ngoài nón nhìn, thì xe bị bỏ.
2. **`traffic.ts` `step()`, trong `keep` của phần despawn:** thay
   `c.still > traffic.stuckSeconds`
   bằng
   `c.still > (this.zones.length && this.inZone(c.x, c.z) ? traffic.zoneStillSeconds : traffic.stuckSeconds)`.
   Điều kiện "ngoài nón nhìn" giữ nguyên, nên không có xe biến mất ngay trước mắt.
3. **`traffic.ts` `spawn()`:** đã có `!this.inZone(...)`, giữ nguyên.
4. **Không giữ xe trên vạch dừng trong vùng (tùy chọn):** hàng chờ đèn đỏ nằm trong vùng mà người chơi đang nhìn thấy vẫn còn sau bước 2. Muốn bỏ hẳn thì trong `extend()`, khi mọi cạnh tiếp theo đều nằm trong vùng, cho xe quay đầu (`cand = all`, kể cả cạnh ngược) thay vì vào vùng. Hoặc chấp nhận hàng chờ trong tầm nhìn, vì §17.5 nói NPC chỉ để tạo không khí.
5. **Test:** trong `traffic.test.ts`, đặt một vùng r 20 trên hàng chờ đèn đỏ ở Rivoli (454,2; 16,9), npc bật, anchor đặt sao cho vùng nằm ngoài nón nhìn, chạy 120 s. Kỳ vọng: không xe nào có `still > zoneStillSeconds + dt` mà tâm nằm trong vùng. Không có bản sửa thì verifier đo được khoảng 650 giây-xe đứng yên.

### Host (đợt host-tools)

- Điểm xuất phát Bir-Hakeim (mục 8): dời trong `worker/legs/paris-demo.json`.
- `client/src/host/hostView.ts fmtMinSec`: agent Host đã sửa trong cây làm việc (làm tròn một lần). Test của client chỉ so mm:ss từ 60 s trở lên, nên vẫn qua dù bản sửa đó chưa được commit.
