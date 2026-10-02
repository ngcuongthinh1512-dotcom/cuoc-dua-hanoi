# Phase 8 – Track D: định dạng chặng, `leg:check`, chặng test, tài liệu người chơi

Trạng thái: **xong** (2026-10-02). Nhánh `phase8-track-D` (từ `0818033`). Kế hoạch: `docs/plans/phase8.md` §6 Track D + D17 + "điều chỉnh sau kiểm nền". Không đọc / không chép chặng thật; mọi ví dụ là chặng test (GIẢ). Không sửa `docs/SPEC.md`, `TODO.md`, `CLAUDE.md`, `README.md`, `HANDOFF.md`, `shared/src/protocol`.

## Đã làm

### 1. `shared/src/leg/check.ts` (ngoại lệ được phép) + `leg.test.ts`
- **Quét lộ đáp án của Lựa chọn kép với cả hai nhánh** (kiểm nền S2): bỏ tham số `own`; đáp án + đáp án tham khảo của **mỗi** nhánh được so với chữ của **cả hai** nhánh (đội mở hòm B, đọc đề B, "Đổi lựa chọn kép", rồi trả lời A). Thông báo ghi rõ nhánh: `chứa đáp án "x" của bước 4 (D1, nhánh A): …` (thử thách không detour giữ dạng cũ `của bước 2 (T1)`).
- **Thêm vào chữ được quét** (kiểm nền M1): nhãn bước (`label`, thẻ + Sổ), `task.proofInstruction`, `hostApproval.contactLabel` (chỉ tính khi bước ≤ i có nhiệm vụ `free`: nút đó chỉ nằm trên thẻ ảnh). Mỗi chuỗi một lần (khóa theo đường dẫn) nên nhãn nút dùng chung không lặp cảnh báo.
- Test mới / sửa: 2 test cũ đổi chữ thông báo (`, nhánh A`) và bỏ ca "đề bài nhánh kia được phép" (nay là cảnh báo); thêm "đáp án nhánh A trong đề / nhãn hình của nhánh B và ngược lại, kể cả đáp án tham khảo", "`proofInstruction` / nhãn bước / nhãn nút", "nhãn nút không tính khi chưa có nhiệm vụ ảnh", "chữ của bước sau không cảnh báo".

### 2. `scripts/leg-check.ts` (D17) + `leg-check.test.ts`
- Bảng điểm: điểm của nhánh ghi **"hòm nhánh X"**; dòng **"Hướng hòm:"** (la bàn như `compass()`, kèm `yawDeg`; chỉ ở điểm có hòm: lộ trình không đứng ngay trước Chặng dừng và nơi riêng của nhánh); dòng "Trong game" thêm `yawDeg` làm trường thứ 5 của `boxes=<tên>,x,z,<opened>,<yawDeg>` (bỏ qua khi 0; track B làm `parseBoxes` đọc trường này, hiện chưa đọc nên vô hại).
- In **"Hình cần tải lên trang Host"**: danh sách tên `r2:` hợp lệ (dùng ở đâu, 5 MB từ `MEDIA.maxBytes`) trước bảng điểm; không có `r2:` thì không in.
- **CẢNH BÁO** link `https://…` trỏ thẳng tới file hình (`.jpg/.png/.webp/.gif/.avif/.bmp`): chỉ `r2:` mới hiện thành hình (`cardOf` đặt `kind: 'image'` theo tiền tố `r2:`), link còn lại chỉ bấm mở tab mới. Đây là cách hiểu "cảnh báo link https không phải hình" của D17; làm ở CLI, không ở `check.ts` (server không cần).
- Một dòng **gợi ý** (không phải cảnh báo) khi nhiệm vụ `host_approval` kiểu gõ đáp án chưa có `referenceAnswers` (D2 luật 9).
- `secretStrings` / `answerStrings` đã gồm `referenceAnswers` từ nền; test thêm: đáp án tham khảo chép vào thư mục tĩnh → một chuỗi lẻ = cảnh báo (trùng đáp án), hai chuỗi trong một file = LỖI.
- 10 test mới (xem bảng ở mục Test).

### 3. Chặng test
- `worker/legs/test/mini.json`: link của T1 `…/vuon-trocadero.jpg` → `…/vuon-trocadero` (để `mini` vẫn "0 cảnh báo" sau cảnh báo link-hình mới). Bản chép trong `LEG_FORMAT.md` §10 đổi theo.
- `paris-demo.json` + `test/paris-demo.filled.json`: thêm `penalties.retryLockMinutes 3`, `branchSwitchLockMinutes 10`, `hostAlerts.stuckMinutes 45` (đúng giá trị mặc định: không đổi hành vi, chỉ để người soạn thấy các núm). `leg:check`: `paris-demo` vẫn "1 cảnh báo (L6), 18 ô còn trống", filled "1 cảnh báo (L6), 0 trống", `mini` "0 cảnh báo, 0 trống", `near` 2 cảnh báo cũ (cố ý).
- `package.json` gốc + `package-lock.json` (khối `engines` của gốc): `node >= 22.13` (`db.test.ts` dùng `node:sqlite`).

