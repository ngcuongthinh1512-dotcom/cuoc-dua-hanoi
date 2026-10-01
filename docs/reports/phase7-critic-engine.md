# Phase 7 – Phê bình engine (máy trạng thái / bảo mật / ngân sách)

Người viết: critic (không viết kế hoạch). Đối tượng: `docs/plans/phase7.md` + nền commit `71a31a2`.
Trạng thái: XONG. Mọi phát hiện đã kiểm trên code (dòng / test dẫn ở từng mục).

## Tóm tắt
Bảng chuyển trạng thái D2, lưu trước rồi mới gửi, ngân sách dòng ghi và việc không lộ đáp án qua thẻ: đều ổn. Nhưng geofence ở D4 dựa trên `live.valid`, mà `valid` **không được kiểm tra tốc độ thật**. Ba đường cho một client sửa đổi dịch chuyển vào bất kỳ vùng nào: đứng im > 3 s rồi gửi 1 pose (không cờ, không sự kiện), `respawn`, hoặc pose đầu sau khi vào lại. Vì Phase 7 cho nhiệm vụ tự qua, như vậy là chạy hết chặng trong vài giây. Ngoài ra: bãi xe ở D18 / effect `park` trỏ tới điểm *tiếp theo*; thứ hạng đội chưa về đích so giờ thực dù mỗi đội xuất phát lệch giờ; D21 (Tại điểm này) có thể lộ vị trí điểm tương lai; nạp chặng sau khi đội đã vào game để lại dữ liệu cũ; luật tạm dừng không công bằng giữa các đội; vài test không thể fail.

## BLOCKER

### B1. `valid` không được kiểm tra tốc độ → dịch chuyển vào vùng (D4 sai)
- `shared/src/protocol/speed.ts`: `speed` = 0 khi cửa sổ phủ < 1,5 s; `push` bỏ hết mẫu cũ hơn 3 s. Đã chạy thử: đi 4 m/s, im 3,5 s, rồi pose cách 2 km → `overSpeed = false`. 200 ms sau `reset` nhảy 1,5 km → `false`.
- `RaceRoom.onPose` (dòng 233–252): nhánh có cửa sổ chỉ dựa vào `overSpeed`, nên `valid = pose` mà **không ghi cờ, không ghi sự kiện**. Nhánh cửa sổ mới (vào lại, pose đầu): `teleport()` chỉ ghi cờ khi > 400 m, `valid` vẫn nhận pose. `respawn` (dòng 307–318): `valid` = điểm bất kỳ, ≤ 400 m/phút thì không cờ (test Phase 6 "a 300 m respawn … fine").
- Hậu quả: `arrive`, `open`, `task`, `checkin`, và cả kênh hộp 150 m (§17.10: dò hộp bằng cách nhảy quanh bản đồ) đều qua được. D4 viết "một cú dịch chuyển … không cập nhật `valid`" và "Host thấy cờ": cả hai đều sai. SPEC §8.10: "vị trí phải qua kiểm tra tốc độ".
- Sửa (một chỗ, mọi caller đều đi qua): trong `onPose`, mỗi pose còn bị chặn theo bước: `d(pose, valid) ≤ footSpeed·bikeMul·tol·max(0,2 s; now − validAt) + slack`. Vượt thì gọi `teleport()` (cờ + sự kiện có giới hạn) và **không** đổi `valid`. `respawn` dài hơn `NET.respawnTrust` (vd. 30 m: bậc kè / "Kẹt?" chỉ cách vài mét) thì ghi cờ và không đổi `valid` (client vẫn hiện ở chỗ mới). Có thể giữ `win`, nhưng geofence chỉ tin `valid`. Thêm test: im 3,5 s rồi nhảy 2 km → bị cờ, `valid` giữ nguyên, `open` → `boxFar`.
- Test harness (track A) đang "di chuyển bằng `respawn`" vào vùng, tức là dựa đúng vào lỗ hổng này. Sau khi sửa, cần thêm helper đi bộ bằng pose (hoặc respawn ngắn nhiều lần, cách nhau đủ lâu).

## MAJOR

### M1. Bãi xe trỏ tới điểm tiếp theo (D18, `RaceEffect park`)
`{kind:'park', step}` = "bãi của vùng của `step`", với `step` = bước vừa nhận. Lộ trình bắt buộc đi bộ (vùng = đích của chính nó) và thử thách có `task.location` sẽ dời xe tới điểm **sắp tới**. D18 còn dùng `destination.bikeParking` của bước đó. SPEC §6.4: bãi cạnh điểm đội **đang đứng** (điểm vừa mở hộp). Sửa: rack = vùng của bước vừa hoàn thành (`zones[step-1]` / điểm của hộp vừa mở), tọa độ lấy theo đích của bước đó. Thêm test: nhận L2 (đi bộ) ở điểm L1 → xe ở bãi L1, không phải L2.

