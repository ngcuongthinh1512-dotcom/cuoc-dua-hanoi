# Phase 5 – FIX-FA: bản đồ (minimap + bản đồ lớn)

Nhánh worktree `worktree-agent-adf6d419db0b933ee` (thư mục `.claude/worktrees/agent-adf6d419db0b933ee`), gốc main @ `cd47483`.
`npm run build` và `npm test` qua (client 54 file / 532 test). Không còn vite / wrangler chạy.

## Đã sửa

| Lỗi | Sửa | Đo / kiểm |
|---|---|---|
| **R2-M1** bản đồ lớn thiếu tên đại lộ | `FullMap.labels()`: các way cùng tên trong khung được **nối đầu với đuôi** (chung nút), rồi cắt thành **đoạn chạy thẳng** (không nút nào lệch dây cung quá `fullMap.label.bendPx` = 4 px), mỗi đoạn chạy cắt theo khung nhìn (Liang–Barsky) là một ứng viên. Luật đặt nhãn cũ giữ nguyên (`placeLabels`: không chồng, không lộn ngược, cùng tên cách ≥ `repeatPx`). Thêm: bậc thang không còn được ưu tiên trên đại lộ (lớp `steps` = 5 trước kia xếp trên `major`). | Test đồ thị thật: Étoile 1 m/px (35 nhãn, 1,4 ms) và 2 m/px (42 nhãn, 1,6 ms) có "Avenue des Champs-Élysées"; Opéra 1 m/px có "Boulevard Haussmann" (50 nhãn, 0,9 ms); Concorde 1 m/px 31 nhãn 2,6 ms, vẫn có Rue Royale; không chồng ở cả 4 khung. Test hàm `straight` / `clipSegment`. |
| **R1-m8** nhấp ngoài vùng đua vẫn đặt đích | `FullMap.click()`: điểm có `edgeDistance < 0` (ngoài RACE_BBOX) bị bỏ qua; nhấp gần đích để xoá vẫn chạy. | Test: nhấp ở góc lề `outside` → `onWaypoint` không được gọi. |
| **R1-m12** canvas toàn màn hình giữ bộ đệm sau khi đóng | `close()`: `canvas.width = canvas.height = 0`; `open()` → `resize()` đặt lại. | Script Playwright tạm (DPR 2, không commit): mở / đóng bằng M **20 lần**: mở 2560 × 1440, đóng 0 × 0 cả 20 lần; số canvas giữ 3; heap JS 125,4 → 125,8 MB (sau `gc()`); không lỗi console. |
| **R1-m13** `OffscreenCanvas` không kiểm hỗ trợ | `MapTiles.offscreen(w, h)`: `OffscreenCanvas` nếu có, không thì `<canvas>` rời (cùng API 2D đang dùng). Dùng ở ô minimap, nền và lớp chi tiết bản đồ lớn. | Chạy game với `OffscreenCanvas` bị xoá khỏi `window` (giả Safari < 16.4), có tuyến GPS, mở / đóng bản đồ 3 lần: không lỗi, bản đồ lớn vẽ đủ (đã xem ảnh). |
| **R2-m3** tuyến GPS đè chữ tên đường | Nhãn không còn nướng vào ảnh chi tiết; `detail.labels` được vẽ mỗi khung **sau tuyến** (`drawLabels`, cùng phép co / dời với ảnh chi tiết khi đang kéo / lăn). Chấm đích và mũi tên người chơi vẫn nằm trên cùng. | `p5-fullmap-streets`: "Rue Saint-Florentin" đọc rõ trên nét tím; `p5-gps-map`: "Boulevard des Capucines" trên tuyến. |
| **R2-m2** N / chấm đích minimap | N vẽ sau cùng (không bị che); chấm đích cách N < `N_RADIUS + 9` px thì được kéo vào trong **theo đúng hướng từ người chơi** (`clearOf`), nên cả hai cùng thấy. | Test `clearOf`; ảnh `fa-wp-north` (`/?player&gps=0,-1200&wait=2`) phóng 2 ×: N nguyên vẹn, chấm tím ngay dưới-trái N. |
| **R2-m4** tên đường dài trên HUD | `HUD.ts` (dòng tên đường): `max-width: 36vw; text-wrap: balance` → xuống 2 dòng canh phải. | `p5-respawn`: "Promenade des Berges de la Seine — André Gorz" thành 2 dòng ≈ 330 px (trước ≈ 635 px). |

Ghi chú m4: báo cáo R2 chỉ lỗi ở `ui/HUD.ts` (khối chữ tên đường góc dưới phải), không phải nhãn trên bản đồ. Nhãn bản đồ vốn chỉ đặt khi vừa đoạn đường nên không cần cắt "…". Vì vậy sửa 1 dòng CSS nội tuyến trong `HUD.ts` (cạnh `font-size:30px` sẵn có, không thêm khóa config, không đụng `hud.css` của FIX-FB). `HUD.ts` không nằm trong danh sách file của FA, nhưng cũng không thuộc FB: người tích hợp lưu ý.

## Ảnh đã chụp và xem (SCREENSHOT_PORT=5281, 1280 × 720)
- `p5-fullmap-streets` (1 m/px Concorde): có Champs-Élysées, Rivoli, Place de la Concorde, Gabriel, Royale, Saint-Honoré, Cours la Reine; không chồng nhau.
- `p5-gps-map` (2 m/px): Champs-Élysées (2 lần, cách xa), Rivoli, Saint-Honoré, Gabriel, Capucines, Avenue de l'Opéra, Franklin D. Roosevelt, Montaigne; không chồng. Chấm đích nằm trên chữ "Capucines" (đích luôn trên cùng, chủ ý).
- `fa-fullmap-etoile` (`/?player=-1918.3,-925.2,0&map=1&npc=0`, 1 m/px): đủ 12 đại lộ quanh Étoile (Champs-Élysées, Grande Armée, Foch, Victor Hugo, Kléber, Iéna, Marceau, Friedland, Hoche, Wagram, Mac-Mahon, Carnot). Chưa có "Place Charles de Gaulle" (vòng tròn, xem dưới).
- `p5-minimap-turn`, `fa-wp-north`: minimap đúng, N + đích tách nhau.
- `p5-respawn`: tên dài 2 dòng.

## Còn lại (đề xuất ghi TODO, không làm theo yêu cầu tiết kiệm)
- Tên quảng trường tròn / phố cong (Place Charles de Gaulle, Place de l'Opéra) chưa có: chữ thẳng trên đoạn thẳng (`ponytail` trong `FullMap.labels`); nâng cấp: chữ chạy theo đường gấp khúc.
- Vài nhãn đại lộ nằm trên làn phụ cùng tên (mép đại lộ) thay vì giữa lòng đường: chấp nhận được.
- R2-m11 hộp hướng dẫn đáy bản đồ lớn che nhãn phía dưới; R1: bản đồ lớn chưa dùng tay cầm; R1-m9 `__GAME__` thiếu `minimap` / `fullMap`; R1-m11 hằng số trình bày (`MIN_PX`, `N_RADIUS`, `WAYPOINT_INSET`, lề 100 m) ngoài `config.ts`; R2-m6 gai chữ U đầu tuyến GPS (track B); R2-m5 chữ tay trên nền sáng, m7 dòng ghi nguồn, m8 bảng ghi nguồn, m10 F3 dưới bản đồ lớn (FIX-FB / người tích hợp).
