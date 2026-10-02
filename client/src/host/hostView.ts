// Minimal Host page, pure part (docs/plans/phase6.md §3.19): host.state → table rows / counter lines. No DOM, so it is
// testable in Node. Phase 10 replaces the page with SPEC §13; keep the page thin.
import { latLonToWorld, worldToLatLon } from '@race/shared';
import type { HostState, LegIssueView, QuotaCounters, RaceStatus } from '@race/shared/protocol';

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
  /** Phase 7: team id (host.team), start-order, current step label, penalty, start time + first entry (server ms). */
  id: string;
  startOrder: number | null;
  stepLabel: string;
  penaltyMinutes: number;
  startAt: number | null;
  joinedAt: number | null;
}

type Leg = NonNullable<HostState['leg']>;

/** "5 giây trước" / "3 phút trước" / "—" (never connected). */
export function ago(ms: number | null, now: number): string {
  if (ms === null) return '—';
  const s = Math.max(0, Math.round((now - ms) / 1000));
  return s < 60 ? `${s} giây trước` : s < 3600 ? `${Math.floor(s / 60)} phút trước` : `${Math.floor(s / 3600)} giờ trước`;
}

/** `now` = the server's clock estimated at the moment of drawing (state.serverMs + time since it arrived), so "x giây trước" runs. */
export function teamRows(state: HostState, now: number = state.serverMs): TeamRow[] {
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
      id: t.id,
      startOrder: t.startOrder,
      stepLabel: t.finishAt !== null ? 'Đã về đích' : (state.leg?.steps[t.step]?.label ?? '—'),
      penaltyMinutes: t.penaltyMinutes,
      startAt: t.startAt,
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

// ── Phase 7 (docs/plans/phase7.md D9, D11, D15, track E): race status, start times in the leg's time zone, step_progress matrix ──

const pad = (n: number, w = 2) => String(Math.abs(Math.trunc(n))).padStart(w, '0');

/** Wall-clock fields of server ms `ms` in IANA zone `tz`. */
function fieldsIn(ms: number, tz: string) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(ms));
  const n = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  return { y: n('year'), mo: n('month'), d: n('day'), h: n('hour') % 24, mi: n('minute'), s: n('second') };
}

/** `<input type="datetime-local" step="1">` value ("2026-10-03T14:05:30") of server ms `ms`, read in zone `tz`. */
export function msToInput(ms: number, tz: string): string {
  const f = fieldsIn(ms, tz);
  return `${pad(f.y, 4)}-${pad(f.mo)}-${pad(f.d)}T${pad(f.h)}:${pad(f.mi)}:${pad(f.s)}`;
}

/** The wall-clock text of a datetime-local input read IN zone `tz` (not the Host machine's zone) → server ms; null = not a time. */
export function inputToMs(value: string, tz: string): number | null {
  const m = /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d)(?::(\d\d))?$/.exec(value.trim());
  if (!m) return null;
  const [y, mo, d, h, mi, s] = m.slice(1).map((v) => Number(v ?? 0)) as [number, number, number, number, number, number];
  const guess = Date.UTC(y, mo - 1, d, h, mi, s);
  const offset = (at: number) => {
    const f = fieldsIn(at, tz);
    return Date.UTC(f.y, f.mo - 1, f.d, f.h, f.mi, f.s) - Math.floor(at / 1000) * 1000;
  };
  let ms = guess - offset(guess);
  const again = offset(ms);
  if (again !== guess - ms) ms = guess - again; // the other side of a DST change
  return ms;
}

