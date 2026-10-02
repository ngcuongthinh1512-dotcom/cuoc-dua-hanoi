// Phase 6 wire contract (docs/plans/phase6.md §5.1) + Phase 7 race engine (docs/plans/phase7.md §5.1). Hot messages
// (poses, ticks) are plain number arrays rounded to cm (SPEC §3); everything else is a small JSON object with a `t` tag.
// Changing a shape = PROTOCOL_VERSION + 1. Leg literals come from the leg schema as types only (no zod in the client).
import type { StepType, TaskKind, Transport, Verification, VehiclesConfig } from '../leg/schema.ts';

export type { StepType, TaskKind, Transport, Verification, VehiclesConfig };

/** Locomotion modes (client/src/player/types.ts MoveMode derives from this); the wire sends the index. */
export const MOVE_MODES = ['walk', 'slow', 'swim', 'air', 'bike'] as const;
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

export type Role = 'team' | 'host';
export type RaceStatus = 'lobby' | 'running' | 'paused' | 'finished';

/** Public team facts every client may know (names and colours are on the shirts anyway). */
export interface TeamInfo {
  slot: number;
  id: string;
  name: string;
  colour: string;
  online: boolean;
}

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
}
/** A task as the team sees it (SPEC §10.1 task fields minus `answers` / `referenceAnswers` / `params`; location → only its name). */
export interface TaskView {
  title: string;
  description: string;
  media: MediaView[];
  kind: TaskKind;
  verification: Verification;
  /** Phase 8: 'text' = an input box (answer typed in game); 'proof' = a photo sent on Messenger (kind free): the card shows
   *  proofInstruction, the submission code, the contact button and "Tôi đã gửi bài – chờ Host duyệt" (answer ''). */
  input: 'text' | 'proof';
  proofInstruction: string;
  /** 'proof' only: leg hostApproval.contactUrl / contactLabel (the Messenger button). */
  contactUrl?: string;
  contactLabel?: string;
  timeLimitMinutes: number | null;
  /** Task somewhere else (leg task.location.name); absent = at the point just reached. */
  place?: string;
}
export interface BranchView {
  id: string;
  name: string;
  summary: string;
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
  /** server ms the team's clock started (Host input: the first clue was handed over OUTSIDE the game, SPEC §17.12);
   *  null = not entered yet (the HUD clock shows --:--). */
  startAt: number | null;
  /** server ms of the Pit Stop check-in (SPEC §8.6), null = still racing. */
  finishAt: number | null;
  penaltyMinutes: number;
  /** The current step's card (pinned in the Sổ mật thư), null before the leg is loaded. */
  card: ClueCard | null;
  /** Pit Stop with a penalty: server ms from which the team may check in (SPEC §8.6), else null. */
  checkinAt: number | null;
  /** After the check-in: official time, ms (SPEC §13.8; Host approval waits deducted when they do not count). */
  officialMs: number | null;
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
  /** SPEC §8.9: s waited for Host decisions (deducted from the official time unless hostApproval.approvalWaitCounts). */
  approvalWaitSeconds: number;
  /** Every answer of this step, all branches, with the Host's note per decision. */
  answers: (AnswerView & { branch: string | null; note?: string })[];
  /** The Host's note on this step ("Lưu ghi chú"); never sent to the team. */
  note: string;
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
}

/** Phase 8 (SPEC §8.9 (2), docs/plans/phase8.md §12 q16): the code a team pastes with its photo on Messenger and the Host
 *  sees in the review queue: "<team name>-<step>[-<branch>]" (one pending answer per team at a time: no random part). */
