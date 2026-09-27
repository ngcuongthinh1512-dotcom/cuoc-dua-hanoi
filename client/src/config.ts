// Every client tunable lives here (CLAUDE.md). Map constants come from @race/shared, never copied.
import { latLonToWorld } from '@race/shared';

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
  shadowHalfExtent: 80, // m around the origin (one fixed shadow box, see DevScene)
  shadowFar: 1200, // m from the sun position
  exposure: 1,
  fov: 70, // vertical, degrees
  near: 0.5, // m
  far: 12_000, // m; the race area is ~5.5 × 3.7 km
  background: 0xbfd3e6, // sky; also the fog colour so the horizon blends
  // Clear up to 4.5 km so a top-down view from ~4 km shows the ground. Phase 2 retunes for real streets.
  fogNear: 4_500,
  fogFar: 11_000,
};

export const physics = {
  fixedDt: 1 / 60, // s
  maxSubSteps: 5, // per frame; time beyond this is dropped instead of spiralling
  maxFrameDt: 0.25, // s; clamps huge frame deltas (tab switch, breakpoint)
  gravity: { x: 0, y: -9.81, z: 0 },
};

// Default view: ~60 m above Concorde, a little behind the obelisk, looking toward the Arc de Triomphe.
const ARC = latLonToWorld(48.8738, 2.295);
const toArc = Math.hypot(ARC.x, ARC.z);
const SPAWN_BACK = 120; // m east of the obelisk, so the obelisk is in view

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
  walkSlow: ['ShiftLeft', 'ShiftRight'],
  jump: ['Space'],
  interact: ['KeyF'],
  clueBook: ['Tab'],
  map: ['KeyM'],
  camera: ['KeyC'],
  binoculars: ['KeyB'],
  menu: ['Escape'],
  debug: ['F3', 'Backquote'],
  wave: ['KeyG'], // vẫy tay chào
  bell: ['KeyR'], // bấm chuông/còi xe đạp
  flyUp: ['Space', 'KeyE'],
  flyDown: ['KeyQ'],
  flyFast: ['ShiftLeft', 'ShiftRight'],
};

export type Action = keyof typeof keyTable;
export const keys: Readonly<Record<Action, readonly string[]>> = keyTable;

// ═════════════════════════════════════════════════════════════════════════════════════════════════════
// Phase 2 (docs/plans/phase2.md): one block per package. Each package edits ONLY its own block and adds
// no imports. Chunks hold raw OSM facts; every default below is applied by the builders at build time.
// ═════════════════════════════════════════════════════════════════════════════════════════════════════

// ── F · streaming + integration (world/ChunkManager.ts, workers/chunkBuilder.worker.ts, world/Bounds.ts) ──
export const chunks = {
  loadRadius: 800, // m around the camera (SPEC §4.4); 600 on integrated GPUs, together with fog
  unloadRadius: 1000, // m; > loadRadius so chunks at the edge don't thrash
  altitudeFactor: 1.5, // radius = max(loadRadius, cameraY × this): a high camera (topdown) loads everything
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
  haussmannKinds: ['yes', 'apartments', 'residential', 'commercial', 'retail', 'office', 'hotel'],
  haussmannHeight: [12, 35], // m, min/max height for the Haussmann style
  shopfrontHeight: 4.5, // m, ground floor
  mansardHeight: 4, // m, zinc roof band at the top
  mansardInset: 1.2, // m, clamped per vertex to half the shortest edge
  balconyFloors: [2, 5],
  balconyMinEdge: 3, // m; shorter outer-ring edges get no balcony
  colours: { limestone: '#e3d5b8', zinc: '#6f7c85', iron: '#2a2d30' },
};

// ── C · roads + bridges (world/RoadBuilder.ts, world/BridgeBuilder.ts) ──
export const roads = {
  sidewalkWidth: 3.5, // m each side (SPEC §4.4: 3–4 m)
  curbHeight: 0.15, // m (STYLE_GUIDE)
  laneWidth: 3.25, // m; width = lanes × this when there is no width tag
  widthByKind: {
    motorway: 14, trunk: 14, primary: 12, secondary: 10, tertiary: 9, unclassified: 7, residential: 7,
    living_street: 6, service: 4.5, pedestrian: 6, footway: 3, path: 2, cycleway: 2, steps: 3, track: 3,
  } as Record<string, number>, // m, per highway=* when neither width nor lanes is tagged
  defaultWidth: 6, // m, highway=* missing from widthByKind
  widthByName: { 'Place Charles de Gaulle': 36 } as Record<string, number>, // m, overrides everything
  maxSegment: 10, // m; ribbons are subdivided so they drape on the terrain
  lift: 0.05, // m above the terrain
  centreLine: { width: 0.15, dash: 3, gap: 5, junctionCut: 8 }, // m; white dashes on two-way roads with 2+ lanes
  bridge: { deckThickness: 1, railingHeight: 1.1, endSample: 5, railLayerStep: 6 }, // m
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
  colours: { pavement: '#9a9892', grass: '#6f8f4e' },
};

export const water = {
  roughness: 0.15,
  otherLift: 0.1, // m above local terrain for non-river water (not carved)
  normalScroll: 0.02, // UV units per second
  colour: '#3d5a66',
};

// ── E · vegetation, street props, signs, landmarks (world/Vegetation.ts, world/StreetProps.ts, world/Landmarks.ts) ──
export const props = {
  treeScale: [0.8, 1.2], // hashed per tree
  lampSpacing: 30, // m along both sidewalks of car roads
  lampJunctionGap: 10, // m; no lamp this close to a junction
  morrisOneIn: 6, // a Morris column at 1 in N junctions (hashed)
  maxTriangles: 300, // per prop mesh
  signs: { cellW: 256, cellH: 64, dedupe: 15, enamel: '#1d4f9c', border: '#2f7d4a', text: '#ffffff' }, // px, px, m
  landmarks: { eiffelHeight: 330, arcHeight: 50, pyramidHeight: 21.6, obeliskHeight: 23 }, // m, used when OSM has no height
};

// ── Step 0 · dev preview harness (preview.html, src/preview.ts; dev server only) ──
export const preview = {
  viewPitchDeg: -35, // default camera: from the south, looking north down at the selection
  viewDistance: 1.6, // × selection half-diagonal
};
