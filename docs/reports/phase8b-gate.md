# Phase 8B – Cổng cuối + verifier đối kháng (phòng Louvre – Thử thách 3)

2026-10-03, nền HEAD `9505472` (tích hợp `810a51a` + docs) + cây làm việc của hai nhóm sửa F1 (máy chủ + `leg:check`) và F2 (client + phòng). Không đọc `~/Documents/chang-that/` (ngoại lệ: `credits-snippet.json` + `manifest.json` trong `.cache/assets-louvre-run/louvre/` chỉ để đếm khớp tên). Không sửa `docs/SPEC.md`. Không đụng worktree / nhánh 8C.

## Kết luận: **ĐẠT** – commit `feat(phase8b)` trên main (xem `git log`).

## 1. Đối chiếu từng mục review với bản sửa (đọc mã, thử "hoàn tác trong đầu")

| Mục | Bản sửa | Kiểm của verifier |
|---|---|---|
| speccode #1 (CHẶN) hết phạt vẫn không chốt được | `roomCardOf(card, serverNow)` dùng `liveStatus` cho cả F ở nút chốt (`roomInteract`) lẫn lời nhắc (`roomPrompt … locked`) | Đọc `main.ts:303–325, 618–626`: cả hai nhánh đi qua `roomCard()` → `roomCardOf`. Máy chủ chấm `lock` bằng `(lockedUntil ?? 0) > now` (steps.ts:138) nên bản sửa client khớp máy chủ. Hoàn tác → test `(1)` thất bại (`status` còn `locked`). **E2E thật** (mục 3): sau khi đếm ngược của client về 0, F ở nút chốt GỬI `{"op":"lock"}` và máy chủ trả lời (chốt sai lần 2 → `lockedUntil` mới); trong lúc phạt F không gửi gì. |
| speccode #2 / visual m7: gợi ý 40 / 70 chỉ thấy khi mở thẻ | `louvreShort` vào `statusLine` (thẻ rút gọn, cả cạnh đếm ngược); `hintNews` toast một lần khi null → số cùng bước | `setView` lấy `was = this.view?.card` trước khi gán, đúng thứ tự. Nối lại giữa lúc gợi ý tới: toast vẫn hiện (đúng, đội chưa thấy). E2E: thẻ rút gọn "Phạt: còn mm:ss · Chọn 5/5 · Đúng 0/5" rồi "Chọn 5/5 · Đúng 0/5"; cả hai toast "Gợi ý: đáp án gồm 5 tác phẩm…" / "Gợi ý: đang đúng 0/5…" bắt được qua MutationObserver. |
| speccode #3: `leg:check` báo LỖI giả trên tệp nén | `artRegions`: WebP chỉ chunk khác `VP8 `/`VP8L`/`ALPH`/`ANMF`; GLB chunk JSON + metadata ảnh nhúng; tệp lạ chỉ từ ≥ 6 chữ; bỏ từ toàn số | Đọc parser: padding lẻ WebP đúng, GLB không BIN đúng, `bufferView` ảnh nhúng đệ quy. `leg:check` thật trên `test/louvre.json`, `test/mini.json`, `paris-demo.json`: 0 LỖI. |
| speccode #4 / e2e minor: feed lặp đôi sau khi DO thức | `feed:` callback: `feedV` null → chỉ đọc lại từ `events` | `feed()` đọc `events` (đã có sự kiện vừa ghi, engine ghi SQLite trước `io.feed`). Test workerd "F1 #1" đúng kịch bản (evict hibernate → lock → welcome 2 dòng). |
| speccode #5: welcome nối thêm feed | `Feed.push(…, replace)`; `feedEntries` giữ `shownAt` của dòng đã thấy | E2E: đóng socket → backoff → welcome lại: `feedBox.lines` 2 → 2, DOM 2 dòng (không lặp), phòng vẫn `active`. |
| speccode #6: RACE_RULES vị trí feed | "ngay bên phải bản đồ nhỏ" | Khớp `Feed.ts`. |
| speccode #7: click kêu khi máy chủ từ chối | `pickChange(before, after)` khi thẻ mới về | `before.lv` là object của thẻ cũ, `after.lv` của thẻ mới (RaceClient thay `view`); offline demo cùng object → null → tiếng phát ngay như cũ. Ngoài phòng `before` null → không kêu. |
| speccode #8 (verify #7): luật 4 so từng từ | từ ≥ 6 chữ của `credit.title` 5 tác phẩm đúng; bỏ `COMMON_ART_WORDS` + chữ đã khớp nguyên tên | `tasks[0]!` chỉ chạy sau `if (!tasks.length) return` (an toàn). Test louvre.test.ts phủ 4 nhánh. |
| speccode #9 (test leg ảnh lệch kiểu) | Không sửa; thêm preset `p8b-real-*` (`?artGlb=&artPhoto=`) dựng 23 tệp thật | Hợp lệ: chặng test GIẢ không phải nội dung thật; `leg:check` chỉ CÒN TRỐNG; preset thật đã có để xem. Ghi TODO. |
| speccode #10 (hai stand-in) | Không sửa | Không phải lỗi. |
| visual M1 (art-02 bóng xám) | `MeshMatcapMaterial` + normalMap + `computeVertexNormals` khi GLB không có NORMAL | Xem `p8b-real-art-02.png`: khối tượng có sáng tối, nhận ra hình. |
| visual M2 (thân che tượng) | `ThirdPersonCamera.override` {shoulder 0.65, lift 0.35} khi `room.active`, gán mỗi khung | Xem `p8b-real-art-02 / art-16 / art-01.png`: tượng lệch khỏi thân. `override` null khi ra phòng (gán lại mỗi khung). |
| visual M3 (tranh nhỏ giữa tấm vàng) | khung instanced ôm theo tỉ lệ ảnh, tranh cao 1,7 m, tâm 2,1 m, rộng tối đa 2,3 m | Test `(6)` kiểm khung rộng nhất < khoảng cách hai chỗ kề. Xem `p8b-real-view.png`. |
| visual m4 (đế bản quét chìa) | `plinth.size` 0,9 ≥ `glbBox` | Test `(7)`. |
| visual m5 / m6 (biển cửa, nút chốt không chữ) | biển 2,6×0,5 m chữ 50 px; biển hai mặt "Chốt đáp án" treo dây | Xem `p8b-real-lock.png`, `p8b-room.png`. |
| visual m8 (HUD tên phố trong phòng) | `street: 'Phòng Louvre'`, `district: 0` (→ nhãn quận rỗng) | `districtLabel(0) = ''`. Xem ảnh phòng. |
| visual m9 (cột Host ngoài khung, "Chờ duyệt" che tiêu đề) | Không sửa | Hợp lệ theo tiêu chí (Host, có từ Phase 8, cuộn ngang vẫn dùng được). Ghi TODO (Phase 10). |
| visual m10 / m11 / m12 | Không sửa | Chỉ offline / chấp nhận / 8–12 px. Ghi TODO. |
| e2e cosmetic (dòng tĩnh "Phòng Louvre" lặp giấy phép) | `baseLines`: bỏ dòng tĩnh khi đã có mục thật, không lặp giấy phép | Test `(8)`. |

