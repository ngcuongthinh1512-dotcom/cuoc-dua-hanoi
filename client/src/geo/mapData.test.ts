// Tests on the real generated data (scripts/build-chunks.ts output); skipped when the data is missing.
import { existsSync, readFileSync } from 'node:fs';
import { latLonToWorld } from '@race/shared';
import { describe, expect, it } from 'vitest';
import { type ChunkData, type ChunkIndex, chunkKey, type SkylineData, type WaterData, type XZ, ringArea } from './chunkData.ts';
import { midpoint, polylineLength, ringCentroid } from './clip.ts';
import { LANDMARKS } from './landmarks.ts';

const DATA = new URL('../../public/data/', import.meta.url);
const read = <T>(path: string, base: URL | string = DATA) => JSON.parse(readFileSync(new URL(path, base), 'utf8')) as T;
const hasData = existsSync(new URL('chunks/index.json', DATA)) && existsSync(new URL('water.json', DATA));

let cache: { chunks: ChunkData[]; water: WaterData } | undefined;
const load = () =>
  (cache ??= {
    chunks: read<ChunkIndex>('chunks/index.json').keys.map((k) => read<ChunkData>(`chunks/${k}.json`)),
    water: read<WaterData>('water.json'),
  });
const all = <K extends 'buildings' | 'roads' | 'bridges'>(k: K) => load().chunks.flatMap((c) => c[k] as unknown[]) as ChunkData[K];
const W = (lat: number, lon: number) => latLonToWorld(lat, lon);

