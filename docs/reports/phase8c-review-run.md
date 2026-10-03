# Phase 8C – Reviewer 3 (chạy thật): nạp, hiệu năng tương đối, ổn định

Ngày 2026-10-03, HEAD a136028 → f02234c (chỉ thêm docs SPEC §17.25 + nền Phase 10, không đụng mã đồ họa). Cổng riêng 8801 (wrangler) / 5411 (vite). Headless SwiftShader: FPS chỉ so tương đối.

Trạng thái: XONG (lượt 2, 11:51 → 12:31, tiếp nối lượt 1 bị cắt). Đã dọn mọi wrangler / workerd / vite / Chrome của mình; không sửa mã, không commit.

**Verdict: ĐẠT CÓ ĐIỀU KIỆN** – ổn định / nạp / chất lượng / Louvre / Ghi nguồn / quota / bộ nhớ đều PASS, 0 lỗi console, 0 rơi xuyên đất. Hai điểm phải xử lý trước khi chốt: (F1) FPS Thấp chỉ còn ≈ 64 % trước 8C trên SwiftShader (đo xen kẽ cùng điều kiện; tiêu chí kế hoạch §7.3 là ≥ 90 %), cần đo trên máy thật có GPU tích hợp; (F2) `RIDE_ONLY=3` hỏng 2 / 2 lượt chạy xong ở bản nay, qua ở bản trước 8C (nhiều khả năng script nhạy thời gian, chưa loại trừ hẳn).

Ghi chú: trong lượt 2 nhận nhầm tin "Việc BỔ SUNG cho track H" (nút Xuất dữ liệu thời gian); điều phối đã xác nhận bỏ qua – không làm gì.

| # | Kiểm | Kết quả |
|---|---|---|
| 1 | Tải lần đầu (byte, request, READY, _1k khi Thấp, 404 / console) | PASS |
| 2 | Chuyển chất lượng (menu Esc → Cài đặt, localStorage, tải lại, ?quality= ưu tiên) | PASS |
| 3 | Đi bộ / đạp xe qua các khu (rơi, kẹt, chìm / lơ lửng, khung hình p95 / max) | PASS ổn định; FPS: xem F1 |
| 4 | Bộ nhớ (heap, geometries / textures / buffers qua nhiều chunk) | PASS |
| 5 | sim louvre 3 bot + ride-check (+ RIDE_ONLY=3) | sim PASS, ride-check PASS, RIDE_ONLY=3 FAIL (F2, flaky?) |
| 6 | Phòng Louvre với đồ họa mới | PASS (ghi chú hiệu năng) |
| 7 | Ghi nguồn khóa trước đích / mở sau | PASS |
| 8 | client/dist: tổng dung lượng, tệp lớn nhất, số tệp | PASS |
| 9 | Quota SPEC §3 | PASS |

## (1) Tải lần đầu – PASS
Đo bằng CDP (encodedDataLength, cache tắt, context mới mỗi lượt), bản build `client/dist` qua `wrangler dev --port 8801`, Chrome headless SwiftShader 1280×720.

| Lượt | Request | Tổng tải | Tới `__READY__` | Tệp lớn nhất | Lỗi console / 404 |
|---|---|---|---|---|---|
| offline, tự động (SwiftShader → Thấp) | 29 | 13,86 MB | 22,7 s | main.js 2,02 MB (gzip) | 0 lỗi / 0 (2 warning "GPU stall due to ReadPixels" của driver) |
| offline `?quality=low` | 29 | 13,86 MB | 19,9 s | main.js 2,02 MB | 0 / 0 |
| offline `?quality=high` | 29 | 22,44 MB | 35,3 s | `sky_2k.hdr` 3,63 MB | 0 / 0 |
| online (đội, đua louvre đang chạy) `?quality=low` | 33 | 14,37 MB | 17,9 s | main.js 2,02 MB | 0 / 0 |
| online `?quality=high` | 33 | 22,95 MB | 24,6 s | `sky_2k.hdr` 3,63 MB | 0 / 0 |

