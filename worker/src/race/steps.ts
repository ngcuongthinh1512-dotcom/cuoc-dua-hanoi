// Phase 7 track A (docs/plans/phase7.md D2–D8, D18, §5.2): the per-team state machine of SPEC §8.1, PURE (no SQLite, no
// sockets): a team's progress + one input (a trusted pose, an op) → the new progress + effects the engine then writes to
// SQLite BEFORE it answers anyone. Content-agnostic: it only walks leg.steps / stepZones(leg).
import { branchZone, type Leg, type Task, type Zone } from '@race/shared/leg';
import { NET, type BoxInfo, type ClueCard, type ServerNotice, type TaskView } from '@race/shared/protocol';
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
  /** A trusted pose (geofence arrivals; the route to the Pit Stop + the check-in without penalty). */
  | { kind: 'pose'; x: number; z: number; riding: boolean }
  /** F on the current box (SPEC §8.2): on foot, inside the zone (+ NET.geofenceSlack). */
  | { kind: 'open'; step: string; x: number; z: number; riding: boolean }
  /** A task done (Phase 7: the stub passes it; Phase 8: checked). */
  | { kind: 'task'; step: string; branch?: string; answer?: string; x: number; z: number }
  /** Standing on the Pit Stop mat after the penalty wait (SPEC §8.6); on a bike → boxRiding. */
  | { kind: 'checkin'; x: number; z: number; riding?: boolean };

export type RaceEffect =
  | { kind: 'arrive'; step: number }
  | { kind: 'start'; step: number; branch: string | null }
  /** Step done; the team now holds the clue of step + 1 (received at the same `now`). */
  | { kind: 'complete'; step: number }
  | { kind: 'finish' }
  /** SPEC §6.4: the team's bike (if it holds one) goes to the rack of the point where the team STANDS — never the point
   *  ahead (docs/plans/phase7.md D18). Emitted:
   *   - with `complete` of step k when the clue now received (k + 1) is a task done at that point or a walk-only route →
   *     the zone step k was completed in (the point of the box just opened, NOT zones[k + 1]);
   *   - with `arrive` in a task zone somewhere else (challenge task.location, a detour branch's location) → that zone.
   *  `rack` = Zone.rack (keyed by point), `at` = Zone.parking (null = the bike stays where it stands). */
  | { kind: 'park'; rack: string; at: { x: number; z: number } | null }
  | { kind: 'refuse'; code: ServerNotice };

/** Phase 7 verdict source (race/tasks.ts verifyTask); injected so tests can fail a task. */
export type Verify = (leg: Leg, step: number, branch: string | undefined, answer: string | undefined) => TaskVerdict;

const inside = (zn: Zone, x: number, z: number, slack: number) => Math.hypot(x - zn.x, z - zn.z) <= zn.r + slack;

/** Where step i is done: each branch place of a detour (`own` = it has its own location), else zones[i]. */
function placesOf(leg: Leg, zones: readonly Zone[], i: number): { zone: Zone; own: boolean }[] {
  const s = leg.steps[i]!;
  if (s.type === 'detour') return s.branches.map((b) => ({ zone: branchZone(leg, zones, i, b.id)!, own: !!b.task.location }));
  return [{ zone: zones[i]!, own: s.type === 'challenge' && !!s.task.location }];
}

/** The clue received after step i is a task done right at the point of step i, or a walk-only route (SPEC §6.4). */
function parksOnReceive(leg: Leg, i: number): boolean {
  const n = leg.steps[i + 1];
  if (n?.type === 'route_info') return 'mandatory' in n.transport;
  if (n?.type === 'challenge') return !n.task.location;
  // ponytail: a detour with one branch elsewhere parks only when the team enters that branch's place (none at the point)
  return n?.type === 'detour' && n.branches.every((b) => !b.task.location);
}

/** One input → new progress + effects (in order). Refusals change nothing (no row written). `running` = race status:
 *  outside 'running' a pose still records the arrival (D9) but moves nothing on; ops are gated by the engine. */
