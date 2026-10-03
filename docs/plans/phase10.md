# Kế hoạch Phase 10 – Công cụ Host (thu hẹp, SPEC §17.24)

Viết 2026-10-03 trên main `871c01b`. Phạm vi theo SPEC §17.24 **kể cả dòng "Sửa"**: chỉ có MỘT Host nên **bỏ** "khóa bài khi nhiều Host cùng duyệt"; **bỏ** soạn chặng trên bản đồ (người dùng nhập chặng bằng file JSON, `docs/LEG_FORMAT.md`). Mã tham chiếu bên dưới là mã trên main hôm nay; kế hoạch **giả định nhánh `phase8d-small` (SPEC §17.21–17.23) đã ghép trước** – xem §9.

## 1. Mục tiêu

| # | Việc | Người thấy | Kết quả đo được |
|---|---|---|---|
| V1 | Ma trận tiến độ: ghim cột "Đội" + hàng tiêu đề khi cuộn ngang / dọc; khung "Chờ duyệt" thu gọn được | Host | Ở 1280 và 1024 px, cuộn tới cột "Thử thách 3": vẫn thấy tên đội và tên cột của ô đang nhìn; bấm tiêu đề "Chờ duyệt (n)" thì khung gập còn một dòng |
| V2 | Nút **Hoàn tác** trong 10 giây sau Duyệt / Phạt | Host, đội | Trong ≤ 10 s sau khi bấm, một nút "Hoàn tác (còn n s)" hiện trên trang Host; bấm → đội quay lại đúng trạng thái trước quyết định (thẻ, bước, hàng chờ), máy chủ ghi ≤ 7 dòng SQLite |
| V3 | Nút **xóa cờ đỏ** (`flagged`) + lý do cờ | Host | Bảng "Các đội" ghi lý do + giờ gắn cờ; "Xóa cờ" → cờ tắt trong ≤ 1 s, 3 dòng SQLite, có dòng nhật ký `host.unflag` |
| V4 | Bảng "Tại điểm này" thêm "**vừa rời đi n phút trước**" | Đội | Đội rời vùng (đi ra / mất kết nối) còn hiện trong 10 phút với "vừa rời đi n phút trước", chữ "n phút" tự tăng; đội quay lại thì dòng đó mất; không có dòng ghi SQLite |
| V5 (rẻ, thêm từ TODO) | "Cho qua" cho **mọi** thử thách / nhánh (hiện chỉ phòng Louvre) = "đẩy đội sang bước tiếp theo khi có bug" (SPEC §13.9) | Host | Ô vàng / tím của bất kỳ thử thách nào có nút "Cho qua" (hộp xác nhận); máy chủ xử lý như Duyệt không `id` |

### Ngoài phạm vi (không làm ở Phase 10)
- Khóa bài nhiều Host, `decided_by` có danh tính (chỉ một Host).
- Soạn chặng trên bản đồ, bản đồ Host trực tiếp (§13.5), timeline Gantt (§13.7), xuất CSV / PNG (§13.10), replay.
- Nhật ký `events` hiển thị trên Host (đọc bảng `events` mỗi giây tốn băng thông; làm ở Phase 11 nếu cần cho `sim`).
- Sao chép hình R2 giữa cuộc đua (TODO Phase 10 / 12 → để Phase 12).
- Thu gọn `host.state.progress[].answers` (TODO Phase 8) – chỉ làm nếu đo thấy > 100 KB / lần.

