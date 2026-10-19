# Leg 3 – rà soát 27 địa danh Bruxelles

Phạm vi: `client/src/geo/landmarks.ts`, `client/src/world/landmarks/` (file mới `c.ts`, `b.ts` chỉ thêm `export`, `index.ts` nối `c`),
`paths.test.ts` (chỉ bảng `ALLOWED`). Không commit. Ảnh kiểm tra: `npm run screenshot lm-<id>` (góc nhìn `view` đã quay về phía mặt tiền).

## 1. Rà OSM id / chiều cao / tên

Đối chiếu từng id với `.cache/osm` (tags `name`, `wikidata`, vị trí): 26/27 đúng công trình.

| Lỗi tìm thấy | Xử lý |
|---|---|
| `gare-centrale` trỏ `way/474210035` + `036` = hai **sân ga metro ngầm** (railway=platform, layer −2), dựng ra 0 tam giác | Đổi sang `way/674050897` (`building=train_station`, 5 tầng, tâm ≈ (323, 138)). Đã chạy lại `npm run build-chunks` (2 s, chỉ đổi gắn nhãn landmark). |
| `carillon-mont-des-arts`, `hotel-de-ville` có `kind=artwork` / `townhall` không phải building | Giữ id; chi tiết dựng bằng code (carillon) hoặc từ building:part (Hôtel de Ville). |
| 5 địa danh không có chiều cao OSM | Thêm `height` trong registry, mỗi số ghi **ước lượng** trong comment (xem bảng dưới). |

Tên tiếng Việt trong registry giữ nguyên (đã đúng nghĩa; `Maison du Roi` = Broodhuis).

Chiều cao dùng:
- Có trong OSM: Tour du Midi 150 m (part), Tour Rogier 150 m, Madou Plaza 120 m, Berlaymont 55 m, Arcades du Cinquantenaire 45 m, tháp Hôtel de Ville (part 92 m + tháp dựng thêm ≈ 96 m, Wikipedia).
- Cathédrale: OSM part 64 m, dựng thêm lên ≈ 69 m (số công bố của hai tháp, Wikipedia – chưa đối chiếu lại nguồn khác).
- Ước lượng (không có nguồn đo): Palais de Justice thân 48 m + mái vòm đến ≈ 104 m (Wikipedia 104 m; OSM part ghi 116 m, bỏ vì tính từ chân đồi Marolles), Palais de la Nation 22 → 26 m có mái, Thư viện Hoàng gia 32 m, Tháp Sainte-Catherine 30 m, Gare Centrale 18 m, Maison du Roi / Bourse / La Monnaie / Botanique / các nhà thờ: số ước lượng nằm trong `c.ts`.
- Chưa kiểm: Rogier (OSM 150) và Madou (OSM 120) có thể khác số công bố; giữ OSM.

## 2. Chi tiết dựng bằng code (`world/landmarks/c.ts`)

Bộ dựng chung: `facing()` (xoay khung theo hướng mặt tiền: la bàn hoặc "về phía Grand-Place"), `frontAt()` (đường mặt tiền thật theo viền OSM), cổng vòm nhọn, hoa hồng, cột + mái đầu hồi (`portico`), tháp vuông / tròn + chóp (`towerAt`), kính (`glassSkin`), dải cửa sổ (`windowBands`). Mọi chi tiết không rắn; collider chỉ của thân (renderPart).

