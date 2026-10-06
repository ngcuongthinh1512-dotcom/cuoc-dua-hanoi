// Phase 5 track C (docs/plans/phase5.md §6 C): the menu (SPEC §17.2: Esc, and it opens by itself when the pointer is
// released; main.ts decides when): "Tiếp tục", "Kẹt? Về chỗ an toàn", settings (invert Y, mouse sensitivity), key table,
// race rules (docs/RACE_RULES.md), credits. The race never pauses (the menu says so). The DOM is built on the first
// open() (importing touches nothing). Real <button>s: Tab / Enter work; inputs blur() after a mouse change so Esc still
// reaches the game (core/Input.ts ignores keys typed into an <input>).
import { menu as M } from '../config.ts';
import './menu.css';
import { avatarRow, clampSensitivity, qualityRow, saveSettings, settings } from './settings.ts';

export interface MenuActions {
  /** "Tiếp tục": main.ts locks the pointer again (a click is a user gesture). */
  resume(): void;
  /** "Kẹt? Về chỗ an toàn"; absent for the spectator (no body): button hidden. */
  respawn?: () => void;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...kids: (Node | string)[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  Object.assign(e, props);
  e.append(...kids);
  return e;
}

/** `code` → <kbd>, **bold** → <strong>, *italic* → <em>; the rest as text. */
function inline(parent: HTMLElement, text: string) {
  for (const part of text.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*)/)) {
    if (part.startsWith('**')) parent.append(el('strong', { textContent: part.slice(2, -2) }));
    else if (part.startsWith('`')) parent.append(el('kbd', { textContent: part.slice(1, -1) }));
    else if (part.length > 2 && part.startsWith('*')) parent.append(el('em', { textContent: part.slice(1, -1) }));
    else parent.append(part);
  }
  return parent;
}

/** docs/RACE_RULES.md as DOM: # headings, - / 1. lists, ---, paragraphs. ponytail: only the Markdown the rules use (no
 *  tables, links, nesting); a real parser if the rules grow them. */
