# CETIQLO – phòng thử thách Head-to-Head (Leg 3 Hà Nội)

Nguồn yêu cầu: chủ dự án, 2026-11-02 (bản gốc ở mục 0). Tài liệu này = yêu cầu + quyết định kiến trúc + hợp đồng giữa các phần. Mọi agent đọc hết trước khi làm; sửa hợp đồng thì ghi vào mục 9 và báo người điều phối.

## 0. Yêu cầu gốc (tóm tắt trung thành)
Phòng "CETIQLO" = cửa hàng thời trang kiểu UNIQLO nhưng thương hiệu riêng; thử thách đối kháng 2 đội (Head-to-Head) trong The Amazing Race. Hai đội ở hai máy khác nhau vào cùng một phòng, thi cùng lúc. Chạy trên trình duyệt, 3D, online.
- **Thương hiệu**: CETIQLO; logo tự thiết kế: ô vuông đỏ `#E60012`, chữ trắng đậm sans-serif 2 dòng "CETI / QLO". KHÔNG dùng logo / font / tên UNIQLO thật, không hình ảnh có bản quyền (khu UT dùng họa tiết gốc). Logo ở mặt tiền, quầy thu ngân, biển từng khu, icon túi trong HUD.
- **Cửa hàng**: ≥ 2 tầng, có cầu thang hoặc thang cuốn đi lại được; sáng, tối giản, kệ trắng, sàn gỗ sáng, biển treo trần tên khu (Việt + Anh).
  - TẦNG 1: ô xuất phát / ô chốt (sàn đỏ, chữ "CHECKOUT") cạnh cửa vào, có manocanh trưng set mẫu. Khu ÁO: thun & UT (thun trơn, in họa tiết), polo (Dry-EX, pique), sơ mi & áo kiểu (Oxford, Flannel, Linen, Rayon), nỉ & hoodie (chui đầu, khóa kéo), dệt kim & len (Merino, Cashmere, Souffle). Khu ÁO KHOÁC: chống nắng UV (Dry-EX, Pocketable Parka), Fleece, Ultra Light Down, áo dày (Padded, Seamless Down), áo khoác thời trang (Blazer, Trench, Cardigan, Denim jacket). Khu PHỤ KIỆN & ĐỜI SỐNG: túi & balo (Round Mini Shoulder Bag, tote canvas, balo), mũ & khăn (lưỡi trai, mũ len, khăn len / HEATTECH), kính râm UV, ô gấp.
  - TẦNG 2: khu QUẦN: quần dài (Smart Ankle Pants, Chinos, quần tây, cargo), Jeans (Ultra Stretch, ống rộng, ống suông), nỉ & jogger, short (thể thao, kaki, linen, georgette). Khu ĐẦM & CHÂN VÁY: đầm sơ mi / suông / maxi; chân váy xếp ly, chữ A, xòe, denim. Khu ĐỒ LÓT & MẶC NHÀ: áo ngực không gọng (3D Hold, Relax), quần lót seamless / cotton, Bratop, pyjama, đồ mặc nhà (Relaco, draping pants). Khu GIÀY, DÉP, TẤT: sneaker, giày lười, sandal, dép trong nhà, tất cổ ngắn / cao.
