// Every client tunable lives here (CLAUDE.md). Map constants come from @race/shared, never copied.
import { latLonToWorld, PIT_MAT, SPRINT_MULTIPLIER } from '@race/shared';

export { RACE_BBOX } from '@race/shared';

export const render = {
  maxPixelRatio: 2,
  // Placeholder sun until the day/night sky (SPEC §14).
  hemiLight: { sky: 0xe5e6e4, ground: 0x625e56, intensity: 1.2 }, // Leg 3 look: pale warm sky fill (was 0xdfeaff / 0x5a5448)
  sun: { color: 0xfff1de, intensity: 2.6, position: { x: -260, y: 420, z: 180 } }, // south-west, afternoon-ish; Leg 3 look: warmer (was 0xfff0d8)
  shadowMapSize: 2048,
  shadowRadius: 3, // PCF blur
  shadowBias: -0.0005,
  shadowNormalBias: 0.02,
  shadowHalfExtent: 80, // m around the camera (world/Sky.ts: the shadow box follows it)
  shadowFar: 1200, // m from the sun position
  exposure: 1,
  fov: 70, // vertical, degrees
  near: 0.5, // m
  far: 12_000, // m; initial value, the game sets camera.far = fog far (world/Sky.ts); the preview keeps it
  background: 0xbfd3e6, // clear colour (preview; the game draws the sky texture)
  // horizon = fog colour of the canvas sky, and the skyline's haze (landmarks/g5.ts): 8C T1 matched it to the displayed
  // horizon of the HDRI (graphics8c.sky; was '#c9d9e6')
  sky: { zenith: '#6f9fd8', horizon: '#bfc2cc', clouds: 60, cloudAlpha: 0.35 },
  // Haze (STYLE_GUIDE): hides chunk edges (the load radius follows fog far, world/ChunkManager.ts). near/far grow by
  // altitudeFactor × height above ground, so the topdown view (3.8 km up) stays clear.
  fog: { near: 250, far: 700, altitudeFactor: 1.3 }, // m, m, per m
};

// Leg 3 "Hà Nội xưa" look (world/look.ts; owner 2026-11-02: the streets did not feel like Hà Nội, wanted an aged /
// old-photograph tone). `vintage` 0 = off (the GTA-V daylight look as before), 1 = full; DEV `?vintage=0.5` overrides it.
// It scales everything in this block; the aged colours in roads.colours / terrain.colours / render.sun / hemiLight are
// plain values (edit them directly). The grade is CSS on the canvas + three fixed overlays under the HUD (Chrome's
// compositor, no render pass: low and high quality look the same, ≈ 0 ms in the game loop).
export const look = {
  vintage: 1,
  preset: 'modern' as 'modern' | 'old', // 'modern' = clean present-day Hà Nội (owner's pick 2026-11-02); 'old' = "Hà Nội xưa" (sepia, lifted blacks, grain); DEV ?grade=old|modern
  modern: { sepia: 0.09, saturate: 0.94, contrast: 1.04, brightness: 1.02, lift: '#17140f', vignette: 0.6, grain: 0.5 }, // grade of the 'modern' preset = "vintage hiện đại" (owner 2026-11-04): warm faded film tone on a clean modern city; off inside rooms (main.ts setLookActive). vignette / grain = × the old layers' opacity
  grade: { sepia: 0.12, saturate: 0.88, contrast: 0.92, brightness: 1.05 }, // canvas filter() at vintage 1
  lift: '#1a1815', // lifted blacks: screen-blended over the frame (old print, no true black)
  vignette: { colour: 'rgba(30, 27, 22, 0.40)', from: 50 }, // % of the radius where the corner darkening starts
  grain: { opacity: 0.08, size: 96 }, // static noise tile (overlay-blended), px
  // world/Sky.ts: fog = HDRI horizon × tint (milky warm haze); fog.near × near (more haze on the street)
  haze: { tint: [1.0, 1.0, 0.98] as [number, number, number], near: 0.6 },
  // world/RoadBuilder.ts asphaltMaterial: repair patches (world-metre cells, a hashed share of them holds one darker
  // smoother rectangle) + low-frequency wear brightness (±wear) in the fragment shader
  asphalt: { cell: 7, share: 0.35, dark: 0.6, wear: 0.22 }, // 3 in 10 patches are lighter (concrete fill) instead of dark
};

// Leg 2 (user 2026-10-06): the Macao leg runs in the evening. 'day' = the look above (render.sun / sky, the 8C HDRI) as
// before. Leg 3 Hà Nội (owner 2026-11-09): 'dusk' = hoàng hôn (lighting.dusk: low golden sun, canvas sunset sky, lamps /
// windows / headlights on). Offline tests may override it with ?time=day|night|dusk (world/night.ts; ignored inside a real race).
export const timeOfDay: 'day' | 'night' | 'dusk' = 'dusk';

// Night look (world/night.ts `isNight()`; Sky.ts, Water.ts, post.ts, StreetProps.ts). No real lights at night (each one
// recompiles every shader): moon = the one DirectionalLight, lamps / windows / signs = emissive + bloom. Building and
// landmark agents read `windows` / `emissiveScale` through `nightGlow()` (zero emissive by day).
export const lighting = {
  // ── Leg 3 hoàng hôn (timeOfDay 'dusk'; world/night.ts `isDusk()` / `glowOn()`, Sky.ts, post.ts, Water.ts) ──
  // The day pipeline with the sun low in the west and the canvas sky (no HDRI) as background + image-based light; the night
  // glows (lamps, windows, neon, headlights) are on at dusk.emissiveScale × lighting.emissiveScale. Same cost as day.
  dusk: {
    // the sun: west-south-west (Hà Nội in November sets at azimuth ≈ 250°), ≈ 10° high, orange-gold; m from the shadow target
    sun: { color: 0xffa048, intensity: 3.0, position: { x: -470, y: 86, z: 170 } },
    hemi: { sky: 0x8e8ab0, ground: 0x6e4c34, intensity: 1.8 }, // with the image-based light: mauve sky fill, warm ground bounce
    low: { sunIntensity: 2.8, hemiIntensity: 2.4 }, // without it (low quality / runtime downgrade)
    environmentIntensity: 0.95, // scene.environment = the dusk sky canvas (high quality): warm light from the west, cool from the east
    // the low sun grazes the flat ground: a texel's depth step is ≈ 6× the day one, so a bigger bias (world/Sky.ts), else acne stripes
    shadowBias: -0.0012, shadowNormalBias: 0.08, shadowIntensity: 0.6, // 1 = full black shadow (the shadow box moves with the camera: its edge popped dark patches in while sprinting)
    // canvas sky (Sky.ts skyTexture): zenith → stops (share of the zenith…horizon run) → horizon (= fog colour); a sun disc +
    // glow (radius px of the 1024 equirect) at the sun's direction; clouds lit from below, warm toward the sun, mauve away
    sky: {
      zenith: '#182c66', horizon: '#e49a78', // saturated on purpose: with post-processing ACES tone-maps the canvas (paler, lighter)
      stops: [[0.3, '#3c468c'], [0.55, '#886097'], [0.75, '#d0726c'], [0.9, '#ee8752']] as [number, string][], // share 0.3 ≈ 63° up, 0.9 ≈ 9°
      glow: { radius: 120, inner: 45, stretch: 1.5, colour: [255, 192, 128] as const, alpha: 1 }, // stretch: × wider than tall
      disc: { radius: 5, colour: '#fff4d6' },
      clouds: 55, cloudAlpha: 0.5, cloudNear: [255, 214, 170] as const, cloudFar: [150, 112, 142] as const, // rgb near the sun (lit underside) / opposite (mauve)
    },
    water: { zenith: '#2b3c6c', horizon: '#e89a68' }, // the reflection gradient (Water.skyEnvironment) without the image-based light
    bloom: { strength: 0.3, radius: 0.5, threshold: 1.7 }, // replaces graphics8c.post.bloom at dusk: sun-lit facades haze, lamps glow
    emissiveScale: 0.7, // × lighting.emissiveScale on every glow (lamps, windows, neon, headlights): the sky is still bright
    // lit windows (facade shader): share in a lit building (MeshBucket.lit > 0) / in the others (no seed: a shared pattern);
    // intensity × windows.intensity (the sky is bright: brighter than at night to read)
    windows: { litShare: 0.6, otherShare: 0.25, intensity: 1.2 }, // ≈ 0.35 × 0.6 + 0.65 × 0.25 ≈ 37 % of all windows
  },
  // canvas sky (replaces the daytime HDRI at night): zenith → horizon gradient (horizon = fog colour = city glow), stars
  sky: { zenith: '#02040b', horizon: '#232634', stars: 900, starAlpha: [0.25, 0.9] as const, starBand: 0.85 }, // starBand: share of the upper sky (0…zenith) with stars
  // full night (agent N-B, Sky.ts): a warm city-glow band under the horizon colour (glow from glowFrom of the 0…horizon
  // gradient), clouds lit from below by the city (brighter toward the horizon), stars = a Points cloud that twinkles
  // (size px, twinkle 0–1 depth, rate rad/s), the moon disc + halo painted at lighting.moon's direction (radius px of 1024)
  skyFull: {
    mid: '#070b18', glow: '#3d302f', glowFrom: 0.6,
    clouds: 45, cloudColour: [135, 104, 92] as const, cloudAlpha: 0.15,
    starSize: [1.2, 2.6] as const, twinkle: 0.55, twinkleRate: 2.2,
    moon: { disc: 5, halo: 70, haloAlpha: 0.22, colour: '#dfe6ff' },
  },
  water: { zenith: '#0a1020', horizon: '#3a3a48' }, // the reflection gradient of the sea (Water.skyEnvironment)
  // full night (agent N-B, Water.ts): fake reflections of the city: a 2D light map (shoreline lights every `step` m, glints
  // at the casinos) looked up where the reflected view ray meets y = height; the ripples stretch it into streaks. `base`
  // = a dim emissive so the sea is never pitch black; boats / buoys = small instanced lights (count, colours).
  waterLights: {
    mapSize: 1024, height: 9, strength: 4, shoreStep: 14, shoreShare: 0.7, dot: 16, // px of the map, m
    colours: ['#ffc477', '#ffd9a0', '#e6eeff', '#ff9a6a'],
    glints: [ // x, z, radius m, colour: the casinos (landmark centroids) + the Macau Tower
      [409, 290, 70, '#ffcf6a'], [640, 560, 80, '#ffd27a'], [920, 860, 60, '#ffbf5a'], [1594, 203, 60, '#ffd890'],
      [956, 550, 40, '#ffe0a0'], [-210, 1510, 40, '#ffb8f0'],
    ] as [number, number, number, string][],
    base: '#0b1420',
    boats: { count: 40, colours: ['#ff3a2a', '#3aff6a', '#fff2d0'], size: 1.2, intensity: 6, minShore: 60 }, // m from the shore
  },
  moon: { color: 0x9db2df, intensity: 1.3, position: { x: 300, y: 260, z: -230 } }, // m from the target: east-north-east, ≈ 35° high
  hemi: { sky: 0x5a6a90, ground: 0x3a3024, intensity: 2.2 }, // with the image-based light (high quality)
  low: { moonIntensity: 1.6, hemiIntensity: 2.9 }, // without it (low quality / runtime downgrade): same street brightness
  environmentIntensity: 1, // scene.environment = the night sky canvas (high quality)
  bloom: { strength: 0.55, radius: 0.45, threshold: 0.9 }, // replaces graphics8c.post.bloom at night (lamps, windows)
  // street lamps (StreetProps): an unlit bulb (HDR colour × intensity → bloom), a soft additive pool on the pavement, and a
  // bulb-only level from the lamp's last LOD out to farDistance (city lights from afar). m.
  lamp: { colour: '#ffc477', intensity: 7, bulbRadius: 0.2, pool: { radius: 5.5, strength: 0.32 }, farDistance: 650 },
  // lamps inside these world rects [x0, z0, x1, z1] (modern boulevards: Nam Van / ZAPE / NAPE / the north) are white instead
  // of sodium (StreetProps shader on the instance position)
  lampModern: { colour: '#e9f0ff', areas: [[350, -3000, 3000, 3000], [-1500, -3000, 3000, -1100]] as [number, number, number, number][] },
  // red paper lanterns strung across the old-town streets (StreetProps): within these circles [x, z, r], on `kinds`, a string
  // every `spacing` m, a lantern every `gap` m of it, `height` m up with `sag`; size m; intensity HDR (bloom)
  lanterns: {
    zones: [[-185, -75, 95], [95, -95, 120]] as [number, number, number][], // Rua da Felicidade; Senado / São Domingos
    kinds: ['residential', 'pedestrian', 'living_street'], spacing: 16, gap: 2.6, height: 5.4, sag: 0.6,
    size: [0.42, 0.55] as const, colour: '#ff1408', intensity: 1.6, maxSpan: 12, distance: 350, // m: not drawn farther
  },
  // neon blade signs (vertical, out from the facade) and LED panels (flat) above the shop band of street facades
  // (StreetProps, buildings ≥ minHeight m): a candidate every `step` m of facade, share of them get one; canned colours,
  // LED panels cycle (ledRate rad/s), blades flicker sometimes (flicker share). Sizes m [w, h, depth].
  neon: {
    kinds: ['primary', 'secondary', 'tertiary', 'residential', 'pedestrian', 'living_street', 'unclassified'],
    minHeight: 9, step: 7, share: 0.35, ledShare: 0.3, reach: 6, // reach: facade ≤ m from a street edge
    blade: [0.12, 2.6, 0.9] as const, led: [3.2, 1.4, 0.1] as const, y: 5.2,
    colours: ['#ff2f6a', '#2ff0ff', '#ffd23a', '#7a5cff', '#3aff7a', '#ff7a2a'], intensity: 2.6, flicker: 0.15, ledRate: 0.6,
    distance: 450, // m: not drawn farther (per instance)
  },
  // red aviation lights on the roof corners of buildings ≥ minHeight m (StreetProps), blinking (period s, on share)
  aviation: { minHeight: 100, size: 0.7, colour: '#ff1a10', intensity: 9, period: 1.6, on: 0.45, corners: 4 },
  // lit windows (facade shader, night.ts facadeNightGlsl): in a lit building (MeshBucket.lit > 0, buildings.macao.litShare
  // of them) litShare of its windows glow, hash of (window, building seed); colour = `colour` or a palette pick
  // (cumulative weights: warm white, yellow, tv blue, pink), brightness × [0.6, 1.2]
  windows: {
    litShare: 0.55,
    colour: '#ffcf8f',
    intensity: 1.1,
    palette: [['#ffe6bf', 0.45], ['#ffcf8f', 0.8], ['#8fb4ff', 0.95], ['#ff9ad0', 1]] as [string, number][],
    lateShare: 0.4, // × litShare at lighting.hour = 1 (small hours); hour 0 = litShare as is
    switchSeconds: 240, // each window re-rolls on / off at this period (own phase): lights go on and off slowly
    tv: { share: 0.12, colour: '#7fa2ff', rate: 7, depth: 0.6 }, // share of the windows lit by a flickering TV
  },
  hour: 0.25, // 0 = dusk … 1 = small hours: the lit window share (windows.lateShare); per leg
  // shop bands at night: openShare of the shops (hash of shop, building) light their signboard (its own colour × sign) and
  // the shop window (× interior); the rest stay dark
  shops: { openShare: 0.6, sign: 1.8, interior: 1.1 },
  emissiveScale: 1, // global × on every nightGlow() (windows, landmark signs / floodlights)
  signBrightness: 0.6, // street-name plaques: unlit (MeshBasic) at this brightness, readable without a light
  // ── night gameplay (agent N-A): all × emissiveScale; HDR factors (> 1) only with post-processing (bloom), else × 1 ──
  // clue boxes (net/ClueBoxes.ts): yellow / red emissive (day: clueBox.glow), the light column's colour × beam (additive),
  // an additive halo sprite at the head (≥ size m, ≥ spread m per m of distance: a dot from afar) and a ground pool
  // (radius m); an opened box: halo / pool × opened, stripes keep their dim day look
  boxes: { emissive: 1.1, beam: 2.2, halo: { size: 1.6, spread: 0.02, strength: 1.3, y: 1.4 }, pool: { radius: 2.6, strength: 0.45 }, opened: 0.3 },
  // Pit Stop mat (race/PitStop.ts): stripes = the lit rim (emissive), carpet emissive, column colour × beam
  pit: { rim: 0.5, carpet: 0.25, beam: 2.5 }, // rim 1.6 → 0.5 (leg2-fixes.md item 6): with bloom the gold band hid the player and the mat
  // stair flights (world/StairBuilder.ts nosing strips, material 'stairGlow', hidden by day): strip width m, lift m,
  // inset m from each side, colour × intensity
  stairs: { strip: 0.06, lift: 0.006, inset: 0.12, colour: '#ffe0a8', intensity: 2.2 },
  // NPC cars (npc/NpcRenderer.ts, 2 extra instanced draw calls): lamp boxes on the template's own surface (height share
  // of the body, x share of the half width; twoWheeler: one lamp in the middle), colours × intensity; braking tail × brake;
  // taxi roof sign; road glow = an additive cone `cone` [width, length] m ahead of the nose
  cars: {
    head: { colour: '#fff1d6', intensity: 3, size: [0.32, 0.14] as const, y: 0.42, x: 0.72 },
    tail: { colour: '#ff1a0c', intensity: 1.2, brake: 3, size: [0.3, 0.12] as const, y: 0.5, x: 0.76 },
    twoWheeler: { y: 0.55, size: [0.16, 0.12] as const },
    roof: { colour: '#fff6c8', intensity: 2.5 },
    cone: { width: 4.5, length: 11, strength: 0.38, colour: '#ffe9c4', lift: 0.06 },
  },
};

