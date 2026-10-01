# Phase 7 – Track B (ghép client): báo cáo

Trạng thái: **XONG** (phần client; luồng online đầy đủ chỉ thử được sau khi ghép track A — xem "Còn lại").

## Đã làm
| Quyết định | Ở đâu | Ghi chú |
|---|---|---|
| D17 spawn / hộp không lên nóc cầu cạn | `client/src/player/railDecks.ts` (mới) + `CharacterController.surface()` + `main.ts` (`boxGround`) | Cột nằm trong dải cầu cạn đường sắt tầng ≥ 2 (`BridgeRec` rail, đọc từ `data/chunks/<key>.json`, tải khi cần) → tia bắt đầu cao hơn cầu cạn, bỏ mọi mặt trong `railLayerStep − railSlack` (4,5 m) dưới đỉnh. Ngoài dải: **giữ "mặt cao nhất"** y như cũ (đầu cầu Alexandre III → mặt cầu, không xuống đường kè). Áp cho mọi `surface()` (spawn, vào lại, respawn, xuống xe) — không ai đứng trên nóc metro. Spawn đang chờ (`pending`) đợi dữ liệu dải ray của chunk đó (vài ms, luôn có trước khi thế giới sẵn sàng). |
| D17 vào lại | `CharacterController.spawn(x, z, yaw, yHint?)`, `Player.setSpawn(…, yHint)` | `welcome.pose.y` → tia bắt đầu `raceClient.hintAbove` (1,5 m) trên đó (mặt đội đã đứng, không phải cầu phía trên); không có gì thì như thường. |
| D17 điểm xuất phát | `main.ts` welcome | `w.pose` → chỗ cũ; không có pose mà có `w.start` → chỗ xuất phát; không có cả hai → `playerSetup.spawn` (offline Concorde không đổi). |
| D4 vị trí trước op | `main.ts` `RaceClient.deps.op` | reset cổng vị trí của `NetClient` (ép gửi ngay) → `sendPose` → op. `ponytail`: chạm `NetClient.gate` (private) qua ép kiểu. |
| D5 hộp đã mở đổi màu tại chỗ, thảm | `net/ClueBoxes.ts` | `reveal opened:true` sơn lại cùng hộp (không dựng lại); `kind:'mat'` → thảm (`race/PitStop.ts matMesh`); `mat` getter; `onChange`. **Sửa lỗi Phase 6:** hộp trên cầu qua sông nằm ở đáy sông (tia đầu tiên trúng địa hình trước khi collider chunk cầu có, rồi chốt `placed`) → giờ mỗi khung hộp được nâng lên nếu có mặt cao hơn (không bao giờ hạ: chunk xa gỡ collider mà cờ vẫn thấy). |
| D19 Chặng dừng | `race/PitStop.ts` (mới), `RaceClient.frame`, `main.ts` | Thảm đỏ viền vàng 7 × 3,2 m ở tâm vùng + NPC dẫn chương trình (nhân vật UBC áo tối, bảng tên "Người dẫn chương trình"), quay mặt về đội, vẫy tay khi đội ở gần (mỗi 6 s) và khi về đích. `checkin` mỗi `checkinEveryMs` khi: đứng trong vùng thảm (bán kính vùng), đi bộ, `status === 'running'`, thẻ hiện tại là `pit_stop`, chưa về đích, đã qua `checkinAt` (không gửi khi còn lộ trình trước Chặng dừng — vùng đó xong bằng vị trí; không gửi khi tạm dừng / còn phạt → không spam toast). |
| D19 về đích → khán giả | `RaceClient.message` / `welcome`, `main.ts` | `finishAt` mới → `raceHud.finished(tên đội, officialMs)`, clip `celebrate`, NPC vẫy; sau `spectateAfterS` (4,5 s) → camera bay. Vào lại khi `view.finishAt` có sẵn → bay ngay. Đội đã về đích bấm `V` (không cần F3) để về thân / bay. Không gửi vị trí khi đang bay. |
| D20 vùng cấm NPC | `main.ts` | `boxes.onChange` → `npcs.setExclusionZones([...?npcZone, ...hộp/thảm (x, z, r)])`; NPC tạo sau cũng nhận. |
| D23 F | `Player.onInteract`, `RaceClient.interact` | Đi bộ + trong vùng hộp hiện tại (chưa mở, không phải thảm) → `race open` + clip `openBox`; ngoài vùng → xe như Phase 6; đang đạp xe → xuống xe như cũ. Bấm liên tục: tối đa 1 op / `opMinGapMs`. Offline DEV (`?boxes=`): F mở hộp tại chỗ (thử tay). |
| `inZone` cho HUD | `main.ts` | `RaceClient.frame(...).inZone` (offline: cùng hàm thuần `boxInReach`). |
| Login | `ui/Login.ts`, `net/session.ts` | "Chào mừng trở lại": giờ đua ("Đồng hồ đua chưa chạy (Host chưa nhập giờ xuất phát)" khi null), "Đang làm: <nhãn bước>" (`summary.step`: chuỗi nhãn; số = chỉ số → "Bước n+1"), lần cuối. |
| Config | `raceClient` | `railSlack`, `hintAbove`, `opMinGapMs`, `spectateAfterS`, `mat`, `host`. |

