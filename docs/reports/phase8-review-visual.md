# Phase 8 – Reviewer 2: Giao diện

Ngày: 2026-10-02. Kết luận: **ĐẠT** (không có lỗi chặn; 2 việc nên sửa, còn lại là lỗi nhỏ).

Lệnh đã chạy (port 5211, từng nhóm, cả ba đều thoát 0 và không có lỗi console):
`npm run screenshot -- p8` (15 PNG), `-- p7` (22 PNG), `-- p6-boxes p5-hud` (2 PNG). Đã mở và xem từng PNG trong `screenshots/`, cắt / phóng to từng vùng bằng sharp trong scratchpad.
Chụp thêm ở **1024 × 640** bằng script riêng trong scratchpad (`rv8v/small.mts`, không sửa repo): thẻ ảnh (proof), detour-chosen, branch-task, detour-locked, Sổ có hình (cả trên lẫn đáy), media, answer-locked, trang Host. Không lỗi console.
Đối chiếu với: `docs/STYLE_GUIDE.md` (HUD), SPEC §8.2, §8.9, §8.11, §17.14–17.16, `docs/plans/phase8.md` D7, D9, D15, D16.
Dọn dẹp: vite / chrome do tôi mở đều đã tắt. Vite :5431 và `scratchpad/driver.mts` + Chrome headless (PID 7327/7329) là của agent khác, tôi không đụng.

## Nên sửa

1. **Sổ mật thư không có nút "Mở Facebook / Messenger gửi bài"** (`p8-book-media.png`, `rv8v/s-book-media*.png`). playerVisible.
   SPEC §8.11 yêu cầu mục Thử thách trong Sổ có "mã bài nộp (có nút Copy), nút mở Facebook của Host". Trong `client/src/race/ui/format.ts` `cardPanel`, `proof.actions = act && status === 'active'` với `act = !book && …`, còn `RaceHud.proofBox` chỉ thêm link liên hệ khi `p.actions`. Hệ quả: link không bao giờ hiện trong Sổ, và cũng biến mất khỏi thẻ khi `pending` / `locked` (đội bị Host phạt và phải gửi lại ảnh thì không còn nút để mở Messenger).
   Cách sửa: tách link liên hệ khỏi `actions`. Link hiện ở mọi trạng thái chưa xong và trong Sổ; chỉ nút "Tôi đã gửi bài" đi theo `actions`.
2. **Preset `p8-media-offline` trùng hệt `p8-card-media`** (`p8-media-offline.png` và `p8-card-media.png` trông như nhau). Không phải lỗi người chơi thấy.
   Hai preset cùng URL `card=media&full`. Bộ resolve demo (`RaceHud.demo`) chỉ trả `null` cho `demo-off.jpg`, mà `MEDIA_SET` không có tên này. Vì vậy ô "Hình chỉ tải được trong cuộc đua" (trạng thái offline, D13) chưa bao giờ được chụp hay xem.
   Cách sửa: thêm một thẻ demo (ví dụ `card=media-off`) có `{ url: 'r2:demo-off.jpg' }` và trỏ preset vào đó.

## Nhỏ

3. **Trang Host ghi mã nhánh, thẻ đội ghi tên nhánh.** playerVisible (Host).
   - Host thấy: hàng chờ "Lựa chọn kép · nhánh B", ô ma trận "(B)" / "(A ↺1)", câu cảnh báo kẹt "(nhánh A)" và thông báo trình duyệt (`host/main.ts:405,430`, `hostView.ts:264,368`).
   - Đội thấy: "nhánh Tính / Ảnh" (`p8-host.png`, `p8-card-detour-chosen.png`).
   - Với chặng thật, Host sẽ đọc "nhánh A" trong khi đội nói "Lửa". `HostState.leg.steps[].branches[].name` đã có sẵn, nên in "Lửa (A)" là đủ.
4. **Nút "Duyệt lại" trong ô ⏳ của ma trận** (`p8-host.png`, ô Đội Tím / Thử thách 1) dễ bị hiểu thành "xem lại". Ý nghĩa thật chỉ nằm trong tooltip "Sửa lại: duyệt câu vừa bị phạt". Gợi ý đổi thành "Duyệt câu vừa phạt". playerVisible (Host).
5. **Dòng trạng thái của thẻ Lựa chọn kép ở bước `goToBranch` khó thấy** (`p8-card-detour-chosen.png`, `p8-card-proof.png`). playerVisible.
   Dòng "Đang làm nhánh Tính – tới hòm nhánh để nhận đề bài · Đã đổi nhánh 1 lần" là chữ trắng nhỏ, không có khung, kẹp giữa hai khối nhánh. Các trạng thái khác dùng khung `rc-timer` có viền màu. Đây là chỉ dẫn chính của bước này nên cần nổi hơn (dùng `rc-timer info` như dòng chờ / khóa).