- Thấp chỉ tải `sky_1k.hdr` + mọi `*_1k.webp` (roof_slates_03 ×3, asphalt_02 ×3, trees ×2) + `waternormals.jpg`; KHÔNG có `sky_2k.hdr` hay texture 2K nào. Cao tải bản 2K (không tải kèm bản 1K). Thấp tiết kiệm ≈ 8,6 MB / lượt vào.
- Lượt online Cao đầu tiên không tới `__READY__` trong 240 s: trùng lúc một reviewer khác build lại `client/dist` (hash main đổi DZfKY1UR → CkZVbdxW giữa chừng, wrangler phục vụ thư mục dùng chung). Chạy lại: 24,6 s, sạch. Ghi nhận là nhiễu môi trường, không phải lỗi game.
- FPS rAF 10 s sau READY (chỉ so tương đối, máy tải ~15): offline Thấp 1,96 vs Cao 1,06; online Thấp 3,85 vs Cao 1,14.

## (2) Chuyển chất lượng – PASS
Playwright trên bản build (8801, `?offline=1`), theo dõi request texture:
- Esc → menu dựng ngay, ô "Chất lượng đồ họa" (`#menu-quality`) thấy trong Cài đặt; mặc định trên SwiftShader = Thấp (tải `sky_1k.hdr` + 8 texture `_1k`).
- Chọn Cao → `localStorage['cuoc-dua-paris.quality'] = 'high'`, gợi ý "Đã lưu "Cao". Tải lại trang để áp dụng."; tải lại → tải `sky_2k.hdr` + texture 2K (không tải `sky_1k`), ô chọn hiện Cao.
- `?quality=low` thắng lựa chọn đã lưu Cao (tải bản 1K, không 2K) và KHÔNG ghi đè localStorage; `?quality=high` thắng Thấp đã lưu; `?quality=bogus` → về lựa chọn đã lưu (Thấp). Online cũng nhận `?quality=` (bảng (1)). 0 lỗi console.

## (3) Đi bộ / đạp xe qua các khu – PASS (ổn định); FPS xem F1
FPS trước 8C vs nay (`bench.mts`: đúng URL preset `p8c-bench` = xe đạp autoMove lên Champs-Élysées, NPC mật độ 1; Vite dev, Chrome SwiftShader 1280×720; sau `__READY__` lấy mẫu rAF 30 s; 2 vòng xen kẽ trước / Cao / Thấp, máy gần như rảnh):

| Vòng | Bản | FPS avg / p5 | khung p95 / max (ms) | lệnh vẽ | tam giác | READY |
|---|---|---|---|---|---|---|
| 0 | trước 8C (7270518) | 3,48 / 3,16 | 317 / 350 | 348 | 1,00 M | 23,7 s |
| 0 | nay Cao | 1,11 / 0,98 | 1017 / 1100 | 361 | 0,83 M | 34,8 s |
| 0 | nay Thấp | 2,11 / 1,71 | 583 / 767 | 335 | 0,76 M | 18,4 s |
| 1 | trước 8C | 3,50 / 3,33 | 300 / 367 | 348 | 1,00 M | 12,3 s |
| 1 | nay Cao | 0,89 / 0,52 | 1933 / 2650 | 364 | 0,83 M | 38,2 s |
| 1 | nay Thấp | 2,34 / 2,07 | 483 / 550 | 338 | 0,77 M | 18,1 s |

- Trung bình: Cao ≈ 29 % FPS trước 8C (−71 %), Thấp ≈ 64 % (−36 %). Tiêu chí §7.3 (Cao không giảm > 15 %, Thấp ≥ 90 %) KHÔNG đạt trên SwiftShader. Số của báo cáo tích hợp ("Thấp 1,5 → 2,3") lấy mốc "trước" đo lúc máy tải nặng ở thời điểm khác → không so được; đo xen kẽ cùng lúc ở đây cho kết quả ngược.
- Ít lệnh vẽ / tam giác hơn trước mà chậm hơn → chi phí nằm ở pixel (PBR + normal map mái / nhựa đường, lá cây alpha chồng nhiều lớp, nước hai lớp, nền HDRI, ở Cao thêm IBL + bloom + SMAA) – loại chi phí SwiftShader (rasterize bằng CPU) phóng đại nhiều nhất; GPU thật có thể khác hẳn → cần đo trên máy người dùng.
- Giật cục khi đổi LOD: không thấy – max / p95 khung hình 1,08–1,37 ở mọi lượt (trước 8C 1,10–1,22) khi đạp xe 30 s qua hàng cây Champs.
- 0 lỗi console ở 6 lượt bench.

