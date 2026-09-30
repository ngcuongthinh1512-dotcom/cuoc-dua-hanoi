# Phase 4 – Di chuyển: kế hoạch

Nguồn: SPEC §4.4, §5, §6.1–6.6, §14, §17.1–17.2, §17.5, §17.7, §17.9; STYLE_GUIDE "Camera"; `docs/plans/phase2b-assets.md` §3.3–3.4; `docs/plans/phase3.md` §9.

## 1. Phạm vi

- **Có:**
  - đi bộ: giữ nguyên Phase 3, chỉ kiểm tra lại (`p3-jog`, `p3-street`);
  - xe đạp: model kiểu Vélib', vật lý, lên / xuống xe bằng `F`, chuông `R`, ngã xe, lấp lánh khi ≤ 30 m;
  - xe đạp **cục bộ** (vài chiếc cạnh spawn) để thử;
  - `npm run build-graph` → `shared/data/roadgraph.json` + A*, điểm gần nhất, hành lang (thư viện thuần TS);
  - bậc thang thật (kể cả bậc xuống sông Seine, lối xuống metro);
  - giao lộ sát ranh chunk (biển tên đường / cột đèn).
- **Không có (để sau):**
  - Phase 5: GPS / minimap dùng đồ thị, respawn "bậc thang gần nhất", HUD báo "không đi xe trên bậc thang";
  - Phase 6: đồng bộ xe qua server, xe chung, nhận xe nguyên tử, bãi xe, bỏ xe 200 m / 60 s, người chơi khác đạp xe, gửi `R` qua mạng, hành lang đặt xe tính ở Host;
  - Phase 4B: xe / người NPC (đồ thị đã giữ sẵn loại đường, `oneway`, `lanes`, giao lộ, vạch qua đường, đèn);
  - Phase 12: âm thanh thật (Phase 4 dùng WebAudio tổng hợp đơn giản).

## 2. Kiểm tra đầu vào

### 2.1 Xe đạp `bicycle_poly-by-google.glb` (287 KB, CC-BY 3.0)
- **1 node, 1 mesh, 6 primitive** (4 792 tam giác): bánh xe, đùi đĩa, bàn đạp **không tách sẵn**. Tách theo thành phần liên thông (đã đo):
  - `Mat.4` xám (32 thành phần): nan hoa + khung;
  - `Mat.1` đen: 2 lốp, đĩa xích, 2 bàn đạp;
  - `Mat` trắng: 2 vành;
  - `Mat.2` đỏ: khung, càng, đùi;
  - `Mat.3` xanh: yên + 2 tay nắm;
  - `default_Mat`: 1 miếng nhỏ.
- Đơn vị gốc không phải mét: dài 862, cao 524. **Xe hướng về +Z** (tay lái z > 0, yên z ≈ −113), giống nhân vật glTF (+Z).
- Số đo gốc:
  - trục bánh: z ≈ −250 và +295 (chiều dài cơ sở 545), y ≈ −83;
  - bán kính lốp 154;
  - trục giữa (đùi đĩa) ≈ (0, −120, −38);
  - mặt đất y = −237;
  - yên cao nhất y ≈ 256, tay nắm y ≈ 287.
- Tỉ lệ **0,00214** (bánh 26″ ≈ 0,66 m) cho:
  - dài 1,84 m;
  - yên 1,05 m, tay nắm 1,12 m;
  - trục giữa cao 0,25 m.
- Yên hơi cao so với chân UBC (xem 2.2). Track A hạ cọc yên hoặc giảm tỉ lệ (đích: yên ≈ 0,95 m).

### 2.2 Clip UAL `Driving_Loop` (1,67 s, đã có trong `player-anims.glb`)
- Đây là tư thế **ngồi ô tô** (đo ở t = 0, tính từ gốc bàn chân, mặt nhìn +Z):
  - hông cao 0,56 m, lùi 0,32 m;
  - bàn chân duỗi ra trước (z ≈ +0,12 … +0,27, cao 0,03–0,12 m);
  - tay ở 0,93 m, z ≈ 0.