export const physics = {
  fixedDt: 1 / 60, // s
  maxSubSteps: 5, // per frame; time beyond this is dropped instead of spiralling
  maxFrameDt: 0.25, // s; clamps huge frame deltas (tab switch, breakpoint)
  gravity: { x: 0, y: -9.81, z: 0 },
};

// Default view (Leg 2): ~60 m above Largo do Senado (the world origin), a little behind it, looking toward the Mont des Arts / Palais Royal.
// (name kept from Leg 1, where this was the Arc de Triomphe)
const ARC = latLonToWorld(21.02822, 105.85224); // Tháp Rùa, hồ Hoàn Kiếm
const toArc = Math.hypot(ARC.x, ARC.z);
const SPAWN_BACK = 120; // m behind the origin, so the origin square is in view

export const flyCamera = {
  baseSpeed: 20, // m/s
  fastMultiplier: 5, // while flyFast is held
  minSpeed: 1,
  maxSpeed: 500,
  wheelStep: 1.25, // speed factor per wheel step (one step per wheel event)
  wheelGapMs: 80, // min time between wheel steps, so a trackpad's stream of tiny events doesn't race
  mouseSensitivity: 0.002, // rad per pixel
  gamepadLookSpeed: 2.5, // rad/s at full stick
  gamepadDeadzone: 0.15, // radial, 0..1
  spawn: {
    x: (-ARC.x / toArc) * SPAWN_BACK,
    y: 60,
    z: (-ARC.z / toArc) * SPAWN_BACK,
    yawDeg: (Math.atan2(-ARC.x, -ARC.z) * 180) / Math.PI, // yaw 0 = north (−Z)
    pitchDeg: -20,
  },
};

export const debugOverlay = { refreshMs: 250 };

export const ui = { imeNoticeMs: 12_000 }; // how long the Vietnamese-IME notice stays up

// KeyboardEvent.code (physical position). SPEC §17: no Ctrl/Alt/Cmd/Win, no F-key-only action, never F5/F11/F12.
const keyTable = {
  moveForward: ['KeyW'],
  moveBack: ['KeyS'],
  moveLeft: ['KeyA'],
  moveRight: ['KeyD'],
  sprint: ['ShiftLeft', 'ShiftRight'], // SPEC §17.29: hold = ×movement.sprintMultiplier, on foot and on a bike
  jump: ['Space'],
  interact: ['KeyF'],
  clueBook: ['Tab'],
  clueCard: ['Enter', 'NumpadEnter'], // Phase 8: reopen the current card (answer history, input) when no card / book / menu / map is open
  map: ['KeyM'],
  camera: ['KeyC'],
  binoculars: ['KeyB'],
  menu: ['Escape'],
  debug: [], // no key: the debug panel only opens with ?debug=1 (offline test world); players have no way to open it
  wave: ['KeyG'], // vẫy tay chào
  bell: ['KeyR'], // bấm chuông/còi xe đạp
  flyUp: ['Space', 'KeyE'],
  flyDown: ['KeyQ'],
  flyFast: ['ShiftLeft', 'ShiftRight'],
  flyToggle: ['KeyV'], // player ⇄ free-fly camera, only while the F3 debug panel is open (docs/plans/phase3.md); SPEC §17.40: in the watch mode = "Bay tự do" ⇄ follow
  graphToggle: ['KeyN'], // road graph overlay (roadgraph.json), only while the F3 debug panel is open
  // SPEC §17.40 watch mode: a finished team toggles it (X); [ / ] = the previous / next racing team (spectate/Spectate.ts)
  watch: ['KeyX'],
  spectatePrev: ['BracketLeft'],
  spectateNext: ['BracketRight'],
};

export type Action = keyof typeof keyTable;
export const keys: Readonly<Record<Action, readonly string[]>> = keyTable;

// Gamepad buttons per action, W3C "standard" mapping: 0 A/✕, 1 B/○, 2 X/□, 3 Y/△, 4 LB/L1, 5 RB/R1, 6 LT/L2, 7 RT/R2,
// 8 View/Share, 9 Menu/Options, 10 L3, 11 R3, 12–15 D-pad ↑ ↓ ← →. Sticks: left = move, right = look (core/Input.ts).
// The free-fly camera also rises with RT/RB and sinks with LT/LB (Input.pad.rise), so LB = sprint only on foot / bike.
export const padButtons: Readonly<Partial<Record<Action, readonly number[]>>> = {
  jump: [0],
  interact: [2],
  clueBook: [3],
  sprint: [4],
  camera: [8],
  menu: [9],
  flyFast: [10],
  map: [12],
  binoculars: [13],
  wave: [14],
  bell: [15],
};

// ═════════════════════════════════════════════════════════════════════════════════════════════════════
// Phase 2 (docs/plans/phase2.md): one block per package. Each package edits ONLY its own block and adds
// no imports. Chunks hold raw OSM facts; every default below is applied by the builders at build time.
// ═════════════════════════════════════════════════════════════════════════════════════════════════════

// ── F · streaming + integration (world/ChunkManager.ts, workers/chunkBuilder.worker.ts, world/Bounds.ts) ──
export const chunks = {
  loadRadius: 800, // m around the camera (SPEC §4.4); 600 on integrated GPUs, together with fog
  unloadRadius: 1000, // m; > loadRadius so chunks at the edge don't thrash
  fogMargin: 100, // m; radius = max(loadRadius, fog far at the camera height + this): the loaded edge stays in the fog
  colliderRadius: 150, // m; loaded chunks this close get their Rapier colliders (created one per frame, budgeted)
  colliderHysteresis: 100, // m beyond colliderRadius before they are removed again
  maxInFlight: 2, // worker builds at once
  attachBudgetMs: 4, // main-thread attach time per frame (unbudgeted until the first __READY__)
  fetchRetries: 3,
};

export const bounds = {
  wallHeight: 500, // m, invisible cuboid walls along RACE_BBOX (SPEC §4.1)
  warnDistance: 40, // m from the edge → banner "Bạn đang rời khu vực đua"
};

// ── B · buildings (world/BuildingBuilder.ts) ──
export const buildings = {
  levelHeight: 3.2, // m per building:levels (SPEC §4.4)
  defaultHeight: 20, // m when neither height nor building:levels is tagged
  baseSink: 0.5, // m: walls start this far below the lowest ring vertex, so slopes show no gap
  groundSpan: 3, // m: the ground a building's height counts from is at most this far below its highest ring vertex
  haussmannKinds: ['yes', 'apartments', 'residential', 'commercial', 'retail', 'office', 'hotel'],
  haussmannHeight: [0, 0], // m, min/max height for the Haussmann style; Leg 2 (Macao): [0, 0] = never (windowed boxes, flat roofs); Leg 1 Paris: [12, 35]
  shopfrontHeight: 4.5, // m, ground floor
  mansardHeight: 4, // m, zinc roof band at the top
  mansardInset: 1.2, // m, clamped per vertex to half the shortest edge
  balconyFloors: [2, 5],
  balconyMinEdge: 3, // m; shorter outer-ring edges get no balcony
  balconyDepth: 0.7, // m
  railingHeight: 1, // m
  bayWidth: 3, // m, one window bay (window ≈ 1.4 m); each wall edge gets a whole number of bays
  canopyHeight: 4, // m, building=roof (courtyard glass roofs, market halls) without height
  canopyThickness: 0.3, // m, building=roof without min_height
  smallArea: 40, // m²: untagged footprints smaller than this (kiosks, vents, toilets) get smallHeight, not defaultHeight
  smallHeight: 4, // m
  postSize: 0.4, // m: square columns under a raised structure (OSM min_height parts, building=roof canopies), at every outer vertex …
  postSpacing: 8, // … and every this many m along longer edges, so nothing hangs in the air
  chimneyChance: 0.35, // per inset roof corner
  chimneySize: [1.1, 0.6, 1.5], // m: along the edge, across, above the roof
  colours: { limestone: '#e3d5b8', zinc: '#6f7c85', iron: '#2a2d30' },
  // Leg 3 (Hà Nội) look (the block keeps its Leg 2 name `macao`), used whenever the Haussmann style is off for a building. Style per building (hash01 of its first vertex):
  // h ≥ towerHeight[1] tower; towerHeight[0]–[1] tower with chance (h − [0]) / ([1] − [0]), else tenement; below: tenement for
  // tenementKinds of h ≥ tenementMin with chance tenementShare, else colonial. Colours are sRGB (vertex colour = linear of it).
  macao: {
    towerHeight: [40, 60], // m (Hà Nội: tube houses and KTT blocks stay plaster / concrete, only real towers get a grid or curtain wall)
    tenementMin: 12, // m (≈ 4 storeys: KTT slabs tagged building:levels 4–5)
    tenementShare: 0.7, // Hà Nội: khu tập thể (tagged apartments / dormitory …) get the grey tenement look
    tenementYesShare: 0.2, // … untagged 'yes' footprints (the OSM default 20 m, mostly nhà ống rows) less often
    tenementKinds: ['yes', 'apartments', 'residential', 'dormitory', 'mixed'] as string[],
    curtainShare: 0.4, // towers with a glass curtain wall; the rest get the tenement texture as a concrete grid
    blankKinds: ['roof', 'garage', 'garages', 'shed', 'storage_tank', 'warehouse', 'hut', 'carport', 'service'] as string[], // no windows
    shopMinHeight: 7, // m: buildings at least this tall get the ground-floor shop band (shopfrontHeight) on street faces
    kioskShopMin: 3, // m: a windowless low box (untagged < smallArea: the Old Quarter's street-front slivers) at least this tall is a shop (quán) band
    // tiled hip / pitched roof (m, m², m above / in from the walls): chance outside the French quarter (Old Quarter tube houses
    // with a tile cap); the rise shrinks with the inset on plots narrower than 2 × inset (a 4 m tube house gets a low ridge)
    hip: { chance: 0.12, smallChance: 0.6, tonShare: 0.45, maxHeight: 40, maxArea: 700, rise: 4.2, inset: 3.2, minWall: 2.6 }, // minWall: m of wall left under the slope, else the box stays flat (a 4 m kiosk is not a 1.4 m hut) // smallChance: footprints under plots.minBoxArea (whole-house plots); tonShare of hips are tôn, the rest tile (bigger untagged blocks get per-plot caps instead, macao.plots)
    // French quarter (world m [x0, z0, x1, z1]: south of Hoàn Kiếm lake to Hai Bà Trưng + the strip east of the lake, Lý Thái Tổ):
    // more hip roofs, ochre plaster. ponytail: axis-aligned boxes, upgrade: the district polygons of geo/districts.ts (the builder runs in a worker without them)
    // (ochreShare of buildings take their tint from the first ochreCount `colonial` colours), fewer rooftop boxes
    // plotFlat: share of French plots that keep the block height (villas / colonial blocks are not ragged); the French
    // facade columns of the wall atlas (arched windows, white mouldings, balustrade balconies) are picked by BuildingBuilder
    french: { boxes: [[-750, 650, 1050, 1800], [250, 100, 1050, 650]] as [number, number, number, number][], hipChance: 0.55, ochreShare: 0.7, ochreCount: 4, roofBoxChance: 0.6, shopShare: 0.5, tenementShare: 0.1, plotFlat: 0.75 },
    // Old Quarter (Phố cổ, world m [x0, z0, x1, z1]: Hàng Đào / Hàng Bạc / Đồng Xuân block north of the lake; docs/reports/hanoi-houses.md §Khu): nhà ống
    // only (recipes.oq), tile (ngói ta) hips on a good share, ochre plaster, almost no KTT slabs, low and ragged (extra storeys), few rooftop boxes.
    // ponytail: one axis-aligned box like `french`; upgrade: the district polygons of geo/districts.ts
    // Phạm Ngọc Thạch / Kim Liên / Chùa Bộc (Đống Đa; refs docs/reports/landmark-refs/pham-ngoc-thach): a boulevard lined with 15–25-storey apartment towers
    // (cream / stained yellow-green / grey concrete, white balcony rows) over shop podiums, 4–6-storey mid-rise shophouses with big sign boards between them,
    // 5-storey KTT slabs behind, big shade trees + motos on the pavement. ponytail: one axis-aligned box over the whole corridor, upgrade: district polygons
    pnt: { boxes: [[-2260, 2260, -1500, 2960]] as [number, number, number, number][], towerArea: 350, towerShare: 0.3, towerH: [48, 78] as [number, number], towerKinds: ['apartments', 'residential', 'yes', 'dormitory', 'mixed'] as string[], tenementShare: 0.85, hipChance: 0.03, extra: 2, flatShare: 0.25,
      tenement: ['#d9d2b6', '#cfc79c', '#b9bb82', '#d7d0bd', '#a9a79d', '#e0dccd', '#c8c18f'] as string[], concrete: ['#d8d0b8', '#b9bb8a', '#a9a79d', '#e2ddcf'] as string[] },
    oldQuarter: { boxes: [[-585, -921, 558, -35]] as [number, number, number, number][], hipChance: 0.4, ochreShare: 0.55, tenementShare: 0.02, extra: 1, flatShare: 0.15 },
    // Nhà ống plots (BuildingBuilder emit, low-rise 'wall' fronts): every outer edge ≥ minEdge m is cut into plots ≈ width m,
    // each with its own facade column + plaster tint. Untagged footprints (no height / building:levels, kinds below) get a hashed
    // base height of floors[0]–[1] storeys instead of defaultHeight, and each plot may rise `extra` more storeys (flatShare of
    // them stay at the base; a footprint under minBoxArea m² is one plot and rises as a whole) as a box depth m deep (clamped to half the footprint across that edge): stepped roof lines with bare
    // side party walls (sideTint × the plot tint). Raised plot caps: gableShare get a pitched cap (rise m; tileShare terracotta,
    // else tôn), tumShare a stair-head 'tum' box (tum: side, height; tankShare with a water tank), the rest stay flat.
    // ponytail: the strips of adjacent edges overlap at corners (a deeper corner house pokes through its neighbours' caps) and
    // the collider stays the base prism; upgrade: a proper plot subdivision of the footprint in build-chunks.
    plots: {
      kinds: ['yes', 'house', 'residential', 'detached', 'terrace', 'semidetached_house', 'apartments', 'commercial', 'retail', 'shop'] as string[],
      floors: [2, 4], extra: 3, flatShare: 0.35, width: 4, depth: 7, minEdge: 2.6, maxArea: 2500, minBoxArea: 150,
      gableShare: 0.5, tileShare: 0.5, rise: 1.5, tumShare: 0.75, tum: [2.2, 2.4], tankShare: 0.75, sideTint: '#cdc5b2',
      parapet: 0.5, // m: concrete lip around every flat roof (terrace), outer + inner face
      // a projecting balcony slab (roof bucket) on plots showing an atlas balcony column, slabUp m above the band on the first floor, depth / thickness m
      slabCols: [1, 5, 7, 9, 12] as number[], slabUp: 0.7, slabDepth: 0.8, slabThick: 0.15,
    },
    // House recipes (docs/reports/hanoi-houses.md): wall atlas columns a plot may take (BuildingBuilder wallCanvas: 0–5 nhà ống,
    // 6–7 French colonial, 8–9 nhà phố Pháp cũ, 10 mặt phố mới dark cladding, 11 narrow house with stacked signs, 12 tân cổ
    // điển pastiche, 13 mid-century block); repeats = weight. `tall` for blocks ≥ tallFrom m. A plot never repeats its left
    // neighbour's column or tint.
    recipes: {
      street: [0, 1, 2, 3, 4, 5, 0, 2, 3, 8, 9, 10, 11, 12, 13] as number[],
      tall: [1, 2, 4, 10, 10, 11, 11, 12, 13, 13, 3, 9] as number[],
      tallFrom: 15,
      french: [6, 7, 8, 9, 8, 9, 0, 3, 12] as number[],
      pnt: [10, 10, 11, 4, 3, 12, 13, 1, 2, 10, 11, 13, 4, 12] as number[], // Phạm Ngọc Thạch: modern 4–6-storey shophouses (dark cladding, stacked signs, mid-century blocks)
      oq: [0, 1, 2, 3, 4, 5, 11, 0, 2, 3, 8, 9, 11, 1] as number[], // Phố cổ: nhà ống + stacked signs + old French shophouses; no dark cladding / mid-century blocks
    },
    // mái hiên: tôn / tile lean-to over the shop opening of a share of street plots (roof bucket + a shaded underside):
    // fixed y m above the ground at the wall, out `depth` m dropping `drop` m; colours tôn blue / rust / green-rust, tile
    awning: { share: 0.4, y: 3.3, depth: 1.7, drop: 0.45, colours: ['#6a9ccb', '#b05838', '#6f8a64', '#9a4e34', '#8f9498'] },
    // nhà ống rooftop box (stair head / terrace room, roof bucket): chance per flat-roofed low-rise, size as plantBox
    // ([min side, height, side as a share of √(largest roof triangle area), max side]); a water tank (bồn nước, hex prism)
    // stands on tankShare of the boxes
    roofBox: { chance: 0.9, maxHeight: 80, size: [1.8, 2.4, 0.3, 3.5], tankShare: 0.6, tankRadius: 0.55, tankHeight: 1, tank: '#d4d8dc' },
    colonial: ['#dcc58a', '#e6d7a6', '#d6bd7a', '#e0cd98', '#e9e4d6', '#f1ede2', '#e4d3b6', '#cfc8b8', '#e8c4ae', '#c3d2d4', '#bfcdb0', '#dccfa6', '#d2cec4', '#e2d3b0', '#d4dccb', '#dcc6cb', '#bdb5a6', '#d8d2c6', '#e9dcc0', '#d8b46a', '#e8c3b9', '#b9d6c7', '#a9bfd6', '#bfb8a8'], // Hà Nội: French-yellow ochre (first 4 = french.ochreCount), cream / off-white plaster, dusty pink, blue, green tube-house fronts, grey render
    tenement: ['#d6c58f', '#cdbd8a', '#c9c0a8', '#bdb6aa', '#d9cc9e', '#b8b5ad', '#c7b995', '#c2b89f'], // KTT: yellowed / grey stucco
    kttRoof: { share: 0.6, maxHeight: 22, rise: 1.6, inset: 2.5, colours: ['#5c8fc0', '#a04a30', '#7aa0c6', '#b05838'] }, // (rust = saturated red: a pink-brown tint goes olive over the blue-grey slate diffuse) // tôn 'mái che' pitched cap over KTT slabs (blue / rust), slope rise m over inset m
    concrete: ['#d8ccb2', '#c9c3b8', '#e1d9c9', '#bdb5a5'], // concrete-grid towers
    glass: ['#a9c4dc', '#9fcfcc', '#bcc6ce', '#a8d0dc', '#aab8d0'], // curtain-wall tint
    tileRoof: '#9a4e34', // hip roofs (terracotta tiles, Old Quarter / French villas)
    flatRoofs: ['#aaa89f', '#9e9d95', '#b3b1a8', '#98998f', '#a7a69c', '#a6a08f'], // flat roofs: concrete terraces (wall bucket plain texel × tint, unlifted: mid greys)
    ton: { share: 0.3, maxArea: 260, colours: ['#6a9ccb', '#b05838', '#5d8fc2', '#a04a30'] }, // corrugated-metal (tôn) cap on a share of small flat-roofed plots: blue / rust
    roofLift: 3.2, // × roof tint over the dark roof_slates_03 diffuse (graphics8c.roofs); 1 with the canvas roof
    plantBox: [3, 2.2, 0.4, 7], // tower roof plant box: min side, height (m), side as a share of √(largest roof triangle area), max side
    litShare: 0.35, // share of buildings whose windows are lit in the evening (MeshBucket.lit)
  },
};

