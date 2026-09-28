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
  shadowHalfExtent: 80, // m around the camera (world/Sky.ts: the shadow box follows it)
  shadowFar: 1200, // m from the sun position
  exposure: 1,
  fov: 70, // vertical, degrees
  near: 0.5, // m
  far: 12_000, // m; initial value, the game sets camera.far = fog far (world/Sky.ts); the preview keeps it
  background: 0xbfd3e6, // clear colour (preview; the game draws the sky texture)
  sky: { zenith: '#6f9fd8', horizon: '#c9d9e6', clouds: 60, cloudAlpha: 0.35 }, // horizon = fog colour
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
  sidewalkByName: { 'Avenue des Champs-Élysées': 21, 'Pont Alexandre III': 10 } as Record<string, number>, // m each side (Champs 70 m ≈ 21 + 28 + 21, Pont Alexandre III 40 m)
  curbHeight: 0.15, // m (STYLE_GUIDE)
  laneWidth: 3.25, // m; width = lanes × this when there is no width tag
  widthByKind: {
    motorway: 14, trunk: 14, primary: 12, secondary: 10, tertiary: 9, unclassified: 7, residential: 7,
    living_street: 6, service: 4.5, pedestrian: 6, footway: 3, path: 2, cycleway: 2, steps: 3, track: 3,
    primary_link: 7, secondary_link: 7, tertiary_link: 6, subway: 4.5, rail: 4.5, light_rail: 4.5, tram: 4.5, // rail: 1 track
  } as Record<string, number>, // m, per highway=* / railway=* when neither width nor lanes is tagged
  defaultWidth: 6, // m, kind missing from widthByKind
  // m carriageway; overrides everything except on a oneway half of a dual carriageway (the Concorde end of the Champs)
  widthByName: { 'Place Charles de Gaulle': 36, 'Avenue des Champs-Élysées': 28 } as Record<string, number>,
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
  bridge: { deckThickness: 1, railingHeight: 1.1, railingThickness: 0.3, endSample: 5, railLayerStep: 6, mergeGap: 30 },
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
    atlasW: 512, // px, per-chunk atlas width (height grows with rows)
    plaqueHeight: 0.42, postHeight: 2.6, // m; plaque top at the post top
    enamel: '#1d4f9c', border: '#2f7d4a', text: '#ffffff', post: '#2a2d30',
  },
};

// ── Phase 2B · landmarks (geo/landmarks.ts registry, world/landmarks/: index + parts renderer + g1…g5 details) ──
export const landmarks = {
  // Phase 2 placeholders (g1 Eiffel / Arc, g3 pyramid / obelisk) until the groups replace them
  eiffelHeight: 330, arcHeight: 50, pyramidHeight: 21.6, obeliskHeight: 23, // m, used when OSM has no height
  obeliskShaft: 23, // m, shaft + pyramidion; the rest of the tagged height is the pedestal
  latticeTile: 5, // m per Eiffel lattice panel (iron alpha texture)
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
  },
};

// ── Step 0 · dev preview harness (preview.html, src/preview.ts; dev server only) ──
export const preview = {
  viewPitchDeg: -35, // default camera: from the south, looking north down at the selection
  viewDistance: 1.6, // × selection half-diagonal
};
