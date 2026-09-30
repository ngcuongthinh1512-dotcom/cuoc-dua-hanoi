# Phase 3 – Nhân vật & camera: kế hoạch

SPEC §5, §6.1, §6.3, §14, §15 mục 3, §17.1–17.2, §17.5, §17.7; `docs/STYLE_GUIDE.md` mục Camera; `docs/plans/phase2b-assets.md` §3.3.

## 1. Phạm vi

- **Có trong Phase 3:**
  - Người chơi là nhân vật có skeleton: thân Universal Base Characters (UBC) + clip Universal Animation Library (UAL), áo màu đội, bảng tên trên đầu.
  - Hoạt ảnh: idle, đi chậm, đi chuẩn (jog), nhảy (bắt đầu / trên không / tiếp đất), rơi, bơi, mở hộp, ăn mừng, vẫy tay, ngã xe (chạy thử bằng `?action=crash`).
  - Rapier KinematicCharacterController: bậc ≤ 0,4 m, dốc ≤ 45°, nhảy, rơi, đi chậm (Shift / LB), WASD theo hướng camera + stick trái, thân xoay theo hướng đi kiểu GTA.
  - Bơi ở sông Seine và leo lên kè; spawn / respawn an toàn; nội suy tư thế giữa hai bước vật lý.
  - Collider mỏng cho đèn đường / cột Morris / lối vào metro; nút gamepad.
  - Camera góc thứ ba kiểu GTA: spring arm sau vai, chống xuyên tường, mượt, tự quay về sau lưng, `C` đổi chế độ, FOV tăng nhẹ theo tốc độ, có hook "xe đạp: xa + cao hơn".
  - Camera bay tự do vẫn giữ cho khán giả / debug.
- **Không có trong Phase 3:** xe đạp, `build-graph`, NPC, HUD, mạng. Xem mục 9.

## 2. Asset: kết quả kiểm tra và quyết định

Thư mục gốc là `.cache/assets/` của **cây chính** (gitignored; worktree không có, nên chạy `npm run process-assets -- --assets "<cây chính>/.cache/assets"`). Không tải thêm file nào.

| Dùng | File | Nội dung đã kiểm tra |
|---|---|---|
| Thân | `Universal Base Characters[Standard]/…/Base Characters/Godot - UE/Superhero_Male_FullBody.gltf` + `.bin` + PNG cùng thư mục | 3 mesh skinned chung skin `Armature`, 65 joint tên UE (`root pelvis spine_01…03 neck_01 Head clavicle_l upperarm_l lowerarm_l hand_l …_04_leaf_l thigh_l calf_l foot_l ball_l ball_leaf_l`): `SuperHero_Male` 12 566 tam giác (`MI_Superhero_Male`: base `T_Superhero_Male_Dark.png`, normal, roughness, đều 2048²), `Eyes` 768 (`MI_Eyes`), `Eyebrows` 984 (`MI_Hair_1`). Cao 1,81 m, y lên, **mặt hướng +Z**, đơn vị mét. `COLOR_0/1` toàn trắng, `TEXCOORD_1…3` thừa. Normal map ở đây là bản OpenGL, cùng kích thước file với `Textures/Normals Unity - Godot/`, nên dùng đúng cho glTF. |
| Tóc | `…/Hairstyles/Rigged to Head Bone/glTF (Godot -Unreal)/Hair_SimpleParted.gltf` | 1 301 tam giác, `MI_Hair_1`, cùng 65 joint `Armature`. |
| Clip | `universal_animation_librarystandard/Animation Library[Standard]/Godot/AnimationLibrary_Godot_Standard.glb` (6,7 MB) | 46 clip, skin `Rig` 53 joint tên Rigify `DEF-*` (`DEF-hips DEF-spine.001… DEF-thigh.L DEF-shin.L DEF-foot.L DEF-toe.L …`), mỗi clip 159 kênh (T/R/S × 53), 30 fps, LINEAR. Clip in-place: chỉ `DEF-hips` có translation thay đổi (trừ `*_RM`), không có kênh scale thay đổi. |
| Không dùng | `AL_Standard.fbx` (UE, 24,9 MB), bản Unity FBX, thân Female, tóc khác | Máy không có Blender / FBX2glTF; bản FBX không cần (xem dưới). |

