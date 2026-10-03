// Minimal Host page, pure part (docs/plans/phase6.md §3.19): host.state → table rows / counter lines. No DOM, so it is
// testable in Node. Phase 10 replaces the page with SPEC §13; keep the page thin.
import { LOUVRE } from '@race/shared';
import { latLonToWorld, worldToLatLon } from '@race/shared';
import { MEDIA, NET, submitCode, type AnswerStatus, type FlagWhy, type HostReview, type HostState, type LegIssueView, type QuotaCounters, type RaceStatus, type StepProgressView, type UndoItem } from '@race/shared/protocol';

/** Durable Object requests as Cloudflare bills them (same formula as worker/src/counters.ts, docs/plans/phase6.md §3.7). */
export const billableRequests = (c: QuotaCounters) => c.http + c.alarms + Math.ceil(c.wsIn / 20);

export interface TeamRow {
  slot: number;
  name: string;
  colour: string;
  code: string;
  player: string;
  status: 'online' | 'offline';
  lastSeen: string;
  reconnects: number;
  position: string;
  /** World metres, for "Thêm xe" (null = no pose yet). */
  pos: { x: number; z: number } | null;
  flagged: boolean;
  /** Phase 10 (V3): why and since when (server ms) the red flag is up, and its line on the page ('' = no flag, see flagText). */
  flagWhy: FlagWhy[];
  flagAt: number | null;
  flagText: string;
  /** Phase 7: team id, start-order, current step label, penalty, first entry (server ms; SPEC §17.23: no start time). */
  id: string;
  startOrder: number | null;
  stepLabel: string;
  penaltyMinutes: number;
  joinedAt: number | null;
}

type Leg = NonNullable<HostState['leg']>;

/** "5 giây trước" / "3 phút trước" / "—" (never connected). */
export function ago(ms: number | null, now: number): string {
  if (ms === null) return '—';
  const s = Math.max(0, Math.round((now - ms) / 1000));
  return s < 60 ? `${s} giây trước` : s < 3600 ? `${Math.floor(s / 60)} phút trước` : `${Math.floor(s / 3600)} giờ trước`;
}

/** The leg's IANA zone: every wall-clock time on the Host page is shown in it (no leg yet: Vietnam). */
const legZone = (state: HostState) => state.leg?.timezone ?? 'Asia/Ho_Chi_Minh';

const FLAG_LABEL: Record<FlagWhy, string> = { speed: 'Vượt tốc', jump: 'Dịch chuyển lạ', respawn: 'Hồi sinh nhiều' };
/** Phase 10 (V3): "Vượt tốc · Dịch chuyển lạ · lúc 14:05:09 (7 phút trước)" for a flagged team, '' for the others. The reasons keep
 *  the server's order (first raised first, no repeats); a flag with no known reason is just "Cờ đỏ"; `flagAt` = first raise of this flag. */
export function flagText(t: { flagged: boolean; flagWhy: readonly FlagWhy[]; flagAt: number | null }, now: number, tz: string): string {
  if (!t.flagged) return '';
  const why = [...new Set(t.flagWhy)].map((w) => FLAG_LABEL[w] ?? w); // `?? w`: a reason a newer server adds shows as it is
  return [why.length ? why.join(' · ') : 'Cờ đỏ', ...(t.flagAt === null ? [] : [`lúc ${fmtTimeOfDay(t.flagAt, tz)} (${ago(t.flagAt, now)})`])].join(' · ');
}

/** `now` = the server's clock estimated at the moment of drawing (state.serverMs + time since it arrived), so "x giây trước" runs. */
export function teamRows(state: HostState, now: number = state.serverMs): TeamRow[] {
  const tz = legZone(state);
  return state.teams.map((t) => {
    const ll = t.pose && worldToLatLon(t.pose.x, t.pose.z);
    return {
      slot: t.slot,
      name: t.name,
      colour: t.colour,
      code: t.code,
      player: t.player,
      status: t.online ? 'online' : 'offline',
      lastSeen: t.online ? 'đang online' : ago(t.lastSeen, now),
      reconnects: t.reconnects,
      position: ll ? `${ll.lat.toFixed(5)}, ${ll.lon.toFixed(5)}` : '—',
      pos: t.pose && { x: t.pose.x, z: t.pose.z },
      flagged: t.flagged,
      flagWhy: t.flagWhy,
      flagAt: t.flagAt,
      flagText: flagText(t, now, tz),
      id: t.id,
      startOrder: t.startOrder,
      stepLabel: t.finishAt !== null ? 'Đã về đích' : (state.leg?.steps[t.step]?.label ?? '—'),
      penaltyMinutes: t.penaltyMinutes,
      joinedAt: t.joinedAt,
    };
  });
}

/** [label, value] pairs of the quota panel (SPEC §3 / CLAUDE.md "Host debug view"). */
export function counterLines(state: HostState): [string, string][] {
  const c = state.counters;
  const n = (v: number) => v.toLocaleString('vi-VN');
  return [
    ['Tin WebSocket nhận', n(c.wsIn)],
    ['Tin WebSocket gửi', n(c.wsOut)],
    ['Request HTTP / WS mở', n(c.http)],
    ['Alarm', n(c.alarms)],
    ['Dòng SQLite ghi', n(c.rows)],
    ['Request tính phí (ước tính)', n(billableRequests(c))],
    ['Xe trên bản đồ', n(state.bikes.length)],
  ];
}

/** What the server accepts in one `host.createTeams` (shared/src/protocol/codec.ts isClientMessage): a name of 1–40 characters, ≤ 100 teams.
 *  One bad team makes it close the Host socket (4400) and create none, so the page checks first. */
export const MAX_TEAM_NAME = 40;
export const MAX_TEAMS_PER_BATCH = 100;

/** One team per line, "Tên đội; Tên người chơi"; colours handed out round-robin (config `hostPage.colours`).
 *  Any bad line → `error` (Vietnamese, names the line) and no teams. */
