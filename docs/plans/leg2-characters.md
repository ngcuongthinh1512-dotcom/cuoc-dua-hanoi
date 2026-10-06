# Leg 2 Macao – Nhân vật người chơi nam + nữ: nghiên cứu nguồn

Kiểm tra ngày **2026-10-06**. Chỉ đọc trang web, chưa tải asset nào. Mọi giấy phép đều đọc trên trang gốc. Nếu chỉ đọc được qua trang tổng hợp thì có ghi chú rõ.

**Hiện trạng** (`scripts/process-assets.ts` `player()` / `playerAnims()`, `client/src/player/*`):
- Thân: UBC `Superhero_Male_FullBody` + tóc `Hair_SimpleParted`, cùng một skin, xương kiểu UE (`pelvis`, `spine_01…03`, `upperarm_l`…).
- Mô hình 15 586 tam giác (đo `player.glb`), 3 material, file 0,42 MB.
- Clip: 15 clip UAL chỉ đổi tên xương. Hai rig cùng cây xương và cùng trục xương nên không phải retarget, chỉ scale dịch chuyển của hông.
- Màu đội: mask theo trọng số xương (`OUTFIT_BONES` gồm áo / quần / giày) trong một shader dùng chung.
- Tên xương UE còn được code dùng ở nhiều chỗ: `OUTFIT_BONES`, tay vẫy, IK chân đạp xe, thân (`Animation.ts`).
- Nhược điểm nhìn thấy (`screenshots/macao-player.png`): người cơ bắp "siêu anh hùng" mặc đồ bó sát, áo đỏ phẳng màu, không giống người đi đua ngoài phố.

## (a) Top 5

