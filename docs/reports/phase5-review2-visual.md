# Phase 5 – Reviewer 2: hình ảnh / UX / HUD

Main @ `cd47483` (nền + track A/B/C/D đã merge). Chỉ chụp, xem, báo cáo; không sửa nguồn, không commit.

## Cách làm
- Chụp trong bản sao `git archive HEAD` ở scratchpad (node_modules symlink, `@race/*` trỏ vào bản sao), `SCREENSHOT_PORT=5272`, Chrome headless SwiftShader 1280 × 720 DPR 1. Không ghi đè `screenshots/` của repo.
- Ảnh Phase 4/4B cũ trong `screenshots/` (chụp 04:04–04:51, trước commit `3caa004`) được sao ra trước, rồi ghép cũ | mới cạnh nhau để so.
- Đã chụp và mở từng ảnh: 16 `p5-*`, 20 `p4-*`, 20 `p3-*`, `p4b-street`, `p4b-density`, `etoile`, `champs`, `street`, `seine`, cộng 16 góc tự chọn (bảng cuối). Ảnh minimap / HUD được cắt phóng to 2–4 ×.
- Kiểm tra thêm bằng script tạm (không commit): `FullMap.labels` trên đồ thị thật (Étoile, Concorde, Opéra, giữa Champs-Élysées); `StreetLocator` + `districtAt` dọc trục Concorde → Louvre; thời gian tới `__READY__` của `p4-cobbles` trước Phase 5 (`3caa004`) và sau.
- Không lỗi console ở mọi ảnh. Một lần hết giờ `__READY__` (`p4-cobbles`, xem m9).

## Tóm tắt
- **BLOCKER: không có.**
- **Không có regress 3D:** mọi ảnh `p3-*` / `p4-*` / `p4b-*` / mặc định trùng khớp ảnh cũ (nhân vật, xe đạp, người lái, bậc thang, bậc kè, NPC, cột đèn, cây, lối metro). Khác biệt duy nhất: HUD mới, `#help` thu gọn, biển tên đường cao thêm dòng "8e Arrt". Vài chi tiết "mới" (tượng vàng trên trụ cầu Alexandre III ở `p3-bridge`, cây ở `p4-border-junction`, Opéra Garnier ở `p4b-density`) trước đây chỉ bị bảng `#help` cũ che.
- **Các việc ghi "chưa kiểm" đã kiểm:**
  - `p5-hud`: "Rue Royale" (chữ tay) trên "Quận 8", "THỜI GIAN 00:02". Đạt.
  - `p5-gps-map` / `p5-gps`: đường GPS tím viền tối hiện rõ trên bản đồ lớn và minimap, đích kẹp vào viền. Đạt (có gai đầu tuyến, m6).
  - `#help` với F3: **đè nhau** (m1).
- **1 MAJOR:** bản đồ lớn thiếu tên hầu hết đại lộ chính.

## MAJOR

### M1. Bản đồ lớn không ghi tên các đại lộ chính (phố nhỏ thì có)
- **Ảnh:** `c-fullmap-etoile` (1 m/px quanh Étoile), `p5-gps-map` (2 m/px), `p5-fullmap-streets` (1 m/px Concorde).
- **Thấy:**
  - Étoile, 1 m/px: 21 nhãn, toàn phố nhỏ (Rue Brey, Rue Troyon, Cité Odiot…). Không có Avenue des Champs-Élysées, Grande Armée, Kléber, Iéna, Marceau, Friedland, Carnot, Place Charles de Gaulle.
  - Opéra, 1 m/px (đích của `p5-gps`): 19 nhãn phố nhỏ. Không có Boulevard Haussmann, Boulevard des Capucines, Boulevard de la Madeleine, Avenue de l'Opéra, Place de l'Opéra.
  - 2 m/px (`p5-gps-map`): không có Champs-Élysées (đường chéo lớn nhất khung hình), Rue de Rivoli, Rue Saint-Honoré, Faubourg Saint-Honoré, Avenue Gabriel, Boulevard Malesherbes.