Lượt tour (đi bộ thật bằng phím W, Cao, dev server 5411, dịch chuyển tới từng khu rồi giữ W theo tuyến A* đi bộ ~160 m, mỗi khu ≤ 25 s mô phỏng; ft = thời gian khung hình ms dưới SwiftShader, máy tải 13–47 vì chạy song song):

| Khu | Đi được | Kẹt (>4 s không tiến) | Rơi | Lệch đất min / max (m) | ft p50 / p95 / max | heap MB | GL tex / buf | geometries / chunk |
|---|---|---|---|---|---|---|---|---|
| Bir-Hakeim | 81 m | 1 | 0 | 0,13 / 10,1 (mặt cầu) | 550 / 1133 / 2217 | 151 | 125 / 1857 | 406 / 33 |
| quai Branly | 19 m | 1 | 0 | −0,01 / 10,1 | 333 / 517 / 1633 | 171 | 164 / 2595 | 564 / 45 |
| Eiffel | 84 m | 0 | 0 | −0,02 / 0,03 | 1233 / 1700 / 2167 | 189 | 177 / 3079 | 664 / 55 |
| quai d'Orsay | 90 m | 0 | 0 | −0,02 / 0,02 | 500 / 633 / 2450 | 184 | 182 / 3040 | 663 / 53 |
| Champs | 99 m | 0 | 0 | −0,02 / 0,03 | 1017 / 1333 / 2050 | 199 | 182 / 2901 | 632 / 58 |
| Concorde | 71 m | 0 | 0 | −0,02 / 0,01 | 533 / 950 / 1500 | 195 | 182 / 2805 | 606 / 54 |
| Louvre | 80 m | 0 | 0 | 0 / 0,06 | 350 / 650 / 2000 | 217 | 191 / 3106 | 676 / 56 |
| Notre-Dame | 86 m | 0 | 0 | −0,07 / 0,04 | 2017 / 3517 / 5183 (máy tải ~47) | 221 | 184 / 2722 | 592 / 53 |

- 0 lần rơi xuyên đất, 0 lần respawn, 0 lỗi console tới giờ; lệch đất −0,02…0,06 m ở mọi khu không có cầu (Bir-Hakeim / quai Branly 10,1 m = tuyến A* đi trên mặt cầu, `heightAt` là lòng sông đã khoét: không phải lơ lửng).
- 2 lần "kẹt" (Bir-Hakeim, quai Branly) KHÔNG do đồ 8C: đồ phố 8C (ghế, thùng rác, nhà chờ, hộp sách, bàn ghế quán, potelet…) và cây đều KHÔNG có collider (`StreetProps.ts` dòng 289 "Visual only"; `propColliders` chỉ có lamp / morris / metro như trước 8C; `Vegetation.ts` `colliders: []`). Bộ đếm "kẹt" = 4 s mô phỏng không tiến tới waypoint, ở ~1–2 FPS SwiftShader việc lái theo waypoint hay vượt quá điểm (vòng lại) → nhiều khả năng là nhiễu của script; người chơi vẫn đi tiếp sau đó (81 m / 19 m).

## (4) Bộ nhớ – PASS
- Lượt tour (3) chạy 11:33 → 12:14 (≈ 40 phút tường, 8 khu, mỗi khu một bộ chunk mới, Cao): heap sau gc 151 → 171 → 189 → 184 → 199 → 195 → 217 → 221 MB; texture GL sống 125 → 164 → 177 → 182 → 182 → 182 → 191 → 184 (đi ngang từ khu thứ 4); buffer GL 1857 → 3106 → 2722, geometries 406 → 676 → 592 theo số chunk (33 → 58 → 53): tăng theo vùng dày nhà / cây, giảm khi chunk dỡ → không thấy tăng vô hạn. Vòng 2 (LOOPS=2) bị dừng tay để nhường CPU.
- Lượt riêng `mem.mts` (Thấp, dịch chuyển xa lặp lại Bir-Hakeim → Louvre → Notre-Dame, đo sau gc khi chunk ổn định):

