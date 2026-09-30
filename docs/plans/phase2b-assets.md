# Phase 2B + 4B + 3: quyết định asset (chờ anh duyệt)

Ngày 2026-09-28. **Mới chỉ nghiên cứu, chưa tải file nào.** Giấy phép và việc tải không cần tài khoản của mọi mô hình trong mục 2–3 đã được kiểm lại hôm nay trên trang gốc: JSON trang Poly Pizza, Zenodo API, Wikimedia API, OpenGameArt, itch.io, quaternius.com, cùng HTTP HEAD để lấy dung lượng.

Ký hiệu: **A** = dữ liệu 3D của OSM (`building:part`, `height`, `min_height`, `roof:*`, màu). **B** = dựng chi tiết bằng code. **C** = mô hình tải về. Điểm OSM từ 0 đến 5 cho biết dữ liệu 3D đủ tới đâu (theo audit `.cache/osm`).

## 0. Anh cần quyết

1. **Duyệt danh sách tải** ở mục 2 và 3 (bắt buộc / tùy chọn).
2. **Bản sao không cần tài khoản của mô hình Sketchfab CC-BY** (Zenodo, Hugging Face Objaverse): có được dùng không? Giấy phép CC-BY cho phép phân phối lại nên các bản sao này hợp lệ, và vẫn ghi công tác giả gốc. Khải Hoàn Môn (mục 2, số 2) chính là bản sao trên Zenodo (trang ghi "Source: Objaverse 1.0 / Sketchfab"). Nếu anh không đồng ý, Khải Hoàn Môn chuyển sang A + B.
3. **Thân nhân vật người chơi:**
   - **(a)** Universal Base Characters (khoảng 122 MB zip, rig khớp sẵn thư viện animation). Đề xuất chọn cách này.
   - **(b)** Nhân vật Modular "Casual" (đã có trong danh sách NPC, không phải tải thêm, nhưng phải retarget animation).
4. **Microsoft Rocketbox** (người rất chân thực, 417 animation) dùng giấy phép MIT, không thuộc CC0/CC-BY, nên em **không đề xuất**, trừ khi anh cho phép thêm MIT. *(Cập nhật 2026-09-30: anh đã duyệt Rocketbox cho người đi đường NPC, xem SPEC §17.11.)*

## 1. Bảng quyết định từng địa danh

