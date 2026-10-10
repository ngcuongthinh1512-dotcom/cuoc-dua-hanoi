import { describe, expect, it } from 'vitest';
import { landmarks as L } from '../../config.ts';
import { type BuildingRec, chunkBounds, ringArea, type XZ } from '../../geo/chunkData.ts';
import { LANDMARK_BY_ID } from '../../geo/landmarks.ts';
import type { BuildOut } from '../buildTypes.ts';
import { helpers, type LandmarkCtx } from './index.ts';
import { clipRing, details, ellipseAt, fanArch, lisboaPiece, mgmWave, outlineCurve, signCols, signRuns } from './m3.ts';
import { parseColour, recordGround } from './parts.ts';

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
    for (const t of ['LISBOA', 'WYNN', 'MGM', 'SANDS', 'GRAND']) {
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
  it('clipRing keeps the half-plane part', () => {
    expect(Math.abs(ringArea(clipRing(rect(0, 0, 90, 20), 1, 0, 30)))).toBeCloseTo(600, 6);
  });
  it('fanArch: from foot to foot, a sharp tip at the top centre', () => {
    const a = fanArch(6, 8);
    expect(a[0]).toEqual([-3, 0]);
    expect(a.at(-1)![0]).toBeCloseTo(3, 9);
    expect(a.at(-1)![1]).toBeCloseTo(0, 9);
    const mid = a[a.length >> 1]!;
    expect(mid[0]).toBeCloseTo(0, 9);
    expect(mid[1]).toBeCloseTo(8, 9);
    for (const [, v] of a) expect(v).toBeLessThanOrEqual(8 + 1e-9);
  });
  it('mgmWave: boundaries stay ordered and the roofline never passes the height', () => {
    const G = L.m3.mgm;
    for (let u = -60; u <= 60; u += 3) {
      const ys = [0, 1, 2, 3].map((k) => mgmWave(k, u, 117, 120));
      for (let k = 0; k < 3; k++) expect(ys[k + 1]! - ys[k]!).toBeGreaterThan(12);
      expect(ys[3]!).toBeLessThanOrEqual(120);
      expect(ys[3]!).toBeGreaterThanOrEqual(120 - 2 * G.wave.amp);
    }
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
    expect(lisboaPiece(rec(circle(0, 0, 22, 19), { height: 37.4 }))).toBe('round');
    expect(lisboaPiece(rec(circle(0, 0, 75, 40), { height: 27.8, kind: 'hotel' }))).toBe('podium'); // roundish but 150 m
    expect(lisboaPiece(rec(rect(0, 0, 54, 20), { height: 76.8 }))).toBe('wing');
    expect(lisboaPiece(rec(rect(0, 0, 10, 10), { kind: 'roof' }))).toBe('generic');
  });
});

/** OSM way/192180012 (Anfiteatro Romano), world m: 9 points, ≈ 3 000 m², long axis tilted ~ −22° (an axis-aligned ellipse spilled over the houses). */
const AMPHI: XZ = [1690.3, -3.1, 1660.7, 25.9, 1683.6, 38.1, 1704.5, 40.9, 1719.9, 36.7, 1736.5, 26, 1746.9, 0.7, 1747.4, -10, 1706.6, -9.8];
/** Even-odd point in polygon. */
const inRing = (x: number, z: number, p: XZ) => {
  let inside = false;
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
    if (p[i + 1]! > z !== p[j + 1]! > z && x < ((p[j]! - p[i]!) * (z - p[i + 1]!)) / (p[j + 1]! - p[i + 1]!) + p[i]!) inside = !inside;
  }
  return inside;
};

