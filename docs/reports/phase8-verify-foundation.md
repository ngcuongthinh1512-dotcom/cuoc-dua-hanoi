# Phase 8 – kiểm chứng đối kháng: nền hợp đồng

Trạng thái: **xong** (2026-10-02). Đối tượng: commit `1229d2b` `feat(phase8): nền hợp đồng`, báo cáo `docs/reports/phase8-foundation.md`, kế hoạch `docs/plans/phase8.md`. Không sửa mã (một test tạm trong `worker/src/` đã chạy rồi xóa; file chặng sai nằm trong scratchpad, không vào repo). Không đọc chặng thật.

**Kết luận: ĐẠT (không có lỗi chặn).** Build / test thật qua, zod + `leg:check` bắt đúng file sai, không type nào xuống client đội mang đáp án / đáp án tham khảo / ghi chú Host / đề bài nhánh chưa mở, migration v2 → v3 chạy đúng **trong workerd** và trạng thái mới dựng lại đúng sau khi DO bị đuổi. Có 2 mục "nên sửa" (chủ yếu: ai xóa op `task`, quét lộ đáp án bỏ sót đường đổi nhánh) và vài mục nhỏ – nên chốt trước khi mở 5 track.

## (1) `npm run build && npm test` (chạy thật)
- build exit 0 (tsc mọi workspace + vite + `wrangler deploy --dry-run`), log không có warning / error.
- test exit 0: scripts **50**, shared **57**, client **633**, worker **98** – khớp báo cáo nền. Không còn workerd / vite chạy sau đó.
- `leg:check`: `mini` "0 cảnh báo, 0 ô còn trống"; `paris-demo-filled` chỉ cảnh báo L6 cũ; `paris-demo` 18 ô trống + cảnh báo L6 cũ – khớp báo cáo.
- `client/dist`: không có `referenceAnswers`, đáp án tham khảo của `mini`, `ZodError`.

## (3) File chặng sai – `leg:check` / zod
6 file sinh từ `mini.json` (scratchpad):

| Thử | Kết quả |
|---|---|
| thiếu `clue`, `radius: "30"`, `yawDeg: "150"`, `penalties.retryLockMinutes: -1`, `branchSwitchLockMinutes: "10"`, `task.retryLockMinutes: "3"`, `hostAlerts.stuckMinutes: 0` | 7 LỖI tiếng Việt đúng chỗ ("phút khóa sau khi bị phạt: phải ≥ 0", "hướng nhìn (độ): phải là một số"…), exit 1 ✓ |
| `media: [123, {url, label, extra}]` | "phải là một chuỗi ("https://…" hoặc "r2:<tên hình>") hoặc {url, label}", "có trường lạ: extra" ✓ |
| `r2:bad name.gif`, `javascript:alert(1)`, `http://localhost/x`, `ftp://x.org/a` | 4 LỖI ✓ (`r2:..jpg`, `HTTPS://EXAMPLE.ORG/a` qua – vô hại: khóa R2 phẳng) |
| `[chưa nhập …]` (chữ thường) ở `start.name`, `referenceAnswers[0]`, `media[].label` | CÒN TRỐNG ✓ |
| `kind: "cipher"`, nhãn trùng, nhánh không nơi riêng, phạt 0.5 / 0 phút | 5 CẢNH BÁO ✓ |
| `host_approval` + `answer` không `proofInstruction`; `free` không `proofInstruction`; bỏ `hostApproval` | không trống / CÒN TRỐNG / CÒN TRỐNG link Facebook ✓ |
| đáp án T1 trong mật thư L1 (trước); đáp án tham khảo trong teaser T1; đáp án T1 trong mật thư L3 (sau) | cảnh báo / cảnh báo / im lặng ✓ (quét theo thứ tự bước đúng) |
| đáp án nhánh A trong `description` / nhãn hình của nhánh B; đáp án T1 trong `proofInstruction`, `label` của T1, `hostApproval.contactLabel` | **im lặng** ✗ → phát hiện S2, M1 |

