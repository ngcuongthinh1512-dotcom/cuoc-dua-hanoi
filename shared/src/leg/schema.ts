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
/** SPEC §11 mini-game kinds (Phase 8 implements them; Phase 7 passes every task through the stub). */
export const TASK_KINDS = ['find_objects', 'delivery', 'observe_answer', 'cipher', 'photo_match', 'binocular_scan', 'timed_drive', 'memory_ui', 'answer', 'free'] as const;
export type TaskKind = (typeof TASK_KINDS)[number];
export const VERIFICATIONS = ['auto', 'host_approval'] as const;
export type Verification = (typeof VERIFICATIONS)[number];

const text = () => z.string().max(LEG_LIMITS.textMax);
const latLon = { lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180) };
const radius = z.number().min(LEG_LIMITS.radiusMin).max(LEG_LIMITS.radiusMax);
const stepId = z.string().regex(LEG_LIMITS.stepId);

/** A point with a geofence (SPEC §8.2): the clue box / mat stands at lat, lon; `radius` m around it is "at the point". */
export const destinationSchema = z.strictObject({
  name: text(),
  ...latLon,
  radius,
  /** SPEC §6.4: the bike rack next to the point (optional; `npm run leg:check` suggests one). */
  bikeParking: z.strictObject(latLon).optional(),
});

/** SPEC §6.5. */
export const transportSchema = z.union([z.strictObject({ allowed: z.literal('any') }), z.strictObject({ mandatory: z.literal('walk') })]);

/** SPEC §10.1 "Ý nghĩa các trường của task". `answers` never leave the server (SPEC §3). */
export const taskSchema = z.strictObject({
  title: text().default(''),
  description: text().default(''),
  media: z.array(z.string().max(500)).default([]),
  /** null = right at the point just reached; else somewhere else (its own geofence). */
  location: destinationSchema.nullable().default(null),
  kind: z.enum(TASK_KINDS).default('answer'),
  verification: z.enum(VERIFICATIONS).default('auto'),
  answers: z.array(z.string().max(200)).default([]),
  proofInstruction: text().default(''),
  timeLimitMinutes: z.number().positive().nullable().default(null),
  /** Mini-game parameters of kinds other than answer / free (object positions, target photo + heading, gates…: SPEC
   *  §11). Phase 7 stores them unchecked so a real leg can be written now; Phase 8 validates them per kind and decides
   *  what reaches the team (never sent in Phase 7: cardOf leaves them out, like `answers`). */
  params: z.record(z.string(), z.unknown()).optional(),
});

const routeInfo = z.strictObject({
  id: stepId,
  type: z.literal('route_info'),
  label: text(),
  clue: text(),
  transport: transportSchema.default({ allowed: 'any' }),
  destination: destinationSchema,
});
const branchSchema = z.strictObject({ id: stepId, name: text().default(''), summary: text().default(''), task: taskSchema.prefault({}) });
const detour = z.strictObject({
  id: stepId,
  type: z.literal('detour'),
  label: text(),
  clue: text().default(''),
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
const pitStop = z.strictObject({ id: stepId, type: z.literal('pit_stop'), label: text(), destination: destinationSchema });

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
  penalties: z.strictObject({ walkOnlyViolationMinutes: z.number().min(0).default(15), quitTaskMinutes: z.number().min(0).default(30) }).prefault({}),
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
  hostApproval: z
    .strictObject({ contactLabel: text().default('Gửi bài qua Facebook cho Host'), contactUrl: z.string().max(500).default(''), approvalWaitCounts: z.boolean().default(false) })
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
export type VehiclesConfig = Leg['vehicles'];
