import { describe, expect, it } from 'vitest';
import { chunkBounds, ringArea, type XZ } from './chunkData.ts';
import { fixture } from './fixture.ts';

// Guards the fixture itself against the chunkData contract, so builder tests can trust it.
describe('fixture chunk', () => {
  const b = chunkBounds(fixture.key);
  const inside = (r: XZ) => r.every((v, i) => (i % 2 ? v >= b.minZ && v <= b.maxZ : v >= b.minX && v <= b.maxX));

  it('rings: outer counter-clockwise, holes clockwise, not closed, inside the chunk', () => {
    const polys = [...fixture.buildings, ...fixture.areas];
    for (const p of polys) {
      expect(ringArea(p.outer)).toBeGreaterThan(0);
      for (const h of p.holes ?? []) expect(ringArea(h)).toBeLessThan(0);
      for (const r of [p.outer, ...(p.holes ?? [])]) {
        expect(inside(r)).toBe(true);
        expect([r[0], r[1]]).not.toEqual([r.at(-2), r.at(-1)]);
      }
    }
  });

  it('covers every case in the plan', () => {
    const f = fixture;
    expect(f.buildings.some((x) => x.holes?.length)).toBe(true); // courtyard
    expect(f.buildings.some((x) => x.outer.length === 12)).toBe(true); // L-shape
    expect(f.buildings.some((x) => x.height === undefined && x.levels === undefined && !x.landmark)).toBe(true);
    expect(f.buildings.some((x) => x.landmark)).toBe(true);
    expect(f.roads.some((r) => r.name && r.lanes === 2 && !r.oneway && r.junctions.length)).toBe(true);
    expect(f.roads.some((r) => r.surface === 'sett')).toBe(true);
    expect(f.roads.some((r) => r.kind === 'footway')).toBe(true);
    expect(f.bridges.some((x) => x.pts.length === 6)).toBe(true); // 2 segments
    expect(f.areas.some((a) => a.kind === 'park' && a.holes?.length)).toBe(true);
    expect(f.points.filter((p) => p.kind === 'tree')).toHaveLength(5);
    expect(f.points.filter((p) => p.kind === 'subway_entrance')).toHaveLength(1);
  });

  it('junction indices point at vertices shared with another road', () => {
    const key = (r: XZ, i: number) => `${r[2 * i]},${r[2 * i + 1]}`;
    for (const road of fixture.roads) {
      expect(inside(road.pts)).toBe(true);
      for (const j of road.junctions) {
        expect(j).toBeLessThan(road.pts.length / 2);
        const others = fixture.roads.filter((o) => o !== road).flatMap((o) => o.pts.map((_, i) => (i % 2 ? '' : key(o.pts, i / 2))));
        expect(others).toContain(key(road.pts, j));
      }
    }
  });
});
