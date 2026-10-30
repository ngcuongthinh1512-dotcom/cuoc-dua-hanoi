# Cách viết file chặng đua (LEG_FORMAT)

Tài liệu cho **Host / người tổ chức** (không cần biết lập trình). Một **chặng** là toàn bộ nội dung của một cuộc đua: đội xuất phát ở đâu, đi qua những điểm nào, mật thư là gì, nhiệm vụ nào, đáp án nào. Chặng nằm trong **một file `.json`** (chữ thuần, mở được bằng Notepad / TextEdit / VS Code).

> Nội dung chặng thật chưa có trong dự án. Mọi ví dụ dưới đây là **nội dung GIẢ** (ghi "(GIẢ)") để bạn thấy dạng file. Chặng demo `worker/legs/bruxelles-demo.json` có 6 mật thư lộ trình là **câu mẫu GIẢ** về các địa danh Ma Cao (chỉ để chạy thử, không phải nội dung thật: thay hết khi viết chặng thật); các ô Lựa chọn kép / thử thách của nó **để trống** chờ bạn điền.

## 1. Quy trình 4 bước

1. **Viết file** `.json` (copy `worker/legs/test/mini.json` hoặc `worker/legs/bruxelles-demo.json` làm mẫu rồi sửa). **Để file chặng thật NGOÀI thư mục dự án**, ví dụ `Tài liệu/chang-that/macao-1.json` (mục 9): không bao giờ trong `client/` (mọi thứ trong đó được gửi tới máy người chơi), và cũng không trong thư mục dự án (dễ bị đưa lên git cùng mã nguồn). Thư mục `worker/legs/` chỉ chứa các chặng demo / test có sẵn.
2. **Kiểm tra:** mở Terminal ở thư mục dự án và chạy (đường dẫn là chỗ file của bạn; có thể kéo thả file vào cửa sổ Terminal để dán đường dẫn)

   ```
   npm run leg:check -- ~/Documents/chang-that/macao-1.json
   ```

   Lệnh in ra **LỖI** (phải sửa; máy chủ sẽ từ chối), **CẢNH BÁO** (nên xem), **CÒN TRỐNG** (ô bạn chưa điền; cho phép khi soạn nháp, nhưng phải điền hết trước khi mở cuộc đua). Cuối cùng là bảng từng điểm trên bản đồ (mục 8). Một lần chạy liệt kê **mọi** lỗi tìm được (kể cả khi file có lỗi múi giờ hay sai thứ tự bước, phần kiểm tra bản đồ vẫn chạy); chỉ khi file sai cú pháp JSON hoặc sai dạng (thiếu trường, sai kiểu) thì lệnh dừng ở đó.
3. **Sửa theo thông báo** rồi chạy lại cho tới khi dòng cuối là "Hợp lệ" và không còn LỖI. Mỗi thông báo nói rõ ở đâu ("Bước 3 (D1) › nhánh A › nhiệm vụ › tiêu đề") và sai gì; bảng ở mục 11 liệt kê các lỗi hay gặp và cách sửa.
4. **Nạp vào cuộc đua:** mở trang Host (`/host.html`; khi chạy trên máy: `http://localhost:8787/host.html`, xem README), nhập mã cuộc đua và mật khẩu Host. Ở phần "Chặng": chọn chặng có sẵn (`bruxelles-demo`, `bruxelles-demo-filled`, `mini`) rồi bấm **Nạp**, hoặc **Nạp chặng từ file**: chọn file trên máy. Trang Host báo lại kết quả và danh sách ô còn trống. Sau đó **chơi thử**: tự động bằng `npm run sim` (mục 13) hoặc bằng tay với một cuộc đua riêng (mục 2).

`leg:check` kiểm cả những thứ máy chủ không kiểm được (điểm nằm trong nhà, không đi bộ tới được, nằm giữa sông, giữa lòng đường xe chạy, đáp án lọt vào file tải về...). Vì vậy **luôn chạy `leg:check` trước khi nạp**.

## 2. Cuộc đua mới, nạp chặng, tạo đội, phát mã, mở

Mỗi cuộc đua có một **mã cuộc đua** (race id, ví dụ `thu`, `macao-1`; chỉ chữ thường, số, gạch ngang). Thứ tự đúng:

1. Chọn **mã cuộc đua mới** (vd. `thu` để diễn tập, `macao-1` cho buổi thật).
2. Vào Host của mã đó, **nạp chặng** (bước 4 ở trên).
3. **Tạo đội**, phát mã đăng nhập cho từng đội. Đội vào game bằng link `…/?race=<mã cuộc đua>` (trang Host in sẵn link này) rồi nhập mã đội.
4. Khi sẵn sàng, bấm **Mở cuộc đua**. Không cần nhập giờ xuất phát: không có đồng hồ riêng của từng đội, thứ hạng là **thứ tự về đích thực** (SPEC §17.22, §17.23).

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
| `id` | có | | Mã chặng: chữ thường a–z, số, gạch ngang, ≤ 32 ký tự, không bắt đầu bằng gạch ngang. `"macao-1"` |
| `title` | có | | Tên chặng (hiện cho Host). `"Chặng Paris 2026"` |
| `timezone` | không | `"Asia/Ho_Chi_Minh"` | Múi giờ trang Host **hiện giờ** (giờ vào game, giờ xong từng bước, giờ về đích; Host ở đâu cũng được). Viết đúng tên chuẩn dạng `Châu_lục/Thành_phố` (gọi là tên IANA): `"Asia/Ho_Chi_Minh"`, `"Europe/Paris"`. Sai tên (vd. `"Paris"`, `"UTC+7"`, `"GMT+7"`): **LỖI**, máy chủ không nạp chặng |
| `start` | có | | Nơi xuất phát, mục 4 |
| `steps` | có | | Các bước, mục 5 (1–60 bước) |
| `eliminationLeg` | không | `false` | `true` = chặng có loại đội cuối (chưa có tác dụng) |
| `mapLabels` | không | `"streets-only"` | `"streets-only"` bản đồ chỉ ghi tên đường; `"all"` ghi cả tên địa danh (chưa có tác dụng: bản đồ hiện luôn chỉ ghi tên đường) |
| `presence` | không | `{renderRadius 300, showOthersOnMinimap false}` | `renderRadius`: thấy đội khác trong bao nhiêu mét; `showOthersOnMinimap`: hiện đội khác trên bản đồ nhỏ không (chưa có tác dụng: bản đồ nhỏ hiện luôn không có đội khác) |
| `boxReveal` | không | `{radius 150, hysteresis 20}` | Hộp mật thư kế tiếp chỉ hiện (và máy chủ chỉ gửi tọa độ) khi đội cách hộp ≤ `radius` m; xa quá `radius + hysteresis` thì ẩn lại |
| `penalties` | không | `{walkOnlyViolationMinutes 15, quitTaskMinutes 30, retryLockMinutes 3, branchSwitchLockMinutes 10}` | Số phút phạt. `retryLockMinutes`: Host bấm **Phạt** một câu trả lời → đội thấy **đồng hồ đếm ngược** bấy nhiêu phút rồi mới được trả lời lại (mỗi nhiệm vụ ghi đè được bằng `task.retryLockMinutes`). `branchSwitchLockMinutes`: đội bấm **"Đổi lựa chọn kép"** → đếm ngược bấy nhiêu phút, hết giờ hòm của nhánh kia mới hiện (mỗi lần đổi phạt một lần). Dưới 1 phút: CẢNH BÁO (chỉ dùng cho chặng test). `walkOnlyViolationMinutes`, `quitTaskMinutes`: chưa có tác dụng (Phase 9). Phạt tại vạch đích (bỏ thử thách ở Lựa chọn kép) không nằm ở đây: Host nhập trên trang Host (mục 5.4) |
| `movement` | không | `{footSpeed 4, bikeSpeedMultiplier 1.3}` | Tốc độ chạy bộ tối đa (m/s; **Leg 2 Macao: 4, xe đạp 5,2**, giữ Shift ×2; Leg 1 Paris đã tăng ×1,5 = 6 / 9 theo SPEC §17.43) và hệ số xe đạp so với đi bộ (dùng để phát hiện gian lận tốc độ). Nếu file chặng có khối này, nó **ghi đè** mặc định: để tốc độ mặc định, ghi 4 / 1.3 hoặc bỏ khối |
| `vehicles` | không | xem dưới | Xe đạp dùng chung trên đường |
| `hostAlerts` | không | `{stuckMinutes 45}` | Trang Host **cảnh báo** (âm báo + dòng đỏ) khi một đội làm cùng một thử thách / nhánh quá `stuckMinutes` phút, lặp lại mỗi `stuckMinutes` phút tới khi xong. Không có gì hiện trong game: gợi ý cho đội thì Host gửi riêng qua Messenger |
| `clueBook` | không | `{showLockedSlots false}` | `true` = Sổ mật thư hiện cả ô khóa của bước chưa tới (không khuyến khích: lộ số bước; chưa có tác dụng) |
| `hostApproval` | không | `{}` | Không còn trường nào dùng. **Không cần link Facebook / Messenger của Host**: game không có nút mở Messenger, đội tự mở Messenger ở ngoài trò chơi để gửi ảnh. File cũ còn `contactUrl` / `contactLabel` / `approvalWaitCounts` vẫn nạp được, các trường này **bị bỏ qua** (không lỗi, không báo trống): không còn "thời gian chính thức" nên không còn trừ thời gian chờ duyệt (SPEC §17.23) |
| `specials` | không | `expressPass` bật, còn lại tắt | Yếu tố đặc biệt (phase 9, chưa có tác dụng): `uTurn`, `yield`, `fastForward`, `speedBump`, `expressPass`, mỗi cái `{ "enabled": true/false }` |

`vehicles` (mặc định = chặng demo, hiếm khi cần sửa): `corridorMeters 150` (xe chỉ đặt cách đường đi dự kiến ≤ ngần này), `minDistanceFromCheckpoint 100` (xe không đặt gần điểm nhận mật thư), `initialPerSegment [0, 1]`, `spawnIntervalMinutes 3`, `spawnChance 0.3`, `maxAvailablePerSegment 1`, `decoyRatio 0.4`, `noSpawnNearPlayerMeters 120`, `abandonMeters 200`, `abandonSeconds 60` (xe bị bỏ lại > 200 m trong 60 s thì thu hồi), `bikeParking { offsetMeters 20, maxBikes 6 }` (bãi xe cạnh điểm: mục 7).

## 4. `start`: nơi xuất phát

Mọi đội **vào game ở đây** (thế giới không có xuất phát cố định trong mã nguồn). Các đội được rải quanh điểm để khỏi đứng chồng.