| Địa danh | Chi tiết |
|---|---|
| Cathédrale St-Michel | Hai tháp nâng lên ≈ 69 m + 4 tiểu tháp mỗi tháp, cửa sổ lancet, cổng chính vòm nhọn, hoa hồng, đầu hồi gian giữa (mặt tiền hướng Tây). |
| Maison du Roi | Mái dốc 4 mái, 4 tháp góc mái đồng xanh + đỉnh vàng, hàng 5–6 vòm nhọn tầng trệt, đầu hồi giữa (hướng Grand-Place). |
| Palais de Justice | Bỏ trụ mái vòm mỏng của OSM; dựng trống 16 cột + mái vòm kẽm + đỉnh vàng; mặt tiền 8 cột + tympan. |
| Palais de la Nation | Mái hông đá đen, mặt tiền 6 cột + tympan. |
| Bourse / La Monnaie | Mái dốc (Bourse), mặt tiền 10 / 6 cột + tympan; La Monnaie thêm khối sân khấu phía sau. |
| St-Jacques-sur-Coudenberg | Mặt tiền 6 cột + tympan, trống và mái vòm phía sau. |
| Sainte-Catherine, Saint-Nicolas, Notre-Dame du Sablon, Notre-Dame de la Chapelle, Béguinage, Riches Claires | Hàm `church()`: mái đầu hồi theo trục viền OSM, tháp mặt tiền (chóp kim tự tháp hoặc baroque), cổng vòm; Sainte-Catherine và Sablon thêm mũi tháp giữa mái. |
| Tour Sainte-Catherine | Tháp tròn theo viền OSM, chóp baroque. |
| Carillon Mont des Arts | Tháp đồng hồ nhỏ (viền OSM chỉ là đoạn 5 m) có mặt đồng hồ, chóp xanh, tượng vàng cách điệu. |
| Berlaymont, Gare Centrale | Mặt dựng kính + gờ kim loại quanh viền (`glassSkin`). |
| Thư viện Hoàng gia, Justus Lipsius | Dải cửa sổ tối mỗi 3,2 m, cả mặt trong sân (`windowBands`). |
| Tour du Midi, Rogier, Madou | Khối máy + cột ăng-ten trên đỉnh; Rogier bỏ khối đá 150 m do part không cao được ngoại suy (`partsOnly`). |
| Botanique | Nhà kính ghép (mái tròn kính) + rotonde mái vòm đồng ở giữa. |
| Hôtel de Ville, Palais Royal, Arcades Cinquantenaire | Giữ nguyên (b.ts). |

## 3. Kiểm tra

- `cd client && npx tsc --noEmit -p .`: sạch.
- `npx vitest run src/world/landmarks`: 21/21 pass. `paths.test.ts` đang đỏ sẵn (bảng `ALLOWED` còn là địa danh Macao, 17 tuyến OSM đi xuyên viền công trình: bậc thang Gare Centrale / Palais de Justice, lối trong Thư viện, Justus Lipsius…); đã thay bảng bằng số đo hiện tại cho Leg 3, **đây là danh sách chấp nhận chứ chưa sửa từng lối**.
- `npm run landmark-audit`: còn "tràn" ở các mặt tiền cột (Palais de Justice 9,8 m, Bourse 9,6 m, St-Jacques, La Monnaie…: cột nhô ra khỏi viền có chủ ý), carillon chạm Palais de la Dynastie 2,6 m (tháp gắn vào tòa này ngoài đời), Riches Claires tháp lấn nhà bên 2,0 m.
- Cờ "lơ lửng" còn lại có từ trước: Hôtel de Ville 62,9 m (các tháp góc OSM bắt đầu ở 37 m trên góc viền không có thân bên dưới), Berlaymont 51 m, Rogier 10,6 m, Madou 5,6 m, Tour Sainte-Catherine 15,7 m (viền tròn nên chỉ là số đo của audit, mesh chạm đất). Chưa xử lý.
- Ảnh `lm-*` đã xem: cathédrale, Maison du Roi, Palais de Justice, Nation, Bourse, Monnaie, các nhà thờ, Gare, Berlaymont, Rogier, Justus Lipsius, Botanique, Hôtel de Ville. Chỉ xem góc xiên từ xa, **chưa chụp góc đường ở mặt đất**.

## 4. Còn thiếu

- Đầu hồi mạ vàng nhà phường hội quanh Grand-Place: chưa làm (các nhà đó là building thường, không thuộc registry; cần thêm id OSM + nằm ngoài phạm vi file được sửa).
- Hướng mặt tiền (`az`) chọn bằng mắt từ bản đồ cho các nhà thờ nhỏ, Palais de Justice (30°), Nation (190°), St-Jacques (90°): chưa đối chiếu ảnh thật.
- Bozar, Palais Royal, Arcades, Hôtel de Ville chưa chỉnh thêm; Bozar vẫn là khối kem phẳng.