**Lỗi trong file gốc:** `Superhero_Male_FullBody.gltf` trỏ tới `T_Hair_1_Normal_png.png` và `T_Eye_Normal_png.png`, nhưng hai file này không có. File thật là `T_Hair_1_Normal.png` và `T_Eye_Normal.png` cùng thư mục. Script phải đọc JSON, sửa `images[].uri`, rồi mới gọi `NodeIO.readJSON`.

**Không cần retarget (không dùng `SkeletonUtils.retargetClip`):**
- Không có cặp glTF nào chung tên xương. UBC glTF dùng tên UE, còn UAL GLB dùng `DEF-*`.
- Hai rig có cùng cây xương và cùng quy ước trục xương. Cả hai xuất từ Blender, gốc `root` quay −90° quanh X, và quaternion nghỉ chỉ lệch 1–6° (ví dụ `thigh_l` [0.990, 0, 0, 0.142] so với `DEF-thigh.L` [0.992, 0, 0, 0.122]).
- Vì vậy chỉ cần **đổi tên xương lúc build**: ghép 53 joint của `Rig` theo thứ tự với 65 joint của UBC sau khi bỏ `*_leaf`. Assert chuỗi cha của từng cặp phải khớp.
- Clip giữ **rotation** của mọi xương trừ `root`, và giữ **translation** chỉ của `pelvis`. Bỏ mọi translation khác (tỉ lệ xương là của UBC) và mọi kênh scale.
- Translation của `pelvis` nhân với tỉ số độ cao hông lúc nghỉ, UBC `pelvis` z 0,9491 / UAL `DEF-hips` z 0,9167 ≈ 1,035. Tính từ dữ liệu, không hard-code. Nhờ vậy chân không lơ lửng với chân UBC dài hơn.

**Áo màu đội:**
- UBC gần như không mặc gì: da + quần lót đen trong texture. Không có vertex color hay mesh áo riêng.
- Vì vậy dựng **mask trang phục từ trọng số skin**, tính một lần cho mỗi asset (geometry dùng chung giữa các bản clone):
  - áo = Σ trọng số của `spine_01…03`, `clavicle_*`, `upperarm_*` (tay áo tới khuỷu);
  - quần = Σ của `pelvis`, `thigh_*`, `calf_*`;
  - giày = Σ của `foot_*`, `ball_*`.
- Shader (`onBeforeCompile`, một chương trình dùng chung, uniform màu riêng cho từng bản) trộn màu áo đội / `character.outfit.pants` / `shoes` theo smoothstep quanh 0,5. Da, mặt, tay giữ texture.
- Hướng nâng cấp: mesh áo riêng hoặc Rocketbox (MIT, phải duyệt riêng).

**Xử lý (Track A, `scripts/process-assets.ts`):**
- `player.glb`: thân + mắt + lông mày + tóc (tóc gắn vào skin của thân).
  - Bỏ `COLOR_*` và `TEXCOORD_1…3`.
  - Texture → WebP 1024² (base + normal của thân và tóc; mắt 256²). Bỏ texture roughness, dùng factor.
  - weld, prune, meshopt. **Ước tính ≤ 1,5 MB** (khoảng 14,6 nghìn tam giác).
- `player-anims.glb`: chỉ cây node `root → pelvis → …` (tên UE) + 15 clip, không mesh.
  - `resample()`, meshopt. **Ước tính 0,2–0,4 MB.**
  - `GLTFLoader` sinh track dạng `pelvis.position` / `thigh_l.quaternion`. Track gắn theo tên node lên bản `SkeletonUtils.clone` của `player.glb`.
- `credits.json`: đã có dòng UBC và UAL (từ `manifest.json`). Thêm hai tên vào `MODIFIED` nếu định dạng attribution cho phép; đây là CC0 nên không bắt buộc ghi.

**15 clip giữ lại → thao tác (SPEC §5, bảng §3.3):**

