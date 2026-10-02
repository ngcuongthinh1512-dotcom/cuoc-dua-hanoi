# Phase 7 – Review vòng 2: COMPLETENESS CRITIC

Trạng thái: XONG. Repo `main` @ 82b90d6. Không sửa mã nguồn; mọi script tạm nằm trong scratchpad (`npczone.mts`, `rv2c-cars*.mts`, `rv2c-park.mts`, `rv2c-fields.mts`, `rv2c-rack-typo*.json`). Cổng: Vite 5437 (in-process, tự tắt); workerd do `createTestHarness` tự chọn cổng (tự tắt).

## 1. Đã chạy (kết quả thật)
| Kiểm | Kết quả |
|---|---|
| NPC người đi bộ quanh hộp / thảm (offline dev world, NPC bật, seed 3, hộp `reveal` SAU khi NPC đã chạy như tin `box` thật, mẫu 0,5 s × 40 s, so lượt không vùng) | L1 Khải Hoàn Môn: mẫu người trong 23 m **62 → 2**; Concorde: **87 → 1**; giữa cầu Iéna (thảm): 0 → 0 (không ai tới cả hai lượt). ĐẠT |
| NPC xe trên lòng đường (tâm vùng = chỗ một xe đang chạy) | Champs-Élysées: 14 → **0** mẫu trong 20 m (xe đổi đường). **Rue de Rivoli (454, 17): 90 s không vùng 151 mẫu trong 20 m / 77 đứng yên → 90 s có vùng 480 / 252 đứng yên (4 xe, lâu nhất 44 s)**. KHÔNG ĐẠT ở chỗ này (F2) |
| Bãi xe + bắt buộc đi bộ end-to-end qua workerd (`rv2c-park.mts`, `nearLeg`) | đạp xe vào nơi riêng của T1 → `notice bikeParked` + tin `bikes` (owner null, parked, đúng tọa độ bãi); giữ xe khi nhận L2 `mandatory: walk` → `bikeParked` + `clueNew`; claim trong L2 → `ok:false, reason:'walkOnly'`. ĐẠT |
| Diff cơ học schema zod ↔ `docs/LEG_FORMAT.md` (`rv2c-fields.mts` đi hết `legSchema`) | mọi đường trường của schema có trong tài liệu, không có trường chỉ-trong-tài-liệu. Lệch về ý nghĩa: xem F7 |
| `leg:check` mini / paris-demo / paris-demo.filled | mini: Hợp lệ, **1 cảnh báo** (LEG_FORMAT §10 nói "không cảnh báo"); paris-demo: 2 cảnh báo + 18 ô trống; filled: 2 cảnh báo |
| `leg:check` với bãi xe gõ nhầm (lệch 111 km / 74 km) ở `task.location` và nơi nhánh | **"Hợp lệ"**, không lỗi, không in tọa độ bãi; cùng lỗi ở `destination.bikeParking` → LỖI "ngoài bản đồ" (F5) |
| `vitest scripts/leg-check.test.ts` | 1 fail (timezone, leftover đã biết của 82b90d6) |
| `npm run sim -- --leg paris-demo-filled` | lỗi "Không tìm thấy chặng" (file thật là `paris-demo.filled.json`) |
| `npm run sim -- --leg worker/legs/test/paris-demo.filled.json --bots 2 --speedup 2` (chặng demo 10 bước, nhiệm vụ tạm) | **2 / 2 về đích, xếp hạng 2 dòng**, ~19 phút thật; request ngoại suy 20 đội × 2 h ≈ 36 036 (< 40 000); exit 1 chỉ vì công thức dòng ghi / đội (F12) |

## 2. Checklist nghĩa vụ Phase 7
Ký hiệu: ✓ = có bằng chứng; ◐ = có một phần / chỉ unit test; ✗ = thiếu; — = để phase sau theo kế hoạch.