| # | Địa danh | OSM | Cách dựng | Lý do / việc chính |
|---|---|---|---|---|
| 1 | Tháp Eiffel | 3/5 | **C** + B + A (chỉ lấy số) | Mô hình lưới thép (mục 2, số 1) đẹp hơn loft hiện có. A: độ cao các sàn 57,63 / 115,73 / 276,13 / 300 / 330 m. B: collider 4 chân + sàn, sân dưới tháp đi bộ được (§17.4), thang máy, màu đồng. **Không** đùn các part (khối đặc sẽ bịt sân dưới tháp). |
| 2 | Palais de Chaillot / Trocadéro | 3/5 khối, 1/5 chi tiết | A + B | Outline r6826569 h30 cho đúng 2 cánh cong. B: sân Parvis nâng giữa 2 cánh, bậc cao thấp của các lầu, hàng cột, tượng đồng mạ vàng, đài phun Trocadéro, vườn dốc. Chiều cao đo trên LiDAR HD. |
| 3 | Cầu Bir-Hakeim (2 tầng) | 2/5 | B | Chỉ có polygon cầu w183602168, đường layer 1 và cầu cạn metro w371959822 layer 2. B: mặt đường dưới, cầu cạn metro trên với hàng cột gang, trụ vòm đá, trụ Île aux Cygnes, tượng n3610838785. |
| 4 | Khải Hoàn Môn | 4/5 | **C** + A + B | Photogrammetry HoangHiepVu (mục 2, số 2), phù điêu thật. Mô hình thiếu mặt trên (chụp từ mặt đất) nên B đắp mái bằng. A (15 part: trụ, lỗ vòm theo `min_height`) làm collider và LOD xa. B: Mộ Chiến sĩ Vô danh + ngọn lửa. Không có C thì B dựng cung vòm tròn trên nền A. |
| 5 | Concorde + obelisk | obelisk 3/5, đài phun 1/5 | A + B | A: 7 part (thân + chóp vàng `roof:material=gold`). B: bệ đá (part thiếu, chúng bắt đầu từ 0), thân vuốt 22,8 m, chóp vàng; 2 đài phun w72937684/85 dựng bằng lathe; 8 tượng thành phố (area); cột đèn rostral (node). |
| 6 | Grand Palais | 3/5 | A + B | 8 part rất cần: vòm kính hình thùng 25–42 m, vòm kính 50 m. Outline không có chiều cao nên hiện đang dùng mặc định. B: kính + gân thép, đèn lồng + cột cờ, 4 cỗ xe quadriga ở góc, mặt đá có hàng cột. Hướng vòm suy từ trục dài polygon (thiếu `roof:direction`). |
| 7 | Cầu Alexandre III | 2/5 (vị trí trang trí 5/5) | B | B: vòm thép phẳng, lan can, 4 trụ đầu cầu (thay cho nhà Haussmann tí hon hiện tại), tượng Renommée/Pegasus mạ vàng dạng proxy tại các node có `min_height=17`, cột đèn "Amours" + 16 đèn instanced tại node. |
| 8 | Vòm Invalides | 4/5 | A + B | 51 part tới 100 m (vòm vàng 48,1–72, đèn lồng, chóp nhọn vàng, 12 cột). B: gân vòm, trophy mạ vàng, cửa mái. Hôtel des Invalides (2/5): A + mái dựng bằng B. |
| 9 | Bảo tàng Orsay | 2/5 | A + B | Chỉ có outline h35, 0 part. B: vòm kính-sắt dọc trục dài, 2 lầu đồng hồ phía sông, mái mansard nhiều bậc, vòm mặt tiền. Mặt cắt mái đo trên LiDAR HD. |
| 10 | Louvre + kim tự tháp | Louvre 2/5, kim tự tháp 4/5 | A + B | Louvre có 26 part với `roof:shape`/`roof:material` nhưng **không part nào có chiều cao**, nên B cần bảng chiều cao theo từng cánh (đo LiDAR). Kim tự tháp w375076234 đúng kích thước (h21,65, cạnh ≈ 35 m); B dựng hình chóp + lưới thép kính. Mái kính các sân (building=roof) chỉ dựng thành mặt mái, không đùn thành khối 5 tầng. |
| 11 | Nhà thờ Đức Bà | 4/5 | A + B | 82 part có chiều cao: 2 tháp chuông 69 m, mái chì mới #D0D0D0, chóp nhọn 96 m (đúng bản phục dựng). **Outline h10,5 hiện đang dựng thành một tấm phẳng.** B: trụ bay, cửa sổ hoa hồng + cổng (decal), lỗ chuông, lưới chóp nhọn, con gà trống. Không mô hình miễn phí nào dùng được (trước vụ cháy, sai giấy phép hoặc thiếu phần). |
| 12 | Petit Palais | 1/5 | B (+A footprint) | 0 part. B: vòm giữa trên cổng, hàng cột Ionic, cao ≈ 20 m (LiDAR), mái đá phiến/kính. |
| 13 | Madeleine | 4/5 | A + B | 63 part, trong đó 54 cột. B: cột tròn (renderer `building:part=column`), bậc thềm, phù điêu trán tường. |
| 14 | Opéra Garnier | 3/5 | A + B | 11 part (vòm đồng, tháp sân khấu). Bỏ outline h70 khi đã có part. B: tượng mạ vàng, loggia, đồng chuyển màu xanh verdigris. |
| 15 | Cột Vendôme | 3/5 | B | Outline vừa building vừa building:part, **hiện đang dựng thành khối Haussmann cao 44 m**. B: cột tiện (lathe) 44,3 m, phù điêu xoắn bằng normal map, bệ, tượng dạng silhouette. |
| 16 | Arc du Carrousel | 4/5 | A + B | 56 part (8 cột, lỗ vòm theo `min_height`). B: cung vòm tròn, cỗ quadriga trên đỉnh. |
| 17 | Palais Bourbon | 4/5 | A + B | 81 part, 38 cột. B: trán tường, bậc, tượng. |
| 18 | Pont Neuf | 2/5 | B | B (dùng `BridgeBuilder`): 12 vòm đá, trụ + mũi chắn, bao lơn bán nguyệt, mascaron, tượng Henri IV. |
| 19 | Pont des Arts | 2/5 | B | 7 vòm gang, trụ đá, sàn gỗ, lan can. |
| 20 | Sainte-Chapelle | 4/5 | A + B | 18 part, chóp nhọn 75 m. B: trụ ốp giữa các cửa sổ, cửa sổ hoa hồng, hiên. |
| 21 | Conciergerie | 4/5 | A + B | Nằm trong Palais de Justice r536982 (288 part): các tháp mái nón César, Argent, Bonbec, Horloge. B: lỗ châu mai, mặt đồng hồ, cửa sổ Gothic. |
| 22 | Hôtel de Ville | 2/5 | A + B | 25 part chỉ có số tầng, nên chiều cao = số tầng × 4 m. B: tháp chuông giữa + đồng hồ, mái dốc ở các lầu góc, cửa mái. |
| 23 | Centre Pompidou | 3/5 khối, 1/5 đặc trưng | A + B | Khối hộp h42 đúng. B: khung thép bên ngoài, ống màu xanh dương/xanh lá/vàng/đỏ, ống thang cuốn. |
| 24 | Tháp Saint-Jacques | 2/5 | A + B | Lăng trụ h52. B: tháp nhọn ở góc, tượng, tháp cầu thang. |
| 25 | Palais-Royal | 2/5 | A + B | h30, 2 part. B: hành lang vòm quanh vườn, mái mansard. Cột Buren (area w244102108) đùn thành trụ thấp instanced. |
| 26 | Cầu Alma + Ngọn lửa Tự do | 2/5, 1/5 | B | Mặt cầu thép, tượng Zouave (node). Ngọn lửa w92316094: lửa vàng 3,5 m trên bệ đen (lathe + displacement). |
| 27 | Palais de Tokyo | 2/5 | A + B | 23 part chỉ có tag mái. B: hàng cột nối 2 cánh, bậc thang xuống kè. Chiều cao đo LiDAR (địa hình dốc). |
| 28 | Bảo tàng Rodin (Hôtel Biron) | 2/5 | A + B | 3 tầng, mái hông/mansard đá phiến. Tượng (Le Penseur…) dựng khối đơn giản tại node. |
| 29 | École Militaire | 4/5 | A + B | 235 part (mái, vòm vuông, 24 cột). B: trán tường, đồng hồ. |
| 30 | Saint-Sulpice | 4/5 | A + B | 93 part, 2 tháp lệch nhau 70,3 / 66,4 m. **Outline 3 tầng hiện đang dựng thành khối thấp.** B: lan can tháp, hàng cột 2 tầng. |
| 31 | Panthéon | 4/5 | A + B | 75 part: vòm tới 74,5 m, đèn lồng tới 90 m, 48 cột. B: trán tường, bậc. |
| 32 | Palais du Luxembourg | 4/5 | A + B | 86 part. Mái `quadruple_saltbox` dựng như mái hông. |
| S1 | Sacré-Cœur (chân trời) | ngoài bbox | B | Silhouette trắng (các vòm + tháp chuông), chỉ nhìn từ xa. |
| S2 | Tháp Montparnasse | ngoài bbox | B | Lăng trụ tối 210 m, góc bo. |
| S3 | La Défense | ngoài bbox | A + B | Truy vấn Overpass nhỏ lấy chiều cao các tháp, đùn thành silhouette trong sương. Grande Arche = khối hộp rỗng. |

