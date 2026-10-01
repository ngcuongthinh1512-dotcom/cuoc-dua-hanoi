# Phase 7 – Critic: độ phủ SPEC (coverage)

Trạng thái: XONG. Đối chiếu `docs/plans/phase7.md` + commit nền `71a31a2` (schema / check / zones, giao thức v2, db v2, stub engine, RaceClient / RaceHud, RACE_RULES, TODO) với SPEC §8 (toàn bộ), §10, §13.8, §15 (Phase 7), §17.9–17.12, `docs/RACE_RULES.md` và quyết định (a)–(i). Chỉ đọc; không sửa file nào ngoài báo cáo này.

## Tóm tắt

Kế hoạch phủ gần đủ: (a) không còn `roadblock` ở schema / RACE_RULES / TODO; (b) điểm xuất phát lấy từ file chặng, offline giữ Concorde; (c)(d) đồng hồ từng đội = bây giờ − `startAt` Host nhập, `welcome.raceTime` + `summary.raceTime`; (e) `startOrder` gán ở lần mở WebSocket đầu, ghi chung dòng `teams.state` trước `welcome`, `showStartOrder` chỉ lần đầu, banner 15 s theo sim time (sim time đứng yên khi đang tải nên không mất banner); (f) hộp theo bước thật, không gửi bước sau; (g) tạm dừng không trừ (RACE_RULES §11 đã sửa, TODO đã gỡ); (h) ngân sách 7 / 20 đội; (i) LEG_FORMAT + leg:check + chặng test GIẢ. Móc Phase 8 (`verifyTask`, cột `step_progress` đủ 19 cột, `CardStatus`, op mới), Phase 9 (`walkOnly`, `penalties`, `specials`), Phase 10 (`hostView`, `book` của đội) có sẵn.

Lỗ hổng chính: hợp đồng bãi xe (D18 / `RaceEffect.park`) đặt xe của lộ trình bắt buộc đi bộ vào bãi của điểm **phía trước**; quy tắc "mặt đi được thấp nhất có khoảng trống" (D17) áp cho mọi hộp có thể đặt hộp xuống gầm cầu; "Tại điểm này" (D21) chưa giới hạn ở vùng của bước đội đang/đã làm; `host.leg` chưa nói gì về đội đã vào game, hành lang xe; leg:check bỏ sót điểm riêng của nhánh Lựa chọn kép + `bikeParking`, chặng test không có `task.location`; schema chưa có chỗ cho tham số mini-game (anh sẽ nhập thử thách cuối phase); leg:check không cho anh thấy điểm nằm ở đâu.

## Phát hiện

### BLOCKER

**B1. Bãi xe của lộ trình bắt buộc đi bộ là bãi của điểm phía trước** — `docs/plans/phase7.md` D18; `worker/src/race/steps.ts` `RaceEffect { kind: 'park'; step }` ("the rack of `step`'s zone").
- Vấn đề: `step` = bước vừa NHẬN. Với lộ trình `mandatory: 'walk'`, `zones[step]` / `destination.bikeParking` là **điểm đến sắp tới**, không phải điểm đội đang đứng. SPEC §6.4: "để vào bãi" = bãi cạnh điểm vừa mở hộp. Mã bãi `rack:<id bước>` theo bước chứ không theo điểm → hai bước cùng một điểm (L2 + D1 + L3 ở Trocadéro) thành 3 bãi, `maxBikes` sai.
- Tình huống: chặng thật có `bikeParking` ở mọi điểm (leg:check sẽ gợi ý điền) → đội mở hộp ở Trocadéro nhận L3 (đi bộ) → xe bị dời 600 m sang bãi chân tháp Eiffel (điểm đến bí mật), hiện cho các đội đang ở gần đó; đội tới Eiffel thấy sẵn xe của mình.
- Sửa: `park` dùng vùng của bước vừa HOÀN THÀNH (`zones[p.step]` trước khi tăng; nhiệm vụ ở nơi khác: vùng `task.location` khi tới đó), khóa bãi theo điểm (tâm vùng làm tròn, hoặc id bước đầu tiên dùng điểm đó).

### MAJOR

