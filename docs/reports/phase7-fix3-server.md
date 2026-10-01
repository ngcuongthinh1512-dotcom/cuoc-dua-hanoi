# Phase 7 – sửa vòng 3, phần server (`worker/src/**`, `shared/src/**`)

Commit: `fix(phase7): round 3 - server`. Mục 1, 3 và 4 có test. Các test đó fail khi bỏ phần sửa: đã trả 5 file nguồn về HEAD rồi chạy lại, được 6 test fail. Test luồng workerd fail, kéo theo test khởi động lại vì nó dùng tiếp cuộc đua của test luồng. Mục 2 và 5 chỉ thêm test cho hành vi đã có, không sửa code.

## 1. Op `task` khi đang ngồi xe bị từ chối `boxRiding` (D4, review2 F8)

- `steps.ts`: input `task` nay có `riding`. Thứ tự kiểm tra:
  - bước lạ, bước sau, hoặc nhánh trống: im lặng như cũ;
  - đang ngồi xe → `boxRiding`;
  - ngoài vùng → `taskFar`.
- Khi bị từ chối thì không ghi dòng nào và không dời xe vào bãi (trước đây xe bị `park` ngay dưới người đang đạp).
- `settle()` sau khi làm xong nhiệm vụ nay nhận `riding` thật, không còn đặt cứng `true`, giống như `open`.
- `engine.ts`: `riding` lấy từ `mode` của pose tin cậy, cùng cách với `open` / `checkin`.
- Test:
  - `steps.test.ts` › "a challenge elsewhere";
  - `engine.test.ts` › "D4: a task on a bike is refused with boxRiding". Kết quả mong đợi: chỉ một `notice`, không ghi dòng nào; đi bộ thì qua.

## 2. D15: giờ xuất phát sau giờ về đích, và đổi giờ khi đội đang chạy (review2 F11)

- Không sửa code, vì nhánh `engine.ts` "sau giờ về đích → lỗi" đã có. Chỉ thêm test `engine.test.ts` › "D15: …":
  - `at = finishAt + 1` → `host.notice` lỗi ("về đích"). Không ghi gì, không gửi gì cho đội, `startAt` giữ nguyên.
  - `at = finishAt` được nhận: `officialMs` = 0.
  - Đội đang chạy, Host đổi giờ ba lần (quá khứ, `'now'`, rồi 30 s trong tương lai, vẫn nằm trong mức cho phép 60 s). Sau mỗi lần đổi, đồng hồ (`summary.raceTime`) chỉ tăng hoặc đứng yên, không bao giờ âm: 600 → 605; 0 → 1; 0, 0, 0 → 5. Mỗi lần đổi, đội nhận một `race` mang `startAt` mới.

## 3. Đội đã về đích (hoặc cuộc đua đã kết thúc) không lấy được xe (review2 F9)

- `engine.walkOnly()` được thay bằng `engine.bikeBlock()`. Kết quả:
  - `'finished'` nếu đội đã check-in (`finishAt`) hoặc Host đã bấm "Kết thúc" (SPEC §8.6 / §8.10: khán giả, chỉ đọc);
  - `'walkOnly'` nếu đang ở lộ trình bắt buộc đi bộ;
  - `false` nếu được lấy xe.
- `claim()` / `BikeService.onTeam()` nhận lý do đó và trả `reason: 'finished'` (thêm vào `ClaimResult` và vào tin `bike` trong `shared/src/protocol/types.ts`).
- Lệnh `mount` xe của chính đội cũng bị chặn, vì nó đi qua `claim`. `dismount` vẫn được.
- Test:
  - `RaceRoom.race.test.ts` (luồng workerd): đội A vừa check-in, Host đặt một xe cách A 1 m, A gửi `claim` → `{ ok: false, reason: 'finished' }`;
  - `VehicleSpawner.test.ts` › claim.

## 4. Xe ở bãi không còn chồng lên nhau (SPEC §6.4, review2 F6)

- `BikeService.park()`: khi chặng có tọa độ bãi, xe xếp thành một hàng đông–tây quanh tọa độ đó, cách nhau `RACK_SPACING` = 0,9 m, mọi xe quay mặt về hướng bắc (`yaw 0`).
- Mỗi xe vào chỗ trống đầu tiên theo thứ tự 0, −1, +1, −2 … Chỗ của xe vừa bị lấy đi, hoặc của xe cũ nhất bị bỏ khi bãi đầy, được dùng lại. Cách xếp tất định.
- Bãi không có tọa độ (`at = null`) giữ như cũ: xe đứng tại chỗ.
- Có ghi chú `ponytail:` vì chưa có model giá để xe và chưa biết hướng của giá trong OSM.
- Test: `BikeService.test.ts` › "bikes parked at one rack spot stand side by side in a row". Kiểm tra:
  - 3 xe vào các vị trí 50 / 49,1 / 50,9;
  - lấy xe giữa ra, xe mới vào đúng chỗ đó;
  - bãi đầy: còn đúng `maxBikes` xe, không có hai xe trùng vị trí.

## 5. Trạng thái cuộc đua cho người chơi (review2 F4, phần server)

- Đã kiểm và không cần sửa:
  - `welcome` có `status`, và `view.status` cũng có;
  - mỗi `host.race` (start / pause / resume / finish) gửi `race` có `view.status` mới cho mọi đội đang online;
  - đội offline nhận trạng thái qua `welcome` khi vào lại.
- Thêm test `engine.test.ts` › "every status change reaches each online team …" cho cả 4 lần chuyển trạng thái và cho `welcome`.
- Hiển thị trạng thái lên HUD là việc của client.

## Cổng

`npm run build` OK. `npm test`: scripts 43, shared 45, worker 90 (thêm 4 test), đều pass.

Client: lần chạy đầu có 1 test fail, `src/npc/traffic.test.ts` › exclusion zone. Lúc đó agent khác đang sửa `client/src/npc/traffic.ts` (ngoài phần của tôi). Chạy lại sau khi họ sửa xong thì 67 file / 634 test đều pass. Con số 634 có tính các file test chẩn đoán `zz*.test.ts` mà agent kia đang để tạm, chưa commit.

## Chưa làm (ngoài phần của tôi)

- `client/src/vehicle/Bikes.ts:212`: lý do `'finished'` hiện rơi vào toast `bikeLost` ("Chậm một bước! Xe đã có người lấy."). Cần sửa thành `m.reason === 'finished' ? 'raceOver' : …`, và thêm `'raceOver'` vào `ClaimNotice` (`:61`).
- `client/src/ui/Toasts.ts:26`: câu `boxRiding` ("Xuống xe rồi mới mở được hộp mật thư") nay cũng dùng cho nhiệm vụ và check-in. Đề nghị đổi thành "Xuống xe trước đã: không mở hộp, làm nhiệm vụ hay check-in khi đang ngồi xe".
- TODO.md: ghi lại ponytail "bãi xe = một hàng đông–tây, 0,9 m, không có model giá để xe".
