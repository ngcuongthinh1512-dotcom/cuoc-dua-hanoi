// Phase 5 track A (docs/plans/phase5.md §6 A): rectangular minimap, bottom-left (SPEC §17.3, STYLE_GUIDE): canvas 2D,
// turns with the camera (heading up), N marker on the rim, zooms out with speed (minimap.metersPerPx), GPS route +
// waypoint (clamped to the rim when outside), player arrow. No NPCs, no bikes, no clue boxes (SPEC §6.6, §8.2, §17.5).
// Each frame: the raster tiles of the chunks in view (ui/MapTiles.ts, nearest first) blitted under one rotation, then
// the route, the waypoint, N and the arrow in screen space. Nothing is drawn when nothing moved.
import { bikeTopSpeed, hud, minimap as C, movement } from '../config.ts';
import { CHUNK_SIZE, type ChunkKey } from '../geo/chunkData.ts';
import { type Box, type MapTiles, tileBox } from './MapTiles.ts';
import type { GpsView, HudFrame } from './types.ts';

const col = C.colours;

/** m per CSS px at a horizontal speed (m/s): metersPerPx[0] up to walking speed (movement.footSpeed, like the GTA V
 *  radar on foot: no zoom pumping at every stop), → [1] at bikeTopSpeed() and above, linear in between. */
export function targetMpp(speed: number): number {
  const [a, b] = C.metersPerPx;
  const [lo, hi] = [movement.footSpeed, bikeTopSpeed()];
  const t = hi > lo ? (speed - lo) / (hi - lo) : +(speed > lo);
  return a + (b - a) * Math.min(1, Math.max(0, t));
}

/** The player's (x, z) drawn at (ax, ay) px, `heading` (HudFrame convention) pointing up, mpp m per px. */
export interface View {
  x: number;
  z: number;
  heading: number;
  mpp: number;
  ax: number;
  ay: number;
}

/** World → view px. Canvas rotate(heading) of the north-up map: the camera's forward (−sin h, −cos h) lands on up. */
export function toScreen(v: View, x: number, z: number): [number, number] {
  const c = Math.cos(v.heading), s = Math.sin(v.heading);
  const dx = (x - v.x) / v.mpp, dz = (z - v.z) / v.mpp;
  return [v.ax + dx * c - dz * s, v.ay + dx * s + dz * c];
}

export function toWorld(v: View, sx: number, sy: number): [number, number] {
  const c = Math.cos(v.heading), s = Math.sin(v.heading);
  const dx = (sx - v.ax) * v.mpp, dy = (sy - v.ay) * v.mpp;
  return [v.x + dx * c + dy * s, v.z - dx * s + dy * c];
}

/** Where the ray from (ax, ay) (inside) along (dx, dy) leaves the rectangle [x0, x1] × [y0, y1]. */
export function rimPoint(ax: number, ay: number, dx: number, dy: number, x0: number, y0: number, x1: number, y1: number): [number, number] {
  let t = Infinity;
  if (dx) t = Math.min(t, ((dx > 0 ? x1 : x0) - ax) / dx);
  if (dy) t = Math.min(t, ((dy > 0 ? y1 : y0) - ay) / dy);
  return Number.isFinite(t) ? [ax + dx * t, ay + dy * t] : [ax, ay];
}

/** (px, py) if inside the rectangle, else where the line from the anchor to it crosses the rim. */
export function clampToRim(ax: number, ay: number, px: number, py: number, x0: number, y0: number, x1: number, y1: number): [number, number] {
  if (px >= x0 && px <= x1 && py >= y0 && py <= y1) return [px, py];
  return rimPoint(ax, ay, px - ax, py - ay, x0, y0, x1, y1);
}

/** (px, py), or the point nearest it on the line from the anchor (ax, ay) to it that is at least r from (nx, ny). */
export function clearOf(ax: number, ay: number, px: number, py: number, nx: number, ny: number, r: number): [number, number] {
  let t = 1;
  while (t > 0 && Math.hypot(ax + (px - ax) * t - nx, ay + (py - ay) * t - ny) < r) t -= 0.02;
  return [ax + (px - ax) * t, ay + (py - ay) * t];
}

