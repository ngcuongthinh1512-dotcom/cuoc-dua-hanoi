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
- Đặt tay trên bãi cỏ phía bắc hồ (đã soát với dữ liệu chunk: cách đường ≥ 8 m, không nhà, không nước): sân chơi trẻ em (−680, 1712: xích đu, cầu trượt, đu quay, bập bênh trên nền cát), thể dục ngoài trời (−880, 1712), sân khấu nhỏ (−730, 1888, mặt bắc), 2 ki-ốt cà phê (lục giác + quầy + bàn ghế `cafe`: −865, 1790 và −700, 1780), hành lang pergola 24 m (−880, 1795), bồn đài phun + 6 bồn hoa + 6 đèn đá quanh quảng trường đài phun (−825, 1844), biển sơ đồ + đèn đá + cột đèn dọc lối vào cổng. Cầu ra đảo: CHỈ cầu đi bộ OSM từ bờ Lê Duẩn ra đảo Thống Nhất (way −1062 → −1023, z 2336, BridgeBuilder vẽ); đảo Hòa Bình (phía đông) không có cầu như thật (2026-11-05: đã bỏ cầu đá + đình trên đảo đông dựng hôm 11-03). Lan can bờ hồ chừa khoảng trống 6 m quanh nút giao đường đi (lối ra cầu không bị chắn).
Ảnh: `screenshots/park-approach.png` (từ trong cổng nhìn vào), `park-lake.png` (bờ hồ bắc), `park-overview.png` (trên cao), `park-islands-top.png` (nhìn thẳng xuống hai đảo: chỉ đảo Thống Nhất có cầu).

### Cổng Lê Duẩn (2026-11-05)
`h4.ts` `leDuanGate`, `placed` riêng (chunk −5_9): tâm **(−1103, 2336)** = 21.0111 N, 105.8411 E, mép tây công viên trên Đường Lê Duẩn (tim đường x −1121), đúng trục đường đi bộ OSM z = 2336 nối vỉa hè Lê Duẩn → cổng → lối dạo ven hồ (x −1073) → cầu ra đảo Thống Nhất (x −1062). Cùng kiểu cổng chính nhưng nhỏ: cổng 7 m, 2 cột 1 m mỗi bên cao 5,9 m, lối 4 m, khung dầm + đầu rui, đế đất nung, biển xanh lục hai mặt "CÔNG VIÊN THỐNG NHẤT / CỔNG LÊ DUẨN" (`mural`), 2 đèn cầu trên tay đỡ, cánh rào sắt 10 m mỗi bên + cánh cổng mở, hàng rào cây, lối lát 6 × 23 m từ lề đường vào, 2 cột đèn hai cầu. Cột / rào đặc, lối 4 m trống; cây / ghế / đèn tự rải tránh vòng 18 m quanh cổng (và 38 m quanh cổng chính). Ảnh: `screenshots/gate-leduan-street.png` (từ Lê Duẩn), `gate-leduan-bridge.png` (từ đầu cầu nhìn ra cổng).

