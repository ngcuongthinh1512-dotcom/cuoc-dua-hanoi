# Phase 6 – Kiểm chứng track A (Worker + RaceRoom)

Người kiểm: verifier độc lập (2026-10-01). Worktree `agent-a8a436f546bdaf2c2`, diff `25d2543..a629dba`. Không sửa mã nguồn; repro nằm trong scratchpad của phiên (`repro/verify-*.test.ts`, chạy bằng `cd worker && npx vitest run --config <scratch>/repro/vitest.config.mjs`).

## Kết quả chạy
- `npm run build && npm test`: **qua** (scripts 18, shared 24, client 539, worker 30).
- Sở hữu file: chỉ `worker/src/*` của A, `worker/src/race/{presence,boxes}.ts` (+ test), `worker/src/test/harness.ts` (chỉ thêm helper), `shared/src/protocol/{constants,types}.ts` (chỉ thêm), `docs/reports/phase6-track-a.md`. Không đụng SPEC / TODO / CLAUDE.md / file của C. ✓
- Test không rỗng: đột biến (bỏ snapshot khi ngắt; broadcast tin hộp) → 3 test live đỏ. ✓
- Yêu cầu §6 A: đủ (hibernation, 1 thiết bị, tick 500 m + Host, dirty, dừng sau 10 s, snapshot 2 s + khi ngắt, replay 10 s, rebuild, speed flag, respawn, 4429/4413/4400/4401, socket chết 4408, alarm, host.state ≤ 1 s, kênh hộp + hysteresis + welcome.boxes + hibernation). Không có test cho socket chết im (đã thử tay: R5/R8 dưới đây – hoạt động).

## Lỗi (đã tái hiện)
| # | Mức | Ở đâu | Tái hiện |
|---|---|---|---|
| R1 | major | `RaceRoom.ts:268` (+ `codec.ts:79` so mét với hằng cm) | `respawn {y: 5000}` (hoặc `x` tới 1 000 km) được nhận → mọi `tick` có đội đó `decodeTick() === null` ở Host và đội trong 500 m (toàn bộ tick bị bỏ); snapshot lưu y ngoài khoảng → sau restart pose đội mất. **Tái hiện.** |
| R2 | major | `RaceRoom.ts:225-229` + `speed.ts` (dấu thời gian lúc server nhận) | Đi đúng `footSpeed` 4 m/s, mạng khựng 0,8 / 1,0 / 1,2 s rồi dồn tin → `flagged: true`, event `speed v=6.3`. Cờ không tự xoá; Phase 9 sẽ phạt từ cùng cửa sổ. **Tái hiện.** |
| R3 | major | `RaceRoom.ts:171, 226, 288` (và constructor `:94` sau khi ngủ) | Đóng socket, vào lại, gửi pose cách 2 km → không flag, pose đó thành "hợp lệ" (welcome lần sau = 2 007 m). Trái SPEC §8.10 "vị trí phải qua kiểm tra tốc độ". **Tái hiện.** |
| R4 | major | `RaceRoom.ts:259-272` | 6 `respawn` 390 m cách nhau 300 ms → 2,3 km trong < 2 s, không flag (d đo từ điểm respawn trước). Mỗi respawn 2 dòng SQLite, không giới hạn ngoài 15 tin/s → 1 đội phá ngân sách 20 000 dòng trong ≈ 12 phút. **Tái hiện.** |
| R9 | minor | `RaceRoom.ts:126-133` | 20 lần sai mã gửi song song → cả 20 là 401, lần 21 vẫn 401 (đọc `fails` trước `await request.json()`). **Tái hiện.** |
| R10 | minor | `RaceRoom.ts:89-90, 115, 212` | Không ai di chuyển → DO ngủ → bộ đếm về giá trị snapshot cuối (`http 3→1, rows 12→0`). Xảy ra mỗi lần ngủ, không chỉ restart. **Tái hiện.** |
| R7 | minor | `RaceRoom.ts:191, 399-407` | Mạng khựng 3,2 s → 16 pose dồn → đóng 4429 (client nối lại, tốn request + ~6 dòng). **Tái hiện.** |
| – | minor | `RaceRoom.ts:250-252` | Tin `bike` từ Host không bị chặn theo vai trò → `bikes.onTeam('host', …)`. Đọc mã. |
| – | minor | `RaceRoom.ts:227-229` | `mode: 'bike'` tự khai là được giới hạn xe (×1,3) mà không kiểm đội có xe / đang ngồi. Đọc mã. |
| – | minor | `RaceRoom.ts:172` | `reconnects` tăng cả ở lần kết nối đầu (tóm tắt "Chào mừng trở lại" lệch 1). Đọc mã. |

## Đã kiểm, ổn
- R5: đội chỉ gửi `ping` đứng im 36 s trong khi đội khác di chuyển → không bị đóng (Host không ping → 4408, đúng như báo cáo A ghi cho track D).
- R8: đội chỉ `ping` > 30 s, DO tự ngủ rồi thức (đội khác di chuyển) → không bị đóng (`getWebSocketAutoResponseTimestamp` còn sau khi ngủ).
- Không lộ: tọa độ hộp chỉ tới socket của đội đó; bước sau không gửi; `host.state` (mã, `steps`) chỉ tới tag `host`; tick đội lọc 500 m.
- Ghi trước khi trả lời: login/connect/createTeams ghi SQLite đồng bộ trước `send` (output gate).
- Quota: snapshot 2–3 dòng / 6 s, replay 1 / 10 s, tick / host.state / hộp chỉ là tin xuống.

## Gợi ý sửa (ngắn)
- R1: trong `respawn`, `const p = decodePose(encodePose(pose)); if (!p) return close(4400)`; sửa `point()` dùng giới hạn mét.
- R2: dấu thời gian mẫu = `max(now, prev + 1000/NET.sendHz)` (giới hạn vượt trước `now` ≤ ~1 s), hoặc bỏ qua chênh lệch do dồn tin.
- R3: mẫu đầu sau khi mở cửa sổ mới → so với `l.valid`; xa hơn ~25 m (dò xoắn ốc 20 m) → event + flag như respawn đáng ngờ.
- R4: cộng dồn quãng respawn trong một cửa sổ (ví dụ 60 s) so `maxRespawnJump`, và/hoặc giới hạn số respawn / phút.
- R9: đọc lại `loginFails.get(ip)` sau `await`. R10: `snapshotAt ??= …; soon()` khi bộ đếm đổi ngoài đường pose (fetch, alarm, createTeams).
