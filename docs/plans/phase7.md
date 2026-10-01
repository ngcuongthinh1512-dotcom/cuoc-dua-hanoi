# Phase 7 – Race engine lõi: kế hoạch

Nguồn: SPEC §6.4–6.6 (bãi xe, luật phương tiện), §8 toàn bộ (máy trạng thái, geofence, hộp mật thư, mật thư, Chặng dừng, vào lại, Sổ mật thư), §9 (chỉ để chừa móc), §10 (file chặng, bỏ `roadblock`), §12–13 (HUD, Host: phần Phase 7 cần, §13.6 bảng tiến trình, §13.8 xếp hạng), §14, §15 (Phase 7), §17.4, §17.9–17.12 (bắt buộc); CLAUDE.md; TODO.md mục Phase 7 + phần còn lại Phase 6; `docs/plans/phase6.md`, `docs/reports/phase6-*.md`, `docs/reports/HANDOFF.md`.

Yêu cầu của anh (2026-10-01): "tiếp tục phase 7, chừa lại phần Lộ trình và thử thách ở cuối, anh sẽ bắt đầu input". Vì vậy engine **không phụ thuộc nội dung**: mọi điểm, mật thư, nhiệm vụ đọc từ file chặng; anh nhập nội dung thật sau cùng theo `docs/LEG_FORMAT.md`, kiểm bằng `npm run leg:check`, nạp qua trang Host. Không ai tự điền nội dung thật.

## 1. Phạm vi

- **Có:**
  - schema zod của file chặng trong `/shared` (không có `roadblock`), thông báo lỗi tiếng Việt chỉ đúng bước / trường; nạp chặng vào SQLite của Durable Object (chặng đóng gói sẵn hoặc file Host chọn);
  - máy trạng thái từng đội (§8.1) cho 4 loại bước: `route_info`, `detour`, `challenge`, `pit_stop`; geofence ở server bằng vị trí hợp lệ cuối; mở hộp mật thư bằng `F` (§8.2–8.3); bảng `step_progress` ghi mốc thời gian (§8.1);
  - hộp mật thư hiện dần theo bước (§17.10) nối với trạng thái thật (`teams.state.step`); thảm Chặng dừng + NPC dẫn chương trình + check-in + chờ hết phạt (§8.6); xếp hạng (§13.6, §13.8);
  - đồng hồ từng đội tính từ giờ Host nhập (§17.12), `welcome.raceTime`; thứ tự vào game `startOrder` + "Xuất phát ở vị trí thứ n" một lần (§17.12); điểm xuất phát từ file chặng (cầu Bir-Hakeim), rải các đội quanh điểm;
  - Sổ mật thư (`Tab`, §8.11), thẻ mật thư (góc trên trái + thẻ đầy đủ khi nhận mật thư mới), toast phản hồi từng bước, đồng hồ + phút phạt trên HUD;
  - Host tạm dừng / tiếp tục / mở / kết thúc cuộc đua (không trừ giờ tạm dừng – quyết định của anh);
  - nhiệm vụ **tạm cho qua tự động**: nút "Hoàn thành (tạm)" trên thẻ, server chỉ kiểm đúng bước + đúng vùng (Phase 8 thay bằng chấm thật, không đổi schema);
  - bãi xe cạnh điểm được kích hoạt (§6.4: `park()` khi nhận mật thư nhiệm vụ / lộ trình bắt buộc đi bộ), chặn lấy xe khi lộ trình bắt buộc đi bộ (§6.5);
  - `npc.setExclusionZones` theo hộp / thảm (§17.5); `openBox` khi mở hộp, `celebrate` khi check-in, sau đó chế độ khán giả;
  - **cách nhập chặng an toàn cho anh**: `docs/LEG_FORMAT.md` (tiếng Việt, ví dụ đầy đủ, giải thích từng trường), `npm run leg:check <file>` (zod + bán kính 15–40 m + trong bản đồ + không nằm trong nhà + đi bộ tới được từ điểm trước + thứ tự bước + không lộ đáp án / không nằm trong static asset), chặng demo + chặng test có nội dung giả trong `worker/legs/test/`;
  - trang Host tối giản thêm: nhập giờ xuất phát từng đội, nút trạng thái cuộc đua, nạp chặng, bảng `step_progress` dạng ma trận, xếp hạng; bot `npm run sim` chạy hết chặng `mini`;
  - nếu còn rẻ: bảng "Tại điểm này" (ZonePanel, §7) bản tối giản.
- **Không có (để sau):**
  - Phase 8: thư viện mini-game §11, chấm đáp án (chuẩn hóa, khóa 30 s), chọn / đổi nhánh Lựa chọn kép có mất tiến độ, "Nhận thử thách" sau câu gợi ý, luồng Host duyệt + hàng chờ duyệt, bỏ cuộc;
  - Phase 9: Quay đầu, Nhường đường, Vé vượt, Vé ưu tiên, Gờ giảm tốc, phạt bắt buộc đi bộ (từ `SpeedWindow`), phạt bỏ cuộc;
  - Phase 10: màn hình Host đầy đủ (soạn nội dung, lịch sử phiên bản, khóa bước đã mở, bản đồ, nhật ký, "Công bố kết quả", phạt thủ công, dịch chuyển người chơi kẹt, "vừa rời đi n phút trước" ở ZonePanel, bù giờ chờ duyệt hiển thị);
  - Phase 11: bot đủ 10 bước có tình huống; Phase 12: đo request / dòng ghi thật.

## 2. Kiểm tra đầu vào (đo ngày 2026-10-01)

### 2.1 Điểm xuất phát cầu Bir-Hakeim
- Landmark `bir-hakeim` (`way/183602168`) trong dữ liệu chunk là polygon `kind: 'bridge'` ở chunk `-10_4`. **Centroid OSM: 48.85569, 2.28758** = world (−2463,5; 1088,6). Đó chính là lối đi bộ giữa cầu ("Promenade Jean-Paul Belmondo", layer 1), **ngay dưới cầu cạn metro số 6** (layer 2, hai đường ray cách tâm 1,1 / 1,7 m, cao hơn mặt cầu `railLayerStep` = 6 m). Hai lòng đường "Pont de Bir Hakeim" cách tâm 6,6 m và 8,0 m (cách tim metro 5,5 / 6,3 m).
- Không nằm trong tòa nhà nào (chỉ trong polygon cầu). Nút đi bộ gần nhất 12,1 m, thuộc thành phần đi bộ chính của đồ thị. Đường đi bộ A* Bir-Hakeim → L1 (Khải Hoàn Môn) **2 286 m** (chim bay 2 088 m), 3 ms.
- **Chụp thử** (`/?player=-2463.5,1088.6,150&camMode=far&debug=1`): người chơi **đứng trên nóc cầu cạn metro** (F3: chân y = 7,22 m). Lý do: `CharacterController.surface()` lấy mặt đi được **cao nhất** dưới tia bắt đầu từ `max(địa hình, mặt sông) + spawnCastHeight` (12 m); tại đây tia bắt đầu cao hơn sàn metro (7,3 m), tức địa hình dưới cầu (mũi đảo Thiên Nga / kè) cao hơn mặt sông. Hệ quả: spawn lần đầu tại điểm xuất phát, vào lại khi đang đứng trên lối đi dưới cầu cạn, và hộp mật thư đặt trên cầu này (ClueBoxes cũng dò từ trên xuống) đều lên nóc metro → **track B sửa** (D17).
- Hướng cầu: đầu bờ phải (Passy) ở tây bắc (−2534, 994), đầu bờ trái ở đông nam (−2402, 1196). Hướng nhìn ban đầu về Passy = yaw 33° (`start.yawDeg`).

### 2.2 Chặng test `mini` (nội dung giả) và các điểm demo
| Điểm | Tọa độ | Trong nhà? | Cách đường đi bộ (nút) | Đi bộ từ điểm trước |
|---|---|---|---|---|
| Xuất phát Bir-Hakeim | 48.85569, 2.28758 | không | 12,1 m | – |
| Sân Palais de Chaillot (L2 demo) | 48.86215, 2.28843 | không | 1,1 m | 915 m |
| Chân tháp Eiffel (L3 demo) | 48.8583, 2.2945 | **trong footprint `tower:eiffel`** | 33,3 m | 879 m |
| Giữa cầu Iéna | 48.8596, 2.29243 | không | 33,6 m | 439 m |
- Footprint `building=tower` của tháp Eiffel **không được dựng khối đặc** (SPEC §17.4: chỉ 4 chân, sân dưới tháp đi bộ được) → `leg:check` phải bỏ qua nó (cùng với `kind: 'bridge'`), nếu không sẽ báo sai "nằm trong nhà".
- Khoảng cách tới đồ thị phải đo tới **cạnh** gần nhất (`nearestEdge`), không phải nút: trên cầu Iéna nút cách nhau ~100 m nên "33 m" là giả.

### 2.3 zod
- `zod` 4.6.5 (mới nhất). Có sẵn locale `vi` nhưng thông báo lẫn tiếng Anh ("mong đợi số, nhận được string") → tự viết thông báo cho mọi mã lỗi (`shared/src/leg/check.ts`), không dùng locale.
- `strictObject`: trường gõ sai tên ("radious") bị báo "có trường lạ", không lặng lẽ bỏ qua. `.default()` / `.prefault()`: file chặng chỉ cần `id`, `title`, `start`, `steps`; các khối khác lấy giá trị của chặng demo.
- Bundle: worker 861 KiB (gzip 146 KiB; giới hạn gói Free 3 MB); client **không có zod** (`grep ZodError client/dist` = 0) vì client chỉ `import type`.

### 2.4 Code hiện có
- `RaceRoom.ts` (607 dòng): `TeamState` trong `teams.state` JSON, `liveOf()` đặt đội chưa từng thấy ở điểm xuất phát, `checkBoxes()` mỗi 2 s dùng `stepBox(teamState.step)` của `demoLeg`; `welcome.raceTime: null`; `bikes.onTeam(…, walkOnly=false)`.
- `BikeService.park(team, rack, now)` đã viết (Phase 6) nhưng chưa ai gọi; xe đứng nguyên chỗ (chưa dời về bãi).
- `ClueBoxes` (client) vẽ hộp từ `welcome.boxes` + `box reveal/hide`; `Npc.setExclusionZones` có sẵn; clip `openBox` / `celebrate` có sẵn; phím `clueBook` = `Tab` đã có trong `config.keys`.
- `Player.update`: `F` → `bikes.interact` (chưa có móc cho hộp mật thư).
- Test Phase 6 (`RaceRoom.live.test.ts`) giả định điểm xuất phát = gốc tọa độ (obelisk) → nền đã đổi sang tọa độ tương đối với điểm xuất phát của chặng.

## 3. Quyết định

**D1. Package: chỉ thêm `zod` ^4.6.5** vào `dependencies` của `@race/shared` (gói duy nhất được duyệt). Worker đóng gói nó; client chỉ `import type` từ `@race/shared/leg` (đã kiểm: bundle client không có zod). Không thêm gì khác.

**D2. Máy trạng thái (SPEC §8.1), con trỏ `teams.state.step` = chỉ số bước hiện tại.** Đội luôn "đang giữ" mật thư của bước hiện tại. Bảng:

