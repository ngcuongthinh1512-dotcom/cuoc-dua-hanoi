# Phase 10 – Nền hợp đồng (Hoàn tác, xóa cờ, "vừa rời đi")

Trạng thái: **xong** (2026-10-03, trên main `a136028`, sau khi 8C + 8D đã ghép). Kế hoạch: `docs/plans/phase10.md` §9 "Bước 0 – Nền" (+ §3.1 / §4.1 / §5.1). Chỉ kiểu + hằng + codec + chữ toast + demoState + stub có TODO ở đúng tệp các track sở hữu; **không** máy trạng thái, **không** UI. `npm run build && npm test`: xem "Kiểm" cuối trang. Commit `feat(phase10): nền hợp đồng (Hoàn tác, xóa cờ, vừa rời đi)`.

## Đã làm
1. **`shared/src/protocol/constants.ts`**: `PROTOCOL_VERSION = 6` (8D đã đặt 5, kế hoạch nói "+1"); `NET.undoMs = 10_000`, `NET.undoKept = 5`, `NET.zoneLeftMs = 600_000`.
2. **`shared/src/protocol/types.ts`**:
   - `HostReview.op` thêm `'undo'` (`id` bắt buộc – codec ép, kiểu vẫn `id?: number` để `reviewMessage` / `RaceEffect.review.op` dùng chung không đổi).
   - `UndoItem { team, step, id, op: 'approve'|'penalize', at, until }`; `HostState.undo: UndoItem[]` (bắt buộc).
   - `FlagWhy = 'speed' | 'jump' | 'respawn'`; `HostState.teams[].flagWhy: FlagWhy[]`, `.flagAt: number | null` (bắt buộc).
   - `HostMessage` thêm `{ t: 'host.flag'; op: 'clear'; team }`.
   - `ZoneMember.left?: number`.
   - `ServerNotice` thêm `'reviewUndone'`.
   - Không có trường nào mang đáp án / ghi chú Host tới client đội: `UndoItem` + `flagWhy/flagAt` chỉ nằm trong `host.state`; `ZoneMember.left` là một mốc giờ.
3. **`codec.ts`**: `host.review` nhận `op: 'undo'` và đòi `isInt(id, 1, 10_000)` khi undo; `case 'host.flag'`: Host + `op === 'clear'` + `str(team)`. Test mới trong `codec.test.ts` (qua khung JSON, từ chối thiếu `id` / `id: 0` / `op: 'set'` / thiếu team / từ socket đội; vòng tròn JSON `ZoneMember.left` + `UndoItem`).
4. **`client/src/ui/Toasts.ts`**: `reviewUndone: 'Host đã rút lại quyết định vừa rồi. Thẻ mật thư trở lại như trước.'` (+ `Toasts.test.ts` danh sách mã).
5. **`client/src/host/hostView.ts` `demoState`**: mỗi đội có `flagWhy` / `flagAt` (Đội Đỏ: `['speed']`, 7 phút trước); `undo: [{ t0, T1, id 2, approve, at = now − 3 s, until = at + undoMs }]` → track H có dữ liệu vẽ nút "Hoàn tác (còn 7 s)" bằng `?demo=1`.
6. **Stub có TODO** (build xanh, hành vi cũ giữ nguyên):
   - `worker/src/RaceRoom.ts`: `TeamState.flagWhy / flagAt` (mặc định `[]` / `null` trong `teamState()`, JSON cũ không cần migrate); `hostState()` gửi hai trường; `case 'host.flag'` → `host.notice` warning "Xóa cờ chưa được hỗ trợ (Phase 10 đang làm)." + TODO track S; TODO ở `flag()`.
   - `worker/src/race/engine.ts`: `onHost('host.review')` chặn `op: 'undo'` **trước** `review()` (notice warning + TODO track S) – bắt buộc, vì `review()` coi mọi op khác `approve` là Phạt; `hostView()` trả `undo: []` (+ kiểu `Pick<…|'undo'>`); TODO `gone` map cạnh `where`; TODO ảnh chụp trước `apply()`.
   - `worker/src/race/steps.ts` `review()`: `op === 'undo'` → `refuse` (hàng rào thứ hai, thuần); TODO V5 nới "approve không id" cho mọi `t.kind`.
   - `client/src/race/ui/format.ts` `zoneLines`: **lọc bỏ** thành viên có `left` (một dòng + TODO track C) – để sau khi S ghép mà C chưa ghép, đội đã rời không hiện thành "đang làm".
   - `client/src/host/main.ts`: TODO track H tại cột cờ (flagText + "Xóa cờ", dải Hoàn tác).

## Lệch kế hoạch (và vì sao)
- **`PROTOCOL_VERSION` = 6**, không phải "5 + 1 sau 8d" một cách mơ hồ: 8D đã đặt 5 trên main → nền đặt 6.
- **Kiểu `HostReview` không tách union** (`op:'undo'` với `id: number` bắt buộc): giữ một interface để `reviewMessage(op: HostReview['op'], id?)`, `RaceEffect.review.op` và `sim.ts` không đổi; codec là nơi ép `id`. Nếu S muốn chặt hơn ở kiểu, đổi tại `types.ts` một chỗ.
- **`zoneLines` lọc `left`** (kế hoạch không nói): thứ tự ghép F → S → H → C để lộ một khoảng S đã gửi `left` mà client chưa hiểu; một dòng lọc khép lỗ đó.
- **`hostView()` đã trả `undo: []`** và `hostState()` đã trả `flagWhy / flagAt` (bắt buộc để kiểu biên dịch): S thay bằng dữ liệu thật, chữ ký không đổi.
- **Chỗ lệch trong mã hiện tại cần S sửa (không thuộc nền, ghi để không quên)**: `engine.ts` hằng `OVERRULED` còn câu "hãy trao đổi với Host còn lại" và chú thích "two Hosts" ở `steps.ts review()` / `engine.ts` N4 → §17.24 chỉ một Host: đổi chữ khi S chạm `onHost`.
- **TODO.md** chưa sửa (kế hoạch §8 để trong phase, lúc ghép); các dòng 112 / 121 / 132 có "Phase 10" cần xóa / đổi khi tích hợp (khóa bài nhiều Host, soạn chặng → "bỏ theo §17.24").
- `docs/LEG_FORMAT.md` không đổi (không có trường chặng mới) – đúng kế hoạch.

