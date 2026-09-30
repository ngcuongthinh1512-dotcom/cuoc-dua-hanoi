# Phase 4B – Reviewer 1 (spec + code + ngân sách + tích hợp chéo)

Soát `main @ 04c2050` (foundation `2fbea89` + 4 track A/B/C/D đã merge). Reviewer chỉ đọc và chạy lệnh, không sửa file. `npm run build` và `npm test` qua (client 44 file, 446 test). Script điều tra nằm trong scratchpad của phiên (không phải repo).

**Kết luận:** ngân sách §9 đạt; còn **2 BLOCKER** và **5 MAJOR** phải sửa trước commit `feat(phase4b)`.

## BLOCKER

### B1. Cột đèn tín hiệu đứng giữa lòng đường, hộp đèn quay lưng về phía xe
- Chỗ lỗi: `client/src/npc/lights.ts:123-125`, `client/src/npc/NpcRenderer.ts:156-157, 160, 170`; gốc ở `types.ts:38` (`SignalHead` không ghi rõ nghĩa của `x/z/yaw`).
- B đặt head ở mép phải (tim đường + halfWidth + 0,5), `yaw = atan2(ux,uz)` (nhìn về phía xe tới). D hiểu `(x,z)` là tim đường tại vạch dừng, `yaw` là hướng xe chạy, rồi dịch thêm (h + kerb) sang "bên phải" nhưng thực ra là bên trái → hai lần dịch triệt tiêu, cột nằm đúng tim đường; hộp và bóng đèn quay về phía giao lộ. D chỉ dựng trên stub (`headsNear` rỗng) nên chưa từng thấy head thật.
- Tái hiện: `heads.mts`, 18/18 head trong 300 m quanh Concorde cách tim đường 0,00 m; tích vô hướng mặt đèn · hướng tới xe = −1. Ảnh `p4b-red` (2 cột giữa Champs-Élysées), `p4b-density` (1 cột giữa đường ở Opéra). Đèn không có collider nên xe / người chơi đi xuyên cột.
- Test không bắt được: `traffic.test.ts:344` ("every head faces its arm") không kiểm hướng; `NpcRenderer.test` dùng head tự tạo.
- Gợi ý sửa: chốt nghĩa trong `types.ts`; sửa `lights.ts:125` thành `x: n−ux·d, z: n−uz·d, yaw: atan2(−ux,−uz)`. Thêm test: cột cách tim đường ≥ halfWidth, mặt đèn nhìn về phía xe.

### B2. Xe vào vòng xuyến bị dịch ngang tức thời 18–27 m, đè lên xe làn trong
- Chỗ lỗi: `traffic.ts:462` đổi `car.lane = laneN−1` đúng bước route chuyển sang cạnh vòng, nhưng Bézier góc (`place()` :474), `exitClear` (:188) và claim (:241) vẫn theo làn cũ (0). Mỗi làn Étoile rộng 9 m (36 m / 4 làn) → nhảy 27 m trong 1 bước 1/60 s.
- Tái hiện: `jump.mts`, Étoile 5 phút: 62 lần nhảy > 0,5 m/bước, cả 62 do vào vòng, tối đa 27,00 m (Concorde: 4 lần, tối đa 14,6 m). `samelane.mts`: xe vừa vào vòng rơi đè xe ở làn trong (−0,63 … −3,64 m). `sim.mts` Étoile: 285 mẫu hai xe chồng nhau cùng cạnh, cùng làn.
- Gợi ý sửa: giữ làn của nhánh vào (kẹp theo số làn), hoặc chọn làn đích ngay khi cạnh vòng thành `route[1]` rồi dùng đúng làn đó cho `place`, `exitClear`, claim.

## MAJOR

### M1. Xe giữ quyền qua giao lộ không đèn trong khi bị chặn phía sau → kẹt dài
- `traffic.ts:195-214, 235-237`: xe lấy quyền (grant/owners) ở nút j, sau đó mới thấy bị chặn ở nút j+1 (đèn đỏ) hoặc lối ra không trống nhưng không nhả quyền; các nhánh khác bị chặn qua `owners`/`box` (:204).
- `why.mts`, Concorde seed 2, 3 phút cuối: 581 xe·giây đứng ở các nút không đèn 4464 (−32,−7), 21037, 4463; 324 xe·s vì người giữ quyền chờ đèn đỏ ở nút có đèn cách 13 m; 86 xe·s vì chờ lối ra trống.
- Tiêu chí kế hoạch §6 (≥ 80 % xe đi được ≥ 50 m trong phút cuối) chỉ qua theo seed:

