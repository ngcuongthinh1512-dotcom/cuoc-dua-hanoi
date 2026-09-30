// Phase 5 track A (docs/plans/phase5.md §6 A): one raster tile per chunk, drawn lazily from the chunk's MapVectors (≤
// minimap.rasterPerFrame per frame, only the ones the minimap shows) and kept in an LRU (minimap.maxTiles); the minimap
// blits them. North up, x → right, z (south) → down. A tile covers its chunk + minimap.tilePad m and draws the pieces of
// the 3 × 3 chunks around it that reach into it (buildings / stairs / bridge chains are stored whole in one chunk), so
// neighbouring tiles overlap with identical pixels: no seams. Canvas 2D (OffscreenCanvas), no WebGL, no DOM.
import { minimap as C } from '../config.ts';
import { type ChunkKey, chunkBounds, type WaterData, type XZ } from '../geo/chunkData.ts';
import { bboxCorners } from '../world/Bounds.ts';
import { BRIDGE, type MapVectors, type Pieces, RoadClass } from '../world/mapVectors.ts';

/** minX, minZ, maxX, maxZ (m). */
export type Box = [number, number, number, number];
type Ctx = OffscreenCanvasRenderingContext2D;

const col = C.colours;
const ROAD_COLOUR = [col.foot, col.pedestrian, col.service, col.minor, col.major, col.steps];

const AREA = bboxCorners(); // RACE_BBOX in world m (a slight trapezoid): the maps show `outside` beyond it

/** A w × h canvas off the page: OffscreenCanvas, or a detached <canvas> where there is none (Safari < 16.4). Only the
 *  2D API both share is used on it (no transferToImageBitmap / convertToBlob). */
export function offscreen(w: number, h: number): OffscreenCanvas {
  if (typeof OffscreenCanvas === 'function') return new OffscreenCanvas(w, h);
  return Object.assign(document.createElement('canvas'), { width: w, height: h }) as unknown as OffscreenCanvas;
}

/** Clips g to the race area (the player cannot leave it: the maps end there). */
export function clipToArea(g: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D) {
  g.beginPath();
  for (const [x, z] of AREA) g.lineTo(x, z);
  g.closePath();
  g.clip();
}

/** World rectangle a chunk's tile covers (its chunk + tilePad). */
export function tileBox(key: ChunkKey): Box {
  const b = chunkBounds(key);
  return [b.minX - C.tilePad, b.minZ - C.tilePad, b.maxX + C.tilePad, b.maxZ + C.tilePad];
}

/** The chunk and its 8 neighbours. */
export function neighbourhood(key: ChunkKey): ChunkKey[] {
  const [i, j] = key.split('_').map(Number) as [number, number];
  return [-1, 0, 1].flatMap((di) => [-1, 0, 1].map((dj) => `${i + di}_${j + dj}`));
}

/** Per-piece bounding boxes (4 floats each), grown by grow(k) m. */
export function boxes(p: Pieces, grow: (k: number) => number): Float32Array {
  const n = p.start.length - 1;
  const out = new Float32Array(4 * n);
  for (let k = 0; k < n; k++) {
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (let i = p.start[k]!; i < p.start[k + 1]!; i++) {
      const x = p.pts[2 * i]!, z = p.pts[2 * i + 1]!;
      (x0 = Math.min(x0, x)), (x1 = Math.max(x1, x)), (z0 = Math.min(z0, z)), (z1 = Math.max(z1, z));
    }
    const g = grow(k);
    out.set([x0 - g, z0 - g, x1 + g, z1 + g], 4 * k);
  }
  return out;
}

/** Does box k of bb overlap r? */
export const hit = (bb: ArrayLike<number>, k: number, r: Box) => bb[4 * k]! < r[2] && bb[4 * k + 2]! > r[0] && bb[4 * k + 1]! < r[3] && bb[4 * k + 3]! > r[1];

