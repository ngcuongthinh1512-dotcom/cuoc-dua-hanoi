# Chế độ xem (khán giả + đội đã về đích) — báo cáo

Ngày 2026-10-03. Yêu cầu: KHÔNG phòng khán giả riêng; một CHẾ ĐỘ XEM dùng chung cho khán giả (mã khán giả) và đội đã về đích / sau khi Host Kết thúc: camera bám theo đội đang đua, nút / phím chuyển đội.

## Trạng thái (làm xong 2026-10-04, báo cáo `docs/reports/watch-mode.md`, SPEC §17.39–17.40)
- [x] Máy chủ: mã khán giả (`meta.spectatorCode`, "K" + 5 ký tự), vai trò `spectator` (token `s:<mã>`), welcome thu gọn, tick toàn bộ đội cho khán giả và đội đã xong (`watch on`, chỉ khi đã xong), 50 khán giả, `host.spectator rotate`, `TeamInfo.racing`
- [x] Client: `spectate/` (thanh chuyển đội + camera bám), phím `[` `]` `V` (+ `X` cho đội đã về đích), Login nhận mã khán giả, Host hiển thị mã
- [x] Test ngắn + `npm run build`
- [x] Ảnh `screenshots/p9-watch.png`
- [x] Docs: DEPLOY §4, RACE_RULES Chặng dừng, README, CLAUDE.md, TODO, SPEC §17.39–17.40

## Quyết định (mặc định tối giản)
- Mã khán giả = `K` + 5 ký tự cùng bảng chữ mã đội (6 ký tự, cùng ô đăng nhập); kiểm không trùng mã đội hai chiều.
- Token khán giả: claims `t = "s:<mã>"` (cùng HMAC). "Đổi mã" → token cũ hết hạn ngay (mã trong token ≠ mã hiện tại → 4401) và socket khán giả đang mở bị đóng.
- Khán giả: không gửi gì ngoài ping (mọi tin khác bị bỏ qua), nhận welcome thu gọn (teams có `racing`), tick của mọi đội online, `team` khi đội online / về đích đổi. Không feed, không bikes riêng (broadcast chung vẫn tới, client bỏ qua).
- Đội đã về đích / bị loại / sau Kết thúc: `tickEntries` với `all` → mọi đội trừ mình (không còn giới hạn 500 m).
- Client: Host, khán giả, đội đã về đích dùng cùng `Spectate` (FreeFlyCamera + thanh). Camera bám: hàm thuần `followPose`.

## Giới hạn
- (điền khi xong)
