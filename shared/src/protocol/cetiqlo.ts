// Leg 3 CETIQLO head-to-head room (docs/plans/cetiqlo.md §4, protocol v15). All server clocks are server ms (Date.now() of the Durable
// Object); a client counts its own clock from `endsAt - serverNow`. Messages exist only on actions (no per-tick traffic).

/** Client → server. x, z = the team's ROOM-LOCAL position in metres (the room frame is the client's), checked against the shelf /
 *  the CHECKOUT square (+ slack) like a pose the server cannot see (the pose channel carries world coordinates). */
export type CqClientMessage =
  | { t: 'cq.join' }
  | { t: 'cq.leave' }
  | { t: 'cq.take'; id: string; x: number; z: number }
  | { t: 'cq.drop'; id: string }
  | { t: 'cq.checkout'; x: number; z: number };

/** 'ok' right item, 'wrong' a wrong item picked in that set slot, 'missing' nothing for that slot, 'extra' a bag item beyond the set.
 *  CqTeamResult.marks = one mark per set position (set order), then one 'extra' per extra bag item. */
export type CqMark = 'ok' | 'wrong' | 'extra' | 'missing';
/** Why the winner won (the first criterion that told the teams apart). */
export type CqReason = 'completion' | 'score' | 'speed' | 'draw';

export interface CqPlayer { slot: number; name: string }
export interface CqMatchView {
  id: string;
  opp: CqPlayer; // the first opponent (2 teams per match)
  opps: CqPlayer[]; // every opponent (N-team ready)
  /** The sample set: 6 ids, one per SlotKind (sent at the start: the mannequin shows it to both teams). */
  set: string[];
  startAt: number;
  endsAt: number;
  serverNow: number;
  yourBag: string[];
  yourLocked: boolean;
  /** Every opponent has locked (2 teams: the opponent). Never says WHEN, nor what is in their bag. */
  oppLocked: boolean;
  oppDone: boolean;
}
export interface CqTeamResult {
  slot: number;
  name: string;
  bag: string[];
  marks: CqMark[];
  correct: number;
  /** Bag items that are not an exact set id (wrong variants + extras); missing ones are not counted. */
  errors: number;
  /** Points, 0–100, 1 decimal (16.67 per correct item, −9 per wrong or extra one). */
  score: number;
  /** Server epoch ms of the checkout (ms precision), null = never locked (not completed). */
  lockedAtMs: number | null;
}
export interface CqResult {
  t: 'cq.result';
  matchId: string;
  set: string[];
  you: CqTeamResult;
  opp: CqTeamResult;
  opps: CqTeamResult[];
  winner: 'you' | 'opp' | 'draw';
  reason: CqReason;
  startAt: number;
  serverNow: number;
  /** ms the result screen stays before the loser can be paired again. */
  holdMs: number;
}

export type CqRefusal = 'notInRoom' | 'notRunning' | 'locked' | 'unknown' | 'far' | 'full' | 'dup' | 'notInBag' | 'busy';

/** Server → client (per team; the opponent's bag is only ever inside `cq.result`). */
export type CqServerMessage =
  | {
      t: 'cq.state';
      phase: 'lobby' | 'match' | 'result';
      serverNow: number;
      /** lobby: 1-based place in the FIFO queue and its length. */
      queuePos?: number;
      queueLen?: number;
      match?: CqMatchView;
      /** Room-local start spot (match start / reconnect inside a match). */
      startSpot?: { x: number; z: number; yaw: number };
    }
  | { t: 'cq.bag'; bag: string[] }
  | { t: 'cq.opp'; locked: boolean }
  | CqResult
  /** The team won (or timed out as a loser): the step is done (the next clue card + exit ring come with the usual `race` view). */
  | { t: 'cq.advance'; matchId: string; /** 'win' (default when absent) = won the match; 'timeout' = a loser waited more than loserMaxWaitMs and is let go. */ reason?: 'win' | 'timeout' }
  | { t: 'cq.no'; op: 'join' | 'take' | 'drop' | 'checkout'; why: CqRefusal };

/** HostState.cetiqlo: read-only status per CETIQLO step. */
export interface CqHostRoom {
  step: string;
  /** `releaseInS`: a waiting loser is released (step done) after this many seconds. */
  queue: (CqPlayer & { releaseInS?: number })[];
  match: { id: string; endsAt: number; teams: (CqPlayer & { locked: boolean; bagN: number; online: boolean })[] } | null;
}
