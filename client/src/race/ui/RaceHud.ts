// Phase 7 track C (docs/plans/phase7.md §5.3, §6 C): the race's DOM widgets, drawn only from what the server sent
// (RaceView / ClueCard / ZoneMember: never answers, never a later step):
//  - top-left mission card (SPEC §12: type icon + colour, label, clue summary, transport icon) + the full card that
//    opens when a new clue arrives (envelope animation, SPEC §8.3; Phase 7 task button "Hoàn thành (tạm)" → actions.task);
//  - Sổ mật thư (Tab, SPEC §8.11): reloaded from the server on every open (actions.book → showBook), current card pinned;
//  - "Xuất phát ở vị trí thứ n" at the right for raceHud.startOrderSeconds of sim time, then fades (SPEC §17.12);
//  - "Bấm F để mở hộp mật thư" prompt, Pit Stop penalty countdown, the host NPC's line after the check-in, "Tại điểm này".
// The module top level touches no DOM (Node tests import the pure parts from ./format.ts).
import type { ClueCard, RaceView, TaskView, TeamInfo, ZoneMember } from '@race/shared/protocol';
import { raceHud as C } from '../../config.ts';
import { bookEntries, type BookEntry, finishLine, penaltyLine, type CardSummary, StartOrderBanner, summarize, TYPE_STYLE, zoneLines } from './format.ts';
import './race.css';

export interface RaceHudActions {
  /** Phase 7 stub task: the team says it did the task (`race task`; detour: the branch). */
  task(step: string, branch?: string): void;
  /** The Sổ mật thư opened: ask the server for the cards (`race book`). */
  book(): void;
}

export interface RaceHudFrame {
  /** s of sim clock (Player.simTime): banner timing / fades, deterministic screenshots. */
  simTime: number;
  /** ms, server clock estimate (NetClient.serverNow): the penalty countdown (RaceView.checkinAt). */
  serverNow: number;
  /** The body stands inside the current, unopened box's zone, on foot: show "Bấm F để mở hộp mật thư". */
  inZone: boolean;
}

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

interface TaskButton {
  btn: HTMLButtonElement;
  step: string;
  branch: string | undefined;
}

// ArrowUp/Down = 1 line-ish step (0.2 panel height), PageUp/Down = 1 page, Home = back to the current clue (the pinned one on top).
const SCROLL: Record<string, number> = { ArrowUp: -0.2, ArrowDown: 0.2, PageUp: -0.9, PageDown: 0.9, Home: 0 };

export class RaceHud {
  private view: RaceView | null = null;
  private seenKey: string | null = null; // the last card shown full (also kept in localStorage: a reload does not replay it)
  private sim = 0;
  private readonly banner = new StartOrderBanner();
  private fullCard: ClueCard | null = null;
  private bookOpen = false;
  private bookWaiting = false;
  private taskButtons: TaskButton[] = [];
  private finishSince = -Infinity;

  private readonly tl = el('div', 'rc-tl');
  private readonly compact = el('div', 'rc-card hud-box');
  private readonly zonePanel = el('div', 'rc-zone hud-box');
  private readonly bannerEl = el('div', 'rc-banner hud-hand');
  private readonly penaltyEl = el('div', 'rc-penalty hud-box');
  private readonly promptEl = el('div', 'rc-prompt hud-box', 'Bấm F để mở hộp mật thư');
  private readonly npcEl = el('div', 'rc-npc hud-box');
  private readonly overlay = el('div', 'rc-overlay');

  constructor(readonly actions: RaceHudActions) {
    this.compact.hidden = this.zonePanel.hidden = this.penaltyEl.hidden = this.promptEl.hidden = this.npcEl.hidden = this.overlay.hidden = true;
    this.tl.append(this.compact, this.zonePanel);
    document.body.append(this.tl, this.bannerEl, this.penaltyEl, this.promptEl, this.npcEl, this.overlay);
    // Tab moves the browser focus: keep it on the page. The toggle itself is main.ts (input 'clueBook' → toggleBook).
    addEventListener('keydown', (e) => {
      if (!this.open) return;
      if (e.code === 'Tab') e.preventDefault();
      else if (this.bookOpen && SCROLL[e.code]) this.scrollBook(SCROLL[e.code]!); // pointer lock sends wheel + mouse to the canvas: keys scroll the book
      else if (e.repeat) return;
      else if (e.code === 'Escape' || (e.code === 'Space' && !this.bookOpen)) this.close();
      else if (e.code === 'Enter' && this.taskButtons.length === 1) this.taskButtons[0]!.btn.click();
      else if (/^(Digit|Numpad)[12]$/.test(e.code)) this.taskButtons[Number(e.code.slice(-1)) - 1]?.btn.click();
    });
  }

