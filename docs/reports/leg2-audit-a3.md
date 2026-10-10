# Leg 2 – Rà soát địa danh a3: pháo đài, đền chùa, nhà cổ, vườn

Trạng thái: XONG (2026-10-10), agent a3, nhánh `audit-a3`. Phạm vi: `casa-mandarim`, `quartel-mouros`, `teatro-dom-pedro`
(m1.ts), `fortaleza-monte`, `fortaleza-guia`, `farol-guia`, `templo-ama`, `kun-iam-tong`, `jardim-lou-lim-ioc` (m2.ts); cấu hình
`landmarks.m1.{teatro,quartel,mandarim}`, `landmarks.m2.{monte,guia,ama,kunIam,louLimIoc}`.

Cách làm: số liệu `npx tsx scripts/landmark-audit.ts` (spill / intrude / float / tris) → tách từng đỉnh lạ theo vị trí + màu
(script tạm, đã xóa) → xem ảnh: mỗi địa danh một vòng góc phương vị 60–150 m, ảnh từ trên xuống, ảnh phố tầm mắt 1,7 m, ảnh đêm
(mặc định của cuộc đua) và ảnh ngày (`&time=day`) để đọc hình. Ảnh trong `screenshots/` (không commit), cùng góc máy cho cặp
trước / sau. Ảnh thật tham khảo: Wikimedia Commons (`盧廉若公園春草堂 Lou Lim Loc Garden Chuncao Pavilion - panoramio.jpg`,
`Lou Lim Ioc Gate.jpg`, `Lou Lim Ioc Corridor.jpg`, `Jardim de Lou Lim Ioc, Macau.jpg`). Không làm lại phần G4 đã so ảnh.

Lưu ý về số "float" của công cụ audit: nó lấy đỉnh lưới thấp nhất trong 2,5 m quanh mỗi góc đường viền OSM; tường dài là một tứ
giác chỉ có đỉnh ở hai đầu, nên góc OSM nằm giữa cạnh (hoặc đầu nhọn có chân tường vát xiên) báo "lơ lửng" dù tường chạm đất. Mọi
số float còn lại dưới đây đã kiểm bằng ảnh.

## Tổng hợp

| Địa danh | Audit trước → sau (spill / intrude / float) | Lỗi tìm thấy | Sửa |
|---|---|---|---|
| jardim-lou-lim-ioc | spill 4,2 / 4,1 m, float 5,8–8,2 m → sạch | A, B, E | Có (5 lỗi) |
| templo-ama | spill 6,4 m (16 đỉnh > 3 m) → 1,9 m (0) | B | Có |
| quartel-mouros | sạch, 9 010 tam giác | C (z-fighting) | Có |
| casa-mandarim | intrude 0,9, float 6,2 → 0,9 / 5,9 | B (chôn) | Có |
| kun-iam-tong | float 1,1 → 1,1 (giả) | B (hở chân) | Có |
| teatro-dom-pedro | spill 1,7, intrude 0,8 | không | – |
| fortaleza-monte | spill 2,1, float 5,3 | không | – |
| fortaleza-guia, farol-guia | sạch | không | – |

## Từng địa danh

### jardim-lou-lim-ioc (Vườn Lou Lim Ioc)
- Audit trước: công viên (artwork) spill 4,1 m (12 đỉnh); 5 nhà trong vùng: spill 4,2 m (134 đỉnh), float 5,8 / 6,4 / 6,6 / 8,2 m.
  Sau: tất cả "-", tam giác 2 026 + 56 / 328 / 48 / 64 / 40.
- Góc xem: `a3-lou-top`, `-o1` (225°), `-o2` (45°), `-topN`, `-topS`, `-toil`, `-cem`, `-iong`, `-hall`, `-hall2`, `-rock`, `-rock2`,
  `-st-rock` (phố 1,7 m), `-moon`, `a3-lou-before-moongate` (phố 1,7 m), `-moongate2`, `-hexpav`, `-islandpav`, `-hexpav-n` (đêm).
