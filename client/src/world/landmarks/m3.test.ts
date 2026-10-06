import { describe, expect, it } from 'vitest';
import { landmarks as L } from '../../config.ts';
import { type BuildingRec, chunkBounds, ringArea, type XZ } from '../../geo/chunkData.ts';
import { LANDMARK_BY_ID } from '../../geo/landmarks.ts';
import type { BuildOut } from '../buildTypes.ts';
import { helpers, type LandmarkCtx } from './index.ts';
import { clipRing, details, ellipseAt, lisboaPiece, sections, signCols, signRuns } from './m3.ts';

type Id = 'hotel-lisboa' | 'wynn-macau' | 'mgm-macau' | 'sands-macau' | 'fisherman-wharf';
const ctx = (id: Id): LandmarkCtx => ({ key: '0_0', bounds: chunkBounds('0_0'), height: () => 10, def: LANDMARK_BY_ID.get(id)!, ground: 10, minGround: 10 });
const circle = (cx: number, cz: number, r: number, n = 24): XZ => Array.from({ length: n }, (_, s) => [cx + r * Math.cos((2 * Math.PI * s) / n), cz + r * Math.sin((2 * Math.PI * s) / n)]).flat();
const rect = (x0: number, z0: number, x1: number, z1: number): XZ => [x0, z0, x1, z0, x1, z1, x0, z1];
const rec = (outer: XZ, extra: Partial<BuildingRec> = {}): BuildingRec => ({ outer, kind: 'yes', ...extra }) as BuildingRec;
const build = (id: Id, r: BuildingRec) => details[id]!(r, r.parts ?? [], ctx(id), helpers);

function stats(o: BuildOut) {
  let [maxY, tris, nan] = [-Infinity, 0, 0];
  const box = { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity };
  for (const m of o.meshes) {
    tris += m.index.length / 3;
    for (let i = 0; i < m.position.length; i += 3) {
      const [x, y, z] = [m.position[i]!, m.position[i + 1]!, m.position[i + 2]!];
      if (!Number.isFinite(x + y + z)) nan++;
      maxY = Math.max(maxY, y);
      [box.x0, box.x1, box.z0, box.z1] = [Math.min(box.x0, x), Math.max(box.x1, x), Math.min(box.z0, z), Math.max(box.z1, z)];
    }
    for (const v of m.normal) if (!Number.isFinite(v)) nan++;
  }
  return { maxY, tris, nan, box, materials: new Set(o.meshes.map((m) => m.material)), colliders: o.colliders.length };
}

describe('m3 pure helpers', () => {
  it('signRuns: bulb font runs stay inside the sign and every letter has bulbs', () => {
    for (const t of ['LISBOA', 'WYNN', 'MGM', 'SANDS']) {
      const runs = signRuns(t);
      expect(runs.length).toBeGreaterThan(t.length * 4);
      for (const [c0, c1, row] of runs) {
        expect(c0).toBeLessThanOrEqual(c1);
        expect(c1).toBeLessThan(signCols(t));
        expect(row).toBeGreaterThanOrEqual(0);
        expect(row).toBeLessThan(7);
      }
      for (let k = 0; k < t.length; k++) expect(runs.some(([c0]) => c0 >= k * 6 && c0 < k * 6 + 5)).toBe(true);
    }
    expect(signRuns('L')).toEqual([[0, 0, 0], [0, 0, 1], [0, 0, 2], [0, 0, 3], [0, 0, 4], [0, 0, 5], [0, 4, 6]]);
  });
  it('clipRing keeps the half-plane part; sections cut a footprint into equal slices west → east', () => {
    const r = rect(0, 0, 90, 20);
    expect(Math.abs(ringArea(clipRing(r, 1, 0, 30)))).toBeCloseTo(600, 6);
    const s = sections(r, 3);
    expect(s).toHaveLength(3);
    for (const p of s) expect(Math.abs(ringArea(p))).toBeCloseTo(600, 3);
    expect(Math.max(...s[0]!.filter((_, i) => i % 2 === 0))).toBeCloseTo(30, 6);
  });
  it('ellipseAt: on the ellipse, unit normal and tangent, normal ⊥ tangent', () => {
    for (const t of [0, 0.7, 2, 4]) {
      const e = ellipseAt(5, 6, 40, 20, t);
      expect(((e.x - 5) / 40) ** 2 + ((e.z - 6) / 20) ** 2).toBeCloseTo(1, 9);
      expect(Math.hypot(e.nx, e.nz)).toBeCloseTo(1, 9);
      expect(e.nx * e.tx + e.nz * e.tz).toBeCloseTo(0, 9);
    }
  });
  it('lisboaPiece tells the drum, the tower, the podium and the canopies apart', () => {
    expect(lisboaPiece(rec(circle(0, 0, 22, 19), { height: 37.4 }))).toBe('drum');
    expect(lisboaPiece(rec(circle(0, 0, 75, 40), { height: 27.8, kind: 'hotel' }))).toBe('podium'); // roundish but 150 m
    expect(lisboaPiece(rec(rect(0, 0, 54, 20), { height: 76.8 }))).toBe('tower');
    expect(lisboaPiece(rec(rect(0, 0, 10, 10), { kind: 'roof' }))).toBe('generic');
  });
});

