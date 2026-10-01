// One Durable Object per race (SPEC §3): the authority for teams, poses, bikes and (Phase 7) the race itself.
// Foundation (docs/plans/phase6.md §4): schema + migration, login, WebSocket Hibernation accept with token check and
// one-device-per-team, `welcome`, Host team creation, quota counters. Track A fills the tick loop, snapshots, speed
// check, disconnects; track C the bikes. Rebuild rule: nothing lives only in memory — every handler reads SQLite lazily.
import { DurableObject } from 'cloudflare:workers';
import { CLOSE, decodePose, isClientMessage, NET, parseFrame, PROTOCOL_VERSION, type ClientMessage, type HostState, type PoseSample, type QuotaCounters as Counters, type Role, type ServerMessage, type TeamInfo, type Welcome } from '@race/shared/protocol';
import { HOST, newClaims, signToken, verifyToken } from './auth.ts';
import { QuotaCounters } from './counters.ts';
import { addEvent, getMeta, migrate, setMeta, type TeamRow } from './db.ts';
import type { Env } from './index.ts';
import { BikeService } from './race/BikeService.ts';
import { legRules } from './race/leg.ts';
import type { PlayerSpot } from './race/VehicleSpawner.ts';

/** Per-socket facts that survive hibernation (ws.serializeAttachment). */
interface Attachment {
  role: Role;
  team: string;
}

/** Per-team race state kept in teams.state (JSON); Phase 7 adds step / clue fields. */
interface TeamState {
  bikeId: string | null;
  riding: boolean;
  reconnects: number;
  lastSeen: number | null;
}

/** What the client sent last (memory only; the snapshot row persists it every NET.snapshotMs, track A). */
interface Live {
  pose: PoseSample;
  at: number;
}

const TEAM = 'team';
const json = (body: unknown, status = 200) => Response.json(body, { status });

export class RaceRoom extends DurableObject<Env> {
  private readonly sql: SqlStorage;
  readonly counters: QuotaCounters;
  private readonly live = new Map<string, Live>();
  /** Failed team-code logins per client address (SPEC §8.10: 5 → 60 s). ponytail: memory only, forgotten on restart. */
  private readonly loginFails = new Map<string, { n: number; until: number }>();
  /** Shared bikes (track C) behind one seam. */
  private readonly bikes: BikeService;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    migrate(this.sql);
    const snap = this.sql.exec<{ data: string }>('SELECT data FROM snapshot WHERE id = 1').toArray()[0];
    this.counters = QuotaCounters.from(snap ? (JSON.parse(snap.data) as { counters?: Counters }).counters : undefined);
    this.bikes = new BikeService({
      sql: this.sql,
      counters: this.counters,
      cfg: legRules().vehicles,
      send: (team, m) => this.ctx.getWebSockets(team).forEach((ws) => this.send(ws, m)),
      broadcast: (m) => this.broadcast(m),
      setAlarm: (at) => {
        void this.ctx.storage.setAlarm(at);
        this.counters.rows += 1;
      },
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
    if (request.method === 'GET' && url.pathname === '/ws') return this.upgrade(request, url.searchParams.get('token'));
    return json({ ok: false, error: 'not_found' }, 404);
  }

  /** SPEC §7 / §8.10: team code → token + a summary for the "Chào mừng trở lại" screen. */
  private async login(request: Request): Promise<Response> {
    const ip = request.headers.get('CF-Connecting-IP') ?? 'local';
    const now = Date.now();
    const fails = this.loginFails.get(ip);
    if (fails && fails.until > now) return json({ ok: false, error: 'locked', retryMs: fails.until - now }, 429);
    const body = (await request.json().catch(() => null)) as { code?: unknown } | null;
    const code = typeof body?.code === 'string' ? body.code.trim().toUpperCase() : '';
    const team = code ? this.sql.exec<TeamRow>('SELECT * FROM teams WHERE code = ?', code).toArray()[0] : undefined;
    if (!team) {
      const n = (fails?.until ?? 0) > now ? 1 : (fails?.n ?? 0) + 1;
      this.loginFails.set(ip, { n, until: n >= NET.loginAttempts ? now + NET.loginLockMs : 0 });
      return json({ ok: false, error: 'bad_code' }, 401);
    }
    this.loginFails.delete(ip);
    const token = await signToken(this.env.HOST_PASSWORD, newClaims(this.race, team.id, now));
    addEvent(this.sql, now, team.id, 'login', { ip });
    this.counters.rows += 2;
    const s = this.teamState(team);
    return json({ ok: true, token, team: this.info(team), summary: { reconnects: s.reconnects, lastSeen: s.lastSeen, raceTime: null } });
  }

  /** WebSocket upgrade: a valid token for this race → Hibernation API accept, one socket per team (§8.10), `welcome`. */
  private async upgrade(request: Request, token: string | null): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') return json({ ok: false, error: 'expected_websocket' }, 426);
    const claims = await verifyToken(this.env.HOST_PASSWORD, token, this.race);
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    if (!claims) {
      // Accept, then close with the reason: the browser sees the code (a 401 response gives it only "failed").
      server.accept();
      server.close(CLOSE.badToken, 'bad token');
      return new Response(null, { status: 101, webSocket: client });
    }
    const role: Role = claims.t === HOST ? HOST : TEAM;
    const team = role === TEAM ? this.sql.exec<TeamRow>('SELECT * FROM teams WHERE id = ?', claims.t).toArray()[0] : undefined;
    if (role === TEAM && !team) {
      server.accept();
      server.close(CLOSE.badToken, 'unknown team');
      return new Response(null, { status: 101, webSocket: client });
    }
    const now = Date.now();
    if (team) {
      for (const old of this.ctx.getWebSockets(team.id)) {
        this.send(old, { t: 'kick', reason: 'otherDevice' });
        old.close(CLOSE.otherDevice, 'logged in elsewhere');
      }
      const s = this.teamState(team);
      this.saveTeamState(team.id, { ...s, reconnects: s.reconnects + 1, lastSeen: now });
      addEvent(this.sql, now, team.id, 'connect', {});
      this.counters.rows += 2;
    }
    const tags = [role, ...(team ? [team.id] : [])];
    this.ctx.acceptWebSocket(server, tags);
    server.serializeAttachment({ role, team: team?.id ?? HOST } satisfies Attachment);
    this.send(server, this.welcome(role, team, now));
    if (team) this.broadcast({ t: 'team', slot: team.slot, online: true }, server);
    return new Response(null, { status: 101, webSocket: client });
  }