- Trên xe đạp:
  - nâng gốc để hông nằm trên yên (≈ +0,4 m);
  - chân IK 2 xương (đùi + cẳng ≈ 0,83 m) tới bàn đạp theo góc đùi đĩa;
  - tay IK tới tay nắm (xa hơn và cao hơn tay trong clip) + nghiêng cột sống ra trước vài độ;
  - xoay cả người theo `lean` của xe.

### 2.3 Code Phase 3
- `CharacterController` (KCC capsule, autostep 0,4 m, snap, bơi / leo bờ) ghi `PlayerState`.
- `Player.ts` ghép model + animator + controller + camera.
- `ThirdPersonCamera` đã có `vehicle: 'bike'` (`thirdPersonCamera.bike`) và FOV theo tốc độ (`fovBoost`).
- Phím `interact` (`F`) và `bell` (`R`) **đã có** trong `keys` và `padButtons`.
- Clip `cycle` → `Driving_Loop` đã khai báo.

### 2.4 Dữ liệu đường
- Chunk `roads`: `kind`, `name`, `width`, `lanes`, `oneway` (`-1` đã đảo), `surface`, `roundabout`, `junctions`. **Không có** `footway=sidewalk|crossing` (bị bỏ), đường hầm, tầng âm.
- OSM thô (`.cache/osm`, 96 tile + `global.json`): way có `nodes` (id) + `geometry`, nên nối đồ thị theo id node. Số liệu:
  - footway 25 134 (sidewalk 13 730, crossing 6 224), steps 2 228 (835 có `step_count`, `incline` up / down);
  - primary / secondary / tertiary / residential / service ≈ 4 700, cycleway 984, pedestrian 1 131;
  - `surface=sett` 2 143;
  - node `highway=crossing` 7 268, `traffic_signals` 1 321;
  - `amenity=bicycle_parking` 2 668, `subway_entrance` 344;
  - khoảng 175 nghìn lượt tham chiếu node.
- `RoadBuilder` hiện vẽ `steps` như dải vỉa hè phẳng (`footKinds`), không có collider riêng.
- `StreetProps.findJunctions` bỏ sót nhánh nằm ở chunk bên cạnh (ponytail đã ghi).

## 3. Quyết định

1. **Package: không thêm.** Rapier, three, gltf-transform, meshoptimizer đã có.
2. **Xe đạp chạy bằng chính KCC của nhân vật.**
   - Khi `moveMode === 'bike'`, `CharacterController` lấy vận tốc ngang và hướng từ `BikeController` thay cho WASD.
   - Capsule vẫn là thân va chạm (một collider, không có rigid body động).
   - Mũi xe (`bike.wheelBase`) được thăm dò thêm bằng shape cast phía trước để bánh trước không chui vào tường.
   - Trọng lực, snap, cầu, biên map, rơi sông dùng lại nguyên. Rơi xuống nước khi đang đạp → xuống xe, bơi; xe đứng lại ở bờ.
3. **Mô hình xe đơn giản (SPEC §6.1, §6.6):**
   - tốc độ dọc hướng xe `speed`, tối đa `bikeTopSpeed()` = `footSpeed × bikeSpeedMultiplier` (5,2 m/s), không đổi theo dốc;
   - từ 0 lên tối đa trong `bike.accelTime` (1 s);
   - `S` phanh, dừng rồi mới lùi chậm (`reverseSpeed`);
   - `A` / `D` quay theo `turnRate`, giảm dần theo tốc độ;
   - cua gắt (vượt `sharpTurn.rate`) thì mất tốc;
   - `lean` tỉ lệ với tốc độ × tốc độ quay;
   - trên đá lát (`RoadGraph.surfaceAt` = `'pave'`): độ bám `paveGrip` nhân vào quay và phanh;
   - va tường: giữ `wallKeep` tốc độ;
   - mất ≥ `crashImpact` m/s trong 1 bước → **ngã xe**: xuống xe, `startAction('crash')` (3,5 s, nằm ≈ 2 s theo Phase 3). Xe vẫn là của mình, đứng tại chỗ.
   - Hàm bước là hàm thuần (`stepBike`), test không cần Rapier.
