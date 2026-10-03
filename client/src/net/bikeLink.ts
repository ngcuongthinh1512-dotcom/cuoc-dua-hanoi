// Phase 6 review fix (docs/reports/phase6-track-c.md "main.ts / Player.ts"): the server's shared bikes → the local
// player's Bikes. welcome = the full list (+ the bike the team rode before an F5, SPEC §8.10), `bikes` = changes,
// `bike` = a claim answer. main.ts sets bikes.net / team / ground / notify; this only routes messages.
import type { ServerMessage, Welcome } from '@race/shared/protocol';
import { netClient } from '../config.ts';
import type { CharacterController } from '../player/CharacterController.ts';
import type { Bikes } from '../vehicle/Bikes.ts';

export class BikeLink {
  private first = true;
  /** welcome.pose.bikeId of a team that was riding when it left: mounted again once the body stands next to it. */
  private remount: { id: string; left: number } | null = null;

  constructor(readonly bikes: Bikes) {}

  welcome(w: Welcome) {
    this.bikes.applyServer(w.bikes, [], true);
    // the first welcome only: after a reconnect the body never left the bike (Bikes.sync reports it again)
    if (this.first && w.pose?.bikeId && w.pose.mode === 'bike') this.remount = { id: w.pose.bikeId, left: netClient.remountSeconds };
    this.first = false;
  }

  /** true = a bike message, handled. */
  message(m: ServerMessage): boolean {
    if (typeof m !== 'object' || Array.isArray(m)) return false;
    if (m.t === 'bikes') this.bikes.applyServer(m.list, m.gone ?? [], m.full ?? false);
    else if (m.t === 'bike') this.bikes.onClaimResult(m);
    else return false;
    return true;
  }

  /** Every frame once the body is placed: the rejoin remount (a claim of the own bike, the server answers ok). */
  frame(dt: number, c: CharacterController) {
    const r = this.remount;
    if (!r || !c.placed) return;
    r.left -= dt;
    const b = this.bikes.list.find((o) => o.id === r.id);
    if (c.riding || !b || r.left < 0) return void (this.remount = null);
    if (!c.state.grounded) return; // not on its feet yet: try again next frame
    this.remount = null;
    this.bikes.interact(c); // in reach → claim (silent); out of reach → nothing, the team walks to it
  }
}
