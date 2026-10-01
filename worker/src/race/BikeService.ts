// Phase 6 track C (docs/plans/phase6.md §6 C): the shared bikes inside the Durable Object — rows in `bikes`, the
// spawn alarm, claims, parking, abandonment — behind one seam so track A's RaceRoom.ts and track C never edit the same
// file. Decisions are the pure functions of VehicleSpawner.ts; this class owns rows, counters and messages. Every change
// is written to SQLite before anyone hears of it (CLAUDE.md: persist before ack); the bikes live in a RAM cache loaded
// lazily from the rows (a restart rebuilds it). Teams hear only their own view (VIEW_METERS), the Host pages everything.
import type { BikeInfo, ClientMessage, HostMessage, ServerMessage } from '@race/shared/protocol';
import { HOST } from '../auth.ts';
import type { QuotaCounters } from '../counters.ts';
import { addEvent, getMeta, setMeta } from '../db.ts';
import type { VehiclesConfig } from './leg.ts';
import { abandoned, claim, initialSpawn, newBike, OWN_REACH, periodicSpawn, type PlayerSpot, type ServerBike, type SpawnCandidates, type SpawnerState } from './VehicleSpawner.ts';

export interface BikeIO {
  sql: SqlStorage;
  counters: QuotaCounters;
  cfg: VehiclesConfig;
  /** To the sockets tagged `team`: a team id, or HOST (every Host page). */
  send(team: string, m: ServerMessage): void;
  /** Unused: bikes go per team (each sees only its view). Optional so RaceRoom's literal compiles; it may drop it. */
  broadcast?(m: ServerMessage): void;
  /** ctx.storage.setAlarm (1 row written). Only armed while someone is online (SPEC §3). */
  setAlarm(atMs: number): void;
}

export type TeamBikeMessage = Extract<ClientMessage, { t: 'bike' }>;
export type HostBikeMessage = Extract<HostMessage, { t: 'host.candidates' | 'host.bike' | 'host.spawning' }>;

/** meta 'spawner' (one row): the RNG position, the Host's pause, the armed alarm, whether the first round ran. */
interface Spawner extends SpawnerState {
  nextAt: number | null;
  initialDone: boolean;
}

/** m: free bikes and other teams' standing bikes reach a team within this (client serverBikes.groundRadius 200 + a tick of
 *  lag). A bike another team rides never does (RemotePlayers draws it from the tick), so `bikes` shows no rider, no route
 *  far ahead and no other team's stops (SPEC §7, §17.10; plan decisions 5 / 18). */
const VIEW_METERS = 250;
/** m: a dismount's y outside the map's span (Seine bed … Eiffel top, as decodePose) is ignored. */
const okY = (y: number | undefined): y is number => y !== undefined && y >= -100 && y <= 1000;

const info = ({ id, x, y, z, yaw, owner, rider, parked }: ServerBike): BikeInfo => ({ id, x, y, z, yaw, owner, rider, parked });
/** What a team was told of a bike: its own ridden one moves with it (no resend per tick). */
const key = (b: BikeInfo) => (b.rider ? 'ridden' : JSON.stringify(b));

export class BikeService {
  private cache: Map<string, ServerBike> | null = null;
  private state: Spawner | null = null;
  private cands: SpawnCandidates | null | undefined; // undefined = not read yet
  /** team → bike id → what that team was last told (memory: unknown after a wake or once offline → the next is `full`). */
  private readonly told = new Map<string, Map<string, string>>();

  constructor(readonly io: BikeIO) {}

  /** Every bike that is not gone: the Host's `host.state` only (a team gets forTeam). */
  list(): BikeInfo[] {
    return [...this.bikes.values()].map(info);
  }

  /** `welcome.bikes` of a team (its last pose `at`, null = unknown: its own bikes only); later changes come as diffs. */
  forTeam(team: string, at: PlayerSpot | null): BikeInfo[] {
    const list: BikeInfo[] = [];
    for (const b of this.bikes.values()) {
      if (b.owner === team || (!b.rider && at && Math.hypot(b.x - at.x, b.z - at.z) <= VIEW_METERS)) list.push(info(b));
    }
    this.told.set(team, new Map(list.map((b) => [b.id, key(b)])));
    return list;
  }

