// Leg 3 rooms (CLAUDE.md "Phòng của nhánh Lựa chọn kép"): the pure state machine of "the team is inside a branch's 3D room",
// driven ONLY by the server's RaceView (welcome.view / `race`), through the shared `roomKindOf` (also the server's): the
// chosen + opened detour branch whose task has `room` = the team is in that room; the step completing while inside (the card
// moves to the next step) = the exit ring appears and the next card is HELD until the body walks into the ring (left());
// "Đổi lựa chọn kép" while inside (status switchLocked, `leftRoom`) = the ring appears too, the own table is locked, the
// view passes through (the countdown shows), the team walks out by itself. A CHALLENGE card with `room` (the GardeRobe museum):
// the same, but the team may walk out through the always-lit ring whenever it likes (`left()` remembers the room so the
// unchanged card does not pull it back in) and re-enter with F at the box (`reenter()`). Drawing / physics: main.ts.
import { type ClueCard, type RaceView, type RoomView, roomKindOf } from '@race/shared/protocol';

export interface RoomTarget {
  step: string;
  /** The branch whose room it is; null = exiting after a switch (the old branch is gone from the card: ClueCard.leftRoom). */
  branch: string | null;
  room: RoomView;
  exiting: boolean;
  /** The card is held until F at the stage pick-up spot (ClueCard.pickup, BOZAR hall T3). */
  pickup?: NonNullable<ClueCard['pickup']>;
}
export type RoomEvent = 'enter' | 'exitReady' | 'switched' | 'resume' | 'pickup' | null;

/** Rooms of a plain card (no tally, no table): the ring is always lit and the team may walk out and back in (GardeRobe, BOZAR hall). */
export const isFreeRoom = (kind: RoomView['kind'] | undefined) => kind === 'garderobe' || kind === 'hall';

export const ROOM_TEXT = {
  exit: 'Lối ra đã mở: đi tới vòng sáng ở cuối phòng để nhận mật thư kế',
  exitDoor: 'Đã xong: đi tới vòng sáng cạnh cửa để ra ngoài nhận mật thư kế',
  switched: 'Đội đã đổi lựa chọn kép: đi tới vòng sáng ở cuối phòng để ra ngoài',
};

/** The room the view puts the team in: the opened branch's (progress inside), or — after a switch — the one it is still
 *  standing in (`exiting`, no progress, only the ring). */
export function roomOf(v: RaceView | null | undefined): RoomTarget | null {
  const c = v?.card, k = roomKindOf(c);
  if (!c || !k) return null;
  if (k.exiting || isFreeRoom(k.kind)) return { step: c.step, branch: null, room: { kind: k.kind, total: 0, penaltyMinutesEach: 0, done: 0, skipped: false }, exiting: k.exiting, ...(c.pickup ? { pickup: c.pickup } : {}) };
  const room = c.branches?.find((b) => b.id === c.branch)?.task?.room!;
  return { step: c.step, branch: c.branch!, room, exiting: false };
}

export class RoomFlow {
  /** "<step>|<branch>" of the room the body is in ("<step>|~" after a switch), null = in the world. */
  key: string | null = null;
  /** The ring is lit: the step completed inside, or the team switched; the body leaves by walking into it. */
  exitReady = false;
  /** The team switched: its table button is off until it is out. */
  locked = false;
  target: RoomTarget | null = null;
  /** The next card waits for F at the stage (set with the 'pickup' event; cleared by pickedUp() / left()). */
  pickup: RoomTarget | null = null;
  /** The room key the body walked out of while its card stayed (the GardeRobe): the same view does not re-enter it. */
  leftKey: string | null = null;

  /** The view the team has: hold = the HUD must not draw it yet (RaceClient.release() after left()). */
  onView(v: RaceView | null): { event: RoomEvent; hold: boolean } {
    const t = roomOf(v);
    const key = t && `${t.step}|${t.branch ?? '~'}`;
    if (this.key == null) {
      if (!t || key === this.leftKey) return { event: null, hold: false };
      this.key = key;
      this.target = t;
      this.exitReady = this.locked = t.exiting; // a reload after a switch: back in the room, ring lit
      return { event: 'enter', hold: false };
    }
    if (key === this.key) {
      this.target = t;
      const resume = this.exitReady && !t!.exiting; // a Host "Hoàn tác" put the room's card back
      if (resume) this.exitReady = this.locked = false;
      return { event: resume ? 'resume' : null, hold: false };
    }
    const [step] = this.key.split('|');
    if (v?.card?.step === step) { // the same detour step: a switch (exiting) — or the countdown over / the other box while still inside
      const first = !this.exitReady;
      if (t?.exiting) (this.key = key), (this.target = t);
      this.exitReady = this.locked = true;
      return { event: first ? 'switched' : null, hold: false };
    }
    if (t?.pickup && !t.exiting && this.target && t.room.kind === this.target.room.kind) { // T2 → T3 in the same room: F at the stage first
      const first = this.pickup?.step !== t.step;
      this.pickup = t;
      return { event: first ? 'pickup' : null, hold: true };
    }
    this.exitReady = true; // the step completed (skip, or the Host's Duyệt): walk to the ring first
    return { event: 'exitReady', hold: true };
  }

  /** F at the pick-up spot: the held card is the room's now (the next onView of it is no event); true = there was one. */
  pickedUp(): boolean {
    const t = this.pickup;
    if (!t) return false;
    this.key = `${t.step}|${t.branch ?? '~'}`;
    this.target = t;
    this.pickup = null;
    return true;
  }

  /** The body walked into the ring: back in the world. */
  left() {
    this.pickup = null;
    this.leftKey = this.key;
    this.key = null;
    this.target = null;
    this.exitReady = this.locked = false;
  }

  /** F at the opened box (outside, the card still active): the next onView enters again. */
  reenter() {
    this.leftKey = null;
  }
}

/** The stand-in card shown while the real next card is held at the stage ("Đội chơi đi lại gần sân khấu để nhận mật thư tiếp theo"). */
export function pickupView(v: RaceView, pickup: NonNullable<ClueCard['pickup']>): RaceView {
  const c = v.card!;
  return { ...v, card: { ...c, type: 'route_info', label: 'Mật thư', text: pickup.clue, media: [], transport: { allowed: 'any' }, task: undefined, branches: undefined, room: undefined, pickup: undefined, status: 'active', lockedUntil: null, lockKind: null, answers: [] } };
}
