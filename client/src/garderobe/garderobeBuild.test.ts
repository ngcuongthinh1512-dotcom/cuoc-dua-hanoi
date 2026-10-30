import { describe, expect, it } from 'vitest';
import { G, PHOTOS, cabinetSlots, figurineSlots, fitDistance, focusPose, inside, printSize, slotLocal, stairTop, vitrineGeometry, vitrineSlots } from './garderobeBuild.ts';

describe('garderobe builders', () => {
  it('4 vitrines numbered 1–4 inside the room, facing +z-ish, not overlapping, with a photo each', () => {
    const s = vitrineSlots();
    expect(s.map((x) => x.n)).toEqual([1, 2, 3, 4]);
    expect(PHOTOS.length).toBe(4);
    for (const a of s) {
      expect(inside(a.x, a.z, 1.2)).toBe(true);
      expect(slotLocal(a, 0, 0, 1).z).toBeGreaterThan(a.z); // the front looks toward the entrance (+z)
      for (const b of s) if (b !== a) expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(G.vitrine.w + 0.5);
    }
  });
  it('the print fits inside the glass case and the close-up camera sees it whole, from inside the room', () => {
    for (const aspect of [385 / 565, 720 / 1080]) {
      const p = printSize(aspect);
      expect(p.w).toBeLessThan(G.vitrine.w - 0.1);
      expect(p.y + p.h / 2).toBeLessThan(G.vitrine.plinthH + G.vitrine.glassH - 0.05);
      expect(p.y - p.h / 2).toBeGreaterThan(G.vitrine.plinthH);
      const d = fitDistance(p.w, p.h, 60, 16 / 9), t = Math.tan(Math.PI / 6);
      expect(2 * d * t).toBeGreaterThanOrEqual(p.h); // visible height ≥ print height
      expect(2 * d * t * (16 / 9)).toBeGreaterThanOrEqual(p.w);
      for (const s of vitrineSlots()) { const [from] = focusPose(s, aspect, 60, 16 / 9); expect(inside(from.x, from.z)).toBe(true); }
    }
  });
  it('cabinets hug the walls, figurines sit on shelves inside the room, the stair reaches the first floor', () => {
    for (const c of cabinetSlots()) expect(Math.abs(c.x) > G.halfW - 0.6 || Math.abs(c.z) > G.halfL - 0.6).toBe(true);
    const f = figurineSlots();
    expect(f.length).toBeGreaterThan(150);
    for (const s of f) { expect(inside(s.x, s.z)).toBe(true); expect(s.y).toBeGreaterThan(0.3); }
    expect(stairTop().y).toBeGreaterThan(2);
    expect(stairTop().z).toBeGreaterThan(-G.halfL);
    const g = vitrineGeometry();
    g.frame.computeBoundingBox();
    expect(g.frame.boundingBox!.max.y).toBeCloseTo(G.vitrine.plinthH + G.vitrine.glassH + 0.12, 2);
  });
});
