# Phase 8B – phản biện độ đầy đủ của kế hoạch (`docs/plans/phase8b.md`, 2026-10-03)

Người kiểm: critic độ đầy đủ (không sửa code, không sửa SPEC, không sửa kế hoạch). Đối chiếu từng dòng SPEC §17.19 (kể cả "Chốt thêm" và dòng "Sửa (2026-10-03)" về x/5 sống), §17.14–17.18, §17.7 (giấy phép), §3 (quota) với kế hoạch §A–§M; soát mã Phase 8 hiện có (`steps.ts`, `engine.ts`, `RaceRoom.ts`, `types.ts`, `db.ts`, `hostView.ts`, `RemotePlayers.ts`, `index.ts` media, `process-assets.ts` / `credits.json`). Không đọc `~/Documents/chang-that/`.

**Kết luận: SỬA LẠI (revise)** – **3 chặn, 5 nên sửa, 9 nhỏ**. Phần lớn yêu cầu §17.19 có mặt và đúng (23 = 5 + 18 quanh tường; nút đỏ / xanh, bấm lại để bỏ; chọn bao nhiêu cũng được; chốt giữa phòng; sai → phạt `retryLockMinutes` đếm ngược, đồng hồ đua chạy, lựa chọn giữ, vẫn bấm / bỏ; gợi ý 40 riêng đội; feed công khai đúng chữ; đèn chỉ của mình; thấy nhau; tên tác phẩm không hiện; vào bằng F ở hòm; máy chủ tự chấm; HUD / Host / sim / leg:check / tài liệu / test / preset đều có mục). Ba chỗ chặn: (B1) x/5 phút 70 đi ngược quyết định mới của người dùng; (B2) `credits.json` sẽ đưa tên 23 tác phẩm xuống client; (B3) ảnh tác phẩm đi qua R2 + Host tải lên, trong khi người dùng đã chốt là tài sản tĩnh của client.

## Bảng kiểm nhanh (yêu cầu → kế hoạch)

