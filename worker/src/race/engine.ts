// Phase 7 track A (docs/plans/phase7.md §5.2): the race engine behind one seam, like BikeService. RaceRoom hands it
// trusted poses, race ops and Host race ops; it owns the loaded leg (meta 'leg'), the race status (meta 'status'),
// step_progress (cache + writes) and the team race fields in teams.state; it applies steps.ts effects — SQLite first,
// in one transaction, the cache patched only once it committed, THEN the answers (SPEC §3) — and builds the welcome /
// host.state parts.
import { branchZone, parseLeg, startSpot, stepZones, type Leg, type LegIssue, type Zone } from '@race/shared/leg';
import { latLonToWorld } from '@race/shared';
import type { BoxInfo, HostMessage, HostState, PoseSample, RaceOp, RaceStatus, RaceView, ServerMessage, StepProgressView, Welcome, ZoneMember } from '@race/shared/protocol';
import type { QuotaCounters } from '../counters.ts';
import { emptyProgress, getMeta, readProgress, setMeta, writeProgress, type StepProgressRow } from '../db.ts';
import { BUNDLED_LEGS, bundledLeg, DEFAULT_LEG_ID, legRules } from './leg.ts';
import { officialMs, ranking } from './ranking.ts';
import { advance, boxesOf, cardOf, type Progress, type RaceEffect, type RaceInput } from './steps.ts';
import { verifyTask } from './tasks.ts';

/** Race fields of teams.state (JSON; RaceRoom keeps reconnects / lastSeen / flagged next to them). */
export interface TeamRace {
  /** Index of the current step. */
  step: number;
  /** SPEC §17.12: server ms the team got its first clue outside the game (Host input), null = not entered. */
  startAt: number | null;
  /** SPEC §17.12: 1 + the number of teams that entered the game before it; set at its first WebSocket entry, kept. */
  startOrder: number | null;
  /** server ms of that first entry (step 1's clue_opened_at when no start time is set). */
  joinedAt: number | null;
  finishAt: number | null;
  penaltyMinutes: number;
}

export const NEW_TEAM_RACE: TeamRace = { step: 0, startAt: null, startOrder: null, joinedAt: null, finishAt: null, penaltyMinutes: 0 };

export interface RaceIO {
  sql: SqlStorage;
  counters: QuotaCounters;
  /** ctx.storage.transactionSync: every row of one transition commits together or not at all. */
  transaction<T>(fn: () => T): T;
  /** To every socket of that team. */
  send(team: string, m: ServerMessage): void;
  /** Something the Host shows changed: host.state goes out within NET.slowTickMs. */
  changed(now: number): void;
  /** race_events row, written at once (2 rows). */
  event(t: number, team: string | null, type: string, data?: unknown): void;
  /** teams.state race fields (RaceRoom owns the teams cache; save = 1 row, its cache patched only after the write). */
  team(id: string): TeamRace | undefined;
  saveTeam(id: string, r: TeamRace): void;
  teamIds(): string[];
  slot(id: string): number;
  /** Teams with an open socket. */
  online(): string[];
  /** The team's trusted pose (RaceRoom: TrustedPoint, D4; mode = its last pose's), null = none yet. */
  pose(id: string): PoseSample | null;
  /** SPEC §6.4: the team's bike (if it holds one) to the rack `rack` at (x, z) (null = where the bike stands). */
  park(team: string, rack: string, at: { x: number; z: number } | null, now: number): void;
  /** A new leg was loaded (lobby, no team entered): the bikes start again from its `vehicles` block. */
  legLoaded(now: number): void;
}

export type HostRaceMessage = Extract<HostMessage, { t: 'host.race' | 'host.team' | 'host.leg' }>;

