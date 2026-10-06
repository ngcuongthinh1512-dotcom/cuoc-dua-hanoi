# Leg 2 (Macao) – kế hoạch tổng

Lập ngày 2026-10-06 (muộn: Leg 2 đã làm từng bước theo yêu cầu, bản này ghi lại những gì đã xong và những gì còn lại).
Quyết định của anh nằm ở: bộ nhớ dự án (`leg2-macao-fork`), `docs/plans/leg2-landmarks.md`, các báo cáo `docs/reports/leg2-*.md`.
Quy tắc mô hình: dùng **Opus**; **Fable chỉ khi thật sự cần** (anh chốt 2026-10-06). Không sửa `docs/SPEC.md`, không động tới `cuoc-dua-paris`.

## Cố định (anh đã chốt)
- Chỉ **bán đảo Macao** (khung 22.1755–22.2175 N, 113.527–113.5655 E, ≈ 40 % là biển), gốc tọa độ Largo do Senado.
- Chặng diễn ra **buổi tối, cố định** (`timeOfDay: 'night'`); không chọn ngày / đêm theo chặng, không chuyển cảnh.
- Xe và người đi bên **trái**.
- Tốc độ như trước ×1,5: đi bộ 4 m/s, xe đạp 1,3 × (5,2 m/s), nước rút ×2.
- **30 địa danh** (31 mã) dựng bằng code, không tải model nếu anh chưa duyệt từng file.
- Thử thách may rủi được phép (server tung ngẫu nhiên thật; chip giả, không tiền thật).

## Đã xong
| Phase | Nội dung | Commit |
|---|---|---|
| A – Thế giới | OSM + DEM bán đảo, biển dựng từ đường bờ (`scripts/coast.ts`), DEM làm mượt (`ground-dem`), xe chạy trái, 5 freguesia, chặng demo Macao, test chuyển sang Macao | `b8c4606` |
| B1 – Kiểu nhà + đêm tối thiểu + nền địa danh | nhà pastel Bồ Đào Nha / cao ốc, đêm (trời, trăng, đèn đường, cửa sổ sáng), đăng ký 31 mã, gỡ địa danh Paris | `50ef783` |
| B2 – Địa danh | 30 địa danh (m1–m4, mf1–mf2) | `8b39765` |
| B3 – Đêm đầy đủ | hộp mật thư / Chặng dừng / bậc thang sáng, đèn xe NPC, trời + biển + neon + đèn lồng + cửa sổ nhấp nháy | `40db8e2` |
| R – Review và sửa | review code (Fable) + hình ảnh (Fable, Opus), sửa chữ Paris, điểm lộ trình bị chôn, collider chắn lối đi, DEM dọc đường, viền thảm Chặng dừng | `9cda91c` |
| S – Tốc độ | hoàn lại ×1,5, hệ số xe đạp 1,3 | `512cd9b`, `9425533` |
| G1 – Grand Lisboa v2 | dựng lại theo ảnh thật (đế vòm, eo, đỉnh sen) | `e595592` |
Số liệu lúc commit R: scripts 120, shared 82, client 865, worker 187 test xanh; `npm run build` thoát 0.

## Đang chạy
- G2: sửa đỉnh sen Grand Lisboa xòe rộng hơn thân (agent Opus).
- G3: Hotel Lisboa (casino tròn thấp ốp lưới + vòng cánh quạt vàng, tháp trắng tròn) và MGM (ba khối vàng đồng / kính xanh / đồng đỏ, mép lượn sóng) theo ảnh tham chiếu (agent Opus).

