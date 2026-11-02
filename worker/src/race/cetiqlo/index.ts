// CETIQLO head-to-head room service (docs/plans/cetiqlo.md §4 / §5): glue between the pure state machine (match.ts) and the Durable
// Object (RaceRoom owns the sockets, SQLite and the alarm; this class gets them through CqIO). One Room per CETIQLO step id. Every
// transition: state saved (1 meta row) BEFORE any message goes out; messages only on actions (no per-tick traffic).
import type { CatalogItem } from '@race/shared/cetiqlo';
import type { CqHostRoom, CqMatchView, CqPlayer, CqResult, CqServerMessage, CqTeamResult } from '@race/shared/protocol';
import { CATALOG_SOURCE } from './catalogSource.ts';
import { CETIQLO, CHECKOUT_ZONE, START_SPOTS } from './config.ts';
import { checkout, drop, dueRelease, finish, finished, join, leave, markGone, newRoom, release, settle, startNext, take, type Cfg, type Match, type Room, type Settlement } from './match.ts';

let injected: readonly CatalogItem[] | null = null;
/** The catalog the server plays with; a test may inject a fixture (null = back to the real one). */
export const setCatalog = (c: readonly CatalogItem[] | null) => void (injected = c);
export const getCatalog = (): readonly CatalogItem[] => injected ?? CATALOG_SOURCE;

export interface CqIO {
  load(): string | undefined;
  /** Persist (one SQLite row); synchronous, before the caller sends anything. */
  save(json: string): void;
  send(team: string, m: CqServerMessage): void;
  online(team: string): boolean;
  who(team: string): CqPlayer;
  /** The CETIQLO step the team is on right now (its card is a not-done challenge with room 'cetiqlo'), null = none. */
  stepOf(team: string): string | null;
  /** The team won its match: complete the step (next clue card), through the engine's usual path. */
  win(team: string, step: string, now: number): void;
  /** A waiting loser timed out (loserMaxWaitMs): complete the step like a win, with the note "Chờ quá 10 phút, được rời đi" (undoable by the Host). */
  release(team: string, step: string, now: number): void;
  setAlarm(at: number): void;
  event(t: number, team: string | null, type: string, data: object): void;
}

interface Saved { rooms: Record<string, Room>; released: Record<string, string> }

export class Cetiqlo {
  private rooms: Record<string, Room> = {};
  /** team → step it was released from (timeout); it never re-queues there, unless the Host's undo puts it back on the step. */
  private released: Record<string, string> = {};
  private readonly acted = new Map<string, number>();
  private byIdFor: { cat: readonly CatalogItem[]; map: Map<string, CatalogItem> } | null = null;

  constructor(private readonly io: CqIO, private readonly catalog: () => readonly CatalogItem[] = getCatalog, private readonly cfg: Cfg = CETIQLO, private readonly seed: () => number = () => crypto.getRandomValues(new Uint32Array(1))[0]!) {
    const raw = io.load();
    if (raw) Object.assign(this, JSON.parse(raw) as Saved);
  }

  private get byId(): Map<string, CatalogItem> {
    const cat = this.catalog();
    if (this.byIdFor?.cat !== cat) this.byIdFor = { cat, map: new Map(cat.map((i) => [i.id, i])) };
    return this.byIdFor.map;
  }
  private slotOf = (id: string) => this.byId.get(id)?.slot;
  private save() {
    this.io.save(JSON.stringify({ rooms: this.rooms, released: this.released } satisfies Saved));
  }
  /** Pairing skips OFFLINE teams (they keep their place and pair as soon as they are back); no time limit (owner: no 20 s rule). */
  private eligible = (t: string) => this.io.online(t);

  /** The room (step id) a team queues in or plays in. */
  private where(team: string): { step: string; room: Room } | null {
    for (const [step, room] of Object.entries(this.rooms)) if (room.queue.includes(team) || (room.match?.state === 'running' && room.match.teams.includes(team) && !room.match.gone.includes(team))) return { step, room };
    return null;
  }
  private no(team: string, op: 'join' | 'take' | 'drop' | 'checkout', why: Extract<CqServerMessage, { t: 'cq.no' }>['why']) {
    this.io.send(team, { t: 'cq.no', op, why });
  }