| Trường | Bắt buộc? | Mặc định | Ý nghĩa |
|---|---|---|---|
| `name` | có | | Tên chỗ (chỉ Host thấy). `"Cầu Bir-Hakeim – lối đi bộ dưới cầu cạn metro, phía Passy"` |
| `lat`, `lon` | có | | Vĩ độ, kinh độ, dùng **dấu chấm**: `48.85585`, `2.28744` |
| `yawDeg` | không | `0` | Hướng nhìn lúc vào, xem dưới |
| `spreadMeters` | không | `5` | Rải các đội trong bán kính này (0–20 m) |

**`yawDeg` chạy ngược chiều la bàn.** La bàn / Google Maps đo theo chiều kim đồng hồ (0 = bắc, 90 = đông, 180 = nam, 270 = tây); `yawDeg` thì quay sang trái (0 = bắc, 90 = tây, 180 = nam, −90 = đông). Đổi: **`yawDeg` = − (hướng la bàn)**. Ví dụ muốn đội nhìn hướng la bàn 34° (đông bắc) thì ghi `-34`; nhìn đông (90°) ghi `-90`; nhìn tây bắc (327°) ghi `-327` hoặc `33` (như nhau). `leg:check` in lại "Hướng nhìn lúc vào: la bàn N° (tên hướng)" để bạn soát.

**Chọn chỗ xuất phát:** ngoài nhà, có lối đi bộ, **không giữa lòng đường xe chạy** (`leg:check` kiểm cả ba), và **thoáng**: camera đi sau lưng đội vài mét, nên tránh sát tường, gầm vòm, cầu thang hẹp (cách ít nhất ≈ 8 m tính từ mép vùng rải). Đừng dùng đúng tâm cầu Bir-Hakeim trên bản đồ (`48.85569, 2.28758`): đó là miệng khối vòm đá trên đảo Île aux Cygnes, camera có thể lọt vào vòm. Các chặng mẫu xuất phát ở lối đi bộ dưới cầu cạn metro, phía bờ Passy: **`48.85585, 2.28744`** (cách vòm hơn 15 m, đã chụp kiểm tra trong game; `leg:check` không cảnh báo). Chặng thật xuất phát ở cầu Bir-Hakeim nên dùng đúng điểm này.

## 5. Các loại bước (`steps`)

Mỗi bước có `id` (tên ngắn, chữ + số, gạch ngang / dưới, ≤ 16 ký tự, **không trùng**), `type`, `label` (tên bước, Host thấy, và đội thấy trên thẻ mật thư, vd. "Lộ trình 2"; đội không thấy số thứ tự bước). Có **4 loại**; trò chơi này **không có** Vượt rào (roadblock): ghi `"type": "roadblock"` sẽ bị báo lỗi.

### 5.1 `route_info`: Lộ trình

Đội nhận mật thư chỉ đường tới một **điểm đến**; tới nơi (vào vùng) thì mở hộp, nhận bước kế.

| Trường | Bắt buộc? | Mặc định | Ý nghĩa |
|---|---|---|---|
| `clue` | có (có thể `""` khi soạn nháp: báo "CÒN TRỐNG") | | Mật thư đội đọc. Không viết đáp án của nhiệm vụ vào đây |
| `transport` | không | `{"allowed": "any"}` | `{"allowed": "any"}` tự chọn đi bộ / xe; `{"mandatory": "walk"}` **bắt buộc đi bộ** trên lộ trình này (không nhận được xe) |
| `destination` | có | | Điểm đến, mục 7 |
| `media` | không | `[]` | Hình / liên kết kèm mật thư (mục 7.2) |
| `room` | không | không có | **Phòng 3D đi kèm mật thư** (Leg 3): `"hall"` = phòng hoà nhạc Henry Le Bœuf của BOZAR. Mở hòm của bước TRƯỚC (F) = nhận mật thư này **và** vào phòng (dựng dưới hòm đó); không có gì phải trả lời, đội đi lại xem phòng, **ra lúc nào cũng được** qua vòng sáng "Ra khỏi phòng" cạnh cửa (vào lại bằng F tại hòm). `"garderobe"` cũng dùng được ở đây như ở thử thách. Phải đứng ngay sau một bước có hòm (lộ trình / Lựa chọn kép), sai thì **LỖI** |

### 5.2 `challenge`: Thử thách

Đội làm một nhiệm vụ. Câu trả lời đội **gõ được ở bất kỳ đâu** sau khi thử thách bắt đầu (ô gõ trên thẻ thử thách, không cần đứng ở điểm, không cần xuống xe); mọi câu trả lời được lưu và hiện lại trên thẻ cho chính đội (mở lại bằng `Enter`; không có trong Sổ mật thư). Host duyệt / phạt trên trang Host khi `verification` là `host_approval` (mục 7.1, 7.4). Duyệt xong thì đội nhận **ngay** mật thư của bước kế (ví dụ Thử thách 2 hiện ngay khi Thử thách 1 được duyệt), không phải đi tới đâu.

`task.location` (nếu có) là nơi thẻ ghi "Địa điểm: …": nơi đội được hướng dẫn tới làm nhiệm vụ. Đội tới vùng đó thì Host thấy "đã tới" và xe của đội vào bãi của nơi đó; không có `location` = làm tại điểm vừa tới. Thử thách **không có hòm riêng** (hòm mật thư đứng ở các bước `route_info` và nhánh Lựa chọn kép), nên `yawDeg` của `task.location` ở thử thách không có tác dụng.

| Trường | Bắt buộc? | Mặc định | Ý nghĩa |
|---|---|---|---|
| `teaser` | không | `""` | Câu gợi ý ngắn đội đọc **trước khi nhận** thử thách: thẻ chỉ hiện câu này + nút **"Nhận thử thách"**; đề bài (và hình của nhiệm vụ) chỉ hiện sau khi đội bấm. `""` = đề bài hiện ngay |
| `task` | không (trống = CÒN TRỐNG) | nhiệm vụ trống | Nhiệm vụ, mục 7.1 |
| `room` | không | không có | **Thử thách chơi trong phòng 3D** (Leg 3): `"hall"` = phòng hoà nhạc BOZAR (như mục 5.1); `"garderobe"` = phòng trưng bày GardeRobe MannekenPis (4 tủ kính với 4 ảnh trang phục). Mở hòm của bước TRƯỚC (F) = nhận thẻ thử thách này **và** vào phòng (dựng dưới hòm đó); đội trả lời trên thẻ như thường (Enter mở thẻ, F cạnh tủ kính = xem gần, Esc / F quay lại), **ra khỏi phòng lúc nào cũng được** qua vòng sáng "Ra khỏi phòng" cạnh cửa và vào lại bằng F tại hòm; xong bước khi đang ở trong phòng thì mật thư kế chờ tới lúc đội đi ra. Không có tiến độ / phạt phòng. Thử thách này không có `task.location` và phải đứng ngay sau một bước có hòm, sai thì **LỖI** |

### 5.3 `detour`: Lựa chọn kép

Đội chọn **một trong hai nhánh** (`branches`, đúng 2 phần tử) trên thẻ **mở ngang** thành hai nửa (trái = nhánh A, phải = nhánh B; bấm vào nửa nào cũng được, hoặc phím `1` / `2`; bấm ở đâu cũng được). Mỗi nhánh có **hòm riêng** đứng tại `task.location` của nhánh; chỉ hòm của nhánh đã chọn hiện (theo luật 150 m như hòm mật thư). **Đề bài của nhánh nằm trong hòm**: đội chỉ đọc được `task` (tiêu đề, mô tả, hình) sau khi tới mở hòm; trước đó chỉ thấy `name` + `summary` của hai nhánh. Nút **"Đổi lựa chọn kép"** (bấm ở đâu cũng được; không đổi được lúc đang chờ Host duyệt và trong lúc đang đếm ngược của lần đổi trước; có **hộp xác nhận** ghi rõ số phút phạt): hòm nhánh đang chọn biến mất, tiến độ nhánh cũ mất, đội chờ `penalties.branchSwitchLockMinutes` phút (đồng hồ **đếm ngược** giữa màn hình; đồng hồ đua vẫn chạy) rồi hòm nhánh kia mới hiện (khi đội tới gần). Mỗi lần đổi chịu một lần phạt (A → B → A là hai lần); đang bị khóa phạt của thử thách (`retryLockMinutes`) vẫn đổi được, đếm ngược đổi nhánh thay cho đếm ngược cũ.

**Nên cho mỗi nhánh một `task.location` riêng**: nhánh không có nơi riêng thì hòm nhánh đứng đúng chỗ hộp mật thư trước (chồng lên nhau), `leg:check` CẢNH BÁO (nhánh còn trống nội dung thì chưa báo). Chỉ nơi của nhánh **đã chọn** mới là "điểm của đội" (tới vùng mới tính "đã tới", xe vào bãi, "Tại điểm này"); đi ngang nơi của nhánh kia không có tác dụng gì.

| Trường | Bắt buộc? | Mặc định | Ý nghĩa |
|---|---|---|---|
| `clue` | không | `""` | Lời dẫn chung cho lựa chọn. Dòng **cuối** bắt đầu bằng `Lưu ý:` (sau `\n`) được vẽ thành một ô ghi chú riêng trên thẻ và trong Sổ mật thư, ví dụ `"…Lucky Luke.\nLưu ý: Mỗi lần đổi Lựa chọn kép, đội chơi sẽ bị phạt 10 phút."` (số phút ở đây là chữ tĩnh: giữ khớp với `penalties.branchSwitchLockMinutes`) |
| `media` | không | `[]` | Hình / liên kết kèm lời dẫn (mục 7.2); hình riêng của từng nhánh đặt trong `branches[].task.media` |
| `branches[].id` | có | | Mã nhánh, thường `"A"`, `"B"` (hai nhánh khác nhau) |
| `branches[].name` | không | `""` | Tên nhánh đội thấy khi chọn |
| `branches[].summary` | không | `""` | Mô tả ngắn đội thấy **trước khi chọn** (không lộ đáp án) |
| `branches[].afterChoice` | không | `""` | Lời **sổ ra dưới nhánh đã chọn** ngay khi đội bấm chọn (hòm chưa mở): đi đâu, làm gì, Host phạt tay bao nhiêu phút… Chỉ gửi cho đội **nhánh đã chọn** (nhánh kia không bao giờ tới máy đội); hiện cả trong Sổ mật thư. Dòng bắt đầu bằng `• ` hoặc `- ` được vẽ thành gạch đầu dòng. Được quét lộ đáp án như `summary` (đội đọc được rồi vẫn đổi nhánh được) |
| `branches[].task` | không | nhiệm vụ trống | Nhiệm vụ, mục 7.1; nằm trong hòm nhánh |
| `branches[].task.room` | không | không có | **Phòng 3D của nhánh** (Leg 3): `{ "kind": "chocolate" hoặc "comic", "total": 1–20, "penaltyMinutesEach": 0–120 }`, ví dụ `{"kind": "chocolate", "total": 5, "penaltyMinutesEach": 20}`. Chỉ dùng cho nhánh Lựa chọn kép có `"verification": "host_approval"` (không dùng cùng `parts`), sai thì **LỖI**. Xem đoạn "Phòng của nhánh" dưới bảng |

