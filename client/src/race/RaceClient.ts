// Phase 7 track B (docs/plans/phase7.md §5.3, §6 B): the team's race state on the client, ONLY from the server
// (welcome.view, `race`, `book`, `zone`): drives the race HUD (track C's RaceHud), the clock, F on the current box (D23),
// the periodic Pit Stop check-in (D19), the finish (celebrate, host NPC line, then spectator: main.ts).
import type { BoxInfo, ClientMessage, RaceOp, RaceView, ServerMessage, TeamInfo, TickArray, Welcome } from '@race/shared/protocol';
import { raceClient as C } from '../config.ts';
import type { RaceHud } from './ui/RaceHud.ts';

export interface RaceDeps {
  hud: RaceHud | undefined;
  send(m: ClientMessage): void;
  /** A `race` op, the current pose sent right before it (D4: the server checks the zone / riding on its last pose). */
  op?(m: RaceOp): void;
  /** Phase 8 (D9): the current pose now, past the send gate (a countdown ended: the server checks the branch box again). */
  pose?(): void;
  /** ms, server clock estimate (NetClient.serverNow). */
  serverNow(): number;
  /** The team's name (the host NPC's line). */
  team?: string;
  /** The check-in landed (`fresh`: just now → celebrate first) or the team was already finished at (re-)entry. */
  finished?(fresh: boolean): void;
}

/** Race clock (s) of a view at server time `now`: since the team's start time, stopped at the check-in (SPEC §17.12).
 *  Stopped, it is rounded to whole seconds like the finish line's officialMs and the Host table (HUD floors the rest). */
export const raceClock = (v: RaceView | null, now: number): number | null =>
  v?.startAt == null ? null : v.finishAt == null ? Math.max(0, (now - v.startAt) / 1000) : Math.max(0, Math.round((v.finishAt - v.startAt) / 1000));

/** The current, unopened clue box whose zone holds (x, z): F opens it (D23). Mats are not opened. */
export const boxInReach = (boxes: readonly BoxInfo[], x: number, z: number): BoxInfo | undefined =>
  boxes.find((b) => !b.opened && b.kind !== 'mat' && Math.hypot(b.x - x, b.z - z) <= b.r);

/** The Pit Stop mat zone holding (x, z). */
export const matAt = (boxes: readonly BoxInfo[], x: number, z: number): BoxInfo | undefined =>
  boxes.find((b) => b.kind === 'mat' && Math.hypot(b.x - x, b.z - z) <= b.r);

export class RaceClient {
  view: RaceView | null = null;
  private teams: TeamInfo[] = [];
  private opAt = -Infinity; // ms (performance clock) of the last F / check-in op
  private lockDone: number | null = null; // the card.lockedUntil whose end already re-sent the pose (D9)

  constructor(readonly deps: RaceDeps) {}

  /** Every welcome (also after a reconnect). `simTime` = Player.simTime (the start-order banner clock). */
  welcome(w: Welcome, simTime: number) {
    this.teams = w.teams;
    this.setView(w.view);
    if (w.showStartOrder && w.startOrder) this.deps.hud?.startOrder(w.startOrder, simTime);
    // SPEC §8.10: back after the check-in, or after the Host ended the race (read-only) → spectator at once
    if (w.view?.finishAt != null || w.view?.status === 'finished') this.deps.finished?.(false);
  }

  /** Race messages → true (handled); anything else → false (main.ts routes it on). */
  message(m: Exclude<ServerMessage, TickArray | Welcome>): boolean {
    if (m.t === 'race') {
      const was = this.view;
      const fresh = was?.finishAt == null && m.view.finishAt != null;
      this.setView(m.view);
      if (fresh) this.deps.hud?.finished(this.deps.team ?? '', m.view.officialMs), this.deps.finished?.(true);
      else if (was?.status !== 'finished' && m.view.status === 'finished' && m.view.finishAt == null) this.deps.finished?.(false); // Host "Kết thúc": read-only
      return true;
    }
    if (m.t === 'book') return this.deps.hud?.showBook(m.cards), true;
    if (m.t === 'zone') return this.deps.hud?.zone(m.teams, this.teams), true;
    return false;
  }

  /** s on the team's race clock now; null = the Host has not entered its start time yet. */
  raceTime(): number | null {
    return raceClock(this.view, this.deps.serverNow());
  }

  /** F on foot (Player.onInteract): the current box in reach → `race open` (+ its detour branch) (true: the openBox gesture plays). */
  interact(boxes: readonly BoxInfo[], x: number, z: number, now: number): boolean {
    const b = boxInReach(boxes, x, z);
    if (!b) return false;
    if (now - this.opAt >= C.opMinGapMs) this.sendOp({ t: 'race', op: 'open', step: b.step, ...(b.branch && { branch: b.branch }) }, now);
    return true;
  }

  /** Every frame → the HUD's "Bấm F" flag. On the Pit Stop mat zone, racing, on foot, not finished: `race checkin`
   *  every raceClient.checkinEveryMs once a penalty wait is over (standing still sends no pose: D9, D19).
   *  Phase 8 (D9): lockEndSlackMs after the card's countdown ends, the pose once (a team standing still sends none, the
   *  server's tick loop sleeps: this wakes it to reveal the branch box). */
  frame(boxes: readonly BoxInfo[], x: number, z: number, riding: boolean, now: number): { inZone: boolean } {
    const v = this.view;
    const due = v && v.status === 'running' && v.finishAt == null && v.card?.type === 'pit_stop' && (v.checkinAt ?? 0) <= this.deps.serverNow();
    if (due && !riding && matAt(boxes, x, z) && now - this.opAt >= C.checkinEveryMs) this.sendOp({ t: 'race', op: 'checkin' }, now);
    const until = v?.card?.lockedUntil;
    if (until != null && until !== this.lockDone && this.deps.serverNow() >= until + C.lockEndSlackMs) (this.lockDone = until), this.deps.pose?.();
    return { inZone: !riding && !!boxInReach(boxes, x, z) };
  }

  // Phase 8 (docs/plans/phase8.md D8): from anywhere, so no pose first (only open / checkin are judged at the pose).
  /** A typed answer ('' = "Tôi đã gửi bài – chờ Host duyệt" of a photo task). */
  answer(step: string, text: string) {
    this.deps.send({ t: 'race', op: 'answer', step, text });
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
    this.deps.hud?.setView(v);
  }
}
