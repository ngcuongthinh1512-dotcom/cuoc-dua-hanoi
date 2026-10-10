# Leg 2 – Rà soát địa danh a4: casino, cao ốc, Fisherman's Wharf (2026-10-10)

Trạng thái: XONG, agent a4 (Opus), nhánh `audit-a4`. Phạm vi: hotel-lisboa, wynn-macau, mgm-macau, sands-macau,
bank-of-china, cultural-centre, kun-iam-statue, portas-do-cerco, praca-flor-de-lotus, fisherman-wharf (vòm đấu trường đã
sửa ở 2973206; rà lại phần còn lại của Wharf). Không đụng hình Hotel Lisboa / MGM đã dựng lại theo ảnh (G1–G3).

Cách làm: `npx tsx scripts/landmark-audit.ts` để biết chỗ nghi; một script tạm (đã xóa) tách số liệu theo từng bản ghi /
từng loại vật liệu, đo mặt đất dưới chân tường, đo nhà thường nằm lọt trong đường viền địa danh; ảnh bằng một trình chụp
tạm (một Vite + một Chrome, cổng 5304, `?cam=…&npc=0&time=day|night`, đã xóa). Mỗi địa danh: vòng 4 hướng ở 120–300 m,
1 ảnh thẳng từ trên, 2–3 ảnh ngang mắt 1,7 m, 1 ảnh đêm, thêm ảnh cận chỗ nghi. Ảnh tham khảo: Wikimedia Commons (chỉ xem).
Ảnh nằm trong `screenshots/` (không commit); cặp trước / sau cùng góc máy tên `a4-<địa danh>-before*.png` / `-after*.png`.

## Số liệu audit (spill max / số đỉnh / số > 3 m · float)

| Bản ghi | Trước | Sau | Kết luận |
|---|---|---|---|
| wynn-macau podium | spill 30,1 / 828 / 828 | như cũ | 31 cột nước của Performance Lake nằm TRONG hồ OSM (đúng) |
| mgm-macau podium | spill 13,4 / 2 542 / 2 542 | như cũ | sư tử vàng trên điểm artwork OSM, trên quảng trường lát đá trước podium (đúng) |
| mgm-macau tháp | float 54,2 | như cũ | các tầng so le (xanh chìa ra trên tầng đồng ở đầu tây), dựng theo ảnh G2, có mặt dưới |
| cultural-centre | spill 14,6 / 60 / 54 | 14,6 / 48 / 48 | phần còn lại là mái "cánh buồm" vươn ra (thiết kế, G4 giữ) |
| sands-macau trụ | spill 1,7 / 56 / 0 | như cũ | vành "mũ" chìa ra ngoài trụ (ảnh thật) |
| hotel-lisboa podium | float 15,5 + 1,7–2,8 ở thùy nam | chỉ còn 15,5 | 15,5 = góc OSM chỉ có gờ vàng trong 2,5 m (trụ casino cách 3 m), không phải hở |
| hotel-lisboa 4 mái `roof` | float 4,5–6,0 | như cũ | mái che (building=roof) kiểu chung của game, xem phần Lisboa |
| fisherman-wharf đấu trường | float 2,7 | 2,7 | tường nay chạm đất; 2,7 = mép dưới các vòm tầng trệt cách đất thấp ở góc ĐN (dốc DEM, tường làm bệ) |
| bank-of-china (bản ghi tháp mới) | – | float 120,7 | bản ghi phần tháp bắt đầu ĐÚNG trên mái khối chính (thiết kế) |

## hotel-lisboa
- Ảnh: `a4-lisboa-n/e/s/w`, `-top`, `-night-se`, `-street-e/-e2/-ne/-w`, `-canopy-e/-n/-air`, `a4-t-casino-s/-sw/-top`.
- **B (sửa):** chân trụ Casino Lisboa đặt ở mặt đất tại TÂM trụ (1,8 m) trong khi đất dưới mép trụ đổ xuống −1,2 m ở phía
  tây nam: đáy tường nâu lơ lửng ~2,5 m trên vỉa hè, nhìn xuyên thấy tường podium phía sau. Sửa `lisboaCasino`: chân tường
  (và collider) xuống tới đất thấp nhất trên vành trụ − `landmarks.sink`. Ảnh `a4-hotel-lisboa-before.png` / `-after.png`.