  // ── Hibernation API events ──
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    this.counters.wsIn++;
    const a = ws.deserializeAttachment() as Attachment;
    const m = parseFrame(message, a.role === HOST ? NET.maxHostBytes : NET.maxPlayerBytes);
    if (m === null) return ws.close(CLOSE.tooBig, 'bad frame');
    const pose = decodePose(m);
    if (pose) return this.onPose(a, pose, Date.now());
    if (!isClientMessage(m, a.role)) return ws.close(CLOSE.badMessage, 'bad message');
    this.onMessage(ws, a, m as ClientMessage, Date.now());
  }

  async webSocketClose(ws: WebSocket, _code: number, _reason: string, _wasClean: boolean) {
    this.onGone(ws);
  }

  async webSocketError(ws: WebSocket, _error: unknown) {
    this.onGone(ws);
  }

  /** Periodic bike spawning (SPEC §3, §6.2 (4)): track C arms it while players are online. */
  async alarm() {
    this.counters.alarms++;
    this.bikes.alarm(this.players(), Date.now());
  }

  /** Online teams with a known pose (bike spawning keeps clear of them, abandonment measures from them). */
  private players(): PlayerSpot[] {
    const online = new Set(this.ctx.getWebSockets(TEAM).map((s) => (s.deserializeAttachment() as Attachment).team));
    return [...this.live].filter(([team]) => online.has(team)).map(([team, l]) => ({ team, x: l.pose.x, z: l.pose.z }));
  }

  // ── handlers (track A: poses / ticks / snapshots / speed; track C: bikes) ──
  private onPose(a: Attachment, pose: PoseSample, now: number) {
    if (a.role !== TEAM) return;
    // ponytail (foundation): remembered only; track A adds the speed window, the 5 Hz tick and the snapshot flush.
    this.live.set(a.team, { pose, at: now });
  }

  private onMessage(ws: WebSocket, a: Attachment, m: ClientMessage, now: number) {
    if (Array.isArray(m)) return;
    switch (m.t) {
      case 'host.createTeams':
        return this.createTeams(ws, m.teams, now);
      case 'host.candidates':
      case 'host.bike':
      case 'host.spawning':
        return this.bikes.onHost(m, now);
      case 'bike': {
        const l = this.live.get(a.team);
        return this.bikes.onTeam(a.team, l ? { team: a.team, x: l.pose.x, z: l.pose.z } : null, m, false /* Phase 7: current step transport */, now);
      }
      case 'gesture': {
        const team = this.team(a.team);
        if (team) this.broadcast({ t: 'gesture', slot: team.slot, g: m.g }, ws);
        return;
      }
      default:
        // respawn: track A (speed window reset + event).
        return;
    }
  }

  private onGone(ws: WebSocket) {
    const a = ws.deserializeAttachment() as Attachment | null;
    if (!a || a.role !== TEAM) return;
    if (this.ctx.getWebSockets(a.team).some((s) => s !== ws)) return; // replaced by a newer device
    const team = this.team(a.team);
    if (!team) return;
    this.saveTeamState(team.id, { ...this.teamState(team), lastSeen: Date.now() });
    this.broadcast({ t: 'team', slot: team.slot, online: false });
  }

  // ── Host ──
  /** SPEC §13.1: name + colour (+ player) → 6-char codes; written before the Host hears back. */
  private createTeams(ws: WebSocket, teams: { name: string; colour: string; player?: string }[], now: number) {
    let slot = (this.sql.exec<{ n: number | null }>('SELECT MAX(slot) AS n FROM teams').one().n ?? -1) + 1;
    for (const t of teams) {
      const id = `t${slot}`;
      this.sql.exec('INSERT INTO teams (id, code, slot, name, colour, player, created_at, state) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', id, this.newCode(), slot++, t.name, t.colour, t.player ?? '', now, JSON.stringify(this.teamState()));
      this.counters.rows += 2; // + the UNIQUE(code) index
    }
    addEvent(this.sql, now, null, 'host.createTeams', { n: teams.length });
    this.counters.rows += 2;
    this.send(ws, this.hostState(now));
  }

  private newCode(): string {
    const bytes = crypto.getRandomValues(new Uint8Array(NET.codeLength));
    for (;;) {
      const code = Array.from(bytes, (b) => NET.codeAlphabet[b % NET.codeAlphabet.length]).join('');
      if (!this.sql.exec('SELECT 1 FROM teams WHERE code = ?', code).toArray().length) return code;
      crypto.getRandomValues(bytes);
    }
  }

  private hostState(now: number): HostState {
    const online = new Set(this.ctx.getWebSockets(TEAM).map((s) => (s.deserializeAttachment() as Attachment).team));
    const teams = this.sql.exec<TeamRow>('SELECT * FROM teams ORDER BY slot').toArray().map((t) => {
      const s = this.teamState(t);
      return { ...this.info(t, online), code: t.code, player: t.player, lastSeen: s.lastSeen, reconnects: s.reconnects, pose: this.live.get(t.id)?.pose ?? null, flagged: false };
    });
    return { t: 'host.state', serverMs: now, status: this.status, teams, counters: this.counters.toJSON(), bikes: this.bikes.list(), spawning: this.bikes.spawning };
  }

  // ── helpers ──
  private get status() {
    return (getMeta(this.sql, 'status') as Welcome['status'] | undefined) ?? 'lobby';
  }

  private team(id: string): TeamRow | undefined {
    return this.sql.exec<TeamRow>('SELECT * FROM teams WHERE id = ?', id).toArray()[0];
  }

  private teamState(row?: TeamRow): TeamState {
    return { bikeId: null, riding: false, reconnects: 0, lastSeen: null, ...(row ? (JSON.parse(row.state) as Partial<TeamState>) : {}) };
  }

  /** 1 row written. */
  private saveTeamState(id: string, s: TeamState) {
    this.sql.exec('UPDATE teams SET state = ? WHERE id = ?', JSON.stringify(s), id);
    this.counters.rows += 1;
  }

  private info(t: TeamRow, online = new Set(this.ctx.getWebSockets(TEAM).map((s) => (s.deserializeAttachment() as Attachment).team))): TeamInfo {
    return { slot: t.slot, id: t.id, name: t.name, colour: t.colour, online: online.has(t.id) };
  }

  private welcome(role: Role, team: TeamRow | undefined, now: number): Welcome {
    const { movement, presence } = legRules();
    const teams = this.sql.exec<TeamRow>('SELECT * FROM teams ORDER BY slot').toArray().map((t) => this.info(t));
    const s = team && this.teamState(team);
    const live = team && this.live.get(team.id);
    return {
      t: 'welcome', v: PROTOCOL_VERSION, race: this.race, serverMs: now, status: this.status, role, teams, movement,
      presence: { ...presence, interestRadius: NET.interestRadius },
      ...(team && s ? { team: { ...this.info(team), player: team.player } } : {}),
      pose: live && s ? { ...live.pose, bikeId: s.bikeId } : null, // track A: from the snapshot row after a restart
      raceTime: null,
      bikes: this.bikes.list(),
      boxes: [], // track A / Phase 7: opened boxes + the current one when the saved pose is within boxReveal.radius
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
    const text = JSON.stringify(m);
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === skip) continue;
      try {
        ws.send(text);
        this.counters.wsOut++;
      } catch {
        /* closing socket */
      }
    }
  }

  /** Persists a race-level key (track A / C use it for status, seed, candidates). 1 row written. */
  protected setMeta(key: string, value: string) {
    setMeta(this.sql, key, value);
    this.counters.rows += 1;
  }
}
