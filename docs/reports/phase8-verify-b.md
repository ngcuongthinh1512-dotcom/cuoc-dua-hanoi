# Phase 8 – Kiểm đối kháng Track B (ghép client)

Ngày 2026-10-02. Đối tượng: nhánh `phase8-track-B`, commit `4622a3a`, worktree `.claude/worktrees/wf_4133df99-060-2`, so với nền `0818033`. Kế hoạch: `docs/plans/phase8.md` §3 (D7, D9, D13, D15/B1), §5.3, §6 Track B. Không sửa mã.

**Kết luận: ĐẠT, kèm 4 việc nên sửa khi ghép (không có lỗi chặn).** D7 / D9 / D13 đúng và có test thật (đổi logic là test hỏng). Phần B1 (chuột theo thẻ) đúng ở đường chính nhưng còn 3 lỗ ở ca biên. Ngoài ra preset `p7-box-opened` bị hỏng. B1 vẫn chưa chạy được trong nhánh này: `RaceHud` của nền chưa gọi `onOpenChange`, nên phải thử tay sau khi ghép C.

## 1. Phạm vi file (git diff --stat 0818033..HEAD)

11 file: `audio/sfx.ts`, `config.ts` (chỉ khối `raceClient`), `main.ts`, `net/ClueBoxes(.test).ts`, `net/session(.test).ts`, `race/RaceClient(.test).ts`, `scripts/screenshot.ts` và báo cáo. Tất cả đều nằm trong danh sách sở hữu của B. Có một chỗ lấn sang: B sửa preset Phase 7 (`boxView` → `p7-box-close/opened`, `p7-openbox`). §7 đã chấp nhận việc hòm `p7-*` đổi góc, và chính lần sửa này làm hỏng một preset (mục 4.1). Không đụng tới `shared/*`, worker, `RaceHud` hay `TODO.md`.

## 2. Chạy thật

- `client`: `npm test -w client` → 64 file, **640 test qua**. Riêng 3 file của B (`ClueBoxes`, `session`, `RaceClient`): 28 test qua.
- `npm run build` (gốc worktree, chạy một lần): **exit 0**. tsc + vite + `wrangler deploy --dry-run` sạch, worktree vẫn sạch sau khi build.

## 3. Đối chiếu Việc / Test bắt buộc

| Mục | Kết quả |
|---|---|
| B1 `onOpenChange` → nhả / khóa chuột, miễn Menu khi `raceHud.open`, Enter → `openCurrent()`, tên đội | Có trong `main.ts:420-447, 507`. **Mã chết trong nhánh B** (`RaceHud` nền chưa gọi callback). B đã thử Chrome bằng một bản vá tạm, không commit. Lỗ ở ca biên: mục 4.2–4.4 |
| D7 khóa `step\|branch`, `remove` gỡ cả hòm đã mở, `hide` như cũ, `boxRotation`, `parseBoxes` yaw / nhánh | Đủ. Test mạnh: `remove` bỏ qua nhánh hoặc giữ hòm mở thì hỏng; `-yaw` thì π/2 ra đông và hỏng |
| `boxInReach` kèm `branch` → `open {step, branch}` có vị trí trước | Đủ, có test |
| D9 gửi lại vị trí đúng một lần sau `lockedUntil + lockEndSlackMs` | Đủ. `flushPose` reset cổng nên luôn gửi. Test hỏng nếu bỏ khóa `lockDone` (20 lần) hoặc bỏ slack. Lúc mất mạng thì vị trí rơi, nhưng `welcome.boxes` (A, M3) bù lại |
| D13 `fetchMedia`: header `Authorization`, blob URL, cache theo tên, offline → null | Đủ (đặt ở `session.ts`, lệch kế hoạch có ghi lại và hợp lý). Token không có trong URL, không có log. Tên được lọc bằng `MEDIA.name` trước khi fetch |
| Móc D15 (`answer` / `branch` / `accept` không gửi vị trí trước), `sfx` duyệt / phạt, vùng cấm NPC theo `onChange` | Đủ (vùng NPC có test cảnh) |
| Preset `p8-box-yaw`, `p8-box-branch`, `p8-media-offline` | Có. Đã xem PNG của 2 preset đầu: đúng. `p8-media-offline` chỉ có nghĩa sau khi ghép C |
| Thử tay Chrome + Firefox, link / hình / confirm, luồng mạng 2 trình duyệt + Host | **Chưa làm phần lớn**: chưa có Firefox, UI của C và máy chủ A. B ghi rõ trong báo cáo, việc này dồn sang người tích hợp |

## 4. Phát hiện

**4.1 (nên sửa, CHẮC CHẮN) Preset `p7-box-opened` hỏng.** `screenshot.ts:255-256` gọi `boxView(',opened')`, nên chuỗi `boxes` thành `L2,-18,-10.9,,opened,180`. Tôi chạy `parseBoxes` trên chuỗi này: ra `{opened: false}` và **không có yaw**, nghĩa là hòm đóng, mặt trước quay bắc, tức là quay lưng về camera. Báo cáo B nói "p7 vẫn như Phase 7" nhưng thư mục `screenshots/` không có `p7-box-opened.png`, tức B chưa chụp preset này. Sửa: `boxView('opened')` / `boxView('')` và `…,-10.9,${opened},180`.

