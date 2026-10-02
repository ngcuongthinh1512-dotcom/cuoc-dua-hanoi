# Phase 7 review 2 – dry-run của người tổ chức (không biết lập trình)

Trạng thái: XONG (commit đang xét: 82b90d6).

Cách làm: chỉ đọc `docs/LEG_FORMAT.md`. Viết chặng nháp ở scratchpad (`paris-that.json`, không nằm trong repo): xuất phát giữa cầu Bir-Hakeim (tọa độ lấy từ ví dụ trong tài liệu), L1 (GIẢ, phát ngoài game, điểm đến = chính nơi xuất phát), **L2 "Lộ trình 2"** với mật thư nguyên văn tới Palais de Tokyo, L3 (GIẢ) và Chặng dừng (GIẢ) ở Trocadéro. Đã chạy `npm run leg:check` qua nhiều vòng sửa, chạy lệnh "Xem:" (ảnh), rồi `npm run sim -- --leg <file> --bots 2 --speedup 2 --minutes 15` (harness wrangler: nạp chặng bằng `host.leg {json}`, chơi hết). Chỉ đọc mã nguồn để kiểm chứng sau khi đã gặp vấn đề (và để biết tham số của `sim`, vì không có `--help`).

## Kết quả chính

- **Tâm Palais de Tokyo (48.86427, 2.29676, trung bình đỉnh của way/79219351) KHÔNG qua:** `LỖI Bước 2 (L2) › điểm đến: tâm vùng nằm trong một tòa nhà (yes)`. Tọa độ kiểu ghim Google (48.8641, 2.2966) và "lối vào" (48.86461, 2.29660) cũng LỖI như vậy. Tài liệu khuyên: đặt ở vỉa hè / quảng trường, không phải tâm tòa nhà, xem bản đồ vệ tinh và ảnh lệnh `Xem:` (§7, §8, §11).
- Điểm dùng được: **48.86470, 2.29690** ("Place de Tokyo", sân trước phía Avenue du Président Wilson), bán kính 30, bãi xe gợi ý 48.86476, 2.29640 → `Hợp lệ: 3 cảnh báo, 0 ô còn trống` (2 cảnh báo cầu Bir-Hakeim + 1 "file nằm ngoài worker/legs/"). Sân giữa hai cánh (48.86425, 2.29712 / 48.86430, 2.29730) cũng qua; hai điểm trong sân rơi vào bể nước bị cảnh báo là "sông".
- `sim`: **2 / 2 đội về đích, xếp hạng 2 dòng**, L1 mở hộp ngay khi vào game (kiểu Bir-Hakeim chạy được), nhưng lệnh kết thúc **exit 1 với "← LỖI"** do ngưỡng dòng ghi / đội (phát hiện 1).
- Không để lại tiến trình nào (vite 5297 của lệnh Xem và workerd của sim đã tự tắt; các workerd / vite / chrome còn chạy lúc kết thúc là của reviewer khác: `sim --race rv2c-demo`, `vitest run`, vite :5437).

## Phát hiện (area: host-tools)

### 1. MAJOR – `sim --leg` báo LỖI (exit 1) với mọi chặng có độ dài thật
`scripts/sim.ts:424` tính `rowsPerTeam: c.rows / opts.bots` (tổng mọi dòng SQLite, kể cả dòng vị trí chung 2 s / dòng replay 10 s vốn không phụ thuộc số đội) rồi `:442/:468` so với 110 (ngưỡng plan §7 dành riêng cho một lượt `mini`).
Chứng cứ: chặng 4 bước ≈ 2,3 km, 2 bot, 826 s mô phỏng → `dòng SQLite 324` → `dòng ghi / đội 162 (ngân sách ≤ 110) ← LỖI`, `EXIT=1`, dù `2 / 2 đội về đích · xếp hạng 2 dòng`. Chặng thật 2 giờ, 7 đội: ≈ 36 dòng chung / phút × 120 / 7 ≈ 600 / đội → luôn LỖI.
Sửa: chỉ áp 110 / đội cho phần dòng sự kiện (trừ dòng vị trí / replay chung), hoặc chỉ áp khi `--leg mini`; với chặng khác so tổng với ngân sách SPEC §3 (< 20 000 / cuộc đua) quy theo thời lượng.

