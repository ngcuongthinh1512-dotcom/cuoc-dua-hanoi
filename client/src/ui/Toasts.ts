// Phase 5 track C (docs/plans/phase5.md §6 C): the toast feed (STYLE_GUIDE: stacked just above the minimap), e.g.
// "Không đi xe trên bậc thang", "Xe này đã có đội sử dụng". The same text within toasts.repeatGap s is dropped. The DOM
// is created on first use (importing this module touches nothing: Player.ts imports it in Node tests).
import { hud, toasts as T } from '../config.ts';
import './menu.css';
import type { NoticeCode } from './types.ts';

/** The fixed game messages. */
export const NOTICES: Readonly<Record<NoticeCode, string>> = {
  bikeStairs: 'Không đi xe trên bậc thang', // SPEC §6.6
  bikeTooFast: 'Đi chậm lại rồi mới xuống xe được',
  bikeTooFar: 'Lại gần xe hơn để lấy xe',
  bikeTaken: 'Xe này đã có đội sử dụng', // SPEC §6.3
  respawn: 'Đã đưa bạn về chỗ an toàn',
  respawnStairs: 'Đã đưa bạn lên bậc kè gần nhất',
};

export interface Toast {
  text: string;
  /** s (clock of the caller) the line appeared. */
  at: number;
}

/** The feed once `text` arrives at `now` (s): lines older than toasts.seconds gone; a repeat of a line younger than
 *  toasts.repeatGap dropped, an older one moved to the end as new (never two same lines, review m7); at most toasts.max
 *  lines, the oldest go first. Pure: the DOM below only draws the result. */
export function nextFeed(feed: readonly Toast[], text: string, now: number): readonly Toast[] {
  const live = feed.filter((t) => now - t.at < T.seconds);
  if (live.some((t) => t.text === text && now - t.at < T.repeatGap)) return live;
  return [...live.filter((t) => t.text !== text), { text, at: now }].slice(-T.max);
}

let feed: readonly Toast[] = [];
let box: HTMLElement | undefined;
let timer: ReturnType<typeof setTimeout> | undefined;
const clock = () => performance.now() / 1000;

/** Draws the live lines. Each line fades by a CSS animation whose negative delay = its age, so redrawing keeps its phase. */
function draw() {
  const now = clock();
  feed = feed.filter((t) => now - t.at < T.seconds);
  box!.replaceChildren(
    ...feed.map((t) => {
      const line = document.createElement('div');
      line.className = 'hud-box toast';
      line.textContent = t.text;
      line.style.animation = `toast-life ${T.seconds}s linear ${t.at - now}s both`;
      return line;
    }),
  );
  clearTimeout(timer);
  if (feed.length) timer = setTimeout(draw, (feed[0]!.at + T.seconds - now) * 1000 + 20);
}

export function toast(text: string): void {
  const next = nextFeed(feed, text, clock());
  if (next.length === feed.length && next.at(-1) === feed.at(-1)) return; // a dropped repeat (every physics step at a stair, review m6)
  feed = next;
  if (typeof document === 'undefined') return; // Node tests
  if (!box) {
    // Bottom-left, the newest line nearest the minimap (menu.css #toasts: column, fade keyframes).
    box = Object.assign(document.createElement('div'), { id: 'toasts' });
    box.style.left = `${hud.margin}px`;
    box.style.bottom = `${hud.margin + hud.minimap.height + hud.gap}px`;
    box.setAttribute('aria-live', 'polite');
    document.body.append(box);
  }
  draw();
}

/** A fixed game message (its Vietnamese text lives here). */
export function notice(code: NoticeCode): void {
  toast(NOTICES[code]);
}
