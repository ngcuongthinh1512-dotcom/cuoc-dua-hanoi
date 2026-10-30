// Phase 6 wire contract (docs/plans/phase6.md §5.1) + Phase 7 race engine (docs/plans/phase7.md §5.1). Hot messages
// (poses, ticks) are plain number arrays rounded to cm (SPEC §3); everything else is a small JSON object with a `t` tag.
// Changing a shape = PROTOCOL_VERSION + 1. Leg literals come from the leg schema as types only (no zod in the client).
import type { StepType, TaskKind, Transport, Verification, VehiclesConfig } from '../leg/schema.ts';
import type { FinishKind, FinishTexts } from './finish.ts';

export type { StepType, TaskKind, Transport, Verification, VehiclesConfig };

/** Locomotion modes (client/src/player/types.ts MoveMode derives from this); the wire sends the index. */
export const MOVE_MODES = ['walk', 'swim', 'air', 'bike'] as const; // SPEC §17.29: no 'slow' any more (Shift = sprint)
export type MoveMode = (typeof MOVE_MODES)[number];
/** One-shot gestures (PlayerAction); the wire sends the index, remote players restart the gesture on change. */
export const PLAYER_ACTIONS = ['none', 'wave', 'openBox', 'celebrate', 'crash', 'climbOut'] as const;
export type PlayerAction = (typeof PLAYER_ACTIONS)[number];

/** Feet position (m, world), heading (rad, 0 = north / −Z, + = left), what the body does. */
export interface PoseSample {
  x: number;
  y: number;
  z: number;
  yaw: number;
  mode: MoveMode;
  action: PlayerAction;
}

/** First element of the number-array messages. */
export const TAG = { pos: 1, tick: 2 } as const;
/** `[TAG.pos, x_cm, y_cm, z_cm, yaw_mrad, mode, action]` (client → server). */
export type PoseArray = number[];
/** `[TAG.tick, serverMs, (slot, x_cm, y_cm, z_cm, yaw_mrad, mode, action)…]` (server → client). */
export type TickArray = number[];
export interface TickEntry {
  /** Team slot (Welcome.teams[i].slot): a small integer, never the team id, so ticks stay numeric. */
  slot: number;
  pose: PoseSample;
}

/** SPEC §17.40: 'spectator' = the watch-only role (spectator code "K" + 5): sends nothing but pings, gets a compact welcome,
 *  the ticks of every online team and `team` changes — never clues, boxes, progress, cards, feed. */
export type Role = 'team' | 'host' | 'spectator';
export type RaceStatus = 'lobby' | 'running' | 'paused' | 'finished';

/** Public team facts every client may know (names and colours are on the shirts anyway). */
export interface TeamInfo {
  slot: number;
  id: string;
  name: string;
  colour: string;
  online: boolean;
  /** SPEC §17.40: still racing (not checked in, not out). The server always sends it; absent (demo / old data) = racing.
   *  The watch bar lists only online + racing teams. */
  racing?: boolean;
  /** Leg 2: the body the team's client chose ("Nhân vật": 0 = Nam, 1 = Nữ), from its socket URL; absent (offline team,
   *  demo) = 0. Other clients draw that avatar. */
  avatar?: Avatar;
}

/** Leg 2 player avatar index (client CharacterModel AVATARS): 0 = Nam, 1 = Nữ. */
export type Avatar = 0 | 1;
/** The `avatar` socket URL parameter → an Avatar (anything else = 0). */
export const avatarOf = (v: unknown): Avatar => (v === 1 || v === '1' ? 1 : 0);

/** One shared bike (SPEC §6.2–6.4) as clients see it. parked = standing at a rack next to a checkpoint. */
export interface BikeInfo {
  id: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  owner: string | null;
  rider: boolean;
  parked: boolean;
}

/** A clue box the team may see (SPEC §17.10): opened ones of earlier steps, plus the current one only while the team is
 *  within boxReveal.radius of it. x, z only: the client puts it on the ground it has (the server has no DEM). */
