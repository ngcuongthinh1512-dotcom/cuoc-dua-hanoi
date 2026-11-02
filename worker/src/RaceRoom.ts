// One Durable Object per race (SPEC §3): the authority for teams, poses, bikes and (Phase 7) the race itself.
// WebSocket Hibernation API; a 200 ms setTimeout loop runs only while poses arrive (stops NET.idleStopMs after the last
// one, so the object can hibernate); SQLite: events at once (before any answer), the snapshot row (last valid pose of
// every team + counters) every NET.snapshotMs and at once on a disconnect, the replay row every NET.replayMs.
// Rebuild rule: memory is a cache — teams / poses / counters come back from SQLite in the constructor, per-socket facts
// (role, team, revealed box) from the socket attachment (docs/plans/phase6.md §3, §6 A).
import { DurableObject } from 'cloudflare:workers';
import { SPRINT_MULTIPLIER } from '@race/shared';
import { startSpot } from '@race/shared/leg';
import { avatarOf, boxVisible, CLOSE, decodePose, encodePose, encodeTick, isClientMessage, NET, overSpeed, parseFrame, PROTOCOL_VERSION, SpeedWindow, TrustedPoint, type ClientMessage, type FlagWhy, type HostState, type PoseSample, type QuotaCounters as Counters, type Avatar, type Role, type RoomAt, type ServerMessage, type TeamInfo, type Welcome } from '@race/shared/protocol';
import { HOST, newClaims, signToken, spectatorClaims, spectatorCodeOf, verifyToken } from './auth.ts';
import { QuotaCounters } from './counters.ts';
import { addEvent, getMeta, migrate, readProgress, setMeta, type EventRow, type TeamRow } from './db.ts';
import type { Env } from './index.ts';
import { BikeService } from './race/BikeService.ts';
import { Cetiqlo } from './race/cetiqlo/index.ts';
import { NEW_TEAM_RACE, RaceEngine, type TeamRace } from './race/engine.ts';
import { answersCsv, exportCsv, exportRace } from './race/export.ts';
import { needsTick, tickEntries, tickKey, type Peer } from './race/presence.ts';
import type { PlayerSpot } from './race/VehicleSpawner.ts';

/** Per-socket facts that survive hibernation (ws.serializeAttachment). */
interface Attachment {
  role: Role;
  team: string;
  /** ms the socket was accepted (dead-socket check before its first ping). */
  since: number;
  /** Key (boxKey: step|branch) of the clue box this socket was last told is revealed (SPEC §17.10), null = none. */
  box: string | null;
  /** SPEC §17.40: a team socket in the watch mode (`watch on`): its ticks carry every online team once the team is over. */
  watch?: boolean;
  /** Leg 2: the team's avatar (socket URL `avatar`, once per connection): TeamInfo.avatar / `team` online. */
  avatar?: Avatar;
}

/** Per-team state kept in teams.state (JSON): presence fields + the Phase 7 race fields (race/engine.ts TeamRace, `step`
 *  = index of the current step). */
interface TeamState extends TeamRace {
  reconnects: number;
  lastSeen: number | null;
  /** Over the speed limit or a suspicious respawn (SPEC §13.9): red on the Host, cleared only by the Host (host.flag). */
  flagged: boolean;
  /** Phase 10 (V3): why / since when (HostState.teams[].flagWhy / flagAt); [] / null while not flagged. */
  flagWhy: FlagWhy[];
  flagAt: number | null;
}

/** Poses of a team (memory; `valid` reaches the snapshot row). */
interface Live {
  /** Last received: what the others see (ticks, replay, Host). */
  pose: PoseSample;
  /** Trusted position (D4): the last pose with x, z = `trust` — geofence, box channel, snapshot, welcome, bikes (claim
   *  reach, ridden bike, view), the interest radius of its own ticks. */
  valid: PoseSample;
  /** Phase 7 (D4): follows the poses at no more than the bike speed × tolerance; nothing else moves `valid`. */
  trust: TrustedPoint;
  /** m the trusted point is behind the last pose (a teleport is when this grows). */
  lag: number;
  /** Server ms the team was last known to stand at `valid` (its arrival; on a disconnect the socket's last sign of life). */
  validAt: number;
  /** Undefined → the next pose opens a new window, judged against `valid` / `validAt` (connect, disconnect, wake). */
  win?: SpeedWindow;
  /** Last pose in 'bike' mode (the bike limit applies for one window after). */
  bikeAt: number;
  /** Over the limit right now (one `speed` event per episode). */
  over: boolean;
  /** Teleports in the current NET.respawnWindowMs: count, summed length (m), metres the trusted point took at once
   *  (respawns, ≤ NET.respawnTrust per window). Memory only (a wake starts a new one). */
  tp?: { start: number; n: number; d: number; g: number };
}

type RaceWelcome = ReturnType<RaceEngine['welcome']>;
/** Phase 8 (D6): a box is a step's, or a detour branch's (`D1|A`): the attachment key. */
const boxKey = (b: { step: string; branch?: string }) => `${b.step}|${b.branch ?? ''}`;

const TEAM = 'team';
/** SPEC §17.40: the watch-only role (spectator code): a socket tag like TEAM / HOST. */
const SPECTATOR = 'spectator';
const SPECTATOR_CODE = 'spectatorCode'; // meta key
type Op = 'bike' | 'speed' | 'connect' | 'login' | 'race';
/** m: a lag of the trusted point that grows by less than this is not logged as a teleport (the client's spawn settling
 *  next to its start spot, rounding); faster drifts are the speed window's flag, and the trusted point stays honest. */
const JUMP_NOISE_M = 5;
const json = (body: unknown, status = 200) => Response.json(body, { status });
const att = (ws: WebSocket) => ws.deserializeAttachment() as Attachment;
/** SPEC §17.40 TeamInfo.racing: not checked in, not out (the Host's "Kết thúc" marks every unfinished team out). */
const racing = (s: Pick<TeamRace, 'finishAt' | 'out'>) => s.finishAt === null && !s.out;

