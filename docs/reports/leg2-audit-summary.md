# Leg 2 – tổng hợp rà soát đồ hoạ và địa danh (2026-10-10)

Yêu cầu của anh: "rà soát lại đồ hoạ trong game và các đặc điểm trong landmark, tìm lỗi và fix". Làm bằng 5 agent chạy song song
(mỗi agent một worktree / nhánh `audit-aN`, gộp vào `main` bằng commit merge riêng) + vài sửa tay sau khi gộp. Báo cáo chi tiết từng
agent: `leg2-audit-a1.md` … `leg2-audit-a5.md`; công cụ đo hình khối: `npm run landmark-audit` (`leg2-landmark-audit.md`).

| Agent | Phạm vi | Báo cáo |
|---|---|---|
| a1 | Ruínas de São Paulo, Science Center, Macau Tower, Grand Lisboa | `leg2-audit-a1.md` |
| a2 | Sé, São Domingos, São Lourenço, Santo Agostinho, Penha, Leal Senado, Largo do Senado, Santa Casa | `leg2-audit-a2.md` |
| a3 | Casa do Mandarim, Quartel dos Mouros, Teatro D. Pedro V, Monte, Guia + Farol, A-Ma, Kun Iam Tong, Lou Lim Ioc | `leg2-audit-a3.md` |
| a4 | Hotel Lisboa, Wynn, MGM, Sands, Bank of China, Cultural Centre, Kun Iam (tượng), Portas do Cerco, Flor de Lótus, Fisherman's Wharf | `leg2-audit-a4.md` |
| a5 | Đồ hoạ thế giới ngoài địa danh: địa hình, hồ, cầu, đường, đồ phố, NPC, hiệu năng (42 điểm) | `leg2-audit-a5.md` |

## Đã sửa
- **Fisherman's Wharf**: đấu trường La Mã dựng theo đúng đường viền OSM (không còn lẫn vào nhà); chân tường / trụ ốp chạm đất trên dốc;
  hải đăng đứng trên mặt kè (trước chôn 8,7 m).
- **Ruínas de São Paulo**: hai flight bậc bên không còn đâm vào Cinemateca / chắn Calçada de S. Paulo; bảo tàng sau mặt tiền là một tầng
  thấp (trước là khối 30 m); hết hố kín 10 m giữa hai cánh bảo tàng.
- **Macau Tower**: dải LED mép mái trung tâm hội nghị liền nét ở khấc phía nam.
- **Science Center**: dải cửa sổ sáng của bệ dịu lại (trước trắng cháy).
- **Sé Catedral, São Lourenço, Santo Agostinho, Ermida da Penha**: khối nhà thờ nằm trong đường viền (trước đâm vào nhà bên cạnh / tràn ra phố);
  tháp mái bằng có lan can theo ảnh thật; mặt tiền Penha là đầu hồi; 3 nhà thờ m2 được chiếu đèn ban đêm; mái nhiều mặt cắt đúng đa giác lõm
  (`parts.ts`).
- **Hotel Lisboa**: chân trụ casino chạm đất trên dốc.
- **Wynn**: tia nước Performance Lake đứng trên mặt nước (sau khi hạ mặt hồ); thêm test dữ liệu thật.
- **Sands**: hai bản ghi OSM nằm trong casino không còn dựng thành nhà thường (tháp kính vàng, hết cửa sổ rỉ qua tường).
- **Bank of China**: dựng lại theo ảnh Macau (kính xanh + dải granite nâu, trục giữa thu bậc, đỉnh đỏ); hết tháp be 166 m xuyên thân.
- **Cultural Centre**: khối khán phòng cắt theo đường viền (hết mỏm treo trên mặt tiền cong).
- **Kun Iam (tượng), Flor de Lótus**: collider bệ Kun Iam khớp vành nhìn thấy; đĩa lát quanh tượng sen có collider (hết đi xuyên gầm).
- **Lou Lim Ioc**: các nhà trong vườn dựng theo đường viền OSM (trước chìa mái 4,2 m ra phố, phủ hồ, lơ lửng); cổng trăng ở lối vào thật;
  hòn non bộ và đình lục giác dời khỏi tường / cầu.
- **Templo A-Ma** (đá khắc chữ lơ lửng), **Quartel dos Mouros** (z-fighting ở tháp góc), **Casa do Mandarim** (sân đông chôn dưới đất),
  **Kun Iam Tong** (hở chân bệ trên dốc).
- **Thế giới (a5)**: hồ / ao Nam Van, Sai Van, hồ chứa, Lou Lim Ioc, Wynn… mặt nước phẳng đúng mực, hết đồi đất giữa hồ; cầu vượt sát đất
  hết thành tường chắn phố; bỏ cột Morris + lối metro kiểu Paris còn sót.

## Đã kiểm, không có lỗi cần sửa
São Domingos, Leal Senado, Largo do Senado, Santa Casa, Grand Lisboa, MGM, Portas do Cerco, Teatro D. Pedro V, Fortaleza do Monte,
Fortaleza da Guia + Farol da Guia; NPC, nhân vật + ba lô, hòm / thảm Chặng dừng, minimap, console (a5).

## Cần anh quyết
1. Gò DEM ven biển phía nam chân Macau Tower (cao 15–17 m): thêm PAD san phẳng quảng trường chân tháp (`geo/landmarks.ts PADS`)?
2. Đèn pha thân Macau Tower ban đêm (hiện chỉ đài sáng + đèn đỏ đỉnh)?
3. Tường bệ Ruínas trơn cao ≈ 10 m ở hai phố bên (DEM phẳng): giữ, hay làm dốc / bậc dọc phố (việc lớn)?
4. Hồ lớn (Nam Van, Sai Van, hồ chứa): giữ bờ dốc đất răng cưa, hay gắn `river` ở `build-chunks` để có tường kè như biển (việc lớn)?
5. Santo Agostinho: sàn cao hơn Largo ≈ 4,6 m (DEM dốc 4,2 m, mặt tiền 24 bậc); thật gần ngang Largo — hạ sàn?
6. Mái che NE của Hotel Lisboa trên dốc DEM (cách đất 1–6 m, không có đường đi dưới): để nguyên?
7. Bank of China: tỉ lệ các bậc trục giữa (150 / 155 / 159 m), quả cầu đỏ, độ dày dải granite là ước lượng từ ảnh.
8. Lou Lim Ioc: dáng mới chỉ Chun Chou Tong (biệt thự vàng) có ảnh; nhà vệ sinh và Iong Sam Tong là màu / mái ước lượng; các nhà là khối
   trơn chưa có cửa sổ; lối vào là cổng trăng (thật là cổng sắt chữ nhật). Giữ, hay thêm cửa sổ / đổi cổng?
9. Casa do Mandarim: mái nay bậc thang theo dốc (≤ 2 m), G4 đã duyệt hình mái cũ. Giữ?

## Còn mở (ghi trong `TODO.md`)
Cầu vượt thật (nâng sàn + bậc), vệt sáng đèn đường trên phố dốc, phản chiếu giả của nước gần bờ, Hundred Steps của Lou Lim Ioc là khối đặc,
cây OSM nằm trong sảnh đầu của A-Ma, nhà ở giám mục Penha còn tối ban đêm, cột `float` của `landmark-audit` báo giả với tường là tứ giác dài.
