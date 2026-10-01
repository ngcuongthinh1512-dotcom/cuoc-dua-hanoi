# Phase 6 – Track D: báo cáo (XONG, trừ nút ứng viên xe)

Nhánh worktree từ `25d2543`. Kế hoạch: `docs/plans/phase6.md` §6 Track D. Phát triển trên nền (BikeService còn là stub, RaceRoom chưa có tick / `host.state` định kỳ). `npm run build && npm test` qua trong worktree (scripts 20, shared 24, client 544, worker 17).

## Đã làm
- **Trang Host tối giản** `client/host.html`, `client/src/host/{main.ts,hostView.ts,host.css}`: đăng nhập mật khẩu → tạo đội ("Tên đội; Người chơi" mỗi dòng, màu xoay vòng `hostPage.colours`) → bảng mã đội + sao chép, online / offline, lần cuối, số lần vào lại, vị trí lat/lon (`worldToLatLon`), cờ "Vượt tốc", bộ đếm quota + request tính phí ước tính, số xe, tạm dừng / tiếp tục đặt xe, link người chơi `/?race=`. Tự nối lại WebSocket (`hostPage.reconnectMs`), 4401 → quay lại màn đăng nhập. `?demo=1` = dữ liệu giả không cần server. UI tiếng Việt có dấu.
- `hostView.ts` thuần + `hostView.test.ts` (billableRequests, teamRows, counterLines, parseTeamLines, ago).
- `client/vite.config.ts`: `build.rolldownOptions.input` = index + host (proxy `/api` + ws từ nền). Bản build có `dist/host.html` + `assets/host-*.js` (5,4 kB).
- `client/src/config.ts` khối D: `hostPage.{refreshMs, reconnectMs, colours}`.
- **Bot `npm run sim`** (`scripts/sim.ts`, script `sim` trong `package.json`): `npm run sim -- --bots 3 --minutes 2 [--speedup 1..3] [--url http://localhost:8789] [--race id] [--password p]`. Mặc định dựng server bằng `createTestHarness` (workerd trong tiến trình); `--url` = `wrangler dev` / bản deploy (nhớ `--password` = `HOST_PASSWORD`). Bot đi tuyến A* thật (`RoadGraph` + `shortestPath` 'walk') ở 0,9 × `footSpeed`, `pos` 5 Hz. Kịch bản: (1) 2 bot `claim` cùng một xe (Host `host.bike add`, xe đọc từ broadcast `bikes`; bỏ qua + ghi log nếu chưa có dịch vụ xe); (2) bot 0 ngắt giữa chừng rồi vào lại, `welcome.pose` phải khớp < 5 cm (§8.10). In số tin / byte, bộ đếm Host, request tính phí ≈ / bot / phút, ngoại suy 20 đội × 2 giờ (luôn di chuyển = xấu nhất; WebSocket tỉ lệ theo thời gian × đội, đăng nhập chỉ một lần mỗi đội), dòng ghi, đội bị đánh dấu. Thoát mã 1 nếu > 1 xe nhận được hoặc vào lại lệch. `--speedup` ngoài 1…3 bị từ chối (server đóng socket > 15 tin/s).
- `scripts/sim.test.ts` (harness thật, ≈ 18 s): 3 bot × 30 s tua 2× → `counters.wsIn` = tin đã gửi ± 10 %, ≥ 90 % của 3 × 30 × 5 poses, `billableRequests` = `http + alarms + ⌈wsIn/20⌉`, ngoại suy 20 đội × 2 h trong 36 000 ± 10 % (§9), rejoin đúng chỗ, claim null hoặc ≤ 1; speedup 4 bị từ chối.
- Preset `p6-host` (`/host.html?demo=1`) trong `scripts/screenshot.ts`; vì trang Host cuộn nên bộ chụp dùng `fullPage` cho đường dẫn `/host.html` (1 dòng ở vòng chụp, game không đổi). Đã chụp và xem: bảng 4 đội (online / offline / vượt tốc đỏ), bộ đếm, khối xe chung đều đúng, tiếng Việt có dấu.
- Kiểm tra tay đầu-cuối: `wrangler dev --port 8789 --var HOST_PASSWORD:…` + trình duyệt tại `/host`: đăng nhập, tạo 3 đội → hiện đúng 3 mã; `sim --url` chạy 18 s, vào lại đúng chỗ, không lỗi. Đã tắt wrangler.