### SPEC §15 mục 7
| Nghĩa vụ | Trạng thái | Bằng chứng |
|---|---|---|
| schema zod | ✓ | `shared/src/leg/schema.ts`; `leg.test.ts`; diff F7 |
| nạp chặng | ✓ | `engine.ts:199-223`; `RaceRoom.race.test.ts:59-67, 80, 159`; e2e #1 |
| máy trạng thái đội | ✓ | `steps.ts:70-151`; `steps.test.ts`; e2e #3, #6 |
| geofence | ✓ | D4 `TrustedPoint`; `RaceRoom.race.test.ts:212-260`; e2e #4 |
| hộp mật thư | ✓ | `boxesOf` `steps.ts:157`; `race.test.ts:90-110`; e2e #3 |
| `step_progress` mốc thời gian | ✓ | `db.ts:23-28` (19 cột); `race.test.ts:100` |
| Sổ mật thư §8.11 | ◐ | `engine.ts:152`; restart test `race.test.ts:271`; e2e #3. Thiếu nút cuốn sổ (F10), offline kẹt "Đang tải…" (e2e) |
| Chặng dừng + NPC | ✓ | `PitStop.ts`; e2e #5 (câu NPC, celebrate, khán giả). NPC không dùng clip `talk` (D19) → F1b |
| xếp hạng | ✓ | `ranking.ts`; `ranking.test.ts` (hòa, thiếu giờ, đồng hồ âm, chưa về đích, slot); e2e #7 |
| "chạy thử bằng chặng demo, nhiệm vụ tạm cho qua" | ✓ | trước đây chỉ `mini` (6 bước); lượt sim của tôi trên `paris-demo.filled` 10 bước: 2/2 về đích (mục 1) |

### SPEC §8 (Phase 7 phần cần), §13.8, §17.9–17.12
| Nghĩa vụ | Trạng thái | Bằng chứng |
|---|---|---|
| §8.1 định nghĩa hoàn thành 4 loại; lộ trình trước Chặng dừng xong khi vào vùng | ✓ | `steps.ts:98-101`; `race.test.ts:136-145` |
| §8.2 F mở hộp, đúng bước, đúng vùng, bước sau không mở được | ✓ | `steps.ts:126-138`; e2e #3 (op bước sau im lặng) |
| §8.3 thẻ theo loại + màu, phong bì | ✓ | track C, preset `p7-card*` (visual review) |
| §8.4 chọn nhánh (đổi nhánh: Phase 8) | ✓ | e2e #3 nhánh B ở nơi riêng; `race.test.ts:46` nhánh A |
| §8.5 không có Vượt rào | ✓ | `check.ts:82-84`; `race.test.ts:61` |
| §8.6 thảm, chờ phạt, khán giả | ◐ | phạt luôn 0 ở Phase 7 (chỉ preset `p7-pit`); đội đã về đích quay lại thân được và lấy xe (F9) |
| §8.8 câu gợi ý hiện cùng nội dung (câu hỏi mở 11) | ✓ | `cardOf` `steps.ts:183-184` |
| §8.9 Host duyệt: stub "Hoàn thành (tạm)" | ✓ | e2e #3 (D1 nhánh B `host_approval`) |
| §8.10 vào lại đúng bước / chỗ; server khởi động lại | ✓ | e2e 2b, #10; `race.test.ts:271` |
| §8.10 "sau khi Host kết thúc … chỉ đọc" cho đội CHƯA về đích | ✗ | F4 |
| §13.8 thứ tự check-in, giờ về đích, chính thức, khoảng cách | ✓ | ma trận Host `hostView.ts:225-263`; e2e #7 |
| §13.8 loại / cứu, Công bố kết quả, trình chiếu | — | Phase 10 |
| §17.9 không tự điền nội dung thật | ✓ | chỉ `(GIẢ)` trong `worker/legs/test/*`; demo để trống |
| §17.10 hộp hiện dần, chỉ trong 150 m | ✓ | `race.test.ts:109-110`; e2e #3 (148,2 m) |
| §17.11 NPC tránh vùng hộp / thảm (§17.5) | ◐ | người đi bộ ĐẠT; xe KHÔNG ĐẠT ở Rivoli (F2); race khi khởi tạo (F3) |
| §17.12 xuất phát từ file chặng, đồng hồ từ giờ Host nhập, "Xuất phát ở vị trí thứ n" 1 lần, không Vượt rào | ✓ | `race.test.ts:69-77`; e2e #2, 2b |

