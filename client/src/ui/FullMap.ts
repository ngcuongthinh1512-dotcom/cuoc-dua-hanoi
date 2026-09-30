// Phase 5 track A (docs/plans/phase5.md §6 A): full-screen map (M, SPEC §12): north up, drag / wheel zoom, click = set the
// waypoint (click on it again = remove), GPS route, player arrow, street names only (SPEC §4.6). Whole map from the road
// graph (roads, names) + water.json (Seine, ponds, parks overview); no buildings (like the GTA V map), no NPCs, bikes or
// clue boxes. Canvas 2D: on open the whole map is rasterised once at fullMap.baseMpp; dragging / zooming draws that
// raster transformed (plus the last sharp view); fullMap.settleMs after the last move the view is redrawn from vectors
// at its exact scale, with the street names. The constructor touches no DOM (tests build it in Node).
import { type RoadGraph, WAY_HEADER, WayFlag } from '@race/shared/graph';
import { fullMap as C, minimap } from '../config.ts';
import type { WaterData, XZ } from '../geo/chunkData.ts';
import { roadWidth } from '../world/RoadBuilder.ts';
import { BRIDGE, RoadClass, roadClass } from '../world/mapVectors.ts';
import { bboxCorners } from '../world/Bounds.ts';
import { type Box, boxes, clipToArea, hit, trace } from './MapTiles.ts';
import { drawArrow, drawRoute, drawWaypoint } from './Minimap.ts';
import { type GpsView, type MapPoint, type HudFrame, NO_GPS } from './types.ts';

const col = minimap.colours;
const ROAD_COLOUR = [col.foot, col.pedestrian, col.service, col.minor, col.major, col.steps];
const MIN_PX = [1, 1.5, 1, 1.5, 2.5, 1]; // px: the thinnest a class is drawn at any zoom
const SKIP = 255; // sidewalks, crossings: never on the map
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** North-up view: world (cx, cz) at the centre of a w × h CSS px canvas, mpp m per px. */
export interface MapView {
  cx: number;
  cz: number;
  mpp: number;
  w: number;
  h: number;
}

export const mapToWorld = (v: MapView, sx: number, sy: number): [number, number] => [v.cx + (sx - v.w / 2) * v.mpp, v.cz + (sy - v.h / 2) * v.mpp];
export const mapToScreen = (v: MapView, x: number, z: number): [number, number] => [(x - v.cx) / v.mpp + v.w / 2, (z - v.cz) / v.mpp + v.h / 2];

/** Zoom by `factor` (> 1 = out, mpp clamped to fullMap.metersPerPx) keeping the world point under (sx, sy) in place. */
export function zoomAt(v: MapView, sx: number, sy: number, factor: number) {
  const [x, z] = mapToWorld(v, sx, sy);
  v.mpp = clamp(v.mpp * factor, C.metersPerPx[0], C.metersPerPx[1]);
  v.cx = x - (sx - v.w / 2) * v.mpp;
  v.cz = z - (sy - v.h / 2) * v.mpp;
}

/** A click at (sx, sy): null (remove) within fullMap.clickPx of the current waypoint, else the new waypoint. */
export function clickWaypoint(v: MapView, target: Readonly<MapPoint> | null, sx: number, sy: number): MapPoint | null {
  if (target) {
    const [tx, ty] = mapToScreen(v, target.x, target.z);
    if (Math.hypot(tx - sx, ty - sy) <= C.clickPx) return null;
  }
  const [x, z] = mapToWorld(v, sx, sy);
  return { x, z };
}

/** A street name wanting to sit on a screen segment; smaller `order` placed first. */
export interface LabelCandidate {
  text: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  order: number;
}
/** Placed name: centre, angle (rad, never upside down), box w × h px. */
export interface Label {
  text: string;
  x: number;
  y: number;
  angle: number;
  w: number;
  h: number;
}

/** Corners of a label's box (x, y × 4). */
export function labelCorners(l: Label): number[] {
  const [c, s] = [Math.cos(l.angle), Math.sin(l.angle)];
  const [ux, uy, vx, vy] = [(c * l.w) / 2, (s * l.w) / 2, (-s * l.h) / 2, (c * l.h) / 2];
  return [l.x - ux - vx, l.y - uy - vy, l.x + ux - vx, l.y + uy - vy, l.x + ux + vx, l.y + uy + vy, l.x - ux + vx, l.y - uy + vy];
}

