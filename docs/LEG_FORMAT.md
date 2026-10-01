# Cách viết file chặng đua (LEG_FORMAT)

Tài liệu cho **Host / người tổ chức** (không cần biết lập trình). Một **chặng** là toàn bộ nội dung của một cuộc đua: đội xuất phát ở đâu, đi qua những điểm nào, mật thư là gì, nhiệm vụ nào, đáp án nào. Chặng nằm trong **một file `.json`** (chữ thuần, mở được bằng Notepad / TextEdit / VS Code).

> Nội dung chặng thật chưa có trong dự án. Mọi ví dụ dưới đây là **nội dung GIẢ** (ghi "(GIẢ)") để bạn thấy dạng file. Chặng demo `worker/legs/paris-demo.json` có 6 mật thư lộ trình là **câu mẫu** lấy từ bản đặc tả (chỉ để chạy thử, không phải nội dung thật: thay hết khi viết chặng thật); các ô Lựa chọn kép / thử thách của nó **để trống** chờ bạn điền.

## 1. Quy trình 4 bước

1. **Viết file** `.json` (copy `worker/legs/test/mini.json` hoặc `worker/legs/paris-demo.json` làm mẫu rồi sửa). **Để file chặng thật NGOÀI thư mục dự án**, ví dụ `Tài liệu/chang-that/paris-1.json` (mục 9): không bao giờ trong `client/` (mọi thứ trong đó được gửi tới máy người chơi), và cũng không trong thư mục dự án (dễ bị đưa lên git cùng mã nguồn). Thư mục `worker/legs/` chỉ chứa các chặng demo / test có sẵn.
2. **Kiểm tra:** mở Terminal ở thư mục dự án và chạy (đường dẫn là chỗ file của bạn; có thể kéo thả file vào cửa sổ Terminal để dán đường dẫn)

   ```
   npm run leg:check -- ~/Documents/chang-that/paris-1.json
   ```

   Lệnh in ra **LỖI** (phải sửa; máy chủ sẽ từ chối), **CẢNH BÁO** (nên xem), **CÒN TRỐNG** (ô bạn chưa điền; cho phép khi soạn nháp, nhưng phải điền hết trước khi mở cuộc đua). Cuối cùng là bảng từng điểm trên bản đồ (mục 8). Một lần chạy liệt kê **mọi** lỗi tìm được (kể cả khi file có lỗi múi giờ hay sai thứ tự bước, phần kiểm tra bản đồ vẫn chạy); chỉ khi file sai cú pháp JSON hoặc sai dạng (thiếu trường, sai kiểu) thì lệnh dừng ở đó.
3. **Sửa theo thông báo** rồi chạy lại cho tới khi dòng cuối là "Hợp lệ" và không còn LỖI. Mỗi thông báo nói rõ ở đâu ("Bước 3 (D1) › nhánh A › nhiệm vụ › tiêu đề") và sai gì; bảng ở mục 11 liệt kê các lỗi hay gặp và cách sửa.
4. **Nạp vào cuộc đua:** mở trang Host (`/host.html`; khi chạy trên máy: `http://localhost:8787/host.html`, xem README), nhập mã cuộc đua và mật khẩu Host. Ở phần "Chặng": chọn chặng có sẵn (`paris-demo`, `paris-demo-filled`, `mini`) rồi bấm **Nạp**, hoặc **Nạp chặng từ file**: chọn file trên máy. Trang Host báo lại kết quả và danh sách ô còn trống. Sau đó **chơi thử**: tự động bằng `npm run sim` (mục 13) hoặc bằng tay với một cuộc đua riêng (mục 2).

`leg:check` kiểm cả những thứ máy chủ không kiểm được (điểm nằm trong nhà, không đi bộ tới được, nằm giữa sông, giữa lòng đường xe chạy, đáp án lọt vào file tải về...). Vì vậy **luôn chạy `leg:check` trước khi nạp**.

## 2. Cuộc đua mới, nạp chặng, tạo đội, phát mã, mở

Mỗi cuộc đua có một **mã cuộc đua** (race id, ví dụ `thu`, `paris-1`; chỉ chữ thường, số, gạch ngang). Thứ tự đúng:

1. Chọn **mã cuộc đua mới** (vd. `thu` để diễn tập, `paris-1` cho buổi thật).
2. Vào Host của mã đó, **nạp chặng** (bước 4 ở trên).
3. **Tạo đội**, phát mã đăng nhập cho từng đội. Đội vào game bằng link `…/?race=<mã cuộc đua>` (trang Host in sẵn link này) rồi nhập mã đội.
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

"Chưa có tác dụng" = file vẫn nhận và lưu giá trị, nhưng bản game hiện tại chưa dùng (làm ở phase sau): đặt thử cũng sẽ không thấy gì đổi.