| Loại bước | Đội nhận mật thư bước này khi | Vùng (zone) làm bước | Hoàn thành khi |
|---|---|---|---|
| `route_info` | bước trước hoàn thành (bước 1: ngay khi vào game, D3) | `destination` của nó | vào vùng + bấm `F` ở hộp (không ngồi trên xe) |
| `route_info` ngay trước `pit_stop` | như trên | **vùng Chặng dừng** | **vào vùng Chặng dừng** (không cần mở hộp) |
| `detour` / `challenge` | bước trước hoàn thành (thường là mở hộp lộ trình) | `task.location` nếu có, không thì vùng của bước trước (nhánh: `branch.task.location`) | gửi nhiệm vụ trong vùng và `verifyTask` = `pass` (Phase 7: luôn pass) |
| `pit_stop` | bước trước hoàn thành | `destination` (thảm) | đứng trên thảm khi đã hết phút phạt = **giờ về đích** |

  - Một đầu vào (vị trí hợp lệ / thao tác) có thể đi qua nhiều chuyển trạng thái liền (vào vùng Chặng dừng → xong lộ trình cuối → tới thảm → check-in nếu không có phạt).
  - Hàm thuần `advance(leg, zones, progress, input, now, verify)` → `{progress, effects}` (`worker/src/race/steps.ts`, test không cần workerd). `RaceEngine` áp dụng effect: **ghi SQLite trước** (`step_progress`, `teams.state`, `events`) trong `ctx.storage.transactionSync`, **rồi** mới gửi `race` / `box` / `notice` (SPEC §3). DO xử lý tin tuần tự nên không có hai chuyển trạng thái chen nhau.
  - Mọi thao tác bị từ chối không ghi gì (không tốn dòng ghi), chỉ trả `notice`.

**D3. Bước 1 và giờ nhận mật thư.** Đội nhận mật thư đầu tiên ở ngoài game (§17.12), nên trong game đội **giữ mật thư bước 1 ngay từ lần vào đầu tiên** (Sổ mật thư có nó). `clue_opened_at` của bước 1 = giờ xuất phát Host nhập, nếu chưa có thì giờ vào game lần đầu (`joinedAt`); các bước sau = `completed_at` của bước trước.

**D4. Geofence ở server dùng "điểm tin cậy" `valid`, đi theo vị trí với tốc độ có giới hạn** (sửa sau phản biện: bản trước tin `live.valid` của Phase 6, nhưng `valid` **không** được kiểm tốc độ thật: đứng im > 3 s rồi gửi 1 vị trí cách 2 km → cửa sổ `SpeedWindow` chưa đủ mẫu nên `overSpeed = false`; vị trí đầu sau khi vào lại và `respawn` cũng đặt `valid` bất kể khoảng cách → client sửa có thể nhảy vào mọi vùng, mở hộp, chạy hết chặng trong vài giây, và dò hộp bằng kênh 150 m).
  - **Một chỗ sửa, mọi đường đều đi qua** (track A, `RaceRoom.onPose` + `respawn`): `valid` (x, z) = `TrustedPoint` (`shared/src/protocol/speed.ts`, nền, có test). Mỗi vị trí: ngân sách mét được nạp lại `rate` = `footSpeed × bikeSpeedMultiplier × NET.speedTolerance` m/s theo thời gian server, trần `rate × NET.speedLeadMs` (≈ 13 m: vị trí dồn cục sau khi mạng khựng ≤ 2 s vẫn qua hết); điểm tin cậy chỉ đi tới vị trí mới **trong giới hạn ngân sách**, phần dư > 0 → `teleport()` (sự kiện có trần + cờ đỏ). Không bao giờ "kẹt": đội thật bị tụt lại (mạng khựng lâu) được kéo theo với tốc độ `rate`.
  - Cấp thêm (`grant`): **vào lại / vị trí đầu của cửa sổ mới** = thời gian vắng mặt × tốc độ xe (đúng luật Phase 6 §8.10, giờ áp vào điểm tin cậy thay vì chỉ ghi cờ); **`respawn` ≤ `NET.respawnTrust` (30 m)** (bậc kè, chỗ "Kẹt?", rơi xuyên đất đều gần) → nhận ngay; `respawn` dài hơn → như một vị trí thường (điểm tin cậy đi theo dần) + `teleport()`. Client vẫn hiện ở chỗ nó tự đặt; chỉ geofence / kênh hộp / snapshot / `welcome.pose` dùng điểm tin cậy (vào lại sau khi nhảy = về chỗ tin cậy).
  - `SpeedWindow` + cờ `speed` giữ nguyên (Host thấy đội đi nhanh kéo dài); điểm tin cậy dùng tốc độ xe cho mọi chế độ (đi bộ nhanh hơn luật đã có cờ `speed`).
  - **Vào vùng** kiểm ở `onPose` theo điểm tin cậy (1 phép `hypot`/vị trí, không chờ vòng tick): lần đầu trong bán kính → `arrived_at` (1 dòng) + sự kiện `arrive`, **kể cả khi `lobby` / `paused`** (D9).
  - **Thao tác** (`open` / `task` / `checkin`) kiểm điểm tin cậy trong bán kính + `NET.geofenceSlack` (2 m); thao tác trong vùng mà `arrived_at` còn null thì ghi luôn `arrived_at`; đang ngồi xe (`mode === 'bike'` của vị trí cuối) → `boxRiding` (§6.3 "phải xuống xe"), **cả `checkin`**. Client gửi vị trí hiện tại **ngay trước** mỗi op `race` (cùng socket nên đúng thứ tự: vừa xuống xe bấm `F` không bị `boxRiding` vì vị trí cũ).
  - Server tính vùng bằng `stepZones(leg)` (`shared/src/leg/zones.ts`, thuần, có test) — cùng hàm mà `leg:check` dùng.
  - Op `race` từ socket Host bị `isClientMessage` từ chối (đã sửa ở nền).

**D5. Hộp mật thư theo trạng thái thật (§17.10).** `boxesOf(leg, zones)`: `route_info` → hộp ở `destination`; lộ trình ngay trước Chặng dừng và chính `pit_stop` → **thảm** (`kind: 'mat'`, id = id bước Chặng dừng) ở vùng Chặng dừng; `detour` / `challenge` → không có hộp. `welcome.boxes` = hộp lộ trình các bước < bước hiện tại (`opened: true`) + hộp bước hiện tại nếu trong `boxReveal.radius`. `checkBoxes()` dùng `engine.currentBox(team)`. Khi mở hộp xong: gửi ngay `box reveal` của hộp đó với `opened: true` (client đổi màu); hộp bước sau chỉ tới qua kiểm tra 2 s khi đội vào 150 m. Không bao giờ gửi tọa độ bước sau. `BoxInfo` thêm `r` (bán kính vùng: gợi ý "Bấm F", vùng cấm NPC) và `kind?: 'mat'`.

**D6. Bảng `step_progress` (SQLite v2).** Đủ mọi cột SPEC §8.1 ngay từ bây giờ (Phase 8–10 chỉ ghi thêm, không ALTER): `team, step, arrived_at, clue_opened_at, task_started_at, completed_at, branch, branch_switches, wrong_answers, penalty_minutes, transport_used, bike_distance_m, bike_lost_at_rack, skipped_by, submitted_at, decided_at, decided_by, rejections, approval_wait_seconds`, khóa chính `(team, step)` **WITHOUT ROWID** → mỗi upsert = 1 dòng ghi (không index phụ). Engine đọc 1 lần khi khởi động, giữ trong RAM, ghi khi đổi. Mốc thời gian = ms UTC của server. Ghi: nhận mật thư (1), vào vùng (1), bắt đầu nhiệm vụ (gộp với hoàn thành ở Phase 7), hoàn thành (1). Trường mới của đội (`startAt`, `startOrder`, `joinedAt`, `finishAt`, `penaltyMinutes`) nằm trong `teams.state` JSON (không ALTER).

**D7. Nội dung thẻ mật thư (`ClueCard`).** `step, type, label, text` (lộ trình / Lựa chọn kép: mật thư; thử thách: câu gợi ý), `transport` (lộ trình), `task` (thử thách), `branches` (Lựa chọn kép: cả 2 nhánh), `branch`, `status` (`active` / `done`; Phase 8 thêm `pending` / `rejected`), `receivedAt`, `completedAt`. `TaskView` = các trường của task **trừ `answers` và `params`**; `location` chỉ còn **tên** (`place`). **Không bao giờ gửi:** đáp án, tên / tọa độ điểm đến của lộ trình (lộ đáp án câu đố), bước sau, tổng số bước. Hàm `cardOf()` là chỗ duy nhất dựng thẻ; test: `JSON.stringify` mọi thẻ của chặng test không chứa đáp án hay tên điểm đến nào.

**D8. Sổ mật thư (§8.11).** `Tab` → `{t:'race', op:'book'}` → `{t:'book', cards}` = thẻ các bước 0…hiện tại theo thứ tự (tải lại mỗi lần mở, không lưu nội dung trong trình duyệt). Thẻ hiện tại ghim đầu + nút "Về mật thư hiện tại" (client). `clueBook.showLockedSlots` luôn coi như `false` ở Phase 7 (không gửi ô khóa). Mở được mọi lúc (cả khi đã về đích / chặng đã kết thúc); body dừng như khi mở menu.

**D9. Trạng thái cuộc đua + tạm dừng.** `meta.status`: `lobby` → (Host "Mở cuộc đua") `running` ⇄ (`pause` / `resume`) `paused` → (`finish`) `finished`. Chuyển không hợp lệ (`resume` khi `running`, `start` sau `finished`…) → `host.notice` lỗi, không ghi gì.
  - `lobby`: đội vào game, đi lại, xem mật thư bước 1; mở hộp / nhiệm vụ / check-in → `raceNotOpen`. Host chỉ được nạp chặng khi `lobby` **và chưa đội nào vào game** (D11). Host thấy cảnh báo đỏ khi còn `lobby` mà đã có đội online hoặc đã có giờ xuất phát (đồng hồ đội đã chạy). "Mở cuộc đua" hỏi xác nhận, liệt kê các ô còn trống (§13.1, "Vẫn mở").
  - `paused`: đi lại được; **thao tác** bị từ chối → `racePaused`; **vào vùng vẫn được ghi đúng giờ thật** (sửa sau phản biện: bản trước ghi trễ tới vị trí đầu sau khi tiếp tục, sai mốc `arrived_at`). **Đồng hồ vẫn chạy, thời gian tạm dừng không trừ** (quyết định của anh, mặc định; `docs/RACE_RULES.md` §11 ghi rõ hệ quả: đội đang đi đường gần như không mất gì, đội đang đứng ở hộp / thảm chờ hết thời gian tạm dừng). Câu hỏi mở 12: có đóng băng di chuyển khi tạm dừng không.
  - **Khi `start` / `resume`:** engine xét lại điểm tin cậy cuối của mọi đội online (đội đứng im trên thảm không gửi vị trí nào) → vào vùng / check-in không phạt ngay lúc đó. Ngoài ra client gửi `checkin` mỗi `raceClient.checkinEveryMs` **mỗi khi đứng trong vùng thảm mà chưa về đích** (không chỉ khi có phạt); server idempotent (đã về đích / còn phạt / sai trạng thái → bỏ qua, không ghi).
  - `finished`: chỉ đọc (Sổ mật thư, kết quả); thao tác → `raceOver`.

