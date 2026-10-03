# Phase 8B – Verify nền (đối kháng)

Commit kiểm: 6bc28fc "feat(phase8b): nền hợp đồng". Không đọc `~/Documents/chang-that/`, không sửa mã. Script thử nằm ở scratchpad (không commit).

**Verdict: PASS** (không có lỗi chặn). Có 5 mục nên sửa trước / trong lúc mở track, mục 1 phải xong trước khi B nối `feetY`.

## Đã chạy
1. `npm run build` exit 0; `npm test` exit 0: scripts 75 + shared 71 + client 695 + worker 136 = **977**. Diff không thêm `.skip`, `.only`, `.todo`. Không còn workerd / vite chạy.
2. Đối chiếu diff với plan §B–§H, §J "Nền", §N: nền có đủ mọi mục §J. Các chỗ làm khác plan (`louvreView`, `creditsOf`, `hintAt` viết thật; engine `view` / `credits` đủ; `hostView` điền; chặng test 4 bước; `input: 'room'`; luật 4 so cả chuỗi; `maxPicks` là hằng; `feetY` tùy chọn) đều có lý và làm hợp đồng bớt mơ hồ. Riêng `feetY` làm theo một luật sai (mục 1).
3. 52 + 1 chặng sai chạy qua `parseLeg`; CLI `leg:check` chạy trên `louvre.json`: "Hợp lệ: 1 cảnh báo, 23 ô còn trống", exit 0.
4. Test workerd tạm (`createTestHarness`, chặng `nearLouvreLeg`, 2 đội). Kết quả:
   - lobby: pick / lock trả `raceNotOpen`, view trả `race`, credits trả `creditsLocked`.
   - Thẻ T3 (JSON) không chứa note / credit / `"answers":["art`.
   - `answer` với một id đúng, rồi với cả 5 id: im lặng, SQLite không đổi (C1).
   - Đội B (còn ở L-LV) gửi view: thẻ không có `louvre`.
   - paused: pick / lock trả `racePaused`, view trả `race` (paused, T3), credits trả `creditsLocked`.
   - evict: schema '4', đúng một cột `picks`; welcome có `feed: []`, thẻ T3 có `picks: []`.
   - Host finish: credits trả 6 mục, không có note; pick trả `raceOver`.
   - 20 lần view liền nhau: 13 lần được trả, rồi socket bị đóng 4429 (`maxMessagesPerSec`).
5. Chuyển DB v3 thật sang v4 (`git show 6bc28fc~1:worker/src/db.ts`, node:sqlite): v3 → v4 → v4 vẫn giữ dòng; `picks` = '[]'; ghi / đọc lại được; thứ tự cột = `emptyProgress`.
6. `client/dist` không có chuỗi nào của chặng test. `Cour Napoléon` có mặt là của cấu hình landmark, không phải của chặng.

## leg:check / zod
Bắt đúng:
- số tác phẩm: 22, 24;
- id: id trùng (kể cả id của một đáp án);
- đáp án: 4, 6 hoặc 0 đáp án; đáp án trùng; đáp án không phải id; đáp án khác hoa thường;
- giấy phép: `CC-BY-ND`, `personal`, `''`, thiếu `license`;
- `verification: host_approval`;
- thứ tự: 5 đáp án liền nhau (ở giữa, đầu danh sách, cuối danh sách, vòng từ cuối về đầu);
- tệp hình: `monalisa.webp`, `art-1.webp`, `.png`, `.glb` cho tranh, hai tác phẩm cùng tệp, có hình mà thiếu `credit`;
- `title` hoặc `note` của tác phẩm đúng nằm trong description / title / mật thư bước trước;
- vị trí: có `location`; bước trước không phải `route_info`; hai phòng cùng hòm;
- `teaser` khác rỗng;
- hints: đảo thứ tự, bằng nhau, âm;
- khối `louvre`: kind louvre mà thiếu khối; khối louvre trên kind khác; louvre trong nhánh;
- khác: `referenceAnswers`, `retryLockMinutes` 0, toàn tranh, `source: javascript:`, trường lạ.

Không bắt: xem mục 3 và 6.

## Vấn đề

### Chặn
Không có.

### Nên sửa
1. **`RemotePlayers.inView` ẩn người chơi khi |Δy| > 10 m, áp cho mọi chỗ trên bản đồ, không riêng phòng Louvre.**
   - Bằng chứng (DEM thô; y tính từ chân tượng đài Concorde):
     - Esplanade Trocadéro +29,6 m, đài phun nước bên dưới −0,9 m, hai điểm cách nhau khoảng 275 m.
     - Trong 212 m quanh Trocadéro, chênh lệch cao tới 35,9 m.
     - Bir-Hakeim (điểm xuất phát) −5,5 m, Passy +12,4 m.
     - Cour Napoléon +8,2 m, bờ kè Seine khoảng −5 m.
     - `renderRadius` là 300 m, nên khi B nối `feetY` theo hợp đồng, người chơi trên dốc sẽ biến mất dù đang ở ngay trong tầm nhìn.
   - Đề xuất (vẫn 1–2 dòng, trong file của B): chỉ ẩn khi một bên ở dưới đất còn bên kia thì không.
     - `remoteUnder = p.y < heightAt(p.x, p.z) − hideDy`
     - `shown = dist ≤ R && remoteUnder === room.active`
     - Truyền `heightAt` thay cho `feetY`.
   - Ngoài ra: JSDoc của `parsePeers` đang nằm trên `inView`.
