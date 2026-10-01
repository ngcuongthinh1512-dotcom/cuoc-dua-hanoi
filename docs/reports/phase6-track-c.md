# Phase 6 – Track C: xe chung, nhận xe nguyên tử, xe bị bỏ

Trạng thái: **ĐANG LÀM** – bước 1–2 xong (VehicleSpawner + BikeService + test, worker 34 test qua); đang làm bước 3 (ứng viên Host).

## Đã làm
- Đọc: CLAUDE.md, `docs/plans/phase6.md` (toàn bộ), SPEC §6.1–6.6, `shared/src/protocol/*`, `worker/src/{RaceRoom,db,counters}.ts`,
  `worker/src/race/{VehicleSpawner,BikeService,leg}.ts`, `worker/src/test/harness.ts`, `client/src/vehicle/{Bikes,types}.ts` + test,
  `client/src/player/Player.ts` (placeBikes, interact), `client/src/main.ts` (NetClient nối sẵn), `shared/src/graph/*`.
- Symlink trong worktree (không commit): `node_modules`, `client|shared|worker/node_modules`, `.cache` → repo gốc.

## Còn lại (theo thứ tự)
1. `worker/src/race/VehicleSpawner.ts` (thuần) + `VehicleSpawner.test.ts`
2. `worker/src/race/BikeService.ts` + `BikeService.test.ts` (harness thật: 2 socket claim cùng xe → đúng 1 ok)
3. `client/src/host/spawnCandidates.ts` + test trên `shared/data/roadgraph.json` (6 đoạn demo)
4. `client/src/vehicle/Bikes.ts` chế độ server + test
5. preset `[C]` `p6-bikes`, `p6-bike-lost` trong `scripts/screenshot.ts`
6. `npm run build && npm test`, `SCREENSHOT_PORT=5303 npm run ride-check`, commit `feat(phase6): track C – …`

## Thiết kế đã chốt (để người làm tiếp khỏi suy lại)
**Spawner (thuần, tất định):**
- `stream(state)`: `rng(seed)` tua qua `state.draws` lần rồi mỗi lần rút `draws++` → restart nối tiếp đúng chuỗi.
- Id xe = `b<draws lúc tạo>` (duy nhất, tất định); Host thêm tay = `h<now>`, `segment −2`; mồi `segment −1`.
- Chọn điểm: đều trong các ứng viên không trong `noSpawnNearPlayerMeters` của đội online nào và không cách xe đang có < 3 m; hết điểm → bỏ.
- Đợt đầu: mỗi đoạn `n ∈ initialPerSegment` xe. Mồi **thêm** cho mỗi xe đoạn với kỳ vọng `r/(1−r)` (r = `decoyRatio`) → tỉ lệ mồi/tổng ≈ r, số xe mỗi đoạn vẫn đúng `initialPerSegment`. Trần xe mồi trống = số đoạn × `maxAvailablePerSegment` (không tích tụ).
- Định kỳ: đoạn có < `maxAvailablePerSegment` xe trống ngoài bãi (owner null, rack null) → xác suất `spawnChance` thêm 1.
- `claim(bike|undefined, team, at|null, walkOnly)`: undefined → `gone`; owner khác → `taken`; walkOnly → `walkOnly`; at null hoặc > 3,5 m (`bikeRules.interactRadius` 2,5 + 1 m trễ pose) → `far`.
- `abandoned`: cập nhật `nearOwnerAt` (chủ gần / offline / không có pose → `now`), trả id xe có chủ online cách > `abandonMeters` liên tục ≥ `abandonSeconds`. Khi DO nạp lại bảng `bikes`, `nearOwnerAt = now` (restart không làm mất xe ngay).

