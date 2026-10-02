# Phase 7 – kiểm tra độc lập: hòm mật thư theo mô hình thật (commit e408038)

Người kiểm: agent kiểm hình độc lập (không sửa code, không commit). Ảnh mẫu: `images/3.jpg` của phiên (đế xám vuông, cột vàng dải đỏ dọc, hộp xám trên đỉnh, nắp phẳng nhô ra).

**Kết luận: ĐẠT** (chỉ còn lỗi nhỏ / việc cần anh quyết định, không có lỗi chặn).

## Lệnh đã chạy
- `npm run build` → exit 0 (typecheck + client build + `wrangler deploy --dry-run`).
- `npm test` → exit 0: 49 + 47 + 631 + 90 test đều qua.
- `SCREENSHOT_PORT=5465 npm run ride-check` → `OK` (đi bộ 4,0 m/s, xe 5,2 m/s, tỉ lệ 1,3, nghiêng 15,6°, thấp nhất −0,02 m, người + xe ≈ 11 lệnh vẽ).
- `SCREENSHOT_PORT=5465 npm run screenshot -- p6-boxes p7-box-close p7-box-far p7-box-opened p7-mat p7-start p5-hud p7-openbox` → không lỗi console; đã mở từng PNG.
- Ảnh "trước": cây mã của `e408038~1` giải nén vào scratchpad, chụp `p6-boxes p7-openbox p7-mat` + cùng góc 150 m trên Champs-Élysées (cổng 5466).
- Góc tự đặt (`--path`, cổng 5465): 4 phía hộp ở Concorde, hộp mở nhìn từ phía bắc, dốc 34 % vườn Trocadéro (đóng / mở), bậc thang Trocadéro, bậc xuống Île aux Cygnes (Bir-Hakeim), 60 / 100 / 150 m trên mặt cầu Bir-Hakeim dưới cầu metro.
- Không còn server nào chạy (đã kiểm cổng 5460–5470, không có vite / workerd).

## 1. Giống ảnh mẫu?
Có. Đo trên ảnh mẫu (đã hiệu chỉnh góc nhìn) so với `config.clueBox`:

| Tỉ lệ | Ảnh mẫu | Trong game |
|---|---|---|
| bề ngang cột / hộp đầu | ≈ 0,67 | 0,62 |
| chiều cao cột / bề ngang hộp đầu | ≈ 1,88 | 1,92 |
| đế / hộp đầu | ≈ 1,29 | 1,25 |
| cao / ngang hộp đầu | ≈ 1,05 | 0,96 |
| dải đỏ / mặt cột | ≈ 0,55 | 0,53 |
| nắp nhô mỗi phía (trung bình) | ≈ 6 % bề ngang hộp | 3 cm ≈ 6 % |

Màu: mặt xám được nắng `#494d58` (ảnh `#565c6a`), mặt khuất `#1c2231` (ảnh `#1d2025`, cũng gần đen); vàng / đỏ đúng tông, trong game sáng hơn một chút do `glow` 0.3. Nắp nhô thấy rõ ở `p7-box-close`.

Khác ảnh mẫu (xem mục "Vấn đề"): dải đỏ có ở cả 4 mặt (ảnh: mặt bên trông thấy chỉ vàng); thêm cột sáng vàng 10 m (ảnh không có); nắp trong ảnh lệch về phía trước (trước nhô nhiều, sau gần sát), game nhô đều – không đáng sửa.

## 2. Đọc được từ xa / sương / nền / lời nhắc "Bấm F"?
- 150 m, Champs-Élysées (`p7-box-far`): mô hình chỉ ≈ 2 × 6 px; cột sáng là vạch vàng ≈ 3 px × 30 px trên nền trời – thấy được nếu nhìn. Ảnh "trước" (cờ cũ) ở cùng góc: chỉ một chấm, gần như không thấy. Tiến bộ rõ.
- 100 m trên cầu Bir-Hakeim dưới cầu metro: cột sáng vàng nổi trên nền mặt nhà sáng phía Passy, cắt ở mép dưới cầu metro (đúng, có kiểm tra độ sâu).
- 150 m trên cầu Bir-Hakeim (hai hướng): điểm 150 m nằm sau nhà / sau vòm đá đầu cầu nên không thấy – đúng (vật thể 3D bị che).
- Sương: `render.fog.near` = 250 m > 150 m (bán kính hiện hộp), nên sương không ảnh hưởng.
- Lời nhắc "Bấm F để mở hộp mật thư" (`p6-boxes`, `p7-openbox`, bậc Trocadéro) nằm dưới giữa màn hình, không che hộp.

## 3. Đã mở khác chưa mở?
Có (`p7-box-opened`, `p6-boxes`): nắp dựng ~100° phía sau, dải đỏ chuyển nâu xám không phát sáng, mất cột sáng. Từ phía bắc (sau bản lề) nắp dựng che hộp đầu, nhìn như hộp cao hơn; dấu hiệu chính lúc đó là dải nâu (vẫn phân biệt được).

