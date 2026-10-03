# Phase 8B – Review 2 (giao diện): phòng Louvre – Thử thách 3

HEAD 810a51a. Reviewer chỉ xem, không sửa mã.

## Đã chạy
- `SCREENSHOT_PORT=5311 npm run screenshot -- p8b`: 9 ảnh, không có lỗi console. Sau đó chạy `p8 p5-hud` (18 ảnh) và `p7`: đều qua, không lỗi, không thấy hồi quy ở p8-card-* / p5-hud.
- Các preset `p8b-room*` chỉ có tác phẩm giả (ô đánh số). Vì vậy tôi viết thêm script Playwright trong scratchpad, không commit. Script dựng lại phòng bằng `__GAME__.room.build()` với **23 tệp thật** `client/public/art/art-NN.{webp,glb}` (glb = tượng: 02, 07, 11, 13, 15, 16), rồi `player.moveTo()` tới nhiều vị trí. Ảnh tạo ra: `screenshots/p8b-real-*.png` (view, back, back-r, left, right, front, wallclip, corner, view-small 1024×640, sc-art-*, side-art-*, photo-art-*).
- Trang Host chụp ở 1280 và 1024, cuộn bảng tiến trình sang cột Louvre: `screenshots/p8b-host-matrix-{1280,1024}.png`, `p8b-host-{1280,1024}-full.png`.

## Verdict
**ĐẠT CÓ ĐIỀU KIỆN.** Bố cục phòng, nút đỏ / xanh, nhắc "Bấm F", thẻ, khung chat, Ghi nguồn và ô Louvre trên Host đều dùng được, tiếng Việt có dấu đúng, không chữ nào bị cắt hay chồng nhau. Cần sửa 1 lỗi chính (M1: tượng art-02 thành bóng trắng phẳng). Nên sửa trước cuộc đua 2 điểm M2 và M3: tượng bị thân nhân vật che khi nhắm, và tranh nhỏ giữa tấm vàng lớn.

## Phát hiện