- **Nguyên nhân (đo):** `FullMap.labels` chỉ đặt chữ trên **một đoạn thẳng dài nhất của mỗi mảnh way**, và bỏ nhãn nếu đoạn ngắn hơn chữ. Đại lộ bị nút giao / vạch qua đường cắt thành nhiều đoạn ngắn. Đoạn dài nhất trong khung:

  | Đường | Đoạn dài nhất | Cần (chữ ≈ 12 px) |
  |---|---|---|
  | Champs-Élysées (Étoile) | 104 m | 163 px |
  | Grande Armée | 125 m | 163 px |
  | Kléber | 70 m | 85 px |
  | Haussmann | 118 m | 124 px |
  | Capucines | 114 m | 150 px |
  | Avenue de l'Opéra | 82 m | 111 px |
  | Place de l'Opéra | 32 m | 104 px |
  | Place Charles de Gaulle | 21 m | 150 px |

  Ghi chú `ponytail` của A nói "phố cong", nhưng lỗi xảy ra cả với **đại lộ thẳng**.
- **Tác động:** SPEC §4.6: bản đồ chỉ có tên đường, người chơi giải mật thư bằng tên đường. Bản đồ lại thiếu đúng những tên lớn nhất, dễ tìm nhất.
- **Nghi file:** `client/src/ui/FullMap.ts` `labels()` (≈ dòng 267–290).
- **Gợi ý (từ rẻ tới đắt):**
  1. Gộp các đoạn liên tiếp gần thẳng hàng (lệch hướng < ~10°) của một way thành một "đoạn chạy", rồi đo đoạn chạy đó.
  2. Gộp các way cùng tên nối nhau (chung nút) trước khi chọn đoạn.
  3. Chữ chạy dọc đường gấp khúc (nâng cấp ghi trong `ponytail`).
  4. Ưu tiên theo lớp đường đã có (`order`), nên đại lộ sẽ thắng chỗ trước phố nhỏ.
- **Test nên thêm:** 1 m/px quanh Étoile có "Avenue des Champs-Élysées"; quanh Opéra có "Boulevard Haussmann".

## MINOR

