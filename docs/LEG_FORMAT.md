# Cách viết file chặng đua (LEG_FORMAT)

Tài liệu cho **Host / người tổ chức** (không cần biết lập trình). Một **chặng** là toàn bộ nội dung của một cuộc đua: đội xuất phát ở đâu, đi qua những điểm nào, mật thư là gì, nhiệm vụ nào, đáp án nào. Chặng nằm trong **một file `.json`** (chữ thuần, mở được bằng Notepad / TextEdit / VS Code).

> Nội dung chặng thật chưa có trong dự án. Mọi ví dụ dưới đây là **nội dung GIẢ** (ghi "(GIẢ)") để bạn thấy dạng file. File `worker/legs/paris-demo.json` là chặng demo với các ô mật thư / nhiệm vụ **để trống** chờ bạn điền.

## 1. Quy trình 4 bước

1. **Viết file** `.json` (copy `worker/legs/test/mini.json` hoặc `worker/legs/paris-demo.json` làm mẫu rồi sửa). Để trong thư mục `worker/legs/` (không bao giờ để trong `client/`: mọi thứ trong `client/` được gửi tới máy người chơi).
2. **Kiểm tra:** mở Terminal ở thư mục dự án và chạy

   ```
   npm run leg:check -- worker/legs/ten-file-cua-ban.json
   ```

   Lệnh in ra **LỖI** (phải sửa; máy chủ sẽ từ chối), **CẢNH BÁO** (nên xem), **CÒN TRỐNG** (ô bạn chưa điền; cho phép khi soạn nháp, nhưng phải điền hết trước khi mở cuộc đua). Cuối cùng là bảng từng điểm trên bản đồ (mục 8).
3. **Sửa theo thông báo** rồi chạy lại cho tới khi dòng cuối là "Hợp lệ" và không còn LỖI. Mỗi thông báo nói rõ ở đâu ("Bước 3 (D1) › nhánh A › nhiệm vụ › tiêu đề") và sai gì; bảng ở mục 11 liệt kê các lỗi hay gặp và cách sửa.
4. **Nạp vào cuộc đua:** mở trang Host (`/host.html`, nhập mã cuộc đua), phần "Chặng": chọn file trên máy (hoặc chọn chặng đóng gói `paris-demo` / `mini`). Trang Host báo lại kết quả và danh sách ô còn trống. Sau đó **chơi thử** bằng một cuộc đua riêng (mục 2).

`leg:check` kiểm cả những thứ máy chủ không kiểm được (điểm nằm trong nhà, không đi bộ tới được, nằm giữa sông, đáp án lọt vào file tải về...). Vì vậy **luôn chạy `leg:check` trước khi nạp**.

## 2. Cuộc đua mới, nạp chặng, tạo đội, phát mã, mở

Mỗi cuộc đua có một **mã cuộc đua** (race id, ví dụ `thu`, `paris-1`; chỉ chữ thường, số, gạch ngang). Thứ tự đúng:

1. Chọn **mã cuộc đua mới** (vd. `thu` để diễn tập, `paris-1` cho buổi thật).
2. Vào Host của mã đó, **nạp chặng** (bước 4 ở trên).
3. **Tạo đội**, phát mã đăng nhập cho từng đội.
4. Khi sẵn sàng, bấm **Mở cuộc đua**; nhập **giờ xuất phát** của từng đội (giờ gõ vào được hiểu theo `timezone` của chặng, mục 3.1).

**Vì sao không đổi chặng sau khi đã có đội vào game?** Khi đội đã vào, máy chủ đã ghi vị trí xuất phát, thứ tự "Xuất phát ở vị trí thứ n", tiến trình theo mã bước của chặng cũ. Đổi chặng giữa chừng để lại dữ liệu mồ côi và đội đứng sai chỗ. Máy chủ vì thế **từ chối nạp chặng khác** khi đã có đội vào game hoặc cuộc đua đã mở. Muốn đổi: **tạo cuộc đua mới (mã mới)** và làm lại từ bước 1. Diễn tập hãy dùng một mã riêng, đừng dùng mã đội của buổi thật.

## 3. Cấu trúc file

