// Leg file schema (SPEC §10, adapted by §17.12: NO Roadblock / `roadblock` step). zod, server + CLI only: the client
// never imports this module at runtime (only `import type`), so zod stays out of the game bundle; leg content itself
// never leaves the Worker (SPEC §3). docs/plans/phase7.md §3 D11–D13; the user-facing description is docs/LEG_FORMAT.md.
// Every block except id / title / start / steps has defaults (the demo leg's values), so a hand-written leg stays short.
import { z } from 'zod';

/** Sanity limits shared by the schema, the server and `npm run leg:check` (SPEC §17.4: geofence radius 15–40 m). */
export const LEG_LIMITS = {
  radiusMin: 15,
  radiusMax: 40,
  maxSteps: 60,
  /** Step / branch ids: short, safe in URLs, submission codes and SQLite keys. */
  stepId: /^[A-Za-z0-9_-]{1,16}$/,
  /** Leg id: same rule as race ids (worker/src/index.ts RACE_ID). */
  legId: /^[a-z0-9][a-z0-9-]{0,31}$/,
  /** Longest text (clue, description…) in characters. */
  textMax: 4000,
  /** A bike rack farther than this (m) from its point is a warning in `leg:check` (a coordinate typo inside the map). */
  rackFar: 300,
} as const;

/** SPEC §2 / §17.12: the step types of this game (no `roadblock`). */
export const STEP_TYPES = ['route_info', 'detour', 'challenge', 'pit_stop'] as const;
export type StepType = (typeof STEP_TYPES)[number];
/** SPEC §11 mini-game kinds. Phase 8 plays `answer` (typed in game) and `free` (a photo sent on Messenger); the others
 *  are a `leg:check` warning and run as `answer` (the mini-game library is deferred, docs/plans/phase8.md §11). */
export const TASK_KINDS = ['find_objects', 'delivery', 'observe_answer', 'cipher', 'photo_match', 'binocular_scan', 'timed_drive', 'memory_ui', 'answer', 'free'] as const;
export type TaskKind = (typeof TASK_KINDS)[number];
export const VERIFICATIONS = ['auto', 'host_approval'] as const;
export type Verification = (typeof VERIFICATIONS)[number];

const text = () => z.string().max(LEG_LIMITS.textMax);
const latLon = { lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180) };
const radius = z.number().min(LEG_LIMITS.radiusMin).max(LEG_LIMITS.radiusMax);
const stepId = z.string().regex(LEG_LIMITS.stepId);
/** Phase 8 (D2): a link or an image, written as a string or {url, label}; always {url, label} once parsed. url =
 *  "https://…" (a link, opened in a new tab) or "r2:<name>" (an image the Host uploads to R2, protocol MEDIA). The url /
 *  name rules are checkLeg's (Vietnamese messages naming the item). */
const mediaItem = z
  .union([z.string().max(500), z.strictObject({ url: z.string().max(500), label: text().default('') })])
  .transform((m) => (typeof m === 'string' ? { url: m, label: '' } : m));
const media = () => z.array(mediaItem).default([]);

/** A point with a geofence (SPEC §8.2): the clue box / mat stands at lat, lon; `radius` m around it is "at the point". */
export const destinationSchema = z.strictObject({
  name: text(),
  ...latLon,
  radius,
  /** SPEC §6.4: the bike rack next to the point (optional; `npm run leg:check` suggests one). */
  bikeParking: z.strictObject(latLon).optional(),
  /** Phase 8 (gap 11): where the FRONT of the clue box faces (the side a team reads it from), like start.yawDeg: 0 = north,
   *  + = turned left / west. Also the box of a detour branch (its task.location). */
  yawDeg: z.number().default(0),
});

/** SPEC §6.5. */
export const transportSchema = z.union([z.strictObject({ allowed: z.literal('any') }), z.strictObject({ mandatory: z.literal('walk') })]);

