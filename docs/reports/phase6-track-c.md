# Phase 6 – Track C: xe chung, nhận xe nguyên tử, xe bị bỏ

Trạng thái: **XONG + đã sửa theo kiểm tra độc lập** (`docs/reports/phase6-verify-c.md`: 3 lỗi chính + các lỗi nhỏ, xem "Sửa sau kiểm tra"). Chờ người tích hợp nối vào RaceRoom của A / main + Player của B / trang Host của D, xem cuối file.
`npm run build && npm test` qua (scripts 18, shared 24, client 548, worker 38); `SCREENSHOT_PORT=5303 npm run ride-check` OK (offline; lần sửa này không đụng client game).

## Sửa sau kiểm tra (commit `fix(phase6): track C – …`)
| Lỗi | Sửa |
|---|---|
| **Chính 1** – `bikes` gửi mọi socket: lộ chủ + x, z xe đang đạp, chỗ đội khác xuống xe, xe trống ở các đoạn sau | Không còn broadcast. Mỗi đội chỉ nhận **tầm nhìn** của mình: xe của đội (luôn), xe trống + xe đứng yên của đội khác trong `VIEW_METERS` 250 m (= `groundRadius` 200 của client + trễ 1 tick); xe đội khác **đang đạp thì không bao giờ** (RemotePlayers vẽ từ tick). Host (`send(HOST)`) nhận mọi thay đổi ngay. `forTeam(team, at)` = `welcome.bikes` của đội (ghi nhớ đã gửi gì); `tick` gửi mỗi đội có pose phần **khác** so với lần trước (`list` đổi + `gone` ra khỏi tầm), lần đầu sau khi DO thức / đội vừa vào lại = `full: true`. Người claim / dismount nhận ngay; đội khác ở tick kế (≤ 1 s). |
| **Chính 2** – gọi xe của mình từ xa | `claim()` kiểm khoảng cách với **mọi xe đứng yên** (`!rider`): xe trống / ở bãi `CLAIM_REACH` 3,5 m, xe của mình `OWN_REACH` 10 m (= vùng tin dismount; xe bị thả khi đội offline đứng ở pose của tick cuối, ≤ 1 s × 5,2 m/s so với pose vào lại). Chỉ xe đang đạp (đi theo người đạp) được miễn. Test: 190 m → `far`, tick không dời xe. |
| **Chính 3** – vòng rider bật/tắt mỗi giây sau khi DO thức | `tick(players, online, now)`: `online` = đội có socket mở; chỉ thả rider khi đội **không còn socket** (đội online chưa có pose giữ nguyên: 0 dòng, 0 tin). claim / mount xe đang đạp sẵn → trả `ok`, không ghi; dismount khi đã đứng → bỏ qua. Test 60 tick: 0 dòng ghi. |
| Nhỏ – tạm dừng không chặn đợt đầu | `alarm()` không làm gì khi `paused`; bỏ tạm dừng mà chưa có đợt đầu → `setAlarm(now)`. |
| Nhỏ – `dismount` nhận y bất kỳ | y ngoài [−100, 1 000] m (như `decodePose`) bị bỏ, giữ y cũ. |
| Nhỏ – test seed `crypto` hỏng ≈ 0,4 % | test đầu đặt sẵn `meta spawner` seed 7. |
| Nhỏ – mồi không bao giờ ở bãi xe | mồi lấy **bãi `bicycle_parking` ngoài mọi hành lang trước** (1 / ô `decoyCell`), rồi mới điểm vỉa hè: 528 mồi, > 20 ở bãi (test), ≈ 158 ms. |
| Nhỏ – vị trí xe đang đạp chỉ ở RAM | **Chưa sửa** (cần dòng snapshot của A), ghi `ponytail:` trong `tick`. Báo cáo cũ nói "tới tick kế" là sai khi chủ đã offline: DO bị đẩy giữa lúc đạp mà chủ rời đi trước pose kế → xe đứng ở chỗ nhận xe, chủ vào lại ở chỗ snapshot > 200 m → 60 s sau xe biến mất. Nâng cấp: snapshot của A mang vị trí xe đang đạp. |
| Nhỏ – `p6-bike-lost` chưa có toast; id Host `h<ms>` | như cũ (chờ B nối `notify`; id đã ghi ponytail). |