| Trường | Bắt buộc? | Mặc định | Ý nghĩa, ví dụ |
|---|---|---|---|
| `id` | có | | Mã chặng: chữ thường a–z, số, gạch ngang, ≤ 32 ký tự, không bắt đầu bằng gạch ngang. `"paris-1"` |
| `title` | có | | Tên chặng (hiện cho Host). `"Chặng Paris 2026"` |
| `timezone` | không | `"Asia/Ho_Chi_Minh"` | Múi giờ để **hiểu giờ xuất phát Host gõ vào** (Host ở đâu cũng được). Viết đúng tên chuẩn dạng `Châu_lục/Thành_phố` (gọi là tên IANA): `"Asia/Ho_Chi_Minh"`, `"Europe/Paris"`. Sai tên (vd. `"Paris"`, `"UTC+7"`, `"GMT+7"`): **LỖI**, máy chủ không nạp chặng (giờ xuất phát sẽ bị hiểu sai) |
| `start` | có | | Nơi xuất phát, mục 4 |
| `steps` | có | | Các bước, mục 5 (1–60 bước) |
| `eliminationLeg` | không | `false` | `true` = chặng có loại đội cuối (chưa có tác dụng) |
| `mapLabels` | không | `"streets-only"` | `"streets-only"` bản đồ chỉ ghi tên đường; `"all"` ghi cả tên địa danh (chưa có tác dụng: bản đồ hiện luôn chỉ ghi tên đường) |
| `presence` | không | `{renderRadius 300, showOthersOnMinimap false}` | `renderRadius`: thấy đội khác trong bao nhiêu mét; `showOthersOnMinimap`: hiện đội khác trên bản đồ nhỏ không (chưa có tác dụng: bản đồ nhỏ hiện luôn không có đội khác) |
| `boxReveal` | không | `{radius 150, hysteresis 20}` | Hộp mật thư kế tiếp chỉ hiện (và máy chủ chỉ gửi tọa độ) khi đội cách hộp ≤ `radius` m; xa quá `radius + hysteresis` thì ẩn lại |
| `penalties` | không | `{walkOnlyViolationMinutes 15, quitTaskMinutes 30}` | Số phút phạt (chưa có tác dụng) |
| `movement` | không | `{footSpeed 4, bikeSpeedMultiplier 1.3}` | Tốc độ đi bộ tối đa (m/s) và hệ số xe đạp so với đi bộ (dùng để phát hiện gian lận tốc độ) |
| `vehicles` | không | xem dưới | Xe đạp dùng chung trên đường |
| `clueBook` | không | `{showLockedSlots false}` | `true` = Sổ mật thư hiện cả ô khóa của bước chưa tới (không khuyến khích: lộ số bước; chưa có tác dụng) |
| `hostApproval` | không | `{contactLabel "Gửi bài qua Facebook cho Host", contactUrl "", approvalWaitCounts false}` | Cho nhiệm vụ Host duyệt: chữ trên nút, **link nhận bài** (bắt buộc điền nếu có nhiệm vụ `host_approval`, vd. `"https://m.me/ten-trang"`; nút gửi bài cho đội làm ở phase sau), `approvalWaitCounts` = trừ thời gian chờ duyệt khỏi thời gian chính thức |
| `specials` | không | `expressPass` bật, còn lại tắt | Yếu tố đặc biệt (phase 9, chưa có tác dụng): `uTurn`, `yield`, `fastForward`, `speedBump`, `expressPass`, mỗi cái `{ "enabled": true/false }` |

`vehicles` (mặc định = chặng demo, hiếm khi cần sửa): `corridorMeters 150` (xe chỉ đặt cách đường đi dự kiến ≤ ngần này), `minDistanceFromCheckpoint 100` (xe không đặt gần điểm nhận mật thư), `initialPerSegment [0, 1]`, `spawnIntervalMinutes 3`, `spawnChance 0.3`, `maxAvailablePerSegment 1`, `decoyRatio 0.4`, `noSpawnNearPlayerMeters 120`, `abandonMeters 200`, `abandonSeconds 60` (xe bị bỏ lại > 200 m trong 60 s thì thu hồi), `bikeParking { offsetMeters 20, maxBikes 6 }` (bãi xe cạnh điểm: mục 7).

## 4. `start`: nơi xuất phát

Mọi đội **vào game ở đây** (thế giới không có xuất phát cố định trong mã nguồn). Các đội được rải quanh điểm để khỏi đứng chồng.

| Trường | Bắt buộc? | Mặc định | Ý nghĩa |
|---|---|---|---|
| `name` | có | | Tên chỗ (chỉ Host thấy). `"Cầu Bir-Hakeim – giữa cầu"` |
| `lat`, `lon` | có | | Vĩ độ, kinh độ, dùng **dấu chấm**: `48.85569`, `2.28758` |
| `yawDeg` | không | `0` | Hướng nhìn lúc vào, xem dưới |
| `spreadMeters` | không | `5` | Rải các đội trong bán kính này (0–20 m) |

**`yawDeg` chạy ngược chiều la bàn.** La bàn / Google Maps đo theo chiều kim đồng hồ (0 = bắc, 90 = đông, 180 = nam, 270 = tây); `yawDeg` thì quay sang trái (0 = bắc, 90 = tây, 180 = nam, −90 = đông). Đổi: **`yawDeg` = − (hướng la bàn)**. Ví dụ muốn đội nhìn hướng la bàn 34° (đông bắc) thì ghi `-34`; nhìn đông (90°) ghi `-90`; nhìn tây bắc (327°) ghi `-327` hoặc `33` (như nhau). `leg:check` in lại "Hướng nhìn lúc vào: la bàn N° (tên hướng)" để bạn soát.

