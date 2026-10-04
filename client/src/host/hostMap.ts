// SPEC §17.41 "Bản đồ trực tiếp": the Host page's floating minimap (Host only). Ground = the in-game full map (FullMap's
// painter: roads, Seine, parks; street names from fullMap.labelMaxMpp), north up, drag to move, wheel to zoom. Over it the
// loaded leg's places (hostMapData.ts; the ones a team heads for ringed in white) and every team (the 5 Hz ticks the Host
// socket gets + host.state poses: offline dimmed, finished = square). Redrawn only on a change (one requestAnimationFrame;
// ticks come at ≤ 5 Hz), never while the panel is folded. host/main.ts loads this module with the road graph on first open.
// ponytail: FullMap shares a chunk with three + rapier (≈ 1.75 MB gzip, fetched once when the panel first opens) since roadWidth /
// roadClass / bboxCorners sit next to 3D code; move them + FullMap's painter into three-free modules if the Host load matters.
import { PIT_MAT } from '@race/shared';
import type { RoadGraph } from '@race/shared/graph';
import { decodeTick, type HostState } from '@race/shared/protocol';
import { fullMap as C, minimap, raceClient } from '../config.ts';
import type { WaterData } from '../geo/chunkData.ts';
import { FullMap, type Label, type LabelCandidate, type MapView, mapToScreen, mapToWorld, placeLabels } from '../ui/FullMap.ts';
import { offscreen } from '../ui/MapTiles.ts';
import { byEntry, fitView, heading, legPlaces, type Place, type PlaceKind, placeLabel, placeTip, teamTip } from './hostMapData.ts';

/** Pin colour per kind of place (a place with several steps: PLACE_RANK). */
export const KIND_COLOUR: Record<PlaceKind, string> = { start: '#ffffff', route_info: '#f2c230', challenge: '#ff9a2e', detour: '#3fb6ff', pit_stop: '#ff4a3d' };
const KIND_NAME: [PlaceKind, string][] = [['start', 'xuất phát'], ['route_info', 'lộ trình'], ['challenge', 'thử thách'], ['detour', 'lựa chọn kép'], ['pit_stop', 'về đích']];
const PX = { pin: 7, ring: 11, team: 5.5, hit: 10, fitPad: 36, fitMinMpp: 1 }; // CSS px (fitMinMpp: m/px, a fit around one point)
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const sameView = (a: MapView | undefined, b: MapView) => !!a && a.cx === b.cx && a.cz === b.cz && a.mpp === b.mpp && a.w === b.w && a.h === b.h;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, unknown> = {}, ...kids: (Node | string)[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  Object.assign(e, props);
  e.append(...kids);
  return e;
}

export class HostMap {
  private readonly fm: FullMap;
  private readonly base: OffscreenCanvas; // the whole map at fullMap.baseMpp (≈ 1 900 × 1 250 px), drawn once
  private readonly wrap: HTMLDivElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly g: CanvasRenderingContext2D;
  private readonly tip: HTMLDivElement;
  private readonly view: MapView = { cx: 0, cz: 0, mpp: 8, w: 0, h: 0 };
  private detail?: { canvas: OffscreenCanvas; view: MapView; labels: Label[] };
  private state?: HostState;
  private places: Place[] = [];
  private head = new Map<string, string>(); // team id → entry key it heads for
  private by = new Map<string, string[]>(); // entry key → team names
  private readonly pos = new Map<number, { x: number; z: number }>(); // team slot → last known position
  private legId: string | null = null;
  private fitPending = true; // fit the view on the first draw and when another leg is loaded
  private showPlaces = true;
  private movedAt = -Infinity;
  private lastWheel = -Infinity;
  private settle = 0;
  private press?: { x: number; y: number; cx: number; cz: number; drag: boolean };
  private raf = 0;

  /** The road graph (host/main.ts's loader, shared with the corridor code) + water.json (missing: roads only). */
  static async load(panel: HTMLDetailsElement, graph: Promise<RoadGraph>): Promise<HostMap> {
    const water = fetch('data/water.json').then((r) => (r.ok ? (r.json() as Promise<WaterData>) : undefined)).catch(() => undefined);
    return new HostMap(panel, await graph, await water);
  }

