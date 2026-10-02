# Phase 8B – Critic engine / giao thức / quota / dựng phòng (2026-10-03)

Đối tượng: `docs/plans/phase8b.md` (phòng Louvre, SPEC §17.19 kể cả "Chốt thêm") đối chiếu với mã hiện có (`worker/src/race/{steps,engine}.ts`, `worker/src/RaceRoom.ts`, `worker/src/db.ts`, `worker/src/index.ts`, `shared/src/protocol/*`, `shared/src/leg/*`, `client/src/race/**`, `client/src/net/*`, `client/src/player/*`, `client/src/main.ts`) và `docs/plans/phase8.md`. Không đọc chặng thật, không sửa SPEC / kế hoạch.

**Hai quyết định mới của người dùng nhận trong lúc review** (phần §0): (a) "Đúng x/5" từ phút 70 cập nhật **sống** theo lựa chọn hiện tại; (b) ảnh / mô hình 23 tác phẩm là **tài sản tĩnh** của client (`art-NN`, metadata xóa, thứ tự xáo), không R2, không Host tải lên.

Tổng: **2 chặn · 7 nên sửa · 8 nhỏ**. Dòng số = `file:dòng` trong mã hiện tại.

---

## 0. Ảnh hưởng của hai quyết định mới (cập nhật kế hoạch trước khi mở track)

### 0a. x/5 sống từ phút 70
- **Engine đơn giản hơn**: bỏ cột `hint_correct`, bỏ input `hintTick` / effect `hintCorrect` / `settleHints` (§D, §E). `cardOf` tính khi đọc: `hintCorrect = now ≥ hintAt[1] ? |picks ∩ answers| : null`. Không trạng thái nào phải ghi → DO bị đuổi giữa mốc 40–70 hay sau 70 không mất gì. SQLite v4 chỉ còn `picks` (xem S2: có thể không cần cả cột đó).
- **Giao thức**: mỗi `pick` sau phút 70 trả `{t:'race', view}` cho **chính đội** (`engine.apply` → `io.send(team, …)` `engine.ts:500-504`, không broadcast) → x không lộ cho đội khác. Feed công khai "Đội X đúng x/5" vẫn chỉ phát khi **chốt** (sau 70). Op `view` vẫn cần để làm mới thẻ đúng mốc (0 dòng).
- **Quota**: 0 dòng thêm (x đi kèm dòng `pick` vốn có; với S2 là 0). Request không đổi.
- **Rủi ro chấp nhận (ghi RACE_RULES / TODO)**: sau phút 70 đội bật / tắt lần lượt 23 nút và đọc x → biết chính xác 5 món trong ≈ 23 lần bấm (1–2 phút đi lại), phạt 3 phút không còn tác dụng sau mốc. Chỉ đội mình thấy. Bot `sim` nên có kịch bản này (bot 0 giải bằng toggle sau mốc) để test "đúng theo spec".
- Rủi ro §K "gian lận bằng gợi ý 70 sống" → bỏ (đã là quyết định).

