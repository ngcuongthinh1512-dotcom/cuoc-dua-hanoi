# Phase 8C – Nhóm sửa B (ánh sáng / chất lượng Cao–Thấp / hiệu năng)

Ngày 2026-10-03, nhánh `phase8c-fixB` (từ main f1f6751). Trạng thái: **XONG**. `npm run build` qua; `npm test` qua (scripts 113 + shared 79 + client 774 + worker 172 = 1 138). `ride-check` OK (không đổi: đi bộ / xe / ngã / lên lại như trước), `hud-check` mọi mục ok, 0 lỗi console; p8b-room / -button / -lock chụp lại sạch.

Nguồn: `phase8c-review-visual.md` #2 #5 #6, `phase8c-review-run.md` F1 F3, `phase8c-review-speccode.md` #6 #7 #8, kế hoạch `docs/plans/phase8c-graphics.md` §7.3. Không đụng `scripts/assets/*`, `client/public/{models,textures}`, `landmarks/*`, `StreetProps.ts`, `worker/*`, `shared/*`, `race/ui/*`, `host/*`.

## Đã sửa
| # | Việc | Sửa |
|---|---|---|
| 1 | Độ sáng Cao ≠ Thấp | `graphics8c.sky`: Cao `environmentIntensity` 0,5 → 0,25, `sunIntensity` 2,4 → 3,2 (bóng cây rõ lại); Thấp (không IBL) có mức riêng `sky.low` = mặt trời 2,8 + hemi 2,3 (trước dùng `render.sun` 2,6 / hemi 1,2 của Phase 7 với mặt trời 40° thấp hơn + tán cây mới → tối). Cùng mức dùng cho tự hạ cấp (#3). |
| 2 | FPS Thấp | Thấp: `pbrMaps()` chỉ còn ảnh màu cho ngói + nhựa đường (không normal / ARM), màu xám = AO trung bình + roughness trung bình của ARM (`quality.lowArm`); cây không normal map; nước MỘT lớp normal (đường normal map gốc của three); cây: LOD0 ≤ 18 m, LOD1 18–45 m, ảnh giả (impostor) từ 45 m, chỉ LOD0 đổ bóng (`trees.lowLod [18, 45]`, `trees.lowShadow false`). Hậu kỳ + IBL vốn đã tắt ở Thấp. |
| 3 | Tự hạ cấp | `world/graphics.ts FpsWatch` (thuần, test): chỉ ở Cao do người dùng / GPU chọn (không có `?quality=`), sau 5 s ân hạn, FPS trung bình một cửa sổ 8 s < 24 (`quality.autoDowngrade`) → `post.dispose()` + `sky.lowLight()` (bỏ `scene.environment`, đèn mức Thấp, màu sương cho đường vẽ thẳng, kim loại / nước nhận lại env gradient nhỏ như ở Thấp), toast "Đã tự giảm chất lượng đồ họa để chạy mượt" một lần, không tải lại; KHÔNG ghi localStorage (kiểm thật trong Chrome: lưu "high" → toast hiện, sau hạ cấp vẫn "high", 0 lỗi console). Khung > 10 s (tab ẩn) bắt đầu lại cửa sổ; không đếm trong phòng Louvre. |
| 4 | Phòng Louvre vẽ cả thành phố | `world/hideWorld.ts` (+ test) + `main.ts`: khi `room.active`, mỗi khung ẩn mọi object cấp 1 của scene trừ phòng (`LouvreRoom.root`), nhân vật mình, người chơi khác (`RemotePlayers.owns`), đèn; vẽ thẳng không hậu kỳ; ra phòng hiện lại đúng những gì đã ẩn (vật bị dỡ trong lúc đó không hồi lại). Đo `?louvre=1&card=louvre&roomAt=view&quality=high`: **338 → 29 lệnh vẽ** (716 k → 36 k tam giác); ra phòng (leave + moveTo) → 343 lệnh vẽ, thành phố + NPC + trời hiện đúng (`room-out.png`), 0 lỗi console. |
| 5 | Cây Thấp / vỏ cây | Thấp: LOD0 trong 18 m (không còn thẻ lá phẳng khi đứng dưới tán); vỏ platane: vertex colour theo hash, xám ô liu `#7a7a72` + mảng xám-kem `#d4d2c4` (`trees.bark`, chia độ sáng trung bình của ảnh vỏ), thân LOD0 chia 4 + 3 vòng (LOD1 giữ ≤ 150 tam giác). |
| 6 | Sky / anisotropy | `Sky.ts` dispose canvas 1024×512 khi HDRI / Sky.js thay nền; `textures.ts` anisotropy = `graphics8c.quality.anisotropy` (three tự kẹp theo GPU). |
| 7 | Ô chọn menu nền trắng | `menu.css .menu-row select`: nền tối trong suốt, viền như nút, `color-scheme: dark`, viền vàng khi focus. |
| 8 | Docs | T1: ghi chú MutationObserver đánh dấu lỗi thời; integration: ghi rõ preset thường = Thấp (SwiftShader = GPU yếu), gạch số FPS "1,5 → 2,3" sai mốc, trỏ về báo cáo này; CLAUDE.md: FpsWatch, hideWorld, Thấp chỉ ảnh màu. |

## Độ sáng (luma ảnh SwiftShader 1280×720; `street` = vùng mặt đường y 440–690, các cảnh khác cả ảnh; mean / p5)
| Cảnh | Trước 8C | Cao trước sửa | Thấp trước sửa | **Cao sau** | **Thấp sau** |
|---|---|---|---|---|---|
| `street` (cam, Champs) | 105 / 40 | 126 / 72 | 65 / 15 | **99 / 47** | **100 / 32** |
| `champs` (trên cao) | 118 / 51 | – | 113 / 58 | 132 / 49 | 133 / 72 |
| `p8c-post` (Rue Royale, người chơi) | 114 / 25 | – | – | 115 / 33 | 123 / 25* |
| `seine` | 150 / 41 | – | – | 131 / 40 | 138 / 54* |

Cao và Thấp nay cùng độ sáng trung bình (lệch ≤ 7 % mọi cảnh); `street` trong ±6 % trước 8C, bóng cây trên lòng đường sắc trở lại ở Cao (p5 72 → 47). `champs` từ trên cao sáng hơn trước 8C ≈ 12 % ở cả hai mức (mái ngói / cây mới sáng hơn mái xanh-xám cũ – vật liệu, không phải đèn). *Đo trước bước cuối (cây Thấp bớt bóng ở 18–45 m); `street` / `champs` Thấp đo ở bản cuối. Ảnh trong worktree `screenshots/` (không commit): `lum-d-hi.png`, `street.png`, `champs*.png`, `seine.png`, `p8c-post*.png`, `room-hi.png`, `room-out.png`, `auto-low.png`.

## FPS (preset `p8c-bench`: xe đạp autoMove lên Champs, NPC mật độ 1; Vite dev, Chrome headless SwiftShader 1280×720, 20 s rAF sau `__READY__`; "trước 8C" = git worktree tạm ở 7270518 = cha của merge b4733d1, đã xóa sau khi đo)
Đo xen kẽ trước / Thấp / Cao trong cùng vòng, máy tải 7–10 (gần rảnh):

| Vòng | Trước 8C avg / p5 | Thấp avg / p5 | Cao avg / p5 | Lệnh vẽ (trước / Thấp / Cao) |
|---|---|---|---|---|
| 1 | 3,58 / 3,53 | 3,28 / 3,16 | 1,23 / 1,20 | 351 / 333 / 362 |
| 2 | 3,57 / 3,33 | 3,28 / 3,16 | 1,23 / 1,18 | 351 / 333 / 362 |
| 3 | 3,56 / 3,33 | 3,27 / 3,00 | 1,24 / 1,22 | 351 / 333 / 362 |
| 4 | 3,58 / 3,53 | 3,30 / 3,00 | 1,24 / 1,22 | 351 / 333 / 362 |
| TB | **3,57** | **3,28 = 92 %** | **1,24 = 35 %** | tam giác 1,01 M / 0,73 M / 0,84 M |

Trước khi sửa (cùng cách đo, 12:35, máy tải 7–11): trước 8C 3,48, Thấp 2,23 (64 %), Cao 1,13 (32 %) – khớp reviewer 3.

Tìm nguyên nhân (Thấp, từng lượt cặp với "trước 8C" cùng lúc): chỉ ảnh màu + nước 1 lớp + LOD0 18 m: 2,64 (73 %); **tắt hẳn cây 8C ở Thấp (cây Phase 7): 3,74 = 104 %** → toàn bộ chênh lệch còn lại là thẻ lá cây; ảnh giả từ 60 m: 82 %; + LOD1 không đổ bóng: 89 %; bóng LOD1 bằng vật liệu sâu không alpha-test: không đổi (chi phí là diện tích trong shadow map, không phải alpha – bỏ); LOD0 tới 25 m: 83 %; **ảnh giả từ 45 m + LOD1 không bóng: 92–93 %** (chọn). Đánh đổi ở Thấp: cây cách 18–45 m không đổ bóng, ảnh giả từ 45 m (bật lại bóng: `trees.lowShadow = true`, ≈ −10 % FPS).

**Cao: KHÔNG đạt §7.3 trên SwiftShader** (35 %, tiêu chí ≥ 85 %). SwiftShader tô pixel bằng CPU nên mọi chi phí theo pixel của Cao bị phóng đại: IBL (PMREM) trên mọi vật liệu, normal + ARM map mái / nhựa đường / cây, tán LOD0 48 cụm × 3 thẻ trong 60 m + bóng lá alpha, nước 2 lớp, bloom + SMAA ở độ phân giải đầy đủ. Đây là đường cho GPU rời / Apple Silicon (máy yếu tự nhận Thấp theo `weakGpu`); nếu máy người chơi vẫn chậm, #3 tự tắt hậu kỳ + IBL sau ~13 s. Cần đo trên laptop thật của người dùng (Mac + GPU tích hợp) – chưa làm được ở đây.

## Lệch so với yêu cầu
- "Nền trời đơn giản" ở Thấp: không đổi – nền HDRI 1K có cùng chi phí vẽ như nền canvas Phase 7 (cùng đường equirect → cube); đo cho thấy chênh lệch nằm hết ở cây.
- "Thưa lá cây (ít card)" làm bằng khoảng cách LOD (ảnh giả từ 45 m) + bỏ bóng LOD1 thay vì đổi hình học LOD1 (hình học dùng chung với Cao; test StreetProps giữ ngân sách tam giác).
- Cao không đạt §7.3 trên SwiftShader (xem trên); không hạ thêm Cao vì máy Cao là GPU thật.
- `p8c-post` / `seine` Thấp chưa đo lại sau bước cuối.
