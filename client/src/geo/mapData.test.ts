// Tests on the real generated data (scripts/build-chunks.ts output); skipped when the data is missing.
import { existsSync, readFileSync } from 'node:fs';
import { latLonToWorld } from '@race/shared';
import { describe, expect, it } from 'vitest';
import { type ChunkData, type ChunkIndex, type WaterData, type XZ, ringArea } from './chunkData.ts';
import { midpoint, ringCentroid } from './clip.ts';

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
    expect(index.keys.length).toBeGreaterThan(300);
    expect(load().chunks.map((c) => c.key)).toEqual(index.keys);
  });

  it('rings are oriented: outer area ≥ 2 m², holes < 0', () => {
    const polys = [...all('buildings'), ...load().chunks.flatMap((c) => c.areas), ...load().water.polygons];
    expect(polys.filter((p) => !(ringArea(p.outer) >= 2) || (p.holes ?? []).some((h) => !(ringArea(h) < 0)))).toEqual([]);
  });

  it('12 distinct avenues touch the Place Charles de Gaulle roundabout', () => {
    const roads = all('roads');
    const ring = roads.filter((r) => r.name === 'Place Charles de Gaulle');
    expect(ring.every((r) => r.roundabout)).toBe(true);
    const v = new Set(ring.flatMap((r) => r.pts.flatMap((_, i) => (i % 2 ? [] : [`${r.pts[i]},${r.pts[i + 1]}`]))));
    const names = new Set(
      roads.filter((r) => r.name?.startsWith('Avenue ') && r.pts.some((_, i) => i % 2 === 0 && v.has(`${r.pts[i]},${r.pts[i + 1]}`))).map((r) => r.name),
    );
    expect(names.size).toBe(12);
  });

  it('the Champs-Élysées carriageways lie within 30 m of the Étoile → Concorde line', () => {
    const [a, b] = [W(48.8738, 2.295), W(48.86548, 2.32115)];
    const [dx, dz] = [b.x - a.x, b.z - a.z];
    const len = Math.hypot(dx, dz);
    // The cycleway looping around the Rond-Point shares the name and swings up to ~30 m off the axis.
    const notCar = new Set(['cycleway', 'footway', 'path', 'pedestrian', 'steps']);
    const pts = all('roads').filter((r) => r.name === 'Avenue des Champs-Élysées' && !notCar.has(r.kind)).flatMap((r) => r.pts);
    expect(pts.length).toBeGreaterThan(20);
    let maxDev = 0;
    for (let i = 0; i < pts.length; i += 2) maxDev = Math.max(maxDev, Math.abs((pts[i]! - a.x) * dz - (pts[i + 1]! - a.z) * dx) / len);
    expect(maxDev).toBeLessThan(30);
  });

  it('Pont Alexandre III spans the Seine', () => {
    const bridge = all('bridges').find((b) => b.name === 'Pont Alexandre III');
    expect(bridge).toBeDefined();
    expect(overRiver(...midpoint(bridge!.pts))).toBe(true);
  });

  it('the Eiffel Tower → Trocadéro segment crosses the river', () => {
    const [a, b] = [W(48.8584, 2.2945), W(48.862, 2.288)];
    const hits = Array.from({ length: 101 }, (_, k) => overRiver(a.x + ((b.x - a.x) * k) / 100, a.z + ((b.z - a.z) * k) / 100));
    expect(hits.some(Boolean)).toBe(true);
    expect(hits[0] || hits[100]).toBe(false);
    expect(overRiver(W(48.853, 2.3499).x, W(48.853, 2.3499).z)).toBe(false); // Notre-Dame: Île de la Cité is a hole
  });

  it('landmarks are tagged; the Arc de Triomphe centroid is within 30 m of the SPEC point', () => {
    const marks = all('buildings').filter((b) => b.landmark);
    expect(marks.map((b) => b.landmark).sort()).toEqual(['arc', 'eiffel', 'obelisk', 'pyramid']);
    const [x, z] = ringCentroid(marks.find((b) => b.landmark === 'arc')!.outer);
    const p = W(48.8738, 2.295);
    expect(Math.hypot(x - p.x, z - p.z)).toBeLessThan(30);
  });

  it('leg destinations L1–L6 are not inside a building (the Eiffel Tower footprint is walkable, SPEC §17.4)', () => {
    const leg = read<{ steps: { id: string; destination?: { lat: number; lon: number } }[] }>('../../../worker/legs/paris-demo.json', import.meta.url);
    const dests = leg.steps.filter((s) => /^L[1-6]$/.test(s.id) && s.destination);
    expect(dests.length).toBe(6);
    const blocking = all('buildings').filter((b) => b.landmark !== 'eiffel');
    for (const s of dests) {
      const { x, z } = W(s.destination!.lat, s.destination!.lon);
      expect(blocking.filter((b) => inPoly(b, x, z)).map((b) => b.kind), s.id).toEqual([]);
    }
  });
});
