# Leg 2 – rà soát đồ hoạ thế giới game (agent a5)

2026-10-10, nhánh `audit-a5` (từ main 5d18c66). Phạm vi: mọi thứ người chơi thấy ngoài 31 địa danh (địa hình, đường, vỉa hè, vạch,
bậc thang, cầu, nhà thường, đèn / đồ phố / cây, biển và hồ, trời / sương, bóng, bloom, NPC, nhân vật, hòm / thảm, minimap, lỗi console,
hiệu năng). Địa danh (`world/landmarks/*.ts`) do 4 agent khác rà: không đụng.

Cách làm: 42 điểm (bảng dưới) chia theo 5 giáo xứ, loại đường, bờ biển / hồ, đồi, công viên, nút giao. Mỗi điểm 1 ảnh tầm mắt người chơi
(`/?player=x,z,yaw&quality=high`, đêm) + phần lớn có 1 ảnh xiên 30–55 m; ảnh ngày (`&time=day`) chỗ cần đọc hình khối; số đo bằng script tạm
(độ cao lưới đã đào, mực hồ, độ hở sàn cầu, số đồ phố) rồi xoá. Chụp bằng script lô tạm (một Vite + Chrome, cổng 5305), SwiftShader.
Ảnh trong `screenshots/a5/` (không commit): `p-<điểm>` / `o-<điểm>` = khảo sát, `a5-<chủ đề>-before/after` = trước / sau khi sửa.

## Điểm đã xem

| # | Nơi | Toạ độ (x, z) | Ảnh |
|---|---|---|---|
| 1 | Largo do Senado (gốc) | 57, −23 | p-senado, o-senado, a5-senado-after |
| 2 | Khu xuất phát – Science Center | 1835, 707 | p-start-sci, o-start-sci, box-start, a5-box-start |
| 3 | Portas do Cerco (cửa khẩu, bắc) | 960, −2481 | p-cerco, o-cerco |
| 4 | Porto Interior – Rua das Lorchas | −402, −55 | p-lorchas, o-lorchas |
| 5 | Rua do Almirante Sérgio (cảng trong) | −855, 690 | p-sergio, o-sergio |
| 6 | A-Ma / Barra | −861, 798 | p-ama, o-ama, e-west |
| 7 | Rua da Felicidade (đèn lồng) | −190, −102 | p-felicidade, o-felicidade |
| 8 | Travessa do Mastro (hẻm) | −170, −141 | p-barca, o-barca |
| 9 | Av. de Almeida Ribeiro / Praia Grande | 148, 133 | p-praia, o-praia |
| 10 | Av. da Amizade (Sé, primary) | 1383, 132 | p-amizade, o-amizade, a5-bridge-amizade-* |
| 11 | Rua do Campo | 410, −14 | p-campo, o-campo, a5-campo-after |
| 12 | Av. Sir Anders Ljungstedt (NAPE) | 1022, 616 | p-ljungstedt, o-ljungstedt |
| 13 | Nút Lisboa – Av. Infante D. Henrique | 375, 376 | p-lisboajct, o-lisboajct |
| 14 | Estrada de D. Maria II (đồi, Fátima) | 1792, −1112 | p-mariaII, o-mariaII |
| 15 | Av. da Amizade bắc (giữa biển và hồ chứa) | 2345, −731 | p-amizadeN, o-amizadeN, a5-lake-reservoir-street-* |
| 16 | Rua Nova da Areia Preta | 1584, −1631 | p-areiapreta, o-areiapreta |
| 17 | Rua da Emenda (phố đi bộ, Santo António) | 480, −1015 | p-emenda, o-emenda |
| 18 | Rua do Patane (living street) | 93, −859 | p-patane |
| 19 | Rua da Ribeira do Patane (bờ cảng) | 37, −1043 | p-ribeira |
| 20 | Rua do Bispo Medeiros (São Lázaro) | 758, −731 | p-bispo |
| 21 | Viaduto Av. de Horta e Costa (cầu cạn L2) | 1002, −824 | p-horta |
| 22 | Rua de João de Almeida (São Lázaro) | 635, −341 | p-ferreira |
| 23 | Hồ Sai Van – Av. Panorâmica | −1064, 1030 | p-saivanlake, o-saivanlake, a5-lake-saivan-day-* |
| 24 | Ponte de Sai Van (cầu biển, rìa nam) | −772, 1466 | p-saivanbridge |
| 25 | Ponte da Amizade (cầu biển, rìa đông) | 2452, −414 | p-amizadebr |
| 26 | Calçada do Embaixador (bậc thang) | 10, −449 | p-embaixador |
| 27 | Pátio de Hó Chin Sin Tong (bậc thang) | 326, −186 | p-hochin |
| 28 | Vườn Lou Lim Ioc (ao) | 887, −770 | p-loulim, a5-lake-loulim-* |
| 29 | Praça Flor de Lótus | 1455, −90 | p-lotus |
| 30 | Rotunda S. João Bosco (vòng xuyến) | 1345, −923 | p-bosco |
| 31 | Đồi Guia | 1052, −326 | p-guia |
| 32 | Đồi Monte | 314, −399 | p-monte |
| 33 | Calçada / Pátio da Penha (đồi Penha) | −415, 681 | p-penha |
| 34 | Hồ Nam Van – Caminho Marginal do Lago | 314, 582 | p-namvan, o-namvan, a5-lake-namvan-* |
| 35 | Macau Tower – Praça do Lago Sai Van | −167, 1476 | p-tower, o-tower, e-south |
| 36 | Bờ NAPE – tượng Kun Iam | 1310, 872 | p-kuniam, o-kuniam |
| 37 | Fisherman's Wharf – Terraço das Gôndola | 1800, 118 | p-wharf, o-wharf |
| 38 | Hồ chứa Reservatório | 1933, −650 | a5-lake-reservoir-day-* |
| 39 | Ao cạnh Trung tâm Văn hoá | 1780, 380 | a5-lake-scipond-day-* |
| 40 | Cầu Nobre de Carvalho qua hồ Nam Van | 420, 900 | a5-lake-nobre-* |
| 41 | Cầu vượt bộ hành Travessa da Guelra | −218, −710 | a5-bridge-guelra-* |
| 42 | Lối "metro" tại OSM subway_entrance | −976, −562 | a5-paris-metro-* |

