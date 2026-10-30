// Leg 3 rooms, pure, shared by the client (rooms/roomState.ts) and the server (RaceRoom presence): which 3D room a team's
// card puts it in. The chosen + opened detour branch whose task has `room` = inside that room; after "Đổi lựa chọn kép"
// (status switchLocked) the team is still standing in the room it left (`ClueCard.leftRoom`) until it walks into the exit
// ring — so it stays visible there to the other teams, and a reload restores that room with the ring lit. A challenge card
// with `room` (the GardeRobe museum, v12) or a route_info card with `room` (the BOZAR concert hall, v13) = that room while the step is not done (the client may walk out and back in).
import type { ClueCard, RoomView } from './types.ts';

/** The room the card's team is in: the opened branch's, or the one it just switched away from (`exiting`); null = none. */
export function roomKindOf(c: ClueCard | null | undefined): { kind: RoomView['kind']; exiting: boolean } | null {
  if (!c || c.status === 'done') return null;
  if (c.type === 'challenge' || c.type === 'route_info') return c.room ? { kind: c.room, exiting: false } : null;
  if (c.type !== 'detour') return null;
  if (c.branch && c.branchOpened) {
    const room = c.branches?.find((b) => b.id === c.branch)?.task?.room;
    return room ? { kind: room.kind, exiting: false } : null;
  }
  return c.status === 'switchLocked' && c.leftRoom ? { kind: c.leftRoom, exiting: true } : null;
}
