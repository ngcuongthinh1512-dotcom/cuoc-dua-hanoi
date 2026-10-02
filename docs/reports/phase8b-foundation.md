# Phase 8B – Nền hợp đồng (phòng Louvre – Thử thách 3)

Trạng thái: **xong** (2026-10-03). Kế hoạch: `docs/plans/phase8b.md` §J "Nền". `npm run build && npm test` qua: shared 71, client 695, scripts 75, worker 136 test (tổng 977; chỉ thêm, 0 skip). Commit `feat(phase8b): nền hợp đồng (schema louvre + giao thức v4 + DB v4)`.

## Đã làm
1. **Schema** (`shared/src/leg/schema.ts`): `TASK_KINDS += 'louvre'`; `LOUVRE` (23 / 5 / maxPicks 5 / `artId` / `artFile` `art-NN.webp|glb` / 300 KB / 1 MB); `ART_LICENSES` (PD, PD-Art, CC0, CC-BY, CC-BY-SA, CC-BY-NC, CC-BY-NC-SA, MIT); `task.louvre = { artworks[23] {id, type, image, note, credit?{title, artist, photo, license, source}}, hints {countAtMinutes 40, correctAtMinutes 70} }`; kiểu `LouvreTask`, `Artwork`, `ArtCredit`. Mọi trường mới tùy chọn → chặng cũ không đổi.
2. **check.ts** luật 1–8 (`louvreRules`) + luật 4 trong vòng quét lộ đáp án (bí mật của bước louvre = `credit.title` + `note` của 5 tác phẩm đúng; id không quét); nhãn tiếng Việt; thông điệp zod cho `image` / `source` / `license`; `LegGeo.artSize?` (CLI) cho luật 3 tệp tĩnh; `words()` xuất ra. Luật 9 trong CLI (`scripts/leg-check.ts`): `secretStrings` + `artLeaks` (credits.json nguyên chuỗi ≥ 4 ký tự; bytes `client/public/art/*` theo từ ≥ 4 chữ, có dấu và không dấu).
3. **Giao thức v4** (`shared/src/protocol`): op `pick` / `lock` / `view` / `credits`; `ArtworkView`, `LouvreView`, `CreditItem`, `FeedMessage`; `TaskView.louvre?`, `TaskView.input += 'room'`; `AnswerView.correct?`; `Welcome.feed`; `{t:'credits'}`; notice `lockWrong` / `pickLimit` / `creditsLocked`; `StepProgressView.picks / hintCorrect`; `HostState.leg.steps[].louvre.hints`; `NET.feedKept = 20`; `PROTOCOL_VERSION = 4`. Test: codec vòng tròn + từ chối hình dạng sai.
4. **DB v4** (`worker/src/db.ts`): `step_progress.picks TEXT NOT NULL DEFAULT '[]'` (ALTER, `if (v < 4)`), `parsePicks`, `AnswerRec.c?`; test v3 → v4, migrate hai lần.
5. **config.ts**: `louvreRoom` (track B), `feed` (`corner` mặc định `bottom-left`, `lines` 5, `seconds` 90 – track C), `remote.hideDy` 10.
6. **Stub / điểm gắn**: xem "Hợp đồng" dưới.
7. **Chặng test** `worker/legs/test/louvre.json` (GIẢ, đóng gói id `louvre`): xuất phát Bir-Hakeim → `L-LV` (Cour Napoléon, yawDeg 90) → `T3` louvre (23 tác phẩm `art-01…23`, 15 tranh / 8 tượng, 6 có `image` + `credit` giả đủ loại giấy phép, đáp án GIẢ `art-17, art-03, art-21, art-08, art-12`, hints 0.05 / 0.1) → `L3` → `PS` (Arc du Carrousel); `penalties.retryLockMinutes` 0.1. `leg:check`: 0 lỗi, 1 cảnh báo (phạt test), 17 + 6 ô trống. Harness `nearLouvreLeg(gap, footSpeed)` (điểm cách 60 m, hints 3 s / 6 s, phạt 6 s).
8. **Preset** `p8b-room`, `p8b-room-button`, `p8b-room-lock`, `p8b-card-louvre`, `p8b-feed`, `p8b-credits`, `p8b-host` (tham số giữ chỗ; `npm run screenshot -- p8b`).
9. **LEG_FORMAT.md**: §7.1 (`verification` louvre, trường `louvre`, kiểu `louvre`), §7.4 (kẹt vẫn áp dụng, ngoại lệ "không gợi ý"), §7.5 mới (bảng trường, luật, giấy phép, ví dụ GIẢ).