- Không sửa: mái che NE (OSM building=roof, 24 × 24 m) nằm trên dốc DEM 5 m: tấm mái cách đất 1 m ở phía cao, 6 m ở phía
  thấp. Không có đường OSM nào đi dưới nó; đây là cách dựng mái che chung (BuildingBuilder cũng vậy) cộng dốc DEM. 3 mái
  che còn lại (lối xe) cao 2,7–4,9 m trên đường: ổn.
- Ban đêm: lưới cửa sổ cam + vương miện vàng, chữ LISBOA đọc đúng, khối 1991 có dải sáng: ổn.

## wynn-macau
- Ảnh: `a4-wynn-sw/nw/ne/se`, `-top`, `-street-s/-e/-n`, `-tower-low`, `-encore-low`, `-lake-street/-low/-night`, `-night`.
- Không thấy lỗi hình trong m3. Chữ WYNN đọc đúng (thấy trong `a4-lisboa-n`), viền / gân sáng podium ổn.
- **Không sửa (ngoài phạm vi, cần anh quyết):** hồ Performance Lake là đa giác nước OSM vẽ phẳng ở *cao độ trung bình
  của các đỉnh viền + 0,1 m* (`Water.ts`, không đào); đất bên trong hồ cao hơn mặt nước ở ~39 % diện tích nên nửa hồ là
  nền khô và một nửa số cột nước đứng trên nền (`a4-wynn-lake-low`). Lỗi chung: 23 hồ trên bản đồ khô > 20 %. Cách sửa
  đúng là san phẳng / đào đất dưới hồ (kiểu `PADS` / `carveRiver`) — việc của Terrain / Water, không phải m3.

## mgm-macau
- Ảnh: `a4-mgm-s/w/n/e`, `-top`, `-lion`, `-lion-top`, `-westend`, `-night`.
- Spill 13,4 m = sư tử + bệ (artwork OSM way/823036882) ở góc quảng trường lát đá, không lấn lòng đường: đúng.
  Float 54 m = tầng xanh chìa ra trên tầng đồng ở đầu tây (thiết kế G2 theo ảnh), mặt dưới kín. Vòm kính Grande Praça
  cắm 9 % chân vào tháp (giáp tường tháp, phần thừa khuất): chấp nhận. Đêm: vạch sàn theo sóng + chữ MGM GRAND đọc đúng.

## sands-macau
- Ảnh: `a4-sands-s/e/n/w`, `-drum-street`, `-drum-crown`, `-street-s`, `-night`; tham khảo Commons
  `Sands Macao 004.jpg` (trước khi có tháp, còn cần cẩu) và `Macau Fisherman's Wharf and Sands Macau 13-06-2025(1).jpg`.
- **A/C/E (sửa):** hai bản ghi OSM thường nằm trọn trong đường viền casino:
  - way/1201888817 (h 116,7, không tên) = tháp khách sạn: dựng kiểu nhà thường màu be, cửa sổ đục lỗ; một cạnh của nó nằm
    ĐÚNG trên tường casino nên cửa sổ be "rỉ" qua tường kính tối (z-fighting). Ảnh thật 2025: tháp kính VÀNG như trụ.
  - way/667429625 "Sands Macao Hotel" (không chiều cao → khối 20 m mặc định): 12/14 đỉnh nằm trên đường viền casino, khối
    này khuất dưới mái cánh 39,7 m nhưng tường trùng mặt tường casino → mảng cửa sổ nhấp nháy trên tường tối ở tầng trệt.
  - Sửa: đăng ký cả hai vào `sands-macau` (registry + `npm run build-chunks`: chỉ `6_1.json` + `index.json` đổi, chỉ thêm
    `landmark` cho đúng 2 bản ghi); `sands()` trong m3: bản ghi > `sands.tower.above` (80 m) = tháp kính vàng `litSlab`
    (dải sáng mỗi tầng, viền LED), lùi `tower.inset` 0,3 m khỏi đường viền (hết trùng mặt, phần dưới mái cánh khuất);
    bản ghi không chiều cao = không dựng gì (cánh casino đã che).
  - Ảnh `a4-sands-macau-before.png` / `-after.png` (từ nam), `-before-close` / `-after-close` (tường tối sạch),
    `-before-night` / `-after-night`, thêm `-after-sea`.

