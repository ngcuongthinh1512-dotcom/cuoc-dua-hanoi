# Phase 8 – Cổng cuối + verifier bản sửa (F1 / F2 / F3 / gỡ nút liên hệ)

Ngày 2026-10-03. HEAD `1bca275` + thay đổi chưa commit. KHÔNG commit. Kết luận: **ĐẠT** – không có lỗi chặn; một sửa nhỏ trực tiếp (bên dưới).

## 1. Đối chiếu mục review ↔ bản sửa (đọc mã + thử phá)

| Mục | Sửa | Kiểm |
|---|---|---|
| speccode R-1 (Tab / Space sau khi bấm nút) | `RaceHud` Tab đóng ở mọi chỗ + `blur()` nút sau click | hud-check (đột biến F2 17/17 đỏ); đọc mã: đúng |
| R-2 (thẻ đóng trên bản đồ / menu) | `relock()` khi `!modal()` | hud-check |
| R-3 (Firefox Esc) | `help.hidden = input.locked \|\| modal()` | hud-check giả lập từ chối khóa |
| R-4 (đổi nhánh trong đếm ngược) | `steps.ts` → `silent` khi `branchOpenedAt === null && lockedUntil > now` | steps.test + harness; **e2e thật: im lặng, SQLite giữ B / 1 lần đổi** |
| R-5 (`leg:check` quét URL / `r2:`) | `urlText` | leg.test (đỏ khi bỏ) |
| R-6 (demo Host chép đáp án mini) | chuỗi "(MẪU) …" | leg-check.test quét bundle |
| R-7 (F lặp → 4429) | `open` không còn đếm `maxRaceOps` | harness R-7; **e2e thật: 40 F lúc lobby → 40 `raceNotOpen`, socket mở**. Lạm dụng: mở bị từ chối không ghi dòng, mở được ghi 1 lần / hòm → không phá ngân sách |
| R-8 (test C1 `eligible`) | engine.test + refresh khi arrive / switch | đột biến F1 đỏ |
| R-9 (hình cache 24 h) | `private, no-cache` + ETag + `onlyIf` → 304 | **e2e thật: If-None-Match → 304; Host PUT lại cùng tên → 200 bytes mới (9196 → 12283 B); token rác + ETag → 401** |
| R-10 (thẻ tự bật cướp focus) | `focusBox` | hud-check |
| R-11 (`%E0` 500; N4 không cảnh báo) | không decode; `OVERRULED` notice | harness / engine.test; **e2e: `%E0.jpg` → 400** |
| visual #0 nút Messenger trong Sổ | **không còn là lỗi (SPEC §17.17)**, đã gỡ hẳn | grep, card.test, steps.test, leg.test; p8-card-proof / p8-book-media không có nút |
| visual #1 preset media-offline | thẻ `media-off` | đã xem `p8-media-offline.png`: "Hình chỉ tải được trong cuộc đua", không ảnh hỏng |
| visual #2 Host ghi mã nhánh | `HostState…branches[].title` + `branchTag` (hàng chờ, cảnh báo kẹt, thông báo, tooltip) | engine.test, hostView.test; **sửa thêm ở cổng: ô ma trận** (xem 3) |
| visual #3 "Duyệt lại" | "Duyệt câu vừa phạt" | hostView.test |
| visual #4 dòng goToBranch mờ | `rc-timer info` | xem `p8-card-detour-chosen.png` |
| visual #5 "hộp" / "hòm" | một từ "hòm mật thư" (cả `index.html`, Host) | Toasts.test, xem `p6-boxes.png` |
| visual #6 đồng hồ nhỏ / lặp | `rc-num` to, ẩn chip khi thẻ mở | xem `p8-card-answer-locked.png` |
| visual #7 đế hòm trên đá lát | **bỏ, có lý do**: có từ Phase 7, nhỏ | – |
| visual #8 ma trận 1024 px cuộn ngang | **bỏ, có lý do**: hàng chờ sticky bù; Host dùng màn hình lớn | – |
| visual #9 khoảng trống / cột tệp | `#err:empty`, `.media-grid` | xem `p8-host.png` |
| visual #10 thiếu preset toast | **bỏ**: chỉ độ phủ, không phải lỗi người chơi thấy | – |
| e2e #0 F ở hòm nhánh không phản hồi | `setView` bật thẻ đầy khi `branchOpened` false → true | **e2e thật: F ở hòm A → thẻ đầy mở, có "(GIẢ) 3 + 4 = ?"** |
| e2e #1 hình 404 hỏi lại mỗi lần vẽ | `failed` + câu "Hình chưa có – báo Host" | hud-check |
| e2e #2 console Host 404 HEAD | **bỏ, có lý do**: không ảnh hưởng chức năng, không preset nào fail | – |

Ghi nhận còn mở từ F1 (không phải lỗi người chơi thấy): đội vào nơi nhánh mới trong lúc đếm ngược vẫn được ghi `arrived_at` (hòm vẫn chỉ hiện sau khóa).

