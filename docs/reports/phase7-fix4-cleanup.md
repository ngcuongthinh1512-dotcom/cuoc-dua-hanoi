# Phase 7 – sửa vòng 4: dọn các việc còn lại của người kiểm tra cuối

Nguồn: `docs/reports/phase7-verify3.md` (m1–m9) và mục "Chưa làm" của `phase7-fix3-*.md`. Làm thẳng trên `main`, commit
`fix(phase7): cleanup - leftovers from the final verifier`.

## 1. Dời xuất phát demo ra khỏi khối vòm (m2)

- `start` của `worker/legs/paris-demo.json`, `worker/legs/test/mini.json`, `worker/legs/test/paris-demo.filled.json` (cả ba cùng lúc, vì
  `worker/src/test/harness.ts` lấy `LEG_START` từ `mini` còn cuộc đua test chạy `paris-demo`):
  `"name": "Cầu Bir-Hakeim – lối đi bộ dưới cầu cạn metro, phía Passy"`, `"lat": 48.85585`, `"lon": 2.28744` (`yawDeg` 33, `spreadMeters` 5 giữ nguyên).
- `worker/src/legs.test.ts`: bỏ tọa độ ghim cứng. Test mới kiểm **mọi** chặng có sẵn xuất phát trong 25 m quanh tâm OSM của cầu
  (`latLonToWorld(48.85569, 2.28758)`); điểm mới cách tâm 20,5 m.
- `client/src/host/hostView.ts` (dữ liệu demo trang Host): điểm mới.
- `scripts/leg-check.test.ts`: `mini` nay 0 cảnh báo (`toEqual([])`); `paris-demo` chỉ còn cảnh báo L6.
- Giữ nguyên, vì đúng là nói về **tâm OSM**: `client/src/player/railDecks.test.ts` (dải ray metro tại tâm), test "start on the
  Bir-Hakeim viaduct over land" của `leg-check.test.ts`, `docs/plans/phase7.md` (kế hoạch, lịch sử).
- `scripts/screenshot.ts`: chú thích `ISLAND_SPOT` / `p7-start-island` cập nhật (chỗ rải gần vòm nhất, nay là lối đi thoáng). Hai preset
  vẫn dùng `startSpot(paris-demo)` nên tự theo điểm mới.
- `leg:check` chạy lại trên các chặng có sẵn: `mini` "Hợp lệ: 0 cảnh báo, 0 ô còn trống."; `paris-demo` 1 cảnh báo (L6) + 18 ô trống;
  `paris-demo-filled` 1 cảnh báo (L6); `near` 2 cảnh báo lòng đường (không đổi).
- `docs/LEG_FORMAT.md`: §4 (ví dụ `name` / `lat`, `lon`; đoạn "Chọn chỗ xuất phát" nay nói chặng mẫu đã dùng điểm này và đừng dùng đúng tâm
  OSM), §10 (bảng output: 0 / 1 / 1 / 2 cảnh báo; ví dụ JSON = `mini.json` mới, đã so sau khi parse: trùng), §8 (khối mẫu T1 = output thật,
  đã so: trùng từng ký tự).
- Ảnh (đã xem): `p7-start`, `p7-start-island`: lối đi bộ thoáng dưới cầu cạn metro, chân y 1,52 (mặt cầu, không phải nóc metro), không vòm.

## 2. `shared/src/leg/check.ts` (máy chủ cũng dùng)

- **(a) Bãi xe của nơi làm nhiệm vụ / nhánh ngoài bản đồ** (m3): `outsideMap` thêm `task.location.bikeParking` của thử thách và của từng
  nhánh Lựa chọn kép. Máy chủ (nút "Nạp chặng từ file") nay từ chối rack gõ nhầm 111 km, không chỉ `leg:check`. Câu báo giống hệt bãi xe của
  điểm đến. Bản sao riêng trong `scripts/leg-check.ts` (`mapReport`) bị **xóa** vì shared đã báo (test `leg-check` "rack off the map" vẫn
  qua, nay nhờ shared).
- **(b) Câu múi giờ**: `… dùng tên múi giờ chuẩn dạng Châu_lục/Thành_phố (tên IANA), ví dụ "Asia/Ho_Chi_Minh", "Europe/Paris"`.
  `LEG_FORMAT.md` §11 cập nhật theo.
- **(c) Lộ đáp án qua tên nơi làm nhiệm vụ**: `task.location.name` (thử thách và nhánh) vào danh sách chữ đội đọc được (thẻ hiện
  "Địa điểm: …"). `LEG_FORMAT.md` §11 dòng "chứa đáp án" nhắc thêm.
- **(d)** Chú thích `LegGeo.building`: nay là "mô tả dễ đọc (tên địa danh + điểm ngoài nhà gần nhất), null = không có".
- Test mới (`shared/src/leg/leg.test.ts`): rack của thử thách + nhánh B ngoài bản đồ → 2 LỖI từ `parseLeg` (không cần dữ liệu bản đồ);
  đáp án "bảy" trong tên nơi làm nhiệm vụ của nhánh B → cảnh báo đúng chỗ `› nơi làm nhiệm vụ › tên`. Cả hai fail trên code cũ.

## 3. Toast xe đạp / ngồi xe (m4, m5)

