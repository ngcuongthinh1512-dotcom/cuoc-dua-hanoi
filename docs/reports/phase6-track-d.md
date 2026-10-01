# Phase 6 – Track D: báo cáo (XONG, đã sửa theo kiểm chứng)

Nhánh worktree từ `25d2543`. Kế hoạch: `docs/plans/phase6.md` §6 Track D. Kiểm chứng độc lập: `docs/reports/phase6-verify-d.md` (4 lỗi blocker / major + 3 lỗi nhỏ), vòng sửa ở mục "Vòng sửa" bên dưới. `npm run build && npm test` qua trong worktree (scripts 20, shared 24, client 547, worker 17).

## Đã làm
- **Trang Host tối giản** `client/host.html`, `client/src/host/{main.ts,hostView.ts,host.css}`: đăng nhập mật khẩu → tạo đội ("Tên đội; Người chơi" mỗi dòng, màu xoay vòng `hostPage.colours`) → bảng mã đội + sao chép, online / offline, lần cuối, số lần vào lại, vị trí lat/lon (`worldToLatLon`), cờ "Vượt tốc", "Thêm xe" cạnh đội, bộ đếm quota + request tính phí ước tính, số xe, tạm dừng / tiếp tục đặt xe, nút "Tính hành lang & gửi ứng viên", link người chơi `/?race=`. Tự nối lại WebSocket (`hostPage.reconnectMs`), 4401 → quay lại màn đăng nhập. `?demo=1` = dữ liệu giả không cần server. UI tiếng Việt có dấu.
- `hostView.ts` thuần + `hostView.test.ts` (billableRequests, teamRows, counterLines, parseTeamLines + kiểm tra trùng luật codec của server, ago).
- `client/vite.config.ts`: `build.rolldownOptions.input` = index + host (proxy `/api` + ws từ nền). Bản build có `dist/host.html` + `assets/host-*.js` (8,7 kB; đồ thị đường tải lười ở lần bấm nút đầu).
- `client/src/config.ts` khối D: `hostPage.{refreshMs, reconnectMs, colours, corridor, addBikeOffset}`.
- **Bot `npm run sim`** (`scripts/sim.ts`, script `sim` trong `package.json`): `npm run sim -- --bots 3 --minutes 2 [--speedup 1|2] [--url http://localhost:8787] [--race id] [--password p]`. Mặc định dựng server bằng `createTestHarness`; `--url` = `wrangler dev` / bản deploy (nhớ `--password` = `HOST_PASSWORD`). Bot đi tuyến A* thật ở 0,9 × `footSpeed`, `pos` 5 Hz. Kịch bản: (1) 2 bot xuất phát cùng một điểm, `claim` cùng một xe (Host `host.bike add`, xe đọc từ broadcast `bikes`; bỏ qua + ghi log nếu chưa có dịch vụ xe); (2) bot 0 ngắt giữa chừng rồi vào lại, `welcome.pose` phải khớp < 5 cm (§8.10). In số tin / byte, bộ đếm Host, request tính phí ≈ / bot / phút, ngoại suy 20 đội × 2 giờ, dòng ghi, đội bị đánh dấu. Thoát mã 1 nếu số người thắng xe ≠ 1 (khi có dịch vụ xe) hoặc vào lại lệch; ném lỗi nếu SERVER đóng bất kỳ socket nào (4429 / 4408 / 4400).
- `scripts/sim.test.ts` (harness thật, ≈ 22 s): 3 bot × 30 s tua 2×: `counters.wsIn` = tin đã gửi ± 10 %, ≥ 90 % của 3 × 30 × 5 poses, `billableRequests` = `http + alarms + ⌈wsIn/20⌉`, ngoại suy 20 đội × 2 h trong 36 000 ± 10 %, rejoin đúng chỗ, claim null hoặc đúng 1 người thắng; speedup 3 bị từ chối.
- Preset `p6-host` (`/host.html?demo=1`) trong `scripts/screenshot.ts` (`fullPage` cho `/host.html`). Đã chụp và xem lại sau vòng sửa: thêm cột "Xe" + nút "Tính hành lang & gửi ứng viên", tiếng Việt có dấu.