export interface BoxInfo {
  step: string;
  x: number;
  z: number;
  opened: boolean;
  /** Phase 7: geofence radius (m) of the point: "Bấm F" prompt, NPC exclusion zone (SPEC §17.5). */
  r: number;
  /** Phase 7: 'mat' = the Pit Stop mat + host NPC instead of a clue box (also shown for the route leading to it). */
  kind?: 'mat';
  /** Phase 8 (D7): heading of the box's front, rad (leg destination.yawDeg: 0 = north, + = left / west). */
  yaw?: number;
  /** Phase 8 (D6): a detour branch's box (only the chosen branch's is ever sent); the client keys boxes by step|branch. */
  branch?: string;
}

// ── Phase 7: race engine (SPEC §8, docs/plans/phase7.md §5.1); Phase 8 tasks (docs/plans/phase8.md §5.1). Never carries
// answers, reference answers, Host notes, another team's answers, destination names, a later step, an unopened branch's
// task or an unopened step's media. ──
/** A link or an image of a clue / task (leg `media`, D12). image = "r2:<name>" (the client fetches it with its token from
 *  /api/race/<race>/media/<name>); link = "https://…" (opened in a new tab, never embedded). */
export interface MediaView {
  url: string;
  /** '' = none (the client shows the link's host name). */
  label: string;
  kind: 'image' | 'link';
}
export type AnswerStatus = 'pending' | 'approved' | 'penalized' | 'wrong' | 'correct';
/** One answer of THIS team (its card history, SPEC §17.14; never in the Sổ mật thư). '' = "đã gửi bài" of a photo task. */
export interface AnswerView {
  /** 1, 2… within the step (host.review names it). */
  id: number;
  text: string;
  /** server ms sent. */
  at: number;
  status: AnswerStatus;
  /** SPEC §17.31: a Phạt with the Host's count "đúng score/of" — only when made ≥ task.scoreFromMinutes into the task (§17.44: a
   *  multi-box task's of = its box count). */
  score?: number;
  of?: number;
}

/** A task as the team sees it (SPEC §10.1 task fields minus `answers` / `referenceAnswers` / `params`; location → only its name). */
export interface TaskView {
  title: string;
  description: string;
  media: MediaView[];
  kind: TaskKind;
  verification: Verification;
  /** Phase 8: 'text' = an input box (answer typed in game); 'seat' = Leg 3: the answer is a seat picked in the BOZAR hall (F on it; no input box); 'proof' = a photo the team sends on Messenger, opened outside the
   *  game (kind free, SPEC §17.17: no contact button): the card shows proofInstruction, the submission code and
   *  "Tôi đã gửi bài – chờ Host duyệt" (answer ''). */
  input: 'text' | 'proof' | 'parts' | 'seat';
  /** SPEC §17.44: input 'parts' — one box per part, in leg order ('' = the client numbers it); the N strings go to the Host. */
  partLabels?: string[];
  proofInstruction: string;
  timeLimitMinutes: number | null;
  /** Task somewhere else (leg task.location.name); absent = at the point just reached. */
  place?: string;
  /** Leg 3: the chosen + opened detour branch is a 3D room (leg task.room) + this team's progress in it (server-kept, reset by a
   *  branch switch). The client reports `race room {step, branch, done, skipped}`. */
  room?: RoomView;
}
/** Leg 3: a Lựa chọn kép room as its team sees it: `done` of `total` made, `skipped` = "Bỏ qua" pressed (the step is done,
 *  (total − done) × penaltyMinutesEach at the finish line). */
export interface RoomView {
  /** 'garderobe' = the GardeRobe MannekenPis museum room of a CHALLENGE step, 'hall' = the BOZAR concert hall of a route_info
   *  step (leg step `room`; no tally: total 0). */
  kind: 'chocolate' | 'comic' | 'garderobe' | 'hall';
  total: number;
  penaltyMinutesEach: number;
  done: number;
  skipped: boolean;
}
export interface BranchView {
  id: string;
  name: string;
  summary: string;
  /** Leg 3: the text that drops open under the branch the team picked (leg `branches[].afterChoice`); ONLY on the chosen branch. */
  afterChoice?: string;
  /** Phase 8 (§17.16): ONLY for the chosen branch once its box is opened (the task is inside the box). */
  task?: TaskView;
}
/** Phase 8 (D5 / D6) card states, derived from step_progress + now on the server (no timer):
 *  - challenge / opened branch: teaser (hint + "Nhận thử thách") → active (input) → pending (waiting for the Host) →
 *    locked (the Host's "Phạt": countdown to lockedUntil) → active … → done;
 *  - detour before its branch box is opened: choose (2 buttons) → goToBranch (walk to the branch box; "Đổi lựa chọn kép")
 *    ⇄ switchLocked (after a switch: countdown, no box);
 *  - route_info / pit_stop: active → done.
 *  Priority: done > pending > locked > active > teaser. */