4. **Không đi xe trên bậc thang.**
   - Track D tạo collider riêng cho mỗi `highway=steps` và đăng ký handle vào `stairColliders` (`world/stairs.ts`).
   - Track B chặn khi collider dưới xe (tia xuống) hoặc chạm phía trước nằm trong tập đó: dừng như gặp tường, `speed = 0`, không leo.
   - Phase 5 thêm thông báo HUD.
5. **Lên / xuống xe (`F`):**
   - chỉ khi đang đi bộ (`walk` / `slow`, trên đất, không có action), xe cách chân ≤ `bikeRules.interactRadius` (2,5 m) và còn trống hoặc là xe của mình;
   - bấm `F` lần nữa khi đứng yên / chậm để xuống xe (ra bên trái `dismountSide`);
   - mỗi người 1 xe: lấy xe khác thì xe cũ biến mất.
   - Việc lên xe là tức thời về vật lý. Track A tự blend hình trong `bikeModel.mountBlend`.
   - Phase 7 sẽ ưu tiên `F` cho hộp mật thư khi cả hai cùng gần.
6. **Xe cục bộ:** `vehicle/Bikes.ts` đặt `bike.devSpawns` (tọa độ lệch so với `playerSetup.spawn`, không gắn vào L1–L6, SPEC §17.9). Phase 6 thay bằng xe từ server, giữ nguyên `BikeState`.
7. **Model dùng chung:** `BikeModel` load 1 lần, clone mỗi xe. Phase 6 dùng cho xe chung và người chơi khác.
   - Lấp lánh: xe trống và người chơi ≤ `bikeRules.sparkleRadius` (30 m). Bên gọi quyết định, model chỉ hiện.
   - Dấu khóa: màu đội theo `ownerColour`.
8. **Đồ thị đường**
   - `scripts/build-graph.ts` đọc thẳng `.cache/osm`: giữ cả vỉa hè / vạch qua đường, bỏ hầm / tầng âm / trong nhà.
   - Ghi file `shared/data/roadgraph.json` (commit, tất định).
   - Client lấy bằng `import url from '@race/shared/data/roadgraph.json?url'` (`client/src/geo/roadGraph.ts`). Vite xuất thành asset tĩnh có hash trong `client/dist/assets/`, đã thử với foundation. Không nằm trong bundle JS, không có bản sao trong `client/public`.
   - Worker **không import** `@race/shared/graph` hay file JSON (bundle DO nhỏ, DO không tính toán).
   - Đích kích thước ≤ 6 MB thô (≈ 2 MB gzip), trần cứng 25 MB.
9. **Giao lộ sát ranh chunk:**
   - Track D **không chờ** track C. D tính danh sách giao lộ toàn cục ngay trong `build-chunks` (cùng khóa đỉnh làm tròn đang dùng cho `junctions`) và ghi vào từng chunk (`ChunkData.junctions`): mọi nhánh kể cả nhánh thuộc chunk bên cạnh.
   - Giao lộ thuộc chunk chứa điểm đó. Điểm cách ranh ≤ `lampJunctionGap` được ghi thêm vào chunk kề dưới dạng chỉ-điểm, để chừa khoảng trống cho cột đèn.
   - `junctions` của `roadgraph.json` (track C) dùng cho NPC / GPS, không dùng cho world builder. Hai bên cùng đọc OSM nên không phụ thuộc nhau.
10. **Bậc xuống sông (SPEC §4.4):**
    - Track D dựng các đợt bậc từ mặt kè xuống dưới mặt nước (bậc cuối thấp hơn mặt sông ≈ 0,5 m) ở các `steps` OSM có đầu dưới cách mép sông ≤ 15 m. Nếu quá thưa (< 1 đợt / 400 m bờ), thêm đợt tổng hợp theo khoảng cách cố định (ghi trong `config.stairs`).
    - Người bơi tới bậc, KCC bước lên, tự thành `walk` khi hết sâu (`swim.enterDepth`).
    - Vị trí chân bậc ghi vào `water.json` (`stairs: [x, z, …]`) cho Phase 5 respawn.
