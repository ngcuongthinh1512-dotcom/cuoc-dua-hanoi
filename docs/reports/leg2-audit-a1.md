# Leg 2 – rà soát địa danh a1: Ruínas de São Paulo, Science Center, Macau Tower, Grand Lisboa

Trạng thái: XONG (2026-10-10), agent a1 (Opus), worktree `/tmp/audit/a1`, nhánh `audit-a1` (từ `main` 5d18c66).
Cách làm: `npx tsx scripts/landmark-audit.ts` để khoanh vùng, script tạm (đã xóa) định vị đỉnh lấn / khe / mặt quay ngược, rồi xem
ảnh: ban ngày (`&time=day`) để đọc hình khối, ban đêm (mặc định của cuộc đua) cho đèn. Ảnh `screenshots/a1-*` (không commit; cặp chính
`a1-ruinas-sao-paulo-before/after.png`, `a1-macau-tower-before/after.png`). Ảnh thật: Wikimedia Commons (chỉ xem trong trình duyệt).

| Địa danh | Audit trước (spill · intrude · float) | Sau | Lỗi sửa |
|---|---|---|---|
| Ruínas de São Paulo | 51,5 m (2 008 đỉnh) · **2,0 m (42 đỉnh, nhà h29 @119,−419)** · 10,8 | 51,5 (1 999) · **0** · 10,8 | 3 (A/F, E, F) |
| Science Center | – · – · – | không đổi | 0 |
| Macau Tower | – · – · 232,9 | không đổi | 1 (C) |
| Grand Lisboa | 7,0 m (236) · – · 23,0 | không đổi | 0 |

## 1. Ruínas de São Paulo
Góc đã xem (trước): `top`, `top2` (thẳng đứng 230 / 95 m), `sw`, `se`, `n`, `back`, `high` (nam, trên cao), `largo` (mắt người trên bệ),
`foot` (chân bậc lớn), `wstreet` (Rua da Ressurreição), `estreet`, `calcada` (Calçada de S. Paulo, mắt người), `night`. Sau sửa: cùng các góc
+ `wflight` (+ `-night`), `wtop`, `eflight`, `museum`.

Lỗi và cách sửa:
1. **(A, F) Hai flight bên đâm vào nhà và chắn đường.** Hai flight bên (bản sửa Leg 2 trước, để footway ngang Largo không cụt ở mép bệ cao 9 m)
   chạy VUÔNG GÓC ra ngoài bệ cho tới khi chạm đất, dài 12–19 m. Flight tây băng qua Rua da Ressurreição rồi xuyên qua **Cinemateca Paixão**
   (OSM way/791076490, chính là "nhà h29 @119,−419" của audit): bậc thò ra từ góc nhà (`a1-ruinas-before-wstreet`). Flight đông nằm chắn ngang
   **Calçada de S. Paulo** (way/307331943, đường xe một chiều, x 162,5–174,9): xe NPC chạy xuyên bậc, xe đạp không lên được ramp `stairs`
   nên đường bị chặn (`a1-ruinas-before-calcada`, `-se`, `-top2`).
   Sửa (`mf1.ts platform()`, `landmarks.mf1.ruinas.sideStairs`): flight chạy DỌC tường bệ, nằm trên đúng footway OSM chạy dọc chân bệ: tây
   xuống về phía bắc (way/248826423), đông xuống về phía nam cạnh bậc lớn (way/710516683) (`dir: [-1, 1]`); rộng 3,5 → 1,8 m để flight đông
   nằm trên vỉa hè, không lấn lòng đường. Ảnh sau: `a1-ruinas-after-calcada`, `-eflight`, `-wflight`, `-wflight-night`, `-wstreet`.
   Test mới (`mf1.test.ts`): không đỉnh nào trên mặt đất nằm trong đa giác Cinemateca hay trong 3,5 m quanh tim Calçada; hai ramp bên nằm
   sát tường, chỉ rộng bằng flight. (Kiểm lại: đặt rộng 8 m thì test đỏ.)
