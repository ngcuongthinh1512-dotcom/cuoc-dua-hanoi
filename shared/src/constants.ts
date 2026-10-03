/** Gốc tọa độ thế giới (0,0,0): cột obelisk quảng trường Concorde (SPEC §4.1). */
export const ORIGIN = { lat: 48.86548, lon: 2.32115 } as const;

/** SPEC §17.29: holding Shift (pad LB) runs at this × the current top speed, on foot AND on a bike. The client's
 *  movement.sprintMultiplier reads it; the server multiplies its speed-flag / trusted-point limits by it. */
export const SPRINT_MULTIPLIER = 2;

/** Vùng bản đồ đua (SPEC §4.1). */
export const RACE_BBOX = { south: 48.845, west: 2.285, north: 48.878, east: 2.36 } as const;

/** Phase 8B Louvre room (SPEC §17.19): counts + file rules shared by the leg schema, the server and the client. */
export const LOUVRE = {
  /** 5 Louvre originals + 18 decoys around the walls. */
  artworks: 23,
  answers: 5,
  /** §17.19 (c): from hints.countAtMinutes on, at most this many lit buttons at once (switching off always works). */
  maxPicks: 5,
  artId: /^[A-Za-z0-9_-]{1,16}$/,
  /** A static client asset client/public/art/<name>: a photo (webp) or, for a statue with a licensed 3D scan, a GLB. */
  artFile: /^art-\d{2}\.(webp|glb)$/,
  /** CLI (leg:check) size limits of those files. */
  maxWebpBytes: 300 * 1024,
  maxGlbBytes: 1024 * 1024,
} as const;
