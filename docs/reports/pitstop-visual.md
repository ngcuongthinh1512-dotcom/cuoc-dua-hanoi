# Chặng dừng: thảm lớn, người dẫn chương trình, cột sáng + biển VỀ ĐÍCH (2026-10-03)

- Thảm 8 × 16 m (`raceClient.mat` trong client/src/config.ts), viền vàng 0,5 m; vùng check-in vẫn là bán kính zone của chặng (không đổi logic).
- Cột sáng đỏ 40 m (`raceClient.matBeam`, MeshBasic, không cần bloom, không mờ dần khi tới gần) + cổng 2 cột vàng + băng rôn "VỀ ĐÍCH" (canvas 512 × 128, unlit) ngang giữa thảm (`raceClient.matGate`). Tất cả là con của nhóm `mat` do ClueBoxes vẽ, nên chỉ hiện khi server gửi hộp `kind: 'mat'` (cùng luật reveal SPEC §17.10). Thảm = 8 draw call (trước 5).
- Người dẫn chương trình: đứng cạnh mép thảm (offset [5,4; 1,5]), tỉ lệ 1,12, luôn quay mặt về phía đội. Hiện trong game thật khi thảm đã được reveal và có nhân vật người chơi (`main.ts`: `player && new PitHost`); ở chế độ khán giả `?cam=` (preset chụp ảnh) không có người chơi nên không có người dẫn chương trình.
- Ảnh: screenshots/pitstop-visual.png (thảm + cột sáng + cổng nhìn từ trên, 190 draw call).
- Kiểm tra: vitest client/src/net/ClueBoxes.test.ts (11/11), `npm run build` OK.