export const submitCode = (teamName: string, step: string, branch?: string | null) => `${teamName}-${step}${branch ? `-${branch}` : ''}`;
/** SPEC §13.6 / §13.8 ranking: finished teams by official time, then the others by step reached. */
export interface RankRow {
  team: string;
  rank: number;
  /** Index of the current step (steps.length − 1 + finished = the Pit Stop). */
  stepIndex: number;
  finishAt: number | null;
  officialMs: number | null;
  /** Official time − the leader's, ms (finished teams only). */
  gapMs: number | null;
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
  | { t: 'race'; op: 'answer'; step: string; text: string }
  | { t: 'race'; op: 'branch'; step: string; branch: string }
  /** @deprecated Phase 7 stub (the task passes inside its zone). Kept only until Phase 8 track A plays answer / branch /
   *  open{branch}; track A removes it with its Phase 7 tests (docs/reports/phase8-foundation.md). */
  | { t: 'race'; op: 'task'; step: string; branch?: string; answer?: string }
  | { t: 'race'; op: 'checkin' }
  | { t: 'race'; op: 'book' };

/** Phase 8 (D5 / D10): the Host decides on a team's answer. approve / penalize name the answer (`id`); approve without
 *  `id` = a photo task approved before the team pressed "Tôi đã gửi bài" (the Host already has the photo); note = save the
 *  step's Host note only. Idempotent: a second decision on the same answer is refused with a host.notice. */
export interface HostReview {
  t: 'host.review';
  team: string;
  step: string;
  op: 'approve' | 'penalize' | 'note';
  id?: number;
  /** ≤ NET.noteMax; stored with the decision (never sent to the team). */
  note?: string;
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
  /** Phase 7 (SPEC §17.12): when the team got its first clue outside the game (server ms), null = clear, 'now' = the
   *  server stamps its own clock (the "Bây giờ" button: the Host machine's clock may be off). Refused (host.notice) when
   *  later than the server's now + 60 s; a warning when later than the team's first entry (it got the clue before). */
  | { t: 'host.team'; op: 'startAt'; team: string; at: number | null | 'now' }
  /** Phase 7: load a bundled leg (`id`) or a leg file the Host picked (`json` text), lobby only; answer: host.legResult. */
  | { t: 'host.leg'; id?: string; json?: string }
  | HostReview;

// ── server → client ──
export type ServerNotice =
  | 'bikeLost' | 'bikeGone' | 'bikeParked' | 'walkOnly'
  // Phase 7 (race ops refused / done; texts in client/src/ui/Toasts.ts)
  | 'raceNotOpen' | 'racePaused' | 'raceOver' | 'boxFar' | 'boxRiding' | 'boxOpened' | 'taskFar' | 'clueNew' | 'penaltyWait'
  // Phase 8 (docs/plans/phase8.md D15)
  | 'answerSent' | 'answerWrong' | 'answerPending' | 'answerLocked' | 'approved' | 'penalized'
  | 'branchChosen' | 'branchSwitched' | 'branchPending' | 'taskNotStarted';
export type KickReason = 'badToken' | 'otherDevice' | 'raceClosed' | 'protocol';

export interface Welcome {
  t: 'welcome';
  v: number;
  race: string;
  serverMs: number;
  status: RaceStatus;
  role: Role;
  /** The logged-in team (absent for the Host). */
  team?: TeamInfo & { player: string };
  teams: TeamInfo[];
  /** SPEC §6.1: from the leg file, also the server's speed-check limits. */
  movement: { footSpeed: number; bikeSpeedMultiplier: number };
  presence: { renderRadius: number; showOthersOnMinimap: boolean; interestRadius: number };
  /** SPEC §8.10: where the team last stood (null = first login: the leg's start). bikeId = the bike it holds. */
  pose: (PoseSample & { bikeId: string | null }) | null;
  /** s on this team's race clock at serverMs (now − its start time, SPEC §17.12), null = no start time yet / Host. */
  raceTime: number | null;
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
  | { t: 'team'; slot: number; online: boolean }
  /** Changed bikes (full = the whole list); `gone` = ids that vanished (abandoned, replaced, removed by the Host). */
  | { t: 'bikes'; list: BikeInfo[]; gone?: string[]; full?: boolean }
  /** reason 'finished': the team checked in or the race is over (a spectator, SPEC §8.6 / §8.10). */
  | { t: 'bike'; op: 'claim'; id: string; ok: boolean; reason?: 'taken' | 'far' | 'walkOnly' | 'finished' | 'gone' }
  | { t: 'gesture'; slot: number; g: GestureKind }
  | { t: 'notice'; code: ServerNotice }
  /** Per-team channel (SPEC §17.10): the current box's position when the team comes within boxReveal.radius, taken
   *  away again beyond radius + hysteresis. Opened boxes are never hidden. */
  | { t: 'box'; op: 'reveal'; box: BoxInfo }
  | { t: 'box'; op: 'hide'; step: string }
  /** Phase 8 (D7): the team switched branch: drop that branch's box even if opened (`hide` never drops an opened box). */
  | { t: 'box'; op: 'remove'; step: string; branch: string }
  /** Phase 7: the team's race state changed (step, start time, status, finish…). */
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
    /** Phase 7: SPEC §17.12 start time (server ms, Host input), first-entry order, current step index, check-in, penalty. */
    startAt: number | null; startOrder: number | null; step: number; finishAt: number | null; penaltyMinutes: number;
    /** server ms of the team's first entry into the game (the start time should be before it). */
    joinedAt: number | null;
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
    /** IANA zone the Host's start-time input is read in (leg.timezone). */
    timezone: string;
    start: { x: number; z: number };
    /** stepZones(leg) per step (+ branchZone of each detour branch). */
    steps: {
      id: string; type: StepType; label: string; name: string; x: number; z: number; r: number;
      /** Phase 8: a photo task (kind free): the matrix offers "Duyệt (đã nhận ảnh)" (host.review approve without id). */
      proof: boolean;
      branches?: { id: string; name: string; x: number; z: number; r: number; proof: boolean }[];
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