### 0b. Ảnh tác phẩm là tài sản tĩnh
- **Bỏ**: `image: "r2:…"`, mở rộng `mediaAllowed` (§E), `fetchMedia` + cache blob (§F), mục "Hình mật thư" liệt kê 23 tên trên trang Host (§H), `r2Names` gộp, luật `leg:check` 3 về `r2:`; ảnh 404 trước khi mở hòm (§I harness) không còn ý nghĩa.
- **Schema**: `image: z.string().regex(/^art-\d{2}\.webp$/)` (hoặc tên tệp trong `client/public/art/`); `leg:check` CLI kiểm **tệp tồn tại** và kích thước ≤ 300 KB; luật "tên hình chứa token của `note`" giữ (tên `art-NN` không bao giờ vi phạm nhưng vẫn chặn người soạn đổi tên).
- **Quota request giảm hẳn**: request tài sản tĩnh của Workers **không tính phí / không đếm** vào request Worker; kế hoạch đang cộng 920 request DO (§K) – và thực ra là ×2 vì mỗi GET hình = 1 request Worker + 1 request DO (`worker/src/index.ts:69`, `Cache-Control: private, no-cache` `index.ts:72` → mỗi lần tải trang hỏi lại) ≈ 1 840. Sau quyết định: **0**. Ước tính xấu nhất ≈ 36 570 (Phase 8) + ≈ 40 (op ÷ 20) ≈ **36 600 / 40 000**.
- **Cache**: `client/public/` được chép nguyên tên (không hash) → trình duyệt cache theo ETag của Static Assets; 23 ảnh tải một lần mỗi máy.
- **Build**: +23 tệp × ≤ 300 KB ≈ 7 MB (giới hạn 20 000 tệp / 25 MB mỗi tệp: thoải mái). Nếu có GLB tượng ≤ 1 MB mỗi tượng: vẫn xa giới hạn.
- **Rủi ro lộ đáp án qua tài sản tĩnh** (ai cũng tải được 23 ảnh trước khi tới Louvre; bản thân ảnh không bí mật – bí mật là "món nào ở Louvre"):
  1. **Tên tệp / thứ tự**: `art-01…23` đánh số theo thứ tự **xáo** (bảng xáo chỉ ở `.cache/assets/louvre/manifest.json`, không commit); `artworks[]` trong chặng tham chiếu `image` → bố cục quanh tường = thứ tự trong chặng. Thêm luật `leg:check` (warning): 5 `answers` nằm liền nhau / là 5 mục đầu hoặc cuối của `artworks` → "thứ tự trong phòng gợi ý đáp án". Rẻ hơn nữa: server xáo thứ tự phòng theo seed = race id (giống nhau cho mọi đội, đúng "bộ nút giống nhau").
  2. **Metadata**: `scripts/process-assets.ts` dùng `sharp` (`:20`) – `sharp(...).webp()` **không** giữ EXIF / XMP / ICC trừ khi gọi `.withMetadata()` → chỉ cần không gọi; thêm một test nhỏ: đọc lại tệp xuất bằng `sharp(file).metadata()` và assert không có `exif` / `xmp` / `icc`.
  3. **`credits.json` → panel "Ghi nguồn" trong game** (`client/src/ui/Credits.ts`, nút ở `ui/Menu.ts:160`): kế hoạch §F ghi "Tranh / tượng phòng Louvre: … – tác giả ảnh, giấy phép". Nếu dòng này mang **tên tác phẩm** thì tên hiện trong game (trái §17.19 "Tên tác phẩm KHÔNG hiện") và tra Google là biết món nào ở Louvre. Ghi nguồn chỉ theo tên tệp: "art-07.webp – ảnh: <tác giả>, <giấy phép>, <link>" (CC BY chấp nhận ghi tác giả + giấy phép + link); bản đầy đủ nằm ở `manifest.json` ngoài repo. `scanLeaks` (`scripts/leg-check.ts:208`) quét `client/public` + `dist` với `secretStrings` – thêm `note` của 23 tác phẩm vào `secretStrings` (kế hoạch luật 8 đã có) thì sẽ bắt được tên nếu `note` chứa tên: ghi rõ trong LEG_FORMAT "`note` phải chứa tên tác phẩm" để luật này có răng.
  4. Link nguồn ảnh (Wikimedia) trong credits thường chứa tên tác phẩm trong URL (`…/File:Mona_Lisa.jpg`) → cũng là rò; ghi link tới trang tác giả / giấy phép, không tới trang tệp. Hoặc không in link, chỉ tên tác giả + giấy phép.
- "Không diễn tập bằng bộ khác": chặng test `louvre.json` dùng chính `art-NN` (hoặc `''` → placeholder) với `note` giả "(GIẢ) Tác phẩm n".

---

## 1. CHẶN

### C1. Đường `race answer` cũ giải được phòng Louvre bằng một id (rò / vòng qua máy chủ)
- **Kế hoạch**: §B "Bộ 5 đáp án = `task.answers`"; §C `ArtworkView.id` gửi 23 id xuống client; §A (8) "`verification` của louvre luôn là máy chủ tự chấm (`host_approval` bị bỏ qua, cảnh báo)". Không chỗ nào chặn op `answer` cho bước louvre.
- **Bằng chứng**: `steps.ts:253-270` xử lý `input.kind === 'answer'` cho **mọi** challenge `active`: `verification === 'auto'` → `verifyAuto(t, text)` = `task.answers.some(a => normalize(a) === normalize(text))` (`worker/src/race/tasks.ts:6-7`) → gõ **một** id bất kỳ trong 23 id đã nhận (`artworks[].id`) ≤ 23 lần (`maxRaceOps` 30/phút, `auto` sai không khóa `steps.ts:267-269`) → `correct` → `done(pose)` → bước xong, không cần chọn 5. Nếu chặng ghi `host_approval`: `answer` → `pending` (`:263-266`) → `stateOf` = `pending` (`:121`) → `lock` bị `answerPending` mãi, hàng chờ Host có mục giả, Host bấm Duyệt → xong bước.
- **Sửa** (1 dòng + 1 dòng): trong `advance`, sau `const t = taskOf(…)`: `if (t.kind === 'louvre' && input.kind === 'answer') return silent;` (client thật không gửi). Trong `review()`: approve không `id` đã giới hạn `kind === 'free'` (`:373`) nên không mở được; `penalize` cần câu `pending` → không có. `leg:check` luật 6 nâng từ warning lên **error** nếu `verification !== 'auto'` thì gọn hơn, nhưng guard máy chủ vẫn bắt buộc (chặng cũ / file sửa tay). Test thuần: `answer` id đúng cho bước louvre → `silent`, dòng ghi 0.

