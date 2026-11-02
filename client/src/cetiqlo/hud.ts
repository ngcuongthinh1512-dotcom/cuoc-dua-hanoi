// CETIQLO room HUD (plan §6): one DOM root, every setter writes only when its value changed. Vietnamese texts; the clock text is the only
// per-second write. The mannequin PiP is drawn by the room into the canvas (scissor); the HUD only frames that spot.
import { cetiqlo as C, hud as H } from '../config.ts';
import { bagIconDataUrl } from './brand.ts';
import type { CatalogItem, CqResult } from './contract.ts';
import { MARK_TEXT, REASON_TEXT, WINNER_TEXT, lockTimeText, resultRows } from './logic.ts';

const LOGO = `<span class="cq-logo"><b>CETI</b><b>QLO</b></span>`;
const BAG = () => `<img class="cq-bagicon" src="${bagIconDataUrl(64)}" alt="">`;
const CSS = `
#cq { position: fixed; inset: 0; pointer-events: none; font: 14px/1.4 system-ui, -apple-system, 'Segoe UI', sans-serif; color: #fff; text-shadow: 0 1px 2px rgba(0,0,0,.85); z-index: 1; }
#cq [hidden] { display: none !important; }
body.cq-room .hud-box, body.cq-room .hud-hand { visibility: hidden; } /* the street minimap / street name / toasts wait outside (the room has its own) */
.cq-logo { display: inline-flex; flex-direction: column; width: 34px; height: 34px; background: #E60012; color: #fff; border-radius: 3px; font: 900 11px/1 system-ui, sans-serif; letter-spacing: .5px; align-items: center; justify-content: center; gap: 2px; text-shadow: none; vertical-align: middle; }
.cq-logo b { display: block; }
.cq-bagicon { width: 34px; height: 34px; vertical-align: middle; }
.cq-pip { position: absolute; left: ${C.pip.left}px; top: ${C.pip.top}px; height: var(--cq-pip-h); aspect-ratio: ${C.pip.width} / ${C.pip.height}; border: 2px solid rgba(255,255,255,.85); border-radius: 4px; box-shadow: 0 2px 8px rgba(0,0,0,.5); box-sizing: border-box; }
.cq-pip span { position: absolute; left: 0; right: 0; bottom: 0; padding: 3px 6px; background: rgba(0,0,0,.55); font-size: 12px; text-align: center; }
#cq { --cq-pip-h: min(${C.pip.height}px, 60vh); --cq-card: calc((var(--cq-pip-h) - 8px) / 3); }
.cq-look { position: absolute; left: calc(${C.pip.left}px + var(--cq-pip-h) * ${C.pip.width} / ${C.pip.height} + 8px); top: ${C.pip.top}px; display: grid; grid-template-columns: repeat(2, var(--cq-card)); grid-auto-rows: var(--cq-card); gap: 4px; }
.cq-look figure { margin: 0; background: rgba(0,0,0,.6); border-radius: 4px; overflow: hidden; display: flex; flex-direction: column; align-items: center; }
.cq-look canvas, .cq-look i { display: block; width: calc(var(--cq-card) - 34px); height: calc(var(--cq-card) - 34px); background: #f3efe6; border-radius: 3px; margin-top: 3px; }
.cq-look figcaption { font-size: 11px; line-height: 1.2; text-align: center; padding: 2px 4px; width: 100%; box-sizing: border-box; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.cq-look figcaption b { display: block; font-weight: 600; overflow: hidden; text-overflow: ellipsis; }
.cq-look figcaption em { font-style: normal; color: rgba(255,255,255,.75); }
.cq-lookhint { position: absolute; left: ${C.pip.left}px; top: calc(${C.pip.top}px + var(--cq-pip-h) + 4px); font-size: 11px; color: rgba(255,255,255,.7); }
.cq-clock { position: absolute; left: 50%; top: 64px; transform: translateX(-50%); padding: 4px 22px; border-radius: 8px; background: rgba(0,0,0,.6); font: 700 44px/1.1 system-ui, sans-serif; letter-spacing: 2px; font-variant-numeric: tabular-nums; }
.cq-clock.warn { color: #ff4a3d; background: rgba(60,0,0,.7); animation: cq-blink 1s steps(2, start) infinite; }
@keyframes cq-blink { to { opacity: .55; } }
.cq-opp { position: absolute; right: 16px; top: 16px; padding: 6px 10px; border-radius: 6px; background: rgba(0,0,0,.6); }
.cq-opp i { display: inline-block; width: 12px; height: 12px; border-radius: 50%; margin-right: 6px; vertical-align: -1px; border: 1px solid rgba(255,255,255,.7); }
.cq-opp em { font-style: normal; color: #ffd23c; margin-left: 8px; }
.cq-lobby { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); padding: 18px 30px; border-radius: 10px; background: rgba(0,0,0,.65); text-align: center; }
.cq-lobby h2 { margin: 0 0 6px; font: 700 26px/1.2 system-ui, sans-serif; }
.cq-lobby p { margin: 0; color: rgba(255,255,255,.8); }
.cq-label { position: absolute; left: 50%; bottom: 22%; transform: translateX(-50%); padding: 6px 16px; border-radius: 8px; background: rgba(0,0,0,.6); font: 600 18px/1.3 system-ui, sans-serif; white-space: nowrap; }
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
.cq-map { position: absolute; left: ${H.margin}px; bottom: ${H.margin}px; border-radius: 6px; background: rgba(0,0,0,.65); padding: 4px; }
.cq-map canvas { display: block; }
.cq-toast { position: absolute; left: ${H.margin}px; bottom: ${H.margin + C.minimap.height + 16}px; padding: 6px 12px; border-radius: 6px; background: rgba(120,0,10,.85); font-weight: 600; transition: opacity .4s; }
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
.cq-cols li.ok { background: #e8f5e9; } .cq-cols li.wrong { background: #fdecea; } .cq-cols li.extra { background: #fff3e0; } .cq-cols li.missing { background: #f1f1f1; color: #666; }
.cq-result button { margin: 16px auto 0; display: block; padding: 10px 28px; border: 0; border-radius: 8px; background: #E60012; color: #fff; font: 700 17px system-ui, sans-serif; cursor: pointer; }
`;
const HTML = `<style>${CSS}</style>
<div class="cq-pip" hidden><span>Set mẫu · manocanh</span></div>
<div class="cq-look" hidden></div>
<div class="cq-lookhint" hidden>T: ẩn / hiện set mẫu</div>
<div class="cq-clock" hidden>3:00</div>
<div class="cq-opp" hidden><i></i><span></span><em hidden>đã chốt</em></div>
<div class="cq-lobby" hidden><h2>Đang chờ đối thủ…</h2><p>Đứng chờ ở sảnh. Trận bắt đầu khi có đội kế tiếp vào phòng.</p></div>
<div class="cq-label" hidden></div>
<div class="cq-locked" hidden>Đã chốt · chờ đối thủ…</div>
<div class="cq-bag" hidden><h3>${BAG()}<span>Túi đồ</span><span></span></h3><ol></ol><p>B: mở túi, nhấp món để bỏ · 1–9: bỏ món số n</p></div>
<div class="cq-map" hidden><canvas width="${C.minimap.width}" height="${C.minimap.height}"></canvas></div>
<div class="cq-toast" hidden></div>
<div class="cq-result" hidden><div></div></div>`;