2. **(E) Bảo tàng sau mặt tiền là khối chung cư 30 m.** Museu de Arte Sacra e Cripta (OSM way/192573692, h 30,3) chưa thuộc địa danh nên
   BuildingBuilder dựng thành khối 30 m có cửa sổ ngay sau mặt tiền (`a1-ruinas-before-n`, `-back`). Thật: một tầng thấp ở cuối gian giữa
   (Commons "Behind the façade of St. Paul's in Macau.jpg"; Wikipedia: "A museum is located behind it"). f1 đã làm sẵn nhánh
   `classify() → 'museum'` nhưng way chưa được đăng ký (báo cáo f1, mục 2). Sửa: thêm way/192573692 vào registry +
   `npm run build-chunks` (chỉ `chunks/0_-2.json` và `index.json` đổi: `lm.ruinas-sao-paulo` 3 → 4, `buildings.landmark` 71 → 72);
   `museumTop` 11 → 16,5 (mặt đất của bản ghi ≈ 2,2 → mái ≈ 3,9 m trên mặt bệ, đúng một tầng như ảnh). Ảnh sau: `-n`, `-se`, `-back`, `-museum`.
3. **(F) Hố kín sâu 10 m giữa hai cánh bảo tàng.** Phần lõm giữa của bảo tàng (x 145,8–153,9, z −476,9…−487) nằm sau mép bệ (bệ tới
   z −477,65): đi tới "cửa bảo tàng" là rơi xuống hố kín ba mặt tường, không ra được (có từ trước, cả khi bảo tàng còn là khối 30 m).
   Sửa: `terrace.back` 40 → 49,5: bệ phủ tới mặt lõm của bảo tàng, thành sân trước cửa (`a1-ruinas-after-museum`).

Không sửa (thiết kế / ngoài phạm vi):
- spill 51,5 m = bậc lớn 68 bậc dọc đúng way steps OSM (way/670357826); OSM không có đường viền cho bậc nên "ngoài đường viền" là đúng.
- float 10,8 = góc đường viền gian giữa nằm trên mặt bệ; khối bệ rộng hơn và xuống tới 1 m dưới đất thấp nhất, không có khe (artefact đo).
- Tường bệ trơn cao ≈ 10 m nhìn từ Rua da Ressurreição / Calçada de S. Paulo: thật là phố dốc lên ngang Largo, DEM bị làm phẳng (đã ghi ở
  báo cáo f1); cần địa hình thật.
- Ô phù điêu bằng đồng ở tầng 3–4 trông như cửa sổ đen từ xa: thuộc gu, chưa đủ chắc so với ảnh, không đổi.
- Mặt / pháp tuyến: không thấy mặt quay ngược hay lỗ; đèn pha nướng vào mặt tiền ban đêm đọc rõ (`a1-ruinas-after-night`).

## 2. Science Center
Góc: `top`, `n`, `e`, `s`, `w` (150 m), `street1` (tây bắc, mắt người), `street2` (đông bắc), `night`, `hall` / `hallclose` / `hallnight`
(khối hội trường), `joint` (chân nón trên bệ). Audit sạch.
Không có lỗi A–F cần sửa: tường bệ (cả sân trong) quay đúng ra ngoài (dò ±0,4 m theo pháp tuyến: 374/374), nón xiên + khe xoắn sáng, bán cầu
nhà chiếu hình ngồi đúng trên bệ, ban đêm đọc tốt.
Ghi nhận nhỏ, không sửa: khối hội trường dựng từ 4 góc lat/lon trong config lệch ≤ 0,5 m so với tường bệ OSM nên có một gờ nhỏ ở mép dưới
(`a1-science-before-hallclose`), không nhấp nháy. Ban ngày nón trắng chói là do `nightCladBoost` (đua cố định ban đêm, ponytail có sẵn).

