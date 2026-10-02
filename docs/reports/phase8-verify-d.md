# Phase 8 – kiểm chứng đối kháng: Track D (`leg:check` + chặng test + tài liệu)

Trạng thái: **xong** (2026-10-02). Đối tượng: worktree `.claude/worktrees/wf_4133df99-060-4`, nhánh `phase8-track-D`, commit `eb67c0a`; kế hoạch `docs/plans/phase8.md` (§3 D2 / D17, §5, §6 Track D, §8); báo cáo `docs/reports/phase8-track-d.md`. Không sửa mã; file chặng thử nằm trong scratchpad, không vào repo. Không đọc chặng thật.

**Kết luận: ĐẠT (không có lỗi chặn).** Build / test thật qua; mọi mục "Việc" và "Test bắt buộc" của Track D đều có trong diff; số liệu `leg:check` trong tài liệu khớp lần chạy thật. Có 2 mục **nên sửa** (một lỗ quét lộ đáp án qua tên hình / link, một câu luật hứa sai về nút "Đổi lựa chọn kép") và vài mục nhỏ.

## (1) File ngoài danh sách sở hữu (`git diff --stat 0818033..HEAD`)
12 file. Thuộc Track D (§6): `scripts/leg-check.ts` + test, `docs/LEG_FORMAT.md`, `docs/RACE_RULES.md`, `worker/legs/paris-demo.json`, `worker/legs/test/{mini,paris-demo.filled}.json`, báo cáo.
Ngoài danh sách:
- `shared/src/leg/check.ts` + `leg.test.ts` (§6: "chỉ người tích hợp"): có cơ sở – `phase8-verify-foundation.md` S2 / M1 giao việc này cho D ("cùng vòng lặp, D"); báo cáo track ghi rõ. Chấp nhận.
- `package.json` + `package-lock.json` (`engines` 22.12 → 22.13): làm theo verify-foundation M8 (không giao cho ai). Không track nào khác đụng 2 file này (đã xem diff B / E và cây đang làm của A / C) → không xung đột; người tích hợp cần biết (README dòng 14 cũng phải đổi, báo cáo đã nêu).
- Không track nào khác sửa file của D; đổi link `vuon-trocadero.jpg` → `vuon-trocadero` trong `mini.json` không làm gãy test nào ở A / B / C / E (grep cả 4 worktree: chỉ có bản sao `mini.json` / `LEG_FORMAT.md`).

## (2) Build / test (chạy thật trong worktree)
- `npx vitest run --dir scripts`: **60 / 60** qua (5 file, 128 s). `shared`: **59 / 59** qua.
- `npm run build` (một lần): **exit 0** – tsc mọi workspace, vite, `wrangler deploy --dry-run`; log không có warning / error.
- `leg:check` thật: `mini` "Hợp lệ: 0 cảnh báo, 0 ô còn trống"; `paris-demo` "1 cảnh báo (L6), 18 ô còn trống"; `paris-demo.filled` "1 cảnh báo, 0 trống"; `near` "2 cảnh báo, 0 trống" – khớp bảng `LEG_FORMAT.md` §10; khối ví dụ D1/A ở §8 khớp từng dòng output thật.
- Không để lại wrangler / workerd / vite của track này (các tiến trình workerd đang chạy thuộc phiên kiểm Track A).

