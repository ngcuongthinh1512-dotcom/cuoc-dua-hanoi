# Luật chơi – Thử thách đối đầu CETIQLO (Leg 3 Hà Nội)

Tài liệu cho người chơi và Host. Mọi con số dưới đây là hằng số máy chủ trong `worker/src/race/cetiqlo/config.ts` (`CETIQLO`); bảng luật trong game (phím **H** ở phòng chờ) đọc từ cùng một chỗ. Kế hoạch kỹ thuật: `docs/plans/cetiqlo.md`.

> ## Tóm tắt nhanh
> - **Thể thức**: Head-to-Head – các đội chờ ở **sân trước cửa hàng CETIQLO** (bảng LIVE thứ tự thi đấu cạnh cửa); hai đội đầu hàng được đưa vào trong đấu trực tiếp một trận. **Thắng = đi tiếp** (nhận mật thư kế). **Thua = ra lại sân chờ**, đấu với đội đến sau.
> - **Đề bài**: 6 món (áo · áo khoác · quần / chân váy · giày · túi · phụ kiện), hiện bằng 6 ảnh tĩnh góc trên trái màn hình. Mỗi món trong cửa hàng là một thiết kế **duy nhất**: đúng dáng + đúng màu + đúng họa tiết.
> - **Bắt đầu**: hai đội được đưa vào đứng trên **thảm CHECKOUT**, đếm ngược **5-4-3-2-1** (đứng yên, chưa có đề; đội **vừa vào và được ghép đấu ngay** có thêm **15 giây đọc hướng dẫn** trước đó), rồi đề bài hiện và đồng hồ chạy.
> - **Thời gian**: **3 phút 30 giây** theo đồng hồ máy chủ; 30 giây cuối đồng hồ đỏ + bíp.
> - **Chốt**: đứng trong **ô đỏ CHECKOUT** cạnh cửa và bấm **F** trước khi hết giờ. Hết giờ chưa chốt = **không hoàn thành**.
> - **Điểm**: **+16,67** mỗi món đúng · **−8** mỗi món sai hoặc thừa · tối đa 100, **không có mức tối thiểu** (có thể âm) · túi rỗng = 0.
> - **Ai thắng**: hoàn thành thắng không hoàn thành → điểm cao hơn → chốt sớm hơn. Hòa cả hai → cả hai xuống cuối hàng.
> - **Chờ quá 10 phút** không có đối thủ (từ lúc vào hàng, hoặc từ kết quả trận vừa thua) → được đi tiếp, không cần đợi.
> - **Phím**: WASD đi · chuột xoay · Shift chạy · **F** lấy đồ / chốt · **B** túi · **1–9** bỏ món · **T** phóng to đề bài · **H** luật chơi · Esc đóng / menu.

## Hướng dẫn nhanh

Bảng này tự mở một lần khi đội vào phòng CETIQLO (bấm **Đã hiểu**, **Esc** hoặc ra ngoài bảng để đóng; nhấn **H** để xem lại). **Đội vừa vào và được ghép đấu ngay có 15 giây đọc hướng dẫn trước khi đếm ngược 5-4-3-2-1**: bảng mở sẵn với đồng hồ "Đọc hướng dẫn · còn N s", không đóng sớm được. Đội đã chờ trong hàng thì không có thời gian đọc này.

**Thử thách Head-to-Head · CETIQLO.** Hai đội đối đầu trong cửa hàng: ai nhặt đúng bộ 6 món trong đề với điểm cao hơn là thắng.

1. **Chờ ngoài sân.** Bảng thứ tự cho biết đội nào đang chơi. Khi đến lượt, hai đội được đưa lên thảm CHECKOUT và đếm ngược 5-4-3-2-1.
2. **Xem đề:** 6 ảnh món đồ (bấm ảnh hoặc phím T để phóng to). Mỗi món trong cửa hàng chỉ có một cái duy nhất, giống hệt ảnh về màu và chi tiết.
3. **Nhặt đồ trong 3 phút 30 giây:** nhìn vào món (sẽ sáng viền) rồi bấm F để nhặt. Phím B mở túi để bỏ món đã nhặt.
4. **Chốt:** quay lại đứng trong ô CHECKOUT và bấm F. Đã chốt thì không đổi được. Hết giờ mà một đội không đứng ở thảm CHECKOUT để chốt thì đội đã chốt mặc định thắng, dù điểm thấp hơn.
5. **Điểm:** mỗi món đúng +16,67 điểm, mỗi món sai hoặc thừa −8 điểm (tối đa 100, điểm có thể âm). Điểm cao hơn thắng; bằng điểm thì đội chốt sớm hơn thắng.
6. **Đội thắng** nhận mật thư tiếp theo và lối ra. **Đội thua** ở lại đấu với đội đến sau. Đợi quá 10 phút mà không có đối thủ thì được rời đi.

