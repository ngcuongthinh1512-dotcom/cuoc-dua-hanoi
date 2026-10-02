# Phase 8 – Tích hợp (ghép năm track)

Trạng thái: **xong, chờ review** (2026-10-02). Không có commit `feat(phase8)` cuối (còn review). Nhánh `main`, gốc `9164b5f`. Kế hoạch `docs/plans/phase8.md` §8. Không đọc chặng thật; chỉ chặng test (GIẢ).

## 1. Thứ tự merge (`git merge --no-ff`, A → B → C → E → D)

| Track | Commit merge | Xung đột | Cách giải | Test gói bị chạm sau merge |
|---|---|---|---|---|
| A máy chủ (`badcf35`) | `merge(phase8): track A máy chủ` | không | – | worker tsc 0; vitest 13 file / **122 qua** (58 s) |
| B ghép client (`4622a3a`) | `merge(phase8): track B ghép client` | không | – | client tsc 0; vitest **640 qua** |
| C thẻ HUD (`846aa4a`) | `62d086e merge(phase8): track C thẻ thử thách trên HUD` | `client/src/main.ts`: dòng `task: () => {}` (B giữ tạm, C xóa) | xóa dòng (đúng ý cả B và C: `RaceHudActions.task` đã bỏ). `config.ts` / `screenshot.ts` tự ghép (khối riêng) | client tsc 0; vitest **670 qua**; scripts tsc 0 |
| E Host + sim (`981f02e`) | `e53c079 merge(phase8): track E trang Host và bot sim` | `scripts/screenshot.ts` (dòng lọc lượt mặc định, B/C và E cùng sửa chú thích), `scripts/sim.test.ts` (điều kiện `engineReady` của A và của E) | screenshot: lấy dòng của E (regex giống nhau, chỉ khác chú thích). sim.test: **bỏ cả hai** điều kiện `engineReady` và `it.skipIf(...)` → test "3 bots finish the whole leg" luôn chạy (việc tích hợp 2b) | client vitest **692 qua**; `vitest --dir scripts sim.test` **19 qua, 0 bỏ qua** (gồm test tích hợp 3 bot trên engine thật của A) |
| D leg:check + tài liệu (`eb67c0a`) | `merge(phase8): track D leg:check và tài liệu` | không | – | shared tsc 0, vitest **59 qua**; `leg-check.test` **33 qua**; `worker/src/legs.test.ts` **9 qua** |

Ghi chú: `npx vitest run scripts/sim.test.ts` (không `--dir scripts`) còn quét cả `.claude/worktrees/*` nên thấy "2 skipped" của bản trong worktree cũ; `npm test` dùng `--dir scripts` nên không dính.

## 2. Việc tích hợp bắt buộc (commit `fix(phase8): ghép …`)

