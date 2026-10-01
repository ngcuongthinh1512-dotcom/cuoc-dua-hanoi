# Phase 6 – Server & presence: kế hoạch

Nguồn: SPEC §3 (kiến trúc Cloudflare, hạn mức – bắt buộc), §6.1–6.6 (tốc độ, xe chung, nhận xe nguyên tử, bãi xe, xe bị bỏ), §7 (presence), §8.10 (lưu tiến trình, vào lại), §10 (khối `movement` / `presence` / `vehicles` của file chặng), §13.1 / §13.5 / §13.9 (Host: tạo đội, lớp xe, cảnh báo gian lận), §14 (F3), §15 (Phase 6), §17.1, §17.10 (hộp mật thư theo bước, server không gửi tọa độ bước sau); CLAUDE.md "Server principles" + "Cloudflare quota budget"; TODO.md mục Phase 6 + các dòng nhắc Phase 6 (Phase 3: bảng tên chồng; Phase 4: xe server; Phase 5: hồi sinh phải báo server, chấm đội khác, ping); `docs/plans/phase5.md`, `phase4b.md` (mẫu).

## 1. Phạm vi

- **Có:**
  - Worker định tuyến **mỗi cuộc đua vào một Durable Object `RaceRoom`** (SQLite), bỏ room cố định `"dev"` và `/api/room/ping`;
  - đăng nhập **mã đội** / **mật khẩu Host** → token HMAC ký bằng `HOST_PASSWORD`; 1 thiết bị / đội; vào lại bằng mã đội đúng chỗ cũ (§8.10);
  - WebSocket **Hibernation API**, giao thức compact (`shared/src/protocol`), vị trí 5 Hz chỉ khi đổi, **1 tick broadcast / 200 ms**, chỉ đội trong 500 m;
  - ghi SQLite theo lịch (snapshot mọi đội 1 dòng / 2 s + ngay khi ngắt, replay 1 dòng / 10 s, sự kiện ghi ngay trước khi ack), dựng lại từ SQLite khi DO khởi động, Alarm đặt xe chỉ khi có người online, bộ đếm quota;
  - kiểm tra tốc độ phía server (cửa sổ 3 s, dư 25 %, `respawn` hợp lệ) → đánh dấu cho Host;
  - người chơi khác: nội suy snapshot, `CharacterModel` + `CharacterAnimator` + bảng tên, ghost, `G` vẫy / `R` chuông qua mạng, xe của người khác;
  - **xe chung**: `VehicleSpawner` (DO chỉ chọn ngẫu nhiên trong ứng viên Host gửi), nhận xe nguyên tử, tối đa 1 xe / đội, xe bị bỏ 200 m / 60 s biến mất, offline giữ xe, hàm đưa xe vào bãi (Phase 7 gọi), `transport.mandatory = 'walk'` chặn lên xe (hook, Phase 7 cấp bước hiện tại);
  - **kênh hộp mật thư theo đội** (§17.10, chốt 2026-10-01): server chỉ gửi tọa độ hộp hiện tại khi đội vào `boxReveal.radius` (150 m), thu lại khi ra xa hơn bán kính + hysteresis; giao thức + kiểm tra khoảng cách ở server làm ở Phase 6, vẽ hộp + logic bước ở Phase 7;
  - F3: ping + số người chơi đang thấy; camera bay chỉ Host / khán giả / đội về đích;
  - bỏ qua tham số URL thử nghiệm (`?player=`, `action`, `autoMove`, `jump`, `bike`, `autoTurn`, `?cam=`) khi đã vào cuộc đua;
  - dev loop: Vite proxy `/api` + WebSocket sang `wrangler dev`; test DO bằng `createTestHarness`; bot `npm run sim` tối giản; **trang Host tối giản** (tạo đội, mã, online, bộ đếm) để có mã đội mà chơi.
- **Không có (để sau):**
  - Phase 7: nạp chặng vào SQLite (zod), máy trạng thái, geofence, hộp mật thư theo bước (§17.10: `welcome` chỉ mang hộp ≤ bước hiện tại), đồng hồ đua của server, bãi xe cạnh điểm **được kích hoạt** (Phase 6 chỉ có hàm `park`), ZonePanel "Tại điểm này" (cần bước / vùng của §8 – ở Phase 6 chưa có vùng nào để liệt kê);
  - Phase 9: phạt bắt buộc đi bộ từ kết quả kiểm tra tốc độ;
  - Phase 10: màn hình Host đầy đủ (bản đồ, lớp xe, công cụ, nhật ký);
  - Phase 11: bot đủ 10 bước; Phase 12: đo request / dòng ghi thật so với ngân sách.
- Minimap **không** vẽ đội khác (`showOthersOnMinimap: false`, §7) → không code.

## 2. Kiểm tra đầu vào (đo ngày 2026-10-01)

### 2.1 Công cụ test Durable Object
- `@cloudflare/vitest-pool-workers` 0.22.0 (mới nhất, 2026-09-18) có `peerDependencies.vitest ^4.1.0`; dự án chạy **Vitest 5.0.2** → không dùng được.
- **wrangler 4.141.0 có sẵn `createTestHarness`**: workerd + DO + SQLite + R2 giả lập trong tiến trình, `server.fetch()`, `getWorker().getDurableObjectStorage(cls, {name}).exec(sql)`, `evictDurableObject(cls, {name, webSockets: 'close' | 'hibernate'})`. Dùng được thẳng `worker/wrangler.toml` (`configPath` + `secrets` ghi đè `.dev.vars`; thư mục `client/dist` chỉ cần tồn tại). Test smoke 8 bước đầu-cuối chạy ≈ 0,4 s. **Không cài package mới.**
- Node 24 có `WebSocket` toàn cục; close code ứng dụng (4401…) tới được client Node.
- Miniflare: WebSocket hibernation được giả lập (`webSocketMessage` chạy sau khi dựng lại) nhưng DO **không bao giờ bị đẩy khỏi bộ nhớ** ở local → kiểm tra "dựng lại từ SQLite" bằng `evictDurableObject`.

### 2.2 Giá Cloudflare (tài liệu, cập nhật 2026-09-30)
- Request DO: HTTP, mở WebSocket (1), alarm (1), **tin WS gửi lên 20 : 1**; **tin gửi xuống không tính**; ping giao thức WS và trả lời tự động `setWebSocketAutoResponse` không tính, không đánh thức DO.
- Giờ chạy: tính khi DO thức hoặc không ngủ được; `setTimeout` / `setInterval` / request đang chờ ngăn hibernation. Free 13 000 GB-s/ngày = ≈ 28 h một DO 128 MB.
- SQLite: Free 100 000 dòng ghi/ngày, 5 triệu dòng đọc/ngày, 5 GB; **mỗi index chạm tới = thêm 1 dòng ghi**, xóa cũng là ghi, `setAlarm()` = 1 dòng ghi. Workers Free: 100 000 request/ngày; request static asset không tính.

### 2.3 Kích thước tin (JSON, đo bằng Node)
| Tin | Dạng | Byte |
|---|---|---|
| `pos` (type, x, y, z cm, yaw mrad, mode, action) | mảng 7 số | **31** |
| `tick` 20 đội | mảng số theo slot | **627** |
| `tick` 20 đội | object có tên trường | 2 075 |
| dòng snapshot 20 đội | JSON | 855 |

