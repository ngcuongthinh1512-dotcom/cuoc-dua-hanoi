# Phase 7 – sửa vòng 3 (client)

Phạm vi được sửa: `client/src/race/**`, `client/src/net/**`, `client/src/main.ts`, `client/src/player/**`, `client/src/ui/**`, `client/src/npc/**`, `client/src/config.ts`, `client/index.html`, `scripts/screenshot.ts`.

Nguồn: `phase7-review2-complete.md` F2, F3, F4, F9 và `phase7-fix2-client.md` §5 (tên NPC chồng tên đội).

## 1. Xe NPC dồn và đứng trong vùng hộp / thảm (F2, SPEC §17.5, D20)

Nguyên nhân (đã truy): điểm Rue de Rivoli của reviewer (454,2; 16,9) nằm đúng trên nút có đèn Rivoli × Castiglione (nút 1247). Rivoli ở đây là đường một chiều: từ nút 1308 (cách 150 m) đến nút 1247 không có lối rẽ nào. Bộ lọc cũ chỉ xét trung điểm cạnh kế tiếp nên không chặn được. Xe sinh ra ngay trên cạnh 9820 (146 m, dẫn thẳng vào vùng) rồi xếp hàng chờ đèn đỏ ở vạch dừng, mà vạch dừng nằm giữa vùng.

Sửa trong `client/src/npc/traffic.ts`:

- **Vùng là "ô cấm dừng" (keep-clear)**, dùng `zoneSpan`:
  - Xe chưa vào vùng mà vạch dừng nằm trong vùng: coi mép vùng là vạch dừng. Đèn đỏ thì xe dừng ở mép vùng.
  - Xe đã vào vùng: bỏ qua vạch dừng trong vùng (đèn, nhường đường, vòng xuyến, quyền vào lối ra) và chạy thẳng qua, không dừng.
  - Xe phía trước đang đứng (hoặc có vật cản) mà chỗ dừng rơi vào trong vùng: xe sau chờ ở mép vùng.
  - Xe vẫn phanh cho người chơi và cho xe phía trước. Gặp hai trường hợp này thì vẫn có thể phải dừng trong vùng.
- **Chọn đường** (`intoZone`): loại hướng nào mà lòng đường (tính cả nửa bề rộng đường) đi qua vùng, hoặc dẫn vào vùng mà không còn lối rẽ nào trong `traffic.zoneLook` = 400 m (tham số mới trong `config.ts`; một đại lộ có thể dài 300 m giữa hai lối rẽ). Nếu mọi hướng đều bị loại thì vẫn đi như cũ.
- **Sinh xe**: không sinh xe ở chỗ mà phần đường phía trước dẫn vào vùng.
- **Khi đổi vùng** (`zones` thành setter, `Npc.setExclusionZones` gọi): lộ trình đã chọn của mỗi xe bị cắt từ đoạn dẫn vào vùng rồi chọn lại. `route[0]` và `route[1]` giữ nguyên vì xe có thể đã cam kết đi vào đó.
- Không có vùng thì hành vi giống hệt trước (đường đi nhanh không đổi), nên tính tất định và các test cũ không bị ảnh hưởng.

### Số đo

Mô phỏng headless trên đồ thị thật, cùng cách đếm của reviewer: mẫu 0,5 s, xe trong 20 m; 90 s không có vùng, rồi đặt vùng r 20, bỏ 15 s đầu, đo tiếp 90 s.

| Điểm, seed | Không vùng: trong 20 m / đứng | Có vùng, trước sửa | Có vùng, sau sửa |
|---|---|---|---|
| Rivoli 1 (người chơi cách 100 m như reviewer) | 225 / 93 | 135 / 55 | **0 / 0** |
| Rivoli 5 | 324 / 208 | 314 / 165 | **0 / 0** |
| Opéra (neo tại chỗ) 1 / 3 | 111 / 39 · 243 / 99 | – | 12 / 0 · 10 / 0 |
| Champs-Élysées 1 / 3 | 47 / 0 · 32 / 0 | – | 6 / 0 · 0 / 0 |
| Concorde, Rue Royale | 0 / 0 | – | 0 / 0 |

Ở Opéra / Champs, các mẫu còn lại đều là xe chạy qua, không xe nào đứng:
- Xe đã cam kết đi vào nút (`route[1]`) trước khi vùng xuất hiện.
- Một xe buýt: trên đường của nó, hướng duy nhất còn lại là loại đường xe buýt không được đi.

15 s đầu sau khi vùng xuất hiện: tối đa 3 mẫu đứng (trước sửa: 7–32).

Hiệu năng: 60 xe, 2 vùng đo được 0,20 ms/bước (không vùng 0,15 ms), dưới ngân sách 0,5 ms. Chạy 10 phút có vùng ở Opéra, Rivoli, Champs, Étoile: không có tắc mới.

Ghi chú: tắc ở phía tây Concorde (−200, 62; cạnh 2175–2177) có sẵn từ trước, không liên quan tới vùng. Nó xuất hiện cả khi KHÔNG có vùng, với neo (30, 0) và seed 2 / 4: 13–16 trên 28 xe đứng quá 30 s. Test 10 phút hiện tại neo ở (0, 0) và gộp 4 seed nên không bắt được. Không sửa ở đây.

### Test (fail nếu bỏ bản sửa, đã thử bằng `traffic.ts` của HEAD)