```
{
  "id": "...", "title": "...",           ← bắt buộc
  "start": { ... },                      ← bắt buộc: nơi xuất phát
  "steps": [ ... ],                      ← bắt buộc: danh sách bước, theo thứ tự
  ... các khối cài đặt (có sẵn giá trị mặc định, thường không cần viết)
}
```

Quy tắc viết JSON: chữ nằm trong dấu ngoặc kép `"..."`; số không có ngoặc kép; các mục cách nhau bằng dấu phẩy, **mục cuối không có dấu phẩy**; không có chú thích. Tên trường viết đúng chữ thường như bên dưới (gõ sai tên trường bị báo "có trường lạ").

### 3.1 Các trường ngoài cùng

| Trường | Bắt buộc? | Mặc định | Ý nghĩa, ví dụ |
|---|---|---|---|
| `id` | có | | Mã chặng: chữ thường a–z, số, gạch ngang, ≤ 32 ký tự, không bắt đầu bằng gạch ngang. `"paris-1"` |
| `title` | có | | Tên chặng (hiện cho Host). `"Chặng Paris 2026"` |
| `timezone` | không | `"Asia/Ho_Chi_Minh"` | Múi giờ để **hiểu giờ xuất phát Host gõ vào** (Host ở đâu cũng được). Ví dụ giờ Paris: `"Europe/Paris"`. Sai tên: `leg:check` cảnh báo |
| `start` | có | | Nơi xuất phát, mục 4 |
| `steps` | có | | Các bước, mục 5 (1–60 bước) |
| `eliminationLeg` | không | `false` | `true` = chặng có loại đội cuối (xử lý ở phase sau) |
| `mapLabels` | không | `"streets-only"` | `"streets-only"` bản đồ chỉ ghi tên đường; `"all"` ghi cả tên địa danh (gợi ý đáp án, thường để mặc định) |
| `presence` | không | `{renderRadius 300, showOthersOnMinimap false}` | `renderRadius`: thấy đội khác trong bao nhiêu mét; `showOthersOnMinimap`: hiện đội khác trên bản đồ nhỏ không |
| `boxReveal` | không | `{radius 150, hysteresis 20}` | Hộp mật thư kế tiếp chỉ hiện (và máy chủ chỉ gửi tọa độ) khi đội cách hộp ≤ `radius` m; xa quá `radius + hysteresis` thì ẩn lại |
| `penalties` | không | `{walkOnlyViolationMinutes 15, quitTaskMinutes 30}` | Số phút phạt (phase sau áp dụng) |
| `movement` | không | `{footSpeed 4, bikeSpeedMultiplier 1.3}` | Tốc độ đi bộ tối đa (m/s) và hệ số xe đạp so với đi bộ (dùng để phát hiện gian lận tốc độ) |
| `vehicles` | không | xem dưới | Xe đạp dùng chung trên đường |
| `clueBook` | không | `{showLockedSlots false}` | `true` = Sổ mật thư hiện cả ô khóa của bước chưa tới (không khuyến khích: lộ số bước) |
| `hostApproval` | không | `{contactLabel "Gửi bài qua Facebook cho Host", contactUrl "", approvalWaitCounts false}` | Cho nhiệm vụ Host duyệt: chữ trên nút, **link nhận bài** (bắt buộc điền nếu có nhiệm vụ `host_approval`, vd. `"https://m.me/ten-trang"`) |
| `specials` | không | `expressPass` bật, còn lại tắt | Yếu tố đặc biệt (phase 9): `uTurn`, `yield`, `fastForward`, `speedBump`, `expressPass`, mỗi cái `{ "enabled": true/false }` |

`vehicles` (mặc định = chặng demo, hiếm khi cần sửa): `corridorMeters 150` (xe chỉ đặt cách đường đi dự kiến ≤ ngần này), `minDistanceFromCheckpoint 100` (xe không đặt gần điểm nhận mật thư), `initialPerSegment [0, 1]`, `spawnIntervalMinutes 3`, `spawnChance 0.3`, `maxAvailablePerSegment 1`, `decoyRatio 0.4`, `noSpawnNearPlayerMeters 120`, `abandonMeters 200`, `abandonSeconds 60` (xe bị bỏ lại > 200 m trong 60 s thì thu hồi), `bikeParking { offsetMeters 20, maxBikes 6 }` (bãi xe cạnh điểm: mục 7).

