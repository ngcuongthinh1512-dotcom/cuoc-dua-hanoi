# Phase 6 – Server & presence: báo cáo lập kế hoạch + nền

Kế hoạch đầy đủ: `docs/plans/phase6.md`. Commit nền: `feat(phase6): kế hoạch + nền server`. `npm run build && npm test` qua (worker 17 test qua workerd thật, shared 22, client 539, scripts 18); `p5-debug`, `p4-mount` chụp lại không lỗi (offline không đổi). Không cài package mới.

## Đã đo (2026-10-01)
- **Test Durable Object:** `@cloudflare/vitest-pool-workers` 0.22.0 đòi `vitest ^4.1` → không dùng được với Vitest 5.0.2 (đã cài). Thay bằng `createTestHarness` có sẵn trong wrangler 4.141 (workerd thật + DO + SQLite trong tiến trình, `getDurableObjectStorage`, `evictDurableObject` để giả lập khởi động lại). Không cài package mới. Test smoke đầu-cuối (đăng nhập Host → tạo đội → mã đội → WebSocket → `welcome` → đá thiết bị cũ → khóa 5 lần sai → evict vẫn còn đội): 8 test, ≈ 0,4 s.
- **Node 24** có `WebSocket` toàn cục → bot và test không cần package `ws`.
- **Kích thước tin:** `pos` 31 B (7 số: cm + mrad); `tick` 20 đội 627 B (mảng số) so với 2 075 B nếu dùng object; dòng snapshot 20 đội ≈ 855 B.
- **Giá Cloudflare (tài liệu, 2026-09-30):** tin WS gửi lên 20 : 1; **tin gửi xuống không tính**; ping WS giao thức và `setWebSocketAutoResponse` không tính; `setTimeout` giữ DO thức (tính giờ chạy, Free 13 000 GB-s/ngày ≈ 28 h DO 128 MB); mỗi dòng index = thêm 1 dòng ghi; `setAlarm` = 1 dòng ghi; Free: 100 000 request/ngày, 100 000 dòng ghi/ngày, 5 triệu dòng đọc/ngày.
- **Hành lang xe trong trình duyệt Host** (`roadgraph.json`, 6 đoạn chặng demo): A* + hành lang 150 m mất 1–10 ms/đoạn; ứng viên `bicycle_parking` cách điểm ≥ 100 m: 11, 11, **0** (Trocadéro → Eiffel), 16, 5, 2 → cần ứng viên dự phòng lấy mẫu trên vỉa hè trong hành lang. Danh sách ứng viên gửi lên DO chỉ vài KB.

## Ngân sách (cuộc đua 2 giờ, 20 đội)

| Request tính phí (Durable Object) | Cách tính | Điển hình | Xấu nhất |
|---|---|---|---|
| Kết nối WS (đội vào lại ~3 lần + Host) | 20 × 3 + 4 | 64 | 64 |
| Tin vị trí lên, 5 Hz chỉ khi đổi | 20 × 5 × 7 200 × tỉ lệ di chuyển ÷ 20 | 70 % → 25 200 | 100 % → 36 000 |
| Thao tác (xe, vẫy, chuông, hồi sinh) | ≈ 60–120/đội ÷ 20 | 60 | 120 |
| Host (tạo đội, ứng viên, lệnh) | ≈ 200 ÷ 20 | 10 | 20 |
| Đăng nhập HTTP tới DO | 20 × 3–5 | 60 | 100 |
| Alarm đặt xe (3 phút/lần) | 120 ÷ 3 | 40 | 40 |
| **Tổng** | | **≈ 25 400** | **≈ 36 300** (< 40 000 ✓) |

Keepalive `ping` (20 × 7 200 ÷ 5 = 28 800 tin) → auto-response, 0 request. Static asset không tính. Giờ chạy DO ≈ 7 200 s × 128 MB = 922 GB-s (Free 13 000/ngày ✓).