## Hợp đồng cho từng track
**S – máy chủ** (`worker/src/race/{engine,steps}.ts` + test, `worker/src/RaceRoom.ts`, `worker/src/RaceRoom.phase10.test.ts` mới, `db.ts` nếu cần DELETE):
- `host.review {op:'undo', id}` đến `engine.onHost` (codec đã ép `id`); thay dòng chặn `if (m.op === 'undo') return notice(...)` bằng `this.undo(team, step, id, now)` theo §3.2 (chữ từ chối M3 ghi trong kế hoạch). `review()` giữ dòng `refuse` cho undo (không bao giờ tới).
- `hostView().undo: UndoItem[]` = bản ghi còn hạn (`until = at + NET.undoMs`), ≤ `NET.undoKept`; lưu `meta 'undo'` (1 dòng / quyết định), dựng lại trong constructor.
- Sau undo: gửi đội `{t:'race', view}` + `{t:'notice', code:'reviewUndone'}` + `{t:'box', op:'hide', step: <bước kế>}` (client `ClueBoxes.nextBoxes` đã xử lý hide) + `io.changed(now)` + `refreshZones`.
- `host.flag clear` trong `RaceRoom.onMessage` (stub đã có chỗ): 3 dòng (event `host.unflag {why, since}` + `saveTeamState`), `flag(t, why, now)` ghi `flagWhy` (không lặp) / `flagAt` (lần đầu); `onPose` → `'speed'`, `teleport` → `type` (`'jump'` / `'respawn'`).
- `ZoneMember.left` từ `gone` map (§5.2), 0 dòng SQLite; `sentZone` dedupe vẫn đúng vì chuỗi JSON chứa `left`.
- V5: bỏ điều kiện `t.kind` trong `review()` "approve không id" (TODO đã đánh dấu); test `steps.test.ts`.
- `NET.undoMs / undoKept / zoneLeftMs` dùng từ `@race/shared/protocol`, không hard-code.

**H – trang Host** (`client/src/host/{hostView,main,hostView.test}.ts`, `host.css`, `scripts/screenshot.ts` preset `p10-*`):
- Đọc `state.undo: UndoItem[]` → `undoRows(state, now)` đếm ngược theo `until − now` (now = `serverMs + Date.now() − receivedAt`), nút gửi `reviewMessage(team, step, 'undo', id, '')` (hàm cũ, op mới hợp lệ với codec).
- Cột cờ: `t.flagged`, `t.flagWhy: FlagWhy[]` (`speed` → "Vượt tốc", `jump` → "Dịch chuyển lạ", `respawn` → "Hồi sinh nhiều"), `t.flagAt` (giờ theo `leg.timezone`); nút "Xóa cờ" → `send({ t: 'host.flag', op: 'clear', team })`. Máy chủ hiện trả `host.notice` warning cho tới khi S ghép.
- `demoState` đã có 1 mục `undo` + Đội Đỏ `flagWhy ['speed']` / `flagAt` 7 phút trước; thêm gì nữa cho ảnh thì sửa ở đó.
- "Cho qua" mọi thử thách: gửi `reviewMessage(team, step, 'approve', undefined, '')` (đường có sẵn); máy chủ chỉ nhận cho `free` / `louvre` tới khi S nới.

**C – client đội** (`client/src/race/ui/{format,format.test,RaceHud}.ts`, `race.css`):
- `ZoneMember.left?: number` (server ms); `NET.zoneLeftMs`. Thay dòng lọc trong `zoneLines` bằng chữ "vừa rời đi n phút trước (đang làm …)" + thứ tự + ẩn quá hạn (§5.3); `RaceHud.zone()` lưu members, `update()` vẽ lại khi phút đổi.
- Toast `reviewUndone` đã có chữ và tự hiện qua `notice(code)` (RaceClient đã nối `{t:'notice'}` → `notice()`); C chỉ kiểm bằng mắt / test chữ.

## Kiểm
- `shared`: tsc + vitest 79 (+1 test codec). `client`: tsc + Toasts / host / race-ui xanh (+1 mã trong danh sách Toasts). `worker`: tsc + steps / engine 54. `scripts`: tsc.
- Toàn bộ `npm run build && npm test` một lần cuối: build xanh (tsc 4 gói + vite + `wrangler deploy --dry-run`); test scripts 113, shared 79 (+1), client 742/743, worker 154 → **1 088 qua**, 0 skip mới. Test hỏng duy nhất `client/src/geo/gps.test.ts` "search time ≤ 5 ms median" (7,1 ms) là test đo thời gian khi máy tải (load average 19, 3 reviewer 8C chạy cùng lúc), không chạm file nào của nền; chạy lại riêng → qua (10/10).
