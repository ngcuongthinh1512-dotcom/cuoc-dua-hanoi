# Phase 7 – sửa theo review (server)

Phạm vi: `worker/**`, `shared/src/**`. Ba finding major (speccode) đều đã sửa trong phạm vi này. Ba file ngoài phạm vi (`scripts/`, `docs/LEG_FORMAT.md`) cần đổi theo, xem mục "Chưa sửa (ngoài phạm vi)".

## 1. Múi giờ sai làm hỏng trang Host (`shared/src/leg/check.ts`)

- Trước đây `checkLeg` không kiểm tra `timezone`, chỉ CLI cảnh báo. Giờ `checkLeg` thử `new Intl.DateTimeFormat('en', { timeZone })`; nếu lỗi thì ghi issue mức **error** tại "múi giờ".
- Vì vậy `parseLeg` từ chối chặng đó, và `host.leg` trả `ok: false`, không lưu.
- Các giá trị bị từ chối: `"Paris"`, `"UTC+7"`, `"Europe/Paris "` (thừa dấu cách). Viết thường như `"europe/paris"` vẫn được, vì Intl chấp nhận.
- Chặng đã lưu trước bản sửa mà có múi giờ sai vẫn được nạp lại như cũ: engine giữ chặng không parse được và hiện issue.
- Test: `shared/src/leg/leg.test.ts` › "refuses a time zone the Host page cannot format".

## 2. D4: xe đạp và bán kính quan tâm dùng điểm tin cậy (`worker/src/RaceRoom.ts`)

Các chỗ trước đây đọc `l.pose` (pose client tự gửi) nay đọc `l.valid`:

- **Lệnh xe** (claim / mount / dismount): khoảng với tới `CLAIM_REACH` / `OWN_REACH` tính từ điểm tin cậy.
- **`players()`**: dùng cho `bikes.tick` (xe đang chạy đi theo người lái, đồng bộ tầm nhìn xe 250 m, xe bị bỏ), `bikes.alarm` (không sinh xe gần người chơi) và view sync.
- **Tâm bán kính 500 m** khi chọn đội nào vào tick của một socket.
- **`welcome.bikes`** (`forTeam`).

`peers()` (pose các đội khác thấy, replay) và `pose` trong host.state vẫn là pose nhận được. Đó chỉ là thứ hiển thị, không lộ gì cho kẻ gian.

Giới hạn đã biết (verifier đã nêu): sau khi mạng nghẽn, điểm tin cậy có thể chậm sau người chơi thật tối đa khoảng 13 m (rate × `speedLeadMs`). Trong lúc đó:

- claim trong vòng 3,5 m có thể nhận `far`;
- xe đang chạy có thể trễ sau người lái chừng ấy mét.

Độ trễ này hết sau khoảng 2 s.

Test (`worker/src/RaceRoom.live.test.ts` › "D4: bike claims and the interest radius go by the trusted point"):

- Gửi một pose giả cạnh chiếc xe cách 1,5 km rồi claim → nhận `far`.
- Đội B ở cạnh vẫn có trong tick của A.

Nếu không có bản sửa, claim trả `ok` và tick của A rỗng.

Hai test cũ dựa vào pose giả nên phải đổi:

- `RaceRoom.live.test.ts` › "ticks": C gửi pose đầu tiên cách 900 m. C vẫn được tin là đang ở điểm xuất phát, nên C thấy A và B.
- `race/BikeService.test.ts` › "two teams claim the same bike": xe được đặt ở điểm xuất phát chặng, hai đội gửi pose tại chỗ xuất phát của mình (≤ 2,2 m), không còn nhảy tới (5, 6).

## 3. Kết nối lại liên tục (`shared/src/protocol/speed.ts`, `RaceRoom.ts`, `constants.ts`)

### Tính trùng thời gian

Khi kết nối lại, `TrustedPoint.follow` vừa nạp lại bucket theo rate × thời gian trôi qua, vừa cộng thêm grant = rate × thời gian không thấy, trong khi đó là cùng một khoảng thời gian.

- Tham số mới `earned`: bucket = max(lượng nạp lại thường, budget cũ + earned) + grant.
- Kết nối lại truyền `earned`; respawn vẫn truyền `grant` (cộng thêm, ≤ `NET.respawnTrust`).
- Test:
  - `speed.test.ts` › "a reconnect pays the unseen seconds once".
  - `RaceRoom.live.test.ts` › "a reconnect loop pays the unseen time once": 5 lần kết nối lại cách nhau 1 s, mỗi lần pose xa 2 × rate × 0,95. Điểm tin cậy đi ≤ 1,25 × rate × thời gian. Không có bản sửa thì đo được 61,7 m so với giới hạn 42,5 m.

### Hàng SQLite