**M1. D17 "mặt đi được thấp nhất có khoảng trống ≥ 2,2 m" cho mọi hộp mật thư** — D17, track B, `raceClient.headroom`.
- Vấn đề: đúng cho cầu cạn metro Bir-Hakeim, nhưng ở bất kỳ điểm nào nằm trên cầu bắc qua đất (đầu cầu qua đường kè, cầu qua đảo) thì mặt thấp nhất là đường / đảo dưới gầm cầu. Ngay tại tâm Bir-Hakeim (§2.1 của kế hoạch: mũi đảo Thiên Nga dưới cầu, `riverDeck` 1,3 m là giá trị dự phòng) quy tắc có thể đưa đội xuống đảo thay vì mặt cầu.
- Tình huống: anh đặt hộp ở đầu cầu Alexandre III phía Cours la Reine → hộp nằm dưới gầm cầu trên đường kè, đội trên cầu không thấy.
- Sửa: không đổi "cao nhất" chung; chỉ loại mặt trên của cầu cạn đường sắt (layer ray) khỏi `surface()` khi đặt spawn / hộp (hoặc mọi lúc: người chơi không nên đứng trên nóc metro), hoặc chọn mặt gần nhất với độ cao của cạnh đồ thị đi bộ gần nhất. leg:check cảnh báo khi tâm vùng nằm trên polygon cầu bắc qua đất.

**M2. "Tại điểm này" (D21) có thể lộ điểm của bước sau** — D21.
- Vấn đề: "đội online trong vùng nào … gửi `{t:'zone'}` cho các đội trong vùng đó" không nói vùng nào. Nếu là mọi vùng của chặng, đội đi ngang vùng của một bước chưa nhận sẽ nhận tin `zone` → biết nơi đó là điểm đua (trái §17.10 / quyết định (f)).
- Sửa: chỉ GỬI bảng cho đội đang đứng trong vùng của bước hiện tại (hoặc bước đã làm) của chính nó; DANH SÁCH = các đội online đang ở trong vùng đó. Test: đội đứng trong vùng bước sau không nhận tin `zone` nào.

**M3. `host.leg` khi đã có đội vào game + hành lang xe** — D11, track E, `client/src/host/main.ts`.
- Vấn đề: lobby cho đội vào game (gán `startOrder`, vị trí ở điểm xuất phát cũ, dòng `step_progress` bước 1) rồi mới nạp chặng khác → vị trí / dòng cũ (khóa theo id bước) còn nguyên, banner "vị trí thứ n" đã dùng hết; đội online không được đẩy thẻ mới; `BikeService` giữ `vehicles` của chặng cũ (dựng trong constructor); ứng viên đặt xe + xe đã đặt theo hành lang chặng cũ (demo Concorde → Khải Hoàn Môn) vẫn chạy cho tới khi Host tự bấm tính lại.
- Sửa: từ chối `host.leg` khi có đội đã có `startOrder` (thông báo "tạo cuộc đua mới (race id mới) cho buổi thật"), hoặc xóa `step_progress` + đưa đội về điểm xuất phát mới; nạp chặng xong thì xóa ứng viên / xe trống cũ và trang Host tự tính lại hành lang; LEG_FORMAT ghi rõ quy trình "race id mới → nạp chặng → tạo đội → mở".

**M4. Hành lang xe bỏ qua nơi làm nhiệm vụ** — track E, `spawnCandidates(g, steps, [], hostPage.corridor)`.
- Vấn đề: `HostState.steps` chỉ có điểm đến của lộ trình; `checkpoints` truyền `[]`; `hostPage.corridor` là bản sao số của chặng demo. SPEC §6.2 (2): xe cách hộp **và điểm thử thách** ≥ `minDistanceFromCheckpoint`.
- Tình huống: thử thách / nhánh có `task.location` riêng → xe mọc ngay tại điểm thử thách, hành lang không phủ đoạn tới đó.
- Sửa: Host nhận các vùng (`stepZones` + `branchZone`, chỉ Host) làm điểm hành lang + checkpoints, và `vehicles` của chặng đã nạp.

**M5. leg:check bỏ sót điểm của nhánh Lựa chọn kép và `bikeParking`; chặng test không có các dạng này** — `shared/src/leg/check.ts` (khối `geo`), `worker/legs/test/mini.json`, `paris-demo.filled.json`.
- Vấn đề: `stepZones` trả vùng của bước trước cho `detour` → vòng lặp bỏ qua (`z.x === prev.x`), nên `branches[k].task.location` không được kiểm "trong nhà" / "đi bộ tới được"; `bikeParking` chỉ kiểm khung bản đồ. Không chặng test nào có `task.location`, nhánh có điểm riêng, `bikeParking`, `teaser`, `timeLimitMinutes`, `media` → harness / sim / ví dụ LEG_FORMAT không chạy qua chúng.
- Sửa: kiểm từng `branchZone` (từ vùng của bước trước, rồi bước sau đi từ vùng nhánh), `bikeParking` ngoài nhà + cách tâm > bán kính (SPEC §6.4 "ngoài vùng ~offsetMeters"); thêm vào `mini` một thử thách có `task.location`, một nhánh có điểm riêng, một `bikeParking`, một `teaser`.

