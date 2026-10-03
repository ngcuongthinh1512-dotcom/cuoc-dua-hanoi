# Cuộc đua Paris

Game 3D chạy trên trình duyệt mô phỏng một chặng đua tuần tự giữa trung tâm Paris: mỗi đội một người chơi, đi bộ hoặc nhặt xe đạp, lần lượt mở mật thư, làm Lựa chọn kép, Thử thách rồi về Chặng dừng. Người tổ chức theo dõi trực tiếp mọi đội trên màn hình Host. Toàn bộ chạy trên Cloudflare (Workers + Durable Object + R2).

Đặc tả đầy đủ: [`docs/SPEC.md`](docs/SPEC.md). Luật cho người chơi: [`docs/RACE_RULES.md`](docs/RACE_RULES.md).

## Nhập chặng đua (cho người tổ chức)
1. Viết file chặng `.json` theo [`docs/LEG_FORMAT.md`](docs/LEG_FORMAT.md) (copy `worker/legs/test/mini.json` làm mẫu). Để file chặng thật **ngoài thư mục dự án**, không bao giờ trong `client/`.
2. Kiểm tra: `npm run leg:check -- <đường-dẫn-file.json>` → sửa tới khi dòng cuối là "Hợp lệ"; bảng cuối có link bản đồ / ảnh vệ tinh / ảnh 3D / link đứng thử trong game cho từng điểm.
3. Chơi thử tự động: `npm run sim -- --leg <đường-dẫn-file.json> --bots 2 --speedup 2` (`--help` để xem tùy chọn).
4. Nạp vào cuộc đua: `npm run dev:worker`, mở http://localhost:8787/host.html, nhập mã cuộc đua + mật khẩu Host (`HOST_PASSWORD` trong `worker/.dev.vars`), phần "Chặng" → **Nạp chặng từ file**. Đội vào bằng link `/?race=<mã>` mà trang Host in ra.
5. Thử thách 3 (phòng Louvre, `kind: "louvre"`): ảnh 23 tác phẩm đã có sẵn trong game (`art-NN`), không tải lên Host; trong chặng chỉ cần `artworks` (mã, loại, tệp, ghi nguồn) + 5 mã đúng trong `answers` (`docs/LEG_FORMAT.md` mục 7.5).
6. Tải hình mật thư lên (chỉ khi chặng có `"r2:<tên>"`; `leg:check` in danh sách "Hình cần tải lên trang Host"): sau khi nạp chặng, mục **Hình mật thư (R2)** trên trang Host liệt kê từng tên → "Chọn file" (jpg / png / webp ≤ 5 MB) → ✓ "đã có"; nút **Xem** để kiểm. Hình lưu theo mã cuộc đua: diễn tập ở mã khác thì tải lại. Đội chỉ tải được hình của mật thư đã mở.

## Host duyệt bài trong lúc đua
- Đội gõ câu trả lời trong game (hoặc bấm "Tôi đã gửi bài" sau khi gửi ảnh qua Messenger kèm **mã bài nộp** `<tên đội>-<bước>[-<nhánh>]`; đội tự mở Messenger ở ngoài trò chơi, game không có nút mở Messenger / Facebook). Bài hiện ở mục **Chờ duyệt (n)** đầu trang Host (có âm báo; bấm **Bật thông báo** để nhận thông báo của trình duyệt), kèm câu trả lời, mã bài nộp, thời gian chờ và **Đáp án tham khảo** (chỉ Host thấy).
- **Duyệt** → đội nhận mật thư kế ngay. **Phạt n phút** → đội thấy đồng hồ đếm ngược rồi mới trả lời lại được. Ô ghi chú chỉ để Host đọc (không gửi cho đội). Bấm nhầm Phạt: ô của đội trong ma trận có nút **Duyệt câu vừa phạt**. Bài ảnh Host đã nhận trước khi đội bấm nút: nút **Duyệt (đã nhận ảnh)** trong ô của đội.
- **Hoàn tác**: sau mỗi Duyệt / Phạt, dải trên cùng hiện **"Hoàn tác (còn n s)"** trong 10 giây; bấm để rút lại (thẻ của đội trở lại như trước). Quá 10 giây, hoặc khi đội đã **hoàn thành** bước kế (ví dụ đã mở hòm Lộ trình kế), thì không rút lại được; việc đội vừa làm trong mấy giây đó ở bước mới (tới điểm, "Nhận thử thách", chọn nhánh) bị bỏ, xe đã vào bãi vẫn ở bãi.
- **Cho qua**: ô của đội ở mọi thử thách / nhánh Lựa chọn kép đã mở có nút **Cho qua** (hỏi xác nhận) để đưa đội bị kẹt qua bước mà không cần câu trả lời (kể cả khi đội chưa bấm "Nhận thử thách").
- **Cờ đỏ**: đội di chuyển bất thường bị gắn cờ (⚑ trong ma trận; lý do + giờ ở bảng "Các đội"). Cờ không tự phạt; gắn oan thì bấm **Xóa cờ**.
- Ma trận tiến độ ghim cột "Đội" và hàng tiêu đề khi cuộn; khung "Chờ duyệt" thu gọn được; chiều cao khung ma trận tự trừ phần "Chờ duyệt" đang mở nên vừa cả màn hình thấp (800 px).
- **Xuất dữ liệu thời gian** (cuối cuộc đua, dùng được bất kỳ lúc nào): tải về `race-<mã>-thoi-gian.csv` (mở bằng Excel) + `.json`: thời gian từng đội × từng bước, bảng đội (hạng về đích – trống với đội bị loại chưa về đích –, hạng cuối kể cả bị loại, giờ về đích), nhật ký sự kiện thô. Cột "Mở hòm" của bước 1 là lúc đội vào game lần đầu nên có thể âm so với lúc mở cuộc đua. Không có đáp án, câu trả lời hay IP.
- Banner đỏ báo đội làm cùng một thử thách / nhánh quá 45 phút (`hostAlerts.stuckMinutes`), để Host gửi gợi ý qua Messenger. Không có bù giờ: thứ hạng là thứ tự về đích thực (SPEC §17.22, §17.23).

