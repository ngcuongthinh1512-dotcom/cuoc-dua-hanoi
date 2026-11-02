// CETIQLO head-to-head room: every tunable in one place (docs/plans/cetiqlo.md §3). Server ms, room-local metres.
import { STORE } from '@race/shared/cetiqlo';

/** The red CHECKOUT square, room-local (same numbers as the store scene: shared STORE.checkout). The server tests a CIRCLE that
 *  contains the square (radius = half-diagonal), the client's own 'inside the square' test is the stricter one. */
export const CHECKOUT_ZONE = { x: STORE.checkout.x, z: STORE.checkout.z, radius: STORE.checkout.half * Math.SQRT2 } as const;
/** Where the server puts the teams of a match (team index → spot), room-local; yaw 0 = facing −z. */
export const START_SPOTS: readonly { x: number; z: number; yaw: number }[] = STORE.startSpots;
export const CETIQLO = {
  /** Teams per match. The pairing / ranking code is N-generic: raising it needs UI work only. */
  teamsPerMatch: 2,
  /** Items in the sample set (one per SlotKind: this must equal SLOTS.length). Also the floor of the `errors` formula. */
  itemsPerSet: 6,
  /** Delay between the pairing and the start of the pick phase. 0 = the mannequin shows the set the whole time. */
  memorizeMs: 0,
  /** The pick phase (3:00); the client counts it down from endsAt − serverNow. */
  pickMs: 180_000,
  /** The client turns the clock red + beeps this long before the end (client reads it from the same number; server ignores). */
  warnMs: 30_000,
  /** Points lost per error: score = max(0, 100 − penaltyPerError × errors). */
  penaltyPerError: 17,
  /** Teams allowed in the queue of one room (more `cq.join` are refused 'busy'). */
  maxTeamsInRoom: 12,
  /** The result screen stays this long: the next pairing waits for it. */
  resultHoldMs: 12_000,
  /** A disconnected team keeps its place (queue or match) this long. */
  graceReconnectMs: 20_000,
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
