# Phase 7 – Track D: LEG_FORMAT + leg:check + chặng test

Trạng thái: **xong**. `npm run build && npm test` qua trong worktree (scripts 42 test, shared 34, client 589, worker 56). Track không đụng client nên không chạy ride-check / screenshot (không có preset).

## Đã làm
- `docs/LEG_FORMAT.md` (tiếng Việt, cho người không lập trình): quy trình 4 bước, quy trình "race id mới → nạp chặng → tạo đội → phát mã → mở" + vì sao không đổi chặng (D11), mọi trường (bắt buộc / mặc định / ví dụ), 4 loại bước (không Vượt rào), vùng 15–40 m, bãi xe theo điểm + nhiệm vụ ở nơi khác (D18), `task.params` + kiểu nào đầy đủ ở Phase 7 (D13), cách lấy tọa độ, cách XEM điểm (bảng của `leg:check`), đáp án chỉ ở máy chủ, đáp án phải dựa trên thứ có trong game, `media` = link công khai, bước 1 phát ngoài game, ví dụ đầy đủ = `mini.json` nhúng nguyên văn, bảng lỗi → cách sửa, lỗi JSON của người không lập trình.
- `scripts/leg-check.ts`: `checkFile(file, {root, scanDirs, map})` (xuất để test) + CLI. `LegGeo` thật: footprint nhà từ chunk (3×3 chunk quanh điểm; "đặc" = không phải `roof` / `bridge` / `fountain` / `artwork`, không `minHeight > 2.5`, không tháp Eiffel), `walk` = A* đi bộ + khoảng cách tới **cạnh** gần nhất. Cảnh báo thêm: mặt nước, cầu trên đất liền, `timezone` sai, file ngoài `worker/legs/`. Quét lộ `client/public` + `client/dist` (chuỗi ≥ 12 ký tự: mật thư, mô tả, đáp án…; dạng thường + dạng escape JSON / `\uXXXX`) → LỖI. Dịch lỗi JSON ra "dòng X, cột Y" + đoán nguyên nhân (dấu phẩy thập phân, ngoặc cong, dấu phẩy thừa, chú thích, nháy đơn). Bảng từng điểm: tên đường + quận, quãng đi bộ, link OSM, lệnh `npm run screenshot -- --path "/preview.html?at=…&r=80" --name leg-<id>`, gợi ý `bikeParking` từ bãi xe OSM có thật (cách 20–120 m, ngoài vùng).
- `scripts/leg-check.test.ts` (14 test): `paris-demo` chỉ ô trống; `mini`, `paris-demo.filled`, `near` 0 lỗi (mini 0 cảnh báo); nhánh có nơi riêng trong nhà → lỗi; bãi xe trong vùng → cảnh báo; file hỏng (roadblock, bán kính 50, điểm trong nhà Haussmann, điểm ngoài bản đồ) → đúng dòng, `ok=false`; nước + múi giờ; quét lộ trong thư mục tạm; file ngoài `worker/legs/`; 4 lỗi JSON; bảng có link OSM + lệnh chụp + gợi ý bãi xe.
- `worker/legs/test/near.json` (mới, cho harness của A): bắt đầu (-45,-13) và L1 / L2 / PS quanh Concorde, `boxReveal` {40, 10}, nội dung "(GIẢ)". Khoảng cách đường thẳng L1 ↔ start ≈ 46 m, nhưng đường đi bộ theo đồ thị ≈ 130 m (đi vòng đảo giao thông). L2 cách L1 ≈ 41 m (đi bộ ≈ 44 m). Nếu A cần điểm gần hơn, sửa tọa độ rồi chạy `leg:check`.
- `mini.json` và `paris-demo.filled.json` giữ nguyên (đã đủ mọi dạng; `mini` 0 lỗi + 0 cảnh báo với dữ liệu thật).

## Chạy
- `npm run leg:check -- worker/legs/test/mini.json` (exit 0); `… worker/legs/paris-demo.json` (exit 0, chỉ ô trống + 1 cảnh báo "đường đi bộ gần nhất cách tâm 39 m" ở L6 / Louvre, đã có sẵn ở chặng demo).
- `npx vitest run scripts/leg-check.test.ts` (< 1 s).

## Người tích hợp cần biết
- Không sửa file nào ngoài phần sở hữu. Không cần gói mới.
- `leg:check` là **mức nhà thật** (dữ liệu chunk + roadgraph), chạy được độc lập với A/B/C/E; tài liệu mô tả hành vi Host (`/host.html`, ô giờ xuất phát theo `leg.timezone`, từ chối nạp chặng khi đã có đội vào) theo kế hoạch D11 / D15: soát lại câu chữ sau khi E / A ghép xong nếu hành vi khác kế hoạch.
- Bảng tóm tắt dùng `StreetLocator` / `districtAt` của client (import thuần, không three); không đổi gì ở client.
- Gợi ý bãi xe chỉ lấy từ `bikeParking` có thật trong OSM; chưa gợi ý "điểm vỉa hè cách tâm ≈ radius + offset" khi không có bãi OSM gần (in "Chưa có bãi xe" kèm hướng dẫn tự thêm). ponytail: upgrade = chọn điểm trên cạnh đi bộ gần nhất.
- Kiểm cầu-trên-đất: cạnh `bridge` trong đồ thị cách ≤ 6 m và điểm không nằm trong polygon nước. Chưa dùng polygon cầu của chunk (`bridges`).
- Gợi ý cho TODO / CLAUDE.md (người tích hợp ghi): lệnh `leg:check`, `docs/LEG_FORMAT.md`, `worker/legs/test/near.json`.

## needsFromOtherTracks
- A: nếu `worker/src/race/leg.ts` cần đóng gói `near`, import `worker/legs/test/near.json`.
