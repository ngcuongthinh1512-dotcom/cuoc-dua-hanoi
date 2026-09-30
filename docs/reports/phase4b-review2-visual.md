# Phase 4B – Reviewer 2 (hình ảnh / độ chân thực)

Trạng thái: **xong** (2026-10-01).

## Cách làm

- Mã chụp: `main @ 04c2050`. Chụp trong một bản sao riêng (`git archive` → scratchpad, `node_modules` clone APFS), để không ghi đè `screenshots/` mà phiên khác đang dùng cùng lúc. Ảnh gốc Phase 4 để so sánh: `git archive bcbb452` (commit `fix(phase4)` cuối cùng trước 4B), chụp cùng cách.
- Lệnh: `SCREENSHOT_PORT=5212 npx tsx scripts/screenshot.ts <preset…>`. Góc tự chọn chạy qua một bản sao `scripts/shots.ts` chỉ có trong scratchpad (preset `x-*`, `y-*`).
- Đã mở từng PNG và phóng to các vùng NPC. Cần đo thì dùng vitest tạm trên sim thật (`TrafficLights`, `Traffic`, `NpcRoads` + `roadgraph.json` + lưới đã carve) và probe Playwright đọc `window.__GAME__.npcs()`. Tất cả chỉ nằm trong scratchpad.
- Ảnh nằm ở `/private/tmp/claude-501/-Users-nguyencuongthinh-Documents-cuoc-dua-paris/4c4ac352-238f-4042-a18b-10acb599c10c/scratchpad/`:
  - `head/screenshots/` (HEAD);
  - `p4base/screenshots/` (Phase 4);
  - `diffs2/` (ảnh khác biệt p3 / p4).
- Máy đang bận vì phiên khác chạy `ride-check` song song (load ≈ 15–20). Vài preset in-game quá 30 s mới có `__READY__` nên phải chụp lại khi máy rảnh hơn. Kết luận bên dưới dựa trên lần chụp có READY.
- Không sửa file nguồn, không commit. File này là file duy nhất tạo trong repo.

## BLOCKER

### B1. Cột đèn giao thông đứng giữa lòng đường, bóng đèn quay về phía ngược với xe đang tới

- **Ảnh:**
  - `p4-cobbles`: đạp xe từ Concorde lên Champs-Élysées. Một cột đèn đỏ cắm giữa lòng đường, ngay bên trái người đạp; bóng đỏ quay về phía người chơi, tức là đèn của chiều ngược lại. Có thêm 3 cột nữa rải trên mặt đá lát.
  - Khung mặc định lúc vào game: `p3-idle`, `p3-far`, `p3-first`, `p3-debug`, `p3-slow`.
  - `street`: cột đứng trên tim Champs-Élysées.
  - `x-champs-high`: 2 cột trên tim đại lộ.
  - `x-opera-high`: 3 cột đứng trên mặt nhựa quanh Place de l'Opéra.
  - `p4b-crossing`: cột cắm ngay đầu vạch người đi bộ Rue Royale.
  - `y-sig-a`: camera đặt trên kè phải, 14 m trước vạch dừng của nhánh Champs-Élysées vào nút (−349, −167). Cột của chính nhánh đó đứng giữa đường và chỉ thấy lưng hộp đèn. Các bóng vàng / xanh nhìn thấy là của chiều khác.
- **Đo:** vitest tạm, dùng `TrafficLights` thật và đúng công thức của `NpcRenderer.setLights`. Cả 16/16 đầu đèn quanh Concorde–Champs, Opéra, Rue Royale đều có chân cột **cách tim cạnh 0,0 m**. Trong khi đó điểm `SignalHead` do B trả về đã nằm ở mép phải (cách tim `nửa bề rộng + 0,5` m).
- **Nguyên nhân:** hai track hiểu hợp đồng `SignalHead` khác nhau.
  - B (`client/src/npc/lights.ts`, hàm `add()`):
    - `(x, z)` = vạch dừng **đã dời sang kè phải**;
    - `yaw = atan2(ux, uz)`, chú thích là "faces the oncoming car".
  - D (`client/src/npc/NpcRenderer.ts` `setLights` / `lightColours`, và chú thích `npcRender.lights` trong `config.ts`):
    - coi `(x, z)` là **tim đường** và `yaw` là **hướng xe tới**;
    - dời thêm `nửa bề rộng + kerb` sang "phải" = `(cos yaw, −sin yaw)`. Với yaw của B, hướng đó là bên TRÁI xe, nên hai lần dời triệt tiêu và cột về đúng tim đường;
    - hộp đèn quay về `+Z` cục bộ, bóng đèn đặt ở `(sin yaw, cos yaw) × 0,25`, tức phía xe đã đi qua. Vì vậy bóng đèn quay lưng lại hàng xe đang chờ.
  - Test không bắt được lỗi này:
    - `NpcRenderer.test` tự dựng `SignalHead` theo cách hiểu của D;
    - `traffic.test` chỉ đếm số đầu đèn.