### 2.4 Hành lang xe (`roadgraph.json` 2,3 MB, Node, Apple Silicon)
| Đoạn | A* | Hành lang 150 m (cạnh bike) | Ứng viên `bicycle_parking` cách điểm ≥ 100 m | Thời gian |
|---|---|---|---|---|
| start → L1 | 2 096 m | 2 012 cạnh / 32,3 km | 11 | 10,5 ms |
| L1 → L2 | 1 549 m | 1 349 / 23,6 km | 11 | 4,8 ms |
| L2 → L3 | 879 m | 580 / 11,0 km | **0** | 1,9 ms |
| L3 → L4 | 1 694 m | 1 313 / 28,1 km | 16 | 2,5 ms |
| L4 → L5 | 1 000 m | 582 / 11,6 km | 5 | 1,1 ms |
| L5 → L6 | 1 109 m | 607 / 11,7 km | 2 | 1,9 ms |
- Giải mã đồ thị 27 ms. Tính trong trình duyệt Host là hiển nhiên (§3: không A* trong DO). Có đoạn **không có bãi xe** → ứng viên dự phòng: điểm lấy mẫu trên vỉa hè / lề trong hành lang. Danh sách ứng viên cả chặng vài KB.

### 2.5 Code hiện có
- `RaceRoom` chỉ `SELECT 1`; `index.ts` room cố định `dev`; `wrangler.toml` đã có `new_sqlite_classes`, R2 `MEDIA`, `compatibility_date 2026-09-25` (≥ 2026-04-07: tự trả lời Close frame).
- `PlayerState` (`position`, `velocity`, `yaw`, `moveMode`, `action`, `actionTime`, `jumps`, `grounded`, `inWater`) đủ để dựng lại người chơi khác; `CharacterAnimator` tua gesture theo `actionTime` (tất định); `CharacterModel` nhận `{shirt, name}`; `BikeModel.update(state, sparkle, dt)` + `riderTargets()` dùng được cho người đạp xe từ xa; `Bikes.list` / `BikeState.owner` / `rider` đã có chỗ cho server.
- `CharacterController.respawn()` trả `'safe' | 'stairs'` (TODO Phase 5: server phải biết); `spawn(x, z, yaw)` dùng cho vào lại; `movement` trong `config.ts` là object sửa được (`welcome.movement` ghi đè).
- `Player.create` nay giữ `assets` (character + bike) để `RemotePlayers` clone cùng asset.
- `vite.config.ts` chưa có proxy; chỉ `index.html` được build (trang Host cần `rollupOptions.input`).

## 3. Quyết định

1. **Package: không thêm.** `zod` để Phase 7 (schema chặng).
2. **Định tuyến: mỗi cuộc đua = 1 DO tên theo mã cuộc đua.** `env.RACE_ROOM.getByName(race)`; `race` = `/^[a-z0-9][a-z0-9-]{0,31}$/` lấy từ **link của Host** (`/?race=paris-2026`), mặc định `net.defaultRace = 'paris'`. Người chơi vẫn chỉ gõ mã đội (§7); mã đội chỉ cần duy nhất trong cuộc đua. Lý do: không cần DO "danh bạ" mã đội → cuộc đua, không cần KV; một sự kiện = một link.
3. **Đăng nhập + token.** `POST /api/login {race, code}` → DO kiểm mã (không phân biệt hoa thường), 5 lần sai → khóa 60 s theo IP (`CF-Connecting-IP`, nhớ trong RAM); `{race, host: password}` → Worker so sánh hằng thời gian với `HOST_PASSWORD`. Token = `b64url({r, t, e}).b64url(HMAC-SHA256)` ký bằng `HOST_PASSWORD` (`worker/src/auth.ts`), hạn 24 h, **DO tự kiểm khi mở WebSocket** (`r` phải trùng cuộc đua). Mã đội 6 ký tự, bảng chữ không có 0/O/1/I, DO sinh bằng `crypto.getRandomValues`.
4. **WebSocket Hibernation API** (`ctx.acceptWebSocket(ws, [role, teamId])`, `serializeAttachment({role, team})`, `webSocketMessage/Close/Error`). Lý do: không tính giờ khi mọi người đứng im / Host để tab mở qua đêm; sau khi thức dậy `getWebSockets()` + attachment dựng lại bảng kết nối, mọi thứ khác đọc SQLite. **Một thiết bị / đội:** socket mới cùng `teamId` → socket cũ nhận `{t:'kick', reason:'otherDevice'}` rồi đóng 4409. Token sai → chấp nhận rồi đóng 4401 (trình duyệt thấy mã, một response 401 chỉ cho "failed").
5. **Giao thức compact** (`shared/src/protocol`, nền đã viết đủ + test):
   - `pos` = `[1, x_cm, y_cm, z_cm, yaw_mrad, mode, action]` (31 B); mode / action là chỉ số trong `MOVE_MODES` / `PLAYER_ACTIONS` (client `player/types.ts` nay lấy kiểu từ đây). Không gửi timestamp (server đóng dấu lúc nhận, không tin đồng hồ client), không gửi id xe (server biết đội giữ xe nào; `mode === 'bike'` = đang ngồi).
   - `tick` = `[2, serverMs, (slot, x, y, z, yaw, mode, action)…]`, slot = số thứ tự đội trong `welcome.teams` (không lộ id). Mỗi client nhận **đội online trong `NET.interestRadius` 500 m**, không có chính mình; Host nhận tất cả. Lý do 500 m ngoài băng thông: vị trí đội khác tiết lộ lộ trình (cùng lý do minimap không hiện đội khác).
   - JSON có `t` cho phần còn lại (`welcome`, `kick`, `team` online/offline, `bikes`, `bike` kết quả claim, `gesture`, `notice`, `host.state`; lên: `respawn`, `gesture`, `bike`, `host.*`). Tin gửi xuống không tính phí nên JSON là đủ; chỉ tin **gửi lên** lặp 5 Hz mới cần compact (số lượng tin mới là thứ tính phí, không phải byte).
   - Kiểm tra ở biên tin cậy: `parseFrame` (≤ 1 024 B đội, ≤ 256 KB Host), `decodePose` (số nguyên, trong ±10 km, y ∈ [−100, 1 000] m, chỉ số hợp lệ), `isClientMessage(m, role)` (Host op từ đội → đóng 4400); > 15 tin/s/socket → đóng 4429. `PROTOCOL_VERSION` trong `welcome`; lệch → client "Phiên bản game đã đổi, hãy tải lại trang".