- (a) Gỡ op `task`: `shared/src/protocol/types.ts` (biến thể `RaceOp` `op:'task'`), `codec.ts` (`case 'task'`), `worker/src/race/engine.ts` (`if (m.op === 'task') return;` + chú thích ponytail). `codec.test.ts`: hai mẫu `task` trong danh sách hợp lệ đổi thành `open{branch}` / `answer`; thêm kỳ vọng `op:'task'` → **false** (op v2 đã bỏ).
- (b) `scripts/sim.test.ts`: bỏ `engineReady` + `skipIf` (đã làm trong merge E) → 0 bỏ qua.
- (c) Preset `p7-box-opened`: `boxView` nhận `boolean` → chuỗi `L2,-18,-10.9,opened,180` (trước: `L2,-18,-10.9,,opened,180` → `parseBoxes` đọc thành hòm đóng không có hướng). Hòm không có trường thứ 5 = `yawDeg 0` (mặt trước hướng bắc; `boxRotation(undefined)` = bắc, server `Zone.yaw` mặc định 0). Các preset `p7-box-*` / `p7-openbox` / `p8-box-branch` vẫn truyền `180` có chủ ý để camera (đặt phía nam hòm) nhìn mặt trước như ảnh Phase 7; `p6-boxes` không truyền → hướng bắc.
- (d) Một hằng: giữ `raceClient.lockEndSlackMs` (1000 ms), bỏ `raceHud.lockFlipSlackMs`; `race/ui/format.ts` `liveStatus` và `card.test.ts` đọc `raceClient.lockEndSlackMs` (thẻ đổi trạng thái cùng lúc với lần gửi lại vị trí).
- (e) Grep không còn: `op: 'task'`, `op === 'task'`, `verifyTask`, `branchLocked`, `FOUNDATION STUB`, `TODO(phase8`, `lockPoseResend`, `lockFlipSlackMs`, `Hoàn thành (tạm)` (mã + `docs/RACE_RULES.md` / `LEG_FORMAT.md` / README). Còn `.task(` = không.
- (f) `package.json` `engines.node >=22.13` (D, đã có sau merge; `package-lock.json` cùng); README "Node.js ≥ 22.13".
- (g) Tài liệu:
  - `TODO.md`: xóa dòng Phase 7 "Nhiệm vụ tạm Hoàn thành (tạm)…" (giữ phần Phase 9 / 10), dòng "Phase 8 – Lựa chọn kép…" (kèm tham chiếu danh sách khoảng trống `phase8-schema-gaps.md`), phần "thêm hướng khi file chặng có yaw" của dòng hòm Phase 7; thêm mục **Phase 8** (đã xong; chờ anh quyết: hình chìm theo đội, tự chấm bật đầy đủ sau; mặc định §12 chờ xác nhận; hoãn: mini-game §11, `timeLimitMinutes`, mã bài nộp không số ngẫu nhiên; Phase 9 / 10: bỏ cuộc, Hoàn tác 10 s, khóa bài nhiều Host, `decided_by`, nhật ký, sao chép hình giữa cuộc đua; ponytail; kiểm tay chưa làm; lỗi còn mở trong `phase8-verify-*.md`).
  - `CLAUDE.md`: `race/ui` thẻ thử thách + Enter + chuột tự do; `host/` hàng chờ / cảnh báo kẹt / ma trận có nút / Hình R2 / `host.review`; `worker/src/index.ts` route media; `scripts/hud-check.ts` (giữ: kiểm HUD trong Chrome thật); preset `p6-*` / `p7-*` / `p8-*`; `?boxes=step[|branch],x,z[,opened][,yawDeg]`, `?card` / `?book` / `?lock`; `leg:check` luật mới; `sim` Host bot.
  - README: bước 5 tải hình R2, mục "Host duyệt bài trong lúc đua", Node 22.13, preset nhóm `p6` / `p7` / `p8`, tham số `boxes` có nhánh / hướng, phím `Enter`, bảng tiến độ Phase 8 "Đang review".
  - `docs/reports/HANDOFF.md`: Phase 8 "đã ghép, đang review"; **sửa dòng 15** (Phase 8 đã đổi schema chặng, SQLite v3 với 4 cột mới, giao thức v3).
  - Kiểm tài liệu Track D với hành vi thật (plan §8): `LEG_FORMAT.md` §13 sửa hai câu về sim (bot đổi nhánh là bot thứ ba, chỉ 2 bot thì bot thứ hai; chỉ `penalties` bị rút còn 6 / 12 s, `task.retryLockMinutes` riêng giữ nguyên – verify-d N7); `RACE_RULES.md` §8 sửa hai câu về Sổ (mục Sổ chỉ "Đang làm / Đã xong"; Sổ có mã bài nộp + Copy nhưng nút Facebook / "Tôi đã gửi bài" chỉ trên thẻ – verify-d N10). Grep "cờ vàng", "Hoàn thành (tạm)", "cả 2 nhánh": không còn; "lý do": hai chỗ đúng nghĩa (ghi chú Host không gửi; phạt trực tiếp của Host); "Phase 10": một chỗ đúng nghĩa (trình soạn bản đồ); "mã bài nộp": chỉ dạng `<tên đội>-<bước>[-<nhánh>]`.

## 3. Kết quả lệnh (sau các sửa ở §2, từ gốc repo; mỗi lệnh chạy một lần, không lệnh nào phải chạy lại)

