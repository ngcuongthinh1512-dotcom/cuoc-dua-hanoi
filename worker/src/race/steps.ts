// Phase 7 track A (docs/plans/phase7.md D2–D8, D18, §5.2): the per-team state machine of SPEC §8.1, PURE (no SQLite, no
// sockets): a team's progress + one input (a trusted pose, an op) → the new progress + effects the engine then writes to
// SQLite BEFORE it answers anyone. Content-agnostic: it only walks leg.steps / stepZones(leg).
// Phase 8 track A (docs/plans/phase8.md D4–D8, D10, D13, D21, D22): challenges answered from anywhere (accept / answer,
// the Host's review), detour branches chosen / switched / opened at the chosen branch's box, R2 media gating. Card states
// come from the row + now (taskState): no timer, nothing in memory.
import { onPitMat } from '@race/shared';
import { branchZone, type Leg, type MediaItem, type Step, type Task, type Zone } from '@race/shared/leg';
import { MEDIA, NET, type AnswerView, type BoxInfo, type CardStatus, type ClueCard, type HostReview, type MediaView, type ServerNotice, type TaskView } from '@race/shared/protocol';
import { parseAnswers, type AnswerRec, type StepProgressRow } from '../db.ts';
import { gradeParts, PARTS_SEP, partsOf, verifyAuto } from './tasks.ts';

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
  /** Leg 3: the current detour step's room progress (TeamRace.rooms), null / absent = none reported. */
  room?: RoomRec | null;
}

/** Leg 3: a team's progress in a detour branch's room (teams.state `rooms[stepId]`; dropped by a branch switch). */
export interface RoomRec {
  /** The branch it was reported for. */
  b: string;
  done: number;
  skipped: boolean;
}

/** Leg 3: the room's name in the Host's queue item "Hoàn thành phòng sô-cô-la: 5/5". */
export const ROOM_NAME = { chocolate: 'sô-cô-la', comic: 'truyện tranh' } as const;

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
  | { kind: 'answer'; step: string; text: string; pose: StandAt; /** SPEC §17.44: a multi-box task's N strings (text ''). */ parts?: string[] }
  /** Choose a detour branch (no lock), or switch to the other one (branchSwitchLockMinutes lock; refused while pending). */
  | { kind: 'branch'; step: string; branch: string }
  /** Leg 3 (`race room`, from anywhere): progress in the chosen + opened branch's room; done = total → a pending answer for the
   *  Host; skipped → the step completes, (total − done) × penaltyMinutesEach at the finish line. `pose` as for `answer`. */
  | { kind: 'room'; step: string; branch: string; done: number; skipped: boolean; pose: StandAt }
  /** Leg 3 CETIQLO (server-internal, never from a socket): the team won its head-to-head match → the challenge step with `room: 'cetiqlo'`
   *  completes like an approved answer. `pose` as for `answer`. */
  | { kind: 'cqWin'; step: string; pose: StandAt }
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
  | { kind: 'answer'; step: number; rec: AnswerRec; verdict: 'pending' | 'correct' | 'wrong' | 'penalized'; /** Leg 3: an auto-graded Phạt's countdown end. */ lockedUntil?: number | null }
  /** A Host decision (review()): the step's row as edited; approve → a `complete` follows (advance approve). */
  | { kind: 'review'; step: number; row: StepProgressRow; op: HostReview['op']; id: number | null }
  | { kind: 'branch'; step: number; branch: string }
  /** branch_switches + 1, branch_opened_at / task_started_at / arrived_at = null, locked_until = lockedUntil. */
  | { kind: 'switch'; step: number; from: string; to: string; lockedUntil: number }
  | { kind: 'openBranch'; step: number; branch: string }
  /** The switched-away branch's box: RaceIO.hideBox (socket attachments cleared, then {t:'box', op:'remove'}). */
  | { kind: 'hideBox'; step: number; branch: string }
  /** Leg 3: TeamRace.rooms[step] = rec; `penalty` = finish-line minutes of a skip (the engine keeps a Host-set one). */
  | { kind: 'room'; step: number; rec: RoomRec; penalty?: number };