### 2. minor – Múi giờ sai giờ là LỖI nhưng tài liệu nói CẢNH BÁO; và LỖI này che hết các kiểm tra bản đồ
`docs/LEG_FORMAT.md:52` ("Sai tên: `leg:check` cảnh báo") và `:372` (mức CẢNH BÁO). Thực tế `"timezone": "Paris"` / `"GMT+7"` → `LỖI múi giờ: ... dùng tên IANA` và **không còn bảng điểm, không còn cảnh báo cầu / nhà** (lỗi này chặn cả phần kiểm tra không gian), nên người tổ chức phải sửa 2 vòng mới thấy lỗi "trong nhà".
Sửa tài liệu: `| timezone | không | "Asia/Ho_Chi_Minh" | ... Sai tên: LỖI (máy chủ từ chối). Viết đúng dạng Châu_lục/Thành_phố: "Asia/Ho_Chi_Minh", "Europe/Paris" (không dùng "GMT+7", "Paris") |`; bảng §11 đổi mức thành LỖI. Thông báo: thay "tên IANA" bằng "tên múi giờ chuẩn dạng Châu_lục/Thành_phố". `leg-check.ts` vẫn nên in bảng điểm khi chỉ có lỗi múi giờ (đã biết, còn tồn).

### 3. minor – Tài liệu không nói cách viết bước 1 khi mật thư 1 dẫn tới chính nơi xuất phát (đúng trường hợp Bir-Hakeim)
`docs/LEG_FORMAT.md:122`: "bước 1 là 'đi tới điểm đầu' từ chỗ xuất phát" ngụ ý điểm đầu khác nơi xuất phát. Buổi thật: mật thư 1 (phát ngoài game) dẫn tới cầu Bir-Hakeim, đội vào game ở đó, hộp có "Lộ trình 2" đặt ở đó. Tôi phải đoán đặt `L1.destination` = tọa độ `start`. Đã kiểm: `leg:check` qua ("đi bộ ≈ 0 m"), `sim` mở hộp L1 ngay tại chỗ (cả hai bot có thông báo `L1: clueNew`).
Đề nghị thêm vào §6: "Nếu mật thư 1 (phát ngoài game) dẫn đội tới **chính nơi xuất phát** (vd. giữa cầu Bir-Hakeim), hãy cho `destination` của bước 1 **trùng** `start` (cùng lat/lon, bán kính ≥ 20 m). Đội vào game là đứng ngay trong vùng và mở được hộp chứa mật thư kế tiếp (Lộ trình 2)." `leg:check` có thể in một dòng ghi chú (không phải cảnh báo) khi bước 1 trùng xuất phát.

### 4. minor – Ảnh lệnh "Xem:" không cho thấy điểm, khác với điều tài liệu hứa
`docs/LEG_FORMAT.md:183` "tạo ảnh ... chụp khu vực 80 m quanh điểm". Ảnh `Xem:` của L2 (`/preview.html?at=48.86427,2.29676&r=80`) là 2 chunk nguyên (`-8_0 -7_0`, ≈ 500 × 250 m) chụp xiên từ xa, **không có ghim, không có vòng bán kính**: không biết điểm nằm trên mái, trong sân hay ngoài đường. Tài liệu §11 lại bảo "xem ảnh lệnh `Xem:`" để sửa lỗi "trong nhà".
Sửa: preview vẽ cột ghim + vòng `radius` khi có `at=` (leg:check truyền thêm `&mark=1&zr=<radius>`) và đặt camera khung ≈ 2r; nếu chưa làm được thì sửa câu: "ảnh tổng quan khu vực (chưa có ghim); muốn thấy đúng điểm hãy mở link `Bản đồ:`".

### 5. minor – Lỗi "trong nhà" khó hiểu và không gợi ý chỗ thay thế
Tâm Palais de Tokyo → `tâm vùng nằm trong một tòa nhà (yes)`: "(yes)" là giá trị thẻ `building` của OSM, vô nghĩa với người tổ chức. `leg:check` đã gợi ý tọa độ bãi xe có thật, nhưng không gợi ý điểm ngoài nhà gần nhất; tôi phải thử 13 tọa độ.
Đề nghị: `tâm vùng nằm trong tòa nhà "Palais de Tokyo"; điểm ngoài nhà gần nhất (có đường đi bộ): 48.86470, 2.29690 – Place de Tokyo, cách 48 m`. Tài liệu §8 thêm: "Ghim Google Maps của một địa danh thường nằm **trong** tòa nhà; hãy nhấp chuột phải lên vỉa hè / sân trước, không phải lên tên địa danh."

### 6. minor – Bể nước của đài phun nước bị gọi là "sông"
48.86410, 2.29715 và 48.86395, 2.29740 (sân giữa Palais de Tokyo, OSM way/79219333 `natural=water, water=basin`, "Fontaine du palais de Tokyo", cách sông ≈ 200 m) → `nằm giữa mặt nước (sông), ... dời vào bờ hoặc lên cầu`. Người tổ chức đang ở sân bảo tàng sẽ tưởng tọa độ sai hẳn.
Đề nghị: `nằm giữa mặt nước (sông / hồ / bể nước), đội không đứng được; dời ra chỗ đất cạnh đó`; bảng §11 sửa tương ứng.