const STATUS_NOTICE = { lobby: 'raceNotOpen', paused: 'racePaused', finished: 'raceOver' } as const;
/** host.race op → [from statuses, to]. */
const MOVES: Record<'start' | 'pause' | 'resume' | 'finish', [RaceStatus[], RaceStatus, string]> = {
  start: [['lobby'], 'running', 'Chỉ mở được cuộc đua đang ở trạng thái chờ (lobby).'],
  pause: [['running'], 'paused', 'Chỉ tạm dừng được khi cuộc đua đang chạy.'],
  resume: [['paused'], 'running', 'Cuộc đua không ở trạng thái tạm dừng.'],
  finish: [['running', 'paused'], 'finished', 'Chỉ kết thúc được cuộc đua đang chạy hoặc đang tạm dừng.'],
};
/** host.team start times later than the server's now by more than this are refused (D15: Host typo). */
const FUTURE_SLACK_MS = 60_000;
const LEG_LOCKED = 'Đã có đội vào game trong cuộc đua này. Muốn đổi chặng, hãy tạo cuộc đua mới (race id mới): nạp chặng → tạo đội → phát mã → mở.';

export class RaceEngine {
  private legV!: Leg;
  private issues: LegIssue[] = [];
  private zones: Zone[] = [];
  private boxes: (Omit<BoxInfo, 'opened'> | null)[] = [];
  /** Every place of the leg (step zones + detour branch places), for D21 membership. */
  private places: Zone[] = [];
  private statusV: RaceStatus;
  /** team → step id → row (read once, patched after each committed write). */
  private readonly rows = new Map<string, Map<string, StepProgressRow>>();
  /** D21: the place (Zone.rack) each team stands in now + since when; the zone list last sent to it. Memory only. */
  private readonly where = new Map<string, { key: string; since: number }>();
  private readonly sentZone = new Map<string, string>();

  constructor(readonly io: RaceIO) {
    const saved = getMeta(io.sql, 'leg');
    if (saved) {
      // D11: re-parsed on every wake; a stored leg that no longer parses (schema changed later) is kept, its issues shown.
      const raw = JSON.parse(saved) as Leg;
      const r = parseLeg(raw);
      this.setLeg(r.ok ? r.leg : raw, r.issues);
    } else this.setLeg(bundledLeg(DEFAULT_LEG_ID)!, []);
    this.statusV = (getMeta(io.sql, 'status') as RaceStatus | undefined) ?? 'lobby';
    for (const r of readProgress(io.sql)) this.teamRows(r.team).set(r.step, r);
  }

  /** The loaded leg (meta 'leg'; the bundled default until the Host loads another). */
  get leg(): Leg {
    return this.legV;
  }

  /** movement / presence / vehicles / boxReveal of the loaded leg. */
  rules() {
    return legRules(this.legV);
  }

  get status(): RaceStatus {
    return this.statusV;
  }

  /** A team socket opened (RaceRoom.upgrade): the first ever entry gets its startOrder (SPEC §17.12). Nothing written
   *  here: RaceRoom saves startOrder + joinedAt in the teams.state row the connect writes anyway, in the same
   *  synchronous section (two sockets opening together get 1 and 2). */
  enter(team: string, _now: number): { startOrder: number; first: boolean } {
    const r = this.io.team(team)!;
    if (r.startOrder !== null) return { startOrder: r.startOrder, first: false };
    const n = this.io.teamIds().filter((id) => this.io.team(id)?.startOrder != null).length;
    return { startOrder: n + 1, first: true };
  }

  /** The race parts of a team's welcome (`first` = enter() said so; `pose` = its trusted pose, null = never seen). */
  welcome(team: string, pose: PoseSample | null, first: boolean, now: number): Pick<Welcome, 'view' | 'raceTime' | 'boxes' | 'startOrder' | 'showStartOrder' | 'start'> {
    const r = this.io.team(team)!;
    const view = this.view(team, now);
    const boxes: BoxInfo[] = [];
    for (let i = 0; i < r.step; i++) {
      const b = this.boxes[i];
      if (b && !b.kind && !boxes.some((o) => o.step === b.step)) boxes.push({ ...b, opened: true });
    }
    const cur = this.currentBox(team);
    if (cur && pose && Math.hypot(pose.x - cur.x, pose.z - cur.z) <= this.legV.boxReveal.radius) boxes.push({ ...cur, opened: false });
    return { view, raceTime: raceTime(r, now), boxes, startOrder: r.startOrder, showStartOrder: first, start: pose ? null : startSpot(this.legV, r.startOrder ?? 1) };
  }

  /** Login summary (SPEC §8.10 "Chào mừng trở lại"): race clock s + the current step's label. */
  summary(team: string, now: number): { raceTime: number | null; step: string | null } {
    const r = this.io.team(team);
    return r ? { raceTime: raceTime(r, now), step: this.legV.steps[r.step]?.label ?? null } : { raceTime: null, step: null };
  }