### C2. Bọc `env.heightAt` toàn cục + collider trần → NPC / hòm rơi vào phòng, "Kẹt?" trong phòng đưa người lên nóc phòng rồi respawn lặp
- **Kế hoạch**: §F "Môi trường: `main.ts` bọc `env`: `heightAt: (x,z) => room?.inside ? room.floorY : heightAt(grid,x,z)`"; §F "Va chạm: 1 collider sàn + 4 tường + **trần**".
- **Bằng chứng**: `env` là một object dùng chung (`main.ts:179`) cho: Player / controller (`:181`), `groundY` (`:207`), `boxGround` → `ClueBoxes` đặt hòm (`:209-214`, `ClueBoxes.ts:140` gọi lại `groundAt` khi collider chưa có), overlay đồ thị (`:331`), **NPC** (`:345` → `NpcRoads(graph, heightAt)` `Npc.ts:132`, xe / người đi bộ lấy y mỗi bước `Npc.ts:190, 209`).
  - Nếu `inside` xét theo **footprint x,z** (heightAt không có y): mọi NPC băng qua ô 26 × 16 m quanh hòm Louvre và chính **hòm** của bước (x,z nằm trong footprint) nhận `floorY` → đi bộ / xe tụt xuống −17 m, đi trong phòng; hòm chìm xuống sàn phòng khi `ClueBoxes` đặt lại.
  - Nếu `inside` là cờ "người chơi đang trong phòng": toàn thành phố thấy từ trong phòng vẫn đúng (chỉ ảnh hưởng heightAt), nhưng NPC quanh Louvre vẫn rơi suốt lúc đội ở trong.
  - **Trần**: `CharacterController.surface()` (`:501-511`) bắn tia từ `max(ground, water) + spawnCastHeight(12)` xuống và lấy **mặt đi được cao nhất** (`railDecks.pickSurface`, "highest walkable" `:498`). Trong phòng (`heightAt` = floorY) tia bắt đầu ở floorY + 12 > trần (floorY + 5) → **nóc trần** là mặt cao nhất. Đường có `yHint` (vào phòng, F5: `cast(yHint + 1.5)` `:507`, `raceClient.hintAbove` `config.ts:1081`) bắt đầu dưới trần → OK; nhưng `respawn()` ("Kẹt? Về chỗ an toàn", rơi xuyên) và `ride(null)` dùng `place(x, z)` **không hint** (`:269`, `:239`) → đặt chân lên nóc phòng (ngoài AABB) → `heightAt` trả mặt đất thật (+13) → `p.y < heightAt − fellThrough` (`:366`) → `respawn()` → lại nóc → **lặp vô hạn**, không ra được.
- **Sửa**: (1) không bọc `env` chung: tạo bản riêng cho Player `Player.create(scene, world, camera, { ...env, heightAt: …, get waterLevel() {…} }, …)`; override theo **cờ `room.active`** (đặt ở `enter()` / bỏ ở `leave()`; F5: đặt khi `welcome.pose.y < heightAt(grid, x, z) − 10` trước `spawnAt` `main.ts:278`) – controller chỉ gọi `heightAt` quanh thân người nên cờ là đủ; NPC / hòm / overlay giữ `heightAt(grid)`. (2) **Bỏ collider trần** (nhảy ≈ 1 m, `jumpSpeed 4.4` `config.ts:588`, trần 5 m) – khi đó mọi tia trong phòng đều rơi xuống sàn; mesh trần giữ để vẽ. (3) Test thuần `inside/active` + kiểm tay "Kẹt?" trong phòng → về sàn phòng.

---

## 2. NÊN SỬA