/** Adds points a … b − 1 of a flat x, z list to a path (world m). */
export function trace(path: Path2D, pts: ArrayLike<number>, a: number, b: number, close: boolean) {
  path.moveTo(pts[2 * a]!, pts[2 * a + 1]!);
  for (let i = a + 1; i < b; i++) path.lineTo(pts[2 * i]!, pts[2 * i + 1]!);
  if (close) path.closePath();
}

interface Entry {
  map: MapVectors;
  bb: Float32Array; // building ring boxes
  ab: Float32Array; // area ring boxes
  rb: Float32Array; // road boxes, grown by half the width
}

export class MapTiles {
  /** vectors = chunks with map layers, tiles = raster tiles held, rasterMs = last raster, rasters = total rasters. */
  readonly stats = { vectors: 0, tiles: 0, rasterMs: 0, rasters: 0 };
  private readonly vectors = new Map<ChunkKey, Entry>();
  private readonly raster = new Map<ChunkKey, OffscreenCanvas>(); // LRU: Map order = least recently used first
  private readonly waterBoxes: Float32Array;
  private budget = 0;

  /** `water` (water.json): the Seine + ponds drawn into every tile. */
  constructor(readonly water: WaterData | undefined) {
    const rings = water?.polygons ?? [];
    const flat = { pts: new Float32Array(rings.flatMap((p) => p.outer)), start: new Uint32Array(rings.length + 1) };
    rings.forEach((p, k) => (flat.start[k + 1] = flat.start[k]! + p.outer.length / 2));
    this.waterBoxes = boxes(flat, () => 0);
  }

  /** ChunkManager.onMap: the chunk's map layers (kept after the chunk unloads: a few KB each). */
  add(key: ChunkKey, map: MapVectors): void {
    if (this.vectors.has(key)) return; // a chunk streamed in again: same data
    const w = map.roads.width;
    this.vectors.set(key, { map, bb: boxes(map.buildings, () => 0), ab: boxes(map.areas, () => 0), rb: boxes(map.roads, (k) => w[k]! / 2) });
    for (const k of neighbourhood(key)) this.raster.delete(k); // may reach into these tiles: drawn again when shown
    Object.assign(this.stats, { vectors: this.vectors.size, tiles: this.raster.size });
  }

  /** Has the chunk's map layers (its tile can be drawn). */
  has(key: ChunkKey): boolean {
    return this.vectors.has(key);
  }

  /** Once per frame, before tile(): this frame's raster budget (minimap.rasterPerFrame). */
  frame(): void {
    this.budget = C.rasterPerFrame;
  }

  /** The chunk's tile (covering tileBox(key)), rasterised now if the frame budget allows; undefined = no map layers
   *  yet or over budget. Marks it recently used. */
  tile(key: ChunkKey): OffscreenCanvas | undefined {
    const held = this.raster.get(key);
    if (held) {
      this.raster.delete(key);
      this.raster.set(key, held);
      return held;
    }
    if (this.budget <= 0 || !this.vectors.has(key)) return undefined;
    this.budget--;
    const t0 = performance.now();
    let canvas: OffscreenCanvas | undefined;
    if (this.raster.size >= C.maxTiles) {
      const [old, c] = this.raster.entries().next().value!;
      this.raster.delete(old);
      canvas = c; // recycled
    }
    const px = Math.round(C.tilePx * Math.min(2, globalThis.devicePixelRatio ?? 1));
    if (canvas?.width !== px) canvas = offscreen(px, px);
    this.draw(canvas.getContext('2d')!, key, px);
    this.raster.set(key, canvas);
    Object.assign(this.stats, { tiles: this.raster.size, rasterMs: performance.now() - t0, rasters: this.stats.rasters + 1 });
    return canvas;
  }

