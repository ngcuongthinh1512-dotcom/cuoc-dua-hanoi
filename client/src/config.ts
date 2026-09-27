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