**Phòng của nhánh (`task.room`).** Mở hòm nhánh (F) = vào phòng của nhánh (xưởng sô-cô-la / phòng tranh truyện). Máy đội báo tiến độ cho máy chủ (`done` = số món đã làm, chỉ tăng, không quá `total`); máy chủ lưu và hiện cho Host trong ô ma trận ("▣3/5", chú thích "Phòng sô-cô-la (nhánh A): đã xong 3/5"). Làm **đủ `total`** → một mục **"Hoàn thành phòng sô-cô-la: 5/5"** vào hàng "Chờ duyệt": Host bấm **Duyệt** (đội nhận mật thư kế) hoặc **Phạt** (đếm ngược `retryLockMinutes`, hết giờ máy đội gửi lại). Đội bấm **"Bỏ qua"** → nhận mật thư kế **ngay** và chịu **phạt tại vạch đích** = (`total` − số món đã làm) × `penaltyMinutesEach` phút, lý do "bỏ thử thách ở lựa chọn kép" (mục 5.4); không hoàn tác được. Kết quả gửi cho nhánh không phải nhánh đang làm (chưa chọn, chưa mở hòm, đã đổi đi) bị bỏ qua. **Đổi lựa chọn kép** xóa tiến độ phòng của nhánh cũ (quay lại nhánh đó thì làm lại từ 0). Bấm **"Đổi lựa chọn kép"** ngay trong phòng: đội **không bị văng ra**; bàn của đội tắt ("Bạn đã đổi lựa chọn kép – ra khỏi phòng để đi tiếp"), **vòng sáng "Ra khỏi phòng"** hiện ở cuối phòng (như khi làm xong / bỏ qua) và đội tự đi vào vòng để ra ngoài, đứng lại trước hòm cũ; đếm ngược đổi nhánh chạy từ lúc bấm. Trong phòng, đội chỉ thấy **kết quả của mình** (bảng tên bàn khác không ghi số); các đội đang ở cùng phòng **nhìn thấy nhau** đi lại. Trò vẽ truyện tranh có **9 bức**; nét đang vẽ dở được giữ khi thoát / tải lại trang.

### 5.4 `pit_stop`: Chặng dừng (về đích)

Có **đúng một** và **phải là bước cuối cùng**. Đội **dẫm lên thảm đỏ** thì về đích (SPEC §17.38): vùng check-in là **hình chữ nhật của thảm** (`PIT_MAT` trong `shared/src/constants.ts`, hiện 16 × 32 m, tâm tại `lat`, `lon`, trục dài theo `yawDeg` của `destination`, dung sai 0,5 m), **không phải** vòng tròn `radius`; đứng cạnh thảm chưa tính. `radius` vẫn phải ghi (15–40 m; file cũ đọc được như trước) nhưng chỉ còn dùng cho các kiểm tra vị trí / khoảng cách của `leg:check` (ngoài nhà, tới được, bãi xe) và vùng cấm NPC. Có `destination` (mục 7) và khối tùy chọn `announce` dưới đây.

**Thông báo về đích (`announce`, tùy chọn; SPEC §17.22, §17.23).** Ngay khi đội chạm thảm, máy chủ gửi cho **riêng đội đó** thứ hạng **"Về đích thứ n"** (thứ tự chạm thảm thật, cố định) ở ba chỗ: lời **NPC dẫn chương trình** trên thảm, **thông báo nhanh** (toast) và **thẻ về đích** giữa màn hình. Đội **về nhất** có bản riêng. Đội **về cuối cùng** (mọi đội khác đã về đích) và mọi đội **chưa về khi Host bấm "Kết thúc"** nhận bản **"BỊ LOẠI"** kèm thứ hạng cuối. Chữ thật thường nhắc tên nơi về đích nên nằm trong file chặng (chỉ máy chủ có), không nằm trong game.

| Trường | Ý nghĩa |
|---|---|
| `announce.npc` | Lời NPC dẫn chương trình (đội về đích thứ 2 trở đi, trừ đội bị loại) |
| `announce.toast` | Thông báo nhanh (một dòng ngắn) |
| `announce.card` | Chữ trên thẻ về đích (tiêu đề thẻ do game ghi: "Về đích thứ n" / "BỊ LOẠI") |
| `announce.first` | `{ "npc", "toast", "card" }` cho **đội về nhất**; trường nào thiếu thì dùng trường cùng tên ở trên |
| `announce.out` | `{ "npc", "toast", "card" }` cho **đội bị loại**; trường nào thiếu thì dùng chữ chung của game (không dùng chữ về đích thường) |

Chỗ giữ được thay khi gửi: `{n}` = thứ hạng, `{tổng}` = số đội của cuộc đua, `{tên đội}`. Mọi trường đều có thể bỏ: thiếu thì game dùng chữ chung **không nhắc địa điểm**, ví dụ *"{tên đội}, chúc mừng các bạn đã về đích thứ {n}!"*, *"Về đích thứ {n}/{tổng}"*, *"Rất tiếc, {tên đội} đã BỊ LOẠI khỏi cuộc đua. Thứ hạng cuối: {n}/{tổng}."*. Không có thông báo thời gian (không còn đồng hồ đội).

```json
{
  "id": "PS", "type": "pit_stop", "label": "Về đích",
  "destination": { "name": "…", "lat": 48.8596, "lon": 2.29243, "radius": 25 },
  "announce": {
    "npc": "{tên đội} về đích thứ {n} tại <nơi về đích>!",
    "toast": "Về đích thứ {n}/{tổng}",
    "card": "Chúc mừng {tên đội}: về đích thứ {n} trên {tổng} đội.",
    "first": { "npc": "{tên đội} về nhất!" },
    "out": { "card": "{tên đội} BỊ LOẠI, hạng cuối {n}/{tổng}." }
  }
}
```

`leg:check` kiểm: chỗ giữ lạ (vd. `{team}`) hoặc dấu `{ }` lẻ là **LỖI**; ký tự điều khiển / vô hình (thường do copy) là **LỖI**; ký tự ngoài bảng chữ Việt / Latin (vd. biểu tượng cảm xúc) là **CẢNH BÁO** (máy người chơi có thể hiện ô vuông). Chữ `announce` cũng được tìm trong tài sản tĩnh của game như mật thư (không được lộ trước khi về đích).

**Phạt tại vạch đích (Leg 3; không nằm trong file chặng).** Đội bấm **"Bỏ qua"** trong phòng Lựa chọn kép (xưởng sô-cô-la: mỗi loại chưa làm 20 phút; phòng tranh truyện: mỗi bức chưa làm 12 phút) chịu phạt **tại vạch đích**: không phải chờ trên thảm, đội vẫn được báo **đã về đích** như thường ("Về đích thứ n", thứ tự chạm thảm thật), thẻ về đích có thêm một dòng đỏ *"Bị phạt {xx} phút do bỏ thử thách ở lựa chọn kép."*. Máy chủ **tự ghi** số phút khi đội bấm "Bỏ qua" trong phòng của nhánh (mục 5.3, `task.room`: số món chưa làm × `penaltyMinutesEach`); nếu Host đã nhập phạt vạch đích cho đội đó thì **giữ số của Host** (không ghi đè). Host luôn sửa / xóa được: trang Host, bảng **"Thứ tự vào game"**, cột **"Phạt vạch đích (phút · lý do)"** → **Lưu** (0 hoặc để trống = bỏ phạt) / **Xóa**. Nhập được trước hoặc sau khi đội về đích, kể cả sau "Kết thúc"; đội đã về đích thấy thẻ cập nhật ngay; đội khác không thấy. Lý do mặc định "bỏ thử thách ở lựa chọn kép", sửa được (tối đa 120 ký tự). Mỗi lần lưu ghi sự kiện `host.finishPenalty` (kèm giá trị cũ `was`) vào nhật ký; nhập nhầm thì Lưu lại số đúng. **Xếp hạng trên trang Host** (cột "Hạng" của bảng tiến trình) = giờ chạm thảm **+ số phút phạt vạch đích** (khác SPEC §17.22 "không cộng phạt" vì phạt này chưa trôi trên đường); thứ hạng đã báo cho đội lúc chạm thảm và dấu "BỊ LOẠI" không tự đổi theo: Host công bố kết quả cuối.

## 6. Luật thứ tự

- Bước **đầu tiên** phải là `route_info`. Mật thư đầu tiên **được phát ngoài game** (đội chưa vào game khi nhận); ghi nguyên văn nó vào `clue` của bước 1 (đội cũng thấy lại nó trên thẻ mật thư và trong Sổ mật thư khi vào game). Có hai cách viết bước 1, `leg:check` và máy chủ nhận cả hai:
  - **Mật thư 1 dẫn tới chính nơi xuất phát** (vd. buổi thật: mật thư 1 phát tay dẫn các đội tới cầu Bir-Hakeim, đội vào game ở đó; hộp có "Lộ trình 2" đặt ở đó): cho `destination` của bước 1 **trùng** `start` (cùng `lat`, `lon`) và `radius` lớn hơn `spreadMeters` ít nhất 10 m (vd. 20). Đội vào game là đứng trong vùng, mở được hộp ngay. `leg:check` in dòng "Điểm xuất phát nằm trong vùng này" dưới bước 1.
  - **Mật thư 1 dẫn tới một nơi khác:** đội vào game ở `start`, rồi tự đi (trong game) tới điểm đến của bước 1.
- **Một** `pit_stop`, ở cuối; bước **ngay trước** nó phải là `route_info` (lộ trình dẫn tới thảm). Lộ trình cuối này hoàn thành ngay khi đội dẫm lên thảm Chặng dừng (mục 5.4), nên điểm đến của nó nên **trùng** điểm Chặng dừng (lệch > 5 m thì cảnh báo).
- Các bước khác (`challenge`, `detour`, `route_info`) xen kẽ tùy ý. `id` không trùng.
- Mật thư bước N+1 chỉ tới đội khi bước N đã xong: **lộ trình** xong khi đội mở hộp ở điểm đến (xuống xe, đứng trong vùng, bấm `F`); **thử thách** và **nhánh Lựa chọn kép** xong khi Host duyệt (hoặc máy chấm đúng, với `auto`), đội ở đâu cũng được; đội nhận mật thư kế ngay lúc đó. Tọa độ hộp chỉ tới máy đội khi họ cách hộp ≤ `boxReveal.radius` (150 m).
- Không có đồng hồ đội: thứ hạng là thứ tự chạm thảm thật (thời gian Host tạm dừng cuộc đua cũng đã trôi như mọi khoảng chờ khác).