## 2. Danh sách tải về: địa danh (chờ anh duyệt)

Bản gốc lưu ở `.cache/assets/` (gitignored). Chỉ commit bản đã xử lý vào `client/public/models/`.

| # | Tên file | Trang nguồn | Link file | Định dạng | MB | Tam giác | Giấy phép + tác giả | Dòng ghi nguồn trong game | Dùng cho |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `eiffel_scott-marshall.glb` | https://poly.pizza/m/aIpJchqtRTg | https://static.poly.pizza/95771d85-7ef5-4bbb-8d22-4baa2820396b.glb | GLB | 3,18 | 56 999 | CC-BY 3.0, Scott Marshall | Tháp Eiffel: "SM - EIffel Tower" – Scott Marshall, CC BY 3.0, qua Poly Pizza (đã chỉnh sửa) | Mesh tháp Eiffel (lưới thép, 4 vòm). Việc cần làm: scale 330 m, pivot tâm đế, màu đồng, collider hộp. Chất lượng 3/5, không texture. |
| 2 | `arc-triomphe_hoanghiepvu.glb` | https://zenodo.org/records/10229368 (bản gốc https://sketchfab.com/3d-models/f5096afb1a3345e2bf1a82231d9f89c4) | https://zenodo.org/records/10229368/files/f5096afb1a3345e2bf1a82231d9f89c4.glb?download=1 | GLB + texture 8K | 41,92 | 1 098 347 | CC BY 4.0, HoangHiepVu (kiểm trên cả Zenodo và Sketchfab API) | Khải Hoàn Môn: "Arc de Triomphe, Paris (with texture)" – HoangHiepVu, CC BY 4.0 (đã chỉnh sửa) | Mesh gần của Khải Hoàn Môn. Việc cần làm: giảm còn ≤ 150k tam giác, texture 2K–4K, cắt nền, đắp mái, scale 50 × 45 × 22 m, xoay theo polygon OSM. Sau xử lý ≈ 5–8 MB. Chất lượng 4/5. |

**Tổng bắt buộc: 2 file, 45,10 MB tải về** (khoảng 7–10 MB sau xử lý).

Tùy chọn (không bắt buộc):

| # | Tên file | Trang nguồn | Link file | Định dạng | MB | Tam giác | Giấy phép + tác giả | Dùng cho |
|---|---|---|---|---|---|---|---|---|
| 2a | `arc-triomphe_microsoft.stl` | https://commons.wikimedia.org/wiki/File:Arc_de_Triomphe.stl | https://upload.wikimedia.org/wikipedia/commons/e/ee/Arc_de_Triomphe.stl | STL | 0,96 | 19 252 | CC BY 4.0, Microsoft | LOD xa / collider nếu bản giảm tam giác của số 2 bị nhiễu. A (15 part) thường đã đủ. |
| 1a | `eiffel_johnson-martin.glb` | https://sketchfab.com/3d-models/6830e60d2c1048f2a33e92679664f652 (bản sao Objaverse, `gated: false`) | https://huggingface.co/datasets/allenai/objaverse/resolve/main/glbs/000-056/6830e60d2c1048f2a33e92679664f652.glb | GLB | 17,36 | 453 421 | CC BY 4.0, Johnson-Martin | So sánh với số 1. Có thể làm LOD gần (lưới dày hơn). Không rõ nguồn gốc vì trang không có mô tả. Chỉ tải nếu anh đồng ý dùng bản sao (mục 0.2). |

