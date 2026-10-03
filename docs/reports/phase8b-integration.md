# Phase 8B – Tích hợp (ghép track A → B → C → D)

Trạng thái: **đang làm** (2026-10-03).

## Tiến độ
- [x] merge A, B, C, D (`--no-ff`, 0 xung đột)
- [x] nối tích hợp (commit 5ea154c)
- [x] process-assets louvre thật (commit 8956796)
- [ ] kiểm toàn bộ
- [ ] tài liệu

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
