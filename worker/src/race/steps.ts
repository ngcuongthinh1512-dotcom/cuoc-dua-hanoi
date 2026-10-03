// Phase 7 track A (docs/plans/phase7.md D2–D8, D18, §5.2): the per-team state machine of SPEC §8.1, PURE (no SQLite, no
// sockets): a team's progress + one input (a trusted pose, an op) → the new progress + effects the engine then writes to
// SQLite BEFORE it answers anyone. Content-agnostic: it only walks leg.steps / stepZones(leg).
// Phase 8 track A (docs/plans/phase8.md D4–D8, D10, D13, D21, D22): challenges answered from anywhere (accept / answer,
// the Host's review), detour branches chosen / switched / opened at the chosen branch's box, R2 media gating. Card states
// come from the row + now (taskState): no timer, nothing in memory.
// Phase 8B foundation (docs/plans/phase8b.md §E): the louvre contract — inputs pick / lock, effects pick / lock, guard C1,
// louvreView (what a team sees of the room, x/5 live), creditsOf. Track A implements the pick / lock transitions.
import { branchZone, LOUVRE, stepZones, type Leg, type LouvreTask, type MediaItem, type Step, type Task, type Zone } from '@race/shared/leg';
import { MEDIA, NET, type AnswerView, type BoxInfo, type CardStatus, type ClueCard, type CreditItem, type HostReview, type LouvreView, type MediaView, type ServerNotice, type TaskView } from '@race/shared/protocol';
import { parseAnswers, parsePicks, type AnswerRec, type StepProgressRow } from '../db.ts';
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
  /** Phase 8B: a louvre step's lit artwork ids (the engine's row cache: live picks), [] elsewhere. */
  picks: string[];
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
  | { kind: 'checkin'; x: number; z: number; riding?: boolean }
  // Phase 8B (docs/plans/phase8b.md §E)
  /** A button under an artwork, from anywhere (active or locked; teaser → taskNotStarted; unknown art / same state → silent;
   *  on with ≥ LOUVRE.maxPicks lit and now ≥ hintAt[0] → pickLimit). */
  | { kind: 'pick'; step: string; art: string; on: boolean }
  /** The lock button: `pose` must stand in zones[i] + slack (else boxFar; null = none yet → boxFar); locked → answerLocked;
   *  no pick → silent (the client blocks it); right = exactly the 5 answers (picks.length === 5) → done(pose); wrong →
   *  rejections + 1, locked_until. */
  | { kind: 'lock'; step: string; pose: StandAt };

export type RaceEffect =
  | { kind: 'arrive'; step: number }
  /** Step done; the team now holds the clue of step + 1 (received at the same `now`). */
  | { kind: 'complete'; step: number }
  | { kind: 'finish' }
  /** SPEC §6.4 + §17.32: a task starts → the team is forced off its bike (if it holds one); the bike stays NEXT TO THE
   *  TEAM (its trusted pose, never a rack spot), free for anyone. Emitted:
   *   - with `complete` of step k when the clue now received (k + 1) is a task done at that point or a walk-only route —
   *     wherever the team is (riding past, approved remotely: it gets off there);
   *   - with `accept` of a teaser challenge done at the point, with `openBranch` of a branch done at the point;
   *   - with `arrive` in a task zone somewhere else (challenge task.location, the chosen detour branch's location).
   *  `rack` = Zone.rack of the step's point (keyed by point): groups the bikes left for that task (bikeParking.maxBikes). */
  | { kind: 'park'; rack: string }
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
  | { kind: 'hideBox'; step: number; branch: string }
  // Phase 8B (RaceEngine.apply)
  /** Memory only (the engine's row cache .picks + the snapshot row within NET.snapshotMs): 0 rows. */
  | { kind: 'pick'; step: number; picks: string[] }
  /** A lock: rec (text "k tác phẩm", s wrong / correct, c = right ones) appended to answers; picks written; wrong →
   *  rejections + 1, locked_until = lockedUntil; event louvre.lock {ok, k, c, public, slot}; `public` = at ≥ hintAt[0]
   *  (SPEC §17.35: the feed line carries n only then: the ≤ 5 rule is on, n/5 means something); `minutes` = the
   *  countdown of a wrong lock (feed); ok → a `complete` follows. */
  | { kind: 'lock'; step: number; rec: AnswerRec; ok: boolean; correct: number; public: boolean; lockedUntil: number | null; minutes: number; picks: string[] };

