# Leg 2 – nhân vật người chơi Rocketbox nam + nữ có ba lô

Trạng thái: XONG (2026-10-06), nhánh `leg2-player-avatars`. Nghiên cứu và kế hoạch: `docs/plans/leg2-characters.md` mục (b).

## Kết quả
- Hai nhân vật, người chơi tự chọn trong Esc → Cài đặt → **"Nhân vật: Nam / Nữ"** (mặc định Nam, lưu localStorage, áp dụng sau khi
  tải lại trang):
  - Nam: `Sports_Male_04`, áo ba lỗ (tô màu đội), quần short trắng, giày chạy. Cao 1,80 m.
  - Nữ: `Sports_Female_02`, áo ba lỗ (tô màu đội), quần túi hộp đen, giày thể thao. Cao 1,74 m.
  - Giữ chiều cao gốc (không scale về 1,75 m, lệch ≤ 3 %).
- Cả hai đeo ba lô dựng bằng code, 28 × 40 × 16 cm:
  - thân + nắp màu đội tối, túi trước và viền sáng, hai quai đen;
  - 408 tam giác, nằm chung lưới với thân (không thêm draw call);
  - mỗi đỉnh lấy trọng số skin của đỉnh lưng / ngực gần nhất (chỉ xương spine / neck / clavicle), nên ba lô bám theo lưng khi cúi.
- Người đi đường NPC giữ nguyên: `npc-peds.glb` build lại sau khi tách code vẫn **giống từng byte**.

## Số liệu
| | Nam | Nữ |
|---|---|---|
| Tam giác (thân + ba lô) | 7 928 | 8 988 |
| Draw call | 1 (+ 1 bóng) | 1 (+ 1 bóng) |
| Atlas WebP 2048² | 0,18 MB | 0,47 MB (có alpha tóc) |
| Chiều cao / khớp hông | 1,804 / 0,895 m | 1,737 / 0,923 m |

- `player.glb` 0,84 MB (cũ 0,42 MB), `player-anims.glb` 0,74 MB (30 clip, cũ 0,41 MB). Giới hạn kiểm trong script: 6 MB.
- Build tất định: chạy lại cho ra cùng md5.

## Cách làm
- **`scripts/process-assets.ts`**
  - Code đọc Rocketbox của `npcPeds()` được tách thành các hàm dùng chung: `readRbAvatars`, `rbTiles`, `rbAtlas`, `rbSkinned`.
  - Target `player`: hai node `player_m` / `player_f` (extras `avatar`, `gender`, `height`, `stride`).
  - Xương thân Bip01 đổi sang tên UE theo bảng `BONES` (`scripts/assets/rig.ts`): `Bip01_Spine2` → `spine_03`, `Bip01_L_Toe0` → `ball_l`, `Bip01_R_Finger2` → `middle_01_r`…
  - Nhờ vậy tay vẫy, IK xe đạp và `trunk` trong `Animation.ts` giữ nguyên.
  - Thân UBC + tóc bỏ khỏi người chơi. UBC chỉ còn dùng cho người lái xe máy NPC; dòng ghi nguồn đổi nhãn tương ứng.
- **Retarget** (`rig.ts` `retargeter`, không gian thế giới):
  - Với mỗi xương có trong bảng: hướng thế giới của xương đích = hướng thế giới của xương nguồn · Q, với Q = (tư thế nghỉ nguồn)⁻¹ · A · (tư thế nghỉ đích).
  - A = phép quay ngắn nhất đưa hướng xương đích về hướng xương nguồn (theo xương con), nên tư thế chữ A của Rocketbox theo được tư thế chữ T của UAL.
  - Hông: độ dời so với tư thế nghỉ × tỉ lệ chiều cao khớp hông (nam 0,960, nữ 0,991).
  - Không có root motion; xương mặt không có track.
  - Lấy mẫu tại các mốc thời gian gốc của UAL, giữ quaternion cùng bán cầu, sau đó `resample` + `dedup`.
- **Kiểm tra tự động khi build:**
  - mũi chân ở `Idle_Loop` cách đất 0,008 / 0,007 m (lỗi nếu quá 6 cm);
  - tốc độ chân trụ đo trên clip: nam Walk 0,94 / Jog 5,68 m/s, nữ 0,98 / 6,01 m/s → `character.clipSpeed` = số của nam.
  - Nữ: × `stride` 1,031 (tỉ lệ hông). Số đo cho thấy nên là 1,058, nên chân nữ vẫn trượt khoảng 2,5 % khi chạy.
- **Màu đội** (`CharacterModel`, một shader dùng chung):
  - Atlas 2×2: thân | đầu / opacity | ô màu ba lô.
  - Alpha ngoài ô opacity là mặt nạ tô màu: 255 = giữ nguyên, 153 = nhân màu đội.
  - Các texel áo được đổi sang xám trung tính (độ sáng tuyến tính / trung vị × 0,75) nên giữ được nếp vải và hai tông của áo nam.
  - Ban đêm phần tô màu phát sáng thêm `character.outfit.nightGlow` 0,35 × `lighting.emissiveScale`, nên màu đội vẫn đọc được dưới trăng.
  - Mặt nạ áo nam: texel xanh dương rõ. Áo nữ: đảo UV cột giữa, ít bão hòa.
