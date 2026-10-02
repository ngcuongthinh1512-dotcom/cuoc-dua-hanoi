# Phase 8 – những chỗ schema chặng chưa diễn đạt được (từ lần nhập chặng thật đầu tiên, 2026-10-02)

Nguồn: agent chuyển nội dung chặng thật sang file chặng (file thật nằm NGOÀI repo). Đây chỉ là các khoảng trống về CẤU TRÚC, không chứa nội dung mật thư hay đáp án. Quyết định của người dùng: SPEC §17.14.

1. **Gõ đáp án trong game + Host duyệt tay.** `host_approval` hiện giả định bằng chứng gửi qua Facebook (`proofInstruction`, `contactUrl` bắt buộc). Cần kiểu "đội gõ trong game, Host duyệt trên màn hình Host": thử thách đang mã hóa là `kind: 'answer'` + `verification: 'host_approval'` và `leg:check` cảnh báo thiếu `proofInstruction`.
2. **Đáp án tham khảo cho Host.** Chưa có trường riêng (chỉ Host thấy, không gửi cho client); hiện tạm để trong `task.answers` (server-only). Cần `referenceAnswers` hoặc quy ước hiển thị `answers` của bước `host_approval` cho Host.
3. **Phạt khi sai = đếm ngược 3 phút trước khi được trả lời lại.** Chưa có trường: `penalties` chỉ có `walkOnlyViolationMinutes`, `quitTaskMinutes`. Cần ví dụ `penalties.retryLockMinutes = 3` hoặc giá trị theo từng thử thách; đồng hồ đếm ngược hiện trên màn hình đội; Host bấm Phạt.
4. **Gợi ý theo giờ** (mỗi 45 phút chưa xong thì thêm gợi ý): cần `task.hints` dạng `[{afterMinutes, text}]` hoặc `{everyMinutes, texts}`.
5. **Liên kết trong mật thư / đề bài** (video, hình): thẻ Phase 7 hiển thị URL dạng chữ và chưa vẽ `task.media`; bước `route_info` chưa có `media`. Cần liên kết bấm được trên thẻ và Sổ mật thư.
6. **Nơi được gõ đáp án.** Thử thách không có `task.location` thì vùng làm việc mặc định là vùng hộp mật thư trước đó (ví dụ 40 m ở Eiffel) và thao tác `task` bị từ chối ngoài vùng. Cần quyết định: câu trả lời gõ trong game có gửi được từ bất kỳ đâu không (nhất là thử thách "nhận ra địa điểm trong hình" khi đội đang đi tìm).
7. **Lịch sử câu trả lời của đội** (nội dung gõ, giờ, trạng thái) chỉ hiện trên thẻ thử thách + ô ghi chú Host cho mỗi lần duyệt: việc của giao thức và engine, không đổi schema chặng. Lưu mọi câu trả lời gõ trong game cho màn hình Host.
8. **Đề bài chi tiết của từng nhánh Lựa chọn kép chỉ lộ khi vào đúng vùng nhánh.** Thẻ hiện cả hai nhánh ngay từ đầu; cần `task.description` của nhánh chỉ hiện khi đội vào `task.location` của nhánh đó.
9. **`leg:check` quét lộ đáp án không xét thứ tự bước:** một đáp án xuất hiện ở chữ của bước SAU (đọc sau khi giải) bị báo nhầm là đọc được trước khi giải. Chỉ nên kiểm các chữ tới bước chứa đáp án.
10. **Mục giữ chỗ** (tên điểm bắt đầu bằng `[CHƯA NHẬP`) không bị `leg:check` hay bước kiểm tra "Mở cuộc đua" coi là trống: cần quy tắc để bản nháp không bị mở nhầm.
11. **Hướng của hòm mật thư** (`yaw`) chưa có trong file chặng (hòm hiện luôn quay về +z).
12. **Mật thư đọc sau khi duyệt:** tên bước ("Lộ trình 6", "Thử thách 2") và nhãn thẻ: quy tắc đánh số (thẻ chứa "Mật thư n" mang nhãn "Lộ trình n+1") cần được người dùng chốt.