| Yêu cầu gốc | Nguồn | Kế hoạch | Đánh giá |
|---|---|---|---|
| Phòng mô phỏng Louvre, 23 tác phẩm (5 thật + 18 bẫy) bày xung quanh phòng | §17.19 | §A, §B `length(23)`, §F `wallSlots` 9/5/5/2+2 | ✓ |
| Nút dưới mỗi tác phẩm, đỏ = chưa chọn, xanh lá = đã chọn, bấm lại để bỏ | §17.19 Chốt thêm | §C `pick {on}`, §F 2 InstancedMesh đỏ / xanh | ✓ |
| Chọn bao nhiêu cũng được trước khi chốt | §17.19 Chốt thêm | §A, §E (`pick` không giới hạn số) | ✓ (đúng = đủ 5 không thừa: M1) |
| Nút chốt ở giữa phòng; máy chủ tự chấm | §17.19 | §C `lock`, §E so tập | ✓ (lock không cần đứng trong phòng: M2) |
| Sai → phạt 3 phút đếm ngược, đồng hồ đua chạy, lựa chọn giữ, vẫn bấm / bỏ, chỉ không chốt | §17.19 Chốt thêm | §E `pick` cho phép ở `locked`, `lock` → `answerLocked`; D9 Phase 7 | ✓ |
| Gợi ý phút 40 riêng đội: "Đáp án bao gồm 5 tác phẩm" | §17.19 Chốt thêm | §C `hintCount`, §G toast + thẻ | ✓ |
| Gợi ý phút 70 "Đúng x/5", **x cập nhật sống theo lựa chọn hiện tại** | §17.19 "Sửa (2026-10-03)" | §A mặc định (1) **chốt một lần** (`hint_correct`) | ✗ **B1** |
| Feed công khai mọi đội: chỉ "Đội X trả lời sai và bị phạt 3 phút" | §17.19 Chốt thêm | §C `feed wrong`, không `n` trước mốc | ✓ |
| Sau 70 phút của đội đó, MỖI LẦN chốt → "Đội X đúng x/5" | §17.19 Chốt thêm | §E `public = now ≥ hintAt[1]`, feed `score` | ✓ (hai dòng hay một: M3) |
| Đoạn chat nhỏ **góc dưới** màn hình | §17.19 | §G Feed **dưới giữa** | ~ S4 |
| Đèn / nút chỉ hiện cho chính đội bấm | §17.19 Chốt thêm | §F mesh cục bộ từ thẻ của đội; `picks` chỉ trong thẻ của đội | ✓ |
| Người chơi trong phòng thấy nhau | §17.19 Chốt thêm | §E ticks mang y; `RemotePlayers` đặt `position.y` từ tick (`RemotePlayers.ts:91`) | ✓ |
| Tên tác phẩm KHÔNG hiện | §17.19 Chốt thêm | §B `note` server-only, `leg:check` quét tên hình, ảnh tên trung tính | ✗ `credits.json` **B2** |
| Ảnh / mô hình 23 tác phẩm = **tài sản tĩnh client** `art-NN`, xóa metadata, xáo thứ tự, không R2, không Host tải lên; vẫn duyệt trước khi tải | §17.19 "Sửa (2026-10-03)" thứ hai | §B `image: "r2:<name>"`, §B luật 3, §B CLI "23 hình cần tải lên trang Host", §E `mediaAllowed`, §F `fetchMedia`, §H "Hình mật thư (R2) 23 tên", §K quota ảnh, §M tên `lv-NN.webp` | ✗ **B3** |
| Vào phòng bằng F ở hòm Louvre | §17.19 Chốt thêm | §F (2) `room.enter` | ✓ |
| Phạt = cùng cơ chế đếm ngược Phase 8, cấu hình | §17.14, §17.16 | §A (10) `retryLockMinutes`, D9 | ✓ |
| Thử thách xong → mật thư kế hiện ngay | §17.14 | §E `done(pose)` = complete | ✓ |
| Lịch sử chỉ trên thẻ, không vào Sổ | §17.14 | §G | ✓ (thiếu x/5 trong lịch sử sau 70: M4) |
| Giấy phép asset: CC0 / PD / CC-BY / MIT, **không SA / NC / ND**, duyệt trước khi tải, `.cache/assets`, ghi nguồn | §17.7 | §M cho phép **CC BY-SA**; không tải trước duyệt ✓ | ✗ S1 |
| Quota §3: < 40 000 request, < 20 000 dòng, không alarm | §3 | §D, §K | ✓ (B1 còn giảm dòng) |
| Không Ctrl/Alt/Cmd, F không là phím duy nhất… | §17.1–17.2 | chỉ F (`keys.interact` đã có nhiều phím) | ✓ |

## Phát hiện