## 4. `start`: nơi xuất phát

Mọi đội **vào game ở đây** (thế giới không có xuất phát cố định trong mã nguồn). Các đội vào cùng lúc được rải quanh điểm để khỏi đứng chồng.

| Trường | Bắt buộc? | Mặc định | Ý nghĩa |
|---|---|---|---|
| `name` | có | | Tên chỗ (chỉ Host thấy). `"Cầu Bir-Hakeim – giữa cầu"` |
| `lat`, `lon` | có | | Vĩ độ, kinh độ, dùng **dấu chấm**: `48.85569`, `2.28758` |
| `yawDeg` | không | `0` | Hướng nhìn lúc vào: 0 = bắc, 90 = tây (quay trái), 180 = nam, −90 = đông |
| `spreadMeters` | không | `5` | Rải các đội trong bán kính này (0–20 m) |

Điểm xuất phát cũng phải ngoài nhà và đi bộ được (`leg:check` kiểm).

## 5. Các loại bước (`steps`)

Mỗi bước có `id` (tên ngắn, chữ + số, gạch ngang / dưới, ≤ 16 ký tự, **không trùng**), `type`, `label` (tên bước, Host thấy; đội không thấy số bước). Có **4 loại**; trò chơi này **không có** Vượt rào (roadblock): ghi `"type": "roadblock"` sẽ bị báo lỗi.

### 5.1 `route_info`: Lộ trình

Đội nhận mật thư chỉ đường tới một **điểm đến**; tới nơi (vào vùng) thì mở hộp, nhận bước kế.

| Trường | Bắt buộc? | Mặc định | Ý nghĩa |
|---|---|---|---|
| `clue` | có (có thể `""` khi soạn nháp: báo "CÒN TRỐNG") | | Mật thư đội đọc. Không viết đáp án của nhiệm vụ vào đây |
| `transport` | không | `{"allowed": "any"}` | `{"allowed": "any"}` tự chọn đi bộ / xe; `{"mandatory": "walk"}` **bắt buộc đi bộ** trên lộ trình này (không nhận được xe) |
| `destination` | có | | Điểm đến, mục 7 |

### 5.2 `challenge`: Thử thách

Đội làm một nhiệm vụ. Làm **ngay tại điểm vừa tới**, hoặc tại một nơi khác nếu `task.location` có giá trị.

| Trường | Bắt buộc? | Mặc định | Ý nghĩa |
|---|---|---|---|
| `teaser` | không | `""` | Câu gợi ý ngắn đội đọc **trước khi nhận** thử thách (phase 8 dùng cho nút "Nhận thử thách") |
| `task` | có | | Nhiệm vụ, mục 7.1 |

### 5.3 `detour`: Lựa chọn kép

Đội chọn **một trong hai nhánh** (`branches`, đúng 2 phần tử), mỗi nhánh có nhiệm vụ riêng. Nhánh nào có `task.location` riêng thì đội phải tới đó làm.

| Trường | Bắt buộc? | Mặc định | Ý nghĩa |
|---|---|---|---|
| `clue` | không | `""` | Lời dẫn chung cho lựa chọn |
| `branches[].id` | có | | Mã nhánh, thường `"A"`, `"B"` (hai nhánh khác nhau) |
| `branches[].name` | không | `""` | Tên nhánh đội thấy khi chọn |
| `branches[].summary` | không | `""` | Mô tả ngắn (không lộ đáp án) |
| `branches[].task` | không | nhiệm vụ trống | Nhiệm vụ, mục 7.1 |

### 5.4 `pit_stop`: Chặng dừng (về đích)

Có **đúng một** và **phải là bước cuối cùng**. Đội tới thảm đỏ thì về đích. Chỉ có `destination` (mục 7).

## 6. Luật thứ tự

