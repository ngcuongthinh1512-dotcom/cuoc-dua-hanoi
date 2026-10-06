# Leg 2 – review hình ảnh, phần 2 (Opus, tiếp bản dở của Fable)

2026-10-06, HEAD 40db8e2, chỉ đọc. Giữ nguyên kết luận của `leg2-review-visual.md` (Fable). Phạm vi thu hẹp theo yêu cầu: chỉ lỗi ảnh hưởng
cuộc đua (hòm / thảm / điểm bị che hoặc không tới được, người chơi / NPC kẹt, lún, bị chặn trên lối đi; biển tên / minimap / HUD khó đọc
ban đêm; điều gây rối trong 10 phút đầu). Không nhắc lại: L6/PS trong Leal Senado, NPC lún bậc Ruínas, các lỗi collider của
`leg2-review-code.md`. Đã xem ≈ 90 ảnh Fable chụp nhưng chưa xem + 18 ảnh mới `screenshots/rv/rv2-*.png`. Không lỗi console; không còn
tiến trình vite / chrome.

## Lỗi ảnh hưởng cuộc đua

1. **FIX – Dốc đường dựng đứng nuốt người chơi, Av. Comercial de Macau cạnh Bank of China** (≈ (520–600, 420–480), `rv-boc-ave`): mặt nhựa
   uốn như vách, nhân vật chìm tới thắt lưng, xe NPC đỗ nghiêng xuyên dốc. Trục đường chính giữa Lisboa và NAPE → đội đạp xe dễ đi qua.
   Có vẻ mặt cầu vượt nối đất sai (nhóm M4 bậc cầu). Gợi ý: `bridgeAudit` riêng cho các way quanh BOC; tối thiểu ghi `TODO.md` +
   LEG_FORMAT "không đặt điểm / lộ trình qua đây".
2. **FIX – Thảm Pit Stop ban đêm chói, che người chơi và thảm** (`rv-mat-largo`): viền `pit.rim` + bloom thành dải vàng trắng chiếm nửa
   dưới màn hình; thân nhân vật khuất sau viền, không thấy mình đã đứng trên thảm chưa (check-in = ON the mat, SPEC §17.38). Gợi ý: giảm
   `lighting.pit.rim` ≈ × 0,3 hoặc viền mảnh sát mặt thảm; giữ cột đỏ.
3. **FIX (cần kiểm) – Đi được vào trong podium Wynn** (`rv-wynn-ave`): `?player` đặt người chơi TRONG đường viền podium (minimap), thấy các
   dải kem của tháp mà không có tường – spawn search chỉ đẩy ra khỏi collider, nên chỗ này có vẻ không có collider. Đội đi xuyên vào casino
   sẽ lạc / tưởng có lối. Kiểm `m4` Wynn: collider podium.
4. **MINOR – HUD sai giáo xứ ngay ở spawn** (`rv2-spawn-default`, `rv2-almeida-player`, `rv-box-night`): Av. Almeida Ribeiro / Beco da Cadeia
   cạnh Senado hiện "Freguesia São Lourenço", Largo do Senado hiện "Freguesia Sé" (xác nhận L3 trên màn hình). Nếu mật thư nhắc giáo xứ,
   đội bị dẫn sai.
5. **MINOR – Gốc (0, 0) "Largo do Senado" nằm sát / trong mặt tiền Leal Senado** (`rv2-mat-far`: thảm PS tại (0, 0) + `?player=-4,12` →
   người chơi ép vào tường kem, trang không `__READY__` sau 90 s). Bổ sung cho lỗi L6/PS đã biết: mọi chặng thử / preset dùng (0, 0) làm
   "giữa quảng trường" sẽ đặt điểm trong nhà; dùng ≈ (57, −24) như Fable đề xuất.
6. **MINOR – Tấm "mặt tiền cửa hàng" đứng giữa vỉa hè và biển neon lơ lửng ngoài tường** (`rv2-almeida-street` ≈ (−165, 40), 160 m từ
   spawn; `rv-lourenco-front` giữa sân São Lourenço ≈ (−269, 350); `rv-quartel-street`): không có collider (N-B) nên không chặn, nhưng
   trông như vật cản / lối vào giả trên đúng lộ trình đi bộ. Gợi ý: `shopSign` bỏ đường viền địa danh, nhà < `smallArea`, kẹp biển trong
   0,3 m của tường.
7. **MINOR – Hồ Nam Van: đảo đất giả nhô khỏi mặt nước** (≈ (−50…150, 550…750), `rv2-namvan-wide`, `rv-namvan-lake`): hồ nội địa không được
   carve như biển, DEM làm mờ lồi lên → bơi qua hồ sẽ đứng được trên "đảo" và bờ tây là đụn dốc. Gợi ý: hạ địa hình dưới đa giác nước nội địa
   xuống mực nước − 1 m.

## Đã kiểm, không ảnh hưởng cuộc đua

| Mục | Ảnh | Kết luận |
|---|---|---|
| Hòm mật thư đêm (gần / 20 m) | rv-box-largo, rv-box-largo-20m, rv-box-largo-day | OK – hòm + cột vàng đọc rõ, prompt "Bấm F để mở hòm mật thư" rõ |
| Biển tên phố + HUD tên đường đêm | rv-senado-sign, rv-senado-north, rv2-spawn-default, mọi ảnh player | OK – Hoa + Bồ đọc tốt; biển cột đọc được ở ≈ 10 m |
| Minimap / bản đồ M | rv-map, ảnh player | OK |
| Bậc thang đêm | rv-ruinas-steps-player, rv2-ruinas-steps, rv-nape-water | OK – dải sáng mũi bậc thấy rõ |
| Xe NPC đêm | rv-traffic-night, rv-junction-night | OK – đèn rõ, chạy bên trái |
| Lộ trình Senado → Ruínas | rv-ruinas-front, rv2-ruinas-steps, rv-domingos-* | OK – Ruínas thấy từ cuối Rua de S. Paulo; São Domingos nhận ra từ phố |
| Santo Agostinho từ phố | rv-agostinho-street | Xác nhận H2 trên hình (camera ở trong khối nhà thờ) |
| Cảng Nội | rv2-inner-harbour, rv2-harbour-player | OK – bờ kè rõ |
| Ban ngày (hồi quy) | rv-*-day, rv2-*-day | OK |

Ngoài phạm vi (thẩm mỹ, chỉ ghi để biết): vỡ mảnh vỉa hè quanh nút Lisboa–BOC (`rv2-boc-shards-day`), chữ Hán giả trên biển hiệu, đốm trăng
trên nước, vỉa hè đêm trắng như tuyết, dấu vết Paris (bàn café bistro `cafeOneIn`, `morrisOneIn` vẫn bật), khối tam giác lơ lửng trên trời
(`rv-namvan-lake`).