- Lỗi và sửa:
  1. **A/B – hòn non bộ tràn ra ngoài tường**: tâm (889, −819) chỉ cách tường bắc 1,6 m, đá lấn ra phố tới 4,1 m. → dời về (865, −783)
     bên hồ, phía tây Chun Chou Tong (≥ 9 m cách tường / nhà / mọi lối đi, cầu) – `louLimIoc.rockery`.
  2. **A/B – nhà trong vườn dựng thành "điện Tàu" trên khung chữ nhật bao** (không theo đường viền): nhà vệ sinh (5 điểm) chìa mái +
     đèn lồng 4,2 m ra Estrada de Adolfo Loureiro và chặn đường (paths.test: 2 mẫu "wall"); Chun Chou Tong (15 điểm, chiếm 82 % khung)
     phủ lên hồ và đầu hai cầu (2 mẫu "inside"); Hành lang Trăm bước (có sân trong) bị lấp sân; bệ chỉ sâu 0,8 m dưới sàn đặt ở chỗ
     đất cao nhất → hở chân trên dốc. → các nhà ≥ 60 m² dựng **theo đúng đường viền OSM** bằng bộ dựng chung (`zoneBuilding`), cao
     tính từ chỗ đất cao nhất bên trong (không phần nào dưới đất): Chun Chou Tong = biệt thự vàng mái bằng (theo ảnh Commons:
     vàng, cột trắng, mái bằng có lan can, bên hồ), Hành lang Trăm bước = hành lang trắng 4,2 m quanh sân, nhà vệ sinh + Iong Sam
     Tong = nhà trắng mái ngói xám (ước lượng) – `louLimIoc.villa / corridor / house`.
  3. **E/F – cổng mặt trăng đặt sai chỗ**: chọn theo "cạnh hướng 225°" nên nằm cách tường sau nhà vệ sinh 0,9 m (cổng dẫn vào
     tường), còn lối vào thật (footway OSM duy nhất, Estrada de Adolfo Loureiro – đúng chỗ cổng thật trong ảnh `Lou Lim Ioc Gate.jpg`)
     chỉ là một khe trơn. → cổng mặt trăng đặt tại chỗ footway cắt tường (`louLimIoc.entrance`); bỏ khe trơn và tùy chọn `gates`
     của `ringWall` (không còn ai dùng).
  4. **B – đình lục giác giữa hồ**: bệ (bán kính 3,15 m) đè lên cầu gỗ OSM (tâm cách cầu 3,2 m) và sàn chỉ cao hơn đất 0,45 m, thấp
     hơn mặt hồ (mặt hồ = trung bình bờ + 0,1 m) → sàn ngập. → dời về hồ tròn phía tây (837,5; −759,5), sàn `louLimIoc.floor` 0,8 m.
  5. paths.test `ALLOWED`: Lou Lim Ioc "footway (inside)" 2 → 1 (lối đi sượt góc Hành lang Trăm bước, có ghi chú), bỏ dòng
     "Estrada de Adolfo Loureiro (wall)". `TODO.md` cập nhật theo.
- Trước / sau: `a3-jardim-lou-lim-ioc-before/after-{overview,north,top,toilets,entrance,hexpav,promenade}`, sau thêm `-after-night`.
- Test mới (m2.test, dữ liệu thật + DEM khoét): không đỉnh nào ra ngoài tường công viên (< 1 m: nửa tường + mái tường + cổng nằm trên
  đường viền) hay ngoài đường viền của nhà mình; cổng mặt trăng ở lối vào, không còn ở cạnh nhà vệ sinh; sàn đình trong hồ cao hơn
  mặt hồ; đình + hòn non bộ cách mọi lối đi / bậc / cầu. Cả ba test đều hỏng với code / vị trí cũ (đã thử).

### templo-ama (Chùa A-Ma)
- Audit: spill 6,4 m (29 đỉnh, 16 > 3 m) → 1,9 m (9, 0): phần còn lại là bậc trước xuống quảng trường Barra (đúng thiết kế).
- Góc xem: `a3-ama-top`, `-top2`, `-o1/o2/o3`, vòng `-r0/r45/r90/r135/r180/r270`, `-st1` (quảng trường 1,7 m), `-st2`, `-st1n` (đêm),
  `-r270n` (đêm), `-before-tree/tree2`, `-before-rocks/rocksS`.
- Lỗi: **B – hai tảng đá khắc chữ sau chùa lơ lửng**: đặt ở cao độ tầng thềm trên cùng, 2,5 m trong góc sau của KHUNG; đường viền thật
  bị khuyết ở đó nên đá nằm ngoài thềm, trên sườn đồi thấp hơn → hở 0,3–1,6 m dưới đá. Sửa: đá trong đường viền vẫn ở thềm, ngoài
  đường viền thì cắm vào đồi (đất thấp nhất quanh đá − 0,5 m). Test: đỉnh thấp nhất của cả hai tảng nằm dưới mặt đất.
