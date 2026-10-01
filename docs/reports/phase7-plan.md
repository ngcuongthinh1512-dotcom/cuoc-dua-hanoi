# Phase 7 – Race engine lõi: báo cáo lập kế hoạch + nền

Kế hoạch đầy đủ: `docs/plans/phase7.md`. Commit nền: `feat(phase7): kế hoạch + nền race engine`. `npm run build && npm test` qua (scripts 20, shared 37, client 589, worker 56 test qua workerd thật). Gói mới duy nhất: `zod` ^4.6.5 (trong `@race/shared`); bundle worker 861 KiB (gzip 146 KiB), **client không có zod** (`grep ZodError client/dist` = 0) và không có chuỗi mật thư nào.

Yêu cầu của anh: làm tiếp Phase 7, **chừa phần Lộ trình và thử thách ở cuối** để anh nhập. Engine vì vậy không phụ thuộc nội dung; anh nhập chặng thật theo `docs/LEG_FORMAT.md` (track D viết), kiểm bằng `npm run leg:check`, nạp trên trang Host. Nền không tạo chặng thật nào; chỉ có chặng demo (điểm kiểm thử SPEC §17.4, nhiệm vụ trống) và 2 chặng test ghi rõ "(GIẢ)".

## Đã đo (2026-10-01)
- **Điểm xuất phát cầu Bir-Hakeim** (`way/183602168`): centroid OSM **48.85569, 2.28758** = world (−2463,5; 1088,6) – lối đi bộ giữa cầu, ngay dưới cầu cạn metro số 6 (cao hơn mặt cầu 6 m). Không trong tòa nhà; đường đi bộ gần nhất 12 m; A* tới L1 (Khải Hoàn Môn) 2 286 m. Đã đổi `worker/legs/paris-demo.json` (`start`, `yawDeg` 33 = nhìn về Passy, `spreadMeters` 5).
- **Lỗi thấy bằng ảnh:** spawn tại centroid → người chơi **đứng trên nóc cầu cạn metro** (chân y = 7,22 m) vì spawn lấy mặt đi được cao nhất. Track B sửa: spawn lần đầu / hộp mật thư đặt ở mặt thấp nhất có khoảng trống ≥ 2,2 m, vào lại dùng `pose.y` làm gợi ý.
- Chân tháp Eiffel nằm trong footprint `building=tower` (không dựng khối, §17.4) → `leg:check` phải bỏ qua footprint này và cầu; khoảng cách tới đồ thị đo tới **cạnh** gần nhất (trên cầu Iéna nút cách nhau ~100 m).
- `zod` có locale `vi` nhưng câu lẫn tiếng Anh → tự viết thông báo tiếng Việt cho mọi mã lỗi, chỉ rõ "Bước 3 (D1) › nhánh A › nhiệm vụ › tiêu đề".
- Test Phase 6 giả định xuất phát = obelisk (gốc tọa độ) → đổi sang tọa độ tương đối với điểm xuất phát của chặng.

## Ngân sách (cuộc đua 2 giờ)

| | 7 đội | 20 đội (SPEC §3) |
|---|---|---|
| Request (điển hình / xấu nhất) | ≈ 8 980 / 12 770 | ≈ 25 450 / 36 350 (< 40 000 ✓) |
| Phase 7 thêm | + 18 (≈ 46 tin đua / đội ÷ 20 + Host) | + 48 |
| Dòng SQLite ghi | ≈ 6 030 | ≈ 9 110 (< 20 000 ✓) |
| Phase 7 thêm | + 710 (≈ 100 dòng / đội) | + 2 010 |

Phase 7 thêm mỗi đội: `step_progress` 3 dòng/bước (bảng WITHOUT ROWID, không index phụ), `teams.state` 1 dòng mỗi lần đổi bước, sự kiện đua 2/bước × 2 dòng, bãi xe ≤ 15; `startOrder` gộp vào dòng kết nối sẵn có; thao tác bị từ chối không ghi gì. Tin gửi xuống (thẻ, Sổ mật thư, `host.state` có bảng tiến trình) không tính phí.