## 7. Điểm đến, vùng và bãi xe (`destination`, `task.location`)

Điểm đến và `task.location` có cùng dạng:

| Trường | Bắt buộc? | Ý nghĩa |
|---|---|---|
| `name` | có | Tên chỗ. Của `destination`: **chỉ Host thấy**, không bao giờ hiện cho đội (không phải đáp án của mật thư). Của `task.location`: **hiện cho đội** trên thẻ nhiệm vụ ("Địa điểm: …") để đội biết đi đâu làm. `"Sân trước Palais de Chaillot"` |
| `lat`, `lon` | có | Tọa độ tâm (dùng dấu chấm). **Hộp mật thư (vật thể trong game) đứng đúng tại đây**; thảm Chặng dừng cũng vậy |
| `radius` | có | **Bán kính vùng, 15–40 m.** Đứng trong vòng tròn này = "đã tới điểm" (mở được hộp). Riêng Chặng dừng: về đích khi **đứng trên thảm** 16 × 32 m (mục 5.4), không theo bán kính |
| `bikeParking` | không | `{ "lat": ..., "lon": ... }`: bãi xe đạp **cạnh điểm** (mục dưới) |
| `yawDeg` | không (mặc định `0`) | Hướng **mặt trước** của hộp / hòm mật thư (phía đội đứng đọc), cùng quy ước với `start.yawDeg` (mục 4): `0` = bắc, `90` = tây, `180` = nam, `-90` = đông (`yawDeg` = − hướng la bàn). Áp dụng cho cả hòm nhánh (`task.location` của nhánh) |

**Đặt tâm ở đâu:** vỉa hè, quảng trường, bờ sông, giữa cầu (lối đi bộ); **không bao giờ trong nhà** (LỖI; `leg:check` gợi ý sẵn "điểm ngoài nhà gần nhất"), **không giữa lòng đường xe chạy** (cảnh báo: hộp sẽ đứng giữa dòng xe NPC), không giữa sông / bể nước, không trên nóc cầu cạn metro. Phải có đường đi bộ gần để đội đi tới (không thì LỖI "không đi bộ tới được").

**Gần địa danh Ma Cao (chặng 2):** đặt điểm ở sân / vỉa hè **trước mặt** địa danh, không trên bệ, bậc hay trong tường của nó. Game dựng chi tiết nhiều địa danh (bệ + 68 bậc Ruínas de São Paulo, sân thượng Fortaleza do Monte, các tầng đá chùa A-Ma, bệ nhà thờ, tường vườn): `leg:check` cảnh báo khi điểm nằm trong / sát (≤ 1,5 m) đường viền địa danh, nhưng **không thấy** phần dựng vượt ra ngoài đường viền (bậc lớn Ruínas dài 60 m về phía nam): luôn xem ảnh ("Xem") của điểm gần địa danh. Ví dụ điểm tốt: chân bậc Ruínas (22.19689, 113.54086), giữa Largo do Senado (22.19384, 113.54002, Chặng dừng `"yawDeg": -40` theo chiều dài quảng trường), chân tường phía đông Monte (22.19714, 113.54266).
**Thảm Chặng dừng 16 × 32 m** cần chỗ trống đủ rộng: `leg:check` cảnh báo khi thảm (cạnh dài theo `yawDeg`) chồng lên nhà hơn 5 % diện tích.
**Cầu không đặt điểm (chặng 2):** Ponte de Sai Van (đầu cầu sát Macau Tower), Ponte da Amizade, cầu cạn Rotunda da Amizade / cầu Ma Man Kei, 昌盛大桥 và nhánh rẽ Viaduto da Estrada da Bela Vista có **bậc thật** giữa các đoạn mặt cầu (0,5–18 m): người / xe đạp có thể rơi hoặc kẹt. Không đặt điểm, bãi xe hay lộ trình xe đạp bắt buộc qua đó (TODO.md).

**Chọn bán kính:**
- Vùng là **vòng tròn phẳng** quanh tâm, **không tính cao thấp**: điểm giữa cầu có lối đi bên dưới (vd. cầu Bir-Hakeim với lối Allée des Cygnes bên dưới) thì đội đứng dưới gầm cũng tính là tới; điểm trên bậc thang / sân thượng thì đứng tầng dưới cũng tính. Muốn tránh: đặt tâm xa chỗ chồng tầng hơn bán kính.
- Bán kính phải **≥ khoảng cách từ tâm tới lối đi bộ** mà đội sẽ đi tới (không thì `leg:check` cảnh báo "đường đi bộ gần nhất cách tâm N m, xa hơn bán kính": đội phải ra khỏi vùng mới tới được đường).
- Gợi ý: quảng trường lớn 35–40; sân trước một tòa nhà lớn 25–30; vỉa hè, ngõ nhỏ 15–20. Vùng được phép trùm lên tòa nhà hay sang bên kia đường: chỉ **tâm** phải ở chỗ đứng được.
- Bước 1 trùng nơi xuất phát: bán kính > `spreadMeters` + 10 (mục 6).

**Bãi xe (`bikeParking`):** khi đội làm xong bước ở điểm này và nhận mật thư kế là *nhiệm vụ tại điểm* hoặc *lộ trình bắt buộc đi bộ*, xe họ đang đi được **để lại ở bãi của điểm đó** (xếp thành một hàng, tối đa `vehicles.bikeParking.maxBikes` xe; bãi đầy thì xe để lâu nhất biến mất). Quy tắc chi tiết:
- Bãi theo **điểm** (tâm vùng), không theo bước: nhiều bước cùng một điểm dùng chung một bãi.
- Nhiệm vụ ở **nơi khác** (`task.location`): xe chỉ để lại khi đội **tới vùng** nhiệm vụ đó (đội đạp xe tới đó làm), tại bãi của `task.location`.
- Không viết `bikeParking`: xe bị bỏ lại đúng chỗ đội đứng (không lỗi).
- Nên đặt bãi **cạnh nhưng ngoài vùng** (khoảng `radius + 20` m); trong vùng, hoặc cách tâm hơn 300 m (thường là gõ nhầm số), thì `leg:check` cảnh báo; trong nhà hoặc ngoài bản đồ đua thì LỖI (ngoài bản đồ: máy chủ cũng không nạp chặng). `leg:check` in tọa độ bãi bạn đã đặt (kèm khoảng cách tới tâm) và gợi ý sẵn tọa độ bãi xe có thật trong dữ liệu bản đồ cho điểm chưa có bãi.

### 7.1 `task`: nhiệm vụ

| Trường | Bắt buộc? | Mặc định | Ý nghĩa |
|---|---|---|---|
| `title` | không (trống = CÒN TRỐNG) | `""` | Tiêu đề nhiệm vụ |
| `description` | không (trống = CÒN TRỐNG) | `""` | Đề bài đội đọc. **Không chứa đáp án** |
| `media` | không | `[]` | Hình / liên kết của đề bài (mục 7.2); chỉ tới máy đội khi đề bài đã mở (sau "Nhận thử thách"; nhánh: sau khi mở hòm nhánh) |
| `location` | không | `null` | `null` = làm tại điểm vừa tới; hoặc một khối điểm như ở đầu mục 7 (tên, tọa độ, vùng, bãi xe) = nơi thẻ ghi "Địa điểm: …" để đội tới làm (câu trả lời vẫn gõ được ở bất kỳ đâu). Của một **nhánh Lựa chọn kép** thì đó cũng là nơi đứng của hòm nhánh |
| `kind` | không | `"answer"` | Kiểu nhiệm vụ, xem dưới |
| `verification` | không | `"auto"` | `"host_approval"` = **Host duyệt tay** trên trang Host (cách của chặng thật): `kind: "answer"` → đội gõ đáp án trong game, Host thấy câu trả lời + đáp án tham khảo, bấm **Duyệt** (đội nhận mật thư kế ngay) hoặc **Phạt** (đội chờ `retryLockMinutes` phút rồi trả lời lại); `kind: "free"` → đội tự mở Messenger ở ngoài trò chơi, gửi ảnh kèm **mã bài nộp** `<tên đội>-<mã bước>[-<mã nhánh>]`, rồi bấm "Tôi đã gửi bài – chờ Host duyệt" trên thẻ, Host duyệt. `"auto"` (tùy chọn) = máy so với `answers`: đúng thì xong ngay, sai thì "Chưa đúng" (không khóa) |
| `answers` | khi `auto` (trống = CÒN TRỐNG) | `[]` | Các đáp án chấp nhận (không phân biệt hoa thường, dấu, khoảng trắng thừa: `"Bảy"`, `"BAY"`, `"bảy "` coi như nhau). `["7", "bảy"]`. Với `host_approval`: Host thấy chúng làm đáp án tham khảo nếu `referenceAnswers` trống. **Không bao giờ** gửi cho đội |
| `referenceAnswers` | không | `[]` | **Đáp án tham khảo chỉ Host thấy** (hàng chờ duyệt trên trang Host), vd. `["Pont Alexandre III", "cầu Alexandre III"]`. **Không bao giờ** gửi cho đội; `leg:check` cảnh báo nếu nó lọt vào chữ đội đọc |
| `retryLockMinutes` | không | `null` | Số phút đội phải chờ sau khi Host bấm **Phạt** nhiệm vụ này; `null` = theo `penalties.retryLockMinutes` (3); `0` = không khóa |
| `scoreOf` | không | (không có) | **Thử thách Host báo "đúng x/n"** (vd. T1 gõ 4 địa điểm → `4`): trên hàng chờ duyệt, cạnh nút **Phạt** có ô "Đúng ?/n"; Host gõ số câu đúng (0…n, để trống = không báo số) rồi bấm Phạt. Đội chỉ được báo số (toast + lịch sử trên thẻ "· đúng 2/4") khi Phạt xảy ra **từ phút `scoreFromMinutes` của thử thách** trở đi (tính từ "Nhận thử thách"); Phạt sớm hơn thì đội chỉ thấy bị phạt như cũ, không bao giờ hiện số (kể cả sau này). Duyệt = không báo số. Không có trường này = không có ô nhập |
| `scoreFromMinutes` | không | `30` | Phút (từ lúc bắt đầu thử thách) từ đó Phạt kèm số được báo cho đội; chỉ có nghĩa khi có `scoreOf`. `0` = báo ngay |
| `parts` | không | (không có) | **Thử thách nhiều ô, Host duyệt** (mục 7.5; Thử thách 1: 4 địa điểm trong MV): mảng 2–8 phần `{ "label": "Địa điểm 1" }` = **chỉ nhãn ô**, không có đáp án trong chặng. Bắt buộc `verification: "host_approval"` và `kind: "answer"` (LỖI nếu khác). Đội thấy N ô, gửi N chuỗi thành **một** bài vào hàng chờ duyệt; "đúng x/n" lấy n = số ô (không cần `scoreOf`) |
| `proofInstruction` | khi `kind: "free"` + `host_approval` | `""` | Hướng dẫn đội gửi bài (vd. "Chụp màn hình và gửi Messenger cho Host kèm mã bài nộp"). Nhiệm vụ gõ đáp án trong game (`kind: "answer"`) không cần |
| `timeLimitMinutes` | không | `null` | Giới hạn thời gian làm (phút), số dương; `null` = không giới hạn. Hiện tại chỉ hiện chữ "giới hạn N phút" trên thẻ, chưa tính giờ |
| `params` | không | (không có) | Tham số mini-game cho các kiểu khác (vị trí vật, ảnh đích, hướng...). Lưu nguyên, **chưa kiểm** và **không bao giờ gửi** cho đội (các kiểu mini-game chưa có trong game) |