| # | Ảnh / chỗ | Thấy gì | Nghi file | Gợi ý |
|---|---|---|---|---|
| m1 | `p5-debug`, `p3-debug`, `p4-ride-turn`, `p4-stairs-block`, `p4-crash`, `p4-cobbles`, `p4b-street`, `c-small` | Bảng F3 (góc trên phải, cạnh trái x ≈ 703 ở 1280 px) đè lên `#help` ở giữa trên (x 506–773): chữ "Esc menu" bị che. Ở 1024 px, F3 che gần hết `#help`. | `ui/DebugOverlay.ts` (top 8 px), `index.html` `#help` | Hạ F3 xuống dưới `#help` (top ≈ 64 px), hoặc ẩn `#help` khi F3 mở. |
| m2 | `c-wp-north` (`/?player&gps=0,-1200`) | Đích nằm đúng hướng bắc: chữ N (vẽ sau) đè lên chấm tím, chỉ còn viền tím quanh N. Góc lệch vài độ cũng bị che một phần. | `ui/Minimap.ts` `update()` (vẽ đích trước N; `WAYPOINT_INSET` 9 so với lề N 11) | Vẽ đích sau N, hoặc dời đích vào trong khi cách N < 2 × `N_RADIUS`. |
| m3 | `p5-fullmap-streets` (≈ 840–900, 130–230 px) | Tuyến GPS vẽ đè lên nhãn "Rue Saint-Florentin": chữ thành chấm trắng lấm tấm dưới nét tím. | `ui/FullMap.ts` `update()` (tuyến vẽ sau lớp vector + nhãn) | Vẽ nhãn sau tuyến (tách lớp nhãn), hoặc bỏ nhãn của way đang nằm dưới tuyến. |
| m4 | `p5-respawn`, `p5-gps-bike`, `p5-toast-stairs`, `c-small` | Tên đường dài không giới hạn bề rộng: "Promenade des Berges de la Seine — André Gorz" ≈ 635 px, "Parvis des Libertés et des Droits de l'Homme" ≈ 570 px (44–50 % màn 1280; 56 % ở 1024 px), đè vào giữa cảnh. | `ui/HUD.ts` (`street` 30 px, không có max-width) | `max-width: ~36vw`, cho xuống 2 dòng canh phải (`text-wrap: balance`), hoặc giảm cỡ chữ khi dài. |
| m5 | `p5-gps-bike` (nền sân Trocadéro sáng), `c-alex3` | Chữ tay trắng + bóng mờ trên nền đá sáng đọc được nhưng yếu; dòng "Quận 16" (19 px, nét mảnh) khó đọc nhất. | `ui/hud.css` `.hud-hand` | Viền rõ hơn: 4 bóng lệch 1 px màu đen, hoặc `-webkit-text-stroke: .5px #000` + `paint-order: stroke`. |
| m6 | `p5-gps`, `p5-gps-map`, `c-dpr2`, `p5-fullmap-streets` | Tuyến GPS từ chỗ spawn bắt đầu bằng một vòng chữ U đi ngược (về phía tây rồi xuống nam ~20–30 m) trước khi đi đúng hướng Opéra. B đã ghi (bám nút gần nhất, gai ≤ 80 m, tự hết khi đi), nhưng trong ảnh preset chính nó trông như lỗi. | `geo/gps.ts` (ponytail bám nút) | Bám điểm chiếu trên cạnh gần nhất (nút ảo), như `ponytail` của B đã đề xuất. |
| m7 | `c-small` (1024 × 600) | Dòng ghi nguồn (canh phải, dài ≈ 820 px) chạy dưới đáy minimap: chữ bị khung minimap che mép trên ở x 205–316. Mọi cửa sổ rộng < ~1150 px đều bị. Ở 1280 px thì không sao. | `index.html` `#credits` | Rút ngắn còn "© OpenStreetMap contributors · Ghi nguồn" (đủ danh sách trong bảng), hoặc `left` ≥ mép phải minimap + cho xuống dòng. |
| m8 | `c-menu-credits` | "Ghi nguồn" trông như tab thứ 4 nhưng mở bảng riêng đè lên menu. Bảng hẹp hơn menu nên mép nút xanh / cam của menu lòi ra hai bên, trông lộn xộn. | `ui/Menu.ts` (nút credits), `index.html` `#credits-panel` | Hiện danh sách ghi nguồn trong nội dung tab (như Luật đua), hoặc ẩn thẻ menu khi bảng mở. |
| m9 | `p4-cobbles` | Hết 30 s chờ `__READY__` (ảnh vẫn đúng). Đo: trước Phase 5 (`3caa004`) 38,4 s, sau 38,7 s, cùng tải máy ≈ 11 (có phiên khác chạy `ride-check`). **Không phải regress của Phase 5**: preset `wait=4` + F3 sát ngân sách 30 s khi máy bận. | `scripts/screenshot.ts` `TIMEOUT_MS` | Thêm `p4-cobbles` (và các preset `wait ≥ 4`) vào `TIMEOUT_MS` 60–90 s. |
| m10 | `c-fullmap-f3` (`map=2&debug=1`) | Khi bản đồ lớn mở, F3 bị bản đồ che hoàn toàn (`z-index 20`). Dòng HUD của F3 không có `minimap.stats.drawMs` / `fullMap.stats` (A đề xuất trong báo cáo) → không xem được hiệu năng bản đồ lớn trong game như §8 kế hoạch muốn. | `ui/DebugOverlay.ts` (không có z-index), `main.ts` `hudLine` | F3 `z-index: 30`; thêm "minimap x ms · bản đồ lớn nền x / nét x ms, n nhãn". |
| m11 | `c-fullmap-etoile`, `p5-gps-map` | Hộp hướng dẫn ở đáy bản đồ lớn che nhãn / đường phía dưới (vd. "Rue la Pérouse" bị cắt). | `ui/FullMap.ts` | Chấp nhận được. Có thể làm mờ hộp khi đang kéo, hoặc chừa lề đáy khi đặt nhãn. |

