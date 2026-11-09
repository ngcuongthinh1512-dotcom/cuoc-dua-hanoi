# Leg 3 – Hoàng hôn (`timeOfDay = 'dusk'`)

Chủ sở hữu (2026-11-09): Hà Nội đua lúc hoàng hôn. Chế độ thứ ba bên cạnh `'day'` / `'night'` của Leg 2; hai chế độ cũ
không đổi hình. Ngoài phố đua thật luôn dùng `config.timeOfDay`; offline `?time=day|night|dusk`.

## Cách làm
- `world/night.ts`: `TimeOfDay` thêm `'dusk'`; `isDusk()`; `glowOn()` = dusk hoặc night (đèn đường, cửa sổ, neon, đèn xe);
  `glowScale()` = `lighting.emissiveScale` × `lighting.dusk.emissiveScale` lúc hoàng hôn (trời còn sáng nên đèn dịu hơn).
  Các thứ "trời tối" (trăng, sao, bản đồ ánh sáng mặt nước, biển tên phố không đèn, cầu thang phát sáng, hòm / thảm Pit
  Stop, áo đội phát sáng) vẫn chỉ `isNight()`: ban hoàng hôn trông như ban ngày.
- `world/Sky.ts`: không HDRI; bầu trời canvas vẽ theo `lighting.dusk.sky` (gradient zenith → `stops` → `horizon`, quầng +
  đĩa mặt trời đúng hướng `lighting.dusk.sun.position`, mây lót sáng: ấm phía mặt trời, tím phía đối diện) làm nền, làm
  ánh sáng môi trường (chất lượng cao: `scene.environment`, nước hồ phản chiếu đúng trời) và màu sương (= `horizon`).
  Mặt trời = DirectionalLight duy nhất, thấp ≈ 10° (`position` {−470, 86, 170}: tây-tây-nam, phương vị ≈ 250° như Hà Nội
  tháng 11); bóng dài, hộp bóng + snap texel như ban ngày; `shadowBias` / `shadowNormalBias` riêng vì tia là là mặt đất.
- Cửa sổ (`facadeNightGlsl`): nhà "có đèn" (`MeshBucket.lit > 0`, `buildings.macao.litShare` 35 %) sáng `windows.litShare`
  (60 %), nhà còn lại `otherShare` (25 %, seed 0 nên hoa văn lặp theo ô) → ≈ 37 % cửa sổ; độ sáng × `windows.intensity`.
  Biển hiệu cửa hàng (`shops.openShare`) như ban đêm × `glowScale()`.
- `post.ts`: bloom `lighting.dusk.bloom` (mạnh hơn ngày, ngưỡng thấp hơn: quầng mặt trời, đèn). `Water.ts`: gradient phản
  chiếu `lighting.dusk.water` khi không có ánh sáng môi trường (chất lượng thấp). Chi phí ≈ ban ngày (không thêm đèn /
  pass; thêm vài draw call đèn như ban đêm).
- Worker chunk không đọc gì cả (như Leg 2).

## Núm vặn (`lighting.dusk` trong `client/src/config.ts`)
- `sun.color` 0xffa048, `sun.intensity` 3.0 (không IBL `low.sunIntensity` 2.8), `sun.position` → độ cao = atan(y / √(x²+z²)).
- `hemi` 0x8e8ab0 / 0x6e4c34 × 1.2 (không IBL `low.hemiIntensity` 2.4), `environmentIntensity` 0.7.
- `sky.zenith` / `stops` / `horizon` (= màu sương), `glow` (bán kính px của canvas 1024, `stretch` bẹt ngang), `disc`,
  `clouds` / `cloudAlpha` / `cloudNear` / `cloudFar`. Có post-processing thì ACES tone-map cả canvas nên màu đặt bão hòa hơn ý muốn.
- `bloom` {0.3, 0.5, 1.7}; `emissiveScale` 0.7; `windows` {litShare 0.6, otherShare 0.25, intensity 1.2}.
- `shadowBias` −0.0012, `shadowNormalBias` 0.08.

## Ảnh (`SCREENSHOT_PORT=5187 npm run screenshot -- hanoi-dusk`)
`hanoi-dusk-street` (Bà Triệu), `-street-west`, `-street-low`, `-ga` (Ga Hà Nội, nhìn về phía mặt trời), `-church` (Nhà thờ Lớn),
`-aerial` / `-aerial-low` (120 m trên hồ Hoàn Kiếm), `-lake` (bờ đông, mặt trời trên hồ), `-lake-east` (bờ tây nhìn đông),
`-sky` (trời phía đối diện mặt trời), `-shadows` (bóng dài, cửa sổ sáng), `-oldq`, `-day` (đối chứng ban ngày).

## Giới hạn
- Địa danh Hà Nội (Ga, Nhà thờ Lớn, quán hmm…) chưa có phần phát sáng theo đêm nên lúc hoàng hôn cũng không sáng.
- Bóng bị kéo dài theo hướng tia (texel bóng ≈ 45 cm dọc tia) nên mềm hơn ban ngày theo trục đó.
- Mây lót sáng khá nhẹ (cố ý); một màu sương cho mọi hướng.