  /** claim / mount / dismount from a team (SPEC §6.3; `at` = its last known spot, null = unknown). Writes before answering.
   *  mount = claim of the team's own bike (client: got back on after a crash / reconnect). */
  onTeam(team: string, at: PlayerSpot | null, m: TeamBikeMessage, walkOnly: boolean, now: number) {
    const b = this.bikes.get(m.id);
    if (m.op === 'dismount') {
      if (!b || b.owner !== team || !b.rider) return; // nothing changes: no row, no message
      // Believed within OWN_REACH of the last pose (else the bike stands at the pose; no pose: where it was).
      const believed = at && m.x !== undefined && m.z !== undefined && Math.hypot(m.x - at.x, m.z - at.z) <= OWN_REACH;
      if (believed) Object.assign(b, { x: m.x, y: okY(m.y) ? m.y : b.y, z: m.z, yaw: m.yaw ?? b.yaw });
      else if (at) Object.assign(b, { x: at.x, z: at.z });
      Object.assign(b, { rider: false, nearOwnerAt: now });
      this.put(b);
      this.toHosts([b]);
      if (at) this.sync(team, at);
      return;
    }
    const r = claim(b, team, at, walkOnly);
    if (!r.ok || !b) return this.io.send(team, { t: 'bike', op: 'claim', id: m.id, ok: false, reason: r.ok ? 'gone' : r.reason });
    if (b.owner === team && b.rider) return this.io.send(team, { t: 'bike', op: 'claim', id: b.id, ok: true }); // already: no row
    const taken = b.owner !== team;
    // One bike per team (SPEC §6.3 maxPerPlayer 1): its other bike vanishes.
    const gone = taken ? [...this.bikes.values()].filter((o) => o.owner === team && o !== b).map((o) => o.id) : [];
    Object.assign(b, { owner: team, rider: true, nearOwnerAt: now, rack: null, parked: false });
    this.put(b);
    this.drop(gone);
    if (taken) this.event(now, team, 'bikeClaim', { id: b.id, at: [Math.round(b.x), Math.round(b.z)], gone });
    this.io.send(team, { t: 'bike', op: 'claim', id: b.id, ok: true });
    this.toHosts([b], gone);
    if (at) this.sync(team, at); // other teams near it: their next tick
  }

  /** Spawn candidates, manual add / remove / release, pause (SPEC §13.5). */
  onHost(m: HostBikeMessage, now: number) {
    const s = this.spawner;
    if (m.t !== 'host.bike') {
      if (m.t === 'host.spawning') s.paused = m.paused;
      else {
        this.cands = { segments: m.segments, decoys: m.decoys };
        setMeta(this.io.sql, 'candidates', JSON.stringify(this.cands));
        this.io.counters.rows += 1;
      }
      // The first round runs in alarm() (the players known) once there are candidates and spawning is on.
      if (!s.initialDone && !s.paused && this.candidates && s.nextAt === null) this.arm(now);
      return this.saveSpawner();
    }
    if (m.op === 'add') {
      if (!Number.isFinite(m.x) || !Number.isFinite(m.z)) return;
      return this.spawned([newBike(`h${now}`, m.x!, m.z!, 0, -2, now)], 'host', now);
    }
    const ids = m.team !== undefined ? [...this.bikes.values()].filter((b) => b.owner === m.team).map((b) => b.id) : m.id && this.bikes.has(m.id) ? [m.id] : [];
    if (!ids.length) return;
    if (m.op === 'remove') {
      this.drop(ids);
      this.event(now, null, 'bikeGone', { ids, why: 'host' });
      return this.toHosts([], ids);
    }
    const list = ids.map((id) => Object.assign(this.bikes.get(id)!, { owner: null, rider: false }));
    list.forEach((b) => this.put(b));
    this.event(now, null, 'bikeRelease', { ids });
    this.toHosts(list); // teams: their next tick
  }

