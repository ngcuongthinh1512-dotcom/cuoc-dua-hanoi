# Leg 2 – Địa danh bán đảo Macao (Bước B)

Ngày 2026-10-06. Anh đã duyệt danh sách 41 mã dưới đây rồi **thu lại còn 20 rồi thêm 10: 30 địa danh** (mục 0). Cách làm như Paris Phase 2B (`docs/plans/phase2b-assets.md`): dữ liệu OSM 3D (A) + dựng chi tiết bằng code (B). **Không tải file ngoài** (mô hình GLB): mọi thứ dựng bằng code; cần tải gì thì hỏi anh trước (xem CLAUDE.md, quy tắc tải file).

## 0. Phạm vi đợt này: 30 địa danh (anh chọn 2026-10-06: 20 rồi thêm 10)

Chỉ làm các mục có dấu ★ trong bảng mục 2: **30 địa danh** (Guia là một điểm gồm pháo đài + hải đăng, nên 31 mã). Các mục không có ★ để dành cho đợt sau, **không dựng và không đăng ký** trong `LANDMARKS`.

**20 đầu:** 1. Ruínas de São Paulo · 2. Largo do Senado · 3. Leal Senado · 4. São Domingos · 5. Sé Catedral · 6. Fortaleza do Monte · 7. Fortaleza + Farol da Guia · 8. Templo de A-Ma · 9. Casa do Mandarim · 10. Jardim Lou Lim Ioc · 11. Macau Tower · 12. Grand Lisboa · 13. Hotel Lisboa (Casino Lisboa) · 14. Wynn Macau · 15. MGM Macau · 16. Sands Macao · 17. Fisherman's Wharf · 18. Macau Science Center · 19. Kun Iam Statue · 20. Portas do Cerco

**10 thêm:** 21. Quartel dos Mouros · 22. Igreja de São Lourenço · 23. Igreja de Santo Agostinho · 24. Teatro Dom Pedro V · 25. Santa Casa da Misericórdia · 26. Ermida da Penha · 27. Kun Iam Tong · 28. Bank of China · 29. Macau Cultural Centre · 30. Praça Flor de Lótus (tượng sen vàng)

Chưa làm: Lou Kau, Casa Garden, Ho Tung, Tap Seac, São José, Santo António, Capela da Guia, Lin Fung, Mong-Há, cầu Amizade, cầu Sai Van.

## 1. Cơ chế có sẵn (đọc code, không viết lại)

| Việc | Ở đâu |
|---|---|
| Danh sách địa danh (mã, tên Việt, nhóm, mã OSM, `near`, `height`, góc chụp thử `view`) | `client/src/geo/landmarks.ts` (`LANDMARKS`) |
| Kiểu `LandmarkId` (hợp của các mã) | `client/src/geo/chunkData.ts` |
| `build-chunks` gắn `BuildingRec.landmark` cho đường viền theo mã OSM, giữ `building:part` nằm trong đường viền, gắn node vùng lân cận (`near`) | `scripts/build-chunks.ts` (đoạn OUTLINES / landmark) |
| Phân phối: mỗi nhóm một file xuất `details: Partial<Record<LandmarkId, DetailFn>>`; không có hàm riêng thì dựng `generic` (S3DB từ `building:part`, không có thì đùn đường viền theo chiều cao) | `client/src/world/landmarks/index.ts`, `parts.ts`, `kit.ts` (khối dựng: box, revolve, loft, tube, mái…) |
| Ví dụ viết `DetailFn` | `g1.ts`…`g5.ts` (Paris, chỉ để tham khảo cách dùng `helpers`) |
| Thông số (màu, kích thước) | `client/src/config.ts`, **mỗi nhóm chỉ sửa khối riêng của mình** (`landmarks.m1` … `landmarks.m4`) |
| Ảnh kiểm tra | `npm run screenshot lm-<id>` (preset sinh từ `view` trong registry) |

Giới hạn cần giữ: mỗi chunk dựng trong worker (không DOM); tổng tam giác một địa danh hợp lý (xem `lod` / `landmarks.detailDistance`: bucket `lod: 'near'` ẩn xa); có collider cho phần đi chạm được (tường, bậc thang); không chiếm đường đi bộ của đội (chặng đặt điểm ở sân trước).

## 2. Nhóm và mã địa danh

Tọa độ lấy từ OSM đã tải (`.cache/osm`). Chiều cao OSM là tham khảo: các công trình trên đồi (hải đăng Guia 104 m, Monte 57 m, Penha 73 m…) có vẻ gồm cả cao độ đồi, đo lại khi dựng.

