# Leg 2 – review mã nguồn (spec / code), HEAD 40db8e2

Reviewer đọc-chỉ (Fable), 2026-10-06. Phạm vi: `git diff bbd03d9..HEAD` (dữ liệu thế giới, biển từ coastline, xe chạy bên trái, làm mờ DEM,
kiểu nhà Macao, đêm tối thiểu + đầy đủ, 30 địa danh m1–m4 / mf1–mf2, test chuyển sang Macao). `npx tsc --noEmit -p client` sạch.
Bằng chứng: probe tự viết trong scratchpad (dựng cả 323 chunk bằng `buildChunk` / `buildLandmarks`, lấy mẫu mọi đường OSM mỗi 2 m và
thử xem có collider địa danh (không phải `stairs`) chắn ở độ cao 0,4–2 m trên mặt đất), `scripts/coast.ts` chạy trên hình vuông thử,
`npm run leg:check -- worker/legs/macao-demo.json`, grep. Không server nào được bật.

Tổng: 0 BLOCKER · 3 HIGH · 8 MEDIUM · 9 LOW.

## HIGH

### H1. Chữ "Paris" đập vào mắt người chơi và Host ở mọi cuộc đua
- `client/src/ui/Login.ts:75` `<h2>Cuộc đua Paris</h2>` – màn đăng nhập của MỌI đội.
- `client/src/host/main.ts:56` và `:141` `'Cuộc đua Paris – Host'` – tiêu đề trang Host.
- `worker/legs/macao-demo.json:3` `"title": "Chặng Demo – Paris"`, `:94` "…bờ bên kia sông Seine", `:181` "…cây cầu mạ vàng lộng lẫy nhất
  Paris"; L1 nói về "đại lộ đẹp nhất thế giới … 12 đại lộ tỏa ra" nhưng điểm đến là Ruínas de São Paulo. Đây là `DEFAULT_LEG_ID`
  (`worker/src/race/leg.ts:19`): một phòng đua mới nạp chặng này cho tới khi Host "Nạp chặng từ file" → buổi diễn tập đầu đội đọc mật thư Paris
  tại điểm Macao. Bản `test/macao-demo.filled.json` cũng vậy (tiêu đề + "tháp Eiffel").
- `README.md:1`, `docs/DEPLOY.md:1` (+ `:105` "thấy Paris + nhân vật ở Bir-Hakeim").
- Vi phạm quy tắc UI tiếng Việt đúng nội dung (CLAUDE.md). Sửa: đổi chuỗi (3 dòng mã), viết lại 3 lời dẫn demo cho đúng điểm Macao, đổi tiêu đề 2 tài liệu.

### H2. Santo Agostinho: collider thân nhà thờ đè lên phố và quảng trường công cộng
- `client/src/world/landmarks/m2.ts:788–830` `church()` dựng thân / bệ bằng `facing(rings[0], c.az)` → khung chữ nhật bao quanh đường viền
  (`f.a × f.b`), không phải đa giác OSM. Với đường viền 15 điểm xiên của Santo Agostinho, khối lăng trụ 38 tam giác (y 12,1…17,2) tràn ra ngoài.
- Probe: 11 mẫu của `residential Calçada do Tronco Velho` tại (−97, 106) (mặt đất 14,7) và 5 mẫu của `residential Largo de Santo Agostinho`
  tại (−118, 165) (mặt đất 13,4) bị chắn bởi khối 2,5–3,8 m. Lộ trình GPS (A* trên roadgraph) đi qua đúng phố này; Largo de Santo Agostinho là
  "quảng trường trước nhà" mà kế hoạch (§5.2) định đặt hòm mật thư. Xe NPC chạy xuyên khối (chỉ hình ảnh) nhưng người chơi bị chặn, phải vòng.
- Sửa nhỏ: trong `church()` cắt bệ / thân theo đa giác `rings[0]` (`s.prism(rings, …)`) hoặc thu `f.a`, `f.b` về `rangeIn` của đa giác; thêm
  test "không collider địa danh trên mẫu đường OSM" (mẫu probe ở trên, chạy được trong `allChunks.test.ts` với `buildLandmarks`).

