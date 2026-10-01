# Phase 7 – sửa vòng 2, phần server (`worker/src/**`, `shared/src/**`)

Commit: `fix(phase7): round 2 - server`. Mỗi mục có test, và test đó fail khi bỏ phần sửa (đã kiểm bằng cách trả file nguồn về HEAD rồi chạy lại).

## 1. MAJOR: `TrustedPoint.follow` giữ ngân sách lúc vắng mặt mãi mãi (`shared/src/protocol/speed.ts`)

- Lỗi hồi quy từ 82b90d6. Công thức cũ là `max(min(cap, b + refill), b + earned) + grant`. Từ pose thứ hai trở đi `earned = 0`, nên kết quả bằng `b` mỗi khi `b > cap`. Thời gian offline chưa dùng vì thế không bao giờ bị cắt về `cap`.
- Sửa: `max(min(cap, b + refill), min(b, cap) + earned) + grant`. Khoản bù lúc vắng mặt chỉ còn dùng cho pose đầu của cửa sổ mới. Pose kế tiếp cắt ngân sách về `cap`, tức 2 s ở tốc độ tin cậy.
- Test: `speed.test.ts` › "unseen time cannot be banked". Kịch bản: 10 phút offline, quay lại đúng chỗ cũ, đứng 60 s, nối lại 1 s rồi gửi pose cách 2 km. Điểm tin cậy chỉ đi được `cap + rate` (19,5 m), phần còn lại (1980,5 m) bị từ chối, nên RaceRoom ghi sự kiện `jump` và gắn cờ. Code cũ cho đi trọn 2 km. Các test cũ (13 m / 45,5 m, nối lại liên tục) vẫn pass.

## 2. Lỗi JSON của chặng trên trang Host giờ bằng tiếng Việt (`shared/src/leg/check.ts`, `worker/src/race/engine.ts`)

- Thêm `jsonProblem(text, err)` vào `@race/shared/leg`. Câu trả về: `lỗi cú pháp (dòng X, cột Y). Có thể do: …`. Không còn câu tiếng Anh của V8. Gợi ý giống `leg:check`, thêm hai trường hợp:
  - chú thích ở cuối dòng (`"yawDeg": 33, // huong nhin`; `https://` trong chuỗi không bị tính là chú thích);
  - file bị cắt cụt hoặc rỗng (`Unexpected end of JSON input` → dòng / cột cuối file).
- `host.leg {json}` hỏng giờ trả: `File không phải JSON hợp lệ: lỗi cú pháp (dòng 3, cột 17). Có thể do: JSON không có chú thích …`.
- Test: `engine.test.ts` › "a broken JSON leg gets a Vietnamese line / column".

## 3. `respawn` giữ chế độ di chuyển của pose tin cậy (`worker/src/RaceRoom.ts`)

- Trước đây `respawn` luôn ghi `mode: 'walk'`. Client sửa đổi đang đạp xe chỉ cần gửi `respawn` 0 m rồi `open` là qua được kiểm tra `boxRiding`.
- Giờ pose của `respawn` lấy `mode` của pose cuối cùng (`l.pose.mode`). Đội chưa từng gửi pose thì vẫn là `walk`.
- Test: `RaceRoom.race.test.ts` › race-zone. Đội B đạp xe tới L1, gửi `respawn` tại chỗ rồi `open`: nhận `boxRiding`. Sau một pose đi bộ thì `open` mở được hộp.

## 4. D21 "Tại điểm này" không còn lộ bước sau (`worker/src/race/engine.ts`)

- Trước đây: đội B đứng ở nơi nó đã làm xong thấy đội A (đi trước) quay lại đó, kèm nhãn và loại của bước hiện tại của A (vd. "Lộ trình 2"). Vậy là lộ một bước B chưa nhận, cùng vị trí của bước đó (SPEC §17.10).
- Giờ danh sách của một đội chỉ gồm các đội đang ở cùng nơi và có bước hiện tại ≤ bước của chính đội đó, tức những bước mà đội xem đã có mật thư. Trường gửi đi vẫn đúng như kế hoạch: nhãn, loại, nhánh, giờ vào vùng.
- Danh sách được tính lại mỗi khi bất kỳ đội nào ở nơi đó đổi bước, nhờ `refreshZones` theo khóa nơi.
- Test: `engine.test.ts` › "never shows a team on a later step than the viewer". Chặng `mini` được sửa để L2 quay về nơi của L1. A (ở L2) có mặt ở đó, B (ở T1) đi về đó. B nhận `[]`, còn A thấy B "Thử thách 1".

## 5. Sau khi Host bấm "Kết thúc": phía server chỉ cho đọc (`worker/src/race/engine.ts`)

- `view.status = 'finished'` đã có sẵn:
  - tin `race` gửi tới mọi đội online lúc Host kết thúc;
  - `welcome.view` khi đội vào lại.
- Mới: khi trạng thái là `finished`, `RaceEngine.step` không làm gì cả: không ghi `arrived_at`, không dời xe vào bãi, không có dòng SQLite nào. Op vẫn bị chặn như cũ bằng `raceOver`. `book` (Sổ mật thư, chỉ đọc) vẫn hoạt động.
- Test: `engine.test.ts` › "after the Host's Kết thúc …". View gửi đi có `status: 'finished'`, `finishAt: null`. Sau đó pose trong vùng và `open` chỉ tạo ra một `notice`.
- Phía client (chế độ khán giả / chỉ đọc khi `view.status === 'finished'`) nằm ở batch client, xem phần "Chưa làm".

## Chưa làm (ngoài vùng được sửa)

1. `scripts/leg-check.ts`: xoá hàm `jsonProblem` cục bộ (dòng 140–157), thay bằng `import { jsonProblem } from '@race/shared/leg'` và `export { jsonProblem }`, vì `leg-check.test.ts` import nó từ đây. Dòng 250 (`checkFile`) giữ nguyên. Đã kiểm 4 regex của `leg-check.test.ts` với hàm dùng chung: đều khớp. Đổi xong thì CLI cũng hết câu tiếng Anh và có gợi ý cho chú thích cuối dòng (organiser, phát hiện §12).
2. Client (`client/src/race/RaceClient.ts:44`): chuyển sang khán giả / chỉ đọc khi `view.status === 'finished'`, không chỉ khi `view.finishAt`.

## Gate

- `npm run build`: pass.
- `npm test`: scripts 43, shared 45, client 624, worker 86. Tất cả pass.
- Một lần chạy trùng lúc với `npm test` của agent khác thì 2 test worker fail: `live-teleport` có thêm một `jump` 24 m, và `BikeService` claim cùng lúc. Chạy lại khi không có lượt chạy song song thì pass (22/22, rồi 86/86). Cả hai đều không đụng tới phần sửa này, nên có lẽ do hai harness chạy cùng lúc chen nhau. Nguyên nhân cụ thể chưa xác minh.
- Không để lại vite / wrangler / workerd. Các workerd còn chạy lúc kiểm tra là của tiến trình `tsx` của agent khác.
