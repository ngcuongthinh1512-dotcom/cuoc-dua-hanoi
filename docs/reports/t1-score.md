# T1: Host báo "đúng x/4" khi Phạt (task.scoreOf) — 2026-10-03

- Schema: `task.scoreOf` (số nguyên ≥ 1, tùy chọn) + `task.scoreFromMinutes` (mặc định 30). `host.review` penalize nhận `score` (0…scoreOf; ngoài khoảng / trống → bỏ qua).
- Máy chủ (`steps.ts review()`): Phạt lưu `AnswerRec.sc` (số Host gõ) và cờ `sv` nếu `now ≥ task_started_at + scoreFromMinutes`; Duyệt (kể cả N4 sửa Phạt nhầm) xóa cả hai; Hoàn tác trả hàng cũ nên số mất theo. `cardOf` / notice `penalized` chỉ gửi `score`/`of` cho đội khi có `sv`. Queue Host: `scoreOf` + `scoreFrom` (ms). Export: cột `penaltyScores` ("2/4;3/4", `*` = đội chưa được báo).
- Trang Host: ô "Đúng ?/n" cạnh Phạt trong Chờ duyệt + chú thích "đội sẽ thấy số" / "đội chưa thấy số: còn n phút".
- Đội: toast "Host chưa duyệt: đúng 2/4. Chờ hết đếm ngược rồi trả lời lại"; lịch sử thẻ "Bị phạt 3 phút · đúng 2/4". Không công khai.
- Test: steps.test (trước / sau mốc, ngoài khoảng, Duyệt xóa), engine.test (notice + card + undo), card.test (chuỗi). Docs: LEG_FORMAT, RACE_RULES §7, SPEC §17.31, TODO.
- Người dùng: thêm `"scoreOf": 4` vào task T1 của file chặng thật (scoreFromMinutes mặc định 30), chạy `leg:check`, nạp lại trên trang Host.
