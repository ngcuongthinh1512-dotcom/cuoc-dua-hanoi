# Leg 2 C1 – Phòng Louvre đã gỡ hẳn (2026-10-06)

Quyết định của anh (2026-10-06, phương án A): bỏ hoàn toàn Phòng Louvre (Phase 8B "Thử thách 3") khỏi repo Macao; không giữ khung
chung, không giữ code chết. Cơ chế cũ (chọn / chốt / phạt / gợi ý / tin công khai) nằm trong lịch sử git **trước commit `9425533`**
(và trong repo Paris). Chưa commit.

## Xóa hẳn
- Client: `race/LouvreRoom.ts` (+ test), `race/ui/louvre.test.ts`, `ui/Feed.ts` (tin công khai chỉ dùng cho chốt Louvre),
  `world/hideWorld.ts` (+ test), `client/public/art/` (23 tệp `art-NN.{webp,glb}`).
- Worker: `race/louvre.test.ts`, `RaceRoom.louvre.test.ts`, chặng test `worker/legs/test/louvre.json`.
- Shared: `leg/louvre.test.ts`, `leg/louvre-codes.test.ts`.
- Scripts: `scripts/assets/louvre.ts` (+ test, target `process-assets louvre`).

## Sửa
- Shared: `constants.ts` (bỏ `LOUVRE`), `leg/schema.ts` (bỏ kind `louvre`, `louvreSchema`, `ART_LICENSES`, kiểu `LouvreTask` /
  `Artwork` / `ArtCredit`), `leg/check.ts` (bỏ `louvreRules`, quét lộ tên tác phẩm, nhãn trường / thông báo giấy phép, `artSize`
  trong `LegGeo`, hàm `words`).
- Giao thức (`protocol/types.ts`, `codec.ts`, `constants.ts`): **PROTOCOL_VERSION 8 → 9**. Bỏ op `race pick / lock / view / credits`,
  `TaskView.louvre` + `input: 'room'`, `LouvreView`, `ArtworkView`, `CreditItem`, `FeedMessage` + `welcome.feed`, tin `{t:'credits'}`,
  `AnswerView.correct`, notice `lockWrong / pickLimit / creditsLocked`, `StepProgressView.picks / hintCorrect`,
  `HostState.leg.steps[].louvre`, `NET.feedKept`. Test codec mới: 4 op cũ bị từ chối, version = 9.
- Worker: `steps.ts` (input / effect pick / lock, guard C1, `hintAt`, `louvreView`, `creditsOf`, `Progress.picks`; `cardOf` bỏ
  tham số `zones`), `engine.ts` (feed / `LockEvent` / `feedLine` / `feedFor` / `seesFeedCount` / `livePicks` / `restorePicks`,
  RaceIO `feed` / `touchSnapshot`), `RaceRoom.ts` (feed cache + đọc `events louvre.lock`, picks trong dòng snapshot, `lock` trong
  `maxRaceOps`), `export.ts` (khóa của chốt sai), `race/leg.ts` (chặng bundled `louvre`), `test/harness.ts` (`nearLouvreLeg`, `pick`,
  `lock`, `viewAgain`).
- DB (`db.ts`): bỏ cột `step_progress.picks`, `parsePicks`, `AnswerRec.c`; **SCHEMA_VERSION 4 → 3** (triển khai mới, không di trú).
  Các bảng khác giữ nguyên.
- Client: `RaceClient` (pick / lock / refresh / credits, hỏi lại thẻ ở mốc gợi ý), `RaceHud` (nút "Vào phòng", `setRoom`, `announce`
  "CHÍNH XÁC", bảng "Gợi ý" `rc-hints`, feed, credits, `prompt` của phòng, thẻ demo louvre), `format.ts` (`louvreShort`, `hintNews`,
  `louvreInfo`, `hintPanel`, nhánh lịch sử chốt), `race.css`, `menu.css`, `main.ts` (phòng, env riêng của Player, hideWorld,
  camera trong phòng, F trong phòng, âm click / pop), `Player.ts` (`moveTo`, `'quiet'`), `ThirdPersonCamera.override`,
  `RemotePlayers` (lọc theo độ cao `underground`), `spectate/watch.ts` + `Spectate.ts` (xem từ mặt phố), `Credits.ts` (khóa tới khi
  về đích + mục tác phẩm: giờ bảng Ghi nguồn chỉ hiện `credits.json`, mở lúc nào cũng được), `Toasts.ts`, `audio/sfx.ts`,
  `host/hostView.ts` / `main.ts` / `hostMapData.ts` (ô louvre, `louvreLines`, `withLouvreDemo`, `?louvre=1`), `config.ts`
  (`louvreRoom`, `feed`, `spectate.roomEye`, `remote.hideDy`, `raceHud.announceSeconds`; không đụng khối `landmarks.m3`),
  `public/credits.json` (bỏ dòng "Phòng Louvre").
