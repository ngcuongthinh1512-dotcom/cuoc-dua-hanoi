// Every client tunable lives here (CLAUDE.md). Map constants come from @race/shared, never copied.
import { latLonToWorld, PIT_MAT, SPRINT_MULTIPLIER } from '@race/shared';

export { RACE_BBOX } from '@race/shared';

export const render = {
  maxPixelRatio: 2,
  // Placeholder sun until the day/night sky (SPEC §14).
  hemiLight: { sky: 0xdfeaff, ground: 0x5a5448, intensity: 1.2 },
  sun: { color: 0xfff0d8, intensity: 2.6, position: { x: -260, y: 420, z: 180 } }, // south-west, afternoon-ish
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

// Leg 2 (user 2026-10-06): the Macao leg runs in the evening. 'day' = the look above (render.sun / sky, the 8C HDRI) as
// before. Offline tests may override it with ?time=day|night (world/night.ts; ignored inside a real race).
export const timeOfDay: 'day' | 'night' = 'night';

// Night look (world/night.ts `isNight()`; Sky.ts, Water.ts, post.ts, StreetProps.ts). No real lights at night (each one
// recompiles every shader): moon = the one DirectionalLight, lamps / windows / signs = emissive + bloom. Building and
// landmark agents read `windows` / `emissiveScale` through `nightGlow()` (zero emissive by day).
export const lighting = {
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

// Default view (Leg 2): ~60 m above Largo do Senado (the world origin), a little behind it, looking toward the Ruínas de São Paulo.
// (name kept from Leg 1, where this was the Arc de Triomphe)
const ARC = latLonToWorld(22.19753, 113.5408);
const toArc = Math.hypot(ARC.x, ARC.z);
const SPAWN_BACK = 120; // m behind the origin, so Largo do Senado is in view

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
  chimneyChance: 0.35, // per inset roof corner
  chimneySize: [1.1, 0.6, 1.5], // m: along the edge, across, above the roof
  colours: { limestone: '#e3d5b8', zinc: '#6f7c85', iron: '#2a2d30' },
  // Leg 2 (Macao) look, used whenever the Haussmann style is off for a building. Style per building (hash01 of its first vertex):
  // h ≥ towerHeight[1] tower; towerHeight[0]–[1] tower with chance (h − [0]) / ([1] − [0]), else tenement; below: tenement for
  // tenementKinds of h ≥ tenementMin with chance tenementShare, else colonial. Colours are sRGB (vertex colour = linear of it).
  macao: {
    towerHeight: [25, 35], // m
    tenementMin: 15, // m (≈ 5 storeys)
    tenementShare: 0.75,
    tenementKinds: ['yes', 'apartments', 'residential', 'dormitory', 'mixed'] as string[],
    curtainShare: 0.4, // towers with a glass curtain wall; the rest get the tenement texture as a concrete grid
    blankKinds: ['roof', 'garage', 'garages', 'shed', 'storage_tank', 'warehouse', 'hut', 'carport', 'service'] as string[], // no windows
    shopMinHeight: 7, // m: buildings at least this tall get the ground-floor shop band (shopfrontHeight) on street faces
    hip: { chance: 0.6, maxHeight: 20, maxArea: 1500, rise: 1.6, inset: 3.5 }, // colonial low hip roof (m, m², m above / in from the walls)
    colonial: ['#f2d585', '#eec36a', '#e6b062', '#f0bfb0', '#e9a48c', '#bcd4e2', '#c6dcc0', '#f1ece0', '#f4e3b0', '#d9c2e0'],
    tenement: ['#b9b7b0', '#a8a7a0', '#cfc5b0', '#c7aca4', '#a9b5b8', '#b6bfa7', '#d6d4cc', '#bfb39e'],
    concrete: ['#d8ccb2', '#c9c3b8', '#e1d9c9', '#bdb5a5'], // concrete-grid towers
    glass: ['#a9c4dc', '#9fcfcc', '#bcc6ce', '#a8d0dc', '#aab8d0'], // curtain-wall tint
    tileRoof: '#b85a3a', // colonial hip roofs (terracotta)
    flatRoof: '#b2b8be', // flat roofs (concrete)
    roofLift: 2.5, // × roof tint over the dark roof_slates_03 diffuse (graphics8c.roofs); 1 with the canvas roof
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
    motorway: 14, trunk: 14, primary: 12, secondary: 10, tertiary: 9, unclassified: 7, residential: 7,
    living_street: 6, service: 4.5, pedestrian: 6, footway: 3, path: 2, cycleway: 2, steps: 3, track: 3,
    primary_link: 7, secondary_link: 7, tertiary_link: 6, subway: 4.5, rail: 4.5, light_rail: 4.5, tram: 4.5, // rail: 1 track
  } as Record<string, number>, // m, per highway=* / railway=* when neither width nor lanes is tagged
  defaultWidth: 6, // m, kind missing from widthByKind
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
    riverDeck: 1.3, // m: road deck under an upper rail deck over the river when none is in its chunk (Bir-Hakeim ≈ 1.1–1.5)
    endRamp: 15, // m of slab beyond a real chain end, blending down to the ground: covers the carved trench behind the quay wall
    rampGrade: 0.25, // max rise per m where the deck follows steep ground (the quay band's one-cell face); player.maxSlopeDeg 45
    bare: ['Pont Neuf', 'Pont des Arts'] as string[] }, // named decks without railings: world/landmarks/g2.ts draws their parapets
  colours: { asphalt: '#3b3c40', sidewalk: '#bab5aa', pave: '#7f756a', marking: '#f0f0ec', bridge: '#b7aa8f', railing: '#26292c' },
  textureTile: { asphalt: 4, sidewalk: 3, pave: 1.2 }, // m covered by one canvas texture (uv = world metres)
  polygonOffset: { sidewalk: -1, asphalt: -2, pave: -3, marking: -4 }, // factor = units; terrain (0) < … < marking
};

// ── D · terrain + water (geo/heightGrid.ts reads cell/margin; world/Terrain.ts, world/Water.ts) ──
export const terrain = {
  cell: 5, // m, HeightGrid spacing
  margin: 100, // m of grid beyond RACE_BBOX on every side
  chunkRes: 51, // vertices per side of one chunk's terrain mesh (250 m / 5 m + 1)
  waterLevel: null as number | null, // y (m); null = median grid height inside river cells
  riverDepth: 3, // m; river cells are carved to waterLevel − this
  quayHeight: 7, // m; cells within quayBand outside the river are raised to ≥ waterLevel + this (SPEC §4.3: 6–8 m)
  quayBand: 8, // m
  copingWidth: 12, // m of stone slab behind the quay wall (covers the carved one-cell slope)
  copingLift: 0.1, // m above waterLevel + quayHeight
  parapet: 1, // m of quay wall above the coping
  quayGrade: 0.04, // beyond the band the raised floor falls off this steeply until it meets the (smeared) DEM
  padBlend: 25, // m outside a flattened plaza (geo/landmarks PADS) over which the ground eases back to the DEM
  stoneSlope: 1, // |gradient| above this is coloured stone (quay walls: the band drop is ~2)
  colours: { pavement: '#9a9892', park: '#b9a987', grass: '#6f8f4e', stone: '#b3a78f' }, // park = gravel paths
};