describe('outlineCurve', () => {
  it('stays inside a convex outline, is closed, evenly spaced, with unit outward normals (either winding)', () => {
    for (const ring of [AMPHI, [...AMPHI.map((_, i) => AMPHI[AMPHI.length - 2 - (i - (i % 2)) + (i % 2)]!)]]) {
      const c = outlineCurve(ring, 3);
      expect(c.length).toBeGreaterThan(190);
      expect(c.length).toBeLessThan(225);
      const [cx, cz] = [1703, 17];
      for (let k = 0; k < 60; k++) {
        const e = c.at(k / 60, -0.01); // on a straight edge the curve IS the edge: a hair inside
        expect(inRing(e.x, e.z, AMPHI)).toBe(true);
        expect(Math.hypot(e.nx, e.nz)).toBeCloseTo(1, 6);
        expect(e.nx * e.tx + e.nz * e.tz).toBeCloseTo(0, 6);
        expect((e.x - cx) * e.nx + (e.z - cz) * e.nz).toBeGreaterThan(0); // the normal points away from the middle
      }
      const a = c.at(0.25), b = c.at(0.25 + 1 / 60), w = c.at(1.25);
      expect(Math.hypot(a.x - w.x, a.z - w.z)).toBeLessThan(1e-9); // u wraps
      expect(Math.hypot(b.x - a.x, b.z - a.z)).toBeCloseTo(c.length / 60, 0); // equal arc steps
    }
  });
  it('an offset moves the point along the normal', () => {
    const c = outlineCurve(AMPHI, 3);
    const [p, q] = [c.at(0.1), c.at(0.1, -2)];
    expect(Math.hypot(q.x - p.x, q.z - p.z)).toBeCloseTo(2, 9);
    expect(inRing(q.x, q.z, AMPHI)).toBe(true);
  });
});