## Số đo (harness, 3 bot, 30 s, trên nền chưa có tick / snapshot của A)
Tin gửi lên 455 (≈ 12 KB), wsIn 455 khớp, request tính phí ≈ 32, ngoại suy 20 đội × 2 h ≈ 36–40 nghìn (ngân sách < 40 000; xấu nhất §9 = 36 000 + cố định). Dòng SQLite: 31 (chưa có snapshot / replay; tính lại sau khi ghép A).

## Còn lại / để người tích hợp
1. **Nút "Tính hành lang & gửi ứng viên" CHƯA làm**: cần `client/src/host/spawnCandidates.ts` (Track C, chưa có trong nền) và `HostState.steps: {id, x, z}[]` (Track A, chưa có). Chỗ nối: `client/src/host/main.ts` hàm `render` (khối "Xe chung", đã có `spawning.candidates`); việc cần: tải `/data/...roadgraph` (`geo/roadGraph.ts` hoặc `fetch` + `RoadGraph.decode`), gọi `spawnCandidates(graph, points, checkpoints, cfg)` rồi `send({ t: 'host.candidates', segments, decoys })`. Tải đồ thị 2,3 MB + giải mã 27 ms trong trình duyệt Host (§2.4).
2. Khi ghép A: `host.state` sẽ được đẩy định kỳ + khi Host kết nối, trang Host tự cập nhật (hiện chỉ cập nhật khi tạo đội); `sim` đọc bộ đếm cuối bằng `host.createTeams` rỗng (ponytail, 2 dòng ghi) và đợi trạng thái có `wsIn` ≥ số tin đã gửi, nên vẫn đúng khi A đẩy trạng thái xen kẽ. `sim` tạo đội chờ đủ số đội mới trong `host.state` (không lấy nhầm trạng thái đẩy lúc Host vừa nối).
3. Giới hạn 15 tin/s/socket của A: bot ở `--speedup 3` ≈ đúng 15 tin/s danh nghĩa (nhảy do hẹn giờ có thể vượt), nên test dùng `speedup: 2`. Nếu A đóng socket 4429 ở speedup 3, hạ xuống 2 trong CLI chứ không nới giới hạn.
4. Khi ghép C: kịch bản `claim` tự chạy (cần `host.bike add` → broadcast `bikes`); test chỉ khẳng định ≤ 1 người thắng, nên đổi thành `=== 1` khi C xong.
5. Tài liệu dev (README, ở bước tích hợp): `npm run dev:api` (hoặc `wrangler dev --port 8789 --var HOST_PASSWORD:...`) + `npm run dev`, `/host.html`, `npm run sim -- --url http://localhost:8787 --password <HOST_PASSWORD>`.
6. Ghi chú máy: trong lúc làm, một lệnh `pkill -f wrangler; pkill workerd` của D có thể đã tắt workerd của test các track khác đang chạy song song (không có chủ đích); nếu A / C thấy test lỗi kết nối ngẫu nhiên đúng lúc đó (khi D tắt `wrangler dev` của mình), chỉ cần chạy lại.

## Cách chạy
- `npm run build && npm test` (trong worktree: không `npm install`).
- `npx vitest run --dir scripts sim` (test bot riêng); `npm run sim -- --bots 3 --minutes 0.5 --speedup 3`.
- `SCREENSHOT_PORT=5304 npm run screenshot -- p6-host`.

## File sở hữu đã sửa
`client/host.html`, `client/src/host/*`, `client/vite.config.ts`, `client/src/config.ts` (khối D), `scripts/sim.ts`, `scripts/sim.test.ts`, `scripts/screenshot.ts` (dòng `[D]` + `fullPage` cho `/host.html`), `package.json` (script `sim`), báo cáo này.
