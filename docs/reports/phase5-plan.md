# Phase 5 – HUD: báo cáo lập kế hoạch + nền

Kế hoạch đầy đủ: `docs/plans/phase5.md`. Commit nền: `feat(phase5): kế hoạch + nền HUD`. `npm run build && npm test` qua (client 45 file / 463 test); `p3-idle`, `p4-mount` chụp lại không lỗi, hình như trước (stub giữ hành vi cũ).

## Đã đo (2026-10-01)
- **Quận `admin_level=9`: chưa được trích** trước Phase 5; `.cache/osm/global.json` có sẵn 13 quan hệ quận có hình học. Nền đã thêm vào `build-chunks` → `water.json`: `districts` (13 quận, 18,7 KB) + `parks` (592 vòng công viên / cỏ ≥ 400 m², rút gọn 2 m, 74 KB, cho bản đồ lớn). `water.json` 64 → 154 KB; 368 file chunk không đổi byte nào. `districtAt` đúng ở obelisk (8), Eiffel (7), Louvre (1), Nhà thờ Đức Bà (4), Trocadéro (16), Panthéon (5).
- **Dữ liệu minimap:** chunk JSON đủ (nhà 25 475, đường 13 042 mảnh có tên, công viên / cỏ 1 862, cầu, bậc thang) nhưng chỉ worker đọc chunk → worker gửi lớp vector (trung bình 11 KB / chunk, cả bản đồ 4,1 MB) để main thread raster ô lười.
- **Bản đồ lớn:** `roadgraph.json` đủ mọi đường + 1 809 tên đường cho cả bản đồ; `water.json` có sông, ao, công viên → không cần chunk.
- **A\***: 0,1–3 ms cho 1–5 km → chạy thẳng trên main thread. Trocadéro → Panthéon bằng xe **không có đường** (bậc thang) → GPS lùi về đi bộ.
- **Tên đường:** 95 % điểm trên mạng đi bộ có đường có tên trong 25 m.

## Quyết định chính
- Canvas 2D (không WebGL) cho minimap + bản đồ lớn: +0 lệnh vẽ 3D, +0 request mạng.
- Minimap: ô raster theo chunk, vẽ lười ≤ 1 ô / khung, LRU 24 ô. Bản đồ lớn: nền raster một lần khi mở + vẽ lại vector khi dừng kéo; không vẽ từng nhà.
- GPS chỉ tới điểm người chơi tự đặt (§12), thử bằng `?gps=x,z`; không gắn L1–L6.
- Đồng hồ + tốc độ ở góc dưới phải dưới tên đường (STYLE_GUIDE thắng §12 "góc trên phải").
- Nền đã nối sẵn `main.ts` (HUD, minimap, menu, `M` / `Esc` / khóa chuột, URL `gps` / `map` / `menu` / `respawn`) để mỗi track thấy ngay kết quả của mình.

## Track
| Track | Việc | Mô hình |
|---|---|---|
| A | `mapVectors` (worker) + `MapTiles` + `Minimap` + `FullMap` | **Opus** (chất lượng hình, hiệu năng canvas, tương tác) |
| B | `geo/gps.ts` + `geo/locate.ts` (thuần) | **Sonnet** được |
| C | menu, cài đặt, toast, lý do `F` bị từ chối, bánh chạm bậc, hồi sinh lên bậc kè | **Sonnet** được |
| D | HUD góc dưới phải, dòng quận trên biển tên đường, ghép + F3 | **Opus** (ghép, khóa chuột nhiều trình duyệt, soát hình) |

Thứ tự ghép: B → C → A → D.

## Câu hỏi mở cho anh (đều có mặc định, không chặn việc làm)
1. Font viết tay tên đường: font hệ thống (khác nhau giữa Windows / Mac) hay tải font OFL (Caveat / Kalam ~100 KB, cần duyệt)? Mặc định: font hệ thống.
2. Từ Phase 7, GPS có tự dẫn tới hộp mật thư khi mật thư ghi rõ điểm đến không? Mặc định: không (§4.6, §8.2).
3. Tên quận trên HUD: "Quận 8" hay "8e arrondissement"? Mặc định: HUD "Quận 8", biển tên đường "8e Arrt".
4. Bản đồ lớn không vẽ từng tòa nhà (như GTA V), minimap thì có. Mặc định: như vậy.
5. "Kẹt? Về chỗ an toàn" có giới hạn số lần không? Mặc định: không.
6. Đồng hồ trước Phase 7 đếm từ lúc vào game. Mặc định: như vậy.

## Người điều phối cần ghi vào SPEC §17
- Đồng hồ đua ở góc dưới phải theo STYLE_GUIDE (thay "góc trên phải" ở §12).
- GPS chỉ dẫn tới điểm người chơi tự đặt.
- `water.json` chứa quận (`districts`) và công viên tổng quát (`parks`).
