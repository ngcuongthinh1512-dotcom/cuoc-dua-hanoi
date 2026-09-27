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
| `npm run screenshot [preset]` | Chụp ảnh trang bằng Chrome headless vào `screenshots/`. |

Thử nhanh khi `npm run dev:worker` đang chạy: `curl localhost:8787/api/health`, `curl localhost:8787/api/room/ping`.

## Cấu trúc thư mục
```
client/   game + màn hình Host (Vite + TypeScript)
worker/   Cloudflare Worker + Durable Object RaceRoom, wrangler.toml, legs/ (nội dung chặng, chỉ nằm trên server)
shared/   hằng số, phép chiếu tọa độ (sau này: protocol, schema chặng)
scripts/  công cụ: chụp ảnh kiểm tra (sau này: tải bản đồ, dựng đồ thị đường, bot mô phỏng)
docs/     đặc tả, luật đua
```

## Tiến độ
| Phase | Nội dung | Trạng thái |
|---|---|---|
| 0 | Chuẩn bị: khung monorepo, `wrangler.toml`, `wrangler dev` chạy được | Xong |
| 1 | Khung client: Three.js + Rapier, game loop, input, camera bay tự do | Chưa làm |
| 2 | Bản đồ Paris từ OpenStreetMap | Chưa làm |
| 3 | Nhân vật & camera | Chưa làm |
| 4 | Di chuyển: đi bộ, xe đạp | Chưa làm |
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

Dữ liệu bản đồ © OpenStreetMap contributors.
