// Phase 7 track A (docs/plans/phase7.md §5.2): the race engine behind one seam, like BikeService. RaceRoom hands it
// trusted poses, race ops and Host race ops; it owns the loaded leg (meta 'leg'), the race status (meta 'status'),
// step_progress (cache + writes) and the team race fields in teams.state; it applies steps.ts effects — SQLite first,
// in one transaction, the cache patched only once it committed, THEN the answers (SPEC §3) — and builds the welcome /
// host.state parts.
import { branchZone, jsonProblem, parseLeg, r2Names, startSpot, stepZones, type Leg, type LegIssue, type Zone } from '@race/shared/leg';
import { latLonToWorld } from '@race/shared';
import { FINISH_PENALTY_REASON, finishTexts, NET, type BoxInfo, type FinishPenalty, type FinishResult, type HostMessage, type HostState, type PoseSample, type RaceOp, type RaceStatus, type RaceView, type ReviewItem, type ServerMessage, type ServerNotice, type StepProgressView, type Welcome, type ZoneMember } from '@race/shared/protocol';
import type { QuotaCounters } from '../counters.ts';
import { emptyProgress, getMeta, parseAnswers, readProgress, setMeta, writeProgress, type StepProgressRow } from '../db.ts';
import { BUNDLED_LEGS, bundledLeg, DEFAULT_LEG_ID, legRules } from './leg.ts';
import { ranking, type RankInput } from './ranking.ts';
import type { BoxSpot } from './BikeService.ts';
import { partsOf } from './tasks.ts';
import { advance, boxesOf, cardOf, type RoomRec, inside, mediaAllowed, retryLockMinutes, review, rowFacts, scoreFrom, scoreOf, taskOf, type Progress, type RaceEffect, type RaceInput, type StandAt } from './steps.ts';

/** ponytail: step_progress.answers keeps the newest this many per step (a modified client typing NET.maxRaceOps wrong
 *  `auto` answers a minute for hours would grow one row and every host.state); raise it if a Host needs the whole log. */
const ANSWERS_KEPT = 50;

/** Race fields of teams.state (JSON; RaceRoom keeps reconnects / lastSeen / flagged next to them). */
export interface TeamRace {
  /** Index of the current step. */
  step: number;
  /** SPEC §17.12: 1 + the number of teams that entered the game before it; set at its first WebSocket entry, kept. */
  startOrder: number | null;
  /** server ms of that first entry (= step 1's clue_opened_at: SPEC §17.23, no Host start time any more). */
  joinedAt: number | null;
  finishAt: number | null;
  penaltyMinutes: number;
  /** SPEC §17.22: the place fixed at the check-in (real finish order) or at the Host's "Kết thúc" (out), null = racing. */
  rank: number | null;
  /** SPEC §17.23: eliminated: the last team to finish (every other team already had), or unfinished at "Kết thúc". */
  out: boolean;
  /** Leg 3: the Host's finish-line penalty (host.finishPenalty), null = none. Not a wait at the mat (`penaltyMinutes`):
   *  the team is told it finished + this line; the Host ranking adds it to finishAt (ranking.ts). */
  finishPenalty: FinishPenalty | null;
  /** Leg 3: step id → the team's progress in that detour's room (`race room`); a branch switch drops it. Optional: older rows. */
  rooms?: Record<string, RoomRec>;
}

export const NEW_TEAM_RACE: TeamRace = { step: 0, startOrder: null, joinedAt: null, finishAt: null, penaltyMinutes: 0, rank: null, out: false, finishPenalty: null, rooms: {} };

export interface RaceIO {
  sql: SqlStorage;
  counters: QuotaCounters;
  /** ctx.storage.transactionSync: every row of one transition commits together or not at all. */
  transaction<T>(fn: () => T): T;
  /** To every socket of that team. */
  send(team: string, m: ServerMessage): void;
  /** Leg 3: wake the object at `at` (ms) — the end of a finish-line penalty (absent in unit tests: no alarm). */
  setAlarm?(at: number): void;
  /** Something the Host shows changed: host.state goes out within NET.slowTickMs. */
  changed(now: number): void;
  /** race_events row, written at once (2 rows). */
  event(t: number, team: string | null, type: string, data?: unknown): void;
  /** teams.state race fields (RaceRoom owns the teams cache; save = 1 row, its cache patched only after the write). */
  team(id: string): TeamRace | undefined;
  saveTeam(id: string, r: TeamRace): void;
  teamIds(): string[];
  slot(id: string): number;
  /** The team's name (the finish texts' {tên đội}). */
  name(id: string): string;
  /** Teams with an open socket. */
  online(): string[];
  /** The team's trusted pose (RaceRoom: TrustedPoint, D4; mode = its last pose's), null = none yet. */
  pose(id: string): PoseSample | null;
  /** SPEC §6.4 / §17.32: the team off its bike (if it holds one); the bike stays next to the team, free, grouped under `rack`. */
  park(team: string, rack: string, now: number, box: BoxSpot | null): void;
  /** A new leg was loaded (lobby, no team entered): the bikes start again from its `vehicles` block. */
  legLoaded(now: number): void;
  /** Phase 8 (D6, critic S1): the team switched away from `branch` of detour `step` (id): every socket of the team forgets
   *  its revealed box (attachment), then gets {t:'box', op:'remove', step, branch} (dropped even if opened). Phase 10
   *  (undo): no `branch` → {t:'box', op:'hide', step} (an unopened box of that step). */
  hideBox(team: string, step: string, branch?: string): void;
}

export type HostRaceMessage = Extract<HostMessage, { t: 'host.race' | 'host.leg' | 'host.review' | 'host.finishPenalty' }>;