**Kiểu nhiệm vụ (`kind`)**: `answer` (đội **gõ câu trả lời trong game**: ô gõ trên thẻ thử thách, gõ được ở bất kỳ đâu, mọi câu trả lời được lưu và hiện lại trên thẻ cho chính đội), `free` (đội **nộp ảnh** qua Messenger cho Host duyệt). Các kiểu mini-game `find_objects`, `delivery`, `observe_answer`, `cipher`, `photo_match`, `binocular_scan`, `timed_drive`, `memory_ui` **chưa có trong game** (hoãn): `leg:check` CẢNH BÁO và máy chủ xử lý như `answer`; hãy dùng liên kết ngoài (`media`) + `answer`. Tham số (nếu đã biết) để vào `params`: file vẫn hợp lệ, **không cần viết lại** sau này. `kind: "free"` với `verification: "auto"` bị cảnh báo (không có đáp án để chấm): dùng `host_approval`.

### 7.2 `media`: hình và liên kết

`media` là danh sách, mỗi mục là **một chuỗi** hoặc `{ "url": "...", "label": "..." }` (`label` = chữ hiện trên link, trống thì hiện tên trang web). Có ở `route_info`, `detour` và mọi `task`.

- **Liên kết** `"https://…"` (video YouTube, trang web, mini-game ngoài…): đội bấm được trên thẻ và trong Sổ mật thư, mở **tab mới** (không nhúng vào game). Chuỗi không bắt đầu bằng `http://` / `https://` (và không phải `r2:`): LỖI. Link trỏ thẳng tới một file hình (`….jpg`, `….png`…) vẫn chỉ là link: `leg:check` CẢNH BÁO vì hình **không** hiện trên thẻ; muốn hiện hình thì dùng `r2:` (dưới).
- **Hình** `"r2:<tên hình>"`, vd. `"r2:lua-hinh-1.jpg"`: hình hiện ngay trên thẻ (bấm để xem lớn). Tên chỉ gồm chữ **không dấu**, số, `.` `_` `-`, tối đa 64 ký tự, đuôi `.jpg` / `.jpeg` / `.png` / `.webp` (sai: LỖI). Một tên dùng hai lần trong chặng: CẢNH BÁO (nhầm hình?). **Đặt tên trung tính** (`hinh-1.jpg`, không `palais-de-tokyo.jpg`): tên hình tới máy đội cùng mật thư; nếu tên chứa đáp án thì `leg:check` CẢNH BÁO.
- **Tải hình lên:** sau khi nạp chặng, trang Host có mục **"Hình mật thư (R2)"** liệt kê mọi tên `r2:` của chặng: chọn file cho từng tên (jpg / png / webp, **tối đa 5 MB**: nén trước nếu lớn hơn). Hình được lưu **theo mã cuộc đua**: diễn tập ở một mã cuộc đua khác thì tải lên lại. `leg:check` in danh sách hình cần tải.
- Hình nằm trong kho riêng tư: máy chủ chỉ trả hình cho **đội đã mở** mật thư / nhiệm vụ chứa nó (đội khác hay đội chưa tới bước đó không tải được, kể cả khi biết tên).

### 7.3 Ô giữ chỗ `[CHƯA NHẬP …]`

Khi soạn nháp, viết `"[CHƯA NHẬP tên điểm]"`, `"[CHƯA NHẬP đáp án]"`… cho chỗ chưa có nội dung: mọi chữ bắt đầu bằng `[CHƯA NHẬP` (hoa thường như nhau) được `leg:check` và trang Host liệt kê là **CÒN TRỐNG** ("còn giữ chỗ"), nên không bị mở cuộc đua nhầm. Nhãn bước (`label`) trùng nhau: CẢNH BÁO (đội và Host khó phân biệt; không bắt buộc đánh số theo quy tắc nào).

### 7.4 Host duyệt và cảnh báo kẹt trên trang Host

Chặng thật dùng `"verification": "host_approval"`: game không tự chấm, bài của đội tới trang Host.

- **Hàng chờ duyệt** (đầu trang Host, "Chờ duyệt (n)"): mỗi bài chờ hiện tên đội, bước (và nhánh), **mã bài nộp**, câu trả lời (hoặc "đã gửi bài qua Messenger" với nhiệm vụ ảnh), thời gian chờ, **đáp án tham khảo** (`referenceAnswers`; trống thì `answers`; chỉ Host thấy) và ô ghi chú. Nút **Duyệt**, **Phạt n phút** (n = `task.retryLockMinutes` của nhiệm vụ, hoặc `penalties.retryLockMinutes`) và **Lưu ghi chú**. Bài mới tới có âm báo, và thông báo của trình duyệt nếu bạn bấm "Bật thông báo".
- **Duyệt** → đội nhận ngay mật thư kế (có âm báo). **Phạt** → đội thấy đồng hồ đếm ngược `retryLockMinutes` rồi gửi lại được; không cộng phút phạt ở thảm và không trừ giờ. Lỡ bấm Phạt nhầm thì bấm Duyệt cho đúng câu đó vẫn được (không có nút Hoàn tác). Host duyệt được cả khi cuộc đua đang tạm dừng.
- **Ghi chú của Host không gửi cho đội.** Mọi câu trả lời của đội, giờ gửi, quyết định và ghi chú đều được lưu (hiện khi rê chuột vào ô của ma trận tiến độ).
- Nhiệm vụ ảnh (`kind: "free"`): Host nhận ảnh qua Messenger rồi có thể bấm **"Duyệt (đã nhận ảnh)"** ở ô của bước / nhánh trong ma trận tiến độ, không cần chờ đội bấm "Tôi đã gửi bài".
- **Cảnh báo kẹt:** đội làm cùng một thử thách / nhánh quá `hostAlerts.stuckMinutes` (mặc định 45) phút thì trang Host hiện dòng đỏ + âm báo "Đội X làm Thử thách Y đã n phút", lặp lại mỗi chu kỳ tới khi đội xong (đội đang chờ Host duyệt không bị coi là kẹt: bài đã nằm trong hàng chờ). Để Host gửi **gợi ý riêng cho đội qua Messenger**. Tính ngay trên trang Host nên trang phải đang mở; tải lại trang thì báo lại một lần. **Game không có gợi ý nào** và file chặng không chứa nội dung gợi ý.
- **Hình mật thư (R2):** mục tải hình lên (mục 7.2).

### 7.5 Thử thách nhiều ô (`task.parts`, Thử thách 1) — đội điền N ô, Host duyệt

Đội thấy **N ô nhập** (N = số phần, nhãn = `label`, trống thì "Ô n") và nút **Gửi đáp án** chỉ bật khi đã điền đủ mọi ô (`Tab` chuyển ô, `Enter` ở ô cuối gửi). N chuỗi thành **một bài** trong hàng "Chờ duyệt" của trang Host, liệt kê 1–N theo nhãn (không có huy hiệu KHỚP: chặng không chứa đáp án). Host bấm **Duyệt** (= đúng hết, đội nhận mật thư kế) hoặc **Phạt** kèm ô "Đúng ?/N" (SPEC §17.31, N = số ô): đội bị khóa `retryLockMinutes` (mặc định 3 phút), các ô giữ nguyên chữ để sửa; số x/N chỉ hiện cho đội (toast + lịch sử "Bị phạt 3 phút · đúng 2/4") khi Phạt xảy ra **từ phút `scoreFromMinutes`** (mặc định 30, tính từ "Nhận thử thách" hoặc lúc nhận mật thư nếu không có `teaser`); Phạt sớm hơn không bao giờ hiện số. Hoàn tác / Cho qua / ghi chú như mọi bài Host duyệt. Câu trả lời lưu N chuỗi nối bằng ` | ` (xuất CSV giữ nguyên).

```json
"task": {
  "title": "Bốn địa điểm trong MV",
  "description": "Kể tên 4 địa điểm nổi tiếng xuất hiện trong đoạn phim. Mỗi nơi một ô, thứ tự tùy ý.",
  "verification": "host_approval",
  "parts": [
    { "label": "Địa điểm 1" },
    { "label": "Địa điểm 2" },
    { "label": "Địa điểm 3" },
    { "label": "Địa điểm 4" }
  ],
  "scoreFromMinutes": 30
}
```

Muốn Host có đáp án tham khảo cạnh bài: thêm `referenceAnswers` như mọi nhiệm vụ Host duyệt (chỉ Host thấy; `leg:check` quét rò rỉ như cũ). `scoreOf` không cần (CẢNH BÁO nếu đặt khác số ô).

**Máy tự chấm (`parts[].answers`, Leg 3).** Khi **mọi ô** có `answers` (danh sách cách viết được chấp nhận của **riêng ô đó**; ô k chỉ so với danh sách của ô k, thứ tự ô có ý nghĩa), máy chủ **chấm ngay** khi đội gửi: so sánh bỏ dấu, hoa / thường, khoảng trắng, gạch nối, dấu câu ("cu-ba" = "CU BA" = "Cuba"). Đúng hết N/N → đội nhận mật thư kế **ngay** (thông báo "Chính xác!"); sai ít nhất một ô → **Phạt ngay** `retryLockMinutes` phút và đội thấy **"đúng x/N"** ngay (toast + lịch sử "Bị phạt 2 phút · đúng 2/4"; `scoreFromMinutes` không áp dụng), **không** biết ô nào sai. Host vẫn thấy từng bài trong "Chờ duyệt" (khung xanh "Máy tự chấm: đúng x/N · đã cho qua / đã phạt", ✓ / ✗ từng ô, chỉ Host thấy) nhưng **đội không phải chờ**: nút **"✓ Đồng ý"** (bỏ khỏi hàng chờ, đội không thấy gì thêm), ô **"Đúng ?/N" + "Cập nhật"** (sửa số đội thấy, đếm ngược giữ nguyên), nút **"Đúng – cho qua"** (không đồng ý phạt: gỡ đếm ngược, đội nhận mật thư kế như Duyệt, Hoàn tác 10 giây như cũ; chỉ hiện khi đó còn là bài mới nhất của đội và đội chưa qua bước). "Cho qua" ở ma trận vẫn dùng được. Thiếu `answers` ở vài ô (không phải tất cả) là **LỖI**; ô trống sau khi bỏ dấu / khoảng trắng là **LỖI**. Các cách viết này **chỉ ở máy chủ** và được quét rò rỉ như `answers` (mô tả, nhãn liên kết, mật thư trước, tài sản tĩnh của game). Vẫn ghi `"verification": "host_approval"`.