  private draw(g: Ctx, key: ChunkKey, px: number) {
    const r = tileBox(key);
    const s = px / (r[2] - r[0]); // px per m
    g.setTransform(s, 0, 0, s, -r[0] * s, -r[1] * s);
    g.setLineDash([]);
    g.lineCap = g.lineJoin = 'round';
    g.fillStyle = col.outside;
    g.fillRect(r[0], r[1], r[2] - r[0], r[3] - r[1]);
    g.save();
    clipToArea(g);
    g.fillStyle = col.ground;
    g.fillRect(r[0], r[1], r[2] - r[0], r[3] - r[1]);
    const near = neighbourhood(key).flatMap((k) => this.vectors.get(k) ?? []);

    // Parks, grass, water (nonzero: holes wound the other way; water: even-odd per polygon set, islands are holes).
    for (const kind of [0, 1]) {
      const path = new Path2D();
      for (const e of near) {
        const a = e.map.areas;
        for (let k = 0; k < a.kind.length; k++) if (a.kind[k] === kind && hit(e.ab, k, r)) trace(path, a.pts, a.start[k]!, a.start[k + 1]!, true);
      }
      g.fillStyle = kind ? col.grass : col.park;
      g.fill(path);
    }
    const water = new Path2D();
    (this.water?.polygons ?? []).forEach((p, k) => {
      if (!hit(this.waterBoxes, k, r)) return;
      for (const ring of [p.outer, ...(p.holes ?? [])] as XZ[]) trace(water, ring, 0, ring.length / 2, true);
    });
    g.fillStyle = col.water;
    g.fill(water, 'evenodd');

    // Buildings + a 1 px edge between neighbours.
    const houses = new Path2D();
    for (const e of near) {
      const b = e.map.buildings;
      for (let k = 0; k + 1 < b.start.length; k++) if (hit(e.bb, k, r)) trace(houses, b.pts, b.start[k]!, b.start[k + 1]!, true);
    }
    g.fillStyle = col.building;
    g.fill(houses);
    g.strokeStyle = col.buildingEdge;
    g.lineWidth = 1 / s;
    g.stroke(houses);

    // Roads by class (foot → major, bigger over smaller at junctions), then bridge decks on a casing, then stairs.
    const px1 = 1 / s;
    this.strokeRoads(g, near, r, (k) => !(k & BRIDGE) && k !== RoadClass.steps, (k) => ROAD_COLOUR[k]!, px1, 0);
    this.strokeRoads(g, near, r, (k) => !!(k & BRIDGE), () => col.bridgeCasing, px1, 3 * px1);
    this.strokeRoads(g, near, r, (k) => !!(k & BRIDGE), (k) => ROAD_COLOUR[k & 7]!, px1, 0);
    g.setLineDash([0.8, 0.6]); // m: tread-like stripes across the flight
    this.strokeRoads(g, near, r, (k) => (k & 7) === RoadClass.steps, () => col.steps, px1, 0);
    g.setLineDash([]);
    g.restore();
  }

  /** Strokes the wanted road pieces, one path per (class, colour, width), smaller classes first. */
  private strokeRoads(g: Ctx, near: Entry[], r: Box, want: (kind: number) => boolean, colour: (kind: number) => string, minW: number, extra: number) {
    const groups = new Map<string, { order: number; colour: string; w: number; path: Path2D }>();
    for (const e of near) {
      const { kind, width, pts, start } = e.map.roads;
      for (let k = 0; k < kind.length; k++) {
        const kd = kind[k]!;
        if (!want(kd) || !hit(e.rb, k, r)) continue;
        const [c, w] = [colour(kd), Math.max(width[k]!, minW) + extra];
        const id = `${kd & 7}|${c}|${w}`;
        let grp = groups.get(id);
        if (!grp) groups.set(id, (grp = { order: kd & 7, colour: c, w, path: new Path2D() }));
        trace(grp.path, pts, start[k]!, start[k + 1]!, false);
      }
    }
    for (const { colour: c, w, path } of [...groups.values()].sort((a, b) => a.order - b.order)) {
      g.strokeStyle = c;
      g.lineWidth = w;
      g.stroke(path);
    }
  }
}
