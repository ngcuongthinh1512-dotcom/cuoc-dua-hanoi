# Phase 8C – Bảng nguồn ứng viên tài nguyên đồ họa (CHƯA TẢI, chờ người dùng duyệt một lần)

Ngày 2026-10-03. Luật giấy phép: SPEC §17.20 (được PD / CC0 / CC-BY / CC-BY-SA / CC-BY-NC / CC-BY-NC-SA, MIT theo §17.7; CẤM ND, "chỉ dùng cá nhân", giấy phép không rõ). Giấy phép ghi ở đây là giấy phép ĐỌC TRÊN TRANG NGUỒN hôm nay; trước khi tải phải kiểm lại một lần nữa (Sketchfab cho phép tác giả đổi giấy phép).

Trạng thái: đang nghiên cứu, bảng được cập nhật dần (xem mục cuối "Nhật ký").

## 0. Tóm tắt
- Ứng viên đạt §17.20 (giấy phép đọc trên trang / API): landmark 4 chính + 3 phụ; người đi đường 36 avatar Rocketbox (MIT) còn chưa dùng; xe 8 Sketchfab CC-BY; đồ đường phố 20 Sketchfab CC-BY + 10 Poly Haven CC0; cây: 1 pack OGA CC0 (đề xuất dựng thủ tục thay vì tải); HDRI 13 Poly Haven CC0; texture PBR ≈ 45 mục CC0; áp phích PD 2 danh mục Commons. **Tổng ≈ 140 mục đạt**, ≈ 30 loại.
- Không có mô hình CC cho: Bir-Hakeim, Pont de l'Alma + Zouave, Palais de Tokyo, Crazy Horse, bateau-mouche, cửa Guimard, kiosque, Vélib', bản Notre-Dame hậu-2024 → tự dựng / giữ code.
- Hai việc cần người dùng quyết ngoài danh sách tải: (1) Quaternius đổi sang QAL v1.0 (mục 2.2) – giữ tài nguyên cũ, không tải thêm; (2) Notre-Dame chỉ có bản trước hỏa hoạn (chóp cũ cùng hình dáng chóp mới) – chấp nhận?
- **Danh sách tải đề xuất** (mục 5): 24 tệp ≈ 1,3 GB tải về (chủ yếu scan Sketchfab + ảnh gốc Rocketbox), ≈ 55–70 MB sau xử lý trong `client/public/`.

## 1. Mô hình quét / mô hình chi tiết landmark
Phạm vi (quyết định người dùng 2026-10-03): CHỈ 8 landmark lộ trình – Nhà thờ Đức Bà, Louvre (+ Kim tự tháp), Hôtel / Vòm Invalides, cầu Bir-Hakeim, Pont de l'Alma (+ Zouave), Ngọn lửa Tự do, Palais de Tokyo, Crazy Horse Paris. Eiffel + Khải Hoàn Môn đã có GLB thật, không đụng. Landmark khác không tìm.

Cách đọc giấy phép: API công khai `https://api.sketchfab.com/v3/models/<uid>` (trường `license.label` / `license.slug` / `isDownloadable`), vì trang HTML Sketchfab tải bằng JS. 4 dòng in đậm đã được điều phối viên kiểm lại độc lập trên API ngày 2026-10-03. Mọi lượt tải Sketchfab cần tài khoản miễn phí (người dùng tải tay hoặc cấp token).