| Vòng | Khu | heap MB | tex | buf | prog | geometries | chunk |
|---|---|---|---|---|---|---|---|
| 0 | Bir-Hakeim | 131 | 72 | 858 | 39 | 185 | 31 |
| 0 | Louvre | 177 | 78 | 1193 | 42 | 257 | 47 |
| 0 | Notre-Dame | 196 | 82 | 1414 | 42 | 306 | 51 |
| 1 | Bir-Hakeim | 136 | 75 | 867 | 42 | 187 | 31 |
| 1 | Louvre | 181 | 80 | 1197 | 42 | 258 | 47 |
| 1 | Notre-Dame | 197 | 83 | 1421 | 42 | 307 | 51 |
| 2 | Bir-Hakeim | 137 | 75 | 874 | 42 | 188 | 31 |
| 2 | Louvre | 182 | 80 | 1204 | 42 | 259 | 47 |

Kết luận (4) – PASS: cùng một khu, lần ghé sau chỉ hơn lần trước rất ít và giảm dần: texture GL đứng yên (75 / 80 từ vòng 1), heap +1 MB, geometries +1, buffer GL +7 mỗi vòng 3 lần dịch chuyển xa (≈ 90–130 lượt nạp / dỡ chunk). Không có gì tăng vô hạn; phần dư nhỏ (≈ +1 geometry / +7 buffer mỗi vòng) đáng theo dõi ở Phase 12 nhưng không ảnh hưởng một cuộc đua 2 giờ (ước < +250 buffer). Dừng sau vòng 2 Louvre để nhường CPU.

## (5) sim + ride-check – sim PASS, ride-check PASS, RIDE_ONLY=3 FAIL (F2)
- `npm run ride-check` (lượt 1, 11:12): EXIT 0 – tuyến A* 371 m, đạp 388 m, 98 % mẫu trên đá lát, đi bộ 4,0 / xe 5,2 m/s, nghiêng 15,6°, thấp nhất −0,02 m so với địa hình, heap 143 → 155 MB (49 → 55 chunk), người + xe ≈ 11 lệnh vẽ, ngã / đứng dậy / lên lại đều đúng.
- `npm run sim -- --leg louvre --bots 3 --speedup 2` (harness trong tiến trình; lượt 1 bị `alarm` quá ngắn cắt, exit 142) → lượt 2 (alarm 1500 s, 11:54 → 12:06): **exit 0, 3 / 3 đội về đích** (bị loại: 1 = đội về cuối, đúng §17.22), xếp hạng 3 dòng, chốt sai 3 / đúng 3 trong phòng Louvre, feed ≥ 6 / bot, dòng ghi / đội 37 (≤ 160).
- `RIDE_ONLY=3 npm run ride-check` lượt 1 (12:02 → 12:16, máy tải 30–47 do 3 Chrome SwiftShader khác): **EXIT 1** – "Xuống bậc kè: từ y 1.60 tới nước (bơi) · vào bậc từ mặt bên: KHÔNG (−329.8, 128.4, walk) · leo lên: có, y −6.85 (mặt nước −5.50)". Mã liên quan không đổi từ trước 8C (`git diff 7270518..HEAD`: StairBuilder / stairs / Terrain / player / Bridge không đổi; chỉ `Water.ts` = hình ảnh; chunk tạo lại chỉ thêm điểm prop); phần 3 vốn ghi "flakes under load". Chạy lại:
  - 12:16 song song nay vs trước 8C (`before8c` worktree 7270518, cùng `ride-check.ts` phần 3 giống hệt): **trước 8C EXIT 0** ("vào bậc từ mặt bên: có · leo lên: có, y −4.99"); bản nay hết 90 s chưa `__READY__` (timeout của chính script khi 2 Chrome cùng nạp).
  - 12:19 bản nay gần như một mình: **EXIT 1**, y hệt lượt 1: "vào bậc từ mặt bên: KHÔNG (−331.5, 128.4, walk) · leo lên: có, y −6.85 (mặt nước −5.50)".
  - Dữ liệu vật lý tại chỗ đó giống hệt trước 8C: chunk −2_0 / −1_0 chỉ thêm 1 điểm `bus_shelter` (không collider), code bậc / kè / người chơi không đổi, `maxSubSteps` 5 → bước mô phỏng mỗi khung không lớn hơn. Khác biệt duy nhất: khung hình nặng hơn → các lệnh `face()` của script (theo giờ thật) rơi vào thời điểm mô phỏng khác → người chơi lệch 3–5 m về phía đông và đi vào thành bên của dãy bậc. Xếp loại: script phần 3 nhạy thời gian (FLAKY, nặng thêm do 8C), không phải lỗi lối chơi; chưa loại trừ 100 % (không kịp chạy `RIDE_DEBUG=1`).
