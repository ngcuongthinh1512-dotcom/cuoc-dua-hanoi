// Phase 6 wire contract (docs/plans/phase6.md §5.1). Hot messages (poses, ticks) are plain number arrays rounded to cm
// (SPEC §3); everything else is a small JSON object with a `t` tag. Changing a shape = PROTOCOL_VERSION + 1.

/** Locomotion modes (client/src/player/types.ts MoveMode derives from this); the wire sends the index. */
export const MOVE_MODES = ['walk', 'slow', 'swim', 'air', 'bike'] as const;
export type MoveMode = (typeof MOVE_MODES)[number];
/** One-shot gestures (PlayerAction); the wire sends the index, remote players restart the gesture on change. */
export const PLAYER_ACTIONS = ['none', 'wave', 'openBox', 'celebrate', 'crash', 'climbOut'] as const;
export type PlayerAction = (typeof PLAYER_ACTIONS)[number];

/** Feet position (m, world), heading (rad, 0 = north / −Z, + = left), what the body does. */
export interface PoseSample {
  x: number;
  y: number;
  z: number;
  yaw: number;
  mode: MoveMode;
  action: PlayerAction;
}

/** First element of the number-array messages. */
export const TAG = { pos: 1, tick: 2 } as const;
/** `[TAG.pos, x_cm, y_cm, z_cm, yaw_mrad, mode, action]` (client → server). */
export type PoseArray = number[];
/** `[TAG.tick, serverMs, (slot, x_cm, y_cm, z_cm, yaw_mrad, mode, action)…]` (server → client). */
export type TickArray = number[];
export interface TickEntry {
  /** Team slot (Welcome.teams[i].slot): a small integer, never the team id, so ticks stay numeric. */
  slot: number;
  pose: PoseSample;
}

export type Role = 'team' | 'host';
export type RaceStatus = 'lobby' | 'running' | 'paused' | 'finished';

/** Public team facts every client may know (names and colours are on the shirts anyway). */
export interface TeamInfo {
  slot: number;
  id: string;
  name: string;
  colour: string;
  online: boolean;
}

/** One shared bike (SPEC §6.2–6.4) as clients see it. parked = standing at a rack next to a checkpoint. */
export interface BikeInfo {
  id: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  owner: string | null;
  rider: boolean;
  parked: boolean;
}

/** A clue box the team may see (SPEC §17.10): opened ones of earlier steps, plus the current one only while the team is
 *  within boxReveal.radius of it. x, z only: the client puts it on the ground it has (the server has no DEM). */
export interface BoxInfo {
  step: string;
  x: number;
  z: number;
  opened: boolean;
}

// ── client → server ──
export type GestureKind = 'wave' | 'bell';
export type RespawnHow = 'safe' | 'stairs' | 'fell';
export type BikeOp = 'claim' | 'mount' | 'dismount';
export type ClientMessage =
  | PoseArray
  /** The client teleported itself (CharacterController.respawn, fell through the world): resets the speed window. */
  | { t: 'respawn'; x: number; y: number; z: number; yaw: number; how: RespawnHow }
  | { t: 'gesture'; g: GestureKind }
  /** claim = F on a free / own bike (server decides, SPEC §6.3); dismount carries where the bike now stands. */
  | { t: 'bike'; op: BikeOp; id: string; x?: number; y?: number; z?: number; yaw?: number }
  | HostMessage;

/** Host screen only (Phase 6: minimal Host page; Phase 10: the rest). */
export type HostMessage =
  | { t: 'host.createTeams'; teams: { name: string; colour: string; player?: string }[] }
  /** Spawn candidates computed in the Host browser (SPEC §3, §6.2): per route segment, [x, z, x, z…] m, bicycle
   *  parking first; `decoys` = points anywhere else on the map. The DO only picks randomly from these. */
  | { t: 'host.candidates'; segments: number[][]; decoys: number[] }
  | { t: 'host.bike'; op: 'add' | 'remove' | 'release'; id?: string; x?: number; z?: number; team?: string }
  | { t: 'host.spawning'; paused: boolean };

// ── server → client ──
export type ServerNotice = 'bikeLost' | 'bikeGone' | 'bikeParked' | 'walkOnly';
export type KickReason = 'badToken' | 'otherDevice' | 'raceClosed' | 'protocol';

export interface Welcome {
  t: 'welcome';
  v: number;
  race: string;
  serverMs: number;
  status: RaceStatus;
  role: Role;
  /** The logged-in team (absent for the Host). */
  team?: TeamInfo & { player: string };
  teams: TeamInfo[];
  /** SPEC §6.1: from the leg file, also the server's speed-check limits. */
  movement: { footSpeed: number; bikeSpeedMultiplier: number };
  presence: { renderRadius: number; showOthersOnMinimap: boolean; interestRadius: number };
  /** SPEC §8.10: where the team last stood (null = first login: the leg's start). bikeId = the bike it holds. */
  pose: (PoseSample & { bikeId: string | null }) | null;
  /** s of race clock for this team, null before the start (Phase 7). */
  raceTime: number | null;
  bikes: BikeInfo[];
  /** SPEC §17.10: this team's visible clue boxes now (never a future step; the current one only within boxReveal.radius). */
  boxes: BoxInfo[];
}

export type ServerMessage =
  | TickArray
  | Welcome
  | { t: 'kick'; reason: KickReason }
  | { t: 'team'; slot: number; online: boolean }
  /** Changed bikes (full = the whole list); `gone` = ids that vanished (abandoned, replaced, removed by the Host). */
  | { t: 'bikes'; list: BikeInfo[]; gone?: string[]; full?: boolean }
  | { t: 'bike'; op: 'claim'; id: string; ok: boolean; reason?: 'taken' | 'far' | 'walkOnly' | 'gone' }
  | { t: 'gesture'; slot: number; g: GestureKind }
  | { t: 'notice'; code: ServerNotice }
  /** Per-team channel (SPEC §17.10): the current box's position when the team comes within boxReveal.radius, taken
   *  away again beyond radius + hysteresis. Opened boxes are never hidden. */
  | { t: 'box'; op: 'reveal'; box: BoxInfo }
  | { t: 'box'; op: 'hide'; step: string }
  | HostState;

/** Host screen state (every ≤ 1 s while it changes); Phase 6 shows codes, online status and the quota counters. */
export interface HostState {
  t: 'host.state';
  serverMs: number;
  status: RaceStatus;
  teams: (TeamInfo & { code: string; player: string; lastSeen: number | null; reconnects: number; pose: PoseSample | null; flagged: boolean })[];
  counters: QuotaCounters;
  bikes: BikeInfo[];
  spawning: { paused: boolean; candidates: number; nextAt: number | null };
}

/** Estimated Cloudflare usage (SPEC §3: the Host debug view shows these). */
export interface QuotaCounters {
  /** WebSocket messages received (billed 20:1) / sent (free). */
  wsIn: number;
  wsOut: number;
  /** HTTP requests + WebSocket upgrades that reached the Durable Object, and alarm runs (1 request each). */
  http: number;
  alarms: number;
  /** SQLite rows written as we count them (index rows included). */
  rows: number;
}
