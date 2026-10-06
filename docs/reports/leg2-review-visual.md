# Leg 2 – review hình ảnh (BẢN DỞ DANG, Fable; dừng theo yêu cầu điều phối viên, Opus làm tiếp)

Trạng thái: ĐANG DỞ (2026-10-06). HEAD 40db8e2. Đã chụp ≈ 110 ảnh vào `screenshots/rv/` (`lm-*.png` = preset đăng ký, low quality;
`rv-*.png` = góc tự chọn, phần lớn `&quality=high`), nhưng mới XEM được khoảng 60 ảnh. Các ảnh chưa xem vẫn nằm trong `screenshots/rv/`
(`rv-lisboa-foot`, `rv-wynn-street`, `rv-mgm-street`, `rv-sands-street`, `rv-wharf-*`, `rv-boc-street`, `rv-cultural-street`,
`rv-kuniam-street`, `rv-lotus-*`, `rv-cerco-*`, `rv-science-*`, `rv-tower-*`, `rv-loulim-*`, `rv-felicidade2*`, `rv-guia-hill-*`,
`rv-kuniamtong-close`, `rv-harbour-quay`, `rv-bridge-south`, `rv-saivan`, `rv-edge-south`, `rv-*-day`, `rv-box-largo*`, `rv-mat-largo`,
`rv-junction-night`, `rv-avenue-night`, `rv-*-ave`, `rv-float-tri*`, `rv-*-preset2`…) – người review sau xem tiếp, không cần chụp lại.
Không có lỗi console trong bất kỳ lần chụp nào. Không còn tiến trình vite / chrome.

Toạ độ camera của preset `lm-<id>` (để chụp lại với `&quality=high` / `&time=day`): xem `scripts/screenshot.ts`; tôi in ra trong
scratchpad, ví dụ `lm-leal-senado` = `/?cam=94.99,80.29,44.34,80,-38.66`.

## Lỗi dễ thấy nhất (đã xác nhận bằng ảnh, xếp theo mức độ người chơi gặp sớm)

1. **FIX – NPC đi bộ lún trong bậc / nền Ruínas de São Paulo** (`rv-ruinas-steps-player`, `rv-ruinas-front-day`): nền + bậc thang tự dựng cao
   hơn DEM ≈ 9 m, đám đông vẫn đi theo DEM → thấy đầu / nửa người nhô lên khỏi bậc (x≈150, z −370…−416). Gợi ý: `npcZone` loại trừ quanh
   nền (x 150, z −400, r 45) hoặc crowd.ts đọc chiều cao collider của địa danh.
2. **FIX – Hòm / thảm Pit Stop của chặng demo (L6/PS = −10.6, 10.5) nằm trong khối Leal Senado**: `rv-box-night` chỉ thấy prompt "Bấm F", không
   thấy hòm; `rv-mat-night` chỉ thấy cột đỏ, không thấy thảm; đội đứng trên bệ sàn màu be. Kiểm tra lại điểm L6/PS trong `worker/legs/macao-demo.json`
   (dời ra Largo do Senado, vd. 57, −24) và `leg:check` "không nằm trong nhà" với các địa danh có DetailFn (bệ / sân).
3. **MINOR – Đốm phản chiếu trăng trên nước cháy trắng** (`rv-nape-water` góc dưới trái, `rv-edge-east`, `lm-kun-iam-statue` các mảng trắng
   quanh tượng): giảm `lighting.moon.intensity` hoặc tăng roughness nước ban đêm (ghi chú N-B đã nêu).
4. **MINOR – Bờ xa (Vạn Tử / Chu Hải, phía tây) và mép đông bản đồ là tấm phẳng xám sáng** (`rv-harbour-west`, `rv-edge-east`): nhìn như ván
   nổi; cần tối màu địa hình ngoài khung hoặc vài khối nhà thấp.
5. **MINOR – Vật thể vòm màu khaki + tia xanh ở hồ Wynn (x≈600, z≈560)** (`lm-wynn-macau`, `lm-grand-lisboa` góc dưới trái): "Performance Lake"
   trông như đụn cát có mưa xanh. Chưa xem `rv-wynn-lake-close` (đã chụp).
