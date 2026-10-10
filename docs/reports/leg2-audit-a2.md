# Leg 2 – rà soát địa danh a2: nhà thờ và công trình trung tâm

Trạng thái: XONG (2026-10-10), agent a2, nhánh `audit-a2`. Phạm vi: `sao-domingos`, `se-catedral`, `sao-lourenco`,
`santo-agostinho`, `ermida-penha`, `leal-senado`, `largo-senado`, `santa-casa` (code `world/landmarks/m1.ts`, `m2.ts`, khối
cấu hình `landmarks.m1` / `landmarks.m2`).

## Cách làm
- Số liệu `npx tsx scripts/landmark-audit.ts` (spill = đỉnh lưới ≥ 2,5 m trên mặt đất nằm ngoài đường viền OSM > 1,5 m;
  intrude = đỉnh nằm trong khối nhà bên cạnh; float = góc viền mà đỉnh thấp nhất trong 2,5 m cao hơn mặt đất).
- Mặt bằng từng địa danh (script tạm, đã xóa): viền OSM (xanh dương), nhà bên cạnh (xám, kèm chiều cao), đỉnh lưới ≥ 2,5 m
  (xanh lá = trong viền, cam ≤ 1,5 m ngoài, đỏ > 1,5 m ngoài), collider (tím; bậc thang xanh lá).
- Ảnh trong game (script tạm một Vite + một Chrome, cổng 5302, `npc=0`): mỗi địa danh 6–10 góc (vòng 60–120 m, phố tầm mắt
  1,7 m, nhìn thẳng xuống; `time=day` để đọc hình khối, mặc định đêm để xem ánh sáng).
- Ảnh thật trên Wikimedia Commons (chỉ xem trong trình duyệt) cho mọi chỗ đổi hình dáng.
- Tên ảnh: `screenshots/a2-<địa danh>-before-<góc>.png` / `-after-<góc>.png`; mặt bằng `a2-<id>-before.png` /
  `a2-<id>-after.png` (địa danh đã sửa) hoặc `a2-<id>-plan.png` (không sửa). `screenshots/` không commit.

## Số liệu audit trước → sau

| Địa danh | spill (max m, số đỉnh, > 3 m) | intrude | float | tam giác |
|---|---|---|---|---|
| sao-domingos | 1,5 · 12 · 0 → không đổi | – | 7,9 → không đổi (báo giả) | 2 219 → 2 229 |
| se-catedral | 2,1 · 227 · 0 → **–** | 2,1 m · 242 đỉnh (nhà 20 m @243,−29) → **–** | 3,8 → không đổi (báo giả) | 3 012 → 4 648 |
| sao-lourenco | 6,1 · 580 · 280 → **–** | – | – | 1 006 → 1 692 |
| santo-agostinho | 9,6 · 71 · 56 → 2,4 · 15 · 0 (bậc thềm xuống dốc) | 5,3 m · 36 đỉnh (nhà 38 m @−100,100) → **–** | – | 563 → 606 |
| ermida-penha (nhà nguyện) | – | – | – | 310 → 462 |
| ermida-penha (nhà ở giám mục) | 2,7 · 6 · 0 → **–** | – | – | 119 → 132 |
| leal-senado | – | – | 5,2 → không đổi (báo giả) | 2 696 |
| largo-senado | – | – | 0,2 | 4 426 |
| santa-casa | – | – | 1,2 → không đổi (báo giả) | 1 666 |

**Cột float báo giả** ở Domingos / Leal / Sé / Santa Casa: m1 đơn giản hóa đường viền (bỏ khấc < 1 m, Leal 1,3 m) rồi dựng
tường là các tứ giác đứng từ (đất thấp nhất − 0,5 m) dọc viền đã đơn giản; mọi góc OSM nằm cách một bức tường ≤ 0,07 m
(Santa Casa, Sé), 0,97 m (Domingos), 1,6 m (Leal). Công cụ chỉ xét đỉnh lưới trong 2,5 m quanh góc, mà tứ giác tường dài không
có đỉnh ở đó. Ảnh xác nhận: không có khe hở dưới tường.

## Từng địa danh

