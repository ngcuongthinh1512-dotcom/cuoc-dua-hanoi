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

/** 'ok' right item, 'wrong' a bag item that is not an exact set id (a wrong variant of that slot, or anything beyond the 6 slots: the
 *  owner's "chuyển thừa = sai"), 'missing' nothing for that slot. CqTeamResult.marks = one mark per set position (set order), then one
 *  'wrong' per further bag item. */
export type CqMark = 'ok' | 'wrong' | 'missing';
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
  /** Reading time before the 5-4-3-2-1 (absent = none): the pair stands on the mat reading the how-to until startAt − countdownMs. */
  readMs?: number;
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
  /** Bag items that are not an exact set id (all counted as wrong); missing ones are not counted. */
  errors: number;
  /** Points, ≤ 100 (no lower bound: can be negative), 1 decimal (16.67 per correct item, −8 per wrong one). */
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
      /** lobby / result, any queued team: server ms when it is let go without an opponent (maxWaitMs after it joined the queue / its last result). */
      waitUntil?: number;
    }
  | { t: 'cq.bag'; bag: string[] }
  | { t: 'cq.opp'; locked: boolean }
  | CqResult
  /** The team won (or waited too long): the step is done (the next clue card + exit ring come with the usual `race` view). */
  | { t: 'cq.advance'; matchId: string; /** 'win' (default when absent) = won the match; 'timeout' = waited more than maxWaitMs and is let go ('' matchId when it never played). */ reason?: 'win' | 'timeout' }
  | { t: 'cq.no'; op: 'join' | 'take' | 'drop' | 'checkout'; why: CqRefusal }
  /** The waiting-room LIVE BOARD (v16): every team that entered this room, FIFO by arrival (`order` 1..maxTeamsInRoom), sent to the whole
   *  room (queue + match) on every queue / match change and to a (re)joining team. The two in the match are 'playing'; 'waiting' never
   *  played yet; 'lost' / 'drew' played without winning (lost / a double draw) and waits for the next team; 'won' = the winner during the
   *  result hold; 'done' = left the room (won / let go / passed by the Host). `waitUntil` only on queued rows (the maxWaitMs clock). */
  | { t: 'cq.board'; rows: CqBoardRow[]; serverNow: number }
  /** Leg 3 (spectators + Host only, never a team): the room as a viewer sees it, on every change: the board rows and the running match (who plays,
   *  what each team carries, who locked, the clock). `match` null = no match running. */
  | CqWatch;

export interface CqWatch {
  t: 'cq.watch';
  step: string;
  serverNow: number;
  rows: CqBoardRow[];
  match: { id: string; startAt?: number; readMs?: number; endsAt: number; teams: (CqPlayer & { locked: boolean; bag: string[] })[] } | null;
}

export type CqBoardStatus = 'playing' | 'waiting' | 'lost' | 'drew' | 'won' | 'done';
export interface CqBoardRow extends CqPlayer {
  /** 1-based arrival order in this room. */
  order: number;
  status: CqBoardStatus;
  /** 1-based place in the queue (waiting / lost rows). */
  queuePos?: number;
  /** Server ms when a queued team is let go without an opponent. */
  waitUntil?: number;
}

/** HostState.cetiqlo: read-only status per CETIQLO step. */
export interface CqHostRoom {
  step: string;
  /** `releaseInS`: a queued team is released (step done) after this many seconds without an opponent (maxWaitMs). */
  queue: (CqPlayer & { releaseInS?: number })[];
  /** `startAt`: the pick phase starts (the 5-4-3-2-1 countdown runs before it). */
  match: { id: string; startAt?: number; readMs?: number; endsAt: number; teams: (CqPlayer & { locked: boolean; bagN: number; online: boolean })[] } | null;
}