6. **MINOR – Preset camera bị nhà che / nằm trong nhà**: `lm-kun-iam-tong` (nhìn vào tường tenement), `lm-fortaleza-monte` (quá xa, pháo đài bé),
   `lm-portas-do-cerco` (tấm mái xanh nhạt khổng lồ của trạm cửa khẩu che cổng 1870, cổng chỉ là chấm be); góc tự chọn `rv-penha-street`,
   `rv-teatro-street`, `rv-traffic-night`, `rv-box-far` của tôi cũng hỏng (camera trong nhà / dưới đất) – bỏ qua.
7. **MINOR – Quartel dos Mouros: 2 tấm sáng xanh lơ lửng** (`rv-quartel-street`): một tấm trước cây bên trái, một tấm ở chân mặt tiền – ô kính sáng
   đặt sai vị trí (x≈−745…−700, z≈684).
8. **MINOR – Fortaleza do Monte trên sân: khối bảo tàng xám trơn, sân tối, không thấy pháo** (`rv-monte-terrace` tại 310,−387); từ dưới
   (`rv-monte-below`) tường thành đẹp.
9. **MINOR – Vườn Lou Lim Ioc từ trên nhìn như bãi đất xám trống, không cây** (`lm-jardim-lou-lim-ioc`); Chùa A-Ma nhỏ, khuất sau cây và nhà
   (`lm-templo-ama`).
10. **MINOR – Đài phun Largo do Senado là các khối trắng hộp** (`rv-largo-fountain`); calçada ban đêm rất sáng trắng (dễ đọc, hơi giả).
11. **MINOR – Đường viền bbox hiện thành vạch mảnh trên biển** (`lm-macau-tower` bên phải, `lm-science-center`): mép bản đồ thấy từ xa.

## Bảng địa danh (chỉ những mục ĐÃ xem)

| Địa danh | Ảnh | Kết luận | Ghi chú |
|---|---|---|---|
| ruinas-sao-paulo | lm-ruinas-sao-paulo, rv-ruinas-front(-day), rv-ruinas-steps-player | MINOR | Nhận ra được (mặt tiền 4 tầng + bậc), nhưng NPC lún trong bậc (lỗi 1); ban đêm mặt tiền sáng đều, không gradient đèn pha |
| sao-domingos | lm-sao-domingos | OK | Vàng kem, tháp chuông, mái; preset nhìn từ trên là đủ |
| se-catedral | lm-se-catedral | MINOR | 2 tháp + mái; preset hơi khuất, góc phải ảnh có mảng nhà xám trơn lớn |
| sao-lourenco | lm-sao-lourenco | OK | 2 tháp vòm, sân trước, bậc |
| santo-agostinho | lm-santo-agostinho | OK (chưa xem kỹ) | nhìn trên: vàng/trắng, pediment |
| ermida-penha | lm-ermida-penha, rv-penha-far | MINOR | Từ xa (Praia) không thấy nhà nguyện trên đồi; đồi Penha trơ, nhạt |
| leal-senado | lm-leal-senado, rv-senado-street | FIX (lỗi 2) | Mặt tiền trắng 2 tầng đẹp; nhưng điểm PS/L6 demo nằm trong khối |
| largo-senado | lm-largo-senado, rv-senado-north, rv-largo-fountain | MINOR | Calçada sóng đen/trắng rõ; đài phun hộp trắng |
| santa-casa | rv-santa-casa-square (chưa xem), rv-largo-fountain (bên phải) | OK | Tường trắng, cửa vòm |
| casa-mandarim | lm-casa-mandarim, rv-mandarim-street | MINOR | Từ phố chỉ thấy tường kem dài, không cổng |
| quartel-mouros | lm-quartel-mouros, rv-quartel-street | MINOR | Vàng ochre + vòm nhọn + merlon đúng; 2 tấm sáng lơ lửng (lỗi 7) |
| teatro-dom-pedro | lm-teatro-dom-pedro | OK | Xanh nhạt, mái hông, portico |
| fortaleza-monte | lm-fortaleza-monte, rv-monte-terrace, rv-monte-below | MINOR | Lỗi 6 + 8 |
| fortaleza-guia / farol-guia | lm-fortaleza-guia, lm-farol-guia | OK | Tường + nhà mái đỏ + hải đăng trắng; đồi trơ màu nhạt |
| templo-ama | lm-templo-ama | MINOR | Nhỏ, khuất (lỗi 9); điểm xuất phát demo (−869, 784) nằm TRONG đa giác quảng trường A-Ma (kind artwork, chắc không sao) |
| kun-iam-tong | lm-kun-iam-tong | MINOR (preset) | Camera nhìn vào tường tenement |
| jardim-lou-lim-ioc | lm-jardim-lou-lim-ioc | MINOR | Bãi xám trống |
| hotel-lisboa | lm-hotel-lisboa | OK | Lồng chim vàng, biển LISBOA, dải sáng |
| wynn-macau | lm-wynn-macau | MINOR | Tháp vàng + biển WYNN tốt; podium mái xám trơn to; vòm khaki hồ (lỗi 5) |
| mgm-macau | lm-mgm-macau, rv-nape-water/day | OK | 3 sóng vàng/bạc/hồng + biển MGM, nhìn từ nước đẹp |
| sands-macau | lm-sands-macau | OK | Khối vàng, mái cũng vàng |
| bank-of-china | lm-bank-of-china | OK | Đỉnh bậc thang, tháp xanh; một phần bị nhà cao che |
| fisherman-wharf | lm-fisherman-wharf | MINOR | Colosseum + ziggurat + hải đăng nhận ra; nhà OSM xung quanh xám trơn |
| cultural-centre | lm-cultural-centre | OK | Mái cánh buồm |
| kun-iam-statue | lm-kun-iam-statue | OK | Tượng vàng trên vòm sen giữa nước; mảng sáng trắng trên nước (lỗi 3) |
| portas-do-cerco | lm-portas-do-cerco | MINOR | Tấm mái xanh nhạt khổng lồ, cổng bé (lỗi 6) |
| praca-flor-de-lotus | lm-praca-flor-de-lotus | OK | Sen vàng nhỏ giữa sân xanh |
| macau-tower | lm-macau-tower | OK | Tháp + pod sáng, hồ Nam Van; vạch bbox trên biển (lỗi 11) |
| grand-lisboa | lm-grand-lisboa | OK | Tháp vàng vằn + trứng LED nhiều màu, rất nhận ra |
| science-center | lm-science-center | OK | Nón bạc + xoắn xanh |