export const inside = (zn: Zone, x: number, z: number, slack: number) => Math.hypot(x - zn.x, z - zn.z) <= zn.r + slack;

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
    lockedUntil: row?.locked_until ?? null, pendingId: last?.s === 'pending' ? last.id : null, lastAnswerId: last?.id ?? 0, picks: parsePicks(row),
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
    if (hit.own) fx.push({ kind: 'park', rack: hit.zone.rack });
    return true;
  };
  /** Step i done at `at`; a task-here / walk-only clue received → off the bike wherever the team is (§17.32). */
  const complete = (i: number, at: Zone) => {
    fx.push({ kind: 'complete', step: i });
    if (parksOnReceive(leg, i)) fx.push({ kind: 'park', rack: at.rack });
    p = { ...p, step: i + 1, arrivedAt: null, startedAt: null, branch: null, branchOpenedAt: null, lockedUntil: null, pendingId: null, lastAnswerId: 0, picks: [] };
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
  if (input.kind === 'open' && input.branch !== undefined) {
    // D6: the chosen branch's box (the other branch's: silent, never confirm where it is)
    if (s.type !== 'detour' || (i === p.step && input.branch !== p.branch)) return silent;
    if (i < p.step || p.branchOpenedAt !== null) return refuse('boxOpened');
    if ((p.lockedUntil ?? 0) > now) return silent; // switchLocked: the team has no box yet
    if (input.riding) return refuse('boxRiding');
    if (!inside(branchZone(leg, zones, i, p.branch!)!, input.x, input.z, slack)) return refuse('boxFar');
    arrive(input.x, input.z, slack);
    fx.push({ kind: 'openBranch', step: i, branch: p.branch! });
    if (!taskOf(s, p.branch)!.location) fx.push({ kind: 'park', rack: branchZone(leg, zones, i, p.branch!)!.rack }); // the task starts here
    p.branchOpenedAt = p.startedAt = now;
    return { p, effects: fx };
  }
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
  if (i < p.step) return silent; // a done step: nothing more to do there
  /** Step i's task is done (an approval / a right auto answer, from anywhere): complete where it is done, then the pose
   *  settles the next step (a task right there…). */
  const done = (pose: StandAt) => {
    const place = placesOf(leg, zones, i, p.branch)[0]?.zone;
    if (!place) return;
    complete(i, place);
    if (pose) settle(pose.x, pose.z, pose.riding);
  };
  if (input.kind === 'approve') {
    done(input.pose);
    return { p, effects: fx };
  }
  if (input.kind === 'accept') {
    if (s.type !== 'challenge' || s.teaser === '' || p.startedAt !== null) return silent;
    p.startedAt = now;
    fx.push({ kind: 'accept', step: i });
    if (!s.task.location) fx.push({ kind: 'park', rack: zones[i]!.rack }); // the task starts here, wherever the team is
    return { p, effects: fx };
  }
  if (input.kind === 'branch') {
    if (s.type !== 'detour' || !s.branches.some((b) => b.id === input.branch) || p.branch === input.branch) return silent;
    if (p.branch === null) {
      p.branch = input.branch;
      return { p, effects: [{ kind: 'branch', step: i, branch: input.branch }] };
    }
    // §17.16: a pending answer blocks a switch (a "Phạt" countdown does not: the switch lock replaces it, critic M1)
    if (p.pendingId !== null) return refuse('branchPending');
    // a switch countdown (no branch box opened yet): the card has no "Đổi" button, nothing to say (review R-4: 3 rows each)
    if (p.branchOpenedAt === null && (p.lockedUntil ?? 0) > now) return silent;
    const from = p.branch;
    const lockedUntil = now + leg.penalties.branchSwitchLockMinutes * 60_000;
    p = { ...p, branch: input.branch, branchOpenedAt: null, startedAt: null, arrivedAt: null, lockedUntil };
    return { p, effects: [{ kind: 'switch', step: i, from, to: input.branch, lockedUntil }, { kind: 'hideBox', step: i, branch: from }] };
  }
  if (input.kind === 'pick' || input.kind === 'lock') {
    // Phase 8B (docs/plans/phase8b.md §E, SPEC §17.19): the louvre room. Picks while active or locked (a wrong lock's
    // countdown: still pick / unpick), from anywhere (only a state); the lock inside the room (= the step's zone).
    const t = s.type === 'challenge' ? s.task : null;
    if (t?.kind !== 'louvre' || !t.louvre) return silent;
    const state = stateOf(leg, i, p, now);
    if (state === 'teaser') return refuse('taskNotStarted');
    const [h40] = marks(t.louvre, p.startedAt ?? now);
    if (input.kind === 'pick') {
      const on = p.picks.includes(input.art);
      if (on === input.on || !t.louvre.artworks.some((a) => a.id === input.art)) return silent;
      // §17.19 (c): from the 40-minute mark at most LOUVRE.maxPicks lit at once (switching off always works; more lit
      // before the mark stay until the team unpicks them)
      if (input.on && p.picks.length >= LOUVRE.maxPicks && now >= h40) return refuse('pickLimit');
      p.picks = input.on ? [...p.picks, input.art] : p.picks.filter((x) => x !== input.art);
      return { p, effects: [{ kind: 'pick', step: i, picks: p.picks }] };
    }
    if (state === 'locked') return refuse('answerLocked');
    if (!input.pose || !inside(zones[i]!, input.pose.x, input.pose.z, slack)) return refuse('boxFar');
    if (!p.picks.length) return silent; // the client never locks nothing (no row, no penalty)
    const correct = p.picks.filter((x) => t.answers.includes(x)).length;
    const ok = correct === t.answers.length && p.picks.length === t.answers.length;
    const minutes = ok ? 0 : retryLockMinutes(leg, t);
    const lockedUntil = minutes > 0 ? now + minutes * 60_000 : null;
    const rec: AnswerRec = { id: p.lastAnswerId + 1, b: null, text: `${p.picks.length} tác phẩm`, at: now, s: ok ? 'correct' : 'wrong', c: correct };
    fx.push({ kind: 'lock', step: i, rec, ok, correct, public: now >= h40, lockedUntil, minutes, picks: p.picks });
    p.lastAnswerId = rec.id;
    if (ok) done(input.pose);
    else p.lockedUntil = lockedUntil;
    return { p, effects: fx };
  }
  // answer. Phase 8B guard C1: a louvre room is solved by picks + a lock only (an `answer` with one right id would pass
  // verifyAuto: silent, nothing written)
  if (taskOf(s, p.branch)?.kind === 'louvre') return silent;
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
const taskView = (t: Task): TaskView => ({
  title: t.title, description: t.description, media: t.media.map(mediaView), kind: t.kind, verification: t.verification,
  input: t.kind === 'free' ? 'proof' : t.kind === 'louvre' ? 'room' : 'text', proofInstruction: t.proofInstruction,
  timeLimitMinutes: t.timeLimitMinutes, ...(t.location ? { place: t.location.name } : {}),
});

/** Minutes of the Host's "Phạt" on this task. */
export const retryLockMinutes = (leg: Leg, t: Task) => t.retryLockMinutes ?? leg.penalties.retryLockMinutes;

/** The team's own answers on its card: this branch only (null = a challenge), newest NET.answerHistory, never a note.
 *  Phase 8B: a louvre lock's right count (`c`) only for a lock at or after `correctFrom` (hintAt[1]). */
const answerViews = (row: StepProgressRow | undefined, branch: string | null, correctFrom = Infinity, of?: number): AnswerView[] =>
  parseAnswers(row).filter((a) => a.b === branch).slice(-NET.answerHistory).map((a) => ({
    id: a.id, text: a.text, at: a.at, status: a.s, ...(a.c !== undefined && a.at >= correctFrom ? { correct: a.c } : {}), ...(scoreOf(a, of) ?? {}),
  }));

/** SPEC §17.31: the "đúng x/n" of a Phạt the team may see (review() set `sv`), undefined = none. */
export const scoreOf = (a: AnswerRec, of: number | undefined): { score: number; of: number } | undefined => (a.sv && a.sc !== undefined && of ? { score: a.sc, of } : undefined);
/** SPEC §17.31: server ms from which a Phạt on this task tells the team its count (null = the task has no scoreOf). */
export const scoreFrom = (t: Task, row: StepProgressRow | undefined): number | null => (t.scoreOf && row?.task_started_at != null ? row.task_started_at + t.scoreFromMinutes * 60_000 : null);

/** Server ms of the 40 / 60-minute marks of a louvre room started at t0. */
const marks = (lv: LouvreTask, t0: number): [number, number] => [t0 + lv.hints.countAtMinutes * 60_000, t0 + lv.hints.correctAtMinutes * 60_000];

/** Phase 8B: server ms of the two hints of a louvre step (task_started_at = the previous route's box opened: a louvre
 *  challenge has no teaser), null = not a louvre step. */
export function hintAt(leg: Leg, i: number, row: StepProgressRow | undefined, now: number): [number, number] | null {
  const s = leg.steps[i];
  const lv = s?.type === 'challenge' && s.task.kind === 'louvre' ? s.task.louvre : undefined;
  return lv ? marks(lv, row?.task_started_at ?? row?.clue_opened_at ?? now) : null;
}

/** Phase 8B (docs/plans/phase8b.md §C, §E): the room as THIS team sees it — artworks without note / credit, the step's zone
 *  (the box just opened), its own picks (row.picks: the engine keeps live picks in its row cache) and wrong locks, the
 *  hints from their marks on (x/5 = |picks ∩ answers| computed now, never stored), never the answers. undefined = not a
 *  louvre step. */
export function louvreView(leg: Leg, i: number, row: StepProgressRow | undefined, zone: Zone, now: number): LouvreView | undefined {
  const s = leg.steps[i];
  const at = hintAt(leg, i, row, now);
  if (s?.type !== 'challenge' || !s.task.louvre || !at) return undefined;
  const picks = parsePicks(row);
  return {
    artworks: s.task.louvre.artworks.map((a) => ({ id: a.id, type: a.type, image: a.image })),
    room: { x: cm(zone.x), z: cm(zone.z), r: zone.r, yaw: Math.round(zone.yaw * 1000) / 1000 },
    picks, attempts: row?.rejections ?? 0, hintAt: at,
    hintCount: now >= at[0] ? s.task.answers.length : null,
    hintCorrect: now >= at[1] ? picks.filter((id) => s.task.answers.includes(id)).length : null,
    maxPicks: now >= at[0] ? LOUVRE.maxPicks : null,
  };
}

/** Phase 8B (§17.20): the "Ghi nguồn" lines of every louvre room picture of the leg, leg order; artworks without a picture
 *  or without credit left out; never a note, an id or the answers. Sent only after the team's finish / the race's end. */
export const creditsOf = (leg: Leg): CreditItem[] =>
  leg.steps.flatMap((s) => (s.type === 'challenge' && s.task.kind === 'louvre' ? (s.task.louvre?.artworks ?? []) : []))
    .flatMap((a) => (a.image && a.credit ? [{ file: a.image, title: a.credit.title, artist: a.credit.artist, photo: a.credit.photo, license: a.credit.license, source: a.credit.source }] : []));

/** The card of step `index` as the team sees it (never answers / reference answers / Host notes / a destination name / a
 *  later step / an unopened branch's task), from its progress row (`clue_opened_at` = received; the engine fills step
 *  1's from the start time) + now (card state, docs/plans/phase8.md D3). The ONLY card builder. Phase 8B: `zones` =
 *  stepZones(leg) (the engine's; computed here when absent) for a louvre step's room. */
export function cardOf(leg: Leg, index: number, row: StepProgressRow | undefined, now: number, zones?: readonly Zone[]): ClueCard {
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
        branches: s.branches.map((x) => ({ id: x.id, name: x.name, summary: x.summary, ...(opened && x === b ? { task: taskView(x.task) } : {}) })),
        branch, branchOpened: opened, switches: row?.branch_switches ?? 0, switchPenaltyMinutes: leg.penalties.branchSwitchLockMinutes,
        ...(b ? { retryPenaltyMinutes: retryLockMinutes(leg, b.task), answers: answerViews(row, branch, Infinity, b.task.scoreOf) } : {}),
      };
    }
    case 'challenge': {
      const lv = s.task.kind === 'louvre' ? louvreView(leg, index, row, (zones ?? stepZones(leg))[index]!, now) : undefined;
      return {
        ...base, text: s.teaser, retryPenaltyMinutes: retryLockMinutes(leg, s.task), answers: answerViews(row, null, lv?.hintAt[1], s.task.scoreOf),
        ...(status === 'teaser' ? {} : { task: { ...taskView(s.task), ...(lv ? { louvre: lv } : {}) } }),
      };
    }
    case 'pit_stop':
      return { ...base, text: '' };
  }
}

