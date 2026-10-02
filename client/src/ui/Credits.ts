// "Ghi nguồn" panel (SPEC §17.7): opened from the attribution line, lists public/credits.json (written by
// scripts/process-assets.ts: map data + every downloaded asset). Phase 8B (SPEC §17.20): in a race the panel is locked until
// the team finished ("Mở sau khi về đích"); then it adds the "Phòng Louvre" section from the server's `{t:'credits'}`
// (CreditItem[]: the artwork credits never reach a team earlier). Offline (no race) it shows everything it has.
import type { CreditItem } from '@race/shared/protocol';
import { notice } from './Toasts.ts';
interface Credit { title: string; text: string; licence: string; url: string }

export const CREDITS_LOCKED = 'Mở sau khi về đích';

/** One line per artwork picture: "art-03.webp · «title» – artist · photo · license". Pure (the link is added by the DOM). */
export const creditLines = (items: readonly CreditItem[]): { text: string; license: string; href: string }[] =>
  items.map((c) => ({ text: [c.file, [c.title && `«${c.title}»`, c.artist].filter(Boolean).join(' – '), c.photo].filter(Boolean).join(' · '), license: c.license, href: /^https?:\/\//i.test(c.source) ? c.source : '' }));

// null = offline (no race): everything shown; false = in a race, not finished; true = finished / race over.
let gate: boolean | null = null;
let louvre: readonly CreditItem[] | null = null;
let request: (() => void) | undefined;
let redraw = () => {};
let show: (() => void) | undefined;
let openWanted = false;
/** DEV demo (?credits=louvre): open the panel once initCredits has run (main.ts builds it after the HUD). */
export function openCredits(): void {
  if (show) show();
  else openWanted = true;
}

/** RaceHud.setView: has the team finished (or the Host ended the race)? */
export function setCreditsGate(finished: boolean): void {
  if (gate === finished) return;
  gate = finished;
  redraw();
}
/** `{t:'credits'}`. */
export function setCreditItems(items: readonly CreditItem[]): void {
  louvre = items;
  redraw();
}
/** Asked when the panel opens after the finish and no items came yet (RaceHud wires actions.credits → op `credits`). */
export function onCreditsRequest(fn: () => void): void {
  request = fn;
}

export function initCredits() {
  const $ = (id: string) => document.getElementById(id)!;
  const [panel, list] = [$('credits-panel'), $('credits-list')];
  let base: HTMLElement[] | null = null; // credits.json lines, once loaded
  let loading = false;
  let asked = false; // one request per opening
  const section = (): HTMLElement[] => {
    if (!louvre?.length) return [];
    return [
      Object.assign(document.createElement('li'), { innerHTML: '<b>Phòng Louvre</b>', style: 'list-style:none;margin-left:-18px' }),
      ...creditLines(louvre).map((c) => {
        const li = document.createElement('li');
        li.append(`${c.text} · `, c.href ? Object.assign(document.createElement('a'), { href: c.href, target: '_blank', rel: 'noopener', textContent: c.license }) : c.license);
        return li;
      }),
    ];
  };
  const draw = () => {
    if (panel.hidden) return;
    if (gate === false) return void (list.textContent = CREDITS_LOCKED);
    if (gate === true && !louvre && !asked) (asked = true), request?.();
    if (!base && loading) return void (list.textContent = 'Đang tải…');
    list.replaceChildren(...section(), ...(base ?? [Object.assign(document.createElement('li'), { textContent: 'Không tải được danh sách ghi nguồn.' })])); // the louvre pictures first: they are the news
  };
  redraw = draw;
  const load = async () => {
    if (base || loading) return;
    loading = true;
    try {
      const res = await fetch(new URL('credits.json', location.href));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      base = ((await res.json()) as Credit[]).map((c) => {
        const li = document.createElement('li');
        const a = Object.assign(document.createElement('a'), { href: c.url, target: '_blank', rel: 'noopener', textContent: c.licence });
        li.append(`${c.text} · `, a);
        return li;
      });
    } catch (err) {
      console.warn('credits.json missing or unreadable', err);
    }
    loading = false;
    draw();
  };
  show = () => {
    panel.hidden = false;
    asked = false;
    if (gate === false) notice('creditsLocked');
    draw();
    if (gate !== false) void load();
  };
  $('credits-open').addEventListener('click', show);
  if (openWanted) show();
  $('credits-close').addEventListener('click', () => void (panel.hidden = true));
  addEventListener('keydown', (e) => void (e.code === 'Escape' && (panel.hidden = true)));
}
