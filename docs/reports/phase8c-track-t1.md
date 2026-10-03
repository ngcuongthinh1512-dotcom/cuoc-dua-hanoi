# Phase 8C – Báo cáo track T1 (bầu trời + nước + hậu kỳ)

Ngày 2026-10-03. Nhánh `phase8c-T1` (từ `phase8c-T0` c9088b3), worktree riêng, KHÔNG merge vào main. `graphics8c.sky / water / post.enabled = true`.

## 1. Đã làm
- **Tài nguyên** (`scripts/assets/hdri.ts`, `npm run process-assets -- hdri`): Poly Haven `kloofendal_48d_partly_cloudy_puresky` (CC0) → `client/public/textures/sky_2k.hdr` (5,20 MB, chất lượng cao) + `sky_1k.hdr` (1,37 MB, thấp); `three/waternormals.jpg` (MIT) → `textures/waternormals.jpg` (0,24 MB). Chép nguyên (HDR đã nén RLE). `qwantani_puresky_1k.hdr` không dùng (dự phòng, không chép). Dòng Ghi nguồn: nhóm CC0 / MIT của `credits8c` (T0) – `credits.json` KHÔNG commit, sinh lại khi ghép.
- **Bầu trời + ánh sáng** (`client/src/world/Sky.ts`): `graphics8c.sky.mode = 'hdri'` (mặc định): HDRI làm `scene.background` + `scene.environment` (renderer tự tạo PMREM một lần) → ánh sáng môi trường cho mọi vật liệu standard (mái, tường, kim loại, GLB Eiffel / Khải Hoàn Môn). Ảnh HDRI được xoay (`backgroundRotation` / `environmentRotation`) để mặt trời trong ảnh trùng phương vị DirectionalLight. Mặt trời riêng: tây nam, cao 40° (`graphics8c.sky.sunPosition`, STYLE_GUIDE 35–45°). Sương mù = màu trung bình dải chân trời 0–6° của HDRI (tính một lần lúc nạp; đã tone-map ACES khi không có hậu kỳ để khớp nền); nửa dưới HDRI (mây mờ của ảnh "pure sky") thay bằng màu chân trời, dải 6° phía trên mờ dần → nhìn từ trên cao không còn vệt mây dưới đường chân trời. Bóng đổ: hộp bóng bám theo camera được làm tròn theo texel trong không gian ánh sáng (hết nhấp nháy mép bóng khi di chuyển, 0 chi phí). Phương án B `mode: 'shader'` (three `Sky.js`, MIT, Preetham + mây, không tệp): chạy được, bake PMREM ở khung đầu; so ảnh (`screenshots/t1-shader/`) nhạt và trắng hơn HDRI → giữ HDRI làm mặc định. Bầu trời canvas Phase 7 hiện đến khi HDRI nạp xong / khi tải lỗi.
- **Nước sông Seine** (`client/src/world/Water.ts`): `waternormals.jpg` hai lớp (34 m và 13 m mỗi lần lặp, trôi lệch hướng, cộng trong shader qua `onBeforeCompile`) → không thấy lặp ô; phản chiếu bầu trời HDRI (Fresnel của PBR, roughness 0,04) + ánh nắng lấp lánh; màu xanh xám đậm. Lưới, mực nước, kè, carve sông và collider không đổi.
- **Hậu kỳ** (`client/src/world/post.ts`): `EffectComposer`: RenderPass (HalfFloat, tuyến tính) → UnrealBloom rất nhẹ (ngưỡng 3: chỉ mặt trời lấp lánh trên nước, vàng mái vòm, neon) → OutputPass (ACES + sRGB) → SMAA. `renderer.info` đếm mọi pass (autoReset tắt, reset mỗi khung) → `__STATS__` / F3 gồm cả hậu kỳ.
- **Kim loại landmark** (`landmarks/index.ts`, chỉ `envMap`): dùng `scene.environment` (HDRI) khi có; vàng Invalides có highlight thật từ HDRI (ảnh zoom: mái vòm sáng / tối theo mây, đỉnh có quầng bloom).
- **Chất lượng** (`client/src/ui/settings.ts`): Esc → Cài đặt → "Chất lượng đồ họa" (Cao / Thấp), ghi `localStorage[graphics8c.quality.storageKey]`, gợi ý "áp dụng sau khi tải lại trang". (Lúc track: gắn từ `settings.ts` bằng `mountQualitySetting` + MutationObserver. **Lỗi thời** – khi ghép đã thay bằng `qualityRow()` gọi trong `Menu.build`, xem `phase8c-integration.md` §2.)
- **Hạ cấp** (GPU yếu / `?quality=low`): hậu kỳ tắt (`post.lowOff`, về `renderer.render` + MSAA canvas); HDRI 1K chỉ làm nền + sương mù, KHÔNG ánh sáng môi trường (`sky.lowEnvironment: false`: trên SwiftShader IBL tốn −35 % FPS), đèn bán cầu / mặt trời giữ mức Phase 7, kim loại và sông phản chiếu bầu trời nhỏ `skyEnvironment()` như cũ; nước vẫn hai lớp. Tắt hẳn từng mục: `graphics8c.<mục>.enabled = false` = y hệt Phase 7.
- **Preset** (`scripts/screenshot.ts`): `p8c-sky`, `p8c-seine`, `p8c-gold`, `p8c-post`, `p8c-bench` thêm `&quality=high` (SwiftShader khớp `weakGpu` nên mặc định là `low`); `p8c-sky-low`, `p8c-bench-low` giữ `quality=low`.
- **Cấu hình**: `graphics8c.{sky,water,post}` (mọi tunable); `render.sky.horizon` `#c9d9e6` → `#bfc2cc` (= màu chân trời hiển thị của HDRI, để quầng mờ skyline Sacré-Cœur / La Défense của `g5.ts` – vốn đọc hằng này – khớp sương mù mới).
- **Test** (thuần): `world/Sky.test.ts` (phương vị mặt trời + màu chân trời từ ảnh equirect, lấp nửa dưới, ACES khớp three, cấu hình T1: bật, hậu kỳ tắt ở low, mặt trời 35–45°), `ui/settings.test.ts` (+1: lưu chất lượng, đọc lại qua `pickQuality`, storage bị chặn → false, mount trong Node không lỗi).

