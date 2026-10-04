// SPEC §17.40 watch mode, the pure part (tested without DOM / WebGL): the chase camera behind a followed team's body, its
// smoothing, the Louvre-room case (the camera stays on the street above: no room is built for a watcher), and the list of
// teams one may watch (online and still racing) with [ / ] stepping.
import { LOUVRE } from '@race/shared';
import type { TeamInfo } from '@race/shared/protocol';
import { spectate as C } from '../config.ts';
import { angleDelta, follow } from '../player/ThirdPersonCamera.ts';

/** Camera pose: position (m), yaw (rad, 0 = north / −Z, + = left), pitch (rad, + = up): FreeFlyCamera's convention. */
export interface CamPose {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
}
/** A followed body: feet (m) + heading (rad). */
export interface Target {
  x: number;
  y: number;
  z: number;
  yaw: number;
}

/** C.back m behind the body along its heading (forward = (−sin yaw, 0, −cos yaw)), C.up above the feet, looking at the head. */
export function followPose(t: Target): CamPose {
  return { x: t.x + Math.sin(t.yaw) * C.back, y: t.y + C.up, z: t.z + Math.cos(t.yaw) * C.back, yaw: t.yaw, pitch: -Math.atan2(C.up - C.lookUp, C.back) };
}

/** The team stands in the Louvre room (SPEC §17.35: feet at or under LOUVRE.roomY). */
export const inRoom = (y: number) => y <= LOUVRE.roomY;

/** Over a team in the room: on the street right above it (streetY = the terrain there), eye height, looking its way. */
export const streetPose = (t: Target, streetY: number): CamPose => ({ x: t.x, y: streetY + C.roomEye, z: t.z, yaw: t.yaw, pitch: 0 });

/** Exponential smoothing toward `goal` (yaw the short way round); a goal more than C.snapDistance away snaps (respawn, another team). */
export function smoothPose(cur: CamPose, goal: CamPose, dt: number): CamPose {
  if (Math.hypot(goal.x - cur.x, goal.y - cur.y, goal.z - cur.z) > C.snapDistance) return { ...goal };
  const k = follow(C.sharpness, dt);
  return {
    x: cur.x + (goal.x - cur.x) * k,
    y: cur.y + (goal.y - cur.y) * k,
    z: cur.z + (goal.z - cur.z) * k,
    yaw: cur.yaw + angleDelta(cur.yaw, goal.yaw) * k,
    pitch: cur.pitch + (goal.pitch - cur.pitch) * k,
  };
}

/** Teams one may watch: online and still racing (TeamInfo.racing; absent = racing), by slot. */
export const watchable = (teams: Iterable<TeamInfo>): TeamInfo[] => [...teams].filter((t) => t.online && t.racing !== false).sort((a, b) => a.slot - b.slot);

/** The slot `dir` steps from `cur` in `list` (wrapping); the first / last when `cur` is not in it; null for an empty list. */
export function nextSlot(list: readonly { slot: number }[], cur: number | null, dir: 1 | -1): number | null {
  if (!list.length) return null;
  const i = list.findIndex((t) => t.slot === cur);
  if (i < 0) return list[dir > 0 ? 0 : list.length - 1]!.slot;
  return list[(i + dir + list.length) % list.length]!.slot;
}
