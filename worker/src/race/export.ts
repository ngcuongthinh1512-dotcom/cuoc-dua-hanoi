// SPEC §17.25 (Phase 10): the raw timing export of a race for the Host — teams × steps, teams, the `events` log — built
// from SQLite rows only (RaceRoom reads them: 0 rows written). Never an answer: no step_progress.answers text (typed
// answers), no host_note, nothing of the leg beyond step ids / labels / types and its lock minutes.
import type { Leg } from '@race/shared/leg';
import { emptyProgress, parseAnswers, type EventRow, type StepProgressRow } from '../db.ts';
import type { TeamRace } from './engine.ts';
import { retryLockMinutes, taskOf } from './steps.ts';
import { partsOf } from './tasks.ts';

export interface ExportTeam extends TeamRace {
  id: string;
  name: string;
}
type Row = Record<string, unknown>;
type Col = [key: string, header: string];

/** Vietnam has no DST: UTC+7 all year. */
const VN_MS = 7 * 3_600_000;
const iso = (t: number | null) => (t === null ? null : new Date(t).toISOString());
const vn = (t: number | null) => (t === null ? null : new Date(t + VN_MS).toISOString().slice(0, 19).replace('T', ' '));
/** Whole seconds (a decimal point / comma never meets a spreadsheet's locale). */
const secs = (t: number | null, base: number | null) => (t === null || base === null ? null : Math.round((t - base) / 1000));

/** The columns of one instant: epoch ms, ISO UTC, Vietnam time, s since the race was opened [, s since the step before]. */
const at = (k: string, header: string, prev = false): Col[] => [
  [k, `${header} (epoch ms)`], [`${k}Utc`, `${header} (ISO UTC)`], [`${k}Vn`, `${header} (giờ Việt Nam)`], [`${k}FromStart`, `${header} (giây từ lúc mở cuộc đua)`],
  ...(prev ? [[`${k}FromPrev`, `${header} (giây từ lúc xong bước trước)`] as Col] : []),
];
/** step_progress instants: export key, column, header. */
const TIMES = [['arrivedAt', 'arrived_at', 'Tới điểm'], ['openedAt', 'clue_opened_at', 'Mở hòm / nhận mật thư'], ['startedAt', 'task_started_at', 'Bắt đầu nhiệm vụ'], ['completedAt', 'completed_at', 'Hoàn thành']] as const;

export const STEP_COLS: Col[] = [
  ['team', 'Đội (id)'], ['teamName', 'Tên đội'], ['step', 'Mã bước'], ['label', 'Tên bước'], ['type', 'Loại bước'], ['branch', 'Nhánh'],
  ...TIMES.flatMap(([k, , h]) => at(k, h, true)),
  ['wrongAnswers', 'Số lần sai'], ['rejections', 'Số lần bị phạt'], ['lockedSeconds', 'Số giây bị khóa'], ['branchSwitches', 'Số lần đổi nhánh'], ['approvalWaitSeconds', 'Giây chờ Host duyệt'], ['penaltyScores', 'Số đúng mỗi lần phạt'],
];
export const TEAM_COLS: Col[] = [['team', 'Đội (id)'], ['name', 'Tên đội'], ['startOrder', 'Thứ tự vào game'], ...at('joinedAt', 'Vào game lần đầu'), ['rank', 'Hạng về đích'], ...at('finishAt', 'Về đích'), ['out', 'Bị loại'], ['finalRank', 'Hạng cuối (kể cả bị loại)']];
export const EVENT_COLS: Col[] = [['id', 'STT'], ...at('t', 'Thời điểm'), ['type', 'Loại'], ['team', 'Đội (id)'], ['teamName', 'Tên đội'], ['step', 'Bước'], ['data', 'Dữ liệu (JSON)']];

/** The three tables (JSON keys = STEP_COLS / TEAM_COLS / EVENT_COLS keys). Steps: those each team holds (≤ its current
 *  one), step 1 received at its first entry (SPEC §17.23), "since the step before" = since the previous step's completion
 *  (step 1: since that entry). `now` ends a lock still running. */
