// Phase 7 track A (docs/plans/phase7.md D2–D8, §5.2): the per-team state machine of SPEC §8.1, PURE (no SQLite, no
// sockets): a team's progress + one input (a valid pose, an op) → the new progress + effects the engine then writes to
// SQLite BEFORE it answers anyone. Content-agnostic: it only walks leg.steps / stepZones(leg).
// FOUNDATION STUB: signatures are the contract; track A implements the bodies (+ steps.test.ts).
import type { Leg, Zone } from '@race/shared/leg';
import type { BoxInfo, ClueCard, ServerNotice } from '@race/shared/protocol';
import type { StepProgressRow } from '../db.ts';
import type { TaskVerdict } from './tasks.ts';

/** What the machine needs about one team (teams.state + the current step's step_progress row). */
export interface Progress {
  /** Index of the current step in leg.steps (the Pit Stop stays current after the check-in). */
  step: number;
  /** First entry into the current step's zone (step_progress.arrived_at), null = not yet. */
  arrivedAt: number | null;
  /** Task started (detour: branch chosen) for the current step. */
  startedAt: number | null;
  branch: string | null;
  finishAt: number | null;
  penaltyMinutes: number;
}

export type RaceInput =
  /** A pose that passed the speed check (geofence arrivals; the route to the Pit Stop + the check-in without penalty). */
  | { kind: 'pose'; x: number; z: number; riding: boolean }
  /** F on the current box (SPEC §8.2): on foot, inside the zone (+ NET.geofenceSlack). */
  | { kind: 'open'; step: string; x: number; z: number; riding: boolean }
  /** A task done (Phase 7: the stub passes it; Phase 8: checked). */
  | { kind: 'task'; step: string; branch?: string; answer?: string; x: number; z: number }
  /** Standing on the Pit Stop mat after the penalty wait (SPEC §8.6). */
  | { kind: 'checkin'; x: number; z: number };

export type RaceEffect =
  | { kind: 'arrive'; step: number }
  | { kind: 'start'; step: number; branch: string | null }
  /** Step done; the team now holds the clue of step + 1 (received at the same `now`). */
  | { kind: 'complete'; step: number }
  | { kind: 'finish' }
  /** SPEC §6.4: the team's bike (if it holds one) goes to the rack of the point where the team STANDS — never the point
   *  ahead (docs/plans/phase7.md D18). Emitted:
   *   - with `complete` of step k when the clue now received (k + 1) is a task done at that point or a walk-only route →
   *     zones[k].rack / zones[k].parking (the point of the box just opened, NOT zones[k + 1]: for a walk-only route that
   *     is the destination ahead);
   *   - with `arrive` in a task zone somewhere else (challenge task.location, a detour branch's location) → that zone's
   *     rack (the team rode there; it walks only inside the task area).
   *  `rack` = Zone.rack (keyed by point), `at` = Zone.parking (null = the bike stays where it stands). */
  | { kind: 'park'; rack: string; at: { x: number; z: number } | null }
  | { kind: 'refuse'; code: ServerNotice };

/** Phase 7 verdict source (race/tasks.ts verifyTask); injected so tests can fail a task. */
export type Verify = (leg: Leg, step: number, branch: string | undefined, answer: string | undefined) => TaskVerdict;

/** One input → new progress + effects (in order). Refusals change nothing. */
export function advance(_leg: Leg, _zones: readonly Zone[], p: Progress, _input: RaceInput, _now: number, _verify: Verify): { p: Progress; effects: RaceEffect[] } {
  return { p, effects: [] }; // track A
}

/** Per step index: the box / mat that stands there for SPEC §17.10 (null = none, e.g. a detour or challenge), r = zone
 *  radius. The route right before the Pit Stop shows the Pit Stop's mat (kind 'mat', step = the Pit Stop's id). */
export function boxesOf(_leg: Leg, _zones: readonly Zone[]): (Omit<BoxInfo, 'opened'> | null)[] {
  return []; // track A
}

/** The card of step `index` as the team sees it (never answers, never a destination name), from its progress row. */
export function cardOf(_leg: Leg, index: number, _row: StepProgressRow | undefined, _now: number): ClueCard {
  throw new Error(`cardOf(${index}): track A`);
}
