// Phase 7 track B (docs/plans/phase7.md §5.3, §6 B): the team's race state on the client, ONLY from the server
// (welcome.view, `race`, `book`, `zone`): drives the race HUD (track C's RaceHud), F on the current box (D23), the periodic
// Pit Stop check-in (D19), the finish (SPEC §17.22 / §17.23 announcement, celebrate; the team keeps walking, §17.39: main.ts).
import { onPitMat } from '@race/shared';
import type { BoxInfo, ClientMessage, CqServerMessage, RaceOp, RaceView, ServerMessage, TeamInfo, TickArray, Welcome } from '@race/shared/protocol';
import { NET } from '@race/shared/protocol';
import { raceClient as C } from '../config.ts';
import { roomOf } from '../rooms/roomState.ts';
import type { RaceHud } from './ui/RaceHud.ts';
import { resultKey } from './ui/format.ts';

export interface RaceDeps {
  hud: RaceHud | undefined;
  send(m: ClientMessage): void;
  /** A `race` op, the current pose sent right before it (D4: the server checks the zone / riding on its last pose). */
  op?(m: RaceOp): void;
  /** Phase 8 (D9): the current pose now, past the send gate (a countdown ended: the server checks the branch box again). */
  pose?(): void;
  /** ms, server clock estimate (NetClient.serverNow). */
  serverNow(): number;
  /** The check-in landed (`fresh`: just now → celebrate first) or the team was already finished at (re-)entry. */
  finished?(fresh: boolean): void;
  /** Leg 3 rooms (rooms/roomState.ts): every view BEFORE the HUD sees it; true = hold it (the step completed inside a room:
   *  the next card waits until release(), when the body walked into the exit ring). */
  view?(v: RaceView | null): boolean;
  /** Leg 3 CETIQLO (docs/plans/cetiqlo.md §9): every `cq.*` server message (state / bag / opp / result / advance / no). */
  onCq?(m: CqServerMessage): void;
}

/** The current, unopened clue box whose zone holds (x, z): F opens it (D23). Mats are not opened. */
export const boxInReach = (boxes: readonly BoxInfo[], x: number, z: number): BoxInfo | undefined =>
  boxes.find((b) => !b.opened && b.kind !== 'mat' && Math.hypot(b.x - x, b.z - z) <= Math.min(b.r, NET.boxOpenReach));

/** The Pit Stop mat (x, z) stands ON (SPEC §17.38: the PIT_MAT rectangle, not the zone radius). */
export const matAt = (boxes: readonly BoxInfo[], x: number, z: number): BoxInfo | undefined =>
  boxes.find((b) => b.kind === 'mat' && onPitMat(x, z, b));

export class RaceClient {
  view: RaceView | null = null;
  private teams: TeamInfo[] = [];
  private opAt = -Infinity; // ms (performance clock) of the last F / check-in op
  private lockDone: number | null = null; // the card.lockedUntil whose end already re-sent the pose (D9)
  private held: { v: RaceView | null } | null = null; // Leg 3: the view the HUD has not seen yet (deps.view asked to hold it)
  private roomSent: { key: string; done: number } | null = null; // the last `race room` report (done only grows per branch)

  constructor(readonly deps: RaceDeps) {}

  /** Leg 3: the held view (the next card) goes to the HUD now: the body left the room. */
  release() {
    const h = this.held;
    this.held = null;
    if (h) this.deps.hud?.setView(h.v);
  }

  /** Leg 3: progress in the chosen + opened branch's room (`race room`): sent when `done` grew (or first for this branch),
   *  `skipped` once (final); `force` = re-send (a Phạt countdown ended: the server wants the n/n report again). */
  room(step: string, branch: string, done: number, skipped: boolean, force = false) {
    const key = `${step}|${branch}`;
    const last = this.roomSent?.key === key ? this.roomSent.done : -1;
    if (!force && !skipped && done <= last) return;
    this.roomSent = { key, done: Math.max(done, last) };
    this.deps.send({ t: 'race', op: 'room', step, branch, done, skipped });
  }

  /** Every welcome (also after a reconnect). `simTime` = Player.simTime (the start-order banner clock). */
  welcome(w: Welcome, simTime: number) {
    this.teams = w.teams;
    this.setView(w.view);
    if (w.showStartOrder && w.startOrder) this.deps.hud?.startOrder(w.startOrder, simTime);
    if (w.view?.result) this.deps.hud?.result(w.view.result, false); // e.g. out at the Host's "Kết thúc" while offline
    // SPEC §8.10: back after the check-in, or after the Host ended the race (read-only) → spectator at once
    if (w.view?.finishAt != null || w.view?.status === 'finished') this.deps.finished?.(false);
  }