  /** A trusted pose (RaceRoom.onPose after TrustedPoint, respawns included): arrivals, Pit Stop, "Tại điểm này". */
  onPose(team: string, pose: PoseSample, now: number): void {
    this.step(team, { kind: 'pose', x: pose.x, z: pose.z, riding: pose.mode === 'bike' }, now);
    this.moveZone(team, pose, now);
  }

  /** A team's race op; `at` = its trusted pose (null = none yet). Refused ops write nothing. */
  onOp(team: string, m: RaceOp, at: PoseSample | null, now: number): void {
    const r = this.io.team(team);
    if (!r) return;
    if (m.op === 'book') return this.io.send(team, { t: 'book', cards: this.cards(team, r, now) });
    if (this.statusV !== 'running') {
      // the client's periodic check-in on the mat (D19) gets no toast while the race is not running
      if (m.op !== 'checkin') this.io.send(team, { t: 'notice', code: STATUS_NOTICE[this.statusV] });
      return;
    }
    if (!at) return this.io.send(team, { t: 'notice', code: m.op === 'task' ? 'taskFar' : 'boxFar' });
    const riding = at.mode === 'bike';
    const input: RaceInput =
      m.op === 'open' ? { kind: 'open', step: m.step, x: at.x, z: at.z, riding }
      : m.op === 'task' ? { kind: 'task', step: m.step, ...(m.branch !== undefined ? { branch: m.branch } : {}), ...(m.answer !== undefined ? { answer: m.answer } : {}), x: at.x, z: at.z }
      : { kind: 'checkin', x: at.x, z: at.z, riding };
    this.step(team, input, now);
  }

  /** Host race ops; `reply` answers that Host socket (host.legResult / host.notice). */
  onHost(m: HostRaceMessage, reply: (m: ServerMessage) => void, now: number): void {
    const notice = (level: 'error' | 'warning', message: string) => reply({ t: 'host.notice', level, message });
    if (m.t === 'host.race') {
      const [from, to, refused] = MOVES[m.op];
      if (!from.includes(this.statusV)) return notice('error', refused);
      this.meta('status', to);
      this.statusV = to;
      this.io.event(now, null, 'host.race', { op: m.op });
      for (const id of this.io.online()) {
        // D9: a team standing still in a zone / on the mat sends no pose: judge its last trusted pose now
        const p = this.io.pose(id);
        if (to === 'running' && p) this.onPose(id, p, now);
        this.io.send(id, { t: 'race', view: this.view(id, now) });
      }
      return this.io.changed(now);
    }
    if (m.t === 'host.team') {
      const r = this.io.team(m.team);
      if (!r) return notice('error', 'Không có đội này.');
      const at = m.at === 'now' ? now : m.at;
      if (at !== null && at > now + FUTURE_SLACK_MS) return notice('error', 'Giờ xuất phát nằm trong tương lai; kiểm tra lại ngày giờ và múi giờ của chặng.');
      if (at !== null && r.finishAt !== null && at > r.finishAt) return notice('error', 'Giờ xuất phát sau giờ về đích của đội; kiểm tra lại.');
      this.io.transaction(() => {
        this.io.event(now, m.team, 'host.start', { at });
        this.io.saveTeam(m.team, { ...r, startAt: at });
      });
      if (at !== null && r.joinedAt !== null && at > r.joinedAt)
        notice('warning', 'Đã lưu, nhưng giờ xuất phát muộn hơn lúc đội vào game: đội nhận mật thư ngoài game trước khi vào, giờ xuất phát thường sớm hơn.');
      this.io.send(m.team, { t: 'race', view: this.view(m.team, now) });
      return this.io.changed(now);
    }
    // host.leg (D11): lobby only, and only before any team entered the game
    const fail = (message: string, issues = [{ level: 'error' as const, where: 'cả file', message }]) => reply({ t: 'host.legResult', ok: false, issues });
    if (this.statusV !== 'lobby' || this.io.teamIds().some((id) => this.io.team(id)?.startOrder != null)) return fail(LEG_LOCKED);
    let input: unknown;
    if (m.id !== undefined) {
      input = bundledLeg(m.id);
      if (!input) return fail(`Không có chặng đóng gói "${m.id}"; có: ${BUNDLED_LEGS.join(', ')}.`);
    } else {
      try {
        input = JSON.parse(m.json!);
      } catch (e) {
        return fail(`File không phải JSON hợp lệ: ${(e as Error).message}`);
      }
    }
    const r = parseLeg(input);
    if (!r.ok) return reply({ t: 'host.legResult', ok: false, issues: r.issues });
    this.io.transaction(() => {
      this.meta('leg', JSON.stringify(r.leg));
      this.meta('legId', r.leg.id);
      this.io.event(now, null, 'host.leg', { id: r.leg.id, bundled: m.id !== undefined });
    });
    this.setLeg(r.leg, r.issues);
    this.io.legLoaded(now);
    reply({ t: 'host.legResult', ok: true, issues: r.issues });
    this.io.changed(now);
  }