export type CardStatus = 'teaser' | 'choose' | 'switchLocked' | 'goToBranch' | 'active' | 'pending' | 'locked' | 'done';
/** One received clue (SPEC §8.3, §8.11): the current card, and every entry of the Sổ mật thư. */
export interface ClueCard {
  step: string;
  type: StepType;
  /** "Lộ trình 1", "Lựa chọn kép"… */
  label: string;
  /** route_info / detour: the clue; challenge: the teaser ('' = none); pit_stop: ''. */
  text: string;
  /** route_info only (SPEC §6.5, HUD icon). */
  transport?: Transport;
  /** Phase 8: route_info / detour clue media ([] = none). */
  media: MediaView[];
  /** challenge, once started (absent while status = 'teaser'). */
  task?: TaskView;
  /** detour: both branches' name + summary (SPEC §8.4); the chosen one's task once its box is opened. */
  branches?: BranchView[];
  /** detour: the branch the team took, null = none yet. */
  branch?: string | null;
  /** detour: the chosen branch's box has been opened (its task is on the card). */
  branchOpened?: boolean;
  /** detour: how many times the team switched branch (each switch = a branchSwitchLockMinutes countdown). */
  switches?: number;
  /** Leg 3: while switchLocked, the room of the branch just left (its box was opened): the team is still standing in it until it
   *  walks into the exit ring (a reload puts it back there, ring lit). */
  leftRoom?: RoomView['kind'];
  /** Leg 3 (v12): a challenge played inside a 3D room (leg step `room: 'garderobe'`): the team enters it when this card
   *  arrives (the previous box opened) and may walk out / back in at will; absent once the step is done. */
  room?: 'garderobe' | 'hall';
  /** detour: minutes of one switch (the confirm text of "Đổi lựa chọn kép"). */
  switchPenaltyMinutes?: number;
  /** challenge / branch: minutes of the Host's "Phạt" (task.retryLockMinutes ?? penalties.retryLockMinutes; may be 0.1 in
   *  a test leg: never hard-code "3"). */
  retryPenaltyMinutes?: number;
  status: CardStatus;
  /** server ms the countdown ends (status locked / switchLocked), else null. The client flips the card itself at that time
   *  (+ raceClient slack) and re-sends one pose so the server checks the branch box (D9). */
  lockedUntil: number | null;
  lockKind: 'retry' | 'switch' | null;
  /** This team's answers to this step (detour: the current branch only), oldest first, at most NET.answerHistory. */
  answers: AnswerView[];
  /** server ms the team got this clue / finished this step. */
  receivedAt: number;
  completedAt: number | null;
}
/** The team's own race state (welcome.view, then `{t:'race', view}` on every change). */
export interface RaceView {
  status: RaceStatus;
  /** server ms of the Pit Stop check-in (SPEC §8.6), null = still racing. */
  finishAt: number | null;
  penaltyMinutes: number;
  /** The current step's card (pinned in the Sổ mật thư), null before the leg is loaded. */
  card: ClueCard | null;
  /** Pit Stop with a penalty: server ms from which the team may check in (SPEC §8.6), else null. */
  checkinAt: number | null;
  /** SPEC §17.22 / §17.23: the team's place once it finished (fixed: real finish order) or is out (the last team to
   *  finish, or still racing when the Host ended the race); texts from the leg (pit_stop.announce) or FINISH_DEFAULTS,
   *  placeholders filled. null = still racing. */
  result: FinishResult | null;
}
export interface FinishResult extends FinishTexts {
  rank: number;
  total: number;
  kind: FinishKind;
  /** Leg 3: the Host's finish-line penalty of this team (host.finishPenalty; e.g. a Lựa chọn kép room given up), absent =
   *  none. The card stays "Về đích thứ n" and adds one line "Bị phạt {minutes} phút do {reason}." Only the team's own. */
  finishPenalty?: FinishPenalty;
}
/** Leg 3: minutes added at the finish line (not served at the mat: the team is told it finished) + why (Vietnamese). */
export interface FinishPenalty {
  minutes: number;
  reason: string;
  /** Who set it: the Host (host.finishPenalty; absent in older rows = the Host) or the server from a skipped room (`race room
   *  skipped`). A room never overwrites a Host-set penalty. */
  by?: 'host' | 'room';
}
/** "Tại điểm này" (SPEC §7): another online team inside the same point's zone and what it visibly does. */
export interface ZoneMember {
  slot: number;
  /** Its current step's label ("Thử thách 2") and type; the branch of a detour. */
  label: string;
  type: StepType;
  branch: string | null;
  /** server ms it entered the zone. */
  since: number;
  /** Phase 10 (V4): server ms it LEFT the zone (walked out / disconnected); absent = it is there now. Sent for up to
   *  NET.zoneLeftMs after; the client words it "vừa rời đi n phút trước" and drops it itself once expired. */
  left?: number;
}
/** Host table rows (SPEC §8.1 step_progress; Host only). */
export interface StepProgressView {
  team: string;
  step: string;
  arrivedAt: number | null;
  /** The clue of this step reached the team (= the previous step's completion; step 1: its start time / first login). */
  openedAt: number | null;
  /** Task started ("Nhận thử thách", or the clue when there is no teaser); detour: see branchOpenedAt. */
  startedAt: number | null;
  completedAt: number | null;
  branch: string | null;
  // Phase 8 (docs/plans/phase8.md §5.1)
  /** server ms of the last answer sent for the Host / of the last decision. */
  submittedAt: number | null;
  decidedAt: number | null;
  /** "Phạt" count, wrong `auto` answers, branch switches. */
  rejections: number;
  wrongAnswers: number;
  branchSwitches: number;
  /** detour: server ms the chosen branch's box was opened (its task started), null = not yet. */
  branchOpenedAt: number | null;
  /** server ms a retry / switch countdown ends (may be past: compare with serverMs). */
  lockedUntil: number | null;
  /** The last answer waits for the Host. */
  pending: boolean;
  /** SPEC §8.9: s waited for Host decisions (information for the Host only: SPEC §17.23, no official time any more). */
  approvalWaitSeconds: number;
  /** Every answer of this step, all branches, with the Host's note per decision. */
  answers: (AnswerView & { branch: string | null; note?: string })[];
  /** The Host's note on this step ("Lưu ghi chú"); never sent to the team. */
  note: string;
  /** Leg 3: detour with a room: the team's progress in the current branch's room (absent = none reported). */
  room?: { branch: string; kind: RoomView['kind']; total: number; done: number; skipped: boolean };
}
/** Phase 8 (D10 / D16): one answer waiting for the Host (HostState.queue, oldest first). */
export interface ReviewItem {
  team: string;
  step: string;
  /** The step's label ("Thử thách 2"). */
  label: string;
  branch: string | null;
  /** AnswerView.id: host.review names it. */
  id: number;
  /** '' = "đã gửi bài qua Messenger" (photo task: compare with submitCode). */
  text: string;
  at: number;
  /** task.referenceAnswers, else task.answers (Host only). */
  reference: string[];
  /** The step's Host note so far. */
  note: string;
  /** Minutes the "Phạt" button locks (task.retryLockMinutes ?? penalties.retryLockMinutes). */
  lockMinutes: number;
  /** SPEC §17.31: task.scoreOf (the Host enters "đúng ?/n" with its Phạt) + the server ms from which the team is told the number. */
  scoreOf?: number;
  scoreFrom?: number;
  /** SPEC §17.44: a multi-box task: its box labels ('' = numbered); `text` holds the N strings joined " | " (the page lists them). */
  partLabels?: string[];
  /** Leg 3: an answer the SERVER graded (task.parts[].answers) and already applied (all right → done, else Phạt + "đúng x/N"):
   *  the item only waits for the Host's look ("✓ Đồng ý" = host.review ack). `marks[k]` = box k right (Host only); `score` =
   *  what the team is told now (the Host may change it: host.review score); `canApprove` = "Đúng" still applies (the answer is
   *  the team's last, penalized, its step not done: host.review approve with this id lifts the lock and completes it). */
  auto?: { verdict: 'correct' | 'penalized'; marks: boolean[]; score: number; of: number; canApprove: boolean };
}