### H3. Fortaleza do Monte: lăng trụ sân thượng chôn toàn bộ lối đi trong pháo đài, tường chắn lối vào phía đông
- `m2.ts:430–480` `monte()`: `s.prism([inner], min(foot), yT)` lấp đặc toàn bộ bên trong tường từ chân đồi (15,2) lên sân thượng (29,0);
  `ringWall(… collide: true)` quanh cả vòng, chỉ một khe `gap` ở cạnh quay về `gateAz` 60° (đông bắc).
- Probe: **420 mẫu** footway OSM bên trong pháo đài (vd. (249, −417), mặt đất 18,1) nằm TRONG lăng trụ; các footway vào pháo đài ở (314, −399)
  và (315, −402) (phía đông, la bàn 88–96°) bị tường chắn (collider y 15,2…29,0 và khối bảo tàng y 20,8…33,2). Đường viền chính (25 điểm)
  không có đường OSM nào cắt → lối duy nhất là bậc ở khe NE do m2 tự dựng.
- Kịch bản: đội theo GPS lên đồi từ phía đông (Calçada do Monte) đụng tường cao 10 m, không có chỉ dẫn; "Kẹt? Về chỗ an toàn" / điểm xuất phát
  hoặc hòm đặt trong vòng thành sẽ nằm trong khối đặc (KCC đẩy lên nóc hoặc kẹt). Kế hoạch §5.2 muốn đặt L4 ở Monte → organiser dễ gặp.
- Sửa nhỏ: mở thêm khe ở cạnh gần footway đi vào (edge chứa (314, −399), hướng ≈ 90°) với bậc như khe NE; hoặc bỏ `collide` của đoạn tường
  cắt footway. Sân thượng: giữ lăng trụ nhưng chỉ từ `yT − 1` (một tấm dày) thay vì từ chân đồi, để người đứng ở footway dưới không bị chôn.

## MEDIUM

### M1. São Lourenço: bệ nhà thờ chắn footway + bậc OSM dẫn lên nhà thờ
- Cùng `church()` (`m2.ts:788–830`), collider 62 tam giác y 7,3…10,8 tại (−269, 350) (mặt đất 7,6): 6 mẫu footway + 1 bậc OSM
  (`chunk -2_1`) bị khối 3,2 m chắn. Đội lên bậc thật đụng tường. Sửa như H2.

### M2. Ruínas de São Paulo: nền đá đè lên Largo da Companhia de Jesus, L1 demo đứng trên nền
- `mf1.ts:209–220` `platform()`: `k.prism([[-hw, -back, hw, -back, hw, ST.top, -hw, ST.top]], yb, 0)` = hộp 25 × 61,65 m, từ 1 m dưới địa hình
  tới mặt nền (+9 m). Probe `0_-2`: 7 mẫu footway `Largo da Companhia de Jesus` tại (150, −417) và 3 điểm bậc OSM (142, −435) nằm trong khối
  y 2,6…14,9; 51 mẫu footway tại (175, −440) bị tường phế tích 1,1 m (`ruinWalls`, y 6,3…7,9) cắt ngang lối đi trong sân Học viện.
- Điểm L1 của `macao-demo.json` (151, −446) nằm TRÊN nền (mặt đất 4,9, nóc nền 14,9): hòm được tia đặt lên nóc; server xét vùng chỉ theo
  XZ (`worker/src/race/steps.ts:170 inside(q.zone, x, z, slack)`) nên đội đứng dưới chân tường 10 m vẫn "trong vùng" mà không bấm F được;
  `scripts/leg-check.ts:40` xếp `ruins` vào `OPEN_KINDS` nên không cảnh báo (báo cáo mf1 §1.3 cũng đã yêu cầu dời L1).
- Sửa: dời L1 demo ra chân bậc (local z ≈ 10–20 m, như báo cáo mf1); cho bậc OSM / footway qua nền: thay lăng trụ đặc bằng vỏ (nóc + 4 mặt bên,
  tức bỏ `yb` lên `−1`), hoặc chừa lối ở các điểm đường OSM cắt; tường phế tích để hở đúng chỗ footway (mẫu (175, −440)).