**D10. Xếp hạng (§13.6, §13.8) – `worker/src/race/ranking.ts`, thuần.**
  - Đã về đích trước: theo **thời gian chính thức** = check-in − giờ xuất phát riêng của đội − (tổng `approval_wait_seconds` khi `hostApproval.approvalWaitCounts = false`; Phase 7 luôn 0). Bằng nhau → check-in sớm hơn → `startOrder` nhỏ hơn. Đội về đích mà chưa có giờ xuất phát → sau các đội có giờ, theo giờ check-in. Khoảng cách với đội dẫn đầu (+mm:ss).
  - Chưa về đích: bước xa hơn đứng trên; cùng bước → hoàn thành bước trước đó sớm hơn **theo đồng hồ của chính đội** (`prevDoneAt − startAt`; sửa sau phản biện: so giờ thực thì đội xuất phát sớm luôn đứng trên. Ví dụ A xuất phát 10:00 xong bước 4 lúc 11:00 = 60 phút, B xuất phát 10:30 xong lúc 11:10 = 40 phút → **B trên A**; có test đúng ví dụ này); đội chưa có giờ xuất phát xếp sau các đội có giờ; rồi `startOrder`.
  - Giờ xuất phát cho đồng hồ âm (sau check-in / sau `prevDoneAt`: Host gõ nhầm) = coi như chưa có giờ (không bao giờ lên hạng 1 vì số âm). Chốt cuối bằng `slot` → thứ tự luôn xác định (`startOrder` có thể null).
  - `officialMs`, `clue_opened_at` của bước 1 **luôn tính khi đọc** từ `startAt` (không lưu): Host sửa giờ thì mọi chỗ theo ngay.
  - Không trừ giờ tạm dừng (D9). Đội bị loại / được cứu (`eliminationLeg`) và "Công bố kết quả": Phase 10.
  - **NPC ở thảm** không nói "đội thứ n" (vì mỗi đội xuất phát một lúc, thứ tự bước lên thảm không phải thứ hạng): "Đội Xanh, các bạn đã về đích! Thời gian: 01:42:15. Thứ hạng chính thức sẽ được Host công bố." (chưa có giờ xuất phát → bỏ câu thời gian). Câu hỏi mở 1.

**D11. Nạp chặng.** Chặng đóng gói trong Worker (`worker/src/race/leg.ts`): `paris-demo` (mặc định, §10.1 + §17.4, nhiệm vụ trống), `paris-demo-filled`, `mini` (nội dung giả, `worker/legs/test/`). Chặng của cuộc đua lưu ở `meta` (`leg` = JSON đã kiểm, `legId`); chưa có thì dùng mặc định. Host: `{t:'host.leg', id}` (chặng đóng gói) hoặc `{t:'host.leg', json}` (file anh chọn trên máy Host, gửi qua WebSocket Host, ≤ 256 KB) → server `parseLeg` (zod + luật, không cần dữ liệu bản đồ) → lỗi tiếng Việt trong `host.legResult`. Nội dung chỉ rời server dưới dạng thẻ (D7); Host thấy tên + vùng điểm.
  - **Chỉ khi `lobby` và chưa đội nào có `startOrder`** (sửa sau phản biện: nạp chặng sau khi đội đã vào để lại dòng `step_progress` mồ côi theo id bước cũ, đội đứng ở điểm xuất phát cũ, banner "vị trí thứ n" đã dùng mất, xe theo hành lang cũ). Từ chối → `host.legResult {ok:false}` với câu: "Đã có đội vào game trong cuộc đua này. Muốn đổi chặng, hãy tạo cuộc đua mới (race id mới): nạp chặng → tạo đội → phát mã → mở." Quy trình này ghi trong `LEG_FORMAT.md` và hướng dẫn Host. Diễn tập: dùng một race id riêng (vd. `/?race=thu`), không dùng mã đội của buổi thật.
  - Sau khi nạp: `BikeService` lấy cấu hình `vehicles` của chặng mới (dựng lại cfg, không giữ bản của chặng demo), xóa ứng viên đặt xe + xe trống cũ (`host.candidates` rỗng), đẩy `host.state`; trang Host thấy `leg.id` đổi thì **tự tính lại** hành lang (D11 + track E). Đội chưa vào nên không cần đẩy thẻ.
  - Chặng lưu trong `meta.leg` được `parseLeg` lại mỗi lần DO thức: lỗi (schema đổi ở phase sau) không ném trong constructor — giữ chặng, báo `host.state.leg.issues`.

**D12. Trình kiểm tra `npm run leg:check <file>`** (`scripts/leg-check.ts`): `parseLeg` (giống server) + bản đồ (`LegGeo` từ `client/public/data/chunks` + `shared/data/roadgraph.json`): tâm vùng không nằm trong footprint nhà (bỏ qua `kind: 'bridge'` và tháp Eiffel, §2.2), đi bộ tới được từ điểm trước (A* walk, khoảng cách tới **cạnh** gần nhất ≤ bán kính), gợi ý `bikeParking` cho điểm chưa có (điểm vỉa hè / footway gần nhất cách tâm ≈ `radius + bikeParking.offsetMeters`, ngoài nhà), quét `client/public` + `client/dist` để chắc không chuỗi mật thư / đáp án nào lọt vào static asset, cảnh báo nếu file nằm ngoài `worker/legs/`. In tiếng Việt: `LỖI` / `CẢNH BÁO` / `CÒN TRỐNG`; exit 1 khi có lỗi. Nền đã có bản chạy được (zod + luật) và khối bản đồ của `checkLeg` đã kiểm **mọi** điểm đội phải tới: vùng từng bước, **nơi riêng của từng nhánh Lựa chọn kép** (trong nhà, đi bộ từ mọi điểm của bước trước; bước sau đi từ cả hai nhánh), **bãi xe** (không trong nhà; cách tâm ≤ bán kính → cảnh báo, §6.4 "ngoài vùng"); track D chỉ cần viết `LegGeo` thật.
  - **Để anh thấy điểm mình vừa nhập** (sửa sau phản biện: tọa độ gõ nhầm 2 chữ số vẫn trong bản đồ, ngoài nhà, đi bộ tới được → qua hết luật): bảng tóm tắt in mỗi điểm (xuất phát, vùng từng bước, nơi nhánh, bãi xe): tên đường gần nhất + quận (`client/src/geo/locate.ts` / tên đường trong đồ thị), quãng đi bộ từ điểm trước, link `https://www.openstreetmap.org/?mlat=<lat>&mlon=<lon>#map=19/<lat>/<lon>`, và lệnh chụp có sẵn `npm run screenshot -- --path "/preview.html?at=<lat>,<lon>&r=80" --name leg-<id bước>`.
  - Cảnh báo thêm: tâm vùng nằm trên polygon cầu mà dưới cầu là đất (đầu cầu, đảo: D17), tâm vùng trên mặt nước (`water.json`), `timezone` không hợp lệ (`Intl.DateTimeFormat` ném lỗi).

**D13. Schema (`shared/src/leg/schema.ts`).** Như SPEC §10 trừ `roadblock`: 4 loại bước; `destination {name, lat, lon, radius 15–40, bikeParking?}`; `transport` = `{allowed:'any'}` | `{mandatory:'walk'}`; `task {title, description, media, location, kind, verification, answers, proofInstruction, timeLimitMinutes}` (đều có mặc định); `detour.branches` đúng 2; `start {name, lat, lon, yawDeg = 0, spreadMeters = 5}`; `boxReveal {radius 150, hysteresis 20}`; các khối `presence`, `penalties`, `movement`, `vehicles`, `clueBook`, `hostApproval`, `specials` có mặc định = chặng demo. Luật ngoài zod (`checkLeg`): mã bước không trùng, bước đầu là lộ trình, đúng một Chặng dừng và là bước cuối, bước ngay trước nó là lộ trình, mọi điểm trong `RACE_BBOX`, ô trống (mức `blank`), đáp án lộ trong chữ đội đọc trước (cảnh báo). Gặp `roadblock` → "loại bước "roadblock" không có; chỉ dùng: … (trò chơi này không có Vượt rào / roadblock)".
  - **`task.params`** (tùy chọn, `z.record`, sửa sau phản biện): tham số mini-game của các kiểu ngoài `answer` / `free` (vị trí vật, ảnh đích + hướng, cổng…). Phase 7 chỉ lưu, không kiểm, **không gửi cho đội** (`cardOf` bỏ như `answers`); Phase 8 kiểm theo kiểu và quyết định phần nào tới client. `LEG_FORMAT.md` nói rõ: Phase 7 đầy đủ cho `answer` / `free`; kiểu khác ghi cách chơi vào `description`, tham số (nếu đã biết) vào `params`, file vẫn hợp lệ khi Phase 8 thêm trường.

**D14. Nhiệm vụ tạm (Phase 7) và cách Phase 8 cắm vào.** Thẻ nhiệm vụ có nút "Hoàn thành (tạm)" (Lựa chọn kép: một nút mỗi nhánh) → `{t:'race', op:'task', step, branch?}` → server: đúng bước, trong vùng (nhánh: vùng của nhánh) → `verifyTask()` (`worker/src/race/tasks.ts`) = `'pass'` → `task_started_at = completed_at = now`, `branch` → mật thư tiếp. Phase 8 chỉ thay `verifyTask` (đáp án chuẩn hóa `normalizeAnswer` đã có ở `shared/src/leg/check.ts`, `'pending'` cho Host duyệt) và **thêm** op (`branch`, `accept`, `submitted`, `quit`), trạng thái thẻ (`pending`, `rejected`), cột `step_progress` đã có sẵn → **không đổi schema chặng, không đổi bảng**. Bot `sim` gửi `answer` đúng từ chặng test (Phase 8 vẫn qua).

**D15. Đồng hồ từng đội + Host nhập giờ xuất phát (§17.12).** `{t:'host.team', op:'startAt', team, at}` (ms UTC; `null` = xóa; `'now'` = server đóng dấu bằng đồng hồ của nó) → `teams.state.startAt` (1 dòng) + sự kiện + đẩy `race` cho đội. Đồng hồ = (`finishAt` ?? bây giờ) − `startAt`. `welcome.raceTime` và `summary.raceTime` khi đăng nhập ("Chào mừng trở lại") lấy từ đó; client tính tiếp bằng `ClockSync` (`raceClock(view, serverNow)`). Chưa có giờ → HUD "--:--" và Host thấy cảnh báo đỏ "chưa nhập giờ xuất phát" (câu hỏi mở 2).
  - **Kiểm ở server** (sửa sau phản biện: bản trước nhận mọi `at > 0`, giờ tương lai cho đồng hồ / `officialMs` âm → lên hạng 1): `at > now + 60 s` → `host.notice` lỗi, không ghi; `at > joinedAt` → ghi nhưng `host.notice` cảnh báo ("đội nhận mật thư ngoài game trước khi vào, giờ xuất phát thường sớm hơn giờ vào game"); `at > finishAt` → lỗi. Xếp hạng coi đồng hồ âm như chưa có giờ (D10).
  - **Trang Host:** ô `datetime-local` (`step="1"`, có giây) **hiểu theo `leg.timezone`** (không theo múi giờ máy Host; ghi rõ múi giờ cạnh ô, xem trước "T+hh:mm:ss" theo đồng hồ server), nút "Bây giờ" gửi `'now'`, chỉ gửi khi bấm nút "Lưu" (không gửi ở mỗi sự kiện `input`). Host thấy `joinedAt` cạnh giờ xuất phát.