export function parseTeamLines(text: string, colours: readonly string[], first = 0): { teams: { name: string; colour: string; player?: string }[]; error: string | null } {
  const lines = text.split('\n').flatMap((l, i) => (l.trim() ? [[i + 1, l.trim()] as const] : []));
  if (lines.length > MAX_TEAMS_PER_BATCH) return { teams: [], error: `Tối đa ${MAX_TEAMS_PER_BATCH} đội mỗi lần (đang có ${lines.length} dòng).` };
  const teams: { name: string; colour: string; player?: string }[] = [];
  for (const [n, l] of lines) {
    const [name = '', player = ''] = l.split(';').map((s) => s.trim());
    if (!name) return { teams: [], error: `Dòng ${n}: thiếu tên đội (viết "Tên đội; Tên người chơi").` };
    if (name.length > MAX_TEAM_NAME) return { teams: [], error: `Dòng ${n}: tên đội dài ${name.length} ký tự, tối đa ${MAX_TEAM_NAME}.` };
    teams.push({ name, colour: colours[(first + teams.length) % colours.length]!, ...(player ? { player } : {}) });
  }
  return { teams, error: null };
}

// ── Phase 7 (docs/plans/phase7.md D9, D11, track E): race status, times in the leg's time zone, step_progress matrix ──

const pad = (n: number, w = 2) => String(Math.abs(Math.trunc(n))).padStart(w, '0');

/** Wall-clock fields of server ms `ms` in IANA zone `tz`. */
function fieldsIn(ms: number, tz: string) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(ms));
  const n = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  return { y: n('year'), mo: n('month'), d: n('day'), h: n('hour') % 24, mi: n('minute'), s: n('second') };
}

/** "mm:ss" (minutes may exceed 59); rounded once to whole seconds, so 59.6 s is "01:00", not "00:00". */
export function fmtMinSec(ms: number): string {
  const s = Math.round(Math.abs(ms) / 1000);
  return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
}
/** "HH:mm:ss" on the wall clock of zone `tz`. */
export function fmtTimeOfDay(ms: number, tz: string): string {
  const f = fieldsIn(ms, tz);
  return `${pad(f.h)}:${pad(f.mi)}:${pad(f.s)}`;
}

export interface StatusButton { op: 'start' | 'pause' | 'resume' | 'finish'; label: string; confirm: string | null; danger?: boolean }
export const STATUS_LABEL: Record<RaceStatus, string> = { lobby: 'Chưa mở', running: 'Đang đua', paused: 'Tạm dừng', finished: 'Đã kết thúc' };

/** The buttons the Host may press now (the server refuses the others, D9). `confirm` = text for window.confirm. */
export function statusButtons(state: HostState): StatusButton[] {
  const blanks = openBlanks(state);
  const start: StatusButton = {
    op: 'start',
    label: 'Mở cuộc đua',
    confirm: blanks.length ? `Còn ${blanks.length} ô chưa xong:\n- ${blanks.join('\n- ')}\n\nVẫn mở cuộc đua?` : 'Mở cuộc đua cho tất cả các đội?',
  };
  const racing = state.teams.filter((t) => t.finishAt === null).map((t) => t.name);
  const end: StatusButton = {
    op: 'finish', label: 'Kết thúc', danger: true,
    confirm: `Kết thúc cuộc đua? Các đội sẽ không mở hòm hay làm nhiệm vụ được nữa.${racing.length ? `\n\n${racing.length} đội chưa về đích sẽ nhận thông báo BỊ LOẠI: ${racing.join(', ')}.` : ''}`,
  };
  switch (state.status) {
    case 'lobby': return [start];
    case 'running': return [{ op: 'pause', label: 'Tạm dừng', confirm: 'Tạm dừng? Các đội không mở hòm / làm nhiệm vụ được cho tới khi tiếp tục; thứ hạng vẫn theo thứ tự về đích.' }, end];
    case 'paused': return [{ op: 'resume', label: 'Tiếp tục', confirm: null }, end];
    default: return [];
  }
}

/** §13.1 "ô còn trống" shown before "Mở cuộc đua": blanks of the leg, no leg, no team (SPEC §17.23: no start times). */
export function openBlanks(state: HostState): string[] {
  const out = (state.leg?.issues ?? []).filter((i) => i.level === 'blank').map((i) => `${i.where}: ${i.message}`);
  if (!state.leg) out.push('Chưa nạp chặng.');
  if (!state.teams.length) out.push('Chưa có đội nào.');
  return out;
}

/** Red banner lines (D9, §13.1). */
export function warnings(state: HostState): string[] {
  const w: string[] = [];
  const online = state.teams.filter((t) => t.online).length;
  if (state.status === 'lobby' && online) w.push(`Cuộc đua chưa mở nhưng đã có ${online} đội trong game (các đội xem được mật thư 1 nhưng chưa mở được hòm).`);
  const errors = (state.leg?.issues ?? []).filter((i) => i.level === 'error');
  if (errors.length) w.push(`Chặng đang nạp có ${errors.length} lỗi: ${errors[0]!.where}: ${errors[0]!.message}`);
  return w;
}

/** host.legResult / leg.issues → lines (errors first), Vietnamese text from the server. */
export function legIssueLines(issues: LegIssueView[]): { level: LegIssueView['level']; text: string }[] {
  const rank = { error: 0, warning: 1, blank: 2 } as const;
  return [...issues].sort((a, b) => rank[a.level] - rank[b.level]).map((i) => ({ level: i.level, text: `${i.where}: ${i.message}` }));
}

export interface StartRow { id: string; name: string; colour: string; startOrder: string; joined: string; stepLabel: string; penalty: string }
/** One row of the "Thứ tự vào game" table (SPEC §17.12 order; §17.23: no start-time input); times in the leg's zone. */
export function startRows(state: HostState): StartRow[] {
  const tz = legZone(state);
  return teamRows(state).map((r) => ({
    id: r.id, name: r.name, colour: r.colour,
    startOrder: r.startOrder === null ? '—' : String(r.startOrder),
    joined: r.joinedAt === null ? '—' : fmtTimeOfDay(r.joinedAt, tz),
    stepLabel: r.stepLabel,
    penalty: r.penaltyMinutes ? `+${r.penaltyMinutes} phút` : '—',
  }));
}

/** A button inside a matrix cell: host.review on `team` / `step` (`id` absent = approve a photo task before "Tôi đã gửi bài", or
 *  Phase 10 "Cho qua"). */
export interface CellButton { op: 'approve' | 'penalize'; team: string; step: string; id?: number; label: string; title: string; /** window.confirm text before sending ("Cho qua"). */ confirm?: string }
export interface Cell { state: 'todo' | 'active' | 'done' | 'pending' | 'locked'; text: string; title: string; buttons: CellButton[] }
/** `rank`: "1", "4 · BỊ LOẠI" (SPEC §17.23), "—"; `out`: that team is eliminated (the row is marked); `flagged`: it wears the red
 *  flag (Phase 10: the matrix marks the name, the reason and "Xóa cờ" are in "Các đội"). */