### M3. Fisherman's Wharf (Colosseum) và A-Ma: khối đặc chắn đường đi bộ
- `m3.ts` Colosseum: collider lăng trụ ellipse 304 tam giác, y −14,1…8,4 (22 m) tại chunk `7_0`: 16 mẫu footway tại (1746, 28) bị chắn –
  đấu trường thật là hành lang hở, đi xuyên được.
- `m2.ts` `temploAma`: collider 152 tam giác y −18,3…−13,0 tại chunk `-4_3`: 3 mẫu `pedestrian Rua de S. Tiago da Barra` (−858, 832) và 4 mẫu
  footway vào chùa (−852, 811, mặt đất −14,5) bị tường/terrace 1,5–5 m chắn, ngay cạnh điểm XUẤT PHÁT của mọi chặng (−869, 784).
- Sửa: Colosseum = vành (annulus) thay vì ellipse đặc; A-Ma chừa khe ở cổng đúng vị trí footway OSM (−852, 811) và không dựng terrace ra ngoài
  đường viền chùa (mẫu (−858, 832) nằm trên phố).

### M4. Bậc cầu lớn chỉ được "ghi nhận", không sửa: người chơi có thể rơi
- `client/src/world/bridgeAudit.test.ts:155–157` `KNOWN_MACAO` cho qua 5 cầu: Ponte de Sai Van (bậc ±17,7 m nơi tầng trên / dưới chạm nhau),
  Ponte da Amizade (bậc 3–6 m), Ma Man Kei / Rotunda da Amizade (0,5–12 m), 昌盛大桥 (đứt ở mép bản đồ). `client/src/npc/roads.test.ts:173–178`
  `KNOWN_STEPS` cho qua bậc 9,25 m / 0,57 m của xe NPC.
- Sai Van nằm sát Macau Tower (địa danh mf2, có thể là điểm chặng); đội đạp xe lên cầu đụng bậc 17,7 m → rơi xuống biển / mắc kẹt. Nguyên nhân nằm
  trong `BridgeBuilder` / `npc/roads.ts buildDecks` (mỗi way cầu khác tên = đường mặt cầu riêng). Cần ít nhất một dòng trong `TODO.md` + ghi cho
  organiser (docs/LEG_FORMAT.md): không đặt điểm trên 5 cầu này; hoặc thêm `Bounds`-wall chặn lối lên cầu Sai Van / Amizade.

### M5. `allChunks.test.ts` nới ngân sách tam giác cho 56 / 323 chunk, không phải 7
- `client/src/world/allChunks.test.ts:20–21, 39`: `chunk.bridges.length >= 4` → trần 120 000. Đếm dữ liệu: **56 chunk** có ≥ 4 mảnh cầu
  (`2_-7 5_0 -3_5 … 7_-7`, kể cả chunk nội đô như `1_1`, `2_1`, `3_-4`). Lý do nêu (7 chunk cầu biển 62–111k) đúng, nhưng điều kiện chọn quá rộng:
  một chunk phố thường có 4 cầu vượt nhỏ cũng được gấp đôi ngân sách mà không ai thấy.
- Sửa: điều kiện theo tổng chiều dài cầu trong chunk (vd. ≥ 400 m) hoặc danh sách 7 key cố định với ghi chú.

### M6. `scripts/leg-check.ts` nói với organiser bằng dữ kiện Paris
- `:426` `Quận ${dis}` (freguesia số 1…5 thành "Quận 5"); `:460` "nằm giữa sông" cho đa giác BIỂN; `:463` cảnh báo cầu qua đất nhắc "cầu Bir-Hakeim
  trên đảo Île aux Cygnes"; `:565` ví dụ `paris-1.json`; `scripts/sim.ts:354, :776` ví dụ `paris-1.json`. Đầu ra `leg:check` mẫu (demo) in
  "Quận 5", "Quận 2". Sửa: dùng `districtLabel()` của `geo/districts.ts`, "nằm giữa biển / mặt nước", bỏ câu Bir-Hakeim, đổi ví dụ.

