# Phase 7 – sửa vòng 3, phần host-tools

Phạm vi được sửa: `client/src/host/**`, `scripts/sim*.ts`, `scripts/leg-check*.ts`, `docs/LEG_FORMAT.md`, `docs/RACE_RULES.md`, `README.md`, `worker/legs/**`, `worker/src/race/BikeService.test.ts`. Commit: `fix(phase7): round 3 - host-tools`. Nguồn: `docs/reports/phase7-review2-organiser.md` (dry-run của người tổ chức) và F5, F7, F10, F12 của `phase7-review2-complete.md`.

## 1. `leg:check` (`scripts/leg-check.ts`)

- **Thông báo lỗi JSON dùng chung.** Bỏ hàm `jsonProblem` riêng của script, dùng hàm trong `shared/src/leg` mà máy chủ / trang Host đang dùng. Hai bên nay in cùng một câu: `lỗi cú pháp (dòng X, cột Y). Có thể do: …`. Chú thích `//` ở cuối dòng (`"yawDeg": 33, // …`) cũng có gợi ý (phát hiện 15).
- **Lỗi luật không che kiểm tra bản đồ** (phát hiện 2). Nếu dạng file đúng (zod qua) mà có lỗi luật (múi giờ sai, Chặng dừng không ở cuối…), script vẫn chạy kiểm tra bản đồ, quét rò rỉ và in bảng điểm. Một lần chạy liệt kê cả lỗi múi giờ lẫn lỗi "trong nhà".
  - Việc này làm lộ một vòng lặp gần như vô hạn: `nearestNode` không giới hạn khoảng cách trên điểm ở cách 300 km. `walk()` nay tìm nút trong 300 m, giống `mainSnap`.
  - Các thông báo trùng (bản không có bản đồ / có bản đồ) được gộp theo `mức | ở đâu | nội dung`.
- **Bãi xe ngoài bản đồ** (review2 F5). Bãi xe của `task.location` (thử thách) và của nơi riêng của nhánh Lựa chọn kép, nếu nằm ngoài `RACE_BBOX`, nay là LỖI. Câu báo giống hệt của `outsideMap` trong shared, nên khi shared sửa thì không bị trùng.
  - Bảng điểm in dòng `Bãi xe: lat, lon (cách tâm N m)` cho bãi đã có trong file.
  - Phần shared (để máy chủ cũng từ chối) nằm ngoài phạm vi: xem "Chưa làm".
- **Ảnh "Xem:" thấy được điểm** (phát hiện 4). Lệnh cũ chụp `/preview.html?at=…&r=80`: 2 chunk nguyên, không có ghim. Lệnh mới chụp chính game ở chế độ khán giả: `/?cam=<x>,<mặt đất + 56>,<z + 32,5>,0,-60&boxes=<mã>,x,z&mat&npc=0`.
  - Camera cách điểm 65 m, chếch 60°, nhìn về hướng bắc. Khung ≈ 160 × 105 m, điểm ở giữa ảnh.
  - Điểm được đánh dấu bằng thảm Chặng dừng (3 × 7 m). Hộp mật thư 0,6 m nhìn từ 65 m chỉ còn vài pixel; đã chụp cả hai để so (`screenshots/leg-L1.png`, `leg-PS.png`, `leg-start.png`).
  - Chưa vẽ được vòng bán kính, vì phải sửa client. Tài liệu và dòng đầu bảng nói thẳng điều này.
- **Lỗi "trong nhà"** (phát hiện 5). `LegGeo.building` của script không còn trả giá trị OSM (`yes`). Nó trả:
  - tên địa danh, nếu là địa danh, vd. "Palais de Tokyo";
  - kèm **điểm ngoài nhà gần nhất**. Điểm này được tìm theo các vòng cách nhau 3 m, tối đa 150 m. Điều kiện: ngoài nhà đặc, không ở giữa nước (trừ trên cầu), không trên lòng đường xe chạy, cách lối đi bộ của mạng chính ≤ 8 m.
  - Ví dụ, tâm Palais de Tokyo cho: `tâm vùng nằm trong một tòa nhà (Palais de Tokyo; điểm ngoài nhà gần nhất: 48.86430, 2.29688, cách 9 m)` (sân giữa hai cánh, chỗ người tổ chức đã thử và thấy qua).
  - Test kiểm rằng điểm được gợi ý qua `leg:check` mà không còn lỗi.
