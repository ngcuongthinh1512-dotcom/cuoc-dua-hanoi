// Phase 5 track A (docs/plans/phase5.md §6 A): the minimap layers of one chunk, extracted in the chunk worker from its
// ChunkData (the main thread never sees chunk JSON) and posted with BuildOut.map; ui/MapTiles.ts rasterises them lazily.
// Pure, DOM-free. Only track A reads this shape: it may change it freely (keep mapBuffers in step).
import { roads as R } from '../config.ts';
import type { ChunkData, XZ } from '../geo/chunkData.ts';
import type { BuildCtx } from './buildTypes.ts';
import { roadWidth } from './RoadBuilder.ts';

/** Flat pieces, world m: pts = x, z interleaved; piece k = pts[2·start[k] … 2·start[k + 1]) (start has n + 1 entries). */
export interface Pieces {
  pts: Float32Array;
  start: Uint32Array;
}

export interface MapVectors {
  /** Outer rings (ringArea > 0) + holes (< 0), as in the chunk: one nonzero fill cuts the holes, overlaps stay filled. */
  buildings: Pieces;
  /** Rings, same winding rule; kind 0 = park, 1 = grass. */
  areas: Pieces & { kind: Uint8Array };
  /** Centre polylines of roads, bridge decks, stairs; width = carriageway (RoadBuilder.roadWidth), m; kind = RoadClass
   *  (+ BRIDGE on a deck). */
  roads: Pieces & { width: Float32Array; kind: Uint8Array };
}

/** Road draw classes, drawn in this order (the full map uses them for the road graph's ways too). */
export const RoadClass = { foot: 0, pedestrian: 1, service: 2, minor: 3, major: 4, steps: 5 } as const;
export const BRIDGE = 8; // kind bit: bridge deck (drawn last, with a dark casing over the water)
const MAJOR = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary']);

export function roadClass(kind: string): number {
  if (kind === 'steps') return RoadClass.steps;
  if (MAJOR.has(kind)) return RoadClass.major;
  if (kind === 'service') return RoadClass.service;
  if (kind === 'pedestrian') return RoadClass.pedestrian;
  return R.footKinds.includes(kind) || kind === 'cycleway' ? RoadClass.foot : RoadClass.minor;
}

// Landmark outlines that are not buildings (a bridge deck would hide its road; fountains / artworks are open space).
const NOT_BUILDING = new Set(['bridge', 'fountain', 'artwork']);

class PieceList {
  readonly pts: number[] = [];
  readonly start: number[] = [0];
  add(xz: XZ) {
    for (const v of xz) this.pts.push(v);
    this.start.push(this.pts.length / 2);
  }
  done(): Pieces {
    return { pts: new Float32Array(this.pts), start: new Uint32Array(this.start) };
  }
}

/** The chunk's map layers (empty chunks too: their tile still shows the water). */
export function mapVectors(chunk: ChunkData, _ctx: BuildCtx): MapVectors {
  const buildings = new PieceList(), areas = new PieceList(), roads = new PieceList();
  const areaKind: number[] = [], width: number[] = [], kind: number[] = [];
  for (const b of chunk.buildings) if (!NOT_BUILDING.has(b.kind)) for (const r of [b.outer, ...(b.holes ?? [])]) buildings.add(r);
  for (const a of chunk.areas) for (const r of [a.outer, ...(a.holes ?? [])]) areas.add(r), areaKind.push(a.kind === 'park' ? 0 : 1);
  const road = (pts: XZ, w: number, k: number) => void (roads.add(pts), width.push(w), kind.push(k));
  for (const r of chunk.roads) road(r.pts, roadWidth(r), roadClass(r.kind));
  for (const b of chunk.bridges) if (!R.railKinds.includes(b.kind)) road(b.pts, roadWidth(b), roadClass(b.kind) | BRIDGE); // metro viaducts: not ours
  for (const s of chunk.stairs ?? []) road(s.pts, s.width ?? R.widthByKind.steps!, RoadClass.steps);
  return {
    buildings: buildings.done(),
    areas: { ...areas.done(), kind: new Uint8Array(areaKind) },
    roads: { ...roads.done(), width: new Float32Array(width), kind: new Uint8Array(kind) },
  };
}

/** Buffers to transfer from the worker (zero copy). */
export function mapBuffers(m: MapVectors): ArrayBuffer[] {
  const pieces = [m.buildings, m.areas, m.roads];
  return [...pieces.flatMap((p) => [p.pts.buffer, p.start.buffer]), m.areas.kind.buffer, m.roads.width.buffer, m.roads.kind.buffer] as ArrayBuffer[];
}