- Bước **đầu tiên** phải là `route_info`: mật thư đầu tiên **được phát ngoài game** (đội chưa vào game khi nhận), vì vậy bước 1 là "đi tới điểm đầu" từ chỗ xuất phát.
- **Một** `pit_stop`, ở cuối; bước **ngay trước** nó phải là `route_info` (lộ trình dẫn tới thảm). Lộ trình cuối này hoàn thành ngay khi đội vào vùng Chặng dừng, nên điểm đến của nó nên **trùng** điểm Chặng dừng (lệch > 5 m thì cảnh báo).
- Các bước khác (`challenge`, `detour`, `route_info`) xen kẽ tùy ý. `id` không trùng.
- Hộp mật thư bước N+1 chỉ xuất hiện khi bước N đã xong ở điểm của nó; tọa độ hộp chỉ tới máy đội khi họ cách hộp ≤ `boxReveal.radius` (150 m).
- Giờ nghỉ khi Host tạm dừng cuộc đua **không** bị trừ khỏi đồng hồ đội.

## 7. Điểm đến, vùng và bãi xe (`destination`, `task.location`)

Điểm đến và `task.location` có cùng dạng:

| Trường | Bắt buộc? | Ý nghĩa |
|---|---|---|
| `name` | có | Tên chỗ, **chỉ Host thấy**. Không bao giờ hiện cho đội trước khi họ làm xong bước (không phải đáp án của mật thư). `"Sân trước Palais de Chaillot"` |
| `lat`, `lon` | có | Tọa độ tâm (dùng dấu chấm) |
| `radius` | có | **Bán kính vùng, 15–40 m.** Đứng trong vòng tròn này = "đã tới điểm" (mở được hộp). Điểm đến là quảng trường lớn: 35–40; ngõ nhỏ: 15–20 |
| `bikeParking` | không | `{ "lat": ..., "lon": ... }`: bãi xe đạp **cạnh điểm** (mục dưới) |

**Đặt điểm ở đâu:** vỉa hè, quảng trường, bờ sông, giữa cầu; **không bao giờ trong nhà** (tâm trong một tòa nhà bị báo LỖI), và phải có đường bộ gần để đội đi tới (không thì LỖI "không đi bộ tới được"). Nên **không đặt trên cầu cạn đường sắt / nóc ga metro** (cảnh báo "cầu trên đất liền") và không giữa sông.

**Bãi xe (`bikeParking`):** khi đội làm xong bước ở điểm này và nhận mật thư kế là *nhiệm vụ tại điểm* hoặc *lộ trình bắt buộc đi bộ*, xe họ đang đi được **để lại ở bãi của điểm đó** (đứng thành hàng, tối đa `vehicles.bikeParking.maxBikes` xe). Quy tắc chi tiết:
- Bãi theo **điểm** (tâm vùng), không theo bước: nhiều bước cùng một điểm dùng chung một bãi.
- Nhiệm vụ ở **nơi khác** (`task.location`): xe chỉ để lại khi đội **tới vùng** nhiệm vụ đó (đội đạp xe tới đó làm), tại bãi của `task.location`.
- Không viết `bikeParking`: xe bị bỏ lại đúng chỗ đội đứng (không lỗi).
- Nên đặt bãi **cạnh nhưng ngoài vùng** (khoảng `radius + 20` m); trong vùng thì `leg:check` cảnh báo; trong nhà thì LỖI. `leg:check` gợi ý sẵn tọa độ bãi xe có thật trong dữ liệu bản đồ.

### 7.1 `task`: nhiệm vụ

| Trường | Bắt buộc? | Mặc định | Ý nghĩa |
|---|---|---|---|
| `title` | không (trống = CÒN TRỐNG) | `""` | Tiêu đề nhiệm vụ |
| `description` | không (trống = CÒN TRỐNG) | `""` | Đề bài đội đọc. **Không chứa đáp án** |
| `media` | không | `[]` | Danh sách **link công khai** ảnh / video minh họa: `["https://..."]`. Phase này chỉ link công khai có sẵn; lưu file trên R2 làm ở Phase 10 |
| `location` | không | `null` | `null` = làm tại điểm vừa tới; hoặc một khối điểm như ở đầu mục 7 (tên, tọa độ, vùng, bãi xe) = đội phải tới đó làm |
| `kind` | không | `"answer"` | Kiểu nhiệm vụ, xem dưới |
| `verification` | không | `"auto"` | `"auto"` = máy so đáp án; `"host_approval"` = Host duyệt bài đội gửi |
| `answers` | khi `auto` (trống = CÒN TRỐNG) | `[]` | Các đáp án chấp nhận (không phân biệt hoa thường, dấu, khoảng trắng thừa: `"Bảy"`, `"BAY"`, `"bảy "` coi như nhau). `["7", "bảy"]` |
| `proofInstruction` | khi `host_approval` | `""` | Hướng dẫn đội gửi bài (vd. "Chụp ảnh và gửi Facebook cho Host") |
| `timeLimitMinutes` | không | `null` | Giới hạn thời gian làm (phút), số dương; `null` = không giới hạn |
| `params` | không | (không có) | Tham số mini-game cho các kiểu khác (vị trí vật, ảnh đích, hướng...). Lưu nguyên, **chưa kiểm** và **không gửi** cho đội ở Phase 7 |