## Yêu cầu
- Node.js ≥ 22.13 (khuyên dùng 24), npm ≥ 10.
- Google Chrome (dùng cho `npm run screenshot`).
- Chơi trên máy tính Windows hoặc macOS (Chrome, Edge, Firefox, Safari).

## Cài đặt
```sh
npm install
cp worker/.dev.vars.example worker/.dev.vars   # đặt mật khẩu Host khi chạy local
```

## Lệnh hiện có
| Lệnh | Tác dụng |
|---|---|
| `npm run dev` | Chạy client bằng Vite dev server. |
| `npm run dev:worker` | Build client rồi chạy `wrangler dev` tại http://localhost:8787 (trang web + API + Durable Object + SQLite + R2 giả lập). |
| `npm run build` | Kiểm tra kiểu toàn bộ, build client, kiểm tra bundle Worker (`wrangler deploy --dry-run`). |
| `npm test` | Chạy toàn bộ unit test (Vitest). |
| `npm run screenshot [preset]` | Chụp ảnh trang bằng Chrome headless vào `screenshots/` (preset: `topdown`, `etoile`, `champs`, `eiffel`, `street`, `seine`, `edge`, `player`, `debug`; gọi theo tên: `lm-<địa danh>`, `leg-L1`…`leg-L6`, nhóm nhân vật `p3` hoặc từng cái như `p3-swim`; nhóm cuộc đua thử `p6` / `p7` / `p8` / `p8b`; đồ họa `p8c`). Đổi cổng bằng `SCREENSHOT_PORT=5180`. |
| `npm run fetch-map` | Tải dữ liệu OSM thô (Overpass) vào `.cache/osm/` và độ cao (AWS Terrain Tiles) → `client/public/data/elevation.*`. Chỉ cần chạy một lần. |
| `npm run process-assets` | Xử lý asset gốc đã duyệt trong `.cache/assets/` → `client/public/models/*.glb` (kể cả nhân vật `player.glb` + `player-anims.glb`) và `client/public/credits.json`. Đồ họa 8C: `-- hdri textures trees props flamme` (nguồn `.cache/assets/8c`, kiểm giấy phép) → `client/public/{textures,models}`. `-- --assets <thư mục> louvre`: 23 ảnh / bản quét phòng Louvre → `client/public/art/art-NN.*` (tên trung tính, xóa metadata; cách làm: `docs/LEG_FORMAT.md` mục 7.5). |
| `npm run build-graph` | Dựng đồ thị đường từ `.cache/osm/` → `shared/data/roadgraph.json` (đường, vỉa hè, vạch qua đường, bậc thang, một chiều, bãi xe đạp). |
| `npm run leg:check -- <file.json>` | Kiểm tra file chặng đua (cú pháp, luật, điểm trên bản đồ, đáp án lọt ra ngoài): [`docs/LEG_FORMAT.md`](docs/LEG_FORMAT.md). |
| `npm run sim -- --leg <mã \| file.json>` | Bot chơi thử hết một chặng qua WebSocket thật (máy chủ tạm trong máy), in số đội về đích, xếp hạng, số dòng ghi, ngân sách Cloudflare nội suy cho `--teams N` đội × 2 giờ; `--full` (≥ 6 bot) thêm kịch bản Host (Hoàn tác, Xóa cờ, Cho qua, Kết thúc → BỊ LOẠI, kiểm tệp xuất); không có `--leg`: đo lưu lượng. `--help` xem tùy chọn. |
| `npm run dev:api` | Chỉ chạy API + Durable Object (`wrangler dev` :8787) để dùng cùng `npm run dev` (Vite chuyển `/api` sang đó). |
| `npm run ride-check` | Chơi thử tự động bằng phím thật trong Chrome headless: đi bộ → đạp xe 300 m → phanh → ngã xe → xuống bậc kè → bơi → lên bờ; in tốc độ đo được. |
| `npm run build-chunks` | Cắt dữ liệu OSM thô thành các ô 250 m: `client/public/data/chunks/*.json` + `index.json` + `water.json`. |

