# Việc còn để lại

Những phần tạm (placeholder) hoặc hoãn sang phase sau. Làm xong thì xóa dòng tương ứng.

## Phase 2 – Bản đồ (phần còn lại)
- Đã soát ảnh mọi preset sau đợt sửa review (12 đại lộ ở Étoile, Champs-Élysées thẳng tới Concorde, đường cong sông Seine, cầu Iéna một mặt cầu, Louvre). Preset `eiffel` chưa thấy Trocadéro vì sương (cách ~1,4 km, sương hết ở ~1 km khi bay cao 250 m); preset `street` không thấy Khải Hoàn Môn (cách ~900 m, sau sương 700 m).
- Nhà: mặt đất DEM AWS gồ lên 13–17 m dưới Louvre (thực tế ≈ +1 m so với Concorde). Nhà đo chiều cao từ mặt đất thấp nhất, nhưng không thấp hơn điểm cao nhất của chân nhà quá `buildings.groundSpan` (3 m), nên Louvre vẫn thấp (khoảng 7 m) nhìn từ Cour Carrée. DEM giữ nguồn AWS (người dùng đã chốt).
- Nhà: thuyền, nhà thuyền, nhà hàng nổi (22 nhà có tâm nằm trong lòng sông) bị bỏ ở `build-chunks` (`dropped.buildingOnRiver`). Phase 12: mô hình sà lan / nhà thuyền nổi trên mặt nước.
- Nhà: 4 trụ đầu cầu Alexandre III (building=yes nhỏ) đang dựng thành nhà Haussmann tí hon có cửa hàng + mái mansard; thay bằng model ở Phase 11.
- Nhà: tường chung (party wall) chỉ nhận ra giữa các nhà trong cùng một chunk và khi chung đúng cạnh; nhà sát ranh chunk vẫn có mặt tiền + mái mansard ở phía đó (ponytail trong `BuildingBuilder.ts`). Nâng cấp: `build-chunks` đánh dấu cạnh chung trên toàn bản đồ.
- Nhà: một vài dải tường đá trơn trên mái trông như lơ lửng (thấy ở Champs-Élysées từ mặt đường), có lẽ là phần tường chung cao hơn nhà bên cạnh; chưa rõ nguyên nhân.
- Nhà: bỏ qua tag `colour` / `roof:colour` / `roof:shape` (mọi nhà Haussmann đều mái mansard, nhà khác mái bằng) và `building:part`.
- Nhà: 2 chunk (`9_7`, `9_8`) mỗi chunk bỏ 1 nhà hỏng hình học (console.warn).
- Đường: khi cắt vỉa hè ở giao lộ chỉ thấy đường trong cùng chunk; đường đi vào từ chunk bên cạnh không cắt vỉa hè, nên bó vỉa có thể lấn vào lòng đường ở mép chunk (ponytail trong `RoadBuilder.ts`). Nâng cấp: đưa bề rộng đường giao nhau vào dữ liệu chunk.
- Đường: nhịp vạch đứt đoạn bắt đầu lại ở mỗi mảnh chunk, có thể lệch nhịp ở ranh giới chunk. Nâng cấp: tính nhịp theo toạ độ thế giới.
- Đường: chưa có vạch dừng, vạch người đi bộ, bó vỉa hạ ở lối xe vào; đầu đường cụt vỉa hè chỉ cắt vuông. Làn xe đạp nằm ở mức mặt đường nên có thể bị vỉa hè nổi che, chưa có màu/ký hiệu riêng.
- Đường: vài ô vạch trắng lạc trong đảo giữa Étoile và trên nền giữa các đại lộ (có lẽ mảnh đường hai chiều rất ngắn); chưa điều tra.
- Đường hầm (`tunnel=*`, `layer<0`) bị bỏ, chưa dựng.
- Cầu: collider = mọi tam giác hiển thị của cầu (ponytail trong `BridgeBuilder.ts`); dùng hộp giản lược nếu Rapier dựng chậm.
- Cầu: cầu vượt đường (không qua sông) nằm sát mặt đất vì độ cao nội suy giữa hai đầu; chưa có trụ cầu, dầm vòm (Alexandre III) và cột sắt (Bir-Hakeim).
- Cầu: cầu cạn metro số 6 là một chuỗi dài 2,4 km trong chunk `-8_7` (46k tam giác, chunk nặng nhất) và chỉ hiện khi chunk đó được tải: tầng trên (metro) của cầu Bir-Hakeim (SPEC §4.5) không thấy từ bờ Passy hay mặt nước cạnh cầu (chunk cách > 800 m); phần ngoài vùng đã tải hiện thành vệt tối trên trời (preset `eiffel`). Nâng cấp: tách chuỗi cầu theo chunk, giữ độ cao nội suy của cả chuỗi (kế hoạch hiện chốt "không tách chuỗi cầu").
- Cầu: các mặt cầu song song cùng tầng (đường tách làn, cách tâm ≤ `roads.bridge.mergeGap`) được nối thành một mặt, chỉ có lan can ở mép ngoài; chỉ xét cầu trong cùng chunk (ponytail trong `BridgeBuilder.ts`). Vỉa hè vẽ riêng trên cầu (`footway=sidewalk`, 76 way) vẫn bị bỏ như mọi vỉa hè; cầu Iéna vì vậy chỉ rộng ~19 m (thực tế ~35 m).
- Cầu: mặt dưới cầu và mái kính (building=roof) gần như đen vì ánh sáng bán cầu phía dưới tối (`render.hemiLight.ground`); chỉnh cùng ánh sáng Phase 12 (SPEC §14).
- Sông Seine: kè thấp (berges, Voie Georges-Pompidou) bị nâng lên ngang mặt phố bởi dải kè 8 m; muốn có đường dạo sát mặt nước thì khoét thêm từ `WaterData.quays` (ponytail trong `Terrain.carveRiver`). Đường nằm trong dải đá kè 12 m cạnh nước bị tấm kè che. Quyết định "khoét kè từ hình học OSM" mới làm một phần: `build-chunks` đã ghi 161 đường kè (`barrier=retaining_wall`, `man_made=embankment|quay`) vào `water.json` nhưng chưa có code nào đọc; `carveRiver` chỉ dùng đa giác nước + dải cố định. Làm cùng phần kè thấp.
- Sông Seine: vài chỗ dốc đất sau tấm đá kè vẫn lộ răng cưa nhỏ khi nhìn từ trên cao (tăng `terrain.copingWidth` hoặc lưới mịn hơn); đảo hẹp (Île aux Cygnes ~11 m) bị hạ xuống lòng sông rồi phủ tấm kè, chưa có cây/lối đi riêng.
- Mặt nước chưa có phản chiếu phẳng (chỉ env trời + normal map cuộn); thêm Reflector / Water.js nếu trông phẳng và FPS cho phép.
- Màu mặt đất (cỏ/sỏi/vỉa hè) chỉ theo lưới đỉnh 5 m nên mép bãi cỏ bị mờ; dùng splat texture theo chunk nếu cần sắc nét.
- Biển tên đường: mỗi chunk một atlas riêng (512 px ngang); nâng cấp lên atlas LRU toàn cục nếu VRAM vượt 60 MB.
- Cột đèn: đường một chiều tách làn có thể có cột đèn ở dải phân cách; chưa kiểm tra cột đèn đè lên nhà/cây. Cây công viên chỉ lấy từ điểm `tree` của OSM, chưa rải thêm.
- Streaming: chỉ 1 worker dựng chunk (tối đa 2 chunk cùng lúc); dùng pool nhiều worker nếu lần tải đầu chậm.
- Streaming: ngân sách "≤ 49 chunk" là cho bán kính tải 800 m; khi di chuyển có thể giữ tới ~60 chunk vì chỉ bỏ chunk ở 1000 m (`chunks.unloadRadius`, tránh tải lại liên tục ở mép). Khi bay cao, bán kính tải theo sương (`fog.far` + `chunks.fogMargin`) nên tải nhiều chunk hơn (79 ở preset `eiffel`).
- Collider Rapier chỉ tạo cho chunk trong 150 m (`chunks.colliderRadius`), mỗi khung hình một chunk; một chunk dày vẫn mất ~5 ms (Apple Silicon, có thể ~10 ms trên laptop Windows) trong khung hình đó. Đo trên máy thật (F3); nếu giật thì dùng hộp giản lược thay trimesh.
- Chưa trích từ OSM dù `fetch-osm` đã tải: `amenity=bicycle_parking` (chỗ ưu tiên đặt xe, SPEC §6 → Phase 4/7), `amenity=fountain` (hạt nước, SPEC §14 → Phase 12), ranh giới quận `admin_level=9` (tên quận trên biển/HUD → Phase 5), `tourism` / `historic` / `place` (bản đồ Host → Phase 10).
- STYLE_GUIDE chưa có: đèn giao thông ở giao lộ, nắp cống, dải cỏ ven đường (Phase 12).
- Đường một chiều tách làn: vỉa hè phía nửa đường cùng tên bị bỏ nếu hai nửa quá gần; chỉ xét trong cùng chunk, đo ở giữa mảnh đường (ponytail trong `RoadBuilder.ts`).
- Ngoài bbox chỉ có dải chunk sát biên, đứng gần biên nhìn ra ngoài sẽ thấy mép thế giới (cảnh báo + tường vẫn chặn); có thể thêm địa hình/sương xa hơn hoặc khối nhà giản lược ngoài biên. Rõ nhất ở Panthéon (chỉ cách biên nam ~130 m): preset `lm-pantheon` thấy đồng đất trống phía nam. Mây vẽ tĩnh trong texture bầu trời.
- Photorealistic 3D Tiles: hoãn (cần API key, ghi công, không được cache).