## Lệch kế hoạch (và vì sao)
- **`louvreView` / `creditsOf` / `hintAt` / `cardOf` louvre đã làm thật** (thuần, chỉ đọc) thay vì chỉ chữ ký: cần để viết leak test của giao thức (yêu cầu nền) và để B / C có thẻ thật qua harness. Máy trạng thái `pick` / `lock` (advance + apply) **không** làm.
- **`engine.onOp`**: `view` và `credits` làm đầy đủ (vài dòng: cổng trạng thái + cổng về đích); `pick` / `lock` đi qua `this.step` nhưng `advance` trả im lặng (TODO track A).
- **`hostView`** đã điền `picks`, `hintCorrect` (qua `louvreView`), `answers[].correct`, `leg.steps[].louvre.hints` (bắt buộc để kiểu biên dịch; A có thể chỉnh).
- **Chặng test** không phải "mini + L-LV" mà ngắn 4 bước (Bir-Hakeim → Louvre → Arc du Carrousel): bài test "mọi chặng đóng gói xuất phát ở Bir-Hakeim" vẫn qua, bot sim không phải đi hết mini (≈ 4 km thay vì ≈ 7 km). Được **đóng gói** (`host.leg {id:'louvre'}`, `sim --leg louvre`).
- **`TaskView.input += 'room'`** (không có trong kế hoạch): thẻ louvre không hiện ô gõ mà không cần sửa `cardPanel` (`answerBox` chỉ khi `'text'`).
- **Luật 4** quét nguyên chuỗi (đã chuẩn hóa) của `credit.title` / `note`, không quét từng từ: từ ≥ 4 ký tự như "tranh", "tượng" sẽ báo nhầm vào mô tả. Luật 5: "5 mục đầu / cuối" là trường hợp riêng của "liền nhau (vòng)" nên một kiểm tra.
- **`maxPicks`** là hằng `LOUVRE.maxPicks` (SPEC "tối đa 5"), không là trường chặng.
- **RemotePlayers**: ẩn |Δy| > `remote.hideDy` chỉ khi truyền `feetY` (tham số mới, tùy chọn) để khán giả bay cao không mất ai; main.ts chưa truyền (track B).
- **`sim.test.ts`**, `hostView.ts` demo, hai fixture `Welcome` trong test client: thêm trường bắt buộc mới (`picks`, `hintCorrect`, `feed`).

## Hợp đồng cho từng track
**A – máy chủ** (`steps.ts`, `engine.ts`, `RaceRoom.ts`, harness):
- `advance`: thay dòng `if (input.kind === 'pick' || input.kind === 'lock') return silent;` bằng chuyển trạng thái theo §E (đã có `RaceInput` pick / lock, `RaceEffect` pick / lock với đủ trường, guard C1 đã có ngay trước `stateOf`). `hintAt(leg, i, row, now)` dùng cho mốc 40 (`pickLimit`) và `public`.
- `engine.apply`: effect `pick` → `row.picks = JSON.stringify(picks)` trong **cache** (không ghi SQLite) + hẹn snapshot; effect `lock` → ghi dòng (answers với `c`, `picks`, `rejections`, `locked_until`), sự kiện `louvre.lock {ok,k,c,public,slot}`, notice `lockWrong` / `clueNew`, rồi feed. Thêm `RaceIO.feed(m)` / `touchSnapshot()`.
- `RaceRoom`: `welcome.feed` (đang `[]`, TODO), dựng feed từ `events` khi thức, `picks` trong JSON snapshot. `lock` đã đếm `maxRaceOps`; `view` / `credits` không đếm, đã trả lời mọi trạng thái.
- `cardOf(leg, i, row, now, zones?)`: louvre đọc `row.picks` → giữ picks sống trong cache dòng là đủ, thẻ / Host tự đúng.
- Test có sẵn: `worker/src/race/louvre.test.ts` (không rò ở 4 trạng thái, mốc, `correct` sau 70, 2 đội, C1, `creditsOf`, `nearLouvreLeg`).

**B – phòng + ghép client** (`race/LouvreRoom.ts`, `RaceClient.ts`, `main.ts`, `Player.ts`, `RemotePlayers.ts`):
- `LouvreRoom` chữ ký: `active`, `step`, `floorY`, `build(scene, step, view, groundY)`, `enter()`, `leave()`, `inside(x,y,z)`, `setPicks(picks)`, `nearest(x,z,dx,dz) → RoomTarget`; `wallSlots(artworks) → RoomSlot[]` thuần. Cấu hình `louvreRoom` trong `config.ts`.
- `RaceClient.pick(step, art, on)` / `lock(step)` (qua `op`, pose trước) / `refresh()` / `credits()` đã có; TODO: `frame()` gửi `refresh()` một lần ở `hintAt[i] + lockEndSlackMs`.
- `RemotePlayers.update(dt, now, viewer, feetY?)`: main.ts truyền chân người chơi ở chế độ người chơi.
- Thẻ: `card.task.louvre` (`LouvreView`), `card.task.input === 'room'`, `card.retryPenaltyMinutes`; preset `p8b-room*`.

**C – HUD** (`race/ui/*`, `ui/Feed.ts`, `ui/Toasts.ts`, `ui/Credits.ts`, `ui/Menu.ts`):
- `RaceHud.feed(ms, teams)` (gọi từ welcome + mỗi `{t:'feed'}`) → `Feed.push`; `Feed.ts` có `feedText(m, teams)` + `class Feed` rỗng. `RaceHud.credits(items)` rỗng (nhận `{t:'credits'}`).
- `cardPanel(...).louvre: LouvreView | null` (đã có; `answerBox` false cho louvre); `AnswerView.correct` chỉ có sau mốc 70.
- Toast `lockWrong` / `pickLimit` / `creditsLocked` đã có chữ (có thể dùng `toast(text)` để ghi số phút); cấu hình `feed`; preset `p8b-card-louvre` / `p8b-feed` / `p8b-credits`.

**D – Host + công cụ + tài liệu**:
- `HostState.leg.steps[].louvre.hints` ([40, 70] phút), `StepProgressView.picks`, `.hintCorrect` (sống), `.answers[].correct`; `demoState` đã có `picks: [] / hintCorrect: null` mặc định.
- `leg:check`: luật 1–9 đã chạy; còn bảng 23 tác phẩm trong báo cáo CLI + lời nhắc "23 tệp tĩnh". `sim --leg louvre` dùng id đóng gói; LEG_FORMAT §7.5 đã có (D bổ sung §13 sim). Preset `p8b-host`.

## Chưa làm (thuộc track)
Máy trạng thái pick / lock + feed + snapshot (A); phòng 3D, F, env Player, `?louvre=1` (B); vẽ thẻ / feed / Ghi nguồn, `?card=louvre`, `?feed`, `?credits=louvre` (C); ô Host, sim bot, process-assets `louvre`, RACE_RULES (D).