- Không sửa: một điểm cây OSM (−843,5; 823,4) nằm trong điện thứ nhất (thân khuất trong điện, tán trên mái đọc như cây trong sân –
  chùa thật có cây lớn giữa các điện; Vegetation không biết khối địa danh). Đêm: đèn lồng đọc rõ.
- Trước / sau: `a3-templo-ama-before/after-rocks`, `-before/after-east`, sau thêm `-after-night`.

### quartel-mouros (Quartel dos Mouros)
- Audit sạch; 9 010 tam giác: KHÔNG trùng hình – lỗ châu mai 'near' ≈ 2 830 (238 khối × 12), ≈ 130 cửa vòm nhọn (khung đùn + kính
  ≈ 40 tam giác/cửa), thân, gờ. Trong ngân sách 15k, giữ.
- Góc xem: `a3-quartel-top`, `-o1` (44°), `-o2` (224°), `-w`, `-s`, `-front` (phố 1,7 m), `-front-hi`, `-front-n` (đêm), `-st2`
  (phố phía tây), `-before-joinL/R`.
- Lỗi: **C – z-fighting**: bốn tháp góc nhô đúng 0,3 m khỏi tường = đúng mặt phẳng của gờ tầng (0,3 m) và tấm lan can hiên (0,3 m)
  → sọc kem chập chờn vắt ngang tháp (ảnh trước: dải lan can chạy xuyên tháp phải, vệt nhòe trên tháp trái, cả ban đêm). Sửa:
  `quartel.tower.proud` 0,4 m (> gờ 0,35 m). Không lấy 0,5 m: đường service (−660, 673) sát góc tháp đông bắc, paths.test bắt.
  Test: không có hai mặt khác màu đồng phẳng ở mặt trước.
- Ghi chú: biển neon đứng ≈ 10 m trước mặt tiền ban đêm là biển của nhà 36,9 m bên cạnh (trên tường của nó), không phải lỗi địa danh.
- Trước / sau: `a3-quartel-mouros-before/after-{front,joinL,joinR}`, sau thêm `-after-joinL-top`, `-after-joinR-top`.

### casa-mandarim (Casa do Mandarim)
- Audit: intrude 0,9 m (15 đỉnh) vào nhà 20 m (−515, 543); float 6,2 → 5,9.
- Góc xem: `a3-mand-top`, `-o1` (200°), `-o2` (20°), `-top2`, `-n`, `-s`, `-w`, `-st1` (phố đông 1,7 m), `-st2` (phố tây), `-nn` (đêm),
  `-nbr/nbr2` (góc giáp nhà bên), `-before-eastcourt(2)`, `-eastcourt3/4`.
- Lỗi: **B – sân phía đông bị đất lấp**: cả nhà dùng một cao độ sàn (`ctx.ground` 5,6) trong khi đường viền leo dốc 2,0 → 8,6 m: lát
  đá sân đông nằm dưới mặt đất 1–3 m, cửa gỗ + cửa sổ của điện quay ra sân bị cụt chân. Sửa: mỗi điện / sân đứng trên chỗ đất cao
  nhất bên dưới nó (`maxInside`, lưới 2 m); cửa, cửa sổ, đèn lồng trên đường cắt đặt trên sàn cao hơn trong hai sàn hai bên. Mái nay
  bậc thang theo dốc (chênh ≤ ~2 m). Test (m1.test): trên dốc không đỉnh lát sân nào dưới mặt đất (hỏng với code cũ).
- Không phải lỗi: intrude 0,9 m = mái hắt 0,8 m + gờ của điện vượt qua cạnh OSM chung, nằm trong nhà bên 20 m cao hơn → không nhìn
  thấy (`a3-mand-nbr`). Float 5,9 = giả (xem lưu ý trên; tường xuống tới chân).
- Trước / sau: `a3-casa-mandarim-before/after-{eastcourt,north,south,top,street}`, sau thêm `-after-night`.