6. **Tần số + tick + ngủ.** Client gửi `pos` khi `encodePose` khác lần trước (làm tròn cm nên đứng im = không gửi), tối đa `NET.sendHz` 5. Server: chuỗi `setTimeout` 200 ms **chỉ chạy khi có tin vị trí trong `idleStopMs` 10 s**, mỗi tick gửi cho từng socket tập đội trong 500 m **chỉ khi có đội nào đổi** (đội online đứng im vẫn nằm trong tick vì tick là "ảnh" chứ không phải "diff"). Không dùng Alarm 200 ms (mỗi alarm = 1 request). Keepalive: client gửi `ping` mỗi 5 s, `setWebSocketAutoResponse('ping' → 'pong')` trả lời không đánh thức, không tính phí; round trip = ping ở F3; server xem `getWebSocketAutoResponseTimestamp(ws)` để biết socket còn sống.
7. **Lịch ghi SQLite** (`worker/src/db.ts`, bảng ở §5.4):
   - `events`: ghi **ngay, trước khi trả lời** (đăng nhập, kết nối, ngắt, nhận xe, xe biến mất, respawn, vi phạm tốc độ, lệnh Host) – bảng + 1 index `(team, t)` = 2 dòng/sự kiện;
   - `snapshot` (id = 1): vị trí hợp lệ cuối của **mọi** đội + bộ đếm quota, **1 upsert / 2 s khi có đổi** và **ngay khi một đội ngắt** (§8.10);
   - `replay`: 1 dòng / 10 s;
   - `teams.state` (JSON: xe giữ, đang ngồi, số lần vào lại, lastSeen; Phase 7 thêm bước): khi đổi;
   - `bikes`: 1 dòng / xe khi đổi trạng thái; `meta`: status, seed, ứng viên, schema.
   - Bộ đếm (`counters.ts`: wsIn, wsOut, http, alarms, rows; `billableRequests = http + alarms + ⌈wsIn/20⌉`) nằm **trong dòng snapshot** → không thêm dòng ghi.
8. **Dựng lại khi khởi động:** constructor chỉ `migrate` + nạp bộ đếm; handler đọc `teams` / `snapshot` / `bikes` lười (cache RAM, làm mới khi ghi). Sau restart `welcome.pose` lấy từ snapshot (đội vào lại đúng chỗ, §8.10). Test: `evictDurableObject` rồi kết nối lại.
9. **Alarm:** chỉ cho đặt xe định kỳ (`vehicles.spawnIntervalMinutes`), **gắn lại chỉ khi còn đội online** (SPEC §3: không vòng lặp khi không ai kết nối; xe không tích tụ lúc nghỉ). 40 alarm / 2 h.
10. **Kiểm tra tốc độ** (`shared/src/protocol/speed.ts`, thuần, test): đường đi cộng dồn trên cửa sổ 3 s (đóng dấu lúc server nhận) / thời gian; giới hạn = `footSpeed` (đi bộ) hoặc `footSpeed × bikeSpeedMultiplier` (`mode === 'bike'`) × 1,25; chưa xét khi cửa sổ < 1,5 s (bước KCC lẻ 4,8 m/s không bị tính). `{t:'respawn', x, y, z, yaw, how}` (từ `CharacterController.respawn()` và rơi xuyên thế giới) reset cửa sổ + ghi sự kiện; nhảy > `maxRespawnJump` 400 m ghi "đáng ngờ". Vượt tốc → `events` + `flagged` trong `host.state` (đỏ ở Host, **không tự phạt**, §13.9); Phase 9 dùng cùng cửa sổ để phạt bắt buộc đi bộ. "Vị trí hợp lệ gần nhất" ghi snapshot = vị trí cuối qua được kiểm tra. Server **không** đẩy client về (chưa reconciliation).
11. **Vào lại (§8.10):** login trả `summary` (số lần vào lại, lastSeen, raceTime null tới Phase 7) → màn "Chào mừng trở lại, Đội Xanh!" → "Tiếp tục" → `welcome.pose` (x, y, z, yaw, bikeId) → `controller.spawn` tại đó (chỗ cũ không hợp lệ → `place()` dò xoắn ốc 20 m như hiện có); đang giữ xe → xe hiện ở chỗ server ghi, `riding` → lên xe lại. Mã đội nhớ trong `localStorage` (try/catch), vẫn phải bấm "Vào lại".
12. **Ngắt kết nối / đóng tab:** `webSocketClose` / `Error` → nếu không còn socket khác của đội: `teams.state.lastSeen`, snapshot ngay, `events`, broadcast `{t:'team', online:false}` (đội biến mất khỏi thế giới người khác, §7). Socket "chết im" (không `ping` 30 s) → vòng tick đóng. Client: reconnect backoff `netClient.reconnectMs`, token còn hạn nên không đăng nhập lại; `kick` → dừng + thông báo.
13. **Người chơi khác (client):** mỗi slot một `PlayerState` giả + `CharacterModel` (áo màu đội, bảng tên) + `CharacterAnimator`, không body Rapier (ghost). Buffer tick theo `serverMs`, vẽ ở `serverNow − remote.interpolationMs` (200 ms), nội suy tuyến tính vị trí / yaw ngắn nhất, ngoại suy ≤ 150 ms rồi giữ; nhảy > `snapDistance` 10 m → đặt thẳng; `action` đổi → `actionTime` chạy lại từ 0 (gesture tất định); `velocity` suy từ 2 mẫu (cho clip chạy / đi); `mode === 'bike'` → thêm `BikeModel` của người đó (lean suy từ tốc độ quay yaw, không có trên dây), `setRider`; ẩn ngoài `presence.renderRadius`, bảng tên theo `character.nameTag.maxDistance`. `G` / `R` của người khác → `gesture` broadcast (R chỉ phát tiếng chuông trong 60 m). Chấm đội khác trên minimap: không (§7).
14. **Xe chung** (`worker/src/race/VehicleSpawner.ts` thuần + `BikeService.ts` ghép, §6.2–6.4):
    - **Ứng viên tính ở Host** (`client/src/host/spawnCandidates.ts`, dùng `@race/shared/graph`): mỗi đoạn A* đi bộ giữa hai điểm, hành lang `corridorMeters`; ứng viên = `bikeParking` trong hành lang cách mọi hộp / điểm thử thách ≥ `minDistanceFromCheckpoint` (bãi xe trước), bổ sung điểm lấy mẫu mỗi `serverBikes.candidateStep` m trên cạnh vỉa hè / footway của hành lang (không cầu, không bậc, không `tunnel` – đồ thị đã bỏ hầm) cho đủ `minCandidates`; `decoys` = điểm trên các phố ngoài mọi hành lang. Gửi `host.candidates` (vài KB), DO lưu vào `meta`.
    - **DO chỉ chọn ngẫu nhiên** (mulberry32 từ `seed` lưu trong `meta`, `draws` lưu để restart nối tiếp): đợt đầu `initialPerSegment` mỗi đoạn; mỗi alarm: đoạn có < `maxAvailablePerSegment` xe trống ngoài bãi → xác suất `spawnChance` thêm 1; xe mồi theo `decoyRatio`; không trong `noSpawnNearPlayerMeters` quanh đội online nào (vị trí từ `live`). Mọi lần sinh / nhận / để bãi / lấy lại / biến mất → `events` (§6.2 (7)).
    - **Nhận xe nguyên tử:** DO xử lý tin tuần tự → tin `claim` tới trước thắng; kiểm tra: xe còn (không gone), `owner ∈ {null, đội}`, đội cách xe ≤ `bikeRules.interactRadius` + 1 m (theo `live`), bước hiện tại không bắt buộc đi bộ (hook `walkOnly`, Phase 7 cấp); thắng → ghi `bikes` + `events` rồi mới trả `{t:'bike', op:'claim', ok:true}` và broadcast `bikes`; thua → `ok:false, reason` → client toast "Chậm một bước! Xe đã có người lấy." Xe cũ của đội biến mất (`maxPerPlayer`). `mount` / `dismount` cập nhật `rider` + vị trí xe (dismount mang vị trí xe đứng).
    - **Xe bị bỏ:** trong vòng tick (1 lần/s): chủ online cách > `abandonMeters` liên tục ≥ `abandonSeconds` → gone + `notice bikeGone`; chủ offline không tính (§6.3). `park(team, rack)` + sức chứa `bikeParking.maxBikes` (cũ nhất biến mất) viết sẵn cho Phase 7.
    - **Client (`vehicle/Bikes.ts` chế độ server):** `list` dựng từ `welcome.bikes` + `bikes` delta; `F` → `claim` gửi đi, trạng thái "đang xin" ≤ `claimTimeoutMs`, kết quả → `take` + `ride`; xe đội khác → toast sẵn có `bikeTaken`; offline giữ nguyên xe thử của Phase 4. Hiển thị xe người khác đang đạp: §3.13.
