# Bàn giao phiên (cập nhật 2026-10-03, Phase 8B XONG, 8C đồ họa đã ghép – đang review, 8D đợt việc nhỏ đã ghép; Phase 10 sắp bắt đầu) – đọc file này đầu tiên khi mở lại

Mục đích: phiên mới không phải đọc lại hội thoại cũ. Đọc file này + `CLAUDE.md` + `TODO.md` là đủ; chỉ mở SPEC / kế hoạch phase khi cần.

## Trạng thái
| Phase | Trạng thái |
|---|---|
| 0–2B, 3, 4, 4B, 5, 6 | Xong (xem `git log`) |
| 7 Race engine lõi | **Xong** (commit `feat(phase7)` trên main): schema chặng + `leg:check` + `docs/LEG_FORMAT.md`, máy trạng thái từng đội, hộp mật thư, Sổ mật thư, Chặng dừng, xếp hạng, đồng hồ đội (đã bỏ ở 8D), anti-teleport, trang Host, bot `sim --leg`; 3 vòng review + e2e client/server thật |
| 8 Thử thách & Lựa chọn kép | **Xong** (commit `feat(phase8)`): gõ đáp án trong game, Host duyệt / phạt (đếm ngược), Lựa chọn kép theo hòm nhánh + đổi nhánh 10 phút, hình mật thư R2, cảnh báo kẹt 45 phút trên trang Host, `leg:check` luật mới, `sim` có Host bot. Kế hoạch `docs/plans/phase8.md`, ghép `docs/reports/phase8-integration.md`, kiểm track `docs/reports/phase8-verify-*.md` |
| 8B Phòng Louvre (Thử thách 3) | **Xong** (commit `feat(phase8b)`; cổng cuối `docs/reports/phase8b-gate.md`): phòng kín dưới hòm Lộ trình (F vào / ra), 23 tác phẩm `art-NN` thật trong `client/public/art/` (7,27 MB, không metadata), nút chọn / chốt do máy chủ chấm, phạt 3 phút (hết phạt chốt lại được không cần thẻ mới), gợi ý phút 40 / 70 (toast + thẻ rút gọn), feed công khai (không lặp sau nối lại / DO thức), "Ghi nguồn" sau đích, Host ô + "Cho qua", `leg:check` bảng 23 tác phẩm + quét metadata ảnh / GLB, `process-assets louvre`, `sim --leg louvre`. Kế hoạch `docs/plans/phase8b.md`, ghép `docs/reports/phase8b-integration.md`, review `phase8b-review-*.md`, sửa `phase8b-fix-f1/f2.md`. Bảng tên gốc → art-NN + `credits-snippet.json` chỉ ở `.cache/assets-louvre-run/` (ngoài repo) |
| 8C Đồ họa | **Đã ghép, đang review** (merge T0 → T3 → T1 → T2 + `fix(phase8c): ghép …` trên main; CHƯA có commit `feat(phase8c)`): bầu trời HDRI + sương / ánh sáng môi trường, Seine hai lớp, hậu kỳ bloom + SMAA, mục "Chất lượng đồ họa" (Esc → Cài đặt), cây platane 3 LOD, đồ đường phố Paris, Ngọn lửa Tự do (landmark duy nhất được nâng cấp), ngói mái + nhựa đường PBR. Kế hoạch `docs/plans/phase8c-graphics.md`, báo cáo `phase8c-{foundation,track-t1,track-t2,track-t3,integration}.md`; ảnh trước `screenshots/before-8c/` (không commit) |
| 8D Đợt việc nhỏ (SPEC §17.21–17.23) | **Đã ghép** (merge `phase8d-small` + `fix(phase8d): ghép …`; báo cáo `phase8d-small.md`, `phase8d-integration.md`): không bôi đen / sao chép chữ mật thư (mã bài nộp vẫn Copy), thứ hạng = thứ tự về đích thực (cố định lúc check-in), thông báo "Về đích thứ n" / "BỊ LOẠI" (đội về cuối khi ≥ 2 đội, đội chưa về khi Host "Kết thúc"), chữ trong file chặng `pit_stop.announce` (`{n}` `{tổng}` `{tên đội}`), bỏ đồng hồ đội + huy hiệu trạng thái + ô giờ xuất phát + "thời gian chính thức", giao thức v5. Chữ về đích THẬT đã điền vào chặng nháp ngoài repo (`~/Documents/chang-that/`) |
| 10 | **Sắp bắt đầu** (kế hoạch `docs/plans/phase10.md`, phạm vi SPEC §17.24) |
| 11 | Chưa làm (Phase 9 bỏ: SPEC §17.18). **Dừng trước Phase 12** (cần tài khoản Cloudflare của người dùng) |

