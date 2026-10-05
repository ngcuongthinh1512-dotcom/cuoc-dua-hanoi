# Thử thách nhiều ô (`task.parts`) — đội điền N ô, Host duyệt (2026-10-05)

Yêu cầu người dùng: Thử thách 1 (4 địa điểm trong MV) không gửi Messenger nữa; đội điền 4 ô trên web. Lần chốt thứ hai (cùng ngày): **Host duyệt** (điền x/4), bỏ chấm tự động, không có đáp án trong chặng. SPEC §17.44.

## Đã làm
- Schema `task.parts` (shared/src/leg/schema.ts): mảng 2–8 × `{ label?: string }`; `checkLeg`: LỖI nếu `verification` ≠ `host_approval` hay `kind` ≠ `answer`, CẢNH BÁO nếu `scoreOf` khác số ô. Không có đáp án → không thêm quét rò rỉ, `credits.json` không liên quan nữa (lần 1 đã làm `gradeParts` + hạ `credits.json` xuống cảnh báo; đã gỡ hết, `scanLeaks` / leg-check về như cũ).
- Máy chủ: `steps.ts advance` — một nhiệm vụ có `parts` chỉ nhận `input.parts` đủ N chuỗi không trống (khác → im lặng), nối `PARTS_SEP` " | " thành **một** bản ghi pending → đường Host duyệt sẵn có (SQLite / AnswerRec không đổi). `tasks.ts partsOf(t) = scoreOf ?? parts.length` dùng cho `review()` (giới hạn x ≤ N), `scoreFrom`, thẻ (`answerViews`), notice `penalized`, hàng chờ (`ReviewItem.scoreOf` + `partLabels`), CSV `penaltyScores`. Hoàn tác / Cho qua / ghi chú không đổi.
- Giao thức v8: `race answer {text:'', parts}` (codec 2–8 × ≤ 200), `TaskView.input 'parts'` + `partLabels`, `ReviewItem.partLabels`.
- Client: `cardPanel.parts { labels, enabled }` (active / pending / locked; enabled chỉ khi active), RaceHud `partsRows`: N ô dọc có nhãn, Tab chuyển ô (Esc rời ô rồi Tab đóng thẻ), Enter ô giữa → ô kế / ô trống, Enter ô cuối hoặc nút "Gửi đáp án" (bật khi đủ ô) gửi; chữ giữ trong ô sau khi gửi (sửa sau Phạt). Lịch sử `«a · b · c · d» · Bị phạt 3 phút[ · đúng 2/4]`.
- Trang Host: `queueRows` → `parts` (`partsOf(text, partLabels)`), khung ĐỘI TRẢ LỜI = `<ol class="rv-parts">` nhãn + chữ 20 px; `match` null (không huy hiệu); ô "Đúng ?/N" có sẵn vì máy chủ gửi `scoreOf = N`.
- Bot `sim`: điền "(bot) ô n", Host bot duyệt. Chặng test `worker/legs/test/full.json` bước `T1P` (GIẢ), `leg:check` hợp lệ.
- Test: steps (N ô → một pending; text / thiếu ô / ô trống im lặng; Phạt x/4 trước / từ phút 30 → `sv`; thẻ có `partLabels`, không có `scoreOf`), engine (vào hàng chờ với `partLabels` + `scoreOf 4`, Phạt sớm không số, Phạt sau phút 30 toast + thẻ "3/4", Duyệt → bước kế), schema / check, codec, card.test (panel active / pending / locked + lịch sử), hostView (danh sách N dòng, không badge).
- Ảnh: `screenshots/p8-card-parts.png`, `p8-card-parts-locked.png` (thư mục screenshots gitignored, không commit).

## Giới hạn
- Nhãn mặc định "Ô n": chặng thật nên đặt `label: "Địa điểm n"`.
- Ô "Đúng ?/N" chỉ ở hàng chờ duyệt (ma trận không có, như §17.31). Chưa kiểm tay trong cuộc đua thật.
