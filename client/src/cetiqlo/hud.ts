// CETIQLO room HUD (plan §6): one DOM root, every setter writes only when its value changed. Vietnamese texts; the clock text is the only
// per-second write. The brief = six STILLS (brief.snapshots, once per set) in a 3 × 2 grid; a cell click / T opens the zoom lightbox.
import { cetiqlo as C, hud as H } from '../config.ts';
import { bagIconDataUrl } from './brand.ts';
import type { CatalogItem, CqResult } from './contract.ts';
import { MARK_TEXT, REASON_TEXT, WINNER_TEXT, lockTimeText, pointsText, resultRows } from './logic.ts';

const LOGO = `<span class="cq-logo"><b>CETI</b><b>QLO</b></span>`;
const BAG = () => `<img class="cq-bagicon" src="${bagIconDataUrl(64)}" alt="">`;
const CSS = `
#cq { position: fixed; inset: 0; pointer-events: none; font: 14px/1.4 system-ui, -apple-system, 'Segoe UI', sans-serif; color: #fff; text-shadow: 0 1px 2px rgba(0,0,0,.85); z-index: 1; }
#cq [hidden] { display: none !important; }
body.cq-room .hud-box, body.cq-room .hud-hand { visibility: hidden; } /* the street minimap / street name / toasts wait outside (the room has its own) */
.cq-logo { display: inline-flex; flex-direction: column; width: 34px; height: 34px; background: #E60012; color: #fff; border-radius: 3px; font: 900 11px/1 system-ui, sans-serif; letter-spacing: .5px; align-items: center; justify-content: center; gap: 2px; text-shadow: none; vertical-align: middle; }
.cq-logo b { display: block; }
.cq-bagicon { width: 34px; height: 34px; vertical-align: middle; }
#cq { --cq-pip-w: min(${C.pip.maxWidth}px, ${C.pip.widthVw}vw); }
.cq-pip { position: absolute; left: ${C.pip.left}px; top: ${C.pip.top}px; width: var(--cq-pip-w); display: grid; grid-template-columns: repeat(3, 1fr); gap: 2px; padding: 2px; background: rgba(255,255,255,.85); border-radius: 4px; box-shadow: 0 2px 8px rgba(0,0,0,.5); box-sizing: border-box; pointer-events: auto; }
.cq-pip img, .cq-zoom img { display: block; width: 100%; aspect-ratio: 1; background: #e9e6df; border-radius: 2px; cursor: zoom-in; }
.cq-pip img[src=""] { visibility: hidden; }
.cq-lookhint { position: absolute; left: ${C.pip.left}px; top: calc(${C.pip.top}px + var(--cq-pip-w) * 2 / 3 + 6px); font-size: 11px; color: rgba(255,255,255,.7); }
.cq-zoom { position: absolute; inset: 0; background: rgba(0,0,0,.6); display: flex; align-items: center; justify-content: center; pointer-events: auto; cursor: zoom-out; }
.cq-zoom > div { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; padding: 6px; width: ${C.pip.zoomVmin * 1.5}vmin; max-width: 96vw; background: rgba(255,255,255,.9); border-radius: 8px; box-shadow: 0 8px 30px rgba(0,0,0,.6); }
.cq-zoom.one > div { grid-template-columns: 1fr; width: ${C.pip.zoomVmin}vmin; }
.cq-zoom.one img:not(.on) { display: none; }
.cq-zoom.one img { cursor: zoom-out; }
.cq-clock { position: absolute; left: 50%; top: 64px; transform: translateX(-50%); padding: 4px 22px; border-radius: 8px; background: rgba(0,0,0,.6); font: 700 44px/1.1 system-ui, sans-serif; letter-spacing: 2px; font-variant-numeric: tabular-nums; }
.cq-clock.warn { color: #ff4a3d; background: rgba(60,0,0,.7); animation: cq-blink 1s steps(2, start) infinite; }
@keyframes cq-blink { to { opacity: .55; } }
.cq-opp { position: absolute; right: 16px; top: 16px; padding: 6px 10px; border-radius: 6px; background: rgba(0,0,0,.6); }
.cq-opp i { display: inline-block; width: 12px; height: 12px; border-radius: 50%; margin-right: 6px; vertical-align: -1px; border: 1px solid rgba(255,255,255,.7); }
.cq-opp em { font-style: normal; color: #ffd23c; margin-left: 8px; }
.cq-lobby { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); padding: 18px 30px; border-radius: 10px; background: rgba(0,0,0,.65); text-align: center; }
.cq-lobby h2 { margin: 0 0 6px; font: 700 26px/1.2 system-ui, sans-serif; }
.cq-lobby p { margin: 0; color: rgba(255,255,255,.8); }
.cq-lobby .cq-wait { margin-top: 6px; color: #ffd23c; font-variant-numeric: tabular-nums; }
.cq-label { position: absolute; left: 50%; top: calc(50% + 28px); transform: translateX(-50%); padding: 3px 10px; border-radius: 6px; background: rgba(0,0,0,.55); font: 700 15px/1.3 system-ui, sans-serif; white-space: nowrap; }
.cq-label.go { background: rgba(160,0,10,.8); }
.cq-locked { position: absolute; left: 50%; bottom: 30%; transform: translateX(-50%); padding: 10px 26px; border-radius: 10px; background: rgba(0,90,40,.8); font: 700 24px/1.2 system-ui, sans-serif; }
.cq-bag { position: absolute; right: 16px; bottom: 16px; width: 240px; padding: 8px 10px; border-radius: 8px; background: rgba(0,0,0,.65); }
.cq-bag.open { pointer-events: auto; background: rgba(0,0,0,.85); outline: 2px solid #E60012; }
.cq-bag h3 { margin: 0 0 6px; font: 700 15px/1.2 system-ui, sans-serif; display: flex; align-items: center; gap: 8px; }
.cq-bag h3 span:last-child { margin-left: auto; color: rgba(255,255,255,.7); font-weight: 400; font-size: 12px; }
.cq-bag ol { margin: 0; padding: 0 0 0 20px; max-height: 40vh; overflow: hidden; }
.cq-bag li { line-height: 1.35; }
.cq-bag li i { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 6px; border: 1px solid rgba(255,255,255,.6); vertical-align: -1px; }
.cq-bag.open li { cursor: pointer; }
.cq-bag.open li:hover { color: #ff8a80; text-decoration: line-through; }
.cq-bag p { margin: 6px 0 0; font-size: 12px; color: rgba(255,255,255,.65); }
.cq-toast { position: absolute; left: ${H.margin}px; bottom: ${H.margin}px; padding: 6px 12px; border-radius: 6px; background: rgba(120,0,10,.85); font-weight: 600; transition: opacity .4s; }
.cq-result { position: absolute; inset: 0; background: rgba(0,0,0,.72); display: flex; align-items: center; justify-content: center; pointer-events: auto; }
.cq-result > div { width: min(960px, 94vw); max-height: 92vh; overflow: auto; background: #faf8f4; color: #1a1a1a; text-shadow: none; border-radius: 12px; padding: 18px 24px; box-shadow: 0 8px 30px rgba(0,0,0,.6); }
.cq-result h1 { margin: 0 0 4px; font: 900 34px/1.1 system-ui, sans-serif; display: flex; align-items: center; gap: 12px; }
.cq-result h1.you { color: #1d8a3a; } .cq-result h1.opp { color: #b3261e; } .cq-result h1.draw { color: #7a5a00; }
.cq-result .why { margin: 0 0 14px; color: #555; }
.cq-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
.cq-cols h2 { margin: 0 0 6px; font: 700 18px/1.2 system-ui, sans-serif; display: flex; align-items: center; gap: 8px; }
.cq-cols h2 i { width: 14px; height: 14px; border-radius: 50%; display: inline-block; border: 1px solid #0003; }
.cq-cols .stat { margin: 0 0 8px; font-size: 15px; } .cq-cols .stat b { font-size: 22px; }
.cq-cols ul { margin: 0; padding: 0; list-style: none; }
.cq-cols li { padding: 4px 8px; border-bottom: 1px solid #0001; display: flex; justify-content: space-between; gap: 8px; }
.cq-cols li.ok { background: #e8f5e9; } .cq-cols li.wrong { background: #fdecea; } .cq-cols li.missing { background: #f1f1f1; color: #666; }
.cq-result button { margin: 16px auto 0; display: block; padding: 10px 28px; border: 0; border-radius: 8px; background: #E60012; color: #fff; font: 700 17px system-ui, sans-serif; cursor: pointer; }
`;
const HTML = `<style>${CSS}</style>
<div class="cq-pip" hidden>${'<img src="" alt="">'.repeat(6)}</div>
<div class="cq-lookhint" hidden>bấm để phóng to · T</div>
<div class="cq-zoom" hidden><div>${'<img src="" alt="">'.repeat(6)}</div></div>
<div class="cq-clock" hidden>3:00</div>
<div class="cq-opp" hidden><i></i><span></span><em hidden>đã chốt</em></div>
<div class="cq-lobby" hidden><h2>Đang chờ đối thủ…</h2><p>Đứng chờ ở sảnh. Trận bắt đầu khi có đội kế tiếp vào phòng.</p><p class="cq-wait" hidden></p></div>
<div class="cq-label" hidden></div>
<div class="cq-locked" hidden>Đã chốt · chờ đối thủ…</div>
<div class="cq-bag" hidden><h3>${BAG()}<span>Túi đồ</span><span></span></h3><ol></ol><p>B: mở túi, nhấp món để bỏ · 1–9: bỏ món số n</p></div>
<div class="cq-toast" hidden></div>
<div class="cq-result" hidden><div></div></div>`;

