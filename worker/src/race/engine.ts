// Phase 7 track A (docs/plans/phase7.md §5.2): the race engine behind one seam, like BikeService. RaceRoom hands it
// valid poses, race ops and Host race ops; it owns the loaded leg (meta 'leg'), step_progress (cache + writes) and the
// team race fields in teams.state, applies steps.ts effects (SQLite first, then the answers: SPEC §3) and builds the
// welcome / host.state parts. FOUNDATION STUB: the signatures are the contract; track A implements the bodies.
import type { Leg } from '@race/shared/leg';
import type { HostMessage, HostState, PoseSample, RaceOp, ServerMessage, Welcome, BoxInfo } from '@race/shared/protocol';
import type { QuotaCounters } from '../counters.ts';
import { demoLeg, legRules } from './leg.ts';

/** Race fields of teams.state (JSON; RaceRoom keeps reconnects / lastSeen / flagged next to them). */
export interface TeamRace {
  /** Index of the current step. */
  step: number;
  /** SPEC §17.12: server ms the team got its first clue outside the game (Host input), null = not entered. */
  startAt: number | null;
  /** SPEC §17.12: 1 + the number of teams that entered the game before it; set at its first WebSocket entry, kept. */
  startOrder: number | null;
  /** server ms of that first entry (step 1's clue_opened_at when no start time is set). */
  joinedAt: number | null;
  finishAt: number | null;
  penaltyMinutes: number;
}

export const NEW_TEAM_RACE: TeamRace = { step: 0, startAt: null, startOrder: null, joinedAt: null, finishAt: null, penaltyMinutes: 0 };

export interface RaceIO {
  sql: SqlStorage;
  counters: QuotaCounters;
  /** To every socket of that team. */
  send(team: string, m: ServerMessage): void;
  /** Something the Host shows changed: host.state goes out within NET.slowTickMs. */
  changed(now: number): void;
  /** race_events row, written at once (2 rows). */
  event(t: number, team: string | null, type: string, data?: unknown): void;
  /** teams.state race fields (RaceRoom owns the teams cache; save = 1 row). */
  team(id: string): TeamRace | undefined;
  saveTeam(id: string, r: TeamRace): void;
  teamIds(): string[];
  /** SPEC §6.4: the team's bike (if it holds one) to the rack `rack` at (x, z) (null = where the bike stands). */
  park(team: string, rack: string, at: { x: number; z: number } | null, now: number): void;
}

export type HostRaceMessage = Extract<HostMessage, { t: 'host.race' | 'host.team' | 'host.leg' }>;

export class RaceEngine {
  constructor(readonly io: RaceIO) {}

  /** The loaded leg (meta 'leg'; the bundled default until the Host loads another). */
  get leg(): Leg {
    return demoLeg; // track A: from SQLite
  }

  /** movement / presence / vehicles / boxReveal of the loaded leg. */
  rules() {
    return legRules(this.leg);
  }

  get status(): Welcome['status'] {
    return 'lobby'; // track A: meta 'status'
  }

  /** A team socket opened (RaceRoom.upgrade): the first ever entry gets its startOrder (SPEC §17.12). */
  enter(_team: string, _now: number): { startOrder: number; first: boolean } {
    return { startOrder: 0, first: false }; // track A
  }

  /** The race parts of a team's welcome (`first` = enter() said so). */
  welcome(_team: string, _pose: PoseSample | null, _first: boolean, _now: number): Pick<Welcome, 'view' | 'raceTime' | 'boxes' | 'startOrder' | 'showStartOrder' | 'start'> {
    return { view: null, raceTime: null, boxes: [], startOrder: null, showStartOrder: false, start: null }; // track A
  }

  /** Login summary (SPEC §8.10 "Chào mừng trở lại"): race clock s + the current step's label. */
  summary(_team: string, _now: number): { raceTime: number | null; step: string | null } {
    return { raceTime: null, step: null }; // track A
  }

  /** A pose that passed the speed check (RaceRoom.onPose, respawns included): arrivals, Pit Stop. */
  onPose(_team: string, _pose: PoseSample, _now: number): void {}

  /** A team's race op; `at` = its last valid pose (null = none yet). */
  onOp(_team: string, _m: RaceOp, _at: PoseSample | null, _now: number): void {}

  /** Host race ops; `reply` answers that Host socket (host.legResult). */
  onHost(_m: HostRaceMessage, _reply: (m: ServerMessage) => void, _now: number): void {}

  /** SPEC §17.10: the box of the team's current step (checkBoxes), null = none. */
  currentBox(_team: string): Omit<BoxInfo, 'opened'> | null {
    return null; // track A
  }

  /** SPEC §6.5: the current step is a walk-only route (BikeService.onTeam refuses claims). */
  walkOnly(_team: string): boolean {
    return false;
  }

  /** host.state parts: leg summary, step_progress, ranking, + the race fields of each team. */
  hostView(_now: number): Pick<HostState, 'leg' | 'progress' | 'ranking'> {
    return { leg: null, progress: [], ranking: [] }; // track A
  }
}
