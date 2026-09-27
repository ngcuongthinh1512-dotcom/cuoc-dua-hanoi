# Phong cách hình ảnh – tham khảo GTA V

Ảnh tham khảo do anh cung cấp: `docs/reference/gta-onfoot.jpg` (đi bộ trong phố) và `docs/reference/gta-race.jpg` (đua xe). Ảnh có bản quyền nên chỉ để trên máy, không commit. Chỉ học bố cục và cảm giác; không sao chép logo, font thương hiệu hay asset của GTA.

## Camera (Phase 3–4)
- **Đi bộ:** camera sau lưng, cao hơn đầu một chút, cách nhân vật khoảng 3–4 m, hơi chúc xuống. Nhân vật đứng giữa màn hình, chân ở khoảng 1/3 dưới, người chiếm khoảng 1/3 chiều cao khung hình.
- **Đạp xe:** lùi xa và cao hơn kiểu camera đuổi theo trong ảnh đua; FOV tăng nhẹ theo tốc độ (SPEC §5).
- Khi nhìn thẳng, đường chân trời nằm ở khoảng 40–45% chiều cao màn hình.

## Ánh sáng & màu (Phase 2, SPEC §14)
- Nắng ban ngày rõ: mặt trời chiếu xiên, bóng đổ sắc, tương phản cao. Trời xanh nhạt có mây mỏng.
- Khí quyển/sương nhẹ làm nhạt cảnh xa (đồng thời che ranh giới chunk).
- Tông ấm, bão hòa vừa phải (ACES). Mặt đường nhựa xám đậm; vỉa hè bê tông sáng có bó vỉa; dải cỏ ven đường.

## Đường phố & nhà (Phase 2)
- Vạch trắng đứt đoạn giữa làn, vạch dừng và vạch người đi bộ ở giao lộ. Paris dùng vạch trắng, không có vạch vàng đôi kiểu Mỹ trong ảnh.
- Vỉa hè cao hơn mặt đường khoảng 15 cm, có bó vỉa. Cột đèn, đèn giao thông ở giao lộ, cây dọc đường, nắp cống.
- Nhà: mặt tiền nhiều cửa sổ, ban công, mái dốc tối màu có ống khói. Tòa nhà giữa ảnh `gta-onfoot.jpg` rất gần với kiểu nhà Haussmann cần dựng (SPEC §4.4).

## HUD (Phase 5, SPEC §12)
- Chữ trắng trên hộp đen trong suốt (khoảng 60–70%), bo góc nhỏ, bóng chữ nhẹ. Font không chân cho thông tin; font kiểu viết tay cho tên đường (font miễn phí có license).
- **Góc trên trái:** thẻ nhiệm vụ hiện tại, đặt đúng chỗ hộp gợi ý của GTA.
- **Góc dưới trái:** minimap. Ngay phía trên là dòng thông báo xếp chồng (feed), dùng cho Toasts, ví dụ "Chậm một bước! Xe đã có người lấy.".
- **Góc dưới phải:** tên đường bằng font viết tay, bên dưới là các khối "NHÃN · giá trị" canh phải (như POSITION 5/11 · TIME 00:37.46 trong ảnh đua).
- **Bảng tên đội khác:** chữ màu đội nổi phía trên đầu, không khung.
- Không có thanh máu/giáp, vì game không có máu.
- **Minimap hình chữ nhật** như GTA V (đã chốt, SPEC §17.3): góc dưới trái, chữ N chỉ hướng Bắc, xoay theo camera, đường GPS màu, tự zoom ra khi đi nhanh.