- **Nước và cầu** (phát hiện 6, 12).
  - `water.json` có cờ `river`. Sông báo `nằm giữa sông … dời vào bờ hoặc lên mặt cầu`. Hồ / bể / đài phun nước báo `nằm giữa mặt nước (hồ / bể nước / đài phun nước) … dời ra chỗ đất cạnh đó`.
  - Câu báo cầu nay là `nằm trên đoạn cầu bắc qua đất (bờ / đảo), không phải qua mặt nước …`, kèm ghi chú rằng giữa cầu Bir-Hakeim trên đảo là bình thường.
  - Một tọa độ lặp lại (Chặng dừng sau lộ trình của nó, bước 1 trùng xuất phát) chỉ bị cảnh báo một lần.
- **Lòng đường xe chạy** (phát hiện 7). Cảnh báo mới khi tâm nằm trong lòng đường mà RoadBuilder vẽ, trên đường có xe NPC (`traffic.kinds`, cờ `car`). Ví dụ: `tâm nằm giữa lòng đường xe chạy (Avenue du Président Wilson): hộp mật thư sẽ nằm giữa dòng xe; dời lên vỉa hè / quảng trường cạnh đó`. Điểm xuất phát có câu riêng.
  - `ponytail:` công thức `roadWidth` được chép lại, vì RoadBuilder vẽ lên canvas, không import được với kiểu Node của scripts. Script không tính tầng (lối đi dưới một cầu đường bộ vẫn bị tính là "trên lòng đường").
- **Mỗi điểm có thêm** (phát hiện 8, 9, 3):
  - `Vệ tinh: https://www.google.com/maps?q=lat,lon&t=k&z=19` (ảnh vệ tinh, có ghim);
  - `Trong game: http://localhost:5173/?start=x,z,yaw&boxes=…` (khi `npm run dev` đang chạy: đứng đúng tại điểm, có hộp; điểm xuất phát: chỗ và hướng nhìn của đội vào đầu tiên);
  - riêng điểm xuất phát: `Hướng nhìn lúc vào: la bàn N° (hướng)`, kèm cách đổi (`compass()`, có test);
  - dưới bước 1, nếu vùng của nó chứa điểm xuất phát: `Điểm xuất phát nằm trong vùng này: …` (trường hợp Bir-Hakeim).
- **Chỗ để file** (phát hiện 13 / việc 12). Không còn cảnh báo cho file nằm ngoài dự án (chỗ an toàn nhất). Quy tắc mới:
  - trong `client/`: **LỖI**;
  - chỗ khác trong dự án, ngoài `worker/legs/`: CẢNH BÁO (nguy cơ git);
  - trong `worker/legs/`: không báo (chặng demo / test).
- `--help` in cách dùng.

## 2. `npm run sim` (`scripts/sim.ts`)

- `--help` / `-h` in `USAGE` tiếng Việt. Tùy chọn lạ không còn ném stack trace: script in `Tùy chọn không hợp lệ (…)` kèm cách dùng, rồi thoát với mã 2.
- `--leg paris-demo-filled` tìm tới `worker/legs/test/paris-demo.filled.json` (review2 F12). Mã vẫn là `paris-demo-filled`, đúng như trang Host liệt kê.
- Mục "Thao tác bị từ chối" chỉ đếm notice từ chối (`REFUSALS`). `clueNew` ("Mật thư mới đã vào Sổ mật thư") không còn bị đếm (phát hiện 10).
- Test:
  - engine giả nay phát `clueNew` sau mỗi bước, và test kiểm rằng `refused` không chứa nó;
  - `legArg('paris-demo-filled')`.

## 3. Xuất phát demo ra khỏi khối vòm đá: CHƯA dời (bị chặn ngoài phạm vi)

- **Điểm mới đã chọn và kiểm: 48.85585, 2.28744**, tên "Cầu Bir-Hakeim – lối đi bộ dưới cầu cạn metro, phía Passy" (`yawDeg` 33 và `spreadMeters` 5 giữ nguyên).
  - Điểm này cách điểm cũ 20,5 m về phía tây bắc, dọc trục cầu, trên nhánh sông.
  - 8 chỗ rải đầu tiên cách miệng vòm 16,4–24,5 m (khối vòm s ∈ [−2,35; 11,65] của vòng 2). Yêu cầu là ≥ 8 m.
  - Khi `mini` được dời thử tới đây, `leg:check` của nó ra `Hợp lệ: 0 cảnh báo`.
  - Ảnh `?start=` tại chỗ rải 1 và chỗ 4 (gần vòm nhất), `screenshots/fix3-start1.png` và `fix3-start4.png`: lối đi bộ thoáng dưới cầu cạn, camera không ở trong vòm.