11. **Lối xuống metro:** không có hầm.
    - Hố bậc xuống `stairs.metroDepth` bên trong lan can Guimard có sẵn, cuối là tường / cửa đóng.
    - Terrain collider giữ nguyên; lan can + khối chắn vô hình không cho đi vào (`ponytail:`). Chỉ là hình ảnh.
12. **Âm thanh:** `client/src/audio/sfx.ts` dùng WebAudio tổng hợp:
    - chuông `R`: 2 sóng sin ≈ 2,1 / 3,2 kHz tắt dần 0,6 s;
    - rì rầm lốp trên đá lát: noise lọc, âm lượng theo tốc độ;
    - tiếng ngã: noise ngắn.
    - `AudioContext` mở sau cú nhấp đầu tiên (pointer lock). Sau này thay file thật (Phase 12).

## 4. Nền đã commit (foundation, commit này)

| File | Nội dung |
|---|---|
| `client/src/player/types.ts` | `MoveMode` thêm `'bike'` |
| `client/src/player/Animation.ts` | `pickState`: `moveMode 'bike'` → `'cycle'` (action như crash vẫn thắng) |
| `client/src/vehicle/types.ts` | `BikeState`, `RiderTargets`, `RoadSurface` |
| `client/src/vehicle/BikeModel.ts` | **stub** của A: hộp xám placeholder, đúng chữ ký (`loadBikeAsset`, `BikeModel.update / riderTargets / dispose`) |
| `client/src/world/stairs.ts` | `stairColliders: Set<number>` (handle Rapier) |
| `shared/src/graph/types.ts` | định dạng `RoadGraphFile`, `WayFlag`, `WAY_HEADER`, `TravelMode`, `GRAPH_VERSION` |
| `shared/src/graph/RoadGraph.ts`, `route.ts`, `index.ts` | **stub** của C (trả "không thấy"), đúng chữ ký |
| `shared/package.json` | exports `./graph`, `./data/*` |
| `shared/data/roadgraph.json` | đồ thị rỗng hợp lệ (C ghi đè) |
| `client/src/geo/roadGraph.ts` | `loadRoadGraph()` qua `?url`, lỗi → `console.warn` |
| `client/src/config.ts` | khối Phase 4 cuối file: foundation `bikeTopSpeed()`, `bikeRules`; A `bikeModel`; B `bike`; C `roadGraph`; D `stairs` |
| `client/src/config.test.ts` | test tỉ lệ 1,3 |
| `scripts/screenshot.ts` | khối `p4-*` rỗng, mỗi track một dòng chú thích |

## 5. Interface (track giữ nguyên chữ ký; đổi thì báo người tích hợp)

```ts
// client/src/vehicle/types.ts
interface BikeState {
  id; position: Vector3 /* pivot = ground contact under the bottom bracket */; yaw; speed; steer; lean;
  wheelAngle; crankAngle; owner: string | null; ownerColour: string | null; rider: string | null;
}
interface RiderTargets { saddle; pedalL; pedalR; gripL; gripR: Vector3 } // world
type RoadSurface = 'asphalt' | 'pave';

// client/src/vehicle/BikeModel.ts (A)
loadBikeAsset(url = bikeModel.url): Promise<BikeAsset>
new BikeModel(asset); model.root; model.update(state, sparkle: boolean, dt); model.riderTargets(): RiderTargets; model.dispose()

// client/src/player/Animation.ts (A) – thêm
CharacterAnimator.setRider(t: RiderTargets | null, lean: number): void   // null = đi bộ; blend trong bikeModel.mountBlend

// client/src/vehicle/BikeController.ts (B)
stepBike(b: BikeState, input: { throttle: number; brake: boolean; turn: number }, surface: RoadSurface, dt): void  // thuần
// CharacterController (B) – thêm
controller.ride(bike: BikeState | null)   // moveMode 'bike' khi khác null; va chạm → onCrash callback

// client/src/world/stairs.ts
stairColliders: Set<number>

// @race/shared/graph (C)
RoadGraph.decode(file); g.x/z; g.edgeA/edgeB/edgeWay/edgeLength; g.flags(e); g.allows(e, mode, forward); g.edgesOf(n)
g.nearestNode(x, z, mode, maxDist?); g.nearestEdge(x, z, maxDist); g.surfaceAt(x, z)
shortestPath(g, from, to, mode): Path | null; pathPolyline(g, path); corridorEdges(g, path, width, mode)
// client/src/geo/roadGraph.ts
loadRoadGraph(): Promise<RoadGraph | undefined>
```

