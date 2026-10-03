# Kiểm tra lối vào mọi cầu qua sông Seine (2026-10-03)

Phạm vi (người dùng thu hẹp): chỉ **lối đi vào cầu** — 20 m cuối mặt cầu + 20 m đường dốc hai đầu, tim đường và tâm hai vỉa hè — cho mọi cầu đường bộ / đi bộ bắc qua sông đã khoét (cầu đường sắt bỏ qua). Không xét giữa mặt cầu, lan can mép, vẻ ngoài.

## Cách kiểm
`client/src/world/bridgeAudit.test.ts` (`npx vitest run bridgeAudit`): dựng collider Rapier của **mọi** chunk theo từng builder (để biết vật chặn do ai sinh) + heightfield và tường kè (`createTerrainCollider`), rồi tại mỗi đầu chuỗi cầu thật: lấy mẫu 2 m, sàn = collider cao nhất dưới mẫu (bỏ cầu cạn tàu điện), báo **bậc** > `player.maxStep` 0,4 m hoặc dốc > `maxSlopeDeg` 45° (lấy mẫu lại 0,25 m), **không có sàn**, hoặc tia ngang +0,5 / +1,0 m dài 3 m chạm tường. Test chỉ fail khi vật chặn nằm trên tim đường của cầu có tên và không phải đồ phố / lan can landmark / nhà mà đoạn thẳng 20 m đâm vào khi phố rẽ.

## Kết quả: 38 cầu qua sông đã kiểm
Passerelle Debilly, Passerelle Léopold-Sédar-Senghor, Petit-Pont, Pont Alexandre III, Louis-Philippe, Marie, Neuf, Notre-Dame, Royal, Saint-Louis, Saint-Michel, au Change, au Double, d'Arcole, d'Iéna, Bir-Hakeim, Sully, Alma, Archevêché, Concorde, Tournelle, des Arts, Invalides, Carrousel, Promenade Jean-Paul Belmondo, Quai Voltaire (nhánh), + 12 đoạn footway/steps không tên quanh Senghor và Petit-Pont.

### Lối vào từng bị chặn (trước commit này)
| Cầu | Tọa độ x,z | Vật chặn |
|---|---|---|
| Petit-Pont (layer 2) | 1900,1335 và 1886,1374 | mặt cầu bị nâng 6 m (`railLayerStep` áp cho mọi layer ≥ 2); build-chunks bỏ khoảng hở tường kè cho layer > 1 → tường + mặt kè chắn hai đầu |
| Pont Louis-Philippe (TN, bờ phải) | 2413,1338 | hố rãnh 4 m rộng, sâu tới −3,5 m giữa kè và đầu cầu (khoảng hở cầu đã bỏ mặt kè, mặt cầu không phủ) |
| Pont Marie (TN đảo Saint-Louis) | 2637,1446 | hố rãnh như trên, sâu −8,5 m |
| Pont Marie (ĐB, bờ phải) | 2677,1375 | mặt cầu thấp hơn dải kè 0,72 m, mặt địa hình 63° đâm xuyên sàn |
| Pont au Double (TN) | 1994,1451 | mặt cầu thấp hơn mặt kè 1,0 m |
| Pont Royal (TB) | 612,650 và 614,643 | mặt kè các cạnh của hốc mố cầu phủ ngang vỉa hè, bậc 0,6–1,2 m |
| Pont d'Iéna (nhánh service, TN) | −2192,572 | tụt 1,3 m xuống rãnh ngay sau kè |
| Pont Saint-Michel, au Change, Notre-Dame, Carrousel (làn xe đạp song song) | vd 1733,1243 | mặt làn xe đạp kết thúc giữa sông → dốc lao xuống đáy sông ở đầu bờ |
| footway Concorde (vỉa hè tách riêng, bờ phải) | −91,157 | rãnh −1,2 m sau kè |
| Pont Royal / Carrousel / Quai Voltaire / Neuf / Arcole: 5 "cầu" cụt OSM 9–14 m | vd 621,657 | mặt cụt lao xuống sông cạnh lối vào, lại mở thêm khoảng hở tường kè (lỗ) |

