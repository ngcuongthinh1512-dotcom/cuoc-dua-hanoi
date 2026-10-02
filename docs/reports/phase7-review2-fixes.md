# Phase 7 – review lần 2: bản sửa server 82b90d6

Người review: reviewer đối kháng. Không sửa code, không commit. Script thử nằm trong scratchpad, không nằm trong repo.

Phạm vi:
- (a) kiểm tra múi giờ;
- (b) điểm tin cậy dùng cho xe, tầm nhìn xe và bán kính quan tâm;
- (c) giới hạn kết nối lại `NET.maxConnects`;
- (d) các test có fail khi bỏ bản sửa hay không.

Kết luận: **1 major, 3 minor**.

- Bản sửa (c) "trả thời gian vắng mặt một lần" lại gây ra một hồi quy D4: phần ngân sách vắng mặt không dùng hết được **giữ lại mãi**.
- (a) không có lỗi.

## Gate

| Lệnh | Kết quả |
|---|---|
| `npm run build` | pass |
| `vitest run --dir scripts` | 40/42. Chỉ có 2 fail đã biết: `leg-check.test.ts` (timezone), `sim.test.ts` (claim). Không có fail nào khác |
| `npm run test --workspaces` | shared 44, client 618, worker 83: pass |
| Worker chạy lặp | 7 lần liên tiếp đều 83/83. Thêm 3 lần chạy **song song** `RaceRoom.live.test.ts` + `BikeService.test.ts` (tải CPU cao): 22/22 cả 3 lần. Không thấy test chập chờn |

## MAJOR 1 – `TrustedPoint.follow` giữ ngân sách vắng mặt vô thời hạn

**Vị trí:** `shared/src/protocol/speed.ts:58`, hồi quy do 82b90d6.

Công thức mới:

```ts
this.budget = Math.max(Math.min(cap, b + refill), b + earned) + grant;
```

- Ở mọi vị trí sau lần vào lại, `earned = 0`, nên vế phải là `max(min(cap, …), b)`. Khi `b > cap`, kết quả là `b`.
- Vì vậy phần `earned` (= tốc độ tin cậy × thời gian vắng) chưa dùng **không bao giờ bị cắt về `cap`** nữa. Nó chỉ giảm khi đội di chuyển.
- Bản cũ cắt về `cap` ngay ở vị trí kế tiếp: `min(cap, b + refill) + grant`.
- D4 (plan) chỉ cấp thời gian vắng mặt cho **vị trí đầu của cửa sổ mới**.

**Bằng chứng đơn vị** (tốc độ thật 6,5 m/s, cap 13 m). Kịch bản: offline 600 s, vào lại ở đúng chỗ cũ, đứng 60 s, rồi kết nối lại 1 s với vị trí cách 2 km.

| | Ngân sách còn lại | Từ chối | Điểm tin cậy |
|---|---|---|---|
| Bản mới | 3900 m | 0 m | tới thẳng 2 km |
| Bản trước 82b90d6 | 13 m | 1980,5 m | đi 19,5 m |

**Bằng chứng e2e** (workerd qua `createTestHarness`, `nearLeg(60, 4)`):

1. Đăng nhập, gửi pose tại chỗ xuất phát.
2. Offline 25 s.
3. Vào lại, đứng tại chỗ 5 s.
4. Đóng socket, 1 s sau vào lại, pose đầu cách 150 m.

Kết quả:
- `welcome.pose` lần sau đã dời **150,0 m**.
- Không có sự kiện nào ngoài login / connect / disconnect: không `jump`, không `speed`.
- `flagged = false`.
- Bản cũ chỉ cho ≤ ~25 m và có `jump` + cờ đỏ.

**Hậu quả** (cần client sửa đổi):
- Gom thời gian offline rồi dùng sau này, vào bất kỳ lúc nào.
- Thêm một lần kết nối lại ngắn trước cú nhảy thì cửa sổ tốc độ bắt đầu lại, nên **không có cờ và không có sự kiện**.

Cú nhảy đó:
- đưa đội vào vùng / bán kính lộ hộp;
- lấy xe từ xa: chính đảm bảo D4 mà bản sửa (b) vừa thêm;
- quét bán kính quan tâm.

