# Phase 7 – Track E: trang Host tối giản + bot `sim` chạy cả chặng

Nhánh `p7-track-e` (từ `fee5e6f`). File sở hữu: `client/src/host/*`, `client/host.html` (không đổi), `scripts/sim.ts` (+ test), khối `hostPage` trong `client/src/config.ts`, dòng `[E]` trong `scripts/screenshot.ts`.

## Đã xong
- **Trang Host** (`client/src/host/main.ts`, `hostView.ts`, `host.css`), tiếng Việt có dấu:
  - Cuộc đua: trạng thái + nút theo máy trạng thái D9 (lobby: Mở cuộc đua; running: Tạm dừng / Kết thúc; paused: Tiếp tục / Kết thúc), hỏi xác nhận; "Mở cuộc đua" liệt kê ô còn trống (ô trống của chặng, đội chưa có giờ xuất phát, chưa có đội).
  - Cảnh báo đỏ: còn `lobby` mà có đội online / đã có giờ xuất phát; đội đã vào game mà chưa có giờ xuất phát; chặng đang nạp có lỗi. `host.notice` hiện trong 15 s (`hostPage.noticeMs`).
  - Chặng: chọn chặng đóng gói (`leg.bundled`) hoặc file `.json` trên máy (≤ 256 KB) → `host.leg`; hiện `host.legResult` + `leg.issues` (LỖI / CẢNH BÁO / CÒN TRỐNG). Khóa nút khi không còn `lobby` hoặc đã có đội vào game, kèm quy trình "cuộc đua mới".
  - Giờ xuất phát từng đội: `datetime-local step=1` **hiểu theo `leg.timezone`** (`inputToMs` / `msToInput`, đúng cả qua đổi giờ mùa hè), nút Lưu / Bây giờ (`'now'`) / Xóa, xem trước "Đồng hồ đội sẽ hiện T+hh:mm:ss" (cảnh báo > 60 s tương lai trước khi gửi), `startOrder`, giờ vào game, bước hiện tại, phạt. Ô nhập không bị vẽ lại mỗi giây (`once()` theo chữ ký dữ liệu; bản nháp giữ lại khi vẽ lại).
  - Bảng tiến trình §13.6: hàng = đội (xếp theo `ranking`), cột = bước; xám / vàng (thời gian đã ở bước) / xanh "HH:mm:ss · mm:ss" (nhánh `(A)`), title = mọi mốc; cột Phạt, Về đích, Chính thức, Cách; nút đổi giờ thực ⇄ T+ (đồng hồ từng đội).
  - Hành lang xe từ `host.state.leg` (D11): điểm = xuất phát → vùng từng bước (cả hai nơi nhánh), checkpoints = mọi vùng (đã khử trùng), cấu hình = `leg.vehicles`; tự tính + gửi `host.candidates` khi `leg.id` đổi / chưa có ứng viên (server xóa ứng viên khi nạp chặng); nút tay vẫn còn. Bỏ `hostPage.corridor`, bỏ `glob` import spawnCandidates (nay import động).
- **`scripts/sim.ts --leg <id | file.json>`**: Host bot nạp chặng, tạo đội, `host.team startAt 'now'` từng đội, bot vào game, `host.race start`; mỗi bot đi A* tới vùng từng bước (5 Hz × speedup, trần tốc độ = điểm tin cậy D4), gửi vị trí trước mỗi op, `open` / `task` (đáp án đúng đọc từ file chặng; nhánh A / B xen kẽ theo bot) / vào thảm / `checkin`, thử lại tới khi `race view` chuyển bước. Báo cáo thêm: số đội về đích, số dòng xếp hạng, dòng SQLite / đội (ngân sách ≤ 110), các thao tác bị từ chối; thoát mã 1 nếu thiếu / vượt. Không `--leg` thì chạy y như Phase 6.
- Preset `p7-host` (`/host.html?demo=1`, chụp + xem PNG: 2 vòng, đã sửa bề rộng bảng).

## Test
- `npm test -w client` (`hostView.test.ts`): ma trận tiến trình (ô từng trạng thái, thời gian bước, T+, hạng), giờ theo múi giờ chặng (máy Host ở Paris nhập giờ Việt Nam đúng; DST), điểm hành lang + checkpoints (thử thách có `location` riêng nằm trong checkpoints), nút theo trạng thái, cảnh báo đỏ, xem trước giờ.
- `scripts/sim.test.ts`: đáp án đọc từ file, `legArg`, chặng nén vẫn hợp lệ, **bot chạy cả chặng nén với engine giả (không workerd)**: đúng thứ tự open / task / vào thảm / checkin.
- **Chưa chạy được ở worktree này:** test 3 bot chạy hết chặng trong harness thật (`it.skipIf(!engineReady)`) vì `worker/src/race/engine.ts` vẫn là STUB. Nó tự chạy khi file đó không còn chuỗi `FOUNDATION STUB` (track A xóa chú thích đó khi viết engine; nếu A để lại chuỗi thì test bị bỏ qua lặng lẽ: người tích hợp kiểm lại bằng `npx vitest run scripts/sim.test.ts` và `npm run sim -- --leg mini`).

## Cách chạy
- `npm test` · `npx vitest run scripts/sim.test.ts` · `SCREENSHOT_PORT=5405 npm run screenshot -- p7-host`
- `npm run dev:api` rồi `npm run sim -- --bots 3 --leg mini --speedup 2` (≈ 6 phút thật; `--minutes` = trần cho cả lượt, mặc định 30 khi có `--leg`).

## Người tích hợp cần biết / cần từ track khác
- Cần track A: `host.state.leg` đủ (`steps[].x,z,r`, `branches`, `vehicles`, `timezone`, `bundled`, `issues`), `host.legResult`, `host.notice`, `host.team startAt 'now'`, `host.state.progress` (`openedAt` của bước 1 = giờ xuất phát), `ranking` với `team` = id đội. Trang Host đã bỏ `HostState.steps` (Phase 6): A có thể bỏ trường đó.
- Bot `--leg` giả định: welcome của đội đầu có `view.card.step` = bước đầu của chặng và `welcome.start`; `race` view có `finishAt` khi check-in; từ chối thao tác trả `notice`.
- Nhánh B của `mini` (host_approval) chỉ qua được khi `verifyTask` còn là bản tạm Phase 7; Phase 8 phải cho bot chọn nhánh có đáp án (ghi `ponytail:` trong sim.ts).
- Không đụng `docs/SPEC.md`, `TODO.md`, `CLAUDE.md`, `shared/**`. TODO gợi ý cho người tích hợp: ma trận chưa có "ô khóa" / lọc theo đội; chưa có bảng `step_progress` đầy đủ (Phase 10).
