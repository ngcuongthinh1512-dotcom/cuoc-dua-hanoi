# Phase 10 – Track C: client đội ("vừa rời đi n phút trước", toast / thẻ sau Hoàn tác)

Trạng thái: **xong** (nhánh `phase10-track-C`, worktree riêng, 1 commit `feat(phase10): track C – …`; chưa ghép vào main). Kế hoạch: `docs/plans/phase10.md` §5.3 (V4) + §3.4 / §9 (kiểm toast `reviewUndone`); hợp đồng nền: `docs/reports/phase10-foundation.md` (track C).

## Đã làm
1. **`client/src/race/ui/format.ts`**
   - `zoneLines(members, teams, now): ZoneLine[]` (`{ text, gone }`): đội đang ở trước (theo `since`, cũ trước) "Đội Xanh – đang làm Thử thách 2"; đội đã rời sau, mới rời trước: "Đội Xanh – vừa rời đi 3 phút trước (đang làm Thử thách 2)". n = `max(1, ceil((now − left) / 60 000))`; dòng ẩn khi `now − left > NET.zoneLeftMs` (đúng 10 phút vẫn hiện "10 phút trước"). Thay dòng lọc bỏ `left` (hàng rào tạm của nền).
   - `ZoneList` (lớp thuần, cùng kiểu `StartOrderBanner`): giữ danh sách `zone` cuối của máy chủ; `update(now)` trả `true` khi chuỗi dòng đổi (phút nhảy, hết hạn, danh sách mới), `ticking` = còn đội đã rời trong danh sách. Đây là chỗ test được "RaceHud vẽ lại khi phút đổi" mà không cần DOM.
