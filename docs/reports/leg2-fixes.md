# Leg 2 – sửa lỗi ảnh hưởng cuộc đua (sau review code + hình ảnh)

2026-10-06, trên HEAD 40db8e2 (chưa commit). Nguồn: `leg2-review-code.md` (H1–H3, M1–M6), `leg2-review-visual.md`, `leg2-review-visual-2.md`.
Chỉ sửa điều ảnh hưởng người chơi / Host / lộ trình / hòm / Chặng dừng; bỏ qua thẩm mỹ theo quyết định của người dùng.

Kiểm cuối: `npx tsc --noEmit -p client` sạch · `npm run test -w client` 75 file / 864 test xanh · `npm test -w worker` 187 xanh ·
`npx vitest run --dir scripts` 120 xanh · `npm run build` (gồm `wrangler deploy --dry-run`) qua. `leg:check`: macao-demo 0 cảnh báo / 17 ô trống,
macao-demo.filled 0 / 0, mini 0 / 0, near 0 / 0, full 0 / 18 (ô ảnh Louvre, như trước). Không còn vite / wrangler / workerd / vitest chạy.
`npm run sim` (cần wrangler dev) không chạy; `scripts/sim.test.ts` (đọc đáp án từ file chặng) xanh.

## 1. Chữ "Paris" người chơi / Host thấy

- `client/src/ui/Login.ts` tiêu đề "Cuộc đua Ma Cao" (+ mã DEV `previewLogin` 'macao'); `client/src/host/main.ts` (2 tiêu đề) "Cuộc đua Ma Cao – Host".
- Phòng mặc định khi link không có `?race=` (Host thấy trong ô mã + tiêu đề, tên DO / file xuất): `config.ts net.defaultRace` + `worker/src/index.ts
  DEFAULT_RACE` 'paris' → 'macao' (test `RaceRoom.test.ts` đổi theo).
- Chặng có sẵn viết lại thành nội dung GIẢ Ma Cao, giữ id / cấu trúc / logic đáp án:
  - `macao-demo.json` / `test/macao-demo.filled.json`: tiêu đề "Chặng Demo – Ma Cao …"; L1 Ruínas (chân bậc), L2 Rua dos Mercadores (mép phố cổ),
    L3 Tap Seac, L4 São Domingos, L5 Fortaleza do Monte, L6 + Chặng dừng Largo do Senado (L4 / L5 đổi chỗ so với bản cũ, xem mục 2). Bản filled:
    nhánh A đếm cột đèn quanh đài phun (đáp án 12 giữ), nhánh B ảnh với Leal Senado, T1 đếm cột mặt tiền thư viện Tap Seac (đáp án "8" / "tám",
    thay "Quai Branly"), T2 ảnh đại bác Monte, lời về đích "tại quảng trường Senado".
  - `test/mini.json`, `test/full.json` (Host chọn được `mini`): bỏ 'bà đầm sắt', Trocadéro, "qua sông", "cầu Iéna" → Largo do Senado / vườn Vasco da Gama / Tap Seac.
  - Test đổi chuỗi theo: `leg-check.test.ts`, `sim.test.ts`, `worker/src/race/engine.test.ts`.
- README / DEPLOY: tiêu đề "Cuộc đua Ma Cao", ví dụ mã `macao-2026-11-15`, checklist "thấy Ma Cao + nhân vật ở Largo do Senado".
  LEG_FORMAT: ví dụ `macao-1`, mục 10 (ví dụ đầy đủ) chép lại đúng `mini.json` hiện tại, bảng kết quả `leg:check` cập nhật.
- `scripts/leg-check.ts`: "Quận N" → `districtLabel()` ("Freguesia Sé"); "nằm giữa sông" → "nằm giữa biển / sông (mặt nước lớn)"; bỏ câu
  Bir-Hakeim / Île aux Cygnes; ví dụ `paris-1.json` → `macao-1.json` (cả `sim.ts`). `shared/src/leg/check.ts` ví dụ múi giờ "Europe/Paris" → "Asia/Macau".
- Grep `paris|eiffel|seine|louvre|bir-hakeim|concorde` còn lại trong client/src, worker/src, shared/src, scripts: chú thích, preset screenshot
  Paris, bảng `widthByName` tên phố Paris (không khớp gì), `process-assets` Eiffel. **Giữ** "Phòng Louvre" (tên tính năng Thử thách 3, chỉ hiện khi
  chặng dùng `kind: "louvre"`; M7 không nằm trong danh sách sửa).

## 2. Điểm lộ trình bị che trong khối dựng