// ── C · roads + bridges (world/RoadBuilder.ts, world/BridgeBuilder.ts) ──
export const roads = {
  sidewalkWidth: 3.5, // m each side (SPEC §4.4: 3–4 m)
  sidewalkByName: { 'Avenue des Champs-Élysées': 21, 'Pont Alexandre III': 10, 'Pont Neuf': 4.5 } as Record<string, number>, // m each side (Champs 70 m ≈ 21 + 28 + 21, Pont Alexandre III 40 m)
  curbHeight: 0.15, // m (STYLE_GUIDE)
  laneWidth: 3.25, // m; width = lanes × this when there is no width tag
  widthByKind: {
    motorway: 14, trunk: 14, primary: 12, secondary: 10, tertiary: 9, unclassified: 7, residential: 6, // Hà Nội: residential streets are 5–7 m between house fronts
    living_street: 6, service: 4.5, pedestrian: 6, footway: 3, path: 2, cycleway: 2, steps: 3, track: 3,
    primary_link: 7, secondary_link: 7, tertiary_link: 6, subway: 4.5, rail: 4.5, light_rail: 4.5, tram: 4.5, // rail: 1 track
  } as Record<string, number>, // m, per highway=* / railway=* when neither width nor lanes is tagged
  defaultWidth: 6, // m, kind missing from widthByKind
  // Hà Nội alleys: a residential way named Ngõ / Ngách / Hẻm (or unnamed) without width / lanes tags is a 3–5 m lane between
  // house fronts, not a 7 m street with 3.5 m sidewalks (that cut 1–3 m into 1,500 houses): carriageway / sidewalk m
  alley: { kinds: ['residential', 'unclassified', 'living_street'] as string[], pattern: '^(Ngõ|Ngách|Hẻm)\\b', unnamed: true, width: 4, sidewalk: 1 },
  // m carriageway; overrides everything except on a oneway half of a dual carriageway (the Concorde end of the Champs)
  // Pont Neuf 20.5 m = 11.5 + 2 × 4.5, Pont des Arts 11 m incl. railings (fr/en.wikipedia) — the landmark decks g2 details
  widthByName: { 'Place Charles de Gaulle': 36, 'Avenue des Champs-Élysées': 28, 'Pont Neuf': 11.5, 'Pont des Arts': 10.2 } as Record<string, number>,
  sidewalkKinds: [
    'motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'unclassified', 'residential',
    'primary_link', 'secondary_link', 'tertiary_link',
  ] as string[], // raised sidewalks on both sides; other car kinds (service, living_street, cycleway…) get none
  footKinds: ['footway', 'pedestrian', 'path', 'steps', 'bridleway', 'track'] as string[], // stone ribbon, no sidewalk
  paveSurfaces: ['sett', 'cobblestone', 'unhewn_cobblestone', 'cobblestone:flattened'] as string[], // → 'pave'
  railKinds: ['subway', 'rail', 'light_rail', 'tram', 'narrow_gauge'] as string[], // bridge deck without road surface
  minCutWidth: 3, // m; narrower crossing ways (cycleways) don't cut the sidewalks
  minCrossSin: 0.35, // |sin| of the meeting angle below which a way is the road's continuation (no cut)
  minTwinCos: 0.9, // |cos| between a oneway half and its same-name twin (dual carriageway) / two parallel bridge decks
  maxSegment: 5, // m (= terrain cell); ribbons are subdivided along and across so overlapping ones drape alike
  lift: 0.05, // m above the terrain: sidewalk curb base (top = lift + curbHeight)
  // m above the terrain per surface: overlaps resolve by height as well as polygonOffset (which is ~0 up close)
  surfaceLift: { sidewalk: 0.03, asphalt: 0.05, pave: 0.07 } as Record<string, number>,
  markingLift: 0.02, // m above the carriageway
  centreLine: { width: 0.15, dash: 3, gap: 5, junctionCut: 8 }, // m; white dashes between lanes, cut before junctions
  // m; mergeGap: parallel same-layer road decks closer than this (centre lines) are joined into one deck, no inner parapets
  bridge: { deckThickness: 1, railingHeight: 1.1, railingThickness: 0.3, endSample: 5, railLayerStep: 6, mergeGap: 30,
    lakeMin: 0.25, lakeLift: 0.25, lakeHalfWidth: 2.4, lakeArch: 1.4, lakeArchSlope: 0.07, // m: a deck whose middle is lakeMin m above the bed of a shallow lake (Hà Nội: lakes sink only 0.4 m, so the deck stood AT the water) is a water crossing: lifted lakeLift m, with its railings
    riverDeck: 1.3, // m: road deck under an upper rail deck over the river when none is in its chunk (Bir-Hakeim ≈ 1.1–1.5)
    endRamp: 15, // m of slab beyond a real chain end, blending down to the ground: covers the carved trench behind the quay wall
    rampGrade: 0.25, // max rise per m where the deck follows steep ground (the quay band's one-cell face); player.maxSlopeDeg 45
    bare: ['Pont Neuf', 'Pont des Arts'] as string[] }, // named decks without railings: world/landmarks/g2.ts draws their parapets
  // Leg 3 look (config `look`): asphalt = tint × asphalt_02 (warm dark grey, patched in the shader), sidewalk = small cement
  // tiles with joints and stains (RoadBuilder paintTiles), markings sun-faded. Before: '#3b3c40' / '#bab5aa' / '#7f756a' / '#f0f0ec'
  colours: { asphalt: '#c4b8a8', sidewalk: '#a39c8c', pave: '#857a6a', marking: '#d9d3c2', bridge: '#b7aa8f', railing: '#26292c' },
  textureTile: { asphalt: 4, sidewalk: 3, pave: 1.2 }, // m covered by one canvas texture (uv = world metres)
  polygonOffset: { sidewalk: -1, asphalt: -2, pave: -3, marking: -4 }, // factor = units; terrain (0) < … < marking
};

// ── D · terrain + water (geo/heightGrid.ts reads cell/margin; world/Terrain.ts, world/Water.ts) ──
export const terrain = {
  cell: 5, // m, HeightGrid spacing
  margin: 100, // m of grid beyond RACE_BBOX on every side
  chunkRes: 51, // vertices per side of one chunk's terrain mesh (250 m / 5 m + 1)
  waterLevel: -7 as number | null, // y (m); null = median grid height inside river cells. Leg 3 Hà Nội: flat ground at 0, so the river sits
  // quayHeight under it and carveRiver raises no quay band (streets stay flat up to the bank)
  riverDepth: 3, // m; river cells are carved to waterLevel − this
  quayHeight: 7, // m; cells within quayBand outside the river are raised to ≥ waterLevel + this (SPEC §4.3: 6–8 m)
  quayBand: 8, // m
  copingWidth: 12, // m of stone slab behind the quay wall (covers the carved one-cell slope)
  copingLift: 0.1, // m above waterLevel + quayHeight
  parapet: 1, // m of quay wall above the coping
  quayGrade: 0.04, // beyond the band the raised floor falls off this steeply until it meets the (smeared) DEM
  padBlend: 25, // m outside a flattened plaza (geo/landmarks PADS) over which the ground eases back to the DEM
  stoneSlope: 1, // |gradient| above this is coloured stone (quay walls: the band drop is ~2)
  // Leg 3 Hà Nội: park / garden ground is lawn (paths are RoadBuilder footways); buildTerrain mixes grass → worn (dust / trodden
  // patches, value noise) and darkens it under the chunk's trees (shade). Paris: park = gravel '#b3a37e'.
  colours: { pavement: '#968e80', park: '#6e7b45', grass: '#788748', stone: '#b3a78f', worn: '#9a9064', shade: '#51603a', lakeBed: '#5e5f4a' },
  lakeBank: 0.15, // m: ground this far under the flat street (a carved lake / pond bottom, not the river bed) is water bottom, its dry neighbours a grass bank
  lawn: { patch: [11, 37], worn: 0.55, shadeRadius: 4.5, shade: 0.45 }, // noise lattice m (2 octaves), max worn share, m round a tree trunk, max shade share
};

export const water = {
  roughness: 0.15,
  otherLift: 0.1, // m: non-river water (lakes, ponds, basins) lies this far above its rim height (Terrain.carveRiver)
  lakeRim: 0.05, // rim height = this quantile of the heights along a lake's outer ring (the DEM's rims dip in places)
  lakeDepth: 0.4, // m: every node inside a pond / basin sinks at least this far under its surface (no DEM island pokes through)
  swimMinArea: 600, // m²: a water polygon this big is a lake you can swim in (Hồ Gươm, Thiền Quang …): carved lakeSwimDepth deep, swim.enterDepth 1.2 + floatDepth 1.35 fit
  lakeSwimDepth: 2.6, // m; the first grid cell inside the shore keeps lakeDepth (a shelf: the drop starts under water, not at the bank)
  // Leg 3 Hà Nội lake banks (Terrain.lakeKerbMesh, drawn by Water.ts, no collider): a stone kerb on every swim lake's shoreline,
  // `width` m across the polygon edge, top `lift` m over the surface, skirts `skirt` m down on both sides (hide the bank slope)
  kerb: { width: 1.2, lift: 0.18, skirt: 0.8, colour: '#a39a86' },
  normalScroll: 0.02, // UV units per second
  colour: '#3d5a66',
  normalTile: 24, // m per normal-map repeat
  normalScale: 0.35,
  sky: { zenith: '#5d8fc9', horizon: '#dfe9f2' }, // procedural environment the water reflects
  wallColour: '#b8ab90', // Terrain.quayMesh: quay walls + coping
}; // ponytail: no planar reflection, add Reflector / Water.js if it looks flat and FPS allows

