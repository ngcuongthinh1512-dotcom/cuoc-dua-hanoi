# Phase 7 – hòm mật thư theo mô hình thật

Yêu cầu của người dùng: vẽ lại hòm mật thư trong game giống mô hình thật trong ảnh mẫu (đế xám vuông, cột vàng có dải đỏ dọc, hộp xám trên đỉnh với nắp phẳng nhô ra các phía; không cờ, không chữ).

## Đã làm
- `client/src/net/ClueBoxes.ts`: bỏ khối vuông + cột cờ + lá cờ cũ. Mô hình mới dựng hoàn toàn bằng `BoxGeometry` (không tải GLB, không asset):
  - `body` = đế xám + hộp xám đầu cột (gộp 1 geometry), `lid` = nắp (bản lề ở mép sau, −z), `post` = cột vàng, `stripes` = 2 khối mỏng xuyên chữ thập qua cột, nên **cả 4 mặt** cột đều có dải đỏ (nhìn hướng nào cũng giống nhau).
  - 4 lệnh vẽ, 3 vật liệu dùng chung (xám, vàng, đỏ) cho mỗi hộp; vàng / đỏ phát sáng nhẹ (`glow` 0.3), không thêm đèn thật.
  - **Hộp đã mở** = cùng mô hình, nắp lật lên 100° quanh mép sau, dải đỏ chuyển sang đỏ xám không phát sáng (vật liệu dùng chung thứ 4), không còn cột sáng. Đổi tại chỗ như trước (`paint`).
  - Giữ nguyên: lời nhắc "Bấm F để mở hộp mật thư", hiện / ẩn theo `box reveal` / `box hide`, đặt lên mặt đất (`boxSurface`, chỉ đi lên), hộp đã mở vẫn hiện, thảm Chặng dừng (không đổi).
  - `ClueBoxes.dispose()`: gỡ mọi hộp và giải phóng geometry / vật liệu dùng chung (hộp sau dựng lại).
- `client/src/config.ts` (`clueBox`): mọi số đo / màu / độ sáng. Tổng cao ≈ 1,61 m.

| Phần | Kích thước (m) | Màu |
|---|---|---|
| Đế | 0,65 × 0,65 × 0,06 | xám `#737b8c` |
| Cột | 0,32 × 0,32 × 1,0; dải đỏ rộng 0,17 mỗi mặt | vàng `#f2d30a`, đỏ `#c8281e` |
| Hộp đầu cột | 0,52 × 0,52 × 0,50 | xám |
| Nắp | 0,58 × 0,58 × 0,05 (nhô 3 cm mỗi phía) | xám |

- **Khác số gợi ý của orchestrator** (cột 0,16, dải 0,06, hộp cao 0,4, xám `#565d6b`), theo ảnh mẫu: trong ảnh cột rộng ≈ 0,6 bề ngang hộp, dải đỏ chiếm ≈ một nửa mặt cột, hộp gần như lập phương. Xám `#565d6b` lên hình gần như đen ở mặt khuất nắng nên sáng hơn một chút; nắp dùng cùng vật liệu xám với hộp (trong ảnh cũng cùng màu, mặt trên sáng hơn do ánh sáng) để giữ 3 vật liệu.
- **Nhìn từ 150 m** (bán kính hiện hộp, SPEC §17.10): mô hình 1,6 m chỉ cao ≈ 6 px ở 720p, không đọc được. Đã thêm một **cột sáng vàng mảnh, trong mờ, nhạt dần lên trên** (cao 10 m) chỉ trên hộp **chưa mở**: bề rộng tối thiểu 0,008 m mỗi m khoảng cách (≈ 4 px ở 150 m), mờ hẳn khi lại gần dưới 12 m (đủ đậm từ 35 m), nên nhìn gần chỉ còn mô hình. Vẫn là vật thể 3D có kiểm tra độ sâu: nhà che thì không thấy. `ClueBoxes.update(camera.position)` (main.ts) cập nhật bề rộng / độ mờ. Mỗi hộp chưa mở thêm 1 lệnh vẽ khi ở xa (0 khi ở gần).
- Lưu ý cho SPEC: §8.2 / §17.10 ghi "cờ vàng–đỏ + ánh sáng nhẹ"; nay "cờ" là cột vàng–đỏ của mô hình thật, "ánh sáng nhẹ" là phát sáng nhẹ + cột sáng khi ở xa. Orchestrator nên ghi quyết định này vào §17 (agent không sửa SPEC).