- **Gợi ý sửa:** chọn một cách hiểu và ghi rõ vào chú thích `SignalHead` trong `types.ts`.
  - Cách 1: D lấy thẳng `(h.x, h.z)` làm chân cột (bỏ bước dời ngang), và quay hộp đèn về phía xe tới, tức `(−sin yaw, −cos yaw)` theo yaw của B.
  - Cách 2: B trả đúng như chú thích `npcRender.lights` (điểm trên tim đường + hướng xe tới).
  - Thêm test dùng `TrafficLights` thật: chân cột cách tim ≥ nửa bề rộng, bóng đèn nằm về phía xe tới.
- **Hệ quả phụ:** cột không có collider (ponytail), nên người chơi và xe NPC đi xuyên qua cột đứng giữa đường.

## MAJOR

### M1. `p4b-etoile`: vòng xuyến Étoile không có xe

- **Ảnh:**
  - `p4b-etoile` (mật độ 1,5, `__STATS__` báo 60 xe): mặt vòng trống hoàn toàn; chỉ thấy 3 xe ở đại lộ phía dưới và 1 xe buýt khuất sau cây.
  - `x-etoile-top` (camera thẳng đứng 300 m, mật độ 1): cả vòng dài 433 m chỉ có 4 xe, đều sát đảo giữa.
- **Mô phỏng** tại đúng neo của preset, 2 phút sau warm-up: trên vòng chỉ có 1–5 / 60 xe; xe đứng yên dồn ở các cửa vào vòng (quanh (−1820, −940), (−1840, −980), (−1900, −760)).
- **Nghi nguyên nhân** (`client/src/npc/traffic.ts`):
  - `refreshNear` cân trọng số sinh xe theo `max(0, dài − 12)`, còn `spawn` đặt `s = 6 + rng × (L − 12)`. 35 cạnh của vòng dài trung bình ≈ 12,4 m nên trọng số ≈ 0, tức **không bao giờ sinh xe trên vòng**. Xe chỉ vào vòng qua định tuyến.
  - Xe vào vòng phải chờ khoảng trống `roundaboutGap` 18 m ở cả 12 cửa, nên vào chậm và ùn ở cửa.
- **Gợi ý:**
  - sinh xe theo chuỗi cạnh ngắn, hoặc cho phép `s` trên cạnh ngắn hơn 12 m;
  - cộng thêm hệ số cho cạnh `roundabout`;
  - cân nhắc giảm `roundaboutGap`.

### M2. `p4b-bridge`: không thấy xe nào trên cầu Alexandre III

- Camera đặt 8 m trên mặt sông, chúc −3°, cách cầu 95 m. Trong ảnh mặt cầu chỉ là một vạch mảnh ở đường chân trời; thành cầu che hết xe.
- Góc riêng `x-bridge-high` (`/?cam=-500,26,215,74,-25`) cho thấy 2 xe và người đi bộ nằm đúng trên mặt cầu, không chìm xuống sông. Vậy độ cao mặt cầu của B là đúng; lỗi nằm ở toạ độ preset.
- **Gợi ý:** đổi preset `p4b-bridge` lên ≈ 25 m trên mặt sông, chúc −20…−25°.

### M3. `p4b-red`: không có hàng xe chờ đèn đỏ

- **Ảnh:**
  - chiếc xe gần nhất (xanh đậm) chạy ngược chiều về phía camera và bị cắt ở mép trái;
  - xa hơn là một xe tay ga;
  - cột đèn đứng giữa đường (B1);
  - không có hàng xe nào dừng trước vạch.