export class CqHud {
  private readonly root = document.createElement('div');
  private readonly el: Record<'pip' | 'lookhint' | 'zoom' | 'clock' | 'opp' | 'lobby' | 'label' | 'locked' | 'bag' | 'toast' | 'result', HTMLElement>;
  private readonly bagList: HTMLOListElement;
  private clockText = '';
  private clockWarn = false;
  private labelText: string | null = null;
  private labelGo = false;
  private lobbyText = '';
  private waitText: string | null = null;
  private bagIds = '';
  /** The brief zoom (lightbox): closed, the whole 3 × 2 grid large, or one piece (slot index). */
  zoom: null | 'grid' | number = null;
  private oppText = '';
  private oppLocked = false;
  private toastAt = 0;
  bagOpen = false;
  /** A bag item clicked (its id) / the result's continue button. */
  onDrop?: (id: string) => void;
  onContinue?: () => void;
  /** The brief zoom opened (true: the room frees the pointer) / closed (false: it locks it again). */
  onZoom?: (open: boolean) => void;

  constructor() {
    this.root.id = 'cq';
    this.root.innerHTML = HTML;
    document.body.append(this.root);
    document.body.classList.add('cq-room');
    const q = (s: string) => this.root.querySelector<HTMLElement>(s)!;
    this.el = { pip: q('.cq-pip'), lookhint: q('.cq-lookhint'), zoom: q('.cq-zoom'), clock: q('.cq-clock'), opp: q('.cq-opp'), lobby: q('.cq-lobby'), label: q('.cq-label'), locked: q('.cq-locked'), bag: q('.cq-bag'), toast: q('.cq-toast'), result: q('.cq-result') };
    this.bagList = this.el.bag.querySelector('ol')!;
    this.bagList.addEventListener('click', (e) => { const li = (e.target as HTMLElement).closest('li'); if (li?.dataset.id && this.bagOpen) this.onDrop?.(li.dataset.id); });
    this.el.result.addEventListener('click', (e) => { if ((e.target as HTMLElement).tagName === 'BUTTON') this.onContinue?.(); });
    // the brief: a cell click (pointer free) zooms that piece; in the lightbox a cell toggles one piece ⇄ the grid, anything else closes
    const cellIndex = (e: Event) => { const img = (e.target as HTMLElement).closest('img'); return img ? [...img.parentElement!.children].indexOf(img) : -1; };
    this.el.pip.addEventListener('click', (e) => { const i = cellIndex(e); if (i >= 0 && this.pipSrc[i]) this.setZoom(i); });
    this.el.zoom.addEventListener('click', (e) => { const i = cellIndex(e); this.setZoom(i < 0 ? null : this.zoom === 'grid' ? i : 'grid'); });
  }

