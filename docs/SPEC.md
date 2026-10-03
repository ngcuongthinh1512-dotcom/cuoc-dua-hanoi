# PROMPT CHO CLAUDE CODE: Game mô phỏng 1 chặng "Cuộc Đua Kỳ Thú" tại Paris – thế giới 3D phong cách GTA

> **Cách dùng với Claude Code:**
> 1. Tạo thư mục trống, mở terminal tại đó, chạy `claude`.
> 2. Nhấn `Shift+Tab` để bật **Plan mode**, dán toàn bộ prompt bên dưới → duyệt kế hoạch rồi cho chạy.
> 3. Phase 0 sẽ lưu toàn bộ prompt vào `docs/SPEC.md` và tạo `CLAUDE.md`, nên giữa các phase anh có thể `/clear` cho nhẹ context rồi gõ: `Đọc docs/SPEC.md và làm tiếp Phase N`.
> 4. Làm lần lượt từng phase, chạy thử được rồi mới sang phase sau.

---

## 1. VAI TRÒ & MỤC TIÊU

Bạn là senior game developer chuyên WebGL/Three.js, dữ liệu GIS và game multiplayer. Hãy xây dựng một **game 3D chạy trên trình duyệt** để **mô phỏng trải nghiệm 1 chặng đua kiểu The Amazing Race (Cuộc Đua Kỳ Thú)** tại **trung tâm Paris**:

- Thế giới 3D open-world **phong cách GTA** (góc nhìn thứ ba), bản đồ **khớp vị trí thật như Google Maps** (dựng từ dữ liệu OpenStreetMap theo tọa độ lat/lon).
- Mỗi người chơi điều khiển một **nhân vật người 3D chân thực** (có animation), **mặc định đi bộ/chạy**. Trên đường sẽ **ngẫu nhiên xuất hiện rất ít xe đạp** (phương tiện duy nhất); ai lấy trước thì được. Xe đang có người dùng thì người khác không lấy được, nhưng khi người đó dừng làm thử thách, xe được để ở bãi cạnh điểm và đội khác có thể lấy mất (mục 6).
- **Luật đua tuần tự**: phải tới đúng điểm của lộ trình 1 mới mở được mật thư dẫn tới lộ trình 2, rồi tới Lựa chọn kép, Vượt rào... và cuối cùng là Chặng dừng (Pit Stop). Không thể nhảy cóc.
- **Mỗi đội chỉ có 1 người chơi** (1 thiết bị, 1 nhân vật). Các đội chơi độc lập nhưng **ở chung một thế giới**: **nhìn thấy nhau khi di chuyển**, và khi đứng tại một điểm lộ trình/thử thách thì **biết có những đội nào đang ở đó**.
- Có **màn hình Host** cho người tổ chức: tạo đội, nạp nội dung chặng, bấm xuất phát, và **theo dõi trực tiếp tiến trình của từng đội**: đang ở đâu, đang làm bước nào, **thời điểm hoàn thành từng lộ trình/thử thách** và **thời gian về đích**.

Không dùng logo, nhạc hay tên thương hiệu chính thức của chương trình; dùng biểu tượng cờ hai màu vàng–đỏ tự thiết kế cho hộp mật thư.

## 2. THUẬT NGỮ (tiếng Việt ↔ tên trong code)

| Tiếng Việt | Gốc tiếng Anh | Tên trong code |
|---|---|---|
| Mật thư / Thông tin lộ trình | Route Info | `route_info` |
| Lựa chọn kép | Detour | `detour` |
| Vượt rào | Roadblock | `roadblock` |
| Vé vượt | Fast Forward | `fast_forward` |
| Vé ưu tiên | Express Pass | `express_pass` |
| Quay đầu | U-Turn | `u_turn` |
| Nhường đường | Yield | `yield` |
| Gờ giảm tốc | Speed Bump | `speed_bump` |
| Thử thách (nhiệm vụ bắt buộc, không có nhánh) | Challenge | `challenge` |
| Chặng dừng / Về đích (thảm dừng chân) | Pit Stop | `pit_stop` |
| Host duyệt (xác nhận thủ công) | Host approval | `host_approval` |
| Hộp mật thư | Clue box | `clue_box` |
| Sổ mật thư | Clue book | `clue_book` |

Toàn bộ chữ hiển thị trong game bằng **tiếng Việt**; tên biến, file, API bằng tiếng Anh.

## 3. KIẾN TRÚC & TECH STACK

**Toàn bộ chạy trên Cloudflare** (người tổ chức chỉ có tài khoản Cloudflare). Không dùng VPS, Node server riêng hay Colyseus.

Monorepo dùng **npm workspaces**:

```
/client   – game + màn hình Host (Vite + TypeScript + Three.js + Rapier) → build ra static assets
/worker   – Cloudflare Worker + Durable Object `RaceRoom` (TypeScript) = máy chủ đua
/shared   – kiểu dữ liệu, protocol WebSocket, schema zod cho file chặng, projection, hằng số
/scripts  – fetch-osm, fetch-dem, build-graph, screenshot, sim
/docs     – SPEC.md, RACE_RULES.md, DEPLOY.md
```

| Thành phần | Dịch vụ Cloudflare | Dùng để |
|---|---|---|
| Web game + màn hình Host | **Workers Static Assets** (chung project với Worker) | HTML/JS, dữ liệu bản đồ, model 3D (đều là dữ liệu công khai) |
| API | **Worker** | đăng nhập mã đội / Host, cấp token, định tuyến WebSocket vào Durable Object |
| Máy chủ đua | **1 Durable Object `RaceRoom` cho mỗi cuộc đua** (SQLite-backed), dùng WebSocket | giữ state authoritative, xử lý luật đua, broadcast vị trí |
| Cơ sở dữ liệu | **SQLite của chính Durable Object** (`ctx.storage.sql`) | đội, tiến trình, sự kiện, nội dung chặng, lịch sử phiên bản, log |
| Ảnh/video minh họa thử thách | **R2** (bucket private) | Host upload; Worker chỉ trả file cho đội đã mở mật thư đó |
| Mật khẩu Host | **Worker secret** (`wrangler secret put HOST_PASSWORD`) | |

**Client**
- **Vite + TypeScript strict**, **Three.js** (shadow, ACES tone mapping, sRGB), **@dimforge/rapier3d-compat** (vật lý), **osmtogeojson**, **@turf/turf**, **three-mesh-bvh**, Web Worker để dựng chunk bản đồ.
- HUD bằng HTML/CSS overlay (hoặc Preact nếu cần).
- Kết nối WebSocket gốc của trình duyệt, tự kết nối lại với backoff. Message định nghĩa kiểu trong `/shared/protocol.ts`.

**Worker + Durable Object**
- `wrangler.toml` khai báo: static assets, Durable Object `RaceRoom` (migration `new_sqlite_classes`), R2 bucket. **zod** kiểm tra file chặng.
- **Durable Object là nơi quyết định (authoritative)** cho mọi thứ liên quan tới cuộc đua: mở mật thư, kiểm tra đáp án, tính giờ, tính phạt, xếp hạng, nhận xe.
- Durable Object có thể bị khởi động lại bất cứ lúc nào (deploy mới, Cloudflare chuyển máy). Vì vậy:
  - **mọi thay đổi quan trọng phải ghi vào SQLite trước khi báo thành công cho client**;
  - khi khởi động, dựng lại toàn bộ state từ SQLite;
  - client tự kết nối lại (mục 8.10).
- **Không chạy tính toán nặng trong Durable Object.** Đồ thị đường, A* và hành lang đặt xe (mục 6.2) được tính **trong trình duyệt của Host** khi lưu nội dung chặng (dùng `roadgraph.json` công khai). Kết quả là danh sách điểm đặt xe ứng viên cho từng đoạn, gửi lên Durable Object. Durable Object chỉ chọn ngẫu nhiên trong danh sách đó.
- **Nội dung chặng (mật thư, đáp án) không bao giờ nằm trong static assets hay bundle client.**
  - File mẫu `/worker/legs/*.json` được import vào code Worker (phía server) để nạp lần đầu.
  - Sau đó nội dung sống trong SQLite của Durable Object và được sửa qua màn hình Host.
  - Client chỉ nhận mật thư khi đội đã mở khóa → các đội không thể đọc trước bằng DevTools.
- Đáp án do Host nhập dạng chữ bình thường (trong file JSON mẫu hoặc màn hình Host). Server **không bao giờ gửi đáp án xuống client**; client chỉ gửi câu trả lời lên và nhận về đúng/sai.
- Token đăng nhập (đội / Host) ký HMAC bằng secret, gửi kèm khi mở WebSocket.

**Tiết kiệm hạn mức – bắt buộc, để chạy được cả trên gói Workers Free**
- Tin nhắn WebSocket gửi lên Durable Object được tính phí/hạn mức theo tỉ lệ 20 tin = 1 request. Vì vậy:
  - Client gửi vị trí **5 lần/giây**, chỉ gửi khi có thay đổi, dạng mảng số gọn (tọa độ làm tròn tới cm).
  - Server gộp vị trí mọi người chơi thành **1 message broadcast** mỗi lượt (5 lần/giây).
- **Ghi SQLite theo lô** (gói Free chỉ có 100.000 dòng ghi/ngày):
  - Vị trí cuối của **tất cả** đội lưu chung **1 dòng** (upsert JSON) mỗi 2 giây, không phải mỗi đội một dòng.
  - Log vị trí cho replay gộp mỗi 10 giây thành 1 dòng.
  - Sự kiện đua (ít) thì ghi ngay.
- Ngân sách mục tiêu cho **1 cuộc đua 2 giờ, 20 đội**: < 40.000 request tính phí và < 20.000 dòng ghi SQLite. Màn hình Host (chế độ debug) hiển thị bộ đếm ước tính: tin nhắn nhận, dòng đã ghi.
- Dùng **Durable Object Alarms** cho việc đặt xe định kỳ. Khi không có ai kết nối, không chạy vòng lặp để Durable Object được nghỉ (không tốn thời gian chạy).
- Mỗi file static asset ≤ 25 MB (nén model bằng Draco/Meshopt, texture KTX2). Ảnh/video lớn để trên R2.

**Test**: Vitest (client, worker, shared), Playwright (chụp ảnh kiểm tra trực quan), bot mô phỏng đội đua (xem Phase 11). Chạy local toàn bộ bằng `wrangler dev` (có Durable Object, SQLite, R2 giả lập, không tốn hạn mức).

**Deploy**: `npm run deploy` = build client + `npx wrangler deploy`, ra địa chỉ miễn phí `https://<tên-project>.<tài-khoản>.workers.dev` (hoặc tên miền riêng nếu có trên Cloudflare). `docs/DEPLOY.md` hướng dẫn từng bước cho người không chuyên:
- đăng nhập `wrangler login`;
- tạo R2 bucket;
- đặt secret `HOST_PASSWORD`;
- deploy;
- xem log bằng `wrangler tail`;
- sao lưu dữ liệu cuộc đua: nút "Xuất toàn bộ dữ liệu" trên màn hình Host.

Cấu trúc client:

```
/client/src
  main.ts, config.ts
  /core      (GameLoop, Input, Time, EventBus)
  /geo       (projection.ts, bbox, chunk grid)
  /world     (ChunkManager, BuildingBuilder, RoadBuilder, BridgeBuilder, Terrain, Water, Landmarks, Vegetation, StreetProps, Sky)
  /workers   (chunkBuilder.worker.ts)
  /player    (CharacterController, CharacterAnimator, CameraController)
  /vehicles  (Bike, BikeView, BikeRack, EnterExit)
  /net       (NetClient, RemotePlayers, Interpolation)
  /race      (RaceClient, ClueBook, ClueCardUI, ZonePanel, ChallengeRunner, /challenges/*)
  /ui        (HUD, Minimap, FullMap, LocationLabel, Speedometer, Toasts)
  /host      (màn hình Host – route /host)
```

## 4. BẢN ĐỒ PARIS – ĐỘ CHÍNH XÁC VỊ TRÍ

### 4.1 Vùng bản đồ
- Bounding box: Nam **48.8450**, Tây **2.2850**, Bắc **48.8780**, Đông **2.3600** (khoảng 5,5 × 3,7 km: Eiffel, Trocadéro, cầu Bir-Hakeim, Khải Hoàn Môn, Champs-Élysées, Invalides, Concorde, Tuileries, Louvre, Île de la Cité, một đoạn dài sông Seine). Đặt trong `config.ts`.
- **Gốc tọa độ (0,0,0)** = **cột obelisk quảng trường Concorde: 48.86548, 2.32115**.
- Ra khỏi bbox: tường vô hình + cảnh báo "Bạn đang rời khu vực đua".

### 4.2 Phép chiếu
- `geo/projection.ts`: phép chiếu **ENU cục bộ**, **1 unit = 1 mét**, trục **X = Đông, Z = −Bắc, Y = độ cao**. Hàm `latLonToWorld()` / `worldToLatLon()` dùng chung cho client, server (kiểm tra geofence) và màn hình Host → đặt trong `/shared`.
- Unit test: obelisk Concorde → Khải Hoàn Môn (48.8738, 2.2950) ≈ **2,1 km**; tháp Eiffel (48.8584, 2.2945) → Khải Hoàn Môn ≈ **1,7 km**.

### 4.3 Nguồn dữ liệu
- **OpenStreetMap qua Overpass API** (license ODbL – hiển thị "© OpenStreetMap contributors").
- `scripts/fetch-osm.ts`: chia bbox thành ô 500×500 m, tải lần lượt (có delay để không bị chặn), lưu vào `/client/public/data/chunks/` + `index.json`. **Chỉ chạy một lần** (`npm run fetch-map`). Lấy các tag:
  - `building`, `building:part` (`height`, `building:levels`, `roof:shape`, `min_height`, `building:colour`, `roof:colour`)
  - `highway` (`lanes`, `width`, `oneway`, `name`, `junction=roundabout`, `surface`)
  - `bridge`, `tunnel`, `layer`; `waterway=river`, `natural=water`; `amenity=fountain`
  - `leisure=park|garden`, `landuse=grass`, `natural=tree|tree_row`
  - `amenity=bicycle_parking` (chỗ ưu tiên đặt xe ngẫu nhiên), `railway=subway_entrance`
  - `boundary=administrative` + `admin_level=9` (tên quận), `tourism`, `historic`, `place`
- **Độ cao**: DEM Copernicus GLO-30 hoặc AWS Terrain Tiles (terrarium) → `elevation.bin`. Đồi Chaillot/Trocadéro và lòng sông Seine thấp hơn bờ ~6–8 m (có kè đá, đường dạo ven sông).
- *(Tùy chọn)* **Google Photorealistic 3D Tiles** qua `3d-tiles-renderer` để hình ảnh giống hệt Google Maps: cần API key, bắt buộc hiển thị attribution Google, không được cache/tải offline, phải đọc kỹ Điều khoản Google Maps Platform trước khi dùng. Chỉ làm lớp hình ảnh (bật/tắt trong cài đặt), va chạm vẫn từ OSM.

### 4.4 Dựng thế giới
- **Chunk streaming**: chunk 250×250 m, load trong bán kính ~800 m quanh người chơi, dựng trong Web Worker, gỡ chunk ở xa.
- **Nhà kiểu Haussmann**: extrude theo `height` → `building:levels × 3.2 m` → mặc định **20 m**. Tường đá vôi màu kem, **mái mansard kẽm xám xanh**, ban công sắt tầng 2 và tầng 5, tầng trệt là cửa hàng/quán cà phê. Merge geometry theo material trong từng chunk.
- **Đường**: ribbon mesh theo độ rộng, vạch kẻ, vỉa hè 3–4 m, mặt đá lát (pavé) cho `surface=sett|cobblestone`. Vòng xuyến Étoile có 12 đại lộ tỏa ra. **Biển tên đường** thật (từ tag `name`) gắn ở các góc phố – cần cho thử thách.
- **Sông Seine & cầu**: mặt nước có shader phản chiếu nhẹ; cầu dựng theo `bridge` + `layer`, có lan can và collider riêng; hầm theo `tunnel`. Rơi xuống sông → bơi vào bờ hoặc respawn ở bậc thang gần nhất.
- **Cây tiêu huyền** dọc đại lộ (`tree_row`), cây trong Champ de Mars, Tuileries; cột đèn kiểu Paris, cột quảng cáo tròn, lối vào Metro – dùng InstancedMesh.
- **Collider**: tòa nhà tĩnh, terrain heightfield, cầu riêng.

### 4.5 Địa danh (model riêng, đúng tọa độ, có LOD)

| Địa danh | Lat, Lon (xấp xỉ) |
|---|---|
| Tháp Eiffel (cao 330 m, có thang máy lên tầng 2) | 48.8584, 2.2945 |
| Trocadéro / Palais de Chaillot | 48.8620, 2.2880 |
| Cầu Bir-Hakeim (2 tầng, tầng trên có đường tàu điện) | 48.8556, 2.2877 |
| Khải Hoàn Môn + vòng xuyến Étoile | 48.8738, 2.2950 |
| Đại lộ Champs-Élysées | Étoile → Concorde |
| Quảng trường Concorde + obelisk | 48.8655, 2.3212 |
| Grand Palais | 48.8661, 2.3125 |
| Cầu Alexandre III | 48.8639, 2.3136 |
| Điện Invalides (mái vòm vàng) | 48.8550, 2.3125 |
| Bảo tàng Orsay | 48.8600, 2.3266 |
| Bảo tàng Louvre + kim tự tháp kính | 48.8611, 2.3358 |
| Nhà thờ Đức Bà Paris | 48.8530, 2.3499 |