export interface ProgressRow { team: string; name: string; colour: string; rank: string; out: boolean; flagged: boolean; cells: Cell[]; penalty: string; finish: string }

const ANSWER_LABEL: Record<AnswerStatus, string> = { pending: 'chờ duyệt', approved: 'đã duyệt', penalized: 'bị phạt', wrong: 'chưa đúng', correct: 'đúng' };
/** 0.1 → "0,1" (Vietnamese decimal comma; Number.toLocaleString depends on the Node / browser ICU). */
const fmtNum = (n: number) => String(n).replace('.', ',');

/** SPEC §13.6 minimal matrix: rows = teams (ranked first: real finish order, SPEC §17.22), columns = steps. grey = not yet,
 *  yellow = at the step (elapsed there), green = done ("HH:mm:ss · mm:ss": when · how long the step took; SPEC §17.23: wall
 *  clock only, no T+ per team).
 *  Phase 8 (D16): orange = an answer waits for the Host ("chờ duyệt mm:ss", Duyệt / Phạt in the cell), purple = a countdown
 *  ("⏳ mm:ss": the Host's penalty or a branch switch), "(A ↺1)" = branch A after one switch, "✗2" = two penalties; a photo
 *  task the team has started offers "Duyệt (đã nhận ảnh)"; the title lists every answer with the Host's notes.
 *  Phase 10 (V5): every challenge / opened detour branch the team is at (yellow or purple) also offers "Cho qua". */
export function progressTable(state: HostState, now: number): { head: { label: string; title: string }[]; rows: ProgressRow[] } {
  const leg = state.leg;
  const tz = legZone(state);
  const steps = leg?.steps ?? [];
  const rankOf = new Map(state.ranking.map((r) => [r.team, r]));
  const teams = [...state.teams].sort((a, b) => (rankOf.get(a.id)?.rank ?? 1e9) - (rankOf.get(b.id)?.rank ?? 1e9) || a.slot - b.slot);
  const head = steps.map((s) => ({ label: s.label, title: s.name }));
  const rows = teams.map((t) => {
    const when = (ms: number | null) => (ms === null ? '—' : fmtTimeOfDay(ms, tz));
    const cells = steps.map((s, i): Cell => {
      const p = state.progress.find((x) => x.team === t.id && x.step === s.id);
      const lastDone = t.finishAt !== null && i === steps.length - 1;
      const doneAt = p?.completedAt ?? (lastDone ? t.finishAt : null);
      const title = [
        s.name && `${s.label}: ${s.name}`,
        p?.openedAt != null && `Nhận mật thư: ${when(p.openedAt)}`,
        p?.arrivedAt != null && `Tới điểm: ${when(p.arrivedAt)}`,
        p?.startedAt != null && `Bắt đầu nhiệm vụ: ${when(p.startedAt)}`,
        doneAt != null && `Xong: ${when(doneAt)}`,
        p?.branch && `Nhánh: ${branchTag(state, s.id, p.branch)}`,
        s.louvre && `Đang chọn (${p?.picks.length ?? 0}): ${p?.picks.join(', ') || '—'}`,
        ...(p?.answers ?? []).map((a) => `${a.branch ? `[${a.branch}] ` : ''}${a.text ? `«${a.text}»` : '(đã gửi bài)'} · ${when(a.at)} · ${ANSWER_LABEL[a.status]}${a.correct !== undefined ? ` · đúng ${a.correct}/${LOUVRE.answers}` : ''}${a.note ? ` · ghi chú: ${a.note}` : ''}`),
        p?.note && `Ghi chú Host: ${p.note}`,
        p?.approvalWaitSeconds && `Đã chờ duyệt: ${fmtMinSec(p.approvalWaitSeconds * 1000)}`,
      ].filter(Boolean).join('\n');
      const branch = p?.branch ? ` · ${branchTag(state, s.id, p.branch)}${p.branchSwitches ? ` ↺${p.branchSwitches}` : ''}` : ''; // the team's name for it (visual#3)
      const tags = `${branch}${p?.rejections ? ` ✗${p.rejections}` : ''}`;
      if (doneAt !== null) return { state: 'done', text: `${when(doneAt)} · ${fmtMinSec(doneAt - (p?.openedAt ?? doneAt))}${tags}`, title, buttons: [] };
      if (i !== t.step || t.finishAt !== null) return { state: 'todo', text: '', title, buttons: [] };
      // the team is at this step. A photo task it has started (a detour: its branch box opened) may be approved at once.
      const proof = s.type === 'detour' ? p?.branchOpenedAt != null && !!s.branches?.find((b) => b.id === p.branch)?.proof : !!s.proof && p?.startedAt != null;
      const proofBtn: CellButton[] = proof ? [{ op: 'approve', team: t.id, step: s.id, label: 'Duyệt (đã nhận ảnh)', title: 'Host đã nhận ảnh qua Messenger: duyệt mà đội chưa bấm "Tôi đã gửi bài"' }] : [];
      // Phase 10 (V5, plan M8): "Cho qua" for EVERY challenge / detour branch whose box is open (the way out when a bug holds a team);
      // the same host.review approve without an `id` as the photo button, always behind a confirm. Not while an answer waits (below).
      const skip: CellButton[] = s.type === 'challenge' || (s.type === 'detour' && p?.branchOpenedAt != null)
        ? [{ op: 'approve', team: t.id, step: s.id, label: 'Cho qua', title: 'Lối thoát: đội kẹt (lỗi, mất kết nối…) được qua bước, nhận mật thư kế mà không cần câu trả lời', confirm: `Cho ${t.name} qua ${s.louvre ? 'phòng Louvre mà không cần chọn đúng' : `${s.label}${p?.branch ? ` (nhánh ${branchTag(state, s.id, p.branch)})` : ''} mà không cần câu trả lời`}?` }]
        : [];
      const last = p?.answers.at(-1);
      if (s.louvre) {
        // Phase 8B: the Host never reviews (the server marks); the cell shows picks / misses / hint marks, and a way out for a stuck team.
        const base = p?.startedAt ?? p?.openedAt ?? null;
        const [m1, m2] = s.louvre.hints;
        const hint = base === null ? '' : now >= base + m2 * 60_000 ? ` · 💡${fmtNum(m2)}${p?.hintCorrect != null ? ` (${p.hintCorrect}/${LOUVRE.answers})` : ''}` : now >= base + m1 * 60_000 ? ` · 💡${fmtNum(m1)}` : '';
        const locked = p?.lockedUntil != null && p.lockedUntil > now;
        const text = `chọn ${p?.picks.length ?? 0}/${LOUVRE.artworks}${p?.rejections ? ` · ✗${p.rejections}` : ''}${hint}`;
        return locked ? { state: 'locked', text: `⏳ ${fmtMinSec(p!.lockedUntil! - now)} · ${text}`, title, buttons: skip } : { state: 'active', text, title, buttons: skip };
      }
      if (p?.pending && last) {
        const lock = state.queue.find((q) => q.team === t.id && q.step === s.id && q.id === last.id)?.lockMinutes ?? leg?.penalties.retryLockMinutes;
        return { state: 'pending', text: `chờ duyệt ${fmtMinSec(now - last.at)}${tags}`, title, buttons: [
          { op: 'approve', team: t.id, step: s.id, id: last.id, label: 'Duyệt', title: 'Duyệt câu trả lời này: đội nhận mật thư kế' },
          { op: 'penalize', team: t.id, step: s.id, id: last.id, label: 'Phạt', title: `Phạt${lock !== undefined ? ` ${fmtNum(lock)} phút` : ''}: đội chờ hết đếm ngược rồi trả lời lại` },
        ] };
      }
      if (p?.lockedUntil != null && p.lockedUntil > now) {
        // a mistaken "Phạt" is corrected by approving that answer (the server accepts the newest penalized one) - not the
        // countdown of a branch switch (branch box not open: the last answer belongs to the branch the team left)
        const retry = s.type !== 'detour' || p.branchOpenedAt != null;
        const redo: CellButton[] = !proof && retry && last?.status === 'penalized' && last.branch === p.branch ? [{ op: 'approve', team: t.id, step: s.id, id: last.id, label: 'Duyệt câu vừa phạt', title: 'Nhầm tay bấm Phạt? Duyệt lại câu vừa bị phạt: đội nhận mật thư kế, hết đếm ngược' }] : [];
        return { state: 'locked', text: `⏳ ${fmtMinSec(p.lockedUntil - now)}${tags}`, title, buttons: [...proofBtn, ...redo, ...skip] };
      }
      return { state: 'active', text: `${p?.openedAt != null ? fmtMinSec(now - p.openedAt) : '…'}${tags}`, title, buttons: [...proofBtn, ...skip] };
    });
    const r = rankOf.get(t.id);
    return {
      team: t.id, name: t.name, colour: t.colour,
      rank: r ? `${r.rank}${r.out ? ' · BỊ LOẠI' : ''}` : '—',
      out: !!r?.out,
      flagged: t.flagged,
      cells,
      penalty: t.penaltyMinutes ? `+${t.penaltyMinutes} phút` : '—',
      finish: when(t.finishAt),
    };
  });
  return { head, rows };
}