- **Vật phẩm**: mỗi dòng sản phẩm 2–4 biến thể màu; mỗi biến thể = một vật phẩm riêng có ID riêng. Low-poly nhận ra hình dáng. Lại gần hiện nhãn: tên + màu + "[F] Lấy". Món gần giống để cạnh nhau (cùng dáng khác màu, cùng màu khác chất liệu) cho khó. Kho KHÔNG giới hạn: cả hai đội lấy cùng một món, không giành nhau.
- **Điều khiển / hiển thị (mỗi người trên máy mình)**: góc nhìn thứ ba, toàn màn hình; WASD, chuột xoay camera, Shift chạy; F lấy đồ; F chốt khi đứng trong ô CHECKOUT; túi đồ góc phải dưới, click món trong túi để bỏ ra; thấy nhân vật đội kia (màu áo khác, tên trên đầu) nhưng KHÔNG thấy túi của họ; minimap hiện vị trí 2 người + ô CHECKOUT + thông báo khi đội kia đã chốt.
- **Luật**: bắt đầu vòng: server random 1 set 6 món, mỗi món một loại khác nhau (áo, áo khoác, quần/chân váy, giày, túi, mũ/khăn/kính); cả hai đội cùng một set. Pha ghi nhớ: manocanh mặc set đó xoay vòng tròn TRONG TOÀN BỘ thời gian chơi. Pha chọn đồ: đếm ngược 3:00 theo đồng hồ server, hiển thị lớn; còn 30 s đổi đỏ + bíp. Chốt: đứng trong ô CHECKOUT và bấm phím chốt trước khi hết giờ; server ghi thời điểm chốt chính xác đến mili-giây; đã chốt thì khóa, không di chuyển. Hết giờ chưa chốt = KHÔNG HOÀN THÀNH.
- **Tính điểm (server)**: `correct` = số món trong túi trùng ID với set mẫu; `errors = max(6, số món trong túi) − correct`; `Điểm = max(0, 100 − 17 × errors) %`. Xếp hạng: (1) hoàn thành thắng không hoàn thành; (2) cùng hoàn thành → điểm cao hơn thắng, hòa điểm → chốt sớm hơn thắng; (3) cùng không hoàn thành → vẫn tính điểm theo túi lúc hết giờ, hòa điểm → HÒA; nếu hòa thì cặp đấu bị đẩy xuống cuối cùng của ván game. Màn hình kết quả gửi cả hai máy cùng lúc: set mẫu so với túi từng đội, ✅ đúng / ❌ sai / ➕ thừa / ⬜ thiếu, điểm %, thời gian chốt, đội thắng. Đội thắng nhận mật thư + vòng tròn sáng để thoát; đội thua ở lại đấu tiếp với các đội tiếp theo.
- **Cấu hình**: `catalog` chứa toàn bộ món (ID, tên, loại, màu, khu, vị trí kệ), dễ thêm / sửa. Hằng số cấu hình ở đầu file server: thời gian vòng, thời gian ghi nhớ, số món mỗi set, mức trừ điểm, số người tối đa mỗi phòng. Viết để sau này nâng số đội > 2 không phải sửa nhiều.
- **Đồ hoạ**: dựng bằng Fable, phải NHẸ trên máy người chơi.

