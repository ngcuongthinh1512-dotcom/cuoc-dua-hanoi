# Phase 8B – Track D (Host + công cụ + tài liệu) – báo cáo tiến độ

Nhánh `phase8b-track-D`. Cập nhật dần.

- [x] (1) Host: ô louvre, nút "Cho qua" (host.review approve không id), `?demo=1&louvre=1` (preset p8b-host), dòng chặng, test.
- [x] (2) leg:check: bảng 23 tác phẩm (`louvreTable`), luật id art-NN + tệp khớp id, mã / tệp đáp án lộ trong chữ đội đọc, 5 mã liền / nhỏ nhất / lớn nhất, GENERIC (image / mesh / node…) bớt báo giả, credits.json quét thêm photo + source, "thiếu giấy phép". Test: shared/src/leg/louvre-codes.test.ts, scripts/leg-check.test.ts.
- [x] (3) process-assets target `louvre`: scripts/assets/louvre.ts (+ test tổng hợp), credits.json một dòng chung.
- [x] (4) sim: `louvreMove` / `louvreAnswersOf`, bot sai -> chờ -> đúng, báo cáo chốt sai / feed; test thuần qua; test tích hợp `sim --leg louvre` bị skip tới khi track A ghép (steps.ts còn `return silent` cho pick/lock).
- [x] (5) docs: RACE_RULES (mục Thử thách 3 + sửa câu cũ + §12/§13), LEG_FORMAT §7.5, §11, §13.
- [x] (6) preset p8b-host = `/host.html?demo=1&louvre=1`. PNG: cột "Thử thách 3" nằm ngoài khung 1280 px (bảng cuộn ngang) nên chưa thấy trong ảnh; ô được kiểm bằng test progressTable. Dòng chặng "Thử thách 3: phòng Louvre, 23 tác phẩm…" và cảnh báo kẹt 80 phút thấy trong ảnh.
- Lối thoát Host: nút "Cho qua" gửi host.review approve KHÔNG id cho bước louvre; server hiện từ chối (review() chỉ cho kind free) tới khi track A mở cho louvre.
- Ngoài phạm vi nhưng lệch: ảnh 2048 (yêu cầu người dùng) vs 1024 trong kế hoạch; leg:check vẫn cảnh báo > 300 KB.