  /** The six stills (brief.snapshots, slot order; null = slot missing): the HUD grid + the lightbox share them as data URLs. */
  brief(stills: readonly (HTMLCanvasElement | null)[]) {
    this.pipSrc = stills.map((c) => c?.toDataURL() ?? '');
    for (const grid of [this.el.pip, this.el.zoom.firstElementChild!]) grid.querySelectorAll('img').forEach((img, i) => { img.src = this.pipSrc[i] ?? ''; });
    this.setZoom(null);
  }
  private pipSrc: string[] = [];
  /** Open / change / close the brief zoom (T toggles the grid; Esc closes). */
  setZoom(z: null | 'grid' | number) {
    const was = this.zoom !== null;
    this.zoom = z;
    this.show('zoom', z !== null);
    this.el.zoom.classList.toggle('one', typeof z === 'number');
    this.el.zoom.querySelectorAll('img').forEach((img, i) => img.classList.toggle('on', i === z));
    if (was !== (z !== null)) this.onZoom?.(z !== null);
  }

  /** The lobby: the queue line (null = hide). */
  lobby(text: string | null) {
    this.show('lobby', text !== null);
    if (text !== null && text !== this.lobbyText) (this.lobbyText = text), (this.el.lobby.querySelector('h2')!.textContent = text);
  }
  /** The loser's wait line under the queue text (null = hidden); written once a second at most by the room. */
  lobbyWait(text: string | null) {
    const el = this.el.lobby.querySelector<HTMLElement>('.cq-wait')!;
    if (text === this.waitText) return;
    this.waitText = text;
    el.hidden = text === null;
    if (text !== null) el.textContent = text;
  }
  /** The match widgets (clock, bag, brief, opponent) on / off together. */
  match(on: boolean) { for (const k of ['clock', 'bag', 'opp', 'lookhint', 'pip'] as const) this.show(k, on); if (!on) (this.show('label', false), this.show('locked', false), this.setZoom(null)); }
  clock(text: string, warn: boolean) {
    if (text !== this.clockText) (this.clockText = text), (this.el.clock.textContent = text);
    if (warn !== this.clockWarn) (this.clockWarn = warn), this.el.clock.classList.toggle('warn', warn);
  }
  opponent(name: string, colour: string, locked: boolean) {
    const t = `${name}|${colour}`;
    if (t !== this.oppText) { this.oppText = t; this.el.opp.querySelector('span')!.textContent = name; this.el.opp.querySelector('i')!.style.background = colour; }
    if (locked !== this.oppLocked) (this.oppLocked = locked), (this.el.opp.querySelector('em')!.hidden = !locked);
  }
  /** The near-item label / "[F] Chốt" (go = inside the checkout square); null = hidden. */
  label(text: string | null, go = false) {
    if (text === this.labelText && go === this.labelGo) return;
    this.labelText = text; this.labelGo = go;
    this.show('label', text !== null);
    if (text !== null) (this.el.label.textContent = text), this.el.label.classList.toggle('go', go);
  }
  locked(on: boolean) { this.show('locked', on); }
  bag(items: readonly CatalogItem[]) {
    const key = items.map((i) => i.id).join(',');
    if (key === this.bagIds) return;
    this.bagIds = key;
    this.bagList.innerHTML = items.map((i) => `<li data-id="${i.id}"><i style="background:${i.colour.hex}"></i>${i.name} · ${i.colour.name}</li>`).join('');
    this.el.bag.querySelector('h3 span:last-child')!.textContent = `${items.length} món`;
  }
  openBag(on: boolean) { this.bagOpen = on; this.el.bag.classList.toggle('open', on); }
  toast(text: string) { this.el.toast.textContent = text; this.el.toast.hidden = false; this.el.toast.style.opacity = '1'; this.toastAt = performance.now(); }

