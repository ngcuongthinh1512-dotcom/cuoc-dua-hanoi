# Phase 8C – Tiến độ tải tài nguyên đồ họa (2026-10-03)

Phạm vi: các mục KHÔNG phải Sketchfab của `phase8c-asset-candidates.md` §5 (#6, #18–#24, #26) đã được người dùng duyệt. Bỏ qua mọi mục Sketchfab (tải tay) và #25 LiDAR. Lưu trong `.cache/assets/8c/` (đã `git check-ignore`, không commit). Manifest: `.cache/assets/8c/manifest.json` (tệp, trang nguồn, giấy phép đọc trên trang, tác giả, sha256, kích thước).

Cách tải: tuần tự, ≥ 2 s giữa hai yêu cầu, User-Agent mô tả rõ, chạy lại được (bỏ qua tệp đã đủ theo kích thước + sha256). Mỗi mục mở trang nguồn kiểm giấy phép trước khi tải; mọi mục đều khớp (MIT / CC0 / PD), không mục nào bị từ chối.

| # | Mục | Kết quả |
|---|---|---|
| 6 | Rocketbox, 9 avatar (Male_Adult_02, Male_Adult_14, Female_Adult_09, Female_Adult_12, Sports_Female_01, Sports_Male_02, Business_Male_04, Delivery_Male_01, Police_Male_02) | 32 tệp, MIT (trang repo + API + `LICENSE.md`), đã đối chiếu git blob sha. Chỉ lấy FBX chính + texture body / head / opacity (đúng phần `process-assets` đọc); bỏ `*_facial.fbx`, normal, specular. |
| 18 | Poly Haven `street_lamp_01` glTF 1K | đủ (gltf + bin + 3 texture), CC0, md5 khớp |
| 19 | Poly Haven `outdoor_table_chair_set_01` glTF 1K | đủ, CC0 |
| 20 | `kloofendal_48d_partly_cloudy_puresky` 1K + 2K .hdr | đủ, CC0. Không có bản JPG tonemapped 4K (chỉ 8K, 22 MB) nên KHÔNG tải JPG; dùng phương án "hoặc 2K .hdr". |
| 21 | `qwantani_puresky` 1K .hdr | đủ, CC0 |
| 22 | 9 texture Poly Haven 2K JPG (diff + nor_gl + arm) | 27/27 tệp, CC0, md5 khớp |
| 23 | ambientCG LeafSet030, Ground108, Grass004, Metal028 (2K JPG zip) | 4/4, CC0, zip kiểm toàn vẹn |
| 24 | Áp phích Commons (Chéret + Toulouse-Lautrec) | 8 tệp, PD / CC0, cạnh dài ≤ 2 000 px (bước thu nhỏ 960 / 1280 của Commons) |
| 26 | `waternormals.jpg` | MIT. `node_modules/three` không chứa `examples/textures`, nên lấy từ GitHub tag `r186` (đúng phiên bản cài) + `LICENSE-three.txt` |

Tổng: 87 tệp tải được (+ LICENSE), 0 bỏ qua, 0 lỗi, ≈ 473 MB.

Ghi chú:
- Commons chỉ phục vụ ảnh thu nhỏ ở các bước 960 / 1280 / 1920 / 3840 px (2048 bị từ chối); script chọn bước gần mục tiêu nhất.
- `8c/sketchfab/` để trống cho người dùng tải tay.

## Phòng Louvre (chỉ tóm tắt)
15/15 ảnh tranh, 2 ảnh tượng (chỉ 2 tượng không có bản quét hợp lệ theo SPEC §17.19/§17.20), 0 lỗi, ≈ 15 MB, lưu ngoài repo (`.cache/assets/louvre/`). Có 1 ảnh CC-BY-SA (đã ghi cờ trong manifest); còn lại PD / CC0.