## (4) Rò rỉ qua type client
- Type xuống đội: `ClueCard`, `TaskView`, `BranchView`, `MediaView`, `AnswerView`, `BoxInfo`, `RaceView`, `Welcome`, `book`, `ZoneMember`, `ServerNotice`. Không trường nào mang `answers` / `referenceAnswers` / `params` / `host_note` / `AnswerRec.n` / `b`; `answerViews` chỉ chép `id, text, at, s`; `TaskView` của nhánh chỉ khi đã chọn **và** đã mở hòm (hoặc bước xong); `task` thử thách ẩn khi `teaser`; `currentBox` detour hiện trả `null` (không lộ tọa độ hòm nhánh nào).
- `StepProgressView.answers[].note`, `note`, `ReviewItem.reference` chỉ trong `host.state`, mà `host.state` chỉ gửi `this.sockets(HOST)` (`RaceRoom.ts:522`); `host.review` chỉ hợp lệ từ socket Host (`isClientMessage` role).
- `grep client/src`: không đọc `referenceAnswers` / `host_note`. Test `steps.test.ts:144` quét mọi chuỗi của thẻ ở 5 trạng thái dòng của `mini` + `paris-demo-filled`.
- Kiểm thêm trong workerd (mục 5): `welcome` của đội ở T1 có câu trả lời `pending` + ghi chú Host trong SQLite → không chứa ghi chú, không chứa đáp án / đáp án tham khảo.
- Kết luận: **không lọt**. Chỉ còn lỗ ở phía *chặng* (người soạn viết đáp án vào chữ đội đọc mà `leg:check` không quét): S2, M1.

## (5) Migration DB + DO bị đuổi (test thật bằng `createTestHarness`, file tạm đã xóa)
Kịch bản trong workerd (`evictDurableObject` + `getDurableObjectStorage`):
1. Cuộc đua `nearLeg`, đội A mở L1 → T1. Đuổi DO. Biến DB thành **v2 thật**: `ALTER TABLE step_progress DROP COLUMN` 4 cột v3, `meta.schema = '2'`. Đuổi lại.
2. DO thức dậy (socket Host): `migrate` chạy `PRAGMA table_info` + 4 `ALTER … ADD COLUMN` **trong workerd** → 4 cột ở cuối, `schema = '3'`, mọi dòng `step_progress` y hệt trước, `host.state.progress` T1 = `{pending: false, answers: [], note: '', lockedUntil: null, branchOpenedAt: null}` ✓.
3. Ghi thẳng vào SQLite: T1 `answers` = [penalized + ghi chú, pending], `host_note`. Đuổi DO → `welcome.view.card` = `{status: 'pending', answers: [penalized, pending]}`, không có ghi chú / đáp án; `host.state.progress` có `pending: true`, `note`, `answers[0].note` ✓.
4. Ghi `locked_until = now + 120 s` cho T1; đội B: `teams.state.step = 3` + dòng D1 `{branch: 'B', branch_switches: 1, locked_until}`. Đuổi DO → A: `{status: 'locked', lockedUntil: <đúng giá trị>, lockKind: 'retry'}`; B: `{status: 'switchLocked', lockKind: 'switch', switches: 1, branchOpened: false, answers: []}` (câu cũ `b: 'A'` không hiện), hai nhánh không `task`, `welcome.boxes` không có hòm D1 ✓.
- Kết quả: 1 test qua (15 s). Trạng thái thẻ tính từ dòng + `now`, không có gì treo trong RAM – D4 / D25 đúng ở tầng nền. (`queue` vẫn `[]` – stub của A.)

## (2) Diff so với kế hoạch – hợp đồng thiếu / mơ hồ

### Nên sửa
- **S1 – Ai xóa op `task`: ba nguồn nói ba kiểu.** Báo cáo nền (mục "Hợp đồng", A): "A xóa op `task` (types / codec / engine / `verifyTask` / `RaceClient.task` / `RaceHudActions.task` / test Phase 7)". Mã: `RaceClient.ts` ghi "track B removes it", `RaceHud.ts` ghi "tracks B / C remove it". Kế hoạch §6: `RaceClient.ts` là file của B, `RaceHud.ts` của C, `shared/src/protocol` chỉ người tích hợp. A làm theo báo cáo sẽ sửa file của B / C (xung đột ghép); B / C làm theo chú thích sẽ xóa `actions.task` trong khi engine / harness của A còn dùng op. **Sửa:** một câu chốt trong `phase8-foundation.md` (và chú thích mã): A chỉ bỏ op ở `worker/` + test của mình; B bỏ `RaceClient.task`, C bỏ `RaceHudActions.task` + nút tạm; người tích hợp bỏ `task` khỏi `types.ts` / `codec.ts` sau khi ghép A + B + C.
- **S2 – Quét lộ đáp án bỏ qua đường "Đổi lựa chọn kép".** `check.ts` (textsOf `own`) và `LEG_FORMAT.md:235` coi đề bài nhánh kia "không đọc được" vì nằm trong hòm. Nhưng §17.16 cho đổi nhánh: đội chọn B, mở hòm B, đọc đề B (có đáp án A), đổi sang A (10 phút) rồi trả lời A. Thử: đáp án nhánh A trong `description` / nhãn hình của nhánh B → `leg:check` im lặng; tài liệu lại hứa với người soạn là an toàn. **Sửa:** với detour, quét đáp án của mỗi nhánh với chữ của **cả hai** nhánh (bỏ tham số `own`), sửa một câu ở `LEG_FORMAT.md:235` (track D).