| Trường hợp | Seed 1 | Seed 2 | Seed 3 | Seed 4 |
|---|---|---|---|---|
| Concorde, dt 1/60, mật độ 1 | 88 % | 52 % | 72 % | 88 % |
| Concorde, dt 1/20, mật độ 1 | 88 % | 76 % | 48 % | 88 % |
| Opéra, dt 1/60, mật độ 1 | 97 % | 85 % | 85 % | 67 % |
| Concorde, mật độ 2 | 51 % | 63 % | 63 % | 29 % |
| Marais, mật độ 2 | 41 % | 98 % | 45 % | 68 % |

- Test hiện chỉ chạy seed 4 nên qua. Không tái hiện được con số "Marais 1452/2279" của phiên trước ở (48.8575, 2.3585): chỉ 6,9 % mẫu đứng > 30 s.
- Gợi ý sửa: chỉ lấy quyền khi không có vạch dừng phía sau chặn xe trước khi ra khỏi hộp giao lộ; hoặc nhả quyền (`grant=−1`, `owners.delete`) khi `lineCap` trả 0 vì nút sau. Test kẹt chạy ≥ 3 seed ở dt 1/60.

### M2. Người đi đường đứng chết vĩnh viễn trước người chơi đang đứng yên
- `crowd.ts:597-599`: `lt` đã cộng lại `p.dodge` → đo lệch ngang so với đường đi chứ không so với thân; sau khi né đủ 1 m điều kiện đứng chờ vẫn đúng. Đứng chờ không có giới hạn thời gian như `giveUp`, không đi được mét nào nên không chuyển sang nghỉ.
- `hold.mts`, 11/12 seed: né đủ 1,00 m nhưng đứng yên suốt 60 s. Test `crowd.test.ts:200` vẫn qua vì chỉ đo khoảng cách nhỏ nhất.
- Gợi ý sửa: đứng chờ theo lệch ngang của thân `Math.abs(lt − p.dodge) < 0.45`; chờ quá vài giây thì quay đầu (`back`).

### M3. Người đi đường đi xuyên thân xe (2 nguyên nhân gốc, đã tái hiện)
- (a) Phố `living_street`: dải đi bộ (b) ở `h − inset` = 2,2 m tính từ tim đường (phố rộng 6 m), xe làn 0 chiếm 0,6–2,4 m → dải đi bộ nằm trong làn xe. Crowd không xét xe khi đi (`crowd.ts:176, 553-577`); xe dừng vì coi người là vật cản → cảnh người đi xuyên qua xe đang đứng yên. `pedcar.mts`, Marais, mật độ 1, 5 phút: 1 620 mẫu đang đi (≈ 162 người·giây) + 200 mẫu đang chờ nằm trong thân xe.
- (b) `Crowd.clear()` (`crowd.ts:321`) chỉ xét TÂM xe cách vạch < 3 m: bus đè vạch (x ∈ [99, 111], vạch x = 100) vẫn "trống"; truck [99.95, 106.45] cũng "trống"; sedan đúng. Khớp dữ liệu phiên trước (bus 0,5 m/s, người ở −5 m dọc thân).
- Gợi ý sửa: (a) người trên dải (b) dừng / né khi thân xe cách ≤ 1,5 m phía trước (`cars` đã truyền vào `step`), hoặc đặt dải (b) ra ngoài hành lang xe. (b) `clear()` tính khoảng cách tới hình chữ nhật thân xe theo `npc.vehicles[kind].dims`, không dùng tâm.

### M4. Thiếu đổi màu áo / quần cho người đi đường (SPEC §17.11, quyết định 11.3)
- `PedRenderer.ts:128-153`: các clone dùng chung material atlas, không nhuộm màu riêng; không có TODO. 40 người chỉ có 4 bộ đồ, mỗi bộ lặp ≈ 10 lần.
- Gợi ý sửa: tint theo mặt nạ vùng áo / quần trong atlas (như `outfitShader`). Nếu dời sang phase sau phải ghi TODO và hỏi anh.
- Độ chắc chắn: chỉ đọc code; grep không thấy tint/outfit trong `npc/`.