**M6. Schema chưa nhập được tham số mini-game** — `taskSchema` (strictObject), D13, LEG_FORMAT.
- Vấn đề: anh sẽ nhập thử thách thật cuối phase này, nhưng `find_objects` / `photo_match` / `binocular_scan` / `delivery` / `timed_drive` / `memory_ui` cần tham số (vị trí vật, ảnh + hướng, cổng…) mà schema không có chỗ; trường lạ bị từ chối.
- Sửa: LEG_FORMAT nói rõ Phase 7 chỉ đầy đủ cho `answer` / `free` (các kiểu khác: mô tả trong `description`, tham số thêm ở Phase 8 bằng trường tùy chọn, file vẫn hợp lệ); hoặc thêm ngay `params` tùy chọn (`z.record(z.string(), z.unknown())`) để anh ghi trước.

**M7. Không có cách nhìn điểm mình vừa nhập** — D12, LEG_FORMAT (SPEC §13.1 "xem trước lộ trình" để Phase 10).
- Vấn đề: tọa độ gõ nhầm vẫn trong bản đồ, ngoài nhà, đi bộ tới được → qua hết luật, chỉ lộ ra lúc đua.
- Sửa (rẻ): bảng tóm tắt của leg:check in kèm mỗi điểm tên phố / quận gần nhất (`geo/locate.ts`), link OSM `?mlat=…&mlon=…#map=19/…`, và lệnh chụp `npm run screenshot -- --path "/preview.html?at=lat,lon&r=80" --name <id>`.

**M8. Nhiệm vụ ở nơi khác: xe bị để bãi lúc nhận mật thư** — D18, SPEC §6.4 "nhiệm vụ tại điểm".
- Vấn đề: chưa định nghĩa khi `task.location` (hoặc vùng nhánh) ở xa. Để bãi ngay khi nhận → đội phải đi bộ tới nơi làm nhiệm vụ; bãi lấy từ `destination` không có ở bước nhiệm vụ.
- Sửa: nhiệm vụ tại điểm → để bãi khi nhận (bãi của điểm đó); nhiệm vụ ở nơi khác → để bãi khi đội vào vùng nhiệm vụ, bãi `task.location.bikeParking`.

### MINOR

