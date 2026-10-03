// Phase 7 track B (docs/plans/phase7.md §5.3, §6 B): the team's race state on the client, ONLY from the server
// (welcome.view, `race`, `book`, `zone`): drives the race HUD (track C's RaceHud), F on the current box (D23), the periodic
// Pit Stop check-in (D19), the finish (SPEC §17.22 / §17.23 announcement, celebrate, then spectator: main.ts).
import { onPitMat } from '@race/shared';
import type { BoxInfo, ClientMessage, RaceOp, RaceView, ServerMessage, TeamInfo, TickArray, Welcome } from '@race/shared/protocol';
import { louvreRoom, raceClient as C } from '../config.ts';
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
  /** The check-in landed (`fresh`: just now → celebrate first) or the team was already finished at (re-)entry. */
  finished?(fresh: boolean): void;
}

/** The current, unopened clue box whose zone holds (x, z): F opens it (D23). Mats are not opened. */
export const boxInReach = (boxes: readonly BoxInfo[], x: number, z: number): BoxInfo | undefined =>
  boxes.find((b) => !b.opened && b.kind !== 'mat' && Math.hypot(b.x - x, b.z - z) <= b.r);

/** The Pit Stop mat (x, z) stands ON (SPEC §17.38: the PIT_MAT rectangle, not the zone radius). */
export const matAt = (boxes: readonly BoxInfo[], x: number, z: number): BoxInfo | undefined =>
  boxes.find((b) => b.kind === 'mat' && onPitMat(x, z, b));

export class RaceClient {
  view: RaceView | null = null;
  private teams: TeamInfo[] = [];
  private opAt = -Infinity; // ms (performance clock) of the last F / check-in op
  private lockDone: number | null = null; // the card.lockedUntil whose end already re-sent the pose (D9)
  private hintsAsked = new Set<string>(); // Phase 8B: "<step>@<hintAt[i]>" marks whose `view` went out (once each)
  private pickAt = -Infinity; // ms (performance clock) of the last pick

  constructor(readonly deps: RaceDeps) {}

  /** Every welcome (also after a reconnect). `simTime` = Player.simTime (the start-order banner clock). */
  welcome(w: Welcome, simTime: number) {
    this.teams = w.teams;
    this.setView(w.view);
    this.deps.hud?.feed(w.feed ?? [], w.teams, true); // Phase 8B: the public feed so far, replacing ours (a reconnect must not repeat it)
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
      if (m.view.result && !was?.result) this.deps.hud?.result(m.view.result, true); // "Về đích thứ n" / "BỊ LOẠI" at once
      if (fresh) this.deps.finished?.(true);
      else if (was?.status !== 'finished' && m.view.status === 'finished' && m.view.finishAt == null) this.deps.finished?.(false); // Host "Kết thúc": read-only
      return true;
    }
    if (m.t === 'book') return this.deps.hud?.showBook(m.cards), true;
    if (m.t === 'zone') return this.deps.hud?.zone(m.teams, this.teams), true;
    // Phase 8B (docs/plans/phase8b.md §G, critic S3): the public feed line → RaceHud.feed (track C draws it); the "Ghi
    // nguồn" answer after the finish → RaceHud.credits (track C, ui/Credits.ts)
    if (m.t === 'feed') return this.deps.hud?.feed([m], this.teams), true;
    if (m.t === 'credits') return this.deps.hud?.credits(m.items), true;
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
    if (until != null && until !== this.lockDone && this.deps.serverNow() >= until + C.lockEndSlackMs) (this.lockDone = until), this.deps.pose?.();
    // Phase 8B (§E, no server timer): lockEndSlackMs after each hint mark the card again, once (a team standing still in
    // the room gets "5 tác phẩm" / "Đúng x/5"); a card that already has that hint asks nothing
    const lv = v?.card?.task?.louvre;
    if (lv && v.status === 'running') {
      lv.hintAt.forEach((at, i) => {
        const key = `${v.card!.step}@${at}`;
        const has = i === 0 ? lv.hintCount !== null : lv.hintCorrect !== null;
        if (!has && !this.hintsAsked.has(key) && this.deps.serverNow() >= at + C.lockEndSlackMs) this.hintsAsked.add(key), this.refresh();
      });
    }
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

  // Phase 8B (docs/plans/phase8b.md §C, §G): the Louvre room (frame() above asks the card again at each hint mark).
  /** A button under an artwork (on = light it); from anywhere: no pose first. At most one per louvreRoom.pickGapMs (F
   *  mashing must not trip the server's 15 msg/s: verify-foundation #10); false = dropped. */
  pick(step: string, art: string, on: boolean, now: number): boolean {
    if (now - this.pickAt < louvreRoom.pickGapMs) return false;
    this.pickAt = now;
    this.deps.send({ t: 'race', op: 'pick', step, art, on });
    return true;
  }
  /** The lock button in the middle of the room: the pose first (the server checks it stands in the step's zone). At most
   *  one per raceClient.opMinGapMs like F at a box (each lock counts in NET.maxRaceOps); false = dropped. */
  lock(step: string, now = -Infinity): boolean {
    if (now - this.opAt < C.opMinGapMs) return false;
    this.sendOp({ t: 'race', op: 'lock', step }, now);
    return true;
  }
  /** The card again (`race view`, 0 rows): at a hint mark, the team standing still. */
  refresh() {
    this.deps.send({ t: 'race', op: 'view' });
  }
  /** "Ghi nguồn" in a race: items come back once the team finished / the race is over, else notice creditsLocked. */
  credits() {
    this.deps.send({ t: 'race', op: 'credits' });
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