### B1 (CHẶN) – "Đúng x/5" phút 70 phải cập nhật sống; kế hoạch chốt một lần
- **Yêu cầu gốc:** SPEC §17.19 "Sửa (2026-10-03): 'Đúng x/5' từ phút 70 CẬP NHẬT THEO LỰA CHỌN HIỆN TẠI của đội (hiện sống khi đội bấm / bỏ chọn, không chốt một lần), vì mỗi lần chốt sai đã bị phạt 3 phút. Công khai số đúng cho các đội khác vẫn chỉ ở mỗi lần chốt sau 70 phút của đội đó."
- **Chỗ sai:** §A mặc định (1), §C `hintCorrect` "chốt MỘT LẦN… `step_progress.hint_correct`", §D cột `hint_correct` + dòng "mốc 70", §E input `hintTick` / effect `hintCorrect` / `settleHints`, §G "mốc 70 đã có `hintCorrect` → không gửi `view`", §I test "hintCorrect một lần", §K rủi ro "gian lận bằng gợi ý 70 sống → mặc định (1)", báo cáo `phase8b-plan.md` mặc định 1. Tất cả đi ngược quyết định.
- **Đề xuất (đơn giản hơn kế hoạch hiện tại):**
  - `cardOf` tính **sống**: `hintCorrect = now ≥ hintAt[1] ? |picks ∩ task.answers| : null` – thuần từ dòng + `now`, như `hintCount`. Mỗi `pick` đã trả thẻ mới (`race` view) → x tự cập nhật khi bấm / bỏ; không cần cơ chế riêng.
  - **Bỏ** cột `hint_correct`, input `hintTick`, effect `hintCorrect`, `settleHints`, dòng "mốc 70" trong bảng §D → SQLite **−1 dòng / đội**, không có gì mới để dựng lại sau evict. `SCHEMA_VERSION 4` chỉ còn thêm `picks`.
  - Client vẫn gửi `view` một lần ở `hintAt[1] + lockEndSlackMs` để đội **đứng im** nhận x lần đầu (0 dòng; D9); sau đó mỗi `pick` mang x. Toast "Gợi ý (phút 70): Đúng x/5" chỉ khi null → số; đổi số sau đó chỉ cập nhật dòng trên thẻ (không toast mỗi lần bấm).
  - **Không rò:** x chỉ nằm trong `TaskView.louvre` của thẻ **của chính đội** (`cardOf` theo dòng của đội, như `picks`); feed công khai **không đổi**: chỉ `lock` sau mốc mới gửi `score {n}`; `pick` không bao giờ phát feed. Test §C "JSON thẻ đội B không chứa `picks` / `hintCorrect` của đội A" giữ; thêm test: trước mốc `pick` → `hintCorrect` null; sau mốc `pick` → số đổi theo; evict rồi `welcome` → số tính lại đúng.
  - Host: `StepProgressView.hintCorrect` cũng tính sống (`hostView` so `now`), bỏ chữ "chốt một lần".
  - **Hệ quả cần nói rõ với người dùng (không phải lỗi kế hoạch):** sau phút 70 đội có thể bật / tắt từng tác phẩm và đọc x để suy ra đúng 5 món trong ≤ 23 lần bấm (~1–2 phút), **không bị phạt** (phạt chỉ ở `lock`). Tức là từ phút 70 thử thách gần như được giải. Ghi vào `RACE_RULES.md` và TODO như mặc định đã chốt; nếu người dùng muốn giảm, nút cấu hình rẻ nhất là `hints.correctAtMinutes` (đẩy mốc muộn hơn), không cần cơ chế mới.

### B2 (CHẶN) – `credits.json` (vào bundle client, màn "Ghi nguồn") sẽ ghi tên 23 tác phẩm + tác giả ảnh
- **Yêu cầu gốc:** §17.19 "Tên tác phẩm KHÔNG hiện"; §3 / CLAUDE.md "leg content never goes into static assets"; kế hoạch §B luật 8 chính nó: `scanLeaks` quét `client/public` + `dist` với `note` của mọi tác phẩm.
- **Chỗ sai:** §F "Khi có tài nguyên": `process-assets` target `louvre` "ghi mục `credits.json` ('Tranh / tượng phòng Louvre: … – tác giả ảnh, giấy phép') → panel 'Ghi nguồn' trong game". `credits.json` nằm ở `client/public/credits.json` (committed, tải xuống mọi máy đội). Một dòng ghi nguồn đúng chuẩn Commons ("Tác phẩm X – Leonardo… / ảnh: PD-Art") = lộ tên tác phẩm, và dễ nhất là lộ luôn 5 món thật (ghi "Louvre" trong nguồn ảnh). `leg:check` luật 8 sẽ tự báo lỗi file này → mâu thuẫn nội tại.
- **Đề xuất:** tách ghi nguồn phòng Louvre khỏi bundle: (a) `credits.json` chỉ một dòng chung "Ảnh tác phẩm phòng Louvre: Wikimedia Commons (PD / CC0 / CC BY), danh sách chi tiết do Ban tổ chức giữ"; (b) danh sách chi tiết (tên, tác giả ảnh, giấy phép, URL) nằm trong `manifest.json` của `.cache/assets/louvre/` (không commit) và trong file ghi nguồn **ngoài repo** cạnh chặng thật (CC BY đòi ghi công: giữ ở tài liệu BTC + có thể hiện trên trang Host, Host-only, hoặc trong game **sau khi đội về đích**). `leg:check` luật 8 giữ nguyên để bắt tái phạm. Lưu ý thêm (cùng gốc): bảng §M có cột "Thật ở Louvre? (5 có)" và tên tác phẩm – nếu người dùng điền vào `docs/plans/phase8b.md` (committed) thì đáp án vào git; kế hoạch phải nói bảng điền ở **ngoài repo** (cùng chỗ chặng thật) hoặc trong `.cache/`, trong repo chỉ giữ khung trống.