/** Phase 8 (SPEC §8.9 (2), docs/plans/phase8.md §12 q16): the code a team pastes with its photo on Messenger and the Host
 *  sees in the review queue: "<team name>-<step>[-<branch>]" (one pending answer per team at a time: no random part). */
export const submitCode = (teamName: string, step: string, branch?: string | null) => `${teamName}-${step}${branch ? `-${branch}` : ''}`;
/** SPEC §17.22 ranking: finished teams in real finish order, then the teams out at the Host's "Kết thúc", then the others
 *  by step reached. */
export interface RankRow {
  team: string;
  rank: number;
  /** Index of the current step (steps.length − 1 + finished = the Pit Stop). */
  stepIndex: number;
  finishAt: number | null;
  /** SPEC §17.23: eliminated (the last team to finish, or unfinished when the Host ended the race). */
  out: boolean;
}
export interface LegIssueView {
  level: 'error' | 'warning' | 'blank';
  where: string;
  message: string;
}

// ── client → server ──
export type GestureKind = 'wave' | 'bell';
export type RespawnHow = 'safe' | 'stairs' | 'fell';
export type BikeOp = 'claim' | 'mount' | 'dismount';
export type ClientMessage =
  | PoseArray
  /** The client teleported itself (CharacterController.respawn, fell through the world): resets the speed window. */
  | { t: 'respawn'; x: number; y: number; z: number; yaw: number; how: RespawnHow }
  | { t: 'gesture'; g: GestureKind }
  /** claim = F on a free / own bike (server decides, SPEC §6.3); dismount carries where the bike now stands. */
  | { t: 'bike'; op: BikeOp; id: string; x?: number; y?: number; z?: number; yaw?: number }
  /** SPEC §17.40: a finished team's client entered (`on`) / left the watch mode: while on, its ticks carry EVERY online
   *  team (like the Host's), not only those within the interest radius. The server honours it only once the team is over
   *  (checked in / out / race ended); a racing team's `watch` changes nothing. */
  | { t: 'watch'; on: boolean }
  | RaceOp
  | HostMessage;

