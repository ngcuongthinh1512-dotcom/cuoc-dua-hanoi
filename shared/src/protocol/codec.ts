// Compact number-array codec + trust-boundary validation (docs/plans/phase6.md §3.4). Decoders return null for anything
// malformed instead of throwing: the server closes such sockets, the client ignores such frames.
import { MOVE_MODES, PLAYER_ACTIONS, type PoseArray, type PoseSample, TAG, type TickArray, type TickEntry } from './types.ts';

const CM = 100; // positions in cm (SPEC §3)
const MRAD = 1000; // headings in milliradians (0.06°)
export const POSE_LEN = 7;
export const TICK_HEAD = 2;
export const TICK_STRIDE = 7;
/** Sanity bounds (cm): the map is ≈ 5.5 × 3.7 km around the origin; y spans the Seine bed to the Eiffel top. */
const MAX_XZ = 10_000 * CM;
const MIN_Y = -100 * CM;
const MAX_Y = 1_000 * CM;
const MAX_YAW = Math.ceil(Math.PI * MRAD);
const MAX_SLOT = 10_000;

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const isInt = (v: unknown, lo: number, hi: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi;

/** Pose → wire numbers. Rounded, so an unchanged pose encodes to the same array (samePose → nothing to send). */
export function encodePose(p: PoseSample): PoseArray {
  return [TAG.pos, Math.round(p.x * CM), Math.round(p.y * CM), Math.round(p.z * CM), Math.round(wrap(p.yaw) * MRAD), MOVE_MODES.indexOf(p.mode), PLAYER_ACTIONS.indexOf(p.action)];
}

export const samePose = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((v, i) => v === b[i]);

/** The 6 pose numbers at a[i…i + 5] → PoseSample, or null when any is out of range. */
function readPose(a: readonly unknown[], i: number): PoseSample | null {
  const [x, y, z, yaw, mode, action] = [a[i], a[i + 1], a[i + 2], a[i + 3], a[i + 4], a[i + 5]];
  if (!isInt(x, -MAX_XZ, MAX_XZ) || !isInt(z, -MAX_XZ, MAX_XZ) || !isInt(y, MIN_Y, MAX_Y) || !isInt(yaw, -MAX_YAW, MAX_YAW)) return null;
  if (!isInt(mode, 0, MOVE_MODES.length - 1) || !isInt(action, 0, PLAYER_ACTIONS.length - 1)) return null;
  return { x: x / CM, y: y / CM, z: z / CM, yaw: yaw / MRAD, mode: MOVE_MODES[mode]!, action: PLAYER_ACTIONS[action]! };
}

export function decodePose(msg: unknown): PoseSample | null {
  if (!Array.isArray(msg) || msg.length !== POSE_LEN || msg[0] !== TAG.pos) return null;
  return readPose(msg, 1);
}

export function encodeTick(serverMs: number, entries: readonly TickEntry[]): TickArray {
  const out: number[] = [TAG.tick, Math.round(serverMs)];
  for (const e of entries) {
    const p = encodePose(e.pose);
    out.push(e.slot, p[1]!, p[2]!, p[3]!, p[4]!, p[5]!, p[6]!);
  }
  return out;
}

export function decodeTick(msg: unknown): { serverMs: number; entries: TickEntry[] } | null {
  if (!Array.isArray(msg) || msg.length < TICK_HEAD || msg[0] !== TAG.tick || (msg.length - TICK_HEAD) % TICK_STRIDE) return null;
  const serverMs = msg[1];
  if (!isInt(serverMs, 0, Number.MAX_SAFE_INTEGER)) return null;
  const entries: TickEntry[] = [];
  for (let i = TICK_HEAD; i < msg.length; i += TICK_STRIDE) {
    const slot = msg[i];
    const pose = readPose(msg, i + 1);
    if (!isInt(slot, 0, MAX_SLOT) || !pose) return null;
    entries.push({ slot, pose });
  }
  return { serverMs, entries };
}

/** Text frame → JSON value, or null when too big / not JSON (binary frames are not part of the protocol). */
export function parseFrame(raw: string | ArrayBuffer, maxBytes: number): unknown | null {
  if (typeof raw !== 'string' || raw.length > maxBytes) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const str = (v: unknown, max = 64): v is string => typeof v === 'string' && v.length > 0 && v.length <= max;
const point = (m: Record<string, unknown>) => num(m.x) && num(m.y) && num(m.z) && num(m.yaw) && Math.abs(m.x) <= MAX_XZ && Math.abs(m.z) <= MAX_XZ;

/** Shape check of a parsed player / Host JSON message (the server's trust boundary). Poses go through decodePose. */
export function isClientMessage(m: unknown, role: 'team' | 'host'): boolean {
  if (typeof m !== 'object' || m === null || Array.isArray(m)) return false;
  const o = m as Record<string, unknown>;
  switch (o.t) {
    case 'respawn':
      return point(o) && (o.how === 'safe' || o.how === 'stairs' || o.how === 'fell');
    case 'gesture':
      return o.g === 'wave' || o.g === 'bell';
    case 'bike':
      if (!str(o.id) || (o.op !== 'claim' && o.op !== 'mount' && o.op !== 'dismount')) return false;
      return o.op !== 'dismount' || point(o);
    case 'host.createTeams':
      return role === 'host' && Array.isArray(o.teams) && o.teams.length <= 100 && o.teams.every((t: unknown) => {
        const r = t as Record<string, unknown>;
        return typeof r === 'object' && r !== null && str(r.name, 40) && str(r.colour, 16) && (r.player === undefined || typeof r.player === 'string');
      });
    case 'host.candidates':
      return role === 'host' && Array.isArray(o.segments) && o.segments.every((s: unknown) => Array.isArray(s) && s.length % 2 === 0 && s.every(num)) && Array.isArray(o.decoys) && o.decoys.length % 2 === 0 && o.decoys.every(num);
    case 'host.bike':
      return role === 'host' && (o.op === 'add' || o.op === 'remove' || o.op === 'release');
    case 'host.spawning':
      return role === 'host' && typeof o.paused === 'boolean';
    default:
      return false;
  }
}
