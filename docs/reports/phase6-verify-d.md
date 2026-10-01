# Phase 6 – Kiểm chứng Track D (verifier, không sửa code)

Worktree `agent-a2011538fa3ba174b` @ `0966427`, diff `25d2543..HEAD` (12 file, chỉ file của D; không đụng SPEC / TODO / CLAUDE.md).

## Chạy lại
- `npm run build` qua (có `dist/host.html` + `assets/host-*.js`); `npm test` qua: scripts 20, shared 24, client 544, worker 17.
- `npm run screenshot -- p6-host`: ảnh đúng (bảng 4 đội, Vượt tốc đỏ, bộ đếm 936 = 12 + 3 + ⌈18 420/20⌉, tiếng Việt có dấu).

## Lỗi (bằng chứng + tái hiện trong scratchpad)
1. **[blocker khi ghép A] `sim` vi phạm giới hạn của A → `scripts/sim.test.ts` đỏ sau khi merge.**
   - `scripts/sim.ts:191-193`: lịch gửi dùng chung `start` cho mọi bot. Sau khi vào lại (dòng 211-220), bot 0 bị trễ (300 ms + `rejoinGapMs/speedup` + đăng nhập), nên vòng lặp gửi bù một loạt pose không chờ.
   - Tái hiện (`repro-burst.mts`, ghi lại mọi `ws.send`, chạy lại `tooFast` của A): socket vào lại gửi 28 tin trong 1 s ở cấu hình test (speedup 2, khoảng ngắt 3 s) và 56 tin ở CLI mặc định (speedup 1, ngắt 10 s). A đóng 4429 từ tin thứ 16, nên `wsIn` < 0,9 × `sent`.
   - Speedup 2 = 7,2 m/s thật > 5 m/s (4 × 1,25). A lấy `welcome.pose` = pose hợp lệ cuối (`l.valid`), cách pose cuối đã gửi 43 m, nên `rejoin.ok = false`.
2. **[major] Không có keepalive `ping`** (QĐ 6) ở `client/src/host/main.ts` và socket Host của `sim`.
   - Bản A đang làm đóng mọi socket im lặng 30 s (4408, cả Host). Hệ quả: trang Host mất kết nối rồi nối lại mỗi ≈ 30 s khi có đội di chuyển, mỗi lần tốn 1 request.
   - `sim` chạy > 30 s: lần hỏi bộ đếm cuối rơi vào socket đã đóng, `.catch(... .at(-1)!)` trả `undefined`, nên `final.counters` báo TypeError. Đã tái hiện (`repro-silent-host.mts`).
3. **[major] Thiếu nút "Tính hành lang & gửi ứng viên"** (QĐ 19). Trang Host cũng không có nút thêm xe tay, nên khi ghép không có xe server nào để thử đạp xe online.
4. **[major] Tạo đội mất dữ liệu.**
   - Một dòng tên rỗng (`; An`), tên > 40 ký tự hoặc > 100 đội làm `isClientMessage` từ chối CẢ lô. Server đóng 4400; trang đã xóa ô nhập và chỉ báo "Mất kết nối, đang nối lại…". Đã tái hiện (`repro-host.mts`).
   - Bấm "Tạo đội" lúc đang nối lại cũng xóa ô nhập mà không gửi gì.
5. [minor] "x giây trước" không chạy: `ago(t.lastSeen, state.serverMs)` dùng thời điểm của `host.state`. Việc vẽ lại mỗi giây ra cùng một chuỗi, nên comment ở `main.ts:113` sai.
6. [minor] Kịch bản claim dịch chuyển bot 0/1 từ `(sx, sz)` tới đầu tuyến, nên A đánh dấu vượt tốc ngay cả ở speedup 1 và số `flagged` bị nhiễu. Kiểm tra claim trong test vẫn rỗng nghĩa (`claim === null` qua).
7. [minor] `sim` giữ mọi tin nhận được (`log`, gồm tick 5 Hz) và không gỡ waiter hết hạn. Chạy dài (20 bot × 2 h) tốn hàng trăm MB.