- `sim --url http://localhost:8801`: lượt đầu Bot 1 gặp socket 1006 (trùng lúc build lại dist); lượt 2: 3 / 3 về đích, exit 0, ≈ 14,9 request / bot / phút → 20 đội × 2 h ≈ 35 639 (< 40 000), 7,6 dòng / bot / phút.

## (6) Phòng Louvre – PASS (1 ghi chú hiệu năng)
`npm run screenshot -- --path "/?louvre=1&card=louvre&roomAt=view&quality=high"` (+ `roomAt=button`), dev server: 0 lỗi console, exit 0. Ảnh `screenshots/r3-room-high.png`: phòng sáng đều (đèn trần, đèn tranh, tường sáng dần lên trần), 23 chỗ tác phẩm, nút đỏ / xanh trên cột thấy rõ, biển "Chốt đáp án", nhân vật đứng đúng sàn; không thấy cây / đồ phố / bầu trời / nước trong phòng (phòng sâu 30 m, cây + đồ phố đặt theo `ctx.height` của lưới địa hình lúc dựng chunk, không raycast → không thể "rơi" xuống phòng).
- Ghi chú: khi đứng TRONG phòng vẫn vẽ cả thành phố phía trên: `__STATS__` 338 lệnh vẽ, 716 k tam giác, 50 chunk, 27 xe + 27 người NPC (không có che khuất). Có từ 8B; 8C thêm cây / đồ phố / hậu kỳ làm phần vẽ thừa này nặng hơn.

## (7) Ghi nguồn – PASS
Cuộc đua thật trên 8801 (chặng test louvre, 1 đội, đã bắt đầu), bản build dist, `?quality=low`, mở bằng Esc → menu → nút "Ghi nguồn":
- Đang đua: bảng hiện "Mở sau khi về đích", 0 dòng, toast "Bảng Ghi nguồn mở sau khi về đích".
- Host gửi `host.race finish` → 5 s sau mở lại: 36 dòng, mục "Phòng Louvre" (art-NN, dữ liệu GIẢ) đứng đầu, có các dòng 8C (Poly Haven, Flame of Liberty, Morris). 0 lỗi console.

## (8) client/dist – PASS
- `client/dist` (build 11:28, main-CkZVbdxW): 64 MB, 439 tệp (≤ 20 000).
- Lớn nhất (thô): `assets/main-*.js` 5,50 MB (gzip 2,02 MB), `textures/sky_2k.hdr` 5,45 MB (tải 3,63 MB), `models/arc.glb` 2,96 MB, `assets/roadgraph-*.json` 2,30 MB, `textures/asphalt_02_nrm.webp` 2,03 MB, `asphalt_02_col.webp` 1,70 MB, `data/elevation.bin` 1,62 MB, `models/props.glb` 1,59 MB. Mọi tệp ≤ 25 MB (SPEC §3).

## (9) Quota SPEC §3 – PASS (không đổi)
- sim louvre 3 bot (harness): 14,9 request tính phí / bot / phút → 20 đội × 2 h ≈ 35 636 (< 40 000); 7,6 dòng SQLite / bot / phút; 37 dòng / đội. Trước 8C (`phase8b-gate.md`): ≈ 35 643, 7,7, 37 → như cũ. `--url` (wrangler thật): ≈ 35 639.
- 8C không thêm lệnh gửi mạng nào (`git diff 7270518..a136028` client / shared / worker: không có `send(` / `WebSocket` / `fetch(` mới). Tài nguyên mới (HDRI, texture, glb) là static asset: `[assets]` trong `wrangler.toml` không có `run_worker_first` → phục vụ thẳng, không tính request Worker; mỗi tệp ≤ 5,5 MB (≤ 25 MB).
- `client/public` trong git: trước 8C 29,3 MB / 406 tệp → nay 49,7 MB / 427 tệp (+20,4 MB, +21 tệp); tải ban đầu thực tế Thấp 13,9 MB / Cao 22,4 MB (bảng (1)).