### m1 – Nhà thờ (8)
| Mã | Địa danh | OSM | Ghi chú dựng |
|---|---|---|---|
| ★ `ruinas-sao-paulo` | Ruínas de São Paulo 大三巴牌坊 | w/1001795463 (h 26,4), w/1001795464 | Chỉ còn mặt tiền đá 4 tầng + bậc thang rộng phía trước; sau lưng hở |
| ★ `sao-domingos` | Igreja de São Domingos 玫瑰堂 | w/192573688 (h 17,9) | Baroque màu kem, viền trắng, quảng trường lát đá trước nhà |
| ★ `se-catedral` | Sé Catedral 主教座堂 | w/330368426 (không có h) | Hai tháp chuông, mặt tiền, quảng trường trước |
| ★ `sao-lourenco` | Igreja de São Lourenço 聖老楞佐堂 | w/279952093 | Hai tháp, bậc thang lên đồi |
| ★ `santo-agostinho` | Igreja de Santo Agostinho 聖奧斯定堂 | w/389129453 | Mặt tiền, quảng trường |
| `sao-jose` | Seminário e Igreja de São José 聖若瑟修院 | r/5828699 (h 35,9) | Nhà thờ Baroque vàng |
| ★ `ermida-penha` | Ermida da Penha 西望洋聖母小堂 | w/655240802, w/655240811 | Nhà nguyện trên đồi |
| `santo-antonio` | Igreja de Santo António 聖安多尼堂 | w/319660137 (h 23,3) | Nhà thờ nhỏ |

### m2 – Di sản kiểu Bồ Đào Nha (10)
| Mã | Địa danh | OSM | Ghi chú dựng |
|---|---|---|---|
| ★ `leal-senado` | Leal Senado 市政署大樓 | w/192573674 (h 16,8) | Tân cổ điển, trắng / pastel, cửa vòm, cầu thang |
| ★ `largo-senado` | Largo do Senado 議事亭前地 | (cần tìm vùng đi bộ) | **Mặt đất**: lát sóng đen / trắng, đài phun; điểm gốc (0, 0) |
| ★ `santa-casa` | Santa Casa da Misericórdia 仁慈堂 | w/265433529 (h 16,5) | Nhà từ 1569, mặt tiền trắng |
| ★ `casa-mandarim` | Casa do Mandarim 鄭家大屋 | w/404235920, w/848078997 | Nhà Trung Hoa nhiều sân, tường xám, ngói |
| `casa-lou-kau` | Casa de Lou Kau 盧家大屋 | w/192573681 (h 14,5) | Nhà thương gia 2 tầng, tường gạch xám |
| ★ `quartel-mouros` | Quartel dos Mouros 港務局大樓 | w/192187335 (h 29,3) | Kiểu Moorish: tường vằn đỏ / trắng, tháp, mái bằng |
| ★ `teatro-dom-pedro` | Teatro Dom Pedro V 伯多祿五世劇院 | w/389129455 | Tân cổ điển xanh / trắng, cột |
| `casa-garden` | Casa Garden + vườn Camões 白鴿巢 | n/4445078490, w/319660135, park w/… | Nhà + vườn + nghĩa trang Tin Lành |
| `biblioteca-ho-tung` | Biblioteca Sir Robert Ho Tung 何東圖書館 | w/279957436 | Thư viện |
| `praca-tap-seac` | Praça do Tap Seac 塔石廣場 | w/206823905 (phòng tranh), w/205784460, w/172300551 | Quảng trường + các nhà xung quanh |

### m3 – Pháo đài và chùa (9)
| Mã | Địa danh | OSM | Ghi chú dựng |
|---|---|---|---|
| ★ `fortaleza-monte` | Fortaleza do Monte 大炮台 | w/46510080 (7432 m²) | Tường dày, lỗ châu mai, súng thần công; gắn địa hình đồi |
| ★ `fortaleza-guia` | Fortaleza da Guia 東望洋炮台 | w/404669396 | Pháo đài đồi Guia |
| ★ `farol-guia` | Farol da Guia 東望洋燈塔 | w/230576208 | Hải đăng tháp tròn trắng (cao thật ≈ 15 m, không phải 104 m) |
| `capela-guia` | Capela da Guia 聖母雪地殿 | w/230576209 | Nhà nguyện 1622 |
| ★ `templo-ama` | Templo de A-Ma 媽閣廟 | w/192187333, r/18544991 | Chùa thời Minh, bậc thang, đình |
| ★ `kun-iam-tong` | Kun Iam Tong 觀音堂 | n/2165428407 (≈ 22,2043, 113,5497); chưa có đường viền | Chùa Trung Hoa, mái cong; cần tìm / vẽ đường viền |
| `templo-lin-fung` | Templo de Lin Fung 蓮峰廟 | n/2165427661 (≈ 22,2102, 113,5483); chưa có đường viền | Chùa; cần tìm / vẽ đường viền |
| ★ `jardim-lou-lim-ioc` | Jardim Lou Lim Ioc 盧廉若公園 | w/265433531 | Vườn Tô Châu, hồ, cầu |
| `fortaleza-mong-ha` | Fortaleza de Mong-Há 望廈炮台 | w/347579898 | Pháo đài nhỏ |

