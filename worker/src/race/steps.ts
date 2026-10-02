// Phase 7 track A (docs/plans/phase7.md D2–D8, D18, §5.2): the per-team state machine of SPEC §8.1, PURE (no SQLite, no
// sockets): a team's progress + one input (a trusted pose, an op) → the new progress + effects the engine then writes to
// SQLite BEFORE it answers anyone. Content-agnostic: it only walks leg.steps / stepZones(leg).
// Phase 8 track A (docs/plans/phase8.md D4–D8, D10, D13, D21, D22): challenges answered from anywhere (accept / answer,
// the Host's review), detour branches chosen / switched / opened at the chosen branch's box, R2 media gating. Card states
// come from the row + now (taskState): no timer, nothing in memory.
import { branchZone, type Leg, type MediaItem, type Step, type Task, type Zone } from '@race/shared/leg';
import { MEDIA, NET, type AnswerView, type BoxInfo, type CardStatus, type ClueCard, type HostReview, type MediaView, type ServerNotice, type TaskView } from '@race/shared/protocol';
import { parseAnswers, type AnswerRec, type StepProgressRow } from '../db.ts';
import { verifyAuto } from './tasks.ts';

/** What the machine needs about one team (teams.state + the current step's step_progress row). */
export interface Progress {
  /** Index of the current step in leg.steps (the Pit Stop stays current after the check-in). */
  step: number;
  /** First entry into the current step's zone (step_progress.arrived_at), null = not yet. */
  arrivedAt: number | null;
  /** Task started ("Nhận thử thách", the clue of a challenge without teaser; a detour: its branch box opened). */
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
  /** id of the step's last answer (0 = none): the next answer gets + 1. */
  lastAnswerId: number;
}

/** The team's trusted pose handed to an input judged from anywhere (bike rack rule, critic S3), null = none yet. */
export type StandAt = { x: number; z: number; riding: boolean } | null;

export type RaceInput =
  /** A trusted pose (geofence arrivals; the route to the Pit Stop + the check-in without penalty). */
  | { kind: 'pose'; x: number; z: number; riding: boolean }
  /** F on the current box (SPEC §8.2): on foot, inside the zone (+ NET.geofenceSlack); `branch` = the chosen detour
   *  branch's box (D6: its task is inside). */
  | { kind: 'open'; step: string; branch?: string; x: number; z: number; riding: boolean }
  // Phase 8 (D5 / D6 / D8 / D22), from anywhere: no zone, no foot rule, no trusted pose needed (critic N2).
  /** "Nhận thử thách" (a challenge with a teaser): task_started_at = now. */
  | { kind: 'accept'; step: string }
  /** A typed answer ('' = "Tôi đã gửi bài" of a photo task): host_approval → pending; auto → verifyAuto (right = done;
   *  `pose` = where the team stands: its bike is racked only there). */
  | { kind: 'answer'; step: string; text: string; pose: StandAt }
  /** Choose a detour branch (no lock), or switch to the other one (branchSwitchLockMinutes lock; refused while pending). */
  | { kind: 'branch'; step: string; branch: string }
  /** The Host approved step's answer: complete + settle like `open` (critic S3); `pose` = the team's trusted pose now: its
   *  bike goes to the rack only if it stands in the place on foot (S3 coverage). */
  | { kind: 'approve'; step: string; pose: StandAt }
  /** Standing on the Pit Stop mat after the penalty wait (SPEC §8.6); on a bike → boxRiding. */
  | { kind: 'checkin'; x: number; z: number; riding?: boolean };