Ví dụ nặng nhất (đội đến lúc khác nhau, giờ đua tính từ giờ xuất phát Host nhập):
- Đội đăng nhập từ sớm trong lobby, gửi một pose rồi rời đi.
- 30 phút sau đội vào lại đúng giờ xuất phát. Lúc này đội có sẵn ≈ 11,7 km ngân sách, dùng được cho cả chặng.
- Bản cũ: phần này chỉ dùng được ở vị trí đầu tiên sau lần vào lại.

**Sửa gợi ý** (đã thử bằng script; các ca của `speed.test.ts` vẫn ra 13 / 45,5):

```ts
this.budget = Math.max(Math.min(cap, b + refill), Math.min(b, cap) + earned) + grant;
```

Thêm test: vào lại ở chỗ cũ, gửi vài pose đứng yên, kết nối lại, nhảy xa. Kỳ vọng phần dư bị từ chối (≤ cap + rate × thời gian vắng ngắn) và có `jump`.

## MINOR 2 – Người chơi thật bị `far` khi lấy xe sau một lần respawn > 30 m

**Vị trí:** `worker/src/RaceRoom.ts:370` (claim từ `l.valid`) cùng `:389–391` (respawn > `NET.respawnTrust` không được nhận ngay).

Cơ chế:
- Điểm tin cậy chỉ đi khi **nhận được pose**, mỗi pose sau khi đứng yên đi ≤ cap (13 m).
- Client chỉ gửi pose khi pose đổi (`PoseGate`).
- Client **không** gửi pose ngay trước `bike claim`. Op `race` thì có (`main.ts:231`).

Respawn > 30 m xảy ra trong thực tế:
- "Kẹt?" về chỗ khô mới nhất mà ≥ 5 s tuổi và ≥ 15 m. Không có thì về chỗ cũ nhất, tới ~120 m (`respawnRules`).
- Đang đạp xe với 5,2 m/s thì 5 s đã ≥ 26 m.
- Hai lần "Kẹt?" trong 60 s cộng dồn quá 30 m cũng tính.

E2e:
- Đi 40 m, respawn về chỗ cũ, gửi pose, claim chiếc xe cách 0,5 m → `far`.
- 6,5 s sau gửi thêm 1 pose rồi claim lại → **vẫn `far`** (mới đuổi được 13 m).
- Người chơi thấy toast "Lại gần xe hơn để lấy xe" dù đang đứng cạnh xe, cho tới khi đi lại vài giây.
- Báo cáo sửa ghi "độ trễ hết sau khoảng 2 s". Điều này chỉ đúng khi đội đang di chuyển.
- Trước 82b90d6, claim dùng `l.pose` nên được nhận.

**Sửa gợi ý** (rẻ):
- Trong `case 'bike'`, gọi `this.follow(l, l.pose, now, 0)` trước khi xét tầm với. Ngân sách đã nạp theo thời gian (≤ 13 m) kéo điểm tin cậy tới.
- Hoặc client flush pose trước claim như op `race`.
- Hoặc ghi nhận giới hạn này vào `TODO.md`.

## MINOR 3 – `NET.maxConnects` khóa người chơi thật có mạng chập chờn tới ~1 phút

**Vị trí:** `worker/src/RaceRoom.ts:199`; `shared/src/protocol/constants.ts:36–39`.

Cơ chế:
- Cửa sổ cố định 60 s, dùng chung với bike / speed / login.
- Mỗi lần **bị từ chối** cũng được đếm.
- Client đặt lại backoff về 1 s sau mỗi `welcome` (`NetClient.ts:169`).
- Vì vậy một kết nối chết sau mỗi ≤ ~5 s chạm mức 10. Nguyên nhân có thể là mạng khựng ≥ 3 s liên tục: chính server đóng 4429 khi nhận dồn > 15 tin/s.

E2e (sống 4 s, backoff thật):
- Lần kết nối thứ 11 (giây 50) nhận `4429`.
- Thêm 2 lần bị từ chối nữa.
- Vào lại được ở giây 64, tức bị khóa 14 s.
- Trường hợp xấu nhất (10 lần trong vài giây đầu cửa sổ): khóa tới hết cửa sổ cộng backoff ≤ 15 s, ≈ 60–75 s.