## Đã làm
| File | Nội dung |
|---|---|
| `worker/src/race/VehicleSpawner.ts` (+ test 9) | thuần, tất định: `rng` (mulberry32), `stream(state)` tiếp tục chuỗi từ `state.draws` bằng O(1) (`rng(seed + draws·K)`), `initialSpawn` (`initialPerSegment` [min, max] / đoạn), `periodicSpawn` (đoạn có < `maxAvailablePerSegment` xe trống ngoài bãi → xác suất `spawnChance`; tạm dừng → không), xe mồi: sau mỗi xe đoạn, rút tiếp khi `rand < decoyRatio` (kỳ vọng r/(1−r) → mồi/tổng ≈ r), trần mồi trống = số đoạn × `maxAvailablePerSegment`; chọn đều trong ứng viên cách mọi đội online ≥ `noSpawnNearPlayerMeters` và cách xe khác ≥ 3 m; id `b<draws>`; `claim` (gone → taken → walkOnly → far với mọi xe đứng yên: `CLAIM_REACH` 3,5 m = 2,5 + 1 m trễ pose, xe của mình `OWN_REACH` 10 m); `abandoned` (cập nhật `nearOwnerAt`: đang đạp / chủ offline / gần → now) |
| `worker/src/race/BikeService.ts` (+ test 12) | cache RAM nạp lười từ `bikes` (nạp lại → `nearOwnerAt = now`), meta `spawner` {seed, draws, paused, nextAt, initialDone} (1 dòng) + meta `candidates`; ghi SQLite **trước** khi gửi; `rows` đếm bằng `cursor.rowsWritten` (gồm index); tầm nhìn theo đội (`forTeam`, `sync`, bảng `told` trong RAM) |
| `client/src/host/spawnCandidates.ts` (+ test 4 trên `roadgraph.json` thật) | A* đi bộ mỗi đoạn, `corridorEdges(corridorMeters, 'walk')`; bãi `bicycle_parking` trong hành lang trước; thiếu `minCandidates` → mẫu mỗi `candidateStep` m trên vỉa hè / footway / pedestrian (không cầu / bậc / vạch qua đường; không đủ thì mọi cạnh đi bộ), chọn đều theo chiều dài tuyến; mồi = 1 điểm / ô `decoyCell` ngoài mọi hành lang, trong `decoyMargin` quanh tuyến, bãi xe trước rồi vỉa hè; mọi điểm cách điểm lộ trình + `checkpoints` ≥ `minDistanceFromCheckpoint`. Demo: 12 / 12 / 12 / 16 / 12 / 12 điểm, 528 mồi (≈ 8 KB), ≈ 158 ms (Node) |
| `client/src/vehicle/Bikes.ts` (+ 5 test) | chế độ server khi `net` được gán (xem "Client" dưới); offline y như cũ |
| `client/src/config.ts` khối C | `serverBikes` + `decoyCell` 150, `decoyMargin` 500, `groundRadius` 200 |
| `scripts/screenshot.ts` `[C]` | `p6-bikes` (đã chụp, xem PNG: xe trống lấp lánh, xe Đội Xanh khóa xanh, xe mình khóa đỏ), `p6-bike-lost` (chụp được, toast chỉ hiện sau khi nối `bikes.notify`) |

### Server (BikeService)
- **Ai nghe gì:** Host (`send(HOST)`) mọi thay đổi ngay. Đội: chỉ tầm nhìn (xe mình; xe trống + xe đứng yên của đội khác ≤ `VIEW_METERS` 250 m; không bao giờ xe đội khác đang đạp): `welcome.bikes` = `forTeam(team, at)`, sau đó phần khác biệt ở mỗi `tick` (đội có pose) và ngay sau claim / dismount của chính đội; không biết đội đã có gì (DO thức, vào lại) → `full: true`.
- `host.candidates` → lưu, nếu chưa có đợt đầu và không tạm dừng: `setAlarm(now)` → `alarm()` chạy **đợt đầu** (kể cả khi chưa ai online) → 1 sự kiện `bikeSpawn` (id, đoạn, x, z, draws) + Host. Sau đó mỗi `spawnIntervalMinutes` một đợt **chỉ khi có đội online** (`players.length > 0`) và không tạm dừng; không ai online → không gắn lại; `tick()` gắn lại khi đội quay lại; bỏ tạm dừng trước đợt đầu → gắn ngay.
- `claim` / `mount` (mount = claim xe của chính đội): thắng → xe cũ của đội biến mất (gone), ghi `bikes` + `events bikeClaim` (chỉ khi đổi chủ) rồi mới `{t:'bike', op:'claim', ok:true}` cho đội + Host + tầm nhìn của đội; thua → `ok:false, reason`. Xe ở bãi: claim = lấy lại (rack null). Đang đạp chính xe đó → `ok`, không ghi.
- `dismount` (chỉ khi đang đạp): tin trong `OWN_REACH` 10 m quanh pose cuối thì dùng x, y (∈ [−100, 1 000]), z, yaw của tin, xa hơn → đặt ở pose; không có pose → giữ chỗ cũ.
- `tick(players, online, now)` (~1 s): xe đang đạp đi theo chủ (RAM, không ghi); chủ **không còn socket** → `rider:false` tại chỗ (1 dòng; vẫn khóa, §6.3), chủ online chưa có pose → giữ nguyên; xe bị bỏ → xóa dòng + `bikeGone` + `notice bikeGone` cho chủ + Host; rồi mỗi đội có pose nhận phần khác biệt.
- Host: `add` (`h<now>`, x/z phải hữu hạn), `remove` / `release` theo `id` hoặc `team`, `spawning` (paused). `park(team, rack)` cho Phase 7 (chủ null, `parked`, `parkedAt`, bãi đầy `bikeParking.maxBikes` → xe để lâu nhất biến mất, `notice bikeParked`).