**Chọn chỗ xuất phát:** ngoài nhà, có lối đi bộ, **không giữa lòng đường xe chạy** (`leg:check` kiểm cả ba), và **thoáng**: camera đi sau lưng đội vài mét, nên tránh sát tường, gầm vòm, cầu thang hẹp (cách ít nhất ≈ 8 m tính từ mép vùng rải). Các chặng mẫu đang xuất phát đúng tâm cầu Bir-Hakeim (`48.85569, 2.28758`), ngay miệng khối vòm đá trên đảo Île aux Cygnes: camera có thể lọt vào vòm. Với chặng thật xuất phát ở cầu Bir-Hakeim, nên dùng lối đi bộ dưới cầu cạn metro, phía bờ Passy: **`48.85585, 2.28744`** (cách vòm hơn 15 m, đã chụp kiểm tra trong game; `leg:check` không cảnh báo).

## 5. Các loại bước (`steps`)

Mỗi bước có `id` (tên ngắn, chữ + số, gạch ngang / dưới, ≤ 16 ký tự, **không trùng**), `type`, `label` (tên bước, Host thấy, và đội thấy trên thẻ mật thư, vd. "Lộ trình 2"; đội không thấy số thứ tự bước). Có **4 loại**; trò chơi này **không có** Vượt rào (roadblock): ghi `"type": "roadblock"` sẽ bị báo lỗi.

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
| `task` | không (trống = CÒN TRỐNG) | nhiệm vụ trống | Nhiệm vụ, mục 7.1 |

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

- Bước **đầu tiên** phải là `route_info`. Mật thư đầu tiên **được phát ngoài game** (đội chưa vào game khi nhận); ghi nguyên văn nó vào `clue` của bước 1 (đội cũng thấy lại nó trên thẻ mật thư và trong Sổ mật thư khi vào game). Có hai cách viết bước 1, `leg:check` và máy chủ nhận cả hai:
  - **Mật thư 1 dẫn tới chính nơi xuất phát** (vd. buổi thật: mật thư 1 phát tay dẫn các đội tới cầu Bir-Hakeim, đội vào game ở đó; hộp có "Lộ trình 2" đặt ở đó): cho `destination` của bước 1 **trùng** `start` (cùng `lat`, `lon`) và `radius` lớn hơn `spreadMeters` ít nhất 10 m (vd. 20). Đội vào game là đứng trong vùng, mở được hộp ngay. `leg:check` in dòng "Điểm xuất phát nằm trong vùng này" dưới bước 1.
  - **Mật thư 1 dẫn tới một nơi khác:** đội vào game ở `start`, rồi tự đi (trong game) tới điểm đến của bước 1.
- **Một** `pit_stop`, ở cuối; bước **ngay trước** nó phải là `route_info` (lộ trình dẫn tới thảm). Lộ trình cuối này hoàn thành ngay khi đội vào vùng Chặng dừng, nên điểm đến của nó nên **trùng** điểm Chặng dừng (lệch > 5 m thì cảnh báo).
- Các bước khác (`challenge`, `detour`, `route_info`) xen kẽ tùy ý. `id` không trùng.
- Hộp mật thư bước N+1 chỉ xuất hiện khi bước N đã xong ở điểm của nó; tọa độ hộp chỉ tới máy đội khi họ cách hộp ≤ `boxReveal.radius` (150 m).
- Giờ nghỉ khi Host tạm dừng cuộc đua **không** bị trừ khỏi đồng hồ đội.

## 7. Điểm đến, vùng và bãi xe (`destination`, `task.location`)

Điểm đến và `task.location` có cùng dạng:

| Trường | Bắt buộc? | Ý nghĩa |
|---|---|---|
| `name` | có | Tên chỗ. Của `destination`: **chỉ Host thấy**, không bao giờ hiện cho đội (không phải đáp án của mật thư). Của `task.location`: **hiện cho đội** trên thẻ nhiệm vụ ("Địa điểm: …") để đội biết đi đâu làm. `"Sân trước Palais de Chaillot"` |
| `lat`, `lon` | có | Tọa độ tâm (dùng dấu chấm). **Hộp mật thư (vật thể trong game) đứng đúng tại đây**; thảm Chặng dừng cũng vậy |
| `radius` | có | **Bán kính vùng, 15–40 m.** Đứng trong vòng tròn này = "đã tới điểm" (mở được hộp) |
| `bikeParking` | không | `{ "lat": ..., "lon": ... }`: bãi xe đạp **cạnh điểm** (mục dưới) |

**Đặt tâm ở đâu:** vỉa hè, quảng trường, bờ sông, giữa cầu (lối đi bộ); **không bao giờ trong nhà** (LỖI; `leg:check` gợi ý sẵn "điểm ngoài nhà gần nhất"), **không giữa lòng đường xe chạy** (cảnh báo: hộp sẽ đứng giữa dòng xe NPC), không giữa sông / bể nước, không trên nóc cầu cạn metro. Phải có đường đi bộ gần để đội đi tới (không thì LỖI "không đi bộ tới được").