## 3. Asset NPC, nhân vật người chơi và xe đạp (chờ anh duyệt)

### 3.1 Xe NPC (Phase 4B)

Cả 8 file đều không có logo hay tên hãng.

| # | Tên file | Trang nguồn | Link file | Định dạng | MB | Tam giác | Giấy phép + tác giả | Dùng cho |
|---|---|---|---|---|---|---|---|---|
| 3 | `free_low_poly_vehicles_pack_by_rgsdev.zip` | https://opengameart.org/content/free-low-poly-vehicles-pack | https://opengameart.org/sites/default/files/free_low_poly_vehicles_pack_by_rgsdev.zip | zip, trang không ghi định dạng (có lẽ FBX, cần kiểm) | 1,44 | không ghi (low poly) | CC0, rgsdev | Bộ chính: hatchback, sedan, taxi, van, xe tải, xe buýt. Bánh xe tách rời, màu tách theo material. Bỏ xe cảnh sát kiểu Mỹ và monster truck. |
| 4 | `car-sedan-1_quaternius.glb` | https://poly.pizza/m/unqqkULtRU | https://static.poly.pizza/d35173c8-6078-4367-8f87-b1f2599f0bb7.glb | GLB | 0,17 | 2 274 | CC0 1.0, Quaternius | Thêm kiểu dáng sedan |
| 5 | `car-sedan-2_quaternius.glb` | https://poly.pizza/m/Cz6yDaUcM9 | https://static.poly.pizza/59a67a6c-490e-472e-bae6-5a4d2541f1c7.glb | GLB | 0,16 | 2 102 | CC0 1.0, Quaternius | Sedan |
| 6 | `suv_quaternius.glb` | https://poly.pizza/m/xsMtZhBkxL | https://static.poly.pizza/e5fbf2ee-5c9e-47d5-8ab6-80cacd463baa.glb | GLB | 0,18 | 2 444 | CC0 1.0, Quaternius | SUV |
| 7 | `taxi_quaternius.glb` | https://poly.pizza/m/x43lOScTpN | https://static.poly.pizza/3622a7bf-f213-44c8-8949-c1bdd1e961a9.glb | GLB | 0,18 | 2 426 | CC0 1.0, Quaternius | Taxi: đổi thân vàng kiểu New York sang màu taxi Paris, biển "TAXI" chung chung |
| 8 | `truck-delivery_quaternius.glb` | https://poly.pizza/m/cXw6oiFtZ8 | https://static.poly.pizza/f4b28921-b45e-4653-b54c-c3976e4ea0fe.glb | GLB | 0,33 | 5 546 | CC0 1.0, Quaternius | Xe tải giao hàng |
| 9 | `scooter_poly-by-google.glb` | https://poly.pizza/m/fPLXByG4Vx5 | https://static.poly.pizza/7956c687-8fc7-478f-8baa-3e2eea9f5a0a.glb | GLB | 0,12 | 2 674 | CC-BY 3.0, Poly by Google | Xe tay ga. Ghi nguồn: "Scooter" – Poly by Google, CC BY 3.0, qua Poly Pizza |
| 10 | `motorcycle_jeremy.glb` | https://poly.pizza/m/0lBe-ApqJs4 | https://static.poly.pizza/7d230a92-464a-4d1c-874e-712240e2db20.glb | GLB | 0,11 | 1 934 | CC-BY 3.0, jeremy | Xe máy. Ghi nguồn: "Motorcycle" – jeremy, CC BY 3.0, qua Poly Pizza |

Tổng 3.1: **8 file, 2,69 MB**. Xe không cần animation, bánh xe quay bằng code. Bánh xe của các mẫu Quaternius có lẽ dính liền thân, cần kiểm sau khi tải.

### 3.2 Người đi đường (Phase 4B)

Bộ Quaternius "Ultimate Modular Men/Women" (2022). Mỗi GLB có 24 animation kèm theo, nhưng **tên các clip chưa được công bố**: có lẽ có Idle, Walk, Run; ngồi thì chưa chắc. Cần kiểm sau khi tải. Các bộ phận đầu, thân, chân, giày là mesh riêng, nên có thể ghép lẫn và đổi màu áo để có nhiều biến thể.

