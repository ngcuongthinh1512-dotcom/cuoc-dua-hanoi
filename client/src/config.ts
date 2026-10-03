// Every client tunable lives here (CLAUDE.md). Map constants come from @race/shared, never copied.
import { latLonToWorld, SPRINT_MULTIPLIER } from '@race/shared';

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
  sprint: ['ShiftLeft', 'ShiftRight'], // SPEC §17.29: hold = ×movement.sprintMultiplier, on foot and on a bike
  jump: ['Space'],
  interact: ['KeyF'],
  clueBook: ['Tab'],
  clueCard: ['Enter', 'NumpadEnter'], // Phase 8: reopen the current card (answer history, input) when no card / book / menu / map is open
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
  flyToggle: ['KeyV'], // player ⇄ free-fly camera, only while the F3 debug panel is open (docs/plans/phase3.md)
  graphToggle: ['KeyN'], // road graph overlay (roadgraph.json), only while the F3 debug panel is open
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
  haussmannHeight: [12, 35], // m, min/max height for the Haussmann style
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
  // g1: Eiffel + Arc = downloaded GLB (scripts/process-assets.ts → public/models, placed by world/landmarks/models.ts)
  g1: {
    sink: 0.3, // m the models sit below the lowest footprint vertex (terrain undulation)
    // Eiffel (fr.wikipedia.org/wiki/Tour_Eiffel): platforms 57.63 / 115.73 / 276.13 m, top 330 m, base 124.9 m square
    eiffel: { platforms: [57.63, 115.73, 276.13], height: 330, halfBase: 62.45, colour: '#806a50', // ≈ "brun Tour Eiffel"
      // process-assets: xz widening [y, factor] of the model (its 2nd / 3rd floors are ≈ 26 / 10 m wide; real ≈ 38–41 m
      // (1,430 m²) and ≈ 18.7 m (350 m²), fr.wikipedia); constant above the last knot
      widen: [[57.63, 1], [115.73, 1.4], [276.13, 1.6]] },
    // Eiffel collider: 4 legs up to the 1st platform, [y, outer half-size, leg width] (the area under the tower stays open)
    eiffelLegs: [[0, 62.45, 26], [28, 47, 20], [57.63, 36, 15]],
    // Arc (fr.wikipedia.org/wiki/Arc_de_triomphe_de_l'Étoile): 49.54 m high, 44.82 × 22.21 m; main arch 29.19 × 14.62 m,
    // transverse arches 18.68 × 8.44 m
    arc: { height: 49.54, halfWidth: 22.41, halfDepth: 11.1, mainArch: [29.19, 7.31], sideArch: [18.68, 4.22], roofY: 48.9, roofInset: 0.8,
      coreY0: 31, roofColour: [0.5, 0.45, 0.38], // process-assets: stone core/terrace box (linear RGB) in the GLB
      // process-assets: photogrammetry texture (grey, overcast photos) → warm limestone: brightness × per-channel gain
      texture: { brightness: 1.3, gain: [1.06, 1, 0.9] },
      // Tomb of the Unknown Soldier (approximate sizes, near LOD): m, sRGB
      tomb: { halfWidth: 0.8, halfLength: 1.5, height: 0.12, rosette: 0.55, granite: '#8a857c' } },
  },
  // g2 Seine bridges (world/landmarks/g2.ts). m unless noted; published figures are cited in g2.ts.
  g2: {
    topGap: 0.25, // m: bridge bodies stop this far under BridgeBuilder's deck line (estimated here with its formula, ± 0.2 m)
    slabGrip: 0.3, // m the Bir-Hakeim viaduct columns reach up into the metro slab
    springAbove: 0.6, // m above the water: arch springing / pier caps
    pierDepth: 0.5, // m below the carved bed
    minChannel: 8, // m: shorter runs of river bed under the axis are ignored
    archSegments: 16,
    postStep: 3, // m between spandrel posts of the steel arches (LOD near)
    colours: {
      birHakeim: '#4f5d57', alexandre: '#7a817c', arts: '#3b4448', alma: '#77808a', pier: '#cfc2a6',
      granite: '#8e8a83', black: '#1d1e21', globe: '#f1ede0', planks: ['#8b6b4a', '#7a5c3e', '#93724f'],
    },
    birHakeim: {
      spans: 3, // steel arches per river arm (fr.wikipedia.org/wiki/Pont_de_Bir-Hakeim)
      pierWidth: 5, ribs: 6, ribWidth: 0.5, ribDepth: 1.2,
      viaductHalf: 3.4, // m from the axis to each column line of the metro viaduct
      columnSpacing: 8, columnRadius: 0.32, braceDrop: 1.8, // cast-iron columns + the arched braces between them
      island: 14, // m: stone massif under the viaduct over the Île aux Cygnes (its arch lets the promenade through)
      statueHeight: 4.5, plinth: 2, // La France renaissante (proxy)
      // node/3610838785, not attached to the record (> landmarks `near`); used when rec.points has no statue
      statueAt: [48.8557606, 2.2878413] as [number, number],
    },
    alexandre: {
      rise: 6.28, // m, single 107.5 m steel arch (en.wikipedia.org/wiki/Pont_Alexandre_III); clamped to the carved river
      ribs: 15, ribWidth: 0.45, ribDepth: 1.3, crownDepth: 0.5, abutment: 6,
      spandrelInset: 0.3, // m the outer spandrel plates sit behind the face rib
      pylon: 17, // m, the 4 granite pylons (OSM height=17), gilded Renommée + Pegasus group on each
      statueHeight: 4.5, // gilded group (proxy)
      lampHeight: 6, figureHeight: 3.2, sculptureHeight: 2.2, plinth: 1.3,
      balusterStep: 0.5, // m (LOD near)
    },
    pontNeuf: {
      arches: { long: 7, short: 5 }, // right-bank arm 7, left-bank arm 5 (fr.wikipedia.org/wiki/Pont_Neuf)
      longArm: 100, // m of river under an arm above which it is the long one
      pierWidth: 5, bayBump: 1.2, voussoir: 0.9, cutwaterTop: 1.5, parapet: 1, parapetThickness: 0.45,
      mascaronStep: 1.6, // 381 mascarons along both cornices (fr.wikipedia.org/wiki/Pont_Neuf)
      lampHeight: 4.5,
      // Henri IV: pedestal way/200452259 (drawn by BuildingBuilder, buildings.smallHeight tall) centre; dir = rad from
      // east toward south along its long axis, facing the Place Dauphine
      henri: { at: [48.857136, 2.340968] as [number, number], dir: 0.5, statueHeight: 4 },
    },
    arts: {
      spans: 7, // 7 arches since the 1984 rebuild, 155 m × 11 m (en.wikipedia.org/wiki/Pont_des_Arts)
      pierWidth: 3.4, ribs: 5, ribWidth: 0.35, ribDepth: 0.7, plank: 0.6,
      deckLift: 0.3, // m: planks above the estimated deck line (± 0.2 m), so they always cover BridgeBuilder's stone surface
      railing: 1.1, railPostStep: 1.5, lampHeight: 3.2,
    },
    alma: { pierWidth: 4, girderDepth: 2, haunchDepth: 4.5, haunchLength: 45, zouaveHeight: 5.2, zouaveBase: 1 },
    // Sized on the scan (models/lm-flamme.glb, 3.65 m in all; en.wikipedia: "about 3.5 metres" with its pedestal): flame +
    // collar `flame` m on a black pedestal `pedestal` m (`pedestalSize` m square) on round granite steps `tiers` [outer
    // radius, top above the lowest ground] (also the steps of the scan's GLB, scripts/assets/flamme.ts, and the colliders),
    // a paving disc [radius, top] (visual only); flame radius × flameWidth (the scan's tongues spread ≈ 1.8 m)
    flamme: {
      flame: 1.7, pedestal: 1.25, pedestalSize: 1.1, flameWidth: 1.6, segments: 20, rings: 12,
      paving: [3.05, 0.06] as [number, number],
      tiers: [[2.5, 0.27], [2.05, 0.42], [1.6, 0.57], [1.1, 0.7]] as [number, number][],
    },
  },
  // g3 (world/landmarks/g3.ts): Louvre–Concorde–Opéra. Published figures are cited in g3.ts; "est." = estimate
  // (no published figure found on fr/en.wikipedia, 2026-09-28: proportions from photos / storey counts).
  g3: {
    // Roof height field of the Louvre / Palais-Royal outlines: mansard = steep slope k1 up to hm, then k2 to the ridge.
    cell: 2, // m, field grid step
    k1: 3, // rise per m inward of the lower (steep) slope (≈ 72°)
    dmax: 14, // m, distance-to-facade cap
    blend: 3, // m, zone transitions
    bay: 4.2, winW: 1.5, winH: 3, storey: 5.5, winFrom: 2, // facade window rhythm (m)
    arcade: 10, // m, walls up to this high get one tall opening per bay (colonnades) instead of window rows
    colours: {
      stone: '#dccdab', slate: '#535b63', window: '#262c33', granite: '#8e8a84', pinkGranite: '#b99a84',
      basin: '#34383d', water: '#223441', steel: '#c9ced3', frame: '#6d747b', marble: '#b8706a', black: '#1b1b1b',
      white: '#ececec', statue: '#e4ddd0', recess: '#3a3632', gilt: '#c9a24a', patina: '#6f6b5c',
      verdigris: '#4a6552', // painted cast iron "vert bronze" of Hittorff's fountains and rostral columns
    },
    // Louvre frame: origin = pyramid centre, u = unit vector pyramid → Pavillon de l'Horloge (both from OSM), w = south.
    louvre: {
      frame: { ox: 1079, oz: 496.7, ux: 0.939, uz: 0.343 },
      // [cornice, mansard lower height, upper slope, max top] m above ground, est. (3 storeys + attic).
      base: [20.5, 7.5, 0.3, 29] as const,
      // zones [u0, u1, w0, w1, cornice, hm, k2, top]: Cour Carrée N/S/E wings (low roofs behind the balustrade),
      // its west (Lescot / Lemercier) wing with the high slate roof.
      zones: [
        [150, 320, -110, 110, 25, 3.5, 0.2, 29],
        [118, 152, -110, 110, 24, 8, 0.3, 32],
      ] as const,
      // pavilions [u, w, half u, half w, cornice, roof height, 1 = square dome (Horloge) | 0 = "à l'impériale"], est.
      pavilions: [
        [143, 0.7, 12, 13, 27, 17, 1], // Horloge (Sully)
        [0, -73, 13, 12, 25, 16, 0], [0, 73, 13, 12, 25, 16, 0], // Richelieu, Denon
        [77, -72, 9, 11, 24, 13, 0], [77, 72, 9, 11, 24, 13, 0], // Colbert, Daru
        [-80, -72, 9, 11, 24, 13, 0], [-80, 72, 9, 11, 24, 13, 0], // Turgot, Mollien
        [-364, 135, 14, 15.5, 27, 15, 0], [-338, -160, 12, 14, 27, 15, 0], // Flore, Marsan
        [-222, 125, 16, 16, 24, 12, 0], // Sessions
        [-97, -139, 11, 11, 23, 10, 0], [-99, 126, 10, 15, 23, 10, 0], // Rohan, La Trémoille
        [140, 74, 11, 12, 25, 11, 0], // Pavillon du Roi
      ] as const,
      courtGlass: 3, // m, glass roofs of the Cour Marly / Puget above the cornice
    },
    palaisRoyal: {
      base: [19.5, 6.5, 0.35, 30] as const,
      // zones in the outline's footprintFrame (u ≈ ENE, w ≈ SSE): the Galerie d'Orléans, both colonnades, 7 m est.
      zones: [[-18, 43, -63, -33.5, 7, 0, 0, 7]] as const,
      burenSpacing: 3.19, burenR: 0.35, burenMax: 3.5,
    },
    pyramid: { height: 21.6, small: 5, smallAt: 32, basin: [20, 46, 6, 32] as const, basinH: 0.55, beam: 0.18 },
    obelisk: { shaft: 22.83, base: 1.21, top: 0.8, cap: 3.6, total: 33.37 },
    concorde: { statuePlinth: 4.6, statue: 3.2, rostral: 8.5 },
    fountain: { height: 9, basin: 0.8 },
    vendome: { total: 44.3, pedestal: 7.3, shaftR: 1.8, shaftTop: 36.2, turns: 22, statue: 3.3 },
    carrousel: { quadriga: 4.2, soldier: 2.4 },
    opera: { apollo: 7.5, groups: 7, columnR: 0.55 },
  },
  // Group g4 details (world/landmarks/g4.ts). Heights in m above each landmark's reference ground; sources inline.
  g4: {
    colours: {
      window: '#232a31', slate: '#4d555f', lead: '#8b939b', zinc: '#7e8a92', clock: '#f1ede2', hands: '#1d1f22',
      reseda: '#7f9c86', // Grand Palais steelwork, "vert réséda" (repainted 2024)
      verdigris: '#5f8f7b', paving: '#d6cfc0',
      glazing: '#a3b5bb', portico: '#7a7264', // back wall in a portico's shade // walls of glass-roofed parts (vault gable ends)
    },
    stone: { // limestone tints per building (sRGB)
      chaillot: '#e6dfcf', tokyo: '#e9e4d8', grandPalais: '#e1d6bd', petitPalais: '#e8dfc9', orsay: '#dccdae',
      bourbon: '#e2d9c4', invalides: '#d9ccb0', ecole: '#e4dbc6', rodin: '#e9e1d0',
    },
    lodSmall: 3, // m: statues / figures shorter than this are near-only
    columnSegs: 8, // sides of a round column
    // Palais de Chaillot (1937): OSM wing height=30 counts from the lowest (garden) ground, i.e. the head pavilions
    // stand ≈ 22 m above the Parvis; the curved gallery arms and end pavilions are lower (estimated from photographs).
    chaillot: {
      height: 30, headAbove: 21, armAbove: 13.5, endAbove: 15.5, headLen: 42, endLen: 24,
      pillarPitch: 5, pillarSize: 1.3, pillarOff: 3.4, // garden colonnade of square pillars on the concave side
      parvisFront: 14, // m the Parvis terrace runs past the pavilions toward the gardens
      stairWidth: 32, stairRun: 22, // central stairs down to the gardens
      statue: 4.6, statuePlinth: 2.2, jet: 5.5, jetIsolated: 9,
    },
    // Palais de Tokyo (1937): OSM height=14 (above the avenue du Président-Wilson side), colonnade between the wings.
    // court = centre (world x, z) of the terraced court between this (west) wing and the east wing (Musée d'Art
    // moderne, an ordinary OSM building at x −1711): ponytail: fixed point, derive from both outlines if the data moves.
    tokyo: {
      height: 14, skylight: 1.8, pillarPitch: 4.4, pillarSize: 1.1, colonnadeH: 12.5,
      court: [-1757, 138] as [number, number], stairRun: 14, stairWidth: 20,
    },
    // Grand Palais (1900): OSM building:part heights (stone 19–25 m, barrel vaults 25–42 m, glass dome 25–50 m).
    grandPalais: {
      dome: 50, ribPitch: 8.5, domeRibs: 16, lantern: 4.5, flagpole: 9,
      colonnade: { y0: 5, y1: 19, r: 0.7, pitch: 5.2, off: 3.2 },
      // Récipon's 2 quadrigas (1900) on the corner attics of the main façade (fr.wikipedia « Grand Palais »); the plan's
      // "4" would add 2 that do not exist. quadriga = fallback attic height, inset = m from the façade corner.
      quadriga: 25, quadrigaInset: 8,
      porchArches: [[-16, 4.5, 11], [0, 6.5, 13], [16, 4.5, 11]] as [number, number, number][], // [u, half-width, springing]
    },
    // Petit Palais (1900, Girault): no published height; cornice ≈ 2 storeys on a 4 m base (plan §1 #12 ≈ 20 m),
    // dome over the portal ≈ 1.8 × the cornice (estimated from photographs).
    petitPalais: {
      cornice: 18.5, roofTop: 21, dome: 34, domeR: 8.5, porchW: 26, porchOut: 4, porchTop: 25,
      colonnade: { y0: 4.5, y1: 15.5, r: 0.55, pitch: 3.8, off: 2.4 },
    },
    // Musée d'Orsay (Gare d'Orsay 1900, Laloux): OSM height=35 (clock pavilions); nave 138 m long, 40 m wide, 32 m
    // high inside (musee-orsay.fr, histoire du bâtiment). Heights count from the quay (Seine façade).
    orsay: {
      height: 35, cornice: 21, mansard: [[1.6, 25], [4.2, 26.5]] as [number, number][], naveHalf: 20, naveLen: 138,
      vaultSpring: 25, vaultTop: 34, pavilion: 22, pavilionWall: 23.5, arches: 7, clockR: 2.6,
      westSill: 8, // the west arch's glazing starts above the entrance canopy
    },
    // Palais Bourbon: OSM parts (peristyle 18.4 m, pediment 27.4 m); the uncovered outline gaps are filled this high.
    bourbon: { height: 27.4, fill: 11 },
    // Dôme des Invalides: 107 m to the cross (fr.wikipedia « Dôme des Invalides »); OSM parts reach 100 m.
    invalides: { height: 107, ribs: 12, spireBase: 84, globe: 104.5 },
    // Hôtel des Invalides: façade 196 m (fr.wikipedia); no published height → 4 storeys ≈ 16 m cornice + slate roof.
    hotelInvalides: { cornice: 16, mansard: [[2.2, 22.5], [4, 24]] as [number, number][], dormerPitch: 5.5 },
    // École Militaire: OSM parts (quadrangular dome to 22 m); colour tags 'brown' are its slate roofs.
    ecole: { clockR: 1.6, fillMax: 12, clockBearing: 314, domeTop: 22 }, // clock on the Champ-de-Mars façade (bearing to the Eiffel Tower)
    // Musée Rodin (Hôtel Biron, 1730): no published height → 3 levels × 4.2 m + hipped slate roof (estimate).
    rodin: { cornice: 12.6, height: 19, plinth: 1.3, windowRows: [[0.8, 3.2], [5, 3.2], [9.4, 2]] as [number, number][] },
    dormer: { w: 1.5, h: 2.2 },
    // Crazy Horse Paris (12 av. George V): the Haussmann block way/69486346 (6 levels, BuildingBuilder look) + the
    // cabaret frontage. node = OSM node/1292046637 (amenity=theatre), 5.6 m inside the block's west side on the avenue:
    // the façade is the straight run (edges within runAngle°, ≥ minRun m) nearest to it. Sizes (m) estimated from
    // photographs (no published figures); y above the block's ground; out = m in front of the wall.
    crazyHorse: {
      node: [48.8659605, 2.3017221] as [number, number], minRun: 8, runAngle: 5,
      showcaseArea: 40, // m²: a smaller outline of the landmark is the showcase box (way/69486351, 16 m²)
      frontH: 4.4, frontOut: 0.06, // dark ground-floor frontage over the shopfront band (4.5 m)
      door: { w: 2.6, h: 2.9, frame: 0.18 },
      canopy: { w: 7.5, depth: 2.4, y: 3.1, thick: 0.3, valance: 0.4 }, // marquise: red slab, black valance
      sign: { w: 11, h: 1.5, y: 4.75, out: 0.25 }, // board with the canvas lettering (world/landmarks/index.ts)
      neon: 0.08, // strip section
      lamps: 4, lampSize: 0.22, // globes under the canopy
      colours: { front: '#141115', canopy: '#a3111d', valance: '#0c0b0d', frame: '#5c0d14', neon: '#ff2f78', lamp: '#ffe4b0', board: '#0a0a0c' },
    },
  },
  // g5 (world/landmarks/g5.ts): Notre-Dame … Luxembourg + skyline. Colours sRGB (vertex colours of 'masonry').
  g5: {
    colours: {
      stone: '#d9ccb0', stoneDark: '#b8ab8d', tracery: '#e2d7bd', recess: '#39342e', window: '#2c3237',
      stainedGlass: '#2e3061', spire: '#5e6368', lead: '#8e959b', ndRoof: '#aab0b5', slate: '#4b545e', clockBlue: '#1d3776',
      saintJacques: '#cac6ba', statue: '#e6e1d3', frame: '#efefeb', floor: '#8f9293', deck: '#c9c9c4',
      ducts: ['#2d6bb3', '#3b9a4b', '#2d6bb3', '#e2bd20', '#3b9a4b', '#c5382e'], // air, water, air, electricity, water, lifts
      sacreCoeur: '#f2efe6', montmartre: '#9a9c92', montparnasse: '#2b2c30', defense: ['#7e8b9a', '#5f6a77', '#9aa5b1', '#4a535e'], arche: '#e6e8ea',
    },
    decalOffset: 0.06, // m in front of the wall: flat decals (portals, roses, windows, clocks) without z-fighting
    flyerWidth: 0.9, // m, Notre-Dame flying buttress thickness
    window: { spacing: 4.3, width: 1.8 }, // m, façade window rows (Hôtel de Ville, Luxembourg, Conciergerie quai)
    clockHeight: 10.5, // m above ground, centre of the Tour de l'Horloge dial
    hdv: { cornice: 19, pavilion: 23, pavilionRoof: 13, roofRise: 7, roofInset: 5, simplify: 0.6 }, // m (Hôtel de Ville)
    skyline: {
      originAsl: 34, // m above sea level of DEM(ORIGIN) (client/public/data/elevation.bin): Sacré-Cœur's groundAsl → y
      hazeDistance: 3500, // m: haze = 1 − exp(−d / this), capped at maxHaze (own haze: the scene fog ends at ~0.7 km)
      maxHaze: 0.85,
      shell: 0.8, // share of camera.far beyond which the silhouettes are drawn depth-compressed (they lie beyond far)
      baseDrop: 60, // m below the city datum: bases continue under the horizon (no terrain is drawn beyond the map)
      fadeHeight: 70, // m: haze is total at y ≤ 0 and fades out up to this height (silhouettes rise out of the fog)
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
  footSpeed: 4, // m/s: standard on-foot speed (the "jog" clip)
  sprintMultiplier: SPRINT_MULTIPLIER, // SPEC §17.29: × the top speed (foot, swim, bike) while sprint (Shift / LB) is held; the server's limits use the same constant
  bikeSpeedMultiplier: 1.3, // Phase 4: bike speed = footSpeed × this
};

const SPAWN_OUT = 14; // m from the obelisk toward the Arc: outside its fence (SPEC §17.4: ≥ 8–10 m)
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
  modelUrl: 'models/player.glb', // UBC Superhero_Male + Hair_SimpleParted, one skin (npm run process-assets)
  clipsUrl: 'models/player-anims.glb', // 15 UAL clips, bones renamed to the UBC (UE) names
  // shirt = team colour; bone-weight mask (docs/plans/phase3.md §2), colour where the mask passes smoothstep(edge)
  // hair: tint × the grey UBC hair texture (T_Hair_1 is untinted, mean ≈ 0.56) → dark brown hair and eyebrows
  outfit: { pants: '#2d3342', shoes: '#1d1d20', hair: '#8a6446', edge: [0.35, 0.65] as const },
  fade: 0.2, // s crossfade between clips
  // m: fixed frustum-culling sphere per skinned mesh, centre y above the feet; bones reach 2.06 m from it lying in the
  // crash (Death01 moves the pelvis back), 1.3 m swimming / celebrating; + mesh and hair around the bones
  cullSphere: { y: 0.9, radius: 2.4 },
  // Canvas sprite, constant size on screen: scale 0.05 ≈ 3.6 % of the view height at fov 70 (≈ 39 px at 1080p, the
  // same at 3 m and 20 m); m above the head; hidden beyond maxDistance (m); canvas font px (texture resolution)
  nameTag: { lift: 0.2, scale: 0.05, maxDistance: 80, fontPx: 48 },
  // Locomotion playback = ground speed / the clip's own speed (m/s at timeScale 1), clamped: feet don't slide. Walk / jog:
  // stance-foot speed measured on the clip × the hip-height ratio (1.035); swim: one stroke cycle ≈ 2.4 m.
  clipSpeed: { Walk_Loop: 1.09, Jog_Fwd_Loop: 6.1, Swim_Fwd_Loop: 1.8 } as Readonly<Record<string, number>>,
  timeScale: { min: 0.4, max: 1.6 },
  // m the body is raised while a clip plays, × its blend weight: Swim_Fwd_Loop lies horizontally at the pelvis height of
  // an upright swimmer (swim.floatDepth keeps the head of Swim_Idle_Loop out), which would sink the whole crawl.
  clipLift: { Swim_Fwd_Loop: 0.3 } as Readonly<Record<string, number>>,
  moveThreshold: 0.25, // m/s horizontal: below = idle / swimIdle / land
  // m/s: on foot Jog_Fwd_Loop from jogFrom[1], back to Walk_Loop below jogFrom[0]; in between both
  // clips slide a little (Walk_Loop tops out at 1.09 × 1.6 = 1.74 m/s, Jog_Fwd_Loop starts at 6.1 × 0.4 = 2.44 m/s)
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
  lock: { size: 0.22, lift: 0.28 }, // team lock sprite (m) above the saddle, shown while owned (ownerColour)
};

