# Phase 5 – Track B: GPS + định vị (báo cáo)

Nhánh `worktree-agent-ab40ff60804c50fc8`, dựng từ `0359dc8`. Chỉ đụng file của Track B: `client/src/geo/gps.ts`, `geo/locate.ts` (+ hai file test), khối config `gps` + `locate`, dòng preset `[B]` trong `scripts/screenshot.ts`. `npm run build && npm test` qua (client 47 file / 478 test, trước đó 45 / 463: +2 file, +15 test).

## Đã làm

### `geo/gps.ts` (`Gps`, thuần, không DOM / three)
- Đích = điểm người chơi tự đặt (`setTarget`), không gắn cứng L1–L6; thử bằng `?gps=x,z` (đã nối sẵn trong `main.ts`).
- Tuyến = [chân, …nút của `shortestPath`, đích]. Hai đầu bám `nearestNode(x, z, mode, roadGraph.snapRadius)`. Không bám được (giữa sông xa cầu, ngoài bản đồ) → `route = null`, `remaining = NaN`, `target` giữ nguyên, thử lại mỗi `gps.minInterval` s (chân người chơi có thể lên bờ sau).
- Chế độ `bike`: thử `bike` trước; không có tuyến xe thì lùi về `walk` (một lần `search`). Tuyến walk tìm được khi đang đạp xe (lùi) cũng đúng khi xuống xe: đổi `bike → walk` lúc đó không tìm lại; `walk → bike` luôn tìm lại (có thể ra tuyến xe vòng qua bậc thang); `bike → walk` khi tuyến là tuyến xe thì tìm lại (bậc thang có thể rút ngắn).
- Tìm lại khi: đổi đích (xóa tuyến ngay, tìm ở lần `update` đầu được phép), đổi chế độ, chân cách tuyến > `gps.offRoute`, hoặc chưa có tuyến. Luôn cách lần trước ≥ `gps.minInterval` s (đếm bằng `dt`, không đồng hồ thật).
- Cắt phần đã đi: `seg` chỉ tiến lên; mỗi khung chiếu chân lên đoạn hiện tại và các đoạn bắt đầu trong `gps.lookAhead` m phía sau đoạn đó (khúc cua dài không bị "kẹt"); `route` bắt đầu từ điểm chiếu, `remaining` = độ dài phần còn lại.
- Tới trong `gps.arriveRadius` m (đường chim bay) → `clear()` (như GTA).
- `stats` = { `searches` (mỗi lần thử, kể cả bám thất bại, ≈ µs), `ms` của lần tìm gần nhất }.

### `geo/locate.ts` (`StreetLocator`, thuần)
- Way có tên gần nhất trong `locate.maxDistance` m; bỏ way cờ `sidewalk` / `crossing`; giữ tên hiện tại khi bất kỳ way cùng tên còn trong `locate.keepDistance` m (không nhấp nháy ở giao lộ, và đường bị tách thành nhiều way vẫn là một đường). Không có → `undefined`.
- `at()` gọi mỗi khung được: chỉ tra lại khi chân dịch ≥ `locate.recheck` m (dịch theo quãng đường thay vì đồng hồ: tự giới hạn tần suất, không phụ thuộc thời gian thật, test xác định). ≈ 2–4 lần / s khi đi bộ.
- Quận: không thuộc B (`districtAt` ở nền).

### Config (chỉ khối B, không thêm import)
- `gps`: thêm `lookAhead: 80`. `locate`: thêm `recheck: 2`. Giá trị cũ giữ nguyên (`offRoute 25`, `minInterval 1`, `arriveRadius 15`, `maxDistance 25`, `keepDistance 35`).