15. **Camera bay / tham số thử:** online, với token đội: `V` bị bỏ qua, `parseOverrides` chỉ giữ `npc*`; `?cam=` khán giả cần token Host hoặc offline. Đội về đích (Phase 7) sẽ được bay.
16. **Dev loop:** `npm run dev:api` = `wrangler dev` (:8787, không build client; `client/dist` tạo rỗng nếu thiếu) + `npm run dev` (Vite :5173, proxy `/api` kể cả WebSocket). PROD (bundle do Worker phục vụ) cùng origin. Không dùng `@cloudflare/vite-plugin` (thêm package, đổi cả pipeline Vite; proxy 1 dòng là đủ).
17. **Offline = như hiện nay:** dev server không có `?race=`, hoặc `?offline=1` → `startSession` trả `null`: không mạng, xe thử, mọi preset ảnh / `ride-check` / test không đổi. Online: `?race=` hoặc build PROD.
18. **Bảo mật:** nội dung chặng chỉ ở `worker/legs` + SQLite (Phase 6 server chỉ gửi `movement` / `presence`); token theo cuộc đua + đội, DO chỉ gửi cho socket có tag đội đó (`getWebSockets(teamId)`), tick lọc theo 500 m, Host op bị từ chối với token đội; không tin đồng hồ / vị trí client (speed check, đóng dấu server); giới hạn kích thước / tần suất tin.
19. **Trang Host tối giản (D)** chỉ để chạy Phase 6–9: đăng nhập, mã cuộc đua, tạo đội (tên, màu, tên người chơi) → bảng mã (copy), online/offline + lastSeen + số lần vào lại, bộ đếm quota (wsIn, wsOut, rows, alarms, request ước tính), số xe, nút "Tính hành lang & gửi ứng viên", tạm dừng đặt xe, danh sách vị trí (lat/lon). Phase 10 thay bằng §13 đầy đủ.
20. **Hộp mật thư hiện theo khoảng cách (§17.10, chốt 2026-10-01: 150 m):**
    - **Kênh riêng theo đội:** `send(team, m)` = mọi socket mang tag `teamId` (`ctx.getWebSockets(teamId)`); không bao giờ broadcast tọa độ hộp. Tin: `{ t:'box', op:'reveal', box:{ step, x, z, opened } }` khi đội vào bán kính; `{ t:'box', op:'hide', step }` khi ra xa hơn `radius + hysteresis` (`shared/src/protocol/reveal.ts` `boxVisible`, thuần, test: qua ranh giới chỉ đổi 1 lần, không nhấp nháy). Chỉ gửi `x, z`: server không có DEM, client đặt hộp lên mặt đất mình có. Hộp các bước đã mở không bao giờ bị thu; hộp bước sau không bao giờ gửi.
    - **Server kiểm tra** trong vòng tick mỗi `NET.boxCheckMs` 2 s cho từng đội online: 1 phép `hypot` giữa pose cuối (`live`) và hộp hiện tại (Phase 7: bước hiện tại từ `teams.state`; Phase 6 A thử với điểm `destination` của L1 từ `demoLeg` để test được) → so với trạng thái `revealed` trong RAM; sau khi DO thức dậy, kiểm tra kế tiếp gửi lại `reveal` nếu đang ở trong (client khi reconnect thay danh sách bằng `welcome.boxes`). Không ghi SQLite (mốc `arrived_at` của §8.1 là geofence 15–40 m, Phase 7 ghi riêng).
    - **`welcome.boxes`:** hộp đã mở của đội + hộp hiện tại nếu pose đã lưu nằm trong bán kính.
    - **Quota:** chỉ tin gửi xuống (miễn phí), 20 phép hypot / 2 s, 0 dòng SQLite → ngân sách §9 không đổi. Hysteresis 20 m chặn chuỗi reveal/hide khi đi dọc ranh giới.
    - **Client (Phase 7):** hộp là vật thể 3D thường (nhà che, quay lưng thì không thấy). 150 m nằm trong tầm sương tối thiểu (`render.fog.near` 250 m) và bán kính tải chunk (800 m) nên không cần vật liệu chống sương; nếu bán kính file chặng đặt > 250 m thì cờ / ánh sáng của hộp phải `fog: false`. Người chơi kỹ thuật vẫn đọc được tọa độ sau khi vào bán kính (SPEC chấp nhận).
    - Cấu hình trong file chặng: `boxReveal: { radius: 150, hysteresis: 20 }` (đã thêm vào `paris-demo.json`; `legRules().boxReveal` có mặc định).
21. **Người điều phối cần ghi vào SPEC §17:** xem `docs/reports/phase6-plan.md` (mục cuối).

## 4. Nền (foundation, đã commit trước khi chia track)

| File | Nội dung |
|---|---|
| `shared/src/protocol/{constants,types,codec,speed,reveal,index}.ts` (+ `codec.test.ts`, `speed.test.ts`, `reveal.test.ts`) | **đầy đủ**: `NET`, `CLOSE`, kiểu tin (kể cả `box`, `BoxInfo`), `encodePose/decodePose/samePose`, `encodeTick/decodeTick`, `parseFrame`, `isClientMessage`, `SpeedWindow/overSpeed`, `boxVisible`; export `@race/shared/protocol` |
| `worker/legs/paris-demo.json`, `worker/src/race/leg.ts` | khối `boxReveal { radius 150, hysteresis 20 }` (§17.10); `legRules()` trả `boxReveal` có mặc định |
| `client/src/player/types.ts` | `MoveMode` / `PlayerAction` lấy từ protocol (một nguồn) |
| `worker/src/auth.ts` (+ test) | token HMAC, `constantTimeEqual` |
| `worker/src/db.ts` | schema v1 + `migrate`, `getMeta/setMeta`, `addEvent`, kiểu dòng |
| `worker/src/counters.ts` | `QuotaCounters` |
| `worker/src/race/leg.ts` | import server-only `legs/paris-demo.json` → `legRules()` (movement, presence, vehicles) |
| `worker/src/race/VehicleSpawner.ts`, `race/BikeService.ts` | **stub C**: kiểu `ServerBike`, `SpawnCandidates`, `PlayerSpot`, `SpawnerState`, `rng`; chữ ký `initialSpawn`, `periodicSpawn`, `claim`, `abandoned`; `BikeService` (`list`, `onTeam`, `onHost`, `alarm`, `tick`, `park`, `spawning`) đã ghép vào `RaceRoom` |
| `worker/src/RaceRoom.ts` | khung thật: migrate, login (+ khóa 5 lần), upgrade (token, 1 thiết bị, attachment, `welcome`), `webSocketMessage` (parse + kiểm tra + đóng mã), `gesture` broadcast, `host.createTeams`, `host.state`, `alarm` → `BikeService`, `players()`, `send/broadcast` đếm, `live` tạm (**A** thay bằng tick / snapshot / speed) |
| `worker/src/index.ts` | `/api/health` (v), `POST /api/login`, `GET /api/race/:race/ws`; bỏ `dev` / `ping` |
| `worker/src/test/harness.ts`, `RaceRoom.test.ts` | `raceHarness()` (wrangler.toml + secret test), `login()`, `openSocket()` (hàng đợi tin, `next<T>()`); 8 test đầu-cuối |
| `client/src/net/session.ts`, `NetClient.ts`, `RemotePlayers.ts` | **stub B** đúng chữ ký (offline) |
| `client/src/main.ts`, `player/Player.ts`, `ui/DebugOverlay.ts` | `startSession` → `NetClient` + `RemotePlayers` nối sẵn (welcome → `movement`, teams; tick → apply; team/gesture), `sendPose` mỗi khung, dòng "Mạng:" F3; `Player.assets` |
| `client/src/config.ts` | khối Phase 6 (§5.3) |
| `client/vite.config.ts`, `package.json`, `worker/package.json` | proxy `/api` (ws), `npm run dev:api` |
| `scripts/screenshot.ts` | khối `p6-*` rỗng, mỗi track một dòng `[A]` … `[D]` |