### Mặc định đã áp dụng (chờ người dùng phản đối, không chờ xác nhận)
M1. Cửa sổ Hoàn tác = **10 s theo đồng hồ máy chủ** tính từ lúc máy chủ xử lý quyết định (`NET.undoMs = 10_000`); nút trên trang Host đếm ngược theo giờ máy chủ ước lượng (`serverMs + Date.now() − receivedAt`) và tự ẩn.
M2. Hoàn tác **khôi phục nguyên trạng** các hàng `step_progress` mà quyết định đã đổi + `teams.state` của đội (ảnh chụp trước quyết định). Những gì đội làm trong ≤ 10 s đó **trên các bước bị khôi phục** (tới điểm, "Nhận thử thách", một câu trả lời cho bước kế) **bị bỏ**; đội nhận toast "Host đã rút lại quyết định vừa rồi, thẻ trở lại như trước".
M3. Hoàn tác **bị từ chối** khi: quá 10 s; đội đã **về đích** do quyết định đó (xếp hạng theo thứ tự về đích §17.22 đã báo cho các đội); đội đã sang bước khác bước mà quyết định đưa tới (có quyết định mới hơn / Cho qua / mở hòm kế); cuộc đua đã kết thúc. Khi đó Host dùng cách cũ: "Duyệt câu vừa phạt" hoặc Phạt / Duyệt thủ công.
M4. Xe đạp đã vào bãi do Duyệt **không** quay lại chỗ cũ khi Hoàn tác (đội lấy lại xe ở bãi; `// ponytail`).
M5. Cờ đỏ chỉ là **đánh dấu** (không phạt, như SPEC §13.9). Lưu thêm **lý do** (`speed` vượt tốc, `jump` dịch chuyển bị từ chối, `respawn` hồi sinh quá nhiều) và **giờ gắn**; lịch sử = các dòng `events` sẵn có (`speed` / `jump` / `respawn`) + dòng mới `host.unflag`, không thêm bảng. Sau khi xóa, máy chủ **gắn lại** nếu có đợt vi phạm mới (kể cả trong cùng cửa sổ 60 s của bộ đếm hồi sinh) – đó là hành vi đúng, ghi vào docs.
M6. "Vừa rời đi" giữ **10 phút** (`NET.zoneLeftMs`), **chỉ trong bộ nhớ** của Durable Object (0 dòng SQLite; DO bị đuổi thì mất danh sách rời đi – chấp nhận, như `where` hiện nay). Áp dụng cùng luật ẩn bước sau (SPEC §17.10, review m3): chỉ hiện đội mà **bước lúc rời đi** ≤ bước hiện tại của đội đang xem.
M7. Khung "Chờ duyệt" dùng `<details open>` của trình duyệt; trạng thái gập **không** lưu qua tải lại trang.
M8. V5 "Cho qua" áp dụng cho thử thách gõ chữ, bài ảnh, nhánh Lựa chọn kép đã mở hòm, phòng Louvre; luôn có hộp xác nhận; máy chủ ghi `review approve` với câu trả lời mới `text: ''`, `s: 'approved'` (như đường "approve không id" hiện có); Hoàn tác 10 s áp dụng cho nó như Duyệt.

## 2. Hiện trạng liên quan (đọc mã, main `871c01b`)

