# Bảng gợi ý nhỏ ghim cố định trong phòng Louvre (SPEC §17.36, 2026-10-03)

Yêu cầu: "cửa sổ gợi ý nên được ghim cố định trên màn hình luôn, nhưng nhỏ thôi để không bị che mất các hình tranh và tượng".

## Làm gì
- `client/src/race/ui/format.ts` `hintPanel(card, now)` (thuần, test trong `format.test.ts`): 3 dòng từ `card.task.louvre`: ① "Đáp án gồm 5 tác phẩm" / "① sau mm:ss" (đếm ngược tới `hintAt[0]` máy chủ), ② "Đúng x/5" / "② sau mm:ss" (tới `hintAt[1]`), "Đang chọn k/5" (trước gợi ý 1: "Đang chọn k"). Không ghi cứng 40 / 60, không tên tác phẩm. `null` khi bước xong / thẻ không phải phòng.
- `RaceHud.ts`: `hintEl` (`.rc-hints hud-box`, ≈ 200 × 80 px, chữ 12,5 px) trong cột trên trái `.rc-tl` giữa thẻ rút gọn và "Tại điểm này"; vẽ lại chỉ khi chữ đổi (`drawHints`). Hiện khi thẻ hiện tại là thẻ phòng Louvre và không mở thẻ đầy đủ / Sổ / thẻ về đích, đội chưa về đích / BỊ LOẠI / cuộc đua chưa kết thúc; bay tự do → `hud-off` ẩn như mọi `.hud-box`. **Trong phòng thẻ rút gọn ẩn, bảng đứng thay** (che ít nhất; mật thư đọc lại bằng Enter). Ngoài phòng: thẻ rút gọn + bảng ngay dưới; dòng "Chọn k/5 · Đúng x/5" của thẻ rút gọn bỏ vì trùng (dòng "Phạt: còn …" giữ).
- `race.css` `.rc-hints`; preset `p8b-room` (hai gợi ý đã nhận) + `p8b-room-hint` (gợi ý 2 đang đếm ngược, thẻ demo `louvre-hint1` của orchestrator); sửa 2 chú thích "70" → 60 (RaceHud.ts, screenshot.ts).
- Docs: LEG_FORMAT.md §7.5 một câu, CLAUDE.md dòng race/ui + preset, TODO Phase 8B, SPEC §17.36. Không nhắc trong RACE_RULES.md (§17.27).

## Kiểm
- Vitest `client/src/race/ui/*.test.ts` + `LouvreRoom.test.ts`: 92/92; `npm run build` (tsc + Vite + wrangler dry-run): qua.
- Ảnh `screenshots/p8b-room.png` (① Đáp án gồm 5 · ② Đúng 2/5 · Đang chọn 3/5) và `screenshots/p8b-room-hint.png` (② sau 20:00 · Đang chọn 4/5): bảng ≈ 200 × 85 px ở góc trên trái, nằm trên dải trần / tường trống, không che tranh, tượng, nút hay vòng tương tác; thẻ rút gọn 330 px không còn trong phòng.

## Chưa làm / cần anh
- Xem trên máy thật cỡ chữ 12,5 px / rộng 200 px ở 1080p; muốn giữ thẻ rút gọn trong phòng thay vì thay thế: một dòng `this.compact.hidden = this.inRoom && hints != null` trong `RaceHud.update`.