  // ── views ──
  private matchView(m: Match, team: string, now: number): CqMatchView {
    const opps = m.teams.filter((t) => t !== team);
    const lockedAll = opps.every((t) => t in m.locked);
    return {
      id: m.id, opp: this.io.who(opps[0]!), opps: opps.map((t) => this.io.who(t)), set: m.set, startAt: m.startAt, endsAt: m.endsAt, serverNow: now,
      yourBag: m.bags[team]!, yourLocked: team in m.locked, oppLocked: lockedAll, oppDone: opps.every((t) => t in m.locked || m.gone.includes(t)),
    };
  }
  private state(step: string, team: string, now: number): CqServerMessage {
    const room = this.rooms[step]!;
    const m = room.match;
    if (m?.state === 'running' && m.teams.includes(team)) {
      return { t: 'cq.state', phase: 'match', serverNow: now, match: this.matchView(m, team, now), startSpot: START_SPOTS[m.teams.indexOf(team)] ?? START_SPOTS[0]! };
    }
    const i = room.queue.indexOf(team);
    const hold = m?.state === 'done' && m.teams.includes(team) && now < room.holdUntil;
    const lost = room.lost?.[team];
    return { t: 'cq.state', phase: hold ? 'result' : 'lobby', serverNow: now, queuePos: i + 1, queueLen: room.queue.length, ...(lost ? { loserWaitUntil: lost.at + this.cfg.loserMaxWaitMs } : {}) };
  }
  /** A (re)joining / reconnecting team: its result again while the screen still holds (then the state). */
  private resend(step: string, team: string, now: number) {
    const st = this.state(step, team, now), r = this.rooms[step]!.results?.[team];
    if (st.t === 'cq.state' && st.phase === 'result' && r) this.io.send(team, r as CqResult);
    this.io.send(team, st);
  }
  private sendQueue(step: string, now: number) {
    for (const t of this.rooms[step]!.queue) this.io.send(t, this.state(step, t, now));
  }

  // ── client messages ──
  join(team: string, now: number) {
    this.tick(now);
    const step = this.io.stepOf(team);
    if (!step) return this.no(team, 'join', 'notInRoom');
    const old = this.where(team);
    if (old && old.step !== step) this.rooms[old.step] = leave(old.room, team);
    const room = this.rooms[step] ?? newRoom();
    if (!old && room.queue.length + (room.match?.state === 'running' ? room.match.teams.length : 0) >= this.cfg.maxTeamsInRoom) return this.no(team, 'join', 'busy');
    this.rooms[step] = join(room, team);
    this.save();
    this.resend(step, team, now);
    this.afterChange(step, now);
  }

  leave(team: string, now: number) {
    this.tick(now);
    const w = this.where(team);
    if (!w) return;
    this.rooms[w.step] = leave(w.room, team);
    if (this.rooms[w.step]!.results?.[team]) delete this.rooms[w.step]!.results![team];
    if (w.room.match?.state === 'running' && w.room.match.teams.includes(team)) this.rooms[w.step]!.match = markGone(w.room.match, team);
    this.save();
    this.afterChange(w.step, now);
  }

  take(team: string, id: string, x: number, z: number, now: number) {
    this.tick(now);
    if (this.cooling(team, now)) return;
    const w = this.where(team);
    if (!w?.room.match) return this.no(team, 'take', 'notRunning');
    const r = take(w.room.match, team, id, { x, z }, this.byId, now, this.cfg);
    if (!r.ok) return this.no(team, 'take', r.why);
    this.update(w.step, r.match);
    this.io.send(team, { t: 'cq.bag', bag: r.match.bags[team]! });
  }

  drop(team: string, id: string, now: number) {
    this.tick(now);
    if (this.cooling(team, now)) return;
    const w = this.where(team);
    if (!w?.room.match) return this.no(team, 'drop', 'notRunning');
    const r = drop(w.room.match, team, id, now);
    if (!r.ok) return this.no(team, 'drop', r.why);
    this.update(w.step, r.match);
    this.io.send(team, { t: 'cq.bag', bag: r.match.bags[team]! });
  }