## Cảnh chung (đã xem)

| Cảnh | Ảnh | Kết luận | Ghi chú |
|---|---|---|---|
| Spawn / Av. Almeida Ribeiro đêm | rv-spawn-player, rv-senado-street, rv-senado-day | OK | Biển hiệu neon, đèn pha xe, HUD tên đường song ngữ rõ; ban ngày không hồi quy |
| Largo do Senado / São Domingos | rv-senado-north, rv-domingos-street | OK | Đèn lồng đỏ, biển LED; không còn dấu vết Paris (không mansard, không cột Morris) |
| Phố cổ từ trên | rv-oldtown-air, rv-oldtown-day | OK | Ban ngày mái ngói đỏ; ban đêm mái xám |
| NAPE từ phía nước | rv-nape-water, rv-nape-day | MINOR | Lỗi 3 |
| Cảng tây / Chu Hải | rv-harbour-west | MINOR | Lỗi 4 |
| Mép đông bản đồ | rv-edge-east | MINOR | Lỗi 4; cầu dưới camera OK |
| Hòm mật thư / Pit Stop đêm | rv-box-night, rv-mat-night | FIX | Lỗi 2 (điểm demo trong nhà) – chưa đánh giá được độ sáng hòm; `rv-box-largo*`, `rv-mat-largo` đã chụp, chưa xem |
| Toàn cảnh / bản đồ M | rv-topdown, rv-map | OK | Bản đồ M đọc tốt, tên phố Hoa + Bồ |
| Xe NPC đêm | rv-spawn-player | OK | Đèn pha / đèn hậu rõ; `rv-junction-night` đã chụp, chưa xem |

Chưa xem / chưa kiểm: bờ kè + bậc kè, cầu, Sai Van, mép nam, Rua da Felicidade thật (x −169, z −39), biển tên đường cột (plaque) cận cảnh,
bloom ở `quality=high` cho hòm, ngày của NAPE/Guia/Lotus/Cerco (ảnh đã có).
