# Phase 8 – Sửa lỗi review, nhóm F1 (máy chủ)

Ngày 2026-10-02, HEAD `2df2fec`. Phạm vi: `worker/src/**`. Trạng thái: **XONG**, chưa commit (người điều phối commit).

## Đã sửa

| # | Mục review | Sửa (file) | Test bắt lỗi cũ |
|---|---|---|---|
| 1 | speccode R-4: đổi nhánh lúc `switchLocked` được nhận (3 dòng / lần, ≈ 90 dòng / phút với client sửa) | `steps.ts`: sau `branchPending`, `branchOpenedAt === null && lockedUntil > now` → im lặng (0 dòng, không notice). Giữ M1: đã mở hòm nhánh thì khóa "Phạt" vẫn cho đổi | `steps.test.ts` (A → B → A: trong khóa = im lặng, hết khóa = đổi); harness `p8-detour`: gửi `branch A` trong khóa → không `race` / `notice` / `box`, SQLite vẫn `branch B, branch_switches 1`, rồi chờ hết khóa đầu mới A |
| 2 | speccode R-7: F lặp ở hòm khi lobby / paused / `boxFar` → đóng socket 4429 | `RaceRoom.ts`: `open` không còn đếm vào `NET.maxRaceOps` (chỉ `answer` / `accept` / `branch`). `open` bị từ chối không ghi dòng; mở thành công ghi một lần mỗi hòm, hòm nhánh chỉ mở lại sau một lần `branch` (có đếm) | harness mới `R-7`: 25 F lúc lobby + 25 F ngoài tầm lúc chạy + 20 F lúc tạm dừng (70 / phút) → không đóng, đúng 70 notice, 0 dòng `events` / `step_progress` mới; sau đó mở L1 được. Test D20 sửa kỳ vọng 29 → 30 câu sai được ghi (open L1 không còn ăn một suất) |
| 3 | speccode R-9: hình cache 24 giờ, Host tải lại cùng tên đội vẫn thấy bản cũ | `index.ts`: `Cache-Control: private, no-cache` + `ETag`; `MEDIA.get(key, { onlyIf: request.headers })` → 304 khi `If-None-Match` khớp (vẫn hỏi DO trước: cổng quyền chạy trước 304) | harness `media`: header `private, no-cache`; `If-None-Match` = ETag → 304 rỗng; Host PUT lại cùng tên → 200 bytes mới; token sai + ETag → 401 |
| 4 | speccode R-11: `%E0` trong đường dẫn → `URIError` 500 | `index.ts`: không `decodeURIComponent` nữa, kiểm `RACE_ID` / `MEDIA.name` trên đoạn thô (id / tên hợp lệ không có ký tự nào bị `encodeURIComponent` đổi). Sửa cả route `/ws` | harness `media`: `/media/%E0.jpg`, `/race/%E0/media/…`, `/race/%E0/ws` → 400 |
| 5 | speccode R-8 (verify-a 4.1) + verify-a 4.4 | `engine.ts`: `apply` gọi `refreshZones` cả khi có `arrive` (đến nơi mình đang đứng: `moveZone` không thấy di chuyển) hoặc `switch`; luật ponytail trong `refreshZones` thêm: nơi đội vẫn đứng mà không còn là "điểm của đội" (vừa đổi nhánh) → gửi `zone []` (nơi đội đã biết, không lộ gì) | `engine.test.ts` mới: t0 chọn A, đứng ở nơi B (t1 ở đó) → không `zone`; t1 thấy t0; đổi sang B trong nơi B → vẫn không trong khóa; hết khóa → có `zone` [t1]. Cảnh 2: t0 + t1 ở A, t0 đổi sang B → t0 nhận `zone []`, t1 thấy t0 nhánh B. Đột biến `eligible` dùng cả hai nhánh → đỏ |
| 6 | speccode R-11: Host thứ hai Duyệt câu Host đầu vừa Phạt (đường N4) không cảnh báo | `engine.ts`: sau khi ghi, nếu `approve` rơi vào câu đang `penalized` → `host.notice` `warning` cho Host vừa bấm: "Lưu ý: bài này vừa bị Phạt, nay đã được Duyệt (khóa phạt đã gỡ, đội nhận mật thư kế). Nếu không định sửa quyết định Phạt, hãy trao đổi với Host còn lại." Không đổi giao thức, không bump version | `engine.test.ts`: đường N4 → đúng một notice cảnh báo; duyệt thường → không notice (cả harness `p8-answer`: notice đầu tiên vẫn là "Bài này đã được xử lý.") |

Kiểm đột biến (hoàn tác từng sửa, chạy test liên quan, khôi phục): cả 6 mục đều làm test đỏ (1: `steps.test`; 2, 3 (header và 304 riêng), 4: harness; 5: ba đột biến – không refresh khi switch / arrive, luật `[]` cũ, `eligible` hai nhánh; 6: `engine.test`).

Đã chạy: `cd worker && npx vitest run` → 13 file / 124 test qua; `npx tsc -p worker --noEmit` sạch; `npx vitest run scripts/sim.test.ts` (đọc lại, không sửa) → qua. Không còn `workerd` / `wrangler` / `vite` chạy.

## Cần người điều phối (file ngoài nhóm F1)

- **`docs/RACE_RULES.md:145`** ("đây là điều kiện duy nhất") và **`docs/LEG_FORMAT.md:114`** ("**chỉ** lúc đang chờ Host duyệt thì không đổi được"): sửa câu thành "Không đổi được khi đang chờ Host duyệt, và trong lúc đang đếm ngược đổi nhánh (lần đổi trước)". Giao diện đã ẩn nút "Đổi" ở `switchLocked` (`format.ts:279`), nay máy chủ khớp.
- **`shared/src/protocol/constants.ts:42-44`**: chú thích `NET.maxRaceOps` còn ghi `open` → "answer / accept / branch (không checkin / book / open)". **`MEDIA.cacheSeconds`** (dòng 93-94) nay không còn dùng → xóa (và câu trong `docs/plans/phase8.md` D12 nếu muốn).
- R-9 phía client: `client/src/net/session.ts:41` giữ blob cả phiên → đội đang mở trang vẫn thấy hình cũ tới khi tải lại trang (F5); sau F5 trình duyệt hỏi lại (304 / bản mới). Nếu cần, một câu trên trang Host: "Tải lại hình cùng tên: đội đã xem cần tải lại trang (F5) để thấy hình mới."

## Ghi nhận, không sửa (ngoài danh sách)

- Đội đi vào nơi nhánh mới **trong lúc** đếm ngược đổi nhánh vẫn được ghi `arrived_at` (+ cất xe nếu nhánh có nơi riêng, + danh sách "Tại điểm này"): `placesOf` không xét khóa. Có từ trước (C1 chỉ chặn nhánh không chọn); hòm vẫn chỉ hiện sau khóa. Nếu muốn chặt: `arrive` bỏ qua khi `branchOpenedAt === null && lockedUntil > now` (lần pose đầu sau khóa sẽ ghi đến nơi, nay đã có refresh khi `arrive`).