## Kiểm thử
- `client/src/net/ClueBoxes.test.ts`: 4 mesh + cột sáng, 3 vật liệu mỗi hộp, geometry / vật liệu dùng chung giữa các hộp; hộp mở: nắp quay −100°, mép tự do cao hơn hộp > 0,5 m, không gì nằm trước bản lề, dải đỏ đổi vật liệu, không phát sáng, không cột sáng; cột sáng: ẩn ở 3 m, đủ đậm và đủ rộng ở 150 m; reveal / hide 50 lần không tạo thêm geometry, `dispose` giải phóng đủ 5 geometry + 5 vật liệu, hộp sau dựng bộ mới.
- `npm run build` ✓, `npm test` ✓ (49 + 47 + 631 + 90), `SCREENSHOT_PORT=5461 npm run ride-check` → OK.

## Ảnh (`SCREENSHOT_PORT=5461 npm run screenshot -- p6-boxes p7-box-close p7-box-far p7-box-opened`)
- Preset mới trong `scripts/screenshot.ts`: `p7-box-close` (cách 3 m, chéo 35° phía trước, nhìn xuống), `p7-box-opened` (cùng góc, hộp đã mở), `p7-box-far` (góc `street` trên Champs-Élysées, hộp cách 150 m về phía Khải Hoàn Môn). `p6-boxes` giữ URL, chú thích cập nhật.
- 4 vòng so với ảnh mẫu:
  1. Mô hình đúng dáng nhưng hộp xám gần đen, cột mảnh; ở 150 m chỉ là một chấm ≈ 2 × 6 px.
  2. Xám sáng hơn; thêm cột sáng cộng màu (additive): thấy rõ nhưng thành trắng trên nền trời.
  3. Chuyển sang hòa trộn thường (vẫn vàng trên trời), dải đỏ rộng hơn, hộp cao 0,5 m (gần lập phương như ảnh).
  4. Cột sáng rộng / đậm hơn (≈ 4 px ở 150 m); đỏ của hộp đã mở sáng hơn (đỏ xám thay vì nâu).
- Kết quả: nhìn gần giống ảnh mẫu (đế xám, cột vàng dải đỏ, hộp xám nắp nhô); hộp đã mở phân biệt rõ (nắp dựng đứng phía sau, dải đỏ xỉn); ở 150 m thấy cột sáng vàng trên chấm vàng–đỏ; ở 60 m (ảnh thử thêm, không thành preset) là một vạch vàng mảnh trên mô hình. `p7-openbox` (Pont d'Iéna): đầu hộp ngang ngực nhân vật, hợp với động tác mở hộp.
- Lệnh vẽ: mô hình 4 mỗi hộp (mô hình cũ 5); cột sáng +1 khi ở xa, 0 khi ở gần (`p7-box-close` 291 lệnh cả cảnh, bằng vòng 1 chưa có cột sáng).

## Chưa làm / lưu ý
- Hộp luôn quay mặt về +z (yaw 0), nắp mở về phía bắc. Chưa có hướng theo phố; thêm khi file chặng có hướng hộp.
- Độ mờ cột sáng dùng chung (theo hộp chưa mở gần nhất): server chỉ gửi một hộp chưa mở mỗi lúc (`ponytail:` trong code).
- Hộp không có va chạm vật lý (như trước): người chơi đi xuyên qua.