| AnimState | Clip | Ghi chú |
|---|---|---|
| `idle` | `Idle_Loop` (2,50 s) | |
| `walk` (moveMode `slow`, 1,4 m/s) | `Walk_Loop` (1,33 s) | timeScale = tốc độ / tốc độ gốc của clip |
| `jog` (moveMode `walk` = footSpeed 4 m/s) | `Jog_Fwd_Loop` (0,93 s) | chỉ có hướng tiến → thân xoay theo hướng đi |
| `jumpStart` / `air` / `land` | `Jump_Start` (1,33) / `Jump_Loop` (2,50) / `Jump_Land` (1,27) | `air` dùng cả cho rơi (clip rơi của UAL là bản trả phí); `land` chỉ lấy đoạn đầu |
| `swimIdle` / `swimFwd` | `Swim_Idle_Loop` (3,33) / `Swim_Fwd_Loop` (1,33) | |
| `openBox` | `Interact` (2,00) | |
| `pickUp` | `PickUp_Table` (0,83) | nhặt vật bằng `F` (Phase 7–8) |
| `celebrate` | `Dance_Loop` (1,00) | thay cho `Celebration` (bản trả phí) |
| `wave` (`G`) | lớp tay phải bằng code, `Idle_Talking_Loop` (2,93) làm dự phòng | sau `mixer.update`: nâng `upperarm_r`, lắc `lowerarm_r`, có trọng số fade; vẫy được cả khi đang đi |
| `crash` | `Hit_Chest` (0,33) → `Death01` (2,40, giữ ở tư thế nằm) → đứng dậy | tổng `playerSetup.actions.crash` 3,5 s = ngã + 2 s nằm (§6.3) + đứng dậy (Death01 chạy ngược hoặc crossfade về idle) |
| `climbOut` | `Jump_Land` | controller nâng người lên kè trong 1,2 s |
| `talk` | `Idle_Talking_Loop` | NPC dẫn chương trình Pit Stop (Phase 7) |
| `cycle` | `Driving_Loop` (1,67) | Phase 4: tư thế ngồi + IK 2 xương cho chân theo góc crank |

Bỏ các clip khác: không có chạy nước rút (§6.1), không có vũ khí.

## 3. Package

**Không cài gì.** `GLTFLoader`, `MeshoptDecoder`, `SkeletonUtils`, `CapsuleGeometry` có sẵn trong `three`. Script dùng `@gltf-transform/*`, `meshoptimizer`, `sharp`, đều đã có. Rapier 0.21 có `createCharacterController`, `castShape`, `castRay`.

## 4. Nền đã commit (foundation)

| File | Nội dung |
|---|---|
| `client/src/player/types.ts` | Hợp đồng: `MoveMode`, `PlayerAction`/`Gesture`, `PlayerState`, `MoveIntent`, `PlayerEnv`, `CameraTarget`. Muốn sửa phải qua người tích hợp. |
| `client/src/player/Player.ts` | Ghép model + animator + controller + camera. Có `parseOverrides(URLSearchParams)` cho `?player[=x,z,yawDeg]&camMode&orbit&action&autoMove`. Thứ tự: `fixedUpdate` (trước `world.step()`) → `update(dt, input \| null, alpha)`. Nhân vật đứng yên tới `activate()`, tức khi thế giới đã tải xong và collider quanh điểm spawn đã có. |
| `client/src/main.ts` | Có `?player` thì vào chế độ nhân vật, không có thì bay tự do như cũ. Chunk và collider stream theo **vị trí nhân vật**. `?wait=` (mặc định `playerSetup.readyWait`) là số giây mô phỏng trước khi đặt `__READY__`. Bấm `V` khi bảng debug đang mở để chuyển nhân vật ⇄ bay tự do; lúc bay, thân nhân vật đứng yên tại chỗ. Bảng F3 thêm dòng "Nhân vật: …". |
| `client/src/core/Input.ts` | `isDown` / `wasPressed` nhận cả nút gamepad (`padButtons` trong config: A nhảy, X tương tác, Y sổ mật thư, LB đi chậm, View đổi camera, Menu menu, L3 bay nhanh, D-pad ↑ bản đồ / ↓ ống nhòm / ← vẫy tay / → chuông). |
| `client/src/core/GameLoop.ts` | `alpha` = accumulator / fixedDt. |
| `client/src/config.ts` | Khối Phase 3 ở cuối file: `movement`, `playerSetup` (foundation); `character` (A); `player`, `swim` (B); `thirdPersonCamera` (C). Thêm `keys.flyToggle = ['KeyV']` và `padButtons`. |
| Stub | `CharacterModel.ts` (capsule màu áo), `Animation.ts` (chỉ `mixer.update`, có bảng `UAL_CLIPS`), `CharacterController.ts` (trượt trên lưới địa hình; `readMoveIntent`, `moveDirection`, `yawOf`, `tickAction` là bản thật, có test), `ThirdPersonCamera.ts` (cần cứng sau lưng). Mỗi track thay stub của mình và **giữ nguyên chữ ký export**. |
| `scripts/screenshot.ts` | Preset `p3-*` (mục 7); chạy `npm run screenshot -- p3` để chụp cả nhóm. |
| `client/index.html` | Bảng hướng dẫn phím cho chế độ nhân vật / bay. |