| # | Tên | Trang nguồn | Link file | Giấy phép + dòng ghi nguồn | Định dạng | MB (tải về) | Tam giác | Cần tài khoản? | Rig / công retarget | Nam + nữ? | Hợp game | Rủi ro |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | **Microsoft Rocketbox – cặp thể thao `Sports_Male_04` + `Sports_Female_02`** (phương án thay: cặp áo hoodie `Male_Adult_17` + `Female_Adult_12`) | https://github.com/microsoft/Microsoft-Rocketbox (ảnh xem trước: `…/Assets/Avatars/Professions/Sports_Male_04/Sports_Male_04.png`, toàn bộ: https://raw.githubusercontent.com/microsoft/Microsoft-Rocketbox/master/Docs/AvatarsSample.jpg) | raw GitHub, từng file ở mục (b) | **MIT**, © 2020 Microsoft. README: "The library of avatars is now released under MIT License." Giấy phép MIT bắt buộc kèm thông báo; repo đã có `client/public/models/LICENSE-rocketbox.md`. Ghi nguồn: `Người chơi (nhân vật): "Microsoft Rocketbox Avatar Library" (Sports_Male_04, Sports_Female_02) – © 2020 Microsoft, MIT, qua GitHub (đã chỉnh sửa)` | FBX + TGA 2048² | 25,70 (nam) + 42,54 (nữ) = **68,24** | ≈ 7–9k (ước theo 4 avatar đã đo ở Phase 4B: 7 364–8 966; cặp này đo sau khi tải) | **Không** (raw GitHub) | Bip01 (3ds Max biped, 52 xương thân + 28 xương mặt). Pipeline đọc FBX + atlas đã có sẵn (`npcPeds`). **Retarget UAL → Bip01 thật sự** (khác tên và khác trục xương): khoảng 1,5–2 ngày | Có, cùng thư viện, cùng phong cách | ★★★★★ Bán thực tế, quần áo thể thao thật (áo ba lỗ, quần short, giày chạy), hợp với NPC Rocketbox đang chạy trên phố Macao | Người chơi trông giống người đi đường. Khắc phục: chọn bộ đồ khác hẳn 4 avatar NPC, thêm màu đội và bảng tên. Texture có từ những năm 2010. Repo đã lưu trữ (archived 2026-10-02, chỉ đọc), file vẫn tải được |
| 2 | **Quaternius Universal Base Characters Standard – `Superhero_Female`** (cùng gói đang dùng) | https://quaternius.itch.io/universal-base-characters | Đã có trong zip đã duyệt `Universal Base Characters[Standard].zip` (Paris `.cache/assets`), nên **không tải thêm** | **CC0**. Trang itch: "Creative Commons Zero v1.0 Universal". File `License_Standard.txt`: "CC0 1.0 Universal (CC0 1.0) Public Domain Dedication". Dòng ghi nguồn giữ nguyên dòng UBC hiện tại | glTF + bin | 0 | ≈ 13k (trang itch ghi trung bình 13 000) | Không (nút "No thanks, just take me to the downloads") | Cùng skeleton UE với UAL nên **không retarget**, chỉ tính lại hệ số hông k | Có. Tóc nữ có sẵn: `Hair_Long`, `Hair_Buns`, `Hair_BuzzedFemale` + `Eyebrows_Female` | ★★★ Làm nhanh nhất nhưng **không đẹp hơn**: vẫn là thân "superhero" mặc đồ bó | Không giải quyết được ý "nhân vật đẹp hơn". Bản Source trả phí (19,99 USD+, vẫn CC0) có thêm thân **Regular** và **Teen** nam/nữ, 20 kiểu tóc, nhưng **không có quần áo hiện đại**: gói outfit chỉ có đồ fantasy |
| 3 | **MakeHuman / MPFB 2** (tự dựng 1 nam + 1 nữ trong Blender) | https://static.makehumancommunity.org/mpfb.html, giấy phép https://static.makehumancommunity.org/about/license.html, gói đồ https://static.makehumancommunity.org/assets/assetpacks.html | Tải trực tiếp: Blender, MPFB, các gói `system assets`, `shirts01`, `pants01`, `shoes01`, `hair01`, `skins01/02` (CC0) | **CC0** cho lõi: "All core assets are shared under Creative Commons, CC0". Gói *02/*03 là **CC-BY**, nên chỉ chọn gói *01 thì không phải ghi nguồn. Dòng ghi nguồn tự nguyện: `Người chơi (nhân vật): MakeHuman / MPFB – MakeHuman Community (CC0, ghi nguồn cho lịch sự)` | .blend → GLB | Blender ≈ 300 + gói đồ (trang không ghi dung lượng) | Tùy chọn proxy: thân đầy đủ ≈ 27k, có proxy thấp hơn (cần đo) | Không | Có rig "game engine" (tên giống UE, **cần kiểm**) nhưng trục xương khác nên vẫn phải retarget như số 1. Thêm dựng tay trong Blender | Có, tự tạo | ★★★★ Bán thực tế, quần áo là mesh riêng nên tô màu đội dễ nhất | **Máy chưa có Blender** (`blender` not found). Kết quả đẹp hay không phụ thuộc tay nghề. Quần áo CC0 của MakeHuman trông hơi cũ. Công sức 3–5 ngày |
| 4 | **Quaternius Ultimate Modular Men / Women** – `Hoodie Character` + `Casual Woman` | https://poly.pizza/m/gKLBoRsyKe, https://poly.pizza/m/qJ2gsTUBHL, gói gốc: https://quaternius.com/packs/ultimatemodularwomen.html | https://static.poly.pizza/bcd66ec5-5e81-4901-a222-47abc875fe2a.glb, https://static.poly.pizza/ba7a1955-ea51-4cb9-a561-188bdef0a6c7.glb (đã duyệt ở `phase2b-assets.md` #12, #15) | **CC0** (Poly Pizza: "Public Domain (CC0)", quaternius.com: CC0). Ghi nguồn: `Người chơi (nhân vật): "Hoodie Character", "Casual Woman" – Quaternius, qua Poly Pizza (CC0, ghi nguồn cho lịch sự)` | GLB | 1,46 + 1,53 = 2,99 | 4 318 / 3 410 | Không | Rig riêng của Quaternius (62 xương), kèm 24 clip, thiếu clip bơi và lái. Retarget UAL: 1,5–2 ngày | Có (10 nữ, nhiều nam; ghép đầu / thân / chân / giày) | ★★★ Đồ hiện đại (hoodie, casual, punk), áo là mesh riêng nên tô màu dễ. Nhưng low-poly, màu phẳng, chi tiết kém UBC | Có thể bị chê "kém đẹp hơn" bản hiện tại |
| 5 | **Mixamo** (Adobe), ví dụ nhân vật casual nam / nữ trong thư viện | https://www.mixamo.com | Chỉ tải được sau khi đăng nhập | Miễn phí bản quyền cho game, không bắt buộc ghi nguồn. **Hạn chế** (FAQ cộng đồng Adobe): không được phát tán "raw character and animation files for any type of free distribution". Web game gửi GLB tới trình duyệt nên đây là **vùng xám**. Trang helpx của Adobe trả 403 hôm nay, chưa đọc được bản gốc | FBX | ≈ 5–20 (tùy nhân vật) | ≈ 10–30k | **Có (Adobe ID)** | Rig `mixamorig:*`, retarget UAL ≈ 1,5 ngày (UAL2 ghi "compatible with other rigs such as Mixamo") | Có | ★★★★ Bán thực tế, đẹp | Cần tài khoản, giấy phép xám, thư viện không cập nhật nhiều năm |