## 1. Thử thách là gì
Thử thách đối đầu (Head-to-Head Challenge) của The Amazing Race, chơi trong cửa hàng thời trang 3D **CETIQLO** (hai tầng, kệ trắng, ~1 000 món). Các đội đến phòng lần lượt, ghép cặp theo thứ tự đến; hai đội cùng nhận **một đề bài** (bộ 6 món), cùng lúc chạy đi tìm đúng 6 món đó trong cửa hàng, bỏ vào túi rồi về chốt ở ô CHECKOUT. Máy chủ chấm túi của từng đội, so sánh, công bố đội thắng cho cả hai máy cùng lúc.

Mỗi đội một người chơi, một thân nhân vật (như các chặng trước). Đội kia đi lại trong cùng cửa hàng, thấy nhau, nhưng **không thấy túi của nhau**. Kho không giới hạn: hai đội lấy cùng một món không ai giành của ai.

## 2. Diễn biến từng bước
1. **Nhận hòm mật thư** của bước trước (trước Vincom Center Phạm Ngọc Thạch): bấm **F** ở hòm → nhận thẻ thử thách CETIQLO **và** bước vào cửa hàng (dựng ngay dưới hòm).
2. **Phòng chờ = sân trước cửa hàng** (ngoài mặt kính, dưới mái hiên CETIQLO, trước cổng ra vào): đội đứng ngoài sân và được xếp vào hàng theo thứ tự đến. Ngoài sân có ghế băng, chậu cây và **bảng LIVE "PHÒNG CHỜ · THỨ TỰ THI ĐẤU"** trên trụ cạnh cửa; cùng bảng đó ở góc phải màn hình. Dòng giữa màn hình: "Đang chờ đối thủ · vị trí n / m" và "Còn chờ tối đa mm:ss". Đội chờ không vào trong cửa hàng (sảnh sau cửa kính chỉ là lối vào).
3. **Ghép trận**: khi có ≥ 2 đội trong hàng và không có trận nào đang chạy, hai đội đầu hàng được ghép. Máy chủ **đưa hai đội vào trong, đứng cạnh nhau ngay trên thảm đỏ CHECKOUT**. Đội đang chờ không vào được cửa hàng (cửa kính đóng với đội chờ).
3b. **Đọc hướng dẫn (chỉ khi có đội vừa vào và được ghép ngay)**: nếu ít nhất một trong hai đội mới vào phòng trong vòng 4 giây trước lúc ghép và chưa đấu trận nào ở phòng này, hai đội đứng yên trên thảm 15 giây, bảng hướng dẫn mở sẵn với đồng hồ đếm ngược (tính theo máy chủ nên F5 không làm đổi). Đội đã chờ, hoặc đội thua đấu lại, được ghép từ hàng thì KHÔNG có bước này.
4. **Đếm ngược 5-4-3-2-1**: hai đội đứng yên trên thảm, số đếm to giữa màn hình (bíp mỗi giây), chưa có đề bài, chưa lấy được gì. Hết đếm ngược: "BẮT ĐẦU!" — đề bài hiện, đồng hồ **3:30** bắt đầu chạy, hai đội được chạy đi tìm đồ.
5. **Tìm đồ**: xem 6 ảnh đề bài (bấm một ảnh hoặc **T** để phóng to), đi tìm trên hai tầng (cầu thang phía đông). Nhìn vào món (món được chọn có **viền đỏ**) và bấm **F** để lấy; món đã trong túi viền xanh lá. **B** mở túi (nhấp món để bỏ), **1–9** bỏ món số n. Túi tối đa 24 món.
6. **Chốt**: về ô đỏ CHECKOUT, đứng trong ô, bấm **F** ("[F] Chốt — kết thúc mua sắm"). Máy chủ ghi giờ chốt chính xác đến mili-giây; sau khi chốt túi bị khóa và thân đứng yên. Đội kia được báo "<đội> đã chốt" (không biết túi, không biết giờ).
7. **Kết quả** (gửi cả hai máy cùng lúc, giữ 12 giây): đề bài so với túi từng đội (✅ đúng / ❌ sai / ⬜ thiếu), điểm, giờ chốt, đội thắng và lý do.
8. **Sau trận**: đội thắng nhận **mật thư kế** và **vòng sáng ngoài sân** (phía phố) để rời đi (thẻ giữ tới khi đi vào vòng). Đội thua được đưa ra lại sân trước cửa hàng, bảng cập nhật, chờ đội kế tiếp.