const STATUS_NOTICE = { lobby: 'raceNotOpen', paused: 'racePaused', finished: 'raceOver' } as const;
/** host.race op → [from statuses, to]. */
const MOVES: Record<'start' | 'pause' | 'resume' | 'finish', [RaceStatus[], RaceStatus, string]> = {
  start: [['lobby'], 'running', 'Chỉ mở được cuộc đua đang ở trạng thái chờ (lobby).'],
  pause: [['running'], 'paused', 'Chỉ tạm dừng được khi cuộc đua đang chạy.'],
  resume: [['paused'], 'running', 'Cuộc đua không ở trạng thái tạm dừng.'],
  finish: [['running', 'paused'], 'finished', 'Chỉ kết thúc được cuộc đua đang chạy hoặc đang tạm dừng.'],
};
const OVERRULED = `Lưu ý: bài này vừa bị Phạt, nay đã được Duyệt (khóa phạt đã gỡ, đội nhận mật thư kế). Nếu bấm nhầm, bấm «Hoàn tác» trong ${NET.undoMs / 1000} giây.`;
const LEG_LOCKED = 'Đã có đội vào game trong cuộc đua này. Muốn đổi chặng, hãy tạo cuộc đua mới (race id mới): nạp chặng → tạo đội → phát mã → mở.';
/** Phase 10 (plan §3.2 / M3): why an undo is refused. */
const UNDO = {
  none: 'Không còn gì để hoàn tác cho bài này.',
  late: `Quá ${NET.undoMs / 1000} giây, không hoàn tác được nữa. Dùng «Duyệt câu vừa phạt» hoặc Phạt / Duyệt lại.`,
  finished: 'Đội đã về đích, không hoàn tác được (thứ hạng đã báo cho các đội).',
  moved: 'Đội đã đi tiếp / có quyết định mới hơn, không hoàn tác được.',
  over: 'Cuộc đua đã kết thúc.',
};

/** Phase 10 (V2, plan §3.2): a Host Duyệt / Phạt / Cho qua that may still be undone (memory + meta 'undo', rebuilt on
 *  wake): the team's race fields and every step_progress row the decision changed, as they were BEFORE it. */
interface UndoRec {
  team: string;
  step: string;
  /** The answer the decision was on (UndoItem.id; a Cho qua created it). */
  id: number;
  op: 'approve' | 'penalize';
  at: number;
  race: TeamRace;
  /** step id → its row before the decision; null = it had none (deleted on undo). */
  rows: Record<string, StepProgressRow | null>;
  /** The team's step right after the decision: another one now = it moved on. */
  stepAfter: number;
}

/** The TeamRace fields of a teams.state (RaceRoom's has presence fields next to them: an undo never restores those). */
const raceOf = (r: TeamRace): TeamRace => Object.fromEntries(Object.keys(NEW_TEAM_RACE).map((k) => [k, r[k as keyof TeamRace]])) as unknown as TeamRace;

/** Phase 10 (V4, plan §5.2): a team that left a place, as the others' "Tại điểm này" list shows it (its step then). */
type Gone = Omit<ZoneMember, 'left'> & { left: number; stepIdx: number };

export class RaceEngine {
  private legV!: Leg;
  private issues: LegIssue[] = [];
  private zones: Zone[] = [];
  /** boxesOf: per step, its box(es) (a detour: one per branch), null = none. */
  private boxes: (Omit<BoxInfo, 'opened'>[] | null)[] = [];
  /** Every place of the leg (step zones + detour branch places), for D21 membership. */
  private places: Zone[] = [];
  private statusV: RaceStatus;
  /** team → step id → row (read once, patched after each committed write). */
  private readonly rows = new Map<string, Map<string, StepProgressRow>>();
  /** D21: the place (Zone.rack) each team stands in now + since when; the zone list last sent to it. Memory only. */
  private readonly where = new Map<string, { key: string; since: number }>();
  /** Phase 10 (V4, M6): rack key → team → it left that place (walked out / disconnected); shown NET.zoneLeftMs, dropped
   *  when it comes back. ponytail: memory only (0 rows), lost on an eviction like `where`; persist it if that matters. */
  private readonly gone = new Map<string, Map<string, Gone>>();
  private readonly sentZone = new Map<string, string>();
  /** `where` rebuilt once since this engine was built (restoreWhere). */
  private whereRestored = false;
  /** Phase 10 (V2): decisions still undoable, oldest first (only those within NET.undoMs), mirrored in meta 'undo'. */
  private undoV: UndoRec[];

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
    this.undoV = JSON.parse(getMeta(io.sql, 'undo') ?? '[]') as UndoRec[]; // only ever written by JSON.stringify below
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
  welcome(team: string, pose: PoseSample | null, first: boolean, now: number): Pick<Welcome, 'view' | 'boxes' | 'startOrder' | 'showStartOrder' | 'start'> {
    const r = this.io.team(team)!;
    const view = this.view(team, now);
    const boxes: BoxInfo[] = [];
    for (let i = 0; i < r.step; i++) {
      // done routes' boxes and done detours' chosen branch box, opened (where the team has been); never a mat
      const branch = this.teamRows(team).get(this.legV.steps[i]!.id)?.branch;
      const b = this.boxes[i]?.find((x) => x.branch === (branch ?? undefined));
      if (b && !b.kind && !boxes.some((o) => o.step === b.step && o.branch === b.branch)) boxes.push({ ...b, opened: true });
    }
    // the current box: once opened (a branch box until the Host approves, S2), else within boxReveal.radius (§17.10)
    const cur = this.currentBox(team, now);
    if (cur && (cur.opened || (pose && Math.hypot(pose.x - cur.x, pose.z - cur.z) <= this.legV.boxReveal.radius))) boxes.push(cur);
    return { view, boxes, startOrder: r.startOrder, showStartOrder: first, start: pose ? null : startSpot(this.legV, r.startOrder ?? 1) };
  }

  /** Login summary (SPEC §8.10 "Chào mừng trở lại"): the current step's label (SPEC §17.23: no race clock). */
  summary(team: string): { step: string | null } {
    return { step: this.legV.steps[this.io.team(team)?.step ?? -1]?.label ?? null };
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
    // Phase 8 (D8, critic N2): answer / accept / branch from anywhere, no trusted pose needed (a team typing right after a reload)
    if (m.op === 'accept') return this.step(team, { kind: 'accept', step: m.step }, now);
    if (m.op === 'answer') return this.step(team, { kind: 'answer', step: m.step, text: m.text, pose: stand(at), ...(m.parts ? { parts: m.parts } : {}) }, now);
    if (m.op === 'branch') return this.step(team, { kind: 'branch', step: m.step, branch: m.branch }, now);
    if (m.op === 'room') return this.step(team, { kind: 'room', step: m.step, branch: m.branch, done: m.done, skipped: m.skipped, pose: stand(at) }, now);
    if (!at) return this.io.send(team, { t: 'notice', code: 'boxFar' });
    const riding = at.mode === 'bike';
    const input: RaceInput =
      m.op === 'open' ? { kind: 'open', step: m.step, ...(m.branch !== undefined ? { branch: m.branch } : {}), x: at.x, z: at.z, riding }
      : { kind: 'checkin', x: at.x, z: at.z, riding };
    this.step(team, input, now);
  }