/** SPEC §10.1 "Ý nghĩa các trường của task". `answers` never leave the server (SPEC §3). */
export const taskSchema = z.strictObject({
  title: text().default(''),
  description: text().default(''),
  media: media(),
  /** null = right at the point just reached; else somewhere else (its own geofence). */
  location: destinationSchema.nullable().default(null),
  kind: z.enum(TASK_KINDS).default('answer'),
  verification: z.enum(VERIFICATIONS).default('auto'),
  answers: z.array(z.string().max(200)).default([]),
  /** Phase 8 (gap 2): shown to the Host next to a team's answer (host_approval); NEVER sent to a team. Empty = the Host
   *  sees `answers`. */
  referenceAnswers: z.array(z.string().max(200)).default([]),
  /** Phase 8 (gap 3): minutes a team waits after the Host's "Phạt" before answering again; null = penalties.retryLockMinutes,
   *  0 = no wait. */
  retryLockMinutes: z.number().min(0).nullable().default(null),
  /** T1 (SPEC §17.31): the Host enters how many of `scoreOf` parts were right when it clicks "Phạt"; the team learns
   *  "đúng x/n" only for a Phạt made ≥ scoreFromMinutes after the task started (earlier ones never show a number). */
  scoreOf: z.number().int().min(1).optional(),
  scoreFromMinutes: z.number().min(0).default(30),
  /** Leg 3: an auto-graded `parts` task also tells the team WHICH boxes were right (green) / wrong (red), from scoreFromMinutes into the
   *  task on (before it: only "chưa đúng" + the Phạt; the hidden hint of BOZAR T3, minute 40). */
  showMarks: z.boolean().default(false),
  /** SPEC §17.44: a task with N boxes (T1: 4 places of a video) that the HOST reviews: `parts[k].label` = the box's label ('' =
   *  the client numbers it). The team sends N strings (stored "a | b | c | d", one answer in the Host's queue); Duyệt = all right,
   *  Phạt + "đúng x/N" = §17.31 (scoreOf defaults to parts.length, told from scoreFromMinutes on). Requires verification
   *  'host_approval' + kind 'answer' (checkLeg); no answers in the leg at all for such a task. */
  parts: z.array(z.strictObject({ label: text().default(''), /** Leg 3: accepted spellings of THIS box (server only); every box
   *  with answers = the server grades x/N itself (all right → done; else Phạt + "đúng x/N"), the Host reviews afterwards. */ answers: z.array(z.string().max(200)).min(1).optional() })).min(2).max(8).optional(),
  /** Leg 3: the answer is picked in a 3D room instead of typed: `"seat"` = a stalls seat of the BOZAR hall (F on it sends its
   *  label "J-14" as the answer; `answers` = the right seat(s), server only). verification 'auto'; wrong = Phạt (retryLockMinutes). */
  pick: z.enum(['seat']).optional(),
  proofInstruction: text().default(''),
  timeLimitMinutes: z.number().positive().nullable().default(null),
  /** Mini-game parameters of kinds other than answer / free (object positions, target photo + heading, gates…: SPEC
   *  §11). Phase 7 stores them unchecked so a real leg can be written now; Phase 8 validates them per kind and decides
   *  what reaches the team (never sent in Phase 7: cardOf leaves them out, like `answers`). */
  params: z.record(z.string(), z.unknown()).optional(),
  /** Leg 3: a Lựa chọn kép branch played in a 3D room (chocolate workshop / comic gallery): the client reports `race room
   *  {done, skipped}`; done = total → the Host's queue, "Bỏ qua" → next clue + (total − done) × penaltyMinutesEach at the
   *  finish line. Detour branches with host_approval only (checkLeg). No answers in it: sent to the team as is. */
  room: z.strictObject({ kind: z.enum(['chocolate', 'comic']), total: z.number().int().min(1).max(20), penaltyMinutesEach: z.number().min(0).max(120) }).optional(),
});

const routeInfo = z.strictObject({
  id: stepId,
  type: z.literal('route_info'),
  label: text(),
  clue: text(),
  transport: transportSchema.default({ allowed: 'any' }),
  destination: destinationSchema,
  /** Phase 8 (gap 5 / 14): links and images of the clue. */
  media: media(),
  /** Leg 3: the team walks into a 3D room built under the box just opened (the previous step's) while this clue is its card:
   *  `"hall"` = the BOZAR concert hall (Salle Henry Le Bœuf). Nothing to answer: the card is the route; the ring is always lit. */
  room: z.enum(['garderobe', 'hall']).optional(),
});
/** `afterChoice` (Leg 3): the text that "drops open" under the chosen branch once the team picked it (where to go, the Host's
 *  manual penalties…); sent only with the CHOSEN branch (steps.ts cardOf), scanned for leaks like `summary`. */