## Vòng sửa (theo `phase6-verify-d.md`)
Kiểm chứng trên bản ghép tạm (nhánh A đang làm dở, đã commit + file chưa commit trong worktree A `a8a436f546bdaf2c2`, + `spawnCandidates.ts` của C) trong thư mục scratch, đã xóa. Bản `sim` cũ trên A tái hiện đúng lỗi (`expected 399 to be greater than 409.5`); bản mới qua.

1. **[blocker] sim vi phạm giới hạn của A: SỬA.**
   - Gửi bù: mỗi bot có lịch riêng `due = max(due + bước, bây giờ)` (không bao giờ gửi dồn sau khi bị chặn / sau lúc ngắt); không còn `start` chung.
   - `--speedup` tối đa **2** (10 tin/s danh nghĩa; 3 = 15 tin/s đúng bằng giới hạn 1 s cửa sổ cố định của A). CLI + test cập nhật.
   - `welcome.pose` của A là pose HỢP LỆ cuối. Ở speedup ≥ 2 bot đi 7,2 m/s > 5 m/s nên bị đánh dấu (chỉ đánh dấu) và pose cuối gửi không còn là pose hợp lệ. Trước khi ngắt, bot 0 đứng yên `NET.speedWindowMs + 200` ms rồi gửi lại đúng pose đó một lần: cửa sổ tốc độ chỉ còn một mẫu nên pose hợp lệ ở mọi speedup. (+ 1 tin, + 3,2 s.)
   - Socket bị server đóng (4429 / 4408 / 4400): `runSim` ném lỗi rõ ràng (`dropped` theo từng socket, không đếm socket do sim tự đóng).
2. **[major] Keepalive: SỬA.** Trang Host và mọi socket của sim gửi `NET.ping` mỗi `NET.pingMs` (DO tự trả `pong`, không tính phí); khung `pong` bị bỏ qua (trước đó `JSON.parse('pong')` sẽ ném lỗi). Fallback `.at(-1)!` ở lần hỏi bộ đếm cuối thay bằng lỗi rõ ràng. Thử: sim 90 s mô phỏng trên A (Host im lặng gần 50 s) qua, trang Host mở > 2 phút không rớt.
3. **[major] Nút ứng viên + thêm xe: SỬA.** "Tính hành lang & gửi ứng viên": tải `roadgraph.json?url` (lười), `spawnCandidates(graph, state.steps, [], hostPage.corridor)` rồi `host.candidates`; kiểm tra ≤ `NET.maxHostBytes`; trạng thái hiển thị bên cạnh nút. "Thêm xe" cạnh mỗi đội có vị trí (`host.bike add` cách 3 m về phía đông). Thử đầu-cuối với A + `spawnCandidates.ts` của C (`wrangler dev` + Vite + trình duyệt): 76 ứng viên trên 7 đoạn + 527 điểm xe mồi, 8,0 kB, socket không bị đóng; "Thêm xe" gửi được. Xem "Cần làm khi ghép" về glob.
4. **[major] Tạo đội mất dữ liệu: SỬA.** `parseTeamLines` trả `{ teams, error }` và áp đúng luật của codec server (tên 1–40 ký tự, ≤ 100 đội; test đưa kết quả qua `isClientMessage` thật, đúng ở biên). Dòng sai → báo "Dòng N: …" bằng tiếng Việt, không gửi, giữ nguyên ô nhập. Ô nhập chỉ xóa khi `host.state` mới có đủ số đội; không gửi (và giữ ô nhập, báo lỗi) khi socket chưa mở; đóng 4400 có thông báo riêng. Đã thử trong trình duyệt: `Đội Xanh; An` + `; Bình` → "Dòng 2: thiếu tên đội", dòng 51 ký tự → "tên đội dài 51 ký tự, tối đa 40", dòng hợp lệ → ô nhập xóa sau khi bảng đội cập nhật.
5. [minor] "x giây trước" không chạy: SỬA. `teamRows(state, now)` với `now` = `serverMs` ước lượng (`state.serverMs + thời gian từ lúc nhận`); thử: 26 → 29 giây sau 3 giây.
6. [minor] Nhiễu `flagged` ở kịch bản claim: SỬA. Bot 0 và 1 xuất phát đúng điểm đặt xe (không nhảy); thử speedup 1: 0 đội bị đánh dấu (speedup 2: 3, đúng kỳ vọng, đã ghi chú trong dòng in). Kiểm tra claim trong test đổi thành `null` hoặc đúng 1 người thắng (khi có C, 0 hoặc 2 sẽ làm test đỏ, đúng ý).
7. [minor] Bộ nhớ `log` / waiter: SỬA. Không giữ tick (mảng số), gỡ waiter hết hạn.

