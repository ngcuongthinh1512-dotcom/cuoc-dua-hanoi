# Phase 8C – Review 2 (giao diện / hình ảnh)

Ngày 2026-10-03, HEAD de3fc0e (8C ghép ở 24ae66a / d900f17). Chụp lại vài cảnh đại diện (`SCREENSHOT_PORT=5401`, headless Chrome, đầu ra `screenshots/review8c/`), so với `screenshots/before-8c/`. Không sửa mã, không commit, không đọc `~/Documents/chang-that/`. Đối chiếu `docs/STYLE_GUIDE.md`.

**Trạng thái: XONG.** Kết luận: **ĐẠT CÓ ĐIỀU KIỆN** – nâng cấp rõ rệt (trời, nước, cây, nhựa đường, đồ phố), không vỡ hình / lỗi chặn; nên sửa trước `feat(phase8c)`: #1 vạch sáng ngói mái, #2 lệch sáng Cao / Thấp (Cao mất bóng), #3 mảnh vụn + bệ loang của bản quét Ngọn lửa. (#4: tỉ lệ Ngọn lửa đúng – en.wikipedia "about 3.5 metres in height" cho cả tượng + bệ.) `flamme-scale*.png`, `shelter-hi.png` hết 90 s chưa `__READY__` do máy tải ~26, ảnh vẫn render đủ.

Đã biết từ reviewer 1, không lặp lại: áp phích / logo RATP trên texture nhà chờ; collider Ngọn lửa chỉ hộp bệ.

Ảnh: dùng lại `screenshots/r2-8c/*.png` của lượt bị cắt (chụp 11:22–11:35 ở a136028; từ đó tới HEAD chỉ đổi host / race UI / Toasts / shared protocol, không đụng thế giới 3D) + chụp thêm `street-hi2`, `props-hi`, `flamme-scale`, `flamme-scale2`. Lưu ý: preset thường chạy SwiftShader → tự chọn **Thấp**; chỉ `p8c-sky/-seine/-gold/-post` + ảnh `*-hi*` là **Cao** (máy người chơi có GPU rời sẽ thấy Cao). `r2-8c/street-hi.png` của lượt trước là URL sai (camera dưới mặt đất, y = 1,7 tuyệt đối) – bỏ, thay bằng `street-hi2.png`.

## Nhóm ảnh
| Nhóm | Preset | Trạng thái |
|---|---|---|
| A | street (+ `street-hi2` Cao), champs, seine, etoile, topdown | đã xem |
| B | p8c-quay, p8c-sky / -low, p8c-post, p8c-flamme (+ `lm-flamme`, `flamme-close`, `flamme-scale2`) | đã xem |
| C | p8c-props (+ `props-hi`), p8c-roof, p8c-road, nhựa đường `asphalt-hi` / `asphalt-lo` (`/?player=30,203,90&wait=2&npc=0`) | đang xem |
| D | Thấp vs Cao, menu Esc → Cài đặt → Chất lượng (`menu.png`) | đã xem |