## (b) Đề xuất: số 1, Rocketbox cặp thể thao (dự phòng: cặp hoodie)

**Lý do chọn:**
- Đẹp nhất trong các nguồn miễn phí không cần tài khoản: bán thực tế, quần áo thật.
- MIT, đã được anh duyệt cho NPC (Phase 4B).
- Repo đã có code đọc FBX + atlas + `LICENSE-rocketbox.md`.
- Có nam và nữ cùng bộ: `Sports_Male_04` mặc áo ba lỗ xanh + short trắng, `Sports_Female_02` mặc áo ba lỗ xám + quần dài đen + giày thể thao. Hợp với cuộc đua đêm ở Macao, trời nóng.
- Cặp hoodie (`Male_Adult_17` áo khoác kéo khóa xanh/trắng, `Female_Adult_12` hoodie đen + short) hợp "phố đêm" hơn nếu anh thích.
- Cả 4 avatar này đều **khác** 4 avatar NPC (Male_Adult_08, Female_Adult_05, Business_*).

### Danh sách tải về (chờ anh duyệt)

Chỉ tải FBX + texture màu. Bỏ normal / specular như Phase 4B. `_facial.fbx` không cần vì không dùng blendshape.

| # | Tên file | Trang nguồn | Link file | Định dạng | MB | Tam giác | Giấy phép + tác giả | Dùng cho |
|---|---|---|---|---|---|---|---|---|
| C1 | `Sports_Male_04.fbx` | https://github.com/microsoft/Microsoft-Rocketbox/tree/master/Assets/Avatars/Professions/Sports_Male_04 | https://raw.githubusercontent.com/microsoft/Microsoft-Rocketbox/master/Assets/Avatars/Professions/Sports_Male_04/Export/Sports_Male_04.fbx | FBX | 0,54 | ≈ 7–9k (đo sau) | MIT, © 2020 Microsoft | Lưới + rig nam |
| C2 | `m026_body_color.tga` | như trên | …/Sports_Male_04/Textures/m026_body_color.tga | TGA 2048² | 12,58 | – | MIT | Texture thân |
| C3 | `m026_head_color.tga` | như trên | …/Sports_Male_04/Textures/m026_head_color.tga | TGA 2048² | 12,58 | – | MIT | Texture đầu (avatar nam này không có file opacity) |
| C4 | `Sports_Female_02.fbx` | https://github.com/microsoft/Microsoft-Rocketbox/tree/master/Assets/Avatars/Professions/Sports_Female_02 | https://raw.githubusercontent.com/microsoft/Microsoft-Rocketbox/master/Assets/Avatars/Professions/Sports_Female_02/Export/Sports_Female_02.fbx | FBX | 0,60 | ≈ 8–9k (đo sau) | MIT | Lưới + rig nữ |
| C5 | `f013_body_color.tga` | như trên | …/Sports_Female_02/Textures/f013_body_color.tga | TGA 2048² | 12,58 | – | MIT | Texture thân |
| C6 | `f013_head_color.tga` | như trên | …/Sports_Female_02/Textures/f013_head_color.tga | TGA 2048² | 12,58 | – | MIT | Texture đầu |
| C7 | `f013_opacity_color.tga` | như trên | …/Sports_Female_02/Textures/f013_opacity_color.tga | TGA 2048² RGBA | 16,78 | – | MIT | Tóc / mi (alphaTest) |

**Cộng: 7 file, 68,24 MB.**

Cặp hoodie (thay thế hoặc thêm, cùng cấu trúc thư mục `Assets/Avatars/Adults/<tên>/`):
- `Male_Adult_17.fbx` 0,50 MB, `m022_body_color.tga` 12,58, `m022_head_color.tga` 12,58;
- `Female_Adult_12.fbx` 0,61 MB, `f012_body_color.tga` 12,58, `f012_head_color.tga` 12,58, `f012_opacity_color.tga` 16,78;
- cộng 7 file, 68,21 MB.

Tùy chọn: thêm `*_body_normal.tga` + `*_head_normal.tga` (12,58 MB mỗi file) để nhìn gần đẹp hơn. Thêm 4 file, 50,33 MB mỗi cặp.

