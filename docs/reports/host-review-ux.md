# Trang Host: hàng chờ duyệt rõ ràng (2026-10-04, SPEC §17.42)

Yêu cầu: "khúc đáp án của thử thách 2 rất khó nhìn, host dễ bị nhìn nhầm với đáp án gợi ý". Trước đây câu trả lời của đội («bảy») là một dòng chữ thường, ngay dưới là "Đáp án tham khảo: 7 | bảy" vàng đậm cùng cỡ → Host nhầm hai thứ.

## Đã làm
- `client/src/host/hostView.ts`: `answerMatch(text, reference)` thuần ('yes' / 'no' / null) dùng `normalizeAnswer` (bỏ dấu, hoa / thường, đ, khoảng trắng thừa — cùng hàm với tự chấm `auto` của máy chủ); `QueueRow` thêm `stepName`, `waitMs`, `match`, `attempt`, `previous` (các lần gửi trước cùng nhánh, từ `progress[].answers`, kèm trạng thái / giờ / ghi chú Host).
- `shared/src/protocol/answers.ts` (mới): `normalizeAnswer` chuyển từ `shared/src/leg/check.ts` (vẫn re-export cho Worker / `leg:check`) để trang Host dùng được mà không kéo zod vào client (`@race/shared/leg` cấm import giá trị ở client).
- `client/src/host/main.ts` `drawQueue` + `host.css`: mỗi bài một thẻ 3 vùng — đầu thẻ (chấm màu, tên đội 17 px, bước · tên điểm · nhánh, đồng hồ "chờ mm:ss" cam khi ≥ `hostPage.queueSlowSeconds` = 120 s, mã bài nộp nhỏ + Sao chép) / khung **ĐỘI TRẢ LỜI** (chip xanh dương, nền `#163260`, viền trái màu đội, chữ 20 px đậm trắng, "Lần gửi thứ n" + các lần trước 13 px mờ; bài ảnh: **ĐỘI BÁO ĐÃ GỬI BÀI QUA MESSENGER** + mã cỡ lớn + Sao chép) / khung **🔒 ĐÁP ÁN ĐÚNG – chỉ Host thấy** (chip xanh lá `#1f7a3a`, nền `#0f2a1a` viền đứt, chữ 13–14 px, mỗi đáp án một ô) / hàng thao tác (ghi chú, Duyệt to, ô "Đúng ?/n" sát Phạt với chú "gửi kèm Phạt · đội sẽ thấy số / chưa thấy", Phạt to cách Duyệt 24 px, Lưu ghi chú). Huy hiệu "KHỚP đáp án" (xanh lá nhạt, chữ tối) / "Chưa khớp" (xám, không đỏ) chỉ với bài gõ chữ có đáp án tham khảo. Không màu vàng; mọi chữ ≥ 4,5:1 (tính tay: chip xanh dương 5,0, chip xanh lá 5,4, chữ phụ trên nền xanh 7,4, huy hiệu xám 8,7). Khung cuộn trong 50vh (trước 40vh), vẫn gập / ghim như Phase 10; Hoàn tác, âm báo, Notification, "Cho qua" không đổi.
- `?demo=1`: thêm bước giả "Thử thách 2" (gõ tên địa điểm, cùng điểm Lộ trình 3) + Đội Nâu (t6, lần 1 «Cầu Alma» bị phạt, lần 2 "cau iena" khớp "Cầu Iéna"); Đội Cam gõ "sáu" (chưa khớp "7 | bảy"); Đội Vàng bài Messenger chờ 2:30 (đồng hồ cam). Không dùng nội dung chặng thật (đáp án thật không được vào bundle: `leg:check` quét `client/dist`). Đội của bản đồ demo dời sang t7 / t8.
- Preset `p10-review` (1280 × 1600, bản đồ mở) / `p10-review-1024` (1024 × 1400, không tràn ngang); `p10-host*` giữ nguyên.
- Test: `hostView.test.ts` (+ `answerMatch`, các trường thẻ, lịch sử cùng nhánh, không có progress), `hostMapData.test.ts` cập nhật; `scripts/leg-check.test.ts` "Host page demo" (không rò chữ chặng) vẫn qua; `npm run build` qua.
- Docs: SPEC §17.42, CLAUDE.md (dòng host/), DEPLOY.md §4 bước 8, TODO "Khác".

## Ảnh
- `screenshots/p10-review.png` (1280 px, bản đồ mở), `screenshots/p10-review-1024.png` (1024 px). Ba thẻ: bài Messenger (mã to), bài gõ "sáu" Chưa khớp, bài gõ "cau iena" Lần gửi thứ 2 KHỚP đáp án; khung xanh lá đáp án đúng nhỏ hơn, tách rõ.

## Tồn
- So khớp đúng cả câu (không gần đúng, không tách từ); ngưỡng cam 120 s cố định trong config; chưa kiểm tay Firefox / Safari và câu trả lời rất dài.
