// SPEC §17.41 Host minimap, pure part: the leg's places, who heads where, the view fit, the demo ticks.
import { onPitMat } from '@race/shared';
import { decodeTick } from '@race/shared/protocol';
import { describe, expect, it } from 'vitest';
import { byEntry, demoTick, fitView, heading, legPlaces, placeLabel, placeTip, withMapDemo } from './hostMapData.ts';
import { demoState } from './hostView.ts';

const NOW = 1_000_000_000;

describe('Host minimap (SPEC §17.41)', () => {
  it('places: start + every step / branch zone; steps at one point share a pin (kind by PLACE_RANK); short labels', () => {
    const places = legPlaces(demoState(NOW).leg!);
    expect(places.map((p) => [p.kind, p.mat, p.entries.map((e) => e.key)])).toEqual([
      ['start', false, ['start']],
      ['route_info', false, ['L1']],
      ['challenge', false, ['T1']],
      ['detour', false, ['L2', 'D1', 'D1|A']],
      ['detour', false, ['D1|B']],
      ['pit_stop', true, ['L3', 'T2', 'PS']],
    ]);
    expect(placeLabel(places[3]!, 0)).toBe('Lộ trình 2 · Lựa chọn kép +1');
    expect(placeLabel(places[5]!, 2)).toBe('Lộ trình 3 · Thử thách 2 +1 · 2 đội');
  });

  it('heading: the current step, a detour its chosen branch; never entered / finished / race over: none', () => {
    const s = demoState(NOW);
    const head = heading(s);
    expect([...head]).toEqual([['t1', 'D1|B'], ['t2', 'D1|B'], ['t4', 'T1'], ['t5', 'D1|A'], ['t6', 'T2']]);
    expect(placeTip(legPlaces(s.leg!)[4]!, byEntry(s, head))).toBe('Lựa chọn kép B – Ảnh · Khoảng sân rộng ở Tap Seac\n   đội ở bước này: Đội Đỏ, Đội Vàng');
    expect(heading({ ...s, status: 'finished' }).size).toBe(0);
  });

  it('fitView: every point inside the view with its padding; the scale clamped', () => {
    const pts = [{ x: -500, z: 200 }, { x: 700, z: -100 }, { x: 0, z: 0 }];
    const v = fitView(pts, 400, 300, 1, 20, 30);
    for (const p of pts) {
      const [sx, sy] = [(p.x - v.cx) / v.mpp + 200, (p.z - v.cz) / v.mpp + 150];
      expect(Math.min(sx - 30, 370 - sx, sy - 30, 270 - sy)).toBeGreaterThan(-1e-9);
    }
    expect(fitView([{ x: 5, z: 5 }], 400, 300, 1, 20, 30)).toEqual({ cx: 5, cz: 5, mpp: 1 });
    expect(fitView(pts, 400, 300, 1, 2, 30).mpp).toBe(2);
  });

  it('demo: two more online teams; ticks decode, the finished team stands on the mat, the others move', () => {
    const s = withMapDemo(demoState(NOW));
    expect(s.teams.filter((t) => t.online).map((t) => t.name)).toEqual(['Đội Xanh', 'Đội Đỏ', 'Đội Nâu', 'Đội Ngọc', 'Đội Hồng']);
    const [a, b] = [decodeTick(demoTick(s, NOW))!, decodeTick(demoTick(s, NOW + 2000))!];
    expect(a.entries.map((e) => e.slot)).toEqual([0, 1, 6, 7, 8]);
    const mat = legPlaces(s.leg!).find((p) => p.mat)!;
    expect(onPitMat(a.entries[0]!.pose.x, a.entries[0]!.pose.z, mat, 0)).toBe(true);
    expect(b.entries.slice(1).every((e, i) => e.pose.x !== a.entries[i + 1]!.pose.x)).toBe(true);
  });
});
