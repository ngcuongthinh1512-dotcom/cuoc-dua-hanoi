# Phase 8 – kiểm đối kháng Track E (trang Host + bot sim)

Ngày 2026-10-02. Đối tượng: worktree `.claude/worktrees/wf_4133df99-060-5`, nhánh `phase8-track-E`, commit `981f02e` (từ `0818033`). Đối chiếu: `docs/plans/phase8.md` §3 (D11, D14, D16, D18), §5, §6 Track E, §7, §8; báo cáo `docs/reports/phase8-track-e.md`. Không sửa mã.

**Kết luận: ĐẠT, không có lỗi chặn.** Có 1 lỗi nên sửa trước khi ghép (quét lộ đáp án của `mini` không còn sạch) và 8 lỗi nhỏ. Mọi mục "Việc" và "Test bắt buộc" của Track E đều có trong diff. Test tích hợp sim bị bỏ qua có chủ ý cho tới khi ghép A, nhưng tôi đã chạy nó trên bản sao của engine Track A (bản đang làm dở): qua.

## 1. Phạm vi file (§6, §8)

`git diff --stat 0818033..HEAD`: `client/src/config.ts` (chỉ khối `hostPage`, 5 khóa), `client/src/host/{host.css, hostView.ts, hostView.test.ts, main.ts}`, `scripts/{sim.ts, sim.test.ts, screenshot.ts}`, `docs/reports/phase8-track-e.md`. Tất cả nằm trong danh sách sở hữu của E. `screenshot.ts` có hai thay đổi: E thêm khối `p8-*` (nền chưa tạo khối này) và thêm `p8` vào regex loại khỏi lượt chụp mặc định (đúng §7). `client/host.html` không đổi (không cần đổi).

Sẽ xung đột khi ghép (không phải lỗi của E):
- `scripts/sim.test.ts`: Track A (bản đang làm, chưa commit) sửa dòng `engineReady` của phiên bản cũ, còn E viết lại cả vùng đó. Khi ghép, giữ bản của E (điều kiện `TODO(phase8 track A` đã gồm ý của A).
- `scripts/screenshot.ts`: Track B cũng chèn một khối `Object.assign(PRESETS, { … p8 … })` đúng chỗ đó. Khi ghép, giữ cả hai khối và giữ regex `p8` của E.

## 2. Chạy thật

| Lệnh (trong worktree E) | Kết quả |
|---|---|
| `client: npx vitest run src/host` | 2 file, **44 test qua** (`hostView.test.ts` có 40 test, nền có 18; `spawnCandidates` 4) |
| `npx vitest run scripts/sim.test.ts` | **18 qua, 1 bỏ qua** (test tích hợp, `skipIf(!engineReady)`), 31 s |
| `npm run build` (một lần) | **exit 0**: tsc, vite, `wrangler deploy --dry-run` đều qua; `grep ZodError client/dist` = 0 |
| `SCREENSHOT_PORT=5196 npm run screenshot -- p8-host` | Có PNG. Đã xem: hàng chờ 2 mục kèm đáp án tham khảo + mã bài nộp + Duyệt / Phạt 3 phút / Lưu ghi chú; banner "⏰ Đội Tím … 46 phút"; ô cam có Duyệt / Phạt, ô tím "⏳ 01:50 ×2" có "Duyệt lại", ô "Duyệt (đã nhận ảnh)", "(A ↺1)"; cột "Bù giờ chờ duyệt"; mục Hình 1 ✓ 1 ✗; dòng "Phạt 3 / 10 phút …". Khớp §6 preset |
| `npm run leg:check -- worker/legs/test/mini.json` | **1 cảnh báo** (xem lỗi S1); ở `main` (`0818033`): 0 cảnh báo |
| **Test tích hợp trên engine A**: chép worktree A (bản đang làm, chưa commit) vào scratchpad, đè `scripts/sim.ts` + `sim.test.ts` của E, chạy `-t "finish the whole leg"` | **qua** (119 s). Lần chạy dò cùng tham số: `finished 3, ranked 3, rowsPerTeam 68 / 160, sharedRows 61, stats {answers 7, approved 5, penalized 1, wrong 0, switches 1}, refused []` |

Sau khi chạy: worktree E vẫn sạch (`git status` rỗng), không còn `wrangler` / `workerd` / `vite` nào chạy.

## 3. Đối chiếu Việc + Test bắt buộc

