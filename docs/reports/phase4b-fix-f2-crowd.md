# Phase 4B – FIX-F2: người đi đường (crowd.ts)

Trạng thái: **xong**. Nhánh worktree `agent-a0639d3a85e729dcf` (từ `main @ 04c2050`). Chỉ sửa `client/src/npc/crowd.ts`, `crowd.test.ts`, khối `crowd` trong `client/src/config.ts`.

Công cụ đo: bản sao `hold.mts`, `pedcar.mts`, `clear.mts` của reviewer 1 (scratchpad, trỏ vào code worktree); `pedcar.mts` thêm tham số seed + mật độ. Mẫu "trong thân xe" = TÂM người nằm trong chữ nhật `npc.vehicles[kind].dims` của xe, lấy mẫu mỗi 0,1 s, 300 s sau 20 s warm-up, Traffic THẬT + Crowd, dt 1/60.

## M2 – đứng chết trước người chơi đứng yên

- Gốc: điều kiện đứng chờ dùng `lt` (lệch ngang tính từ ĐƯỜNG ĐI, đã cộng `p.dodge`) → né đủ 1 m rồi vẫn "chạm" → đứng mãi; không có giới hạn thời gian.
- Sửa (`dodgeStep`): đứng chờ theo lệch ngang của THÂN `lb = lt − dodge` (`|lb| < avoid.holdSide`, `0 < ah < avoid.holdAhead`). Hướng né vẫn theo `lt` (không lật qua lại).
- Thêm giới hạn: bị chặn liên tục quá `avoid.holdMax` (3 s) trên vỉa hè → `turnBack()`: đảo chiều cạnh đang đi (giữ `side`), lập lại tuyến; không có tuyến hợp lệ thì giữ nguyên (không cho biến mất).
- Đang đứng yên (bị chặn) thì hoạt ảnh `stand`, không còn `walk` tốc độ 0.

| `hold.mts` (người chơi đứng yên 2,5 m trước mặt, 60 s, 12 seed) | Trước | Sau |
|---|---|---|
| Vượt qua / quay đầu đi xa | 0 / 12 | 12 / 12 |
| Đứng yên lâu nhất (ngoài idle / chờ vạch) | 60 s (11/12 seed) | 0 s |
| Khoảng cách nhỏ nhất tới người chơi | 1,53–1,59 m | 0,98–1,00 m (không chạm: `bodyRadius + player.radius` = 0,6 m) |

## M3a – đi xuyên thân xe (living_street + qua đường)

- Chọn cách: người đang đi (`walk`) và đang qua đường (`cross`) dừng khi `carAhead` m kế tiếp (1,5 m) chạm thân xe (khoảng cách tới chữ nhật thân < `bodyRadius`), chỉ khi đang tiến lại gần (ai đã bị xe đè lên vẫn đi ra được). Không dời dải (b): với phố living_street hẹp (4 m, 1 làn/chiều) thân xe tới 1,9 m từ tim, dải dời ra mép vẫn nằm trong thân xe → dời dải không đủ, phải xét xe.
- Chống kẹt đôi (xe chờ người, người chờ xe): trên vỉa hè / phố living_street bị chặn quá `avoid.holdMax` → `turnBack()`. Đang giữa lòng đường (xe dừng đè lên vạch sau khi người đã bước xuống, ví dụ taxi Opéra đứng > 20 s): quá `holdMax` → quay về điểm vạch cổng (`gate`) và chờ `clear()` lại; bị chặn lần nữa trong cùng lượt qua → chờ tối đa `giveUp` rồi đi tiếp (ponytail).

| Mẫu người trong thân xe (300 s, seed 1, mật độ 1) | Trước | Sau |
|---|---|---|
| Marais (48.8575, 2.3585) | 1 833 (1 620 đi + 200 chờ + 13 path) | 0 |
| St-Germain (48.8539, 2.3336) | 67 | 0 |
| Opéra (48.8706, 2.332) | 26 (qua đường, bus đè vạch) | 0 |
| Concorde (0, 0) | 0 | 0 |

## M3b – `clear()` chỉ xét tâm xe

- Sửa: `carDist()` = khoảng cách từ đoạn vạch qua đường tới chữ nhật thân xe (`npc.vehicles[kind].dims`), xe đang chạy (≥ `cross.still`) được kéo dài về phía trước `speed × crossGap + cross.lead` m; vạch phải cách ≥ `cross.clear` (1 m). Lọc xe theo khoảng cách tới ĐOẠN vạch (trước đây theo trung điểm + 12 m: xe ở đầu vạch của đại lộ rộng 30 m bị bỏ qua).
- `clear.mts`: bus đè vạch (x ∈ [99, 111]) true → **false**; bus [97,2; 109,2] true → **false**; truck [99,95; 106,45] true → **false**; sedan false → false.

