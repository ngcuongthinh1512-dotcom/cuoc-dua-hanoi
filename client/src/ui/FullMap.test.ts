// Phase 5 track A: full map view maths, waypoint clicks, street-name placement (synthetic + the real road graph).
// FullMap's constructor touches no DOM; open() / update() (canvas) are checked by the p5-fullmap screenshots.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RoadGraph, type RoadGraphFile } from '@race/shared/graph';
import { describe, expect, it, vi } from 'vitest';
import { fullMap } from '../config.ts';
import type { WaterData } from '../geo/chunkData.ts';
import {
  clickWaypoint, clipSegment, FullMap, type Label, type LabelCandidate, labelsOverlap, type MapView, mapToScreen, mapToWorld,
  placeLabels, straight, zoomAt,
} from './FullMap.ts';

const measure = (t: string) => t.length * 6.5; // ≈ 12 px sans-serif
const noOverlaps = (ls: Label[]) => ls.every((a, i) => ls.slice(i + 1).every((b) => !labelsOverlap(a, b)));

describe('FullMap view', () => {
  it('screen ↔ world round trip within 0.01 m, zoom keeps the point under the cursor', () => {
    for (const mpp of [0.4, 1, 3.7, 6]) {
      const v: MapView = { cx: 812.3, cz: -455.9, mpp, w: 1280, h: 720 };
      for (const [x, z] of [[0, 0], [-2700, 2200], [2999.99, -1391.2]] as const) {
        const [bx, bz] = mapToWorld(v, ...mapToScreen(v, x, z));
        expect(Math.hypot(bx - x, bz - z)).toBeLessThan(0.01);
      }
    }
    const v: MapView = { cx: 0, cz: 0, mpp: 2, w: 1000, h: 600 };
    const before = mapToWorld(v, 830, 120);
    zoomAt(v, 830, 120, 1 / fullMap.wheelZoom);
    expect(v.mpp).toBeCloseTo(2 / fullMap.wheelZoom, 9);
    const after = mapToWorld(v, 830, 120);
    expect(Math.hypot(after[0] - before[0], after[1] - before[1])).toBeLessThan(0.01);
    for (let i = 0; i < 50; i++) zoomAt(v, 500, 300, fullMap.wheelZoom);
    expect(v.mpp).toBe(fullMap.metersPerPx[1]);
  });

  it('click sets the waypoint; a click within clickPx of it removes it', () => {
    const v: MapView = { cx: 100, cz: 50, mpp: 2, w: 800, h: 600 };
    expect(clickWaypoint(v, null, 400, 300)).toEqual({ x: 100, z: 50 });
    const target = { x: 120, z: 50 }; // 10 px right of the centre
    expect(clickWaypoint(v, target, 410 + fullMap.clickPx - 1, 300)).toBeNull();
    expect(clickWaypoint(v, target, 410 + fullMap.clickPx + 2, 300)).toEqual({ x: 100 + 2 * (10 + fullMap.clickPx + 2), z: 50 });
  });
});

describe('placeLabels', () => {
  it('never overlaps, stays readable and on screen, skips repeats of a name close by', () => {
    const cands: LabelCandidate[] = [];
    for (let i = 0; i < 400; i++) {
      const [x, y, a, len] = [(i * 97) % 1200 + 40, (i * 53) % 640 + 40, i * 0.37, 90 + (i % 7) * 30];
      cands.push({ text: `Rue ${i % 60}`, x0: x, y0: y, x1: x + len * Math.cos(a), y1: y + len * Math.sin(a), order: i });
    }
    const ls = placeLabels(cands, measure, 1280, 720);
    expect(ls.length).toBeGreaterThan(20);
    expect(noOverlaps(ls)).toBe(true);
    expect(ls.every((l) => l.angle > -Math.PI / 2 && l.angle <= Math.PI / 2)).toBe(true);
    for (const a of ls) for (const b of ls) if (a !== b && a.text === b.text) expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(fullMap.label.repeatPx);
    // too short for its text, off screen: dropped
    expect(placeLabels([{ text: 'Avenue très longue', x0: 100, y0: 100, x1: 150, y1: 100, order: 0 }], measure, 1280, 720)).toEqual([]);
    expect(placeLabels([{ text: 'Rue', x0: -80, y0: 100, x1: 20, y1: 100, order: 0 }], measure, 1280, 720)).toEqual([]);
    // right to left segment: flipped, not upside down
    const [l] = placeLabels([{ text: 'Rue', x0: 300, y0: 100, x1: 100, y1: 100, order: 0 }], measure, 1280, 720);
    expect(l!.angle).toBeCloseTo(0, 9);
  });
});