## Quyết định chính (chi tiết: kế hoạch §3, D1–D25)
- Schema zod trong `shared/src/leg` (không có `roadblock`; gặp nó → "trò chơi này không có Vượt rào / roadblock"); mọi khối trừ `id`, `title`, `start`, `steps` có mặc định = chặng demo; `strictObject` báo trường gõ sai; luật thêm: bước đầu là lộ trình, đúng một Chặng dừng ở cuối, ngay trước nó là lộ trình, mọi điểm trong bản đồ, bán kính 15–40 m, ô trống (mức "còn trống"), đáp án lộ trong chữ đội đọc trước.
- Máy trạng thái thuần (`advance`) + engine ghi SQLite trong `transactionSync` **trước** khi gửi gì; geofence chỉ dùng vị trí đã qua kiểm tra tốc độ, thao tác cho dư 2 m, đang ngồi xe không mở được hộp.
- Đội giữ mật thư bước 1 ngay từ lần vào game đầu (nhận ngoài game); lộ trình ngay trước Chặng dừng xong khi vào vùng thảm; Chặng dừng: thảm + NPC, chờ hết phạt rồi check-in = giờ về đích, sau đó ăn mừng + khán giả.
- Hộp theo §17.10 nối với bước thật; thảm là `kind: 'mat'`; không bao giờ gửi tọa độ / tên điểm đến / đáp án / bước sau / tổng số bước.
- Đồng hồ đội = bây giờ (hoặc giờ về đích) − giờ Host nhập; chưa nhập → "--:--". `startOrder` gán ở lần mở WebSocket đầu tiên, `showStartOrder` chỉ ở welcome đó.
- Trạng thái cuộc đua `lobby → running ⇄ paused → finished`; tạm dừng: đi lại được, không thao tác, đồng hồ chạy, **không trừ** (đã sửa `docs/RACE_RULES.md` §11, gỡ TODO).
- Xếp hạng: về đích theo thời gian chính thức (giờ xuất phát riêng), rồi theo bước + giờ xong bước trước; NPC không nói "đội thứ n" (thứ tự lên thảm ≠ thứ hạng khi xuất phát lệch).
- Nhiệm vụ tạm: nút "Hoàn thành (tạm)", server kiểm đúng bước + đúng vùng, `verifyTask` = pass; Phase 8 chỉ thay `verifyTask` + thêm op, không đổi schema / bảng.
- Nạp chặng: chặng đóng gói (`paris-demo`, `paris-demo-filled`, `mini`) hoặc file Host chọn (`host.leg {json}`, chỉ khi `lobby`), lỗi tiếng Việt về trang Host.
- `PROTOCOL_VERSION = 2`.

## Track
| Track | Việc | Mô hình | File chính |
|---|---|---|---|
| A | Race engine server: `steps` / `engine` / `ranking`, ghép `RaceRoom`, Host op, bãi xe, hộp theo bước, test harness | **Opus** | `worker/src/race/*`, `worker/src/RaceRoom.ts` |
| B | Ghép client: `RaceClient`, F mở hộp, spawn đúng tầng cầu, thảm + NPC (`PitStop.ts`), check-in, khán giả, vùng cấm NPC, Login tóm tắt | **Opus** | `client/src/race/{RaceClient,PitStop}.ts`, `main.ts`, `player/*`, `net/ClueBoxes.ts` |
| C | Giao diện HUD: thẻ mật thư, Sổ mật thư (Tab), "Xuất phát ở vị trí thứ n", câu NPC, đồng hồ "--:--" + phạt, "Tại điểm này" | **Sonnet** | `client/src/race/ui/*`, `client/src/ui/HUD.ts` |
| D | `docs/LEG_FORMAT.md` + `npm run leg:check` (bản đồ, gợi ý bãi xe, quét static asset) + chặng test | **Sonnet** | `docs/LEG_FORMAT.md`, `scripts/leg-check.ts`, `worker/legs/test/*` |
| E | Trang Host: trạng thái cuộc đua, nạp chặng, giờ xuất phát từng đội, bảng tiến trình, xếp hạng; bot `sim --leg mini` | **Sonnet** | `client/src/host/*`, `scripts/sim.ts` |