**BikeService:** cache `bikes` RAM nạp lười từ SQLite; meta `spawner` = `{seed, draws, paused, nextAt, initialDone}` (1 dòng), meta `candidates`.
- `host.candidates` → lưu, nếu chưa đợt đầu: `setAlarm(now)` → `alarm()` làm đợt đầu (kể cả khi chưa ai online), sau đó chỉ gắn lại khi `players.length > 0`.
- `tick()` (A gọi ~1 s): xe đang đạp theo vị trí chủ (RAM), xe bị bỏ → xóa dòng + event + `notice bikeGone` + broadcast `gone`; nếu có đội online, có ứng viên, không tạm dừng và `nextAt === null` → gắn alarm `spawnIntervalMinutes`.
- `claim` thắng: xe cũ của đội xóa (gone), ghi `bikes` + `events` **rồi** mới gửi `{t:'bike', op:'claim', ok}` + broadcast `bikes`. claim = lấy + lên xe (`rider: true`). `mount` (xe của mình) / `dismount` (mang x,y,z,yaw) cập nhật rider + vị trí, ghi 1 dòng, broadcast.
- Host `add` / `remove` / `release` (id hoặc theo `team`), `spawning` (paused). `park(team, rack)` cho Phase 7 (owner null, parked, sức chứa `bikeParking.maxBikes`, cũ nhất biến mất, `notice bikeParked`); ponytail: chưa dời xe tới tọa độ bãi (Phase 7 có tọa độ).

**Client `Bikes` (chế độ server, chỉ khi `net` được gán):** `team` thành id đội (bỏ `readonly`), `setTeams(teams)` → màu khóa, `ground?(x, z)` móc để đặt xe server (y = 0) lên mặt đất khi tới gần, `applyServer(list, gone?, full?)`, `onClaimResult(m)` trả mã toast (`bikeLost` / `bikeTooFar` / `walkOnly`) hoặc null, `interact` với xe trống → gửi `claim`, trả `'claiming'` (chờ ≤ `serverBikes.claimTimeoutMs`); xe của mình → lên ngay; `update()` đối chiếu trạng thái rider local với server → tự gửi `mount` / `dismount` (gồm cả ngã xe trong `Player.onDismount`, file của B). Xe người khác đang đạp → ẩn model (RemotePlayers vẽ). Offline (`net` không gán): y như Phase 4/5, ride-check không đổi.

**Ứng viên Host (`client/src/host/spawnCandidates.ts`):** mỗi đoạn A* `walk` giữa 2 điểm liên tiếp, `corridorEdges(width = corridorMeters)`; bãi xe `graph.file.bikeParking` trong `corridorMeters/2` của đường và cách mọi điểm ≥ `minDistanceFromCheckpoint` trước; thiếu `minCandidates` → lấy mẫu mỗi `candidateStep` m trên cạnh `sidewalk`/footway (không `bridge`/`steps`/`crossing`), chọn đều; decoys = mẫu vỉa hè toàn bản đồ ngoài mọi hành lang.

## Cần người tích hợp / track khác
- RaceRoom (A): gọi `bikes.tick(players, now)` ~1 s (kế hoạch đã ghi); `welcome.pose.bikeId` nên lấy từ xe có `owner === team` trong `bikes.list()` (TeamState.bikeId của A không được C cập nhật).
- main/Player (B): offline giữ `placeBikes`; online: bỏ `placeBikes`, `player.bikes.team = session.team.id`, `bikes.net = net`, `bikes.setTeams(w.teams)` + `applyServer(w.bikes, [], true)` ở welcome, `applyServer(m.list, m.gone, m.full)` ở `bikes`, `notice(bikes.onClaimResult(m))` ở `bike`, `bikes.ground = (x, z) => groundAt(world, x, z, env.heightAt(x, z) + 5)`.
- Toast `bikeLost` "Chậm một bước! Xe đã có người lấy." thuộc B (`ui/Toasts.ts`).

## Cách chạy test
`npm test` (worker: vitest + createTestHarness; client: vitest). Ride-check: `SCREENSHOT_PORT=5303 npm run ride-check`.
