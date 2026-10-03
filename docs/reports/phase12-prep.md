# Phase 12 – chuẩn bị triển khai (2026-10-03)

Phạm vi: KHÔNG deploy thật, không gọi Cloudflare API, không tạo bucket / secret. Chỉ viết tài liệu, thêm lệnh, kiểm bundle.

## Việc 1 – "Phòng Louvre: chốt đúng 11" cho 8 đội

Kết luận: **không phải lỗi máy chủ**, chỉ sim đếm sai chỗ.

- `legStats()` trong `scripts/sim.ts` đếm `n('correct')` trên `host.state.progress` (= bảng `step_progress`, mọi bước) – trạng thái `correct` dùng chung cho (a) chốt đúng phòng Louvre (`steps.ts` lock: đúng 1 bản ghi `AnswerRec` mỗi lần chốt) và (b) đáp án gõ tay được máy chủ tự chấm (`verifyAuto`, nhánh A của Lựa chọn kép trong `full.json`). 11 = 8 chốt đúng + 3 đáp án nhánh A tự chấm.
- Máy chủ chỉ ghi 1 dòng `correct` mỗi lần chốt: test tích hợp `sim --leg louvre` (3 bot) nay khẳng định `louvreCorrect === 3`. Ma trận Host, xuất dữ liệu, xếp hạng đều theo từng bước nên không bị gộp – không có gì người chơi / Host nhìn thấy bị sai.
- Sửa sim: `LegStats` thêm `louvreWrong` / `louvreCorrect` (chỉ các bước louvre); dòng in "Phòng Louvre: chốt sai n, chốt đúng n (+ k đáp án gõ tay tự chấm đúng ở bước khác)". Commit `fix(phase11)`.

## Việc 2 – DEPLOY.md + kiểm bundle

- `docs/DEPLOY.md` (mới, tiếng Việt): §1 cần gì (tài khoản Free, bật Workers + R2, Node ≥ 22.13, `npm install`, `npx wrangler login`); §2 `worker/wrangler.toml` nguyên văn (binding `ASSETS` / `RACE_ROOM` / `MEDIA`, bucket `cuoc-dua-paris-media`), lệnh tạo bucket + `wrangler secret put HOST_PASSWORD`; §3 `npm run deploy`; §4 trang Host sau deploy (mã cuộc đua, nạp chặng từ file ngoài repo, Hình mật thư R2, Tạo đội & sinh mã 6 ký tự, link `/?race=<mã>`, hành lang xe, Mở cuộc đua → Kết thúc → Xuất dữ liệu); §5 checklist trước ngày đua (FPS F3 + Esc → Cài đặt → Chất lượng đồ họa, 2 trình duyệt, Hoàn tác, Phạt, Cho qua, mất mạng, xuất CSV, mã mới cho ngày thật); §6 hạn mức Free + số đo Phase 11 (8 đội ≈ 13 800 / 16 000 request, ≈ 2 800 / 8 000 dòng) + cách đọc "Hạn mức Cloudflare (ước tính)"; §7 sự cố + xóa dữ liệu cũ (dùng mã mới; `wrangler r2 object delete`; `wrangler delete` xóa hết); §8 những gì không lên Cloudflare.
- Lệnh `npm run deploy` (root: `npm run build && npm run deploy -w worker`; worker: `wrangler deploy`). KHÔNG chạy.
- Dry-run: `npm run build` qua (wrangler 4.141: Worker 978 KiB / gzip 178 KiB, 445 file tĩnh). File tĩnh lớn nhất: `textures/sky_2k.hdr` 6,1 MB, `assets/main-*.js` 5,2 MB (≤ 25 MB). `client/dist` 62 MB tổng, `worker/dist/index.js` 2,8 MB (có source map).
- Kiểm rò: grep `chang-that` / `referenceAnswers` / `"answers"` trong `client/dist` → 0 kết quả; bundle Worker không chứa `chang-that`, chỉ các chặng demo / test (GIẢ) import từ `worker/legs/` (server-only, đúng thiết kế).
- README (bảng phase 11 / 12 + mục Deploy), TODO Phase 12 ("chuẩn bị xong, chờ tài khoản"), HANDOFF, CLAUDE.md (`npm run deploy`, DEPLOY.md) đã cập nhật.

## Việc người dùng phải làm
1. Tạo tài khoản Cloudflare Free, bật Workers (tên miền phụ `*.workers.dev`) + R2; `npx wrangler login`.
2. DEPLOY.md §2: tạo bucket `cuoc-dua-paris-media`, đặt secret `HOST_PASSWORD`.
3. `npm run deploy`; mở `/host.html`, làm §4; chạy checklist §5 với mã diễn tập; ghi số đo thật vào TODO Phase 12.