  /** Leg 3 CETIQLO: the team's current step id when it is a not-done challenge with `room: 'cetiqlo'` (the race running), else null. */
  cqStep(team: string): string | null {
    const r = this.io.team(team);
    if (!r || this.statusV !== 'running' || r.finishAt !== null) return null;
    const s = this.legV.steps[r.step];
    return s?.type === 'challenge' && s.room === 'cetiqlo' && this.row(team, r.step, r)?.completed_at == null ? s.id : null;
  }

  /** Leg 3 CETIQLO: the team won its match → the step completes (answer row + next clue card, SQLite before the messages). */
  cqWin(team: string, step: string, now: number): void {
    this.step(team, { kind: 'cqWin', step, pose: stand(this.io.pose(team)) }, now);
  }

  /** Leg 3 CETIQLO: a waiting loser timed out (loserMaxWaitMs): the step completes like a win (note "Chờ quá 10 phút, được rời đi"), and the
   *  Host may undo it within NET.undoMs like a "Cho qua". */
  cqRelease(team: string, step: string, now: number): void {
    const r = this.io.team(team);
    if (!r) return;
    const id = this.progress(team, r).lastAnswerId + 1;
    this.step(team, { kind: 'cqWin', step, pose: stand(this.io.pose(team)), release: true }, now, { team, step, id, op: 'approve', at: now, race: raceOf(r) });
  }