6. **Hai cách gọi cùng một vật: "hộp mật thư" và "hòm".** playerVisible.
   - "hộp mật thư": lời nhắc F ("Bấm F để mở hộp mật thư", `p6-boxes.png`, `p7-openbox.png`) và các toast `boxFar` / `boxOpened`.
   - "hòm": thẻ Lựa chọn kép ("tới hòm nhánh", "hòm nhánh Ảnh hiện khi hết giờ") và các toast `branchChosen` / `branchSwitched` (`client/src/ui/Toasts.ts`).
   - Nên chọn một từ (SPEC §17.15 dùng "hòm mật thư").
7. **Đồng hồ đếm ngược phạt / đổi nhánh nhỏ và bị lặp** (`p8-card-answer-locked.png`, `p8-card-detour-locked.png`, `p8-card-answer-locked-full.png`, `rv8v/s-answer-locked.png`). playerVisible.
   Đồng hồ là một khung xám nhỏ, chữ khoảng 15 px, ở giữa phía trên màn hình, ngay dưới lời nhắc "Nhấp chuột để chơi". SPEC §17.14 / §17.16 nói "màn hình đội hiện đồng hồ đếm ngược", nên phần số có thể to hơn. Khi thẻ mở, đồng hồ hiện hai lần (giữa-trên và trong thẻ). Chấp nhận được vì cùng kiểu với "Phạt chờ" ở thảm Phase 7 (`p7-pit.png`).
8. **Đế xám của hòm không thấy khi hòm đứng trên mặt lát đá** (`p8-box-branch.png` hòm A ở x = −38; `p6-boxes.png` hòm đã mở ở −25.2, −7.7). Cột vàng như cắm thẳng xuống đường, trong khi hòm đứng trên vỉa hè thì thấy đế (`p7-box-close.png`, `p8-box-yaw.png`). Có từ Phase 7 (commit 7ab9e72 "đế hòm kéo xuống dưới mặt đất"), không phải lỗi Phase 8. playerVisible.
9. **Ma trận Host ở 1024 px phải cuộn ngang** (`rv8v/s-host.png`): các cột tóm tắt chiếm khoảng 520 px, nên ô Lựa chọn kép (có nút Duyệt / Phạt) nằm ngoài màn hình. Tiêu đề "Bù giờ chờ duyệt" gãy thành 3 dòng. Hàng chờ ở đầu trang (sticky, `max-height: 46vh`) đã bù phần lớn chỗ này. playerVisible (Host).
10. **Trang Host còn chút lệch nhỏ** (`p8-host.png`): khoảng trống khoảng 60 px giữa banner cảnh báo kẹt và "Chờ duyệt (2)"; hai ô chọn tệp trong "Hình mật thư (R2)" lệch cột theo độ dài tên tệp. Rất nhỏ. playerVisible (Host).
11. **Chưa có preset nào chụp toast Phase 8** ("Đã gửi câu trả lời, chờ Host duyệt", "Host đã duyệt! Mật thư mới đã vào Sổ mật thư.", "Host chưa duyệt: …"), thẻ ảnh ở trạng thái `pending`, hay hộp xác nhận đổi nhánh. `confirm()` là hộp thoại của trình duyệt nên không chụp được; đọc chữ trong `branchConfirmText` thì có "Đội bị phạt 10 phút (đếm ngược trên màn hình), mất tiến độ nhánh …", đúng §17.16. Chỉ là thiếu độ phủ.
12. **Dữ liệu demo `p8-book-media` không khớp nhau**: thẻ rút gọn góc trên trái là "Lộ trình 1", nhưng Sổ lại ghim "Lựa chọn kép · Hiện tại · Đang làm". Chỉ là dữ liệu giả, không phải lỗi game.

## Đã xem và đạt