### `docs/plans/phase7.md` D1–D25
| D | Trạng thái | Ghi chú |
|---|---|---|
| D1 zod chỉ ở server | ✓ | review vòng 1: `client/dist` không có zod |
| D2 máy trạng thái, ghi trước gửi sau | ✓ | `engine.test.ts:57-96` |
| D3 `clue_opened_at` bước 1 | ✓ | `race.test.ts:149` |
| D4 điểm tin cậy | ◐ | ✓ cho open / checkin / xe / tick (82b90d6); op `task` không kiểm đang ngồi xe (F8) |
| D5 hộp theo trạng thái | ✓ | |
| D6 `step_progress` 19 cột | ✓ | `db.ts:23` |
| D7 thẻ không lộ | ✓ | `steps.test.ts` quét `mini` + `paris-demo-filled` |
| D8 Sổ mật thư | ◐ | F10 (nút), offline |
| D9 trạng thái + tạm dừng | ◐ | server ✓ (`race.test.ts:118-124, 185-190`); người chơi không thấy trạng thái (F4) |
| D10 xếp hạng | ✓ | |
| D11 nạp chặng + khóa | ✓ | |
| D12 `leg:check` | ◐ | bảng tóm tắt không in bãi xe; bãi xe của nơi nhiệm vụ không kiểm bản đồ (F5); mã `timezone` chết (leftover) |
| D13 schema | ✓ | |
| D14 nhiệm vụ tạm | ✓ | |
| D15 giờ xuất phát | ◐ | tương lai / 'now' / sau joinedAt có test hoặc e2e; **"sau giờ về đích → lỗi" không có test nào, xem trước không báo** (F11) |
| D16 `startOrder` + banner | ✓ | |
| D17 điểm xuất phát / mặt cầu | ✓ | visual vòng 1 (y 1,60 ở 8 chỗ) |
| D18 bãi xe / đi bộ | ◐ | server ✓ (tôi chạy end-to-end); xe ở bãi chồng đúng một điểm (F6) |
| D19 Chặng dừng | ◐ | NPC không `talk`; khán giả có thể về thân (F9) |
| D20 vùng cấm NPC | ◐ | F2, F3 |
| D21 "Tại điểm này" | ✓ | `race.test.ts:164-176` |
| D22 HUD đồng hồ / phạt | ✓ | |
| D23 F | ✓ | `RaceClient.test.ts`; e2e #3 |
| D24 bảo mật | ✓ | vòng 1 |
| D25 protocol v2 | ✓ | |

### 13 câu hỏi mở (mặc định)
Mặc định 1–13 đều đã hiện thực đúng (đối chiếu code: câu NPC `format.ts`, "--:--", `raceNotOpen`, tạm dừng không trừ, "Hoàn thành (tạm)", Host nạp file, rải 5 m yaw 33, vào vùng trên xe ghi "đã tới", không `bikeParking` → xe đứng tại chỗ, ZonePanel tối giản, gợi ý + nội dung cùng lúc, không đóng băng, khóa đổi chặng). **Chưa ghi ở đâu cho anh xác nhận** và đề xuất SPEC §17.13 của người lập kế hoạch chưa vào SPEC (F1c).

### TODO.md mục Phase 7 ↔ code
Mọi dòng trừ "nội dung chặng thật" đã làm xong nhưng còn nguyên trong TODO; các ponytail kế hoạch §8 yêu cầu ghi thì chưa có (F1b).

### RACE_RULES.md ↔ code
Lệch: F10.

## 3. Findings (nặng trước)

### F2 [major] Xe NPC: vùng cấm chỉ đổi lựa chọn đường, ở Rue de Rivoli còn làm xe dồn và đứng trong vùng
- `client/src/npc/traffic.ts:393-399`: vùng chỉ lọc cạnh kế tiếp khi xe nối tuyến (theo trung điểm cạnh, và chỉ khi còn lựa chọn khác); không có gì giữ xe đang ở trong vùng ra ngoài hay cấm dừng trong vùng. `crowd.ts:507` đẩy người ra, xe thì không.
- Đo (`rv2c-cars2.mts`, tâm vùng (454,2; 16,9) trên Rue de Rivoli, r 20): 90 s không vùng: 151 mẫu xe trong 20 m, 77 mẫu đứng yên (1 xe, đèn đỏ); 90 s có vùng: **480 mẫu, 252 đứng yên, 4 xe, lâu nhất 44 s**. Champs-Élysées thì đúng (14 → 0). Tức là ở nút có đèn này vùng không đẩy xe ra mà còn làm xe dồn lại trong vùng (cơ chế chưa truy; nghi: bộ lọc ép xe rẽ từ làn không được rẽ, trọng số 0 → `w = 1` cho mọi hướng ở `:412`, rồi tranh quyền vào nút).
- SPEC §17.5: "NPC không đứng chặn vùng hộp mật thư / thảm về đích". Hộp thật thường ở vỉa hè sát đường hoặc góc giao lộ; vùng 15–40 m (+3 m) gần như luôn phủ lòng đường. Đội phải qua đường tới hộp gặp hàng xe đứng (xe có collider đẩy người chơi). Unit test Phase 4B không bắt được vì không có preset / lượt chạy nào bật NPC cùng hộp (mọi preset `p7-*` có `npc=0`).