Alma + Concorde (đã sửa ở 7d08355) giữ sạch.

### Đã sửa (gốc, không lọc theo tên)
- `scripts/build-chunks.ts`: khoảng hở `water.json.bridgeGaps` cho mọi chuỗi đường bộ / đi bộ (bỏ điều kiện layer ≤ 1; chỉ loại đường sắt), rộng hơn khi cầu cắt xéo mép sông (`half / sin`), chuỗi kéo dài 15 m để chuỗi kết thúc sát mép vẫn giao; mỗi điểm mang **hướng vào bờ** (`[x, z, half, inX, inZ]`); bỏ 5 chuỗi cụt OSM < 20 m sát sông (`dropped.bridgeStubs`). 116 điểm.
- `client/src/world/Terrain.ts`: `carveRiver` **không đào rãnh** dưới dấu chân cầu (half + 5 m ngang, −5…17 m vào bờ): nút bờ giữ mức phố; `quayMesh` khoảng hở là **đĩa** (mở cả cạnh kề quanh góc bờ) và với cầu còn mở cả mặt kè của cạnh hốc mố nằm ngang dưới sàn.
- `client/src/world/BridgeBuilder.ts`: sàn theo **địa hình đã bào** (`bridge.rampGrade` 0,25, chỉ trong phạm vi sàn, ô bờ lấy nút cao nhất như heightfield Rapier tam giác); **lưỡi dốc** `bridge.endRamp` 15 m ngoài hai đầu chuỗi thật (chỉ khi bờ ở đó), nửa đầu hòa xuống mặt đất từng đỉnh, không lan can / vỉa hè / vạch trên lưỡi; đầu chuỗi kết thúc giữa sông (làn xe đạp) lấy mức bờ dưới lưỡi thay vì đáy sông; không nâng theo layer cho sàn đường bộ qua sông; trạm 1,25 m.
- `client/src/config.ts`: `roads.bridge.endRamp`, `rampGrade`. `client/src/geo/chunkData.ts`: tài liệu `bridgeGaps`.
- Dữ liệu tất định đổi: `water.json`, `chunks/{index,2_2,5_3,8_4}.json` (bỏ chuỗi cụt).

### Còn (không chặn lối vào trên tim đường, ghi để biết)
- Đồ phố (cột đèn / ghế) đứng giữa vỉa hè đầu cầu: Alexandre III (−550,289), Louis-Philippe (2413,1348), Arcole (2143,1156), Bir-Hakeim (−2398,1183) — đi vòng được.
- Pont Neuf: thành đá landmark g2 cao hơn vỉa hè 0,5–0,7 m tại (1490,899), (1509,898), (1540,805); Bir-Hakeim: sàn đá landmark cao hơn mặt cầu 0,5 m ở (−2405,1162), hàng cột giữa vỉa hè (−2454,1097). g2 ước lượng đường sàn từ đa giác OSM, lệch với BridgeBuilder — chưa chạm g2.
- Promenade Jean-Paul Belmondo: đầu Passy là bậc thang OSM dựng thành sàn cầu dốc 2–4 m (−2534,979); đầu Grenelle lưỡi dốc hai làn xe nhập vào cao hơn lối ra 0,5 m (−2403,1181).
- Mép vỉa hè: khe giữa làn xe đạp và làn chính Alma ±0,9 m ở vùng dốc (−1443,159), lưỡi Tournelle cao hơn địa hình dốc ngang 1,1 m ở mép (2563,1591), hai footway vỉa hè Petit-Pont lệch sàn ±1 m với làn chính (1879,1369 / 1907,1341) — chỉ chắn đi ngang.
- Ô địa hình bờ dưới lưỡi dốc hiện là mái dốc đá thay cho tường kè thẳng (nhìn từ sông, ≤ 5 m hai bên cầu). npc/roads.ts và g2 vẫn dùng đường sàn cũ (y0/y1 giữ nguyên) nên chỉ lệch ở chỗ bào / lưỡi.
- Chưa chụp ảnh / ride-check theo yêu cầu "nhanh"; `npm run build`, Terrain.test, allChunks, build-chunks.test, bridgeAudit qua.