export type RaceEffect =
  | { kind: 'arrive'; step: number }
  /** Step done; the team now holds the clue of step + 1 (received at the same `now`). */
  | { kind: 'complete'; step: number }
  | { kind: 'finish' }
  /** SPEC §6.4: the team's bike (if it holds one) goes to the rack of the point where the team STANDS — never the point
   *  ahead (docs/plans/phase7.md D18). Emitted:
   *   - with `complete` of step k when the clue now received (k + 1) is a task done at that point or a walk-only route,
   *     and the team stands on foot in the zone step k was completed in (a box opened: always; an approval / a right
   *     answer from anywhere: only then, Phase 8 S3) → that zone (NOT zones[k + 1]);
   *   - with `arrive` in a task zone somewhere else (challenge task.location, the chosen detour branch's location).
   *  `rack` = Zone.rack (keyed by point), `at` = Zone.parking (null = the bike stays where it stands). */
  | { kind: 'park'; rack: string; at: { x: number; z: number } | null }
  | { kind: 'refuse'; code: ServerNotice }
  // Phase 8 (D4–D6): RaceEngine.apply writes them (step_progress row + events in one transaction, then the messages).
  // `step` = index in leg.steps.
  | { kind: 'accept'; step: number }
  /** rec = the answer appended to step_progress.answers; verdict pending → submitted_at (the Host's queue); wrong →
   *  wrong_answers + 1; correct → a `complete` follows. */
  | { kind: 'answer'; step: number; rec: AnswerRec; verdict: 'pending' | 'correct' | 'wrong' }
  /** A Host decision (review()): the step's row as edited; approve → a `complete` follows (advance approve). */
  | { kind: 'review'; step: number; row: StepProgressRow; op: HostReview['op']; id: number | null }
  | { kind: 'branch'; step: number; branch: string }
  /** branch_switches + 1, branch_opened_at / task_started_at / arrived_at = null, locked_until = lockedUntil. */
  | { kind: 'switch'; step: number; from: string; to: string; lockedUntil: number }
  | { kind: 'openBranch'; step: number; branch: string }
  /** The switched-away branch's box: RaceIO.hideBox (socket attachments cleared, then {t:'box', op:'remove'}). */
  | { kind: 'hideBox'; step: number; branch: string };

const inside = (zn: Zone, x: number, z: number, slack: number) => Math.hypot(x - zn.x, z - zn.z) <= zn.r + slack;

/** The task of step s (a detour: branch `branch`'s), null = none. */
export const taskOf = (s: Step, branch: string | null): Task | null =>
  s.type === 'challenge' ? s.task : s.type === 'detour' ? (s.branches.find((b) => b.id === branch)?.task ?? null) : null;

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

type Facts = Pick<Progress, 'startedAt' | 'branch' | 'branchOpenedAt' | 'lockedUntil' | 'pendingId'>;

/** The card state of an unfinished step i (D5 / D6 tables) from the facts of its row. */
function stateOf(leg: Leg, i: number, f: Facts, now: number): CardStatus {
  const s = leg.steps[i]!;
  if (s.type !== 'challenge' && s.type !== 'detour') return 'active';
  const locked = (f.lockedUntil ?? 0) > now;
  if (s.type === 'detour' && f.branchOpenedAt == null) return f.branch == null ? 'choose' : locked ? 'switchLocked' : 'goToBranch';
  if (f.pendingId !== null) return 'pending';
  if (locked) return 'locked';
  return s.type === 'challenge' && s.teaser !== '' && f.startedAt == null ? 'teaser' : 'active';
}

/** The Progress fields of a step_progress row (the engine adds step / finishAt / penaltyMinutes from teams.state). */
export function rowFacts(row: StepProgressRow | undefined): Omit<Progress, 'step' | 'finishAt' | 'penaltyMinutes'> {
  const last = parseAnswers(row).at(-1);
  return {
    arrivedAt: row?.arrived_at ?? null, startedAt: row?.task_started_at ?? null, branch: row?.branch ?? null, branchOpenedAt: row?.branch_opened_at ?? null,
    lockedUntil: row?.locked_until ?? null, pendingId: last?.s === 'pending' ? last.id : null, lastAnswerId: last?.id ?? 0,
  };
}

/** One input → new progress + effects (in order). Refusals change nothing (no row written). `running` = race status:
 *  outside 'running' a pose still records the arrival (D9) but moves nothing on; ops are gated by the engine, except a
 *  Host approval (the Host works in every status but finished, D24): it completes, settle then waits for 'running'. */