## (3) Đối chiếu "Việc" + "Test bắt buộc"
| Mục kế hoạch | Có? |
|---|---|
| D17: `secretStrings` / `answerStrings` gồm `referenceAnswers` (nền) + test thư mục tạm (1 chuỗi = cảnh báo, 2 = lỗi) | ✓ |
| D17: danh sách hình `r2:` cần tải; cảnh báo link https (hiểu là "link trỏ tới file hình") | ✓ (cách hiểu hợp lý, ghi ở "Lệch kế hoạch") |
| D17: bảng điểm "hòm nhánh X", "Hướng hòm" (la bàn), `boxes=…,,<yawDeg>`; `paris-demo` chỉ ô trống; `mini` 0 lỗi | ✓ (track B `parseBoxes` đọc trường 5 bằng độ → rad, khớp) |
| D2 luật 9: gợi ý một dòng khi `host_approval` gõ đáp án không có `referenceAnswers` | ✓ |
| Test: 3 chặng 0 lỗi; host_approval+answer không `proofInstruction` ≠ trống; free thiếu = trống; quét theo thứ tự; `referenceAnswers` lộ; `[CHƯA NHẬP`; nhãn trùng; `r2:` sai; https hỏng; nhánh không nơi riêng; `cipher`; quét static; bảng điểm | ✓ đủ 14 mục |
| LEG_FORMAT: media / r2 / tải lên theo cuộc đua / 5 MB; `referenceAnswers`; 2 phút khóa + ghi đè; `hostAlerts`; `yawDeg`; answer vs free; `[CHƯA NHẬP`; trùng nhãn; nơi riêng nhánh; kiểu hoãn; `auto`; bảng thông báo; §13 sim | ✓ |
| RACE_RULES: §3 xe trả lời từ xa; §4 hình hòm §17.15; §5 bỏ cuộc "chưa có"; §7 mã bài nộp + Copy; §7 không có lý do; §8 "Bị phạt", tên + mô tả ngắn, mã bài nộp; §12 mật thư mới tự mở; chuột tự do; Enter | ✓ (đã kiểm `RaceHud.setView` của B: key mới ≠ localStorage → mở thẻ đầy đủ, nên "tự mở khi vào lại" đúng) |
| LEG_FORMAT §5.2 teaser, §7.1 media R2, §7.1 / §13 "Hoàn thành (tạm)" | ✓ (grep: không còn "Hoàn thành (tạm)", "cờ vàng", "Chưa đạt", "3 lần sai", "Bạn có 1 mật thư mới") |
| D8: RACE_RULES §5 "trả lời ở bất kỳ đâu; **hòm mật thư kế vẫn đứng tại nơi chặng quy định**" | **nửa** (vế sau thiếu, xem N3) |

## (4) Thử phá

### Nên sửa
- **N1 – `leg:check` bỏ sót đáp án lộ qua tên hình `r2:` và URL link.** `textsOf` chỉ quét `media[].label`, không quét `media[].url`; mà `MediaView.url` (`r2:<tên>` hoặc link) đi nguyên xuống thẻ của đội (D13, `steps.ts:226`). Thêm vào đó `normalizeAnswer` không coi `-` `_` `.` là dấu cách. Thử (scratchpad, chép từ `mini`):
  - L1 `media` thêm `"r2:bay.jpg"` (đáp án nhánh A "bảy"), T1 `referenceAnswers: ["Palais de Tokyo"]`, L1 thêm `"r2:palais-de-tokyo.jpg"` + `"https://fr.wikipedia.org/wiki/Palais_de_Tokyo"` → "Hợp lệ: 2 cảnh báo" – **cả hai là cảnh báo quét static** (`client/dist` có chữ "Palais de Tokyo"), **không** cảnh báo nào về chữ của chặng.
  - T1 `referenceAnswers: ["Pont Alexandre III"]`, mật thư L1 thêm "Gần Pont-Alexandre-III." → 7 cảnh báo, toàn quét static, mật thư L1 im lặng.
  Kịch bản thật: §17.14 Thử thách 2 "địa điểm trong hình" – người soạn đặt tên hình theo địa điểm là chuyện rất tự nhiên; tên đó tới máy đội ngay khi nhận mật thư. `LEG_FORMAT.md` §9 lại liệt kê "hình / liên kết" là chữ được quét (thật ra chỉ nhãn). Sửa rẻ: trong `textsOf` đẩy thêm `m.url` (bước + task), và so sánh trên dạng chuẩn hóa thay `[-_./:]` bằng dấu cách; thêm 1 test (`r2:bay.jpg`, `palais-de-tokyo.jpg`). Nếu không sửa: một câu trong §7.2 / §9 "đừng đặt tên hình / link theo đáp án".
- **N2 – Luật "chỉ chờ Host duyệt mới chặn đổi nhánh (đây là điều kiện duy nhất)" sai với giao diện.** `RACE_RULES.md:145` và `LEG_FORMAT.md:114` ("**chỉ** lúc đang chờ Host duyệt thì không đổi được"). Kế hoạch D6 / D15 và mã đang làm của Track C (`format.ts:247` "none while pending, in choose / switchLocked, or read-only") **ẩn nút Đổi trong lúc đếm ngược đổi nhánh** (`switchLocked`): đội vừa đổi A → B không thể đổi lại A trước khi hết 10 phút. Người chơi đọc luật sẽ tìm nút không có. Sửa: "Không đổi được khi đang chờ Host duyệt, và trong lúc đang đếm ngược đổi nhánh (nút Đổi ẩn)"; bỏ cụm "đây là điều kiện duy nhất".

