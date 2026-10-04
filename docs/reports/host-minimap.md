# Bản đồ trực tiếp trên trang Host — báo cáo

Ngày 2026-10-04. Yêu cầu: trang Host có minimap: vị trí các đội theo thời gian thực + highlight địa điểm của chặng (chỉ Host thấy). SPEC §17.41.

## Trạng thái
- [x] `client/src/host/hostMap.ts`: khung nổi "Bản đồ trực tiếp" (góc phải dưới; kéo thanh tiêu đề, nhấp thu gọn, Phóng to / Thu nhỏ, Khung lại); nền = bộ vẽ của bản đồ lớn trong game (FullMap: đường, sông, công viên; tên đường khi ≤ 2 m/px), raster cả bản đồ một lần + vẽ lại vector khi dừng kéo (như FullMap)
- [x] Chấm đội: tick 5 Hz (`decodeTick`, socket Host vốn nhận mọi đội online, trang trước đây bỏ qua) + `host.state.teams[].pose` (cả đội offline); offline mờ, về đích = ô vuông + "✓"; nhãn đặt bằng `placeLabels` (phải / trái / trên / dưới, không chồng; nền tối)
- [x] Địa điểm (`hostMapData.ts` thuần): xuất phát, vùng từng bước, từng nhánh, thảm về đích (PIT_MAT); gộp điểm < 1 m; màu theo loại; viền trắng + "n đội" khi có đội đang nhắm tới (bước hiện tại, nhánh đã chọn từ progress); tooltip (bước + tên điểm + đội; đội + bước); ô "Địa điểm"
- [x] `?demo=1`: thêm Đội Ngọc / Đội Hồng (online), tick giả 5 Hz qua cùng đường decode; `&mapBig=1` mở sẵn cỡ lớn
- [x] Test `client/src/host/hostMapData.test.ts` (4 test) + host tests: 69 qua; kiểm headless: tooltip, kéo khung, thu gọn, lăn chuột, 0 lỗi console
- [x] Ảnh `screenshots/p11-host-map.png`, `screenshots/p11-host-map-big.png` (chụp bằng `npm run screenshot -- --path "/host.html?demo=1[&mapBig=1]" --name …`, không thêm preset)
- [x] Docs: DEPLOY §4, README, CLAUDE.md, TODO, SPEC §17.41
- [x] `npm run build` qua (exit 0, trên cây làm việc có cả thay đổi chưa commit của agent chế độ xem)

## Quyết định
- Không sửa worker / protocol: Host đã nhận tick của mọi đội online (`tickEntries(null, …)`); nay giải mã bằng `decodeTick`.
- Tọa độ chặng chỉ đến từ `host.state.leg` lúc chạy (socket Host); không có trong bundle / dữ liệu tĩnh. Demo dùng chặng giả sẵn có của `demoState`.
- Khung mở sẵn khi màn hình ≥ 1180 px và trang chừa cột phải (`body:has(.map-panel[open]) main { margin-right }`) để không che nút Duyệt / Phạt; hẹp hơn thì thu gọn sẵn.
- Nhãn các đội trắng (offline xám), nhãn điểm theo màu loại; thứ tự ưu tiên nhãn: đội online → điểm có đội tới → đội offline → điểm khác.

## Giới hạn
- Bundle: `hostMap` 9 KB nhưng import FullMap kéo chunk chung với game (three + rapier, ≈ 4,6 MB / 1,75 MB gzip) — tải một lần khi mở khung lần đầu (lazy, trình duyệt cache). Game không đổi tổng dung lượng (chỉ tách `main` thành `main` + `FullMap`). Cách bỏ: chuyển `roadWidth` / `roadClass` / `bboxCorners` + bộ vẽ của FullMap ra module không có three (ngoài phạm vi: chỉ được sửa client/src/host/*). Bộ vẽ / nhãn của FullMap dùng qua `fm['paint']` (truy cập private bằng ngoặc vuông, vẫn được kiểm kiểu) — nên export khi sửa FullMap.ts lần tới.
- `host.state.leg.steps` không có yaw → thảm vẽ trục dài bắc–nam (thêm `yaw` ở `engine.hostView` nếu cần đúng hướng).
- Đội về đích đứng trên thảm che ghim "Về đích" (nhãn vẫn hiện).