**Quy ước:**
- `yaw` = 0 là hướng bắc (−Z), số dương là quay trái (−X). Giống `FreeFlyCamera`.
- `PlayerState.position` là vị trí bàn chân.
- Model glTF hướng +Z, nên `CharacterModel.setPose` phải cộng π.
- Tốc độ lấy từ `movement.footSpeed` × `slowWalkFactor` × `swim.speedFactor`; không hard-code ở nơi khác (file chặng sẽ ghi đè `movement`).

## 5. Interface (chữ ký export mà các track phải giữ)

```ts
// types.ts (chi tiết trong file)
interface PlayerState { position: Vector3 /* feet */; velocity: Vector3; yaw: number; grounded: boolean; inWater: boolean;
  moveMode: 'walk' | 'slow' | 'swim' | 'air'; jumps: number /* +1 per take-off */; action: PlayerAction; actionTime: number }
interface MoveIntent { forward: number; right: number /* |·| ≤ 1 */; cameraYaw: number; slow: boolean; jump: boolean /* latched */ }
interface PlayerEnv { heightAt(x, z): number /* carved grid */; waterLevel: number | null; water: WaterData | undefined }
interface CameraTarget { position: Vector3 /* feet, interpolated */; yaw: number; speed: number; moveMode: MoveMode;
  vehicle: 'foot' | 'bike'; collider?: RAPIER.Collider /* excluded from the camera cast */ }

// A · CharacterModel.ts
interface CharacterAsset { scene: Object3D; clips: readonly AnimationClip[] }
function loadCharacterAsset(url = character.modelUrl, clipsUrl = character.clipsUrl): Promise<CharacterAsset>
class CharacterModel { root: Group /* origin = feet */; mixer: AnimationMixer; clips: readonly AnimationClip[];
  constructor(asset, { shirt: ColorRepresentation, name?: string | null }); setShirt(c); setName(text | null);
  setPose(feet: Vector3, yaw: number); dispose() }
// A · Animation.ts
type AnimState = 'idle' | 'walk' | 'jog' | 'jumpStart' | 'air' | 'land' | 'swimIdle' | 'swimFwd' | 'openBox' | 'pickUp'
  | 'celebrate' | 'wave' | 'crash' | 'climbOut' | 'talk' | 'cycle';
const UAL_CLIPS: Partial<Record<AnimState, string>>;
class CharacterAnimator { state: AnimState; constructor(model: CharacterModel, clipMap = UAL_CLIPS); update(p: Readonly<PlayerState>, dt) }

// B · CharacterController.ts
function newIntent(): MoveIntent; function readMoveIntent(input, cameraYaw, out): MoveIntent;
function moveDirection(i: MoveIntent): [dx, dz]; function yawOf(dx, dz): number; function tickAction(s, dt): boolean /* locked */
class CharacterController { state: PlayerState; collider: RAPIER.Collider | undefined;
  constructor(world: RAPIER.World, env: PlayerEnv); spawn(x, z, yaw); fixedUpdate(dt, intent) /* consumes intent.jump */;
  renderPosition(alpha, out: Vector3): Vector3; startAction(a: Gesture): boolean }

// C · ThirdPersonCamera.ts
type CameraMode = 'near' | 'far' | 'first';
class ThirdPersonCamera { yaw: number; pitch: number; mode: CameraMode; constructor(camera: PerspectiveCamera, world: RAPIER.World);
  look(input, dt); cycleMode(); update(dt, target: CameraTarget) }
```

Một track được thêm export hoặc file mới trong phần của mình (hàm thuần để test, `player/Swim.ts`…). Không được đổi hay xóa những gì đã liệt kê ở trên.