Số đo trên A (3 bot, 30 s, speedup 1): wsIn 456 = tin gửi 456, request tính phí ≈ 32, ngoại suy 20 đội × 2 h ≈ 36 900 (< 40 000), dòng SQLite ≈ 58 (A ghi snapshot / replay), 0 đội bị đánh dấu, vào lại đúng chỗ.

## Cần làm khi ghép (người tích hợp)
1. **`main.ts` dùng `import.meta.glob('./spawnCandidates.ts')`** để nhánh D build được trước khi C vào (rỗng cho tới khi có file). Sau khi ghép C: đổi thành `import { spawnCandidates } from './spawnCandidates.ts'` và gọi thẳng (kiểu `SpawnCandidates` cục bộ cũng bỏ). Cần C có `serverBikes.decoyCell / decoyMargin` trong `config.ts` (đã có trong worktree C).
2. `HostState.steps?` do A thêm (kiểu cục bộ `State = HostState & { steps? }` trong `main.ts`, bỏ được sau khi ghép). Luật hành lang (`corridorMeters` 150, `minDistanceFromCheckpoint` 100) KHÔNG có đường truyền từ server: sao chép trong `hostPage.corridor` (ponytail có ghi); Phase 7 nên gửi cùng file chặng.
3. Khi ghép A + C: `npm run sim` kịch bản claim tự chạy (`host.bike add` → broadcast `bikes`); test đòi đúng 1 người thắng. Nếu đỏ, kiểm tra `interactRadius` / vị trí trong `live` trước khi nới test.
4. Khi ghép A: `host.state` được đẩy định kỳ, trang Host tự cập nhật; `sim` đọc bộ đếm cuối bằng `host.createTeams` rỗng (ponytail, 2 dòng ghi) và đợi trạng thái có `wsIn` ≥ số tin đã gửi.
5. Tài liệu dev (README, ở bước tích hợp): `npm run dev:api` (hoặc `wrangler dev --port 8789 --var HOST_PASSWORD:...`) + `npm run dev`, `/host.html`, `npm run sim -- --url http://localhost:8787 --password <HOST_PASSWORD>`; `--speedup` chỉ 1 hoặc 2.
6. Ghi chú máy: nếu test A / C lỗi kết nối ngẫu nhiên, chạy lại (workerd chạy song song nhiều track).

## Cách chạy
- `npm run build && npm test` (trong worktree: không `npm install`).
- `npx vitest run --dir scripts sim` (test bot riêng); `npm run sim -- --bots 3 --minutes 0.5 --speedup 2`.
- `SCREENSHOT_PORT=5304 npm run screenshot -- p6-host`.

## File sở hữu đã sửa
`client/host.html`, `client/src/host/*`, `client/vite.config.ts`, `client/src/config.ts` (khối D), `scripts/sim.ts`, `scripts/sim.test.ts`, `scripts/screenshot.ts` (dòng `[D]` + `fullPage` cho `/host.html`), `package.json` (script `sim`), báo cáo này.