### m4 – Hiện đại (14)
| Mã | Địa danh | OSM | Ghi chú dựng |
|---|---|---|---|
| ★ `macau-tower` | Macau Tower 澳門旅遊塔 | r/21176879, r/10366309 | Tháp 338 m, đài quan sát; chân là trung tâm hội nghị |
| ★ `grand-lisboa` | Grand Lisboa 新葡京 | w/192182405 (h 211,5), w/192182404 (đế 54) | Tháp hoa sen, đỉnh tròn |
| ★ `hotel-lisboa` | Hotel Lisboa + Casino Lisboa 葡京酒店 | w/1313391925 (khu), n/13679896101 | "Lồng chim" vàng, mặt tiền casino |
| ★ `wynn-macau` | Wynn Macau 永利澳門 | r/6279959, w/1215820171 | Sòng bạc + tháp khách sạn |
| ★ `mgm-macau` | MGM Macau 澳門美高梅 | w/605485397 (h 120), w/192179915 (đế 20) | Tháp cong, sư tử vàng w/… |
| ★ `sands-macau` | Sands Macao 澳門金沙 | w/164195448 (h 46,7) | Casino kiểu Las Vegas |
| ★ `bank-of-china` | Bank of China 中銀大廈 | w/699456294 (h 116,3) | Tháp văn phòng |
| ★ `fisherman-wharf` | Fisherman's Wharf 漁人碼頭 | r/4257072, r/10387813 | Đấu trường La Mã giả, "Babylon" |
| ★ `science-center` | Macau Science Center 澳門科學館 | r/2590433 | Tòa hình nón xoắn; OSM không có chiều cao |
| ★ `cultural-centre` | Macau Cultural Centre 文化中心 | w/192179917 (h 25,6) | Nhà hát |
| ★ `kun-iam-statue` | Kun Iam Statue 觀音像 | w/231068755 (trung tâm); tượng chưa có | Tượng đồng 20 m giữa hồ |
| ★ `portas-do-cerco` | Portas do Cerco 關閘 | w/173864406 (cổng 1870), w/138665744 (trạm) | Cổng vòm cổ + cửa khẩu |
| `ponte-amizade` | Cầu Amizade 友誼大橋 | w/241886409, w/317670569 | Cầu sang Taipa; sát mép đông khung |
| `ponte-sai-van` | Cầu Sai Van 西灣大橋 | w/983838949, w/983838954 | Cầu ở góc tây nam, chỉ một phần trong khung |
| ★ `praca-flor-de-lotus` | Praça Flor de Lótus 金蓮花廣場 + tượng sen vàng | park w/192179907 (≈ 22,1945, 113,5534), n/7668244537 (tượng, 22,1964, 113,5529), n/2165427729 (quảng trường) | Quảng trường + tượng sen vàng đứng trên bệ; tìm / vẽ đường viền quảng trường |


## 3. Việc nền (điều phối viên, trước khi giao nhóm)

1. Đổi `LandmarkId` và `LANDMARKS` sang 31 mã có dấu ★ (kèm `view` góc chụp thử); `PADS` nếu cần phẳng sân.
2. Tìm đường viền cho `largo-senado`, `kun-iam-tong`, `praca-flor-de-lotus` và tượng Kun Iam (đa giác không tên gần điểm; hoặc vùng đi bộ).
3. `index.ts`: `DETAILS` gộp 6 file `m1.ts`…`m4.ts`, `mf1.ts`, `mf2.ts` (đều rỗng lúc đầu); gỡ g1–g5, mô hình Eiffel / Khải Hoàn Môn / Flamme trong `models.ts` và test của chúng.
4. `build-chunks` chạy lại; chạy `npm run screenshot lm-<id>` ra ảnh nền (khối đùn mặc định) cho cả 41 mã.
5. Khối `landmarks.m1`…`m4`, `mf1`, `mf2` trống trong `config.ts`.

