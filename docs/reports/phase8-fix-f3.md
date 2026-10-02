# Phase 8 – sửa lỗi nhóm F3 (Host + leg:check)

Nguồn: `phase8-review-speccode.md` (R-5, R-6), `phase8-review-visual.md` (#2, #3, #10).

## Đã sửa

| Mục | Việc | File | Test |
|---|---|---|---|
| R-5 (speccode#4) | `leg:check` quét thêm địa chỉ của hình / liên kết (`r2:<tên>` và link), bước và nhiệm vụ, so sau khi đổi `- _ . / :` thành dấu cách | `shared/src/leg/check.ts` (`urlText` trong `textsOf`), `docs/LEG_FORMAT.md` §7.2, §9, bảng thông báo | `shared/src/leg/leg.test.ts` "an answer in a media url ..." (đỏ khi bỏ `urlText`) |
| R-6 (speccode#5) | `demoState` không còn chép đáp án tham khảo của `mini`: chuỗi demo đổi thành "(MẪU) Hình chụp rõ biển tên đường ở góc phố" | `client/src/host/hostView.ts`, `hostView.test.ts:175` | `scripts/leg-check.test.ts` "the Host page demo ... copies no text or answer of a bundled leg" (quét mini / near / paris-demo; đỏ với chuỗi cũ). `npm run build -w client` rồi `npm run leg:check -- worker/legs/test/mini.json` = 0 cảnh báo |
| visual#3 | nút ma trận "Duyệt lại" → "Duyệt câu vừa phạt", tooltip "Nhầm tay bấm Phạt? Duyệt lại câu vừa bị phạt: đội nhận mật thư kế, hết đếm ngược" | `client/src/host/hostView.ts` | `hostView.test.ts` (nhãn + tooltip) |
| visual#10 | bỏ dòng `#err` trống (p có margin 15 px + min-height) giữa banner kẹt và "Chờ duyệt": `#err:empty { display: none }`; hàng "Hình mật thư (R2)" thành lưới 4 cột nên ô chọn tệp thẳng cột | `client/src/host/host.css`, `main.ts` (`media-grid`) | chụp lại `p8-host` (khoảng trống ~65 px → ~12 px; ô chọn tệp cùng cột) |

## KHÔNG làm được: visual#2 (mã nhánh → "tên (id)")

Giả định của yêu cầu sai: `HostState.leg.steps[].branches[].name` KHÔNG phải tên nhánh. Máy chủ lấy nó từ
`pick(branchZone(...))` (`worker/src/race/engine.ts:337`, `pick` ở dòng 578 = `{name: z.name, x, z, r}`),
tức TÊN NƠI của hòm nhánh (hoặc tên nơi của bước trước khi nhánh không có nơi riêng). Dùng nó sẽ in
"Chân tháp Eiffel (B)" thay vì "Lửa (B)": sai nghĩa. Trang Host không có nguồn nào khác chứa tên nhánh
(`queue`, `progress`, `StuckAlert` chỉ có id).

Cần sửa ngoài nhóm F3 (không đụng vì ngoài danh sách file): thêm trường vào `HostState.leg.steps[].branches[]`
và gán ở engine, ví dụ
- `shared/src/protocol/types.ts:429`: `branches?: { id: string; title: string; name: string; ... }[]` (`title` = `Branch.name` của chặng, vd "Lửa")
- `worker/src/race/engine.ts:337`: `title: b.name`

Sau đó phía Host (nhóm F3, việc nhỏ, đã biết chỗ): một hàm `branchTag(leg, stepId, id)` trả "Lửa (A)" (rơi về id khi không tìm thấy),
dùng ở `hostView.ts` (ô ma trận dòng 264 `(${p.branch} ↺n)`, `Nhánh:` dòng 259, `[${a.branch}]` dòng 260, stuck text dòng 368),
`main.ts` (dòng 405 thông báo, 430 hàng chờ) và `demoState` (cho `branches` thêm `title: 'Lửa' / 'Nước'`).
`submitCode` (mã bài nộp "Đội Xanh-D2-B") GIỮ id vì đội dán đúng chuỗi đó.

## Chạy

- `npx vitest run client/src/host shared/src/leg scripts/leg-check.test.ts`: 24 file, 478 test qua.
- `npx tsc -p client|shared|scripts --noEmit`: sạch.
- `npm run build -w client` (làm mới client/dist) rồi `npm run leg:check`: mini 0 cảnh báo; paris-demo vẫn 1 cảnh báo cũ (L6); near 2 cảnh báo cũ (đường xe chạy).
- Chụp lại `p8-host` (SCREENSHOT_PORT=5222), đã xem PNG.