// ── E · vegetation, street props, signs (world/Vegetation.ts, world/StreetProps.ts) ──
export const props = {
  treeScale: [0.8, 1.2], // hashed per tree
  treeHeight: 15, // m, plane tree (platane) at scale 1
  // Hà Nội street trees (sấu / xà cừ rows, world/Vegetation.ts placeStreetTrees): planted along both kerbs of these street
  // kinds where the pavement is ≥ minSidewalk m, every spacing m (gapShare of the slots left empty), curb m in from the kerb,
  // foot m of clearance from buildings
  // Hà Nội parked motorbike rows (world/StreetProps.ts placeMotos, instanced 'moto', drawn within drawDistance m): on the
  // pavements of these kinds (≥ minSidewalk m), a slot every step m, share of slots with a row of count[0]–[1] bikes gap m
  // apart, fromFacade m off the house front
  motoRows: { kinds: ['primary', 'secondary', 'tertiary', 'residential', 'unclassified'] as string[], minSidewalk: 2.5, step: 9, share: 0.45, count: [3, 8] as number[], gap: 0.78, fromFacade: 1.0, drawDistance: 110 },
  streetTrees: { thin: { boxes: [[-2960, 2260, -1500, 3060]] as [number, number, number, number][], keep: 0.35, osmKeep: 0.5 }, // Chùa Bộc / Đông Tác / Phạm Ngọc Thạch / Vincom: only `keep` of the street trees and `osmKeep` of the OSM trees stay
  enabled: true, kinds: ['primary', 'secondary', 'tertiary', 'residential', 'unclassified'] as string[], minSidewalk: 2.5, spacing: 14, gapShare: 0.3, curb: 1.0, foot: 1.5 },
  lampSpacing: 30, // m along both sidewalks of car roads
  lampJunctionGap: 10, // m; no lamp this close to a junction
  lampCurbOffset: 0.6, // m from the road edge onto the sidewalk
  carKinds: ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'unclassified', 'residential', 'living_street',
    'motorway_link', 'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link'], // highway=* that get lamps
  streetKinds: ['pedestrian'], // + carKinds: roads whose junctions get signs / Morris columns
  morrisOneIn: Infinity, // a Morris column at 1 in N junctions (hashed); Leg 2 (Macao): none, a Paris advertising column (Leg 1: 6)
  metroEntrances: false, // a Guimard "Métropolitain" entrance + well at every OSM subway_entrance (Leg 1 Paris: true); Macao has no metro
  cornerInset: { sign: 0.7, morris: 2.2 }, // m from the curb line into the corner sidewalk
  maxTriangles: 300, // per prop mesh
  signs: {
    cellW: 256, cellH: 64, dedupe: 15, // px, px (max cell, sized to content), m (same name)
    districtLine: 14, // px added on top of the cell for the "8e Arrt" line (Phase 5 D; the plaque grows, text scale kept)
    atlasW: 512, // px, per-chunk atlas width (height grows with rows)
    plaqueHeight: 0.42, postHeight: 2.6, // m; plaque top at the post top
    enamel: '#1d4f9c', border: '#2f7d4a', text: '#ffffff', post: '#2a2d30',
  },
  // Phase 3 · B: prism colliders (StreetProps.propColliders), merged into the chunk trimesh. Lamp / Morris = hexagon of
  // this radius; metro = the railed stairwell box (local x ∈ ±halfWidth, z ∈ [−length, front]). m; sink below the foot.
  colliders: {
    lamp: { radius: 0.2, height: 4 },
    morris: { radius: 0.76, height: 3.6 },
    metro: { halfWidth: 1.15, length: 5.1, front: 0.1, height: 1.1 },
    sink: 0.3,
  },
  // Phase 8C T2 (graphics8c.props / .trees on): scripts/assets/props.ts → models/props.glb. Per kind: source fit (m, rad)
  // and the triangle budgets [LOD0, LOD1] of the two levels in the GLB.
  models: {
    lamp: { scale: 1.25, tris: [1500, 250] }, // street_lamp_01 is 3.87 m → 4.8 m (Paris candélabres ≈ 4–5 m)
    // scan units: column axis (x, z), poster band (y; cut away, replaced by the PD poster cylinder), its radius, the
    // plinth radius / height above the scan floor that separate the plinth from the paving square; radius = game size
    morris: { axis: [0.2, 0.8], band: [0.72, 4.02], scanRadius: 0.76, plinthRadius: 0.9, groundCut: 0.18, radius: 0.62, divider: '#2e4c38', tris: [2500, 400] },
    // textures above `floor` (scan m, the advert / map / signs) → flat `panel` colour (linear RGB; SPEC §17.20)
    shelter: { yaw: -Math.PI / 2, floor: 0.1, panel: [0.3, 0.31, 0.32], tris: [3000, 500] },
    bench: { slab: 0.095, scale: [2.2, 1.2, 1.2], yaw: Math.PI, tris: [1200, 200] },
    bouquiniste: { boxHeight: 1.2, stretch: [5.6, 14.1], depth: [-0.6, 0.85], groundCut: 0.05, tris: [5000, 800] },
    cafe: { tris: [1200, 250] },
  },
  // Phase 8C T2: placement of the new street furniture (world/StreetProps.ts place*), m unless noted
  place8c: {
    curbClear: 0.6, // from every carriageway edge
    keepClear: 7, // stalls from bus shelters, benches / terraces from both (centre to centre)
    treeGap: 2.2, // from a tree trunk
    junctionGap: 14, // benches: from a junction vertex
    benchKinds: ['primary', 'secondary', 'trunk', 'tertiary'] as string[], // boulevards / avenues
    benchSidewalk: 3, // only where the sidewalk is at least this wide
    benchSpacing: 40, benchCurb: 1.8, benchShare: 0.5, // along the way; from the curb; hashed share of the slots kept
    cafeOneIn: 4, cafeInset: 2.6, cafeSets: 3, cafeStart: 3, cafeStep: 2.2, cafeCurb: 1.2, cafeFacade: 5, // 1 in N junctions, sets from the corner, a façade this close
    shelterReach: 25, shelterCurb: 1.8, // OSM stop within this of a carriageway; shelter centre from its curb
    // bouquinistes (fr.wikipedia.org/wiki/Bouquinistes_de_Paris: right bank Pont Marie → Quai du Louvre, left bank
    // Quai de la Tournelle → Quai Voltaire)
    quays: ['Quai du Louvre', 'Quai de la Mégisserie', 'Quai de Gesvres', "Quai de l'Hôtel de Ville", 'Quai Voltaire', 'Quai Malaquais',
      'Quai de Conti', 'Quai des Grands Augustins', 'Quai Saint-Michel', 'Quai de Montebello', 'Quai de la Tournelle'] as string[],
    bouqStep: 9.4, bouqGapShare: 0.2, // one stretch (≈ 8.6 m) per step; hashed share of empty slots
    wallSearch: [1, 16], riverDrop: 2.5, wallDrop: 0.4, parapetInset: 0.6, bridgeGap: 14, // a river drop within wallSearch of the curb; the quay edge where the ground first falls wallDrop
  },
};

// ── Leg 3 Hà Nội: railways (world/RailBuilder.ts, chunk `rails` from scripts/build-rails.ts). m unless noted. ──
export const railways = {
  enabled: true,
  gauge: 1.0, // m between the rail centres (Vietnam: metre gauge)
  bedWidth: 5.4, bedHeight: 0.22, lift: 0.3, // gravel bed (wide like the real line between the houses): width, height above the ground (lift: clear of the pavement slabs the line crosses)
  railWidth: 0.11, railRise: 0.17, // steel rail: width, height above the bed top
  sleeperStep: 0.62, sleeperLen: 0.24, sleeperWidth: 2.5, sleeperRise: 0.07, // a concrete slab across the track every sleeperStep m
  segment: 3, // m: ground-following pieces
  roadMargin: 0.3, // m: a piece closer than this to a carriageway edge (or on it) is not drawn: the level crossing keeps the road
  colours: { gravel: '#8d8982', sleeper: '#a09c94', rail: '#5b5e66' },
  // buildings within `radius` m of a track inside `box` (world m [x0, z0, x1, z1]: along Lê Duẩn opposite Công viên Thống Nhất) are not built, so the line shows
  clear: { radius: 18, box: [-1300, 1380, -1000, 2740] as [number, number, number, number] },
};

// ── Leg 3 Hà Nội: pavement terraces (world/StreetStools.ts): low plastic stools round a low table, some under a parasol. m unless noted. ──
export const streetStools = {
  enabled: true,
  kinds: ['primary', 'secondary', 'tertiary', 'residential', 'unclassified'] as string[],
  minSidewalk: 3, // m of pavement needed
  step: 12, // m between candidate spots along the street (both pavements)
  share: 0.5, // share of candidate spots that get a set (in front of a facade only)
  fromFacade: 2.4, // m from the facade towards the street
  stools: [3, 5] as [number, number],
  parasolShare: 0.4,
  parasol: { radius: 0.9, height: 2.1 },
  stoolColours: ['#d83a2e', '#2f6fc4', '#2f9b4a', '#f0a020', '#e8d34a', '#d8d4c8'] as string[], // the classic plastic stools: red, blue, green, orange, yellow, cream
  tableColours: ['#2f6fc4', '#3a8f4a', '#d8d4c8', '#c9472f'] as string[],
  parasolColours: ['#c8201c', '#2f6fc4', '#e8e4d8', '#e0a030'] as string[],
};

// ── Leg 3 Hà Nội: utility poles + overhead cables (world/PowerLines.ts, 'masonry' bucket, vertex-coloured). m unless noted. ──
export const powerLines = {
  enabled: true, // one switch for poles, cables, crossings, drops and the pole colliders
  kinds: ['residential', 'tertiary', 'secondary', 'unclassified', 'service', 'living_street'] as string[], // streets that get a pole line (one kerb side, hashed per street)
  spacing: 32, // m between poles along the kerb
  curbOffset: 0.45, // m from the carriageway edge onto the pavement
  junctionGap: 6, // m: no pole this close to a junction vertex / a landmark outline
  lampGap: 1.6, // m: a pole this close to a StreetProps lamp slides lampShift m along the kerb
  lampShift: 2.5,
  height: [8, 9.2], // m, hashed per pole
  radius: [0.17, 0.09], // m, concrete shaft at the foot / top (hexagonal)
  armLength: 1.3, // m, steel cross-arm (across the street direction)
  insulators: [2, 4], // per cross-arm, hashed
  transformerOneIn: 6, // a pole-mounted transformer box on 1 in N poles
  lightOneIn: 4, // a street-light arm on 1 in N poles with no StreetProps lamp within lightClear m
  lightClear: 9,
  // cables per span: power (on the cross-arm) + telecom bundles (on the shaft) by road kind; narrow streets (carriageway
  // < narrowWidth m, the Old Quarter) add narrowBonus bundles; tangle: share of spans whose bundles cross each other
  power: { residential: 2, tertiary: 3, secondary: 3, unclassified: 2, service: 1, living_street: 1 } as Record<string, number>,
  telecom: { residential: 2, tertiary: 2, secondary: 1, unclassified: 1, service: 1, living_street: 2 } as Record<string, number>,
  narrowWidth: 8, narrowBonus: 2,
  telecomDrop: [1.5, 2.6], // m below the pole top: the telecom bundles' band
  sag: 0.02, // m of sag per m of span (× 0.7–1.5 hashed per cable)
  maxSpan: 70, // m: longer gaps (poles skipped at junctions / buildings) get no cable
  segments: 6, // straight pieces per span
  thickness: { power: 0.035, telecom: 0.075 }, // m, ribbon width (drawn at true size, both faces)
  spliceOneIn: 3, // a dark splice box on 1 in N telecom bundles
  crossOneIn: 3, // 1 in N poles sends 1–3 cables across the street to a facade on the other side
  crossReach: 14, // m beyond the far kerb to look for that facade
  dropOneIn: 2, // 1 in N poles sends a service drop to the facade behind it
  dropReach: 9, // m behind the pole
  dropHeight: [4.2, 5.6], // m at the facade end
  minClearance: 5.5, // m over the carriageway for every crossing cable (ends lifted / crossing skipped otherwise)
  collider: { radius: 0.15, height: 4 }, // hexagonal prism like props.colliders.lamp
  colours: { concrete: ['#8e8e88', '#9a9892', '#7f7f7a', '#a3a19a'], steel: '#4a4c4e', insulator: '#d8d4c4', transformer: '#5f6366', cable: '#15161a', bundle: '#0e0f12', lamp: '#c9c9c0' },
};

// ── Phase 2B · landmarks (geo/landmarks.ts registry, world/landmarks/: index + parts renderer + g1…g5 details) ──
export const landmarks = {
  glassTile: 3, // m per glass pane (uv unit of the 'glass' material)
  sink: 0.5, // m below the lowest footprint vertex (placeholders)
  detailDistance: 600, // m: buckets with lod 'near' are hidden beyond this (ChunkManager, per mesh bounding sphere)
  // Generic Simple-3D-Buildings part renderer (world/landmarks/parts.ts)
  partCoverage: 0.9, // outline area share covered by its parts (sampled) below which the outline is extruded as well
  coverageSamples: 1500, // max sample points per outline
  roofPitch: 30, // deg: roof height of an untagged pitched roof = half its short side × tan(pitch)
  maxRoofShare: 0.5, // an untagged roof height is at most this share of the part height
  mansard: { inset: 0.3, lower: 0.7 }, // steep lower slope: inset share of the half-width, share of the roof height
  gambrel: { inset: 0.25, lower: 0.6 },
  domeSegments: 24, domeRings: 8, columnSegments: 12, barrelSegments: 8,
  // sRGB; vertex colours of 'masonry' / 'metal', material colours of 'gold' / 'bronze' / 'glass'
  colours: {
    stone: '#d9ccb0', slate: '#4b525a', lead: '#9ba2a8', zinc: '#7c878f', copper: '#6e9f8b', metal: '#5d656c',
    tiles: '#a0603f', brick: '#9b5a44', concrete: '#b9b5ad', gold: '#d4a53c', bronze: '#5a4a32', glass: '#bcd0da',
    waterJet: '#e8f2f8',
  },
};

// ── Step 0 · dev preview harness (preview.html, src/preview.ts; dev server only) ──
export const preview = {
  viewPitchDeg: -35, // default camera: from the south, looking north down at the selection
  viewDistance: 1.6, // × selection half-diagonal
};

// ═════════════════════════════════════════════════════════════════════════════════════════════════════
// Phase 3 (docs/plans/phase3.md): character & camera. Each track edits ONLY its own block and adds no imports;
// the foundation block belongs to the integrator.
// ═════════════════════════════════════════════════════════════════════════════════════════════════════

// ── Foundation · movement + test session (player/Player.ts, main.ts) ──
// SPEC §6.1: the leg file's `movement` block overrides footSpeed / bikeSpeedMultiplier (server-sent, Phase 6).
export const movement = {
  footSpeed: 4, // m/s: standard on-foot speed (the "jog" clip). Leg 2 (Macao): back to 4 (Leg 1 Paris has ×1.5 = 6, SPEC §17.43)
  sprintMultiplier: SPRINT_MULTIPLIER, // SPEC §17.29: × the top speed (foot, swim, bike) while sprint (Shift / LB) is held; the server's limits use the same constant
  bikeSpeedMultiplier: 1.3, // Phase 4: bike speed = footSpeed × this (Leg 2: 1.3 like the legs / schema default; Leg 1 offline had 1.5)
};

const SPAWN_OUT = 14; // m from the origin toward hồ Hoàn Kiếm (facing the lake)
export const playerSetup = {
  spawn: { x: (ARC.x / toArc) * SPAWN_OUT, z: (ARC.z / toArc) * SPAWN_OUT, yawDeg: (Math.atan2(-ARC.x, -ARC.z) * 180) / Math.PI },
  teamColour: '#d8342c', // test team until login (Phase 6): shirt colour
  teamName: 'Đội thử', // name tag
  readyWait: 0.8, // s of simulation after the world is ready before window.__READY__ (URL ?wait= overrides)
  // One-shot gestures (PlayerState.action): total time, and whether WASD is ignored meanwhile. Clip lengths: Interact
  // 2.0 s, Dance_Loop 1.0 s, Hit_Chest 0.33 s + Death01 2.4 s. crash = fall + 2 s on the ground + stand up (SPEC §6.3).
  actions: {
    wave: { seconds: 2.4, locksMovement: false },
    openBox: { seconds: 2.0, locksMovement: true },
    celebrate: { seconds: 4.0, locksMovement: true },
    crash: { seconds: 3.5, locksMovement: true },
    climbOut: { seconds: 1.2, locksMovement: true },
  },
};