describe('m3 landmarks (stand-in outlines)', () => {
  const cases: [string, Id, BuildingRec, number][] = [
    ['Lisboa round tower', 'hotel-lisboa', rec(circle(100, 100, 22, 19), { height: 37.4 }), 37.4],
    ['Lisboa extension', 'hotel-lisboa', rec(rect(0, 0, 54, 20), { height: 76.8 }), 76.8],
    ['Lisboa podium + casino', 'hotel-lisboa', rec(circle(523, 411, 75, 40), { height: 27.8, kind: 'hotel' }), 27.8],
    ['Wynn', 'wynn-macau', rec(rect(0, 0, 140, 25), { height: 94.5 }), 94.5],
    ['Encore', 'wynn-macau', rec(rect(0, 0, 90, 20), { height: 177.5 }), 177.5],
    ['Wynn podium', 'wynn-macau', rec(rect(600, 500, 900, 760), { height: 23.1 }), 23.1],
    ['MGM tower', 'mgm-macau', rec(rect(0, 0, 117, 20), { height: 120 }), 120],
    ['MGM podium', 'mgm-macau', rec(rect(800, 750, 990, 900), { height: 20.3, points: [{ kind: 'artwork', x: 996, z: 866, r: 5.7 }] }), 20.3],
    ['Sands', 'sands-macau', rec(rect(0, 0, 150, 290), { height: 46.7 }), 46.7],
    ['Sands drum + crown', 'sands-macau', rec(circle(1594, 97, 23, 19), { height: 61.8 }), 61.8], // crown top = OSM height
    ['Sands hotel tower', 'sands-macau', rec(rect(1580, 270, 1630, 300), { height: 116.7 }), 116.7], // 1 500 m²: below drum.maxArea, still not the drum
    ['Wharf convention centre', 'fisherman-wharf', rec(rect(1640, -100, 1770, -10), { height: 20.8, kind: 'commercial' }), 20.8],
    ['Wharf site', 'fisherman-wharf', rec(rect(1640, -300, 1970, 470), { kind: 'artwork' }), 0],
    ['Wharf Roman Amphitheatre', 'fisherman-wharf', rec(AMPHI), 0],
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
    for (const [, id, r] of cases.filter(([n]) => !/site|podium|crown/.test(n))) { // the Sands crown brim overhangs its drum (photos)
      const { box } = stats(build(id, r));
      const xs = r.outer.filter((_, i) => i % 2 === 0);
      const zs = r.outer.filter((_, i) => i % 2 === 1);
      expect(box.x0).toBeGreaterThan(Math.min(...xs) - 2);
      expect(box.x1).toBeLessThan(Math.max(...xs) + 2);
      expect(box.z0).toBeGreaterThan(Math.min(...zs) - 2);
      expect(box.z1).toBeLessThan(Math.max(...zs) + 2);
    }
  });
  it('MGM: three stacked tiers copper / blue / gold, a wavy roofline cresting at the OSM height', () => {
    const o = build('mgm-macau', rec(rect(0, 0, 117, 20), { height: 120 }));
    const metal = o.meshes.find((m) => m.material === 'metal')!;
    const tops: number[] = [];
    let maxY = 0;
    const tiers = new Map<string, { y: number; n: number; r: number; b: number }>(); // per colour: mean y
    for (let i = 0; i < metal.position.length; i += 3) {
      const [y, ny] = [metal.position[i + 1]!, metal.normal[i + 1]!];
      maxY = Math.max(maxY, y);
      if (y > 10 + 102 && ny > 0.9) tops.push(y);
      const [r, b] = [metal.color![i]!, metal.color![i + 2]!];
      const t = tiers.get(`${r},${b}`) ?? { y: 0, n: 0, r, b };
      tiers.set(`${r},${b}`, { ...t, y: t.y + y, n: t.n + 1 });
    }
    expect(maxY).toBeCloseTo(10 + 120, 3);
    expect(Math.max(...tops) - Math.min(...tops)).toBeGreaterThan(2); // the roofline waves
    const [low, mid, high] = [...tiers.values()].sort((p, q) => p.y / p.n - q.y / q.n);
    expect(tiers.size).toBe(3);
    expect(low!.r).toBeGreaterThan(low!.b); // copper
    expect(mid!.b).toBeGreaterThan(mid!.r); // blue glass
    expect(high!.r).toBeGreaterThan(high!.b); // gold
  });
  it('the Sands hotel tower is a gold slab to its OSM height, not a second drum + crown; its low outline draws nothing (audit a4)', () => {
    const o = build('sands-macau', rec(rect(1580, 270, 1630, 300), { height: 116.7 }));
    const { maxY, box } = stats(o);
    expect(maxY).toBeCloseTo(10 + 116.7 + 0.2, 3); // + the LED rim
    expect(box.x0).toBeGreaterThan(1580 - 1);
    expect(box.x1).toBeLessThan(1630 + 1);
    const metal = o.meshes.find((m) => m.material === 'metal')!;
    const gold = parseColour(L.m3.sands.gold)!;
    for (let k = 0; k < 3; k++) expect(metal.color![k]).toBeCloseTo(gold[k]!, 5);
    expect(build('sands-macau', rec(rect(1620, 280, 1680, 340))).meshes).toEqual([]); // the hotel's low outline under the wings
  });
  it('Casino Lisboa: a drum on its configured circle, crown above the podium cut', () => {
    const K = L.m3.lisboa.casino;
    const o = build('hotel-lisboa', rec(circle(523, 411, 75, 40), { height: 27.8, kind: 'hotel' }));
    const neon = o.meshes.find((m) => m.material === 'neon')!;
    let near = 0;
    for (let i = 0; i < neon.position.length; i += 3) {
      const [x, y, z] = [neon.position[i]!, neon.position[i + 1]!, neon.position[i + 2]!];
      if (y > 10 + K.base - 0.01 && y < 10 + K.grid + 0.01 && Math.abs(Math.hypot(x - K.x, z - K.z) - K.r) < 0.5) near++;
    }
    expect(near).toBeGreaterThan(K.segs); // the window grid wraps the drum
    expect(stats(o).maxY).toBeGreaterThan(10 + K.grid + K.cornice + K.inner.h + K.dome.h);
  });
  it('the Colosseum arcade follows the amphitheatre outline: nothing of it leaves the polygon (no spill over the houses)', () => {
    const C = L.m3.wharf.colosseum;
    const o = build('fisherman-wharf', rec(AMPHI));
    let n = 0;
    for (const m of o.meshes) {
      for (let i = 0; i < m.position.length; i += 3) {
        n++;
        expect(inRing(m.position[i]!, m.position[i + 2]!, AMPHI), `${m.material} vertex ${i / 3}`).toBe(true);
      }
    }
    expect(n).toBeGreaterThan(2000);
    const { maxY } = stats(o);
    expect(maxY).toBeGreaterThanOrEqual(10 + C.tiers.reduce((t, h) => t + h, 0)); // the full 22 m of the three tiers
    expect(stats(build('fisherman-wharf', rec(rect(1640, -300, 1970, 470), { kind: 'artwork' }))).box.x1).toBeLessThan(1970); // the site: only the lighthouse, set back from the tip
  });
  it('on a slope the casino drum and the Colosseum arcade reach the lowest ground: no gap under their walls (audit a4)', () => {
    // ground falling 6 cm per m to the east (the DEM under both: 2–2.5 m across); per 20° sector around the centre, the
    // lowest vertex of the wall must not be above the ground under it
    const slope = (x: number) => 10 - 0.06 * (x - 500);
    const gap = (o: BuildOut, cx: number, cz: number, keep: (m: string, x: number, z: number) => boolean) => {
      const low = new Map<number, number>();
      for (const m of o.meshes) {
        for (let i = 0; i < m.position.length; i += 3) {
          const [x, y, z] = [m.position[i]!, m.position[i + 1]!, m.position[i + 2]!];
          if (!keep(m.material, x, z)) continue;
          const k = Math.floor((Math.atan2(z - cz, x - cx) / Math.PI + 1) * 9) % 18;
          low.set(k, Math.min(low.get(k) ?? Infinity, y - slope(x)));
        }
      }
      expect(low.size).toBe(18);
      return Math.max(...low.values());
    };
    const on = (id: Id, outer: XZ): LandmarkCtx => ({ ...ctx(id), height: slope, ...recordGround(outer, slope) });
    const K = L.m3.lisboa.casino;
    const pod = rec(circle(523, 411, 75, 40), { height: 27.8, kind: 'hotel' });
    const casino = details['hotel-lisboa']!(pod, [], on('hotel-lisboa', pod.outer), helpers);
    expect(gap(casino, K.x, K.z, (_, x, z) => Math.abs(Math.hypot(x - K.x, z - K.z) - K.r) < 0.01)).toBeLessThanOrEqual(0);
    const amphi = AMPHI.map((v, i) => (i % 2 ? v : v - 1200)); // moved next to x = 500 (the slope's origin)
    const wall = details['fisherman-wharf']!(rec(amphi), [], on('fisherman-wharf', amphi), helpers);
    expect(gap(wall, 1708 - 1200, 15, (m) => m === 'masonry')).toBeLessThanOrEqual(0);
  });
  it('the Wharf lighthouse on a quay corner stands on the quay top, not in the carved bank in front of it (audit a4)', () => {
    const site = rec(rect(1640, -300, 1970, 470), { kind: 'artwork' }); // lighthouse ≈ (1963.6, 465.2), x + z ≈ 2429
    const bank = (x: number, z: number) => (x + z > 2425 ? 2 : 10); // the bank falls 8 m right at the tip
    const o = details['fisherman-wharf']!(site, [], { ...ctx('fisherman-wharf'), height: bank }, helpers);
    expect(stats(o).box.x1).toBeGreaterThan(1960); // still on the tip
    let minY = Infinity;
    for (const m of o.meshes) for (let i = 1; i < m.position.length; i += 3) minY = Math.min(minY, m.position[i]!);
    expect(minY).toBeCloseTo(10 - L.sink, 6);
  });
  it('unknown small Wynn records fall back to the generic renderer (the pavilion kept low)', () => {
    const st = stats(build('wynn-macau', rec(rect(0, 0, 10, 15))));
    expect(st.maxY).toBeCloseTo(10 + L.m3.wynn.kiosk, 3);
  });
});
