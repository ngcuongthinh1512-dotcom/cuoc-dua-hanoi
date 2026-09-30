# Phase 4B – FIX-F3 (hiển thị người đi đường, tích hợp Npc, controller, script kiểm thử)

Trạng thái: **xong**. Nhánh worktree `agent-a1a48256a535b7a81`, gốc `main @ 04c2050`.

## M4 – màu áo / quần người đi đường (SPEC §17.11)
- Cách làm (`client/src/npc/PedRenderer.ts`): mặt nạ theo trọng số xương như `outfitShader` của người chơi, nhưng cho xương Rocketbox: `pedOutfitMask` → thuộc tính `pedOutfit` (vec2: áo = Spine / Clavicle / UpperArm / Forearm, quần = Pelvis / Thigh / Calf), chỉ trong ô body của atlas (uv ∈ [0, ½)²) → đầu, tóc, mắt (ô khác), bàn tay, giày (xương Hand / Finger / Foot / Toe) = 0. Tính 1 lần cho mỗi geometry mẫu (clone dùng chung).
- Shader `pedShader` (một hàm → một program chung): màu mới = màu bảng × (0,5 + 1,0 · độ sáng texture) → giữ nếp vải; vest đen thành bất kỳ màu nào. Điểm ảnh màu da (r > g > b, g cao hơn b rõ, r ≥ 0,3; áo hồng có g ≈ b nên vẫn được nhuộm) giữ nguyên → không nhuộm da ở cẳng tay xắn áo (Male_Adult_08) / bàn tay.
- Màu theo id, tất định: `pedOutfit(id)` (mulberry32 theo id) chọn 1 / 14 màu áo, 1 / 8 màu quần; 15 % giữ nguyên texture (`npcRender.pedOutfit` trong `config.ts`). Clone lấy lại từ pool được đặt lại màu theo id mới.
- Chi phí: số lệnh vẽ không đổi (mỗi clone vốn là 1 lệnh vẽ / LOD), không thêm program; thêm 1 material clone / clone (`// ponytail:` ghi trần: dùng 1 material + `uniformsNeedUpdate` nếu số material thành vấn đề).
- Test mới (`PedRenderer.test.ts`): tất định, phủ đủ bảng màu, tỉ lệ giữ nguyên ≈ `keep`, 40 id liên tiếp ≥ 20 bộ khác nhau; mặt nạ đúng vùng (thân / chân / tay / đầu / chân giày / ngoài ô body = 0); renderer: mỗi clone uniform riêng, chung `onBeforeCompile`, mẫu giữ material gốc, clone từ pool đổi màu theo id mới.
- Ảnh đã xem: `p4b-dodge` – người gần nhất (Business_Female_01, trước là vest đen) giờ áo vàng mù tạt + quần be; tay, mặt, tóc giữ màu da / tóc đúng. (còn cập nhật)

## m6 – `Npc.setExclusionZones`
- Một `LineBasicMaterial` dùng chung (`ringMaterial`), không tạo mới mỗi lần gọi; geometry cũ vẫn dispose. Test: gọi 2 lần → 2 geometry cũ dispose, mọi vòng cùng 1 material.

## m7 – bị xe đẩy thì đi xuyên xe
- **Lỗi thật, đã tái hiện** bằng Rapier thật (`Npc.test.ts` "walking into a car that is shoving the body"): sedan đè lên thân, đi sang đông 3 s → trước khi sửa thân ra tới x = 1,60 (bên kia xe, xuyên qua); thử bỏ `IGNORE_NPC` thì KCC kẹt trong hộp (thân không ra được, test đẩy cũ hỏng) → giữ `IGNORE_NPC` cho bước bị đẩy.
- Sửa (`CharacterController.ts` `unshoved`): trong bước bị đẩy, phần di chuyển của chính người chơi (đi bộ / xe đạp) bỏ thành phần ngược hướng đẩy (đi vào xe) → chỉ trượt dọc thân xe hoặc đi ra. Camera / `place()` / `surface()` vẫn bỏ qua NPC như cũ. `// ponytail:` ghi trần: xe thứ hai đi vào trong lúc đang bị đẩy vẫn bị bỏ qua trong bước đó.

## R2-m1 – `__READY__` trước khi NPC cập nhật
- `main.ts`: đếm `npcFrames` (số khung đã qua `npcs.update`); READY chỉ bật khi `npcFrames ≥ 2` (hoặc không có NPC). `__STATS__` ghi mỗi khung sau `update` → khung READY có số xe / người thật.
- Số đo sau sửa (khán giả, không `wait`): `p4b-bridge` 24 xe / 12 người, `p4b-red` 49 / 25, `p4b-etoile` 60 / 39 (trước: 0 / 0).

## m5 – moto 2 060 tam giác
- Không đụng GLB. `config.ts` `npcAssets.maxTris.twoWheeler = 2100` (trần riêng cho thân scooter / moto: nguồn moto 2 092 tam giác, meshopt dừng ở 2 060). GLB gộp thân + người lái trong 1 primitive nên test (`NpcAssets.test.ts`) kiểm tổng ≤ `twoWheeler + rider` (3 600; thực tế moto 2 060 + 1 350 = 3 410), lý do ghi ngay trong test. `process-assets` vẫn nhắm `car × 0,85` → output không đổi (tất định).