// ── Phase 8 (docs/plans/phase8.md D10, D11, D14, D16, track E): review queue, stuck alerts, R2 images ──

/** host.review of a cell / queue button. `note` '' = none (op 'note' sends '' to clear the Host note); never longer than NET.noteMax. */
export function reviewMessage(team: string, step: string, op: HostReview['op'], id: number | undefined, note: string): HostReview {
  const n = note.trim().slice(0, NET.noteMax);
  return { t: 'host.review', team, step, op, ...(id !== undefined ? { id } : {}), ...(op === 'note' || n ? { note: n } : {}) };
}

export interface QueueRow {
  /** team|step|id: new-item detection and the draft note. */
  key: string;
  team: string;
  name: string;
  colour: string;
  step: string;
  label: string;
  branch: string | null;
  /** "Tính (A)": the branch as the team names it (visual#3), '' without a branch. */
  branchName: string;
  id: number;
  /** submitCode: what the team pastes on Messenger with its photo. */
  code: string;
  /** '' = "đã gửi bài qua Messenger". */
  text: string;
  waiting: string;
  reference: string[];
  note: string;
  lockMinutes: number;
}
/** The review queue ("Chờ duyệt"), oldest answer first. `now` = the server's clock estimated at drawing. */
export function queueRows(state: HostState, now: number): QueueRow[] {
  const teams = new Map(state.teams.map((t) => [t.id, t]));
  return [...state.queue].sort((a, b) => a.at - b.at).map((q) => {
    const t = teams.get(q.team);
    const name = t?.name ?? q.team;
    return { key: `${q.team}|${q.step}|${q.id}`, team: q.team, name, colour: t?.colour ?? '#8d99b0', step: q.step, label: q.label, branch: q.branch, branchName: q.branch ? branchTag(state, q.step, q.branch) : '', id: q.id, code: submitCode(name, q.step, q.branch), text: q.text, waiting: fmtMinSec(now - q.at), reference: q.reference, note: q.note, lockMinutes: q.lockMinutes };
  });
}
/** The queue only rebuilds (so a note box keeps its focus) when this changes: who, which step, which answer, when. */
export const queueSig = (state: HostState): string => JSON.stringify(state.queue.map((q) => [q.id, q.team, q.step, q.at]));
/** Items of `rows` not seen before (`seen` is updated). `silent` = the first state of a page load: nothing is new then. */
export function freshQueue(seen: Set<string>, rows: QueueRow[], silent: boolean): QueueRow[] {
  const fresh = rows.filter((r) => !seen.has(r.key));
  for (const r of rows) seen.add(r.key);
  return silent ? [] : fresh;
}

/** The host.review the "Hoàn tác" button sends: `id` = the answer the decision was on (HostState.undo lists it; a "Cho qua" made one). */
export const undoMessage = (team: string, step: string, id: number): HostReview => reviewMessage(team, step, 'undo', id, '');

export interface UndoRow {
  /** team|step|id */
  key: string;
  team: string;
  name: string;
  colour: string;
  step: string;
  label: string;
  op: UndoItem['op'];
  id: number;
  /** Whole seconds the button still has (≥ 1). */
  secondsLeft: number;
  /** "Đã Duyệt «42» của Đội Xanh – Thử thách 1" (the answer is left out when it has no text: a photo, a "Cho qua"). */
  text: string;
  /** "Hoàn tác (còn 7 s)". */
  button: string;
}
/** Phase 10 (V2): the decisions the Host may still take back, newest first. The countdown runs on `now` (the server's clock the page
 *  estimates, state.serverMs + time since it arrived) against each `until`; one that ran out is not listed (the server refuses it). */
