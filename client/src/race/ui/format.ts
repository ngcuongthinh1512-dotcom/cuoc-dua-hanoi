// Phase 7 track C: pure helpers of the race HUD (no DOM, tested in Node). Everything here works only from what the server
// sent (ClueCard / RaceView / ZoneMember): never answers, destination names or a later step.
import { LOUVRE } from '@race/shared';
import { type AnswerStatus, type CardStatus, type ClueCard, type LouvreView, MEDIA, type MediaView, NET, type RaceView, type StepType, submitCode, type TeamInfo, type Transport, type ZoneMember } from '@race/shared/protocol';
import { raceClient, raceHud as C } from '../../config.ts';
import { looksLikeIme } from '../../core/Input.ts';

const pad2 = (n: number) => String(n).padStart(2, '0');

/** Colour + icon key + short name per step type (SPEC §12, D22: route yellow, detour blue, challenge red-orange, Pit Stop green). */
export const TYPE_STYLE: Record<StepType, { colour: string; icon: 'route' | 'fork' | 'flag' | 'finish'; name: string }> = {
  route_info: { colour: C.colours.route_info, icon: 'route', name: 'Lộ trình' },
  detour: { colour: C.colours.detour, icon: 'fork', name: 'Lựa chọn kép' },
  challenge: { colour: C.colours.challenge, icon: 'flag', name: 'Thử thách' },
  pit_stop: { colour: C.colours.pit_stop, icon: 'finish', name: 'Chặng dừng' },
};

/** SPEC §6.5 vehicle rule of a route clue; null = not a route (no icon). */
export function transportLabel(t: Transport | undefined): { icon: 'bike' | 'walk'; text: string } | null {
  if (!t) return null;
  return 'mandatory' in t ? { icon: 'walk', text: 'Bắt buộc đi bộ' } : { icon: 'bike', text: 'Được đi xe đạp' };
}

/** A card boiled down for display: the clue text, the vehicle rule and one block per task (challenge: 1, detour: one per branch). */
export interface CardSummary {
  type: StepType;
  label: string;
  clue: string;
  transport: ReturnType<typeof transportLabel>;
  blocks: { branch: string | null; title: string; text: string; place: string | null; limit: string | null; chosen: boolean; media: MediaItem[] }[];
  active: boolean;
}

const limitText = (min: number | null) => (min ? `Thời hạn: ${min} phút` : null);

export function summarize(card: ClueCard): CardSummary {
  const blocks: CardSummary['blocks'] = [];
  if (card.task) {
    const t = card.task;
    blocks.push({ branch: null, title: t.title, text: t.description, place: t.place ?? null, limit: limitText(t.timeLimitMinutes), chosen: false, media: mediaViews(t.media) });
  }
  for (const b of card.branches ?? []) {
    const t = b.task; // Phase 8: only the chosen branch's, once its box is opened (its description replaces the summary)
    const chosen = b.id === card.branch;
    blocks.push({ branch: b.id, title: b.name, text: chosen && t ? t.description : b.summary || (t?.description ?? ''), place: t?.place ?? null, limit: limitText(t?.timeLimitMinutes ?? null), chosen, media: mediaViews(t?.media) });
  }
  const clue = card.text || (card.type === 'pit_stop' ? 'Hãy về Chặng dừng và đứng trên thảm để về đích.' : '');
  return { type: card.type, label: card.label, clue, transport: transportLabel(card.transport), blocks, active: card.status !== 'done' }; // Phase 8: every state but done is "Đang làm"
}

/** Duration rounded to the second like the Host page (hostView fmtDuration / fmtMinSec): 125000 → "02:05", past an hour "1:02:05". */
export function formatDuration(ms: number): string {
  const t = Math.max(0, Math.round(ms / 1000));
  const [h, m, s] = [Math.floor(t / 3600), Math.floor(t / 60) % 60, t % 60];
  return h ? `${h}:${pad2(m)}:${pad2(s)}` : `${pad2(m)}:${pad2(s)}`;
}

/** "01:42:15" (hours always 2 digits): the host NPC's sentence. Rounded to the second like the Host table
 *  (host/hostView.ts fmtDuration) and the stopped HUD clock (RaceClient.raceClock): the team and the Host read one time. */