## 4. Dải đỏ 4 phía
Có: chụp N / S / E / W ở Concorde, mỗi mặt đều có dải đỏ giữa hai viền vàng, không z-fight (`proud` 6 mm).

## 5. Chìm / lơ lửng
- Mặt phẳng (Concorde, Pont d'Iéna, Île aux Cygnes): đế sát mặt đất, bóng đổ đúng.
- Dốc 34 % (vườn Trocadéro, −2340, 425): đế phẳng chìm ~10 cm phía dốc lên, hở ~10 cm phía dốc xuống.
- Bậc thang Trocadéro (−2414.6, 425.2): góc đế chìa ra ngoài mép bậc (lơ lửng), chân cột ăn vào bậc trên.
- Trước đây khối vuông cũ cũng vậy (đặt theo 1 tia ở tâm); không phải hồi quy, nhưng mô hình mới cao và mảnh nên dễ thấy hơn.

## 6. Hồi quy
| Preset | Trước (lệnh vẽ / tam giác / geometry) | Sau |
|---|---|---|
| `p6-boxes` | 322 / 1 103 513 / 240 | 318 / 1 103 593 / 241 |
| `p7-openbox` | 309 / 1 070 397 / 360 | 307 / 1 070 437 / 361 |
| `p7-mat` | 312 / 1 153 546 / 234 | 312 / 1 153 546 / 234 (giống hệt, thảm + NPC không đổi) |
| Champs 150 m (`p7-box-far`) | 298 / 777 511 / 228 | 298 / 777 547 / 229 |
| `p7-start` | 172 / 554 528 | 172 / 554 528 |

`p7-box-close` / `p7-box-opened` = 291 lệnh (cột sáng ẩn khi gần). Chế độ offline (mọi preset trên chạy không có `?race=`) không lỗi console; `p5-hud`, `p7-start` không đổi; ride-check OK.

## 7. Code
- Mọi kích thước / màu / độ sáng / cột sáng nằm trong `config.clueBox` (chỉ roughness vật liệu và 8 cạnh trụ là hằng trong code – chấp nhận được).
- Geometry + vật liệu dùng chung ở mức module (`parts`), mọi hộp dùng chung; `box hide` chỉ gỡ khỏi scene (không có gì để giải phóng), 50 lần reveal / hide không tạo geometry mới (test). `dispose()` giải phóng 5 geometry + 5 vật liệu.
- Test có ý nghĩa: vị trí nắp trên hộp, nắp rộng hơn hộp, nắp mở quay về sau bản lề, dải đổi vật liệu, cột sáng ẩn khi gần / đủ rộng ở 150 m, tái sử dụng + dispose.

## Vấn đề (đều nhỏ)
1. **Dải đỏ 4 mặt khác ảnh mẫu**: trong ảnh mặt bên của cột chỉ màu vàng (dải đỏ chỉ ở mặt trước). Làm 4 mặt là lựa chọn có chủ ý để nhìn hướng nào cũng nhận ra; cần anh xác nhận. Muốn đúng ảnh: bỏ khối thứ hai của `stripes` (chỉ trước / sau).
2. **Cột sáng vàng 10 m không có trong ảnh mẫu**: thêm vào để thấy từ 150 m (hiệu quả, mờ hẳn dưới 12 m). Đổi diện mạo anh yêu cầu nên cần anh xác nhận; SPEC §8.2 vẫn ghi "hộp mật thư có cờ vàng–đỏ" → orchestrator ghi quyết định vào §17.
3. **Dốc / bậc thang**: đế phẳng hở ~10 cm phía dốc xuống ở dốc 34 %, góc đế lơ lửng ngoài mép bậc ở bậc Trocadéro. Cách rẻ: kéo đế xám xuống dưới mặt đất (ví dụ 0,3 m, một số trong config) để luôn trông như cắm xuống đất; hoặc `leg:check` cảnh báo điểm hộp trên bậc / dốc > 10 %.
4. **Hướng hộp cố định +z**: nhìn từ phía bắc, nắp đã mở che hộp đầu. Chấp nhận cho giờ; thêm hướng khi file chặng có.
5. **TODO.md chưa cập nhật** các mục còn lại báo cáo phát triển đã nêu (hướng hộp cố định, mô hình cao 1,6 m không có va chạm – người / xe đi xuyên, câu chữ SPEC "cờ"). CLAUDE.md yêu cầu ghi TODO.
6. (Có từ trước, không do commit này) Nhãn tên của chính người chơi ("Đội thử") nằm ngay giữa màn hình ở camera thứ ba và che hộp ở thẳng phía trước 60–150 m (Bir-Hakeim 60 m: chỉ cột sáng ló lên trên nhãn).
7. Code nhỏ: `ClueBoxes.dispose()` chỉ test dùng (main.ts không bao giờ gỡ); chưa có test khẳng định dải đỏ nhô ra cả theo x lẫn z (tính chất "4 mặt").

Ảnh kiểm thêm nằm ngoài repo (scratchpad của phiên: `verify/v-*.png`, `tree-before/screenshots/*.png`).
