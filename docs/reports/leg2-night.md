# Leg 2 – chế độ buổi tối (bản tối thiểu)

Trạng thái: XONG bản tối thiểu (2026-10-06). Chưa commit (config.ts / attach.ts… đang có thay đổi của agent khác trong cùng
cây làm việc; điều phối viên commit phần `render`→`lighting` + các file dưới đây).

## Đã đổi
- `client/src/config.ts`: `timeOfDay: 'day' | 'night'` (mặc định `'night'`) + khối `lighting` (ngay sau `render`).
- `client/src/world/night.ts` (mới): `pickTime(url, online)` (thuần, có test `night.test.ts`), `initTimeOfDay(query, online)`,
  `isNight()`, `nightGlow(colour, intensity)` → `{ emissive, emissiveIntensity }` (đen ban ngày; ban đêm × `emissiveScale`).
- `main.ts`: `initTimeOfDay(query, isOnline(query))` trước sky / post / vật liệu. `?time=day|night` chỉ offline; trong cuộc đua
  thật (`?race=`, bản PROD) luôn dùng `config.timeOfDay`.
- `world/Sky.ts`: ban đêm giữ bầu trời canvas (không HDRI): gradient `lighting.sky` + sao (canvas 2K, chỉ ban đêm), mặt trăng =
  DirectionalLight duy nhất (màu lạnh, ≈ 35°, vẫn đổ bóng, bóng snap theo texel), hemisphere tối, `scene.environment` = chính
  canvas đêm (high), sương = màu chân trời (tone-map như đường không post). `lowLight()` (tụt FPS) cũng đúng ban đêm.
- `world/Water.ts`: `skyEnvironment()` (phản chiếu nước khi không có scene.environment + kim loại landmark) đọc `lighting.water`.
- `world/post.ts`: bloom ban đêm `lighting.bloom` (threshold 0.9, strength 0.55) thay `graphics8c.post.bloom`.
- `world/StreetProps.ts`: `lampGlow()` thêm vào MỌI mức LOD của cột đèn: bóng đèn MeshBasic HDR (bloom; trên low = màu ấm
  không HDR), vũng sáng cộng (additive, `shadowSide: BackSide` để không đổ bóng), và một mức chỉ-bóng-đèn tới 650 m (đèn
  thành phố nhìn từ xa). Vị trí bóng = tâm phần kính của props.glb. Biển tên đường ban đêm = MeshBasic sáng `signBrightness`.
  Ban ngày: không đổi gì. Không có đèn thật nào.

## Khóa config (`lighting`)
`sky {zenith, horizon, stars, starAlpha, starBand}`, `water {zenith, horizon}`, `moon {color, intensity, position}`,
`hemi {sky, ground, intensity}`, `low {moonIntensity, hemiIntensity}`, `environmentIntensity`, `bloom {strength, radius,
threshold}`, `lamp {colour, intensity, bulbRadius, pool {radius, strength}, farDistance}`, `windows {litShare, colour,
intensity}`, `emissiveScale`, `signBrightness`.

**Cho agent tòa nhà / địa danh:** `import { nightGlow } from './night.ts'` rồi
`Object.assign(material, nightGlow(lighting.windows.colour, lighting.windows.intensity))` (hoặc màu biển hiệu / đèn pha của
địa danh); `lighting.windows.litShare` = tỉ lệ cửa sổ sáng. Ban ngày emissive = 0 nên an toàn. Vật liệu MeshBasic
`toneMapped: false` (neon) đã phát sáng sẵn. Không dùng đèn thật.

## Ảnh (screenshots/, SCREENSHOT_PORT 5193)
`night-senado-high/low` (Avenida de Almeida Ribeiro), `night-senado-dayref` (`&time=day`: y như trước), `night-praia-high/low`,
`night-oldtown-high` (nhìn từ trên), `night-water-high/low/day` (hồ Nam Van, đèn bờ kè), `night-casino-high`,
`night-stairs-high` (phố sáng đèn), `night-boxes-high`, `night-box-high/low` (hòm mật thư + Pit Stop).

## Kiểm tra độ dễ nhìn ban đêm
- Hòm mật thư: thấy rõ trong 10–15 m (cột sọc vàng/đỏ), hơi tối hơn ban ngày; prompt "Bấm F" vẫn có. Chưa thêm phát sáng
  (ClueBoxes.ts ngoài phạm vi file được sửa) → xem mục mở.
- Thảm Pit Stop + cột đèn đỏ: rất rõ.
- Biển tên đường: MeshBasic, đọc được (không cần ánh sáng).
- Bậc thang / vỉa hè: đọc được nhờ hemisphere + trăng; mép vỉa hè rõ.
- Minimap / HUD / bản đồ M: HTML/canvas riêng, không bị ảnh hưởng.
- Đèn giao thông: giữ `glow` như cũ. Draw call: +≈ 20 ở Senado (389 vs 368 ban ngày).

## Còn mở
- Vũng sáng nằm ở cao độ vỉa hè: phần tràn ra lòng đường nổi ≈ 0,15–0,2 m (thấy như vệt sáng mảnh ở góc nhìn thấp).
- Hòm mật thư nên có viền phát sáng nhẹ (ClueBoxes.ts: emissive trên sọc vàng) nếu anh thấy tối.
- Đèn khi `graphics8c.props` tắt (đường Phase 7 tĩnh): không có bóng sáng.
- Nước rất tối ở high (phản chiếu bầu trời đêm); không có phản chiếu đèn.
- Địa hình trơ (đồi / bãi bồi không nhà) sáng nhạt dưới trăng – do màu địa hình.
- `tsc` hiện báo lỗi ở `geo/fixture.ts` (`'macau-tower'`) – của agent địa danh, không phải phần này.

## Bản "đầy đủ" sẽ thêm
Neon casino (Grand Lisboa, Lisboa, Wynn) bằng emissive + bloom, đèn pha / đèn hậu xe NPC (emissive trên mẫu xe), phản chiếu
đèn trên nước (sọc sáng dọc / planar reflection), cửa sổ sáng theo từng tòa (agent tòa nhà), đèn chiếu địa danh, hòm mật
thư / bậc thang có viền sáng, sao bằng Points sắc nét, có thể chu kỳ chiều → tối.