## Phase 2B – Địa danh chính xác (SPEC §17.6) – phần còn lại
- Ngọn lửa Mộ Chiến sĩ Vô danh (Khải Hoàn Môn): cần vật liệu phát sáng / hoạt ảnh (Phase 5); hiện chỉ có phiến đá và hoa hồng đồng.
- Thang máy tháp Eiffel lên tầng 2 (SPEC §4.5) chưa dựng (gameplay + hình, phase sau). Collider sàn tầng 1 (kế hoạch §1 #1 "collider 4 chân + sàn") hoãn cùng thang máy: hiện chỉ có collider 4 chân tới 57,63 m, chưa ai lên được sàn.
- Mô hình Eiffel chất lượng 3/5 (khung SketchUp, 57k tam giác): thô khi nhìn gần dưới tháp; mô hình tốt hơn cần duyệt riêng. Chưa nén texture KTX2 (máy chưa có `toktx`), Khải Hoàn Môn dùng WebP.
- Cột Vendôme: phù điêu xoắn dựng bằng hình học, chưa có normal map (cần thêm vật liệu có normal map trong `landmarks/index.ts`).
- Palais-Royal: các dãy hành lang quanh vườn (Valois, Montpensier, Beaujolais) là nhà OSM thường, không có tên trong OSM để thêm vào danh sách địa danh; collider một khối chặn lối Galerie d'Orléans từ Cour d'honneur sang vườn (tách collider nếu chặng đua cần lối này).
- Pont Neuf: các vòm đều nhau (thực tế khác nhau); tượng trên trụ cầu Bir-Hakeim, tượng Zouave / Henri IV / Renommée hiện là khối thô.
- Cầu Bir-Hakeim: sàn metro tầng trên nằm trên sàn đường + `railLayerStep`; đoạn dốc lên đồi Passy khá gắt (theo địa hình DEM).
- Grand Palais: dựng 2 cỗ xe tứ mã (đúng thực tế, kế hoạch ghi 4).
- Crazy Horse Paris: kích thước mặt tiền (mái hiên, biển hiệu, cửa) ước lượng theo ảnh, chưa có số công bố. Tòa nhà dựng riêng bằng `buildBuildings` nên tường chung với nhà bên cạnh vẫn có mặt tiền + mái mansard lùi 1,2 m (khe nhỏ nhìn từ trên cao); nâng cấp: truyền các nhà hàng xóm trong chunk vào. Vị trí lấy từ node OSM 1292046637 (48.86596, 2.30172), cách tọa độ gần đúng 48.8667, 2.3014 khoảng 80 m về phía nam.
- Chiều cao ước lượng (không có số công bố, ghi `est.` / ponytail trong code): mái từng cánh Louvre, Petit Palais (vòm 34 m), Hôtel Biron (19 m), gờ mái Hôtel des Invalides, cánh Chaillot, chuông Tòa thị chính (50 m), sân thượng + tượng tháp Saint-Jacques, hướng tháp Montparnasse (115°), dáng đồi Montmartre; mái vòm École Militaire dùng 22 m của OSM (có vẻ thấp).
- Các nhóm g5 phụ thuộc giá trị OSM hiện tại (Notre-Dame 69 / 96 m, Sainte-Chapelle 75 / 30 m, chóp Conciergerie 30 m): nếu `build-chunks` đổi, DetailFn rơi về dựng chung và `g5.test.ts` báo lỗi.
- `parts.ts` vẽ đầu hồi của part mái kính bằng vật liệu tường (g4 tự xử lý bằng màu kính nhạt).
- Khối xám hình lều trên kè trước Conciergerie / cạnh cầu Pont Neuf là gai địa hình, không phải part OSM (không có part `min_height` nào trong 40 m): DEM AWS là mô hình bề mặt, mái Palais de Justice / Place Dauphine / Samaritaine bị kéo ra sát dải kè (ở x = 1600: 1,5 → 7,4 → 10,3 m trong 30 m). Giới hạn độ dốc từ kè đã thử nhưng làm bẹt cả đồi thật (Passy, Trocadéro) nên bỏ. Đã san dải Quai de l'Horloge (pad trong `PADS`); các kè khác (Quai du Louvre cạnh Samaritaine, Quai des Orfèvres…) còn gò. Nâng cấp: dựng lại mặt đất từ độ cao DEM lấy mẫu trên tim đường (thung lũng giữa các khối nhà) hoặc thêm pad.
- Khối nâu lơ lửng gần tháp Saint-Jacques (≈ 1990, 45, 900): không có nhà / part / mái (`building=roof`) nào có `min_height` quanh đó trong dữ liệu chunk, và ảnh chụp từ (1880, 55, 1010) nhìn về đó không thấy khối nào; nguyên nhân chưa rõ, chưa tái hiện được.
- Mặt bằng quảng trường (`PADS` trong `geo/landmarks.ts`, `Terrain.flattenPads`): mới san 3 chỗ vẽ tay – Cour Napoléon (theo trung vị ≈ 13 m, vì Louvre xung quanh đứng trên DEM gồ), parvis Notre-Dame cùng nhà thờ (≈ +1 m, ngang kè) và dải Quai de l'Horloge. Place du Carrousel, Concorde (gốc obelisk là y = 0, chỉ dốc ~2 m) và các quảng trường khác vẫn theo DEM; mép pad dốc lại về DEM trong 25 m (`terrain.padBlend`), nên Rue de Rivoli / nhà quanh Hôtel-Dieu có chân tường cao hơn.
- Sương che địa danh cao ở các góc nhìn chính (sương 250–700 m, `render.fog`): từ parvis Trocadéro (đích L2, cách tháp ~630 m) tháp Eiffel gần như trắng; vòm Invalides cuối esplanade bị mờ; bay 250 m trên Louvre nhìn về tây không thấy Eiffel trong khi La Défense (8 km, bóng chân trời) vẫn thấy. Chưa sửa: `camera.far` và bán kính tải chunk đều theo sương, giảm sương riêng cho vật liệu địa danh sẽ làm tháp bị cắt ở mặt phẳng xa / hiện đột ngột khi chunk tải. Nâng cấp (Phase 12): vẽ Eiffel, vòm Invalides, Notre-Dame, Panthéon thành bóng chân trời (như `createSkyline`, sương riêng) khi chunk của chúng bị sương che hoặc chưa tải, và giảm sương cho chính mô hình khi ở gần.
- Ghi nguồn: các model xe / người / xe đạp đã tải nhưng chưa xử lý, chưa dùng (Phase 3 / 4B); khi xử lý thì thêm tên file vào `MODIFIED` trong `scripts/process-assets.ts` để dòng ghi nguồn có "(đã chỉnh sửa)", rồi chạy lại `npm run process-assets`.

## Phase 3 – Nhân vật & camera (phần còn lại)
Đã xong: nhân vật UBC + clip UAL, áo màu đội, bảng tên, controller Rapier, bơi, camera góc thứ ba (`docs/plans/phase3.md`).
- Lên bờ sông Seine: leo tường kè ở mọi chỗ (`Space` khi bơi sát tường, ponytail trong `CharacterController.tryClimb`) vì bến thấp chưa khoét; khi khoét bến thấp thì chỉ cho lên ở cầu thang / dốc OSM. Xuống sông chỉ bằng cách nhảy qua lan can kè (1 m) hoặc rơi từ cầu; rơi từ trên cao xuống nước thì dừng đột ngột ở độ sâu bơi (chưa có bọt nước, chưa lặn).
- `openBox` dùng clip UAL `Interact` (một tay với ra, khá nhẹ); clip mở hộp thật cần asset mới (chưa duyệt). `wave` và `celebrate` là lớp tay dựng bằng code (+ `Dance_Loop`) vì clip Wave / Celebration của UAL nằm trong bản trả phí.
- `clipSpeed.Swim_Fwd_Loop` (1,8 m/s) là ước lượng; chỉnh nếu thấy tay chân "trượt" khi bơi.
- Bảng tên cố định ở độ cao đầu khi đứng, nên lúc ngã xe (nằm) nó vẫn lơ lửng ở trên; bảng tên của các nhân vật đứng sát nhau (< 2 m) chồng lên nhau khi nhìn từ xa (kích thước cố định trên màn hình), xếp lại ở Phase 6.
- Collider: biển tên đường (cột 4 cm) chưa có collider; lối vào metro là khối đặc 1,1 m (chưa có bậc xuống); điểm spawn nằm trong nhà rỗng không bị phát hiện (chỉ bắt được khi tường chạm capsule), hiện spawn chọn tay nên chưa sao.
- Camera: collider mỏng (đèn, cột Morris, metro) làm cần camera co lại một chút khi quét qua; GTA bỏ qua đồ mỏng. Hướng sửa: collider đồ đường phố tách khỏi trimesh của chunk, gán collision group riêng và truyền `filterGroups` trong `ThirdPersonCamera.cast`.
- Camera: chỉ giữ trên mặt nước khi `moveMode === 'swim'`; lúc đang rơi xuống sông mà ngẩng camera có thể chìm dưới nước một chút (đưa `waterLevel` vào `CameraTarget`).
- Camera ngôi thứ nhất chưa có va chạm và chưa làm mượt theo chiều dọc (bước lên bậc hơi giật). Camera sát tường: chưa làm mờ / ẩn thân khi cần < ~0,5 m như GTA.
- Gamepad: đã gán nút (`padButtons` trong `config.ts`). Tay cầm không có mapping `standard` (một số tay trên Firefox) vẫn bị bỏ qua; chưa đổi tốc độ bay bằng tay cầm.
- Ao, hồ, bồn phun nước (nước không phải sông Seine trong `water.json`): chưa có va chạm, chưa lội / bơi, nên người chơi chạy trên mặt nước. Ở bể Louvre, các khối bể của g3 (thành 0,55 m) không trùng đa giác OSM: chạy trên nước rồi kẹt vào khối giữa bể. Hướng sửa: thêm thành thấp làm collider cho đa giác không phải sông, hoặc bỏ đa giác OSM ở chỗ địa danh đã tự dựng bể (g3), hoặc căn khối bể g3 theo vòng OSM.
- Leo lên kè: dùng tư thế ngồi thụp `Jump_Land` trong lúc thân được nâng khoảng 8,5 m dọc tường trong khoảng 0,66 s, nên trông như bay lên. Cần clip leo (asset mới, chưa duyệt), hoặc nâng chậm và ngắn hơn khi đã khoét bến thấp. Preset `p3-climb` chỉ thấy tường và nhân vật; không đặt `orbit` được vì `autoMove` đi theo hướng camera.
- Nhịp chạy: `Jog_Fwd_Loop` thực ra là chạy nhanh (khoảng 6,3 m/s ở tốc độ 1×). Ở 4 m/s clip phát 0,66×: chân khớp mặt đất nhưng bước trông chậm, "bồng bềnh" (khoảng 85 bước/phút). Cần xem trực tiếp ở 60 fps rồi chọn: tăng timeScale lên khoảng 0,8–0,9× (chấp nhận chân trượt nhẹ) hoặc thu ngắn sải bước.
- Đi ⇄ chạy chọn theo tốc độ (`character.jogFrom`), chưa trộn trọng số hai clip; trong khoảng 1,74–2,44 m/s cả hai clip đều trượt chân một chút.
- Nội suy theo khung hình: vị trí và hướng thân đã nội suy; các động tác tua theo `actionTime` (openBox, crash, climbOut) vẫn đổi tư thế theo bước vật lý 60 Hz trên màn 120 / 144 Hz.
- Tạo `client/src/core/EventBus.ts` khi có module thật sự cần (Phase 3 gọi hàm trực tiếp nên chưa tạo).
- `core/Time` (SPEC §3) hiện nằm trong `GameLoop` (delta khung hình đã kẹp, FPS, alpha); tách `client/src/core/Time.ts` khi có module khác cần đồng hồ game.

## Phase 4 – Di chuyển
- `npm run build-graph` → `shared/data/roadgraph.json`.
- Xe đạp: vật lý, lên / xuống xe (`F`), clip `cycle` (UAL `Driving_Loop`) + IK chân, `moveMode 'bike'`, camera `vehicle: 'bike'` (hook `thirdPersonCamera.bike` đã có, chỉnh lại số khi có xe thật), ngã xe gọi `startAction('crash')` khi va chạm mạnh, test tốc độ xe = footSpeed × 1,3.
- Bậc thang OSM hiện chỉ là mặt đường phẳng; dựng bậc thật (và lối xuống metro).
- Giao lộ sát ranh chunk có thể bị bỏ sót khi đặt biển tên đường / cột đèn (nhánh đường nằm ở chunk bên cạnh); dùng danh sách giao lộ toàn cục của `build-graph`.

## Phase 4B – Xe cộ & người đi đường NPC (SPEC §17.5)
- Xe NPC theo `roadgraph.json` (đúng chiều, dừng ở giao lộ, vòng xuyến Étoile) + người đi đường trên vỉa hè; chỉ chạy ở client, không đồng bộ server; người chơi không lái được xe NPC.
- Va chạm: xe phanh trước người chơi, tông khi đạp xe → ngã xe (§6.3); tránh vùng hộp mật thư / thảm về đích; mật độ trong `config.ts`, tự giảm khi FPS thấp.
- Model xe / người: bộ asset CC0 (Quaternius, Kenney…) — lập danh sách để anh duyệt trước khi tải.

## Phase 5 – HUD
- Menu thật (SPEC §17.2: tự mở khi chuột bị nhả, `Esc`); hiện chỉ hiện bảng hướng dẫn phím. Nút "Kẹt? Về chỗ an toàn" gọi `CharacterController.respawn()` (hiện về chỗ đứng an toàn gần nhất; khi đang ở dưới sông, SPEC §4.4 muốn đưa lên bậc thang gần nhất); tùy chọn đảo trục Y, độ nhạy chuột.
- Biển tên đường: thêm dòng quận (vd. "8e Arrt") khi có dữ liệu quận.

## Phase 6 – Server & presence
- Thay `RaceRoom` tạm (chỉ có `SELECT 1`) bằng room thật: WebSocket, SQLite, Alarms; bỏ endpoint thử `/api/room/ping` và room cố định `"dev"`, định tuyến mỗi cuộc đua vào Durable Object riêng.
- Đăng nhập mã đội / Host, token ký HMAC bằng `HOST_PASSWORD`.
- Test Durable Object bằng `@cloudflare/vitest-pool-workers` (kiểm tra tương thích với Vitest 5 trước khi cài; hiện `worker/src/legs.test.ts` chạy trong môi trường Node vì chỉ kiểm tra dữ liệu).
- Kết hợp Vite HMR với Worker/DO khi dev. Hai hướng: Vite proxy `/api` (và WebSocket) sang `wrangler dev`, hoặc dùng `@cloudflare/vite-plugin` 1.60.2. Hiện tại `npm run dev:worker` phải build lại client mỗi lần chạy.
- `G` vẫy tay đã chạy trên máy mình (Phase 3); gửi `action` qua mạng cùng presence. `R` (bấm còi) chưa có tác dụng.
- Người chơi khác: dựng `PlayerState` từ snapshot (nội suy) rồi dùng lại `CharacterModel` + `CharacterAnimator` + bảng tên; `movement` lấy từ file chặng.
- Kiểm tra tốc độ phía server: khi trượt dọc collider góc cạnh (bể Louvre), controller Rapier có vài bước lẻ tới khoảng 4,8 m/s (footSpeed 4). Đo trên cửa sổ vài giây và cho dư khoảng 25 %, đừng kiểm từng bước.
- Bảng debug F3: thêm ping và số người chơi đang thấy (SPEC §14).
- Camera bay tự do (`V` khi mở bảng debug): trong cuộc đua thật chỉ cho Host / khán giả / đội đã về đích; hiện ai mở bảng debug cũng bật được.
- Bỏ qua các tham số URL thử nghiệm của Phase 3 (`?player=x,z,…`, `action`, `autoMove`, `jump`, `?cam=` = khán giả) khi đã vào cuộc đua (dịch chuyển tức thời = gian lận).

## Phase 7 – Race engine lõi
- Xuất phát: đặt các đội bên ngoài hàng rào obelisk, cách ≥ 8–10 m (SPEC §17.4). Geofence cho phép bán kính 15–40 m. (Phase 3 đã spawn một người chơi thử ở `playerSetup.spawn`, cách obelisk 14 m về phía Khải Hoàn Môn.)
- `F` mở hộp mật thư (`openBox`), `celebrate` ở Pit Stop; `pickUp` (`PickUp_Table`) và `talk` (`Idle_Talking_Loop`) đã có clip nhưng chưa dùng (Phase 7–8).
- Schema zod cho file chặng trong `/shared`; Worker import `worker/legs/paris-demo.json` để nạp lần đầu vào SQLite (hiện mới chỉ test import file này).
- Quyết định thời gian Host tạm dừng có bị trừ khỏi thời gian chính thức không (SPEC §13.3 nói đồng hồ dừng, công thức §13.8 không trừ), rồi cập nhật `docs/RACE_RULES.md` mục 11.

## Phase 11 – Test toàn trình
- `npm run sim` (bot mô phỏng), `worker/legs/test/paris-demo.filled.json`, `worker/legs/test/specials.json`.

## Phase 12 – Deploy
- Bundle client ~4,9 MB (gzip ~1,8 MB), phần lớn là WASM nhúng base64 của `@dimforge/rapier3d-compat` (`chunkSizeWarningLimit` trong `client/vite.config.ts`). Khi tối ưu tải trang: dùng `@dimforge/rapier3d` (file `.wasm` riêng) hoặc tách chunk vendor để cache.
- Đồ họa SPEC §14: cascaded shadow map (hiện 1 hộp bóng 160 m đi theo camera, chưa snap theo texel nên mép bóng hơi rung), mặt trời thật + ngày–đêm (hiện cố định buổi chiều), bầu trời động, bloom, SMAA, cài đặt đồ họa. SPEC không gán phase riêng; làm cùng phase này.
- LOD cho nhà (ban công, ống khói dựng ở mọi khoảng cách; cửa sổ chỉ vẽ trên texture), cây (140 tam giác/cây) và đồ phố; lượng tử hóa + Meshopt.
- Giải phóng bản sao geometry trên CPU sau khi upload lên GPU.
- Nhân vật: LOD / instancing cho nhân vật ở xa, thân nữ, texture KTX2.
- `docs/DEPLOY.md` (hướng dẫn cho người không chuyên) + `npm run deploy`.
- Đo số request / dòng ghi SQLite thực tế so với ngân sách ở SPEC §3.

## Khác
- npm 11 cảnh báo `allowScripts` cho script cài đặt của `esbuild`, `workerd`, `fsevents`. Hiện vẫn chạy được vì binary lấy từ optional dependency; nếu bản npm sau chặn hẳn thì duyệt bằng `npm install-scripts approve`.