### 7. minor – Hộp đặt giữa lòng đường xe chạy vẫn qua im lặng
48.86484, 2.29695 (tim đường Avenue du Président Wilson, `highway=primary`, 3 làn, có xe NPC) → không cảnh báo. Tài liệu §7 bảo "vỉa hè" nhưng không có kiểm tra nào.
Đề nghị cảnh báo: `tâm nằm giữa lòng đường xe chạy (Avenue du Président Wilson): hộp mật thư sẽ đứng giữa dòng xe; dời lên vỉa hè`. Tài liệu §7 nói rõ: "Hộp mật thư (vật thể trong game) đứng đúng tại `lat`, `lon`."

### 8. minor – Chọn bán kính: tài liệu chỉ có khoảng 15–40, thiếu cách nghĩ
`docs/LEG_FORMAT.md:136` chỉ phân loại "quảng trường 35–40, ngõ 15–20". Thiếu: (a) vùng là **vòng tròn phẳng, không tính độ cao** (`worker/src/race/steps.ts:50` so `hypot(x, z)`): giữa cầu Bir-Hakeim, vùng 30 m bao cả lối đi Allée des Cygnes bên dưới, nên đội đi dưới gầm cầu cũng "đã tới"; (b) bán kính nên ≥ khoảng cách từ tâm tới lối đi bộ gần nhất (cảnh báo "đường đi bộ gần nhất cách tâm N m" đã có, nhưng tài liệu không nói trước); (c) vùng được phép trùm lên tòa nhà / bên kia đường.
Đề nghị thêm: "Vùng là vòng tròn trên mặt phẳng (không tính cao thấp): điểm trên cầu có lối đi bên dưới thì đội đứng dưới gầm cũng tính là tới. Chọn bán kính sao cho từ lối đi chính đội đi tới đã vào vùng; sân trước một tòa nhà lớn: 25–30 m."

### 9. minor – Không có cách xem điểm trên ảnh vệ tinh hoặc đứng thử trong game
§8 bảo "kiểm tra vị trí trên bản đồ vệ tinh", §9 bảo "vào game đứng ở đó", nhưng `leg:check` chỉ in link OpenStreetMap (bản đồ vẽ, không vệ tinh) và không có cách nào được hướng dẫn để vào game tại một tọa độ (phải tạo cuộc đua rồi đi bộ 1,4 km từ Bir-Hakeim). Danh mục địa danh `client/src/geo/landmarks.ts` không được tài liệu nhắc tới, và chỉ chứa mã OSM, không có tọa độ, nên không giúp được người tổ chức.
Đề nghị `leg:check` in thêm cho mỗi điểm: `Vệ tinh: https://www.google.com/maps/@?api=1&map_action=map&center=48.86470,2.29690&zoom=19&basemap=satellite` và `Vào game (máy chạy npm run dev): http://localhost:5173/?player=<x>,<z>` (tọa độ thế giới đã đổi sẵn), rồi tài liệu §8 mô tả hai dòng này.

### 10. minor – `sim` không có trong tài liệu, không có `--help`, đếm cả thông báo thường là "bị từ chối"
- `npm run sim -- --help` → stack trace `ERR_PARSE_ARGS_UNKNOWN_OPTION` (`scripts/sim.ts:452`). Tham số chỉ ghi trong chú thích đầu file. LEG_FORMAT §1 bước 4 / §2 không nhắc tới cách chơi thử tự động, cũng không nói trang Host ở đâu (`http://localhost:8787/host.html` khi `npm run dev:worker`) và mật khẩu Host (`worker/.dev.vars`), dù README có.
- `scripts/sim.ts:218` đẩy **mọi** `notice` vào `refused`; `:444` in "Thao tác bị từ chối (thử lại): 4, ví dụ L1: clueNew; L1: clueNew; L2: clueNew". `clueNew` = "Mật thư mới đã vào Sổ mật thư" (client `Toasts.ts:29`), không phải bị từ chối.
Đề nghị: thêm mục "Chơi thử tự động" vào LEG_FORMAT: `npm run sim -- --leg đường/dẫn/chặng.json --bots 2 --speedup 2` (≈ 7 phút cho chặng 2,3 km), cách đọc kết quả; thêm `--help`; bỏ `clueNew` khỏi danh sách từ chối.

### 11. minor – Tài liệu nói sai về các chặng mẫu
- `docs/LEG_FORMAT.md:196`: `mini` ra "Hợp lệ, không cảnh báo" → thực tế `Hợp lệ: 1 cảnh báo` (cầu Bir-Hakeim).
- `:5` và `:341`: `paris-demo.json` có "các ô mật thư / nhiệm vụ để trống". Thực tế 7 mật thư lộ trình (L1–L6) **đã có chữ trông như thật, không ghi "(GIẢ)"** (vd. L1 "Ngược đại lộ đẹp nhất thế giới về phía tây..."); chỉ 18 ô nhiệm vụ trống. Người tổ chức chép demo dễ giữ nhầm các câu này như nội dung thật. Demo còn 1 cảnh báo `Bước 9 (L6) › đường đi bộ gần nhất cách tâm 39 m, xa hơn bán kính 20 m`.
Đề nghị: thêm "(GIẢ)" vào các mật thư demo (hoặc để trống), sửa câu ở `:196` thành "ra Hợp lệ, chỉ 1 cảnh báo cầu Bir-Hakeim (bình thường)", và sửa cảnh báo L6 của demo.