- Stub giữ hành vi cũ: `startSession` luôn offline; `npm run build && npm test` qua (worker 17, shared 22, client 539, scripts 18); `p5-debug`, `p4-mount` chụp lại không lỗi.
- Mỗi track làm trong git worktree riêng từ commit nền. `SCREENSHOT_PORT`: A –, B 5176, C 5177, D 5178; `wrangler dev --port`: A 8787, C 8788, D 8789.

## 5. Interface (track giữ nguyên chữ ký; đổi thì báo người tích hợp)

### 5.1 `shared/src/protocol` (nền; đổi hình dạng tin = `PROTOCOL_VERSION + 1`)

```ts
MOVE_MODES = ['walk','slow','swim','air','bike']; PLAYER_ACTIONS = ['none','wave','openBox','celebrate','crash','climbOut']
interface PoseSample { x; y; z; yaw; mode: MoveMode; action: PlayerAction }        // m, rad
TAG = { pos: 1, tick: 2 }
// lên:  [1, x_cm, y_cm, z_cm, yaw_mrad, mode, action]
//       { t:'respawn', x, y, z, yaw, how:'safe'|'stairs'|'fell' } · { t:'gesture', g:'wave'|'bell' }
//       { t:'bike', op:'claim'|'mount'|'dismount', id, x?, y?, z?, yaw? }
//       Host: { t:'host.createTeams', teams:[{name, colour, player?}] } · { t:'host.candidates', segments: number[][], decoys: number[] }
//             { t:'host.bike', op:'add'|'remove'|'release', id?, x?, z?, team? } · { t:'host.spawning', paused }
// xuống: [2, serverMs, (slot, x, y, z, yaw, mode, action)…]
//       Welcome { t:'welcome', v, race, serverMs, status, role, team?, teams: TeamInfo[], movement, presence{renderRadius, showOthersOnMinimap, interestRadius}, pose: (PoseSample & {bikeId}) | null, raceTime, bikes: BikeInfo[], boxes: BoxInfo[] }
//       { t:'kick', reason } · { t:'team', slot, online } · { t:'bikes', list, gone?, full? } · { t:'bike', op:'claim', id, ok, reason? }
//       { t:'gesture', slot, g } · { t:'notice', code: 'bikeLost'|'bikeGone'|'bikeParked'|'walkOnly' } · HostState { t:'host.state', … counters, bikes, spawning }
//       riêng từng đội (§17.10): { t:'box', op:'reveal', box: BoxInfo{step, x, z, opened} } · { t:'box', op:'hide', step }
NET = { sendHz 5, tickHz 5, interestRadius 500, snapshotMs 2000, replayMs 10000, idleStopMs 10000, speedWindowMs 3000, speedTolerance 1.25,
        maxRespawnJump 400, boxCheckMs 2000, maxPlayerBytes 1024, maxHostBytes 262144, maxMessagesPerSec 15, ping/pong, pingMs 5000, tokenTtlMs 24h, loginAttempts 5, loginLockMs 60000, codeLength 6, codeAlphabet }
CLOSE = { badToken 4401, otherDevice 4409, tooBig 4413, tooFast 4429, badMessage 4400, raceClosed 4410 }
encodePose(p): number[]; decodePose(m): PoseSample | null; samePose(a, b); encodeTick(serverMs, entries); decodeTick(m)
parseFrame(raw, maxBytes): unknown | null; isClientMessage(m, role): boolean
class SpeedWindow { push(t, x, z); reset(t, x, z); readonly span; readonly speed }; overSpeed(w, limit, tolerance?)
boxVisible(wasVisible, distance, r: BoxReveal = DEFAULT_BOX_REVEAL {radius 150, hysteresis 20}): boolean
```

### 5.2 Các module

```ts
// worker/src/auth.ts (nền)   signToken(secret, claims) · verifyToken(secret, token, race, now?) · newClaims(race, team, now?) · constantTimeEqual · HOST
// worker/src/db.ts (nền)     migrate(sql) · getMeta / setMeta · addEvent(sql, t, team, type, data) · TeamRow / EventRow
// worker/src/RaceRoom.ts (A) fetch(/login, /ws) · webSocketMessage / Close / Error · alarm · (A thêm) tick loop, snapshot, replay, SpeedWindow/đội, respawn, flagged, host.state đẩy ≤ 1 s
// worker/src/race/BikeService.ts (C)
class BikeService { constructor(io: BikeIO); list(): BikeInfo[]; onTeam(team, at: PlayerSpot | null, m, walkOnly, now); onHost(m, now); alarm(players, now); tick(players, now); park(team, rack, now); readonly spawning }
interface BikeIO { sql; counters; cfg: VehiclesConfig; send(team, m); broadcast(m); setAlarm(atMs) }
// worker/src/race/VehicleSpawner.ts (C, thuần)
initialSpawn(cfg, cands, state, players, now): ServerBike[]; periodicSpawn(cfg, cands, state, bikes, players, now): ServerBike[]
claim(bike, team, at, walkOnly, now): ClaimResult; abandoned(cfg, bikes, players, now): string[]; rng(seed)

// client/src/net/session.ts (B)   startSession(query): Promise<Session | null>   // Session { race, token, role, team?, summary?, welcome? }
// client/src/net/NetClient.ts (B)
class NetClient { constructor(session, events: NetEvents); connect(); close(); sendPose(p); send(m); readonly connected; rtt; stats; serverNow() }
interface NetEvents { welcome(w); tick(serverMs, entries); message(m); status(connected, reason?) }
// client/src/net/RemotePlayers.ts (B)
class RemotePlayers { constructor(scene, asset: CharacterAsset, bikeAsset: BikeAsset | null, renderRadius); setTeams(teams); setOnline(slot, online); apply(serverMs, entries); gesture(slot, g); update(dt, serverNow, viewer); readonly count; dispose() }
// client/src/ui/Login.ts (B)      login(race): Promise<Session>   // form mã đội / Host, nhớ mã, "Chào mừng trở lại", "Tiếp tục"
// client/src/vehicle/Bikes.ts (C, thêm)  applyServer(list: BikeInfo[], gone?: string[]); onClaimResult(m); interact(c) → thêm 'claiming'; net?: { send(m) }
// client/src/host/spawnCandidates.ts (C, thuần)  spawnCandidates(graph, points: {x, z}[], checkpoints: {x, z}[], cfg): { segments: number[][]; decoys: number[] }
// client/src/host/main.ts (D)      trang /host.html
// scripts/sim.ts (D)               npm run sim -- --bots 3 --minutes 2 [--url http://localhost:8787]
```