export const formatHms = (ms: number) => {
  const t = Math.max(0, Math.round(ms / 1000));
  return `${pad2(Math.floor(t / 3600))}:${pad2(Math.floor(t / 60) % 60)}:${pad2(t % 60)}`;
};

/** Time of day on the viewer's clock, "14:05:09". ponytail: browser time zone (players are in the leg's city), no leg timezone on the client. */
export const formatTimeOfDay = (ms: number) => {
  const d = new Date(ms);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
};

export interface BookEntry {
  card: ClueCard;
  pinned: boolean;
  /** "Đang làm" / "Đã xong". */
  status: string;
  received: string;
  completed: string | null;
  /** Time spent on the step (completed − received), null while active. */
  duration: string | null;
}

/** SPEC §8.11: the current card (the active one, else the newest) pinned first, then the others in the order received.
 *  Never shows a step number, a locked slot or the total. */
export function bookEntries(cards: readonly ClueCard[]): BookEntry[] {
  const idx = cards.map((c) => c.status !== 'done').lastIndexOf(true);
  const cur = idx >= 0 ? idx : cards.length - 1;
  const entry = (c: ClueCard, pinned: boolean): BookEntry => ({
    card: c,
    pinned,
    status: c.status !== 'done' ? 'Đang làm' : 'Đã xong',
    received: formatTimeOfDay(c.receivedAt),
    completed: c.completedAt == null ? null : formatTimeOfDay(c.completedAt),
    duration: c.completedAt == null ? null : formatDuration(c.completedAt - c.receivedAt),
  });
  const rest = cards.filter((_, i) => i !== cur).map((c) => entry(c, false));
  return cur >= 0 ? [entry(cards[cur]!, true), ...rest] : rest;
}

/** "Xuất phát ở vị trí thứ n": shown once (the first entry only, D16) for raceHud.startOrderSeconds of sim time, then it fades. */
export class StartOrderBanner {
  text = '';
  private since = Infinity;
  private used = false;

  show(n: number, simTime: number) {
    if (this.used) return;
    this.used = true;
    this.text = `Xuất phát ở vị trí thứ ${n}`;
    this.since = simTime;
  }

  visible(simTime: number) {
    return this.used && simTime - this.since < C.startOrderSeconds;
  }
}

/** The host NPC's line at the Pit Stop (D10: no "đội thứ n", the ranking is announced by the Host). */
export const finishLine = (team: string, officialMs: number | null) =>
  `${team}, các bạn đã về đích!${officialMs == null ? '' : ` Thời gian: ${formatHms(officialMs)}.`} Thứ hạng chính thức sẽ được Host công bố.`;

/** Penalty wait at the Pit Stop (SPEC §8.6): "Còn 02:14 phút phạt…" until RaceView.checkinAt, null when nothing to wait for. */
export function penaltyLine(v: RaceView | null, serverNow: number): string | null {
  if (!v || v.finishAt != null || v.checkinAt == null || serverNow >= v.checkinAt) return null;
  return `Phạt chờ: còn ${formatDuration(Math.ceil((v.checkinAt - serverNow) / 1000) * 1000)} trước khi về đích`; // a countdown: up
}

/** "Tại điểm này" lines, oldest arrival first: "Đội Xanh – đang làm Thử thách 2". */
export function zoneLines(members: readonly ZoneMember[], teams: readonly TeamInfo[]): string[] {
  return [...members]
    .sort((a, b) => a.since - b.since)
    .map((m) => `${teams.find((t) => t.slot === m.slot)?.name ?? `Đội ${m.slot}`} – đang làm ${m.label}`);
}

// ── Phase 8 (docs/plans/phase8.md D15): the challenge / Lựa chọn kép card. A pure view model: RaceHud only draws it. ──

/** Minutes as people write them: 3 → "3", 0.1 → "0,1". */
export const fmtMin = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',');

/** The state the screen shows at `now` (ms, server clock estimate): a countdown that ran out flips the card by itself,
 *  raceClient.lockEndSlackMs late, the same moment the pose is re-sent (D9: a client clock a second early would send `answer` into answerLocked). */
export function liveStatus(card: ClueCard, now: number): CardStatus {
  if (card.lockedUntil == null || now < card.lockedUntil + raceClient.lockEndSlackMs) return card.status;
  return card.status === 'locked' ? 'active' : card.status === 'switchLocked' ? 'goToBranch' : card.status;
}

