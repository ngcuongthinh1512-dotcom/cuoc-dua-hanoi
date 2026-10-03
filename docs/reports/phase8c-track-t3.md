# Phase 8C – Track T3: ngói mái + nhựa đường

Nhánh `phase8c-T3` (từ `phase8c-T0`), KHÔNG merge vào main. Phạm vi SPEC §17.20: CHỈ `roof_slates_03` và `asphalt_02`.

## Đã làm
- `scripts/assets/textures.ts`: `SETS` + `sourceFile` + target `textures` (pbrSet 2K, `_1k` cho GPU yếu). Đầu ra `client/public/textures/{roof_slates_03,asphalt_02}_{col,nrm,arm}[_1k].webp` (tổng ≈ 8,6 MB; lớn nhất 1,9 MB). Test: `scripts/assets/textures.test.ts`.
- `config.ts`: `graphics8c.roofs = { enabled: true, tile: 2 }`, `graphics8c.asphalt = { enabled: true, tile: 3 }` (mét cho một lần lặp; `roads.textureTile.asphalt` giữ cho đường lui khi tắt).
- `RoadBuilder.ts`: vật liệu `asphalt` dùng `pbrMaps('asphalt_02')`, repeat = 1 / tile (uv đã theo mét); `polygonOffset` giữ nguyên, vạch kẻ đường không bị che (xem ảnh Quai des Tuileries).
- `BuildingBuilder.ts`: vật liệu `roof` dùng `pbrMaps('roof_slates_03')`; uv mái đổi sang MÉT THẬT (dốc: dọc cạnh × dọc mái; mặt phẳng / nắp: x, z) khi `roofs.enabled`; `roofTint` nâng sáng + ngả xanh vì slate gốc tối và ngả nâu. Builder chỉ đọc cờ `enabled` (hằng), không đọc quality; texture nạp trong `create*()` luồng chính.

## Kiểm tra
- Ảnh `screenshots/after-t3/` (không commit): p8c-roof, p8c-road, p3-street, street, topdown, asphalt-quai. `__STATS__` calls / chunks / geometries Y HỆT trước (369 / 314 / 335 / 328 / 5153); triangles không đổi.
- Rue Royale / Champs-Élysées là đường lát đá (pave, ngoài phạm vi) nên p8c-road, p3-street, street không đổi mặt đường; nhựa đường kiểm bằng `/?player=30,203,90&wait=2&npc=0` (Quai des Tuileries): vết nứt, vạch kẻ vẫn rõ, xa không lộ lặp.
- Mái: nhìn xa (p8c-roof, topdown) mipmap ổn, mái dốc và mái phẳng đều có ngói; hàng ngói trên mái phẳng lớn hơi lộ vệt dài.

## Lệch / hạn chế
- Mất cửa sổ mái (lucarne) từng vẽ trên canvas: slate PBR thay hẳn canvas một map. `// ponytail:` trong `roofMaterial`; nâng cấp: bộ uv thứ hai hoặc atlas cho lucarne (hoặc dựng lucarne bằng hình học).
- ride-check không chạy (không đụng vật lý); `npm run build && npm test` xem kết quả trong báo cáo trả về.

## Cần thử tay
- Máy yếu (`?quality=low`) xem `_1k` nạp đúng; xem mái nhìn gần từ ban công / tầng cao.
- Ghép: sinh lại `credits.json` bằng `npm run process-assets`; T1 (HDRI) có thể cần chỉnh lại roughness / `roofTint`.