## Test
- `client/src/player/railDecks.test.ts`: dữ liệu chunk thật — tâm Bir-Hakeim nằm trong dải metro, hai lòng đường cách 6,6 m thì không; cột đo được (7,22 / 6,22 / 1,3 / −1) → 1,3; Alexandre III không có dải ray, mặt cầu (cao nhất) thắng đường kè dưới gầm; không có gì dưới cầu cạn → null.
- `client/src/race/RaceClient.test.ts`: `raceClock` (chưa có giờ / đang chạy / đã về đích / lệch đồng hồ); F trong vùng → `open`, ngoài vùng → false (xe), hộp đã mở / thảm không mở, bấm liên tục 1 op; `inZone` chỉ khi đi bộ; `checkin` định kỳ + không gửi khi trên xe / lộ trình trước Chặng dừng / tạm dừng / còn phạt; về đích mới → ăn mừng 1 lần, welcome đã về đích → khán giả ngay.
- `client/src/net/ClueBoxes.test.ts`: reveal `opened:true` sơn lại đúng hộp đó (cùng object), `kind:'mat'` dựng thảm, `onChange`.
- `client/src/net/session.test.ts`: dòng tóm tắt mới.
- `npm run build && npm test`: qua (scripts 20, shared 42, client 598, worker 56). `npm run ride-check` (SCREENSHOT_PORT=5402): **OK**, số đo như trước.

## Preset (đã xem PNG)
- `p7-start` (`/?start=x,z,yawDeg` = `welcome.start` đội 1 của chặng demo, cùng đường `setSpawn`): F3 "chân y 1.60" trên lối đi bộ dưới cầu cạn (trong vòm đá đảo Thiên Nga), **không phải 7,22**. Thử cả 8 chỗ rải: đều y = 1,60 (cả 8 đều ở trên đảo Thiên Nga; ở mô hình này mặt cầu và đảo gần cùng độ cao).
- `p7-start-island` (chỗ rải thứ 4): như trên.
- `p7-openbox` (giữa cầu Iéna, hộp trên mặt cầu, clip `openBox`), `p7-mat` (thảm + NPC trên cầu Iéna), `p7-celebrate` (đứng trên thảm, `celebrate`, NPC cạnh thảm).
- Offline không đổi: `p3-idle`, `p6-boxes`, `p4-mount` chụp lại, không lỗi console.

## Người tích hợp cần biết
- **Track A:** `welcome.start` (đội chưa có pose), `welcome.pose.y` (dùng làm gợi ý độ cao), `summary.step` = **nhãn bước hiện tại** (chuỗi, ví dụ "Lộ trình 3"; client cũng nhận số), `BoxInfo.kind:'mat'` + id = id bước Chặng dừng cho cả lộ trình trước nó. Client chỉ gửi `checkin` khi thẻ hiện tại là `pit_stop` và `running` và đã qua `checkinAt`.
- **Track C:** `raceHud.update({ inZone })` đã nối; `raceHud.finished(team, officialMs)` gọi một lần khi về đích. Khi khán giả bay, `hud-off` ẩn mọi `.hud-box` (có thể muốn giữ câu NPC / Sổ mật thư hiện khi bay).
- **NetClient** (không track nào sở hữu): nên thêm `flushPose(p)` để bỏ ép kiểu ở `main.ts`.
- **Chặng demo:** tâm Chặng dừng (Kim tự tháp kính Louvre) nằm **trên** kim tự tháp → thảm sẽ nằm trên mặt kính (tia đặt hộp nhận mọi pháp tuyến). Chặng thật sẽ khác; `leg:check` (D) có thể cảnh báo tâm vùng trên công trình.
- CLAUDE.md: thêm `player/railDecks.ts`, URL `?start=x,z,yawDeg` (DEV offline, đi qua đường spawn của welcome), `?mat` (với `?boxes=`: thảm), preset `p7-start`, `p7-start-island`, `p7-openbox`, `p7-mat`, `p7-celebrate`.
- TODO (ponytail): thảm luôn hướng bắc (không xoay theo đường); dải ray chỉ biết ở chunk đã tải dữ liệu (respawn ở chunk chưa hỏi lần nào → coi như không có ray, lần sau thì đúng); NPC dẫn chương trình không có clip `talk` (chỉ đứng + vẫy); "Bạn có 1 mật thư mới" ở màn đăng nhập chưa làm (cần server biết thẻ nào đã đọc).

## Còn lại (cần track A đã ghép)
- Thử tay theo kế hoạch (`npm run dev:api` + 2 trình duyệt, chặng `mini`: vị trí 1 / 2 hiện một lần, giờ xuất phát → đồng hồ, mở hộp L1, T1 (tạm), lộ trình đi bộ chặn lấy xe, D1, về đích → NPC + ăn mừng + bay; F5 giữa chặng). Ở worktree này engine của A còn là stub (welcome.view / start rỗng) nên chưa chạy được; người tích hợp chạy sau khi ghép A → B.

## Sửa sau kiểm tra độc lập
- **(major) Hộp / thảm leo lên capsule người chơi:** tia đặt hộp (`boxGround` ở `main.ts`) không loại capsule KCC → người chơi đứng giữa hộp / thảm làm nó nhảy lên ≈ 1,8 m và không xuống lại (hộp chỉ dời lên), NPC dẫn chương trình bay theo. Sửa tận gốc: tia chuyển thành `boxSurface()` trong `player/railDecks.ts`, chỉ trúng collider tĩnh (`EXCLUDE_KINEMATIC | EXCLUDE_DYNAMIC | EXCLUDE_SENSORS`: bỏ capsule người chơi, xe NPC). Test `railDecks.test.ts` (Rapier thật, capsule trên cột hộp) trả 1,82 khi chưa sửa, 0 khi đã sửa.

## Cách chạy
- `npm run build && npm test`
- `SCREENSHOT_PORT=5402 npm run screenshot -- p7-start p7-start-island p7-openbox p7-mat p7-celebrate`
- `SCREENSHOT_PORT=5402 npm run ride-check`