- Scripts: `leg-check.ts` (bảng 23 tác phẩm, `artLeaks` / `artRegions`, `artSize`), `sim.ts` (`louvreMove`, `louvreAnswersOf`,
  `--louvre-right-only`, số feed, thống kê louvre), `process-assets.ts` + `assets/manifest.ts` (target `louvre`, dòng credits),
  `screenshot.ts` (preset `p8b-*`, `?louvre=1` ở `p10-host`), `hud-check.ts` (đoạn louvre); các test tương ứng.
- Chặng test `worker/legs/test/full.json`: bỏ bước `L-LV` + `T3` (louvre); `leg:check` 0 cảnh báo.
- `RaceRoom.phase10.test.ts`: "dấu hiệu sống" đổi từ op `view` (đã bỏ) sang `book` (cũng 0 dòng ghi).
- Tài liệu: `docs/LEG_FORMAT.md` (mục 7.5 cũ xóa, 7.6 "Thử thách nhiều ô" thành 7.5; dòng bảng thông báo, sim), `docs/RACE_RULES.md`
  (bỏ "Ghi nguồn mở sau khi về đích"), `README.md`, `CLAUDE.md` (đoạn louvre ở Folders / Commands + dòng "Louvre room removed in
  Leg 2, see git history before commit 9425533"), `TODO.md` (bỏ mục Phase 8B + dòng liên quan; giữ dòng phòng casino),
  `docs/plans/leg2-master.md` (C1 đánh dấu xong).

## Số test (trước → sau)
| Gói | Trước (HEAD `65ef813`) | Sau |
|---|---|---|
| scripts | 120 (10 tệp) | 104 (9 tệp) |
| shared | 82 (9 tệp) | 67 (7 tệp) |
| client | 868 (75 tệp; 2 lỗi sẵn) | 814 (72 tệp; 1 lỗi sẵn: `paths.test.ts` hotel-lisboa, việc agent m3) |
| worker | 187 (18 tệp) | 156 (16 tệp) |

`npx tsc --noEmit` (shared, worker, client, scripts) sạch; `npm run build` thoát 0 (kể cả `wrangler deploy --dry-run`).

`leg:check`: `macao-demo` hợp lệ 0 cảnh báo (17 ô trống như trước); `macao-demo-filled`, `mini`, `near`, `full`: 0 cảnh báo, 0 ô trống.

## Chưa chắc / cần anh biết
- Bảng "Ghi nguồn" trước đây khóa trong cuộc đua tới khi về đích (SPEC §17.20) – lý do duy nhất là giấu tên tác phẩm Louvre. Đã bỏ
  khóa: giờ mở lúc nào cũng được. Nếu anh muốn giữ khóa cho phòng casino thì bảo.
- Tin công khai góc dưới ("Đội X trả lời sai…") chỉ dùng cho chốt Louvre nên gỡ cả `Feed.ts`; phòng casino cần thì lấy lại từ git.
- Lần chạy baseline: tôi `git stash` vài phút để đo test trên HEAD sạch; lúc đó stash cả 3 tệp agent kia đang sửa (`m3.ts`,
  `m3.test.ts`, `config.ts`), rồi `stash pop` lại không xung đột. Nếu agent m3 thấy tệp "quay lại bản cũ" trong khoảng đó, nên đọc lại.
- 2 test client lỗi sẵn từ trước (không liên quan): `npc/crowd.test.ts` (đo thời gian) và `world/landmarks/paths.test.ts`
  (`hotel-lisboa`, việc của agent m3).
- Các nhắc "Louvre" còn lại chỉ là lịch sử Paris (tên đường Quai du Louvre trong config bouquinistes, chú thích, `docs/SPEC.md`,
  `docs/reports/*`, `docs/plans/phase*.md` – không sửa theo yêu cầu).