| # | Tên file | Trang nguồn | Link file | MB | Tam giác | Giấy phép + tác giả |
|---|---|---|---|---|---|---|
| 11 | `ped-man-casual_quaternius.glb` | https://poly.pizza/m/kZ3DmIoGip | https://static.poly.pizza/90a9e2d4-053f-42f1-99a2-8f5e1180ea7f.glb | 1,43 | 3 350 | CC0 1.0, Quaternius |
| 12 | `ped-man-hoodie_quaternius.glb` | https://poly.pizza/m/gKLBoRsyKe | https://static.poly.pizza/bcd66ec5-5e81-4901-a222-47abc875fe2a.glb | 1,46 | 4 318 | CC0 1.0, Quaternius |
| 13 | `ped-man-business_quaternius.glb` | https://poly.pizza/m/JFrLIKqvCH | https://static.poly.pizza/e599abbe-7d73-488c-9d7e-3ead281e705c.glb | 1,53 | 4 162 | CC0 1.0, Quaternius |
| 14 | `ped-man-punk_quaternius.glb` | https://poly.pizza/m/BTALZymknF | https://static.poly.pizza/e56f23b5-3270-406f-8924-f77cad980c43.glb | 1,37 | 3 530 | CC0 1.0, Quaternius |
| 15 | `ped-woman-casual_quaternius.glb` | https://poly.pizza/m/qJ2gsTUBHL | https://static.poly.pizza/ba7a1955-ea51-4cb9-a561-188bdef0a6c7.glb | 1,53 | 3 410 | CC0 1.0, Quaternius |
| 16 | `ped-woman-dress_quaternius.glb` | https://poly.pizza/m/nIItLV9nxS | https://static.poly.pizza/46d6db5a-3c9f-4238-8cdf-8eb7194498dc.glb | 1,49 | 3 282 | CC0 1.0, Quaternius |
| 17 | `ped-woman-punk_quaternius.glb` | https://poly.pizza/m/djXoqejw6w | https://static.poly.pizza/1d368679-1d9a-4d5c-9095-877144b02d00.glb | 1,47 | 3 850 | CC0 1.0, Quaternius |
| 18 | `ped-woman-suit_quaternius.glb` | https://poly.pizza/m/sOUciDsoVV | https://static.poly.pizza/1bd7759c-ab76-4178-8fe6-7706dffa7d5f.glb | 1,54 | 3 956 | **CC-BY 3.0** trên Poly Pizza (trang Quaternius ghi CC0), Quaternius. Ghi nguồn: "Suit" – Quaternius, CC BY 3.0 |

Tổng 3.2: **8 file, 11,82 MB**. Phần lớn dung lượng là animation. Khi xử lý chỉ giữ một bộ clip dùng chung cho mọi nhân vật (nếu cùng skeleton), nên còn khoảng 3 MB.

Tùy chọn: đám đông / LOD xa. Bộ Quaternius "Animated Men/Women" (2019), CC0, khoảng 1,2k tam giác, chỉ cần khi FPS đo được thấp:

| # | Tên file | Trang nguồn | Link file | MB |
|---|---|---|---|---|
| 19a | `crowd-man_quaternius.glb` | https://poly.pizza/m/HMnuH5geEG | https://static.poly.pizza/3746be88-6799-4817-929b-6bc067c47caa.glb | 0,49 (1 216 tam giác) |
| 19b | `crowd-man-longsleeve_quaternius.glb` | https://poly.pizza/m/fjHyMd5Wxw | https://static.poly.pizza/985eacbf-9dde-44b7-9270-4e35c8400b13.glb | 0,50 |
| 19c | `crowd-man-suit_quaternius.glb` | https://poly.pizza/m/mQnGoME1ez | https://static.poly.pizza/66b57880-bcb0-479a-8d72-5c3e88afaa39.glb | 0,58 |
| 19d | `crowd-woman-casual_quaternius.glb` | https://poly.pizza/m/jpKRgGDxhk | https://static.poly.pizza/51d5abdd-bb87-4b8d-9967-21738ffb8437.glb | 0,59 |
| 19e | `crowd-woman-dress_quaternius.glb` | https://poly.pizza/m/zMyPlQXBzq | https://static.poly.pizza/a642af96-e239-4c5f-b50d-7661ff51deec.glb | 0,48 |
| 19f | `crowd-woman-tanktop_quaternius.glb` | https://poly.pizza/m/XqzeZGB7iU | https://static.poly.pizza/9a6a3e55-23ce-4d5c-89bc-7d3f30307ed0.glb | 0,54 |

Tổng tùy chọn 3.2: 6 file, 3,18 MB. Cả 6 file đều CC0 1.0 (Quaternius).

### 3.3 Nhân vật người chơi (Phase 3)