**Kiểu nhiệm vụ (`kind`)**: `answer` (trả lời bằng chữ), `free` (nộp ảnh / bài cho Host duyệt), `find_objects`, `delivery`, `observe_answer`, `cipher`, `photo_match`, `binocular_scan`, `timed_drive`, `memory_ui`. Ở **Phase 7 chỉ `answer` và `free` đầy đủ**; trong lúc chơi thử, mọi nhiệm vụ đều có nút "Hoàn thành (tạm)". Với kiểu khác, hãy mô tả cách chơi trong `description`, đặt tham số (nếu đã biết) vào `params`: file vẫn hợp lệ và Phase 8 sẽ dùng tiếp, **không cần viết lại**. `kind: "free"` với `verification: "auto"` bị cảnh báo (không có đáp án để chấm): dùng `host_approval`.

## 8. Cách lấy tọa độ và xem điểm đã đặt đúng chỗ chưa

**Lấy tọa độ**
- *Google Maps:* chuột phải vào chỗ cần đặt, dòng đầu tiên của menu là tọa độ (`48.8583, 2.2945`); bấm vào để copy. Số đầu là `lat`, số sau là `lon`.
- *OpenStreetMap (openstreetmap.org):* chuột phải → "Show address" / bấm "Share", hoặc đọc trên thanh địa chỉ `#map=19/48.85830/2.29450`.
- Dùng **dấu chấm** thập phân, 5 chữ số sau dấu chấm là đủ (≈ 1 m). Dấu phẩy ("48,85") làm hỏng file.
- Đặt ở vỉa hè / giữa quảng trường, **không phải tâm tòa nhà**; kiểm tra vị trí trên bản đồ vệ tinh.

**Xem điểm đã đặt (vì chưa có trình soạn bản đồ, làm ở Phase 10):** sau mỗi lần `npm run leg:check`, bảng cuối in **từng điểm** (xuất phát, mỗi bước, nơi riêng của từng nhánh, kèm đường đi bộ ước tính từ điểm trước):

```
• Bước 2 (T1, challenge): Vườn Trocadéro (phía dưới) — vùng 30 m — đi bộ ≈ 340 m từ điểm trước
    Avenue Albert 1er de Monaco, Quận 16 — 48.86050, 2.29030
    Bản đồ: https://www.openstreetmap.org/?mlat=48.86050&mlon=2.29030#map=19/48.86050/2.29030
    Xem: npm run screenshot -- --path "/preview.html?at=48.8605,2.2903&r=80" --name leg-T1
```

- **Tên đường + quận** cho biết ngay nếu gõ nhầm số (nhầm 2 chữ số vẫn nằm trong bản đồ nhưng sai tên đường / quận).
- **Link `Bản đồ:`** mở OpenStreetMap có ghim đúng điểm.
- **Dòng `Xem:`** là lệnh sẵn: copy, dán vào Terminal, chạy → tạo ảnh `screenshots/leg-<mã bước>.png` chụp khu vực 80 m quanh điểm trong thế giới 3D của game.
- "đi bộ ≈ N m": quãng đường đi bộ thật theo đồ thị đường. Quá dài so với dự kiến = điểm sai chỗ. "KHÔNG đi bộ tới được" = LỖI.

## 9. Đáp án nằm đâu, và không bao giờ tới máy người chơi

