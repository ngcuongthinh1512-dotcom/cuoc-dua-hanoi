# Phase 8B – Tích hợp (ghép track A → B → C → D)

Trạng thái: **xong** (2026-10-03). Commit ghép: 5ea154c (nối), 8956796 (tài nguyên), db072cf (tài liệu), + commit này.

## Tiến độ
- [x] merge A, B, C, D (`--no-ff`, 0 xung đột)
- [x] nối tích hợp (commit 5ea154c)
- [x] process-assets louvre thật (commit 8956796)
- [x] kiểm toàn bộ
- [x] tài liệu (CLAUDE.md, README, TODO.md Phase 8B, HANDOFF)

## Nối tích hợp
- `initCredits()` gọi thường: Credits.ts của C không nhận tham số; cổng về đích qua `RaceHud.setView`, yêu cầu qua `actions.credits` → `race.credits()` (đã thêm vào actions trong main.ts). `{t:'credits'}` → `RaceClient.message` → `hud.credits` (đã có từ B).
- `raceHud.setRoom(room.active)` mỗi frame (hàm tự bỏ qua khi không đổi).
- Toast `lockWrong` = `lockWrongText(card.retryPenaltyMinutes)` của C (bỏ chuỗi định dạng riêng trong main.ts).
- Prompt phòng chuyển vào RaceHud: `RaceHudFrame.prompt` thay chữ "Bấm F để mở hòm mật thư" của cùng phần tử `.rc-prompt` (trước đó hai phần tử cùng chỗ có thể chồng nhau); main.ts bỏ phần tử riêng.
- `LOUVRE` (23 / 5 / maxPicks…) chuyển sang `shared/src/constants.ts` (không zod, client import được), `schema.ts` re-export. Client bỏ số 5 / 23 viết cứng (hostView, format, Feed).
- `sim.test.ts`: bỏ `it.skipIf`; test tích hợp `sim --leg louvre` CHẠY (start dời về Jardin du Carrousel ≈ 250 m: từ Bir-Hakeim đi bộ ≈ 3,5 km quá 600 s mô phỏng của test). Qua, 103 s.
- `RaceRoom.louvre.test.ts`: test mới "Cho qua" = đúng tin `host.review approve` không id của nút Host → đội nhận L3; phạt không id bị từ chối.
- Gỡ chú thích TODO track A / D còn sót (engine.ts, hostView.ts, Toasts.ts).