### F1 [minor] Bước tài liệu của người tích hợp chưa làm: HANDOFF / README không dẫn tới cách nhập chặng
- `docs/reports/HANDOFF.md:10` vẫn ghi Phase 7 "Chưa làm — DỪNG chờ người dùng bảo", `:28` "Nội dung chặng … cần trước Phase 7"; memory của dự án bảo phiên mới đọc HANDOFF trước → phiên sau tưởng Phase 7 chưa làm.
- `README.md` không nhắc `docs/LEG_FORMAT.md` hay `npm run leg:check` (kế hoạch §8: "README: cách nhập chặng thật"), trong khi anh sắp tự nhập chặng.
- `CLAUDE.md:13-14`: còn `race/boxes.ts` (đã xóa ở track A), "protocol/ (v1 …)" (nay v2), "later zod schema (Phase 7)"; thiếu `shared/src/leg`, `worker/src/race/{engine,steps,ranking,tasks,leg}.ts`, `client/src/race/` (RaceClient, PitStop, ui/RaceHud), `player/railDecks.ts`, lệnh `npm run leg:check`, `docs/LEG_FORMAT.md`, URL `?start=`, `?boxes=`, `?mat`, `?card=…`, preset `p7-*`; `npm run sim` ghi "≤ --speedup 3" nhưng `sim.ts:242` chỉ nhận 1…2.

### F1b [minor] TODO.md mục Phase 7 chưa cập nhật
- `TODO.md:117-126`: 8/9 dòng đã làm xong (Vượt rào, banner, đồng hồ, respawn / ZonePanel, `setExclusionZones`, Bir-Hakeim, F/openBox/celebrate, zod) vẫn còn nguyên; chỉ dòng nội dung chặng thật còn đúng.
- Thiếu các ponytail kế hoạch §8 bắt ghi: bãi xe không tọa độ (xe đứng tại chỗ), xe `parked` gần điểm tương lai hiện cho đội sau (D18), thảm dùng bán kính vùng (D19 `matRadius`), ZonePanel thiếu "vừa rời đi", Host tối giản; các TODO từ báo cáo track B (thảm luôn hướng bắc, dải ray chỉ biết ở chunk đã tải, NPC dẫn chương trình không có clip `talk` – D19 ghi "talk / wave", "Bạn có 1 mật thư mới" chưa làm); bộ đếm `maxConnects` chỉ trong RAM (fix-server §5).
- Dòng cũ khác: `:114` "xếp lại ở Phase 7: rải đội" (đã làm), `:129` Phase 11 "`npm run sim`, `paris-demo.filled.json`" (đã có), `:33` `bicycle_parking` "dùng ở Phase 7" (đã dùng ở `leg:check`).

### F1c [minor] SPEC §17 chưa có quyết định Phase 7; §13.3 trái quyết định "không trừ giờ tạm dừng"
- `docs/SPEC.md:766` "Tạm dừng / Tiếp tục (đồng hồ đua của mọi đội dừng theo)" vẫn đúng chữ, không có mục §17 nào ghi đè; §8.6 "đội thứ 1". Danh sách đề xuất §17.13 trong `docs/reports/phase7-plan.md` (cuối file) chưa vào SPEC, 13 mặc định câu hỏi mở chưa được ghi lại ở TODO / HANDOFF để anh xác nhận. Phase 10 (Host đầy đủ) đọc SPEC sẽ làm ngược. Việc của điều phối viên.

### F3 [minor, PLAUSIBLE] Vùng cấm NPC mất nếu danh sách hộp đổi trong lúc `Npc.create` đang tải asset
- `client/src/main.ts:330-340`: `zones: npcZones()` lấy lúc gọi, rồi `Npc.create` chờ `loadNpcAssets()`; `boxes.onChange` (`:324`) gọi `npcs?.…` khi `npcs` còn `undefined` → bỏ qua; `.then((n) => npcs = n)` không đặt lại vùng. Welcome / `box reveal` tới đúng khoảng đó (vào lại nhanh khi đang đứng cạnh hộp) → NPC không tránh hộp tới lần đổi hộp sau. Sửa: `.then((n) => { npcs = n; n.setExclusionZones(npcZones()); })`.