- D16 (1) hàng chờ: có đủ. Hàng chờ sticky, `once` theo `queueSig` = `[id, team, step, at]`. Mỗi mục có chấm màu, nhãn, nhánh, `submitCode` (hàm dùng chung), «câu trả lời» hoặc "đã gửi bài qua Messenger", "chờ mm:ss" chạy tại chỗ, đáp án tham khảo, ô ghi chú (bản nháp giữ trong `noteDrafts`), Duyệt / Phạt n phút (n lấy từ `ReviewItem.lockMinutes`) / Lưu ghi chú. Âm báo WebAudio và `Notification` (nút "Bật thông báo") chỉ chạy cho khóa `team|step|id` mới; trạng thái đầu tiên sau khi tải trang không kêu.
- D11 / D16 (2) cảnh báo kẹt: `stuckAlerts` lấy mốc `startedAt` (nhánh: `branchOpenedAt`); khi mốc đó null thì lấy `openedAt`. Không tính bài đang chờ duyệt, bước đã xong, đội đã về đích, cuộc đua ở lobby / đã kết thúc. `freshAlerts` kêu một lần mỗi chu kỳ. Test có đủ các ca 44 / 46–47 / 89 / 90–92 phút.
- D16 (3) ma trận: có ô cam, tím, ↺, ✗, "Duyệt (đã nhận ảnh)" (không gửi `id`), "Duyệt lại" (N4), cột Bù giờ, `title` có lịch sử câu trả lời. Bảng chỉ dựng lại khi dữ liệu đổi; đồng hồ trong ô được ghi tại chỗ.
- Id gửi đi: hàng chờ dùng `ReviewItem.id`. Ô ma trận dùng `answers.at(-1).id`, đúng với engine A (A thêm câu trả lời vào cuối mảng và tính `pending = answers.at(-1).s === 'pending'`). Test `reviewMessage` cho qua `isClientMessage(…, 'host')`, và đội không gửi được tin này.
- D14 (trang): HEAD mỗi tên một lần, PUT kèm `Authorization`, rồi HEAD lại; nút Xem lấy blob qua GET; cứ 15 s chỉ HEAD lại những tên còn ✗ (bỏ qua khi tab ẩn); token đặt trong header, không đặt trong URL. `checkMediaFile` chặn loại khác jpg / png / webp và hình > 5 MB (bằng đúng 5 MB thì cho qua, giống Worker); có câu tiếng Việt cho mã 400 / 401 / 403 / 411 / 413 / 415.
- D18 sim: có đủ `answersOf` (dùng `answers[0]`, không có thì `referenceAnswers[0]`), `botMove`, `effectiveStatus` (+1 s), Host bot (`reviewsFor`: phạt một lần, gửi lại sau 5 s), `legStats`, `fastPenalties` (6 / 12 s), `legRowBudget` 16×, dòng báo cáo, USAGE. Test giả lập (không cần workerd) kiểm từng thao tác của 3 bot và thứ tự duyệt / phạt, nên sẽ hỏng nếu logic bot sai.
- Lệch kế hoạch mà báo cáo E đã ghi (bot index 1 bị phạt, bot index 2 đổi nhánh; luôn nạp chặng bằng `host.leg {json}`; thêm 2 khóa config; thêm nút "Duyệt lại"): tôi chấp nhận cả bốn, lý do E nêu là hợp lý.

## 4. Lỗi tìm được

