// Phase 7 track C + Phase 8 track C (docs/plans/phase8.md D15): the race's DOM widgets, drawn only from what the server sent
// (RaceView / ClueCard / ZoneMember: never answers, never a later step):
//  - top-left mission card (SPEC §12: type icon + colour, label, clue summary, transport icon, one state line) + the full card
//    that opens when a new clue arrives (envelope animation, SPEC §8.3) or on Enter (keys.clueCard → openCurrent): media,
//    "Nhận thử thách", typed answer box + history, photo-task submission code, Lựa chọn kép buttons (D15);
//  - Sổ mật thư (Tab, SPEC §8.11): reloaded from the server on every open (actions.book → showBook), current card pinned,
//    read-only, never the answer history (SPEC §17.14);
//  - "Xuất phát ở vị trí thứ n" at the right for raceHud.startOrderSeconds of sim time, then fades (SPEC §17.12);
//  - "Bấm F để mở hòm mật thư" prompt, the centre countdown (Host "Phạt" / branch switch / Pit Stop wait), the host NPC's line
//    after the check-in, "Tại điểm này".
// What a card shows is the pure `cardPanel` (format.ts, tested in Node); this file only draws it.
// The module top level touches no DOM (Node tests import the pure parts from ./format.ts).
import { NET, type ClueCard, type CreditItem, type FeedMessage, type LouvreView, type RaceView, type TeamInfo, type TaskView, type ZoneMember } from '@race/shared/protocol';
import { Feed } from '../../ui/Feed.ts';
import { onCreditsRequest, openCredits, setCreditItems, setCreditsGate } from '../../ui/Credits.ts';
import { raceHud as C } from '../../config.ts';
import { bookEntries, type BookEntry, branchConfirmText, cardPanel, finishLine, hudKey, liveStatus, lockLine, type MediaItem, penaltyLine, type CardSummary, StartOrderBanner, statusLine, summarize, timerLine, TYPE_STYLE, zoneLines } from './format.ts';
import './race.css';

export interface RaceHudActions {
  /** The Sổ mật thư opened: ask the server for the cards (`race book`). */
  book(): void;
  // Phase 8 (docs/plans/phase8.md §5.3; RaceClient sends them)
  /** A typed answer ('' = "Tôi đã gửi bài – chờ Host duyệt" of a photo task). */
  answer(step: string, text: string): void;
  /** Choose / switch a detour branch (after the confirm that names the penalty). */
  branch(step: string, branch: string): void;
  /** "Nhận thử thách". */
  accept(step: string): void;
  /** An "r2:<name>" image → a blob URL (fetched with the team token), null = not there (not uploaded / not allowed / network).
   *  Absent = offline (no race): the placeholder says images load only in a race. */
  resolveMedia?(name: string): Promise<string | null>;
  /** Phase 8B: "Ghi nguồn" opened after the finish: ask for the louvre credits (op `credits`; the answer is `credits()` below). */
  credits?(): void;
}

export interface RaceHudFrame {
  /** s of sim clock (Player.simTime): banner timing / fades, deterministic screenshots. */
  simTime: number;
  /** ms, server clock estimate (NetClient.serverNow): the countdowns (checkinAt, card.lockedUntil) and the pending stopwatch. */
  serverNow: number;
  /** The body stands inside the current, unopened box's zone, on foot: show "Bấm F để mở hòm mật thư". */
  inZone: boolean;
  /** Phase 8B: the Louvre room's prompt (LouvreRoom.roomPrompt / "Bấm F để vào phòng Louvre"), shown instead of the box one. */
  prompt?: string | null;
}

const BOX_PROMPT = 'Bấm F để mở hòm mật thư';