/** Race ops (SPEC §8): F on the current box (open; Phase 8: also the chosen branch's box, `branch`), standing on the Pit
 *  Stop mat once the penalty wait is over (checkin), Tab (book: the Sổ mật thư is reloaded on every open, §8.11).
 *  Phase 8 (docs/plans/phase8.md D5 / D6 / D8), from ANYWHERE (no zone, no foot rule, no trusted pose needed):
 *  accept = "Nhận thử thách" (a card with a teaser); answer = a typed answer (≤ NET.answerMax; '' = "Tôi đã gửi bài" of a
 *  photo task); branch = choose a detour branch, or switch to the other one (the client confirmed the penalty). */
export type RaceOp =
  | { t: 'race'; op: 'open'; step: string; branch?: string }
  | { t: 'race'; op: 'accept'; step: string }
  | { t: 'race'; op: 'answer'; step: string; text: string; /** SPEC §17.44: a multi-box task: one string per box (text ''; stored "a | b | c"). */ parts?: string[] }
  | { t: 'race'; op: 'branch'; step: string; branch: string }
  /** Leg 3: progress in the chosen + opened branch's room (TaskView.room): done only grows (0..total), skipped = "Bỏ qua" (final). */
  | { t: 'race'; op: 'room'; step: string; branch: string; done: number; skipped: boolean }
  | { t: 'race'; op: 'checkin' }
  | { t: 'race'; op: 'book' };

/** Phase 8 (D5 / D10): the Host decides on a team's answer. approve / penalize name the answer (`id`); approve without
 *  `id` = a photo task approved before the team pressed "Tôi đã gửi bài" (the Host already has the photo), or Phase 10
 *  (V5) "Cho qua": any challenge / opened branch while active / locked. note = save the step's Host note only.
 *  Idempotent: a second decision on the same answer is refused with a host.notice.
 *  Phase 10 (V2): `undo` takes back a Duyệt / Phạt / Cho qua within NET.undoMs; `id` REQUIRED (codec) = the answer the
 *  decision was on, as listed in HostState.undo (a Cho qua created that answer). Refused (host.notice) when expired, the
 *  team finished, moved on / got a newer decision, or the race is over (plan M3). */