**D16. Thứ tự vào game `startOrder` (§17.12).** Gán ở **lần mở WebSocket đầu tiên** của đội (vào thế giới, không phải lúc gõ mã): `startOrder` = số đội đã có `startOrder` + 1, kèm `joinedAt`, ghi cùng dòng `teams.state` mà lần kết nối vốn đã ghi (0 dòng thêm). `welcome.startOrder` luôn gửi; `welcome.showStartOrder = true` **chỉ** ở welcome của chính lần đó. Client hiện "Xuất phát ở vị trí thứ n" ở bên phải `raceHud.startOrderSeconds` (15 s) theo đồng hồ mô phỏng rồi mờ dần như nhãn tên đường (`hudWidgets.streetFade`); không hiện lại khi vào lại, ở lộ trình sau hay khi về đích. Nối lại mạng giữa 15 s đầu không làm mất / lặp thông báo (chỉ welcome đầu tiên của trang mới bật).

**D17. Điểm xuất phát + chỗ đứng lần đầu.** `welcome.start = startSpot(leg, startOrder)` cho đội chưa có vị trí: điểm xuất phát + rải theo hình hoa hướng dương bán kính `start.spreadMeters` (5 m; 8 đội đầu cách nhau ≥ 1,2 m, có test), hướng `start.yawDeg`. Server đặt `live.valid` của đội đó vào cùng chỗ (không bị coi là nhảy). Client (track B): spawn lần đầu và hộp mật thư **giữ quy tắc "mặt đi được cao nhất"** nhưng **bỏ qua mặt trên của cầu cạn đường sắt** (sàn ray layer 2 / `railLayerStep`, nóc metro Bir-Hakeim §2.1) khi đặt spawn / hộp (sửa sau phản biện: "mặt thấp nhất có khoảng trống" đặt hộp / đội xuống **đường hoặc đảo dưới gầm** ở mọi cầu bắc qua đất — đầu cầu Alexandre III, cầu Bir-Hakeim trên đảo Thiên Nga); người chơi không bao giờ nên đứng trên nóc metro, nên có thể loại hẳn mặt đó khỏi `surface()` nếu không hỏng bậc kè Phase 3–5. Vào lại dùng `pose.y` làm gợi ý (tia bắt đầu ngay trên `pose.y`). `raceClient.headroom` bỏ. Chế độ offline giữ Concorde (`playerSetup.spawn`). Tham số thử `?player=` không đổi.

**D18. Bãi xe (§6.4) và bắt buộc đi bộ (§6.5)** (sửa sau phản biện: bản trước để xe ở bãi của bước vừa **nhận** — với lộ trình bắt buộc đi bộ đó là điểm **phía trước**: xe bị dời tới điểm đến bí mật, hiện cho đội ở gần đó, và đội tới nơi thấy sẵn xe của mình).
  - **Luôn là bãi của điểm đội đang đứng**, mã bãi theo **điểm** (`Zone.rack` = tâm vùng làm tròn, `Zone.parking` = `bikeParking` của điểm đó; nền đã thêm vào `stepZones` / `branchZone`): nhiều bước ở cùng một điểm (hộp L2 + D1 + L3 ở Trocadéro) = một bãi, `maxBikes` đếm đúng.
  - Khi hoàn thành bước k và mật thư nhận được (k + 1) là **nhiệm vụ tại điểm** hoặc **lộ trình `mandatory: 'walk'`** → `park` vào `zones[k]` (điểm của hộp vừa mở; **không** phải `zones[k + 1]`).
  - **Nhiệm vụ ở nơi khác** (`challenge` có `task.location`, nhánh có `location`) → không để bãi lúc nhận mật thư (đội đạp xe tới nơi làm); `park` khi đội **vào vùng nhiệm vụ** (`arrive` của vùng đó), bãi của vùng đó (`task.location.bikeParking`). Nhánh: vùng nhánh đầu tiên đội bước vào.
  - Effect thuần: `{kind:'park', rack, at}` (`worker/src/race/steps.ts`, nền đã đổi) → `io.park(team, rack, at, now)` → `BikeService.park` dời xe về `at` (ponytail: `at = null` thì xe đứng tại chỗ; `leg:check` gợi ý tọa độ). Test `steps`: nhận L2 (đi bộ) ở điểm L1 → bãi L1; thử thách có `location` → bãi khi vào vùng thử thách, không phải khi nhận.
  - `engine.walkOnly(team)` → `BikeService.onTeam(…, walkOnly)` từ chối nhận xe trong lộ trình bắt buộc đi bộ (toast "Lộ trình này bắt buộc đi bộ"). Phạt vi phạm: Phase 9.
  - Ghi lại (minor): xe `parked` ở bãi gần một điểm tương lai hiện cho đội phía sau trong `VIEW_METERS`; chấp nhận ở Phase 7 (bãi cạnh điểm, đội khác đã thấy hộp đã mở ở đó), ghi TODO.

**D19. Chặng dừng (§8.6).** Client vẽ thảm (tấm thảm đỏ + vạch vàng) + **NPC dẫn chương trình** (nhân vật UBC áo vest tối, clip `talk` / `wave`) khi nhận box `kind: 'mat'`. Không phạt: vị trí đầu tiên trong vùng thảm = check-in. Có phạt: HUD đếm ngược tới `RaceView.checkinAt`. **Mọi trường hợp** (có hay không phạt) client đứng trong vùng thảm mà chưa về đích gửi `race checkin` mỗi `raceClient.checkinEveryMs` (đứng im thì không có vị trí nào tới server; cũng lo phần sau khi Host tiếp tục, D9); server idempotent, đang ngồi xe → `boxRiding`. Thảm = vùng bán kính 15–40 m của Chặng dừng (mọi đội như nhau; `matRadius` riêng nhỏ hơn: không làm ở Phase 7, ghi TODO). Vào lại sau khi về đích / sau "Kết thúc" → `welcome.view.finishAt` → khán giả ngay (§8.10). Sau check-in: `finishAt`, `officialMs`, sự kiện `finish` → client: `celebrate`, câu NPC (D10), rồi **chế độ khán giả** (camera bay `V` được phép cho đội đã về đích; ngừng gửi vị trí khi đang bay).

**D20. Vùng cấm NPC (§17.5).** Mỗi khi danh sách hộp / thảm đổi: `npcs.setExclusionZones(boxes.map(b => ({x, z, r: b.r})))` (+ `npc.zoneMargin` sẵn có).

**D21. "Tại điểm này" (§7), làm nếu rẻ (cuối track A + C)** (sửa sau phản biện: bản trước không nói vùng nào được tính; nếu là mọi vùng của chặng, đội đi ngang vùng của bước chưa nhận sẽ nhận tin `zone` — kể cả `teams: []` khi rời — tức biết đó là điểm đua tương lai, trái §17.10).
  - Server chỉ gửi `{t:'zone', teams}` cho một đội khi đội đó đứng trong vùng của **bước hiện tại của chính nó (đã `arrive`)** hoặc của một bước nó **đã làm**; danh sách = các đội online khác đang ở trong vùng đó (khóa vùng = `Zone.rack`), mỗi đội: nhãn bước hiện tại, loại, nhánh, giờ vào vùng. Vùng khác (bước sau) → không bao giờ gửi gì, kể cả `[]`. Test harness: đội đứng trong vùng của bước sau (đội khác đang làm ở đó) không nhận tin `zone` nào.
  - Client: bảng nhỏ "Tại điểm này: Đội Xanh – đang làm Thử thách 2". "Vừa rời đi n phút trước": Phase 10. Có thể bỏ mà không ảnh hưởng phần khác.

**D22. HUD.** Đồng hồ góc dưới phải đổi sang `frame.raceTime` (null → "--:--"; offline vẫn là thời gian mô phỏng), thêm "PHẠT +n phút" khi > 0 (§12). Thẻ nhiệm vụ góc trên trái (§12: icon + màu loại bước, nhãn, tóm tắt mật thư, luật phương tiện). Màu: lộ trình vàng, Lựa chọn kép xanh dương, Thử thách đỏ cam, Chặng dừng xanh lá (track C chọn theo STYLE_GUIDE).

**D23. `F` trên bộ.** Đang đạp xe → xuống xe như cũ. Đi bộ: nếu đang trong vùng của hộp hiện tại (chưa mở) → mở hộp (clip `openBox` + `race open`); nếu không → xe đạp như Phase 6. Móc `Player.onInteract?: () => boolean` (true = đã xử lý) do track B thêm.

**D24. Bảo mật.** Đáp án không bao giờ rời server (`verifyTask` đọc ở server; Phase 7 không đọc). Thẻ không có tên / tọa độ điểm đến; tọa độ hộp chỉ trong 150 m (§17.10). Chặng chỉ ở `worker/legs` (đóng gói vào Worker) hoặc SQLite; `leg:check` quét static asset. Op được kiểm hình dạng ở `isClientMessage` (id bước ≤ 16 ký tự, đáp án ≤ 200); thao tác bị từ chối không ghi SQLite; giới hạn 15 tin/s/socket có từ Phase 6.

**D25. `PROTOCOL_VERSION = 2`.** Tin mới (`race`, `book`, `zone`, `host.legResult`, op `race`, `host.race`, `host.team`, `host.leg`) và trường mới bắt buộc của `welcome` / `BoxInfo` / `HostState` → server cũ và client mới không hiểu nhau → client cũ thấy "Phiên bản game đã đổi, hãy tải lại trang".

## 4. Nền (foundation, commit `feat(phase7): kế hoạch + nền race engine`)

| File | Nội dung |
|---|---|
| `shared/package.json`, `package-lock.json` | `zod` ^4.6.5; export `@race/shared/leg` |
| `shared/src/leg/{schema,check,zones,index}.ts` + `leg.test.ts` | **đầy đủ**: schema zod (D13), `parseLeg`, `checkLeg(leg, geo?)`, `LegGeo`, `placeOf`, `normalizeAnswer`, `stepZones`, `branchZone`, `startSpot`; 11 test |
| `shared/src/protocol/{types,codec,constants}.ts` + `codec.test.ts` | **đầy đủ**: kiểu Phase 7 (§5.1), `isClientMessage` cho op mới (+ test), `NET.geofenceSlack`, `PROTOCOL_VERSION = 2` |
| `worker/src/db.ts` | **đầy đủ**: `SCHEMA_VERSION = 2`, bảng `step_progress`, `StepProgressRow`, `emptyProgress`, `readProgress`, `writeProgress` |
| `worker/src/race/leg.ts` | **đầy đủ**: chặng đóng gói (`BUNDLED_LEGS`, `bundledLeg`, `DEFAULT_LEG_ID`), `legRules(leg)` |
| `worker/src/race/{engine,steps,ranking}.ts` | **stub A**: chữ ký (§5.2), thân rỗng |
| `worker/src/race/tasks.ts` | **xong cho Phase 7**: `verifyTask` → `'pass'` |
| `worker/src/RaceRoom.ts`, `race/boxes.ts` | chỉ đủ để biên dịch: `TeamState extends TeamRace`, `welcome` / `host.state` có trường mới (rỗng), `BoxInfo.r` |
| `worker/legs/paris-demo.json` | điểm xuất phát → cầu Bir-Hakeim (centroid OSM, `yawDeg` 33, `spreadMeters` 5) |
| `worker/legs/test/{paris-demo.filled,mini}.json` | nội dung **GIẢ** để test (ghi rõ "(GIẢ)") |
| `worker/src/legs.test.ts`, `RaceRoom*.test.ts`, `race/boxes.test.ts` | chặng đóng gói parse được; demo chỉ còn ô trống của Host; xuất phát ở Bir-Hakeim; test Phase 6 đổi sang tọa độ tương đối với điểm xuất phát; schema 2 |
| `client/src/race/RaceClient.ts` | **nền B**: định tuyến `race` / `book` / `zone`, `raceClock`, `startOrder` → HUD |
| `client/src/race/ui/RaceHud.ts` | **stub C**: chữ ký (§5.3) |
| `client/src/main.ts` | nối sẵn: `RaceHud` (+ `demo(query)` offline DEV), `RaceClient` (welcome / message), `Tab` → `toggleBook`, `modal()` có `raceHud.open`, `frame.raceTime` / `penaltyMinutes`, `raceHud.update(…)` |
| `client/src/ui/{types,Toasts}.ts` (+ test) | `HudFrame.raceTime?`, `penaltyMinutes?`; chữ tiếng Việt cho 9 mã `notice` mới |
| `client/src/net/ClueBoxes.ts`, `host/hostView.ts` (+ test) | `r` trong `BoxInfo` (stand-in 20 m); `demoState` có trường mới (rỗng) |
| `client/src/config.ts` | khối `raceClient` (B), `raceHud` (C) |
| `scripts/leg-check.ts`, `package.json` | `npm run leg:check` (zod + luật; D thêm bản đồ) |
| `scripts/screenshot.ts` | khối `p7-*` rỗng, mỗi track một dòng; `p7-*` không chạy mặc định |
| `docs/RACE_RULES.md` | bỏ Vượt rào; xuất phát lệch giờ + "Xuất phát ở vị trí thứ n"; hộp hiện dần; Chặng dừng: thứ hạng do Host công bố; §11 đồng hồ từ giờ nhận mật thư ngoài game, tạm dừng không trừ |
| `TODO.md` | gỡ dòng "quyết định tạm dừng" (D9); dòng Vượt rào cập nhật |