Không phải sửa trực tiếp gì: không tìm được bản sửa sai hay test yếu đến mức phải chặn. Hai điểm ghi nhận (không phải lỗi 8B): xem mục 7.

## 2. Chạy thật
- `npm run build` (gốc): qua, 0 lỗi; `grep ZodError client/dist` = 0 tệp.
- `npm test`: **1057 test qua, 0 skip, 0 fail** (scripts 88, shared 77, client 737, worker 155).
- `npm run leg:check`: `worker/legs/test/louvre.json` (1 cảnh báo phạt 0,1 phút + 18 CÒN TRỐNG), `test/mini.json`, `paris-demo.json`: cả ba hợp lệ, 0 LỖI. Chặng nháp ngoài repo: lệnh bị chặn (quy tắc không đọc thư mục đó) → bỏ qua.
- `npm run sim -- --leg louvre --bots 3 --speedup 2`: **3 / 3 về đích**, chốt sai 3 + đúng 3, feed ≥ 6 / bot, **dòng ghi / đội 37** (≤ 160), **≈ 35 643 request** cho 20 đội × 2 giờ (< 40 000), 7,7 dòng / bot / phút.
- Ảnh (`SCREENSHOT_PORT=5361`, chạy lần lượt): mặc định (73 preset, lần đầu một preset hết giờ `page.screenshot` 30 s vì máy tải 19 → chạy lại: qua), `p8b` (48 ảnh, gồm `p8b-real-*` 23 tệp thật), `p8`, `p7`, `p6-boxes`, `p5-hud`: tất cả 0 lỗi console. Đã mở xem `p8b-real-art-02` (tượng có khối sáng tối, không còn bóng xám), `p8b-real-view` (khung ôm tranh, biển "Chốt đáp án", HUD "Phòng Louvre", thẻ rút gọn "Chọn 3/5 · Đúng 2/5"), `p8b-real-lock` (camera lệch vai, lời nhắc "Bấm F để chốt").
- `npm run ride-check`: qua (A* 371 m, đạp 388 m, 96 % mẫu trên đá lát, không ngã; đi bộ 4,00 m/s, xe 5,20 m/s, tỉ lệ 1,300; nghiêng 15,6°, phanh 1,25 s; thấp nhất −0,02 m; heap 134,7 → 145,5 MB; người + xe ≈ 11 lệnh vẽ).
- `scripts/hud-check.ts`: qua, kể cả mục mới "louvre (fix F2)" (thẻ rút gọn "Phạt: còn 00:10 · Chọn 2/5 · Đúng 1/5" → hết đếm ngược mất "Phạt"), 0 lỗi console.

