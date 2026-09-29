# Cuộc đua Paris

Game 3D chạy trên trình duyệt mô phỏng một chặng đua tuần tự giữa trung tâm Paris: mỗi đội một người chơi, đi bộ hoặc nhặt xe đạp, lần lượt mở mật thư, làm Lựa chọn kép, Thử thách rồi về Chặng dừng. Người tổ chức theo dõi trực tiếp mọi đội trên màn hình Host. Toàn bộ chạy trên Cloudflare (Workers + Durable Object + R2).

Đặc tả đầy đủ: [`docs/SPEC.md`](docs/SPEC.md). Luật cho người chơi: [`docs/RACE_RULES.md`](docs/RACE_RULES.md).

## Yêu cầu
- Node.js ≥ 22.12 (khuyên dùng 24), npm ≥ 10.
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
| `npm run screenshot [preset]` | Chụp ảnh trang bằng Chrome headless vào `screenshots/` (preset: `topdown`, `etoile`, `champs`, `eiffel`, `street`, `seine`, `edge`, `player`, `debug`). Đổi cổng bằng `SCREENSHOT_PORT=5180`. |
| `npm run fetch-map` | Tải dữ liệu OSM thô (Overpass) vào `.cache/osm/` và độ cao (AWS Terrain Tiles) → `client/public/data/elevation.*`. Chỉ cần chạy một lần. |
| `npm run build-chunks` | Cắt dữ liệu OSM thô thành các ô 250 m: `client/public/data/chunks/*.json` + `index.json` + `water.json`. |

Thử nhanh khi `npm run dev:worker` đang chạy: `curl localhost:8787/api/health`, `curl localhost:8787/api/room/ping`.

Tham số URL của game (tiện khi thử): `?cam=x,y,z,yaw,pitch` đặt vị trí và hướng camera (mét, độ; yaw 0 = nhìn về hướng Bắc), `?debug=1` bật sẵn bảng debug (`F3` hoặc `` ` ``). Khi chạy `npm run dev`, trang `/preview.html` dựng thử vài ô bản đồ (vd. `/preview.html?at=48.8738,2.2950&r=300&only=roads`).

## Dựng lại dữ liệu bản đồ
Dữ liệu đã dựng sẵn và commit trong `client/public/data/` nên thường không cần làm gì. Khi cần dựng lại (đổi cách trích dữ liệu OSM):
```sh
npm run fetch-map      # tải lại OSM + độ cao (các request cách nhau ≥ 2 s; bị ngắt thì chạy lại để tiếp tục)
npm run build-chunks   # .cache/osm → client/public/data/chunks/ + water.json
npm test               # kiểm tra dữ liệu thật (12 đại lộ ở Étoile, Champs-Élysées, cầu…) và dựng thử mọi ô
```
Kích thước chiều cao, bề rộng đường… chỉnh trong `client/src/config.ts`, không cần dựng lại dữ liệu.

## Cấu trúc thư mục
```
client/   game + màn hình Host (Vite + TypeScript)
worker/   Cloudflare Worker + Durable Object RaceRoom, wrangler.toml, legs/ (nội dung chặng, chỉ nằm trên server)
shared/   hằng số, phép chiếu tọa độ (sau này: protocol, schema chặng)
scripts/  công cụ: chụp ảnh kiểm tra, tải bản đồ, cắt ô bản đồ (sau này: dựng đồ thị đường, bot mô phỏng)
docs/     đặc tả, luật đua
```

## Tiến độ
| Phase | Nội dung | Trạng thái |
|---|---|---|
| 0 | Chuẩn bị: khung monorepo, `wrangler.toml`, `wrangler dev` chạy được | Xong |
| 1 | Khung client: Three.js + Rapier, game loop, input, camera bay tự do | Xong |
| 2 | Bản đồ Paris từ OpenStreetMap: ô 250 m tải dần, nhà Haussmann, đường, sông Seine + kè, cầu, cây, biển tên đường, địa danh tạm | Xong |
| 2B | Địa danh Paris dựng chính xác (39 công trình, kể cả ngoài lộ trình: OSM 3D + chi tiết dựng bằng code + mô hình Eiffel / Khải Hoàn Môn) + bóng công trình ở đường chân trời; bảng "Ghi nguồn" trong game (SPEC §17.6) | Xong |
| 3 | Nhân vật & camera | Chưa làm |
| 4 | Di chuyển: đi bộ, xe đạp | Chưa làm |
| 4B | Xe cộ & người đi đường NPC, chỉ chạy trên máy người chơi (SPEC §17.5) | Chưa làm |
| 5 | HUD cơ bản | Chưa làm |
| 6 | Server & presence (Durable Object, WebSocket, vào lại) | Chưa làm |
| 7 | Race engine lõi | Chưa làm |
| 8 | Thử thách, Host duyệt | Chưa làm |
| 9 | Yếu tố đặc biệt, phạt giờ | Chưa làm |
| 10 | Màn hình Host đầy đủ | Chưa làm |
| 11 | Chặng demo Paris & test toàn trình | Chưa làm |
| 12 | Tối ưu & deploy | Chưa làm |

## Deploy
Game được deploy lên Cloudflare Workers (mục tiêu: gói Free đủ cho một cuộc đua 2 giờ, 20 đội; sẽ đo thực tế ở Phase 12): cần tài khoản Cloudflare, tạo R2 bucket `cuoc-dua-paris-media`, đặt mật khẩu Host bằng `npx wrangler secret put HOST_PASSWORD` rồi deploy bằng wrangler. Hướng dẫn từng bước cho người không chuyên sẽ có trong `docs/DEPLOY.md` cùng lệnh `npm run deploy` ở Phase 12.

---

Dữ liệu bản đồ © OpenStreetMap contributors (ODbL). Độ cao: Terrain Tiles (Mapzen / AWS Open Data): EU-DEM (Copernicus), SRTM (NASA / USGS).