- `client/src/vehicle/Bikes.ts`: `ClaimNotice` thêm `'raceOver'`; lý do từ chối `finished` → `raceOver`, `far` → `bikeTooFar`,
  `walkOnly` → `walkOnly`, còn lại (`taken`, `gone`) → `bikeLost`.
- `client/src/ui/Toasts.ts`:
  - `raceOver`: "Cuộc đua của đội bạn đã kết thúc: không lấy xe, mở hộp hay làm nhiệm vụ được nữa". Mã này máy chủ cũng dùng cho thao tác
    hộp / nhiệm vụ sau khi Host kết thúc, nên câu viết chung cho cả hai (câu gợi ý chỉ nói về xe sẽ sai khi bấm F ở hộp).
  - `boxRiding`: "Xuống xe trước đã: không mở hộp, làm nhiệm vụ hay check-in khi đang ngồi xe".
- Test: `Bikes.test.ts` (5 lý do → 5 toast; `finished` từng ra `bikeLost`), `Toasts.test.ts` (hai câu mới).

## 4. Nhãn "Đã kết thúc" (m1): chọn sửa luật chơi, không sửa client

- Cách đơn giản hơn là sửa câu chữ. Giữ nhãn 10 s trước khi chuyển khán giả **không** phải một dòng: `RaceClient` gọi `finished(false)`
  cho cả "Host vừa bấm Kết thúc" lẫn "vào lại sau khi đã kết thúc" (vào lại phải thành khán giả ngay). Phải tách hai trường hợp (đổi chữ ký
  callback), thêm một tham số vào `config.ts`, và thêm test.
- `docs/RACE_RULES.md` §11 nay nói đúng hành vi thật: nhãn "Chưa bắt đầu" / "Tạm dừng" hiện khi đang chơi; khi Host kết thúc chặng, đội
  chuyển **ngay** sang khán giả (camera bay, bảng thông tin tắt hẳn, **không có lời nhắn riêng**), từ đó không mở hộp / làm nhiệm vụ / lấy
  xe được nữa. Không viết "thấy thông báo", vì client hiện không hiện thông báo nào (toast cũng là `.hud-box`, bị `hud-off` ẩn).

## 5. `scripts/sim.ts`, `scripts/leg-check.ts` (m6, m7, m8)

- **sim, `--leg` sai** (m7): file `.json` không có → `Không tìm thấy file chặng "<đường dẫn>" (kiểm tra đường dẫn; ví dụ …)`; mã lạ →
  `Không tìm thấy chặng "<mã>" trong worker/legs/ hoặc worker/legs/test/`. Cả hai in kèm cách dùng, thoát mã 2, không còn stack trace /
  ENOENT. Test: `legArg` ném câu tiếng Việt; chạy CLI thật (`tsx scripts/sim.ts --leg …`, < 1 s) kiểm stderr + mã thoát.
- **"Trong game" không đặt người chơi vào hộp** (m6): người chơi xuất hiện **12 m trước điểm, trên đường đi bộ A\* từ điểm trước**, nhìn
  thẳng về hộp (`approach()` lùi 12 m dọc polyline của `shortestPath`). Điểm trùng điểm trước (Chặng dừng sau lộ trình cuối, bước 1 tại
  xuất phát) → 12 m về phía nam, nhìn bắc. Điểm xuất phát giữ nguyên (chỗ rải 1, `yawDeg` của chặng). Dòng giải thích đầu bảng điểm và
  `LEG_FORMAT.md` §8 cập nhật. Test: link L1 của `mini` cách hộp 8–12 m và hướng nhìn chĩa vào hộp (cos > 0,99).
  Ảnh (đã xem, `screenshots/fix4-ingame-T1.png`, link T1 của `mini`): đứng trên lối đi Trocadéro, hộp mật thư ở phía trước ≈ 11 m, tháp
  Eiffel phía sau hộp, hiện "Bấm F để mở hộp mật thư".
- **Bãi xe xa điểm** (m8): bãi xe trong bản đồ nhưng cách tâm > 300 m → CẢNH BÁO
  `bãi xe cách tâm N m, xa hơn 300 m (gõ nhầm tọa độ?); nên đặt ngay ngoài vùng ≈ 20 m`. Đặt trong `rack()` của shared `checkLeg` (phần cần
  dữ liệu bản đồ, chạy bởi `leg:check`), cạnh cảnh báo "trong vùng"; ngưỡng `LEG_LIMITS.rackFar` = 300 (`shared/src/leg/schema.ts`). Bãi
  ngoài bản đồ chỉ báo LỖI, không báo thêm cảnh báo này. Test (`leg-check.test.ts`): rack của T1 cách 680 m trên Rue de l'Université →
  đúng 1 cảnh báo, file vẫn hợp lệ. `LEG_FORMAT.md` §7 và §11 thêm dòng này.

## Không làm

- CLAUDE.md `--speedup 3` → `2` (m9): file của điều phối viên, không sửa.
- Vòng bán kính trong ảnh "Xem" (fix3 host-tools "Chưa làm" 4): không có trong danh sách việc lần này.

## Cổng

- `npm run build`: qua.
- `npm test`: qua. scripts 49 (trước 47), shared 47 (trước 45), client 628 (trước 627), worker 90.
- Ảnh `p7-start`, `p7-start-island`, `fix4-ingame-T1` (`SCREENSHOT_PORT=5496`): không lỗi console, đã xem.
- Không còn vite / wrangler / workerd chạy.