export interface MapState {
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  lobbyZ: number;
  checkout: { x: number; z: number; half: number };
  you: { x: number; z: number; yaw: number; floor: 1 | 2; colour: string };
  opp: { x: number; z: number; floor: 1 | 2; colour: string } | null;
}

export class CqHud {
  private readonly root = document.createElement('div');
  private readonly el: Record<'pip' | 'look' | 'lookhint' | 'clock' | 'opp' | 'lobby' | 'label' | 'locked' | 'bag' | 'map' | 'toast' | 'result', HTMLElement>;
  private readonly bagList: HTMLOListElement;
  private readonly ctx: CanvasRenderingContext2D;
  private clockText = '';
  private clockWarn = false;
  private labelText: string | null = null;
  private labelGo = false;
  private lobbyText = '';
  private bagIds = '';
  private cardIds = '';
  lookbookOn = true;
  private inMatch = false;
  private oppText = '';
  private oppLocked = false;
  private toastAt = 0;
  private mapAt = 0;
  bagOpen = false;
  /** A bag item clicked (its id) / the result's continue button. */
  onDrop?: (id: string) => void;
  onContinue?: () => void;

  constructor() {
    this.root.id = 'cq';
    this.root.innerHTML = HTML;
    document.body.append(this.root);
    document.body.classList.add('cq-room');
    const q = (s: string) => this.root.querySelector<HTMLElement>(s)!;
    this.el = { pip: q('.cq-pip'), look: q('.cq-look'), lookhint: q('.cq-lookhint'), clock: q('.cq-clock'), opp: q('.cq-opp'), lobby: q('.cq-lobby'), label: q('.cq-label'), locked: q('.cq-locked'), bag: q('.cq-bag'), map: q('.cq-map'), toast: q('.cq-toast'), result: q('.cq-result') };
    this.bagList = this.el.bag.querySelector('ol')!;
    this.ctx = this.el.map.querySelector('canvas')!.getContext('2d')!;
    this.bagList.addEventListener('click', (e) => { const li = (e.target as HTMLElement).closest('li'); if (li?.dataset.id && this.bagOpen) this.onDrop?.(li.dataset.id); });
    this.el.result.addEventListener('click', (e) => { if ((e.target as HTMLElement).tagName === 'BUTTON') this.onContinue?.(); });
  }

