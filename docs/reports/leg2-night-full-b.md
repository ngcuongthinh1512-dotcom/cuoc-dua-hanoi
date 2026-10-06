# Leg 2 – đêm đầy đủ, phần B (không khí: trời, nước, đèn phố / neon, cửa sổ)

Trạng thái: XONG (agent N-B, 2026-10-06), chưa commit. Ban ngày (`?time=day`) không đổi: mọi thứ mới chỉ chạy khi `isNight()`
(prop đêm có vật liệu `visible: false` ban ngày → 0 draw call; trời ngày giữ y gradient / mây cũ).

## Đã đổi
- `world/Sky.ts`: gradient đêm thêm dải `mid` + dải sáng ấm thành phố `glow` ngay trên chân trời (chân trời = màu sương như
  cũ); mây đêm (blob như ban ngày) màu ấm, đậm dần về chân trời (sáng từ dưới); trăng (đĩa + quầng) vẽ lên canvas đúng hướng
  `lighting.moon`; sao = `THREE.Points` (900 điểm, 1 draw call, shader nhấp nháy theo pha riêng, mờ dần về chân trời), bỏ sao
  canvas. `update()` đẩy `nightTime`.
- `world/night.ts`: `nightTime` (uniform thời gian dùng chung), `litShareAt(hour)`; cửa sổ: tỉ lệ sáng theo `lighting.hour`
  (0 = chập tối … 1 = khuya, × `windows.lateShare`), mỗi cửa tự bật / tắt lại mỗi `switchSeconds` (pha riêng), `tv.share` cửa
  là TV xanh nhấp nháy (`tv.rate` lần/s). `facadeNightGlsl` trả thêm `uniforms`.
- `world/BuildingBuilder.ts` (móc 1 dòng, khai báo): `Object.assign(s.uniforms, night.uniforms)` trong `facadeMaterial`.
- `world/Water.ts`: "phản chiếu" giả cho biển: `waterLightSpots()` (thuần) = đèn bờ (cạnh polygon biển, bỏ cạnh trùng khung
  bản đồ) + thuyền / phao + `glints` casino → canvas bản đồ đèn 1024²; shader nước tra bản đồ tại điểm tia phản xạ (pháp tuyến
  gợn ×2,5) cắt mặt phẳng y = mực nước + `height` → vệt sáng lấp lánh kéo về phía người nhìn; Fresnel; `base` = phát sáng nền
  (biển không đen kịt, cả low). 40 đèn thuyền (đỏ / xanh / trắng, InstancedMesh con của mặt nước, ≥ 60 m từ bờ).
- `world/StreetProps.ts`: đèn đường trắng trong `lampModern.areas` (shader theo vị trí instance; ngoài vùng = vàng natri);
  PropKind mới (`buildTypes.ts`, 1 dòng, khai báo): `lantern` (đèn lồng đỏ có nắp + dây + tua, chuỗi ngang phố cổ trong
  `lanterns.zones`: Rua da Felicidade, Senado / São Domingos; 401 cái toàn bản đồ), `shopSign` (biển neon dọc nhô khỏi mặt tiền
  + bảng LED phẳng trên dải cửa hàng, hộp đơn vị co giãn theo instance, 6 màu, LED đổi màu + vạch chạy, 15 % biển dọc chập chờn;
  8159 cái), `aviation` (đèn đỏ hàng không ở góc mái tòa ≥ 100 m, nhấp nháy chung nhịp; 364 cái). Vị trí tính trong worker từ
  chunk data (`buildingHeight` export sẵn của BuildingBuilder; không đụng dữ liệu dải cửa hàng). Lantern / shopSign cắt theo
  khoảng cách (`lodInstances`, 350 / 450 m). Không collider.
- `world/allChunks.test.ts`: 3 kind đêm không tính vào trần 16 bucket/chunk (ban ngày 0 draw call). Test mới:
  `StreetProps.test.ts` (đèn lồng trong vùng / võng, biển trước mặt tiền, đèn hàng không trên mái), `night.test.ts`
  (`litShareAt`, uniform). `post.ts`: không cần đổi.

