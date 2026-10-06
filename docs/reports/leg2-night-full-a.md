# Leg 2 – đêm đầy đủ, phần A (gameplay + xe)

Trạng thái: XONG (agent N-A, 2026-10-06), chưa commit. `npx tsc --noEmit -p client` sạch; `npm run test -w client` 74 file /
862 test pass. Không có đèn thật nào; ban ngày không đổi (đã so ảnh ngày).

## Đã đổi
- `client/src/world/glow.ts` (mới): `nightHdr(colour, k)` (× emissiveScale; k > 1 chỉ khi có post / bloom, không thì ≤ 1),
  `falloffAt` / `falloff('round' | 'cone')` (DataTexture 64², dùng chung), `additive(kind, colour)` (cộng sáng, không ghi
  depth, polygonOffset, không đổ bóng).
- `net/ClueBoxes.ts`: ban đêm sọc vàng / đỏ emissive `boxes.emissive` (ngày vẫn `clueBox.glow`), cột sáng = màu HDR
  + cộng sáng, halo sprite ở đầu hòm (≥ `halo.size` m, ≥ `halo.spread` m mỗi m khoảng cách → vẫn là một chấm sáng từ xa),
  vũng sáng dưới chân. Hòm đã mở: halo / vũng × `opened` (0,3) → hòm cần tìm sáng hơn hẳn.
- `race/PitStop.ts`: ban đêm sọc vàng = viền sáng (`pit.rim`), thảm đỏ hơi phát sáng (`pit.carpet`), cột đỏ HDR (`pit.beam`).
- Bậc thang: `world/StairBuilder.ts` thêm dải sáng hình chữ L ở mũi mỗi bậc (trên mặt bậc + đầu cổ bậc, nhìn được từ dưới
  lẫn từ trên; bậc bến dưới mặt nước thì không). Vật liệu mới `stairGlow` (`buildTypes.ts`, `attach.ts`: màu dự phòng +
  nhóm GROUND không đổ bóng), tạo ở `world/stairs.ts createStairMaterials()` (thêm 1 mục trong danh sách vật liệu của
  `main.ts`): MeshBasic HDR, `visible: false` ban ngày (worker xây giống nhau ngày / đêm).
- `npc/NpcRenderer.ts`: `lampSpots(geometry, twoWheeler, taxi)` (thuần, đặt đèn lên CHÍNH bề mặt mẫu xe: đỉnh / đuôi xa
  nhất quanh điểm đèn; xe 2 bánh 1 đèn giữa; taxi: hộp đèn mái từ các đỉnh cao nhất, hoặc hộp 0,6 m nếu mái phẳng).
  Ban đêm 2 InstancedMesh mới: `lamps` (hộp đèn, màu theo instance: pha trắng ấm, hậu đỏ, phanh đỏ mạnh hơn theo
  `CarPose.braking`, hộp taxi) và `cones` (vệt sáng hình nón cộng sáng trên đường trước mũi xe; xe 2 bánh × 0,6). Đèn
  pha nằm ở mũi mô hình (+Z) = hướng chạy, nên chạy bên trái (`traffic.driveLeft`) không ảnh hưởng (test kiểm tra đèn pha
  phía trước theo hướng đi).
- Test: `NpcRenderer.test.ts` (số đèn / phía trước / phanh sáng hơn / lampSpots), `StairBuilder.test.ts` (1 chữ L mỗi
  bậc, lên & xuống), `ClueBoxes.test.ts` (halo / vũng dịu hơn khi đã mở, halo to theo khoảng cách; test cũ lọc bỏ halo/pool).

## Khóa config (`lighting`, trong `client/src/config.ts`)
`boxes { emissive, beam, halo { size, spread, strength, y }, pool { radius, strength }, opened }`, `pit { rim, carpet, beam }`,
`stairs { strip, lift, inset, colour, intensity }`, `cars { head { colour, intensity, size, y, x }, tail { colour, intensity,
brake, size, y, x }, twoWheeler { y, size }, roof { colour, intensity }, cone { width, length, strength, colour, lift } }`.

## Ảnh (screenshots/, SCREENSHOT_PORT 5231)
- Hòm: `nA-box-night` (gần, Av. Almeida Ribeiro), `nA-box-far-night` / `-far-day` / `-far-low` (≈ 90 m: cột vàng vẫn thấy rõ).
- Pit Stop: `nA-mat-night` / `nA-mat-day`.
- Bậc thang (Rua da Sé, 29 m): `nA-stairs-night` (từ dưới), `nA-stairs-top-night`, `nA-stairs-day`.
- Xe: `nA-junction-night` / `nA-junction-day` (nhìn từ trên ngã tư 150,140: vệt sáng trước xe), `nA-street-night`,
  `nA-cars-close-night` (đèn pha xe + xe máy, vệt nón trên đường), `nA-traffic-day`.
- Nhãn tên đội ("Đội thử") đọc rõ ban đêm (sprite không chịu ánh sáng); minimap / HUD không đổi.

## Chi phí
- Xe: +2 draw call cố định ban đêm (dù bao nhiêu xe), ≈ 12 tam giác × ≤ 5 đèn / xe + 2 tam giác / xe; `npcDrawMs`
  0,57–0,76 ms đêm vs 0,52 ms ngày (≈ 100 xe, SwiftShader). Ngày: 0.
- Hòm mật thư: +2 draw call / hòm ban đêm (halo + vũng). Pit Stop: 0 thêm.
- Bậc thang: +1 draw call / chunk có bậc ban đêm; ban ngày 0 draw call (chỉ thêm ≈ 8 đỉnh / bậc trong bộ nhớ).
- FPS: bench SwiftShader không dùng được để so (ngày 2,5 fps; bench đêm hết giờ khi agent N-B chụp song song). Chênh draw
  call ngày / đêm trong ảnh (vd. 335 → 378) phần lớn là đèn đường / neon của N-B; phần N-A ≈ +2 (xe) + 1–3 (bậc).

## Còn mở
- Không có điểm đánh dấu respawn / check-in riêng ngoài thảm Pit Stop (check-in = thảm, SPEC §17.38) → không cần thêm.
- Vệt nón đèn xe phẳng theo độ dốc xe, không bám đường cong / dốc gãy; trên bậc / vỉa hè có thể nổi nhẹ.
- Đèn hậu chỉ bật khi đi; xe đỗ (`?npcTest`) cũng bật đèn. Không có xi-nhan.
- HDR chọn lúc tạo vật liệu: nếu FpsWatch tắt post giữa chừng, đèn (như đèn đường của N-B) sẽ hơi cháy trắng.
- Lỗi trang "Cannot use 'in' operator to search for 'lods'" thấy một lần trong lúc N-B đang sửa StreetProps (không phải
  phần này).