## 6. Ba track: file sở hữu và việc cần làm

Worktree `"<root>/.claude/worktrees/p3-<a|b|c>"`, nhánh `p3/<a|b|c>`, tạo từ commit nền. Mỗi worktree chạy `npm ci --prefer-offline`. Cổng screenshot: A `SCREENSHOT_PORT=5181`, B `5182`, C `5183`.

**Quy tắc chung:**
- Chỉ sửa file của mình, và trong `config.ts` chỉ sửa khối của mình (không thêm import).
- Không sửa `TODO.md`, `main.ts`, `Player.ts`, `types.ts`, `screenshot.ts`, `index.html`, `docs/SPEC.md`. Riêng tọa độ trong dòng preset của mình thì được sửa.
- Việc còn dở ghi vào báo cáo để người tích hợp cập nhật `TODO.md`.
- `npm run build && npm test` phải qua. Tối đa 4 vòng screenshot → sửa. Tắt mọi vite / chrome đã bật.

### Track A – asset + animation

**File:**
- `scripts/process-assets.ts` (thêm `player()` và `playerAnims()`, chưa đụng tới eiffel / arc);
- `client/public/models/player.glb`, `client/public/models/player-anims.glb`, `client/public/credits.json` (do script sinh ra);
- `client/src/player/CharacterModel.ts` (+ `.test.ts`), `client/src/player/Animation.ts` (+ `.test.ts`);
- khối `character` trong config.

**Việc cần làm:**
- **Script:** theo mục 2. Có assert: tên xương khớp, đủ 15 clip, không còn tên `DEF-`, mỗi file ≤ 25 MB (và ≤ ngân sách mục 2). In ra số tam giác và dung lượng.
- **`loadCharacterAsset`:**
  - `GLTFLoader` + `MeshoptDecoder` (xem `world/landmarks/models.ts`) tải hai file một lần.
  - Thiếu file hoặc lỗi thì `console.warn` và dùng capsule tạm (như stub). Game vẫn chạy, và screenshot không fail vì `console.error`.
  - Tính mask trang phục một lần cho mỗi geometry.
- **`CharacterModel`:**
  - `SkeletonUtils.clone`; material clone cho từng bản, chung một shader, uniform màu áo.
  - `castShadow`; `frustumCulled = false` cho SkinnedMesh (bounding box lúc nghỉ bị lệch khi animation chạy), hoặc tính lại bounding sphere.
  - Bảng tên: Sprite + CanvasTexture (tiếng Việt có dấu), gắn cố định ở `root` ngay trên đầu (không nhún theo xương), ẩn khi xa hơn `nameTag.maxDistance`.
  - Xoay π cho model hướng +Z.
  - Dùng lại được cho người chơi khác (Phase 6) và người đi đường (Phase 4B, clip riêng qua `clipMap`).
- **`CharacterAnimator`:**
  - Máy trạng thái chạy trên `PlayerState` (hàm thuần `pickState`, có test).
  - Crossfade `character.fade`.
  - Khớp tốc độ phát với tốc độ đi để chân không trượt: timeScale = tốc độ ngang / tốc độ gốc của clip. Tốc độ gốc đo một lần từ clip (quãng đường bàn chân khi chạm đất trong một chu kỳ) hoặc ghi thành hằng trong `character`.
  - `jumps` tăng thì chạy `jumpStart` → `air`; hết `air` thì `land` ngắn.
  - Gesture theo `action` / `actionTime`; vẫy tay là lớp code chồng lên (mục 2).
  - `state` công khai để debug.
- **Test:**
  - mask: trọng số một xương áo → áo = 1, quần = 0;
  - `pickState` cho mọi moveMode / action, và jump vs fall;
  - timeScale tỉ lệ với tốc độ;
  - (scripts) file anims: mọi track trỏ tới tên xương có trong player.glb, tổng khoảng 15 clip.
- **Screenshot:** `p3-idle`, `p3-face`, `p3-jog`, `p3-slow`, `p3-wave`, `p3-openbox`, `p3-celebrate`, `p3-crash` (thêm `p3-swim` sau khi merge B). Chấm đạt khi:
  - áo đúng màu đội, quần sẫm, da còn texture;
  - tóc nằm đúng trên đầu;
  - bảng tên đọc được;
  - không có tư thế chữ T;
  - chân chạm đất (không lơ lửng / lún).

