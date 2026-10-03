# Phase 10 – Track S (máy chủ)

Trạng thái: **xong** (2026-10-03, nhánh `phase10-track-S`, từ main `f02234c` = nền `de3fc0e` + SPEC §17.25; chưa ghép vào main).
Kế hoạch: `docs/plans/phase10.md` §3.2 / §4.2 / §5.2 / V5 + hợp đồng `docs/reports/phase10-foundation.md` + việc bổ sung SPEC §17.25 (xuất dữ liệu thời gian, điều phối giao giữa chừng).

## Đã làm
1. **Hoàn tác 10 giây** (`worker/src/race/engine.ts`).
   - Mỗi Duyệt / Phạt / Cho qua (không phải ghi chú) tạo một bản ghi `UndoRec {team, step, id, op, at, race, rows, stepAfter}`: `race` = các trường `TeamRace` của đội TRƯỚC quyết định (không đụng trường hiện diện / cờ), `rows` = mọi hàng `step_progress` quyết định đổi, như trước quyết định (`null` = chưa có hàng → DELETE khi hoàn tác). Bản ghi ghi vào `meta 'undo'` **trong cùng transaction** với quyết định (1 dòng), trước mọi tin gửi đi; giữ ≤ `NET.undoKept`, trong `NET.undoMs`; dựng lại trong constructor (DO bị đuổi vẫn hoàn tác được).
   - `host.review {op:'undo', id}` → `undo()`: tìm bản ghi MỚI NHẤT khớp `team / step / id`; từ chối (host.notice warning, 0 dòng) khi: không có ("Không còn gì để hoàn tác cho bài này."), quá 10 s ("Quá 10 giây, không hoàn tác được nữa. Dùng «Duyệt câu vừa phạt» hoặc Phạt / Duyệt lại."), đội đã về đích ("Đội đã về đích, không hoàn tác được (thứ hạng đã báo cho các đội)."), đội đã sang bước khác / có quyết định mới hơn ("Đội đã đi tiếp / có quyết định mới hơn, không hoàn tác được."), cuộc đua đã kết thúc (error "Cuộc đua đã kết thúc.", như trước).
   - Một transaction: ghi lại / DELETE các hàng + event `host.undo {step, op, id}` + `meta 'undo'` + `teams.state` (chỉ khi trường đua đổi). Sau commit: vá cache, rồi gửi đội: hòm của bước đội vừa được đưa tới bị ẩn (`hide`; hòm nhánh: `remove`), `notice reviewUndone`, `race view`; hòm nhánh đã mở của bước được khôi phục được gửi lại (`reveal`, trường hợp đội đổi nhánh trong 10 s); `io.changed`; `refreshZones`. Hành động của đội trên các bước bị khôi phục trong 10 s bị bỏ (M2); xe đã vào bãi không quay lại (M4); event `review` gốc giữ trong nhật ký.
   - `hostView().undo` = các bản ghi mà Hoàn tác **đang qua được** (còn hạn, đội chưa về đích, chưa đi tiếp, là quyết định mới nhất của đội), `until = at + NET.undoMs`.
   - `RaceIO.hideBox(team, step, branch?)`: không `branch` → `{t:'box', op:'hide', step}` (RaceRoom).
