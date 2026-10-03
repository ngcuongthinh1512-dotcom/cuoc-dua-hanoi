# Phase 8C – báo cáo tích hợp

Ngày 2026-10-03. Ghép T0 → T3 → T1 → T2 vào `main` (merge --no-ff), sửa phần tích hợp, kiểm tổng hợp. CHƯA có commit `feat(phase8c)` (còn review).

## 1. Ghép
| Nhánh | Commit | Merge | Xung đột |
|---|---|---|---|
| `phase8c-T0` | c9088b3 | `merge(phase8c): T0 …` | `docs/plans/phase8c-graphics.md` (lấy bản T0, mới hơn), `scripts/screenshot.ts` (giữ dòng VIEWPORT `p8b-real-view-small` của main + khối `p8c-*` của T0) |
| `phase8c-T3` | 19a1cf7 | `merge(phase8c): T3 …` | không |
| `phase8c-T1` | dabc359 | `merge(phase8c): T1 …` | không |
| `phase8c-T2` | 34a4fc8 + 6373c10 | `merge(phase8c): T2 …` | không (chunk dữ liệu ghép sạch) |

Sau mỗi merge: `tsc` + vitest của client (740 → 745 → 747) và scripts.

## 2. Sửa tích hợp (`fix(phase8c): ghép …`)
- **Mục "Chất lượng đồ họa"**: `qualityRow()` (export từ `ui/settings.ts`) thành một dòng trong `Menu.build` (khung Cài đặt); bỏ `mountQualitySetting` + MutationObserver và lời gọi trong `world/post.ts`; test cập nhật.
- **`render.sky.horizon` / quầng skyline**: `landmarks/g5.ts` `createSkyline` đọc `scene.fog.color` mỗi khung (`onBeforeRender`): sRGB khi vẽ thẳng ra canvas, tuyến tính khi vẽ vào render target của hậu kỳ (giống `fogColor` của three). Quầng La Défense / Sacré-Cœur / Montparnasse khớp sương HDRI ở cả Cao lẫn Thấp; `render.sky.horizon` chỉ còn là giá trị trước khi HDRI tải (và bầu trời canvas khi `graphics8c.sky` tắt).
- **`UNUSED`** (`scripts/assets/manifest.ts`): thêm `sketchfab/animated_bird_pigeon` (T2 không làm bồ câu) và `polyhaven/hdri/qwantani_` (HDRI dự phòng, `hdri.ts` không xuất) – không xử lý, không ghi nguồn; test manifest thêm 2 mục.
- **`credits.json`**: `npm run process-assets -- hdri textures trees props flamme` → +13 dòng `set: '8c'` trước dòng chung "Phòng Louvre" (không tên tác phẩm): 5 dòng CC BY từng tác phẩm (nhà chờ xe buýt, hộp sách bờ kè, Ngọn lửa Tự do, cột Morris, ghế công viên) + 8 dòng nhóm CC0 / PD / MIT (texture ambientCG, áp phích Commons CC0 / PD, bầu trời, bàn ghế quán, cột đèn, texture Poly Haven, mặt nước). Tài nguyên đầu ra sinh lại giống hệt bản đã commit của các track (git không thấy thay đổi nhị phân).
- Docs: `CLAUDE.md` (graphics8c, graphics / textures / post / Sky / Water, scripts/assets, target process-assets, preset `p8c-*`, menu Chất lượng), `TODO.md` (mục Phase 8C), `README.md`, `docs/reports/HANDOFF.md`.

## 3. Kiểm
- `npm run build`: qua. `npm test`: scripts 112 + shared 77 + client 747 + worker 155 = **1 091**, 0 fail, 0 skip.
- `grep ZodError client/dist` = 0. Tệp tĩnh lớn nhất: `main-*.js` 5,49 MB, `sky_2k.hdr` 5,45 MB (≤ 25 MB).
- `client/dist`: **40 444 KB (39,5 MB) → 65 300 KB (63,8 MB)** (+24,3 MB: HDRI 2K + 1K 6,9 MB, texture PBR roof / asphalt / trees 2K + 1K ≈ 11,5 MB, `props.glb` 1,5 MB, `lm-flamme.glb` 1,2 MB, waternormals…).
- Ghi nguồn trong game (dev, chế độ thẻ đang đua): trước đích hiện "Mở sau khi về đích"; sau đích (`?credits=louvre`) có dòng 8C + Phòng Louvre.
- `sim --leg louvre --bots 3 --speedup 2`: 3 / 3 đội về đích, ≈ 35 642 request / 20 đội × 2 giờ (< 40 000), 7,7 dòng ghi / bot / phút.
- `hud-check`: mọi mục ok, 0 lỗi console. `ride-check`: OK (đi bộ 4,0 / xe 5,2 m/s, tỉ lệ 1,30, nghiêng 15,6°, ngã / đứng dậy / lên lại đúng; heap 143 → 155 MB). `RIDE_ONLY=3`: không chạy (điều phối viên yêu cầu xong sớm).