### B3 (CHẶN) – Ảnh tác phẩm phải là tài sản tĩnh của client, kế hoạch đưa qua R2 + Host tải lên
- **Yêu cầu gốc:** SPEC §17.19 "Sửa (2026-10-03): ảnh / mô hình 23 tác phẩm được ĐƯA THẲNG VÀO GAME (tài sản tĩnh của client, tên tệp trung tính art-NN, đã xóa metadata ghi tên tác phẩm, thứ tự xáo trộn), không qua R2 và không cần Host tải lên; người dùng không diễn tập bằng bộ ảnh khác. Điều bí mật chỉ là 5 id đúng, nằm ở máy chủ. Tài nguyên vẫn phải được người dùng duyệt (nguồn, giấy phép, dung lượng) trước khi tải về."
- **Chỗ sai (mọi mục dính R2):** §B schema `image: "r2:<name>"` + luật 3 ("không phải `r2:` → error", "hình tác phẩm luôn trên R2", blank "sẽ hiện ô đánh số"); §B CLI "23 hình cần tải lên trang Host", `mediaReport` / `r2Names` gộp ảnh tác phẩm; §C `ArtworkView.image "r2:<name>"`; §E `mediaAllowed` thêm 23 ảnh; §F `fetchMedia` + blob cache, "Host nén", `.cache/out/louvre/lv-NN.webp` không commit; §H "Hình mật thư (R2) tự liệt kê 23 tên"; §K rủi ro quota ảnh 920 request + atlas; §K câu hỏi (7) "tải lên R2 theo cuộc đua: Có"; §M cột "Tên file r2 `lv-NN.webp`"; `phase8b-plan.md` mặc định 9.
- **Đề xuất:**
  - **Schema:** `artworks[].image` = tên tệp tĩnh `^art-\d{2}\.(webp|glb)$` (hoặc chỉ số `asset: 1…23`); `''` vẫn = placeholder. `leg:check` luật 3 đổi: tên không khớp mẫu → error; hai tác phẩm cùng tệp → warning; CLI (có hệ tệp) kiểm `client/public/art/<tên>` tồn tại → thiếu = **blank** "chưa có tệp, hiện ô đánh số"; **bỏ** cảnh báo "tên hình lộ note" (tên luôn `art-NN`) và bỏ gộp vào `r2Names` / `mediaReport` / mục Host "Hình mật thư".
  - **Máy chủ:** bỏ `mediaAllowed` cho tác phẩm; `ArtworkView.image` chỉ là tên tệp tĩnh; không có gì để gác (23 tệp công khai với mọi đội từ đầu – đúng ý người dùng: bí mật chỉ là 5 id trong `task.answers`). `artworks[]` thứ tự quanh tường vẫn do chặng quyết (server gửi theo thứ tự chặng).
  - **Client:** `LouvreRoom` tải `TextureLoader` / `GLTFLoader` từ `/art/<tên>` (static asset, cache trình duyệt bình thường, **0 request DO**) – bỏ `fetchMedia` / blob cache / "Host nén"; placeholder canvas giữ cho tệp thiếu / 404 và cho chặng test. Preload khi thẻ louvre tới (trước khi vào phòng).
  - **`process-assets` target `louvre`:** `.cache/assets/louvre/<tên gốc>` + `manifest.json` (nguồn, giấy phép, tác giả, tên tác phẩm – **không commit**) → xáo thứ tự bằng seed cố định ghi trong manifest → `client/public/art/art-01…23.webp` (≤ 1024 px, ≤ 300 KB; sharp mặc định **không** chép EXIF / XMP / IPTC – kiểm bằng `exiftool` / test đọc chunk) và GLB tượng (nếu có): **đổi tên node / mesh / material / scene** thành `art-NN` (tên trong glTF thường mang tên tác phẩm), bỏ `extras` / `asset.extras`. Output **commit** (mỗi tệp ≤ 25 MB, 23 × 300 KB ≈ 7 MB bundle). In bảng "tên gốc → art-NN" ra console / manifest để người dùng điền `artworks[].image` + `answers` vào chặng thật (ngoài repo). Test: không tệp nào trong `client/public/art/` chứa chuỗi của manifest (`leg:check` luật 8 `scanLeaks` đã quét `client/public` với `note`; thêm quét metadata nhị phân: grep bytes).
  - **Host:** bỏ mục liệt kê 23 hình; `drawLeg` chỉ in "Phòng Louvre: 23 tác phẩm (tệp tĩnh)". `leg:check` CLI nhắc "23 tệp trong client/public/art, không cần tải lên".
  - **Quota:** §K bỏ 920 request ảnh + atlas (ảnh là static asset, không tính request DO) → xấu nhất ≈ 36 600 / 40 000.
  - **Tài liệu:** `LEG_FORMAT.md` §7.5 "hình tác phẩm là tệp tĩnh có sẵn trong game, không tải lên trang Host; chỉ ghi tên `art-NN`"; §M cột "Tên file" = `art-NN.webp` sau xáo; `credits.json` theo B2 (vẫn không ghi tên tác phẩm); TODO bỏ "atlas".
  - **Chặng test:** `louvre.json` dùng chính `art-01…23` (khi đã có) hoặc `''` placeholder; "không diễn tập bằng bộ ảnh khác" → không cần cơ chế đổi bộ ảnh.
  - Lưu ý bảo mật đúng với quyết định: mọi đội tải được 23 ảnh từ đầu (static), kể cả trước khi tới bước; chấp nhận vì ảnh không mang tên và 5 id ở máy chủ. `leg:check` luật 4 (note lọt vào chữ đội đọc) và quét `client/dist` giữ nguyên.