const HANDLED = 'Bài này đã được xử lý.';
const NOTHING = 'Đội chưa gửi câu trả lời.';

/** Phase 8 (D5, D10, critic N4 / N11): a Host decision on step i of a team (its row, the engine checked i ≤ its step).
 *  Only checks + edits the row: approve (the pending answer `id`, or the newest "Phạt" one when the Host clicked wrong;
 *  no `id` = the pending one, else "Cho qua", while teaser / active / locked) → `approve: true` and the engine runs
 *  advance({kind:'approve'}) (complete + settle, S3); penalize → locked_until = now + retryLockMinutes (0 = none); note
 *  → host_note ('' clears it). A note sent with a decision goes on the answer (n) AND becomes host_note. A decision
 *  waits approval_wait_seconds (sent → decided, SPEC §8.9). A second decision on the same answer is refused: nothing
 *  written (a double click, a Host page a second old). */
export function review(leg: Leg, i: number, row: StepProgressRow, m: HostReview, now: number): { row: StepProgressRow; approve: boolean; id: number | null } | { refuse: string } {
  const s = leg.steps[i]!;
  if (m.op === 'note') return { row: { ...row, host_note: m.note ?? '' }, approve: false, id: null };
  if (m.op === 'undo') return { refuse: 'Hoàn tác không đi qua review().' }; // Phase 10: the engine handles undo before calling here
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
    // approve without id, nothing pending (critic M2: a photo task the Host got on Messenger before "Tôi đã gửi bài";
    // Phase 8B: a team stuck in the louvre room; Phase 10 V5 "Cho qua": any task, SPEC §13.9 "push a team on past a bug")
    // review fix: also from the teaser (a team stuck before "Nhận thử thách"); its task starts now, so its times stay true
    if (m.op !== 'approve' || (state !== 'active' && state !== 'locked' && state !== 'teaser')) return { refuse: NOTHING };
    const rec: AnswerRec = { id: (last?.id ?? 0) + 1, b, text: '', at: now, s: 'approved', d: now, ...n };
    return { row: { ...row, ...decided, task_started_at: row.task_started_at ?? now, answers: JSON.stringify([...answers, rec]), locked_until: null }, approve: true, id: rec.id };
  }
  const a = answers.find((x) => x.id === id);
  if (!a) return { refuse: NOTHING };
  // N4: "Duyệt" on the answer just penalized (the Host clicked "Phạt" by mistake) while nothing newer was sent
  const fix = m.op === 'approve' && a.s === 'penalized' && a === last && a.b === b && (state === 'locked' || state === 'active');
  if (a.s !== 'pending' && !fix) return { refuse: HANDLED };
  // SPEC §17.31: the Host's "đúng x/n" goes with a Phạt (out of range = not entered); told to the team only from scoreFromMinutes on
  const { sc: _sc, sv: _sv, ...bare } = a; // a Duyệt over a Phạt (N4) drops the count
  const from = scoreFrom(t, row);
  const score = m.op === 'penalize' && t.scoreOf && m.score !== undefined && m.score <= t.scoreOf ? { sc: m.score, ...(from !== null && now >= from ? { sv: true as const } : {}) } : {};
  const rec: AnswerRec = { ...bare, s: m.op === 'approve' ? 'approved' : 'penalized', d: now, ...n, ...score };
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
