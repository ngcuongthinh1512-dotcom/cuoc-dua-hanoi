# Phase 8B review – SPEC + CODE (reviewer 1)

HEAD 810a51a. Đọc: diff 6bc28fc~1..HEAD (server, shared, client, scripts, docs), plan phase8b.md, SPEC §17.19–17.20, báo cáo verify-foundation / track A–D / integration. Không đọc `~/Documents/chang-that/`, không sửa mã. Chạy: vitest shared 76, client race/ui/net 158, worker race 138 – qua. Kiểm byte `client/public/art/*` (RIFF chunk, GLB JSON): sạch.

**Verdict: FAIL** – 1 lỗi chặn (sửa một dòng), 3 nên sửa, vài mục nhỏ.

## Chặn
1. **Hết phạt 3 phút vẫn không chốt được** (playerVisible). `client/src/main.ts:322` `else if (rc.status === 'locked') notice('answerLocked')` và `:619` `locked: rc?.status === 'locked'` dùng `card.status` do máy chủ tính lúc gửi thẻ. Máy chủ không đẩy thẻ mới khi hết đếm ngược (D9 chỉ gửi lại pose; `onPose` không gửi `race view`). Sau 3 phút, đồng hồ giữa màn hình tắt (HUD dùng `liveStatus`), nhưng F ở nút chốt vẫn hiện toast "Đang bị phạt, chờ hết đếm ngược rồi trả lời lại" và không gửi `lock`; prompt vẫn ghi "Đang bị phạt…". Chỉ hết khi đội bấm / bỏ một nút (mỗi pick trả thẻ mới) hoặc F5. Sim bot không bắt được vì bot luôn bỏ / chọn lại trước khi chốt. **Sửa:** `liveStatus(card, net.serverNow()) === 'locked'` ở cả hai chỗ (hàm có sẵn trong `race/ui/format.ts:141`).

## Nên sửa
2. **Gợi ý phút 40 / 70 và "Đúng x/5 sống" chỉ thấy khi mở thẻ đầy đủ** (playerVisible). Trong client chỉ có `format.ts:233-234` (`louvreInfo`, thẻ đầy đủ) dùng `hintCount` / `hintCorrect`. Không có toast khi null → số (plan §G ghi rõ); thẻ rút gọn (`RaceHud.renderCompact`) không có dòng louvre; prompt phòng không nhắc x. Thẻ đầy đủ là modal (`main.ts:472`: `modal()` gồm `raceHud.open`), nên khi mở thẻ thì không đi được và không bấm F được. Vì vậy, muốn thấy x đổi sau mỗi lần bấm phải đóng thẻ → F → Enter. Đội đứng chơi trong phòng không được báo khi tới phút 40 / 70. **Sửa:** toast một lần khi `hintCount` / `hintCorrect` đổi từ null sang số; thêm "Đúng x/5 · chọn k/5" vào `stateEl` của thẻ rút gọn hoặc vào prompt phòng.
3. **`leg:check` CLI sẽ báo LỖI giả trên chặng thật** (người soạn / Host thấy). `scripts/leg-check.ts` `artLeaks` dò mọi từ ≥ 4 chữ của note / title / artist / photo trong **toàn bộ byte** (latin1, viết thường) của 23 tệp nén. Đo trên 7,3 MB hiện có: 2,7 % chuỗi 4 chữ ngẫu nhiên đã khớp; 5/87 tên riêng thông dụng cũng khớp ("star", "fire", "mike", "amos", "gala"). Chặng thật có hàng chục từ 4 chữ, nên gần như chắc chắn ra một LỖI "chứa chữ … (metadata, tên node GLB?)" mà chạy lại process-assets không xóa được. Chặng test chưa lộ lỗi này vì từ của nó ("tranh", "giả") nằm trong GENERIC. **Sửa:** chỉ quét vùng metadata (WebP: chunk khác `VP8 `/`VP8L`/`ALPH`; GLB: chunk JSON + chunk RIFF không phải ảnh của ảnh nhúng), hoặc nâng ngưỡng lên ≥ 6 chữ cho phần nhị phân.
4. **Dòng feed bị trùng sau khi DO thức** (playerVisible, xác suất thấp). `RaceRoom.feed()` chỉ đọc lười khi `feedV === null`. Ở `io.feed` (`RaceRoom.ts` ~146), nếu lần chốt đầu tiên sau khi DO dựng lại (hibernation, socket vẫn mở, chưa có welcome nào) tới trước welcome, thì `this.feed()` SELECT từ `events` đã thấy sự kiện `louvre.lock` vừa commit trong transaction, rồi `kept.push(m)` thêm lần nữa. Kết quả: welcome sau đó có hai dòng giống nhau. **Sửa:** trong `feed: (m) =>`, nếu `feedV` còn null thì chỉ gọi `this.feed()` (đã có dòng mới), không push.