### Số liệu `__STATS__` (SwiftShader headless)
**Lưu ý:** SwiftShader khớp `graphics8c.quality.weakGpu` (= GPU yếu) nên MỌI preset thường (`street`, `champs`, `etoile`, `seine`, `eiffel`, `topdown`, `p8c-trees`, `p8c-roof`, `p8c-flamme`, `lm-*`) chạy ở chất lượng **Thấp**, không phải chất lượng máy người chơi có GPU rời; chỉ `p8c-bench`, `p8c-sky`, `p8c-post` (có `&quality=high`) là **Cao**.
| Preset | Lệnh vẽ trước → sau | Tam giác (M) trước → sau |
|---|---|---|
| `street` | 328 → 319 | 0,91 → 0,69 |
| `champs` (trên cao) | 1432 → 1287 | 4,15 → 2,31 |
| `etoile` (trên cao) | 593 → 532 | 1,73 → 1,12 |
| `seine` | 283 → 268 | 1,07 → 0,51 |
| `eiffel` (trên cao) | 477 → 418 | 1,72 → 0,80 |
| `topdown` | 5153 → 4545 | 12,91 → 7,71 |
| `p8c-bench` (Cao) | 347 → 361 | 0,99 → 0,82 |
| `p8c-bench-low` | 347 → 333 | 0,99 → 0,74 |
| `p8c-sky` (Cao) | 323 → 340 | 0,93 → 0,76 |
| `p8c-post` (Cao) | 329 → 339 | 0,91 → 0,77 |
| `p8c-trees` | 338 → 329 | 0,99 → 0,72 |
| `p8c-roof` | 369 → 340 | 0,95 → 0,69 |
| `p8c-flamme` | 317 → 307 | 1,27 → 0,87 |
| `lm-flamme` | 337 → 312 | 1,05 → 0,76 |
| `lm-notre-dame` | – → 400 | – → 0,80 |

Ngân sách ≤ 450 lệnh vẽ / ≤ 1,5 M tam giác: mọi cảnh mặt đất đạt. Cảnh trên cao `champs` / `etoile` / `topdown` vượt 450 (vốn đã vượt trước 8C; đều GIẢM). FPS SwiftShader (chỉ so tương đối): ~~bench Cao 1,7 → 1,1, Thấp 1,5 → 2,3~~ – **sai**: mốc "trước" đo lúc máy tải nặng ở thời điểm khác, không so được. Đo xen kẽ cùng điều kiện (reviewer 3, `phase8c-review-run.md` (3)): trước 8C ≈ 3,5, Cao ≈ 1,0 (≈ 29 %), Thấp ≈ 2,2 (≈ 64 %). Sau nhóm sửa B (`phase8c-fix-b.md`, 4 vòng xen kẽ): trước 8C 3,57, Thấp 3,28 (92 %), Cao 1,24 (35 %, SwiftShader).

### Ảnh
Đã chụp: mặc định (topdown … p4b-*, p8b-*), `p8c` (14 preset), `p8b`, `p8`, `p7`, `p6-boxes`, `p5-hud`, `lm-flamme`, `lm-notre-dame`: 0 lỗi console, trừ một lỗi Vite `504 (Outdated Optimize Dep)` trong lượt mặc định đầu tiên (Vite tối ưu lại dependency mới `three/examples/jsm/postprocessing` giữa chừng; nhóm `p8b` chạy lại sạch). Đã xem: street / etoile / seine / topdown / eiffel so với `before-8c`, `p8c-flamme`, `p8c-props`, `p8c-post`, `p6-boxes`, `p8b-room`: cây platane, bầu trời mây, nước Seine, ngói, nhựa đường, đồ phố hiện đúng, không vỡ hình.

## 4. Còn lại / cho reviewer
- Track report T1 còn nhắc MutationObserver (nay đã bỏ).
- HUD vẫn hiện đồng hồ đội: việc của phase8d (SPEC §17.23), không đụng.
- `RIDE_ONLY=3` chưa chạy lại; FPS thật trên máy người dùng; LOD pop; lucarne; bồ câu không làm.