export interface HostReview {
  t: 'host.review';
  team: string;
  step: string;
  op: 'approve' | 'penalize' | 'note' | 'undo' | 'ack' | 'score';
  /** Leg 3 (an auto-graded answer, ReviewItem.auto): `ack` = "✓ Đồng ý" (the item leaves the queue, the team sees nothing);
   *  `score` = "Cập nhật" the "đúng x/N" the team sees (`score` required; the lock stays). Both need `id`. */
  id?: number;
  /** ≤ NET.noteMax; stored with the decision (never sent to the team). */
  note?: string;
  /** SPEC §17.31: penalize on a task with scoreOf — how many were right (0..scoreOf; else ignored). */
  score?: number;
}

/** Phase 10 (V3): why a team wears the red flag (SPEC §13.9: a mark only, no penalty). */
export type FlagWhy = 'speed' | 'jump' | 'respawn';

/** Phase 10 (V2): a decision the Host may still undo (HostState.undo; the page draws the button from this, so a reload
 *  keeps it). `until` = at + NET.undoMs (server ms). */
export interface UndoItem {
  team: string;
  step: string;
  /** The answer the decision was on (host.review undo names it). */
  id: number;
  op: 'approve' | 'penalize';
  at: number;
  until: number;
}

/** Host screen only (Phase 6: minimal Host page; Phase 10: the rest). */
export type HostMessage =
  | { t: 'host.createTeams'; teams: { name: string; colour: string; player?: string }[] }
  /** Spawn candidates computed in the Host browser (SPEC §3, §6.2): per route segment, [x, z, x, z…] m, bicycle
   *  parking first; `decoys` = points anywhere else on the map. The DO only picks randomly from these. */
  | { t: 'host.candidates'; segments: number[][]; decoys: number[] }
  | { t: 'host.bike'; op: 'add' | 'remove' | 'release'; id?: string; x?: number; z?: number; team?: string }
  | { t: 'host.spawning'; paused: boolean }
  /** Phase 7: open the race (lobby → running), pause / resume (race ops refused while paused, clocks run on: decision
   *  D9), end the leg (SPEC §13.3). */
  | { t: 'host.race'; op: 'start' | 'pause' | 'resume' | 'finish' }
  /** Phase 7: load a bundled leg (`id`) or a leg file the Host picked (`json` text), lobby only; answer: host.legResult. */
  | { t: 'host.leg'; id?: string; json?: string }
  | HostReview
  /** Phase 10 (V3): clear a team's red flag (event host.unflag; the server flags again on new evidence, plan M5). */
  | { t: 'host.flag'; op: 'clear'; team: string }
  /** SPEC §17.40: a new spectator code (the old one's tokens die, its open spectator sockets are closed 4401). */
  | { t: 'host.spectator'; op: 'rotate' }
  /** Leg 3: set (minutes 1..FINISH_PENALTY_MAX) or clear (minutes 0) a team's finish-line penalty, before or after it
   *  finished, also after "Kết thúc"; `reason` '' / absent = FINISH_PENALTY_REASON. Host-entered only: a team never
   *  reports its own penalty (client untrusted). Event host.finishPenalty {minutes, reason, was}. */
  | { t: 'host.finishPenalty'; team: string; minutes: number; reason?: string };

// ── server → client ──
export type ServerNotice =
  | 'bikeLost' | 'bikeGone' | 'bikeParked' | 'walkOnly'
  // Phase 7 (race ops refused / done; texts in client/src/ui/Toasts.ts)
  | 'raceNotOpen' | 'racePaused' | 'raceOver' | 'boxFar' | 'boxRiding' | 'boxOpened' | 'taskFar' | 'clueNew' | 'penaltyWait'
  // Phase 8 (docs/plans/phase8.md D15)
  | 'answerSent' | 'answerWrong' | 'answerPending' | 'answerLocked' | 'approved' | 'penalized'
  | 'branchChosen' | 'branchSwitched' | 'branchPending' | 'taskNotStarted'
  // Phase 10 (V2): the Host undid its last decision on this team; the `race` view before it restores the card
  | 'reviewUndone'
  // Leg 3: a `race room` report that does not apply (not the chosen + opened room branch, done went down, already skipped…)
  | 'roomIgnored'
  // Leg 3: an auto-graded multi-box answer: all right (the step is done) / not all (Phạt countdown; "đúng x/N" on the card,
  // also in `score` / `of`) / the Host changed that number
  | 'autoCorrect' | 'autoPenalized' | 'scoreUpdated';
