# Phase 6 – Track C: xe chung, nhận xe nguyên tử, xe bị bỏ

Trạng thái: **XONG** (chờ người tích hợp nối vào RaceRoom của A / main + Player của B / trang Host của D, xem cuối file).
`npm run build && npm test` qua (scripts 18, shared 24, client 548, worker 34); `SCREENSHOT_PORT=5303 npm run ride-check` OK (offline, không đổi).

## Đã làm
| File | Nội dung |
|---|---|
| `worker/src/race/VehicleSpawner.ts` (+ test 9) | thuần, tất định: `rng` (mulberry32), `stream(state)` tiếp tục chuỗi từ `state.draws` bằng O(1) (`rng(seed + draws·K)`), `initialSpawn` (`initialPerSegment` [min, max] / đoạn), `periodicSpawn` (đoạn có < `maxAvailablePerSegment` xe trống ngoài bãi → xác suất `spawnChance`; tạm dừng → không), xe mồi: sau mỗi xe đoạn, rút tiếp khi `rand < decoyRatio` (kỳ vọng r/(1−r) → mồi/tổng ≈ r), trần mồi trống = số đoạn × `maxAvailablePerSegment`; chọn đều trong ứng viên cách mọi đội online ≥ `noSpawnNearPlayerMeters` và cách xe khác ≥ 3 m; id `b<draws>`; `claim` (gone → taken → walkOnly → far chỉ với xe trống, `CLAIM_REACH` 3,5 m = 2,5 + 1 m trễ pose); `abandoned` (cập nhật `nearOwnerAt`: đang đạp / chủ offline / gần → now) |
| `worker/src/race/BikeService.ts` (+ test 8) | cache RAM nạp lười từ `bikes` (nạp lại → `nearOwnerAt = now`), meta `spawner` {seed, draws, paused, nextAt, initialDone} (1 dòng) + meta `candidates`; ghi SQLite **trước** khi gửi; `rows` đếm bằng `cursor.rowsWritten` (gồm index) |
| `client/src/host/spawnCandidates.ts` (+ test 4 trên `roadgraph.json` thật) | A* đi bộ mỗi đoạn, `corridorEdges(corridorMeters, 'walk')`; bãi `bicycle_parking` trong hành lang trước; thiếu `minCandidates` → mẫu mỗi `candidateStep` m trên vỉa hè / footway / pedestrian (không cầu / bậc / vạch qua đường; không đủ thì mọi cạnh đi bộ), chọn đều theo chiều dài tuyến; mồi = 1 điểm vỉa hè / ô `decoyCell` ngoài mọi hành lang, trong `decoyMargin` quanh tuyến; mọi điểm cách điểm lộ trình + `checkpoints` ≥ `minDistanceFromCheckpoint`. Demo: 12 / 12 / 12 / 16 / 12 / 12 điểm, 527 mồi (≈ 8 KB), ≈ 125 ms (Node) |
| `client/src/vehicle/Bikes.ts` (+ 5 test) | chế độ server khi `net` được gán (xem "Client" dưới); offline y như cũ |
| `client/src/config.ts` khối C | `serverBikes` + `decoyCell` 150, `decoyMargin` 500, `groundRadius` 200 |
| `scripts/screenshot.ts` `[C]` | `p6-bikes` (đã chụp, xem PNG: xe trống lấp lánh, xe Đội Xanh khóa xanh, xe mình khóa đỏ), `p6-bike-lost` (chụp được, toast chỉ hiện sau khi nối `bikes.notify`) |