const branchSchema = z.strictObject({ id: stepId, name: text().default(''), summary: text().default(''), afterChoice: text().default(''), task: taskSchema.prefault({}) });
const detour = z.strictObject({
  id: stepId,
  type: z.literal('detour'),
  label: text(),
  clue: text().default(''),
  media: media(),
  branches: z.array(branchSchema).length(2),
});
const challenge = z.strictObject({
  id: stepId,
  type: z.literal('challenge'),
  label: text(),
  /** SPEC §8.8: optional hint shown before "Nhận thử thách" (Phase 8 gates the task behind it). */
  teaser: text().default(''),
  task: taskSchema.prefault({}),
  /** Leg 3: the challenge is played inside a 3D room built under the box just opened (the previous step's): the GardeRobe
   *  MannekenPis museum (4 vitrines with the costume photos). No tally / penalty: the card itself is the challenge.
   *  `"cetiqlo"` = the CETIQLO head-to-head shop: the step is done when the team WINS its match (server, worker/src/race/cetiqlo). */
  room: z.enum(['garderobe', 'hall', 'cetiqlo']).optional(),
  /** Leg 3: the previous challenge ended in the same room (BOZAR hall: T2 → T3): this card is HELD until the team walks to the
   *  pick-up spot by the stage (`prompt` = "Bấm F để nhận mật thư thử thách 3"); meanwhile a stand-in card shows `clue`
   *  ("Đội chơi đi lại gần sân khấu để nhận mật thư tiếp theo"). Needs `room`. */
  pickup: z.strictObject({ clue: text(), prompt: text() }).optional(),
});
/** SPEC §17.22 / §17.23: what a team reads when it finishes (host NPC line, toast, finish card); each field optional
 *  (missing → the generic FINISH_DEFAULTS, protocol/finish.ts). `first` = the winner's, `out` = "BỊ LOẠI" (the last team
 *  to finish, or unfinished when the Host ends the race). Placeholders {n} {tổng} {tên đội}. Server-only until sent to
 *  that team at its finish (the real text names the finish place). */
const announceTexts = { npc: text().optional(), toast: text().optional(), card: text().optional() };
export const announceSchema = z.strictObject({ ...announceTexts, first: z.strictObject(announceTexts).optional(), out: z.strictObject(announceTexts).optional() });
const pitStop = z.strictObject({ id: stepId, type: z.literal('pit_stop'), label: text(), destination: destinationSchema, announce: announceSchema.optional() });

export const stepSchema = z.discriminatedUnion('type', [routeInfo, detour, challenge, pitStop]);

const on = (enabled: boolean) => z.strictObject({ enabled: z.boolean().default(enabled) }).prefault({});

