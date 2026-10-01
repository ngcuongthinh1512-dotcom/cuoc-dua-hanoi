# Bàn giao phiên (cập nhật 2026-10-01) – đọc file này đầu tiên khi mở lại

Mục đích: phiên mới không phải đọc lại hội thoại cũ. Đọc file này + `CLAUDE.md` + `TODO.md` là đủ; chỉ mở SPEC / kế hoạch phase khi cần.

## Trạng thái
| Phase | Trạng thái | Commit |
|---|---|---|
| 0–2B | Xong | — |
| 3 Nhân vật | Xong | — |
| 4 Di chuyển + dọn | Xong | `2a898a3`, `bcbb452` |
| 4B NPC xe + người | Xong | `3caa004` |
| 5 HUD (minimap, bản đồ lớn, GPS, menu) | Xong | `5b4a7c4` |
| 6 Server & presence | **Đang làm**: kế hoạch + nền xong (`e87a129`, SPEC `25d2543`); 4 track chạy trong worktree, đã checkpoint WIP khi tạm dừng | main @ `25d2543` + nhánh worktree |
| 7–12 | Chưa làm | — |

## Phase 6 – đang dở
Kế hoạch: `docs/plans/phase6.md` (21 quyết định, 4 track, ngân sách quota); báo cáo kế hoạch: `docs/reports/phase6-plan.md`. Chạy 9 câu hỏi mở theo MẶC ĐỊNH (người dùng chưa phản đối): 1 DO / cuộc đua tên theo `?race=` (mặc định `paris`), `pos` 5 Hz một mẫu / tin, Host tối giản, speed check chỉ đánh dấu, token 24 h, dev bằng Vite proxy, test DO bằng `createTestHarness` (wrangler 4.141; `@cloudflare/vitest-pool-workers` không tương thích Vitest 5; không cài package mới).

Track (mỗi track một git worktree trong `.claude/worktrees/`, nhánh `worktree-agent-<id>`):
| Track | Việc | Model | Worktree id |
|---|---|---|---|
| A | Worker + Durable Object `RaceRoom` | Opus | `a8a436f546bdaf2c2` |
| B | Client: login, NetClient, người chơi khác, ghép | Opus | `a40c6c1edddf251c7` |
| C | Xe chung: VehicleSpawner, nhận xe nguyên tử, xe bị bỏ | Opus | `a4d558ab8013a9a12` |
| D | Dev tooling, Host tối giản, bot `npm run sim` | Sonnet | `a2011538fa3ba174b` |

Mỗi track có `docs/reports/phase6-track-<x>.md` TRONG worktree của nó (WIP đã commit khi tạm dừng): đọc file đó để biết đã làm gì, còn gì. Worktree `agent-a1a48256a535b7a81` (Phase 4B, F3) bị khóa, đã merge từ lâu, cứ để.

### Cách tiếp tục (rẻ nhất)
1. `git worktree list` + `git log --oneline -3` trong từng worktree; đọc 4 báo cáo track.
2. Track chưa xong: mở agent mới (cùng model) với prompt "tiếp tục track X trong worktree <đường dẫn>, đọc báo cáo `docs/reports/phase6-track-x.md`, làm nốt phần còn lại, commit", KHÔNG làm lại từ đầu.
3. Khi cả 4 xong: merge A → B → C → D vào `main` (conflict dự kiến chỉ ở `config.ts` / `screenshot.ts` / `main.ts`), `npm run build && npm test`, `ride-check`, rồi 2 reviewer Opus (spec+code ∥ visual/UX) tự ghi báo cáo vào `docs/reports/phase6-review*.md`, sửa lỗi người chơi thấy trực tiếp, chụp lại preset, cập nhật TODO/CLAUDE.md, commit `feat(phase6): …`, dọn worktree.
4. Sau Phase 6 DỪNG, chờ người dùng bảo tiếp (Phase 7 race engine).

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