### S1. "Thẻ `done`" không bao giờ là thẻ hiện tại → điều kiện vào / "hết thử thách" của §F sai
- **Kế hoạch** §F (2): vào phòng khi "thẻ hiện tại có `task.louvre`, status ∉ {done, teaser}"; "Hết thử thách (status done) nút vô hiệu, bảng cửa đổi".
- **Bằng chứng**: `complete()` đặt `p.step = i + 1` ngay (`steps.ts:157-161`); `view()` trả `cardOf(r.step)` (`engine.ts:403`) → sau khi chốt đúng, `view.card` là thẻ **bước kế** (không có `louvre`); `status: 'done'` chỉ xuất hiện trong `book`. Vậy "done" phải suy ra từ `view.card.step !== room.step` (phòng khóa theo id bước). Hệ quả tốt: điều kiện vào tự sai → không vào lại được; nhưng nếu client dỡ phòng khi thẻ đổi thì đội đang đứng ở −17 m mất collider → rơi → `respawn` (an toàn nhưng xấu).
- **Sửa**: `LouvreRoom` giữ `step`; `done = view.card?.step !== step`; phòng chỉ dỡ khi `leave()`. F5 sau khi xong mà chưa ra: `welcome.view.card` không có `louvre` → không dựng phòng → `surface(x,z,yHint=−17)` không thấy gì ở −15,5 → tia dự phòng từ +25 → đứng trên sân Louvre (tự "ra"): chấp nhận, ghi RACE_RULES §12.

### S2. `pick` = 1 dòng SQLite mỗi lần, không chặn thật (60/phút bỏ im lặng) → client sửa đốt 7 200 dòng / đội / 2 h
- **Kế hoạch** §D bảng (pick 1 dòng), §C `maxPickOps: 60` "từ chối im lặng (không đóng socket)"; §D ponytail "picks vào dòng snapshot – không làm bây giờ".
- **Bằng chứng**: D20 Phase 8 (`RaceRoom.ts:416`, `NET.maxRaceOps` 30 → đóng socket) tồn tại chính vì ngân sách dòng trước client sửa; `db.ts:1-3` "100 000 dòng / ngày Free plan". 60/phút × 120 phút = 7 200 dòng / đội; 20 đội = 144 000 > hạn ngày. Người chơi thật ≈ 25 pick / đội (phải đi tới nút cách nhau ≥ 2,6 m).
- **Sửa** (≈ 10 dòng, làm ngay thay vì ghi TODO): `picks` **không ghi dòng riêng**: giữ trong cache dòng của engine (`teamRows`), **chép vào JSON dòng `snapshot`** (`RaceRoom.writeSnapshot` `:521-528`, vốn upsert 1 dòng / 2 s; `pick` gọi `this.snapshotAt ??= now + NET.snapshotMs` như `moved()` `:449-455`), đọc lại trong constructor (`:110-118`); chỉ **`lock`** mới ghi `picks` vào `step_progress` (cùng dòng với `answers` / `locked_until`). Mất tối đa 2 s bấm nút khi DO bị đuổi (đèn tắt vài cái, đội bấm lại). Khi đó bỏ `maxPickOps`, `maxMessagesPerSec` 15 là đủ; honest −25 dòng / đội (≈ 16 / đội cả thử thách). Nếu không muốn: ít nhất đếm `pick` vào `count(team,'race')` với ngưỡng riêng 40 / phút và **đóng** socket như `answer`.

### S3. Feed cắt ngang track B / C; preset `screenshot.ts` ba track cùng sửa
- **Kế hoạch** §J: track C sở hữu `ui/Feed.ts`, `RaceHud`, `Toasts`; track B sở hữu `main.ts`, `RaceClient.ts`. §G: Feed "nhận từ `welcome.feed` + `{t:'feed'}`; tên đội từ `teams[slot]` (RaceClient giữ `teams`)".
- **Bằng chứng**: định tuyến tin server nằm trong `main.ts:285-295` (B) và `RaceClient.message` (`RaceClient.ts:54-66`, B); `teams` là `private` (`:38`). C không có file nào nhận được `{t:'feed'}` → ghép sẽ phải sửa file của B. `screenshot.ts`: nền "khối `p8b-*`", nhưng bảng track ghi B / C / D đều "preset `[B]`/`[C]`/`p8b-host`" → 3 worktree cùng sửa một file.
- **Sửa**: nền viết sẵn: `RaceClient.message` xử lý `m.t === 'feed'` → `hud.feed(m, this.teams)`; `RaceClient.welcome` → `hud.feed(w.feed…)`; `RaceHud.feed()` stub gọi `Feed`; C chỉ điền `Feed.ts` + `RaceHud.feed`. Nền tạo **đủ tên** preset `p8b-*` với tham số tạm; mỗi track chỉ đổi giá trị trong mục của mình.