// ── A · character model + animation (player/CharacterModel.ts, player/Animation.ts, scripts/process-assets.ts) ──
export const character = {
  // Leg 2: Rocketbox Sports_Male_04 / Sports_Female_02 + backpack (player_m / player_f, menu "Nhân vật"), one skin each
  modelUrl: 'models/player.glb',
  clipsUrl: 'models/player-anims.glb', // 15 UAL clips retargeted per avatar: m_* / f_* (scripts/assets/rig.ts)
  // tank top + backpack = team colour × the atlas grey (folds kept); at night they also glow nightGlow × that colour
  // (× lighting.emissiveScale) so the team still reads under the moon
  // nightGlow: extra emissive on the team-coloured shirt; nightFill: emissive share of the whole body's own colour so faces and
  // skin don't go black under the moon (night only)
  outfit: { nightGlow: 0.35, nightFill: 0.35 },
  fade: 0.2, // s crossfade between clips
  // m: fixed frustum-culling sphere per skinned mesh, centre y above the feet; bones reach 2.06 m from it lying in the
  // crash (Death01 moves the pelvis back), 1.3 m swimming / celebrating; + mesh and hair around the bones
  cullSphere: { y: 0.9, radius: 2.4 },
  // Canvas sprite, constant size on screen: scale 0.05 ≈ 3.6 % of the view height at fov 70 (≈ 39 px at 1080p, the
  // same at 3 m and 20 m); m above the head; hidden beyond maxDistance (m); canvas font px (texture resolution)
  nameTag: { lift: 0.2, scale: 0.05, maxDistance: 80, fontPx: 48, rainbow: ['#e03030', '#f58220', '#f5d90a', '#2fb344', '#1fa3e0', '#3050d0', '#8a3fc9'] as readonly string[] },
  // Locomotion playback = ground speed / the clip's own speed (m/s at timeScale 1), clamped: feet don't slide. Walk / jog:
  // stance-foot speed of the retargeted clip on avatar 0 (process-assets player-anims prints it; avatar 1 × its stride);
  // swim: one stroke cycle ≈ 2.4 m.
  clipSpeed: { Walk_Loop: 0.94, Jog_Fwd_Loop: 5.68, Swim_Fwd_Loop: 1.8 } as Readonly<Record<string, number>>,
  timeScale: { min: 0.4, max: 1.6 },
  // m the body is raised while a clip plays, × its blend weight: Swim_Fwd_Loop lies horizontally at the pelvis height of
  // an upright swimmer (swim.floatDepth keeps the head of Swim_Idle_Loop out), which would sink the whole crawl.
  clipLift: { Swim_Fwd_Loop: 0.3 } as Readonly<Record<string, number>>,
  moveThreshold: 0.25, // m/s horizontal: below = idle / swimIdle / land
  speedSmoothing: 0.12, // s: the ground speed the clips follow is smoothed this much (Animation.ts smoothSpeed): no per-frame stride re-timing / walk ⇄ jog crossfades from one slow physics step
  // m/s: on foot Jog_Fwd_Loop from jogFrom[1], back to Walk_Loop below jogFrom[0]; in between both
  // clips slide a little (Walk_Loop tops out at 0.94 × 1.6 = 1.50 m/s, Jog_Fwd_Loop starts at 5.68 × 0.4 = 2.27 m/s)
  jogFrom: [1.8, 2.1] as const,
  jump: { startAt: 0.07, startSeconds: 0.45 }, // s into Jump_Start (push-off, after its crouch); s before Jump_Loop
  land: { seconds: 0.45, speed: 1.5 }, // Jump_Land (only when landing nearly still): s shown, playback speed
  // Crash (playerSetup.actions.crash 3.5 s): Hit_Chest for `hit` s, Death01 from fall[0] to fall[1] (lying) in
  // fallSeconds, lying ≈ 2 s (SPEC §6.3), then Death01 backwards to 0 in standSeconds (stands up).
  crash: { hit: 0.33, fall: [0.55, 1.45] as const, fallSeconds: 0.6, standSeconds: 0.6 },
  // Procedural arm layers over any clip (UAL has no wave / free celebration clip): wave (G) = right arm, celebrate = both
  // arms over Dance_Loop. Upper arm raised raiseDeg above horizontal, forearm swings sideways (± swing × up) at hz;
  // fade s in and out of the gesture.
  arms: {
    wave: { raiseDeg: 55, swing: 0.45, hz: 1.6, fade: 0.3 },
    celebrate: { raiseDeg: 70, swing: 0.3, hz: 2.2, fade: 0.3 },
  },
};

// ── B · character controller + swimming (player/CharacterController.ts, world/StreetProps.ts colliders) ──
export const player = {
  radius: 0.3, // m, capsule
  height: 1.8, // m, capsule total (UBC male is 1.81 m)
  skin: 0.02, // m, Rapier KinematicCharacterController offset
  maxStep: 0.4, // m, SPEC §5
  minStepWidth: 0.2, // m of free floor needed on top of a step
  maxSlopeDeg: 45, // SPEC §5
  snapToGround: 0.3, // m
  accel: 20, // m/s² toward the target speed on the ground
  airControl: 0.3, // share of accel while in the air
  turnRate: 10, // rad/s: body yaw toward the move direction (GTA-style, no strafing)
  jumpSpeed: 4.4, // m/s up → ≈ 1 m jump
  fallDelay: 0.25, // s airborne without a jump before moveMode 'air' counts as a fall (small drops stay 'walk')
  respawnBelow: -40, // m: below this y (fell through the world) → back to the last safe ground
  fellThrough: 2, // m: feet this far below the terrain grid = fell through it → back to the last safe ground
  spawnCastHeight: 12, // m above max(terrain, Seine) the spawn ray starts (highest walkable surface wins: bridge deck)
  spawnSearch: 20, // m: spiral search radius when the capsule overlaps something at the spawn point
};

export const swim = {
  speedFactor: 0.45, // × movement.footSpeed
  enterDepth: 1.2, // m: feet this far below the Seine surface (over the river bed) → swimming
  floatDepth: 1.35, // m: feet below the surface while swimming (head out of the water)
  buoyancy: 4, // 1/s: vertical spring toward the float height
  climbReach: 0.9, // m from a quay wall: Space climbs out (docs/plans/phase3.md: no stairs down to the water)
  climbLand: 0.6, // m past the wall face where the feet land (behind the parapet)
  climbHeight: 10, // m above the feet the landing ray starts (quay coping ≈ 8.5 m above a swimmer's feet)
  climbClear: 1.2, // m above the landing the body passes (over the 1 m parapet) before it steps down
};

// ── C · third-person camera (player/ThirdPersonCamera.ts) ──
// STYLE_GUIDE "Camera": 3–4 m behind, a bit above the head, slightly looking down; horizon at 40–45 % of the height.
// Near defaults: camera 1.9 m up (just above the head), 3.8 m back, pitch −6° at fov 70 → horizon 42.5 % from the top;
// measured on p3-idle (720p): body ≈ 35 % of the frame height, feet ≈ 20 % from the bottom (in the lower third),
// character ≈ 4 % of the width left of centre (shoulder offset). "Giữa màn hình" is read as horizontally centred: a
// camera above the head at a 40–45 % horizon cannot also centre the body vertically.
export const thirdPersonCamera = {
  modes: ['near', 'far', 'first'] as const, // C cycles
  near: { distance: 3.8, pivot: 1.5, shoulder: 0.35 }, // m behind the pivot, pivot above the feet, right of the spine
  far: { distance: 5.5, pivot: 1.8, shoulder: 0.2 },
  first: { eye: 1.66, forward: 0.1 }, // m above the feet, m ahead of the capsule axis (0.2 m from a wall ≥ near-plane corner)
  bike: { distanceScale: 1.35, pivotAdd: 0.5 }, // Phase 4 hook: further + higher on the bike
  pitchDeg: { initial: -6, min: -70, max: 45 },
  mouseSensitivity: 0.002, // rad per pixel
  gamepadLookSpeed: 2.5, // rad/s at full stick
  // m, ball shape cast (axis → shoulder → back) so the camera never enters a wall; ≥ the near-plane corner (0.19 m at
  // nearPlane 0.1, 16:9, fov 76°), so the near plane never pokes through either
  collisionRadius: 0.2,
  collisionSkin: 0.02, // m kept free beyond the ball: the back cast after a shoulder hit then slides along that wall
  // A wall closer than the shoulder on the right → over the left shoulder; back to the right once that side is clear
  // by shoulder + margin (m) for hold (s), so a facade with small jogs doesn't flip it back and forth
  shoulderSwap: { margin: 0.3, hold: 1 },
  armReturn: 4, // 1/s, exponential lengthening once the obstacle is gone (shortening is instant)
  followSharpness: 12, // 1/s, exponential smoothing of the pivot (lag = speed / 12 ≈ 0.33 m at 4 m/s)
  snapDistance: 4, // m: a pivot jump longer than this (spawn, respawn) is not smoothed
  // Without look input for `delay` s while moving faster than minSpeed (m/s): yaw back behind the body at up to rate
  // rad/s, × cos(angle to the body) so strafing (90°) or walking toward the camera never swings it round.
  recenter: { delay: 1.5, rate: 2, minSpeed: 0.5 },
  fovBoost: { perMps: 0.8, max: 6, sharpness: 3 }, // ° over render.fov per m/s of speed, capped; 1/s smoothing
  waterClearance: 0.3, // m: while swimming the camera stays this far above the Seine surface (feet + swim.floatDepth)
  nearPlane: 0.1, // m, camera near plane in player mode (render.near 0.5 would cut the head when the arm is short)
};

// ═════════════════════════════════════════════════════════════════════════════════════════════════════
// Phase 4 (docs/plans/phase4.md): movement. Each track edits ONLY its own block and adds no imports; the foundation
// block belongs to the integrator. Speeds come only from `movement` (the leg file overrides it in Phase 6).
// ═════════════════════════════════════════════════════════════════════════════════════════════════════

// ── Foundation · bike rules (SPEC §6.3, §6.6) ──
/** SPEC §6.1: top bike speed = footSpeed × bikeSpeedMultiplier (read live: the leg file may change `movement`). */
export const bikeTopSpeed = () => movement.footSpeed * movement.bikeSpeedMultiplier;
export const bikeRules = {
  interactRadius: 2.5, // m from the bike pivot: F takes / mounts it, on foot only (SPEC §6.3)
  sparkleRadius: 30, // m: an available bike sparkles when the local player is this close (SPEC §6.6)
  maxPerPlayer: 1, // taking another bike makes the old one disappear (SPEC §6.3)
};

// ── A · bike model + rider (vehicle/BikeModel.ts, player/Animation.ts IK, scripts/process-assets.ts) ──
export const bikeModel = {
  url: 'models/bike.glb', // Poly by Google "Bicycle" (CC-BY 3.0), recoloured Vélib'-style, basket, split pivots
  // Vélib'-style livery without the brand: grey frame, green mudguards / basket trim, black tyres and saddle
  colours: { frame: '#8f969c', accent: '#5aa532', tyre: '#1b1b1d', saddle: '#232326', metal: '#b9bec2' },
  wheelRadius: 0.33, // m (26"), wheel angle = distance / this
  gearRatio: 2.2, // wheel turns per crank turn
  mountBlend: 0.35, // s: sit / stand crossfade + IK weight ramp on mount / dismount
  sparkle: { count: 12, size: 0.08, height: 1.2, hz: 1.5 }, // points around the bike, m, blink rate
  // Baked by scripts/process-assets.ts (rerun `npm run process-assets bike` after a change; colours above too): saddle
  // top height (m, the source post lowered), handlebar moved back / up (m: upright city reach), crank + pedals widened
  // × crankWidth (source Q-factor ≈ 11 cm), front basket box (m, bike frame: z forward of the pivot, y up).
  build: { saddle: 0.95, barBack: 0.17, barUp: 0.09, crankWidth: 1.8, basket: { z: [0.53, 0.85], y: [0.77, 1.0], width: 0.38 } },
  standLeanDeg: 9, // parked: leaning left on its kickstand (also baked: the stand tip touches the ground at this roll)
  // |BikeState.lean| ≥ 30° while parked = lying on its side (after a crash, track B sets ±this): resting on a grip and a
  // pedal, the body lifted fallenLift × sin²(roll) m off its ground line
  fallenLeanDeg: 80,
  fallenLift: 0.093,
  // Rider (player/Animation.ts setRider): pelvis bone this far above the saddle top, ball of the foot above the pedal
  // axle (m, bike up); extra forward pitch of spine_01 over the Driving_Loop seat pose, neck pitched back (°); ankling:
  // foot + pedal pitch ± ankleDeg around the crank (heel down with the pedal in front, toes down behind)
  rider: { pelvis: 0.1, foot: 0.05, spineDeg: 35, neckDeg: 20, ankleDeg: 12 },
};

// ── B · bike physics + interaction (vehicle/BikeController.ts, vehicle/Bikes.ts, audio/sfx.ts, player/*) ──
export const bike = {
  accelTime: 1, // s from 0 to bikeTopSpeed() (SPEC §6.1)
  brakeDecel: 7, // m/s² while braking (S). Leg 2: back to 7 (Leg 1 ×1.5 speeds used 10)
  coastDecel: 0.6, // m/s² rolling without input
  reverseSpeed: 1, // m/s backwards (S held once stopped): get the nose out of a wall
  turnRate: { slow: 2.4, top: 1.3 }, // rad/s at ~0 and at top speed (linear in between)
  turnMinSpeed: 1, // m/s below which the turn rate fades to 0 (a bike doesn't spin on the spot)
  steerMaxDeg: 25, // front wheel angle at full A / D when slow (half of it at top speed), visual only
  // Turning faster than `rate` rad/s caps the speed at top − loss × excess (m/s per rad/s); above the cap it bleeds at
  // brakeDecel (SPEC §6.1: sharp turns slow down). Full A / D at top speed settles ≈ 87 % of top.
  sharpTurn: { rate: 1.1, loss: 2 }, // Leg 2: back to 2 (Leg 1 ×1.5 speeds used 3)
  leanMaxDeg: 25, // roll at full turn rate and top speed
  leanSharpness: 6, // 1/s
  paveGrip: 0.65, // × turn rate, acceleration and brake on cobbles (SPEC §6.6: less friction on pavé); top speed unchanged
  wallKeep: 0.5, // share of speed kept after grazing an obstacle (SPEC §6.1: collisions slow down)
  crashImpact: 3.2, // m/s of speed lost against an obstacle in one step → crash (SPEC §6.3: strong impact at speed)
  wheelBase: 1.1, // m, front-wheel probe ahead of the pivot (nose doesn't enter walls)
  rearReach: 0.8, // m, rear-wheel probe behind the pivot while reversing (rear tyre edge 0.77 m back)
  dismountSide: 0.7, // m to the left of the bike where the rider lands
  dismountMaxSpeed: 2.5, // m/s: F gets off only at or below this (brake first)
  noseHeight: 0.6, // m above the feet of the front-wheel probe ball: its bottom = player.maxStep, so curbs pass under it
  noseRadius: 0.2, // m, front-wheel probe ball
  bellSeconds: 0.6, // bell ring decay (audio/sfx.ts)
  rollVolume: { asphalt: 0.04, pave: 0.16 }, // tyre noise gain at top speed per surface
  // Local dev bikes until Phase 6 (server bikes): offsets from playerSetup.spawn, m (x east, z south), heading °.
  devSpawns: [[3, 0, 0], [-4, 2, 90], [6, -5, 180]] as [number, number, number][],
};

// ── C · road graph (shared/src/graph/*, scripts/build-graph.ts, geo/roadGraph.ts) ──
export const roadGraph = {
  snapRadius: 80, // m: nearestNode search for GPS / routing from a free position
};

// ── D · stairs + junctions (world/StairBuilder.ts, world/StreetProps.ts, scripts/build-chunks.ts) ──
export const stairs = {
  riser: 0.16, // m target step height when OSM has no step_count (KCC autostep ≤ player.maxStep 0.4)
  tread: 0.32, // m (quay flights and metro wells; OSM flights spread their steps over the way length)
  stringer: { width: 0.25, height: 0.35 }, // m, side walls, height above the nosing line
  handrail: { height: 0.9, radius: 0.025, postEvery: 2.5 }, // m above the nosing line
  base: 0.4, // m the stringers reach below the ground (no gap on a DEM slope)
  metroDepth: 3.5, // m a metro entrance goes down before its closed end (no tunnels)
  metroLanding: 1.5, // m of floor between the last step and the closed gate
  colours: { stone: '#bdb4a3', tile: '#e9e4d8', door: '#3b4045' }, // metro well (flights use the sidewalk + railing materials)
  // Quay flights (SPEC §4.4) along the Seine wall, river side, top landing level with the coping. Build-time policy
  // (scripts/build-chunks.ts places them: rebuild the chunks after changing reach / spacing / width / landing).
  quay: {
    reach: 15, // m: an OSM steps way with an end this close to the river gets a flight on the nearest wall point
    spacing: 400, // m of bank: synthetic flights fill longer gaps
    merge: 30, // m: OSM flights closer than this along the wall become one
    bridgeClear: 15, // m kept free from bridge lines
    width: 2.2, // m
    landing: 2.2, // m of flat top landing (the parapet gap)
    under: 0.5, // m the bottom step lies below the water surface
    rampDepth: 2, // m below the surface the hidden ramp collider reaches (under a swimmer's feet, swim.floatDepth)
    // Steps within sideOpen m of the surface have an open river side over a stone apron reaching `apron` m out and down
    // to rampDepth (≤ 45° up to the steps), so a swimmer coming from the side gets onto them (world/StairBuilder.ts)
    sideOpen: 0.5,
    apron: 3.5,
  },
};

// ═════════════════════════════════════════════════════════════════════════════════════════════════════
// Phase 4B (docs/plans/phase4b.md §5.3): NPC traffic + pedestrians, client only (SPEC §17.5, §17.11). Each track edits
// ONLY its own block and adds no imports; the foundation block belongs to the integrator.
// ═════════════════════════════════════════════════════════════════════════════════════════════════════

// ── Foundation · shared NPC settings (npc/types.ts, npc/roads.ts) ──
/** dims: m width × height × length the models are baked to (process-assets / process-hanoi-vehicles) and the sims use;
 *  share of the fleet (sums to 1); paint: own sRGB paints (else npc.paints); roads: highway kinds it may drive on (else
 *  traffic.kinds); speed: own top speed m/s (below the road's); kerb: always in the kerb lane; max: alive at once. */
