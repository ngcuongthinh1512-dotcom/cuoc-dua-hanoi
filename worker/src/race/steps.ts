// Phase 7 track A (docs/plans/phase7.md D2–D8, D18, §5.2): the per-team state machine of SPEC §8.1, PURE (no SQLite, no
// sockets): a team's progress + one input (a trusted pose, an op) → the new progress + effects the engine then writes to
// SQLite BEFORE it answers anyone. Content-agnostic: it only walks leg.steps / stepZones(leg).
// Phase 8 foundation (docs/plans/phase8.md §4, §5.2): the card / box / place contract is done here (taskState, cardOf,
// boxesOf per branch, placesOf per chosen branch); the new transitions (accept / answer / branch / open{branch} /
// approve, review, mediaAllowed) are typed stubs marked TODO(phase8 track A).
import { branchZone, type Leg, type MediaItem, type Task, type Zone } from '@race/shared/leg';
import { MEDIA, NET, type AnswerView, type BoxInfo, type CardStatus, type ClueCard, type HostReview, type MediaView, type ServerNotice, type TaskView } from '@race/shared/protocol';
import { parseAnswers, type AnswerRec, type StepProgressRow } from '../db.ts';
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
  // Phase 8 (D5 / D6), from the current step's row
  /** detour: the chosen branch's box opened (step_progress.branch_opened_at), null = not yet. */
  branchOpenedAt: number | null;
  /** A retry / switch countdown ends then (step_progress.locked_until; may be past), null = none. */
  lockedUntil: number | null;
  /** id of the answer waiting for the Host (the last one, status pending), null = none. */
  pendingId: number | null;
}

export type RaceInput =
  /** A trusted pose (geofence arrivals; the route to the Pit Stop + the check-in without penalty). */
  | { kind: 'pose'; x: number; z: number; riding: boolean }
  /** F on the current box (SPEC §8.2): on foot, inside the zone (+ NET.geofenceSlack). Phase 8: `branch` = the chosen
   *  detour branch's box (D6, TODO track A). */
  | { kind: 'open'; step: string; branch?: string; x: number; z: number; riding: boolean }
  // Phase 8 (D5 / D6 / D8 / D22), from anywhere: no zone, no foot rule, no trusted pose (critic N2). TODO(phase8 track A).
  /** "Nhận thử thách" (a challenge with a teaser): task_started_at = now. */
  | { kind: 'accept'; step: string }
  /** A typed answer ('' = "Tôi đã gửi bài" of a photo task): host_approval → pending; auto → verifyAuto. */
  | { kind: 'answer'; step: string; text: string }
  /** Choose a detour branch (no lock), or switch to the other one (branchSwitchLockMinutes lock; refused while pending). */
  | { kind: 'branch'; step: string; branch: string }
  /** The Host approved step's answer (or an auto answer was right): complete + settle like `open` (critic S3); `pose` =
   *  the team's trusted pose now: its bike goes to the rack only if it stands in the place (S3 coverage), null = none. */
  | { kind: 'approve'; step: string; pose: { x: number; z: number; riding: boolean } | null }
  /** A task done (Phase 7: the stub passes it; Phase 8: checked); on a bike → boxRiding (D4). */
  | { kind: 'task'; step: string; branch?: string; answer?: string; x: number; z: number; riding?: boolean }
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
  | { kind: 'refuse'; code: ServerNotice }
  // Phase 8 (D4–D6): RaceEngine.apply writes them (step_progress row + events in one transaction, then the messages).
  // TODO(phase8 track A): emitted by advance, applied in RaceEngine.apply. `step` = index in leg.steps.
  | { kind: 'accept'; step: number }
  /** rec = the answer appended to step_progress.answers; verdict pending → submitted_at, queue; correct → complete. */
  | { kind: 'answer'; step: number; rec: AnswerRec; verdict: 'pending' | 'correct' | 'wrong' }
  | { kind: 'branch'; step: number; branch: string }
  /** branch_switches + 1, branch_opened_at / task_started_at / arrived_at = null, locked_until = lockedUntil. */
  | { kind: 'switch'; step: number; from: string; to: string; lockedUntil: number }
  | { kind: 'openBranch'; step: number; branch: string }
  /** The switched-away branch's box: RaceIO.hideBox (socket attachments cleared, then {t:'box', op:'remove'}). */
  | { kind: 'hideBox'; step: number; branch: string };

/** Phase 7 verdict source (race/tasks.ts verifyTask); injected so tests can fail a task. */
export type Verify = (leg: Leg, step: number, branch: string | undefined, answer: string | undefined) => TaskVerdict;