export const legSchema = z.strictObject({
  id: z.string().regex(LEG_LIMITS.legId),
  title: text(),
  timezone: z.string().default('Asia/Ho_Chi_Minh'),
  eliminationLeg: z.boolean().default(false),
  mapLabels: z.enum(['streets-only', 'all']).default('streets-only'),
  presence: z.strictObject({ renderRadius: z.number().positive().default(300), showOthersOnMinimap: z.boolean().default(false) }).prefault({}),
  /** SPEC §17.10: the current box's position is sent within `radius` m, taken away beyond radius + hysteresis. */
  boxReveal: z.strictObject({ radius: z.number().positive().default(150), hysteresis: z.number().min(0).default(20) }).prefault({}),
  penalties: z
    .strictObject({
      walkOnlyViolationMinutes: z.number().min(0).default(15),
      quitTaskMinutes: z.number().min(0).default(30),
      /** Phase 8 (SPEC §17.14): the Host's "Phạt" = a countdown before the team may answer again (task.retryLockMinutes overrides). */
      retryLockMinutes: z.number().min(0).default(3),
      /** Phase 8 (SPEC §17.16): "Đổi lựa chọn kép" = a countdown before the other branch's box shows (each switch). */
      branchSwitchLockMinutes: z.number().min(0).default(10),
    })
    .prefault({}),
  movement: z.strictObject({ footSpeed: z.number().positive().default(4), bikeSpeedMultiplier: z.number().positive().default(1.3) }).prefault({}),
  vehicles: z
    .strictObject({
      corridorMeters: z.number().positive().default(150),
      minDistanceFromCheckpoint: z.number().min(0).default(100),
      initialPerSegment: z.tuple([z.number().int().min(0), z.number().int().min(0)]).default([0, 1]),
      spawnIntervalMinutes: z.number().positive().default(3),
      spawnChance: z.number().min(0).max(1).default(0.3),
      maxAvailablePerSegment: z.number().int().min(0).default(1),
      decoyRatio: z.number().min(0).max(1).default(0.4),
      noSpawnNearPlayerMeters: z.number().min(0).default(120),
      abandonMeters: z.number().positive().default(200),
      abandonSeconds: z.number().positive().default(60),
      bikeParking: z.strictObject({ offsetMeters: z.number().min(0).default(20), maxBikes: z.number().int().min(1).default(6) }).prefault({}),
    })
    .prefault({}),
  clueBook: z.strictObject({ showLockedSlots: z.boolean().default(false) }).prefault({}),
  /** Phase 8 (SPEC §17.14): the Host page warns when a team has been on one challenge / branch this long (repeats every
   *  period until it is done); computed on the Host page, nothing in game. */
  hostAlerts: z.strictObject({ stuckMinutes: z.number().positive().default(45) }).prefault({}),
  /** SPEC §17.17: no Messenger / Facebook button in game: an old file's contactUrl / contactLabel are accepted and dropped.
   *  SPEC §17.23: no official time any more, so an old file's approvalWaitCounts is accepted and dropped too. */
  hostApproval: z
    .strictObject({ approvalWaitCounts: z.boolean().optional(), contactUrl: z.unknown().optional(), contactLabel: z.unknown().optional() })
    .transform(() => ({}))
    .prefault({}),
  /** SPEC §9 (Phase 9 adds the per-element parameters). */
  specials: z.strictObject({ uTurn: on(false), yield: on(false), fastForward: on(false), speedBump: on(false), expressPass: on(true) }).prefault({}),
  /** SPEC §17.12: where this leg starts (always from the file, never hard-coded). Teams arriving together are spread over
   *  `spreadMeters` around it, facing `yawDeg` (0 = north, + = turned left / west, like PlayerState.yaw). */
  start: z.strictObject({ name: text(), ...latLon, yawDeg: z.number().default(0), spreadMeters: z.number().min(0).max(20).default(5) }),
  steps: z.array(stepSchema).min(1).max(LEG_LIMITS.maxSteps),
});

/** A leg after parsing (defaults filled). */
export type Leg = z.output<typeof legSchema>;
/** A leg file as written (blocks with defaults may be missing). */
export type LegInput = z.input<typeof legSchema>;
export type Step = Leg['steps'][number];
export type RouteInfoStep = Extract<Step, { type: 'route_info' }>;
export type DetourStep = Extract<Step, { type: 'detour' }>;
export type ChallengeStep = Extract<Step, { type: 'challenge' }>;
export type PitStopStep = Extract<Step, { type: 'pit_stop' }>;
export type Destination = z.output<typeof destinationSchema>;
export type Task = z.output<typeof taskSchema>;
/** SPEC §17.44: one box of a `parts` task. */
export type TaskPart = NonNullable<Task['parts']>[number];
/** Leg 3: a detour branch's 3D room. */
export type TaskRoom = NonNullable<Task['room']>;
export type Branch = DetourStep['branches'][number];
export type Transport = z.output<typeof transportSchema>;
/** A parsed media item: {url: "https://…" | "r2:<name>", label}. */
export type MediaItem = Task['media'][number];
export type VehiclesConfig = Leg['vehicles'];
export type Announce = z.output<typeof announceSchema>;