### S1 (NÊN) – §M cho phép CC BY-SA, trái §17.7
- **Yêu cầu gốc:** §17.7 "Giấy phép được dùng: CC0 / public domain, CC-BY 3.0/4.0, MIT. **Không dùng NC, ND, SA**, 'editorial only' hay nguồn không rõ giấy phép."
- **Chỗ sai:** §M "ảnh chụp tượng (3D)… cần giấy phép CC0 / CC BY / **CC BY-SA**".
- **Đề xuất:** bỏ SA khỏi tiêu chí; cột "Giấy phép" của bảng chỉ nhận PD / PD-Art / CC0 / CC BY. Ghi rõ: tranh 2D trước 1900 → PD-Art (Commons) là đủ; tượng → chỉ ảnh CC0 / CC BY (sẽ ít lựa chọn hơn, nêu sớm để người dùng biết khi chọn 8 tượng). Quy trình duyệt: người dùng đưa 23 tên (ngoài repo) → agent điền nguồn / giấy phép / dung lượng → người dùng duyệt từng dòng → mới tải (kế hoạch hiện để người dùng tự điền URL; nên nói agent điền, người dùng duyệt).

### S2 (NÊN) – `hint_correct` / `hintTick` / `settleHints` / "lần view đầu sau mốc" phải gỡ khỏi mọi mục (hệ quả B1)
- §C, §D (bảng + "Dựng lại"), §E, §G, §H ("💡70 (x/5)" tính sống), §I (harness "chờ 6 s → view → dòng +1, lần view sau không ghi"; sim "bot 0 gửi view ở mốc"), §K, `phase8b-plan.md` §"Mặc định" (1). Ước tính dòng §D: 41 / đội. Harness thay bằng: `pick` sau mốc → thẻ `hintCorrect` đổi, **0 dòng thêm** ngoài dòng `picks`.