Thứ tự trong một khung (`main.ts`, đã nối): `player.update` → `net.sendPose(poseOf())` → `remote.update(dt, net.serverNow(), camera.position)` → HUD. Server: `webSocketMessage` (pose → live + SpeedWindow) → tick 200 ms (gửi, abandonment 1 s, snapshot 2 s, replay 10 s, host.state ≤ 1 s).

### 5.3 Khối config Phase 6 (nền viết khung, mỗi track chỉnh khối mình)

```ts
// Foundation
export const net = { defaultRace: 'paris', apiBase: '/api' };
// A: không có (NET trong shared/src/protocol/constants.ts + file chặng)
// B
export const netClient = { reconnectMs: [1000, 2000, 4000, 8000, 15000], storageKey: 'cuoc-dua-paris.team-code' };
export const remote = { interpolationMs: 200, extrapolateMs: 150, snapDistance: 10 };
// C
export const serverBikes = { claimTimeoutMs: 2000, candidateStep: 25, minCandidates: 12 };
// D
export const hostPage = { refreshMs: 1000 };
```

### 5.4 Bảng SQLite (`worker/src/db.ts`, schema v1)

| Bảng | Cột | Ghi khi |
|---|---|---|
| `meta` | `key PK, value` | race, status, schema, seed, draws, candidates, spawning |
| `teams` | `id PK, code UNIQUE, slot, name, colour, player, created_at, state(JSON)` | tạo đội (2 dòng: + index code), đổi `state` (1) |
| `snapshot` | `id = 1, t, data(JSON: poses + counters)` | upsert / 2 s khi đổi, ngay khi ngắt |
| `replay` | `t PK, data` | 1 / 10 s |
| `events` | `id, t, team, type, data` + index `(team, t)` | ngay (2 dòng) |
| `bikes` | `id PK, data(JSON ServerBike)` | khi đổi |

Phase 7 thêm `leg` (nội dung chặng, phiên bản), `step_progress` bằng `SCHEMA_VERSION = 2` trong `migrate`.

## 6. Bốn track: file sở hữu và việc cần làm

Mỗi track chỉ sửa file của mình và **khối config của mình**, không thêm import vào config; không ai sửa `shared/src/protocol` ngoài việc **thêm** trường tùy chọn (báo người tích hợp, không bump version trong track). `TODO.md` / `CLAUDE.md` / README: chỉ người tích hợp. Giao thức + codec + test đã xong ở nền nên không có track riêng cho nó.

### Track A – Worker + Durable Object (**Opus**: hibernation, batch, đồng thời, quota – logic khó)
- **File:** `worker/src/RaceRoom.ts`, `worker/src/index.ts`, `worker/src/db.ts`, `worker/src/counters.ts`, `worker/src/auth.ts`, `worker/src/race/presence.ts` (mới, thuần: lắp tick theo bán kính, lọc dirty; + test), `worker/src/RaceRoom.test.ts` (+ các test mới), `worker/src/test/harness.ts` (chỉ thêm helper).
- **Việc cần làm:** quyết định 4, 6–12, 15 (phía server), 18, 20: cache `teams` RAM (làm mới khi ghi; không `SELECT` mỗi tin – 5 triệu dòng đọc/ngày là nhiều nhưng không vô hạn); `SpeedWindow` mỗi đội + `respawn` + `flagged`; tick 200 ms (`setTimeout` chuỗi, dirty, interest 500 m, Host full, dừng sau 10 s im lặng, chạy lại ở tin đầu sau khi thức); snapshot 2 s + ngay khi ngắt; replay 10 s; `welcome.pose` từ snapshot sau restart; `team` online/offline + sự kiện; giới hạn 15 tin/s; socket chết im; `host.state` đẩy ≤ 1 s khi đổi + khi Host kết nối; gọi `bikes.tick(players, now)` mỗi 1 s và gắn alarm `vehicles.spawnIntervalMinutes` khi có đội online (C viết `alarm`); bộ đếm vào snapshot; `host.spawning` / `host.bike` chuyển cho C (đã nối); **kênh hộp** (`race/boxes.ts` mới, thuần + nối vào tick): mỗi 2 s / đội online `boxVisible` với hộp hiện tại (Phase 6: `destination` của bước `teams.state.step ?? 0` trong `demoLeg`, Phase 7 thay bằng nội dung chặng trong SQLite) → `send(team, box reveal/hide)`; `welcome.boxes`.
- **Test (bắt buộc, harness thật):** tick của một đội chỉ có đội trong 500 m, không có chính mình; Host nhận tất cả; đội đứng im vẫn trong tick; không đổi → không tick; 6 s pose 5 Hz từ 2 đội → `snapshot` ghi ≤ 3 lần (đọc `getDurableObjectStorage`), `replay` 0–1; evict + kết nối lại → `welcome.pose` = pose cuối, bộ đếm giữ; ngắt → `team online:false` tới Host + snapshot ngay; 20 m/s trong 3 s → `flagged`, `events` có `speed`; `respawn` 300 m → không flag; 16 tin/s → đóng 4429; token hết hạn → 4401; `presence.ts` thuần: bán kính, slot, dirty; **hộp:** đội A ở 200 m không nhận `box`, đi vào 140 m → đúng 1 `reveal` với `step 'L1'` và `x, z` của L1, đội B (xa) không nhận gì, Host không nhận; lùi ra 165 m → không `hide`, 175 m → `hide`; evict rồi nối lại trong bán kính → `welcome.boxes` có L1.
- **Preset:** không (server).