**Sửa nền theo phản biện** (commit `feat(phase7): sửa kế hoạch + nền theo phản biện`; báo cáo `docs/reports/phase7-critic-{coverage,engine}.md`):

| File | Nội dung |
|---|---|
| `shared/src/protocol/speed.ts` (+ test), `constants.ts` | `TrustedPoint` (D4: điểm tin cậy đi theo vị trí ở tốc độ giới hạn, trần 2 s, `grant`), `NET.respawnTrust` 30 m |
| `shared/src/protocol/{types,codec}.ts` (+ test) | `host.team at: 'now'`, `host.notice`, `HostState.leg` có vùng / nơi nhánh / `vehicles` / `timezone` / `start`, `teams[i].joinedAt`; op `race` chỉ từ socket đội |
| `shared/src/leg/zones.ts` | `Zone.rack` (theo điểm) + `Zone.parking` (D18) |
| `shared/src/leg/schema.ts` | `task.params` tùy chọn (D13) |
| `shared/src/leg/check.ts` (+ test) | khối bản đồ kiểm nơi riêng của nhánh + đi bộ từ cả hai nhánh + bãi xe (trong nhà / trong vùng) |
| `worker/src/race/steps.ts`, `ranking.ts` | `park {rack, at}` (bãi của điểm đang đứng), `RankInput.slot` + luật đồng hồ riêng (D10) |
| `worker/src/db.ts` | `writeProgress` = `ON CONFLICT DO UPDATE`, trả `rowsWritten` |
| `worker/src/RaceRoom.ts`, `client/src/host/hostView.ts` | `joinedAt` trong `host.state` (chỉ thêm trường) |
| `worker/legs/test/mini.json` | thử thách có `task.location` + `bikeParking`, nhánh B có nơi riêng + `bikeParking`, bãi xe L1, `teaser`, `media`, `timeLimitMinutes` (điểm đã đo: ngoài nhà, cách cạnh đồ thị ≤ 12 m) |
| `client/src/config.ts` | bỏ `raceClient.headroom` (D17) |
| `docs/RACE_RULES.md` §11 | hệ quả của tạm dừng; vào vùng vẫn ghi đúng giờ; đứng trên thảm được check-in khi tiếp tục |

`npm run build && npm test` qua (§8). Mỗi track làm trong git worktree riêng từ commit nền. `SCREENSHOT_PORT`: B 5176, C 5177, E 5178; `wrangler dev --port`: A 8787, B 8788, E 8789.

## 5. Interface (giữ nguyên chữ ký; đổi thì báo người tích hợp)

### 5.1 Giao thức (`shared/src/protocol`, v2; tin gửi lên là JSON nhỏ, ≤ 1 KB)

```ts
// lên (đội)
{ t: 'race'; op: 'open'; step: string }                       // F ở hộp hiện tại
{ t: 'race'; op: 'task'; step: string; branch?: string; answer?: string }   // Phase 7: nút "Hoàn thành (tạm)"
{ t: 'race'; op: 'checkin' }                                   // trên thảm, sau giờ chờ phạt
{ t: 'race'; op: 'book' }                                      // Tab: tải Sổ mật thư
// lên (Host)
{ t: 'host.race'; op: 'start' | 'pause' | 'resume' | 'finish' }
{ t: 'host.team'; op: 'startAt'; team: string; at: number | null | 'now' }   // 'now' = server đóng dấu; tương lai > 60 s → host.notice lỗi
{ t: 'host.leg'; id?: string; json?: string }                  // đúng một trong hai; chỉ khi lobby và chưa đội nào vào game (D11)
// xuống
Welcome += { view: RaceView | null; startOrder: number | null; showStartOrder: boolean; start: {x, z, yaw} | null }  // raceTime nay có giá trị
{ t: 'race'; view: RaceView } · { t: 'book'; cards: ClueCard[] } · { t: 'zone'; teams: ZoneMember[] }
{ t: 'host.legResult'; ok: boolean; issues: LegIssueView[] }
{ t: 'host.notice'; level: 'error' | 'warning'; message: string }   // Host op bị từ chối / cảnh báo (tiếng Việt)
ServerNotice += 'raceNotOpen' | 'racePaused' | 'raceOver' | 'boxFar' | 'boxRiding' | 'boxOpened' | 'taskFar' | 'clueNew' | 'penaltyWait'
BoxInfo += { r: number; kind?: 'mat' }
HostState += { leg: {id, title, timezone, start: {x, z}, steps: {id, type, label, name, x, z, r, branches?: {id, name, x, z, r}[]}[], vehicles, bundled: string[], issues} | null; progress: StepProgressView[]; ranking: RankRow[] }
//   (steps? của Phase 6 = legPoints() của chặng demo: A bỏ khi E đọc leg)
HostState.teams[i] += { startAt; startOrder; step; finishAt; penaltyMinutes; joinedAt }
// isClientMessage: op 'race' chỉ nhận từ socket đội

interface RaceView { status; startAt: number | null; finishAt: number | null; penaltyMinutes: number; card: ClueCard | null; checkinAt: number | null; officialMs: number | null }
interface ClueCard { step; type: StepType; label; text; transport?; task?: TaskView; branches?: BranchView[]; branch?: string | null; status: 'active' | 'done'; receivedAt; completedAt: number | null }
interface TaskView { title; description; media: string[]; kind; verification; proofInstruction; timeLimitMinutes: number | null; place?: string }   // không có answers
interface ZoneMember { slot; label; type; branch: string | null; since }
interface StepProgressView { team; step; arrivedAt; openedAt; startedAt; completedAt; branch }
interface RankRow { team; rank; stepIndex; finishAt; officialMs; gapMs }
NET.geofenceSlack = 2   // m
NET.respawnTrust = 30   // m: respawn ngắn hơn được tin ngay (D4)
class TrustedPoint { x; z; at; budget; follow(now, x, z, rate, cap, grant = 0): number /* m không vào được → teleport */ }   // speed.ts, nền
```

### 5.2 Server

```ts
// shared/src/leg (nền, đầy đủ)
legSchema; type Leg, Step, RouteInfoStep, DetourStep, ChallengeStep, PitStopStep, Task, Destination, Transport, VehiclesConfig
LEG_LIMITS { radiusMin 15, radiusMax 40, maxSteps 60, stepId, legId, textMax }; STEP_TYPES; TASK_KINDS; VERIFICATIONS
parseLeg(json): { ok: true; leg; issues } | { ok: false; issues }      // issues: { level: 'error'|'warning'|'blank'; where; message } tiếng Việt
checkLeg(leg, geo?: LegGeo): LegIssue[];  interface LegGeo { building(x, z): string | null; walk(a, b): { meters; snapA; snapB } | null }
normalizeAnswer(s); placeOf(root, path)
stepZones(leg): Zone[]; branchZone(leg, zones, step, branch); startSpot(leg, order): { x, z, yaw }     // Zone { x, z, r, name, rack, parking: {x, z} | null }; rack theo điểm (D18)

// worker/src/race/leg.ts (nền)   BUNDLED_LEGS · DEFAULT_LEG_ID · bundledLeg(id): Leg | null · demoLeg · legRules(leg)
// worker/src/db.ts (nền)         SCHEMA_VERSION 2 · StepProgressRow · emptyProgress(team, step) · readProgress(sql) · writeProgress(sql, row): rowsWritten (ON CONFLICT DO UPDATE; cộng vào counters.rows)
// worker/src/race/tasks.ts       verifyTask(leg, step, branch, answer): 'pass' | 'wrong' | 'pending'   // Phase 7: 'pass'
// worker/src/race/steps.ts (A, thuần)
interface Progress { step; arrivedAt; startedAt; branch; finishAt; penaltyMinutes }
type RaceInput = {kind:'pose', x, z, riding} | {kind:'open', step, x, z, riding} | {kind:'task', step, branch?, answer?, x, z} | {kind:'checkin', x, z}
type RaceEffect = {kind:'arrive', step} | {kind:'start', step, branch} | {kind:'complete', step} | {kind:'finish'} | {kind:'park', rack, at} | {kind:'refuse', code}   // park: D18
advance(leg, zones, p, input, now, verify): { p; effects }
boxesOf(leg, zones): (Omit<BoxInfo, 'opened'> | null)[]
cardOf(leg, index, row: StepProgressRow | undefined, now): ClueCard
// worker/src/race/ranking.ts (A, thuần)   ranking(teams: RankInput[], approvalWaitCounts): RankRow[]   // RankInput { team, slot, startOrder, step, startAt, finishAt, prevDoneAt, approvalWaitMs }; D10
// worker/src/race/engine.ts (A)
interface TeamRace { step; startAt; startOrder; joinedAt; finishAt; penaltyMinutes }   // NEW_TEAM_RACE
interface RaceIO { sql; counters; send(team, m); changed(now); event(t, team, type, data?); team(id); saveTeam(id, r); teamIds(); park(team, rack, at, now) }
class RaceEngine {
  leg; rules(); status
  enter(team, now): { startOrder; first }
  welcome(team, pose, first, now): Pick<Welcome, 'view'|'raceTime'|'boxes'|'startOrder'|'showStartOrder'|'start'>
  summary(team, now): { raceTime; step }            // màn "Chào mừng trở lại"
  onPose(team, validPose, now); onOp(team, m: RaceOp, at, now); onHost(m, reply, now)
  currentBox(team); walkOnly(team); hostView(now): Pick<HostState, 'leg'|'progress'|'ranking'>
}
// RaceRoom (A) gọi: upgrade → enter + welcome; onPose (khi !over, cả respawn) → engine.onPose; 'race' → onOp;
//   'host.race'/'host.team'/'host.leg' → onHost; checkBoxes → currentBox; bikes.onTeam(…, engine.walkOnly(team)); hostState → hostView + trường đội;
//   login → summary; BikeService.park(team, rack, at, now) dời xe về `at`; onPose / respawn → TrustedPoint (D4) trước mọi thứ khác.
```

### 5.3 Client + config