  /** Alarm (SPEC §6.2 (3)–(4)): the first round once the Host sent candidates, then a round per spawnIntervalMinutes while
   *  players are online (re-armed only then: no loop when nobody is connected, SPEC §3); nothing while paused. Phase 7
   *  also calls it at the start. */
  alarm(players: readonly PlayerSpot[], now: number) {
    const s = this.spawner, c = this.candidates;
    s.nextAt = null;
    if (c && !s.paused) {
      if (!s.initialDone) {
        s.initialDone = true;
        this.spawned(initialSpawn(this.io.cfg, c, s, players, now), 'initial', now);
      } else if (players.length) this.spawned(periodicSpawn(this.io.cfg, c, s, [...this.bikes.values()], players, now), 'periodic', now);
      if (players.length) this.arm(now + this.io.cfg.spawnIntervalMinutes * 60_000);
    }
    this.saveSpawner();
  }

  /** About once per second from the tick loop. `players` = online teams with a pose; `online` = teams with an open socket
   *  (after a wake a team may have none yet: it keeps its rider, no row, no message). Ridden bikes follow their rider
   *  (memory only); an owner with no socket leaves the bike standing there, still locked (SPEC §6.3); abandonment; each
   *  team with a pose hears what changed in its view; the spawn alarm is armed again once players are back. */
  tick(players: readonly PlayerSpot[], online: ReadonlySet<string>, now: number) {
    const changed: ServerBike[] = [];
    for (const b of this.bikes.values()) {
      if (!b.rider || b.owner === null) continue;
      const p = players.find((q) => q.team === b.owner);
      // ponytail: a ridden bike's spot lives in memory; evicted mid-ride with the rider gone before its next pose, the bike
      // stands at its last row (the claim spot). Upgrade: the snapshot row (track A) carries the ridden bikes' spots.
      if (p) Object.assign(b, { x: p.x, z: p.z });
      else if (!online.has(b.owner)) changed.push(Object.assign(b, { rider: false }));
    }
    changed.forEach((b) => this.put(b));
    const gone = abandoned(this.io.cfg, [...this.bikes.values()], players, now);
    const owners = gone.map((id) => this.bikes.get(id)!.owner!);
    this.drop(gone);
    if (gone.length) this.event(now, null, 'bikeGone', { ids: gone, why: 'abandoned' });
    owners.forEach((team) => this.io.send(team, { t: 'notice', code: 'bikeGone' }));
    if (changed.length || gone.length) this.toHosts(changed, gone);
    for (const team of this.told.keys()) if (!online.has(team)) this.told.delete(team);
    players.forEach((p) => this.sync(p.team, p));
    const s = this.spawner;
    if (s.nextAt === null && players.length && this.candidates && !s.paused) {
      this.arm(now + this.io.cfg.spawnIntervalMinutes * 60_000);
      this.saveSpawner();
    }
  }

  /** Phase 7 (SPEC §6.4, D18): the owner opened a task clue / a walk-only route (or entered a task place elsewhere) → its
   *  bike goes to the rack of the point it stands at, free for anyone; a full rack (bikeParking.maxBikes) loses its
   *  longest parked bike. `at` = the rack's spot (leg bikeParking); ponytail: null (none in the leg file) → the bike stays
   *  where it stood (`npm run leg:check` suggests a spot to add). */
  park(team: string, rack: string, at: { x: number; z: number } | null, now: number) {
    const b = [...this.bikes.values()].find((o) => o.owner === team);
    if (!b) return;
    Object.assign(b, { owner: null, rider: false, parked: true, rack, parkedAt: now }, at ?? {});
    const atRack = [...this.bikes.values()].filter((o) => o.rack === rack).sort((p, q) => (p.parkedAt ?? 0) - (q.parkedAt ?? 0));
    const gone = atRack.slice(0, Math.max(0, atRack.length - this.io.cfg.bikeParking.maxBikes)).map((o) => o.id);
    this.put(b);
    this.drop(gone);
    this.event(now, team, 'bikePark', { id: b.id, rack, gone });
    this.io.send(team, { t: 'notice', code: 'bikeParked' });
    this.toHosts([b], gone);
  }

  /** Phase 7 (D11): a new leg was loaded (lobby, no team entered yet): the old corridor's candidates and bikes go; the
   *  Host page recomputes the candidates from the new leg (its id changed). */
  resetForLeg(now: number) {
    const ids = [...this.bikes.keys()];
    this.drop(ids);
    this.cands = null;
    this.io.sql.exec("DELETE FROM meta WHERE key = 'candidates'");
    this.io.counters.rows += 1;
    if (ids.length) this.event(now, null, 'bikeGone', { ids, why: 'leg' });
    this.toHosts([], ids);
  }