### kun-iam-tong (Kun Iam Tong)
- Audit: float 1,1 m (điện chính) – giữ nguyên số sau sửa vì là giả (bệ là hộp, chỉ có đỉnh ở bốn góc).
- Góc xem: `a3-kit-top`, `-o1` (212°), `-o2` (32°), `-top2`, `-sw`, `-nw`, `-se`, `-st` (phố 1,7 m), `-st-n` (đêm), `a3-kun-iam-tong-night`.
- Lỗi: **B – hở chân bệ**: sàn = đất cao nhất + 0,2, bệ chỉ sâu 0,8 m dưới sàn → trên nền dốc 0,9 m của điện chính bệ hở khỏi đất ở góc
  thấp. Sửa: tùy chọn `foot` của `cnHall` – bệ (và collider) xuống tới đất thấp nhất − 0,5 m. Test: điện trên dốc 2,25 m có bệ chạm
  đất thấp nhất (hỏng với code cũ). Ba điện, đèn lồng, tượng sứ trên nóc: ổn ngày / đêm.
- Trước / sau: `a3-kun-iam-tong-before.png` / `-after.png` (góc sau-trái), `-before2`.

### teatro-dom-pedro (Nhà hát Dom Pedro V)
- Audit: spill 1,7 m (172 đỉnh) = cổng cột (cột 1 m, mũ cột 1,6 m, sàn 2,2 m ra trước mặt tiền, như thật, trên Largo de Santo
  Agostinho); intrude 0,8 m = mái / gờ trong nhà bên 20 m dính cạnh (−119, 210), không thấy. Không lỗi.
- Góc xem: `a3-teatro-top`, `-o1` (33°), `-o2` (213°), `-se`, `-ne`, `-sw`, `-st1`, `-front` (phố 1,7 m), `-front-hi`, `-front-n` (đêm),
  `-portico`, `-portico-l`, `-portico-n` (đêm), `-secorner`, `-secorner2`, `-ne-n` (đêm).

### fortaleza-monte (Pháo đài Monte)
- Audit: spill 2,1 m (6 đỉnh) = bậc cổng xuống dốc đông bắc (đúng); float 5,3 m ở mũi nhọn đông bắc = giả (chân tường vát mitre
  ≈ 3 m ra ngoài ở góc 56°, ảnh `a3-monte-tip*`: tường chạm đất). Không lỗi.
- Góc xem: `a3-monte-top`, `-o1` (60°), `-o2` (240°), `-o3` (150°), `-gate`, `-gate2`, `-gate3`, `-gate-st` (phố 1,7 m), `-sw`, `-n`, `-s`,
  `-terr` (trên sân 1,7 m), `-tip/tip2/tip3`, `-gate-n` (đêm), `a3-fortaleza-monte-night`, `-night2`.

### fortaleza-guia + farol-guia (Pháo đài + Hải đăng Guia)
- Audit sạch (6 + 1 bản ghi). Tường theo đỉnh đồi, nhà trong vùng thấp mái ngói, hải đăng 15 m; đêm: đèn hải đăng, dải sáng đỉnh
  tường. Không lỗi.
- Góc xem: `a3-guia-top`, `-o1` (170°), `-o2` (350°), `-w`, `-s`, `-e`, `-farol`, `-st` (phố 1,7 m), `-farol-n` (đêm), `-n-night` (đêm).

## Kiểm tra
- `npx tsc --noEmit -p client`: sạch. `npx vitest run --dir client/src/world`: 24 tệp, 212 test xanh (m1 +2, m2 +5 test mới; paths.test
  xanh với `ALLOWED` mới). `npx tsx scripts/landmark-audit.ts`: số sau sửa như bảng trên.

## Cần anh quyết / còn mở
- Lou Lim Ioc: Chun Chou Tong nay là biệt thự vàng mái bằng theo ảnh thật (trước: điện Tàu mái cong); nhà vệ sinh và Iong Sam Tong
  là nhà trắng mái ngói xám (ước lượng). Cổng thật ở Estrada de Adolfo Loureiro là cổng chữ nhật cửa sắt; cổng mặt trăng ở đó là
  cách điệu giữ từ thiết kế cũ.
- Casa do Mandarim: mái nay bậc thang theo dốc (G4 đã duyệt hình khối cũ), anh xem lại `a3-casa-mandarim-after-*` nếu muốn.
- Không sửa (ngoài phạm vi builder địa danh): cây OSM trong điện A-Ma; Hành lang Trăm bước là khối đặc (1 mẫu lối đi sượt góc).
