# Bắt đầu thử thách → xuống xe, xe để lại cạnh người chơi (2026-10-03)

Yêu cầu: đội đang làm thử thách thì bị cho xuống xe, xe đặt ngay cạnh người chơi (SPEC §17.32).

## Đã làm
- `worker/src/race/steps.ts`: hiệu ứng `park` (bỏ trường `at`) phát ra khi thử thách bắt đầu: `complete` khi thẻ kế là nhiệm vụ tại điểm / lộ trình đi bộ (không còn điều kiện "đứng tại điểm trên bộ" → Host Duyệt từ xa / đang đạp xe vẫn bị xuống xe); `accept` của thẻ gợi ý làm tại điểm; `openBranch` của nhánh làm tại điểm. Nhiệm vụ ở "Địa điểm" khác giữ luật cũ (xuống xe khi tới nơi).
- `worker/src/race/BikeService.ts` `park(team, rack, at, now)`: `at` = vị trí tin cậy của đội (RaceRoom truyền `live.valid`), null (offline) = xe đứng nguyên chỗ cuối đã biết; xe `owner null`, `parked`, ghi SQLite rồi mới gửi. Bỏ hàng xe đông–tây tại tọa độ `bikeParking` (hết teleport); `rack` chỉ còn nhóm đếm `maxBikes`.
- Client: `Bikes.applyServer` đã xuống xe khi xe mình bị đổi chủ; giữ vị trí cục bộ (xe ở ngay chân, không nhận lại x/z của server lệch vài mét). Toast `bikeParked` đổi chữ.
- Test: steps (accept / openBranch / approve mọi tư thế), BikeService (xe cạnh đội khi đạp xa; offline), engine (approve → park). Docs: RACE_RULES §3, SPEC §17.32, TODO.

## Quyết định / tồn
- Lộ trình bắt buộc đi bộ nhận từ xa cũng ép xuống xe (cùng một luật, đỡ một nhánh riêng).
- Xe người chơi vừa bị cho xuống giữ vị trí cục bộ; server ghi vị trí tin cậy (≤ vài m lệch) — đội khác thấy xe ở vị trí server.