export function advance(leg: Leg, zones: readonly Zone[], p0: Progress, input: RaceInput, now: number, verify: Verify, running = true): { p: Progress; effects: RaceEffect[] } {
  const steps = leg.steps;
  let p = { ...p0 };
  const fx: RaceEffect[] = [];
  const silent = { p: p0, effects: [] as RaceEffect[] };
  const refuse = (code: ServerNotice) => ({ p: p0, effects: [{ kind: 'refuse', code }] as RaceEffect[] });
  if (p.finishAt !== null) return silent; // checked in: idempotent

  /** First entry into the current step's place (within r + slack): arrive (+ park for a task somewhere else). */
  const arrive = (x: number, z: number, slack: number): boolean => {
    const hit = placesOf(leg, zones, p.step).find((q) => inside(q.zone, x, z, slack));
    if (p.arrivedAt !== null) return !!hit;
    if (!hit) return false;
    p.arrivedAt = now;
    fx.push({ kind: 'arrive', step: p.step });
    if (hit.own) fx.push({ kind: 'park', rack: hit.zone.rack, at: hit.zone.parking });
    return true;
  };
  const complete = (i: number, at: Zone) => {
    fx.push({ kind: 'complete', step: i });
    if (parksOnReceive(leg, i)) fx.push({ kind: 'park', rack: at.rack, at: at.parking });
    p = { ...p, step: i + 1, arrivedAt: null, startedAt: null, branch: null };
  };
  /** A trusted position: arrivals, then whatever completes by standing there (route → Pit Stop zone, check-in). */
  const settle = (x: number, z: number, riding: boolean) => {
    for (let guard = 0; guard < steps.length; guard++) {
      const i = p.step, s = steps[i]!;
      if (!arrive(x, z, 0) || !running) return;
      if (s.type === 'route_info' && steps[i + 1]?.type === 'pit_stop') {
        complete(i, zones[i]!);
        continue;
      }
      if (s.type === 'pit_stop' && !riding && now >= p.arrivedAt! + p.penaltyMinutes * 60_000) {
        fx.push({ kind: 'finish' });
        p.finishAt = now;
      }
      return;
    }
  };

  if (input.kind === 'pose') {
    settle(input.x, input.z, input.riding);
    return { p, effects: fx };
  }
  const slack = NET.geofenceSlack;
  if (input.kind === 'checkin') {
    const s = steps[p.step]!;
    if (s.type !== 'pit_stop') return silent;
    if (input.riding) return refuse('boxRiding');
    if (!inside(zones[p.step]!, input.x, input.z, slack)) return refuse('boxFar');
    arrive(input.x, input.z, slack);
    if (now < p.arrivedAt! + p.penaltyMinutes * 60_000) return { p, effects: [...fx, { kind: 'refuse', code: 'penaltyWait' }] };
    fx.push({ kind: 'finish' });
    p.finishAt = now;
    return { p, effects: fx };
  }
  const i = steps.findIndex((s) => s.id === input.step);
  if (i < 0 || i > p.step) return silent; // unknown or a later step: never confirm it exists
  const s = steps[i]!;
  if (input.kind === 'open') {
    if (s.type !== 'route_info' || steps[i + 1]?.type === 'pit_stop') return silent; // no box there (the mat)
    if (i < p.step) return refuse('boxOpened');
    if (input.riding) return refuse('boxRiding');
    if (!inside(zones[i]!, input.x, input.z, slack)) return refuse('boxFar');
    arrive(input.x, input.z, slack);
    complete(i, zones[i]!);
    settle(input.x, input.z, input.riding); // the next step may be done right here (a task at the point)
    return { p, effects: fx };
  }
  // task
  if (i < p.step || (s.type !== 'detour' && s.type !== 'challenge')) return silent;
  const branch = s.type === 'detour' ? (input.branch ?? null) : null;
  const place = s.type === 'detour' ? (branch === null ? null : branchZone(leg, zones, i, branch)) : zones[i]!;
  if (!place) return silent;
  if (!inside(place, input.x, input.z, slack)) return refuse('taskFar');
  arrive(input.x, input.z, slack);
  if (verify(leg, i, input.branch, input.answer) !== 'pass') return { p, effects: fx }; // Phase 8: wrong / pending
  fx.push({ kind: 'start', step: i, branch });
  complete(i, place);
  settle(input.x, input.z, true); // riding unknown: no check-in by position from here (the client's checkin does it)
  return { p, effects: fx };
}

const cm = (v: number) => Math.round(v * 100) / 100;

/** Per step index: the box / mat that stands there for SPEC §17.10 (null = none, e.g. a detour or challenge), r = zone
 *  radius. The route right before the Pit Stop shows the Pit Stop's mat (kind 'mat', step = the Pit Stop's id). */
export function boxesOf(leg: Leg, zones: readonly Zone[]): (Omit<BoxInfo, 'opened'> | null)[] {
  return leg.steps.map((s, i) => {
    const zn = zones[i]!;
    const next = leg.steps[i + 1];
    const pit = s.type === 'pit_stop' ? s : s.type === 'route_info' && next?.type === 'pit_stop' ? next : null;
    if (pit) return { step: pit.id, x: cm(zn.x), z: cm(zn.z), r: zn.r, kind: 'mat' };
    return s.type === 'route_info' ? { step: s.id, x: cm(zn.x), z: cm(zn.z), r: zn.r } : null;
  });
}

/** SPEC §10.1 task minus `answers` / `params`; its location only by name. */
const taskView = (t: Task): TaskView => ({
  title: t.title, description: t.description, media: t.media, kind: t.kind, verification: t.verification,
  proofInstruction: t.proofInstruction, timeLimitMinutes: t.timeLimitMinutes, ...(t.location ? { place: t.location.name } : {}),
});

/** The card of step `index` as the team sees it (D7: never answers, never a destination name, never a later step), from
 *  its progress row (`clue_opened_at` = received; the engine fills step 1's from the start time). The ONLY card builder. */
export function cardOf(leg: Leg, index: number, row: StepProgressRow | undefined, now: number): ClueCard {
  const s = leg.steps[index]!;
  const base = { step: s.id, type: s.type, label: s.label, status: row?.completed_at != null ? 'done' : 'active', receivedAt: row?.clue_opened_at ?? now, completedAt: row?.completed_at ?? null } as const;
  switch (s.type) {
    case 'route_info':
      return { ...base, text: s.clue, transport: s.transport };
    case 'detour':
      return { ...base, text: s.clue, branches: s.branches.map((b) => ({ id: b.id, name: b.name, summary: b.summary, task: taskView(b.task) })), branch: row?.branch ?? null };
    case 'challenge':
      return { ...base, text: s.teaser, task: taskView(s.task) };
    case 'pit_stop':
      return { ...base, text: '' };
  }
}
