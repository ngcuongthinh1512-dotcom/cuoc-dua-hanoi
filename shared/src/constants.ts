/** Gốc tọa độ thế giới (0,0,0): cột obelisk quảng trường Concorde (SPEC §4.1). */
export const ORIGIN = { lat: 48.86548, lon: 2.32115 } as const;

/** SPEC §17.29: holding Shift (pad LB) runs at this × the current top speed, on foot AND on a bike. The client's
 *  movement.sprintMultiplier reads it; the server multiplies its speed-flag / trusted-point limits by it. */
export const SPRINT_MULTIPLIER = 2;

/** Vùng bản đồ đua (SPEC §4.1). */
export const RACE_BBOX = { south: 48.845, west: 2.285, north: 48.878, east: 2.36 } as const;

/** SPEC §17.38: the Pit Stop mat, m — the client draws it (raceClient.mat), the server counts a team as "at the Pit Stop"
 *  only ON it (`slack` m beyond its edges: network latency). Centre = the pit_stop zone centre, long axis along its yaw. */
export const PIT_MAT = { width: 16, length: 32, slack: 0.5 } as const;

/** Is (x, z) on the Pit Stop mat centred at `at` (zone / BoxInfo: yaw rad, 0 = north, + = west; the mat's long axis)? */
export function onPitMat(x: number, z: number, at: { x: number; z: number; yaw?: number }, slack: number = PIT_MAT.slack): boolean {
  const [dx, dz, c, s] = [x - at.x, z - at.z, Math.cos(at.yaw ?? 0), Math.sin(at.yaw ?? 0)];
  // into the mat's own frame (Three.js rotation.y = yaw: local x → (c, −s), local z → (s, c) in world x, z)
  return Math.abs(c * dx - s * dz) <= PIT_MAT.width / 2 + slack && Math.abs(s * dx + c * dz) <= PIT_MAT.length / 2 + slack;
}

/** Phase 8B Louvre room (SPEC §17.19): counts + file rules shared by the leg schema, the server and the client. */
export const LOUVRE = {
  /** 5 Louvre originals + 18 decoys around the walls. */
  artworks: 23,
  answers: 5,
  /** §17.19 (c): from hints.countAtMinutes on, at most this many lit buttons at once (switching off always works). */
  maxPicks: 5,
  /** SPEC §17.35: a trusted pose with y ≤ this (m) inside the louvre step's zone = the team stands in the room (floor = street −
   *  `louvreRoom.below` 30 m; no street in RACE_BBOX lies under −9 m: the carved Seine bed). The server has no terrain. */
  roomY: -15,
  artId: /^[A-Za-z0-9_-]{1,16}$/,
  /** A static client asset client/public/art/<name>: a photo (webp) or, for a statue with a licensed 3D scan, a GLB. */
  artFile: /^art-\d{2}\.(webp|glb)$/,
  /** CLI (leg:check) size limits of those files. */
  maxWebpBytes: 300 * 1024,
  maxGlbBytes: 1024 * 1024,
} as const;
