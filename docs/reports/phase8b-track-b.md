# Phase 8B – Track B (phòng Louvre + ghép client)

Trạng thái: **xong** (2026-10-03). Nhánh `phase8b-track-B` (chưa merge). Kế hoạch `docs/plans/phase8b.md` §F, §G, §J B; hợp đồng `docs/reports/phase8b-foundation.md`; verify nền `phase8b-verify-foundation.md` mục 1, 10, 11, 13 đã áp dụng.

## Đã làm
1. **`client/src/race/LouvreRoom.ts`**
   - Hàm thuần: `wallSlots` (23 ô theo thứ tự chặng: tường cửa phải 2 → tường phải 5 → tường sau 9 → tường trái 5 → tường cửa trái 2; chừa `cornerMargin` 1,2 m ở góc và cạnh cửa), `roomFrame` (tâm, sàn, chỗ vào / ra), `toLocal` / `toWorld`, `targetAt` (nút gần nhất trong tầm và trong hướng nhìn → nút chốt → cửa), `buttonStates`, `roomPrompt`, `addColliders`, `demoLouvre` (stand-in), `preloadArt`.
   - Vị trí: sàn = `heightAt(hòm) − 30`, kẹp ≥ −35. Cửa nằm trên tường trước, ngay dưới hòm; phòng lùi về phía sau hòm. Vào: chân cách hòm 0,8 m vào trong. Ra: chân cách hòm 0,8 m phía trước hòm. Vào / ra chỉ đổi y, x,z lệch ≤ 1,6 m.
   - Dựng đồng bộ khi bấm F, hoặc trước `spawnAt` khi F5 trong phòng. Dỡ chỉ khi `leave()`. Texture cache theo trang: vào / ra nhiều lần không tải lại.
   - Hình vẽ (toàn `MeshBasicMaterial`):
     - 1 lưới gộp màu đỉnh: tường có ánh sáng nướng theo độ cao, len chân tường, phào vàng, trần, 6 đèn trần, cửa, khung tranh, đèn rọi tranh, bệ, cột nút, bệ + nút chốt.
     - Sàn gỗ (texture canvas).
     - 23 ảnh. `.webp` lấy từ `/art/`, giữ đúng tỉ lệ ảnh. Ô đánh số "Tác phẩm n" / "Tượng n" khi `image: ''` hoặc 404. `.glb` được đặt vừa `glbBox` trên bệ, vật liệu unlit.
     - Nút: 2 `InstancedMesh` (đỏ / xanh lá; nút đã chọn to hơn 1,4 lần).
     - Biển cửa: "Lối ra – bấm F", đổi thành "Đã xong – bấm F để ra".
   - Draw call: phòng thêm khoảng 28 (đo: phòng 300, ngoài phố cùng chỗ 302; phố có 2 xe dev, phòng không có).
   - Va chạm:
     - Có: sàn, 4 tường, 23 cột nút, 8 bệ tượng, bệ chốt (37 collider).
     - **Không có collider trần.** Camera bị kẹp dưới trần trong `main.ts` (vì không có trần để cast).
     - Test xác nhận: tia từ `floorY + 12` rơi xuống sàn; tia ngang chạm tường sau.
