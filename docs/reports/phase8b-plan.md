# Phase 8B – Phòng Louvre (Thử thách 3): tóm tắt kế hoạch (bản 2, 2026-10-03)

Trạng thái: **kế hoạch sửa xong sau 2 critic** (`phase8b-critic-engine.md`: 2 chặn / 7 nên sửa / 8 nhỏ; `phase8b-critic-coverage.md`: 3 chặn / 5 nên sửa / 9 nhỏ) và các quyết định người dùng cùng ngày (SPEC §17.19 ba dòng "Sửa", §17.20), chưa có nền / track. Kế hoạch đầy đủ: `docs/plans/phase8b.md` (mục A–N; §N = phản hồi từng phát hiện). Không đọc chặng thật; không tải tài nguyên nào (bảng §M vẫn là khung trống trong repo; tên tác phẩm / "thật ở Louvre?" chỉ điền ngoài repo).

## Thiết kế (ngắn)
- **Chặng:** `task.kind: "louvre"` + `task.louvre.artworks[23]` (`id`, `type` painting / sculpture, `image` = tệp tĩnh `art-NN.webp|glb` hoặc '', `note` chỉ Host, `credit {title, artist, photo, license, source}` server-only → gửi sau đích) + `hints {countAtMinutes 40, correctAtMinutes 70}`; bộ 5 đáp án = `task.answers` (server-only); `verification` bắt buộc `auto`; phạt = `retryLockMinutes` (3). Không `location`: phòng nằm **ngay dưới hòm vừa mở**. `leg:check` 9 luật (đủ 23 / 5 id có thật / trùng / tệp tĩnh tồn tại + dung lượng / giấy phép được phép / thiếu `credit` / `title` lọt chữ đội đọc / 5 đáp án liền nhau hay đầu-cuối danh sách / `location` / bước trước / `verification` / mốc 40 < 70 / quét bytes 23 tệp + `credits.json`).
- **Giao thức v4:** op `pick {step, art, on}` (0 dòng; sau mốc 40 tối đa 5 đèn → `pickLimit`), `lock {step}` (pose phải trong vùng hòm), `view` (0 dòng, mọi trạng thái), `credits` (0 dòng; chỉ đội đã về đích / cuộc đua `finished`, ngược lại `creditsLocked`); `TaskView.louvre: {artworks (không note / credit), room, picks, attempts, hintAt[2], hintCount|null, hintCorrect|null (SỐNG = |picks ∩ answers| khi now ≥ mốc 70), maxPicks|null}`; `AnswerView.correct` chỉ từ mốc 70; `{t:'feed'}` một tin mỗi lần chốt (sai + phạt; thêm "đúng n/5" sau mốc 70 của đội đó) + `welcome.feed` 20 tin; `{t:'credits', items}`. Không bao giờ gửi: 5 id, `note`, `credit` trước đích, gợi ý trước mốc, lựa chọn / x của đội khác.
- **SQLite v4:** `step_progress += picks` (ghi **chỉ khi chốt**); `picks` sống trong RAM + dòng `snapshot` (2 s). Chốt sai 3 dòng, chốt đúng 7 → **≈ 16 dòng / đội**; 20 đội ≈ +320 (tổng ≈ 10 330 / 20 000). Feed dựng từ `events` (`ORDER BY id DESC LIMIT 20`).
- **Máy chủ:** thuần trong `steps.ts` (guard: op `answer` vào bước louvre → im lặng; pick cho phép khi bị phạt; lock = so tập chính xác 5; sai → `rejections`, `locked_until`, sự kiện `louvre.lock`, feed; đúng → `complete` qua `done(pose)`). x/5 tính khi đọc, không lưu; không alarm (client gửi `view` ở mốc + 1 s). Vào / ra phòng chỉ đổi y (cửa thẳng đứng dưới hòm) → không `respawn`, không cờ; `RemotePlayers` ẩn đội |Δy| > 10 m.
- **Phòng (client, `race/LouvreRoom.ts`):** hộp kín 26 × 16 × 5 m, sàn = mặt đất − 30 m (kẹp ≥ −35), cửa tại x,z hòm; 23 ô dọc tường (9 / 5 / 5 / 2+2), tranh = khung, tượng = ảnh trên bệ (1 tượng GLB có bản quét hợp lệ), nút đỏ / xanh, nút chốt giữa phòng; `MeshBasicMaterial`, ≤ 40 draw call; texture từ `/art/` tĩnh (0 request DO), placeholder đánh số; **không collider trần**; env riêng của Player theo cờ `room.active` (không bọc `env` chung → NPC / hòm không rơi); dựng đồng bộ trước `spawnAt`; phòng khóa theo `card.step`, chỉ dỡ khi ra cửa.
- **HUD:** thẻ louvre (đang chọn k[/5], chốt sai n, lịch sử chốt + đúng c/5 sau 70, gợi ý 40 / 70 sống), đếm ngược phạt (sẵn có), prompt F động, feed góc **dưới trái** (`feed.corner` cấu hình), toast `lockWrong` / `pickLimit` / `creditsLocked`; bảng Ghi nguồn trong cuộc đua mở sau đích (offline như cũ).
- **Host:** ô ma trận "chọn k/23 · ✗n · 💡40 / 💡70 (x/5 sống)", title lịch sử chốt; không hàng chờ; không mục tải hình.
- **Công cụ:** chặng test `worker/legs/test/louvre.json` (GIẢ) + `nearLouvreLeg()`; harness ≈ 30 kịch bản (kể cả 2 đội không rò, tối đa 5, credits trước / sau đích, evict); sim bot sai → chờ → đúng (không dùng x); `process-assets` target `louvre` (xáo theo manifest, WebP ≤ 300 KB không metadata, GLB đổi tên node, `credits-snippet.json` ngoài repo); preset `p8b-room*`, `p8b-feed`, `p8b-card-louvre`, `p8b-credits`, `p8b-host`.
- **Quota request:** +≈ 40 tổng (ops ÷ 20), ảnh tĩnh 0 → xấu nhất ≈ **36 600 / 40 000** (biên 8,5 %).

