# Phase 8C – Cổng cuối (ghép fix A / B + kiểm đối kháng)

Ngày 2026-10-03, main sau `merge(phase8c): fix A` (2d6b73b) + `merge(phase8c): fix B` (97606e3) lên d9ea012 (Phase 10 đã sửa). Xung đột duy nhất: `CLAUDE.md` (dòng `client/`: giữ phần Phase 10 của main + đoạn 8C của fix B). `config.ts` tự ghép sạch; `credits.json` chỉ fix A đổi (không cần sinh lại). Không đọc `~/Documents/chang-that/`, không sửa `docs/SPEC.md`.

**Kết luận: ĐẠT** – commit `feat(phase8c)`. Một điểm biên: FPS Thấp trên SwiftShader ≈ 89 % trước 8C (tiêu chí kế hoạch §7.3 ≥ 90 %, sai số làm tròn 0,1 FPS); Cao ≈ 32 % (chi phí theo pixel, SwiftShader phóng đại) – cần người dùng nhìn trên máy thật (TODO.md).

## Tổng
| Kiểm | Kết quả |
|---|---|
| `npm run build` (gốc) | qua (tsc mọi workspace + vite + `wrangler deploy --dry-run`) |
| `npm test` (gốc) | **1 148** qua (scripts 116, shared 79, client 776, worker 177), 0 skip, 0 fail |
| `grep ZodError client/dist` | 0 |
| `client/dist` | 63 MB, 439 tệp, tệp lớn nhất `main-*.js` 5,24 MB rồi `sky_2k.hdr` 5,20 MB; 0 tệp > 25 MB |
| `credits.json` | 30 dòng; `dist/credits.json` = `public/credits.json`; dòng "Phòng Louvre" chung, không tên tác phẩm; Ngọn lửa "emm (https://sketchfab.com/edemaistre), CC BY 4.0 … (đã chỉnh sửa)" |