- **Duyệt / Phạt**: `shared/src/protocol/types.ts` `HostReview {op: approve|penalize|note, id?, note?}`; `worker/src/race/steps.ts review()` chỉ sửa hàng (câu trả lời → `approved` / `penalized`, `decided_at`, `approval_wait_seconds`, `locked_until`, `rejections`); `engine.ts onHost('host.review')` chạy `advance({kind:'approve'})` rồi `apply()` ghi mọi hàng dirty + events + `teams.state` trong **một transaction** rồi mới gửi (`race` view, notice `approved` / `penalized`, có thể `park` xe). "Nhầm Phạt" hiện sửa bằng N4 "Duyệt câu vừa phạt" (`hostView.ts progressTable`, nút `redo`). Quyết định thứ hai trên cùng câu bị từ chối (`HANDLED`).
- **Cờ đỏ**: `RaceRoom.ts` `TeamState.flagged: boolean` trong `teams.state` JSON; `flag(t)` gọi từ `onPose` (vượt tốc, 1 lần / đợt) và `teleport()` (dịch chuyển / hồi sinh đáng ngờ); `hostState()` gửi `flagged`; trang Host in "Vượt tốc" (`main.ts render`, cột `.flag`) – chưa có nút xóa, chưa phân biệt lý do.
- **Tại điểm này**: `engine.ts` `where` (đội → {key, since}) + `sentZone`; `moveZone` / `left()` / `refreshZones` gửi `{t:'zone', teams: ZoneMember[]}`; client `format.ts zoneLines` + `RaceHud.zone()` vẽ "Đội X – đang làm Thử thách 2". Đội rời đi thì **biến mất ngay**.
- **Ma trận**: `host.css` đã ghim cột đầu (`table.pin tr > :first-child {position: sticky; left: 0}`), chưa ghim hàng tiêu đề; `.scroll {overflow-x: auto}`; khung chờ duyệt `.queue-wrap.has {position: sticky; top: 0}` + `section {max-height: 46vh}` → **che tiêu đề bảng khi cuộn** (review 8B m9, 8 #9). Bảng rộng ≈ 1600 px (7 cột tóm tắt ≈ 520 px + 10 cột bước ≥ 7 em).
- **Quota**: 1 quyết định Host = 1 hàng `step_progress` (+ 1 hàng bước kế khi Duyệt) + 2 hàng `events` (`review`, `complete`) + 1 `teams.state` ≈ 5–7 dòng. Ngân sách 20 000 dòng / 2 giờ (SPEC §3).

## 3. Thiết kế V2 – Hoàn tác 10 giây

### 3.1 Giao thức (`shared/src/protocol`)
- `HostReview.op` thêm `'undo'`: `{t:'host.review', team, step, op:'undo', id}` – `id` **bắt buộc** = `id` câu trả lời của quyết định (Duyệt không `id` / Cho qua: máy chủ đã tạo câu trả lời mới, `id` của nó nằm trong `HostState.undo`).
- `HostState.undo: UndoItem[]` với `UndoItem = { team, step, id, op: 'approve'|'penalize', at, until }` (`until = at + NET.undoMs`): trang Host vẽ nút từ **trạng thái máy chủ** (tải lại trang vẫn còn nút; không giữ bộ nhớ riêng).
- `ServerNotice` thêm `'reviewUndone'` (chữ ở `client/src/ui/Toasts.ts`: "Host đã rút lại quyết định vừa rồi. Thẻ mật thư trở lại như trước.").
- `NET.undoMs = 10_000` (sửa sau review: bỏ `NET.undoKept`, danh sách chỉ cắt theo thời gian – 20 đội nộp cùng lúc, Host Duyệt 6 lần trong 10 s là bình thường).
- `codec.ts isClientMessage('host.review')`: `op === 'undo'` đòi `isInt(o.id, 1, 10_000)`.
- `PROTOCOL_VERSION` + 1 (sau số mà `phase8d-small` đặt).

### 3.2 Máy chủ (`worker/src/race/engine.ts`, `steps.ts`, `db.ts`)
**Bản ghi hoàn tác** (trong `RaceEngine`, bộ nhớ + `meta 'undo'`):
```ts
interface UndoRec { team: string; step: string; id: number; op: 'approve' | 'penalize'; at: number;
  race: TeamRace;                                   // teams.state TRƯỚC quyết định
  rows: Record<string, StepProgressRow | null>;     // hàng TRƯỚC quyết định của mọi bước bị đổi; null = chưa có hàng
  after: { step: number; finishAt: number | null }; // để kiểm "đội đã đi tiếp"
}
```
- Trong `onHost('host.review')` (approve / penalize / Cho qua): trước `apply()` sao chép `TeamRace` + **toàn bộ** hàng của đội (≤ 10 hàng nhỏ); sau `apply()` so sánh (`JSON.stringify` từng hàng) → `rows` chỉ gồm hàng đổi; `after` = `teams.state` mới. Đẩy vào `this.undoV`, cắt còn `NET.undoKept` và còn trong `undoMs`; ghi `meta('undo', JSON)` = **+1 dòng** mỗi quyết định (ngay sau transaction của `apply`; nếu DO chết giữa hai lệnh thì chỉ mất nút Hoàn tác, trạng thái đua vẫn nhất quán). `op: 'note'` không tạo bản ghi.
- Khởi tạo: đọc `meta 'undo'` trong constructor (dựng lại sau evict), lọc theo `now`.
- **Xử lý `op: 'undo'`** (`RaceEngine.undo(team, step, id, now)`):
  1. Tìm bản ghi khớp `team / step / id`; không có → notice warning "Không còn gì để hoàn tác cho bài này."; `now − at > NET.undoMs` → "Quá 10 giây, không hoàn tác được nữa. Dùng «Duyệt câu vừa phạt» hoặc Phạt / Duyệt lại."
  2. Từ chối (M3): `statusV === 'finished'`; `r.finishAt !== null` (đội về đích) → "Đội đã về đích, không hoàn tác được (thứ hạng đã báo cho các đội)."; `r.step !== rec.after.step` hoặc bản ghi không phải quyết định **mới nhất** của đội → "Đội đã đi tiếp / có quyết định mới hơn, không hoàn tác được."
  3. Một transaction: với mỗi `[stepId, row]` trong `rec.rows`: `row ? writeProgress(row) : DELETE FROM step_progress WHERE team=? AND step=?` (xóa = 1 dòng ghi); `saveTeam(team, rec.race)`; `event(now, team, 'host.undo', {step, op: rec.op, id})`; xóa bản ghi khỏi `undoV` + `meta('undo')`. Dòng ghi: ≤ 2 hàng progress + 1 team + 2 event + 1 meta = **≤ 6–7**.
  4. Sau commit: vá cache `rows` (set / delete); gửi đội `{t:'race', view}` + `{t:'notice', code:'reviewUndone'}`; **ẩn hòm bước kế** nếu client đã được tiết lộ (attachment `box` của mọi socket đội → `null`, gửi `{t:'box', op:'hide', step: <id bước kế>}` – `hide` không bỏ hòm đã mở nên không ảnh hưởng hòm cũ) qua `RaceIO.hideBox` mở rộng (`branch?: string`: không branch → `op:'hide'`); `io.changed(now)`; `refreshZones` cho key của đội (bước đổi → `eligible()` đổi).
  5. Không hoàn tác việc `park` xe (M4). Sự kiện `review` gốc **giữ** trong `events` (lịch sử).
- `steps.ts`: không đổi máy trạng thái; chỉ `review()` nới "approve không id" cho mọi `t.kind` khi `state` là `active` / `locked` (V5, M8) – một điều kiện.
- `hostView()` thêm `undo: this.undoV.filter(còn hạn).map(...)`.

### 3.3 Trang Host (`client/src/host`)
- `hostView.ts`: `undoRows(state, now): {key, team, name, step, label, op, id, secondsLeft, text}[]` (chữ: "Đã **Duyệt** «42» của Đội Xanh – Thử thách 1 · Hoàn tác (còn 7 s)" / "Đã **Phạt** …"); `undoMessage(team, step, id): HostReview`.
- `main.ts`: dải `undo-bar` ngay dưới tiêu đề "Chờ duyệt" (luôn hiện khi `state.undo` không rỗng, kể cả hàng chờ trống): mỗi dòng một nút "Hoàn tác (còn n s)" (đếm ngược vẽ lại mỗi `refreshMs` như `queueWaits`), bấm → `fire(undoMessage…)`; sau 10 s dòng tự mất khi `host.state` không còn mục đó. Nút "Duyệt câu vừa phạt" giữ nguyên (dùng sau 10 s).
- Ô ma trận: giữ như nay; thêm nút "Cho qua" (V5) ở ô `active` / `locked` của mọi thử thách / nhánh đã mở hòm (hiện chỉ Louvre), `confirm: "Cho <đội> qua <bước> mà không cần câu trả lời?"`.

### 3.4 Luồng với đội
- Duyệt rồi Hoàn tác: đội thấy toast `approved` ("Host đã duyệt! Mật thư mới…") rồi ≤ 10 s sau toast `reviewUndone`; Sổ mật thư (`book`) mở lại chỉ còn tới bước cũ (máy chủ dựng từ hàng); thẻ hiện lại "Đang chờ Host duyệt · mm:ss" (câu trả lời về `pending`, `approval_wait_seconds` cũ khôi phục → thời gian chờ tiếp tục tính từ `at` gốc).
- Phạt rồi Hoàn tác: đếm ngược phạt biến mất (thẻ của client lật theo `race` view mới), câu trả lời về `pending`, **quay lại hàng chờ** của Host (đúng ca "bấm nhầm Phạt").

## 4. Thiết kế V3 – Cờ đỏ

### 4.1 Giao thức
- `HostMessage` thêm `{ t: 'host.flag'; op: 'clear'; team: string }` (codec: `role === 'host' && o.op === 'clear' && str(o.team)`).
- `HostState.teams[]`: giữ `flagged: boolean`, thêm `flagWhy: FlagWhy[]` (`type FlagWhy = 'speed' | 'jump' | 'respawn'`, không lặp) và `flagAt: number | null` (lần gắn đầu của đợt cờ hiện tại).

### 4.2 Máy chủ (`worker/src/RaceRoom.ts`)
- `TeamState` thêm `flagWhy: FlagWhy[]`, `flagAt: number | null` (mặc định `[]` / `null` trong `teamState()`; dữ liệu cũ không cần migrate vì là JSON).
- `flag(t, why, now)`: nếu `!s.flagged` → `{flagged: true, flagWhy: [why], flagAt: now}` (1 dòng); nếu đã gắn mà `why` mới → thêm vào `flagWhy` (1 dòng, tối đa 3 lần / đợt); đã có → 0 dòng. Gọi: `onPose` → `'speed'`; `teleport(..., type)` → `type` (`'jump'` / `'respawn'`).
- `onMessage 'host.flag'`: đội không có → notice error; không gắn cờ → notice warning "Đội này không có cờ."; có → `transactionSync`: `event(now, team, 'host.unflag', {why: s.flagWhy, since: s.flagAt})` + `saveTeamState(…, {flagged:false, flagWhy:[], flagAt:null})` = **3 dòng**; rồi `pushHostState(now)`. Không đụng `Live.over` / `tp` (M5: đợt vi phạm đang diễn ra sẽ gắn lại khi có bằng chứng mới).
- `hostState()` gửi `flagged, flagWhy, flagAt`.

### 4.3 Trang Host
- `hostView.ts`: `flagText(t, tz): string` → "" hoặc "Vượt tốc · Dịch chuyển lạ · lúc 14:05:09" (map `speed` → "Vượt tốc", `jump` → "Dịch chuyển lạ", `respawn` → "Hồi sinh nhiều"); `TeamRow.flagged/flagWhy/flagAt`.
- `main.ts render()` bảng "Các đội": cột "Cờ" = `flagText` + nút nhỏ "Xóa cờ" (`confirm("Xóa cờ đỏ của <đội>? Lịch sử vi phạm vẫn còn trong nhật ký máy chủ.")` → `send({t:'host.flag', op:'clear', team})`). Hàng đội có cờ: tên đội tô `.flag` cả ở ma trận (`progressTable` thêm `flagged` vào `ProgressRow`, cột "Đội" thêm "⚑") – rẻ, giúp Host thấy ngay khi đang nhìn ma trận.
- `demoState`: Đội Đỏ `flagWhy: ['speed']`, `flagAt: now − 7 phút` (ảnh preset).

## 5. Thiết kế V4 – "Vừa rời đi n phút trước"

### 5.1 Giao thức
- `ZoneMember` thêm `left?: number` (server ms đội rời vùng; không có = đang ở đó). `since` của dòng rời đi = lúc vào vùng (giữ).
- `NET.zoneLeftMs = 600_000`.

### 5.2 Máy chủ (`worker/src/race/engine.ts`, chỉ bộ nhớ)
- `private readonly gone = new Map<string /*rack key*/, { team: string; slot: number; label: string; type: StepType; branch: string | null; since: number; left: number; stepIdx: number }[]>()`.
- `moveZone` khi `was` có và `key !== was.key` → `recordLeft(team, was, now)`; `left()` (mất kết nối) → `recordLeft`. `recordLeft` xóa mục cũ của đội ở key đó rồi đẩy mục mới (nhãn / nhánh / `stepIdx` lấy từ `progress()` tại thời điểm rời). Khi đội **vào** key → xóa mục rời đi của nó ở key đó (đang ở đây thì không "vừa rời đi").
- `refreshZones`: với key của người xem, danh sách = thành viên hiện tại (như nay) **+** mục trong `gone.get(key)` còn `now − left ≤ zoneLeftMs` và `stepIdx ≤ mine` và `team !== t`. Cắt mục quá hạn tại chỗ (prune). Danh sách JSON chứa `left` nên `sentZone` dedupe vẫn đúng.
- **Không** có timer để báo "hết 10 phút": client tự ẩn dòng quá hạn (5.3); lần `zone` kế (ai đó vào / ra) máy chủ gửi danh sách đã cắt. 0 dòng SQLite, không alarm.

### 5.3 Client (`client/src/race/ui/format.ts`, `RaceHud.ts`, `race.css`)
- `zoneLines(members, teams, now)`: đang ở → "Đội Xanh – đang làm Thử thách 2"; có `left` → "Đội Xanh – vừa rời đi 3 phút trước (đang làm Thử thách 2)" (làm tròn lên, tối thiểu "1 phút": người dùng đã duyệt sau review Phase 10; bỏ dòng khi `now − left > NET.zoneLeftMs`); thứ tự: đang ở trước (theo `since`), rời đi sau (mới rời trước).
- `RaceHud.zone()` lưu `members`; `update()` vẽ lại dòng mỗi khi phút đổi (so chuỗi, tránh vẽ mỗi khung hình) với `this.now` (giờ máy chủ ước lượng). Dòng rời đi dùng lớp `.rc-zone-left` (mờ hơn, `opacity .7`).
- Ẩn panel khi không còn dòng (như nay).

## 6. Thiết kế V1 – Ghim cột / tiêu đề, khung thu gọn (CSS + `<details>`)

`client/src/host/host.css` + `main.ts` (chỉ bố cục; không đổi dữ liệu):
- Ma trận: wrapper `.scroll.matrix-wrap { max-height: 72vh; overflow: auto }` để cuộn dọc **trong khung** (sticky `top` cần vùng cuộn riêng; hiện `.scroll` chỉ cuộn ngang nên `top: 0` dính theo trang và bị khung Chờ duyệt che). `table.matrix thead th { position: sticky; top: 0; z-index: 2; background: #141a26 }`; ô góc (th đầu) `left: 0; z-index: 3`. Giữ `tr > :first-child { position: sticky; left: 0 }` (đã có) và thêm `box-shadow: 2px 0 0 #222b3d` để tách cột ghim. Bảng dùng `<thead>` / `<tbody>` (hiện `tr` tiêu đề nằm thẳng trong `table` – đổi trong `drawMatrix`).
- Khung "Chờ duyệt": `queueWrap` → `<details open class="queue-wrap">` với `<summary>` = "Chờ duyệt (n)"; nút "Bật thông báo" **ra ngoài** `summary` (bấm nút trong summary sẽ gập khung). Khi gập: chỉ còn dòng summary dính trên cùng (vẫn thấy số n, vẫn kêu khi có bài mới). `.queue-wrap.has section { max-height: 40vh }` giữ. Dải Hoàn tác (§3.3) đặt **ngoài** `<details>` để không bị gập theo.
- Bảng "Thứ tự vào game" / "Các đội": cùng lớp `.pin`, không cần thêm.
- Ảnh kiểm: preset `p10-host-1280`, `p10-host-1024` (`/host.html?demo=1&louvre=1`, cuộn `.matrix-wrap` sang phải hết cỡ + xuống 200 px bằng script trong `scripts/screenshot.ts`), và `p10-host-collapsed` (gập khung).

## 7. Kiểm thử

| Lớp | File | Kiểm gì |
|---|---|---|
| Thuần (steps) | `worker/src/race/steps.test.ts` | V5: approve không `id` cho `kind: 'answer'` khi active / locked → câu `approved` mới; vẫn từ chối khi `pending` (phải chọn Duyệt / Phạt câu đang chờ) |
| Engine (RaceIO giả, SQLite thật qua harness hoặc mock `sql`) | `worker/src/race/engine.test.ts` | Duyệt → Hoàn tác trong 10 s: `step` về i, hàng i (`answers` pending, `approval_wait_seconds`, `decided_at`) và hàng i+1 (xóa nếu trước đó chưa có) y như trước; `events` có `review` + `host.undo`; dòng ghi ≤ 7. Phạt → Hoàn tác: `locked_until` null, `rejections` cũ, câu về `pending`, `hostView().queue` có lại. Từ chối: quá 10 s; đội `finishAt`; `step` khác; quyết định mới hơn. `meta 'undo'`: dựng `RaceEngine` mới trên cùng `sql` → vẫn hoàn tác được. Hoàn tác không gọi `park` lần nữa; `hideBox` được gọi với step kế |
| Engine zone | `engine.test.ts` | A, B cùng vùng; A rời → B nhận `zone` có A `left`; A quay lại → không `left`; A mất kết nối (`left()`) → có `left`; qua `zoneLeftMs` (now giả) → không còn; A ở bước xa hơn B lúc rời → B không thấy |
| DO thật (wrangler harness) | `worker/src/RaceRoom.phase10.test.ts` (mới) | (a) đội gửi câu → Host Duyệt → đội nhận `approved` + view bước i+1 → Host `undo` → đội nhận `reviewUndone` + view bước i `pending`; `host.state.undo` rỗng sau đó; `undo` lần 2 → `host.notice`. (b) Cờ: pose vượt tốc → `host.state.teams[].flagged` + `flagWhy ['speed']` → `host.flag clear` → `flagged false`, `events` có `host.unflag`; `counters.rows` tăng ≤ 3. (c) `host.review undo` từ socket đội → đóng 4400 (codec) |
| Codec | `shared/src/protocol/codec.test.ts` | `host.review undo` cần `id`; `host.flag` chỉ Host |
| Host thuần | `client/src/host/hostView.test.ts` | `undoRows` đếm ngược, hết hạn thì rỗng; `flagText`; `progressTable` có "Cho qua" cho thử thách gõ chữ, không cho `pending`; `demoState` có mục `undo` + đội có cờ |
| Client thuần | `client/src/race/ui/format.test.ts` | `zoneLines` với `left`: chữ, thứ tự, ẩn quá hạn |
| Ảnh | `npm run screenshot p10` | 3 preset §6; soát bằng mắt: tên đội + tiêu đề cột đều thấy khi cuộn, nút Hoàn tác, cột Cờ + "Xóa cờ", khung gập |
| Toàn bộ | `npm run build && npm test`, `npm run sim -- --leg mini` | không hồi quy; `sim` Host bot không gửi `undo` (không đổi) |

## 8. Tài liệu cần cập nhật (trong phase, tiếng Việt)
- `docs/RACE_RULES.md` mục 7 (Host duyệt): "Host có thể **rút lại** Duyệt / Phạt trong 10 giây: thẻ quay về trạng thái chờ duyệt; những gì bạn vừa làm trong mấy giây đó trên thẻ mới có thể mất"; mục "Tại điểm này": đội rời đi còn hiện 10 phút kèm "vừa rời đi n phút trước"; mục cờ đỏ (nếu có): Host có thể xóa cờ báo nhầm.
- `docs/LEG_FORMAT.md`: **không đổi** (không có trường chặng mới) – ghi rõ trong báo cáo.
- `TODO.md`: xóa các dòng Phase 10 đã làm ở Phase 6 / 7 / 8 (cờ, hoàn tác, rời đi, khóa bài nhiều Host → ghi "bỏ theo §17.24"); thêm tồn: xe không quay lại khi Hoàn tác (M4), danh sách rời đi mất khi DO bị đuổi (M6), nhật ký events trên Host chưa có.
- `docs/reports/HANDOFF.md`: bảng trạng thái Phase 10 + việc tiếp theo (Phase 11).
- `CLAUDE.md`: dòng `client/ … host/` thêm "Hoàn tác 10 s, xóa cờ, khung gập"; `worker/` thêm "undo (meta 'undo'), host.flag"; `shared/protocol` thêm "ZoneMember.left, HostState.undo".
- `docs/plans/phase10.md` (file này) + `docs/reports/phase10-{plan,track-*,integration}.md`.

## 9. Thứ tự ghép & ranh giới file (tránh dẫm `phase8d-small` và 8C)

**Điều kiện bắt đầu:** `phase8d-small` đã ghép vào main (nó sửa `client/src/host/{hostView,main,hostView.test}.ts`, `shared/src/protocol/{types,codec}.ts`, `client/src/race/{RaceClient,ui/RaceHud,ui/format,ui/race.css}`, `worker/src/race/{ranking,engine}.ts`, `scripts/*`) **và** 8C đã có commit `feat(phase8c)`. Phase 10 **không đụng** `client/src/world/*`, `client/src/config.ts` phần `graphics`, `scripts/assets/*`. Mọi track nhánh từ main **sau** hai lần ghép đó.

**Bước 0 – Nền (Opus, 1 commit trên nhánh `phase10-F`, ghép ngay):** giao thức §3.1 / §4.1 / §5.1 (`types.ts`, `codec.ts` + test, `constants.ts`, `PROTOCOL_VERSION`), `Toasts.ts` chữ `reviewUndone`, `demoState` thêm trường mới (để build xanh). Chỉ kiểu + hằng, không logic. `npm run build && npm test` xanh.

**3 track song song (worktree, file sở hữu rời nhau):**

| Track | Model | Sở hữu file | Việc |
|---|---|---|---|
| S – máy chủ | Opus | `worker/src/race/{engine,steps}.ts` + test, `worker/src/RaceRoom.ts`, `worker/src/RaceRoom.phase10.test.ts` (mới), `worker/src/db.ts` (nếu cần helper DELETE) | §3.2 Hoàn tác, §4.2 cờ, §5.2 rời đi, V5 nới `review()` |
| H – trang Host | Sonnet | `client/src/host/{hostView,main,hostView.test}.ts`, `client/src/host/host.css`, `scripts/screenshot.ts` (chỉ thêm preset `p10-*`) | §6 CSS ghim + `<details>`, §3.3 dải Hoàn tác, §4.3 cột Cờ, nút "Cho qua" mọi thử thách; chạy bằng `?demo=1` trước khi S xong |
| C – client đội | Sonnet | `client/src/race/ui/{format,format.test,RaceHud}.ts`, `client/src/race/ui/race.css` | §5.3 dòng "vừa rời đi" tự cập nhật; kiểm toast `reviewUndone` hiện đúng (chữ đã có từ nền). Hòm: **không cần sửa** – `client/src/net/ClueBoxes.ts nextBoxes` đã bỏ hòm chưa mở của bước khi nhận `{t:'box', op:'hide', step}` (đã đọc) |

**Ghép:** F → S → H → C (H và C không chạm file của nhau; S không chạm client). Sau ghép: kiểm e2e thật (`npm run dev:api` + 2 trình duyệt + Host): Duyệt → Hoàn tác, Phạt → Hoàn tác, Xóa cờ, hai đội vào / ra một điểm. Review 2 reviewer (spec+code ∥ visual) theo workflow đã chốt, rồi `feat(phase10): …`.

## 10. Tiêu chí nghiệm thu (đo được)
1. `npm run build && npm test` xanh; `npm run screenshot p10` không lỗi console.
2. Ảnh `p10-host-1280` / `-1024` (cuộn phải hết): cột "Đội" và hàng tiêu đề ("Thử thách 3", "Về đích") đều nằm trong khung; `p10-host-collapsed`: khung chờ duyệt chỉ còn dòng "Chờ duyệt (2)".
3. Test DO (a): từ `undo` gửi đến khi đội nhận `race` view cũ ≤ 1 s trong harness; `counters.rows` tăng ≤ 7 cho một Hoàn tác; `host.state.undo` không còn mục sau 10 s (now giả hoặc chờ thật 10 s).
4. Test DO (b): xóa cờ tăng `counters.rows` đúng 3; `host.state` kế có `flagged: false`.
5. Engine zone: dòng `left` đúng trong `zoneLeftMs`, không ghi SQLite (`counters.rows` không đổi khi vào / ra vùng).
6. Hoàn tác không bao giờ làm đội về đích, không đổi `startOrder`, không gửi hộp của bước sau 150 m (kiểm trong test (a): không có `box reveal` nào tới đội sau `undo`).
7. Ngân sách: mô phỏng 20 đội × 10 quyết định + 5 hoàn tác + 5 xóa cờ ≈ 20·10·1 (meta) + 5·7 + 5·3 = 250 dòng thêm → vẫn < 20 000 (`sim` in ra).

## 11. Rủi ro & câu hỏi mở (mặc định ở §1)
- **Xung đột với 8d**: cả hai sửa `hostView.ts` / `main.ts` / `codec.ts` → bắt buộc nhánh từ main sau khi 8d ghép (§9). Nếu 8d đổi `PROTOCOL_VERSION`, nền cộng tiếp.
- **Hoàn tác sau khi đội đã hành động** (M2): mất ≤ 10 s hành động của đội trên bước bị khôi phục; nếu người dùng muốn "từ chối thay vì bỏ", đổi điều kiện ở §3.2 bước 2 (so hàng hiện tại với `after`) – một dòng.
- **Về đích không hoàn tác** (M3): nếu người dùng muốn hoàn tác cả về đích, phải tính lại thứ tự về đích (8d) và gửi lại thông báo cho các đội – ngoài phạm vi.
- **`<details>` + nút trong summary**: nút "Bật thông báo" phải ra ngoài summary (ghi ở §6); kiểm tay Chrome / Firefox / Safari.
- **Sticky góc**: `position: sticky` hai chiều cần `z-index` góc > hàng tiêu đề > cột; kiểm bằng ảnh.
- **Evict DO**: bản ghi hoàn tác trong `meta` nên sống qua evict; danh sách "rời đi" thì không (M6) – chấp nhận.
- **Cờ gắn lại ngay sau xóa** (M5) khi đội vẫn vi phạm: đúng ý; docs nói rõ để Host không nghĩ nút hỏng.
- **Câu hỏi mở cho người dùng** (mặc định đang áp dụng): (1) 10 s có đủ? (`NET.undoMs` đổi một chỗ); (2) 10 phút "vừa rời đi" (`NET.zoneLeftMs`); (3) có cần "Cho qua" cho mọi thử thách (V5) hay chỉ Louvre như nay; (4) chữ toast `reviewUndone`.