## 3. Điều khiển
| Phím | Tác dụng |
|---|---|
| W A S D, chuột | Đi, xoay camera (góc nhìn thứ ba) |
| Shift | Chạy |
| **F** | Lấy món đang nhìn (viền đỏ) · **Chốt** khi đứng trong ô CHECKOUT · đóng màn kết quả |
| **B** | Mở / đóng túi đồ (chuột được thả; nhấp một món để bỏ ra) |
| **1 – 9** | Bỏ món số n trong túi |
| **T** | Phóng to cả lưới đề bài (bấm một ảnh = phóng to một món; bấm ngoài / Esc / T đóng) |
| **H** | Mở / đóng bảng luật chơi (cũng có nút "Luật chơi (H)" trên bảng thứ tự) |
| Enter | Mở lại thẻ mật thư / đóng màn kết quả |
| Esc | Đóng túi / ảnh phóng to / luật; menu game |

Mở túi, ảnh phóng to hay bảng luật thì thân đứng yên nhưng **đồng hồ vẫn chạy**.

## 4. Đề bài
- 6 món, mỗi món một loại, thứ tự cố định: **áo → áo khoác → quần hoặc chân váy → giày (giày / dép / sandal) → túi (túi / balo) → phụ kiện** (mũ, khăn, kính, ô, thắt lưng, ví, găng tay, đồng hồ). Đầm, đồ lót, đồ mặc nhà, tất chỉ là mồi nhiễu, không bao giờ vào đề bài.
- Hiện bằng **6 ảnh tĩnh** (lưới 3 × 2) ở góc trên trái, chụp đúng món như treo trên kệ (cùng ánh sáng, màu, chi tiết). Không có tên, không có chữ.
- Máy chủ random đề bài theo từng trận; hai đội cùng một đề bài.
- **Mọi món trong cửa hàng là thiết kế duy nhất** (không hai món nào giống hệt nhau): mỗi món của đề bài chỉ có **một** chỗ đúng. Các món "gần giống" (cùng dáng khác màu, cùng màu khác chất liệu / họa tiết) treo cạnh nhau cho khó.

## 5. Tính điểm (máy chủ)
- `đúng` = số món trong túi trùng **đúng ID** với đề bài; `sai` = mọi món còn lại trong túi (sai biến thể / màu, hoặc thừa ngoài 6 món).
- **Điểm = min(100, 16,67 × đúng − 8 × sai)**, làm tròn 1 chữ số thập phân; **không có mức tối thiểu** (điểm có thể âm, hiện "−23,3 điểm"). Món thiếu không bị trừ, chỉ không có điểm. Túi rỗng = 0.

| Túi | Đúng | Sai | Điểm |
|---|---|---|---|
| đủ 6 món đúng | 6 | 0 | **100** |
| 5 đúng + 1 sai màu | 5 | 1 | 75,3 |
| 6 đúng + 1 món thừa | 6 | 1 | 92 |
| 4 đúng + 2 sai | 4 | 2 | 50,7 |
| 3 đúng (túi 3 món) | 3 | 0 | 50 |
| 4 đúng + 1 sai (túi 5) | 4 | 1 | 58,7 |
| 1 đúng + 5 sai | 1 | 5 | −23,3 |
| 3 sai (không đúng món nào) | 0 | 3 | −24 |

## 6. Xếp hạng – ai thắng
So sánh hai đội theo thứ tự:
1. **Hoàn thành** (đã chốt trước khi hết giờ) thắng **không hoàn thành**, bất kể điểm: nếu một trong hai đội không đứng ở thảm CHECKOUT để chốt (hoặc đã rời trận), đội đã chốt mặc định thắng dù điểm thấp hơn.
2. Cùng hoàn thành → **điểm cao hơn** thắng; bằng điểm → **chốt sớm hơn** thắng (tính đến mili-giây).
3. Cùng không hoàn thành → vẫn chấm túi lúc hết giờ, điểm cao hơn thắng; bằng điểm → **HÒA**.
4. **Hòa** (không ai thắng): cả hai đội xuống **cuối** hàng chờ, đấu tiếp với các đội khác (chỉ đấu lại nhau khi không còn ai khác).

Màn kết quả ghi lý do: "hoàn thành trước khi hết giờ", "điểm cao hơn", "chốt sớm hơn", hoặc "Hòa".

## 7. Ai đi tiếp, ai ở lại
- **Đội thắng**: bước hoàn thành ngay; thẻ mật thư kế hiện, vòng sáng "Ra khỏi phòng" ngoài sân bật; đi vào vòng để ra phố.
- **Đội thua**: ra lại sân trước cửa hàng, lên **đầu hàng** (đội thua giữ ưu tiên cao hơn đội mới đến), đấu với đội kế tiếp — nhưng không đấu lại ngay đội vừa thắng mình nếu còn đội khác chờ.
- **Hòa**: cả hai xuống cuối hàng (mục 6).
- Đội thắng ra rồi, hàng chờ đánh số lại và bảng LIVE cập nhật.