## Hợp đồng cho Track A / D (không đổi chữ ký, chỉ làm rõ)
- `gps.route` là mảng `Float32Array` **mới** mỗi khi điểm chiếu của người chơi dịch (mỗi khung khi đang đi); đứng yên thì giữ nguyên đối tượng. Không cache theo danh tính mảng; vẽ thẳng mỗi khung. Điểm đầu = điểm của người chơi trên tuyến, điểm cuối = đích (tọa độ người chơi đặt, không phải nút đồ thị).
- Khoảng `route` đầu có thể có một "gai" ngắn (≤ 80 m) từ chân tới nút gần nhất nếu nút nằm phía sau; tự hết khi người chơi đi tiếp (chiếu nhảy sang đoạn kế). Khi chiếu đúng vào một nút thì không lặp điểm.
- `gps.update` gọi mỗi khung: không có đích thì thoát ngay; có tuyến thì tốn một phép chiếu ~10–20 đoạn + một `Float32Array` ≤ 2 KB.
- `StreetLocator.at()` trả tên OSM nguyên bản (tiếng Pháp), D không cần xử lý thêm.

## Đo
| Mục | Kết quả | Ngân sách |
|---|---|---|
| Tìm tuyến (`stats.ms`, 14 cặp ngẫu nhiên khắp bản đồ, Node) | trung vị 1,6 ms, lớn nhất 3,6 ms | ≤ 5 ms |
| Tìm tuyến trong game (Chrome headless, swiftshader) | 0,6–1,1 ms | ≤ 5 ms |
| `at()` tra thật (4000 điểm cách nhau > 2 m, trung tâm dày) | 2,4–3,5 µs | ≤ 100 µs |
| Tuyến / chim bay từ chỗ spawn Concorde | Opéra 1,26×, Louvre 1,24×, Eiffel 1,18×, Notre-Dame 1,16×, Trocadéro 1,07×, Panthéon 1,19×, Khải Hoàn Môn 1,12×, Orsay 1,39× | ≤ 1,6× (Opéra ≤ 1,3×) |

- Từ chỗ spawn tới Opéra là 1,26× (từ obelisk: 1,11×): spawn nằm trong đảo của quảng trường, nút đi bộ gần nhất cách 19,7 m về phía tây nên tuyến vòng ra đó trước. Vẫn dưới 1,3× nhưng sát.

## Test (`roadgraph.json` thật, như `graph.test.ts`; bỏ qua nếu thiếu dữ liệu)
`gps.test.ts` (10 test): Concorde → Opéra (bắt đầu ≤ 1 m, kết thúc đúng đích, ≤ 1,3×, mỗi đoạn là cạnh đi bộ được); 8 đích khác ≤ 1,6×; đi dọc tuyến 200 m (`remaining` giảm đúng 1 m / m, đúng 1 lần tìm, phần đã đi biến mất); lệch ngang 40 m → đúng một lần tìm lại, không tìm lại khi đứng yên, nhảy xa trong `minInterval` bị hoãn tới hết khoảng; đổi đích; xe: Eiffel → Trocadéro tuyến xe không có cạnh `steps` (đi bộ có 3), dài hơn; vườn Trocadéro → Panthéon bằng xe: tiền điều kiện không có tuyến xe, lùi về walk, xuống / lên xe không tìm lại, đi bộ rồi lên xe tìm lại đúng một lần; tới `arriveRadius` → `target` / `route` = null; đích ngoài bản đồ và giữa sông xa cầu → `route = null`, giữ `target`, tối đa 1 lần thử / s; chân ở giữa sông → không tuyến cho tới khi lên bờ; thời gian tìm (in ra).
`locate.test.ts` (5 test): spawn → "Place de la Concorde"; giữa Champs-Élysées; giữa cầu Alexandre III; chỗ bắt đầu p5-hud → "Rue Royale"; vỉa hè Rue Royale (cạnh `sidewalk`, cách đường xe > 5 m) → "Rue Royale"; đi dọc Rue Royale rồi rẽ vào Rue Saint-Honoré: vào 10 m vẫn "Rue Royale", 40 m "Rue Saint-Honoré", mỗi đường đổi tên đúng một lần; giữa sông xa cầu / ngoài bản đồ → `undefined`; bộ đệm `recheck`; `at()` ≤ 0,1 ms (in ra).