2. **Xóa cờ đỏ** (`worker/src/RaceRoom.ts`): `flag(t, why, now)` – lần gắn đầu `{flagged, flagWhy:[why], flagAt: now}` (1 dòng), lý do mới thêm vào (1 dòng, ≤ 3), lý do đã có 0 dòng; `onPose` → `speed`, `teleport` → `jump` / `respawn`. `host.flag {op:'clear', team}`: không có đội → error "Không có đội này."; không có cờ → warning "Đội này không có cờ."; có → transaction event `host.unflag {why, since}` + `teams.state` (**3 dòng**) rồi đẩy `host.state` ngay. `Live.over / tp` không đụng (M5: vi phạm mới gắn lại).
3. **"Vừa rời đi"** (`engine.ts`): `gone` = rack key → đội → `{slot, label, type, branch, since, left, stepIdx}` (bước lúc rời). Ghi khi đội đi ra khỏi điểm (`moveZone`) hoặc mất kết nối (`left()`); xóa khi đội vào lại đúng điểm đó. `refreshZones` thêm các đội rời trong `NET.zoneLeftMs` (cùng luật §17.10: `stepIdx ≤` bước của người xem, không tính chính mình) dạng `ZoneMember {…, left}`; mục quá hạn bị cắt khi danh sách của điểm đó được tính lại. **0 dòng SQLite**, không alarm (M6).
4. **V5 "Cho qua"** (`steps.ts review()`): Duyệt không `id` cho MỌI loại thử thách / nhánh đã mở hòm khi `active` / `locked` (tạo câu `approved` `text: ''`). Đang có câu chờ duyệt: Duyệt không `id` vẫn duyệt chính câu đó như Phase 8 (không tạo câu "Cho qua" bên cạnh). Teaser / chưa mở hòm nhánh: vẫn từ chối.
5. **"Một Host"**: hằng `OVERRULED` nay "… Nếu bấm nhầm, bấm «Hoàn tác» trong 10 giây." (bỏ "trao đổi với Host còn lại"); chú thích "two Hosts" ở `steps.ts review()` / `engine.ts` N4 / test sửa theo.
6. **SPEC §17.25 – xuất dữ liệu thời gian** (`worker/src/index.ts`, `worker/src/race/export.ts` mới, `RaceRoom.ts` `/export`):
   - `GET /api/race/<race>/export?format=csv|json` (mặc định csv), token Host trong `Authorization: Bearer <token>` (không bao giờ trên URL, như route media). Không / sai / token đội → **401**; race id hoặc format sai → 400. Worker kiểm token rồi hỏi DO `/export`.
   - DO chỉ ĐỌC: `events` (SELECT), `step_progress` (`readProgress`), `teams` → `exportRace()` thuần → `{race, exportedAt, raceStartAt, teams, steps, events}`. **0 dòng ghi** (đo bằng `counters.rows`).
   - Bảng đội × bước (các bước đội đã nhận): đội (id, tên), mã / tên / loại bước, nhánh; 4 mốc `arrived_at` / `clue_opened_at` (bước 1 = lúc đội vào game lần đầu, §17.23) / `task_started_at` / `completed_at`, mỗi mốc: epoch ms, ISO UTC, giờ Việt Nam (UTC+7, "YYYY-MM-DD HH:mm:ss"), giây từ lúc Host mở cuộc đua (event `host.race start` đầu tiên), giây từ lúc xong bước trước (bước 1: từ lúc vào game); số lần sai, số lần bị phạt, **số giây bị khóa** (mỗi Phạt từ lúc quyết định, mỗi lần chốt sai phòng Louvre, mỗi lần đổi nhánh; theo số phút khóa của chặng; cắt ở lần khóa kế tiếp / lúc xong bước / lúc xuất), số lần đổi nhánh, giây chờ Host duyệt. Giây làm tròn số nguyên (không có dấu thập phân, tránh lệch locale Excel).
   - Bảng đội: thứ tự vào game, vào game lần đầu, hạng về đích, về đích (mốc + giây từ mở cuộc đua), bị loại.
   - Nhật ký: STT, thời điểm (mốc + giây từ mở cuộc đua), loại, đội (id, tên), bước (`data.step`), dữ liệu JSON thô.
   - KHÔNG có: `step_progress.answers` (câu đội gõ), `host_note`, đáp án / `referenceAnswers` của chặng (test kiểm).
   - CSV: UTF-8 có BOM, "," + CRLF, ô có `,` / `"` / xuống dòng bọc nháy kép (nháy nhân đôi), ô chữ bắt đầu bằng `= + - @` thêm `'` (chống CSV injection), true / false → "có" / "không"; ba bảng nối dưới nhau, mỗi bảng một dòng tiêu đề ("Bảng 1 – Thời gian đội × bước", "Bảng 2 – Đội", "Bảng 3 – Nhật ký sự kiện thô (bảng events)") + hàng tiêu đề cột tiếng Việt. `Content-Disposition: attachment; filename="race-<race>-thoi-gian.csv"` (json: `.json`), `Cache-Control: no-store`.

## Hợp đồng cho track H (trang Host) / C (client đội)
- **H – Hoàn tác**: vẽ nút từ `state.undo` (chỉ chứa mục đang hoàn tác được; mục nào đội đã đi tiếp / có quyết định mới hơn thì máy chủ đã bỏ khỏi danh sách); gửi `reviewMessage(team, step, 'undo', id, '')`. Bị từ chối → `host.notice` warning (chữ ở trên). Sau Hoàn tác, câu trả lời về `pending` → hiện lại trong hàng chờ.
- **H – Cờ**: `teams[].flagWhy` / `flagAt`; "Xóa cờ" → `{t:'host.flag', op:'clear', team}` → `host.state` mới tới ngay (không chờ 1 s).
- **H – "Cho qua"**: `reviewMessage(team, step, 'approve', undefined, '')` nay máy chủ nhận cho mọi thử thách / nhánh đã mở hòm khi `active` / `locked`.
- **H – Xuất dữ liệu** (§17.25): `fetch('/api/race/<race>/export?format=csv' | 'json', { headers: { Authorization: 'Bearer ' + hostToken } })` → `blob()` → `URL.createObjectURL` + `<a download>` (thẻ `<a href>` thường không gửi được header). Tên tệp lấy từ `Content-Disposition` (`race-<race>-thoi-gian.csv`). 401 = token hết hạn / không phải Host.
- **C – "Vừa rời đi"**: `ZoneMember.left` (server ms rời đi; `since` = lúc vào); thứ tự trong danh sách: đang ở trước, rời đi sau (client tự sắp); máy chủ chỉ cắt mục quá `NET.zoneLeftMs` khi gửi danh sách mới → client tự ẩn dòng quá hạn. Toast `reviewUndone` tới TRƯỚC `race view` của thẻ cũ.