export function exportRace(leg: Leg, teams: ExportTeam[], rows: StepProgressRow[], events: EventRow[], now: number) {
  // a player's IP (the `login` event keeps it for the login limits) never leaves the server: timing only (Phase 10 integration)
  const evs = events.map((e) => { const { ip: _ip, ...d } = JSON.parse(e.data) as Row; return { ...e, d }; });
  const start = evs.find((e) => e.type === 'host.race' && e.d.op === 'start')?.t ?? null;
  const names = new Map(teams.map((t) => [t.id, t.name]));
  const stamp = (k: string, t: number | null, prev?: number | null): Row => ({ [k]: t, [`${k}Utc`]: iso(t), [`${k}Vn`]: vn(t), [`${k}FromStart`]: secs(t, start), ...(prev !== undefined ? { [`${k}FromPrev`]: secs(t, prev) } : {}) });
  /** s locked on step i: each "Phạt" (from its decision) and branch switch for its lock minutes,
   *  cut by the next lock (a switch replaces a "Phạt" countdown) and by the step's completion.
   *  ponytail: a branch switch an undo dropped still counts (its `switch` event stays); filter by branch_switches if it matters. */
  const locked = (team: string, i: number, row: StepProgressRow) => {
    const s = leg.steps[i]!;
    const ep: [number, number][] = [];
    for (const a of parseAnswers(row)) {
      const task = taskOf(s, a.b);
      if (task && a.s === 'penalized' && a.d !== undefined) ep.push([a.d, retryLockMinutes(leg, task)]);
    }
    for (const e of evs) if (e.type === 'switch' && e.team === team && e.d.step === s.id) ep.push([e.t, leg.penalties.branchSwitchLockMinutes]);
    ep.sort((a, b) => a[0] - b[0]);
    const end = row.completed_at ?? now;
    return Math.round(ep.reduce((sum, [from, min], k) => sum + Math.max(0, Math.min(from + min * 60_000, ep[k + 1]?.[0] ?? Infinity, end) - from), 0) / 1000);
  };
  const steps = teams.flatMap((t) => {
    const mine = new Map(rows.filter((r) => r.team === t.id).map((r) => [r.step, r]));
    return leg.steps.slice(0, Math.min(t.step, leg.steps.length - 1) + 1).flatMap((s, i): Row[] => {
      const got = mine.get(s.id);
      if (!got && (i > 0 || t.joinedAt === null)) return [];
      const row = i === 0 ? { ...(got ?? emptyProgress(t.id, s.id)), clue_opened_at: t.joinedAt } : got!;
      const prev = i === 0 ? t.joinedAt : (mine.get(leg.steps[i - 1]!.id)?.completed_at ?? null);
      return [{
        team: t.id, teamName: t.name, step: s.id, label: s.label, type: s.type, branch: row.branch,
        ...Object.assign({}, ...TIMES.map(([k, c]) => stamp(k, row[c], prev))),
        wrongAnswers: row.wrong_answers, rejections: row.rejections, lockedSeconds: locked(t.id, i, row), branchSwitches: row.branch_switches,
        approvalWaitSeconds: Math.round(row.approval_wait_seconds),
        // SPEC §17.31: the Host's "đúng x/n" of each Phạt in order ("2/4;3/4"), '' = none; (*) = the team was not told
        penaltyScores: parseAnswers(row).flatMap((a) => (a.s === 'penalized' && a.sc !== undefined ? [`${a.sc}/${partsOf(taskOf(s, a.b)!) ?? '?'}${a.sv ? '' : '*'}`] : [])).join(';'),
      }];
    });
  });
  return {
    exportedAt: now, raceStartAt: start,
    teams: teams.map((t): Row => ({ team: t.id, name: t.name, startOrder: t.startOrder, ...stamp('joinedAt', t.joinedAt), rank: t.finishAt === null ? null : t.rank, ...stamp('finishAt', t.finishAt), out: t.out, finalRank: t.rank })), // out at the Host's "Kết thúc": no finish rank
    steps,
    events: evs.map((e): Row => ({ id: e.id, ...stamp('t', e.t), type: e.type, team: e.team, teamName: e.team === null ? null : (names.get(e.team) ?? null), step: typeof e.d.step === 'string' ? e.d.step : null, data: e.d })),
  };
}

/** One CSV file (UTF-8 with a BOM for Excel, "," + CRLF, RFC 4180 quoting), the three tables one under the other, each with
 *  a title line and Vietnamese headers. A text cell starting like a formula gets a leading ' (CSV injection). */
export function exportCsv(x: ReturnType<typeof exportRace>): string {
  const cell = (v: unknown): string => {
    if (v === null || v === undefined) return '';
    if (typeof v === 'boolean') return v ? 'có' : 'không';
    const s = typeof v === 'object' ? JSON.stringify(v) : typeof v === 'string' && /^[=+\-@\t\r]/.test(v) ? `'${v}` : String(v);
    return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
  };
  const table = (title: string, cols: Col[], rows: Row[]) => [cell(title), cols.map(([, h]) => cell(h)).join(','), ...rows.map((r) => cols.map(([k]) => cell(r[k])).join(','))].join('\r\n');
  return `﻿${[table('Bảng 1 – Thời gian đội × bước', STEP_COLS, x.steps), table('Bảng 2 – Đội', TEAM_COLS, x.teams), table('Bảng 3 – Nhật ký sự kiện thô (bảng events)', EVENT_COLS, x.events)].join('\r\n\r\n')}\r\n`;
}

/** Host-only "Xuất đáp án": every answer each team sent (typed text, a picked seat, a box list "a | b | c"), oldest first, with its time
 *  (Vietnam), verdict and the Host's score. A separate file: the timing export never carries answer text. CSV, UTF-8 BOM + CRLF. */
export function answersCsv(leg: Leg, teams: { id: string; name: string }[], rows: StepProgressRow[]): string {
  const names = new Map(teams.map((t) => [t.id, t.name]));
  const labels = new Map(leg.steps.map((st) => [st.id, st.label]));
  const verdict: Record<string, string> = { pending: 'chờ duyệt', correct: 'đúng', approved: 'đúng (Host duyệt)', penalized: 'sai / bị phạt', rejected: 'bị từ chối' };
  const cell = (v: unknown): string => {
    const str = v === null || v === undefined ? '' : /^[=+\-@\t\r]/.test(String(v)) ? `'${v}` : String(v);
    return /[",\r\n]/.test(str) ? `"${str.replaceAll('"', '""')}"` : str;
  };
  const out = rows.flatMap((r) => parseAnswers(r).map((a) => ({ t: a.at, line: [names.get(r.team) ?? r.team, r.step, labels.get(r.step) ?? '', a.b ?? '', vn(a.at), a.text, verdict[a.s] ?? a.s, a.sc !== undefined ? a.sc : ''] })));
  out.sort((x, y) => x.t - y.t);
  return `\ufeff${[['Đội', 'Mã bước', 'Tên bước', 'Nhánh', 'Giờ gửi (giờ Việt Nam)', 'Đáp án', 'Kết quả', 'Điểm Host chấm'], ...out.map((o) => o.line)].map((l) => l.map(cell).join(',')).join('\r\n')}`;
}