## 4. Giao việc (4 agent Opus + 2 agent Fable song song, mỗi agent một file riêng)

**Mô hình (anh duyệt 2026-10-06):** Opus dựng 4 nhóm m1–m4; **Fable** dựng riêng 4 địa danh khó nhất và làm review cuối.

| Agent | Mô hình | File | Địa danh |
|---|---|---|---|
| o1 | Opus | `m1.ts` | `leal-senado`, `largo-senado`, `santa-casa`, `teatro-dom-pedro`, `quartel-mouros`, `casa-mandarim`, `sao-domingos`, `se-catedral` (dân dụng và nhà thờ kiểu Bồ Đào Nha) |
| o2 | Opus | `m2.ts` | `fortaleza-monte`, `fortaleza-guia` + `farol-guia`, `templo-ama`, `kun-iam-tong`, `jardim-lou-lim-ioc`, `sao-lourenco`, `santo-agostinho`, `ermida-penha` (đồi, chùa, nhà thờ) |
| o3 | Opus | `m3.ts` | `hotel-lisboa`, `wynn-macau`, `mgm-macau`, `sands-macau`, `fisherman-wharf` (sòng bạc / khu resort) |
| o4 | Opus | `m4.ts` | `bank-of-china`, `cultural-centre`, `kun-iam-statue`, `praca-flor-de-lotus`, `portas-do-cerco` (công trình công cộng, tượng, quảng trường) |
| f1 | Fable | `mf1.ts` | `ruinas-sao-paulo`, `science-center` |
| f2 | Fable | `mf2.ts` | `macau-tower`, `grand-lisboa` |
| review | Fable | (không sửa code ngay) | hai reviewer song song: (a) spec / code, (b) hình ảnh; báo cáo `docs/reports/leg2-landmarks-review-*.md` |

`index.ts`: `DETAILS` gộp 6 file `m1.ts`…`m4.ts`, `mf1.ts`, `mf2.ts` (đều rỗng lúc đầu); gỡ g1–g5, mô hình Eiffel / Khải Hoàn Môn / Flamme trong `models.ts` và test của chúng.
4. `build-chunks` chạy lại; chạy `npm run screenshot lm-<id>` ra ảnh nền (khối đùn mặc định) cho cả 41 mã.
5. Khối `landmarks.m1`…`m4`, `mf1`, `mf2` trống trong `config.ts`.

## 4. Giao việc (4 agent Opus + 2 agent Fable song song, mỗi agent một file riêng)

**Mô hình (anh duyệt 2026-10-06):** Opus dựng 4 nhóm m1–m4; **Fable** dựng riêng 4 địa danh khó nhất và làm review cuối.

| Agent | Mô hình | File | Địa danh |
|---|---|---|---|
| o1 | Opus | `m1.ts` | `sao-domingos`, `se-catedral`, `leal-senado`, `largo-senado`, `casa-mandarim` (kiểu Bồ Đào Nha / Trung Hoa cổ) |
| o2 | Opus | `m2.ts` | `fortaleza-monte`, `fortaleza-guia` + `farol-guia`, `templo-ama`, `jardim-lou-lim-ioc` (pháo đài, chùa, vườn) |
| o3 | Opus | `m3.ts` | `hotel-lisboa`, `wynn-macau`, `mgm-macau`, `sands-macau`, `fisherman-wharf`, `kun-iam-statue`, `portas-do-cerco` (hiện đại) |
| f1 | Fable | `mf1.ts` | `ruinas-sao-paulo`, `science-center` |
| f2 | Fable | `mf2.ts` | `macau-tower`, `grand-lisboa` |
| review | Fable | (không sửa code ngay) | hai reviewer song song: (a) spec / code, (b) hình ảnh; báo cáo `docs/reports/leg2-landmarks-review-*.md` |

`index.ts`: `DETAILS` gộp 6 file `m1.ts`…`m4.ts`, `mf1.ts`, `mf2.ts` (đều rỗng lúc đầu); gỡ g1–g5, mô hình Eiffel / Khải Hoàn Môn / Flamme trong `models.ts` và test của chúng.
4. `build-chunks` chạy lại; chạy `npm run screenshot lm-<id>` ra ảnh nền (khối đùn mặc định) cho cả 41 mã.
5. Khối `landmarks.m1`…`m4`, `mf1`, `mf2` trống trong `config.ts`.

## 4. Giao việc (4 agent Opus + 2 agent Fable song song, mỗi agent một file riêng)