  /** The result screen (cq.result): the set vs each team's bag with the marks, score, lock time, winner; null = closed. */
  result(r: CqResult | null, byId: ReadonlyMap<string, CatalogItem>, colourOf: (slot: number) => string, startAt: number) {
    this.show('result', !!r);
    if (!r) return;
    const nameOf = (id: string) => { const it = byId.get(id); return it ? `${it.name} · ${it.colour.name}` : id; };
    const slotOf = (id: string) => byId.get(id)?.slot;
    const col = (t: CqResult['you'], title: string) => `<div><h2><i style="background:${colourOf(t.slot)}"></i>${title}: ${t.name}</h2>
      <p class="stat"><b>${pointsText(t.score)}</b> · Đúng ${t.correct}/${r.set.length} · Sai ${t.errors} · chốt: ${lockTimeText(t.lockedAtMs, startAt)}</p>
      <ul>${resultRows(r.set, t, nameOf, slotOf).map((row) => `<li class="${row.mark}"><span>${row.text}</span><span>${MARK_TEXT[row.mark]}</span></li>`).join('')}</ul></div>`;
    this.el.result.firstElementChild!.innerHTML = `<h1 class="${r.winner}">${LOGO}${WINNER_TEXT[r.winner]}</h1>
      <p class="why">${r.winner === 'draw' ? `Hòa: ${REASON_TEXT.draw}.` : `${r.winner === 'you' ? 'Thắng' : 'Đội kia thắng'} nhờ ${REASON_TEXT[r.reason]}.`}${r.winner === 'you' ? ' Mật thư kế đã có: ra vòng sáng cạnh cửa.' : r.winner === 'opp' ? ' Đội bạn quay lại sảnh chờ đối thủ kế tiếp. Đội thua chờ quá 10 phút sẽ được rời đi.' : ''}</p>
      <div class="cq-cols">${col(r.you, 'Đội bạn')}${r.opps.map((o) => col(o, 'Đối thủ')).join('')}</div>
      <button type="button">Tiếp tục (Enter)</button>`;
  }

  /** Per frame: the toast fade only. */
  update(now: number) {
    if (!this.el.toast.hidden && now - this.toastAt > 3500) { this.el.toast.style.opacity = '0'; if (now - this.toastAt > 4000) this.el.toast.hidden = true; }
  }
  private show(k: keyof CqHud['el'], on: boolean) { if (this.el[k].hidden === on) this.el[k].hidden = !on; }
  dispose() { this.root.remove(); document.body.classList.remove('cq-room'); }
}
