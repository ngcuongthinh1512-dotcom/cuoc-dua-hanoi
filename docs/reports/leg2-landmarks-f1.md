# Leg 2 – địa danh nhóm mf1 (agent f1, Fable): Ruínas de São Paulo + Macau Science Center

Trạng thái: XONG (2026-10-06). `npx tsc --noEmit -p client` sạch; `npm run test -w client` 790 pass (14 test mới trong
`client/src/world/landmarks/mf1.test.ts`). File: `client/src/world/landmarks/mf1.ts`, khối `landmarks.mf1` trong `client/src/config.ts`.
Ảnh trong `screenshots/` (gitignore): `lm-ruinas-sao-paulo`, `lm-science-center` (preset) + `f1-ruinas-{front,mid,side,back,day}`,
`f1-science-{sea,street,top,day}` (chụp bằng `-- --path "/?cam=…" --name …`, xem mục 3).

## 1. Ruínas de São Paulo (`ruinas-sao-paulo`) – ≈ 4 150 tam giác, 13 collider

Dữ liệu OSM: w/1001795463 (area, h 26,4) = **mặt bằng gian giữa** 20 × 37,5 m, cạnh nam = mặt tiền; w/1001795464 (không h) =
**phế tích Học viện** ở phía đông (175–213, −449…−425), không phải bậc thang như báo cáo nền đoán. Bậc thang lớn là `highway=steps`
(151,−373)→(150,−416), StairBuilder đã dựng sẵn. DEM ở đây bị làm mờ phẳng (chân bậc 5,9 m, chân mặt tiền 4,5–5,5 m) nên đoạn leo 68 bậc
không có trên địa hình → **tự dựng nền đá + bậc thang**.

Đã dựng (khung cục bộ: gốc = giữa cạnh nam của mặt bằng, x đông, z nam):
- Mặt tiền 4 tầng + trán tường: rộng 23,5 m, cao 27 m (**công bố**, Macau Heritage / Wikipedia; OSM 26,4), dày 1,6 m (ước lượng).
  Tỉ lệ tầng 6,6 / 12,2 / 17,6 / 22,2 / 25,5 m, tầng 4 rộng 14 m, trán tường 10 m (ước lượng theo ảnh). Tầng 1: 3 cửa xuyên, tầng 2:
  3 cửa sổ xuyên (thấy trời) + 4 hốc tượng thánh Dòng Tên, tầng 3: hốc Đức Mẹ + 4 tấm phù điêu đồng (tấm + gờ tròn), tầng 4: hốc
  Chúa Hài Đồng + 2 tấm, hai cánh vát, trán tường tam giác + huy chương chim bồ câu + thánh giá. Cột 8 cạnh có đế / đầu cột
  (8 + 8 + 6 + 4), gờ mái giữa các tầng, 3 sườn chống phía sau. Hốc = lớp tường trước có lỗ, lớp sau đặc (sâu 0,9 m).
- Mặt tiền đặt trên **đường mặt tiền của OSM w/192183185** (`front` 5,6 m nam cạnh mặt bằng). Chi tiết (cột, tượng, phù điêu, thánh giá)
  ở bucket `lod: 'near'`.
- Nền đá (hộp 25 × 61,65 m, mặt = chân bậc + `terrace.rise` 9 m, ước lượng: 68 bậc thật) + bậc thang: 4 đợt × 15 bậc (riser 0,15 m,
  tread 0,58 m) + 3 chiếu nghỉ 4 m, rộng 20 m, tường má 0,6 × 0,9 m, lõi đặc dưới bậc. Collider: lăng trụ nền, dốc đi được từng đợt /
  chiếu nghỉ `stairs: true` (7), tường má (2), trụ tầng 1 (4; đi xuyên cửa được, sau lưng hở).
- Tường phế tích thấp 1,1 m có khe hở dọc 3 cạnh gian giữa (trên nền) và quanh mặt bằng Học viện (theo dốc địa hình), mỗi đoạn một collider.
- Đèn chiếu: mặt tiền dùng vật liệu `neon` (không chiếu sáng) với **ánh đèn pha nướng vào màu đỉnh** (đá × (ambient + strength ·
  max(0, n·dir) · (1 − fade·y/H)), dir từ đèn dưới chân chiếu lên, × `lighting.emissiveScale`) + 4 hộp đèn sáng (bloom) trên nền.
  Ban ngày y như vậy (worker không biết giờ); nếu muốn mặt tiền có bóng mặt trời ban ngày cần một vật liệu đá-đêm trong `index.ts`
  (ngoài phạm vi file của f1).

