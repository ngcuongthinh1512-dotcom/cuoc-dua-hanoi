# Leg 2 – cửa sổ sáng + biển hiệu ban đêm

Trạng thái: XONG (2026-10-06), chưa commit. `npx tsc --noEmit -p client` sạch; `npm run test -w client` 767 pass, 1 fail
không phải phần này (`geo/mapData.test.ts` "L1: ['ruins']" – dữ liệu bản đồ / địa danh của agent khác).

## Đã đổi
- `client/src/world/night.ts`: `facadeNightGlsl(shop, rx, ry)` (null ban ngày → shader y như trước). Trả về đoạn GLSL:
  vertex `attribute float lit` → `vLit`; fragment chạy tại `<color_fragment>` (trước tint, lúc `diffuseColor` = texel + alpha
  của map) và cộng vào `totalEmissiveRadiance`.
  - Mặt tiền: ô cửa = `floor(vMapUv / repeat)` (bay × tầng); kính = alpha ≤ 0,5 (smoothstep 0,45–0,55); tòa có `lit > 0`:
    `windows.litShare` số cửa sáng, hash(ô, seed); màu theo `windows.palette` (trắng ấm / vàng / xanh TV / hồng), độ sáng
    × [0,6; 1,2] và sáng hơn về phía trần.
  - Dải cửa hàng: `shops.openShare` số cửa hàng mở (hash(cửa hàng, seed)): biển hiệu (trim, canvas v 0,74–0,96) phát sáng
    bằng chính màu biển × `shops.sign`, kính tủ hàng × `shops.interior`.
  - Seed lượng tử hóa (`floor(vLit·997)`): varying nội suy bị rung → hash lấp lánh (đã thấy và sửa).
- `client/src/world/BuildingBuilder.ts` (bắt buộc: `facadeMaterial` nằm ở đây, không phải attach.ts): nối `facadeNightGlsl`
  vào chuỗi onBeforeCompile sẵn có; cache key = key cũ + đoạn glow; `shopfront` luôn có seed
  (`p.lit || hash01(…, 5)`) để cửa hàng của tòa tối vẫn có thể mở.
- `client/src/config.ts` `lighting`: `windows { litShare 0.55 (tỉ lệ cửa sáng TRONG tòa sáng), colour, intensity 1.1,
  palette [[màu, trọng số cộng dồn]…] }`, `shops { openShare 0.6, sign 1.8, interior 1.1 }`; tất cả × `emissiveScale`.
  Tỉ lệ tòa sáng vẫn là `buildings.macao.litShare` (0,35).
- Test: `world/night.test.ts` (null ban ngày, có glow ban đêm, repeat → ô).

## Chi phí
0 texture, 0 draw call, 0 hình học thêm; ≈ 20 phép tính ALU trong shader mặt tiền, chỉ ban đêm (ban ngày shader không đổi).
Draw call ở Senado 410 đêm / 369 ngày (chênh lệch là đèn đường của agent đêm). Low: cùng shader, không bloom → cửa sổ / biển
vẫn sáng màu.

## Ảnh (screenshots/, SCREENSHOT_PORT 5197)
`lw-spawn-night` / `lw-spawn-day` / `lw-spawn-low` (Avenida de Almeida Ribeiro, Senado), `lw-praia-night` (Pátio da Penha,
`?player=-430,640,0`), `lw-oldtown-night` (`cam=0,260,350,0,-40`), `lw-nape-night` (`cam=1450,80,450,20,-12`).
Ngày: không đổi.

## Còn mở
- Tòa kính (curtain) sáng theo cả ô panel → ít điểm sáng; có thể tăng litShare riêng cho curtain nếu muốn NAPE rực hơn.
- Cửa hàng mở luôn có biển sáng; biển của cửa đóng tắt hẳn (không có biển neon riêng / nhấp nháy).