## Khóa config (`client/src/config.ts`, khối `lighting`)
`skyFull {mid, glow, glowFrom, clouds, cloudColour, cloudAlpha, starSize, twinkle, twinkleRate, moon {disc, halo, haloAlpha,
colour}}`, `waterLights {mapSize, height, strength, shoreStep, shoreShare, dot, colours, glints, base, boats {count, colours,
size, intensity, minShore}}`, `lampModern {colour, areas}`, `lanterns {zones, kinds, spacing, gap, height, sag, size, colour,
intensity, maxSpan, distance}`, `neon {kinds, minHeight, step, share, ledShare, reach, blade, led, y, colours, intensity,
flicker, ledRate, distance}`, `aviation {minHeight, size, colour, intensity, period, on, corners}`, `windows.lateShare`,
`windows.switchSeconds`, `windows.tv {share, colour, rate, depth}`, `hour`.

## Ảnh (screenshots/, SCREENSHOT_PORT 5211)
`nB-spawn-high` / `nB-spawn-low` / `nB-spawn-day` (Almeida Ribeiro; ngày y như cũ), `nB-felicidade-high/low` (đèn lồng, biển
neon), `nB-oldtown-high` (nhìn từ trên), `nB-praia-high` (`?player=-430,640,0`), `nB-nape-high` (casino NAPE), `nB-harbour2-high`
(vịnh nhìn từ cao), `nB-southbay-high/low` (phản chiếu đèn bờ + phao xanh, sát mặt nước), `nB-outer-high` (cảng ngoài, Sands).

## Chi phí
- Draw call (headless, cùng khung): Almeida Ribeiro đêm high ≈ 467 trước khi cắt khoảng cách (ngày 382, low 424; phần còn lại
  là đèn đường / NPC đêm của agent khác); thêm của phần này: sao 1, thuyền 1, ≤ 1 shopSign + ≤ 1 lantern mỗi chunk trong
  450 / 350 m, aviation 1 mỗi chunk có tháp. Sau khi cắt khoảng cách: Almeida Ribeiro 453 (high) / ngày 382 (cùng khung),
  Rua da Felicidade 336 high / 304 low, phố cổ từ trên 549, vịnh nam 150 high / 122 low.
- Shader: nước +1 texture lookup (mip 1) + ~25 ALU; mặt tiền +2 hash; prop đêm MeshBasic. Texture: bản đồ đèn 1024² (4 MB),
  canvas trời 1024×512 (sao canvas 2K cũ bỏ: −6 MB). Worker: đặt biển / đèn lồng / đèn bay +≈ 15 ms cho cả 323 chunk.
- FPS: headless SwiftShader không đo được có ý nghĩa; không có pass mới.

## Kiểm tra
`npx tsc --noEmit -p client` sạch; `npm run test -w client` 74 file / 862 test pass.

## Còn mở
- Đốm trăng trên nước (specular của DirectionalLight trăng, có từ trước) rất sáng ở high nếu nhìn ngược trăng; giảm
  `lighting.moon.intensity` hoặc tăng nhám nước ban đêm nếu thấy chói.
- Phản chiếu là bản đồ 2D ở một độ cao: không có bóng tòa nhà / không bị che; casino chỉ là quầng vàng theo `glints` (tay).
- Biển neon đặt theo mặt tiền dài ≥ 4 m gần phố, không đọc dải cửa hàng thật của BuildingBuilder (có thể lệch với tòa không
  có dải cửa hàng); vài biển có thể chạm biển hiệu landmark.
- Đèn lồng không có dây ngang qua phố (chỉ dây treo từng cái).
- `lampModern.areas` là 2 hình chữ nhật thô (x > 350 và phía bắc z < −1100).
- Nhìn từ trên cao (> 350–450 m) không còn thấy đèn lồng / biển neon (cắt khoảng cách); tăng `distance` nếu cần ảnh toàn cảnh.