```ts
// client/src/race/RaceClient.ts (B; nền đã có phần dưới)
class RaceClient { constructor(deps: { hud: RaceHud | undefined; send(m); serverNow() }); view: RaceView | null
  welcome(w, simTime); message(m): boolean /* race | book | zone */; raceTime(): number | null }
raceClock(view, serverNow): number | null
// B thêm: interact(…) cho F, hộp đã mở, thảm + NPC (race/PitStop.ts), checkin định kỳ, vùng cấm NPC, khán giả sau về đích,
//         Player.onInteract?: () => boolean, CharacterController.spawn(x, z, yaw, yHint?) / đặt spawn + hộp lên mặt cao nhất trừ nóc cầu cạn đường sắt (D17)
// client/src/race/ui/RaceHud.ts (C)
class RaceHud { constructor(actions: { task(step, branch?); book() })
  setView(view); showBook(cards); toggleBook(); get open(); startOrder(n, simTime); finished(team, officialMs);
  zone(members, teams); update({ simTime, serverNow, inZone }); demo(query) }
// client/src/ui/HUD.ts (C)  đọc HudFrame.raceTime (null → "--:--") + penaltyMinutes
```

```ts
// client/src/config.ts — mỗi track chỉ sửa khối của mình, không thêm import
export const raceClient = { checkinEveryMs: 2000 };   // B (headroom bỏ: D17)
export const raceHud = { startOrderSeconds: 15 };                      // C (thêm màu loại bước, kích thước thẻ…)
export const hostPage = { …, /* E thêm */ };
```

### 5.4 SQLite (schema v2)

| Bảng | Cột | Ghi khi |
|---|---|---|
| `meta` | `key, value` | + `leg` (JSON chặng), `legId`, `status` (đổi trạng thái) |
| `teams` | như v1; `state` JSON thêm `startAt, startOrder, joinedAt, finishAt, penaltyMinutes`, `step` | nhận mật thư mới, giờ xuất phát, về đích (1 dòng); `startOrder` gộp vào dòng của lần kết nối |
| `step_progress` | 19 cột SPEC §8.1, PK `(team, step)` WITHOUT ROWID | nhận mật thư, vào vùng, hoàn thành (1 dòng mỗi lần) |
| `events` | như v1; loại mới `arrive`, `open`, `task`, `complete`, `finish`, `park`, `host.race`, `host.start`, `host.leg` | ngay (2 dòng) |

## 6. Năm track: file sở hữu và việc cần làm

Mỗi track chỉ sửa file của mình và **khối config của mình**. `shared/src/protocol`, `shared/src/leg`: chỉ người tích hợp; track cần thêm trường **tùy chọn** thì thêm, ghi vào báo cáo, không bump version. `TODO.md` / `CLAUDE.md` / README / `docs/SPEC.md`: chỉ người tích hợp (SPEC: chỉ điều phối viên). Báo cáo mỗi track: `docs/reports/phase7-track-<x>.md`, ghi sớm, cập nhật dần.

### Track A – Race engine phía server (**Opus**: máy trạng thái, SQLite trước ack, xếp hạng, ghép RaceRoom)
- **File:** `worker/src/race/{engine,steps,ranking,boxes}.ts` (+ `steps.test.ts`, `ranking.test.ts`, `engine.test.ts`/harness), `worker/src/RaceRoom.ts`, `worker/src/race/BikeService.ts` (chỉ `park` dời xe về `at`), `worker/src/race/leg.ts`, `worker/src/db.ts` (thêm helper nếu cần), `worker/src/index.ts` (nếu cần), `worker/src/RaceRoom*.test.ts`, `worker/src/test/harness.ts` (chỉ thêm helper).
- **Việc:** **trước tiên D4** (điểm tin cậy `TrustedPoint` trong `onPose` + `respawn` + vị trí đầu của cửa sổ mới; viết lại các test Phase 6 đang "dịch chuyển bằng `respawn`" xa: xem Test), rồi D2–D11, D15–D18, D21 (server, nếu rẻ), D24: `advance` / `boxesOf` / `cardOf` / `ranking`; `RaceEngine` (chặng từ `meta`, cache `step_progress`, `transactionSync`, gửi `race` / `box` / `notice` sau khi ghi); nối vào `RaceRoom` (`liveOf` → `startSpot`, `checkBoxes` → `currentBox`, `welcome`, `summary` khi login, `hostState`, `walkOnly`, `park`); Host op (`host.notice` cho từ chối / cảnh báo; `'now'`; kiểm giờ xuất phát D15; chuyển trạng thái sai D9; `host.leg` sau khi có đội vào → từ chối D11); `legRules()` từ chặng đã nạp (movement / presence / vehicles / boxReveal), `BikeService` dựng lại cfg + xóa ứng viên / xe trống khi nạp chặng; `host.state.leg` đủ vùng + `vehicles` + `timezone` + `start`; bỏ `legPoints` / `stepBox` dựa trên `demoLeg` và `HostState.steps` khi E đã đọc `leg`; `enter()` + ghi `teams.state` của lần kết nối trong **cùng một đoạn đồng bộ** (đọc `s` sau `enter()`, không ghi đè `startOrder` bằng `s` cũ); bỏ qua op `race` từ Host (codec đã chặn); `writeProgress` trả `rowsWritten` → `counters.rows`; ghi SQLite trong `transactionSync`, chỉ vá cache sau khi giao dịch thành công.
- **Test (bắt buộc):**
  - thuần `RaceRoom` / `TrustedPoint` (D4, bắt buộc, harness): đi bộ 4 m/s, đứng im 3,5 s, gửi vị trí cách 2 km → cờ đỏ, điểm tin cậy chỉ đi ≤ 13 m, `open` → `boxFar`; `respawn` 2 km → như trên; `respawn` 20 m → nhận ngay; vào lại sau 1,3 s offline với vị trí cách 2 km → cờ + không vào vùng;
  - **test Phase 6 dựa vào "dịch chuyển bằng `respawn`" xa** (kênh hộp `live-boxes`, `live-cadence` B tới L1, `live-ticks`) chuyển sang chặng test gần (vd. thêm `worker/legs/test/near.json` qua người tích hợp / D, điểm cách nhau ≤ 60 m, `boxReveal` thu nhỏ: `radius` 40, `hysteresis` 10) + helper harness `walkTo(sock, x, z)` gửi vị trí 5 Hz ở tốc độ xe (hoặc chuỗi `respawn` ≤ 30 m cách nhau đủ lâu); các test cờ `jump` / `respawn` Phase 6 giữ nguyên ý nghĩa (vẫn ghi sự kiện, giờ thêm: điểm tin cậy không nhảy);
  - thuần `RaceEngine` với `RaceIO` giả ghi lại thứ tự gọi (thay cho test "SQLite có trước khi tin `race` tới", vốn không thể fail vì output gate của DO): ghi SQLite trước, gửi sau; `sql` ném lỗi → không gửi gì, cache không đổi;
  - thuần `steps`: lộ trình (vào vùng → `arrive`; `open` ngoài vùng → `boxFar`, trên xe → `boxRiding`, bước khác → `boxOpened` / im lặng với bước sau; mở → `complete` + bước kế); lộ trình trước Chặng dừng xong khi vào vùng thảm; Chặng dừng không phạt → `finish` cùng vị trí, có phạt → `checkin` trước `checkinAt` bị `penaltyWait`, sau thì `finish`; nhiệm vụ trong / ngoài vùng (`taskFar`), nhánh ghi `branch`, nhánh có `location` riêng; `park` (D18): nhận L2 (đi bộ) ở điểm L1 → bãi **L1** (không phải L2), thử thách có `location` → bãi khi **vào vùng** thử thách, bãi chung cho các bước cùng điểm; `verify` → `'wrong'` / `'pending'` không đổi trạng thái; `checkin` trên xe → `boxRiding`; `open` / `task` trong vùng khi `arrived_at` null → ghi `arrive` trước; vào vùng khi `paused` / `lobby` → vẫn `arrive`; `boxesOf` (thảm cho lộ trình cuối và Chặng dừng, không hộp cho nhiệm vụ); `cardOf`: `JSON.stringify` mọi thẻ của `paris-demo-filled` và `mini` **không chứa** đáp án nào hay tên điểm đến nào;
  - `ranking`: về đích theo thời gian chính thức (giờ xuất phát khác nhau đảo thứ tự bước lên thảm), hòa, thiếu giờ xuất phát, chưa về đích theo bước / bước trước **theo đồng hồ của đội** (ví dụ D10: A 10:00 → 11:00, B 10:30 → 11:10 ⇒ B trên A), giờ xuất phát cho đồng hồ âm = chưa có giờ, chốt bằng `slot` (`startOrder` null), `approvalWaitCounts`;
  - harness (chặng `mini`, `host.leg {id:'mini'}`, di chuyển bằng **vị trí** qua helper đi bộ / chặng `near`, không bằng `respawn` xa): 2 đội mở WebSocket **cùng lúc** (`Promise.all`) → `startOrder` {1, 2}, `showStartOrder` chỉ lần đầu (đội 1 vào lại → `false`, `startOrder` vẫn 1), `welcome.start` cách điểm xuất phát ≤ 5 m, `welcome.view.card.step = 'L1'`; `lobby` → `raceNotOpen`; Host `start`; `open` xa → `boxFar`; `open` đúng → dòng `step_progress` + `teams.state` **đã có trong SQLite khi tin `race` tới** (đọc `getDurableObjectStorage` ngay khi nhận); hộp `L1` `opened` + không có tọa độ `L2` trong **bất kỳ** tin nào trước khi `T1` xong; `task` → bước kế; `pause` → `racePaused`, `resume`; `host.team startAt` → `race` với `startAt`, `raceTime` đúng ±1 s ở welcome kế; về đích → `finishAt`, `officialMs`, `ranking` trong `host.state`; evict giữa chặng → dựng lại đúng bước / Sổ mật thư (`book`); `host.leg {json}` sai → `host.legResult` có thông báo tiếng Việt; `host.leg` sau `start` **hoặc khi đã có đội vào game** bị từ chối; `host.team startAt` tương lai → `host.notice` lỗi, `'now'` → giờ server; `resume` khi `running` → `host.notice`; đội đứng im trên thảm trong lúc tạm dừng → `resume` → về đích ngay; D21: đội đứng trong vùng bước sau không nhận `zone`; `walkOnly` chặn `claim`; đếm dòng ghi của một lượt `mini` ≤ 110 / đội theo `rowsWritten` thật.
- **Preset:** không.