### Nhỏ
- **N3 – "Duyệt → nhận ngay mật thư tiếp theo, không phải đi tới đâu"** (`RACE_RULES.md:153, 197`, `LEG_FORMAT.md:103`) nói chung cho mọi lần duyệt; D8 đòi thêm "hòm mật thư kế vẫn đứng tại nơi chặng quy định", và SPEC §17.14 Thử thách 2 → đội phải tới chính địa điểm đã trả lời. Thêm một câu: "mật thư đó có thể dẫn bạn tới một nơi; hòm kế đứng ở đó".
- **N4 – Test yếu ở cờ `box`**: không test nào khẳng định T1 (thử thách có nơi riêng) và L3 (lộ trình trước Chặng dừng) **không** có dòng "Hướng hòm"; test chỉ xét dòng gạch đầu (`not.toMatch(/• Bước 2 \(T1, challenge\)[^\n]*hòm/)` – dòng đó vốn không bao giờ chứa "Hướng hòm"). Đổi `box` thành `true` cho mọi điểm thì không test nào đỏ. Thêm: số dòng "Hướng hòm:" của `mini` = 3.
- **N5 – RACE_RULES §10 vẫn hứa hai loại phạt chưa có**: "di chuyển nhanh hơn tốc độ đi bộ … bị cộng phút phạt" (cả §3:114) và "Host phạt trực tiếp, luôn kèm lý do (công cụ riêng của Host …)" – không có mã nào ghi `penalty_minutes` (chỉ đọc, `steps.ts:139/158`), không có công cụ Host; chính `LEG_FORMAT.md:61` của D ghi `walkOnlyViolationMinutes` "chưa có tác dụng (Phase 9)". D chỉ đánh dấu "Bỏ cuộc" là chưa có. Đánh dấu cả hai "(chưa có trong bản game này)".
- **N6 – `LEG_FORMAT.md:246`** "người chơi gõ câu trả lời, máy chủ trả lời đúng / sai" – câu cũ; chặng thật `host_approval`: Host quyết định.
- **N7 – `LEG_FORMAT.md` §13 so với sim của E**: "bot thứ hai còn đổi nhánh" – E chọn `switcher = min(2, bots − 1)` (bot thứ ba khi ≥ 3 bot; chỉ đúng với `--bots 2`); "hai đồng hồ rút còn 6 và 12 giây" – E giữ nguyên `task.retryLockMinutes` riêng của nhiệm vụ. Sửa một câu khi ghép (D ghép cuối).
- **N8 – `LEG_FORMAT.md:206`** "bấm Duyệt cho đúng câu đó": trang Host của E gọi nút là **"Duyệt lại"** trong ô ma trận (không ở hàng chờ).
- **N9 – `RACE_RULES.md:145`** "đếm ngược 3 phút **của thử thách**": trong Lựa chọn kép khóa 3 phút là của bài nhánh bị Phạt; đổi chữ "của nhánh".
- **N10 – Sổ mật thư (RACE_RULES §8)**: (a) "Mỗi mục có trạng thái … chờ Host duyệt, bị phạt" và "mã bài nộp kèm nút Copy" ở Sổ phụ thuộc Track C (chưa commit); kế hoạch §11 lại ghi "nút Copy trong Sổ" là hoãn – mâu thuẫn trong kế hoạch, kiểm khi ghép. (b) "đề bài của nhánh chỉ có sau khi bạn mở hòm" ngụ ý mở rồi thì còn; thực tế đổi nhánh thì `BranchView.task` của nhánh cũ biến mất khỏi Sổ.
- **N11 – `LEG_FORMAT.md` §7 bảng** "`lat`, `lon`: Hộp mật thư đứng đúng tại đây" áp cho cả `task.location` của thử thách, trái §5.2 ("thử thách không có hòm riêng").
- **N12 – "câu gợi ý"** (teaser, `RACE_RULES.md:150`) cạnh "**Không có gợi ý trong game**" (`:154`): hai nghĩa một chữ; gọi teaser là "lời dẫn" hoặc ghi rõ.

## Đã kiểm, đúng
- `textsOf` mới: hai nhánh quét chéo (kể cả đáp án tham khảo), nhãn bước, `proofInstruction`, `contactLabel` chỉ khi có nhiệm vụ ảnh ở bước ≤ i, lời dẫn detour, nhãn media bước; khử trùng theo đường dẫn. Test sẽ đỏ nếu bỏ điều kiện `kind === 'free'`, quay về `own`, hoặc nới thứ tự bước.
- Cảnh báo link-hình: tiền đề đúng (`mediaView` chỉ cho `r2:` là `image`); `.JPG?x=1` bị bắt, `…/a.jpg/page` và `imgur.com/abc` không.
- Mã bài nộp trong tài liệu = `submitCode` của nền (`Đội Xanh-D1-A`); `Enter` / chuột tự do khớp `main.ts` của B; sim Host bot / phạt 6 s / 12 s / `answersOf` khớp `sim.ts` của E (trừ N7).