### Client (Bikes, chế độ server)
- `applyServer(list, gone?, full?)`: tạo / cập nhật cùng `BikeState` (giữ model), xe đội khác đang đạp → `rider = REMOTE_RIDER` (ẩn model, RemotePlayers vẽ), xe mình đang đạp giữ pose local; server lấy mất xe đang đạp (bãi / Host thả / xóa) → xuống xe.
- `interact` với xe trong tầm (trống hoặc của mình) → gửi `claim`, trả `null` (im lặng tới khi server trả lời; không thêm `'claiming'` để `Player.ts` của B khỏi đổi kiểu), chặn gửi lại trong `claimTimeoutMs`. `onClaimResult(m)`: ok → lên xe nếu còn đứng cạnh; thua → `notify('bikeLost' | 'bikeTooFar' | 'walkOnly')`, đang ngồi xe đó thì xuống.
- `update()` mỗi khung: so trạng thái đạp thật (`controller.riding`) với điều server biết → tự gửi `dismount` (xuống, ngã, rơi sông, hồi sinh, được duyệt nhưng đã đi xa) hoặc `mount` (server thả rider khi tưởng đội offline); đặt xe server (y = 0 vì server không có DEM) lên mặt đất qua `ground` khi người chơi trong `groundRadius`, ẩn tới lúc đó.
- DEV `?bikes=free,mine,other,ridden,lost`: 3 xe thử (`bike.devSpawns`) thành xe "kiểu server" theo thứ tự (preset p6).

## Test (`npm test`)
- `VehicleSpawner.test.ts`: chuỗi seed nối tiếp qua "restart"; đợt đầu ≤ 1 xe / đoạn, đúng đoạn, ≥ 120 m quanh đội; tỉ lệ mồi 0,4 ± 0,03 trên 1 000 seed; 300 đợt định kỳ không vượt `maxAvailablePerSegment` (xe ở bãi không tính), xe bị nhận → đoạn có xe mới, tạm dừng → không; cùng seed + draws → cùng kết quả; `claim` đủ 5 lý do; xe mình: đang đạp → ok mọi nơi, đứng yên → ≤ `OWN_REACH`, 190 m / không pose → `far`; bỏ xe 59 s không / 61 s có, offline không, quay lại tính lại.
- `BikeService.test.ts`: SQLite thật của Node (`node:sqlite`) sau đúng các lệnh `SqlStorage` dùng, đồng hồ điều khiển: alarm + gắn lại chỉ khi có người, tạm dừng (cả trước đợt đầu); claim ghi trước khi trả lời, walkOnly, taken, xe thứ hai làm xe cũ biến mất, gone; dismount xa không tin, y vô lý bỏ; gọi xe mình từ 190 m → `far`, mount / claim / dismount lặp → 0 dòng; **tầm nhìn**: đội cạnh xe đội khác đang đạp không nhận nó, xe trống 1 km không tới, xe đứng yên của đội khác tới trong 250 m rồi `gone` khi bị đạp lại, không tin nào cho đội khác chứa xe đang đạp, Host nhận đủ; đi theo người đạp, offline đứng yên, bỏ 60 s → gone + notice; **đội online chưa có pose 60 tick → 0 dòng, 0 tin**; bãi đầy; Host release / remove / dữ liệu xấu; restart dựng lại. **Harness thật (workerd):** 2 đội `claim` cùng xe cùng lúc → đúng 1 `ok:true`, đội kia `taken`, dòng `bikes` + `events` của người thắng; `host.candidates` → `setAlarm` → alarm → đợt đầu tới Host.
- `spawnCandidates.test.ts` (đồ thị thật): 6 đoạn ≥ 12 điểm trong hành lang, cách mọi điểm ≥ 100 m (L2 → L3 không có bãi → mẫu vỉa hè); L3 → L4 toàn bãi xe; mồi ngoài mọi hành lang; tất định; tránh điểm nhiệm vụ.
- `Bikes.test.ts` (+5): applyServer giữ đối tượng / gone / full / màu đội; F → claim → ok lên xe, taken → `bikeLost`; xuống / ngã → `dismount` một lần; hết `claimTimeoutMs` thì F gửi lại; server lấy xe đang đạp → xuống; đặt xe lên đất trong `groundRadius`.