- Mật thư, nhiệm vụ, **đáp án**, tên điểm đến đều chỉ nằm ở **máy chủ** (trong file chặng được nạp từ Host). Máy người chơi chỉ nhận **thẻ đã lọc** (mật thư của bước hiện tại, mô tả nhiệm vụ đã mở); đáp án **không bao giờ** được gửi xuống: người chơi gõ câu trả lời, máy chủ trả lời đúng / sai.
- Vì vậy **không bỏ file chặng vào thư mục `client/`** (`client/public`, `client/dist`): mọi thứ ở đó được tải về máy người chơi. `leg:check` quét hai thư mục này và báo LỖI nếu có chuỗi mật thư / đáp án (từ 12 ký tự) lọt vào.
- File nằm ngoài `worker/legs/` bị cảnh báo; hãy để chặng thật ở `worker/legs/` (hoặc giữ ngoài kho mã và chỉ chọn file khi nạp ở trang Host).
- Đáp án **không được xuất hiện** trong chữ đội đọc trước khi giải (mật thư, tiêu đề, mô tả, gợi ý): `leg:check` cảnh báo nếu thấy (đáp án từ 3 ký tự).
- **Đáp án phải dựa trên thứ có trong game** (chữ trên biển tên đường, hình dáng công trình, số trên tượng...). Game dựng từ dữ liệu OpenStreetMap: không có biển hiệu cửa hàng, thực đơn, chữ trong nhà, hoặc vật mà bản đồ không có. Hãy **vào game đứng ở đó** kiểm tra đáp án có thấy được không trước khi chốt.

## 10. Ví dụ đầy đủ

Chặng `mini` (`worker/legs/test/mini.json`, **nội dung GIẢ**) dùng đủ mọi dạng: lộ trình thường, lộ trình bắt buộc đi bộ, thử thách làm ở nơi khác (có bãi xe), lựa chọn kép trong đó nhánh B có nơi riêng, bãi xe ở điểm L1, `teaser`, `media`, `timeLimitMinutes`, Host duyệt, Chặng dừng. `npm run leg:check -- worker/legs/test/mini.json` ra "Hợp lệ", không cảnh báo. Chặng `near` (`worker/legs/test/near.json`, các điểm cách nhau vài chục mét quanh Concorde, `boxReveal` nhỏ) dùng để chạy thử nhanh. Mọi trường không viết thì lấy giá trị mặc định ở mục 3.1, nên file ngắn.

```json
{
  "id": "mini",
  "title": "Chặng ngắn để test (NỘI DUNG GIẢ)",
  "hostApproval": {
    "contactUrl": "https://m.me/test-host-gia"
  },
  "start": {
    "name": "Cầu Bir-Hakeim – giữa cầu",
    "lat": 48.85569,
    "lon": 2.28758,
    "yawDeg": 33,
    "spreadMeters": 5
  },
  "steps": [
    {
      "id": "L1",
      "type": "route_info",
      "label": "Lộ trình 1",
      "clue": "(GIẢ) Lên quảng trường có tầm nhìn đẹp nhất ra 'bà đầm sắt'.",
      "destination": {
        "name": "Sân trước Palais de Chaillot",
        "lat": 48.86215,
        "lon": 2.28843,
        "radius": 35,
        "bikeParking": {
          "lat": 48.8625,
          "lon": 2.2878
        }
      }
    },
    {
      "id": "T1",
      "type": "challenge",
      "label": "Thử thách 1",
      "task": {
        "title": "(GIẢ) Câu hỏi ở vườn Trocadéro",
        "description": "(GIẢ) 6 × 7 = ?",
        "media": [
          "https://example.invalid/gia/vuon-trocadero.jpg"
        ],
        "location": {
          "name": "Vườn Trocadéro (phía dưới)",
          "lat": 48.8605,
          "lon": 2.2903,
          "radius": 30,
          "bikeParking": {
            "lat": 48.8601,
            "lon": 2.2899
          }
        },
        "answers": [
          "42"
        ],
        "timeLimitMinutes": 10
      },
      "teaser": "(GIẢ) Đi xuống vườn, tìm chỗ có tiếng nước."
    },
    {
      "id": "L2",
      "type": "route_info",
      "label": "Lộ trình 2",
      "clue": "(GIẢ) Qua sông, tới chân tháp. Bắt buộc: đi bộ.",
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
      "id": "D1",
      "type": "detour",
      "label": "Lựa chọn kép",
      "clue": "(GIẢ) Chọn một trong hai.",
      "branches": [
        {
          "id": "A",
          "name": "Tính",
          "summary": "(GIẢ) Một phép tính.",
          "task": {
            "title": "(GIẢ) Phép tính",
            "description": "(GIẢ) 3 + 4 = ?",
            "answers": [
              "7",
              "bảy"
            ]
          }
        },
        {
          "id": "B",
          "name": "Ảnh",
          "summary": "(GIẢ) Gửi ảnh cho Host.",
          "task": {
            "title": "(GIẢ) Ảnh",
            "description": "(GIẢ) Chụp màn hình dưới chân tháp.",
            "kind": "free",
            "verification": "host_approval",
            "proofInstruction": "(GIẢ) Gửi ảnh qua Facebook.",
            "location": {
              "name": "Bãi cỏ Champ de Mars",
              "lat": 48.8562,
              "lon": 2.2978,
              "radius": 30,
              "bikeParking": {
                "lat": 48.8558,
                "lon": 2.2972
              }
            }
          }
        }
      ]
    },
    {
      "id": "L3",
      "type": "route_info",
      "label": "Lộ trình 3",
      "clue": "(GIẢ) Chặng dừng ở giữa cây cầu nối tháp với quảng trường.",
      "destination": {
        "name": "Giữa cầu Iéna",
        "lat": 48.8596,
        "lon": 2.29243,
        "radius": 25
      }
    },
    {
      "id": "PS",
      "type": "pit_stop",
      "label": "Về đích",
      "destination": {
        "name": "Giữa cầu Iéna",
        "lat": 48.8596,
        "lon": 2.29243,
        "radius": 25
      }
    }
  ]
}
```