## Lệch kế hoạch (và vì sao)
1. Bản ghi hoàn tác ghi **trong** transaction của quyết định (kế hoạch: một dòng ngay sau): cùng 1 dòng, nhưng nguyên tử và trước mọi tin gửi (SPEC §3 "ghi trước khi trả lời"); không cần chép cache trước `apply()`.
2. `hostView().undo` lọc theo đúng điều kiện từ chối (kế hoạch: chỉ lọc theo thời gian) → Host không thấy nút chết.
3. Hoàn tác chọn bản ghi **mới nhất** khớp `team / step / id`: Phạt rồi "Duyệt câu vừa phạt" cùng câu → Hoàn tác lần 1 bỏ Duyệt (về trạng thái bị phạt), lần 2 (nếu còn trong 10 s của Phạt) bỏ Phạt. Kế hoạch không nói.
4. Kênh hòm khi hoàn tác tổng quát hơn "ẩn hòm bước kế": so hòm hiện tại trước / sau khôi phục (hòm thảm có `step` = id Chặng dừng; hòm nhánh dùng `remove` vì `hide` không bỏ hòm đã mở; hòm nhánh đã mở được gửi lại).
5. V5 "vẫn từ chối khi pending" (kế hoạch §7) hiểu là: không bao giờ tạo câu "Cho qua" khi đang có câu chờ; Duyệt không `id` lúc đó duyệt câu đang chờ như Phase 8 (test `p8-answer` dùng đường này).
6. §17.25 thêm `worker/src/index.ts` + tệp mới `worker/src/race/export.ts` (+ test) ngoài danh sách tệp ban đầu (theo yêu cầu bổ sung của điều phối). Token qua header (không `?token=`), 401 cho mọi token không phải Host (theo điều phối; route media dùng 403 cho token đội).
7. Nhật ký xuất là `events` thô, **gồm IP** của event `login` (`{ip}`) – dữ liệu của chính ban tổ chức; muốn bỏ thì lọc một dòng trong `export.ts`.
8. `// ponytail` mới: `gone` chỉ trong bộ nhớ (mất khi DO bị đuổi, M6); số giây bị khóa vẫn tính một lần đổi nhánh đã bị Hoàn tác bỏ (event `switch` còn trong nhật ký).
9. Dòng cuối commit dùng `Co-Authored-By: Claude Opus 5.5` (mô hình thực làm track S, theo cấu hình phiên) thay vì "Sonnet 5.5" trong lời giao việc.

## Ngân sách dòng SQLite (SPEC §3)
| Thao tác | Dòng | Đo |
|---|---|---|
| Duyệt / Phạt / Cho qua | như trước **+1** (`meta 'undo'`) | engine test (thứ tự ghi), budget test cả chặng vẫn ≤ 160 / đội |
| Hoàn tác một Duyệt | **6** (T1 + DELETE bước kế + event 2 + meta + teams.state) | harness `counters.rows` = 6 (≤ 7) |
| Hoàn tác một Phạt | 4 (hàng + event 2 + meta) | engine test (không ghi teams.state) |
| Xóa cờ | **3** | harness `counters.rows` đúng 3 |
| Gắn cờ | 1 / lý do mới (≤ 3 / đợt cờ) | – |
| "Vừa rời đi" | **0** | engine test (không dòng sql / event khi vào / ra) |
| Xuất dữ liệu | **0** | harness `counters.rows` không đổi |
20 đội × 10 quyết định + 5 hoàn tác + 5 xóa cờ ≈ 200 + 30 + 15 = 245 dòng thêm / cuộc đua (< 20 000).

