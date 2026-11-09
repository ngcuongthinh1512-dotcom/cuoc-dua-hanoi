# Nhà phố Hà Nội – danh mục kiểu nhà (Leg 3)

Vẽ lại nhà thủ tục (BuildingBuilder: nhà OSM + 1.500 nhà chèn `scripts/infill-houses.ts` dùng chung bộ dựng) cho giống phố Hà Nội.
Không đụng dữ liệu chunk; mọi thay đổi nằm ở bộ dựng phía client + `config.ts`. Địa danh (landmarks), mặt nạ quận, collider nhà
(lăng trụ theo footprint) giữ nguyên.

## Ảnh tham chiếu của chủ nhà → kiểu nào

| Ảnh | Nội dung | Dẫn tới |
|---|---|---|
| 1. Trần Nhân Tông (cổng CV Thống Nhất) | phố ~8 m, cây cổ thụ vòm kín phố, xe máy đỗ hàng, nhà Pháp kem, cờ, tường cao | cây đường phố trồng dọc vỉa (`props.streetTrees`), gốc quét vôi, hàng xe máy (`props.motoRows`), cột 6–9 |
| 2. Bà Triệu 174–176 | nhà phố Pháp cũ 2–3 tầng: cửa chớp xanh, ban công cong lan can đặc + hoa sắt xanh, vàng ochre ố, mái hiên tôn, cửa gỗ xanh tầng trệt, cờ đỏ sao vàng, cạnh shop kính hiện đại | cột tường 8, 9; mặt tiền shop 3 (cửa gỗ xanh), 4 (shop kính, ma-nơ-canh); mái hiên tôn/ngói (`macao.awning`); cờ trên tay đỡ |
| 3. Bà Triệu (dài) | nhà thương mại 5–8 tầng ốp tấm tối + biển lớn đỏ, nhà hẹp kẹp giữa với biển dọc chồng, lưới che công trình tầng trên, khối cũ giữa thế kỷ có cầu thang thoát hiểm sắt, cờ/băng rôn | cột 10 (ốp tối + biển "SALE 50%"/cờ lớn), 11 (biển dọc, tầng 4 lưới đen), 13 (khối cũ, lồng cầu thang sắt); `recipes.tall` cho nhà ≥ 15 m |

## Các "công thức" nhà (≥ 12, đan xen)

Mỗi lô (plot ≈ 4 m, `macao.plots`) lấy 1 cột atlas tường + 1 màu vữa + kiểu mái + mặt tiền tầng trệt riêng:

| # | Kiểu | Cột atlas tường | Màu | Mái / phụ kiện |
|---|---|---|---|---|
| 1 | Nhà phố Pháp cũ (cửa chớp xanh, ban công sắt) | 8 | ochre/kem/vàng (`colonial` 0–3, `#d8b46a`, `#e9dcc0`) | mái hiên tôn/ngói, cờ trên tay đỡ, ố nặng |
| 2 | Nhà phố Pháp cũ ban công cong, cửa sổ gỗ tầng thượng | 9 | như trên | chậu cây, tầng 4 = cửa sổ gỗ khung vàng-xanh dưới gờ |
| 3 | Biệt thự / nhà Pháp vòm (khu Pháp `macao.french`) | 6, 7 | ochre | mái ngói hip (`hip`, `french.hipChance`) |
| 4 | Nhà ống cửa chớp + lan can con tiện | 0 | pastel | tum + bồn nước (`plots.tumShare`, `tankShare`), cờ tầng 1 |
| 5 | Nhà ống ban công sắt + biển dọc "NHÀ NGHỈ" | 1 | pastel | sàn ban công nhô (`slabCols`) |
| 6 | Nhà ống chuồng cọp + quần áo phơi | 2 | kem (riêng) | mái tôn dốc (`gableShare`, tôn xanh / gỉ) |
| 7 | Nhà ống cửa chớp nâu + ô văng | 3 | pastel | |
| 8 | Nhà ống cửa nhôm + biển "MAY ĐO" + cờ dây | 4 | pastel | điều hoà, ống thoát nước |
| 9 | Nhà ống ban công đặc + cây (hồng nhạt) | 5 | hồng (riêng) | |
| 10 | Mặt phố mới ốp tấm tối + kính, biển đỏ lớn, cờ lớn | 10 | (màu riêng: xám than) | nhà cao (`recipes.tall`) |
| 11 | Nhà hẹp biển dọc chồng (ĐIỆN THOẠI / SIM SỐ / NHA KHOA), tầng 4 đang sửa: lưới đen | 11 | pastel | |
| 12 | Tân cổ điển (cột trắng, trán tường, lan can con tiện, kính xanh) | 12 | pastel | sàn ban công |
| 13 | Khối giữa thế kỷ 5–7 tầng, lồng cầu thang sắt, cửa sổ nhỏ, điều hoà, quần áo | 13 | kem/be | |
| 14 | Khu tập thể (KTT) | atlas `tenement` | `macao.tenement` | mái che tôn (`kttRoof`), lô-gia, chuồng cọp |
| 15 | Tháp kính / lưới bê tông | `curtain` / `tenement` | `glass` / `concrete` | hộp kỹ thuật mái |

