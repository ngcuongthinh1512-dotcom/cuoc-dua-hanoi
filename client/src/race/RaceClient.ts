// Phase 7 track B (docs/plans/phase7.md §5.3, §6 B): the team's race state on the client, ONLY from the server
// (welcome.view, `race`, `book`, `zone`): drives the race HUD (track C's RaceHud), the clock, and (track B) F on the
// current box, the Pit Stop mat + host NPC, the NPC exclusion zones, the spectator mode after the check-in.
// FOUNDATION: the message routing + clock below are final; track B adds the rest without changing these signatures.
import type { ClientMessage, RaceView, ServerMessage, TeamInfo, TickArray, Welcome } from '@race/shared/protocol';
import type { RaceHud } from './ui/RaceHud.ts';

export interface RaceDeps {
  hud: RaceHud | undefined;
  send(m: ClientMessage): void;
  /** ms, server clock estimate (NetClient.serverNow). */
  serverNow(): number;
}

/** Race clock (s) of a view at server time `now`: since the team's start time, stopped at the check-in (SPEC §17.12). */
export const raceClock = (v: RaceView | null, now: number): number | null => (v?.startAt == null ? null : Math.max(0, ((v.finishAt ?? now) - v.startAt) / 1000));

export class RaceClient {
  view: RaceView | null = null;
  private teams: TeamInfo[] = [];

  constructor(readonly deps: RaceDeps) {}

  /** Every welcome (also after a reconnect). `simTime` = Player.simTime (the start-order banner clock). */
  welcome(w: Welcome, simTime: number) {
    this.teams = w.teams;
    this.setView(w.view);
    if (w.showStartOrder && w.startOrder) this.deps.hud?.startOrder(w.startOrder, simTime);
  }

  /** Race messages → true (handled); anything else → false (main.ts routes it on). */
  message(m: Exclude<ServerMessage, TickArray | Welcome>): boolean {
    if (m.t === 'race') return this.setView(m.view), true;
    if (m.t === 'book') return this.deps.hud?.showBook(m.cards), true;
    if (m.t === 'zone') return this.deps.hud?.zone(m.teams, this.teams), true;
    return false;
  }

  /** s on the team's race clock now; null = the Host has not entered its start time yet. */
  raceTime(): number | null {
    return raceClock(this.view, this.deps.serverNow());
  }

  private setView(v: RaceView | null) {
    this.view = v;
    this.deps.hud?.setView(v);
  }
}