## 8. Phòng chờ (sân trước cửa hàng) và bảng LIVE
- Phòng chờ là **sân ngoài cổng ra vào** của cửa hàng: nền gạch, mái hiên CETIQLO, ghế băng, chậu cây, phố Hà Nội phía sau. Chỉ hai đội đang đấu ở trong cửa hàng.
- Tối đa **11 đội** trong phòng (đang chờ + đang đấu); đội thứ 12 bị từ chối "Phòng đã đủ đội, thử lại sau".
- Bảng "THỨ TỰ THI ĐẤU" liệt kê mọi đội đã vào phòng theo **thứ tự đến** (1 → 11), mỗi dòng: số thứ tự, chấm màu đội, tên, trạng thái:
  - **ĐANG CHƠI** (đỏ): hai đội trong trận.
  - **CHỜ · thứ n**: chưa đấu, vị trí n trong hàng.
  - **ĐÃ THUA · chờ lượt** / **HÒA · chờ lượt** (vàng): đã đấu mà chưa thắng, đang chờ đối thủ kế.
  - **ĐÃ THẮNG** (xanh): vừa thắng, đang xem kết quả.
  - **ĐÃ XONG · đã đi** (xám): đã rời phòng (thắng, được thả sau 10 phút, hoặc Host cho qua).
- Bảng đổi mỗi khi có đội vào / ra, ghép trận, có kết quả; dòng của đội mình viền đỏ.

## 9. Luật chờ 10 phút
Đội nào ở trong hàng chờ **quá 10 phút mà không được ghép trận** thì máy chủ tự cho qua bước: thẻ mật thư kế hiện, vòng sáng bật, đội đi tiếp **không phải chờ đội khác**. Đồng hồ tính:
- từ lúc **vào hàng** nếu đội chưa đấu trận nào;
- từ **kết quả** trận vừa thua / hòa nếu đội đã đấu (mỗi trận mới tính lại từ kết quả mới).
Đang trong trận thì không bao giờ bị thả. Dòng "Còn chờ tối đa mm:ss" trên màn hình là đồng hồ này. Máy chủ ghi "Chờ quá 10 phút, được rời đi"; Host có thể **Hoàn tác** trong 10 giây như "Cho qua" (đội quay lại hàng với đồng hồ mới).

## 10. Mất mạng / F5
Không có giới hạn thời gian offline. Tải lại trang (F5) hoặc rớt mạng **không mất gì**: chỗ trong hàng, đồng hồ 10 phút, trận đang chạy (cùng đề bài, túi, trạng thái chốt, giờ kết thúc), màn kết quả đều được gửi lại khi vào lại. Chỉ có một điều: trong lúc offline đội **không được ghép trận mới** (đội online kế tiếp được ghép trước, đội offline vẫn giữ chỗ). Trận đang chạy vẫn kết thúc đúng giờ và xếp hạng theo luật thường — không ai thắng chỉ vì đối thủ rớt mạng.

## 11. Chơi đẹp
- Hai đội cùng một đề bài, cùng một đồng hồ máy chủ; mọi lấy / bỏ / chốt do máy chủ kiểm tra (đứng gần kệ mới lấy được, đứng trong ô mới chốt được, cách nhau ≥ 0,1 s).
- Không thấy túi đối thủ, không thấy giờ chốt của đối thủ cho tới màn kết quả.
- Gõ đáp án vào thẻ thử thách không có tác dụng.
- Ra khỏi phòng giữa trận (vòng sáng chỉ bật khi đã xong bước, nhưng đội có thể bỏ trận bằng cách rời phòng) = bỏ trận: túi được chấm như đang có, không được quay lại trận đó.

## 12. Host
- Khối "CETIQLO" trên trang Host (chỉ đọc): hàng chờ (tên, "rời sau mm:ss" của từng đội chờ), trận đang chạy (tên, số món trong túi, đã chốt, mất mạng, còn bao lâu).
- **Cho qua** ở ô ma trận: hoàn thành bước cho một đội bất kỳ lúc nào (đội cuối cùng còn một mình cũng tự được thả sau 10 phút theo mục 9).
- **Hoàn tác** (10 giây) sau một lần thắng / thả: đội quay lại bước, vào lại hàng như đội thua đang chờ với đồng hồ mới.
- Mật thư của bước này không có ô gõ đáp án; vị trí hòm, mô tả thử thách ghi trong file chặng (`docs/LEG_FORMAT.md` §5.2, cột `room`).