### Server (BikeService)
- `host.candidates` → lưu, nếu chưa có đợt đầu: `setAlarm(now)` → `alarm()` chạy **đợt đầu** (kể cả khi chưa ai online) → 1 sự kiện `bikeSpawn` (id, đoạn, x, z, draws) + broadcast `bikes`. Sau đó mỗi `spawnIntervalMinutes` một đợt **chỉ khi có đội online** (`players.length > 0`) và không tạm dừng; không ai online → không gắn lại; `tick()` gắn lại khi đội quay lại.
- `claim` / `mount` (mount = claim xe của chính đội): thắng → xe cũ của đội biến mất (gone), ghi `bikes` + `events bikeClaim` (chỉ khi đổi chủ) rồi mới `{t:'bike', op:'claim', ok:true}` cho đội + broadcast `bikes`; thua → `ok:false, reason`. Xe ở bãi: claim = lấy lại (rack null).
- `dismount`: tin trong 10 m quanh pose cuối thì dùng x, y, z, yaw của tin, xa hơn → đặt ở pose; không có pose → giữ chỗ cũ.
- `tick()` (~1 s): xe đang đạp đi theo chủ (RAM, không ghi), chủ không còn trong `players` → `rider:false` tại chỗ (1 dòng; vẫn khóa, §6.3), xe bị bỏ → xóa dòng + `bikeGone` + `notice bikeGone` cho chủ + broadcast `gone`.
- Host: `add` (`h<now>`, x/z phải hữu hạn), `remove` / `release` theo `id` hoặc `team`, `spawning` (paused). `park(team, rack)` cho Phase 7 (chủ null, `parked`, `parkedAt`, bãi đầy `bikeParking.maxBikes` → xe để lâu nhất biến mất, `notice bikeParked`).

### Client (Bikes, chế độ server)
- `applyServer(list, gone?, full?)`: tạo / cập nhật cùng `BikeState` (giữ model), xe đội khác đang đạp → `rider = REMOTE_RIDER` (ẩn model, RemotePlayers vẽ), xe mình đang đạp giữ pose local; server lấy mất xe đang đạp (bãi / Host thả / xóa) → xuống xe.
- `interact` với xe trong tầm (trống hoặc của mình) → gửi `claim`, trả `null` (im lặng tới khi server trả lời; không thêm `'claiming'` để `Player.ts` của B khỏi đổi kiểu), chặn gửi lại trong `claimTimeoutMs`. `onClaimResult(m)`: ok → lên xe nếu còn đứng cạnh; thua → `notify('bikeLost' | 'bikeTooFar' | 'walkOnly')`, đang ngồi xe đó thì xuống.
- `update()` mỗi khung: so trạng thái đạp thật (`controller.riding`) với điều server biết → tự gửi `dismount` (xuống, ngã, rơi sông, hồi sinh, được duyệt nhưng đã đi xa) hoặc `mount` (server thả rider khi tưởng đội offline); đặt xe server (y = 0 vì server không có DEM) lên mặt đất qua `ground` khi người chơi trong `groundRadius`, ẩn tới lúc đó.
- DEV `?bikes=free,mine,other,ridden,lost`: 3 xe thử (`bike.devSpawns`) thành xe "kiểu server" theo thứ tự (preset p6).

## Test (`npm test`)
- `VehicleSpawner.test.ts`: chuỗi seed nối tiếp qua "restart"; đợt đầu ≤ 1 xe / đoạn, đúng đoạn, ≥ 120 m quanh đội; tỉ lệ mồi 0,4 ± 0,03 trên 1 000 seed; 300 đợt định kỳ không vượt `maxAvailablePerSegment` (xe ở bãi không tính), xe bị nhận → đoạn có xe mới, tạm dừng → không; cùng seed + draws → cùng kết quả; `claim` đủ 5 lý do + xe mình từ xa; bỏ xe 59 s không / 61 s có, offline không, quay lại tính lại.
- `BikeService.test.ts`: SQLite thật của Node (`node:sqlite`) sau đúng các lệnh `SqlStorage` dùng, đồng hồ điều khiển: alarm + gắn lại chỉ khi có người, tạm dừng; claim ghi trước khi trả lời, walkOnly, taken, xe thứ hai làm xe cũ biến mất, gone; dismount xa không tin; đi theo người đạp, offline đứng yên, bỏ 60 s → gone + notice; bãi đầy; Host release / remove / dữ liệu xấu; restart dựng lại. **Harness thật (workerd):** 2 đội `claim` cùng xe cùng lúc → đúng 1 `ok:true`, đội kia `taken`, dòng `bikes` + `events` của người thắng; `host.candidates` → `setAlarm` → alarm → đợt đầu tới Host.
- `spawnCandidates.test.ts` (đồ thị thật): 6 đoạn ≥ 12 điểm trong hành lang, cách mọi điểm ≥ 100 m (L2 → L3 không có bãi → mẫu vỉa hè); L3 → L4 toàn bãi xe; mồi ngoài mọi hành lang; tất định; tránh điểm nhiệm vụ.
- `Bikes.test.ts` (+5): applyServer giữ đối tượng / gone / full / màu đội; F → claim → ok lên xe, taken → `bikeLost`; xuống / ngã → `dismount` một lần; hết `claimTimeoutMs` thì F gửi lại; server lấy xe đang đạp → xuống; đặt xe lên đất trong `groundRadius`.