**Chọn bán kính:**
- Vùng là **vòng tròn phẳng** quanh tâm, **không tính cao thấp**: điểm giữa cầu có lối đi bên dưới (vd. cầu Bir-Hakeim với lối Allée des Cygnes bên dưới) thì đội đứng dưới gầm cũng tính là tới; điểm trên bậc thang / sân thượng thì đứng tầng dưới cũng tính. Muốn tránh: đặt tâm xa chỗ chồng tầng hơn bán kính.
- Bán kính phải **≥ khoảng cách từ tâm tới lối đi bộ** mà đội sẽ đi tới (không thì `leg:check` cảnh báo "đường đi bộ gần nhất cách tâm N m, xa hơn bán kính": đội phải ra khỏi vùng mới tới được đường).
- Gợi ý: quảng trường lớn 35–40; sân trước một tòa nhà lớn 25–30; vỉa hè, ngõ nhỏ 15–20. Vùng được phép trùm lên tòa nhà hay sang bên kia đường: chỉ **tâm** phải ở chỗ đứng được.
- Bước 1 trùng nơi xuất phát: bán kính > `spreadMeters` + 10 (mục 6).

**Bãi xe (`bikeParking`):** khi đội làm xong bước ở điểm này và nhận mật thư kế là *nhiệm vụ tại điểm* hoặc *lộ trình bắt buộc đi bộ*, xe họ đang đi được **để lại ở bãi của điểm đó** (xếp thành một hàng, tối đa `vehicles.bikeParking.maxBikes` xe; bãi đầy thì xe để lâu nhất biến mất). Quy tắc chi tiết:
- Bãi theo **điểm** (tâm vùng), không theo bước: nhiều bước cùng một điểm dùng chung một bãi.
- Nhiệm vụ ở **nơi khác** (`task.location`): xe chỉ để lại khi đội **tới vùng** nhiệm vụ đó (đội đạp xe tới đó làm), tại bãi của `task.location`.
- Không viết `bikeParking`: xe bị bỏ lại đúng chỗ đội đứng (không lỗi).
- Nên đặt bãi **cạnh nhưng ngoài vùng** (khoảng `radius + 20` m); trong vùng thì `leg:check` cảnh báo; trong nhà hoặc ngoài bản đồ đua thì LỖI. `leg:check` in tọa độ bãi bạn đã đặt (kèm khoảng cách tới tâm) và gợi ý sẵn tọa độ bãi xe có thật trong dữ liệu bản đồ cho điểm chưa có bãi.

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
| `timeLimitMinutes` | không | `null` | Giới hạn thời gian làm (phút), số dương; `null` = không giới hạn. Hiện tại chỉ hiện chữ "giới hạn N phút" trên thẻ, chưa tính giờ |
| `params` | không | (không có) | Tham số mini-game cho các kiểu khác (vị trí vật, ảnh đích, hướng...). Lưu nguyên, **chưa kiểm** và **không gửi** cho đội ở Phase 7 |

**Kiểu nhiệm vụ (`kind`)**: `answer` (trả lời bằng chữ), `free` (nộp ảnh / bài cho Host duyệt), `find_objects`, `delivery`, `observe_answer`, `cipher`, `photo_match`, `binocular_scan`, `timed_drive`, `memory_ui`. Ở **Phase 7 chỉ `answer` và `free` đầy đủ**; trong lúc chơi thử, mọi nhiệm vụ đều có nút "Hoàn thành (tạm)". Với kiểu khác, hãy mô tả cách chơi trong `description`, đặt tham số (nếu đã biết) vào `params`: file vẫn hợp lệ và Phase 8 sẽ dùng tiếp, **không cần viết lại**. `kind: "free"` với `verification: "auto"` bị cảnh báo (không có đáp án để chấm): dùng `host_approval`.

## 8. Cách lấy tọa độ và xem điểm đã đặt đúng chỗ chưa

**Lấy tọa độ**
- *Google Maps:* chuột phải vào chỗ cần đặt, dòng đầu tiên của menu là tọa độ (`48.8583, 2.2945`); bấm vào để copy. Số đầu là `lat`, số sau là `lon`. **Đừng bấm vào tên địa danh**: ghim của một địa danh thường nằm **trong** tòa nhà; hãy chuột phải lên vỉa hè / sân trước.
- *OpenStreetMap (openstreetmap.org):* chuột phải → "Show address" / bấm "Share", hoặc đọc trên thanh địa chỉ `#map=19/48.85830/2.29450`.
- Dùng **dấu chấm** thập phân, 5 chữ số sau dấu chấm là đủ (≈ 1 m). Dấu phẩy ("48,85") làm hỏng file.

**Xem điểm đã đặt (vì chưa có trình soạn bản đồ, làm ở Phase 10):** sau mỗi lần `npm run leg:check`, bảng cuối in **từng điểm** (xuất phát, mỗi bước, nơi riêng của từng nhánh, kèm đường đi bộ ước tính từ điểm trước). Ví dụ thật của `mini`:

```
• Bước 2 (T1, challenge): Vườn Trocadéro (phía dưới) — vùng 30 m — đi bộ ≈ 340 m từ điểm trước
    Avenue Albert 1er de Monaco, Quận 16 — 48.86050, 2.29030
    Bãi xe: 48.86010, 2.28990 (cách tâm 53 m)
    Bản đồ: https://www.openstreetmap.org/?mlat=48.86050&mlon=2.29030#map=19/48.86050/2.29030
    Vệ tinh: https://www.google.com/maps?q=48.86050,2.29030&t=k&z=19
    Xem: npm run screenshot -- --path "/?cam=-2263.6,55.3,586.3,0,-60&boxes=T1,-2263.6,553.8&mat&npc=0" --name leg-T1
    Trong game: http://localhost:5173/?start=-2263.6,553.8,0&boxes=T1,-2263.6,553.8
```

- **Tên đường + quận** cho biết ngay nếu gõ nhầm số (nhầm 2 chữ số vẫn nằm trong bản đồ nhưng sai tên đường / quận).
- **`Bãi xe:`** tọa độ bãi bạn đã đặt và khoảng cách tới tâm (điểm chưa có bãi: dòng "Gợi ý bãi xe" hoặc "Chưa có bãi xe").
- **Link `Bản đồ:`** mở OpenStreetMap (bản đồ vẽ) có ghim đúng điểm.
- **Link `Vệ tinh:`** mở Google Maps **ảnh vệ tinh** có ghim đúng điểm: thấy ngay điểm nằm trên mái nhà, trong sân, trên vỉa hè hay giữa đường.
- **Dòng `Xem:`** là lệnh sẵn: copy, dán vào Terminal, chạy (≈ 1 phút) → ảnh `screenshots/leg-<mã bước>.png` chụp **thế giới 3D của game** xiên từ trên cao, nhìn về hướng bắc, khung ≈ 160 × 105 m, **điểm nằm giữa ảnh**, đánh dấu bằng một tấm thảm đỏ viền vàng (3 × 7 m) đặt đúng tâm. Ảnh **chưa vẽ vòng bán kính**; điểm dưới mái / dưới cầu cạn thì thảm bị che (vẫn ở giữa ảnh).
- **Link `Trong game:`** để **đứng thử tại điểm**: mở một Terminal khác, chạy `npm run dev` (giữ chạy), rồi mở link trong Chrome. Bạn xuất hiện ngay tại tâm (điểm xuất phát: đúng chỗ và hướng nhìn đội đầu tiên vào game), có hộp mật thư cắm cờ (Chặng dừng: thảm đỏ). Đây là thế giới thử, không cần cuộc đua, không cần mật khẩu: đi lại bằng `W` `A` `S` `D` để xem đáp án có nhìn thấy được không. Tắt bằng `Ctrl`+`C` trong Terminal đang chạy `npm run dev`.
- "đi bộ ≈ N m": quãng đường đi bộ thật theo đồ thị đường. Quá dài so với dự kiến = điểm sai chỗ. "KHÔNG đi bộ tới được" = LỖI.

## 9. Đáp án nằm đâu, và không bao giờ tới máy người chơi

- Mật thư, nhiệm vụ, **đáp án**, tên điểm đến đều chỉ nằm ở **máy chủ** (trong file chặng được nạp từ Host). Máy người chơi chỉ nhận **thẻ đã lọc** (mật thư của bước hiện tại, mô tả nhiệm vụ đã mở); đáp án **không bao giờ** được gửi xuống: người chơi gõ câu trả lời, máy chủ trả lời đúng / sai.
- **File chặng thật để ở đâu:** **ngoài thư mục dự án** (vd. `Tài liệu/chang-that/`), rồi chọn file khi nạp ở trang Host ("Nạp chặng từ file"). `leg:check` báo theo chỗ của file:
  - ngoài thư mục dự án: không báo gì (chỗ khuyên dùng);
  - trong `client/`: **LỖI** (mọi thứ ở đó được gửi tới máy người chơi, đội đọc được đáp án);
  - chỗ khác trong thư mục dự án: CẢNH BÁO (dễ bị đưa lên git cùng mã nguồn);
  - trong `worker/legs/`: không báo (thư mục của các chặng demo / test có sẵn, nằm trong git). Đừng để chặng thật ở đây: file mới bỏ vào đây **không** tự thành "chặng có sẵn" trên trang Host, và sẽ bị đưa lên git cùng mã nguồn.