## Ponytail / giới hạn đã biết
- `park` không dời xe tới tọa độ giá để xe (Phase 7 có tọa độ bãi).
- Claim khi server chưa có pose của đội (ngay sau khi DO thức dậy, người đứng im) → `far`; đi một bước là hết.
- `VIEW_METERS` 250 / `CLAIM_REACH` / `OWN_REACH` là hằng trong worker (như `CLAIM_REACH` trước đây); nếu muốn chỉnh theo chặng thì chuyển vào khối `vehicles` của file chặng khi tích hợp.
- Hướng xe sinh ra ngẫu nhiên (DO không biết hướng phố); id Host `h<ms>` (2 lần thêm cùng 1 ms trùng id).
- Xe đi theo người đạp chỉ trong RAM; DO bị đẩy khỏi bộ nhớ lúc đang đạp → xe ở chỗ ghi cuối (chỗ nhận xe) cho tới tick kế **nếu chủ còn online**; chủ đã rời đi thì xe ở lại đó và có thể bị tính bỏ khi chủ vào lại xa > 200 m (`ponytail:` trong `tick`).
- Client `REMOTE_RIDER` (xe đội khác đang đạp) nay server không gửi nữa; giữ lại như phòng thủ + stand-in `?bikes=…ridden`.

## Người tích hợp cần làm (không có file nào của A / B / D bị sửa)
**RaceRoom (A)**: chữ ký đổi so với kế hoạch §5.2 (`tick` thêm `online`, thêm `forTeam`):
- Vòng tick (~1 lần / s): `this.bikes.tick(this.players(), this.online(), now)` (bản A đã có `online()` = đội có socket mở; `players()` = đội online có pose).
- `welcome`: `bikes: team ? this.bikes.forTeam(team.id, l ? { team: team.id, x: l.valid.x, z: l.valid.z } : null) : this.bikes.list()`. **Bắt buộc**: `list()` (mọi xe) chỉ cho Host (`host.state`); để `list()` trong welcome của đội là còn lộ.
- `welcome.pose.bikeId` = `this.bikes.list().find((b) => b.owner === team.id)?.id ?? null` (C không cập nhật `TeamState.bikeId`).
- `BikeIO.broadcast` nay không dùng (tùy chọn): bỏ dòng `broadcast:` khi nối cũng được. Socket Host phải mang tag `HOST` (nền đã có) vì C gửi Host bằng `send(HOST, …)`.
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

**Trang Host (D):** nút "Tính hành lang & gửi ứng viên" = `send({ t: 'host.candidates', ...spawnCandidates(await loadRoadGraph(), points, checkpoints, rules) })` (đồ thị qua `geo/roadGraph.ts`). Host vẫn nhận mọi `bikes` ngay.
**`scripts/sim.ts` (D):** bot không còn nghe broadcast `bikes` ngay khi Host thêm xe; bot nghe ở tick kế của nó (≤ `NET.slowTickMs` 1 s; gói đầu `full: true` có xe trong 250 m) → nâng thời gian chờ ở bước "hai bot nhận cùng xe" từ 1 500 lên ≥ 2 500 ms (hoặc lấy id từ tin `bikes` của socket Host) và sửa chú thích "reaches every socket in a `bikes` broadcast".

**Preset:** chụp lại `p6-bikes`, `p6-bike-lost` sau khi nối `bikes.notify` (lúc đó toast "Chậm một bước!" hiện); `ride-check` mặc định.

## Cách chạy test
`npm run build && npm test` (từ gốc worktree); `SCREENSHOT_PORT=5303 npm run screenshot -- p6-bikes p6-bike-lost`; `SCREENSHOT_PORT=5303 npm run ride-check`.