- **Mô phỏng** đúng neo, tại t = 20 s (lúc READY):
  - 4 đầu đèn của nút (−349, −167) đang **vàng / xanh**;
  - chỉ có 4 xe trong vòng 120 m, xe nào cũng đang chạy 11–13 m/s;
  - chiều đi lên Étoile (hướng camera nhìn) không có xe nào.
- **Gợi ý:**
  - chọn nhánh / thời điểm để pha của nhánh là đỏ lúc hết warm-up (pha tất định: lệch `hash01(nút) × 46 s`);
  - hoặc đặt camera ở một nút ít làn, nhiều xe;
  - xem thêm M7 về mật độ đại lộ.

### M4. Người đi đường không đổi màu áo / quần

- SPEC §17.11 và phase4b.md §11.3 yêu cầu "đổi màu áo / quần để bớt trùng".
- `client/src/npc/PedRenderer.ts` chỉ `cloneSkinned` 4 avatar, không đổi màu gì. `grep` không thấy code đổi màu nào, ngoài phần sơn xe trong `npcPreview.ts`.
- **Ảnh:** đám đông lặp lại đúng 4 bộ đồ, trong đó 2/4 là vest đen (`p4b-peds`):
  - người đàn ông vest đen có mặt ở `p4b-bike-car`, `p4b-dodge`, `p4-stairs-block`, `y-float-a`, `y-bike16`;
  - người phụ nữ vest đen ở `p4-border-junction`, `y-float-a`;
  - người phụ nữ áo hồng quần jean ở `p3-idle`, `p3-slow`, `p4-mount`, `x-marais`.
- Avatar được chọn đều (`rng × 4`), nên một nửa đám đông trung tâm Paris mặc vest đen.
- **Gợi ý:**
  - làm như `outfitShader` của người chơi: màu theo `PedPose.id`, nhân vào vùng áo / quần của atlas (mask theo ô UV body);
  - hoặc ít nhất đổi `color` material theo id, vì mỗi clone có thể có material riêng;
  - cân nhắc thêm trọng số avatar vào `crowd` (ít vest hơn).

### M5. Camera người chơi chui vào trong xe NPC dừng ngay sau lưng

- **Ảnh:**
  - `p4b-zone` (camera `far`): xe tải NPC dừng ngay sau người chơi (người chơi đứng giữa làn nên xe phanh là đúng luật). Camera nằm **trong** thân xe tải, nên 1/3 bên phải khung là mảng đen nội thất xe. Probe: tâm xe tải (86,8; −178,7), camera (85,6; −179,5), tức cách tâm 1,4 m, lọt trong hộp 2,3 × 6,5 m.
  - `y-float-a`: cùng chỗ đó, camera `near`, góc phải dưới vẫn bị thân xe tải che.
- **Nguyên nhân:**
  - cast của `ThirdPersonCamera` dùng `IGNORE_NPC` (phase4b §8, cố ý để camera không giật) nhưng không có gì thay thế;
  - xe dừng cách thân người chơi `minGap` 2 m, đúng chỗ camera sau lưng;
  - xe NPC không vượt (ponytail), nên có thể đứng sau người chơi rất lâu.
- **Gợi ý (rẻ):**
  - mỗi khung ẩn hoặc làm mờ instance xe có OBB chứa camera / cắt near plane;
  - hoặc cho cast camera va collider NPC nhưng làm mượt lúc co / giãn.

### M6. Người đi đường (và xe) lơ lửng hoặc chìm tới ≈ 0,5–0,9 m trên phố dốc

- **Đo:** probe trong game, so `y` của NPC với mặt đi được dưới chân (`controller.surface`, bằng đúng địa hình vì mặt collider = địa hình). Vỉa hè vẽ ở địa hình + 0,20 m, lòng đường ở + 0,05–0,07 m.
  - Rue Royale: người `y − địa hình` = +0,51 / +0,59 / +0,86 / −0,15 / −0,33 m, tức lơ lửng tới ≈ 0,66 m trên mặt vỉa hè hoặc lún ≈ 0,5 m.
  - Opéra: người +0,14 … +0,40 m.
  - Xe: −0,14 … +0,32 m.
  - Tuileries (đường (c) phẳng) và mặt cầu: ≈ 0.