### S3 (NÊN) – Thẻ của đội không có x/5 cho từng lần chốt sau phút 70, dù số đó đã công khai
- **Yêu cầu gốc:** §17.14 "Người chơi xem được lịch sử câu trả lời của chính đội mình… trên thẻ"; §17.19 sau 70 phút mỗi lần chốt công khai x/5.
- **Chỗ thiếu:** §C `ClueCard.answers` mỗi lần chốt chỉ `{ text: "7 tác phẩm", status }`; §D "`AnswerRec += { c }` Host-only; thẻ đội không gửi `c`". Đội thấy số của mình qua feed (mất sau 90 s) nhưng lịch sử trên thẻ không ghi → đội phải tự nhớ.
- **Đề xuất:** `AnswerView += { correct?: number }` chỉ khi `rec.at ≥ hintAt[1]` (đúng luật "trước 70 chỉ 'sai'"); `cardPanel` in "Chốt 7 tác phẩm · Sai · đúng 2/5". Test không rò: mục chốt trước mốc không có `correct`.

### S4 (NÊN) – Vị trí feed "góc dưới" vs kế hoạch "dưới giữa"
- **Yêu cầu gốc:** §17.19 "hiện như một đoạn chat nhỏ ở **góc dưới** màn hình" (hai lần).
- **Chỗ lệch:** §G "hộp góc dưới giữa (không đè minimap trái / HUD phải)". Góc trái dưới có minimap, phải dưới có HUD phố / đồng hồ, nên "góc" nào cũng đụng; dưới giữa là lựa chọn kỹ thuật chưa được nêu là mặc định chờ xác nhận.
- **Đề xuất:** đặt **góc dưới trái, ngay trên minimap** (kiểu chat GTA) hoặc giữ dưới giữa nhưng ghi vào §K là mặc định chờ xác nhận + chụp preset `p8b-feed` cho người dùng xem.

### S5 (NÊN) – `RACE_RULES.md` §5 còn câu "Không có gợi ý trong game" và luật Host duyệt áp cho mọi thử thách
- **Yêu cầu gốc:** §17.14 (gợi ý qua Messenger, Host duyệt) nay bị §17.19 ghi đè riêng cho Thử thách 3 (gợi ý trong game, máy tự chấm).
- **Chỗ thiếu:** §L chỉ "thêm mục mới Phòng Louvre"; không sửa câu `docs/RACE_RULES.md:154` "**Không có gợi ý trong game.**" và câu "Game không tự chấm" (dòng 151), `LEG_FORMAT.md` §7.1 dòng `verification` ("auto = máy so với answers… sai thì 'Chưa đúng' (không khóa)") – louvre sai thì **có khóa**. Cảnh báo kẹt 45 phút (`stuckAlerts`, `active` / `locked` không `pending`) vẫn nổ cho đội ở phòng Louvre song song với gợi ý 40 / 70 của game: ghi rõ trong §H / `LEG_FORMAT.md` §7.4 là cố ý (Host vẫn cần biết) hay đổi ngưỡng cho bước louvre.
- **Đề xuất:** track D sửa hai câu trên thành "trừ Thử thách 3 (phòng Louvre)…" + bảng `verification` thêm dòng louvre; TODO ghi quyết định về cảnh báo kẹt.

