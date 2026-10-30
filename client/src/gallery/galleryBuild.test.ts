import { describe, expect, it } from 'vitest';
import { BUTTON_LOCAL, G, TEAMS, bubbleGeometry, columnSlots, deskGeometry, deskLocal, deskSlots, figureGeometry, frameSlots, inside, trussGeometry, windowSlots } from './galleryBuild.ts';

describe('gallery builders', () => {
  it('11 teams with unique slots and valid colours', () => {
    expect(TEAMS.length).toBe(11);
    expect(new Set(TEAMS.map((t) => t.slot)).size).toBe(11);
    for (const t of TEAMS) expect(t.color).toMatch(/^#[0-9a-f]{6}$/);
  });
  it('11 desks against the long walls, facing the wall, 3.4 m apart, aisle side clear', () => {
    const d = deskSlots();
    expect(d.map((s) => s.slot)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    for (const s of d) {
      expect(inside(s.x, s.z, 0.9)).toBe(true);
      const toWall = deskLocal(s, 0, 0, -1); // local −z must point at the nearer long wall
      expect(Math.sign(toWall.x - s.x)).toBe(Math.sign(s.x));
      expect(Math.abs(deskLocal(s, 0, 0, 1).x)).toBeLessThan(Math.abs(s.x)); // the artist / stool / pedestal sit on the aisle side
      for (const o of d) if (o !== s) expect(Math.hypot(o.x - s.x, o.z - s.z)).toBeGreaterThanOrEqual(G.pitch - 1e-9);
    }
    expect(d.filter((s) => s.x < 0).length).toBe(6);
    expect(d[0].z).toBeGreaterThan(d[5].z); // slot 1 nearest the entrance (+z)
  });
  it('frames stay on the walls, clear of the windows and of each other', () => {
    const f = frameSlots(), w = windowSlots();
    expect(f.length).toBeGreaterThanOrEqual(14);
    for (const a of f) {
      expect(Math.abs(a.x) <= G.halfW && Math.abs(a.z) <= G.halfL).toBe(true);
      expect(a.y - a.h / 2).toBeGreaterThan(1.1);
      if (a.x > G.halfW - 0.5) for (const win of w) expect(Math.abs(win.z - a.z)).toBeGreaterThan((G.window.w + a.w) / 2);
      for (const b of f) if (b !== a && Math.abs(a.x - b.x) < 0.1 && Math.abs(a.z - b.z) < 0.1) expect(Math.abs(a.y - b.y)).toBeGreaterThan((a.h + b.h) / 2);
      for (const b of f) if (b !== a && a.yaw === b.yaw) { // same wall: no overlap along the wall
        const along = Math.abs(a.yaw) === Math.PI / 2 ? Math.abs(a.z - b.z) : Math.abs(a.x - b.x);
        expect(along > (a.w + b.w) / 2 || Math.abs(a.y - b.y) > (a.h + b.h) / 2).toBe(true);
      }
    }
  });
  it('columns at the midpoints of their wall\'s desks, never behind a desk', () => {
    const c = columnSlots(), d = deskSlots();
    expect(c.length).toBeGreaterThanOrEqual(10);
    for (const s of c) for (const k of d) if (Math.sign(k.x) === Math.sign(s.x)) expect(Math.abs(k.z - s.z)).toBeGreaterThanOrEqual(G.pitch / 2 - 1e-9);
  });
  it('desk parts are compact and the button sits on the pedestal plate', () => {
    const g = deskGeometry();
    for (const [name, geo] of Object.entries(g)) {
      geo.computeBoundingBox();
      const b = geo.boundingBox!;
      expect([name, b.min.y]).toEqual([name, expect.any(Number)]);
      expect(b.min.y).toBeGreaterThanOrEqual(-0.01);
      expect(b.max.y).toBeLessThan(2.0);
      expect(Math.max(Math.abs(b.min.x), Math.abs(b.max.x))).toBeLessThan(1.15);
      expect(b.min.z).toBeGreaterThan(-0.85);
      expect(b.max.z).toBeLessThan(0.95);
    }
    g.pedestal.computeBoundingBox();
    expect(BUTTON_LOCAL.y).toBeGreaterThan(g.pedestal.boundingBox!.max.y);
    expect(Math.abs(BUTTON_LOCAL.x - 0.9) + Math.abs(BUTTON_LOCAL.z - 0.6)).toBeLessThan(0.01);
    g.paper.computeBoundingBox();
    g.wood.computeBoundingBox();
    expect(g.paper.boundingBox!.min.y).toBeGreaterThan(0.8); // sheets lie on the board, not under it
  });
  it('trusses span the hall up to the ridge; props extrude', () => {
    const t = trussGeometry(0);
    t.computeBoundingBox();
    expect(t.boundingBox!.min.x).toBeLessThan(-G.halfW + 0.2);
    expect(t.boundingBox!.max.y).toBeCloseTo(G.ridgeH - 0.07, 0);
    expect(bubbleGeometry(2, 1.2, 0.3).attributes.position.count).toBeGreaterThan(50);
    figureGeometry(1.8).computeBoundingBox();
  });
});
