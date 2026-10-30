// Leg 3 rooms: the contract between a room module (choco/chocoRoom.ts, gallery/galleryRoom.ts: `mountRoom`) and its two
// hosts. The room is built as ONE group in room-local metres (rooms/roomFrame.ts) and placed into the given scene at the
// frame: the dev page (choco.ts / gallery.ts: own scene / renderer / loop, the RoomPlayer walker, hard-coded TEAMS,
// progress in localStorage) and the race (main.ts: the GAME's scene, `rooms.below` m under the branch box, the game's own
// Player walking on colliders added to the game's Rapier world, the real team, progress from the server, `race room`
// reports; loaded with a dynamic import so the room's chunk stays out of the main bundle). Graphics are minimal by
// default (no shadows / post / steam, few lights, fewer segments); `hq` brings the full look back (dev `?hq=1`).
import type RAPIER from '@dimforge/rapier3d-compat';
import type { Object3D, PerspectiveCamera, Scene, WebGLRenderer } from 'three';
import type { RoomFrame } from './roomFrame.ts';
import type { RoomPlayer } from './roomPlayer.ts';

export interface RoomTeam { slot: number; name: string; colour: string }

export interface RoomMountOptions {
  renderer: WebGLRenderer;
  q: URLSearchParams;
  /** The scene the room group goes into (the game's, or the dev page's own). */
  scene: Scene;
  frame: RoomFrame;
  /** Full look: shadows, post, steam, every light (dev `?hq=1`); default minimal. */
  hq?: boolean;
  /** The race: the game's physics world (the room's colliders go in and out of it) + where the game's body stands; absent =
   *  the dev page (a RoomPlayer with its own world, camera and input is built inside). */
  world?: RAPIER.World;
  feet?: () => { x: number; z: number };
  /** The race: the game's camera (garderobeRoom glides it to a vitrine close-up after the Player placed it; main.ts calls
   *  `update` after `Player.update`). Absent = the dev page's own. */
  camera?: PerspectiveCamera;
  /** The race: this team (its table / desk = `slot`, 1..11), + the other teams' placards from the real TeamInfo list. Absent =
   *  the dev page (chocoBuild / galleryBuild TEAMS, `?team=`). */
  team?: RoomTeam & { avatar?: 0 | 1 };
  teams?: readonly RoomTeam[];
  /** The race: the leg's `task.room` (total, minutes per missing item) — the overlay texts; absent = the game's own numbers. */
  room?: { total: number; penaltyMinutesEach: number };
  /** More reasons the body stands still (a clue card / the menu open). */
  frozen?: () => boolean;
  /** The race: a result from the mini-game (done grew / "Bỏ qua") → `race room`. Absent = localStorage (dev pages). */
  onResult?: (r: { done: number; skipped: boolean }) => void;
  /** The race: F on a seat in the BOZAR hall (T2 `pick: 'seat'`) → its label ("J-14", hallBuild seatLabel) as the answer; the server grades it. Absent = the dev page (a toast only). */
  onSeat?: (label: string) => void;
  /** The race: F at the clue pick-up spot by the stage (BOZAR hall, after T2: `setPickup` lit it) → the held next card is released. Absent = the dev page (a toast). */
  onPickup?: () => void;
  /** The overlay closed (the race re-takes the pointer lock inside this user gesture). */
  onClose?: () => void;
}

export interface RoomHandle {
  /** The room's objects (one group at the frame; main.ts keeps it drawn while the world is hidden). */
  readonly group: Object3D;
  /** Room-local height of the ceiling (the camera stays under it: main.ts). */
  readonly ceiling: number;
  /** The dev page's walker (absent in the race). */
  readonly player?: RoomPlayer;
  /** Once per frame (after the Input poll): the walker (dev), the prompt / button glow, the ring pulse. */
  update(dt: number): void;
  /** The race: F pressed by the game's body → true = the own table's button was in reach and the game opened. */
  interact(): boolean;
  /** Dev page only: draw (own camera / composer) and follow the window size. */
  render?(): void;
  resize?(): void;
  /** The server's tally for this team's table (the race: the view's room.done / skipped); the dev page: localStorage. */
  setProgress(done: number, skipped: boolean): void;
  /** The BOZAR hall (T3 `pickup`): light a pick-up spot at the front of the stalls by the stage with this prompt ("Bấm F để nhận mật thư thử thách 3"; F in reach → `onPickup`, `interact()` true); null = off. Other rooms: absent. */
  setPickup?(prompt: string | null): void;
  /** The exit ring at the far end: on = the body may leave (the step is done, or the team switched branch). */
  setExit(on: boolean): void;
  /** "Đổi lựa chọn kép" happened: the own button is off (grey prompt), the overlay closed; only the ring is left. */
  setLocked(on: boolean): void;
  /** The feet stand inside the lit ring. */
  exitHit(): boolean;
  overlayOpen(): boolean;
  /** Rendered a few frames (and the mini-game iframe loaded if open): screenshots. */
  settled(): boolean;
  /** Draw calls etc. of the last frame (dev page __STATS__). */
  stats(): { calls: number; triangles: number };
  dispose(): void;
}