### Santo Agostinho – ĐÃ SỬA (A, B)
- **Lỗi A:** gian giữa (nave) là một hộp theo khung chữ nhật bao (`facing` = min-area frame), không theo đường viền. Đường viền
  OSM có phần sau (phía bắc) lõm khấc (phòng thánh / phụ) → hộp nave + mái tràn 9,6 m ra ngoài viền, đâm 5,3 m vào nhà 38 m
  bên cạnh (way ở @−100,100), ở phố thì bức tường vàng trùm lên vỉa hè chỗ khấc.
- **Sửa (`m2.ts church()`):** hai đầu nave lùi vào đến khi cả bề ngang nave (trừ phần mái đua 0,6 m) nằm trong viền; phần
  viền còn lại phía sau = một khối phụ mái bằng (`bandOf` + `prismMesh`, cao `wallH − 0,6`). Còn 2,4 m "spill": là bậc thềm
  trước mặt tiền đi xuống dốc (hợp lệ).
- Ảnh: `a2-agostinho-before/after-{nw,n,w,s,e,top,high-top,low-nw,street-nw,street-w}`, đêm `a2-agostinho-after-{s,street}-night`;
  mặt bằng `a2-santo-agostinho-before/after`.

### São Lourenço – ĐÃ SỬA (A, E, C)
- **Lỗi A:** khối mặt tiền + hai tháp dựng theo bề ngang khung bao (≈ 31 m), trong khi mặt tiền thật trong viền OSM là khối nhô
  ra hẹp ≈ 20 m → hai tháp đứng ngoài viền tới 6,1 m (580 đỉnh), trên sân trước / phố.
- **Lỗi E:** tháp đội mái vòm; ảnh thật (Commons `Igreja de São Lourenço.jpg`, `Exterior of Igreja de São Lourenço (Macau),
  2023 (03).jpg`): hai tháp **đỉnh bằng, lan can con tiện, bình trang trí ở góc**, không có vòm.
- **Lỗi C (lộ ra khi sửa, đã chặn):** mặt tiền hẹp lại còn 2 khoang → trụ ốp giữa chạy qua cửa chính; mặt tiền / mặt ngoài tháp
  trùng mặt phẳng với thành bệ (cùng đi từ đáy `yb`, khác màu) → nhấp nháy.
- **Sửa:** khung mặt tiền `g` lấy theo cạnh viền đối diện hướng mặt tiền (`edgeFacing`), mặt tiền + tháp + cửa + bậc theo `g`;
  `cap: 'flat'` mới (lan can + trụ + bình góc); số khoang trụ ốp luôn lẻ (cửa nằm giữa hai trụ); tường nhà thờ đứng trên mặt bệ
  (`yf`) thay vì từ đáy.
- Ảnh: `a2-lourenco-before/after-{front,sw,se,w,back,street,top,night}`, `a2-lourenco-after-street-night`; mặt bằng
  `a2-sao-lourenco-before/after`.

### Ermida da Penha – ĐÃ SỬA (E, A, C)
- **Lỗi E:** `az: 45` biến tường dài 22 m phía đông bắc thành "mặt tiền": nóc mái chạy ngang thân nhà (hồi nằm trên hai tường
  dài), cửa + cửa sổ trên đặt lơ lửng 2,6 m trước tường, cạnh tháp.
  Ảnh thật (Commons `Capela de Nossa Senhora da Penha 2011a.JPG`, `Penha Church 西望洋聖堂 - panoramio.jpg`): mặt tiền là **đầu
  hồi** (hoa hồng, cửa vòm giữa, tượng trên đỉnh hồi), tháp chóp nhọn ở góc phải. Đầu hồi còn trống của đường viền là đầu đông
  nam (đầu tây bắc hẹp, dính nhà ở giám mục).
- **Lỗi A:** mái 4 mái (hipped) của nhà ở giám mục (viền lõm ôm nhà nguyện) bắc một tam giác mái qua khoảng sân giữa hai cánh
  nhà (2,7 m ngoài viền). Nguyên nhân chung ở `parts.ts renderPart`: vùng mỗi mặt mái được cắt từ cả đa giác lõm một lần →
  các mảnh rời bị nối thẳng qua chỗ hở.