| Lệnh | Kết quả |
|---|---|
| `npm run build` | exit 0; tsc mọi gói + Vite + `wrangler deploy --dry-run` (binding `RACE_ROOM`, `MEDIA` R2, `ASSETS`); không cảnh báo / lỗi |
| `npm test` | exit 0: scripts 5 file / **70**, shared **59**, client 65 file / **692**, worker 13 file / **122**; **0 bỏ qua, 0 lỗi** (943 test) |
| `grep -rl ZodError client/dist` | **0** file |
| `npm run leg:check -- worker/legs/paris-demo.json` | "Hợp lệ: 1 cảnh báo, 18 ô còn trống" – 18 ô trống + cảnh báo L6 cũ (đường đi bộ cách tâm 39 m, có từ Phase 7, track D cũng ghi) → đạt "chỉ ô trống" |
| `npm run leg:check -- worker/legs/test/mini.json` | "Hợp lệ: 1 cảnh báo, 0 ô còn trống" – **chưa sạch**: cảnh báo duy nhất là quét static `client/dist/assets/host-*.js` chứa đáp án tham khảo nhánh B của `mini` ("(GIẢ) Ảnh thấy rõ chân tháp phía sau"), chép vào `demoState` của trang Host (`client/src/host/hostView.ts`). Đúng lỗi **verify-e S1 (nên sửa)**; theo chỉ dẫn không sửa ở lượt ghép (sửa: đổi chuỗi demo sang chữ không có trong chặng nào + `hostView.test.ts` theo) |
| `SCREENSHOT_PORT=5201 npm run screenshot -- p8 p7 p6-boxes p5-hud` | exit 0, **40 ảnh**, không lỗi console. Đã xem: `p7-box-close` / `p7-box-opened` (hòm đóng / mở nắp, mặt trước về camera – đã sửa), `p8-box-branch` (D1\|A mở, D1\|B đóng), `p8-card-answer-locked` (đếm ngược giữa màn hình + dòng trạng thái thẻ rút gọn), `p8-card-branch-task` (ô gõ, lịch sử "Bị phạt 3 phút", "Đổi lựa chọn kép"), `p8-host` (hàng chờ 2 mục + đáp án tham khảo, banner kẹt, Hình R2 ✓ / ✗, ma trận ô cam / tím / "Duyệt (đã nhận ảnh)"), `p6-boxes` (hòm không `yawDeg` = mặt trước hướng bắc, camera phía nam thấy mặt sau: đúng kế hoạch §7), `p8-media-offline` (xem dưới) |
| `SCREENSHOT_PORT=5201 npm run ride-check` | exit 0 "OK": đi bộ 4,000 m/s, xe 5,200 m/s, tỉ lệ 1,300, nghiêng 15,6°, ngã / đứng dậy / xe vẫn của đội / lên lại – không đổi so với trước |
| `npm run sim -- --leg mini --help` | in hướng dẫn mới (Host bot, phạt rút 6 / 12 s) |
| `npm run sim -- --leg mini --bots 3 --speedup 2` | exit 0: **3 / 3 đội về đích**, xếp hạng 3 dòng, **67,3 dòng / đội** (≤ 160); 7 câu trả lời, Host duyệt 5, phạt 1, đổi nhánh 1; ≈ 31 640 request cho 20 đội × 2 giờ (< 40 000) |
| `HUD_CHECK_PORT=5202 npx tsx scripts/hud-check.ts` | exit 0, 43 / 43 điều kiện, không lỗi console (giữ script, đã ghi `CLAUDE.md`) |
| `pgrep wrangler / workerd / vite / headless` | trước và sau: không còn tiến trình nào |

## 4. Việc để lại (cho review / lượt sửa)

- **verify-e S1** (trên): `leg:check mini` còn 1 cảnh báo vì `demoState` chép đáp án tham khảo của `mini` vào bundle Host.
- **`p8-media-offline` không cho thấy ô "Hình chỉ tải được trong cuộc đua"**: sau khi ghép C, `RaceHud.demo` thay `resolveMedia` bằng ảnh `data:` giả cho mọi tên trừ `demo-off.jpg`, mà thẻ `?card=media` không dùng tên đó → ảnh giống hệt `p8-card-media`. Đường thật (ngoại tuyến, `resolveMedia` → null) đã có kiểm trong `scripts/hud-check.ts` ("one offline placeholder"). Sửa rẻ: cho `DEMO_CARDS.media` một mục `r2:demo-off.jpg`, hoặc bỏ preset.
- Các mục "nên sửa" còn mở theo chỉ dẫn (không sửa ở lượt ghép): verify-a (2), verify-b 4.2–4.5 (Tab khi focus nút, thẻ đè bản đồ / menu, Firefox Esc + `#help`, blur khi đóng), verify-c S1 / S2 (chuột tự do: bấm nền mờ / ô thẻ), verify-d (quét lộ qua tên hình / link; câu luật "Đổi lựa chọn kép"), verify-e S1 + M1–M8.
- Chưa làm (kế hoạch §8, không có trong danh sách lệnh của lượt ghép): thử tay `dev:api` + `dev` + 2 trình duyệt + Host (gõ từ xa → Phạt → đếm ngược → Duyệt; đổi nhánh; tải 1 hình; F5 giữa khóa / chờ duyệt; tắt / bật `wrangler dev`), Firefox, gõ Telex / Unikey, nút Copy. Đã ghi `TODO.md` mục Phase 8. Phần máy chủ của các luồng này có harness workerd của A (`RaceRoom.phase8.test.ts`) và sim 3 bot trên engine thật.
