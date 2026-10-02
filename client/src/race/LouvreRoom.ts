// Phase 8B (docs/plans/phase8b.md §F): the Louvre room ("Thử thách 3") — a closed box `louvreRoom.below` m under the box
// just opened (card.task.louvre.room), its door straight under the box (going in / out only changes y: no teleport, no
// `respawn`), 23 artworks along the walls in leg order, a red / green button under each (this team's picks only), the lock
// button in the middle. Built synchronously when the first louvre card arrives (before spawnAt: the floor collider must be
// in Rapier first), unloaded only by leave().
// FOUNDATION STUB — signatures only. TODO(phase8b track B): everything below (wallSlots, meshes ≤ 40 draw calls, colliders
// floor + 4 walls + plinths / posts, NO ceiling collider, textures /art/<image> cached + numbered placeholder, ?louvre=1).
import type { LouvreView } from '@race/shared/protocol';
import type { Scene } from 'three';

/** One place along the walls (room-local metres: origin = room centre, −z = the door wall), its button in front of it. */
export interface RoomSlot {
  /** ArtworkView.id. */
  id: string;
  type: 'painting' | 'sculpture';
  x: number;
  z: number;
  /** rad, facing into the room. */
  yaw: number;
  button: { x: number; z: number };
}

/** What F does in the room (main.ts onInteract priority after the closed box: enter → button → lock → door → bikes). */
export type RoomTarget = { kind: 'button'; id: string } | { kind: 'lock' } | { kind: 'door' };

/** Pure: the 23 places along the walls (back 9, sides 5 + 5, door wall 2 + 2; ≥ louvreRoom.slots.minSpacing apart), leg
 *  order. TODO(phase8b track B) + test (no overlap, buttons louvreRoom.button.fromWall off the wall, door at the box). */
export function wallSlots(_artworks: LouvreView['artworks']): RoomSlot[] {
  return [];
}

export class LouvreRoom {
  /** The local player is inside (Player's own env: heightAt = floorY, waterLevel null — critic C2; never the shared env). */
  active = false;
  /** The step id the room was built for (card.step !== step → done: buttons off, door sign "Đã xong – bấm F để ra"). */
  step: string | null = null;
  /** World y of the floor: heightAt(room.x, room.z) − louvreRoom.below, ≥ louvreRoom.minFloorY. */
  floorY = 0;

  /** Builds (once per step; textures preloaded / cached). TODO(phase8b track B). */
  build(_scene: Scene, _step: string, _view: LouvreView, _groundY: number): void {}

  /** F at the box: feet at the door (same x, z as the box), on the floor; sets active. TODO(phase8b track B). */
  enter(): { x: number; y: number; z: number; yaw: number } | null {
    return null;
  }

  /** F at the door: back on the court at the same x, z (y = ground); clears active, unloads. TODO(phase8b track B). */
  leave(): { x: number; z: number; yaw: number } | null {
    return null;
  }

  /** Feet (world) inside the room box. TODO(phase8b track B). */
  inside(_x: number, _y: number, _z: number): boolean {
    return false;
  }

  /** Every frame: the team's lit buttons (card.task.louvre.picks). TODO(phase8b track B). */
  setPicks(_picks: readonly string[]): void {}

  /** What F would do from feet (x, z) looking along (dx, dz), null = nothing in reach. TODO(phase8b track B) + test. */
  nearest(_x: number, _z: number, _dx: number, _dz: number): RoomTarget | null {
    return null;
  }
}