```json
"parts": [
  { "label": "Bộ quần áo 1", "answers": ["Cuba", "Cu-ba", "Cu Ba"] },
  { "label": "Bộ quần áo 2", "answers": ["Singapore", "Xin-ga-po"] }
]
```

## 8. Cách lấy tọa độ và xem điểm đã đặt đúng chỗ chưa

**Lấy tọa độ**
- *Google Maps:* chuột phải vào chỗ cần đặt, dòng đầu tiên của menu là tọa độ (`48.8583, 2.2945`); bấm vào để copy. Số đầu là `lat`, số sau là `lon`. **Đừng bấm vào tên địa danh**: ghim của một địa danh thường nằm **trong** tòa nhà; hãy chuột phải lên vỉa hè / sân trước.
- *OpenStreetMap (openstreetmap.org):* chuột phải → "Show address" / bấm "Share", hoặc đọc trên thanh địa chỉ `#map=19/48.85830/2.29450`.
- Dùng **dấu chấm** thập phân, 5 chữ số sau dấu chấm là đủ (≈ 1 m). Dấu phẩy ("48,85") làm hỏng file.

**Xem điểm đã đặt (vì chưa có trình soạn bản đồ, làm ở Phase 10):** sau mỗi lần `npm run leg:check`, bảng cuối in **từng điểm** (xuất phát, mỗi bước, nơi riêng của từng nhánh, kèm đường đi bộ ước tính từ điểm trước). Ví dụ thật của `mini`:

```
• Bước 4 (D1/A, detour): Phía bắc chân tháp, lối ra sông — hòm nhánh A — vùng 15 m — đi bộ ≈ 57 m từ điểm trước
    không có tên đường gần đó, Quận 7 — 48.85878, 2.29469
    Hướng hòm: mặt trước quay về la bàn 225° (tây nam), đội đứng phía đó mới đọc được — "yawDeg": 135; muốn quay về la bàn B° thì ghi "yawDeg": -B
    Bãi xe: 48.85899, 2.29478 (cách tâm 24 m)
    Bản đồ: https://www.openstreetmap.org/?mlat=48.85878&mlon=2.29469#map=19/48.85878/2.29469
    Vệ tinh: https://www.google.com/maps?q=48.85878,2.29469&t=k&z=19
    Xem: npm run screenshot -- --path "/?cam=-1941.6,64.4,777.6,0,-60&boxes=D1-A,-1941.6,745.1&mat&npc=0" --name leg-D1-A
    Trong game: http://localhost:5173/?start=-1940.9,757,3&boxes=D1-A,-1941.6,745.1,,135
```

- **Tên đường + quận** cho biết ngay nếu gõ nhầm số (nhầm 2 chữ số vẫn nằm trong bản đồ nhưng sai tên đường / quận).
- **`hòm nhánh A`:** điểm là nơi riêng của nhánh A (hòm của nhánh đứng ở đây). Mỗi nhánh có `task.location` riêng đều có một dòng như vậy; nhánh không có nơi riêng thì không có dòng (và có CẢNH BÁO, mục 5.3).
- **`Hướng hòm:`** phía mặt trước của hòm (nơi đội đứng đọc) theo la bàn, kèm giá trị `yawDeg` đang dùng (không ghi `yawDeg` = 0 = mặt trước quay về bắc). Chỉ có ở điểm có hòm: lộ trình, nơi của nhánh Lựa chọn kép (thử thách và Chặng dừng không có). Muốn quay mặt trước về la bàn B° thì ghi `"yawDeg": -B`. Link `Trong game:` đã mang sẵn hướng này (trường thứ 5 của `boxes=`).
- **`Bãi xe:`** tọa độ bãi bạn đã đặt và khoảng cách tới tâm (điểm chưa có bãi: dòng "Gợi ý bãi xe" hoặc "Chưa có bãi xe").
- **"Hình cần tải lên trang Host":** danh sách các tên `r2:` của chặng (dùng ở đâu) phải tải lên sau khi nạp chặng (mục 7.2). Không có `r2:` thì không in.
- **"Gợi ý: nhiệm vụ Host duyệt … chưa có `referenceAnswers`":** một dòng nhắc (không phải cảnh báo): thêm đáp án tham khảo cho Host nếu có.
- **Link `Bản đồ:`** mở OpenStreetMap (bản đồ vẽ) có ghim đúng điểm.
- **Link `Vệ tinh:`** mở Google Maps **ảnh vệ tinh** có ghim đúng điểm: thấy ngay điểm nằm trên mái nhà, trong sân, trên vỉa hè hay giữa đường.
- **Dòng `Xem:`** là lệnh sẵn: copy, dán vào Terminal, chạy (≈ 1 phút) → ảnh `screenshots/leg-<mã bước>.png` chụp **thế giới 3D của game** xiên từ trên cao, nhìn về hướng bắc, khung ≈ 160 × 105 m, **điểm nằm giữa ảnh**, đánh dấu bằng tấm thảm đỏ viền vàng của Chặng dừng (16 × 32 m) đặt đúng tâm. Ảnh **chưa vẽ vòng bán kính**; điểm dưới mái / dưới cầu cạn thì thảm bị che (vẫn ở giữa ảnh).
- **Link `Trong game:`** để **đứng thử tại điểm**: mở một Terminal khác, chạy `npm run dev` (giữ chạy), rồi mở link trong Chrome. Bạn xuất hiện cách tâm 12 m trên đường đi bộ từ điểm trước, nhìn thẳng về hòm mật thư ở tâm (quay mặt trước đúng `yawDeg` của điểm; Chặng dừng: thảm đỏ; điểm trùng điểm trước: 12 m về phía nam, nhìn về bắc). Điểm xuất phát: đúng chỗ và hướng nhìn của đội đầu tiên vào game. Đây là thế giới thử, không cần cuộc đua, không cần mật khẩu: đi lại bằng `W` `A` `S` `D` để xem đáp án có nhìn thấy được không. Tắt bằng `Ctrl`+`C` trong Terminal đang chạy `npm run dev`.
- "đi bộ ≈ N m": quãng đường đi bộ thật theo đồ thị đường. Quá dài so với dự kiến = điểm sai chỗ. "KHÔNG đi bộ tới được" = LỖI.

## 9. Đáp án nằm đâu, và không bao giờ tới máy người chơi

- Mật thư, nhiệm vụ, **đáp án**, tên điểm đến đều chỉ nằm ở **máy chủ** (trong file chặng được nạp từ Host). Máy người chơi chỉ nhận **thẻ đã lọc** (mật thư của bước hiện tại, mô tả nhiệm vụ đã mở); đáp án **không bao giờ** được gửi xuống: người chơi gõ câu trả lời, máy chủ trả lời đúng / sai.
- **File chặng thật để ở đâu:** **ngoài thư mục dự án** (vd. `Tài liệu/chang-that/`), rồi chọn file khi nạp ở trang Host ("Nạp chặng từ file"). `leg:check` báo theo chỗ của file:
  - ngoài thư mục dự án: không báo gì (chỗ khuyên dùng);
  - trong `client/`: **LỖI** (mọi thứ ở đó được gửi tới máy người chơi, đội đọc được đáp án);
  - chỗ khác trong thư mục dự án: CẢNH BÁO (dễ bị đưa lên git cùng mã nguồn);
  - trong `worker/legs/`: không báo (thư mục của các chặng demo / test có sẵn, nằm trong git). Đừng để chặng thật ở đây: file mới bỏ vào đây **không** tự thành "chặng có sẵn" trên trang Host, và sẽ bị đưa lên git cùng mã nguồn.
- `leg:check` cũng quét `client/public`, `client/dist` và báo LỖI nếu có mật thư / mô tả / đáp án / đáp án tham khảo (từ 12 ký tự) lọt vào (file tới máy người chơi). Ngoại lệ: đáp án / đáp án tham khảo **trùng đúng một địa danh có sẵn trong bản đồ của game** (tên đường trong dữ liệu bản đồ, tên địa danh như "Cầu Alexandre III"; không phân biệt hoa / thường / dấu) chỉ bị CẢNH BÁO "trùng địa danh có sẵn trong bản đồ (không sao)". Đáp án không phải địa danh có sẵn mà nằm trong file tĩnh vẫn là LỖI.
- Đáp án và **đáp án tham khảo** (`referenceAnswers`, chỉ Host thấy) **không được xuất hiện** trong chữ đội đọc **trước khi giải**: tên bước (`label`), mật thư, câu gợi ý, tiêu đề, mô tả, hướng dẫn gửi bài (`proofInstruction`), nhãn hình / liên kết, **tên hình `r2:…` và địa chỉ link** (đội thấy khi rê chuột lên link và trong đường dẫn tải hình), và tên `task.location` (đội thấy nó trên thẻ). Tên hình / địa chỉ được so sau khi đổi `-` `_` `.` `/` `:` thành dấu cách: `r2:palais-de-tokyo.jpg` lộ đáp án "Palais de Tokyo". `leg:check` cảnh báo nếu thấy (từ 3 ký tự) trong chữ của **bước đó và các bước trước** (chữ của bước sau, đọc sau khi đã giải, được phép nhắc lại đáp án).
- **Lựa chọn kép: quét cả hai nhánh với nhau.** Đề bài của nhánh nằm trong hòm của nhánh đó, nhưng đội có thể mở hòm B, đọc đề B, bấm "Đổi lựa chọn kép" (phạt 10 phút) rồi làm nhánh A. Vì vậy đáp án (và đáp án tham khảo) của **mỗi** nhánh không được xuất hiện trong chữ của **cả hai** nhánh: tên, mô tả ngắn, đề bài, hình / liên kết, hướng dẫn gửi bài. Thông báo ghi rõ nhánh nào (`… của bước 4 (D1, nhánh A)`).
- **Đáp án phải dựa trên thứ có trong game** (chữ trên biển tên đường, hình dáng công trình, số trên tượng...). Game dựng từ dữ liệu OpenStreetMap: không có biển hiệu cửa hàng, thực đơn, chữ trong nhà, hoặc vật mà bản đồ không có. Hãy **vào game đứng ở đó** (link `Trong game:` của mục 8) kiểm tra đáp án có thấy được không trước khi chốt.