Lưu ý khi viết chặng thật từ mẫu này: bước 1 (`L1`) là mật thư **phát ngoài game** cho các đội (ghi trong `clue` để Host có bản lưu); mật thư các bước sau chỉ hiện trong game khi đội mở hộp. Chặng demo `paris-demo.json` có sẵn 10 bước với các điểm kiểm thử của dự án và mật thư / nhiệm vụ để trống: điền `clue`, `title`, `description`, `answers`... rồi chạy `leg:check`.

## 11. Bảng thông báo hay gặp → cách sửa

Mỗi dòng của `leg:check` có dạng `MỨC  Ở-ĐÂU: nội dung`. "Ở đâu" đếm bước từ 1 theo thứ tự trong file.

| Thông báo (rút gọn) | Mức | Nghĩa và cách sửa |
|---|---|---|
| `không phải JSON hợp lệ ... (dòng X, cột Y)` | LỖI | Sai cú pháp JSON; xem mục 12 |
| `... bị thiếu` | LỖI | Thiếu một trường bắt buộc (vd. `id`, `start`, `destination`, `lat`): thêm vào |
| `phải là một số` / `chữ (trong dấu ngoặc kép)` / `true hoặc false` | LỖI | Sai kiểu: số không đặt trong ngoặc kép; chữ phải có ngoặc kép; `true`/`false` không ngoặc |
| `có trường lạ: "xyz" (gõ sai tên trường?)` | LỖI | Tên trường không có; sửa chính tả theo mục 3 – 7 |
| `loại bước "roadblock" không có; chỉ dùng: ...` | LỖI | Chỉ dùng `route_info`, `detour`, `challenge`, `pit_stop` |
| `bán kính ... phải ≤ 40 m (bán kính 15–40 m)` / `≥ 15 m` | LỖI | Đưa `radius` vào khoảng 15–40 |
| `mã "L2" trùng với một bước khác` | LỖI | Đổi `id` của một bước |
| `bước đầu tiên phải là lộ trình (route_info)` | LỖI | Đưa một `route_info` lên đầu |
| `phải có đúng một Chặng dừng (pit_stop) và nó là bước cuối cùng` | LỖI | Thêm / bớt `pit_stop`, chuyển xuống cuối |
| `bước ngay trước Chặng dừng phải là lộ trình` | LỖI | Chèn một `route_info` dẫn tới thảm ngay trước `pit_stop` |
| `... nằm ngoài bản đồ đua (vĩ độ ..., kinh độ ...)` | LỖI | Tọa độ sai (thường nhầm lat/lon hoặc dấu): kiểm tra lại, lat ≈ 48.8, lon ≈ 2.3 |
| `tâm vùng nằm trong một tòa nhà (...)` / `nằm trong một tòa nhà` | LỖI | Dời điểm ra vỉa hè / quảng trường; xem ảnh lệnh `Xem:` |
| `không đi bộ tới được từ ... theo đồ thị đường` | LỖI | Điểm ở cù lao, sân trong, nóc cầu... không có đường đi bộ nối; dời về chỗ có đường |
| `bãi xe nằm trong một tòa nhà` | LỖI | Dời `bikeParking` ra vỉa hè |
| `chứa nguyên văn "..." của chặng` (tên file `client/...`) | LỖI | Chặng / mật thư đang nằm trong `client/`; xóa khỏi đó |
| `bãi xe cách tâm N m, nằm trong vùng` | CẢNH BÁO | Dời bãi xe ra ngoài vùng (≈ bán kính + 20 m) |
| `đường đi bộ gần nhất cách tâm N m, xa hơn bán kính` | CẢNH BÁO | Đường đi bộ ở xa tâm: đội phải ra khỏi vùng để tới đường; dời tâm gần đường hơn |
| `cách thảm Chặng dừng N m ...` | CẢNH BÁO | Điểm đến của lộ trình cuối nên trùng điểm Chặng dừng |
| `chứa đáp án "..." của bước N` | CẢNH BÁO | Đáp án bị lộ trong chữ đội đọc trước; sửa chữ |
| `nhiệm vụ "free" không tự chấm được` | CẢNH BÁO | Đổi sang `"verification": "host_approval"` |
| `nằm giữa mặt nước (sông)` | CẢNH BÁO | Dời vào bờ hoặc lên cầu |
| `nằm trên một cây cầu ... không bắc qua sông` | CẢNH BÁO | Có thể là cầu cạn đường sắt / metro: kiểm tra link bản đồ; đặt xuống mặt đường |
| `"..." không phải múi giờ hợp lệ` | CẢNH BÁO | Dùng tên chuẩn như `Asia/Ho_Chi_Minh`, `Europe/Paris` |
| `file nằm ngoài worker/legs/` | CẢNH BÁO | Chuyển file vào `worker/legs/` |
| `... còn trống` (mật thư, tiêu đề, đáp án, link Facebook...) | CÒN TRỐNG | Ô bạn chưa điền; cho phép khi soạn nháp, phải điền trước khi mở cuộc đua |
| `KHÔNG hợp lệ: N lỗi` (dòng cuối) | | Còn lỗi: máy chủ không nạp file này |