### M5. Xe–xe chồng nhau ở giao lộ (nhiều lớp nguyên nhân)
Số đo (`sim.mts`, 300 s, mật độ 1, lấy mẫu mỗi 0,1 s):

| Điểm | Số cặp | Số mẫu |
|---|---|---|
| Concorde | 9 | 619 |
| Opéra | 17 | 209 |
| Étoile | 23 | 334 |
| Marais | 19 | 684 |
| St-Germain | 18 | 184 |
| Concorde, mật độ 2 | 36 | 401 |

Các lớp nguyên nhân:
1. Xe vào vòng xuyến (B2).
2. Cùng nhánh, khác làn: xe rẽ từ làn không phải làn sát lề cắt ngang xe đi thẳng; làn cố định từ lúc sinh, `extend()` (:297-319) chọn hướng rẽ bất kể làn.
3. Xe đã vào góc cua mà không giữ claim lối ra (claim chỉ đặt khi chưa vào góc, :238-243) → xe theo sau cùng làn không claim, xe nhánh khác đi vào cùng lối ra (≈ 10 cặp). Suy từ đọc code.
4. Hai nút giao sát nhau (Concorde, Marais (2601,1021)): góc cua hai nút cắt nhau, không kiểm tra xung đột giữa các nút (≈ 40 % số cặp).
5. Rẽ trái cắt xe đối diện khi đèn xanh: ponytail đã ghi.
- Gợi ý sửa: làn 0 mới được rẽ phải, làn cuối mới được rẽ trái; mọi xe đang trong góc đăng ký claim cho `route[1]` trong snapshot. Ghi (4) và (5) vào TODO / ponytail.

## MINOR
- **m1.** Xe chờ vào vòng xuyến vì xe đang chờ ở nhánh khác: `approaching()` (`traffic.ts:177-181`) đệ quy vào cả nhánh không thuộc vòng. `ringwait.mts`: 20–28 % thời gian chờ ở vạch vào Étoile do xe không ở trên vòng; trên vòng trung bình 2,7–3,4 xe. `p4b-etoile` lúc chụp không có xe nào trên vòng. Sửa: khi `ctl.kind === 'ring'` chỉ đệ quy qua cạnh vòng; neo preset ở tâm vòng.
- **m2.** `crowd.crossReach` không được dùng; người qua đường ở miệng giao lộ (`cd`), không qua ở vạch như kế hoạch §3.7.
- **m3.** Tốc độ quay bánh lệch: sim `wheelR = cao × 0.2` (`traffic.ts:342, 453`), renderer quay theo bán kính model (`NpcRenderer.ts:142`) → bánh van / truck / bus quay chậm 22–24 %, city / sedan nhanh 7–11 %.
- **m4.** Tunable viết cứng ngoài `config.ts` (trái CLAUDE.md): `lights.ts:123` (+0,5); `crowd.ts:599` (1,2 / 0,45), `:608` (2 m/s), `:381` (0,6), `:321/324` (3 / 1,8); `traffic.ts:173` (8 m), `:199` (4 m/s, 6 s), `:218` (1,3, +3), `:316` (trọng số rẽ), `:500/:522` (12 m, 6 m).
- **m5.** Thân moto 2 060 tam giác, vượt ngân sách 2 000 (meshopt không giảm được từ 2 092). Test chỉ kiểm tổng thân + người lái ≤ 3 500.
- **m6.** `Npc.setExclusionZones` (`Npc.ts:203`) tạo `LineBasicMaterial` mới mỗi lần gọi, không dispose cái cũ.
- **m7.** Khi bị xe đẩy, KCC bỏ qua mọi collider NPC (`CharacterController.ts:74, 241, 294`) → người chơi đi bộ (> 1 m/s đẩy) có thể xuyên xe. Chỉ đọc code, chưa tái hiện.
- **m8.** Test không bắt được lỗi: test kẹt xe chỉ 1 seed; `traffic.test.ts:274` bỏ qua gap < −0,5 (chính là trường hợp chồng nhau); `:341` chỉ đòi worst ≥ 0; toàn bộ test traffic chạy dt 1/20, game chạy 1/60; không có test ghép Traffic + Crowd + Npc ở mật độ > 0.
- **m9.** Tài liệu tồn: `TODO.md:89` vẫn ghi "còn 4 track A–D"; CLAUDE.md chưa có thư mục `npc/`, `npc.html`, tham số `?npc*`, tên build `npc-*`; `phase2b-assets.md:14` vẫn ghi Rocketbox "không đề xuất"; thêm vào ponytail §8: người không né xe, rẽ từ mọi làn, quyền qua giao lộ ai đến trước được trước, bán kính bánh.
- **m10.** `ride-check` đang đỏ nhưng KHÔNG do 4B: phần 1 (F sau `walkToBike`) và 2 (lên lại xe) hỏng, phần 3 lúc qua lúc hỏng; phần 1 hỏng y hệt ở `bcbb452` và `2fbea89`. Nguyên nhân: `press()` chờ cố định 300 ms thời gian thật; máy tải 36–45, SwiftShader chưa xử lý được 1 bước trong 300 ms → phím F chưa kịp xử lý → `riding` null → `.id` crash. Đổi chờ 3 s thì lên xe được. Với `npc=0` đường vật lý giống hệt Phase 4. Sửa: chờ `simTime` tăng thay vì chờ cố định; chạy lại trên máy rảnh.
- **m11.** Screenshot `p4b-density`, `p4b-street`, `p4b-dodge`, `p4b-bike-car` quá 30 s chưa có `__READY__` do máy tải nặng; stats vẫn lấy được.