| # | Mức | playerVisible | PNG | Vấn đề | Đề xuất |
|---|---|---|---|---|---|
| M1 | Chính | có | p8b-real-sc-art-02, p8b-real-side-art-02, p8b-real-left (trái), p8b-real-front (phải, cạnh cửa) | **art-02.glb hiện thành bóng trắng xám phẳng, không nhận ra là tượng gì.** Vật liệu của tệp KHÔNG có `baseColorTexture`, chỉ có màu 0.61 xám + normalTexture + occlusionTexture. `LouvreRoom.placeGlb` lại thay mọi vật liệu bằng `MeshBasicMaterial({ map: old.map ?? null, color })`, nên mất cả normal lẫn AO và chỉ còn bóng một màu. | Ở `placeGlb`, khi `old.map` rỗng thì dùng `MeshMatcapMaterial({ color, normalMap: old.normalMap })` (có khối mà không cần đèn), hoặc ít nhất giữ `aoMap: old.aoMap` (MeshBasicMaterial hỗ trợ aoMap). Cách khác: bake AO thành màu trong `process-assets louvre`. |
| M2 | Trung bình | có | p8b-real-sc-art-02/07/11/13, p8b-real-side-art-02/13/16 | **Khi tiến tới nhắm một tượng để bấm nút, thân nhân vật che gần hết tượng.** Camera ngôi thứ ba nằm ngay sau lưng và tượng nằm đúng giữa màn hình. Tượng chỉ cao ≤ 1,2 m trên bệ 1 m, nên vai và đầu nhân vật che trọn. Tranh treo cao hơn (tâm 1,85 m) nên ít bị che hơn. | Khi đang trong phòng: thêm lệch vai cho camera (~0,6 m sang phải), hoặc nâng camera và nghiêng xuống, hoặc làm mờ thân khi ở gần tác phẩm. Tunable để trong `config.ts` (louvreRoom.camera). |
| M3 | Trung bình | có | p8b-real-back, p8b-real-left, p8b-real-right, p8b-real-sc-art-11 | **Tranh nhỏ, nằm giữa một tấm "khung" vàng cố định 1,6×1,2 m.** Ảnh được fit theo tỉ lệ nên tranh dọc (vd. art-01, art-05) chỉ chiếm khoảng 1/3 tấm, tranh rất dẹt (hai tranh khổ ngang) thành một dải mỏng. Trông như bảng vàng chứ không như khung tranh. Từ cửa (p8b-real-view) khó nhận ra tranh. Tường cao 5 m nhưng tranh chỉ ~0,8 m, bên trên trống nhiều. | Khung ôm theo tỉ lệ ảnh (đổi kích thước khung theo `tex.image` lúc onLoad, giữ diện tích hoặc cạnh dài ~2 m), viền vàng mỏng `painting.frame` 0,07 m quanh tranh. Có thể tăng `painting.height` lên 1,6–1,8 m và `centreY` lên ~2,1 m. |
| m4 | Nhỏ | có | p8b-real-back (phải), zoom art-16 | Bản quét art-16 lấm tấm trắng như kim tuyến (texture răng cưa hoặc đường nối), khó nhận ra. Đế đá của bản quét rộng hơn bệ (glbBox 0,8 m so với bệ 0,6 m) nên chìa ra ngoài bệ. Bản quét art-07 cũng có vệt trắng (p8b-real-corner). | Cho `glbBox` x/z ≤ `plinth.size` (0,6), hoặc tăng `plinth.size` lên 0,9. Kiểm mipmap / anisotropy của texture bản quét. Phần nhiễu do chính bản quét thì chấp nhận. |
| m5 | Nhỏ | có | p8b-real-front, p8b-real-wallclip (zoom cửa) | Biển "Lối ra – bấm F" 1,8×0,34 m, chữ trắng nhỏ trên nền xanh: không đọc được từ giữa phòng, và bị tên "Đội thử" che. | Phóng to biển (~2,4×0,5 m) và chữ, hoặc thêm chữ "Lối ra" lớn trên cửa. |
| m6 | Nhỏ | có | p8b-room, p8b-room-lock, p8b-real-view | Nút chốt giữa phòng chỉ là một trụ trắng có nắp vàng, không có chữ nên không rõ là "nút chốt" khi nhìn từ xa (lời nhắc chỉ hiện khi đứng gần). Khi đứng ở cửa, nó bị nhân vật che (p8b-room). | Thêm biển nhỏ "Chốt đáp án" hoặc cho nắp vàng phát sáng / nhấp nháy. Có thể dời nút ra khỏi trục cửa – tâm. |
| m7 | Nhỏ | có | p8b-room, p8b-room-button, p8b-room-lock | Thẻ thu gọn trong phòng chỉ có gợi ý + "Phạt: còn mm:ss". Muốn xem "Đang chọn k/5", "Đúng x/5" phải mở thẻ (Enter), trong khi đó là thông tin cần nhìn liên tục lúc chọn. | Khi `setRoom(true)`, thêm một dòng nhỏ trong thẻ thu gọn: "Đang chọn k · Đúng x/5" (khi đã có). |
| m8 | Nhỏ | có | p8b-real-* | Trong phòng ngầm, HUD vẫn hiện tên phố, quận và minimap của mặt đất. Ảnh demo đặt phòng ở Concorde nên hiện "Place de la Concorde"; trong cuộc đua sẽ là tên sân Louvre. Tên phố còn lúc có lúc không giữa các ảnh (p8b-real-back-r, -left: mất dòng phố). | Khi `room.active`: HUD hiện "Phòng Louvre" thay tên phố (minimap giữ nguyên cũng được). |
| m9 | Nhỏ | có (Host) | p8b-host-matrix-1280 / -1024, p8b-host | Cột "Thử thách 3" (Louvre) nằm ngoài khung ở 1280 và 1024 (bảng rộng 1602 px), phải cuộn ngang mới thấy. Khi cuộn tới, khung "Chờ duyệt" dính trên cùng che hàng tiêu đề của bảng, nên Host không thấy ô tím thuộc cột nào. Ô Louvre "⏳ 02:09 · chọn 5/23 · ✗2 · 💡70 (3/5)" + nút "Cho qua" đọc được, tooltip có lịch sử. Lỗi này có từ trước (Phase 8), Louvre làm bảng rộng thêm. | Ghim cột "Đội" khi cuộn ngang. Cho khung "Chờ duyệt" có max-height / thu gọn được, hoặc cho tiêu đề bảng dính ngay dưới nó. |
| m10 | Rất nhỏ | không (chỉ offline) | mọi ảnh trong game | Thẻ tên "Đội thử" đỏ trên đầu nhân vật của chính mình (offline, `playerSetup.teamName`). Có từ trước, không phải 8B. | Bỏ qua, hoặc ẩn thẻ tên của chính mình. |
| m11 | Rất nhỏ | có | p8b-real-wallclip | Đứng sát tường sau rồi quay ra: camera chạm tường và kéo sát vào đầu, đầu và vai chiếm 1/3 màn hình. Không xuyên tường hay trần. | Chấp nhận. Có thể làm mờ thân khi camera gần hơn ~0,8 m. |
| m12 | Rất nhỏ | không | p8b-credits | Bảng "Ghi nguồn" sát mép dưới viên "Nhấp chuột để chơi" (gần như chạm). Mục "Phòng Louvre" đứng đầu, đúng §17.20. | Đẩy bảng xuống 8–12 px. |