- **Ảnh** `y-float-a`: người vest đen trên vỉa hè bên phải (≈ 16 m) có bóng tách rời bên dưới chân, lơ lửng thấy rõ.
- **Nguyên nhân:**
  - `crowd.ts` `place()` và `traffic.ts` `place()` lấy `NpcRoads.heightOn(e, s)`, tức địa hình tại **điểm trên tim đường** (s chiếu lên cạnh, bị kẹp trong [0, L]);
  - trong khi `RoadBuilder` vẽ mặt đường / vỉa hè theo địa hình **tại từng đỉnh**;
  - người đi đường cách tim 8–15 m, xe lệch làn tới vài mét, nên dốc ngang và chỗ góc phố làm lệch độ cao.
- **Gợi ý:**
  - ngoài cầu, lấy `heightAt(x, z)` tại vị trí thật: người + `lift + curbHeight` trên dải (a); xe tính pitch theo `heightAt` ở trục trước / sau;
  - trên cạnh cầu, lấy `max(heightAt, deck)` như hiện nay.

### M7. Mật độ xe quá thưa ở các đại lộ / quảng trường chính (không khí Paris)

- **Ảnh:**
  - `p4b-concorde` (24 xe trong 250 m): trên các làn đá lát quanh quảng trường chỉ thấy 1 xe buýt + 1 xe con;
  - `x-concorde-low`: 2 xe;
  - `x-champs-high`: 1 xe trên cả đoạn Champs-Élysées nhìn thấy;
  - `p4b-street`, `x-royale-eye`, `y-bike16`: Rue Royale trống, chỉ một xe đỏ ở tít đầu Madeleine;
  - `street`: 1 xe;
  - `p4b-etoile`: xem M1.
- Mô phỏng `p4b-red`: chỉ 4 xe trong 120 m trên Champs-Élysées.
- **Nguyên nhân:** `spawn` chia đều xe theo **chiều dài** mọi cạnh car (residential = primary). Đại lộ 2 × 4 làn nhận số xe/km bằng một phố 1 làn, nên đại lộ trông vắng. 10 xe/km ≈ 1 xe / 100 m cho cả 8 làn.
- **Gợi ý:**
  - trọng số sinh xe theo số làn (xe / làn·km) hoặc theo `traffic.rank`;
  - có thể tăng `max`: xe là instanced, 60 → 90 xe chỉ tốn thêm ≈ 60k tam giác, không thêm lệnh vẽ; `autoDensity` đã có để hạ khi FPS thấp.

### M8. Preset không cho thấy chủ thể (ngoài M1–M3)

- `p4b-dodge` (`wait=6`, mật độ 1):
  - lúc READY không có người đi bộ nào trong 4 m quanh người chơi, không ai lảo đảo (probe: người gần nhất cách 3,9 m, `stagger = −1`);
  - gợi ý: đặt người thử bằng tham số `npcTest` kiểu `ped@x,z,yaw`, hoặc chọn toạ độ / thời điểm có người đi ngược chiều trên vỉa hè.
- `p4b-crossing`:
  - không có ai trên vạch, không có xe chờ; thêm 2 s vẫn trống (probe: người gần nhất cách vạch > 25 m);
  - chỉ thấy vạch và cột đèn cắm trên vạch (B1).
- `p4b-park`:
  - chỉ thấy một ghế xanh trống giữa khung;
  - người ngồi duy nhất bị thân cây che ở mép trái;
  - không thấy người đi dạo / đứng / gọi điện, dù `x-tuileries-walk` cho thấy khu này có người đi và người ngồi;
  - gợi ý: camera cao 5–8 m chúc −15°, nhìn dọc lối có ghế.
- `p4b-sidewalk` (không có `&npcDensity=1`):
  - mật độ tự động tụt vì FPS headless chỉ 4–10, nên số người là 12 → 10 → 6 qua ba lần chạy; ảnh gần như không có người "hai bên";
  - gợi ý: thêm `&npcDensity=1` như các preset D.

## MINOR