- `leg:check` cũng quét `client/public`, `client/dist` và báo LỖI nếu có mật thư / mô tả (từ 12 ký tự) lọt vào, hoặc từ 2 chuỗi bí mật nằm chung một file (bản chép của chặng). Một đáp án đơn lẻ trùng tên đường / địa danh có sẵn trong bản đồ chỉ bị CẢNH BÁO (bình thường, bỏ qua).
- Đáp án **không được xuất hiện** trong chữ đội đọc trước khi giải (mật thư, tiêu đề, mô tả, gợi ý, và tên `task.location` vì đội thấy nó): `leg:check` cảnh báo nếu thấy (đáp án từ 3 ký tự) trong mật thư, tiêu đề, mô tả, gợi ý.
- **Đáp án phải dựa trên thứ có trong game** (chữ trên biển tên đường, hình dáng công trình, số trên tượng...). Game dựng từ dữ liệu OpenStreetMap: không có biển hiệu cửa hàng, thực đơn, chữ trong nhà, hoặc vật mà bản đồ không có. Hãy **vào game đứng ở đó** (link `Trong game:` của mục 8) kiểm tra đáp án có thấy được không trước khi chốt.

## 10. Ví dụ đầy đủ

Chặng `mini` (`worker/legs/test/mini.json`, **nội dung GIẢ**) dùng đủ mọi dạng: lộ trình thường, lộ trình bắt buộc đi bộ, thử thách làm ở nơi khác (có bãi xe), lựa chọn kép trong đó nhánh B có nơi riêng, bãi xe ở điểm L1, `teaser`, `media`, `timeLimitMinutes`, Host duyệt, Chặng dừng. Mọi trường không viết thì lấy giá trị mặc định ở mục 3.1, nên file ngắn.

Kết quả `leg:check` thật của các chặng có sẵn (chạy lại được bằng `npm run leg:check -- worker/legs/test/mini.json` v.v.):

| Chặng | Dòng cuối | Các cảnh báo (bình thường, đã biết) |
|---|---|---|
| `worker/legs/test/mini.json` | `Hợp lệ: 1 cảnh báo, 0 ô còn trống.` | `điểm xuất phát: nằm trên đoạn cầu bắc qua đất (bờ / đảo)…` (tâm cầu Bir-Hakeim nằm trên đảo Île aux Cygnes: bình thường) |
| `worker/legs/paris-demo.json` | `Hợp lệ: 2 cảnh báo, 18 ô còn trống.` | cảnh báo xuất phát như `mini`; `Bước 9 (L6) › điểm đến: đường đi bộ gần nhất cách tâm 39 m, xa hơn bán kính 20 m` (điểm trước kim tự tháp Louvre đã thống nhất ở bản đặc tả; sân Cour Napoléon lát đá đi được, dữ liệu đường đi bộ chỉ có ở mép sân). 18 ô còn trống là các ô Lựa chọn kép / thử thách / link Facebook chờ bạn điền |
| `worker/legs/test/paris-demo.filled.json` (`paris-demo-filled`, demo đã điền nội dung GIẢ) | `Hợp lệ: 2 cảnh báo, 0 ô còn trống.` | hai cảnh báo như `paris-demo` |
| `worker/legs/test/near.json` (các điểm cách nhau vài chục mét quanh Concorde, `boxReveal` nhỏ, để chạy thử nhanh) | `Hợp lệ: 2 cảnh báo, 0 ô còn trống.` | `điểm xuất phát: nằm giữa lòng đường xe chạy (Avenue des Champs-Élysées)…`, `Bước 3 (L2) › điểm đến: tâm nằm giữa lòng đường xe chạy (Place de la Concorde)…` (chặng thử, cố ý đặt giữa quảng trường) |

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

Lưu ý khi viết chặng thật từ mẫu này: bước 1 (`L1`) là mật thư **phát ngoài game** cho các đội (ghi nguyên văn trong `clue`); ở `mini` nó dẫn tới một nơi khác nơi xuất phát, còn nếu mật thư 1 dẫn tới chính nơi xuất phát thì làm như mục 6. Mật thư các bước sau chỉ hiện trong game khi đội mở hộp. Chặng demo `paris-demo.json` có sẵn 10 bước với các điểm kiểm thử của dự án: thay 6 mật thư lộ trình mẫu, điền các ô trống (`clue`, `title`, `description`, `answers`...) rồi chạy `leg:check`.

## 11. Bảng thông báo hay gặp → cách sửa

Mỗi dòng của `leg:check` có dạng `MỨC  Ở-ĐÂU: nội dung`. "Ở đâu" đếm bước từ 1 theo thứ tự trong file.