### 4. Tài liệu
- **`docs/RACE_RULES.md`** (số mục như bản đang có): §2 phím `Enter` mở lại thẻ + chuột tự do khi thẻ / Sổ / bản đồ mở; §3 "trả lời từ xa thì xe không vào bãi", chỉ nơi của nhánh đã chọn tính là điểm của đội, gõ trả lời không cần xuống xe; §4 hình dạng hòm (§17.15) thay "cờ vàng–đỏ", hòm nhánh, dòng trạng thái thẻ rút gọn; §5 Lựa chọn kép (2 nút, hòm nhánh, đề bài trong hòm, Đổi + hộp xác nhận + phạt 10 phút đếm ngược, mỗi lần một lần phạt, chỉ chờ duyệt chặn), Thử thách (gõ ở bất kỳ đâu, lịch sử trên thẻ / Enter, Host duyệt / phạt, Thử thách 2 ngay khi duyệt, không có gợi ý trong game + cảnh báo kẹt 45 phút cho Host, bỏ cuộc "chưa có"), nhấn mạnh hai kiểu nhiệm vụ có thật; §6 viết lại (bỏ "sai 3 lần khóa 30 giây"); §7 viết lại hai kiểu bài (gõ trong game; ảnh Messenger với mã bài nộp `<tên đội>-<bước>[-<nhánh>]` + Copy), Phạt = đếm ngược, ghi chú Host không gửi cho đội, bù giờ chỉ cho thời gian chờ duyệt; §8 Sổ (hình / link, không có lịch sử trả lời kể cả mục ghim, nhánh chưa mở không hiện đề, "Bị phạt" thay "Chưa đạt kèm lý do"); §10 làm rõ nút Phạt / Đổi nhánh không phải phút phạt; §11 đếm ngược không trừ, vẫn chạy khi tạm dừng; §12 vào lại giữ lịch sử / đếm ngược / nhánh, mật thư mới tự mở (không còn "Bạn có 1 mật thư mới"); §13 hình chỉ tải cho đội đã mở, đáp án không tới máy đội.
- **`docs/LEG_FORMAT.md`**: §5.2 (bỏ câu "hộp kế tiếp đứng tại…", nói rõ `task.location` ở thử thách không có hòm), §5.3 (hộp xác nhận, phạt mỗi lần, đang khóa 3 phút vẫn đổi được), §6 (mật thư kế tới khi: lộ trình xong ở hòm, thử thách / nhánh xong khi Host duyệt), §3.1 hàng `hostApproval`, §7 `location`, §7.1 `params`, §7.2 link-hình cảnh báo, **§7.4 mới** (Host duyệt, đáp án tham khảo, "Duyệt (đã nhận ảnh)", cảnh báo kẹt, không có gợi ý trong game), §8 (ví dụ thật nhánh A, mô tả "hòm nhánh", "Hướng hòm", "Hình cần tải", gợi ý), §9 (quét hai nhánh với nhau + danh sách chữ được quét; **câu sai cũ ở "dòng ~235" đã sửa**), §10 ví dụ, §11 bảng thông báo (dạng `(D1, nhánh A)`, link-hình), §13 sim (Host ảo, phạt rút gọn, nhánh i mod 2, bot đổi nhánh, báo cáo thêm).
- Grep xác nhận không còn: "cờ vàng", "Chưa đạt", "Hoàn thành (tạm)", "nút tạm", "3 lần sai", "khóa 30", "Bạn có 1 mật thư mới", "ảnh/video" trong hai tài liệu; "mã bài nộp" chỉ còn dạng `<tên đội>-<bước>[-<nhánh>]` (không số ngẫu nhiên). "Phase 10" còn đúng một chỗ, đúng nghĩa (trình soạn chặng trên bản đồ). Câu "lý do" còn một chỗ cố ý (RACE_RULES §10 "Host phạt trực tiếp, luôn kèm lý do" = công cụ phạt thủ công SPEC §13, khác nút Phạt khi duyệt) và một chỗ nói rõ ghi chú Host không gửi cho đội.

## Test (bắt buộc theo kế hoạch)