### S4. Op `view` bị cổng trạng thái / `isClientMessage` chặn như hiện tại
- **Kế hoạch** §C `{t:'race', op:'view'}` "không trường"; §E "`view` được cả khi paused (chỉ đọc)".
- **Bằng chứng**: `engine.onOp` `:164-167`: ngoài `running` mọi op trừ `checkin` nhận `notice` và dừng → `view` khi `paused` / `lobby` không trả thẻ. `isClientMessage` `codec.ts:108-109`: chỉ `checkin` / `book` được không có `step`; op khác bắt buộc `str(o.step,16)` → `view` không `step` → **đóng socket 4400**.
- **Sửa**: thêm `view` cạnh `book` ở cả hai chỗ (`codec.ts:108`, `engine.ts:163`), không đếm vào `maxRaceOps` (0 dòng – với 0a hoàn toàn thuần đọc). Test harness: `view` khi `paused` → `race view`.

### S5. Vào / ra phòng bằng `respawn safe` tốn sự kiện và có thể gắn cờ đội thật
- **Kế hoạch** §E "client gửi `{t:'respawn', how:'safe'}` sau khi dịch chuyển vào / ra … 1 sự kiện 2 dòng mỗi lần, ≤ 6 / phút".
- **Bằng chứng**: `RaceRoom.ts:389-409` mỗi `respawn` → `teleport()` (`:349-357`): `r.n++`, `n > NET.maxRespawns (6)` **hoặc** `r.d > 400` → `flag(t)` – cờ đỏ trên Host **không bao giờ tự xóa** (`:34`); `r.g + near ≤ respawnTrust 30` mới tin ngay (`:402`) → 4 lần vào / ra trong 1 phút (8 m mỗi lần) = 32 m → lần 4 không instant; mỗi lần 2 dòng (`:354`, `:631-634`) mà §D không tính. Đội đứng cạnh hòm ra vào xem thẻ / chờ bạn là chuyện thường.
- **Sửa** (rẻ hơn và không đổi giao thức): đặt **cửa phòng thẳng đứng dưới hòm** (door x,z = box x,z, lệch ≤ 2 m) và đặt chân ở đúng x,z đó cả khi vào lẫn khi ra → dịch chuyển **chỉ theo y**; `TrustedPoint` / `SpeedWindow` chỉ xét x,z (`speed.ts`, `RaceRoom.ts:310-312`) → không có teleport, **không cần gửi `respawn`**, 0 dòng, không cờ. Đội khác thấy nhân vật "biến mất xuống đất" tại hòm – chấp nhận. Nếu vẫn muốn cửa lệch: gửi `respawn` nhưng kiểm tay 5 lần vào / ra trong 1 phút không bị cờ.

### S6. Cập nhật kế hoạch theo quyết định 0b (ảnh tĩnh)
Danh sách việc phải đổi ở §0b (schema `image`, bỏ `mediaAllowed` / Host "Hình mật thư" / `fetchMedia`, `leg:check` kiểm tệp + thứ tự đáp án, `credits.json` không tên tác phẩm, test metadata). Không có mục nào trong kế hoạch hiện tại đúng với quyết định này.

### S7. Cập nhật kế hoạch theo quyết định 0a (x/5 sống)
Danh sách ở §0a (bỏ `hint_correct` / `hintTick` / `settleHints`, `cardOf` tính khi đọc, RACE_RULES ghi rõ "sau phút 70 x cập nhật theo từng lần bấm", bot sim toggle). Mặc định (1) §A/§K và test "`hintCorrect` chốt một lần" phải bỏ.

---

## 3. NHỎ