## 6. `roadgraph.json` (v 1, `shared/src/graph/types.ts`)

```jsonc
{
  "v": 1,
  "nodes": [x0, z0, x1, z1, …],        // world dm (m × 10, int), node i = nodes[2i], nodes[2i+1]
  "kinds": ["footway", "primary", …],  // highway=*
  "names": ["Rue Royale", …],
  "ways": [[kind, flags, lanes, name, widthDm, layer, n0, n1, …], …],  // sort theo id OSM
  "junctions": [n, …],   // ≥ 3 đầu cạnh "street" (carKinds + pedestrian) gặp nhau
  "crossings": [n, …],   // highway=crossing
  "signals": [n, …],     // highway=traffic_signals
  "bikeParking": [x, z, …]  // dm
}
```

- **Flags** (`WayFlag`): `walk 1`, `bike 2`, `car 4`, `oneway 8`, `bridge 16`, `steps 32`, `crossing 64`, `sidewalk 128`, `pave 256`, `roundabout 512`.
  - `walk`: mọi đường giữ lại;
  - `bike`: mọi đường trừ `steps`;
  - `car`: `roads.carKinds` + `service`;
  - `oneway`: chỉ ràng buộc `car`, theo thứ tự node (`-1` đã đảo; vòng xuyến ngầm định).
- **Giữ:** `highway=*` dạng line, trừ `NOT_ROADS` của `osm.ts` (corridor, elevator, platform…), `area=yes`, `tunnel` / `covered`, `layer < 0` không phải cầu, `indoor`. Cắt theo lưới chunk (như `build-chunks`).
- **Nút:** mỗi node OSM trên way giữ lại = 1 nút, gộp theo id. Được phép rút gọn đỉnh bậc 2 thẳng hàng (Douglas–Peucker ≤ 0,5 m), nhưng không bỏ nút giao, vạch qua đường, đèn, đầu mút.
- **Tất định:**
  - sort way theo id, node theo thứ tự xuất hiện đầu tiên;
  - JSON gọn (không thụt dòng);
  - chạy 2 lần cho cùng sha256.
- In thống kê: số nút, cạnh, thành phần liên thông lớn nhất (walk) ≥ 95 % số nút, kích thước file.

## 7. Bốn track: file sở hữu và việc cần làm

Mỗi track chỉ sửa file của mình và **khối config của mình**, không thêm import vào config. File dùng chung (`main.ts`, `Player.ts`) thuộc B. A chỉ đụng `Animation.ts` / `CharacterModel.ts`.

### Track A – model xe + dáng người đạp
- **File:** `scripts/process-assets.ts` (hàm `bike()`, `MODIFIED` + `bicycle_poly-by-google.glb`), `client/public/models/bike.glb`, `client/public/credits.json`, `client/src/vehicle/BikeModel.ts` (+ test), `client/src/player/Animation.ts` (+ test), `client/src/player/CharacterModel.ts` (nếu cần gốc hông), config `bikeModel`, preset `[A]`.
- **Việc cần làm:**
  - Tách theo thành phần liên thông ra các node:
    - `frame`: khung + yên + chắn bùn + giỏ;
    - `fork`: càng + tay lái + bánh trước;
    - `wheelF`, `wheelR`: lốp + vành + nan, tâm ở trục;
    - `crank`: đĩa + 2 đùi + 2 bàn đạp, tâm ở trục giữa.
  - Chỉnh model:
    - pivot ở điểm chạm đất dưới trục giữa, mặt đất y = 0, xe hướng +Z;
    - tỉ lệ theo 2.1;
    - sơn lại kiểu Vélib': khung xám, điểm xanh, không chữ / logo;
    - giỏ trước dựng bằng code (khung dây hoặc hộp lưới vài chục tam giác) và gộp vào `fork`;
    - meshopt, ≤ 300 KB, ≤ 6 000 tam giác.
  - `credits.json` có "(đã chỉnh sửa)".
  - Hiển thị:
    - bánh quay theo `wheelAngle`, đùi đĩa theo `crankAngle`;
    - tay lái theo `steer`, cả xe nghiêng `lean` quanh trục chạm đất;
    - chân chống khi `rider === null` (nghiêng 8–10° hoặc chân chống vẽ bằng code);
    - dấu khóa màu `ownerColour` (biển nhỏ sau yên + icon khóa sprite);
    - lấp lánh (Points, additive, tắt khi `sparkle` false).
  - Người đạp:
    - `cycle` = `Driving_Loop` + gốc nâng lên yên;
    - IK 2 xương hai chân (thigh → calf → foot) theo `pedalL/R`, gối hướng ra trước;
    - IK tay tới `gripL/R`;
    - cột sống nghiêng trước, cả thân nghiêng `lean`;
    - blend lên / xuống xe `mountBlend`;
    - ngã xe: `crash` Phase 3 chạy khi đã xuống xe (B gọi).