## Kiểm đối kháng theo ba review
### Review 1 (SPEC + mã + giấy phép)
| # | Mục | Cách kiểm | Kết quả |
|---|---|---|---|
| 1 | Áp phích / bản đồ / logo RATP trên nhà chờ | Giải nén `props.glb` (gltf-transform, 7 texture) + `lm-flamme.glb` (1 texture), xem từng ảnh ở 800 px và crop 1:1 vùng còn hoạ tiết | Nhà chờ (t3): bê tông sàn + 5 ô màu phẳng, **không còn ảnh người / chữ / logo**. Cột Morris (t2): 12 áp phích Belle Époque (Commons PD) + mảnh gang bản quét, không chữ hiện đại. Ghế (t4), hộp sách (t5, 1024×953): mảnh quầy / sách ở 1024 px không đọc được, không người. Cột đèn (t0/t1), bàn ghế (t6): Poly Haven CC0. Ngọn lửa: đá lát + lửa, không người. `asset.extras` / `copyright` = null, tên node trung tính. **nameLeaks / licenceIssues = 0** |
| 2 | Collider Ngọn lửa + g2 thu nhỏ | `g1.test.ts` (tia xuống trúng mặt từng bậc, đĩa lát không chặn, hộp bệ ±0,55; GLB ≤ 41k tam giác, cao 3,3–3,9 m; g2 xa cùng chiều cao ±10 %) + ảnh `p8c-flamme-step` (người đứng TRÊN bậc, không lún) + `p8c-flamme-near` (tượng ≈ 2 lần người) | đạt; `landmarks.g2.flamme` 3,65 m = bản quét (hết "phồng" ở 600 m) |
| 3 | Đồ phố không collider | TODO.md Phase 8C ghi rõ (chấp nhận có chủ đích + cách nâng) | ghi nhận |
| 4 | Atlas hộp sách 2048² | `keepUsed()` tô xám vùng không dùng + cắt hộp uv + ≤ 1024 (test `props.test.ts`); `props.glb` 1,59 → 0,82 MB | đạt (xem #1) |
| 5 | Ghi nguồn tên + URL hồ sơ | `manifest.test.ts`; `credits.json` | đạt |
| 6 | Dispose canvas Sky | `Sky.ts` 107 / 151 / 170: `canvasSky.dispose()` sau khi HDRI / Sky.js thay nền; `post.dispose()` khi tự hạ cấp | đạt |
| 7 | Anisotropy vào config | `graphics8c.quality.anisotropy` (`textures.ts`), three kẹp theo GPU | đạt |
| 8 | Số liệu lệch giữa báo cáo | fix B đã gạch số sai trong `phase8c-integration.md`, ghi rõ preset thường = Thấp | đạt |

### Review 2 (hình ảnh)
| # | Mục | Cách kiểm | Kết quả |
|---|---|---|---|
| 1 | Ngói vạch sáng kẻ dòng | Đo số: `roof_slates_03_col.webp` 2K, chênh hàng kề nhau trên/dưới mép = 32,9 (hàng kề trong ảnh p99 15,8, max 19,9 – mép vẫn là chỗ nối "rõ" hơn một đường mạch thường nhưng không còn dải bờ nóc sáng); ghép ảnh mép dưới + mép trên: một đường mạch ngói bình thường; `p8c-roof.png` (60 m trên Rue Royale, mái phẳng lớn): **không còn vạch sáng song song** | đạt |
| 2 | Độ sáng Cao ≈ Thấp ≈ trước 8C | Chụp lại `street` (SwiftShader = Thấp), cùng URL + `quality=high`, và `street` ở worktree 7270518 (trước 8C); luma vùng mặt đường y 440–690 (mean / p5 / p95) | **trước 105 / 40 / 144 · Thấp 100 / 32 / 154 · Cao 99 / 47 / 150** → lệch ≤ 6 %; `champs` trên cao: trước 118 / Thấp 132 (vật liệu mái + cây mới sáng hơn, như fix B ghi); `p8c-sky` Cao 102 / Thấp 110 |
| 3 | Ngọn lửa nhìn gần | `p8c-flamme-near`, `p8c-flamme-step` | bệ đen + lửa vàng trên 4 bậc granite sạch, không mảnh rời / "váy" loang; lửa vẫn lổn nhổn như bản quét (TODO) |
| 5 | LOD cây Thấp dưới tán | `p8c-sky-low` (camera 1,7 m dưới hàng cây Champs) + `street` Thấp | tán gần = LOD0 đầy, không thẻ phẳng lớn |
| 6 | Vỏ platane | `street-high` crop thân | xám ô liu có mảng sáng, đọc như platane |
| 8/9 | Preset `p8c-road`, nhà chờ | `p8c-road` nay Quai des Tuileries; ảnh `shelter-high` (`/?cam=-38,6,171,180,-22&quality=high&npc=0`) | nhà chờ kính + khung đỏ + vách xám, đặt giữa hàng cây sát mép đường |

### Review 3 (chạy thật)
| # | Mục | Cách kiểm | Kết quả |
|---|---|---|---|
| F1 | FPS Thấp ≥ 90 % trước 8C | `p8c-bench` (xe đạp autoMove lên Champs, NPC mật độ 1, 15 s rAF sau `__READY__`), 3 vòng XEN KẼ trước 8C (git worktree tạm ở 7270518 = cha của merge b4733d1, chạy `scripts/screenshot.ts` hiện tại trong worktree đó, đã xóa) / Thấp / Cao, máy tải 3,6–11 | bảng dưới: **Thấp 3,1 / 3,47 = 89 %**, **Cao 1,1 / 3,47 = 32 %** (số thật, không đạt §7.3 trên SwiftShader – đường cho GPU thật; tự hạ cấp che máy yếu chọn Cao) |
| F2 | `RIDE_ONLY=3` | không chạy lại (người chơi không bơi; reviewer 3 đã xác nhận code / collider không đổi; `ride-check` mặc định qua) | theo dõi (TODO) |
| F3 | Phòng Louvre ẩn thế giới | script Playwright: `?louvre=1&card=louvre&roomAt=button&quality=high&npc=1&npcDensity=1` → `__STATS__` trong phòng, rồi `room.leave()` + `player.moveTo` (đúng đường `leaveRoom` của main.ts) → 8 s → `__STATS__`; ảnh `room-high.png`, `room-out.png` | **trong phòng 27 lệnh vẽ / 36 k tam giác; ra phòng 347 / 883 k**, `room.active` đúng, đèn nút đỏ / xanh thấy rõ, 0 lỗi console. RemotePlayers: `keepInRoom` giữ `remote.owns(o)` (model + xe của người chơi khác), test `hideWorld.test.ts` |
| – | Tự hạ cấp không ghi đè lựa chọn | context mới, `localStorage['cuoc-dua-paris.quality']='high'`, không `?quality=`, SwiftShader | toast "Đã tự giảm chất lượng đồ họa để chạy mượt" 4,7 s sau `__READY__`, localStorage vẫn `high`, 0 lỗi; `?quality=high` (forced) không tạo FpsWatch (các preset đo Cao không bị hạ) |
| – | ride-check | `npm run ride-check` (cổng 5471) | OK: tuyến 371 m, đạp 388 m, 97 % đá lát, 4,0 / 5,2 m/s, nghiêng 15,6°, thấp nhất −0,02 m, heap 144 → 160 MB, ngã / dậy / lên lại đúng |
| – | hud-check | `scripts/hud-check.ts` (cổng 5472) | mọi mục ok (kể cả 2 mục Hoàn tác của Phase 10), no console errors |
| – | sim `--leg louvre` 3 bot | harness trong tiến trình, `--speedup 2` | exit 0, **3 / 3 đội về đích** (bị loại 1 = đội về cuối), xếp hạng 3 dòng, chốt sai 3 / đúng 3, feed ≥ 6 / bot; 14,9 request / bot / phút → 20 đội × 2 h ≈ 35 641 (< 40 000), 7,6 dòng SQLite / bot / phút, 37 dòng / đội (≤ 160) – bằng trước 8C |

### FPS xen kẽ (SwiftShader 1280×720, avg / p5; lệnh vẽ / tam giác)
| Vòng | Trước 8C (7270518) | Thấp | Cao |
|---|---|---|---|
| 1 | 3,4 / 3,2 (343 / 0,99 M) | 3,1 / 2,7 (330 / 0,72 M) | 1,1 / 0,9 (360 / 0,83 M) |
| 2 | 3,5 / 3,0 | 3,1 / 2,7 | 1,1 / 0,9 |
| 3 | 3,5 / 3,0 | 3,1 / 2,7 | 1,1 / 0,9 |
| TB | **3,47** | **3,1 = 89 %** | **1,1 = 32 %** |

## Nghĩ cách phá (hoàn tác sửa trong đầu → test nào thất bại)
- Bỏ `keepUsed` khỏi hộp sách / Morris → `props.test.ts` (tô xám + cắt uv) thất bại; bỏ thay màu nhà chờ → không có test ảnh (chỉ mắt): đã xem atlas. Thêm `uv` lặp > 1 vào `keepUsed` → ném lỗi (test).
- Bỏ 4 lăng trụ collider → `g1.test` "tia xuống trúng mặt từng bậc" thất bại; để hộp bệ ±0,95 → test ±0,55 thất bại; g2 cao 6,8 m → test "cùng chiều cao ±10 %" thất bại.
- `VERTICAL_CROP` bỏ → không có test (chỉ mắt / số đo); đã đo mép.
- `hideWorld` không ẩn vật thêm vào sau / hồi sinh vật đã dỡ → `hideWorld.test.ts` thất bại; `keepInRoom` quên đèn → phòng tối (mắt: `room-high.png` sáng).
- `FpsWatch` quên ân hạn / cửa sổ / khung > 10 s → `graphics.test.ts`; ghi localStorage khi hạ cấp → kiểm Playwright trên (`storedAfter`).
- Bỏ `vertexColors: true` → thân cây đen (mắt); `lowShadow` / `lowLod` đổi → FPS Thấp (đo).
- `sky.low` bỏ → Thấp tối (luma `street` Thấp 65 trước fix, nay 100).

## Sửa trực tiếp ở cổng (nhỏ)
- `client/src/config.ts`: chú thích `trees` còn ghi "impostor from 60 m" (giá trị thật `lowLod[1]` = 45) → "from lowLod[1]".
- `TODO.md` Phase 8C: dòng "không tự hạ chất lượng giữa trận (ponytail)" lỗi thời sau fix B → ghi FpsWatch + số FPS cổng cuối; tiêu đề "Xong".
- `README.md` bảng phase: 8C "Xong" (+ máy yếu tự chọn Thấp, Cao tự hạ cấp); Phase 9 "Bỏ (SPEC §17.18)".
- `docs/reports/HANDOFF.md`: 8C / 10 xong, kế Phase 11, việc người dùng.

## Còn mở
- FPS trên máy thật (GPU tích hợp / Apple Silicon) chưa đo – người dùng nhìn bằng mắt Cao / Thấp; nếu Thấp vẫn chậm: `trees.lowLod`, `props.lowScale`.
- Thấp 89 % trên SwiftShader (sát 90 %): không ép thêm – chênh lệch còn lại là thẻ lá cây (fix B đã đo), hạ nữa là bỏ cây 8C ở Thấp.
- `RIDE_ONLY=3` nhạy thời gian (reviewer 3), đồ phố không collider, lucarne, LOD pop trên máy thật: TODO.md.
- Phòng Louvre: `hideWorld` ẩn theo cấp 1 của scene – vật thêm vào scene ở cấp 1 sau này (module mới) tự bị ẩn trong phòng, cố ý; nếu cần thấy trong phòng thì thêm vào `keepInRoom`.

## Tất định
`npm run process-assets -- hdri textures trees props flamme` chạy lại sau ghép → `git status client/public` sạch (textures / models / credits.json byte giống hệt).