  /** SPEC §17.10: the box of the team's current step (checkBoxes), null = none. */
  currentBox(team: string): Omit<BoxInfo, 'opened'> | null {
    const r = this.io.team(team);
    return (r && this.boxes[r.step]) ?? null;
  }

  /** SPEC §6.5: the current step is a walk-only route (BikeService.onTeam refuses claims). */
  walkOnly(team: string): boolean {
    const s = this.legV.steps[this.io.team(team)?.step ?? -1];
    return s?.type === 'route_info' && 'mandatory' in s.transport;
  }

  /** A team's socket went: it leaves the "Tại điểm này" lists of the others. */
  left(team: string, now: number) {
    const w = this.where.get(team);
    this.where.delete(team);
    this.sentZone.delete(team);
    if (w) this.refreshZones(new Set([w.key]), now);
  }

  /** host.state parts: leg summary, step_progress, ranking. */
  hostView(_now: number): Pick<HostState, 'leg' | 'progress' | 'ranking'> {
    const leg = this.legV;
    const s0 = latLonToWorld(leg.start.lat, leg.start.lon);
    const progress: StepProgressView[] = [];
    const ranks = this.io.teamIds().flatMap((id) => {
      const r = this.io.team(id);
      if (!r) return [];
      for (let i = 0; i <= Math.min(r.step, leg.steps.length - 1); i++) {
        const row = this.row(id, i, r);
        if (row) progress.push({ team: id, step: row.step, arrivedAt: row.arrived_at, openedAt: row.clue_opened_at, startedAt: row.task_started_at, completedAt: row.completed_at, branch: row.branch });
      }
      const wait = [...this.teamRows(id).values()].reduce((n, x) => n + x.approval_wait_seconds * 1000, 0);
      return [{ team: id, slot: this.io.slot(id), startOrder: r.startOrder, step: r.step, startAt: r.startAt, finishAt: r.finishAt, prevDoneAt: this.row(id, r.step - 1, r)?.completed_at ?? null, approvalWaitMs: wait }];
    });
    return {
      leg: {
        id: leg.id, title: leg.title, timezone: leg.timezone, start: { x: s0.x, z: s0.z },
        steps: leg.steps.map((s, i) => {
          const z = this.zones[i]!;
          const branches = s.type === 'detour' ? s.branches.map((b) => ({ id: b.id, ...pick(branchZone(leg, this.zones, i, b.id)!) })) : undefined;
          return { id: s.id, type: s.type, label: s.label, ...pick(z), ...(branches ? { branches } : {}) };
        }),
        vehicles: leg.vehicles, bundled: BUNDLED_LEGS, issues: this.issues,
      },
      progress,
      ranking: ranking(ranks, leg.hostApproval.approvalWaitCounts),
    };
  }

  // ── internals ──
  private setLeg(leg: Leg, issues: LegIssue[]) {
    this.legV = leg;
    this.issues = issues;
    this.zones = stepZones(leg);
    this.boxes = boxesOf(leg, this.zones);
    const all = [...this.zones, ...leg.steps.flatMap((s, i) => (s.type === 'detour' ? s.branches.map((b) => branchZone(leg, this.zones, i, b.id)!) : []))];
    this.places = all.filter((z, i) => all.findIndex((o) => o.rack === z.rack) === i);
  }