| Dòng SQLite ghi | Cách tính | Số dòng |
|---|---|---|
| Snapshot vị trí mọi đội + bộ đếm (1 dòng upsert / 2 s) | 7 200 ÷ 2 | 3 600 |
| Replay (1 dòng / 10 s) | 7 200 ÷ 10 | 720 |
| Sự kiện (ghi ngay, bảng + 1 index) | ≈ 900 × 2 | 1 800 |
| Xe (sinh, nhận, xuống xe, biến mất) | | ≈ 550 |
| Đội (đăng nhập, trạng thái; index mã đội khi tạo) | | ≈ 340 |
| `setAlarm`, meta | 40 + 20 | 60 |
| **Tổng** | | **≈ 7 100** (< 20 000 ✓) |

## Quyết định chính
- Mỗi cuộc đua một Durable Object `RaceRoom` đặt tên theo mã cuộc đua trong link của Host (`/?race=paris`); mã đội chỉ cần duy nhất trong cuộc đua đó.
- WebSocket Hibernation API, `ping`/`pong` auto-response = ping hiển thị ở F3; vòng tick 5 Hz bằng `setTimeout` chỉ khi có người gửi vị trí, dừng sau 10 s im lặng để DO ngủ; alarm chỉ gắn khi có đội online.
- Giao thức v1: `pos` = mảng 7 số (cm, mrad, chỉ số mode / action), `tick` = mảng số theo slot đội, chỉ đội trong 500 m (không lộ lộ trình); mọi thứ khác là JSON nhỏ có `t`.
- Token HMAC-SHA256 ký bằng `HOST_PASSWORD`, chứa mã cuộc đua + đội + hạn 24 h; kiểm ở DO khi mở WebSocket; 1 thiết bị / đội (thiết bị cũ nhận `kick`).
- Ghi SQLite: sự kiện ngay (trước khi trả lời), snapshot 2 s, replay 10 s; dựng lại từ SQLite khi khởi động; bộ đếm quota nằm trong dòng snapshot.
- Kiểm tra tốc độ: cửa sổ 3 s, dư 25 %, `respawn` hợp lệ reset cửa sổ; chỉ đánh dấu đỏ cho Host, không tự phạt (Phase 9 phạt bắt buộc đi bộ).
- Xe: Host tính hành lang + ứng viên, DO chỉ chọn ngẫu nhiên (seed lưu); nhận xe nguyên tử nhờ DO xử lý tuần tự; `BikeService` tách khỏi `RaceRoom` để track C và A không sửa chung file.
- Hộp mật thư theo khoảng cách (§17.10, chốt 150 m): kênh riêng từng đội (socket có tag đội), tin `{t:'box', op:'reveal', box:{step, x, z, opened}}` khi vào 150 m, `{t:'box', op:'hide', step}` khi ra quá 150 + 20 m (hysteresis, hàm thuần `boxVisible` có test); server so khoảng cách 2 s/lần/đội (1 `hypot`, không SQLite); `welcome.boxes` = hộp đã mở + hộp hiện tại nếu đang trong bán kính; chỉ gửi x, z (client đặt lên mặt đất). Quota: chỉ tin gửi xuống → **0 request, 0 dòng**; 150 m nằm trong tầm sương tối thiểu nên hộp không cần vật liệu chống sương. Vẽ hộp + logic bước: Phase 7.
- Dev: Vite proxy `/api` (kể cả WebSocket) sang `wrangler dev` (`npm run dev:api`), không thêm `@cloudflare/vite-plugin`.
- Offline (như hiện nay) khi dev server không có `?race=` hoặc `?offline=1`; mọi preset ảnh / `ride-check` giữ nguyên.

## Track
| Track | Việc | Mô hình |
|---|---|---|
| A | Worker + DO: tick, snapshot, replay, speed check, ngắt kết nối, giới hạn tin, Host state | **Opus** |
| B | Client: login, NetClient (gửi 5 Hz khi đổi, reconnect, ping), người chơi khác (nội suy, CharacterModel/Animator, xe), ghép main/Player | **Opus** |
| C | Xe chung: VehicleSpawner + BikeService (server), Bikes server-mode (client), ứng viên hành lang ở Host | **Opus** |
| D | Dev tooling: trang Host tối giản, bot `npm run sim`, harness | **Sonnet** |

