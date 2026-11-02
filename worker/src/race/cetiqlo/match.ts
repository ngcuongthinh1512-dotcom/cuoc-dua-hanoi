// CETIQLO head-to-head: the PURE state machine (docs/plans/cetiqlo.md §5). No SQLite, no sockets, no clock of its own: every function
// gets `now` (server ms) and returns new state. JSON-able, so index.ts keeps the whole room in one meta row.
import type { CatalogItem, SlotKind } from '@race/shared/cetiqlo';
import type { CqMark, CqReason, CqRefusal } from '@race/shared/protocol';
import { CETIQLO } from './config.ts';

export const SLOTS: readonly SlotKind[] = ['top', 'outer', 'bottom', 'shoes', 'bag', 'acc'];
export type Cfg = typeof CETIQLO;
export interface Zone { x: number; z: number; radius: number }

export interface Match {
  id: string;
  teams: string[];
  /** The sample set: SLOTS order, one item per kind. */
  set: string[];
  seed: number;
  startAt: number;
  endsAt: number;
  bags: Record<string, string[]>;
  /** team → server epoch ms of its checkout (ms precision). */
  locked: Record<string, number>;
  /** Teams that did not come back within the grace period: ranked as they stand, never rejoin this match. */
  gone: string[];
  state: 'running' | 'done';
}
export interface Room {
  /** FIFO of teams waiting (front = next). */
  queue: string[];
  match: Match | null;
  /** No new pairing before this (the result screen). */
  holdUntil: number;
  /** team → the opponents of its last match (no immediate rematch while somebody else waits). */
  last: Record<string, string[]>;
  seq: number;
}
export const newRoom = (): Room => ({ queue: [], match: null, holdUntil: 0, last: {}, seq: 0 });

// ── set ──
/** mulberry32: a tiny seeded PRNG (same seed → same set, so a match can be replayed from SQLite). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One random item per SlotKind (SLOTS order). Throws when the catalog has no item for a kind. */
export function makeSet(seed: number, catalog: readonly CatalogItem[]): string[] {
  const r = rng(seed);
  return SLOTS.map((kind) => {
    const pool = catalog.filter((i) => i.slot === kind);
    if (!pool.length) throw new Error(`CETIQLO catalog has no item for slot ${kind}`);
    return pool[Math.floor(r() * pool.length)]!.id;
  });
}

// ── queue ──
/** The teams of the next match: the first eligible one, then the next eligible ones that did not just play it (a rematch only when
 *  nobody else waits); null = fewer than n eligible. */
export function pairNext(queue: readonly string[], last: Readonly<Record<string, string[]>>, n: number, eligible: (t: string) => boolean = () => true): string[] | null {
  const ok = queue.filter(eligible);
  if (ok.length < n) return null;
  const first = ok[0]!;
  const rest = ok.slice(1);
  const fresh = (t: string) => !last[first]?.includes(t) && !last[t]?.includes(first);
  return [first, ...[...rest.filter(fresh), ...rest.filter((t) => !fresh(t))].slice(0, n - 1)];
}

/** Queue a team at the back (no-op when it already waits or plays). */
export const join = (room: Room, team: string): Room => {
  const playing = room.match?.state === 'running' && room.match.teams.includes(team);
  return room.queue.includes(team) || playing ? room : { ...room, queue: [...room.queue, team] };
};
export const leave = (room: Room, team: string): Room => ({ ...room, queue: room.queue.filter((t) => t !== team) });

