// Phase 6 track C (docs/plans/phase6.md §6 C): the shared bikes inside the Durable Object — rows in `bikes`, the
// spawn alarm, claims, parking, abandonment — behind one seam so track A's RaceRoom.ts and track C never edit the same
// file. Decisions are the pure functions of VehicleSpawner.ts; this class owns rows, counters and messages.
import type { BikeInfo, ClientMessage, HostMessage, ServerMessage } from '@race/shared/protocol';
import type { QuotaCounters } from '../counters.ts';
import type { VehiclesConfig } from './leg.ts';
import type { PlayerSpot } from './VehicleSpawner.ts';

export interface BikeIO {
  sql: SqlStorage;
  counters: QuotaCounters;
  cfg: VehiclesConfig;
  /** To the sockets of one team. */
  send(team: string, m: ServerMessage): void;
  /** To everyone (teams and Hosts). */
  broadcast(m: ServerMessage): void;
  /** ctx.storage.setAlarm (1 row written). Only armed while someone is online (SPEC §3). */
  setAlarm(atMs: number): void;
}

export type TeamBikeMessage = Extract<ClientMessage, { t: 'bike' }>;
export type HostBikeMessage = Extract<HostMessage, { t: 'host.candidates' | 'host.bike' | 'host.spawning' }>;

/** Foundation stub: no bikes. Track C replaces the bodies, keeps the signatures. */
export class BikeService {
  constructor(readonly io: BikeIO) {}

  /** Every bike that is not gone (for `welcome` and `host.state`). */
  list(): BikeInfo[] {
    return [];
  }

  /** claim / mount / dismount from a team (SPEC §6.3; `at` = its last known spot, null = unknown). Writes before answering. */
  onTeam(_team: string, _at: PlayerSpot | null, _m: TeamBikeMessage, _walkOnly: boolean, _now: number) {}

  /** Spawn candidates, manual add / remove / release, pause (SPEC §13.5). */
  onHost(_m: HostBikeMessage, _now: number) {}

  /** Alarm (SPEC §6.2 (4)): a spawn round, then re-arm while players are online. Phase 7 also calls it at the start. */
  alarm(_players: readonly PlayerSpot[], _now: number) {}

  /** About once per second from the tick loop: abandonment (SPEC §6.3 (2)); offline owners don't count. */
  tick(_players: readonly PlayerSpot[], _now: number) {}

  /** Phase 7 (SPEC §6.4): the owner opened a task clue or a walk-only route → the bike goes to the step's rack. */
  park(_team: string, _rack: string, _now: number) {}

  get spawning(): { paused: boolean; candidates: number; nextAt: number | null } {
    return { paused: false, candidates: 0, nextAt: null };
  }
}