Tầng trệt (`shopfront`, 8 mặt tiền, mỗi ô 3 m, chữ thật, không thương hiệu): 0 PHỞ BÒ (quầy, tủ kính, ghế nhựa), 1 TẠP HOÁ
(bạt sọc, hàng hoá), 2 cửa cuốn đóng + chữ phun "KHOAN CẮT BÊ TÔNG", 3 cửa gỗ xanh nhà Pháp + băng rôn đỏ, 4 THỜI TRANG kính
khung đen + ma-nơ-canh + SALE, 5 CÀ PHÊ (ghế đẩu, bảng menu), 6 NHÀ THUỐC (chữ thập xanh), 7 SỬA XE / RỬA XE MÁY (lốp).

Màu vữa thêm: `#e9dcc0` kem, `#d8b46a` ochre, `#e8c3b9` hồng, `#b9d6c7` xanh bạc hà, `#a9bfd6` xanh nhạt, `#bfb8a8` xám.

## Quy tắc đan xen

- Mỗi cạnh mặt phố được chia lô ≈ 4 m; cột atlas + màu được băm theo vị trí lô, rồi **không lô nào trùng cột hoặc trùng màu với lô
  bên trái** (`differ` trong `emitPlots`: dịch theo bước băm tới giá trị khác).
- Danh sách cột (`macao.recipes`) có trọng số theo bối cảnh: `street` (nhà thấp, nhiều nhà ống), `tall` (khối ≥ `tallFrom` 15 m:
  nhiều mặt phố mới / khối giữa thế kỷ / nhà biển dọc), `french` (ô khu Pháp: cột 6–9 + vài nhà ống / tân cổ điển).
- Chiều cao: nhà không có tag cao được 2–4 tầng băm theo nhà, mỗi lô thêm 0–3 tầng (`plots.extra`, `flatShare` giữ nguyên) →
  mái lô xô, tường hông trần.
- Mặt tiền tầng trệt đổi theo từng ô 3 m; 40 % lô có mái hiên tôn/ngói (`macao.awning`).
- Cờ / băng rôn / cờ dây có sẵn trong vài cột (0, 4, 8, 10, shop 3) → ≈ 20–30 % lô có cờ.

## Đường phố

- **Cây đường phố** (`props.streetTrees`, `Vegetation.placeStreetTrees`): trồng dọc 2 vỉa của primary…residential có vỉa
  ≥ 2,5 m, mỗi 14 m, bỏ trống 30 %, cách mép 1 m, tránh nhà / lòng đường / cây OSM. Cùng InstanceSet 'tree' (không thêm draw call ở
  chunk đã có cây). Gốc **quét vôi** 1,3 m (`graphics8c.trees.whitewash`) ở LOD0/LOD1; vỏ cây tối hơn (sấu / xà cừ).
- **Xe máy đỗ hàng** (`props.motoRows`, `StreetProps.placeMotos`, prop 'moto' ≈ 150 tam giác, chỉ vẽ trong 110 m): hàng 3–8
  xe cách 0,78 m, cách mặt nhà 1 m, đầu xe ra đường, chỉ nơi có mặt tiền phía sau.

