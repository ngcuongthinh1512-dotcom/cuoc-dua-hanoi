# Phase 6 – Track D: báo cáo (CHECKPOINT, chưa xong)

Nhánh worktree từ `25d2543`. Kế hoạch: `docs/plans/phase6.md` §6 Track D. Phát triển trên nền (BikeService còn là stub, RaceRoom chưa có tick / host.state định kỳ).

## Đã viết (CHƯA chạy, CHƯA typecheck, CHƯA test)
- `client/host.html`, `client/src/host/{main.ts,hostView.ts,host.css}`: trang Host tối giản (đăng nhập mật khẩu → tạo đội "Tên đội; Người chơi" → bảng mã đội + sao chép, online / offline, lần cuối, vào lại, vị trí lat/lon, cờ vượt tốc, bộ đếm quota + request tính phí ước tính, tạm dừng đặt xe, link người chơi `/?race=`). `?demo=1` = dữ liệu giả không cần server (preset `p6-host`).
- `client/src/host/hostView.test.ts`: hàm thuần (billableRequests, teamRows, counterLines, parseTeamLines, ago).
- `client/vite.config.ts`: `build.rolldownOptions.input` = index + host (proxy `/api` + ws đã có từ nền).
- `client/src/config.ts` khối D: thêm `hostPage.reconnectMs`, `hostPage.colours`.
- `scripts/sim.ts`: `runSim(opts)` + CLI `npm run sim -- --bots 3 --minutes 2 [--speedup 1] [--url …] [--race …] [--password …]`; bot đi tuyến A* thật (`RoadGraph` + `shortestPath` 'walk') ở 0,9 × footSpeed, `pos` 5 Hz; kịch bản 2 bot `claim` cùng xe (bỏ qua nếu chưa có dịch vụ xe), bot 0 ngắt giữa chừng rồi vào lại (`welcome.pose` phải khớp < 5 cm); in số tin / byte / bộ đếm Host / request ước tính / bot / phút và ngoại suy 20 đội × 2 giờ. Đọc bộ đếm cuối bằng `host.createTeams` rỗng (ponytail, ghi trong code).

## Còn lại
1. Thêm script `"sim": "tsx scripts/sim.ts"` vào `package.json` (chưa làm).
2. `scripts/sim.test.ts`: chạy `runSim({bots:3, seconds:30, speedup:3, rejoinGapMs:3000, race:'sim-test', password:'test-secret'})` với harness mặc định; kiểm không lỗi, `counters.wsIn` ≈ `sent` ± 10 % (cả Host), rejoin.ok, claim null hoặc ok ≤ 1. Timeout lớn (vài chục giây; harness khởi động workerd). Cần `client/dist` rỗng (harness tự tạo).
3. Chạy `npm run build` (kiểm kiểu: `scripts/tsconfig.json` chỉ `types: node` — import `../worker/src/test/harness.ts` có thể cần chỉnh; `client/vite.config.ts` import `node:path`) và `npm test`.
4. Preset `[D]` trong `scripts/screenshot.ts`: `'p6-host': '/host.html?demo=1'` (nhớ `-- --path` hoặc preset dùng `PRESETS`); chụp, XEM PNG (SCREENSHOT_PORT=5304). Preset trang không phải game có thể cần `__READY__` (trang đã đặt).
5. Tài liệu ngắn cách chạy dev (`npm run dev:api` + `npm run dev`, `/host.html`, `npm run sim -- --url http://localhost:8787`): kế hoạch bảo ghi ở README khi tích hợp → chỉ ghi vào báo cáo cuối.
6. Nút "Tính hành lang & gửi ứng viên" CHƯA làm: cần `client/src/host/spawnCandidates.ts` (Track C) + `HostState.steps` (Track A). Người tích hợp nối sau.
7. Không để wrangler / vite / workerd chạy.

## Cần biết
- Symlink `node_modules`, `.cache`, `client|worker|shared/node_modules` đã tạo trong worktree (không `git add`; `.cache` hiện hiện ở `git status` vì chưa ignore thư mục symlink: dùng `git add` theo đường dẫn cụ thể).
- Trang Host chỉ nhận `host.state` được đẩy (A) hoặc trả lời `host.createTeams`; trước khi A xong, bảng chỉ cập nhật khi tạo đội.
- `--speedup k`: 5k tin/s/bot; server đóng socket > 15 tin/s ⇒ k ≤ 3; server sẽ đánh dấu vượt tốc (đã ghi trong cảnh báo đầu `sim.ts`).