- **m1. Mật độ tự động làm ảnh p3 / p4 không tất định.**
  - Preset p3-* / p4-* (và p4b-sidewalk, p4b khán giả) không có `npcDensity`, nên `autoDensity` hạ mật độ theo FPS của máy chụp. Dòng F3 cho thấy 0,26 ở `p4-cobbles`, 0,33 `p4-crash`, 0,41 `p4-stairs-block`, 0,51 `p4-ride-turn`, 0,80 `p3-debug`.
  - Hai lần chụp cùng preset ra số NPC khác nhau.
  - Gợi ý: tắt `autoDensity` khi URL có `wait` (chế độ chụp), hoặc thêm `&npcDensity=1` vào các preset.
- **m2. `__STATS__` của preset khán giả thường báo 0 xe / 0 người.**
  - Gặp ở `p4b-red`, `p4b-crossing`, `p4b-park`, `etoile`, `champs`, `street`, `seine`, `p4-steps`, `p4-quay-stairs`, trong khi sim có 20–60 xe.
  - Nguyên nhân (`client/src/main.ts`, hàm `render`): `__STATS__` được ghi trước, rồi ngay trong khung đó mới gọi `npcs.start()` và bật `__READY__` (khán giả không có `wait`). Khung READY vì vậy chưa có lần `npcs.update()` nào.
  - Ảnh vẫn có NPC, vì probe cho thấy khung chụp sau READY đã vẽ. Chỉ số liệu là sai.
  - Gợi ý: chỉ bật READY sau ≥ 1–2 khung đã chạy `npcs.update`.
- **m3. Xe thỉnh thoảng chồng lên nhau.**
  - Vitest tạm: xét 801 khung mỗi điểm, cặp xe chồng > 0,3 m (hộp thu 0,9) xuất hiện ở 17–37 khung; lúc READY `p4b-etoile` có city + van chồng 1,4 m tại (−1599, −757).
  - Mô phỏng 10 phút của phiên khác ở Étoile: 51 cặp, sâu tới 2,4 m.
  - Hiếm, nhưng nhìn thấy khi xảy ra.
- **m4. `p4b-zone`: vòng vẽ đúng, không có người đi bộ nào trong vòng, nhưng có 2 xe (moto + xe tải) đứng trong vòng.**
  - Lý do: đó là đường xuyên duy nhất và người chơi đứng giữa làn.
  - Đúng thiết kế (vùng cấm chỉ chặn sinh xe và việc chọn cạnh khi còn đường khác) nhưng ảnh dễ gây hiểu nhầm.
  - Gợi ý: đặt vùng thử lên vỉa hè / quảng trường, như hộp mật thư Phase 7.
- **m5. `p4b-peds-idle` chụp ở t = 0.**
  - Ngồi hiện đúng, nhưng "gọi điện" và "vẫy" lúc đó vẫn là dáng đứng thẳng.
  - `x-peds-t` (t = 4) cho thấy gọi điện đúng; `y-wave` (t = 1,2) cho thấy cả 4 avatar vẫy đúng.
  - Gợi ý: thêm `&t=1.5`.
- **m6. `p4b-bike-car` (`wait=3`) chụp lúc bắt đầu ngã (quỳ cạnh xe đạp đổ).**
  - Với `wait=5`, người chơi nằm cạnh xe van đúng như mô tả.
  - Gợi ý: `wait=4.5`.
- **m7. Khi máy bận, preset in-game p4b dễ vượt timeout READY 30 s.**
  - Lần 1: `p4b-sidewalk`, `p4b-street`, `p4b-bike-car`, `p4b-dodge`, `p4b-density` quá hạn. Lần 2: `p4b-sidewalk`, `p4b-dodge`.
  - Ảnh chụp trước READY (ví dụ `p4b-bike-car` lần 1 vẫn còn đang đạp) sai hoàn toàn so với ảnh đúng.
  - Ảnh gốc Phase 4 cũng quá hạn khi chạy trong cùng mức tải, nên không phải lỗi mới; nhưng NPC làm mỗi khung nặng thêm.
  - Gợi ý: `TIMEOUT_MS` 60–90 s cho các preset p4b in-game.
- **m8. `topdown`: `page.screenshot` quá 30 s** (5 151 lệnh vẽ, 12,9 M tam giác trong SwiftShader). Lỗi đã có từ trước: ảnh gốc Phase 4 cũng lỗi y hệt. `npcDrawMs` ở đây 2,24 ms, vượt mốc 1,5 ms của §9, nhưng đây không phải góc nhìn khi chơi.
- **Ghi chú:**
  - `CarPose.braking` chưa được vẽ (không có đèn phanh); plan không yêu cầu.
  - Ghế công viên đúng màu xanh, dáng hơi giống ghế ăn (lưng đặc); chấp nhận được ở mức ponytail.