  /** The lobby: the queue line (null = hide). */
  lobby(text: string | null) {
    this.show('lobby', text !== null);
    if (text !== null && text !== this.lobbyText) (this.lobbyText = text), (this.el.lobby.querySelector('h2')!.textContent = text);
  }
  /** The match widgets (clock, bag, map, pip, opponent) on / off together. */
  match(on: boolean) { this.inMatch = on; for (const k of ['clock', 'bag', 'map', 'opp', 'lookhint'] as const) this.show(k, on); this.show('pip', on && this.lookbookOn); this.show('look', on && this.lookbookOn); if (!on) (this.show('label', false), this.show('locked', false)); }
  /** The lookbook cards beside the PiP (one per set piece, set order): the item's thumbnail canvas (mannequin.thumbnails) or a colour
   *  swatch (mannequin.legend fallback) + name + colour name. Written once per set. */
  cards(entries: readonly { id: string; name: string; colour: string; hex: string; hex2?: string; canvas?: HTMLCanvasElement | null }[]) {
    const key = entries.map((e) => e.id + (e.canvas ? '#' : '')).join(',');
    if (key === this.cardIds) return;
    this.cardIds = key;
    this.el.look.replaceChildren(...entries.map((e) => {
      const f = document.createElement('figure');
      if (e.canvas) f.append(e.canvas);
      else { const i = document.createElement('i'); i.style.background = e.hex2 ? `linear-gradient(135deg,${e.hex} 50%,${e.hex2} 50%)` : e.hex; f.append(i); }
      const c = document.createElement('figcaption');
      c.innerHTML = `<b></b><em></em>`;
      c.querySelector('b')!.textContent = e.name;
      c.querySelector('em')!.textContent = e.colour;
      f.append(c);
      return f;
    }));
  }
  /** T: the lookbook (PiP + cards) shown / hidden; the room skips the PiP blit while hidden. */
  lookbook(on: boolean) { this.lookbookOn = on; this.show('pip', on && this.inMatch); this.show('look', on && this.inMatch); }
  /** The PiP's on-screen rectangle (CSS px = renderer px inside a room): where the room blits it. */
  pipRect() { const r = this.el.pip.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }
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