export function advance(leg: Leg, zones: readonly Zone[], p0: Progress, input: RaceInput, now: number, running = true): { p: Progress; effects: RaceEffect[] } {
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
  /** Step i done at `at`; the bike goes to its rack only when the team is `standing` there (S3). */
  const complete = (i: number, at: Zone, standing: boolean) => {
    fx.push({ kind: 'complete', step: i });
    if (standing && parksOnReceive(leg, i)) fx.push({ kind: 'park', rack: at.rack, at: at.parking });
    p = { ...p, step: i + 1, arrivedAt: null, startedAt: null, branch: null, branchOpenedAt: null, lockedUntil: null, pendingId: null, lastAnswerId: 0 };
  };
  /** A trusted position: arrivals, then whatever completes by standing there (route → Pit Stop zone, check-in). */
  const settle = (x: number, z: number, riding: boolean) => {
    for (let guard = 0; guard < steps.length; guard++) {
      const i = p.step, s = steps[i]!;
      if (!arrive(x, z, 0) || !running) return;
      if (s.type === 'route_info' && steps[i + 1]?.type === 'pit_stop') {
        complete(i, zones[i]!, true);
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
  if (input.kind === 'open' && input.branch !== undefined) {
    // D6: the chosen branch's box (the other branch's: silent, never confirm where it is)
    if (s.type !== 'detour' || (i === p.step && input.branch !== p.branch)) return silent;
    if (i < p.step || p.branchOpenedAt !== null) return refuse('boxOpened');
    if ((p.lockedUntil ?? 0) > now) return silent; // switchLocked: the team has no box yet
    if (input.riding) return refuse('boxRiding');
    if (!inside(branchZone(leg, zones, i, p.branch!)!, input.x, input.z, slack)) return refuse('boxFar');
    arrive(input.x, input.z, slack);
    fx.push({ kind: 'openBranch', step: i, branch: p.branch! });
    p.branchOpenedAt = p.startedAt = now;
    return { p, effects: fx };
  }
  if (input.kind === 'open') {
    if (s.type !== 'route_info' || steps[i + 1]?.type === 'pit_stop') return silent; // no box there (the mat)
    if (i < p.step) return refuse('boxOpened');
    if (input.riding) return refuse('boxRiding');
    if (!inside(zones[i]!, input.x, input.z, slack)) return refuse('boxFar');
    arrive(input.x, input.z, slack);
    complete(i, zones[i]!, true);
    settle(input.x, input.z, input.riding); // the next step may be done right here (a task at the point)
    return { p, effects: fx };
  }
  if (i < p.step) return silent; // a done step: nothing more to do there
  /** Step i's task is done (an approval / a right auto answer, from anywhere): complete where it is done, the bike racked
   *  only when the team stands there on foot (S3), then the pose settles the next step (a task right there…). */
  const done = (pose: StandAt) => {
    const place = placesOf(leg, zones, i, p.branch)[0]?.zone;
    if (!place) return;
    complete(i, place, !!pose && !pose.riding && inside(place, pose.x, pose.z, slack));
    if (pose) settle(pose.x, pose.z, pose.riding);
  };
  if (input.kind === 'approve') {
    done(input.pose);
    return { p, effects: fx };
  }
  if (input.kind === 'accept') {
    if (s.type !== 'challenge' || s.teaser === '' || p.startedAt !== null) return silent;
    p.startedAt = now;
    return { p, effects: [{ kind: 'accept', step: i }] };
  }
  if (input.kind === 'branch') {
    if (s.type !== 'detour' || !s.branches.some((b) => b.id === input.branch) || p.branch === input.branch) return silent;
    if (p.branch === null) {
      p.branch = input.branch;
      return { p, effects: [{ kind: 'branch', step: i, branch: input.branch }] };
    }
    // §17.16: only a pending answer blocks a switch (a "Phạt" countdown does not: the switch lock replaces it, critic M1)
    if (p.pendingId !== null) return refuse('branchPending');
    const from = p.branch;
    const lockedUntil = now + leg.penalties.branchSwitchLockMinutes * 60_000;
    p = { ...p, branch: input.branch, branchOpenedAt: null, startedAt: null, arrivedAt: null, lockedUntil };
    return { p, effects: [{ kind: 'switch', step: i, from, to: input.branch, lockedUntil }, { kind: 'hideBox', step: i, branch: from }] };
  }
  // answer
  const state = stateOf(leg, i, p, now);
  if (state === 'teaser') return refuse('taskNotStarted');
  if (state === 'pending') return refuse('answerPending');
  if (state === 'locked') return refuse('answerLocked');
  const t = taskOf(s, p.branch);
  if (state !== 'active' || !t) return silent; // a detour before its branch box is opened: no input on the card
  if (t.kind !== 'free' && input.text.trim() === '') return silent; // the client never sends an empty typed answer
  const rec: AnswerRec = { id: p.lastAnswerId + 1, b: s.type === 'detour' ? p.branch : null, text: input.text, at: now, s: 'pending' };
  p.lastAnswerId = rec.id;
  if (t.verification === 'host_approval') {
    p.pendingId = rec.id;
    return { p, effects: [{ kind: 'answer', step: i, rec, verdict: 'pending' }] };
  }
  const verdict = verifyAuto(t, input.text);
  fx.push({ kind: 'answer', step: i, rec: { ...rec, s: verdict }, verdict });
  if (verdict === 'correct') done(input.pose);
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
  return row?.completed_at != null ? 'done' : stateOf(leg, i, rowFacts(row), now);
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

const HANDLED = 'Bài này đã được xử lý.';
const NOTHING = 'Đội chưa gửi câu trả lời.';

/** Phase 8 (D5, D10, critic N4 / N11): a Host decision on step i of a team (its row, the engine checked i ≤ its step).
 *  Only checks + edits the row: approve (the pending answer `id`, or the newest "Phạt" one when the Host clicked wrong;
 *  no `id` = a photo task the Host already has, while active / locked) → `approve: true` and the engine runs
 *  advance({kind:'approve'}) (complete + settle, S3); penalize → locked_until = now + retryLockMinutes (0 = none); note
 *  → host_note ('' clears it). A note sent with a decision goes on the answer (n) AND becomes host_note. A decision
 *  waits approval_wait_seconds (sent → decided, SPEC §8.9). A second decision on the same answer is refused: nothing
 *  written (two Hosts, a double click). */
export function review(leg: Leg, i: number, row: StepProgressRow, m: HostReview, now: number): { row: StepProgressRow; approve: boolean; id: number | null } | { refuse: string } {
  const s = leg.steps[i]!;
  if (m.op === 'note') return { row: { ...row, host_note: m.note ?? '' }, approve: false, id: null };
  if (s.type !== 'challenge' && s.type !== 'detour') return { refuse: 'Bước này không có thử thách để duyệt.' };
  if (row.completed_at != null) return { refuse: HANDLED };
  const t = taskOf(s, row.branch);
  if (!t) return { refuse: NOTHING };
  const answers = parseAnswers(row);
  const last = answers.at(-1);
  const state = taskState(leg, i, row, now);
  const b = s.type === 'detour' ? row.branch : null;
  const n = m.note ? { n: m.note } : {};
  const decided = { decided_at: now, decided_by: 'host', ...(m.note ? { host_note: m.note } : {}) };
  const id = m.id ?? (last?.s === 'pending' ? last.id : undefined);
  if (id === undefined) {
    // approve without id (critic M2): a photo task the Host got on Messenger before the team pressed "Tôi đã gửi bài"
    if (m.op !== 'approve' || t.kind !== 'free' || (state !== 'active' && state !== 'locked')) return { refuse: NOTHING };
    const rec: AnswerRec = { id: (last?.id ?? 0) + 1, b, text: '', at: now, s: 'approved', d: now, ...n };
    return { row: { ...row, ...decided, answers: JSON.stringify([...answers, rec]), locked_until: null }, approve: true, id: rec.id };
  }
  const a = answers.find((x) => x.id === id);
  if (!a) return { refuse: NOTHING };
  // N4: "Duyệt" on the answer just penalized (the Host clicked "Phạt" by mistake) while nothing newer was sent
  const fix = m.op === 'approve' && a.s === 'penalized' && a === last && a.b === b && (state === 'locked' || state === 'active');
  if (a.s !== 'pending' && !fix) return { refuse: HANDLED };
  const rec: AnswerRec = { ...a, s: m.op === 'approve' ? 'approved' : 'penalized', d: now, ...n };
  const next = {
    ...row, ...decided, answers: JSON.stringify(answers.map((x) => (x === a ? rec : x))),
    approval_wait_seconds: row.approval_wait_seconds + (a.s === 'pending' ? Math.max(0, now - a.at) / 1000 : 0),
  };
  if (m.op === 'approve') return { row: { ...next, locked_until: null }, approve: true, id };
  const lock = retryLockMinutes(leg, t);
  return { row: { ...next, rejections: row.rejections + 1, locked_until: lock > 0 ? now + lock * 60_000 : null }, approve: false, id };
}

/** Phase 8 (D13): may a team on step `step` (its rows by step id) load the R2 image `name`? Only media of what it has
 *  opened: route / detour clues ≤ its step, a challenge's task once started (past the teaser), the chosen branch's task
 *  once its box is opened (a done detour: the branch it did) — what cardOf shows. The Host always may (index.ts). */
export function mediaAllowed(leg: Leg, step: number, rows: ReadonlyMap<string, StepProgressRow>, name: string): boolean {
  const has = (m: readonly MediaItem[]) => m.some((x) => x.url === MEDIA.prefix + name);
  return leg.steps.slice(0, step + 1).some((s) => {
    const row = rows.get(s.id);
    if (s.type === 'route_info' || s.type === 'detour') if (has(s.media)) return true;
    if (s.type === 'challenge') return has(s.task.media) && (s.teaser === '' || row?.task_started_at != null || row?.completed_at != null);
    if (s.type !== 'detour' || (row?.branch_opened_at == null && row?.completed_at == null)) return false;
    return has(taskOf(s, row?.branch ?? null)?.media ?? []);
  });
}