Thứ tự ghép: A → B → C → D. Người tích hợp: Opus (hoặc Fable nếu dành cho review cuối).

## Package
Không cài gì mới. `zod` (schema file chặng) để Phase 7.

## Câu hỏi mở cho anh (đều có mặc định, không chặn việc làm)
1. Mã cuộc đua nằm trong link Host gửi (`/?race=paris`), mặc định `paris` khi không có → người chơi vẫn chỉ gõ mã đội. Hay muốn chỉ cần mã đội trên mọi link (cần thêm một DO "danh bạ")? **Mặc định:** link có mã cuộc đua.
2. Vị trí gửi 5 Hz, 1 mẫu/tin (SPEC) ≈ 25–36 nghìn request/cuộc đua. Nếu muốn dư nhiều hơn: gộp 2 mẫu/tin ở 2,5 Hz (cùng dữ liệu, nửa request, trễ thêm 200 ms). **Mặc định:** như SPEC.
3. Bán kính quan tâm 500 m (chỉ nhận đội trong 500 m; Host thấy hết). **Mặc định:** như SPEC.
4. Token sống 24 h; sai mã đội 5 lần → khóa 1 phút theo địa chỉ IP. **Mặc định:** như vậy.
5. Trang Host Phase 6 chỉ có: đăng nhập, tạo đội + mã, online/offline, bộ đếm quota, nút tính ứng viên xe; phần còn lại Phase 10. **Mặc định:** như vậy.
6. Kiểm tra tốc độ Phase 6 chỉ đánh dấu đỏ cho Host (không tự phạt); Phase 9 mới phạt bắt buộc đi bộ. **Mặc định:** như vậy.
7. Khi online, đội không dùng được camera bay `V` (kể cả mở F3); `?cam=` khán giả cần token Host. **Mặc định:** như vậy.
8. Alarm đặt xe chỉ chạy khi có ít nhất 1 đội online (xe không tích tụ lúc nghỉ). **Mặc định:** như vậy.
9. Dev bằng Vite proxy sang `wrangler dev`, không dùng `@cloudflare/vite-plugin`. **Mặc định:** proxy.

## Người điều phối cần ghi vào SPEC §17
- Mỗi cuộc đua một DO tên theo mã cuộc đua trong link (`/?race=<id>`, mặc định `paris`); mã đội duy nhất trong cuộc đua.
- Giao thức v1 (`shared/src/protocol`): `pos` 7 số (cm, mrad), `tick` mảng số theo slot, JSON có `t` cho phần còn lại; `PROTOCOL_VERSION` trong `welcome`, lệch → "Hãy tải lại trang".
- Keepalive `ping`/`pong` qua `setWebSocketAutoResponse` (không tính phí) = ping hiển thị.
- Token HMAC-SHA256 ký bằng `HOST_PASSWORD`, hạn 24 h, kiểm tại DO; mã đội 6 ký tự không có 0/O/1/I.
- Bán kính quan tâm 500 m; cửa sổ kiểm tra tốc độ 3 s, dư 25 %; `respawn` báo server.
- Lịch ghi: sự kiện ngay (trước ack), snapshot 2 s (+ ngay khi ngắt), replay 10 s; bộ đếm quota trong dòng snapshot.
- Test DO bằng `createTestHarness` của wrangler (không dùng `@cloudflare/vitest-pool-workers`).
- `?offline=1` / dev server không `?race=` = thế giới thử nghiệm cũ; `movement` của file chặng gửi trong `welcome` là nguồn tốc độ của client.
- Phase 6 có trang Host tối giản (tạo đội, mã, online, bộ đếm).
- §17.10 đã có 150 m; thêm: hysteresis `boxReveal.hysteresis` (mặc định 20 m), tin `box reveal/hide` chỉ mang x, z, kiểm tra mỗi 2 s ở server, hộp đã mở không bao giờ bị thu.