## bank-of-china
- Ảnh: `a4-boc-s/e/n/w`, `-crown`, `-street`, `-street2`, `-night`; tham khảo Commons `Bank of China Building, Macau.jpg`,
  `Bank of China Tower in Macau 04-02-2023.jpg`, `BOC Macau Building.jpg`, `Lakeview Tower and Bank of China as seen from
  Praca Ferreira Amaral.jpg`, `MC Macau 澳門 Bank of China Building facade night March 2019 IX2.jpg`.
- **A/B (sửa):** OSM có bản ghi thứ hai way/356056416 (h 166, 38 tầng) nằm trọn trong đường viền BOC (100 % diện tích của
  nó): dựng kiểu nhà thường thành một tháp be cửa sổ đục lỗ cao 166 m mọc xuyên qua thân kính và nuốt nửa vương miện bậc
  thang (`a4-bank-of-china-before.png`). Audit không bắt được (đỉnh của BOC không nằm trong khối kia).
- **E (sửa, theo ảnh):** lưới kim cương chéo là đặc trưng của BOC Hồng Kông, không phải Macau. Macau: kính xanh với dải
  đá granite nâu ngang mỗi tầng, hai cánh dừng ở ~116 m, trục giữa lên tiếp, thu hẹp 2 bậc, đỉnh có vật trang trí đỏ; đêm
  có đường sáng trắng chạy dọc mọi góc và viền mỗi bậc.
- Sửa: đăng ký way/356056416 vào `bank-of-china` (registry + `build-chunks`: chỉ `1_1.json` + `index.json`); `bankOfChina`
  (m4) dựng khối chính tới 116,3 m (bản ghi chính) và trục giữa từ mái đó lên (bản ghi tháp: 150 / 155 / 159 m + quả cầu
  đỏ tới 163 m); cả hai bản ghi tính chiều cao từ cùng một mặt đất `boc.at` nên trục giữa đứng đúng trên mái (không hở,
  không trùng mặt). Bỏ lưới chéo, kim tự tháp + cột ăng-ten. Ảnh `a4-bank-of-china-before*.png` / `-after*.png`
  (`-after-front`, `-after-street`, `-before-night` / `-after-night`).

## cultural-centre
- Ảnh: `a4-cc-s/e/n/w`, `-top`, `-street-s/-e`, `-night`, `-notch`, `-notch-up`, `-roundend`; Commons `Macao Cultural
  Center 2011.JPG`.
- **B (sửa):** khối khán phòng là hộp chữ nhật đặt theo khung đường viền: 2 góc chìa ra 4,6 m ngoài đầu tròn (một mỏm hộp
  treo trên mặt tiền cong ở 15–25 m) và 1,6 m vào hốc phía nam (`a4-cultural-centre-before.png`). Sửa: chân khối = đường
  viền cắt theo hộp đó (`clipRing` ×4 trong hệ khung), tường và mái nghiêng dựng trên đa giác đã cắt, collider cùng chân.
  Mái "cánh buồm" vươn ra giữ nguyên (thiết kế). Ảnh `-after.png`, `-after2.png`, `-after3.png`.

## kun-iam-statue
- Ảnh: `a4-kuniam-nw/e/s`, `-top`, `-street`, `-night`. Hình ổn (tượng đồng, vòm sen trắng sáng ban đêm). Đảo cao 7 m
  trên mặt biển là bờ kè chung của cả bản đồ (`quayHeight`), không phải tượng.
- **F (sửa):** collider của bệ có bán kính R trong khi vành bệ nhìn thấy là R + 0,6 m (cao 0,8 m > bước chân 0,4 m): người
  chơi lún 0,6 m vào vành bệ. Collider nay R + 0,6. Chỉ collider, hình không đổi (không có ảnh trước / sau).