## 10. Ví dụ đầy đủ

Chặng `mini` (`worker/legs/test/mini.json`, **nội dung GIẢ**) dùng đủ mọi dạng: lộ trình thường (có hình `r2:` + liên kết, hướng hộp `yawDeg`), lộ trình bắt buộc đi bộ, thử thách làm ở nơi khác (có bãi xe, `teaser`, gõ đáp án + Host duyệt, đáp án tham khảo), lựa chọn kép với mỗi nhánh một nơi riêng (A tự chấm, B nộp ảnh cho Host duyệt), `timeLimitMinutes`, Chặng dừng. Mọi trường không viết thì lấy giá trị mặc định ở mục 3.1, nên file ngắn.

Kết quả `leg:check` thật của các chặng có sẵn (chạy lại được bằng `npm run leg:check -- worker/legs/test/mini.json` v.v.):

| Chặng | Dòng cuối | Các cảnh báo (bình thường, đã biết) |
|---|---|---|
| `worker/legs/test/mini.json` | `Hợp lệ: 0 cảnh báo, 0 ô còn trống.` | không có |
| `worker/legs/bruxelles-demo.json` | `Hợp lệ: 0 cảnh báo, 17 ô còn trống.` | không có. 17 ô còn trống là các ô Lựa chọn kép / thử thách chờ bạn điền |
| `worker/legs/test/bruxelles-demo.filled.json` (`bruxelles-demo-filled`, demo đã điền nội dung GIẢ) | `Hợp lệ: 0 cảnh báo, 0 ô còn trống.` | không có |
| `worker/legs/test/near.json` (các điểm cách nhau vài chục mét trong Largo do Senado, `boxReveal` nhỏ, để chạy thử nhanh) | `Hợp lệ: 0 cảnh báo, 0 ô còn trống.` | không có |

```json
{
  "id": "mini",
  "title": "Chặng ngắn để test (NỘI DUNG GIẢ)",
  "start": {
    "name": "Largo do Pagode da Barra – trước đền A-Ma",
    "lat": 22.18647,
    "lon": 113.53097,
    "yawDeg": 33,
    "spreadMeters": 5
  },
  "steps": [
    {
      "id": "L1",
      "type": "route_info",
      "label": "Lộ trình 1",
      "clue": "(GIẢ) Lên quảng trường lát sóng đen trắng trước tòa thị chính cũ.",
      "destination": {
        "name": "Largo do Senado",
        "lat": 22.193839,
        "lon": 113.540021,
        "radius": 35,
        "bikeParking": {
          "lat": 22.193622,
          "lon": 113.53972
        },
        "yawDeg": 150
      },
      "media": [
        {
          "url": "https://example.invalid/gia/video-l1",
          "label": "(GIẢ) Video gợi ý"
        },
        "r2:test-gia.jpg"
      ]
    },
    {
      "id": "T1",
      "type": "challenge",
      "label": "Thử thách 1",
      "task": {
        "title": "(GIẢ) Câu hỏi ở vườn Vasco da Gama",
        "description": "(GIẢ) 6 × 7 = ?",
        "media": [
          "https://example.invalid/gia/vuon-vasco-da-gama",
          "r2:test-gia-2.jpg"
        ],
        "location": {
          "name": "Công viên Vasco da Gama (lối phụ)",
          "lat": 22.197172,
          "lon": 113.544817,
          "radius": 30,
          "bikeParking": {
            "lat": 22.196628,
            "lon": 113.544532
          }
        },
        "verification": "host_approval",
        "answers": [
          "42"
        ],
        "referenceAnswers": [
          "42 (bốn mươi hai) – GIẢ"
        ],
        "timeLimitMinutes": 10
      },
      "teaser": "(GIẢ) Đi xuống vườn, tìm chỗ có tiếng nước."
    },
    {
      "id": "L2",
      "type": "route_info",
      "label": "Lộ trình 2",
      "clue": "(GIẢ) Sang phía đông, tới quảng trường Tap Seac. Bắt buộc: đi bộ.",
      "transport": {
        "mandatory": "walk"
      },
      "destination": {
        "name": "Praça do Tap Seac",
        "lat": 22.19823,
        "lon": 113.547,
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
            ],
            "location": {
              "name": "Phía bắc quảng trường Tap Seac, cạnh thư viện",
              "lat": 22.19871,
              "lon": 113.547135,
              "radius": 15,
              "yawDeg": 135,
              "bikeParking": {
                "lat": 22.198992,
                "lon": 113.547199
              }
            }
          }
        },
        {
          "id": "B",
          "name": "Ảnh",
          "summary": "(GIẢ) Gửi ảnh cho Host.",
          "task": {
            "title": "(GIẢ) Ảnh",
            "description": "(GIẢ) Chụp màn hình trước thư viện Tap Seac.",
            "kind": "free",
            "verification": "host_approval",
            "proofInstruction": "(GIẢ) Gửi ảnh qua Facebook.",
            "location": {
              "name": "Khoảng sân rộng ở Tap Seac",
              "lat": 22.19613,
              "lon": 113.549345,
              "radius": 30,
              "bikeParking": {
                "lat": 22.19573,
                "lon": 113.548918
              }
            },
            "referenceAnswers": [
              "(GIẢ) Ảnh thấy rõ mặt tiền thư viện phía sau"
            ]
          }
        }
      ]
    },
    {
      "id": "L3",
      "type": "route_info",
      "label": "Lộ trình 3",
      "clue": "(GIẢ) Chặng dừng ở khu vườn có tượng nhà hàng hải, phía nam Tap Seac.",
      "destination": {
        "name": "Jardim Vasco da Gama",
        "lat": 22.1962,
        "lon": 113.54633,
        "radius": 25
      }
    },
    {
      "id": "PS",
      "type": "pit_stop",
      "label": "Về đích",
      "destination": {
        "name": "Jardim Vasco da Gama",
        "lat": 22.1962,
        "lon": 113.54633,
        "radius": 25
      },
      "announce": {
        "npc": "(GIẢ) {tên đội} về đích thứ {n} tại vườn Vasco da Gama!",
        "toast": "(GIẢ) Về đích thứ {n}/{tổng}",
        "card": "(GIẢ) Chúc mừng {tên đội}: về đích thứ {n} trên {tổng} đội tại vườn Vasco da Gama.",
        "first": {
          "npc": "(GIẢ) {tên đội} về nhất tại vườn Vasco da Gama!",
          "card": "(GIẢ) {tên đội} về nhất trên {tổng} đội."
        },
        "out": {
          "npc": "(GIẢ) {tên đội}, rất tiếc, các bạn bị loại.",
          "toast": "(GIẢ) BỊ LOẠI – hạng {n}/{tổng}",
          "card": "(GIẢ) {tên đội} BỊ LOẠI, hạng cuối {n}/{tổng}."
        }
      }
    }
  ]
}
```