export function undoRows(state: HostState, now: number): UndoRow[] {
  const teams = new Map(state.teams.map((t) => [t.id, t]));
  return state.undo.filter((u) => u.until > now).sort((a, b) => b.at - a.at).map((u) => {
    const t = teams.get(u.team);
    const name = t?.name ?? u.team;
    const label = state.leg?.steps.find((s) => s.id === u.step)?.label ?? u.step;
    const said = state.progress.find((p) => p.team === u.team && p.step === u.step)?.answers.find((a) => a.id === u.id)?.text ?? '';
    const secondsLeft = Math.ceil((u.until - now) / 1000);
    return {
      key: `${u.team}|${u.step}|${u.id}`, team: u.team, name, colour: t?.colour ?? '#8d99b0', step: u.step, label, op: u.op, id: u.id, secondsLeft,
      text: `Đã ${u.op === 'approve' ? 'Duyệt' : 'Phạt'}${said ? ` «${said.length > 40 ? `${said.slice(0, 40)}…` : said}»` : ''} của ${name} – ${label}`,
      button: `Hoàn tác (còn ${secondsLeft} s)`,
    };
  });
}

/** A detour branch for the Host: "Tính (A)" (the team says "Tính"; the submit code has "A"), the id alone if unnamed. */
export function branchTag(state: HostState, step: string, id: string): string {
  const t = state.leg?.steps.find((s) => s.id === step)?.branches?.find((b) => b.id === id)?.title;
  return t ? `${t} (${id})` : id;
}

export interface StuckAlert { key: string; team: string; name: string; step: string; label: string; branch: string | null; minutes: number; period: number; text: string }
/** D11 (instead of a server alarm): a team on one challenge / branch for `minutes` or more, repeating every period until it is
 *  done. Counted from task_started_at, a detour from branch_opened_at; from the clue's openedAt while neither exists (teaser not
 *  accepted, wandering at "choose" / "goToBranch"). Not stuck: waiting for the Host (the queue shows it), done, finished,
 *  race not on. */
export function stuckAlerts(state: HostState, now: number, minutes: number = state.leg?.stuckMinutes ?? 45): StuckAlert[] {
  const leg = state.leg;
  if (!leg || !(minutes > 0) || (state.status !== 'running' && state.status !== 'paused')) return [];
  const out: StuckAlert[] = [];
  for (const t of state.teams) {
    const s = leg.steps[t.step];
    if (!s || t.finishAt !== null || (s.type !== 'challenge' && s.type !== 'detour')) continue;
    const p = state.progress.find((x) => x.team === t.id && x.step === s.id);
    if (!p || p.completedAt != null || p.pending) continue;
    const from = (s.type === 'detour' ? p.branchOpenedAt : p.startedAt) ?? p.openedAt;
    if (from == null) continue;
    const period = Math.floor((now - from) / (minutes * 60_000));
    if (period < 1) continue;
    const mins = Math.floor((now - from) / 60_000);
    out.push({ key: `${t.id}|${s.id}`, team: t.id, name: t.name, step: s.id, label: s.label, branch: p.branch, minutes: mins, period, text: `${t.name} làm ${s.label}${p.branch ? ` (nhánh ${branchTag(state, s.id, p.branch)})` : ''} đã ${mins} phút (cứ ${fmtNum(minutes)} phút báo một lần).` });
  }
  return out;
}
/** The alerts to sound now: a team / step whose period went up since `alerted` (updated). repeat = false: the first period only. */
export function freshAlerts(alerted: Map<string, number>, alerts: StuckAlert[], repeat: boolean): StuckAlert[] {
  const fresh = alerts.filter((a) => a.period > (alerted.get(a.key) ?? 0) && (repeat || a.period === 1));
  for (const a of alerts) alerted.set(a.key, Math.max(a.period, alerted.get(a.key) ?? 0));
  return fresh;
}

/** The R2 image names the loaded leg refers to ("Hình mật thư"). */
export const mediaNames = (state: HostState): string[] => [...new Set(state.leg?.media ?? [])];
/** `/api/race/<race>/media/<name>`: HEAD (exists?), PUT (upload), GET (view), all with `Authorization: Bearer <Host token>`. */
export const mediaPath = (apiBase: string, race: string, name: string) => `${apiBase}/race/${encodeURIComponent(race)}/media/${encodeURIComponent(name)}`;
/** What the Worker would refuse before it reads the body (415 / 413): checked on the page for a Vietnamese reason. */
export function checkMediaFile(f: { type: string; size: number }): string | null {
  if (!(MEDIA.types as readonly string[]).includes(f.type)) return 'Chỉ nhận hình jpg, png hoặc webp.';
  if (f.size > MEDIA.maxBytes) return `Hình ${(f.size / 1048576).toFixed(1)} MB, tối đa ${MEDIA.maxBytes / 1048576} MB (nén bớt rồi tải lại).`;
  return null;
}
/** Worker answer to a media PUT / HEAD → Vietnamese. */
export function mediaErrorText(status: number): string {
  switch (status) {
    case 400: return 'Tên hình sai (chỉ chữ, số, dấu chấm, gạch; đuôi jpg / png / webp).';
    case 401: return 'Phiên Host hết hạn, đăng nhập lại.';
    case 403: return 'Chỉ Host mới tải hình lên được.';
    case 411: return 'Trình duyệt không gửi độ dài tệp (411).';
    case 413: return `Hình quá ${MEDIA.maxBytes / 1048576} MB.`;
    case 415: return 'Chỉ nhận hình jpg, png hoặc webp.';
    default: return `Máy chủ trả lỗi ${status}.`;
  }
}
// ── Phase 10 (SPEC §17.25): "Xuất dữ liệu thời gian" – the raw per-team timing as CSV + JSON, served by the Worker to the Host only ──