## m2 – `crowd.crossReach`
- Xóa khóa (không dùng). Ghi `// ponytail:` ở chỗ qua đường ở miệng giao lộ (`cd`): chưa tìm nút `highway=crossing` trên nhánh.

## m4 – hằng số viết cứng → `config.ts` khối `crowd`
- `avoid.holdAhead` 1,2 / `avoid.holdSide` 0,45 (cũ `:599`), `avoid.rate` 2 m/s (`:608`), `pathLat` 0,6 (`:381`), `cross.{still 0,3, lead 1,5, clear 1}` (thay `:321/324` 3 / 1,8), mới: `avoid.holdMax` 3 s, `carAhead` 1,5 m.

- Thêm: `spawn()` không đặt người trong thân xe (fill ban đầu từng đặt 4 người trong thân truck đang đỗ trên dải (b), họ đi xuyên ra).

Thêm seed / mật độ (sau sửa, 300 s): Marais seed 2 mật độ 1: 0 · Marais seed 3 mật độ 2: 0 · St-Germain seed 2 mật độ 2: 0 · Opéra seed 2 mật độ 2: 0 · Opéra seed 3 mật độ 1: 0 · Concorde seed 3 mật độ 2: 0.

## Test (m8) – `client/src/npc/crowd.test.ts`
- Thay test `:200` cũ (chỉ đo khoảng cách nhỏ nhất): **12 seed**, người chơi đứng yên 2,5 m trước mặt, 30 s: mỗi seed phải vượt qua (đi quá người chơi theo hướng ban đầu) hoặc đi xa > 8 m; không lần nào đứng yên (mode `walk`) lâu hơn `holdMax + 0,1` s; không chạm (khoảng cách > `bodyRadius + player.radius`). Kết quả: 11 vượt qua, 1 quay đầu, khoảng cách nhỏ nhất 0,98–1,77 m, đứng yên lâu nhất 0 s.
- `clear()` với xe dừng: bus đè vạch (tâm cách 5 m), truck, sedan → chặn; sedan cách 1,7 m, bus cách 2,5 m → trống; bus đó đang lăn 2 m/s → chặn.
- Phố living_street có sedan + truck đỗ trên dải đi bộ, 3 seed × 90 s, mật độ 10: có người tới gần (> 100 mẫu trong 5 m), 0 mẫu trong thân xe, không ai đứng yên quá `holdMax`.
- **Traffic THẬT + Crowd** mật độ 1, seed 1, dt 1/60, 20 s warm-up + 90 s ở Marais, St-Germain, Opéra: 0 mẫu trong thân xe (0/25 200, 0/32 400, 0/25 199; 22 / 43 / 39 xe). Không phụ thuộc việc xe chồng nhau (chỉ xét người ↔ thân xe).
- Kiểm tra test bắt được lỗi: tắt `carAhead` → test living_street hỏng (9 409 mẫu), test Traffic thật hỏng (331 mẫu).
- Hiệu năng: test ≤ 0,3 ms nay chạy với 60 xe thật (carAhead / clear() duyệt mọi xe): **0,012 ms/bước, 40 người, 60 xe** (trước 0,007 ms không có xe; reviewer đo 0,025 ms).
- `npm run build` + `npm test` qua (client 44 file, 449 test).

## Hành vi đã chốt: không đổi
- Đạp xe tông người → `step` trả `knocked > 0` (test cũ vẫn qua); `G` trong 10 m → `wave`; vùng cấm (test 5 phút vẫn 0 người trong vùng); tất định theo seed (không `Math.random` / `Date`, test hash vẫn qua).

## Còn lại / ponytail / đề xuất TODO
- `// ponytail:` mới trong `crowd.ts`:
  - `carDist` lấy mẫu mỗi 0,5 m dọc đoạn (sai ≤ 0,25 m); nâng cấp: khoảng cách đoạn–hộp chính xác.
  - Qua đường ở miệng giao lộ (`cd`), không tìm nút `highway=crossing` trên nhánh (thay `crossReach` đã xóa).
  - Giữa lòng đường bị chặn lần thứ hai trong cùng lượt qua: chờ tối đa `giveUp` (20 s) rồi đi tiếp xuyên qua xe còn đỗ (chưa đo được lần nào trong các lần chạy ở trên).
- Không cần sửa `roads.ts` / `types.ts`.
- Nguyên nhân phía Traffic còn đó (FIX-F1): obstacle của xe xét theo đường làn thẳng, không theo cung Bézier góc cua → xe cua có thể lướt sát người. Crowd nay tự tránh thân xe, nhưng người bị xe lao VÀO (xe đang chạy) vẫn phụ thuộc Traffic.
- Đề xuất dòng TODO: "Người đi đường: qua đường tại nút `highway=crossing` gần miệng giao lộ thay vì luôn ở miệng (`crowd.ts` ponytail, kế hoạch §3.7 `crossReach`)."
