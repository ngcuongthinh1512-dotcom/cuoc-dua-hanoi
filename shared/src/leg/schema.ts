// Leg file schema (SPEC §10, adapted by §17.12: NO Roadblock / `roadblock` step). zod, server + CLI only: the client
// never imports this module at runtime (only `import type`), so zod stays out of the game bundle; leg content itself
// never leaves the Worker (SPEC §3). docs/plans/phase7.md §3 D11–D13; the user-facing description is docs/LEG_FORMAT.md.
// Every block except id / title / start / steps has defaults (the demo leg's values), so a hand-written leg stays short.
import { z } from 'zod';
import { LOUVRE } from '../constants.ts';

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
export const TASK_KINDS = ['find_objects', 'delivery', 'observe_answer', 'cipher', 'photo_match', 'binocular_scan', 'timed_drive', 'memory_ui', 'answer', 'free', 'louvre'] as const;
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

/** Phase 8B (SPEC §17.19, docs/plans/phase8b.md §B): the Louvre room ("Thử thách 3"). The 5 right ids are task.answers
 *  (server-only); notes and credits never reach a team before it finished (§17.20). */
export { LOUVRE }; // Phase 8B: lives in ../constants.ts (zod-free: the client reads the counts too)
/** SPEC §17.19 (a) / §17.20: allowed licences of an artwork's picture / scan. Never ND, "personal use only" or unknown. */
export const ART_LICENSES = ['PD', 'PD-Art', 'CC0', 'CC-BY', 'CC-BY-SA', 'CC-BY-NC', 'CC-BY-NC-SA', 'MIT'] as const;
export type ArtLicense = (typeof ART_LICENSES)[number];

const artwork = z.strictObject({
  id: z.string().regex(LOUVRE.artId),
  /** painting = a frame on the wall; sculpture = a plinth near the wall (a photo standing on it, or a .glb scan). */
  type: z.enum(['painting', 'sculpture']).default('painting'),
  /** '' = not there yet: the room draws a numbered placeholder. */
  image: z.union([z.string().regex(LOUVRE.artFile), z.literal('')]).default(''),
  /** Host / author only (where the real one is…): NEVER sent to any client. */
  note: text().default(''),
  /** §17.20 "Ghi nguồn": server-only, sent ({t:'credits'}) only to a team that finished / once the race is over. */
  credit: z
    .strictObject({
      title: text(),
      artist: text().default(''),
      /** Author of the photo / scan. */
      photo: text().default(''),
      license: z.enum(ART_LICENSES),
      source: z.union([z.string().max(500).regex(/^https?:\/\/\S+$/), z.literal('')]).default(''),
    })
    .optional(),
});

/** Phase 8B: the `louvre` block of a task of kind "louvre" (layout of the room: client config `louvreRoom`; where: under
 *  the box of the route just before, facing its destination.yawDeg). */
export const louvreSchema = z.strictObject({
  /** Order = order around the walls (the author shuffles; leg:check warns when the 5 answers sit together). */
  artworks: z.array(artwork).length(LOUVRE.artworks),
  /** Minutes after task_started_at (= the previous route's box opened): "Đáp án bao gồm 5 tác phẩm" + max 5 picks, then
   *  "Đúng x/5" (live). */
  hints: z.strictObject({ countAtMinutes: z.number().positive().default(40), correctAtMinutes: z.number().positive().default(60) }).prefault({}),
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
  proofInstruction: text().default(''),
  timeLimitMinutes: z.number().positive().nullable().default(null),
  /** Mini-game parameters of kinds other than answer / free (object positions, target photo + heading, gates…: SPEC
   *  §11). Phase 7 stores them unchecked so a real leg can be written now; Phase 8 validates them per kind and decides
   *  what reaches the team (never sent in Phase 7: cardOf leaves them out, like `answers`). */
  params: z.record(z.string(), z.unknown()).optional(),
  /** Phase 8B: kind "louvre" only (answers = the 5 right artwork ids; a wrong lock = retryLockMinutes). */
  louvre: louvreSchema.optional(),
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
});
const branchSchema = z.strictObject({ id: stepId, name: text().default(''), summary: text().default(''), task: taskSchema.prefault({}) });
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
  movement: z.strictObject({ footSpeed: z.number().positive().default(4), bikeSpeedMultiplier: z.number().positive().default(1.5) }).prefault({}),
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
export type Branch = DetourStep['branches'][number];
export type Transport = z.output<typeof transportSchema>;
/** A parsed media item: {url: "https://…" | "r2:<name>", label}. */
export type MediaItem = Task['media'][number];
export type VehiclesConfig = Leg['vehicles'];
export type LouvreTask = z.output<typeof louvreSchema>;
export type Artwork = LouvreTask['artworks'][number];
export type ArtCredit = NonNullable<Artwork['credit']>;
export type Announce = z.output<typeof announceSchema>;