  /** Minimap at ≤ minimap.hz; both players, the CHECKOUT square, the lobby line, the floor badge. */
  map(s: MapState, now: number) {
    if (now - this.mapAt < 1000 / C.minimap.hz) return;
    this.mapAt = now;
    const g = this.ctx, W = C.minimap.width, Hh = C.minimap.height, b = s.bounds;
    const sx = W / (b.maxX - b.minX), sz = Hh / (b.maxZ - b.minZ), k = Math.min(sx, sz);
    const X = (x: number) => (W - (b.maxX - b.minX) * k) / 2 + (x - b.minX) * k, Z = (z: number) => (Hh - (b.maxZ - b.minZ) * k) / 2 + (z - b.minZ) * k;
    g.clearRect(0, 0, W, Hh);
    g.fillStyle = '#e9e4d8'; g.fillRect(X(b.minX), Z(b.minZ), (b.maxX - b.minX) * k, (b.maxZ - b.minZ) * k);
    g.strokeStyle = '#8aa'; g.lineWidth = 1; g.beginPath(); g.moveTo(X(b.minX), Z(s.lobbyZ)); g.lineTo(X(b.maxX), Z(s.lobbyZ)); g.stroke(); // the glass
    g.fillStyle = '#E60012'; g.fillRect(X(s.checkout.x - s.checkout.half), Z(s.checkout.z - s.checkout.half), 2 * s.checkout.half * k, 2 * s.checkout.half * k);
    const dot = (x: number, z: number, colour: string, r: number) => { g.beginPath(); g.arc(X(x), Z(z), r, 0, Math.PI * 2); g.fillStyle = colour; g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.stroke(); };
    if (s.opp) dot(s.opp.x, s.opp.z, s.opp.colour, 5);
    dot(s.you.x, s.you.z, s.you.colour, 5);
    g.beginPath(); g.moveTo(X(s.you.x), Z(s.you.z)); g.lineTo(X(s.you.x - Math.sin(s.you.yaw) * 2.2), Z(s.you.z - Math.cos(s.you.yaw) * 2.2)); g.strokeStyle = s.you.colour; g.lineWidth = 2; g.stroke();
    g.fillStyle = '#000'; g.font = 'bold 12px system-ui, sans-serif'; g.textBaseline = 'top';
    g.fillText(`Tầng ${s.you.floor}`, X(b.minX) + 4, Z(b.minZ) + 3);
    if (s.opp && s.opp.floor !== s.you.floor) (g.fillStyle = s.opp.colour), g.fillText(`Đối thủ: tầng ${s.opp.floor}`, X(b.minX) + 4, Z(b.minZ) + 17);
  }

  /** The result screen (cq.result): the set vs each team's bag with the marks, score, lock time, winner; null = closed. */
  result(r: CqResult | null, byId: ReadonlyMap<string, CatalogItem>, colourOf: (slot: number) => string, startAt: number) {
    this.show('result', !!r);
    if (!r) return;
    const nameOf = (id: string) => { const it = byId.get(id); return it ? `${it.name} · ${it.colour.name}` : id; };
    const slotOf = (id: string) => byId.get(id)?.slot;
    const col = (t: CqResult['you'], title: string) => `<div><h2><i style="background:${colourOf(t.slot)}"></i>${title}: ${t.name}</h2>
      <p class="stat"><b>${t.scorePct} %</b> · đúng ${t.correct} / ${r.set.length} · lỗi ${t.errors} · chốt: ${lockTimeText(t.lockedAtMs, startAt)}</p>
      <ul>${resultRows(r.set, t, nameOf, slotOf).map((row) => `<li class="${row.mark}"><span>${row.text}</span><span>${MARK_TEXT[row.mark]}</span></li>`).join('')}</ul></div>`;
    this.el.result.firstElementChild!.innerHTML = `<h1 class="${r.winner}">${LOGO}${WINNER_TEXT[r.winner]}</h1>
      <p class="why">${r.winner === 'draw' ? `Hòa: ${REASON_TEXT.draw}.` : `${r.winner === 'you' ? 'Thắng' : 'Đội kia thắng'} nhờ ${REASON_TEXT[r.reason]}.`}${r.winner === 'you' ? ' Mật thư kế đã có: ra vòng sáng cạnh cửa.' : r.winner === 'opp' ? ' Đội bạn quay lại sảnh chờ đối thủ kế tiếp.' : ''}</p>
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