Hằng số mới `NET.maxConnects = 10` cho mỗi đội trong mỗi `NET.respawnWindowMs` (60 s), đếm trong `RaceRoom.ops` cùng chỗ với bike / speed:

- **Upgrade vượt mức**: accept rồi đóng ngay với `CLOSE.tooFast` (4429), trước khi ghi bất kỳ hàng nào và trước khi đá socket cũ. Client thật thử lại với backoff 1–15 s, nên không bao giờ chạm mức này.
- **Login vượt mức**: vẫn trả token, nhưng không ghi event `login`.

Trường hợp xấu nhất của một đội gian lận còn khoảng 10 × 3 + 10 × 2 = 50 hàng/phút. Trước đây với 10 lần/s là khoảng 108 000 hàng/giờ.

Test (cùng test churn ở trên):

- Lần kết nối thứ 11 nhận `{ closed: 4429 }`, không có welcome.
- 12 lần login → đúng 10 event `login`, 10 event `connect`.

Không có giới hạn thì lần thứ 11 nhận welcome.

Các test mới đều đã được kiểm tra là **fail khi bỏ bản sửa** (đảo từng phần rồi chạy lại).

## Chưa sửa (ngoài phạm vi, các agent / orchestrator khác cần làm)

Bản sửa 1 và 2 làm hai test trong `scripts/` fail. Đây là hệ quả đúng của bản sửa. Cả hai thay đổi dưới đây đã được chạy thử trên một bản sao trong scratchpad, dùng server đã sửa: `sim.test.ts` "3 bots" pass, `leg-check.test.ts` 17/17 pass.

1. **`scripts/sim.ts`, kịch bản claim (≈ dòng 315–317)**: bot 0/1 đang nhảy tới điểm đầu tuyến (cách tới ~100 m), nên claim từ điểm tin cậy nhận `far`. Thay
   ```ts
   const [sx, sz] = [routes[0]![0]!, routes[0]![1]!];
   const pair = bots.slice(0, 2);
   for (const b of pair) b.s.send(encodePose({ x: sx, y: 0, z: sz, yaw: 0, mode: 'walk', action: 'none' }));
   ```
   bằng
   ```ts
   const pair = bots.slice(0, 2);
   // D4: a claim reaches from the trusted point = where each bot appeared (its start spot); the bike between them
   const at = pair.map((b) => b.welcome.start ?? b.welcome.pose ?? origin);
   const [sx, sz] = [(at[0]!.x + at[1]!.x) / 2, (at[0]!.z + at[1]!.z) / 2];
   pair.forEach((b, k) => b.s.send(encodePose({ x: at[k]!.x, y: 0, z: at[k]!.z, yaw: 0, mode: 'walk', action: 'none' })));
   ```
2. **`scripts/leg-check.test.ts` › "a point in the middle of the river is a warning; a bad timezone too"**: múi giờ sai giờ là lỗi. Tách thành hai lần chạy:
   - `runT('w1.json', j)` không đặt timezone, vẫn kiểm cảnh báo "mặt nước";
   - sau đó `j.timezone = 'Viet/Nam'; const t = runT('w2.json', j); expect(t.ok).toBe(false); expect(errors(t).some((e) => e.startsWith('múi giờ: '))).toBe(true);`
3. **`scripts/leg-check.ts` `mapReport`**: xoá khối `try { new Intl.DateTimeFormat… } catch { add('warning', ['timezone'], …) }`. Đây là code chết, vì `parseLeg` đã từ chối trước khi tới đó. Bỏ chữ "timezone" khỏi doc comment.
4. **`docs/LEG_FORMAT.md`**:
   - dòng 52: "Sai tên: `leg:check` cảnh báo" → "Sai tên: lỗi, server không nạp chặng";
   - dòng 372: mức `CẢNH BÁO` → `LỖI`.
5. **`TODO.md`**: dòng "upgrade / login have no per-window cap" mà plan §8 yêu cầu nay không cần nữa, vì đã có `NET.maxConnects`.
   - Còn lại (ponytail): bộ đếm chỉ nằm trong RAM, nên một lần eviction sẽ reset nó.
   - Client chưa tự thử claim lại khi nhận `far` lúc điểm tin cậy đang trễ sau mạng nghẽn.

## Gate

- `npm run build`: pass.
- `npm test`: các workspace pass (shared 44, client 618, worker 83 test; chạy bằng `npm run test --workspaces`, vì `npm test` dừng ở `scripts/` trước). Riêng `scripts/` có 2 test fail (40/42 pass) cho tới khi mục 1–2 ở trên được áp dụng:
  - `sim.test.ts` "two claims on one bike give one winner" (claim.ok = 0);
  - `leg-check.test.ts` "bad timezone too" (giờ là error).
