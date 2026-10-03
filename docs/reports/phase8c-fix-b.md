# Phase 8C – Nhóm sửa B (ánh sáng / chất lượng Cao–Thấp / hiệu năng)

Ngày 2026-10-03, nhánh `phase8c-fixB` (từ main f1f6751). Trạng thái: **ĐANG LÀM** (code xong, đang đo FPS xen kẽ).

Nguồn: `phase8c-review-visual.md` #2 #5 #6, `phase8c-review-run.md` F1 F3, `phase8c-review-speccode.md` #6 #7 #8, kế hoạch `docs/plans/phase8c-graphics.md` §7.3.

## Đã sửa
| # | Việc | Sửa |
|---|---|---|
| 1 | Độ sáng Cao ≠ Thấp | `graphics8c.sky`: Cao `environmentIntensity` 0,5 → 0,25, `sunIntensity` 2,4 → 3,2; Thấp (không IBL) có mức riêng `sky.low` = mặt trời 2,8 + hemi 2,6 (trước dùng chung `render.sun` 2,6 / hemi 1,2 của Phase 7 nhưng mặt trời thấp hơn 40° + tán cây mới → tối). |
| 2 | FPS Thấp | Thấp: `pbrMaps()` chỉ còn ảnh màu (không normal / ARM) cho ngói + nhựa đường, màu xám = AO trung bình + roughness trung bình của ARM (`quality.lowArm`); cây không normal map; nước MỘT lớp normal (đường normal map gốc của three, không chèn shader); hậu kỳ + IBL vốn đã tắt. |
| 3 | Tự hạ cấp | `world/graphics.ts FpsWatch` (thuần, test): Cao, không có `?quality=`, sau 5 s ân hạn, FPS trung bình một cửa sổ 8 s < 24 → `post.dispose()` + `sky.lowLight()` (bỏ `scene.environment`, đèn mức Thấp, màu sương cho đường vẽ thẳng, kim loại / nước nhận lại env gradient nhỏ), toast "Đã tự giảm chất lượng đồ họa để chạy mượt" một lần; KHÔNG ghi localStorage. Khung > 10 s (tab ẩn) bắt đầu lại cửa sổ. Không chạy trong phòng Louvre. |
| 4 | Phòng Louvre vẽ cả thành phố | `world/hideWorld.ts` + `main.ts`: khi `room.active` mỗi khung ẩn mọi object cấp 1 của scene trừ phòng (`LouvreRoom.root`), nhân vật mình, người chơi khác (`RemotePlayers.owns`), đèn; vẽ thẳng không hậu kỳ; ra phòng hiện lại đúng những gì đã ẩn. |
| 5 | Cây Thấp / vỏ cây | `trees.lowLod` [0, 150] → [18, 150] (LOD0 trong 18 m); vỏ platane: màu đỉnh (vertex colour) theo hash, xám ô liu + mảng xám-kem (`trees.bark`), thân LOD0 chia 4 + 3 vòng. |
| 6 | Sky / anisotropy | `Sky.ts` dispose canvas 1024×512 khi HDRI / Sky.js thay nền; `textures.ts` anisotropy = `graphics8c.quality.anisotropy` (three kẹp theo GPU). |
| 7 | Ô chọn menu nền trắng | `menu.css .menu-row select`: nền tối trong suốt, viền như nút, `color-scheme: dark`. |
| 8 | Docs | T1: ghi chú MutationObserver đánh dấu lỗi thời; integration: ghi rõ preset thường = Thấp, gạch số FPS "1,5 → 2,3" sai mốc. |