### Tượng đài Bác Hồ – Bác Tôn (2026-11-05)
`client/src/world/landmarks/hoton.ts` `bacHoBacTon`, một mục `placed` trong `h4.ts` (chunk −5_9, cùng chunk cổng Lê Duẩn): node OSM/9907239892 21.0111944 N 105.8424821 E = thế giới **(−1003, 2323)**, trên **đảo Thống Nhất** (đi cầu bộ từ cổng Lê Duẩn, way x −1062 → −1023, z 2336; vòng đường đi quanh đảo x −1027…−967). Dựng theo ảnh chủ dự án:
- **Hướng**: mặt trước (mặt có chữ) quay về **phía TÂY** (phía cầu / Lê Duẩn), người xem nhìn sang đông thấy phần hồ Bảy Mẫu rộng nhất (≈ 300 m) phía sau tượng; phía tây chỉ là kênh hẹp ≈ 30 m. Khung: a = bắc (bên trái người xem), w = đông.
- **Bệ đá granit xám**: bậc thấp 4,7 × 2 × 0,1 m; khối 4,2 × 1,5 × 1,35 m, mặt trước chia bằng rãnh đứng: phần trái hẹp (1,65 m, nhô 2 cm), phần phải rộng (2,43 m) mang chữ đồng nổi "BÁC HỒ – BÁC TÔN" (chữ hoa có chân, cao 0,13 m, nổi 1,2 cm; dựng từ OffscreenCanvas trong worker → các hộp chữ nhật gộp theo dòng điểm ảnh, không dùng texture vì chunk −5_9 đã dùng atlas `mural` cho biển cổng Lê Duẩn); tấm đỉnh 3,9 × 1,28 × 0,1 m. Mặt đỉnh bệ 1,55 m. Bệ + bậc đặc (Sink.prism).
- **Hai tượng đồng** (vật liệu `metal`: màu đồng nâu #553a1e, gỉ xanh-nâu ở mặt hướng lên, loang nhẹ theo vertex colour; metalness 0,6, roughness 0,45): Bác Hồ bên trái, cao 3,1 m, mảnh, gần như nghiêng mặt (hướng nam, hơi quay lưng về người xem như ảnh), người hơi đổ về trước, đầu cúi nhẹ, râu dê, tóc thưa lùi trán, tay phải đưa ra bắt tay, tay trái buông; Bác Tôn bên phải, 2,85 m, đậm người, hói, cười, quay 3/4 về người xem, ngẩng nhẹ, tay phải nắm tay Bác Hồ, tay trái đặt lên trên. Cả hai mặc áo cổ đứng 5 khuy, nẹp áo, 2 túi ngực + 2 túi dưới có nắp (gờ nổi), quần ống đứng, giày. Dựng bằng ống loft trơn (thân áo siêu-elip, chân, tay 2 đốt giải IK tới điểm bắt tay, bàn tay dẹt + ngón cái, cổ áo, cổ) + đầu là mặt cầu biến dạng (mũi, cung mày, hốc mắt, gò má, môi, cằm, tai, tóc, ria / râu dê). Không va chạm (đứng trên bệ).
- **Vườn**: sân lát `pave` bán kính 6,6 m + 2 lối lát nối vòng đường đi của đảo (về đầu cầu phía tây nam và phía đông); bồn hoa tròn bán kính 4,5 m viền đá, thảm lá xanh với hoa cúc / zinnia cam, đỏ, hồng, vàng; cụm lá đỏ (dong riềng / huyết dụ) phía trước bên phải; 2 chậu đá trắng trên chân đế hai bên phía sau (đặc); 2 cây hoa sứ (cây platane InstanceSet `tree` thu thấp + chấm hoa trắng hồng) bên trái và 1 cây phượng (tán rộng + hoa đỏ cam) bên phải. ponytail: hoa sứ / phượng mượn thân tán platane, cần prop riêng nếu muốn đúng loài.
- Tán cây / ghế / đèn rải tự động trong công viên tránh vòng 13 m quanh tượng (`taken`); tượng `monument` chung trên điểm artwork OSM này đã bỏ.
- ≈ 24k tam giác (đồng 8,8k, granit + vườn 4k, hoa / chấm hoa LOD gần 8k, chữ ≈ 3–5k) trong 1 lượt `metal` + `masonry` + `pave` của chunk, + 3 cây instanced.
Ảnh (cổng 5388, `npm run screenshot -- hn-hoton`): `screenshots/hn-hoton-front.png` (góc như ảnh gốc), `hn-hoton-hands.png` (cận bắt tay), `hn-hoton-face-ton.png`, `hn-hoton-face-ho.png` (cận mặt), `hn-hoton-side.png` (phía nam), `hn-hoton-wide.png` (từ đầu cầu), `hn-hoton-top.png` (trên cao).

Hồ Hoàn Kiếm (relation/198437), hồ Thiền Quang (3375635), Bảy Mẫu, hồ Tây, sông Hồng, Tô Lịch, Kim Ngưu là nước thật từ OSM (không phải landmark).

## Chưa có outline trong OSM (cần quyết định)

Chỉ có node hoặc không có dữ liệu, nên phải dựng bằng code theo toạ độ:
- Tháp Bút / Đài Nghiên (node/5857310193, 12 m, 21.0310 105.8531)
- Chùa Láng (node/1498111667), Hàm Cá Mập, Chùa Quán Sứ, Chùa Vua, Chợ Hôm, Chùa Bộc, Nhà thờ Thái Hà, Ga Cát Linh, Bắc Bộ Phủ, Ngân hàng Nhà nước (số 47 Lý Thái Tổ)
- Tòa án Nhân dân Tối cao (way/1088847126, có thể thêm)

## Ngoài 3 quận nhưng nằm trong khung bản đồ (không đăng ký)
Lotte Center (way/727570329, part 272 m), Hồ Tây, Lăng Chủ tịch HCM, Cung Hữu Nghị, SVĐ Hàng Đẫy (Ba Đình); Times City, Vincom Mega Mall (Hai Bà Trưng, có thể thêm).

### Nhà ống lấp chỗ trống quanh hồ Ba Mẫu (2026-11-05)
Khu quanh hồ Ba Mẫu / tây Lê Duẩn / Ô Đồng Lầm – Kim Hoa gần như không có nhà trong OSM. `scripts/infill-houses.ts` (chạy SAU build-chunks / build-graph: `npx tsx scripts/infill-houses.ts [--dry]`, rồi `find client/public/data shared/data -name "* [0-9].*" -delete`) sinh nhà dọc phố, ghi thẳng vào chunk JSON như nhà thường (`kind` house / commercial / apartments, `levels` 2–5, cờ `gen: 1`; chạy lại thì xoá `gen` cũ rồi sinh lại; build-chunks sẽ xoá chúng, phải chạy lại script). BuildingBuilder vẽ y như nhà OSM (nhà ống, mái ngói / phẳng, tenement khi ≥ 4 tầng), không thêm draw call.
- Tuyến: Vincom Center Phạm Ngọc Thạch (tâm outline way/136161117, thế giới (−2091, 2867)) → Tượng đài Bác Hồ – Bác Tôn (node/9907239892, 21.0111944 N 105.8424821 E = (−1003, 2323), trong Công viên Thống Nhất cạnh Lê Duẩn). Đường ngắn nhất theo road graph (xe, 1386 m): Phạm Ngọc Thạch → Đào Duy Anh → Xã Đàn → Kim Hoa → Ô Đồng Lầm → Lê Duẩn. Hành lang ±120 m + hộp hồ Ba Mẫu x −1560…−1100, z 1900…2560.
- Luật: mặt phố = mép vỉa hè; lô rộng 3–5 m, sâu 6–14 m; chỉ đặt khi ô 40 m quanh có < 35 % diện tích nhà; không chạm nhà OSM (cách 0,4 m bên, 1,5 m sân sau), đường (kể cả vỉa hè), cầu, nước, công viên / cỏ > 400 m², địa danh, nhà sinh trước; trong 3 quận; hash xác định. 2186 ứng viên, giữ 1500 (hạn mức, cắt ngẫu nhiên), 15 chunk: −5_7…−5_10, −6_7…−6_10, −7_7…−7_10, −8_9…−8_11.
- Ảnh: `screenshots/infill/before-top.png`, `after-top.png` (trên cao), `street-route.png`, `oblique-route.png`.