function inRing(r: XZ, x: number, z: number) {
  let inside = false;
  for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
    const [xi, zi, xj, zj] = [r[i]!, r[i + 1]!, r[j]!, r[j + 1]!];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
const inPoly = (p: { outer: XZ; holes?: XZ[] }, x: number, z: number) =>
  inRing(p.outer, x, z) && !(p.holes ?? []).some((h) => inRing(h, x, z));
const overRiver = (x: number, z: number) => load().water.polygons.some((p) => p.river && inPoly(p, x, z));

describe.skipIf(!hasData)('real map data', () => {
  it('index lists every chunk of the bbox and each file exists', () => {
    const index = read<ChunkIndex>('chunks/index.json');
    expect(index.keys.length).toBeGreaterThan(200); // Leg 3 Hà Nội: 988 chunks (539 empty outside the three districts)
    expect(load().chunks.map((c) => c.key)).toEqual(index.keys);
  });

  it('rings are oriented: outer area ≥ 2 m², holes < 0', () => {
    const polys = [...all('buildings'), ...load().chunks.flatMap((c) => c.areas), ...load().water.polygons];
    expect(polys.filter((p) => !(ringArea(p.outer) >= 2) || (p.holes ?? []).some((h) => !(ringArea(h) < 0)))).toEqual([]);
  });

  it('5 distinct streets touch the Quảng trường Cách mạng Tháng Tám roundabout', () => {
    const roads = all('roads');
    const NAME = 'Quảng trường Cách mạng Tháng Tám';
    const ring = roads.filter((r) => r.name === NAME && r.roundabout);
    expect(ring.length).toBeGreaterThan(0);
    expect(ring.every((r) => r.roundabout)).toBe(true);
    const v = new Set(ring.flatMap((r) => r.pts.flatMap((_, i) => (i % 2 ? [] : [`${r.pts[i]},${r.pts[i + 1]}`]))));
    const names = new Set(
      roads.filter((r) => r.name && r.name !== NAME && r.pts.some((_, i) => i % 2 === 0 && v.has(`${r.pts[i]},${r.pts[i + 1]}`))).map((r) => r.name),
    );
    expect([...names].sort()).toEqual(['Phố Cổ Tân', 'Phố Lê Thánh Tông', 'Phố Lý Thái Tổ', 'Phố Phan Chu Trinh', 'Phố Tràng Tiền']);
  });

  it('the Phố Hai Bà Trưng carriageways lie within 10 m of the straight line between their ends', () => {
    const [a, b] = [W(21.02288, 105.85748), W(21.02763, 105.84155)]; // Leg 3 Hà Nội: Nhà hát Lớn end → Lê Duẩn end, measured max deviation 5.8 m
    const [dx, dz] = [b.x - a.x, b.z - a.z];
    const len = Math.hypot(dx, dz);
    const notCar = new Set(['cycleway', 'footway', 'path', 'pedestrian', 'steps']);
    const pts = all('roads').filter((r) => r.name === 'Phố Hai Bà Trưng' && !notCar.has(r.kind)).flatMap((r) => r.pts);
    expect(pts.length).toBeGreaterThan(20);
    let maxDev = 0;
    for (let i = 0; i < pts.length; i += 2) maxDev = Math.max(maxDev, Math.abs((pts[i]! - a.x) * dz - (pts[i + 1]! - a.z) * dx) / len);
    expect(maxDev).toBeLessThan(10);
  });

  it('the Cầu Tô Lịch bridge spans the Sông Tô Lịch (a river: true polygon; the Red River polygon is cut by the district mask and no longer lies under the Long Biên deck)', () => {
    const pieces = all('bridges').filter((b) => b.name === 'Cầu Tô Lịch');
    expect(pieces.length).toBeGreaterThan(0);
    expect(pieces.some((b) => overRiver(...midpoint(b.pts)))).toBe(true);
  });

  it('a west–east segment in the south-west crosses the Sông Tô Lịch', () => {
    const [a, b] = [W(21.014, 105.802), W(21.014, 105.8087)];
    const hits = Array.from({ length: 101 }, (_, k) => overRiver(a.x + ((b.x - a.x) * k) / 100, a.z + ((b.z - a.z) * k) / 100));
    expect(hits.some(Boolean)).toBe(true);
    expect(hits[0] || hits[100]).toBe(false);
    expect(overRiver(W(21.0285, 105.8524).x, W(21.0285, 105.8524).z)).toBe(false); // Hồ Hoàn Kiếm is water but not a river polygon
    expect(overRiver(0, 0)).toBe(false); // the origin
  });

  it('chunk format v2', () => {
    expect(read<ChunkIndex>('chunks/index.json').v).toBe(2);
    expect(load().chunks.every((c) => c.v === 2)).toBe(true);
  });

  it('every registry landmark resolves in the data (Leg 2: the registry is empty, so none is tagged); the skyline towers are there', () => {
    const marks = all('buildings').filter((b) => b.landmark);
    const found = new Set(marks.map((b) => b.landmark));
    expect(LANDMARKS.filter((d) => (d.osm.length || d.zone) && !found.has(d.id)).map((d) => d.id)).toEqual([]);
    expect(LANDMARKS.filter((d) => !d.osm.length && !d.zone && !(d.at && d.height) && !d.placed).map((d) => d.id)).toEqual([]); // skyline / code-only details
    expect([...found].filter((id) => !LANDMARKS.some((d) => d.id === id))).toEqual([]);
    const sky = read<SkylineData>('skyline.json');
    expect(sky.towers.length).toBeGreaterThan(20);
    expect(sky.towers.every((t) => t.height >= 60 && ringArea(t.outer) > 0)).toBe(true);
  });

  it('parts are kept only inside their landmark outline', () => {
    const bad: string[] = [];
    for (const b of all('buildings')) {
      if (!b.landmark && (b.parts || b.points)) bad.push(`non-landmark with parts/points`);
      for (const q of b.parts ?? []) if (!inPoly(b, ...ringCentroid(q.outer))) bad.push(`${b.landmark} part outside`);
    }
    expect(bad).toEqual([]);
  });

  it('long bridge chains are split per chunk into continuous pieces (the rail viaducts show along their length)', () => {
    const pieces = load().chunks.flatMap((c) => c.bridges.filter((b) => b.chain).map((b) => ({ ...b, key: c.key })));
    const chains = new Map<string, typeof pieces>();
    for (const q of pieces) chains.set(q.chain!.ends.join(','), [...(chains.get(q.chain!.ends.join(',')) ?? []), q]);
    expect(chains.size).toBeGreaterThan(0);
    for (const list of chains.values()) {
      list.sort((a, b) => a.chain!.s0 - b.chain!.s0);
      for (let k = 0; k < list.length; k++) {
        const q = list[k]!;
        const end = q.chain!.s0 + polylineLength(q.pts);
        // (a sliver < 2 m at a chunk border has its midpoint rounded to 0.1 m onto the grid line: Hà Nội has one, Vành đai 2)
        if (polylineLength(q.pts) >= 2) expect(chunkKey(...midpoint(q.pts))).toBe(q.key);
        expect(end).toBeLessThanOrEqual(q.chain!.length + 0.2);
        // consecutive pieces share their border vertex (a gap = pieces outside the chunk grid)
        if (k + 1 < list.length && Math.abs(list[k + 1]!.chain!.s0 - end) < 0.2) expect(q.pts.slice(-2)).toEqual(list[k + 1]!.pts.slice(0, 2));
      }
    }
    const viaduct = [...chains.values()].filter((l) => l[0]!.kind === 'trunk' && l[0]!.layer === 2); // Leg 3 Hà Nội: the Vành đai 2 elevated road (the Phùng Hưng rail viaduct is outside the data; Leg 3 Brussels: the railway viaduct, Leg 1: Line 6 metro viaduct)
    expect(Math.max(...viaduct.map((l) => new Set(l.map((q) => q.key)).size))).toBeGreaterThan(5);
  });

  it('leg destinations L1–L5 are not inside a building', () => {
    const leg = read<{ steps: { id: string; destination?: { lat: number; lon: number } }[] }>('../../../worker/legs/hanoi-demo.json', import.meta.url);
    const dests = leg.steps.filter((s) => /^L[1-6]$/.test(s.id) && s.destination);
    expect(dests.length).toBe(5);
    const walkable = new Set(['bridge', 'fountain', 'artwork', 'ruins']); // landmark outlines that are not buildings (L1 now stands at the foot of the Ruínas stair, leg2-fixes.md)
    const blocking = all('buildings').filter((b) => !walkable.has(b.kind));
    for (const s of dests) {
      const { x, z } = W(s.destination!.lat, s.destination!.lon);
      expect(blocking.filter((b) => inPoly(b, x, z)).map((b) => b.kind), s.id).toEqual([]);
    }
  });
});