- **Giao thức v10:**
  - Client gửi `&avatar=0|1` trong URL WebSocket (`NetClient`), mỗi lần kết nối một lần.
  - DO lưu vào attachment của socket, không ghi SQLite.
  - DO gửi lại `avatar` trong `TeamInfo` (đội online, lấy từ socket mới nhất) và trong `{t:'team', online:true, avatar}`.
  - `RemotePlayers` dựng lại thân khi avatar đổi.
  - Không thêm byte nào mỗi tick. Giá trị không hợp lệ = 0 (`avatarOf`).
  - Host, khán giả, chế độ xem: không đổi; thân người khác hiện đúng avatar.
- **DEV:**
  - `?avatar=0|1` khi offline (bị bỏ qua trong cuộc đua thật);
  - `character.html?avatar=0|1|alt`, `bike.html?…&avatar=0|1|alt`;
  - `?peers=` xen kẽ Nam / Nữ.

## Ảnh (`screenshots/`, SCREENSHOT_PORT 5211, đã xem từng ảnh)
- Ban ngày, trong game:
  - `av-m-front-day` (đứng yên, nhìn trước);
  - `av-m-back-day` (ba lô từ sau);
  - `av-f-jog-day`, `av-m-sprint-day`;
  - `av-f-wave-day` (tay phải giơ);
  - `av-m-crash-day` (nằm);
  - `av-f-swim-day` (bơi ở cảng trong, ba lô trên mặt nước).
- Ban đêm: `av-night-front` (nữ đỏ + peer nam xanh / nữ vàng, áo rõ màu), `av-night-back` (ba lô màu đội).
- Turntable:
  - `av-turn-front`, `av-turn-back`: đỏ / xanh, nam / nữ, đứng yên / chạy / đi;
  - `av-bike-side`: tay trên ghi-đông, chân trên bàn đạp, ba lô bám lưng.
- Không chụp hai ảnh cũ là `av-m-back-day` góc 200° và lần sprint đâm tường: `autoMove` đi theo hướng camera nên phải dùng `orbit=100`.

## Ghi nguồn
- `credits.json`: thêm dòng `Người chơi (nhân vật): "Microsoft Rocketbox Avatar Library" (Sports_Male_04, Sports_Female_02) – © 2020 Microsoft, MIT, qua GitHub (đã chỉnh sửa)`.
- Dòng UBC đổi nhãn thành "Người lái xe máy NPC".
- `LICENSE-rocketbox.md` giữ nguyên; `player()` cũng chép lại file này.
- Bộ sinh credits giữ lại các dòng 8C khi không có `<assets>/8c`.
- Nguồn trong `.cache/assets` (không commit):
  - 7 file đã duyệt;
  - chép từ Paris: `rocketbox/LICENSE.md`, `manifest.json`, `AnimationLibrary_Godot_Standard.glb` (nguồn clip), thư mục UBC `Godot - UE` (chỉ cho người lái NPC).

## Còn tồn / artefact đã biết (cũng ghi trong TODO.md)
- Ba lô là khối cứng:
  - xuyên đất khi nằm ngã;
  - quai hơi xuyên vai khi giơ tay;
  - đuôi tóc nữ chạm mép trên ba lô.
- Tư thế đứng yên của nữ hơi dạng chân (do clip UAL Idle).
- Bảng tên vẫn cố định ở độ cao đầu (như trước).
- Người dẫn Chặng dừng dùng nhân vật nam, áo màu tối.
- Lỗi có sẵn từ trước: atlas `npc-peds.glb` mất alpha (sharp composite 'over' trên nền đen), nên tóc dạng thẻ của NPC vẽ đặc. Cách sửa: `rbAtlas(…, true)` rồi build lại `npc-peds` khi anh cho phép đổi NPC.
- Chưa có LOD xa cho người chơi; KTX2 chưa làm.

## Kiểm tra
- `npx tsc --noEmit -p client` / `scripts`, `npm run build`, `npm test`: qua.
- Test mới / sửa:
  - `scripts/assets/rig.test.ts`: bảng xương với `player.glb` / `player-anims.glb` (mọi track đều trên xương có trong bảng), retarget T → A, cùng xương → giữ nguyên, `sampleTrack`, `maskTop`;
  - `CharacterModel.test.ts`: `avatarClips`, avatar / stride, shader;
  - `settings.test.ts`: avatar + `pickAvatar`;
  - `Player.test.ts`;
  - `codec.test.ts`: v10 + `avatarOf`;
  - `NetClient.test.ts`: URL;
  - `RaceRoom.test.ts`: `avatar` trong welcome / Host / `team` online;
  - `Animation.test.ts`: 15 clip × `m_` / `f_`, IK xe đạp trên rig mới.