## 2. Số liệu (SwiftShader headless, máy tải nặng ~10; FPS chỉ so tương đối cùng lúc)
| Preset | Lệnh vẽ trước → sau | Tam giác (M) trước → sau |
|---|---|---|
| `street` (auto low) | 328 → 337 | 0,91 → 0,93 |
| `seine` (auto low) | 283 → 291 | 1,07 → 1,14 |
| `eiffel` (auto low) | 477 → 479 | 1,72 → 1,74 |
| `lm-invalides` (auto low) | 402 → 408 | 1,39 → 1,45 |
| `p8c-sky` (high) | 323 → 349 | 0,93 → 0,94 |
| `p8c-sky-low` | 323 → 332 | 0,93 → 0,94 |
| `p8c-seine` (high) | 283 → 308 | 1,06 → 1,14 |
| `p8c-gold` (high) | 314 → 341 | 1,21 → 1,26 |
| `p8c-post` (high) | 329 → 358 | 0,91 → 0,95 |
| `p8c-bench` (high) | 343 → 369 | 0,99 → 1,01 |

Hậu kỳ thêm ≈ 17 lệnh vẽ toàn màn hình (bloom 5 mức ×2 blur + lọc sáng + ghép, output, SMAA 3) – kế hoạch ghi "+≤ 5", vẫn dưới trần 450 (trừ `eiffel` vốn đã 477 trước 8C, chạy auto-low nên không có hậu kỳ). Phần còn lại (+5…9) là NPC / hộp bóng làm tròn texel (khung cảnh ngẫu nhiên). Tam giác thêm ≈ 0 (Sky.js chỉ một hộp ở mode shader).