| Yêu cầu | Test |
|---|---|
| `mini` / `paris-demo-filled` / `near` 0 lỗi; `mini` 0 cảnh báo; `paris-demo` chỉ ô trống (+ cảnh báo L6 cũ) | `scripts/leg-check.test.ts` (it.each cũ + "the bundled legs") |
| `host_approval` + `answer` không `proofInstruction` → không CÒN TRỐNG; `free` thiếu → CÒN TRỐNG | `leg-check.test.ts` + `leg.test.ts` |
| Quét theo thứ tự bước (sau: im lặng, trước: cảnh báo) | cả hai |
| `referenceAnswers` lọt mô tả → cảnh báo | cả hai |
| Đáp án nhánh kia lọt vào đề nhánh này; `proofInstruction` / nhãn bước / nhãn nút | cả hai (mới) |
| `[CHƯA NHẬP …]` → CÒN TRỐNG, nhãn trùng, `kind` lạ | cả hai |
| `r2:` sai tên → LỖI; `https` hỏng → LỖI; link tới file hình → CẢNH BÁO | `leg-check.test.ts` |
| Nhánh không nơi riêng → CẢNH BÁO | cả hai |
| Quét static: `referenceAnswers` | `leg-check.test.ts` |
| Bảng điểm: "hòm nhánh A / B", "Hướng hòm", `boxes=…,,135`, hình cần tải, gợi ý | `leg-check.test.ts` |

Đã chạy: `npx vitest run scripts/leg-check.test.ts` (33), `shared/src/leg` (25), `worker/src/legs.test.ts` (9), `tsc -p scripts` + `tsc -p shared`; một lần `npm run build && npm test` từ gốc worktree (kết quả ở cuối báo cáo).

**Kết quả `npm run build && npm test` (một lần, từ gốc worktree, cuối track):** build exit 0 (tsc mọi workspace + vite + `wrangler deploy --dry-run`); test: scripts 60, shared 59, client 633, worker 98, tất cả qua. Không còn wrangler / workerd / vite chạy.

## Việc để người tích hợp

- **README dòng 14**: "Node.js ≥ 22.12" → "≥ 22.13" (không thuộc track D).
- **CLAUDE.md** mục `npm run leg:check`: thêm "in danh sách hình `r2:` cần tải, hòm nhánh + hướng hòm (`boxes=…,,<yawDeg>`), cảnh báo link https trỏ tới file hình; quét lộ đáp án theo thứ tự bước, hai nhánh Lựa chọn kép quét chéo".
- **Kiểm khi ghép** (tài liệu viết theo kế hoạch D5 / D6 / D15 / D16 / D18, chưa có mã để đối chiếu): nút "Duyệt (đã nhận ảnh)" (E), "Chờ duyệt (n)", "Bật thông báo", mục "Hình mật thư (R2)" (E); `sim`: Host ảo, bot thứ hai đổi nhánh, **sim tự ghi đè phạt xuống 6 s / 12 s** (LEG_FORMAT §13 hứa điều này; nếu E làm khác thì sửa một đoạn); chữ nút / phím trên thẻ (`Enter`, `1` / `2`, "Nhận thử thách", "Gửi câu trả lời", "Tôi đã gửi bài – chờ Host duyệt", "Đổi lựa chọn kép", hộp xác nhận) (C); `Esc` trong ô gõ bỏ focus rồi mới đóng thẻ (C); chuột thả khi thẻ / Sổ mở (B); "đang khóa phạt 3 phút vẫn đổi nhánh được" (A, câu hỏi mở 15); "tới vùng nhánh đã chọn mới park" (A, C1).
- `boxes=` trường thứ 5 `yawDeg`: B phải làm `parseBoxes` đọc (link "Trong game" của `leg:check` đã sinh sẵn).

## Lệch kế hoạch

1. Cảnh báo link-hình làm ở CLI (D17) nên đụng `mini.json` (đổi một link) để giữ "mini 0 cảnh báo"; thay vì nới điều kiện cảnh báo.
2. `contactLabel` chỉ quét khi có nhiệm vụ `free` ở bước ≤ i (không quét cho mọi bước): tránh cảnh báo oan khi chặng không có bài ảnh.
3. Thông báo lộ đáp án thêm `, nhánh X` (kế hoạch giữ nguyên chữ) để người soạn biết nhánh nào của Lựa chọn kép.
4. Thêm các giá trị mặc định (`penalties` 2 trường, `hostAlerts`) vào `paris-demo.json` và `filled` (kế hoạch: "chỉ `paris-demo.json` thêm `hostAlerts`"): để mẫu mà người soạn sao chép có đủ núm.
