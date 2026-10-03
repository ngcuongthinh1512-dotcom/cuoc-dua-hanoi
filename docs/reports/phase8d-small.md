# Phase 8D – đợt việc nhỏ (§17.21, §17.22, §17.23)

Nhánh `phase8d-small` (chưa ghép main). Không đụng `client/src/world/*`, `scripts/assets/*`, cấu hình đồ họa 8C.

## Đã làm
- **(A) §17.21 chặn sao chép.** `.rc-nocopy` (user-select none) trên thẻ gọn + lớp phủ (thẻ đầy đủ mọi loại: lộ trình, thử thách, Lựa chọn kép, Louvre; Sổ mật thư; thẻ về đích). Hủy copy / cut / dragstart / contextmenu / selectstart trong vùng; chặn copy toàn trang khi vùng chọn chạm thẻ (Ctrl+A rồi Ctrl+C). Ngoại lệ `.rc-code` (mã bài nộp) và ô gõ đáp án. Esc / Tab / gõ không bị chặn. Test thuần `copyBlocked` (format.test) + hud-check 14 điều kiện mới (bôi đen ba lần, Ctrl+A, Ctrl+C không có chữ mật thư trong clipboard, nút Copy vẫn chép đúng mã, ô đáp án vẫn chọn / sửa, Sổ) đều qua.
- **(B) §17.22 thứ hạng.** `ranking.ts` viết lại: đội đã về theo `finishAt` (hòa cùng ms → hạng lưu lúc check-in), rồi đội bị loại lúc "Kết thúc" theo hạng lưu, rồi đội đang đua (bước xa nhất → xong bước trước sớm hơn → thứ tự vào → slot). Bỏ `officialMs`, `gapMs`, `approvalWaitMs`. Lúc check-in engine lưu `teams.state.rank` (cố định) + `out` trong cùng giao dịch trước mọi tin gửi; event `finish {rank,total,out}`. Đội cuối cùng (mọi đội khác đã về, cuộc đua ≥ 2 đội) `out`. Host "Kết thúc": mọi đội chưa về `out` + hạng sau các đội đã về, ghi cùng giao dịch với trạng thái `finished` (event `out`), rồi gửi view. Dựng lại sau evict từ `teams.state` (test DO restart + test engine dựng engine mới).
- **(C) §17.23 bỏ đồng hồ đội.** Gỡ hàng "THỜI GIAN" + huy hiệu trạng thái trên HUD, `RaceView.startAt` / `officialMs`, `welcome.raceTime`, tóm tắt "Thời gian đua" khi vào lại, tin `host.team` (codec từ chối), ô nhập giờ xuất phát (trang Host còn bảng "Thứ tự vào game"), cột Chính thức / Cách / Bù giờ chờ duyệt, chế độ T+. `PROTOCOL_VERSION` 5. Giữ: đếm ngược phạt 3 / 10 phút, dòng PHẠT, mốc 40 / 70, cảnh báo kẹt 45 phút, "Xuất phát ở vị trí thứ n", HUD phố / quận / tốc độ. `hostApproval.approvalWaitCounts` bỏ khỏi schema (file cũ vẫn nạp, bị bỏ qua); `approval_wait_seconds` giữ làm thông tin cho Host (tiêu đề ô ma trận "Đã chờ duyệt").
- **(D) chữ về đích trong file chặng.** `pit_stop.announce {npc,toast,card, first{…}, out{…}}`, chỗ giữ `{n}` `{tổng}` `{tên đội}` (so NFC). Máy chủ điền chữ và gửi `RaceView.result {rank,total,kind,npc,toast,card}` chỉ cho đội đó khi về đích / bị loại. Dự phòng chung `FINISH_DEFAULTS` (shared/src/protocol/finish.ts, không tên địa điểm) ở máy chủ + client; `first` mượn chữ thường của chặng, `out` không mượn. Client: lời NPC, toast, thẻ về đích (tiêu đề "Về đích thứ n" / "BỊ LOẠI"); welcome sau khi bị loại lúc offline vẫn hiện một lần (localStorage). leg:check: chỗ giữ lạ / dấu { } lẻ = LỖI, ký tự điều khiển / vô hình = LỖI, ký tự ngoài Latin / Việt = CẢNH BÁO; chữ announce vào danh sách quét rò rỉ tài sản tĩnh. Chặng test mini / near / louvre / paris-demo.filled có chữ "(GIẢ)".
- **(E)** referenceAnswers trùng địa danh có sẵn: chỉ CẢNH BÁO; test F1 có sẵn (`scripts/leg-check.test.ts`) vẫn qua.
- Tài liệu: `docs/RACE_RULES.md` (mục 4, 5, 7, 10, 11, 12), `docs/LEG_FORMAT.md` (mục 3.1, 4, 5.4 `announce`, 6, 11, sim), `TODO.md` (mục Phase 8D). Sim bot: không gửi giờ xuất phát, báo cáo số đội bị loại.

## Kiểm
- Test mới thất bại nếu hoàn tác: ranking.test (3), engine.test (về đích thứ n / về nhất / đội cuối bị loại / Host Kết thúc + dựng lại), RaceRoom.race.test (result + rank trong SQLite, sau evict), RaceRoom.louvre.test (B bị loại khi Kết thúc), leg.test (announce), leg-check.test (announce là bí mật), codec.test (host.team bị từ chối), hostView.test, format.test, RaceClient.test, HUD.test, session.test, sim.test (out: 1).
- hud-check (HUD_CHECK_PORT=5381): mọi điều kiện ok, không lỗi console.
- Ảnh (SCREENSHOT_PORT=5381, đã xem): `p7-finish` (thẻ "Về đích thứ 2", lời NPC, không đồng hồ), `p7-finish-out` (thẻ đỏ "BỊ LOẠI 5/5"), `p7-pit` (đếm ngược + PHẠT, không THỜI GIAN), `p7-host` (bảng "Thứ tự vào game", cột Hạng / Phạt / Về đích).

## Lệch / mặc định chờ xác nhận
- Tên khối `announce` (thay vì các trường rời trên `pit_stop`).
- Đội cuối chỉ bị loại khi cuộc đua có ≥ 2 đội; không phụ thuộc `eliminationLeg`; `{tổng}` = mọi đội đã tạo.
- Nhiều đội chờ trên thảm khi tạm dừng: check-in cùng lúc tiếp tục, hạng theo thứ tự máy chủ xử lý.
- Sau "Kết thúc" không có huy hiệu trạng thái (đã gỡ cùng đồng hồ); đội chưa về thấy thẻ BỊ LOẠI.

## Kiểm tay còn lại
- Chơi thật 2–3 trình duyệt + Host tới đích (thứ tự, đội cuối BỊ LOẠI, Host Kết thúc với đội dang dở, F5 sau đó).
- Bôi đen / chuột phải / kéo thả trên Firefox, Safari.