Nguyên nhân thật (đo bằng collider, không chỉ đường viền OSM): L6 / PS (−10,6; 10,5) cách thân Leal Senado 1,1 m (ngoài đường viền), thảm 16 × 32 m
chồng lên nhà 72 %; người chơi thử `?player=-10,16` nằm TRONG thân nhà nên bị đặt lên mái (ảnh `rv-box-night`). L1 (151; −446) nằm trên bệ Ruínas.
Thêm phát hiện: thảm (dày 0,04 m) nằm DƯỚI lớp lát calçada Largo do Senado (+0,23 m) / vỉa hè (+0,2 m) → gần như vô hình.

Điểm mới (kiểm bằng probe collider của mọi builder: ô 5 × 5 m trống, thảm 15 × 31 m lõi trống, 5 mẫu mép chạm tường):

| Điểm | Cũ (x, z) | Mới (x, z) / lat, lon |
|---|---|---|
| L1 Ruínas – chân bậc thang | 150,6; −445,7 (trên bệ) | 150,9; −369,5 · 22.196887, 113.540863 |
| L2 Rua dos Mercadores | −62,2; −71,4 (7/16 mẫu trong nhà) | −72; −70 · 22.194182, 113.538702 |
| L4 São Domingos | (là L5) 112,4; −146,2 | giữ điểm, đổi thứ tự |
| L5 Monte – chân tường phía đông | (là L4) 331; −397,5 (chạm chân tường dốc) | 336; −398 · 22.197144, 113.542658 |
| L6 + PS Largo do Senado | −10,6; 10,5 | 64; −32, PS `"yawDeg": -40` (dọc quảng trường) · 22.193839, 113.540021 |
| mini / full L1 | −10,6; 10,5 | 64; −32 (bãi xe 33; −8 · 22.193622, 113.53972) |
| near: xuất phát / L1 / L2 + PS | −10,6; 10,5 / −20,8; −55,9 / 30; −29,9 (đều chạm nhà) | 43,2; −24,4 / 86; −60 / 64; −32 (`yawDeg` −40) |

L4 / L5 đổi chỗ vì São Domingos chỉ cách Largo 124 m: đoạn L5 → L6 còn 11 ứng viên xe đạp (< `serverBikes.minCandidates` 12, test
`spawnCandidates.test.ts`); thứ tự mới Monte → Senado 456 m, mọi đoạn 12. Phía sau nhà thờ toàn nhà, không có chỗ đặt.

Mã:
- `config.ts raceClient.mat.lift` 0,04 → 0,3 (độ dày thảm, trên lớp lát) và `net/ClueBoxes.ts matTilt()` nghiêng thảm theo dốc địa hình (hai đầu /
  hai bên, Euler YXZ) – quảng trường dốc không còn chôn đầu dốc lên; test `ClueBoxes.test.ts` (góc thảm nằm trên mặt phẳng dốc, 4 hướng).
- `leg:check` (rẻ, không chạy builder địa danh được vì scripts không có DOM / three types): CẢNH BÁO khi điểm nằm trong / sát ≤ 1,5 m đường viền
  một địa danh (trừ quảng trường đi được: Largo do Senado, Flor de Lótus, sân Barra của A-Ma), và CẢNH BÁO khi thảm Chặng dừng (16 × 32, theo
  `yawDeg`) chồng lên nhà > 5 %. Bản demo cũ → 3 cảnh báo (Ruínas L1, Leal Senado L6, thảm 72 %); các chặng có sẵn mới → 0. Test mới trong
  `leg-check.test.ts`. Giới hạn (ghi trong LEG_FORMAT mục 7 + TODO): khối dựng vượt ra ngoài đường viền (bậc lớn Ruínas dài 60 m) không thấy → luôn xem ảnh.

Ảnh đêm (`&quality=high`): `screenshots/rv/fix-mat-on.png` (đứng trên thảm: thảm đỏ + viền vàng rõ, nhân vật đọc rõ), `fix-mat-largo.png` (thảm +
cột đỏ thấy từ đài phun), `fix-ruinas-box.png` (hòm L1 + cột vàng ở chân bậc, mặt tiền phía trên, "Bấm F để mở hòm"). Còn lại: vài sóng calçada
nhô qua mép tây nam thảm (mặt đất không phẳng hẳn) – thảm vẫn đọc rõ.

## 3. Collider chặn đường công cộng (H2, H3, M1, M2, M3)

Probe thành test: `client/src/world/landmarks/paths.test.ts` – lấy mẫu mọi road / footway / pedestrian / steps OSM của 323 chunk mỗi 2 m trên
địa hình đã carve; mẫu BỊ CHẶN khi thân người (chân + 0,4 … 2 m) nằm trong khối collider địa danh (số mặt phía trên lẻ) hoặc đoạn 2 m tới mẫu kế
cắt tường ở ngang hông; ramp bậc (`stairs`) đi được (chân đứng trên ramp). Chạy cho cả 31 địa danh (< 1 s), so với danh sách `ALLOWED` có số mẫu tối đa.