- **`p8-host.png` (1280) và `rv8v/s-host.png` (1024):**
  - Hàng chờ "Chờ duyệt (2)" + nút "Bật thông báo". Mỗi mục có: chấm màu đội, nhãn bước, mã bài nộp + "Sao chép", «câu trả lời» hoặc "Đội báo đã gửi bài qua Messenger (đối chiếu ảnh với mã trên)", "chờ mm:ss", **Đáp án tham khảo** chữ vàng, ô ghi chú, ba nút Duyệt (xanh) / Phạt 3 phút (đỏ) / Lưu ghi chú.
  - Banner đỏ "⏰ Đội Tím làm Thử thách 1 đã 46 phút (cứ 45 phút báo một lần)".
  - Ma trận: ô cam "chờ duyệt mm:ss" kèm Duyệt / Phạt; ô tím "⏳ mm:ss ✗n"; "Duyệt (đã nhận ảnh)"; "(A ↺1)"; cột "Bù giờ chờ duyệt".
  - Dòng "Phạt 3 / 10 phút (trả lời lại / đổi nhánh) · cảnh báo kẹt sau 45 phút".
  - Mục Hình: "✓ đã có (240 KB)" / "✗ chưa tải lên". Nút tải lên / Xem bị mờ ở demo vì không có token, đúng code.
  - Tiếng Việt đúng dấu, tương phản đủ.
- **Thẻ thử thách** (`p8-card-answer*.png`, `p8-card-teaser.png`, `p7-card-full*.png`):
  - Ô gõ + nút "Gửi câu trả lời [Enter]".
  - Lịch sử mới nhất ở trên, mỗi dòng "hh:mm:ss «…» Bị phạt 3 phút / Chờ Host duyệt".
  - Trạng thái chờ duyệt: "Đang chờ Host duyệt · 01:12", không có ô gõ.
  - Trạng thái khóa: "Phạt: còn 02:40 trước khi trả lời lại", không có ô gõ.
  - Dòng trạng thái màu trên thẻ rút gọn.
  - Câu gợi ý + "Nhận thử thách [Enter]".
- **Lựa chọn kép** (`p8-card-detour-*.png`, `p8-card-branch-task.png`, `p8-card-proof.png`):
  - Hai nút "Chọn nhánh Tính [1]" / "Chọn nhánh Ảnh [2]".
  - Nhãn "Đội đã chọn"; nhánh kia hiện mờ.
  - Nút "Đổi lựa chọn kép" hiện khi đã chọn / đang làm, ẩn khi đang đếm ngược đổi nhánh.
  - Đếm ngược "Đổi lựa chọn kép: còn 09:00 · hòm nhánh Ảnh hiện khi hết giờ", không có hòm.
  - Nhánh ảnh: mã bài nộp "Đội Xanh-D2-B" + Copy, "Mở Facebook / Messenger gửi bài", "Tôi đã gửi bài – chờ Host duyệt".
- **Hình và liên kết:** hình hiện trên thẻ và trong Sổ, có chú thích; link không có nhãn thì hiện hostname ("example.org ↗"). Sổ không có lịch sử câu trả lời (đúng §17.14); Sổ có mã bài nộp + Copy.
- **Hòm trong 3D:**
  - `p8-box-yaw.png`: hòm yaw 0 lật nắp về phía nam (phía sau), hòm yaw 90 lật nắp về phía đông, đúng chú thích preset.
  - `p8-box-branch.png`: hòm nhánh A đã mở, hòm nhánh B đóng.
  - `p7-box-close.png` / `p7-box-opened.png`: hòm đã mở thì dải đỏ chuyển đỏ xám.
  - `p7-box-far.png`: thấy cột sáng vàng từ 150 m.
  - `p7-openbox.png`: mặt trước hòm quay về phía đội.
- **Bố cục 1024 × 640** (`p8-card-answer-small.png`, `p7-*-small.png`, `rv8v/s-*.png`): thẻ ảnh và thẻ nhánh vừa khung (thẻ ảnh cao 41–622 px), không cắt chữ, Sổ cuộn được với tiêu đề dính trên cùng. Thẻ che một phần minimap / tên đường nhưng có nền mờ, giống `p7-card-full-small` đã được duyệt.
- **Không hỏng gì so với Phase 7** (`p7-*.png`, `p6-boxes.png`, `p5-hud.png`): HUD góc dưới phải, đồng hồ, "Chưa bắt đầu", "Xuất phát ở vị trí thứ 3", câu ở vạch đích, "Phạt chờ", "Tại điểm này", Sổ.