| # | Tên file | Trang nguồn | Link file | Định dạng | MB | Tam giác | Giấy phép + tác giả | Dùng cho |
|---|---|---|---|---|---|---|---|---|
| 20 | `universal_animation_librarystandard.zip` | https://opengameart.org/content/universal-animation-library (cũng có trên https://quaternius.itch.io/universal-animation-library, "name your own price", có nút "No thanks, just take me to the downloads") | https://opengameart.org/sites/default/files/universal_animation_librarystandard.zip | GLB + FBX (có bản root-motion và in-place) | 14,54 | – (animation) | CC0, Quaternius. Trang itch ghi "Creative Commons Zero v1.0 Universal" | Bộ clip cho người chơi (bảng dưới). Chỉ giữ khoảng 15 clip cần dùng. |
| 21 | `Universal Base Characters[Standard].zip` | https://quaternius.itch.io/universal-base-characters | nút "Download Now" → "No thanks, just take me to the downloads" (link sinh bằng JS, không có URL cố định) | FBX, glTF, OBJ | ≈ 122 (theo nghiên cứu trước, không HEAD được) | ≈ 13 000 | CC0, Quaternius. Trang itch ghi "Creative Commons Zero v1.0 Universal" | Thân người chơi, rig khớp sẵn UAL nên không phải retarget. Quần áo cơ bản màu đen: màu áo đội tô bằng mask vùng thân (hoặc thêm mesh áo thun). Trong zip chỉ dùng 1 GLB vài MB. **Phương án (b)** thay cho file này: dùng số 11 (Casual, áo là mesh riêng nên tô màu dễ) + retarget clip UAL bằng `SkeletonUtils.retargetClip`. |

Animation theo SPEC §5 và §17.2:

| Thao tác | Clip UAL Standard (miễn phí) | Trạng thái |
|---|---|---|
| idle | `Idle` | có |
| walk (đi chậm) | `Walk`, `Walk_Formal` | có |
| jog (đi chuẩn) | `Jog_Fwd` (+ `Sprint`) | có, chỉ hướng tiến. Các hướng khác nằm ở bản trả phí nên xoay người theo hướng đi (kiểu GTA). |
| jump | `Jump_Start`, `Jump`, `Jump_Land` | có |
| fall | `Jump` (vòng lặp trên không) | tạm dùng, vì clip rơi của UAL2 là bản trả phí |
| swim | `Swim_Idle`, `Swim_Fwd` | có |
| đạp xe | – | **THIẾU**, không có clip miễn phí nào. B: tư thế ngồi `Driving` + IK 2 xương cho chân theo góc crank. |
| ngã xe | – | **THIẾU**. B: `Hit_Chest` → `Death01` → blend về `Idle`. |
| mở hộp mật thư | `Interact`, `PickUp_Table`, `Fixing_Kneeling` | có |
| ăn mừng | `Dance` | thay thế, vì `Celebration` là bản trả phí |
| chào/vẫy tay (`G`) | – | **THIẾU**. B: tư thế tay cộng thêm (additive) bằng code, hoặc `Idle_Talking`. |

Tổng 3.3: **2 file, 136,54 MB** (hoặc 14,54 MB nếu chọn phương án b).

### 3.4 Xe đạp (Phase 3/6)

| # | Tên file | Trang nguồn | Link file | Định dạng | MB | Tam giác | Giấy phép + tác giả | Dùng cho |
|---|---|---|---|---|---|---|---|---|
| 22 | `bicycle_poly-by-google.glb` | https://poly.pizza/m/5pBoRkAPQk6 | https://static.poly.pizza/86711470-772a-4906-9396-f5c2e59e96ef.glb | GLB | 0,29 | 4 780 | CC-BY 3.0, Poly by Google | Xe đạp kiểu Vélib': khung thấp, có chắn bùn. Việc cần làm: đổi sang màu xám/xanh Vélib', thêm giỏ trước bằng code, tách bánh xe + crank để quay (hoặc thay bánh bằng code), scale, pivot ở điểm chạm đất. Ghi nguồn: "Bicycle" – Poly by Google, CC BY 3.0, qua Poly Pizza (đã chỉnh sửa). Không kèm người lái: dùng người chơi + clip `Driving` + IK. |
| 22a (tùy chọn) | `bicycle_clint-bellanger.zip` | https://opengameart.org/content/bicycle | https://opengameart.org/sites/default/files/bicycle.zip | .blend | 0,25 | 820 | CC-BY 3.0, Clint Bellanger | Tham khảo rig có sẵn animation đạp (kiểu xe thể thao hoạt hình). Cần Blender để xuất GLB. |

### Tổng tải về

| Nhóm | Bắt buộc | Tùy chọn |
|---|---|---|
| Địa danh (mục 2) | 2 file, 45,10 MB | 2 file, 18,32 MB |
| Xe NPC (3.1) | 8 file, 2,69 MB | – |
| Người đi đường (3.2) | 8 file, 11,82 MB | 6 file, 3,18 MB |
| Người chơi (3.3) | 2 file, 136,54 MB (phương án b: 1 file, 14,54 MB) | – |
| Xe đạp (3.4) | 1 file, 0,29 MB | 1 file, 0,25 MB |
| **Cộng** | **21 file, 196,44 MB** (phương án b: 20 file, 74,44 MB) | 9 file, 21,75 MB |