## Phát hiện
1. **Kế hoạch §2.4 "Trocadéro → Panthéon bằng xe: không có đường" chỉ đúng khi xuất phát từ bậc thềm bị bậc thang cắt** (vd. điểm bắt đầu của `p4-stairs-block`, −2380,409). Từ chỗ khác của Trocadéro (48.8625, 2.2875) xe vẫn có tuyến (5 540 m). Test dùng điểm bắt đầu của `p4-stairs-block` kèm tiền điều kiện (`shortestPath` xe = null) nên gãy to nếu dữ liệu đồ thị đổi.
2. Tìm tuyến xe **thất bại** từ mạng chính vào một ô bị bậc thang cắt phải duyệt hết mạng xe: ≈ 13 ms (một lần mỗi lần tìm; sau đó walk trả lời trong < 1 ms). Chiều ngược lại (xuất phát trong ô kín) thất bại trong 0,1 ms. Xảy ra hiếm (chỉ khi đang đạp xe, đích trong ô kín, và sau mỗi lần lệch tuyến / lên xe); ghi trong comment `ponytail`. Nếu thấy khựng: tìm từ hai đầu, hoặc lưu thành phần liên thông của mạng xe trong `RoadGraph`.
3. Dữ liệu tên: vỉa hè có thể mang tên ("Promenade des Champs-Élysées" là `footway` + `sidewalk` có tên); bị bỏ vì cờ `sidewalk`, tên đường xe bên cạnh thắng. Cầu (`layer` 1) và đường nằm dưới (`layer` 0) không phân biệt tầng (khoảng cách phẳng).

## Preset `[B]` (khai báo tọa độ, render ở Track A / D)
Đường GPS chỉ hiện trên minimap / bản đồ lớn khi Track A ghép. Hiện tại chỉ kiểm chứng GPS chạy trong game thật: `window.__GAME__.gps()` (DEV) trên Chrome headless: `p5-gps` → 49 điểm, `remaining` 1 254 m, 1 lần tìm 1,1 ms; `p5-gps-bike` → 56 điểm, 1 218 m (tuyến xe, dài hơn tuyến đi bộ 929 m vì vòng qua bậc thang), 0,8 ms; không lỗi console (`npm run screenshot -- p5-gps p5-gps-bike` qua).
- `p5-gps`: `/?player&gps=810.6,-569.4&wait=2` — từ spawn Concorde tới Place de l'Opéra (48,8706, 2,3322), đi bộ.
- `p5-gps-map`: như trên + `&map=2` (bản đồ lớn 2 m/px; cần Track A).
- `p5-gps-bike`: `/?player=-2412,331,-135&bike&gps=-1955.6,787.3&wait=3` — từ sân Trocadéro (Parvis des Libertés et des Droits de l'Homme) tới chân tháp Eiffel, đang đạp xe: tuyến vòng (xe 1 172 m so với 929 m đi bộ qua 3 cầu thang). Điểm "chỉ đi bộ qua bậc thang mới tới" của kế hoạch là chính nó; nếu muốn ảnh minh họa lùi về walk (không có tuyến xe) thì dùng điểm bắt đầu của `p4-stairs-block`.

## Để lại (ponytail, ghi trong code)
- Bám nút gần nhất, chưa bám điểm gần nhất trên cạnh (gai đầu tuyến ≤ 80 m, tự hết khi đi; nút ảo nếu đo thấy vướng).
- Chiếu lên cửa sổ `lookAhead` 80 m: tuyến quay đầu trong 80 m có thể bị nhảy qua.
- Mỗi khung (khi đi) tạo một `Float32Array` mới ≤ 2 KB; đổi sang view + ghi đè điểm đầu nếu GC lộ ra.
- Tên đường theo khoảng cách tới tim đường, không theo bề rộng dải; không phân tầng cầu / đường dưới.
- Gợi ý ghi vào `TODO.md` (người tích hợp): tìm tuyến xe thất bại ≈ 13 ms (mục Phát hiện 2).