### 12. minor – Cảnh báo cầu Bir-Hakeim gây hoang mang, tài liệu chỉ miễn cho điểm xuất phát
`cầu ... không bắc qua sông (cầu trên đất liền ...)` cho một cây cầu ai cũng biết là bắc qua sông Seine (điểm giữa cầu nằm trên đảo Île aux Cygnes). `docs/LEG_FORMAT.md:370` chỉ nói "điểm xuất phát giữa cầu Bir-Hakeim của chặng demo" là bình thường; cùng cảnh báo hiện cho `Bước 1 (L1) › điểm đến` (trùng xuất phát) thì không nói gì.
Đề nghị câu thông báo: `nằm trên đoạn cầu bắc qua đất (bờ / đảo), không phải qua mặt nước: kiểm tra đúng mặt cầu đi bộ, không phải nóc cầu cạn metro`; tài liệu: "Giữa cầu Bir-Hakeim (xuất phát, và điểm đến bước 1 trùng xuất phát) thì cảnh báo này là bình thường."

### 13. minor – Cảnh báo "file nằm ngoài worker/legs/" mâu thuẫn với cách tài liệu cho phép, và để trong `worker/legs/` không có lợi gì
`docs/LEG_FORMAT.md:190` cho phép "giữ ngoài kho mã và chỉ chọn file khi nạp ở trang Host", nhưng cách này luôn bị CẢNH BÁO "nội dung chặng thật nên để trong worker/legs/". Mặt khác file thả vào `worker/legs/` **không** hiện thành chặng đóng gói (danh sách cố định `worker/src/race/leg.ts:14`: `paris-demo`, `paris-demo-filled`, `mini`) và `worker/legs/` không bị `.gitignore` → đáp án thật vào git khi ai đó `git add -A`.
Đề nghị: khuyên giữ chặng thật **ngoài thư mục dự án** (hoặc thêm `worker/legs/private/` vào `.gitignore`), chỉ cảnh báo khi file nằm trong `client/` hoặc trong thư mục được commit.

### 14. minor – `yawDeg` ngược chiều la bàn, dễ nhìn sai hướng
`docs/LEG_FORMAT.md:76`: "90 = tây ... −90 = đông" (ngược la bàn). Từ giữa cầu Bir-Hakeim nhìn về Palais de Tokyo / Trocadéro là hướng la bàn ≈ 34° (đông bắc) → phải gõ `-34`; người tổ chức dùng la bàn / Google Maps sẽ gõ `34` và đội nhìn về tây bắc (Passy).
Đề nghị câu: "`yawDeg` = **trừ** hướng la bàn: muốn nhìn hướng la bàn 34° (đông bắc) thì ghi `-34`; nhìn đông (90°) ghi `-90`." Hoặc `leg:check` in "nhìn về: đông bắc (34°)" cạnh điểm xuất phát.

### 15. minor – Lỗi chú thích `//` không được đoán nguyên nhân
§12 nói lệnh "đoán nguyên nhân" và liệt kê chú thích là 1 trong 4 lỗi hay gặp. Dấu ngoặc cong, dấu phẩy thập phân, dấu phẩy thừa đều có dòng "Có thể do: ..." (tốt), nhưng `"yawDeg": 33, // huong nhin` chỉ ra `Expected double-quoted property name (dòng 9, cột 19)` (tiếng Anh), không có gợi ý.
Đề nghị gợi ý: `Có thể do: có chú thích // hoặc /* */: JSON không cho chú thích, hãy xóa (ghi chú thì để trong "label")`.

## Những gì chạy tốt
- Các lỗi kiểu dữ liệu / tên trường / bán kính / mã bước / loại bước / đảo lat-lon đều bằng tiếng Việt, chỉ đúng chỗ (`Bước 2 (L2) › điểm đến › bán kính: phải ≤ 40 m`), sửa được ngay theo bảng §11.
- Bảng điểm (tên đường + quận + link OSM có ghim + quãng đi bộ) rất có ích: "Place de Tokyo, Quận 16" xác nhận ngay đúng chỗ; gợi ý bãi xe có thật dùng được luôn.
- Mật thư nguyên văn (có dấu, có dấu phẩy) không gây lỗi; `sim` nạp file từ ngoài repo và chơi hết chặng.