/** Pairing due: no running match, the result screen over, n eligible teams. Returns the room with the match started, or null. */
export function startNext(room: Room, now: number, seed: number, catalog: readonly CatalogItem[], eligible: (t: string) => boolean = () => true, cfg: Cfg = CETIQLO): Room | null {
  if (room.match?.state === 'running' || now < room.holdUntil) return null;
  const teams = pairNext(room.queue, room.last, cfg.teamsPerMatch, eligible);
  if (!teams) return null;
  const startAt = now + cfg.memorizeMs;
  const seq = room.seq + 1;
  const match: Match = {
    id: `m${seq}`, teams, set: makeSet(seed, catalog), seed, startAt, endsAt: startAt + cfg.pickMs,
    bags: Object.fromEntries(teams.map((t) => [t, []])), locked: {}, gone: [], state: 'running',
  };
  return { ...room, seq, match, queue: room.queue.filter((t) => !teams.includes(t)) };
}

// ── actions ──
export type Done<T> = ({ ok: true } & T) | { ok: false; why: CqRefusal };
const refuse = (why: CqRefusal): { ok: false; why: CqRefusal } => ({ ok: false, why });
const active = (m: Match, team: string, now: number): CqRefusal | null =>
  m.state !== 'running' || !m.teams.includes(team) || now < m.startAt || now >= m.endsAt || m.gone.includes(team) ? 'notRunning' : team in m.locked ? 'locked' : null;
const dist = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);

/** F on an item: running, not locked, the item exists, the team's room-local position within takeRange (+ slack) of its shelf, bag cap, no duplicate. */
export function take(m: Match, team: string, id: string, at: { x: number; z: number }, byId: ReadonlyMap<string, CatalogItem>, now: number, cfg: Cfg = CETIQLO): Done<{ match: Match }> {
  const why = active(m, team, now);
  if (why) return refuse(why);
  const item = byId.get(id);
  if (!item) return refuse('unknown');
  if (dist(at, item.shelf) > cfg.takeRange + cfg.takeSlackM) return refuse('far');
  const bag = m.bags[team]!;
  if (bag.includes(id)) return refuse('dup');
  if (bag.length >= cfg.bagMax) return refuse('full');
  return { ok: true, match: { ...m, bags: { ...m.bags, [team]: [...bag, id] } } };
}

export function drop(m: Match, team: string, id: string, now: number): Done<{ match: Match }> {
  const why = active(m, team, now);
  if (why) return refuse(why);
  const bag = m.bags[team]!;
  if (!bag.includes(id)) return refuse('notInBag');
  return { ok: true, match: { ...m, bags: { ...m.bags, [team]: bag.filter((x) => x !== id) } } };
}

/** The checkout: inside the CHECKOUT square (+ slack), before endsAt; locks the bag, the time is `now` to the ms. */
export function checkout(m: Match, team: string, at: { x: number; z: number }, zone: Zone, now: number, cfg: Cfg = CETIQLO): Done<{ match: Match }> {
  const why = active(m, team, now);
  if (why) return refuse(why);
  if (dist(at, zone) > zone.radius + cfg.checkoutSlackM) return refuse('far');
  return { ok: true, match: { ...m, locked: { ...m.locked, [team]: now } } };
}

export const markGone = (m: Match, team: string): Match => (m.teams.includes(team) && !m.gone.includes(team) ? { ...m, gone: [...m.gone, team] } : m);
/** Every team has locked or is gone, or the time is up. */
export const finished = (m: Match, now: number): boolean => m.state === 'running' && (now >= m.endsAt || m.teams.every((t) => t in m.locked || m.gone.includes(t)));

// ── score / rank ──
export interface Score { correct: number; errors: number; scorePct: number; marks: CqMark[] }
/** correct = bag items that are in the set; errors = max(itemsPerSet, bag size) − correct; score = max(0, 100 − penalty × errors).
 *  marks: one per set position ('ok' / 'wrong' = an item of that slot but not the right one / 'missing'), then 'extra' for every bag item
 *  that fills no slot. */