### M7. Louvre room vẫn là thử thách "Paris" trong schema + bundle Macao
- `shared/src/leg` vẫn nhận `kind: 'louvre'`; `client/src/race/LouvreRoom.ts`, `client/public/art/art-NN.*` (≈ 8 MB) và `credits.json` dòng
  "Phòng Louvre" vẫn được đóng gói; test leg `worker/legs/test/louvre.json` / `full.json` giữ "Lộ trình Louvre". CLAUDE.md ghi là giữ tạm, nhưng
  nếu organiser nạp chặng Macao có `kind: 'louvre'` thì đội vào phòng tranh Louvre giữa Macao. Không phải lỗi mã; cần ghi rõ trong
  `docs/LEG_FORMAT.md` "không dùng ở Leg 2" hoặc tắt trong `check.ts` cho Leg 2 (1 rule), để không âm thầm bỏ yêu cầu.

### M8. Bảng "Ghi nguồn" (sau khi về đích) kể tài sản Paris không còn trong game
- `client/public/credits.json`: Tháp Eiffel (Scott Marshall), Khải Hoàn Môn (HoangHiepVu), Ngọn lửa Tự do (emm), hai áp phích Morris
  Folies-Bergère / Offenbach, "Phòng Louvre". `eiffel.glb` / `arc.glb` / `lm-flamme.glb` đã xóa (`scripts/assets/flamme.ts` bỏ) → ghi nguồn sai sự
  thật, người chơi thấy. Sửa: chạy lại `process-assets` không có mục Paris (hoặc xóa 3–4 dòng); cột Morris / áp phích vẫn dùng thì giữ.

## LOW

- L1 `scripts/coast.ts:101–102`: mảnh coastline kết thúc trong khung chỉ `console.warn` rồi bỏ → cả biển có thể biến mất mà `build-chunks` vẫn exit 0
  (probe: `seaPolygons([[0,50,60,50]], rect)` → `[]`). Nên `throw` (có cờ `--allow-cut`). Winding đã đúng (outer +, holes − theo
  `chunkData.ringArea`, xác minh bằng probe và water.json hiện tại).
- L2 `scripts/ground-dem.ts:76–83`: `blur(demF)` trộn cả đáy biển (−15 m) vào đất ven bờ có nhà → đất bờ bị kéo xuống rồi kẹp ở `FLOOR_DM` 1,5 m;
  đồi có nhà (Monte / Guia / Penha) cũng bị làm phẳng (m2 phải bù bằng `terraceRise`). Đã có `ponytail:`; đề xuất: loại ô biển khỏi blur
  (`v <= FLOOR_DM` → không góp vào trung bình).
- L3 `client/src/geo/districts.ts:31` HUD hiện "Freguesia Sé" – tiếng Bồ trong HUD tiếng Việt ("Giáo xứ Sé"?); báo cáo test ghi gốc (0, 0)
  Largo do Senado trả về 5 (São Lourenço) dù thật là Sé – kiểm tra đa giác OSM / thứ tự `districtAt`.
- L4 `client/src/config.ts:1332` `defaultRace: 'paris'`, `worker/src/index.ts:17` `DEFAULT_RACE = 'paris'`: phòng mặc định khi thiếu `?race=` tên
  "paris" trên bản Macao (tên DO / export CSV). Đổi `'macao'`.
- L5 Đêm, HDR cố định lúc tạo vật liệu (`glow.ts nightHdr`, `StreetProps.ts:743 hdr()`): `FpsWatch` tắt post giữa trận → đèn đường / cột hòm /
  đèn xe thành trắng cháy (MeshBasic `toneMapped:false`, màu > 1). Đã ghi ở báo cáo N-A; chưa có TODO.
- L6 Đêm trên `quality=low`: `Water.ts:233–246` vẫn vẽ bản đồ đèn canvas 1024² (4 MB) + tra texture; `night.ts facadeNightGlsl` vẫn chạy
  (≈ 20 ALU). Chấp nhận được, nhưng chưa đo trên GPU yếu thật (chỉ SwiftShader).
- L7 `client/src/world/StreetProps.ts:194–207` biển tên phố: dòng freguesia 11 px cố định ("Nossa Senhora de Fátima" ≈ 130 px) — còn trong
  `cellW` 256 nên không tràn; chỉ ghi để biết.