## Đã đạt
- Tích hợp giữa track: `knocked` → `crash()` khi |tốc độ| ≥ `bike.crashImpact` (`Npc.ts:175`); `crowd.lights = traffic.lights` (`Npc.ts:140`); D dùng Traffic / Crowd / `loadNpcAssets` thật (`park()` chỉ cho `?npcTest`, `NO_LIGHTS` chỉ là mặc định); `IGNORE_NPC` áp cho camera, `surface()`, `groundAt`; merge sạch (chỉ `screenshot.ts` tự gộp).
- Yêu cầu NPC: `?cam=` luôn có NPC (23–60 xe), `?npc=0` tắt; sim không dùng `Math.random` / `Date`; có `setExclusionZones`; NPC không vào dữ liệu bản đồ; không thêm request mạng; `p4b-concorde` từ 0 xe lên 24 xe.
- Asset: `process-assets` chạy 2 lần từ đầu cho SHA1 trùng hệt bản đã commit (3 GLB + `credits.json`, ≈ 23 s mỗi lần); credits có "(đã chỉnh sửa)" cho scooter, moto (CC-BY) và Rocketbox; đã bỏ file `ped-*` Quaternius; có `LICENSE-rocketbox.md`.

## Ngân sách §9 (đo khi máy tải 36–45, FPS 8 → CPU là mức xấu)

| Mục | Đo được | Giới hạn | Kết quả |
|---|---|---|---|
| GLB | vehicles 0,25 MB · peds 1,44 · anims 1,49 · tổng 3,19 MiB | 1,5 / 5 / 2 / 8,5 | đạt |
| Tam giác mỗi mẫu | xe 770–1 646; truck 2 500; bus 934; scooter 1 700 + lái 1 350; moto **2 060** + 1 350; người LOD0 7 364–8 966; LOD1 2 208–2 424 | 2 000 (bus/truck 2 500) / lái 1 500 / 9 000 / 2 500 | moto vượt 60 |
| Tam giác thêm (Opéra, nền `npc=0` = 687 k) | mật độ 1 (39 xe / 28 người): +203 k; trần (60 xe / 40 người): +316 k | ≤ 350 k | đạt |
| Lệnh vẽ thêm (gồm bóng) | mật độ 1: +45; trần: +54 | 55 + bóng 27 | đạt |
| CPU traffic | 60 xe: 0,184 ms/bước | 0,5 | đạt |
| CPU crowd | 40 người: 0,025 ms/bước | 0,3 | đạt |
| CPU trình duyệt | `npcMs` 0,004–0,38; `npcDrawMs` 0,29–0,85 ms/khung | 1,5 ms/khung | đạt |
| Warm-up | fill + 20 s: 134–324 ms | ≤ 1 s | đạt |
| Rapier | pool 16 cuboid kinematic | ≤ 16 | đạt |
| Mạng | 0 request Worker / DO mới, chỉ thêm 3 GLB tĩnh | 0 | đạt |