## Track (nền Opus trước; 4 track song song, worktree riêng)
| Track | Model | Phạm vi |
|---|---|---|
| Nền | Opus | schema (+ `credit`) + check 1–9 + protocol v4 (`view` / `credits` cạnh `book`) + db v4 + config (`louvreRoom`, `feed.corner`) + stub (steps guard C1, engine cổng `view`/`credits`, RaceClient wire feed / credits → hud, LouvreRoom chữ ký, RemotePlayers Δy) + chặng test + đủ tên preset `p8b-*` |
| A máy chủ | Opus | steps / engine / RaceRoom: pick (RAM + snapshot, tối đa 5) / lock (vùng) / view / credits / guard answer / x sống / feed / hostView; harness test |
| B phòng + ghép client | Opus | `LouvreRoom.ts`, RaceClient, main.ts (F, vào / ra cùng x,z, env riêng Player, không trần), Player.ts, RemotePlayers (1 dòng), sfx, giá trị preset phòng |
| C HUD | Sonnet | thẻ louvre, gợi ý sống, k/5, prompt, feed widget, toast, `Credits.ts` / `Menu.ts` (sau đích), giá trị preset thẻ / feed / credits |
| D Host + công cụ + tài liệu | Sonnet | hostView, sim, leg-check CLI, process-assets `louvre`, LEG_FORMAT, RACE_RULES, giá trị preset Host |

Ghép A → B → C → D; nghiệm thu đo được trong kế hoạch §J.

## Mặc định chờ người dùng xác nhận (kế hoạch §A / §K)
1. Đúng = chọn đúng 5, không thừa. 2. Gợi ý 40 chỉ riêng đội. 3. Chốt không hộp xác nhận; 0 lựa chọn bị client chặn. 4. Không giới hạn số lần chốt. 5. Phạt chạy cả khi Host tạm dừng. 6. Ra phòng bất kỳ lúc nào bằng F ở cửa; F5 trong phòng về đúng chỗ; F5 sau khi xong → sân Louvre. 7. Phòng ngay dưới hòm (ngầm 30 m), cửa thẳng đứng dưới hòm. 8. `verification` louvre bắt buộc `auto`. 9. Tượng = ảnh trên bệ trừ tượng có bản quét hợp lệ (GLB). 10. Khóa dùng `retryLockMinutes`. 11. Feed góc dưới trái (`feed.corner`). 12. Giấy phép theo §17.19 (a) / §17.20 (SA / NC được, ND cấm). 13. x/5 sống + tối đa 5 đèn: sau phút 70 đội vẫn dò được bằng đổi từng đèn (chấp nhận; nút giảm = `correctAtMinutes`). 14. Cảnh báo kẹt Host giữ. 15. Nút "Ghi nguồn" trước đích: hiện, bấm → toast "Mở sau khi về đích".

## Phản hồi critic (tóm tắt; chi tiết §N kế hoạch)
- Engine: C1, C2, S1–S7, N3–N6 áp dụng; N1 / N7 / N8 ghi nhận; **bác** 2 ý nhỏ: "bot sim giải bằng toggle sau mốc" (sim giữ kịch bản so được dòng; toggle nằm ở harness) và "server xáo thứ tự phòng theo race id" (người soạn xáo + `leg:check` luật 5 là đủ); credits theo tác giả / link → thay bằng quyết định §17.20 (ghi nguồn chi tiết chỉ sau đích).
- Coverage: B1–B3, S2–S5, M1–M9 áp dụng; S1 (giấy phép) thay bằng quyết định nới §17.19 (a) / §17.20; trong M8 bỏ ca "ảnh không tải được bởi đội khác" (ảnh là tệp tĩnh công khai theo quyết định).

## Việc người dùng cần làm
- Đưa 23 tên + nguồn **ngoài repo** (`~/Documents/chang-that/`); agent điền giấy phép / dung lượng, người dùng xác nhận một lần → mới tải. Trong repo chỉ giữ khung §M trống.
- Trả lời các mặc định trên (hoặc để nguyên).