- **Đã thử dời `mini` + `paris-demo-filled`, rồi hoàn tác.** Toàn bộ `npm test` khi đó cho 1 fail ngoài phạm vi: `worker/src/RaceRoom.live.test.ts` › "a reconnect or a first pose is no free teleport…" có thêm một sự kiện `jump d 21`.
  - Lý do: `worker/src/test/harness.ts:93` lấy `LEG_START` từ `mini.json`, còn cuộc đua của test chạy chặng mặc định `paris-demo`. Mọi chặng có sẵn vì vậy phải dời **cùng lúc**.
  - `paris-demo` lại bị `worker/src/legs.test.ts:22` ghim cứng tọa độ. Cả hai file test đều ngoài phạm vi.
- **Đã làm trong phạm vi**, để lần dời sau chỉ còn sửa JSON và 2 file test của worker:
  - `worker/src/race/BikeService.test.ts` (test claim qua workerd): xe được đặt ở **trung điểm hai chỗ xuất phát mà đội nhận trong `welcome`**, không còn ở `LEG_START`, nên test không phụ thuộc chặng mặc định xuất phát ở đâu.
  - `scripts/leg-check.test.ts` "paris-demo" chấp nhận cả hai trạng thái (có hoặc không có cảnh báo cầu ở xuất phát).
  - `sim.test.ts` đã đọc xuất phát từ `mini.json`.
  - `docs/LEG_FORMAT.md` §4 khuyên dùng điểm mới cho chặng thật xuất phát ở Bir-Hakeim.
- Thay đổi chính xác cần làm nằm ở mục "Chưa làm" số 1.

## 4. Tài liệu

- **`docs/LEG_FORMAT.md`** (mọi phát hiện của người tổ chức, cùng F7):
  - **§1 / §9, chặng thật để ngoài thư mục dự án.** Nêu rõ những gì `leg:check` báo theo từng chỗ để file, và rằng `worker/legs/` chỉ dành cho chặng demo / test.
  - **§1 bước 4, nạp chặng.** Trang Host ở `http://localhost:8787/host.html`; nút "Nạp chặng từ file" (nhãn trên trang Host đổi theo); mã chặng có sẵn.
  - **§3.1, các trường chưa có tác dụng.** Đánh dấu `mapLabels`, `showOthersOnMinimap`, `penalties`, `clueBook`, `specials`, `eliminationLeg`, nút gửi bài Host duyệt. `timeLimitMinutes` hiện chỉ là chữ trên thẻ.
  - **§3.1, `timezone`.** Là LỖI; viết đúng dạng `Châu_lục/Thành_phố`.
  - **§4, `yawDeg`.** Công thức `yawDeg = −(hướng la bàn)` kèm ví dụ (34° → `-34`). Chọn chỗ xuất phát thoáng; nói rõ xuất phát mẫu nằm ở miệng vòm và khuyên dùng 48.85585, 2.28744 cho chặng thật ở Bir-Hakeim.
  - **§5.2.** `challenge.task` là "không bắt buộc", đúng với schema.
  - **§6, mật thư 1.** Hai cách viết bước 1. Mật thư 1 dẫn tới chính nơi xuất phát thì đặt `destination` trùng `start`, bán kính > `spreadMeters` + 10. Validator nhận cả hai cách.
  - **§7, tâm và bán kính.**
    - Hộp đứng đúng tại tâm. Tên của `task.location` **hiện cho đội** ("Địa điểm: …"); tài liệu cũ nói "chỉ Host thấy".
    - Không đặt tâm giữa lòng đường.
    - Cách chọn bán kính: vùng tròn phẳng, không tính tầng; bán kính ≥ khoảng cách tới lối đi bộ; gợi ý theo loại chỗ.
    - Bãi xe xếp thành hàng; bãi đầy thì xe để lâu nhất biến mất.
  - **§8, đọc bảng điểm.** Mẹo về ghim Google; mẫu bảng là output thật của `mini`; cách đọc từng dòng (Bãi xe, Bản đồ, Vệ tinh, Xem, Trong game).
  - **§10, bảng output thật của 4 chặng có sẵn** (`mini` 1 cảnh báo cầu ở xuất phát; `paris-demo` 2 cảnh báo + 18 ô trống; `paris-demo-filled` 2; `near` 2 cảnh báo lòng đường).
    - Ví dụ JSON trùng từng byte với `mini.json` sau khi parse (đã so) và chạy qua `leg:check`.
    - Câu "paris-demo để trống mật thư" sửa thành: 6 mật thư lộ trình là câu mẫu của đặc tả, các ô nhiệm vụ để trống.
  - **§11.** Câu báo mới (nước / hồ, cầu bắc qua đất, lòng đường, trong nhà kèm gợi ý, bãi xe ngoài bản đồ, chỗ để file, câu JSON thật).
  - **§12.** Câu báo thật cho 4 lỗi JSON (đã chạy cả 4 file mẫu), kể cả chú thích ở cuối dòng.
  - **§13 mới, chơi thử tự động `npm run sim`.** Lệnh, thời gian (≈ 7 phút cho 2,3 km, theo số đo của người tổ chức), `--help`, cách đọc kết quả, cách chơi thử bằng tay (trang Host, `HOST_PASSWORD`).