export type ExportFormat = 'csv' | 'json';
/** `/api/race/<race>/export?format=csv|json`: a GET with `Authorization: Bearer <Host token>` (the token is never in the URL). */
export const exportPath = (apiBase: string, race: string, format: ExportFormat) => `${apiBase}/race/${encodeURIComponent(race)}/export?format=${format}`;
/** The name the file is saved under: race-<id>-thoi-gian.csv / .json (anything but a-z, 0-9, "-" in the id becomes "-"). */
export const exportFileName = (race: string, format: ExportFormat) => `race-${race.replace(/[^a-z0-9-]/gi, '-')}-thoi-gian.${format}`;
/** Asked before exporting a race that is not over ('' = no question): the numbers of a team still racing are not final. */
export const exportConfirm = (status: RaceStatus): string | null => (status === 'finished' ? null : 'Cuộc đua chưa kết thúc, dữ liệu có thể chưa đủ. Vẫn xuất dữ liệu thời gian?');
/** Worker answer to the export GET → Vietnamese. */
export function exportErrorText(status: number): string {
  switch (status) {
    case 401: return 'Phiên Host hết hạn, đăng nhập lại.';
    default: return status >= 500 ? `Máy chủ lỗi (${status}), thử lại sau ít phút.` : `Máy chủ trả lỗi ${status}.`;
  }
}
export type ExportResult = { ok: true; blob: Blob; name: string } | { ok: false; error: string };
/** One export file. `fetchFn` is injected (tests). The body is kept as a Blob, not text: `Response.text()` would drop the UTF-8 BOM
 *  that lets Excel read the Vietnamese. */
export async function fetchExport(fetchFn: typeof fetch, apiBase: string, race: string, token: string, format: ExportFormat): Promise<ExportResult> {
  const r = await fetchFn(exportPath(apiBase, race, format), { headers: { Authorization: `Bearer ${token}` } }).catch(() => null);
  if (!r) return { ok: false, error: 'Không kết nối được máy chủ.' };
  if (!r.ok) return { ok: false, error: exportErrorText(r.status) };
  const blob = await r.blob().catch(() => null);
  return blob ? { ok: true, blob, name: exportFileName(race, format) } : { ok: false, error: 'Tải bị gián đoạn, thử lại.' };
}

/** One CSV line (RFC 4180): a field with a comma, a quote or a line break is quoted. */
export const csvLine = (fields: readonly (string | number)[]): string => fields.map((v) => { const s = String(v); return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(',');
/** `/host.html?demo=1` has no server: a small SAMPLE of the export (one row per team x step, ISO UTC times) so the button can be tried.
 *  The real files (all of SPEC §17.25: more columns, the team table, the event log) come from the Worker. CSV starts with the UTF-8 BOM. */
export function demoExportText(state: HostState, format: ExportFormat): string {
  const head = ['Đội', 'Mã bước', 'Tên bước', 'Nhánh', 'Mở hòm', 'Tới điểm', 'Bắt đầu nhiệm vụ', 'Hoàn thành', 'Số lần phạt', 'Chờ Host duyệt (giây)'];
  const iso = (ms: number | null) => (ms === null ? '' : new Date(ms).toISOString());
  const names = new Map(state.teams.map((t) => [t.id, t.name]));
  const labels = new Map((state.leg?.steps ?? []).map((s) => [s.id, s.label]));
  const rows = state.progress.map((p) => [names.get(p.team) ?? p.team, p.step, labels.get(p.step) ?? p.step, p.branch ?? '', iso(p.openedAt), iso(p.arrivedAt), iso(p.startedAt), iso(p.completedAt), p.rejections, p.approvalWaitSeconds]);
  return format === 'csv' ? `﻿${[head, ...rows].map(csvLine).join('\r\n')}\r\n` : JSON.stringify(rows.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]]))), null, 1);
}

/** Under the leg title (D16 (5)): "Phạt 3 / 10 phút (trả lời lại / đổi nhánh) · cảnh báo kẹt sau 45 phút." */
export const legPenaltyLine = (leg: Leg): string => `Phạt ${fmtNum(leg.penalties.retryLockMinutes)} / ${fmtNum(leg.penalties.branchSwitchLockMinutes)} phút (trả lời lại / đổi nhánh) · cảnh báo kẹt sau ${fmtNum(leg.stuckMinutes)} phút.`;

/** Phase 8B: one line per louvre step of the leg for the leg box (no artwork data reaches the Host page bundle). */
export const louvreLines = (leg: Leg): string[] =>
  leg.steps.flatMap((s) => (s.louvre ? [`${s.label}: phòng Louvre, ${LOUVRE.artworks} tác phẩm (ảnh / mô hình có sẵn trong game, không cần tải lên), gợi ý phút ${fmtNum(s.louvre.hints[0])} / ${fmtNum(s.louvre.hints[1])}.`] : []));

export interface XZ { x: number; z: number }
/** SPEC §6.2 / D11: corridor points = start → every step's zone in order (both places of a detour); checkpoints = every zone
 *  (bikes keep vehicles.minDistanceFromCheckpoint away). Consecutive points < 1 m apart are one point (steps at the same place). */
export function corridorPoints(leg: Leg): { points: XZ[]; checkpoints: XZ[] } {
  const all: XZ[] = [leg.start];
  for (const s of leg.steps) {
    all.push({ x: s.x, z: s.z });
    for (const b of s.branches ?? []) all.push({ x: b.x, z: b.z });
  }
  const points = all.filter((p, i) => i === 0 || Math.hypot(p.x - all[i - 1]!.x, p.z - all[i - 1]!.z) >= 1);
  const checkpoints = all.slice(1).filter((p, i, a) => a.findIndex((q) => Math.hypot(q.x - p.x, q.z - p.z) < 1) === i);
  return { points, checkpoints };
}