/** 'full' (SPEC §17.40): NET.maxSpectators spectator sockets are already open (CLOSE.full). */
export type KickReason = 'badToken' | 'otherDevice' | 'raceClosed' | 'protocol' | 'full';

export interface Welcome {
  t: 'welcome';
  v: number;
  race: string;
  serverMs: number;
  status: RaceStatus;
  /** SPEC §17.40: a spectator's welcome is this shape with teams (incl. `racing`), movement, presence and empty / null race
   *  fields (no pose, bikes, boxes, view). */
  role: Role;
  /** The logged-in team (absent for the Host and spectators). */
  team?: TeamInfo & { player: string };
  teams: TeamInfo[];
  /** SPEC §6.1: from the leg file, also the server's speed-check limits. */
  movement: { footSpeed: number; bikeSpeedMultiplier: number };
  presence: { renderRadius: number; showOthersOnMinimap: boolean; interestRadius: number };
  /** SPEC §8.10: where the team last stood (null = first login: the leg's start). bikeId = the bike it holds. */
  pose: (PoseSample & { bikeId: string | null }) | null;
  bikes: BikeInfo[];
  /** SPEC §17.10: this team's visible clue boxes now (never a future step; the current one only within boxReveal.radius). */
  boxes: BoxInfo[];
  /** Phase 7: the team's race state (null for the Host); later changes come as `{t:'race', view}`. */
  view: RaceView | null;
  /** Phase 7 (SPEC §17.12): order of the team's FIRST entry into the game (1 = first), kept forever; null = Host. */
  startOrder: number | null;
  /** True only in the welcome of that very first entry: the client shows "Xuất phát ở vị trí thứ n" once. */
  showStartOrder: boolean;
  /** Where a team with no pose yet (first entry) appears: its spot at the leg start (startSpot), null otherwise. */
  start: { x: number; z: number; yaw: number } | null;
}

export type ServerMessage =
  | TickArray
  | Welcome
  | { t: 'kick'; reason: KickReason }
  /** A team went online / offline; SPEC §17.40: `racing` when that changed instead (checked in / out: the watch bar drops it).
   *  Leg 2: online → also its avatar (the socket's). */
  | { t: 'team'; slot: number; online: boolean; racing?: boolean; avatar?: Avatar }
  /** Changed bikes (full = the whole list); `gone` = ids that vanished (abandoned, replaced, removed by the Host). */
  | { t: 'bikes'; list: BikeInfo[]; gone?: string[]; full?: boolean }
  /** reason 'finished': the team checked in or the race is over (a spectator, SPEC §8.6 / §8.10). */
  | { t: 'bike'; op: 'claim'; id: string; ok: boolean; reason?: 'taken' | 'far' | 'walkOnly' | 'finished' | 'gone' | 'broken' }
  | { t: 'gesture'; slot: number; g: GestureKind }
  | { t: 'notice'; code: ServerNotice; /** SPEC §17.31: `penalized` with the Host's count, once past scoreFromMinutes. */ score?: number; of?: number }
  /** Per-team channel (SPEC §17.10): the current box's position when the team comes within boxReveal.radius, taken
   *  away again beyond radius + hysteresis. Opened boxes are never hidden. */
  | { t: 'box'; op: 'reveal'; box: BoxInfo }
  | { t: 'box'; op: 'hide'; step: string }
  /** Phase 8 (D7): the team switched branch: drop that branch's box even if opened (`hide` never drops an opened box). */
  | { t: 'box'; op: 'remove'; step: string; branch: string }
  /** Phase 7: the team's race state changed (step, status, finish / result…). */
  | { t: 'race'; view: RaceView }
  /** Phase 7: answer to `race book`: every received card in order (SPEC §8.11; never a later step). */
  | { t: 'book'; cards: ClueCard[] }
  /** Phase 7 (SPEC §7 "Tại điểm này"): the other online teams in the zone the team stands in ([] = none / left it). */
  | { t: 'zone'; teams: ZoneMember[] }
  /** Phase 7: answer to `host.leg`. */
  | { t: 'host.legResult'; ok: boolean; issues: LegIssueView[] }
  /** Phase 7: a Host op refused or worth a warning (start time in the future, host.leg after teams entered, a race
   *  status change that does not apply…), Vietnamese text shown on the Host page. */
  | { t: 'host.notice'; level: 'error' | 'warning'; message: string }
  | HostState;