### Track B – controller + bơi

**File:**
- `client/src/player/CharacterController.ts` (+ `.test.ts`, giữ các test nền);
- file mới `client/src/player/Swim.ts` (+ test) nếu cần;
- `client/src/world/StreetProps.ts` (chỉ phần `colliders`) (+ test);
- khối `player` và `swim` trong config;
- dòng preset `p3-swim` / `p3-bridge` (chỉ tọa độ).

**Việc cần làm:**
- **Capsule và controller:**
  - Capsule `player.radius` / `height` trên rigid body `kinematicPositionBased`. `world.createCharacterController(player.skin)`: `enableAutostep(maxStep, minStepWidth, false)`, `setMaxSlopeClimbAngle` / `setMinSlopeSlideAngle(45°)`, `enableSnapToGround(snapToGround)`, slide bật.
  - Mỗi bước: `computeColliderMovement` → `setNextKinematicTranslation`, rồi main gọi `world.step()`.
  - `grounded = computedGrounded()`.
- **Di chuyển:**
  - Vận tốc ngang tiến tới `moveDirection(intent)` × `footSpeed` (× `slowWalkFactor` khi đi chậm, × `swim.speedFactor` khi bơi) với gia tốc `accel`, trên không nhân thêm `airControl`.
  - Trọng lực `physics.gravity`. Nhảy chỉ khi đang trên đất: `vy = jumpSpeed`, `jumps++`.
  - `moveMode`: `swim` khi đang bơi; `air` khi đã nhảy, hoặc rời đất quá `fallDelay`; còn lại `slow` / `walk`.
  - Thân xoay dần về `yawOf(vận tốc)` với tốc độ `turnRate`; không xoay khi action đang khóa.
  - `tickAction` khóa WASD theo `playerSetup.actions`.
- **Bơi:**
  - Có sông khi `env.heightAt(x, z) < waterLevel − 1`: lòng sông đã khoét tới level − `terrain.riverDepth`. Không cần test đa giác; muốn chính xác hơn thì dùng `env.water`.
  - Chân thấp hơn mặt nước quá `swim.enterDepth` → `swim`: bỏ trọng lực, lò xo `buoyancy` kéo về chân = level − `floatDepth`, không nhảy được.
  - **Lên bờ:**
    - Cầu thang OSM (`highway=steps`, 1 431 đoạn trong chunk) chỉ xuống tới bến thấp.
    - Bến thấp chưa được khoét (xem ponytail trong `carveRiver`), nên trong game tường kè cao khoảng 7 m + 1 m lan can dựng thẳng từ mặt nước.
    - Vì vậy chọn **leo kè ở bất kỳ đâu**: khi đang bơi, tường kè (collider trimesh `quayMesh`) cách ≤ `climbReach` theo hướng mặt và người chơi bấm `Space` → `startAction('climbOut')`.
    - Controller đưa người lên mặt đá kè phía sau lan can (cast ray xuống từ trên cao để tìm), trong `playerSetup.actions.climbOut`.
    - Ghi chú `// ponytail:` "leo ở mọi chỗ; khi khoét bến thấp thì chỉ cho lên ở cầu thang / dốc OSM".
  - `inWater` = đang ở trên sông và chân dưới mặt nước.
- **Spawn / respawn:**
  - Cast ray xuống từ `heightAt + 12` m, lệch 1 mm để không trượt qua đường lưới heightfield (hoặc dùng shape cast). Chọn mặt đi được cao nhất: mặt cầu thắng lòng sông. Nếu capsule chồng lên collider thì tìm xoắn ốc tới 20 m.
  - Spawn trên sông mà không có cầu → nổi ở độ cao bơi.
  - Lưu `lastSafe` mỗi giây khi đang trên đất và không ở dưới nước. Khi `y < respawnBelow` hoặc chân thấp hơn `heightAt − 2` → về `lastSafe`.