| Thông báo (rút gọn) | Mức | Nghĩa và cách sửa |
|---|---|---|
| `không phải JSON hợp lệ: lỗi cú pháp (dòng X, cột Y). Có thể do: ...` | LỖI | Sai cú pháp JSON; xem mục 12 (trang Host báo đúng câu này khi nạp file) |
| `... bị thiếu` | LỖI | Thiếu một trường bắt buộc (vd. `id`, `start`, `destination`, `lat`): thêm vào |
| `phải là một số` / `chữ (trong dấu ngoặc kép)` / `true hoặc false` | LỖI | Sai kiểu: số không đặt trong ngoặc kép; chữ phải có ngoặc kép; `true`/`false` không ngoặc |
| `có trường lạ: "xyz" (gõ sai tên trường?)` | LỖI | Tên trường không có; sửa chính tả theo mục 3 – 7 |
| `loại bước "roadblock" không có; chỉ dùng: ...` | LỖI | Chỉ dùng `route_info`, `detour`, `challenge`, `pit_stop` |
| `bán kính ... phải ≤ 40 m (bán kính 15–40 m)` / `≥ 15 m` | LỖI | Đưa `radius` vào khoảng 15–40 |
| `mã "L2" trùng với một bước khác` | LỖI | Đổi `id` của một bước |
| `bước đầu tiên phải là lộ trình (route_info)` | LỖI | Đưa một `route_info` lên đầu |
| `phải có đúng một Chặng dừng (pit_stop) và nó là bước cuối cùng` | LỖI | Thêm / bớt `pit_stop`, chuyển xuống cuối |
| `bước ngay trước Chặng dừng phải là lộ trình` | LỖI | Chèn một `route_info` dẫn tới thảm ngay trước `pit_stop` |
| `múi giờ: "..." không phải múi giờ hợp lệ; dùng tên IANA ...` | LỖI | Viết đúng dạng `Châu_lục/Thành_phố`: `"Asia/Ho_Chi_Minh"`, `"Europe/Paris"` (không phải `"Paris"`, `"UTC+7"`, `"GMT+7"`); máy chủ không nạp chặng có múi giờ sai |
| `... nằm ngoài bản đồ đua (vĩ độ ..., kinh độ ...)` | LỖI | Tọa độ sai (thường nhầm lat/lon hoặc gõ thiếu / thừa số): kiểm tra lại, lat ≈ 48.8, lon ≈ 2.3. Áp dụng cho cả bãi xe (`› bãi xe`) |
| `tâm vùng nằm trong một tòa nhà (<tên địa danh>; điểm ngoài nhà gần nhất: lat, lon, cách N m, cạnh <đường>)` / `nằm trong một tòa nhà (...)` | LỖI | Dời điểm ra vỉa hè / quảng trường. Tọa độ gợi ý là chỗ đứng được gần nhất (ngoài nhà, không giữa đường, sát lối đi bộ): xem nó bằng link `Vệ tinh:` / lệnh `Xem:` rồi dùng nếu hợp |
| `không đi bộ tới được từ ... theo đồ thị đường` | LỖI | Điểm ở cù lao, sân trong, nóc cầu... không có đường đi bộ nối; dời về chỗ có đường |
| `bãi xe nằm trong một tòa nhà (...)` | LỖI | Dời `bikeParking` ra vỉa hè (có gợi ý tọa độ như trên) |
| `chứa nguyên văn "..." của chặng` (tên file `client/...`) | LỖI | Chặng / mật thư đang nằm trong `client/`; xóa khỏi đó |
| `file chặng nằm trong thư mục client/` | LỖI | Chuyển file chặng ra ngoài thư mục dự án (mục 9) |
| `bãi xe cách tâm N m, nằm trong vùng` | CẢNH BÁO | Dời bãi xe ra ngoài vùng (≈ bán kính + 20 m) |
| `đường đi bộ gần nhất cách tâm N m, xa hơn bán kính` | CẢNH BÁO | Đường đi bộ ở xa tâm: đội phải ra khỏi vùng để tới đường; dời tâm gần đường hơn hoặc tăng bán kính (mục 7) |
| `cách thảm Chặng dừng N m ...` | CẢNH BÁO | Điểm đến của lộ trình cuối nên trùng điểm Chặng dừng |
| `chứa đáp án "..." của bước N` | CẢNH BÁO | Đáp án bị lộ trong chữ đội đọc trước; sửa chữ |
| `nhiệm vụ "free" không tự chấm được` | CẢNH BÁO | Đổi sang `"verification": "host_approval"` |
| `nằm giữa sông, đội không đứng được` | CẢNH BÁO | Dời vào bờ hoặc lên mặt cầu |
| `nằm giữa mặt nước (hồ / bể nước / đài phun nước)` | CẢNH BÁO | Điểm rơi vào bể / hồ (vd. bể đài phun nước trong sân): dời ra chỗ đất cạnh đó |
| `nằm trên đoạn cầu bắc qua đất (bờ / đảo), không phải qua mặt nước` | CẢNH BÁO | Cầu vẫn có thể bắc qua sông, nhưng đúng chỗ này dưới cầu là đất. Kiểm tra đúng mặt cầu đi bộ, không phải nóc cầu cạn metro / đường sắt. Giữa cầu Bir-Hakeim trên đảo Île aux Cygnes (xuất phát, hoặc bước 1 trùng xuất phát) thì cảnh báo này là bình thường; chỉ hiện một lần cho một tọa độ |
| `tâm nằm giữa lòng đường xe chạy (<tên đường>)` / `nằm giữa lòng đường xe chạy` (điểm xuất phát) | CẢNH BÁO | Hộp mật thư / thảm sẽ đứng giữa dòng xe NPC, đội vào game giữa đường: dời tâm lên vỉa hè / quảng trường cạnh đó |
| `chứa chữ ... trùng một đáp án của chặng` | CẢNH BÁO | Đáp án trùng tên đường / địa danh có trong dữ liệu bản đồ: bình thường. Chỉ xóa nếu file đó là bản chép chặng do bạn bỏ vào `client/` |
| `file chặng nằm trong thư mục dự án` | CẢNH BÁO | Chuyển file chặng thật ra ngoài thư mục dự án (mục 9) |
| `... còn trống` (mật thư, tiêu đề, đáp án, link Facebook...) | CÒN TRỐNG | Ô bạn chưa điền; cho phép khi soạn nháp, phải điền trước khi mở cuộc đua |
| `KHÔNG hợp lệ: N lỗi` (dòng cuối) | | Còn lỗi: máy chủ không nạp file này |