### Track B – Ghép client (**Opus**: spawn / đặt vật trên nhiều tầng mặt cầu, F, thảm + NPC, khán giả, nhiều trình duyệt)
- **File:** `client/src/race/RaceClient.ts` (+ test), `client/src/race/PitStop.ts` (mới), `client/src/net/ClueBoxes.ts` (+ test), `client/src/main.ts`, `client/src/player/{Player,CharacterController}.ts`, `client/src/ui/Login.ts` + `net/session.ts` (tóm tắt: bước hiện tại, giờ đua), config `raceClient`, preset `[B]`.
- **Việc:** D5 (client: hộp mở đổi màu, thảm), D16 (gọi `raceHud.startOrder` – nền đã có), D4 (gửi vị trí hiện tại ngay trước mỗi op `race`), D17 (spawn tại `welcome.start`, mặt cao nhất **trừ nóc cầu cạn đường sắt**, `pose.y` gợi ý, offline giữ Concorde), D18 (toast `walkOnly` sẵn có), D19 (thảm + NPC, `checkin` định kỳ **mỗi khi đứng trong vùng thảm chưa về đích**, `celebrate`, khán giả: `canFly` cho đội đã về đích, không gửi vị trí khi bay; vào lại khi `view.finishAt` → khán giả ngay), D20, D23 (`Player.onInteract`, `openBox`, `race open`), `inZone` cho `raceHud.update`, `raceHud.finished(...)` khi `finishAt` mới, `Login` hiện bước + giờ đua.
- **Test (bắt buộc):** `raceClock` (chưa có giờ, đang chạy, đã về đích); `ClueBoxes`: `kind:'mat'` dựng thảm, reveal `opened:true` đổi hộp tại chỗ; hàm thuần chọn mặt đặt spawn / hộp (danh sách chạm tia có loại mặt → cao nhất trừ sàn ray: tâm Bir-Hakeim → mặt cầu, đầu cầu Alexandre III → mặt cầu không phải đường kè dưới gầm); `F` ưu tiên hộp trong vùng, ngoài vùng → xe; tay (ghi vào báo cáo): `npm run dev:api` + 2 trình duyệt, chặng `mini`: vào game (vị trí 1 / 2 hiện một lần), Host nhập giờ → đồng hồ chạy, đi tới L1 mở hộp, làm T1 (tạm), đi L2 có xe → bị chặn lấy xe, D1, về đích → NPC + ăn mừng + bay khán giả; F5 giữa chặng → đúng bước / Sổ mật thư.
- **Preset:** `p7-start` (DEV stand-in `/?start=<n>&wait=1&debug=1`: spawn như `welcome.start` của đội thứ n ở chặng demo, đi qua cùng đường đặt spawn; F3: chân ≈ 1,3 m trên mặt cầu, không phải 7,2 m; chụp thêm một chỗ rải ở phía trên đảo Thiên Nga: vẫn trên mặt cầu, không xuống đảo), `p7-openbox` (hộp trước mặt + `action=openBox`), `p7-mat` (thảm + NPC ở cầu Iéna / Louvre), `p7-celebrate`.

### Track C – Giao diện cuộc đua trên HUD (**Sonnet**: DOM theo spec rõ, không có logic mạng)
- **File:** `client/src/race/ui/*` (`RaceHud.ts` + các widget + `race.css` + test), `client/src/ui/HUD.ts` (+ `HUD.test.ts`), config `raceHud`, preset `[C]`.
- **Việc:** D7 (hiển thị), D8 (Sổ mật thư: thứ tự, thẻ hiện tại ghim đầu, nút "Về mật thư hiện tại", trạng thái + giờ hoàn thành + thời gian làm bước, đóng bằng `Tab` / `Esc`, không lộ số bước), D16 (banner 15 s + mờ), D19 (câu NPC + đếm ngược phạt), D21 (bảng "Tại điểm này", nếu A làm), D22 (đồng hồ "--:--", phạt), thẻ nhiệm vụ góc trên trái + thẻ đầy đủ khi mật thư mới (hiệu ứng mở phong bì CSS), nút "Hoàn thành (tạm)" (ghi rõ là tạm), gợi ý "Bấm F để mở hộp mật thư"; chữ tiếng Việt có dấu; `demo(query)` cho preset (`?card=route|detour|challenge|pit`, `?full`, `?book`, `?startOrder=3`, `?finish`, `?zone`, `?raceTime=`, `?penalty=`).
- **Test (bắt buộc):** hàm thuần: tóm tắt thẻ theo loại + nhãn phương tiện, thứ tự / ghim của Sổ mật thư, thời gian làm bước, banner hiện đúng 15 s rồi tắt và chỉ một lần, `formatClock(null)` → "--:--", câu NPC có / không thời gian.
- **Preset:** `p7-card` (lộ trình), `p7-card-detour`, `p7-card-challenge`, `p7-card-full`, `p7-book`, `p7-start-order`, `p7-finish`, `p7-clock` (đồng hồ + phạt), `p7-zone` (nếu có).

### Track D – Định dạng chặng + trình kiểm tra + chặng test (**Sonnet**: tài liệu + CLI theo spec rõ)
- **File:** `docs/LEG_FORMAT.md` (mới), `scripts/leg-check.ts` (+ `scripts/leg-check.test.ts`), `worker/legs/test/*.json` (rà, bổ sung nếu thiếu trường hợp; thêm `near.json` cho test harness của A nếu A cần — báo người tích hợp vì `worker/src/race/leg.ts` là của A). Ví dụ đầy đủ trong `LEG_FORMAT.md` dựa trên `mini` (đã có mọi dạng).
- **Việc:** D12, D13 (tài liệu): `LEG_FORMAT.md` tiếng Việt cho người không lập trình — chặng là gì, quy trình 4 bước (viết file → `npm run leg:check` → sửa theo thông báo → nạp trên trang Host), giải thích **mọi** trường (bắt buộc / mặc định / ví dụ), 4 loại bước (không có Vượt rào), vùng 15–40 m, cách lấy tọa độ (Google Maps / OSM: chuột phải → tọa độ; đặt ở vỉa hè / quảng trường, không trong nhà), luật thứ tự, đáp án nằm đâu và không bao giờ tới máy người chơi, ví dụ đầy đủ (dựa trên `mini`), bảng thông báo lỗi thường gặp → cách sửa; `leg-check`: `LegGeo` từ chunk + đồ thị (bỏ qua `bridge` và tháp Eiffel — tốt nhất cùng điều kiện "footprint nào thành khối đặc" với bộ dựng nhà —, khoảng cách tới **cạnh**), gợi ý `bikeParking`, quét `client/public` + `client/dist` (chuỗi mật thư / đáp án ≥ 12 ký tự), cảnh báo file ngoài `worker/legs/`, in bảng tóm tắt (bước, loại, vùng, đường đi bộ m) **kèm mỗi điểm: tên đường + quận, link OSM, lệnh `npm run screenshot -- --path "/preview.html?at=…&r=80" --name leg-<id>`** (D12), cảnh báo cầu-trên-đất / mặt nước / `timezone` sai (D12). `LEG_FORMAT.md` thêm: quy trình "race id mới → nạp chặng → tạo đội → phát mã → mở" và vì sao không đổi chặng sau khi đội đã vào (D11); `task.params` + kiểu nhiệm vụ nào đầy đủ ở Phase 7 (D13); bãi xe theo điểm, nhiệm vụ ở nơi khác để xe khi tới vùng (D18); lỗi JSON hay gặp của người không lập trình (dấu phẩy thập phân "48,85", ngoặc cong “ ” từ Word / Google Docs, dấu phẩy thừa, không có chú thích; `JSON.parse` dịch ra "dòng X, cột Y"); `destination.name` không bao giờ hiện cho đội; đáp án phải dựa trên thứ có trong game; `media` là link công khai (R2: Phase 10); bước 1 = mật thư phát ngoài game.
- **Test (bắt buộc):** `paris-demo` → hợp lệ, chỉ ô trống; `mini` (nền đã thêm: thử thách có `task.location` + `bikeParking`, nhánh B có nơi riêng + `bikeParking`, bãi xe ở L1, `teaser`, `media`, `timeLimitMinutes`) và `paris-demo-filled` → hợp lệ, 0 lỗi với dữ liệu bản đồ thật; nhánh có nơi riêng trong một tòa nhà → lỗi; bãi xe trong vùng → cảnh báo; bảng tóm tắt có link OSM; file hỏng (roadblock, bán kính 50, điểm trong một tòa nhà Haussmann, điểm ngoài bản đồ) → đúng các dòng lỗi, exit 1; quét lộ: chuỗi cài vào thư mục tạm bị phát hiện.
- **Preset:** không.

### Track E – Trang Host + bot (**Sonnet**: bảng / form theo spec rõ)
- **File:** `client/src/host/{main,hostView}.ts` (+ `hostView.test.ts`), `client/src/host/host.css`, `client/host.html`, `scripts/sim.ts` (+ `sim.test.ts`), config `hostPage`, preset `[E]`.
- **Việc:** trạng thái cuộc đua + nút Mở cuộc đua / Tạm dừng / Tiếp tục / Kết thúc (hỏi xác nhận), nạp chặng (chọn chặng đóng gói hoặc file `.json` trên máy → `host.leg`, hiện `host.legResult` + danh sách ô còn trống), mỗi đội: giờ xuất phát (`datetime-local` `step="1"` **hiểu theo `leg.timezone`** + nút "Lưu" + "Bây giờ" gửi `'now'` + xóa; hiện múi giờ chặng, `joinedAt`, xem trước T+ theo đồng hồ server; hiện `host.notice`), `startOrder`, bước hiện tại, phạt; cảnh báo đỏ khi còn `lobby` mà có đội online / có giờ xuất phát; "Mở cuộc đua" hỏi xác nhận kèm danh sách ô còn trống; **bảng tiến trình** §13.6 tối giản (hàng = đội, cột = bước; xám / vàng + thời gian ở bước / xanh "HH:mm:ss · mm:ss"; title = mọi mốc) + cột Tổng phạt, Giờ về đích, Thời gian chính thức, Thứ hạng, khoảng cách; đổi giờ thực ⇄ T+ (§13.6); **hành lang xe từ `host.state.leg`** (D11, sửa sau phản biện: bản trước chỉ có điểm đến lộ trình, `checkpoints = []`, `hostPage.corridor` là bản sao số của chặng demo): điểm hành lang = xuất phát → vùng từng bước theo thứ tự (cả hai nơi nhánh), checkpoints = mọi vùng (§6.2 (2) ≥ `vehicles.minDistanceFromCheckpoint`), cấu hình = `leg.vehicles`; bỏ `hostPage.corridor`; `leg.id` đổi → tự tính lại + gửi `host.candidates`; `sim.ts --leg mini`: bot Host nạp `mini`, mở cuộc đua, nhập giờ xuất phát, N bot đi A* tới từng vùng (5 Hz, `--speedup ≤ 3`), mở hộp, gửi nhiệm vụ (có `answer` đúng từ file test), check-in; in request / dòng ghi so ngân sách §9.
- **Test (bắt buộc):** hàm thuần dựng ma trận từ `progress` (ô từng trạng thái, thời gian bước), dòng xếp hạng, chuyển `datetime-local` ⇄ ms **theo `leg.timezone`** (máy Host ở Paris nhập giờ Việt Nam → đúng), điểm hành lang + checkpoints từ `leg` (thử thách có `location` riêng nằm trong checkpoints); `sim` 3 bot chạy hết `mini` trong harness (`createTestHarness`), cả 3 về đích, thứ hạng có 3 dòng, dòng ghi / đội ≤ 110.
- **Preset:** `p7-host` (`/host.html?demo=1`: dữ liệu giả có tiến trình + xếp hạng).

## 7. Screenshot preset

- `npm run screenshot -- p7` chạy cả nhóm; `p7-*` không nằm trong lượt mặc định (stand-in offline). Tên + chủ ở §6. Mỗi track tối đa 4 vòng chụp → sửa.
- Người tích hợp chụp lại `p7-*`, `p6-*`, `p5-*`, `p4-mount`, `p3-idle` (offline không đổi) và xem PNG.

## 8. Ghép và kiểm tra