Sửa:
- **H2 / M1 `m2.ts church()`** (Santo Agostinho, São Lourenço, Ermida da Penha): bệ + collider theo đa giác OSM (`prismMesh` + `s.prism([ring])`
  một khối từ chân tới đỉnh tường), không còn khung chữ nhật bao (+0,8 / 1,2 m); bậc trước bắt đầu ở mép đường viền; độ cao bệ = cao nhất TRONG
  đường viền (`maxInside`). Calçada do Tronco Velho, Largo de Santo Agostinho, footway + bậc lên São Lourenço: 0 mẫu chặn.
- Ramp bậc của m2 (`stairs()`: nhà thờ, Monte, A-Ma, Kun Iam Tong) thành collider riêng gắn `stairs` (đi bộ được, xe đạp không lên – như bậc OSM).
- **H3 `monte()`**: KHÔNG có đường OSM nào cắt tường pháo đài (kiểm cắt đa giác: 0); 394 mẫu "trong khối" là lối đi TRÊN sân thượng (DEM bị làm
  phẳng nên sân là khối dựng, mặt trên là mặt đi), tới bằng bậc cổng NE. Giữ lăng trụ đặc (bỏ đi sẽ để lại hang dưới sân); không có mẫu "tường".
  Ghi trong `ALLOWED` với lý do.
- **M2 Ruínas `mf1.ts`**: chân bậc lớn rút từ local z 68,65 → 63,5 (way pedestrian ngang chân bậc z ≈ −373 không còn đụng thành bậc); thêm hai
  flight bên (`ruinas.sideStairs`, z 10, rộng 3,5 m, ramp `stairs`) nơi footway ngang Largo trước mặt tiền rời bệ ở cả hai mép (trước: rơi 9 m / tường
  9 m); tường phế tích khu học viện bỏ collider (cao 1,1 m, khe không khớp footway). NPC đi bộ lún bậc: `npc.landmarkZones` (5 vòng loại trừ dọc bệ
  + bậc) cộng vào `npcZones()` trong `main.ts`. Lối OSM trên mặt bệ (Largo, bậc phía tây, footway qua gian giữa) = mặt đi, ghi trong `ALLOWED`.
- **M3 Colosseum (`m3.ts`)**: collider = vành tường (hình elip có lỗ, rộng 3 m) chỉ TỪ trên tầng vòm dưới cùng; footway xuyên vòm đi được (0 mẫu).
- **M3 A-Ma (`m2.ts ama()`)**: các tầng đá = dải của đa giác OSM (`bandOf`, Sutherland–Hodgman), không phải khung chữ nhật: Rua de S. Tiago da Barra
  + footway trong hốc tây bắc (cạnh quảng trường Barra) trống. Còn 1 mẫu = đầu footway đúng cửa chùa (bậc trước, cách tâm bậc 1,3 m).
- Thêm (rẻ, cùng dạng): `ringWall` nhận `gates` (lỗ theo tọa độ) → cổng ở chỗ footway OSM cắt tường vườn **Lou Lim Ioc** (819,3; −727,2); tường
  khuôn viên **Casa do Mandarim** có cổng tại (−465,1; 535,8) (`mandarim.gates`). Trước: không có lối vào.

Còn lại (`ALLOWED`, lý do trong test; báo cáo đầy đủ): lối vẽ XUYÊN nhà / podium theo OSM (giữ đặc có chủ ý): Macau Tower (service 43, footway 4),
Lisboa footway 20, Wynn service 36 + 2 tường, Sands (Largo de Monte Carlo 7, footway 3, service 1), Science Center footway 16, Fisherman's Wharf service
36 (đường dưới trung tâm hội nghị), Bank of China 1, Casa do Mandarim 2 (sân trong), Lou Lim Ioc 2 (hiên). Chưa xử lý: Lou Lim Ioc 2 mẫu Estrada de
Adolfo Loureiro sát tường (đường rộng, còn nửa kia), Portas do Cerco (service 26, secondary 2, footway 16 – khu cửa khẩu sát mép bắc bản đồ).
Ghi trong `TODO.md` mục "Leg 2 – Ma Cao: an toàn cuộc đua".

## 4. An toàn cho người tổ chức

- `bridgeAudit.test.ts` cạnh `KNOWN_MACAO` và `npc/roads.test.ts` cạnh `KNOWN_STEPS`: dòng `TODO(organiser safety)` – bậc thật, Sai Van sát Macau
  Tower, không đặt điểm / bãi xe / lộ trình xe đạp trên các cầu này. Thêm vào `TODO.md` và `docs/LEG_FORMAT.md` mục 7.
