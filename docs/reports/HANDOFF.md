# Bàn giao phiên (cập nhật 2026-10-01, sau Phase 6) – đọc file này đầu tiên khi mở lại

Mục đích: phiên mới không phải đọc lại hội thoại cũ. Đọc file này + `CLAUDE.md` + `TODO.md` là đủ; chỉ mở SPEC / kế hoạch phase khi cần.

## Trạng thái
| Phase | Trạng thái |
|---|---|
| 0–2B, 3, 4, 4B, 5 | Xong (xem `git log`) |
| 6 Server & presence | **Xong** (commit `feat(phase6)` trên main): Worker + RaceRoom, login mã đội, người chơi khác, xe chung, hộp mật thư trong 150 m, Host tối giản, bot `sim`; kiểm 8 kịch bản end-to-end thật |
| 7 Race engine lõi | **Chưa làm — DỪNG chờ người dùng bảo** |
| 8–12 | Chưa làm |

## Việc tiếp theo: Phase 7 (chỉ khi người dùng nói tiếp tục)
Đọc `TODO.md` mục Phase 7, SPEC §8, §10, §13.8, §17.9–17.12. Điều kiện đầu vào đã chốt: điểm bắt đầu chặng = cầu Bir-Hakeim (lấy từ file chặng); các đội tới lần lượt; đồng hồ đội tính từ lúc nhận mật thư ngoài game (Host nhập giờ bắt đầu từng đội); hộp mật thư bước N+1 chỉ hiện khi bước N hoàn thành và tọa độ chỉ gửi khi vào 150 m. Nội dung chặng thật CHƯA có (SPEC §17.9): dùng chặng demo + bản test. Workflow: kế hoạch + nền (Fable/Opus) → track song song trong worktree → verify đối kháng → merge → 2 reviewer + e2e client/server thật → sửa → docs → commit (đã dùng cho Phase 6 bằng công cụ Workflow).

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