export class RaceRoom extends DurableObject<Env> {
  private readonly sql: SqlStorage;
  readonly counters: QuotaCounters;
  private readonly live = new Map<string, Live>();
  /** Per team: bike ops / speed events / socket upgrades / logins in the current NET.respawnWindowMs (SQLite row budget).
   *  Memory only. */
  private readonly ops = new Map<string, Record<Op, number> & { start: number }>();
  /** Failed team-code logins per client address (SPEC §8.10: 5 → 60 s). ponytail: memory only, forgotten on eviction. */
  private readonly loginFails = new Map<string, { n: number; until: number }>();
  /** Shared bikes (track C) behind one seam. */
  private readonly bikes: BikeService;
  /** Phase 7 race engine (leg, status, step_progress, ranking) behind one seam. */
  private readonly engine: RaceEngine;
  /** Leg 3: the CETIQLO head-to-head room(s) (race/cetiqlo). */
  private readonly cq: Cetiqlo;
  /** teams rows (read once, patched on write: no SELECT per message). */
  private teamRows: TeamRow[] | null = null;
  private snapSeq = 0;
  // ── tick loop (memory only; nothing here must survive hibernation) ──
  private timer: ReturnType<typeof setTimeout> | null = null;
  private lastPoseAt = 0;
  private readonly dirty = new Set<number>();
  private readonly sentKey = new WeakMap<WebSocket, string>();
  private snapshotAt: number | null = null;
  private replayAt: number | null = null;
  private hostAt: number | null = null;
  private slowAt = 0;
  private boxAt = 0;
  private replayBuf: number[][] = [];
  /** Per-socket message rate (1 s window) + last message time. */
  private readonly seen = new WeakMap<WebSocket, { start: number; n: number; last: number }>();
  /** Sockets already handled as gone (closed by us or by the client): never counted as online again. */
  private readonly gone = new WeakSet<WebSocket>();
  /** SPEC §17.40: `team` racing changes found while the engine wrote (inside its transaction), sent at its `changed`. */
  private teamNews: ServerMessage[] = [];
  /** Leg 3: the room each team stands in (its client says so, relayed to the Host + spectators). In memory only: the client repeats it every 15 s. */
  private readonly rooms = new Map<string, RoomAt>();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    migrate(this.sql);
    const snap = this.sql.exec<{ t: number; data: string }>('SELECT t, data FROM snapshot WHERE id = 1').toArray()[0];
    const data = (snap ? JSON.parse(snap.data) : {}) as { seq?: number; poses?: Record<string, unknown>; at?: Record<string, number>; counters?: Counters };
    this.counters = QuotaCounters.from(data.counters);
    this.snapSeq = data.seq ?? 0;
    for (const [team, arr] of Object.entries(data.poses ?? {})) {
      const p = decodePose(arr);
      const at = data.at?.[team] ?? snap!.t;
      if (p) this.live.set(team, { pose: p, valid: p, validAt: at, trust: new TrustedPoint(p.x, p.z, at), lag: 0, bikeAt: 0, over: false });
    }
    this.engine = new RaceEngine({
      sql: this.sql,
      counters: this.counters,
      transaction: (fn) => this.ctx.storage.transactionSync(fn),
      send: (team, m) => this.sockets(team).forEach((ws) => this.send(ws, m)),
      setAlarm: (at) => this.setAlarm(at),
      changed: (now) => {
        // SPEC §17.40: after the transaction committed, everyone (spectators too) learns who stopped racing
        for (const m of this.teamNews.splice(0)) this.broadcast(m);
        this.soon(now);
      },
      event: (t, team, type, data) => this.event(t, team, type, data),
      team: (id) => {
        const r = this.team(id);
        return r && this.teamState(r);
      },
      saveTeam: (id, r) => {
        const row = this.team(id);
        if (!row) return;
        const s = this.teamState(row);
        this.saveTeamState(row, { ...s, ...r });
        if (racing(s) !== racing(r)) this.teamNews.push({ t: 'team', slot: row.slot, online: this.online().has(id), racing: racing(r) });
      },
      teamIds: () => this.teams().map((t) => t.id),
      slot: (id) => this.team(id)?.slot ?? -1,
      name: (id) => this.team(id)?.name ?? '',
      online: () => [...this.online()],
      pose: (id) => this.live.get(id)?.valid ?? null,
      park: (team, rack, now, box) => {
        const l = this.live.get(team);
        this.bikes.park(team, rack, l ? { team, x: l.valid.x, z: l.valid.z } : null, now, box);
      },
      legLoaded: (now) => this.bikes.resetForLeg(now),
      hideBox: (team, step, branch) => {
        // S1: forget the revealed box first, so the box of the branch switched back to is revealed again
        for (const ws of this.sockets(team)) {
          ws.serializeAttachment({ ...att(ws), box: null } satisfies Attachment);
          this.send(ws, branch === undefined ? { t: 'box', op: 'hide', step } : { t: 'box', op: 'remove', step, branch });
        }
      },
    });
    this.cq = new Cetiqlo({
      load: () => getMeta(this.sql, 'cq'),
      save: (json) => {
        setMeta(this.sql, 'cq', json);
        this.counters.rows += 1;
      },
      send: (team, m) => this.sockets(team).forEach((ws) => this.send(ws, m)),
      online: (team) => this.sockets(team).length > 0,
      who: (team) => ({ slot: this.team(team)?.slot ?? -1, name: this.team(team)?.name ?? '' }),
      stepOf: (team) => this.engine.cqStep(team),
      win: (team, step, now) => this.engine.cqWin(team, step, now),
      release: (team, step, now) => this.engine.cqRelease(team, step, now),
      setAlarm: (at) => this.setAlarm(at),
      event: (t, team, type, data) => this.event(t, team, type, data),
    });
    const engine = this.engine;
    this.bikes = new BikeService({
      sql: this.sql,
      counters: this.counters,
      get cfg() {
        return engine.rules().vehicles; // the loaded leg's (D11)
      },
      send: (team, m) => this.sockets(team).forEach((ws) => this.send(ws, m)),
      broadcast: (m) => this.broadcast(m),
      setAlarm: (at) => this.setAlarm(at),
    });
    // Keepalive / ping answered without waking a hibernated object (SPEC §3: not billed).
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(NET.ping, NET.pong));
  }

  /** The race id this object serves (named by the Worker: env.RACE_ROOM.getByName(race)). */
  get race(): string {
    return this.ctx.id.name ?? getMeta(this.sql, 'race') ?? 'unknown';
  }

  // ── HTTP from the Worker (index.ts): POST /login {code}, GET /ws?token= ──
  async fetch(request: Request): Promise<Response> {
    this.counters.http++;
    const url = new URL(request.url);
    if (request.method === 'POST' && url.pathname === '/login') return this.login(request);
    if (request.method === 'GET' && url.pathname === '/ws') return this.upgrade(request, url.searchParams.get('token'), avatarOf(url.searchParams.get('avatar')));
    // Phase 8 (D13): the Worker asks whether team `team` may load image `name` (it streams R2 itself): 204 yes / 404 no
    if (request.method === 'GET' && url.pathname === '/media') return new Response(null, { status: this.engine.mediaAllowed(url.searchParams.get('team') ?? '', url.searchParams.get('name') ?? '') ? 204 : 404 });
    // SPEC §17.25: the Worker checked the Host token
    if (request.method === 'GET' && url.pathname === '/export') return this.export(url.searchParams.get('format') === 'json' ? 'json' : 'csv');
    if (request.method === 'GET' && url.pathname === '/answers') return new Response(answersCsv(this.engine.leg, this.teams(), readProgress(this.sql)), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="race-${this.race}-dap-an.csv"`, 'Cache-Control': 'no-store' } });
    return json({ ok: false, error: 'not_found' }, 404);
  }

  /** SPEC §17.25: the raw timing data (race/export.ts), read from SQLite only (0 rows written), as a download. */
  private export(format: 'csv' | 'json'): Response {
    const events = this.sql.exec<EventRow>('SELECT id, t, team, type, data FROM events ORDER BY id').toArray();
    const teams = this.teams().map((t) => ({ ...this.teamState(t), id: t.id, name: t.name }));
    const data = { race: this.race, ...exportRace(this.engine.leg, teams, readProgress(this.sql), events, Date.now()) };
    return new Response(format === 'json' ? JSON.stringify(data) : exportCsv(data), {
      headers: {
        'Content-Type': format === 'json' ? 'application/json; charset=utf-8' : 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="race-${this.race}-thoi-gian.${format}"`,
        'Cache-Control': 'no-store',
      },
    });
  }

  /** SPEC §7 / §8.10: team code → token + a summary for the "Chào mừng trở lại" screen. */
  private async login(request: Request): Promise<Response> {
    const ip = request.headers.get('CF-Connecting-IP') ?? 'local';
    const body = (await request.json().catch(() => null)) as { code?: unknown } | null;
    const now = Date.now();
    const fails = this.loginFails.get(ip); // read after the await: parallel attempts see each other's count
    if (fails && fails.until > now) return json({ ok: false, error: 'locked', retryMs: fails.until - now }, 429);
    const code = typeof body?.code === 'string' ? body.code.trim().toUpperCase() : '';
    const team = code ? this.teams().find((t) => t.code === code) : undefined;
    // SPEC §17.40: the spectator code goes through the same box and the same guess limit; its token names the code
    if (!team && code && code === this.spectatorCode()) {
      this.loginFails.delete(ip);
      return json({ ok: true, token: await signToken(this.env.HOST_PASSWORD, spectatorClaims(this.race, code, now)), role: SPECTATOR });
    }
    if (!team) {
      const n = fails && !fails.until ? fails.n + 1 : 1; // a served lock starts the count again
      this.loginFails.set(ip, { n, until: n >= NET.loginAttempts ? now + NET.loginLockMs : 0 });
      return json({ ok: false, error: 'bad_code' }, 401);
    }
    this.loginFails.delete(ip);
    const token = await signToken(this.env.HOST_PASSWORD, newClaims(this.race, team.id, now));
    if (this.count(team.id, 'login', now) <= NET.maxConnects) this.event(now, team.id, 'login', { ip });
    const s = this.teamState(team);
    return json({ ok: true, token, team: this.info(team, this.online()), summary: { reconnects: s.reconnects, lastSeen: s.lastSeen, ...this.engine.summary(team.id) } });
  }

  /** WebSocket upgrade: a valid token for this race → Hibernation API accept, one socket per team (§8.10), `welcome`. */
  private async upgrade(request: Request, token: string | null, avatar: Avatar): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') return json({ ok: false, error: 'expected_websocket' }, 426);
    const claims = await verifyToken(this.env.HOST_PASSWORD, token, this.race);
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    const specCode = spectatorCodeOf(claims);
    const role: Role = claims?.t === HOST ? HOST : specCode !== null ? SPECTATOR : TEAM;
    const team = role === TEAM && claims ? this.team(claims.t) : undefined;
    const now = Date.now();
    // A reconnect loop past NET.maxConnects: closed before any row (the older socket keeps the team). SPEC §17.40: a
    // spectator token of a rotated code is a bad token; past NET.maxSpectators open spectator sockets the room is full.
    const refused =
      !claims || (role === TEAM && !team) || (specCode !== null && specCode !== this.spectatorCode()) ? CLOSE.badToken
      : team && this.count(team.id, 'connect', now) > NET.maxConnects ? CLOSE.tooFast
      : role === SPECTATOR && this.sockets(SPECTATOR).length >= NET.maxSpectators ? CLOSE.full
      : 0;
    if (refused) {
      // Accept, then close with the reason: the browser sees the code (a 401 response gives it only "failed").
      server.accept();
      server.close(refused, refused === CLOSE.badToken ? 'bad token' : refused === CLOSE.full ? 'full' : 'too many reconnects');
      return new Response(null, { status: 101, webSocket: client });
    }
    this.ctx.acceptWebSocket(server, [role, ...(team ? [team.id] : [])]);
    let race: RaceWelcome | null = null;
    if (team) {
      // One synchronous section from enter() to the teams.state write (no await): sockets opening together get start
      // orders 1, 2… and the write never carries an older state (critic: minor 3).
      const e = this.engine.enter(team.id, now);
      const s = this.teamState(team);
      const l = this.live.get(team.id);
      this.saveTeamState(team, { ...s, reconnects: s.reconnects + 1, lastSeen: now, ...(e.first ? { startOrder: e.startOrder, joinedAt: now } : {}) });
      race = this.engine.welcome(team.id, l?.valid ?? null, e.first, now);
      const shown = race.boxes.find((b) => !b.opened);
      server.serializeAttachment({ role, team: team.id, since: now, box: shown ? boxKey(shown) : null, avatar } satisfies Attachment);
      // Newer device wins (accepted first, so the old socket's close does not take the team offline).
      for (const old of this.sockets(team.id)) {
        if (old === server) continue;
        this.send(old, { t: 'kick', reason: 'otherDevice' });
        this.close(old, CLOSE.otherDevice, 'logged in elsewhere');
      }
      if (l) Object.assign(l, { win: undefined, over: false }); // the client spawns at welcome.pose: new window
      this.event(now, team.id, 'connect');
    } else {
      server.serializeAttachment({ role, team: role, since: now, box: null } satisfies Attachment);
    }
    this.send(server, this.welcome(role, team, race, now));
    if (team) this.cq.online(team.id, now); // Leg 3 CETIQLO: back inside a room → its state again
    if (team) this.broadcast({ t: 'team', slot: team.slot, online: true, avatar }, server);
    else if (role === HOST) this.send(server, this.hostState(now));
    if (role === HOST || role === SPECTATOR) for (const [id, r] of this.rooms) this.send(server, { t: 'room', slot: this.team(id)?.slot ?? -1, room: r });
    this.soon(now); // ticks for the new set of peers + host.state
    // Bike spawning alarm (SPEC §3: only while a team is online; track C's alarm() re-arms while players remain).
    if (team && (await this.ctx.storage.getAlarm()) === null) this.setAlarm(now + this.engine.rules().vehicles.spawnIntervalMinutes * 60_000);
    return new Response(null, { status: 101, webSocket: client });
  }

  // ── Hibernation API events ──
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    this.counters.wsIn++;
    const now = Date.now();
    if (this.gone.has(ws)) return;
    if (this.tooFast(ws, now)) return this.close(ws, CLOSE.tooFast, 'too many messages');
    const a = att(ws);
    const max = a.role === HOST ? NET.maxHostBytes : NET.maxPlayerBytes;
    if (typeof message === 'string' && message.length > max) return this.close(ws, CLOSE.tooBig, 'too big');
    if (a.role === SPECTATOR) return; // SPEC §17.40: a spectator only pings (auto-answered above); the rest is dropped
    const m = parseFrame(message, max);
    const pose = decodePose(m);
    if (pose) return this.onPose(ws, a, pose, now);
    if (!isClientMessage(m, a.role)) return this.close(ws, CLOSE.badMessage, 'bad message');
    this.onMessage(ws, a, m as ClientMessage, now);
  }

  async webSocketClose(ws: WebSocket, _code: number, _reason: string, _wasClean: boolean) {
    this.onGone(ws);
  }

  async webSocketError(ws: WebSocket, _error: unknown) {
    this.onGone(ws);
  }

  /** Periodic bike spawning (SPEC §3, §6.2 (4)): armed on a team connect, track C re-arms it while players are online. */
  async alarm() {
    this.counters.alarms++;
    const now = Date.now();
    this.closeDead(now); // the tick loop may be asleep (nobody moving) while a socket died silently
    this.bikes.alarm(this.players(), now);
    this.cq.tick(now); // Leg 3 CETIQLO: a match whose time is up, a result screen that ended, a disconnect grace that ran out
    this.engine.revealDue(now); // Leg 3: finish-line penalties that ended: those teams hear their place now
  }

  // ── handlers ──
  /** A pose: speed window (SPEC §13.9: flag only), the trusted point (D4: the only position the race believes), dirty
   *  slot, due snapshot / replay / host.state, then the race engine (arrivals, Pit Stop). */
  private onPose(ws: WebSocket, a: Attachment, pose: PoseSample, now: number) {
    const t = a.role === TEAM ? this.team(a.team) : undefined;
    if (!t) return;
    const l = this.liveOf(t.id, a.since, pose);
    const { footSpeed, bikeSpeedMultiplier } = this.engine.rules().movement;
    if (pose.mode === 'bike') l.bikeAt = now;
    let over = false;
    let earned = 0;
    let unseen: number | null = null;
    if (l.win) {
      l.win.push(now, pose.x, pose.z);
      // SPEC §17.29: Shift sprints at × SPRINT_MULTIPLIER on foot and on a bike, so the limit is the mode's top × that
      over = overSpeed(l.win, footSpeed * SPRINT_MULTIPLIER * (now - l.bikeAt <= NET.speedWindowMs ? bikeSpeedMultiplier : 1));
      if (over && !l.over) {
        if (this.count(t.id, 'speed', now) <= NET.maxRespawns) this.event(now, t.id, 'speed', { v: Math.round(l.win.speed * 10) / 10, x: Math.round(pose.x), z: Math.round(pose.z) });
        this.flag(t, 'speed', now);
      }
    } else {
      // New window (first pose, (re)connect, wake), SPEC §8.10: the way from the trusted point may take the time the team
      // was unseen at bike speed — offline, plus since its last ping on this socket (a connected client that sends no pose
      // stands still). The rest is a teleport. Not on top of the bucket's refill over the same seconds (TrustedPoint).
      const pinged = this.ctx.getWebSocketAutoResponseTimestamp(ws)?.getTime() ?? 0;
      unseen = (Math.max(0, a.since - l.validAt) + Math.max(0, now - Math.max(a.since, l.validAt, pinged))) / 1000;
      earned = this.trustRate() * unseen;
      (l.win = new SpeedWindow()).reset(now, pose.x, pose.z);
    }
    l.over = over;
    const d = Math.hypot(pose.x - l.trust.x, pose.z - l.trust.z);
    const grew = this.follow(l, pose, now, 0, earned);
    if (grew > JUMP_NOISE_M) this.teleport(t, l, grew, now, 'jump', unseen === null ? { d: Math.round(grew) } : { d: Math.round(d), s: Math.round(unseen) });
    this.moved(t.slot, now);
    this.engine.onPose(t.id, l.valid, now);
  }

  /** m/s the trusted point may move: sprinting bike speed × tolerance for every mode (walking too fast is the `speed` flag's job). */
  private trustRate() {
    const { footSpeed, bikeSpeedMultiplier } = this.engine.rules().movement;
    return footSpeed * bikeSpeedMultiplier * SPRINT_MULTIPLIER * NET.speedTolerance;
  }

  /** The trusted point towards `pose` (+ `grant` m, at least `earned` m: TrustedPoint.follow): `valid` = the pose at the
   *  trusted x, z. Returns how much the lag behind the client grew (> 0: part of this pose is out of reach). */
  private follow(l: Live, pose: PoseSample, now: number, grant: number, earned = 0): number {
    const rate = this.trustRate();
    const left = l.trust.follow(now, pose.x, pose.z, rate, (rate * NET.speedLeadMs) / 1000, grant, earned);
    const grew = left - l.lag;
    l.lag = left;
    Object.assign(l, { pose, valid: { ...pose, x: l.trust.x, z: l.trust.z }, validAt: now });
    return grew;
  }

  /** The team's poses; a team never seen yet stands at its spot at the leg start (startSpot, D17) from the moment its
   *  socket opened. */
  private liveOf(team: string, since: number, pose: PoseSample): Live {
    let l = this.live.get(team);
    if (!l) {
      const row = this.team(team);
      const spot = startSpot(this.engine.leg, (row && this.teamState(row).startOrder) ?? 1);
      const at = { ...pose, x: spot.x, z: spot.z };
      this.live.set(team, (l = { pose: at, valid: at, validAt: since, trust: new TrustedPoint(spot.x, spot.z, since), lag: 0, bikeAt: 0, over: false }));
    }
    return l;
  }

  /** A respawn or an unexplained jump: logged, and counted per NET.respawnWindowMs — more than NET.maxRespawns or more
   *  than NET.maxRespawnJump m in all → suspicious + flagged; events stop at the cap (SQLite row budget). */
  private teleport(t: TeamRow, l: Live, d: number, now: number, type: 'jump' | 'respawn', data: object): boolean {
    const r = l.tp && now - l.tp.start < NET.respawnWindowMs ? l.tp : (l.tp = { start: now, n: 0, d: 0, g: 0 });
    r.n++;
    r.d += d;
    const suspicious = r.n > NET.maxRespawns || r.d > NET.maxRespawnJump;
    if (r.n <= NET.maxRespawns) this.event(now, t.id, type, { ...data, ...(suspicious ? { suspicious } : {}) });
    if (suspicious) this.flag(t, type, now);
    return suspicious;
  }

  /** One more `k` in the team's current NET.respawnWindowMs; returns the count so far. */
  private count(team: string, k: Op, now: number): number {
    let o = this.ops.get(team);
    if (!o || now - o.start >= NET.respawnWindowMs) this.ops.set(team, (o = { start: now, bike: 0, speed: 0, connect: 0, login: 0, race: 0 }));
    return ++o[k];
  }

  private onMessage(ws: WebSocket, a: Attachment, m: ClientMessage, now: number) {
    if (Array.isArray(m)) return;
    switch (m.t) {
      case 'host.createTeams':
        return this.createTeams(m.teams, now);
      case 'host.candidates':
      case 'host.bike':
      case 'host.spawning':
        this.bikes.onHost(m, now);
        return this.soon(now);
      case 'bike': {
        if (a.role !== TEAM) return;
        const l = this.live.get(a.team);
        // Each op may write a row: past the budget the socket goes (a real player never gets near it).
        if (this.count(a.team, 'bike', now) > NET.maxBikeOps) return this.close(ws, CLOSE.tooFast, 'too many bike ops');
        // D4: claim / dismount reach from the trusted point (a fake pose next to a bike 2 km away claims nothing)
        return this.bikes.onTeam(a.team, l ? { team: a.team, x: l.valid.x, z: l.valid.z } : null, m, this.engine.bikeBlock(a.team), now);
      }
      case 'gesture': {
        const team = a.role === TEAM ? this.team(a.team) : undefined;
        if (team) this.broadcast({ t: 'gesture', slot: team.slot, g: m.g }, ws);
        return;
      }
      case 'room': {
        const team = a.role === TEAM ? this.team(a.team) : undefined;
        if (!team) return;
        this.setRoom(team, m.room);
        return;
      }
      case 'cq.join':
        return a.role === TEAM ? this.cq.join(a.team, now) : undefined;
      case 'cq.leave':
        return a.role === TEAM ? this.cq.leave(a.team, now) : undefined;
      case 'cq.take':
        return a.role === TEAM ? this.cq.take(a.team, m.id, m.x, m.z, now) : undefined;
      case 'cq.drop':
        return a.role === TEAM ? this.cq.drop(a.team, m.id, now) : undefined;
      case 'cq.checkout':
        return a.role === TEAM ? this.cq.checkout(a.team, m.x, m.z, now) : undefined;
      case 'watch': {
        // SPEC §17.40: remembered on the socket (hibernation); sendTicks honours it only while the team is over
        if (a.role !== TEAM) return;
        ws.serializeAttachment({ ...a, watch: m.on } satisfies Attachment);
        return this.soon(now); // the next tick goes out even if nobody moved: the set of peers this socket gets changed (needsTick)
      }
      case 'host.spectator': {
        this.rotateSpectatorCode(now);
        for (const s of this.sockets(SPECTATOR)) this.close(s, CLOSE.badToken, 'code changed');
        return this.pushHostState(now);
      }
      case 'respawn': {
        const t = a.role === TEAM ? this.team(a.team) : undefined;
        if (!t) return;
        // A legal teleport (stairs / "Kẹt?" / fell through), counted with the others: new window from here. D4: the
        // trusted point takes it at once only while the window's instant metres stay ≤ NET.respawnTrust (a chain of
        // short hops gets one hop) and the team's teleports are not suspicious; otherwise it follows at the trust rate.
        // the mode stays the last pose's (review: forced 'walk', a rider's 0 m respawn passed the boxRiding check)
        const l = this.liveOf(t.id, a.since, { x: m.x, y: m.y, z: m.z, yaw: m.yaw, mode: 'walk', action: 'none' });
        const pose: PoseSample = { x: m.x, y: m.y, z: m.z, yaw: m.yaw, mode: l.pose.mode, action: 'none' };
        const d = Math.hypot(m.x - l.pose.x, m.z - l.pose.z);
        const suspicious = this.teleport(t, l, d, now, 'respawn', { how: m.how, d: Math.round(d) });
        const near = Math.hypot(m.x - l.trust.x, m.z - l.trust.z);
        const r = l.tp!; // set by teleport()
        const instant = !suspicious && r.g + near <= NET.respawnTrust;
        if (instant) r.g += near;
        this.follow(l, pose, now, instant ? near : 0);
        (l.win = new SpeedWindow()).reset(now, m.x, m.z);
        Object.assign(l, { bikeAt: 0, over: false });
        this.moved(t.slot, now);
        return this.engine.onPose(t.id, l.valid, now);
      }
      case 'race':
        if (a.role !== TEAM) return;
        // Phase 8 (D20): the ops that may write a row are budgeted like bike ops (not checkin / book: the mat check-in
        // runs every 2 s, critic S4; not open either: F pressed again and again at a box while the race is not open yet
        // (lobby / paused) or out of reach writes nothing, and a box opens once — a branch box again only after a counted
        // branch switch (review R-7))
        if ((m.op === 'answer' || m.op === 'accept' || m.op === 'branch' || m.op === 'room') && this.count(a.team, 'race', now) > NET.maxRaceOps) return this.close(ws, CLOSE.tooFast, 'too many race ops');
        // D4: judged at the trusted pose (the client sends its pose right before the op, on the same socket)
        return this.engine.onOp(a.team, m, this.live.get(a.team)?.valid ?? null, now);
      case 'host.race':
      case 'host.leg':
      case 'host.review': // isClientMessage: Host sockets only
      case 'host.finishPenalty':
        this.engine.onHost(m, (r) => this.send(ws, r), now);
        this.cq.tick(now); // a Host undo of a CETIQLO timeout release puts the team back in the queue
        return this.soon(now);
      case 'host.flag': {
        // Phase 10 (V3, plan §4.2 / M5): a mark only; the history stays in `events`; new evidence flags the team again
        // (Live.over / tp untouched). 3 rows: the event + teams.state, written before the Host hears.
        const t = this.team(m.team);
        if (!t) return this.send(ws, { t: 'host.notice', level: 'error', message: 'Không có đội này.' });
        const s = this.teamState(t);
        if (!s.flagged) return this.send(ws, { t: 'host.notice', level: 'warning', message: 'Đội này không có cờ.' });
        this.ctx.storage.transactionSync(() => {
          this.event(now, t.id, 'host.unflag', { why: s.flagWhy, since: s.flagAt });
          this.saveTeamState(t, { ...s, flagged: false, flagWhy: [], flagAt: null });
        });
        return this.pushHostState(now);
      }
    }
  }

  /** Socket closed (by the client, by us, or found dead): the team goes offline unless a newer device took over. */
  private onGone(ws: WebSocket) {
    if (this.gone.has(ws)) return;
    this.gone.add(ws);
    const a = att(ws);
    const team = a?.role === TEAM ? this.team(a.team) : undefined;
    const l = team && this.live.get(team.id);
    // It stood at its last valid pose until the socket's last sign of life (poses and pings share one ordered stream).
    if (l && !l.over) l.validAt = Math.max(l.validAt, this.lastHeard(ws));
    if (!team || this.sockets(team.id).length) return;
    const now = Date.now();
    this.saveTeamState(team, { ...this.teamState(team), lastSeen: now });
    this.event(now, team.id, 'disconnect');
    this.engine.left(team.id, now);
    this.cq.offline(team.id, now);
    this.setRoom(team, null);
    if (l) Object.assign(l, { win: undefined, over: false });
    this.writeSnapshot(now); // SPEC §8.10: where it stood, at once
    this.broadcast({ t: 'team', slot: team.slot, online: false });
    this.soon(now);
  }

  // ── tick loop ──
  private moved(slot: number, now: number) {
    this.dirty.add(slot);
    this.lastPoseAt = now;
    this.snapshotAt ??= now + NET.snapshotMs;
    this.replayAt ??= now + NET.replayMs;
    this.soon(now);
  }

  /** host.state due within NET.slowTickMs; (re)starts the loop. */
  private soon(now: number) {
    this.hostAt ??= now + NET.slowTickMs;
    this.timer ??= setTimeout(() => this.loop(), 1000 / NET.tickHz);
  }

  /** Every 200 ms while poses arrive (+ until due writes are done): ticks, then the slower chores. */
  private loop() {
    this.timer = null;
    const now = Date.now();
    this.sendTicks(now);
    if (now >= this.slowAt) {
      this.slowAt = now + NET.slowTickMs;
      // ponytail: abandonment / dead sockets / boxes run only while the loop runs (someone moved within idleStopMs);
      // a standing team needs no box check, dead sockets are also swept by the bike alarm.
      this.bikes.tick(this.players(), this.online(), now);
      this.closeDead(now);
      if (now - this.lastPoseAt < NET.idleStopMs) this.replayBuf.push(encodeTick(now, this.peers()));
    }
    if (now >= this.boxAt) {
      this.boxAt = now + NET.boxCheckMs;
      this.checkBoxes(now);
    }
    if (this.snapshotAt !== null && now >= this.snapshotAt) this.writeSnapshot(now);
    if (this.replayAt !== null && now >= this.replayAt) this.writeReplay(now);
    if (this.hostAt !== null && now >= this.hostAt) this.pushHostState(now);
    const busy = now - this.lastPoseAt < NET.idleStopMs || this.snapshotAt !== null || this.replayAt !== null || this.hostAt !== null;
    if (busy) this.timer = setTimeout(() => this.loop(), 1000 / NET.tickHz);
  }

  /** SPEC §7: each socket gets the online teams within NET.interestRadius (Host / spectator: all; §17.40: a finished team
   *  in the watch mode: all but itself), only when one of them moved or the set changed. */
  private sendTicks(now: number) {
    const peers = this.peers();
    for (const ws of this.sockets()) {
      const a = att(ws);
      // D4: no remote scan (the radius is measured from the trusted point); `watch` is trusted only once the team is over
      const viewer = a.role !== TEAM ? null : { team: a.team, pose: this.live.get(a.team)?.valid ?? null, all: !!a.watch && this.engine.over(a.team) };
      const entries = tickEntries(viewer, peers, NET.interestRadius);
      if (!needsTick(entries, this.dirty, this.sentKey.get(ws))) continue;
      this.sentKey.set(ws, tickKey(entries));
      this.send(ws, encodeTick(now, entries));
    }
    this.dirty.clear();
  }

  /** SPEC §17.10: the current step's box to that team only, within radius; hidden beyond radius + hysteresis. An opened
   *  box (a detour branch's, until the Host approves) is never hidden (Phase 8 critic S2). */
  private checkBoxes(now: number) {
    const r = this.engine.rules().boxReveal;
    for (const ws of this.sockets(TEAM)) {
      const a = att(ws);
      const l = this.live.get(a.team);
      const box = this.engine.currentBox(a.team, now);
      if (!l || !box || box.opened) continue;
      const key = boxKey(box);
      const was = a.box === key;
      const vis = boxVisible(was, Math.hypot(l.valid.x - box.x, l.valid.z - box.z), r);
      if (vis === was) continue;
      ws.serializeAttachment({ ...a, box: vis ? key : null } satisfies Attachment);
      this.send(ws, vis ? { t: 'box', op: 'reveal', box } : { t: 'box', op: 'hide', step: box.step });
    }
  }

  /** Last valid pose of ALL teams + counters: 1 upserted row (SPEC §3). */
  private writeSnapshot(now: number) {
    this.snapshotAt = null;
    this.counters.rows += 1;
    const poses = Object.fromEntries([...this.live].map(([id, l]) => [id, encodePose(l.valid)]));
    const at = Object.fromEntries([...this.live].map(([id, l]) => [id, l.validAt]));
    const data = JSON.stringify({ seq: ++this.snapSeq, poses, at, counters: this.counters });
    this.sql.exec('INSERT INTO snapshot (id, t, data) VALUES (1, ?, ?) ON CONFLICT (id) DO UPDATE SET t = excluded.t, data = excluded.data', now, data);
  }

  /** Replay: the 1 Hz samples (tick arrays of the online teams) of the last NET.replayMs in one row. */
  private writeReplay(now: number) {
    this.replayAt = null;
    if (!this.replayBuf.length) return;
    this.sql.exec('INSERT OR REPLACE INTO replay (t, data) VALUES (?, ?)', now, JSON.stringify(this.replayBuf));
    this.replayBuf = [];
    this.counters.rows += 1;
  }

  private pushHostState(now: number) {
    this.hostAt = null;
    const hosts = this.sockets(HOST);
    if (!hosts.length) return;
    const st = this.hostState(now);
    for (const ws of hosts) this.send(ws, st);
  }

  /** Close sockets silent for NET.deadSocketMs (no message, no auto-answered ping). */
  private closeDead(now: number) {
    for (const ws of this.sockets()) if (now - this.lastHeard(ws) > NET.deadSocketMs) this.close(ws, CLOSE.silent, 'silent');
  }

  /** A socket's last sign of life: accepted, a message, or an auto-answered ping. */
  private lastHeard(ws: WebSocket): number {
    return Math.max(att(ws).since, this.ctx.getWebSocketAutoResponseTimestamp(ws)?.getTime() ?? 0, this.seen.get(ws)?.last ?? 0);
  }

  private tooFast(ws: WebSocket, now: number): boolean {
    const r = this.seen.get(ws);
    if (!r || now - r.start >= 1000) {
      this.seen.set(ws, { start: now, n: 1, last: now });
      return false;
    }
    r.last = now;
    return ++r.n > NET.maxMessagesPerSec;
  }

  // ── Host ──
  /** SPEC §13.1: name + colour (+ player) → 6-char codes; written before the Host hears back.
   *  ponytail: teams already online learn about teams created later only on their next welcome (no team-list message);
   *  add one if the Host must add teams mid-race. */
  private createTeams(teams: { name: string; colour: string; player?: string }[], now: number) {
    let slot = Math.max(-1, ...this.teams().map((t) => t.slot)) + 1;
    for (const t of teams) {
      const id = `t${slot}`;
      this.sql.exec('INSERT INTO teams (id, code, slot, name, colour, player, created_at, state) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', id, this.newCode(), slot++, t.name, t.colour, t.player ?? '', now, JSON.stringify(this.teamState()));
      this.counters.rows += 2; // + the UNIQUE(code) index
      this.teamRows = null;
    }
    this.event(now, null, 'host.createTeams', { n: teams.length });
    this.pushHostState(now);
  }

  private newCode(prefix = ''): string {
    const bytes = new Uint8Array(NET.codeLength - prefix.length);
    for (;;) {
      const code = prefix + Array.from(crypto.getRandomValues(bytes), (b) => NET.codeAlphabet[b % NET.codeAlphabet.length]).join('');
      // never a team's code, never the spectator code (both ways: a team code may start with the prefix too)
      if (!this.teams().some((t) => t.code === code) && code !== getMeta(this.sql, SPECTATOR_CODE)) return code;
    }
  }

  /** SPEC §17.40: the race's spectator code ("K" + 5), made on first use and kept in meta (1 row, before any reply). */
  private spectatorCode(): string {
    return getMeta(this.sql, SPECTATOR_CODE) ?? this.rotateSpectatorCode(Date.now());
  }

  /** A new spectator code (first one, or the Host's "Đổi mã"): written before anyone hears it. */
  private rotateSpectatorCode(now: number): string {
    const code = this.newCode(NET.spectatorPrefix);
    this.setMeta(SPECTATOR_CODE, code);
    this.event(now, null, 'host.spectator', { n: this.sockets(SPECTATOR).length });
    return code;
  }

  private hostState(now: number): HostState {
    const online = this.online();
    const teams = this.teams().map((t) => {
      const s = this.teamState(t);
      const { startOrder, step, finishAt, penaltyMinutes, joinedAt, finishPenalty } = s;
      return { ...this.info(t, online), code: t.code, player: t.player, lastSeen: s.lastSeen, reconnects: s.reconnects, pose: this.live.get(t.id)?.pose ?? null, flagged: s.flagged, flagWhy: s.flagWhy, flagAt: s.flagAt, startOrder, step, finishAt, penaltyMinutes, joinedAt, finishPenalty };
    });
    const race = this.engine.hostView(now);
    const cetiqlo = this.cq.hostView(now);
    // ponytail: `steps` (Phase 6 corridor points: start + route / Pit Stop zones) stays until the Host page reads `leg`
    const steps = race.leg && [{ id: 'start', ...race.leg.start }, ...race.leg.steps.filter((s) => s.type === 'route_info' || s.type === 'pit_stop').map(({ id, x, z }) => ({ id, x, z }))];
    return {
      t: 'host.state', serverMs: now, status: this.engine.status, teams, counters: this.counters.toJSON(), bikes: this.bikes.list(), spawning: this.bikes.spawning,
      spectatorCode: this.spectatorCode(), spectators: this.sockets(SPECTATOR).length, ...(steps ? { steps } : {}), ...(cetiqlo.length ? { cetiqlo } : {}), ...race,
    };
  }

  // ── helpers ──
  private teams(): TeamRow[] {
    return (this.teamRows ??= this.sql.exec<TeamRow>('SELECT * FROM teams ORDER BY slot').toArray());
  }

  private team(id: string): TeamRow | undefined {
    return this.teams().find((t) => t.id === id);
  }

  private teamState(row?: TeamRow): TeamState {
    return { reconnects: 0, lastSeen: null, flagged: false, flagWhy: [], flagAt: null, ...NEW_TEAM_RACE, ...(row ? (JSON.parse(row.state) as Partial<TeamState>) : {}) };
  }

  /** 1 row written. */
  private saveTeamState(row: TeamRow, s: TeamState) {
    const state = JSON.stringify(s);
    this.sql.exec('UPDATE teams SET state = ? WHERE id = ?', state, row.id);
    row.state = state; // the cache only after the write (a failed write / rolled-back transaction leaves it as it was)
    this.counters.rows += 1;
  }

  /** Phase 10 (V3): red flag + why (SPEC §13.9, a mark only): the first raise → flagAt = now (1 row); a new reason on a
   *  flagged team → appended (1 row, ≤ 3 per flag); a known one → 0 rows. */
  private flag(t: TeamRow, why: FlagWhy, now: number) {
    const s = this.teamState(t);
    if (s.flagged && s.flagWhy.includes(why)) return;
    this.saveTeamState(t, s.flagged ? { ...s, flagWhy: [...s.flagWhy, why] } : { ...s, flagged: true, flagWhy: [why], flagAt: now });
  }

  /** Race event, written at once (2 rows: table + index). */
  private event(t: number, team: string | null, type: string, data: unknown = {}) {
    addEvent(this.sql, t, team, type, data);
    this.counters.rows += 2;
  }

  /** Arms the alarm; an earlier one already armed (bike spawning, a finish-line penalty's end) stays: alarm() runs both jobs. */
  private setAlarm(at: number) {
    void this.ctx.storage.getAlarm().then((cur) => (cur === null || at < cur ? this.ctx.storage.setAlarm(at) : undefined));
    this.counters.rows += 1;
  }

  /** Open sockets (all, or by tag: role or team id). */
  private sockets(tag?: string): WebSocket[] {
    return this.ctx.getWebSockets(tag).filter((ws) => !this.gone.has(ws));
  }

  private online(): Set<string> {
    return new Set(this.sockets(TEAM).map((ws) => att(ws).team));
  }

  /** Online teams with a known pose (ticks, replay). */
  private peers(): Peer[] {
    const online = this.online();
    return this.teams().flatMap((t) => {
      const l = online.has(t.id) && this.live.get(t.id);
      return l ? [{ team: t.id, slot: t.slot, pose: l.pose }] : [];
    });
  }

  /** Online teams at their trusted point (D4; bike spawning keeps clear of them, ridden bikes follow them, abandonment
   *  and each team's bike view measure from them). */
  private players(): PlayerSpot[] {
    return this.peers().map((p) => {
      const v = this.live.get(p.team)!.valid;
      return { team: p.team, x: v.x, z: v.z };
    });
  }

  private info(t: TeamRow, online: Set<string>): TeamInfo {
    const ws = online.has(t.id) ? this.sockets(t.id).at(-1) : undefined; // the newest socket (an older one is being kicked)
    return { slot: t.slot, id: t.id, name: t.name, colour: t.colour, online: online.has(t.id), racing: racing(this.teamState(t)), ...(ws ? { avatar: att(ws).avatar ?? 0 } : {}) };
  }

  private welcome(role: Role, team: TeamRow | undefined, race: RaceWelcome | null, now: number): Welcome {
    const { movement, presence } = this.engine.rules();
    const online = this.online();
    const l = team && this.live.get(team.id);
    // Track C: a team sees only its own bikes + free / standing ones near it (forTeam); the Host sees all; a spectator none.
    const myBikes = team ? this.bikes.forTeam(team.id, l ? { team: team.id, x: l.valid.x, z: l.valid.z } : null) : role === HOST ? this.bikes.list() : [];
    return {
      t: 'welcome', v: PROTOCOL_VERSION, race: this.race, serverMs: now, status: this.engine.status, role,
      teams: this.teams().map((t) => this.info(t, online)), movement,
      presence: { ...presence, interestRadius: NET.interestRadius },
      ...(team ? { team: { ...this.info(team, online), player: team.player } } : {}),
      // SPEC §8.10: last valid pose (from the snapshot row after a restart) + the bike it holds (track C's list).
      pose: team && l ? { ...l.valid, bikeId: myBikes.find((b) => b.owner === team.id)?.id ?? null } : null,
      bikes: myBikes,
      ...(race ?? { boxes: [], view: null, startOrder: null, showStartOrder: false, start: null }),
    };
  }

  private send(ws: WebSocket, m: ServerMessage) {
    try {
      ws.send(JSON.stringify(m));
      this.counters.wsOut++;
    } catch {
      /* closing socket */
    }
  }

  /** To every socket (teams and Hosts) except `skip`. */
  private broadcast(m: ServerMessage, skip?: WebSocket) {
    for (const ws of this.sockets()) if (ws !== skip) this.send(ws, m);
  }

  /** Leg 3: a team's room changed (or null): the Host and every spectator hear it. */
  private setRoom(team: { id: string; slot: number }, room: RoomAt | null) {
    const was = this.rooms.get(team.id);
    if (room) this.rooms.set(team.id, room);
    else this.rooms.delete(team.id);
    const same = was && room && was.kind === room.kind && was.x === room.x && was.z === room.z && was.yaw === room.yaw;
    if (!same) for (const ws of [...this.sockets(HOST), ...this.sockets(SPECTATOR)]) this.send(ws, { t: 'room', slot: team.slot, room });
  }

  /** Close + handle as gone at once (a dead peer never answers the close frame). */
  private close(ws: WebSocket, code: number, reason: string) {
    try {
      ws.close(code, reason);
    } catch {
      /* already closed */
    }
    this.onGone(ws);
  }

  /** Persists a race-level key (track C / Phase 7: status, seed, candidates). 1 row written. */
  protected setMeta(key: string, value: string) {
    setMeta(this.sql, key, value);
    this.counters.rows += 1;
  }
}