Sau xử lý dự kiến:
- `player.glb` gồm 2 nhân vật, mỗi nhân vật 1 atlas WebP 2048² (hoặc 1024²): khoảng 1,5–2,5 MB;
- `player-anims.glb` với clip `m_*` / `f_*`: khoảng 0,8 MB;
- dưới 3 MB mỗi nhân vật.

### Các bước làm

1. **`scripts/process-assets.ts`**
   - Tách phần đọc avatar Rocketbox trong `npcPeds()` (`readFbxAvatar`, ghép atlas, ×0,01, kiểm inverse bind) thành một hàm dùng chung `rocketboxMesh(avatar, {lods})` để không chép code.
   - Nam không có file opacity: ô atlas để đen và material không cắt alpha.
   - **Đổi tên xương Bip01 sang tên UE** bằng một bảng `BIP_TO_UE`, ví dụ:
     - `Bip01_Pelvis→pelvis`;
     - `Bip01_Spine / Spine1 / Spine2→spine_01 / 02 / 03`;
     - `Bip01_Neck→neck_01`, `Bip01_Head→head`;
     - `Bip01_L_Clavicle / UpperArm / Forearm / Hand→clavicle_l / upperarm_l / lowerarm_l / hand_l`;
     - `Bip01_L_Thigh / Calf / Foot / Toe0→thigh_l / calf_l / foot_l / ball_l`;
     - ngón tay sang `thumb_ / index_ / middle_ / ring_ / pinky_0n_l`.
     - Nhờ vậy `OUTFIT_BONES`, tay vẫy, IK đạp xe và `trunk` trong `Animation.ts` **giữ nguyên**. Xương mặt giữ nhưng không có track.
   - Target mới `player`: 2 node gốc `player_m` / `player_f` (extras `gender`, `height`) trong một file. Mục `UBC` cũ giữ lại sau cờ để quay về được.
   - **`playerAnims()` retarget thật**:
     - với mỗi rig (nam, nữ) và mỗi clip UAL, lấy mẫu từng khung;
     - với mỗi cặp xương, tính delta quay world của nguồn so với tư thế nghỉ của nguồn, đặt lên tư thế nghỉ world của đích, rồi đổi về local;
     - cần căn tư thế nghỉ trước: UBC / UAL so với Rocketbox (tư thế chữ A);
     - dịch chuyển hông scale theo tỉ lệ chiều cao hông như hiện nay;
     - ghi clip `m_Idle_Loop`…, `f_Idle_Loop`… như `npc-ped-anims`.
   - Kiểm tra tự động: số xương khớp bảng, không xương nào thiếu, và chân không xuyên đất ở `Idle_Loop` frame 0 (assert).
2. **Client**
   - `config.ts` `character`: `models: { m: 'player_m', f: 'player_f' }`.
   - `CharacterModel` clone đúng node theo giới tính. `Animation` nhận `clipMap` có tiền tố `m_` / `f_` (tham số này đã có sẵn).
   - Màu đội trên quần áo có texture: shader đổi từ "thay màu" sang `mix(tex, luma(tex) × team, mask.shirt)` để giữ nếp vải. Quần / giày giữ texture gốc (bỏ tô `pants` / `shoes`), hoặc anh chọn tô cả quần (câu hỏi 4).
3. **Giao thức (PROTOCOL_VERSION 9 → 10)**
   - `TeamInfo.avatar?: 'm' | 'f'` (không có = `'m'`, tương thích dữ liệu cũ).
   - Tin client → server `{t:'avatar', v}`, hoặc gửi kèm lúc vào game.
   - DO: thêm cột `avatar` vào bảng đội (DEFAULT `'m'`), ghi SQLite **trước khi** trả lời, rồi phát lại qua tin `team` như `racing`. Mỗi lần đổi chỉ tốn 1 dòng ghi, không ảnh hưởng hạn mức.
   - Thêm test codec.
4. **Menu**: trong `Esc` → Cài đặt thêm dòng **"Nhân vật: Nam / Nữ"**, lưu `settings.ts` (localStorage). Trong race thì gửi lên server. Offline chỉ đổi tại máy. Host thấy biểu tượng nam / nữ trong "Các đội" (tùy chọn).
5. **Ghi nguồn**
   - Thêm mục manifest `rocketbox-player`, sinh dòng `credits.json`: `Người chơi (nhân vật): "Microsoft Rocketbox Avatar Library" (Sports_Male_04, Sports_Female_02) – © 2020 Microsoft, MIT, qua GitHub (đã chỉnh sửa)`.
   - `LICENSE-rocketbox.md` đã có trong `client/public/models/`.
   - Dòng UBC bỏ nếu không còn dùng. Dòng UAL (CC0) giữ.