/** `/host.html?demo=1`: fake state for screenshots, no server (a running race with 6 teams, 6 steps, progress + ranking, a review queue, a stuck team). */
export function demoState(now = 1_000_000): HostState {
  const pose = (x: number, z: number) => ({ x, y: 0, z, yaw: 0, mode: 'walk' as const, action: 'none' as const });
  const min = 60_000;
  type T = HostState['teams'][number];
  const team = (slot: number, name: string, colour: string, code: string, player: string, online: boolean, seenAgo: number | null, reconnects: number, p: ReturnType<typeof pose> | null, race: Partial<T> = {}, flagged = false): T =>
    ({ slot, id: `t${slot}`, name, colour, online, code, player, lastSeen: seenAgo === null ? null : now - seenAgo, reconnects, pose: p, flagged, flagWhy: flagged ? ['speed'] : [], flagAt: flagged ? now - 7 * min : null, startOrder: null, step: 0, finishAt: null, penaltyMinutes: 0, joinedAt: null, ...race });
  const pt = (lat: number, lon: number, r: number, name: string) => ({ ...(({ x, z }) => ({ x, z }))(latLonToWorld(lat, lon)), r, name });
  const s = (id: string, type: 'route_info' | 'detour' | 'challenge' | 'pit_stop', label: string, p: ReturnType<typeof pt>, branches?: ReturnType<typeof pt>[]) =>
    ({ id, type, label, name: p.name, x: p.x, z: p.z, r: p.r, proof: false, ...(branches && { branches: branches.map((b, i) => ({ id: 'AB'[i]!, title: ['Tính', 'Ảnh'][i]!, ...b, proof: i === 1 })) }) });
  const t0 = now - 50 * min;
  const row = (team: string, step: string, o: number | null, a: number | null, c: number | null, branch: string | null = null, more: Partial<StepProgressView> = {}): StepProgressView => ({
    team, step, openedAt: o, arrivedAt: a, startedAt: c, completedAt: c, branch,
    submittedAt: null, decidedAt: null, rejections: 0, wrongAnswers: 0, branchSwitches: 0, branchOpenedAt: null, lockedUntil: null, pending: false, approvalWaitSeconds: 0, answers: [], note: '', picks: [], hintCorrect: null, // Phase 8B: the louvre cell's fields (demoState sets them on its T3 rows)
    ...more,
  });
  const ans = (id: number, text: string, at: number, status: StepProgressView['answers'][number]['status'], branch: string | null = null, note?: string) => ({ id, text, at, status, branch, ...(note ? { note } : {}) });
  return {
    t: 'host.state',
    serverMs: now,
    status: 'running',
    teams: [
      team(0, 'Đội Xanh', '#2c6bd8', 'K7M3QX', 'An', true, 0, 1, pose(120, -310), { startOrder: 1, joinedAt: t0 + 2 * min, step: 5, finishAt: now - 4 * min }),
      team(1, 'Đội Đỏ', '#d8342c', 'W9HT4B', 'Bình', true, 0, 0, pose(-80, 40), { startOrder: 2, joinedAt: t0 + 9 * min, step: 3, penaltyMinutes: 2 }, true),
      // Đội Vàng: two reasons for its flag (Phase 10 V3, the p10 picture)
      team(2, 'Đội Vàng', '#e0b020', 'R2NZ8P', 'Chi', false, 95_000, 3, pose(400, -520), { startOrder: 3, joinedAt: t0 + 6 * min, step: 3, flagged: true, flagWhy: ['jump', 'respawn'], flagAt: now - 2 * min }),
      team(3, 'Đội Lục', '#2c9a4a', 'D5FY6E', '', false, null, 0, null),
      // Đội Tím: on Thử thách 1 for 46 min (the stuck warning), penalized twice, waiting out the countdown
      team(4, 'Đội Tím', '#8a3fc4', 'M4PC7S', 'Dũng', false, 20 * min, 1, pose(60, -150), { startOrder: 4, joinedAt: now - 58 * min, step: 1 }),
      // Đội Cam: switched branch once, now waits for the Host on Lựa chọn kép (nhánh A, a typed answer)
      team(5, 'Đội Cam', '#e07a20', 'H8LV2T', 'Em', false, 30_000, 0, pose(-200, -260), { startOrder: 5, joinedAt: t0 + 11 * min, step: 3 }),
    ],
    counters: { wsIn: 18_420, wsOut: 41_200, http: 12, alarms: 3, rows: 1_262 },
    bikes: [],
    spawning: { paused: false, candidates: 120, nextAt: null },
    leg: {
      id: 'mini', title: 'Chặng ngắn để test (NỘI DUNG GIẢ)', timezone: 'Asia/Ho_Chi_Minh', start: (({ x, z }) => ({ x, z }))(latLonToWorld(48.85585, 2.28744)),
      steps: [
        s('L1', 'route_info', 'Lộ trình 1', pt(48.86215, 2.28843, 35, 'Sân trước Palais de Chaillot')),
        s('T1', 'challenge', 'Thử thách 1', pt(48.8605, 2.2903, 30, 'Vườn Trocadéro')),
        s('L2', 'route_info', 'Lộ trình 2', pt(48.8583, 2.2945, 40, 'Chân tháp Eiffel')),
        s('D1', 'detour', 'Lựa chọn kép', pt(48.8583, 2.2945, 40, 'Chân tháp Eiffel'), [pt(48.8583, 2.2945, 40, 'Chân tháp Eiffel'), pt(48.8562, 2.2978, 30, 'Champ de Mars')]),
        s('L3', 'route_info', 'Lộ trình 3', pt(48.8596, 2.29243, 25, 'Giữa cầu Iéna')),
        s('PS', 'pit_stop', 'Về đích', pt(48.8596, 2.29243, 25, 'Giữa cầu Iéna')),
      ],
      vehicles: { corridorMeters: 150, minDistanceFromCheckpoint: 100, initialPerSegment: [0, 1], spawnIntervalMinutes: 3, spawnChance: 0.3, maxAvailablePerSegment: 1, decoyRatio: 0.4, noSpawnNearPlayerMeters: 120, abandonMeters: 200, abandonSeconds: 60, bikeParking: { offsetMeters: 20, maxBikes: 6 } },
      bundled: ['paris-demo', 'mini'],
      issues: [{ level: 'blank', where: 'Lộ trình 1', message: 'chưa có mật thư (ô trống)' }],
      media: ['test-gia.jpg', 'test-gia-2.jpg'], penalties: { retryLockMinutes: 3, branchSwitchLockMinutes: 10 }, stuckMinutes: 45,
    },
    progress: [
      row('t0', 'L1', t0, t0 + 14 * min, t0 + 15 * min),
      row('t0', 'T1', t0 + 15 * min, t0 + 19 * min, t0 + 23 * min, null, {
        rejections: 1, approvalWaitSeconds: 95, answers: [ans(1, '41', t0 + 20 * min, 'penalized', null, 'Chưa đúng, thử lại'), ans(2, '42', t0 + 22 * min, 'approved')],
      }),
      row('t0', 'L2', t0 + 23 * min, t0 + 31 * min, t0 + 32 * min),
      row('t0', 'D1', t0 + 32 * min, t0 + 33 * min, t0 + 40 * min, 'A', { branchSwitches: 1, branchOpenedAt: t0 + 36 * min }),
      row('t0', 'L3', t0 + 40 * min, t0 + 44 * min, t0 + 45 * min), row('t0', 'PS', t0 + 45 * min, t0 + 46 * min, t0 + 46 * min),
      row('t1', 'L1', t0 + 8 * min, t0 + 22 * min, t0 + 24 * min), row('t1', 'T1', t0 + 24 * min, t0 + 29 * min, t0 + 35 * min), row('t1', 'L2', t0 + 35 * min, t0 + 41 * min, t0 + 42 * min),
      // Đội Đỏ: took the photo branch B and opened its box: the Host may approve it before the team presses "Tôi đã gửi bài"
      { ...row('t1', 'D1', t0 + 42 * min, t0 + 43 * min, null, 'B', { branchOpenedAt: t0 + 44 * min }), completedAt: null },
      row('t2', 'L1', t0 + 4 * min, t0 + 19 * min, t0 + 21 * min), row('t2', 'T1', t0 + 21 * min, t0 + 25 * min, t0 + 31 * min), row('t2', 'L2', t0 + 31 * min, t0 + 38 * min, t0 + 40 * min),
      // Đội Vàng: photo branch B sent ("đã gửi bài"), waiting for the Host
      { ...row('t2', 'D1', t0 + 40 * min, t0 + 41 * min, null, 'B', { branchOpenedAt: t0 + 42 * min, pending: true, submittedAt: now - 72_000, answers: [ans(1, '', now - 72_000, 'pending', 'B')] }), completedAt: null },
      row('t4', 'L1', now - 60 * min, now - 48 * min, now - 47 * min),
      { ...row('t4', 'T1', now - 47 * min, now - 46 * min - 30_000, now - 46 * min, null, { rejections: 2, lockedUntil: now + 110_000, approvalWaitSeconds: 130, answers: [ans(1, '41', now - 12 * min, 'penalized'), ans(2, '43', now - 5 * min, 'penalized', null, 'Gần đúng, đọc lại đề')] }), completedAt: null },
      row('t5', 'L1', t0 + 10 * min, t0 + 22 * min, t0 + 24 * min), row('t5', 'T1', t0 + 24 * min, t0 + 28 * min, t0 + 33 * min), row('t5', 'L2', t0 + 33 * min, t0 + 37 * min, t0 + 38 * min),
      { ...row('t5', 'D1', t0 + 38 * min, t0 + 45 * min, null, 'A', { branchSwitches: 1, branchOpenedAt: t0 + 46 * min, pending: true, submittedAt: now - 45_000, answers: [ans(1, 'bảy', now - 45_000, 'pending', 'A')] }), completedAt: null },
    ],
    ranking: [
      { team: 't0', rank: 1, stepIndex: 5, finishAt: now - 4 * min, out: false },
      { team: 't2', rank: 2, stepIndex: 3, finishAt: null, out: false },
      { team: 't1', rank: 3, stepIndex: 3, finishAt: null, out: false },
    ],
    queue: [
      { team: 't2', step: 'D1', label: 'Lựa chọn kép', branch: 'B', id: 1, text: '', at: now - 72_000, reference: ['(MẪU) Hình chụp rõ biển tên đường ở góc phố'], note: '', lockMinutes: 3 },
      { team: 't5', step: 'D1', label: 'Lựa chọn kép', branch: 'A', id: 1, text: 'bảy', at: now - 45_000, reference: ['7', 'bảy'], note: '', lockMinutes: 3 },
    ],
    // Phase 10 (V2): Đội Xanh's «42» on Thử thách 1 was approved 3 s ago: the undo button has 7 s left (`?undoLeft=<s>` on the page
    // keeps it that much longer, for screenshots)
    undo: [{ team: 't0', step: 'T1', id: 2, op: 'approve', at: now - 3_000, until: now - 3_000 + NET.undoMs }],
  };
}