Lưu ý khi viết chặng thật từ mẫu này: bước 1 (`L1`) là mật thư **phát ngoài game** cho các đội (ghi nguyên văn trong `clue`); ở `mini` nó dẫn tới một nơi khác nơi xuất phát, còn nếu mật thư 1 dẫn tới chính nơi xuất phát thì làm như mục 6. Mật thư các bước sau chỉ hiện trong game khi đội mở hộp. Chặng demo `bruxelles-demo.json` có sẵn 10 bước với các điểm kiểm thử của dự án: thay 6 mật thư lộ trình mẫu, điền các ô trống (`clue`, `title`, `description`, `answers`...) rồi chạy `leg:check`.

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
| `múi giờ: "..." không phải múi giờ hợp lệ; dùng tên múi giờ chuẩn dạng Châu_lục/Thành_phố (tên IANA) ...` | LỖI | Viết đúng dạng `Châu_lục/Thành_phố`: `"Asia/Ho_Chi_Minh"`, `"Europe/Paris"` (không phải `"Paris"`, `"UTC+7"`, `"GMT+7"`); máy chủ không nạp chặng có múi giờ sai |
| `... nằm ngoài bản đồ đua (vĩ độ ..., kinh độ ...)` | LỖI | Tọa độ sai (thường nhầm lat/lon hoặc gõ thiếu / thừa số): kiểm tra lại, lat ≈ 48.8, lon ≈ 2.3. Áp dụng cho cả bãi xe (`› bãi xe`) |
| `tâm vùng nằm trong một tòa nhà (<tên địa danh>; điểm ngoài nhà gần nhất: lat, lon, cách N m, cạnh <đường>)` / `nằm trong một tòa nhà (...)` | LỖI | Dời điểm ra vỉa hè / quảng trường. Tọa độ gợi ý là chỗ đứng được gần nhất (ngoài nhà, không giữa đường, sát lối đi bộ): xem nó bằng link `Vệ tinh:` / lệnh `Xem:` rồi dùng nếu hợp |
| `không đi bộ tới được từ ... theo đồ thị đường` | LỖI | Điểm ở cù lao, sân trong, nóc cầu... không có đường đi bộ nối; dời về chỗ có đường |
| `bãi xe nằm trong một tòa nhà (...)` | LỖI | Dời `bikeParking` ra vỉa hè (có gợi ý tọa độ như trên) |
| `chứa nguyên văn "..." của chặng` (tên file `client/...`) | LỖI | Chặng / mật thư đang nằm trong `client/`; xóa khỏi đó |
| `file chặng nằm trong thư mục client/` | LỖI | Chuyển file chặng ra ngoài thư mục dự án (mục 9) |
| `bãi xe cách tâm N m, nằm trong vùng` | CẢNH BÁO | Dời bãi xe ra ngoài vùng (≈ bán kính + 20 m) |
| `bãi xe cách tâm N m, xa hơn 300 m (gõ nhầm tọa độ?)` | CẢNH BÁO | Bãi xe vẫn trong bản đồ nhưng quá xa điểm: thường là gõ nhầm một chữ số. Sửa lại cho bãi ở ngay ngoài vùng |
| `đường đi bộ gần nhất cách tâm N m, xa hơn bán kính` | CẢNH BÁO | Đường đi bộ ở xa tâm: đội phải ra khỏi vùng để tới đường; dời tâm gần đường hơn hoặc tăng bán kính (mục 7) |
| `cách thảm Chặng dừng N m ...` | CẢNH BÁO | Điểm đến của lộ trình cuối nên trùng điểm Chặng dừng |
| `› thông báo về đích › ...: chỗ giữ "{...}" không có` / `dấu { } lẻ` | LỖI | Chỉ dùng `{n}`, `{tổng}`, `{tên đội}`, viết đủ hai dấu ngoặc (mục 5.4) |
| `› thông báo về đích › ...: có ký tự điều khiển / vô hình` | LỖI | Gõ lại đoạn chữ đó (ký tự lạ thường đi theo khi copy từ nơi khác) |
| `› thông báo về đích › ...: có ký tự ngoài bảng chữ Việt / Latin` | CẢNH BÁO | Bỏ biểu tượng cảm xúc / ký tự lạ, chỉ dùng chữ, số, dấu câu |
| `chứa đáp án "..." của bước N (D1, nhánh A)` | CẢNH BÁO | Đáp án bị lộ trong chữ đội đọc trước: mật thư, tên bước, mô tả, hướng dẫn gửi bài, chữ trên nút gửi bài, nhãn hình, **tên hình `r2:…` / địa chỉ link** (`› hình / liên kết › mục N › liên kết`), tên nơi làm nhiệm vụ (`› nơi làm nhiệm vụ › tên`); với Lựa chọn kép: cả chữ của **nhánh kia** (đội có thể mở hòm nhánh kia rồi đổi nhánh); sửa chữ |
| `nhiệm vụ "free" không tự chấm được` | CẢNH BÁO | Đổi sang `"verification": "host_approval"` |
| `chứa đáp án tham khảo "..." của bước N` | CẢNH BÁO | Đáp án tham khảo (chỉ Host) lộ trong chữ đội đọc trước: sửa chữ |
| `tên hình "..." không hợp lệ: ...` | LỖI | Đổi tên hình (và tên file khi tải lên): chữ không dấu, số, `.` `_` `-`, đuôi `.jpg` / `.png` / `.webp` (mục 7.2) |
| `"..." không phải liên kết hợp lệ: phải bắt đầu bằng https://` | LỖI | Viết đủ `https://…`, hoặc `r2:<tên hình>` cho hình tải lên trang Host |
| `hình "..." đã dùng ở ...` | CẢNH BÁO | Một hình dùng hai lần: kiểm tra có nhầm tên không |
| `"https://….png" là liên kết tới một file hình: đội chỉ thấy link bấm mở tab mới, hình không hiện trên thẻ` | CẢNH BÁO | Chỉ `r2:<tên hình>` mới hiện thành hình trên thẻ. Muốn hiện hình: tải hình lên trang Host và ghi `r2:<tên hình>`; còn nếu chỉ muốn một đường link thì bỏ qua cảnh báo (mục 7.2) |
| `nhánh không có nơi riêng: hòm nhánh đứng cùng chỗ hòm lộ trình trước` | CẢNH BÁO | Cho nhánh một `task.location` riêng (mục 5.3) |
| `kiểu "..." chưa có trong game (hoãn)` | CẢNH BÁO | Kiểu mini-game chưa làm: máy chủ chấm như `answer`; dùng `answer` + liên kết ngoài |
| `tên bước "..." trùng với bước N` | CẢNH BÁO | Đặt nhãn khác nhau cho các bước |
| `phạt dưới 1 phút (...): chỉ dùng cho chặng test` | CẢNH BÁO | Chặng thật: để mặc định (3 và 10 phút) hoặc ≥ 1 |
| `nằm giữa sông, đội không đứng được` | CẢNH BÁO | Dời vào bờ hoặc lên mặt cầu |
| `nằm giữa mặt nước (hồ / bể nước / đài phun nước)` | CẢNH BÁO | Điểm rơi vào bể / hồ (vd. bể đài phun nước trong sân): dời ra chỗ đất cạnh đó |
| `nằm trên đoạn cầu bắc qua đất (bờ / đảo), không phải qua mặt nước` | CẢNH BÁO | Cầu vẫn có thể bắc qua sông, nhưng đúng chỗ này dưới cầu là đất. Kiểm tra đúng mặt cầu đi bộ, không phải nóc cầu cạn metro / đường sắt. Giữa cầu Bir-Hakeim trên đảo Île aux Cygnes (xuất phát, hoặc bước 1 trùng xuất phát) thì cảnh báo này là bình thường; chỉ hiện một lần cho một tọa độ |
| `tâm nằm giữa lòng đường xe chạy (<tên đường>)` / `nằm giữa lòng đường xe chạy` (điểm xuất phát) | CẢNH BÁO | Hộp mật thư / thảm sẽ đứng giữa dòng xe NPC, đội vào game giữa đường: dời tâm lên vỉa hè / quảng trường cạnh đó |
| `chứa chữ ... trùng một đáp án của chặng: trùng địa danh có sẵn trong bản đồ (không sao)` | CẢNH BÁO | Đáp án trùng tên đường / địa danh có trong dữ liệu bản đồ: bình thường. Chỉ xóa nếu file đó là bản chép chặng do bạn bỏ vào `client/` |
| `file chặng nằm trong thư mục dự án` | CẢNH BÁO | Chuyển file chặng thật ra ngoài thư mục dự án (mục 9) |
| `... còn trống` (mật thư, tiêu đề, đáp án, hướng dẫn gửi bài...) | CÒN TRỐNG | Ô bạn chưa điền; cho phép khi soạn nháp, phải điền trước khi mở cuộc đua |
| `còn giữ chỗ "[CHƯA NHẬP …]": nhập nội dung thật` | CÒN TRỐNG | Thay chữ giữ chỗ bằng nội dung thật (mục 7.3) |
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

Sau khi `leg:check` ra "Hợp lệ", cho **bot** chơi hết chặng để chắc mọi bước đi được, mọi hộp mở được, đội về đích và có xếp hạng. Không cần chạy máy chủ hay trang Host: lệnh tự dựng một máy chủ tạm trong máy (y như máy chủ thật), nạp chặng, tạo đội bot, mở cuộc đua, rồi mỗi bot đi bộ theo đường đi bộ tới từng điểm, mở hộp, làm nhiệm vụ (bấm "Nhận thử thách" nếu có câu gợi ý; **gõ** đáp án đầu tiên trong `answers`, không có thì trong `referenceAnswers`, không có nữa thì "(bot) trả lời"; nhiệm vụ ảnh thì gửi bài rỗng) và check-in ở thảm. Một **Host ảo** duyệt bài của các bot.

```
npm run sim -- --leg ~/Documents/chang-that/macao-1.json --bots 2 --speedup 2
```

- `--leg`: đường dẫn file chặng, hoặc mã chặng có sẵn (`mini`, `bruxelles-demo-filled`).
- `--bots`: số đội bot (2 là đủ). `--speedup 2`: nhanh gấp đôi (tối đa 2). Chặng 4 bước ≈ 2,3 km mất ≈ 7 phút ở `--speedup 2` (đo thật); lệnh tự dừng sau `--minutes` phút mô phỏng (mặc định 30) nếu bot chưa xong.
- `npm run sim -- --help` in mọi tùy chọn.
- Đọc kết quả: dòng `Chặng <mã> (N bước): 2 / 2 đội về đích (bị loại: 1) · xếp hạng 2 dòng` là đạt (bot về cuối cùng luôn bị loại, đúng luật). `← LỖI` ở cuối dòng hoặc mã thoát khác 0 = có đội không về đích / quá ngân sách ghi dữ liệu. "Thao tác bị từ chối (thử lại)" là các lần bot bấm F / gửi bài khi máy chủ chưa nhận vị trí mới nhất (thử lại là qua): chỉ đáng lo khi kèm "kẹt ở bước …". "Đội bị đánh dấu vượt tốc" khi tua nhanh là bình thường.
- **Host ảo:** mọi bài chờ duyệt (câu gõ lẫn bài ảnh) được duyệt tự động; riêng câu đầu tiên của bot thứ hai ở thử thách đầu tiên bị **Phạt** một lần (bot chờ hết đếm ngược rồi gửi lại). Với Lựa chọn kép, bot thứ i chọn nhánh số i chia 2 lấy dư (bot đầu nhánh đầu, bot hai nhánh sau, …); bot thứ ba (chỉ có 2 bot thì bot thứ hai) còn **đổi nhánh một lần** ngay sau khi chọn (chờ hết đếm ngược, đi tới hòm nhánh kia, mở và làm). Vì vậy một lần chạy `--bots 2` thử đủ: gõ đáp án, Host duyệt, Host phạt, hai nhánh, đổi nhánh. Chặng thật thì **Host thật duyệt**, không có bot.
- **Thời gian chờ:** để không phải chờ 3 và 10 phút thật, `sim` nạp chặng với hai đồng hồ đếm ngược của `penalties` rút xuống còn 6 và 12 giây (chỉ trong lần chạy thử; file của bạn không bị sửa; thử thách có `retryLockMinutes` riêng vẫn giữ số của nó). Chặng test đã có (`mini`, `bruxelles-demo-filled`) vẫn khai báo phạt 3 và 10 phút như mặc định.
- Báo cáo thêm số câu trả lời, số lần Duyệt / Phạt và số lần đổi nhánh.
- **Kịch bản Host đầy đủ (`--full`, cần ≥ 6 bot):** thêm vào lần chạy: Host ảo **Hoàn tác** một Duyệt trong 10 giây rồi duyệt lại, **Xóa cờ** đỏ đầu tiên (khi tua nhanh bot luôn bị cờ vượt tốc), **Cho qua** bot thứ 5 ở thử thách đầu (bot đó không trả lời), bot cuối đứng trên thảm mà không check-in → khi các đội khác về đích Host bấm **Kết thúc** → đội đó BỊ LOẠI; cuối cùng tải tệp "Xuất dữ liệu thời gian" (CSV + JSON) và kiểm: đủ đội, cột "Hạng cuối", không có IP. Dòng `Kịch bản Host (--full)` và `Xuất dữ liệu thời gian` của báo cáo phải không có `LỖI`. Chặng test đủ mọi loại bước: `npm run sim -- --leg full --bots 8 --speedup 2 --full`.
- **Ngân sách Cloudflare:** dòng `N đội × 2 giờ` nội suy từ lần chạy ngắn ra cuộc đua thật 2 giờ với `--teams N` đội (mặc định 8) và so với ngưỡng SPEC §3 tính theo tỉ lệ (20 đội: 40 000 request, 20 000 dòng); `← VƯỢT NGÂN SÁCH` làm lệnh thoát khác 0.

Chơi thử bằng tay (một mình đóng vai Host và đội): chạy `npm run dev:worker`, mở `http://localhost:8787/host.html` (mật khẩu Host là `HOST_PASSWORD` trong `worker/.dev.vars`, xem README), làm như mục 2 với một mã cuộc đua riêng, rồi mở link `/?race=<mã>` ở một cửa sổ khác và nhập mã đội.
