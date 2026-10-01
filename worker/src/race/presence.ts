// Who sees whom in a tick (SPEC §7, docs/plans/phase6.md §3.5–3.6). Pure, so the interest radius / dirty rules are
// unit-tested without workerd; RaceRoom feeds it the online teams' poses every 200 ms.
import type { PoseSample, TickEntry } from '@race/shared/protocol';

export interface Peer {
  team: string;
  slot: number;
  pose: PoseSample;
}

/** A team viewer gets the online peers within `radius` (never itself; nothing until it has a pose); the Host (null) gets all. */
export function tickEntries(viewer: { team: string; pose: PoseSample | null } | null, peers: readonly Peer[], radius: number): TickEntry[] {
  const at = viewer?.pose;
  if (viewer && !at) return [];
  return peers
    .filter((p) => !viewer || (p.team !== viewer.team && Math.hypot(p.pose.x - at!.x, p.pose.z - at!.z) <= radius))
    .map((p) => ({ slot: p.slot, pose: p.pose }));
}

/** Which slots a viewer was last sent (a change = someone entered / left the radius or went offline). */
export const tickKey = (entries: readonly TickEntry[]) => entries.map((e) => e.slot).join(',');

/** A tick goes out only when a peer in it moved or the set of peers changed: standing-still peers stay in every tick
 *  that goes out (a tick is a picture, not a diff), but nobody moving = no tick at all. */
export const needsTick = (entries: readonly TickEntry[], dirty: ReadonlySet<number>, lastKey = '') =>
  tickKey(entries) !== lastKey || entries.some((e) => dirty.has(e.slot));