/** Phase 8B (`/host.html?demo=1&louvre=1`): demoState + a louvre step "Thử thách 3" before "Về đích". Đội Xanh has done it,
 *  Đội Lục is in the room past the 70 min mark (6 lit, two misses, a countdown). Neutral wording: no artwork names, no answers. */
export function withLouvreDemo(state: HostState): HostState {
  const leg = state.leg!;
  const now = state.serverMs;
  const min = 60_000;
  const at = leg.steps.findIndex((x) => x.id === 'PS');
  const lv = { id: 'T3', type: 'challenge' as const, label: 'Thử thách 3', name: 'Phòng Louvre (demo)', x: 1200, z: -400, r: 25, proof: false, louvre: { hints: [40, 70] as [number, number] } };
  const done = state.progress.find((p) => p.team === 't0' && p.step === 'L3')!;
  const base = { ...done, branch: null, answers: [], picks: [], hintCorrect: null, rejections: 0, lockedUntil: null };
  const t0 = now - 120 * min; // T3 opened at t0 + 40 = 80 min ago: past both marks
  const step = (team: string, o: number, more: Partial<StepProgressView> = {}): StepProgressView => ({ ...base, team, step: 'T3', openedAt: o, arrivedAt: o, startedAt: o, completedAt: null, ...more });
  const answers = [{ id: 1, text: '6 tác phẩm', at: now - 20 * min, status: 'wrong' as const, branch: null, correct: 2 }, { id: 2, text: '5 tác phẩm', at: now - 5 * min, status: 'wrong' as const, branch: null, correct: 3 }];
  return {
    ...state,
    teams: state.teams.map((t) => (t.id === 't0' ? { ...t, step: 6 } : t.id === 't3' ? { ...t, step: at, startOrder: 6, joinedAt: t0 + min } : t)),
    leg: { ...leg, steps: [...leg.steps.slice(0, at), lv, ...leg.steps.slice(at)] },
    progress: [
      ...state.progress,
      step('t0', now - 30 * min, { completedAt: now - 8 * min }),
      ...['L1', 'T1', 'L2', 'D1', 'L3'].map((id, i) => ({ ...base, team: 't3', step: id, branch: id === 'D1' ? 'A' : null, openedAt: t0 + i * 8 * min, arrivedAt: t0 + i * 8 * min, startedAt: t0 + (i + 1) * 8 * min - 1, completedAt: t0 + (i + 1) * 8 * min })),
      step('t3', t0 + 40 * min, { rejections: 2, lockedUntil: now + 130_000, picks: ['art-04', 'art-09', 'art-11', 'art-15', 'art-20'], hintCorrect: 3, answers }),
    ],
    ranking: state.ranking.map((r) => (r.team === 't0' ? { ...r, stepIndex: 6 } : r)),
  };
}