/** ms left of the card's countdown (the Host's "Phạt" or a branch switch), null = none running. */
export function lockLeft(card: ClueCard, now: number): number | null {
  const lock = card.status === 'locked' || card.status === 'switchLocked';
  return lock && card.lockedUntil != null && liveStatus(card, now) === card.status ? Math.max(0, card.lockedUntil - now) : null;
}

const branchName = (card: ClueCard, id: string | null | undefined) => card.branches?.find((b) => b.id === id)?.name ?? '';
const countDown = (ms: number) => formatDuration(Math.ceil(ms / 1000) * 1000); // a countdown rounds up
const countUp = (ms: number) => formatDuration(Math.floor(Math.max(0, ms) / 1000) * 1000); // a stopwatch rounds down

/** The big countdown (screen centre via penaltyEl, and on the card): the Host's "Phạt" or a branch switch. */
function lockText(c: ClueCard, now: number): string | null {
  const left = lockLeft(c, now);
  if (left == null) return null;
  return c.lockKind === 'switch' ? `Đổi lựa chọn kép: còn ${countDown(left)} · hòm nhánh ${branchName(c, c.branch)} hiện khi hết giờ` : `Phạt: còn ${countDown(left)} trước khi trả lời lại`;
}
export const lockLine = (v: RaceView | null, now: number): string | null => (!v?.card || v.finishAt != null || v.status === 'finished' ? null : lockText(v.card, now));

/** "Đang chờ Host duyệt · 01:12": counts up from the pending answer's send time. null unless the card is pending. */
export function pendingLine(card: ClueCard, now: number): string | null {
  if (card.status !== 'pending') return null;
  const at = card.answers.filter((a) => a.status === 'pending').at(-1)?.at;
  return `Đang chờ Host duyệt${at == null ? '' : ` · ${countUp(now - at)}`}`;
}

/** The open full card's pending stopwatch / countdown line (RaceHud.update redraws its text every frame). */
export function timerLine(card: ClueCard, now: number): { kind: 'wait' | 'lock'; text: string } | null {
  const lock = lockText(card, now);
  const wait = pendingLine(card, now);
  return lock ? { kind: 'lock', text: lock } : wait ? { kind: 'wait', text: wait } : null;
}

/** One short state line of the top-left card: waiting for the Host / countdown / which branch. */
export function statusLine(card: ClueCard, now: number): { kind: 'wait' | 'lock' | 'info'; text: string } | null {
  const left = lockLeft(card, now);
  if (left != null) return { kind: 'lock', text: card.lockKind === 'switch' ? `Đổi nhánh: còn ${countDown(left)}` : `Phạt: còn ${countDown(left)}` };
  const wait = pendingLine(card, now);
  if (wait) return { kind: 'wait', text: wait.replace('Đang chờ', 'Chờ') };
  return liveStatus(card, now) === 'goToBranch' ? { kind: 'info', text: `Nhánh ${branchName(card, card.branch)} · tới hòm nhánh` } : null;
}

/** "Đổi lựa chọn kép" confirm: names the penalty and what is lost (SPEC §17.16). */
export const branchConfirmText = (card: ClueCard, to: string) =>
  `Đổi sang nhánh ${branchName(card, to)}? Đội bị phạt ${fmtMin(card.switchPenaltyMinutes ?? 0)} phút (đếm ngược trên màn hình), mất tiến độ nhánh ${branchName(card, card.branch)}, hòm nhánh ${branchName(card, to)} chỉ hiện khi hết đếm ngược.`;

const ANSWER_LABEL: Record<AnswerStatus, string> = { pending: 'Chờ Host duyệt', approved: 'Đã duyệt', penalized: 'Bị phạt', wrong: 'Chưa đúng', correct: 'Đúng' };
export interface AnswerLine {
  time: string;
  text: string;
  status: AnswerStatus;
  label: string;
}
/** The team's answers on the card, newest first, at most NET.answerHistory: "14:05:09 · «…» · Bị phạt 3 phút". The minutes are
 *  the card's (a test leg may say 0,1): never hard-coded. */
