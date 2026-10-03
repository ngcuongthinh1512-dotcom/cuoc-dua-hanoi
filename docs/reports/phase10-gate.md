# Phase 10 – Cổng cuối (sau khi ghép đồ họa 8C)

Ngày 2026-10-03, main sau `feat(phase8c)`. Phase 10 đã ghép (track S → H → C, `fix(phase10): ghép …`, `fix(phase10): sửa sau review …` d9ea012); đây là kiểm lại các mục sửa trong `phase10-fix.md` + vài kịch bản e2e ngắn trên máy chủ thật để chắc đồ họa 8C không phá trang Host / luồng đội. Không đọc `~/Documents/chang-that/`, không sửa `docs/SPEC.md`.

**Kết luận: ĐẠT** – commit `feat(phase10)`.

## Các mục sửa (`phase10-fix.md`) – kiểm lại trên mã + test
| Mục | Kiểm | Kết quả |
|---|---|---|
| (1) `undoKept` bỏ, Hoàn tác chỉ cắt theo `NET.undoMs` | `grep -rn undoKept` (mã + docs ngoài reports) = 0; `NET.undoMs` 10 000 (`shared/src/protocol/constants.ts`); `engine.test.ts` "6 Duyệt of 6 teams within 10 s", `RaceRoom.phase10.test.ts` | đạt |
| (2) Cho qua ở teaser | `steps.ts review()`: Cho qua chạy cả khi đội chưa "Nhận thử thách", `task_started_at = now` nếu chưa có; `steps.test.ts` V5 | đạt |
| (3) Bảng xuất: hạng về đích trống + `finalRank` | `export.ts` TEAM_COLS có "Hạng cuối (kể cả bị loại)", `rank: finishAt === null ? null : rank`; `export.test.ts` | đạt; CSV thật (e2e dưới) có cột này |
| (4) `restoreWhere` sau ngủ đông | `engine.ts` 708: dựng `where` một lần từ vị trí tin cậy của đội online (+ đội vừa đóng socket), gọi từ `moveZone` / rời socket; `engine.test.ts` "Tại điểm này after an eviction / hibernation" | đạt |
| (5) Ma trận theo khung chờ duyệt | `host.css` `.matrix-wrap { max-height: max(200px, min(72vh, calc(100vh − var(--queue-h) − 24px))) }`, `main.ts` 108 `ResizeObserver` đặt `--queue-h`; `hostView.test.ts` | đạt |
| (6) Tài liệu | README / RACE_RULES / TODO Phase 10 (ponytail: `where` chỉ trong bộ nhớ, M4, Hoàn tác Phạt không kêu lại) | đạt; TODO / README / HANDOFF đổi "đang review" → Xong ở cổng này |
| (7) `exportErrorText(403)` nhánh chết | bỏ (Worker trả 401) | đạt |

`npm test` (gốc, sau ghép 8C): 1 148 qua (worker 177 gồm `RaceRoom.phase10.test.ts` qua workerd thật: Hoàn tác / xóa cờ / vừa rời đi / export).

## E2E máy chủ thật (wrangler dev :8821 phục vụ `client/dist` sau 8C, Chrome headless SwiftShader, sim bot `--url`)
Kịch bản (script Playwright trong scratchpad phiên, không commit): `sim --url --leg louvre --bots 2 --speedup 2 --race gate10d`; trang Host `/host.html?race=gate10d` đăng nhập bằng mật khẩu `.dev.vars`.

| Kịch bản | Kết quả |
|---|---|
| Đăng nhập Host → nút "Xuất dữ liệu thời gian" hiện | ok |
| **Cho qua → Hoàn tác**: bấm "Cho qua" ở ô Thử thách 3 của Bot 1 ("chọn 3/23", confirm nhận) → thanh "Hoàn tác (còn 10 s)" hiện → bấm | thanh trống (0 nút), hai nút "Cho qua" trở lại (đội về lại bước Louvre), 0 lỗi console; sim sau đó vẫn 2 / 2 về đích |
| **Xóa cờ**: bot tua nhanh bị cờ "Vượt tốc · lúc …" → bấm "Xóa cờ" (confirm nhận) | số nút Xóa cờ 2 → 1 (cờ gắn lại sau khi bot tiếp tục vượt tốc – đúng tài liệu "nếu đội còn vi phạm, cờ sẽ gắn lại") |
| **Xuất dữ liệu thời gian** | 2 tệp tải về `race-gate10d-thoi-gian.{csv,json}`: CSV có BOM, cột "Hạng cuối (kể cả bị loại)", không chuỗi "đáp án" / "answer" / "ip"; JSON khóa `race, exportedAt, raceStartAt, teams (2), steps, events`, không `"ip"` / `"answer"` / `"text"` |
| **Đội online + đồ họa 8C Thấp** (race gate10c): `/?race=…&quality=low`, mã đội của Bot 1, "Chào mừng trở lại" → Tiếp tục | `__READY__` đạt, HUD có, `__STATS__` 283 lệnh vẽ / 46 chunk / NPC 29 xe + 13 người, **0 lỗi console**. Ghi chú: đăng nhập cùng mã làm máy chủ đóng socket của bot (4409) → sim của lượt đó dừng – đúng thiết kế một phiên / đội, không phải lỗi |
| Lượt đầu (gate10b) không bấm được "Cho qua" / Hoàn tác trong 240 s | nguyên nhân: bot mất ≈ 12 phút mới tới Thử thách 3; lượt gate10d chờ 15 phút → đạt (662 s) |

Ảnh: `screenshots/gate10/` (không commit): `host-after-undo.png`, `host-final.png`, `team-online-low.png`.

## Còn mở (TODO.md Phase 10)
- Ponytail: "vừa rời đi" chỉ trong bộ nhớ DO; Hoàn tác Phạt không kêu lại hàng chờ; M4 xe đã vào bãi; số giây khóa đổi nhánh đã Hoàn tác vẫn tính.
- Kiểm tay trên trình duyệt thật của người tổ chức (Notification, tải tệp xuất trên Safari / Firefox).