/** Host screen state (every ≤ 1 s while it changes); Phase 6 shows codes, online status and the quota counters. */
export interface HostState {
  t: 'host.state';
  serverMs: number;
  status: RaceStatus;
  teams: (TeamInfo & {
    code: string; player: string; lastSeen: number | null; reconnects: number; pose: PoseSample | null; flagged: boolean;
    /** Phase 10 (V3): reasons of the current flag (no repeats; [] when not flagged) and server ms it was first raised
     *  (null when not flagged). History = the `speed` / `jump` / `respawn` / `host.unflag` events. */
    flagWhy: FlagWhy[]; flagAt: number | null;
    /** Phase 7: first-entry order, current step index, check-in, penalty (SPEC §17.23: no start time any more). */
    startOrder: number | null; step: number; finishAt: number | null; penaltyMinutes: number;
    /** server ms of the team's first entry into the game. */
    joinedAt: number | null;
    /** Leg 3: the Host's finish-line penalty (host.finishPenalty), null = none. Optional: absent in older demo states. */
    finishPenalty?: FinishPenalty | null;
  })[];
  counters: QuotaCounters;
  bikes: BikeInfo[];
  spawning: { paused: boolean; candidates: number; nextAt: number | null };
  /** Phase 6 leg points (demo leg). Phase 7 track A drops it once the Host page (track E) reads `leg` below. */
  steps?: { id: string; x: number; z: number }[];
  /** Phase 7: the loaded leg (Host only: names + zones included), the bundled legs it may load, its readiness issues
   *  (§13.1). The Host page builds the bike corridors from start → every zone in order (both branch places of a
   *  detour) and keeps bikes ≥ vehicles.minDistanceFromCheckpoint from every zone (SPEC §6.2 (2)); it recomputes the
   *  candidates by itself whenever `id` changes. */
  leg: {
    id: string;
    title: string;
    /** IANA zone the Host page shows times in (leg.timezone). */
    timezone: string;
    start: { x: number; z: number };
    /** stepZones(leg) per step (+ branchZone of each detour branch). */
    steps: {
      id: string; type: StepType; label: string; name: string; x: number; z: number; r: number;
      /** Phase 8: a photo task (kind free): the matrix offers "Duyệt (đã nhận ảnh)" (host.review approve without id). */
      proof: boolean;
      /** `title` = the branch's own name (leg Branch.name, "Tính"): what the team calls it; `name` = its place. */
      branches?: { id: string; title: string; name: string; x: number; z: number; r: number; proof: boolean }[];
    }[];
    vehicles: VehiclesConfig;
    bundled: string[];
    issues: LegIssueView[];
    /** Phase 8 (D14): the R2 image names the leg refers to ("r2:<name>"): the Host uploads them per race. */
    media: string[];
    /** Phase 8: minutes of a "Phạt" (leg default; ReviewItem.lockMinutes has the task's) and of a branch switch. */
    penalties: { retryLockMinutes: number; branchSwitchLockMinutes: number };
    /** Phase 8 (D11): hostAlerts.stuckMinutes: the Host page warns when a team is on one challenge / branch this long. */
    stuckMinutes: number;
  } | null;
  /** Phase 7: step_progress rows (SPEC §8.1) and the ranking (§13.6 / §13.8). */
  progress: StepProgressView[];
  ranking: RankRow[];
  /** Phase 8 (D10): every answer waiting for the Host, oldest first. */
  queue: ReviewItem[];
  /** Phase 10 (V2): decisions still undoable (within NET.undoMs, newest last), gone from the list once past `until`. */
  undo: UndoItem[];
  /** SPEC §17.40: the spectator code ("K" + 5, typed into the same login box) and how many spectator sockets are open.
   *  Always sent by the server; absent only in the Host page's `?demo=1` state. */
  spectatorCode?: string;
  spectators?: number;
}

/** Estimated Cloudflare usage (SPEC §3: the Host debug view shows these). */
export interface QuotaCounters {
  /** WebSocket messages received (billed 20:1) / sent (free). */
  wsIn: number;
  wsOut: number;
  /** HTTP requests + WebSocket upgrades that reached the Durable Object, and alarm runs (1 request each). */
  http: number;
  alarms: number;
  /** SQLite rows written as we count them (index rows included). */
  rows: number;
}