/** "hh:mm:ss" of a duration (negative: "-hh:mm:ss"). */
export function fmtDuration(ms: number): string {
  const s = Math.round(Math.abs(ms) / 1000);
  return `${ms < 0 ? '-' : ''}${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
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

/** What the Host reads under the start-time input: the team clock that value would give right now, or (finished team,
 *  `finishAt` set) its final time = finishAt − start (D15: the server refuses a start in the future or after the finish). */
export function startPreview(inputMs: number | null, nowMs: number, finishAt: number | null = null): { text: string; level: 'ok' | 'warn' | 'bad' } {
  if (inputMs === null) return { text: 'Chưa hiểu giờ này.', level: 'bad' };
  if (inputMs - nowMs > 60_000) return { text: `Giờ này còn ${fmtDuration(inputMs - nowMs)} nữa mới tới: máy chủ sẽ từ chối (tối đa 60 giây sau bây giờ).`, level: 'bad' };
  if (finishAt !== null && inputMs > finishAt) return { text: 'Giờ này sau giờ về đích của đội: máy chủ sẽ từ chối.', level: 'bad' };
  const d = (finishAt ?? nowMs) - inputMs;
  if (d < 0) return { text: 'Đồng hồ đội bắt đầu từ bây giờ.', level: 'ok' };
  const level = d > 6 * 3600_000 ? 'warn' : 'ok';
  return finishAt !== null ? { text: `Đội đã về đích: thời gian sẽ là T+${fmtDuration(d)}.`, level } : { text: `Đồng hồ đội sẽ hiện T+${fmtDuration(d)}.`, level };
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
  const end: StatusButton = { op: 'finish', label: 'Kết thúc', confirm: 'Kết thúc cuộc đua? Các đội sẽ không mở hộp hay làm nhiệm vụ được nữa.', danger: true };
  switch (state.status) {
    case 'lobby': return [start];
    case 'running': return [{ op: 'pause', label: 'Tạm dừng', confirm: 'Tạm dừng? Đồng hồ các đội vẫn chạy, thời gian tạm dừng không được trừ.' }, end];
    case 'paused': return [{ op: 'resume', label: 'Tiếp tục', confirm: null }, end];
    default: return [];
  }
}

/** §13.1 "ô còn trống" shown before "Mở cuộc đua": blanks of the leg + teams without a start time. */
export function openBlanks(state: HostState): string[] {
  const out = (state.leg?.issues ?? []).filter((i) => i.level === 'blank').map((i) => `${i.where}: ${i.message}`);
  if (!state.leg) out.push('Chưa nạp chặng.');
  const noStart = state.teams.filter((t) => t.startAt === null).map((t) => t.name);
  if (noStart.length) out.push(`Chưa nhập giờ xuất phát: ${noStart.join(', ')}`);
  if (!state.teams.length) out.push('Chưa có đội nào.');
  return out;
}

/** Red banner lines (D9, D15, §13.1). */
export function warnings(state: HostState): string[] {
  const w: string[] = [];
  const online = state.teams.filter((t) => t.online).length;
  if (state.status === 'lobby' && online) w.push(`Cuộc đua chưa mở nhưng đã có ${online} đội trong game (các đội xem được mật thư 1 nhưng chưa mở được hộp).`);
  if (state.status === 'lobby' && state.teams.some((t) => t.startAt !== null)) w.push('Đã nhập giờ xuất phát khi cuộc đua chưa mở: đồng hồ các đội đang chạy.');
  const noStart = state.teams.filter((t) => t.startAt === null && (t.online || t.joinedAt !== null)).map((t) => t.name);
  if (noStart.length) w.push(`Chưa nhập giờ xuất phát (đồng hồ hiện --:--): ${noStart.join(', ')}.`);
  const errors = (state.leg?.issues ?? []).filter((i) => i.level === 'error');
  if (errors.length) w.push(`Chặng đang nạp có ${errors.length} lỗi: ${errors[0]!.where}: ${errors[0]!.message}`);
  return w;
}

/** host.legResult / leg.issues → lines (errors first), Vietnamese text from the server. */
export function legIssueLines(issues: LegIssueView[]): { level: LegIssueView['level']; text: string }[] {
  const rank = { error: 0, warning: 1, blank: 2 } as const;
  return [...issues].sort((a, b) => rank[a.level] - rank[b.level]).map((i) => ({ level: i.level, text: `${i.where}: ${i.message}` }));
}

export interface StartRow { id: string; name: string; colour: string; startOrder: string; joined: string; startAt: number | null; input: string; stepLabel: string; penalty: string }
/** One row of the "Giờ xuất phát" table; times read in the leg's zone (D15). */
export function startRows(state: HostState): StartRow[] {
  const tz = state.leg?.timezone ?? 'Asia/Ho_Chi_Minh';
  return teamRows(state).map((r) => ({
    id: r.id, name: r.name, colour: r.colour,
    startOrder: r.startOrder === null ? '—' : String(r.startOrder),
    joined: r.joinedAt === null ? '—' : fmtTimeOfDay(r.joinedAt, tz),
    startAt: r.startAt,
    input: r.startAt === null ? '' : msToInput(r.startAt, tz),
    stepLabel: r.stepLabel,
    penalty: r.penaltyMinutes ? `+${r.penaltyMinutes} phút` : '—',
  }));
}

export interface Cell { state: 'todo' | 'active' | 'done'; text: string; title: string }
export interface ProgressRow { team: string; name: string; colour: string; rank: string; cells: Cell[]; penalty: string; finish: string; official: string; gap: string }

/** SPEC §13.6 minimal matrix: rows = teams (ranked first), columns = steps. grey = not yet, yellow = at the step (elapsed there),
 *  green = done ("HH:mm:ss · mm:ss": when · how long the step took). `mode` 't' shows T+ on each team's own clock. */
export function progressTable(state: HostState, now: number, mode: 'real' | 't'): { head: { label: string; title: string }[]; rows: ProgressRow[] } {
  const leg = state.leg;
  const tz = leg?.timezone ?? 'Asia/Ho_Chi_Minh';
  const steps = leg?.steps ?? [];
  const rankOf = new Map(state.ranking.map((r) => [r.team, r]));
  const teams = [...state.teams].sort((a, b) => (rankOf.get(a.id)?.rank ?? 1e9) - (rankOf.get(b.id)?.rank ?? 1e9) || a.slot - b.slot);
  const head = steps.map((s) => ({ label: s.label, title: s.name }));
  const rows = teams.map((t) => {
    const when = (ms: number | null) => (ms === null ? '—' : mode === 't' && t.startAt !== null ? `T+${fmtDuration(ms - t.startAt)}` : fmtTimeOfDay(ms, tz));
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
        p?.branch && `Nhánh: ${p.branch}`,
      ].filter(Boolean).join('\n');
      const branch = p?.branch ? ` (${p.branch})` : '';
      if (doneAt !== null) return { state: 'done', text: `${when(doneAt)} · ${fmtMinSec(doneAt - (p?.openedAt ?? doneAt))}${branch}`, title };
      if (i === t.step && t.finishAt === null) return { state: 'active', text: `${p?.openedAt != null ? fmtMinSec(now - p.openedAt) : '…'}${branch}`, title };
      return { state: 'todo', text: '', title };
    });
    const r = rankOf.get(t.id);
    return {
      team: t.id, name: t.name, colour: t.colour,
      rank: r ? String(r.rank) : '—',
      cells,
      penalty: t.penaltyMinutes ? `+${t.penaltyMinutes} phút` : '—',
      finish: when(t.finishAt),
      official: r?.officialMs != null ? fmtDuration(r.officialMs) : '—',
      gap: r?.gapMs ? `+${fmtMinSec(r.gapMs)}` : '—',
    };
  });
  return { head, rows };
}

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

/** `/host.html?demo=1`: fake state for screenshots, no server (a running race with 4 teams, 6 steps, progress + ranking). */
export function demoState(now = 1_000_000): HostState {
  const pose = (x: number, z: number) => ({ x, y: 0, z, yaw: 0, mode: 'walk' as const, action: 'none' as const });
  const min = 60_000;
  type T = HostState['teams'][number];
  const team = (slot: number, name: string, colour: string, code: string, player: string, online: boolean, seenAgo: number | null, reconnects: number, p: ReturnType<typeof pose> | null, race: Partial<T> = {}, flagged = false): T =>
    ({ slot, id: `t${slot}`, name, colour, online, code, player, lastSeen: seenAgo === null ? null : now - seenAgo, reconnects, pose: p, flagged, startAt: null, startOrder: null, step: 0, finishAt: null, penaltyMinutes: 0, joinedAt: null, ...race });
  const pt = (lat: number, lon: number, r: number, name: string) => ({ ...(({ x, z }) => ({ x, z }))(latLonToWorld(lat, lon)), r, name });
  const s = (id: string, type: 'route_info' | 'detour' | 'challenge' | 'pit_stop', label: string, p: ReturnType<typeof pt>, branches?: ReturnType<typeof pt>[]) =>
    ({ id, type, label, name: p.name, x: p.x, z: p.z, r: p.r, ...(branches && { branches: branches.map((b, i) => ({ id: 'AB'[i]!, ...b })) }) });
  const t0 = now - 50 * min;
  const row = (team: string, step: string, o: number | null, a: number | null, c: number | null, branch: string | null = null) => ({ team, step, openedAt: o, arrivedAt: a, startedAt: c, completedAt: c, branch });
  return {
    t: 'host.state',
    serverMs: now,
    status: 'running',
    teams: [
      team(0, 'Đội Xanh', '#2c6bd8', 'K7M3QX', 'An', true, 0, 1, pose(120, -310), { startAt: t0, startOrder: 1, joinedAt: t0 + 2 * min, step: 5, finishAt: now - 4 * min }),
      team(1, 'Đội Đỏ', '#d8342c', 'W9HT4B', 'Bình', true, 0, 0, pose(-80, 40), { startAt: t0 + 8 * min, startOrder: 2, joinedAt: t0 + 9 * min, step: 3, penaltyMinutes: 2 }, true),
      team(2, 'Đội Vàng', '#e0b020', 'R2NZ8P', 'Chi', false, 95_000, 3, pose(400, -520), { startAt: t0 + 4 * min, startOrder: 3, joinedAt: t0 + 6 * min, step: 3 }),
      team(3, 'Đội Lục', '#2c9a4a', 'D5FY6E', '', false, null, 0, null),
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
    },
    progress: [
      row('t0', 'L1', t0, t0 + 14 * min, t0 + 15 * min), row('t0', 'T1', t0 + 15 * min, t0 + 19 * min, t0 + 23 * min), row('t0', 'L2', t0 + 23 * min, t0 + 31 * min, t0 + 32 * min),
      row('t0', 'D1', t0 + 32 * min, t0 + 33 * min, t0 + 40 * min, 'A'), row('t0', 'L3', t0 + 40 * min, t0 + 44 * min, t0 + 45 * min), row('t0', 'PS', t0 + 45 * min, t0 + 46 * min, t0 + 46 * min),
      row('t1', 'L1', t0 + 8 * min, t0 + 22 * min, t0 + 24 * min), row('t1', 'T1', t0 + 24 * min, t0 + 29 * min, t0 + 35 * min), row('t1', 'L2', t0 + 35 * min, t0 + 41 * min, t0 + 42 * min),
      { ...row('t1', 'D1', t0 + 42 * min, t0 + 43 * min, null), completedAt: null },
      row('t2', 'L1', t0 + 4 * min, t0 + 19 * min, t0 + 21 * min), row('t2', 'T1', t0 + 21 * min, t0 + 25 * min, t0 + 31 * min), row('t2', 'L2', t0 + 31 * min, t0 + 38 * min, t0 + 40 * min),
      { ...row('t2', 'D1', t0 + 40 * min, null, null), completedAt: null },
    ],
    ranking: [
      { team: 't0', rank: 1, stepIndex: 5, finishAt: now - 4 * min, officialMs: 46 * min, gapMs: 0 },
      { team: 't2', rank: 2, stepIndex: 3, finishAt: null, officialMs: null, gapMs: null },
      { team: 't1', rank: 3, stepIndex: 3, finishAt: null, officialMs: null, gapMs: null },
    ],
  };
}