Không khóa vĩnh viễn: cửa sổ đặt lại, và một lần vào lại sau crash chỉ tốn 1 lượt.

Những gì người chơi và Host thấy:
- Người chơi chỉ thấy "Mất kết nối – đang nối lại…". Mã 4429 dùng chung với giới hạn tin/giây và không phải mã dừng hẳn.
- Host không thấy gì (cố ý không ghi hàng), nên không biết vì sao đội offline.
- Comment "An honest client … never gets near it" vì vậy không đúng.

Tương tác với các luồng khác:
- Không ảnh hưởng khóa đăng nhập Phase 6 (theo IP, mã sai; login vượt mức vẫn trả token).
- Đá thiết bị cũ: lần bị từ chối không đá socket cũ. Đổi máy giữa lúc bị khóa phải chờ hết cửa sổ.

Quota:
- Một client gian lận tối đa 10 × 3 + 10 × 2 = 50 hàng/phút, ≈ 6 000 hàng / 2 h. Bằng 30 % ngân sách 20 000 của cả cuộc đua, từ một đội.
- Lần bị từ chối không ghi hàng nhưng vẫn là 1 request tính phí (như mọi spam HTTP).

**Sửa gợi ý:**
- Nâng mức (ví dụ 20).
- Hoặc chỉ đếm kết nối lại < 2 s sau lần trước.
- Có thể thêm bộ đếm RAM `refused` vào `host.state.counters` để Host thấy (không tốn hàng).
- Sửa lại comment.

## MINOR 4 – Test không bắt được việc bỏ một nửa bản sửa (b); không test nào phủ lỗi MAJOR 1

Đã chạy mutation trên bản sao worker trong scratchpad:
- Đảo `players()` (`RaceRoom.ts:642`: xe đang chạy theo người lái, tầm nhìn xe 250 m, bỏ xe, sinh xe) và `welcome.bikes` (`:656`) về `l.pose`: **83/83 worker test vẫn pass**.
- Đối chứng: đảo dòng claim (`:370`) thì test D4 fail ngay. Vậy bản sao đúng là chạy code đã đổi.

Như vậy chỉ tầm với khi claim và bán kính quan tâm được test giữ. Việc "quét xe từ xa" bằng pose giả qua tầm nhìn xe 250 m có thể quay lại mà không test nào đỏ.

**Gợi ý:** trong test D4, sau pose giả cạnh xe cách 1,5 km, khẳng định A **không** nhận `bikes` nào chứa id chiếc xe đó.

Các test mới còn lại đều fail khi đảo bản sửa tương ứng, đúng như báo cáo sửa. Riêng test "reconnect loop" chỉ đo khi đội di chuyển liên tục nên không phát hiện MAJOR 1.

## (a) Múi giờ: không có lỗi

So sánh `host.leg` chạy trong workerd với `Intl` của Node, kết quả **giống hệt nhau** cho 12 giá trị:

| Kết quả | Giá trị |
|---|---|
| Nhận | `Europe/Paris`, `europe/paris`, `UTC`, `Etc/GMT-7`, `Asia/Saigon`, `Europe/Kyiv`, `America/Ciudad_Juarez`, `+07:00` (múi giờ dạng độ lệch, V8 nhận) |
| Từ chối, kèm thông báo rõ có ví dụ IANA | `GMT+7`, `""`, `Paris`, `"Europe/Paris "` |

Các chặng có sẵn (`Asia/Ho_Chi_Minh`) vẫn nạp được, `legs.test` pass.

Ghi chú (không tính là finding): chặng đã **lưu trước** bản sửa mà có múi giờ sai vẫn được giữ nguyên dạng thô (`engine.ts:89–92`) và gửi xuống trang Host, nên trang Host vẫn có thể lỗi `Intl`. Chỉ DB dev mới có thể có chặng như vậy, vì chưa deploy.

## Việc còn tồn (đã biết, đúng như báo cáo sửa)

- `scripts/sim.ts`: kịch bản claim.
- `scripts/leg-check.test.ts`: timezone.
- `scripts/leg-check.ts`: code chết trong `mapReport`.
- `docs/LEG_FORMAT.md` dòng 52 / 372.
- Dòng `TODO.md` về giới hạn login / upgrade.