type NpcVehicle = { dims: readonly [number, number, number]; share: number; paint?: readonly string[]; roads?: readonly string[]; speed?: number; kerb?: boolean; max?: number };
const ORDINARY = ['secondary', 'tertiary', 'unclassified', 'residential', 'living_street', 'secondary_link', 'tertiary_link']; // no primary (no slow three-wheelers on Trần Hưng Đạo / Giải Phóng)
// Leg 3 Hà Nội mix: two-wheelers ≈ 60 % (wave* = Honda-Wave-like motorbikes with riders from hanoi-vehicles.glb, scooter /
// moto the old Vespa / sport bike riders), taxis ≈ 17 % of the cars (Mai Linh green), xích lô + xe ba gác a few %.
const npcVehicles = {
  city: { dims: [1.7, 1.5, 3.6], share: 0.065 },
  hatchback: { dims: [1.75, 1.45, 4.0], share: 0.05 },
  sedan: { dims: [1.8, 1.45, 4.6], share: 0.05 },
  suv: { dims: [1.9, 1.7, 4.6], share: 0.03 },
  taxi: { dims: [1.8, 1.5, 4.6], share: 0.05, paint: ['#0b7a3b', '#0b7a3b', '#0b7a3b', '#f0f0ec'] }, // Mai Linh green (3 of 4), white
  van: { dims: [2.0, 2.3, 5.4], share: 0.025 },
  truck: { dims: [2.3, 3.0, 6.5], share: 0.01 },
  bus: { dims: [2.5, 3.1, 10.3], share: 0.03, roads: ['primary', 'secondary'], paint: ['#c62828', '#2e8b4a', '#7cb342'] }, // Transerco: red / green / yellow-green skirt, white body
  scooter: { dims: [0.7, 1.4, 1.8], share: 0.06 },
  moto: { dims: [0.8, 1.4, 2.1], share: 0.04 },
  // Hà Nội motorbikes (hanoi-vehicles.glb): paint = tank / side covers; rider shirt + helmet baked per kind
  wave: { dims: [0.7, 1.15, 1.7], share: 0.15, paint: ['#1d1f22', '#c0392b', '#1f3350', '#f2f2ef', '#8d9296', '#7a1f22'] },
  wave2: { dims: [0.7, 1.15, 1.7], share: 0.12, paint: ['#1d1f22', '#2a5db0', '#f2f2ef', '#35503a', '#c3c7ca'] },
  wave3: { dims: [0.7, 1.15, 1.7], share: 0.1, paint: ['#1d1f22', '#c0392b', '#f2f2ef', '#8d9296', '#1f3350'] },
  waveHat: { dims: [0.7, 1.15, 1.7], share: 0.06, paint: ['#1d1f22', '#7a1f22', '#8d9296', '#35503a'] }, // rider under a nón lá
  wave2p: { dims: [0.7, 1.15, 1.7], share: 0.08, paint: ['#1d1f22', '#c0392b', '#2a5db0', '#f2f2ef'] }, // with a pillion passenger
  xichlo: { dims: [1.19, 1.22, 2.52], share: 0.03, paint: ['#b4232a', '#2f6b3a', '#1f4f8a', '#6b6b2a'], roads: ORDINARY, speed: 3, kerb: true, max: 6 }, // paint = canopy / sides
  xichlo2: { dims: [1.19, 1.22, 2.52], share: 0.02, paint: ['#b4232a', '#2f6b3a', '#1f4f8a', '#6b6b2a'], roads: ORDINARY, speed: 2.8, kerb: true, max: 4 }, // with a passenger
  bagac: { dims: [1.12, 1.13, 3.12], share: 0.03, paint: ['#2f5fa8', '#4f7a3a', '#8a6a3a', '#c8b24a'], roads: ORDINARY, speed: 6.5, kerb: true },
} satisfies Record<string, NpcVehicle>;
export const npc = {
  enabled: true, // URL ?npc=0 turns NPCs off (ride-check, physics presets); the spectator ?cam= has them too (§17.11)
  seed: 1, // each sim xors its own constant into it; URL ?npcSeed= overrides
  density: 2, // × traffic.perKm / crowd.perKm, then × the automatic factor (npcRender.autoDensity); URL ?npcDensity=; 2 since 2026-10-04 (SPEC §17.43)
  zoneMargin: 3, // m added to every ExclusionZone radius
  // Leg 2: [x, z, r] where a landmark builds walking surfaces above the DEM (NPCs walk the DEM and would sink into them):
  // the Ruínas de São Paulo platform + great stair (local z −40 … 63.5 of the façade frame, ±12.5 m)
  landmarkZones: [[150, -466, 14], [150, -445, 14], [150, -424, 14], [150, -403, 14], [150, -385, 13]] as [number, number, number][],
  vehicles: npcVehicles as Readonly<Record<keyof typeof npcVehicles, NpcVehicle>>,
  // Old Quarter / Hồ Gươm: within r m of the origin (Đông Kinh Nghĩa Thục square) these kinds' spawn shares are × factor
  boost: { r: 550, kinds: { xichlo: 4, xichlo2: 4 } as Readonly<Record<string, number>> },
  paints: ['#f2f2ef', '#1d1f22', '#8d9296', '#c3c7ca', '#1f3350', '#7a1f22', '#35503a'], // sRGB body paints
};

// ── A · NPC asset pipeline (scripts/process-assets.ts, scripts/fbx.ts, npc/NpcAssets.ts) ──
export const npcAssets = {
  vehiclesUrl: 'models/npc-vehicles.glb', // 1 node per CarKind, vertex colours + _PAINT, wheels in extras
  hanoiUrl: 'models/hanoi-vehicles.glb', // Leg 3 kinds (scripts/process-hanoi-vehicles.ts), same contract; its nodes override / extend the above
  pedsUrl: 'models/npc-peds.glb', // 4 Rocketbox avatars, LOD0 + LOD1, 1 material (atlas) each
  clipsUrl: 'models/npc-ped-anims.glb', // 14 clips m_* / f_*
  atlas: 2048, // px, per-avatar texture atlas (body | head | opacity)
  lod1Ratio: 0.3, // triangle share kept by the LOD1 simplification
  // per template (big = bus, truck). twoWheeler = scooter / moto body: the moto source has 2 092 and meshopt stops at
  // 2 060 (review m5), so its own ceiling, not the car's 2 000; the GLB merges body + rider (tests check the sum).
  maxTris: { car: 2000, big: 2500, twoWheeler: 2100, rider: 1500, ped: 9000, pedLod1: 2500 },
  clipSpeed: { m_walk: 1.01, m_stroll: 0.69, f_walk: 1.21, f_stroll: 0.93 } as Readonly<Record<string, number>>, // m/s root motion (phase4b.md §2.3)
};

// ── B · traffic sim (npc/traffic.ts, npc/lights.ts, npc/roads.ts bridges) ──
export const traffic = {
  driveLeft: false, // Leg 3 Hà Nội drives on the right (Leg 2 Macao: true). npc/roads.ts laneOffset flips the lane side; side-turn lanes + light poles follow
  // highway=* kinds cars drive on (no service: parking entrances, courtyards); npc/roads.ts keeps the largest strongly
  // connected part of them, so no car ever gets stuck in a dead end
  kinds: ['primary', 'secondary', 'tertiary', 'unclassified', 'residential', 'living_street', 'primary_link', 'secondary_link', 'tertiary_link'] as string[],
  perKm: 10, // cars per km of NPC road within radius (× density); placed by length × lanes^laneWeight (traffic.ts refreshNear)
  max: 120, // ≈ 2 × the density-1 count at the Concorde (29 cars), so the cap doesn't eat the ×2
  laneWeight: 0.5, // spawn spot by edge length × lanes^laneWeight (0 = length only; 1 put so many cars on the Concorde avenues that queues at the lights failed the "cars keep moving" test)
  radius: 250, // m around the anchor
  despawnMargin: 50, // m beyond radius
  viewConeDeg: 50, // ± around the anchor's viewYaw: no spawning inside it (closer than render.fog.near)
  stuckSeconds: 60, // standing still this long outside the view cone → despawn
  speed: { default: 8.3, primary: 12.5, living_street: 5.5, roundabout: 9 } as Record<string, number>, // m/s per highway kind (Paris 30 km/h)
  speedJitter: [0.85, 1.1] as const, // per-car factor
  accel: 2, // m/s²
  brake: 4, // m/s²
  minGap: 2, // m bumper to bumper
  latAccel: 2.5, // m/s²: corner speed ≤ √(latAccel × R)
  cornerCut: 6, // m (≤ half the edge) of quadratic Bézier at every node
  cornerAhead: 2, // m: the corner's end must lie this far ahead of its start along both roads (the cut grows when the lane offsets say otherwise: ring joins / exits)
  maxLanes: 4, // per direction (npc/roads.ts lanes(): Étoile's 12 → 4)
  lookAhead: 60, // m of route searched for the nearest obstacle
  obstacleMargin: 0.5, // m beside the car's half width: a body this close to the lane is an obstacle
  yieldLook: 30, // m up the major road a minor-road car checks at a junction without lights
  roundaboutGap: 18, // m of free ring before the entry point (cars entering yield, §17.11)
  ringJoin: { speed: 4, maxSeconds: 6 }, // an entering car reaches the ring at ≈ speed m/s: the ring must stay clear that long (capped)
  queued: 8, // m before a node: a standing car this close still counts as approaching it (yield / ring checks)
  zoneLook: 400, // m: a route choice is refused when it runs into an ExclusionZone without a turn-off within this (an avenue runs 300 m between turn-offs) (traffic.ts intoZone)
  lights: { reach: 30, green: 18, amber: 3, allRed: 2, pedGreen: 8, pedCycle: 40, midStop: 3, kerb: 0.5 }, // m; s (2 phases, 46 s cycle); midStop = m before a lone signal node; kerb = m outside the carriageway the signal pole stands
  bodyRadius: 0.4, // m: the player's body as an obstacle (beside the pedestrians' crowd.bodyRadius)
  stopMargin: 0.3, // m short of a stop line the front bumper halts
  decide: { factor: 1.3, margin: 3 }, // a junction line is judged within braking distance × factor + margin m
  spawnEvery: 0.25, // s between spawns once filled
  rank: { primary: 5, secondary: 4, tertiary: 3, unclassified: 2, residential: 2, living_street: 1, primary_link: 3, secondary_link: 3, tertiary_link: 3 } as Record<string, number>, // junction priority
  turn: { ring: 3, straight: 3, side: 1, back: 0.4, rankFactor: 0.25, straightRad: 0.5, backRad: 1.75 }, // route choice weights at a node × (1 + rankFactor × rank); < straightRad = straight, > backRad = U-turn; ring = stay on the roundabout (≈ 5 exits passed on average)
};

// ── C · pedestrian sim (npc/crowd.ts) ──
export const crowd = {
  perKm: 12, // pedestrians per km of walking band within radius (× density)
  max: 80, // 2 × the old cap (density 2 reached it)
  radius: 120, // m around the anchor
  despawnMargin: 30, // m beyond radius
  bodyRadius: 0.3, // m
  walkSpeed: [1.1, 1.45] as const, // m/s
  strollSpeed: [0.8, 1.0] as const, // m/s
  strollShare: 0.3,
  band: [0.3, 0.8] as const, // share of the sidewalk width out from the kerb, per pedestrian
  inset: 0.8, // m inside the carriageway edge on a living_street
  crossChance: 0.3, // at a mid-block crossing node
  crossGap: 4, // s: no car reaches the crossing within this before stepping out
  // crossing gate: a car below `still` m/s is only its body; a moving one is stretched speed × crossGap + lead m forward; the
  // crossing segment must be ≥ clear m from that rectangle (npc.vehicles dims)
  cross: { still: 0.3, lead: 1.5, clear: 1 },
  carAhead: 1.5, // m: a walker stops when the next this-many metres would touch a car body (living streets, cars on corners)
  pathLat: 0.6, // ± share of a footway's half width a walker keeps to (its own lateral place)
  idle: { per100m: 0.15, seconds: [5, 25] as const }, // stops per 100 m walked; s standing / looking / phoning
  seatEvery: 20, // m along park paths
  seatChance: 0.5,
  seatOffset: 1.5, // m beside the path
  seatRoadClear: 15, // m from any car road
  sitShare: 0.15, // of spawned pedestrians sit on a free seat nearby
  // m: sidestep a player within ahead × side by shift at rate m/s; stand still when the body would touch (holdAhead × holdSide);
  // held longer than holdMax s (a player who does not move, a car waiting for us) → turn back
  avoid: { ahead: 3, side: 1, shift: 1, rate: 2, holdAhead: 1.2, holdSide: 0.45, holdMax: 3 },
  stagger: { seconds: 1.2, push: 0.8 }, // s, m (knocked by the player / the bike nose)
  waveBack: 10, // m: G within this and facing the player → waves back
  avatars: 4, // npc-peds.glb avatar count (PedPose.avatar)
  giveUp: 20, // s waiting at a kerb before choosing a route without crossing
  waveSeconds: 2, // s standing still waving back
  turnRate: 6, // rad/s body yaw toward the walking direction
  hitCooldown: 1.5, // s after a stagger before the same pedestrian can be knocked again
};

// ── D · rendering, colliders, integration (npc/Npc.ts, npc/NpcRenderer.ts, npc/PedRenderer.ts, main.ts, player/*) ──
// Riding into a pedestrian (crowd.step → knocked > 0) crashes the player like riding into an NPC car (§17.11): the
// existing crash when the bike speed ≥ bike.crashImpact (a car collider stops the bike dead, so the same threshold), below
// it only the pedestrian staggers.
export const npcRender = {
  pedLod0: 30, // m: full mesh, shadows, mixer every frame; beyond: LOD1, no shadow
  farAnimEvery: 3, // frames between mixer updates of LOD1 pedestrians
  colliderRadius: 40, // m from the player: cars within get a kinematic cuboid
  maxColliders: 16,
  push: { maxSpeed: 1 }, // m/s: a car overlapping the player shoves it through the KCC
  warmUp: 20, // s simulated after the initial fill (queues at red lights on the first frame)
  // FPS mean over `window` s < minFps → density × down; ≥ okFps for upAfter s → + up; floor min (nextDensity).
  // Off with URL ?npcDensity= / ?wait= and when headless (navigator.webdriver): screenshots must not depend on the frame rate.
  autoDensity: { minFps: 45, okFps: 57, window: 2, upAfter: 5, down: 0.8, up: 0.1, min: 0.25 },
  refresh: 10, // m the anchor moves before the static sets (zebras, chairs, light heads) are gathered again
  cameraClear: 1, // m around a car body box: the camera this close is inside it or has it filling the frame → that car is not drawn (the camera cast ignores NPCs)
  wheelWidth: 0.22, // m, the shared unit wheel (radius per template; wheel angle = CarPose.wheel m / that radius)
  // m; the pole stands exactly at SignalHead (x, z) (already on the right kerb, npc/types.ts) and its lamps look along
  // SignalHead.yaw, toward the arriving cars; the lit bulb sits bulbOut m in front of the housing (not tone mapped)
  lights: { pole: 3.2, bulbOut: 0.25, radius: 200, colour: '#2f3833', bulbs: { red: '#ff2a1a', amber: '#ffae00', green: '#22ff77' } },
  zebra: { depth: 3, stripe: 0.5, radius: 200 }, // m: stripes parallel to the road, stripe wide, stripe apart, depth long
  chair: { colour: '#3f6b3a', radius: 60 }, // Paris park chair green, m
  pedFade: 0.3, // s crossfade between pedestrian clips
  stagger: { tiltDeg: 18, rise: 0.12 }, // root lean toward the push, reached in `rise` s, fading out over crowd.stagger.seconds
  // SPEC §17.11: per-pedestrian clothes (pedOutfit, by PedPose.id). Top = spine / arm bones, bottom = pelvis / leg bones
  // of the atlas' body tile; skin-coloured texels and shoes keep the texture. The texture's lightness (0…1) shades the
  // colour: × (shade[0] + shade[1] · lightness) → folds stay, a black suit becomes any colour. keep = share untinted.
  pedOutfit: {
    top: ['#1f2a44', '#3a3d42', '#7d8189', '#c9b79c', '#a0764a', '#5b6b3a', '#6e2a31', '#e6e1d6', '#8fb0d0', '#15161a', '#2f5a4a', '#b8912f', '#4a5f8a', '#9a4a3a'],
    bottom: ['#15161a', '#2e3035', '#1f2a44', '#3c5a80', '#b9a584', '#6f6f72', '#4b3a2c', '#556046'],
    shade: [0.5, 1.0],
    keep: 0.15,
  },
  zoneRing: '#ff3b30', // ?npcZone / setExclusionZones rings (radius + npc.zoneMargin) while the F3 panel is open
};