## Kiểm thử
- `worker/src/race/steps.test.ts`: V5 (gõ chữ active + locked, nhánh auto, đang chờ → duyệt chính câu đó; teaser / chưa có câu để Phạt → từ chối).
- `worker/src/race/engine.test.ts` (RaceIO giả, thứ tự SQL → gửi): Duyệt → Hoàn tác (T1 ghi lại, L2 DELETE, event, meta, teams.state trong MỘT transaction; hideBox trước thẻ; hàng chờ / progress y như trước; lần 2 → notice); Phạt → Hoàn tác (khóa mất, câu `pending`, về hàng chờ, không ghi teams.state); từ chối: quá 10 s, đội về đích, đi tiếp (mở hòm L2), quyết định mới hơn, cuộc đua kết thúc – 0 dòng, `hostView().undo` rỗng; Phạt + N4 rồi hoàn tác hai lần; Cho qua → hoàn tác theo id câu nó tạo; hành động của đội trong 10 s bị bỏ, không `park` lần hai, engine dựng lại từ `meta 'undo'` vẫn hoàn tác; Hoàn tác Duyệt bài ảnh nhánh: hòm thảm ẩn, hòm nhánh đã mở gửi lại; "vừa rời đi": đi ra / quay lại / mất kết nối / đội ở bước xa hơn không hiện / hết `NET.zoneLeftMs` biến mất / 0 dòng.
- `worker/src/race/export.test.ts` (thuần, mốc giả): các cột thời gian (UTC, giờ VN, giây từ mở cuộc đua, từ bước trước), số giây khóa (cắt ở lúc xong / lúc xuất), bảng đội, nhật ký, không lộ câu trả lời / ghi chú / đáp án, CSV (BOM, CRLF, nháy kép, chống công thức, có / không).
- `worker/src/RaceRoom.phase10.test.ts` (workerd): (a) Duyệt → Hoàn tác: đội nhận `reviewUndone` + thẻ T1 `pending` < 1 s, 6 dòng (≤ 7), `host.state.undo` rỗng, hàng chờ có lại, chỉ có `box hide L2` (không lộ hòm bước sau), L2 bị xóa khỏi SQLite, event `review` + `host.undo`; hoàn tác lần 2 → notice; Phạt rồi hoàn tác sau 10 s → từ chối; `host.review undo` từ socket đội → đóng 4400. (b) đi tiếp (mở hòm L2) → từ chối. (c) cờ: 20 m/s → `flagWhy ['speed']` + `flagAt` → Xóa cờ = 3 dòng, `host.unflag {why, since}`, xóa lần 2 → warning, đội lạ → error; nhảy 2 km → gắn lại `['jump']`, `flagAt` mới. (d) "vừa rời đi": B thấy A có `left` khi A đi ra / mất kết nối, không `left` khi A quay lại. (e) xuất: 401 không token / token đội, 400 format sai, json = hàng SQLite, csv BOM + tiêu đề, không lộ "BÍ MẬT" / đáp án tham khảo, 0 dòng. (f) sau khi DO bị đuổi: xuất ra y như trước, `host.state.undo` còn, Hoàn tác được, đội vào lại thấy thẻ T1 `pending`.
- Trong lúc làm: `worker` vitest 17 tệp / 172 test xanh (154 trước + 18 mới), `tsc -p worker` sạch.
- Lần cuối từ gốc worktree: `npm run build` **xanh** (tsc 4 gói + vite + `wrangler deploy --dry-run`); `npm test`: scripts 113, shared 79, worker 172 xanh; client 742 / 743 – hỏng duy nhất `client/src/geo/gps.test.ts` "search time ≤ 5 ms median" (đo 5,51 ms lúc máy tải, load ≈ 12–20; không chạm tệp client nào), chạy lại riêng → 10 / 10 qua (cùng hiện tượng báo cáo nền đã ghi).

## Cần kiểm tay (sau khi ghép H + C)
- `npm run dev:api` + 2 trình duyệt đội + trang Host: Duyệt → Hoàn tác (toast + thẻ cũ + hàng chờ), Phạt → Hoàn tác (đếm ngược mất), Cho qua một thử thách gõ chữ, Xóa cờ (và gắn lại khi vi phạm tiếp), hai đội vào / ra một điểm ("vừa rời đi n phút trước", tự tăng phút).
- Nút "Xuất dữ liệu thời gian" (track H) tải về; mở CSV bằng Excel (Windows + macOS, locale tiếng Việt): dấu tiếng Việt đúng (BOM), cột tách đúng bằng dấu phẩy, giờ Việt Nam đúng.

## Việc tài liệu khi tích hợp (không thuộc tệp của S)
- `CLAUDE.md` dòng `worker/`: "undo 10 s (meta 'undo'), host.flag clear, export /api/race/<id>/export (race/export.ts)".
- `docs/RACE_RULES.md` (Hoàn tác 10 s, "vừa rời đi", cờ đỏ xóa được), `TODO.md` (xóa các dòng Phase 10 đã làm; ghi tồn M4 / M6 / IP trong nhật ký xuất), `docs/reports/HANDOFF.md`. `docs/LEG_FORMAT.md` không đổi.