## 12. Lỗi JSON hay gặp của người không lập trình

Khi file không phải JSON hợp lệ, lệnh (và trang Host khi nạp file) báo **"lỗi cú pháp (dòng X, cột Y)"** và đoán nguyên nhân sau chữ "Có thể do:". Bốn lỗi thường gặp nhất, với câu báo thật:

| Lỗi | Ví dụ sai | Câu báo | Đúng |
|---|---|---|---|
| **Dấu phẩy thập phân** | `"lat": 48,85569` | `… Có thể do: tọa độ dùng dấu phẩy thập phân (48,85): phải dùng dấu chấm (48.85)` | `"lat": 48.85569` (dấu chấm) |
| **Ngoặc kép cong** `“ ”` hoặc `‘ ’` (hay xảy ra khi soạn trong Word / Google Docs / Zalo) | `“id”: “mini”` | `… Có thể do: có dấu ngoặc kép cong “ ” (thường do copy từ Word / Google Docs): thay bằng dấu ngoặc kép thẳng "` | `"id": "mini"` (ngoặc kép thẳng). Hãy soạn bằng Notepad / TextEdit (chế độ văn bản thuần) / VS Code, không dùng Word |
| **Dấu phẩy thừa** ở mục cuối | `"radius": 30,` ngay trước `}` hoặc `]` | `… Có thể do: có dấu phẩy thừa ngay trước } hoặc ]: xóa dấu phẩy cuối cùng` | bỏ dấu phẩy ở mục cuối cùng |
| **Có chú thích** (cả dòng riêng lẫn cuối dòng) | `// ghi chú`, `"yawDeg": 33, // hướng nhìn` hoặc `/* ... */` | `… Có thể do: JSON không có chú thích (// hoặc /* */): xóa các chú thích` | JSON không có chú thích: xóa. Muốn ghi chú hãy dùng trường `label` |

Mẹo khác: thiếu dấu phẩy **giữa** hai mục cũng báo lỗi ở dòng kế tiếp; mỗi `{` hoặc `[` mở ra phải có `}` hoặc `]` đóng; chữ có xuống dòng phải viết `\n` chứ không nhấn Enter bên trong ngoặc kép; dấu `"` bên trong chữ phải viết `\"`.

## 13. Chơi thử tự động (`npm run sim`)

Sau khi `leg:check` ra "Hợp lệ", cho **bot** chơi hết chặng để chắc mọi bước đi được, mọi hộp mở được, đội về đích và có xếp hạng. Không cần chạy máy chủ hay trang Host: lệnh tự dựng một máy chủ tạm trong máy (y như máy chủ thật), nạp chặng, tạo đội bot, nhập giờ xuất phát "bây giờ", mở cuộc đua, rồi mỗi bot đi bộ theo đường đi bộ tới từng điểm, mở hộp, làm nhiệm vụ bằng đáp án đầu tiên trong file và check-in ở thảm.

```
npm run sim -- --leg ~/Documents/chang-that/paris-1.json --bots 2 --speedup 2
```

- `--leg`: đường dẫn file chặng, hoặc mã chặng có sẵn (`mini`, `paris-demo-filled`).
- `--bots`: số đội bot (2 là đủ). `--speedup 2`: nhanh gấp đôi (tối đa 2). Chặng 4 bước ≈ 2,3 km mất ≈ 7 phút ở `--speedup 2` (đo thật); lệnh tự dừng sau `--minutes` phút mô phỏng (mặc định 30) nếu bot chưa xong.
- `npm run sim -- --help` in mọi tùy chọn.
- Đọc kết quả: dòng `Chặng <mã> (N bước): 2 / 2 đội về đích · xếp hạng 2 dòng` là đạt. `← LỖI` ở cuối dòng hoặc mã thoát khác 0 = có đội không về đích / quá ngân sách ghi dữ liệu. "Thao tác bị từ chối (thử lại)" là các lần bot bấm F / gửi bài khi máy chủ chưa nhận vị trí mới nhất (thử lại là qua): chỉ đáng lo khi kèm "kẹt ở bước …". "Đội bị đánh dấu vượt tốc" khi tua nhanh là bình thường.
- Nhánh Host duyệt và các nhiệm vụ không có đáp án được bot "Hoàn thành (tạm)" như nút tạm trong game (Phase 7).

Chơi thử bằng tay (một mình đóng vai Host và đội): chạy `npm run dev:worker`, mở `http://localhost:8787/host.html` (mật khẩu Host là `HOST_PASSWORD` trong `worker/.dev.vars`, xem README), làm như mục 2 với một mã cuộc đua riêng, rồi mở link `/?race=<mã>` ở một cửa sổ khác và nhập mã đội.