// ═════════════════════════════════════════════════════════════════════════════════════════════════════
// Phase 8C (docs/plans/phase8c-graphics.md §6): graphics upgrade. Each track edits ONLY its own sub-block of graphics8c
// (and the older blocks its plan row names); `quality` belongs to the foundation. Every item has:
//   enabled: false = the Phase 7 look, kept as the fallback path (each track sets true once its item works);
//   lowOff:  true = ?quality=low / a weak GPU turns the item off (world/graphics.ts `graphics().on(item)`).
// Finer low-quality choices (texture size, LOD distances) read `graphics().quality` in main-thread create*() code only:
// the chunk worker never knows the quality (its builds stay identical on every machine).
// ═════════════════════════════════════════════════════════════════════════════════════════════════════
export const graphics8c = {
  // [T0] ?quality=low|high > localStorage[storageKey] ('low' | 'high', T1's settings item writes it; reload applies) >
  // auto: 'low' when the WebGL renderer string matches weakGpu (software / integrated GPUs, SPEC §14: ≥ 30 FPS there)
  quality: {
    storageKey: 'cuoc-dua-bi.quality',
    weakGpu: /swiftshader|llvmpipe|softpipe|basic render|intel(?!.*\barc\b)|mali|adreno|powervr/i,
    lowTexture: 1024, // px: the *_1k.webp variant of a texture (scripts/assets/pipeline.ts) on low quality
    anisotropy: 8, // PBR texture sets (world/textures.ts), clamped to the GPU's maximum
    // low quality = close to Phase 7 cost (fix B, review F1): PBR sets colour map only (no normal / ARM map), the ARM
    // map's mean AO (as a grey colour) and roughness instead; trees without a normal map, the river with one normal layer
    lowArm: { roof_slates_03: { ao: 0.82, roughness: 0.5 }, asphalt_02: { ao: 0.72, roughness: 0.77 } } as Record<string, { ao: number; roughness: number }>,
    // Runtime downgrade (world/graphics.ts FpsWatch): on high quality, a mean FPS below `fps` over `seconds` (after
    // `graceSeconds` of play) turns post-processing + the image-based light off for the session (the stored choice stays)
    autoDowngrade: { fps: 24, seconds: 8, graceSeconds: 5 },
  },
  // [T1] sky + light (world/Sky.ts), river (world/Water.ts), post-processing (world/post.ts, hooked in main.ts)
  sky: {
    enabled: true,
    lowOff: false, // low quality: the 1K .hdr (textures/sky_1k.hdr) instead of the 2K one, and no image-based light:
    lowEnvironment: false, // scene.environment on low quality too (SwiftShader bench: −35 % FPS); off = Phase 7 hemi light
    mode: 'hdri' as 'hdri' | 'shader', // 'shader' = three's Sky.js (no file); off = the Phase 7 canvas sky (render.sky)
    sunPosition: { x: -313, y: 320, z: 216 }, // m from the target: south-west, 40° high (STYLE_GUIDE 35–45°); render.sun when off
    sunIntensity: 3.2,
    hemiIntensity: 0.35, // the environment light does most of the fill now (render.hemiLight.intensity when off)
    environmentIntensity: 0.25, // scene.environmentIntensity: image-based light on every standard material
    // without the image-based light (low quality, or the runtime downgrade): sun + hemisphere only, tuned so the street
    // has the same mean brightness as high quality and before 8C (docs/reports/phase8c-fix-b.md)
    low: { sunIntensity: 2.8, hemiIntensity: 2.3 },
    backgroundIntensity: 1,
    horizonBandDeg: 6, // fog colour = mean HDRI radiance from the horizon up to this elevation
    // mode 'shader': Sky.js uniforms, and the fog colour (linear radiance near its horizon, by eye)
    shader: { turbidity: 4, rayleigh: 1.2, mieCoefficient: 0.004, mieDirectionalG: 0.8, cloudCoverage: 0.35, cloudDensity: 0.5 },
    shaderHorizon: [0.55, 0.62, 0.72],
    shaderEnvironmentScale: 0.25, // Preetham radiance is several times the HDRI's: × environmentIntensity
  },
  water: {
    enabled: true,
    lowOff: false,
    normalMap: 'textures/waternormals.jpg',
    layers: [
      { tile: 34, drift: [0.35, 0.2] }, // m per repeat, m/s
      { tile: 13, drift: [-0.18, 0.3] },
    ],
    normalScale: 0.45,
    colour: '#2c434a', // Seine: dark green-grey; the sky reflection (Fresnel) brightens it at grazing angles
    roughness: 0.04,
    envMapIntensity: 1,
  },
  post: {
    enabled: true,
    lowOff: true, // weak GPU / ?quality=low: the plain renderer.render path (canvas MSAA)
    smaa: true,
    bloom: { strength: 0.2, radius: 0.35, threshold: 3 }, // light: only sun glints, gold, neon (strength 0 = no pass)
  },
  // [T2] trees (world/Vegetation.ts + attach LOD), street furniture without the Wallace fountain (world/StreetProps.ts),
  // Flamme de la Liberté (landmarks/models.ts). No T5: pedestrians / NPC vehicles stay as they are (SPEC §17.20).
  // trees: [LOD0, LOD1] distances (m, per tree from the camera): full crown → few big cards → impostor beyond (lowLod on
  // low quality: no full crown). props: per kind [LOD0, LOD1] distances, nothing drawn beyond LOD1; × lowScale on low.
  // flamme: the scan (models/lm-flamme.glb) on the OSM outline, `sink` m below its lowest ground; the scan's paving disc is
  // fitted to the outline radius by scripts/assets/flamme.ts.
  // Low quality (fix B, SwiftShader bench: the leaf cards were the whole FPS gap to Phase 7): lowLod[0] > 0 = the full
  // crown right around the camera (under a tree LOD1's big flat cards show), the impostor from lowLod[1], and only those
  // full crowns cast shadows unless lowShadow (LOD1 shadows ≈ −10 % FPS there)
  trees: {
    enabled: true, lowOff: false, lod: [60, 240], lowLod: [18, 45], lowShadow: false,
    // trunk / limb vertex colours (world/Vegetation.ts barkColour): the bark map (mean colour mapMean, near black-brown)
    // tinted to olive-grey `dark` with flaked grey-cream `light` patches (up to `patch` of the way)
    bark: { mapMean: '#454730', dark: '#5c5a52', light: '#9a978a', patch: 0.8 }, // Hà Nội: darker sấu / xà cừ trunks (was #7a7a72 / #d4d2c4 / 0.9 platane)
    whitewash: 1.3, whitewashColour: '#f6f5f0', // m (scale 1) of whitewashed lower trunk (Hà Nội street trees), its colour
  },
  props: {
    enabled: true, lowOff: false, lowScale: 0.6,
    lod: { lamp: [45, 300], morris: [60, 350], shelter: [60, 350], bench: [35, 160], bouquiniste: [70, 400], cafe: [30, 140] },
  },
  flamme: {
    enabled: true, lowOff: false, sink: 0.05,
    // scripts/assets/flamme.ts, scan units (slice / radial profiles): column axis (x, z), paving disc radius, plaza level;
    // the outline's chunk; triangle budget (pedestal + flame only), texture px. Kept from the scan: above `cut` (the top of
    // the scanned steps; they are replaced by landmarks.g2.flamme.tiers), within `keepRadius` of the axis below `flameFrom`
    // (flowers / debris around the pedestal dropped; the flame's tongues spread wider), parts of ≥ `minPart` triangles
    scan: { axis: [0.69, 1.07], disc: 3.0, floor: 0.17, chunk: '-6_0', tris: 40_000, texture: 2048, cut: 0.72, keepRadius: 0.95, flameFrom: 1.8, minPart: 200 },
  },
  // [T3] SPEC §17.20 (2026-10-03): ONLY the roof slates (roof_slates_03 on the 'roof' material, world/BuildingBuilder.ts
  // createBuildingMaterials) and the asphalt (asphalt_02 on 'asphalt', world/RoadBuilder.ts createRoadMaterials). Facade
  // stone / zinc, sidewalks, setts and terrain keep their Phase 7 canvas textures.
  roofs: { enabled: true, lowOff: false, tile: 2 }, // tile = m covered by one slate texture (roof uv = world metres)
  asphalt: { enabled: true, lowOff: false, tile: 3 }, // m per asphalt_02 repeat (replaces roads.textureTile.asphalt)
};

// ═════════════════════════════════════════════════════════════════════════════════════════════════════
// Phase 5 (docs/plans/phase5.md §5.3): HUD. Each track edits ONLY its own block and adds no imports; the foundation
// block belongs to the integrator. UI texts are Vietnamese (in the modules), sizes in CSS px.
// ═════════════════════════════════════════════════════════════════════════════════════════════════════

// ── Foundation · HUD layout (STYLE_GUIDE "HUD"; ui/hud.css holds the shared look) ──
export const hud = {
  margin: 16, // px from the screen edges
  gap: 8, // px between stacked widgets (the toast feed sits this far above the minimap)
  minimap: { width: 300, height: 190 }, // px, bottom-left, rectangular (SPEC §17.3); track C stacks the toasts above it
};

// ── A · map tiles, minimap, full map (world/mapVectors.ts, ui/MapTiles.ts, ui/Minimap.ts, ui/FullMap.ts) ──
export const minimap = {
  metersPerPx: [0.8, 1.6] as const, // CSS px scale up to movement.footSpeed → at bikeTopSpeed() and above (SPEC §17.3: zooms out when fast)
  zoomSharpness: 2, // 1/s, exponential smoothing of the scale
  anchorY: 0.65, // player position from the top, share of the height (more map ahead of the player, like GTA V)
  maxTiles: 24, // LRU of raster tiles, one per chunk (canvas memory ≈ maxTiles × tile px² × 4 B)
  rasterPerFrame: 1, // tiles rasterised per frame at most (≈ 1–3 ms each on the main thread)
  tilePx: 256, // px per 250 m chunk tile (≈ 1 m/px), × min(2, devicePixelRatio)
  tilePad: 2, // m of neighbour content around each tile: blitted tiles overlap, no seams when the map turns
  routeWidth: 4, // px, GPS line (+ 2 px dark casing each side)
  // Shared by the minimap tiles and the full map. GTA V-like radar: dark blocks, light streets, green parks, blue water.
  colours: {
    outside: '#1d2126', // beyond the map data
    ground: '#50555c', // pavement, squares, courtyards
    building: '#383c42',
    buildingEdge: '#2c2f34',
    park: '#48663f',
    grass: '#557747',
    water: '#3f6f98',
    foot: '#7d828a', // footway, path, cycleway
    pedestrian: '#737880', // pedestrian streets / squares
    service: '#8e939a',
    minor: '#a4a8ae',
    major: '#c6c9cd',
    bridgeCasing: '#23262b',
    steps: '#b9ae97',
    route: '#b863f2', // GPS line + waypoint (GTA purple)
    routeCasing: '#2b1740',
    player: '#ffffff',
    playerEdge: '#16181c',
  },
};
export const fullMap = {
  metersPerPx: [0.4, 6] as const, // CSS px zoom range (6 ≈ the whole 5.5 km map on a 1000 px wide window)
  wheelZoom: 1.2, // scale factor per wheel step (one step per wheel event, like flyCamera)
  wheelGapMs: 60, // min time between wheel steps (a trackpad's stream of tiny events)
  labelMaxMpp: 2, // street names drawn at this zoom and closer (SPEC §4.6: street names only, no landmark names)
  baseMpp: 3, // m/px of the whole-map raster made on open (≈ 1 900 × 1 250 px ≈ 9 MB, dropped on close)
  settleMs: 150, // ms without drag / zoom before the view is redrawn from vectors at its exact scale (zoom < baseMpp × DPR)
  footMaxMpp: 2.5, // footways, cycleways, steps, service roads drawn at this zoom and closer (the base raster: none)
  clickPx: 12, // px: a click this close to the waypoint removes it
  dragPx: 4, // px of movement before a press is a drag, not a click
  // px; same name again within repeatPx: skipped; a name sits on a straight run of its street (no node > bendPx off the text line)
  label: { font: '600 12px system-ui, -apple-system, "Segoe UI", sans-serif', height: 16, pad: 8, repeatPx: 320, bendPx: 4 },
};

// ── B · GPS + street lookup (geo/gps.ts, geo/locate.ts); roadGraph.snapRadius (Phase 4) = snap distance ──
export const gps = {
  offRoute: 25, // m from the route before it is searched again (A* ≤ 3 ms across the map, docs/plans/phase5.md §2)
  minInterval: 1, // s between searches
  arriveRadius: 15, // m: the waypoint is cleared on arrival
  lookAhead: 80, // m of route beyond the current segment the player's foot may jump to (trims the walked part; corners)
};
export const locate = {
  maxDistance: 25, // m: nearest named street (no sidewalk / crossing) within this, else none
  keepDistance: 35, // m: the current street stays while its way is this close (no flicker at junctions)
  recheck: 2, // m the feet move before the street is looked up again (≈ 2–4 lookups / s on foot, ≤ 0.1 ms each)
};

// ── C · menu, settings, toasts, bike notices, respawn (ui/Menu.ts, ui/settings.ts, ui/Toasts.ts, index.html,
//        player/CharacterController.ts respawn + onStairs, vehicle/Bikes.ts refusals, player/ThirdPersonCamera.ts +
//        player/FreeFlyCamera.ts look scaling) ──
export const menu = {
  sensitivity: { min: 0.25, max: 3, step: 0.05 }, // × the camera's mouseSensitivity (settings slider)
  storageKey: 'cuoc-dua-bi.settings', // localStorage (per browser; try/catch, defaults when blocked)
};
export const toasts = {
  seconds: 4, // on screen
  max: 4, // lines in the feed (oldest dropped)
  repeatGap: 3, // s: the same text again within this is dropped
};
export const notices = {
  farReach: 6, // m: a takeable bike this close but beyond bikeRules.interactRadius → "tooFar" (else F stays silent)
};
export const respawnRules = {
  history: 30, // dry spots remembered (newest last), pairwise ≥ spacing apart: ≈ 120 m of fresh ground
  spacing: 4, // m: a new dry spot once the body (on foot or riding) is this far from the newest; older ones this close dropped
  // "Kẹt? Về chỗ an toàn" (and falling through the world) goes back to the newest spot at least minAge s old AND minDistance m
  // away (none: the oldest), so never to the place the player is stuck in, even after standing still or pacing a small yard
  minAge: 5, // s
  minDistance: 15, // m, straight line
  stairsInland: 0.8, // m inland of the parapet gap at the top of the quay flight the swimmer is put on (swim.climbLand = 0.6 lands on the coping)
};

// ── D · HUD widgets + integration (ui/HUD.ts, main.ts, player/Player.ts, ui/DebugOverlay.ts, world/StreetProps.ts
//        district line on the street signs) ──
export const hudWidgets = {
  streetSeconds: 5, // s (race clock) the street / district label stays after a change (SPEC §12: "khi đổi khu vực")
  streetFade: 0.6, // s fade in / out
  bottom: 30, // px from the bottom edge: clears the attribution line (#credits, ~18 px)
};

// ═════════════════════════════════════════════════════════════════════════════════════════════════════
// Phase 6 (docs/plans/phase6.md §5.3): server & presence. Each track edits ONLY its own block and adds no imports; the
// foundation block belongs to the integrator. Wire rates / limits are in @race/shared/protocol (NET), race rules
// (movement, presence, vehicles) come from the leg file via `welcome`.
// ═════════════════════════════════════════════════════════════════════════════════════════════════════

// ── Foundation · session (net/session.ts, main.ts) ──
export const net = {
  defaultRace: 'hanoi', // race id when the URL has no ?race= (the Host's link carries one); each race = one Durable Object
  apiBase: '/api', // same origin (Workers Static Assets + Worker); the Vite dev server proxies it to wrangler dev (vite.config.ts)
};

// ── A · server (worker/src/*): no client tunables; NET in shared/src/protocol/constants.ts + the leg file ──