> Kiểm tra lại bằng centroid polygon OSM, ưu tiên OSM nếu lệch.

### 4.6 Bản đồ không làm lộ đáp án
Mật thư thường là câu đố về địa điểm, nên bản đồ lớn và minimap **mặc định chỉ hiện tên đường, không hiện tên địa danh** (`mapLabels: "streets-only"` trong cấu hình chặng; Host có thể đổi thành `"all"`). Bản đồ trên màn hình Host luôn hiện đầy đủ tên địa danh.

## 5. NHÂN VẬT & CAMERA

- Model humanoid **GLB có skeleton** (Mixamo/Ready Player Me/CC0), mỗi đội một màu áo, có bảng tên phía trên đầu. Animation: idle, walk (đi chậm), jog (đi bộ chuẩn – kiểu chạy bộ nhẹ), jump, fall, swim, đạp xe đạp, ngã xe, mở hộp mật thư, ăn mừng.
- **Rapier KinematicCharacterController** (leo bậc ≤ 0.4 m, dốc ≤ 45°).
- Điều khiển: `WASD` di chuyển (mặc định ở tốc độ đi bộ chuẩn), giữ `Ctrl` đi chậm (khi cần di chuyển chính xác trong thử thách), `Space` nhảy, `F` tương tác (mở hộp mật thư, lấy/lên/xuống xe, nhặt vật), `Tab` mở Sổ mật thư, `M` bản đồ lớn, `C` đổi camera, `B` ống nhòm (khi thử thách cho phép), `Esc` menu, `F3` debug. Hỗ trợ gamepad.
- **Camera góc thứ ba kiểu GTA**: spring arm sau vai, chống xuyên tường, lùi xa khi đi xe, FOV tăng nhẹ theo tốc độ.

## 6. DI CHUYỂN & PHƯƠNG TIỆN NGẪU NHIÊN

### 6.1 Mặc định: đi bộ
- Mọi người chơi **mặc định di chuyển bằng đi bộ/chạy**. Phương tiện duy nhất là xe đạp nhặt được trên đường (mục 6.2). Không có taxi, thuyền, xe máy, ô tô, và không có tiền.
- **Tốc độ đi bộ chuẩn** `movement.footSpeed` (mặc định 4 m/s, cho nhịp game không quá chậm trên quãng đường vài km). Đây là tốc độ tối đa khi đi bộ.
- Không có chạy nước rút hay tăng tốc khi đi bộ, để **xe đạp luôn nhanh hơn đi bộ đúng 1,3 lần**.
- **Tốc độ xe đạp = `movement.footSpeed × movement.bikeSpeedMultiplier`**, với `bikeSpeedMultiplier = 1.3` (mặc định 4 × 1,3 = 5,2 m/s).
- Hai thông số này nằm trong khối `movement` của file chặng. Server gửi xuống client lúc vào game, và cũng dùng chính hai số này để kiểm tra gian lận tốc độ. Không hard-code tốc độ ở nơi khác.
- Tốc độ tối đa không đổi theo địa hình (Paris gần như bằng phẳng). Xe đạp tăng tốc từ 0 lên tối đa trong ~1 giây; va chạm hoặc cua gắt thì giảm tốc tạm thời.

### 6.2 Xe đạp xuất hiện ngẫu nhiên
- **Chỉ có một loại phương tiện: xe đạp**, nhanh gấp **1,3 lần** tốc độ đi bộ (mục 6.1). Không có xe máy hay phương tiện nào khác. Không dùng logo/tên hãng thật.
- **Số lượng rất ít**, xuất hiện **ngẫu nhiên dọc cung đường giữa các điểm lộ trình**.
- Xe là **thực thể chung của cả thế giới, do server quản lý** (mọi người chơi thấy cùng một chiếc xe ở cùng một chỗ).

Cách server đặt xe (`worker/src/race/VehicleSpawner.ts`). Mọi thông số nằm trong khối `vehicles` của file chặng:
1. **Tính hành lang**: khi nạp chặng, server tính cho mỗi đoạn đường (điểm xuất phát/điểm trước → điểm đến của lộ trình tiếp theo) **đường đi bộ ngắn nhất** trên đồ thị đường OSM (A*). Sau đó lấy **hành lang** rộng `corridorMeters` (150 m) quanh đường đó, gồm cả các phố song song người chơi có thể chọn đi. Đồ thị đường dựng một lần bằng `npm run build-graph` ra `/shared/data/roadgraph.json`, dùng chung cho server (đặt xe) và client (GPS).
2. **Chọn chỗ đặt xe**: trên vỉa hè/lề đường trong hành lang (ưu tiên `amenity=bicycle_parking` nếu có). Cách hộp mật thư và điểm thử thách ≥ `minDistanceFromCheckpoint` (100 m). Không đặt trên cầu hẹp, trong hầm hoặc dưới nước.
3. **Đợt đầu** lúc xuất phát: mỗi đoạn ngẫu nhiên `initialPerSegment` xe (0–1).
4. **Xuất hiện dần**: cứ mỗi `spawnIntervalMinutes` (3 phút), mỗi đoạn có xác suất `spawnChance` (30%) xuất hiện thêm 1 xe, với điều kiện số xe còn trống trên đoạn đó < `maxAvailablePerSegment` (1). Xe đang nằm ở bãi xe cạnh điểm lộ trình (mục 6.4) không tính vào con số này.
5. **Không xuất hiện trước mắt người chơi**: không đặt xe mới trong bán kính `noSpawnNearPlayerMeters` (120 m) quanh bất kỳ người chơi nào.
6. **Chống lộ lộ trình**: xe nằm dọc đường tới điểm tiếp theo, nên người chơi có thể đoán hướng đi từ vị trí xe. Vì vậy một tỉ lệ `decoyRatio` (40%) xe là **xe mồi**, đặt ngẫu nhiên trên các phố khác trong bản đồ. Người chơi không phân biệt được xe mồi với xe "trên đường".
7. **Ghi lại để kiểm tra**: seed ngẫu nhiên được lưu. Mọi lần xe xuất hiện, được nhận, được để ở bãi, được lấy lại hoặc biến mất đều ghi vào `race_events`.

### 6.3 Ai lấy trước thì được
- **Cách lấy xe**: đứng cách xe ≤ 2,5 m, đang đi bộ, bấm `F` → client gửi yêu cầu → **server xử lý nguyên tử (atomic)**.
  - Xe còn trống (`available`) → gán cho đội đó.
  - Hai người bấm cùng lúc → chỉ yêu cầu tới server trước được nhận. Người kia thấy "Chậm một bước! Xe đã có người lấy."
- **Trong lúc đội đang giữ xe, chỉ đội đó dùng được**:
  - Chủ xe được xuống xe mở hộp mật thư ở các điểm lộ trình "tự chọn" rồi lên lại đi tiếp; xe vẫn là của họ.
  - Xe có chủ có viền/biển màu của đội chủ và biểu tượng khóa. Người khác bấm `F` → "Xe này đã có đội sử dụng".
- **Xe chỉ hết chủ trong 2 trường hợp**:
  1. **Để ở bãi xe khi làm thử thách** (hoặc khi nhận lộ trình bắt buộc đi bộ) → xe **trở về trạng thái bình thường, đội khác lấy được** (mục 6.4).
  2. **Bỏ lại ngoài đường**: chủ ở cách xe > `abandonMeters` (200 m) liên tục `abandonSeconds` (60 s) → xe **biến mất** khỏi thế giới.
- **Thoát game / mất kết nối không làm mất xe**: trong lúc chủ offline, xe đứng yên tại chỗ, vẫn khóa theo đội đó và không bị tính là bỏ lại. Vào lại thì vẫn có xe (mục 8.10).
- **Mỗi người chơi giữ tối đa 1 xe**: lấy xe khác thì xe cũ biến mất.
- **Phải xuống xe** mới mở được hộp mật thư và làm nhiệm vụ.
- **Ngã xe**: va chạm mạnh ở tốc độ cao → nhân vật ngã, 2 giây sau đứng dậy; xe vẫn thuộc về mình.

### 6.4 Bãi xe cạnh điểm lộ trình – xe có thể bị đội khác lấy mất
- **Mỗi điểm lộ trình có một bãi xe đạp** (model giá để xe) nằm ngay cạnh, ngoài vùng hộp mật thư khoảng `bikeParking.offsetMeters` (20 m), trên vỉa hè gần nhất. Vị trí tự tính từ OSM; Host đặt chính xác được bằng trường `bikeParking: {lat, lon}` trong `destination`.
- **Khi làm thử thách**: đội đang có xe mở mật thư của một bước nhiệm vụ tại điểm (Lựa chọn kép, Thử thách, Vượt rào, Gờ giảm tốc, Vé vượt) → server tự động:
  1. Đưa xe vào bãi (xe hiện ở giá để xe).
  2. **Xóa chủ** → xe về trạng thái `available` như mọi xe bình thường. **Bất kỳ đội nào cũng lấy được**, kể cả đội vừa để xe; ai tới trước được trước.
  3. Báo cho người chơi: "Xe của bạn đã được để ở bãi xe cạnh điểm. Trong lúc bạn làm thử thách, đội khác có thể lấy mất!"
- **Làm xong thử thách**: nếu xe vẫn còn ở bãi, người chơi lấy lại như lấy xe mới (bấm `F`). Nếu đã bị lấy thì đi bộ hoặc lấy chiếc xe khác đang có ở bãi.
- **Lộ trình bắt buộc đi bộ**: khi mở mật thư có `transport.mandatory = "walk"`, xe cũng được để vào bãi và trở về bình thường như trên (không biến mất).
- Xe ở bãi không có chủ nên không bị luật "bỏ lại thì biến mất". Mỗi bãi giữ tối đa `bikeParking.maxBikes` (6) xe; vượt quá thì xe để lâu nhất biến mất.

### 6.5 Luật phương tiện trong mật thư
- `"transport": { "allowed": "any" }` (mặc định): đi bộ hoặc dùng xe đạp nhặt được.
- `"transport": { "mandatory": "walk" }`: **bắt buộc đi bộ**.
  - Suốt lộ trình này game **chặn việc lên xe** và báo "Lộ trình này bắt buộc đi bộ".
  - Server vẫn kiểm tra tốc độ di chuyển. Vượt tốc độ đi bộ (`footSpeed`, cộng sai số 10%) trong lộ trình bắt buộc đi bộ (client bị can thiệp) → phạt `walkOnlyViolationMinutes` và báo cho Host.
- HUD luôn hiện icon luật phương tiện của lộ trình hiện tại.

### 6.6 Hiển thị, vật lý & âm thanh
- Xe trống có hiệu ứng lấp lánh nhẹ khi người chơi tới gần (≤ 30 m). Xe **không hiện trên minimap/bản đồ của người chơi** (chỉ Host thấy toàn bộ).
- Người chơi khác đang đạp xe hiện đồng bộ (xe + animation đạp), vẫn ở dạng ghost (không va chạm).
- Vật lý xe đạp đơn giản hóa: nghiêng khi cua, phanh, ma sát giảm trên đá lát. Không đi được bậc thang.
- Âm thanh: chuông xe đạp, tiếng lốp trên đá lát, tiếng ngã xe.

## 7. NHIỀU ĐỘI CHUNG MỘT THẾ GIỚI (PRESENCE)

- **Đăng nhập**: không cần tài khoản. Host tạo đội và cấp **mã đội** (6 ký tự). Người chơi chỉ cần nhập mã đội. **Mỗi đội = 1 người chơi**; một mã đội chỉ được đăng nhập trên 1 thiết bị cùng lúc. Vào lại bằng mã đội thì tiếp tục đúng tiến trình cũ (mục 8.10).
- **Đồng bộ vị trí**: mỗi client gửi vị trí, hướng, animation, đang đi bộ hay đạp xe **5 lần/giây** (mục 3 – tiết kiệm hạn mức); server gộp và phát lại, mỗi client chỉ nhận người chơi trong bán kính quan tâm (500 m); client nội suy mượt (buffer ~200 ms).
- **Thấy nhau khi di chuyển**: các đội khác hiện trong thế giới 3D với màu áo và bảng tên đội, ở dạng **ghost (không va chạm)**, nên không ai chặn đường được ai. Chỉ hiển thị trong `presence.renderRadius` (mặc định 300 m).
- **Minimap**: mặc định **không** hiện chấm của đội khác (`showOthersOnMinimap: false`) – chỉ biết nhau khi nhìn thấy, giống thật.
- **Bảng "Tại điểm này"** (ZonePanel): khi đứng trong vùng của một điểm lộ trình/thử thách, HUD hiện danh sách các đội đang có mặt ở đó và trạng thái **nhìn thấy được** của họ, ví dụ:
  - "Đội Xanh – đang làm Lựa chọn kép: nhánh A"
  - "Đội Vàng – đang làm Thử thách 2"
  - "Đội Đỏ – đang chờ Host duyệt"
  - "Đội Tím – vừa rời đi 2 phút trước"
  Không hiển thị thứ hạng hay tiến độ chi tiết của đội khác.
- **Tương tác nhẹ**: bấm phím để chào/vẫy tay, bấm còi. Không có chat giữa các đội.
- Mất kết nối, F5 hoặc tắt trình duyệt → vào lại tiếp tục đúng chỗ cũ (mục 8.10). Trong lúc đội offline, nhân vật của đội bị ẩn khỏi thế giới của các đội khác và không tính trong bảng "Tại điểm này".

## 8. LUẬT ĐUA – CƠ CHẾ TUẦN TỰ

### 8.1 Máy trạng thái của mỗi đội (server)
Chặng là **một danh sách bước theo thứ tự** (file cấu hình mục 10). Mỗi đội có con trỏ `currentStepIndex`. Đội **chỉ nhận mật thư bước tiếp theo khi server xác nhận đã xong bước hiện tại**. Mọi chuyển trạng thái được ghi vào bảng `race_events` (thời điểm, đội, loại sự kiện, dữ liệu).

Ngoài ra có bảng tổng hợp `step_progress` (1 dòng cho mỗi đội × mỗi bước) để màn hình Host đọc nhanh: `arrived_at` (lần đầu vào vùng), `clue_opened_at`, `task_started_at`, `completed_at`, `branch`, `branch_switches`, `wrong_answers`, `penalty_minutes`, `transport_used`, `bike_distance_m`, `bike_lost_at_rack` (xe bị đội khác lấy khi đang làm thử thách), `skipped_by` (fast_forward / express_pass), và cho nhiệm vụ Host duyệt: `submitted_at`, `decided_at`, `decided_by`, `rejections`, `approval_wait_seconds`. Mốc thời gian lưu theo UTC và do server ghi (không tin đồng hồ của client).

Định nghĩa "hoàn thành" của từng loại bước:
- `route_info`: tới đúng điểm đến và mở hộp mật thư ở đó. Riêng lộ trình dẫn tới Chặng dừng: hoàn thành khi vào vùng Chặng dừng.
- `detour` / `challenge` / `roadblock` / `speed_bump` / `fast_forward` với `verification: "auto"`: server xác nhận nhiệm vụ đạt.
- Nhiệm vụ có `verification: "host_approval"`: **thời điểm Host bấm Duyệt**.
- `pit_stop`: check-in trên thảm (sau khi đã chờ hết phạt) = **giờ về đích**.

Luồng của chặng demo (mục 10.1):

```
CHỜ XUẤT PHÁT → Lộ trình 1 → Lộ trình 2 → LỰA CHỌN KÉP → Lộ trình 3 → THỬ THÁCH 1 →
Lộ trình 4 → Lộ trình 5 → THỬ THÁCH 2 (Host duyệt) → Lộ trình 6 → VỀ ĐÍCH
```

### 8.2 Hộp mật thư & geofence
- Mỗi điểm có tọa độ lat/lon + bán kính (15–30 m). Tại đó đặt **hộp mật thư có cờ vàng–đỏ** (có ánh sáng nhẹ để dễ thấy khi tới gần, không hiện trên bản đồ).
- Đội vào vùng → bấm `F` → client gửi yêu cầu → server kiểm tra: đúng bước hiện tại, vị trí nằm trong vùng → trả về mật thư và ghi lại thời điểm.
- Nếu đội chưa tới lượt bước đó (ví dụ đi nhầm tới điểm sau), hộp mật thư không mở được.

### 8.3 Mật thư
- Hiệu ứng mở phong bì, thẻ mật thư có tiêu đề theo loại (Thông tin lộ trình / Lựa chọn kép / Vượt rào / Chặng dừng) và màu riêng.
- Nội dung có thể là chỉ dẫn rõ ràng hoặc câu đố về địa điểm ("Tìm nơi Napoleon yên nghỉ").
- Mọi mật thư đã nhận được lưu vào **Sổ mật thư** (mục 8.11) để đọc lại bất cứ lúc nào.