## Việc tiếp theo
1. **Người dùng nhập chặng thật** (lộ trình + thử thách) theo `docs/LEG_FORMAT.md` hoặc gửi cho tôi; LT2 đã nhận (xem memory `leg-content-draft`, điểm Palais de Tokyo dùng sân trước 48.86470, 2.29690). Đừng tự bịa nội dung chặng thật.
2. Phase 8 + 8B XONG, 8C đã ghép (đang review: 2 reviewer spec+code ∥ visual, rồi `feat(phase8c)`; việc còn ở TODO.md Phase 8C), 8D đã ghép (kiểm tay còn lại + mặc định chờ xác nhận: TODO.md Phase 8D). Kế: Phase 10, Phase 11 sim toàn trình, dừng trước Phase 12. **Việc người dùng:** dán `credits-snippet.json` + 5 mã đáp án vào chặng thật (TODO.md Phase 8B); viết chữ giới thiệu Thử thách 3 (`title` / `description` của bước Louvre), đáp án tham khảo Thử thách 1, chữ thẻ Lộ trình 6; chạy `npm run leg:check -- <chặng thật>`.
3. Workflow đã dùng cho Phase 6–7 (công cụ Workflow): kế hoạch + nền (Opus) → critic → track song song trong worktree → verifier đối kháng → merge → review (spec/code ∥ visual ∥ e2e thật) → skeptic → sửa → vòng 2 (kiểm lại bản sửa + critic độ đầy đủ + thử người tổ chức) → vòng 3 → dọn → cổng cuối.

## Quy tắc làm việc đã chốt (xem thêm memory `~/.claude/projects/-Users-nguyencuongthinh-Documents-cuoc-dua-paris/memory/`)
- Workflow mỗi phase: kế hoạch + nền (Opus; Fable cho thiết kế giao thức/server) → các track song song trong worktree (Sonnet cho việc cơ học spec rõ, Opus cho logic khó/ghép) → 2 reviewer Opus song song (spec+code ∥ visual) → chỉ sửa lỗi người chơi/đội đua thấy trực tiếp (tiết kiệm token) → chụp lại mọi preset → docs → commit → dọn worktree.
- Mọi agent ghi báo cáo vào `docs/reports/` sớm và cập nhật dần (mất phiên không phải review lại).
- Không sửa `docs/SPEC.md` ngoài điều phối viên; chỉ ghi quyết định của người dùng vào §17.
- `ride-check` mặc định bỏ phần bơi (người chơi không bơi); `RIDE_ONLY=3` chạy riêng.
- Máy tải nặng làm preset / ride-check chập chờn: chạy lại riêng lẻ khi nghi.

## Quyết định người dùng gần đây (đã vào SPEC §17.10–17.11)
- Hộp mật thư bước N+1 chỉ hiện khi bước N hoàn thành; server chỉ gửi tọa độ hộp hiện tại khi đội vào **150 m** (`boxReveal.radius`), client không có tọa độ trước đó.
- Rocketbox cho người đi đường NPC (4 avatar); đạp xe tông người → người chơi ngã xe; Étoile xe vào nhường xe trên vòng; khán giả luôn có NPC (`?npc=0` tắt).

## Việc người dùng cần làm / còn treo
- Nội dung chặng thật (điểm lộ trình, thử thách, mật thư) chưa gửi (SPEC §17.9): cần trước Phase 7; hoặc nhập qua Host ở Phase 10.
- Thử tay trên trình duyệt thật: phím `M` / `Esc` + khóa chuột, kéo / cuộn / bấm bản đồ lớn (Chrome + Firefox / Safari).
- Phase 12 cần tài khoản Cloudflare: secret `HOST_PASSWORD`, bucket R2, deploy.
- Ghi nhớ: repo CHƯA có remote git; commit chỉ nằm trên máy này (đề xuất tạo repo GitHub + push khi tiện).