- `allChunks.test.ts`: chú thích sửa – điều kiện `≥ BRIDGE_PIECES` cho ngân sách 120k áp cho **56 / 323** chunk (cả chunk nội đô 1_1, 2_1, 3_-4),
  không phải 7; giới hạn không đổi.

## 5. Dốc đường dựng đứng cạnh Bank of China (rv-boc-ave)

Nguyên nhân: DEM AWS là mô hình BỀ MẶT; `scripts/ground-dem.ts` chỉ làm mờ nơi có nhà OSM, nên gai radar ngoài footprint đứng nguyên trên đường:
lưới cao (330, 450) = 10,4 m giữa các nút −2…−3 m (gờ +12 m chắn Av. Comercial de Macau / Av. Dr. Mário Soares). Không phải cầu (không có `bridges`
ở đó). Quét toàn bản đồ: 654 cụm đường có dốc > 30 % trên 4 m, 152 cụm > 100 %.

Sửa gốc: `ground-dem.ts` coi mọi nút trong 8 m quanh tim đường OSM là "đã xây" (làm mờ đầy đủ như dưới nhà); chạy lại `fetch-dem` (cache) +
`ground-dem` → `client/public/data/elevation.bin` mới (elevation.json không đổi). Quanh BOC giờ là dốc trơn −1,7 … −11 m; toàn bản đồ 301 cụm > 30 %,
92 > 100 % – phần lớn còn lại là mép kè / biển (carveRiver: −14 → −24 trong 5 m), không phải gờ trên phố. Hệ quả: nhánh rẽ Viaduto da Estrada da
Bela Vista (1405, −1262) có bậc mặt cầu 0,97 m (đầu hai ramp lệch nhau 1 m sau khi làm mờ; cùng giới hạn `buildDecks`) → thêm vào `KNOWN_STEPS` có ghi
chú + TODO. Các test địa danh / cầu / probe đường khác vẫn xanh trên DEM mới.

## 6. Thảm Chặng dừng ban đêm chói

`lighting.pit.rim` 1,6 → 0,5 (≈ × 0,3). Ảnh `fix-mat-on.png` / `fix-mat-largo.png` (`&quality=high`, đêm): viền vàng rõ, không còn dải trắng che nửa
màn hình; nhân vật đọc rõ trên thảm.

## 7. "Đi được vào trong podium Wynn" (rv-wynn-ave)

Không thiếu collider: (650, 640) nằm trong tháp Wynn (h 94,5) và podium (h 23,1), cả hai có lăng trụ collider (`renderPart` → `sink.prism`);
probe mục 3 cho thấy tường podium chặn đường từ bên ngoài (Wynn / Lisboa / MGM / Sands đều qua `renderPart`). Người chơi đứng trong vì URL thử
`?player=` đặt thân TRONG khối: collider Rapier là mặt (vỏ rỗng), tia tìm mặt đất bắt đầu dưới mái nên thân đứng trên đất bên trong. Trong cuộc đua
thật không xảy ra: điểm xuất phát trong nhà là LỖI `leg:check`; vào lại dùng vị trí cũ (ngoài trời); "Kẹt?" về chỗ đã đứng. Không sửa mã; ghi TODO.

## 8. Trang không `__READY__` với thảm ở (0, 0) (rv2-mat-far)

Không tái hiện: `/?player=-4,12,0&boxes=PS,0,0&mat&wait=1.5&camMode=far` đặt `__READY__` bình thường trên cây sửa và trên một worktree tạm của
HEAD 40db8e2 (cả `&quality=high`), ảnh giống ảnh review (người chơi ép vào tường Leal Senado). Không thấy vòng lặp ở spawn / thảm; kết luận: hiện
tượng của lần chụp (máy bận / SwiftShader chậm hơn 90 s), không phải treo client. Worktree tạm đã xóa.

## Tệp đã đổi

client: `ui/Login.ts`, `host/main.ts`, `config.ts`, `main.ts`, `net/ClueBoxes.ts` (+ test), `world/landmarks/m1.ts`, `m2.ts`, `m3.ts`, `mf1.ts`
(+ `mf1.test.ts`), `world/landmarks/paths.test.ts` (mới), `world/allChunks.test.ts`, `world/bridgeAudit.test.ts`, `npc/roads.test.ts`,
`geo/mapData.test.ts` (chú thích), `public/data/elevation.bin`. worker: `src/index.ts`, `src/RaceRoom.test.ts`, `src/race/engine.test.ts`, 5 chặng
`legs/`. shared: `leg/check.ts`, `leg/leg.test.ts`. scripts: `leg-check.ts` (+ test), `sim.ts`, `sim.test.ts`, `ground-dem.ts`. docs: README, DEPLOY,
LEG_FORMAT, TODO. Ảnh: `screenshots/rv/fix-*.png`.