### 8.4 Lựa chọn kép (Detour)
- Mật thư giới thiệu 2 nhánh (tên + mô tả ngắn); người chơi chọn 1 nhánh.
- Được **đổi nhánh**, nhưng mất toàn bộ tiến độ nhánh cũ (Host thấy lịch sử đổi nhánh).
- Xong nhánh → nhận mật thư tiếp theo.

### 8.5 Vượt rào (Roadblock)
- Khác Lựa chọn kép, Vượt rào là **một nhiệm vụ bắt buộc, không có nhánh để chọn** (thường khó hơn).
- Mật thư ban đầu **chỉ hiện câu gợi ý** (ví dụ "Ai có đôi mắt tinh nhất?"); người chơi bấm **"Nhận thử thách"** mới thấy nội dung nhiệm vụ.
- Chỉ bỏ qua được bằng cách **bỏ cuộc** (bị phạt nặng) hoặc dùng **Vé ưu tiên**.

### 8.6 Chặng dừng (Pit Stop)
- Thảm dừng chân + **NPC người dẫn chương trình** (nhân vật tự tạo). Người chơi bước lên thảm → NPC thông báo: "Đội Xanh, các bạn là đội thứ 1!".
- Nếu đội có **phút phạt**, phải đứng chờ cạnh thảm hết thời gian phạt rồi mới được check-in; đội tới sau có thể check-in trước trong lúc đó.
- Đội cuối cùng: bị loại hoặc được cứu (`eliminationLeg: true/false`). Chặng không loại → đội cuối nhận **Gờ giảm tốc** ở chặng sau.
- Sau khi check-in, đội chuyển sang chế độ khán giả (bay camera tự do, xem các đội còn lại).

### 8.7 Xuất phát
- Host bấm đếm ngược → tất cả đội nhận mật thư đầu tiên cùng lúc, hoặc **xuất phát lệch giờ** theo kết quả chặng trước (`startOffsets` trong cấu hình).

### 8.8 Thử thách (Challenge)
- Nhiệm vụ bắt buộc tại một điểm, không có nhánh để chọn (giống Vượt rào nhưng không bắt buộc có câu gợi ý).
- Nếu có `teaser`, người chơi thấy câu gợi ý trước, bấm **"Nhận thử thách"** mới thấy nội dung.
- Bỏ qua được bằng **bỏ cuộc** (phạt `quitTaskMinutes`) hoặc **Vé ưu tiên**.

### 8.9 Host duyệt (xác nhận thủ công qua Facebook)
Áp dụng cho mọi nhiệm vụ (nhánh Lựa chọn kép, Thử thách, Vượt rào...) có `verification: "host_approval"`: game không tự chấm được, người chơi gửi bằng chứng (ảnh/video/screenshot) qua Facebook cho Host kiểm tra.

Luồng phía người chơi:
1. Tới điểm → đọc nhiệm vụ trên thẻ mật thư (mô tả, ảnh minh họa, hướng dẫn gửi bài `proofInstruction`).
2. Thẻ nhiệm vụ hiện **mã bài nộp** duy nhất (ví dụ `XANH-T2-1042`, có nút Copy) để dán kèm tin nhắn, giúp Host biết bài của đội nào, thử thách nào.
3. Nút **"Mở Facebook gửi bài"** mở `hostApproval.contactUrl` ở tab mới.
4. Làm xong và gửi bài → bấm **"Tôi đã gửi bài – chờ Host duyệt"** → server ghi `submitted_at`, trạng thái chuyển sang `pending_approval`.
5. Trong lúc chờ: HUD hiện "Đang chờ Host duyệt · 02:15" (đếm lên). Người chơi **chưa nhận được mật thư tiếp theo**; không đổi nhánh Lựa chọn kép được khi đang chờ.
6. Host bấm **Duyệt** → người chơi nghe âm báo + thông báo "Host đã duyệt! Mật thư mới đã vào Sổ mật thư." và nhận ngay mật thư tiếp theo.
7. Host bấm **Chưa đạt** → người chơi thấy lý do, trạng thái quay lại "đang làm", làm lại và gửi lại (không giới hạn số lần, số lần bị từ chối được ghi lại).

Tính giờ công bằng:
- Mỗi khoảng từ lúc gửi bài tới lúc Host quyết định (duyệt hoặc từ chối) được cộng vào `approval_wait_seconds`.
- Khi `hostApproval.approvalWaitCounts = false` (mặc định), tổng thời gian này được **trừ khỏi thời gian chính thức** để đội không bị thiệt vì Host duyệt chậm.
- Khi đó, tại Chặng dừng, NPC chỉ nói "Bạn đã về đích! Thứ hạng chính thức sẽ được Host công bố." Thứ hạng chính thức do Host công bố từ màn hình Host (mục 13.8).

### 8.10 Lưu tiến trình & vào lại game
Mục tiêu: người chơi lỡ bấm F5, tắt tab, mất mạng hay đổi sang máy khác thì **mở lại web, nhập đúng mã đội là vào lại đúng chỗ cũ**, không mất tiến trình, mật thư hay xe đạp.

**Lưu ở đâu**
- Mọi trạng thái đua của đội lưu **trên server (SQLite của Durable Object `RaceRoom`)**, không phụ thuộc trình duyệt:
  - bước hiện tại, Sổ mật thư, nhánh Lựa chọn kép đã chọn;
  - tiến độ nhiệm vụ đang làm, trạng thái chờ Host duyệt, phạt;
  - xe đạp đang giữ (và đang ngồi trên xe hay không);
  - **vị trí + hướng nhìn cuối cùng**.
- **Vị trí**: server ghi vị trí hợp lệ gần nhất xuống DB **mỗi 2 giây** và **ngay khi mất kết nối**. Không tin mù quáng vị trí client gửi lên; vị trí phải qua kiểm tra tốc độ.
- **Server khởi động lại** (deploy mới, crash): state của room được dựng lại từ DB, các client tự kết nối lại và tiếp tục.

**Vào lại**
- Mở web → nhập mã đội → màn hình **"Chào mừng trở lại, Đội Xanh!"** tóm tắt:
  - bước hiện tại, thời gian đua đã chạy;
  - "Bạn có 1 mật thư mới" nếu Host đã duyệt bài trong lúc đội vắng mặt.
- Bấm **"Tiếp tục"** → nhân vật xuất hiện **đúng chỗ đứng lần cuối**, đúng hướng nhìn, đang ngồi trên xe hay không cũng như cũ. HUD, Sổ mật thư và xe đạp giữ nguyên.
- Trình duyệt nhớ mã đội (`localStorage`, bọc try/catch) để điền sẵn, nhưng vẫn cần bấm "Vào lại". Nhập sai mã 5 lần liên tiếp → khóa 1 phút.
- Đăng nhập trên thiết bị mới → thiết bị cũ bị ngắt và thấy "Đội của bạn vừa đăng nhập trên thiết bị khác".
- Vị trí cũ không hợp lệ (kẹt trong tường, dưới nước) → đặt lại lên vỉa hè gần nhất trong bán kính 20 m.

**Trong lúc offline**
- **Đồng hồ đua vẫn chạy** (thời gian offline không được bù).
- Nhân vật bị ẩn khỏi thế giới của các đội khác.
- Xe đang giữ vẫn thuộc về đội, đứng yên tại chỗ và khóa (mục 6.3). Nếu đội không bao giờ quay lại, Host có nút "Giải phóng xe" (mục 13.9).
- Nếu lúc thoát xe đang nằm ở bãi (vì đội đang làm thử thách) thì xe không còn là của đội; luật bãi xe ở mục 6.4 vẫn áp dụng bình thường.

**Nhiệm vụ đang làm dở khi thoát**
- `find_objects`: giữ nguyên các vật đã nhặt.
- `answer` / `cipher` / `observe_answer` / `binocular_scan`: giữ số lần nhập sai và thời gian bị khóa.
- Lượt có tính giờ đang chạy (`delivery`, `timed_drive`, `memory_ui`): hủy lượt đó, vào lại làm lại từ đầu lượt.
- Đang chờ Host duyệt: vẫn chờ. Host duyệt trong lúc đội offline thì vào lại đã có mật thư tiếp theo.

**Sau khi về đích / chặng kết thúc**
- Vào lại thấy màn hình kết quả và chế độ khán giả.
- Sau khi Host kết thúc chặng, đội vẫn vào được bằng mã đội để xem Sổ mật thư và kết quả (chỉ đọc).

### 8.11 Sổ mật thư (xem lại toàn bộ mật thư của chặng)
- Mở bằng phím `Tab` hoặc nút hình cuốn sổ trên HUD. **Mở được mọi lúc**:
  - khi đi bộ, khi đạp xe (xe tự dừng lại khi mở sổ);
  - khi đang làm thử thách, khi chờ Host duyệt;
  - sau khi đã về đích, và cả sau khi thoát ra vào lại.
- **Liệt kê theo đúng thứ tự tất cả mật thư đội đã nhận trong chặng**, mỗi mục gồm:
  - loại (màu + icon: Lộ trình / Lựa chọn kép / Thử thách / Về đích), nội dung đầy đủ, ảnh/video minh họa, luật phương tiện;
  - Lựa chọn kép: nội dung cả 2 nhánh + nhánh đội đã chọn (và lịch sử đổi nhánh);
  - Thử thách: mô tả, hướng dẫn gửi bài, **mã bài nộp** (có nút Copy), nút mở Facebook của Host.
- **Trạng thái mỗi mục**: đang làm / chờ Host duyệt / bị "Chưa đạt" (kèm lý do) / đã xong (giờ hoàn thành + thời gian làm bước đó).
- Mật thư đang làm được **ghim đầu trang**, có nút "Về mật thư hiện tại".
- **Các bước chưa mở bị ẩn hoàn toàn**: sổ chỉ hiện những mật thư đội đã nhận. Không có ô khóa, không hiện số thứ tự tổng hay thanh tiến độ kiểu "3/10", nên người chơi **không biết chặng còn bao nhiêu bước**. Cấu hình `clueBook.showLockedSlots = false` (mặc định; để `true` nếu sau này muốn hiện ô khóa).
- Mỗi lần mở, dữ liệu **tải lại từ server** (không lưu nội dung mật thư trong trình duyệt), nên vào lại trên máy khác vẫn đủ.
- Host sửa lỗi chính tả mật thư → sổ cập nhật ngay, mục đó có nhãn "đã cập nhật".

## 9. YẾU TỐ ĐẶC BIỆT (bật/tắt trong cấu hình chặng)

### 9.1 Quay đầu (U-Turn)
- Bảng Quay đầu đặt ngay sau khi hoàn thành Lựa chọn kép.
- Đội vừa xong Lựa chọn kép có thể dùng Quay đầu lên **một đội chưa đi qua bảng**. Mỗi đội dùng tối đa `uTurnUsesPerRace` lần trong cả cuộc đua.
- Đội bị Quay đầu, khi tới bảng, thấy ảnh/tên đội mình → **bắt buộc quay lại làm nốt nhánh còn lại**.
- Chế độ **Quay đầu ẩn danh** (`blind: true`): không hiện tên đội đã dùng.

### 9.2 Nhường đường (Yield)
- Bảng đặt trước Lựa chọn kép. Đội bị Nhường đường phải đứng chờ **đồng hồ cát** `yieldMinutes` phút mới được đi tiếp.

### 9.3 Vé vượt (Fast Forward)
- Mật thư Vé vượt đi kèm một mật thư lộ trình. **Chỉ đội đầu tiên nhận được**; đội tới sau thấy "Vé vượt đã có đội nhận". Mỗi đội chỉ dùng 1 lần trong cả cuộc đua.
- Hoàn thành nhiệm vụ Vé vượt → được đi thẳng tới Chặng dừng, bỏ qua các bước còn lại.

### 9.4 Vé ưu tiên (Express Pass)
- Host trao cho đội. Dùng để bỏ qua 1 nhiệm vụ (không dùng được ở bước cuối), phải dùng trước hạn `expiresAfterLeg`.

### 9.5 Gờ giảm tốc (Speed Bump)
- Đội bị Gờ giảm tốc phải làm thêm một nhiệm vụ phụ tại vị trí cấu hình trước khi mở được mật thư tiếp theo. Đội khác không thấy nhiệm vụ này.

### 9.6 Phạt giờ
- Đi xe trong lộ trình bắt buộc đi bộ (phát hiện bằng tốc độ, mục 6.5): +`walkOnlyViolationMinutes`.
- Bỏ nhiệm vụ (bấm "Bỏ cuộc" ở Thử thách/Vượt rào/Lựa chọn kép để nhận mật thư tiếp): +`quitTaskMinutes`.
- Host phạt thủ công kèm lý do.
- Mọi án phạt hiện trong nhật ký của đội và được tính khi tới Chặng dừng (mục 8.6).

## 10. FILE CẤU HÌNH CHẶNG (JSON, chỉ nằm trên server)

- Schema định nghĩa bằng **zod** trong `/shared`; server từ chối nạp file sai schema và báo lỗi rõ ràng.
- Nội dung chặng sửa được bằng **màn hình Host > Nội dung chặng** (mục 13.2), không cần sửa code. File JSON chỉ dùng để nạp lần đầu, hoặc để Nhập/Xuất qua màn hình Host.
- **Chuỗi rỗng `""` / mảng rỗng `[]` = nội dung Host sẽ điền sau.** Schema phải cho phép nạp file còn trống (chế độ nháp), nhưng màn hình Host phải liệt kê các ô còn trống và khóa nút Xuất phát cho tới khi điền đủ (mục 13.1).
- **Đáp án phải dựa trên thứ có trong game** (vật thể game tự đặt, biển tên đường từ OSM) hoặc trên bài làm Host tự chấm; không dựa trên chi tiết đời thực mà bản đồ có thể không dựng lại đúng.

### 10.1 Chặng demo (bắt buộc dùng đúng cấu trúc này)

Chặng demo gồm **10 bước theo đúng thứ tự: 6 lộ trình, 1 Lựa chọn kép, 2 Thử thách, 1 điểm về đích**:

| # | ID | Loại | Địa điểm | Phương tiện | Cách xác nhận |
|---|---|---|---|---|---|
| 1 | L1 | Lộ trình 1 | Concorde → Khải Hoàn Môn | tự chọn | tới điểm + mở hộp mật thư |
| 2 | L2 | Lộ trình 2 | → Trocadéro | tự chọn | tới điểm + mở hộp mật thư |
| 3 | D1 | Lựa chọn kép | tại Trocadéro | – | nhánh A: tự động (nhập đáp án) · nhánh B: **Host duyệt** |
| 4 | L3 | Lộ trình 3 | → chân tháp Eiffel | bắt buộc đi bộ | tới điểm + mở hộp mật thư |
| 5 | T1 | Thử thách 1 | tại Eiffel | – | tự động (nhập đáp án) |
| 6 | L4 | Lộ trình 4 | → cầu Alexandre III | tự chọn | tới điểm + mở hộp mật thư |
| 7 | L5 | Lộ trình 5 | → bảo tàng Orsay | tự chọn | tới điểm + mở hộp mật thư |
| 8 | T2 | Thử thách 2 | tại Orsay | – | **Host duyệt** |
| 9 | L6 | Lộ trình 6 | → kim tự tháp Louvre | bắt buộc đi bộ | tới vùng Chặng dừng |
| 10 | PS | Về đích | Louvre | – | check-in trên thảm = giờ về đích |

- "Tự chọn" = đi bộ hoặc dùng xe đạp nhặt được trên đường; "bắt buộc đi bộ" = game chặn lên xe (mục 6.5).
- Mật thư các lộ trình đã có nội dung mẫu (Host sửa được). **Toàn bộ nội dung Lựa chọn kép và 2 Thử thách để trống** để Host điền sau.
- Cách xác nhận (`verification`) của từng nhiệm vụ Host đổi được: `auto` hoặc `host_approval`.
- Các yếu tố đặc biệt (Quay đầu, Nhường đường, Vé vượt, Gờ giảm tốc) **tắt** trong chặng demo, chỉ bật Vé ưu tiên; Host bật lại được trong cấu hình.
- Ý nghĩa các trường của `task`:
  - `title`, `description`, `media` (link ảnh/video minh họa): nội dung hiện cho người chơi.
  - `location`: `null` = làm ngay tại điểm vừa tới; hoặc `{name, lat, lon, radius}` nếu nhiệm vụ ở khu vực khác.
  - `kind`: loại mini-game ở mục 11.
  - `answers`: danh sách đáp án chấp nhận (dùng khi `verification = auto`).
  - `proofInstruction`: hướng dẫn người chơi gửi bài qua Facebook (dùng khi `verification = host_approval`).
  - `timeLimitMinutes`: giới hạn thời gian, `null` = không giới hạn.
- `movement`: tốc độ đi bộ chuẩn và hệ số tốc độ xe đạp (1,3) – mục 6.1.
- `vehicles`: thông số xe đạp xuất hiện ngẫu nhiên và bãi xe cạnh điểm (mục 6.2–6.4). Muốn đặt bãi xe chính xác cho một điểm, thêm `"bikeParking": {"lat": ..., "lon": ...}` vào `destination` của lộ trình đó.
- `clueBook.showLockedSlots`: `false` = ẩn hoàn toàn các mật thư chưa mở trong Sổ mật thư (mục 8.11).
- `hostApproval.contactUrl`: link Facebook/Messenger của Host (Host điền sau).
- `hostApproval.approvalWaitCounts`: `false` = thời gian chờ Host duyệt được trừ khỏi thời gian chính thức (mục 8.9).