- **N1. Độ cao Louvre đúng như kế hoạch** (xác nhận, không phải lỗi): DEM `client/public/data/elevation.bin`: Pyramide y ≈ +13,7, Cour Carrée +17,2, Carrousel +5,3 → sàn −16…−25; kẹp −35 (`respawnBelow −40` `config.ts:590`) không bao giờ chạm; `codec MIN_Y −100 m` (`codec.ts:13`) đủ; `MAX_XZ` không liên quan.
- **N2. Ước tính dòng §D thiếu sự kiện `respawn`** (4 dòng mỗi cặp vào / ra) – hết ý nghĩa nếu làm S5.
- **N3. Dựng feed từ `events`** khi DO thức: `events` chỉ có index `(team, t)` (`db.ts:22`) → `WHERE type = 'louvre.lock'` quét cả bảng (≈ 2–4 k dòng / cuộc đua) một lần mỗi lần thức: chấp nhận; dùng `ORDER BY id DESC LIMIT 20` (khóa chính) thay `t`. `data` của sự kiện phải mang `public` để không dựng lại `n` của lần chốt trước mốc 70 (kế hoạch đã ghi) – test.
- **N4. Chốt với 0 lựa chọn** → `ok = false` → phạt 3 phút. Client chặn tại chỗ ("Chưa chọn tác phẩm nào") trước khi gửi; máy chủ giữ nguyên (spec: chọn bao nhiêu cũng được).
- **N5. Phòng phải dựng đồng bộ trong handler `welcome`**: `spawnAt` chạy trước `race.welcome` (`main.ts:278` vs `:282`), `pending.wait = 1` frame (`CharacterController.ts:206, 306-309`) → collider sàn phải vào Rapier trong cùng task JS (không `await` ảnh trước khi tạo collider; texture tải sau, placeholder trước).
- **N6. Ánh sáng nhân vật trong phòng**: `MeshBasicMaterial` của phòng không chịu nắng, nhưng nhân vật (người chơi + đội khác) dùng vật liệu có đèn và trần không `castShadow` → người sáng như ngoài trời trong phòng tối. Tùy chọn 1 dòng: khi `room.active` giảm cường độ đèn mặt trời / tăng ambient. Thẩm mỹ, kiểm bằng preset.
- **N7. `hintAt` tính từ `task_started_at`**: với louvre không `teaser`, `task_started_at = now` lúc hoàn thành bước trước (`engine.ts:481`) = lúc mở hòm, đúng ý "từ lúc đội bắt đầu thử thách". Giữ warning `teaser !== ''`.
- **N8. Luật `done(pose)` / xe**: `placesOf` cho louvre trả `zones[i]` = vùng hòm trước (`steps.ts:101`, `zones.ts:49-50`); nút chốt ở tâm phòng = tâm hòm → `standing` đúng; góc phòng (hypot 13, 8 = 15,3 m) vượt r = 15 nhưng không ai chốt ở góc. Xe không vào được phòng nên `riding` luôn false. OK.
- (Đã xét, không có lỗi: DO bị đuổi giữa phạt – `locked_until` trong dòng (`db.ts:73-74`, D25); hai thành viên cùng đội – một socket mỗi đội (`RaceRoom.ts:229-234` otherDevice); vào phòng khi đang bị phạt – `pick` cho phép ở `locked`, `lock` → `answerLocked` (`steps.ts:257`); rời phòng – `picks` trong dòng; tạm dừng – `pick`/`lock` → `racePaused` như D24, phạt chạy tiếp theo D9; presence – ticks có y, `tickEntries` lọc theo x,z (`presence.ts:16`) nên đội trong phòng thấy nhau, name tag sprite `depthWrite:false` nhưng vẫn `depthTest` (`CharacterModel.ts:133`) → bị địa hình che, kiểm tay như §K; tương thích v3 → v4: `NetClient.welcome` dừng với `'version'` (`NetClient.ts:172`), static assets + Worker deploy cùng lúc, chặng cũ không có `louvre` parse y nguyên, DB v3 → ALTER `if (v < 4)` theo mẫu `db.ts:155`; `lock` không có pose: `stand(null)` → `done(null)` không park, như `answer`.)

---

## 4. Ngân sách sau sửa (20 đội / 2 h, xấu nhất)
- Request: ≈ 36 570 (Phase 8) + ≈ 40 (pick / lock / view ÷ 20) + 0 ảnh (tĩnh) ≈ **36 600 / 40 000**.
- Dòng ghi mỗi đội ở Louvre: với S2 + S5 + 0a: 3 chốt sai × 3 + 1 chốt đúng × 7 ≈ **16** (kế hoạch 42) → tổng cuộc đua ≈ 10 010 + 320 ≈ 10 300 / 20 000; không S2: ≈ 42 (+ 4 / cặp vào-ra nếu không S5).
- Chống client sửa: `lock` trong `maxRaceOps` (đóng 4429); `pick` 0 dòng (S2) nên chỉ còn `maxMessagesPerSec`.