## 3. E2E máy chủ thật (wrangler dev :8797 `--persist-to` scratch + Vite :5362 proxy + Chrome headless SwiftShader; Host + Đội 2 socket thô + Đội 1 trang thật; chặng `test/louvre.json` với `start` dời cạnh Arc du Carrousel; phạt 0,1 phút, gợi ý 0,05 / 0,1 phút)
**18 / 18 kiểm qua**: F ở hòm → thẻ T3 có phòng; F cách hòm ≤ 2 m → `room.active`; 5 lựa chọn (F trước từng nút qua `room.demoSpot`) được máy chủ nhận; chốt sai → thẻ `locked`, Đội 2 nhận `{t:'feed', ok:false, minutes:0.1}`; thẻ rút gọn "Phạt: còn … · Chọn 5/5 · Đúng 0/5"; F trong phạt không gửi `lock`; hết đếm ngược (thẻ vẫn `locked` từ máy chủ, không có thẻ mới) dòng mất "Phạt", lời nhắc "Bấm F để chốt (đang chọn 5)", F GỬI `lock`, máy chủ trả lời; hai toast gợi ý; đóng socket → welcome lại → feed không lặp, phòng vẫn active; 0 `answers` / `note` / `credit` / `license` / `artist` trong mọi tin tới đội; 0 lỗi console. Kịch bản (script `e2e.mts`, bản ghi `e2e-capture.json`, ảnh `e2e-room.png` trong scratchpad, không commit).

## 4. Không rò tên tác phẩm
43 chuỗi (tên, tác giả, người chụp) từ `credits-snippet.json` + `manifest.json`, so không dấu / không hoa thường trên mọi tệp git theo dõi + `client/dist` + `git log --all -p`: **0 rò thật**. 4 tệp + 2 chỗ trong log khớp đều là chữ chung: tên nền tảng ảnh (Wikimedia Commons) trong SPEC / kế hoạch / báo cáo, và mô tả địa danh Flamme de la Liberté có sẵn từ trước 8B trong `landmarks/g2.ts` (một tên tác phẩm chứa cụm đó). `client/public/credits.json` không đổi.

## 5. Tài liệu
`TODO.md` (mục 8B: xong, việc người dùng, việc còn), `docs/reports/HANDOFF.md` (8B xong; kế: ghép 8C, Phase 10, 11, dừng trước 12).

## 6. Dọn
Tắt wrangler / workerd :8797, Vite :5362, Chrome của e2e; không đụng tiến trình của các worktree 8C.

## 7. Ghi nhận (không chặn)
- Trong Chrome headless 2–5 fps, `ClockSync` của client (offset = tin ít trễ nhất) có thể lệch tới ~8 s so với máy chủ khi mọi tin đều tới trễ lúc tải trang: đếm ngược phạt trên thẻ dài hơn thật bấy nhiêu (lần đầu e2e đo "còn 00:13" cho phạt 6 s). Máy thật 60 fps lệch vài ms (review e2e trước đo đúng 00:29 / 30 s). Nếu muốn chắc: lấy mẫu đồng hồ cả từ `pong` (timestamp) ở Phase 10.
- Chặng nháp ngoài repo chưa chạy `leg:check` ở cổng này (quy tắc không đọc); người dùng tự chạy `npm run leg:check -- <chặng thật>`.