- **Nội suy:** giữ vị trí `prev` / `curr`; `renderPosition` = lerp theo alpha.
- **Collider đồ đường phố:** thêm trụ mỏng (lăng trụ 6 cạnh gộp thành một `TriMesh` cho mỗi chunk) cho đèn, cột Morris, lối vào metro. Kích thước ghi trong khối `props` (B được thêm key `props.collider…` vào đúng khối đó).
- **Test (Rapier thật trong Node, như `Terrain.test.ts`):**
  - tốc độ đi chuẩn = `footSpeed` ±2 %, đi chậm = × factor;
  - bậc 0,35 m lên được, 0,5 m thì chặn;
  - dốc 40° lên được, 50° thì không;
  - đỉnh nhảy ≈ jumpSpeed² / 2g;
  - rơi → `air`;
  - bơi nổi đúng độ cao và đúng tốc độ; leo kè ra khỏi nước;
  - spawn trên mặt cầu; respawn;
  - `renderPosition` ở alpha 0,5 nằm giữa hai bước;
  - collider đồ đường phố được sinh ra.
- **Screenshot:** `p3-jog` (đi thẳng trên phố, không xuyên nhà), `p3-swim`, `p3-bridge` (đứng trên mặt cầu, không rơi xuống sông), `p3-debug`.

### Track C – camera

**File:** `client/src/player/ThirdPersonCamera.ts` (+ `.test.ts`), khối `thirdPersonCamera` trong config, dòng preset `p3-wall` (chỉ tọa độ). `FreeFlyCamera.ts` chỉ sửa khi thật cần.

**Việc cần làm:**
- **Vị trí:**
  - pivot = chân + `pivot` (+ `bike.pivotAdd` khi `vehicle === 'bike'`) + vector phải × `shoulder`.
  - Camera đặt ở pivot − forward(yaw, pitch) × `distance` (× `bike.distanceScale`).
  - Nhìn theo `yaw` / `pitch` (YXZ như FreeFly).
- **Chống xuyên:**
  - `world.castShape` bóng `collisionRadius`, từ trục capsule tới pivot rồi từ pivot lùi ra sau. Tham số `filterExcludeCollider = target.collider`.
  - Cần camera rút ngắn ngay khi chạm, dài ra lại thì mượt.
  - Chọn `camera.near = thirdPersonCamera.nearPlane` trong chế độ nhân vật.
- **Mượt:** pivot bám theo mũ (exponential) với `followSharpness`. Kẹp pitch trong `pitchDeg`. Nhận chuột + stick phải.
- **Tự quay về sau lưng:** đang di chuyển và không chạm chuột / stick quá `recenter.delay` giây → yaw quay về `target.yaw` với tốc độ `recenter.rate`.
- **FOV:** `render.fov` + min(`max`, `perMps` × tốc độ), có làm mượt.
- **Chế độ và bố cục:**
  - `cycleMode` near → far → first (ngôi thứ nhất: ở mắt, `Player.ts` ẩn thân).
  - Bố cục theo STYLE_GUIDE: nhân vật ở giữa, chân ở khoảng 1/3 dưới, người cao khoảng 1/3 khung; nhìn thẳng thì đường chân trời ở 40–45 % chiều cao.
- **Bay tự do:** đã nối ở foundation (`V` khi bảng debug mở; không dùng Ctrl / Alt / Cmd / F-key, đúng §17.1). C kiểm tra lại và ghi phím vào báo cáo cho README.
- **Test (Rapier thật):**
  - tường sau pivot → camera luôn nằm trước tường ít nhất bằng bán kính;
  - không có tường → đủ `distance`;
  - kẹp pitch; thứ tự `cycleMode`;
  - tự quay về sau lưng sau `delay`;
  - FOV tăng theo tốc độ và dừng ở `max`;
  - ngôi thứ nhất ở độ cao mắt;
  - `bike` xa hơn và cao hơn.
- **Screenshot:** `p3-idle`, `p3-far`, `p3-first`, `p3-wall`, `p3-jog`.

## 7. Screenshot preset (`npm run screenshot -- p3` hoặc từng tên)

Tham số URL (chạy cả ở bản prod; Phase 6 sẽ bỏ qua khi đang trong cuộc đua):
- `?player[=x,z,yawDeg]`: vị trí chân (mặc định là spawn ở Concorde, cách obelisk 14 m về phía Khải Hoàn Môn, §17.4);
- `camMode=near|far|first`;
- `orbit=<°>`: yaw camera so với sau lưng; 180 = nhìn mặt;
- `action=wave|openBox|celebrate|crash|climbOut`;
- `autoMove=walk|slow`: giữ phím tiến;
- `wait=<s>`: số giây mô phỏng trước `__READY__`.

