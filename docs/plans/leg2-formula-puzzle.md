# Leg 2 – thử thách "Công thức" (ống nghiệm + nhiệt độ)

Đặc tả **final**, anh chốt 2026-10-09 (ý tưởng lấy từ Rooms of Realities, chương 3 "Nemo's Mysterious Formula"; luật gốc không có tài liệu công khai nên đây là luật của anh, không chép game). Giao cho một agent Opus dựng trên nhánh riêng `leg2-formula-puzzle`.

## Quyết định của anh
- Luật nhiệt độ + luật trộn màu bên dưới là bản final.
- **Không chống thử hết** 65 trạng thái: các đội được thử thoải mái, không phạt, không giới hạn reset, không thời gian chờ. Gợi ý **duy nhất** là tờ giấy "Xám + Đỏ = Xanh Lá nhạt có bọt" (hình hai ống nối bằng dấu + và =).
- **Thắng → qua thử thách ngay lập tức**, không Host duyệt.
- **Thao tác bằng chuột**: kéo ống nghiệm ra / vào các ổ; khi kéo tới gần một ổ thì hiện **bóng mờ** của ống tại ổ đó (ảnh thứ hai anh gửi: ống xanh lá trong suốt đặt trên ổ), thả chuột thì cắm vào.

## Bàn thí nghiệm
Bố cục theo ảnh anh gửi: một hàng **5 ổ tròn** nằm ngang phía trước giá; trên giá có 3 ống nguyên liệu Xám, Đỏ, Xanh Lá (chỉ để nhìn, nối xuống 3 ổ giữa bằng thanh và tay gạt); bảng nhiệt độ ở bên trái, bảng kết quả cần đạt ở bên phải.
Người chơi có **một ống nghiệm duy nhất**, kéo vào các ổ:

| Ổ (trái → phải) | Khi cắm ống vào |
|---|---|
| 1 – nhiệt (cạnh bảng nhiệt độ) | nhiệt độ +50 ngay, **chỉ tác dụng một lần** giữa hai lần reset; lần sau cắm không có gì xảy ra. Không đổi màu ống |
| 2, 3, 4 – Xám, Đỏ, Xanh Lá | ống nhận màu đó (trộn theo bảng dưới); nhiệt độ −10, hoặc −5 nếu ô nhiệt đã dùng. **Cắm lại một màu đã cắm (trước khi reset) = không có gì xảy ra** (ống và nhiệt độ giữ nguyên) |
| 5 – reset (cạnh bảng kết quả) | ống rỗng ngay, nhiệt độ về 30, ô nhiệt dùng lại được |

- Nhiệt độ ban đầu 30; không thể xuống dưới 0 (tối đa 3 lần cắm màu × 10).
- Rút ống ra khỏi ổ rồi cắm lại ổ khác: hiệu ứng chỉ xảy ra khi **cắm**.
- Bảng kết quả cần đạt: **60°** và ống **Xanh Dương có bọt khí ở giữa**.

## Luật trộn màu (X = Xám, R = Đỏ, G = Xanh Lá; cặp màu trộn không phụ thuộc thứ tự)
| Trộn | Ống thành |
|---|---|
| một màu | màu đó |
| G + R | Vàng |
| G + X | Cam, có bọt |
| X + R | Xanh Lá nhạt, có bọt |
| Vàng + X | **Xanh Dương có bọt** (kết quả cần đạt) |
| Cam + R | Xanh Dương không bọt |
| Xanh Lá nhạt + G | Đen |

Sáu hoán vị 3 màu: G,R,X và R,G,X → Xanh Dương có bọt; G,X,R và X,G,R → Xanh Dương không bọt; X,R,G và R,X,G → Đen.

## Điều kiện thắng
**Xanh Dương có bọt + đúng 60°.** Nhiệt độ 60° với 3 màu chỉ ra khi ô nhiệt cắm ngay sau màu đầu tiên (30 − 10 + 50 − 5 − 5), nên chỉ có **2 cách thắng**:
1. Xanh Lá → nhiệt → Đỏ → Xám
2. Đỏ → nhiệt → Xanh Lá → Xám

Tổng số trạng thái có thể (chuỗi màu + vị trí cắm nhiệt hoặc không) = 65.

## Thiết kế dựng
- **Là một loại thử thách của chặng** (task kind `formula`), tự chứa: thư mục riêng phía client (bảng thí nghiệm) và phía worker (luật + trạng thái), kiểu giao thức riêng, đăng ký qua **một file registry** loại thử thách; gỡ = xóa thư mục + một dòng (quy ước ở `docs/plans/leg2-master.md`). Làm trên nhánh `leg2-formula-puzzle`, gộp bằng một merge commit.
- **Giao diện**: một lớp phủ (overlay) trên màn hình mở từ thẻ mật thư của bước (nút "Mở bàn thí nghiệm"), vẽ bằng HTML / SVG / canvas, không model 3D mới. Chuột được thả khi mở, giống thẻ mật thư. Tờ giấy gợi ý vẽ ngay trong overlay.
- **Server có thẩm quyền**: trạng thái của từng đội (nhiệt độ, đã dùng nhiệt chưa, các màu đã cắm theo thứ tự, màu + bọt của ống) nằm trong DO, ghi SQLite **trước khi** trả lời; client chỉ gửi "cắm ống vào ổ n" và nhận lại trạng thái hiển thị. **Bảng luật trộn không có trong client / bundle** (chỉ trong worker); bảng kết quả cần đạt hiển thị 60° + ống Xanh Dương có bọt.
- Thắng → server đánh dấu bước xong ngay, như một bước tự chấm khác.
- Mỗi đội một bàn (trạng thái riêng theo đội), dựng lại từ SQLite khi DO khởi động.
- Hạn mức Cloudflare: mỗi lần cắm là một tin nhắn nhỏ; không có vòng lặp.