6. **Kiểm tra**
   - `npm run screenshot p3` + preset mới `p3-player-f` (nhìn PNG: đi, chạy, nhảy, bơi, đạp xe, mở hộp, ăn mừng).
   - `npm run ride-check` (IK đạp xe dùng tên xương mới).
   - `npm run build && npm test`.

**Ước lượng công sức:** khoảng 3–4 ngày công.
- Xử lý mesh: 0,5 ngày.
- Retarget + chỉnh mắt: 1,5–2 ngày.
- Shader màu đội: 0,5 ngày.
- Giao thức + menu + DO: 0,5–1 ngày.

**Phương án nhanh (số 2):** thêm `Superhero_Female` + `Hair_Long` vào pipeline hiện tại.
- Khoảng 0,5–1 ngày, không tải gì.
- Bước 3–5 làm giống như trên.
- Nhưng ngoại hình gần như không đổi.

## (c) Đã loại

| Nguồn | Lý do (kiểm 2026-10-06) |
|---|---|
| Quaternius Modular Character Outfits – Fantasy (CC0) | Chỉ có đồ fantasy (bản miễn phí: Ranger, Peasant), không hợp phố Macao |
| Quaternius Animated Men / Women (CC0, ≈ 1,2k tam giác) | Quá đơn giản cho nhân vật chính |
| KayKit Adventurers (CC0) | Dáng đồ chơi, nhân vật fantasy (Knight, Mage…) |
| Kenney Animated Characters (CC0) | Khối vuông kiểu đồ chơi (trang asset hôm nay trả 404) |
| Low Poly People – davidjalbert (CC-BY 4.0) | ≈ 1 200 tam giác, màu palette 64×64, không có animation |
| 100Avatars / Open Source Avatars (VRM, CC0) | Phong cách hoạt hình / NFT, không bán thực tế |
| VRoid Studio mẫu CC0 (OpenGameArt) | Phong cách anime. Mẫu A–C có điều kiện riêng |
| Ready Player Me | **Đã đóng cửa 2026-01-31** sau khi Netflix mua (12/2025) |
| Avaturn | Cần tài khoản; trang điều khoản trả 404, không xác minh được giấy phép |
| Sketchfab CC0 / CC-BY | Mọi bản tải đều cần đăng nhập. Phải duyệt từng mẫu nếu anh đồng ý đăng nhập |
| CharMorph | Chỉ thân Vitruvian là CC0 (Antonia / Reom CC-BY, MB-Lab AGPL), phải dựng trong Blender |
| Mesh2Motion (code MIT, animation CC0) | Là công cụ auto-rig, không có nhân vật sẵn. Chỉ hữu ích nếu tìm được một mẫu chưa rig |
| UE5 Manny / Quinn | EULA Unreal chỉ cho dùng trong Unreal Engine |
| itch.io CC0 lẻ (plewr, barnabe-wild, titaniumrat42, PSX…) | Chất lượng thấp hoặc phong cách PSX, thường chỉ có nam |
| Synty POLYGON City Characters (trả phí) | Chú thích: đẹp, đồ phố hiện đại, nhưng EULA cấm phát tán file gốc. Web game gửi GLB tới trình duyệt cần đọc kỹ EULA trước khi mua |

## (d) Câu hỏi cho anh

1. Chọn **Rocketbox** (bán thực tế, giống phong cách NPC) hay giữ **Quaternius UBC** (thêm nữ nhanh nhưng vẫn dáng siêu anh hùng)?
2. Cặp nào: **thể thao** (`Sports_Male_04` / `Sports_Female_02`), **hoodie** (`Male_Adult_17` / `Female_Adult_12`), hay **cả hai** (4 lựa chọn, thêm 68 MB tải, khoảng 1 MB build)?
3. Ai chọn nhân vật: **từng đội trong menu** hay **Host gán**? Có cho đổi giữa cuộc đua không?
4. Màu đội: tô **áo** (giữ nếp vải) hay tô **cả áo + quần**? Hay chỉ dùng **dải / áo bib màu đội** để giữ nguyên quần áo gốc?
5. Có tải thêm **normal map** (+50 MB mỗi cặp) để nhìn gần đẹp hơn không?
6. Anh có chấp nhận nguồn **cần đăng nhập** (Mixamo, Sketchfab) hoặc **trả phí** (UBC Source 19,99 USD, Synty) không? Nếu có thì em research thêm mẫu cụ thể.