## Ponytail / giới hạn đã biết
- `park` không dời xe tới tọa độ giá để xe (Phase 7 có tọa độ bãi).
- Claim khi server chưa có pose của đội (ngay sau khi DO thức dậy, người đứng im) → `far`; đi một bước là hết.
- Hướng xe sinh ra ngẫu nhiên (DO không biết hướng phố); id Host `h<ms>` (2 lần thêm cùng 1 ms trùng id).
- Xe đi theo người đạp chỉ trong RAM; DO bị đẩy khỏi bộ nhớ lúc đang đạp → xe ở chỗ ghi cuối cho tới tick kế.

## Người tích hợp cần làm (không có file nào của A / B / D bị sửa)
**RaceRoom (A):**
- Gọi `this.bikes.tick(this.players(), now)` ~1 lần / s trong vòng tick (kế hoạch đã ghi). `players()` = đội online có pose (như nền).
- `welcome.pose.bikeId` = `this.bikes.list().find((b) => b.owner === team.id)?.id ?? null` (C không cập nhật `TeamState.bikeId`).
- `HostState` cho trang Host gọi `spawnCandidates`: các điểm lộ trình theo thứ tự `[start, destination…]` (x, z), điểm nhiệm vụ nếu có, và `vehicles.corridorMeters` / `minDistanceFromCheckpoint` từ file chặng.

**main.ts / Player.ts (B)** — online chỉ khi có session:
```ts
// Player: online thì KHÔNG gọi placeBikes (xe đến từ server); offline giữ nguyên.
const bikes = player.bikes;
bikes.notify = notice;                         // cả offline (preset p6-bike-lost); cần NoticeCode 'bikeLost' + 'walkOnly' của B
if (session) {
  bikes.team = session.team.id; bikes.colour = session.team.colour; bikes.net = net;
  bikes.ground = (x, z, y) => groundAt(world, x, z, Math.max(y, env.heightAt(x, z)) + 3);
}
// welcome: bikes.setTeams(w.teams); bikes.applyServer(w.bikes, [], true);
// message 'bikes': bikes.applyServer(m.list, m.gone, m.full);   message 'bike': bikes.onClaimResult(m);
```
Toast (B, `ui/Toasts.ts`): `bikeLost` "Chậm một bước! Xe đã có người lấy.", `walkOnly` "Lộ trình này bắt buộc đi bộ". `notice bikeGone` / `bikeParked` từ server do B hiển thị.

**Trang Host (D):** nút "Tính hành lang & gửi ứng viên" = `send({ t: 'host.candidates', ...spawnCandidates(await loadRoadGraph(), points, checkpoints, rules) })` (đồ thị qua `geo/roadGraph.ts`).

**Preset:** chụp lại `p6-bikes`, `p6-bike-lost` sau khi nối `bikes.notify` (lúc đó toast "Chậm một bước!" hiện); `ride-check` mặc định.

## Cách chạy test
`npm run build && npm test` (từ gốc worktree); `SCREENSHOT_PORT=5303 npm run screenshot -- p6-bikes p6-bike-lost`; `SCREENSHOT_PORT=5303 npm run ride-check`.