Claude Code tạo file `worker/legs/paris-demo.json` với **đúng nội dung sau** (tọa độ lấy xấp xỉ, kiểm tra lại bằng centroid OSM, ưu tiên OSM nếu lệch):

> **Đã chỉnh sau khi kiểm tra OSM – xem §17.4.** File `worker/legs/paris-demo.json` là bản chuẩn; không đổi nó về khối JSON dưới đây.

```json
{
  "id": "paris-demo",
  "title": "Chặng Demo – Paris",
  "timezone": "Asia/Ho_Chi_Minh",
  "eliminationLeg": false,
  "mapLabels": "streets-only",
  "presence": {
    "renderRadius": 300,
    "showOthersOnMinimap": false
  },
  "penalties": {
    "walkOnlyViolationMinutes": 15,
    "quitTaskMinutes": 30
  },
  "movement": {
    "footSpeed": 4.0,
    "bikeSpeedMultiplier": 1.3
  },
  "vehicles": {
    "corridorMeters": 150,
    "minDistanceFromCheckpoint": 100,
    "initialPerSegment": [
      0,
      1
    ],
    "spawnIntervalMinutes": 3,
    "spawnChance": 0.3,
    "maxAvailablePerSegment": 1,
    "decoyRatio": 0.4,
    "noSpawnNearPlayerMeters": 120,
    "abandonMeters": 200,
    "abandonSeconds": 60,
    "bikeParking": {
      "offsetMeters": 20,
      "maxBikes": 6
    }
  },
  "clueBook": {
    "showLockedSlots": false
  },
  "hostApproval": {
    "contactLabel": "Gửi bài qua Facebook cho Host",
    "contactUrl": "",
    "approvalWaitCounts": false
  },
  "specials": {
    "uTurn": {
      "enabled": false
    },
    "yield": {
      "enabled": false
    },
    "fastForward": {
      "enabled": false
    },
    "speedBump": {
      "enabled": false
    },
    "expressPass": {
      "enabled": true
    }
  },
  "start": {
    "name": "Cột obelisk – Quảng trường Concorde",
    "lat": 48.86548,
    "lon": 2.32115
  },
  "steps": [
    {
      "id": "L1",
      "type": "route_info",
      "label": "Lộ trình 1",
      "clue": "Ngược đại lộ đẹp nhất thế giới về phía tây, tới cổng vòm khổng lồ nằm giữa vòng xuyến có 12 đại lộ tỏa ra. Hộp mật thư đặt ở đầu đại lộ. Phương tiện: tự chọn.",
      "transport": {
        "allowed": "any"
      },
      "destination": {
        "name": "Khải Hoàn Môn – đầu đại lộ Champs-Élysées",
        "lat": 48.8734,
        "lon": 2.2966,
        "radius": 30
      }
    },
    {
      "id": "L2",
      "type": "route_info",
      "label": "Lộ trình 2",
      "clue": "Tìm nơi có tầm nhìn đẹp nhất để ngắm 'bà đầm sắt' từ bờ bên kia sông Seine. Phương tiện: tự chọn.",
      "transport": {
        "allowed": "any"
      },
      "destination": {
        "name": "Quảng trường Trocadéro",
        "lat": 48.8621,
        "lon": 2.2876,
        "radius": 35
      }
    },
    {
      "id": "D1",
      "type": "detour",
      "label": "Lựa chọn kép",
      "clue": "",
      "branches": [
        {
          "id": "A",
          "name": "",
          "summary": "",
          "task": {
            "title": "",
            "description": "",
            "media": [],
            "location": null,
            "kind": "answer",
            "verification": "auto",
            "answers": [],
            "proofInstruction": "",
            "timeLimitMinutes": null
          }
        },
        {
          "id": "B",
          "name": "",
          "summary": "",
          "task": {
            "title": "",
            "description": "",
            "media": [],
            "location": null,
            "kind": "free",
            "verification": "host_approval",
            "answers": [],
            "proofInstruction": "",
            "timeLimitMinutes": null
          }
        }
      ]
    },
    {
      "id": "L3",
      "type": "route_info",
      "label": "Lộ trình 3",
      "clue": "Băng qua sông, tới ngay dưới chân 'bà đầm sắt'. Bắt buộc: đi bộ.",
      "transport": {
        "mandatory": "walk"
      },
      "destination": {
        "name": "Chân tháp Eiffel",
        "lat": 48.8583,
        "lon": 2.2945,
        "radius": 40
      }
    },
    {
      "id": "T1",
      "type": "challenge",
      "label": "Thử thách 1",
      "teaser": "",
      "task": {
        "title": "",
        "description": "",
        "media": [],
        "location": null,
        "kind": "answer",
        "verification": "auto",
        "answers": [],
        "proofInstruction": "",
        "timeLimitMinutes": null
      }
    },
    {
      "id": "L4",
      "type": "route_info",
      "label": "Lộ trình 4",
      "clue": "Men theo bờ sông Seine về phía đông, tới cây cầu mạ vàng lộng lẫy nhất Paris. Hộp mật thư nằm trên cầu. Phương tiện: tự chọn.",
      "transport": {
        "allowed": "any"
      },
      "destination": {
        "name": "Cầu Alexandre III",
        "lat": 48.8636,
        "lon": 2.3137,
        "radius": 35
      }
    },
    {
      "id": "L5",
      "type": "route_info",
      "label": "Lộ trình 5",
      "clue": "Tới nhà ga xe lửa cũ nay là bảo tàng của những bức tranh Ấn tượng. Phương tiện: tự chọn.",
      "transport": {
        "allowed": "any"
      },
      "destination": {
        "name": "Quảng trường trước bảo tàng Orsay",
        "lat": 48.8598,
        "lon": 2.3258,
        "radius": 35
      }
    },
    {
      "id": "T2",
      "type": "challenge",
      "label": "Thử thách 2",
      "teaser": "",
      "task": {
        "title": "",
        "description": "",
        "media": [],
        "location": null,
        "kind": "free",
        "verification": "host_approval",
        "answers": [],
        "proofInstruction": "",
        "timeLimitMinutes": null
      }
    },
    {
      "id": "L6",
      "type": "route_info",
      "label": "Lộ trình 6",
      "clue": "Chặng dừng! Băng qua sông, tới kim tự tháp kính trước cung điện từng là nơi ở của các vua Pháp. Người dẫn chương trình đang chờ bạn. Bắt buộc: đi bộ.",
      "transport": {
        "mandatory": "walk"
      },
      "destination": {
        "name": "Kim tự tháp kính – Bảo tàng Louvre",
        "lat": 48.861,
        "lon": 2.3358,
        "radius": 20
      }
    },
    {
      "id": "PS",
      "type": "pit_stop",
      "label": "Về đích",
      "destination": {
        "name": "Kim tự tháp kính – Bảo tàng Louvre",
        "lat": 48.861,
        "lon": 2.3358,
        "radius": 20
      }
    }
  ]
}
```

## 11. THƯ VIỆN THỬ THÁCH (mini-game dùng lại được)

Mỗi loại là một module trong `client/src/race/challenges/`, nhận tham số từ cấu hình; **kết quả luôn do server xác nhận** (client gửi sự kiện/đáp án, server kiểm tra).

| `kind` | Mô tả |
|---|---|
| `find_objects` | Tìm và nhặt N vật thể mà game đặt trong một khu vực (nhặt bằng `F`). |
| `delivery` | Chở N món hàng tới N điểm trong giới hạn thời gian; va chạm mạnh làm rơi hàng, phải quay lại lấy. |
| `observe_answer` | Quan sát thế giới 3D (đếm vật thể, đọc biển tên đường), nhập đáp án. |
| `cipher` | Giải mã (Caesar, Morse, ghép chữ cái từ biển tên đường...), nhập mật mã. |
| `photo_match` | Nhận một bức ảnh; phải tới đúng chỗ và quay camera đúng hướng (sai số ≤ 10 m, ≤ 15°) rồi bấm "Chụp". |
| `binocular_scan` | Từ điểm cao, bật chế độ ống nhòm (zoom), tìm vật thể/cờ trên các địa danh ở xa, nhập tên địa danh. **Tận dụng việc bản đồ đúng vị trí thật.** |
| `timed_drive` | Lái/đạp xe qua chuỗi cổng checkpoint trong thời gian quy định. |
| `memory_ui` | Mini-game 2D trên màn hình (lật thẻ, ghép hình). |
| `answer` | Chỉ hiện nội dung nhiệm vụ + ô nhập đáp án (dạng đơn giản nhất, dùng khi Host tự soạn câu đố). |
| `free` | Nhiệm vụ tự do: chỉ hiện nội dung, game không tự chấm; dùng kèm `verification: "host_approval"`. |

Xe dùng trong `delivery` / `timed_drive` là **xe riêng của thử thách**: chỉ xuất hiện cho đội đang làm, biến mất khi xong thử thách, không liên quan tới hệ thống xe ngẫu nhiên ở mục 6.

Mọi `kind` đều dùng được với cả 2 cách xác nhận: `auto` (server tự chấm) và `host_approval` (mục 8.9).

Quy tắc chung khi nhập đáp án:
- Chuẩn hóa trước khi so sánh: chữ thường, bỏ dấu, bỏ khoảng trắng thừa.
- Sai 3 lần liên tiếp thì khóa 30 giây (cấu hình được).
- Thông báo kiểu chương trình: "Chưa đúng, hãy thử lại!".

## 12. GIAO DIỆN HUD KIỂU GTA + CUỘC ĐUA

- **Minimap tròn góc dưới trái**: đường, tòa nhà, công viên, sông Seine, xoay theo camera; tự zoom ra khi đi nhanh.
- **Bản đồ lớn (`M`)**: kéo/zoom, đặt waypoint, đường đi GPS (A*) tới điểm người chơi tự đặt.
- **Góc trên phải**: đồng hồ đua (thời gian đã chạy), tổng phút phạt.
- Khi đang đạp xe: hiện icon xe đạp và đồng hồ tốc độ (km/h).
- **Góc trên trái – thẻ nhiệm vụ hiện tại**: loại bước (icon + màu), tóm tắt mật thư, phương tiện được phép.
- **Góc dưới phải**: tên quận + tên đường hiện tại khi đổi khu vực, font phong cách GTA (font miễn phí có license).
- **Bảng "Tại điểm này"** (mục 7).
- Toast thông báo: "Đội Đỏ đã dùng Quay đầu lên đội bạn!", "Vé vượt đã có đội nhận", "Chậm một bước! Xe đã có người lấy.", "Lộ trình này bắt buộc đi bộ".
- Menu Pause: cài đặt đồ họa, điều khiển, luật đua (`docs/RACE_RULES.md` hiển thị trong game).
- Dòng ghi nguồn: "© OpenStreetMap contributors".

## 13. MÀN HÌNH HOST (`/host`, mật khẩu là Worker secret `HOST_PASSWORD`)

Giao diện web tối ưu cho màn hình máy tính/màn hình lớn. Host kết nối WebSocket tới cùng Durable Object `RaceRoom` với token quyền Host, dữ liệu cập nhật **thời gian thực (≤ 1 giây)**. Đây là nơi duy nhất thấy toàn bộ tiến trình của mọi đội. Cho phép nhiều Host đăng nhập cùng lúc.

### 13.1 Chuẩn bị
- Tạo cuộc đua, tạo đội (tên đội, màu, tên người chơi) → sinh mã đội; in/copy danh sách mã.
- Nạp và kiểm tra file cấu hình chặng (báo lỗi schema); **xem trước lộ trình** trên bản đồ (các điểm đánh số theo thứ tự bước).
- **Kiểm tra sẵn sàng**: liệt kê mọi ô nội dung còn trống (ví dụ "Thử thách 2 – chưa có mô tả", "Chưa có link Facebook của Host"). Nút Xuất phát bị khóa cho tới khi điền đủ; có tùy chọn "Vẫn xuất phát" kèm hộp xác nhận.
- Danh sách đội: trạng thái kết nối (online/offline), **đã offline bao lâu**, số lần vào lại, ping, thiết bị.

### 13.2 Soạn nội dung chặng
Tab **"Nội dung chặng"**: danh sách 10 bước theo thứ tự, mỗi bước là một form mở rộng được:
- **Lộ trình**: nội dung mật thư, phương tiện (bắt buộc/cho phép), tên điểm đến, tọa độ + bán kính (bản đồ nhỏ xem trước vị trí, kéo chấm để chỉnh).
- **Lựa chọn kép**: lời dẫn, tên + mô tả ngắn 2 nhánh, nhiệm vụ của từng nhánh.
- **Thử thách**: câu gợi ý (tùy chọn), tiêu đề, mô tả, ảnh/video minh họa (dán link hoặc upload lên R2), loại nhiệm vụ (`kind`), **cách xác nhận (`auto` / `host_approval`)**, đáp án chấp nhận (nhập được nhiều đáp án, dùng cho `auto`), hướng dẫn gửi bài (dùng cho `host_approval`), giới hạn thời gian.
- **Phương tiện ngẫu nhiên**: form chỉnh khối `vehicles` (mật độ, chu kỳ xuất hiện, tỉ lệ xe mồi, luật xe bị bỏ lại, bãi xe cạnh điểm). Có nút "Xem trước hành lang đặt xe" vẽ các hành lang lên bản đồ.
- Nút **"Xem thử như người chơi"** hiện thẻ mật thư/nhiệm vụ đúng như trong game.
- Nút **Lưu**: kiểm tra schema, ghi vào SQLite của Durable Object, giữ lịch sử phiên bản (khôi phục được bản cũ). Khi lưu, trình duyệt Host tính lại hành lang đặt xe và gửi kèm (mục 3).
- Nút **Xuất JSON / Nhập JSON** để sao lưu hoặc chuyển nội dung chặng.
- Sau khi đã xuất phát: khóa các bước mà có đội đã mở; chỉ cho sửa lỗi chính tả kèm cảnh báo, bản sửa được đẩy lại cho các đội đang giữ mật thư đó.

### 13.3 Điều khiển cuộc đua
- **Đếm ngược & Xuất phát**, **Tạm dừng / Tiếp tục** (đồng hồ đua của mọi đội dừng theo), **Kết thúc chặng**.
- Múi giờ hiển thị theo `timezone` của chặng (mặc định `Asia/Ho_Chi_Minh`).

### 13.4 Hàng chờ duyệt (xác nhận thử thách)
Dùng cho mọi nhiệm vụ có `verification: "host_approval"` (mục 8.9).
- Khung **luôn hiển thị** ở cột phải màn hình Host, có số đếm trên tiêu đề; có âm thanh + thông báo trình duyệt khi có bài mới.
- Mỗi mục hiện: tên + màu đội, bước (ví dụ "Thử thách 2" hoặc "Lựa chọn kép – nhánh B"), **mã bài nộp**, giờ gửi, **thời gian đã chờ** (đếm lên), hướng dẫn chấm (`proofInstruction`).
- Sắp xếp theo thứ tự gửi (ai gửi trước duyệt trước).
- Hai nút lớn:
  - **"Duyệt – cho đi tiếp"** (xanh): server ghi hoàn thành và gửi ngay mật thư tiếp theo cho đội.
  - **"Chưa đạt – làm lại"** (đỏ): kèm ô lý do (có sẵn vài lý do nhanh), lý do được gửi cho người chơi.
- Sau khi bấm có thông báo **"Hoàn tác" trong 10 giây** để sửa bấm nhầm.
- Khi một Host đang xử lý một bài, bài đó bị khóa với các Host khác; server xử lý idempotent (bấm 2 lần không duyệt 2 lần).
- Nút Duyệt / Chưa đạt cũng có ngay trong ô tương ứng của Bảng tiến trình.
- Mọi quyết định (Host nào, lúc nào, lý do) được ghi vào nhật ký.

### 13.5 Bản đồ trực tiếp
- Bản đồ 2D (vẽ từ cùng dữ liệu GeoJSON, hiện đầy đủ tên địa danh): chấm màu + tên của **tất cả các đội**, các điểm lộ trình/thử thách.
- Vệt di chuyển 5 phút gần nhất của mỗi đội; click một đội để bám theo; tùy chọn mở **góc nhìn 3D bám theo đội đó** (client chế độ khán giả).
- Bên cạnh mỗi điểm: số đội đang có mặt ở đó.
- **Lớp "Phương tiện"** (bật/tắt): mọi xe đạp trên bản đồ, kể cả số xe đang nằm ở bãi của từng điểm.
  - Xám = còn trống, màu đội = đã có chủ, viền nét đứt = xe mồi.
  - Hiện số xe đang có, số xe đã được nhận, số xe đã biến mất.
- **Công cụ phương tiện**:
  - Click bản đồ để đặt thêm xe, xóa một xe.
  - Chỉnh mật độ xuất hiện (`spawnChance`, `maxAvailablePerSegment`) ngay trong lúc đua.
  - Tạm dừng / tiếp tục việc tự động đặt xe.

