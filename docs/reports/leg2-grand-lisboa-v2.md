# Leg 2 – Grand Lisboa v2 (mf2.ts), theo ảnh chụp mặt trước của anh

Trạng thái: XONG (2026-10-06), chưa commit. File: `client/src/world/landmarks/mf2.ts` (phần Grand Lisboa viết lại),
`mf2.test.ts` (9 test), khối `landmarks.mf2.lisboa` trong `client/src/config.ts`. Ảnh tham chiếu không chép vào repo.
Kiểm tra: `npx tsc --noEmit -p client` sạch; `npx vitest run --root client src/world/landmarks` 108/108 (gồm `paths.test.ts`:
không mẫu lối đi nào của grand-lisboa bị chặn); `npm run test -w client` 865/865.

## Hình dạng (mọi số ước lượng từ ảnh, trừ chiều cao)
- Chiều cao 261 m tới đỉnh cột (Wikipedia; CTBUH 258). OSM 211.5 trên khung tháp không dùng. Mặt bằng = elip trên khung chữ
  nhật OSM 63 × 33 m (trục dài Đ–T, nên nhìn từ phía nam thấy mặt rộng như trong ảnh).
- Thân: elip vàng kim (`metal` + màu đỉnh), eo trên mái vòm (× 0.78 → 0.62 nửa trục dài ở 60 m), dải sàn tối mỗi 3 tầng
  (12.6 m) + vạch sáng hổ phách mảnh dưới vương miện; lõi trong vương miện tối hơn (dải tối chỗ cánh gặp thân).
- Vương miện hoa sen (sửa sau review điều phối viên: loe RA NGOÀI, rộng nhất ở đỉnh): 4 tầng × 10 cánh, tầng sau lệch nửa
  cánh, bắt đầu cao hơn và mở rộng hơn tầng dưới (bình bậc thang): gốc 95 / 118 / 142 / 166 m, ngọn 165 / 190 / 214 / 240 m,
  loe tới × 0.8 / 0.9 / 1.0 / 1.1 nửa trục dài (trục ngắn × 1.3 thêm) → rộng nhất ở ≈ 92–96 % chiều cao, ≈ 1.75 × bề rộng
  thân, chìa ra ngoài khung OSM (không collider ở đó). Ngọn cao thêm tới 10 m về hai đầu trục dài ("tai" hai bên); tầng trên
  cùng hạ tới 22 m ở hai mặt rộng (khe chữ V ở mặt nam / bắc, thấy vòng biển hiệu + quả cầu + cột trong khe). Mỗi cánh là
  tấm cong hai mặt, pháp tuyến mượt (`sheet()`), chân hơi hẹp, thân rộng, ngọn nhọn kiểu vòm nhọn từ 0.8, mở ra liên tục tới
  ngọn (`petalShape()`: loe 1 − (1 − v)^1.6), mép cánh lõm nhẹ (`cup`) nên các cánh chồng nhau cắt nhau theo đường thẳng,
  không có mặt trùng. Mặt ngoài sọc ngang: vàng / dải `neon` hổ phách mờ (ban ngày là sọc sẫm, ban đêm thành các dải sáng
  ngang); mặt trong nâu sẫm; hai mép dài mỗi cánh có dải `neon` vàng (0.9 m).
- Đỉnh: vòng biển hiệu sáng quanh lõi (không có chữ: không có texture), chân trụ + quả cầu (r 5 m) + cột ăng-ten tới 261 m,
  vòng sáng quanh quả cầu.
- Bục / mái vòm: hình cầu dẹt trên đường bao OSM (bán kính theo từng phương = tia từ tâm tới đường bao × 0.98, chân = × 0.82,
  đỉnh 54 m = OSM). Lưới kim cương 60 ô × 15 hàng (mặt phẳng từng ô, vàng; 1 dải chéo trắng mỗi 20), gân sáng chéo hai chiều
  mỗi 4 ô (`neon` 0.6 m, nhấc 0.15 m), chuỗi kim cương xanh ngọc dọc một họ đường chéo mỗi 12, kim cương đỏ rải rác (`near`).
  Nửa ô ở chân / dưới chóp, chóp nón, váy tối xuống mặt đất thấp nhất.
- Hai tháp vàng bậc thang ở đầu Đông / Tây của vòm (4 tầng tới 42 m, vạch sáng mỗi đỉnh tầng `near`).
- Lối vào phía nam (`canopy.azimuth` 180, đổi từ 135 để khớp ảnh): mái lều vàng (mặt dưới sáng) + 2 × 4 lá vàng xòe nghiêng
  ra ngoài hai bên cửa, gân sáng; không collider (đi qua được).
- Collider: lăng trụ 12 cạnh chân thân tháp tới 54 m; lăng trụ đường chân vòm (× 0.82 đường bao) tới xích đạo vòm (≈ 20 m);
  2 tháp bên tới 30 m. Lối đi không bị chặn (paths.test).

## Tam giác
Tháp 13 200 (metal 7 810, neon 4 456, masonry 934); bục 4 100 (metal 2 136, neon 1 050, metal/near 392, neon/near 282,
masonry 240). Tổng ≈ 17 300 (< 25 k). `near` chỉ là lá cửa / lều / kim cương đỏ / vạch tháp bên; cánh sen, lưới, gân, vạch
sáng đều giữ ở xa (bóng dáng thấy từ 1.4 km trong sương).

## Ảnh (screenshots/, SCREENSHOT_PORT 5197)
- `gl2-front-day` (`?cam=410,110,640,0,8&time=day&quality=high`): mặt trước từ phía nam, thân + eo + vương miện có tai.
- `gl2-front-night` (cùng góc, đêm): dải sáng ngang + viền cánh vàng, lưới vòm sáng.
- `gl2-front-level` (`410,170,520,0,10`, ngày: khe chữ V, tai, quả cầu), `gl2-front-close` (bản cũ trước review, nụ khép).
- `gl2-three-quarter` (`650,90,523,45,14`, ngày, từ ĐN; Hotel Lisboa che bục).
- `gl2-dome-day` / `gl2-dome-night` (`410,10,440,0,14`): vòm lưới kim cương, hai tháp bên, lá cửa.
- `gl2-far-day` (`410,600,1620,0,-18`, ≈ 1.4 km): bóng vương miện mờ trong sương.
- `lm-grand-lisboa` (preset, đêm, chất lượng thấp).

## Còn mở / ước lượng
- Tỉ lệ ảnh (chụp ngước, đã chỉnh đường đứng) làm vương miện và vòm trông to hơn; mô hình giữ kích thước OSM (khung 63 × 33,
  vòm 54 m); vương miện ≈ 1.75 × thân. Vương miện bắt đầu ≈ 36 % chiều cao (theo ảnh, không phải 25–30 % như brief).
- Không có chữ "GRAND LISBOA" (chỉ vòng sáng), không có màn hình đen trước cửa.
- Nhìn xa: sương mặc định (fog far 700 m + 1.3 × độ cao) che gần hết ở 1.5 km; cần bước skyline (ngoài phạm vi file này).
- Mặt trong cánh thấy được qua khe ở đỉnh (nâu sẫm, đúng ý), không z-fighting thấy trên các ảnh.