const inside = (zn: Zone, x: number, z: number, slack: number) => Math.hypot(x - zn.x, z - zn.z) <= zn.r + slack;

/** Where step i is done (`own` = a place of its own: entering it parks the bike). A detour: ONLY the chosen branch's place,
 *  none before a choice (Phase 8 critic C1: riding past the other branch's place must not record an arrival, park the
 *  bike or make it "a point of the team"). */
export function placesOf(leg: Leg, zones: readonly Zone[], i: number, branch: string | null): { zone: Zone; own: boolean }[] {
  const s = leg.steps[i]!;
  if (s.type === 'detour') {
    const b = s.branches.find((x) => x.id === branch);
    return b ? [{ zone: branchZone(leg, zones, i, b.id)!, own: !!b.task.location }] : [];
  }
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
    const hit = placesOf(leg, zones, p.step, p.branch).find((q) => inside(q.zone, x, z, slack));
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
  // TODO(phase8 track A, D5 / D6 / D22): accept / answer / branch / approve / open{branch} transitions (taskState says
  // what each card state accepts; refusals: taskNotStarted, answerPending, answerLocked, branchPending).
  if (input.kind === 'accept' || input.kind === 'answer' || input.kind === 'branch' || input.kind === 'approve' || (input.kind === 'open' && input.branch !== undefined)) return silent;
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
  if (input.riding) return refuse('boxRiding');
  if (!inside(place, input.x, input.z, slack)) return refuse('taskFar');
  arrive(input.x, input.z, slack);
  if (verify(leg, i, input.branch, input.answer) !== 'pass') return { p, effects: fx }; // Phase 8: wrong / pending
  fx.push({ kind: 'start', step: i, branch });
  complete(i, place);
  settle(input.x, input.z, !!input.riding);
  return { p, effects: fx };
}

const cm = (v: number) => Math.round(v * 100) / 100;

/** Per step index, the boxes that stand there for SPEC §17.10 (null = none: a challenge), r = zone radius, yaw = where its
 *  front faces. The route right before the Pit Stop shows the Pit Stop's mat (kind 'mat', step = the Pit Stop's id). A
 *  detour: one box per branch at its place (branchZone), `branch` set (D6: only the chosen one is ever sent). */
export function boxesOf(leg: Leg, zones: readonly Zone[]): (Omit<BoxInfo, 'opened'>[] | null)[] {
  const box = (step: string, zn: Zone, more: { kind?: 'mat'; branch?: string } = {}): Omit<BoxInfo, 'opened'> => ({ step, x: cm(zn.x), z: cm(zn.z), r: zn.r, yaw: Math.round(zn.yaw * 1000) / 1000, ...more });
  return leg.steps.map((s, i) => {
    const zn = zones[i]!;
    const next = leg.steps[i + 1];
    const pit = s.type === 'pit_stop' ? s : s.type === 'route_info' && next?.type === 'pit_stop' ? next : null;
    if (pit) return [box(pit.id, zn, { kind: 'mat' })];
    if (s.type === 'route_info') return [box(s.id, zn)];
    if (s.type === 'detour') return s.branches.map((b) => box(s.id, branchZone(leg, zones, i, b.id)!, { branch: b.id }));
    return null;
  });
}

/** Phase 8 (D5 / D6): the card state of step i from its row + now (no timer, nothing in memory: a DO woken after an
 *  eviction says the same). Priority done > pending > locked > active > teaser (critic N3); a detour before its branch
 *  box is opened: choose / switchLocked / goToBranch. */
export function taskState(leg: Leg, i: number, row: StepProgressRow | undefined, now: number): CardStatus {
  const s = leg.steps[i]!;
  if (row?.completed_at != null) return 'done';
  if (s.type !== 'challenge' && s.type !== 'detour') return 'active';
  const locked = (row?.locked_until ?? 0) > now;
  if (s.type === 'detour' && row?.branch_opened_at == null) return row?.branch == null ? 'choose' : locked ? 'switchLocked' : 'goToBranch';
  if (parseAnswers(row).at(-1)?.s === 'pending') return 'pending';
  if (locked) return 'locked';
  return s.type === 'challenge' && s.teaser !== '' && row?.task_started_at == null ? 'teaser' : 'active';
}

const mediaView = (m: MediaItem): MediaView => ({ url: m.url, label: m.label, kind: m.url.startsWith(MEDIA.prefix) ? 'image' : 'link' });