- **Test:**
  - `wheelAngle` = quãng đường / `wheelRadius`;
  - bbox model: min y ≈ 0 (±2 cm), dài 1,7–1,9 m;
  - các node `wheelF/wheelR/crank/fork` tồn tại;
  - IK: bàn chân cách bàn đạp ≤ 2 cm ở 8 góc đùi đĩa, gối không duỗi quá 180°;
  - `pickState` → `cycle` khi `moveMode 'bike'`, crash vẫn thắng.
- **Preset:**
  - `p4-bike-model`: xe đứng cạnh spawn, orbit 90, thấy giỏ và màu;
  - `p4-ride-side`: `?bike&autoMove=walk&orbit=90&wait=2`, chân trên bàn đạp;
  - `p4-ride-lean`: `?bike&autoMove=walk&autoTurn=left&wait=2`.

### Track B – vật lý xe + lên / xuống xe
- **File:** `client/src/vehicle/BikeController.ts` (+ test), `client/src/vehicle/Bikes.ts` (+ test), `client/src/audio/sfx.ts`, `client/src/player/CharacterController.ts` (+ test), `client/src/player/Player.ts` (+ test), `client/src/player/ThirdPersonCamera.ts` (chỉ khi phải chỉnh), `client/src/main.ts`, `client/src/ui/DebugOverlay.ts` (dòng "Xe: …"), config `bike` + `thirdPersonCamera.bike`, preset `[B]`.
- **Việc cần làm:**
  - `stepBike` thuần theo mục 3.3.
  - `CharacterController.ride(bike)`: khi đang đạp thì dùng vận tốc của xe, cast mũi xe, chặn `stairColliders`, phát hiện va chạm (vận tốc KCC so với mong muốn, thành phần vào pháp tuyến), crash → `ride(null)` + `startAction('crash')`.
  - `Bikes.ts`:
    - danh sách `BikeState` + `BikeModel`;
    - `devSpawns`;
    - `F` lên / xuống, 1 xe / người;
    - lấp lánh ≤ 30 m;
    - xe đang đạp đi theo người (pose từ controller, render nội suy).
  - `Player.ts`:
    - `vehicle: 'bike'` cho camera;
    - URL `?bike` (bắt đầu trên xe), `autoTurn=left|right`;
    - `R` chuông (chỉ khi đạp).
  - `main.ts`: `loadRoadGraph()` → `surfaceAt` cho `stepBike`, dùng `'asphalt'` khi chưa có đồ thị.
  - `sfx.ts`: chuông, tiếng đá lát, tiếng ngã.
  - Hiệu năng: bước xe ≤ 0,1 ms.