## Điểm tốt (đã kiểm)
- Phòng 26×16×5 m trông như một phòng trưng bày: tường kem, phào vàng, sàn gỗ, 6 đèn trần, cửa gỗ ở giữa tường trước. Ánh sáng đều, nhân vật không quá sáng cũng không quá tối. 23 vị trí chia đều 9 + 5 + 5 + 2 + 2, không tác phẩm nào bị ngược hay méo (tranh giữ đúng tỉ lệ).
- Tượng GLB (6 bản quét art-NN) đứng đúng chiều, đặt trên bệ, nhìn từ xa nhận ra được (trừ M1). Ảnh tượng trên bệ (p8b-real-photo-art-21) đứng thẳng, ổn.
- Nút: trụ xám + nắp đỏ, nắp xanh lá to hơn 1,4× khi đã chọn. Nhìn rõ cả khi đứng xa (p8b-room-button, p8b-real-view). Nhắc "Bấm F: bỏ chọn" và "Đang bị phạt – chờ hết đếm ngược để chốt (vẫn chọn / bỏ được)" rõ ràng, không che nhân vật.
- Đếm ngược phạt 02:00 ở giữa trên và trong thẻ (p8b-room-lock). Thẻ mở (p8b-card-louvre, -small) có trạng thái "Chưa vào phòng – bấm F ở hòm", "Đang chọn 3/5", "Chốt sai: 2 lần", "Đáp án bao gồm 5 tác phẩm", "Đúng 2/5" và lịch sử "Bị phạt 3 phút · đúng 2/5". Không có ô nhập. Vừa khung 1024×640.
- Khung chat công khai (p8b-feed, -small) ở dưới trái, bên phải minimap, không che minimap / đồng hồ / tên phố. Nền tối nên chữ đọc được. Ở 1024 vẫn không chạm "Place de la Concorde".
- Không chữ nào bị cắt hay chồng nhau, dấu tiếng Việt đúng ở mọi ảnh p8b / p8 / p7 / p5-hud.

## Chưa kiểm được bằng ảnh
- Hiệu ứng chuyển cảnh vào / ra phòng: headless chỉ chụp được ảnh tĩnh. Nên chơi thử bằng tay.
- Toast "Chỉ được chọn tối đa 5 tác phẩm – bỏ một tác phẩm trước": không có preset.
- Bảng Ghi nguồn ở trạng thái khóa "Mở sau khi về đích": cần phiên online, không có preset.
- Trong ảnh p8b-real-wallclip, biển cửa đổi sang "Đã xong – bấm F để ra". Đây là do script của reviewer build bước "T3real" khác với bước của thẻ, không phải lỗi.
