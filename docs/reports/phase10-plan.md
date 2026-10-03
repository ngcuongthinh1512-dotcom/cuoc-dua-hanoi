# Báo cáo: kế hoạch Phase 10 – công cụ Host (thu hẹp)

Trạng thái: **xong kế hoạch** (2026-10-03), chưa sửa mã. Kế hoạch đầy đủ: `docs/plans/phase10.md`.

## Phạm vi (SPEC §17.24 kể cả dòng "Sửa")
V1 ghim cột "Đội" + hàng tiêu đề, khung "Chờ duyệt" gập được · V2 Hoàn tác 10 s sau Duyệt / Phạt · V3 xóa cờ đỏ (+ lý do, giờ gắn) · V4 "vừa rời đi n phút trước" ở "Tại điểm này" · V5 (thêm rẻ từ TODO / SPEC §13.9) "Cho qua" cho mọi thử thách, không chỉ Louvre.
BỎ: khóa bài nhiều Host (chỉ một Host), soạn chặng trên bản đồ, nhật ký events trên Host, bản đồ Host, xuất CSV.

## Thiết kế tóm tắt
- **Giao thức:** `host.review op:'undo'` (+`id`), `HostState.undo[]` (nút vẽ từ trạng thái máy chủ, sống qua tải lại trang), `host.flag op:'clear'`, `teams[].flagWhy / flagAt`, `ZoneMember.left`, notice `reviewUndone`, `NET.undoMs = 10 s`, `NET.zoneLeftMs = 10 phút`, `PROTOCOL_VERSION + 1`.
- **Hoàn tác (máy chủ):** ảnh chụp các hàng `step_progress` + `teams.state` TRƯỚC quyết định, lưu trong bộ nhớ + `meta 'undo'` (1 dòng / quyết định, dựng lại sau evict). Undo = một transaction khôi phục hàng (ghi lại / DELETE), `teams.state`, event `host.undo` ≈ ≤ 7 dòng; rồi gửi đội `race` view + toast + `box hide` bước kế. Từ chối khi quá 10 s, đội đã về đích, đội đã sang bước khác / có quyết định mới hơn, cuộc đua kết thúc. Hành động của đội trong ≤ 10 s trên bước bị khôi phục thì bỏ; xe đã vào bãi không quay lại.
- **Cờ:** `teams.state` thêm `flagWhy[]` (`speed` / `jump` / `respawn`) + `flagAt`; xóa = event `host.unflag` + 1 hàng team = 3 dòng; máy chủ gắn lại khi có vi phạm mới.
- **Rời đi:** chỉ bộ nhớ DO (`gone` theo key vùng), 0 dòng SQLite, giữ 10 phút, cùng luật ẩn bước sau (§17.10); client tự cập nhật "n phút" mỗi phút và tự ẩn khi quá hạn.
- **Ma trận:** `.matrix-wrap {max-height: 72vh; overflow: auto}` + `thead th {position: sticky; top: 0}` + cột đầu `left: 0` (đã có), ô góc z-index cao hơn; khung Chờ duyệt = `<details open>` (nút "Bật thông báo" ra ngoài summary); dải Hoàn tác đặt ngoài `<details>`.

## Track (sau khi `phase8d-small` và `feat(phase8c)` ghép vào main)
0. Nền (Opus, 1 commit): kiểu + codec + hằng + chữ toast + `demoState`.
1. **S** máy chủ (Opus): `worker/src/race/{engine,steps}.ts`, `worker/src/RaceRoom.ts`, test DO mới `RaceRoom.phase10.test.ts`.
2. **H** trang Host (Sonnet): `client/src/host/*`, `host.css`, preset `p10-*` trong `scripts/screenshot.ts`.
3. **C** client đội (Sonnet): `client/src/race/ui/{format,RaceHud}.ts`, `race.css` (hòm không cần sửa: `ClueBoxes.nextBoxes` đã xử lý `hide`).
Ghép F → S → H → C; e2e thật 2 trình duyệt + Host; 2 reviewer; `feat(phase10)`.

## Tài liệu sẽ cập nhật trong phase
`RACE_RULES.md` (Host rút lại trong 10 s; "vừa rời đi"; cờ), `TODO.md` (xóa dòng Phase 10 cũ, thêm tồn M4 / M6), `HANDOFF.md`, `CLAUDE.md` (host/, worker/, protocol). `LEG_FORMAT.md` không đổi.

## Câu hỏi mở (mặc định đang áp dụng)
10 s hoàn tác; 10 phút "vừa rời đi"; không hoàn tác về đích; bỏ hành động ≤ 10 s của đội thay vì từ chối; V5 "Cho qua" mọi thử thách có làm không.