  private meta(key: string, value: string) {
    setMeta(this.io.sql, key, value);
    this.io.counters.rows += 1;
  }

  private teamRows(team: string) {
    let m = this.rows.get(team);
    if (!m) this.rows.set(team, (m = new Map()));
    return m;
  }

  /** Step i's row as the team sees it: step 1's clue_opened_at = its start time, else its first entry (D3, on read). */
  private row(team: string, i: number, r: TeamRace): StepProgressRow | undefined {
    const s = this.legV.steps[i];
    if (!s) return undefined;
    const row = this.teamRows(team).get(s.id);
    if (i > 0) return row;
    const opened = r.startAt ?? r.joinedAt;
    return opened === null && !row ? undefined : { ...(row ?? emptyProgress(team, s.id)), clue_opened_at: opened };
  }

  private progress(team: string, r: TeamRace): Progress {
    const row = this.teamRows(team).get(this.legV.steps[r.step]?.id ?? '');
    return { step: r.step, arrivedAt: row?.arrived_at ?? null, startedAt: row?.task_started_at ?? null, branch: row?.branch ?? null, finishAt: r.finishAt, penaltyMinutes: r.penaltyMinutes };
  }

  private view(team: string, now: number): RaceView {
    const r = this.io.team(team)!;
    const p = this.progress(team, r);
    const pit = this.legV.steps[r.step]?.type === 'pit_stop';
    return {
      status: this.statusV, startAt: r.startAt, finishAt: r.finishAt, penaltyMinutes: r.penaltyMinutes,
      card: this.legV.steps[r.step] ? cardOf(this.legV, r.step, this.row(team, r.step, r), now) : null,
      checkinAt: pit && r.finishAt === null && r.penaltyMinutes > 0 && p.arrivedAt !== null ? p.arrivedAt + r.penaltyMinutes * 60_000 : null,
      officialMs: officialMs({ ...r, approvalWaitMs: 0 }, true),
    };
  }

  private cards(team: string, r: TeamRace, now: number) {
    const out = [];
    for (let i = 0; i <= Math.min(r.step, this.legV.steps.length - 1); i++) out.push(cardOf(this.legV, i, this.row(team, i, r), now));
    return out;
  }

  /** One input through the state machine; effects written (one transaction) BEFORE anything is sent. */
  private step(team: string, input: RaceInput, now: number) {
    const r = this.io.team(team);
    if (!r) return;
    const { p, effects } = advance(this.legV, this.zones, this.progress(team, r), input, now, verifyTask, this.statusV === 'running');
    if (effects.length) this.apply(team, r, p, effects, now);
  }

  private apply(team: string, r: TeamRace, p: Progress, effects: RaceEffect[], now: number) {
    const steps = this.legV.steps;
    const dirty = new Map<string, StepProgressRow>();
    const edit = (i: number) => {
      const id = steps[i]!.id;
      let row = dirty.get(id);
      if (!row) dirty.set(id, (row = { ...(this.teamRows(team).get(id) ?? emptyProgress(team, id)) }));
      return row;
    };
    const events: [string, object][] = [];
    const out: ServerMessage[] = [];
    const parks: Extract<RaceEffect, { kind: 'park' }>[] = [];
    for (const e of effects) {
      if (e.kind === 'refuse') out.push({ t: 'notice', code: e.code });
      else if (e.kind === 'park') parks.push(e);
      else if (e.kind === 'arrive') {
        edit(e.step).arrived_at = now;
        events.push(['arrive', { step: steps[e.step]!.id }]);
      } else if (e.kind === 'start') Object.assign(edit(e.step), { task_started_at: now, branch: e.branch });
      else if (e.kind === 'complete') {
        edit(e.step).completed_at = now;
        if (steps[e.step + 1]) edit(e.step + 1).clue_opened_at = now;
        events.push(['complete', { step: steps[e.step]!.id }]);
        const box = this.boxes[e.step];
        if (box && !box.kind) out.push({ t: 'box', op: 'reveal', box: { ...box, opened: true } }); // D5: opened at once
        if (steps[e.step + 1]) out.push({ t: 'notice', code: 'clueNew' });
      } else {
        edit(p.step).completed_at = now;
        events.push(['finish', { officialMs: officialMs({ ...r, finishAt: now, approvalWaitMs: 0 }, true) }]);
      }
    }
    const next: TeamRace = { ...r, step: p.step, finishAt: p.finishAt };
    const teamChanged = next.step !== r.step || next.finishAt !== r.finishAt;
    if (dirty.size || events.length || teamChanged) {
      this.io.transaction(() => {
        for (const row of dirty.values()) this.io.counters.rows += writeProgress(this.io.sql, row);
        for (const [type, data] of events) this.io.event(now, team, type, data);
        if (teamChanged) this.io.saveTeam(team, next); // last: RaceRoom patches its cache only after this write
      });
      for (const row of dirty.values()) this.teamRows(team).set(row.step, row); // committed: patch the cache
      out.push({ t: 'race', view: this.view(team, now) });
    }
    for (const k of parks) this.io.park(team, k.rack, k.at, now);
    for (const m of out) this.io.send(team, m);
    if (dirty.size) {
      this.io.changed(now);
      if (teamChanged) this.refreshZones(new Set([this.where.get(team)?.key ?? '']), now);
    }
  }