| Landmark | Mô hình | URL | Tác giả | Giấy phép (API) | Faces / verts, texture | Đăng | §17.20 | Ghi chú |
|---|---|---|---|---|---|---|---|---|
| **Nhà thờ Đức Bà** | **Notre-Dame de Paris** | https://sketchfab.com/3d-models/none-b5808186c49a451bbf815fbccdb727a3 | francois.bouille | "CC Attribution" (slug `by`), downloadable | 303 751 / 371 457; 16 texture 8K; GLB 219,6 MB, USDZ 22 MB | 2021-04 | **Y** | photogrammetry toàn nhà thờ ("20M tris reduced to 300K"), **trước hỏa hoạn** (chóp Viollet-le-Duc – chóp phục dựng 2024 cùng hình dáng) → ứng viên chính; process: decimate ≤ 150k, texture 2–4K WebP, cắt nền → ≈ 8 MB |
| | Paris Cathedral – Notre Dame | https://sketchfab.com/3d-models/none-dd35014d8a3245ce81e7df862b0df5a8 | flyingzebra | "CC Attribution" | 121 217 / 62 324 | 2015 | Y | photogrammetry Agisoft, không rõ phủ hết; dự phòng |
| | Notre Dame: Indoor+Outdoor (crowdsourced) / Work in progress | https://sketchfab.com/3d-models/none-461a9a51ba1b40bc942b5dfa04c1100f, …/none-d1a0f65c217740ec800021b6771964f1 | RaizVR | "CC Attribution" | 177 158 / 90 100 | 2019 | Y, cảnh báo nguồn | dựng từ ảnh / video cộng đồng + "mapping services" → nguồn ảnh không rõ; tránh |
| | Notre Dame crowdsourced photogrammetry | https://sketchfab.com/3d-models/none-c6f03e2284e049f38f118378b012c979 | miguelbandera | "CC Attribution-NonCommercial-ShareAlike" | 118 686 | 2019 | Y (NC-SA), thô | dự phòng xa |
| | Notre Dame, Paris (con audio guía) | https://sketchfab.com/3d-models/none-368ac2a4669145c1b7b94db7e7ad4f71 | pacopozo | "CC Attribution" | 827 356 | | Y về giấy phép, **nguồn chưa rõ** (nghi SketchUp) | tránh |
| | Loại | Fab "Notre-Dame façade post-restoration 2024" https://www.fab.com/listings/55f872f2-0cfc-4f97-9176-8875c0813163 (store licence – bản hậu-2024 DUY NHẤT); các bản CC-BY gốc 3D Warehouse (arquitectotecnico, copybrian, silviaas, lowco, mohamedhussien); point cloud chei_ucsd; Zenodo 10381512 / 10386325 (mảnh tượng / nhà thờ hư cấu) | | | | | N | |
| **Louvre** | **Louis XIV de France, Louvre, Paris** (tượng kỵ mã Bernini ở Cour Napoléon) | https://sketchfab.com/3d-models/louis-xiv-de-france-louvre-paris-a0cc0e7eee384c99838dff2857b8158c | HoangHiepVu (tác giả Arc đã dùng) | "CC Attribution" (`by`), downloadable | 421 965 / 210 873 | 2016-07 | **Y** | điểm nhấn cạnh Kim tự tháp; decimate ≤ 20k |
| | Pavillon Sully (Louvre) | https://sketchfab.com/nicolasdiolez/models (uid `88e6f35a…`, tìm `cour napoleon`) | nicolasdiolez | "CC Attribution-NonCommercial-ShareAlike" | 4 892 649; 8K | | Y (NC-SA) | Pavillon de l'Horloge – mặt tiền trông ra Cour Napoléon; decimate rất mạnh (≤ 150k) hoặc chỉ bake texture mặt tiền lên part OSM |
| | La Cour Carrée, Louvre, Paris | https://sketchfab.com/3d-models/none-8d7f36be9a4345b3ba3d5a991f91836f | HoangHiepVu | "CC Attribution" | 1 318 057 / 657 777 | | Y | 4 mặt Cour Carrée (sân đông); dùng bake texture mặt tiền Louvre chung |
| | Cour carrée – photogrammetry | https://sketchfab.com/3d-models/none-e9f3c2b10f1343e4a5f2d5ead9375c77 | nicolasdiolez | "CC Attribution-NonCommercial" | 982 023 | 2022 | Y (NC) | dự phòng |
| | Pyramide du Louvre Mini | uid `95b6b33f6a85407d854397640e9875f0` (lefabshop); bản sao print3deasy `6130243b…` | lefabshop | "CC Attribution" | 11 648, không texture | | Y, giá trị thấp | Kim tự tháp kính: **dựng code** (g3 đã có, nâng khung + kính env map) |
| | Không có | dãy mặt tiền Denon / Richelieu Cour Napoléon dạng quét CC | | | | | – | g3 parts OSM + texture PBR đá vôi + bake từ Cour Carrée |
| **Invalides** | **Tomb of Napoleon (The Dome)** | https://sketchfab.com/3d-models/tomb-of-napoleon-the-dome-8176f57fd1194515a89ffeabac6c6d99 | PolarNick239 | "CC Attribution" (`by`), downloadable | 500 000 / 307 521 | 2025-08 | **Y** | mô tả API: "photogrammetry model of the exterior dome", 97 ảnh 12 MP Metashape → mái vòm ngoài; decimate ≤ 120k; Hôtel (sân, cánh) vẫn g4 code + PBR |
| | Paris Eiffel Tower and Invalides | https://sketchfab.com/3d-models/none-20c682d5be4549718db6d508de13c5ea | corentin | "CC Attribution" | 387 783 | 2015 | Y, vô dụng | khối extrude OSM |
| | Loại | "225 - POI – Dôme des Invalides" (cdg) https://sketchfab.com/3d-models/none-2303e6c763524a04bbcdfbeed78c88a2: "72 recopies d'écran GE" = chụp màn hình Google Earth → nguồn sai; ArtStation / CGTrader (store); Derrudy plan-relief (nội thất) | | | | | N | |
| **Ngọn lửa Tự do** | **Day 135: Flame of Liberty – 1scanaday** | https://sketchfab.com/3d-models/day-135-flame-of-liberty-1scanaday-90ae551a427f4855b42ae3b3bc8be5aa | edemaistre | "CC Attribution" (`by`), downloadable | 335 657 / 170 630; 1 texture | 2021-05 | **Y** | iPhone LiDAR Scaniverse, gồm bệ; mặt lửa vàng có thể nhiễu → vá bằng vật liệu gold env map; decimate ≤ 15k |
| **Cầu Bir-Hakeim** | KHÔNG có mô hình CC tải được (API: "bir-hakeim", "bir hakeim", "paris bridge pont") | | | | | | – | **tự dựng** (g2 code + PBR): cột gang, vòm đá, tượng "La France renaissante" placeholder (bản Sketchfab "France Reborn" là Standard, không tải) |
| **Palais de Tokyo** | KHÔNG có (chỉ "DIY Skate Rail" 150 tris quét tại chỗ – vô dụng) | | | | | | – | tự dựng (g4 code + PBR): hàng cột, bậc, tượng Bourdelle placeholder, bể nước |
| **Pont de l'Alma + Zouave** | KHÔNG có | | | | | | – | tự dựng (g2 code + PBR); Zouave = capsule tượng đá placeholder |
| **Crazy Horse** | KHÔNG có; chi tiết Haussmann chung: "Haussmannian building entrance in Paris" uid `3a3ef548…` (CC BY-NC-SA, 179k) ; "French style building (Haussmann)" uid `2e3fba6f…` (CC BY, 640k, dựng tay) | | | | | | Y nhưng không cần | tự dựng mặt tiền (đã có g4) + texture PBR; cổng Haussmann NC-SA có thể bake thành decal cửa chung – tùy chọn |

Nguồn khác đã kiểm: Wikimedia Commons `Category:STL files of buildings` chỉ có Arc + Eiffel; Zenodo / Objaverse chỉ mảnh tượng; poly.pizza không có Paris; **IGN LiDAR HD** https://www.data.gouv.fr/datasets/lidar-hd-ign-2022 (Licence Ouverte Etalab 2.0 – tương thích, ghi nguồn "IGN – LiDAR HD"): mây điểm ≈ 10 pt/m² để đo khối Invalides / Tokyo / Bir-Hakeim chính xác, không texture – chỉ dùng khi code g2 / g4 cần số liệu (SPEC §17.7: không tải LiDAR nếu chưa duyệt → đưa vào danh sách duyệt như một dòng tùy chọn).

Tổng landmark: **4 mô hình quét đạt giấy phép và dùng được** (Notre-Dame, Louis XIV, Vòm Invalides, Ngọn lửa; + 3 phụ Louvre NC / NC-SA để bake texture), 4 landmark không có mô hình → code + PBR.

## 2. Người đi đường, xe, đồ đường phố

