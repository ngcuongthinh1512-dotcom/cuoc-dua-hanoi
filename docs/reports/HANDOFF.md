# Bàn giao phiên (cập nhật 2026-10-01, sau Phase 6) – đọc file này đầu tiên khi mở lại

Mục đích: phiên mới không phải đọc lại hội thoại cũ. Đọc file này + `CLAUDE.md` + `TODO.md` là đủ; chỉ mở SPEC / kế hoạch phase khi cần.

## Trạng thái
| Phase | Trạng thái |
|---|---|
| 0–2B, 3, 4, 4B, 5, 6 | Xong (xem `git log`) |
| 7 Race engine lõi | **Xong** (commit `feat(phase7)` trên main): schema chặng + `leg:check` + `docs/LEG_FORMAT.md`, máy trạng thái từng đội, hộp mật thư, Sổ mật thư, Chặng dừng, xếp hạng, đồng hồ đội, anti-teleport, trang Host, bot `sim --leg`; 3 vòng review + e2e client/server thật |
| 8 Thử thách (mini-game, kiểm đáp án, Host duyệt) | **Chưa làm — DỪNG chờ người dùng bảo** |
| 9–12 | Chưa làm |

## Việc tiếp theo
1. **Người dùng nhập chặng thật** (lộ trình + thử thách) theo `docs/LEG_FORMAT.md` hoặc gửi cho tôi; LT2 đã nhận (xem memory `leg-content-draft`, điểm Palais de Tokyo dùng sân trước 48.86470, 2.29690). Đừng tự bịa nội dung chặng thật.
2. Phase 8 chỉ khi người dùng nói tiếp tục: đọc `TODO.md` mục Phase 7 + 8, SPEC §8.4–8.9, §11 (thư viện thử thách), §17.9–17.13. Điều kiện đã chốt: không Vượt rào; nhiệm vụ Phase 7 đang là "Hoàn thành (tạm)"; Phase 8 chỉ thay `verifyTask` và thêm op, không đổi schema chặng hay `step_progress`.
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