export function answerLines(card: ClueCard): AnswerLine[] {
  const pen = card.retryPenaltyMinutes;
  const lv = (card.task ?? card.branches?.find((b) => b.id === card.branch)?.task)?.louvre; // Phase 8B: a lock "5 tác phẩm", "· đúng c/5" only from the 70-minute mark (AnswerView.correct)
  return card.answers
    .slice(-NET.answerHistory)
    .reverse()
    .map((a) => {
      const base = a.status === 'penalized' && pen ? `Bị phạt ${fmtMin(pen)} phút` : lv && a.status === 'wrong' && pen ? `Chưa đúng · phạt ${fmtMin(pen)} phút` : ANSWER_LABEL[a.status];
      return { time: formatTimeOfDay(a.at), text: a.text === '' ? 'đã gửi bài' : lv ? a.text : `«${a.text}»`, status: a.status, label: lv && a.correct != null ? `${base} · đúng ${a.correct}/${louvreOf(lv)}` : base };
    });
}

/** The "of" of x/5: 5 once the first hint is out, else the room's own limit (LOUVRE.maxPicks, SPEC §17.19). */
const louvreOf = (lv: LouvreView) => lv.maxPicks ?? lv.hintCount ?? LOUVRE.maxPicks;

/** The louvre card's lines (Phase 8B, SPEC §17.19), from the card alone: where the team is, how many lights are on, the two
 *  hints. Another team's state never reaches the card, so "Đúng x/5" is only ever the team's own live count. `inRoom` is the
 *  client's (LouvreRoom.active), not the server's. */
export interface LouvreInfo {
  state: 'outside' | 'inside' | 'locked' | 'done';
  /** The state line ("Chưa vào phòng – bấm F ở hòm để vào phòng"). */
  text: string;
  /** Detail lines in order: picks, wrong locks, hint 40, hint 70. */
  lines: string[];
}
export function louvreInfo(card: ClueCard, lv: LouvreView, o: { now: number; inRoom?: boolean }): LouvreInfo {
  const status = liveStatus(card, o.now);
  const state = status === 'done' ? 'done' : status === 'locked' ? 'locked' : o.inRoom ? 'inside' : 'outside';
  const text = { done: 'Đã xong thử thách', locked: 'Chốt sai – đang bị phạt, lựa chọn vẫn giữ (bấm / bỏ được, chốt lại khi hết đếm ngược)', inside: 'Đang trong phòng – bấm F ở nút để bật / tắt tác phẩm hoặc để chốt', outside: 'Chưa vào phòng – bấm F ở hòm để vào phòng' }[state];
  const of = louvreOf(lv);
  const k = lv.picks.length;
  const lines = [`Đang chọn ${k}${lv.maxPicks != null ? `/${of}` : ''} tác phẩm`];
  if (lv.attempts > 0) lines.push(`Chốt sai: ${lv.attempts} lần`);
  if (lv.hintCount != null) lines.push(`Đáp án bao gồm ${lv.hintCount} tác phẩm`);
  if (lv.hintCorrect != null) lines.push(k === 0 ? `Đúng 0/${of} (chưa chọn tác phẩm nào)` : `Đúng ${lv.hintCorrect}/${of}`);
  return { state, text, lines };
}

/** A clue / task attachment: an R2 image (fetched with the team token) or an https link (new tab, never embedded). */
export type MediaItem = { kind: 'image'; name: string; label: string } | { kind: 'link'; href: string; label: string };
const HTTP = /^https?:\/\/\S+$/i;
const hostOf = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, '');
  } catch {
    return u;
  }
};
/** `r2:<name>` → image, `https://…` → link labelled with its host when it has no label; anything else is dropped (it is a click target). */
export function mediaViews(items: readonly MediaView[] | undefined): MediaItem[] {
  return (items ?? []).flatMap((m): MediaItem[] => {
    if (m.url.startsWith(MEDIA.prefix)) {
      const name = m.url.slice(MEDIA.prefix.length);
      return MEDIA.name.test(name) ? [{ kind: 'image', name, label: m.label }] : [];
    }
    return HTTP.test(m.url) ? [{ kind: 'link', href: m.url, label: m.label || hostOf(m.url) }] : [];
  });
}

/** What a full card (popup / Sổ entry) shows and which controls it has, from the card alone. mode 'book' = a Sổ mật thư entry:
 *  read-only, no timers, never the answer history (SPEC §17.14: only on the challenge card); `live` false = the Host ended the race. */