## m8 – test ghép Traffic + Crowd + Npc, mật độ 1
- `Npc.test.ts` "Npc on roadgraph.json around Concorde, density 1": `roadgraph.json` thật, Rapier thật (mặt phẳng), `CharacterController` ở Rue Royale, `start()` rồi 30 s bước cố định theo đúng thứ tự main.ts. Kiểm: `crowd.lights === traffic.lights`; không NaN ở mọi xe / người mọi bước; số xe và số người luôn > 5; đặt xe đạp tốc độ tối đa sao cho mũi xe trùng một người đang đi (anchor.nose như `Player.npcAnchor`) → người đó bị `stagger`, người chơi ngã (`onDismount(crashed = true)`, `action = 'crash'`) qua đường `knocked` thật của Crowd (không stub).

## m10 – `ride-check` chờ cố định 300 ms
- `press()` giờ chờ theo thời gian mô phỏng: bấm phím rồi đợi `simTime` tăng ≥ `PRESS_SIM` (0,3 s mô phỏng), tối đa 60 s thời gian thật; không còn phụ thuộc tốc độ SwiftShader.
- Lần chạy 1: hỏng vì chính tôi sửa `config.ts` trong lúc chạy → Vite tải lại trang ("Execution context was destroyed") — không phải lỗi của script.
- Lần chạy 2 (đủ 3 phần, máy tải 7–20): phần 1 **qua** (lên xe được: đạp 388 m / tuyến A* 371 m, đi bộ 4,000 m/s, xe 5,200 m/s, tỉ lệ 1,300, nghiêng 15,6°, phanh dừng 1,25 s, heap 129,9 → 139,0 MB, 11 lệnh vẽ); phần 2 **qua** (ngã ở 5,20 m/s, đứng dậy 3,58 s, lên lại / xuống được); phần 3 hỏng ở "vào bậc từ mặt bên" (dừng ở (−330,4, 128,2)) — phần này reviewer 1 đã ghi là lúc qua lúc hỏng từ trước 4B, `npc=0` nên không liên quan sửa của tôi.
- Lần 3 và 4 (`RIDE_ONLY=3`): cả hai **OK** (vào bậc từ mặt bên: có; leo lên y −4,98 / −4,99). Tổng: 4 lần chạy, phần 1–2 qua ở mọi lần đủ điều kiện, phần 3 qua 2/3.
- Đề xuất TODO: "ride-check phần 3 (vào bậc kè từ mặt bên) thỉnh thoảng hỏng khi máy tải nặng — `hold` hướng cố định 8 s mô phỏng; nên lái lại hướng mỗi bước như `walkToBike`".

## R2-M2 / M3, m1 – preset
- `p4b-bridge`: `/?cam=-500,26,215,74,-25` (góc reviewer 2 đã thấy 2 xe + 2 người trên cầu).
- `p4b-red`: tìm bằng mô phỏng (vitest tạm, không commit): chạy đúng `Npc.start()` của game (fill + warm-up 20 s, seed 1, mật độ 1, cao độ đã khoét sông) cho lưới neo 120 m trên cả vùng, lấy các đầu đèn đỏ có ≥ 3 xe đứng yên thẳng hàng phía trước; đặt camera 12 m sau xe cuối, rồi mô phỏng LẠI với neo = camera đó (NPC sinh quanh camera) và chỉ giữ hàng xe vẫn còn. 9 chỗ đạt; chọn nút 103 ≈ (916, −20) (4 xe: hatchback, hatchback, moto, sedan), camera `camAt(924.4, −7.1, 3.5, 22.9, −8)` + `npcDensity=1`. Các chỗ khác (để chọn lại sau khi FIX-F1 merge): nút 16497 cam (967.1, −68.6) yaw 15.7 (4 xe); 5844 cam (967.6, 1124.3) yaw 62.7; 2117 cam (−1864.2, −171.6) yaw 52.4; 1276 cam (324.7, −236.8) yaw −115.9.
- `p4b-etoile`: neo gần tâm vòng: camera 85 m đông-nam tâm (−1916, −922), cao 150 m, chúc −58°, nhìn tây-bắc xuống vòng.
- Ảnh đã xem (trước khi FIX-F1 merge): `p4b-bridge` – 2 xe + 2 người trên mặt cầu, đúng cao độ; `p4b-red` – hàng xe (sedan đỏ, sedan xanh, xe xám, xe máy) đứng trước vạch người đi bộ, nhưng cột đèn không thấy rõ trong khung (lỗi vị trí cột B1 do FIX-F1 sửa); `p4b-etoile` – thấy toàn vòng + Khải Hoàn Môn, chỉ ~2 xe trên vòng (M1 của FIX-F1).
- **Người tích hợp chụp lại sau khi merge FIX-F1**: `p4b-red` (đèn / xe đổi → nếu hết hàng xe, chọn một trong các chỗ dự phòng ở trên, hoặc chạy lại cách tìm: `Npc.start()` với neo = camera, lọc đèn đỏ ≥ 3 xe đứng) và `p4b-etoile`.

## Ảnh M4 (bổ sung)
- `p4b-street`, `p4b-sidewalk`, `p3-street`: người đi đường ở xa (nhỏ), không thấy da / tóc bị nhuộm sai. `p4b-dodge` (gần) như trên: bộ vest đen thành áo vàng + quần be, da tay / mặt / tóc giữ nguyên.
- `p3-street` và `p4b-dodge` quá 30 s chưa READY khi máy tải (FPS 4; m11 của reviewer 1 cũng gặp), ảnh vẫn chụp được và có NPC.

## Tổng kết test
- `npm run build` qua; `npm test` qua (client 44 file / 452 test + các workspace khác).
- Test mới: `PedRenderer.test.ts` (3), `Npc.test.ts` (m6, m7, m8), test m5 nới theo trần thật.