### F4 [minor] Người chơi không thấy trạng thái cuộc đua; đội chưa về đích sau "Kết thúc" không có chế độ chỉ đọc
- `RaceView.status` chỉ dùng để chặn check-in (`RaceClient.ts:77`); `RaceHud` không hiện gì cho `lobby` / `paused` / `finished` (grep). Đội chỉ biết khi bấm F và nhận toast; Host bấm "Mở cuộc đua" cũng không có thông báo cho đội.
- SPEC §8.10 / RACE_RULES §12: sau khi Host kết thúc, vào lại "xem Sổ mật thư và kết quả (chỉ đọc)": `RaceClient.ts:44` chỉ chuyển khán giả khi `finishAt`; đội chưa về đích vẫn đi, và vào vùng vẫn ghi `arrived_at` + dời xe vào bãi (`steps.ts:97`, `running=false` chỉ chặn bước tiếp). (Trùng một phần m2 vòng 1, vẫn chưa sửa.)

### F5 [minor] `leg:check`: bãi xe của nơi làm nhiệm vụ không được kiểm bản đồ và không in ra; bãi xe gõ nhầm vẫn "Hợp lệ"
- `shared/src/leg/check.ts:226-231` `outsideMap` chỉ kiểm `destination.bikeParking`, bỏ `task.location.bikeParking` và nơi nhánh; `scripts/leg-check.ts` bảng tóm tắt không in tọa độ bãi đã có (D12 hứa in "bãi xe" mỗi điểm).
- Tái hiện: `mini` với `T1.task.location.bikeParking.lat = 47.8601` và nhánh B `lon = 3.2972` (lệch 111 km / 74 km) → "Hợp lệ: 2 cảnh báo, 0 ô còn trống", không một dòng nào về bãi; cùng lỗi ở `L1.destination.bikeParking` → LỖI "nằm ngoài bản đồ". Server cũng nhận (`parseLeg` dùng cùng `checkLeg`). Trong game: đội đạp xe vào nơi T1 → `BikeService.park` dời xe ra ngoài bản đồ (đã thấy `park` dời đúng tọa độ bãi ở `rv2c-park.mts`).

### F6 [minor] Xe ở bãi chồng lên nhau tại đúng một điểm
- `worker/src/race/BikeService.ts:184` gán `at` (x, z) giống hệt cho mọi xe vào cùng bãi; không có giá để xe (SPEC §6.4 "model giá để xe"), trong khi `LEG_FORMAT.md:141` hứa "đứng thành hàng". ~7 đội, bước nhiệm vụ tại điểm / lộ trình đi bộ → nhiều xe trùng tọa độ: đội thấy một xe, F lấy một, chiếc kế hiện ra cùng chỗ.

### F7 [minor] `LEG_FORMAT.md` lệch với code
- Đã biết (leftover 82b90d6): `:52` "Sai tên: `leg:check` cảnh báo" và `:372` mức CẢNH BÁO → nay là LỖI, server không nạp.
- `:196` "`mini` … ra 'Hợp lệ', không cảnh báo" → thực tế 1 cảnh báo (Bir-Hakeim).
- `:102` `challenge.task` "Bắt buộc: có" nhưng schema `task: taskSchema.prefault({})` (`schema.ts:86`): bỏ trống vẫn nạp (chỉ ra ô trống).
- Trường được tả như có tác dụng nhưng Phase 7 bỏ qua, không ghi "phase sau": `mapLabels` (`:56`, không ai đọc ngoài schema), `presence.showOthersOnMinimap` (`:57`, server gửi trong welcome, client không đọc), `task.timeLimitMinutes` (`:159`, chỉ hiện chữ, không giới hạn), `hostApproval.contactLabel / contactUrl` (`:63`, không gửi tới đội ở Phase 7). Host đặt các giá trị này khi chạy thử sẽ không thấy gì đổi.

### F8 [minor] Op `task` được nhận khi đang ngồi xe (D4)
- D4: "Thao tác (`open` / `task` / `checkin`) … đang ngồi xe → `boxRiding`". `engine.ts:162` không truyền `riding` cho `task`, `steps.ts:139-150` không kiểm; `settle(…, true)` ở `:149`. Hệ quả: đạp xe trong vùng bấm "Hoàn thành (tạm)" → qua; nếu bước kế là lộ trình đi bộ thì xe bị `park` ngay dưới người đang đạp.

