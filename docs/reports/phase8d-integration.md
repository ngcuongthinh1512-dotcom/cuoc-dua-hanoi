# Phase 8D – ghép vào main (2026-10-03)

## Ghép
- `git merge --no-ff phase8d-small` (e9c0800) → main, merge commit df78f48. Xung đột duy nhất: `TODO.md` (giữ cả mục Phase 8C và Phase 8D). `config.ts`, `screenshot.ts`, `main.ts`, Menu, hostView tự ghép sạch.

## Sửa tích hợp (`fix(phase8d): ghép …`)
- README: bỏ câu "bù vào giờ chính thức (cột Bù giờ chờ duyệt)" và "giờ xuất phát lệch" trong bảng phase; thêm dòng 8D.
- CLAUDE.md: HUD không còn clock / status badge; Host là bảng "Thứ tự vào game" (không giờ xuất phát); thẻ về đích / BỊ LOẠI từ `RaceView.result`.
- `scripts/sim.ts`: chú thích đầu file không còn "nhập giờ xuất phát".
- `scripts/leg-check.ts`: "Wikimedia Commons" / "wikimedia" vào danh sách từ chung của quét rò rỉ tác phẩm. Lý do: `credits.json` sinh lại ở 8C có dòng "Áp phích cột Morris (Wikimedia Commons)", trùng `credit.source` của tác phẩm Louvre trong chặng thật → `leg:check` báo LỖI giả. Test thêm trong `leg-check.test.ts` (track D).
- HANDOFF.md, báo cáo này.

## Kiểm
- `npm run build`: qua. `grep ZodError client/dist`: 0 file.
- `npm test`: 1088 test qua, 0 skip, 0 fail (113 scripts + 78 + 743 client + 154). Ít hơn 1091 của 8C vì 8D bỏ 22 test của tính năng đã gỡ (giờ xuất phát, thời gian chính thức, T+, bù giờ, huy hiệu trạng thái) và thêm 19.
- HUD "THỜI GIAN": không còn (grep mã nguồn + hud-check điều kiện "no team time anywhere" + ảnh p5-hud / p7-pit).
- `scripts/hud-check.ts` (HUD_CHECK_PORT=5391): 100 ok, 0 FAIL, không lỗi console (gồm §17.21 không sao chép, §17.22/23 thẻ về đích).
- `npm run ride-check`: qua (đi bộ 4,0 m/s, xe 5,2 m/s, tỉ lệ 1,3; nghiêng 15,6°; ≈ 11 lệnh vẽ người + xe).
- `npm run sim -- --leg louvre --bots 3 --speedup 2`: 3 / 3 về đích, bị loại 1 (đội về cuối, đúng luật §17.22); ≈ 35.638 request / 20 đội × 2 giờ (< 40 000); 37 dòng ghi / đội.
- Ảnh (SCREENSHOT_PORT=5391, đã xem): p7-finish ("Về đích thứ 2", lời NPC), p7-finish-out (thẻ đỏ "BỊ LOẠI 5/5"), p7-pit (đếm ngược + PHẠT, không THỜI GIAN), p7-card, p5-hud (chỉ phố / quận), p7-host + p8-host (bảng "Thứ tự vào game", cột Hạng / Phạt / Về đích, không giờ xuất phát / Chính thức / Bù giờ).

## Chặng thật (ngoài repo)
- Đã điền `pit_stop.announce` (npc / toast / card, first.npc, out.npc/toast/card) nguyên văn "Cập nhật lần 10 / 10b / 10c" vào chặng nháp ngoài repo; `leg:check` hợp lệ, 8 cảnh báo (3 là emoji trong chữ người dùng), 6 ô còn trống. Chi tiết trong báo cáo nhập chặng ngoài repo.

## Còn lại
- Kiểm tay (TODO.md Phase 8D): 2–3 trình duyệt + Host tới đích; bôi đen / chuột phải trên Firefox, Safari.
- Mặc định chờ người dùng xác nhận (TODO.md Phase 8D).
