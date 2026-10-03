// Phase 5 track C (docs/plans/phase5.md §6 C): the toast feed (STYLE_GUIDE: stacked just above the minimap), e.g.
// "Không đi xe trên bậc thang", "Xe này đã có đội sử dụng". The same text within toasts.repeatGap s is dropped. The DOM
// is created on first use (importing this module touches nothing: Player.ts imports it in Node tests).
import { hud, toasts as T } from '../config.ts';
import { fmtMin } from '../race/ui/format.ts';
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
  // Phase 6: the server's `notice` (SPEC §6.3–6.5)
  bikeLost: 'Chậm một bước! Xe đã có người lấy.',
  bikeGone: 'Xe của bạn đã biến mất vì bị bỏ lại quá xa',
  bikeParked: 'Xe của bạn đã được để ở bãi xe cạnh điểm. Trong lúc bạn làm thử thách, đội khác có thể lấy mất!',
  walkOnly: 'Lộ trình này bắt buộc đi bộ',
  // Phase 7: race ops (SPEC §8)
  raceNotOpen: 'Cuộc đua chưa bắt đầu, hãy chờ Host',
  racePaused: 'Cuộc đua đang tạm dừng',
  raceOver: 'Cuộc đua của đội bạn đã kết thúc: không lấy xe, mở hòm hay làm nhiệm vụ được nữa', // also a bike claim refused 'finished'
  boxFar: 'Hãy vào gần hòm mật thư hơn',
  boxRiding: 'Xuống xe trước đã: không mở hòm, làm nhiệm vụ hay check-in khi đang ngồi xe', // SPEC §6.3, D4
  boxOpened: 'Hòm mật thư này đã mở rồi',
  taskFar: 'Hãy tới đúng nơi làm nhiệm vụ',
  clueNew: 'Mật thư mới đã vào Sổ mật thư', // SPEC §8.9
  penaltyWait: 'Hãy chờ cạnh thảm cho hết phút phạt', // SPEC §8.6
  // Phase 8: tasks typed in game, Host review, Lựa chọn kép (docs/plans/phase8.md D15)
  answerSent: 'Đã gửi câu trả lời, chờ Host duyệt',
  answerWrong: 'Chưa đúng, hãy thử lại!',
  answerPending: 'Câu trả lời trước đang chờ Host duyệt',
  answerLocked: 'Đang bị phạt, chờ hết đếm ngược rồi trả lời lại',
  approved: 'Host đã duyệt! Mật thư mới đã vào Sổ mật thư.', // one toast, no clueNew with it (critic M8)
  penalized: 'Host chưa duyệt: chờ hết đếm ngược rồi trả lời lại',
  branchChosen: 'Đã chọn nhánh. Hòm của nhánh hiện khi tới gần',
  branchSwitched: 'Đã đổi lựa chọn kép: hòm nhánh kia hiện khi hết đếm ngược',
  branchPending: 'Không đổi nhánh khi đang chờ Host duyệt',
  taskNotStarted: 'Bấm "Nhận thử thách" trước',
  // Phase 8B: phòng Louvre (docs/plans/phase8b.md §G; lockWrong with the card's minutes: lockWrongText below)
  lockWrong: 'Chưa đúng! Bị phạt – lựa chọn vẫn giữ, bấm / bỏ được, chốt lại khi hết đếm ngược',
  pickLimit: 'Chỉ được chọn tối đa 5 tác phẩm – bỏ một tác phẩm trước',
  creditsLocked: 'Bảng Ghi nguồn mở sau khi về đích',
  // Phase 10 (V2, docs/plans/phase10.md §3.1): the Host undid its Duyệt / Phạt within 10 s
  reviewUndone: 'Host đã rút lại quyết định vừa rồi. Thẻ mật thư trở lại như trước.',
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

/** `lockWrong` worded with the card's penalty minutes (card.retryPenaltyMinutes; a test leg may say 0,1). 0 / unknown → the fixed text. */
export const lockWrongText = (minutes: number | undefined): string =>
  minutes ? `Chưa đúng! Bị phạt ${fmtMin(minutes)} phút – lựa chọn vẫn giữ, bấm / bỏ được, chốt lại khi hết đếm ngược` : NOTICES.lockWrong;

/** A fixed game message (its Vietnamese text lives here). */
export function notice(code: NoticeCode): void {
  toast(NOTICES[code]);
}