### 13.6 Bảng tiến trình (phần quan trọng nhất)
Dạng ma trận: **mỗi hàng = 1 đội**, **mỗi cột = 1 bước theo đúng thứ tự**. Với chặng demo: `L1 · L2 · Lựa chọn kép · L3 · Thử thách 1 · L4 · L5 · Thử thách 2 · L6 · Về đích`. Mỗi ô:
- **Xám** – chưa tới.
- **Vàng** – đang làm, kèm thời gian đã ở bước này (đếm lên theo thời gian thực).
- **Cam** – **đang chờ Host duyệt**, kèm thời gian chờ và 2 nút Duyệt / Chưa đạt.
- **Xanh** – đã xong, hiện **giờ hoàn thành (HH:mm:ss)** và **thời gian làm bước đó** (ví dụ "10:42:15 · 08:31").
- Icon phụ: nhánh đã chọn (A/B), đã đổi nhánh, số lần bị "Chưa đạt", Vé ưu tiên, phạt (và Quay đầu, Nhường đường, Vé vượt, Gờ giảm tốc khi bật).
- Rê chuột vào ô → chi tiết mọi mốc thời gian của bước đó, số lần nhập sai đáp án, thời gian chờ duyệt, quãng đường đạp xe, có bị lấy mất xe ở bãi không.

Các cột cuối: **Tổng phạt**, **Bù giờ chờ duyệt**, **Giờ về đích**, **Thời gian chính thức**, **Thứ hạng**.
- Bảng tự sắp xếp theo thứ hạng hiện tại: đội ở bước xa hơn đứng trên; cùng bước thì đội hoàn thành bước trước đó sớm hơn đứng trên.
- Mỗi cột bước có thể xem **thứ tự các đội hoàn thành bước đó** (ai tới Khải Hoàn Môn đầu tiên, ai xong Thử thách 1 nhanh nhất).
- Mốc thời gian hiển thị theo 2 dạng, bấm để chuyển: **giờ thực** (10:42:15) hoặc **thời gian kể từ lúc đội xuất phát** (T+00:27:40).

### 13.7 Dòng thời gian (timeline)
- Biểu đồ dạng Gantt: mỗi đội một hàng, mỗi bước là một đoạn màu theo thời gian; khoảng chờ Host duyệt vẽ sọc riêng. Nhìn ngay được đội nào mất nhiều thời gian ở bước nào.

### 13.8 Bảng về đích
- Thứ tự check-in tại Chặng dừng, giờ về đích, thời gian chính thức, khoảng cách với đội dẫn đầu (+mm:ss), đánh dấu đội bị loại / được cứu.
- **Thời gian chính thức** = giờ check-in − giờ xuất phát của đội − **bù giờ chờ duyệt** (khi `approvalWaitCounts = false`). Đã bao gồm thời gian đứng chờ phạt. Xuất phát lệch giờ thì tính theo giờ xuất phát riêng của từng đội.
- Vì có bù giờ, thứ tự bước lên thảm có thể khác thứ hạng chính thức. Host bấm **"Công bố kết quả"** để gửi thứ hạng chính thức tới mọi người chơi.
- **Chế độ trình chiếu**: bảng về đích + bản đồ toàn màn hình, ẩn các nút điều khiển, để chiếu hoặc livestream.

### 13.9 Nhật ký & công cụ xử lý
- **Nhật ký sự kiện thời gian thực**: tới điểm, mở mật thư, chọn/đổi nhánh, nhập sai đáp án, gửi bài chờ duyệt, Host duyệt/từ chối, vi phạm phương tiện, mất kết nối, vào lại (kèm vị trí khôi phục)...; lọc theo đội hoặc loại sự kiện.
- Công cụ: phạt thủ công kèm lý do, trao Vé ưu tiên, **giải phóng xe của đội offline quá lâu**, **xem Sổ mật thư của bất kỳ đội nào (đúng như đội đó đang thấy)**, đẩy đội sang bước tiếp theo (khi có bug), dịch chuyển người chơi bị kẹt, ghi chú cho từng đội. Mọi thao tác của Host cũng được ghi vào nhật ký.
- **Cảnh báo gian lận**: server kiểm tra tốc độ di chuyển (đi bộ ≤ `footSpeed`, xe đạp ≤ `footSpeed × bikeSpeedMultiplier`, cộng sai số); bất thường thì đánh dấu đỏ trên màn hình Host (không tự động phạt).

### 13.10 Xuất kết quả
- CSV/JSON: mỗi đội × mỗi bước với đầy đủ mốc thời gian (kể cả gửi bài, duyệt, thời gian chờ duyệt); bảng về đích.
- Ảnh PNG bảng xếp hạng để đăng lên nền tảng cuộc thi.
- *(Tùy chọn)* **Xem lại cuộc đua (replay)** từ log vị trí 1 lần/giây.

## 14. ĐỒ HỌA & HIỆU NĂNG

- Bầu trời động, chu kỳ ngày/đêm theo vị trí mặt trời thật tại Paris (giờ trong game cấu hình được cho từng chặng), đèn đường ban đêm, tháp Eiffel lấp lánh đầu mỗi giờ khi trời tối.
- Cascaded shadow map, fog che ranh giới chunk, bloom nhẹ, SMAA; đài phun nước có particle, chim bồ câu bay lên khi người chơi tới gần.
- Mục tiêu **60 FPS** trên laptop tầm trung, ≥ 30 FPS trên GPU tích hợp, chịu được **20 đội (20 người chơi)** cùng lúc, cộng màn hình Host.
- Chunk streaming, frustum culling, LOD, InstancedMesh, Draco/Meshopt, KTX2.
- Debug `F3`: FPS, draw call, số chunk, ping, số người chơi đang thấy, tọa độ lat/lon.

## 15. PHASE THỰC HIỆN (tuần tự, mỗi phase phải chạy được)

0. **Phase 0 – Chuẩn bị**: lưu toàn bộ prompt này vào `docs/SPEC.md`, viết `docs/RACE_RULES.md` (luật cho người chơi, tiếng Việt), `git init`, tạo `CLAUDE.md`, khung monorepo `/client /worker /shared /scripts`, `wrangler.toml`, `wrangler dev` chạy được.
1. **Phase 1 – Khung client**: Vite + Three.js + Rapier, game loop, input, camera bay tự do.
2. **Phase 2 – Bản đồ Paris**: tải OSM + DEM, phép chiếu (có unit test), chunk streaming, tòa nhà, đường, biển tên đường, sông Seine, cầu; chụp ảnh top-down đối chiếu Google Maps.
3. **Phase 3 – Nhân vật & camera**: character controller, animation, bơi, camera góc thứ ba.
4. **Phase 4 – Di chuyển**: đi bộ (tốc độ chuẩn + đi chậm), vật lý xe đạp với tốc độ = 1,3 × đi bộ (có unit test cho tỉ lệ này), lên/xuống xe (chạy local trước, đồng bộ server ở Phase 6), `npm run build-graph`.
5. **Phase 5 – HUD cơ bản**: minimap, bản đồ lớn, GPS, tên đường/quận, đồng hồ.
6. **Phase 6 – Server & presence**: Worker + Durable Object `RaceRoom` (WebSocket, SQLite, tiết kiệm hạn mức theo mục 3), đăng nhập mã đội, đồng bộ vị trí + nội suy, ghost, ZonePanel, **lưu tiến trình + vào lại bằng mã đội (mục 8.10)**, **VehicleSpawner + nhận xe nguyên tử + bãi xe cạnh điểm + xe bị bỏ thì biến mất** (mục 6.2–6.4).
7. **Phase 7 – Race engine lõi**: schema zod, nạp chặng, máy trạng thái đội, geofence, hộp mật thư, bảng `step_progress` ghi mốc thời gian từng bước, **Sổ mật thư (mục 8.11)**, Chặng dừng + NPC dẫn chương trình, xếp hạng. Chạy thử bằng chặng demo với các bước nhiệm vụ tạm cho qua tự động.
8. **Phase 8 – Thử thách**: Lựa chọn kép, Thử thách, Vượt rào (câu gợi ý → nhận thử thách), thư viện mini-game mục 11, kiểm tra đáp án trên server, **luồng Host duyệt (mục 8.9)** cùng bản Hàng chờ duyệt tối giản trên màn hình Host.
9. **Phase 9 – Yếu tố đặc biệt**: Quay đầu, Nhường đường, Vé vượt, Vé ưu tiên, Gờ giảm tốc, luật phương tiện, phạt giờ.
10. **Phase 10 – Màn hình Host**: mục 13 đầy đủ, gồm Soạn nội dung chặng, Hàng chờ duyệt, Bảng tiến trình, bù giờ chờ duyệt, Công bố kết quả. Kiểm tra bằng bot: Bảng tiến trình và mốc thời gian phải khớp với `race_events`.

> Gợi ý: có thể làm một bản Host tối giản (chỉ Bảng tiến trình dạng bảng) ngay sau Phase 7 để dễ theo dõi khi test các phase 8–9.
11. **Phase 11 – Chặng demo Paris & test toàn trình**:
    - Nạp `worker/legs/paris-demo.json` (mục 10.1). Dựng model trước cho các địa danh của chặng demo: Khải Hoàn Môn, Trocadéro, tháp Eiffel, cầu Alexandre III, bảo tàng Orsay, Louvre + kim tự tháp kính.
    - **Không tự điền nội dung thử thách vào file thật.** Để test, tạo bản sao `worker/legs/test/paris-demo.filled.json` với nội dung giả cho các ô trống.
    - Tạo thêm `worker/legs/test/specials.json` để test Quay đầu, Nhường đường, Vé vượt, Gờ giảm tốc.
    - Viết **script bot** (`npm run sim`): 3–5 đội bot kết nối server, di chuyển theo đường thật với tốc độ hợp lý (có hệ số tua nhanh thời gian ở chế độ test), làm đủ 10 bước, gồm cả tình huống: nhập sai đáp án, **2 bot tranh cùng 1 xe trong cùng một khung hình** (chỉ 1 bot được), bot khác thử lấy xe đã có chủ, **xe để ở bãi khi làm thử thách bị bot khác lấy mất**, xe bị bỏ lại biến mất, **gửi bài chờ duyệt**, và **thoát ra vào lại**: bot đang đạp xe thì ngắt kết nối 2 phút rồi vào lại → phải đúng vị trí, vẫn có xe, Sổ mật thư đủ; Host duyệt bài lúc bot offline → vào lại có mật thư mới; **tắt hẳn server rồi bật lại giữa cuộc đua** → mọi đội tiếp tục đúng trạng thái. Có một "bot Host" tự Duyệt / Chưa đạt sau vài giây ngẫu nhiên.
    - Kiểm tra: mốc thời gian trên Bảng tiến trình khớp `race_events`, bù giờ chờ duyệt tính đúng, thứ hạng chính thức cuối cùng đúng.
12. **Phase 12 – Tối ưu & deploy**: LOD, cài đặt đồ họa, màn hình loading có tiến trình, `docs/DEPLOY.md` + `npm run deploy` lên Cloudflare, kiểm thử với 20 người chơi giả lập và **đo lượng request / dòng ghi thực tế** so với ngân sách ở mục 3.
13. *(Tùy chọn)* **Phase 13**: trình chỉnh sửa chặng trên bản đồ (kéo thả điểm, soạn mật thư, xuất JSON), replay cuộc đua, NPC người đi đường và xe cộ.

## 16. QUY TRÌNH LÀM VIỆC CHO CLAUDE CODE

- Trước mỗi phase: đọc `docs/SPEC.md` + `CLAUDE.md`, lập kế hoạch ngắn, liệt kê package cần cài.
- **Commit sau mỗi phase** (`feat(phase7): race engine core`).
- `CLAUDE.md` ghi: stack, cấu trúc thư mục, hệ tọa độ (1 unit = 1 m, gốc = obelisk Concorde), nguyên tắc "server quyết định – nội dung chặng không bao giờ lên client", lệnh `dev / build / test / fetch-map / build-graph / sim / deploy`, và ngân sách hạn mức Cloudflare ở mục 3.
- Sau mỗi phase: `npm run build` và `npm test` phải pass; liệt kê file đã tạo/sửa và cách kiểm tra thủ công.
- **Kiểm tra trực quan bằng Playwright**: `scripts/screenshot.ts` chụp camera top-down + camera người chơi vào `/screenshots`. Xem ảnh để tự đánh giá rồi sửa nếu sai, ví dụ:
  - Vòng xuyến Étoile có 12 đại lộ tỏa ra.
  - Champs-Élysées thẳng tới Concorde.
  - Sông Seine uốn đúng hình.
  - Eiffel nằm đối diện Trocadéro qua sông.
- Phần nào chưa làm được (thiếu model, thiếu API key): dùng placeholder và ghi vào `TODO.md`, không tự ý bỏ yêu cầu.
- Tất cả tham số nằm trong `config.ts` (client) và file cấu hình chặng (server). Dữ liệu OSM thiếu thì dùng giá trị mặc định và log cảnh báo, không làm crash game.

**Bắt đầu với Phase 0 và Phase 1.**

---

## 17. BỔ SUNG SAU KHI TRAO ĐỔI (ghi đè các mục trên nếu mâu thuẫn)

### 17.1 Nền tảng: PC Windows + macOS
- Game chơi trên **máy tính (PC)**, chạy được trên **cả Windows và macOS** (trình duyệt desktop: Chrome, Edge, Firefox, Safari). Không cần hỗ trợ điện thoại/tablet.
- **Chỉ dùng các phím mà cả 2 hệ điều hành đều có**, và không dùng phím/tổ hợp phím mà trình duyệt hoặc hệ điều hành chiếm mất:
  - Không dùng `Ctrl`, `Alt`/`Option`, `Cmd`/`Win` làm phím chơi: trên Windows `Ctrl+W` đóng tab và game không chặn được (giữ Ctrl rồi bấm W là mất game); `Alt+D` / `Alt+F` nhảy lên thanh địa chỉ / menu trình duyệt; trên macOS `Ctrl` + mũi tên chuyển màn hình.
  - Không dùng phím F làm phím duy nhất của một thao tác: trên Mac, F1–F12 mặc định là phím media (F3 = Mission Control), phải kèm `fn`.
  - Không dùng `F5`, `F11`, `F12`.
- Phím gán trong `client/src/config.ts` theo `KeyboardEvent.code` (vị trí vật lý, không phụ thuộc bố cục bàn phím); mỗi thao tác gán được nhiều phím.

### 17.2 Bảng phím (thay cho danh sách phím ở mục 5)