## Còn lại (theo thứ tự đề nghị)
| # | Phase | Việc | Tiêu chí xong | Cần anh |
|---|---|---|---|---|
| 1 | G4 – Rà hình dáng địa danh | Chụp cận và so với hình thật: Santo Agostinho, Monte, Santa Casa, Dom Pedro V, Cultural Centre, tượng Kun Iam, Flor de Lótus, Portas do Cerco, Casa do Mandarim; Sands, A-Ma, Penha, Macau Tower, Science Center nghi lệch | mỗi địa danh có ảnh cận ngày + đêm, danh sách lệch, sửa các cái anh chọn | ảnh thật nếu có |
| 2 | M – Model quét sẵn (tùy chọn) | tìm model CC0 / CC BY cho vài địa danh trọng điểm, lập bảng nguồn / giấy phép / dung lượng / tam giác | anh duyệt từng file trước khi tải; `process-assets` + ghi nguồn | duyệt tải |
| 3 | C1 – Bỏ Phòng Louvre, phòng casino sau | **Phòng Louvre bỏ đi** (anh chốt 2026-10-06). Phòng casino do anh tự tạo, **anh chưa bắt đầu**: chưa làm gì cho tới khi anh bảo | Louvre đã gỡ, `npm run build && npm test` xanh; phòng casino: chờ anh | cách gỡ (xem ghi chú dưới), trò casino |
| 4 | C2 – Chặng thật + gắn lộ trình | nhập nội dung thật vào file chặng (ngoài repo), đặt L1–Ln, Chặng dừng ở sân trước địa danh, `leg:check`, ảnh từng điểm | `leg:check` 0 lỗi, ảnh `leg-*` đã duyệt, đội chạy thử bằng `sim` | nội dung chặng |
| 5 | V – Cảnh xa | Macau Tower / Grand Lisboa nhìn từ xa (sương che từ ~700 m), bóng Taipa / Cotai từ `skyline.json`, mặt phẳng nền Flor de Lótus | nhìn rõ Macau Tower từ 1,5 km | |
| 6 | Q – Chất lượng | đo FPS thật (máy thật, chất lượng cao / thấp, tự hạ cấp), kích thước asset ≤ 25 MB, `sim --full` đo hạn mức 2 giờ cho Macao | FPS đạt ngưỡng của game, hạn mức < 40.000 request / < 20.000 dòng cho 8 đội | anh thử trên máy thật |
| 7 | D – Deploy riêng | tên Worker / R2 `cuoc-dua-macao`, `docs/DEPLOY.md` đúng tên, `HOST_PASSWORD`, `npm run deploy` do anh chạy | trang Host chạy trên miền riêng | tài khoản Cloudflare |
| 8 | Tài liệu | `docs/RACE_RULES.md` cho Macao (đêm, tốc độ, phòng casino, luật không dùng AI), README, `TODO.md` | tài liệu khớp bản chạy | luật AI / hình thức đua |
| 9 | Cổng cuối | `npm run build && npm test`, `sim --full`, chụp lại bộ ảnh, review cuối (Opus; Fable chỉ khi cần) | xanh, báo cáo `docs/reports/leg2-gate.md` | |

## Việc nhỏ đã biết (chưa xếp phase)
- Phòng Louvre và nội dung Paris còn trong `worker/legs/test/louvre.json`, `client/src/race/LouvreRoom.ts`, `client/public/art/` (23 tác phẩm Paris), kiểu nhiệm vụ `louvre` ở schema / server / Host / `leg-check` / `sim` – **sẽ gỡ ở C1** (anh đã chốt bỏ).
- `KNOWN_MACAO` / `KNOWN_STEPS` (cầu biển ở rìa khung, bậc cầu 3–17,7 m cạnh Macau Tower) cần xử lý ở BridgeBuilder nếu muốn bỏ danh sách bỏ qua.
- Thẩm mỹ chưa sửa: vệt trăng chói trên nước, bờ Zhuhai và mép phía đông trống, đảo đất giả ở hồ Nam Van, biển hiệu cửa hàng là ký hiệu trừu tượng (chưa phải chữ Hán thật), biển "GRAND LISBOA" chỉ là vòng sáng.
- Biển hiệu và đèn lồng ẩn ngoài 350–450 m; phản chiếu trên nước chỉ có đèn, chưa có hình tòa nhà.
- Ảnh chụp tự động chạy bằng Chrome phần mềm (không bloom, không đo được FPS thật).

## Quy trình từ giờ
1. Mỗi phase có file kế hoạch ngắn hoặc mục trong tài liệu này, tiêu chí xong ghi trước khi giao việc.
2. Việc cơ học: Sonnet; thiết kế và dựng: Opus; Fable chỉ khi anh duyệt.
3. Review **một lần ở cổng cuối** (phase 9), ngoài ra mỗi agent tự chụp ảnh và chạy test; chỉ sửa lỗi ảnh hưởng chặng đua.
4. Mỗi agent ghi báo cáo vào `docs/reports/` sớm; điều phối viên chạy `npm run build && npm test` và commit ở cuối mỗi phase.