  /** Race messages → true (handled); anything else → false (main.ts routes it on). */
  message(m: Exclude<ServerMessage, TickArray | Welcome>): boolean {
    if (m.t === 'race') {
      const was = this.view;
      const fresh = was?.finishAt == null && m.view.finishAt != null;
      this.setView(m.view);
      // "Về đích thứ n" / "BỊ LOẠI" at once; Leg 3: again when the Host sets / changes / clears the finish-line penalty
      if (m.view.result && (!was?.result || resultKey(was.result) !== resultKey(m.view.result))) this.deps.hud?.result(m.view.result, true);
      if (fresh) this.deps.finished?.(true);
      else if (was?.status !== 'finished' && m.view.status === 'finished' && m.view.finishAt == null) this.deps.finished?.(false); // Host "Kết thúc": read-only
      return true;
    }
    if (m.t === 'book') return this.deps.hud?.showBook(m.cards), true;
    if (m.t === 'zone') return this.deps.hud?.zone(m.teams, this.teams), true;
    if (m.t.startsWith('cq.')) return this.deps.onCq?.(m as CqServerMessage), true;
    return false;
  }

  /** F on foot (Player.onInteract): the current box in reach → `race open` (+ its detour branch) (true: the openBox gesture plays). */
  interact(boxes: readonly BoxInfo[], x: number, z: number, now: number): boolean {
    const b = boxInReach(boxes, x, z);
    if (!b) return false;
    if (now - this.opAt >= C.opMinGapMs) this.sendOp({ t: 'race', op: 'open', step: b.step, ...(b.branch && { branch: b.branch }) }, now);
    return true;
  }

  /** Every frame → the HUD's "Bấm F" flag. ON the Pit Stop mat, racing, on foot, not finished: `race checkin`
   *  every raceClient.checkinEveryMs once a penalty wait is over (standing still sends no pose: D9, D19).
   *  Phase 8 (D9): lockEndSlackMs after the card's countdown ends, the pose once (a team standing still sends none, the
   *  server's tick loop sleeps: this wakes it to reveal the branch box). */
  frame(boxes: readonly BoxInfo[], x: number, z: number, riding: boolean, now: number): { inZone: boolean } {
    const v = this.view;
    const due = v && v.status === 'running' && v.finishAt == null && v.card?.type === 'pit_stop' && (v.checkinAt ?? 0) <= this.deps.serverNow();
    if (due && !riding && matAt(boxes, x, z) && now - this.opAt >= C.checkinEveryMs) this.sendOp({ t: 'race', op: 'checkin' }, now);
    const until = v?.card?.lockedUntil;
    if (until != null && until !== this.lockDone && this.deps.serverNow() >= until + C.lockEndSlackMs) {
      this.lockDone = until;
      this.deps.pose?.();
      // Leg 3: a Phạt on a finished room (n/n) ran out: the server wants the report again to queue it for the Host once more
      const t = roomOf(v), r = t?.room;
      if (t && t.branch && r && v?.card?.lockKind === 'retry' && !r.skipped && r.done >= r.total) this.room(t.step, t.branch, r.done, false, true);
    }
    return { inZone: !riding && !!boxInReach(boxes, x, z) };
  }

  // Leg 3 CETIQLO (docs/plans/cetiqlo.md §9): x, z = the body's ROOM-LOCAL metres (RoomFrame.toLocal of the world pose).
  cqJoin() {
    this.deps.send({ t: 'cq.join' });
  }
  cqLeave() {
    this.deps.send({ t: 'cq.leave' });
  }
  cqTake(id: string, x: number, z: number) {
    this.deps.send({ t: 'cq.take', id, x: Math.round(x * 100) / 100, z: Math.round(z * 100) / 100 });
  }
  cqDrop(id: string) {
    this.deps.send({ t: 'cq.drop', id });
  }
  cqCheckout(x: number, z: number) {
    this.deps.send({ t: 'cq.checkout', x: Math.round(x * 100) / 100, z: Math.round(z * 100) / 100 });
  }

  // Phase 8 (docs/plans/phase8.md D8): from anywhere, so no pose first (only open / checkin are judged at the pose).
  /** A typed answer ('' = "Tôi đã gửi bài – chờ Host duyệt" of a photo task). */
  answer(step: string, text: string, parts?: string[]) {
    this.deps.send({ t: 'race', op: 'answer', step, text, ...(parts ? { parts } : {}) }); // SPEC §17.44: N boxes
  }
  /** Choose a detour branch, or switch (the HUD already confirmed the penalty). */
  branch(step: string, branch: string) {
    this.deps.send({ t: 'race', op: 'branch', step, branch });
  }
  /** "Nhận thử thách" (a card with a teaser). */
  accept(step: string) {
    this.deps.send({ t: 'race', op: 'accept', step });
  }

  private sendOp(m: RaceOp, now: number) {
    this.opAt = now;
    this.op(m);
  }

  private op(m: RaceOp) {
    (this.deps.op ?? this.deps.send)(m);
  }

  private setView(v: RaceView | null) {
    this.view = v;
    if (this.deps.view?.(v)) return void (this.held = { v }); // Leg 3: held until release() (the latest view wins)
    this.held = null;
    this.deps.hud?.setView(v);
  }
}