| Thao tác | Phím |
|---|---|
| Di chuyển | `W` `A` `S` `D` |
| Đi chậm (giữ) | `Shift` (thay cho `Ctrl` ở mục 5) |
| Nhảy | `Space` |
| Tương tác | `F` |
| Sổ mật thư | `Tab` |
| Bản đồ lớn | `M` |
| Đổi camera | `C` |
| Ống nhòm | `B` |
| Menu | `Esc` (menu cũng tự mở khi chuột bị nhả khỏi game) |
| Debug | `F3` hoặc `` ` `` (phím ngay dưới `Esc`) |
| Nhìn quanh | chuột (nhấp vào game để khóa con trỏ) |
| Camera bay tự do (khán giả / debug) | `W` `A` `S` `D`, `Space` hoặc `E` bay lên, `Q` hạ xuống, giữ `Shift` bay nhanh, lăn chuột đổi tốc độ |

- Hỗ trợ gamepad như mục 5.
- Phím cho các thao tác chưa gán (chào/vẫy tay, bấm còi – mục 7) chọn trong các chữ cái chưa dùng, theo quy tắc 17.1. Đã chốt: `G` chào/vẫy tay, `R` bấm chuông/còi xe đạp.

### 17.3 HUD theo phong cách GTA V (thay cho một phần mục 12)
- **Minimap hình chữ nhật** ở góc dưới trái (thay cho "minimap tròn" ở mục 12), có chữ N chỉ hướng Bắc, xoay theo camera, tự zoom ra khi đi nhanh, vẽ đường GPS.
- Bố cục và phong cách HUD còn lại theo `docs/STYLE_GUIDE.md` (rút ra từ ảnh tham khảo GTA V).

### 17.4 Tọa độ chặng demo đã kiểm tra bằng OSM (ghi đè §8.2, §10.1, §4.5)
Kiểm tra ngày 2026-09-27 bằng centroid polygon OSM (Overpass). Anh đã đồng ý các chỉnh sửa sau; `worker/legs/paris-demo.json` đã cập nhật theo:

| Bước | Trước | Sau | Lý do |
|---|---|---|---|
| L1 | 48.8734, 2.2966 | **48.87348, 2.29666** | điểm cũ nằm trên lòng đường, ngay vạch qua đường; dời 10 m lên vỉa hè phía bắc |
| L2 | 48.8621, 2.2876 | **48.86215, 2.28843**, tên "Quảng trường Trocadéro – sân trước Palais de Chaillot" | điểm cũ nằm trong cánh tây Palais de Chaillot; điểm mới giữa sân Parvis, nơi ngắm tháp Eiffel |
| L5 | 48.8598, 2.3258, r 35 | **48.86027, 2.32506, r 30** | điểm cũ nằm trong tòa nhà Orsay; điểm mới trên sân Esplanade trước mặt tây bảo tàng |
| L6, PS | 48.8610, 2.3358 | **48.86111, 2.33547** | điểm cũ nằm trong kim tự tháp kính; điểm mới cách 27 m, trước mặt tây-tây bắc kim tự tháp (thảm về đích + NPC đặt ở đây) |

- Giữ nguyên: điểm xuất phát (obelisk, lệch 1,5 m), L3 (chân tháp Eiffel), L4 (giữa cầu Alexandre III).
- **Bán kính geofence: 15–40 m** (thay cho "15–30 m" ở §8.2), vì chặng demo dùng 35–40 m và các vòng đó đã được kiểm tra là đi bộ tới được.
- Điểm xuất phát nằm trong hàng rào quanh obelisk: khi xuất phát, đặt các đội bên ngoài hàng rào, cách obelisk ≥ 8–10 m.
- §4.5: dựng địa danh theo polygon OSM, không theo bảng tọa độ. Lệch đáng kể so với bảng: Palais de Chaillot 34 m (OSM 48.86220, 2.28835), cầu Alexandre III 29 m (OSM 48.86365, 2.31354), tháp Eiffel 15 m (OSM 48.85826, 2.29450). Test khoảng cách §4.2 giữ tọa độ gốc của bảng.
- Khi dựng bản đồ: footprint `building=tower` của tháp Eiffel không đùn thành khối đặc (chỉ dựng 4 chân, sân dưới tháp đi bộ được); kim tự tháp kính dựng thành hình chóp, không phải khối hộp.

### 17.5 Xe cộ & người đi đường NPC (bắt buộc; thay cho "NPC người đi đường và xe cộ" tùy chọn ở Phase 13)
- Làm ở **Phase 4B** (sau Phase 4): dùng lại nhân vật + animation của Phase 3 và đồ thị đường `shared/data/roadgraph.json` của Phase 4.
- **Chỉ để tạo không khí.** Xe NPC: ô tô, xe buýt, xe tải giao hàng, xe máy (không logo/tên hãng thật), chạy theo đồ thị đường OSM đúng chiều (`oneway`), dừng ở giao lộ (đèn tín hiệu đơn giản), đi vòng xuyến Étoile. Người đi đường: đi trên vỉa hè, qua đường ở vạch, đứng/ngồi ở quảng trường, công viên.
- **Người chơi không lên/lái xe NPC được.** Luật §6 giữ nguyên: phương tiện duy nhất của người chơi là xe đạp.
- **Mô phỏng riêng trên từng máy (client), không đồng bộ qua server**, để không tốn hạn mức Cloudflare (§3). Mỗi đội thấy dòng xe/người khác nhau; không ảnh hưởng luật đua.
- **Va chạm:** xe NPC phanh/dừng khi người chơi đứng phía trước; nếu vẫn chạm thì đẩy nhẹ, không "chết". Đạp xe tông xe NPC → ngã xe như §6.3. Người đi đường tránh người chơi, bị va thì lảo đảo.
- NPC không đứng chặn vùng hộp mật thư / thảm về đích (tránh bán kính geofence).
- Mật độ cấu hình được trong `config.ts` (số xe / người mỗi km đường, bán kính sinh/xóa quanh người chơi), tự giảm khi FPS thấp; người đi đường ở xa dùng LOD/instancing.
- Không hiện trên minimap người chơi.
- Model xe/người: ưu tiên bộ asset miễn phí CC0 (ví dụ Quaternius, Kenney) — kiểm tra giấy phép, ghi nguồn; tải về chỉ sau khi anh duyệt danh sách file (tên, nguồn, dung lượng, giấy phép).

### 17.6 Địa danh Paris dựng chính xác (mở rộng §4.5; thay cho "placeholder tới Phase 11")
- Mọi địa danh nổi tiếng **trong khu vực bản đồ** được dựng chính xác về hình khối, tỉ lệ, mái/vòm/tháp chuông, vật liệu và màu, **kể cả không nằm trên lộ trình**. Làm ở **Phase 2B**, ngay sau Phase 2.
- Danh sách: 12 địa danh §4.5 (Eiffel, Palais de Chaillot, cầu Bir-Hakeim, Khải Hoàn Môn, Concorde + obelisk, Grand Palais, cầu Alexandre III, vòm Invalides, Orsay, Louvre + kim tự tháp, Nhà thờ Đức Bà) + Petit Palais, Madeleine, Opéra Garnier, cột Vendôme, Arc du Carrousel, Palais Bourbon, Pont Neuf, Pont des Arts, Sainte-Chapelle, Conciergerie, Hôtel de Ville, Centre Pompidou, tháp Saint-Jacques, Palais-Royal, cầu Alma + Ngọn lửa Tự do, Palais de Tokyo, bảo tàng Rodin, École Militaire, Saint-Sulpice, Panthéon, Palais du Luxembourg.
- **Cách dựng (anh chọn phương án b):**
  1. Dùng dữ liệu 3D của OSM (`building:part`, `roof:shape`, `roof:height`, `height`, `min_height`, `building:colour`, `roof:colour`…) cho hình khối chính xác.
  2. Dựng chi tiết bằng code cho phần OSM không đủ (khung lưới tháp Eiffel, Khải Hoàn Môn, kim tự tháp kính, obelisk, tượng mạ vàng cầu Alexandre III, mái kính Grand Palais, vòm vàng Invalides, tháp chuông + mái nhọn Nhà thờ Đức Bà…).
  3. **Mô hình 3D miễn phí trên mạng** cho các công trình biểu tượng khi đẹp hơn rõ rệt: chỉ dùng giấy phép cho phép dùng trong game (CC0 / CC-BY, ghi nguồn trong game), mỗi file ≤ 25 MB sau nén (Draco/Meshopt, KTX2); không dùng nguồn bắt tạo tài khoản; **tải về chỉ sau khi anh duyệt danh sách** (tên file, nguồn, dung lượng, giấy phép). Nếu không có mô hình phù hợp thì dùng cách 1 + 2.
- Mỗi địa danh: đúng tọa độ/hướng theo polygon OSM, có LOD và collider; tháp Eiffel mở 4 chân (sân dưới tháp đi bộ được), kim tự tháp hình chóp (§17.4).
- **Đường chân trời:** dựng bóng/silhouette đơn giản các công trình nổi bật ngoài bản đồ nhìn thấy từ xa (Sacré-Cœur, tháp Montparnasse, cụm La Défense), không tới gần được.

### 17.7 Asset bên ngoài & giấy phép (chốt 2026-09-28)
- Game **chỉ dùng nội bộ** (sự kiện), không phát hành thương mại. Vì vậy bản quyền kiến trúc (kim tự tháp Louvre, ánh đèn tháp Eiffel về đêm) không phải trở ngại.
- Giấy phép được dùng: CC0 / public domain, CC-BY 3.0/4.0, **MIT** (giữ ghi chú giấy phép). Không dùng NC, ND, SA, "editorial only" hay nguồn không rõ giấy phép.
- Được dùng **bản sao không cần tài khoản** (Zenodo, Hugging Face Objaverse) của mô hình CC-BY từ Sketchfab, ghi công tác giả gốc.
- **Danh sách tải bắt buộc** trong `docs/plans/phase2b-assets.md` (21 file, mục 2 và 3) đã được duyệt. Các file tùy chọn chưa duyệt.
- Thân nhân vật người chơi: **Universal Base Characters** (Quaternius, CC0), dùng cùng Universal Animation Library.
- **Microsoft Rocketbox** (MIT) được phép: đánh giá cho nhân vật người chơi / người đi đường chân thực hơn. Muốn tải file Rocketbox thì lập danh sách (tên, nguồn, dung lượng) để duyệt riêng.
- File gốc lưu ở `.cache/assets/` (không commit); chỉ commit bản đã xử lý ở `client/public/models/` (mỗi file ≤ 25 MB). Mọi asset có ghi nguồn trong game (`credits.json` + màn hình "Ghi nguồn").
- Chiều cao bổ sung cho địa danh lấy từ số liệu công bố (Wikipedia, trang chính thức), ghi nguồn trong code. Không tải dữ liệu LiDAR nếu chưa được duyệt.

### 17.8 Thêm địa danh Crazy Horse Paris (chốt 2026-09-30)
- **Crazy Horse Paris** (12 avenue George V, 8e) vào danh sách §17.6, nhóm g4: mặt tiền tầng trệt của tòa nhà Haussmann (mái hiên, cửa vào, biển hiệu chữ đỏ/hồng + đèn neon tự vẽ, không dùng logo thật); dựng bằng dữ liệu OSM + code, không tải mô hình.

### 17.9 Nội dung chặng chưa chốt (2026-09-30)
- Các điểm lộ trình và thử thách của từng chặng **chưa chốt**; anh sẽ gửi sau.
- Chặng demo `worker/legs/paris-demo.json` (L1–L6 ở §17.4) chỉ dùng làm điểm kiểm thử (preset chụp ảnh, test đi bộ tới được). Không gắn cứng code gameplay hay địa danh vào các điểm này; nội dung chặng luôn đọc từ file chặng (Phase 7) và soạn được trên màn hình Host (Phase 10).

### 17.10 Hộp mật thư hiện dần theo bước (chốt 2026-09-30; ghi đè §8.2 "mỗi điểm có một hộp")
- Hộp của bước N+1 chỉ hiện khi server đánh dấu bước N **hoàn thành** (định nghĩa hoàn thành ở §8.1): đội đã tới điểm của bước N và xong việc ở đó. Nếu bước là thử thách / đường vòng / vượt rào thì phải **làm xong** (server kiểm, hoặc Host duyệt với bài `host_approval`) rồi hộp tiếp theo mới hiện.
- Khi đội nhận mật thư N, hộp N hiện đúng vị trí thật **cho đội đó** (cờ + ánh sáng nhẹ), nhưng **chỉ khi lọt vào tầm mắt** (chốt 2026-10-01, thay cho "thấy từ xa"): server không biết camera nên **chỉ gửi tọa độ hộp hiện tại khi đội vào bán kính nhìn thấy `boxReveal.radius`** (mặc định 150 m (chốt 2026-10-01 sau khi cân nhắc 500 m), cấu hình trong file chặng, so khoảng cách vài giây một lần, không tính nặng trong DO); client vẽ hộp như vật thể 3D thường, nên nhà che hoặc quay lưng thì không thấy. Trước khi vào bán kính, client không có tọa độ hộp. Sau khi vào bán kính, người chơi kỹ thuật vẫn đọc được tọa độ (không thể chặn tuyệt đối).
- Hộp của các bước trước ở trạng thái "đã mở", vẫn hiện để định hướng. Hộp của bước sau chưa tới: không hiện, và server **không gửi tọa độ** cho client (cũng không đưa vào static asset).
- Mỗi đội chỉ thấy hộp của đội mình (server điều khiển theo từng đội). Làm ở Phase 6–7.

### 17.11 Rocketbox đã duyệt + quyết định NPC (chốt 2026-09-30; bổ sung §17.5, §17.7)
- **Microsoft Rocketbox** (MIT, © 2020 Microsoft): đã duyệt 30 file + `LICENSE.md` (4 avatar `Male_Adult_08`, `Female_Adult_05`, `Business_Male_01`, `Business_Female_01` và 14 clip đi / đứng / ngồi / vẫy) để làm người đi đường Phase 4B. Nhân vật người chơi giữ Universal Base Characters + UAL (§17.7). Ghi nguồn trong game + `LICENSE` kèm model.
- Người đi đường dùng **4 avatar**, đổi màu áo / quần để bớt trùng; không duyệt thêm avatar.
- Đạp xe tông người đi đường → **người chơi ngã xe** (như tông xe NPC, §6.3); người bị tông lảo đảo.
- Vòng xuyến Étoile: xe vào vòng nhường xe trên vòng (ngược ngoài đời, để không tắc cứng).
- Camera khán giả (`?cam=`) **luôn có NPC**; `?npc=0` tắt (dùng cho kiểm thử vật lý).

### 17.12 Điểm xuất phát và giờ vào của các đội (chốt 2026-10-01; ghi đè §17.4 "xuất phát tại obelisk, các đội đặt ngoài hàng rào")
- Điểm bắt đầu của chặng này là **cầu Bir-Hakeim**, không phải obelisk Concorde. Điểm xuất phát luôn lấy từ file chặng, không gắn cứng trong code (§17.9).
- Các đội **không xuất phát cùng một lúc tại một chỗ**: có đội tới trước, có đội tới sau. Server phải xử lý mỗi đội vào thế giới ở thời điểm khác nhau; không giả định "tiếng súng xuất phát chung".
- **Đồng hồ của mỗi đội tính từ lúc đội nhận mật thư đầu tiên ở NGOÀI trò chơi** (chốt 2026-10-01). Host nhập thời điểm bắt đầu cho từng đội (Phase 7/10); server tính giờ đội = hiện tại − giờ bắt đầu của đội đó, không phụ thuộc lúc đội vào game hay tới điểm xuất phát. Giờ trước khi vào game vẫn được tính.
- **Thông báo thứ tự xuất phát khi vào game** (chốt 2026-10-01): khi đội đăng nhập vào trò chơi, góc phải màn hình hiện đúng cụm **"Xuất phát ở vị trí thứ n"** trong **15 giây đầu**, sau đó mờ dần rồi biến mất. **n chỉ tính theo thứ tự vào game**: đội đăng nhập vào game đầu tiên là vị trí 1, đội thứ hai là vị trí 2, đội vào muộn nhất là vị trí cuối. Không liên quan giờ bắt đầu do Host nhập (đồng hồ đội vẫn tính từ lúc nhận mật thư ngoài game) và không phải thứ hạng cuộc đua. Server ghi thứ tự ở lần đăng nhập đầu tiên của mỗi đội và giữ nguyên (đội vào lại bằng mã đội vẫn giữ vị trí cũ). **Thông báo chỉ hiện MỘT LẦN, ở lần đăng nhập đầu tiên, tại vạch xuất phát**: vào lại thì KHÔNG hiện, và không thông báo ở các lộ trình sau cũng như khi về đích (chốt 2026-10-01). Làm ở Phase 7.
- **Không có Vượt rào (Roadblock)** (chốt 2026-10-01): loại bước `roadblock` (§8.5) không dùng trong trò chơi này. Schema chặng, máy trạng thái, mật thư, `RACE_RULES.md` và các yếu tố đặc biệt phụ thuộc Vượt rào (ví dụ Vé ưu tiên bỏ qua Vượt rào, bỏ cuộc Vượt rào) không cần làm; còn lại: lộ trình, Lựa chọn kép, Thử thách, Chặng dừng.

### 17.13 Quyết định thực hiện Phase 7 (race engine) – ghi 2026-10-02
- Schema chặng (zod, `shared/src/leg`): bốn loại bước `route_info` / `detour` / `challenge` / `pit_stop`, không `roadblock`; gặp `roadblock` → lỗi tiếng Việt rõ ràng. Chặng thật nằm ngoài thư mục dự án, nạp qua Host ("Nạp chặng từ file"); nội dung chặng và đáp án chỉ ở máy chủ.
- Trạng thái cuộc đua `lobby / running / paused / finished`; Host "Mở cuộc đua" thì đội mới mở được hộp / làm nhiệm vụ / check-in. Tạm dừng: đi lại được, thao tác đua bị từ chối, đồng hồ vẫn chạy. **Mặc định (chờ người dùng xác nhận): thời gian tạm dừng KHÔNG bị trừ khỏi giờ chính thức** (thay §13.3 cũ "tạm dừng dừng đồng hồ").
- Lộ trình ngay trước Chặng dừng hoàn thành khi vào vùng Chặng dừng; thảm về đích có NPC dẫn chương trình chỉ báo thời gian của đội, không báo "đội thứ n" (thứ hạng chính thức do Host công bố; mặc định chờ xác nhận).
- Xếp hạng theo thời gian chính thức (giờ xuất phát riêng của từng đội, §17.12); hòa → check-in sớm hơn → thứ tự xuất phát. Đội chưa về đích xếp theo bước xa nhất.
- Server chỉ dùng vị trí đã qua kiểm tra tốc độ (`TrustedPoint`) cho geofence, mở hộp, vùng, nhận xe; dịch chuyển tức thời bị từ chối và đánh dấu cho Host.
- Nhiệm vụ ở Phase 7 cho qua bằng nút "Hoàn thành (tạm)" (Phase 8 thay bằng chấm thật).

### 17.14 Chặng thật: luật thử thách do người dùng nêu (2026-10-02; áp dụng ở Phase 8)
- **Thử thách 1 và 2: đội GÕ đáp án TRONG GAME** (không gửi qua Facebook), câu trả lời hiện ngay trên **màn hình Host/admin**, và **Host (người dùng) duyệt tay**: nút **Duyệt** (hoàn thành thử thách) hoặc **Phạt 3 phút**. Game KHÔNG tự chấm đúng/sai, nên file chặng không cần danh sách đáp án chấp nhận được.
- **Phạt**: khi Host bấm Phạt, trên màn hình đội hiện **đồng hồ đếm ngược 3 phút** trước khi được trả lời lại.
- Màn hình Host hiện thêm **"Đáp án tham khảo"** (chỉ Host thấy, không gửi cho client; ví dụ Thử thách 2) cạnh câu trả lời của đội để duyệt nhanh. **Mọi câu trả lời gõ trong game được lưu** (đội, bước, nội dung, giờ, quyết định của Host) cùng ô ghi chú của Host.
- **Người chơi xem được lịch sử câu trả lời của chính đội mình** (chốt 2026-10-02; mục đích: đội vừa bị phạt xem lại lần trước đã gõ gì để khỏi gõ lại y nguyên): **chỉ trên thẻ thử thách** (không đưa vào Sổ mật thư), thẻ hiện danh sách các lần đã gửi của bước đó: nội dung đã gõ, giờ gửi, trạng thái ("Chờ Host duyệt" / "Đã duyệt" / "Bị phạt 3 phút"). Server chỉ gửi cho đội lịch sử của CHÍNH đội đó; không bao giờ gửi đáp án tham khảo hay câu trả lời của đội khác.
- **Gợi ý KHÔNG nằm trong game** (chốt 2026-10-02): gợi ý theo giờ (mỗi 45 phút chưa xong) do Host soạn riêng cho từng đội và gửi qua Messenger; file chặng không chứa nội dung gợi ý và game không tự phát gợi ý. **Phase 8 làm (chốt 2026-10-02):** màn hình Host báo "đội X làm Thử thách Y đã quá 45 phút" (tính từ lúc đội bắt đầu thử thách, báo lại mỗi 45 phút cho tới khi xong; chu kỳ là cấu hình trong `config.ts` / chặng, không gắn cứng) để Host biết lúc gửi gợi ý qua Messenger.
- Thử thách 1 → Thử thách 2: **mật thư của Thử thách 2 xuất hiện ngay** khi Thử thách 1 được duyệt (không cần đi tới đâu).
- Thử thách 2: sau khi trả lời đúng địa điểm trong hình, đội **di chuyển tới chính địa điểm đã trả lời** để nhận mật thư tiếp theo (hộp mật thư kế tiếp đặt tại địa điểm đáp án; vị trí lấy từ file chặng).
- **Lựa chọn kép (Lửa / Nước)**: Host duyệt thủ công qua ảnh chụp màn hình gửi Facebook (§8.9), vì đội gửi ảnh, không gõ chữ.
- Mật thư có thể kèm liên kết (ví dụ video, hình) hiện trên thẻ mật thư và trong Sổ mật thư.
- Tự chấm trong game (danh sách đáp án chấp nhận được) là tùy chọn bật sau cho từng thử thách, không dùng ở chặng này.

### 17.15 Hình dạng hòm mật thư trong game (2026-10-02; thay "cờ vàng–đỏ + ánh sáng nhẹ" của §8.2)
- Hòm mật thư dựng giống mô hình thật người dùng đưa (ảnh): **đế xám vuông, cột vàng vuông có dải đỏ dọc, hộp xám trên cùng với nắp phẳng nhô ra bốn phía**, cao ≈ 1,6 m; hòm đã mở: nắp lật lên, dải đỏ chuyển màu xám đỏ.
- Chi tiết thêm của bản dựng (chờ người dùng xác nhận): dải đỏ ở cả 4 mặt cột (ảnh chỉ thấy mặt trước); **cột sáng vàng mảnh** phía trên hòm chưa mở để nhìn thấy ở 150 m (hòm chỉ cao ≈ 6 px ở khoảng đó), mờ dần trong 35 → 12 m; kích thước theo ảnh (cột 0,32 m, dải 0,17 m).

### 17.16 Lựa chọn kép Lửa / Nước: nút chọn + hòm riêng từng nhánh (2026-10-02; áp dụng ở Phase 8)
- Sau khi đội mở hòm của Lộ trình ngay trước Lựa chọn kép, thẻ Lựa chọn kép có **hai nút chọn nhánh** (Lửa, Nước). Đội bấm một nút để chọn.
- **Chỉ hòm của nhánh đã chọn mới hiện** trong game; hòm nhánh kia không hiện. Hòm đặt tại nơi nhánh đó yêu cầu (tọa độ trong file chặng) và theo luật §17.10 (server chỉ gửi tọa độ khi đội vào 150 m).
- **Mật thư của nhánh** (đề bài: liên kết, hình, yêu cầu chụp màn hình) nằm TRONG hòm của nhánh: chỉ hiện khi đội mở hòm đó. Đội gửi ảnh chụp màn hình cho Host qua Messenger / Facebook; Host duyệt trên màn hình Host (§8.9, §17.14); duyệt xong đội nhận mật thư kế tiếp.
- **Đổi nhánh = bỏ nhánh đang làm** (chốt 2026-10-02, thay luật "không phạt" trước đó): thẻ có nút **"Đổi lựa chọn kép"**, bấm được từ bất kỳ đâu sau khi đã chọn (trừ khi đang chờ Host duyệt bài). Bấm: hòm của nhánh đang chọn biến mất, tiến độ nhánh cũ mất (§8.4) và đội **bị phạt 10 phút**: màn hình đội hiện **đồng hồ đếm ngược 10 phút** (cùng cơ chế với phạt 3 phút của thử thách, §17.14); **đếm ngược xong mới được làm nhánh còn lại**, lúc đó hòm của nhánh kia mới hiện (ví dụ đang ở Lửa bấm đổi → hết 10 phút hòm hiện ở Nước, và ngược lại; tọa độ hòm vẫn theo luật 150 m §17.10). Đồng hồ cuộc đua vẫn chạy trong lúc chờ, nên 10 phút là thời gian mất thật; không cần quay lại điểm Lộ trình 6. Số 10 phút là cấu hình. Mặc định (chờ người dùng xác nhận): mỗi lần đổi chịu một lần phạt 10 phút; có hộp xác nhận ghi rõ "phạt 10 phút" trước khi đổi.
- Mật thư có thể kèm hình (ví dụ "hình bên dưới" / "trong ảnh"): hình do người dùng cung cấp, lưu trên R2 (bucket riêng tư) và hiện trên thẻ + Sổ mật thư.

### 17.17 Không có nút mở Messenger / Facebook trong game (2026-10-02; áp dụng ở Phase 8)
- Game **không có nút mở Facebook / Messenger** (thay §8.11 "nút mở Facebook của Host"): đội tự mở Messenger ở ngoài trò chơi để gửi ảnh chụp màn hình cho Host. Thẻ bài ảnh chỉ có hướng dẫn gửi bài (chữ) và nút "Tôi đã gửi bài – chờ Host duyệt"; file chặng KHÔNG cần link Facebook / Messenger của Host (`hostApproval.contactUrl` / `contactLabel` bỏ).

### 17.18 Chặng này bỏ các yếu tố đặc biệt (2026-10-03)
- Chặng này KHÔNG dùng: Quay đầu (U-Turn), Nhường đường (Yield), Vé vượt (Express Pass), Vé ưu tiên (Priority Pass), Gờ giảm tốc (Speed Bump). Không làm trong Phase 9; các mục §9.x liên quan để TẠM hoãn (ghi TODO), có thể làm lại khi người dùng cần.
- (2026-10-03, bổ sung) Chặng này cũng KHÔNG có lộ trình bắt buộc đi bộ (`transport.mandatory = "walk"`) và không có phạt đi bộ sai luật (`walkOnlyViolationMinutes`); mọi lộ trình đi bộ hoặc xe đạp tự do. Phase 9 vì vậy không còn việc bắt buộc: phạt bỏ cuộc thử thách (`quitTaskMinutes`) cũng không dùng (Lựa chọn kép đã có phạt đổi nhánh riêng, §17.16). Chuyển thẳng sang Phase 10.

### 17.19 Thử thách 3 tại Louvre: phòng 23 tác phẩm, chọn 5 món thật (2026-10-03; người dùng nêu, một số điểm chờ xác nhận)
- Một **căn phòng mô phỏng một phòng trong Louvre** chứa **23 tranh / tượng nổi tiếng**, bày xung quanh phòng (sửa 2026-10-03: 30 → 20 → 23); chỉ **5** món là **độc bản duy nhất đang trưng bày ở Louvre**, 18 món còn lại nổi tiếng nhưng ở nơi khác.
- **Cách chơi:** dưới mỗi tác phẩm có **một nút chọn**; chọn thì **đèn sáng**. Chọn xong, đội bấm **một nút chốt ở giữa phòng**. Sai → **phạt 3 phút đếm ngược** (sửa 2026-10-03, trước ghi 2 phút) rồi mới được trả lời lại.
- **Gợi ý theo giờ:** sau **40 phút** đội được gợi ý về số tác phẩm đúng. **30 phút sau đó** (70 phút) nếu chưa xong: thông báo đã đúng bao nhiêu / 5 và thông báo này **công khai cho các đội khác**.
- **Mỗi đội / người chơi có bộ nút hiển thị khác nhau** (chống chép đáp án giữa các đội).
- **Đội khác thấy** khi một đội trả lời sai, và số câu đúng /5 khi được công bố: hiện như **một đoạn chat nhỏ ở góc dưới màn hình**.
- Chờ xác nhận (ghi ở báo cáo): gợi ý 40 phút khác gì thông báo 70 phút; "bộ nút khác" theo đội hay theo người; tin sai công khai có kèm số đúng /5 không; tên tác phẩm có hiện không; cách vào phòng; chọn đúng 5 hay tối đa; tải tài nguyên cần duyệt.
- **Chốt thêm (2026-10-03):**
  - Gợi ý phút 40 (riêng cho đội): chữ "Đáp án bao gồm 5 tác phẩm". Gợi ý phút 70: "Đúng x/5" (x = số tác phẩm đúng trong lựa chọn hiện tại của đội).
  - Bộ nút giống nhau cho mọi đội; **đèn / nút chỉ hiện cho chính đội bấm** (đội khác không thấy đèn của mình sáng). Người chơi ở chung phòng thấy nhau (nhân vật) nhưng không thấy nút / đèn của nhau.
  - Tin công khai (đoạn chat nhỏ góc dưới màn hình) khi một đội trả lời sai: chỉ "Đội X trả lời sai và bị phạt 3 phút". Khi đội đó đã qua 70 phút ở thử thách này, MỖI LẦN chốt đáp án thì công khai thêm số đáp án đúng ("Đội X đúng x/5").
  - Tên tác phẩm KHÔNG hiện. Vào phòng bằng phím F ở hòm Louvre. Chọn bao nhiêu tác phẩm cũng được trước khi chốt. Phạt sai 3 phút, đồng hồ đua vẫn chạy.
  - Nút chọn: đỏ = chưa chọn, xanh lá = đã chọn; bấm lại để bỏ chọn. Sau khi bị phạt, lựa chọn (đèn) giữ nguyên, đội vẫn bấm / bỏ chọn được (mặc định: chỉ không chốt được tới khi hết phạt).
  - **Sửa (2026-10-03):** "Đúng x/5" từ phút 70 CẬP NHẬT THEO LỰA CHỌN HIỆN TẠI của đội (hiện sống khi đội bấm / bỏ chọn, không chốt một lần), vì mỗi lần chốt sai đã bị phạt 3 phút. Công khai số đúng cho các đội khác vẫn chỉ ở mỗi lần chốt sau 70 phút của đội đó.
  - **Sửa (2026-10-03):** ảnh / mô hình 23 tác phẩm được ĐƯA THẲNG VÀO GAME (tài sản tĩnh của client, tên tệp trung tính art-NN, đã xóa metadata ghi tên tác phẩm, thứ tự xáo trộn), không qua R2 và không cần Host tải lên; người dùng không diễn tập bằng bộ ảnh khác. Điều bí mật chỉ là 5 id đúng, nằm ở máy chủ. Tài nguyên vẫn phải được người dùng duyệt (nguồn, giấy phép, dung lượng) trước khi tải về.
  - **Sửa (2026-10-03):** (a) Giấy phép NỚI cho riêng phòng Louvre: ngoài phạm vi công cộng / CC0 / CC-BY, được dùng thêm CC-BY-SA, CC-BY-NC, CC-BY-NC-SA (cuộc đua phi thương mại, ghi nguồn đầy đủ); VẪN không dùng ND (cần nén / đổi định dạng / xóa metadata), "chỉ dùng cá nhân" hay giấy phép không rõ. Người dùng ủy quyền nới lỏng chung §17.7 khi cần (chưa áp dụng cho phần khác của game). (b) Tin chat công khai: vị trí góc dưới tùy chọn (mặc định dưới trái, cấu hình). (c) Từ phút 40 (sau gợi ý "5 tác phẩm"), mỗi đội chỉ được chọn TỐI ĐA 5 tác phẩm cùng lúc: bấm chọn khi đã đủ 5 bị từ chối (thông báo "Chỉ được chọn tối đa 5 tác phẩm"), vẫn bỏ chọn được; trước phút 40 không giới hạn.

### 17.20 Nới giấy phép tài nguyên cho cả game (2026-10-03)
- Người dùng DUYỆT nới §17.7 cho TOÀN game (không chỉ phòng Louvre): được dùng thêm CC-BY-SA, CC-BY-NC, CC-BY-NC-SA (cuộc đua phi thương mại, ghi nguồn đầy đủ trong "Ghi nguồn"). Vẫn cấm ND (cần nén / đổi định dạng / xóa metadata), "chỉ dùng cá nhân" và giấy phép không rõ.
- Người dùng DUYỆT hướng cải thiện đồ họa: mô hình quét landmark thật (Notre-Dame, Louvre, Invalides, Pompidou…), thêm người đi đường / xe, texture PBR mặt tiền + HDRI bầu trời, cây và đồ đường phố. Chưa phải duyệt từng tệp: trước khi tải, danh sách tệp (tên, nguồn, giấy phép, dung lượng) phải được trình để người dùng xác nhận một lần.
- **Bảng "Ghi nguồn" (2026-10-03):** chỉ MỞ cho đội sau khi đội về đích (thảm Chặng dừng) hoặc cuộc đua kết thúc; trước đó nút / mục "Ghi nguồn" ẩn hoặc báo "Mở sau khi về đích". Máy chủ chỉ gửi nội dung ghi nguồn chi tiết (tên tác phẩm, tác giả, giấy phép) cho đội đã về đích (không nằm trong tài sản tĩnh `credits.json` công khai); ngoài chặng thật, chế độ thử offline (`?offline=1`) vẫn xem được bảng đầy đủ.
- **Sửa (2026-10-03):** GIỮ NGUYÊN danh sách 23 tác phẩm, KHÔNG thay món nào. Tượng không có bản quét 3D hợp lệ (Nike của Paionios, Psyche hồi sinh) dùng ảnh chụp tượng đặt trên bệ (hoặc dựng tay đơn giản nếu không có ảnh phù hợp); ảnh lấy từ nguồn giấy phép được phép (§17.20, ví dụ Wikimedia Commons CC BY / CC BY-SA / PD), ghi nguồn sau khi về đích.
- **Phạm vi nâng cấp landmark (2026-10-03):** chỉ nâng cấp landmark có trong lộ trình: Cầu Bir-Hakeim, Palais de Tokyo, Khải Hoàn Môn, tháp Eiffel, Crazy Horse Paris, tượng đài Ngọn lửa Tự do, cầu Pont de l'Alma, Hôtel / Vòm Invalides, Louvre (kèm Kim tự tháp), Nhà thờ Đức Bà Paris. Các landmark khác giữ nguyên.
  - (2026-10-03, bổ sung) Khải Hoàn Môn và tháp Eiffel ĐÃ có mô hình gốc thật (GLB, Phase 2B) nên KHÔNG cần nâng cấp: bỏ hai landmark này khỏi danh sách trên.
- **Bỏ nâng cấp landmark (2026-10-03, thay các dòng "Phạm vi nâng cấp landmark" ở trên):** KHÔNG nâng cấp landmark nào (Notre-Dame, Invalides, Ngọn lửa Tự do, Louvre, Bir-Hakeim, Alma, Palais de Tokyo, Crazy Horse… giữ nguyên như Phase 2B). Phase 8C chỉ làm các phần khác: bầu trời / ánh sáng, cây, đồ đường phố, texture mặt tiền / đường, người đi đường, xe, nước, hậu kỳ.
- **Chỉ nâng cấp tượng đài Ngọn lửa Tự do (2026-10-03, thay các dòng về phạm vi landmark ở trên):** trong số landmark chỉ nâng cấp Ngọn lửa Tự do (bản quét CC BY "Flame of Liberty", edemaistre, qua Sketchfab; ghi nguồn sau về đích). Mọi landmark khác, kể cả Kim tự tháp Louvre và Notre-Dame, giữ nguyên như Phase 2B.
- **Phạm vi track texture (2026-10-03):** track T3 (PBR) CHỈ thêm texture NGÓI (mái, `roof_slates_03`) và NHỰA ĐƯỜNG (`asphalt_02`). Không đổi texture mặt tiền (đá, kẽm), vỉa hè, đá lát / pavé; giữ như hiện tại.
- **Cắt phạm vi 8C (2026-10-03):** BỎ đài nước Wallace và BỎ HẲN track T5 (người đi đường + xe NPC mới: không thêm avatar Rocketbox, không thêm xe van / hatchback / taxi / xe buýt / xe rác). Người đi đường và xe giữ như hiện tại. Phase 8C còn: T1 (bầu trời + nước + hậu kỳ), T2 (cây + đồ đường phố trừ đài Wallace + tượng đài Ngọn lửa), T3 (ngói + nhựa đường).
- **Đổi format Thử thách 1 (2026-10-03, thay luật Host duyệt tay cho riêng Thử thách 1; Thử thách 2 giữ nguyên):** khi đội gửi đáp án, đội được thông báo NGAY "x/4" (x = số địa điểm đúng trong 4 địa điểm đội vừa nêu); sau khi kẹt 40 phút ở thử thách này, đội được hiện một gợi ý. Cần người dùng cung cấp: danh sách địa điểm hợp lệ (+ cách viết chấp nhận), nội dung gợi ý, cách nhập (4 ô hay một ô), có phạt 3 phút khi x < 4 không. Chưa làm cho tới khi có đủ. (Hệ quả: Thử thách 1 chuyển từ `host_approval` sang tự chấm trên máy chủ; Host vẫn có nút "Cho qua" / ghi đè.)
- **Hủy đổi format Thử thách 1 (2026-10-03):** Thử thách 1 TRỞ LẠI Host chấm tay (như §17.14 ban đầu): đội gõ đáp án trong game, Host Duyệt / Phạt 3 phút; KHÔNG tự chấm, KHÔNG thông báo x/4. Không cần loại thử thách mới "nêu n địa điểm". Gợi ý vẫn do Host gửi riêng qua Messenger (không có gợi ý 40 phút trong game cho thử thách này); cảnh báo kẹt 45 phút cho Host giữ nguyên.

### 17.21 Không cho sao chép chữ trong mật thư (2026-10-03)
- Chữ trên thẻ mật thư (thẻ thử thách, thẻ lộ trình, thẻ Lựa chọn kép, thẻ Louvre) và trong Sổ mật thư KHÔNG được bôi đen / sao chép: tắt chọn chữ (`user-select: none`), chặn sự kiện copy / cut / kéo thả / menu chuột phải trong vùng thẻ và Sổ. Ngoại lệ: mã bài nộp (nút "Copy" trên thẻ bài ảnh) vẫn sao chép được vì đội cần gửi kèm ảnh. Chỉ là rào cản thông thường (không chống được chụp màn hình hay công cụ nhà phát triển của trình duyệt).

### 17.22 Về đích được thông báo thứ hạng ngay (2026-10-03; thay mặc định §17.13 "NPC không báo đội thứ n")
- Khi đội về đích (vào vùng Chặng dừng / thảm), đội được thông báo NGAY thứ hạng "Về đích thứ n" (cùng thời gian của đội): ở NPC dẫn chương trình trên thảm, toast và thẻ về đích.
- Mặc định (chờ người dùng xác nhận): n = thứ hạng theo thời gian CHÍNH THỨC (giờ về đích − giờ xuất phát riêng của đội − phạt) trong số các đội ĐÃ về đích tại thời điểm đó; là thứ hạng TẠM THỜI vì đội về sau có giờ xuất phát muộn hơn có thể vượt lên. Host vẫn công bố bảng xếp hạng cuối; đội về cuối cùng có thể bị loại (thông báo của Host, không do game).
- **Chốt (2026-10-03, thay mặc định trên và xếp hạng của §17.13):** thứ hạng về đích tính theo THỨ TỰ VỀ ĐÍCH THEO THỜI GIAN THỰC: đội nào chạm đích trước thì hạng trước ("Về đích thứ n" cố định, không tạm thời, không phụ thuộc giờ xuất phát riêng của đội). KHÔNG cộng thêm phạt vào xếp hạng: thời gian phạt (đếm ngược 3 phút / 10 phút) đã trôi ngay tại thử thách đó, đồng hồ đua vẫn chạy nên đã nằm trong thời điểm về đích. Đồng hồ hiển thị của từng đội (từ giờ Host nhập) giữ nguyên chỉ để xem thời gian.

### 17.23 Bỏ đồng hồ của từng đội (2026-10-03; thay §17.12 phần đồng hồ)
- BỎ đồng hồ cuộc đua riêng của từng đội: không còn đồng hồ đội trên HUD (phần "đồng hồ + huy hiệu trạng thái" của đội), không còn ô Host nhập giờ xuất phát riêng cho từng đội, không tính / hiển thị "thời gian chính thức" của đội (kể cả lời NPC trên thảm chỉ còn báo thứ hạng "Về đích thứ n", không báo thời gian). Xếp hạng chỉ theo thứ tự về đích thực (§17.22).
- GIỮ: đồng hồ đếm ngược phạt (3 phút / 10 phút) và các mốc theo thử thách (gợi ý 40 / 70 phút, cảnh báo kẹt 45 phút cho Host) vì tính từ lúc đội bắt đầu từng thử thách, không dùng giờ xuất phát; thông báo "Xuất phát ở vị trí thứ n" (theo thứ tự đăng nhập); HUD phố / quận / tốc độ.
- **Đội về cuối bị loại (2026-10-03, thay "Host thông báo loại" ở trên):** khi đội là đội CUỐI CÙNG chạm đích (mọi đội khác của cuộc đua đã về đích), thông báo về đích của đội đó là thông báo "BỊ LOẠI" do game tự gửi (NPC / toast / thẻ về đích), kèm thứ hạng cuối. Các đội về trước nhận thông báo "Về đích thứ n" như bình thường. Mặc định (chờ xác nhận): "đội cuối" chỉ xác định khi mọi đội đã về đích; nếu Host bấm "Kết thúc" khi còn đội chưa về thì Host thông báo tay.
- **Chốt (2026-10-03):** khi Host bấm "Kết thúc" mà còn đội CHƯA về đích, mỗi đội dang dở đó cũng nhận thông báo "BỊ LOẠI" tự động (cùng chữ với đội về cuối; thứ hạng cuối = sau mọi đội đã về đích). Giọng văn thông báo giữ như bản đề xuất đã duyệt (không chỉnh).

### 17.24 Phạm vi Phase 10 (2026-10-03)
- Phase 10 THU HẸP: chỉ làm công cụ Host cần cho buổi thật: (1) trang Host ghim cột "Đội" + hàng tiêu đề khi cuộn ngang, khung "Chờ duyệt" thu gọn được; (2) nút Hoàn tác 10 giây sau Duyệt / Phạt; (3) khóa bài khi nhiều Host cùng duyệt một câu; (4) nút xóa cờ đỏ (flagged) cho đội bị gắn cờ oan; (5) bảng "vừa rời đi n phút trước" ở bảng "Tại điểm này". BỎ soạn chặng trên bản đồ (người dùng nhập chặng bằng file JSON). Có thể bổ sung các mục nhỏ còn tồn trong TODO.md nếu rẻ.
- **Sửa (2026-10-03):** chỉ có MỘT Host, nên BỎ việc "khóa bài khi nhiều Host cùng duyệt" khỏi Phase 10 (phạm vi còn: ghim cột / tiêu đề + khung thu gọn, Hoàn tác 10 giây, xóa cờ đỏ, "vừa rời đi n phút trước").

### 17.25 Xuất dữ liệu thô thời gian của từng đội (2026-10-03; thêm vào Phase 10)
- Người dùng cần BẢNG THỜI GIAN mỗi đội tới từng lộ trình / bước, KHÔNG cần hiện trong bảng Host, nhưng cần DỮ LIỆU THÔ để XUẤT RA khi kết thúc chặng đua.
- Trang Host có nút "Xuất dữ liệu thời gian" (dùng được bất kỳ lúc nào, dành cho cuối cuộc đua) tải về: (1) bảng theo đội × bước: đội, mã / tên bước, loại, nhánh, thời điểm tới điểm (`arrived_at`), mở hòm (`clue_opened_at`), bắt đầu nhiệm vụ (`task_started_at`), hoàn thành (`completed_at`) dạng mốc tuyệt đối (epoch ms + ISO UTC + giờ Việt Nam) và số giây kể từ lúc Host mở cuộc đua, số giây từ lúc hoàn thành bước trước, số lần sai / phạt, số giây bị khóa, số lần đổi nhánh, thời gian chờ Host duyệt; (2) bảng theo đội: thứ tự vào game, hạng về đích, thời điểm về đích, bị loại hay không; (3) toàn bộ nhật ký sự kiện (bảng `events`) dạng thô. Định dạng CSV (UTF-8 có BOM để Excel đọc tiếng Việt) và JSON. Chỉ Host (token) tải được; đọc từ SQLite, không ghi thêm dòng nào; không chứa đáp án của chặng (chỉ số lần sai / thời gian).

### 17.26 Tin công khai của phòng Louvre (2026-10-03)
- Tin công khai chỉ báo đội trả lời sai và bị phạt 3 phút. **Bỏ** phần công khai "đúng x/5" (kể cả sau phút 70) và tin khi đội chốt đúng, vì có thể lộ số đáp án đúng cho đội đến sau. "Đúng x/5" sống vẫn hiện riêng cho đội đó từ phút 70.
- Lựa chọn kép: không phạt 3 phút, Host chỉ cần nút Duyệt (chặng đặt `retryLockMinutes: 0` cho hai nhánh).

### 17.27 Luật đua không lộ chi tiết Thử thách 3 (2026-10-03)
- `docs/RACE_RULES.md` (mở trong game) chỉ nói cách thao tác phòng Louvre (vào / ra, nút đỏ xanh, nút chốt, phạt 3 phút, tin công khai). Không nêu số tác phẩm, số đáp án, mốc gợi ý phút 40 / 70, giới hạn 5, hay cách dò đáp án.

- **Cập nhật 17.27 (2026-10-03):** `docs/RACE_RULES.md` không nhắc gì tới Thử thách 3 / phòng Louvre (mục riêng, số tác phẩm, đáp án, gợi ý, ghi nguồn riêng cho phòng đều bỏ). Người chơi vào chơi mới biết; thẻ thử thách trong game tự nói cách làm.

- **Cập nhật 17.28 (2026-10-03):** `docs/RACE_RULES.md` rút gọn từ 323 còn 124 dòng, chỉ giữ phần người chơi cần: bỏ yếu tố đặc biệt đã hoãn (Quay đầu, Nhường đường, Vé, Gờ giảm tốc), kiểu mini-game chưa có, luật đi bộ bắt buộc / bỏ cuộc, chi tiết công cụ Host (Hoàn tác, cờ đỏ, Cho qua, xuất CSV), chú giải kỹ thuật.

### 17.29 Giữ Shift = chạy nhanh ×2, bỏ đi chậm (2026-10-03; thay "không có chạy nước rút" và "Shift = đi chậm")
- Giữ `Shift` (trái / phải, theo `KeyboardEvent.code`; tay cầm `LB`) = **×2 tốc độ hiện tại**, áp dụng cho CẢ đi bộ (và bơi) LẪN xe đạp; thả = tốc độ thường. Hệ số `SPRINT_MULTIPLIER = 2` ở một chỗ (`shared/src/constants.ts`; client `movement.sprintMultiplier` đọc từ đó). Xe: chỉ trần tốc độ nhân 2, độ bám / cua gắt / ngã xe giữ nguyên theo tốc độ thật.
- BỎ HẲN chức năng đi chậm cũ của Shift / LB (khóa `walkSlow`, `slowWalkFactor`, chế độ `slow` trên đường truyền).
- Máy chủ (cờ tốc độ chỉ gắn cờ, §13.9) nới ngưỡng theo cùng hệ số: đi bộ ≤ footSpeed × 2 × 1,25, xe ≤ footSpeed × 1,3 × 2 × 1,25 (mặc định 10 / 13 m/s); điểm tin cậy chống dịch chuyển cũng đi tối đa ở tốc độ xe × 2 × 1,25. Vẫn bắt dịch chuyển tức thời và tốc độ vượt xa mức ×2.

### 17.30 Xe mồi bấm F báo "Xe này bị hỏng" (2026-10-03)
- Xe mồi (decoy, `segment = −1`) trông y hệt xe thường và KHÔNG gửi cờ nào cho client. Bấm `F` vào xe mồi: máy chủ từ chối (`bike claim` `reason: 'broken'`), client hiện toast **"Xe này bị hỏng"**, không lên xe; xe không đổi chủ, không ghi SQLite, vẫn đứng yên tại chỗ. Xe thật (segment ≥ 0), xe Host đặt (−2) và xe ở bãi không đổi; dọn xe / xe hoang với xe mồi giữ như cũ.

### 17.31 Thử thách 1: Host báo "đúng x/4" khi Phạt, từ phút 30 (2026-10-03)
- Task có trường tùy chọn `scoreOf` (số nguyên ≥ 1; T1 chặng thật: `4`) và `scoreFromMinutes` (mặc định 30). Duyệt / Phạt giữ nguyên. Khi task có `scoreOf`, hàng chờ duyệt trên trang Host có ô "Đúng ?/n" cạnh nút Phạt; Phạt gửi `host.review` `score` (0…n, ngoài khoảng / trống = không có số). Số được lưu cùng câu trả lời (`AnswerRec.sc`, SQLite trước khi trả lời).
- Đội CHỈ được báo số khi Phạt xảy ra ≥ `task_started_at + scoreFromMinutes` phút: quyết định tại lúc Phạt, lưu cờ `sv` cùng câu trả lời (không hồi tố: Phạt trước mốc không bao giờ hiện số). Khi có cờ: toast "Host chưa duyệt: đúng 2/4. Chờ hết đếm ngược rồi trả lời lại" + lịch sử trên thẻ "Bị phạt 3 phút · đúng 2/4" — chỉ cho chính đội đó, không công khai, không vào tin công khai. Duyệt (kể cả Duyệt sửa một Phạt nhầm) không mang số; Hoàn tác trả hàng về như trước nên số mất theo. Trang Host ghi cạnh ô "đội sẽ thấy số" / "đội chưa thấy số: còn n phút". Export: cột `penaltyScores` ("2/4;3/4", `*` = đội chưa được báo).

### 17.32 Bắt đầu thử thách → xuống xe, xe để lại cạnh người chơi (2026-10-03)
- Khi một thử thách / nhánh Lựa chọn kép BẮT ĐẦU (nhận thẻ thử thách làm tại điểm sau khi bước trước xong — kể cả Host Duyệt từ xa hoặc đáp án tự động đúng khi đội đang đạp xe; bấm "Nhận thử thách" trên thẻ có câu gợi ý; mở hòm nhánh làm tại điểm; lộ trình bắt buộc đi bộ), đội đang giữ xe thì **bị cho xuống xe ngay**: máy chủ ghi xe không chủ (`owner null`, `parked`) tại vị trí tin cậy hiện tại của đội (offline: nơi xe đang đứng = vị trí cuối đã biết) vào SQLite trước khi gửi; client nhận `bikes` → nhân vật xuống xe (animation xuống xe, xe đứng tại chỗ, không ngã), toast "Bạn được xuống xe để làm thử thách. Xe để lại cạnh bạn, đội khác có thể lấy!". Ai cũng lấy được xe đó.
- Xe KHÔNG còn dịch tới tọa độ `bikeParking` của chặng (không teleport); `bikeParking` chỉ còn là nhóm đếm `maxBikes` (xe bỏ lại nhiều nhất ở một điểm → chiếc để lâu nhất biến mất). Nhiệm vụ làm ở "Địa điểm" khác giữ luật cũ: xuống xe khi tới nơi đó. Thay quyết định "Host duyệt khi đội ở xa / đang đạp xe thì xe không vào bãi" (TODO Phase 8 mặc định). Đội đã về đích / bị loại không bị tác động (không còn bước nào bắt đầu).

### 17.33 Phòng Louvre: nút "Vào phòng" trên thẻ, "CHÍNH XÁC" và tự ra sau 5 s (2026-10-03)
- Thẻ mật thư Thử thách 3 (khối phòng Louvre) có nút **"Vào phòng"**: bấm được khi đội đang điều khiển nhân vật, đứng trong `louvreRoom.enterReach` (3 m) quanh hòm (đúng điều kiện của phím F ở hòm; xa hơn: nút mờ + "Tới sát hòm mật thư rồi bấm"); vào bằng đúng `room.enter()` (chỉ đổi y). Bấm xong thẻ tự đóng, chuột khóa lại. Trong phòng / bước đã xong: không có nút. Phím F ở hòm vẫn vào như cũ.
- Chốt ĐÚNG: mật thư kế vào Sổ ngay lúc chốt (như cũ); client hiện chữ lớn **"CHÍNH XÁC"** giữa màn hình (`raceHud.announceSeconds` = 3 s, chỉ đội đó thấy), dòng nhỏ "Bạn sẽ ra khỏi phòng sau n giây…", rồi **tự ra khỏi phòng** sau `louvreRoom.autoExitSeconds` (5 s): nhân vật lên đúng chỗ hòm (chỉ đổi y) và thẻ mật thư kế mở ra (thẻ này không tự bật khi đội còn trong phòng). Tải lại trang trong 5 s: vào lại trên sân Louvre theo luật "đã chốt đúng mà chưa ra" (phase8b §A (6)); tải lại khi chưa giải xong: vào lại trong phòng như cũ.
- **Không có cửa, không có lối ra thủ công** (bỏ cửa + biển "Lối ra – bấm F", bỏ F ở cửa; thay phase8b §A (6) "ra bất kỳ lúc nào bằng F ở cửa"): đội chỉ ra khỏi phòng tự động. Chốt an toàn: bước phòng Louvre xong bằng bất kỳ cách nào khác (Host "Cho qua"…) → cùng đường ra sau 5 s, không có chữ "CHÍNH XÁC" (chỉ hiện khi chính đội vừa gửi chốt); về đích / BỊ LOẠI / Host kết thúc cuộc đua khi đội còn dưới phòng → ra ngay.