/** (x, z) is in zone `zn` (+ slack m): within r — the Pit Stop's: ON the mat (SPEC §17.38, PIT_MAT's own slack). */
export const inside = (zn: Zone, x: number, z: number, slack: number) => (zn.mat ? onPitMat(x, z, zn) : Math.hypot(x - zn.x, z - zn.z) <= zn.r + slack);

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
    if (hit.own) fx.push({ kind: 'park', rack: hit.zone.rack });
    return true;
  };
  /** Step i done at `at`; a task-here / walk-only clue received → off the bike wherever the team is (§17.32). */
  const complete = (i: number, at: Zone) => {
    fx.push({ kind: 'complete', step: i });
    if (parksOnReceive(leg, i)) fx.push({ kind: 'park', rack: at.rack });
    p = { ...p, step: i + 1, arrivedAt: null, startedAt: null, branch: null, branchOpenedAt: null, lockedUntil: null, pendingId: null, lastAnswerId: 0, room: null };
  };
  /** A trusted position: arrivals, then whatever completes by standing there (route → onto the Pit Stop mat, check-in). */
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
  if (input.kind === 'room') return roomReport(leg, zones, p, i, input, now, running);
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
  if (input.kind === 'cqWin') {
    if (s.type !== 'challenge' || s.room !== 'cetiqlo' || i !== p.step) return silent;
    const a: AnswerRec = { id: p.lastAnswerId + 1, b: null, text: 'Thắng trận đối kháng CETIQLO', at: now, s: 'correct' };
    p.lastAnswerId = a.id;
    fx.push({ kind: 'answer', step: i, rec: a, verdict: 'correct' });
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
    p = { ...p, branch: input.branch, branchOpenedAt: null, startedAt: null, arrivedAt: null, lockedUntil, room: null }; // the old branch's room progress is lost too
    return { p, effects: [{ kind: 'switch', step: i, from, to: input.branch, lockedUntil }, { kind: 'hideBox', step: i, branch: from }] };
  }
  // answer (a CETIQLO step is won in the room, never typed)
  if (s.type === 'challenge' && s.room === 'cetiqlo') return silent;
  const state = stateOf(leg, i, p, now);
  if (state === 'teaser') return refuse('taskNotStarted');
  if (state === 'pending') return refuse('answerPending');
  if (state === 'locked') return refuse('answerLocked');
  const t = taskOf(s, p.branch);
  if (state !== 'active' || !t) return silent; // a detour before its branch box is opened: no input on the card
  // SPEC §17.44: a multi-box task's N filled boxes become ONE answer "a | b | c | d" (the Host's queue lists them); anything
  // else on such a task is silent (the client never sends it)
  const texts = t.parts ? input.parts?.map((x) => x.trim()) : undefined;
  if (t.parts && (!texts || texts.length !== t.parts.length || texts.some((x) => x === ''))) return silent;
  const text = texts ? texts.join(PARTS_SEP) : input.text;
  if (t.kind !== 'free' && text.trim() === '') return silent; // the client never sends an empty typed answer
  const rec: AnswerRec = { id: p.lastAnswerId + 1, b: s.type === 'detour' ? p.branch : null, text, at: now, s: 'pending' };
  p.lastAnswerId = rec.id;
  // Leg 3: every box has answers → graded here, applied at once (the Host only looks afterwards: ReviewItem.auto)
  // a picked seat is one box graded the same way (wrong = Phạt: retryLockMinutes)
  const marks = texts ? gradeParts(t, texts) : t.pick ? [verifyAuto(t, input.text) === 'correct'] : null;
  if (marks) {
    const sc = marks.filter(Boolean).length;
    // told to the team from scoreFromMinutes into the task on (a picked seat: always); before it only "chưa đúng" + the Phạt
    const from = p.startedAt != null ? p.startedAt + t.scoreFromMinutes * 60_000 : null;
    const visible = t.pick || (from === null ? t.scoreFromMinutes === 0 : now >= from);
    const a: AnswerRec = { ...rec, s: sc === marks.length ? 'correct' : 'penalized', sc, ...(visible ? { sv: true as const } : {}), auto: true, m: marks };
    if (a.s === 'correct') {
      fx.push({ kind: 'answer', step: i, rec: a, verdict: 'correct' });
      done(input.pose);
      return { p, effects: fx };
    }
    const lock = retryLockMinutes(leg, t);
    p.lockedUntil = lock > 0 ? now + lock * 60_000 : null;
    return { p, effects: [{ kind: 'answer', step: i, rec: a, verdict: 'penalized', lockedUntil: p.lockedUntil }] };
  }
  if (t.verification === 'host_approval') {
    p.pendingId = rec.id;
    return { p, effects: [{ kind: 'answer', step: i, rec, verdict: 'pending' }] };
  }
  const verdict = verifyAuto(t, input.text);
  fx.push({ kind: 'answer', step: i, rec: { ...rec, s: verdict }, verdict });
  if (verdict === 'correct') done(input.pose);
  return { p, effects: fx };
}

/** Leg 3: a `race room` report (advance's room input). Only the current step, a detour, the CHOSEN branch, its box opened, a
 *  task with `room`; done never goes down, nothing after a skip (else roomIgnored, nothing written). A switch dropped the old
 *  branch's record (engine), so a report for an abandoned branch is refused as "not the chosen one". */