const root = join(import.meta.dirname, '../../..');
const graphFile = join(root, 'shared/data/roadgraph.json');
const waterFile = join(root, 'client/public/data/water.json');
describe.skipIf(!existsSync(graphFile) || !existsSync(waterFile))('FullMap (roadgraph.json)', () => {
  const g = RoadGraph.decode(JSON.parse(readFileSync(graphFile, 'utf8')) as RoadGraphFile);
  const water = JSON.parse(readFileSync(waterFile, 'utf8')) as WaterData;

  it('covers the whole map, labels streets around Largo do Senado without overlaps, click near the waypoint removes it', () => {
    const t0 = performance.now();
    const onWaypoint = vi.fn();
    const m = new FullMap(g, water, onWaypoint);
    console.log(`FullMap constructor: ${(performance.now() - t0).toFixed(1)} ms, extent ${m.extent.map(Math.round).join(', ')}`);
    expect(m.extent[0]).toBeLessThan(-1300); // Macao: x −1379 … 2792 (Paris: ±3000)
    expect(m.extent[2]).toBeGreaterThan(2700);
    const v: MapView = { cx: 0, cz: 0, mpp: 1, w: 1280, h: 720 };
    const t1 = performance.now();
    const ls = m.labels(v, measure);
    console.log(`labels at 1 m/px: ${ls.length} in ${(performance.now() - t1).toFixed(1)} ms: ${ls.slice(0, 8).map((l) => l.text).join(' · ')}`);
    expect(ls.length).toBeGreaterThan(10);
    expect(noOverlaps(ls)).toBe(true);
    expect(ls.map((l) => l.text)).toContain('亞美打利庇盧大馬路 (新馬路) Avenida de Almeida Ribeiro');
    expect(ls.every((l) => g.file.names.includes(l.text))).toBe(true); // street names only (SPEC §4.6)

    Object.assign(m.view, v);
    const target = { x: 50, z: -20 };
    const [sx, sy] = mapToScreen(v, target.x, target.z);
    m.click(sx + 5, sy - 5, target);
    expect(onWaypoint).toHaveBeenLastCalledWith(null);
    m.click(sx + 100, sy, target);
    expect(onWaypoint).toHaveBeenLastCalledWith({ x: 150, z: -20 });
    // outside RACE_BBOX (the map's `outside` margin): no waypoint
    onWaypoint.mockClear();
    Object.assign(m.view, { cx: m.extent[0], cz: m.extent[1], mpp: 6 });
    m.click(10, 10, null);
    expect(onWaypoint).not.toHaveBeenCalled();
  });

  // Avenues are cut into short OSM ways at every junction: the names must still show (phase5-review2 M1).
  it.each([
    ['高士德大馬路 Avenida de Horta e Costa', 681, -825, 1],
    ['友誼大馬路 Avenida da Amizade', 320, 338, 2],
    ['亞美打利庇盧大馬路 (新馬路) Avenida de Almeida Ribeiro', 62, -161, 1],
  ] as const)('names %s around (%d, %d) at %f m/px, no overlaps', (name, x, z, mpp) => {
    const m = new FullMap(g, water, () => {});
    const t0 = performance.now();
    const ls = m.labels({ cx: x, cz: z, mpp, w: 1280, h: 720 }, measure);
    console.log(`${mpp} m/px @ ${name}: ${ls.length} labels in ${(performance.now() - t0).toFixed(1)} ms`);
    expect(ls.map((l) => l.text)).toContain(name);
    expect(noOverlaps(ls)).toBe(true);
  });
});

describe('label runs', () => {
  it('straight(): tolerance to the chord; clipSegment(): view part or nothing', () => {
    const p = [0, 0, 50, 3, 100, 0, 150, 40];
    expect(straight(p, 0, 2, 4)).toBe(true);
    expect(straight(p, 0, 2, 2)).toBe(false);
    expect(straight(p, 0, 3, 4)).toBe(false);
    expect(clipSegment(-100, 50, 300, 50, 200, 100)).toEqual([0, 50, 200, 50]);
    expect(clipSegment(-100, -10, 300, -10, 200, 100)).toBeUndefined();
    expect(clipSegment(10, 10, 20, 30, 200, 100)).toEqual([10, 10, 20, 30]);
  });
});