## 1. Quyết định kiến trúc (người điều phối chốt; mâu thuẫn nhỏ trong yêu cầu đã chọn mặc định)
1. **Không phải game riêng**: là một *phòng* của engine hiện có (như `hall` BOZAR / `garderobe`): module `client/src/cetiqlo/` theo hợp đồng `client/src/rooms/types.ts` (`mountRoom → RoomHandle`), dựng dưới hòm của bước thử thách, thân thật đi trong phòng, phố ẩn (`hideWorld`), đồ hoạ tối thiểu. Cờ chặng: bước `challenge` có `room: 'cetiqlo'` (schema + `check.ts` + protocol: `ClueCard.room`, shared `roomKindOf`), phòng "tự do" như hall (`isFreeRoom`): hòm mở = vào phòng; vòng ra CHỈ sáng khi bước xong (thắng). Điểm vào ở đời thật: hòm đặt trước Vincom Center Phạm Ngọc Thạch (landmark `vincom-pham-ngoc-thach`, ≈ x −2131, z 2881).
2. **Server tính hết** (Durable Object `RaceRoom`, SQLite trước khi ack): ghép cặp, random set, đồng hồ, nhận lệnh lấy / bỏ / chốt, chấm điểm, xếp hạng, kết quả. Client chỉ gửi ý định. Không bao giờ gửi set mẫu / túi của đội kia cho client (set mẫu CHỈ được gửi dưới dạng danh sách ID tại thời điểm `match.start` vì cả hai đội cùng thấy manocanh: được phép; túi của đối thủ thì KHÔNG).
3. **Một trận một lúc trong một phòng**: đội vào phòng → hàng chờ FIFO theo thời điểm vào (`queue`). Khi có ≥ 2 đội chờ → ghép 2 đội đầu hàng thành một trận. Đội chờ ở "sảnh" (khu cửa vào, kính ngăn với sàn bán hàng; không lấy được đồ), thấy hàng chờ + vị trí của mình trên HUD. Khi trận bắt đầu, hai đội được server đặt vào hai ô xuất phát cạnh ô CHECKOUT trong cửa hàng (dịch chuyển nội bộ phòng, không cờ teleport như `Player.moveTo`), đội khác không thấy / không nghe trận (lọc hiển thị theo `matchId`). Cầu nối: mở rộng 50 m interest radius như cũ không áp dụng trong phòng (cùng phòng = cùng nhóm).
4. **Sau trận**: thắng → bước xong (cùng cơ chế `exitReady` của hall: thẻ kế = mật thư, vòng sáng thoát). Thua → ở lại, quay lại ĐẦU hàng chờ để đấu đối thủ kế (thua không phải xếp lại sau đội mới hơn: đội thua giữ thứ tự ưu tiên cao, nhưng KHÔNG đấu lại đúng đối thủ vừa thắng mình nếu còn đội khác chờ). Hòa cả hai (cùng không hoàn thành + cùng điểm) → CẢ HAI đội xuống CUỐI hàng chờ (đúng yêu cầu "cặp đấu bị đẩy xuống cuối cùng"). Đội lẻ (số đội chờ lẻ) chờ tiếp, không có "bye" thắng tự động. Số đội tối đa / trận: hằng `TEAMS_PER_MATCH = 2` (code ghép cặp viết theo `N` đội: xếp hạng N đội, thắng = hạng 1; chỉ cần đổi hằng + UI khi nâng cấp).
5. **Phím**: yêu cầu có chỗ ghi "E" và chỗ ghi "F" cho chốt: DÙNG **F cho mọi tương tác** (lấy đồ, chốt trong ô CHECKOUT) cho đúng bộ phím của game (`F` = interact); gắn thêm `E` làm phím phụ nếu `config.ts` keyTable cho phép nhiều phím mỗi hành động.
6. **Điểm**: theo công thức `Điểm = max(0, 100 − 17 × errors)`; dòng "mỗi món đúng 16,67 %" bỏ qua (mâu thuẫn nhẹ với công thức; công thức là nguồn chính). `errors = max(6, số món trong túi) − correct`.
7. **Set mẫu**: 6 món, mỗi món một loại (`SlotKind`): `top` (Áo), `outer` (Áo khoác), `bottom` (quần HOẶC chân váy; đầm không vào set), `shoes` (giày / dép / sandal; tất KHÔNG vào set), `bag` (túi / balo), `acc` (mũ / khăn / kính). Đồ lót, mặc nhà, tất, ô, đầm chỉ là mồi gây nhiễu. Random bằng seed theo trận (lưu seed trong SQLite để tái hiện được).
8. **Hiệu năng (cứng)**: tổng cảnh phòng ≤ 150 draw call, ≤ 200 k tam giác, 0 bóng thời gian thực, ≤ 3 đèn, pixelRatio 1 (như phòng khác), texture nhỏ (atlas biển hiệu 1 tấm ≤ 1024²), mọi vật phẩm là `InstancedMesh` theo (kiểu dáng) với màu theo instance (`instanceColor`) hoặc vài vật liệu phẳng dùng chung; kệ / sàn / tường gộp geometry; không GLB tải ngoài (dựng bằng code / procedural; kiểu "low-poly nhận ra hình dáng"). Nhãn vật phẩm: 1 sprite / DOM label dùng lại, chỉ cho món gần nhất trong 3 m. Manocanh PiP bằng `setViewport/setScissor` trong cùng renderer, không renderer thứ hai.

9. **Nhân vật = nhân vật có sẵn của game** (chủ dự án chốt): người chơi vẫn là thân Rocketbox nam / nữ của đội (`Player`, `CharacterModel`, màu áo đội, tên trên đầu), đội kia hiện qua `RemotePlayers` y như ngoài phố / các phòng khác; KHÔNG dựng nhân vật mới, không đổi avatar. Điều khiển, camera ngôi thứ ba, chạy Shift, animation, `moveMode`, pose 5 Hz đều dùng lại. Túi đồ là dữ liệu / HUD, không vẽ lên người; đồ trên manocanh là cái duy nhất "mặc đồ" (không mặc đồ lên nhân vật người chơi).