## Đạt (đã xem kỹ)
- **Minimap:**
  - Hình chữ nhật 300 × 190, góc dưới trái, bóng + viền tối.
  - Xoay theo camera; N đúng hướng ở mọi ảnh đã đối chiếu: nhìn tây-tây bắc → N bên phải hơi lên; nhìn nam → N ở đáy; nhìn đông → N bên trái; nhìn bắc (cầu Alexandre III) → N ở trên.
  - Mũi tên theo thân: `p3-face` chỉ xuống, `p5-minimap-turn` chỉ phải.
  - Zoom ra khi đạp (`p5-minimap-bike`, `c-bike-fast` thấy sông, cầu, vườn Champs-Élysées).
  - Đọc rõ nhà, đường theo lớp, nước, công viên, bậc thang (vạch be). Nhà hơi chìm so với nền nhưng vẫn đọc được.
  - Không đè HUD khác (toast nằm ngay trên). Ở DPR 2 (`c-dpr2`) mép mịn; ở DPR 1 SwiftShader mép đường hơi lấm tấm, không xấu.
- **Bản đồ lớn:**
  - Nền ngoài bbox tối, tách rõ khỏi vùng đua. Sông, cầu có viền, công viên, đường theo lớp đều rõ.
  - Mũi tên người chơi, đích + tuyến rõ. Nhãn không chồng nhau, không lộn ngược. Không có tên địa danh (§4.6).
  - Ở 0,4 m/px (`c-fullmap-zoomin`) nét và nhãn đẹp. HUD, `#help`, ghi nguồn bị phủ đúng.
- **HUD góc dưới phải:**
  - Tên đường chữ tay + "Quận n", đổi đúng theo nơi đứng: Rue Royale / 8, Pont Alexandre III / 7, Avenue Hoche / 8, Allée de Castiglione / 1, Rue de la Huchette / 5, Boulevard des Capucines / 2, Rue Berger / 1.
  - Mờ sau 5 s (`c-bike-fast`, `c-respawn-land`). "THỜI GIAN mm:ss" và "TỐC ĐỘ 19 km/h" có icon xe, số tabular.
  - Không chạm dòng ghi nguồn. Nền tối ở `p3-narrow` rất rõ.
- **Biển tên đường (`p5-sign`):** "8e Arrt / RUE / ROYALE", dòng quận nhỏ ở trên, không tràn, viền xanh lá, đọc rõ từ 2,5 m. Các biển khác trong `p3-jog` / `c-concorde-east` cao thêm đúng một dòng.
- **Menu:**
  - Tiếng Việt có dấu đúng; nút "Tiếp tục" có vòng focus; nút cam "Kẹt? Về chỗ an toàn"; dòng "Cuộc đua vẫn tiếp tục khi mở menu".
  - Tab Cài đặt (ô tick, thanh trượt "1,00 ×"), Phím điều khiển (đủ phím, có `M`, `Esc`), Luật đua (Markdown dựng đẹp, cuộn).
  - HUD mờ phía sau.
- **Toast:** "Không đi xe trên bậc thang", "Đã đưa bạn lên bậc kè gần nhất", "Đã đưa bạn về chỗ an toàn": hộp tối ngay trên minimap, đọc rõ.
- **Hồi sinh:** dưới sông → đứng đầu bậc kè, quay vào bờ. Trên đất → về chỗ cũ.
- **Khán giả** (`p4-steps`, `p4-quay-stairs`, `etoile`…): không có HUD, đúng.

## Bảng preset