- **Thứ tự: A → B → C → E → D** (D độc lập: chỉ tài liệu + CLI + file test; ghép cuối để tài liệu khớp hành vi thật).
- **Xung đột dự kiến:** `config.ts` (khối riêng), `screenshot.ts` (dòng riêng), `main.ts` (chỉ B; C chỉ qua `RaceHud`), `RaceRoom.ts` (chỉ A), `shared/*` (chỉ thêm trường tùy chọn, báo cáo), `worker/legs/test/*` (D; A chỉ đọc).
- **Người tích hợp:**
  - `npm run build && npm test`; `npm run leg:check -- worker/legs/paris-demo.json` (chỉ ô trống), `… test/mini.json` (sạch);
  - `npm run dev:api` + `npm run dev`: Host `/host.html` nạp `mini`, tạo 2 đội, mở cuộc đua; 2 trình duyệt `/?race=paris`: thấy "Xuất phát ở vị trí thứ 1 / 2" một lần ở Bir-Hakeim trên mặt cầu; nhập giờ → đồng hồ; chạy hết chặng; F5 giữa chừng; tạm dừng; `npm run sim -- --leg mini`; tắt `wrangler dev` giữa chừng rồi bật lại → đúng bước;
  - `npm run screenshot -- p7 p6 p5 p4-mount p3-idle`; `npm run ride-check` (offline, không đổi);
  - `TODO.md`: xóa các dòng Phase 7 đã làm, thêm ponytail còn lại (bãi xe không tọa độ, xe `parked` gần điểm tương lai hiện cho đội sau, thảm dùng bán kính vùng, ZonePanel thiếu "vừa rời đi", Host tối giản, ghi dòng `upgrade` / `login` chưa có trần theo cửa sổ); `CLAUDE.md`: thư mục `race/`, `shared/src/leg`, lệnh `leg:check`, `docs/LEG_FORMAT.md`; README: cách nhập chặng thật;
  - commit `feat(phase7): race engine lõi`.
- Không để `wrangler dev` / `workerd` / `vite` chạy khi xong.

## 9. Ngân sách (cuộc đua 2 giờ; SPEC §3: < 40 000 request, < 20 000 dòng ghi)

Phase 7 thêm (mỗi đội, chặng 10 bước): tin lên ≈ 6 lần mở hộp (+ ~4 lần bị từ chối), 3 nhiệm vụ, ≤ 3 check-in, ~30 lần mở Sổ mật thư ≈ **46 tin**; dòng ghi ≈ `step_progress` 3/bước × 10 = 30, `teams.state` 10 + giờ xuất phát 1, sự kiện ~2/bước × 2 dòng = 40 + 4, bãi xe ≤ 5 × 3 = 15 → **≈ 100 dòng**. `startOrder` gộp vào dòng kết nối sẵn có. Đọc: `step_progress` 1 lần khi khởi động (≤ 200 dòng), sau đó RAM.

| | 7 đội (dự kiến) | 20 đội (SPEC) |
|---|---|---|
| Request Phase 6 (điển hình / xấu nhất) | ≈ 8 960 / 12 750 | ≈ 25 400 / 36 300 |
| + tin đua của đội (÷ 20) | + 16 | + 46 |
| + Host (giờ xuất phát, trạng thái, nạp chặng ≈ 40 tin ÷ 20) | + 2 | + 2 |
| **Tổng request** | **≈ 8 980 / 12 770** ✓ | **≈ 25 450 / 36 350** ✓ (biên xấu nhất 9 %) |
| Dòng ghi Phase 6 | ≈ 5 320 | ≈ 7 100 |
| + `step_progress` | + 210 | + 600 |
| + `teams.state` | + 77 | + 220 |
| + sự kiện đua | + 308 | + 880 |
| + bãi xe (xe + sự kiện) | + 105 | + 300 |
| + `meta` (chặng, trạng thái) | + 10 | + 10 |
| **Tổng dòng ghi** | **≈ 6 030** ✓ | **≈ 9 110** ✓ |

- 7 đội Phase 6: WS mở 25, vị trí 7 × 5 × 7 200 × 70 % ÷ 20 = 8 820 (100 %: 12 600), thao tác ≈ 32, Host 10–20, đăng nhập 28, alarm 40; dòng: snapshot 3 600 + replay 720 (không phụ thuộc số đội), sự kiện ≈ 630, xe ≈ 190, đội ≈ 120, alarm + meta 60.
- Tin gửi xuống (không tính phí): `race` mỗi chuyển trạng thái (~1 KB), `book` (~2–6 KB / lần mở), `zone`, `host.state` thêm `progress` + `ranking` (20 đội × 10 bước ≈ 16 KB / lần đẩy, ≤ 1/s khi có đổi).
- CPU DO: +1 `hypot` / vị trí (vào vùng) + (D21) 1 so khóa vùng; `parseLeg` 1 lần khi nạp (≈ 1 ms).

## 10. Rủi ro

- **Spawn / hộp trên nóc cầu cạn** (đã thấy ở Bir-Hakeim, §2.1): sửa ở B (D17: bỏ qua sàn ray, không chọn "mặt thấp nhất" vì sẽ rơi xuống gầm cầu bắc qua đất); preset `p7-start` + kiểm tay. Nếu sửa `surface()` chung làm hỏng respawn / bậc kè Phase 3–5: chỉ áp dụng cho spawn từ server và hộp, không cho `respawn()`.
- **Điểm tin cậy tụt sau vị trí thật** (D4): mạng khựng > 2 s thì vài giây sau đội mới "tới" vùng (đuổi kịp ở tốc độ xe ≈ 6,5 m/s). Chấp nhận; nếu thấy phiền: tăng trần (`speedLeadMs`) chứ không bỏ giới hạn.
- **Test Phase 6 dựa vào `respawn` xa** phải viết lại (A): chặng `near` + helper đi bộ.
- **Host nhập giờ sai múi giờ**: ô nhập theo giờ máy Host, hiện kèm múi giờ chặng và "T+hh:mm" xem trước; nút "Bây giờ".
- **Đứng im trên thảm khi hết phạt**: không có vị trí nào tới server → client gửi `checkin` định kỳ (D19).
- **Đồ thị đường thiếu lối** (quảng trường đi bộ, Louvre): `leg:check` báo sớm "không đi bộ tới được" thay vì để đội kẹt.
- **zod lọt vào bundle client** nếu ai đó import giá trị từ `@race/shared/leg` ở client: người tích hợp `grep ZodError client/dist` = 0.
- **`Tab`** là phím trình duyệt dùng để chuyển focus khi chuột nhả: panel Sổ mật thư tự nghe `keydown Tab` khi đang mở (C).
- **Test harness chậm** (workerd thật, ~20 s mỗi file live): chặng `mini` + `respawn` để test nhanh; tách file test theo track.

## 11. Để sang phase sau

- **Phase 8:** kiểm `task.params` theo kiểu + cột `task_state` (JSON, tiến độ mini-game khi thoát, §8.10) thêm bằng ALTER có phiên bản; `hostApproval.contactUrl` xuống client; `verifyTask` thật, op `branch` / `accept` / `submitted` / `quit`, `CardStatus` `pending` / `rejected`, câu gợi ý → "Nhận thử thách" (server giữ `task` cho tới khi nhận), mã bài nộp, hàng chờ duyệt tối giản; bot trả lời sai / gửi bài.
- **Phase 9:** phạt (bắt buộc đi bộ từ `SpeedWindow`, bỏ cuộc), yếu tố đặc biệt (thêm tham số vào khối `specials` – thêm trường tùy chọn, không phá file cũ).
- **Phase 10:** Host đầy đủ (soạn chặng + lịch sử phiên bản trong SQLite, khóa bước đã mở, sửa chính tả → nhãn "đã cập nhật", Công bố kết quả, phạt thủ công, dịch chuyển người kẹt, xem Sổ mật thư của đội, "vừa rời đi" ở ZonePanel, loại / cứu đội cuối).
- **Phase 11:** bot 10 bước có tình huống; **Phase 12:** đo thật so §9.

## 12. Câu hỏi mở cho anh (đều có mặc định, không chặn việc làm)

1. **Câu của NPC ở thảm:** vì mỗi đội xuất phát một lúc, thứ tự bước lên thảm không phải thứ hạng. **Mặc định:** "Đội X, các bạn đã về đích! Thời gian: hh:mm:ss. Thứ hạng chính thức sẽ được Host công bố." (không nói "đội thứ n").
2. **Đội vào game khi Host chưa nhập giờ xuất phát:** **Mặc định:** vẫn chơi bình thường, đồng hồ hiện "--:--", Host thấy cảnh báo đỏ; khi Host nhập, đồng hồ tính từ giờ đó (kể cả quá khứ). (Phương án khác: tạm lấy giờ vào game.)
3. **Mở cuộc đua:** Host phải bấm "Mở cuộc đua" trước khi đội mở được hộp; trước đó đội vẫn vào game, đi lại, đọc mật thư 1. **Mặc định:** như vậy.
4. **Tạm dừng:** đi lại được, không mở hộp / làm nhiệm vụ / check-in, đồng hồ vẫn chạy và không trừ (anh đã chọn mặc định này). **Mặc định:** như vậy.
5. **Nhiệm vụ Phase 7:** nút "Hoàn thành (tạm)" cho qua mọi nhiệm vụ khi đội đứng đúng vùng. **Mặc định:** như vậy (Phase 8 thay).
6. **Nhập chặng thật:** anh viết file theo `docs/LEG_FORMAT.md`, chạy `npm run leg:check -- <file>`, rồi nạp trên trang Host ("Nạp chặng từ file"); file lưu trong cuộc đua (SQLite), không cần deploy lại, không nằm trong static asset. **Mặc định:** như vậy; muốn đóng gói sẵn vào Worker thì đặt file vào `worker/legs/` và thêm một dòng ở `worker/src/race/leg.ts`.
7. **Chỗ xuất phát:** tâm cầu Bir-Hakeim theo OSM = lối đi bộ giữa cầu, dưới cầu cạn metro; các đội xuất hiện quanh đó trong 5 m, quay mặt về phía Passy (bờ phải). **Mặc định:** như vậy.
8. **Tới điểm bằng xe:** vào vùng trên xe vẫn ghi "đã tới" (`arrived_at`), nhưng phải xuống xe mới mở hộp. **Mặc định:** như vậy.
9. **Bãi xe khi file chặng không có `bikeParking`:** xe đứng tại chỗ (vẫn thành xe trống ai cũng lấy được); `leg:check` gợi ý tọa độ bãi để anh chép vào file. **Mặc định:** như vậy.
10. **Bảng "Tại điểm này":** làm bản tối giản ở Phase 7 nếu kịp (đội nào đang ở cùng điểm, đang làm bước gì); "vừa rời đi n phút trước" ở Phase 10. **Mặc định:** như vậy.
11. **Thử thách có câu gợi ý:** Phase 7 hiện câu gợi ý và nội dung cùng lúc; bước "Nhận thử thách" (ẩn nội dung tới khi bấm) làm ở Phase 8. **Mặc định:** như vậy.
12. **Tạm dừng có đóng băng di chuyển không?** (phản biện: khi tạm dừng mà vẫn đi được, đội đang đi đường gần như không mất gì, còn đội đang đứng ở hộp / thảm chờ trọn thời gian tạm dừng.) **Mặc định:** không đóng băng; vào vùng vẫn ghi đúng giờ, đội đứng trên thảm được check-in ngay khi tiếp tục; `RACE_RULES.md` §11 đã ghi hệ quả. (Phương án khác: khóa di chuyển của mọi đội khi tạm dừng – mọi đội mất như nhau.)
13. **Đổi chặng sau khi đội đã vào game:** **Mặc định:** không cho; muốn đổi thì tạo cuộc đua mới (race id mới) rồi nạp chặng → tạo đội → phát mã → mở. Diễn tập dùng race id riêng, không dùng mã đội của buổi thật (thứ tự vào game của mã đó sẽ bị dùng mất).