function roomReport(leg: Leg, zones: readonly Zone[], p0: Progress, i: number, input: Extract<RaceInput, { kind: 'room' }>, now: number, running: boolean): { p: Progress; effects: RaceEffect[] } {
  const s = leg.steps[i]!;
  const refuse = { p: p0, effects: [{ kind: 'refuse', code: 'roomIgnored' }] as RaceEffect[] };
  const room = i === p0.step && s.type === 'detour' && input.branch === p0.branch && p0.branchOpenedAt !== null ? taskOf(s, p0.branch)?.room : undefined;
  const cur = p0.room?.b === input.branch ? p0.room : null;
  if (!room || input.done > room.total || cur?.skipped || input.done < (cur?.done ?? 0)) return refuse;
  let p: Progress = { ...p0 };
  const fx: RaceEffect[] = [];
  const rec: RoomRec = { b: input.branch, done: input.done, skipped: input.skipped };
  if (input.skipped) {
    // "Bỏ qua": the clue comes now (like an approved branch task), the rest becomes finish-line minutes
    fx.push({ kind: 'room', step: i, rec, penalty: (room.total - input.done) * room.penaltyMinutesEach });
    const r = advance(leg, zones, { ...p, room: rec }, { kind: 'approve', step: s.id, pose: input.pose }, now, running);
    return { p: r.p, effects: [...fx, ...r.effects] };
  }
  if (input.done !== (cur?.done ?? 0)) {
    fx.push({ kind: 'room', step: i, rec });
    p.room = rec;
  }
  // every item made: passes at once, no Host approval (the Host sees it in the matrix and in the answer log; Phạt / undo as usual)
  if (input.done === room.total && stateOf(leg, i, p, now) === 'active') {
    const a: AnswerRec = { id: p.lastAnswerId + 1, b: input.branch, text: `Hoàn thành phòng ${ROOM_NAME[room.kind]}: ${input.done}/${room.total}`, at: now, s: 'correct' };
    p = { ...p, lastAnswerId: a.id };
    fx.push({ kind: 'answer', step: i, rec: a, verdict: 'correct' });
    const r = advance(leg, zones, p, { kind: 'approve', step: s.id, pose: input.pose }, now, running);
    return { p: r.p, effects: [...fx, ...r.effects] };
  }
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
const taskView = (t: Task, room?: RoomRec | null, noInput = false): TaskView => ({
  title: t.title, description: t.description, media: t.media.map(mediaView), kind: t.kind, verification: t.verification,
  input: noInput ? 'none' : t.kind === 'free' ? 'proof' : t.parts ? 'parts' : t.pick ? 'seat' : 'text', proofInstruction: t.proofInstruction,
  timeLimitMinutes: t.timeLimitMinutes, ...(t.location ? { place: t.location.name } : {}),
  ...(t.parts ? { partLabels: t.parts.map((p) => p.label) } : {}), // SPEC §17.44
  ...(t.room ? { room: { ...t.room, done: room?.done ?? 0, skipped: room?.skipped ?? false } } : {}), // Leg 3: the 3D room + progress
});

/** Minutes of the Host's "Phạt" on this task. */
export const retryLockMinutes = (leg: Leg, t: Task) => t.retryLockMinutes ?? leg.penalties.retryLockMinutes;

/** The team's own answers on its card: this branch only (null = a challenge), newest NET.answerHistory, never a note. */
const answerViews = (row: StepProgressRow | undefined, branch: string | null, of?: number, marks?: boolean): AnswerView[] =>
  parseAnswers(row).filter((a) => a.b === branch).slice(-NET.answerHistory).map((a) => ({
    id: a.id, text: a.text, at: a.at, status: a.s, ...(scoreOf(a, of) ?? {}),
    // task.showMarks: the per-box right / wrong, only while it still agrees with the count (the Host may have edited x/N since)
    ...(marks && a.sv && a.m && a.m.filter(Boolean).length === a.sc ? { marks: a.m } : {}),
  }));

/** SPEC §17.31: the "đúng x/n" of a Phạt the team may see (review() set `sv`), undefined = none. */
export const scoreOf = (a: AnswerRec, of: number | undefined): { score: number; of: number } | undefined => (a.sv && a.sc !== undefined && of ? { score: a.sc, of } : undefined);
/** SPEC §17.31: server ms from which a Phạt on this task tells the team its count (null = the task has no scoreOf). */
export const scoreFrom = (t: Task, row: StepProgressRow | undefined): number | null => (partsOf(t) && row?.task_started_at != null ? row.task_started_at + t.scoreFromMinutes * 60_000 : null);

/** The card of step `index` as the team sees it (never answers / reference answers / Host notes / a destination name / a
 *  later step / an unopened branch's task), from its progress row (`clue_opened_at` = received; the engine fills step
 *  1's from the start time) + now (card state, docs/plans/phase8.md D3). The ONLY card builder. */
export function cardOf(leg: Leg, index: number, row: StepProgressRow | undefined, now: number, rooms?: Readonly<Record<string, RoomRec>>): ClueCard {
  const s = leg.steps[index]!;
  const status = taskState(leg, index, row, now);
  const lockedUntil = status === 'locked' || status === 'switchLocked' ? row!.locked_until : null;
  const base = {
    step: s.id, type: s.type, label: s.label, media: [] as MediaView[], status, lockedUntil, lockKind: lockedUntil === null ? null : status === 'switchLocked' ? ('switch' as const) : ('retry' as const),
    answers: [] as AnswerView[], receivedAt: row?.clue_opened_at ?? now, completedAt: row?.completed_at ?? null,
  };
  switch (s.type) {
    case 'route_info':
      return { ...base, text: s.clue, transport: s.transport, media: s.media.map(mediaView), ...(s.room && status !== 'done' ? { room: s.room } : {}) }; // Leg 3 (v13): the BOZAR hall
    case 'detour': {
      const branch = row?.branch ?? null;
      const b = s.branches.find((x) => x.id === branch);
      // the chosen branch's task is in its box: on the card once opened (or the step done: the branch the team did);
      // its afterChoice text from the moment it is chosen (never the other branch's)
      const opened = !!b && (row?.branch_opened_at != null || row?.completed_at != null);
      return {
        ...base, text: s.clue, media: s.media.map(mediaView),
        branches: s.branches.map((x) => ({ id: x.id, name: x.name, summary: x.summary, ...(x === b ? { afterChoice: x.afterChoice } : {}), ...(opened && x === b ? { task: taskView(x.task, rooms?.[s.id]?.b === x.id ? rooms[s.id] : null) } : {}) })),
        branch, branchOpened: opened, switches: row?.branch_switches ?? 0, switchPenaltyMinutes: leg.penalties.branchSwitchLockMinutes,
        // Leg 3: after a switch the team stands in the OTHER branch's room (its box was opened) until it walks into the exit ring
        ...(status === 'switchLocked' && row?.branch_switches && s.branches.find((x) => x !== b)?.task.room ? { leftRoom: s.branches.find((x) => x !== b)!.task.room!.kind } : {}),
        ...(b ? { retryPenaltyMinutes: retryLockMinutes(leg, b.task), answers: answerViews(row, branch, partsOf(b.task), b.task.showMarks) } : {}),
      };
    }
    case 'challenge':
      return {
        ...base, text: s.teaser, retryPenaltyMinutes: retryLockMinutes(leg, s.task), answers: answerViews(row, null, partsOf(s.task), s.task.showMarks),
        ...(status === 'teaser' ? {} : { task: taskView(s.task, null, s.room === 'cetiqlo') }), // Leg 3: a CETIQLO step is won in the room: no input
        ...(s.room && status !== 'done' ? { room: s.room } : {}), // Leg 3 (v12): played inside the GardeRobe room
        ...(s.pickup && status !== 'done' ? { pickup: s.pickup } : {}), // Leg 3 (v14): held in the room until F at the stage
      };
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
  if (m.op === 'ack' || m.op === 'score') {
    // Leg 3: the Host's look at an answer the server graded (already applied): "✓ Đồng ý" / a new "đúng x/N" for the team
    const answers = parseAnswers(row);
    const a = answers.find((x) => x.id === m.id);
    if (!a?.auto || !a.m) return { refuse: 'Không có câu trả lời tự chấm này.' };
    if (m.op === 'ack' && a.k) return { refuse: HANDLED };
    if (m.op === 'score' && a.s !== 'penalized') return { refuse: 'Chỉ sửa được số ô đúng của câu bị phạt (câu đã đúng / đã được Duyệt thì thôi).' };
    if (m.op === 'score' && (m.score ?? -1) > a.m.length) return { refuse: `Số ô đúng phải từ 0 đến ${a.m.length}.` };
    const rec: AnswerRec = m.op === 'ack' ? { ...a, k: true } : { ...a, sc: m.score!, sv: true };
    return { row: { ...row, answers: JSON.stringify(answers.map((x) => (x === a ? rec : x))) }, approve: false, id: a.id };
  }
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
    // Phase 10 V5 "Cho qua": any task, SPEC §13.9 "push a team on past a bug")
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
  const of = partsOf(t); // SPEC §17.44: a multi-box task's n = its box count
  const score = m.op === 'penalize' && of && m.score !== undefined && m.score <= of ? { sc: m.score, ...(from !== null && now >= from ? { sv: true as const } : {}) } : {};
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