**Mô hình (anh duyệt 2026-10-06):** Opus dựng 4 nhóm m1–m4; **Fable** dựng riêng 4 địa danh khó nhất và làm review cuối.

| Agent | Mô hình | File | Địa danh |
|---|---|---|---|
| m1 | Opus | `m1.ts` | 7 nhà thờ còn lại (không có `ruinas-sao-paulo`) |
| m2 | Opus | `m2.ts` | 10 di sản Bồ Đào Nha |
| m3 | Opus | `m3.ts` | 9 pháo đài và chùa |
| m4 | Opus | `m4.ts` | 10 hiện đại còn lại (không có `macau-tower`, `grand-lisboa`, `science-center`) |
| f1 | Fable | `mf1.ts` | `ruinas-sao-paulo`, `science-center` |
| f2 | Fable | `mf2.ts` | `macau-tower`, `grand-lisboa` |
| review | Fable | (không sửa code ngay) | hai reviewer song song: (a) spec / code, (b) hình ảnh; báo cáo `docs/reports/leg2-landmarks-review-*.md` |

`index.ts`: `DETAILS = { ...m1, ...m2, ...m3, ...m4, ...mf1, ...mf2 }`; khối `landmarks.mf1`, `landmarks.mf2` trong `config.ts`.

Mỗi agent: chỉ sửa `m<k>.ts`, `m<k>.test.ts`, khối `landmarks.m<k>` trong `config.ts`, báo cáo `docs/reports/leg2-landmarks-m<k>.md` (ghi sớm, cập nhật dần). Với mỗi địa danh: đọc dữ liệu OSM (parts, chiều cao, `roof:*`, màu), đối chiếu số liệu công bố (ghi nguồn trong chú thích, không ghi thành tiêu đề giấy phép), dựng chi tiết đặc trưng, bổ sung collider, chụp `lm-<id>` và xem ảnh, sửa tới khi đúng hình dáng. Test: hàm thuần (kích thước, đếm bộ phận) + kiểm chunk dựng không lỗi; không làm test dựa vào dữ liệu OSM khác Macao.

Nhận việc xong khi: ảnh `lm-<id>` của cả nhóm đạt, `npm run build && npm test` xanh, báo cáo ghi số tam giác mỗi địa danh và những gì còn ước lượng.

## 5. Sau khi 4 nhóm xong

1. Ghép (điều phối viên), chụp lại mọi preset `lm-*`; review song song bằng Fable: (a) spec / code, (b) hình ảnh; sửa theo review (chỉ lỗi nhìn thấy trực tiếp, như quy tắc đã chốt).
2. **Gắn lộ trình vào địa danh**: đặt lại điểm L1–L6 và Chặng dừng của `macao-demo*` ở sân trước từng địa danh (ví dụ L1 = sân Ruínas de São Paulo, L2 = Largo do Senado, L3 = A-Ma, …), đặt tên theo địa danh, `npm run leg:check` không lỗi, ảnh `leg-L*`. Schema chặng chỉ lưu tọa độ: không thêm trường.
3. Bóng xa Taipa / Cotai (đường chân trời từ `skyline.json`) nếu còn thời gian.
4. Commit `feat(leg2): địa danh bán đảo Macao`.

## 6. Bối cảnh buổi tối (anh chọn 2026-10-06)

Chặng Macao diễn ra **buổi tối**. Làm theo hai mức: **tối thiểu trước** (≈ 3–5 giờ), xem ảnh rồi anh quyết có làm **đầy đủ** (≈ 1–1,5 ngày) không.

- Tối thiểu: khóa `timeOfDay` trong `config.ts` (`'day' | 'night'`, mặc định đêm cho Macao); bầu trời tối + ánh sáng mặt trăng thay mặt trời, sương đổi màu; cột đèn đường phát sáng (vật liệu phát sáng + bloom, không thêm đèn thật); một phần cửa sổ sáng, ngẫu nhiên theo từng tòa.
- Đầy đủ (chờ quyết): neon casino, đèn pha / đèn hậu xe NPC, phản chiếu nước, đèn cho hộp mật thư và bậc thang.
- Quy ước cho agent địa danh: mỗi địa danh khai báo vật liệu phát sáng (`emissive`) cho cửa sổ / đèn pha / biển hiệu của nó, đọc cường độ từ khối `lighting` chung trong `config.ts` do điều phối viên tạo trước khi giao nhóm; **không dùng đèn thật** (mỗi đèn thật làm biên dịch lại shader).