| # | Mức | Vấn đề | Bằng chứng | Sửa |
|---|---|---|---|---|
| S1 | nên sửa | `demoState` chép nguyên văn đáp án tham khảo của nhánh B trong `mini` ("(GIẢ) Ảnh thấy rõ chân tháp phía sau") vào bundle Host (`client/dist/assets/host-*.js`, là static asset ai cũng tải được). Hậu quả: `leg:check` của `mini` từ 0 cảnh báo thành 1 cảnh báo, trái với `LEG_FORMAT.md` §10 ("mini không cảnh báo") và với bước "test/mini.json (sạch)" mà người tích hợp phải kiểm ở §8. Đây cũng là mẫu xấu: chép chữ của chặng vào asset | `hostView.ts:492`; `leg:check` in "CẢNH BÁO client/dist/assets/host-BmDU6xj4.js: chứa chữ …"; ở `main`: "Hợp lệ: 0 cảnh báo". Test của D chạy `mini` với `scanDirs: []` nên không bắt được | Đổi chuỗi demo sang chữ không có trong chặng nào (vd. "(GIẢ) Ảnh có cả đội và chân tháp"), sửa `hostView.test.ts:175` theo |
| M1 | nhỏ | Một đội khác gửi bài làm hàng chờ dựng lại: ô ghi chú đang gõ bị thay bằng phần tử mới nên **mất focus và con trỏ** (chữ đã gõ vẫn giữ qua `noteDrafts`). Host gõ tiếp thì phím không vào đâu cho tới khi bấm lại vào ô | `main.ts` `drawQueue` → `queueBox.replaceChildren(...)` mỗi khi `queueSig` đổi | Trước khi dựng lại, nhớ khóa của ô đang focus và `selectionStart/End`, rồi focus lại ô mới cùng khóa |
| M2 | nhỏ | Bấm Duyệt / Phạt khi socket đang rớt: trang báo "Đang mất kết nối" nhưng `noteDrafts.delete(key)` **vẫn chạy**. Nếu hàng chờ dựng lại trước khi Host bấm lại, ô ghi chú được điền lại từ `r.note` của server và bản nháp mất | `main.ts` `btn` onclick: gọi `fire(...)` xong là xóa nháp, không xét kết quả gửi | `fire` trả về `boolean`; chỉ xóa nháp khi đã gửi được |
| M3 | nhỏ | Khóa cảnh báo kẹt là `team|step`, không có nhánh / mốc. Đội kẹt ở nhánh A (đã kêu chu kỳ 1), đổi nhánh, mở hòm B rồi lại kẹt 45 phút: banner vẫn hiện dòng đỏ nhưng **không có âm báo / Notification** cho tới chu kỳ 2 (90 phút tính từ khi mở hòm B), vì `alerted` còn giữ số 1 | `hostView.ts` `freshAlerts` (`a.period > alerted.get(key)`), `key = ${t.id}|${s.id}` | Thêm mốc vào khóa: `${team}|${step}|${from}` (hoặc nhánh + `branchOpenedAt`) |
| M4 | nhỏ | Đăng nhập lại vào **mã cuộc đua khác** ngay trên trang đang mở (sau khi phiên hết hạn): `mediaStat` còn trạng thái của cuộc đua cũ nên hiện "✓ đã có" cho hình chưa tải lên cuộc đua mới, và đội sẽ nhận 404. `seenQueue` / `alerted` cũng không được xóa. Ngoài ra, một lần HEAD bị `error` (mạng hỏng, 5xx) thì không bao giờ thử lại, vì vòng 15 s chỉ thử lại tên `missing` | `main.ts`: các Map ở cấp module; `go()` đổi `race` nhưng không xóa Map nào | Xóa các Map khi `race` đổi; vòng thử lại xét cả `error` |
| M5 | nhỏ | Sim không lùi lại khi nhận `answerWrong`. Với chặng `auto` + `kind: free` (chỉ là cảnh báo của `checkLeg`), bot gửi `''`, bị chấm sai, rồi gửi lại `answer` mỗi 0,2–1,7 s cho tới khi server đóng socket 4429 (mỗi câu sai ghi 1 dòng). Lỗi báo ra là "server đã đóng socket", không phải "đáp án sai" | `sim.ts` `playLeg`: `answerWrong` không có trong `REFUSALS` và không được đếm | Đếm `answerWrong` theo bước; sau 3 lần thì dừng với lỗi "đáp án trong file sai / thiếu ở bước X" |
| M6 | nhỏ | Bot đổi nhánh tạo lại `role` (`switched: false`) ở mỗi bước, nên với chặng có nhiều Lựa chọn kép nó đổi nhánh **ở mọi** Lựa chọn kép. Tài liệu / USAGE / báo cáo lại ghi "đổi nhánh một lần" | `sim.ts` `const role: BotRole = { …, switched: false }` nằm trong vòng `for` các bước | Đưa `role` ra ngoài vòng lặp, hoặc sửa chữ thành "một lần mỗi Lựa chọn kép" |
| M7 | nhỏ | Test tích hợp tự bỏ qua dựa trên việc còn chuỗi `TODO(phase8 track A` trong `engine.ts` / `steps.ts`. Nếu sau này một chú thích như vậy còn sót, test sẽ im lặng bị bỏ qua mãi | `sim.test.ts` `engineReady` | Người tích hợp: sau khi ghép A, xóa `skipIf` (A hiện đã xóa hết dấu đó; tôi đã chạy và test qua) |
| M8 | rất nhỏ | Báo cáo E ghi "`hostView.test.ts` 44 (từ 22)". Số thật là 40 (nền 18); 44 là cả thư mục `host` | `grep -c "it("` | Sửa chữ trong báo cáo |

## 5. Các hướng đã thử phá nhưng không phá được

- **Duyệt / Phạt gửi sai id**: không phá được. Id lấy từ hàng chờ / câu trả lời cuối, đúng thứ tự engine A thêm vào. Mỗi nhóm nút tắt 1,5 s sau khi bấm; server idempotent.
- **Âm báo lặp**: không phá được. Bài mới được so theo khóa `team|step|id`, lần nhận state đầu tiên không kêu, nối lại thì chỉ kêu cho mục thật sự mới. Cảnh báo kẹt kêu đúng một lần mỗi chu kỳ (trừ ca M3 bị im, ngược với lặp).
- **Tải hình sai loại / > 5 MB**: bị chặn trên trang trước khi PUT; `fetch(File)` luôn gửi `Content-Length` nên không rơi vào 411.
- **Sim vượt ngân sách dòng ghi**: không phá được. 68 dòng / đội so với ngân sách 160 (có 1 lần phạt, 1 lần đổi nhánh, 7 câu trả lời), không thao tác nào bị từ chối.