### Nhỏ
- **M1 – Chữ đội thấy mà không quét:** `task.proofInstruction` (thẻ nhiệm vụ ảnh), `label` của bước (thẻ + Sổ), `hostApproval.contactLabel` (nút gửi bài). Đáp án T1 đặt vào cả ba → im lặng. Thêm vào `textsOf` (cùng vòng lặp, D).
- **M2 – `submitCode` khác chữ ký kế hoạch:** nền đặt `submitCode(teamName, step, branch?)` ở `@race/shared/protocol`; kế hoạch §5.3 / §6 Track C (kể cả dòng test `submitCode('Đội Xanh', card)`) vẫn ghi `submitCode(teamName, card)` trong `format.ts`; tương tự `raceHud.answerMax / historyMax` → nay là `NET.answerMax / answerHistory`. Báo cáo nền có nói chỗ mới nhưng không nói chữ ký mới → giao C kèm một dòng.
- **M3 – `host.review` còn hai chỗ phải đoán (A ↔ E):** `op: 'note'` không có `note` = xóa ghi chú hay bỏ qua? `note` gửi kèm Duyệt / Phạt ghi vào `AnswerRec.n` hay cả `host_note`? (`ReviewItem.note` chỉ là `host_note`, nên ghi chú gõ rồi bấm Phạt có thể "biến mất" khỏi hàng chờ.) Chốt một câu trong §5.1.
- **M4 – `advance(…, running)` với `approve` khi tạm dừng:** D5 cho Host duyệt khi `paused`, nhưng `advance` coi `running = false` là "không đi tiếp" (`settle` trả sớm, `steps.ts:134`). A phải truyền `running = true` cho `approve` (hoặc tách) – nên ghi vào hợp đồng A. Thêm: stub `mediaAllowed(leg, step, rows, name)` khác chữ ký §5.2 (`team: TeamRace`) – A sở hữu cả hai, chỉ cần cập nhật kế hoạch.
- **M5 – `answers` JSON không có trần:** `auto` sai được lưu hết trong một dòng (≤ `maxRaceOps` 30 / phút) và **toàn bộ** đi trong mỗi `host.state` (`progress[].answers`). Đội kẹt 2 giờ, 1 câu / 10 s ≈ 720 mục ≈ 60 KB mỗi lần đẩy. Chặng thật dùng `host_approval` (một câu chờ một lúc) nên rủi ro thấp; ghi `ponytail` / TODO hoặc chỉ giữ N câu `wrong` cuối.
- **M6 – `mini` giữ phạt 3 / 10 phút** (lệch 3): kế hoạch D18 và §8 (`npm run sim -- --leg mini`, test tích hợp E "có ≥ 1 phạt + 1 đổi nhánh") vẫn giả định 0.1 / 0.2 → sim chờ 13 phút nếu E không ghi đè bằng `host.leg {json}`. Báo cáo nền có nói cho E; nhắc lại trong prompt của E.
- **M7 – `nearLeg` giữ nhánh A tại điểm 3** (lệch 5): khi A dời sang 4 / 5 / 6, `nearPoint` đổi nghĩa; test nào của B / E viết theo bố cục hiện tại sẽ gãy lúc ghép. Ghi rõ "chỉ A dùng `nearPoint` tới khi ghép".
- **M8 – `db.test.ts` dùng `node:sqlite`:** không cần cờ chỉ từ Node **22.13**; `package.json` `engines` ghi `>=22.12` → trên 22.12 test này ném "No such built-in module". Nâng `engines` lên `>=22.13` (máy hiện tại: v24.21).

## Đối chiếu nhanh kế hoạch §4 / §5 ↔ commit
- Có đủ: schema D2 (mọi trường + mặc định, file Phase 7 vẫn nạp), luật check 1–8, `r2Names` / `mediaItems`, `Zone.yaw`, giao thức §5.1 (mọi kiểu / tin / hằng, validator + test), SQLite D4 (`addColumn` kiểm PRAGMA, `CREATE` giữ cột v2), `taskState` / `cardOf` / `boxesOf` / `placesOf` + `eligible` (C1) + test, `Progress` điền từ dòng, `hostView` trường mới, route media 501.
- Dời sang track (báo cáo ghi lý do, chấp nhận): khối config `raceClient` / `raceHud` / `hostPage` / `clueBox`, `ClueBoxes` (khóa step|branch, `remove`, `boxRotation`), `format.ts` (`lockLine`, `answerLines`…), `DEMO_CARDS` mới, preset `p8-*`, `RACE_RULES.md`, `TODO.md`, `RaceIO.hideBox`.