- **m1** Bước 1 bắt buộc là lộ trình (`checkLeg` lỗi) dù `stepZones` đã xử lý thử thách / Lựa chọn kép ở điểm xuất phát → hạ xuống cảnh báo; LEG_FORMAT giải thích quan hệ "mật thư phát ngoài game" ↔ bước 1 trong game (D3 chưa hỏi anh).
- **m2** Cảnh báo "đáp án lộ trong chữ" so với chữ của mọi bước, kể cả bước sau (đội đọc sau khi giải), và khớp chuỗi con (đáp án 3 chữ như "nam" khớp "Năm") → chỉ xét chữ của bước ≤ bước đó, khớp theo từ.
- **m3** `route_info` / `detour` không có `media` (SPEC §8.11: mỗi mục Sổ có ảnh/video) → thêm `media` tùy chọn.
- **m4** Lobby chặn mọi thao tác tới khi Host "Mở cuộc đua", trong khi đồng hồ đội chạy từ `startAt` và không có súng xuất phát chung (c): Host quên bấm → đội mất giờ. Gợi ý: tự mở khi Host nhập giờ xuất phát đầu tiên, hoặc Host thấy cảnh báo đỏ khi có đội online / có `startAt` mà còn lobby; RACE_RULES nói về trạng thái này.
- **m5** Vào vùng / đứng trên thảm trong lúc lobby / tạm dừng rồi đứng im: không có vị trí mới nên không ghi tới, không check-in sau khi tiếp tục (client chỉ gửi `checkin` định kỳ khi có phạt) → khi `resume` / `start`, engine xét lại vị trí hợp lệ cuối của đội online, hoặc client gửi `checkin` định kỳ mỗi khi đứng trong vùng thảm chưa về đích.
- **m6** Check-in = vào vùng thảm bán kính 20–40 m (SPEC §8.6 "bước lên thảm") → bán kính thảm riêng nhỏ (config / chặng); thảm + NPC cần hướng (`yawDeg` tùy chọn ở `destination`).
- **m7** Xếp hạng tạm thời: cùng bước → so giờ tuyệt đối xong bước trước, thiên vị đội xuất phát sớm (§17.12) → so `prevDoneAt − startAt` khi có giờ xuất phát.
- **m8** Vào lại sau khi về đích / sau "Kết thúc": kế hoạch chỉ nói khán giả ngay sau check-in; SPEC §8.10 yêu cầu vào lại thấy màn kết quả + khán giả (B: `welcome.view.finishAt` → khán giả ngay).
- **m9** Lần vào đầu: thẻ đầy đủ L1 tự mở (modal) cùng lúc banner 15 s → banner trôi khi đang đọc thẻ. Quy định thứ tự (banner nằm trên / cạnh thẻ, hoặc không tự mở thẻ bước 1 vì đã nhận ngoài game). "Thẻ chưa thấy" chỉ nhớ trong trang → mỗi F5 lại bật thẻ đầy đủ.
- **m10** Giờ xuất phát: `datetime-local` mặc định theo phút (`step="1"` để có giây); "Bây giờ" nên để server đóng dấu (đồng hồ máy Host lệch); đổi `startAt` thì cập nhật `clue_opened_at` bước 1; Host thấy `joinedAt`.
- **m11** SPEC §13.1: nút Xuất phát khóa khi còn ô trống, có "Vẫn xuất phát" → làm ngay ở "Mở cuộc đua" của Phase 7 (hộp xác nhận liệt kê ô trống), rẻ.
- **m12** Nút hình cuốn sổ trên HUD (SPEC §8.11, RACE_RULES §8) không có trong track C.
- **m13** leg:check: tâm vùng nằm trên sông (water.json) chỉ ra cảnh báo khoảng cách; `timezone` không kiểm (`Intl` ném lỗi ở trang Host); danh sách bỏ qua "trong nhà" viết tay (cầu, Eiffel) nên dùng cùng điều kiện với bộ dựng nhà (footprint nào thành khối đặc).
- **m14** LEG_FORMAT cho người không lập trình: lỗi JSON hay gặp (dấu phẩy thập phân kiểu Việt "48,85", dấu ngoặc cong “ ” từ Word / Google Docs, dấu phẩy thừa, không có chú thích), lỗi `JSON.parse` dịch ra "dòng X, cột Y"; một file mẫu để chép; `destination.name` không bao giờ hiện cho đội; đáp án phải dựa trên thứ có trong game (SPEC §10); `media` là link công khai (R2 ở Phase 10).
- **m15** Móc Phase 8: cột `task_state` (JSON) trong `step_progress` cho tiến độ mini-game khi thoát (SPEC §8.10: vật đã nhặt, giờ khóa) để Phase 8 không ALTER; `hostApproval.contactUrl` / `contactLabel` chưa có đường xuống client (nút "Mở Facebook gửi bài").
- **m16** Chặng demo: mật thư L1 vẫn viết theo xuất phát Concorde ("Ngược đại lộ … về phía tây") trong khi xuất phát nay ở Bir-Hakeim.
- **m17** RACE_RULES §10 "phút phạt ở góc trên bên phải, cạnh đồng hồ" – đồng hồ HUD ở góc dưới phải (STYLE_GUIDE, §17.3).

## Đối chiếu quyết định (a)–(i)

| | Kết quả |
|---|---|
| (a) không Vượt rào | Đủ: schema, thông báo lỗi riêng, RACE_RULES, TODO |
| (b) xuất phát Bir-Hakeim từ file chặng | Đủ về dữ liệu; rủi ro mặt cầu (M1); `liveOf` còn dùng `legPoints()` của chặng demo → A thay bằng `startSpot` (đã có trong kế hoạch) |
| (c) vào game lệch giờ | Đủ; cổng lobby (m4) |
| (d) đồng hồ từ giờ Host nhập | Đủ (D15, `raceClock`, `summary`); độ chính xác nhập giờ (m10) |
| (e) "Xuất phát ở vị trí thứ n" một lần | Đủ: gán ở WS đầu, ghi trước `welcome`, cờ chỉ lần đầu, sim time đứng yên lúc tải; trùng với thẻ đầy đủ (m9); Host thử bằng mã đội thật sẽ dùng mất lượt (không có cách xóa) – ghi vào LEG_FORMAT / hướng dẫn Host |
| (f) hộp theo bước, không gửi bước sau | Đủ cho hộp / thẻ / Sổ; rủi ro ở "Tại điểm này" (M2) |
| (g) tạm dừng không trừ | Đủ (D9, RACE_RULES §11, TODO); m5 |
| (h) ~7 đội | Đủ (ngân sách, `startSpot` 8 chỗ) |
| (i) nội dung thật sau, nhập an toàn | Thiếu: M5, M6, M7, m1, m2, m13, m14 |
