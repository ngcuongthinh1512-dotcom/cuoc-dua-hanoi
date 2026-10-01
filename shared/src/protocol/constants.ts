// Phase 6 (docs/plans/phase6.md §3): rates and limits BOTH sides must agree on. Client-only tunables stay in
// client/src/config.ts, race rules in the leg file (movement, presence, vehicles); these are the wire contract.
// 2 = Phase 7 race engine (race / book / zone messages, welcome.race / startOrder / start, BoxInfo.r).
export const PROTOCOL_VERSION = 2;

export const NET = {
  /** Client → server pose rate (SPEC §3: 5 Hz, only when the rounded pose changed). */
  sendHz: 5,
  /** Server broadcast rate: one tick message per client per 200 ms, skipped when nobody moved. */
  tickHz: 5,
  /** Players this far (m) from a client are not in its ticks (SPEC §7: interest radius; also hides the route). */
  interestRadius: 500,
  /** Last poses of ALL teams = one upserted SQLite row this often (SPEC §3); also at once on a disconnect (§8.10). */
  snapshotMs: 2_000,
  /** Replay log: one row this often. */
  replayMs: 10_000,
  /** No pose message from anyone for this long → the tick loop stops so the Durable Object can hibernate. */
  idleStopMs: 10_000,
  /** Server speed check (SPEC §13.9): path length over this window vs the allowed speed × tolerance (TODO.md: single
   *  KCC steps reach 4.8 m/s at footSpeed 4; judge a window, not a step). */
  speedWindowMs: 3_000,
  speedTolerance: 1.25,
  /** Speed-window stamps (server ms) may run this far ahead of the server clock: a burst of poses after a network stall
   *  of up to this long is spread back over the time it covered; a client sending faster than sendHz banks no more. */
  speedLeadMs: 2_000,
  /** Teleports = `respawn`s + the part of a (re)connect / first pose's jump the time unseen does not explain (at bike
   *  speed). Within respawnWindowMs, more than maxRespawns of them or more than maxRespawnJump m in all → suspicious
   *  (flagged); events only up to maxRespawns (a client spamming respawns cannot burn the SQLite row budget). Quay
   *  stairs / "Kẹt?" spots and the spawn offset are far nearer. */
  maxRespawnJump: 400,
  maxRespawns: 6,
  respawnWindowMs: 60_000,
  /** SQLite row budget vs a modified client: per team and respawnWindowMs, `speed` events stop after maxRespawns (still
   *  flagged), and bike ops (claim / mount / dismount, each may write a row) past maxBikeOps close the socket (CLOSE.tooFast). */
  maxBikeOps: 12,
  /** SPEC §17.10: the server compares each online team's last pose with its current clue box this often (one sqrt per
   *  team, no SQLite); radius + hysteresis come from the leg file (boxReveal). */
  boxCheckMs: 2_000,
  /** Phase 7 (D4): a respawn this short (quay stairs, "Kẹt?" safe spot, fell through) moves the trusted point at once;
   *  a longer one only at the trust rate (TrustedPoint), and is a teleport. */
  respawnTrust: 30,
  /** Phase 7: m added to a geofence radius when the server judges an op (open / task / checkin) against the last valid
   *  pose: the pose is ≤ 200 ms old (≈ 1 m at bike speed) and the box stands at the zone's centre anyway. */
  geofenceSlack: 2,
  /** Message limits: a player frame (pose 31 B, JSON ops < 200 B) and a Host frame (spawn candidates). Over → closed. */
  maxPlayerBytes: 1_024,
  maxHostBytes: 262_144,
  /** Messages per second per socket beyond which the socket is closed (5 Hz poses + a few ops; abuse guard). */
  maxMessagesPerSec: 15,
  /** Keepalive: the client sends this string, the DO answers the other without waking (setWebSocketAutoResponse,
   *  not billed); the round trip is the client's ping. */
  ping: 'ping',
  pong: 'pong',
  pingMs: 5_000,
  /** A socket with no message and no keepalive ping for this long is closed (CLOSE.silent) and its team goes offline. */
  deadSocketMs: 30_000,
  /** Server beat for the slower chores while the tick loop runs: host.state push (at most this often, only after a
   *  change), bike abandonment, dead sockets, one replay sample. */
  slowTickMs: 1_000,
  /** Login tokens (HMAC with HOST_PASSWORD) live this long: one race day. */
  tokenTtlMs: 24 * 3_600_000,
  /** SPEC §8.10: 5 wrong team codes in a row → that client waits 60 s. */
  loginAttempts: 5,
  loginLockMs: 60_000,
  /** Team codes: 6 chars, no 0 / O / 1 / I (SPEC §7). */
  codeLength: 6,
  codeAlphabet: 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
} as const;

/** WebSocket close codes the server uses (4000–4999 = application). */
export const CLOSE = {
  badToken: 4401,
  otherDevice: 4409,
  tooBig: 4413,
  tooFast: 4429,
  badMessage: 4400,
  raceClosed: 4410,
  /** No message / ping for NET.deadSocketMs. */
  silent: 4408,
} as const;