### M1 (NHỎ) – "Đúng = đủ 5 và không thừa" chưa nằm trong mặc định chờ xác nhận
- §17.19 liệt kê "chọn đúng 5 hay tối đa" là **chờ xác nhận**; "Chốt thêm" chỉ chốt "chọn bao nhiêu cũng được **trước khi chốt**". §A chọn so tập chính xác (6 món có đủ 5 đúng = sai) – hợp lý, nhưng phải vào §K / `phase8b-plan.md` làm mặc định (và `RACE_RULES.md` nói rõ "chọn thừa cũng sai").

### M2 (NHỎ) – `lock` không kiểm vị trí: chốt được từ ngoài phòng
- §E "pick / lock từ bất kỳ đâu (D8)". D8 là quyết định cho gõ đáp án; §17.19 nói nút chốt **ở giữa phòng**. Client sửa (devtools) chốt / bấm từ phố mà không vào phòng. Rẻ: `lock` đã mang `pose` (cho `done(pose)`); thêm điều kiện `pose` trong `zones[i]` (vùng hòm, như `open` dùng `boxFar`), ngoài → `boxFar`. `pick` giữ tự do (chỉ là trạng thái). Ghi §K nếu không làm.

### M3 (NHỎ) – Chốt sai sau phút 70: một hay hai tin feed?
- §17.19 "công khai **thêm** số đáp án đúng". §C có `kind: 'wrong' | 'score'`; §I chỉ test "lock sau mốc → feed score". Chưa nói chốt sai sau 70 gửi **cả** `wrong` (phạt) **và** `score`, hay gộp một dòng. Đề xuất: một sự kiện `louvre.lock` → client dựng một dòng "Đội X trả lời sai và bị phạt 3 phút · đúng 2/5" (feed `{kind:'wrong', minutes, n?}`; `n` chỉ khi public); chốt đúng sau 70 → "Đội X đúng 5/5" (hoặc "đã xong"). Test cả hai.

### M4 (NHỎ) – x = 0 tại mốc 70 khi đội chưa vào phòng / chưa chọn gì
- Với x sống (B1) đội nhận "Đúng 0/5" nếu chưa chọn gì; hợp lý nhưng nên in "Đúng 0/5 (chưa chọn tác phẩm nào)" để không hiểu nhầm là lỗi. Mốc 40 / 70 tính từ `task_started_at` = lúc mở hòm Lộ trình trước (challenge không teaser: `engine.ts:481`), **không** phải lúc vào phòng – ghi rõ ở `RACE_RULES.md` + `LEG_FORMAT.md` (đội đi lạc 20 phút trước khi vào phòng mất 20 phút gợi ý).

### M5 (NHỎ) – "Kẹt? Về chỗ an toàn" (menu `respawn`) trong phòng
- `controller.respawn()` về "last safe ground" – nếu safe point được ghi trong phòng (sàn), ổn; nếu là điểm trên phố trước khi vào → đội văng lên mặt đất mà `room.active` vẫn true (env wrapper `waterLevel` null, `heightAt` sàn) → treo giữa trời. §F chưa nói. Đề xuất: `room.leave()` khi respawn đưa ra ngoài AABB, hoặc respawn trong phòng = về cửa.

### M6 (NHỎ) – Nhãn tên / ghost xuyên địa hình chỉ ở mục rủi ro
- `RemotePlayers` đặt `position.y` thẳng từ tick nên đội trong phòng thấy nhau (✓), đồng thời đội trên phố thấy ghost ở −17…−35 m. Kế hoạch để "kiểm tay; nếu lộ → ẩn |Δy| > 10 m". Chi phí 1 dòng, nên làm luôn trong track B (tránh một vòng review) và thêm vào nghiệm thu B.

### M7 (NHỎ) – Host debug counters: op `pick` chưa có chỗ hiện
- CLAUDE.md "Host debug view shows estimated counters: WS messages received, SQLite rows written". `Op += 'pick'` + `maxPickOps` nhưng §H không nói ô debug / `QuotaCounters` có đếm `pick` bị bỏ; thêm `refused` (đã có cho tooFast?) hoặc chỉ ghi "đếm chung messages" cho rõ.

