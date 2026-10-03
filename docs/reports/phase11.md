# Phase 11 – Test toàn trình + đo hạn mức (8 đội)

Quyết định người dùng 2026-10-03: đo cho TỐI ĐA 8 đội (không phải 20), rút ngắn thời gian đo. Mọi số đo bằng bot (`npm run sim`) trên máy chủ tạm trong máy (wrangler `createTestHarness`: workerd + Durable Object + SQLite thật), chưa phải Cloudflare thật (Phase 12 đo lại).

## Đã làm
1. `scripts/sim.ts`
   - `fastPenalties`: bước phòng Louvre có `task.retryLockMinutes` riêng cũng rút còn 6 s (trước chỉ rút `penalties` của chặng).
   - `--louvre-right-only`: bot chốt đúng 5 mã ngay (không chốt sai, không chờ phạt).
   - `--teams N` (mặc định 8): dòng `N đội × 2 giờ` nội suy từ cửa sổ ngắn (request WebSocket + dòng vị trí / replay chung theo thời gian × đội; đăng nhập 1 lần / đội; dòng dữ liệu đua 1 lần / đội / chặng) và so với ngưỡng SPEC §3 tính theo tỉ lệ (8 đội: < 16 000 request, < 8 000 dòng). Vượt → `← VƯỢT NGÂN SÁCH`, thoát 1.
   - `--full` (≥ 6 bot): Host bot thêm Hoàn tác một Duyệt trong 10 s (bot 4, thử thách đầu) rồi duyệt lại; Xóa cờ đỏ đầu tiên; "Cho qua" bot 5 ở thử thách đầu (bot không trả lời); bot cuối dừng cách thảm r + 15 m (đứng lên thảm = check-in tự động) → khi 7 đội kia về đích Host gửi `host.race finish` → đội đó BỊ LOẠI. Sau mỗi lần chạy `--leg`: GET export JSON + CSV bằng token Host, kiểm đủ đội, `finalRank` đủ / không trùng, không có `ip` trong events, CSV có BOM + cột "Hạng cuối". Mọi kịch bản tự kiểm (`scenarioFailed`, `legFailed`, thoát 1).
2. Chặng test `worker/legs/test/full.json` (GIẢ, không bundle, nạp bằng `--leg full`): mini + hòm Louvre ở bãi cỏ Champ de Mars + T3 phòng Louvre → 8 bước: route, thử thách Host duyệt (teaser), route đi bộ, Lựa chọn kép (A tự chấm / B ảnh), route Louvre, phòng Louvre, route, Chặng dừng. `leg:check`: hợp lệ, 0 cảnh báo.
3. Test mới `scripts/sim.test.ts`: `--full` 6 bot trên chặng mini nén (Hoàn tác 1, Cho qua 1, Xóa cờ ≥ 1, Kết thúc → out, export ok, ngân sách 8 đội đạt).

## Kết quả đo (8 bot, chặng `full`, speedup 2, `--full`)
Lần 1 (21,1 phút mô phỏng ≈ 10,5 phút thật; 8 bot đi liên tục = xấu nhất):
- wsIn 48 587 · http 17 · alarm 1 · dòng SQLite 1 151 (365 dòng vị trí + replay chung, 89,9 dòng / đội cho 8 bước; ngân sách ≤ 160).
- Request tính phí ≈ 2 448 = 14,5 / bot / phút.
- **8 đội × 2 giờ ≈ 13 817 request (ngưỡng < 16 000, biên 14 %) · ≈ 2 791 dòng SQLite (ngưỡng < 8 000) → ĐẠT.** (20 đội: ≈ 34 500 / 40 000, như Phase 6–7 ước tính.)
- Kịch bản: Host duyệt 13, phạt 1, tự chấm sai 8 (Louvre chốt sai 8), đổi nhánh 1, Hoàn tác 1, Cho qua 1, cờ đỏ 29 lần (tua nhanh), Xóa cờ 1; export 8 đội / 64 dòng bước / 235 sự kiện, không IP.
- Lỗi lần 1: đội "dang dở" vẫn về đích vì đứng lên thảm là check-in tự động (`steps.ts settle`) → sim sửa: bot dừng cách thảm r + 15 m. Lần 2: xem bên dưới.

Lần 2 (sau sửa; `exit 0`): wsIn 48 464 · dòng SQLite 1 145 (367 chung, 88,9 / đội) · **8 đội × 2 giờ ≈ 13 781 request · ≈ 2 794 dòng → ĐẠT** · 7 / 8 về đích, 1 BỊ LOẠI khi Host Kết thúc · Hoàn tác 1 · Cho qua 1 · Xóa cờ 1 · export 8 đội / 63 dòng bước / 232 sự kiện.

## Kịch bản đã phủ (một lần chạy `npm run sim -- --leg full --bots 8 --speedup 2 --full`)
8 đội vào game, mở hòm theo thứ tự, "Nhận thử thách" + gõ đáp án → Host duyệt (13) / phạt 1 lần (bot 2, chờ đếm ngược rồi gõ lại) / Hoàn tác 1 Duyệt trong 10 s rồi duyệt lại (bot 4) / Cho qua (bot 5); Lựa chọn kép: nhánh A tự chấm, nhánh B ảnh ("đã gửi bài" → Host duyệt), 1 đội đổi nhánh (bot 3); phòng Louvre: 8 chốt sai → phạt 6 s → 8 chốt đúng, feed công khai ≥ 16 tin / bot; cờ đỏ vượt tốc (tua nhanh) + Xóa cờ; 7 đội check-in, đội cuối đứng ngoài thảm → Host Kết thúc → BỊ LOẠI (hạng cuối trong export); export CSV (BOM, cột "Hạng cuối") + JSON (không IP, `finalRank` đủ 8). Lặp lại trong test (`scripts/sim.test.ts`, 6 bot, chặng nén) nên `npm test` kiểm luôn.

## Việc còn mở
- Đo trên Cloudflare thật (Phase 12): bộ đếm Host hụt 15–20 % (TODO Phase 6); biên request cho 8 đội là 14 % khi bot đi liên tục 2 giờ — đội thật đứng lại nhiều (chỉ gửi khi đổi vị trí) nên thấp hơn.
- "Chốt đúng 11" ở dòng Phòng Louvre = 8 chốt đúng + 3 đáp án nhánh A tự chấm (cùng trạng thái `correct`); đã đổi chữ dòng in, không phải lỗi.
- Không làm: `specials.json` (thẻ đặc biệt hoãn, SPEC §17.18); model trụ cầu Alexandre III (TODO Phase 2) để Phase 12; mọi mục "kiểm tay trên máy thật" của 8C / 8D / 10 vẫn là việc của người dùng.