## Lỗi tìm thấy

### ĐÃ SỬA

**1. Hồ / ao: đất DEM nhô khỏi mặt nước, mặt hồ lơ lửng trên bờ (NẶNG, thấy từ phố).** Nước không phải biển (Nam Van, Sai Van, hồ chứa
Reservatório, ao Lou Lim Ioc, hồ Wynn và 12 ao khác) đặt ở *trung bình* độ cao các đỉnh viền + 0,1 m, đất bên trong không hạ. Đo trên lưới
đã đào: nút đất cao hơn mặt nước Nam Van 1 909 / 16 276 (tới +35 m), Sai Van 1 860 / 7 934, hồ chứa 1 848 / 13 975, ao Lou Lim Ioc 35 / 93,
hồ Wynn 49 / 126; dải nâng bờ kè của biển (183 m) cũng nâng đáy hồ cạnh biển. Mặt Nam Van ở −12,6 trong khi biển −21 và nửa viền hồ thấp
hơn −17. Hệ quả thấy được: từ Av. da Amizade nhìn sang hồ chứa là một **đồi xám khổng lồ** thay cho mặt nước
(`a5-lake-reservoir-street-before`), "đụn cát" giữa hồ Nam Van nhìn từ Lisboa / Wynn (`a5-lake-wynn-day-before`, chính là "vòm khaki ở hồ
Wynn" của review trước), nhánh đông bắc ao Lou Lim Ioc bị đất phủ thành bãi xám (`a5-lake-loulim-top-day-before`).
Sửa (`world/Terrain.ts` + `Water.ts`): `carveRiver` tính mức mỗi hồ = phân vị `water.lakeRim` (5 %) độ cao dọc viền **trước** khi đào biển
+ `otherLift`; sau khi đào biển mọi nút trong hồ hạ ≥ `water.lakeDepth` (0,4 m) dưới mặt nước, nút đất kề hồ và đảo (lỗ OSM) nâng tới độ
cao viền (không còn mặt nước treo trên bờ thấp; nút đáy biển giữ nguyên); `waterLevelOf()` dùng chung cho `createWater`. Sau sửa: 0 nút
nhô; Nam Van / hồ chứa về ≈ mực biển (−20,9 / −22,9), Sai Van −17,3. Ảnh sau: `a5-lake-reservoir-street-after` (mặt hồ phẳng), 
`a5-lake-wynn-day-after` (hết đụn, tia nước Wynn mọc từ mặt nước), `a5-lake-loulim-top-day-after` (ao đủ nhánh), `a5-lake-namvan-*-after`,
`a5-lake-nobre-after` (đoạn cầu Nobre de Carvalho qua hồ không còn bị nâng 6 m so với đoạn qua biển). 4 "đảo" còn lại giữa Nam Van là đảo
thật (4 vành trong của multipolygon OSM 7588101). Test: `Terrain.test.ts` (hồ tổng hợp có gò DEM + hồ trong dải kè + bờ trũng; dữ liệu thật:
không nút nào trong hồ chạm mặt nước).

**2. Cầu vượt / cầu cạn trên đất thành bức tường chắn phố (NẶNG, cả gameplay).** `BridgeBuilder` chỉ nâng sàn layer ≥ 2; cầu vượt OSM
layer 1 (cầu bộ hành qua phố, cầu cạn nhánh thấp, đường LRT, sàn dịch vụ) nằm sát mặt đất nhưng vẫn có lan can 1,1 m + mép sàn: 299 / 384 cầu
trên đất hở < 3 m. Thấy rõ: tường đen chắn ngang Av. da Amizade (`a5-bridge-amizade-before`, `p-amizade`), Travessa da Guelra
(`a5-bridge-guelra-before`), tường đen cong dọc lối dạo hồ Nam Van (`p-namvan`). Collider = mọi tam giác hiển thị → chặn người / xe đạp.
Sửa: sàn không nâng và không qua nước / hố (> 3 m dưới giữa sàn) thì không có lan can (305 sàn; 214 sàn qua nước / được nâng giữ nguyên).
`ponytail:` cầu vượt thật cần nâng cả bậc / dốc lên (way OSM khác) → ghi TODO. Ảnh sau: `a5-bridge-amizade-after`,
`a5-bridge-amizade-street-after`, `a5-bridge-guelra-after`, `a5-lake-namvan-street-after`. Test: `RoadBuilder.test.ts`.

**3. Đồ phố Paris còn sót (VỪA, ngay khu Senado).** 397 cột quảng cáo Morris (cột xanh dán áp phích kiểu Paris, 1 / 6 nút giao, có cả ở
(−1, −6,5) và (23,5; 2,7) cạnh Largo do Senado, `a5-bridge-guelra-before`) và 6 lối "Métropolitain" kiểu Guimard (vòm sắt xanh, đèn cam,
giếng bậc) tại điểm OSM `subway_entrance` (ga LRT Barra, (−976, −562)) (`a5-paris-metro-before`). Sửa: `props.morrisOneIn: Infinity`,
`props.metroEntrances: false` (Leg 1 giữ được bằng 6 / true). Ảnh sau: `a5-paris-metro-after`, `a5-bridge-guelra-after`. Test:
`StreetProps.test.ts` (logic cũ chạy với cấu hình Paris; cấu hình Macao: 0 Morris, 0 metro).

### CHƯA SỬA (lý do)

| Lỗi | Mức | Ảnh | Vì sao chưa sửa |
|---|---|---|---|
| Bờ hồ giờ là dốc đất trong 1 ô lưới 5 m (răng cưa màu đá khi nhìn từ trên, cao 3–9 m ở hồ chứa / Nam Van) | NHẸ | a5-lake-reservoir-day-after | Muốn tường kè như biển phải gắn `river` cho hồ lớn trong `build-chunks` (đổi water.json + bậc kè + khe cầu + chunk): cần anh quyết |
| Vệt sáng mảnh ngang đường ở xa: vũng sáng đèn đường là mặt phẳng ở cao độ vỉa hè, trên đỉnh dốc / phố dốc nhô khỏi mặt đường | NHẸ | p-mariaII, p-patane | Đã thử tách vũng 2 cao độ (vỉa hè / lòng đường): không đỡ (nguyên nhân là dốc) → bỏ; cần bộ instance riêng có nghiêng |
| Nước gần bờ nhiều đèn nhìn sát mặt nước sáng nhạt như nền đất (phản chiếu giả `waterLights.strength` 4) | NHẸ | p-amizadeN, o-amizadeN | Chỉnh thẩm mỹ |
| Bờ Chu Hải / Vạn Tử (tây cảng trong) là tấm phẳng không nhà | NHẸ | e-west | Thiếu dữ liệu OSM |
| Dải cửa hàng trên phố dốc: phần dưới mặt nền nhà (≤ 3 m, `groundSpan`) là dải tối kéo giãn | NHẸ | p-areiapreta | Thẩm mỹ (giống bệ nhà) |
| Sàn cầu L2 / L3 trên đất nổi 6–12 m, đầu sàn không có dốc (Sai Van) | đã biết | p-saivanbridge | `KNOWN_MACAO`, TODO cũ |
| Tường hồi trơn cao (nhà kề ở chunk khác) | đã biết | p-felicidade, p-embaixador | ponytail cũ của BuildingBuilder |

**Cho agent địa danh (không phải phạm vi a5):** (a) hồ Wynn (`m3.ts`, `K.lake`): vòng đèn chân tia nước đặt ở `ctx.height(K.x, K.z) + 0.05`,
nay đất trong hồ thấp hơn mặt nước `water.lakeDepth` → vòng nằm dưới nước 0,35 m (tia nước vẫn mọc lên); nên đặt theo mặt nước. Các địa danh
khác có nước trong / sát đường viền: A-Ma (Lago de Barra), Cultural Centre, Sands, Lisboa, Penha, Monte, Ruínas, Lou Lim Ioc (cầu Chín khúc
nay cao hơn mặt ao 2,8 m vì hai đầu cầu nằm trên bờ cao). (b) Science Center: dải sáng trắng cháy chạy dọc toà nhà thấp (`p-start-sci`).

### Đã kiểm, ổn
Xe NPC chạy bên trái đúng chiều, đèn pha / hậu rõ (p-saivanlake, p-praia, p-penha); người đi đường chạm đất; nhân vật + ba lô không xuyên
khi đứng / đi; biển tên phố Hoa + Bồ đọc được ban đêm (p-penha); đèn lồng, biển neon, cửa sổ sáng; bậc thang có tay vịn + dải sáng mũi bậc
(p-embaixador, p-hochin); thảm Chặng dừng + cột đỏ rõ ban đêm (a5-box-start); minimap đọc tốt; bờ biển + tường kè + phản chiếu đèn bờ;
bóng không lốm đốm / tách rời; không z-fighting dễ thấy. **Console:** mọi lần chụp ổn định không có lỗi; lỗi "Failed to fetch" /
"computeBoundingSphere NaN" chỉ xuất hiện đúng lúc Vite nạp lại trang giữa khi tôi đang sửa file (đã chụp lại `a5-campo-after`: sạch).

## Hiệu năng (SwiftShader, 1280 × 720, chất lượng cao)
- Tầm mắt (37 điểm): draw call 130 / 363 / 462 (min / trung vị / max), tam giác 0,39 / 0,93 / 1,29 triệu. Xiên 30–55 m (22): 131 / 296 / 443
  call, 0,33 / 0,76 / 1,24 triệu.
- NPC chiếm ≈ 45 % tam giác: Senado 380 call / 1,11 triệu → `npc=0` 312 / 0,62 triệu; Travessa do Mastro 434 / 1,29 triệu → 366 / 0,77
  triệu (người đi đường Rocketbox ≈ 9 nghìn tam giác ở LOD0 ≤ 30 m). Senado chất lượng thấp: 343 call / 1,06 triệu.
- Bản sửa không thêm draw call (lan can bớt 32 % tam giác `railing`; hồ chỉ đổi độ cao lưới; bớt 397 cột Morris + 6 giếng metro).
  Thời gian `carveRiver` + hồ: ≈ 160 ms một lần lúc vào game (Node).

## Tệp đổi
`client/src/world/Terrain.ts` (+ test), `Water.ts`, `BridgeBuilder.ts`, `StreetProps.ts` (+ test), `RoadBuilder.test.ts`,
`client/src/config.ts` (khối `water`: `otherLift` chú thích, `lakeRim`, `lakeDepth`; khối `props`: `morrisOneIn`, `metroEntrances`), `TODO.md`.
Không chạy lại dữ liệu (`build-chunks` / `build-graph` / DEM). Kiểm: `npx tsc --noEmit -p client` sạch; `npx vitest run` trong `client`
72 file / 822 test xanh (gồm `src/world` 24 file / 208 test, `bridgeAudit`, `allChunks`, `paths`).