### M8 (NHỎ) – Kiểm thử còn thiếu
- Hai đội cùng bước louvre: thẻ đội B không chứa `picks` / `hintCorrect` / `attempts` của A (§C nêu test rò nhưng với **một** đội).
- `pick` / `lock` / `view` khi `lobby` / `paused` / `finished` → notice, 0 dòng (D24; §E nêu, §I không test).
- Feed tới **Host** socket + tới đội đã về đích / chưa tới bước (broadcast) – test một đội ở bước 1 nhận feed.
- `welcome.feed` sau evict giữ đúng thứ tự thời gian (`ORDER BY t DESC` rồi đảo).
- `media`: 23 ảnh **không** tải được bởi đội khác chưa tới bước (test §I chỉ "404 trước khi mở hòm Louvre" của cùng đội).
- `sim`: với x sống, bot nên **không** dùng x (giữ kịch bản sai → chờ → đúng từ `answersOf`) để `rowsPerTeam` so được với ước tính §D.

### M9 (NHỎ) – Bundle / hiệu năng sau B3: 23 tệp tĩnh cần nghiệm thu đo được
- Ảnh thành static asset nên mục "quota ảnh" của §K biến mất, thay bằng: tổng `client/public/art/` ≤ 8 MB, mỗi tệp ≤ 300 KB (WebP ≤ 1024 px), GLB tượng ≤ 1 MB; preset `p8b-room` đo `calls` ≤ +40 và heap; `npm run build` kiểm mỗi asset ≤ 25 MB (đã có). Thêm nghiệm thu B: vào / ra phòng 3 lần không tải lại texture (cache trong `LouvreRoom`).

## Những chỗ đã đối chiếu và thấy đủ (không cần sửa)
- Phase 8 tương thích: `taskState` giữ `active` / `locked` / `done`, không `pending` → hàng chờ Host, `stuckAlerts`, `legPenaltyLine`, D9 đếm ngược, `answerLocked`, `clueNew` tái dùng không đổi; `host_approval` bị bỏ qua có cảnh báo `leg:check`; `referenceAnswers` bỏ qua.
- Không gửi đội: 5 id, `note`, gợi ý trước mốc, lựa chọn đội khác, tọa độ ngoài vùng đã mở; test `JSON.stringify` (§C).
- SQLite trước khi trả lời; dựng lại sau evict từ `step_progress` + `events`; không bảng mới, không alarm; ngân sách §3 trong hạn (≈ 10 850 dòng, ≈ 37 500 request xấu nhất; B1 còn giảm).
- `maxPickOps` từ chối im lặng (người thật bấm nhanh không bị đóng socket), `lock` đếm vào `maxRaceOps`.
- Anti-teleport vào / ra phòng qua `respawn safe` sẵn có (≤ 11 m < `respawnTrust` 30); sàn kẹp trên `respawnBelow` (−40, kế hoạch ghi −35 là đủ biên).
- Phím: chỉ F (`keys.interact` đã nhiều phím), không phím cấm (§17.1–17.2); thứ tự ưu tiên F viết rõ + test `nearest`.
- Tài nguyên: không tải trước khi duyệt, `.cache/assets` không commit, bảng duyệt từng dòng (nguồn, giấy phép, dung lượng) – đúng §17.7 / §17.19 trừ S1 / B2 / B3 (đường đi R2 phải đổi thành tệp tĩnh).
- HUD, Host (ma trận, title lịch sử, 23 tên hình qua `r2Names`), sim, `leg:check` 8 luật + CLI, chặng test GIẢ, harness + thuần + preset, TODO / HANDOFF / CLAUDE.md / README / RACE_RULES / LEG_FORMAT đều có mục (chỉ thiếu các câu S5).