- **`docs/RACE_RULES.md`** (F10 và đối chiếu client):
  - Phạt hiện ở **góc dưới bên phải, dưới đồng hồ** (dòng PHẠT, chỉ hiện khi > 0). Đồng hồ là dòng THỜI GIAN, dừng khi check-in.
  - Không có nút cuốn sổ: `Tab` mở / đóng; phím cuộn `↑ ↓ PageUp PageDown Home`.
  - Banner "Xuất phát ở vị trí thứ n" ở bên phải, 15 s rồi mờ dần, chỉ một lần, không liên quan giờ Host ghi. Đội vào cùng lúc được rải vài mét.
  - Nhãn trạng thái phía trên đồng hồ ("Chưa bắt đầu" / "Tạm dừng" / "Đã kết thúc", commit client vòng 3); câu "Cuộc đua chưa bắt đầu, hãy chờ Host" / "Cuộc đua đang tạm dừng"; thời gian tạm dừng không được trừ.
  - Lời nhắc "Bấm F để mở hộp mật thư"; thẻ mật thư đầy đủ (đóng bằng Tab / Esc / Space).
  - Check-in tự động khi đi bộ vào khu vực thảm; đếm ngược "Phạt chờ: còn mm:ss…".
  - Bãi xe:
    - nhiệm vụ ở nơi khác thì xe vào bãi khi **tới** nơi đó (D18);
    - điểm không có bãi thì xe đứng tại chỗ;
    - câu thông báo thật;
    - xe xếp thành hàng.
  - Đội đã về đích không lấy được xe; khán giả không quay lại nhân vật được.
  - Bảng "Tại điểm này" hiện "đang làm <bước>" (bỏ "vừa rời đi", vì chưa có).
  - Không có Vượt rào: đã đúng từ trước.
- **`README.md`:**
  - thêm mục "Nhập chặng đua": `LEG_FORMAT.md`, `leg:check`, `sim`, trang Host → "Nạp chặng từ file";
  - thêm `leg:check`, `sim`, `dev:api` vào bảng lệnh;
  - bảng tiến độ: 4B–7 là Xong;
  - sửa dòng phím cũ (`F`, `Tab`, `M` đã có tác dụng) và các tham số URL `start`, `boxes`, `mat`.

## Kiểm chứng

- Mọi chặng có sẵn đều đã chạy qua `leg:check`; số liệu ở §10 là output thật.
- 4 file JSON lỗi của §12 cho đúng câu báo đã ghi.
- Trường hợp "múi giờ `Paris` + tâm Palais de Tokyo" cho 2 LỖI trong một lần chạy.
- Ảnh: `screenshots/fix3-start1.png`, `fix3-start4.png` (điểm xuất phát đề nghị), `leg-L1.png`, `leg-PS.png`, `leg-start.png` (ảnh "Xem" mới).
- Test thêm hoặc sửa (`scripts/leg-check.test.ts`, `scripts/sim.test.ts`):
  - các test kiểm hành vi bị bỏ (`(yes)`, "sông" cho bể nước, rack 111 km "Hợp lệ", cảnh báo ngoài `worker/legs/`, `clueNew` bị đếm, `paris-demo-filled` không tìm thấy, ảnh `preview.html`) fail trên code cũ;
  - các test mới (lòng đường, gợi ý ngoài nhà, la bàn, múi giờ không che bản đồ) cần hàm hoặc thông báo mới.

## Chưa làm (ngoài phạm vi, cần làm đúng như sau)

