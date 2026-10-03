# Xe để cạnh hòm mật thư, bỏ khóa chủ xe (2026-10-03, SPEC §17.34)

- Máy chủ: `RaceEngine.boxAt(rack)` tìm hòm (hòm lộ trình / hòm nhánh / thảm) đứng ở điểm của `park`; `BikeService.park(…, box)` đặt xe bằng `besideBox` (2 m sang phải theo hướng hòm, chiếc sau sang trái, rồi xa thêm `MIN_GAP` 3 m; cách xe khác ≥ 3 m). Không có hòm (nơi thử thách riêng) → cạnh người chơi như cũ. Vẫn ghi SQLite trước khi trả lời (`put` trong `park`).
- Bỏ khóa chủ: `claim` chỉ từ chối `taken` khi xe đang có người đạp của đội khác; client `bikeInReach` / `prompt` chỉ lọc xe có người ngồi; bỏ sprite khóa + `ownerColour` / `setTeams` / `bikeModel.lock`; toast `bikeTaken` = "Chậm một bước! Xe đang có người đi.".
- Client: đang đạp mà máy chủ cho xuống → xuống xe, xe nhảy tới chỗ máy chủ đặt (trước đây ở lại dưới chân).
- Chữ nhắc: `BIKE_PROMPT.on` = "Bấm F để lên xe đạp" (RaceHud.ts).
- Kiểm: vitest Bikes / BikeModel / bikeLink / Toasts / race ui, BikeService / VehicleSpawner / engine; `npm run build`. Không chạy ride-check / sim / screenshot.
- Tồn: máy chủ không kiểm vùng đi được ở chỗ đặt xe (TODO.md).
- Ghi chú: dòng xóa `bikeModel.lock` trong client/src/config.ts đã lọt vào commit 3316b1e của agent Louvre (nó commit cả file lúc mình đang sửa).
