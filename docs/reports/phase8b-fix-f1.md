# Phase 8B – nhóm sửa F1 (máy chủ + leg:check)

Xong cả 5 việc. Chưa commit (người điều phối commit).

1. **Feed lặp đôi sau khi Durable Object thức dậy** (`worker/src/RaceRoom.ts`, callback `feed`): khi `feedV` còn null thì chỉ đọc lại từ `events` (sự kiện vừa ghi đã có trong đó), không push thêm. Test workerd `RaceRoom.louvre.test.ts` "F1 #1": hibernate → chốt → welcome có đúng 2 dòng (trước khi sửa: 3).
2. **artLeaks chỉ quét metadata** (`scripts/leg-check.ts` `artRegions`). WebP: mọi chunk trừ `VP8 `/`VP8L`/`ALPH`/`ANMF`. GLB: chunk JSON + metadata của các ảnh WebP nhúng (qua bufferView). Tệp không đúng dạng thì quét cả tệp, nhưng chỉ tìm từ ≥ 6 chữ. Từ toàn chữ số bị bỏ. Đo trên 23 tệp thật: ảnh WebP có 0 byte metadata; GLB chỉ còn JSON (tên `art-NN`). Test dùng WebP / GLB tổng hợp; 2 test cũ đổi sang tệp RIFF đúng dạng.
3. **Quét lộ đáp án tĩnh**: `placeAnswers` lấy các đáp án / đáp án tham khảo trùng (so như đáp án: bỏ hoa / thường / dấu) tên đường trong roadgraph hoặc tên landmark. File chỉ chứa những chuỗi này thì báo CẢNH BÁO "trùng địa danh có sẵn trong bản đồ (không sao)". Mọi chuỗi bí mật khác vẫn là LỖI, kể cả một đáp án đơn lẻ không phải địa danh (trước đây chỉ là cảnh báo). Test đã cập nhật.
4. **Luật 4 so từng từ** (`shared/src/leg/check.ts`): một từ ≥ 6 chữ trong `credit.title` của 5 tác phẩm đúng xuất hiện trong chữ đội đọc → CẢNH BÁO "lộ một phần tên". Bỏ qua từ chung (`COMMON_ART_WORDS`: louvre, portrait…) và chữ đã khớp nguyên tên. Test trong `louvre.test.ts`.
5. `docs/LEG_FORMAT.md`: mục 7 (luật phòng Louvre), dòng quét tĩnh, bảng thông báo.

Kiểm: `npx vitest run scripts/leg-check.test.ts` (dự án scripts 480/480), `shared` 77/77, `worker` 155/155; `tsc -p scripts|shared|worker` sạch.