## 2. Dữ liệu (`shared/src/cetiqlo/`, chủ: agent cửa hàng; server đọc)
```ts
export type SlotKind = 'top' | 'outer' | 'bottom' | 'shoes' | 'bag' | 'acc';
export type Category = SlotKind | 'dress' | 'underwear' | 'homewear' | 'socks' | 'umbrella';
export interface CatalogItem {
  id: string;               // 'top.tee-basic.white' (family.slug.colour), duy nhất, ổn định
  family: string;           // 'tee-basic' (cùng dáng)
  name: string; nameEn: string;
  category: Category; slot?: SlotKind;   // slot có mặt = có thể vào set mẫu
  colour: { name: string; hex: string };
  material?: string;        // 'Dry-EX' | 'Oxford' …
  zone: ZoneId;             // khu bán hàng
  floor: 1 | 2;
  shelf: { x: number; y: number; z: number; yaw: number };  // toạ độ CỤC BỘ phòng (m), tâm vị trí món
  shape: ShapeId;           // kiểu mesh low-poly dùng chung cho cả họ
}
export type ZoneId = 'tees' | 'polo' | 'shirts' | 'sweats' | 'knit' | 'uv' | 'fleece' | 'down' | 'padded' | 'fashion-outer' | 'bags' | 'hats-scarves' | 'sunglasses-umbrella' | 'pants' | 'jeans' | 'joggers' | 'shorts' | 'dresses' | 'skirts' | 'bras-undies' | 'homewear' | 'footwear-socks';
```
`catalog.ts` xuất `CATALOG: readonly CatalogItem[]`, `ITEM_BY_ID`, `ZONES` (tên Việt + Anh, vị trí biển treo), `items by slot`. Đủ mọi dòng ở mục 0, mỗi dòng 2–4 màu (khoảng 150–220 món). Server chỉ cần `id`, `slot`, `category`; client cần tất cả.

## 3. Cấu hình server (đầu `worker/src/race/cetiqlo/config.ts`)
`CETIQLO = { teamsPerMatch: 2, itemsPerSet: 6, memorizeMs: 0 (manocanh hiện suốt), pickMs: 180_000, warnMs: 30_000, penaltyPerError: 17, maxTeamsInRoom: 12, resultHoldMs: 12_000, graceReconnectMs: 20_000, takeRange: 3.5 (m), checkoutRadius: <theo scene> }`. Mọi số ở một chỗ, có chú thích.

## 4. Giao thức (agent server định nghĩa trong `shared/src/protocol/`, codec compact v15; đây là hình dạng bắt buộc)
Client → server: `cq.join` (vào phòng, khi thân vào vòng phòng), `cq.leave`, `cq.take {id}`, `cq.drop {id}`, `cq.checkout` (phải đứng trong ô theo pose server đã có), `cq.pose` đã có sẵn qua pose chung.
Server → client (riêng từng đội, KHÔNG lộ túi đối thủ): `cq.state {phase: 'lobby'|'match'|'result', queuePos?, queueLen?, match?: {id, opp: {slot,name}, set: string[] /* 6 ID, chỉ trong trận */, startAt, endsAt (đồng hồ server), serverNow, yourBag: string[], yourLocked: bool, oppLocked: bool, oppDone: bool}, startSpot: {x,z,yaw}}`, `cq.bag {bag}` (sau mỗi take / drop, chỉ cho chủ túi), `cq.opp {locked: bool}` (đối thủ đã chốt: không kèm lúc chốt), `cq.result {matchId, set, you: {bag, marks[], correct, errors, scorePct, lockedAtMs|null}, opp: {bag, marks[], …}, winner: 'you'|'opp'|'draw', reason}` (gửi CÙNG LÚC cả hai; chỉ trong kết quả mới lộ túi đối thủ), `cq.advance` (bước xong → engine phát thẻ kế + `exitReady`).
`marks`: mảng theo vị trí set + món thừa: `'ok' | 'wrong' | 'extra' | 'missing'`.
Ngân sách Cloudflare: không tăng gánh: tin nhắn chỉ phát sinh khi có hành động; đồng hồ do client tự đếm từ `endsAt − serverNow` (hiệu chỉnh offset), server dùng alarm để kết thúc trận đúng giờ (gộp `setAlarm` hiện có).

