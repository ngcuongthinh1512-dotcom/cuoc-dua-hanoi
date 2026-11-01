# Leg 3 Hà Nội – danh sách địa danh (3 quận cũ: Hoàn Kiếm, Hai Bà Trưng, Đống Đa)

Ngày 2026-11-01. Tất cả id OSM dưới đây đã đối chiếu với `.cache/osm` (`build-chunks`: 23 địa danh tìm thấy, 0 cảnh báo thiếu).
Registry: `client/src/geo/landmarks.ts`. Hiện mọi địa danh vẽ bằng bộ dựng chung S3DB (khối + part theo OSM); cột "Cần vẽ tay" là phần chi tiết dựng bằng code (như b.ts…n.ts của Bruxelles).

## Đã đăng ký (23 mục)

| # | Địa danh | OSM | Cần vẽ tay |
|---|---|---|---|
| **Hoàn Kiếm – hồ Gươm & Phố Cổ** | | | |
| 1 | Tháp Rùa | way/178995269 | tháp 3 tầng, mái cong, đảo |
| 2 | Đền Ngọc Sơn + Đình Trấn Ba | way/178995262, 178995271 | mái đền, cổng, cầu Thê Húc đỏ (cầu do BridgeBuilder, cần lan can + màu) |
| 3 | Tượng đài Lý Thái Tổ | relation/21390321 (vườn hoa; tượng node/443033827, 10,1 m) | tượng + bệ |
| 4 | Đền Bà Kiệu | relation/16640104 | mái, cổng tam quan |
| 5 | Chợ Đồng Xuân | way/1255852379 | mặt tiền vòm, mái |
| 6 | Ô Quan Chưởng | way/700627452 | cổng thành gạch, vòm |
| 7 | Đền Bạch Mã | way/700840711 | cổng, mái |
| 8 | Cầu Long Biên | way/874082896 | cầu thép giàn, trụ đá (cần dựng đầy đủ) |
| **Hoàn Kiếm – phố Pháp** | | | |
| 9 | Bưu điện Hà Nội | way/704153620 | mặt tiền vàng, cổng vòm |
| 10 | Trụ sở UBND TP Hà Nội | relation/16523383 | mặt tiền, tháp chính |
| 11 | Nhà thờ Lớn | way/28912942 | 2 tháp chuông ≈ 31,5 m (OSM chỉ 6–19 m), cửa hoa hồng |
| 12 | Tràng Tiền Plaza | relation/21381215 | khối kính |
| 13 | Nhà hát Lớn | way/37933050 | mái vòm, cột, thềm |
| 14 | Bảo tàng Lịch sử Quốc gia | way/37933255, 37933256 | mái kiểu Đông Dương |
| 15 | Sofitel Legend Metropole | relation/21802486 | mặt tiền trắng, ban công |
| 16 | Nhà tù Hỏa Lò | way/340128580 | cổng, tường, tháp canh |
| 17 | Ga Hà Nội | way/220305168 | mặt tiền, đồng hồ |
| 18 | Nhà thờ Hàm Long | way/944513319 | tháp |
| **Đống Đa** | | | |
| 19 | Văn Miếu – Quốc Tử Giám | way/702185155 (Khuê Văn Các), 702185143 (Văn Miếu Môn) | sân, các điện, bia rùa, tường rào |
| 20 | Gò Đống Đa | way/29133247 (gò), way/838426608 (đền thờ Quang Trung); tượng node/5485636741 | gò đất, tượng đài |
| 21 | Vincom NCT / Vinhomes / ROX Tower | way/1231417560, 840562572, 840562573 | tháp 30 tầng (có sẵn từ OSM) |
| **Hai Bà Trưng** | | | |
| 22 | Công viên Thống Nhất (+ hồ Bảy Mẫu) | way/37933849; hồ = relation/6971369 | cây, lối đi |
| 23 | Đền Hai Bà Trưng | relation/19179452 | mái, cổng |
| 24 | Đại học Bách Khoa (C1/C10) | way/158465677, 821304201 | – |
| 25 | Vincom Center Hà Nội (Bà Triệu) | way/840204357 | tháp 23 tầng |

Hồ Hoàn Kiếm (relation/198437), hồ Thiền Quang (3375635), Bảy Mẫu, hồ Tây, sông Hồng, Tô Lịch, Kim Ngưu là nước thật từ OSM (không phải landmark).

## Chưa có outline trong OSM (cần quyết định)

Chỉ có node hoặc không có dữ liệu, nên phải dựng bằng code theo toạ độ:
- Tháp Bút / Đài Nghiên (node/5857310193, 12 m, 21.0310 105.8531)
- Chùa Láng (node/1498111667), Hàm Cá Mập, Chùa Quán Sứ, Chùa Vua, Chợ Hôm, Chùa Bộc, Nhà thờ Thái Hà, Ga Cát Linh, Bắc Bộ Phủ, Ngân hàng Nhà nước (số 47 Lý Thái Tổ)
- Tòa án Nhân dân Tối cao (way/1088847126, có thể thêm)

## Ngoài 3 quận nhưng nằm trong khung bản đồ (không đăng ký)
Lotte Center (way/727570329, part 272 m), Hồ Tây, Lăng Chủ tịch HCM, Cung Hữu Nghị, SVĐ Hàng Đẫy (Ba Đình); Times City, Vincom Mega Mall (Hai Bà Trưng, có thể thêm).
