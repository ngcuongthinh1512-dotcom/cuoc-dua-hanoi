# Phase 10 – nhóm sửa lỗi review

Trạng thái: XONG. Nguồn: `phase10-review-speccode.md` (1–8), `phase10-review-e2e.md` (F1–F5).

| Việc | Đã sửa | Test (thất bại nếu hoàn tác: đã thử) |
|---|---|---|
| (1) Hoàn tác cắt theo số (speccode #1) | Bỏ `NET.undoKept`; `meta 'undo'` chỉ cắt theo `NET.undoMs` (mỗi bản ghi ≤ 2 hàng nhỏ, Host bấm tay → meta nhỏ) | `engine.test.ts` "6 Duyệt of 6 teams within 10 s…" |
| (2) Cho qua ở teaser (speccode #4, e2e F3) | `steps.ts review()`: Cho qua chạy cả khi đội chưa "Nhận thử thách"; `task_started_at = now` nếu chưa có (mốc / cảnh báo kẹt / bảng xuất đúng) | `steps.test.ts` V5 "Cho qua" (teaser) |
| (3) Bảng xuất: hạng của đội bị loại (e2e F2) | Cột "Hạng về đích" trống khi `finishAt === null`; cột mới "Hạng cuối (kể cả bị loại)". RACE_RULES + README: cột "Mở hòm" bước 1 = lúc vào game lần đầu, có thể âm | `export.test.ts` (đội `out` chưa về: `[null, 2, true]`) |
| (4) "vừa rời đi" kẹt sau ngủ đông (e2e F1) | `engine.restoreWhere`: một lần sau khi engine dựng lại, `where` lấy từ vị trí tin cậy (snapshot 2 s của RaceRoom) của các đội online (+ đội vừa đóng socket); `since` = lúc thức (ponytail) | `engine.test.ts` "Tại điểm này after an eviction / hibernation" |
| (5) Host 800 px (e2e F5) | `.matrix-wrap` max-height = `max(200px, min(72vh, 100vh − --queue-h − 24px))`; `--queue-h` do `ResizeObserver` trên khung "Chờ duyệt" đặt. Ảnh `p10-host` (1280×720, Chờ duyệt mở): khung ma trận ≈ 340 px, cuộn bên trong | `hostView.test.ts` (luật CSS + ResizeObserver) |
| (6) Tài liệu | README:17 "Duyệt câu vừa phạt"; README:18 + RACE_RULES mục 7: chỉ chặn khi đội đã **hoàn thành** bước kế, việc vừa làm ở bước mới bị bỏ, xe đã vào bãi vẫn ở bãi (M4); TODO tồn Phase 10 (M4, undo Phạt không kêu lại, `where` dựng lại); kế hoạch §5.3 "tối thiểu 1 phút" (người dùng đã duyệt), kế hoạch: bỏ `undoKept` | – |
| (7) `exportErrorText(403)` nhánh chết | Bỏ (Worker trả 401 cho cả token đội) | test chỉnh theo |

Không làm (theo yêu cầu): Hoàn tác Phạt kêu lại hàng chờ (speccode #8, ghi TODO). speccode #5 / e2e F4: giữ "1 phút" tối thiểu, sửa kế hoạch.