- **Test (bắt buộc):**
  - tốc độ tối đa / tốc độ đi bộ tối đa = 1,3 ± 1 %, đo bằng mô phỏng `stepBike` và bằng controller thật trên mặt phẳng Rapier, so với `CharacterController` đi bộ;
  - 0 → 90 % tối đa trong 0,9–1,1 s;
  - phanh dừng được;
  - `lean` cùng dấu với hướng cua;
  - cua gắt giảm tốc;
  - đá lát quay chậm hơn;
  - va tường ≥ `crashImpact` → crash, dưới ngưỡng → chỉ giảm tốc;
  - không lên được collider bậc thang;
  - `F` chỉ trong 2,5 m và chỉ khi đi bộ;
  - lấy xe thứ hai thì xe cũ biến mất;
  - ngã xong xe vẫn `owner` cũ.
- **Preset:**
  - `p4-mount`: cạnh xe dev, lấp lánh;
  - `p4-ride`: `?bike&autoMove=walk&wait=3`, camera xa hơn, FOV tăng;
  - `p4-cobbles`: đường `sett`, B chọn tọa độ;
  - `p4-stairs-block`: đạp vào chân bậc thang, dừng lại;
  - `p4-crash`: đạp vào tường, nằm trên đất cạnh xe.

### Track C – build-graph + định tuyến
- **File:** `scripts/build-graph.ts` (+ `scripts/build-graph.test.ts` với fixture OSM nhỏ), `package.json` (script `build-graph`), `shared/data/roadgraph.json`, `shared/src/graph/*` (+ test), `client/src/geo/roadGraph.ts`, config `roadGraph`, `CLAUDE.md` (dòng lệnh `build-graph`).
- **Việc cần làm:**
  - Build theo mục 6.
  - `RoadGraph.decode`: CSR, lưới băm không gian 50 m cho `nearestNode` / `nearestEdge` / `surfaceAt`.
  - `shortestPath`: A* heuristic Euclid, heap nhị phân; `car` theo `oneway`, `walk` / `bike` hai chiều; `bike` bỏ `steps`.
  - `corridorEdges`: lưới + khoảng cách đoạn–đoạn.
  - `pathPolyline`.
- **Test:**
  - fixture: giao lộ, `oneway`, `steps`, cầu, crossing, bị bỏ (tunnel, area, corridor);
  - build 2 lần cùng hash;
  - A* bằng Dijkstra trên đồ thị ngẫu nhiên;
  - `oneway` được tôn trọng cho `car`;
  - `corridorEdges` chứa phố song song cách 60 m khi W = 150;
  - trên file thật: L1–L6 (điểm thử, §17.9) đi bộ tới nhau được, đường đi ≤ 1,6 × đường chim bay;
  - file ≤ 25 MB (cảnh báo > 6 MB);
  - `surfaceAt` trả `'pave'` trên một phố `sett` đã biết.
- **Preset:** không cần.
- **Thống kê:** in thời gian A* trên file thật (mục tiêu < 30 ms giữa L1 và L6).

### Track D – bậc thang + giao lộ ranh chunk
- **File:** `scripts/build-chunks.ts`, `client/src/geo/chunkData.ts` (thêm `junctions?`, trường cho steps nếu cần), `client/src/geo/osm.ts` (`roadFacts` thêm `step_count` / `incline`), `client/src/world/StairBuilder.ts` (mới, + test), `client/src/world/RoadBuilder.ts` (không vẽ `steps` phẳng nữa), `client/src/world/StreetProps.ts` (dùng `ChunkData.junctions`, metro), `client/src/world/buildTypes.ts` / `chunkBuild.ts` / `attach.ts` / `ChunkManager.ts` (collider bậc + `stairColliders`), `client/src/world/Terrain.ts` (chỉ khi cần cho bậc kè), `client/public/data/chunks/*` + `water.json` (build lại), config `stairs` + `streetProps` nếu cần, preset `[D]`.
- **Việc cần làm:**
  - **Bậc thang:**
    - độ cao lấy từ `heightAt` hai đầu (grid đã carve), số bậc = `step_count` hoặc Δh / `riser`;
    - mặt bậc + cổ bậc, 2 thành bên, tay vịn nếu có `handrail` (hoặc luôn có, đơn giản);
    - collider: ramp trimesh mỏng theo độ dốc (KCC đi mượt) nếu dốc ≤ `player.maxSlopeDeg`, nếu không thì hộp từng bậc (bậc ≤ 0,4 m);
    - đăng ký handle vào `stairColliders`, gỡ khi unload.
  - **Bậc kè sông:** theo quyết định 10, có `water.json` `stairs`.
  - **Metro:** theo quyết định 11.
  - **Giao lộ:** theo quyết định 9, bỏ ponytail trong `findJunctions`.
  - **Build lại chunk:** tất định, chạy 2 lần cùng hash. Chunk ≤ 250 KB (cảnh báo sẵn có).