export function score(set: readonly string[], bag: readonly string[], slotOf: (id: string) => SlotKind | undefined, cfg: Cfg = CETIQLO): Score {
  const correct = bag.filter((id, i) => set.includes(id) && bag.indexOf(id) === i).length;
  const errors = Math.max(cfg.itemsPerSet, bag.length) - correct;
  const marks: CqMark[] = set.map((id) => (bag.includes(id) ? 'ok' : 'missing'));
  const extra: CqMark[] = [];
  for (const id of bag) {
    if (set.includes(id)) continue;
    const k = slotOf(id);
    const j = k ? set.findIndex((s, i) => slotOf(s) === k && marks[i] === 'missing') : -1;
    if (j >= 0) marks[j] = 'wrong';
    else extra.push('extra');
  }
  return { correct, errors, scorePct: Math.max(0, 100 - cfg.penaltyPerError * errors), marks: [...marks, ...extra] };
}

export interface TeamScore extends Score { team: string; bag: string[]; lockedAtMs: number | null }
const cmp = (a: TeamScore, b: TeamScore): { d: number; why: CqReason } => {
  const ca = a.lockedAtMs !== null, cb = b.lockedAtMs !== null;
  if (ca !== cb) return { d: ca ? -1 : 1, why: 'completion' };
  if (a.scorePct !== b.scorePct) return { d: b.scorePct - a.scorePct, why: 'score' };
  if (ca && a.lockedAtMs !== b.lockedAtMs) return { d: a.lockedAtMs! - b.lockedAtMs!, why: 'speed' };
  return { d: 0, why: 'draw' };
};

/** plan §0 ranking, N teams: (1) completed beats not completed; (2) both completed → higher score, tie → earlier checkout;
 *  (3) neither completed → higher score (the bag at the time-up), tie → equal. Returns groups of tied teams, best first, and why the
 *  best group beat the next (or 'draw' when the best group has several teams / is alone). */
export function rank(scores: readonly TeamScore[]): { groups: TeamScore[][]; reason: CqReason } {
  const sorted = [...scores].sort((a, b) => cmp(a, b).d);
  const groups: TeamScore[][] = [];
  for (const s of sorted) {
    const g = groups.at(-1);
    if (g && cmp(g[0]!, s).d === 0) g.push(s);
    else groups.push([s]);
  }
  const reason: CqReason = groups[0]!.length > 1 || groups.length < 2 ? 'draw' : cmp(groups[0]![0]!, groups[1]![0]!).why;
  return { groups, reason };
}

export interface Settlement {
  scores: TeamScore[];
  /** The sole best team (or none). */
  winners: string[];
  /** Tied best teams (a draw). */
  draw: string[];
  /** The others, best first. */
  losers: string[];
  reason: CqReason;
}
export function settle(m: Match, slotOf: (id: string) => SlotKind | undefined, cfg: Cfg = CETIQLO): Settlement {
  const scores: TeamScore[] = m.teams.map((team) => {
    const bag = m.bags[team]!;
    return { team, bag, lockedAtMs: m.locked[team] ?? null, ...score(m.set, bag, slotOf, cfg) };
  });
  const { groups, reason } = rank(scores);
  const top = groups[0]!.map((s) => s.team);
  return {
    scores, reason, winners: top.length === 1 ? top : [], draw: top.length > 1 ? top : [],
    losers: groups.slice(1).flat().map((s) => s.team),
  };
}

/** The room after a settled match (plan §1.4): the winner leaves the queue, the losers go back to the FRONT (best first), a draw's
 *  teams to the BACK; the results screen holds the next pairing for resultHoldMs. Gone teams drop out. */
export function finish(room: Room, m: Match, s: Settlement, now: number, cfg: Cfg = CETIQLO): Room {
  const gone = (t: string) => m.gone.includes(t);
  const rest = room.queue.filter((t) => !m.teams.includes(t));
  return {
    ...room,
    match: { ...m, state: 'done' },
    queue: [...s.losers.filter((t) => !gone(t)), ...rest, ...s.draw.filter((t) => !gone(t))],
    last: { ...room.last, ...Object.fromEntries(m.teams.map((t) => [t, m.teams.filter((o) => o !== t)])) },
    holdUntil: now + cfg.resultHoldMs,
  };
}