// ── B · client net + remote players + login (net/NetClient.ts, net/RemotePlayers.ts, ui/Login.ts, main.ts) ──
export const netClient = {
  reconnectMs: [1000, 2000, 4000, 8000, 15000], // backoff per attempt, the last one repeats (SPEC §3: auto reconnect)
  storageKey: 'cuoc-dua-bi.team-code', // localStorage: the team code is remembered (SPEC §8.10), try/catch
  remountSeconds: 3, // after an F5 the team that was riding gets back on its bike if it stands on its feet within this (SPEC §8.10)
  gestureGapMs: 500, // a bell / wave is sent at most this often (the server closes > NET.maxMessagesPerSec)
};
// SPEC §17.40 watch mode (spectate/watch.ts followPose): the camera behind the followed body, m / rad; the keys are in keyTable
export const spectate = {
  back: 5.5, // m behind the feet along the body's heading
  up: 2.3, // m above the feet
  lookUp: 1.4, // m above the feet the camera looks at (the head)
  sharpness: 5, // exponential smoothing (ThirdPersonCamera.follow): higher = tighter
  snapDistance: 10, // m: a jump of the goal longer than this (respawn, a new team) is not smoothed
};
export const remote = {
  // The client sends at sendHz and the server ticks at tickHz (both 5 Hz, unsynchronised): a server tick window holds 0 or 2 client poses
  // every few ticks, so a peer's samples arrive 200 / 400 ms apart. Measured (Leg 3 CETIQLO, two real clients): with 200 / 150 the opponent
  // avatar froze in 48 % of the frames while sprinting ("lag lag"). 320 ms behind + 300 ms of extrapolation bridges every 400 ms gap.
  interpolationMs: 320, // render this far behind the server clock (SPEC §7: buffer ≥ a tick; ticks every 200 ms, gaps up to 400 ms)
  extrapolateMs: 300, // keep moving at the last velocity this long after the newest sample, then hold
  snapDistance: 10, // m: a jump longer than this (respawn, reconnect) is not interpolated
  bufferSamples: 10, // ticks kept per remote player (2 s at 5 Hz)
  clockSlewMs: 1, // ms the server-clock offset estimate sinks per tick (≈ 5 ms/s): drift and one lucky fast tick wear off
  renderRadius: 300, // m: until welcome.presence.renderRadius arrives (DEV ?peers stand-ins)
  hideDy: 8, // m: a remote body this far under the terrain grid is in a Lựa chọn kép room (drawn only for a viewer in one too); Brussels slopes stay well under it
  bellRadius: 60, // m: another team's bell (R) is heard this close
  leanSmoothing: 0.15, // s: a remote rider's lean (derived from the turn rate, not on the wire) follows with this lag
};
// SPEC §17.10: the team's clue box, drawn only once the server sent its position (within boxReveal.radius). Shaped like the
// organiser's real prop (reference photo, docs/reports/phase7-clue-box-model.md): grey base plate, yellow post with a red
// stripe down every face, grey box on top under a flat lid overhanging it on all sides. Sizes in m (total ≈ 1.6 m).
export const clueBox = {
  base: { size: 0.65, height: 0.06, sink: 0.3 }, // sink: the plate also extends this far BELOW the placement point so it never floats on a slope or stair edge
  post: { size: 0.32, height: 1.0, stripe: 0.17, proud: 0.006 }, // stripe: width on each face, `proud` m out of the face (no z-fight)
  head: { size: 0.52, height: 0.5 },
  lid: { size: 0.58, height: 0.05, openDeg: 100 }, // opened box: the lid swung up this far about its back (−z) edge
  colours: { grey: '#737b8c', post: '#f2d30a', stripe: '#c8281e', opened: '#94706b' }, // grey: the photo's #565d6b rendered near black in shade; opened = stripes dimmed to grey-red
  glow: 0.3, // emissive strength of the yellow / red (readable in shade and haze; no real light: one more light recompiles every shader)
  // Over a CLOSED box only: a thin translucent yellow light column fading upward (the 1.6 m prop is ≈ 6 px tall at 150 m, the
  // reveal radius). At least `spread` m wide per m of distance (≈ 4 px at 150 m, fov 70, 720p); faded out between fade[1]
  // and fade[0] m so the prop stands alone up close. Still a 3D object: houses hide it.
  beam: { height: 10, width: 0.08, spread: 0.008, opacity: 0.85, fade: [12, 35] },
};

// ── C · shared bikes (worker/src/race/VehicleSpawner.ts, vehicle/Bikes.ts server mode, host/spawnCandidates.ts) ──
export const serverBikes = {
  claimTimeoutMs: 2000, // F → claim sent; no answer by then → F works again (the socket is probably reconnecting)
  candidateStep: 25, // m between sampled sidewalk points of a corridor when it has too few bicycle_parking nodes
  minCandidates: 12, // per segment, after the parking nodes
  decoyCell: 150, // m: at most one decoy point per square this big (SPEC §6.2 (6): spread over the other streets)
  decoyMargin: 500, // m around the route's bounding box where decoy points may be
  groundRadius: 200, // m: a server bike (y unknown: the server has no DEM) is put on the ground once the player is this close
};

// ── D · dev tooling + minimal Host page (host.html, host/main.ts, scripts/sim.ts) ──
export const hostPage = {
  refreshMs: 1000, // how often the DOM table is rewritten from host.state (SPEC §13: ≤ 1 s)
  reconnectMs: 2000, // Host socket: wait before reconnecting (the token stays valid 24 h)
  colours: ['#2c6bd8', '#d8342c', '#e0b020', '#2c9a4a', '#8a3fc4', '#e07a20', '#20a8b8', '#c0408a'], // team shirt colours, round-robin
  // The fixed cast (Leg 3: the 11 teams of the race, same names + colours as the room tables, choco/chocoBuild.ts TEAMS): "Tạo 11 đội cố định"
  // creates these in order (a name already in the race is skipped); the Host only generates the codes. Same button as Leg 2 (Macao).
  fixedTeams: [
    { name: 'Hai Long 🐉', colour: '#b6e08a' }, { name: 'Chị 6', colour: '#8eead8' }, { name: 'Pha hồn mông', colour: '#d6249f' }, { name: 'V.Hy', colour: '#1a1a1a' },
    { name: '🦖 Chú Hiệp 🦕', colour: '#a31621' }, { name: 'Đạt 0️⃣9️⃣', colour: '#e0a800' }, { name: 'Nhật Nhật', colour: '#1e56d6' }, { name: '🌽 Hiếu', colour: '#f7a8c4' },
    { name: 'Mạnh Ka', colour: '#eadcb8' }, { name: 'Dừa L', colour: '#6b4a37' }, { name: 'Như Chấn', colour: '#6a2fb0' },
  ] as readonly { name: string; colour: string }[],
  noticeMs: 15_000, // how long a host.notice (a refused / warned Host op) stays on the page
  maxLegBytes: 256 * 1024, // leg file the Host may send (host.leg json; the server refuses more)
  addBikeOffset: 3, // m east of the team: "Thêm xe" in the team table puts a shared bike this close to the team's last pose
  // Phase 8 (docs/plans/phase8.md D11 / D14 / D16, track E)
  queueBeep: true, // a new answer in the review queue → a beep (+ a browser Notification once "Bật thông báo" was pressed)
  alertRepeat: true, // the stuck warning sounds again every hostAlerts.stuckMinutes (false: only the first time per team / step)
  mediaHeadRetryMs: 15_000, // HEAD again, this often, only the R2 images still missing (never the whole list)
  reviewLockMs: 1500, // after Duyệt / Phạt the item's buttons stay off this long (a double click is idempotent on the server anyway)
  beepVolume: 0.2, // 0…1, WebAudio gain of the queue / stuck beeps
  queueSlowSeconds: 120, // SPEC §17.42: a review card's wait clock turns orange once the team has waited this long
};

// ═════════════════════════════════════════════════════════════════════════════════════════════════════
// Phase 7 (docs/plans/phase7.md §5.3): race engine. Each track edits ONLY its own block and adds no imports. Race rules
// (zones, transport, penalties) come from the leg file on the server; these are client presentation tunables only.
// ═════════════════════════════════════════════════════════════════════════════════════════════════════

// ── B · client race integration (race/RaceClient.ts, race/PitStop.ts, ClueBoxes, main.ts, Player.ts) ──
export const raceClient = {
  checkinEveryMs: 2000, // standing in the Pit Stop mat zone, not finished yet: `race checkin` this often (SPEC §8.6; idempotent on the server)
  // D17: a spawn / clue box takes the highest walkable surface EXCEPT a rail viaduct top (Bir-Hakeim metro deck, player/railDecks.ts)
  railSlack: 1.5, // m: rail strip half width margin; and in a rail column every hit within railLayerStep − this below the top is skipped
  hintAbove: 1.5, // m: a re-entry spawn ray starts this far above welcome.pose.y (the deck / promenade it stood on, D17)
  opMinGapMs: 800, // F / check-in: at most one `race` op this often (each is preceded by a pose: the server's 15 msg/s limit)
  // Phase 8 (D9): this long after a card countdown ends (server clock estimate) the card flips to active / goToBranch
  // (race/ui/format.ts liveStatus) and the pose is re-sent once, so the server's tick loop wakes and reveals the branch box
  // to a team standing still (a client clock 1–2 s early would send `answer` into answerLocked: critic N8)
  lockEndSlackMs: 1000,
  // Pit Stop (SPEC §8.6 + §17.38): a red mat with yellow stripes at the zone centre, long axis along the zone yaw; its size is
  // PIT_MAT (shared/src/constants.ts): the server counts a team as at the Pit Stop only ON it + the host NPC
  mat: { length: PIT_MAT.length, width: PIT_MAT.width, colour: '#b3201c', stripe: '#f2c230', stripeWidth: 0.5, lift: 0.3 }, // lift = carpet thickness: over the paving overlays (sidewalk tops 0.2 m, Largo do Senado calçada 0.26 m), else buried (leg2-fixes.md item 2)
  // the finish marker, drawn with the mat (so revealed by the same rule, SPEC §17.10): a red light column at the mat centre
  // (taller and redder than a clue box's yellow one, MeshBasic: no bloom needed)
  matBeam: { height: 40, width: 0.5, spread: 0.01, colour: '#ff3b2f', opacity: 0.8 }, // spread: m of width per m of distance (≥ width)
  // offset [side, along] m from the mat centre in the mat's frame (1.4 m outside its long edge); tag: name tag colour (the dark
  // suit colour was unreadable, visual review); tagDistance: m from the camera beyond which its tag hides (screen-size tags:
  // farther away it sat on the team's own, p7-mat)
  host: { shirt: '#23262d', tag: '#ffd75e', tagDistance: 12, name: 'Ceti', offset: [PIT_MAT.width / 2 + 1.4, 1.5], scale: 1.12, waveEveryS: 6, waveRadius: 25,
    at: [398.72, 965.98] as [number, number] | null, // Leg 3: world (x, z) = the middle of the school gate (THPT Trần Phú gate axis, landmarks/tranphu.ts TP); null = beside the mat (`offset`)
    // Ceti's chat bubble for the finish announcement (race/speechBubble.ts): m above the feet, on-screen size = pxScale (screen-height fraction) per canvas px
    bubble: {
      maxQueue: 4, gap: 0.006, maxDistance: 40, pxScale: 0.0006, fontPx: 36, bigPx: 64, wrapAt: 26, tail: 18, glow: 16, supersample: 2, label: 'CETI',
      top: '#ffffff', bottom: '#f1ece0', edge: 'rgba(40, 32, 20, 0.16)', ink: '#0f1120', labelInk: '#a06c0c', shadow: 'rgba(0, 0, 0, 0.38)',
      bigTop: '#ffe9a6', bigBottom: '#f2b93b', bigEdge: 'rgba(120, 72, 0, 0.55)', bigInk: '#1f1503', bigGlow: 'rgba(255, 205, 90, 0.85)',
    } },
};

// ── Leg 3 · the Lựa chọn kép rooms (rooms/roomState.ts, main.ts: chocolate workshop / comic gallery over the world) ──
export const rooms = {
  fadeMs: 450, // ms of the black fade when the body goes into / out of a room (race.css .room-fade transition matches)
  below: 30, // m: the room floor = heightAt(box x, z) − this (under the street: no road / NPC / bike there; the Louvre room's value)
  minFloorY: -35, // m: the floor never lower (player.respawnBelow −40 would fire; codec MIN_Y is −100)
  enterInset: 2.2, // m: entering, the feet land this far inside the door (room enough behind the body for the camera arm); leaving, exitInset m in front of the box: x, z move ≤ 2.2 m, only y changes much (no `respawn`; the server's trusted point banks 400 m of jumps a minute: nothing to flag)
  exitInset: 1.8,
  camera: { shoulder: 0.65, lift: 0.35 }, // ThirdPersonCamera.override inside (the Louvre room's: further over the shoulder, higher)
  maxPeers: 10, // remote bodies drawn inside a room at most (the nearest first; RemotePlayers' own cap otherwise)
};

// ── C · race HUD widgets (race/ui/*: clue card, Sổ mật thư, start-order banner, Pit Stop line, zone panel; ui/HUD.ts clock) ──
export const raceHud = {
  startOrderSeconds: 15, // SPEC §17.12: "Xuất phát ở vị trí thứ n" stays this long (sim clock), then fades (hudWidgets.streetFade)
  colours: { route_info: '#e8b923', detour: '#3b82f6', challenge: '#f0643c', pit_stop: '#3fae5a' }, // D22 step type colours (card stripe / icon)
  cardWidth: 330, // px, top-left mission card (the full card and the book use fullWidth)
  clueLines: 5, // lines of clue text kept on the compact card (the full card / book show everything)
  fullWidth: 520, // px, full card popup + Sổ mật thư
  detourWidth: 940, // px, the Lựa chọn kép card (two halves side by side; the Sổ keeps fullWidth and stacks them)
  finishSeconds: 14, // s (sim clock) the host NPC's finish line stays on screen
  taskLockSeconds: 2, // s the card's server buttons (Nhận thử thách, Chọn / Đổi nhánh, Gửi) stay disabled after a click (the answer comes back as a new `race` view)
  // Phase 8 (docs/plans/phase8.md D9 / D15). Typed-answer / history limits are NET.answerMax / NET.answerHistory (shared: the server cuts at the same numbers).
  mediaMaxHeight: 260, // px, tallest an image on a card / in the Sổ gets (click = full-screen)
};

// ── Leg 3 · CETIQLO head-to-head room HUD (cetiqlo/cetiqloRoom.ts, hud.ts; the rules live in worker/src/race/cetiqlo/config.ts) ──
export const cetiqlo = {
  labelRange: 3, // m: items within this (horizontally) can be picked (the server allows takeRange 3.5 + slack)
  pick: { range: 3.5, coneDeg: 13, reachUp: 2.3, margin: 0.12, holdMs: 120 }, // look-to-select (cetiqlo/logic.ts pickItem): the camera ray's cone half-angle (angular: ×1.6 within 1.5 m), reach above the feet, hysteresis margin / hold
  warnMs: 30_000, // ms left when the clock turns red and beeps every second (= the server's warnMs)
  pip: { left: 358, top: 16, maxWidth: 420, widthVw: 30, snapPx: 640, zoomVmin: 70 }, // px: the brief (store.brief: 3 × 2 stills of the set) right of the clue card, ≤ 30 vw; each still rendered once per set at snapPx²; the zoom lightbox spans zoomVmin % of the screen
  autostepM: 0.05, // m: the KCC autostep inside the store (the street's player.maxStep 0.4 is back on leaving); the stair is a ramp
  // the wait clock (10 min) / pick time / points come straight from worker/src/race/cetiqlo/config.ts CETIQLO (hud.ts, cetiqloRoom.ts): no copy to drift
  lookbookKey: 'KeyT', // opens / closes the brief zoom (lightbox; the pointer is freed while open, a click on a cell zooms one piece)
  rulesKey: 'KeyH', // opens / closes the "Luật chơi" panel (waiting room; the pointer is freed while open, Esc closes)
  board: { x: 6.8, z: 19.2, w: 3.2, h: 1.85, y: 2.05, px: 1024 }, // m, room-local: the waiting area's LIVE BOARD on a pylon in the forecourt outside the shop (east of the door, facing the street side), canvas width px (redrawn only on cq.board)
  bagKey: 'KeyB', // opens the bag (pointer free: click an item to drop it); Digit1–9 drop item n directly
  floor2Y: 2, // m: feet higher than this = floor 2 (the pick's floor filter uses |dy| ≤ 2.2 around the feet)
};
