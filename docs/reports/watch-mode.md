# Đội về đích vẫn điều khiển + chế độ xem (khán giả / Host / đội đã về đích) — báo cáo

Ngày 2026-10-04. Yêu cầu: (1) đội đã về đích / BỊ LOẠI / sau "Kết thúc" vẫn điều khiển nhân vật và gửi vị trí (bỏ "khán giả bay tự do vĩnh viễn" D19); (2) một CHẾ ĐỘ XEM chung (thanh chuyển đội + camera bám) cho khán giả (mã "K"+5), Host (đăng nhập game) và đội đã về đích (phím `X`). Thiết kế: `docs/reports/spectator-mode.md`. SPEC §17.39 + §17.40.

## Trạng thái
- [ ] (1) Client: bỏ `spectating` / `spectateAt`; đội xong vẫn có thân, camera thường, gửi vị trí; `X` bật / tắt chế độ xem; hint "Phím X"
- [ ] (2) Máy chủ: mã khán giả `meta.spectatorCode`, vai trò `spectator` (token `s:<mã>`), 50 khán giả, `host.spectator rotate`, `watch on/off`, tick toàn bộ đội cho khán giả / Host / đội xong đang xem, `TeamInfo.racing` + tin `team` khi đổi
- [ ] (2) Client: `spectate/` (thanh ◀ ● Đội ▶ · Bay tự do, camera bám `followPose`, chữ "đang trong phòng bảo tàng"), Login nhận mã khán giả, Host một dòng "Mã khán giả"
- [ ] Test ngắn + `npm run build`
- [ ] Ảnh `screenshots/p9-watch.png`
- [ ] Docs: DEPLOY §4, RACE_RULES Chặng dừng, README, CLAUDE.md, TODO, SPEC §17.39–17.40

## Quyết định
- (điền dần)

## Giới hạn
- (điền khi xong)