### F9 [minor] Đội đã về đích quay lại thân và lấy xe chung
- `client/src/main.ts:451`: đội `spectating` bấm `V` → `flying = false` → thân hoạt động lại, F lấy xe; server không chặn đội đã về đích (`RaceRoom.ts:370` → `bikes.onTeam(…, walkOnly)`, `walkOnly` = false ở Chặng dừng). SPEC §8.6: sau check-in là khán giả. Đội đã xong có thể lấy xe ở bãi của đội đang làm thử thách. RACE_RULES §2 "Camera khán giả" cũng không nói tới `V`.

### F10 [minor] RACE_RULES.md lệch với game
- `RACE_RULES.md:233` "Tổng phút phạt luôn hiện ở góc trên bên phải, cạnh đồng hồ": đồng hồ ở góc **dưới** phải và dòng PHẠT chỉ hiện khi > 0 (`client/src/ui/HUD.ts:109-111`).
- `:185` "nút hình cuốn sổ trên màn hình": không có nút (chỉ chữ gợi ý "Tab: Sổ mật thư", `RaceHud.ts:226`); SPEC §8.11 cũng yêu cầu nút.
- `:100` bãi xe "khi mở mật thư của một nhiệm vụ tại điểm": thiếu luật D18 cho nhiệm vụ ở nơi khác (xe vào bãi khi **tới** nơi đó).

### F11 [minor] "Giờ xuất phát sau giờ về đích → lỗi" chưa được kiểm ở đâu
- `engine.ts:189` có nhánh, nhưng không test nào (`grep "về đích của đội"` trong `*.test.ts` = 0), e2e không thử; xem trước Host (`hostView.ts:148-153`) không báo (visual vòng 1 #4). Các cạnh khác của D15 có bằng chứng: tương lai > 60 s (`race.test.ts:127`), `'now'` (`:130`), quá khứ (`:132`), sau `joinedAt` (e2e 2b).

### F12 [minor] Công cụ `sim` không chạy được như kế hoạch ghi
- `npm run sim -- --leg paris-demo-filled` → "Không tìm thấy chặng" (`scripts/sim.ts:153` tìm `paris-demo-filled.json`, file là `paris-demo.filled.json`) dù trang Host liệt kê `paris-demo-filled` là chặng đóng gói.
- `--leg mini` luôn exit 1 vì `rowsPerTeam = c.rows / bots` (`sim.ts:424, 468`) tính cả snapshot / replay toàn cuộc đua (e2e vòng 1, chưa sửa) → cổng kế hoạch §8 "`npm run sim -- --leg mini`" không qua được.
- Leftover đã biết: `scripts/leg-check.test.ts` fail (timezone), `sim.ts` kịch bản claim (D4).

## 4. Không phải lỗi (đã kiểm, đạt)
- Bãi xe + bắt buộc đi bộ end-to-end (server + tin tới client) – mục 1.
- Người đi bộ NPC tránh hộp / thảm trong game đang chạy – mục 1.
- Xếp hạng: hòa, thiếu giờ, đồng hồ âm, chưa về đích, đội chưa vào game – `ranking.test.ts` đủ.
- `welcome.raceTime` khi giờ xuất phát ở quá khứ: e2e 2b (khớp tuyệt đối), `race.test.ts:151-155`.
- Vào lại giữa bước / server khởi động lại: e2e 2b, #10; `race.test.ts:271`.
- Nhánh Lựa chọn kép ở nơi riêng + stub `host_approval` trong client thật: e2e #3.
- Mọi mã `notice` có chữ tiếng Việt: `Toasts.ts` `Record<NoticeCode, string>` (thiếu mã → lỗi biên dịch); lý do claim xe → `Bikes.ts:212`.
- Trang Host có đủ phần Phase 7 hứa (trạng thái + xác nhận kèm ô trống, nạp chặng / file, giờ xuất phát theo múi giờ chặng + Bây giờ + Xóa + T+, `joinedAt`, `host.notice`, cảnh báo đỏ, ma trận + Phạt / Về đích / Chính thức / Cách, giờ thực ⇄ T+, hành lang tự tính lại).
- Không còn wrangler / workerd / vite / Chrome của tôi chạy.