- **Test:**
  - `StairBuilder`: số bậc, bậc ≤ 0,4 m, bậc đầu / cuối khớp độ cao hai đầu, collider phủ hết chiều dài;
  - KCC (Rapier thật) đi lên / xuống 1 đợt bậc 3 m;
  - người bơi đi lên bậc kè ra khỏi nước (`moveMode` về `walk`);
  - fixture giao lộ nằm đúng trên ranh chunk có đủ nhánh ở chunk sở hữu;
  - `allChunks.test` vẫn qua.
- **Preset:**
  - `p4-steps`: bậc Trocadéro / jardins du Trocadéro;
  - `p4-quay-stairs`: bậc kè gần cầu Alexandre III, nhìn từ mặt nước;
  - `p4-swim-exit`: bơi vào bậc kè với `autoMove=walk`, đã lên khỏi nước;
  - `p4-metro`: lối Guimard có bậc đi xuống;
  - `p4-border-junction`: 1 giao lộ trên ranh chunk nay có biển + khoảng trống đèn (D chọn tọa độ).

## 8. Screenshot preset

- URL mới (B): `?bike` (bắt đầu trên xe dev đầu tiên, tại spawn / `?player=`), `autoTurn=left|right`. `autoMove=walk` = đạp tới.
- Tên preset xem mục 7. `npm run screenshot -- p4` chạy cả nhóm.
- Mỗi track tối đa 4 vòng chụp → sửa. Người tích hợp chụp lại tất cả `p4-*` và `p3-*`.

## 9. Ghép và kiểm tra

- Thứ tự gợi ý: **C → D → A → B**:
  - C: dữ liệu, không đụng client runtime;
  - D: build lại chunk;
  - A: `BikeModel` thay stub;
  - B: ghép tất cả vào `Player` / `main`.
- Xung đột dự kiến:
  - `config.ts`: mỗi khối riêng;
  - `scripts/screenshot.ts`: mỗi track một dòng chú thích riêng;
  - `package.json`: C thêm 1 script;
  - `TODO.md` / README: chỉ người tích hợp sửa.
- Người tích hợp:
  - `npm run build && npm test`;
  - `npm run screenshot -- p4 p3`;
  - cập nhật `TODO.md` (xóa mục Phase 4 đã xong, thêm mục còn lại) và README (phím `F`, `R`, xe đạp);
  - commit `feat(phase4): …`.
- **Ngân sách:**
  - xe ≤ 2 lệnh vẽ (+ lấp lánh 1);
  - `roadgraph.json` ≤ 6 MB thô;
  - bước xe ≤ 0,1 ms;
  - chunk sau khi thêm bậc: tăng < 10 % tam giác ở preset `street`.

## 10. Để sang phase sau

- **Phase 4B:** NPC dùng `RoadGraph` (`car` / `oneway` / `lanes` / `junctions` / `signals` / `crossings`); tông xe NPC → crash như §6.3.
- **Phase 5:**
  - GPS / minimap (`shortestPath` walk);
  - respawn bậc kè gần nhất (`water.json` `stairs`);
  - HUD "Không đi xe trên bậc thang", "Chậm một bước!";
  - icon luật phương tiện.
- **Phase 6:**
  - `BikeState` từ server: claim nguyên tử, xe chung, bãi xe, bỏ xe, `transport.mandatory = "walk"` chặn lên xe;
  - người chơi khác đạp xe (ghost), `R` qua mạng;
  - hành lang `corridorEdges` ở Host.
- **Phase 7:** `F` ưu tiên hộp mật thư; `bicycle_parking` gần điểm → vị trí bãi xe.
- **Phase 12:** âm thanh thật, giá để xe model.