## 5. Máy trạng thái server (`worker/src/race/cetiqlo/match.ts`, thuần, có test)
`Room = {queue: TeamId[], matches: Match[], inLobby: Set}`; `Match = {id, teams: TeamId[], set: ItemId[], seed, startAt, endsAt, bags: Map<TeamId, ItemId[]>, locked: Map<TeamId, {atMs}>, state: 'running'|'done'}`. Hàm thuần: `pairNext(queue, lastOpponents)`, `makeSet(rng, catalog)`, `take/drop/checkout` (kiểm tra: đang chạy, chưa chốt, khoảng cách tới kệ ≤ `takeRange`, món tồn tại; túi ≤ 24 món chặn spam), `score(set, bag)`, `rank(results[])` đúng luật mục 0 (+ N đội), `settle(match)` → `{winners, losers, draw}`; thao tác hàng chờ sau trận theo mục 1.4. Mất kết nối: giữ chỗ `graceReconnectMs`, quá hạn = coi như bỏ trận (đội còn lại thắng nếu chốt được, hoặc đủ điều kiện xếp hạng thường).

## 6. Client (agent phòng): `client/src/cetiqlo/cetiqloRoom.ts` (`mountRoom`), HUD DOM (đồng hồ lớn + còn 30 s đỏ + bíp WebAudio, túi góc phải dưới có icon logo, nhãn món gần nhất "[F] Lấy", minimap 2 người + ô CHECKOUT + báo "đội kia đã chốt", PiP manocanh, màn kết quả ✅❌➕⬜, thông báo hàng chờ), mạng (`cq.*` qua `RaceClient`), khoá di chuyển khi đã chốt. Dựa vào `rooms/types.ts`, `rooms/roomState.ts`, `hall/hallRoom.ts` làm mẫu.

## 7. Cảnh cửa hàng (agent cửa hàng): `client/src/cetiqlo/storeScene.ts` `buildStore(parent, opts) → StoreHandle`
```ts
interface StoreHandle {
  group: Object3D;                        // gốc, đặt tại roomFrame
  colliders: TriMeshLike[];               // tường, kệ, bàn, thang (đi được: sàn tầng 2 + cầu thang / thang cuốn)
  floorYAt(x: number, z: number): number; // sàn đi được (tầng 1, 2, cầu thang)
  itemAnchors: Map<string, Vector3>;      // id → vị trí kệ (đúng catalog.shelf)
  setItemVisible?(id: string, v: boolean): void; // không bắt buộc
  checkout: { centre: Vector3; radius: number; halfExtents?: [number, number] }; // ô CHECKOUT sàn đỏ
  startSpots: { x: number; z: number; yaw: number }[];  // ≥ 2 ô xuất phát cạnh CHECKOUT
  lobby: { box: AABB; door: Vector3 };    // sảnh chờ (kính ngăn)
  mannequin: { dress(setIds: string[]): void; object: Object3D; viewPoseForPiP: … }; // manocanh đứng bục, xoay; trưng set; cũng dùng cho PiP
  minimapBounds: { minX; maxX; minZ; maxZ; floor1: …; floor2: … };
  dispose(): void;
}
```
Cộng `client/cetiqlo.html` + `cetiqloDev.ts` (trang dev mỏng: bay quanh cửa hàng, liệt kê món, chụp ảnh preset `cetiqlo-*` trong `scripts/screenshot.ts`).

## 8. Giao việc / chủ file
- Agent SERVER (shared protocol + worker + leg schema + Host tối thiểu + test + sim): `shared/src/protocol/*`, `shared/src/leg/*` (cờ `room: 'cetiqlo'`), `worker/src/race/cetiqlo/*`, `worker/src/RaceRoom.ts` & `engine.ts` & `steps.ts` (chỗ phòng tự do), `scripts/sim.ts` (bot CETIQLO), bước demo trong `worker/legs/hanoi-demo.json` hoặc fixture.
- Agent CỬA HÀNG (Fable, đồ hoạ): `shared/src/cetiqlo/{types,catalog}.ts`, `client/src/cetiqlo/{storeScene,items,mannequin,brand,signage}.ts`, dev page + presets ảnh. KHÔNG làm mạng / HUD.
- Agent PHÒNG (sau khi hai agent trên xong): `client/src/cetiqlo/cetiqloRoom.ts` + HUD + nối mạng + roomState / main.ts wiring.

## 9. Nhật ký thay đổi hợp đồng
(trống)