## 3. Macau Tower
Góc: `base-sw`, `base-ne`, `base-n`, `pod` (ngang đài quan sát), `top`, `foot1` / `foot2` / `foot3` (mắt người, `foot3` ban đêm), `night`
(420 m), `nightbase`, `ledn` / `leds` / `notch` (LED mái trung tâm hội nghị, đêm). float 232,9 = đài quan sát nằm trên đường viền vòng đài
(đúng như dự kiến).
Lỗi và cách sửa:
1. **(C) Dải LED mép mái trung tâm hội nghị bị đứt ở khấc phía nam.** `loft` định hướng mỗi mặt theo tâm vòng; trên cạnh lõm của khấc
   (−183,5; 1 537,5 → −180,7; 1 523,4) mặt quay VÀO trong nên bị cull: đêm thấy một đoạn tối (`a1-tower-before-notch`; f2 đã ghi "còn mở").
   Sửa (`mf2.ts conventionCentre()`): mỗi cạnh một quad hướng ra ngoài theo chiều quay của vòng (`ringArea`). Sau: dải liền
   (`a1-tower-after-notch`, `-ledn`, `-leds`). Test mới (`mf2.test.ts`): với đường viền thật (cả hai chiều quay), mọi tam giác LED quay ra
   ngoài; với code cũ test đỏ đúng ở khấc này.

Không sửa:
- Gò đất cao tới 15–17 m ngay phía nam chân tháp (DEM ven biển, z ≈ 1 550–1 565, x −330…−210) làm chân tháp như bị lấp một phía
  (`a1-tower-before-base-sw`, `-nightbase`): là địa hình (DEM / bờ biển), không phải hình địa danh.
- Thân tháp không có đèn pha ban đêm (chỉ đài sáng + đèn đỏ đỉnh, `a1-tower-before-night`): thiết kế f2, vẫn đọc được nhờ đài.

## 4. Grand Lisboa
Góc: `s`, `e`, `w`, `n` (160–170 m), `crown` (ngang vương miện), `top`, `door` (cửa chính, mắt người), `avenida` (Av. de Lisboa, mắt người),
`night` (320 m), `nightpodium`.
Không có lỗi. spill 7,0 m = mái lều + lá vàng lối vào phía nam chìa ra đường xe vào (thiết kế, không collider, đi xuyên được) và hai tháp bậc
thang Đ / T đặt tâm trên đường viền (thò 4,5 m, không chạm đường hay nhà: paths.test xanh, intrude 0). float 23,0 = vòm cầu dẹt có chân ở 0,82
bán kính, bụng phình tới 0,98 (vòm treo trên các góc đường viền, thiết kế v2 theo ảnh anh). Vương miện loe (anh yêu cầu) nằm trong đường viền
bục nhìn từ trên nên không tính spill; giữ nguyên. Ban đêm vòm tối, đọc nhờ gân sáng + kim cương xanh / đỏ (đã duyệt ở v2).

## Kiểm tra
- `npx tsc --noEmit -p client`: sạch.
- `npx vitest run --dir client/src/world`: 24 file, 207 test xanh (mf1 +1, mf2 +1; `paths.test.ts` xanh, `ALLOWED` không đổi).
- `npx tsx scripts/landmark-audit.ts`: Ruínas intrude 2,0 → 0; các dòng khác của 4 địa danh không đổi.

## Cần anh quyết
- Gò DEM ven biển phía nam chân Macau Tower: thêm một PAD san phẳng quảng trường chân tháp (`geo/landmarks.ts PADS`) không?
- Có muốn đèn pha thân Macau Tower ban đêm (như thật) không? Hiện chỉ đài sáng.
- Tường bệ Ruínas trơn cao 10 m ở hai phố bên (do DEM phẳng): giữ, hay làm dốc / bậc dọc phố (việc lớn hơn)?
