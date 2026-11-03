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
| 22 | Công viên Thống Nhất (+ hồ Bảy Mẫu) | way/37933849; hồ = relation/6971369 | cây, lối đi; **cổng chính Trần Nhân Tông đã dựng** (xem dưới) |
| 23 | Đền Hai Bà Trưng | relation/19179452 | mái, cổng |
| 24 | Đại học Bách Khoa (C1/C10) | way/158465677, 821304201 | – |
| 25 | Vincom Center Hà Nội (Bà Triệu) | way/840204357 | tháp 23 tầng |

### Cổng chính Công viên Thống Nhất (2026-11-03)
Cổng pergola vàng nhạt (ảnh chủ dự án) trên phố Trần Nhân Tông, đối diện hồ Thiền Quang: tâm thế giới **(−768, 1676)** = 21.01708 N, 105.84477 E (chỗ lõm của outline OSM x −750…−785; OSM không có node `barrier=gate` / `entrance`, nên lấy theo lõm). Dựng trong `client/src/world/landmarks/h4.ts` `thongNhatGate` qua danh sách `placed` (index.ts `buildLandmarks` dựng theo chunk CHỨA điểm, chunk −4_6): bản ghi công viên nằm ở chunk −4_8 cách cổng 330 m nên cổng cũ (4 trụ kem) không bao giờ có collider tại chỗ (`chunks.colliderRadius` 150 m). Kích thước: cổng giữa 12 m rộng, 2 × 2 cột 1,2 m mỗi bên, cao 7,3 m, lối đi 5 m; hai cánh colonnade 13 m, cao 4,8 m, cột 0,8 m cách 3 m, trụ cụt ở đầu; đế cột màu đất nung 1 m; khung dầm + đầu rui mỗi 0,6 m; biển xanh lục đậm 5 × 1,7 m hai mặt "CÔNG VIÊN THỐNG NHẤT / THONG NHAT PARK / SINCE 1958" (OffscreenCanvas → vật liệu `mural`); 4 đèn cầu trắng (`neon`) trên tay đỡ mặt trong cột; lối lát `pave` 12 × 34 m từ vỉa hè vào công viên; 4 cột đèn hai cầu; hàng rào sắt đen (cột, 2 thanh ngang, song 0,16 m) ngoài hai cánh, cánh cổng sắt mở vào trong; hàng rào cây thấp. Cột, trụ, hàng rào đặc (Sink.prism); lối đi 5 m trống. Không có tường / hàng rào OSM quanh công viên trong chunk nên trong công viên vào được. Ảnh: `screenshots/gate-front.png`, `gate-approach.png`, `gate-inside.png`.

### Bên trong Công viên Thống Nhất (2026-11-03)
`h4.ts` `thongNhatPark`, chạy ở MỌI chunk giao với khung công viên (`placed` giờ là khung `{minX,maxX,minZ,maxZ, build(chunk, ctx)}`; 20 chunk −5…−2 × 6…10). Theo dữ liệu chunk: mảnh thảm cỏ OSM (`areas` kind park, đã cắt theo chunk) = vùng được đặt đồ; 173 đường đi bộ (RoadBuilder vẫn lát như cũ); lưới cao độ đã khoét (`ctx.height < −0,2` = nước hồ Bảy Mẫu: không đặt gì lên nước, hồ bơi được như cũ). OSM chỉ có 48 cây `natural=tree`, không ghế / sân chơi, nên:
- Cây: InstanceSet `tree` (platane có sẵn, LOD của attach.ts) thành hàng dọc đường đi mỗi 9 m (so le hai bên, 3,4 m) + rải trên cỏ lưới 12 m lệch ngẫu nhiên, 4 tỉ lệ thân/tán khác nhau ("loài"; ponytail: loài thật cần thêm prop kind), cỡ 0,7–1,3; tránh nước, đường (> 2,6–3,5 m), nhà, đồ đặt tay.
- Ghế `bench` (InstanceSet, không chặn) mỗi 14 m quay mặt ra đường + thùng rác 1/3; cột đèn hai cầu trắng (`lampPost`, lăng trụ chặn) mỗi 22 m; quảng trường nhỏ ở 1/3 nút giao đường đi (đĩa lát 6 m, bồn hoa hoặc đèn đá ở giữa, 2 ghế); mảng cỏ đậm / nhạt (đĩa phẳng).
- Bờ hồ: đường đi có nước trong 9 m về một phía → lan can sắt đen mỗi 7 m sát mép (không chặn để vẫn xuống hồ được), cụm lau sậy / lá súng dưới nước.
- Đặt tay trên bãi cỏ phía bắc hồ (đã soát với dữ liệu chunk: cách đường ≥ 8 m, không nhà, không nước): sân chơi trẻ em (−680, 1712: xích đu, cầu trượt, đu quay, bập bênh trên nền cát), thể dục ngoài trời (−880, 1712), sân khấu nhỏ (−730, 1888, mặt bắc), 2 ki-ốt cà phê (lục giác + quầy + bàn ghế `cafe`: −865, 1790 và −700, 1780), hành lang pergola 24 m (−880, 1795), bồn đài phun + 6 bồn hoa + 6 đèn đá quanh quảng trường đài phun (−825, 1844), cầu đi bộ đá 47 m ra Đảo phía đông (bờ −745, 2339 → đảo −787, 2317; mặt cầu +0,3 m đi được, lăng trụ chặn) + đình lục giác trên đảo (−814, 2291), biển sơ đồ + đèn đá + cột đèn dọc lối vào cổng. Đảo phía tây đã có cầu OSM.
Ảnh: `screenshots/park-approach.png` (từ trong cổng nhìn vào), `park-lake.png` (bờ hồ bắc), `park-overview.png` (trên cao), `park-bridge.png` (cầu ra đảo).

Hồ Hoàn Kiếm (relation/198437), hồ Thiền Quang (3375635), Bảy Mẫu, hồ Tây, sông Hồng, Tô Lịch, Kim Ngưu là nước thật từ OSM (không phải landmark).

## Chưa có outline trong OSM (cần quyết định)

Chỉ có node hoặc không có dữ liệu, nên phải dựng bằng code theo toạ độ:
- Tháp Bút / Đài Nghiên (node/5857310193, 12 m, 21.0310 105.8531)
- Chùa Láng (node/1498111667), Hàm Cá Mập, Chùa Quán Sứ, Chùa Vua, Chợ Hôm, Chùa Bộc, Nhà thờ Thái Hà, Ga Cát Linh, Bắc Bộ Phủ, Ngân hàng Nhà nước (số 47 Lý Thái Tổ)
- Tòa án Nhân dân Tối cao (way/1088847126, có thể thêm)

## Ngoài 3 quận nhưng nằm trong khung bản đồ (không đăng ký)
Lotte Center (way/727570329, part 272 m), Hồ Tây, Lăng Chủ tịch HCM, Cung Hữu Nghị, SVĐ Hàng Đẫy (Ba Đình); Times City, Vincom Mega Mall (Hai Bà Trưng, có thể thêm).
