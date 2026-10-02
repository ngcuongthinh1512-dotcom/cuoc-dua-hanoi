// Phase 8B (docs/plans/phase8b.md §G; SPEC §17.19 (b)): the public feed in a bottom corner (config `feed.corner`, default
// bottom-left, right of the minimap so it never covers it nor the toasts), GTA chat style: "14:05 · Đội X trả lời sai và bị
// phạt 3 phút[ · đúng 2/5]" / "Đội X đúng 5/5". Lines come from welcome.feed + `{t:'feed'}` (RaceClient → RaceHud.feed).
// Never takes the mouse (pointer-events none); fades after feed.seconds, a new line shows it again.
import type { FeedMessage, TeamInfo } from '@race/shared/protocol';
import { feed as F, hud } from '../config.ts';
import { fmtMin, formatTimeOfDay } from '../race/ui/format.ts';
import './menu.css';

/** The Vietnamese line of one feed message (team name from welcome.teams by slot). The count "x/5" only when the server sent it
 *  (a team's own 70-minute mark), so a wrong lock before it never says how close the team was. */
export function feedText(m: FeedMessage, teams: readonly TeamInfo[]): string {
  const name = teams.find((t) => t.slot === m.slot)?.name ?? `Đội ${m.slot}`;
  const count = m.n == null ? '' : `${m.n}/${m.of ?? 5}`;
  if (m.ok) return count ? `${name} đúng ${count}` : `${name} đã trả lời đúng`;
  return `${name} trả lời sai và bị phạt ${fmtMin(m.minutes ?? 0)} phút${count ? ` · đúng ${count}` : ''}`;
}

export interface FeedEntry { text: string; time: string; shownAt: number }

/** The lines on screen at `now` (s): younger than `seconds`, the newest `max`. Pure: the DOM below only draws the result. */
export const liveEntries = (all: readonly FeedEntry[], now: number, seconds: number, max: number): FeedEntry[] => all.filter((e) => now - e.shownAt < seconds).slice(-max);

const clock = () => performance.now() / 1000;

export class Feed {
  /** Every line received so far (welcome.feed first, oldest first). */
  readonly lines: FeedMessage[] = [];
  private entries: FeedEntry[] = [];
  private box: HTMLElement | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;

  /** New lines (welcome: the kept ones; then one per `{t:'feed'}`). ponytail: the welcome batch shows like new lines (its age is
   *  unknown on the client clock), fine at ≤ NET.feedKept lines, cut to feed.lines and fading with the rest. */
  push(ms: readonly FeedMessage[], teams: readonly TeamInfo[]): void {
    this.lines.push(...ms);
    const now = clock();
    this.entries.push(...ms.map((m) => ({ text: feedText(m, teams), time: formatTimeOfDay(m.at).slice(0, 5), shownAt: now })));
    this.entries = this.entries.slice(-F.lines * 2); // older than the box can ever show again
    if (typeof document !== 'undefined') this.draw();
  }

  private draw() {
    const now = clock();
    if (!this.box) {
      const b = (this.box = Object.assign(document.createElement('div'), { id: 'feed' }));
      const m = `${hud.margin}px`;
      b.style.bottom = `${hud.margin + F.bottomLift}px`;
      if (F.corner === 'bottom-left') b.style.left = `${hud.margin + hud.minimap.width + hud.gap}px`;
      else if (F.corner === 'bottom-right') (b.style.right = m), (b.style.bottom = `${hud.margin + hud.minimap.height}px`); // above the bottom-right street / clock / speed
      else (b.style.left = '50%'), (b.style.transform = 'translateX(-50%)'), (b.style.alignItems = 'center');
      b.setAttribute('aria-live', 'polite');
      document.body.append(b);
    }
    const live = liveEntries(this.entries, now, F.seconds, F.lines);
    this.box.replaceChildren(
      ...live.map((e) => {
        const line = document.createElement('div');
        line.className = 'hud-box feed-line';
        const t = Object.assign(document.createElement('span'), { className: 'feed-time', textContent: e.time });
        line.append(t, e.text);
        line.style.animation = `toast-life ${F.seconds}s linear ${e.shownAt - now}s both`; // a negative delay = its age: a redraw keeps the phase
        return line;
      }),
    );
    clearTimeout(this.timer);
    if (live.length) this.timer = setTimeout(() => this.draw(), (live[0]!.shownAt + F.seconds - now) * 1000 + 20);
  }
}