| Preset | Kết quả | Ghi chú |
|---|---|---|
| `p5-minimap` | OK | N phải-trên, mũi tên trên, obelisk, 2 đài phun nước |
| `p5-minimap-turn` | OK | N đáy, đích kẹp viền dưới |
| `p5-minimap-bike` | OK | zoom ra |
| `p5-fullmap` | OK | cả bản đồ, đích + tuyến |
| `p5-fullmap-streets` | cần sửa | M1 (thiếu tên đại lộ), m3 (tuyến đè nhãn) |
| `p5-gps` | OK | m6 (gai U đầu tuyến) |
| `p5-gps-map` | cần sửa | M1 (không có Champs-Élysées, Rivoli ở 2 m/px), m6 |
| `p5-gps-bike` | OK | m4, m5 (tên dài, nền sáng) |
| `p5-menu` | OK | |
| `p5-toast-stairs` | OK | m4 |
| `p5-respawn` | OK | m4 |
| `p5-hud` | OK | "Rue Royale · Quận 8" (việc "chưa kiểm" đã đạt) |
| `p5-hud-bike` | OK | |
| `p5-sign` | OK | |
| `p5-debug` | cần sửa | m1 (F3 đè `#help`) |
| `p4-*` (20 ảnh) | OK | không regress; `p4-cobbles` m9 (hết giờ, không phải regress); ảnh có F3: m1 |
| `p3-*` (20 ảnh) | OK | không regress; `p3-debug` m1 |
| `p4b-street`, `p4b-density` | OK | m1 (F3) |
| `etoile`, `champs`, `street`, `seine` | OK | giống hệt ảnh cũ trừ `#help` |

## Góc tự chọn (ảnh trong scratchpad, không commit)

| Ảnh | URL | Kết quả |
|---|---|---|
| `c-concorde-east` | `/?player=25,12,-90&gps=766,-715&wait=2` | OK: N trái, tuyến lên-trái tới Opéra |
| `c-etoile` | `/?player=-1804.6,-975.3,115.3&wait=2` | OK: vòng xuyến trên minimap, "Avenue Hoche · Quận 8" |
| `c-royale-back` | `/?player=87.8,-184.5,154&gps=245.8,-502.7&wait=2` | OK: đích Madeleine sau lưng → viền dưới |
| `c-tuileries` | `/?player=370.5,197.9,-90&autoMove=walk&wait=3` | OK: vườn xanh + lối đi, "Allée de Castiglione · Quận 1" |
| `c-alex3` | `/?player=-558.4,203.5,0&wait=2` | OK: cầu trắng trên nước, N trên |
| `c-bike-fast` | Champs-Élysées → Khải Hoàn Môn, `bike&autoMove=walk&wait=6` | OK: zoom ra, tuyến thẳng, 18 km/h |
| `c-fullmap-etoile` | `map=1` ở Étoile | **M1** |
| `c-fullmap-zoomin` | `/?player&map=0.4&gps=766,-715` | OK |
| `c-fullmap-f3` | `/?player&map=2&debug=1` | m10 |
| `c-respawn-land` | `/?player&autoMove=walk&respawn=6&wait=6.5` | OK: toast "Đã đưa bạn về chỗ an toàn" |
| `c-dpr2` | `p5-gps`, DPR 2 | OK: minimap mịn |
| `c-small` | `p5-gps-bike` + F3, 1024 × 600 | m1, m4, m7 |
| `c-wp-north` | `/?player&gps=0,-1200&wait=2` | m2 |
| `c-menu-keys` / `c-menu-rules` / `c-menu-credits` | `/?player&menu` + nhấp tab | OK / OK / m8 |

## Chưa làm được / để người tích hợp
- Không có Chrome GPU thật hay Firefox / Safari (chỉ headless SwiftShader), nên không kiểm tay kéo / lăn / nhấp trên bản đồ lớn, và không kiểm khóa chuột `Esc` / `M`. A đã xem minimap trên Chrome GPU (Browser pane).
- Toast lý do `F` (`bikeTooFast` / `bikeTooFar` / `bikeTaken`) không chụp: không có preset. C đã test bằng Playwright.
