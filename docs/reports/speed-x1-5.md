# Báo cáo: tăng toàn bộ tốc độ di chuyển ×1,5 (2026-10-04, SPEC §17.43)

Yêu cầu: đi bộ 4 → 6 m/s, xe đạp 6 → 9 m/s (bikeSpeedMultiplier 1,5 giữ), bơi theo footSpeed (×1,5), Shift ×2 (12 / 18 m/s). NPC, nhảy, ngã dậy, camera bay không đổi. Đợt 2 (commit riêng): mật độ NPC ×2.

## Đã đổi
- `client/src/config.ts` `movement.footSpeed` 6; `shared/src/leg/schema.ts` default 6; chặng mẫu `worker/legs/paris-demo.json` + `test/paris-demo.filled.json` 6 / 1,5 (trước 4 / 1,3).
- `bike.brakeDecel` 7 → 10 m/s² (giữ thời gian dừng cũ: 9 m/s → 0 trong 0,9 s trên nhựa); `bike.sharpTurn.loss` 2 → 3 (giữ cùng tỉ lệ mất tốc khi cua gắt ≈ 93 % top; test §17.29 đo cap 17,2 < 17,1 với loss 2).
- KHÔNG đổi CharacterController / `player.*`: đo bằng probe Rapier (xoá sau khi đo) — bậc 0,2 / 0,3 / 0,35 / 0,39 m leo được ở 4, 6 VÀ 12 m/s (maxY đúng chiều cao bậc); khối 0,5 m chặn ở 6 / 12; dốc 25° (ramp bậc thang) lên đủ 3 m ở 6 / 12. Ba test "hỏng" của lần thử trước là do hình học test: nhân vật đi 3 s × 6 m/s = 18 m, VƯỢT QUA hộp bậc 6 m sâu (z −11 … −5) rồi rơi về y 0; ramp xe 5 s × 9 m/s = 45 m vượt mặt bằng kết thúc ở z −30. Sửa test: hộp bậc 30 m, mặt bằng tới −60.
- Tốc độ phẳng: KCC Rapier bỏ chuyển động ~1–3 bước / giây ở MỌI tốc độ (đo 4: 3,91; 6: 5,84; 12: 11,6 m/s trung bình 10 s; không phụ thuộc snapToGround / skin) → test "walks at footSpeed" nới 2 % → 4 % (vẫn "không bao giờ nhanh hơn").
- Test khác: `RemotePlayers.test` −4 → −footSpeed; `legs.test`, `RaceRoom.test`, `leg.test` theo mặc định mới; `scripts/ride-check.ts` bỏ hằng 1,3 (nay: xe ≥ 85 % bikeTopSpeed và ≤ 101 %).
- Docs: `docs/LEG_FORMAT.md` movement mặc định 6 (+ cảnh báo khối `movement` trong file chặng ghi đè), SPEC §17.43, chú thích `shared/src/protocol/constants.ts`.
- Máy chủ: ngưỡng cờ / điểm tin cậy tính từ `welcome.movement` (RaceRoom.ts 363–396) → tự thành 6 × 2 × 1,25 = 15 m/s đi bộ, × 1,5 = 22,5 m/s xe; test live dùng `nearLeg(…, footSpeed)` tường minh → không đổi.

## Kiểm
- vitest client (player, vehicle, config, net, Minimap) 226 ✓; shared 81 ✓; worker legs / RaceRoom / RaceRoom.live 30 ✓; `npm run build` ✓ (dry-run).
- `npm run ride-check` (SCREENSHOT_PORT=5411): đi bộ tối đa **6,000 m/s**, xe **9,000 m/s**, tỉ lệ **1,500**; đạp 447 m tuyến A* 371 m (96 % đá lát), không ngã trên tuyến; nghiêng 15,5°; **phanh dừng 1,42 s** (đá lát grip 0,65), F xuống OK; thấp nhất −0,02 m (không xuyên đất); heap +16 MB / 6 chunk; 11 lệnh vẽ; **ngã ở 9,00 m/s** vào mặt tiền Rue Royale, dậy sau 3,53 s, lên lại / xuống OK. (Phần 3 bơi / bậc kè: opt-in, bỏ qua.)

## Đợt 2: mật độ NPC ×2 (`feat(npc)`)
- `client/src/config.ts`: `npc.density` 1 → 2; `traffic.max` 60 → 120, `crowd.max` 40 → 80 (ở mật độ 2 người đi đường chạm trần 40 cũ). `autoDensity` giữ.
- Đo cùng khung (`/?player=87.8,-184.5,-25.97&autoMove=walk&wait=4&debug=1`, Rue Royale, SwiftShader):

| | calls | triangles | npcCars | npcPeds | npcMs | npcDrawMs |
|---|---|---|---|---|---|---|
| trước (density 1, `p4b-street`) | 318 | 705 217 | 29 | 20 | 0,095 | 0,22 |
| sau (density 2, `screenshots/npc-density2.png`) | 323 | 834 182 | 58 | 39 | 0,202 | 0,34 |

- Kẹt xe: `NPC_DENSITY=2 npx vitest run src/npc/traffic.test.ts -t "no gridlock"` (Concorde, 10 phút, seed 1–4, 51 xe / seed): đứng > 30 s **2 / 2 / 2 / 0 trên 51** (3 %, ngưỡng 10 % ✓); đi ≥ 50 m trong phút cuối **28 / 31 / 34 / 26 trên 51 = 58 %** (ngưỡng 75 % ✗ ở mật độ 1). Mật độ 1,5 còn nhiễu hơn (14–18 / 38 đứng ở seed 1–3, 0 ở seed 4) → chỉ số phụ thuộc seed / hàng chờ đèn đỏ. Kết luận: không tắc cứng, nhưng Concorde xếp hàng dài hơn; test mặc định vẫn chạy ở mật độ 1 (biến môi trường `NPC_DENSITY` để đo lại). TODO.md Phase 4B đã ghi: nâng thông lượng nút giao trước khi tăng tiếp.
- README / CLAUDE.md không ghi số mật độ → không đổi. SPEC §17.43 thêm một dòng.

## Rủi ro còn lại
- NPC ×2: Concorde / Champs-Élysées xếp hàng dài hơn ở đèn đỏ (58 % xe đi ≥ 50 m / phút cuối); máy yếu: `autoDensity` tự hạ (min 0,25) nên FPS được giữ, mật độ hiển thị có thể về gần mức cũ.
- Tải bản đồ khi Shift + xe 18 m/s: biên nạp = fog far 700 + `chunks.fogMargin` 100 → 100 m dự trữ = 5,5 s ở 18 m/s, 2 worker build song song; máy yếu có thể thấy mép sương "thiếu" phía trước khi chạy thẳng lâu. Chưa chỉnh (tăng `fogMargin` nếu thấy).
- Camera xe: `followSharpness` 12 → trễ pivot ≈ 1,5 m ở 18 m/s (trước 1 m): còn chấp nhận.
- File chặng thật nằm ngoài repo: nếu có khối `movement` (ví dụ 4 / 1,3 chép từ mẫu cũ) thì vẫn chạy tốc độ cũ — Host cần sửa thành 6 / 1,5 hoặc bỏ khối.
- Bán kính cua xe ở 9 m/s ≈ 6,9 m (turnRate.top 1,3 rad/s), 18 m/s ≈ 14 m: ngõ hẹp cần phanh trước.
