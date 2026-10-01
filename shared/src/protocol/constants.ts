// Phase 6 (docs/plans/phase6.md §3): rates and limits BOTH sides must agree on. Client-only tunables stay in
// client/src/config.ts, race rules in the leg file (movement, presence, vehicles); these are the wire contract.
export const PROTOCOL_VERSION = 1;

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
  /** A `respawn` jump longer than this (m) is logged as suspicious (quay stairs / "Kẹt?" spots are nearer). */
  maxRespawnJump: 400,
  /** SPEC §17.10: the server compares each online team's last pose with its current clue box this often (one sqrt per
   *  team, no SQLite); radius + hysteresis come from the leg file (boxReveal). */
  boxCheckMs: 2_000,
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
} as const;