  constructor(readonly panel: HTMLDetailsElement, graph: RoadGraph, water: WaterData | undefined) {
    this.fm = new FullMap(graph, water, () => {});
    const e = this.fm.extent, bm = C.baseMpp;
    this.base = offscreen(Math.ceil((e[2] - e[0]) / bm), Math.ceil((e[3] - e[1]) / bm));
    const bg = this.base.getContext('2d')!;
    bg.setTransform(1 / bm, 0, 0, 1 / bm, -e[0] / bm, -e[1] / bm);
    // ponytail: FullMap's private painter / labels by bracket access (still type-checked); export them when FullMap.ts is next touched
    this.fm['paint'](bg, e, bm);
    this.canvas = el('canvas');
    this.g = this.canvas.getContext('2d')!;
    this.tip = el('div', { className: 'map-tip', hidden: true });
    this.wrap = el('div', { className: 'map-wrap' }, this.canvas, this.tip);
    const layer = el('input', { type: 'checkbox', checked: true, onchange: () => ((this.showPlaces = layer.checked), this.invalidate()) });
    const big = el('button', { className: 'small', title: 'Phóng to / thu nhỏ khung bản đồ', onclick: () => ((big.textContent = panel.classList.toggle('big') ? 'Thu nhỏ' : 'Phóng to'), this.keepInView()) }, panel.classList.contains('big') ? 'Thu nhỏ' : 'Phóng to');
    panel.append(
      el('div', { className: 'map-tools' },
        el('label', { title: 'Hiện / ẩn các điểm của chặng (chỉ Host thấy)' }, layer, 'Địa điểm'),
        el('button', { className: 'small', title: 'Khung lại theo các điểm của chặng và các đội', onclick: () => ((this.fitPending = true), this.invalidate()) }, 'Khung lại'), big),
      this.wrap,
      el('div', { className: 'map-legend' }, ...KIND_NAME.flatMap(([k, t]) => [el('b', { style: `color:${KIND_COLOUR[k]}` }, k === 'pit_stop' ? '▬' : '◆'), ` ${t} `]), '· ● đội (mờ: offline, ■ đã về đích) · vòng trắng: có đội đang tới'),
      el('div', { className: 'map-legend' }, 'Kéo: di chuyển · lăn chuột: phóng to · rê chuột: chi tiết · Bản đồ © OpenStreetMap contributors'),
    );
    new ResizeObserver(() => this.resize()).observe(this.wrap);
    panel.addEventListener('toggle', () => (this.keepInView(), this.invalidate()));
    addEventListener('resize', () => this.keepInView());
    this.pointer();
    this.dragPanel();
  }

  /** host.state (≤ 1 Hz): teams, poses (offline teams too), the leg's places, who heads where. */
  update(s: HostState): void {
    this.state = s;
    for (const t of s.teams) if (t.pose) this.pos.set(t.slot, { x: t.pose.x, z: t.pose.z });
    this.places = s.leg ? legPlaces(s.leg) : [];
    this.head = heading(s);
    this.by = byEntry(s, this.head);
    const id = s.leg?.id ?? null;
    if (id !== this.legId) (this.legId = id), (this.fitPending = true);
    this.invalidate();
  }

  /** A tick array from the Host socket (every online team, 5 Hz while someone moves). */
  tick(raw: unknown): void {
    const t = decodeTick(raw);
    if (!t) return;
    for (const e of t.entries) this.pos.set(e.slot, { x: e.pose.x, z: e.pose.z });
    this.invalidate();
  }

  private invalidate() {
    this.raf ||= requestAnimationFrame(() => this.draw());
  }

  private dpr() {
    return Math.min(2, devicePixelRatio);
  }