Thử nhanh khi `npm run dev:worker` đang chạy: `curl localhost:8787/api/health`, `curl localhost:8787/api/room/ping`.

Tham số URL của game (tiện khi thử): mặc định vào chế độ nhân vật ở Place de la Concorde. `?cam=x,y,z,yaw,pitch` = chế độ khán giả (chỉ bay camera tự do, mét, độ; yaw 0 = nhìn về hướng Bắc), `?debug=1` bật sẵn bảng debug (`F3` hoặc `` ` ``), `?player=x,z,yaw` đặt chỗ xuất hiện của nhân vật (thêm `camMode=near|far|first`, `orbit=<độ>`, `action=wave|openBox|celebrate|crash`, `autoMove=walk|slow`, `jump`, `wait=<giây>` – xem `docs/plans/phase3.md` §7; Phase 4: `bike` = bắt đầu trên xe, `autoTurn=left|right`, `graph=1` = hiện đồ thị đường; Phase 7: `start=x,z,yaw` = xuất hiện như đội vào game ở đó, `boxes=<mã>,x,z` = đặt hộp mật thư thử, thêm `mat` = thảm Chặng dừng; Phase 8: `boxes=<mã>[|<nhánh>],x,z,opened,<hướng độ>` (hướng 0 = mặt trước hòm quay về bắc), `card=answer|detour-choose|…&full` = thẻ thử thách giả; `leg:check` in sẵn các link này cho từng điểm của chặng). Khi chạy `npm run dev`, trang `/preview.html` dựng thử vài ô bản đồ (vd. `/preview.html?at=48.8738,2.2950&r=300&only=roads`) `/character.html` xem nhân vật với các tư thế, `/bike.html` xem xe đạp.

## Điều khiển
| Thao tác | Bàn phím / chuột | Tay cầm |
|---|---|---|
| Đi (tốc độ chuẩn, theo hướng camera) | `W` `A` `S` `D` | stick trái |
| Đi chậm (giữ) | `Shift` | `LB` |
| Nhảy; khi đang bơi sát tường kè: leo lên bờ | `Space` | `A` |
| Nhìn quanh | chuột (nhấp vào game để khóa con trỏ) | stick phải |
| Đổi camera: gần → xa → góc nhìn thứ nhất | `C` | `View` |
| Vẫy tay chào | `G` | D-pad ← |
| Lấy xe / lên xe (trong 2,5 m) / xuống xe (khi xe gần dừng) | `F` | `X` |
| Trên xe: đạp / phanh (dừng hẳn thì lùi chậm) / rẽ | `W` / `S` / `A` `D` | stick trái |
| Trên xe: bấm chuông | `R` | D-pad → |
| Bảng debug | `F3` hoặc `` ` `` | – |
| Camera bay tự do (khi bảng debug đang mở) | `V` | – |
| Hiện đồ thị đường (khi bảng debug đang mở) | `N` | – |
| Nhả chuột (menu ở Phase 5) | `Esc` | – |

Camera bay tự do: `W` `A` `S` `D` bay, `Space` hoặc `E` lên, `Q` xuống, giữ `Shift` bay nhanh, lăn chuột đổi tốc độ (tay cầm: `RT`/`RB` lên, `LT`/`LB` xuống, bấm stick trái bay nhanh). `F` cũng mở hộp mật thư, `Enter` mở lại thẻ mật thư hiện tại (để trả lời, xem lịch sử câu trả lời), `Tab` mở Sổ mật thư (khi thẻ / Sổ mở thì chuột được nhả để bấm link, hình, nút, ô gõ), `M` bản đồ lớn, `Esc` menu. Đã gán nhưng chưa có tác dụng: `B` ống nhòm.

Xe đạp (Phase 4): 3 xe thử đứng quanh điểm xuất phát, lấp lánh khi còn cách ≤ 30 m. Xe nhanh gấp 1,3 lần đi bộ, đạt tốc độ tối đa trong khoảng 1 giây, chậm lại khi cua gắt hoặc va chạm; trên đá lát khó cua, khó phanh hơn. Đâm mạnh vào tường khi đang nhanh thì ngã, 2 giây sau đứng dậy, xe vẫn là của đội. Không đi xe lên bậc thang (xe dừng lại).

## Tiến độ
| Phase | Nội dung | Trạng thái |
|---|---|---|
| 0 | Chuẩn bị: khung monorepo, `wrangler.toml`, `wrangler dev` chạy được | Xong |
| 1 | Khung client: Three.js + Rapier, game loop, input, camera bay tự do | Xong |
| 2 | Bản đồ Paris từ OpenStreetMap: ô 250 m tải dần, nhà Haussmann, đường, sông Seine + kè, cầu, cây, biển tên đường, địa danh tạm | Xong |
| 2B | Địa danh Paris dựng chính xác (39 công trình, kể cả ngoài lộ trình: OSM 3D + chi tiết dựng bằng code + mô hình Eiffel / Khải Hoàn Môn) + bóng công trình ở đường chân trời; bảng "Ghi nguồn" trong game (SPEC §17.6) | Xong |
| 3 | Nhân vật & camera: nhân vật có xương (áo màu đội, bảng tên), hoạt ảnh, Rapier character controller (bậc ≤ 0,4 m, dốc ≤ 45°, nhảy, rơi), bơi sông Seine + leo kè, camera góc thứ ba kiểu GTA | Xong |
| 4 | Di chuyển: xe đạp Vélib' (vật lý, lên / xuống xe, ngã xe, chuông, camera xe), bậc thang OSM + bậc kè xuống sông + lối xuống metro, đồ thị đường `roadgraph.json` (A*, hành lang, mặt đường) | Xong |
| 4B | Xe cộ & người đi đường NPC, chỉ chạy trên máy người chơi (SPEC §17.5) | Xong |
| 5 | HUD cơ bản | Xong |
| 6 | Server & presence (Durable Object, WebSocket, vào lại) | Xong |
| 7 | Race engine lõi: chặng từ file (`leg:check`), mật thư, hộp, Chặng dừng, trang Host tối giản | Xong |
| 8 | Thử thách gõ đáp án + Host duyệt / phạt, Lựa chọn kép theo hòm nhánh, hình mật thư R2 | Xong |
| 8B | Phòng Louvre (Thử thách 3): 23 tác phẩm, chọn đúng 5, phạt 3 phút khi chốt sai, gợi ý phút 40 / 70, tin công khai, "Ghi nguồn" sau khi về đích | Xong |
| 8C | Đồ họa: bầu trời HDRI, nước Seine, hậu kỳ, cây platane, đồ đường phố Paris, Ngọn lửa Tự do, ngói mái + nhựa đường; Esc → Cài đặt → "Chất lượng đồ họa" (Cao / Thấp, áp dụng sau khi tải lại; máy yếu tự chọn Thấp, Cao tự hạ cấp khi FPS thấp) | Xong |
| 8D | Đợt việc nhỏ: không sao chép chữ mật thư, thứ hạng = thứ tự về đích, thông báo về đích / BỊ LOẠI (chữ trong file chặng `pit_stop.announce`), bỏ đồng hồ đội + giờ xuất phát | Xong |
| 9 | Yếu tố đặc biệt, phạt giờ | Bỏ (SPEC §17.18) |
| 10 | Công cụ Host (thu hẹp, SPEC §17.24–17.25): Hoàn tác 10 giây, xóa cờ đỏ, "vừa rời đi", Cho qua mọi thử thách, xuất dữ liệu thô thời gian (CSV + JSON), ghim bảng | Xong |
| 11 | Test toàn trình + đo hạn mức bằng bot (`sim --full`) | Xong |
| 12 | Deploy lên Cloudflare | Chuẩn bị xong (`docs/DEPLOY.md`, `npm run deploy`); chờ tài khoản Cloudflare của người dùng |

## Deploy
Game chạy trên Cloudflare Workers (gói Free đủ cho một cuộc đua 2 giờ, 8 đội: đo bằng bot ở Phase 11 ≈ 13 800 request / 2 800 dòng SQLite, ngưỡng 16 000 / 8 000; đo lại trên Cloudflare thật sau lần deploy đầu). Hướng dẫn từng bước cho người không chuyên: **`docs/DEPLOY.md`** – tài khoản Cloudflare + `npx wrangler login`, tạo bucket R2 `cuoc-dua-paris-media`, `npx wrangler secret put HOST_PASSWORD`, rồi `npm run deploy` (= `npm run build` + `wrangler deploy`), sau đó trang `/host.html`: nạp chặng thật từ file ngoài repo, tải hình R2, tạo đội + mã, link `/?race=<mã>`; checklist trước ngày đua và sự cố thường gặp cũng ở đó.

---

Dữ liệu bản đồ © OpenStreetMap contributors (ODbL). Độ cao: Terrain Tiles (Mapzen / AWS Open Data): EU-DEM (Copernicus), SRTM (NASA / USGS).