export const water = {
  roughness: 0.15,
  otherLift: 0.1, // m above local terrain for non-river water (not carved)
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
  lampSpacing: 30, // m along both sidewalks of car roads
  lampJunctionGap: 10, // m; no lamp this close to a junction
  lampCurbOffset: 0.6, // m from the road edge onto the sidewalk
  carKinds: ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'unclassified', 'residential', 'living_street',
    'motorway_link', 'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link'], // highway=* that get lamps
  streetKinds: ['pedestrian'], // + carKinds: roads whose junctions get signs / Morris columns
  morrisOneIn: 6, // a Morris column at 1 in N junctions (hashed)
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
  // Leg 2 (Macao): one block per landmark group agent (m1…m4 Opus, mf1 / mf2 Fable); each edits only its own block.
  // m1 (world/landmarks/m1.ts, agent o1): Senado square + Portuguese civil buildings / churches + Casa do Mandarim. m above the
  // façade's ground unless noted; "est." = estimated from photos (docs/reports/leg2-landmarks-o1.md), else the source is cited.
  // az = compass deg the main façade faces (the outline edge closest to it carries the façade). Colours sRGB.
  m1: {
    simplify: 1, // m: outline vertices closer than this to the line through their neighbours are dropped (jogs of the OSM ways)
    // floodlit heritage at night: unlit 'neon' with the light baked into the vertex colours (the worker knows no time of day):
    // albedo × tint × (ambient + strength·|n_xz|·(1 − fade·y/H) + top·n_y) × lighting.emissiveScale
    flood: { tint: '#fff0dc', ambient: 0.3, strength: 0.6, fade: 0.4, top: 0.22 },
    window: { trim: 0.16, depth: 0.1, dark: '#1b2027', door: '#4a3224', shutter: '#2f6a4c', litShare: 0.4, glow: 0.9 }, // glow × lighting.windows.intensity
    leal: { // Leal Senado (1784, façade 1876): OSM h 16.8 = pediment top
      // simplify 1.3: the 3 OSM pieces of the front (1.1 m jogs) → one 45 m façade
      az: 45, height: 16.8, simplify: 1.3, bay: 4.1, string: 6, cornice: 12.4, balustrade: 1.3, wall: '#f4f1e9', trim: '#d6cfbf', plinth: '#8b8781', roof: '#6f6c66',
      stair: { steps: 4, riser: 0.16, tread: 0.34, width: 7 },
    },
    santaCasa: { az: 300, height: 16.5, bay: 4.4, string: 6.2, cornice: 12.6, attic: 1.4, wall: '#f7f5ef', trim: '#d9d2c2', plinth: '#8b8781', roof: '#6f6c66' }, // OSM h 16.5
    teatro: { // Dom Pedro V Theatre (1860): OSM h 37 includes the hill → walls 11 m + hipped roof 4 m (est.)
      az: 33, walls: 11, roof: 4, bay: 4.2, wall: '#b9d6b4', trim: '#f5f3ec', roofCol: '#7a5a48',
      portico: { width: 15, columns: 4, pair: 1.1, r: 0.42, height: 8.2, entablature: 1.1, pediment: 2.8 }, // paired Tuscan columns (est.)
    },
    quartel: { // Moorish Barracks (1874, Cassuto): 2 storeys of pointed-arch verandas on a granite podium; OSM h 29.3 includes the hill (est. 12 m)
      az: 44, storey: 5.4, parapet: 1, bay: 3.6, arch: 2.5, wall: '#e2b24e', trim: '#fbf7ee', podium: '#8e8a83', roof: '#8a8178',
      tower: { size: 5, extra: 3.2 }, merlon: { w: 0.55, gap: 0.65, h: 0.7 }, stair: { riser: 0.17, tread: 0.32, width: 6 },
    },
    mandarim: { // Mandarin's House (1869): grey-brick halls round courtyards; OSM h 24.9 = hill (est. halls 7.5 m + 3 m roof)
      wall: '#858987', plaster: '#ecebe4', roof: '#4b4f53', ridge: '#383b3e', walls: 7.5, roof3: 3, eave: 0.8, courtWall: 5, siteWall: 3.8,
      plan: [0.13, 0.09, 0.15, 0.1, 0.13, 0.09, 0.14, 0.17] as number[], // shares of the long axis: hall, court, hall, … (est.)
      moon: { r: 1.35, h: 4.2, sill: 0.15 },
      gates: [[-465.1, 535.8]] as [number, number][], gateWidth: 2.4, // site wall openings (world x, z) where OSM footways cross it (Leg 2 fix)
    },
    domingos: { // St Dominic's (1587, façade 18th c.): OSM h 17.9 = nave ridge; façade 21 m, tower 24 m (est.)
      az: 167, walls: 14, ridge: 17.9, facade: 21, tower: { size: 5.5, height: 24 }, wall: '#f0cd6c', trim: '#fbf8ef', roof: '#8d6a55',
    },
    se: { // Sé Cathedral (rebuilt 1937): OSM has no height; towers 27 m, gable 21 m, nave 15 m (est.)
      az: 342, walls: 15, ridge: 20, gable: 21, tower: { w: 6.5, height: 27, cap: 3 }, wall: '#ddd4c2', trim: '#f6f2e8', roof: '#7a7068',
      fountain: { r: 2.6, wall: 0.55 },
    },
    largo: { // Largo do Senado: Portuguese calçada (cream limestone, black basalt waves running along the square)
      base: '#e8e0cc', wave: '#2b2b2d', lift: 0.23, // lift: over the sidewalk curb tops (roads.lift + curbHeight)
      period: 3.2, amp: 1.1, length: 9, share: 0.42, step: 0.6, mesh: 2.5,
      // fountain (OSM way/402086255, ⌀ 7.1 m): basin, inner tier, pedestal with the armillary sphere (est.)
      fountain: { lat: 22.193683, lon: 113.539889, r: 3.55, wall: 0.8, inner: 1.5, sphere: 0.85, top: 3.4, water: '#2d4b52', glow: '#7fc8ff' },
    },
  },
  // m2 (world/landmarks/m2.ts, agent o2): hill forts, Chinese temples, Lou Lim Ioc garden, hill churches. m above the
  // ground; "est." = estimated from photos (docs/reports/leg2-landmarks-o2.md), else the source is cited. az = compass deg
  // (0 = north) the front faces. Colours sRGB; lamps = 'neon' (unlit, × glow × lighting.emissiveScale, on day and night).
  m2: {
    lamp: { red: '#ff3020', warm: '#ffb85c', window: '#ffc07a', beacon: '#fff0c0', ember: '#ff7a2a' },
    glow: { lantern: 2.2, window: 0.8, beacon: 6, ember: 3, uplight: 4, crest: 0.75 },
    crest: 0.35, // m: lit strip under the top of the fort walls (floodlit look at night; a pale string course by day)
    stair: { riser: 0.17, tread: 0.34 }, // steps (ramp collider: 27°, under player.maxSlopeDeg)
    monte: {
      // Fortaleza do Monte (1617–1626): hilltop fort ≈ 10 000 m² (Wikipedia "Fortaleza do Monte"); wall figures est.
      terraceRise: 1, // terrace this far above the highest DEM point inside the walls (the DEM smooths the hill)
      parapet: 1.1, thick: 1.5, batter: 1.4, // outer face leans in: its foot is batter m outside its top
      merlon: { w: 1.8, gap: 1.1, h: 0.9 },
      cannons: 24, // est.: rows of cannons in the embrasures (photos)
      gateAz: 60, stairWidth: 4, // gate + steps on the edge facing this way (lowest climb there: the hill's high side)
      lightEvery: 14, // m between uplighters at the wall foot
      minFortArea: 4000, // m²: smaller records are zone members (Museu de Macau on the terrace, OSM h 62 = asl)
      museum: { above: 5, colour: '#cfc6b4' }, // m above the terrace (est.)
      colours: { wall: '#8e877a', top: '#7d776b', terrace: '#a39b8b', cannon: '#2a2c2e', carriage: '#4b3a29' }, // G4: weathered dark grey stone (photos), was beige
    },
    guia: {
      // Fortaleza da Guia (1622–1638) on Guia hill: low walls along the hilltop (est.), gate gap 3 m
      wallH: 3.2, thick: 1, merlon: { w: 1.4, gap: 1, h: 0.7 }, gateAz: 170, gate: 3, lightEvery: 12,
      house: { height: 5.5, colour: '#f1ede2', roof: '#9a5a3c' }, // zone members (chapel 1622, keeper's houses): est.
      // Farol da Guia (1865, first modern lighthouse on the China coast): ≈ 15 m white tower (Wikipedia "Guia Lighthouse");
      // the OSM h 104.2 counts the hill. Profile [m above ground, radius]; radii est.
      lighthouse: {
        tower: [[0, 3.1], [1.2, 3.1], [1.25, 2.7], [11.2, 2.2]] as [number, number][],
        gallery: [11.2, 11.6, 2.9], lantern: [11.6, 13.3, 1.45], dome: [13.3, 14.5, 1.7], vane: 15,
        windows: 3, rail: 0.9,
      },
      colours: { wall: '#d6d0c2', top: '#bdb6a6', tower: '#f3f1ea', dome: '#3c4249', rail: '#2a2e33', door: '#5a3a22' },
    },
    ama: {
      // Templo de A-Ma (1488): gate on the Barra square, halls climbing the hill behind (est. from photos)
      az: 270, // the gate faces the Inner Harbour (west)
      tiers: [0, 5, 13, 21] as number[], // m from the front edge where a terrace starts
      gate: { width: 13, height: 5.4, opening: [3, 3.6] as [number, number], depth: 1.4, rise: 1.8 },
      halls: [ // tier, depth, width, w offset (+ = right seen from the gate), eave, roof rise
        [1, 6.5, 14, 0, 4.2, 2.6], [2, 5.5, 9, -3.5, 3.8, 2.3], [3, 5, 8, 4, 3.6, 2.2],
      ] as [number, number, number, number, number, number][],
      coils: 12, // incense coils hanging in front of the prayer hall
      colours: { granite: '#a8a296', brick: '#7f7b74', column: '#a3271f', door: '#7d1d16', roof: '#40594a', ridge: '#5d8a66', lion: '#9c968a', coil: '#6b3a22', rock: '#8c867b' },
    },
    kunIam: {
      // Kun Iam Tong (1627; halls 17th c.): three halls, Shiwan ceramic figures on the ridges (est. from photos)
      az: 212, eave: 5, rise: 4, porch: 2.2, over: 1.3, court: 10,
      colours: { brick: '#8a857c', granite: '#aaa498', column: '#9f2a20', door: '#7d1d16', roof: '#3d5a48', ridge: '#cfc6b0' },
      figures: ['#d9b23a', '#2f8f6a', '#c8482f', '#3d6fb0', '#e8e0cf'],
    },
    louLimIoc: {
      // Jardim Lou Lim Ioc (1906): Suzhou-style walled garden; pond from OSM (water.json); features placed from the OSM pond (est.)
      wallH: 2.8, thick: 0.4, gateAz: 225, moon: 1.5,
      gates: [[819.3, -727.2]] as [number, number][], // world x, z: plain openings where OSM footways cross the wall (Leg 2 fix)
      hallAz: 180, hall: { eave: 5, rise: 3 }, pavilionMax: 60, // zone members: m² below which a building is a pavilion
      pavilions: [[845, -757, 6, 3], [912, -791, 4, 3.2]] as [number, number, number, number][], // x, z, sides, radius
      rockery: { x: 889, z: -819, r: 6, n: 14, h: 4.5 },
      colours: { wall: '#f0ede4', coping: '#565d64', column: '#a32a22', roof: '#4b5157', deck: '#b9b3a6', rock: '#8a8578', base: '#a7a195' },
    },
    churches: {
      // OSM heights (40.5 / 39.2 / 73.3) count the hill: figures below est. from photos. towers: 0 | 1 (centre) | 2 (corners)
      'sao-lourenco': { az: 195, wallH: 12, rise: 5, towers: 2, towerW: 6, towerH: 23, cap: 'dome', facadeH: 15, pediment: 3.5, platform: 1.6, nave: 0.8, windows: 5, colours: { wall: '#e8d7a2', trim: '#f6f3ea', roof: '#8e5c40', door: '#4c3324' } },
      'santo-agostinho': { az: 200, wallH: 13, rise: 4.5, towers: 0, towerW: 0, towerH: 0, cap: 'dome', facadeH: 16, pediment: 4, platform: 0.4, nave: 0.95, windows: 5, colours: { wall: '#e7cd84', trim: '#f6f3ea', roof: '#8a5a40', door: '#4a5a3a' } },
      // G4 (photos): grey granite neo-Romanesque, the bell tower + spire at the façade's right corner (side −1 = right seen from the front), not centred
      'ermida-penha': { az: 45, wallH: 8, rise: 3.5, towers: 1, side: -1, towerW: 4.4, towerH: 20, cap: 'pyramid', facadeH: 10.5, pediment: 0, platform: 0.3, nave: 1, windows: 4, colours: { wall: '#a9a59b', trim: '#c8c4ba', roof: '#5e6166', door: '#4c3324' } },
    } as Record<string, { az: number; wallH: number; rise: number; towers: 0 | 1 | 2; side?: -1 | 0 | 1; towerW: number; towerH: number; cap: 'dome' | 'pyramid'; facadeH: number; pediment: number; platform: number; nave: number; windows: number; colours: { wall: string; trim: string; roof: string; door: string } }>, // side: 1 tower off-centre to the façade's left / right edge
    penhaHouse: { height: 10, colour: '#eeebe3', roof: '#9a5a3c' }, // the bishop's residence beside the chapel (2 storeys + hipped roof, est.)
  },
  // m3 (world/landmarks/m3.ts): Hotel Lisboa, Wynn, MGM, Sands, Fisherman's Wharf (docs/reports/leg2-landmarks-o3.md).
  // OSM heights are kept; everything without a cited figure is estimated from photos. Neon = linear colour × bright ×
  // lighting.emissiveScale (unlit 'neon' bucket, on by day as well, like mf2). World x / z = OSM nodes the records lack.
  m3: {
    pixel: 0.8, // share of a sign pixel cell lit (the rest = the gap between bulbs)
    lisboa: {
      // Hotel Lisboa (1970) + Casino Lisboa, rebuilt from photos (docs/reports/leg2-lisboa-mgm-v2.md). The round 37.4 m OSM
      // record carries the OSM hotel node (n/13679896101) = the white round hotel tower (12 storeys); the 76.8 m record =
      // the 1991 extension; the casino drum = the round south lobe of the 27.8 m podium outline (circle fitted to its nodes).
      round: { floor: 3.1, lit: 0.4, fins: 56, fin: [0.5, 0.8] as [number, number], segs: 48, sign: 'LISBOA', pixel: 1.3, crown: { petals: 16, h: 3.2, parapet: 1.6 } }, // fin: [width, depth] m
      wing: { band: 3.2, lit: 0.3 }, // 76.8 m extension: lit band every `band` m
      casino: {
        x: 501, z: 452, r: 22.5, // world m: fitted to the podium's south arc (OSM nodes), r capped to touch the round tower
        base: 3.5, grid: 15, cornice: 1, // m: dark entrance storey, top of the window grid (3 storeys × 2 rows), cornice
        cols: 72, rows: 6, segs: 72, // window grid
        petals: 20, petalH: 6.5, petalW: 0.96, tilt: 14, // fan arches of the crown: count, height m, share of the bay, outward lean deg
        inner: { r: 0.62, h: 3 }, dome: { r: 0.42, h: 3.5 }, // × r / m: drum behind the petals, central dome on it
        rosette: { r: 3, h: 1.6, petals: 8, petalH: 2.4, finial: 3 },
        podiumCut: 0.8, // the podium is cut off this × r behind the drum centre (the lobe = the casino)
      },
      podiumBands: [7, 13.5, 20], podiumRib: 4.5, // m: bulb strips on the 27.8 m podium, gold lattice ribs between them
      colours: { wall: '#eeece6', tower: '#f3f1ea', fin: '#fbfaf6', glassBand: '#fff0d4', panel: '#c8702a', mullion: '#3e2414', base: '#5a4232', crown: '#d9a73e', ray: '#fff0b8', dome: '#ecd28a', band: '#ffd890', sign: '#ff3a28', podium: '#f0e2c2', bulb: '#ffcf70', rib: '#ffc35a' },
      bright: { rib: 1.8, ring: 2.2, band: 1.2, sign: 2.4, bulb: 1.6, panel: 0.9, glassBand: 0.75, ray: 1.8, petal: 0.95 },
    },
    wynn: {
      // Wynn Macau (2006, OSM 94.5 m) + Encore (2010, OSM 177.5 m): curved bronze-gold glass slabs
      gold: '#b8904e', podium: '#e9dcc0', rim: '#ffd27a', rimBright: 2, rib: 7, ribBright: 1.2, // podium: lit gold ribs every `rib` m
      floor: 3.6, lit: 0.25, band: '#ffe2a8', bandBright: 1, // lit band per floor (share of the floor), whole slab
      sign: 'WYNN', signPixel: 1.6, signColour: '#ff2a2a', signBright: 2.6,
      // Performance Lake (OSM node 4874240221 "Fountain Show"): jets on rings around it
      lake: { x: 622, z: 564, rings: [[0, 1, 16], [6, 8, 9], [13, 14, 6]] as [number, number, number][], jetR: 0.5, jet: '#cfeaff', jetBright: 1.1, light: '#5ab8ff', lightBright: 2 }, // [ring r, jets, jet height]
      kiosk: 6, // m: the untagged 10 × 15 m pavilion by the lake (OSM way/422413328)
    },
    mgm: {
      // MGM Macau (2007), rebuilt from photos: 3 STACKED wave tiers, bottom → top copper / blue glass / gold; OSM 120 m =
      // the crest of the gold roofline. Tier splits, waves, insets and trims are estimates from photos.
      splits: [0.44, 0.72], // tier boundaries, share of the height (mean line of each wave)
      wave: { amp: 5, length: 1.1, phase: [0.6, 2.4, 4.2] }, // m amplitude; wavelength × tower length; phase per boundary (1, 2, roof)
      inset: [0, 1.8, 0], // m: each tier pulled back from the OSM outline (the blue one recedes, the gold one steps forward)
      trim: [[0, 7], [9, 0], [2, 12]] as [number, number][], // m cut off each tier's west / east end (the sideways offsets)
      colours: ['#b86d4a', '#3c6fb4', '#e2b85c'], // copper / blue glass / gold
      bands: ['#ff9a5a', '#8cc0ff', '#ffd890'], bandBright: [0.75, 0.6, 0.7], // lit floor lines per tier (copper fins look)
      floor: 3, lit: 0.14, densify: 5, // m: floor height, lit share, longest outline edge (smooth waves)
      sign: 'MGM GRAND', signShare: 0.62, signPixel: 2.2, signColour: '#fff0c8', signBright: 2.6, signAt: -0.12, // across both long faces of the gold tier; signAt = centre (share of the length, − = west)
      podium: '#d8c49a', rim: '#ffcf70', rimBright: 1.6, rib: 6, ribBright: 1.1,
      // Grande Praça (OSM node 12438388701): glass barrel vault on the podium roof (est. 50 × 26 m, 9 m high)
      praca: { x: 902, z: 858, length: 50, width: 26, rise: 9 },
      // golden lion (OSM way/823036882, on the podium record's artwork point): sitting lion on a round plinth (est. 8 m)
      lion: { plinth: 2.4, scale: 1.15, facing: 110, colour: '#e0a838', bright: 0.9 }, // facing: compass deg (est.: towards Av. Dr. Sun Yat-Sen)
    },
    sands: {
      // Sands Macao (2004, OSM 46.7 m): gold reflective glass drum + "hat" crown between dark glass wings, red sign (G4, photos)
      gold: '#c79c46', dark: '#2b3448', bodyShare: 0.85, // wings: dark glass to this share of the OSM height (46.7)
      bands: [6, 14, 22, 30, 38], band: '#ffcf70', bandBright: 1.6, rib: 5, ribBright: 0.9, rim: '#ffd890', rimBright: 2, // ribs + bands = gold LED grid
      // drum = its own OSM record (way/1418312721, h 61.8 = drum + crown, the records below maxArea m²); z = its centre (world
      // m): the wings' outline is cut there; crown [radius share, height m] bottom → top (est. from photos)
      drum: { z: 97, maxArea: 3000, crown: [[0.8, 1.5], [1.14, 1.4], [0.62, 4], [0.78, 0.8], [0.25, 2]] as [number, number][] },
      sign: 'SANDS', signPixel: 2.2, signColour: '#ff2b20', signBright: 2.6,
    },
    wharf: {
      // Fisherman's Wharf (2005). The amphitheatre is OSM way/192180012 (a plain building without height, not part of
      // the landmark): the Colosseum arcade wraps it (centre / half-axes fitted to its outline, height est.)
      colosseum: { x: 1708, z: 17, a: 49, b: 26, tiers: [8, 8, 6], // tiers: m; the plain block inside is 20 m (buildings.defaultHeight)
        arches: 34, colour: '#d8c29a', arch: '#3b2f22', lit: '#ffc070', litBright: 1.8 },
      // "Babylon" stepped roof on the convention centre (OSM relation/10387813, h 20.8): est.
      ziggurat: { steps: [34, 25, 16], stepH: 4, colour: '#cfae6a', edge: '#ffb84a', edgeBright: 1.8 },
      rim: '#7fd0ff', rimBright: 1.4,
      // lighthouse on the site's seaward tip (outline point farthest towards `azimuth`, `inset` m back)
      lighthouse: { azimuth: 120, inset: 8, height: 18, r: 2.2, white: '#f2efe8', red: '#b8322a', lamp: '#fff4c0', lampBright: 3 },
    },
  },
  // m4 (world/landmarks/m4.ts): Bank of China, Cultural Centre, Kun Iam statue, Lotus Square, Portas do Cerco. Published
  // figures cite their source, the rest is estimated from photos (docs/reports/leg2-landmarks-o4.md). Night: statues /
  // the 1870 arch = 'neon' with a baked floodlight (colour × (ambient + strength · lit side) × emissiveScale, the same by
  // day), glass = 'curtain' with lit windows at night only (BuildingBuilder's facade shader).
  m4: {
    // floodlight bake: ambient + strength × side light (normal's horizontal part, or n·dir), × (1 − fade · height share)
    flood: { ambient: 0.45, strength: 0.75, fade: 0.35, top: 0.25 }, // top: extra on up-facing faces (moon / spill)
    boc: {
      // 163 m, 38 floors, 1991, P&T Architects (Wikipedia "Bank of China Building, Macau", SkyscraperPage); OSM h 116.3
      // = the top of the main shaft, the rest is the stepped crown + mast
      height: 163, body: 116.3,
      tiers: [[0.9, 126], [0.76, 134], [0.6, 141], [0.44, 147]] as [number, number][], // [scale about the centroid, top m]
      pyramid: 156, // m: apex of the crown pyramid over the last tier; the mast goes on to `height`
      mast: 0.7, // m half-width
      floor: 4.1, bay: 3, // m: curtain uv (163 m / 38 floors ≈ 4.3)
      lattice: { w: 9, h: 8.2, t: 0.55, out: 0.18 }, // the diamond lattice: cell width (fitted per face), height, strip width, offset
      colours: { glass: '#8fa6bb', granite: '#d8d0c4', crown: '#c9c3ba', mast: '#9aa0a6', edge: '#cfe6ff', beacon: '#ff3020' },
      edgeIntensity: 2.6, edgeH: 0.8, beaconIntensity: 4, lit: 0.37, // lit = the window seed (curtain shader)
    },
    cultural: {
      // Macau Cultural Centre (1999, O-BS / Intergaup / Caldeira Cabral): Grand Auditorium + Macao Museum of Art; OSM h 25.6
      // = the auditorium block; the rest of the shape estimated from photos
      wall: 16, lobby: 5.5, strip: [10, 12.2] as [number, number], // m: main block top, glazed lobby band, ribbon window
      fly: { u: [0.05, 0.8] as [number, number], w: [-0.62, 0.62] as [number, number], low: 21 }, // auditorium block on the frame (shares, + = rounded end), skillion low side
      sail: { over: 11, rise: 6, t: 0.6 }, // the upturned roof: cantilever beyond the block end, lift at its tip, thickness
      floor: 4, bay: 3, lit: 0.61,
      colours: { stone: '#a1998d', glass: '#9fb4c2', roof: '#b9b6b0', sail: '#ecebe6', edge: '#e8f2ff' }, // G4: grey-brown stone cladding (photos), was near-white
      edgeIntensity: 1.8,
    },
    kunIam: {
      // 20 m bronze statue on a 7 m lotus dome base 19 m across with 16 petals housing the Kun Iam Ecumenical Centre
      // (opened 1999, sculptor Cristina Leiria; Macao Government Tourism Office / gcs.gov.mo); OSM outline = the base (r ≈ 9.7)
      base: { h: 7, petals: 16, depth: 0.08, plinth: 0.8 },
      // robe profile [y above the base, radius]; cross-section deeper across the shoulders (depth share)
      figure: [[0, 2.9], [1.2, 2.6], [5, 2.3], [9, 2.25], [11.5, 2.5], [13.5, 2.55], [14.6, 2.25], [15.4, 1.5], [16, 0.85], [16.5, 0.95], [17.6, 1.15], [18.6, 1.05], [19.4, 0.7], [20, 0.15]] as [number, number][],
      depth: 0.72, sleeves: { y: [8.5, 14.6] as [number, number], r: 0.75, out: 2.1 },
      facing: 300, // compass deg the statue faces (est.: towards the NAPE shore)
      colours: { statue: '#a88b5e', base: '#e4e1d9', plinth: '#9b968c', lamp: '#fff0c8' }, // G4 (photos): bronze figure on a white lotus dome (was all gold)
      bright: 1.25, lampBright: 2.5,
    },
    lotus: {
      // "Lotus Flower in Full Bloom": gilded bronze, 6 m high, 3.6 m across, 6.5 t, on a base of 23 red granite pieces in
      // three lotus-leaf layers (Wikipedia "Lotus Square"; ICM handover museum). `at` = centroid of its OSM outline
      // w/192179914 "Lotus Flower in Full Bloom" (r ≈ 6.4 m: the granite base); n/7668244537 is another, 1995 "Lotus Statue"
      at: [22.194427, 113.553406] as [number, number],
      tiers: [[6.4, 1.0], [5.0, 0.9], [3.6, 0.9]] as [number, number][], // [radius, height] of the 3 granite layers (est.)
      stem: { h: 1.0, r: 0.5 }, flower: { h: 5.0 }, // ≈ 6 m in all: stem + flower (3.6 m across)
      paving: { r: 8.5, rings: 3 }, // the square around it (est.)
      colours: { gold: '#f0c060', granite: '#8c3a30', pave: '#b7a99a', pave2: '#8e8378' },
      bright: 1.35, graniteBright: 0.8,
    },
    portas: {
      // the 1870–71 granite gate (four dates on its face); OSM outline 19 × 3 m; proportions est. from photos
      gate: { w: 9, h: 9.5, open: 2.1, spring: 4.4, attic: [7, 2.1] as [number, number], crest: [3.2, 1.6] as [number, number], wing: 4.8, wingEnd: 0.9 }, // wing: m at the gate, sweeping down to wingEnd at the outer end
      colour: '#cdbb98',
      // the 2004 steel-and-glass border post (Posto Fronteiriço); height est.
      post: { h: 19, band: 4, floor: 4.5, bay: 3, lit: 0.53 },
      postColours: { glass: '#9fb1bd', cladding: '#d9dcdf', edge: '#e8f2ff' },
      edgeIntensity: 1.6,
    },
  },
  // mf1 (world/landmarks/mf1.ts): Ruínas de São Paulo + Macau Science Center. Published figures cite their source, the
  // rest is estimated from photos (docs/reports/leg2-landmarks-f1.md).
  mf1: {
    ruinas: {
      // façade ≈ 27 m high × 23.5 m wide (Macau Heritage / Wikipedia "Ruins of St. Paul's"); OSM outline h 26.4
      width: 23.5, height: 27, depth: 1.6, // m: the stone wall is ≈ 1.6 m thick (est.)
      front: 5.6, // m south of the nave outline's south edge: the façade line of OSM way/192183185 (the 21 × 2 m building=yes slab)
      museumTop: 11, // m above its ground: the Museum of Sacred Art / Crypt (way/192573692, OSM h 30.3) if registered, level with the platform
      tiers: [6.6, 12.2, 17.6, 22.2, 25.5], // m: top of tiers 1–4 and of the pediment (the cross reaches `height`); proportions est.
      tier4Width: 14, pedimentWidth: 10, // m (est.)
      cornice: { h: 0.6, out: 0.9 }, // entablature band between tiers: height, projection in front of the wall (over the capitals)
      column: { r: 0.36, cap: 0.85, segs: 8 }, // shaft radius, square capital / base side; shafts stand columnOut in front of the wall
      columnOut: 0.45,
      statue: { h: 2.6, r: 0.45 }, // the 6 bronze figures (4 Jesuit saints, the Virgin, the child Jesus)
      niche: 0.9, // m: recess depth of the niches / relief panels (front layer of the wall)
      buttress: { w: 1, d: 1.2, n: 3 }, // ribs on the back (the modern steel stair is not built)
      // the stone platform the façade stands on and its great stair (68 steps in reality): the AWS DEM is blurred flat
      // here (≈ 5 m everywhere), so the climb is built: rise = est. 9 m over the OSM steps way (43 m)
      terrace: { halfWidth: 12.5, back: 40, rise: 9 }, // m: half-width of the platform, how far it reaches behind the façade
      stair: { halfWidth: 10, bottom: 63.5, top: 21.65, flights: 4, landing: 4, cheek: { w: 0.6, h: 0.9 } }, // local z (south of the façade foot): bottom = just north of the OSM pedestrian way across the stair foot (world z ≈ −373; was 68.65: its cheeks barred that way), top = OSM stair end (z ≈ −416)
      // side flights down both platform edges where the OSM footway across the Largo in front of the façade leaves it (local
      // z, m; Rua da Ressurreição on the west, the college remains on the east): the DEM is flat, so without them that footway
      // ends at a 9 m drop (Leg 2 fix, docs/reports/leg2-fixes.md)
      sideStairs: { z: 10, width: 3.5, riser: 0.18, tread: 0.3 },
      ruinWall: { h: 1.1, t: 0.7, gapEvery: 7, gap: 1.6 }, // low wall remains along the nave outline and the college outline (east)
      // floodlit façade: unlit vertex colours = stone × (ambient + strength × max(0, n·dir) × (1 − fade·y/height)); dir = from the
      // lamps on the platform up into the façade (uplighting), × lighting.emissiveScale. Same by day (the worker knows no time).
      flood: { stone: '#f1d9ad', ambient: 0.32, strength: 0.8, fade: 0.5, dir: [0, -0.45, 0.9] as [number, number, number], lamp: '#fff0c8', lampBright: 2.5 },
      lamps: [[-4.5, 7], [4.5, 7], [-9.5, 7], [9.5, 7]] as [number, number][], // local x, z of the floodlight boxes on the platform
    },
    science: {
      // I. M. Pei, opened 2009. OSM has no height; the cone (≈ 69 m across the fitted outline arc) is est. 58 m high from photos
      cone: { lat: 22.18587, lon: 113.5566, r: 34.3, h: 58, topShare: 0.28, tiltDeg: 30, lean: 0.3, lowAz: 150, segs: 48 }, // oblique top: lowAz = compass deg of its low side (est.); G4 (photos): steep 30° top cut, axis leaning `lean` m/m away from lowAz (the high side near-vertical)
      dome: { lat: 22.18623, lon: 113.55755, r: 15.3, rings: 7, segs: 32 }, // planetarium: hemisphere on the podium (outline arc radius)
      hall: { corners: [[22.18723, 113.55793], [22.18702, 113.55741], [22.18648, 113.55717], [22.18667, 113.55768]] as [number, number][], h: 16 }, // convention hall (NE), est. height
      podium: { h: 10, band: [3.2, 4.2] as [number, number] }, // exhibition wing, est.; glowing window band y range
      spiral: { turns: 2.5, y0: 5, y1Share: 0.9, h: 1.4, out: 0.3, bright: 1.6 }, // the lit spiral slit following the inner ramp
      colours: { clad: '#cfd4d9', podium: '#dcdedf', spiral: '#8fd0ff', band: '#ffe6bd', hall: '#c4c8cc' },
      bandBright: 1.2,
      nightCladBoost: 3, // cone / dome vertex colour × this at night so the grey metal keeps its daytime look (ponytail: fixed night, a ?time=day dev view over-exposes it)
    },
  },
  // mf2 (world/landmarks/mf2.ts): Macau Tower + Grand Lisboa. Night lights = 'neon' buckets (unlit, HDR colour × intensity
  // × lighting.emissiveScale → bloom); the chunk worker cannot tell day from night, so they stay on by day as well.
  mf2: {
    tower: {
      // Macau Tower, 338 m total (Wikipedia / macautower.com.mo); pod levels from the OSM parts (205–240) and the published
      // observation deck 223 m (level 58) / Skywalk 233 m (level 61). Radii est. from photos.
      shaft: [[0, 11], [12, 9.2], [60, 7.6], [200, 6.8]] as [number, number][], // [y, r]: concrete shaft profile
      fins: { count: 8, topY: 74, innerR: 9, outerR: 19, thickness: 2.4, colliderH: 3 }, // flared base fins (8 in OSM)
      pod: [[200, 6.8], [205, 14], [210, 22.5], [219, 22.5], [224, 22.5], [229, 20.5], [233, 17], [236, 14], [240, 9]] as [number, number][],
      glassBand: [210, 224] as [number, number], // observation levels: glass between these y
      skywalk: { y: 233, r: 20, width: 2.2, railH: 1.2, posts: 24 },
      mast: [[240, 2.6], [300, 2.2], [300, 1.4], [318, 1.4], [318, 0.7], [338, 0.7]] as [number, number][],
      segments: 24,
      colours: { concrete: '#b6b2aa', pod: '#9aa0a8', glassLit: '#ffd9a0', ring: '#8a6cff', beacon: '#ff2a1a' },
      ringIntensity: 2.5, ringH: 1.2, glassLitIntensity: 1.5, beaconIntensity: 12, beaconSize: 1, // neon is not tone-mapped: a channel > 1 clips, so keep the hue (ring stays purple) and let bloom do the rest
      centre: { floor: 4.5, edgeColour: '#8fd0ff', edgeIntensity: 2, edgeH: 0.5 }, // convention centre: slab spacing, roof-edge LED
    },
    lisboa: {
      // Grand Lisboa: 261 m to the mast tip (Wikipedia; CTBUH lists 258 m architectural); OSM's 211.5 is not used. Shape est.
      // from the user's frontal photo (2026-10-06): plain gold shaft with a waist over the dome, lotus crown of stepped petal
      // rows from ≈ 40 % of the height, small sphere + mast. Plan = ellipse on the OSM rectangle's frame (63 × 33 m).
      height: 261,
      shaft: [[0, 0.78, 0.85], [60, 0.62, 0.72]] as [number, number, number][], // [y, × half-long, × half-short]: waist over the dome, then straight
      floor: 4.2, bandEvery: 3, bandH: 0.9, segments: 24, // dark floor band (m tall) every n floors on the shaft; ring segments
      coreTop: 232, // shaft / core roof inside the crown; the spire sits on it
      crown: {
        rows: [[95, 165, 0.8], [118, 190, 0.9], [142, 214, 1.0], [166, 240, 1.1]] as [number, number, number][], // [base y, tip y, × half-sizes at the tip]: each tier wider (stepped vase, widest at the top)
        petals: 10, width: 0.72, // per row (rows offset by half a petal); angular half-width × the petal step (overlap)
        ears: 10, notch: 22, deep: 1.3, // m higher tips towards the long-axis ends (corner "ears"); m lower top-row tips on the broad faces (V notch over the sign); short-axis flare × this
        cup: 0.015, // petal edges pulled in (overlaps cross, no coplanar faces)
        vSteps: 14, tSteps: 4, // grid rows (= gold / darker stripes) and columns per petal
        edge: { width: 0.9, lift: 0.12, from: 0.2 }, // lit petal edge strips: m wide, m off the skin, from this share of the petal up
      },
      spire: [[0, 2.6], [8, 2.6], [9.5, 4], [12, 5], [15, 4.2], [17.5, 1.8], [18, 1.4], [29, 0.5]] as [number, number][], // [y over coreTop, r]: stem, sphere, mast (top = height)
      signY: [-7, -4] as [number, number], // lit sign ring around the core, y over coreTop
      dome: { top: 54, base: 0.82, fit: 0.98, rows: 16, cells: 60, capDeg: 80, ribEvery: 4, rib: 0.6, tealEvery: 12, whiteEvery: 20 }, // squashed sphere: OSM 54 m; base = × the outline radius at the foot (max = fit × outline); diamond lattice: lat rows, cells around (multiple of the 'every's)
      flank: { half: 4.5, at: 1.0, tiers: [[1, 30], [0.78, 35], [0.56, 39], [0.34, 42]] as [number, number][] }, // two stepped towers at the dome's E / W ends: [× half, top y]
      canopy: { azimuth: 180, apex: 16, rim: 12, rimY: 7, rimSpread: 70, fins: 4, spread: [24, 84] as [number, number], fin: [6, 17, 20, 4.5] as [number, number, number, number] }, // main entrance (S, faces the photo's view): tent + leaf fins per side over this spread (°): [foot r, tip r, tip y, half-width] (m)
      colours: { gold: '#d9a441', core: '#8a6324', band: '#4a3412', petalIn: '#7a5a22', stripe: '#a87a2a', white: '#efe9da', spire: '#a8853a', line: '#ffb545', edge: '#ffcf6a', sign: '#fff0c0', rib: '#ffe6b0', teal: '#22c8c0', red: '#ff2a3a', soffit: '#ffc46a' },
      lineIntensity: 0.8, stripeIntensity: 0.6, edgeIntensity: 1.6, signIntensity: 2.2, ribIntensity: 1.5, tealIntensity: 0.7, redIntensity: 1.6, soffitIntensity: 1.2,
    },
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

const SPAWN_OUT = 14; // m from the origin toward the Ruínas de São Paulo
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
  nameTag: { lift: 0.2, scale: 0.05, maxDistance: 80, fontPx: 48 },
  // Locomotion playback = ground speed / the clip's own speed (m/s at timeScale 1), clamped: feet don't slide. Walk / jog:
  // stance-foot speed of the retargeted clip on avatar 0 (process-assets player-anims prints it; avatar 1 × its stride);
  // swim: one stroke cycle ≈ 2.4 m.
  clipSpeed: { Walk_Loop: 0.94, Jog_Fwd_Loop: 5.68, Swim_Fwd_Loop: 1.8 } as Readonly<Record<string, number>>,
  timeScale: { min: 0.4, max: 1.6 },
  // m the body is raised while a clip plays, × its blend weight: Swim_Fwd_Loop lies horizontally at the pelvis height of
  // an upright swimmer (swim.floatDepth keeps the head of Swim_Idle_Loop out), which would sink the whole crawl.
  clipLift: { Swim_Fwd_Loop: 0.3 } as Readonly<Record<string, number>>,
  moveThreshold: 0.25, // m/s horizontal: below = idle / swimIdle / land
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
/** dims: m width × height × length the models are baked to (process-assets) and the sims use; share of the fleet
 *  (sums to 1); paint: own sRGB paints (else npc.paints); roads: highway kinds it may drive on (else traffic.kinds). */
type NpcVehicle = { dims: readonly [number, number, number]; share: number; paint?: readonly string[]; roads?: readonly string[] };
const npcVehicles = {
  city: { dims: [1.7, 1.5, 3.6], share: 0.14 },
  hatchback: { dims: [1.75, 1.45, 4.0], share: 0.16 },
  sedan: { dims: [1.8, 1.45, 4.6], share: 0.14 },
  suv: { dims: [1.9, 1.7, 4.6], share: 0.08 },
  taxi: { dims: [1.8, 1.5, 4.6], share: 0.12, paint: ['#1d1f22'] }, // Paris taxis are dark, white "TAXI" roof light
  van: { dims: [2.0, 2.3, 5.4], share: 0.08 },
  truck: { dims: [2.3, 3.0, 6.5], share: 0.05 },
  bus: { dims: [2.55, 3.1, 12], share: 0.05, roads: ['primary', 'secondary'], paint: ['#e8ebe6'] },
  scooter: { dims: [0.7, 1.4, 1.8], share: 0.1 },
  moto: { dims: [0.8, 1.4, 2.1], share: 0.08 },
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
  paints: ['#f2f2ef', '#1d1f22', '#8d9296', '#c3c7ca', '#1f3350', '#7a1f22', '#35503a'], // sRGB body paints
};

// ── A · NPC asset pipeline (scripts/process-assets.ts, scripts/fbx.ts, npc/NpcAssets.ts) ──
export const npcAssets = {
  vehiclesUrl: 'models/npc-vehicles.glb', // 1 node per CarKind, vertex colours + _PAINT, wheels in extras
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
  driveLeft: true, // Macao drives on the left (Leg 1 Paris: false). npc/roads.ts laneOffset flips the lane side; side-turn lanes + light poles follow
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
    storageKey: 'cuoc-dua-macao.quality',
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
    bark: { mapMean: '#454730', dark: '#7a7a72', light: '#d4d2c4', patch: 0.9 },
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
  storageKey: 'cuoc-dua-macao.settings', // localStorage (per browser; try/catch, defaults when blocked)
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
  defaultRace: 'macao', // race id when the URL has no ?race= (the Host's link carries one); each race = one Durable Object
  apiBase: '/api', // same origin (Workers Static Assets + Worker); the Vite dev server proxies it to wrangler dev (vite.config.ts)
};

// ── A · server (worker/src/*): no client tunables; NET in shared/src/protocol/constants.ts + the leg file ──

// ── B · client net + remote players + login (net/NetClient.ts, net/RemotePlayers.ts, ui/Login.ts, main.ts) ──
export const netClient = {
  reconnectMs: [1000, 2000, 4000, 8000, 15000], // backoff per attempt, the last one repeats (SPEC §3: auto reconnect)
  storageKey: 'cuoc-dua-macao.team-code', // localStorage: the team code is remembered (SPEC §8.10), try/catch
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
  interpolationMs: 200, // render this far behind the server clock (SPEC §7: buffer ~200 ms; ticks every 200 ms)
  extrapolateMs: 150, // keep moving at the last velocity this long after the newest sample, then hold
  snapDistance: 10, // m: a jump longer than this (respawn, reconnect) is not interpolated
  bufferSamples: 10, // ticks kept per remote player (2 s at 5 Hz)
  clockSlewMs: 1, // ms the server-clock offset estimate sinks per tick (≈ 5 ms/s): drift and one lucky fast tick wear off
  renderRadius: 300, // m: until welcome.presence.renderRadius arrives (DEV ?peers stand-ins)
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
  host: { shirt: '#23262d', tag: '#ffd75e', tagDistance: 12, name: 'Người dẫn chương trình', offset: [PIT_MAT.width / 2 + 1.4, 1.5], scale: 1.12, waveEveryS: 6, waveRadius: 25 },
};

// ── C · race HUD widgets (race/ui/*: clue card, Sổ mật thư, start-order banner, Pit Stop line, zone panel; ui/HUD.ts clock) ──
export const raceHud = {
  startOrderSeconds: 15, // SPEC §17.12: "Xuất phát ở vị trí thứ n" stays this long (sim clock), then fades (hudWidgets.streetFade)
  colours: { route_info: '#e8b923', detour: '#3b82f6', challenge: '#f0643c', pit_stop: '#3fae5a' }, // D22 step type colours (card stripe / icon)
  cardWidth: 330, // px, top-left mission card (the full card and the book use fullWidth)
  clueLines: 5, // lines of clue text kept on the compact card (the full card / book show everything)
  fullWidth: 520, // px, full card popup + Sổ mật thư
  finishSeconds: 14, // s (sim clock) the host NPC's finish line stays on screen
  taskLockSeconds: 2, // s the card's server buttons (Nhận thử thách, Chọn / Đổi nhánh, Gửi) stay disabled after a click (the answer comes back as a new `race` view)
  // Phase 8 (docs/plans/phase8.md D9 / D15). Typed-answer / history limits are NET.answerMax / NET.answerHistory (shared: the server cuts at the same numbers).
  mediaMaxHeight: 260, // px, tallest an image on a card / in the Sổ gets (click = full-screen)
};