**4.2 (nên sửa, chắc chắn theo code) Tab khi đang focus nút / link trên thẻ: chuột bị khóa nhưng thẻ không đóng.** Chrome đặt focus vào `<button>` khi bấm (ví dụ nút Copy, link `target=_blank`, "Về mật thư hiện tại"). Khi chuột đang tự do, `core/Input.ts:139` bỏ qua phím Tab nếu đích là `button, a[href]` (`NATIVE`), nên `wasPressed('clueBook')` là false và vòng khung không gọi `toggleBook`. Trong khi đó `keydown` của `main.ts:446` vẫn gọi `input.lock()` (chỉ loại trừ `HTMLInputElement`). Kết quả: thẻ / Sổ vẫn mở, chuột bị khóa, không bấm được gì. Bấm Tab lần nữa thì thoát được, nên không kẹt hẳn. Sửa: trong `keydown`, đóng luôn Sổ (`raceHud.toggleBook()` rồi `lock()`) và bỏ nhánh Tab trong vòng khung; hoặc dùng cùng điều kiện với `Input` (không khóa khi đích là `button, a[href]`).

**4.3 (nên sửa, có thể xảy ra) Thẻ bật lên đè bản đồ `M` / menu.** Khi Host duyệt từ xa (D8), thẻ mới bật lên trong lúc đội đang mở bản đồ. Esc hoặc nút Đóng gọi `onOpenChange(false)` → `input.lock()`. Đồng thời `cardClosed` chặn phím Esc với bản đồ, nên bản đồ vẫn mở mà chuột lại bị khóa (không kéo / bấm được, phải bấm Esc / M thêm lần nữa). Tab khi thẻ đè bản đồ cũng khóa chuột mà không đóng gì, vì `toggleBook` cần `!fullMap.isOpen`. Với menu: bấm "Tiếp tục" khi thẻ đang mở thì chuột bị khóa trong lúc thẻ còn mở. Sửa: `onOpenChange(false)` chỉ gọi `lock()` khi `!fullMap?.isOpen && !menu.isOpen`. Nhánh Tab trong `keydown` cũng thêm điều kiện đó.

**4.4 (nên sửa, có thể xảy ra, chưa kiểm được) Firefox: Esc đóng thẻ thì không khóa lại được chuột, và gợi ý bị ẩn.** Firefox không coi Esc là thao tác người dùng (`CanTreatAsUserInput`), nên `requestPointerLock` trong handler Esc bị từ chối. Lỗi cùng loại đã được ghi ở Phase 5 (`phase5-review1-spec-code.md` m3, `TODO.md`). Riêng ở đây còn một lỗi nữa: `#help` ("Nhấp chuột để chơi") đã bị ẩn từ lúc thẻ mở (`onPointerLockChange(false)` với `modal()` true) và **không được tính lại** khi thẻ đóng. Vì vậy, nếu khóa thất bại, người chơi thấy chuột tự do mà không có menu, không có gợi ý. Sửa: trong `onOpenChange(false)` thêm `help.hidden = input.locked || modal()`. Người tích hợp thử tay trên Firefox, việc mà kế hoạch đã bắt buộc.

**4.5 (nhỏ, rủi ro khi ghép với C)** Nếu C đóng thẻ trong lúc focus còn ở ô gõ hay ở một nút (thẻ bị ẩn chứ không bị gỡ khỏi DOM), phím game rơi vào phần tử ẩn: `isTextField` làm WASD chết, Space / Enter bấm vào nút ẩn. Nên thêm một dòng `(document.activeElement as HTMLElement | null)?.blur()` trong `onOpenChange(false)`.

## 5. Thử phá theo vai: không ra lỗi

- Hòm nhánh bị gỡ: `remove {D1, A}` gỡ cả hòm đã mở, gỡ khỏi cảnh và khỏi vùng NPC. `hide {D1}` không gỡ hòm đã mở. A→B→A thì vẽ lại hòm A đóng.
- Gửi lại vị trí: đúng một lần cho mỗi giá trị `lockedUntil`, lúc đạp xe cũng gửi. Tab nền (rAF dừng) thì gửi khi quay lại. Sau F5 thì gửi một lần (vô hại).
- Media: không có token trong URL / log / blob. Tên kiểu `../x.png`, `.gif` bị chặn trước khi fetch. 404 thì hỏi lại ở lần vẽ sau (rẻ, chỉ khi Host quên tải hình).
- Offline: `session` null → `resolveMedia` null. `ride-check` / `screenshot` không bấm canvas. Enter khi offline không có thẻ thì không làm gì.

## 6. Cho người tích hợp

Sửa 4.1–4.4 (mỗi mục vài dòng trong `main.ts` / `screenshot.ts`), xóa `task: () => {}` khi ghép C. Sau đó thử tay theo §6 Track B trên Chrome + Firefox, thêm 3 ca: Tab sau khi bấm nút Copy, thẻ bật lên đè bản đồ, "Tiếp tục" khi thẻ đang mở. Chụp lại `p7-box-opened`.