  checkout(team: string, x: number, z: number, now: number) {
    this.tick(now);
    const w = this.where(team);
    if (!w?.room.match) return this.no(team, 'checkout', 'notRunning');
    const r = checkout(w.room.match, team, { x, z }, CHECKOUT_ZONE, now, this.cfg);
    if (!r.ok) return this.no(team, 'checkout', r.why);
    this.update(w.step, r.match);
    this.io.event(now, team, 'cq.checkout', { step: w.step, match: r.match.id, bag: r.match.bags[team] });
    this.io.send(team, this.state(w.step, team, now));
    for (const t of r.match.teams) if (t !== team && !r.match.gone.includes(t)) this.io.send(t, { t: 'cq.opp', locked: t !== team && r.match.teams.filter((o) => o !== t).every((o) => o in r.match.locked) });
    this.tick(now); // everyone locked → the result now
  }

  private cooling(team: string, now: number): boolean {
    const last = this.acted.get(team);
    this.acted.set(team, now);
    return last !== undefined && now - last < this.cfg.actionCooldownMs;
  }
  private update(step: string, match: Match) {
    this.rooms[step] = { ...this.rooms[step]!, match };
    this.save();
  }

  // ── presence (owner, 2026-11-03: no 20 s grace rule — being offline never costs the place, the match, the bag or a result) ──
  /** The team's last socket closed: nothing changes; it is only not paired into a NEW match while offline (eligible). */
  offline(team: string, now: number) {
    if (this.where(team)) this.schedule(now);
  }
  /** The team has a socket again (F5, a network drop): the room's state again — the running match with its bag / lock, the result
   *  still on screen (re-sent), or the lobby with its place / loser clock; then the pairing it may have been skipped for. */
  online(team: string, now: number) {
    this.tick(now);
    const w = this.where(team);
    if (w) {
      this.resend(w.step, team, now);
      this.afterChange(w.step, now);
    }
  }

  // ── clock ──
  /** Everything that is due at `now`: queued teams that left the step, finished matches, releases, the next pairing. Safe to call any time. */
  tick(now: number) {
    let dirty = false;
    const moved = new Set<string>();
    for (const [step, room] of Object.entries(this.rooms)) {
      const ghosts = room.queue.filter((t) => this.io.stepOf(t) !== step); // the Host skipped the step / the team left it
      if (ghosts.length) (this.rooms[step] = { ...room, queue: room.queue.filter((t) => !ghosts.includes(t)) }, moved.add(step), dirty = true);
    }
    // a Host undo of a timeout release: the team is on the step again → back in the queue as a waiting loser with a fresh clock
    for (const [team, step] of Object.entries(this.released)) {
      if (this.io.stepOf(team) !== step) continue;
      delete this.released[team];
      const room = this.rooms[step] ?? newRoom();
      this.rooms[step] = { ...join(room, team), lost: { ...room.lost, [team]: { at: now, match: room.match?.id ?? '' } } };
      moved.add(step);
      dirty = true;
    }
    // waiting losers past loserMaxWaitMs: released (the step completes), queue renumbered
    for (const [step, room] of Object.entries(this.rooms)) {
      const due = dueRelease(room, now, this.cfg);
      if (!due.length) continue;
      this.rooms[step] = release(room, due);
      for (const t of due) this.released[t] = step;
      this.save();
      for (const t of due) {
        this.io.event(now, t, 'cq.release', { step, match: room.lost![t]!.match, waitedMs: now - room.lost![t]!.at });
        this.io.release(t, step, now); // SQLite (engine) before the "advance" ack
        this.io.send(t, { t: 'cq.advance', matchId: room.lost![t]!.match, reason: 'timeout' });
      }
      moved.add(step);
      dirty = false;
    }
    if (dirty) this.save();
    for (const step of Object.keys(this.rooms)) {
      const m = this.rooms[step]!.match;
      if (m && finished(m, now)) this.conclude(step, m, now);
      const r = this.rooms[step]!;
      if (r.lobbyDue && now >= r.holdUntil) (this.rooms[step] = { ...r, lobbyDue: false }, this.save(), moved.add(step)); // the result screen is over: the queue hears its place
      this.afterChange(step, now, moved.has(step));
    }
    this.schedule(now);
  }