## Tài nguyên thật (process-assets louvre)
- Đầu vào ngoài repo: `.cache/assets/louvre/{raw (17 ảnh), sketchfab (6 bản quét .glb)}`. `.cache/assets/louvre/manifest.json` là **nhật ký tải** (mảng 17 ảnh, không `seed`, không có 6 bản quét), không phải dạng `{seed, items}` mà `processLouvre` đọc. Không sửa tệp đó: sinh manifest xử lý `.cache/assets-louvre-run/louvre/manifest.json` (ngoài repo, gitignored; `seed` ngẫu nhiên cố định + 23 mục: 17 ảnh từ nhật ký tải, 6 bản quét từ `asset.extras` {title, author, license, source} trong chính tệp GLB) rồi chạy `npm run process-assets -- --assets .cache/assets-louvre-run louvre`. Bảng tên gốc → art-NN chỉ nằm ở `.cache/assets-louvre-run/run.log`; `credits-snippet.json` ở `.cache/assets-louvre-run/louvre/`.
- Giấy phép (đều trong danh sách §17.19 (a) / §17.20): PD, CC0, CC-BY, CC-BY-SA, CC-BY-NC-SA. Không mục `real` (5 đáp án nằm ở chặng thật, không đọc).
- Sửa chặn ghép trong `scripts/assets/louvre.ts`: bản quét photogrammetry (≈ 1 đỉnh / tam giác, tới 1 triệu tam giác) không xuống dưới 1 MB chỉ bằng texture (lần đầu 19 MB tổng). Thêm: bỏ NORMAL / TANGENT / UV 1 (phòng vẽ unlit, map trên UV 0), weld + simplify (tỉ lệ giảm dần, sai số ≤ 1 → 3 cm), cuối cùng `simplifySloppy` (0,1 / 0,05) + `compactPrimitive`; ảnh xử lý trước, GLB chia phần ngân sách 8 MB còn lại. `process-assets` chỉ `louvre` thì dừng trước bước credits.json (dòng Louvre cố định, không cần manifest chung).
- Kết quả: 23 tệp `client/public/art/art-01…23` (17 `.webp` ≤ 300 KB cạnh dài ≤ 2048, 6 `.glb` 328–707 KB), tổng **7,27 MB** (≤ 8 MB).
- Kiểm: WebP 0 EXIF / XMP / ICC / IPTC (sharp.metadata); GLB: JSON chỉ có tên `art-NN` (scene / node / mesh / material / texture / image / accessor…), `asset` = `{version, extras: {}}` (không generator / copyright), 0 extras.
- Tìm tên (80 chuỗi từ manifest: tên tác phẩm, tác giả, tác giả ảnh / bản quét, tên tệp gốc; chỉ đếm): `client/public/art` 0, `client/dist` 0, commit message 0, tệp đang theo dõi 1 và lịch sử git 1 tệp — cả hai là chú thích landmark Phase 2 có sẵn (`client/src/world/landmarks/g2.ts`: cụm từ chung trong tên một landmark Paris, có từ trước Phase 8B; không phải nội dung phòng Louvre). `docs/SPEC.md` (không được sửa) 0 khớp nguyên chuỗi.

## Kiểm
- `npm run build` qua (bundle Worker 956,66 KiB); `grep ZodError client/dist` = 0; `client/dist/art` 23 tệp, 0 tên tác phẩm.
- `npm test` (gốc): scripts 87, shared 76, client 729, worker 154 = **1046 qua, 0 skip** (track A trước ghép: 994).
- `leg:check`: `worker/legs/test/louvre.json`, `mini.json`, `paris-demo.json`: 0 LỖI. Chặng test louvre (GIẢ) báo CÒN TRỐNG cho vài `image` kiểu cũ (vd. `art-02.webp` trong khi `art-02` thật là bản quét) – đúng với chặng giả.
- `SCREENSHOT_PORT=5301 npm run screenshot -- p8b p8 p7 p6-boxes p5-hud`: 49 ảnh, 0 lỗi console. Đã xem `p8b-room-lock` (đếm ngược 02:00 giữa màn hình + prompt phòng qua RaceHud), `p8b-room-button` ("Bấm F: bỏ chọn"), `p8b-card-louvre`, `p8b-credits`.
- `npm run ride-check`: lần 1 hỏng giữa chừng (`__GAME__` mất – trang tải lại khi máy tải nặng, ngay sau đợt chụp); chạy lại riêng: OK (đi bộ 4,0 / xe 5,2 m/s, ngã + lên lại, 11 lệnh vẽ).
- `scripts/hud-check.ts`: mọi mục ok, 0 lỗi console.
- `npm run sim -- --leg louvre --bots 3 --speedup 2` (xuất phát Bir-Hakeim): **3 / 3 về đích**, chốt sai 3 + đúng 3, feed ≥ 6 / bot, dòng ghi / đội 37 (≤ 160), ≈ 35 638 request cho 20 đội × 2 giờ (< 40 000).
- Không còn `vite` / `wrangler` / `workerd` / Chrome headless chạy.

## Không sửa (để reviewer)
- Lỗi "nên sửa" trong `docs/reports/phase8b-track-*.md` (theo lệnh: lượt sửa riêng).
- Chặng test louvre (GIẢ) chưa khớp kiểu tệp thật; preset `?louvre=1` chỉ hiện ô đánh số (chưa xem ảnh / bản quét thật trong phòng offline) – cần mắt người duyệt chất lượng bản quét đã giản lược.