  /** welcome.view / `race` message; a card not seen before opens as the full card. */
  setView(view: RaceView | null): void {
    this.view = view;
    const card = view?.card ?? null;
    this.renderCompact(card);
    if (!card || card.status !== 'active') return;
    const key = `${card.step}@${card.receivedAt}`;
    if (key === this.seenKey || (this.seenKey == null && key === store.get())) return void (this.seenKey = key);
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
    this.renderBook(null);
    this.actions.book();
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

  /** SPEC §7 "Tại điểm này" (`zone` message): the other teams here, named from welcome.teams. */
  zone(members: readonly ZoneMember[], teams: readonly TeamInfo[]): void {
    const lines = zoneLines(members, teams);
    this.zonePanel.replaceChildren(...(lines.length ? [el('div', 'rc-zone-title', 'Tại điểm này'), ...lines.map((l) => el('div', 'rc-zone-line', l))] : []));
    this.zonePanel.hidden = !lines.length;
  }

  update(f: RaceHudFrame): void {
    this.sim = f.simTime;
    this.bannerEl.classList.toggle('on', this.banner.text !== '' && this.banner.visible(f.simTime));
    const pen = penaltyLine(this.view, f.serverNow);
    this.penaltyEl.hidden = pen == null;
    if (pen) setText(this.penaltyEl, pen);
    this.promptEl.hidden = !f.inZone || this.open;
    this.npcEl.hidden = f.simTime - this.finishSince >= C.finishSeconds;
  }

  /** DEV, offline only (p7-* presets): stand-in data from the URL (?card=route|detour|challenge|pit, ?full, ?book,
   *  ?startOrder=n, ?finish, ?zone, ?checkin=<s of penalty wait left>). The clock / penalty row: ui/HUD.ts (?raceTime, ?penalty). */
  demo(q: URLSearchParams): void {
    const kind = q.get('card') ?? (q.has('full') || q.has('book') ? 'route' : null);
    if (kind) {
      const card = DEMO_CARDS[kind] ?? DEMO_CARDS.route!;
      if (!q.has('full')) this.seenKey = `${card.step}@${card.receivedAt}`; // no popup unless asked
      const wait = Number(q.get('checkin') ?? NaN);
      this.setView({ status: 'running', startAt: 0, finishAt: null, penaltyMinutes: Number(q.get('penalty') ?? 0), card, checkinAt: Number.isFinite(wait) ? wait * 1000 : null, officialMs: null });
      if (q.has('book')) (this.bookWaiting = this.bookOpen = true), this.showBook(DEMO_BOOK);
    }
    if (q.has('startOrder')) this.startOrder(Number(q.get('startOrder')) || 1, 0);
    if (q.has('finish')) this.finished('Đội Xanh', 6135000);
    if (q.has('zone')) {
      const teams = ['Xanh', 'Đỏ'].map((n, i) => ({ slot: i + 1, id: `t${i}`, name: `Đội ${n}`, colour: '#fff', online: true }));
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

  private close() {
    this.bookOpen = this.bookWaiting = false;
    this.fullCard = null;
    this.overlay.hidden = true;
    this.taskButtons = [];
  }

  private renderCompact(card: ClueCard | null) {
    this.compact.hidden = !card;
    if (!card) return;
    const s = summarize(card);
    const st = TYPE_STYLE[card.type];
    this.compact.style.setProperty('--c', st.colour);
    const head = el('div', 'rc-head', undefined, html('span', 'rc-icon', icon(st.icon)), el('span', 'rc-label', s.label), s.transport && html('span', 'rc-transport', icon(s.transport.icon, 16)));
    if (s.transport) head.lastElementChild!.setAttribute('title', s.transport.text);
    this.compact.replaceChildren(head, el('div', 'rc-clue', s.clue || s.blocks[0]?.title || ''), el('div', 'rc-hint', 'Tab: Sổ mật thư'));
    this.compact.style.setProperty('--lines', String(C.clueLines));
    this.compact.style.width = `${C.cardWidth}px`;
  }

  private openFull(card: ClueCard) {
    this.fullCard = card;
    this.taskButtons = [];
    const box = el('div', 'rc-full');
    box.style.width = `min(${C.fullWidth}px, 100%)`;
    const env = el('div', 'rc-env', undefined, el('div', 'rc-flap'));
    env.style.setProperty('--c', TYPE_STYLE[card.type].colour);
    box.append(this.detail(card, null, true), el('div', 'rc-actions', undefined, this.closeButton('Đóng (Tab)')));
    this.overlay.replaceChildren(env, box);
    this.overlay.hidden = false;
  }

  private renderBook(entries: BookEntry[] | null) {
    this.taskButtons = [];
    const panel = el('div', 'rc-book');
    panel.style.width = `min(${C.fullWidth}px, 100%)`;
    const toCurrent = el('button', 'rc-btn', 'Về mật thư hiện tại');
    toCurrent.addEventListener('click', () => void (panel.scrollTop = 0));
    panel.append(el('div', 'rc-book-head', undefined, el('h2', '', 'Sổ mật thư'), toCurrent, this.closeButton('Đóng (Tab)')));
    if (!entries) panel.append(el('div', 'rc-empty', 'Đang tải…'));
    else if (!entries.length) panel.append(el('div', 'rc-empty', 'Chưa có mật thư nào.'));
    else for (const e of entries) panel.append(this.detail(e.card, e, e.pinned));
    this.overlay.replaceChildren(panel);
    this.overlay.hidden = false;
  }

  private closeButton(text: string) {
    const b = el('button', 'rc-btn', text);
    b.addEventListener('click', () => this.close());
    return b;
  }

  /** One clue in full (the popup and every Sổ mật thư entry). `buttons` = it is the current card: the temporary task buttons. */
  private detail(card: ClueCard, entry: BookEntry | null, buttons: boolean): HTMLElement {
    const s: CardSummary = summarize(card);
    const st = TYPE_STYLE[card.type];
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
    if (s.clue) root.append(el('p', 'rc-text', s.clue));
    const live = buttons && s.active;
    s.blocks.forEach((b, i) => {
      const blk = el('div', 'rc-task', undefined, el('div', 'rc-task-title', b.title, b.chosen ? el('span', 'rc-chosen', 'Đội đã chọn') : null), b.text ? el('div', 'rc-task-text', b.text) : null, b.place ? el('div', 'rc-task-meta', `Địa điểm: ${b.place}`) : null, b.limit ? el('div', 'rc-task-meta', b.limit) : null);
      if (live) blk.append(this.taskButton(card.step, b.branch ?? undefined, s.blocks.length > 1 ? `Hoàn thành: ${b.title} (tạm) [${i + 1}]` : 'Hoàn thành (tạm) [Enter]'));
      root.append(blk);
    });
    if (live && s.blocks.length) root.append(el('div', 'rc-note', 'Nút tạm: bản sau sẽ chấm đáp án thật.'));
    if (entry) {
      const meta = [`Nhận lúc ${entry.received}`, entry.completed && `Xong lúc ${entry.completed}`, entry.duration && `Thời gian làm: ${entry.duration}`].filter(Boolean).join(' · ');
      root.append(el('div', 'rc-meta', meta));
    }
    return root;
  }

  private taskButton(step: string, branch: string | undefined, text: string) {
    const btn = el('button', 'rc-btn rc-task-btn', text) as HTMLButtonElement;
    btn.addEventListener('click', () => {
      if (btn.disabled) return;
      this.actions.task(step, branch);
      for (const t of this.taskButtons) t.btn.disabled = true; // the answer is a new `race` view (or a notice): no double sends
      setTimeout(() => this.taskButtons.forEach((t) => (t.btn.disabled = false)), C.taskLockSeconds * 1000);
    });
    this.taskButtons.push({ btn, step, branch });
    return btn;
  }
}

// ── DEV stand-ins (p7-* presets): invented UI text, not leg content ──
const T0 = Date.UTC(2026, 9, 1, 9, 0, 0);
const task: TaskView = { title: 'Thử thách minh họa', description: 'Mô tả nhiệm vụ minh họa dành cho ảnh chụp giao diện.', media: [], kind: 'answer', verification: 'auto', proofInstruction: '', timeLimitMinutes: 20 };
const DEMO_CARDS: Record<string, ClueCard> = {
  route: { step: 'D1', type: 'route_info', label: 'Lộ trình 1', text: 'Nội dung mật thư minh họa: hãy đi tới nơi có thể nhìn thấy ngọn tháp cao nhất thành phố rồi tìm hộp mật thư ở chân nó.', transport: { allowed: 'any' }, status: 'active', receivedAt: T0, completedAt: null },
  walk: { step: 'D1', type: 'route_info', label: 'Lộ trình 2', text: 'Mật thư minh họa, lộ trình bắt buộc đi bộ.', transport: { mandatory: 'walk' }, status: 'active', receivedAt: T0, completedAt: null },
  detour: {
    step: 'D2', type: 'detour', label: 'Lựa chọn kép', text: 'Hai con đường, một phải chọn. Hãy chọn nhánh hợp với đội.', status: 'active', receivedAt: T0, completedAt: null, branch: null,
    branches: [
      { id: 'A', name: 'Nhánh A', summary: 'Một nhiệm vụ nhanh gọn ngay tại điểm này.', task },
      { id: 'B', name: 'Nhánh B', summary: 'Nhiệm vụ dài hơn ở một nơi khác.', task: { ...task, place: 'Quảng trường minh họa' } },
    ],
  },
  challenge: { step: 'T1', type: 'challenge', label: 'Thử thách 1', text: 'Gợi ý minh họa: hãy quan sát kỹ xung quanh.', status: 'active', receivedAt: T0, completedAt: null, task: { ...task, place: 'Sân minh họa' } },
  pit: { step: 'P', type: 'pit_stop', label: 'Chặng dừng', text: '', status: 'active', receivedAt: T0, completedAt: null },
};
const DEMO_BOOK: ClueCard[] = [
  { ...DEMO_CARDS.route!, label: 'Lộ trình 1', status: 'done', receivedAt: T0, completedAt: T0 + 1_240_000 },
  { ...DEMO_CARDS.challenge!, status: 'done', receivedAt: T0 + 1_240_000, completedAt: T0 + 2_100_000 },
  { ...DEMO_CARDS.detour!, receivedAt: T0 + 2_100_000 },
];