## Phát hiện (cập nhật dần)
| # | Mức | playerVisible | PNG | Vấn đề | Đề xuất |
|---|---|---|---|---|---|
| 1 | Nên sửa | true | `p8c-roof.png`, `post-roof` (p8c-post Cao, mái mansard) | Texture `roof_slates_03` KHÔNG liền mép theo chiều dọc: hàng trên cùng của ảnh là dải bờ nóc sáng + một hàng ngói cắt chéo. Lặp mỗi 2 m (`graphics8c.roofs.tile`) → mọi mái phẳng lớn có các vạch sáng song song đều nhau như giấy kẻ dòng (nhìn từ trên rất rõ), mái mansard nhìn từ phố có 1–2 vạch sáng chạy dọc mái. | `scripts/assets/textures.ts`: cắt bỏ ~70 px trên cùng (bản 1K; tỉ lệ tương ứng bản 2K) của cả col / nrm / arm trước khi resize, cắt đúng bội số chiều cao hàng ngói để mép trên / dưới khớp; chạy lại `process-assets -- textures`. |
| 2 | Nên sửa | true | `street-hi2.png` vs `street.png` vs `before-8c/street.png`; `asphalt-hi.png` vs `asphalt-lo.png`; `p8c-sky.png` vs `p8c-sky-low.png` | Cao và Thấp lệch sáng / tương phản rõ. Đo độ sáng mặt đường (vùng y 440–690): trước 8C mean 105, p5 40, p95 144; **Cao** mean 125, **p5 72**, p95 163 → bóng cây trên Champs gần như mất, cảnh bệt (STYLE_GUIDE: "bóng đổ sắc, tương phản cao"); **Thấp** mean 64, p5 15 → tối hơn hẳn trước 8C (tán cây mới dày phủ bóng gần kín lòng đường). Hai mức chất lượng cho hai "ánh sáng" khác nhau. | Cao: giảm `graphics8c.sky.environmentIntensity` (0,5 → ~0,3) hoặc tăng `sunIntensity`, kiểm bóng lá LOD0 (alpha-test trong shadow map 1 hộp 160 m cho bóng lốm đốm rất nhạt) ; Thấp: nâng `render.hemiLight.intensity` / exposure để mean mặt đường gần trước 8C. Mục tiêu: Cao và Thấp cùng độ sáng trung bình, chỉ khác chi tiết. |
| 3 | Nên sửa | true | `flamme-scale2.png` (Cao, cận), `flamme-close.png`, `p8c-flamme.png` | Bản quét Ngọn lửa nhìn gần: phần lửa vàng là khối lổn nhổn "chảy" (lỗi photogrammetry phần đỉnh), một mảnh mỏng chĩa lên bên trái; bệ đá bậc thành "váy" loang xanh-đen-trắng (bóng / bẩn nướng sẵn trong texture), mảnh vụn rời lơ lửng / cục đen bị cắt ở mép đĩa (vật quanh tượng trong bản quét, cắt ở bán kính 3,05 m). Đây là điểm lộ trình (Alma), người chơi đứng sát. | `scripts/assets/flamme.ts`: bỏ các mảnh rời (lọc thành phần liên thông nhỏ / tam giác ngoài trụ bệ ở độ cao > 0,3 m gần mép đĩa); cân nhắc bỏ đĩa / bậc quét, dựng bậc đá thủ tục của g2 + giữ bệ + lửa quét; tăng ngân sách tam giác cho phần lửa (40k cho cả đĩa → lửa bị đơn giản hóa mạnh). |
| 4 | Ghi chú | true | `flamme-scale2.png` | Tỉ lệ: người chơi 1,8 m đứng cạnh → tượng ≈ 2 lần người (≈ 3,7 m). Bản quét gốc (đơn vị mét) cao 3,89, đĩa Ø ≈ 6 m khớp outline OSM; en.wikipedia ghi cả tượng ≈ 3,5 m. **Không xác nhận cần phóng to ×1,5–1,8** (reviewer 1 #2): bằng chứng nghiêng về tỉ lệ ĐÚNG; chính bản g2 thủ tục (lửa 3,5 + bệ 3 = 6,8 m) mới quá to → lúc đổi LOD 600 m tượng "phồng" gấp đôi. | Thu nhỏ g2 xa (`landmarks.g2.flamme`: lửa ~1,5–2 m, bệ ~1,2 m trên bậc ~1 m) cho khớp bản quét, không phóng to bản quét. |
| 5 | Nhỏ | true (chỉ Thấp) | `p8c-sky-low.png`, `asphalt-lo.png` (crop tán trái) | Thấp dùng LOD1 cả ở 0 m (`trees.lowLod [0, 150]`): đứng dưới gốc nhìn lên thấy rõ thẻ lá phẳng lớn, mép thẳng, thẻ nhìn nghiêng thành vệt đen / mảng mờ. | Cho Thấp dùng LOD0 trong ~15–20 m (ít cây) hoặc xoay / thu nhỏ thẻ LOD1 gần thân. |
| 6 | Nhỏ | true | `asphalt-hi.png` (crop thân), `street-hi2.png` | Thân cây nâu đen đồng màu; platane Paris có vỏ bong mảng xám-ô liu-kem rất đặc trưng → đọc như cây chung chung. | Tint vỏ sáng hơn / pha mảng sáng (vertex colour theo hash) nếu rẻ. |
| 8 | Nhỏ | không | `p8c-road.png` | Preset `p8c-road` (T3 "nhựa đường") đứng trên pavé Rue Royale – không thấy asphalt_02; ảnh nhựa đường thật chỉ có ở `asphalt-hi/lo` (Quai des Tuileries). | Đổi preset sang `/?player=30,203,90&wait=2&npc=0`. |
| 9 | Ghi chú | true | `shelter-hi.png` (Bd Malesherbes, Cao) | Nhà chờ đúng chỗ (bên mép lòng đường, sau gốc cây, không xuyên nhà), cao ≈ 2,5 m hợp lý; áp phích người thật / RATP = đã biết (reviewer 1 #1). Cột Morris mới KHÔNG gặp trong các cảnh đã chụp (đặt theo hash góc giao lộ) → chưa đánh giá tỉ lệ bằng ảnh. | Thêm preset nhìn một cột Morris cụ thể nếu cần duyệt. |
| 7 | Nhỏ | không | `before-8c/topdown.png` | Ảnh TRƯỚC `topdown` chỉ là màn hình "Đang tải bản đồ…" (22 KB) → không có mốc so sánh; `before-8c/p8c-quay.png` chụp trong nhà (preset tạm của T0), `before-8c/p8c-props.png` là Rue Royale (preset tạm). | Ghi trong báo cáo stats / integration rằng 3 ảnh trước này không dùng được để so. |

## Đã xem, đạt
- **Bầu trời HDRI** (`seine`, `p8c-sky`, `p8c-post`, `p8c-seine`): mây thật, xanh đậm lên đỉnh, sương sáng ở chân trời, không thấy banding (crop zoom cả Cao lẫn Thấp; Thấp 1K hơi mềm mây). Quầng skyline g5 khớp sương (Eiffel mờ đúng mức trong `p8c-flamme`).
- **Nước Seine** (`seine` Thấp, `p8c-seine` Cao): sóng hai lớp, không thấy lặp họa tiết ở tầm `seine`; Cao tối hơn, phản chiếu trời, mép xa hòa sương. Kè vẫn màu phẳng (ngoài phạm vi).
- **Hậu kỳ / bloom** (`p8c-post`): không lóa; xe buýt trắng, áo đỏ, vạch kẻ không bị quầng. Đèn lồng gang phản chiếu trời có một điểm sáng nhỏ – chấp nhận.
- **Nhựa đường** (`asphalt-hi/lo`, `p8c-props`, `props-hi`, `seine`): vết nứt rõ, vạch kẻ / vạch qua đường vẫn trắng sắc; không thấy kéo giãn.
- **Đồ phố** (`p8c-props`, `props-hi`): bàn ghế quán (Poly Haven) đặt sát mặt tiền, chạm đất, có bóng, tỉ lệ hợp lý; cột đèn gang mới đẹp, đứng ở mép vỉa hè; ghế băng đứng trên vỉa hè (không giữa lòng đường).
- **Menu Chất lượng** (`menu.png`): dòng "Chất lượng đồ họa" trong Cài đặt, 2 lựa chọn "Cao" / "Thấp (máy yếu: tắt hậu kỳ, ảnh nhẹ hơn)", dòng nhắc "Đổi chất lượng: áp dụng sau khi tải lại trang." – tiếng Việt có dấu đúng, không tràn. (Nhỏ: `<select>` gốc nền trắng lệch tông menu tối.)
- **Ảnh nhìn trên cao** (`champs`, `etoile`, `topdown`): mái xám ngói thay xanh-xám, cây nhỏ đốm đậm, không thiếu chunk / vỡ hình.