// ── B · bike physics + interaction (vehicle/BikeController.ts, vehicle/Bikes.ts, audio/sfx.ts, player/*) ──
export const bike = {
  accelTime: 1, // s from 0 to bikeTopSpeed() (SPEC §6.1)
  brakeDecel: 7, // m/s² while braking (S)
  coastDecel: 0.6, // m/s² rolling without input
  reverseSpeed: 1, // m/s backwards (S held once stopped): get the nose out of a wall
  turnRate: { slow: 2.4, top: 1.3 }, // rad/s at ~0 and at top speed (linear in between)
  turnMinSpeed: 1, // m/s below which the turn rate fades to 0 (a bike doesn't spin on the spot)
  steerMaxDeg: 25, // front wheel angle at full A / D when slow (half of it at top speed), visual only
  // Turning faster than `rate` rad/s caps the speed at top − loss × excess (m/s per rad/s); above the cap it bleeds at
  // brakeDecel (SPEC §6.1: sharp turns slow down). Full A / D at top speed settles ≈ 87 % of top.
  sharpTurn: { rate: 1.1, loss: 2 },
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
  density: 1, // × traffic.perKm / crowd.perKm, then × the automatic factor (npcRender.autoDensity); URL ?npcDensity=
  zoneMargin: 3, // m added to every ExclusionZone radius
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
  // highway=* kinds cars drive on (no service: parking entrances, courtyards); npc/roads.ts keeps the largest strongly
  // connected part of them, so no car ever gets stuck in a dead end
  kinds: ['primary', 'secondary', 'tertiary', 'unclassified', 'residential', 'living_street', 'primary_link', 'secondary_link', 'tertiary_link'] as string[],
  perKm: 10, // cars per km of NPC road within radius (× density); placed by length × lanes^laneWeight (traffic.ts refreshNear)
  max: 60,
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
  max: 40,
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
    storageKey: 'cuoc-dua-paris.quality',
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
  storageKey: 'cuoc-dua-paris.settings', // localStorage (per browser; try/catch, defaults when blocked)
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
  defaultRace: 'paris', // race id when the URL has no ?race= (the Host's link carries one); each race = one Durable Object
  apiBase: '/api', // same origin (Workers Static Assets + Worker); the Vite dev server proxies it to wrangler dev (vite.config.ts)
};