**Việc cần điều phối viên (registry `geo/landmarks.ts` + `npm run build-chunks`):**
1. Thêm `way/192183185` (building=yes, h 26,2, historic=ruins, alt_name 大三巴牌坊 – chính là mặt tiền, tấm 21 × 2 m) vào `osm` của
   `ruinas-sao-paulo`: hiện BuildingBuilder dựng nó thành **tấm kính xanh 26 m** che tầng 1–3 (ảnh `lm-ruinas-sao-paulo` trước khi sửa) và
   còn thấy qua cửa sổ. `mf1.ts` đã sẵn sàng: `classify()` → `'facade'` → không dựng gì.
2. Tuỳ chọn: thêm `way/192573692` (Museu de Arte Sacra e Cripta, OSM h 30,3 – thật ra 1 tầng, hầm mộ dưới gian giữa) → `classify()` →
   `'museum'` → khối phẳng cao `museumTop` 11 m (ngang mặt nền) thay vì khối 30 m sau lưng mặt tiền.
3. Chặng demo L1 nên dời ra sân trước (trên nền, local z ≈ 10–20 m) hoặc chân bậc thang (plan §5.2); điểm cũ nằm trên mặt bằng Học viện.

Còn mở: tường tây của nền cao ≈ 10 m nhìn từ Rua de S. Paulo (thật: tường chắn thấp hơn + miếu Na Tcha); lan can bậc OSM bị chôn trong
lõi bậc (không thấy); cầu thang thép sau mặt tiền không dựng; tượng = hình nón xoay (proxy Paris).

## 2. Macau Science Center (`science-center`) – ≈ 1 460 tam giác, 1 collider

Dữ liệu OSM: r/2590433 (civic, 79 đỉnh + 1 sân trong, không chiều cao). Từ đường viền khớp được: cung tròn lớn r 34,3 m tâm
22,18587 / 113,5566 (**nón**), cung r 15,3 m tâm 22,18623 / 113,55755 (**nhà chiếu hình**), 4 góc khối đông bắc (**hội trường**).

Đã dựng (toạ độ thế giới):
- Bệ (toàn bộ đa giác, có sân trong) cao 10 m (ước lượng), tường 3 dải: đá – **dải cửa sổ sáng** `neon` (y 3,2–4,2 m, màu ấm × 1,2) – đá;
  collider lăng trụ.
- Nón cụt: r đáy 34,3 m (OSM), **cao 58 m (ước lượng theo tỉ lệ ảnh, không có số công bố mà tôi chắc)**, đỉnh r 28 %, mặt cắt xiên 11°
  thấp về phía 150° (ước lượng), vỏ `metal` bạc, collider lăng trụ 24 cạnh; **khe xoắn ốc sáng** `neon` xanh nhạt 2,5 vòng theo
  đường dốc bên trong (nổi 0,3 m, cao 1,4 m, × 1,6 → bloom).
- Nhà chiếu hình: bán cầu r 15,3 m trên bệ; hội trường: hộp 16 m (ước lượng) trên 4 góc OSM.
- Không dựng: quảng trường / mặt nước trước nhà, mái dốc của cánh triển lãm, tháp tròn nhỏ (có sẵn trong đường viền bệ).

## 3. Ảnh (camera `?cam=x,y,z,yawDeg,pitchDeg`)
- `f1-ruinas-front` 150,9,−335,0,6 (chân bậc nhìn lên) · `f1-ruinas-mid` 150,14.5,−398,0,2 (giữa bậc) · `f1-ruinas-side` 185,25,−400,41,−14 ·
  `f1-ruinas-back` 195,45,−490,128,−28 · `f1-ruinas-day` = front `&time=day`.
- `f1-science-sea` 1900,30,870,81,−9 · `f1-science-street` 1745,−6,735,185,−6 · `f1-science-top` 1830,160,800,0,−80 · `f1-science-day`.