## Hiệu năng (headless, chất lượng thấp, `&npc=0`, cùng góc nhìn)

| Góc nhìn | draw call trước → sau | tam giác trước → sau |
|---|---|---|
| Trần Nhân Tông (tây) | 211 → 231 (+9 %) | 500k → 524k (+5 %) |
| Trần Nhân Tông (đông) | 231 → 251 (+9 %) | 554k → 586k (+6 %) |
| Bà Triệu 174–176 | 255 → 273 (+7 %) | 595k → 634k (+7 %) |
| Bà Triệu / Vincom | 258 → 276 (+7 %) | 564k → 604k (+7 %) |
| Hàng Đào | 248 → 266 (+7 %) | 690k → 742k (+8 %) |
| Khương Thượng (ngõ quán cà phê) | 230 → 252 (+10 %) | 560k → 588k (+5 %) |
| KTT Kim Liên | 216 → 231 (+7 %) | 535k → 573k (+7 %) |
| Toàn cảnh xiên Bà Triệu | 285 → 306 (+7 %) | 679k → 716k (+5 %) |

Atlas tường 2048 → 3584 × 1024 px, atlas cửa hàng 1024 → 2048 × 384 px (canvas, không tải thêm file).

## Giới hạn (ponytail)

- Mỗi xe máy cùng một màu (InstancedMesh không có màu theo instance); nâng cấp: `instanceColor` qua attach.ts.
- Chưa có: tường rào + cổng + hàng rào hoa của biệt thự, cổng đình/miếu, góc vát nhà góc, tường gạch trần, cáp điện trên mặt nhà
  (PowerLines chỉ có cột + dây ngang phố), ghế nhựa / quán vỉa hè 3D, biển ngang nhô ra (chỉ có biển vẽ trên mặt tiền).
- "Không trùng hàng xóm" chỉ trong một cạnh của cùng một footprint; hai nhà OSM liền nhau vẫn có thể trùng.
- Lưới che công trình chỉ ở tầng 4 của cột 11.

## Nguồn tham khảo

- Ảnh Street View chủ nhà gửi: Trần Nhân Tông; Bà Triệu 174–176; Bà Triệu (dài).
- https://en.wikipedia.org/wiki/Tube_house – nhà ống: mặt tiền 3–4 m, sâu 10–40 m, nguồn gốc cuối thế kỷ 19, đánh thuế theo mặt tiền.
- https://www.archdaily.com/956220/tube-houses-15-projects-reinterpreting-the-narrow-vietnamese-residences – mặt tiền, lam chớp, ban công đệm nhiệt.
- https://www.rfa.org/english/multimedia/vietnam-tube-house-gallery-06152021164208.html – ảnh nhà ống cũ.
- https://localvietnam.com/hanoi/french-quarter-hanoi/ , https://theculturetrip.com/asia/vietnam/articles/beautiful-examples-of-french-architecture-in-hanoi ,
  https://hanoitimes.vn/old-villas-in-hanoi-an-imprint-of-french-architecture-320668.html – khu phố Pháp: vàng ochre, cửa chớp xanh, ngói đỏ, cửa vòm, lan can.
- https://jackfruitadventure.com/yellow-houses-in-hanoi/ – vì sao nhà Pháp sơn vàng (vôi + ochre rẻ, bền).
- https://arcomai.org/?p=5306 , https://baophapluat.vn/rung-minh-voi-chuong-cop-o-ha-noi-post162638.html ,
  https://vnexpress.net/nhung-chung-cu-doa-sap-giua-thu-do-2103201.html – khu tập thể Kim Liên / Thành Công, "chuồng cọp" cơi nới.
- https://hanoitimes.vn/renovation-of-old-apartment-buildings-must-keep-social-cohesion-experts-318883.html – KTT 1954–1985.

Ảnh trước / sau: `screenshots/hanoi-houses-<góc>-before.png` / `-after.png` (preset `hanoi-houses-*` trong `scripts/screenshot.ts`).