2. **`Player.ts`**
   - `onInteract` trả thêm `'quiet'`: đã xử lý nhưng không phát gesture `openBox`. Nút / chốt / cửa dùng `'quiet'` để đội khác trong phòng không đoán được nút nào vừa bấm (verify #11). Vào phòng vẫn có gesture.
   - `moveTo(x, z, yaw)`: vào / ra phòng; lần đặt chân sau đó **không** gửi `respawn` (5 lần vào / ra trong 1 phút không vượt `NET.maxRespawns`).
   - `bikesPlaced` thành public, để `?louvre=1` không đặt xe dev trong phòng.
   - **Env riêng của Player** nằm trong `main.ts`: `playerEnv = { ...env, heightAt: room.active ? floorY : grid, get waterLevel: room.active ? null : … }`. `env` dùng chung với NPC / hòm / overlay giữ nguyên (C2).
3. **`RemotePlayers`** (verify #1): `underground(p, heightAt)` = chân thấp hơn lưới địa hình quá `remote.hideDy`. Chỉ ẩn khi một bên ở dưới đất còn bên kia thì không. `update(…, under?, heightAt?)`; khán giả bay thì không lọc. Test thêm ca dốc Trocadéro.
4. **`RaceClient`**
   - `frame()` gửi `view` **một lần** ở mỗi mốc `hintAt[i] + lockEndSlackMs` (khóa theo `step@hintAt`), trừ khi thẻ đã có gợi ý đó.
   - `pick(step, art, on, now)` giãn ≥ `louvreRoom.pickGapMs` (150 ms).
   - `lock(step, now)` giãn ≥ `opMinGapMs` (mỗi lần chốt tính vào `maxRaceOps`).
5. **`main.ts`**
   - Thứ tự xử lý F:
     1. Hòm chưa mở (chỉ khi không ở trong phòng: không mở hòm từ dưới đất).
     2. Vào phòng: thẻ có `louvre`, đứng ≤ `enterReach` 3 m từ hòm.
     3. Trong phòng: nút / chốt / cửa.
     4. Xe.
   - Nút / chốt:
     - Client chặn trước "tối đa 5" (toast `pickLimit`, không gửi).
     - Chốt khi chưa chọn gì → toast "Chưa chọn tác phẩm nào".
     - Chốt khi đang bị phạt → notice `answerLocked`.
   - Prompt riêng của phòng: phần tử `rc-prompt hud-box`, mỗi frame theo `roomPrompt`.
   - Thẻ louvre tự mở khi vào phòng (`openCurrent`).
   - F5 trong phòng: `underground(welcome.pose)` và thẻ còn `louvre` → dựng phòng + `active` trước `spawnAt`. F5 sau khi đã xong → đứng trên sân.
   - `lockWrong`: toast có số phút từ thẻ (0,1 → "0,1"), kèm `reviewSound(false)`. Chốt đúng (`clueNew` khi đang trong phòng) → `reviewSound(true)`.
   - Feed: `popSound()` khi có tin của đội khác. Tin feed đi qua `RaceClient` → `RaceHud.feed` ở mọi trạng thái.
   - Ghi nguồn: `initCredits(ask)`, xem mục Lệch.
   - Ảnh được tải trước khi thẻ louvre tới.
   - Không hiện prompt "mở hòm" khi đang trong phòng.
   - `__GAME__.room` (DEV).
6. **`sfx.ts`**: `clickSound(on)`, `popSound()`.
7. **Config `louvreRoom`**:
   - Thêm: `slots.cornerMargin`, `inset`, `enterReach`, `pickGapMs`, màu `floorLine` / `post` / `door`.
   - Chỉnh: tranh 1,6 × 1,2 m; `button.fromWall` 1,6 (nút đứng trước bệ tượng); `plinth.fromWall` 0,4; nút chốt to hơn; màu trần sáng hơn.
   - Bỏ `dimSun`: vật liệu unlit nên không cần.
8. **Preset**:
   - `p8b-room`: `roomAt=view`, cách cửa 5 m nhìn vào.
   - `p8b-room-button`: đứng cạnh nút xanh, quay lệch 0,6 rad để camera thấy nút.
   - `p8b-room-lock`: cạnh nút chốt.
   - Cả 3 preset không lỗi console. Đã chụp 4 vòng; các chỗ đã sửa: tranh nhỏ, xe dev trong phòng, nút bị thân che, trần tối / thiếu phào.

## Test (gói client, tất cả qua)
- `LouvreRoom.test.ts` (10):
  - `wallSlots`: 23 ô đúng thứ tự, cách nhau ≥ 2,6 m, nút cách nhau > 1 m, không ô nào ở cửa, nút đúng `fromWall`, bệ không che nút.
  - `roomFrame`: cửa nằm tại x,z của hòm; vào / ra cách hòm ≤ 0,8 m (chỉ đổi y); vào thì ở trong phòng, ra thì ở ngoài; kẹp sàn.
  - `targetAt`: chọn theo hướng nhìn / tầm / chốt / cửa.
  - `buttonStates` chỉ theo picks của thẻ (không rò).
  - `roomPrompt`.
  - Collider: không có trần, có tường.
- `RaceClient.test.ts`: gửi `view` một lần mỗi mốc (kể cả F5 sau 2 mốc → 0 lần); giãn pick / lock.
- `RemotePlayers.test.ts`: luật ẩn theo `heightAt`, dốc Trocadéro.

## Thử tay
Đã làm, offline, bằng script Playwright tạm (đã xóa) trên `?louvre=1`:
- F ở cửa → ra sân, y −30,25 → −0,25; x giữ, z lệch 1,6 m. F ở hòm → vào lại, đúng sàn.
- Lặp 3 vòng: không lỗi console, phòng dựng / dỡ đúng.
- "Kẹt? Về chỗ an toàn" trong phòng: vẫn ở trên sàn phòng.

**Chưa làm (cần máy chủ track A + `dev:api` + 2 trình duyệt):**
- Vào phòng từ thẻ thật; thấy nhau trong phòng; đèn chỉ của mình.
- F5 trong phòng về đúng sàn.
- Vào / ra 5 lần trong 1 phút không có cờ Host.
- NPC quanh hòm không rơi.
- Chốt sai → đếm ngược; chốt đúng → thẻ mới.
- Đội trên phố không thấy ghost dưới đất.
- Gợi ý 40 / 70 tới khi đứng im.

(Ở nhánh này `advance` vẫn trả im lặng cho pick / lock.)

## Lệch kế hoạch
- **Vào phòng chỉ trong 3 m quanh hòm** (`enterReach`), không phải cả vùng `room.r` (15–40 m). Lý do: vào phòng đặt chân tại cửa, nên F ở mép vùng sẽ thành nhảy x,z tới 40 m, trái S5. Trong vùng mà còn xa hòm, prompt hiện "Phòng Louvre: tới sát hòm mật thư rồi bấm F để vào".
- **Prompt phòng là phần tử riêng trong `main.ts`** (cùng class `rc-prompt hud-box`), không nằm trong `RaceHud`: `RaceHudFrame` chỉ có `inZone`, mà `RaceHud` là file của track C. C có thể chuyển vào `RaceHud` (nhận `prompt?: string`) khi ghép.
- **`initCredits(ask)`**: `Credits.ts` (file C) chưa nhận tham số, nên `main.ts` gọi qua ép kiểu `(initCredits as (ask?: () => void) => void)(race ? () => race.credits() : undefined)` (`// ponytail`). Sau khi C ghép, đổi thành lời gọi thường.
- **Stand-in `?louvre=1`** dùng `demoLouvre` của chính `LouvreRoom.ts`, không dùng `DEMO_CARDS` của C. Thẻ góc trái trong preset là thẻ mặc định của C cho tới khi C thêm `card=louvre` / `louvre-locked`, nên đếm ngược giữa màn hình ở `p8b-room-lock` chỉ hiện khi C có `louvre-locked`.
- **Phạt**: prompt ở nút chốt ghi "Đang bị phạt – chờ hết đếm ngược để chốt (vẫn chọn / bỏ được)" mà không có mm:ss, vì đếm ngược giữa màn hình (`lockLine` của RaceHud) đã có giờ.
- **Không làm vòng sáng sprite** trên nút đã chọn. Thay vào đó nút xanh to hơn 1,4 lần. Không có `dimSun`: vật liệu phòng unlit; nhân vật vẫn chịu nắng hemisphere / sun (ảnh chụp ổn).
- **`RaceClient.lock(step, now?)`** có giãn `opMinGapMs` (kế hoạch không ghi), để bấm F liên tục ở nút chốt không đốt `maxRaceOps`.
- **Thế giới phía trên vẫn được vẽ** khi ở trong phòng (khoảng 270 draw call bị trần che). `// ponytail` có thể ẩn chunk khi `room.active` nếu cần FPS.