  /** Host race ops; `reply` answers that Host socket (host.legResult / host.notice). */
  onHost(m: HostRaceMessage, reply: (m: ServerMessage) => void, now: number): void {
    const notice = (level: 'error' | 'warning', message: string) => reply({ t: 'host.notice', level, message });
    if (m.t === 'host.race') {
      const [from, to, refused] = MOVES[m.op];
      if (!from.includes(this.statusV)) return notice('error', refused);
      // SPEC §17.23 (Chốt): "Kết thúc" with teams still racing → each is out, ranked after every finished team (furthest
      // step first, then who got there sooner), written with the status in one transaction before anyone hears of it
      const outs = to === 'finished' ? this.hostView(now).ranking.filter((x) => x.finishAt === null && !this.io.team(x.team)?.out) : [];
      this.io.transaction(() => {
        this.meta('status', to);
        this.io.event(now, null, 'host.race', { op: m.op });
        for (const x of outs) {
          this.io.event(now, x.team, 'out', { rank: x.rank, total: this.io.teamIds().length, by: 'host' });
          this.io.saveTeam(x.team, { ...this.io.team(x.team)!, rank: x.rank, out: true });
        }
      });
      this.statusV = to;
      for (const id of this.io.online()) {
        // D9: a team standing still in a zone / on the mat sends no pose: judge its last trusted pose now
        const p = this.io.pose(id);
        if (to === 'running' && p) this.onPose(id, p, now);
        this.io.send(id, { t: 'race', view: this.view(id, now) });
      }
      return this.io.changed(now);
    }
    if (m.t === 'host.finishPenalty') {
      // Leg 3: Host-entered only (any status, before / after the finish, after "Kết thúc" too: the Host settles results);
      // the event keeps the old value (`was`), so a mistake is fixed by setting it again / "Xóa" (no 10 s undo needed)
      const r = this.io.team(m.team);
      if (!r) return notice('error', 'Không có đội này.');
      const next: FinishPenalty | null = m.minutes > 0 ? { minutes: m.minutes, reason: m.reason?.trim() || FINISH_PENALTY_REASON, by: 'host' } : null;
      if (JSON.stringify(next) === JSON.stringify(r.finishPenalty ?? null)) return notice('warning', 'Phạt vạch đích của đội này không đổi.');
      this.io.transaction(() => {
        this.io.event(now, m.team, 'host.finishPenalty', { minutes: m.minutes, reason: next?.reason ?? null, was: r.finishPenalty ?? null });
        this.io.saveTeam(m.team, { ...r, finishPenalty: next });
      });
      if (r.rank !== null) this.io.send(m.team, { t: 'race', view: this.view(m.team, now) }); // its finish card updates live
      this.served.delete(m.team);
      this.armServed(now);
      return this.io.changed(now);
    }
    if (m.t === 'host.review') {
      // Phase 8 (D5, D10, D24): any status but finished (paused too); idempotent (a second decision is refused, nothing written)
      if (this.statusV === 'finished') return notice('error', UNDO.over);
      // review() below must never see 'undo' (it would read it as a Phạt)
      if (m.op === 'undo') return this.undo(m.team, m.step, m.id!, now, notice);
      const r = this.io.team(m.team);
      if (!r) return notice('error', 'Không có đội này.');
      const i = this.legV.steps.findIndex((s) => s.id === m.step);
      if (i < 0) return notice('error', 'Không có bước này trong chặng.');
      if (i > r.step) return notice('warning', 'Đội chưa tới bước này.');
      const row = this.teamRows(m.team).get(m.step) ?? emptyProgress(m.team, m.step);
      const res = review(this.legV, i, row, m, now);
      if ('refuse' in res) return notice('warning', res.refuse);
      const decision: RaceEffect = { kind: 'review', step: i, row: res.row, op: m.op, id: res.id };
      // approve: complete + settle through the machine at the team's trusted pose (S3: racked only if it stands there)
      const { p, effects } = res.approve
        ? advance(this.legV, this.zones, this.progress(m.team, r), { kind: 'approve', step: m.step, pose: stand(this.io.pose(m.team)) }, now, this.statusV === 'running')
        : { p: this.progress(m.team, r), effects: [] };
      const undoable = m.op === 'approve' || m.op === 'penalize' ? { team: m.team, step: m.step, id: res.id!, op: m.op, at: now, race: raceOf(r) } : undefined; // not a note / ack / score
      this.apply(m.team, r, p, [decision, ...effects], now, undoable);
      // N4 "Duyệt" over a "Phạt": the Host's own fix (or a click on a page a second old, review R-11)
      if (m.op === 'approve' && parseAnswers(row).find((a) => a.id === res.id)?.s === 'penalized') notice('warning', OVERRULED);
      return;
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
        return fail(`File không phải JSON hợp lệ: ${jsonProblem(m.json!, e)}`);
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

  /** SPEC §17.10: the box of the team's current step (checkBoxes, welcome), null = none. A detour (D6): the chosen
   *  branch's box, none before a choice or during a switch countdown; `opened` once its box was opened. */
  currentBox(team: string, now: number): BoxInfo | null {
    const r = this.io.team(team);
    const s = r && this.legV.steps[r.step];
    if (!s) return null;
    if (s.type !== 'detour') {
      const b = this.boxes[r.step]?.[0];
      return b ? { ...b, opened: false } : null;
    }
    const row = this.teamRows(team).get(s.id);
    const opened = row?.branch_opened_at != null;
    if (!row?.branch || (!opened && (row.locked_until ?? 0) > now)) return null;
    const b = this.boxes[r.step]!.find((x) => x.branch === row.branch);
    return b ? { ...b, opened } : null;
  }

  /** Phase 8 (D13): may this team load the R2 image `name` (RaceRoom GET /media → 204 / 404)? */
  mediaAllowed(team: string, name: string): boolean {
    const r = this.io.team(team);
    return !!r && mediaAllowed(this.legV, r.step, this.teamRows(team), name);
  }

  /** Why the team may not take a bike now (BikeService.onTeam), false = it may: checked in or the race is over (a
   *  spectator, SPEC §8.6 / §8.10), or the current step is a walk-only route (SPEC §6.5). */
  bikeBlock(team: string): false | 'walkOnly' | 'finished' {
    if (this.over(team)) return 'finished';
    const s = this.legV.steps[this.io.team(team)?.step ?? -1];
    return s?.type === 'route_info' && 'mandatory' in s.transport ? 'walkOnly' : false;
  }

  /** The race is over for this team (checked in / out, or the Host ended it): SPEC §17.39 it walks on, §17.40 it may watch. */
  over(team: string): boolean {
    return this.io.team(team)?.finishAt != null || this.statusV === 'finished';
  }

  /** A team's socket went: in the "Tại điểm này" lists of the others it becomes "vừa rời đi" (Phase 10, V4). */
  left(team: string, now: number) {
    this.restoreWhere(now, null, team);
    const w = this.where.get(team);
    this.where.delete(team);
    this.sentZone.delete(team);
    if (!w) return;
    this.recordLeft(team, w, now);
    this.refreshZones(new Set([w.key]), now);
  }

  /** host.state parts: leg summary, step_progress, ranking, review queue, undoable decisions. */
  hostView(now: number): Pick<HostState, 'leg' | 'progress' | 'ranking' | 'queue' | 'undo'> {
    const leg = this.legV;
    const s0 = latLonToWorld(leg.start.lat, leg.start.lon);
    const progress: StepProgressView[] = [];
    const ranks = this.io.teamIds().flatMap((id) => {
      const r = this.io.team(id);
      if (!r) return [];
      for (let i = 0; i <= Math.min(r.step, leg.steps.length - 1); i++) {
        const row = this.row(id, i, r);
        if (!row) continue;
        const answers = parseAnswers(row);
        progress.push({
          team: id, step: row.step, arrivedAt: row.arrived_at, openedAt: row.clue_opened_at, startedAt: row.task_started_at, completedAt: row.completed_at, branch: row.branch,
          submittedAt: row.submitted_at, decidedAt: row.decided_at, rejections: row.rejections, wrongAnswers: row.wrong_answers, branchSwitches: row.branch_switches,
          branchOpenedAt: row.branch_opened_at, lockedUntil: row.locked_until, pending: answers.at(-1)?.s === 'pending', approvalWaitSeconds: row.approval_wait_seconds,
          answers: answers.map((a) => ({ id: a.id, text: a.text, at: a.at, status: a.s, branch: a.b, ...(a.n ? { note: a.n } : {}) })), note: row.host_note,
          ...roomOf(this.legV, i, r.rooms?.[row.step]),
        });
      }
      return [this.rankIn(id, r)];
    });
    // D10: every answer waiting for the Host, oldest first (the reference answers are Host-only, like this whole message)
    const queue: ReviewItem[] = [];
    for (const id of this.io.teamIds())
      for (const row of this.teamRows(id).values()) {
        const all = parseAnswers(row);
        const i = leg.steps.findIndex((s) => s.id === row.step);
        if (i < 0) continue;
        // Leg 3: answers the server graded and applied, until the Host's "✓ Đồng ý" (a Duyệt / "Đúng" over it also clears it)
        for (const a of all) {
          const t = a.auto && !a.k && a.m && (a.s === 'correct' || a.s === 'penalized') ? taskOf(leg.steps[i]!, a.b) : null;
          if (!t) continue;
          const canApprove = a.s === 'penalized' && a === all.at(-1) && row.completed_at == null;
          queue.push({
            team: id, step: row.step, label: leg.steps[i]!.label, branch: a.b, id: a.id, text: a.text, at: a.at, reference: t.referenceAnswers, note: row.host_note,
            lockMinutes: retryLockMinutes(leg, t), ...(t.parts ? { partLabels: t.parts.map((p) => p.label) } : {}),
            auto: { verdict: a.s === 'correct' ? 'correct' : 'penalized', marks: a.m!, score: a.sc ?? 0, of: a.m!.length, canApprove },
          });
        }
        const a = all.at(-1);
        const t = a?.s === 'pending' && row.completed_at == null ? taskOf(leg.steps[i]!, a.b) : null;
        if (!a || !t) continue;
        queue.push({
          team: id, step: row.step, label: leg.steps[i]!.label, branch: a.b, id: a.id, text: a.text, at: a.at,
          reference: t.referenceAnswers.length ? t.referenceAnswers : t.answers, note: row.host_note, lockMinutes: retryLockMinutes(leg, t),
          ...(partsOf(t) ? { scoreOf: partsOf(t), scoreFrom: scoreFrom(t, row) ?? a.at } : {}), // SPEC §17.31 (§17.44: n = the box count)
          ...(t.parts ? { partLabels: t.parts.map((p) => p.label) } : {}), // SPEC §17.44: the page lists the N strings of `text`
        });
      }
    queue.sort((a, b) => a.at - b.at);
    return {
      leg: {
        id: leg.id, title: leg.title, timezone: leg.timezone, start: { x: s0.x, z: s0.z },
        steps: leg.steps.map((s, i) => {
          const z = this.zones[i]!;
          const branches = s.type === 'detour' ? s.branches.map((b) => ({ id: b.id, title: b.name, ...pick(branchZone(leg, this.zones, i, b.id)!), proof: b.task.kind === 'free' })) : undefined;
          return { id: s.id, type: s.type, label: s.label, ...pick(z), proof: s.type === 'challenge' && s.task.kind === 'free', ...(branches ? { branches } : {}) };
        }),
        vehicles: leg.vehicles, bundled: BUNDLED_LEGS, issues: this.issues,
        media: r2Names(leg), penalties: { retryLockMinutes: leg.penalties.retryLockMinutes, branchSwitchLockMinutes: leg.penalties.branchSwitchLockMinutes }, stuckMinutes: leg.hostAlerts.stuckMinutes,
      },
      progress,
      ranking: ranking(ranks),
      queue,
      // only what an undo would pass now (the page draws a button per item and hides it at `until` by itself)
      undo: this.undoV.filter((u) => !this.undoBlock(u, now)).map(({ team, step, id, op, at }) => ({ team, step, id, op, at, until: at + NET.undoMs })),
    };
  }

  // ── internals ──
  /** §17.34: the clue box (or mat) standing at the point of `rack`, null = none there (a task place of its own). */
  private boxAt(rack: string): BoxSpot | null {
    const zn = this.places.find((z) => z.rack === rack);
    const box = zn && this.boxes.flat().find((b) => b && Math.hypot(b.x - zn.x, b.z - zn.z) < 1);
    return box ? { x: box.x, z: box.z, yaw: box.yaw ?? 0 } : null;
  }

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

  /** Step i's row as the team sees it: step 1's clue_opened_at = its first entry (D3, on read; SPEC §17.23: no start time). */
  private row(team: string, i: number, r: TeamRace): StepProgressRow | undefined {
    const s = this.legV.steps[i];
    if (!s) return undefined;
    const row = this.teamRows(team).get(s.id);
    if (i > 0) return row;
    const opened = r.joinedAt;
    return opened === null && !row ? undefined : { ...(row ?? emptyProgress(team, s.id)), clue_opened_at: opened };
  }

  private progress(team: string, r: TeamRace): Progress {
    const id = this.legV.steps[r.step]?.id ?? '';
    return { step: r.step, finishAt: r.finishAt, penaltyMinutes: r.penaltyMinutes, ...rowFacts(this.teamRows(team).get(id)), room: r.rooms?.[id] ?? null };
  }

  private rankIn(id: string, r: TeamRace): RankInput {
    return { team: id, slot: this.io.slot(id), startOrder: r.startOrder, step: r.step, finishAt: r.finishAt, rank: r.rank, out: r.out, prevDoneAt: this.row(id, r.step - 1, r)?.completed_at ?? null, finishPenaltyMinutes: r.finishPenalty?.minutes ?? 0 };
  }

  /** Leg 3: when a finished team's finish-line penalty is served (finish + minutes), null = none / not finished / out. */
  private serveAt(r: TeamRace): number | null {
    const pen = r.finishPenalty?.minutes ?? 0;
    return r.finishAt !== null && !r.out && pen > 0 ? r.finishAt + pen * 60_000 : null;
  }

  /** SPEC §17.22 / §17.23: the team's finish announcement (texts of the leg's pit_stop.announce, else the defaults). Leg 3: the place
   *  is the live order by finish + finish-line penalty (ranking.ts) and a penalised team is told only "Về đích" until its penalty is
   *  served (`waitUntil`, no place yet): a team that finishes meanwhile with an earlier total ranks before it. */
  private result(team: string, r: TeamRace, now: number): FinishResult | null {
    if (r.rank === null) return null;
    const total = this.io.teamIds().length;
    const pen = r.finishPenalty ? { finishPenalty: r.finishPenalty } : {};
    const until = this.serveAt(r);
    if (until !== null && now < until) return { rank: 0, total, kind: 'finish', npc: '', toast: '', card: '', waitUntil: until, ...pen };
    const rank = r.finishAt !== null && !r.out ? ranking(this.io.teamIds().map((id) => this.rankIn(id, this.io.team(id)!))).find((x) => x.team === team)?.rank ?? r.rank : r.rank;
    const kind = r.out ? 'out' : rank === 1 ? 'first' : 'finish';
    const pit = this.legV.steps.at(-1);
    return { rank, total, kind, ...finishTexts(kind, pit?.type === 'pit_stop' ? pit.announce : undefined, rank, total, this.io.name(team)), ...pen };
  }

  /** Leg 3: ms of the next finish-line penalty that ends after `now` (the alarm that pushes that team its place), null = none. */
  nextServed(now: number): number | null {
    let next: number | null = null;
    for (const id of this.io.teamIds()) {
      const at = this.serveAt(this.io.team(id)!);
      if (at !== null && at > now && (next === null || at < next)) next = at;
    }
    return next;
  }

  /** Leg 3: the teams whose penalty ended since the last call get their view again (now with the place), then the next alarm is armed. */
  private served = new Set<string>();
  revealDue(now: number) {
    for (const id of this.io.teamIds()) {
      const r = this.io.team(id)!;
      const at = this.serveAt(r);
      if (at !== null && at <= now && !this.served.has(id)) (this.served.add(id), this.io.send(id, { t: 'race', view: this.view(id, now) }));
    }
    this.armServed(now);
  }
  armServed(now: number) {
    const at = this.nextServed(now);
    if (at !== null) this.io.setAlarm?.(at + 50);
  }

  private view(team: string, now: number): RaceView {
    const r = this.io.team(team)!;
    const p = this.progress(team, r);
    const pit = this.legV.steps[r.step]?.type === 'pit_stop';
    return {
      status: this.statusV, finishAt: r.finishAt, penaltyMinutes: r.penaltyMinutes,
      card: this.legV.steps[r.step] ? cardOf(this.legV, r.step, this.row(team, r.step, r), now, r.rooms) : null,
      checkinAt: pit && r.finishAt === null && r.penaltyMinutes > 0 && p.arrivedAt !== null ? p.arrivedAt + r.penaltyMinutes * 60_000 : null,
      result: this.result(team, r, now),
    };
  }

  private cards(team: string, r: TeamRace, now: number) {
    const out = [];
    for (let i = 0; i <= Math.min(r.step, this.legV.steps.length - 1); i++) out.push(cardOf(this.legV, i, this.row(team, i, r), now, r.rooms));
    return out;
  }

  /** One input through the state machine; effects written (one transaction) BEFORE anything is sent. */
  private step(team: string, input: RaceInput, now: number, undo?: Omit<UndoRec, 'rows' | 'stepAfter'>) {
    const r = this.io.team(team);
    // SPEC §8.10: after the Host's "Kết thúc" the race is read-only (no arrival, no bike moved to a rack)
    if (!r || this.statusV === 'finished') return;
    const { p, effects } = advance(this.legV, this.zones, this.progress(team, r), input, now, this.statusV === 'running');
    if (effects.length) this.apply(team, r, p, effects, now, undo);
  }

  /** `undo` (a Host Duyệt / Phạt / Cho qua): its undo record is written in the same transaction (meta 'undo', 1 row). */
  private apply(team: string, r: TeamRace, p: Progress, effects: RaceEffect[], now: number, undo?: Omit<UndoRec, 'rows' | 'stepAfter'>) {
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
    let placed: Pick<TeamRace, 'rank' | 'out'> = { rank: r.rank, out: r.out };
    let rooms = r.rooms;
    let finishPenalty = r.finishPenalty ?? null;
    const hides: Extract<RaceEffect, { kind: 'hideBox' }>[] = [];
    const notice = (code: ServerNotice) => out.push({ t: 'notice', code });
    // M8: an approval says "Host đã duyệt! Mật thư mới…" once (no clueNew next to it); a note alone changes no card
    // (Leg 3: an auto-graded right answer says "Chính xác!" instead)
    const approved = effects.some((e) => (e.kind === 'review' && e.op === 'approve') || (e.kind === 'answer' && e.rec.auto && e.verdict === 'correct'));
    const quiet = effects.every((e) => e.kind === 'review' && (e.op === 'note' || e.op === 'ack'));
    const sid = (i: number) => steps[i]!.id;
    for (const e of effects) {
      if (e.kind === 'refuse') notice(e.code);
      else if (e.kind === 'park') parks.push(e);
      else if (e.kind === 'hideBox') hides.push(e);
      else if (e.kind === 'arrive') {
        edit(e.step).arrived_at = now;
        events.push(['arrive', { step: sid(e.step) }]);
      } else if (e.kind === 'accept') {
        edit(e.step).task_started_at = now;
        events.push(['accept', { step: sid(e.step) }]);
      } else if (e.kind === 'answer') {
        // one answer = this row's upsert, no event (D4); the auto `wrong` one neither
        const row = edit(e.step);
        row.answers = JSON.stringify([...parseAnswers(row), e.rec].slice(-ANSWERS_KEPT));
        if (e.verdict === 'pending') (row.submitted_at = now), notice('answerSent');
        if (e.verdict === 'wrong') (row.wrong_answers += 1), notice('answerWrong');
        if (e.rec.auto) {
          // Leg 3: graded + applied by the server (the Host's queue lists it until "✓ Đồng ý"); a Phạt counts like the Host's
          Object.assign(row, { submitted_at: now, decided_at: now, decided_by: 'auto' });
          if (e.verdict === 'penalized') Object.assign(row, { locked_until: e.lockedUntil ?? null, rejections: row.rejections + 1 });
          events.push(['auto', { step: sid(e.step), id: e.rec.id, score: e.rec.sc, of: e.rec.m?.length }]);
          out.push({ t: 'notice', code: e.verdict === 'correct' ? 'autoCorrect' : 'autoPenalized', ...(e.rec.sv || e.verdict === 'correct' ? { score: e.rec.sc!, of: e.rec.m!.length } : {}) }); // the number only once told (scoreFromMinutes)
        }
      } else if (e.kind === 'review') {
        Object.assign(edit(e.step), e.row);
        events.push(['review', { step: sid(e.step), op: e.op, id: e.id, by: 'host' }]);
        if (e.op === 'score') {
          const a = parseAnswers(e.row).find((x) => x.id === e.id);
          out.push({ t: 'notice', code: 'scoreUpdated', ...(a?.sc !== undefined && a.m ? { score: a.sc, of: a.m.length } : {}) });
        }
        if (e.op === 'approve') notice('approved');
        else if (e.op === 'penalize') {
          // SPEC §17.31: the Phạt's "đúng x/n" rides on the notice (the toast) when the team may see it
          const s = steps[e.step]!;
          const a = parseAnswers(e.row).find((x) => x.id === e.id);
          const t = taskOf(s, e.row.branch);
          out.push({ t: 'notice', code: 'penalized', ...(a && t ? scoreOf(a, partsOf(t)) : {}) });
        }
      } else if (e.kind === 'branch') {
        edit(e.step).branch = e.branch;
        events.push(['branch', { step: sid(e.step), branch: e.branch }]);
        notice('branchChosen');
      } else if (e.kind === 'switch') {
        // D6: the old branch's progress is gone (its answers stay in the JSON with b = from, for the Host)
        const row = edit(e.step);
        Object.assign(row, { branch: e.to, branch_switches: row.branch_switches + 1, branch_opened_at: null, task_started_at: null, arrived_at: null, locked_until: e.lockedUntil });
        events.push(['switch', { step: sid(e.step), from: e.from, to: e.to }]);
        if (rooms?.[sid(e.step)]) rooms = Object.fromEntries(Object.entries(rooms).filter(([k]) => k !== sid(e.step))); // "tiến độ nhánh cũ mất"
        notice('branchSwitched');
      } else if (e.kind === 'room') {
        rooms = { ...rooms, [sid(e.step)]: e.rec };
        events.push(['room', { step: sid(e.step), branch: e.rec.b, done: e.rec.done, skipped: e.rec.skipped }]);
        if (e.penalty !== undefined) {
          // Leg 3: a skipped room's finish-line penalty; a Host-set one is never overwritten (the Host settles results), an
          // earlier room's adds up. The Host can still change it (host.finishPenalty).
          const host = finishPenalty !== null && finishPenalty.by !== 'room';
          const minutes = (finishPenalty?.by === 'room' ? finishPenalty.minutes : 0) + e.penalty;
          if (!host && minutes > 0) finishPenalty = { minutes, reason: FINISH_PENALTY_REASON, by: 'room' };
          events.push(['room.finishPenalty', { step: sid(e.step), minutes: e.penalty, kept: host, was: r.finishPenalty ?? null }]);
        }
      } else if (e.kind === 'openBranch') {
        Object.assign(edit(e.step), { branch_opened_at: now, task_started_at: now });
        events.push(['open', { step: sid(e.step), branch: e.branch }]);
        const box = this.boxes[e.step]?.find((b) => b.branch === e.branch);
        if (box) out.push({ t: 'box', op: 'reveal', box: { ...box, opened: true } });
      } else if (e.kind === 'complete') {
        edit(e.step).completed_at = now;
        const n = steps[e.step + 1];
        if (n) edit(e.step + 1).clue_opened_at = now;
        if (n?.type === 'challenge' && n.teaser === '') edit(e.step + 1).task_started_at = now; // D5: started with its clue
        events.push(['complete', { step: sid(e.step) }]);
        const box = this.boxes[e.step]?.[0];
        if (box && !box.kind && !box.branch) out.push({ t: 'box', op: 'reveal', box: { ...box, opened: true } }); // D5: opened at once
        if (n && !approved) notice('clueNew');
      } else if (e.kind === 'finish') {
        edit(p.step).completed_at = now;
        // SPEC §17.22: the real finish order, fixed now; §17.23: the last team of the race (every other one finished) is out
        const others = this.io.teamIds().filter((id) => id !== team);
        const done = others.filter((id) => this.io.team(id)?.finishAt != null).length;
        placed = { rank: done + 1, out: others.length > 0 && done === others.length };
        events.push(['finish', { ...placed, total: others.length + 1 }]);
      }
    }
    const next: TeamRace = { ...r, step: p.step, finishAt: p.finishAt, ...placed, rooms, finishPenalty };
    const teamChanged = next.step !== r.step || next.finishAt !== r.finishAt || next.rank !== r.rank || rooms !== r.rooms || finishPenalty !== (r.finishPenalty ?? null);
    let undos: UndoRec[] | undefined;
    if (dirty.size || events.length || teamChanged) {
      this.io.transaction(() => {
        for (const row of dirty.values()) this.io.counters.rows += writeProgress(this.io.sql, row);
        for (const [type, data] of events) this.io.event(now, team, type, data);
        // Phase 10 (V2): the rows it changed as they were (the cache is patched only after the commit)
        if (undo) {
          const rows = Object.fromEntries([...dirty.keys()].map((id) => [id, this.teamRows(team).get(id) ?? null]));
          undos = [...this.undoV.filter((x) => now - x.at <= NET.undoMs), { ...undo, rows, stepAfter: next.step }]; // cut by time only (review: 6 Duyệt in 10 s is normal)
          this.meta('undo', JSON.stringify(undos));
        }
        if (teamChanged) this.io.saveTeam(team, next); // last: RaceRoom patches its cache only after this write
      });
      for (const row of dirty.values()) this.teamRows(team).set(row.step, row); // committed: patch the cache
      if (undos) this.undoV = undos;
      if (!quiet) out.push({ t: 'race', view: this.view(team, now) });
    }
    for (const h of hides) this.io.hideBox(team, sid(h.step), h.branch); // before the card that says "switched"
    for (const k of parks) this.io.park(team, k.rack, now, this.boxAt(k.rack));
    for (const m of out) this.io.send(team, m);
    if (teamChanged) this.armServed(now); // Leg 3: a finish with a penalty / a room's skip: the alarm that tells the place once it is served
    if (dirty.size) {
      this.io.changed(now);
      // its lists change with a new step, an arrival where it already stands (moveZone sees no move), or a branch switch
      // (the old branch's place is no longer its own: its list there is cleared, review verify-a 4.4)
      if (teamChanged || effects.some((e) => e.kind === 'arrive' || e.kind === 'switch')) this.refreshZones(new Set([this.where.get(team)?.key ?? '']), now);
    } else if (teamChanged) this.io.changed(now); // Leg 3: a room report only touches teams.state
  }

  // ── Phase 10 (V2, plan §3.2): undo a Host decision within NET.undoMs (records: apply()) ──
  /** Why record `u` may not be undone now (plan M3), null = it may. */
  private undoBlock(u: UndoRec, now: number): string | null {
    const r = this.io.team(u.team);
    if (this.statusV === 'finished') return UNDO.over;
    if (now - u.at > NET.undoMs) return UNDO.late;
    if (!r) return UNDO.none;
    if (r.finishAt !== null) return UNDO.finished; // its rank is out already (SPEC §17.22)
    return r.step !== u.stepAfter || this.undoV.filter((x) => x.team === u.team).at(-1) !== u ? UNDO.moved : null;
  }

  /** host.review undo (M2–M4): the rows of the decision back as they were (written back, or deleted when it created them)
   *  + the team's race fields, the host.undo event and meta 'undo' in ONE transaction; then the team hears it. What the
   *  team did on those steps meanwhile is dropped (M2); the bike a Duyệt racked stays at the rack (M4). The newest record
   *  of that answer wins (a Phạt then a Duyệt of the same answer: the Duyệt first). */
  private undo(team: string, step: string, id: number, now: number, notice: (level: 'error' | 'warning', message: string) => void) {
    const u = this.undoV.filter((x) => x.team === team && x.step === step && x.id === id).at(-1);
    const why = u ? this.undoBlock(u, now) : UNDO.none;
    if (!u || why) return notice('warning', why ?? UNDO.none);
    const was = this.currentBox(team, now);
    const rest = this.undoV.filter((x) => x !== u);
    const r = this.io.team(team)!;
    this.io.transaction(() => {
      for (const [sid, row] of Object.entries(u.rows)) {
        if (row) this.io.counters.rows += writeProgress(this.io.sql, row);
        else {
          const c = this.io.sql.exec('DELETE FROM step_progress WHERE team = ? AND step = ?', team, sid);
          c.toArray();
          this.io.counters.rows += c.rowsWritten;
        }
      }
      this.io.event(now, team, 'host.undo', { step, op: u.op, id });
      this.meta('undo', JSON.stringify(rest));
      // the finish-line penalty is not part of the decision: a Host may have set it within those 10 s (kept as it is now)
      const back = { ...u.race, finishPenalty: r.finishPenalty ?? null };
      if (JSON.stringify(raceOf(r)) !== JSON.stringify(back)) this.io.saveTeam(team, back); // last: RaceRoom patches its cache after it
    });
    for (const [sid, row] of Object.entries(u.rows)) (row ? this.teamRows(team).set(sid, row) : this.teamRows(team).delete(sid)); // committed
    this.undoV = rest;
    // the box channel (SPEC §17.10): the box of the step it had moved on to goes (a branch box even if opened); an opened
    // box of the step it is back on returns (a branch switch in the meantime removed it)
    const cur = this.currentBox(team, now);
    const same = !!was && !!cur && was.step === cur.step && was.branch === cur.branch;
    if (was && !same) this.io.hideBox(team, was.step, was.branch);
    this.io.send(team, { t: 'notice', code: 'reviewUndone' });
    this.io.send(team, { t: 'race', view: this.view(team, now) });
    if (cur?.opened && !same) this.io.send(team, { t: 'box', op: 'reveal', box: cur });
    this.io.changed(now);
    this.refreshZones(new Set([this.where.get(team)?.key ?? '']), now);
  }

  // ── D21 "Tại điểm này" ──
  /** The place (rack key) a trusted pose stands in (the Pit Stop: on its mat, SPEC §17.38), null = none. */
  private placeAt(x: number, z: number): string | null {
    return this.places.find((zn) => inside(zn, x, z, 0))?.rack ?? null;
  }

  /** Review fix (e2e F1): `where` is memory only, so after an eviction / hibernation a team standing still was in no place
   *  and never heard who came back. Rebuilt once from the trusted poses (RaceRoom's snapshot) of the online teams (+ `also`:
   *  a socket closing), not `skip` (its pose is the new one already). ponytail: `since` = the wake, not the real arrival. */
  private restoreWhere(now: number, skip: string | null, also: string | null = null) {
    if (this.whereRestored) return;
    this.whereRestored = true;
    for (const t of new Set([...this.io.online(), ...(also ? [also] : [])])) {
      const p = t === skip || this.where.has(t) ? null : this.io.pose(t);
      const key = p && this.placeAt(p.x, p.z);
      if (key) this.where.set(t, { key, since: now });
    }
  }

  private moveZone(team: string, pose: PoseSample, now: number) {
    this.restoreWhere(now, team);
    const key = this.placeAt(pose.x, pose.z);
    const was = this.where.get(team);
    if ((was?.key ?? null) === key) return;
    if (was) this.recordLeft(team, was, now);
    if (key) {
      this.where.set(team, { key, since: now });
      this.gone.get(key)?.delete(team); // back here: no longer "vừa rời đi"
    } else this.where.delete(team);
    this.refreshZones(new Set([was?.key ?? '', key ?? '']), now);
  }

  /** Phase 10 (V4): `team` left place `w` now, on the step it holds now (memory only). */
  private recordLeft(team: string, w: { key: string; since: number }, now: number) {
    const r = this.io.team(team);
    const s = r && this.legV.steps[r.step];
    if (!s) return;
    let m = this.gone.get(w.key);
    if (!m) this.gone.set(w.key, (m = new Map()));
    m.set(team, { slot: this.io.slot(team), label: s.label, type: s.type, branch: this.progress(team, r).branch, since: w.since, left: now, stepIdx: r.step });
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
      // a detour: only the place of the branch the team chose (Phase 8 critic C1), none before a choice
      const z = s.type === 'detour' ? branchZone(leg, this.zones, i, this.teamRows(team).get(s.id)?.branch ?? '') : this.zones[i]!;
      if (z) out.add(z.rack);
    }
    return out;
  }

  /** Sends `{t:'zone'}` to every online team whose list for `keys` may have changed (only when it did). */
  private refreshZones(keys: Set<string>, now: number) {
    const online = this.io.online();
    for (const t of online) {
      const w = this.where.get(t);
      const ok = w && this.eligible(t).has(w.key);
      let msg: string;
      let list = '[]';
      if (ok) {
        if (!keys.has(w.key) && this.sentZone.has(t)) continue;
        const mine = this.io.team(t)!.step;
        const members: ZoneMember[] = online.flatMap((u) => {
          const wu = this.where.get(u);
          const ru = this.io.team(u);
          // only teams on a step this team already holds the clue of: a team further on, back at a place this team has
          // done, would show it a later step's label / type there (review m3, SPEC §17.10)
          if (u === t || wu?.key !== w.key || !ru || ru.step > mine) return [];
          const s = this.legV.steps[ru.step]!;
          return [{ slot: this.io.slot(u), label: s.label, type: s.type, branch: this.progress(u, ru).branch, since: wu.since }];
        });
        // Phase 10 (V4): + the teams that left within NET.zoneLeftMs, by the same rule on the step they were on then
        const gone = this.gone.get(w.key);
        for (const [u, g] of gone ?? []) {
          if (now - g.left > NET.zoneLeftMs) gone!.delete(u);
          else if (u !== t && g.stepIdx <= mine) members.push({ slot: g.slot, label: g.label, type: g.type, branch: g.branch, since: g.since, left: g.left });
        }
        list = JSON.stringify(members);
        msg = `${w.key}|${list}`;
      } else {
        // ponytail: a team that leaves its place gets [] only when it stands in no place at all (stepping straight into a
        // later step's place keeps the stale list rather than tell it that place is a race point), or when the place it
        // still stands in stopped being its own (a branch switch: a place it knew anyway)
        const was = this.sentZone.get(t);
        if (!was || was.endsWith('|[]') || (w && !was.startsWith(`${w.key}|`))) continue;
        msg = '|[]';
      }
      if (this.sentZone.get(t) === msg) continue;
      this.sentZone.set(t, msg);
      this.io.send(t, { t: 'zone', teams: JSON.parse(list) as ZoneMember[] });
    }
  }
}

const pick = (z: Zone) => ({ name: z.name, x: z.x, z: z.z, r: z.r });

/** Leg 3: StepProgressView.room of step i (the Host's matrix cell / queue detail), {} = none. */
function roomOf(leg: Leg, i: number, rec: RoomRec | undefined): Pick<StepProgressView, 'room'> {
  const s = leg.steps[i];
  const room = rec && s?.type === 'detour' ? taskOf(s, rec.b)?.room : undefined;
  return room && rec ? { room: { branch: rec.b, kind: room.kind, total: room.total, done: rec.done, skipped: rec.skipped } } : {};
}

/** A trusted pose as the machine's StandAt (null = none yet). */
const stand = (p: PoseSample | null): StandAt => p && { x: p.x, z: p.z, riding: p.mode === 'bike' };
