# Leg 2 – Hotel Lisboa + MGM Macau v2 (dựng lại theo ảnh tham khảo)

Trạng thái: XONG (2026-10-06), chưa commit. Chỉ sửa `client/src/world/landmarks/m3.ts`, `m3.test.ts`, khối
`landmarks.m3.lisboa` / `landmarks.m3.mgm` trong `client/src/config.ts`. Ảnh tham khảo (Wikimedia Commons) chỉ để nhìn,
không nằm trong repo. Toàn bộ dựng bằng code, không tải gì.

## Hotel Lisboa
Gán lại các bản ghi OSM (trước đây hiểu sai):
- Bản ghi tròn 37,4 m (r ≈ 22 m) chứa đúng nút OSM `tourism=hotel` "葡京酒店" (n/13679896101) → **tháp khách sạn tròn
  màu trắng** (12 tầng × 3,1 m = 37,4 m): trụ trắng, 56 gân đứng trắng (fin), mỗi tầng một dải kính sáng nhạt (neon, ban
  ngày trông kem/trắng, ban đêm sáng ấm), lan can vàng + dải bóng đèn, vòng 16 cánh quạt vàng nhỏ, biển **LISBOA** đỏ
  bằng bóng đèn trên mái (quay mặt nam / bắc).
- Bản ghi 76,8 m → **khối mở rộng 1991** (khối chữ nhật trắng, dải sáng mỗi 3,2 m, viền LED). Không còn biển hiệu.
- Bản ghi podium 27,8 m: thùy tròn phía nam của outline = **Casino Lisboa**. Tâm / bán kính khớp cung các nút OSM
  (Kasa fit nút 17–29: tâm x 501, z 452, r 23–25 → r 22,5 để chạm tháp tròn). Podium bị cắt bằng nửa mặt phẳng cách tâm
  casino 0,8·r về phía sau (`casino.podiumCut`), phần còn lại giữ nguyên dải bóng đèn + gân vàng như trước.
- Casino: trụ thấp, tầng trệt tối 3,5 m, lưới cửa sổ 72 cột × 6 hàng tới 15 m (ô cam = neon, đố nâu sẫm), dải bóng đèn
  dưới gờ, gờ vàng; vương miện "lồng chim" = 20 cánh quạt nhọn vàng (neon "được chiếu sáng", nghiêng ra 14°, viền sáng +
  tia sáng `near`), trụ trong + vòm + hoa thị 8 cánh nhỏ + chóp nhọn (đỉnh ≈ 30 m). Collider = lăng trụ tròn tới gờ.
- Cây cảnh / mái che (`roof`) vẫn generic.

## MGM Macau
- Tháp (OSM 120 m, 40 tầng) = **3 tầng chồng đứng**: dưới **đồng / rose-gold** (`#b86d4a`), giữa **kính xanh dương**
  (`#3c6fb4`), trên **vàng** (`#e2b85c`). Ranh giới giữa các tầng và mái là sóng sin theo trục dài (biên độ 5 m, bước
  sóng 1,1 × chiều dài tháp, mỗi ranh giới một pha) → mái lượn, đỉnh sóng mái = đúng 120 m OSM.
- Lệch giữa các tầng: tầng xanh lùi vào 1,8 m (`inset`), mỗi tầng cắt bớt đầu tây / đông khác nhau (`trim` 7 / 9 / 12 m)
  → các khối so le như ảnh; mọi thứ vẫn nằm trong outline OSM.
- Mỗi tầng: vạch sáng mỗi sàn 3 m chạy theo sóng (màu theo tầng: cam / xanh nhạt / vàng), viền sáng ở mép trên. Chữ
  **MGM GRAND** bằng bóng đèn chạy theo mặt cong của tầng vàng, cả hai mặt dài (thêm chữ R vào font bóng đèn).
- Giữ nguyên podium, vòm kính Grande Praça và sư tử vàng.

## Tam giác (trên dữ liệu chunk thật, mọi bản ghi của landmark; xa / `near`)
- hotel-lisboa: 8 804 / 200 (7 collider) – trước: 5 134 / 0.
- mgm-macau: 7 264 / 1 460 (2 collider) – trước: 7 350 / 1 460.

## Ảnh (screenshots/, SCREENSHOT_PORT 5241)
- Đã chụp và xem: `v2-lisboa-front-day`, `v2-lisboa-front-night`, `v2-lisboa-34-day`, `v2-lisboa-sign-day` (biển
  LISBOA), `v2-mgm-front-day` (trước khi đổi màu vàng sang `#e2b85c`). Ảnh "trước": `v2-lisboa-top-before`,
  `v2-lisboa-front-before`, `v2-mgm-front-before`.
- CHƯA chụp được: `v2-mgm-front-night`, `v2-mgm-34-day`, ảnh đường phố, `lm-hotel-lisboa`, `lm-mgm-macau`. Lý do: một
  agent khác đang gỡ Louvre (shared/ + client/), nên trang game hỏng tạm thời (`LOUVRE` / `branchConfirmText` không có).
  Chụp lại khi `npx tsc --noEmit -p client` sạch.
- Kiểm tra: `npx vitest run --root client src/world/landmarks/m3` 22/22 đạt; `tsc` sạch với m3 (các lỗi còn lại là của
  phần Louvre / host / sfx). Chưa chạy `npm run test -w client` đầy đủ (cùng lý do).

## Ước lượng (không có số liệu công bố)
Gán bản ghi 37,4 m = tháp tròn (dựa trên nút hotel OSM + 12 tầng), tâm/bán kính casino (khớp từ outline), mọi chiều cao
của casino (trệt 3,5, lưới 15, cánh 6,5 m, vòm, hoa thị), số cột / hàng cửa sổ, số cánh; tỉ lệ chia 3 tầng MGM
(0,44 / 0,72), biên độ / bước sóng / pha, inset / trim; mọi màu và độ sáng. Năm: Lisboa 1970 (mở rộng 1991), MGM 2007.

## Còn mở
- Không biết chắc vị trí thật của tháp tròn so với casino (ảnh chụp qua hồ cho thấy tháp tròn ở phía sau-phải casino;
  dữ liệu OSM đặt nó phía sau-trái khi nhìn từ hồ phía đông nam). Giữ theo OSM.
- Podium 27,8 m vẫn là một khối lớn (không phải phần của nhiệm vụ này).
- Đầu mút các tầng MGM cắt thẳng (ảnh thật cuộn tròn ở hai đầu), chữ MGM GRAND là bóng đèn (không phải chữ khắc).