const span = (p: number[], ux: number, uz: number) => {
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < p.length; i += 2) (lo = Math.min(lo, p[i]! * ux + p[i + 1]! * uz)), (hi = Math.max(hi, p[i]! * ux + p[i + 1]! * uz));
  return [lo, hi] as const;
};

/** Separating axes: does the (convex) quad q (x, z × 4, a rectangle) overlap the box b with some area? */
function quadMeetsBox(q: number[], b: Box): boolean {
  const sq = [b[0], b[1], b[2], b[1], b[2], b[3], b[0], b[3]];
  for (const [ux, uz] of [[1, 0], [0, 1], [q[2]! - q[0]!, q[3]! - q[1]!], [q[6]! - q[0]!, q[7]! - q[1]!]] as const) {
    const [a0, a1] = span(q, ux, uz), [b0, b1] = span(sq, ux, uz);
    if (a1 <= b0 || b1 <= a0) return false;
  }
  return true;
}

/** Chunks under a w × h px view, nearest the player first. */
export function visibleChunks(v: View, w: number, h: number): ChunkKey[] {
  const q = [[0, 0], [w, 0], [w, h], [0, h]].flatMap(([sx, sy]) => toWorld(v, sx!, sy!));
  const cell = (a: number) => Math.floor(a / CHUNK_SIZE);
  const xs = q.filter((_, i) => i % 2 === 0), zs = q.filter((_, i) => i % 2 === 1);
  const out: [ChunkKey, number][] = [];
  for (let i = cell(Math.min(...xs)); i <= cell(Math.max(...xs)); i++) {
    for (let j = cell(Math.min(...zs)); j <= cell(Math.max(...zs)); j++) {
      const b: Box = [i * CHUNK_SIZE, j * CHUNK_SIZE, (i + 1) * CHUNK_SIZE, (j + 1) * CHUNK_SIZE];
      if (quadMeetsBox(q, b)) out.push([`${i}_${j}`, Math.hypot((i + 0.5) * CHUNK_SIZE - v.x, (j + 0.5) * CHUNK_SIZE - v.z)]);
    }
  }
  return out.sort((a, b) => a[1] - b[1]).map(([k]) => k);
}

/** Player arrow (tip up, notched base), px. */
export function drawArrow(g: CanvasRenderingContext2D, x: number, y: number, angle: number, size: number) {
  g.save();
  g.translate(x, y);
  g.rotate(angle);
  g.scale(size / 18, size / 18);
  g.beginPath();
  g.moveTo(0, -10);
  g.lineTo(7, 8);
  g.lineTo(0, 4);
  g.lineTo(-7, 8);
  g.closePath();
  g.fillStyle = col.player;
  g.strokeStyle = col.playerEdge;
  g.lineWidth = 2;
  g.lineJoin = 'round';
  g.stroke();
  g.fill();
  g.restore();
}

/** Waypoint marker (GTA purple disc, white ring), px. */
export function drawWaypoint(g: CanvasRenderingContext2D, x: number, y: number) {
  g.beginPath();
  g.arc(x, y, 6, 0, 2 * Math.PI);
  g.fillStyle = col.route;
  g.strokeStyle = '#fff';
  g.lineWidth = 2;
  g.fill();
  g.stroke();
}

/** GPS route (x, z list) as a purple line on a dark casing, in the current (world) transform; width px at mpp m per px. */
export function drawRoute(g: CanvasRenderingContext2D, route: Float32Array, mpp: number, width: number) {
  if (route.length < 4) return;
  g.beginPath();
  g.moveTo(route[0]!, route[1]!);
  for (let i = 2; i < route.length; i += 2) g.lineTo(route[i]!, route[i + 1]!);
  g.lineCap = g.lineJoin = 'round';
  g.strokeStyle = col.routeCasing;
  g.lineWidth = (width + 4) * mpp;
  g.stroke();
  g.strokeStyle = col.route;
  g.lineWidth = width * mpp;
  g.stroke();
}

const N_RADIUS = 8; // px
const WAYPOINT_INSET = 9; // px from the rim

export class Minimap {
  /** Root element (D may hide it: loading, free-fly). */
  readonly el: HTMLDivElement;
  /** drawMs = last redraw (0 when nothing moved). */
  readonly stats = { drawMs: 0 };
  private readonly canvas: HTMLCanvasElement;
  private readonly g: CanvasRenderingContext2D;
  private mpp: number = C.metersPerPx[0];
  private last: unknown[] = [];
  private missing = false; // a tile in view was over the raster budget: draw again next frame

