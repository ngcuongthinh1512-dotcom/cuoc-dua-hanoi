# Leg 2 – thử thách "Công thức" (ống nghiệm + nhiệt độ)

Lập 2026-10-09 theo mô tả của anh (lấy ý từ Rooms of Realities, chương 3 "Nemo's Mysterious Formula"; luật gốc không có tài liệu công khai nên đây là luật của anh, không chép game). **Chưa code.** Phần "quy luật ra màu" anh sẽ giải thích sau.

## Bàn thí nghiệm
Bố cục (ảnh anh gửi 2026-10-09, em đọc, chờ xác nhận): phía trước giá là một hàng ổ tròn nằm ngang; trên giá có 3 ống màu Xám, Đỏ, Xanh Lá, mỗi ống nối xuống một ổ giữa bằng thanh và tay gạt. Ổ trái ở cạnh bảng nhiệt độ, ổ reset ở bên phải cạnh bảng kết quả.
Một ống nghiệm duy nhất người chơi cầm, 5 ô đặt ống:

| Ô | Khi đặt ống vào |
|---|---|
| 3 ô giữa (màu A, B, C) | ống nhận nguyên liệu màu đó; nhiệt độ −10 (−5 nếu ô nhiệt đã dùng). Đặt lại màu đã đặt (trước khi reset) = không có gì xảy ra (ống và nhiệt độ giữ nguyên) |
| Ô trái (nhiệt) | nhiệt độ +50 ngay, chỉ tác dụng một lần; lần sau đặt không có gì xảy ra |
| Ô phải (reset) | ống rỗng ngay, nhiệt độ về 30, ô nhiệt dùng lại được |

- Nhiệt độ ban đầu 30. Không thể xuống dưới 0 (tối đa 3 lần đặt màu × 10 = 30).
- Kết quả cần đạt (bảng bên phải): **60°** và ống đổi **màu xanh biển có bọt khí ở giữa**. Công thức (anh nói 2026-10-09, **em đang xác nhận cách đọc**): Xanh Lá → Đỏ → Xám, hoặc Xanh Lá → Xám → Đỏ, hoặc "thả ngay vào ô bên trái". Cách đọc em đề xuất: Xanh Lá, rồi **ô nhiệt ngay sau đó**, rồi Đỏ và Xám theo thứ tự nào cũng được (30 − 10 + 50 − 5 − 5 = 60°). Đây là cách duy nhất với 3 màu cho đúng 60°.

## Hệ quả tính được
- Mỗi màu dùng tối đa một lần giữa hai lần reset, nên chuỗi trong ống là hoán vị không lặp của A, B, C, dài 0–3.
- Gọi k1 = số lần đặt màu trước khi dùng ô nhiệt, k2 = sau đó: nhiệt độ = 80 − 10·k1 − 5·k2 (khi đã dùng nhiệt).
- Để đạt 60° bắt buộc phải dùng nhiệt, và chỉ có hai khuôn: (k1, k2) = (2, 0) ống 2 màu rồi mới đặt ô nhiệt; (1, 2) đặt ô nhiệt ngay sau màu đầu tiên rồi 2 màu nữa. → 6 + 6 = **12** cách đạt đúng 60° (chuỗi màu và vị trí dùng nhiệt).
- Tổng số trạng thái có thể (chuỗi màu + vị trí dùng nhiệt hoặc không dùng) = 65. Vì kết quả hiện ngay trên bàn, đội có thể thử hết trong vài phút nếu không có giới hạn: xem câu hỏi mở.

## Thiết kế dự kiến (khi anh duyệt)
- Server giữ trạng thái của từng đội (nhiệt độ, đã dùng nhiệt chưa, chuỗi màu trong ống) và tính hết; client chỉ báo "đặt ống vào ô x" và nhận lại trạng thái; luật ra màu nằm trên server, không có trong client / bundle.
- Module tự chứa trên nhánh git riêng, đăng ký bằng một file registry (quy ước phòng casino, `docs/plans/leg2-master.md`).

## Câu hỏi mở
1. Xác nhận cách đọc công thức ở trên (ô nhiệt đặt ngay sau Xanh Lá). Các chuỗi khác thì ống đổi màu gì, hay giữ nguyên?
2. Đạt kết quả thì tính qua thử thách ngay, hay đội phải xác nhận / Host duyệt?
3. Có chống thử hết 12–65 trạng thái không (giới hạn số lần reset, thời gian chờ mỗi lần reset, hay chấp nhận vì manh mối nằm ở nơi khác)?
4. Mỗi đội một bàn riêng, hay dùng chung?
