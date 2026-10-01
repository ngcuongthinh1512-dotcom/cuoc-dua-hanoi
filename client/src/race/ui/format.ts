// Phase 7 track C: pure helpers of the race HUD (no DOM, tested in Node). Everything here works only from what the server
// sent (ClueCard / RaceView / ZoneMember): never answers, destination names or a later step.
import type { ClueCard, RaceView, StepType, TeamInfo, Transport, ZoneMember } from '@race/shared/protocol';
import { raceHud as C } from '../../config.ts';

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
  blocks: { branch: string | null; title: string; text: string; place: string | null; limit: string | null }[];
  active: boolean;
}

const limitText = (min: number | null) => (min ? `Thời hạn: ${min} phút` : null);

export function summarize(card: ClueCard): CardSummary {
  const blocks: CardSummary['blocks'] = [];
  if (card.task) {
    const t = card.task;
    blocks.push({ branch: null, title: t.title, text: t.description, place: t.place ?? null, limit: limitText(t.timeLimitMinutes) });
  }
  for (const b of card.branches ?? []) {
    const t = b.task;
    blocks.push({ branch: b.id, title: b.name, text: b.summary || t.description, place: t.place ?? null, limit: limitText(t.timeLimitMinutes) });
  }
  const clue = card.text || (card.type === 'pit_stop' ? 'Hãy về Chặng dừng và đứng trên thảm để về đích.' : '');
  return { type: card.type, label: card.label, clue, transport: transportLabel(card.transport), blocks, active: card.status === 'active' };
}

/** Whole-second duration: 125000 → "02:05", past an hour "1:02:05". */
export function formatDuration(ms: number): string {
  const t = Math.max(0, Math.floor(ms / 1000));
  const [h, m, s] = [Math.floor(t / 3600), Math.floor(t / 60) % 60, t % 60];
  return h ? `${h}:${pad2(m)}:${pad2(s)}` : `${pad2(m)}:${pad2(s)}`;
}

/** "01:42:15" (hours always 2 digits): the host NPC's sentence. */
export const formatHms = (ms: number) => {
  const t = Math.max(0, Math.floor(ms / 1000));
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
  const idx = cards.map((c) => c.status).lastIndexOf('active');
  const cur = idx >= 0 ? idx : cards.length - 1;
  const entry = (c: ClueCard, pinned: boolean): BookEntry => ({
    card: c,
    pinned,
    status: c.status === 'active' ? 'Đang làm' : 'Đã xong',
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
  return `Phạt chờ: còn ${formatDuration(v.checkinAt - serverNow + 999)} trước khi về đích`;
}

/** "Tại điểm này" lines, oldest arrival first: "Đội Xanh – đang làm Thử thách 2". */
export function zoneLines(members: readonly ZoneMember[], teams: readonly TeamInfo[]): string[] {
  return [...members]
    .sort((a, b) => a.since - b.since)
    .map((m) => `${teams.find((t) => t.slot === m.slot)?.name ?? `Đội ${m.slot}`} – đang làm ${m.label}`);
}