## Những gì đạt

- **Model xe** (`p4b-cars`):
  - đủ 10 loại, mũi +Z, bánh chạm đất;
  - sơn đa dạng; taxi đen có đèn TAXI;
  - xe buýt 12 m chỉ chạy primary / secondary;
  - xe máy / xe tay ga có người lái, đội mũ bảo hiểm.
- **Người đi đường** (`p4b-peds`, `x-peds-t`, `y-wave`):
  - texture và alpha tóc đúng;
  - 4 avatar có tỉ lệ hợp lý (nam cao hơn nữ);
  - clip đi / đứng / gọi điện / ngồi / vẫy đúng;
  - LOD1 ở hàng sau không lộ.
- **Chiều xe chạy:**
  - xe đi đúng chiều và giữ làn phải (`p4b-zone`: moto chiều về Concorde ở làn trái của khung, xe tải chiều lên Madeleine ở làn phải);
  - probe Rue Royale / cầu: mọi xe đi thẳng có yaw trùng hướng cạnh, chỉ lệch khi đang vào cua Bézier.
- **Cầu:** xe và người trên mặt cầu Alexandre III đúng độ cao (`x-bridge-high`; probe cho y xe trên cầu cao hơn mặt sông 9,8 m).
- **Người đi bộ ở đúng chỗ:**
  - trên vỉa hè / lối đi, không ở giữa đường khi không băng qua;
  - không nằm trong tường hay trong xe (`p4b-bike-car`, `p4b-dodge`, `x-rivoli`, `x-tuileries-walk`, `x-marais`, `x-opera-high`);
  - ngoại lệ: độ cao, xem M6.
- **Ghế:** có người ngồi trên ghế ở Tuileries (`x-tuileries-walk`, `p4b-park` mép trái).
- **Không che chủ thể:** không preset p3 / p4 nào bị NPC che chủ thể, nên **không cần thêm `&npc=0`**. Ngoại lệ là cột đèn B1 đứng cạnh người đạp ở `p4-cobbles`; sửa B1 là hết.
- **Ngân sách** (lần chụp có READY):
  - `p4b-density`: 370 lệnh vẽ / 890 909 tam giác; cùng URL với `npc=0` là 325 / 687 385. Tức NPC thêm **+45 lệnh vẽ, +203k tam giác**, trong giới hạn §9 (≤ 55, ≤ 350k).
  - `p4b-street`: +34 lệnh vẽ, +160k tam giác so với `npc=0`.
  - `npcMs` 0,02–0,46 ms/bước; `npcDrawMs` 0,13–1,15 ms/khung (cao nhất `p3-narrow`, 39 người). Số đo trên SwiftShader.

## So với Phase 4 (không regress)

Diff pixel HEAD vs `bcbb452`, bỏ vùng hộp trợ giúp:

- **Không đổi:**
  - `p4-bike-*` (5 turntable) 0,00 %;
  - `p3-turntable`, `p3-swim`, `p4-quay-stairs`, `p4-metro` 0,00 %;
  - `p4-steps` 0,04 %, `p4-graph` 0,01 %, `p3-climb` 0,01 %.
  - `p3-climb` vốn có camera nằm trong tường kè (tối) giống hệt Phase 4, không phải lỗi mới.
- **Thay đổi nhỏ do thêm NPC / cột đèn / dòng F3:**
  - các p3 khác < 1 % (`p3-jog` 4,8 %, `p3-debug` 5,2 % gồm dòng NPC trên F3);
  - `p4-ride` 2,9 %, `p4-ride-side` 1,2 %, `p4-crash` 3,3 %, `p4-swim-exit` 2,8 %.
- **Thay đổi lớn hơn do lệch vị trí camera lúc READY** (bản đồ khác biệt đỏ ở mọi cạnh công trình, người + xe đạp không đổi):
  - `p4-ride-rear` 9 %, `p4-stairs-block` 5,6 %, `p4-ride-lean` 4,4 %, `p4-ride-turn` 5 %;
  - `p4-cobbles` 15 %: cùng toạ độ camera, khác biệt chính là cột đèn B1 + NPC.
