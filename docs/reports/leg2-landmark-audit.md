# Leg 2 – G4: rà hình dáng địa danh theo ảnh thật

Trạng thái: XONG (2026-10-06). Agent Opus. Không đụng Grand Lisboa, Hotel Lisboa, MGM, Ruínas.
Ảnh tham khảo: Wikimedia Commons (chỉ xem trong trình duyệt, không tải vào repo). Ảnh của ta: `screenshots/` (không commit),
chụp ban ngày (`?time=day`, offline) để so hình khối, Sands có thêm ảnh đêm. Chỉ các địa danh đã sửa có cặp
`screenshots/lmaudit-<id>-before.png` / `-after.png` (cùng góc máy).

Cách chụp cận: script tạm `.cache/g4/shot.ts` (gitignored, không thuộc repo): một Vite + một Chrome, camera quanh tâm
địa danh (hoặc điểm `w<x>,<z>` / `lat,lon`) theo phương vị / khoảng cách / góc ngẩng; `?npc=0&time=day`.

| Địa danh | Ảnh tham khảo (Commons) | Kết luận | Thay đổi |
|---|---|---|---|
| Santo Agostinho | `File:Igreja de Santo Agostinho (Macau) 01.JPG` | OK | Mặt tiền vàng kem, gờ trắng, trán tường tam giác phủ cả mặt tiền, cửa xanh: khớp. Cửa sổ là ô sáng (đêm), bỏ qua. |
| Fortaleza do Monte | `File:Walls of Monte Fort in Macau.jpg`, `File:FortalegoDoMonte.jpg` | Đã sửa (màu) | Tường thành thật là đá xám sẫm phong hóa, ta để be sáng → `landmarks.m2.monte.colours.wall/top` `#8e877a` / `#7d776b`. Hình khối (tường nghiêng, lỗ châu mai, súng, bảo tàng trên sân) giữ nguyên. |
| Santa Casa da Misericórdia | `File:Santa Casa Da Misericordia (219154217).jpeg`, `File:Senado Macao.jpg` | OK | Trắng, tầng trệt vòm, cửa sổ tầng trên, trán tường: khớp. |
| Teatro Dom Pedro V | `File:Teatro Don Pedro V, Macao, 2013-08-08, DD 01.jpg` / `DD 02.jpg` | OK | Xanh lục nhạt + trắng, mái nâu, cổng cột: khớp ở mức nhìn trong cuộc đua (công trình nằm kẹt giữa nhà cao, khó chụp chính diện). |
| Macao Cultural Centre | `File:Macao Cultural Center 2011.JPG` | Đã sửa (màu) | Ốp đá xám nâu thật, ta gần như trắng → `landmarks.m4.cultural.colours.stone` `#a1998d`. Mái "cánh buồm" vểnh lên giữ nguyên (thật là mặt cong lõm; phẳng nghiêng vẫn đọc được là cánh). |
| Tượng Kun Iam | `File:MC 澳門 Macau 觀音蓮花苑 … March 2019 IX2 01/02/14/53.jpg`, `File:Kun Iam Statue Panorama.jpg` | Đã sửa (màu) | Thật: tượng đồng nâu trên vòm sen TRẮNG; ta để cả hai vàng óng → `landmarks.m4.kunIam.colours` statue `#a88b5e`, base `#e4e1d9`. Hình (vòm 16 cánh, tượng 20 m, đảo + cầu) giữ nguyên. |
| Praça Flor de Lótus | `File:Macau,China-LotusSquare.png` | OK | Sen vàng trên ba tầng đá đỏ: khớp. Hoa hơi nhỏ so với bệ (ghi nhận, không sửa). |
| Portas do Cerco | `File:Brána obležení, Macao.jpg` | Đã sửa (cổng) | Hai cánh tường hai bên cổng thật vuốt cong xuống thấp dần (như trụ chống), ta là khối chữ nhật phẳng → `gate()` trong m4.ts đùn biên dạng cong lõm từ `portas.gate.wing` (4,8 m sát cổng) xuống `wingEnd` 0,9 m ở đầu ngoài. Collider cánh giữ như cũ (lăng trụ tới 4,8 m, nằm trong đường viền OSM). Trạm cửa khẩu 2004: giữ. |
| Casa do Mandarim | `File:Mandarin's House, 2023 (06).jpg` | OK | Cụm nhà mái ngói xám sẫm, sân trong, tường xám: khớp ở mức nhìn từ trên / từ ngõ. |
| Sands Macao | `File:Casino Sands, Macao, 2013-08-08, DD 01.jpg` | Đã sửa (hình khối) | Trước: một khối kính vàng dài + một trụ tròn 61,8 m của OSM (way/1418312721) không thuộc địa danh nên dựng kiểu nhà thường (cửa sổ). Thật: **trụ kính vàng** đội **"mũ" nhiều tầng** (vành đĩa rộng + tầng nhỏ + đỉnh), hai bên là khối kính **xanh đen** có sọc vàng. Sửa: đăng ký way/1418312721 vào `sands-macau` (registry + `build-chunks`, chỉ đổi `6_0.json` + `index.json`); bản ghi tròn (< `drum.maxArea` m²) = trụ vàng (bán kính khớp đường viền) + vương miện `drum.crown` (đỉnh = 61,8 m OSM), bản ghi lớn = cánh kính tối `dark` cao `bodyShare` 0,85 × 46,7 m, cắt ở tâm trụ (`drum.z`, tránh z-fighting), gân vàng + viền sáng + biển SANDS đỏ trên mái cánh. |
| Templo de A-Ma | `File:A Ma Temple 200907.jpg` | OK | Cổng đá + mái ngói xanh trên quảng trường lát sóng, các đình leo đồi sau lưng: khớp. |
| Ermida da Penha | `File:Capela de Nossa Senhora da Penha 2011a.JPG` | Đã sửa | Thật: đá granite xám, tháp chuông chóp nhọn ở **góc phải** mặt tiền; ta: trắng, tháp giữa. Sửa: màu `wall/trim` `#a9a59b` / `#c8c4ba`; khóa mới `side` (tùy chọn) trong cấu hình nhà thờ m2: 1 tháp lệch sang mép (`side: -1` = bên phải nhìn từ trước), cửa + cửa sổ trên dời sang phần mặt tiền còn lại. Các nhà thờ khác không đổi (không có `side`). |
| Macau Tower | `File:Macau Tower CE Centre.jpg` | OK | Thân bê tông thon, đài quan sát nhiều tầng, cột ăng-ten: khớp. Vạch sáng tím trên đài là đèn trang trí, giữ. |
| Macau Science Center | `File:Centro de Ciencia, Macao, 2013-08-08, DD 11.jpg` | Đã sửa (hình khối) | Thật: **nón xiên** (một bên gần thẳng đứng), mặt cắt đỉnh **dốc mạnh**; ta: nón thẳng đối xứng, đỉnh gần phẳng (11°). Sửa trong `science()` (mf1.ts): trục nón nghiêng `cone.lean` 0,3 m/m về phía ngược `lowAz`, mặt cắt đi qua trục ở `h`, `tiltDeg` 11 → 30; dải xoắn sáng theo trục nghiêng. Nón vẫn nằm trong vòng tròn chân (collider giữ). Đỉnh cao nhất ≈ 62 m (ước lượng). |

## Kiểm tra
- `npx vitest run --root client src/world/landmarks`: 112/112 (thêm ca "Sands drum + crown": đỉnh vương miện = 61,8 m OSM;
  ca này bỏ khỏi kiểm tra "nằm trong đường viền" vì vành mũ chìa ra ngoài thân trụ như ảnh thật). `paths.test.ts` xanh.
- `npm run build` thoát 0 (kể cả `wrangler deploy --dry-run`), `npm test` xanh (scripts 110, shared 68, client 816, worker 156).

## Ước lượng / còn mở
- Tỉ lệ vương miện Sands (`drum.crown`), `bodyShare`, độ nghiêng nón Science Center, độ cong cánh Portas: ước lượng từ ảnh.
- Mái Cultural Centre vẫn là mặt phẳng nghiêng (thật cong lõm); hoa sen Lótus hơi nhỏ so với bệ; nhà hát Dom Pedro V khó
  thấy chính diện vì nhà cao xung quanh (do OSM, không phải hình địa danh).
- Ảnh nháp `screenshots/g4b-*`, `g4c-*`, `g4d-*`, `g4e-*` là ảnh tạm (gitignored), có thể xóa.