FPS (`p8c-bench`, 15 s, đo cùng một đợt, T1 tắt hẳn vs bật):
| | T1 tắt (≈ Phase 7) | T1 bật |
|---|---|---|
| `p8c-bench` (high) | 3,4 / p5 2,6 | 3,1 / p5 3,0 (−9 %) |
| `p8c-bench-low` | 3,4 / p5 2,9 | 3,5 / p5 3,3 (≈ 0 %) |

(Trước khi tắt IBL ở low: low 2,2 FPS = −35 %; high nhanh hơn low vì composer bỏ MSAA canvas, SMAA rẻ hơn trên CPU.) Số TRƯỚC trong báo cáo nền (1,7 / 1,5) đo lúc máy tải khác, không so trực tiếp.

Dung lượng tải thêm: cao 5,20 + 0,24 MB, thấp 1,37 + 0,24 MB (≤ 25 MB / tệp, ≤ +25 MB tải đầu).

## 3. Ảnh trước / sau (đã xem PNG)
`screenshots/before-8c/<preset>.png` vs `screenshots/<preset>.png` (+ `t1-shader/`, `t1-bench/`, `t1-menu.png`): trời xanh có mây cumulus thật thay gradient + đốm mây; mặt tiền / mái nhận ánh sáng môi trường (bớt phẳng, bóng dịu hơn); sông có phản chiếu mây + lấp lánh; vàng Invalides có highlight + quầng; nhìn từ cao (eiffel, lm-invalides) sương mù liền với nền trời, skyline La Défense / Montmartre chìm đúng trong sương. Vòng sửa: 3 (giảm sáng môi trường / bloom chỉ còn điểm rất sáng; lấp nửa dưới HDRI + màu skyline; tắt IBL ở low vì FPS).

## 4. Kiểm tra
- Test gói client (`vitest src/world src/ui`): qua. `ride-check`: OK (không đổi). Không lỗi console ở mọi preset đã chụp. Không còn vite / Chrome chạy nền.
- `npm run build && npm test` từ gốc worktree: xem §6.

## 5. Lệch / việc khi ghép
- ~~Hàng "Chất lượng" gắn vào menu bằng `MutationObserver`~~ – đã xử lý khi ghép: `qualityRow()` trong `Menu.build`, không còn MutationObserver (ghi chú lỗi thời, giữ để tra lịch sử).
- Quầng mờ skyline (`landmarks/g5.ts`) đọc `render.sky.horizon` cố định; đã đổi giá trị cho khớp HDRI. Với hậu kỳ bật, quầng trộn trước tone mapping nên hơi nhạt hơn sương (khó thấy). Gọn hơn: `g5` đọc `scene.fog.color` (ngoài phạm vi T1).
- `render.sky.horizon` đổi cũng làm bầu trời canvas (khi `graphics8c.sky` tắt) hơi xám hơn Phase 7.
- Hậu kỳ +17 lệnh vẽ (kế hoạch "+≤ 5"); SMAA thay MSAA khi hậu kỳ bật (MSAA trên render target ở pixel ratio 2 tốn ~250 MB).
- `main.ts` không sửa (`createSky` không cần renderer: HDRI để renderer tự PMREM; mode shader bake trong `onBeforeRender`).
- CSM 2 cascade: không làm (ponytail trong `Sky.ts`; chỉ làm tròn texel).

## 6. Kiểm cuối
`npm run build && npm test` từ gốc worktree: qua. Test: scripts 109, shared 76, client 737 (+5: `Sky.test.ts` 4, `settings.test.ts` 1), worker 154 = 1 076.

## 7. Cần thử tay
- GPU thật (Mac / Windows rời + Intel tích hợp): FPS cao / thấp, độ sáng tổng thể, bloom có quá chói không.
- Esc → Cài đặt → Chất lượng → Thấp → tải lại: hậu kỳ tắt, trời 1K; về Cao.
- Đạp xe dọc kè: mép bóng không nhấp nháy; mặt sông động tự nhiên.
