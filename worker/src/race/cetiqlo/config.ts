// CETIQLO head-to-head room: every tunable in one place (docs/plans/cetiqlo.md §3). Server ms, room-local metres.
import { STORE } from '@race/shared/cetiqlo';

/** The red CHECKOUT square, room-local (same numbers as the store scene: shared STORE.checkout). The server tests a CIRCLE that
 *  contains the square (radius = half-diagonal), the client's own 'inside the square' test is the stricter one. */
export const CHECKOUT_ZONE = { x: STORE.checkout.x, z: STORE.checkout.z, radius: STORE.checkout.half * Math.SQRT2 } as const;
/** Where the server puts the teams of a match (team index → spot), room-local; yaw 0 = facing −z. */
export const START_SPOTS: readonly { x: number; z: number; yaw: number }[] = STORE.startSpots;
const ITEMS_PER_SET = 6;
export const CETIQLO = {
  /** Teams per match. The pairing / ranking code is N-generic: raising it needs UI work only. */
  teamsPerMatch: 2,
  /** Items in the sample set (one per SlotKind: this must equal SLOTS.length). Also the floor of the `errors` formula. */
  itemsPerSet: ITEMS_PER_SET,
  /** Delay between the pairing and the start of the pick phase. 0 = the mannequin shows the set the whole time. */
  memorizeMs: 0,
  /** The pick phase (3:30, owner 2026-11-03); the client counts it down from endsAt − serverNow. */
  pickMs: 210_000,
  /** The client turns the clock red + beeps this long before the end (client reads it from the same number; server ignores). */
  warnMs: 30_000,
  /** Owner rule (2026-11-02), in POINTS (100 = a perfect bag): each correct item earns pointsPerCorrect (100 / 6 = 16.67); each bag item that is
   *  NOT an exact id of the set (a wrong variant or an extra) costs penaltyPerWrongOrExtra; missing items just earn nothing. Clamped 0–100. */
  pointsPerCorrect: 100 / ITEMS_PER_SET,
  penaltyPerWrongOrExtra: 8,
  /** Teams allowed in one room at a time (queue + match; more `cq.join` are refused 'busy'); also the board's row count. */
  maxTeamsInRoom: 11,
  /** The result screen stays this long: the next pairing waits for it. */
  resultHoldMs: 12_000,
  /** Owner rule (2026-11-03): ANY team that has waited this long in the queue without an opponent — since it joined the queue, or since its
   *  last result when it played without winning (lost / drew / left behind) — is released: the step completes as for a win (cq.advance
   *  reason 'timeout'). A team in a running match is never released; playing again restarts the clock from the next result. */
  maxWaitMs: 600_000,
  /** A `take` must come from within takeRange of the shelf (+ takeSlackM for the client's rounding / the pose lag). */
  takeRange: 3.5,
  takeSlackM: 1.5,
  /** `checkout` must come from within the CHECKOUT_ZONE radius (+ this). */
  checkoutSlackM: 1,
  /** Bag cap against spam. */
  bagMax: 24,
  /** A team's take / drop / checkout closer than this to its previous one is ignored (rate limit). */
  actionCooldownMs: 100,
} as const;