Dung lượng commit ước tính sau xử lý là **15–20 MB**. File lớn nhất là Khải Hoàn Môn, khoảng 8 MB (giới hạn 25 MB mỗi file).

Ghi nguồn CC-BY trong game (menu Esc → "Ghi nguồn"), kèm "đã chỉnh sửa": Scott Marshall, HoangHiepVu, Poly by Google (×2), jeremy, Quaternius ("Suit"); thêm Microsoft, Johnson-Martin, Clint Bellanger nếu dùng file tùy chọn. Asset CC0 (Quaternius, rgsdev) ghi nguồn cho lịch sự. Dữ liệu: © OpenStreetMap contributors (ODbL); IGN LiDAR HD (Licence Ouverte 2.0) nếu dùng để đo chiều cao.

## 4. Không có mô hình phù hợp → dựng bằng A + B

- **Địa danh:** tất cả trừ Eiffel và Khải Hoàn Môn, tức là Louvre + kim tự tháp, Nhà thờ Đức Bà, Chaillot, Bir-Hakeim, Concorde (obelisk + đài phun), Grand Palais, Alexandre III, Invalides, Orsay, Petit Palais, Madeleine, Opéra, Vendôme, Carrousel, Palais Bourbon, Pont Neuf, Pont des Arts, Sainte-Chapelle, Conciergerie, Hôtel de Ville, Pompidou, Saint-Jacques, Palais-Royal, Alma + Ngọn lửa, Palais de Tokyo, Rodin, École Militaire, Saint-Sulpice, Panthéon, Luxembourg, và 3 silhouette chân trời. Lý do từng cái ở mục 1.
- **Tượng mạ vàng / tượng đồng:** Alexandre III, Opéra, Chaillot, quadriga ở Grand Palais và Carrousel, Henri IV, Zouave, tượng Vendôme. Dựng thành proxy khối/silhouette màu vàng hoặc đồng, đặt tại node OSM.
- **Đồ phố đặc trưng Paris:** cột quảng cáo Morris, đài nước Wallace, cửa metro Guimard, giá để xe hình chữ U ngược ("arceau", cho bãi xe §6.4), trạm Vélib', cột chắn. Không có bản CC0/CC-BY nào, nên mở rộng `client/src/world/StreetProps.ts`.
- **Clip thiếu:** đạp xe, ngã xe, vẫy tay (mục 3.3). Người ngồi ở quảng trường: dùng clip ngồi nếu có trong 24 clip Modular, không thì B (uốn xương thành tư thế ngồi).

Đã loại, không đề xuất:

| Lý do | Mô hình |
|---|---|
| Phải có tài khoản | Mọi bản tải từ Sketchfab (Vendôme, Carrousel, Sainte-Chapelle, Panthéon, Ngọn lửa, Sacré-Cœur, obelisk…), Mixamo, Ready Player Me, CGTrader, TurboSquid, Free3D |
| Giấy phép BY-SA / NC | Eiffel của Newcandle (BY-SA, kể cả các bản tải lại bị gắn nhãn sai thành CC-BY), Madeleine (BY-SA), Panthéon và Grande Arche (NC) |
| Nguồn gốc sai giấy phép | Nhà thờ Đức Bà của Galdames (dựng lại từ mô hình SketchUp 3D Warehouse); Eiffel CMBC và Louvre mohamedhussien (lấy từ Google Earth); Sacré-Cœur của JAx (một phần lấy từ SketchUp) |
| Chất lượng kém / không đúng | Pompidou Tinkercad, kim tự tháp mini in 3D, Notre-Dame một phần hoặc chỉ nội thất, "National Assembly" (thực ra của Gambia), dữ liệu LOD2 của IGN (không ghi giấy phép, chỉ để xem) |
| Lệch phong cách GTA V | Kenney Car Kit / Characters, KayKit (CC0 nhưng dáng đồ chơi) |
| Không tải được hôm nay | Quaternius Background Posed Humans (Google Drive báo hết quota, không biết dung lượng) |
| MIT (ngoài CC0/CC-BY) | Microsoft Rocketbox (mục 0.4) |

## 5. Thay đổi pipeline cần làm (Phase 2B)

