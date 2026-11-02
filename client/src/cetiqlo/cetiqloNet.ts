// CETIQLO networking glue: the room talks `cq.*` through ONE link object (plan §4). The race: `raceLink` over RaceClient's hooks (plan §9.1:
// cqJoin / cqLeave / cqTake / cqDrop / cqCheckout; the server's messages come through `RaceDeps.onCq`, main.ts); DEV offline: cetiqloMock.ts
// implements the same link with an in-page server + bot.
import type { CqClientMessage, CqServerMessage } from './contract.ts';

export interface CqLink {
  send(m: CqClientMessage): void;
  /** The room sets it on mount, clears it on dispose. */
  onMessage: ((m: CqServerMessage) => void) | null;
  /** ms, the server clock estimate (NetClient.serverNow; the mock: Date.now()). */
  serverNow(): number;
  /** DEV mock only: the scripted state is on screen (the room's `settled()` for screenshots). */
  ready?(): boolean;
}

export interface CqRace { cqJoin(): void; cqLeave(): void; cqTake(id: string, x: number, z: number): void; cqDrop(id: string): void; cqCheckout(x: number, z: number): void }
/** The race link over RaceClient's `cq*` methods; main.ts feeds `onMessage` from `RaceDeps.onCq`. */
export function raceLink(race: CqRace, serverNow: () => number): CqLink {
  return {
    onMessage: null, serverNow,
    send(m) {
      if (m.t === 'cq.join') race.cqJoin();
      else if (m.t === 'cq.leave') race.cqLeave();
      else if (m.t === 'cq.take') race.cqTake(m.id, m.x, m.z);
      else if (m.t === 'cq.drop') race.cqDrop(m.id);
      else race.cqCheckout(m.x, m.z);
    },
  };
}