### M2. Xếp hạng đội chưa về đích so giờ thực (D10, `RankInput.prevDoneAt`)
Mỗi đội xuất phát một lúc (§17.12; §13.8 "tính theo giờ xuất phát riêng"). "Hoàn thành bước trước sớm hơn" theo giờ thực sẽ xếp đội xuất phát sớm lên trên đội nhanh hơn. Ví dụ: A xuất phát 10:00, xong bước 4 lúc 11:00; B xuất phát 10:30, xong bước 4 lúc 11:10 → kế hoạch xếp A trên B dù B nhanh hơn 20 phút. Sửa: khi có `startAt` thì so `prevDoneAt − startAt`, đội không có giờ xuất phát xếp sau. Chốt bằng `slot` để thứ tự luôn xác định (`startOrder` null với đội chưa vào game). Thêm test đúng ví dụ này.

### M3. D21 "Tại điểm này" có thể lộ điểm tương lai
"Đội online trong vùng nào (khóa = tâm vùng)": nếu xét mọi vùng của chặng, đội đi ngang vùng của một bước sau sẽ nhận `{t:'zone'}`, kể cả `teams: []` khi rời đi. Như vậy là biết mình đang đứng ở một điểm tương lai, trái §17.10. Sửa: chỉ gửi cho vùng của **bước hiện tại** của đội người nhận (đã `arrived`) hoặc vùng đội đó đã qua. Thêm test.

### M4. Nạp chặng khi `lobby` sau khi đội đã vào game
Đội vào game trong `lobby` đã có `startOrder`, vị trí ở điểm xuất phát cũ, và có thể có dòng `step_progress` của bước 1 (D3). Nạp chặng khác thì dòng mồ côi (id bước khác) lọt vào bảng Host, đội đứng sai điểm xuất phát. Sửa: `host.leg` bị từ chối khi đã có đội có `startOrder` (thông báo rõ). Hoặc: xóa `step_progress`, đặt `step = 0`, xóa pose, rồi `welcome.start` theo chặng mới. Ghi rõ trong `LEG_FORMAT.md` / README: nạp chặng thật trước khi phát mã.

### M5. Tạm dừng không công bằng + ghi sai mốc (D9)
Khi tạm dừng: đồng hồ chạy, được đi lại, nhưng việc vào vùng chỉ được ghi "ở vị trí đầu tiên sau khi tiếp tục". Đội đang đi đường không mất gì. Đội đang ở hộp / thảm mất trọn thời gian tạm dừng. Đội đứng yên trên thảm (không có phạt) thì **không bao giờ check-in** cho tới khi nhúc nhích, vì đứng im không gửi pose và client chỉ gửi `checkin` khi có `checkinAt`. Còn `arrived_at` thì ghi muộn sai sự thật. Sửa:
- (a) Vẫn ghi `arrived_at` đúng giờ thật trong lúc tạm dừng, chỉ chặn thao tác.
- (b) `open` / `task` / `checkin` trong vùng tự ghi `arrived` nếu còn null.
- (c) Client gửi `checkin` định kỳ mỗi khi đứng trong vùng thảm và chưa về đích (không chỉ khi có phạt). Server xử lý idempotent.
- Hỏi anh chọn một trong hai: đóng băng di chuyển khi tạm dừng (mọi đội đang đua mất như nhau), hay giữ như kế hoạch nhưng ghi rõ hệ quả trong RACE_RULES §11. Áp dụng cùng luật cho `lobby`.

### M6. Kiểm tra giờ xuất phát do Host nhập (D15)
`isClientMessage` nhận mọi `at > 0`. Giờ trong tương lai hoặc sau `finishAt` → đồng hồ âm, `officialMs` âm, **đội lên hạng 1**. Sửa:
- Từ chối `at > serverNow + 60 s`.
- Cảnh báo khi `at > joinedAt`: đội nhận mật thư ngoài game trước khi vào, nên giờ xuất phát phải sớm hơn.
- `ranking` coi `officialMs < 0` như chưa có giờ.
- `officialMs` và `clue_opened_at` của bước 1 luôn **tính ra khi đọc**, không lưu (Host sửa giờ thì mọi chỗ đều theo).
- Nút "Bây giờ" dùng đồng hồ server (`host.state.serverMs` + độ lệch), không dùng `Date.now()` của máy Host.
- `datetime-local` hiểu theo `leg.timezone`, không theo múi giờ máy (Host ở Paris gõ giờ VN là lệch 5 h).

## MINOR

