# Báo cáo: 2 bức tường chắn lối vào cầu Pont de l'Alma (2026-10-03)

## Hai vật chắn là gì, ở đâu
Không phải rào OSM, không phải bậc thang, không phải landmark `alma` (g2.ts). Cả hai là **tường kè sông của `Terrain.quayMesh`**: bức tường đá dọc mép đa giác sông Seine (từ đáy −8,5 m lên lan can `cap` = +2,6 m) được vẽ liền một mạch **cắt ngang mặt cầu** ở đường bờ:

| | Cạnh đa giác sông (water.json) | Mặt cầu tại đó | Tường cao hơn mặt cầu |
|---|---|---|---|
| Bờ phải (Place de l'Alma) | (−1406,5; 160,5) → (−1449,2; 161,2), z ≈ 161 | y ≈ 1,37 | ≈ 1,2 m |
| Bờ trái (Port de la Bourdonnais) | (−1441; 278,8) → (−1399,5; 276,8), z ≈ 278 | y ≈ 1,05 | ≈ 1,5 m |

`player.maxStep` = 0,4 m nên người và xe bị chặn. Tia ngang Rapier dọc mặt cầu (y = mặt cầu + 0,5 m) chạm `quay trimesh` ở đúng đường bờ. **Lỗi là chung cho mọi cầu** (Concorde, Alexandre III, Invalides, Iéna, Bir-Hakeim… đều chạm tia ở cả hai bờ) — Alma chỉ là nơi người dùng gặp trước.

## Đã gỡ cách nào (sửa gốc, không lọc theo id)
- `scripts/build-chunks.ts`: tính giao điểm mỗi chuỗi cầu (layer ≤ 1) với mọi cạnh đa giác sông → `water.json.bridgeGaps = [x, z, halfWidth, …]` (halfWidth = nửa mặt cầu BridgeBuilder + vỉa hè + 0,3 m). 103 điểm. Chạy lại `npm run build-chunks`: chỉ `water.json` + stats trong `chunks/index.json` đổi, 368 chunk JSON giữ nguyên byte.
- `client/src/geo/chunkData.ts`: trường `bridgeGaps?` trên `WaterData`.
- `client/src/world/Terrain.ts` `quayMesh`: cạnh bờ được cắt thành các đoạn theo khoảng hở; trong khoảng hở cầu **bỏ cả tường lẫn mặt kè** (sàn là tấm cầu của BridgeBuilder), khoảng hở bậc thang như cũ (chỉ bỏ lan can). Dùng chung cho cả hình vẽ (Water.ts) lẫn collider (createTerrainCollider) nên Rapier cũng mất tường.
- `client/src/world/Terrain.test.ts`: test mới — tia ngang dọc mặt cầu qua đường bờ ở Alma (2 bờ) + Concorde phải không chạm gì.

## Kiểm tra
- Vitest: `Terrain.test.ts` (9/9), `scripts/build-chunks.test.ts` (4/4). `npm run build` qua.
- Ảnh `screenshots/alma-before.png` / `alma-after.png` (cam −1428,110,235 nhìn bắc): dải kè bờ phải trước đây cắt ngang mặt cầu, nay dừng ở mép cầu; lan can hai bên và thân cầu vẫn nguyên.

## Còn ngờ vực
- Mép khoảng hở = mặt lan can cầu + 0,3 m: nếu BridgeBuilder đổi bề rộng mặt cầu phải chạy lại `build-chunks` (chính sách build-time, như `stairs.quay`).
- Ở gờ bờ trái Alma mặt cầu thấp hơn mặt kè ≈ 0,5 m: nay tấm cầu là sàn, đi được, nhưng nhìn từ sông thấy dốc địa hình đá thay vì tường ở ngay dưới mố cầu (các cầu g2 có vẽ mố riêng).
- Chưa chạy ride-check / sim / bộ test đầy đủ theo yêu cầu "nhanh".