2. **Khôi phục `picks` theo kiểu "snapshot ưu tiên" (plan §D) sẽ sai thứ tự thời gian.** Hợp đồng A cần sửa như sau.
   - Trường hợp sai: snapshot lúc t0 có P1 → pick thành P2 → lock ghi `step_progress.picks` = P2 → DO bị đuổi trước snapshot kế. Khi dậy, khôi phục ra P1 (cũ hơn dòng lock).
   - Trường hợp sai thứ hai: lock đúng xong mà snapshot cũ vẫn đè `picks` lên bước đã xong.
   - Đề xuất: bản mới hơn thắng (so `snapshot.t` với `at` của lần lock cuối trong `answers`); không áp snapshot cho dòng đã `completed_at`.
3. **Mã tác phẩm (`id`) tới máy mọi đội (`ArtworkView.id`, op `pick`) nhưng leg:check không kiểm.**
   - Bằng chứng: không có cảnh báo nào cho các trường hợp sau.
     - id `tranh-x` kèm note "Tranh X";
     - id `real1..real5` là 5 đáp án;
     - đổi số để 5 đáp án là `art-01..art-05`, rải khắp tường (vị trí không liền nhau nên luật 5 không bắt).
   - LEG_FORMAT chỉ dặn "mã trung tính", và plan §K coi leg:check là chốt duy nhất.
   - Đề xuất (trong `check.ts`, nền / A sở hữu):
     - id phải trùng tên tệp (`art-NN`) khi có `image`, hoặc dạng `^art-\d{2}$`;
     - cảnh báo khi id chứa từ ≥ 4 chữ của note / title / artist;
     - cảnh báo khi 5 mã đáp án là 5 mã nhỏ nhất / lớn nhất / liền nhau theo thứ tự mã.
4. **Chưa rõ ai làm stand-in dùng chung giữa B và C.**
   - Preset của B dùng `card=louvre` và `card=louvre-locked`, nhưng `DEMO_CARDS` nằm trong `RaceHud.ts` (file của C) và chưa có hai mục này.
   - main.ts chưa có cách lấy `LouvreView` mẫu để dựng phòng với `?louvre=1`. Kết quả: B phải chờ C, hoặc hai bên cùng sửa một khóa.
   - Đề xuất: nền thêm một fixture `DEMO_LOUVRE` (`LouvreView`, 15 tranh + 8 tượng) cùng hai mục `DEMO_CARDS`; B và C chỉ đọc.
5. **Có tính năng của C nằm trong file của B.**
   - Nút "Ghi nguồn" trong cuộc đua: `initCredits()` được gọi ở `main.ts:456` (file B). `Credits.ts` / `Menu.ts` (file C) không có `RaceClient` để gọi `race.credits()`.
   - Toast `lockWrong` có số phút: notice được dẫn trong `main.ts:289` (file B).
   - Tiếng "pop" của feed nằm trong `audio/sfx.ts` (file B).
   - Đề xuất: ghi rõ trong hợp đồng, ví dụ `initCredits({ ask?: () => void })` và main.ts truyền `race?.credits`; B thêm `popSound` và chữ `lockWrong`, hoặc chuyển quyền sở hữu hai file đó.

### Nhỏ
6. Id hoặc tên tệp của tác phẩm đúng nằm trong mô tả ("art-17", "art-17.webp") không bị cảnh báo. Plan cố ý không quét id. Nếu HUD không bao giờ hiện id thì rủi ro thấp; quét có ranh giới từ thì rẻ.
7. Luật 4 so nguyên chuỗi `title` / `note`. Lộ một phần (chỉ một từ đặc trưng trong khi title dài hơn) không bị bắt. Note của Host hiếm khi lọt nguyên văn nên quét note gần như vô dụng. Có thể quét từ ≥ 6 chữ (vì đây chỉ là cảnh báo).
8. `artLeaks` quét bytes art/* theo từ ≥ 4 chữ. Note viết tiếng Anh có "image", "mesh", "node", "scene" thì GLB nào cũng khớp (lỗi giả, chỉ ở CLI). Nên có danh sách từ bỏ qua cho từ khóa glTF / RIFF / WEBP. Ngoài ra `credits.json` chưa được quét `credit.photo` và `credit.source` (URL Commons thường chứa tên tác phẩm).
9. Không có lối thoát nào của Host cho đội kẹt ở phòng Louvre: approve không kèm id chỉ áp cho `free`, và không có pending. Nếu phòng lỗi phía client thì đội kẹt luôn. Gợi ý cho A: cho phép approve không id với `kind === 'louvre'`.
10. Giới hạn 15 tin / giây tính chung pose 5 Hz, pick và gesture. Bấm F liên tục khoảng ≥ 8 lần / giây khi đang đi thì bị đóng 4429 (đã đo: 20 view liền bị đóng sau 13). B nên giãn pick ≥ 150 ms và không gửi gesture mỗi lần pick.
11. Trong phòng chung, đội khác thấy vị trí, hướng và gesture `openBox` (gesture được broadcast tới mọi socket), nên đoán được người ta bấm nút nào. Đây là mặc định §K(6) đang chờ người dùng xác nhận; tắt gesture khi pick thì bớt lộ.
12. Ghi chú cho A:
    - `apply` chỉ gửi thẻ khi có dòng hoặc sự kiện bị ghi, nên effect `pick` (chỉ RAM) phải tự đẩy `view`.
    - `data` của sự kiện `louvre.lock` cần thêm `step` và `minutes` để dựng lại feed khi có `retryLockMinutes` riêng từng bước.
    - Cổng credits đã có ở nền nhưng nền chưa có test (test workerd tạm ở trên xác nhận cổng chạy đúng).
13. `LouvreRoom.build(scene, step, view, groundY)` chưa nhận Rapier `world` (cần cho collider). B tự sửa chữ ký trong file của mình.
14. Thiếu `license` thì thông báo là "không được phép" thay vì "thiếu giấy phép" (thông báo vẫn đúng, chỉ khó hiểu).