  constructor(readonly tiles: MapTiles) {
    const { width, height } = hud.minimap;
    this.el = document.createElement('div');
    this.el.className = 'hud-box';
    Object.assign(this.el.style, {
      position: 'fixed', left: `${hud.margin}px`, bottom: `${hud.margin}px`, width: `${width}px`, height: `${height}px`,
      overflow: 'hidden', background: col.outside, boxShadow: '0 0 0 2px rgba(0, 0, 0, 0.6), 0 2px 10px rgba(0, 0, 0, 0.45)',
    } satisfies Partial<CSSStyleDeclaration>);
    this.canvas = document.createElement('canvas');
    Object.assign(this.canvas.style, { width: '100%', height: '100%', display: 'block' });
    this.el.append(this.canvas);
    this.g = this.canvas.getContext('2d')!;
    document.body.append(this.el);
  }

  /** Every frame in player mode. */
  update(f: HudFrame, gps: GpsView, dt: number): void {
    const target = targetMpp(f.speed);
    this.mpp += (target - this.mpp) * (1 - Math.exp(-C.zoomSharpness * dt));
    if (Math.abs(target - this.mpp) < 1e-4) this.mpp = target;
    const { width: W, height: H } = hud.minimap;
    const dpr = Math.min(2, devicePixelRatio);
    const sig = [f.x, f.z, f.heading, f.bodyYaw, this.mpp, gps.route, gps.target?.x, gps.target?.z, dpr, this.tiles.stats.vectors];
    if (!this.missing && sig.every((s, i) => s === this.last[i])) return void (this.stats.drawMs = 0);
    this.last = sig;
    const t0 = performance.now();
    const { canvas, g } = this;
    const [cw, ch] = [Math.round(W * dpr), Math.round(H * dpr)];
    if (canvas.width !== cw || canvas.height !== ch) (canvas.width = cw), (canvas.height = ch); // a new canvas is 300 × 150

    const v: View = { x: f.x, z: f.z, heading: f.heading, mpp: this.mpp, ax: W / 2, ay: H * C.anchorY };
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = col.outside;
    g.fillRect(0, 0, W, H);
    g.save();
    g.translate(v.ax, v.ay);
    g.rotate(v.heading);
    g.scale(1 / v.mpp, 1 / v.mpp);
    g.translate(-v.x, -v.z);
    g.imageSmoothingQuality = 'high'; // tiles are ≈ 1 m/px, shown at 0.8–1.6 m/px and turned: smooth edges
    this.tiles.frame();
    this.missing = false;
    for (const key of visibleChunks(v, W, H)) {
      const t = this.tiles.tile(key);
      if (!t) {
        this.missing ||= this.tiles.has(key); // over the raster budget: next frame (layers still streaming: sig)
        continue;
      }
      const b = tileBox(key);
      g.drawImage(t, b[0], b[1], b[2] - b[0], b[3] - b[1]);
    }
    if (gps.route) drawRoute(g, gps.route, v.mpp, C.routeWidth);
    g.restore();

    // N where the ray north from the player meets the rim (north on screen = (sin h, −cos h)).
    const m = N_RADIUS + 3;
    const [nx, ny] = rimPoint(v.ax, v.ay, Math.sin(v.heading), -Math.cos(v.heading), m, m, W - m, H - m);
    if (gps.target) {
      const i = WAYPOINT_INSET;
      const [px, py] = clampToRim(v.ax, v.ay, ...toScreen(v, gps.target.x, gps.target.z), i, i, W - i, H - i);
      drawWaypoint(g, ...clearOf(v.ax, v.ay, px, py, nx, ny, N_RADIUS + 9)); // under N: pulled in along its bearing
    }
    g.beginPath();
    g.arc(nx, ny, N_RADIUS, 0, 2 * Math.PI);
    g.fillStyle = 'rgba(0, 0, 0, 0.75)';
    g.fill();
    g.fillStyle = '#fff';
    g.font = `bold 11px system-ui, -apple-system, "Segoe UI", sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('N', nx, ny + 0.5);
    drawArrow(g, v.ax, v.ay, v.heading - f.bodyYaw, 18);
    this.stats.drawMs = performance.now() - t0;
  }
}