export interface CardPanel {
  status: CardStatus;
  clue: string;
  media: MediaItem[];
  blocks: CardSummary['blocks'];
  /** Detour: "Đang làm nhánh Tính – tới hòm nhánh để nhận đề bài · Đã đổi nhánh 1 lần". */
  note: string | null;
  /** The pending stopwatch / countdown line (ticks in RaceHud.update). */
  line: { kind: 'wait' | 'lock'; text: string } | null;
  /** "Nhận thử thách". */
  accept: boolean;
  /** Branch ids that get a "Chọn nhánh" button. */
  choose: string[];
  /** The typed-answer box + "Gửi câu trả lời". */
  answerBox: boolean;
  /** Photo task: instruction + submission code (also pending / locked and in the Sổ) + "Tôi đã gửi bài" when `actions`. No
   *  Messenger button: teams open Messenger outside the game (SPEC §17.17). */
  proof: { instruction: string; code: string; actions: boolean } | null;
  /** "Đổi lựa chọn kép": the other branches (none while pending, in choose / switchLocked, or read-only). */
  switchTo: { id: string; name: string }[];
  history: AnswerLine[];
  /** Phase 8B: a louvre card (no input box: TaskView.input 'room'). */
  louvre: LouvreView | null;
  /** The louvre card's state + lines (louvreInfo); null on any other card, and in the Sổ mật thư (no live numbers there). */
  louvreInfo: LouvreInfo | null;
}

export function cardPanel(card: ClueCard, o: { now: number; teamName: string; mode: 'card' | 'book'; live?: boolean; inRoom?: boolean }): CardPanel {
  const s = summarize(card);
  const status = liveStatus(card, o.now);
  const book = o.mode === 'book';
  const act = !book && o.live !== false && status !== 'done';
  const chosen = card.branches?.find((b) => b.id === card.branch);
  const task = card.task ?? chosen?.task;
  const proofTask = task?.input === 'proof' && (status === 'active' || status === 'pending' || status === 'locked') ? task : null;
  const switches = card.switches ?? 0;
  const note = [status === 'goToBranch' && chosen && `Đang làm nhánh ${chosen.name} – tới hòm nhánh để nhận đề bài`, switches > 0 && `Đã đổi nhánh ${switches} lần`].filter(Boolean).join(' · ');
  return {
    status,
    clue: s.clue,
    media: mediaViews(card.media),
    blocks: s.blocks,
    note: note || null,
    line: book ? null : timerLine(card, o.now),
    accept: act && status === 'teaser',
    choose: act && status === 'choose' ? (card.branches ?? []).map((b) => b.id) : [],
    answerBox: act && status === 'active' && task?.input === 'text',
    proof: proofTask && {
      instruction: proofTask.proofInstruction,
      code: submitCode(o.teamName, card.step, card.branch),
      actions: act && status === 'active',
    },
    switchTo: act && chosen && (status === 'goToBranch' || status === 'active' || status === 'locked') ? (card.branches ?? []).filter((b) => b.id !== chosen.id).map((b) => ({ id: b.id, name: b.name })) : [],
    history: book ? [] : answerLines(card),
    louvre: task?.louvre ?? null,
    louvreInfo: !book && task?.louvre ? louvreInfo(card, task.louvre, o) : null,
  };
}

export type HudKey = 'submit' | 'blur' | 'close' | 'primary' | 'choose1' | 'choose2';
/** What a key does on an open card / Sổ. `typing` = the focus is in the answer box: it keeps Space / digits (Esc only leaves
 *  the box, the next Esc closes the card) and Enter submits unless an IME (Telex / Unikey) is still composing. */
export function hudKey(e: KeyboardEvent, typing: boolean, bookOpen: boolean): HudKey | null {
  const enter = e.code === 'Enter' || e.code === 'NumpadEnter';
  if (typing) return looksLikeIme(e) ? null : enter ? 'submit' : e.code === 'Escape' ? 'blur' : null;
  if (e.code === 'Escape' || (e.code === 'Space' && !bookOpen)) return 'close';
  if (enter) return 'primary';
  const n = /^(?:Digit|Numpad)([12])$/.exec(e.code)?.[1];
  return n ? (`choose${n}` as HudKey) : null;
}