1. **Dời xuất phát demo ra khỏi khối vòm** (một commit, mọi chặng có sẵn cùng lúc):
   - `worker/legs/paris-demo.json`, `worker/legs/test/mini.json`, `worker/legs/test/paris-demo.filled.json` › `start`: `"name": "Cầu Bir-Hakeim – lối đi bộ dưới cầu cạn metro, phía Passy"`, `"lat": 48.85585`, `"lon": 2.28744`.
   - `worker/src/legs.test.ts:22`: thay `expect(leg.start).toMatchObject({ lat: 48.85569, lon: 2.28758 })` bằng một kiểm tra động. Ví dụ:

     ```ts
     const s = latLonToWorld(leg.start.lat, leg.start.lon), bh = latLonToWorld(48.85569, 2.28758);
     expect(Math.hypot(s.x - bh.x, s.z - bh.z)).toBeLessThan(40);
     ```

     Cần import `latLonToWorld` từ `@race/shared`.
   - `worker/src/test/harness.ts:93`: không phải sửa nếu cả ba chặng cùng dời (`LEG_START` lấy từ `mini`).
   - Trong phạm vi host-tools, làm cùng commit đó:
     - `client/src/host/hostView.ts:311`: `latLonToWorld(48.85585, 2.28744)`;
     - `scripts/leg-check.test.ts` "mini: …": `toEqual([])`;
     - `docs/LEG_FORMAT.md`:
       - §4: ví dụ `name` / `lat`, `lon` và câu "Các chặng mẫu đang xuất phát…";
       - §10: `mini` 0 cảnh báo, `paris-demo` 1 cảnh báo (chỉ L6), `paris-demo-filled` 1;
       - ví dụ JSON lấy theo `mini.json` mới.
   - Chú thích `ISLAND_SPOT` / `p7-start-island` của `scripts/screenshot.ts` sẽ cũ.
2. **`shared/src/leg/check.ts` `outsideMap`**: thêm bãi xe của thử thách và của nhánh, để **máy chủ** cũng từ chối như `leg:check`:

   ```ts
   if (s.type === 'challenge') pts.push([s.task.location, ['steps', i, 'task', 'location']], [s.task.location?.bikeParking, ['steps', i, 'task', 'location', 'bikeParking']]);
   if (s.type === 'detour') s.branches.forEach((b, k) => pts.push([b.task.location, ['steps', i, 'branches', k, 'task', 'location']], [b.task.location?.bikeParking, ['steps', i, 'branches', k, 'task', 'location', 'bikeParking']]));
   ```

   Câu báo giống hệt, nên `leg:check` gộp được và không bị trùng.
3. **`shared/src/leg/check.ts`, câu chữ và một kiểm tra rò rỉ:**
   - Câu múi giờ: `… dùng tên IANA, …` → `… dùng tên múi giờ chuẩn dạng Châu_lục/Thành_phố (tên IANA), ví dụ …`. Tài liệu đã giải thích cả hai cách gọi.
   - Chú thích `LegGeo.building` ("Kind of the building footprint"): nay CLI trả một mô tả dễ đọc (tên địa danh + điểm ngoài nhà gần nhất). Nên đổi thành "readable description (or null)".
   - Kiểm tra đáp án bị lộ chưa xét `task.location.name`, mà đội thấy tên này trên thẻ: thêm `[t.location.name, [...p, 'location', 'name']]` vào danh sách `texts`.
4. **Client, vòng bán kính trong ảnh "Xem"**: `ClueBoxes` / thảm khi DEV `?boxes=` có `r` có thể vẽ một vòng phẳng bán kính `r` (vd. tham số `&ring=<m>`). Khi đó `leg:check` truyền `&ring=<radius>`, và câu "ảnh chưa vẽ vòng bán kính" bỏ đi.
5. **`CLAUDE.md`** (của điều phối viên): `npm run sim … (≤ --speedup 3)` → `≤ --speedup 2`; thêm `--help`, `--leg <mã | file>`, và `leg:check` in link `Vệ tinh` / `Xem` (game `?cam=&boxes=&mat`) / `Trong game` (`?start=&boxes=`).

## Cổng

- `npm run build` qua.
- `npm test` qua (chạy trên cây đã có commit vòng 3 của server và client): scripts 47 (trước 43), shared 45, client 627, worker 90.
- Lần chạy đầu, lúc `mini` / `paris-demo-filled` còn đang dời thử, worker có 1 fail (`RaceRoom.live.test.ts`, mục 3). Sau khi hoàn tác thì xanh.
- Không còn vite / wrangler / workerd nào chạy: ảnh chụp và test đều tự tắt server của mình.