- L8 `scripts/build-chunks.ts:55–56` `districtNo` so khớp `name:pt` nguyên văn với `PARISHES`: OSM đổi dấu / tên → freguesia rơi khỏi HUD âm thầm.
  Thêm `console.warn` khi gặp `admin_level=6` không khớp.
- L9 Chuỗi Paris vô hại trong chú thích / tên biến (`Seine`, `Bir-Hakeim`, `Concorde` trong `main.ts`, `Terrain.ts`, `RemotePlayers.ts`,
  `BridgeBuilder.ts`, `config.ts` `sidewalkByName` / `widthByName` với tên phố Paris không khớp gì ở Macao, `screenshot.ts` preset `etoile /
  champs / street / seine / p3-* / p4-*` trỏ tọa độ Paris ngoài khung → chụp ra biển/đất trống). Không ảnh hưởng người chơi; dọn dần.

## Đã kiểm và thấy ổn
- Xe chạy bên trái: `npc/roads.ts:131–135` đảo dấu `laneOffset`; `traffic.ts:463` quy tắc rẽ ngang (XOR với `driveLeft`) đúng cả hai chiều;
  `lights.ts:123` cột đèn sang lề bên trái; vòng xuyến đi theo chiều oneway của OSM (test Praça do Lago Sai Van thuận chiều kim đồng hồ);
  đèn pha xe theo +Z của mẫu, không phụ thuộc bên chạy.
- `scripts/coast.ts`: nối chuỗi, vòng kín trong khung = đảo (lỗ), vòng cắt khung bắt đầu từ điểm ngoài khung để không vòng qua mối nối, đi theo
  biên theo chiều kim đồng hồ; winding đầu ra đúng hợp đồng `ringArea` (xem L1 về mảnh cụt).
- Địa danh: dựng 323 chunk → 0 lỗi builder, **0** cảnh báo "details failed, generic instead" (bắt `console.warn`); không `Math.random` / `Date`
  trong builder worker (xác định); `allChunks` kiểm NaN / index; `curtain` chỉ do m4 phát và luôn `MeshBuffer('curtain', true)` → không vỡ
  `mergeBuckets`; bucket `lod: 'near'` chỉ chi tiết nhỏ (súng, lan can, cột). Cổng mặt trăng Lou Lim Ioc trùng lối footway OSM (la bàn 234° so với
  `gateAz` 225°). Tam giác mỗi chunk địa danh ≤ 19,6k (1_1).
- Đêm: mọi bổ sung đều qua `isNight()`; ban ngày vật liệu đêm `visible:false` (0 draw call), shader mặt tiền trả `null`, bầu trời / HDRI đi nhánh
  cũ; `?time=` chỉ offline (`net/session.ts:29 isOnline`), trong cuộc đua thật luôn `config.timeOfDay`; không đèn thật mới; `attribute float lit`
  / `textureLod` an toàn (three WebGL2 thêm `#define attribute in`, GLSL 300 es); không cấp phát mỗi khung trong `NpcRenderer.carLamps` (dùng
  `r4` / `w4`), `ClueBoxes.update` chỉ `setScalar`; hòm mật thư / thảm Pit Stop sáng hơn chứ không bị che; hòm đã mở mờ 0,3.
- Quy tắc dự án: đáp án không ra client (engine / protocol không đổi; `hostView.ts:636` chỉ là dữ liệu demo `?demo=1`); không phím Ctrl/Alt mới;
  không đổi tần số WS / SQLite (quota nguyên); không secret trong git (`worker/.dev.vars.example` thôi); thông số đêm nằm trong `config.ts lighting`.
- Test: không còn `it.skip` / `describe.skip` (g1–g5 đã xóa); chỉ `describe.skipIf` theo dữ liệu. `roads.test.ts` đọc dấu từ `traffic.driveLeft`
  (không nới); `parts.test.ts` bỏ nhánh `generic` vì mọi id đều có DetailFn (hợp lý, `generic` vẫn test riêng). Các chặng bundled parse được;
  `leg:check macao-demo.json`: 0 cảnh báo, 17 ô trống (đúng kỳ vọng §17.9).