## Nhỏ
5. Feed client: mỗi welcome (kể cả khi kết nối lại, không F5) đẩy lại toàn bộ `w.feed` vào `Feed.lines` / `entries` (`RaceClient.welcome` → `hud.feed`). Hệ quả: dòng cũ hiện lại như mới, có thể trùng với dòng còn trên màn hình. Nên thay danh sách thay vì nối thêm (playerVisible).
6. RACE_RULES §"Thử thách 3" ghi feed ở "góc dưới bên trái … **ngay trên** bản đồ nhỏ", nhưng `Feed.ts` đặt nó **bên phải** minimap (`left = margin + minimap.width + gap`, như track C ghi). Cần sửa tài liệu cho khớp.
7. `main.ts` roomInteract: `clickSound(on)` kêu ngay khi gửi, kể cả khi máy chủ sẽ từ chối (tạm dừng `racePaused`, `pickLimit` của máy chủ). Đèn không đổi nhưng vẫn có tiếng "tick". Nhỏ.
8. Verify-foundation #7 chưa sửa: luật 4 (`louvreSecrets`) vẫn so nguyên chuỗi title / note. Lộ một phần tên (vd. chỉ một từ đặc trưng của tên tác phẩm trong mô tả) không bị cảnh báo. Đây chỉ là cảnh báo, rủi ro thấp.
9. Chặng test `worker/legs/test/louvre.json` có `image` lệch kiểu với tệp thật (vd. `art-02.webp` trong khi thật là `art-02.glb`). Hệ quả: offline / test thấy ô đánh số + `console.warn` 404, và preset chưa từng dựng ảnh / bản quét thật trong phòng (integration đã ghi). Kiểm chất lượng bản quét đã giản lược vẫn cần mắt người.
10. Hai stand-in giống nhau: `demoLouvre` (LouvreRoom.ts) và `DEMO_LOUVRE` (RaceHud.ts), từ verify #4. Không phải lỗi.

## Đối chiếu yêu cầu (đạt)
- 23 tác phẩm theo thứ tự chặng (`wallSlots`, zod length 23); nút đỏ / xanh; bấm lại thì bỏ chọn; nút chốt ở tâm phòng; vào phòng bằng F trong 3 m quanh hòm (lệch plan có lý do, S5); ra bằng F ở cửa.
- Máy chủ tự chấm: đúng ⇔ chọn đúng 5 đáp án và tổng 5 lựa chọn. Guard C1 có (`answer` bị im lặng). Chốt 0 lựa chọn: im lặng, 0 dòng. Chốt ngoài vùng: `boxFar`.
- Sai: `locked_until`, lựa chọn giữ nguyên, khi bị phạt vẫn bấm / bỏ được (`pick` cho phép ở `locked`). Đồng hồ đua vẫn chạy.
- Tối đa 5 lựa chọn từ phút 40: máy chủ và client đều chặn, bỏ chọn luôn được, các đèn đã bật trước mốc giữ nguyên.
- Gợi ý 40 / 70: tính khi đọc, chỉ nằm trong thẻ của chính đội. `AnswerView.correct` chỉ gửi cho các lần chốt sau mốc 70. Đội đứng im vẫn nhận được vì client gửi `view` một lần ở mỗi mốc.
- Feed công khai: sai → có `minutes`, không có `n`; sau 70 thì mỗi lần chốt có thêm `n/of`; chốt đúng trước 70 không có tin. `pick` không bao giờ phát feed.
- Không rò rỉ: `ArtworkView` = id / type / image; không note, không credit, không answers, không picks của đội khác. Credits chỉ gửi khi `finishAt` hoặc `finished`. `credits.json` chỉ có 1 dòng chung. 6 GLB: tên đều là `art-NN`, `asset.extras` rỗng. 17 WebP + ảnh nhúng trong GLB: chỉ có chunk `VP8 `/`VP8X`/`ALPH`, không EXIF / XMP.
- SQLite trước ack: lock = dòng bước + sự kiện trong một transaction rồi mới gửi thẻ / feed. Pick chỉ ghi RAM + snapshot (đúng plan §D, mất ≤ 2 s).
- Dựng lại sau evict: picks lấy bản mới hơn giữa snapshot và lần chốt (verify #2 đã sửa); `locked_until`, `rejections`, `task_started_at` lấy từ dòng; feed dựng từ `events`.
- Thế giới: `env` dùng chung không bị bọc. Player có env riêng (`heightAt` = sàn phòng, `waterLevel` null; CharacterController đọc getter mỗi lần). Vào phòng qua `spawn()` nên lịch sử chỗ an toàn bị xóa, "Kẹt?" vẫn ở trong phòng. Không có collider trần. Vào / ra không gửi `respawn`. `RemotePlayers` chỉ ẩn khi hai bên khác phía mặt đất (verify #1 đã sửa). F không mở hòm và không gọi xe khi đang ở trong phòng.
- Quota: `lock` đếm vào `maxRaceOps`; `pick` / `view` / `credits` 0 dòng; client giãn pick ≥ 150 ms. Snapshot vốn đã 1 dòng / 2 s.
- Host: "Cho qua" (approve không id) dùng được cho louvre (verify #9). Ma trận hiện số đang chọn, số sai, mốc gợi ý, x/5.

## Verify-foundation – trạng thái
#1 sửa · #2 sửa · #3 sửa (id = art-NN + trùng tên tệp + mã liền nhau) · #4 không cần (hai stand-in) · #5 sửa (khi ghép) · #6 sửa (louvreCodes) · #7 **chưa** (mục 8) · #8 sửa nhưng kéo theo báo giả (mục 3) · #9 sửa · #10 sửa · #11 sửa ('quiet') · #12 sửa · #13 sửa · #14 sửa.
