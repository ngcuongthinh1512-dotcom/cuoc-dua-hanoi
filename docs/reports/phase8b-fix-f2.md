# Phase 8B – Nhóm sửa F2 (client + phòng Louvre)

Trạng thái: XONG (2026-10-03). Không commit. Chỉ sửa file client / scripts được giao + 1 câu RACE_RULES.

## Đã sửa
1. **[CHẶN] Hết phạt vẫn không chốt được** – `main.ts roomCard()` giờ đi qua `roomCardOf(card, net.serverNow())` (LouvreRoom.ts) dùng `liveStatus`: cả F ở nút chốt lẫn lời nhắc phòng thấy trạng thái sống. Test: `LouvreRoom.test.ts` "(1) …" (khóa hết hạn, không có tin mới → `active`, prompt "Bấm F để chốt").
2. **Gợi ý 40 / 70 ngoài thẻ đầy đủ** – `format.ts`: `louvreShort` ("Chọn k" / "Chọn k/5" / "Chọn k/5 · Đúng x/5") vào dòng trạng thái thẻ rút gọn (`statusLine`, cả cạnh đếm ngược phạt); `hintNews` → `RaceHud.setView` toast MỘT lần khi `hintCount` / `hintCorrect` đổi null → số trên cùng bước. Test thuần + hud-check (dòng thẻ rút gọn, mất "Phạt" khi hết đếm ngược).
3. **Feed lặp sau welcome** – `Feed.feedEntries(…, replace)`: welcome thay cả danh sách; dòng đã thấy giữ `shownAt` cũ (không hiện lại), chỉ dòng mới thật mới hiện. `RaceClient.welcome` truyền `replace = true`. Test thuần + RaceClient test.
4. **art-02 bóng xám phẳng** – `placeGlb`: bản quét không có map → `MeshMatcapMaterial` (matcap đá cẩm thạch vẽ bằng canvas, màu chuẩn hóa sáng) + normalMap; tính vertex normals khi GLB không có (art-02 không có NORMAL). Ảnh `p8b-real-art-02.png`: nhận ra khối tượng.
5. **Camera trong phòng** – `ThirdPersonCamera.override` (vai + nâng), `louvreRoom.camera { shoulder 0.65, lift 0.35 }`, bật khi `room.active`.
6. **Khung tranh** – khung vàng ôm theo tỉ lệ ảnh (1 InstancedMesh, cập nhật lúc ảnh tải), tranh cao 1,7 m (rộng tối đa 2,3 m), tâm 2,1 m (`paintingSize`, test).
7. Bệ 0,9 m (≥ glbBox, test), nút lùi ra 1,8 m; biển "Lối ra – bấm F" 2,6×0,5 m chữ to hơn; biển treo hai mặt "Chốt đáp án" trên nút chốt; HUD hiện "Phòng Louvre" khi ở trong phòng; tiếng click chỉ khi thẻ mới của máy chủ có picks đổi (`pickChange`, test).
8. Ghi nguồn: bỏ dòng tĩnh "Phòng Louvre" khi đã có mục thật, không lặp giấy phép trùng chữ (`baseLines`, test). RACE_RULES: khung chat "ngay bên phải bản đồ nhỏ".

## Kiểm
- `tsc` client + scripts sạch; vitest `client/src/{race,ui,net,player}` 282 qua; `scripts/hud-check.ts` qua, không lỗi console.
- Ảnh (SCREENSHOT_PORT=5351): toàn bộ `p8b-*` + `p8b-real-{view,view-small,art-02,art-16,art-01,lock}` (preset mới, 23 tệp thật qua `?artGlb=&artPhoto=`), đã xem PNG.

## Chưa làm / ghi chú
- hud-check không phủ trực tiếp nhánh `main.ts` (demo offline có trạng thái tĩnh); phủ bằng test thuần `roomCardOf`.
- Đốm trắng của bản quét art-16 là do chính bản quét (chấp nhận theo review).
- Thẻ demo offline (RaceHud) và phòng demo (main) có số pick khác nhau (3 vs 2) – có từ trước, chỉ ở ảnh.