## portas-do-cerco
- Ảnh: `a4-portas-s/n`, `-gate`, `-gate-n`, `-top`, `-night`. Cổng 1870 nằm trong hốc trước trạm cửa khẩu, hai cánh vuốt
  thấp dần, trạm kính có cửa sổ sáng ban đêm, cổng được chiếu sáng: không thấy lỗi.

## praca-flor-de-lotus
- Ảnh: `a4-lotus-s/n/e`, `-top`, `-street`, `-night`. Hình ổn (sen vàng, 3 tầng đá đỏ, ban đêm sáng).
- **F (sửa):** đĩa lát đá quanh tượng nằm phẳng ở đất cao nhất, có váy che xuống đất thấp nhất (DEM dốc 4 m qua đĩa) nhưng
  KHÔNG có collider: người chơi đi xuyên váy vào gầm đĩa, đứng dưới bệ đá đỏ. Thêm collider lăng trụ cho đĩa (từ dưới đất
  thấp nhất tới mặt đĩa): phía cao đi lên được, phía thấp là bờ tường. Ảnh `a4-praca-flor-de-lotus-before.png` (camera
  dưới gầm bệ đỏ) / `-after.png` (người chơi dừng ở váy đĩa), chụp bằng `?player=…&autoMove=walk`.

## fisherman-wharf (phần còn lại)
- Ảnh: `a4-t-amphi-se/-c4/-c5/-gap/-gap2`, `a4-wharf-centre-s/-n`, `-top`, `-zig`, `-night`, `a4-wharf-lighthouse*`.
- **B (sửa):** tường vòng đấu trường (sau 2973206) đặt chân ở đất tại TÂM (−14,0) trong khi đất phía đông / đông nam thấp
  hơn tới 2 m: khe hở dưới chân tường ở 29/60 điểm dọc vòng. Sửa `colosseum`: chân tường, lõi đặc và trụ ốp tầng trệt
  xuống `ctx.minGround − sink`. Ảnh `a4-fisherman-wharf-before.png` / `-after.png` (+ `-before2` / `-after2`).
- **B (sửa):** ngọn hải đăng ở mũi đất đặt ở đất tại chân nó = sườn đào của `carveRiver` xuống đáy biển (−22,2) trong khi
  mặt kè là −13,9: chôn 8,7 m, chỉ ló 3/6 băng màu. Sửa: đất = cao nhất trong bán kính `lighthouse.reach` 6 m (mặt kè).
  Ảnh `a4-fisherman-wharf-lighthouse-before.png` / `-after.png`, `-lighthouse-sea-before` / `-after`.
- Trung tâm hội nghị + kim tự tháp "Babylon" + viền LED: nằm trong mái, không lấn; các nhà màu pastel xung quanh là nhà
  thường OSM, không chồng lên vòm / trung tâm (audit 0 intrude): không sửa.

## Kiểm tra
- Test mới / mở rộng (mỗi cái đã thử: hỏng với mã cũ, qua với mã mới): `m3.test.ts` "on a slope the casino drum and the
  Colosseum arcade reach the lowest ground", "the Wharf lighthouse … stands on the quay top", "the Sands hotel tower is a
  gold slab … its low outline draws nothing" (+ ca Sands hotel tower trong bảng); `m4.test.ts` BOC hai bản ghi + "on a
  slope both records share one ground", "cultural-centre: the auditorium block stays on its outline …", collider đĩa sen,
  collider vành bệ Kun Iam.
- `npx tsc --noEmit -p client` sạch; `npx vitest run --dir client/src/world` 24 file / 210 test xanh (cả `paths.test.ts`,
  không đổi danh sách ALLOWED); `npx tsx scripts/landmark-audit.ts` như bảng trên.

## Còn mở / cần anh quyết
- Hồ nước OSM (kể cả Performance Lake của Wynn) khô một phần vì mặt nước phẳng ở cao độ trung bình viền: sửa ở
  Terrain / Water (san / đào đất dưới hồ) cho cả bản đồ?
- Mái che NE của Hotel Lisboa trên dốc DEM (thấp 1 m ở phía cao, không có đường đi dưới): để nguyên?
- Tỉ lệ các bậc trục giữa BOC (150 / 155 / 159 m), kích thước quả cầu đỏ, độ dày dải granite: ước lượng từ ảnh.