2. **`client/src/race/ui/RaceHud.ts`**: `zone()` lưu danh sách vào `ZoneList` rồi `drawZone()`; `update()` chỉ gọi `drawZone()` khi `ticking` (không có đội đã rời → không làm gì mỗi khung); DOM chỉ dựng lại khi `ZoneList.update` trả `true` (không dựng mỗi khung); panel tự ẩn khi dòng cuối hết hạn (không cần tin `zone` mới); dòng đã rời có lớp `.rc-zone-left`. `demo()` `?zone` thêm Đội Vàng rời 2 phút 10 giây trước ("3 phút trước") và đặt đồng hồ demo (preset `p7-zone` giờ hiện đủ ba loại dòng).
3. **`client/src/race/ui/race.css`**: `.rc-zone-left { opacity: 0.7 }`.
4. **Test** (`client/src/race/ui/format.test.ts`, 21 test, +8 so với trước; `scripts/hud-check.ts`, xem "Lệch" #3):
   - `zoneLines`: đội đang ở (cũ trước, tên từ `welcome.teams`, dự phòng "Đội <slot>"); đội vừa rời sau đội đang ở và cờ `gone`; phút làm tròn LÊN tối thiểu 1 (−2 s, 0, 1 ms, 59 999, 60 000 → 1; 60 001, 120 000 → 2; 120 001 → 3; 599 999 → 10); ẩn khi quá `NET.zoneLeftMs` (còn đúng tại mốc, mất sau 1 ms; đội hết hạn không che đội đang ở); thứ tự (đang ở theo `since`, rời đi mới rời trước) và không đổi mảng đầu vào.
   - `ZoneList`: 60 khung trong cùng phút = 0 lần vẽ lại, đúng 1 lần khi phút nhảy (60 001 ms) / ở mốc 10 phút / khi hết hạn; đội quay lại (danh sách mới không còn `left`) → dòng thành "đang làm" ngay, `ticking` tắt; danh sách rỗng ban đầu không vẽ, danh sách rỗng sau danh sách có vẽ 1 lần.
   - Hoàn tác (thuần): Phạt → Hoàn tác: đếm ngược mất ở dòng giữa màn hình / dòng thẻ trên trái / thẻ đầy đủ, thẻ đếm chờ duyệt từ giờ gửi GỐC, không ô trả lời, câu trả lời là "Chờ Host duyệt" chứ không "Bị phạt".
   - `hud-check` (DOM thật, Chrome): 7 kiểm cho bảng "Tại điểm này" (thứ tự, lớp mờ, 100 khung cùng phút = 0 `MutationObserver` record, phút nhảy "2 phút trước", mốc 10 phút, hết hạn mất dòng, chỉ còn đội đã rời → tự ẩn) và 7 kiểm cho Hoàn tác (xem dưới).
5. **Ảnh**: 1 ảnh đại diện `screenshots/p10c-zone.png` (cùng URL với `p7-zone`, `-- --path "/?player&npc=0&wait=1&card=route&zone" --name p10c-zone`; `screenshots/` bị gitignore). Đã XEM: "TẠI ĐIỂM NÀY – Đội Xanh – đang làm Thử thách 2 / Đội Đỏ – đang làm Lựa chọn kép / Đội Vàng – vừa rời đi 3 phút trước (đang làm Thử thách 1)", dòng cuối mờ hơn, xuống dòng trong khung 330 px, không che thẻ nhiệm vụ.

## Kiểm toast `reviewUndone` + thẻ sau Hoàn tác (không cần sửa mã)
- **Toast**: máy chủ gửi `{t:'notice', code:'reviewUndone'}`; `client/src/main.ts` nhánh `m.t === 'notice'` → `notice(m.code)` (chỉ `lockWrong` đi đường riêng) → `NOTICES.reviewUndone` = "Host đã rút lại quyết định vừa rồi. Thẻ mật thư trở lại như trước." (từ nền; `Toasts.test.ts` đã khóa danh sách mã). Không có âm báo cho mã này (chỉ `approved` / `penalized` có `reviewSound`).
- **Thẻ**: mọi thứ trên màn hình là hàm của `race` view mới nhất + đồng hồ máy chủ; `RaceHud.setView` không giữ gì của view cũ ngoài `seenKey` (bước@receivedAt thẻ đã bật) và `draft` (theo bước). Đã chạy thật trong Chrome (`hudtest.html`, nay là phần mới của `hud-check`):
  - **Phạt → Hoàn tác**, thẻ đóng: chip đếm ngược giữa + dòng "Phạt: còn 02:29" biến mất; dòng trên trái thành "Chờ Host duyệt · 00:22" tính từ giờ gửi GỐC; không bật thẻ đầy đủ (cùng bước, đã thấy).
  - Cùng ca, thẻ đang mở: đếm ngược trên thẻ mất, "Đang chờ Host duyệt · 00:24", không ô trả lời, câu trả lời lại là "Chờ Host duyệt".
  - **Duyệt → Hoàn tác**: thẻ bước kế bật; sau Hoàn tác thẻ CŨ bật lại thay thẻ mới (khi thẻ mới còn mở HOẶC đã đóng), thẻ trên trái về nhãn cũ, `race.lastCard` = thẻ cũ (F5 không bật lại); Duyệt lần hai lại bật thẻ mới (receivedAt mới).
- Quan sát cho người ghép (không phải lỗi): Hoàn tác một Duyệt làm thẻ cũ bật lại thành thẻ đầy đủ CÓ hiệu ứng phong bì (như mọi thẻ "mới"). Muốn êm hơn: `openFull(card, false)` khi `card.receivedAt < was.receivedAt` – một dòng ở `setView`, chưa làm (chờ ý người dùng). Sổ mật thư đang mở lúc Hoàn tác: khác bước → sổ đóng, thẻ bật; cùng bước → giữ (nội dung sổ không phụ thuộc chờ / phạt; mở lại là tải từ máy chủ). Hòm bước kế: máy chủ gửi `box hide`, `ClueBoxes.nextBoxes` đã xử lý (đọc, không sửa).

## Lệch yêu cầu / kế hoạch
1. Kế hoạch §5.3 nói "dưới 1 phút: 'vừa rời đi'" (không có n); theo yêu cầu điều phối: n luôn ≥ 1, làm tròn lên ("vừa rời đi 1 phút trước" ngay từ giây đầu). Đổi một chỗ: `Math.max(1, …)` trong `zoneLines`.
2. `zoneLines` đổi chữ ký (thêm `now`, trả `ZoneLine[]`); chỉ `RaceHud` + test gọi nó.
3. **Ngoài danh sách file track C: `scripts/hud-check.ts`** (+2 mục, ≈ 45 dòng, chèn trước phần "game page"): vì yêu cầu "hud-check nếu rẻ" và đó là nơi duy nhất kiểm RaceHud bằng DOM thật. Không track nào khác sở hữu file này. Nếu điều phối muốn giữ nguyên danh sách, bỏ riêng file này khi ghép: mọi thứ khác đứng độc lập.
4. Ảnh chụp bằng `--path` thay vì tên preset `p7-zone`: preset đó có timeout cố định 30 s (`screenshot.ts`), máy tải nặng (load average 14–43) chưa tới `__READY__` kịp; `--path` cho 90 s và cùng URL.

## Kiểm
- `npx vitest run --root client src/race src/ui/Toasts.test.ts`: 104 test qua. `tsc -p client` + `tsc -p scripts`: xanh.
- `hud-check` bản chỉ phần HUD (bản cắt tạm ở máy, đã xóa; phần "game page" pointer-lock không chạy vì máy tải nặng và mã đó không đổi): toàn bộ mục cũ + 14 mục mới `ok`, `no console errors`.
- `npm run screenshot` (`p10c-zone`): không lỗi console, đã xem PNG (xem mục Đã làm #5).
- Một lần cuối `npm run build && npm test` từ gốc worktree: build xanh (tsc 4 gói + vite + `wrangler deploy --dry-run`); test scripts 113, shared 79, worker 154 qua, client 750/751. Test hỏng duy nhất `client/src/geo/gps.test.ts` "search time ≤ 5 ms median" là test đo thời gian, hỏng vì máy tải nặng (load average 44; chạy lại riêng lúc máy vẫn tải cũng hỏng, giống ghi chú của nền), không chạm file nào của track C.

## Việc tay còn lại (khi ghép với track S)
- e2e thật (`npm run dev:api` + 2 trình duyệt): A và B vào cùng một điểm; A đi ra → B thấy dòng mờ "vừa rời đi 1 phút trước", chữ tự tăng mỗi phút mà không nhấp nháy; A quay lại → dòng mất, thành "đang làm"; A ngắt kết nối → dòng "vừa rời đi"; chờ quá 10 phút (hoặc giảm `NET.zoneLeftMs` khi thử) → dòng mất không cần tin mới.
- Hoàn tác thật Duyệt / Phạt trên đội thật: nghe / thấy toast, thẻ về đúng, hòm bước kế biến mất (cần track S + H).
- Người dùng duyệt chữ: "vừa rời đi 1 phút trước" (n ≥ 1) và hiệu ứng phong bì khi thẻ cũ bật lại sau Hoàn tác.
- Docs cho người ghép (kế hoạch §8, không thuộc track C): `docs/RACE_RULES.md` mục "Tại điểm này": đội rời đi còn hiện 10 phút kèm "vừa rời đi n phút trước"; `CLAUDE.md` dòng `client/ … race/ui/`: thêm "ZoneList, dòng vừa rời đi".