Thứ tự ghép: A → B → C → E → D. Người tích hợp: Opus.

## Câu hỏi mở cho anh (đều có mặc định, không chặn việc làm)
1. Câu NPC ở thảm: "Đội X, các bạn đã về đích! Thời gian: hh:mm:ss. Thứ hạng chính thức sẽ được Host công bố." (không nói "đội thứ n" vì xuất phát lệch giờ). **Mặc định:** như vậy.
2. Host chưa nhập giờ xuất phát của đội: đội vẫn chơi, đồng hồ "--:--", Host thấy cảnh báo đỏ. **Mặc định:** như vậy (phương án khác: tạm lấy giờ vào game).
3. Host phải bấm "Mở cuộc đua" trước khi đội mở được hộp (trước đó đội vẫn vào game, đọc mật thư 1). **Mặc định:** như vậy.
4. Tạm dừng: đi lại được, không thao tác, đồng hồ chạy, không trừ. **Mặc định:** như vậy.
5. Nhiệm vụ Phase 7: nút "Hoàn thành (tạm)" khi đứng đúng vùng. **Mặc định:** như vậy.
6. Nhập chặng thật: viết file theo `docs/LEG_FORMAT.md` → `npm run leg:check -- <file>` → trang Host "Nạp chặng từ file" (lưu trong cuộc đua, không deploy lại). **Mặc định:** như vậy.
7. Chỗ xuất phát: tâm cầu Bir-Hakeim (OSM), rải trong 5 m, nhìn về Passy. **Mặc định:** như vậy.
8. Vào vùng trên xe vẫn tính "đã tới", phải xuống xe mới mở hộp. **Mặc định:** như vậy.
9. Không có `bikeParking` trong file: xe đứng tại chỗ (thành xe trống), `leg:check` gợi ý tọa độ bãi. **Mặc định:** như vậy.
10. "Tại điểm này" bản tối giản ở Phase 7 nếu kịp; "vừa rời đi" ở Phase 10. **Mặc định:** như vậy.
11. Thử thách có câu gợi ý: Phase 7 hiện gợi ý + nội dung cùng lúc; "Nhận thử thách" ở Phase 8. **Mặc định:** như vậy.

## Người điều phối cần ghi vào SPEC §17 (đề xuất §17.13 "Race engine Phase 7")
- Không có `roadblock` trong schema; 4 loại bước; file chặng chỉ bắt buộc `id`, `title`, `start`, `steps` (khối khác có mặc định = chặng demo); `start.yawDeg`, `start.spreadMeters` (5 m); `boxReveal` trong file chặng.
- Lộ trình ngay trước Chặng dừng hoàn thành khi vào vùng Chặng dừng; hộp của nó là thảm (`kind: 'mat'`).
- Đội giữ mật thư bước 1 từ lần vào game đầu; `clue_opened_at` bước 1 = giờ xuất phát Host nhập (hoặc giờ vào game nếu chưa nhập).
- Trạng thái cuộc đua `lobby / running / paused / finished`, Host "Mở cuộc đua"; tạm dừng: đi lại được, không thao tác, đồng hồ chạy, không trừ (§13.3 "đồng hồ dừng theo" không áp dụng).
- NPC ở thảm báo thời gian, không báo "đội thứ n" (vì §17.12 xuất phát lệch giờ); thứ hạng chính thức do Host công bố.
- Geofence: chỉ vị trí qua kiểm tra tốc độ; dư 2 m khi thao tác; phải xuống xe mới mở hộp; vào vùng trên xe vẫn ghi "đã tới".
- Nhập chặng thật: `docs/LEG_FORMAT.md` + `npm run leg:check` + Host "Nạp chặng từ file" (chỉ khi cuộc đua chưa mở).
- Phase 7 nhiệm vụ tạm "Hoàn thành (tạm)"; Phase 8 thay `verifyTask`.
- `PROTOCOL_VERSION = 2`; `step_progress` đủ 19 cột §8.1 (WITHOUT ROWID).
