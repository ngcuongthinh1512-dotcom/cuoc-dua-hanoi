# Phase 7 – Kiểm chứng track D (verifier đối kháng)

Worktree `p7-d`, commit `a099f1e` (base `fee5e6f`).

## Chạy
- `npm run build`: qua (exit 0).
- `npm test`: shared 34, scripts 42, worker 56 qua; client 588/589: `src/geo/gps.test.ts` "search time ≤ 5 ms median" trượt do máy đang tải (nhiều verifier chạy song song); chạy lại riêng → 10/10 qua. Không thuộc track D.
- `leg:check`: `paris-demo` (exit 0, 18 ô trống + 1 cảnh báo L6), `mini` / `near` (0 / 0), `paris-demo.filled` (1 cảnh báo L6).
- Sở hữu file: chỉ `docs/LEG_FORMAT.md`, `docs/reports/phase7-track-d.md`, `scripts/leg-check{,.test}.ts`, `worker/legs/test/near.json`. Không đụng SPEC / TODO / CLAUDE.md.
- Ví dụ đầy đủ trong LEG_FORMAT.md = `mini.json` y hệt (so JSON), hợp lệ. Bảng trường khớp `shared/src/leg/schema.ts`; bảng thông báo khớp chữ trong `check.ts`.

## Vấn đề (đã tái hiện bằng script tạm)
1. **MAJOR – quét lộ báo LỖI giả cho đáp án là tên đường / địa danh** (`scripts/leg-check.ts:76-110`). Đáp án `"Khải Hoàn Môn"` → LỖI ở `client/public/credits.json`, `client/dist/assets/main-*.js`…; đáp án `"Avenue des Champs-Élysées"` → 28 LỖI (chunk JSON, roadgraph). Chính LEG_FORMAT §9 khuyên đáp án dựa trên "chữ trên biển tên đường" → chặng hợp lệ bị exit 1 với lời khuyên "Xóa khỏi thư mục client/" mà Host không làm được. Sửa: bỏ qua chuỗi đã có sẵn trong dữ liệu bản đồ / bundle trước khi có chặng (vd. chỉ báo khi file chứa ≥ 2 chuỗi bí mật, hoặc loại trừ tên đường / địa danh có trong roadgraph + landmarks, hoặc hạ thành cảnh báo cho đáp án ngắn).
2. **MAJOR – cảnh báo "cầu trên đất liền" trượt đúng ca D17** (`scripts/leg-check.ts:50-54`). Điểm xuất phát Bir-Hakeim (48.85569, 2.28758, trên mũi đảo Thiên Nga, dưới cầu cạn metro, plan §2.1) → `onBridge = false` (cạnh bridge gần nhất 6,57 m > ngưỡng 6 m), `inWater = false` → không cảnh báo. Polygon cầu (`kind: 'bridge'` trong `buildings` của chunk) chứa điểm này nhưng không được dùng. Sửa: dùng polygon `kind === 'bridge'` của chunk (đã đọc sẵn trong `building()`), cảnh báo khi trong polygon cầu và không trong nước.
3. **MAJOR – kiểm "đi bộ tới được" không bao giờ báo lỗi; khoảng cách tới cạnh đo tới cạnh bất kỳ** (`scripts/leg-check.ts:64-70`). `nearestNode(...,'walk')` luôn bám thành phần chính nên `shortestPath` luôn có đường → LỖI "không đi bộ tới được" (LEG_FORMAT §8, §11) là code chết. `snapB` lấy `nearestEdge` không lọc chế độ / thành phần: điểm 48.86231, 2.28528 (Avenue Chauvet, thành phần đi bộ tách rời; cạnh chính gần nhất ≈ 51 m) với bán kính 20 → 0 lỗi, 0 cảnh báo. Sửa: snap = khoảng cách tới cạnh đi bộ thuộc `graph.main` (hoặc tới nút đã dùng cho A*).
4. MINOR – footprint Khải Hoàn Môn (`landmark`, `triumphal_arch`) bị coi là khối đặc: tâm vùng dưới vòm (Mộ Chiến sĩ Vô danh, collider g1 để hở cả hai lối vòm) → LỖI giả. BuildingBuilder bỏ qua mọi rec có `.landmark`; `solid()` chỉ miễn Eiffel (critic m13 "cùng điều kiện với bộ dựng nhà").
5. MINOR – LEG_FORMAT §8 ví dụ in `at=48.8605,2.2903`, công cụ thật in `48.86050,2.29030`; tên ảnh của điểm xuất phát ra `leg-xu-t-ph-t` (`\W` xóa chữ có dấu). Chú thích `leg-check.ts:188` nói "else a spot on the walkable road" nhưng không làm, thiếu `// ponytail:` cho lối tắt này và cho kiểm cầu bằng cạnh đồ thị.