### Track B – Client: login, NetClient, người chơi khác, ghép (**Opus**: nội suy, reconnect, ghép main/Player, nhiều trình duyệt)
- **File:** `client/src/net/session.ts`, `net/NetClient.ts` (+ test phần thuần: gating 5 Hz / đổi, backoff, offset đồng hồ), `net/RemotePlayers.ts` (+ test nội suy thuần), `client/src/ui/Login.ts` + `ui/login.css` (mới), `client/index.html`, `client/src/main.ts`, `client/src/player/Player.ts`, `client/src/ui/Toasts.ts` + `ui/types.ts` (thêm `NoticeCode` server: `bikeLost` "Chậm một bước! Xe đã có người lấy.", `bikeGone`, `bikeParked`, `walkOnly`, `otherDevice` "Đội của bạn vừa đăng nhập trên thiết bị khác", `reload`), `client/src/ui/DebugOverlay.ts`, config `netClient` + `remote`, preset `[B]`.
- **Việc cần làm:** quyết định 5 (phía client), 6, 11–13, 15, 17: `startSession` (online khi `?race=` hoặc PROD và không `?offline=1`); `Login` (form mã đội, nhớ mã, lỗi "Mã đội không đúng" / đếm ngược khóa, "Chào mừng trở lại, Đội Xanh!" + tóm tắt + "Tiếp tục"; Host: mật khẩu → `role: 'host'` → khán giả `?cam=`); `NetClient` (WebSocket `wss` cùng origin, `pos` khi `samePose` sai, `ping` 5 s → `rtt`, offset đồng hồ từ `serverMs`, reconnect, `kick`, version lệch → thông báo tải lại); `RemotePlayers` theo quyết định 13; `Player`: spawn tại `welcome.pose`, `movement` từ welcome, `respawn()` → `respawn`, `G` / `R` → `gesture`, online bỏ tham số thử + `V`; F3 "Mạng:"; `?peers=slot,x,z,yawDeg,mode[;…]` (DEV) dựng người chơi giả cho ảnh.
- **Test (bắt buộc):** gating: 2 pose giống nhau → 1 tin, 20 pose khác nhau trong 1 s → ≤ 5 tin; backoff đúng dãy và lặp số cuối; nội suy: 2 mẫu cách 200 ms → ở t giữa đúng nửa đường, yaw qua ±π ngắn nhất; ngoại suy dừng sau 150 ms; nhảy 50 m → snap; `action` đổi → thời gian gesture về 0; `parseOverrides` online bỏ `player/action/autoMove/jump/bike/autoTurn`; Login: chuẩn hóa mã (hoa, bỏ khoảng trắng), storage ném lỗi → vẫn chạy; tay (ghi kết quả): 2 trình duyệt cùng `?race=` thấy nhau đi / đạp / vẫy; F5 → vào lại đúng chỗ; tab 2 cùng mã → tab 1 bị đá.
- **Preset:** `p6-login` (`/?login` form), `p6-welcome-back` (`/?login=back`), `p6-peers` (`/?player&peers=…` 3 người: đi, đạp, vẫy quanh spawn), `p6-debug` (`/?player&peers=…&debug=1` dòng Mạng).

### Track C – Xe chung (**Opus**: nguyên tử, tất định, server + client + Host)
- **File:** `worker/src/race/VehicleSpawner.ts` (+ test), `worker/src/race/BikeService.ts` (+ test harness riêng `worker/src/race/BikeService.test.ts`), `client/src/vehicle/Bikes.ts` (+ test), `client/src/vehicle/types.ts`, `client/src/host/spawnCandidates.ts` (+ test đồ thị thật), config `serverBikes`, preset `[C]`.
- **Việc cần làm:** quyết định 14 (+ 9 phần alarm): `spawnCandidates` (bãi xe trước, lấy mẫu vỉa hè, decoys; dùng `shortestPath`, `corridorEdges`, `bikeParking`, cờ `sidewalk` / `footway` / `bridge` / `steps`); spawner thuần + seed / draws; `BikeService`: rows `bikes`, `events`, `claim` / `mount` / `dismount`, abandonment trong `tick`, `alarm` + gắn lại (qua `io.setAlarm`) khi `players.length > 0`, `park` + sức chứa bãi, Host `candidates` / `add` / `remove` / `release` / `spawning`; client `Bikes` chế độ server (danh sách từ server, `claim` chờ, toast); `BikeState.owner` = id đội, `ownerColour` từ `welcome.teams`.
- **Test (bắt buộc):** candidates trên 6 đoạn demo: mọi điểm cách điểm ≥ 100 m, L2→L3 vẫn ≥ `minCandidates`, decoys ngoài hành lang; spawner: đợt đầu mỗi đoạn ∈ `initialPerSegment`, tỉ lệ mồi ≈ 0,4 trên 1 000 seed, không điểm nào trong 120 m quanh đội, định kỳ không vượt `maxAvailablePerSegment` (xe ở bãi không tính), cùng seed + draws → cùng kết quả sau "restart"; `claim`: trống → ok, đã có chủ → `taken`, xa > 3,5 m → `far`, walkOnly → `walkOnly`, xe thứ hai → xe cũ gone; abandonment: 200 m trong 59 s không, 61 s có, chủ offline không, về gần reset; harness: 2 socket `claim` cùng xe liên tiếp → đúng 1 `ok:true`, người kia `taken`; client: `applyServer` giữ model, `interact` gửi `claim` rồi `mount` khi ok.
- **Preset:** `p6-bikes` (`/?player&bikes=free@…;owned@…` stand-in: xe trống lấp lánh, xe đội khác có khóa), `p6-bike-lost` (toast "Chậm một bước!").

### Track D – Dev tooling, trang Host tối giản, bot (**Sonnet**: spec rõ, cơ học)
- **File:** `client/host.html`, `client/src/host/main.ts`, `client/src/host/host.css` (mới), `client/vite.config.ts` (`rollupOptions.input` index + host), `scripts/sim.ts` + script `sim` trong `package.json`, `worker/src/test/harness.ts` (helper thêm), `docs/DEV.md`? (không: ghi vào README ở bước tích hợp), preset `[D]`.
- **Việc cần làm:** quyết định 16, 19: trang Host (đăng nhập mật khẩu, mã cuộc đua, tạo đội, bảng mã + copy, online/offline, lastSeen, reconnects, bộ đếm + `billableRequests` ước tính, số xe, nút ứng viên gọi `spawnCandidates` của C với các điểm `start` + `destination` mà `host.state` sẽ mang – A thêm `steps: {id, x, z}[]` vào `HostState` nếu C cần; tạm dừng đặt xe; danh sách vị trí lat/lon qua `worldToLatLon`); bot `sim.ts` (tạo đội qua socket Host, N bot đăng nhập, đi tuyến A* thật ở `footSpeed` gửi 5 Hz, hệ số tua `--speedup`, in số tin / request ước tính / bytes; kịch bản 2 bot `claim` cùng xe trong cùng khung → ≤ 1 ok; bot ngắt 10 s rồi vào lại → `welcome.pose` khớp; chạy với `createTestHarness` mặc định hoặc `--url` wrangler dev).
- **Test (bắt buộc):** `sim` chạy 30 s giả lập với 3 bot không lỗi, request ước tính / bot / phút in ra khớp công thức §9 (± 10 %); trang Host: hàm thuần dựng bảng từ `host.state` (test), copy mã.
- **Preset:** `p6-host` (`/host.html?demo=1`: trang với dữ liệu giả, không cần server).

## 7. Screenshot preset

- `npm run screenshot -- p6` chạy cả nhóm; `p6-*` không nằm trong lượt mặc định (cần stand-in). Tên và chủ sở hữu ở mục 6.
- Preset cũ (`p3`…`p5`) chạy offline, không đổi. Mỗi track tối đa 4 vòng chụp → sửa; người tích hợp chụp lại `p6-*`, `p5-*`, `p4-mount`, `p3-idle`.

## 8. Ghép và kiểm tra

- **Thứ tự: A → B → C → D.**
  - A: chỉ `worker/` (trừ `race/VehicleSpawner.ts`, `race/BikeService.ts`);
  - B: `client/net`, `ui/Login`, `main.ts`, `Player.ts`;
  - C: `race/*` + `vehicle/Bikes.ts` + `host/spawnCandidates.ts` (nối vào `Player`/`main` của B: `bikes.net = net`, `applyServer` từ `welcome` / `bikes`);
  - D: trang Host + bot (dùng A + C).