  // ── D21 "Tại điểm này" ──
  /** The place (rack key) a trusted pose stands in, null = none. */
  private placeAt(x: number, z: number): string | null {
    return this.places.find((zn) => Math.hypot(x - zn.x, z - zn.z) <= zn.r)?.rack ?? null;
  }

  private moveZone(team: string, pose: PoseSample, now: number) {
    const key = this.placeAt(pose.x, pose.z);
    const was = this.where.get(team);
    if ((was?.key ?? null) === key) return;
    if (key) this.where.set(team, { key, since: now });
    else this.where.delete(team);
    this.refreshZones(new Set([was?.key ?? '', key ?? '']), now);
  }

  /** Racks of the places a team may get a zone list for: steps it did, + the current one once arrived (never a later
   *  step's place: SPEC §17.10, critic M3). */
  private eligible(team: string): Set<string> {
    const r = this.io.team(team);
    const out = new Set<string>();
    if (!r) return out;
    const leg = this.legV;
    for (let i = 0; i <= Math.min(r.step, leg.steps.length - 1); i++) {
      if (i === r.step && this.progress(team, r).arrivedAt === null) break;
      const s = leg.steps[i]!;
      if (s.type === 'detour') s.branches.forEach((b) => out.add(branchZone(leg, this.zones, i, b.id)!.rack));
      else out.add(this.zones[i]!.rack);
    }
    return out;
  }

  /** Sends `{t:'zone'}` to every online team whose list for `keys` may have changed (only when it did). */
  private refreshZones(keys: Set<string>, _now: number) {
    const online = this.io.online();
    for (const t of online) {
      const w = this.where.get(t);
      const ok = w && this.eligible(t).has(w.key);
      let msg: string;
      let list = '[]';
      if (ok) {
        if (!keys.has(w.key) && this.sentZone.has(t)) continue;
        const members: ZoneMember[] = online.flatMap((u) => {
          const wu = this.where.get(u);
          const ru = this.io.team(u);
          if (u === t || wu?.key !== w.key || !ru) return [];
          const s = this.legV.steps[ru.step]!;
          return [{ slot: this.io.slot(u), label: s.label, type: s.type, branch: this.progress(u, ru).branch, since: wu.since }];
        });
        list = JSON.stringify(members);
        msg = `${w.key}|${list}`;
      } else {
        // ponytail: a team that leaves its place gets [] only when it stands in no place at all (stepping straight into a
        // later step's place keeps the stale list rather than tell it that place is a race point)
        const was = this.sentZone.get(t);
        if (w || !was || was.endsWith('|[]')) continue;
        msg = '|[]';
      }
      if (this.sentZone.get(t) === msg) continue;
      this.sentZone.set(t, msg);
      this.io.send(t, { t: 'zone', teams: JSON.parse(list) as ZoneMember[] });
    }
  }
}

/** s on the team's race clock (SPEC §17.12), stopped at the check-in; null = no start time. */
const raceTime = (r: TeamRace, now: number) => (r.startAt === null ? null : Math.max(0, ((r.finishAt ?? now) - r.startAt) / 1000));

const pick = (z: Zone) => ({ name: z.name, x: z.x, z: z.z, r: z.r });