/** Separating axes of two label boxes. */
export function labelsOverlap(a: Label, b: Label): boolean {
  const [pa, pb] = [labelCorners(a), labelCorners(b)];
  for (const angle of [a.angle, a.angle + Math.PI / 2, b.angle, b.angle + Math.PI / 2]) {
    const [ux, uy] = [Math.cos(angle), Math.sin(angle)];
    const proj = (p: number[]) => [0, 2, 4, 6].map((i) => p[i]! * ux + p[i + 1]! * uy);
    const [qa, qb] = [proj(pa), proj(pb)];
    if (Math.max(...qa) <= Math.min(...qb) || Math.max(...qb) <= Math.min(...qa)) return false;
  }
  return true;
}

/** Street names on their segments (text must fit), readable, inside the w × h view, never overlapping, the same name
 *  not again within fullMap.label.repeatPx. Overlap tests only against labels sharing a 64 px grid cell. */
export function placeLabels(cands: readonly LabelCandidate[], measure: (text: string) => number, w: number, h: number): Label[] {
  const { height, pad, repeatPx } = C.label;
  const CELL = 64;
  const grid = new Map<number, Label[]>();
  const byName = new Map<string, Label[]>();
  const placed: Label[] = [];
  for (const c of [...cands].sort((a, b) => a.order - b.order)) {
    const lw = measure(c.text) + pad;
    if (lw > Math.hypot(c.x1 - c.x0, c.y1 - c.y0)) continue;
    let angle = Math.atan2(c.y1 - c.y0, c.x1 - c.x0);
    if (angle > Math.PI / 2) angle -= Math.PI;
    else if (angle <= -Math.PI / 2) angle += Math.PI;
    const l: Label = { text: c.text, x: (c.x0 + c.x1) / 2, y: (c.y0 + c.y1) / 2, angle, w: lw, h: height };
    const p = labelCorners(l);
    const xs = [p[0]!, p[2]!, p[4]!, p[6]!], ys = [p[1]!, p[3]!, p[5]!, p[7]!];
    if (Math.min(...xs) < 0 || Math.max(...xs) > w || Math.min(...ys) < 0 || Math.max(...ys) > h) continue;
    if (byName.get(l.text)?.some((o) => Math.hypot(o.x - l.x, o.y - l.y) < repeatPx)) continue;
    const cells: number[] = [];
    for (let i = Math.floor(Math.min(...xs) / CELL); i <= Math.floor(Math.max(...xs) / CELL); i++)
      for (let j = Math.floor(Math.min(...ys) / CELL); j <= Math.floor(Math.max(...ys) / CELL); j++) cells.push(i * 4096 + j);
    if (cells.some((k) => grid.get(k)?.some((o) => labelsOverlap(o, l)))) continue;
    for (const k of cells) grid.get(k)?.push(l) ?? grid.set(k, [l]);
    byName.get(l.text)?.push(l) ?? byName.set(l.text, [l]);
    placed.push(l);
  }
  return placed;
}

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export class FullMap {
  /** World box of the map: RACE_BBOX + 100 m (beyond the race area the map shows `outside`). */
  readonly extent: Box;
  /** Current view (CSS px). */
  readonly view: MapView = { cx: 0, cz: 0, mpp: C.metersPerPx[1], w: 1, h: 1 };
  /** baseMs = whole-map raster on open, detailMs = last vector redraw, drawMs = last frame, labels = names drawn. */
  readonly stats = { baseMs: 0, detailMs: 0, drawMs: 0, labels: 0 };
  private readonly cls: Uint8Array; // per way: roadClass | BRIDGE, or SKIP
  private readonly width: Float32Array; // per way, m (RoadBuilder.roadWidth: same as the 3D streets and the minimap)
  private readonly wayBox: Float32Array;
  private readonly parkBox: Float32Array;
  private readonly waterBox: Float32Array;
  private root?: HTMLDivElement;
  private canvas?: HTMLCanvasElement;
  private g?: CanvasRenderingContext2D;
  private base?: OffscreenCanvas;
  private detail?: { canvas: OffscreenCanvas; view: MapView };
  private shown = false;
  private dirty = true;
  private movedAt = -Infinity;
  private lastWheel = -Infinity;
  private press?: { x: number; y: number; cx: number; cz: number; drag: boolean };
  private gps: GpsView = NO_GPS;
  private route: Float32Array | null = null; // last drawn (Gps replaces the array on each search)
  private target: Readonly<MapPoint> | null = null;
  private player = { x: 0, z: 0, yaw: 0 };
  private readonly textWidth = new Map<string, number>();

  constructor(
    readonly graph: RoadGraph,
    readonly water: WaterData | undefined,
    /** A click on the map: the new waypoint, or null (removed). */
    readonly onWaypoint: (p: MapPoint | null) => void,
  ) {
    const { ways, kinds, names } = graph.file;
    this.cls = new Uint8Array(ways.length);
    this.width = new Float32Array(ways.length);
    this.wayBox = new Float32Array(4 * ways.length);
    ways.forEach((w, k) => {
      const [kind, flags, lanes, name, dm] = [kinds[w[0]!]!, w[1]!, w[2]!, w[3]!, w[4]!];
      this.cls[k] = flags & (WayFlag.sidewalk | WayFlag.crossing) ? SKIP : roadClass(kind) | (flags & WayFlag.bridge ? BRIDGE : 0);
      const facts = { kind, oneway: !!(flags & WayFlag.oneway), roundabout: !!(flags & WayFlag.roundabout) };
      const h = (this.width[k] = roadWidth({ ...facts, ...(name >= 0 && { name: names[name]! }), ...(dm && { width: dm / 10 }), ...(lanes && { lanes }) })) / 2;
      let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
      for (let i = WAY_HEADER; i < w.length; i++) {
        const [px, pz] = [graph.x[w[i]!]!, graph.z[w[i]!]!];
        (x0 = Math.min(x0, px)), (x1 = Math.max(x1, px)), (z0 = Math.min(z0, pz)), (z1 = Math.max(z1, pz));
      }
      this.wayBox.set([x0 - h, z0 - h, x1 + h, z1 + h], 4 * k);
    });
    const flat = (rings: XZ[]) => {
      const start = new Uint32Array(rings.length + 1);
      rings.forEach((r, k) => (start[k + 1] = start[k]! + r.length / 2));
      return { pts: new Float32Array(rings.flat()), start };
    };
    this.parkBox = boxes(flat(water?.parks ?? []), () => 0);
    this.waterBox = boxes(flat((water?.polygons ?? []).map((p) => p.outer)), () => 0);
    const xs = bboxCorners().map((c) => c[0]), zs = bboxCorners().map((c) => c[1]);
    this.extent = [Math.min(...xs) - 100, Math.min(...zs) - 100, Math.max(...xs) + 100, Math.max(...zs) + 100];
  }

  get isOpen(): boolean {
    return this.shown;
  }

  /** M: shows the map (main.ts then releases the pointer when isOpen); `metersPerPx` (URL ?map=…) = start zoom around
   *  the player, else the whole map. */
  open(f: HudFrame, metersPerPx?: number): void {
    this.dom();
    this.shown = true;
    this.root!.hidden = false;
    this.resize();
    const v = this.view, e = this.extent;
    this.player = { x: f.x, z: f.z, yaw: f.bodyYaw };
    if (metersPerPx) Object.assign(v, { mpp: clamp(metersPerPx, ...C.metersPerPx), cx: f.x, cz: f.z });
    else Object.assign(v, { mpp: clamp(Math.max((e[2] - e[0]) / v.w, (e[3] - e[1]) / v.h), ...C.metersPerPx), cx: (e[0] + e[2]) / 2, cz: (e[1] + e[3]) / 2 });
    const t0 = performance.now();
    const bm = C.baseMpp;
    this.base = new OffscreenCanvas(Math.ceil((e[2] - e[0]) / bm), Math.ceil((e[3] - e[1]) / bm));
    const g = this.base.getContext('2d')!;
    g.setTransform(1 / bm, 0, 0, 1 / bm, -e[0] / bm, -e[1] / bm);
    this.paint(g, e, bm);
    this.stats.baseMs = performance.now() - t0;
    this.detail = undefined;
    this.movedAt = -Infinity;
    this.dirty = true;
  }

  close(): void {
    if (!this.shown) return;
    this.shown = false;
    this.root!.hidden = true;
    this.base = this.detail = this.press = undefined; // ≈ 9 MB + a screen of pixels back
  }

  /** Every frame while open (player arrow, route). */
  update(f: HudFrame, gps: GpsView): void {
    if (!this.shown) return;
    const p = this.player;
    if (gps.route !== this.route || gps.target !== this.target || f.x !== p.x || f.z !== p.z || f.bodyYaw !== p.yaw) this.dirty = true;
    this.gps = gps;
    this.route = gps.route;
    this.target = gps.target;
    this.player = { x: f.x, z: f.z, yaw: f.bodyYaw };
    const v = this.view, dpr = this.dpr();
    const vector = v.mpp < C.baseMpp * dpr; // the base raster would be magnified on the device: redraw from vectors
    const settled = performance.now() - this.movedAt >= C.settleMs;
    const d = this.detail?.view;
    if (settled && vector && !(d && d.cx === v.cx && d.cz === v.cz && d.mpp === v.mpp && d.w === v.w && d.h === v.h)) this.redrawDetail();
    if (!this.dirty) return void (this.stats.drawMs = 0);
    this.dirty = false;
    const t0 = performance.now();
    const g = this.g!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = col.outside;
    g.fillRect(0, 0, v.w, v.h);
    const e = this.extent;
    const [bx, by] = mapToScreen(v, e[0], e[1]);
    const k = C.baseMpp / v.mpp;
    g.drawImage(this.base!, bx, by, this.base!.width * k, this.base!.height * k);
    if (this.detail && vector) {
      const dv = this.detail.view;
      const [dx, dy] = mapToScreen(v, ...mapToWorld(dv, 0, 0));
      g.drawImage(this.detail.canvas, dx, dy, (dv.w * dv.mpp) / v.mpp, (dv.h * dv.mpp) / v.mpp);
    }
    if (gps.route) {
      g.save();
      g.setTransform(dpr / v.mpp, 0, 0, dpr / v.mpp, dpr * (v.w / 2 - v.cx / v.mpp), dpr * (v.h / 2 - v.cz / v.mpp));
      drawRoute(g, gps.route, v.mpp, minimap.routeWidth);
      g.restore();
    }
    if (gps.target) drawWaypoint(g, ...mapToScreen(v, gps.target.x, gps.target.z));
    drawArrow(g, ...mapToScreen(v, f.x, f.z), -f.bodyYaw, 20);
    this.stats.drawMs = performance.now() - t0;
  }

  /** A click at view px (sx, sy) (pointer handler; tests pass the waypoint). */
  click(sx: number, sy: number, target = this.gps.target): void {
    this.onWaypoint(clickWaypoint(this.view, target, sx, sy));
  }

  /** Street names for a view (text widths from `measure`): the longest in-view segment of every named way.
   *  ponytail: straight text on one segment per OSM way piece, so curved streets made of short segments go unnamed;
   *  lay the text along the polyline if players miss those names. */
  labels(v: MapView, measure: (text: string) => number): Label[] {
    const { ways, names } = this.graph.file;
    const { x, z } = this.graph;
    const r: Box = [...mapToWorld(v, 0, 0), ...mapToWorld(v, v.w, v.h)];
    const cands: LabelCandidate[] = [];
    ways.forEach((w, k) => {
      const c = this.cls[k]!;
      if (w[3]! < 0 || c === SKIP || !hit(this.wayBox, k, r)) return;
      let best = 0, seg: number[] | undefined;
      for (let i = WAY_HEADER; i + 1 < w.length; i++) {
        const [a, b] = [w[i]!, w[i + 1]!];
        const [mx, mz] = [(x[a]! + x[b]!) / 2, (z[a]! + z[b]!) / 2];
        const len = Math.hypot(x[b]! - x[a]!, z[b]! - z[a]!);
        if (len > best && mx > r[0] && mx < r[2] && mz > r[1] && mz < r[3]) (best = len), (seg = [a, b]);
      }
      if (!seg) return;
      const [x0, y0] = mapToScreen(v, x[seg[0]!]!, z[seg[0]!]!), [x1, y1] = mapToScreen(v, x[seg[1]!]!, z[seg[1]!]!);
      cands.push({ text: names[w[3]!]!, x0, y0, x1, y1, order: -((c & 7) * 1e5 + best) }); // major roads, long segments first
    });
    return placeLabels(cands, measure, v.w, v.h);
  }

  private dpr() {
    return Math.min(2, devicePixelRatio);
  }

  /** Map layers over the world box r at mpp m per px, in g's current (world) transform. */
  private paint(g: Ctx, r: Box, mpp: number) {
    g.fillStyle = col.outside;
    g.fillRect(r[0], r[1], r[2] - r[0], r[3] - r[1]);
    g.save();
    clipToArea(g);
    g.fillStyle = col.ground;
    g.fillRect(r[0], r[1], r[2] - r[0], r[3] - r[1]);
    const parks = new Path2D();
    (this.water?.parks ?? []).forEach((ring, k) => hit(this.parkBox, k, r) && trace(parks, ring, 0, ring.length / 2, true));
    g.fillStyle = col.park;
    g.fill(parks);
    const water = new Path2D();
    (this.water?.polygons ?? []).forEach((p, k) => {
      if (hit(this.waterBox, k, r)) for (const ring of [p.outer, ...(p.holes ?? [])]) trace(water, ring, 0, ring.length / 2, true);
    });
    g.fillStyle = col.water;
    g.fill(water, 'evenodd');

    // Roads: one path per (draw order, colour, width); bridge casings under all decks; small paths only when close.
    const small = mpp <= C.footMaxMpp;
    const groups = new Map<string, { order: number; colour: string; w: number; path: Path2D }>();
    const add = (order: number, colour: string, w: number, k: number) => {
      const id = `${order}|${colour}|${w}`;
      let grp = groups.get(id);
      if (!grp) groups.set(id, (grp = { order, colour, w, path: new Path2D() }));
      const way = this.graph.file.ways[k]!;
      grp.path.moveTo(this.graph.x[way[WAY_HEADER]!]!, this.graph.z[way[WAY_HEADER]!]!);
      for (let i = WAY_HEADER + 1; i < way.length; i++) grp.path.lineTo(this.graph.x[way[i]!]!, this.graph.z[way[i]!]!);
    };
    for (let k = 0; k < this.cls.length; k++) {
      const c = this.cls[k]!;
      const cl = c & 7;
      if (c === SKIP || (!small && (cl === RoadClass.foot || cl === RoadClass.service || cl === RoadClass.steps)) || !hit(this.wayBox, k, r)) continue;
      const w = Math.round(Math.max(this.width[k]!, MIN_PX[cl]! * mpp) * 10) / 10;
      if (c & BRIDGE) add(10, col.bridgeCasing, w + 3 * mpp, k);
      add(c & BRIDGE ? 11 + cl : cl, ROAD_COLOUR[cl]!, w, k);
    }
    g.lineCap = g.lineJoin = 'round';
    for (const { order, colour, w, path } of [...groups.values()].sort((a, b) => a.order - b.order)) {
      const steps = order === RoadClass.steps || order === 11 + RoadClass.steps;
      g.setLineDash(steps ? [Math.max(0.8, 2 * mpp), Math.max(0.6, 1.5 * mpp)] : []);
      g.strokeStyle = colour;
      g.lineWidth = w;
      g.stroke(path);
    }
    g.setLineDash([]);
    g.restore();
  }

  /** The current view from vectors at its exact scale + street names (where the base raster would look soft). */
  private redrawDetail() {
    const t0 = performance.now();
    const v = { ...this.view }, dpr = this.dpr();
    const canvas = this.detail?.canvas.width === Math.round(v.w * dpr) && this.detail.canvas.height === Math.round(v.h * dpr)
      ? this.detail.canvas
      : new OffscreenCanvas(Math.round(v.w * dpr), Math.round(v.h * dpr));
    const g = canvas.getContext('2d')!;
    g.setTransform(dpr / v.mpp, 0, 0, dpr / v.mpp, dpr * (v.w / 2 - v.cx / v.mpp), dpr * (v.h / 2 - v.cz / v.mpp));
    this.paint(g, [...mapToWorld(v, 0, 0), ...mapToWorld(v, v.w, v.h)], v.mpp);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const labels = v.mpp <= C.labelMaxMpp ? this.labels(v, (t) => this.measure(g, t)) : [];
    g.font = C.label.font;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineJoin = 'round';
    g.lineWidth = 3;
    g.strokeStyle = 'rgba(0, 0, 0, 0.85)';
    g.fillStyle = '#fff';
    for (const l of labels) {
      g.setTransform(dpr * Math.cos(l.angle), dpr * Math.sin(l.angle), -dpr * Math.sin(l.angle), dpr * Math.cos(l.angle), dpr * l.x, dpr * l.y);
      g.strokeText(l.text, 0, 0.5);
      g.fillText(l.text, 0, 0.5);
    }
    this.detail = { canvas, view: v };
    this.dirty = true;
    this.stats.labels = labels.length;
    this.stats.detailMs = performance.now() - t0;
  }

  private measure(g: Ctx, text: string): number {
    let w = this.textWidth.get(text);
    if (w === undefined) {
      g.font = C.label.font;
      this.textWidth.set(text, (w = g.measureText(text).width));
    }
    return w;
  }

  private moved() {
    const v = this.view, e = this.extent;
    v.cx = clamp(v.cx, e[0], e[2]);
    v.cz = clamp(v.cz, e[1], e[3]);
    this.movedAt = performance.now();
    this.dirty = true;
  }

  private resize() {
    const dpr = this.dpr();
    Object.assign(this.view, { w: innerWidth, h: innerHeight });
    this.canvas!.width = Math.round(innerWidth * dpr);
    this.canvas!.height = Math.round(innerHeight * dpr);
    this.dirty = true;
  }

  /** DOM on first open: full-screen canvas, hint line, OSM credit; pointer + wheel handlers. */
  private dom() {
    if (this.root) return;
    const root = (this.root = document.createElement('div'));
    Object.assign(root.style, { position: 'fixed', inset: '0', zIndex: '20', background: col.outside, cursor: 'grab' } satisfies Partial<CSSStyleDeclaration>);
    const canvas = (this.canvas = document.createElement('canvas'));
    Object.assign(canvas.style, { width: '100%', height: '100%', display: 'block', touchAction: 'none' } satisfies Partial<CSSStyleDeclaration>);
    this.g = canvas.getContext('2d')!;
    const hint = document.createElement('div');
    hint.className = 'hud-box';
    hint.textContent = 'Nhấp: đặt điểm đến · nhấp lại: bỏ · kéo: di chuyển · lăn chuột: phóng to / thu nhỏ · M / Esc: đóng';
    Object.assign(hint.style, { position: 'absolute', left: '50%', bottom: '16px', transform: 'translateX(-50%)', padding: '6px 14px', whiteSpace: 'nowrap' } satisfies Partial<CSSStyleDeclaration>);
    const credit = document.createElement('div');
    credit.textContent = 'Bản đồ © OpenStreetMap contributors';
    Object.assign(credit.style, { position: 'absolute', right: '6px', bottom: '4px', font: '11px system-ui, sans-serif', color: 'rgba(255, 255, 255, 0.85)', textShadow: '0 0 3px #000', pointerEvents: 'none' } satisfies Partial<CSSStyleDeclaration>);
    root.append(canvas, hint, credit);
    document.body.append(root);

    canvas.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      canvas.setPointerCapture(e.pointerId);
      this.press = { x: e.offsetX, y: e.offsetY, cx: this.view.cx, cz: this.view.cz, drag: false };
    });
    canvas.addEventListener('pointermove', (e) => {
      const p = this.press;
      if (!p || (!p.drag && Math.hypot(e.offsetX - p.x, e.offsetY - p.y) < C.dragPx)) return;
      p.drag = true;
      root.style.cursor = 'grabbing';
      this.view.cx = p.cx - (e.offsetX - p.x) * this.view.mpp;
      this.view.cz = p.cz - (e.offsetY - p.y) * this.view.mpp;
      this.moved();
    });
    const release = (e: PointerEvent) => {
      if (this.press && !this.press.drag && e.type === 'pointerup') this.click(e.offsetX, e.offsetY);
      this.press = undefined;
      root.style.cursor = 'grab';
    };
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);
    canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        if (!e.deltaY || e.timeStamp - this.lastWheel < C.wheelGapMs) return;
        this.lastWheel = e.timeStamp;
        zoomAt(this.view, e.offsetX, e.offsetY, C.wheelZoom ** Math.sign(e.deltaY));
        this.moved();
      },
      { passive: false },
    );
    addEventListener('resize', () => this.shown && (this.resize(), this.moved()));
  }
}