function renderRules(md: string): HTMLElement[] {
  const out: HTMLElement[] = [];
  let list: HTMLElement | undefined;
  for (const raw of md.split('\n')) {
    const line = raw.trimEnd();
    const item = /^(?:[-*]|\d+\.) (.+)/.exec(line);
    if (item) {
      if (!list) out.push((list = el('ul')));
      list.append(inline(el('li'), item[1]!));
      continue;
    }
    list = undefined;
    const head = /^(#{1,3}) (.+)/.exec(line);
    if (head) out.push(inline(el(`h${head[1]!.length + 2}` as 'h3'), head[2]!));
    else if (line === '---') out.push(el('hr'));
    else if (line.trim()) out.push(inline(el('p'), line));
  }
  return out;
}

const fmt = (v: number) => `${v.toFixed(2).replace('.', ',')} ×`;

export class Menu {
  private root: HTMLElement | undefined;
  private refresh = () => {};

  constructor(readonly actions: MenuActions) {}

  get isOpen(): boolean {
    return !!this.root && !this.root.hidden;
  }

  open(): void {
    const root = (this.root ??= this.build());
    root.hidden = false;
    this.refresh();
    root.querySelector<HTMLElement>('.menu-resume')?.focus();
  }

  close(): void {
    if (!this.root) return;
    this.root.hidden = true;
    // A menu button keeping the focus while playing would keep Space / Tab (core/Input.ts leaves them to a focused button).
    if (this.root.contains(document.activeElement)) (document.activeElement as HTMLElement).blur();
  }

  private build(): HTMLElement {
    const { actions } = this;
    // A click is the user gesture the pointer lock needs. The menu closes once the lock is granted (main.ts
    // onPointerLockChange); a refused one (Chrome, ~1 s after Esc released it) leaves it open, so a second click works (review m2).
    const go = (first?: () => void) => () => {
      first?.();
      actions.resume();
    };
    const main = el('div', { className: 'menu-main' }, el('button', { type: 'button', className: 'menu-resume', textContent: 'Tiếp tục', onclick: go() }));
    if (actions.respawn) {
      main.append(el('button', { type: 'button', className: 'menu-respawn', textContent: 'Kẹt? Về chỗ an toàn', onclick: go(() => actions.respawn?.()) }));
    }

    const invert = el('input', { type: 'checkbox', id: 'menu-invert' });
    const sens = el('input', { type: 'range', id: 'menu-sens', min: String(M.sensitivity.min), max: String(M.sensitivity.max), step: String(M.sensitivity.step) });
    const shown = el('output');
    // core/Input.ts ignores keys typed into an <input>, so after a mouse change the control lets go of the focus (Esc, M and
    // the rest reach the game again). After a keyboard change (arrow keys, Space) it keeps it: Esc then blurs first, and a
    // second Esc closes the menu.
    let byKey = false;
    const done = (input: HTMLInputElement) => byKey || input.blur();
    invert.onchange = () => {
      settings.invertY = invert.checked;
      saveSettings();
      done(invert);
    };
    sens.oninput = () => {
      settings.mouseSensitivity = clampSensitivity(sens.valueAsNumber);
      shown.value = fmt(settings.mouseSensitivity);
    };
    sens.onchange = () => {
      saveSettings();
      done(sens);
    };
    this.refresh = () => {
      invert.checked = settings.invertY;
      sens.value = String(settings.mouseSensitivity);
      shown.value = fmt(settings.mouseSensitivity);
    };
    const settingsPane = el(
      'div',
      {},
      el('label', { className: 'menu-check' }, invert, 'Đảo trục Y (đẩy chuột lên = nhìn xuống)'),
      el('div', { className: 'menu-row' }, el('label', { htmlFor: 'menu-sens', textContent: 'Độ nhạy chuột' }), sens, shown),
      el('p', { className: 'menu-hint', textContent: 'Áp dụng cho cả chuột và tay cầm. Lưu trên trình duyệt này.' }),
      qualityRow(),
      avatarRow(),
    );

    // The key table lives in index.html (#keys-src): main.ts toggles #help-player / #help-fly by id, so the elements move here.
    const keysPane = el('div');
    const src = document.getElementById('keys-src');
    if (src) {
      keysPane.append(...src.childNodes);
      src.remove();
    }

    const rulesPane = el('div', {}, 'Đang tải luật đua…');
    let rulesLoaded = false;
    const loadRules = () => {
      if (rulesLoaded) return;
      rulesLoaded = true;
      // Loaded on demand (its own small chunk): the rules add nothing to the game's first load.
      import('../../../docs/RACE_RULES.md?raw').then(
        (m) => rulesPane.replaceChildren(...renderRules(m.default)),
        () => ((rulesLoaded = false), (rulesPane.textContent = 'Không tải được luật đua. Hãy thử lại.')),
      );
    };

    const panes = { settings: settingsPane, keys: keysPane, rules: rulesPane };
    const tabs = Object.entries({ settings: 'Cài đặt', keys: 'Phím điều khiển', rules: 'Luật đua' }).map(([id, label]) =>
      el('button', { type: 'button', textContent: label, onclick: () => show(id as keyof typeof panes) }),
    );
    const show = (id: keyof typeof panes) => {
      Object.entries(panes).forEach(([k, pane]) => (pane.hidden = k !== id));
      tabs.forEach((t, i) => t.setAttribute('aria-pressed', String(Object.keys(panes)[i] === id)));
      if (id === 'rules') loadRules();
    };
    // "Ghi nguồn" is the existing panel (index.html, ui/Credits.ts): it opens above the menu.
    const credits = el('button', { type: 'button', textContent: 'Ghi nguồn', onclick: () => document.getElementById('credits-open')?.click() });
    const nav = el('nav', { className: 'menu-tabs' }, ...tabs, credits);
    const pane = el('div', { className: 'menu-pane' }, ...Object.values(panes));
    show('settings');

    const root = el(
      'div',
      { className: 'menu', hidden: true },
      el('div', { className: 'menu-box' }, el('h2', { textContent: 'Menu' }), el('p', { className: 'menu-note', textContent: 'Cuộc đua vẫn tiếp tục khi mở menu.' }), main, nav, pane),
    );
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', 'Menu');
    root.addEventListener('pointerdown', () => (byKey = false), true);
    root.addEventListener(
      'keydown',
      (e) => {
        byKey = true;
        if (e.key === 'Escape') (document.activeElement as HTMLElement | null)?.blur();
      },
      true,
    );
    document.body.append(root);
    return root;
  }
}