// ── A · server (worker/src/*): no client tunables; NET in shared/src/protocol/constants.ts + the leg file ──

// ── B · client net + remote players + login (net/NetClient.ts, net/RemotePlayers.ts, ui/Login.ts, main.ts) ──
export const netClient = {
  reconnectMs: [1000, 2000, 4000, 8000, 15000], // backoff per attempt, the last one repeats (SPEC §3: auto reconnect)
  storageKey: 'cuoc-dua-paris.team-code', // localStorage: the team code is remembered (SPEC §8.10), try/catch
  remountSeconds: 3, // after an F5 the team that was riding gets back on its bike if it stands on its feet within this (SPEC §8.10)
  gestureGapMs: 500, // a bell / wave is sent at most this often (the server closes > NET.maxMessagesPerSec)
};
export const remote = {
  interpolationMs: 200, // render this far behind the server clock (SPEC §7: buffer ~200 ms; ticks every 200 ms)
  extrapolateMs: 150, // keep moving at the last velocity this long after the newest sample, then hold
  snapDistance: 10, // m: a jump longer than this (respawn, reconnect) is not interpolated
  bufferSamples: 10, // ticks kept per remote player (2 s at 5 Hz)
  clockSlewMs: 1, // ms the server-clock offset estimate sinks per tick (≈ 5 ms/s): drift and one lucky fast tick wear off
  renderRadius: 300, // m: until welcome.presence.renderRadius arrives (DEV ?peers stand-ins)
  bellRadius: 60, // m: another team's bell (R) is heard this close
  hideDy: 10, // m: Phase 8B: feet this far under the terrain grid = underground (the Louvre room 30 m under its box); a remote player is hidden only when one side is underground and the other not (no ghost under the street; slopes hide nobody)
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
  minCandidates: 60, // per segment, after the parking nodes (spots to choose the spawned bikes from: ~1 per 25 m of a 1.5 km route)
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
  spectateAfterS: 4.5, // s after the check-in (celebrate ≈ 4 s) the finished team becomes a spectator (free-fly, D19)
  // Phase 8 (D9): this long after a card countdown ends (server clock estimate) the card flips to active / goToBranch
  // (race/ui/format.ts liveStatus) and the pose is re-sent once, so the server's tick loop wakes and reveals the branch box
  // to a team standing still (a client clock 1–2 s early would send `answer` into answerLocked: critic N8)
  lockEndSlackMs: 1000,
  // Pit Stop (SPEC §8.6): a red mat with yellow stripes at the zone centre (the check-in zone is the whole radius) + the host NPC
  mat: { length: 7, width: 3.2, colour: '#b3201c', stripe: '#f2c230', stripeWidth: 0.25, lift: 0.04 },
  // offset [side, along] m from the mat centre; tag: name tag colour (the dark suit colour was unreadable, visual review);
  // tagDistance: m from the camera beyond which its tag hides (screen-size tags: farther away it sat on the team's own, p7-mat)
  host: { shirt: '#23262d', tag: '#ffd75e', tagDistance: 12, name: 'Người dẫn chương trình', offset: [2.4, 0.6], waveEveryS: 6, waveRadius: 25 },
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

// ═════════════════════════════════════════════════════════════════════════════════════════════════════
// Phase 8B (docs/plans/phase8b.md §F, §G): phòng Louvre (Thử thách 3). Leg content (artworks, hints, answers) is on the
// server; these are client layout / presentation tunables only. Each track edits ONLY its own block.
// ═════════════════════════════════════════════════════════════════════════════════════════════════════

// ── B · the room (race/LouvreRoom.ts, main.ts F priority, Player env) ──
export const louvreRoom = {
  below: 30, // m: floor = heightAt(box x, z) − this (under the Louvre courts: no road / NPC / bike there, the chunk stays loaded)
  minFloorY: player.respawnBelow + 5, // m: floor never lower (respawn would fire); codec MIN_Y is −100
  size: { width: 26, depth: 16, height: 5 }, // m, closed box; `width` along the door wall
  door: { width: 2, height: 2.6 }, // middle of the front wall (facing room.yaw), standing at the box's x, z: going in / out only changes y
  // 9 + 5 + 5 + 2 + 2 = 23 places along the walls, leg order; cornerMargin: m kept free at each corner (and beside the door)
  slots: { back: 9, side: 5, frontEachSide: 2, minSpacing: 2.6, cornerMargin: 1.2 },
  // m: the picture `height` tall (a wide one: maxWidth wide, shorter), centre at centreY; the gilt frame hugs it, `frame` m each side (fix F2 (6))
  painting: { height: 1.7, maxWidth: 2.3, centreY: 2.1, frame: 0.07 },
  plinth: { size: 0.9, height: 1.0, fromWall: 0.4, photo: [0.8, 1.0], glbBox: [0.8, 1.2, 0.8] }, // a sculpture: plinth `fromWall` m off the wall, photo standing on it, or its .glb fitted in glbBox (≤ size: no base over the edge)
  button: { radius: 0.125, postHeight: 0.9, fromWall: 1.8, reach: 2.2, aimDot: 0.2 }, // under each artwork, in front of a plinth; F picks the nearest within reach the camera faces (dot > aimDot)
  exitSign: [2.6, 0.5], // m, the "Lối ra – bấm F" sign over the door
  lockSign: { size: [2.0, 0.45], y: 3.0 }, // m, the two-faced "Chốt đáp án" sign hanging over the lock button (bottom edge y)
  // In the room the third-person camera sits further over the right shoulder and higher (the body hid a sculpture being aimed at)
  camera: { shoulder: 0.65, lift: 0.35 },
  lock: { plinthRadius: 0.35, buttonRadius: 0.26, reach: 2.5 }, // the lock button in the middle of the room
  doorReach: 2, // m: F at the door → back up to the court
  enterReach: 3, // m from the box: F enters (closer than the zone radius: entering moves the feet to the door, x, z ± ≤ enterReach + inset only)
  inset: 0.8, // m: entering, the feet land this far inside the door; leaving, this far in front of the box (both ≤ 2 m from it: only y changes much)
  ceilingLights: 6,
  pickGapMs: 150, // a pick is sent at most this often (the server's 15 msg/s limit counts poses too: verify-foundation #10)
  colours: { wall: '#efe6d2', floor: '#8a5a35', floorLine: '#6e4527', ceiling: '#c9c2b4', frame: '#b8902f', plinth: '#e8e2d6', post: '#55504a', door: '#5a3b22', off: '#c8281e', on: '#2fbf4a', lock: '#f2c230', light: '#fff6dc', exitSign: '#1d5a34', lockSign: '#7a5a10' },
};

// ── C · public feed (ui/Feed.ts): "Đội X trả lời sai và bị phạt 3 phút" (SPEC §17.19 (b): bottom corner, configurable) ──
export const feed = {
  corner: 'bottom-left' as 'bottom-left' | 'bottom-center' | 'bottom-right', // default: bottom-left, right of the minimap (it never covers the minimap or the toasts above it), GTA chat style (waiting for the user's confirmation)
  bottomLift: 26, // px above the screen margin (clears the attribution line at the very bottom)
  lines: 5, // newest lines shown
  seconds: 90, // a line fades after this (s); a new line shows the box again
};