- **Lỗi C:** với `nave: 1` mặt ngoài tháp trùng mặt phẳng tường hông → nhấp nháy.
- **Sửa:** `az: 132` (đầu hồi đông nam), 1 tháp: tháp nhô 0,4 m trước đầu hồi, cửa + cửa sổ trên đầu hồi; `nave: 0,96`; khối phụ
  ở đầu tây bắc hẹp (gian cung thánh). `parts.ts`: mặt mái cắt theo từng tam giác của đa giác (lồi → kết quả như cũ).
- Ảnh: `a2-penha-before/after-{ne,se,sw,nw,ne2,e2,n2,court,street,night}`, `a2-penha-after-{front,front-night,e2-night}`;
  mặt bằng `a2-ermida-penha-before/after`.

### Sé Catedral – ĐÃ SỬA (A, E)
- **Lỗi A:** hai tháp vuông sâu 6,5 m sau mặt tiền; sau góc đông viền OSM thụt vào ≈ 4,8 m (giáp Paço Episcopal, nhà 20 m)
  → góc sau tháp đông nằm trong nhà bên cạnh 2,1 m (242 đỉnh, cao 6–23 m).
- **Lỗi E:** tháp có chóp kim tự tháp 3 m + thánh giá; ảnh thật (Commons `Cathedral of the Nativity of Our Lady of Macau,
  2023 (01).jpg`, `Igreja da Sé 2011a.JPG`): tháp **đỉnh bằng có lan can**, không chóp; thánh giá chỉ trên đỉnh hồi giữa.
- **Sửa (`m1.ts seCatedral()`):** độ sâu tháp giảm từng 0,25 m tới khi mặt sau nằm trong viền (tháp đông còn 4,75 m);
  `se.tower.cap: 0` = mái bằng + lan can (`balustrade` sẵn có), `cap > 0` giữ chóp + thánh giá như cũ.
- Ảnh: `a2-se-before/after-{front,ne,e,sw,street,top,night}`; mặt bằng `a2-se-catedral-before/after`.

### Ánh sáng đêm của 3 nhà thờ m2 – ĐÃ SỬA (D)
- **Lỗi D:** cuộc đua chạy ban đêm; công trình m1 (Sé, São Domingos, Teatro…) được "chiếu đèn" (`bakeFlood`), còn 3 nhà thờ m2
  là gạch thường → ban đêm São Lourenço / Santo Agostinho / Penha chỉ là khối tối màu ô liu, khó nhận ra (`a2-lourenco-before-night`).
- **Sửa:** `church()` dùng lại `bakeFlood` của m1 (cấu hình `landmarks.m1.flood`, không thêm khóa mới). Nhà ở giám mục bên Penha
  giữ như nhà thường.
- Ảnh: `a2-lourenco-after-street-night`, `a2-lourenco-after-night`, `a2-agostinho-after-s-night`, `a2-penha-after-front-night`.

### São Domingos – không có lỗi cần sửa
- spill 1,5 m (12 đỉnh) = ban công giữa mặt tiền nhô 1,5 m (hợp lệ); float 7,9 = báo giả (xem trên). Mặt tiền vàng, trụ trắng,
  cửa chớp xanh, trán tường + thánh giá, tháp chuông phía sau: ổn ngày và đêm.
- Ảnh: `a2-domingos-before-{front,sw,w,n,e,street,street-night,night}` (`-wstreet` máy quay kẹt trong nhà, bỏ), `a2-domingos-top`,
  mặt bằng `a2-sao-domingos-plan`.

### Leal Senado – không có lỗi cần sửa
- float 5,2 = báo giả (viền 37 điểm đơn giản còn 19, mọi góc cách tường ≤ 1,6 m). Mặt tiền 2 tầng, trán tường, lan can, cửa vòm,
  bậc thềm; sân trong phía sau hở đúng chỗ khấc của viền. Ban đêm sáng đều, đọc rõ.
- Ảnh: `a2-leal-before-{front,n,e,sw,w,street,night,front-street}`, `a2-leal-top`, mặt bằng `a2-leal-senado-plan`.