  /** Like FullMap.update: the base raster, the sharp vector view + street names once settled (zoomed in), then the overlay. */
  private draw() {
    this.raf = 0;
    const v = this.view, g = this.g, dpr = this.dpr();
    if (!this.panel.open || !v.w) return;
    if (this.fitPending) this.fit();
    const vector = v.mpp < C.baseMpp * dpr;
    if (vector && performance.now() - this.movedAt >= C.settleMs && !sameView(this.detail?.view, v)) this.redrawDetail(dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = minimap.colours.outside;
    g.fillRect(0, 0, v.w, v.h);
    const e = this.fm.extent, k = C.baseMpp / v.mpp;
    const [bx, by] = mapToScreen(v, e[0], e[1]);
    g.drawImage(this.base, bx, by, this.base.width * k, this.base.height * k);
    const d = vector ? this.detail : undefined;
    if (d) {
      const s = d.view.mpp / v.mpp;
      const [dx, dy] = mapToScreen(v, ...mapToWorld(d.view, 0, 0));
      g.drawImage(d.canvas, dx, dy, d.view.w * s, d.view.h * s);
      this.fm['drawLabels'](g, d.labels, dpr * s, dpr * dx, dpr * dy);
    }
    if (this.state) this.overlay(g, this.state);
  }

  private redrawDetail(dpr: number) {
    const v = { ...this.view };
    const old = this.detail?.canvas;
    const canvas = old?.width === Math.round(v.w * dpr) && old.height === Math.round(v.h * dpr) ? old : offscreen(Math.round(v.w * dpr), Math.round(v.h * dpr));
    const g = canvas.getContext('2d')!;
    g.setTransform(dpr / v.mpp, 0, 0, dpr / v.mpp, dpr * (v.w / 2 - v.cx / v.mpp), dpr * (v.h / 2 - v.cz / v.mpp));
    this.fm['paint'](g, [...mapToWorld(v, 0, 0), ...mapToWorld(v, v.w, v.h)], v.mpp);
    this.detail = { canvas, view: v, labels: v.mpp <= C.labelMaxMpp ? this.fm.labels(v, (t) => this.measure(t)) : [] };
  }

  private measure(text: string): number {
    return this.fm['measure'](this.g, text);
  }

  /** Places (zone ring or the Pit Stop mat, pin, white ring when a team heads there), team dots, then all names placed
   *  without overlap (FullMap.placeLabels; a name with no free spot is left out, the hover text has them all). */
  private overlay(g: CanvasRenderingContext2D, s: HostState) {
    const v = this.view;
    const cands: LabelCandidate[] = [];
    const look = new Map<string, { colour: string; alpha: number }>();
    // order: online teams, places a team heads for, offline teams, other places; each tries right, left, above, below
    const name = (text: string, colour: string, alpha: number, x: number, y: number, off: number, order: number) => {
      const w = this.measure(text) + C.label.pad + 1;
      look.set(text, { colour, alpha });
      for (const [k, x0, y0] of [[0, x + off, y], [0.1, x - off - w, y], [0.2, x - w / 2, y - off - 6], [0.3, x - w / 2, y + off + 6]] as const)
        cands.push({ text, x0, y0, x1: x0 + w, y1: y0, order: order + k });
    };
    if (this.showPlaces)
      this.places.forEach((p, i) => {
        const [x, y] = mapToScreen(v, p.x, p.z);
        const c = KIND_COLOUR[p.kind];
        const n = p.entries.reduce((a, e) => a + (this.by.get(e.key)?.length ?? 0), 0);
        const r = p.r / v.mpp;
        g.lineWidth = 1.5;
        if (p.mat) {
          // SPEC §17.38 mat; host.state has no zone yaw, so it is drawn with its long side north-south
          const [hw, hl] = [PIT_MAT.width / 2 / v.mpp, PIT_MAT.length / 2 / v.mpp];
          g.globalAlpha = 0.75;
          g.fillStyle = raceClient.mat.colour;
          g.strokeStyle = raceClient.mat.stripe;
          g.fillRect(x - hw, y - hl, 2 * hw, 2 * hl);
          g.strokeRect(x - hw, y - hl, 2 * hw, 2 * hl);
        } else if (r >= 3) {
          g.beginPath();
          g.arc(x, y, r, 0, 2 * Math.PI);
          g.fillStyle = g.strokeStyle = c;
          g.globalAlpha = 0.14;
          g.fill();
          g.globalAlpha = 0.6;
          g.stroke();
        }
        g.globalAlpha = 1;
        g.beginPath();
        g.moveTo(x, y - PX.pin);
        g.lineTo(x + PX.pin, y);
        g.lineTo(x, y + PX.pin);
        g.lineTo(x - PX.pin, y);
        g.closePath();
        g.fillStyle = c;
        g.fill();
        g.strokeStyle = '#111';
        g.stroke();
        if (n) {
          g.beginPath();
          g.arc(x, y, PX.ring, 0, 2 * Math.PI);
          g.strokeStyle = '#fff';
          g.lineWidth = 2.5;
          g.stroke();
        }
        name(placeLabel(p, n), c, 1, x, y, PX.ring + 3, (n ? 100 : 200) + i);
      });
    s.teams.forEach((t, i) => {
      const p = this.pos.get(t.slot);
      if (!p) return;
      const [x, y] = mapToScreen(v, p.x, p.z);
      const done = t.finishAt !== null;
      g.globalAlpha = t.online ? 1 : 0.45;
      g.beginPath();
      if (done) g.rect(x - PX.team, y - PX.team, 2 * PX.team, 2 * PX.team);
      else g.arc(x, y, PX.team, 0, 2 * Math.PI);
      g.fillStyle = t.colour;
      g.fill();
      g.strokeStyle = '#fff';
      g.lineWidth = 2;
      g.stroke();
      name(done ? `${t.name} ✓` : t.name, '#fff', t.online ? 1 : 0.55, x, y, PX.team + 4, (t.online ? 0 : 150) + i);
    });
    g.font = C.label.font;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (const l of placeLabels(cands, (t) => this.measure(t), v.w, v.h)) {
      const k = look.get(l.text)!;
      g.globalAlpha = 0.75 * k.alpha; // a dark chip: readable over the street names too
      g.fillStyle = '#0b0f16';
      g.fillRect(l.x - l.w / 2, l.y - l.h / 2 + 1, l.w, l.h - 2);
      g.globalAlpha = k.alpha;
      g.fillStyle = k.colour;
      g.fillText(l.text, l.x, l.y + 0.5);
    }
    g.globalAlpha = 1;
  }

  /** The view over the leg's places + every known team (nothing yet: the whole map). */
  private fit() {
    const v = this.view, e = this.fm.extent;
    this.fitPending = false;
    const pts = [...this.places, ...this.pos.values()];
    Object.assign(v, fitView(pts.length ? pts : [{ x: e[0], z: e[1] }, { x: e[2], z: e[3] }], v.w, v.h, PX.fitMinMpp, this.maxMpp(), PX.fitPad));
  }

  /** Out to the whole race area in this panel (fullMap.metersPerPx stops at a 1 000 px wide window's). */
  private maxMpp() {
    const e = this.fm.extent, v = this.view;
    return Math.max(C.metersPerPx[1], (e[2] - e[0]) / v.w, (e[3] - e[1]) / v.h);
  }

  /** After a drag / zoom: the centre kept on the map, the sharp view redrawn fullMap.settleMs after the last move. */
  private moved() {
    const v = this.view, e = this.fm.extent;
    v.cx = clamp(v.cx, e[0], e[2]);
    v.cz = clamp(v.cz, e[1], e[3]);
    this.movedAt = performance.now();
    this.invalidate();
    clearTimeout(this.settle);
    this.settle = window.setTimeout(() => this.invalidate(), C.settleMs + 20);
  }

  private resize() {
    const [w, h, dpr] = [this.wrap.clientWidth, this.wrap.clientHeight, this.dpr()];
    if (!w || !h) return; // folded
    Object.assign(this.view, { w, h });
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.invalidate();
  }

  /** Drag to move, wheel to zoom (FullMap's gestures, no waypoint click); hover = the teams / places under the mouse. */
  private pointer() {
    const cv = this.canvas, v = this.view;
    cv.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      cv.setPointerCapture(e.pointerId);
      this.press = { x: e.offsetX, y: e.offsetY, cx: v.cx, cz: v.cz, drag: false };
    });
    cv.addEventListener('pointermove', (e) => {
      const p = this.press;
      if (!p) return this.hover(e.offsetX, e.offsetY);
      if (!p.drag && Math.hypot(e.offsetX - p.x, e.offsetY - p.y) < C.dragPx) return;
      p.drag = true;
      this.showTip('');
      cv.style.cursor = 'grabbing';
      v.cx = p.cx - (e.offsetX - p.x) * v.mpp;
      v.cz = p.cz - (e.offsetY - p.y) * v.mpp;
      this.moved();
    });
    const release = () => ((this.press = undefined), (cv.style.cursor = ''));
    cv.addEventListener('pointerup', release);
    cv.addEventListener('pointercancel', release);
    cv.addEventListener('pointerleave', () => this.showTip(''));
    cv.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (!e.deltaY || e.timeStamp - this.lastWheel < C.wheelGapMs) return;
      this.lastWheel = e.timeStamp;
      const [x, z] = mapToWorld(v, e.offsetX, e.offsetY); // FullMap.zoomAt with this panel's range
      v.mpp = clamp(v.mpp * C.wheelZoom ** Math.sign(e.deltaY), C.metersPerPx[0], this.maxMpp());
      v.cx = x - (e.offsetX - v.w / 2) * v.mpp;
      v.cz = z - (e.offsetY - v.h / 2) * v.mpp;
      this.moved();
    }, { passive: false });
  }

  /** Every team, then every place, within PX.hit of (sx, sy). */
  private hover(sx: number, sy: number) {
    const s = this.state;
    if (!s) return;
    const near = (p: { x: number; z: number } | undefined) => {
      const [a, b] = p ? mapToScreen(this.view, p.x, p.z) : [Infinity, 0];
      return Math.hypot(a - sx, b - sy) < PX.hit;
    };
    const teams = s.teams.filter((t) => near(this.pos.get(t.slot))).map((t) => teamTip(s, t, this.head.get(t.id)));
    const places = this.showPlaces ? this.places.filter(near).map((p) => placeTip(p, this.by)) : [];
    this.showTip([...teams, ...places].join('\n\n'), sx, sy);
  }

  private showTip(text: string, sx = 0, sy = 0) {
    const tip = this.tip;
    tip.hidden = !text;
    if (!text) return;
    if (tip.textContent !== text) tip.textContent = text;
    tip.style.left = `${Math.max(0, Math.min(sx + 14, this.view.w - tip.offsetWidth - 4))}px`;
    tip.style.top = `${sy + 14 + tip.offsetHeight > this.view.h ? Math.max(0, sy - tip.offsetHeight - 8) : sy + 14}px`;
  }

  /** The title bar moves the panel; a press that moved fullMap.dragPx is a drag, not a fold / unfold click. */
  private dragPanel() {
    const head = this.panel.querySelector('summary');
    if (!head) return;
    let at: { x: number; y: number; l: number; t: number } | undefined;
    let moved = false;
    head.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const r = this.panel.getBoundingClientRect();
      at = { x: e.clientX, y: e.clientY, l: r.left, t: r.top };
      moved = false;
      head.setPointerCapture(e.pointerId);
    });
    head.addEventListener('pointermove', (e) => {
      if (!at || (!moved && Math.hypot(e.clientX - at.x, e.clientY - at.y) < C.dragPx)) return;
      moved = true;
      this.moveTo(at.l + e.clientX - at.x, at.t + e.clientY - at.y);
    });
    head.addEventListener('pointerup', () => (at = undefined));
    head.addEventListener('pointercancel', () => (at = undefined));
    head.addEventListener('click', (e) => (moved && e.preventDefault(), (moved = false)));
  }

  private moveTo(l: number, t: number) {
    const p = this.panel;
    Object.assign(p.style, { left: `${clamp(l, 0, innerWidth - p.offsetWidth)}px`, top: `${clamp(t, 0, Math.max(0, innerHeight - p.offsetHeight))}px`, right: 'auto', bottom: 'auto' });
  }

  /** A moved panel that grew (Phóng to, unfolded, smaller window) stays on the screen. */
  private keepInView() {
    if (!this.panel.style.left) return; // still at its corner (right / bottom)
    const r = this.panel.getBoundingClientRect();
    this.moveTo(r.left, r.top);
  }
}