- Nhân vật, xe đạp (IK, nghiêng, ngã), bậc thang, bơi, trèo kè: **không thấy regress**.

## Bảng preset

| Preset | Kết quả | Ghi chú |
|---|---|---|
| p4b-cars | OK | |
| p4b-peds | OK | M4 (4 bộ đồ, 2 vest đen) |
| p4b-peds-idle | cần sửa nhẹ | m5 (`t=0`) |
| p4b-etoile | **cần sửa** | M1 |
| p4b-red | **cần sửa** | M3, B1, M7 |
| p4b-bridge | **cần sửa** | M2 |
| p4b-concorde | OK (thưa) | M7 |
| p4b-sidewalk | **cần sửa** | M8 (`npcDensity`), M6 |
| p4b-crossing | **cần sửa** | M8, B1 |
| p4b-park | **cần sửa** | M8 |
| p4b-street | OK (thưa) | dòng NPC trên F3 đúng; M7 |
| p4b-bike-car | OK | m6 (`wait`) |
| p4b-dodge | **cần sửa** | M8 |
| p4b-zone | OK (ghi chú) | m4, M5 |
| p4b-density | OK | ngân sách đạt |
| p3-idle / p3-far / p3-first / p3-debug / p3-slow / p3-jog | **cần sửa** | B1 thấy ngay ở khung vào game; nhân vật không regress |
| p3-face / p3-wave / p3-openbox / p3-celebrate / p3-crash | OK | NPC chỉ ở nền |
| p3-wall / p3-swim / p3-swimfwd / p3-street / p3-narrow / p3-eiffel / p3-bridge / p3-turntable | OK | |
| p3-climb | OK (như cũ) | camera trong tường kè, giống Phase 4 |
| p4-bike-model / rider / crank / lean / crash | OK | 0,00 % so với Phase 4 |
| p4-cobbles | **cần sửa** | B1 (cột đèn đỏ giữa đường cạnh người đạp) |
| p4-ride / p4-ride-side / p4-ride-lean / p4-ride-turn / p4-ride-rear | OK (B1 ở nền) | |
| p4-mount / p4-crash / p4-stairs-block / p4-steps / p4-quay-stairs / p4-swim-exit / p4-metro / p4-border-junction / p4-graph | OK | |
| topdown | lỗi chụp (đã có từ trước) | m8 |
| etoile / champs | OK | NPC quá nhỏ để thấy từ 600 / 1 100 m |
| street | OK (B1, thưa) | |
| seine | OK | |

## Góc tự chọn đã chụp

| Ảnh | Nội dung |
|---|---|
| `x-etoile-top` | vòng Étoile từ 300 m |
| `x-etoile-low` | Étoile nhìn thấp |
| `x-concorde-low` | Concorde nhìn thấp |
| `x-champs-high` | Champs-Élysées từ trên cao |
| `x-opera-high` | Place de l'Opéra từ trên cao |
| `x-royale-eye` | Rue Royale, tầm mắt |
| `x-red-high` | nút có đèn trên Champs-Élysées, nhìn cao |
| `x-crossing-top` | vạch người đi bộ nhìn từ trên |
| `x-bridge-high` | cầu Alexandre III từ trên cao |
| `x-park-high` | Tuileries từ trên cao |
| `x-tuileries-walk` | Tuileries, người chơi đứng giữa |
| `x-rivoli` | Tuileries dọc Rue de Rivoli |
| `x-marais` | phố hẹp Marais |
| `x-bike-car5` | tông xe van, `wait=5` |
| `x-peds-t` | turntable người đi đường, t = 4 |
| `y-sig-a/b/c` | đèn tín hiệu nhìn từ phía xe tới |
| `y-float-a/b` | người lơ lửng trên Rue Royale |
| `y-cross-0/2s` | vạch người đi bộ lúc READY và sau 2 s |
| `y-steps-0/2s` | bậc thang Trocadéro lúc READY và sau 2 s |
| `y-bike16` | đạp xe 16 s lên Rue Royale |
| `y-wave` | turntable, clip vẫy |
| `y-sit-side` | turntable, clip ngồi nhìn ngang |
| `y-density-nonpc` | Opéra với `npc=0` (so ngân sách) |
| `y-street-dbg` | Rue Royale, bảng F3 |