### Largo do Senado – không có lỗi cần sửa
- Đá lát sóng đen trắng phủ trên địa hình, đài phun nước + quả cầu đồng: ổn. Ban đêm quả cầu đồng tối (vật liệu đồng, không
  phát sáng) – chỉ là thẩm mỹ, không sửa.
- Ảnh: `a2-largo-before-{a,b,street,night,mid,mid-night,fountain}`.

### Santa Casa da Misericórdia – không có lỗi cần sửa
- float 1,2 = báo giả (góc cách tường ≤ 0,07 m). Mặt tiền trắng hướng Largo, tầng trệt vòm, trán tường: ổn ngày và đêm.
- Ảnh: `a2-casa-before-{n,s,street,street-n,oblique,night}` (`-front` máy quay nằm trong mái nhà khác, bỏ), mặt bằng
  `a2-santa-casa-plan`.

## Thay đổi
- `client/src/world/landmarks/m2.ts` `church()`: khung mặt tiền theo cạnh viền, nave trong viền + khối phụ, `cap: 'flat'`, khoang
  trụ lẻ, tường đứng trên bệ, chiếu đèn `bakeFlood`; 1 tháp: cửa trên đầu hồi.
- `client/src/world/landmarks/m1.ts` `seCatedral()`: độ sâu tháp theo viền, tháp mái bằng + lan can khi `cap: 0`.
- `client/src/world/landmarks/parts.ts` `renderPart()`: mặt mái (gabled / hipped / …) cắt theo từng tam giác của đa giác. File
  dùng chung: với đa giác lồi kết quả y hệt; chạy lại audit cho cả 71 bản ghi chỉ đổi số tam giác (+2…+25 ở Mandarim, Guia,
  Teatro, Domingos, Sé), không đổi spill / intrude của địa danh nào ngoài Penha.
- `client/src/config.ts` (chỉ khối m1 / m2): `m1.se.tower.cap 0`; `m2.churches['sao-lourenco'].cap 'flat'`;
  `m2.churches['ermida-penha'].az 132, nave 0.96`; kiểu `cap` thêm `'flat'`. Nguồn ghi trong chú thích.
- Test: `m1.test.ts` – Sé, Domingos, Santa Casa, Leal trên viền thật: không đỉnh nào ≥ 2,5 m ra ngoài viền > 1,6 m;
  `m2.test.ts` – São Lourenço, Santo Agostinho, Penha (cả nhà ở) trên viền thật: không ra ngoài > 1,5 m; mặt tiền Penha là đầu hồi;
  chiều cao tháp `'flat'`. Đã kiểm: các test mới **trượt** với code cũ (Sé 2,07 m; Lourenço / Agostinho / Penha).

## Kiểm tra
- `npx tsc --noEmit -p client`: sạch.
- `npx vitest run --dir client/src/world`: 24 file, 213 test xanh (landmarks 123, trong đó `paths.test.ts` không đổi, xanh).
- `npx tsx scripts/landmark-audit.ts`: bảng trên.

## Còn mở / cần anh quyết
1. **Santo Agostinho cao hơn Largo ≈ 4,6 m:** sàn = điểm DEM cao nhất trong viền + 0,4 m (cách của bản sửa H2/M1), DEM làm dốc
   4,2 m qua nhà thờ → mặt tiền có 24 bậc. Thật nhà thờ gần ngang Largo. Không đổi vì cần cao độ thật; nếu anh muốn hạ sàn thì báo.
2. Nhà ở giám mục bên Penha vẫn tối ban đêm (chỉ nhà nguyện được chiếu đèn).
3. Đèn chiếu "nướng" vào màu làm 3 nhà thờ m2 sáng đều cả ban ngày (như m1, đã chấp nhận vì đua ban đêm).
4. Chi tiết không sửa: Sé thật có 3 cửa vòm + đồng hồ tháp phải, São Lourenço có đồng hồ tháp trái; ta 1 cửa chính, không đồng hồ.
5. `parts.ts` là file dùng chung: nếu agent khác cũng sửa `renderPart` thì cần gộp tay đoạn mặt mái.
6. Công cụ audit: cột `float` nên lấy mẫu dọc cạnh lưới thay vì chỉ đỉnh gần góc (báo giả với tường dựng trên viền đã đơn giản).