1. **Danh sách địa danh theo OSM id** trong `scripts/build-chunks.ts` (`LANDMARKS`, mở rộng `LandmarkId`). Các outline id: Eiffel w5013364, Arc w226413508, Louvre r3262297, kim tự tháp w375076234, Notre-Dame w201611261, Chaillot r6826569, obelisk w72937686, Grand Palais w56185523, Dôme w112452790, Hôtel des Invalides r1463538, Orsay w63178753, Petit Palais r2778854, Madeleine w54180046, Opéra w54667456, Vendôme w227762241, Carrousel w227483542, Bourbon r1019368, Sainte-Chapelle r3344870, Palais de Justice/Conciergerie r536982, Hôtel de Ville r284089, Pompidou w55503397, Saint-Jacques w20326709, Palais-Royal r3300400, Tokyo w79219351, Biron w68568682, École Militaire (28 nhà trong w106312008), Saint-Sulpice w16077204, Panthéon w16407465, Luxembourg r975955. Cầu: Bir-Hakeim w183602168, Alexandre III w183620685 (4 trụ w64959941, w230227013/14/15), Pont Neuf w53574149/w53574164, Pont des Arts w176396893, Alma w183589443. Ngọn lửa w92316094. Đài phun Concorde w72937684/85.
2. **Giữ `building:part`** (hiện `classify` đang bỏ với lý do `buildingPart`) cho các part có tâm nằm trong outline của một địa danh. Ghi vào `ChunkData` (tăng `v` lên 2). Nếu outline có part thì **không đùn outline** nữa (luật Simple 3D Buildings); cách này sửa lỗi Notre-Dame thành tấm phẳng, Saint-Sulpice và Panthéon thành khối thấp. Áp luật này cho toàn bản đồ là hướng nâng cấp sau (khoảng 3 000 part), nhưng khi đó nhà Haussmann có part sẽ mất kiểu mái mansard.
3. **`buildingFacts` giữ thêm các tag** `roof:height`, `roof:direction` (đổi hướng chữ sang độ), `roof:orientation`, `roof:material`, `building:material`, `roof:levels`, `building:min_level`. Chiều cao khi chỉ có số tầng = số tầng × `buildings.levelHeight`.
4. **Renderer part (A):** lăng trụ từ `min_height` tới `height − roof:height`. Các kiểu mái: flat, skillion, gabled, hipped, pyramidal, dome, cone, round (vòm thùng), mansard, gambrel, side_hipped; kiểu hiếm (quadruple_saltbox, onion, crosspitched, many) dựng như kiểu gần nhất. `building:part=column` dựng thành trụ tròn. Vật liệu: gold → vàng kim loại, copper → xanh verdigris, glass → kính trong suốt, lead/zinc/slate → các sắc xám; tag màu (nếu có) được ưu tiên.
5. **Ca đặc biệt:**
   - Vendôme và 4 trụ Alexandre III không dựng như nhà thường.
   - `building=roof` (sân kính Louvre, ga Bir-Hakeim) chỉ dựng mặt mái.
   - Part của Eiffel không dựng (chỉ đọc số liệu).
   - Obelisk thêm bệ.
   - Giữ polygon cầu dạng area (`man_made=bridge`) cho các cầu địa danh.
   - Giữ node `artwork`, `street_lamp` và node đồng hồ nằm trong vùng địa danh (thêm kind mới cho `PointRec`).
   - Giữ `amenity=fountain` ở Concorde và Trocadéro.
6. **Chiều cao bổ sung** cho Louvre (từng cánh), Orsay, Chaillot, Petit Palais, Tokyo, Hôtel de Ville: đo một lần trên IGN LiDAR HD, ghi thành bảng số trong `LANDMARKS`, kèm chú thích nguồn. Không cần đưa LiDAR vào pipeline.
7. **Chân trời:** mở rộng `fetch-osm` thêm 1 truy vấn Overpass nhỏ lấy các tháp La Défense (`height`, ngoài bbox), xuất ra `client/public/data/skyline.json`. Sacré-Cœur và Montparnasse dựng bằng code (tọa độ trong `LANDMARKS`).
8. **Mô hình C:**
   - Script `scripts/process-assets.ts` đọc `.cache/assets/`, chạy simplify + nén meshopt + texture (WebP 2K; KTX2 nếu cài được `toktx`) rồi ghi ra `client/public/models/`.
   - FBX (bộ rgsdev, nếu đúng là FBX) chuyển một lần bằng `FBX2glTF` hoặc Blender.
   - Client: `GLTFLoader` + `MeshoptDecoder` (có sẵn trong `three/examples`) tải ở main thread và đặt vào chunk địa danh khi chunk đó được tải (các chunk builder trong worker không đọc được GLB).
   - Thêm `client/public/credits.json` và màn hình "Ghi nguồn" trong menu.
   - **Package cần cài (dev, chỉ cho scripts):** `@gltf-transform/cli`, `@gltf-transform/core`, `@gltf-transform/functions`, `meshoptimizer`. Không thêm dependency nào vào client.
9. **Collider:** hộp giản lược theo part OSM hoặc code (4 chân Eiffel, 4 trụ Khải Hoàn Môn). Không dùng trimesh của mô hình photogrammetry.

## 6. Ghi chú pháp lý

Kim tự tháp Louvre (I. M. Pei, mất 2019) vẫn còn bản quyền kiến trúc, và ở Pháp ngoại lệ "tự do toàn cảnh" không áp dụng cho mục đích thương mại. Ánh sáng tháp Eiffel về đêm cũng vậy. Dùng cho sự kiện nội bộ thì ổn; cần kiểm lại nếu phát hành thương mại.
