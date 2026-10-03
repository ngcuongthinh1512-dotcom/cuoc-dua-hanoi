# Báo cáo: giữ Shift chạy ×2 (SPEC §17.29, 2026-10-03)

## Đã đổi
- `shared/src/constants.ts`: `SPRINT_MULTIPLIER = 2` (một chỗ duy nhất; client và máy chủ cùng đọc).
- Client `config.ts`: khóa `sprint: ['ShiftLeft', 'ShiftRight']`, tay cầm `sprint: [4]` (LB, thay đi chậm cũ); `movement.sprintMultiplier = SPRINT_MULTIPLIER`; bỏ `walkSlow` + `slowWalkFactor`.
- `player/CharacterController.ts`: `MoveIntent.sprint`; tốc độ đích trên bộ = footSpeed × 2 khi giữ (bơi cũng nhân, cho đơn giản); bỏ chế độ `slow`. Hoạt ảnh: Jog_Fwd_Loop phát theo vận tốc (8 / 6,1 ≈ 1,3×, trong `timeScale.max` 1,6), không cần clip mới.
- `vehicle/BikeController.ts` (`stepBike`): `BikeInput.sprint` → trần tốc độ = bikeTopSpeed × 2 (10,4 m/s); độ bám / tốc độ cua / nghiêng vẫn tính theo tốc độ thật so với top thường, cua gắt mất cùng tỉ lệ (≈ 87 % top), đá lát giữ `paveGrip`, ngã xe giữ ngưỡng `crashImpact` (va chạm nhanh gấp đôi càng ngã). Thả Shift → vượt trần → chậm lại với `brakeDecel` về top thường.
- Giao thức: `MOVE_MODES` bỏ `'slow'` (client + máy chủ triển khai cùng lúc).
- Máy chủ `RaceRoom.ts`: cờ tốc độ = top của chế độ × `SPRINT_MULTIPLIER` × 1,25 → đi bộ 10 m/s, xe 13 m/s (mặc định footSpeed 4); điểm tin cậy (chống dịch chuyển) đi tối đa 13 m/s. Cờ đỏ / Xóa cờ / Phase 10 giữ nguyên.
- Test cập nhật: CharacterController (sprint ×2 rồi thả về), BikeController (sprint, cua gắt, thả), Animation, config (hằng chung, chỉ Shift), Input, Player, RemotePlayers, các `MoveIntent` giả (`sprint: false`), `RaceRoom.live.test.ts` (xe sprint 11 m/s không bị cờ; tốc độ điểm tin cậy ×2). Đã chạy: 7 file client + codec / speed (shared) xanh, `npm run build` xanh. Theo yêu cầu: KHÔNG chạy ride-check, sim, screenshot, bộ test đầy đủ / harness workerd.
- Tài liệu: RACE_RULES §2 + §3, README (bảng phím, `autoMove=walk|sprint`), CLAUDE.md dòng Input, SPEC §17.29 (append).

## Người dùng nên thử tay
- Đi bộ giữ Shift: nhanh gấp đôi, bước chạy nhanh hơn; thả ra về bình thường. Bơi cũng ×2.
- Xe đạp giữ Shift: HUD "TỐC ĐỘ" ≈ 37 km/h (thường 19); thả Shift xe tự chậm về 19; cua gắt khi sprint vẫn chậm lại; đâm tường khi sprint ngã xe.
- Trang Host trong cuộc đua thật: đội sprint liên tục (bộ 8 m/s, xe 10,4 m/s) KHÔNG bị cờ đỏ.
- `ride-check` chưa chạy lại (kỳ vọng cũ vẫn đúng vì không giữ Shift trong kịch bản).