const ICONS = {
  route: '<path d="M4 19c7 0 4-13 11-13h3M15 3l4 3-4 3"/>',
  fork: '<path d="M12 21v-7M12 14c0-5-6-4-6-10M12 14c0-5 6-4 6-10M3.5 6L6 3.5 8.5 6M15.5 6L18 3.5 20.5 6"/>',
  flag: '<path d="M6 21V4M6 5h12l-3.5 4 3.5 4H6"/>',
  finish: '<path d="M5 21V3M5 4h14v10H5M10 4v10M15 4v10M5 9h14"/>',
  bike: '<circle cx="5.5" cy="16" r="3.5"/><circle cx="18.5" cy="16" r="3.5"/><path d="M5.5 16l4-8h6l3 8M9.5 8L12 16M8 6h3"/>',
  walk: '<circle cx="13" cy="4.5" r="1.8"/><path d="M11 21l2-6-3-3 1-4 4 1 2 3M10 12l-3 1"/>',
};
const icon = (k: keyof typeof ICONS, size = 18) =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${ICONS[k]}</svg>`;

/** Create an element; text goes in as textContent (server strings are never parsed as HTML). */
function el(tag: string, cls = '', text?: string, ...kids: (Node | null)[]): HTMLElement {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  for (const k of kids) if (k) e.append(k);
  return e;
}
const html = (tag: string, cls: string, h: string) => Object.assign(el(tag, cls), { innerHTML: h });
const setText = (e: HTMLElement, s: string) => void (e.textContent !== s && (e.textContent = s));
/** A countdown / stopwatch line with its mm:ss in a bigger <b class="rc-num"> (visual#7); rebuilt only when the text changes. */
const setTime = (e: HTMLElement, s: string) => {
  if (e.dataset.t === s) return;
  e.dataset.t = s;
  e.replaceChildren(...s.split(/(\d+:\d{2}(?::\d{2})?)/).map((t, i) => (i % 2 ? el('b', 'rc-num', t) : t)));
};

const SEEN_KEY = 'race.lastCard';
const store = {
  get: () => {
    try {
      return localStorage.getItem(SEEN_KEY);
    } catch {
      return null;
    }
  },
  set: (v: string) => {
    try {
      localStorage.setItem(SEEN_KEY, v);
    } catch {
      /* private window / blocked storage: the card just pops up again after a reload */
    }
  },
};

// ArrowUp/Down = 1 line-ish step (0.2 panel height), PageUp/Down = 1 page, Home = back to the current clue (the pinned one on top).
const SCROLL: Record<string, number> = { ArrowUp: -0.2, ArrowDown: 0.2, PageUp: -0.9, PageDown: 0.9, Home: 0 };

export class RaceHud {
  private view: RaceView | null = null;
  private seenKey: string | null = null; // the last card shown full (also kept in localStorage: a reload does not replay it)
  private sim = 0;
  /** ms, server clock estimate of the last frame (+ clockOffset): countdowns, pending stopwatch, history times. */
  private now = Date.now();
  private clockOffset = 0; // DEV demo only: stand-in cards carry real-looking times while the offline clock stays at 0
  private demoTeam = ''; // DEV demo only: offline there is no team name for the submission code
  private readonly banner = new StartOrderBanner();
  private fullCard: ClueCard | null = null;
  private shown: string | null = null; // the live status the open full card was drawn with: a countdown running out redraws it
  private bookOpen = false;
  private bookWaiting = false;
  private wasOpen = false;
  private finishSince = -Infinity;
  // the open full card's controls (rebuilt with every redraw)
  private hot: { primary?: HTMLButtonElement; choose: HTMLButtonElement[] } = { choose: [] };
  private actionBtns: HTMLButtonElement[] = [];
  private answerInput: HTMLInputElement | null = null;
  private timerEl: HTMLElement | null = null;
  private draft = ''; // the unsent answer text; kept over redraws, closing and reopening the same step
  private draftStep = '';
  // The answer box takes the focus on a (re)draw: the team opened the card (Enter) or went into the box. A card that popped up
  // by itself never takes it (review R-10: a held W / the Space that closes cards would type into it); Esc leaves the box
  // (false: the next Esc closes the card).
  private focusBox = false;
  private resolver: (name: string) => Promise<string | null> = (n) => this.actions.resolveMedia?.(n) ?? Promise.resolve(null);
  private readonly urls = new Map<string, string>(); // r2 name → blob URL once fetched (a redraw must not flash the placeholder)
  private readonly fetching = new Map<string, Promise<string | null>>();
  // r2 names that came back null: a redraw shows the placeholder without asking again (e2e#1: 1 Worker + 1 DO request per
  // draw); forgotten when a card / the Sổ is opened (a new step, or Enter / Tab after the Host uploaded the missing image)
  private readonly failed = new Set<string>();

  private readonly tl = el('div', 'rc-tl');
  private readonly compact = el('div', 'rc-card hud-box');
  private readonly stateEl = el('div', 'rc-state');
  private readonly zonePanel = el('div', 'rc-zone hud-box');
  private readonly bannerEl = el('div', 'rc-banner hud-hand');
  private readonly penaltyEl = el('div', 'rc-penalty hud-box');
  private readonly promptEl = el('div', 'rc-prompt hud-box', BOX_PROMPT);
  private readonly npcEl = el('div', 'rc-npc hud-box');
  private readonly overlay = el('div', 'rc-overlay');
  private readonly zoomEl = html('div', 'rc-zoom', '<img alt="">');

  /** Phase 8 (critic B1): called whenever `open` flips (track B sets it: release / re-take the pointer lock). */
  onOpenChange?: (open: boolean) => void;

  /** `teamName`: the submission code "<team>-<step>[-<branch>]" (submitCode) on photo task cards. */
  constructor(readonly actions: RaceHudActions, readonly teamName = '') {
    this.compact.hidden = this.zonePanel.hidden = this.penaltyEl.hidden = this.promptEl.hidden = this.npcEl.hidden = this.overlay.hidden = this.zoomEl.hidden = true;
    this.tl.append(this.compact, this.zonePanel);
    document.body.append(this.tl, this.bannerEl, this.penaltyEl, this.promptEl, this.npcEl, this.overlay, this.zoomEl);
    this.zoomEl.addEventListener('click', () => this.zoom(null));
    onCreditsRequest(() => this.actions.credits?.());
    // A clicked button / link gives the focus back (review R-1): Space / Enter then reach the card keys below (Space closes,
    // never presses "Đổi lựa chọn kép" again after a declined confirm), and Tab is no key of the button's.
    this.overlay.addEventListener('click', (e) => (e.target as HTMLElement).closest<HTMLElement>('button, a[href]')?.blur());
    // Tab closes a card / the Sổ from anywhere (the answer box, a clicked button / link: core/Input.ts never sees those), right
    // here inside the key handler: onOpenChange → pointer lock is granted there (Firefox). Opening is main.ts ('clueBook').
    addEventListener('keydown', (e) => {
      if (!this.open) return;
      const typing = this.answerInput != null && e.target === this.answerInput; // the answer box keeps Space / digits / arrows
      if (e.code === 'Tab') return void (e.preventDefault(), !e.repeat && this.close());
      if (!this.zoomEl.hidden) return void (!e.repeat && (e.code === 'Escape' || e.code === 'Space' || e.code === 'Enter') && this.zoom(null)); // the big picture takes these keys
      if (e.target instanceof HTMLElement && e.target.matches('button, a[href]') && /^(Space|Enter|NumpadEnter)$/.test(e.code)) return; // a button / link still focused (mouse held down: a click blurs it) presses itself
      if (!typing && this.bookOpen && e.code in SCROLL) return this.scrollBook(SCROLL[e.code]!); // pointer lock sends wheel + mouse to the canvas: keys scroll the book
      if (e.repeat) return;
      const key = hudKey(e, typing, this.bookOpen);
      if (key === 'submit') this.submit();
      else if (key === 'blur') (this.focusBox = false), this.answerInput?.blur();
      else if (key === 'close') this.close();
      else if (key === 'primary') this.hot.primary ? this.hot.primary.click() : this.focusInput();
      else if (key) this.hot.choose[Number(key.slice(-1)) - 1]?.click();
    });
  }

  /** welcome.view / `race` message; a card not seen before opens as the full card, and so does the detour card once F opened
   *  the branch box (its task is on the card now: e2e#0, no other feedback for that F). */
  setView(view: RaceView | null): void {
    const was = this.view?.card;
    this.view = view;
    setCreditsGate(view != null && (view.finishAt != null || view.status === 'finished')); // §17.20: "Ghi nguồn" opens after the finish
    const card = view?.card ?? null;
    this.renderCompact(card);
    if (!card) return;
    if (this.fullCard && !this.bookOpen && card.step === this.fullCard.step) return this.refreshFull(card); // same step: the card changed state, redraw in place
    if (card.status === 'done') return;
    const key = `${card.step}@${card.receivedAt}`;
    const boxOpened = was?.step === card.step && !was.branchOpened && !!card.branchOpened;
    if (!boxOpened && (key === this.seenKey || (this.seenKey == null && key === store.get()))) return void (this.seenKey = key);
    this.seenKey = key;
    store.set(key);
    this.bookOpen = false;
    this.openFull(card);
  }

  /** `book` answer (the cards in order). */
  showBook(cards: readonly ClueCard[]): void {
    if (!this.bookWaiting) return; // closed again before the answer came back
    this.bookWaiting = false;
    this.renderBook(bookEntries(cards));
  }

  private scrollBook(dy: number) {
    const p = this.overlay.querySelector('.rc-book');
    if (p) dy === 0 ? (p.scrollTop = 0) : (p.scrollTop += dy * p.clientHeight);
  }

  /** Tab (main.ts): open (→ actions.book) / close. */
  toggleBook(): void {
    if (this.open) return this.close();
    this.bookOpen = this.bookWaiting = true;
    this.fullCard = null;
    this.failed.clear();
    this.renderBook(null);
    this.actions.book();
  }

  /** Phase 8: keys.clueCard (Enter) with nothing open → the current card in full again (answer history, input: focused). */
  openCurrent(): void {
    if (!this.open && this.view?.card) this.openFull(this.view.card, false, true);
  }

  /** The book or a full card is open: the body stops, keys go to the panel (main.ts modal()). */
  get open(): boolean {
    return this.bookOpen || this.fullCard != null;
  }

  /** SPEC §17.12: once, at the first entry (welcome.showStartOrder). */
  startOrder(n: number, simTime: number): void {
    this.banner.show(n, simTime);
    setText(this.bannerEl, this.banner.text);
  }

  /** SPEC §8.6: after the check-in, the host NPC's line (team name + official time when known). */
  finished(team: string, officialMs: number | null): void {
    setText(this.npcEl, finishLine(team, officialMs));
    this.finishSince = this.sim;
  }

  // Phase 8B (docs/plans/phase8b.md §G): the louvre room flag, the public feed, the "Ghi nguồn" answer.
  private inRoom = false;
  /** LouvreRoom.active (main.ts / track B): the louvre card says "Đang trong phòng" instead of "bấm F ở hòm để vào phòng". */
  setRoom(inside: boolean): void {
    if (inside === this.inRoom) return;
    this.inRoom = inside;
    if (this.fullCard && !this.bookOpen) this.renderFull(false);
  }
  private readonly feedBox = new Feed();
  /** welcome.feed (the kept lines) and each `{t:'feed'}` (RaceClient). */
  feed(ms: readonly FeedMessage[], teams: readonly TeamInfo[]): void {
    this.feedBox.push(ms, teams);
  }
  /** `{t:'credits'}` after the finish: the "Ghi nguồn" panel gets a "Phòng Louvre" section (ui/Credits.ts). */
  credits(items: readonly CreditItem[]): void {
    setCreditItems(items);
  }

  /** SPEC §7 "Tại điểm này" (`zone` message): the other teams here, named from welcome.teams. */
  zone(members: readonly ZoneMember[], teams: readonly TeamInfo[]): void {
    const lines = zoneLines(members, teams);
    this.zonePanel.replaceChildren(...(lines.length ? [el('div', 'rc-zone-title', 'Tại điểm này'), ...lines.map((l) => el('div', 'rc-zone-line', l))] : []));
    this.zonePanel.hidden = !lines.length;
  }

  update(f: RaceHudFrame): void {
    this.sim = f.simTime;
    this.now = f.serverNow + this.clockOffset;
    this.bannerEl.classList.toggle('on', this.banner.text !== '' && this.banner.visible(f.simTime));
    const lock = lockLine(this.view, this.now);
    const pen = lock ?? penaltyLine(this.view, this.now);
    this.penaltyEl.hidden = pen == null || (lock != null && this.timerEl != null); // the open card shows the same countdown (visual#7)
    if (pen) setTime(this.penaltyEl, pen);
    const prompt = f.prompt || (f.inZone ? BOX_PROMPT : '');
    this.promptEl.hidden = !prompt || this.open;
    if (prompt) setText(this.promptEl, prompt);
    this.npcEl.hidden = f.simTime - this.finishSince >= C.finishSeconds;
    const card = this.view?.card;
    if (!card) return;
    const st = statusLine(card, this.now);
    this.stateEl.hidden = !st;
    this.stateEl.dataset.k = st?.kind ?? '';
    setText(this.stateEl, st?.text ?? '');
    const full = this.fullCard;
    if (full && !this.bookOpen) {
      if (liveStatus(full, this.now) !== this.shown) this.renderFull(false); // a countdown ran out: the card flips (D9)
      else if (this.timerEl) setTime(this.timerEl, timerLine(full, this.now)?.text ?? '');
    }
  }

  /** DEV, offline only (p7-* / p8-* presets): stand-in data from the URL (?card=route|detour|challenge|pit|teaser|answer|
   *  answer-pending|answer-locked|detour-choose|detour-chosen|detour-locked|branch-task|proof|media|media-off, ?full, ?book[=media],
   *  ?lock=<s left of a countdown>, ?startOrder=n, ?finish, ?zone, ?checkin=<s of penalty wait left>). The clock / penalty
   *  row: ui/HUD.ts (?raceTime, ?penalty). */
  demo(q: URLSearchParams): void {
    const kind = q.get('card') ?? (q.has('full') || q.has('book') ? 'route' : null);
    if (kind) {
      this.clockOffset = this.now = DEMO_NOW; // the offline serverNow stays 0: every demo time is relative to this
      this.demoTeam = 'Đội Xanh';
      this.resolver = (n) => Promise.resolve(n === 'demo-off.jpg' ? null : DEMO_IMG);
      const base = DEMO_CARDS[kind] ?? DEMO_CARDS.route!;
      const lock = Number(q.get('lock') ?? NaN);
      const card = base.lockedUntil != null && Number.isFinite(lock) ? { ...base, lockedUntil: DEMO_NOW + lock * 1000 } : base;
      this.seenKey = q.has('full') ? '' : `${card.step}@${card.receivedAt}`; // no popup unless asked ('' = not seen: the localStorage mark of an earlier preset of the same run must not hide it)
      const wait = Number(q.get('checkin') ?? NaN);
      this.setView({ status: 'running', startAt: 0, finishAt: null, penaltyMinutes: Number(q.get('penalty') ?? 0), card, checkinAt: Number.isFinite(wait) ? wait * 1000 + DEMO_NOW : null, officialMs: null });
      if (q.has('book')) (this.bookWaiting = this.bookOpen = true), this.showBook(q.get('book') === 'media' ? DEMO_BOOK_MEDIA : DEMO_BOOK);
    }
    if (q.has('feed')) {
      const teams = DEMO_TEAMS;
      const n = Math.min(Number(q.get('feed')) || 3, DEMO_FEED.length);
      this.feed(DEMO_FEED.slice(0, n), teams);
    }
    if (q.get('credits') === 'louvre') {
      setCreditsGate(true);
      setCreditItems(DEMO_CREDITS);
      openCredits();
    }
    if (q.has('startOrder')) this.startOrder(Number(q.get('startOrder')) || 1, 0);
    if (q.has('finish')) this.finished('Đội Xanh', 6135000);
    if (q.has('zone')) {
      const teams = DEMO_TEAMS;
      this.zone(
        [
          { slot: 1, label: 'Thử thách 2', type: 'challenge', branch: null, since: 1 },
          { slot: 2, label: 'Lựa chọn kép', type: 'detour', branch: 'A', since: 2 },
        ],
        teams,
      );
    }
  }

  // ── rendering ──

  /** `open` may have flipped: tell main.ts (it frees / re-takes the pointer, critic B1). */
  private sync() {
    if (this.open === this.wasOpen) return;
    this.wasOpen = this.open;
    this.onOpenChange?.(this.open);
  }

  private resetControls() {
    this.hot = { choose: [] };
    this.actionBtns = [];
    this.answerInput = null;
    this.timerEl = null;
    this.shown = null;
  }

  private close() {
    this.bookOpen = this.bookWaiting = false;
    this.fullCard = null;
    this.overlay.hidden = true;
    this.resetControls();
    this.zoom(null);
    this.sync();
  }

  private renderCompact(card: ClueCard | null) {
    this.compact.hidden = !card;
    if (!card) return;
    const s = summarize(card);
    const st = TYPE_STYLE[card.type];
    this.compact.style.setProperty('--c', st.colour);
    const head = el('div', 'rc-head', undefined, html('span', 'rc-icon', icon(st.icon)), el('span', 'rc-label', s.label), s.transport && html('span', 'rc-transport', icon(s.transport.icon, 16)));
    if (s.transport) head.lastElementChild!.setAttribute('title', s.transport.text);
    this.compact.replaceChildren(head, el('div', 'rc-clue', s.clue || s.blocks[0]?.title || ''), this.stateEl, el('div', 'rc-hint', 'Enter: mở thẻ · Tab: Sổ mật thư'));
    this.compact.style.setProperty('--lines', String(C.clueLines));
    this.compact.style.width = `${C.cardWidth}px`;
  }

  /** `focus`: the team asked for it (Enter): the answer box takes the keys at once; a popup leaves them to the game. */
  private openFull(card: ClueCard, animate = true, focus = false) {
    if (this.draftStep !== card.step) (this.draft = ''), (this.draftStep = card.step);
    this.focusBox = focus;
    this.failed.clear();
    this.fullCard = card;
    this.renderFull(animate, false);
  }

  /** The same step's card changed (Host decision, countdown, our own answer): redraw, keeping draft / scroll / focus. */
  private refreshFull(card: ClueCard) {
    this.fullCard = card;
    this.renderFull(false);
  }

  /** `keepScroll`: a redraw of the same card; a card opened fresh starts at the top. */
  private renderFull(animate: boolean, keepScroll = true) {
    const card = this.fullCard!;
    const top = keepScroll ? (this.overlay.querySelector('.rc-full')?.scrollTop ?? 0) : 0;
    this.resetControls();
    const box = el('div', `rc-full${animate ? '' : ' quick'}`);
    box.style.width = `min(${C.fullWidth}px, 100%)`;
    const env = animate ? el('div', 'rc-env', undefined, el('div', 'rc-flap')) : null;
    env?.style.setProperty('--c', TYPE_STYLE[card.type].colour);
    box.append(this.detail(card, null), el('div', 'rc-actions', undefined, this.closeButton('Đóng (Tab)')));
    this.overlay.replaceChildren(...(env ? [env, box] : [box]));
    this.overlay.hidden = false;
    box.scrollTop = top;
    this.sync();
    if (this.focusBox) this.focusInput();
  }

  private focusInput() {
    this.focusBox = true;
    this.answerInput?.focus({ preventScroll: true });
  }

  private renderBook(entries: BookEntry[] | null) {
    this.resetControls();
    const panel = el('div', 'rc-book');
    panel.style.width = `min(${C.fullWidth}px, 100%)`;
    const toCurrent = el('button', 'rc-btn', 'Về mật thư hiện tại');
    toCurrent.addEventListener('click', () => void (panel.scrollTop = 0));
    panel.append(el('div', 'rc-book-head', undefined, el('h2', '', 'Sổ mật thư'), toCurrent, this.closeButton('Đóng (Tab)')));
    if (!entries) panel.append(el('div', 'rc-empty', 'Đang tải…'));
    else if (!entries.length) panel.append(el('div', 'rc-empty', 'Chưa có mật thư nào.'));
    else for (const e of entries) panel.append(this.detail(e.card, e));
    this.overlay.replaceChildren(panel);
    this.overlay.hidden = false;
    this.sync();
  }

  private closeButton(text: string) {
    const b = el('button', 'rc-btn', text);
    b.addEventListener('click', () => this.close());
    return b;
  }

  /** One clue in full: the popup (`entry` null, with controls) and every Sổ mật thư entry (read-only). */
  private detail(card: ClueCard, entry: BookEntry | null): HTMLElement {
    const s: CardSummary = summarize(card);
    const st = TYPE_STYLE[card.type];
    const p = cardPanel(card, { now: this.now, teamName: this.teamName || this.demoTeam, mode: entry ? 'book' : 'card', live: this.view?.status !== 'finished', inRoom: this.inRoom }); // finished: the Host ended the race, read-only (SPEC §8.10)
    if (!entry) this.shown = p.status;
    const root = el('section', `rc-detail${entry?.pinned ? ' pinned' : ''}`);
    root.style.setProperty('--c', st.colour);
    root.append(
      el('div', 'rc-head', undefined, html('span', 'rc-icon', icon(st.icon, 22)), el('span', 'rc-label', s.label), entry && el('span', `rc-status ${s.active ? 'active' : 'done'}`, entry.pinned && s.active ? 'Hiện tại · Đang làm' : entry.status)),
    );
    if (s.transport) {
      const t = html('div', 'rc-transport-line', icon(s.transport.icon, 16));
      t.append(el('span', '', s.transport.text));
      root.append(t);
    }
    if (p.clue) root.append(el('p', 'rc-text', p.clue));
    const media = this.mediaBox(p.media);
    if (media) root.append(media);
    const other: HTMLElement[] = []; // the branch not taken: dimmed, after the controls of the taken one, next to "Đổi lựa chọn kép"
    for (const b of p.blocks) {
      const dim = card.branch != null && b.branch != null && !b.chosen;
      const blk = el('div', `rc-task${dim ? ' dim' : ''}`, undefined, el('div', 'rc-task-title', b.title, b.chosen ? el('span', 'rc-chosen', 'Đội đã chọn') : null), b.text ? el('div', 'rc-task-text', b.text) : null, b.place ? el('div', 'rc-task-meta', `Địa điểm: ${b.place}`) : null, b.limit ? el('div', 'rc-task-meta', b.limit) : null, this.mediaBox(b.media));
      const n = p.choose.indexOf(b.branch ?? '');
      if (n >= 0) this.hot.choose[n] = this.act(`Chọn nhánh ${b.title} [${n + 1}]`, () => this.actions.branch(card.step, b.branch!), blk);
      if (dim) other.push(blk);
      else root.append(blk);
    }
    if (p.louvreInfo) root.append(el('div', `rc-louvre ${p.louvreInfo.state}`, undefined, el('div', 'rc-louvre-state', p.louvreInfo.text), ...p.louvreInfo.lines.map((l) => el('div', 'rc-louvre-line', l))));
    if (p.note) root.append(el('div', 'rc-timer info', p.note)); // the step's main instruction: framed like the countdown (visual#5)
    if (p.line) {
      root.append((this.timerEl = el('div', `rc-timer ${p.line.kind}`)));
      setTime(this.timerEl, p.line.text);
    }
    if (p.accept) root.append((this.hot.primary = this.act('Nhận thử thách [Enter]', () => ((this.focusBox = true), this.actions.accept(card.step))))); // asked for the task: its answer box takes the keys
    if (p.answerBox) root.append(this.answerRow(card));
    if (p.proof) root.append(this.proofBox(card, p.proof));
    if (p.history.length) {
      root.append(el('div', 'rc-history', undefined, el('div', 'rc-hist-title', 'Câu trả lời của đội'), ...p.history.map((l) => el('div', `rc-ans ${l.status}`, undefined, el('span', 'rc-ans-time', l.time), el('span', 'rc-ans-text', l.text), el('span', 'rc-ans-state', l.label)))));
    }
    root.append(...other);
    for (const o of p.switchTo) {
      root.append(this.act(p.switchTo.length > 1 ? `Đổi sang nhánh ${o.name}` : 'Đổi lựa chọn kép', () => confirm(branchConfirmText(card, o.id)) && void this.actions.branch(card.step, o.id), undefined, 'rc-switch'));
    }
    if (entry) {
      const meta = [`Nhận lúc ${entry.received}`, entry.completed && `Xong lúc ${entry.completed}`, entry.duration && `Thời gian làm: ${entry.duration}`].filter(Boolean).join(' · ');
      root.append(el('div', 'rc-meta', meta));
    }
    return root;
  }

  /** A button that asks the server for something: disabled raceHud.taskLockSeconds after a click (the answer comes back as a new
   *  `race` view or a notice: no double sends). `fn` returns false = nothing was sent (a declined confirm). With `into` it is
   *  appended there. */
  private act(text: string, fn: () => unknown, into?: HTMLElement, cls = 'rc-task-btn'): HTMLButtonElement {
    const btn = el('button', `rc-btn ${cls}`, text) as HTMLButtonElement;
    btn.addEventListener('click', () => {
      if (btn.disabled || fn() === false) return;
      const all = this.actionBtns;
      for (const b of all) b.disabled = true;
      setTimeout(() => all.forEach((b) => (b.disabled = false)), C.taskLockSeconds * 1000);
    });
    this.actionBtns.push(btn);
    into?.append(btn);
    return btn;
  }

  /** The typed answer: Enter sends (not while an IME composes: hudKey), Esc leaves the box. The text survives redraws. */
  private answerRow(card: ClueCard): HTMLElement {
    const input = Object.assign(document.createElement('input'), { type: 'text', className: 'rc-input', maxLength: NET.answerMax, placeholder: 'Nhập câu trả lời…', autocomplete: 'off', spellcheck: false, enterKeyHint: 'send', value: this.draft });
    input.setAttribute('aria-label', 'Câu trả lời');
    input.addEventListener('input', () => (this.draft = input.value));
    input.addEventListener('focus', () => (this.focusBox = true)); // clicked into: a redraw keeps the box focused
    this.answerInput = input;
    return el('div', 'rc-answer', undefined, input, this.act('Gửi câu trả lời [Enter]', () => this.submit(card)));
  }

  /** false = nothing to send. */
  private submit(card = this.fullCard): false | void {
    const text = this.answerInput?.value.trim();
    if (!card || !text) return false;
    this.actions.answer(card.step, text);
    this.draft = this.answerInput!.value = '';
  }

  /** Photo task (kind free): instruction, the submission code to paste next to the photo, "Tôi đã gửi bài" (only when `actions`).
   *  No Messenger button: teams open Messenger outside the game (SPEC §17.17). */
  private proofBox(card: ClueCard, p: NonNullable<ReturnType<typeof cardPanel>['proof']>): HTMLElement {
    const copy = el('button', 'rc-btn rc-copy', 'Copy');
    copy.addEventListener('click', () => {
      const done = () => (setText(copy, 'Đã chép'), void setTimeout(() => setText(copy, 'Copy'), 1500));
      navigator.clipboard?.writeText(p.code).then(done, () => {});
    });
    const box = el('div', 'rc-proof', undefined, p.instruction ? el('div', 'rc-task-text', p.instruction) : null, el('div', 'rc-code-row', undefined, el('span', 'rc-code-label', 'Mã bài nộp (gửi kèm ảnh):'), el('code', 'rc-code', p.code), copy));
    if (p.actions) box.append(el('div', 'rc-proof-btns', undefined, this.act('Tôi đã gửi bài – chờ Host duyệt', () => this.actions.answer(card.step, ''))));
    return box;
  }

  // ── media: R2 images through actions.resolveMedia (blob URL, team token), https links open a new tab ──

  private mediaBox(items: readonly MediaItem[]): HTMLElement | null {
    if (!items.length) return null;
    const box = el('div', 'rc-media');
    box.style.setProperty('--media-h', `${C.mediaMaxHeight}px`);
    for (const m of items) {
      if (m.kind === 'link') {
        box.append(Object.assign(el('a', 'rc-link', `${m.label} ↗`), { href: m.href, target: '_blank', rel: 'noopener noreferrer' }));
        continue;
      }
      const img = Object.assign(document.createElement('img'), { alt: m.label || 'Hình mật thư', hidden: true });
      const ph = el('div', 'rc-ph', 'Đang tải hình…');
      box.append(el('figure', 'rc-fig', undefined, ph, img, m.label ? el('figcaption', '', m.label) : null)); // first: a cached image's show() removes ph at once
      const show = (url: string | null) => {
        if (!url) return void (ph.textContent = this.actions.resolveMedia ? 'Hình chưa có – báo Host' : 'Hình chỉ tải được trong cuộc đua'); // in a race: not uploaded (or no network)
        img.src = url;
        img.hidden = false;
        ph.remove();
      };
      const have = this.urls.get(m.name);
      if (have || this.failed.has(m.name)) show(have ?? null);
      else void this.image(m.name).then(show);
      img.addEventListener('click', () => this.zoom(img.src));
    }
    return box;
  }

  private image(name: string): Promise<string | null> {
    let p = this.fetching.get(name);
    if (!p) {
      p = this.resolver(name).catch(() => null);
      this.fetching.set(name, p);
      void p.then((u) => (u ? this.urls.set(name, u) : (this.fetching.delete(name), this.failed.add(name)))); // a failure may succeed after the next open
    }
    return p;
  }

  /** The full-screen picture (click or any of Esc / Space / Enter closes it); null closes. */
  private zoom(src: string | null) {
    this.zoomEl.hidden = src == null;
    if (src) {
      (this.zoomEl.firstElementChild as HTMLImageElement).src = src;
      this.answerInput?.blur();
    }
  }
}

// ── DEV stand-ins (p7-* / p8-* presets): invented UI text, not leg content ──
const T0 = Date.UTC(2026, 9, 1, 9, 0, 0);
const DEMO_NOW = T0 + 1_800_000; // the clock of every demo card (RaceHud.clockOffset)
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="320" viewBox="0 0 480 320"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4a6fa5"/><stop offset="1" stop-color="#e8b923"/></linearGradient></defs><rect width="480" height="320" fill="url(#g)"/><circle cx="370" cy="84" r="36" fill="#fff" opacity=".8"/><path d="M0 262L120 150 220 232 320 128 480 272V320H0Z" fill="#1d2b3a" opacity=".78"/></svg>';
const DEMO_IMG = `data:image/svg+xml,${encodeURIComponent(SVG)}`;
const task: TaskView = { title: 'Thử thách minh họa', description: 'Mô tả nhiệm vụ minh họa dành cho ảnh chụp giao diện.', media: [], kind: 'answer', verification: 'auto', input: 'text', proofInstruction: '', timeLimitMinutes: 20 };
const textTask: TaskView = { ...task, description: 'Câu đố minh họa: hãy gõ câu trả lời của đội vào ô bên dưới rồi bấm gửi.', verification: 'host_approval' };
const proofTask: TaskView = { ...task, title: 'Nhiệm vụ gửi ảnh', description: 'Chụp một bức ảnh cả đội cùng làm động tác minh họa.', kind: 'free', verification: 'host_approval', input: 'proof', proofInstruction: 'Mở Messenger (ngoài trò chơi), gửi ảnh cho Host kèm mã bài nộp bên dưới.' };
const MEDIA_SET = [
  { url: 'r2:demo-anh.jpg', label: 'Ảnh gợi ý', kind: 'image' as const },
  { url: 'https://example.org/trang-lien-quan', label: 'Trang liên quan', kind: 'link' as const },
  { url: 'https://www.example.org/khong-nhan', label: '', kind: 'link' as const },
];
const A = (id: number, text: string, status: ClueCard['answers'][number]['status'], agoS: number) => ({ id, text, status, at: DEMO_NOW - agoS * 1000 });
/** Phase 8 card fields every stand-in shares (no media, no countdown, no answers yet). */
const NEW = { media: [], lockedUntil: null, lockKind: null, answers: [] } satisfies Partial<ClueCard>;
const branches = (taskA?: TaskView, taskB?: TaskView) => [
  { id: 'A', name: 'Tính', summary: 'Một phép tính nhanh gọn, trả lời ngay trong game.', ...(taskA ? { task: taskA } : {}) },
  { id: 'B', name: 'Ảnh', summary: 'Chụp ảnh gửi cho Host, làm ở một nơi khác.', ...(taskB ? { task: taskB } : {}) },
];
const detour = { ...NEW, step: 'D2', type: 'detour', label: 'Lựa chọn kép', text: 'Hai con đường, một phải chọn. Hãy chọn nhánh hợp với đội.', receivedAt: T0, completedAt: null, switchPenaltyMinutes: 10, retryPenaltyMinutes: 3 } satisfies Partial<ClueCard>;
const DEMO_CARDS: Record<string, ClueCard> = {
  route: { ...NEW, step: 'D1', type: 'route_info', label: 'Lộ trình 1', text: 'Nội dung mật thư minh họa: hãy đi tới nơi có thể nhìn thấy ngọn tháp cao nhất thành phố rồi tìm hòm mật thư ở chân nó.', transport: { allowed: 'any' }, status: 'active', receivedAt: T0, completedAt: null },
  walk: { ...NEW, step: 'D1', type: 'route_info', label: 'Lộ trình 2', text: 'Mật thư minh họa, lộ trình bắt buộc đi bộ.', transport: { mandatory: 'walk' }, status: 'active', receivedAt: T0, completedAt: null },
  detour: { ...detour, status: 'choose', branch: null, branches: branches() }, // p7-card-detour (compact card)
  challenge: { ...NEW, step: 'T1', type: 'challenge', label: 'Thử thách 1', text: 'Gợi ý minh họa: hãy quan sát kỹ xung quanh.', status: 'active', receivedAt: T0, completedAt: null, task: { ...task, place: 'Sân minh họa' } },
  pit: { ...NEW, step: 'P', type: 'pit_stop', label: 'Chặng dừng', text: '', status: 'active', receivedAt: T0, completedAt: null },
  teaser: { ...NEW, step: 'T1', type: 'challenge', label: 'Thử thách 1', text: 'Gợi ý minh họa: hãy quan sát kỹ xung quanh trước khi nhận đề.', status: 'teaser', retryPenaltyMinutes: 3, receivedAt: T0, completedAt: null },
  answer: { ...NEW, step: 'T1', type: 'challenge', label: 'Thử thách 1', text: 'Gợi ý minh họa: hãy quan sát kỹ xung quanh.', status: 'active', retryPenaltyMinutes: 3, task: { ...textTask, place: 'Sân minh họa' }, answers: [A(1, 'đáp án thử một', 'penalized', 540), A(2, 'đáp án thử hai', 'penalized', 200)], receivedAt: T0, completedAt: null },
  'answer-pending': { ...NEW, step: 'T1', type: 'challenge', label: 'Thử thách 1', text: 'Gợi ý minh họa: hãy quan sát kỹ xung quanh.', status: 'pending', retryPenaltyMinutes: 3, task: { ...textTask, place: 'Sân minh họa' }, answers: [A(1, 'đáp án thử một', 'penalized', 540), A(2, 'đáp án thử hai', 'pending', 72)], receivedAt: T0, completedAt: null },
  'answer-locked': { ...NEW, step: 'T1', type: 'challenge', label: 'Thử thách 1', text: 'Gợi ý minh họa: hãy quan sát kỹ xung quanh.', status: 'locked', retryPenaltyMinutes: 3, task: { ...textTask, place: 'Sân minh họa' }, answers: [A(1, 'đáp án thử một', 'penalized', 20)], lockedUntil: DEMO_NOW + 160_000, lockKind: 'retry', receivedAt: T0, completedAt: null },
  'detour-choose': { ...detour, status: 'choose', branch: null, branches: branches(), switches: 0 },
  'detour-chosen': { ...detour, status: 'goToBranch', branch: 'A', branchOpened: false, branches: branches(), switches: 1 },
  'detour-locked': { ...detour, status: 'switchLocked', branch: 'B', branchOpened: false, branches: branches(), switches: 1, lockedUntil: DEMO_NOW + 540_000, lockKind: 'switch' },
  'branch-task': { ...detour, status: 'active', branch: 'A', branchOpened: true, branches: branches({ ...textTask, title: 'Phép tính minh họa', description: 'Hãy tính tổng số tầng của công trình trước mặt rồi gõ kết quả.', place: 'Chân tháp minh họa' }), switches: 0, answers: [A(1, 'đáp án thử một', 'penalized', 130)] },
  proof: { ...detour, status: 'active', branch: 'B', branchOpened: true, branches: branches(undefined, proofTask), switches: 1 },
  media: { ...NEW, step: 'L1', type: 'route_info', label: 'Lộ trình 1', text: 'Mật thư minh họa kèm hình và liên kết: xem ảnh rồi đi tới nơi trong ảnh.', transport: { allowed: 'any' }, media: MEDIA_SET, status: 'active', receivedAt: T0, completedAt: null },
  // p8-media-offline: the demo resolver has no demo-off.jpg (offline: "Hình chỉ tải được trong cuộc đua")
  'media-off': { ...NEW, step: 'L1', type: 'route_info', label: 'Lộ trình 1', text: 'Mật thư minh họa kèm hình: ngoài cuộc đua hình không tải được.', transport: { allowed: 'any' }, media: [{ url: 'r2:demo-off.jpg', label: 'Ảnh gợi ý', kind: 'image' }], status: 'active', receivedAt: T0, completedAt: null },
};
// Phase 8B stand-ins (neutral art-NN ids; no real artwork names anywhere in the repo)
const DEMO_TEAMS: TeamInfo[] = ['Xanh', 'Đỏ', 'Vàng'].map((n, i) => ({ slot: i + 1, id: `t${i}`, name: `Đội ${n}`, colour: '#fff', online: true }));
const DEMO_FEED: FeedMessage[] = [
  { t: 'feed', at: T0, slot: 1, ok: false, minutes: 3 },
  { t: 'feed', at: T0 + 60_000, slot: 2, ok: false, minutes: 3, n: 2, of: 5 },
  { t: 'feed', at: T0 + 120_000, slot: 3, ok: true, n: 5, of: 5 },
];
const DEMO_CREDITS: CreditItem[] = [
  { file: 'art-03.webp', title: 'Tác phẩm minh họa 03', artist: 'Nghệ sĩ minh họa', photo: 'Ảnh: người chụp minh họa', license: 'CC BY-SA 4.0', source: 'https://example.org/art-03' },
  { file: 'art-17.glb', title: 'Tác phẩm minh họa 17', artist: 'Nghệ sĩ minh họa', photo: 'Bản quét: người quét minh họa', license: 'CC BY-NC-SA 4.0', source: 'https://example.org/art-17' },
  { file: 'art-21.webp', title: 'Tác phẩm minh họa 21', artist: 'Nghệ sĩ minh họa', photo: 'Ảnh: người chụp minh họa', license: 'Public domain', source: 'https://example.org/art-21' },
];
const DEMO_LOUVRE: LouvreView = {
  artworks: Array.from({ length: 23 }, (_, i) => ({ id: `art-${String(i + 1).padStart(2, '0')}`, type: i < 15 ? ('painting' as const) : ('sculpture' as const), image: '' })),
  room: { x: 0, z: 0, r: 25, yaw: 0 },
  picks: ['art-03', 'art-08', 'art-12'],
  attempts: 2,
  hintAt: [DEMO_NOW - 600_000, DEMO_NOW - 60_000],
  hintCount: 5,
  hintCorrect: 2,
  maxPicks: 5,
};
const louvreTask: TaskView = { ...task, title: 'Phòng tác phẩm', description: 'Chọn các tác phẩm theo gợi ý rồi bấm nút chốt trong phòng.', kind: 'louvre', verification: 'auto', input: 'room', place: 'Sân minh họa', louvre: DEMO_LOUVRE };
DEMO_CARDS.louvre = { ...NEW, step: 'T3', type: 'challenge', label: 'Thử thách 3', text: 'Gợi ý minh họa: hãy vào phòng và chọn các tác phẩm.', status: 'active', retryPenaltyMinutes: 3, task: louvreTask, answers: [A(1, '4 tác phẩm', 'penalized', 420), A(2, '5 tác phẩm', 'penalized', 130)].map((a, i) => ({ ...a, correct: i === 0 ? 1 : 2 })), receivedAt: T0, completedAt: null };
DEMO_CARDS['louvre-locked'] = { ...DEMO_CARDS.louvre, status: 'locked', lockedUntil: DEMO_NOW + 150_000, lockKind: 'retry', task: { ...louvreTask, louvre: { ...DEMO_LOUVRE, hintAt: [DEMO_NOW - 600_000, DEMO_NOW + 600_000], hintCorrect: null, attempts: 1 } }, answers: [{ ...A(1, '5 tác phẩm', 'penalized', 30) }] };
const DEMO_BOOK: ClueCard[] = [
  { ...DEMO_CARDS.route!, label: 'Lộ trình 1', status: 'done', receivedAt: T0, completedAt: T0 + 1_240_000 },
  { ...DEMO_CARDS.challenge!, status: 'done', receivedAt: T0 + 1_240_000, completedAt: T0 + 2_100_000 },
  { ...DEMO_CARDS.detour!, receivedAt: T0 + 2_100_000 },
];
/** p8-book-media: images and links in route / challenge / chosen-branch entries, a photo task pinned with its submission code. */
const DEMO_BOOK_MEDIA: ClueCard[] = [
  { ...DEMO_CARDS.media!, status: 'done', receivedAt: T0, completedAt: T0 + 1_240_000 },
  { ...DEMO_CARDS.challenge!, status: 'done', answers: [A(1, 'đáp án đã gửi', 'approved', 2000)], task: { ...task, media: [MEDIA_SET[0]!] }, receivedAt: T0 + 1_240_000, completedAt: T0 + 2_100_000 },
  { ...DEMO_CARDS.proof!, receivedAt: T0 + 2_100_000, media: [MEDIA_SET[1]!] },
];