describe('m3 landmarks (stand-in outlines)', () => {
  const cases: [string, Id, BuildingRec, number][] = [
    ['Casino Lisboa drum', 'hotel-lisboa', rec(circle(100, 100, 22, 19), { height: 37.4 }), 37.4],
    ['Lisboa tower', 'hotel-lisboa', rec(rect(0, 0, 54, 20), { height: 76.8 }), 76.8],
    ['Lisboa podium', 'hotel-lisboa', rec(circle(0, 0, 75, 40), { height: 27.8, kind: 'hotel' }), 27.8],
    ['Wynn', 'wynn-macau', rec(rect(0, 0, 140, 25), { height: 94.5 }), 94.5],
    ['Encore', 'wynn-macau', rec(rect(0, 0, 90, 20), { height: 177.5 }), 177.5],
    ['Wynn podium', 'wynn-macau', rec(rect(600, 500, 900, 760), { height: 23.1 }), 23.1],
    ['MGM tower', 'mgm-macau', rec(rect(0, 0, 117, 20), { height: 120 }), 120],
    ['MGM podium', 'mgm-macau', rec(rect(800, 750, 990, 900), { height: 20.3, points: [{ kind: 'artwork', x: 996, z: 866, r: 5.7 }] }), 20.3],
    ['Sands', 'sands-macau', rec(rect(0, 0, 150, 290), { height: 46.7 }), 46.7],
    ['Wharf convention centre', 'fisherman-wharf', rec(rect(1640, -100, 1770, -10), { height: 20.8, kind: 'commercial' }), 20.8],
    ['Wharf site', 'fisherman-wharf', rec(rect(1640, -300, 1970, 470), { kind: 'artwork' }), 0],
  ];
  for (const [name, id, r, h] of cases) {
    it(`${name}: no NaN, within the triangle budget, has lights and colliders`, () => {
      const st = stats(build(id, r));
      expect(st.nan).toBe(0);
      expect(st.tris).toBeGreaterThan(50);
      expect(st.tris).toBeLessThan(20000);
      expect(st.materials.has('neon')).toBe(true);
      expect(st.colliders).toBeGreaterThan(0);
      if (h) expect(st.maxY).toBeGreaterThanOrEqual(10 + h - 0.01); // ground 10 + OSM height (signs may stand above)
    });
  }
  it('outline-bound pieces stay within their outline (+ a few m of lit strips / signs)', () => {
    for (const [, id, r] of cases.filter(([n]) => !/site|podium/.test(n))) {
      const { box } = stats(build(id, r));
      const xs = r.outer.filter((_, i) => i % 2 === 0);
      const zs = r.outer.filter((_, i) => i % 2 === 1);
      expect(box.x0).toBeGreaterThan(Math.min(...xs) - 2);
      expect(box.x1).toBeLessThan(Math.max(...xs) + 2);
      expect(box.z0).toBeGreaterThan(Math.min(...zs) - 2);
      expect(box.z1).toBeLessThan(Math.max(...zs) + 2);
    }
  });
  it('MGM: three stepped sections up to the OSM height, the tallest at the east', () => {
    const o = build('mgm-macau', rec(rect(0, 0, 117, 20), { height: 120 }));
    const metal = o.meshes.find((m) => m.material === 'metal')!;
    let [westTop, eastTop] = [0, 0];
    for (let i = 0; i < metal.position.length; i += 3) {
      const [x, y] = [metal.position[i]!, metal.position[i + 1]!];
      if (x < 30) westTop = Math.max(westTop, y);
      if (x > 87) eastTop = Math.max(eastTop, y);
    }
    expect(westTop).toBeCloseTo(10 + L.m3.mgm.tops[0]!, 3);
    expect(eastTop).toBeCloseTo(10 + 120, 3);
  });
  it('the Colosseum stands on its configured ellipse; the lighthouse inside the site', () => {
    const C = L.m3.wharf.colosseum;
    const o = build('fisherman-wharf', rec(rect(1640, -300, 1970, 470), { kind: 'artwork' }));
    const { box } = stats(o);
    expect(box.x0).toBeGreaterThan(C.x - C.a - 2);
    expect(box.z0).toBeGreaterThan(C.z - C.b - 2);
    expect(box.x1).toBeLessThan(1970); // the lighthouse is set back from the tip
    expect(box.z1).toBeLessThan(470);
  });
  it('unknown small Wynn records fall back to the generic renderer (the pavilion kept low)', () => {
    const st = stats(build('wynn-macau', rec(rect(0, 0, 10, 15))));
    expect(st.maxY).toBeCloseTo(10 + L.m3.wynn.kiosk, 3);
  });
});