- **Xung đột dự kiến:** `config.ts` (khối riêng), `screenshot.ts` (dòng riêng), `RaceRoom.ts` (chỉ A; C đi qua `BikeService`), `main.ts` / `Player.ts` (chỉ B; C đưa hướng dẫn nối 3 dòng), `vite.config.ts` (chỉ D), `HostState` (A thêm trường cho D / C).
- **Người tích hợp:**
  - `npm run build && npm test`;
  - `npm run dev:api` + `npm run dev`: mở `/?race=paris` ở Chrome + Firefox, mã đội từ `/host.html` → thấy nhau, vẫy, đạp xe, F5 vào lại, đá thiết bị cũ, F3 ping; `npm run sim`; tắt `wrangler dev` giữa chừng rồi bật lại → client tự nối lại;
  - `npm run screenshot -- p6 p5 p4-mount p3-idle`; `npm run ride-check` (offline, không đổi);
  - đọc bộ đếm Host sau 10 phút với 3 bot, ngoại suy ra 2 h / 20 đội, so §9;
  - `TODO.md`: xóa 9 dòng Phase 6, thêm ponytail còn lại (khóa đăng nhập trong RAM, không reconciliation, lean xe người khác suy ra, ZonePanel chờ Phase 7, Host tối giản); `CLAUDE.md`: thư mục `net/`, `host/`, `worker/src/race`, lệnh `dev:api`, `sim`, URL `?race=` / `?offline=1`; README: cách chơi 2 máy;
  - commit `feat(phase6): …`.
- Không để `wrangler dev` / `workerd` / `vite` chạy khi xong.

## 9. Ngân sách (cuộc đua 2 giờ, 20 đội; so với SPEC §3: < 40 000 request, < 20 000 dòng ghi)

| Request DO tính phí | Cách tính | Điển hình | Xấu nhất |
|---|---|---|---|
| Mở WebSocket (đội vào lại ~3 lần + Host) | 20 × 3 + 4 | 64 | 64 |
| Tin vị trí lên (5 Hz, chỉ khi đổi) ÷ 20 | 20 × 5 × 7 200 × tỉ lệ di chuyển ÷ 20 | 70 % → 25 200 | 100 % → 36 000 |
| Thao tác (xe, vẫy, chuông, hồi sinh) ÷ 20 | 60–120 / đội | 60 | 120 |
| Host ÷ 20 | ≈ 200–400 tin | 10 | 20 |
| Đăng nhập HTTP tới DO | 20 × 3–5 | 60 | 100 |
| Alarm đặt xe | 120 phút ÷ 3 | 40 | 40 |
| **Tổng** | | **≈ 25 400** | **≈ 36 300** ✓ |

- `ping` 28 800 tin → auto-response: 0. Static asset: 0. Worker (Free 100 000/ngày): ≈ 200 request. Giờ chạy DO ≈ 922 GB-s (Free 13 000/ngày).
- Kênh hộp (§17.10): ≈ 20 đội × 10 bước × (1 reveal + ≤ 2 hide/reveal thêm) ≈ 600 tin **gửi xuống** → 0 request, 0 dòng SQLite; kiểm tra 20 `hypot` / 2 s ≈ 0 CPU.
- Xấu nhất sát ngưỡng: nếu đo thật (Phase 12) vượt, bật `samplesPerMessage = 2` (câu hỏi 2) – đổi giao thức `pos` thành nhiều mẫu, không đổi gì khác.

| Dòng SQLite ghi | Cách tính | Dòng |
|---|---|---|
| snapshot | 7 200 ÷ 2 | 3 600 |
| replay | 7 200 ÷ 10 | 720 |
| events | ≈ 900 × 2 | 1 800 |
| bikes | sinh ≈ 250, nhận 150, xuống xe 100, gone 50 | ≈ 550 |
| teams | state ≈ 300, tạo 20 × 2 | ≈ 340 |
| setAlarm + meta | 40 + 20 | 60 |
| **Tổng** | | **≈ 7 100** ✓ |

- Dòng đọc: khởi động ≈ 1 000, mỗi đăng nhập vài dòng, A cache RAM → ≪ 5 triệu/ngày.
- Client: `RemotePlayers` ≤ 19 nhân vật skinned (+19 xe) ≈ ≤ 40 lệnh vẽ thêm, nội suy ≤ 0,2 ms/khung; tick 627 B × 5 Hz ≈ 3 KB/s xuống, 31 B × 5 Hz lên.

## 10. Để sang phase sau

- **Phase 7:** vẽ hộp mật thư từ `welcome.boxes` + `box reveal/hide` (vật thể 3D thường, đặt lên mặt đất client; `fog: false` cho cờ nếu file chặng đặt bán kính > `render.fog.near`), hộp hiện tại lấy từ nội dung chặng trong SQLite thay `demoLeg`, `host.state` thêm bước, `raceTime`, `walkOnly` thật cho `BikeService.onTeam`, gọi `park()` khi mở mật thư thử thách / lộ trình đi bộ, `status` chạy / dừng, `events` bước, ZonePanel; `SCHEMA_VERSION 2`.
- **Phase 9:** phạt từ `SpeedWindow` khi `walkOnly`.
- **Phase 10:** Host đầy đủ thay trang tối giản; `HostState` mở rộng.
- **Phase 11:** bot 10 bước trên `scripts/sim.ts`.
- **Phase 12:** đo request / dòng ghi thật (bộ đếm Host) so §9; `samplesPerMessage` nếu cần.

## 11. Câu hỏi mở cho người dùng (có mặc định, không chặn việc làm)

1. **Mã cuộc đua trong link** Host gửi (`/?race=paris-2026`, mặc định `paris`), người chơi chỉ gõ mã đội. Hay mọi link phải không có mã cuộc đua (cần thêm DO "danh bạ" mã đội → cuộc đua)? **Mặc định:** link có mã cuộc đua.
2. **Tần số vị trí:** 5 Hz, 1 mẫu / tin như SPEC ≈ 25–36 nghìn request / cuộc đua (xấu nhất sát 40 000). Có muốn 2 mẫu / tin ở 2,5 Hz (cùng dữ liệu, nửa request, trễ thêm 200 ms) không? **Mặc định:** như SPEC.
3. **Bán kính quan tâm 500 m** (đội chỉ nhận đội trong 500 m; Host thấy hết). **Mặc định:** như SPEC.
4. **Token 24 h; sai mã 5 lần → khóa 1 phút theo IP** (nhiều máy sau một NAT chia sẻ khóa). **Mặc định:** như vậy.
5. **Trang Host Phase 6 tối giản** (tạo đội, mã, online, bộ đếm, nút ứng viên xe). **Mặc định:** có.
6. **Kiểm tra tốc độ** chỉ đánh dấu đỏ cho Host, không tự phạt (Phase 9 phạt bắt buộc đi bộ). **Mặc định:** như vậy.
7. **Camera bay online:** đội không bật được `V`; `?cam=` cần token Host. **Mặc định:** như vậy.
8. **Alarm đặt xe chỉ khi có đội online.** **Mặc định:** như vậy.
9. **Dev loop** bằng Vite proxy sang `wrangler dev` (không `@cloudflare/vite-plugin`). **Mặc định:** proxy.