## Phát hiện

| # | Mức | Người chơi thấy | Phát hiện | Bằng chứng | Đề xuất |
|---|---|---|---|---|---|
| F1 | Nên sửa (chặn chốt nếu máy thật cũng vậy) | có (FPS) | FPS sau 8C thấp hơn trước rõ rệt ở CẢ hai mức: Thấp ≈ 64 %, Cao ≈ 29 % FPS trước 8C (SwiftShader, đo xen kẽ cùng điều kiện, 2 vòng). Tiêu chí §7.3 (Thấp ≥ 90 %, Cao ≤ −15 %) không đạt trên máy dev. Mặc định tự động Thấp chỉ cho GPU khớp `weakGpu` (SwiftShader / Intel trừ Arc / Mali…); GPU rời / Apple Silicon nhận Cao. | Bảng (3); `scratchpad/r3-bench.log` | Đo `p8c-bench` / `-low` trên laptop thật của người dùng (GPU tích hợp + Mac) trước khi chốt. Nếu Thấp vẫn < 90 %: cho Thấp gần Phase 7 hơn (tắt normal map mái / nhựa đường, lá cây LOD1 không alpha-test hoặc thưa hơn, nước một lớp, nền trời đơn giản), hoặc hạ cấp theo FPS lúc chạy (ponytail trong `graphics.ts`). Sửa con số "Thấp 1,5 → 2,3" trong `phase8c-integration.md` (mốc trước đo lúc máy tải nặng). |
| F2 | Theo dõi (flaky?) | không (người chơi không cần bơi) | `RIDE_ONLY=3` hỏng 2 / 2 lượt chạy xong ở bản nay (vào bậc kè từ mặt sông: KHÔNG, lệch 3–5 m về phía đông, dừng ở z 128,4), qua ở bản trước 8C chạy cùng lúc. Code + collider tại chỗ giống hệt trước 8C (chunk chỉ thêm 1 điểm `bus_shelter` không collider). | Mục (5); `r3-ride3.log`, `r3-ride3c.log`, `r3-ride3-before.log` | Chạy `RIDE_DEBUG=1 RIDE_ONLY=3` trên máy rảnh / có GPU để xác nhận; làm phần 3 bớt nhạy thời gian (ra lệnh `face` theo giờ mô phỏng, nới bán kính waypoint 0,8 m, hoặc `?quality=low&npc=0` + viewport nhỏ). Ghi TODO nếu chấp nhận flaky. |
| F3 | Nhỏ | gián tiếp (FPS trong phòng) | Đứng trong phòng Louvre (kín, sâu 30 m) vẫn vẽ cả thành phố: 338 lệnh vẽ, 716 k tam giác, 27 xe + 27 người NPC, hậu kỳ ở Cao. Có từ 8B, 8C làm nặng thêm. | `screenshots/r3-room-high.png` + `__STATS__` mục (6) | Khi `room.inside`: ẩn nhóm thế giới / NPC (hoặc `camera.layers`), bỏ hậu kỳ; vài dòng trong `main.ts`. |
| F4 | Thông tin | không | Bộ nhớ: mỗi vòng 3 lần dịch chuyển xa còn dư ≈ +1 geometry, +7 buffer GL, ≈ +1 MB heap; texture đứng yên. | Bảng (4) | Theo dõi ở Phase 12 (đã có ponytail giữ CPU copy trong `attach.ts`). |
| F5 | Thông tin | không | Tải ban đầu: Thấp 13,9 MB / 29 request, Cao 22,4 MB (thêm `sky_2k.hdr` 3,6 MB + texture 2K); `client/public` +20,4 MB so với trước 8C, trong ngân sách +25 MB của kế hoạch. Thấp không tải bản 2K nào. | Bảng (1) | – |

Ghi chú công cụ (không phải lỗi game): `perl -e 'alarm N; exec …' node_modules/.bin/tsx x.ts` chỉ giết tiến trình tsx cha, tiến trình con (node + Chrome) chạy tiếp mồ côi → dùng `node --import tsx x.ts` (một tiến trình) khi đặt hạn giờ. Script đo nằm trong scratchpad phiên (`load.mts`, `ui.mts`, `cred.mts`, `tour.mts`, `mem.mts`, `bench.mts`, `setup.mjs`).