  /** Pair the next match if due, and tell the queue its places when anything moved. */
  private afterChange(step: string, now: number, notify = true) {
    const room = this.rooms[step]!;
    const next = startNext(room, now, this.seed(), this.catalog(), this.eligible, this.cfg);
    if (!next) {
      if (notify) this.sendQueue(step, now);
      return this.schedule(now);
    }
    const m = next.match!;
    this.rooms[step] = { ...next, results: Object.fromEntries(Object.entries(next.results ?? {}).filter(([t]) => !m.teams.includes(t))) }; // a new match: its teams' old results are over
    this.save();
    this.io.event(now, null, 'cq.start', { step, match: m.id, teams: m.teams, set: m.set, seed: m.seed, startAt: m.startAt, endsAt: m.endsAt });
    for (const t of m.teams) this.io.send(t, this.state(step, t, now));
    this.sendQueue(step, now);
    this.schedule(now);
  }

  private result(m: Match, s: Settlement, team: string, now: number): CqResult {
    const of = (t: string): CqTeamResult => {
      const sc = s.scores.find((x) => x.team === t)!;
      return { ...this.io.who(t), bag: sc.bag, marks: sc.marks, correct: sc.correct, errors: sc.errors, score: sc.score, lockedAtMs: sc.lockedAtMs };
    };
    const opps = m.teams.filter((t) => t !== team).map(of);
    return {
      t: 'cq.result', matchId: m.id, set: m.set, you: of(team), opp: opps[0]!, opps, serverNow: now, startAt: m.startAt, holdMs: this.cfg.resultHoldMs,
      winner: s.winners[0] === team ? 'you' : s.draw.includes(team) ? 'draw' : 'opp', reason: s.reason,
    };
  }

  /** Match over (all locked / gone, or the time is up): rank, save, then tell both teams at the same moment; the winner completes the step. */
  private conclude(step: string, m: Match, now: number) {
    const s = settle(m, this.slotOf, this.cfg);
    this.rooms[step] = finish(this.rooms[step]!, m, s, now, this.cfg);
    this.save();
    this.io.event(now, null, 'cq.result', { step, match: m.id, winners: s.winners, draw: s.draw, reason: s.reason, scores: s.scores.map((x) => ({ team: x.team, score: x.score, lockedAt: x.lockedAtMs, bag: x.bag })) });
    const results = Object.fromEntries(m.teams.filter((t) => !m.gone.includes(t)).map((t) => [t, this.result(m, s, t, now)]));
    this.rooms[step] = { ...this.rooms[step]!, results };
    this.save();
    for (const t of m.teams) if (!m.gone.includes(t)) this.io.send(t, results[t]!); // offline teams get it on reconnect (resend)
    for (const w of s.winners) {
      this.io.win(w, step, now); // SQLite (engine) before the "advance" ack
      this.io.send(w, { t: 'cq.advance', matchId: m.id, reason: 'win' });
    }
    this.sendQueue(step, now); // the losers: their place, behind the result screen
  }

  /** Earliest moment something is due (the alarm): a match's end, the end of a result screen with teams waiting, a loser's release. */
  private schedule(now: number) {
    const due: number[] = [];
    for (const r of Object.values(this.rooms)) {
      for (const t of r.queue) if (r.lost?.[t]) due.push(r.lost[t]!.at + this.cfg.loserMaxWaitMs);
      if (r.match?.state === 'running') due.push(r.match.endsAt);
      else if (r.lobbyDue || r.queue.length >= this.cfg.teamsPerMatch) due.push(r.holdUntil);
    }
    const next = Math.min(...due.filter((t) => t > now), Infinity);
    if (next !== Infinity) this.io.setAlarm(next);
  }

  /** HostState.cetiqlo: read-only status of every room that has been used. */
  hostView(now: number): CqHostRoom[] {
    return Object.entries(this.rooms).map(([step, r]) => ({
      step, queue: r.queue.map((t) => ({ ...this.io.who(t), ...(r.lost?.[t] ? { releaseInS: Math.max(0, Math.ceil((r.lost[t]!.at + this.cfg.loserMaxWaitMs - now) / 1000)) } : {}) })),
      match: r.match?.state === 'running' ? { id: r.match.id, endsAt: r.match.endsAt, teams: r.match.teams.map((t) => ({ ...this.io.who(t), locked: t in r.match!.locked, bagN: r.match!.bags[t]!.length, online: this.io.online(t) })) } : null,
    }));
  }
}