/** SPEC §10.1 task minus `answers` / `referenceAnswers` / `params`; its location only by name. */
const taskView = (leg: Leg, t: Task): TaskView => ({
  title: t.title, description: t.description, media: t.media.map(mediaView), kind: t.kind, verification: t.verification,
  input: t.kind === 'free' ? 'proof' : 'text', proofInstruction: t.proofInstruction,
  ...(t.kind === 'free' ? { contactUrl: leg.hostApproval.contactUrl, contactLabel: leg.hostApproval.contactLabel } : {}),
  timeLimitMinutes: t.timeLimitMinutes, ...(t.location ? { place: t.location.name } : {}),
});

/** Minutes of the Host's "Phạt" on this task. */
export const retryLockMinutes = (leg: Leg, t: Task) => t.retryLockMinutes ?? leg.penalties.retryLockMinutes;

/** The team's own answers on its card: this branch only (null = a challenge), newest NET.answerHistory, never a note. */
const answerViews = (row: StepProgressRow | undefined, branch: string | null): AnswerView[] =>
  parseAnswers(row).filter((a) => a.b === branch).slice(-NET.answerHistory).map((a) => ({ id: a.id, text: a.text, at: a.at, status: a.s }));

/** The card of step `index` as the team sees it (never answers / reference answers / Host notes / a destination name / a
 *  later step / an unopened branch's task), from its progress row (`clue_opened_at` = received; the engine fills step
 *  1's from the start time) + now (card state, docs/plans/phase8.md D3). The ONLY card builder. */
export function cardOf(leg: Leg, index: number, row: StepProgressRow | undefined, now: number): ClueCard {
  const s = leg.steps[index]!;
  const status = taskState(leg, index, row, now);
  const lockedUntil = status === 'locked' || status === 'switchLocked' ? row!.locked_until : null;
  const base = {
    step: s.id, type: s.type, label: s.label, media: [] as MediaView[], status, lockedUntil, lockKind: lockedUntil === null ? null : status === 'switchLocked' ? ('switch' as const) : ('retry' as const),
    answers: [] as AnswerView[], receivedAt: row?.clue_opened_at ?? now, completedAt: row?.completed_at ?? null,
  };
  switch (s.type) {
    case 'route_info':
      return { ...base, text: s.clue, transport: s.transport, media: s.media.map(mediaView) };
    case 'detour': {
      const branch = row?.branch ?? null;
      const b = s.branches.find((x) => x.id === branch);
      // the chosen branch's task is in its box: on the card once opened (or the step done: the branch the team did)
      const opened = !!b && (row?.branch_opened_at != null || row?.completed_at != null);
      return {
        ...base, text: s.clue, media: s.media.map(mediaView),
        branches: s.branches.map((x) => ({ id: x.id, name: x.name, summary: x.summary, ...(opened && x === b ? { task: taskView(leg, x.task) } : {}) })),
        branch, branchOpened: opened, switches: row?.branch_switches ?? 0, switchPenaltyMinutes: leg.penalties.branchSwitchLockMinutes,
        ...(b ? { retryPenaltyMinutes: retryLockMinutes(leg, b.task), answers: answerViews(row, branch) } : {}),
      };
    }
    case 'challenge':
      return { ...base, text: s.teaser, retryPenaltyMinutes: retryLockMinutes(leg, s.task), answers: answerViews(row, null), ...(status === 'teaser' ? {} : { task: taskView(leg, s.task) }) };
    case 'pit_stop':
      return { ...base, text: '' };
  }
}

/** Phase 8 (D5, D10, critic N4 / N11): a Host decision on step i of a team (its row). Only checks + edits the row:
 *  approve → `approve: true` and the engine runs advance({kind:'approve'}) (complete + settle, S3); penalize → locked_until
 *  = now + retryLockMinutes; note → host_note. Refusals in Vietnamese for host.notice ("Bài này đã được xử lý", "Đội
 *  chưa gửi câu trả lời"…). TODO(phase8 track A): the rules of D5; until then every review is refused. */
export function review(_leg: Leg, _i: number, _row: StepProgressRow | undefined, _m: HostReview, _now: number): { row: StepProgressRow; approve: boolean } | { refuse: string } {
  return { refuse: 'Chức năng duyệt bài chưa xong (Phase 8 đang làm).' };
}

/** Phase 8 (D13): may a team on step `step` (its rows by step id) load the R2 image `name`? Only media of what it has
 *  opened: route / detour clues ≤ its step, a challenge's task once started (past the teaser), the chosen branch's task
 *  once its box is opened (a done detour: the branch it did). The Host always may (index.ts). TODO(phase8 track A):
 *  until then nothing is served to a team. */
export function mediaAllowed(_leg: Leg, _step: number, _rows: ReadonlyMap<string, StepProgressRow>, _name: string): boolean {
  return false;
}