| Preset | URL | Chủ | Đạt khi |
|---|---|---|---|
| `p3-idle` | `/?player` | A, C | idle, camera sau vai 3–4 m, horizon 40–45 % |
| `p3-face` | `&orbit=160` | A | mặt, áo đỏ `#d8342c`, quần sẫm, tóc, bảng tên "Đội thử" |
| `p3-jog` | `&autoMove=walk&wait=2` | A, B, C | jog 4 m/s, chân không trượt, camera bám, FOV tăng nhẹ |
| `p3-slow` | `&autoMove=slow&wait=2` | A | walk 1,4 m/s |
| `p3-far` / `p3-first` | `&camMode=far` / `first` | C | xa hơn + cao hơn / ở mắt, không thấy thân |
| `p3-wall` | Rue Royale, lưng cách mặt tiền 1,2 m | C | camera không chui vào nhà |
| `p3-swim` | Seine, cách cầu Alexandre III khoảng 95 m về phía đông, mặt quay về cầu, `wait=2` | B, A | nổi, đầu trên mặt nước, clip bơi |
| `p3-bridge` | giữa cầu Alexandre III (L4), `wait=1.5` | B | đứng trên mặt cầu |
| `p3-wave` / `p3-openbox` / `p3-celebrate` / `p3-crash` | `&orbit=…&action=…&wait=…` | A | đúng tư thế; crash nằm trên đất |
| `p3-debug` | `&debug=1` | tích hợp | dòng "Nhân vật: …" |

## 8. Ghép và kiểm tra

- Ba track sửa file riêng; khối config cách nhau bằng dòng trống và chú thích, nên ghép theo thứ tự nào cũng được. Gợi ý: B → A → C.
- Người tích hợp:
  - `npm run build && npm test`;
  - `npm run screenshot -- p3`, và cả các preset cũ để chắc chế độ bay không bị hỏng;
  - cập nhật `TODO.md` và README (phím);
  - **đổi mặc định sang chế độ nhân vật**: bay chỉ khi có `?cam=` hoặc `V`. Các preset cũ dùng `?cam=` nên vẫn là chế độ bay;
  - commit `feat(phase3): …`.
- **Ngân sách:**
  - mỗi nhân vật ≤ 5 lệnh vẽ (thân, mắt, lông mày, tóc, bảng tên) + bóng, khoảng 14,6 nghìn tam giác;
  - controller ≤ 0,3 ms mỗi bước; camera cast ≤ 0,1 ms mỗi khung;
  - `player.glb` + `player-anims.glb` ≤ 2 MB.

## 9. Để sang phase sau

- **Phase 4:**
  - vật lý xe đạp, lên / xuống xe (`F`);
  - clip `cycle` + IK chân;
  - camera `vehicle: 'bike'`;
  - `moveMode 'bike'`;
  - test tốc độ xe = footSpeed × 1,3;
  - ngã xe gọi `startAction('crash')` khi va chạm mạnh;
  - `npm run build-graph`;
  - bậc thang thật (hiện `steps` chỉ là mặt đường phẳng).
- **Phase 4B:** người đi đường dùng `CharacterModel` + `CharacterAnimator` với clip của bộ ped (rig riêng, 24 clip có sẵn trong file, không phải UAL).
- **Phase 5:** menu `Esc`, nút "Kẹt? Về chỗ an toàn", tùy chọn đảo trục Y, độ nhạy chuột.
- **Phase 6:**
  - `PlayerState` của người chơi khác dựng từ snapshot (nội suy), dùng lại `CharacterModel` + bảng tên;
  - gửi `action` qua mạng (`G` vẫy tay, `R` chuông);
  - `movement` lấy từ file chặng;
  - khóa `V` / tham số URL khi đang trong cuộc đua.
- **Phase 7:** `F` mở hộp mật thư (`openBox`), `celebrate` ở Pit Stop, NPC `talk`.
- **Phase 12:** LOD / instancing cho nhân vật ở xa, bản thân nữ, texture KTX2.