- `traffic.test.ts` › "exclusion zone over a lit junction is a keep-clear box":
  - Đèn đỏ: xe chờ ở mép vùng, không chờ ở vạch dừng.
  - Xe đã ở trong vùng thì chạy qua đèn đỏ, không đứng.
  - Với `traffic.ts` của HEAD: `[stopped, crossed]` = `[true, false]`.
- `traffic.test.ts` › "box zone on Rue de Rivoli…", seed 1 và 5, đồ thị thật:
  - Có vùng thì số mẫu đứng trong vùng = 0, số mẫu trong 20 m ≤ 10 % lúc không vùng.
  - Với `traffic.ts` của HEAD: 55 mẫu đứng.

## 2. Vùng cấm NPC mất khi khởi động (F3)

Đã sửa ở vòng 2 (`78a7a9c`, `main.ts`: `.then((n) => { npcs = n; n.setExclusionZones(npcZones()); })`). `boxes.onChange` vẫn báo mọi lần đổi hộp / thảm. Vùng chỉ lấy từ danh sách hộp: thảm Chặng dừng cũng là một hộp `kind: 'mat'`, còn view `race` không tạo vùng. Vì vậy không cần áp lại khi view đổi.

Đã kiểm tra end-to-end (script tạm `fix3c-zones.mts` trong scratchpad):
- Dựng worker harness + Vite + Chrome, đăng nhập bằng mã đội.
- Chặng `nearLeg(25)`: hộp L1 nằm trong `welcome`. Tải asset NPC bị giữ lại 12 s.
- Kết quả: `welcome` tới trước asset, sau `__READY__` thì `traffic.zones` = `crowd.zones` = 1 = số hộp.

## 3. Trạng thái cuộc đua cho người chơi (F4)

Phần "đội chưa về đích sau Kết thúc → chỉ đọc / khán giả" đã làm ở vòng 2 (`RaceClient.welcome` / `message`, có test "Host 'Kết thúc'…"). Vòng này thêm:

- Một nhãn nhỏ phía trên đồng hồ (`ui/HUD.ts`, cùng kiểu `.hud-box`, chữ vàng):
  - `Chưa bắt đầu` (lobby), `Tạm dừng` (paused), `Đã kết thúc` (finished).
  - Đang chạy hoặc offline thì ẩn.
  - Nhờ vậy, khi F / check-in bị từ chối, đội thấy được lý do.
- `HudFrame.raceStatus` do `main.ts` lấy từ `race.view.status`.
- DEV: `?raceStatus=` cho preset; `p7-clock` nay chụp "--:--" cùng nhãn "Chưa bắt đầu" (đã xem ảnh).
- Chọn "Đã kết thúc" thay cho "Kết thúc" để đọc như một trạng thái.
- Lưu ý: khán giả không có HUD (`hud-off`), nên sau khi kết thúc nhãn chỉ hiện nếu đội chưa chuyển sang camera bay.

Test `HUD.test.ts` › "race status badge": hàm `statusLabel` mới.

E2E (`fix3c-e2e.mts`, client thật online): nhãn hiện "Chưa bắt đầu" → (Bắt đầu) ẩn → (Tạm dừng) "Tạm dừng" → (Tiếp tục) ẩn. Console không có lỗi.

## 4. Đội đã về đích bấm V lấy lại thân (F9)

`main.ts`: `canFly = () => !session`. V (khi bảng F3 mở) chỉ dùng được offline. Trong cuộc đua, đội về đích hoặc bị Host kết thúc thì làm khán giả luôn, không quay lại thân, không lấy xe chung. Host không có thân nên không bị ảnh hưởng.

E2E (`fix3c-e2e.mts`): Host bấm "Kết thúc", đội thành khán giả (`hud-off`). Sau đó bấm F3 rồi V: vẫn là khán giả. Với điều kiện cũ (đã thử tạm thời), V trả thân lại (`hud-off` = false).

Không có unit test: `main.ts` không chạy được trong Node, còn tách một biểu thức một dòng ra chỉ để test thì không đáng.

## 5. Tên NPC dẫn chương trình chồng tên đội ở xa (p7-mat)

- `CharacterOptions.tagDistance` (`player/CharacterModel.ts`): khoảng cách camera mà quá đó thì tên ẩn, riêng cho từng nhân vật. Mặc định vẫn là `character.nameTag.maxDistance` (80 m).
- NPC dẫn chương trình dùng `raceClient.host.tagDistance` = 12 m. Lý do: tên có kích thước cố định trên màn hình, nên ở xa nó đè lên tên đội.

Test `CharacterModel.test.ts` › "name tag": LOD của NPC dẫn ẩn ở `tagDistance` (< 20 m), còn tên đội vẫn 80 m.

Ảnh:
- `p7-mat`: chỉ còn "Đội thử", không chồng.
- `p7-celebrate`: ở gần, vẫn thấy "Người dẫn chương trình".

## Cổng kiểm tra

- `npm run build` qua.
- `client` vitest: 64 file / 627 test qua (vòng 2: 624; thêm 3 test).
- Toàn bộ `npm test`: xem phần kết quả trả về. Lúc chạy lần đầu, `scripts/leg-check.test.ts` ("paris-demo") fail. File này thuộc khu vực của agent host-tools đang sửa dở (`scripts/leg-check.ts` chưa commit), không liên quan tới client.

Các script tạm (đo xe, e2e) nằm trong scratchpad, không vào repo. Không để lại vite / wrangler / workerd chạy nền.