## 12. Lỗi JSON hay gặp của người không lập trình

Khi file không phải JSON hợp lệ, lệnh báo **"dòng X, cột Y"** và đoán nguyên nhân. Bốn lỗi thường gặp nhất:

| Lỗi | Ví dụ sai | Đúng |
|---|---|---|
| **Dấu phẩy thập phân** | `"lat": 48,85569` | `"lat": 48.85569` (dấu chấm) |
| **Ngoặc kép cong** `“ ”` hoặc `‘ ’` (hay xảy ra khi soạn trong Word / Google Docs / Zalo) | `“id”: “mini”` | `"id": "mini"` (ngoặc kép thẳng). Hãy soạn bằng Notepad / TextEdit (chế độ văn bản thuần) / VS Code, không dùng Word |
| **Dấu phẩy thừa** ở mục cuối | `"radius": 30,` ngay trước `}` hoặc `]` | bỏ dấu phẩy ở mục cuối cùng |
| **Có chú thích** | `// ghi chú` hoặc `/* ... */` | JSON không có chú thích: xóa. Muốn ghi chú hãy dùng trường `label` |

Mẹo khác: thiếu dấu phẩy **giữa** hai mục cũng báo lỗi ở dòng kế tiếp; mỗi `{` hoặc `[` mở ra phải có `}` hoặc `]` đóng; chữ có xuống dòng phải viết `\n` chứ không nhấn Enter bên trong ngoặc kép; dấu `"` bên trong chữ phải viết `\"`.