1. **`writeProgress` dùng `INSERT OR REPLACE`.** REPLACE = xóa + chèn, mà theo bảng giá Cloudflare "Deletes are counted as rows written" → có thể tốn 2 dòng mỗi lần ghi. Nên dùng `ON CONFLICT DO UPDATE` và trả về `.rowsWritten` để cộng vào `counters.rows` (như `BikeService.put`). Test "≤ 110 dòng / đội" đang đếm theo số tự cộng, nên quên cộng vẫn qua: phải đo `rowsWritten`.
2. **Test "SQLite có trước khi tin `race` tới" không thể fail.** Output gate của DO đã giữ tin gửi đi cho tới khi ghi xong, và test đọc storage sau đó. Thay bằng test thuần của `RaceEngine` với `RaceIO` giả ghi lại thứ tự gọi (ghi trước, gửi sau; `sql` ném lỗi → không gửi gì). Chỉ vá bộ nhớ đệm sau khi `transactionSync` thành công.
3. **Test thiếu.** Hai đội mở WebSocket cùng lúc (`Promise.all`) → `startOrder` {1,2}. `enter()` và lần ghi `teams.state` phải nằm trong cùng một đoạn đồng bộ: `upgrade()` đọc `s` trước `enter()`, nếu ghi đè bằng `s` cũ sẽ mất `startOrder`. Chuyển trạng thái sai (`resume` khi `running`, `start` sau `finished`) phải bị từ chối. `advance` với `verify` → `'wrong'` / `'pending'` không làm hỏng trạng thái (Phase 8 dựa vào đó). Check-in khi đang đạp xe phải bị từ chối, giống hộp.
4. **Lộ trình trước Chặng dừng + thảm dùng bán kính 15–40 m**, nên "bước lên thảm" thực ra là vào vòng 25 m. Có thể chấp nhận (mọi đội như nhau); ghi lại, hoặc thêm `NET.matRadius` nhỏ cho việc check-in.
5. **Client nên gửi pose ngay trước mỗi `race` op** (cùng một socket nên đúng thứ tự). Nếu không, vừa xuống xe đã bấm `F` sẽ bị `boxRiding` vì pose cuối còn `mode: 'bike'`.
6. **`isClientMessage('race')` không kiểm role.** `RaceRoom` phải bỏ qua `race` từ socket Host.
7. **`startOrder` không reset được.** Host thử mã đội trước giờ đua thì đội đó mất "vị trí 1" và mất luôn thông báo. Cần nút Host "xóa thứ tự vào game" (khi `lobby`) hoặc ghi rõ cách diễn tập trong tài liệu.
8. **Xe `parked: true` ở bãi gần một điểm tương lai** (VIEW_METERS 250 m) cho đội phía sau biết có điểm ở gần. Chỉ gửi cờ `parked` cho chủ cũ / đội đã qua điểm đó, hoặc chấp nhận và ghi lại.
9. **Chặng lưu trong `meta.leg` được `parseLeg` lại mỗi lần DO thức.** Lỗi parse (schema đổi ở phase sau) không được ném trong constructor: báo `host.state.leg.issues` và giữ chặng đã lưu. Bundle zod: client không có zod (`client/dist` đã kiểm); worker ≈ 861 KiB là ổn.
10. **Ghi dòng không giới hạn có từ trước (Phase 6, kế hoạch không làm nặng thêm).** Mỗi lần `upgrade` ghi 3 dòng, mỗi `login` đúng mã ghi 2 dòng, không có trần. Vòng vào lại 1 lần/s trong 1 h ≈ 10 800 dòng. Nên dùng `count()` theo cửa sổ như `bike` / `speed`. Trang Host: chỉ gửi `host.team startAt` khi bấm nút, không gửi ở mỗi sự kiện `input`.

## Ngân sách (tính lại theo đường ghi của kế hoạch)
Mỗi đội, chặng 10 bước:
- `step_progress`: 3 dòng/bước = 30 (×2 nếu REPLACE bị tính 2 dòng → 60).
- `teams.state`: 11.
- Sự kiện: arrive + complete = 4/bước → 40, cộng finish / park ≈ 44.
- Bãi xe: ≤ 15.
- Tổng ≈ 100 (hoặc 130 nếu REPLACE = 2).

| | 7 đội | 20 đội |
|---|---|---|
| Dòng ghi thêm | ≈ 700–910 → tổng ≈ 6 000–6 250 | ≈ 2 000–2 600 → tổng ≈ 9 100–9 700 (< 20 000) |
| Request thêm | ≈ 2–3 / đội | ≈ 2–3 / đội, không đáng kể |

Mọi thao tác bị từ chối và `book` không ghi dòng nào; vào vùng chỉ ghi lần đầu. Kế hoạch không thêm đường ghi nào client điều khiển được mà không có giới hạn (với điều kiện "từ chối = không ghi" có test).