  get spawning(): { paused: boolean; candidates: number; nextAt: number | null } {
    const c = this.candidates;
    const points = c ? (c.segments.reduce((n, s) => n + s.length, 0) + c.decoys.length) / 2 : 0;
    return { paused: this.spawner.paused, candidates: points, nextAt: this.spawner.nextAt };
  }

  // ── rows ──
  private get bikes(): Map<string, ServerBike> {
    if (!this.cache) {
      const now = Date.now();
      const rows = this.io.sql.exec<{ data: string }>('SELECT data FROM bikes').toArray();
      this.cache = new Map(rows.map((r) => Object.assign(JSON.parse(r.data) as ServerBike, { nearOwnerAt: now })).map((b) => [b.id, b]));
    }
    return this.cache;
  }

  private get spawner(): Spawner {
    if (!this.state) {
      const saved = getMeta(this.io.sql, 'spawner');
      // A fresh race draws its seed once; it is saved with the first change (the Host's candidates) and logged per round.
      this.state = saved ? (JSON.parse(saved) as Spawner) : { seed: crypto.getRandomValues(new Uint32Array(1))[0]!, draws: 0, paused: false, nextAt: null, initialDone: false };
    }
    return this.state;
  }

  private get candidates(): SpawnCandidates | null {
    if (this.cands === undefined) {
      const saved = getMeta(this.io.sql, 'candidates');
      this.cands = saved ? (JSON.parse(saved) as SpawnCandidates) : null;
    }
    return this.cands;
  }

  private saveSpawner() {
    setMeta(this.io.sql, 'spawner', JSON.stringify(this.spawner));
    this.io.counters.rows += 1;
  }

  private arm(at: number) {
    this.spawner.nextAt = at;
    this.io.setAlarm(at);
  }

  private put(b: ServerBike) {
    this.bikes.set(b.id, b);
    this.io.counters.rows += this.io.sql.exec('INSERT INTO bikes (id, data) VALUES (?, ?) ON CONFLICT (id) DO UPDATE SET data = excluded.data', b.id, JSON.stringify(b)).rowsWritten;
  }

  private drop(ids: readonly string[]) {
    for (const id of ids) {
      this.bikes.delete(id);
      this.io.counters.rows += this.io.sql.exec('DELETE FROM bikes WHERE id = ?', id).rowsWritten;
    }
  }

  /** 2 rows (table + team index). */
  private event(now: number, team: string | null, type: string, data: unknown) {
    addEvent(this.io.sql, now, team, type, data);
    this.io.counters.rows += 2;
  }

  /** New bikes: rows, one event for the round (SPEC §6.2 (7): seed + draws replay it), the Host told. */
  private spawned(list: readonly ServerBike[], why: string, now: number) {
    if (!list.length) return;
    list.forEach((b) => this.put(b));
    this.event(now, null, 'bikeSpawn', { why, bikes: list.map((b) => [b.id, b.segment, Math.round(b.x), Math.round(b.z)]), draws: this.spawner.draws });
    this.toHosts(list); // teams: their next tick, if near
  }

  // ── messages ──
  /** Every change to the Host pages at once (they see all bikes, SPEC §13.5). */
  private toHosts(list: readonly ServerBike[], gone: string[] = []) {
    this.io.send(HOST, { t: 'bikes', list: list.map(info), ...(gone.length ? { gone } : {}) });
  }

  /** What changed in `team`'s view (standing at `at`) since it was last told; all of it (`full`) when that is unknown. */
  private sync(team: string, at: PlayerSpot) {
    const was = this.told.get(team);
    const list = this.forTeam(team, at);
    if (!was) return this.io.send(team, { t: 'bikes', list, full: true });
    const now = this.told.get(team)!;
    const changed = list.filter((b) => was.get(b.id) !== now.get(b.id));
    const gone = [...was.keys()].filter((id) => !now.has(id));
    if (changed.length || gone.length) this.io.send(team, { t: 'bikes', list: changed, ...(gone.length ? { gone } : {}) });
  }
}