### 2.1 Người đi đường – Microsoft Rocketbox (MIT, đã duyệt 4 avatar §17.11; pipeline `process-assets` sẵn)
Kho `https://github.com/microsoft/Microsoft-Rocketbox` (README: "115 characters and avatars fully rigged", "released under MIT License"). Thư mục `Assets/Avatars/`: `Adults` 40 (Female_Adult_01…17, Female_Party_01–02, Male_Adult_01…21), `Professions` 73 (Business_Female_01–04, Business_Male_01–07, Police / Fire / Medical / Sports / Delivery / Gardener / Chef / Construction…), `Children`. Đang dùng: Male_Adult_08, Female_Adult_05, Business_Male_01, Business_Female_01.
Đề xuất thêm (chỉ cần duyệt tên, cùng giấy phép / rig / clip): Male_Adult_02, Male_Adult_14, Female_Adult_09, Female_Adult_12 (thường phục), Sports_Female_01 + Sports_Male_02 (du khách / chạy bộ), Business_Male_04, Delivery_Male_01, Police_Male_02 (gần Louvre / Invalides). Mỗi avatar gốc ≈ 10–20 MB FBX + texture; sau xử lý ≈ 0,35 MB / avatar trong `npc-peds.glb` (hiện 4 avatar = 1,5 MB). Đạt §17.20: **Y** (MIT, §17.7).
Loại (không thuộc §17.20, đã đọc điều khoản): **Mixamo** (điều khoản Adobe: cấm phát raw files, cần tài khoản Adobe – không phải CC / MIT); **Renderpeople free** (https://renderpeople.com/general-terms-and-conditions/ §4.3b buộc ngăn người khác "easily download, extract" – game trình duyệt phục vụ GLB tĩnh vi phạm); **Ready Player Me** (giấy phép không rõ biến thể CC + ràng buộc nền tảng); **Unity / Epic** (EULA engine). Sketchfab scan người CC-BY-NC ("Handsome man in casual clothes in a pose 86" https://sketchfab.com/3d-models/handsome-man-in-casual-clothes-in-a-pose-86-b92046a81b1d4a33af51ec15f0df2a5d, A-pose, chưa rig) → giấy phép được nhưng phải tự rig → không đáng công khi Rocketbox còn 36 avatar cùng rig.

### 2.2 CẢNH BÁO: Quaternius đổi giấy phép (kiểm 2026-10-03 trên https://quaternius.com/license.html)
Trang giấy phép nay là **"Quaternius Asset License (QAL) v1.0", "Last updated 8/28/2026"**, không nhắc CC0: cho phép "Use, copy, and modify the Assets; Incorporate the Assets (in original or modified form) into a Product; Publish, distribute, sell…" không cần ghi nguồn; CẤM "extract, repackage, sublicense, sell, or otherwise redistribute the Assets (in original or modified form) as a standalone asset, asset pack, stock file, template…". Các trang pack (vd. https://quaternius.com/packs/ultimatemodularwomen.html) **vẫn ghi "CC0"** + link https://creativecommons.org/publicdomain/zero/1.0/; Poly Pizza cũng ghi CC0 cho model Quaternius. Đang dùng trong game: Universal Base Characters + UAL (người chơi), 5 xe NPC (Poly Pizza, CC0), 8 modular peds đã tải (chưa dùng).
- Nhận định: CC0 đã công bố thì không thu hồi được (CC0 §3 "irrevocable"); tệp tải ngày 2026-09-28/30 theo trang ghi CC0 → giữ nguyên, lưu ảnh chụp trang pack ghi CC0 + ngày vào `.cache/assets/manifest.json` (việc T0).
- **Cần người dùng quyết**: có thêm QAL vào §17.20 không. Mặc định đề xuất: **KHÔNG tải thêm tài nguyên Quaternius mới ở 8C** (không cần: Rocketbox, Poly Haven, Sketchfab CC-BY đủ), giữ tài nguyên đã có.

### 2.3 Xe NPC (bổ sung kiểu châu Âu; Sketchfab tải cần tài khoản người dùng; giấy phép đọc qua `api.sketchfab.com/v3/models/<uid>` trường `license.label`)
| Mục | URL | Tác giả | Giấy phép (API) | Faces / verts | Cần TK | §17.20 | Ghi chú |
|---|---|---|---|---|---|---|---|
| French delivery van – Low poly model | https://sketchfab.com/3d-models/french-delivery-van-low-poly-model-a350a422d200485ea57778dc42139edc | DanielZhabotinsky | "CC Attribution" | 6 963 / 4 009 | Y | **Y** | van kiểu Pháp – ưu tiên 1; kiểm logo |
| Low Poly Small car | https://sketchfab.com/3d-models/low-poly-small-car-ebe7c5e98a7448b5abb2eaf0cb22b766 | scailman | "CC Attribution" | 7 292 / 4 452 | Y | Y | hatchback nhỏ kiểu châu Âu – ưu tiên 1 |
| Low-Poly Sedan car | https://sketchfab.com/3d-models/low-poly-sedan-car-aeb2699532b4402e8b75ec8888b800b9 | scailman | "CC Attribution" | 6 348 / 3 924 | Y | Y | → taxi Paris (biển "TAXI PARISIEN" tự vẽ) |
| Garbage Truck | https://sketchfab.com/3d-models/garbage-truck-9e3400f575a541b88417e85f766fc773 | sbastuff | "CC Attribution" | 2 300 / 1 524 | Y | Y | xe rác (bản khác: iedalton 18 852, vladicom08 9 686, cùng CC-BY) |
| Isuzu Erga Mio bus | https://sketchfab.com/3d-models/isuzu-erga-mio-bus-050e8acd0bbc4da0902a8a874ef10fca | own.guest | "CC Attribution" | 3 434 / 1 784 | Y | Y | bus Nhật → sơn lại xanh-trắng kiểu RATP, bỏ logo |
| SAVIEM SC 10 (bus Paris cổ) | https://sketchfab.com/3d-models/saviem-sc-10-6a3210bea1e94e61bfbbe6749587caf9 | cloudhub | "CC Attribution" | 89 380 / 52 928 | Y | Y (nặng) | phải decimate ≤ 2 500 + xóa logo Renault / Saviem; tùy chọn |
| Generic civil service vehicles pack | https://sketchfab.com/3d-models/generic-civil-service-vehicles-pack-8ff2a13f30914932a70c7950cfa58465 | comrade1280 | "CC Attribution" | 92 709 / 55 143 (cả pack) | Y | Y | xe cảnh sát / cứu thương không logo; decimate |
| Free Delivery Truck Vehicle | https://sketchfab.com/3d-models/free-delivery-truck-vehicle-low-poly-50cdb3c674c84224b6ebfe471ca404fe | vmek3d | "CC Attribution" | 14 174 / 7 522 | Y | Y | dự phòng |
| OGA 3D Bus (ajanhallinta), Low Poly Vehicles Pack (Daniel Quevedo) | https://opengameart.org/content/3d-bus, https://opengameart.org/content/low-poly-vehicles-pack | | CC0 (theo tìm kiếm, **chưa mở trang**) | | N | kiểm lại | |
| **Bateau-mouche** | Sketchfab API `bateau mouche` → 0; OGA "Low Poly Boat" (Elegant Crow, CC-BY-SA 4.0) là thuyền chèo | | | | | **không có** | → tự dựng (hộp 35 m + lan can + mái kính, ≤ 400 tam giác) |
| Vélib' / trạm | Sketchfab API `velib` → chỉ thẻ Vélib' | | | | | không có | giữ xe đạp hiện có, trạm tự dựng |
| Loại | "Pack of low-poly urban vehicles" (gabrielquintana) https://sketchfab.com/3d-models/pack-of-low-poly-urban-vehicles-d06daf445fb74121961bc2a540f05217 | | "Standard", not downloadable | | | **N** | |
| Loại (kiểu) | Kenney Car Kit https://kenney.nl/assets/car-kit | Kenney | CC0 | | N | N (đồ chơi) | |

### 2.4 Đồ đường phố Paris
| Mục | URL | Tác giả | Giấy phép | Faces / verts | Cần TK | §17.20 | Ghi chú |
|---|---|---|---|---|---|---|---|
| **Fontaine Wallace** | https://sketchfab.com/3d-models/fontaine-wallace-5be06c9f4f904e71a4a85da53812b8e9 | Maurice Svay | API "CC Attribution (by)" – "Author must be credited. Commercial use is allowed." | 273 760 / 137 495, 2 texture | Y | **Y** | scan thật; decimate ≤ 3 000 + bake; đặt tại OSM `amenity=drinking_water` + `fountain=wallace` |
| **French Colonne Morris** | https://sketchfab.com/3d-models/french-colonne-morris-3092cbf7e3524781a82703cde08272db | maxgomes | "CC Attribution" | 168 948 / 90 852 | Y | **Y** | thay cột Morris code; decimate ≤ 1 500; áp phích thay bằng poster PD (3.2 o) |
| Bouquinistes (hộp sách bờ kè) | https://sketchfab.com/3d-models/bouquinistes-357bec3b90624ed19296f06e18ba3abd | alban | "CC Attribution" | 299 554 / 168 410 | Y | Y (nặng) | hoặc "Le Bouquiniste" lea-kim 159 991 CC-BY; decimate ≤ 600 → instanced dọc quai |
| Mini Paris bench (scan ghế Paris) | https://sketchfab.com/3d-models/mini-paris-bench-a3015ce6492e4cb1bb4892492c8b96d5 | alban | "CC Attribution" | 217 240 / 108 604 | Y | Y (nặng) | tham chiếu banc Davioud; decimate ≤ 400 |
| **Abribus, Bus stop** | https://sketchfab.com/3d-models/abribus-bus-stop-bus-station-ab3c98bf93de498bb45c129afa4c3ab3 | maxipub | "CC Attribution" | 7 968 / 4 080 | Y | **Y** | nhà chờ kiểu Pháp – dùng ngay; đặt tại `highway=bus_stop` + `shelter=yes` |
| Street Lamp (scan point cloud → mesh) | https://sketchfab.com/3d-models/street-lamp-fa3577bfb99e4dbf83d335ce75de5910 | beauvais.remi | "CC Attribution" | 4 510 / 2 286 | Y | Y | kiểm kiểu Pháp |
| Old Street Lamp Pack | https://sketchfab.com/3d-models/old-street-lamp-pack-324ff0abd82d4f679f9e64065ad142a3 | Bailey123704 | "CC Attribution" | 14 542 / 7 426 | Y | Y | gần candélabre |
| **Poly Haven `street_lamp_01`** | https://polyhaven.com/a/street_lamp_01 | Josh Dean | CC0 | 31 000 tam giác, 3,9 m, texture 1K–8K, gói 31 MB | N | **Y** | "Ornate cast-iron street lamp" – gần kiểu Paris nhất, CC0; decimate ≤ 1 200, texture 1K |
| Poly Haven `street_lamp_02` | https://polyhaven.com/a/street_lamp_02 | Poly Haven | CC0 | | N | Y | đèn treo tường Victoria – mặt tiền |
| **Poly Haven `outdoor_table_chair_set_01`** | https://polyhaven.com/a/outdoor_table_chair_set_01 | Poly Haven | CC0 | | N | **Y** | bộ bàn ghế quán xếp – terrasse |
| Poly Haven `modular_street_seating`, `painted_wooden_bench`, `plastic_monobloc_chair_01`, `concrete_road_barrier`, `utility_box_01/02`, `water_manhole_cover` | https://polyhaven.com/a/<slug> | Poly Haven | CC0 | | N | Y | phụ; `fire_hydrant` kiểu Mỹ – không dùng |
| Ghế bistro mây DANICA | https://sketchfab.com/3d-models/92d836d521664d7f913c43bd8150270d | misterwils | "CC Attribution" | 67 836 / 34 500 | Y | Y (nặng) | bake đan mây → alpha, ≤ 500 tam giác; tùy chọn |
| T-Bollard / Parking post / Bollard_AdelPrince | https://sketchfab.com/3d-models/e7e5f9b0c9c046869e81dd2fecd9dbc1, …/532b02858c67410f9a1973544f25dcc4, …/f9461dcdaa4a4b2f94130356b9fdb74e | Sebastian.Hamish.Webster / Art62 / Adelprince69 | "CC Attribution" | 412 / 138 / 1 612 | Y | Y | potelet Paris đơn giản → **tự dựng rẻ hơn** (trụ + vạch trắng) |
| Street Bench / Free Park Bench / Wooden Bench | https://sketchfab.com/3d-models/street-bench-1ddafec2fda5430697aaf403b3deba96, …/free-park-bench-acb6f81b6ae94748b702353be6049fcb, …/60d4427985154f1aa10331820d81e39b | donnichols / calp1 / Moon4038 | "CC Attribution" | 13 076 / 5 404 / 1 026 | Y | Y | dự phòng ghế |
| PBR Street Props Pack (Game Ready) | https://sketchfab.com/3d-models/8013d8e6af4645d1a7c3d5b24054bfc8 | MadeByYeshe | "CC Attribution" | 20 667 / 10 957 | Y | Y | thùng rác / cọc / biển – kiểu chung |
| Letter boxes – photogrammetry (hộp thư La Poste vàng), Electric box | https://sketchfab.com/3d-models/7ee33d48960f4a78ba40103159f08dc8 (26 438), …/8d7774bce0c44e8c84fcbfc84d866e7c (122 152) | nicolasdiolez | "CC Attribution" | | Y | Y | scan Paris; decimate |
| **Chim bồ câu – Animated Bird, Pigeon** | https://sketchfab.com/3d-models/797d27b68af3453e865149435df6aa30 | dudecon | "CC Attribution" | 710 / 357, 5 animation | Y | **Y** | SPEC §14 bồ câu bay lên; rẻ |
| Pigeon (FourthGreen 1 482, 1 anim), Low Poly Pigeon (hedaytul333 497, 2 anim) | https://sketchfab.com/3d-models/5884a0f5200c44ceaa7d0399bea577f9, …/79de3c5b47f24376a5694029b1693088 | | "CC Attribution" | | Y | Y | dự phòng |
| Loại | Wallace fountain (amcgi) "Editorial"; Blue Wallace Fountain (nicolasdiolez) "Standard"; Park Bench Chair (Shayan.CGI) "Free Standard"; "Day 137: Parisian lamppost" (edemaistre) point cloud 0 faces | | | | | **N** | |
| Không tìm thấy mô hình CC | cửa metro Guimard, kiosque à journaux, đèn giao thông R11, thùng rác Bagatelle, MUPI, trạm Vélib', lưới gốc cây | | | | | – | **tự dựng** (Guimard đã có code; còn lại hộp / trụ + texture) |

### 2.5 Cây
| Mục | URL | Tác giả | Giấy phép | Số liệu | §17.20 | Ghi chú |
|---|---|---|---|---|---|---|
| Poly Haven cây (20 model) | https://api.polyhaven.com/assets?t=models&c=trees | Poly Haven | CC0 | **tất cả 0,3–17 triệu tam giác** (geometry nodes, có LOD nhưng vẫn nặng); không có platane / marronnier / tilleul; `jacaranda_tree` 312 356, `tree_small_02` 4,65 M | Y nhưng **không thực dụng** | chỉ bake lá / cành thành card nếu cần |
| **OGA Free Vegetation Asset Pack** | https://opengameart.org/content/free-vegetation-asset-pack | rubberduck | "CC0" | cây 880 / 525 / 321 tam giác (3 LOD), cây trụi 720 / 462 / 227, bụi; .blend 5,1 MB | **Y** | có LOD sẵn; cần export GLB (Blender) |
| OGA Low Poly Forest Pack | https://opengameart.org/content/low-poly-forest-pack | devilsworkshop | "CC0 1.0 Universal" | 31 cây, FBX / OBJ, 8,9 MB | Y (kiểu faceted) | cây rừng, kém hợp |
| Sketchfab Platanus × acerifolia scan | https://sketchfab.com/3d-models/f808f18e76564af49bf82bb6c63c49fa | airsicklowlander | "CC Attribution" | 883 231 faces | Y, chỉ tham chiếu | bake thân nếu muốn |
| Sycamore Tree (Platanus occidentalis) | https://sketchfab.com/3d-models/f89262466563486aad2932844bb0fe0e | stevencmutter | "CC Attribution-NonCommercial-ShareAlike" | 255 174 | Y (NC-SA) nhưng nặng | |
| Loại | Tree It (giấy phép output không rõ), Kenney (kiểu), "Trees of Paris" (point cloud), Quaternius Ultimate Nature (QAL, 2.2) | | | | N | |

**Đề xuất cây (ponytail):** KHÔNG tải mô hình cây. Dựng cây thủ tục trong `Vegetation.ts`: thân = trụ 8 cạnh + 3 cành với `bark_platanus` (CC0), tán = 8–12 card lá chéo với atlas `LeafSet030` (CC0, alpha), 3 loài khác tỉ lệ / màu; LOD1 = 4 card, LOD2 = billboard 2 quad bake từ LOD0 lúc nạp. ≈ 600 / 200 / 4 tam giác; 0 giấy phép mô hình; đúng platane Paris. OGA rubberduck là phương án B nếu cây thủ tục xấu.

## 3. Texture PBR, HDRI bầu trời, cây

Giấy phép trang (đọc 2026-10-03):
- Poly Haven `https://polyhaven.com/license`: CC0 – "You can use our assets for any purpose, including commercial work", "You do not need to give credit", "You can redistribute them". → Đạt §17.20 (ghi nguồn cho lịch sự).
- ambientCG `https://docs.ambientcg.com/license/`: "Creative Commons CC0 1.0 Universal License" – "You can include the raw files in your project, for example a video game." → Đạt.

### 3.1 HDRI (Poly Haven, CC0) – dung lượng thật từ API `api.polyhaven.com/files/<slug>`
| Slug / URL | Tác giả | Giấy phép | Giờ / mây | 1K .hdr | 2K .hdr | 4K .hdr | 8K JPG tonemap | Ghi chú |
|---|---|---|---|---|---|---|---|---|
| `kloofendal_48d_partly_cloudy_puresky` https://polyhaven.com/a/kloofendal_48d_partly_cloudy_puresky | Greg Zaal, Jarod Guest (sky edit) | CC0 | midday, partly cloudy, pure sky (không nền), EV 21, WB 5400K, 869 586 lượt tải | 1,44 MB | 5,45 MB | 20,7 MB | 22,2 MB | **Ứng viên số 1**: 2K .hdr cho env + nền (≤ 25 MB) hoặc 1K .hdr env + 4K JPG nền (rẻ hơn). Mặt trời cao (Nam Phi trưa, ~60–70°) → đặt DirectionalLight riêng ở 35–45° như hiện tại, HDRI chỉ làm nền + env |
| `kloofendal_38d_partly_cloudy_puresky` https://polyhaven.com/a/kloofendal_38d_partly_cloudy_puresky | Greg Zaal, Jarod Guest | CC0 | midday, partly cloudy, EV 22 | ≈ như trên | | | | ít mây hơn 48d |
| `qwantani_puresky` https://polyhaven.com/a/qwantani_puresky | Greg Zaal, Jarod Guest | CC0 | **chiều**, trời quang (clear), EV 20 | 1,09 | 4,37 | 17,1 | | ánh chiều đúng STYLE_GUIDE nhưng thiếu mây → ghép mây shader |
| `kloppenheim_06_puresky` https://polyhaven.com/a/kloppenheim_06_puresky | Greg Zaal, Jarod Guest | CC0 | bình minh, mây rải, EV 12 | 1,12 | 4,23 | 16,6 | | mặt trời thấp, ấm – "sáng sớm" |
| `kloppenheim_03_puresky`, `kloppenheim_05_puresky` | Greg Zaal, Jarod Guest | CC0 | ban ngày, partly cloudy, EV 22 | | | | | dự phòng |
| `sunflowers_puresky` https://polyhaven.com/a/sunflowers_puresky | Sergej Majboroda, Jarod Guest | CC0 | midday, partly cloudy, WB 6550K | | | | | mây đẹp, tông lạnh |
| `drackenstein_quarry_puresky` https://polyhaven.com/a/drackenstein_quarry_puresky | Andreas Mischok, Jarod Guest | CC0 | hoàng hôn, Đức 48,55°N (vĩ độ như Paris) | | | 4K EXR 73,9 | | chỉ cho cảnh chiều muộn |
| `table_mountain_2_puresky`, `autumn_field_puresky`, `citrus_orchard_puresky`, `wasteland_clouds_puresky`, `belfast_sunset_puresky`, `rustig_koppie_puresky` | Poly Haven | CC0 | thấp nắng / quang / hoàng hôn | | | | | dự phòng, kém hợp hơn |

Tổng: 13 HDRI đạt §17.20 (CC0). ambientCG `DayEnvironmentHDRI107` (CC0) có mặt đất → kém hợp. sIBL Archive (CC BY-NC-SA 3.0) trang gốc 404 → tránh. Không HDRI nào ghi độ cao mặt trời bằng độ.

### 3.2 Texture PBR (CC0; Poly Haven: map Diffuse / nor_gl / arm (AO-Rough-Metal gộp) / Disp, 1k–8k; ambientCG: zip cả bộ)
| Hạng mục | Ứng viên (URL) | Kích thước thật | Dung lượng (JPG từng map 1k / 2k, hoặc zip ambientCG 1K / 2K) | §17.20 | Ghi chú |
|---|---|---|---|---|---|
| (a) Đá vôi Paris | `large_sandstone_blocks` https://polyhaven.com/a/large_sandstone_blocks | 3 m | Diffuse 0,75 / 2,70 MB; nor 0,71 / 2,52; arm 0,69 / 2,58 | Y | gần "ashlar" nhất – ứng viên chính tường |
| | `castle_wall_slates` https://polyhaven.com/a/castle_wall_slates, `medieval_blocks_03` https://polyhaven.com/a/medieval_blocks_03 | 2,5 / 2 m | | Y | dự phòng |
| | ambientCG `Tiles139` / `Tiles142` / `Tiles143` "limestone" https://ambientcg.com/a/Tiles139 | 2 m | zip 4,6–4,9 / 15,5–16,2 MB | Y | tấm ốp phẳng |
| (b) Mái kẽm | `box_profile_metal_sheet` https://polyhaven.com/a/box_profile_metal_sheet | 2 m | Diffuse 0,35 / 1,47; nor 0,55 / 2,48; arm 0,67 / 2,88 | Y | gân to hơn kẽm Paris – tiling 1 ô ≈ 2 m |
| | ambientCG `Metal027` / `Metal028` / `Metal029` https://ambientcg.com/a/Metal027 | | zip 6,3–7,0 / 24,9–27,2 MB | Y | kẽm patina phẳng, có Metalness |
| (c) Mái slate | `roof_slates_03` https://polyhaven.com/a/roof_slates_03 | 3 m | Diffuse 0,65 / 2,08; nor 0,79 / 2,74; arm 0,83 / 3,13 | Y | ứng viên chính (mái landmark, Luxembourg…) |
| | `roof_slates_02`, `grey_roof_tiles_02` (Poly Haven); ambientCG `RoofingTiles003` https://ambientcg.com/a/RoofingTiles003 | 3 / 1,5 m | zip 7,2 / 23 MB | Y | |
| (d) Đường nhựa | `asphalt_02` https://polyhaven.com/a/asphalt_02 | 3 m | Diffuse 0,70 / 2,93; nor 1,18 / 4,71; arm 0,28 / 1,24 | Y | 394 045 lượt tải – ứng viên chính |
| | `asphalt_01`, `asphalt_06`, `clean_asphalt` (Poly Haven); ambientCG `Asphalt033` (2,5 m, zip 9,7 / 35,9 MB), `Road007` (7,5 m, có vạch) | | | Y | |
| (e) Vỉa hè | `concrete_pavers` https://polyhaven.com/a/concrete_pavers | 1,92 m | Diffuse 0,76 / 3,09; nor 0,92 / 3,72; arm 0,70 / 2,51 | Y | ứng viên chính |
| | `concrete_pavement`, `concrete_pavement_03`, `granite_tile_04` (gần vỉa hè granit Paris), `floor_tiles_09` (Poly Haven); ambientCG `Concrete046` (zip 5,7 / 22,1 MB) | 1,8–2,1 m | | Y | |
| (f) Pavé granit | `cobblestone_floor_08` https://polyhaven.com/a/cobblestone_floor_08 | 2 m | Diffuse 0,59 / 2,29; nor 1,00 / 3,95; arm 0,20 / 0,81 | Y | ứng viên chính |
| | `cobblestone_floor_04` (1,5 m, 68 155 lượt tải), `patterned_cobblestone` (xếp quạt kiểu Paris, 2,5 m), `square_cobblestone`, `cobblestone_large_01`; ambientCG `PavingStones151` (5,4 m, zip 8,7 / 28,8 MB) | | | Y | |
| (g) Vạch đường | ambientCG `RoadLines019A…022A` https://ambientcg.com/a/RoadLines022A (71 decal alpha) | | zip 4,7–7,2 / 13,9–20,3 MB | Y | chỉ cho mũi tên / ký hiệu; vạch thường giữ procedural |
| (h) Cỏ, sỏi | ambientCG `Grass001` / `Grass004` (1,4 m, zip ≈ 10–11 / 38–39 MB), `Ground108` (sỏi sáng Tuileries), `Gravel023` / `Gravel043`; Poly Haven `bicolour_gravel` (1,9 m), `aerial_grass_rock` (15 m, bãi cỏ xa) | | | Y | |
| (i) Sắt sơn đen | ambientCG `Metal027`…, `PaintedMetal016` https://ambientcg.com/a/PaintedMetal016; Poly Haven `painted_metal_shutter` | | zip 9,5–10,3 / 34,6–37,1 MB | Y | lan can nên là vật liệu đơn sắc + alpha cutout, không cần texture |
| (j) Kính | không có texture kính rời; ambientCG `Facade009` v.v. là kính-nhôm hiện đại | | | Y nhưng lệch kiểu | kính = envMap HDRI, roughness thấp, không texture |
| (k) Normal nước | Poly Haven / ambientCG: KHÔNG có. three.js `examples/textures/waternormals.jpg` (MIT) https://github.com/mrdoob/three.js/blob/dev/examples/textures/waternormals.jpg | | ≈ 0,5 MB | Y (MIT) | hoặc giữ procedural |
| (l) Vỏ + lá cây | **`bark_platanus`** https://polyhaven.com/a/bark_platanus (đúng platane Paris) | 1,5 m | Diffuse 0,87 / 3,31; nor 1,23 / 4,82; arm 0,62 / 2,31 | Y | ứng viên chính thân cây |
| | `japanese_sycamore` https://polyhaven.com/a/japanese_sycamore (cũng Platanus); ambientCG `Bark014` / `Bark015` | 1,1 × 2,2 m | | Y | |
| | ambientCG atlas lá có alpha: `Foliage001`, `Foliage006`, `LeafSet019` / `024` / `029` / `030` https://ambientcg.com/a/LeafSet030 | | zip 2,2–5,3 / 4,6–15,8 MB | Y | không ghi loài; đủ cho tán cây billboard / card |
| (m) Atlas cửa sổ Haussmann | KHÔNG tìm được ở Poly Haven / ambientCG / cgbookcase / TextureCan | | | – | giữ cửa sổ vẽ procedural trên nền đá vôi PBR + normal map tự sinh (gờ cửa) |
| (n) Vải mái hiên | Poly Haven `hessian_230` (canvas 0,27 m), `fabric_pattern_07` (sọc); ambientCG `Fabric079` | | | Y | sọc procedural + normal canvas |
| (o) Áp phích Belle Époque (cột Morris) | Wikimedia Commons: Category:Posters_by_Jules_Chéret https://commons.wikimedia.org/wiki/Category:Posters_by_Jules_Ch%C3%A9ret (Chéret † 1932 → PD; nhiều tệp BnF-Gallica gắn CC0); vd. "A la Place Clichy. Exposition de jouets" (1881) https://commons.wikimedia.org/wiki/File:A_la_Place_Clichy._Exposition_de_jouets._affiche,_Jules_Ch%C3%A9ret.jpg – trang ghi "Creative Commons CC0 License" + PD (36,6 MB, thu nhỏ ≤ 512 px); Category:Posters_by_Henri_de_Toulouse-Lautrec https://commons.wikimedia.org/wiki/Category:Posters_by_Henri_de_Toulouse-Lautrec (PD-old-100); "Poster Cabaret des Quat'z'Arts" (1894–95) https://commons.wikimedia.org/wiki/File:Poster_Cabaret_des_Quat%27z%27Arts_by_Henri_de_Toulouse-Lautrec_1894-1895.png (PD-old) | | | Y (PD / CC0) | décor, không mô phỏng thương hiệu còn hoạt động |

Trang giấy phép khác đã đọc: cgbookcase https://www.cgbookcase.com/textures ("CC0 1.0") Y; 3dtextures.me https://3dtextures.me/about/ ("All textures … CC0") Y; TextureCan https://www.texturecan.com/terms/ ("CC0 1.0") Y; **ShareTextures** https://www.sharetextures.com/p/license "custom CC0-based license" + "No asset redistribution … without our written permission" → mâu thuẫn CC0 → xếp "không rõ", **tránh**.

### 3.3 Bầu trời không cần tải (phương án B cho #1)
- three.js `examples/jsm/objects/Sky.js` (MIT, Preetham): uniform `turbidity, rayleigh, mieCoefficient, mieDirectionalG, sunPosition`; bản dev có thêm `cloudScale, cloudSpeed, cloudCoverage, cloudDensity, cloudElevation` (mây fBm) → thay cả canvas sky + mây blob bằng 1 shader, 0 KB; env = `PMREMGenerator.fromScene(sky)`. Mặt trời đặt đúng 35–45° theo STYLE_GUIDE (HDRI thật không chỉnh được góc mặt trời). Đề xuất: **làm cả hai**, HDRI = mặc định nếu đẹp hơn trong ảnh so sánh.

### 3.4 Cây
Mô hình cây: xem mục 2.4 (nhánh người / xe / đồ phố). Texture: 3.2 (l).

## 4. Loại bỏ (không đạt §17.20 hoặc không dùng được) – tổng hợp
| Nguồn | Lý do |
|---|---|
| Mixamo (Adobe), Renderpeople free, Ready Player Me, Unity / Epic free | giấy phép độc quyền / EULA, không thuộc §17.20 (chi tiết 2.1) |
| Quaternius pack MỚI (QAL v1.0) | giấy phép mới không thuộc §17.20 – chờ người dùng (2.2); tài nguyên đã tải khi CC0 giữ nguyên |
| Sketchfab "Editorial" / "Standard" / "Free Standard" / not downloadable | cấm theo §17.20 (Wallace amcgi, Blue Wallace, Park Bench Chair, urban vehicles pack) |
| Point cloud (Parisian lamppost, Trees of Paris) | không có mesh |
| ShareTextures | điều khoản chống tái phân phối mâu thuẫn CC0 → "không rõ" |
| sIBL Archive | CC BY-NC-SA 3.0 nhưng trang gốc 404 – không xác minh được |
| Kenney, KayKit | CC0 nhưng kiểu đồ chơi (quyết định phong cách Phase 2B) |
| Tree It, BlenderKit | giấy phép output không rõ / trang redirect sang tên miền lạ |
| Poly Haven cây | CC0 nhưng 0,3–17 M tam giác – không thực dụng cho instancing |
| Mọi bản re-upload từ Google Earth / SketchUp 3D Warehouse | nguồn gốc sai giấy phép dù trang ghi CC |

## 5. Danh sách tải đề xuất (trình người dùng xác nhận MỘT lần – SPEC §17.20; chưa tải gì)
Tệp đích trong `.cache/assets/8c/` (không commit). "Tay" = Sketchfab cần tài khoản người dùng. MB tải = số trên trang / API hoặc ước tính (≈).

| # | Tệp đích | Nguồn (URL) | Giấy phép | Tác giả | MB tải | Sau xử lý | Dòng ghi nguồn (Ghi nguồn) | Dùng cho |
|---|---|---|---|---|---|---|---|---|
| 1 | `lm-notre-dame_bouille.glb` | https://sketchfab.com/3d-models/none-b5808186c49a451bbf815fbccdb727a3 (tay) | CC BY | francois.bouille | 219,6 (GLB) hoặc 90,5 (Source) | ≤ 8 MB | Nhà thờ Đức Bà: "Notre-Dame de Paris" – francois.bouille, CC BY 4.0, qua Sketchfab (đã chỉnh sửa; quét trước 2019) | T4 |
| 2 | `lm-invalides-dome_polarnick.glb` | https://sketchfab.com/3d-models/tomb-of-napoleon-the-dome-8176f57fd1194515a89ffeabac6c6d99 (tay) | CC BY | PolarNick239 | ≈ 60–150 | ≤ 6 MB | Vòm Invalides: "Tomb of Napoleon (The Dome)" – PolarNick239, CC BY 4.0, qua Sketchfab (đã chỉnh sửa) | T4 |
| 3 | `lm-flamme_edemaistre.glb` | https://sketchfab.com/3d-models/day-135-flame-of-liberty-1scanaday-90ae551a427f4855b42ae3b3bc8be5aa (tay) | CC BY | edemaistre | ≈ 30–60 | ≤ 1,5 MB | Ngọn lửa Tự do: "Day 135: Flame of Liberty – 1scanaday" – edemaistre, CC BY 4.0, qua Sketchfab (đã chỉnh sửa) | T4 |
| 4 | `lm-louis-xiv_hoanghiepvu.glb` | https://sketchfab.com/3d-models/louis-xiv-de-france-louvre-paris-a0cc0e7eee384c99838dff2857b8158c (tay) | CC BY | HoangHiepVu | ≈ 40–80 | ≤ 1,5 MB | Louvre, tượng Louis XIV: "Louis XIV de France, Louvre, Paris" – HoangHiepVu, CC BY 4.0, qua Sketchfab (đã chỉnh sửa) | T4 |
| 5 (tùy chọn) | `lm-louvre-cour-carree_hoanghiepvu.glb` | https://sketchfab.com/3d-models/none-8d7f36be9a4345b3ba3d5a991f91836f (tay) | CC BY | HoangHiepVu | ≈ 150–300 | chỉ bake texture mặt tiền 2K (≈ 1 MB) | Louvre, mặt tiền: "La Cour Carrée, Louvre, Paris" – HoangHiepVu, CC BY 4.0 (texture bake) | T4 |
| 6 | `rocketbox/<9 thư mục>` | https://github.com/microsoft/Microsoft-Rocketbox/tree/main/Assets/Avatars (git sparse) | MIT | Microsoft | ≈ 9 × 15 ≈ 135 | +3 MB trong `npc-peds.glb` | (dòng Rocketbox sẵn có) | T5 |
| 7 | `van-french_zhabotinsky.glb` | https://sketchfab.com/3d-models/french-delivery-van-low-poly-model-a350a422d200485ea57778dc42139edc (tay) | CC BY | DanielZhabotinsky | ≈ 2 | ≤ 0,15 | Xe NPC (van): "French delivery van" – DanielZhabotinsky, CC BY 4.0, qua Sketchfab (đã chỉnh sửa) | T5 |
| 8 | `car-small_scailman.glb` | https://sketchfab.com/3d-models/low-poly-small-car-ebe7c5e98a7448b5abb2eaf0cb22b766 (tay) | CC BY | scailman | ≈ 2 | ≤ 0,15 | Xe NPC (hatchback): "Low Poly Small car" – scailman, CC BY 4.0 (đã chỉnh sửa) | T5 |
| 9 | `car-sedan-eu_scailman.glb` | https://sketchfab.com/3d-models/low-poly-sedan-car-aeb2699532b4402e8b75ec8888b800b9 (tay) | CC BY | scailman | ≈ 2 | ≤ 0,15 | Xe NPC (taxi): "Low-Poly Sedan car" – scailman, CC BY 4.0 (đã chỉnh sửa) | T5 |
| 10 | `bus-city_ownguest.glb` | https://sketchfab.com/3d-models/isuzu-erga-mio-bus-050e8acd0bbc4da0902a8a874ef10fca (tay) | CC BY | own.guest | ≈ 2 | ≤ 0,2 | Xe NPC (bus): "Isuzu Erga Mio bus" – own.guest, CC BY 4.0 (đã chỉnh sửa, bỏ logo) | T5 |
| 11 | `truck-garbage_sbastuff.glb` | https://sketchfab.com/3d-models/garbage-truck-9e3400f575a541b88417e85f766fc773 (tay) | CC BY | sbastuff | ≈ 1 | ≤ 0,15 | Xe NPC (xe rác): "Garbage Truck" – sbastuff, CC BY 4.0 (đã chỉnh sửa) | T5 |
| 12 | `prop-wallace_svay.glb` | https://sketchfab.com/3d-models/fontaine-wallace-5be06c9f4f904e71a4a85da53812b8e9 (tay) | CC BY | Maurice Svay | ≈ 30–60 | ≤ 0,4 | Đài nước Wallace: "Fontaine Wallace" – Maurice Svay, CC BY, qua Sketchfab (đã chỉnh sửa) | T2 |
| 13 | `prop-morris_maxgomes.glb` | https://sketchfab.com/3d-models/french-colonne-morris-3092cbf7e3524781a82703cde08272db (tay) | CC BY | maxgomes | ≈ 20–40 | ≤ 0,3 | Cột Morris: "French Colonne Morris" – maxgomes, CC BY 4.0 (đã chỉnh sửa, áp phích thay) | T2 |
| 14 | `prop-abribus_maxipub.glb` | https://sketchfab.com/3d-models/abribus-bus-stop-bus-station-ab3c98bf93de498bb45c129afa4c3ab3 (tay) | CC BY | maxipub | ≈ 3 | ≤ 0,2 | Nhà chờ xe buýt: "Abribus, Bus stop" – maxipub, CC BY 4.0 (đã chỉnh sửa) | T2 |
| 15 | `prop-bouquiniste_alban.glb` | https://sketchfab.com/3d-models/bouquinistes-357bec3b90624ed19296f06e18ba3abd (tay) | CC BY | alban | ≈ 40–80 | ≤ 0,2 | Hộp sách bờ kè: "Bouquinistes" – alban, CC BY 4.0 (đã chỉnh sửa) | T2 |
| 16 | `prop-bench-paris_alban.glb` | https://sketchfab.com/3d-models/mini-paris-bench-a3015ce6492e4cb1bb4892492c8b96d5 (tay) | CC BY | alban | ≈ 30–60 | ≤ 0,1 | Ghế công viên: "Mini Paris bench" – alban, CC BY 4.0 (đã chỉnh sửa) | T2 |
| 17 | `prop-pigeon_dudecon.glb` | https://sketchfab.com/3d-models/797d27b68af3453e865149435df6aa30 (tay) | CC BY | dudecon | ≈ 1 | ≤ 0,1 | Bồ câu: "Animated Bird, Pigeon" – dudecon, CC BY 4.0 (đã chỉnh sửa) | T2 (tùy chọn) |
| 18 | `polyhaven/street_lamp_01` (glTF 1K) | https://polyhaven.com/a/street_lamp_01 | CC0 | Josh Dean / Poly Haven | ≈ 8 (1K) | ≤ 0,3 | Cột đèn: "Street Lamp 01" – Josh Dean, Poly Haven, CC0 | T2 |
| 19 | `polyhaven/outdoor_table_chair_set_01` (glTF 1K) | https://polyhaven.com/a/outdoor_table_chair_set_01 | CC0 | Poly Haven | ≈ 5 | ≤ 0,2 | Bàn ghế quán: "Outdoor Table Chair Set 01" – Poly Haven, CC0 | T2 |
| 20 | `polyhaven/kloofendal_48d_partly_cloudy_puresky` 1K .hdr + 4K tonemapped JPG (hoặc 2K .hdr) | https://polyhaven.com/a/kloofendal_48d_partly_cloudy_puresky | CC0 | Greg Zaal, Jarod Guest | 1,44 + ≈ 7 (hoặc 5,45) | ≈ 4–5 | Bầu trời: "Kloofendal 48d Partly Cloudy (Pure Sky)" – Greg Zaal / Jarod Guest, Poly Haven, CC0 | T1 |
| 21 (dự phòng) | `polyhaven/qwantani_puresky` 1K .hdr | https://polyhaven.com/a/qwantani_puresky | CC0 | Greg Zaal, Jarod Guest | 1,09 | | (như trên) | T1 |
| 22 | `polyhaven/textures/{large_sandstone_blocks, box_profile_metal_sheet, roof_slates_03, asphalt_02, concrete_pavers, cobblestone_floor_08, patterned_cobblestone, bark_platanus, bicolour_gravel}` 2K JPG Diffuse + nor_gl + arm | https://polyhaven.com/a/<slug> | CC0 | Poly Haven | ≈ 9 × 8 ≈ 70 | ≈ 12 MB WebP | Texture: Poly Haven, CC0 (một dòng chung + tên từng bộ) | T2 / T3 |
| 23 | `ambientcg/{LeafSet030, Ground108, Grass004, Metal028}` 2K JPG zip | https://ambientcg.com/a/<id> | CC0 | ambientCG | ≈ 16 + 10 + 39 + 27 ≈ 90 | ≈ 4 MB WebP | Texture: ambientCG, CC0 | T2 / T3 |
| 24 | `commons/posters/` 6–8 áp phích Chéret / Toulouse-Lautrec (ảnh ≤ 2 000 px) | https://commons.wikimedia.org/wiki/Category:Posters_by_Jules_Ch%C3%A9ret, …/Category:Posters_by_Henri_de_Toulouse-Lautrec | PD / PD-Art / CC0 (BnF) | Chéret, Toulouse-Lautrec | ≈ 20 | ≈ 0,5 MB | Áp phích cột Morris: Jules Chéret / H. de Toulouse-Lautrec, phạm vi công cộng (Wikimedia Commons / BnF Gallica) | T2 |
| 25 (tùy chọn, SPEC §17.7 cấm LiDAR chưa duyệt) | IGN LiDAR HD 2–3 ô quanh Invalides / Tokyo / Bir-Hakeim | https://www.data.gouv.fr/datasets/lidar-hd-ign-2022 | Licence Ouverte Etalab 2.0 | IGN | ≈ 300–600 | 0 (chỉ đo) | Số liệu: IGN – LiDAR HD, Licence Ouverte 2.0 | T4 code |
| 26 (tùy chọn) | `three/examples/textures/waternormals.jpg` (đã có trong node_modules) | https://github.com/mrdoob/three.js/blob/dev/examples/textures/waternormals.jpg | MIT | three.js | 0 | ≈ 0,3 | Nước: three.js examples, MIT | T1 |

Tổng bắt buộc (#1–4, 6–20, 22–24): ≈ 950 MB tải (Notre-Dame + scan Sketchfab + Rocketbox chiếm phần lớn), ≈ 55–70 MB sau xử lý. Không mục nào ND / "chỉ cá nhân" / không rõ. Mọi mục BY ghi "(đã chỉnh sửa)"; không có BY-SA / NC trong danh sách bắt buộc (Pavillon Sully NC-SA chỉ là dự phòng, không trong danh sách).

## Nhật ký
- 2026-10-03: tạo bảng, bắt đầu 3 nhánh nghiên cứu song song.
- 2026-10-03: phạm vi landmark thu về 8 điểm lộ trình (quyết định người dùng), Eiffel + Arc giữ nguyên.
- 2026-10-03: 3 nhánh xong; điều phối viên kiểm lại độc lập: Poly Haven / ambientCG licence, Rocketbox danh sách thư mục, Quaternius QAL v1.0, 4 API Sketchfab (Notre-Dame, Flamme, Vòm Invalides, Louis XIV) – khớp. Danh sách tải đề xuất (mục 5) chờ người dùng.