## 2. Sửa trực tiếp ở cổng

- `client/src/host/hostView.ts` `progressTable`: ô ma trận Lựa chọn kép còn in mã trơn "(B)" / "(A ↺1)" (F3 đã chỉ ra dòng này nhưng không đổi). Nay "chờ duyệt 01:12 · Ảnh (B)", "⏳ 00:15 · Ảnh (B) ↺1", "08:00 · Tính (A) ↺1" (dùng `branchTag`). `hostView.test.ts` cập nhật 6 kỳ vọng (hoàn tác sửa → 6 test đỏ). Chụp lại `p8-host`, đã xem; e2e thật thấy "⏳ 00:15 · Ảnh (B) ↺1" và "chờ duyệt 00:05 · Ảnh (B) ↺1".

## 3. Lệnh đã chạy

| Lệnh | Kết quả |
|---|---|
| `npm run build` | thoát 0 (typecheck + client + `wrangler deploy --dry-run`) |
| `npm test` (sau sửa cổng, chạy lại) | 72 + 61 + 692 + 125 = **950 test qua**, 0 skip, 0 fail |
| `grep -rl ZodError client/dist` | 0 |
| `leg:check worker/legs/test/mini.json` | Hợp lệ: 0 cảnh báo, 0 ô còn trống |
| `leg:check worker/legs/paris-demo.json` | 1 cảnh báo cũ (L6, đường đi bộ 39 m > 20 m), 17 ô còn trống |
| `SCREENSHOT_PORT=5231 npm run ride-check` | OK (đi 4,0 / xe 5,2 m/s, ngã + lên lại, 11 lệnh vẽ) |
| `HUD_CHECK_PORT=5232 npx tsx scripts/hud-check.ts` | thoát 0, 76 ok, 0 lỗi console |
| `npm run sim -- --leg mini --bots 3 --speedup 2` | 3 / 3 về đích, 67,3 dòng / đội (≤ 160), 7 câu trả lời, duyệt 5, phạt 1, đổi nhánh 1 |
| `npm run screenshot` (mặc định, gồm p4 / p4b / p5) | 59 PNG, thoát 0, 0 lỗi console |
| `… -- p3` / `p6` / `p7` / `p8` | 20 / 8 / 21 / 17 PNG, thoát 0, 0 lỗi console (p4, p4b không chạy lần hai: đã có trong lượt mặc định) |
| `… -- p8-host` (sau sửa) | thoát 0 |

Đã xem: `p8-card-proof` (không nút Messenger; hướng dẫn + mã + Copy + "Tôi đã gửi bài"), `p8-host`, `p8-card-answer-locked`, `p8-media-offline`, `p8-card-detour-chosen`, `p6-boxes`, `p7-book`, `p5-hud`. Không hồi quy.

## 4. E2E máy chủ thật

`wrangler dev` :8797 (`--persist-to` scratch), Vite :5433 (proxy), driver Playwright (Chrome hệ thống headless) trong scratch. Chặng tạm (scratch, GIẢ): `mini` bỏ L1 / T1, xuất phát gần tháp, phạt 0,5 phút, còn `hostApproval.contactUrl` cũ → nạp được, không cảnh báo về liên hệ.

1. Đội Đỏ (socket thô) bấm F 40 lần lúc lobby → 40 `notice raceNotOpen`, **không** đóng 4429.
2. Đội Xanh (client game thật, phím thật) mở L2 → thẻ D1 `choose`; phím 1 → nhánh Tính; tới hòm A, F → **thẻ đầy tự mở có đề "(GIẢ) 3 + 4 = ?"**.
3. Nút "Đổi lựa chọn kép" → confirm đúng câu → `switchLocked`, nút Đổi ẩn; gửi thô `branch A` trong khóa → **0 tin `race` / `notice` / `box`**, Host: nhánh B, 1 lần đổi.
4. Trang Host: hàng chờ "Lựa chọn kép · nhánh Ảnh (B)", ô ma trận "⏳ 00:15 · Ảnh (B) ↺1" rồi "chờ duyệt 00:05 · Ảnh (B) ↺1".
5. Hình `e2e-l2.jpg`: `Cache-Control: private, no-cache` + ETag; fetch trình duyệt sau khi Host tải lại cùng tên → bytes mới; If-None-Match → 304; `%E0.jpg` → 400. Lỗi console duy nhất: 3 × 401 do chính bài thử (token sai).
6. Dọn: driver, Chrome, Vite, wrangler, workerd đã tắt (`pgrep` rỗng).

## 5. Mục còn mở (không chặn)

- Blob hình trong trang đội giữ cả phiên: đội đã xem cần F5 để thấy hình Host sửa (đã ghi trên trang Host).
- `arrived_at` được ghi trong lúc đếm ngược đổi nhánh (F1 ghi nhận).
- Console trang Host 404 cho HEAD hình chưa tải (e2e #2).
- visual #7 / #8 / #10 (xem bảng).
